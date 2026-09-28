// 第一关 05–18 白盒的局部地形修饰：四个分区各一份纯数据表，这里合成一个采样钩子，
// 由 Data_FirstLevelMissionTerrain.SampleMissionTerrain 在「路面/场坪/壕沟/steps 之后、
// 北沙河河槽与四处回归自然缓坡之前」统一叠加。口径：docs/Data_FirstLevelWhitebox0518Gap.md §地形接口。
//
// 为什么走共享采样器而不是另起一张高度表：渲染地块、Rapier 高度场、角色/AI 贴地、弹道、
// Layout 的体块接地（Block/Bank/Grounded 都调 groundAt）全读 SampleMissionTerrain。加在这里，
// 土坎一抬，坎上的墙、坎下的担架路线、贴地的人一起跟着走，不会有第二个高度公式。
//
// ── 形状（每区 shapes 数组里的一项）───────────────────────────────────────────
//   公共字段：id（本区唯一）、op、dy（米，≥0）、feather（米，羽化带宽，≥0.75 = 一格高度场）、note。
//   kind:"disc"     { x, z, radius }                       圆（土包、弹坑、院子台地的圆角）
//   kind:"box"      { x, z, w, d, ry? }                     矩形（院子台地、路面下沉的一段）
//   kind:"polygon"  { points:[{x,z},…] }                    任意简单多边形（院落、河岸台地）
//   kind:"line"     { points:[{x,z,dy?},…], halfW }         折线胶囊：沟、坎、下沉路。每个点可带自己的
//                                                            dy，沿线段线性插值（沟由浅变深、坡道）。
//   核心区（圆内/矩形内/多边形内/离折线 ≤ halfW）权重 1，向外 feather 米内 smoothstep 落到 0。
//
//   op:"level"  把地面拉向「natural + dy」（dy 可为负：台地或平底坑）。按表内顺序依次混合。
//   op:"raise"  抬高 dy（土坎、路肩、土包）。同一点被多个 raise 覆盖时取**最大**，不相加。
//   op:"cut"    下挖 dy（沟、下沉路、河岸坎下）。同一点被多个 cut 覆盖时取**最大**，不相加。
//   叠加：先 level，再 height += maxRaise − maxCut。一条折线沟分几段写也不会在接头处挖双倍。
//
//   坡度：smoothstep 的最大斜率 = 1.5·dy/feather。人要走上去的坡保持 < tan52°≈1.28
//   （Rapier setMaxSlopeClimbAngle），即 feather > 1.17·dy；要挡人的沟壁/坎壁反过来取陡。
//   高度场格距 0.75 m：窄于 ~1.5 m 的台阶、路沿、门槛用体块，不要用地形。
//
// ── 不能碰的 ──────────────────────────────────────────────────────────────────
//   · 形状（连羽化带）必须完全落在本区 boxes 之内（Script_FirstLevelWhiteboxTerrainTest 断言），
//     采样时也按 box 硬裁剪，出框的部分不生效 —— 分区之间不会互相改到。
//   · 北沙河河槽、西沟浅滩（RiverCutAt 取 min）在修饰之后算：河岸以内改不了。
//   · 四处 9 m 回归自然缓坡（(-62,64)、(54,114)、(52,209.5)、接收院入口 (-13,240)）在修饰之后算：
//     这四处 9 m 内的修饰会被压回自然地面（保护沟口与院口的可走坡）。
//   · 纹理层（路面/抛土/麦茬）不读 shapes：下沉路的路面颜色仍按 MISSION_TERRAIN.roads 走。
//
// ── 小路（每区可选的 paths 数组，2026-09-28 引导轮，docs/Data_FirstLevelGuidance20260928.md §3）──
//   { id, points:[{x,z},…], width, wear?, note }
//   踩出来的路：**只画不挖** —— 只进地表纹理层（SampleMissionGroundSurface 的 track 层 +
//   麦茬退让），不进高度采样（Apply 不读它，SampleMissionTerrain 逐位不变，07+ 地面指纹不动）。
//   width 是路面全宽（米，脚径 1.2–2.5、车辙 3–5），wear 0–1 是踩实程度（缺省 0.85；路面纹理权重
//   = wear × 核心 1 → 外沿 1.8 m 内落到 0）。用途：把玩家要走的路线画在地上（村巷、院墙夹道、
//   去桥的田埂路、桥南撤出路），是「有明确路线的地方要有一条像路一样的存在」那条要求的载体。
//   同样只许落在本区 boxes 内（连 1.8 m 的染色边），Script_FirstLevelWhiteboxTerrainTest 断言。
// 纯数据 + 纯函数，无 three 依赖（AGENTS.md 跨系统契约 2）。
import { WHITEBOX_TERRAIN_FRONT } from "./Data_FirstLevelWhiteboxTerrainFront.mjs";
import { WHITEBOX_TERRAIN_VILLAGE } from "./Data_FirstLevelWhiteboxTerrainVillage.mjs";
import { WHITEBOX_TERRAIN_TRANSFER } from "./Data_FirstLevelWhiteboxTerrainTransfer.mjs";
import { WHITEBOX_TERRAIN_REAR } from "./Data_FirstLevelWhiteboxTerrainRear.mjs";

