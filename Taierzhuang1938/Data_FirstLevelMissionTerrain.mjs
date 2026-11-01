import { FRONT_SORTIE as Sortie, FRONT_SPACE as Space } from "./Data_FirstLevelFrontRoute.mjs";
import { MISSION_RECEPTION_SPACE, MISSION_NORTH_RIVER } from "./Data_FirstLevelMissionTopology.mjs";
// Authored soil, metres: natural ground, roads, rail berm and excavated trenches.
// This function is baked once into the shared rendered/physical heightfield.
import { FRONT_BOUND_CRATERS } from "./Data_FirstLevelMissionFront.mjs";
import { MISSION_TRENCH_NETWORK } from "./Data_FirstLevelMissionTrenches.mjs";
import { CompileTrenchNetwork, TrenchRevision } from "./Script_TrenchPlan.mjs";
import { WHITEBOX_TERRAIN } from "./Data_FirstLevelWhiteboxTerrain.mjs";
export const Smooth = (value) => {
  const t = Math.max(0, Math.min(1, value));
  return t * t * (3 - 2 * t);
};
/**
 * 铁路路基（x −77 一线的 0.62 m 土垄）沿 z 的权重：1 = 有，0 = 没有。2026-09-30 浮桥取代铁路桥之后铁路在河口前收尾
 * （MISSION_PONTOON_BRIDGE.railGapZ = [66, 184]，MISSION_RAILWAY 在这一段不铺道砟 / 枕木 / 钢轨），路基也跟着在挡车桩处收掉：
 * 收尾处往河的方向 4 m 落到 0，河那一段（z 70…180）没有路基 —— 不然浮桥头前面还杵着一条没有铁轨的土垄。
 */
