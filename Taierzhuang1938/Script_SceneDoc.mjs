// 场景文件（docs/Data_Scene.md）：格式常量、校验、高度图编解码、按范围取一块、转成白盒编辑器的场景形状。
//
// 一个场景 = Scenes/<Id>/Scene_<Id>.json（物件引用列表 + 地面涂色 + 远景设置 + 设计标注 + 样条壕沟）
//          + Scenes/<Id>/Scene_<Id>.height.bin（高度图，int16 小端、厘米，(cols+1)×(rows+1) 个格点；沟没挖之前的地面）
//          + Scenes/<Id>/Scene_<Id>.trench.bin（有壕沟时：挖沟基准面，Script_SceneTrenches）。
// 物件只写资产编号（Data_SceneAssets），不写文件路径；场景文件就是这个场景的唯一真相，人、agent、场景编辑器都直接改它。
//
// 白盒编辑器按关卡从场景里取一块（region）来建场：BlockoutDocFromScene 把这一块转成旧的
// tengxian-blockout-scene/1 形状，再走原来的 LayoutFromSceneDoc，建场与渲染一行不改。
//
// 纯模块：零 three、零 DOM，node 与浏览器共用。

import { SCENE_ASSETS, SCENE_MATERIALS, SCENE_LIST, SceneInfo, SceneObjectSemantic } from "./Data_SceneAssets.mjs";
import { BLOCKOUT_SCENE_SCHEMA, LandmarkIssues } from "./Script_EditorBlockoutConfig.mjs";
import { GridSampler, SceneTrenchIssues, SceneTrenchLines, SliceTrenchPlan } from "./Script_SceneTrenches.mjs";
import { CompileSceneAirWalls, SceneAirWallIssues } from "./Script_SceneAirWalls.mjs";
import { SceneCraterIssues, SliceSceneCraters } from "./Script_SceneCraters.mjs";
import { SceneVehicleTrackIssues, NormalizeTrackPoints } from "./Script_VehicleTrackField.mjs";
import { TERRAIN_SETS } from "./Data_Tuning_Terrain.mjs";
import { MAX_FOG_VOLUMES } from "./Data_Tuning_Volumetrics.mjs";
import { PARTICLE_VOLUME_ASSETS } from "./Data_ParticleVolumeAssets.mjs";

export const SCENE_SCHEMA = "tengxian-scene/1";
export const SCENE_HEIGHT_ENCODING = "int16-cm-le";
export const SCENE_LIMITS = Object.freeze({ maxObjects: 30000, idMax: 96, groupMax: 120, markerMax: 400 });
/** 物件顶层认的字段；其余写进 meta（原样带过去，给预演 / 测试读）。 */
export const SCENE_OBJECT_KEYS = Object.freeze([
  "id", "asset", "material", "pos", "yawDeg", "size", "solid", "visual", "noClimb", "standOn", "tag", "cover",
  "hideOn", "showOn", "bindId", "layer", "group", "params", "meta",
]);

const IsObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const Finite = (value) => typeof value === "number" && Number.isFinite(value);
const IsBounds = (b) => IsObject(b) && ["minX", "maxX", "minZ", "maxZ"].every(k => Finite(b[k])) && b.maxX > b.minX && b.maxZ > b.minZ;
const NonEmpty = (value) => typeof value === "string" && value.length > 0;
const DEG = Math.PI / 180;

export function IsSceneCamera(camera) {
  return IsObject(camera) && Array.isArray(camera.position) && camera.position.length === 3 && camera.position.every(Finite)
    && Finite(camera.yawDeg) && Finite(camera.pitchDeg) && Math.abs(camera.pitchDeg) < 90
    && Finite(camera.fovDeg) && camera.fovDeg > 0 && camera.fovDeg < 180
    && (camera.nearFocusM === undefined || (Finite(camera.nearFocusM) && camera.nearFocusM > 0))
    && (camera.vignette === undefined || (Finite(camera.vignette) && camera.vignette >= 0 && camera.vignette <= 1));
}

/** 现有的场景（场景编辑器的下拉、本机存盘口 /__scene/* 只认这张表；清单在 Data_SceneAssets.SCENE_LIST）。 */
export const SCENE_IDS = Object.freeze(SCENE_LIST.map((scene) => scene.id));
/** 场景的样子：whitebox / formal（清单里没有的当 whitebox）。 */
export function SceneStyle(sceneId) { return SceneInfo(sceneId)?.style || "whitebox"; }