export const WHITEBOX_TERRAIN_REGIONS = Object.freeze([
  WHITEBOX_TERRAIN_FRONT, WHITEBOX_TERRAIN_VILLAGE, WHITEBOX_TERRAIN_TRANSFER, WHITEBOX_TERRAIN_REAR,
]);
export const WHITEBOX_TERRAIN_KINDS = Object.freeze(["disc", "box", "polygon", "line"]);
export const WHITEBOX_TERRAIN_OPS = Object.freeze(["level", "raise", "cut"]);
/** 小路染色边（米）：路面全宽之外再羽化这么宽落到 0，与 MISSION_TERRAIN.roads 的 1.8 m 同口径。 */
export const WHITEBOX_PATH_EDGE_M = 1.8;
export const WHITEBOX_PATH_DEFAULT_WEAR = 0.85;
/** 小路（连染色边）的外接框：这一框之外它对地表纹理的贡献严格为 0。 */
export function WhiteboxPathBounds(path) {
  const pad = path.width / 2 + WHITEBOX_PATH_EDGE_M;
  const xs = (path.points || []).map((p) => p.x), zs = (path.points || []).map((p) => p.z);
  return { minX: Math.min(...xs) - pad, maxX: Math.max(...xs) + pad, minZ: Math.min(...zs) - pad, maxZ: Math.max(...zs) + pad };
}

const Smooth = (value) => {
  const t = value < 0 ? 0 : value > 1 ? 1 : value;
  return t * t * (3 - 2 * t);
};
const Pts = (shape) => shape.points || [];
/** 形状核心区的外接框（不含羽化），世界米。 */
export function WhiteboxShapeCoreBounds(shape) {
  if (shape.kind === "disc") return { minX: shape.x - shape.radius, maxX: shape.x + shape.radius,
    minZ: shape.z - shape.radius, maxZ: shape.z + shape.radius };
  if (shape.kind === "box") {
    const c = Math.abs(Math.cos(shape.ry || 0)), s = Math.abs(Math.sin(shape.ry || 0));
    const hx = c * shape.w / 2 + s * shape.d / 2, hz = s * shape.w / 2 + c * shape.d / 2;
    return { minX: shape.x - hx, maxX: shape.x + hx, minZ: shape.z - hz, maxZ: shape.z + hz };
  }
  const pad = shape.kind === "line" ? shape.halfW : 0;
  const xs = Pts(shape).map((p) => p.x), zs = Pts(shape).map((p) => p.z);
  return { minX: Math.min(...xs) - pad, maxX: Math.max(...xs) + pad, minZ: Math.min(...zs) - pad, maxZ: Math.max(...zs) + pad };
}
/** 连羽化带的外接框：这一框之外，这个形状对高度的贡献严格为 0。 */
export function WhiteboxShapeBounds(shape) {
  const b = WhiteboxShapeCoreBounds(shape), f = shape.feather;
  return { minX: b.minX - f, maxX: b.maxX + f, minZ: b.minZ - f, maxZ: b.maxZ + f };
}
// 到核心区边界的距离（核心内 ≤ 0）与该处的 dy。
function CoreDistance(shape, x, z) {
  if (shape.kind === "disc") return { d: Math.hypot(x - shape.x, z - shape.z) - shape.radius, dy: shape.dy };
  if (shape.kind === "box") {
    const c = Math.cos(shape.ry || 0), s = Math.sin(shape.ry || 0), dx = x - shape.x, dz = z - shape.z;
    const ex = Math.abs(dx * c - dz * s) - shape.w / 2, ez = Math.abs(dx * s + dz * c) - shape.d / 2;
    return { d: ex > 0 || ez > 0 ? Math.hypot(Math.max(ex, 0), Math.max(ez, 0)) : Math.max(ex, ez), dy: shape.dy };
  }
  const pts = Pts(shape);
  if (shape.kind === "polygon") {
    let inside = false, best = Infinity;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const a = pts[j], b = pts[i];
      if ((b.z > z) !== (a.z > z) && x < (a.x - b.x) * (z - b.z) / (a.z - b.z) + b.x) inside = !inside;
      const vx = b.x - a.x, vz = b.z - a.z, t = Math.max(0, Math.min(1, ((x - a.x) * vx + (z - a.z) * vz) / (vx * vx + vz * vz || 1)));
      best = Math.min(best, Math.hypot(x - a.x - vx * t, z - a.z - vz * t));
    }
    return { d: inside ? -best : best, dy: shape.dy };
  }
  // line
  let best = Infinity, dy = shape.dy;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], vx = b.x - a.x, vz = b.z - a.z;
    const t = Math.max(0, Math.min(1, ((x - a.x) * vx + (z - a.z) * vz) / (vx * vx + vz * vz || 1)));
    const dist = Math.hypot(x - a.x - vx * t, z - a.z - vz * t);
    if (dist < best) {
      best = dist;
      const da = a.dy ?? shape.dy, db = b.dy ?? shape.dy;
      dy = da + (db - da) * t;
    }
  }
  return { d: best - shape.halfW, dy };
}
/** 单个形状在 (x,z) 的权重与 dy（纯函数，测试与出图用）。 */
export function WhiteboxShapeWeight(shape, x, z) {
  const { d, dy } = CoreDistance(shape, x, z);
  const w = d <= 0 ? 1 : shape.feather > 0 ? 1 - Smooth(d / shape.feather) : 0;
  return { w, dy };
}

