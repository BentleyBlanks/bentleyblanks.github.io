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
import { BlockoutDocFromScene, ValidateScene } from "./Script_SceneDoc.mjs";
import { FetchResolvedScene } from "./Script_SceneInherit.mjs";
import { SCENE_GROUND_CLASSES, SCENE_GROUND_SURFACE } from "./Data_SceneGroundLayers.mjs";
import { TERRAIN_RUTS } from "./Data_Tuning_Terrain.mjs";
import {
  EncounterFarmlandForScene, CompileFarmlandFieldGrid, SampleFarmlandStrip, BuildRoadSplatRaster, PaintMacroTintFor, TrenchClearingPaintItems,
} from "./Script_EncounterFarmland.mjs";
import { BeishaheGeoContext, SampleBeishaheOuterHeight } from "./Script_BeishaheGeography.mjs";
import { PrepareSceneTerrain } from "./Script_SceneTrenches.mjs";
import { CompileSceneCraterField } from "./Script_SceneCraters.mjs";
import { PlanTrenchDressing } from "./Script_TrenchPlan.mjs";
import { SCENE_ASSETS } from "./Data_SceneAssets.mjs";
import {
  BLOCKOUT_PAINT, BLOCKOUT_BACKDROP_TEXTURE, HexRgb,
  BuildGroundPaint, HydrateGroundPaint, RasterizeBackdropPaint,
} from "./Script_GroundPaint.mjs";
export { BLOCKOUT_PAINT, BLOCKOUT_BACKDROP_TEXTURE, BuildGroundPaint, HydrateGroundPaint, RasterizeBackdropPaint };

// 2026-10-31：第一关新剧本三段（01–05 / 06–10 / 11–18）共用一个场景 Scenes/FirstLevelWhitebox（docs/Data_Scene.md），
// 每段按原来的场地范围取一块来建场；后面的段落把前面段落出现过的信号都当已经发生（塌了的还塌着、开了的门还开着）。
const FIRST_LEVEL_WHITEBOX_SCENE = "./Scenes/FirstLevelWhitebox/Scene_FirstLevelWhitebox.json";
// 2026-11-01：第一关的正式场景（照白盒布局复制、换现行第一关的外观与道具模型，之后单独打磨）。编辑与预演跑白盒，试玩跑它（§17）；11-09 新剧本的关卡不写 playUrl，试玩与预演同在白盒场景。
const FIRST_LEVEL_FORMAL_SCENE = "./Scenes/FirstLevel/Scene_FirstLevel.json";
// Stage0105Done：01–05 演完。那圈「玩家出不了沟」的空气墙（KeepIn_*）随它消失，后两段不挡人；01–05 里它不会发生（futureSignals）
const STAGE_0105_DONE = "Stage0105Done";
const SIGNALS_0105 = Object.freeze(["DugoutCollapsed", "PitShelled", "TankDisabled", STAGE_0105_DONE]);
const SIGNALS_0610 = Object.freeze(["CartDeparted", "CellarBlast", "SideGateOpen", "EastGateBurst", "MgSilenced", "NorthYardGatesBroken", "BarrageHit", "LaneWallCollapse"]);
function WhiteboxSceneSlice(region, spawn, priorSignals, heightTint, objectMarginM = 1, futureSignals = [], playUrl = FIRST_LEVEL_FORMAL_SCENE) {
  return Object.freeze({ kind: "scene", url: FIRST_LEVEL_WHITEBOX_SCENE, ...(playUrl ? { playUrl } : {}), region: Object.freeze(region), priorSignals: Object.freeze([...priorSignals]),
    futureSignals: Object.freeze([...futureSignals]), ...(heightTint !== undefined ? { heightTint } : {}), objectMarginM,
    placeholder: Object.freeze({ bounds: region, spawn }) });
}

