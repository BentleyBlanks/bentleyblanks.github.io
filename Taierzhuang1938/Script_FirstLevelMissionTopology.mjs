// Data_FirstLevelMissionTopology.mjs 的配套函数（2026-11-02 从数据模块搬出来：数据模块只放能导出成 JSON 的数据，见 docs/Data_DataSources.md「数据模块只放数据」）。

import { MISSION_NORTH_RIVER, MISSION_REGROUP_CORRIDORS } from "./Data_FirstLevelMissionTopology.mjs";

const SmoothStep = (t) => { const c = t <= 0 ? 0 : t >= 1 ? 1 : t; return c * c * (3 - 2 * c); };

/** 拓宽河段在 x 处的混合权重：段内 1、西端 blendWestM / 东端 blendEastM 米 smoothstep、段外 0。 */
export function RiverReachWeight(x, reach) {
  if (x <= reach.x0 - reach.blendWestM || x >= reach.x1 + reach.blendEastM) return 0;
  if (x >= reach.x0 && x <= reach.x1) return 1;
  return SmoothStep(x < reach.x0 ? (x - (reach.x0 - reach.blendWestM)) / reach.blendWestM
    : ((reach.x1 + reach.blendEastM) - x) / reach.blendEastM);
}

/**
 * 岸线起伏（米）：{ north ≥ 0 北岸线往南缩多少, south ≤ 0 南水线往北缩多少 }。fixed 区间内恰好是 +0 / +0（整数 0，
 * 与没有起伏时逐位相同），两侧 rampM 米 smoothstep 长出来。纯函数，确定性（只依赖 x）。
 */
export function RiverReachOffsets(x, reach) {
  const wander = reach.wander;
  if (!wander) return { north: 0, south: 0 };
  const [f0, f1] = wander.fixed;
  const env = x < f0 ? SmoothStep((f0 - x) / wander.rampM) : x > f1 ? SmoothStep((x - f1) / wander.rampM) : 0;
  if (env <= 0) return { north: 0, south: 0 };
  const Wave = (waves) => waves.reduce((sum, [len, amp, phase]) => sum + amp * Math.sin(2 * Math.PI * x / len + phase), 0);
  return { north: wander.north.ampM * (1 + Wave(wander.north.waves)) * env,
    south: -wander.south.ampM * (1 + Wave(wander.south.waves)) * env };
}

/** 断面参数按 x 插值（浅滩把参数拉向自己那一套）。纯函数，地形与测试共用。 */
export function RiverProfileAt(x, river = MISSION_NORTH_RIVER) {
  let depth = river.depth, floorHalfW = river.floorHalfW, bankRun = river.bankRun;
  for (const ford of river.fords) {
    const raw = (Math.abs(x - ford.x) - ford.halfW) / ford.blend;
    const t = raw <= 0 ? 1 : raw >= 1 ? 0 : 1 - raw * raw * (3 - 2 * raw);
    if (t <= 0) continue;
    depth += (ford.depth - depth) * t;
    floorHalfW += (ford.floorHalfW - floorHalfW) * t;
    bankRun += (ford.bankRun - bankRun) * t;
  }
  return { depth, floorHalfW, bankRun };
}

/**
 * 这个 x 上有效的拓宽断面（六个位置参数已按权重混合）。没有拓宽段覆盖时返回 null。
 * 权重 0 的一端等于原对称断面的退化形（见 MISSION_NORTH_RIVER 注释）。
 */
export function RiverReachAt(x, river = MISSION_NORTH_RIVER) {
  for (const reach of river.reaches || []) {
    const w = RiverReachWeight(x, reach);
    if (w <= 0) continue;
    const base = RiverProfileAt(x, river);
    const mix = (a, b) => a + (b - a) * w;
    const south = river.z + base.floorHalfW, off = RiverReachOffsets(x, reach);
    return { id: reach.id, w, depth: mix(base.depth, reach.depth),
      crestZ: mix(river.z - base.floorHalfW - base.bankRun, reach.crestZ + off.north),
      floorZ: mix(river.z - base.floorHalfW, reach.floorZ + off.north),
      dropZ: mix(south, reach.dropZ + off.south), waterZ: mix(south, reach.waterZ + off.south), waterCut: mix(base.depth, reach.waterCut),
      shoreZ: mix(south + base.bankRun, reach.shoreZ + off.south), waterRel: mix(-(base.depth - 1.2), reach.waterRel) };
  }
  return null;
}

/**
 * 拓宽河段两岸烂泥滩的权重 0…1（只用来给地表着色 / 出图层，不碰高度）：南岸 = 水线（waterZ）往南到 shoreZ 再往南 14 m 淡出的那一片，
 * 北岸 = 岸沿以北 6 m 淡入到河口。2026-09-30 浮桥取代铁路桥：南岸不再是白沙滩，是被水泡烂的泥滩（概念 18_1 / 18_2）。
 * 拓宽段外（含过渡带外沿）是 0；过渡带里随拓宽权重淡出。
 */