/** 场景文件同目录下的文件路径：场景 id → 相对项目根的目录。 */
export function SceneDir(sceneId) { return `Scenes/${sceneId}`; }
export function SceneFileName(sceneId) { return `Scene_${sceneId}.json`; }
/** 相对仓库根的场景 JSON 路径（存盘口用）。 */
export function SceneRepoPath(sceneId) { return `Taierzhuang1938/${SceneDir(sceneId)}/${SceneFileName(sceneId)}`; }
export const SCENE_FILE_RE = /^Taierzhuang1938\/Scenes\/[A-Za-z0-9]+\/Scene_[A-Za-z0-9]+\.json$/;

// ---------------------------------------------------------------------------
// 校验

function ObjectIssues(obj, at, errors, ids) {
  if (!IsObject(obj)) { errors.push(`${at} 要是对象`); return; }
  if (!NonEmpty(obj.id) || obj.id.length > SCENE_LIMITS.idMax) errors.push(`${at}.id 要是 1–${SCENE_LIMITS.idMax} 字的字符串`);
  else if (ids.has(obj.id)) errors.push(`${at}.id 重复：${obj.id}`);
  else ids.add(obj.id);
  const asset = SCENE_ASSETS[obj.asset];
  if (!asset) { errors.push(`${at}.asset 不在资产目录（Data_SceneAssets）：${JSON.stringify(obj.asset)}`); return; }
  if (!Array.isArray(obj.pos) || obj.pos.length !== 3 || !Finite(obj.pos[0]) || !Finite(obj.pos[2])
    || !(obj.pos[1] === null || Finite(obj.pos[1]))) errors.push(`${at}.pos 要是 [x, y, z]，y 可以是 null（落地）`);
  if (obj.yawDeg !== undefined && !Finite(obj.yawDeg)) errors.push(`${at}.yawDeg 要是有限数字`);
  if (asset.sized && !(Array.isArray(obj.size) && obj.size.length === 3 && obj.size.every(v => Finite(v) && v > 0))) errors.push(`${at}.size 要是三个正数 [w, h, d]`);
  // 体块必须写材质（样子看它）；道具、树的样子是模型，材质可不写
  if (asset.kind === "box") {
    if (!SCENE_MATERIALS[obj.material]) errors.push(`${at}.material 不在材质目录：${JSON.stringify(obj.material)}`);
  } else if (obj.material !== undefined && !SCENE_MATERIALS[obj.material]) errors.push(`${at}.material 不在材质目录：${JSON.stringify(obj.material)}`);
  for (const k of ["solid", "visual", "noClimb", "standOn"]) if (obj[k] !== undefined && typeof obj[k] !== "boolean") errors.push(`${at}.${k} 要是 true / false`);
  if (obj.tag !== undefined && !NonEmpty(obj.tag)) errors.push(`${at}.tag 要是非空字符串`);
  if (obj.cover !== undefined && !(IsObject(obj.cover) && Finite(obj.cover.faceX) && Finite(obj.cover.faceZ))) errors.push(`${at}.cover 要是 { faceX, faceZ }`);
  if (obj.hideOn !== undefined && !NonEmpty(obj.hideOn)) errors.push(`${at}.hideOn 要是信号名`);
  if (obj.showOn !== undefined && !NonEmpty(obj.showOn)) errors.push(`${at}.showOn 要是信号名`);
  if (obj.bindId !== undefined && !NonEmpty(obj.bindId)) errors.push(`${at}.bindId 要是非空绑定槽位名`);
  if ((asset.layer || undefined) !== obj.layer) errors.push(asset.layer ? `${at}.layer 要是 ${JSON.stringify(asset.layer)}` : `${at}.layer 只给远景资产写`);
  if (obj.group !== undefined && !(typeof obj.group === "string" && obj.group.length <= SCENE_LIMITS.groupMax)) errors.push(`${at}.group 要是至多 ${SCENE_LIMITS.groupMax} 字的字符串`);
  if (obj.params !== undefined && !IsObject(obj.params)) errors.push(`${at}.params 要是对象`);
  if (obj.params?.grounding === "conform" && (asset.kind !== "prop" || obj.pos?.[1] !== null
    || obj.solid !== false || obj.params.tile || obj.showOn || obj.hideOn)) {
    errors.push(`${at}.params.grounding=conform 需要落地、无碰撞且常驻的单件道具`);
  }
  if (obj.meta !== undefined && !IsObject(obj.meta)) errors.push(`${at}.meta 要是对象`);
  if (obj.meta?.waterRibbon !== undefined) {
    const rows = obj.meta.waterRibbon;
    const validRows = Array.isArray(rows) && rows.length >= 2 && rows.length <= 4096
      && rows.every((row, i) => Array.isArray(row) && row.length === 3 && row.every(Finite)
        && row[1] < row[2] && (i === 0 || row[0] > rows[i - 1][0]));
    if (obj.material !== "Whitebox/Water" || obj.solid !== false || !Finite(obj.pos?.[1]) || !validRows) {
      errors.push(`${at}.meta.waterRibbon 需要非实体水面、明确底高及按 X 递增的 [x, 北岸z, 南岸z]`);
    }
  }
  for (const k of Object.keys(obj)) if (!SCENE_OBJECT_KEYS.includes(k)) errors.push(`${at} 不认识的字段 ${k}（放进 meta）`);
}