// 新旧标记（2026-10-19，用户看着旧版第一关以为是新做的）：era 分 "rewrite"（11-09 新剧本）/ "superseded"（10 月稿，已被新剧本取代）/ "legacy"（游戏里现行的旧版）/
// "draft"（空间草稿）；badge 是关卡名前的小标，note 是下拉里的一行说明，short 是旧版提示条上跳转按钮的短名。
// 数组顺序别动：levelIndex 同时索引 BLOCKOUT_PHASES，下拉里的分组顺序由界面自己排。
export const BLOCKOUT_LEVELS = Object.freeze([
  Object.freeze({ key: "FirstLevel", label: "第一关 · 往南的路", configUrl: "./Blockout/FirstLevel.json",
    era: "legacy", badge: "旧版", note: "游戏里现行的第一关（旧剧本：老周、破墙机枪、拔刀军官）；新剧本（11-09 稿）现有 01–07；10 月稿四段在下面",
    scene: Object.freeze({ kind: "firstLevelMission" }) }),
  Object.freeze({ key: "SecondLevel", label: "第二关 · 手榴弹雨（空间草稿）", configUrl: "./Blockout/SecondLevel.json",
    era: "draft", badge: "草稿", note: "第二关的空间草稿",
    scene: Object.freeze({ kind: "file", url: "./Blockout/SecondLevel.scene.json",
      placeholder: Object.freeze({ bounds: { minX: 400, maxX: 640, minZ: -250, maxZ: 60 }, spawn: { x: 470, z: -65, yawDeg: -90 } }) }) }),
  // 2026-10-18：按 Notion 定稿的 01–05（空间拓扑关系）新建的独立场地，坐标原点在沟口；不碰游戏里的第一关
  Object.freeze({ key: "FirstLevel0105", label: "第一关 01–05 · 撤退（10月稿）", configUrl: "./Blockout/FirstLevel0105.json",
    era: "superseded", badge: "10月稿", short: "01–05", note: "01–05：防炮洞 → 支沟拖冬瓜 → 集结处 → 机枪坑 → 路口板桥（10-18 剧本）",
    scene: WhiteboxSceneSlice({ minX: -110, maxX: 320, minZ: -480, maxZ: 200 }, { x: 66.5, z: 64.2, yawDeg: 90 }, [], undefined, 1, [STAGE_0105_DONE]) }),
  // 2026-10-18：06–10 新剧本（干沟 → 凹路 → 耿家庄），与 0105 同一套坐标、另一片场地；锚点 Data_EditorBlockoutFirstLevel0610Space
  Object.freeze({ key: "FirstLevel0610", label: "第一关 06–10 · 耿家庄（10月稿）", configUrl: "./Blockout/FirstLevel0610.json",
    era: "superseded", badge: "10月稿", short: "06–10", note: "06–10：干沟 → 凹路 → 耿家庄（10-19 剧本）",
    scene: WhiteboxSceneSlice({ minX: -20, maxX: 320, minZ: 120, maxZ: 560 }, { x: 35, z: 147, yawDeg: -90 }, SIGNALS_0105, null) }),
  // 2026-10-19：12–18 新剧本，与 0610 同一套坐标；锚点 Data_EditorBlockoutFirstLevel1218Space。2026-10-23 按 11–14 改稿重做、把 11 也放进来（11 出村 → 石板桥 → 空袭 → 渡口 → 北门），关卡键不变
  // 2026-10-25：Notion 剧本第一关分四大段，11–14 与 15–18 一路连着走、共用这一片场地，下拉里按 parts 拆成两行（见 BLOCKOUT_MENU）
  // 2026-10-26：第三版（北沙河村）：出村 → 土路 → 官道 → 村口沟与板桥 → 北沙河村 → 铁路桥过沙河 → 北门
  // 2026-11-02：第四版（契约 tmp/Contract1218_v4.md）：官道斜穿村子当主街、北中南三条街、南街口望官道桥（二营炸了它）、出村小路 → 北岸土路 → 李子行 → 铁路桥 → 南岸路（没有北门、村西口）；
  //   场地 x −160…320、z 480…1080（Script_SceneRebuild1218 把两份场景的 11–18 南片重建、高度图加长）
  Object.freeze({ key: "FirstLevel1218", label: "第一关 11–18 · 北沙河村与铁路桥（10月稿）", configUrl: "./Blockout/FirstLevel1218.json",
    era: "superseded", badge: "10月稿", short: "11–18", note: "11–18：出村 → 官道 → 村口沟 → 北沙河村 → 空袭 → 救护所 → 北岸土路 → 铁路桥 → 南岸路（11-02 第四版）",
    parts: Object.freeze([
      Object.freeze({ id: "FirstLevel1218", from: "11-1", label: "第一关 11–14 · 转运与空袭（10月稿）", short: "11–14",
        note: "11–14：出村 → 进北沙河村 → 沟口顶住追兵 → 空袭 → 救护所院里松手（11-02 第四版）" }),
      Object.freeze({ id: "FirstLevel1218_15", from: "15-1", label: "第一关 15–18 · 冬瓜之死与炸桥（10月稿）", short: "15–18",
        note: "15–18：洞里 → 厢房门口 → 门槛 → 出村小路、北岸土路 → 撤过铁路桥、炸桥 → 南岸路往县城（与 11–14 同一片场地）" }),
    ]),
    scene: WhiteboxSceneSlice({ minX: -160, maxX: 320, minZ: 480, maxZ: 1080 }, { x: 117, z: 547.4, yawDeg: 180 }, [...SIGNALS_0105, ...SIGNALS_0610], null, 64) }),
  // 2026-11-09：第一关新剧本 01–07（撤退与凹路）：防炮洞 → 支沟刺刀 → 拖冬瓜 → 干沟集结处 → 凹路 → 坦克车伏击 → 喘口气，
  //   一个场地从本班机枪坑一直取到耿家庄村口路沟；位置来自空间图生成器（docs/Data_EditorBlockout.md §19）。
  //   Stage0105Done 当已发生：01–05 那圈出不了沟的空气墙把干沟口堵死，这一关要走出去。
  Object.freeze({ key: "FirstLevel0107", label: "第一关 01–07 · 撤退与凹路（新剧本）", configUrl: "./Blockout/FirstLevel0107.json",
    era: "rewrite", badge: "新剧本", short: "01–07", note: "01–07：防炮洞 → 刺刀 → 拖冬瓜 → 干沟集结处 → 凹路 → 坦克车伏击 → 喘口气（11-09 新剧本）",
    scene: WhiteboxSceneSlice({ minX: -40, maxX: 320, minZ: -40, maxZ: 460 }, { x: 66.5, z: 64.2, yawDeg: 90 }, [STAGE_0105_DONE], undefined, 1, [], null) }),
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

/** 场景 heightTint 可另给 low / mid / high / slope 色标（"#rrggbb"，sRGB）；没给的沿用 BLOCKOUT_TINT_STOPS。 */
export const BLOCKOUT_TINT_KEYS = Object.freeze(["low", "mid", "high", "slope"]);
const tintStops = new WeakMap();
export function BlockoutTintStops(tint) {
  if (!tint || !BLOCKOUT_TINT_KEYS.some((key) => tint[key])) return BLOCKOUT_TINT_STOPS;
  let stops = tintStops.get(tint);
  if (!stops) {
    stops = Object.fromEntries(BLOCKOUT_TINT_KEYS.map((key) => [key, tint[key] ? HexRgb(tint[key]) : BLOCKOUT_TINT_STOPS[key] || null]));
    tintStops.set(tint, stops);
  }
  return stops;
}

/**
 * 陡坡色：heightTint.slope 给了才生效。坡度（每米升高）在 slopeRange [起, 满] 之间由色带色渐变到 slope 色，
 * 沟岸、坡面和平地、路面分得开（2026-11-23 Encounter 场景）。改写 rgb，返回它。
 */
export function BlockoutSlopeTint(sampler, x, z, tint, rgb) {
  const slope = BlockoutTintStops(tint).slope;
  if (!slope) return rgb;
  const [from, to] = tint.slopeRange || [0.3, 0.9];
  const g = Math.hypot(sampler(x + 0.5, z) - sampler(x - 0.5, z), sampler(x, z + 0.5) - sampler(x, z - 0.5));
  const k = Math.max(0, Math.min(1, (g - from) / Math.max(1e-3, to - from)));
  const s = k * k * (3 - 2 * k);
  for (let i = 0; i < 3; i++) rgb[i] += (slope[i] - rgb[i]) * s;
  return rgb;
}

/** 高度 → sRGB 三元组（写进 out）。 */
export function BlockoutTintColor(y, tint, out = [0, 0, 0]) {
  const stops = BlockoutTintStops(tint);
  const span = Math.max(0.5, tint.hi - tint.lo);
  const t = Math.max(0, Math.min(1, (y - tint.lo) / span));
  const a = t < 0.5 ? stops.low : stops.mid;
  const b = t < 0.5 ? stops.mid : stops.high;
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
    if (Math.abs(a - e) < Math.abs(b - c)) return u >= v ? a + (b - a) * u + (e - b) * v : a + (e - c) * u + (c - a) * v;
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
    y: (block.propConformGround ? groundAt(block.x, block.z) : lowest) + block.h / 2,
    semantic: block.semantic, tag: block.tag || "whiteboxWall",
    solid: block.solid !== false,
    ...(block.cover ? { cover: { ...block.cover } } : {}),
    ...(block.visual === false ? { visual: false } : {}),
    // 2026-10-21：不能攀（翻越 / 攀爬在它上面不触发，Script_Player.ProbeVault）
    ...(block.noClimb === true ? { noClimb: true } : {}),
    // 2026-10-26：架空桥面上的走道（BlockStandSampler 对它不限 1 m 台阶，演员站得上去；§5.6）
    ...(block.standOn === true ? { standOn: true } : {}),
    // 2026-11-01：正式场景（docs/Data_Scene.md §8）的道具模型（铺几件）、树
    ...(block.propModel ? { propModel: block.propModel } : {}),
    ...(block.propTile ? { propTile: [...block.propTile] } : {}),
    ...(block.propAuthoredGrounding ? { propAuthoredGrounding: true } : {}),
    ...(block.propConformGround ? { propConformGround: true } : {}),
    ...(block.sceneTree ? { sceneTree: true } : {}),
    ...(block.semantic === "water" && block.waterRibbon ? { waterRibbon: block.waterRibbon } : {}),
    ...(typeof block.color === "string" ? { color: block.color } : {}),
    ...(typeof block.libraryMaterial === "string" ? { libraryMaterial: block.libraryMaterial } : {}),
    ...(Number.isFinite(block.roughness) ? { roughness: block.roughness } : {}),
    ...(Number.isFinite(block.metalness) ? { metalness: block.metalness } : {}),
    ...(typeof block.sector === "string" ? { sector: block.sector } : {}),
    ...(typeof block.surface === "string" ? { surface: block.surface } : {}),
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

// BuildGroundPaint / HydrateGroundPaint / RasterizeBackdropPaint 已拆到纯模块 Script_GroundPaint.mjs 并于文件头重导出。

/**
 * 正式场景的分层地表（docs/Data_Scene.md §8，2026-11-01）：涂色按 id 归层（Data_SceneGroundLayers），
 * 路的折线踩实成车道，沟的折线与陡坡是翻土。返回 FirstLevelWhiteboxField 吃的 SampleGroundSurface(x, z, color, layers)：
 * layers = [车道, 翻土, 草茬, 车辙横坐标（1 = 没有）]，color 是反照率倍率（这里恒为 1）。
 */
export function BuildSceneGroundSurface(doc, sampler) {
  const S = SCENE_GROUND_SURFACE;
  const sceneId = doc.scene || doc.id || "";
  const isEncounter = sceneId === "FirstLevelEncounter" || sceneId === "FirstLevelMerged";
  const farmlandData = isEncounter ? EncounterFarmlandForScene(sceneId, doc.bounds?.maxZ ?? 1440) : null;
  const farmland = farmlandData ? CompileFarmlandFieldGrid(farmlandData.fields, farmlandData.fieldZones) : null;

  const Weights = (id) => {
    const hit = SCENE_GROUND_CLASSES.find((c) => c.match.test(String(id || "")));
    return hit ? [hit.track || 0, hit.spoil || 0, hit.soil || 0] : null;
  };
  const items = [];
  for (const item of doc.paint || []) {
    const rgb = Weights(item.id);
    if (rgb && (item.poly || item.line)) items.push({ ...item, rgb });
  }
  const hasRibbons = Array.isArray(doc.ways?.roadRibbons) && doc.ways.roadRibbons.length > 0;
  if (!isEncounter && !hasRibbons) {
    for (const line of doc.ways?.roads || []) {
      if (line.length >= 2) items.push({ line, halfW: S.road.halfW, feather: S.road.feather, rgb: [S.road.track, 0, 0] });
    }
  }
  const trenchClear = isEncounter ? TrenchClearingPaintItems(doc.trenchPlan?.trenches || doc.trenches?.segments || [], doc.paint) : null;
  if (trenchClear) items.push(...trenchClear.splatItems);
  for (const line of doc.ways?.trenches || []) {
    if (line.length >= 2) items.push({ line, halfW: S.trench.halfW, feather: S.trench.feather, rgb: [0, 1, 0] });
  }
  const cellM = Number.isFinite(doc.groundPaintCellM) ? Math.max(0.25, Math.min(S.cellM, doc.groundPaintCellM)) : S.cellM;
  const raster = items.length ? BuildGroundPaint(items, doc.bounds, { cellM, maxCells: S.maxCells }) : null;

  // 遭遇场景与带样条路网的场景：统一走 BuildRoadSplatRaster，获得分级路宽 + 片元级解析车辙横向坐标。
  let roadSplat = null;
  if (isEncounter || hasRibbons) {
    const roadEntries = [];
    for (const [idx, line] of (doc.ways?.roads || []).entries()) {
      if (Array.isArray(line) && line.length >= 2) {
        roadEntries.push({
          id: `WayRoad_${idx}`, kind: "guandao", width: 4.0,
          points: line.map((p) => (Array.isArray(p) ? [p[0], p[1]] : [p.x, p.z])),
        });
      }
    }
    const footpaths = [];
    for (const r of doc.ways?.roadRibbons || []) {
      if (!Array.isArray(r.points) || r.points.length < 2) continue;
      const pts = r.points.map((p) => (Array.isArray(p) ? [p[0], p[1]] : [p.x, p.z]));
      if (r.kind === "footpath") footpaths.push(pts);
      else roadEntries.push({ id: r.id, kind: r.kind || "villageStreet", width: r.width || 3.2, widthJitter: r.widthJitter, points: pts });
    }
    if (roadEntries.length || footpaths.length) {
      roadSplat = BuildRoadSplatRaster(roadEntries, footpaths, [], doc.bounds, {
        cellM: isEncounter ? 0.5 : cellM, maxCells: 4000000, encodeRangeM: TERRAIN_RUTS.encodeRangeM,
      });
    }
  }

  const tintItems = (doc.paint || []).flatMap((item) => {
    if (!item.poly && !item.line) return [];
    const explicit = typeof item.tint === "string" && /^#[0-9a-f]{6}$/i.test(item.tint) ? HexRgb(item.tint) : item.tint;
    const rgb = Array.isArray(explicit) && explicit.length === 3 && explicit.every((value) => Number.isFinite(value) && value >= 0 && value <= 2)
      ? explicit : (isEncounter ? PaintMacroTintFor(item) : null);
    return rgb ? [{ ...item, rgb }] : [];
  });
  if (trenchClear) tintItems.push(...trenchClear.tintItems);
  const tint = tintItems.length ? BuildGroundPaint(tintItems, doc.bounds, { cellM, maxCells: S.maxCells }) : null;
  const w = [0, 0, 0], rs = [0, 1], cs = [0, 0, 0, 0], step = S.slope.stepM, span = S.slope.to - S.slope.from;
  // 场景壕沟：翻土层跟着样条的实际沟沿走，沿弃土垄再铺一层（同现行第一关 SampleMissionTerrain 那一段）
  const plan = doc.trenchPlan || null;
  const craterField = doc.craterField || (doc.craters?.length ? CompileSceneCraterField(doc.craters) : null);
  return (x, z, color = [1, 1, 1], layers = [0, 0, 1, 1]) => {
    let track = 0, spoil = 0, stubble = 1;
    color[0] = 1; color[1] = 1; color[2] = 1;

    if (farmland) {
      const strip = SampleFarmlandStrip(farmland, x, z);
      if (strip) {
        const p = strip.preset;
        track = p.track; spoil = p.spoil; stubble = p.stubble;
        color[0] = p.tint[0]; color[1] = p.tint[1]; color[2] = p.tint[2];
      } else {
        stubble = 0.58;
      }
    }

    if (raster) {
      w[0] = 0; w[1] = 0; w[2] = 0;
      const a = raster.Blend(x, z, w);
      if (a > 1e-4) {
        if (farmland) {
          const invA = 1 / a;
          const pTrack = w[0] * invA, pSpoil = w[1] * invA, pSoil = w[2] * invA;
          track = track * (1 - a) + w[0];
          spoil = spoil * (1 - a) + w[1];
          const authoredStubble = Math.max(0, 1 - pTrack - pSpoil - pSoil);
          stubble = stubble * (1 - a) + authoredStubble * a;
        } else {
          track = w[0]; spoil = w[1];
          stubble = Math.max(0, Math.min(1, 1 - track - spoil - w[2]));
        }
      }
    }
    tint?.Blend(x, z, color);

    let rutCoord = 1;
    if (roadSplat) {
      roadSplat.Sample(x, z, rs);
      const roadTrack = rs[0];
      rutCoord = rs[1];
      if (roadTrack > 1e-3) {
        if (roadTrack > track) track = roadTrack;
        stubble *= 1 - roadTrack * 0.92;
        if (isEncounter) {
          const protect = Math.min(1, roadTrack * 1.15);
          color[0] += (1 - color[0]) * protect;
          color[1] += (1 - color[1]) * protect;
          color[2] += (1 - color[2]) * protect;
        }
      }
    }

    let earthExpose = 0;
    const corridor = plan?.Corridor(x, z);
    if (corridor) {
      const t = 1 - Math.max(0, Math.min(1, (corridor.d - corridor.halfFloor - corridor.bank * 0.5) / (corridor.bank * 0.5 + corridor.bermWidth)));
      const tt = t * t * (3 - 2 * t);
      if (tt > spoil) spoil = tt;
      if (tt > earthExpose) earthExpose = tt;
    }
    const gx = (sampler(x + step, z) - sampler(x - step, z)) / (2 * step);
    const gz = (sampler(x, z + step) - sampler(x, z - step)) / (2 * step);
    const u = Math.max(0, Math.min(1, (Math.hypot(gx, gz) - S.slope.from) / span));
    const steep = u * u * (3 - 2 * u);
    if (steep > spoil) spoil = steep;
    if (steep > earthExpose) earthExpose = steep;
    track *= 1 - steep;

    if (isEncounter && earthExpose > 0.1) {
      const protect = Math.max(0, Math.min(1, (earthExpose - 0.1) * 1.25));
      color[0] += (1 - color[0]) * protect;
      color[1] += (1 - color[1]) * protect;
      color[2] += (1 - color[2]) * protect;
    }

    if (craterField) {
      craterField.SampleSurface(x, z, cs);
      const cWear = cs[1];
      if (cWear > 0.02) {
        // 静态弹坑剥离田间草茬与硬路面，露出翻土/焦土，并中和田块偏绿的顶点色避免焦土发绿
        stubble *= 1 - Math.min(1, cWear * 1.35);
        track *= 1 - Math.min(1, cWear * 0.9);
        if (cWear > spoil) spoil = cWear;
        if (isEncounter) {
          const neutralMix = Math.min(1, cWear * 1.25);
          color[0] += (1 - color[0]) * neutralMix;
          color[1] += (1 - color[1]) * neutralMix;
          color[2] += (1 - color[2]) * neutralMix;
        }
      }
    }

    layers[0] = Math.max(0, Math.min(1, track));
    layers[1] = Math.max(0, Math.min(1, spoil));
    layers[2] = Math.max(0, Math.min(1, farmland ? stubble : Math.min(stubble, 1 - track - spoil)));
    layers[3] = rutCoord;
    return color;
  };
}

// RasterizeBackdropPaint / BLOCKOUT_BACKDROP_TEXTURE 已拆到 Script_GroundPaint.mjs 并于文件头重导出。

/** 白盒关卡的相机远平面（米）；场景文件写了 backdrop 时取 max(这个, backdrop.far)（§2.2，2026-10-20）。 */
export const BLOCKOUT_CAMERA_FAR = 650;

/**
 * 远景层地面高（§2.2 backdrop，2026-10-20）：场地里就是场地网格；场地外离场地边 o 米处 =
 * 「边上最近那一点的场地高」往 ground.y 过渡，smoothstep(o / blendM)。接缝上两边一样高，往外慢慢落到 ground.y。
 * → (x, z) => y。纯函数（编辑器的远景地面、远景里的树、测试共用）。
 */
export function BackdropGroundSampler(backdrop, terrainSampler, bounds, sceneId = "") {
  const g = backdrop.ground, blend = Number.isFinite(g.blendM) ? g.blendM : 0;
  const { minX, maxX, minZ, maxZ } = bounds;
  const geoCtx = BeishaheGeoContext(sceneId, bounds);
  return (x, z) => {
    const cx = x < minX ? minX : x > maxX ? maxX : x, cz = z < minZ ? minZ : z > maxZ ? maxZ : z;
    const edge = terrainSampler(cx, cz);
    const o = Math.hypot(x - cx, z - cz);
    if (o <= 0) return edge;
    if (geoCtx) return SampleBeishaheOuterHeight(x, z, edge, o, geoCtx);
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

/**
 * 场景壕沟的构件 → 体块。护壁、踏板、射击位直接是 PlanTrenchDressing 的体块；杂物（Prop/* 资产）按资产尺寸做成带 propModel
 * 的不挡人盒子（正式场景换模型）。只留落在这一块范围里的；离手摆体块太近的 PlanTrenchDressing 自己让开
 *（空气墙不算：01–05 沟沿上那一圈只挡玩家，构件照摆）。
 */
export function SceneTrenchDressing(plan, groundAt, blocks, bounds) {
  const keepOut = blocks.filter((b) => b.solid !== false && b.tag !== "airWall").map((b) => ({ x: b.x, z: b.z, w: b.w, d: b.d, ry: b.ry || 0 }));
  const dressing = PlanTrenchDressing(plan, { groundAt, keepOut });
  const inside = (p) => p.x >= bounds.minX && p.x <= bounds.maxX && p.z >= bounds.minZ && p.z <= bounds.maxZ;
  const out = dressing.blocks.filter(inside).map((b) => ({ ...b, trenchDressing: true }));
  for (const p of dressing.placements) {
    const asset = SCENE_ASSETS[p.asset];
    if (!inside(p) || asset?.kind !== "prop") continue;
    const [w, h, d] = asset.size;
    out.push({ id: p.id, x: p.x, z: p.z, w, h, d, y: groundAt(p.x, p.z) + h / 2, ry: p.ry, semantic: asset.semantic, solid: false,
      propModel: asset.model, trenchDressing: true });
  }
  return { blocks: out, stats: dressing.stats };
}

export function LayoutFromSceneDoc(doc) {
  const check = ValidateBlockoutScene(doc);
  if (!check.ok) throw new Error(`场景文件有 ${check.errors.length} 处错误：${check.errors.slice(0, 3).join("；")}`);
  const t = doc.terrain;
  const sampler = HeightGridSampler(t);
  const w = t.cols * t.cellM, d = t.rows * t.cellM;
  const ground = { x: t.minX + w / 2, z: t.minZ + d / 2, w, d, h: 1, y: -0.5, semantic: "ground" };
  // 可选 heightTint（2026-10-20）：场景文件写了就用它（坑北抬高了，色带别跟着把南面的颜色挪掉）
  const tint = doc.heightTint ? { ...doc.heightTint } : { lo: sampler.minY, hi: Math.max(sampler.minY + 0.5, sampler.maxY) };
  const formal = doc.style === "formal";
  const layeredGround = formal || !!doc.terrainLayers;
  // 可选 paint（2026-10-20）：分层地表走 BuildSceneGroundSurface，不重复构建无用的 groundPaint 栅格
  const groundPaint = layeredGround ? null : BuildGroundPaint(doc.paint, doc.bounds);
  const backdrop = NormalizeBackdrop(doc.backdrop);
  // 水块同第一关（BlockoutBlock）：盒子不画（灰盒子读不出是水，还会和水面打架），总控在顶面另铺水面
  // 可选 y（2026-10-18）：显式给了就用块中心的这个高度（架在坑上的洞顶、横木），没给就按 GroundedBlock 落地。
  const Placed = (block) => {
    const grounded = GroundedBlock(block, sampler);
    return Number.isFinite(block.y) ? { ...grounded, y: block.y } : grounded;
  };
  // 正式场景（docs/Data_Scene.md §8，2026-11-01）：道具换外部模型，地面是分层地表；体块仍是白盒灰面 + 米格线。
  // 白盒场景若在 look.terrainLayers 显式登记了图层集（如 FirstLevelEncounter / FirstLevelMerged），
  // 地面同样走分层地表贴图混合，体块保持白盒不换道具模型。
  // 细高的 foliage 块（DeadTree_xx，脚印 ≤ BLOCKOUT_TREE_MAX_FOOT_M）与场景里的 Tree/* 是树：只留碰撞，编辑器种枯树模型（2026-10-20，同 BlockoutBlock）
  const blocks = doc.blocks.map(block => {
    const grounded = Placed(block);
    if (grounded.semantic === "water") return { ...grounded, visual: false, blockoutWater: true };
    if (grounded.sceneTree || IsSceneTreeBlock(grounded)) return { ...grounded, visual: false, blockoutTree: true, treeHeightM: grounded.h };
    return grounded;
  });
  // 随信号出现 / 消失的体块（塌洞、坑沿被炸、战车残骸）：走 FirstLevelWhiteboxField 现成的 gate（signal / appearSignal）。
  const gates = (doc.gates || []).map(gate => ({
    ...Placed(gate),
    ...(gate.signal ? { signal: gate.signal } : {}),
    ...(gate.appearSignal ? { appearSignal: gate.appearSignal } : {}),
  }));
  // 可被 Timeline 动态绑定的场景物件（bindId）：跳过静态合批，单独挂入 FirstLevelWhiteboxField.bindables。
  const bindables = (doc.bindables || []).map(item => ({
    ...Placed(item),
    bindId: item.bindId,
    ...(item.signal ? { signal: item.signal } : {}),
    ...(item.appearSignal ? { appearSignal: item.appearSignal } : {}),
  }));
  // 场景壕沟的构件（护壁、踏板、射击位、杂物，Data_TrenchDetails 每段开关）：白盒、正式都摆成体块，杂物在正式场景换模型
  const trenchPlan = doc.trenchPlan || null;
  const trenchDressing = trenchPlan ? SceneTrenchDressing(trenchPlan, sampler, blocks, doc.bounds) : { blocks: [], stats: null };
  blocks.push(...trenchDressing.blocks);
  const craterField = doc.craters?.length ? CompileSceneCraterField(doc.craters) : null;
  const craterTmp = [0, 0, 0, 0];
  const ApplyCraterTint = (x, z, rgb) => {
    if (!craterField) return rgb;
    craterField.SampleSurface(x, z, craterTmp);
    const wear = craterTmp[1];
    if (wear > 0.02) {
      const scorch = craterTmp[2], water = craterTmp[3] * craterTmp[0];
      const tr = 0.36 - scorch * 0.19 - water * 0.08;
      const tg = 0.31 - scorch * 0.17 - water * 0.06;
      const tb = 0.25 - scorch * 0.14 - water * 0.02;
      const k = Math.min(0.88, wear * 0.85);
      rgb[0] += (tr - rgb[0]) * k;
      rgb[1] += (tg - rgb[1]) * k;
      rgb[2] += (tb - rgb[2]) * k;
    }
    return rgb;
  };
  const neutral = [1, 1, 1];
  return {
    id: `Blockout${doc.level}`,
    level: doc.level,
    scene: doc.scene || null,
    style: formal ? "formal" : "whitebox",
    legend: false,
    fortifications: false,
    materialLooks: false,
    railway: null,
    terrain: "P012Heightfield",
    terrainSpec: null,
    terrainSampler: sampler,
    // 分层地表：读不到贴图时退回平铺土，顶点色不再乘高度色带
    SampleGroundColor: layeredGround ? () => neutral : groundPaint
      ? (x, z) => { const rgb = BlockoutSlopeTint(sampler, x, z, tint, BlockoutTintColor(sampler(x, z), tint)); groundPaint.Blend(x, z, rgb); return ApplyCraterTint(x, z, rgb); }
      : (x, z) => ApplyCraterTint(x, z, BlockoutSlopeTint(sampler, x, z, tint, BlockoutTintColor(sampler(x, z), tint))),
    SampleGroundSurface: layeredGround ? BuildSceneGroundSurface({ ...doc, craterField }, sampler) : null,
    SampleCraterSurface: craterField ? craterField.SampleSurface : null,
    craters: craterField ? craterField.craters : [],
    // 正式场景的道具（Prop/*）：盒子只留碰撞，FirstLevelWhiteboxField 换外部模型
    sceneProps: formal ? blocks.filter((block) => block.propModel)
      .map((block) => ({ block: block.id, asset: block.propModel, ...(block.propTile ? { tile: block.propTile } : {}) })) : null,
    ...(doc.proceduralDressing === false ? { proceduralDressing: false } : {}),
    ...(doc.groundColor ? { groundColor: doc.groundColor } : {}),
    ...(doc.groundLibraryMaterial ? { groundLibraryMaterial: doc.groundLibraryMaterial } : {}),
    ...(Number.isFinite(doc.groundMarginM) ? { groundMarginM: doc.groundMarginM } : {}),
    ...(doc.groundGrid ? { groundGrid: { ...doc.groundGrid } } : {}),
    ...(Array.isArray(doc.groundTint) ? { groundTint: [...doc.groundTint] } : {}),
    ...(doc.deformableTerrain === true ? { deformableTerrain: true } : {}),
    heightTint: tint,
    groundPaint,
    colorSemantics: Array.isArray(doc.colorSemantics) ? [...doc.colorSemantics] : [],
    paint: groundPaint ? doc.paint.map((p) => ({ ...p })) : [],
    // 可选 backdrop（2026-10-20）：远景层，只看不走——不进 blocks / gates（不碰撞、不进寻路），bounds 不变（玩家走不出去）；
    // 编辑器按它画远景（Script_EditorBlockoutBackdrop），相机远平面拉到 cameraFar。没写 = null，cameraFar 照旧。
    backdrop,
    backdropGroundAt: backdrop ? BackdropGroundSampler(backdrop, sampler, doc.bounds, doc.id || doc.scene || "") : null,
    cameraFar: backdrop ? Math.max(BLOCKOUT_CAMERA_FAR, backdrop.far) : BLOCKOUT_CAMERA_FAR,
    bounds: { ...doc.bounds },
    ground: layeredGround ? { ...ground, pbr: MISSION_LAYOUT.ground.pbr, pbrOptions: { ...MISSION_LAYOUT.ground.pbrOptions },
      terrainLayers: doc.terrainLayers || MISSION_LAYOUT.ground.terrainLayers } : ground,
    // 可选 semanticColors（2026-10-20）：场景文件改的几种块色盖在第一关那张表上
    semanticColors: { ...MISSION_LAYOUT.semanticColors,
      ...Object.fromEntries(Object.entries(doc.semanticColors || {}).map(([k, v]) => [k, parseInt(v.slice(1), 16)])) },
    semanticSurfaces: { ...(MISSION_LAYOUT.semanticSurfaces || {}) },
    blocks,
    gates,
    bindables,
    hideOpenGates: true,
    walkableSurfaces: [],
    scenario: null,
    trenchPlacements: [],
    // 场景壕沟编好的网络（正式场景按它画土崖、土团、草根这些土面细节；FirstLevelWhiteboxField）与构件统计
    trenchPlan,
    trenchDressingStats: trenchDressing.stats,
    zones: [],
    spawn: { x: doc.spawn.x, z: doc.spawn.z, yawDeg: Number.isFinite(doc.spawn.yawDeg) ? doc.spawn.yawDeg : 0 },
    ...(doc.camera ? { camera: doc.camera } : {}),
    ...(doc.smokeColumns ? { smokeColumns: doc.smokeColumns } : {}),
    ...(doc.fogVolumes ? { fogVolumes: doc.fogVolumes } : {}),
    ...(doc.vehicleTracks?.length ? { vehicleTracks: doc.vehicleTracks.map((track) => structuredClone(track)) } : {}),
    ...(doc.landmarks ? { landmarks: doc.landmarks.map((marker) => ({ ...marker })) } : {}),
    ways: {
      roads: (doc.ways?.roads || []).map(line => line.map(p => ({ x: p.x, z: p.z }))),
      ...(doc.ways?.roadRibbons?.length ? {
        roadRibbons: doc.ways.roadRibbons.map((r) => ({ ...r, points: r.points.map((p) => (Array.isArray(p) ? [p[0], p[1]] : [p.x, p.z])) })),
      } : {}),
      ...(doc.ways?.railways?.length ? {
        railways: doc.ways.railways.map((r) => structuredClone(r)),
      } : {}),
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
  if (phase.blockout?.scenePreview) phase.smokeColumns = layout.smokeColumns || [];
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
    scenePreview: level.scenePreview === true,
    scene: level.scene,
    sceneError: null,
    /**
     * 这一关现在建哪个场景：edit = 白盒场景（编辑、预演）；play = 正式场景（试玩，scene.playUrl，没有就还是白盒；11-09 新剧本的关卡不写 playUrl，试玩与预演同在白盒场景）。
     * 总控改它再 JumpToLevel 整片重建（Script_EditorBlockout.UseSceneVariant）。
     */
    variant: "edit",
    SceneUrl() { return phase.blockout.variant === "play" && level.scene.playUrl ? level.scene.playUrl : level.scene.url; },
    /** BuildField 在 new World(...) 之前 await 它。第一关立即返回；文件场景在这里读场景文件。 */
    async Prepare() {
      if (firstLevel) {
        if (!phase.whitebox.layout) ApplyLayout(phase, DeriveFirstLevelBlockoutLayout());
        return phase.whitebox.layout;
      }
      // 每次进关都重读：场景文件可能被场景编辑器 / 人 / agent 改过。读不到时退回上一次的布局（若有）。
      try {
        const sceneUrl = phase.blockout.SceneUrl();
        let doc;
        if (level.scene.kind === "scene") {
          const sourceDoc = level.scene.ReadEditorScene?.();
          const resolved = await FetchResolvedScene(sceneUrl, { revalidate: true, includeHeightBytes: false, sourceDoc });
          if (level.scenePreview) {
            const result = ValidateScene(resolved.doc);
            if (!result.ok || (!level.previewCameraOptional && !resolved.doc.camera) || resolved.doc.id !== level.key) {
              throw new Error(result.errors[0] || "场景缺少已登记的预览机位");
            }
          }
          const { heights, plan } = PrepareSceneTerrain(resolved.doc, resolved.heights, resolved.datumBytes);
          doc = BlockoutSliceDoc(level, resolved.doc, heights, plan);
        } else {
          const response = await globalThis.fetch(sceneUrl, { cache: "no-cache" });
          if (!response.ok) throw new Error(`场景文件读不到（HTTP ${response.status}）`);
          try { doc = await response.json(); } catch { throw new Error("场景文件不是 JSON"); }
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

/**
 * 场景（kind "scene"）+ 整张高度图 → 这一关那一块的白盒场景形状（同 Blockout/<Level>.scene.json）。node 测试也用它。
 * heights 要是按壕沟挖好的那份，trenchPlan 是编好的壕沟网络（Script_SceneTrenches.PrepareSceneTerrain）。
 */
export function BlockoutSliceDoc(level, sceneDoc, heights, trenchPlan = null) {
  const spec = level.scene;
  return BlockoutDocFromScene(sceneDoc, heights, {
    level: level.key, region: spec.region, spawn: spec.placeholder?.spawn, priorSignals: spec.priorSignals, futureSignals: spec.futureSignals,
    objectMarginM: spec.objectMarginM, trenchPlan,
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

/** 没写 ?level=（或写错）时进哪一关：新剧本 01–07（2026-11-09；原来是 01–05，2026-10-20 用户：白盒工具默认开新剧本，不开旧版）。 */
export const BLOCKOUT_DEFAULT_LEVEL = "FirstLevel0107";

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
