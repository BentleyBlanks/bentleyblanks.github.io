// 白盒关卡编辑器的关卡注册表与场景（docs/Data_EditorBlockout.md §2）。
//
// 纯模块：零 three、零 DOM，node 与浏览器共用。Script_Main 只从这里拿 BLOCKOUT_PHASES 与
// BlockoutLevelIndex；关卡的 3D 世界照旧由 FirstLevelWhiteboxField 按 phase.whitebox.layout 建。
//
// 每个关卡一个 phase（照 MOVEMENT_RANGE_PHASE 的形状从零写，**不展开 FIRST_LEVEL_MISSION_PHASE**：
// 那份带着 contentId，会把第一关的故事拍与同伴一起带进来）。
//
// 地形的样子（§6.3）：高度色带 —— 低处偏冷偏暗、高处偏暖偏亮，幅度克制。
// 色带的上下限写在 layout.heightTint；SampleGroundColor 给建关时的底色，
// 总控（Script_EditorBlockout）建完后按顶点的真实高度再刷一遍（沟底、河槽都要准）。

import { MISSION_LAYOUT, MISSION_ANCHORS } from "./Data_FirstLevelMissionLayout.mjs";
import { MISSION_TERRAIN, SampleMissionNaturalHeight, TrenchPlanFor } from "./Data_FirstLevelMissionTerrain.mjs";
import { BLOCKOUT_LEVEL_KEYS, ValidateBlockoutScene } from "./Script_EditorBlockoutConfig.mjs";
import { BlockoutDocFromScene, DecodeSceneHeights } from "./Script_SceneDoc.mjs";

// 2026-10-31：第一关新剧本三段（01–05 / 06–10 / 11–18）共用一个场景 Scenes/FirstLevelWhitebox（docs/Data_Scene.md），
// 每段按原来的场地范围取一块来建场；后面的段落把前面段落出现过的信号都当已经发生（塌了的还塌着、开了的门还开着）。
const FIRST_LEVEL_WHITEBOX_SCENE = "./Scenes/FirstLevelWhitebox/Scene_FirstLevelWhitebox.json";
// Stage0105Done：01–05 演完。那圈「玩家出不了沟」的隐形墙（KeepIn_*）随它消失，后两段不挡人；01–05 里它不会发生（futureSignals）
const STAGE_0105_DONE = "Stage0105Done";
const SIGNALS_0105 = Object.freeze(["DugoutCollapsed", "PitShelled", "TankDisabled", STAGE_0105_DONE]);
const SIGNALS_0610 = Object.freeze(["CartDeparted", "CellarBlast", "SideGateOpen", "EastGateBurst", "MgSilenced", "NorthYardGatesBroken", "BarrageHit", "LaneWallCollapse"]);
function WhiteboxSceneSlice(region, spawn, priorSignals, heightTint, objectMarginM = 1, futureSignals = []) {
  return Object.freeze({ kind: "scene", url: FIRST_LEVEL_WHITEBOX_SCENE, region: Object.freeze(region), priorSignals: Object.freeze([...priorSignals]),
    futureSignals: Object.freeze([...futureSignals]), ...(heightTint !== undefined ? { heightTint } : {}), objectMarginM,
    placeholder: Object.freeze({ bounds: region, spawn }) });
}

// 新旧标记（2026-10-19，用户看着旧版第一关以为是新做的）：era 分 "rewrite"（按新剧本重做）/ "legacy"（游戏里现行的旧版）/
// "draft"（空间草稿）；badge 是关卡名前的小标，note 是下拉里的一行说明，short 是旧版提示条上跳转按钮的短名。
// 数组顺序别动：levelIndex 同时索引 BLOCKOUT_PHASES，下拉里的分组顺序由界面自己排。
export const BLOCKOUT_LEVELS = Object.freeze([
  Object.freeze({ key: "FirstLevel", label: "第一关 · 往南的路", configUrl: "./Blockout/FirstLevel.json",
    era: "legacy", badge: "旧版", note: "游戏里现行的第一关（旧剧本：老周、破墙机枪、拔刀军官）；新剧本分 01–05 / 06–10 / 11–14 / 15–18 四段",
    scene: Object.freeze({ kind: "firstLevelMission" }) }),
  Object.freeze({ key: "SecondLevel", label: "第二关 · 手榴弹雨（空间草稿）", configUrl: "./Blockout/SecondLevel.json",
    era: "draft", badge: "草稿", note: "第二关的空间草稿",
    scene: Object.freeze({ kind: "file", url: "./Blockout/SecondLevel.scene.json",
      placeholder: Object.freeze({ bounds: { minX: 400, maxX: 640, minZ: -250, maxZ: 60 }, spawn: { x: 470, z: -65, yawDeg: -90 } }) }) }),
  // 2026-10-18：按 Notion 定稿的 01–05（空间拓扑关系）新建的独立场地，坐标原点在沟口；不碰游戏里的第一关
  Object.freeze({ key: "FirstLevel0105", label: "第一关 01–05 · 撤退（新剧本）", configUrl: "./Blockout/FirstLevel0105.json",
    era: "rewrite", badge: "新剧本", short: "01–05", note: "01–05：防炮洞 → 支沟拖冬瓜 → 集结处 → 机枪坑 → 路口板桥（10-18 剧本）",
    scene: WhiteboxSceneSlice({ minX: -110, maxX: 320, minZ: -480, maxZ: 200 }, { x: 66.5, z: 64.2, yawDeg: 90 }, [], undefined, 1, [STAGE_0105_DONE]) }),
  // 2026-10-18：06–10 新剧本（干沟 → 凹路 → 耿家庄），与 0105 同一套坐标、另一片场地；锚点 Data_EditorBlockoutFirstLevel0610Space
  Object.freeze({ key: "FirstLevel0610", label: "第一关 06–10 · 耿家庄（新剧本）", configUrl: "./Blockout/FirstLevel0610.json",
    era: "rewrite", badge: "新剧本", short: "06–10", note: "06–10：干沟 → 凹路 → 耿家庄（10-19 剧本）",
    scene: WhiteboxSceneSlice({ minX: -20, maxX: 320, minZ: 120, maxZ: 560 }, { x: 35, z: 147, yawDeg: -90 }, SIGNALS_0105, null) }),
  // 2026-10-19：12–18 新剧本，与 0610 同一套坐标；锚点 Data_EditorBlockoutFirstLevel1218Space。2026-10-23 按 11–14 改稿重做、把 11 也放进来（11 出村 → 石板桥 → 空袭 → 渡口 → 北门），关卡键不变
  // 2026-10-25：Notion 剧本第一关分四大段，11–14 与 15–18 一路连着走、共用这一片场地，下拉里按 parts 拆成两行（见 BLOCKOUT_MENU）
  // 2026-10-26：第三版（北沙河村）：出村 → 土路 → 官道 → 村口沟与板桥 → 北沙河村 → 铁路桥过沙河 → 北门
  Object.freeze({ key: "FirstLevel1218", label: "第一关 11–18 · 北沙河村与铁路桥（新剧本）", configUrl: "./Blockout/FirstLevel1218.json",
    era: "rewrite", badge: "新剧本", short: "11–18", note: "11–18：出村 → 官道 → 村口沟 → 北沙河村 → 空袭 → 铁路桥 → 北门（10-26 第三版）",
    parts: Object.freeze([
      Object.freeze({ id: "FirstLevel1218", from: "11-1", label: "第一关 11–14 · 转运与空袭（新剧本）", short: "11–14",
        note: "11–14：出村 → 进北沙河村 → 沟口顶住追兵 → 空袭 → 救护所院里松手（10-26 第三版）" }),
      Object.freeze({ id: "FirstLevel1218_15", from: "15-1", label: "第一关 15–18 · 冬瓜之死与炸桥（新剧本）", short: "15–18",
        note: "15–18：洞里 → 厢房门口 → 门槛 → 撤过铁路桥、炸桥 → 北门（与 11–14 同一片场地）" }),
    ]),
    scene: WhiteboxSceneSlice({ minX: -160, maxX: 236, minZ: 480, maxZ: 980 }, { x: 117, z: 547.4, yawDeg: 180 }, [...SIGNALS_0105, ...SIGNALS_0610], null, 64) }),
]);