export function RiverMudAt(x, z, river = MISSION_NORTH_RIVER) {
  const reach = RiverReachAt(x, river);
  if (!reach) return 0;
  const north = z < reach.floorZ ? 1 - SmoothStep((reach.crestZ - z) / 6) : 0;
  const south = z > reach.dropZ ? SmoothStep((z - (reach.waterZ - 1.5)) / 2) * (1 - SmoothStep((z - (reach.shoreZ - 2)) / 16)) : 0;
  return Math.max(north, south) * reach.w;
}

/** 拓宽断面在 z 处的下切深度（RiverReachAt 的返回值）。 */
export function RiverReachCutAt(section, z) {
  if (z <= section.crestZ || z >= section.shoreZ) return 0;
  if (z < section.floorZ) return section.depth * SmoothStep((z - section.crestZ) / (section.floorZ - section.crestZ));
  if (z <= section.dropZ) return section.depth;
  if (z < section.waterZ)
    return section.waterCut + (section.depth - section.waterCut) * (1 - SmoothStep((z - section.dropZ) / (section.waterZ - section.dropZ)));
  return section.waterCut * (1 - SmoothStep((z - section.waterZ) / (section.shoreZ - section.waterZ)));
}

/** 河槽在 (x,z) 的下切深度（相对自然地面）。槽外是 0。 */
export function RiverCutAt(x, z, river = MISSION_NORTH_RIVER) {
  const reach = RiverReachAt(x, river);
  if (reach) return RiverReachCutAt(reach, z);
  const p = RiverProfileAt(x, river);
  const raw = (Math.abs(z - river.z) - p.floorHalfW) / p.bankRun;
  if (raw >= 1) return 0;
  const t = raw <= 0 ? 0 : raw * raw * (3 - 2 * raw);
  return p.depth * (1 - t);
}

/**
 * 水面在 x 处的剖面：{ level（相对自然地面，米）、z0、z1（北、南水线）、reach（拓宽段 id 或 null）}。
 * 拓宽段（含两端过渡）：水位 waterRel，水线是断面上深度 = −waterRel 的位置（数值二分）；
 * 原断面：槽底以上 1.2 m 的低水位，半宽 min(7.5, floorHalfW−3.5)；浅滩（depth<3）没有水，返回 null。
 * 两种水位在过渡段随权重线性混合，水面在 x 上连续。
 */
export function RiverWaterAt(x, river = MISSION_NORTH_RIVER) {
  const reach = RiverReachAt(x, river), base = RiverProfileAt(x, river);
  if (!reach) {
    if (base.depth < 3) return null;
    const halfW = Math.min(7.5, base.floorHalfW - 3.5);
    return halfW < 1 ? null : { level: -(base.depth - 1.2), z0: river.z - halfW, z1: river.z + halfW, reach: null };
  }
  const target = -reach.waterRel;
  let lo = reach.crestZ, hi = reach.floorZ;
  for (let i = 0; i < 40; i++) { const mid = (lo + hi) / 2; if (RiverReachCutAt(reach, mid) < target) lo = mid; else hi = mid; }
  const z0 = (lo + hi) / 2;
  let a = reach.dropZ, b = reach.shoreZ;
  for (let i = 0; i < 40; i++) { const mid = (a + b) / 2; if (RiverReachCutAt(reach, mid) > target) a = mid; else b = mid; }
  // 过渡段（w<1）水线在原断面水边（半宽 7.5 与低水位）和拓宽水线之间按权重混合，水面宽度在 x 上连续。
  const z1 = (a + b) / 2, baseHalf = Math.min(7.5, base.floorHalfW - 3.5), w = reach.w;
  return { level: reach.waterRel, z0: river.z - baseHalf + (z0 - (river.z - baseHalf)) * w,
    z1: river.z + baseHalf + (z1 - (river.z + baseHalf)) * w, reach: reach.id };
}

export const MissionRegroupCorridor=(id)=>MISSION_REGROUP_CORRIDORS.find(entry=>entry.id===id);

/**
 * **带路**用的那一段：走廊只到 `onEvacuation`（这一步的落脚点）为止。
 *
 * 走廊本身是给回头警告画「行动路线」用的，可以比这一步走得远；带路不行 ——
 * 把队伍带出落脚点，凑在一起才发生的事（15A 的点名要三个人都在 16 m 内）就永远不发生。
 * 没有 `onEvacuation` 的那一段（15C 拐进院门）整条都是带路线。
 */
export const RegroupGuideRoute=(id)=>{
  const corridor=MissionRegroupCorridor(id);
  if(!corridor?.onEvacuation)return corridor?.route;
  const index=corridor.route.findIndex(point=>point.x===corridor.onEvacuation.x&&point.z===corridor.onEvacuation.z);
  return index>=0?corridor.route.slice(0,index+1):corridor.route;
};
