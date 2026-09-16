// 场景样条PCG编辑器（原「道路样条编辑器」，2026-08-27 扩围墙后改名）：
// 把全城**沿线生成的场景元素** —— 铁路/道路/大街 + 寨墙/坝墙/石墙村 + 第一关壕沟 ——
// 按「中心线控制点」列出来，现场预览、拖点、加减点、调参，再导出誊回数据文件。
//
// ## 它编辑的是谁的数
// 路与墙的数据故意没有集中成一张新表（那会造出第二份真相）：
//   · 城内街       Data_Tengxian.STREETS（axis/at/from/to —— 测试锁死格式）
//   · 东关巷路     Data_Tengxian.EAST_SUBURB.mapLanes
//   · 西关/北关大街 Data_Tengxian.WEST_SUBURB.westStreet / NORTH_SUBURB.street
//   · 津浦铁路     Data_Tengxian.WEST_SUBURB.railway 与 OUTFIELD_SCENES[*].railway
//   · 第一关铁路   Data_FirstLevelMissionLayout.MISSION_RAILWAY（当前白盒布局的 railway spec）
//   · 城外大车路   Script_TengxianOutfield.OUTFIELD_SCENES[*].roads.points
//   · 东关寨墙     Data_Tengxian.EAST_SUBURB.zhaiWall（x/fromZ/toZ —— 轴对齐格式）
//   · 北关坝墙     Data_Tengxian.NORTH_SUBURB.stockade（z/fromX/toX —— 轴对齐格式）
//   · 石墙村圩墙   Script_TengxianOutfield.OUTFIELD_SCENES[*].villages[*]（矩形 + 外扩 8 m）
//   · 第一关壕沟   Data_FirstLevelMissionTrenches.MISSION_TRENCH_NETWORK.segments
//                  （routeBound 的段点子来自任务/AI 路线，誊回那边，不是壕沟表）
// 本面板把它们统一读成 [[x,z],...] 的控制点做预览编辑；导出的 JSON 里
// 每条路线都带着 source，说明这串点该誊回哪个文件的哪个字段。
// **轴对齐/矩形的数据誊回去时仍要保持原格式** —— 面板会在导出里对拖弯的条目标警告。
//
// ## 预览 = 真几何
// 「重建预览」调的就是游戏里铺路/砌墙那份 Script_RoadSpline / Script_WallSpline
// （同一份代码、同一个 groundAt），不是示意线 —— 围墙预览连实例化矩阵表都是
// 真的那份（变体/塌段/破口逐位一致）。预览抬 0.04 m 盖在现物上防 z-fight。
//
// ## 拼接资产 / 布设参数
// 围墙不是一条挤出来的带子，是**一个模块摆 N 次**。所以面板里另开一档：
//   · 「拼接资产」把那几只原始几何**在场里摆出来** —— 变体模块、碱脚条、
//     压顶条，外加一段按当前间隔/重叠拼起来的三块演示，缝在哪儿一眼看得见；
//   · 「布设参数」是 Script_WallSpline.WALL_PRESETS 那张表的直接滑杆：
//     模块间隔、拼接重叠、埋深、变体数、六路随机的每一路。改了立刻重建预览，
//     **建城读的也是同一份**（SetWallPresetOverride），不用改源码就能看效果。
// 预设改动同样只存 localStorage，导出的 JSON 里带 `presets` 一节，誊回
// Script_WallSpline.WALL_PRESETS 才算落地。
//
// ## 面板里的改动不落盘
// 与采样点编辑器同一条纪律：改动存 localStorage，刷新不丢；基线在源码里，
// 改完必须「导出」誊回数据文件。

import * as THREE from "three";
import {
  El, Panel, Section, ButtonRow, Chips, Slider, ListBox, Facts, Note, TextArea, Toggle,
} from "./Script_EditorUi.mjs";
import { PHASES } from "./Data_Battle.mjs";
import {
  STREETS, EAST_SUBURB, EAST_FIELD, WEST_SUBURB, NORTH_SUBURB,
} from "./Data_Tengxian.mjs";
import { OutfieldSpec } from "./Script_TengxianOutfield.mjs";
import { MakeRoadPath } from "./Script_RoadPath.mjs";
import { BuildRoadRibbon, BuildRailBed, BuildRailwayFromSpec, MakeCrownProfile } from "./Script_RoadSpline.mjs";
import {
  BuildWallSpline, WALL_PRESETS, WallPreset, SetWallPresetOverride, MakeWallAssetSet,
} from "./Script_WallSpline.mjs";
import { MakeInstanced, MakeBox, TILE_METERS } from "./Script_Geo.mjs";
import { ResolveTengxianMaterial } from "./Script_TengxianCity.mjs";
import {
  TRENCH_PRESETS, TrenchPreset, SetTrenchPresetOverride, ClearTrenchPresetOverrides,
  SetTrenchSegmentOverride, ClearTrenchSegmentOverrides, TrenchRevision,
  CompileTrenchNetwork, PlanTrenchDressing,
} from "./Script_TrenchPlan.mjs";
import {
  BuildTrenchPreview, BuildTrenchDressingPreview, TRENCH_PREVIEW_COLORS,
} from "./Script_TrenchSpline.mjs";
import { MISSION_TRENCH_NETWORK } from "./Data_FirstLevelMissionTrenches.mjs";
import { SampleMissionNaturalHeight } from "./Data_FirstLevelMissionTerrain.mjs";

const STORE_KEY = "tz1938.sceneSplines.v1";
const LEGACY_STORE_KEY = "tz1938.roadRoutes.v1";   // 改名前的道路面板存档，读得懂就迁

/** 资产台离地高度：城内院墙 2 m 上下，抬到这里背景就只剩天。 */
const ASSET_STAGE_LIFT = 13;

/** 壕沟预设在同一张存档表里的键前缀 —— 与墙预设撞名（loop/fire 这种短名太容易撞）。 */
const TRENCH_PRESET_PREFIX = "trench:";

const KIND_COLOR = {
  street: 0xd9b45a, road: 0xc9a06a, railway: 0x8fa3b8, wall: 0x9c8a68,
  trench: TRENCH_PREVIEW_COLORS.trench,
};

/**
 * 「布设参数」面板上的滑杆表。每一行 = WALL_PRESETS 里的一个字段。
 * 分两组：**拼接**（模块怎么排）与**随机**（怎么不重复），因为调它们的
 * 目的完全不同 —— 前者管缝和密度，后者管"这不是复印纸"。
 */
const WALL_PARAMS = [
  { key: "moduleLen", label: "模块间隔", min: 0.8, max: 12, step: 0.1, unit: "m", group: "拼接" },
  { key: "moduleOverlap", label: "拼接重叠", min: 0, max: 0.20, step: 0.005, unit: "×", group: "拼接" },
  { key: "embed", label: "埋深", min: 0, max: 1.2, step: 0.02, unit: "m", group: "拼接" },
  { key: "variants", label: "几何变体数", min: 1, max: 6, step: 1, unit: "份", group: "拼接" },
  { key: "geoQuantH", label: "几何量化·高", min: 0, max: 2, step: 0.25, unit: "m", group: "拼接" },
  { key: "geoQuantW", label: "几何量化·厚", min: 0, max: 0.5, step: 0.05, unit: "m", group: "拼接" },
  { key: "heightJitter", label: "高度抖动", min: 0, max: 0.4, step: 0.005, unit: "×", group: "随机" },
  { key: "heightCell", label: "高度包络档长", min: 4, max: 48, step: 1, unit: "m", group: "随机" },
  { key: "leanJitter", label: "侧倾", min: 0, max: 0.08, step: 0.001, unit: "rad", group: "随机" },
  { key: "yawJitter", label: "偏航", min: 0, max: 0.08, step: 0.001, unit: "rad", group: "随机" },
  { key: "sideJitter", label: "横向错位", min: 0, max: 0.3, step: 0.005, unit: "m", group: "随机" },
  { key: "thickJitter", label: "厚度抖动", min: 0, max: 0.3, step: 0.005, unit: "×", group: "随机" },
  { key: "tintJitter", label: "逐块色调", min: 0, max: 0.25, step: 0.005, unit: "×", group: "随机" },
  { key: "collapseChance", label: "塌段概率", min: 0, max: 0.6, step: 0.01, unit: "", group: "随机" },
  { key: "edgeCollapseChance", label: "整边塌概率", min: 0, max: 0.6, step: 0.01, unit: "", group: "随机" },
  { key: "coverEvery", label: "掩体抽稀", min: 1, max: 10, step: 1, unit: "块", group: "随机" },
  { key: "colliderMerge", label: "碰撞并段容差", min: 0, max: 1.5, step: 0.05, unit: "m", group: "随机" },
];

const PARAM_DEFAULTS = {
  moduleLen: 3.0, moduleOverlap: 0.02, embed: 0.5, variants: 4,
  geoQuantH: 0, geoQuantW: 0,
  heightJitter: 0.10, heightCell: 18, leanJitter: 0.020, yawJitter: 0.010,
  sideJitter: 0.06, thickJitter: 0.08, tintJitter: 0.06,
  collapseChance: 0, edgeCollapseChance: 0, coverEvery: 3, colliderMerge: 0,
};

/**
 * 壕沟版的「布设参数」滑杆表 —— Script_TrenchPlan.TRENCH_PRESETS 的直接映射。
 *
 * 分三组，理由与墙那张表同构但不是同一回事：
 *   · 断面 —— 这条沟长什么样（沟底多宽、坡多缓、抛土堆多高）。玩法下限住在这一组：
 *     担架过不过得去、两个人能不能并排、AI 胶囊卡不卡，都是断面的事。
 *   · 随机 —— 「这不是挖掘机挖的」。全部是**位置噪声**，所以拐角和三岔口天然连续；
 *     noiseCellM 是噪声格边长（调大 = 起伏变缓变长），不是抖动幅度。
 *   · 布设 —— 沿沟摆的那些木护壁、射击位。间隔与跳过概率决定"有多齐整"。
 *
 * 带点号的键是嵌套字段（revetment.spacingM ⇒ TRENCH_PRESETS[x].revetment.spacingM）。
 * 面板里一律按扁平点号键存改动，推给规划层前再展开成嵌套 patch（见 ExpandTrenchPatch）——
 * 存档和导出里一眼看得出改的是哪一行，不用在嵌套 JSON 里找。
 */