// 关卡下拉的行（2026-10-25）：一片场地一行；写了 parts 的场地按剧本段落拆成几行、共用同一个关卡键。
// id 是行的名字（第一行沿用关卡键，老链接与 onLevel(key) 照旧），from 是这一段第一个关键帧（选这一行 = 换到这片场地并跳到这一帧）。
export const BLOCKOUT_MENU = Object.freeze(BLOCKOUT_LEVELS.flatMap(({ key, label, era, badge, note, short, parts }) =>
  (parts || [{ id: key, label, note, short }]).map(part => Object.freeze({
    id: part.id, key, from: part.from || null, label: part.label, era, badge, note: part.note || "", short: part.short || "",
  }))));

/** 菜单行 id 或关卡键 → 那一行（关卡键给的是它的第一行）；都不是 → null。 */
export function BlockoutMenuRow(idOrKey) {
  return BLOCKOUT_MENU.find(row => row.id === idOrKey) || BLOCKOUT_MENU.find(row => row.key === idOrKey) || null;
}

/** 此刻落在哪一行：同一关卡键的几行里，from 不晚于当前关键帧的最后一行。keyframeIds 是这一关关键帧 id 的顺序。 */
export function BlockoutMenuIdAt(levelKey, keyframeIds, index) {
  const rows = BLOCKOUT_MENU.filter(row => row.key === levelKey);
  let id = rows[0]?.id ?? levelKey;
  for (const row of rows) {
    const at = row.from ? keyframeIds.indexOf(row.from) : 0;
    if (at >= 0 && at <= index) id = row.id;
  }
  return id;
}

// 存档口只认 BLOCKOUT_LEVEL_KEYS。这里只报不抛：Script_Main 开机就 import 本模块，抛了整个游戏起不来。
for (const level of BLOCKOUT_LEVELS) {
  if (!BLOCKOUT_LEVEL_KEYS.includes(level.key)) console.error(`[Blockout] level ${level.key} is not in BLOCKOUT_LEVEL_KEYS`);
}

/** 高度色带的三个色标（sRGB 0–1）：冷暗 → 中性 → 暖亮。 */
export const BLOCKOUT_TINT_STOPS = Object.freeze({
  low: Object.freeze([0.40, 0.47, 0.52]),
  mid: Object.freeze([0.60, 0.60, 0.56]),
  high: Object.freeze([0.78, 0.71, 0.56]),
});
/**
 * 第一关高度范围（米）：格网实测 −6.2…7.5。色带夹在 −3…4：地面大多在 0…1 m，
 * 2 m 深的交通沟沟底落在冷端，河槽更冷，两侧高坡偏暖。
 */
export const FIRST_LEVEL_TINT = Object.freeze({ lo: -3, hi: 4 });

/** 高度 → sRGB 三元组（写进 out）。 */
export function BlockoutTintColor(y, tint, out = [0, 0, 0]) {
  const span = Math.max(0.5, tint.hi - tint.lo);
  const t = Math.max(0, Math.min(1, (y - tint.lo) / span));
  const a = t < 0.5 ? BLOCKOUT_TINT_STOPS.low : BLOCKOUT_TINT_STOPS.mid;
  const b = t < 0.5 ? BLOCKOUT_TINT_STOPS.mid : BLOCKOUT_TINT_STOPS.high;
  const k = t < 0.5 ? t * 2 : (t - 0.5) * 2;
  // smoothstep 让中段过渡柔一点，两端不出硬边
  const s = k * k * (3 - 2 * k);
  out[0] = a[0] + (b[0] - a[0]) * s;
  out[1] = a[1] + (b[1] - a[1]) * s;
  out[2] = a[2] + (b[2] - a[2]) * s;
  return out;
}

// ---------------------------------------------------------------------------
// 高度网格（场景文件 terrain.data：int16 小端、厘米）

function DecodeBase64(text) {
  if (typeof globalThis.atob === "function") {
    const binary = globalThis.atob(text);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }
  return new Uint8Array(globalThis.Buffer.from(text, "base64"));
}

/** 解出 (cols+1)×(rows+1) 个格点高度（米），heights[iz*(cols+1)+ix]。 */
export function DecodeHeightGrid(terrain) {
  // 从场景取出来的一块（Script_SceneDoc.BlockoutDocFromScene）直接带解好的 heights
  if (terrain.heights instanceof Float32Array) return terrain.heights;
  const count = (terrain.cols + 1) * (terrain.rows + 1);
  const bytes = DecodeBase64(terrain.data);
  if (bytes.length < count * 2) throw new Error(`terrain.data has ${bytes.length} bytes, needs ${count * 2}`);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const heights = new Float32Array(count);
  for (let i = 0; i < count; i++) heights[i] = view.getInt16(i * 2, true) / 100;
  return heights;
}

