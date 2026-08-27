// 样条围墙生成器：寨墙 / 坝墙 / 干垒石墙 / 村院墙共用的**唯一**一份沿线布墙代码。
//
// 摆位计划在 Script_WallPlan（纯数学，Node 可测）；本文件负责三件事：
//   1. 按风格烘 variants 份「墙段模块」几何（顶檐各不相同，taper/护坡土按风格）
//   2. 把计划里的模块按「变体 × 分区」分桶成 InstancedMesh 的矩阵表 + 逐实例色
//   3. 碰撞盒 / 掩体点照旧走 BuildSink（碰撞不实例化 —— AI/破坏/命中读的是 OBB 表）
//
// ## 为什么是 InstancedMesh 而不是继续 MergeGeometries
// 一条 660 m 的坝墙合并出 ~220 段独立盒子几何（约 5 万顶点、全部常驻显存），
// 而它本质是同一个模块的 220 次摆放。实例化后顶点只有 variants 份模块自己的，
// 每份一次 draw（× 分区数），矩阵表 16 float/段。仓库先例：沙包/瓦砾
// （Script_TengxianCity.FlushProps）、布设 PropBatch、人物 ActorBatch。
//
// ## 与光照/管线的契约（改材质注入的人注意）
// 实例化网格吃 GI 的唯一保证是 Script_Materials.InjectIndirectLighting 里
// USE_INSTANCING 分支重算的 vGiWorldPos —— 本文件只用 library 出的共享材质，
// 不许另配自定义材质。逐实例色走 instanceColor（r185 下 instanceColor 自动
// 定义 USE_COLOR，材质不用开 vertexColors）。
//
// ## 已知让步
// 实例化材质不吃破口 OBB 裁切（那是 library.Static 合并网格的通道）。
// 围墙类 tag（zhaiWall / villageStoneWall / villageCourtyard）的运行时破坏
// 当前本来就关着（Data_Destruction.GAMEPLAY_DESTRUCTION_ENABLED = false），
// 破坏预览编辑器里凿这些墙会只掉碰撞不掉画面 —— 账记在 docs/Data_WallSpline.md。

import * as THREE from "three";
import {
  MakeBox, MergeGeometries, MakeInstanced, TILE_METERS, BRICK_UV_GRID,
} from "./Script_Geo.mjs";
import { Mulberry32, HashString } from "./Script_Noise.mjs";
import { PlanWallRoute } from "./Script_WallPlan.mjs";

export { PlanWallRoute };

// ---------------------------------------------------------------------------
// 风格表：几何侧的差异全在这里（规划侧的数值差异由调用方传参）
// ---------------------------------------------------------------------------

export const WALL_STYLES = {
  // 夯土寨墙/坝墙：断面收分（顶窄底宽）、墙脚一条护坡土裙（把逐段采地的缝盖住）
  rammedEarth: {
    label: "夯土圩墙", tile: TILE_METERS.adobe, grid: null,
    taper: true, foot: true, crest: 0.06,
  },
  // 干垒石墙：不收分、顶更参差、无护坡
  dryStone: {
    label: "干垒石墙", tile: TILE_METERS.stone, grid: null,
    taper: false, foot: false, crest: 0.11,
  },
  // 村院土坯墙：薄板、顶微参差
  yardAdobe: {
    label: "土坯院墙", tile: TILE_METERS.adobe, grid: null,
    taper: false, foot: false, crest: 0.035,
  },
  // 村院砖墙：同上，砖 UV 错缝
  yardBrick: {
    label: "青砖院墙", tile: TILE_METERS.brick, grid: BRICK_UV_GRID,
    taper: false, foot: false, crest: 0.03,
  },
  // 城内/机关院墙：与 yardBrick 同断面，墙头几乎齐平（有瓦压顶压着，
  // 顶再参差就成了"压顶浮在缺口上"——旧 AddWall 里那条已修的病）
  cityBrick: {
    label: "城内砖院墙", tile: TILE_METERS.brick, grid: BRICK_UV_GRID,
    taper: false, foot: false, crest: 0.012,
  },
  // 枣刺篱笆：不是一块板，是「立柱 + 两道横杆 + 斜绑枝条」编出来的一段
  wattle: {
    label: "枣刺篱笆", tile: TILE_METERS.wood, grid: null,
    taper: false, foot: false, crest: 0, wattle: true,
  },
};

