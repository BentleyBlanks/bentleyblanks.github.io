// 第一关植被：冬末干草簇、枯杂草、低矮灌木 / 荆棘、河岸芦苇、零星早春绿芽（纯数据 + 纯撒点函数，零 three）。
// 口径：docs/Data_FirstLevelVegetationProps.md。运行时：Script_FirstLevelVegetation.mjs。
//
// 【规矩】
//   · 纯视觉：不登记碰撞、不挡子弹、不进 AI 视线表；
//   · 但**不许让玩家看不见敌人**：高于 0.6 m 的卡片（灌木、荆棘、枯蒿、芦苇）只长在墙根
//     （贴着一堵本来就挡视线的墙）、河岸，或离所有路线 ≥ tallRouteClearM 的地方；离锚点
//     （射位、交互点、出生点）lowNearAnchorM 以内只长 0.3 m 以下的矮草；
//   · 不进：路面（地表 track 权重高处）、场坪、壕沟沟底与沟壁、弹坑、房屋 / 白盒实体的脚印、
//     有屋顶的地方（室内）、水面，也不进路线走廊（routeClearM）与交互点附近（anchorClearM）；
//   · 长在：墙根、壕沟沟沿外侧、河岸、田里（麦茬层的稀疏底子）与路边；
//   · 原来那 25 个平色 "foliage" 盒（河边芦苇、路边灌木、坎上草丛）不再画，
//     由这里在原位按盒子尺寸长出同类植物（碰撞本来就没有）。
//   · 确定性：同一份布局 + 同一档画质 → 逐件相同（格子哈希种子，不用 Math.random）。
//
// 图集：Texture/Texture_FirstLevelVegetationAtlas.webp（1024²，4 列 × 2 行，每格 256×512），
// 由 _import/Script_BakeVegetationAtlas.py 从 Lovart 生成的品红底卡片图键出；下面 CARDS 的
// uv / aspect 就是烘焙脚本打印的表，重烘后照抄。

import {
  MISSION_ROUTES, MISSION_PLACEMENT, MISSION_ANCHORS, MISSION_SUPPLIES,
} from "./Data_FirstLevelMissionLayout.mjs";
import { TrenchPlanFor, SampleMissionGroundSurface } from "./Data_FirstLevelMissionTerrain.mjs";
import { MISSION_NORTH_RIVER, RiverCutAt } from "./Data_FirstLevelMissionTopology.mjs";
import { HashSeed, Rng, RouteIndex, PointIndex } from "./Data_FirstLevelPropDressing.mjs";

export const VEGETATION_VERSION = "first-level-vegetation-20260930";
export const VEGETATION_ATLAS = Object.freeze({
  // 改图就改戳（清单 Data_TextureManifest 的 FirstLevelVegetationAtlas；Script_TextureStandardsTest 查戳）。
  url: "./Texture/Texture_FirstLevelVegetationAtlas.webp?v=veg20260930a",
  bytes: 276920,
});

/**
 * 卡片：uv = [u0, v0, u1, v1]（three flipY=true，v 向上），aspect = 宽/高，heightM = 真实高度。
 * tall = 高于视线门槛的那几种（撒点受 tallRouteClearM 限制）。
 */
export const VEGETATION_CARDS = Object.freeze([
  { id: "TallGrass", uv: [0.00391, 0.50098, 0.24609, 0.90625], aspect: 0.5976, heightM: 0.62, tall: false },
  // 2026-09-30 换成单独生成的一簇（旧卡是铺满格子的草垫，左右底三边切平，地上一张张直边方块）；
  // 新图比别的干草卡亮一截（平均 sRGB 0.63 对 0.52），压一档跟 TallGrass / MixedClump 对齐。
  { id: "LowTuft", uv: [0.25391, 0.50098, 0.49609, 0.63672], aspect: 1.7842, heightM: 0.26, tall: false, shade: [0.83, 0.83, 0.82] },
  { id: "WeedStalks", uv: [0.50391, 0.50098, 0.74609, 0.83008], aspect: 0.7359, heightM: 0.8, tall: true },
  { id: "Bramble", uv: [0.75391, 0.50098, 0.99609, 0.72656], aspect: 1.0736, heightM: 0.85, tall: true },
  // 芦苇穗在阴天调色下读成发白的一片：顶点色再压一档（shade 乘在 VEGETATION_TINT 与抖动之上）。
  { id: "Reeds", uv: [0.00391, 0.00098, 0.24609, 0.4375], aspect: 0.5548, heightM: 1.8, tall: true, shade: [0.66, 0.62, 0.54] },
  { id: "GreenSprouts", uv: [0.25391, 0.00098, 0.49609, 0.12695], aspect: 1.9225, heightM: 0.22, tall: false },
  { id: "MixedClump", uv: [0.50391, 0.00098, 0.74609, 0.19043], aspect: 1.2784, heightM: 0.42, tall: false },
  { id: "TwigShrub", uv: [0.75391, 0.00098, 0.99609, 0.2207], aspect: 1.1022, heightM: 0.7, tall: true },
].map((card) => Object.freeze(card)));
export const CARD_INDEX = Object.freeze(Object.fromEntries(VEGETATION_CARDS.map((card, i) => [card.id, i])));

