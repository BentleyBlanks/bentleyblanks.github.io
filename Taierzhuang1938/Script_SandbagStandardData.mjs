// Data_SandbagStandard.mjs 的配套函数（2026-11-02 从数据模块搬出来：数据模块只放能导出成 JSON 的数据，见 docs/Data_DataSources.md「数据模块只放数据」）。

import { SANDBAG_ASSET_IDS, SANDBAG_GROUNDING, SANDBAG_METRICS, SANDBAG_RUN } from "./Data_SandbagStandard.mjs";

export function IsStandardSandbagAsset(id) {
  return SANDBAG_ASSET_IDS.includes(id);
}

/** 袋底离模型原点（包围盒底）的高度，米；scaleY 是这件摆出来的竖向缩放。 */
export function SandbagSoleHeight(asset, scaleY = 1) {
  const metrics = SANDBAG_METRICS[asset];
  return metrics ? metrics.sole * metrics.height * scaleY : 0;
}

/**
 * 脚印地面：按 ry 转过的袋子脚印取 3×3 采样，返回排好序的高度与落地用的那个高度。
 * groundAt(x, z) 是本关共享的地面采样器（AGENTS 第 5 条：不另写高度公式）。
 */
export function SandbagFootprintGround(groundAt, x, z, ry, halfWidth, halfDepth) {
  const f = SANDBAG_GROUNDING.footprintFraction, cos = Math.cos(ry), sin = Math.sin(ry);
  const heights = [];
  for (const a of [-1, 0, 1]) for (const b of [-1, 0, 1]) {
    const lx = a * halfWidth * f, lz = b * halfDepth * f;
    heights.push(groundAt(x + cos * lx + sin * lz, z - sin * lx + cos * lz));
  }
  heights.sort((p, q) => p - q);
  const median = heights[Math.floor(heights.length / 2)];
  return { heights, ground: Math.max(heights[0], median - SANDBAG_GROUNDING.overhangToleranceM) };
}

/**
 * 单件（等比缩放）落地：返回模型原点的 y，让袋底压进 embedM。
 * floorY 给了就不往它上面放（屋里的铺地、洞底）。
 */
export function SandbagGroundedY(groundAt, { asset, x, z, ry = 0, scale = 1 }) {
  const metrics = SANDBAG_METRICS[asset];
  if (!metrics) throw new Error(`not a standard sandbag: ${asset}`);
  const { ground } = SandbagFootprintGround(groundAt, x, z, ry, metrics.width * scale / 2, metrics.depth * scale / 2);
  return ground - SANDBAG_GROUNDING.embedM - SandbagSoleHeight(asset, scale);
}

/**
 * 最底层一件（竖向单独缩放、顶面不许动）：给定顶面 topY 与原本的底 bottomY，
 * 往下伸到袋底压进地面为止，最多 maxDropM。返回新的底与高。
 * 袋底随高度一起缩放，所以要解 B + sole·(T − B) = G − embed。
 */
export function SandbagGroundedBottom(groundAt, { asset, x, z, ry = 0, halfWidth, halfDepth, topY, bottomY }) {
  const metrics = SANDBAG_METRICS[asset];
  if (!metrics) throw new Error(`not a standard sandbag: ${asset}`);
  const { ground } = SandbagFootprintGround(groundAt, x, z, ry, halfWidth, halfDepth);
  const f = metrics.sole;
  const wanted = (ground - SANDBAG_GROUNDING.embedM - f * topY) / (1 - f);
  const bottom = Math.max(bottomY - SANDBAG_GROUNDING.maxDropM, Math.min(bottomY, wanted));
  return { bottom, height: topY - bottom, ground };
}

/**
 * 沿一段直线码沙袋（布景用，没有碰撞）：层层错缝，每层顶面压进上一层一截，最底层逐件贴地。
 * 每件单独给三轴缩放 —— 和第一关工事（Script_FirstLevelMissionFortifications）同一种填法。
 *   a/b      线段两端（米，世界 XZ）；袋子的中心线就在这条线上
 *   layers   层数；layerM 层距；depthM 袋子横向厚度
 *   groundAt 共享地面采样器（洞里给一个常数地板也行）
 * 返回 [{ asset, x, y, z, ry, scale:[sx,sy,sz] }]，y 是模型原点（包围盒底）。
 */
export function SandbagRunPlacements({ a, b, layers, layerM, depthM, groundAt, seed = "sandbagRun" }) {
  const dx = b.x - a.x, dz = b.z - a.z, len = Math.hypot(dx, dz);
  if (!(len > 0.05) || !(layers >= 1)) return [];
  const ux = dx / len, uz = dz / len, ry = Math.atan2(ux, uz) - Math.PI / 2;
  const rnd = SeededRandom(seed);
  // 模型本身约 4.5:1:2（长:高:宽），按层高推出自然袋长；短段就一件压扁的袋子。
  const height0 = layerM * (1 + SANDBAG_RUN.overlapFraction);
  const bagM = Math.max(SANDBAG_RUN.minBagM, height0 * SANDBAG_RUN.lengthPerHeight);
  const columns = Math.max(1, Math.round(len / bagM)), slot = len / columns;
  const lap = Math.min(slot * 0.25, SANDBAG_RUN.endLapM);
  const out = [], first = Math.floor(rnd() * 3);
  for (let row = 0; row < layers; row++) for (let col = 0; col < columns; col++) {
    const shift = row % 2 && columns > 1 ? slot * 0.3 : 0;
    const start = Math.max(0, col * slot - (col ? lap / 2 : 0) + (col ? shift : 0));
    const end = Math.min(len, (col + 1) * slot + (col < columns - 1 ? lap / 2 + shift : 0));
    const along = (start + end) / 2, asset = SANDBAG_ASSET_IDS[(first + row + col) % 3];
    const metrics = SANDBAG_METRICS[asset];
    const x = a.x + ux * along, z = a.z + uz * along, yaw = ry + (rnd() - 0.5) * 0.08;
    // 每一列的层基按这一列脚印的落地高度算（与最底层贴地同一口径），上面几层跟着地形起伏。
    const base = SandbagFootprintGround(groundAt, x, z, yaw, (end - start) / 2, depthM / 2).ground;
    let bottom = base + row * layerM - (row ? 0 : SANDBAG_GROUNDING.embedM);
    let height = layerM * (1 + (row < layers - 1 ? SANDBAG_RUN.overlapFraction : 0.25));
    if (row === 0) ({ bottom, height } = SandbagGroundedBottom(groundAt, {
      asset, x, z, ry: yaw, halfWidth: (end - start) / 2, halfDepth: depthM / 2, topY: bottom + height, bottomY: bottom,
    }));
    out.push({ asset, x, y: bottom, z, ry: yaw,
      scale: [(end - start) / metrics.width, height / metrics.height, depthM * (0.94 + rnd() * 0.1) / metrics.depth] });
  }
  return out;
}

function SeededRandom(text) {
  let h = 2166136261;
  for (const ch of String(text)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return () => { h = Math.imul(h ^ (h >>> 15), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); h ^= h >>> 16; return (h >>> 0) / 4294967296; };
}