// ---------------------------------------------------------------------------
// 布设预设表：一处改，全城跟着改
//
// 为什么要有这一张表：调用点只说「我是哪一路墙」，间隔/重叠/抖动/变体数这些
// **布设参数**统一落在这里。编辑器（场景样条PCG →「拼接资产 / 布设参数」）
// 读的就是本表，改的也是本表 —— 面板里看到的数与建城用的数是同一份。
//
// 每一项 = PlanWallRoute 的参数 + 本层的 style / plinth / cope，外加一个
// `sample`（编辑器资产台拿它当"这一路墙长什么尺寸、什么材质"的样品，
// 建城时一个字都不读 —— 真尺寸永远来自调用点）。
// 调用点仍可逐条覆盖（尺寸、缺口、种子这类"这一条墙自己的事"）。
// ---------------------------------------------------------------------------

/** 碱脚：旧砖墙下面那两三皮深色条石。旧 AddWall 里那一条，搬成实例化。 */
const PLINTH_STONE = { material: "Stone", height: 0.42, grow: 0.06, out: 0.07 };
const PLINTH_CROSS = { material: "CrossStone", height: 0.42, grow: 0.06, out: 0.07 };
/** 瓦压顶：跟着**每一个模块**自己的墙头落，不是一根悬空长条。 */
const COPE_TILE = { material: "RoofTile", height: 0.09, grow: 0.05, out: 0.16, minH: 0.55 };