/**
 * int16 厘米网格 → (x,z)=>y。三角剖分与 Data_FirstLevelP012Terrain.SampleHeight 相同
 *（每格沿反对角线切两片），所以拿它当 layout.terrainSampler 建出来的格网与它逐点一致。
 * 返回的函数带 cellM（建格用）、grid 与 minY / maxY。
 */
export function HeightGridSampler(terrain) {
  const heights = terrain.heights instanceof Float32Array ? terrain.heights : DecodeHeightGrid(terrain);
  const { minX, minZ, cellM, cols, rows } = terrain;
  const width = cols + 1, w = cols * cellM, d = rows * cellM;
  const H = (ix, iz) => heights[Math.max(0, Math.min(rows, iz)) * width + Math.max(0, Math.min(cols, ix))];
  const Sample = (px, pz) => {
    const gx = Math.max(0, Math.min(1, (px - minX) / w)) * cols;
    const gz = Math.max(0, Math.min(1, (pz - minZ) / d)) * rows;
    const ix = Math.min(cols - 1, Math.floor(gx)), iz = Math.min(rows - 1, Math.floor(gz));
    const u = gx - ix, v = gz - iz;
    const a = H(ix, iz), b = H(ix + 1, iz), c = H(ix, iz + 1), e = H(ix + 1, iz + 1);
    return u + v <= 1 ? a + (b - a) * u + (c - a) * v : e + (c - e) * (1 - u) + (b - e) * (1 - v);
  };
  let minY = Infinity, maxY = -Infinity;
  for (const h of heights) { if (h < minY) minY = h; if (h > maxY) maxY = h; }
  Sample.cellM = cellM;
  Sample.grid = { minX, minZ, cellM, cols, rows, heights };
  Sample.minY = minY;
  Sample.maxY = maxY;
  return Sample;
}

// ---------------------------------------------------------------------------
// 第一关白盒布局（§2.1）：派生自 MISSION_LAYOUT，不改原表

const TREE_TRUNK = Object.freeze({ w: 0.5, d: 0.5, heightM: 6 });

/**
 * 树换成普通树干块（保留碰撞与地标作用）；水块不画（总控另铺一条水面）。
 * 2026-10-20：树干块不再画盒子（visual:false），编辑器在同一位置种游戏里的枯树模型（Script_EditorBlockoutTrees），
 * 树高 treeHeightM 用 treeModel.heightM（块高只是树干那一截）。
 */
function BlockoutBlock(block) {
  if (block.treeModel) {
    const { treeModel, ...rest } = block;
    const h = Number.isFinite(block.h) && block.h > 0 ? block.h : TREE_TRUNK.heightM;
    const foot = block.y - block.h / 2;
    return { ...rest, w: TREE_TRUNK.w, d: TREE_TRUNK.d, h, y: foot + h / 2, solid: true, semantic: "foliage",
      tag: block.tag || "whiteboxWall", blockoutTree: true, visual: false,
      treeHeightM: Number.isFinite(treeModel?.heightM) && treeModel.heightM > 0 ? treeModel.heightM : h };
  }
  if (block.semantic === "water") return { ...block, visual: false, blockoutWater: true };
  return block;
}

let firstLevelLayout = null;

/** §2.1 第一关白盒布局（结果缓存）。地形仍用 MISSION_TERRAIN（0.75 m + 细分，与游戏一致）。 */
export function DeriveFirstLevelBlockoutLayout() {
  if (firstLevelLayout) return firstLevelLayout;
  const tint = FIRST_LEVEL_TINT;
  const layout = {
    ...MISSION_LAYOUT,
    id: "BlockoutFirstLevel",
    legend: false,
    fortifications: false,
    materialLooks: false,
    railway: null,
    SampleGroundSurface: null,
    ground: { ...MISSION_LAYOUT.ground, pbr: undefined, terrainLayers: undefined },
    // 建关时的底色：自然地面（每点约 0.1 µs）。沟与河槽的冷色由总控按顶点真实高度补上，
    // 不在这里逐点调 SampleMissionTerrain（四十万个顶点要多花三四秒）。
    SampleGroundColor: (x, z) => BlockoutTintColor(SampleMissionNaturalHeight(x, z), tint),
    blocks: MISSION_LAYOUT.blocks.map(BlockoutBlock),
    heightTint: tint,
  };
  firstLevelLayout = layout;
  return layout;
}

let firstLevelWays = null;
/** 俯视图用的路与沟（第一关）：{ roads: [[{x,z}]], trenches: [[{x,z}]] }。 */
export function FirstLevelBlockoutWays() {
  if (firstLevelWays) return firstLevelWays;
  const roads = (MISSION_TERRAIN.roads || []).map(road => road.points.map(p => ({ x: p.x, z: p.z })));
  let trenches = [];
  try { trenches = TrenchPlanFor(MISSION_TERRAIN).trenches.map(t => t.points.map(p => ({ x: p.x, z: p.z }))); }
  catch (error) { trenches = []; }
  firstLevelWays = { roads, trenches };
  return firstLevelWays;
}

// ---------------------------------------------------------------------------
// 文件场景（§2.2）

/** 块脚落在中心与四角中最低的地面上（同 Layout 的 GroundedBlock）。 */
function GroundedBlock(block, groundAt) {
  const ry = Number.isFinite(block.ry) ? block.ry : 0;
  const c = Math.cos(ry), s = Math.sin(ry), hx = block.w / 2, hz = block.d / 2;
  let lowest = groundAt(block.x, block.z);
  for (const [lx, lz] of [[-hx, -hz], [hx, -hz], [-hx, hz], [hx, hz]]) {
    // 与 three 的 rotation.y 同号：局部 (lx,lz) → 世界 (x + lx·cos + lz·sin, z − lx·sin + lz·cos)
    lowest = Math.min(lowest, groundAt(block.x + lx * c + lz * s, block.z - lx * s + lz * c));
  }
  return {
    id: block.id, x: block.x, z: block.z, w: block.w, d: block.d, h: block.h, ry,
    y: lowest + block.h / 2,
    semantic: block.semantic, tag: block.tag || "whiteboxWall",
    solid: block.solid !== false,
    ...(block.cover ? { cover: { ...block.cover } } : {}),
    ...(block.visual === false ? { visual: false } : {}),
    // 2026-10-21：不能攀（翻越 / 攀爬在它上面不触发，Script_Player.ProbeVault）
    ...(block.noClimb === true ? { noClimb: true } : {}),
    // 2026-10-26：架空桥面上的走道（BlockStandSampler 对它不限 1 m 台阶，演员站得上去；§5.6）
    ...(block.standOn === true ? { standOn: true } : {}),
  };
}