const TRENCH_PARAMS = [
  { key: "floorW", label: "沟底宽", min: 2.0, max: 6.0, step: 0.05, unit: "m", group: "断面" },
  { key: "bankW", label: "坡宽", min: 0.8, max: 3.0, step: 0.05, unit: "m", group: "断面" },
  { key: "bermH", label: "抛土堆高", min: 0, max: 0.8, step: 0.01, unit: "m", group: "断面" },
  { key: "bermW", label: "抛土堆宽", min: 0.6, max: 3.2, step: 0.05, unit: "m", group: "断面" },
  { key: "floorJitter", label: "沟底宽抖动", min: 0, max: 0.4, step: 0.01, unit: "×", group: "随机" },
  { key: "bankJitter", label: "坡宽抖动", min: 0, max: 0.5, step: 0.01, unit: "×", group: "随机" },
  { key: "depthJitter", label: "深度抖动", min: 0, max: 0.15, step: 0.005, unit: "×", group: "随机" },
  { key: "noiseCellM", label: "噪声格边长", min: 3, max: 24, step: 0.5, unit: "m", group: "随机" },
  { key: "cornerRadiusM", label: "拐角圆角", min: 0, max: 2, step: 0.05, unit: "m", group: "随机" },
  { key: "revetment.spacingM", label: "护壁间隔", min: 2, max: 9, step: 0.1, unit: "m", group: "布设" },
  { key: "revetment.skipChance", label: "护壁跳过率", min: 0, max: 0.6, step: 0.01, unit: "", group: "布设" },
  { key: "bays.everyM", label: "射击位间隔", min: 12, max: 60, step: 1, unit: "m", group: "布设" },
  { key: "bays.maxCount", label: "射击位上限", min: 0, max: 10, step: 1, unit: "个", group: "布设" },
];

const TRENCH_PARAM_DEFAULTS = {
  floorW: 3.2, bankW: 1.5, bermH: 0.25, bermW: 1.6,
  floorJitter: 0.16, bankJitter: 0.22, depthJitter: 0.04,
  noiseCellM: 9, cornerRadiusM: 0.6,
  "revetment.spacingM": 4.5, "revetment.skipChance": 0.12,
  "bays.everyM": 34, "bays.maxCount": 6,
};

/** 段 role → 列表上的后缀，别让「回环」和「敌军坑道」只活在源码注释里。 */
const TRENCH_ROLE_LABEL = { localLoop: "（回环）", enemyEntry: "（敌军坑道）" };

function IsTrenchPresetKey(key) {
  return typeof key === "string" && key.startsWith(TRENCH_PRESET_PREFIX);
}

function TrenchPresetName(key) {
  return IsTrenchPresetKey(key) ? key.slice(TRENCH_PRESET_PREFIX.length) : null;
}

/** TrenchPreset 的防弹版：预设名写错时给出厂表里的第一项，不把整张路线表带崩。 */
function SafeTrenchPreset(name) {
  try {
    const preset = TrenchPreset(name);
    if (preset) return preset;
  } catch (error) { /* 落到下面 */ }
  return TRENCH_PRESETS[name] || TRENCH_PRESETS.communication || {};
}

/** 点号键取值：GetPath(preset, "revetment.spacingM")。 */
function GetPath(object, path) {
  let node = object;
  for (const part of String(path).split(".")) {
    if (node == null) return undefined;
    node = node[part];
  }
  return node;
}

/**
 * 扁平点号改动 → 嵌套 patch。
 *
 * 嵌套那一层**整只带过去**（出厂值打底 + 改过的字段覆盖），这样规划层不管是
 * 浅合并还是深合并都得到同一个结果 —— 面板不该去猜别人的合并语义。
 */
function ExpandTrenchPatch(name, edits) {
  const base = TRENCH_PRESETS[name] || {};
  const patch = {};
  for (const [key, value] of Object.entries(edits || {})) {
    const dot = key.indexOf(".");
    if (dot < 0) { patch[key] = value; continue; }
    const head = key.slice(0, dot);
    const tail = key.slice(dot + 1);
    if (!patch[head]) patch[head] = { ...(base[head] || {}) };
    patch[head][tail] = value;
  }
  return patch;
}

/**
 * 第一关的壕沟网络：优先读布局挂上来的那一份（集成包接好之后就是它），
 * 读不到再退回源码里的常量 —— 但**只对第一关白盒**退回，别让县城几关凭空多出七条沟。
 */
function TrenchNetworkFor(layout) {
  const attached = layout?.terrainSpec?.trenchNetwork ?? null;
  if (attached) return attached;
  return layout?.terrain === "P012Heightfield" ? MISSION_TRENCH_NETWORK : null;
}

/**
 * 出厂路线表：把散在各处的道路/围墙/壕沟数据统一读成控制点。
 * layout：当前白盒布局（第一关）。带 railway spec 的就列出那条铁路，预览走同一份 spec。
 */
export function CollectSceneSplineRoutes(levelId = null, layout = null) {
  const routes = [];
  const lr = layout?.railway;
  if (lr) {
    routes.push({
      key: `whitebox:${layout.id}:railway`, id: lr.id, label: "第一关铁路（白盒）", kind: "railway",
      source: "Data_FirstLevelMissionLayout.MISSION_RAILWAY（points；断面 crown/bed/sleeper/rail）",
      seed: lr.id, width: lr.bed.topHalf * 2, lift: lr.crown.lift,
      points: lr.points.map((p) => [p[0], p[1]]), axisLocked: false,
      railway: lr,
    });
  }
  for (const s of STREETS) {
    routes.push({
      key: `city:${s.id}`, id: s.id, label: s.label || s.id, kind: "street",
      source: "Data_Tengxian.STREETS（axis/at/from/to，轴对齐，测试锁死）",
      seed: `road${s.id}`,
      width: s.width, crown: 0.11, skirt: 0.12,
      points: s.axis === "x"
        ? [[s.from, s.at], [s.to, s.at]] : [[s.at, s.from], [s.at, s.to]],
      axisLocked: true,
    });
  }
  for (const lane of EAST_SUBURB.mapLanes || []) {
    const horizontal = lane.w >= lane.d;
    routes.push({
      key: `eastLane:${lane.id}`, id: lane.id, label: lane.label || lane.id, kind: "street",
      source: "Data_Tengxian.EAST_SUBURB.mapLanes（x/z/w/d 矩形）",
      seed: `lane${lane.id}`,
      width: horizontal ? lane.d : lane.w, crown: 0.075, skirt: 0.25,
      points: horizontal
        ? [[lane.x - lane.w / 2, lane.z], [lane.x + lane.w / 2, lane.z]]
        : [[lane.x, lane.z - lane.d / 2], [lane.x, lane.z + lane.d / 2]],
      axisLocked: true,
    });
  }
  const ws = WEST_SUBURB.westStreet;
  if (ws) {
    routes.push({
      key: "west:street", id: "WestStreet", label: ws.label || "西关大街", kind: "street",
      source: "Data_Tengxian.WEST_SUBURB.westStreet（z/fromX/toX/width）",
      seed: "west:street",
      width: ws.width, crown: 0.22, skirt: 0.65,
      points: [[ws.fromX, ws.z], [ws.toX, ws.z]], axisLocked: true,
    });
  }
  const ns = NORTH_SUBURB.street;
  if (ns) {
    routes.push({
      key: "north:street", id: "NorthStreet", label: ns.label || "北关大街", kind: "street",
      source: "Data_Tengxian.NORTH_SUBURB.street（x/fromZ/toZ/width）",
      seed: "north:street",
      width: ns.width, crown: 0.22, skirt: 0.65,
      points: [[ns.x, ns.fromZ], [ns.x, ns.toZ]], axisLocked: true,
    });
  }
  const wr = WEST_SUBURB.railway;
  if (wr) {
    routes.push({
      key: "west:railway", id: "JinpuRailWest", label: "津浦铁路（城西段）", kind: "railway",
      source: "Data_Tengxian.WEST_SUBURB.railway（x/fromZ/toZ）",
      seed: "map:Station:rail",
      width: 6.8, lift: 0.46,
      points: [[wr.x, wr.fromZ], [wr.x, wr.toZ]], axisLocked: true,
    });
  }

  routes.push({
    key: "east:approach", id: "EastApproachRoad", label: "东关外大车道", kind: "road",
    source: "Script_TengxianCity.BuildEastApproach（端点取 Data_Tengxian.EAST_FIELD.bounds）",
    seed: "eastApproachRoad", width: 7.0, crown: 0.06, skirt: 0.6,
    points: [[544, EAST_FIELD.roadZ], [EAST_FIELD.bounds.maxX, EAST_FIELD.roadZ]],
    axisLocked: true,
  });

  // --- 围墙（样条围墙管线 Script_WallSpline 的三路调用点） ---
  const zw = EAST_SUBURB.zhaiWall;
  if (zw && zw.enabled !== false) {
    const g = EAST_SUBURB.zhaiGate;
    const half = (zw.toZ - zw.fromZ) / 2;
    routes.push({
      key: "wall:eastZhai", id: "EastZhaiWall", label: "东关寨墙", kind: "wall",
      source: "Data_Tengxian.EAST_SUBURB.zhaiWall（x/fromZ/toZ，轴对齐）",
      height: zw.height, topWidth: zw.topWidth, baseWidth: zw.baseWidth,
      points: [[zw.x, -half], [zw.x, half]], axisLocked: true,
      wall: {
        preset: "zhaiWall", seed: "zhaiEast",
        gaps: [{ at: [g.x, g.z], width: g.width + 1.6 }],
        breaches: [{ at: [zw.x, -24], width: 16 }, { at: [zw.x, 52], width: 12 }],
      },
    });
  }
  const st = NORTH_SUBURB.stockade;
  if (st) {
    routes.push({
      key: "wall:northStockade", id: "NorthStockade", label: "北关坝墙（圩子）", kind: "wall",
      source: "Data_Tengxian.NORTH_SUBURB.stockade（z/fromX/toX，轴对齐）",
      height: st.height, topWidth: st.topWidth, baseWidth: st.baseWidth,
      points: [[st.fromX, st.z], [st.toX, st.z]], axisLocked: true,
      wall: {
        preset: "stockade", seed: "north:zhai", damage: 0.3, coverSign: -1,
        gaps: (st.gates || []).map((gt) => {
          const width = gt.width ?? gt.w ?? 3.0;
          return { at: [gt.x, st.z], width: width + 2.6 * 2 + 0.3 };
        }),
        randomBreaches: { count: 3, widthMin: 9, widthMax: 16, margin: 24, avoidGapMargin: 14 },
      },
    });
  }
  const spec = levelId ? OutfieldSpec(levelId) : null;
  if (spec) {
    (spec.roads || []).forEach((road, i) => {
      routes.push({
        key: `outfield:${spec.id}:road${i}`, id: `${spec.id}Road${i}`,
        label: `${spec.id} 大车路 ${i + 1}`, kind: "road",
        source: `Script_TengxianOutfield.OUTFIELD_SCENES.${spec.id}.roads[${i}].points`,
        seed: road.seed || `${spec.id}:road${i}`,
        width: road.width, crown: 0.045, skirt: 0.6,
        points: road.points.map((p) => [p[0], p[1]]), axisLocked: false,
      });
    });
    const rw = spec.railway;
    if (rw) {
      routes.push({
        key: `outfield:${spec.id}:railway`, id: `${spec.id}Rail`,
        label: `${spec.id} 津浦路路基`, kind: "railway",
        source: `Script_TengxianOutfield.OUTFIELD_SCENES.${spec.id}.railway（x/fromZ/toZ）`,
        seed: `${spec.id}:railway`,
        width: 6.8, lift: 1.35,
        points: [[rw.x, rw.fromZ], [rw.x, rw.toZ]], axisLocked: true,
      });
    }
    for (const v of spec.villages || []) {
      if (!v.stoneWall) continue;
      const hw = v.w / 2 + 8, hd = v.d / 2 + 8;
      routes.push({
        key: `wall:stone:${spec.id}:${v.id}`, id: `${v.id}StoneWall`,
        label: `${v.id} 干垒石墙`, kind: "wall",
        source: `Script_TengxianOutfield.OUTFIELD_SCENES.${spec.id}.villages.${v.id}（矩形 x/z/w/d + 外扩 8 m）`,
        height: 1.45, topWidth: 0.55, baseWidth: 0.55,
        points: [
          [v.x - hw, v.z - hd], [v.x + hw, v.z - hd],
          [v.x + hw, v.z + hd], [v.x - hw, v.z + hd],
        ],
        axisLocked: true, closed: true,
        wall: { preset: "villageStone", seed: `${v.id}:stonewall` },
      });
    }
  }
  // --- 第一关壕沟（样条壕沟管线 Script_TrenchPlan 的调用点） ---
  // 摆在最后：这张表的第一条是「打开面板默认选中的那条」，
  // 别让加一路壕沟顺手改掉所有人打开面板时看到的东西。
  const network = TrenchNetworkFor(layout);
  for (const seg of network?.segments || []) {
    const preset = SafeTrenchPreset(seg.preset);
    routes.push({
      key: `whitebox:${layout?.id || "p012"}:trench:${seg.id}`,
      id: seg.id,
      label: `壕沟 · ${seg.id}${TRENCH_ROLE_LABEL[seg.role] || ""}`,
      kind: "trench",
      source: seg.source || "Data_FirstLevelMissionTrenches.MISSION_TRENCH_NETWORK.segments",
      points: seg.points.map((p) => [p.x, p.z]),
      trench: {
        preset: seg.preset,
        depth: seg.depth ?? preset?.depth ?? 2.0,
        widthScale: seg.widthScale ?? 1,
        role: seg.role || null,
        routeBound: !!seg.routeBound,
      },
      axisLocked: false,
    });
  }
  return routes;
}