/** 场景文件校验（不含高度图字节，见 SceneHeightIssues）。 */
export function ValidateScene(doc) {
  const errors = [];
  const warnings = [];
  if (!IsObject(doc)) return { ok: false, errors: ["场景要是一个 JSON 对象"], warnings };
  if (doc.schema !== SCENE_SCHEMA) errors.push(`schema 要是 ${JSON.stringify(SCENE_SCHEMA)}`);
  if (!NonEmpty(doc.id) || !/^[A-Za-z0-9]+$/.test(doc.id)) errors.push("id 要匹配 /^[A-Za-z0-9]+$/");
  if (!NonEmpty(doc.title)) errors.push("title 要是非空字符串");
  if (!IsBounds(doc.bounds)) errors.push("bounds 要带有限且 max > min 的 minX / maxX / minZ / maxZ");
  if (!IsObject(doc.spawn) || !Finite(doc.spawn.x) || !Finite(doc.spawn.z)) errors.push("spawn 要带有限的 x / z");
  const camera = doc.camera;
  if (camera !== undefined && !IsSceneCamera(camera)) {
    errors.push("camera 要带 [x, y, z]、yawDeg、pitchDeg（±90° 以内）及垂直 fovDeg（0–180° 之间）；nearFocusM 如有须为正数、vignette 如有须在 [0, 1]");
  }
  const smoke = doc.smokeColumns;
  if (smoke !== undefined && (!Array.isArray(smoke) || smoke.some(entry => !IsObject(entry)
    || !Finite(entry.x) || !Finite(entry.z) || !Finite(entry.heightOffset) || !IsObject(entry.options)))) {
    errors.push("smokeColumns 每个烟源要带 x、z、heightOffset、options");
  } else if (smoke?.some(({ options }) => {
    const { volume, ignition, seed, life } = options.backdrop || {};
    return volume !== undefined && (!IsObject(volume) || typeof volume.asset !== "string"
      || !Object.hasOwn(PARTICLE_VOLUME_ASSETS, volume.asset)
      || !Array.isArray(volume.bounds) || volume.bounds.length !== 3 || !volume.bounds.every(n => Finite(n) && n > 0)
      || !Finite(volume.density) || volume.density <= 0 || !Finite(volume.speed) || volume.speed < 0
      || !Number.isInteger(seed) || !Finite(life) || life <= 0
      || (ignition !== undefined && (!Array.isArray(ignition) || ignition.length !== 3 || !ignition.every(Finite))));
  })) {
    errors.push("smokeColumns 中的烘焙烟场需要已登记的体积资产、米制尺寸、浓度、速度、时长与种子");
  }
  const fogVolumes = doc.fogVolumes;
  if (fogVolumes !== undefined && (!Array.isArray(fogVolumes) || fogVolumes.length > MAX_FOG_VOLUMES
    || fogVolumes.some(volume => !IsObject(volume) || !["sphere", "box"].includes(volume.shape)
      || !Array.isArray(volume.position) || volume.position.length !== 3 || !volume.position.every(Finite)
      || !Array.isArray(volume.size) || volume.size.length !== 3 || !volume.size.every(n => Finite(n) && n > 0)
      || !Finite(volume.density) || volume.density <= 0 || !/^#[0-9a-f]{6}$/i.test(volume.albedo)
      || (volume.falloff !== undefined && (!Finite(volume.falloff) || volume.falloff <= 0))))) {
    errors.push(`fogVolumes 最多 ${MAX_FOG_VOLUMES} 个，要求有效的形状、米制位置与半尺寸、浓度、颜色和边缘衰减`);
  }
  const t = doc.terrain;
  if (!IsObject(t)) errors.push("terrain 要是对象");
  else {
    if (t.kind === "flat") {
      if (t.y !== undefined && !Finite(t.y)) errors.push("terrain.y 要是有限数字");
    } else {
      if (!NonEmpty(t.file) || /[\\/]/.test(t.file)) errors.push("terrain.file 要是同目录下的文件名");
      if (t.encoding !== SCENE_HEIGHT_ENCODING) errors.push(`terrain.encoding 要是 ${JSON.stringify(SCENE_HEIGHT_ENCODING)}`);
    }
    if (!Finite(t.minX) || !Finite(t.minZ) || !(Finite(t.cellM) && t.cellM > 0)) errors.push("terrain 要带有限的 minX / minZ 与正的 cellM");
    if (!Number.isInteger(t.cols) || !Number.isInteger(t.rows) || t.cols < 1 || t.rows < 1) errors.push("terrain.cols / rows 要是正整数");
  }
  const ids = new Set();
  if (!Array.isArray(doc.objects)) errors.push("objects 要是数组");
  else {
    if (doc.objects.length > SCENE_LIMITS.maxObjects) errors.push(`objects 最多 ${SCENE_LIMITS.maxObjects} 个`);
    doc.objects.forEach((obj, i) => ObjectIssues(obj, `objects[${i}]`, errors, ids));
  }
  if (doc.airWalls !== undefined) SceneAirWallIssues(doc.airWalls, errors, ids);
  if (doc.markers !== undefined) LandmarkIssues(doc.markers, errors, "markers");
  if (doc.paint !== undefined && !Array.isArray(doc.paint)) errors.push("paint 要是数组");
  if (doc.backdrop !== undefined) {
    const bd = doc.backdrop;
    if (!IsObject(bd)) errors.push("backdrop 要是对象");
    else {
      if (bd.shapes !== undefined) errors.push("backdrop.shapes 不写在这里：远景物件是 objects 里 layer 为 backdrop 的物件");
      if (bd.siteBounds !== undefined && !IsBounds(bd.siteBounds)) errors.push("backdrop.siteBounds 要是有效范围");
    }
  }
  if (doc.look !== undefined && !IsObject(doc.look)) errors.push("look 要是对象");
  if (doc.look?.proceduralDressing !== undefined && typeof doc.look.proceduralDressing !== "boolean")
    errors.push("look.proceduralDressing 要是 true / false");
  if (doc.look?.terrainLayers !== undefined && (typeof doc.look.terrainLayers !== "string" || !Object.hasOwn(TERRAIN_SETS, doc.look.terrainLayers)))
    errors.push("look.terrainLayers 要是 TERRAIN_SETS 中的编号");
  if (doc.ways !== undefined && !IsObject(doc.ways)) errors.push("ways 要是对象");
  if (doc.inherit !== undefined) {
    const inh = doc.inherit;
    if (!IsObject(inh) || !SCENE_IDS.includes(inh.scene) || inh.scene === doc.id || !Finite(inh.maxZ)) {
      errors.push("inherit 要是 { scene: 有效其他场景 id, maxZ: 有限数字 }");
    } else if (IsObject(t) && Finite(t.minZ) && Math.abs(t.minZ - inh.maxZ) > 1e-6) {
      errors.push(`inherit.maxZ (${inh.maxZ}) 必须与本场景 terrain.minZ (${t.minZ}) 对齐`);
    }
  }
  if (doc.trenches !== undefined) SceneTrenchIssues(doc.trenches, errors);
  if (doc.craters !== undefined) SceneCraterIssues(doc.craters, errors, "craters", ids);
  if (doc.vehicleTracks !== undefined) SceneVehicleTrackIssues(doc.vehicleTracks, errors);
  return { ok: errors.length === 0, errors, warnings };
}