/** 场景文件 → FirstLevelWhiteboxField 吃的布局。校验不过直接抛（Prepare 把错误交给总控显示）。 */
/** 场景文件里算「树」的块：foliage、脚印不超过这么宽（苇丛、灌木是大块，不算）。 */
export const BLOCKOUT_TREE_MAX_FOOT_M = 1;
export function IsSceneTreeBlock(block) {
  return block?.semantic === "foliage" && Math.max(block.w, block.d) <= BLOCKOUT_TREE_MAX_FOOT_M && block.h >= 2;
}

// ---------------------------------------------------------------------------
// 地面涂色（场景文件可选 paint，§2.2 / §6.3，2026-10-20）
//
// 按顺序把每一项（多边形 poly，或折线 line + 半宽 halfW）「盖」到一张米级栅格上（预乘颜色 + 覆盖度，后面的盖前面的），
// 边缘按 feather（米，缺省 1）做柔边，strength（0…1，缺省 1）是不透明度。取色时双线性插值：
//   结果 = 高度色 × (1 − A) + C（C 是预乘的涂色，sRGB 0–1）。
// 不写 paint 的关卡没有这张栅格（groundPaint = null），画面逐位不变。

export const BLOCKOUT_PAINT = Object.freeze({
  /** 栅格格距：从 0.5 m 起，格数超过 maxCells 就翻倍。 */
  cellM: 0.5, maxCells: 400000, feather: 1,
});

function HexRgb(hex) {
  const v = parseInt(hex.slice(1), 16);
  return [((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255];
}

/** 点到线段的距离平方。 */
function SegDist2(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz;
  const t = l2 > 0 ? Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / l2)) : 0;
  const ex = px - ax - dx * t, ez = pz - az - dz * t;
  return ex * ex + ez * ez;
}

/** 有符号距离：多边形内为负。 */
function PolySignedDistance(px, pz, pts) {
  let inside = false, best = Infinity;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i], b = pts[j];
    if ((a.z > pz) !== (b.z > pz) && px < (b.x - a.x) * (pz - a.z) / (b.z - a.z) + a.x) inside = !inside;
    const d2 = SegDist2(px, pz, a.x, a.z, b.x, b.z);
    if (d2 < best) best = d2;
  }
  const d = Math.sqrt(best);
  return inside ? -d : d;
}

function LineDistance(px, pz, pts) {
  let best = Infinity;
  for (let i = 1; i < pts.length; i++) {
    const d2 = SegDist2(px, pz, pts[i - 1].x, pts[i - 1].z, pts[i].x, pts[i].z);
    if (d2 < best) best = d2;
  }
  return Math.sqrt(best);
}

/**
 * 把 paint 烘成栅格。→ null（没有可画的项）或 { cellM, minX, minZ, cols, rows, C: Float32Array(rgb 预乘), A: Float32Array, Blend(x, z, rgb) }。
 * Blend 把 (x,z) 处的涂色按覆盖度混进 rgb（sRGB 0–1，就地改），返回覆盖度 A（0 = 没涂）。
 */
export function BuildGroundPaint(items, bounds = null) {
  if (!Array.isArray(items) || !items.length) return null;
  const list = items.map((item) => {
    const pts = item.poly || item.line;
    const halfW = item.line ? item.halfW : 0;
    const feather = Number.isFinite(item.feather) ? item.feather : BLOCKOUT_PAINT.feather;
    const pad = halfW + feather;
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const p of pts) { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z); }
    return { pts, line: !!item.line, halfW, feather, strength: Number.isFinite(item.strength) ? item.strength : 1, rgb: HexRgb(item.color),
      minX: minX - pad, maxX: maxX + pad, minZ: minZ - pad, maxZ: maxZ + pad };
  });
  let minX = Math.min(...list.map((p) => p.minX)), maxX = Math.max(...list.map((p) => p.maxX));
  let minZ = Math.min(...list.map((p) => p.minZ)), maxZ = Math.max(...list.map((p) => p.maxZ));
  if (bounds) { minX = Math.max(minX, bounds.minX); maxX = Math.min(maxX, bounds.maxX); minZ = Math.max(minZ, bounds.minZ); maxZ = Math.min(maxZ, bounds.maxZ); }
  if (!(maxX > minX && maxZ > minZ)) return null;
  let cellM = BLOCKOUT_PAINT.cellM;
  while (((maxX - minX) / cellM + 1) * ((maxZ - minZ) / cellM + 1) > BLOCKOUT_PAINT.maxCells) cellM *= 2;
  const cols = Math.ceil((maxX - minX) / cellM) + 1, rows = Math.ceil((maxZ - minZ) / cellM) + 1;
  const C = new Float32Array(cols * rows * 3), A = new Float32Array(cols * rows);
  for (const p of list) {
    const i0 = Math.max(0, Math.floor((p.minX - minX) / cellM)), i1 = Math.min(cols - 1, Math.ceil((p.maxX - minX) / cellM));
    const j0 = Math.max(0, Math.floor((p.minZ - minZ) / cellM)), j1 = Math.min(rows - 1, Math.ceil((p.maxZ - minZ) / cellM));
    for (let j = j0; j <= j1; j++) {
      const z = minZ + j * cellM;
      for (let i = i0; i <= i1; i++) {
        const x = minX + i * cellM;
        const sd = p.line ? LineDistance(x, z, p.pts) - p.halfW : PolySignedDistance(x, z, p.pts);
        // 边界（sd = 0）处覆盖一半，往外 feather/2 落到 0、往里 feather/2 到满
        const u = 0.5 - sd / p.feather;
        if (u <= 0) continue;
        const k = u >= 1 ? 1 : u * u * (3 - 2 * u);
        const a = k * p.strength;
        if (a <= 0) continue;
        const at = j * cols + i;
        A[at] = A[at] * (1 - a) + a;
        C[at * 3] = C[at * 3] * (1 - a) + p.rgb[0] * a;
        C[at * 3 + 1] = C[at * 3 + 1] * (1 - a) + p.rgb[1] * a;
        C[at * 3 + 2] = C[at * 3 + 2] * (1 - a) + p.rgb[2] * a;
      }
    }
  }
  const Blend = (x, z, rgb) => {
    const gx = (x - minX) / cellM, gz = (z - minZ) / cellM;
    if (!(gx >= 0 && gz >= 0 && gx <= cols - 1 && gz <= rows - 1)) return 0;
    const i = Math.min(cols - 2, Math.floor(gx)), j = Math.min(rows - 2, Math.floor(gz));
    if (i < 0 || j < 0) return 0;
    const u = gx - i, v = gz - j;
    const a00 = j * cols + i, a10 = a00 + 1, a01 = a00 + cols, a11 = a01 + 1;
    const w00 = (1 - u) * (1 - v), w10 = u * (1 - v), w01 = (1 - u) * v, w11 = u * v;
    const a = A[a00] * w00 + A[a10] * w10 + A[a01] * w01 + A[a11] * w11;
    if (a <= 1e-4) return 0;
    for (let c = 0; c < 3; c++) {
      const pc = C[a00 * 3 + c] * w00 + C[a10 * 3 + c] * w10 + C[a01 * 3 + c] * w01 + C[a11 * 3 + c] * w11;
      rgb[c] = rgb[c] * (1 - a) + pc;
    }
    return a;
  };
  return { cellM, minX, minZ, cols, rows, C, A, Blend };
}