export class SplineEditor {
  static id = "splines";
  static label = "场景样条PCG";
  static hint = "铁路/道路/大街/围墙的样条中心线：预览、拖点、调参、导出（数据仍在各源文件）";

  constructor(host) {
    this.host = host;
    this.cameraMode = "fly";
    this.panel = null;
    this.overrides = {};          // key → { width, height, points }
    this.kindFilter = "全部";
    this.mode = "select";
    this.selectedKey = null;
    this.selectedPoint = -1;
    this.showAll = true;
    this.showPreview = true;
    this.dirty = false;
    this.group = null;
    this.markers = [];
    this.raycaster = new THREE.Raycaster();
    this.presetEdits = {};        // 预设名 → 改过的字段（叠加在 WALL_PRESETS 上）
    this.presetKey = "zhaiWall";  // 「拼接资产 / 布设参数」当前看的是哪一路墙
    this.showAssets = false;      // 资产台开关
    this.assetGroup = null;
    this.assetAnchor = null;      // 资产台落点（世界 xyz + 朝向）
    this.assetSpan = 12;          // 台面总长（相机取景用）
    this.assetHeight = 2;
    this.ownedAssets = [];        // 资产台自己烘的几何，退出时 dispose
    this.ownedAssetMaterials = [];
    this.trenchPlanCache = null;  // { revision, network, plan }
    this.trenchDressingCache = null;  // { plan, dressing }
    this.trenchPushed = new Set();    // 已经推给规划层的段覆盖（撤销时要清回去）
    this.trenchStats = null;      // 最近一次壕沟预览的取证读数
    this.Restore();
    this.ApplyPresetEdits();
    this.routes = this.Collect();
    this.selectedKey = this.routes[0]?.key || null;
  }

  get levelId() {
    const phase = this.host.game.state.builtPhase;
    return PHASES[phase]?.id || null;
  }

  Collect() {
    const routes = CollectSceneSplineRoutes(this.levelId, this.host.game.battlefield?.layout);
    for (const route of routes) {
      const o = this.overrides[route.key];
      if (!o) continue;
      if (o.width) route.width = o.width;
      if (o.height) route.height = o.height;
      if (o.trench && route.trench) route.trench = { ...route.trench, ...o.trench };
      if (Array.isArray(o.points) && o.points.length >= 2) route.points = o.points;
      route.edited = true;
    }
    this.routes = routes;
    this.SyncTrenchOverrides(routes);
    return routes;
  }

  // -------------------------------------------------------------------------
  // 壕沟：覆盖推送 / 编译缓存
  // -------------------------------------------------------------------------

  /**
   * 把面板里的壕沟改动推给 Script_TrenchPlan。
   *
   * 与围墙 SetWallPresetOverride 同一条纪律：**面板和建关读的是同一份覆盖**，
   * 所以退出面板重建关卡时，集成层按 TrenchRevision() 做的编译缓存会自动失效重编。
   * 只推「真有改动」的段，并记住推过谁 —— 「还原所选」之后要显式推一个 null 回去，
   * 否则规划层里会留着一份没人再认领的覆盖（刷新才消失，那是最难查的一类残留）。
   */
  SyncTrenchOverrides(routes = this.routes) {
    const wanted = new Map();
    for (const route of routes || []) {
      if (route.kind !== "trench" || !this.overrides[route.key]) continue;
      wanted.set(route.id, {
        points: route.points.map((p) => ({ x: p[0], z: p[1] })),
        depth: route.trench?.depth,
        widthScale: route.trench?.widthScale,
      });
    }
    for (const id of this.trenchPushed) {
      if (!wanted.has(id)) SetTrenchSegmentOverride(id, null);
    }
    for (const [id, patch] of wanted) SetTrenchSegmentOverride(id, patch);
    this.trenchPushed = new Set(wanted.keys());
  }

  TrenchNetwork() {
    return TrenchNetworkFor(this.host.game.battlefield?.layout);
  }

  /** 编译（带面板覆盖）后的壕沟网络；revision 没变就复用，拖一个点不该重编七条沟。 */
  TrenchPlan() {
    const network = this.TrenchNetwork();
    if (!network) return null;
    const revision = TrenchRevision();
    const cache = this.trenchPlanCache;
    if (cache && cache.revision === revision && cache.network === network) return cache.plan;
    let plan = null;
    try {
      plan = CompileTrenchNetwork(network, { natural: SampleMissionNaturalHeight });
    } catch (error) {
      console.warn("[SplineEditor] 壕沟编译失败：", error);
      return null;
    }
    this.trenchPlanCache = { revision, network, plan };
    this.trenchDressingCache = null;
    return plan;
  }

  /** 布设预览的账：跟着 plan 走，plan 没换就不重算（它要遍历全网所有站点）。 */
  TrenchDressing(plan) {
    if (!plan) return null;
    if (this.trenchDressingCache?.plan === plan) return this.trenchDressingCache.dressing;
    let dressing = null;
    try {
      dressing = PlanTrenchDressing(plan, { groundAt: (x, z) => this.GroundAt(x, z) });
    } catch (error) {
      console.warn("[SplineEditor] 壕沟布设预览失败：", error);
      return null;
    }
    this.trenchDressingCache = { plan, dressing };
    return dressing;
  }

  // -------------------------------------------------------------------------
  // 生命周期
  // -------------------------------------------------------------------------