export const WALL_PRESETS = {
  zhaiWall: {
    label: "东关寨墙（夯土）", style: "rammedEarth",
    moduleLen: 3.2, moduleOverlap: 0.02, embed: 0.5, variants: 4,
    heightJitter: 0.10, heightCell: 18, leanJitter: 0.020, yawJitter: 0.010,
    sideJitter: 0.06, thickJitter: 0.08, tintJitter: 0.06, coverEvery: 3,
    sample: { material: "ZhaiEarth", height: 4.2, baseWidth: 1.5, topWidth: 0.7 },
  },
  stockade: {
    label: "北关坝墙（夯土）", style: "rammedEarth",
    moduleLen: 3.0, moduleOverlap: 0.02, embed: 0.5, variants: 4,
    heightJitter: 0.10, heightCell: 18, leanJitter: 0.020, yawJitter: 0.010,
    sideJitter: 0.08, thickJitter: 0.08, tintJitter: 0.06, coverEvery: 3,
    sample: { material: "ZhaiEarth", height: 2.2, baseWidth: 1.1, topWidth: 0.5 },
  },
  villageStone: {
    label: "石墙村圩墙（干垒）", style: "dryStone",
    moduleLen: 4.5, moduleOverlap: 0.02, embed: 0.35, variants: 4,
    heightJitter: 0.16, heightCell: 18, leanJitter: 0.020, yawJitter: 0.010,
    sideJitter: 0.06, thickJitter: 0.08, tintJitter: 0.06,
    collapseChance: 0.18, coverEvery: 2,
    sample: { material: "DryStone", height: 1.45, baseWidth: 0.55, topWidth: 0.55 },
  },
  villageCourtyardAdobe: {
    label: "村院墙（土坯）", style: "yardAdobe",
    moduleLen: 2.8, moduleOverlap: 0.02, embed: 0.35, variants: 4,
    heightJitter: 0.07, heightCell: 18, leanJitter: 0.020, yawJitter: 0.010,
    sideJitter: 0.03, thickJitter: 0.08, tintJitter: 0.06,
    edgeCollapseChance: 0.16, coverEvery: 3,
    sample: { material: "Adobe", height: 1.55, baseWidth: 0.28, topWidth: 0.28 },
  },
  villageCourtyardBrick: {
    label: "村院墙（砖）", style: "yardBrick",
    moduleLen: 2.8, moduleOverlap: 0.02, embed: 0.35, variants: 4,
    heightJitter: 0.07, heightCell: 18, leanJitter: 0.020, yawJitter: 0.010,
    sideJitter: 0.03, thickJitter: 0.08, tintJitter: 0.06,
    edgeCollapseChance: 0.16, coverEvery: 3,
    sample: { material: "HouseBrick", height: 1.55, baseWidth: 0.28, topWidth: 0.28 },
  },
  // --- 城内 / 关厢：平地、砌得齐整。抖动只留"手砌不是激光切"的量 ---
  // 城内那几百圈院墙原来是 AddWall 逐 0.85 m 切片合并出来的（一格院子四面墙
  // ≈ 90 片盒子）。转到本管线后同几何按分区实例化，逐模块的差别改由
  // ruin / 变体 / tint 提供 —— 参数一律压得比土墙小一档：
  // 城里的院墙是拿线砌的，歪一点是旧，歪多了就成了危房。
  //
  // **variants 为什么是 1**：变体之间的差别只有「顶四角各抬压 crest×height」，
  // cityBrick 的 crest 是 0.012 —— 2.2 m 的墙上差 2.6 cm，人眼读不出来，
  // 而每多一份变体就是「每分区每材质多一只 InstancedMesh」（城内十几个分区
  // × 三四种墙材，实测 +120 draw call）。城内院墙的差别本来就不该来自几何变体，
  // 而是来自逐实例的 ruin 咬口 / 高度包络 / tint —— 那几路一分钱 draw call 不花。
  // 土坯墙 crest 0.035（1.9 m 上差 6.6 cm，读得出来）所以留两份。
  cityYardBrick: {
    label: "城内砖院墙", style: "cityBrick",
    moduleLen: 2.2, moduleOverlap: 0.03, embed: 0.12, variants: 1,
    heightJitter: 0.035, heightCell: 26, leanJitter: 0.005, yawJitter: 0.003,
    sideJitter: 0.015, thickJitter: 0.05, tintJitter: 0.055,
    coverEvery: 5, coverMinH: 0.45, colliderMerge: 0.5,
    plinth: PLINTH_CROSS, cope: COPE_TILE,
    geoQuantH: 1.0, geoQuantW: 0.15,
    sample: { material: "BrickWall", height: 2.15, baseWidth: 0.35, topWidth: 0.35 },
  },
  cityYardAdobe: {
    label: "城内土坯院墙", style: "yardAdobe",
    moduleLen: 2.4, moduleOverlap: 0.03, embed: 0.12, variants: 2,
    heightJitter: 0.055, heightCell: 22, leanJitter: 0.010, yawJitter: 0.006,
    sideJitter: 0.025, thickJitter: 0.06, tintJitter: 0.06,
    coverEvery: 5, coverMinH: 0.45, colliderMerge: 0.5,
    plinth: PLINTH_CROSS, cope: null,
    geoQuantH: 1.0, geoQuantW: 0.15,
    sample: { material: "Adobe", height: 1.9, baseWidth: 0.42, topWidth: 0.42 },
  },
  /** 机关/学校/庙/当铺的院墙：比民居高一档，条石碱脚 + 瓦压顶。 */
  landmarkYard: {
    label: "机关院墙（砖·条石碱脚）", style: "cityBrick",
    moduleLen: 2.4, moduleOverlap: 0.03, embed: 0.12, variants: 1,
    heightJitter: 0.03, heightCell: 30, leanJitter: 0.004, yawJitter: 0.0025,
    sideJitter: 0.012, thickJitter: 0.04, tintJitter: 0.05,
    coverEvery: 4, coverMinH: 0.45, colliderMerge: 0.5,
    plinth: PLINTH_STONE, cope: COPE_TILE,
    geoQuantH: 1.0, geoQuantW: 0.15,
    sample: { material: "BrickWall", height: 2.6, baseWidth: 0.45, topWidth: 0.45 },
  },
  /** 同上但不上压顶（教堂院墙那一路：只有碱脚）。 */
  landmarkYardPlain: {
    label: "机关院墙（无压顶）", style: "cityBrick",
    moduleLen: 2.4, moduleOverlap: 0.03, embed: 0.12, variants: 1,
    heightJitter: 0.03, heightCell: 30, leanJitter: 0.004, yawJitter: 0.0025,
    sideJitter: 0.012, thickJitter: 0.04, tintJitter: 0.05,
    coverEvery: 4, coverMinH: 0.45, colliderMerge: 0.5,
    plinth: PLINTH_CROSS, cope: null,
    geoQuantH: 1.0, geoQuantW: 0.15,
    sample: { material: "HouseBrick", height: 2.2, baseWidth: 0.35, topWidth: 0.35 },
  },
  /**
   * 监狱 / 看守所围墙：**整段匀质的高墙**（形制要点，见 Script_Landmark_Prison
   * 头注②）。所以模块取到 9.5 m、变体只两份、抖动近乎零 —— 它读作"一整片"，
   * 不许读成一段一段砌起来的院墙。碱脚 0.55 高、压顶 0.13 厚，都比民居粗一档。
   */
  prisonWall: {
    label: "监狱围墙（整段高墙）", style: "cityBrick",
    moduleLen: 9.5, moduleOverlap: 0.01, embed: 0.10, variants: 2,
    heightJitter: 0.0, heightCell: 40, leanJitter: 0, yawJitter: 0,
    sideJitter: 0, thickJitter: 0, tintJitter: 0.03,
    coverEvery: 1, coverMinH: 0.28, colliderMerge: 0.35,
    plinth: { material: "Stone", height: 0.55, grow: 0.0, out: 0.10 },
    cope: { material: "RoofTile", height: 0.13, grow: 0.0, out: 0.28, minH: 0.94 },
    geoQuantH: 1.0, geoQuantW: 0.15,
    sample: { material: "PrisonWall", height: 4.6, baseWidth: 0.55, topWidth: 0.55 },
  },
  /** 枣刺篱笆：模块 = 一档立柱 + 两道横杆 + 一把斜枝。 */
  wattleFence: {
    label: "枣刺篱笆", style: "wattle",
    moduleLen: 1.9, moduleOverlap: 0.0, embed: 0.02, variants: 4,
    heightJitter: 0.06, heightCell: 9, leanJitter: 0.03, yawJitter: 0.02,
    sideJitter: 0.03, thickJitter: 0.04, tintJitter: 0.08,
    coverEvery: 4, coverMinH: 0.45, colliderMerge: 0.5,
    geoQuantH: 0.5, geoQuantW: 0.1,
    sample: { material: "WattleFence", height: 1.12, baseWidth: 0.18, topWidth: 0.09 },
  },
};