/** 远景地面贴图（§6.3 backdrop，2026-10-20）：最长边至多 maxPx 像素、一个像素至少 minTexelM 米。 */
export const BLOCKOUT_BACKDROP_TEXTURE = Object.freeze({ maxPx: 4096, minTexelM: 1, padM: 6 });

/**
 * 把 backdrop.paint（按顺序：poly / line 同场景 paint，rects = 轴对齐田块，实边）画成一张 RGBA 图（sRGB 字节），纯 JS、零 three。
 * 每个像素存「预乘」累积色 C 与覆盖度 A（同 BuildGroundPaint），最后写出 rgb = C / A、a = A；没涂到的像素 rgb = ground.color、a = 0
 * （mipmap 平均时不会混进黑边）。图外框一圈像素一定是 a = 0（钳边采样出去就是没涂）。
 * → null（没有可画的项）或 { minX, minZ, texelM, width, height, data: Uint8Array, painted 被涂到的像素数 }。
 */
export function RasterizeBackdropPaint(backdrop, options = {}) {
  const items = backdrop?.paint || [];
  if (!items.length) return null;
  const T = { ...BLOCKOUT_BACKDROP_TEXTURE, ...options };
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  const Grow = (x0, z0, x1, z1) => { minX = Math.min(minX, x0); minZ = Math.min(minZ, z0); maxX = Math.max(maxX, x1); maxZ = Math.max(maxZ, z1); };
  for (const item of items) {
    if (item.rects) { for (const r of item.rects) Grow(r[0], r[1], r[2], r[3]); continue; }
    const pad = (item.line ? item.halfW : 0) + (Number.isFinite(item.feather) ? item.feather : BLOCKOUT_PAINT.feather);
    for (const p of item.poly || item.line) Grow(p.x - pad, p.z - pad, p.x + pad, p.z + pad);
  }
  if (!(maxX > minX && maxZ > minZ)) return null;
  minX -= T.padM; minZ -= T.padM; maxX += T.padM; maxZ += T.padM;
  const texelM = Math.max(T.minTexelM, Math.max(maxX - minX, maxZ - minZ) / (T.maxPx - 2));
  const width = Math.min(T.maxPx, Math.ceil((maxX - minX) / texelM) + 2), height = Math.min(T.maxPx, Math.ceil((maxZ - minZ) / texelM) + 2);
  // 像素 (i, j) 的中心 = (minX + (i − 0.5)·texelM, minZ + (j − 0.5)·texelM)：第 0 行 / 列与最后一行 / 列是空的外框
  minX -= texelM; minZ -= texelM;
  const C = new Float32Array(width * height * 3), A = new Float32Array(width * height);
  const PX = (x) => (x - minX) / texelM - 0.5, PZ = (z) => (z - minZ) / texelM - 0.5;
  const Lo = (v, n) => Math.max(1, Math.min(n - 2, Math.floor(v))), Hi = (v, n) => Math.max(1, Math.min(n - 2, Math.ceil(v)));
  const Blend = (at, rgb, a) => {
    A[at] = A[at] * (1 - a) + a;
    C[at * 3] = C[at * 3] * (1 - a) + rgb[0] * a; C[at * 3 + 1] = C[at * 3 + 1] * (1 - a) + rgb[1] * a; C[at * 3 + 2] = C[at * 3 + 2] * (1 - a) + rgb[2] * a;
  };
  const cov = new Float32Array(width * height);
  for (const item of items) {
    if (item.rects) {
      const pal = item.palette.map(HexRgb);
      for (const [x0, z0, x1, z1, c] of item.rects) {
        // 像素中心落在矩形里的那些像素：实边，整块盖上
        const i0 = Math.max(1, Math.ceil(PX(x0))), i1 = Math.min(width - 2, Math.floor(PX(x1)));
        const j0 = Math.max(1, Math.ceil(PZ(z0))), j1 = Math.min(height - 2, Math.floor(PZ(z1)));
        const rgb = pal[c];
        for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
          const at = j * width + i;
          A[at] = 1; C[at * 3] = rgb[0]; C[at * 3 + 1] = rgb[1]; C[at * 3 + 2] = rgb[2];
        }
      }
      continue;
    }
    const rgb = HexRgb(item.color);
    const feather = Number.isFinite(item.feather) ? item.feather : BLOCKOUT_PAINT.feather;
    const strength = Number.isFinite(item.strength) ? item.strength : 1;
    const Cover = (sd) => { const u = 0.5 - sd / feather; return u <= 0 ? 0 : (u >= 1 ? 1 : u * u * (3 - 2 * u)) * strength; };
    if (item.poly) {
      const pts = item.poly;
      let bx0 = Infinity, bx1 = -Infinity, bz0 = Infinity, bz1 = -Infinity;
      for (const p of pts) { bx0 = Math.min(bx0, p.x); bx1 = Math.max(bx1, p.x); bz0 = Math.min(bz0, p.z); bz1 = Math.max(bz1, p.z); }
      const i0 = Lo(PX(bx0 - feather), width), i1 = Hi(PX(bx1 + feather), width), j0 = Lo(PZ(bz0 - feather), height), j1 = Hi(PZ(bz1 + feather), height);
      // 轴对齐的矩形（四个点、边都顺着 x / z）直接算有符号距离：大片底色（扫清带、田间小路底色）不必逐边求
      const rect = pts.length === 4 && pts.every((p, k) => { const q = pts[(k + 1) % 4]; return p.x === q.x || p.z === q.z; })
        && new Set(pts.map((p) => p.x)).size === 2 && new Set(pts.map((p) => p.z)).size === 2;
      const cx = (bx0 + bx1) / 2, cz = (bz0 + bz1) / 2, hx = (bx1 - bx0) / 2, hz = (bz1 - bz0) / 2;
      const Sd = rect ? (x, z) => { const qx = Math.abs(x - cx) - hx, qz = Math.abs(z - cz) - hz; return Math.hypot(Math.max(qx, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qz), 0); }
        : (x, z) => PolySignedDistance(x, z, pts);
      for (let j = j0; j <= j1; j++) {
        const z = minZ + (j + 0.5) * texelM;
        for (let i = i0; i <= i1; i++) {
          const a = Cover(Sd(minX + (i + 0.5) * texelM, z));
          if (a > 0) Blend(j * width + i, rgb, a);
        }
      }
      continue;
    }
    // 折线：逐段在自己的外包框里算覆盖、取最大（段与段接头处不叠两遍），最后一起混
    const pts = item.line, reach = item.halfW + feather, touched = [];
    for (let k = 1; k < pts.length; k++) {
      const a0 = pts[k - 1], b0 = pts[k];
      const i0 = Lo(PX(Math.min(a0.x, b0.x) - reach), width), i1 = Hi(PX(Math.max(a0.x, b0.x) + reach), width);
      const j0 = Lo(PZ(Math.min(a0.z, b0.z) - reach), height), j1 = Hi(PZ(Math.max(a0.z, b0.z) + reach), height);
      for (let j = j0; j <= j1; j++) {
        const z = minZ + (j + 0.5) * texelM;
        for (let i = i0; i <= i1; i++) {
          const a = Cover(Math.sqrt(SegDist2(minX + (i + 0.5) * texelM, z, a0.x, a0.z, b0.x, b0.z)) - item.halfW);
          if (a <= 0) continue;
          const at = j * width + i;
          if (cov[at] === 0) touched.push(at);
          if (a > cov[at]) cov[at] = a;
        }
      }
    }
    for (const at of touched) { Blend(at, rgb, cov[at]); cov[at] = 0; }
  }
  const base = HexRgb(backdrop.ground?.color || "#808080");
  const data = new Uint8Array(width * height * 4);
  let painted = 0;
  for (let at = 0; at < width * height; at++) {
    const a = A[at];
    if (a > 1e-4) {
      painted += 1;
      for (let c = 0; c < 3; c++) data[at * 4 + c] = Math.max(0, Math.min(255, Math.round(C[at * 3 + c] / a * 255)));
      data[at * 4 + 3] = Math.max(1, Math.min(255, Math.round(a * 255)));
    } else {
      data[at * 4] = Math.round(base[0] * 255); data[at * 4 + 1] = Math.round(base[1] * 255); data[at * 4 + 2] = Math.round(base[2] * 255); data[at * 4 + 3] = 0;
    }
  }
  return { minX, minZ, texelM, width, height, data, painted };
}