  Enter(root) {
    this.host.flycam.Open();
    this.host.SetViewmodelVisible(false);
    this.group = new THREE.Group();
    this.group.name = "SplineEditorOverlay";
    this.host.scene.add(this.group);
    this.panel = Panel({
      title: "场景样条PCG编辑器",
      sub: "WASD+QE 飞 · 右键拖转头 · 左键按当前模式作用于路线",
      variant: "work wide",
      onClose: () => this.host.Close(),
    });
    root.appendChild(this.panel.root);
    this.BuildUi(this.panel.body);
    this.FillList();
    this.FillPresetList();
    if (this.selectedKey) this.Select(this.selectedKey, { fly: false });
    this.SyncPresetUi();
    this.BuildOverlay();
    return this;
  }

  Exit() {
    this.Save();
    this.ClearAssets();
    this.ClearOverlay(true);
    this.host.flycam.Close();
    this.host.SetViewmodelVisible(true);
    if (this.panel) this.panel.root.remove();
    this.panel = null;
  }

  Update(dt) {
    this.host.flycam.Update(dt);
    if (this.host.viewmodel?.root?.visible) this.host.SetViewmodelVisible(false);
    this.RefreshFacts();
  }

  // -------------------------------------------------------------------------
  // 界面
  // -------------------------------------------------------------------------

  BuildUi(body) {
    const list = Section(body, "路线");
    this.kindChips = Chips(list, ["全部",
      { value: "street", label: "大街" },
      { value: "road", label: "土路" },
      { value: "railway", label: "铁路" },
      { value: "wall", label: "围墙" },
      { value: "trench", label: "壕沟" },
    ], this.kindFilter, (value) => { this.kindFilter = value; this.FillList(); });
    this.list = ListBox(list, { height: 180, onPick: (key) => this.Select(key) });
    Toggle(list, "叠加显示全部路线", this.showAll, (on) => {
      this.showAll = on; this.BuildOverlay();
    });
    Toggle(list, "显示真几何预览", this.showPreview, (on) => {
      this.showPreview = on; this.BuildOverlay();
    });

    const edit = Section(body, "编辑");
    this.modeChips = Chips(edit, [
      { value: "select", label: "选点" },
      { value: "move", label: "移动" },
      { value: "insert", label: "插入" },
      { value: "delete", label: "删除" },
    ], this.mode, (value) => { this.mode = value; });
    this.widthSlider = Slider(edit, {
      label: "路宽", min: 1.5, max: 14, step: 0.1, value: 6,
      format: (v) => `${v.toFixed(1)} m`,
      onInput: (v) => this.PatchSelected((r) => { r.width = +v.toFixed(1); }),
    });
    this.heightSlider = Slider(edit, {
      label: "墙高", min: 0.8, max: 4, step: 0.05, value: 2,
      format: (v) => `${v.toFixed(2)} m`,
      onInput: (v) => this.PatchSelected((r) => { r.height = +v.toFixed(2); }),
    });
    // 壕沟的两根：**段级**覆盖（这一条沟自己的事），与「布设参数」那一档的
    // 预设滑杆不是一回事 —— 预设改的是「所有交通壕」，这两根只改选中的这一条。
    this.trenchWidthSlider = Slider(edit, {
      label: "沟底宽比例", min: 0.6, max: 1.6, step: 0.05, value: 1,
      format: (v) => `${v.toFixed(2)} ×`,
      onInput: (v) => this.PatchTrench("widthScale", +v.toFixed(2)),
    });
    this.trenchDepthSlider = Slider(edit, {
      label: "设计深度", min: 1.5, max: 2.6, step: 0.05, value: 2,
      format: (v) => `${v.toFixed(2)} m`,
      onInput: (v) => this.PatchTrench("depth", +v.toFixed(2)),
    });
    ButtonRow(edit, [
      { label: "飞到该路线", onClick: () => this.FlyToSelected() },
      { label: "还原所选", onClick: () => this.RevertSelected() },
      { label: "全部还原出厂", onClick: () => this.RevertAll(), cls: "danger" },
    ]);
    Note(edit, "选点、移动或插入后，左键点击路线。");

    // --- 拼接资产 / 布设参数 ---
    const pcg = Section(body, "拼接资产 / 布设参数");
    this.presetList = ListBox(pcg, {
      height: 132, onPick: (key) => this.SelectPreset(key),
    });
    this.assetFacts = Facts(pcg, ["有效步距 / 露缝", "改动", "断面 底/坡/深", "射击位"]);
    Toggle(pcg, "在场里摆出拼接资产台", this.showAssets, (on) => {
      this.showAssets = on;
      this.BuildAssets();
      if (on) this.FlyToAssets();
    });
    ButtonRow(pcg, [
      { label: "资产台搬到眼前", onClick: () => { this.assetAnchor = null; this.BuildAssets(); this.FlyToAssets(); } },
      { label: "还原该预设", onClick: () => this.RevertPreset() },
    ]);
    this.assetNote = Note(pcg, "");
    this.assetNote.style.display = "none";

    // 两张滑杆表活在两只盒子里，按当前预设整只显隐。
    // 为什么不共用一排滑杆按需改 min/max：墙和沟的字段根本不是同一组东西，
    // 复用会让「护壁间隔」这根滑杆在切到墙之后继续显示一个壕沟的数。
    this.paramSliders = {};
    this.wallParamBox = El("div");
    pcg.appendChild(this.wallParamBox);
    for (const row of WALL_PARAMS) {
      this.paramSliders[row.key] = Slider(this.wallParamBox, {
        label: row.label, min: row.min, max: row.max, step: row.step,
        value: PARAM_DEFAULTS[row.key],
        format: (v) => `${row.step >= 1 ? v.toFixed(0) : v.toFixed(3)}${row.unit}`,
        onInput: (v) => this.PatchPreset(row.key, +v.toFixed(4)),
      });
    }

    this.trenchParamSliders = {};
    this.trenchParamBox = El("div");
    pcg.appendChild(this.trenchParamBox);
    let lastGroup = "";
    for (const row of TRENCH_PARAMS) {
      if (row.group !== lastGroup) {
        lastGroup = row.group;
        this.trenchParamBox.appendChild(El("div", "edNote", row.group));
      }
      this.trenchParamSliders[row.key] = Slider(this.trenchParamBox, {
        label: row.label, min: row.min, max: row.max, step: row.step,
        value: TRENCH_PARAM_DEFAULTS[row.key] ?? row.min,
        format: (v) => `${row.step >= 1 ? v.toFixed(0) : v.toFixed(3)}${row.unit}`,
        onInput: (v) => this.PatchTrenchPreset(row.key, +v.toFixed(4)),
      });
    }
    this.trenchParamBox.style.display = "none";

    const evidence = Section(body, "取证");
    this.facts = Facts(evidence, ["长度 / 控制点", "选中点",
      "壕沟 站/三角/接口", "布设件 / 编译版本", "实测深度 最浅/最深"]);
    this.status = Note(evidence, "", true);

    const io = Section(body, "导出 / 导入");
    this.io = TextArea(io, {
      rows: 6,
      placeholder: "导出的 JSON 会出现在这里（routes = 控制点，presets = 布设参数，各带 source）",
    });
    ButtonRow(io, [
      { label: "导出改动 JSON", onClick: () => this.Export() },
      { label: "导入", onClick: () => this.Import() },
    ]);
    Note(io, "导出后保存到源码才会永久生效。");
  }

  // -------------------------------------------------------------------------
  // 预设列表 / 资产台
  // -------------------------------------------------------------------------

  FillPresetList() {
    if (!this.presetList) return;
    const used = new Set(this.routes.filter((r) => r.wall?.preset).map((r) => r.wall.preset));
    const trenchUsed = new Set(this.routes.filter((r) => r.trench?.preset).map((r) => r.trench.preset));
    const items = Object.entries(WALL_PRESETS).map(([key, preset]) => ({
      id: key,
      name: `${this.presetEdits[key] ? "✎ " : ""}${preset.label || key}`,
      tail: used.has(key) ? "本关" : "",
      title: `${key}
style=${preset.style}`,
    }));
    for (const [name, preset] of Object.entries(TRENCH_PRESETS)) {
      const key = TRENCH_PRESET_PREFIX + name;
      items.push({
        id: key,
        name: `${this.presetEdits[key] ? "✎ " : ""}壕沟 · ${preset.label || name}`,
        tail: trenchUsed.has(name) ? "本关" : "",
        title: `${key}
Script_TrenchPlan.TRENCH_PRESETS.${name}`,
      });
    }
    this.presetList.Fill(items);
    this.presetList.Select(this.presetKey);
  }

  SelectPreset(key) {
    const trenchName = TrenchPresetName(key);
    if (trenchName ? !TRENCH_PRESETS[trenchName] : !WALL_PRESETS[key]) return;
    this.presetKey = key;
    this.presetList.Select(key);
    this.SyncPresetUi();
    this.BuildAssets();
  }

  /** 滑杆读数跟上当前预设；墙/沟两张表整只显隐。 */
  SyncPresetUi() {
    if (!this.paramSliders) return;
    const trenchName = TrenchPresetName(this.presetKey);
    if (this.wallParamBox) this.wallParamBox.style.display = trenchName ? "none" : "";
    if (this.trenchParamBox) this.trenchParamBox.style.display = trenchName ? "" : "none";
    if (trenchName) {
      const values = this.TrenchPresetValues(trenchName);
      for (const row of TRENCH_PARAMS) this.trenchParamSliders[row.key]?.Set(values[row.key]);
    } else {
      const values = this.PresetValues();
      for (const row of WALL_PARAMS) this.paramSliders[row.key]?.Set(values[row.key]);
    }
    this.RefreshAssetFacts();
  }

  /** 当前壕沟预设的完整参数（出厂值 + 面板改动），键是扁平点号。 */
  TrenchPresetValues(name = TrenchPresetName(this.presetKey)) {
    const preset = SafeTrenchPreset(name);
    const out = {};
    for (const row of TRENCH_PARAMS) {
      const value = GetPath(preset, row.key);
      out[row.key] = Number.isFinite(value) ? value : (TRENCH_PARAM_DEFAULTS[row.key] ?? row.min);
    }
    return out;
  }

