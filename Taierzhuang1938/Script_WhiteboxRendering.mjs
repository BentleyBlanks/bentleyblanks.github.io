import * as THREE from "three";
import { ApplyPatches, PatchesOf } from "./Script_MaterialPatches.mjs";
import { MakeFullscreenMaterial } from "./Script_PostCommon.mjs";
import { WHITEBOX_LIGHTING, WhiteboxPassPlan } from "./Data_Tuning_Whitebox.mjs";

// Physical ground and replacement crater tiles, never a material-name whitelist.
export function IsWhiteboxTerrain(object) {
  if (typeof object.userData?.whiteboxTerrain === "boolean") return object.userData.whiteboxTerrain;
  return object.userData?.deformableTerrain === true || object.userData?.terrainTile != null
    || object.userData?.whiteboxTerrain === true;
}

export class WhiteboxSceneRenderer {
  constructor(scene, config, { sky = null, prepareMaterial = null } = {}) {
    this.config = config;
    this.sky = sky;
    this.prepareMaterial = prepareMaterial;
    this.materials = new WeakMap();
    this.ownedMaterials = new Set();
    this.stats = {};
    this.background = new THREE.Color(config.backgroundColor);
    this.ambient = new THREE.AmbientLight(0xffffff, WHITEBOX_LIGHTING.ambient);
    this.sun = new THREE.DirectionalLight(0xffffff, WHITEBOX_LIGHTING.sun);
    this.sun.position.fromArray(WHITEBOX_LIGHTING.direction);
    this.ambient.name = "WhiteboxAmbient"; this.sun.name = "WhiteboxSun";
    this.ambient.visible = this.sun.visible = false;
    scene.add(this.ambient, this.sun);
    this.sun.updateMatrixWorld(true);
  }

  Material(source) {
    let material = this.materials.get(source);
    if (!material) {
      material = new THREE.MeshStandardMaterial({
        name: `Whitebox_${source.name || source.type}`, color: this.config.surfaceColor,
        roughness: 1, metalness: 0, side: source.side, wireframe: source.wireframe || false,
        depthTest: source.depthTest, depthWrite: source.depthWrite,
        polygonOffset: source.polygonOffset, polygonOffsetFactor: source.polygonOffsetFactor,
        polygonOffsetUnits: source.polygonOffsetUnits, clippingPlanes: source.clippingPlanes,
      });
      // White material still receives explicitly enabled lighting; surface texture,
      // blood/weather/POM patches are excluded. Destruction holes remain functional.
      const c = this.config;
      const lighting = c.ssao || c.ssil || c.ssr || c.gi || c.clusteredLights
        || c.shadows || c.contactShadows || c.interiorSky;
      const retained = (PatchesOf(source) || []).filter((patch) => {
        const key = typeof patch.key === "function" ? patch.key() : patch.key;
        return /^destruction/.test(key) || (lighting && /^(gtao|gi\d|csm|ssr|clust)/.test(key));
      });
      ApplyPatches(material, retained);
      this.prepareMaterial?.(material, source);
      this.materials.set(source, material);
      this.ownedMaterials.add(material);
      source.addEventListener("dispose", () => {
        material.dispose(); this.materials.delete(source); this.ownedMaterials.delete(material);
      });
    }
    // Source visibility can change during damage/death without replacing materials.
    material.visible = source.visible;
    material.opacity = source.opacity;
    material.transparent = source.transparent && source.opacity < 1;
    material.allowOverride = source.allowOverride;
    return material;
  }