/**
 * 编辑器改过的预设（只在本次会话里生效，导出后要誊回上表）。
 * 建城与预览读同一份 —— 面板里调完立刻重建关卡就能看到，不用改源码。
 */
const PRESET_OVERRIDES = new Map();

/** 编辑器调用：patch 为 null 表示还原该预设。 */
export function SetWallPresetOverride(name, patch) {
  if (!patch) PRESET_OVERRIDES.delete(name);
  else PRESET_OVERRIDES.set(name, patch);
}

export function ClearWallPresetOverrides() { PRESET_OVERRIDES.clear(); }

/** 取一份预设（已叠加编辑器改动）。未知名字返回空表 —— 调用方自己传全套参数。 */
export function WallPreset(name) {
  const base = WALL_PRESETS[name];
  if (!base) return {};
  const patch = PRESET_OVERRIDES.get(name);
  return patch ? { ...base, ...patch } : { ...base };
}

/**
 * 一档篱笆模块：**一根立柱在段首** + 两道横杆 + 一把斜绑枝条。
 * 立柱放在 -x 端而不是中间，相邻模块首尾相接时柱子正好每 moduleLen 一根，
 * 不会两根挤在一处（旧 AddWattleFence 按 postEvery 单独排柱就是这个间距）。
 */
function MakeWattleModuleGeometry(variant, { moduleLen, height }, seed) {
  const rnd = Mulberry32(HashString(`${seed}:wattle${variant}`));
  const parts = [];
  const H = height;
  const Put = (w, h, d, x, y, z, { rx = 0, rz = 0 } = {}) => {
    const g = MakeBox(w, h, d, TILE_METERS.wood, `${seed}:v${variant}:${parts.length}`);
    if (rz) g.rotateZ(rz);
    if (rx) g.rotateX(rx);
    g.translate(x, y - H / 2, z);
    parts.push(g);
  };
  Put(0.09, H * 0.94 + rnd() * 0.06 * H, 0.09,
    -moduleLen / 2, H * 0.5, 0, { rz: (rnd() - 0.5) * 0.08 });
  for (const f of [0.375, 0.77]) {
    Put(moduleLen * 1.04, 0.06, 0.05, 0, H * f, 0);
  }
  // 枝条**斜着绑、近乎横躺**（rz ≈ 85°）：枣刺篱笆是把枝条一层层压进两道横杆里
  // 编出来的，不是钉一排竖栅栏。旧 AddWattleFence 逐件摆时就是这个姿态，
  // 换成模块时照抄 —— 立起来会读成木栅栏，那是另一种围挡。
  const brush = Math.max(2, Math.round(moduleLen / 0.75));
  for (let i = 0; i < brush; i += 1) {
    const bx = -moduleLen / 2 + (moduleLen / brush) * (i + 0.5);
    Put(0.05, H * (0.82 + rnd() * 0.22), 0.03, bx, H * 0.49, 0,
      { rx: (rnd() - 0.5) * 0.16, rz: (Math.PI / 2) * 0.94 + rnd() * 0.06 });
  }
  const merged = MergeGeometries(parts);
  merged.computeVertexNormals();
  merged.computeBoundingSphere();
  return merged;
}