  RefreshAssetFacts() {
    if (!this.assetFacts) return;
    const key = this.presetKey;
    const trenchName = TrenchPresetName(key);
    if (trenchName) {
      const preset = SafeTrenchPreset(trenchName);
      const v = this.TrenchPresetValues(trenchName);
      this.assetFacts.Set("预设 / 风格", `壕沟 · ${preset.label || trenchName}`);
      this.assetFacts.Set("断面 底/坡/深",
        `${v.floorW.toFixed(2)} / ${v.bankW.toFixed(2)} / ${(preset.depth ?? 2).toFixed(2)} m`);
      this.assetFacts.Set("有效步距 / 露缝",
        `护壁 ${v["revetment.spacingM"].toFixed(1)} m / 跳过 ${(v["revetment.skipChance"] * 100).toFixed(0)}%`);
      this.assetFacts.Set("抛土堆 高×宽",
        `${v.bermH.toFixed(2)} × ${v.bermW.toFixed(2)} m · ${preset.bermSide || "both"}`);
      this.assetFacts.Set("射击位", `每 ${v["bays.everyM"].toFixed(0)} m，上限 ${v["bays.maxCount"].toFixed(0)} 个`);
      const editedTrench = this.presetEdits[key];
      this.assetFacts.Set("改动", editedTrench ? Object.keys(editedTrench).join("、") : "无（出厂值）",
        editedTrench ? "warn" : "");
      return;
    }
    const preset = WallPreset(key);
    const v = this.PresetValues();
    this.assetFacts.Set("预设 / 风格", `${preset.label || key} · ${preset.style}`);
    this.assetFacts.Set("模块 长×重叠",
      `${v.moduleLen.toFixed(2)} m × ${(1 + v.moduleOverlap).toFixed(3)}`);
    this.assetFacts.Set("有效步距 / 露缝",
      `${v.moduleLen.toFixed(2)} m / 压 ${(v.moduleLen * v.moduleOverlap * 100).toFixed(1)} cm`);
    this.assetFacts.Set("变体 / 量化",
      `${v.variants} 份 · 高 ${v.geoQuantH || "精确"} / 厚 ${v.geoQuantW || "精确"}`);
    this.assetFacts.Set("碱脚 / 压顶",
      `${preset.plinth ? preset.plinth.material : "无"} / ${preset.cope ? preset.cope.material : "无"}`);
    const edited = this.presetEdits[key];
    this.assetFacts.Set("改动", edited ? `${Object.keys(edited).join("、")}` : "无（出厂值）",
      edited ? "warn" : "");
  }

  ClearAssets() {
    if (this.assetGroup) {
      this.host.scene.remove(this.assetGroup);
      this.assetGroup = null;
    }
    for (const g of this.ownedAssets) g.dispose();
    this.ownedAssets = [];
    for (const m of this.ownedAssetMaterials) m.dispose();
    this.ownedAssetMaterials = [];
  }

  /**
   * 资产台落点：相机前方 14 m、**离地 ASSET_STAGE_LIFT 米**。
   *
   * 为什么架在空中而不是摆地上：城内是一片 2 m 高的院墙网格，摆在地面的资产台
   * 会被就近那圈墙挡掉大半 —— 第一版实拍出来就是「飞过去只看见别人家的院墙」。
   * 抬到十二米以上，背景是天，几只原始件的轮廓、缝和压茬才读得干净。
   */
  AssetAnchor() {
    if (this.assetAnchor) return this.assetAnchor;
    const cam = this.host.camera;
    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
    dir.y = 0;
    if (dir.lengthSq() < 1e-4) dir.set(0, 0, -1);
    dir.normalize();
    const x = cam.position.x + dir.x * 14;
    const z = cam.position.z + dir.z * 14;
    // 台面朝向：让**看件的那一面朝太阳**。不定这一条的话，台子朝哪边全看
    // 用户进面板时相机朝哪儿，逆光时几只件全是黑剪影 —— 拼缝、压茬、
    // 顶檐起伏这些要看的东西一个都读不出来。
    const sun = this.host.lights?.sunDirection;
    let ry = Math.atan2(dir.x, dir.z);
    if (sun && Math.hypot(sun.x, sun.z) > 0.05) {
      ry = Math.atan2(sun.x, sun.z);
    }
    this.assetAnchor = { x, z, y: this.GroundAt(x, z) + ASSET_STAGE_LIFT, ry };
    return this.assetAnchor;
  }

  /** 把相机摆到能一眼看全资产台的地方（在台子自己的局部系里算，再变换出去）。 */
  FlyToAssets() {
    const group = this.assetGroup;
    const a = this.AssetAnchor();
    const span = this.assetSpan || 12;
    const eye = new THREE.Vector3(span / 2, span * 0.28, span * 0.98);
    const look = new THREE.Vector3(span / 2, (this.assetHeight || 2) * 0.5, 0);
    if (group) {
      group.updateMatrixWorld(true);
      group.localToWorld(eye);
      group.localToWorld(look);
    } else {
      eye.set(a.x, a.y + 3, a.z + 10);
      look.set(a.x, a.y + 1, a.z);
    }
    const camera = this.host.camera;
    camera.position.copy(eye);
    const forward = look.sub(eye).normalize();
    const yaw = Math.atan2(-forward.x, -forward.z);
    const pitch = Math.asin(THREE.MathUtils.clamp(forward.y, -1, 1));
    this.host.flycam.yaw = yaw;
    this.host.flycam.pitch = pitch;
    camera.rotation.set(pitch, yaw, 0, "YXZ");
  }

  MaterialFor(name) {
    try {
      return ResolveTengxianMaterial(name, this.host.library);
    } catch (error) {
      return this.PreviewMaterial("wall");
    }
  }

  /**
   * 资产台：把当前预设的**原始拼接件**摆在地上。
   *
   * 摆的是真几何 + 真材质（MakeWallAssetSet 调的就是建城那两个烘焙函数），
   * 不是另画一份示意 —— 面板上看到什么，城里摆的就是什么。
   * 从左到右：变体 0..n-1、碱脚条、压顶条、按当前间隔/重叠拼起来的三块。
   */
  BuildAssets() {
    this.ClearAssets();
    this.RefreshAssetFacts();
    // 壕沟没有「拼接件」：沟是挖出来的，护壁/踏板/沙袋是沿线撒的布设件，
    // 摆一台原始几何出来什么也说明不了。说清楚，而不是抛一个烘焙失败的 warn。
    const trenchName = TrenchPresetName(this.presetKey);
    if (this.assetNote) {
      this.assetNote.style.display = trenchName ? "" : "none";
      if (trenchName) {
        this.assetNote.textContent = "壕沟预设没有拼接资产台 —— 沟是挖出来的不是摆出来的。"
          + "护壁/踏板/射击位在选中壕沟路线时的布设预览里看（半透明盒子）。";
      }
    }
    if (trenchName) return;
    if (!this.showAssets) return;
    const a = this.AssetAnchor();
    let set = null;
    const preset = WallPreset(this.presetKey);
    const route = this.routes.find((r) => r.wall?.preset === this.presetKey);
    const sample = preset.sample || { material: "ZhaiEarth", height: 2.2, baseWidth: 0.4, topWidth: 0.4 };
    try {
      // 尺寸优先取本关真在用这套预设的那条墙；城内院墙这类不在路线表里的
      // 就用预设自带的 sample（"这一路墙大致多高多厚"）
      set = MakeWallAssetSet(this.presetKey, route ? {
        height: route.height, topWidth: route.topWidth, baseWidth: route.baseWidth,
      } : {
        height: sample.height, topWidth: sample.topWidth, baseWidth: sample.baseWidth,
      });
    } catch (error) {
      console.warn("[SplineEditor] 拼接资产烘焙失败：", error);
      return;
    }
    const group = new THREE.Group();
    group.name = "SplineEditorAssets";
    group.position.set(a.x, a.y, a.z);
    group.rotation.y = a.ry;
    const nominal = set.nominal;
    const gap = Math.max(0.7, nominal.moduleLen * 0.28);
    let cursor = 0;
    const Put = (geometry, material, x, y, owned) => {
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(x, y, 0);
      mesh.renderOrder = 902;
      group.add(mesh);
      if (owned) this.ownedAssets.push(geometry);
    };
    const bodyMat = this.MaterialFor(sample.material);
    // ① 变体模块：抬到地面上（几何原点在模块中心）
    for (let i = 0; i < set.variants.length; i += 1) {
      cursor += nominal.moduleLen / 2 + (i ? gap : 0);
      Put(set.variants[i], bodyMat, cursor, nominal.height / 2, true);
      cursor += nominal.moduleLen / 2;
    }
    // ② 碱脚条 / 压顶条
    for (const trim of [set.plinth, set.cope]) {
      if (!trim) continue;
      cursor += gap + nominal.moduleLen / 2;
      Put(trim.geometry, this.MaterialFor(trim.material), cursor, trim.spec.height / 2, true);
      cursor += nominal.moduleLen / 2;
    }
    // ③ 拼接演示：三块按真实步距 + 重叠摆，缝在哪儿一眼看得见
    const step = nominal.moduleLen;
    const scaleX = 1 + nominal.moduleOverlap;
    cursor += gap * 2.2;
    const demoStart = cursor + step / 2;
    const jointMat = this.PreviewMaterial("street");
    this.ownedAssetMaterials.push(jointMat);
    for (let i = 0; i < 3; i += 1) {
      const mesh = new THREE.Mesh(set.variants[i % set.variants.length], bodyMat);
      mesh.position.set(demoStart + step * i, nominal.height / 2, 0);
      mesh.scale.set(scaleX, 1, 1);
      mesh.renderOrder = 902;
      group.add(mesh);
      // 拼缝标：模块边界在哪儿。不插这几根针，重叠调到 0.03 与调到 0.12
      // 在画面上是同一堵连续的墙 —— 那正是重叠要干的事，但调参时得看得见。
      for (const end of [-0.5, 0.5]) {
        const geometry = MakeBox(0.05, nominal.height * 1.22, 0.05,
          TILE_METERS.wood, `joint${i}${end}`);
        this.ownedAssets.push(geometry);
        const tick = new THREE.Mesh(geometry, jointMat);
        tick.position.set(demoStart + step * (i + end), nominal.height / 2,
          nominal.baseWidth / 2 + 0.10);
        tick.renderOrder = 904;
        group.add(tick);
      }
    }
    cursor = demoStart + step * 3;
    // ④ 一米一格的地尺：不给刻度就没法把"重叠 3 cm"读成一个长度
    const rulerLen = Math.ceil(cursor) + 1;
    const ruler = new THREE.Group();
    const rulerMats = [this.PreviewMaterial("railway"), this.PreviewMaterial("road")];
    this.ownedAssetMaterials.push(...rulerMats);
    for (let i = 0; i < rulerLen; i += 1) {
      const geometry = MakeBox(0.96, 0.02, 0.14, TILE_METERS.stone, `ruler${i}`);
      this.ownedAssets.push(geometry);
      const mesh = new THREE.Mesh(geometry, rulerMats[i % 2]);
      mesh.position.set(i + 0.5, 0.02, nominal.baseWidth / 2 + 0.55);
      mesh.renderOrder = 903;
      ruler.add(mesh);
    }
    group.add(ruler);
    this.assetSpan = Math.max(6, cursor);
    this.assetHeight = nominal.height;
    this.host.scene.add(group);
    this.assetGroup = group;
  }