  Begin(scene) {
    const c = this.config, restore = [], stats = { meshes: 0, whiteMeshes: 0, terrainMeshes: 0, hiddenEffects: 0 };
    const Set = (object, key, value) => { restore.push([object, key, object[key]]); object[key] = value; };
    const sceneLighting = c.sceneLighting || c.shadows || c.firstPersonShadow || c.contactShadows || c.gi || c.clusteredLights;
    Set(scene, "background", c.sky ? scene.background : this.background);
    if (!c.environment) Set(scene, "environment", null);
    if (!c.fog) Set(scene, "fog", null);
    Set(scene.userData, "whiteboxEffects", c.effects);
    if (this.sky && !c.sky) Set(this.sky, "visible", false);
    scene.traverseVisible((object) => {
      if (object.isLight && object !== this.ambient && object !== this.sun && !sceneLighting) Set(object, "visible", false);
      if (!c.effects && (object.isPoints || object.isSprite || object.userData?.whiteboxEffect)) {
        Set(object, "visible", false); stats.hiddenEffects++; return;
      }
      if (!object.isMesh || object === this.sky || !object.material) return;
      const sources = Array.isArray(object.material) ? object.material : [object.material];
      // Soft particles/decals are meshes too. Keep solid glass/water geometry as
      // whitebox surfaces; only depthless blended effect cards are omitted.
      if (!c.effects && sources.every((m) => m.transparent && !m.depthWrite
        && (m.isShaderMaterial || !m.depthTest || m.blending === THREE.AdditiveBlending))
        && !/water/i.test(object.name)) {
        Set(object, "visible", false); stats.hiddenEffects++; return;
      }
      const terrain = IsWhiteboxTerrain(object);
      stats.meshes++; if (terrain) stats.terrainMeshes++;
      if (terrain ? c.terrainTextures : c.assetTextures) return;
      Set(object, "material", Array.isArray(object.material) ? sources.map((m) => this.Material(m)) : this.Material(object.material));
      if (object.instanceColor) Set(object, "instanceColor", null);
      stats.whiteMeshes++;
    });
    Set(this.ambient, "visible", !sceneLighting);
    Set(this.sun, "visible", !sceneLighting);
    this.stats = stats;
    return () => { for (let i = restore.length - 1; i >= 0; i--) { const [object, key, value] = restore[i]; object[key] = value; } };
  }

  Dispose() {
    for (const material of this.ownedMaterials) material.dispose();
    this.ownedMaterials.clear(); this.ambient.removeFromParent(); this.sun.removeFromParent();
  }
}

// Minimum output conversion only. Story blackouts/eyelids are retained because
// they hide scene transitions; cosmetic camera effects are intentionally absent.
export class WhiteboxOutputPass {
  constructor(pipeline) {
    this.name = "whiteboxOutput";
    this.pipeline = pipeline;
    this.uniforms = { uSource: { value: null }, uFade: { value: 0 }, uEyeClosure: { value: 0 } };
    this.material = MakeFullscreenMaterial(`
      uniform sampler2D uSource;
      uniform float uFade;
      uniform float uEyeClosure;
      varying vec2 vUv;
      void main() {
        vec3 c = max(texture2D(uSource, vUv).rgb, vec3(0.0));
        c = mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), c));
        float aperture = 1.0;
        if (uEyeClosure > 0.0) {
          float gap = (1.0 - clamp(uEyeClosure, 0.0, 1.0)) * 0.55;
          aperture = 1.0 - smoothstep(max(0.0, gap - 0.025), gap + 0.001, abs(vUv.y - 0.5));
        }
        gl_FragColor = vec4(c * (1.0 - clamp(uFade, 0.0, 1.0)) * aperture, 1.0);
      }`, this.uniforms);
  }
  Enabled() { return !!this.pipeline.whiteboxConfig && this.pipeline.whiteboxPasses.has(this.name); }
  Resize() {}
  Render(ctx) {
    const debug = this.pipeline.debugPass.GetSource();
    if (debug) { this.pipeline.debugPass.RenderView(ctx, debug); return; }
    this.uniforms.uSource.value = ctx.sceneColor.texture;
    this.uniforms.uFade.value = ctx.options.fade || 0;
    this.uniforms.uEyeClosure.value = ctx.options.eyeClosure || 0;
    ctx.blitter.Blit(this.material, this.pipeline.whiteboxConfig.fxaa ? this.pipeline.targets.ldr : null);
  }
  Dispose() { this.material.dispose(); }
}

// Install on the existing pass registry, rather than a second Render() loop.
// Prepare is gated too: some passes do GPU work before Enabled is evaluated.
export function InstallWhiteboxPassPolicy(pipeline, config) {
  pipeline.whiteboxConfig = config;
  if (!config) return;
  pipeline.whiteboxPasses = new Set(WhiteboxPassPlan(config));
  for (const pass of pipeline.passes) {
    const enabled = pass.Enabled?.bind(pass), prepare = pass.Prepare?.bind(pass);
    pass.Enabled = (ctx) => pipeline.whiteboxPasses.has(pass.name) && (enabled ? enabled(ctx) : true);
    if (prepare) pass.Prepare = (ctx) => { if (pipeline.whiteboxPasses.has(pass.name)) prepare(ctx); };
  }
}