/**
 * 碱脚 / 压顶的条料几何（长轴 = +x，原点在自己的几何中心）。
 * 单独一只实例网格：材质与墙身不同（条石 / 小青瓦），而且**不跟着墙身的
 * 高度缩放走** —— 压顶被拉成 1.4 倍厚的瓦条是旧版合并几何时没有的病。
 */
function MakeWallTrimGeometry(trim, { moduleLen, baseWidth }, seed) {
  const tile = trim.material === "RoofTile" ? TILE_METERS.roof : TILE_METERS.stone;
  const g = MakeBox(moduleLen + (trim.grow ?? 0.06), trim.height,
    baseWidth + (trim.out ?? 0.07), tile, seed);
  g.computeBoundingSphere();
  return g;
}

/**
 * 烘一份墙段模块几何（局部原点在模块几何中心，长轴 = +x）。
 * 顶部四角按变体种子各自抬压：模块级的「顶不平」；相邻实例又各挑变体，
 * 一条墙的天际线就不再是一根直线。
 */
function MakeWallModuleGeometry(styleKey, variant, {
  moduleLen, height, topWidth, baseWidth,
}, seed) {
  const style = WALL_STYLES[styleKey];
  if (!style) throw new Error(`未知墙体风格 ${styleKey}`);
  if (style.wattle) {
    return MakeWattleModuleGeometry(variant, { moduleLen, height }, seed);
  }
  const rnd = Mulberry32(HashString(`${seed}:geo${variant}`));
  const body = MakeBox(moduleLen, height, baseWidth, style.tile,
    `${seed}:v${variant}`, style.grid);
  const position = body.attributes.position;
  const topScale = style.taper ? Math.max(0.2, topWidth / baseWidth) : 1;
  // 顶四角位移：按 (signX, signZ) 归到同一角，保证共享角的三个面同步动
  const cornerDy = {};
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      cornerDy[`${sx}${sz}`] = (rnd() - 0.5) * 2 * style.crest * height;
    }
  }
  for (let i = 0; i < position.count; i += 1) {
    if (position.getY(i) < height / 2 - 1e-4) continue;
    const key = `${Math.sign(position.getX(i)) || 1}${Math.sign(position.getZ(i)) || 1}`;
    position.setY(i, position.getY(i) + cornerDy[key]);
    if (topScale !== 1) position.setZ(i, position.getZ(i) * topScale);
  }
  body.computeVertexNormals();
  if (!style.foot) {
    body.computeBoundingSphere();
    return body;
  }
  // 护坡土：夯土圩子不是一块立起来的板，脚下总堆着塌下来的土（坝墙实拍的账）
  const footW = baseWidth * (1.7 + rnd() * 0.5);
  const foot = MakeBox(moduleLen * 1.05, 0.9, footW, style.tile, `${seed}:f${variant}`);
  foot.translate(0, -height / 2 + 0.36, 0);
  const merged = MergeGeometries([body, foot]);
  merged.computeBoundingSphere();
  return merged;
}

// ---------------------------------------------------------------------------
// 建造
// ---------------------------------------------------------------------------

