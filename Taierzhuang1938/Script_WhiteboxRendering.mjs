import * as THREE from "three";
import { ApplyPatches, MakePatch, PatchesOf } from "./Script_MaterialPatches.mjs";
import { MakeFullscreenMaterial } from "./Script_PostCommon.mjs";
import { WHITEBOX_LIGHTING, WHITEBOX_WATER, WhiteboxPassPlan } from "./Data_Tuning_Whitebox.mjs";

// Physical ground and replacement crater tiles, never a material-name whitelist.
export function IsWhiteboxTerrain(object) {
  if (typeof object.userData?.whiteboxTerrain === "boolean") return object.userData.whiteboxTerrain;
  return object.userData?.deformableTerrain === true || object.userData?.terrainTile != null
    || object.userData?.whiteboxTerrain === true;
}

// Semantic roots cover current and future attachments, including bone children.
// Batches carry the same marker because their meshes live outside actor roots.
export function IsWhiteboxCharacter(object) {
  for (let node = object; node; node = node.parent) {
    if (typeof node.userData?.whiteboxCharacter === "boolean") return node.userData.whiteboxCharacter;
  }
  return false;
}

// Procedural metre grid: no bitmap/UV requirement, including scaled instances.
// Derivative filtering fades sub-pixel cells to avoid distant grid shimmer.
function MakeWhiteboxGridPatch(config) {
  return MakePatch({
    key: "whiteboxGrid1",
    uniforms: (uniforms) => Object.assign(uniforms, {
      uWhiteboxGridSize: { value: config.gridSize },
      uWhiteboxGridWidth: { value: config.gridLineWidth },
      uWhiteboxGridColor: { value: new THREE.Color(config.gridColor) },
    }),
    vertex: [
      ["#include <common>", "varying vec3 vWhiteboxPosition;"],
      ["#include <project_vertex>", `
        vec4 whiteboxPosition = vec4(transformed, 1.0);
        #ifdef USE_BATCHING
          whiteboxPosition = batchingMatrix * whiteboxPosition;
        #endif
        #ifdef USE_INSTANCING
          whiteboxPosition = instanceMatrix * whiteboxPosition;
        #endif
        vWhiteboxPosition = (modelMatrix * whiteboxPosition).xyz;
      `],
    ],
    fragment: [
      ["#include <common>", `
        varying vec3 vWhiteboxPosition;
        uniform float uWhiteboxGridSize;
        uniform float uWhiteboxGridWidth;
        uniform vec3 uWhiteboxGridColor;
        float WhiteboxGrid(vec2 position) {
          vec2 cell = position / uWhiteboxGridSize;
          vec2 footprint = max(fwidth(cell), vec2(0.00001));
          vec2 distanceToLine = abs(fract(cell + 0.5) - 0.5);
          float halfWidth = min(uWhiteboxGridWidth / uWhiteboxGridSize * 0.5, 0.1);
          vec2 line = 1.0 - smoothstep(vec2(halfWidth), vec2(halfWidth) + footprint, distanceToLine);
          line *= 1.0 - smoothstep(vec2(0.25), vec2(0.5), footprint);
          return max(line.x, line.y);
        }
      `],
      ["#include <color_fragment>", `
        vec3 gridNormal = abs(cross(dFdx(vWhiteboxPosition), dFdy(vWhiteboxPosition)));
        gridNormal /= max(max(gridNormal.x, gridNormal.y), max(gridNormal.z, 0.000001));
        vec3 gridWeight = pow(gridNormal, vec3(8.0));
        gridWeight /= max(dot(gridWeight, vec3(1.0)), 0.000001);
        float gridLine = dot(gridWeight, vec3(WhiteboxGrid(vWhiteboxPosition.yz),
          WhiteboxGrid(vWhiteboxPosition.xz), WhiteboxGrid(vWhiteboxPosition.xy)));
        diffuseColor.rgb = mix(diffuseColor.rgb, uWhiteboxGridColor, gridLine);
      `],
    ],
  });
}

// 镂空卡片（植被十字面片、壕沟草、桁架镂空节）：alphaTest + 贴图 alpha。白盒替换材质不能丢掉裁切，
// 否则卡片变成整块不透明竖片。保留 map / alphaMap 与 alphaTest，只把 rgb 换成表面色（再画网格）。
export function IsWhiteboxCutout(source) {
  return !!(source.alphaTest > 0 && (source.map || source.alphaMap));
}
export function IsWhiteboxWater(object) {
  return object.userData?.whiteboxWater === true || /water/i.test(object.name || "");
}
function MakeWhiteboxCardPatch(config) {
  return MakePatch({
    key: "whiteboxCard1",
    uniforms: (uniforms) => Object.assign(uniforms, { uWhiteboxCardColor: { value: new THREE.Color(config.surfaceColor) } }),
    fragment: [
      ["#include <common>", "uniform vec3 uWhiteboxCardColor;"],
      ["#include <color_fragment>", "diffuseColor.rgb = uWhiteboxCardColor;"],
    ],
  });
}
// 白盒水面：蓝灰水色 + 掠射角天空色反光。没有环境贴图也成立（反光色是常量，靠菲涅耳权重）。
function MakeWhiteboxWaterPatch() {
  return MakePatch({
    key: "whiteboxWater1",
    uniforms: (uniforms) => Object.assign(uniforms, { uWhiteboxWaterSheen: { value: new THREE.Color(WHITEBOX_WATER.sheen) } }),
    fragment: [
      ["#include <common>", "uniform vec3 uWhiteboxWaterSheen;"],
      ["#include <dithering_fragment>", `
        {
          float waterFresnel = pow(1.0 - clamp(dot(normalize(normal), normalize(vViewPosition)), 0.0, 1.0), ${WHITEBOX_WATER.sheenPower.toFixed(1)});
          gl_FragColor.rgb = mix(gl_FragColor.rgb, uWhiteboxWaterSheen,
            clamp(waterFresnel * ${WHITEBOX_WATER.sheenStrength.toFixed(2)}, 0.0, ${WHITEBOX_WATER.sheenMax.toFixed(2)}));
        }
      `],
    ],
  });
}