/** 材质颜色（乘在图集上）：生成图的枯草偏粉白，压成阴天里的暖草黄。 */
export const VEGETATION_TINT = Object.freeze([0.95, 0.87, 0.7]);

/** 画质分档：密度倍率、近档（全部卡片）与远档（只留 ≥ farMinHeightM 的）半径、上限、alpha-to-coverage。 */
export const VEGETATION_QUALITY = Object.freeze({
  low: Object.freeze({ density: 0.45, nearM: 38, farM: 70, maxInstances: 30000, alphaToCoverage: false }),
  medium: Object.freeze({ density: 0.7, nearM: 52, farM: 95, maxInstances: 56000, alphaToCoverage: false }),
  high: Object.freeze({ density: 1, nearM: 64, farM: 120, maxInstances: 90000, alphaToCoverage: false }),
  // ultra 的主 HDR 靶开了 4× MSAA（Data_Tuning_Graphics），只有它上 alpha-to-coverage 才有意义。
  ultra: Object.freeze({ density: 1, nearM: 76, farM: 140, maxInstances: 96000, alphaToCoverage: true }),
});

export const VEGETATION = Object.freeze({
  sectorM: 64,
  gridM: 1.25,
  /** 离最近路线超过这个距离的地方不撒（远处交给地形的麦茬层），省掉看不见的几千件。 */
  reachM: 70,
  routeClearM: 1.3,
  anchorClearM: 2.4,
  lowNearAnchorM: 6,
  lowMaxHeightM: 0.3,
  tallRouteClearM: 9,
  /** 视线门槛：路边的卡片不高过这个。 */
  sightMaxHeightM: 0.58,
  /** 壕沟沟沿：人站在沟里眼睛就在沟沿上方几十厘米，沿上只长矮草，不挡从沟里往外看。 */
  trenchLipMaxHeightM: 0.3,
  /** 01–06 前沿交战区（z 小于这个）：墙根以外一律压到 frontMaxHeightM，不让草里藏得住趴着的敌人。 */
  frontZ: -95, frontMaxHeightM: 0.4,
  wallFootBandM: 1.6,
  trenchLipBandM: 2.4,
  trackMax: 0.3,
  /** 墙根这一窄条（离墙 < wallTrackBandM）不看路面层：场坪、村街的墙脚照样长草。 */
  wallTrackBandM: 0.9,
  /** 场坪 / 路面上离路线够远的地方，稀稀拉拉也长一点（概率再乘这个）。 */
  trackOpenFactor: 0.45, trackOpenRouteM: 3.5,
  farMinHeightM: 0.4,
  /** 概率：田里底子（随离路线变远衰减） + 墙根 + 沟沿 + 河岸，再乘画质密度。 */
  pOpenClose: 0.3, pOpenCloseM: 10, pOpen: 0.15, pOpenFar: 0.016, pOpenNearM: 24, pStubble: 0.06, pShoulder: 0.45, pWallFoot: 0.95, pTrenchLip: 0.7, pBank: 0.5,
  /** 一簇几张卡（同一种，小范围错开）。 */
  clusterMin: 3, clusterMax: 6, clusterSpreadM: 0.5,
  scaleRange: [0.85, 1.35],
  /**
   * 低矮灌木丛（2026-09-28 第二轮）：离路线 thicketRouteM 以外、前沿交战区以北，一丛 5–8 张荆棘 / 枝条 / 枯草，
   * 铺开 thicketSpreadM，整丛压到 thicketMaxHeightM 以下（人蹲下能被半挡、站着越过去看得见）。
   */
  pThicket: 0.02, thicketRouteM: [11, 48], thicketMin: 5, thicketMax: 8, thicketSpreadM: 0.95, thicketMaxHeightM: 0.62,
  /** 坎上：土坎肩 / 坡脚平台的顶面（离地 minM–maxM）长一层 ≤ heightM 的矮草，不挡从坎后往外看。 */
  bankTop: Object.freeze({ idPattern: /(Shoulder|Apron|Berm|Spoil|Mound)\d*$/, minM: 0.2, maxM: 1.3, perM2: 1.1, heightM: 0.22,
    cards: Object.freeze({ LowTuft: 3, GreenSprouts: 1.5, MixedClump: 1 }) }),
  /** 各生长环境里挑卡片的权重（CARD_INDEX 顺序）。 */
  mix: Object.freeze({
    open: Object.freeze({ LowTuft: 4, MixedClump: 3, GreenSprouts: 2, TallGrass: 1.5, WeedStalks: 0.6 }),
    wallFoot: Object.freeze({ TallGrass: 3, MixedClump: 2.5, WeedStalks: 1.6, LowTuft: 1.2, TwigShrub: 0.7, Bramble: 0.5 }),
    trenchLip: Object.freeze({ TallGrass: 3, LowTuft: 2.5, MixedClump: 2, WeedStalks: 0.8, GreenSprouts: 0.6 }),
    bank: Object.freeze({ TallGrass: 3, MixedClump: 2, Reeds: 1.2, WeedStalks: 1, LowTuft: 1 }),
    far: Object.freeze({ Bramble: 1.2, TwigShrub: 1.2, WeedStalks: 1, TallGrass: 1.5 }),
    thicket: Object.freeze({ TwigShrub: 3, Bramble: 2.5, TallGrass: 1.5, WeedStalks: 1 }),
  }),
  /** 墙根算哪些块：落在地上的实体块，高于这个才算「墙」。 */
  wallMinHeightM: 0.9,
  /** 原 foliage 盒在原位长的植物（按盒子语义名前缀挑）。 */
  foliage: Object.freeze({
    Reeds: Object.freeze({ cards: Object.freeze({ Reeds: 4, TallGrass: 1.5 }), perM2: 3.2, padM: 1.2 }),
    Shrub: Object.freeze({ cards: Object.freeze({ Bramble: 2, TwigShrub: 2, TallGrass: 1 }), perM2: 2.4, padM: 0.4 }),
    Scrub: Object.freeze({ cards: Object.freeze({ TwigShrub: 2, Bramble: 1.5, TallGrass: 1 }), perM2: 2.4, padM: 0.4 }),
    Grass: Object.freeze({ cards: Object.freeze({ TallGrass: 3, MixedClump: 2, WeedStalks: 1 }), perM2: 3, padM: 0.5 }),
  }),
});

