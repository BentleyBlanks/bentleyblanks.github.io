import { FRONT_SORTIE as Sortie } from "./Data_FirstLevelFrontRoute.mjs";
import { MISSION_RECEPTION_SPACE, MISSION_NORTH_RIVER, RiverCutAt } from "./Data_FirstLevelMissionTopology.mjs";
// Authored soil, metres: natural ground, roads, rail berm and excavated trenches.
// This function is baked once into the shared rendered/physical heightfield.
import { FRONT_BREACHES } from "./Data_FirstLevelMissionFront.mjs";
import { MISSION_TRENCH_NETWORK } from "./Data_FirstLevelMissionTrenches.mjs";
import { CompileTrenchNetwork, TrenchRevision } from "./Script_TrenchPlan.mjs";
const Smooth = (value) => {
  const t = Math.max(0, Math.min(1, value));
  return t * t * (3 - 2 * t);
};
export function MissionPathDistance(point, route) {
  let best = Infinity;
  for (let i = 1; i < route.length; i++) {
    const a = route[i - 1],
      b = route[i],
      dx = b.x - a.x,
      dz = b.z - a.z;
    const t = Math.max(
      0,
      Math.min(1, ((point.x - a.x) * dx + (point.z - a.z) * dz) / (dx * dx + dz * dz || 1)),
    );
    best = Math.min(best, Math.hypot(point.x - a.x - dx * t, point.z - a.z - dz * t));
  }
  return best;
}
export const MISSION_TERRAIN = Object.freeze({
  cellM: 0.75,
  textureTileM: 2,
  // Full-cover trench floor below natural soil; firing steps and mouths remain raised.
  // Historical basis and exceptions: docs/Data_TrenchTerrainPbr.md.
  roads: [
    {
      points: [
        { x: 8, z: -119 },
        { x: 8, z: -90 },
        { x: 4, z: -66 },
        { x: -4, z: -35 },
        { x: 2, z: -8 },
        { x: 22, z: 8 },
        { x: 27, z: 40 },
        { x: 55, z: 57 },
        { x: 76, z: 85 },
        { x: 76, z: 170 },
      ],
      width: 6,
    },
    {
      points: [
        { x: -65, z: 75 },
        { x: -24, z: 48 },
        { x: 18, z: 12 },
        { x: 48, z: -2 },
        { x: 72, z: 46 },
        { x: 76, z: 123 },
        { x: 76, z: 180 },
      ],
      width: 10,
    },
    {
      points: [
        { x: -27, z: 236 },
        { x: -47, z: 222 },
        { x: -61, z: 190 },
      ],
      width: 10,
    },
    {
      points: [
        { x: 38, z: -198 },
        { x: 36, z: -169 },
        { x: 28, z: -136 },
        { x: 27, z: -111 },
      ],
      width: 7,
    },
    // 关尾夜景：北门外那条进城的路（只有 NightGateShown 之后才看得见地面上的东西，
    // 但路面是地形，白天也压着 —— 那一带在任何一条任务路线的 200 m 之外）。
    {
      points: [
        { x: -160, z: 278 },
        { x: -160, z: 352 },
      ],
      width: 8,
    },
  ],
  // 北沙河：口径与断面函数在 Data_FirstLevelMissionTopology.MISSION_NORTH_RIVER。
  rivers: [MISSION_NORTH_RIVER],
  // 壕沟不再是一张折线表：中心线与段级参数在 Data_FirstLevelMissionTrenches，
  // 逐点的宽/深/抛土由 Script_TrenchPlan 的位置噪声算（docs/Data_TrenchSpline.md）。
  trenchNetwork: MISSION_TRENCH_NETWORK,
  // 兼容视图：旧消费者（Layout 的清理网、任务/布设回归）只读 id/role/points/
  // depth/bottom/bank，这里照编译结果现算。getter 而不是字段，是因为编辑器改过
  // 参数之后 revision 一抬，下一次读就得是新的那份。
  get trenches() { return TrenchPlanFor(this).trenches; },
  steps: [
    {x:Sortie.house.x,z:Sortie.house.z,radius:6,depth:Sortie.trenchDepthM},
    { x: 0, z: -127.5, radius: 3.6, depth: 0.88 },
    { x: 15, z: -127.5, radius: 3.2, depth: 0.9 },
    { x: -25, z: -127.5, radius: 3.2, depth: 0.88 },
  ],
  pads: [
    { x: -71, z: 74, w: 13, d: 50 },
    { x: 55, z: 6, w: 62, d: 42 },
    { x: 76, z: 113, w: 57, d: 54 },
    { x: -20, z: 235, w: 48, d: 40 },
    // 06 背坡伤员集结处的场坪：担架队要在这儿把人放平、换手、排队，不能是田垄。
    { x: -36, z: -100, w: 26, d: 18 },
    // 关尾北门外的场地（行军队列、搬运、火盆）。
    { x: -160, z: 315, w: 26, d: 56 },
  ],
});
// 编译一次壕沟网络，按 (spec, TrenchRevision()) 缓存。编译要走一遍圆角、分桶
// 网格和每米一站，几十毫秒量级 —— 高度场烘焙每格点调 SampleMissionTerrain，
// 没有这层缓存就是每格点重编译一次整张网。
// 编辑器改参数只抬 revision（覆盖不落盘），下一次「重建关卡」自然拿到新的。
const trenchPlans = new WeakMap();
export function TrenchPlanFor(spec = MISSION_TERRAIN) {
  const network = spec.trenchNetwork || MISSION_TRENCH_NETWORK;
  const revision = TrenchRevision();
  const cached = trenchPlans.get(network);
  if (cached && cached.revision === revision) return cached.plan;
  const plan = CompileTrenchNetwork(network, { natural: SampleMissionNaturalHeight });
  trenchPlans.set(network, { revision, plan });
  return plan;
}
export function SampleMissionNaturalHeight(x, z) {
  const field = 0.12 * Math.sin(x / 22) * Math.cos(z / 28) + 0.07 * Math.sin((x + z) / 12);
  // Low field banks enclose the playable plain; authored roads and trench floors stay shared.
  const east = 4.2 * Smooth((x - 116) / 21) * (.88 + .12 * Math.cos(z / 35));
  const west = 4.3 * Smooth((-x - 190) / 15);
  const north = 3.1 * Smooth((-z - 184) / 18) * (.86 + .14 * Math.cos(x / 31));
  return field + east + west + north;
}
export function SampleMissionTerrain(x, z, spec = MISSION_TERRAIN) {
  const natural = SampleMissionNaturalHeight(x, z);
  let height = natural;
  // 道路与场坪的压平因子同时是抛土堆的掩码：挖出来的土堆在沟沿上是对的，堆到
  // 碾平的路面或场坪上就成了一道谁也解释不了的坎（担架队和大车正从那儿过）。
  let bermMask = 1;
  for (const pad of spec.pads) {
    const d = Math.hypot(
      Math.max(0, Math.abs(x - pad.x) - pad.w / 2),
      Math.max(0, Math.abs(z - pad.z) - pad.d / 2),
    );
    const factor = Smooth(d / 5);
    height *= factor;
    if (factor < bermMask) bermMask = factor;
  }
  for (const road of spec.roads) {
    const d = MissionPathDistance({ x, z }, road.points);
    const factor = 0.15 + 0.85 * Smooth((d - road.width / 2) / 3);
    height = height * factor;
    if (factor < bermMask) bermMask = factor;
  }
  // A continuous rail embankment, never a box pretending to be soil.
  const rail = Math.abs(x + 77);
  height += 0.62 * (1 - Smooth((rail - 2.4) / 4));
  // 开挖并集 + 沟沿抛土：旧的 `for (trench)` 循环搬进了 Script_TrenchPlan.Apply。
  // 挖下去的部分照旧取 min；抬起来的那部分（抛土）乘上面那张掩码。
  const applied = TrenchPlanFor(spec).Apply(x, z, height, natural);
  height = applied > height ? height + (applied - height) * bermMask : applied;
  for (const breach of FRONT_BREACHES) {
    const blend=1-Smooth(Math.hypot(x-breach.x,z-breach.z)/breach.radius);
    if(blend>0)height=Math.max(height,height+(natural-breach.depth-height)*blend);
  }
  for (const step of spec.steps) {
    const d = Math.hypot(x - step.x, z - step.z),
      t = 1 - Smooth((d - step.radius) / 1.3);
    if (t > 0) height = height * (1 - t) + (natural - step.depth) * t;
  }
  // 北沙河。旧写法是一行硬编码（54<x<99 就把地面压到 -1.8 的一条排水沟）；
  // 现在是数据驱动的东西贯穿河槽，断面按 x 插值（浅滩），口径在
  // Data_FirstLevelMissionTopology.MISSION_NORTH_RIVER。取 min 而不是相减：
  // 路面/场坪/铁路路基先算完，河槽直接把它们切掉 —— 桥归桥、地形归地形。
  for (const river of spec.rivers || []) {
    const cut = RiverCutAt(x, z, river);
    if (cut > 0) height = Math.min(height, natural - cut);
  }
  for (const point of [
    { x: -62, z: 64 },
    { x: 54, z: 114 },
    // 西沟南端（15A→15B）：沟在 (56,207) 到头，接的是 2.8 m 宽的靠墙夹道。
    // 没有这道 9 m 的缓坡，担架队要从 2 m 深的沟里一步爬上来（实测坡度 1.51，
    // 越过 Rapier 的 52° 上限 —— 整支后送队会卡在沟底）。
    // 坡心压在沟口外侧（不是沟里）：9 m 的作用半径伸回沟里会把 PCG 摆好的踏板
    // 抬出地面 —— 那是「路线被踏板挡住」那条红的来源。
    { x: 52, z: 209.5 },
    MISSION_RECEPTION_SPACE.entry,
  ]) {
    const distance = Math.hypot(x - point.x, z - point.z);
    const blend = 1 - Smooth(distance / 9);
    height = height * (1 - blend) + natural * blend;
  }
  return height;
}