  get selected() { return this.routes.find((r) => r.key === this.selectedKey) || null; }

  Visible() {
    return this.kindFilter === "全部"
      ? this.routes : this.routes.filter((r) => r.kind === this.kindFilter);
  }

  FillList() {
    if (!this.list) return;
    this.list.Fill(this.Visible().map((route) => ({
      id: route.key,
      name: `${route.edited ? "✎ " : ""}${route.label}`,
      tail: { street: "街", road: "路", railway: "铁", wall: "墙", trench: "沟" }[route.kind] || "",
      title: `${route.key}\n${route.source}`,
    })));
    this.list.Select(this.selectedKey);
  }

  Select(key, { fly = true } = {}) {
    const route = this.routes.find((r) => r.key === key);
    if (!route) return;
    this.selectedKey = key;
    this.selectedPoint = -1;
    this.list.Select(key);
    const isWall = route.kind === "wall";
    const isTrench = route.kind === "trench";
    if (this.widthSlider) {
      this.widthSlider.root.style.display = (isWall || isTrench) ? "none" : "";
      if (!isWall && !isTrench && route.width) this.widthSlider.Set(route.width);
    }
    if (this.heightSlider) {
      this.heightSlider.root.style.display = isWall ? "" : "none";
      if (isWall && route.height) this.heightSlider.Set(route.height);
    }
    for (const slider of [this.trenchWidthSlider, this.trenchDepthSlider]) {
      if (slider) slider.root.style.display = isTrench ? "" : "none";
    }
    if (isTrench) {
      this.trenchWidthSlider?.Set(route.trench?.widthScale ?? 1);
      this.trenchDepthSlider?.Set(route.trench?.depth ?? 2);
    }
    const wantPreset = isWall ? route.wall?.preset
      : (isTrench && route.trench?.preset ? TRENCH_PRESET_PREFIX + route.trench.preset : null);
    if (wantPreset && wantPreset !== this.presetKey) {
      this.presetKey = wantPreset;
      if (this.presetList) this.presetList.Select(this.presetKey);
      this.SyncPresetUi();
      this.BuildAssets();
    }
    if (fly) this.FlyToSelected();
    this.BuildOverlay();
  }

  RoutePath(route) {
    const pts = route.closed ? [...route.points, route.points[0]] : route.points;
    // 墙要直角；壕沟的圆角由规划层的 cornerRadiusM 管，中心线这里按折线画，
    // 免得面板上的线跟规划层算出来的路径是两条。
    const polyline = route.kind === "wall" || route.kind === "trench";
    return MakeRoadPath(pts, polyline ? { subdivisions: 1 } : {});
  }

  FlyToSelected() {
    const route = this.selected;
    if (!route) return;
    const path = this.RoutePath(route);
    const mid = path.At(path.length / 2);
    const y = this.GroundAt(mid.x, mid.z);
    // 相机停在路线南侧 34 m、高 42 m，**朝 −z 俯视**。
    // 原来这里写的是 yaw = π —— YXZ 下那是朝 +z，从路线南边再往南看，
    // 「飞到该路线」飞过去只看得见一片空地（实测朝向点积 = −1，正对面）。
    this.host.camera.position.set(mid.x, y + 42, mid.z + 34);
    this.host.flycam.yaw = 0;
    this.host.flycam.pitch = -0.85;
    this.host.camera.rotation.set(-0.85, 0, 0, "YXZ");
  }

  // -------------------------------------------------------------------------
  // 地面与拾取
  // -------------------------------------------------------------------------

  GroundAt(x, z) {
    const field = this.host.game.battlefield;
    const y = field && field.GroundHeight ? field.GroundHeight(x, z) : null;
    return Number.isFinite(y) ? y : 0;
  }

  /** 这个 xz 在不在水面上（宿主的 WaterDepth 口径：桥面上不算水）。 */
  WaterAt(x, z) {
    const field = this.host.game.battlefield;
    if (!field || !field.WaterDepth || !field.GroundHeight) return false;
    return field.WaterDepth(x, z, field.GroundHeight(x, z)) > 0.05;
  }