/** 白盒关卡的相机远平面（米）；场景文件写了 backdrop 时取 max(这个, backdrop.far)（§2.2，2026-10-20）。 */
export const BLOCKOUT_CAMERA_FAR = 650;

/**
 * 远景层地面高（§2.2 backdrop，2026-10-20）：场地里就是场地网格；场地外离场地边 o 米处 =
 * 「边上最近那一点的场地高」往 ground.y 过渡，smoothstep(o / blendM)。接缝上两边一样高，往外慢慢落到 ground.y。
 * → (x, z) => y。纯函数（编辑器的远景地面、远景里的树、测试共用）。
 */
export function BackdropGroundSampler(backdrop, terrainSampler, bounds) {
  const g = backdrop.ground, blend = Number.isFinite(g.blendM) ? g.blendM : 0;
  const { minX, maxX, minZ, maxZ } = bounds;
  return (x, z) => {
    const cx = x < minX ? minX : x > maxX ? maxX : x, cz = z < minZ ? minZ : z > maxZ ? maxZ : z;
    const edge = terrainSampler(cx, cz);
    const o = Math.hypot(x - cx, z - cz);
    if (o <= 0) return edge;
    return edge + (g.y - edge) * BackdropBlend(o, blend);
  };
}
/** 离场地边 o 米处往远景基准（高度 / 颜色）过渡了多少：0 = 接缝上（同场地），1 = 完全是远景。 */
export function BackdropBlend(o, blendM) {
  if (!(blendM > 0)) return o > 0 ? 1 : 0;
  const t = Math.max(0, Math.min(1, o / blendM));
  return t * t * (3 - 2 * t);
}
/** 场景文件的 backdrop → 布局里用的那份（深拷贝、补缺省：blendM 0、haze null、paint / shapes []）。 */
function NormalizeBackdrop(bd) {
  if (!bd) return null;
  return {
    far: bd.far,
    ground: { color: bd.ground.color, y: bd.ground.y, radiusM: bd.ground.radiusM, blendM: Number.isFinite(bd.ground.blendM) ? bd.ground.blendM : 0 },
    haze: bd.haze ? { ...bd.haze } : null,
    paint: (bd.paint || []).map((p) => (p.rects ? { id: p.id, palette: [...p.palette], rects: p.rects } : { ...p })),
    shapes: (bd.shapes || []).map((sh) => ({ ...sh })),
  };
}