// PBR surface tint uses the same authored road and trench corridors.
//
// This is sampled per lattice vertex whenever a crater tile is built, so it is a
// blast-frame cost, not a load-time one: the array-allocating version below
// (one `mix` array per corridor per vertex, every polyline walked in full) was
// ~14 of the 15 ms a grenade cost in the mission level. Same output, but scalar
// channels and corridor culling — a vertex only pays for the polylines that can
// actually tint it. `out` lets a caller reuse one array across a whole tile.
const routeBounds = new WeakMap();
function RouteBounds(route) {
  let bounds = routeBounds.get(route);
  if (!bounds) {
    bounds = { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity };
    for (const p of route) {
      if (p.x < bounds.minX) bounds.minX = p.x;
      if (p.x > bounds.maxX) bounds.maxX = p.x;
      if (p.z < bounds.minZ) bounds.minZ = p.z;
      if (p.z > bounds.maxZ) bounds.maxZ = p.z;
    }
    routeBounds.set(route, bounds);
  }
  return bounds;
}
/**
 * Distance from (x, z) to a polyline, or Infinity once it is farther than
 * `reach` — the blends below are exactly zero beyond their own reach, so the
 * early-out never changes a colour. Segment rejection is a box test; the one
 * square root is taken at the end.
 */