  /** 相机射线打到解析地形上（步进 + 二分；没有网格 raycast，地形是解析式的）。 */
  GroundHit(event) {
    const rect = this.host.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.host.camera);
    const { origin, direction } = this.raycaster.ray;
    let prevT = 0;
    let prevAbove = origin.y - this.GroundAt(origin.x, origin.z);
    if (prevAbove <= 0) return null;
    for (let t = 4; t < 2200; t += 4) {
      const x = origin.x + direction.x * t;
      const y = origin.y + direction.y * t;
      const z = origin.z + direction.z * t;
      const above = y - this.GroundAt(x, z);
      if (above <= 0) {
        // 二分细化
        let lo = prevT, hi = t;
        for (let i = 0; i < 18; i += 1) {
          const m = (lo + hi) / 2;
          const mx = origin.x + direction.x * m;
          const my = origin.y + direction.y * m;
          const mz = origin.z + direction.z * m;
          if (my - this.GroundAt(mx, mz) > 0) lo = m; else hi = m;
        }
        const ft = (lo + hi) / 2;
        return { x: origin.x + direction.x * ft, z: origin.z + direction.z * ft };
      }
      prevT = t;
      prevAbove = above;
    }
    return null;
  }

  OnClick(event, button) {
    if (button !== 0) return;
    const route = this.selected;
    if (!route) return;
    if (this.mode === "select" || this.mode === "delete") {
      const rect = this.host.canvas.getBoundingClientRect();
      const ndc = new THREE.Vector2(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1);
      this.raycaster.setFromCamera(ndc, this.host.camera);
      const hits = this.raycaster.intersectObjects(this.markers, false);
      if (!hits.length) { this.host.SetHint("没点到控制点标记"); return; }
      const index = hits[0].object.userData.pointIndex;
      if (this.mode === "select") {
        this.selectedPoint = index;
        this.BuildOverlay();
      } else {
        const minPoints = route.closed ? 3 : 2;
        if (route.points.length <= minPoints) {
          this.host.SetHint(`至少要留${minPoints}个控制点`);
          return;
        }
        this.PatchSelected((r) => { r.points.splice(index, 1); });
        this.selectedPoint = -1;
      }
      return;
    }
    const hit = this.GroundHit(event);
    if (!hit) { this.host.SetHint("射线没打到地面"); return; }
    const point = [+hit.x.toFixed(1), +hit.z.toFixed(1)];
    if (this.mode === "move") {
      if (this.selectedPoint < 0) { this.host.SetHint("先用「选点」选一个控制点"); return; }
      this.PatchSelected((r) => { r.points[this.selectedPoint] = point; });
    } else if (this.mode === "insert") {
      const at = this.selectedPoint >= 0 ? this.selectedPoint + 1 : route.points.length;
      this.PatchSelected((r) => { r.points.splice(at, 0, point); });
      this.selectedPoint = at;
    }
  }

  PatchSelected(mutate) {
    const route = this.selected;
    if (!route) return;
    mutate(route);
    route.edited = true;
    this.overrides[route.key] = {
      width: route.width, height: route.height,
      points: route.points.map((p) => [p[0], p[1]]),
      ...(route.trench ? {
        trench: { depth: route.trench.depth, widthScale: route.trench.widthScale },
      } : {}),
    };
    this.dirty = true;
    this.Save();
    this.SyncTrenchOverrides();
    this.FillList();
    this.BuildOverlay();
  }

  /** 壕沟的段级参数（沟底宽比例 / 设计深度）。走同一条覆盖通道，存同一个键。 */
  PatchTrench(key, value) {
    const route = this.selected;
    if (!route || route.kind !== "trench") return;
    this.PatchSelected((r) => { r.trench = { ...r.trench, [key]: value }; });
  }

  // -------------------------------------------------------------------------
  // 叠加显示
  // -------------------------------------------------------------------------

  ClearOverlay(remove = false) {
    if (!this.group) return;
    for (const child of [...this.group.children]) {
      this.group.remove(child);
      if (child.geometry) child.geometry.dispose();
      if (child.material) child.material.dispose();
    }
    this.markers = [];
    if (remove) {
      this.host.scene.remove(this.group);
      this.group = null;
    }
  }

  BuildOverlay() {
    if (!this.group) return;
    this.ClearOverlay();
    const shown = this.showAll ? this.routes : (this.selected ? [this.selected] : []);
    for (const route of shown) {
      const path = this.RoutePath(route);
      const pts = [];
      const n = Math.max(8, Math.round(path.length / 3));
      for (let i = 0; i <= n; i += 1) {
        const p = path.At((path.length * i) / n);
        pts.push(new THREE.Vector3(p.x, this.GroundAt(p.x, p.z) + 0.5, p.z));
      }
      const line = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(pts),
        new THREE.LineBasicMaterial({
          color: KIND_COLOR[route.kind] || 0xffffff,
          transparent: true,
          opacity: route.key === this.selectedKey ? 1.0 : 0.45,
        }));
      line.renderOrder = 900;
      this.group.add(line);
    }
    const route = this.selected;
    if (!route) return;
    // 控制点标记
    route.points.forEach((p, i) => {
      const y = this.GroundAt(p[0], p[1]);
      const selectedNow = i === this.selectedPoint;
      const marker = new THREE.Mesh(
        new THREE.BoxGeometry(1.4, 1.4, 1.4),
        new THREE.MeshBasicMaterial({ color: selectedNow ? 0xff5040 : 0xffd070 }));
      marker.position.set(p[0], y + 0.9, p[1]);
      marker.userData.pointIndex = i;
      marker.renderOrder = 901;
      this.group.add(marker);
      this.markers.push(marker);
    });
    // 真几何预览
    if (this.showPreview) {
      if (route.kind === "wall") this.BuildWallPreview(route);
      else if (route.kind === "trench") this.BuildTrenchOverlay(route);
      else this.BuildRoadPreview(route);
    }
  }

  /** 预览与现物几乎共面：polygonOffset 防互咬，深度不回写（预览是叠加层）。 */
  PreviewMaterial(kind, { color = null, opacity = 0.85 } = {}) {
    return new THREE.MeshStandardMaterial({
      color: color ?? KIND_COLOR[kind] ?? TRENCH_PREVIEW_COLORS[kind] ?? 0xd8c49a,
      roughness: 1.0,
      transparent: true, opacity, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4,
    });
  }

  /**
   * 壕沟预览：横断面带 + 三岔口标记 + 布设件盒子。
   *
   * 三件都从**同一个编译结果**来。这一点是这个面板存在的理由：改一根滑杆之后，
   * 沟变宽、护壁跟着往外挪、三岔口附近那几根跟着消失 —— 三者同时变，
   * 才看得出「让开三岔口」这条规则到底让开了多少。分三次算就对不上了。
   */
  BuildTrenchOverlay(route) {
    const plan = this.TrenchPlan();
    if (!plan) {
      this.trenchStats = null;
      return;
    }
    const byMaterial = new Map();
    const collector = {
      Add: (material, geometry) => {
        if (!byMaterial.has(material)) byMaterial.set(material, []);
        byMaterial.get(material).push(geometry);
      },
      Solid: () => {}, SetSector: () => {},
    };
    let stats = null;
    try {
      stats = BuildTrenchPreview(collector, plan, route.id, {
        natural: SampleMissionNaturalHeight, lift: 0.04,
      });
    } catch (error) {
      console.warn("[SplineEditor] 壕沟预览生成失败：", error);
    }
    let dressed = { blocks: 0, placements: 0 };
    const dressing = this.TrenchDressing(plan);
    if (dressing) {
      try {
        // 只画选中段的布设件：全网一千多只盒子会把面板拖成幻灯片，
        // 而且看的人分不清哪一根护壁属于哪条沟。
        dressed = BuildTrenchDressingPreview(collector, dressing, {
          groundAt: (x, z) => this.GroundAt(x, z),
          filter: (item) => String(item.id || "").startsWith(route.id),
        });
      } catch (error) {
        console.warn("[SplineEditor] 壕沟布设预览生成失败：", error);
      }
    }
    for (const [name, geometries] of byMaterial) {
      const material = this.PreviewMaterial(name, {
        color: TRENCH_PREVIEW_COLORS[name],
        opacity: name === "trench" ? 0.86 : 0.55,
      });
      for (const geometry of geometries) {
        const mesh = new THREE.Mesh(geometry, material);
        mesh.renderOrder = name === "trench" ? 899 : 900;
        this.group.add(mesh);
      }
    }
    this.trenchStats = stats ? {
      ...stats, ...dressed,
      revision: TrenchRevision(),
      segments: plan.segments?.length ?? 0,
      networkJunctions: plan.junctions?.length ?? 0,
    } : null;
  }

  BuildRoadPreview(route) {
    const geoms = [];
    const collector = {
      Add: (material, geometry) => geoms.push(geometry),
      Solid: () => {}, SetSector: () => {},
    };
    const path = MakeRoadPath(route.points);
    // 抬 0.04 盖在现路上；深度上的错开靠 polygonOffset，不靠这点高差
    const groundAt = (x, z) => this.GroundAt(x, z) + 0.04;
    try {
      if (route.railway) {
        // 数据驱动的铁路：与建关同一条 BuildRailwayFromSpec，只把控制点换成面板里拖过的
        BuildRailwayFromSpec(collector, { ...route.railway, points: route.points }, { groundAt });
      } else if (route.kind === "railway") {
        const crown = MakeCrownProfile(path, {
          groundAt, step: 4, smooth: route.lift < 1 ? 4 : 0, lift: route.lift ?? 1.35,
        });
        BuildRailBed(collector, {
          path, groundAt, crownAt: crown.At, topHalf: 3.4,
          step: 4, chunkLen: 1e9, seed: `preview:${route.key}`,
        });
      } else {
        BuildRoadRibbon(collector, {
          path, width: route.width, groundAt,
          crown: route.crown ?? 0.05, skirtDrop: route.skirt ?? 0.5,
          step: 4, chunkLen: 1e9, seed: `preview:${route.key}`,
          // 与游戏侧同一条自动断水规则：预览不许把裙边垂进护城河/河槽
          cutWhere: (x, z) => this.WaterAt(x, z),
        });
      }
    } catch (error) {
      console.warn("[SplineEditor] 道路预览生成失败：", error);
    }
    const material = this.PreviewMaterial(route.kind);
    for (const geometry of geoms) {
      const mesh = new THREE.Mesh(geometry, material);
      mesh.renderOrder = 899;
      this.group.add(mesh);
    }
  }

  /** 围墙预览：调真的 BuildWallSpline，把实例化桶原样摆出来（半透明覆盖色）。 */
  BuildWallPreview(route) {
    const stub = { props: [], Solid: () => {}, Cover: () => {}, SetSector: () => {} };
    try {
      // 预设打底 + 这条路线自己的缺口/破口/种子 —— 与建城时同一条调用
      BuildWallSpline(stub, {
        preset: route.wall?.preset || "zhaiWall",
        name: `preview:${route.key}`,
        material: "preview", tag: "preview",
        points: route.points, closed: !!route.closed,
        height: route.height, topWidth: route.topWidth, baseWidth: route.baseWidth,
        seed: route.wall?.seed || route.key,
        gaps: route.wall?.gaps || [],
        breaches: route.wall?.breaches || [],
        randomBreaches: route.wall?.randomBreaches || null,
        damage: route.wall?.damage ?? 0,
        coverSign: route.wall?.coverSign ?? 1,
        groundAt: (x, z) => this.GroundAt(x, z) + 0.04,
      });
    } catch (error) {
      console.warn("[SplineEditor] 围墙预览生成失败：", error);
      return;
    }
    const material = this.PreviewMaterial("wall");
    for (const p of stub.props) {
      if (p.kind !== "wallInstances" || !p.matrices.length) continue;
      const mesh = MakeInstanced(p.geometry, material, p.matrices,
        { castShadow: false, receiveShadow: false });
      mesh.renderOrder = 899;
      this.group.add(mesh);
    }
  }

  // -------------------------------------------------------------------------
  // 还原 / 存取
  // -------------------------------------------------------------------------

  RevertSelected() {
    const route = this.selected;
    if (!route) return;
    delete this.overrides[route.key];
    this.dirty = true;
    this.Save();
    this.routes = this.Collect();
    this.FillList();
    this.Select(route.key, { fly: false });
    this.host.SetHint(`已还原 ${route.label}`);
  }

  RevertAll() {
    this.overrides = {};
    this.presetEdits = {};
    // 段覆盖与预设覆盖住在规划层里，不在这张表里 —— 「全部还原出厂」要把那边也清掉，
    // 否则面板上显示的是出厂值、建关时吃的还是上一轮拖出来的数。
    ClearTrenchSegmentOverrides();
    this.trenchPushed = new Set();
    this.trenchPlanCache = null;
    this.trenchDressingCache = null;
    this.ApplyPresetEdits();
    this.SyncPresetUi();
    this.dirty = false;
    try {
      window.localStorage.removeItem(STORE_KEY);
      window.localStorage.removeItem(LEGACY_STORE_KEY);
    } catch (error) { /* 无痕模式 */ }
    this.routes = this.Collect();
    this.selectedPoint = -1;
    this.FillList();
    this.BuildOverlay();
    this.host.SetHint("已还原全部路线");
  }

  Save() {
    if (!this.dirty) return;
    try {
      window.localStorage.setItem(STORE_KEY, JSON.stringify({
        ...this.overrides, __presets: this.presetEdits,
      }));
    } catch (error) { /* 无痕模式：存不下就算了 */ }
  }

  Restore() {
    try {
      const raw = window.localStorage.getItem(STORE_KEY)
        || window.localStorage.getItem(LEGACY_STORE_KEY);
      if (!raw) return;
      const data = JSON.parse(raw);
      if (data && typeof data === "object") {
        const { __presets: presets, ...routes } = data;
        this.overrides = routes;
        this.presetEdits = (presets && typeof presets === "object") ? presets : {};
        this.dirty = true;
      }
    } catch (error) { /* 存坏了就用出厂表 */ }
  }

  // -------------------------------------------------------------------------
  // 布设参数（WALL_PRESETS 的改动）
  // -------------------------------------------------------------------------

  /** 把面板里的预设改动推给 Script_WallSpline / Script_TrenchPlan —— 预览与建关读的是同一份。 */
  ApplyPresetEdits() {
    for (const name of Object.keys(WALL_PRESETS)) {
      SetWallPresetOverride(name, this.presetEdits[name] || null);
    }
    ClearTrenchPresetOverrides();
    for (const name of Object.keys(TRENCH_PRESETS)) {
      const edits = this.presetEdits[TRENCH_PRESET_PREFIX + name];
      if (edits) SetTrenchPresetOverride(name, ExpandTrenchPatch(name, edits));
    }
    this.trenchPlanCache = null;
    this.trenchDressingCache = null;
  }

  /** 当前预设的完整参数（出厂值 + 面板改动）。 */
  PresetValues(name = this.presetKey) {
    const p = WallPreset(name);
    const out = {};
    for (const row of WALL_PARAMS) out[row.key] = p[row.key] ?? PARAM_DEFAULTS[row.key];
    return out;
  }

  PatchPreset(key, value) {
    const patch = { ...(this.presetEdits[this.presetKey] || {}), [key]: value };
    this.presetEdits[this.presetKey] = patch;
    SetWallPresetOverride(this.presetKey, patch);
    this.dirty = true;
    this.Save();
    this.FillPresetList();
    this.BuildOverlay();
  }

  /** 壕沟预设的一根滑杆。存扁平点号键，推之前展开成嵌套 patch。 */
  PatchTrenchPreset(key, value) {
    const name = TrenchPresetName(this.presetKey);
    if (!name) return;
    const edits = { ...(this.presetEdits[this.presetKey] || {}), [key]: value };
    this.presetEdits[this.presetKey] = edits;
    SetTrenchPresetOverride(name, ExpandTrenchPatch(name, edits));
    this.dirty = true;
    this.Save();
    this.RefreshAssetFacts();
    this.FillPresetList();
    this.BuildOverlay();
  }

  RevertPreset() {
    const trenchName = TrenchPresetName(this.presetKey);
    const label = trenchName
      ? `壕沟 · ${TRENCH_PRESETS[trenchName]?.label || trenchName}`
      : (WALL_PRESETS[this.presetKey]?.label || this.presetKey);
    delete this.presetEdits[this.presetKey];
    if (trenchName) SetTrenchPresetOverride(trenchName, null);
    else SetWallPresetOverride(this.presetKey, null);
    this.dirty = true;
    this.Save();
    this.SyncPresetUi();
    this.FillPresetList();
    this.BuildOverlay();
    this.host.SetHint(`已还原预设 ${label}`);
  }

  IsAxisAligned(points) {
    if (points.length !== 2) return false;
    return Math.abs(points[0][0] - points[1][0]) < 0.01
      || Math.abs(points[0][1] - points[1][1]) < 0.01;
  }

  /** 闭环矩形来源：四点、逐边轴对齐才誊得回 x/z/w/d。 */
  IsAxisRect(points) {
    if (points.length !== 4) return false;
    for (let i = 0; i < 4; i += 1) {
      const a = points[i], b = points[(i + 1) % 4];
      if (Math.abs(a[0] - b[0]) > 0.01 && Math.abs(a[1] - b[1]) > 0.01) return false;
    }
    return true;
  }

  ExportWarning(route) {
    // 壕沟里有四条段的点子**不是壕沟自己的**：它们直接引用任务/AI 路线
    // （approachRoute、FRONT_SORTIE.route、evacuation）。在面板里把这种段拖弯了，
    // 誊回壕沟表是没用的 —— 下次建关还是从路线那边读。必须誊回 source 指的那个文件。
    if (route.kind === "trench") {
      return route.trench?.routeBound
        ? "点来自路线数据（source），誊回那边而不是壕沟表" : null;
    }
    if (!route.axisLocked) return null;
    if (route.closed) {
      return this.IsAxisRect(route.points) ? null
        : "源数据是矩形格式，这四个点已不再是轴对齐矩形 —— 誊回前要么摆正、要么改数据格式";
    }
    return this.IsAxisAligned(route.points) ? null
      : "源数据是轴对齐格式，这串点已不再是轴对齐两点 —— 誊回前要么拉直、要么改数据格式";
  }

  Export() {
    const edited = this.routes.filter((r) => this.overrides[r.key]);
    const presets = Object.keys(this.presetEdits);
    if (!edited.length && !presets.length) {
      this.io.value = "（没有改动 —— 面板里改过的路线/预设才会出现在导出里）";
      return;
    }
    const Size = (r) => {
      if (r.kind === "wall") return { height: r.height };
      if (r.kind === "trench") {
        return { trench: { depth: r.trench?.depth, widthScale: r.trench?.widthScale } };
      }
      return { width: r.width };
    };
    const payload = {
      routes: edited.map((r) => {
        const warning = this.ExportWarning(r);
        return {
          key: r.key, id: r.id, source: r.source,
          ...Size(r),
          points: r.points,
          ...(warning ? { warning } : {}),
        };
      }),
      // 布设参数：墙誊回 WALL_PRESETS，壕沟誊回 TRENCH_PRESETS。
      // 两套住在同一张 edits 表里，靠 `trench:` 前缀分（预设名 loop/fire 两边都有）。
      presets: presets.length ? {
        source: "Script_WallSpline.mjs → WALL_PRESETS",
        trenchSource: "Script_TrenchPlan.mjs → TRENCH_PRESETS（键名前缀 trench:，点号键 = 嵌套字段）",
        edits: this.presetEdits,
      } : undefined,
    };
    this.io.value = JSON.stringify(payload, null, 1);
    this.io.select();
    this.host.SetHint(`已导出 ${edited.length} 条路线 / ${presets.length} 个预设改动`);
  }

  Import() {
    let data = null;
    try {
      data = JSON.parse(this.io.value);
    } catch (error) {
      this.host.SetHint("解析不了：这里只吃导出的那种 JSON");
      return;
    }
    // 老格式（改名前）是一个纯数组，认；新格式是 { routes, presets }
    const list = Array.isArray(data) ? data : (data && data.routes) || [];
    const presetEdits = (!Array.isArray(data) && data && data.presets && data.presets.edits) || null;
    if (!list.length && !presetEdits) { this.host.SetHint("空表，没有导入"); return; }
    let count = 0;
    for (const item of list) {
      if (!item.key || !Array.isArray(item.points) || item.points.length < 2) continue;
      this.overrides[item.key] = {
        width: item.width, height: item.height, points: item.points,
        ...(item.trench ? { trench: item.trench } : {}),
      };
      count += 1;
    }
    let presetCount = 0;
    for (const [name, patch] of Object.entries(presetEdits || {})) {
      if (!patch || typeof patch !== "object") continue;
      const trenchName = TrenchPresetName(name);
      if (trenchName ? !TRENCH_PRESETS[trenchName] : !WALL_PRESETS[name]) continue;
      this.presetEdits[name] = patch;
      presetCount += 1;
    }
    this.ApplyPresetEdits();
    this.dirty = true;
    this.Save();
    this.routes = this.Collect();
    this.FillList();
    this.FillPresetList();
    this.SyncPresetUi();
    this.BuildAssets();
    this.BuildOverlay();
    this.host.SetHint(`已导入 ${count} 条路线 / ${presetCount} 个预设改动`);
  }

  // -------------------------------------------------------------------------
  // 读数
  // -------------------------------------------------------------------------

  RefreshFacts() {
    if (!this.facts) return;
    const camera = this.host.camera;
    this.facts.Set("相机 X / Z",
      `${camera.position.x.toFixed(1)} / ${camera.position.z.toFixed(1)}`);
    const ground = this.GroundAt(camera.position.x, camera.position.z);
    this.facts.Set("地高", `${ground.toFixed(2)} m`);
    const route = this.selected;
    if (route) {
      const path = this.RoutePath(route);
      let size = `${(route.width ?? 0).toFixed(1)} m 宽`;
      if (route.kind === "wall") size = `${(route.height ?? 0).toFixed(2)} m 高`;
      if (route.kind === "trench") {
        size = `${(route.trench?.depth ?? 0).toFixed(2)} m 深 × ${(route.trench?.widthScale ?? 1).toFixed(2)}`;
      }
      this.facts.Set("路线", `${route.label} · ${size}`);
      this.facts.Set("长度 / 控制点",
        `${path.length.toFixed(0)} m / ${route.points.length} 点${route.closed ? "（闭环）" : ""}`);
      this.facts.Set("选中点", this.selectedPoint >= 0
        ? `#${this.selectedPoint} (${route.points[this.selectedPoint][0]}, ${route.points[this.selectedPoint][1]})`
        : "无");
      if (route.kind === "trench" && this.trenchStats) {
        const t = this.trenchStats;
        this.facts.Set("壕沟 站/三角/接口",
          `${t.stations} / ${t.triangles} / ${t.junctions}（全网 ${t.networkJunctions}）`);
        this.facts.Set("布设件 / 编译版本", `${t.blocks} 块 + ${t.placements} 件 · rev ${t.revision}`);
        this.facts.Set("实测深度 最浅/最深",
          `${t.minDepth.toFixed(2)} / ${t.maxDepth.toFixed(2)} m`);
      }
    }
    const messages = [];
    if (this.dirty) messages.push("有未导出的改动 —— 基线在源码里，记得誊回去");
    const sel = this.selected;
    // routeBound 的壕沟段**永远**带着那句誊回警告。只有真拖过点才提 ——
    // 否则状态栏一进面板就黄着，读的人两天就学会无视它。
    const mute = sel?.kind === "trench" && !this.overrides[sel.key];
    const warning = sel && !mute ? this.ExportWarning(sel) : null;
    if (warning) messages.push(warning);
    this.status.textContent = messages.join(" · ");
    this.status.classList.toggle("warn", messages.length > 0);
  }
}

export default SplineEditor;