function IsPolyline(value) {
  return Array.isArray(value) && value.length >= 2 && value.every((p) => p && Number.isFinite(p.x) && Number.isFinite(p.z));
}
function CollectPolylines(value, out, depth = 0) {
  if (depth > 4 || !value || typeof value !== "object") return out;
  if (IsPolyline(value)) { out.push(value); return out; }
  for (const item of Array.isArray(value) ? value : Object.values(value)) CollectPolylines(item, out, depth + 1);
  return out;
}
function CollectPoints(value, out, depth = 0) {
  if (depth > 3 || !value || typeof value !== "object") return out;
  if (Number.isFinite(value.x) && Number.isFinite(value.z) && !Array.isArray(value)) { out.push({ x: value.x, z: value.z }); return out; }
  for (const item of Array.isArray(value) ? value : Object.values(value)) CollectPoints(item, out, depth + 1);
  return out;
}

/**
 * 正式第一关的撒点上下文（植被与碎砖瓦共用）：路线、锚点、弹坑、壕沟走廊、地表层、河。
 * `groundAt` 由调用方给（运行时 = 场地的地形高度，测试 = SampleMissionTerrain）。
 */
export function MissionDressingContext(layout, groundAt) {
  const routes = CollectPolylines(MISSION_ROUTES, []);
  CollectPolylines(MISSION_PLACEMENT, routes);
  const anchors = [...CollectPoints(MISSION_ANCHORS, []), ...MISSION_SUPPLIES.map((s) => ({ x: s.x, z: s.z }))];
  const trench = layout.terrainSpec ? TrenchPlanFor(layout.terrainSpec) : null;
  const scenarioBlocks = (layout.scenario?.states || []).flatMap((state) => state.blocks);
  return {
    layout, blocks: layout.blocks, scenarioBlocks, groundAt, routes, anchors,
    // 地形表 steps = 弹坑、射击踏步、沟里的坡道、防炮洞坑（都是挖下去的坑），植被一律不进。
    craters: layout.terrainSpec?.steps || [],
    bounds: layout.bounds,
    trenchCorridor: trench ? (x, z) => trench.Corridor(x, z) : () => null,
    surfaceAt: layout.SampleGroundSurface || SampleMissionGroundSurface,
    river: MISSION_NORTH_RIVER, riverCutAt: RiverCutAt,
  };
}