/** 预设打底 + 调用点覆盖（显式 undefined 不算覆盖）。 */
function MergePreset(opts) {
  if (!opts.preset) return opts;
  const out = WallPreset(opts.preset);
  for (const key of Object.keys(opts)) {
    if (opts[key] !== undefined) out[key] = opts[key];
  }
  return out;
}

/**
 * 把一份预设烘成**可以直接看的原始拼接件**：变体模块 + 碱脚条 + 压顶条。
 * 编辑器的「拼接资产」台读它 —— 面板上摆出来的就是建城时真正拿去实例化的
 * 那几只几何，不是另画一份示意。
 *
 * @returns {{ style, nominal, variants: THREE.BufferGeometry[],
 *            plinth: {geometry, material}|null, cope: {geometry, material}|null }}
 */
export function MakeWallAssetSet(presetName, override = {}) {
  const preset = { ...WallPreset(presetName), ...override };
  const style = preset.style || "rammedEarth";
  const moduleLen = preset.moduleLen ?? 3.0;
  const height = (preset.height ?? 2.0) + (preset.embed ?? 0.5);
  const baseWidth = preset.baseWidth ?? 0.9;
  const topWidth = preset.topWidth ?? baseWidth;
  const nominal = {
    moduleLen, height, baseWidth, topWidth,
    moduleOverlap: preset.moduleOverlap ?? 0.02, embed: preset.embed ?? 0.5,
  };
  const seed = `asset:${presetName}`;
  const variants = [];
  for (let v = 0; v < (preset.variants ?? 4); v += 1) {
    variants.push(MakeWallModuleGeometry(style, v, nominal, seed));
  }
  return {
    style, preset, nominal, variants,
    plinth: preset.plinth
      ? {
        geometry: MakeWallTrimGeometry(preset.plinth, nominal, `${seed}:pl`),
        material: preset.plinth.material, spec: preset.plinth,
      } : null,
    cope: preset.cope
      ? {
        geometry: MakeWallTrimGeometry(preset.cope, nominal, `${seed}:cp`),
        material: preset.cope.material, spec: preset.cope,
      } : null,
  };
}

/**
 * 沿样条建一条围墙。规划参数见 Script_WallPlan.PlanWallRoute；本层追加：
 *
 * @param sink BuildSink（真的，编辑器传替身也行：要有 Solid/Cover/props）
 * @param {object} opts
 *   preset     WALL_PRESETS 键：布设参数（间隔/重叠/抖动/变体/碱脚/压顶）打底。
 *              调用点显式传的同名参数覆盖它 —— 尺寸、缺口、种子这类
 *              「这一条墙自己的事」照旧写在调用点
 *   style      WALL_STYLES 键
 *   geoQuantH / geoQuantW  几何量化档（米，0 = 不量化）。墙高/墙厚是连续
 *              随机值时**必须给**，否则每一处都烘一套自己的模块几何
 *   plinth     碱脚条 { material, height, grow, out }（null = 不砌）
 *   cope       瓦压顶条 { material, height, grow, out, minH }（null = 不压）
 *   material   材质桶名（ZhaiEarth / DryStone / Adobe / HouseBrick…）
 *   tag        碰撞 tag（zhaiWall / villageStoneWall / villageCourtyard…）
 *   name       实例化网格名前缀（排查 draw call 时认得出是谁）
 *   sectorKey  (x,z)=>string 分区键 —— 每分区一只 InstancedMesh，视锥剔除不失效
 *   castShadow 默认 true
 *
 * 实例化桶不直接进 scene（本层拿不到 scene），推进 sink.props
 * （kind:"wallInstances"），由宿主收尾时调 FlushWallInstances 变成网格 ——
 * 与 sandbags/breachSpill 走 FlushProps 同一条通道。
 *
 * @returns {{ stats, fallenRuns }}
 */