export function LayoutFromSceneDoc(doc) {
  const check = ValidateBlockoutScene(doc);
  if (!check.ok) throw new Error(`场景文件有 ${check.errors.length} 处错误：${check.errors.slice(0, 3).join("；")}`);
  const t = doc.terrain;
  const sampler = HeightGridSampler(t);
  const w = t.cols * t.cellM, d = t.rows * t.cellM;
  const ground = { x: t.minX + w / 2, z: t.minZ + d / 2, w, d, h: 1, y: -0.5, semantic: "ground" };
  // 可选 heightTint（2026-10-20）：场景文件写了就用它（坑北抬高了，色带别跟着把南面的颜色挪掉）
  const tint = doc.heightTint ? { lo: doc.heightTint.lo, hi: doc.heightTint.hi } : { lo: sampler.minY, hi: Math.max(sampler.minY + 0.5, sampler.maxY) };
  // 可选 paint（2026-10-20）：地面涂色栅格，没写就是 null
  const groundPaint = BuildGroundPaint(doc.paint, doc.bounds);
  const backdrop = NormalizeBackdrop(doc.backdrop);
  // 水块同第一关（BlockoutBlock）：盒子不画（灰盒子读不出是水，还会和水面打架），总控在顶面另铺水面
  // 可选 y（2026-10-18）：显式给了就用块中心的这个高度（架在坑上的洞顶、横木），没给就按 GroundedBlock 落地。
  const Placed = (block) => {
    const grounded = GroundedBlock(block, sampler);
    return Number.isFinite(block.y) ? { ...grounded, y: block.y } : grounded;
  };
  // 细高的 foliage 块（DeadTree_xx，脚印 ≤ BLOCKOUT_TREE_MAX_FOOT_M）是树：只留碰撞，编辑器种枯树模型（2026-10-20，同 BlockoutBlock）
  const blocks = doc.blocks.map(block => {
    const grounded = Placed(block);
    if (grounded.semantic === "water") return { ...grounded, visual: false, blockoutWater: true };
    if (IsSceneTreeBlock(grounded)) return { ...grounded, visual: false, blockoutTree: true, treeHeightM: grounded.h };
    return grounded;
  });
  // 随信号出现 / 消失的体块（塌洞、坑沿被炸、战车残骸）：走 FirstLevelWhiteboxField 现成的 gate（signal / appearSignal）。
  const gates = (doc.gates || []).map(gate => ({
    ...Placed(gate),
    ...(gate.signal ? { signal: gate.signal } : {}),
    ...(gate.appearSignal ? { appearSignal: gate.appearSignal } : {}),
  }));
  return {
    id: `Blockout${doc.level}`,
    level: doc.level,
    legend: false,
    fortifications: false,
    materialLooks: false,
    railway: null,
    terrain: "P012Heightfield",
    terrainSpec: null,
    terrainSampler: sampler,
    SampleGroundColor: groundPaint
      ? (x, z) => { const rgb = BlockoutTintColor(sampler(x, z), tint); groundPaint.Blend(x, z, rgb); return rgb; }
      : (x, z) => BlockoutTintColor(sampler(x, z), tint),
    SampleGroundSurface: null,
    heightTint: tint,
    groundPaint,
    colorSemantics: Array.isArray(doc.colorSemantics) ? [...doc.colorSemantics] : [],
    paint: groundPaint ? doc.paint.map((p) => ({ ...p })) : [],
    // 可选 backdrop（2026-10-20）：远景层，只看不走——不进 blocks / gates（不碰撞、不进寻路），bounds 不变（玩家走不出去）；
    // 编辑器按它画远景（Script_EditorBlockoutBackdrop），相机远平面拉到 cameraFar。没写 = null，cameraFar 照旧。
    backdrop,
    backdropGroundAt: backdrop ? BackdropGroundSampler(backdrop, sampler, doc.bounds) : null,
    cameraFar: backdrop ? Math.max(BLOCKOUT_CAMERA_FAR, backdrop.far) : BLOCKOUT_CAMERA_FAR,
    bounds: { ...doc.bounds },
    ground,
    // 可选 semanticColors（2026-10-20）：场景文件改的几种块色盖在第一关那张表上
    semanticColors: { ...MISSION_LAYOUT.semanticColors,
      ...Object.fromEntries(Object.entries(doc.semanticColors || {}).map(([k, v]) => [k, parseInt(v.slice(1), 16)])) },
    semanticSurfaces: { ...(MISSION_LAYOUT.semanticSurfaces || {}) },
    blocks,
    gates,
    hideOpenGates: true,
    walkableSurfaces: [],
    scenario: null,
    trenchPlacements: [],
    zones: [],
    spawn: { x: doc.spawn.x, z: doc.spawn.z, yawDeg: Number.isFinite(doc.spawn.yawDeg) ? doc.spawn.yawDeg : 0 },
    ways: {
      roads: (doc.ways?.roads || []).map(line => line.map(p => ({ x: p.x, z: p.z }))),
      trenches: (doc.ways?.trenches || []).map(line => line.map(p => ({ x: p.x, z: p.z }))),
    },
  };
}

// ---------------------------------------------------------------------------
// phase

const BLOCKOUT_SKY = "firstLevelBattleDay";
const LOADOUT = Object.freeze({ primary: "HanYang", secondary: null, melee: "Dadao", throwables: Object.freeze({ Grenade: 3 }), spareClips: 12 });
// 文件场景在场景文件读进来之前的占位范围与出生点（注册表 scene.placeholder）；Prepare 读完场景后改成文件里的。
const FILE_SCENE_PLACEHOLDER = Object.freeze({ bounds: { minX: 400, maxX: 640, minZ: -250, maxZ: 60 }, spawn: { x: 470, z: -65, yawDeg: -90 } });

function SpawnFrom(point) {
  return { x: point.x, z: point.z, ry: (Number.isFinite(point.yawDeg) ? point.yawDeg : 0) * Math.PI / 180 };
}

/** 目标圈半径 0：玩家永远「走不到」，目标链不前进（关卡本来也是钉住的）。 */
function ZonesFor(label, spawn) {
  return [{ id: "Blockout", name: label, x: spawn.x, z: spawn.z, radius: 0, index: 0 }];
}

/** 把场景布局装进 phase（文件场景在 Prepare 里调）。 */
function ApplyLayout(phase, layout) {
  phase.whitebox.layout = layout;
  // 远景层要的远平面（Script_Main 在 BuildField 之后按 phase.cameraFar 设相机）；没有远景层的关卡照旧 650
  phase.cameraFar = Number.isFinite(layout.cameraFar) ? layout.cameraFar : BLOCKOUT_CAMERA_FAR;
  phase.bounds = { ...layout.bounds };
  if (layout.spawn) phase.spawn = SpawnFrom(layout.spawn);
  phase.zones = ZonesFor(phase.label, phase.spawn);
}

