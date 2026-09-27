// 全项目沙袋的唯一口径（纯数据，零 three）。口径文档：docs/Data_SandbagStandard.md。
//
// 1. 模型：只用 Model_BattlefieldPack.glb 里的三件沙袋 01/02/03（ExternalProps 的
//    battlefieldSandbag01..03）。程序化椭圆袋（Script_Geo.MakeSandbag）、Model_Sandbag.glb、
//    画了袋缝的白盒块都不再用来表现沙袋；新写的沙袋一律走这里的资产表。
// 2. 贴地：最底一层按袋子自己的脚印在共享地面上多点采样，袋底（不是包围盒底）压进土里
//    `embedM`；各件的「袋底离包围盒底多高」是 GLB 实测，见 sole。
// 3. 融合：袋子材质是地形混合的接收者（Script_SandbagStandard.SandbagContactMaterial），
//    贴地那一截读同一像素的地形颜色/法线/粗糙度，没有透明贴花。

export const SANDBAG_ASSET_IDS = Object.freeze([
  "battlefieldSandbag01", "battlefieldSandbag02", "battlefieldSandbag03",
]);

/**
 * 三件的实测包围盒（米，GLB 原尺寸）与袋底高度。
 * sole = 脚印核心区（长 ±70%、宽 ±80%）逐格最低点离包围盒底的**中位数**，占包围盒高的比例。
 * 01/02 是平底；03 是一只侧躺、底面拱起的袋子，核心区袋底普遍比最低点高两成 ——
 * 只按包围盒底贴地，它在胸墙最底层会留一道 8–15 cm 的亮缝（2026-09-27 用户截图）。
 * 门禁 Script_SandbagStandardTest 从 GLB 重新量一遍，和这里不一致就红。
 */
export const SANDBAG_METRICS = Object.freeze({
  battlefieldSandbag01: Object.freeze({ width: 1.926, height: 0.426, depth: 0.866, sole: 0.0 }),
  battlefieldSandbag02: Object.freeze({ width: 2.017, height: 0.426, depth: 1.303, sole: 0.0 }),
  battlefieldSandbag03: Object.freeze({ width: 1.883, height: 0.533, depth: 0.936, sole: 0.22 }),
});

export const SANDBAG_GROUNDING = Object.freeze({
  /** 袋底压进地面的深度：盖住袋底圆角与地形三角化的起伏。 */
  embedM: 0.05,
  /** 脚印采样：3×3 网格落在半长/半宽的这个比例上（袋端收尖，最外一圈不算脚）。 */
  footprintFraction: 0.8,
  /**
   * 脚印地面取最低点，但不比中位数低超过这么多（米）。坡上、坑洼里整只袋子都压进土；
   * 横在沟沿上、一侧悬在沟里的，按沟沿那一侧落地、悬出去的一角就让它悬着 ——
   * 不把整袋往沟里拽成一只往下耷的长枕头（2026-09-27 开场南沟沿实拍）。
   */
  overhangToleranceM: 0.12,
  /** 为了贴地最多往下伸多少（米）。再深就是悬在沟里的袋子，改摆位，不靠拉长。 */
  maxDropM: 0.45,
});

/** 地形融合（接收端）。核心带宽度沿用壕沟碎石的 Data_TrenchSurface.contact.blendWidthM（预通道共用同一 mask）。 */
export const SANDBAG_CONTACT = Object.freeze({
  /** 核心带以上再往上多少米有一层浮土色（只改反照率，不改法线/粗糙度）。 */
  dustBandM: 0.12,
  /** 浮土带最多把袋面颜色往地面颜色拉多少。 */
  dustStrength: 0.35,
  /** 浮土带上沿的世界噪声幅度（米），让那条线不是一刀切。 */
  dustEdgeNoiseM: 0.08,
});

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

export const SANDBAG_RUN = Object.freeze({
  /** 每层往上一层里压进层距的这个比例（软袋互相压扁，不留贯通缝）。 */
  overlapFraction: 0.55,
  /** 袋长 ÷ 袋高：模型原比例约 4.5；码墙时短一些，一只只袋子才分得出来。 */
  lengthPerHeight: 2.8,
  minBagM: 0.45,
  /** 同层相邻两件在接缝处互相压进的长度。 */
  endLapM: 0.14,
});

function SeededRandom(text) {
  let h = 2166136261;
  for (const ch of String(text)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return () => { h = Math.imul(h ^ (h >>> 15), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); h ^= h >>> 16; return (h >>> 0) / 4294967296; };
}