export function BuildWallSpline(sink, opts) {
  const {
    preset = null, style = "rammedEarth", material, tag = "wall", name = "WallSpline",
    sectorKey = null, castShadow = true, plinth = null, cope = null,
    geoQuantH = 0, geoQuantW = 0, label, ...planOpts
  } = MergePreset(opts);
  const plan = PlanWallRoute(planOpts);
  const variants = planOpts.variants ?? 4;
  const nominal = plan.nominal;
  // 几何变体按「风格×材质×尺寸」在 sink 级共享 —— 三十个村院各烘一套变体会
  // 变成一百多只小实例网格，实例化的意义（同几何大批矩阵）就没了。共享后
  // 逐院的差异全靠逐模块随机（高度/姿态/tint/变体挑选），这正是实例化的用法。
  // 缓存挂在 sink 上：几何生命周期 = 一次建关（宿主 Dispose 会 dispose 几何）。
  if (!sink._wallGeoCache) sink._wallGeoCache = new Map();
  // 几何按「量化后的尺寸」烘，实例矩阵再按真实尺寸补一刀缩放。
  //
  // 为什么非有这一步：几何缓存的键里带着墙高与墙厚，而城内每一格院子的墙高
  // 是 `2.15 + rnd()*0.3` 这种**连续随机值** —— 不量化的话 395 格院子各烘一套
  // 变体几何，等于 1185 只几何 + 同样多的 InstancedMesh，实例化的意义（同几何
  // 大批矩阵）当场归零。量化到 geoQuantH / geoQuantW 一档后，全城落进两三套；
  // 真实高度/厚度由 syFix / szFix 精确补回，画面上一米不差，
  // 差的只有顶檐起伏与护坡土那点比例（≤ 一档的百分比，读不出来）。
  const Quant = (v, step) => (step > 0 ? Math.max(step, Math.round(v / step) * step) : v);
  const geoH = Quant(nominal.height, geoQuantH);
  const geoW = Quant(nominal.baseWidth, geoQuantW);
  const wFix = geoW / nominal.baseWidth;
  const geoNominal = {
    moduleLen: nominal.moduleLen, height: geoH,
    baseWidth: geoW, topWidth: nominal.topWidth * wFix,   // 收分比例原样保住
  };
  const syFix = nominal.height / geoH;
  const szFix = 1 / wFix;
  const geoKey = `${style}|${material}|${variants}|${nominal.moduleLen.toFixed(2)}`
    + `|${geoH.toFixed(2)}|${geoNominal.topWidth.toFixed(3)}|${geoW.toFixed(2)}`;
  const TrimGeometry = (trim, kind) => {
    if (!trim) return null;
    const key = `${geoKey}|${kind}|${trim.material}|${trim.height}|${trim.grow}|${trim.out}`;
    let g = sink._wallGeoCache.get(key);
    if (!g) {
      g = MakeWallTrimGeometry(trim, geoNominal, key);
      sink._wallGeoCache.set(key, g);
    }
    return g;
  };
  let geoms = sink._wallGeoCache.get(geoKey);
  if (!geoms) {
    geoms = [];
    for (let v = 0; v < variants; v += 1) {
      geoms.push(MakeWallModuleGeometry(style, v, geoNominal, geoKey));
    }
    sink._wallGeoCache.set(geoKey, geoms);
  }

  // 变体 × 分区 → 一只 InstancedMesh；碱脚 / 压顶各自再一只（材质不同）
  const groups = new Map();
  const trims = new Map();
  const matrix = new THREE.Matrix4();
  const quat = new THREE.Quaternion();
  const euler = new THREE.Euler();
  const pos = new THREE.Vector3();
  const scl = new THREE.Vector3();
  const plinthGeo = TrimGeometry(plinth, "plinth");
  const copeGeo = TrimGeometry(cope, "cope");
  const PushTrim = (kind, trim, geometry, sector, m, y, withRoll) => {
    const key = `${kind}|${sector}`;
    if (!trims.has(key)) {
      trims.set(key, { kind, trim, geometry, sector, matrices: [], colors: [] });
    }
    // 条料只吃「弦长 + 拼接重叠」，不吃塌段摊宽、不吃墙身的高度缩放
    euler.set(withRoll ? m.roll : 0, m.yaw, 0, "YXZ");
    quat.setFromEuler(euler);
    pos.set(m.x, y, m.z);
    scl.set(m.lenS, 1, szFix);
    matrix.compose(pos, quat, scl);
    const bucket = trims.get(key);
    bucket.matrices.push(matrix.clone());
    bucket.colors.push(m.tint);
  };
  for (const m of plan.modules) {
    const sector = sectorKey ? sectorKey(m.x, m.z) : "";
    const key = `${m.variant}|${sector}`;
    if (!groups.has(key)) {
      groups.set(key, { variant: m.variant, sector, matrices: [], colors: [] });
    }
    const group = groups.get(key);
    euler.set(m.roll, m.yaw, 0, "YXZ");
    quat.setFromEuler(euler);
    pos.set(m.x, m.y, m.z);
    scl.set(m.sx, m.sy * syFix, m.sz * szFix);
    matrix.compose(pos, quat, scl);
    group.matrices.push(matrix.clone());
    group.colors.push(m.tint);
    // 碱脚坐在地面上（墙身埋进土里的那一截是画面，碱脚不跟着埋）
    if (plinthGeo && !m.collapsed) {
      PushTrim("plinth", plinth, plinthGeo, sector, m, m.gy + plinth.height / 2, false);
    }
    // 压顶跟着**这一块**自己的墙头落；塌段与破口残根不给压顶 ——
    // 一条悬在缺口上方的瓦脊是旧版最容易被实拍抓到的穿帮
    if (copeGeo && !m.collapsed
      && m.visH > planOpts.height * (cope.minH ?? 0.55)) {
      PushTrim("cope", cope, copeGeo, sector, m, m.topY + cope.height / 2, true);
    }
  }
  for (const group of groups.values()) {
    sink.props.push({
      kind: "wallInstances",
      name: `WallPCG_${style}_${material}_v${group.variant}${group.sector ? `_${group.sector}` : ""}`,
      material,
      sector: group.sector,
      geometry: geoms[group.variant],
      matrices: group.matrices,
      colors: group.colors,
      castShadow,
    });
  }
  for (const bucket of trims.values()) {
    sink.props.push({
      kind: "wallInstances",
      name: `WallPCG_${style}_${bucket.kind}${bucket.sector ? `_${bucket.sector}` : ""}`,
      material: bucket.trim.material,
      sector: bucket.sector,
      geometry: bucket.geometry,
      matrices: bucket.matrices,
      colors: bucket.colors,
      castShadow,
    });
  }

  for (const c of plan.colliders) sink.Solid(c.x, c.y, c.z, c.hx, c.hy, c.hz, tag, c.ry);
  for (const c of plan.covers) sink.Cover(c.x, c.z, c.h, c.fx, c.fz);

  return {
    stats: { ...plan.stats, buckets: groups.size + trims.size },
    fallenRuns: plan.fallenRuns,
  };
}