export function MakeBlockoutPhase(level) {
  const firstLevel = level.scene.kind === "firstLevelMission";
  const placeholder = level.scene.placeholder || FILE_SCENE_PLACEHOLDER;
  const bounds = firstLevel ? { ...MISSION_LAYOUT.bounds } : { ...placeholder.bounds };
  const spawn = firstLevel ? { x: MISSION_ANCHORS.bunker.x, z: MISSION_ANCHORS.bunker.z, ry: 0 } : SpawnFrom(placeholder.spawn);
  const phase = {
    id: `Blockout_${level.key}`,
    label: level.label,
    date: "",
    blockout: null,
    sandbox: true,
    ambientAircraft: false,
    sky: BLOCKOUT_SKY,
    ambience: null,
    music: null,
    minutes: 600,
    cutsceneIn: null,
    cutsceneOut: null,
    brief: [],
    bounds,
    spawn,
    zones: ZonesFor(level.label, spawn),
    objectives: [level.label],
    nraPool: 9999,
    ijaPool: 0,
    ijaPressure: 0,
    ijaSpawn: [],
    ijaSupport: [],
    hud: { objectiveMarkers: false },
    loadoutOverride: { ...LOADOUT, throwables: { ...LOADOUT.throwables } },
    cameraFar: BLOCKOUT_CAMERA_FAR,
    whitebox: { layout: null, blockout: true, actorCapacity: 160 },
  };
  phase.blockout = {
    key: level.key,
    configUrl: level.configUrl,
    scene: level.scene,
    sceneError: null,
    /** BuildField 在 new World(...) 之前 await 它。第一关立即返回；文件场景在这里读场景文件。 */
    async Prepare() {
      if (firstLevel) {
        if (!phase.whitebox.layout) ApplyLayout(phase, DeriveFirstLevelBlockoutLayout());
        return phase.whitebox.layout;
      }
      // 每次进关都重读：场景文件可能被场景编辑器 / 人 / agent 改过。读不到时退回上一次的布局（若有）。
      try {
        const response = await globalThis.fetch(`${level.scene.url}?t=${Date.now()}`, { cache: "no-store" });
        if (!response.ok) throw new Error(`场景文件读不到（HTTP ${response.status}）`);
        let doc;
        try { doc = await response.json(); } catch (error) { throw new Error("场景文件不是 JSON"); }
        if (level.scene.kind === "scene") {
          const heightUrl = new URL(doc?.terrain?.file || "", new URL(level.scene.url, globalThis.location?.href)).href;
          const heightResponse = await globalThis.fetch(`${heightUrl}?t=${Date.now()}`, { cache: "no-store" });
          if (!heightResponse.ok) throw new Error(`高度图读不到（HTTP ${heightResponse.status}）`);
          doc = BlockoutSliceDoc(level, doc, DecodeSceneHeights(await heightResponse.arrayBuffer(), doc.terrain));
        }
        ApplyLayout(phase, LayoutFromSceneDoc(doc));
        phase.blockout.sceneError = null;
      } catch (error) {
        phase.blockout.sceneError = String(error?.message || error);
        if (!phase.whitebox.layout) ApplyLayout(phase, EmptySceneLayout(phase));
      }
      return phase.whitebox.layout;
    },
  };
  return phase;
}

/** 场景（kind "scene"）+ 整张高度图 → 这一关那一块的白盒场景形状（同 Blockout/<Level>.scene.json）。node 测试也用它。 */
export function BlockoutSliceDoc(level, sceneDoc, heights) {
  const spec = level.scene;
  return BlockoutDocFromScene(sceneDoc, heights, {
    level: level.key, region: spec.region, spawn: spec.placeholder?.spawn, priorSignals: spec.priorSignals, futureSignals: spec.futureSignals,
    objectMarginM: spec.objectMarginM,
    ...(spec.heightTint !== undefined ? { heightTint: spec.heightTint } : {}),
  });
}

/** 场景文件坏了也要有一片能站人的平地（配置错了仍能走场景）。 */
function EmptySceneLayout(phase) {
  const b = phase.bounds, cellM = 2;
  const cols = Math.max(1, Math.ceil((b.maxX - b.minX) / cellM)), rows = Math.max(1, Math.ceil((b.maxZ - b.minZ) / cellM));
  const heights = new Float32Array((cols + 1) * (rows + 1));
  const sampler = HeightGridSampler({ minX: b.minX, minZ: b.minZ, cellM, cols, rows, heights });
  const w = cols * cellM, d = rows * cellM;
  return {
    id: `Blockout${phase.blockout.key}Empty`, legend: false, fortifications: false, materialLooks: false, railway: null,
    terrain: "P012Heightfield", terrainSpec: null, terrainSampler: sampler,
    SampleGroundColor: () => [...BLOCKOUT_TINT_STOPS.mid], SampleGroundSurface: null, heightTint: { lo: -1, hi: 1 },
    bounds: { ...b }, ground: { x: b.minX + w / 2, z: b.minZ + d / 2, w, d, h: 1, y: -0.5, semantic: "ground" },
    semanticColors: { ...MISSION_LAYOUT.semanticColors }, semanticSurfaces: {}, blocks: [], gates: [], walkableSurfaces: [],
    scenario: null, trenchPlacements: [], zones: [], spawn: null, ways: { roads: [], trenches: [] },
  };
}

/** 模块求值时建好；phase 对象本身可改（文件场景在 Prepare 里填布局）。 */
export const BLOCKOUT_PHASES = Object.freeze(BLOCKOUT_LEVELS.map(MakeBlockoutPhase));

/** 没写 ?level=（或写错）时进哪一关：新剧本 01–05（2026-10-20 用户：白盒工具默认开新剧本，不开旧版）。 */
export const BLOCKOUT_DEFAULT_LEVEL = "FirstLevel0105";

export function BlockoutLevelIndex(key) {
  // ?level= 也认菜单行 id（FirstLevel1218_15 → FirstLevel1218 那片场地）
  const levelKey = BlockoutMenuRow(key)?.key ?? key;
  const index = BLOCKOUT_LEVELS.findIndex(level => level.key === levelKey);
  return index >= 0 ? index : Math.max(0, BLOCKOUT_LEVELS.findIndex(level => level.key === BLOCKOUT_DEFAULT_LEVEL));
}

/** 关卡的水块（第一关北沙河等）；总控用它铺水面。 */
export function BlockoutWaterBlocks(layout) {
  return (layout?.blocks || []).filter(block => block.blockoutWater || block.semantic === "water");
}

/** 俯视图要的场景描述（§4.1 BlockoutMap.SetScene 的入参，不含 levelKey）。 */
export function BlockoutMapScene(layout, groundAt) {
  const firstLevel = layout?.id === "BlockoutFirstLevel";
  return {
    bounds: { ...(layout?.bounds || { minX: 0, maxX: 1, minZ: 0, maxZ: 1 }) },
    blocks: (layout?.blocks || []).map(b => ({ id: b.id, x: b.x, z: b.z, w: b.w, d: b.d, h: b.h, ry: b.ry || 0,
      semantic: b.blockoutWater ? "water" : b.semantic, solid: b.solid !== false, tag: b.tag })),
    sampleHeight: groundAt || layout?.terrainSampler || (() => 0),
    naturalHeight: firstLevel ? SampleMissionNaturalHeight : null,
    ways: firstLevel ? FirstLevelBlockoutWays() : (layout?.ways || { roads: [], trenches: [] }),
    paint: layout?.paint || [],
  };
}