/**
 * 路线距离的粗栅格（chamfer 两遍，格 cellM）：远处的「离路线多远」只要个大概（淡出、高卡门槛），
 * 近处 14 m 以内再用线段精算。整张图一次 ~5 万格，省掉逐点扫线段。
 */
export function RouteDistanceRaster(routes, bounds, cellM = 2) {
  const nx = Math.ceil((bounds.maxX - bounds.minX) / cellM) + 1, nz = Math.ceil((bounds.maxZ - bounds.minZ) / cellM) + 1;
  const d = new Float32Array(nx * nz).fill(1e6);
  for (const route of routes) for (let i = 1; i < route.length; i++) {
    const a = route[i - 1], b = route[i], len = Math.hypot(b.x - a.x, b.z - a.z);
    for (let t = 0; t <= len; t += cellM * 0.5) {
      const x = a.x + (b.x - a.x) * t / (len || 1), z = a.z + (b.z - a.z) * t / (len || 1);
      const gx = Math.round((x - bounds.minX) / cellM), gz = Math.round((z - bounds.minZ) / cellM);
      if (gx >= 0 && gx < nx && gz >= 0 && gz < nz) d[gz * nx + gx] = 0;
    }
  }
  const o = cellM, g = cellM * Math.SQRT2;
  for (let z = 0; z < nz; z++) for (let x = 0; x < nx; x++) {
    let v = d[z * nx + x];
    if (x > 0) v = Math.min(v, d[z * nx + x - 1] + o);
    if (z > 0) { v = Math.min(v, d[(z - 1) * nx + x] + o); if (x > 0) v = Math.min(v, d[(z - 1) * nx + x - 1] + g); if (x < nx - 1) v = Math.min(v, d[(z - 1) * nx + x + 1] + g); }
    d[z * nx + x] = v;
  }
  for (let z = nz - 1; z >= 0; z--) for (let x = nx - 1; x >= 0; x--) {
    let v = d[z * nx + x];
    if (x < nx - 1) v = Math.min(v, d[z * nx + x + 1] + o);
    if (z < nz - 1) { v = Math.min(v, d[(z + 1) * nx + x] + o); if (x < nx - 1) v = Math.min(v, d[(z + 1) * nx + x + 1] + g); if (x > 0) v = Math.min(v, d[(z + 1) * nx + x - 1] + g); }
    d[z * nx + x] = v;
  }
  return {
    Distance(x, z) {
      const gx = Math.min(nx - 1, Math.max(0, Math.round((x - bounds.minX) / cellM)));
      const gz = Math.min(nz - 1, Math.max(0, Math.round((z - bounds.minZ) / cellM)));
      return d[gz * nx + gx];
    },
  };
}

function WeightedPick(rng, weights) {
  let total = 0;
  for (const value of Object.values(weights)) total += value;
  let r = rng() * total;
  for (const [id, value] of Object.entries(weights)) { r -= value; if (r <= 0) return CARD_INDEX[id]; }
  return CARD_INDEX[Object.keys(weights).at(-1)];
}

