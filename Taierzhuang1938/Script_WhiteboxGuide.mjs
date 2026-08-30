// 关卡白盒的通用引导底座：可玩走廊、越界裁决与场景说明筛选。
//
// 这一层故意不 import three.js，也不认识任何具体关卡。章节只要提供一条带宽度的
// 折线和一组说明点，正片、浏览器测试以及未来的白盒页都能共用同一套答案。

function Clamp01(value) { return Math.max(0, Math.min(1, value)); }

function PointWidth(point, fallback = 40) {
  const width = Number(point?.halfWidth);
  return Number.isFinite(width) && width > 1 ? width : fallback;
}

/** 找到世界点在一条变宽折线上的最近投影。 */
export function NearestPlayableCorridorPoint(x, z, spec = {}) {
  const points = Array.isArray(spec.points) ? spec.points : [];
  if (points.length < 2) return null;
  let best = null;
  for (let i = 0; i < points.length - 1; i += 1) {
    const a = points[i], b = points[i + 1];
    const dx = b.x - a.x, dz = b.z - a.z;
    const length2 = dx * dx + dz * dz;
    if (!(length2 > 1e-6)) continue;
    const t = Clamp01(((x - a.x) * dx + (z - a.z) * dz) / length2);
    const nearX = a.x + dx * t, nearZ = a.z + dz * t;
    const offX = x - nearX, offZ = z - nearZ;
    const distance = Math.hypot(offX, offZ);
    if (best && distance >= best.distance) continue;
    const halfWidth = PointWidth(a) + (PointWidth(b) - PointWidth(a)) * t;
    best = { x: nearX, z: nearZ, offX, offZ, distance, halfWidth, segment: i, t };
  }
  return best;
}

/**
 * 评估玩家与可玩走廊的关系。warningMargin 是空气墙内侧的预警带宽；
 * hardInset 是裁回时留在墙内的余量，防止浮点误差让玩家下一帧又撞一次。
 */
export function EvaluatePlayableBoundary(x, z, spec = {}) {
  const nearest = NearestPlayableCorridorPoint(x, z, spec);
  if (!nearest) return { enabled: false, warning: false, hard: false, x, z };
  const warningMargin = Math.max(1, Number(spec.warningMargin) || 9);
  const warningAt = Math.max(1, nearest.halfWidth - warningMargin);
  const hard = nearest.distance > nearest.halfWidth;
  const warning = hard || nearest.distance > warningAt;
  return {
    enabled: true,
    warning,
    hard,
    x,
    z,
    nearest,
    distance: nearest.distance,
    halfWidth: nearest.halfWidth,
    remaining: Math.max(0, nearest.halfWidth - nearest.distance),
    overshoot: Math.max(0, nearest.distance - nearest.halfWidth),
    message: hard
      ? (spec.hardText || "已离开可玩区域，正在返回战场。")
      : (spec.warningText || "前方不是任务方向，返回战场。"),
  };
}

/** 空气墙裁决：返回的 x/z 永远位于走廊内；其余字段保留越界发生前的取证。 */
export function ConstrainPlayablePosition(x, z, spec = {}) {
  const view = EvaluatePlayableBoundary(x, z, spec);
  if (!view.enabled || !view.hard) return view;
  const inset = Math.max(0.2, Number(spec.hardInset) || 0.8);
  const allowed = Math.max(0.2, view.halfWidth - inset);
  let nx = 1, nz = 0;
  if (view.distance > 1e-6) {
    nx = view.nearest.offX / view.distance;
    nz = view.nearest.offZ / view.distance;
  }
  return {
    ...view,
    constrained: true,
    x: view.nearest.x + nx * allowed,
    z: view.nearest.z + nz * allowed,
  };
}

/**
 * 从章节说明点中选出当前阶段应展示的少量标签。HUD 只负责投影和绘制，
 * “哪几条现在有意义”由这个纯函数裁决，便于以后复用和自动测试。
 */
export function SelectWhiteboxAnnotations(annotations, player, objectiveIndex, limit = 3) {
  const visible = [];
  for (const annotation of annotations || []) {
    const from = Number.isFinite(annotation.fromObjective) ? annotation.fromObjective : 0;
    const to = Number.isFinite(annotation.toObjective) ? annotation.toObjective : Number.POSITIVE_INFINITY;
    if (objectiveIndex < from || objectiveIndex > to) continue;
    const distance = Math.hypot(annotation.x - player.x, annotation.z - player.z);
    const maxDistance = Number(annotation.maxDistance) || 150;
    if (distance > maxDistance) continue;
    visible.push({ ...annotation, distance });
  }
  visible.sort((a, b) => {
    const activeA = a.objective === objectiveIndex ? 0 : 1;
    const activeB = b.objective === objectiveIndex ? 0 : 1;
    return activeA - activeB || a.distance - b.distance;
  });
  return visible.slice(0, Math.max(1, limit));
}