/** 场景文件的写法：顶层缩进，大数组一行一项（好 diff、好按 id grep）。 */
export function FormatSceneJson(scene) {
  const lines = ["{"];
  const entries = Object.entries(scene);
  entries.forEach(([key, value], i) => {
    const comma = i < entries.length - 1 ? "," : "";
    if (["objects", "airWalls", "markers", "paint", "craters", "vehicleTracks"].includes(key) && Array.isArray(value)) {
      lines.push(`  ${JSON.stringify(key)}: [`);
      value.forEach((item, j) => lines.push(`    ${JSON.stringify(item)}${j < value.length - 1 ? "," : ""}`));
      lines.push(`  ]${comma}`);
    } else if (key === "trenches" && value) {
      // 壕沟：一段一行（好 diff、好按 id grep）
      const { segments, ...rest } = value;
      lines.push(`  "trenches": {`);
      for (const [k, v] of Object.entries(rest)) lines.push(`    ${JSON.stringify(k)}: ${JSON.stringify(v)},`);
      lines.push(`    "segments": [`);
      (segments || []).forEach((item, j) => lines.push(`      ${JSON.stringify(item)}${j < segments.length - 1 ? "," : ""}`));
      lines.push("    ]");
      lines.push(`  }${comma}`);
    } else if (key === "backdrop" && value) {
      const { paint, ...rest } = value;
      lines.push(`  "backdrop": {`);
      for (const [k, v] of Object.entries(rest)) lines.push(`    ${JSON.stringify(k)}: ${JSON.stringify(v)},`);
      lines.push(`    "paint": [`);
      paint.forEach((item, j) => lines.push(`      ${JSON.stringify(item)}${j < paint.length - 1 ? "," : ""}`));
      lines.push("    ]");
      lines.push(`  }${comma}`);
    } else lines.push(`  ${JSON.stringify(key)}: ${JSON.stringify(value)}${comma}`);
  });
  lines.push("}");
  return lines.join("\n") + "\n";
}