/** 块的脚印分桶：点在不在任何实体 / 屋顶 / 水面脚印里，离最近一堵「墙」多远。 */
function BlockIndex(blocks, groundAt, cellM = 12) {
  const grid = new Map();
  const Key = (ix, iz) => ix * 73856093 ^ iz * 19349663;
  const records = [];
  for (const block of blocks) {
    if (block.dynamic) continue;
    const ground = groundAt(block.x, block.z), bottom = block.y - block.h / 2, top = block.y + block.h / 2;
    const onGround = bottom < ground + 0.5 && top > ground - 0.2;
    const roof = bottom > ground + 1.4 && block.semantic === "roof";
    const water = block.semantic === "water";
    const solidGround = onGround && (block.solid !== false || block.semantic !== "foliage");
    if (!solidGround && !roof && !water) continue;
    const c = Math.cos(block.ry || 0), s = Math.sin(block.ry || 0);
    const ax = Math.abs(c) * block.w / 2 + Math.abs(s) * block.d / 2, az = Math.abs(s) * block.w / 2 + Math.abs(c) * block.d / 2;
    const record = { block, c, s, onGround: solidGround, roof, water,
      wall: solidGround && block.solid !== false && block.h >= VEGETATION.wallMinHeightM };
    records.push(record);
    const pad = 1.5;
    for (let ix = Math.floor((block.x - ax - pad) / cellM); ix <= Math.floor((block.x + ax + pad) / cellM); ix++)
      for (let iz = Math.floor((block.z - az - pad) / cellM); iz <= Math.floor((block.z + az + pad) / cellM); iz++) {
        const key = Key(ix, iz);
        if (!grid.has(key)) grid.set(key, []);
        grid.get(key).push(record);
      }
  }
  return {
    Query(x, z) {
      const list = grid.get(Key(Math.floor(x / cellM), Math.floor(z / cellM)));
      let inside = false, roofed = false, water = false, wallDistance = Infinity;
      if (list) for (const r of list) {
        const dx = x - r.block.x, dz = z - r.block.z;
        const lx = Math.abs(dx * r.c - dz * r.s) - r.block.w / 2, lz = Math.abs(dx * r.s + dz * r.c) - r.block.d / 2;
        if (lx < 0.15 && lz < 0.15) {
          if (r.onGround) inside = true;
          if (r.roof) roofed = true;
          if (r.water) water = true;
        }
        if (r.wall) wallDistance = Math.min(wallDistance, Math.hypot(Math.max(lx, 0), Math.max(lz, 0)));
      }
      return { inside, roofed, water, wallDistance };
    },
  };
}

/**
 * 撒点。返回 { instances:[{x,y,z,yaw,scale,card,tint}], replaced:Set（换掉的 foliage 块 id）, stats }。
 * `quality` 取 VEGETATION_QUALITY 的键（未知的按 high）。
 */