export class WhiteboxSceneRenderer {
  constructor(scene, config, { sky = null, prepareMaterial = null } = {}) {
    this.config = config;
    this.sky = sky;
    this.prepareMaterial = prepareMaterial;
    this.materials = new WeakMap();
    this.waterMaterials = new WeakMap();
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

  Material(source, { water = false } = {}) {
    // 水面与普通材质共用一张 WeakMap 的话，同一个源材质既被当水又被当地面时会串；水面单独缓存。
    const cache = water ? this.waterMaterials : this.materials;
    let material = cache.get(source);
    if (!material) {
      const cutout = !water && IsWhiteboxCutout(source);
      material = new THREE.MeshStandardMaterial({
        name: `Whitebox_${water ? "Water_" : cutout ? "Cutout_" : ""}${source.name || source.type}`,
        color: water ? WHITEBOX_WATER.color : this.config.surfaceColor,
        roughness: water ? WHITEBOX_WATER.roughness : 1, metalness: 0, side: water ? THREE.DoubleSide : source.side,
        wireframe: source.wireframe || false,
        depthTest: source.depthTest, depthWrite: source.depthWrite,
        polygonOffset: source.polygonOffset, polygonOffsetFactor: source.polygonOffsetFactor,
        polygonOffsetUnits: source.polygonOffsetUnits, clippingPlanes: source.clippingPlanes,
        ...(cutout ? { map: source.map, alphaMap: source.alphaMap, alphaTest: source.alphaTest,
          alphaToCoverage: !!source.alphaToCoverage } : {}),
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
      ApplyPatches(material, water ? [MakeWhiteboxWaterPatch()]
        : [cutout ? MakeWhiteboxCardPatch(c) : null, c.grid ? MakeWhiteboxGridPatch(c) : null, ...retained]);
      this.prepareMaterial?.(material, source);
      cache.set(source, material);
      this.ownedMaterials.add(material);
      source.addEventListener("dispose", () => {
        material.dispose(); cache.delete(source); this.ownedMaterials.delete(material);
      });
    }
    // Source visibility can change during damage/death without replacing materials.
    material.visible = source.visible;
    material.opacity = source.opacity;
    material.transparent = source.transparent && source.opacity < 1;
    material.allowOverride = source.allowOverride;
    return material;
  }

  Begin(scene, camera) {
    const c = this.config, restore = [], stats = { meshes: 0, whiteMeshes: 0, terrainMeshes: 0, characterMeshes: 0, hiddenEffects: 0, cutoutMeshes: 0, waterMeshes: 0 };
    const Set = (object, key, value) => { restore.push([object, key, object[key]]); object[key] = value; };
    const sceneLighting = c.sceneLighting || c.shadows || c.firstPersonShadow || c.contactShadows || c.gi || c.clusteredLights;
    Set(scene, "background", c.sky ? scene.background : this.background);
    if (!c.environment) Set(scene, "environment", null);
    if (!c.fog) Set(scene, "fog", null);
    Set(scene.userData, "whiteboxEffects", c.effects);
    if (this.sky && !c.sky) Set(this.sky, "visible", false);
    scene.traverseVisible((object) => {
      // Three selects LOD children during render. Select them before material
      // substitution too, so a newly visible distance bucket cannot escape it.
      if (object.isLOD && object.autoUpdate && camera) object.update(camera);
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
      const character = IsWhiteboxCharacter(object);
      stats.meshes++; if (terrain) stats.terrainMeshes++;
      if (character) stats.characterMeshes++;
      if (terrain ? c.terrainTextures : character ? c.characterTextures : c.assetTextures) return;
      // 水面：蓝灰水色 + 天空反光（WHITEBOX_WATER），不画网格。人物与地形不可能是水，先判它们。
      const water = !terrain && !character && IsWhiteboxWater(object);
      if (water) stats.waterMeshes++;
      else if (sources.some(IsWhiteboxCutout)) stats.cutoutMeshes++;
      Set(object, "material", Array.isArray(object.material) ? sources.map((m) => this.Material(m, { water })) : this.Material(object.material, { water }));
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