// ---------------------------------------------------------------------------
// 高度图

/** 地形是不是解析平地（无需外部 .height.bin 高度图）。 */
export function IsFlatTerrain(terrain) {
  return terrain?.kind === "flat";
}

/** 按 terrain 尺寸生成平地格点高度数组（全为 terrain.y ?? 0）。 */
export function FlatSceneHeights(terrain) {
  const count = (terrain.cols + 1) * (terrain.rows + 1);
  const heights = new Float32Array(count);
  const y = Finite(terrain?.y) ? terrain.y : 0;
  if (y !== 0) heights.fill(y);
  return heights;
}

/** 字节（Uint8Array / ArrayBuffer）→ 每个格点的高度（米），heights[iz*(cols+1)+ix]。 */
export function DecodeSceneHeights(bytes, terrain) {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const count = (terrain.cols + 1) * (terrain.rows + 1);
  if (u8.byteLength !== count * 2) throw new Error(`高度图有 ${u8.byteLength} 字节，应当是 ${count * 2}（(cols+1)×(rows+1) 个 int16）`);
  const view = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  const heights = new Float32Array(count);
  for (let i = 0; i < count; i++) heights[i] = view.getInt16(i * 2, true) / 100;
  return heights;
}

/** 高度（米）→ int16 小端厘米字节。 */
export function EncodeSceneHeights(heights) {
  const out = new Uint8Array(heights.length * 2);
  const view = new DataView(out.buffer);
  for (let i = 0; i < heights.length; i++) {
    view.setInt16(i * 2, Math.max(-32768, Math.min(32767, Math.round(heights[i] * 100))), true);
  }
  return out;
}

/** 从整张高度图里按 region 取一块（对齐到格点）。 */
export function CropSceneHeights(terrain, heights, region) {
  const { minX, minZ, cellM, cols, rows } = terrain;
  const Index = (v, origin, max) => Math.max(0, Math.min(max, Math.round((v - origin) / cellM)));
  const ix0 = Index(region.minX, minX, cols), ix1 = Math.max(ix0 + 1, Index(region.maxX, minX, cols));
  const iz0 = Index(region.minZ, minZ, rows), iz1 = Math.max(iz0 + 1, Index(region.maxZ, minZ, rows));
  const outCols = ix1 - ix0, outRows = iz1 - iz0, width = cols + 1;
  const out = new Float32Array((outCols + 1) * (outRows + 1));
  for (let iz = 0; iz <= outRows; iz++) {
    const from = (iz0 + iz) * width + ix0;
    out.set(heights.subarray(from, from + outCols + 1), iz * (outCols + 1));
  }
  return { terrain: { minX: minX + ix0 * cellM, minZ: minZ + iz0 * cellM, cellM, cols: outCols, rows: outRows }, heights: out };
}

