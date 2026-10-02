import * as THREE from "three";
import { ApplyPatches, MakePatch, PatchesOf } from "./Script_MaterialPatches.mjs";
import { MakeFullscreenMaterial } from "./Script_PostCommon.mjs";
import { WHITEBOX_CARDS, WHITEBOX_LIGHTING, WHITEBOX_WATER, WhiteboxPassPlan } from "./Data_Tuning_Whitebox.mjs";

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
// 镂空卡片（cardTextures 开）：保留原贴图色，略去饱和再按中性光折算提亮（WHITEBOX_CARDS）。只给有颜色贴图的卡片打这个补丁。
function MakeWhiteboxCardTexturePatch() {
  return MakePatch({
    key: "whiteboxCard2",
    uniforms: (uniforms) => Object.assign(uniforms, {
      uWhiteboxCardDesat: { value: WHITEBOX_CARDS.desaturate }, uWhiteboxCardBright: { value: WHITEBOX_CARDS.brightness },
    }),
    fragment: [
      ["#include <common>", "uniform float uWhiteboxCardDesat; uniform float uWhiteboxCardBright;"],
      ["#include <color_fragment>", `
        float whiteboxCardLuma = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(whiteboxCardLuma), uWhiteboxCardDesat) * uWhiteboxCardBright;
      `],
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

// Source visibility can change during damage/death without replacing materials.
function SyncWhiteboxMaterial(material, source) {
  material.visible = source.visible;
  material.opacity = source.opacity;
  material.transparent = source.transparent && source.opacity < 1;
  material.allowOverride = source.allowOverride;
}

function IsWhiteboxDepthOnly(sources) {
  return sources.every((m) => m.colorWrite === false && m.depthWrite);
}
// Soft particles/decals are meshes too. Keep solid glass/water geometry as
// whitebox surfaces; only depthless blended effect cards are omitted.
function IsWhiteboxEffectMesh(object, sources) {
  return sources.every((m) => m.transparent && !m.depthWrite
    && (m.isShaderMaterial || !m.depthTest || m.blending === THREE.AdditiveBlending))
    && !/water/i.test(object.name);
}

// 多材质网格的数组被原地改了某一格（引用没换）也算换了源材质。
function SameSources(entry) {
  const sources = entry.sources;
  if (!sources) return true;
  const current = entry.object.material;
  if (current.length !== sources.length) return false;
  for (let i = 0; i < sources.length; i += 1) if (current[i] !== sources[i]) return false;
  return true;
}

// traverseVisible 的口径：父链上（到顶层子树为止）有一层藏着，这只网格这一帧不出画，也就不换不计。
// 不查的话 12 阶段每帧多换 140 来只藏着的网格（收起的人物、LOD 没选中的那一级），统计也对不上旧路径。
function ChainVisible(object, top) {
  for (let node = object.parent; node && node !== top; node = node.parent) if (node.visible === false) return false;
  return true;
}

// 缓存清单要重建的配置位：分类（保留贴图 / 特效）与灯光规则都只看这几位。
const PLAN_CONFIG_KEYS = ["terrainTextures", "characterTextures", "assetTextures", "effects",
  "sceneLighting", "shadows", "firstPersonShadow", "contactShadows", "gi", "clusteredLights"];
const MESH_KEEP = 0, MESH_HIDE = 1, MESH_WHITE = 2;

export class WhiteboxSceneRenderer {
  /**
   * @param {THREE.Object3D[]} [options.sunCascades] 关卡太阳的级联灯（Script_Csm，第 0 盏带强度）。
   *   给了才能在白盒中性光下投太阳影子；没给时开阴影仍连带切成整套关卡灯光（旧口径）。
   */
  constructor(scene, config, { sky = null, prepareMaterial = null, sunCascades = [] } = {}) {
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
    this.sunCascades = sunCascades.filter(Boolean);
    this.sunCascadeSet = new Set(this.sunCascades);
    this.shadowSunColor = new THREE.Color(0xffffff);
    // 每帧替换的缓存清单（_BeginCached）：scene 顶层子树 → { lights, effects, lods, meshes }。
    this._planScene = null;
    this._planConfig = "";
    this._tops = new Map();
    this._dirtyTops = new Set();
    this._watched = new WeakSet();
    this._epoch = 0;
    this._OnStructure = (event) => this._StructureChanged(event);
    // 还原日志：三列平铺、逐帧复用，不在每帧给每次替换分配一个小数组。
    this._logObjects = []; this._logKeys = []; this._logValues = []; this._logCount = 0;
    this._active = false;
    this._Restore = () => this._RestoreLog();
  }

  /**
   * 两条灯光规则（预热提交与逐帧出画共用）：
   *   · sceneLighting —— 关卡灯全留、白盒中性光不放（GI / 簇光要关卡灯）。
   *   · sunShadow —— 白盒中性光照旧，只留关卡太阳的级联灯来投影；第 0 盏换成白色、白盒环境光与它按
   *     WHITEBOX_LIGHTING.shadowAmbient / shadowSun 配比，白盒自己那盏不投影的太阳收起
   *     （方向跟关卡太阳走，影子才对得上）。
   */
  _LightingMode() {
    const c = this.config;
    const wantsSun = !!(c.shadows || c.firstPersonShadow || c.contactShadows);
    const sunShadow = wantsSun && this.sunCascades.length > 0;
    const sceneLighting = !!(c.sceneLighting || c.gi || c.clusteredLights || (wantsSun && !sunShadow));
    return { sceneLighting, sunShadow };
  }

  _KeepLight(light, mode) {
    return light === this.ambient || light === this.sun || mode.sceneLighting
      || (mode.sunShadow && this.sunCascadeSet.has(light));
  }

  _ApplyLights(Set, mode) {
    Set(this.ambient, "visible", !mode.sceneLighting);
    Set(this.sun, "visible", !mode.sceneLighting && !mode.sunShadow);
    if (mode.sunShadow && !mode.sceneLighting) {
      const key = this.sunCascades[0];
      Set(key, "color", this.shadowSunColor);
      Set(key, "intensity", WHITEBOX_LIGHTING.shadowSun);
      Set(this.ambient, "intensity", WHITEBOX_LIGHTING.shadowAmbient);
    }
  }

  /** 挂进场景之后才改白盒分类标记（whiteboxCharacter / whiteboxTerrain …）时调一次：下一帧整场重判。 */
  Invalidate() { this._planScene = null; }

  Material(source, { water = false } = {}) {
    // 水面与普通材质共用一张 WeakMap 的话，同一个源材质既被当水又被当地面时会串；水面单独缓存。
    const cache = water ? this.waterMaterials : this.materials;
    let material = cache.get(source);
    if (!material) {
      const cutout = !water && IsWhiteboxCutout(source);
      // 卡片保留原贴图色：有颜色贴图 → 白底乘贴图（补丁再略去饱和 / 折算提亮）；只有 alphaMap → 统一暗橄榄枯黄。
      const cardTexture = cutout && this.config.cardTextures !== false;
      material = new THREE.MeshStandardMaterial({
        name: `Whitebox_${water ? "Water_" : cutout ? "Cutout_" : ""}${source.name || source.type}`,
        color: water ? WHITEBOX_WATER.color : cardTexture ? (source.map ? 0xffffff : WHITEBOX_CARDS.fallbackColor) : this.config.surfaceColor,
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
        : [cutout ? (cardTexture ? (source.map ? MakeWhiteboxCardTexturePatch() : null) : MakeWhiteboxCardPatch(c)) : null,
          c.grid && !cardTexture ? MakeWhiteboxGridPatch(c) : null, ...retained]);
      this.prepareMaterial?.(material, source);
      cache.set(source, material);
      this.ownedMaterials.add(material);
      source.addEventListener("dispose", () => {
        material.dispose(); cache.delete(source); this.ownedMaterials.delete(material);
        this._epoch += 1;
      });
    }
    SyncWhiteboxMaterial(material, source);
    return material;
  }

  /**
   * 出画前把场景换成白盒的样子，返回还原函数。
   *
   * `compileRoots`：给 `renderer.compile` 用。compile 编的是 `object.material`、灯按可见收集，
   * 不在这一层里提交的话，编出来的是「关卡灯光 + 原材质」那一份，白盒出画根本用不上
   * （2026-10-01 第一关白盒档实测：提交的 135 个 program 一个都没用上，真用的 64 个全在出画时
   * 同步链接，关掉 program 缓存时主线程卡 22.5 s）。compile 不看可见性，所以这几棵子树里
   * 当前藏着的网格也按同一套规则换掉；统计不记这一趟。
   *
   * 逐帧出画（不带 compileRoots）走 `_BeginCached`：替换清单按 scene 顶层子树缓存，结构变化与
   * 源材质换引用时才重判（2026-10-02，09 阶段整场 traverseVisible 每帧 0.8 ms）。
   */
  Begin(scene, camera, { compileRoots = null } = {}) {
    if (!compileRoots && !this._active) return this._BeginCached(scene, camera);
    return this._BeginTraverse(scene, camera, compileRoots);
  }

  _BeginScene(Set, scene) {
    const c = this.config;
    Set(scene, "background", c.sky ? scene.background : this.background);
    if (!c.environment) Set(scene, "environment", null);
    if (!c.fog) Set(scene, "fog", null);
    Set(scene.userData, "whiteboxEffects", c.effects);
    if (this.sky && !c.sky) Set(this.sky, "visible", false);
  }

  _BeginTraverse(scene, camera, compileRoots) {
    const c = this.config, restore = [], stats = { meshes: 0, whiteMeshes: 0, terrainMeshes: 0, characterMeshes: 0, hiddenEffects: 0, cutoutMeshes: 0, waterMeshes: 0 };
    const Set = (object, key, value) => { restore.push([object, key, object[key]]); object[key] = value; };
    const mode = this._LightingMode();
    this._BeginScene(Set, scene);
    const visited = compileRoots ? new WeakSet() : null;
    // 白盒出画时藏掉的特效。compile 不看 visible，只能把材质摘掉它才跳过（粒子那一族
    // 二十来个 program，白盒档一个都画不到）。
    const HideEffect = (object) => {
      Set(object, "visible", false); stats.hiddenEffects++;
      if (compileRoots) Set(object, "material", null);
    };
    const Visit = (object) => {
      visited?.add(object);
      // Three selects LOD children during render. Select them before material
      // substitution too, so a newly visible distance bucket cannot escape it.
      if (object.isLOD && object.autoUpdate && camera) object.update(camera);
      if (object.isLight && !this._KeepLight(object, mode)) Set(object, "visible", false);
      if (!c.effects && (object.isPoints || object.isSprite || object.userData?.whiteboxEffect)) {
        HideEffect(object); return;
      }
      if (!object.isMesh || object === this.sky || !object.material) return;
      const sources = Array.isArray(object.material) ? object.material : [object.material];
      // 只写深度的遮挡片（浮桥船舱里挡水面的那片）原样留着：换成白盒材质就成了一块看得见的灰板。
      if (IsWhiteboxDepthOnly(sources)) return;
      if (!c.effects && IsWhiteboxEffectMesh(object, sources)) {
        HideEffect(object); return;
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
    };
    scene.traverseVisible(Visit);
    if (compileRoots) {
      for (const root of compileRoots) root?.traverse((object) => { if (!visited.has(object)) Visit(object); });
    }
    this._ApplyLights(Set, mode);
    if (!compileRoots) this.stats = stats;
    return () => { for (let i = restore.length - 1; i >= 0; i--) { const [object, key, value] = restore[i]; object[key] = value; } };
  }

  _BeginCached(scene, camera) {
    const c = this.config;
    const configKey = PLAN_CONFIG_KEYS.map((key) => (c[key] ? 1 : 0)).join("");
    if (this._planScene !== scene || this._planConfig !== configKey) {
      this._tops.clear(); this._dirtyTops.clear();
      this._planScene = scene; this._planConfig = configKey;
      this._Watch(scene);
    }
    for (const top of this._dirtyTops) {
      if (top.parent === scene) this._tops.set(top, this._BuildTop(top));
      else this._tops.delete(top);
    }
    this._dirtyTops.clear();
    this._active = true;
    this._logCount = 0;
    const Set = (object, key, value) => {
      const i = this._logCount++;
      this._logObjects[i] = object; this._logKeys[i] = key; this._logValues[i] = object[key];
      object[key] = value;
    };
    const mode = this._LightingMode();
    const stats = { meshes: 0, whiteMeshes: 0, terrainMeshes: 0, characterMeshes: 0, hiddenEffects: 0, cutoutMeshes: 0, waterMeshes: 0 };
    this._BeginScene(Set, scene);
    const children = scene.children;
    for (let t = 0; t < children.length; t += 1) {
      const top = children[t];
      // traverseVisible 的口径：藏着的顶层子树整棵不碰。
      if (top.visible === false) continue;
      let bucket = this._tops.get(top);
      if (!bucket) { bucket = this._BuildTop(top); this._tops.set(top, bucket); }
      for (const light of bucket.lights) if (!this._KeepLight(light, mode)) Set(light, "visible", false);
      if (!c.effects) for (const effect of bucket.effects) {
        if (effect.visible === false) continue;
        Set(effect, "visible", false); stats.hiddenEffects++;
      }
      // Three selects LOD children during render. Select them before material
      // substitution too, so a newly visible distance bucket cannot escape it.
      if (camera) for (const lod of bucket.lods) if (lod.autoUpdate) lod.update(camera);
      for (const entry of bucket.meshes) {
        const object = entry.object;
        if (object.visible === false || !ChainVisible(object, top)) continue;
        if (entry.epoch !== this._epoch || object.material !== entry.source || !SameSources(entry)) this._ClassifyMesh(entry);
        if (entry.mode === MESH_KEEP) continue;
        if (entry.mode === MESH_HIDE) { Set(object, "visible", false); stats.hiddenEffects++; continue; }
        stats.meshes++;
        if (entry.terrain) stats.terrainMeshes++;
        if (entry.character) stats.characterMeshes++;
        if (!entry.white) continue;
        if (entry.water) stats.waterMeshes++;
        else if (entry.cutout) stats.cutoutMeshes++;
        if (entry.sources) for (let i = 0; i < entry.sources.length; i += 1) SyncWhiteboxMaterial(entry.white[i], entry.sources[i]);
        else SyncWhiteboxMaterial(entry.white, entry.source);
        Set(object, "material", entry.white);
        if (object.instanceColor) Set(object, "instanceColor", null);
        stats.whiteMeshes++;
      }
    }
    this._ApplyLights(Set, mode);
    this.stats = stats;
    return this._Restore;
  }

  _RestoreLog() {
    for (let i = this._logCount - 1; i >= 0; i -= 1) {
      this._logObjects[i][this._logKeys[i]] = this._logValues[i];
      this._logObjects[i] = null; this._logValues[i] = null;
    }
    this._logCount = 0;
    this._active = false;
  }

  _Watch(object) {
    if (this._watched.has(object)) return;
    this._watched.add(object);
    object.addEventListener("childadded", this._OnStructure);
    object.addEventListener("childremoved", this._OnStructure);
  }

  /** 结构事件落到哪一棵顶层子树；scene 自己增删的就是那一棵。离开场景的子树挂回来那一刻重建。 */
  _StructureChanged(event) {
    const scene = this._planScene;
    if (!scene) return;
    if (event.target === scene) { if (event.child) this._dirtyTops.add(event.child); return; }
    let node = event.target;
    while (node && node.parent !== scene) node = node.parent;
    if (node) this._dirtyTops.add(node);
  }

  /** 一棵顶层子树的清单。不看 visible：显隐翻转不让清单失效，出画时逐个按自己的 visible 跳过。 */
  _BuildTop(top) {
    const bucket = { lights: [], effects: [], lods: [], meshes: [] };
    top.traverse((object) => {
      this._Watch(object);
      if (object.isLight) bucket.lights.push(object);
      if (object.isLOD) bucket.lods.push(object);
      if (object.isPoints || object.isSprite || object.userData?.whiteboxEffect) { bucket.effects.push(object); return; }
      if (object.isMesh && object !== this.sky) {
        bucket.meshes.push({ object, source: undefined, sources: null, epoch: -1, mode: MESH_KEEP,
          white: null, terrain: false, character: false, water: false, cutout: false });
      }
    });
    return bucket;
  }

  _ClassifyMesh(entry) {
    const c = this.config, object = entry.object, material = object.material;
    entry.epoch = this._epoch;
    entry.source = material;
    entry.sources = Array.isArray(material) ? material.slice() : null;
    entry.mode = MESH_KEEP; entry.white = null;
    entry.terrain = entry.character = entry.water = entry.cutout = false;
    if (!material) return;
    const sources = entry.sources || [material];
    if (IsWhiteboxDepthOnly(sources)) return;
    if (!c.effects && IsWhiteboxEffectMesh(object, sources)) { entry.mode = MESH_HIDE; return; }
    entry.mode = MESH_WHITE;
    entry.terrain = IsWhiteboxTerrain(object);
    entry.character = IsWhiteboxCharacter(object);
    if (entry.terrain ? c.terrainTextures : entry.character ? c.characterTextures : c.assetTextures) return;
    // 水面：蓝灰水色 + 天空反光（WHITEBOX_WATER），不画网格。人物与地形不可能是水，先判它们。
    entry.water = !entry.terrain && !entry.character && IsWhiteboxWater(object);
    entry.cutout = !entry.water && sources.some(IsWhiteboxCutout);
    const water = entry.water;
    entry.white = entry.sources ? sources.map((m) => this.Material(m, { water })) : this.Material(material, { water });
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