/**
 * 把 sink.props 里的 wallInstances 桶变成 InstancedMesh 挂进场景。
 * 宿主（TengxianCity.FlushProps / TengxianOutfield 收尾）各调一次；
 * 处理过的条目从 props 里摘掉，不影响宿主对其它 kind 的遍历。
 * 不同调用的同几何同分区桶在这里合并 —— 一个村的八个院墙圈共享几何，
 * 合并后是「每变体×每分区」一只网格，不是每院四只。
 *
 * @param resolve (materialName, library) => THREE.Material（宿主自己的调色表）
 * @returns 建出的网格数
 */
export function FlushWallInstances(sink, { scene, meshes, library, resolve }) {
  const merged = new Map();
  for (let i = sink.props.length - 1; i >= 0; i -= 1) {
    const p = sink.props[i];
    if (p.kind !== "wallInstances") continue;
    sink.props.splice(i, 1);
    if (!p.matrices.length) continue;
    const key = `${p.geometry.id}|${p.material}|${p.castShadow}|${p.sector ?? ""}`;
    const bucket = merged.get(key);
    if (bucket) {
      bucket.matrices.push(...p.matrices);
      bucket.colors.push(...p.colors);
    } else {
      merged.set(key, p);
    }
  }
  const color = new THREE.Color();
  let built = 0;
  for (const p of merged.values()) {
    const mesh = MakeInstanced(p.geometry, resolve(p.material, library), p.matrices,
      { castShadow: p.castShadow !== false });
    for (let k = 0; k < p.colors.length; k += 1) {
      color.setRGB(p.colors[k][0], p.colors[k][1], p.colors[k][2]);
      mesh.setColorAt(k, color);
    }
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.name = p.name;
    scene.add(mesh);
    meshes.push(mesh);
    built += 1;
  }
  return built;
}

export default BuildWallSpline;