// ---------------------------------------------------------------------------
// 场景 → 白盒编辑器的场景形状（tengxian-blockout-scene/1）

const BACKDROP_KIND = Object.freeze({ "Backdrop/Box": "box", "Backdrop/Blob": "blob", "Backdrop/Hill": "hill", "Backdrop/Tree": "tree" });

function Inside(region, x, z) {
  return x >= region.minX && x <= region.maxX && z >= region.minZ && z <= region.maxZ;
}

function LineTouches(region, points, pad = 0) {
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const p of points) { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z); }
  return maxX + pad >= region.minX && minX - pad <= region.maxX && maxZ + pad >= region.minZ && minZ - pad <= region.maxZ;
}

/**
 * 物件 → 体块（白盒编辑器 / FirstLevelWhiteboxField 吃的形状）。
 * 道具带 propModel（外部道具 id，盒子只留碰撞）；树带 sceneTree（白盒编辑器种树）。
 */
export function SceneObjectToBlock(obj) {
  const [w, h, d] = obj.size;
  const asset = SCENE_ASSETS[obj.asset];
  return {
    id: obj.id, x: obj.pos[0], z: obj.pos[2], w, d, h,
    ry: Finite(obj.yawDeg) ? obj.yawDeg * DEG : 0,
    semantic: SceneObjectSemantic(obj),
    solid: obj.solid !== false,
    ...(asset?.kind === "prop" ? { propModel: asset.model } : {}),
    ...(asset?.kind === "prop" && Finite(obj.pos[1]) && obj.params?.grounding === "authored" ? { propAuthoredGrounding: true } : {}),
    ...(asset?.kind === "prop" && obj.params?.grounding === "conform" ? { propConformGround: true } : {}),
    // 道具铺几件（params.tile = [nx, ny, nz]，同现行第一关替换表的 tile：一只长盒子里排几个模型）
    ...(asset?.kind === "prop" && Array.isArray(obj.params?.tile) ? { propTile: [...obj.params.tile] } : {}),
    ...(asset?.kind === "tree" ? { sceneTree: true } : {}),
    ...(typeof obj.params?.color === "string" ? { color: obj.params.color } : {}),
    ...(typeof obj.params?.libraryMaterial === "string" ? { libraryMaterial: obj.params.libraryMaterial } : {}),
    ...(Finite(obj.params?.roughness) ? { roughness: obj.params.roughness } : {}),
    ...(Finite(obj.params?.metalness) ? { metalness: obj.params.metalness } : {}),
    ...(typeof obj.params?.sector === "string" ? { sector: obj.params.sector } : {}),
    ...(typeof obj.params?.surface === "string" ? { surface: obj.params.surface } : {}),
    ...(obj.pos[1] !== null ? { y: obj.pos[1] + h / 2 } : {}),
    ...(obj.visual === false ? { visual: false } : {}),
    ...(obj.tag ? { tag: obj.tag } : {}),
    ...(obj.noClimb === true ? { noClimb: true } : {}),
    ...(obj.standOn === true ? { standOn: true } : {}),
    ...(obj.bindId ? { bindId: obj.bindId } : {}),
    ...(obj.cover ? { cover: { ...obj.cover } } : {}),
    ...(obj.meta || {}),
  };
}

function BackdropShape(obj) {
  return {
    id: obj.id, kind: BACKDROP_KIND[obj.asset], x: obj.pos[0], z: obj.pos[2],
    ...(Finite(obj.yawDeg) && obj.yawDeg !== 0 ? { ry: obj.yawDeg * DEG } : {}),
    ...(obj.params || {}),
  };
}