export const RAIL_BERM_FADE_M = 4;
export const MISSION_TERRAIN = Object.freeze({
  cellM: 0.75,
  // 沟壁这类一格采不住的地方往下细分（Data_FirstLevelP012Terrain.RefineCells）。
  refine: { subdivisions: 3, errorM: 0.08, screenM: 0.1 },
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
    // 2026-09-23 proposal A: the tank road (plateau cutting -> bend behind NorthRuin -> west along
    // the front to the stop point north of the berm line) and the blocked south road it forks from.
    {points:Sortie.road,width:7},
    {points:Space.southRoad,width:6},
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
  // 05–18 白盒的局部地形修饰（四区各一张纯数据表，Data_FirstLevelWhiteboxTerrain*）。
  // 在 steps 之后、河槽与回归缓坡之前叠加；表空时逐位不变。口径 docs/Data_FirstLevelWhitebox0518Gap.md。
  whiteboxTerrain: WHITEBOX_TERRAIN,
  // 兼容视图：旧消费者（Layout 的清理网、任务/布设回归）只读 id/role/points/
  // depth/bottom/bank，这里照编译结果现算。getter 而不是字段，是因为编辑器改过
  // 参数之后 revision 一抬，下一次读就得是新的那份。
  get trenches() { return TrenchPlanFor(this).trenches; },
  steps: [
    // 2026-09-23 01-06 space rebuild (docs/Data_FirstLevelSpace0106_20260923.md). A step sets the ground to
    // natural-depth inside its radius: it digs pits and raises trench floors alike.
    // Nest compound floor (x 24..37, z -145.6..-156.8), dug half a metre.
    {x:28.5,z:-152.2,radius:5.5,depth:.5},
    {...Sortie.leftSeat,radius:3,depth:.65},
    // 03 tank preview (K5): the switchback top is a 3 m pad 0.6 m above the road floor, so the cutting lip hides
    // the hull but not the turret (FRONT_TANK_PATH HullDown).
    {x:49.5,z:-202.4,radius:3,depth:2.05},
    // 03 observation fire step at the spur's end: floor 0.4 m below the field (spur 0.95 -> 0.4 ramp, ~23 deg).
    {...Space.observation,radius:.7,depth:.4},
    // 01 dugout pit, dug into the outer (north-west) wall of the bend M; opens east onto the trench.
    {x:-0.4,z:-125.9,radius:1.9,depth:2.0},
    // Depth transitions (all under 45 deg): support sap -> right low trench, gap sap -> gap junction,
    // right low trench -> nest west door.
    {x:-5.6,z:-140.9,radius:1.0,depth:1.65},{x:-8,z:-142.6,radius:.9,depth:1.5},{x:23.4,z:-149.9,radius:.9,depth:.95},
    // Rear junction -> rear door ramp (trench floor -2 up to the nest floor -0.5).
    {x:29.7,z:-143.9,radius:1.1,depth:1.25},{x:29.7,z:-145.0,radius:.8,depth:.8},
    // The near-miss crater at the bend's inner corner: the SSW leg's east wall is down to 1.05 m
    // for ~4 m ("沟壁塌低段"), exposed to the fold F and the junction J.
    {x:2.8,z:-120.4,radius:1.7,depth:1.05},
    // Ammo sap climbs out at the yard's north gate (two treads).
    {x:41.3,z:-119.9,radius:1.2,depth:1.0},{x:41.2,z:-118.3,radius:1.0,depth:.4},
    // Berm-end craters: explain the tank's sight lane past the berm's east end and give the flank group its last line.
    ...Space.bermEndCraters.map((p,i)=>({...p,radius:[1.4,1.4,1.5,1.4,1.3,1.2,1.2][i],depth:[.7,.6,.6,.6,.6,.6,.6][i]})),
    ...FRONT_BOUND_CRATERS.map((p)=>({...p,radius:1.3,depth:.6})),
    ...Space.flankCraters.map((p)=>({x:p.x,z:p.z,radius:p.r,depth:.7})),
    ...Space.escortCraters.map((p)=>({x:p.x,z:p.z,radius:p.r,depth:.55})),
    // South-road roadblock crater just past the fork (FRONT_SPACE.roadblock): cuts the road the tank would need.
    {x:Space.roadblock.crater.x,z:Space.roadblock.crater.z,radius:Space.roadblock.crater.r,depth:Space.roadblock.crater.depth},
  ],
  pads: [
    { x: -71, z: 74, w: 13, d: 50 },
    // ruts:false —— 村落场坪：两条道路折线斜穿院落与房基，车辙不跟着它们画（地表图层用，不影响高度）。
    { x: 55, z: 6, w: 62, d: 42, ruts: false },
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
  // spec.naturalHeight（可选）：独立场地（炮击扬尘测试场）自带的自然地面；不给就是第一关那一份，行为逐位不变。
  const plan = CompileTrenchNetwork(network, { natural: spec.naturalHeight || SampleMissionNaturalHeight });
  trenchPlans.set(network, { revision, plan });
  return plan;
}
export function SampleMissionNaturalHeight(x, z) {
  const field = 0.12 * Math.sin(x / 22) * Math.cos(z / 28) + 0.07 * Math.sin((x + z) / 12);
  // Low field banks enclose the playable plain; authored roads and trench floors stay shared.
  const east = 4.2 * Smooth((x - 116) / 21) * (.88 + .12 * Math.cos(z / 35));
  const west = 4.3 * Smooth((-x - 190) / 15);
  const north = 3.1 * Smooth((-z - 184) / 18) * (.86 + .14 * Math.cos(x / 31));
  // Authored front bank: defenders shelter on its south side; flanking guns see around the ends.
  // 2026-09-23 proposal A: crest moved 6 m north (z=-160) and shortened to x -30..12 (fades out by
  // x=-34 / x=16) so the 01 break-in corridor stays 30+ m behind the backslope and the right nest
  // sits past the berm's east end, where it can flank both the gap and the frontal approach.
  const bank=2.1*(1-Smooth(Math.abs(z+160)/3.5))*(1-Smooth((Math.abs(x+9)-21)/4));
  return field + east + west + north + bank;
}
export const roadBounds = new WeakMap();
// Ramps that blend the cut back to natural soil (9 m radius). Hoisted: the heightfield
// bake calls SampleMissionTerrain for every lattice node.
export const NATURAL_RAMPS = Object.freeze([
    { x: -62, z: 64 },
    { x: 54, z: 114 },
    // 西沟南端（15A→15B）：沟在 (56,207) 到头，接的是 2.8 m 宽的靠墙夹道。
    // 没有这道 9 m 的缓坡，担架队要从 2 m 深的沟里一步爬上来（实测坡度 1.51，
    // 越过 Rapier 的 52° 上限 —— 整支后送队会卡在沟底）。
    // 坡心压在沟口外侧（不是沟里）：9 m 的作用半径伸回沟里会把 PCG 摆好的踏板
    // 抬出地面 —— 那是「路线被踏板挡住」那条红的来源。
    { x: 52, z: 209.5 },
    MISSION_RECEPTION_SPACE.entry,
]);

// PBR surface tint uses the same authored road and trench corridors.
//
// This is sampled per lattice vertex whenever a crater tile is built, so it is a
// blast-frame cost, not a load-time one: the array-allocating version below
// (one `mix` array per corridor per vertex, every polyline walked in full) was
// ~14 of the 15 ms a grenade cost in the mission level. Same output, but scalar
// channels and corridor culling — a vertex only pays for the polylines that can
// actually tint it. `out` lets a caller reuse one array across a whole tile.
export const routeBounds = new WeakMap();
/** 拓宽河段两岸烂泥滩的顶点色倍率（线性 rgb，乘在底图上）：被水泡烂的泥比干土暗、偏冷。 */
export const RIVER_MUD_TINT = Object.freeze([0.58, 0.55, 0.5]);
// Layered terrain (Script_TerrainMaterial): the corridor tints above move into
// real texture layers, so the vertex colour only keeps the rail-ballast spill.
// `layers` = [track, spoil, open, rut]: cart track (roads + pads), trench spoil,
// how much dry stubble the shader may grow here, and the signed lateral distance
// to the nearest rutted road ÷ TERRAIN_RUTS.encodeRangeM (1 = no road; see there).
// Stubble keeps a clear margin around every worked surface; the shader's macro
// noise decides the rest. Heights never read this: it is shading only.
export const STUBBLE_CLEAR_M = 3.5;
// 白盒小路的染色边，与 Data_FirstLevelWhiteboxTerrain.WHITEBOX_PATH_EDGE_M 同值（那边是纯数据表，
// 这边不反向 import 它，免得地形采样器多一层依赖）。
export const PATH_EDGE_M = 1.8;