/**
 * 把分区表编译成一个采样钩子。`regions` 缺省为四区正式表；测试可以传自造的表。
 * 返回 { regions, shapes, paths, bounds, Apply(x, z, height, natural) }。
 * Apply 在没有任何形状覆盖 (x,z) 时原样返回传进来的 height（同一个 number，逐位不变）。
 * paths 是四区小路的平铺表（{ id, region, points, width, wear }，note 已剥掉），只给地表纹理采样读。
 */
export function CompileWhiteboxTerrain(sourceRegions = WHITEBOX_TERRAIN_REGIONS) {
  // 形状的 note 是给人看的中文说明，留在分区源表里；编译结果会挂进任务数据
  // （FIRST_LEVEL_MISSION_PHASE……terrainSpec），字体子集取字器会把那里的字符串当界面文案扫。
  const regions = sourceRegions.map((region) => ({ ...region,
    shapes: region.shapes.map(({ note, ...shape }) => shape),
    paths: (region.paths || []).map(({ note, ...path }) => ({ wear: WHITEBOX_PATH_DEFAULT_WEAR, ...path })) }));
  const paths = regions.flatMap((region) => region.paths.map((path) => Object.freeze({ ...path, region: region.id })));
  const shapes = [];
  for (const region of regions) for (const shape of region.shapes) {
    const b = WhiteboxShapeBounds(shape);
    // 硬裁剪到本区 box：出框部分一律不生效（校验另在测试里报错）。
    const clips = region.boxes.map((box) => ({ minX: Math.max(b.minX, box.minX), maxX: Math.min(b.maxX, box.maxX),
      minZ: Math.max(b.minZ, box.minZ), maxZ: Math.min(b.maxZ, box.maxZ) }))
      .filter((c) => c.minX < c.maxX && c.minZ < c.maxZ);
    if (clips.length) shapes.push({ shape, region: region.id, clips });
  }
  const bounds = shapes.length ? {
    minX: Math.min(...shapes.flatMap((s) => s.clips.map((c) => c.minX))), maxX: Math.max(...shapes.flatMap((s) => s.clips.map((c) => c.maxX))),
    minZ: Math.min(...shapes.flatMap((s) => s.clips.map((c) => c.minZ))), maxZ: Math.max(...shapes.flatMap((s) => s.clips.map((c) => c.maxZ))),
  } : null;
  const levels = shapes.filter((s) => s.shape.op === "level");
  const others = shapes.filter((s) => s.shape.op !== "level");
  const Inside = (s, x, z) => s.clips.some((c) => x >= c.minX && x <= c.maxX && z >= c.minZ && z <= c.maxZ);
  function Apply(x, z, height, natural) {
    if (!bounds || x < bounds.minX || x > bounds.maxX || z < bounds.minZ || z > bounds.maxZ) return height;
    let h = height;
    for (const s of levels) {
      if (!Inside(s, x, z)) continue;
      const { w, dy } = WhiteboxShapeWeight(s.shape, x, z);
      if (w > 0) h += (natural + dy - h) * w;
    }
    let raise = 0, cut = 0;
    for (const s of others) {
      if (!Inside(s, x, z)) continue;
      const { w, dy } = WhiteboxShapeWeight(s.shape, x, z);
      if (w <= 0) continue;
      if (s.shape.op === "raise") raise = Math.max(raise, dy * w);
      else cut = Math.max(cut, dy * w);
    }
    return raise === 0 && cut === 0 ? h : h + raise - cut;
  }
  return Object.freeze({ regions, shapes, paths: Object.freeze(paths), bounds, Apply });
}
/** 正式表编译结果：Data_FirstLevelMissionTerrain.MISSION_TERRAIN.whiteboxTerrain。 */
export const WHITEBOX_TERRAIN = CompileWhiteboxTerrain();