/**
 * 场景按 region 取一块，转成白盒编辑器的场景形状（交给 Script_EditorBlockoutLevels.LayoutFromSceneDoc）。
 * @param {object} scene 场景文件
 * @param {Float32Array} heights 整张高度图（米）
 * @param {{ level: string, region?: object, spawn?: object, priorSignals?: string[] }} options
 *   region：只取这一块（缺省整个场景）；spawn：这一块的出生点（缺省场景的）；
 *   priorSignals：前面的段落已经发生过的信号——hideOn 它的物件直接不要，showOn 它的物件当已经出现；
 *   heightTint：不给 = 用场景 look 里的；null = 按这一块的最低 / 最高自动定；
 *   objectMarginM：物件取到范围外多远（米，缺省 1：贴边的空气墙）——站在场地边上看得见的房子要带上；
 *   futureSignals：这一段里不会发生的信号（后面段落的）——hideOn 它的物件当常驻块（不做成随信号的块：那种块不合批），showOn 它的不要。
 *   trenchPlan：场景壕沟编好的网络（Script_SceneTrenches.PrepareSceneTerrain；heights 要是按它挖好的那份）。带过去给建场摆沟里的
 *     构件、正式场景画土面细节；沟中线并进 ways.trenches。
 */
export function BlockoutDocFromScene(scene, heights, { level, region = null, spawn = null, priorSignals = [], futureSignals = [], heightTint, objectMarginM = 1, trenchPlan = null } = {}) {
  const area = region ? { ...region } : { ...scene.bounds };
  const objectArea = { minX: area.minX - objectMarginM, maxX: area.maxX + objectMarginM, minZ: area.minZ - objectMarginM, maxZ: area.maxZ + objectMarginM };
  const crop = CropSceneHeights(scene.terrain, heights, area);
  const prior = new Set(priorSignals);
  const future = new Set(futureSignals);
  const blocks = [];
  const gates = [];
  const bindables = [];
  const shapes = [];
  const groundAt = heights ? GridSampler(scene.terrain, heights) : null;
  const compiledAirWalls = CompileSceneAirWalls(scene.airWalls, { groundAt });
  const TouchesObjectArea = (obj) => {
    if (Inside(objectArea, obj.pos[0], obj.pos[2])) return true;
    if (!obj.size) return false;
    const r = Math.hypot(obj.size[0], obj.size[2]) * 0.5;
    return obj.pos[0] + r >= objectArea.minX && obj.pos[0] - r <= objectArea.maxX
      && obj.pos[2] + r >= objectArea.minZ && obj.pos[2] - r <= objectArea.maxZ;
  };
  for (const obj of [...scene.objects, ...compiledAirWalls]) {
    if (obj.layer === "backdrop") { shapes.push(BackdropShape(obj)); continue; }
    const inArea = obj.meta?.airWallSpline ? TouchesObjectArea(obj) : Inside(objectArea, obj.pos[0], obj.pos[2]);
    if (!["box", "prop", "tree"].includes(SCENE_ASSETS[obj.asset]?.kind) || !inArea) continue;
    if ((obj.hideOn && prior.has(obj.hideOn)) || (obj.showOn && future.has(obj.showOn))) continue;
    // 两个都写 = 先出现、后消失（如 0610 塌墙的土堆被清走）
    const block = SceneObjectToBlock(obj);
    const appear = obj.showOn && !prior.has(obj.showOn) ? { appearSignal: obj.showOn } : {};
    const hide = obj.hideOn && !future.has(obj.hideOn) ? { signal: obj.hideOn } : {};
    if (obj.bindId) bindables.push({ ...block, ...hide, ...appear });
    else if (hide.signal || appear.appearSignal) gates.push({ ...block, ...hide, ...appear });
    else blocks.push(block);
  }
  const bd = scene.backdrop;
  const site = bd?.siteBounds;
  const withBackdrop = bd && (!site || Inside(area, (site.minX + site.maxX) / 2, (site.minZ + site.maxZ) / 2));
  const paint = (scene.paint || []).filter(item => LineTouches(area, item.poly || item.line, (item.halfW || 0) + (item.feather || 1)));
  const vehicleTracks = (scene.vehicleTracks || []).filter(track => LineTouches(area, NormalizeTrackPoints(track.points), 3));
  const markers = (scene.markers || []).filter(m => Inside(area, m.x, m.z));
  const Lines = (lines) => (lines || []).filter(line => LineTouches(area, line));
  const look = { ...(scene.look || {}) };
  if (heightTint !== undefined) look.heightTint = heightTint;
  const slicePlan = SliceTrenchPlan(trenchPlan, area);
  const craters = SliceSceneCraters(scene.craters, area);
  return {
    schema: BLOCKOUT_SCENE_SCHEMA,
    level,
    source: { generator: `${SceneDir(scene.id)}/${SceneFileName(scene.id)}`, notes: `场景 ${scene.id} 按范围取的一块` },
    scene: scene.id,
    style: SceneStyle(scene.id),
    bounds: area,
    spawn: spawn ? { ...spawn } : { ...scene.spawn },
    ...(scene.camera ? { camera: { ...scene.camera, position: [...scene.camera.position] } } : {}),
    terrain: { kind: "heightmap", ...crop.terrain, encoding: "int16-cm-base64", heights: crop.heights },
    ...(look.heightTint ? { heightTint: { ...look.heightTint } } : {}),
    ...(look.colorSemantics ? { colorSemantics: [...look.colorSemantics] } : {}),
    ...(look.semanticColors ? { semanticColors: { ...look.semanticColors } } : {}),
    ...(look.groundPaintCellM !== undefined ? { groundPaintCellM: look.groundPaintCellM } : {}),
    ...(look.terrainLayers ? { terrainLayers: look.terrainLayers } : {}),
    ...(look.proceduralDressing === false ? { proceduralDressing: false } : {}),
    ...(typeof look.groundColor === "string" ? { groundColor: look.groundColor } : {}),
    ...(typeof look.groundLibraryMaterial === "string" ? { groundLibraryMaterial: look.groundLibraryMaterial } : {}),
    ...(Finite(look.groundMarginM) ? { groundMarginM: look.groundMarginM } : {}),
    ...(IsObject(look.groundGrid) ? { groundGrid: { ...look.groundGrid } } : {}),
    ...(Array.isArray(look.groundTint) ? { groundTint: [...look.groundTint] } : {}),
    ...(look.deformableTerrain === true ? { deformableTerrain: true } : {}),
    ...(scene.smokeColumns ? { smokeColumns: scene.smokeColumns.filter(s => Inside(area, s.x, s.z)) } : {}),
    ...(scene.fogVolumes ? { fogVolumes: scene.fogVolumes.filter(({ position: [x, , z], size: [rx, , rz] }) =>
      x + rx >= area.minX && x - rx <= area.maxX && z + rz >= area.minZ && z - rz <= area.maxZ) } : {}),
    blocks,
    ...(gates.length ? { gates } : {}),
    ...(bindables.length ? { bindables } : {}),
    ...(paint.length ? { paint: paint.map(p => ({ ...p })) } : {}),
    ...(vehicleTracks.length ? { vehicleTracks: vehicleTracks.map(t => structuredClone(t)) } : {}),
    ...(withBackdrop ? { backdrop: { far: bd.far, ground: { ...bd.ground }, ...(bd.haze ? { haze: { ...bd.haze } } : {}),
      paint: (bd.paint || []).map(p => ({ ...p })), shapes } } : {}),
    ...(markers.length ? { landmarks: markers.map(m => ({ ...m })) } : {}),
    ways: {
      roads: Lines(scene.ways?.roads),
      ...(scene.ways?.roadRibbons?.length ? {
        roadRibbons: scene.ways.roadRibbons
          .filter((r) => Array.isArray(r.points) && r.points.length >= 2 && LineTouches(area, r.points.map((p) => (Array.isArray(p) ? { x: p[0], z: p[1] } : p)), (r.width || 4) * 0.6))
          .map((r) => ({ ...r, points: r.points.map((p) => (Array.isArray(p) ? [p[0], p[1]] : [p.x, p.z])) })),
      } : {}),
      ...(scene.ways?.railways?.length ? {
        railways: scene.ways.railways
          .filter((r) => Array.isArray(r.points) && r.points.length >= 2)
          .map((r) => structuredClone(r)),
      } : {}),
      trenches: [...Lines(scene.ways?.trenches), ...Lines(SceneTrenchLines(slicePlan))],
    },
    ...(slicePlan ? { trenchPlan: slicePlan } : {}),
    ...(craters.length ? { craters: craters.map((c) => ({ ...c })) } : {}),
  };
}