function RouteDistanceWithin(x, z, route, reach) {
  const bounds = RouteBounds(route);
  if (x < bounds.minX - reach || x > bounds.maxX + reach
    || z < bounds.minZ - reach || z > bounds.maxZ + reach) return Infinity;
  let best = reach * reach;
  for (let i = 1; i < route.length; i++) {
    const a = route[i - 1], b = route[i];
    const loX = a.x < b.x ? a.x : b.x, hiX = a.x < b.x ? b.x : a.x;
    if (x < loX - reach || x > hiX + reach) continue;
    const loZ = a.z < b.z ? a.z : b.z, hiZ = a.z < b.z ? b.z : a.z;
    if (z < loZ - reach || z > hiZ + reach) continue;
    const dx = b.x - a.x, dz = b.z - a.z;
    let t = ((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz || 1);
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const ex = x - a.x - dx * t, ez = z - a.z - dz * t, d2 = ex * ex + ez * ez;
    if (d2 < best) best = d2;
  }
  return best < reach * reach ? Math.sqrt(best) : Infinity;
}
export function SampleMissionGroundColor(x, z, out = [0, 0, 0]) {
  const variation=.94+.06*Math.sin(x*.37)*Math.sin(z*.29);
  // Mild albedo multipliers: preserve generated soil detail without double-darkening.
  let r=.91*variation, g=.94*variation, b=.87*variation;
  for(const road of MISSION_TERRAIN.roads) {
    const d=RouteDistanceWithin(x,z,road.points,road.width/2+1.8);
    if(d===Infinity)continue;
    const t=1-Smooth((d-road.width/2)/1.8);
    r+=(1-r)*t; g+=(.97-g)*t; b+=(.90-b)*t;
  }
  for(const pad of MISSION_TERRAIN.pads) {
    const ex=Math.abs(x-pad.x)-pad.w/2, ez=Math.abs(z-pad.z)-pad.d/2;
    if(ex>=3||ez>=3)continue;
    const dx=ex>0?ex:0, dz=ez>0?ez:0, d=Math.sqrt(dx*dx+dz*dz);
    const t=.75*(1-Smooth(d/3));
    if(t<=0)continue;
    r+=(1-r)*t; g+=(.97-g)*t; b+=(.90-b)*t;
  }
  // 壕沟走廊：一次 Apply(x,z,0,0) 同时给两个答案 —— 负数是开挖深度，正数是沟沿
  // 抛土高度，空地上是 0（分桶网格里那一格没有边，直接返回）。旧写法是逐条走 7
  // 条折线，这里只碰落在同一格里的几条边，比旧的还省。
  const soil=TrenchPlanFor(MISSION_TERRAIN).Apply(x,z,0,0);
  if(soil<0) {
    const t=-soil/2;
    r+=(.83-r)*t; g+=(.80-g)*t; b+=(.75-b)*t;
  } else if(soil>0) {
    // 新翻出来的土比原地皮干一点、浅一点；抛土堆最高 0.42 m，别调过头。
    const t=.5*(soil<.4?soil/.4:1);
    r+=(.98-r)*t; g+=(.96-g)*t; b+=(.88-b)*t;
  }
  const rail=Math.abs(x+77);
  const railT=1-Smooth((rail-2.4)/1.5);
  if(railT>0){ r+=(.43-r)*railT; g+=(.44-g)*railT; b+=(.41-b)*railT; }
  out[0]=r; out[1]=g; out[2]=b;
  return out;
}

// Layered terrain (Script_TerrainMaterial): the corridor tints above move into
// real texture layers, so the vertex colour only keeps the rail-ballast spill.
// `layers` = [track, spoil, open]: cart track (roads + pads), trench spoil, and
// how much dry stubble the shader may grow here. Stubble keeps a clear margin
// around every worked surface; the shader's macro noise decides the rest.
const STUBBLE_CLEAR_M = 3.5;
export function SampleMissionGroundSurface(x, z, color = [0, 0, 0], layers = [0, 0, 0]) {
  let track = 0, spoil = 0, worked = 0;
  for (const road of MISSION_TERRAIN.roads) {
    const d = RouteDistanceWithin(x, z, road.points, road.width / 2 + STUBBLE_CLEAR_M);
    if (d === Infinity) continue;
    const t = 1 - Smooth((d - road.width / 2) / 1.8);
    if (t > track) track = t;
    const w = 1 - Smooth((d - road.width / 2) / STUBBLE_CLEAR_M);
    if (w > worked) worked = w;
  }
  for (const pad of MISSION_TERRAIN.pads) {
    const ex = Math.abs(x - pad.x) - pad.w / 2, ez = Math.abs(z - pad.z) - pad.d / 2;
    if (ex >= STUBBLE_CLEAR_M || ez >= STUBBLE_CLEAR_M) continue;
    const dx = ex > 0 ? ex : 0, dz = ez > 0 ? ez : 0, d = Math.sqrt(dx * dx + dz * dz);
    const t = 1 - Smooth(d / 3);
    if (t > track) track = t;
    const w = 1 - Smooth(d / STUBBLE_CLEAR_M);
    if (w > worked) worked = w;
  }
  // 壕沟翻土层跟着样条计划的**实际**沟沿走（带噪声的 halfFloor / bank，分桶网格只碰
  // 同一格里的边），沿沟沿再多铺 0.8 m —— 挖出来的土就堆在唇上。Corridor 的可见范围
  // 到坡顶外 bermW 为止，够这一层用；麦茬的 3.5 m 退让带比它远，照旧按标称折线量。
  const corridor = TrenchPlanFor(MISSION_TERRAIN).Corridor(x, z);
  if (corridor) {
    const t = 1 - Smooth((corridor.d - corridor.halfFloor - corridor.bank * 0.5) / (corridor.bank * 0.5 + 0.8));
    if (t > spoil) spoil = t;
  }
  for (const trench of MISSION_TERRAIN.trenches) {
    const d = RouteDistanceWithin(x, z, trench.points, trench.bottom / 2 + trench.bank + STUBBLE_CLEAR_M);
    if (d === Infinity) continue;
    const w = 1 - Smooth((d - trench.bottom / 2) / (trench.bank + STUBBLE_CLEAR_M));
    if (w > worked) worked = w;
  }
  const rail = Math.abs(x + 77);
  const railT = 1 - Smooth((rail - 2.4) / 1.5);
  const railNear = 1 - Smooth((rail - 2.4) / STUBBLE_CLEAR_M);
  if (railNear > worked) worked = railNear;
  let r = 1, g = 1, b = 1;
  if (railT > 0) { r += (.43 - r) * railT; g += (.44 - g) * railT; b += (.41 - b) * railT; }
  color[0] = r; color[1] = g; color[2] = b;
  layers[0] = track; layers[1] = spoil; layers[2] = 1 - worked;
  return color;
}