export function PlanFirstLevelVegetation(ctx, quality = "high", rules = VEGETATION) {
  const q = VEGETATION_QUALITY[quality] || VEGETATION_QUALITY.high;
  const { groundAt, bounds } = ctx;
  const routes = RouteIndex(ctx.routes, 16), anchors = PointIndex(ctx.anchors, 16);
  const far = RouteDistanceRaster(ctx.routes, bounds, 2);
  const blocks = BlockIndex([...ctx.blocks, ...(ctx.scenarioBlocks || [])], groundAt);
  const craters = PointIndex(ctx.craters.map((c) => ({ x: c.x, z: c.z })), 16);
  const maxCrater = Math.max(0, ...ctx.craters.map((c) => c.radius));
  const layers = [0, 0, 0, 0], color = [0, 0, 0];
  const memberLayers = [0, 0, 0, 0], memberColor = [0, 0, 0];
  const instances = [], replaced = new Set();
  const stats = { candidates: 0, wallFoot: 0, trenchLip: 0, bank: 0, open: 0, far: 0, thicket: 0, bankTop: 0, foliage: 0, capped: false };
  const crossings = ctx.river?.crossings || [];
  const InCrater = (x, z) => {
    if (craters.Distance(x, z, maxCrater + 1) > maxCrater + 0.4) return false;
    for (const crater of ctx.craters) if (Math.hypot(x - crater.x, z - crater.z) < crater.radius + 0.35) return true;
    return false;
  };
  // 簇成员各自的禁区复核：簇心过了全部检查，成员偏出 0.5–1 m 仍可能落进实体脚印、沟壁、坑或路面。
  const MemberClear = (mx, mz) => {
    const hit = blocks.Query(mx, mz);
    if (hit.inside || hit.roofed || hit.water || InCrater(mx, mz)) return false;
    const corridor = ctx.trenchCorridor(mx, mz);
    return !corridor || corridor.d >= corridor.halfFloor + corridor.bank + 0.2;
  };
  // 不在路面上的簇：成员落点的路面权重也不能越过门槛（墙脚那一窄条照旧放行）。
  const MemberClearOffTrack = (mx, mz) => {
    if (!MemberClear(mx, mz)) return false;
    ctx.surfaceAt(mx, mz, memberColor, memberLayers);
    return memberLayers[0] <= rules.trackMax + 0.3;
  };
  // 每件带一个 keep 随机数：超过画质上限时按它均匀抽稀（不按扫描顺序截断，否则南边整片没草）。
  const Push = (rng, x, z, card, count, maxHeightM = Infinity, accept = null, spread = rules.clusterSpreadM, mix = null) => {
    for (let k = 0; k < count; k++) {
      const ox = k ? (rng() * 2 - 1) * spread : 0, oz = k ? (rng() * 2 - 1) * spread : 0;
      // 灌木丛这类混种的簇：每个成员自己挑卡（簇心那张照旧用传进来的 card）。
      if (k && mix) card = WeightedPick(rng, mix);
      const scale = Math.min(rules.scaleRange[0] + rng() * (rules.scaleRange[1] - rules.scaleRange[0]),
        maxHeightM / VEGETATION_CARDS[card].heightM);
      // 簇成员各自再验一次（簇心在路肩外、成员却可能落进陡升的路面/场坪权重里）；rng 已先取完，不影响其余成员。
      if (k && accept && !accept(x + ox, z + oz)) { rng(); rng(); rng(); continue; }
      instances.push({ x: x + ox, z: z + oz, y: groundAt(x + ox, z + oz), yaw: rng() * Math.PI, scale,
        card, tint: rng(), keep: rng() });
    }
  };

  // 1) 原 foliage 盒：原位按盒子尺寸长同类植物。
  for (const block of ctx.blocks) {
    if (block.semantic !== "foliage") continue;
    replaced.add(block.id);
    const kind = Object.keys(rules.foliage).find((key) => block.id.includes(key)) || "Grass";
    const spec = rules.foliage[kind];
    const rng = Rng(HashSeed(block.id));
    const w = block.w + spec.padM * 2, d = block.d + spec.padM * 2;
    const count = Math.max(3, Math.round(w * d * spec.perM2 * Math.max(0.6, q.density)));
    const c = Math.cos(block.ry || 0), s = Math.sin(block.ry || 0);
    for (let i = 0; i < count; i++) {
      const a = (rng() - 0.5) * w, b = (rng() - 0.5) * d;
      const x = block.x + a * c + b * s, z = block.z - a * s + b * c;
      if (routes.Distance(x, z, 2) < rules.routeClearM) continue;
      Push(rng, x, z, WeightedPick(rng, spec.cards), 1);
      stats.foliage++;
    }
  }
  const foliageCount = instances.length;

  // 2) 网格撒点。查询按从便宜到贵排：路线 / 锚点 → 掷骰（按本格可能的最大概率）→ 块脚印
  //    → 壕沟走廊 → 地表层（最贵，只给最后剩下的格子）。
  const step = rules.gridM;
  const x0 = Math.ceil(bounds.minX / step), x1 = Math.floor(bounds.maxX / step);
  const z0 = Math.ceil(bounds.minZ / step), z1 = Math.floor(bounds.maxZ / step);
  const river = ctx.river;
  // 每格一个种子，但不为每格新建闭包（十几万格的分配是撒点耗时的大头）。
  let state = 0;
  const rng = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  for (let iz = z0; iz <= z1; iz++) for (let ix = x0; ix <= x1; ix++) {
    state = (Math.imul(ix, 73856093) ^ Math.imul(iz, 19349663) ^ 0x9e3779b9) >>> 0;
    const x = (ix + rng()) * step, z = (iz + rng()) * step;
    const riverDz = river ? Math.abs(z - river.z) : Infinity;
    const bankBand = riverDz < 17 && riverDz >= 7.6;
    const coarse = far.Distance(x, z);
    const dRoute = coarse < 14 ? routes.Distance(x, z, coarse + 2) : coarse;
    if ((dRoute > rules.reachM && !bankBand) || dRoute < rules.routeClearM) continue;
    const dAnchor = anchors.Distance(x, z, rules.lowNearAnchorM + 1);
    if (dAnchor < rules.anchorClearM) continue;
    const roll = rng();
    // 路线两侧 pOpenNearM 以内是玩家真正看得见的地面：给足；再往外线性淡到 pOpenFar。
    const openFade = dRoute < rules.pOpenNearM ? 1 : Math.max(0, 1 - (dRoute - rules.pOpenNearM) / (rules.reachM - rules.pOpenNearM));
    const pOpen = dRoute < rules.pOpenCloseM ? rules.pOpenClose : rules.pOpenFar + (rules.pOpen - rules.pOpenFar) * openFade;
    const crossing = bankBand && crossings.some((c) => Math.abs(x - c.x) < c.halfW + 3);
    const bank = bankBand && !crossing;
    if (river && riverDz < 7.6 && ctx.riverCutAt(x, z) > 0.2) continue;       // 河槽底（水面与水里）
    const hit = blocks.Query(x, z);
    if (hit.inside || hit.roofed || hit.water) continue;
    const wallFoot = hit.wallDistance < rules.wallFootBandM;
    const pWall = wallFoot ? rules.pWallFoot * (1 - hit.wallDistance / rules.wallFootBandM) : 0;
    const pMax = Math.max(rules.pThicket, pOpen + rules.pStubble + rules.pShoulder + pWall + rules.pTrenchLip + (bank ? rules.pBank : 0)) * q.density;
    if (roll > pMax) continue;
    stats.candidates++;
    if (InCrater(x, z)) continue;
    const corridor = ctx.trenchCorridor(x, z);
    let lip = false;
    if (corridor) {
      const edge = corridor.halfFloor + corridor.bank;
      if (corridor.d < edge + 0.2) continue;
      lip = corridor.d < edge + rules.trenchLipBandM;
    }
    const pNoSurface = Math.max(rules.pThicket, pOpen + rules.pStubble + rules.pShoulder + pWall + (lip ? rules.pTrenchLip : 0) + (bank ? rules.pBank : 0)) * q.density;
    if (roll > pNoSurface) continue;
    ctx.surfaceAt(x, z, color, layers);
    const track = layers[0], stubble = layers[2];
    const atWall = hit.wallDistance < rules.wallTrackBandM;
    // 路面 / 场坪：墙脚那一窄条照长；离路线够远的地方稀疏长一点；其余不长。
    const onTrack = track > rules.trackMax;
    if (onTrack && !atWall && dRoute < rules.trackOpenRouteM) continue;
    let p = onTrack ? pOpen * rules.trackOpenFactor
      : (pOpen + rules.pStubble * stubble) * (1 - track / rules.trackMax * 0.6)
        + (track > 0.06 ? rules.pShoulder * (1 - track / rules.trackMax) : 0);
    let zone = "open";
    if (wallFoot) { p += pWall; zone = "wallFoot"; }
    if (lip) { p += rules.pTrenchLip; zone = zone === "wallFoot" ? zone : "trenchLip"; }
    if (bank) { p += rules.pBank; zone = "bank"; }
    if (zone === "open" && dRoute > rules.tallRouteClearM && rng() < 0.18) zone = "far";
    // 灌木丛：田里（不是墙根 / 沟沿 / 河岸 / 路面）、离路线够远、前沿交战区以北，独立的一档小概率。
    if (zone !== "wallFoot" && !lip && !bank && !onTrack && z > rules.frontZ && dAnchor > rules.lowNearAnchorM
      && dRoute > rules.thicketRouteM[0] && dRoute < rules.thicketRouteM[1] && roll < rules.pThicket * q.density) {
      stats.thicket++;
      const count = rules.thicketMin + Math.floor(rng() * (rules.thicketMax - rules.thicketMin + 1));
      Push(rng, x, z, WeightedPick(rng, rules.mix.thicket), count, rules.thicketMaxHeightM, MemberClearOffTrack, rules.thicketSpreadM, rules.mix.thicket);
      continue;
    }
    if (roll > p * q.density) continue;
    let card = WeightedPick(rng, rules.mix[zone]);
    const spec = VEGETATION_CARDS[card];
    // 视线门槛：高卡只准贴墙、河岸或远离路线；锚点附近一律矮草。
    if (spec.tall && !(zone === "bank" || (zone === "wallFoot" && dRoute > 3) || dRoute > rules.tallRouteClearM)) card = CARD_INDEX.MixedClump;
    if (dAnchor < rules.lowNearAnchorM && VEGETATION_CARDS[card].heightM * rules.scaleRange[1] > rules.lowMaxHeightM) {
      card = rng() < 0.6 ? CARD_INDEX.LowTuft : CARD_INDEX.GreenSprouts;
    }
    if (card === CARD_INDEX.Reeds && zone !== "bank") card = CARD_INDEX.TallGrass;
    stats[zone]++;
    const count = rules.clusterMin + Math.floor(rng() * (rules.clusterMax - rules.clusterMin + 1));
    // 路边 3 m 以内就算是矮卡也压到视线门槛以下（0.62 m 的枯草放大 1.2 倍就过了 0.6）；
    // 沟沿与前沿交战区另有更低的门槛（见 VEGETATION 注释）。
    let maxHeight = dRoute < 3 + rules.clusterSpreadM ? rules.sightMaxHeightM : Infinity;
    if (lip) maxHeight = Math.min(maxHeight, rules.trenchLipMaxHeightM);
    if (z < rules.frontZ && zone !== "wallFoot") maxHeight = Math.min(maxHeight, rules.frontMaxHeightM);
    Push(rng, x, z, card, count, maxHeight, onTrack || atWall ? MemberClear : MemberClearOffTrack);
  }
  // 3) 坎上：土坎肩 / 坡脚平台（非掩体）的顶面，矮草贴着顶面长（y 取顶面，不取地形）。
  const bt = rules.bankTop;
  for (const block of ctx.blocks) {
    if (block.semantic !== "earthDark" || block.cover || block.dynamic || !bt.idPattern.test(block.id)) continue;
    const ground = groundAt(block.x, block.z), top = block.y + block.h / 2;
    if (top - ground < bt.minM || top - ground > bt.maxM) continue;
    const brng = Rng(HashSeed(block.id + ":top"));
    const count = Math.round(block.w * block.d * bt.perM2 * q.density);
    const c = Math.cos(block.ry || 0), s = Math.sin(block.ry || 0);
    for (let i = 0; i < count; i++) {
      const a = (brng() - 0.5) * block.w * 0.9, b = (brng() - 0.5) * block.d * 0.9;
      const x = block.x + a * c + b * s, z = block.z - a * s + b * c;
      if (anchors.Distance(x, z, rules.anchorClearM + 1) < rules.anchorClearM || routes.Distance(x, z, 2) < rules.routeClearM) continue;
      const card = WeightedPick(brng, bt.cards);
      const scale = Math.min(rules.scaleRange[0] + brng() * (rules.scaleRange[1] - rules.scaleRange[0]), bt.heightM / VEGETATION_CARDS[card].heightM);
      instances.push({ x, z, y: top, yaw: brng() * Math.PI, scale, card, tint: brng(), keep: brng() });
      stats.bankTop++;
    }
  }
  stats.planned = instances.length;
  if (instances.length > q.maxInstances) {
    // 原 foliage 盒那几簇全留；其余按 keep 均匀抽到上限。
    const budget = Math.max(0, q.maxInstances - foliageCount), rest = instances.length - foliageCount;
    const ratio = budget / rest;
    const kept = instances.slice(0, foliageCount);
    for (let i = foliageCount; i < instances.length && kept.length < q.maxInstances; i++)
      if (instances[i].keep < ratio) kept.push(instances[i]);
    instances.length = 0; instances.push(...kept);
    stats.capped = true;
  }
  return { instances, replaced, stats };
}
