// 场景文件（docs/Data_Scene.md）：格式常量、校验、高度图编解码、按范围取一块、转成白盒编辑器的场景形状。
//
// 一个场景 = Scenes/<Id>/Scene_<Id>.json（物件引用列表 + 地面涂色 + 远景设置 + 设计标注）
//          + Scenes/<Id>/Scene_<Id>.height.bin（高度图，int16 小端、厘米，(cols+1)×(rows+1) 个格点）。
// 物件只写资产编号（Data_SceneAssets），不写文件路径；场景文件就是这个场景的唯一真相，人、agent、场景编辑器都直接改它。
//
// 白盒编辑器按关卡从场景里取一块（region）来建场：BlockoutDocFromScene 把这一块转成旧的
// tengxian-blockout-scene/1 形状，再走原来的 LayoutFromSceneDoc，建场与渲染一行不改。
//
// 纯模块：零 three、零 DOM，node 与浏览器共用。

import { SCENE_ASSETS, SCENE_MATERIALS } from "./Data_SceneAssets.mjs";
import { BLOCKOUT_SCENE_SCHEMA, LandmarkIssues } from "./Script_EditorBlockoutConfig.mjs";

export const SCENE_SCHEMA = "tengxian-scene/1";
export const SCENE_HEIGHT_ENCODING = "int16-cm-le";
export const SCENE_LIMITS = Object.freeze({ maxObjects: 30000, idMax: 96, groupMax: 120, markerMax: 400 });
/** 物件顶层认的字段；其余写进 meta（原样带过去，给预演 / 测试读）。 */
export const SCENE_OBJECT_KEYS = Object.freeze([
  "id", "asset", "material", "pos", "yawDeg", "size", "solid", "visual", "noClimb", "standOn", "tag", "cover",
  "hideOn", "showOn", "layer", "group", "params", "meta",
]);

const IsObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const Finite = (value) => typeof value === "number" && Number.isFinite(value);
const IsBounds = (b) => IsObject(b) && ["minX", "maxX", "minZ", "maxZ"].every(k => Finite(b[k])) && b.maxX > b.minX && b.maxZ > b.minZ;
const NonEmpty = (value) => typeof value === "string" && value.length > 0;
const DEG = Math.PI / 180;

/** 现有的场景（场景编辑器的下拉、本机存盘口 /__scene/* 只认这张表）。 */
export const SCENE_IDS = Object.freeze(["FirstLevelWhitebox"]);

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
  if (asset.sized) {
    if (!Array.isArray(obj.size) || obj.size.length !== 3 || !obj.size.every(v => Finite(v) && v > 0)) errors.push(`${at}.size 要是三个正数 [w, h, d]`);
    if (!SCENE_MATERIALS[obj.material]) errors.push(`${at}.material 不在材质目录：${JSON.stringify(obj.material)}`);
  } else if (obj.material !== undefined && !SCENE_MATERIALS[obj.material]) errors.push(`${at}.material 不在材质目录：${JSON.stringify(obj.material)}`);
  for (const k of ["solid", "visual", "noClimb", "standOn"]) if (obj[k] !== undefined && typeof obj[k] !== "boolean") errors.push(`${at}.${k} 要是 true / false`);
  if (obj.tag !== undefined && !NonEmpty(obj.tag)) errors.push(`${at}.tag 要是非空字符串`);
  if (obj.cover !== undefined && !(IsObject(obj.cover) && Finite(obj.cover.faceX) && Finite(obj.cover.faceZ))) errors.push(`${at}.cover 要是 { faceX, faceZ }`);
  if (obj.hideOn !== undefined && !NonEmpty(obj.hideOn)) errors.push(`${at}.hideOn 要是信号名`);
  if (obj.showOn !== undefined && !NonEmpty(obj.showOn)) errors.push(`${at}.showOn 要是信号名`);
  if ((asset.layer || undefined) !== obj.layer) errors.push(asset.layer ? `${at}.layer 要是 ${JSON.stringify(asset.layer)}` : `${at}.layer 只给远景资产写`);
  if (obj.group !== undefined && !(typeof obj.group === "string" && obj.group.length <= SCENE_LIMITS.groupMax)) errors.push(`${at}.group 要是至多 ${SCENE_LIMITS.groupMax} 字的字符串`);
  if (obj.params !== undefined && !IsObject(obj.params)) errors.push(`${at}.params 要是对象`);
  if (obj.meta !== undefined && !IsObject(obj.meta)) errors.push(`${at}.meta 要是对象`);
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
  const t = doc.terrain;
  if (!IsObject(t)) errors.push("terrain 要是对象");
  else {
    if (!NonEmpty(t.file) || /[\\/]/.test(t.file)) errors.push("terrain.file 要是同目录下的文件名");
    if (t.encoding !== SCENE_HEIGHT_ENCODING) errors.push(`terrain.encoding 要是 ${JSON.stringify(SCENE_HEIGHT_ENCODING)}`);
    if (!Finite(t.minX) || !Finite(t.minZ) || !(Finite(t.cellM) && t.cellM > 0)) errors.push("terrain 要带有限的 minX / minZ 与正的 cellM");
    if (!Number.isInteger(t.cols) || !Number.isInteger(t.rows) || t.cols < 1 || t.rows < 1) errors.push("terrain.cols / rows 要是正整数");
  }
  if (!Array.isArray(doc.objects)) errors.push("objects 要是数组");
  else {
    if (doc.objects.length > SCENE_LIMITS.maxObjects) errors.push(`objects 最多 ${SCENE_LIMITS.maxObjects} 个`);
    const ids = new Set();
    doc.objects.forEach((obj, i) => ObjectIssues(obj, `objects[${i}]`, errors, ids));
  }
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
  if (doc.ways !== undefined && !IsObject(doc.ways)) errors.push("ways 要是对象");
  return { ok: errors.length === 0, errors, warnings };
}

/** 场景文件的写法：顶层缩进，大数组一行一项（好 diff、好按 id grep）。 */
export function FormatSceneJson(scene) {
  const lines = ["{"];
  const entries = Object.entries(scene);
  entries.forEach(([key, value], i) => {
    const comma = i < entries.length - 1 ? "," : "";
    if (["objects", "markers", "paint"].includes(key) && Array.isArray(value)) {
      lines.push(`  ${JSON.stringify(key)}: [`);
      value.forEach((item, j) => lines.push(`    ${JSON.stringify(item)}${j < value.length - 1 ? "," : ""}`));
      lines.push(`  ]${comma}`);
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

/** 物件 → 体块（白盒编辑器 / FirstLevelWhiteboxField 吃的形状）。 */
export function SceneObjectToBlock(obj) {
  const [w, h, d] = obj.size;
  return {
    id: obj.id, x: obj.pos[0], z: obj.pos[2], w, d, h,
    ry: Finite(obj.yawDeg) ? obj.yawDeg * DEG : 0,
    semantic: SCENE_MATERIALS[obj.material].semantic,
    solid: obj.solid !== false,
    ...(obj.pos[1] !== null ? { y: obj.pos[1] + h / 2 } : {}),
    ...(obj.visual === false ? { visual: false } : {}),
    ...(obj.tag ? { tag: obj.tag } : {}),
    ...(obj.noClimb === true ? { noClimb: true } : {}),
    ...(obj.standOn === true ? { standOn: true } : {}),
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
 *   objectMarginM：物件取到范围外多远（米，缺省 1：贴边的隐形墙）——站在场地边上看得见的房子要带上；
 *   futureSignals：这一段里不会发生的信号（后面段落的）——hideOn 它的物件当常驻块（不做成随信号的块：那种块不合批），showOn 它的不要。
 */
export function BlockoutDocFromScene(scene, heights, { level, region = null, spawn = null, priorSignals = [], futureSignals = [], heightTint, objectMarginM = 1 } = {}) {
  const area = region ? { ...region } : { ...scene.bounds };
  const objectArea = { minX: area.minX - objectMarginM, maxX: area.maxX + objectMarginM, minZ: area.minZ - objectMarginM, maxZ: area.maxZ + objectMarginM };
  const crop = CropSceneHeights(scene.terrain, heights, area);
  const prior = new Set(priorSignals);
  const future = new Set(futureSignals);
  const blocks = [];
  const gates = [];
  const shapes = [];
  for (const obj of scene.objects) {
    if (obj.layer === "backdrop") { shapes.push(BackdropShape(obj)); continue; }
    if (SCENE_ASSETS[obj.asset]?.kind !== "box" || !Inside(objectArea, obj.pos[0], obj.pos[2])) continue;
    if ((obj.hideOn && prior.has(obj.hideOn)) || (obj.showOn && future.has(obj.showOn))) continue;
    // 两个都写 = 先出现、后消失（如 0610 塌墙的土堆被清走）
    const block = SceneObjectToBlock(obj);
    const appear = obj.showOn && !prior.has(obj.showOn) ? { appearSignal: obj.showOn } : {};
    const hide = obj.hideOn && !future.has(obj.hideOn) ? { signal: obj.hideOn } : {};
    if (hide.signal || appear.appearSignal) gates.push({ ...block, ...hide, ...appear });
    else blocks.push(block);
  }
  const bd = scene.backdrop;
  const site = bd?.siteBounds;
  const withBackdrop = bd && (!site || Inside(area, (site.minX + site.maxX) / 2, (site.minZ + site.maxZ) / 2));
  const paint = (scene.paint || []).filter(item => LineTouches(area, item.poly || item.line, (item.halfW || 0) + (item.feather || 1)));
  const markers = (scene.markers || []).filter(m => Inside(area, m.x, m.z));
  const Lines = (lines) => (lines || []).filter(line => LineTouches(area, line));
  const look = { ...(scene.look || {}) };
  if (heightTint !== undefined) look.heightTint = heightTint;
  return {
    schema: BLOCKOUT_SCENE_SCHEMA,
    level,
    source: { generator: `${SceneDir(scene.id)}/${SceneFileName(scene.id)}`, notes: `场景 ${scene.id} 按范围取的一块` },
    bounds: area,
    spawn: spawn ? { ...spawn } : { ...scene.spawn },
    terrain: { kind: "heightmap", ...crop.terrain, encoding: "int16-cm-base64", heights: crop.heights },
    ...(look.heightTint ? { heightTint: { ...look.heightTint } } : {}),
    ...(look.colorSemantics ? { colorSemantics: [...look.colorSemantics] } : {}),
    ...(look.semanticColors ? { semanticColors: { ...look.semanticColors } } : {}),
    blocks,
    ...(gates.length ? { gates } : {}),
    ...(paint.length ? { paint: paint.map(p => ({ ...p })) } : {}),
    ...(withBackdrop ? { backdrop: { far: bd.far, ground: { ...bd.ground }, ...(bd.haze ? { haze: { ...bd.haze } } : {}),
      paint: (bd.paint || []).map(p => ({ ...p })), shapes } } : {}),
    ...(markers.length ? { landmarks: markers.map(m => ({ ...m })) } : {}),
    ways: { roads: Lines(scene.ways?.roads), trenches: Lines(scene.ways?.trenches) },
  };
}
