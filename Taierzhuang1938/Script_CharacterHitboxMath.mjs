// 人物命中代理的纯几何核。这里不 import three，方便在 Node 中把“子弹线真的先碰到
// 哪一段胶囊”逐条回归。角色模型层只负责把骨骼更新成世界坐标再交给这些函数。
//
// 3A 式命中代理不用 mesh 的粗包围盒，而是头、胸、手脚各自一根贴骨胶囊。因为步枪
// 子弹会在一帧跨越十几米，必须求精确的 ray/capsule 首交点；“射线到骨段最近距离”
// 只能做宽相，斜着穿过时会把命中点提前或推后，不能直接作为伤害判据。

const EPSILON = 1e-9;

function Dot(a, b) { return a.x * b.x + a.y * b.y + a.z * b.z; }

function DistanceSqToSegment(point, start, end) {
  const x = end.x - start.x;
  const y = end.y - start.y;
  const z = end.z - start.z;
  const lengthSq = x * x + y * y + z * z;
  if (lengthSq < EPSILON) {
    const dx = point.x - start.x, dy = point.y - start.y, dz = point.z - start.z;
    return dx * dx + dy * dy + dz * dz;
  }
  const t = Math.max(0, Math.min(1,
    ((point.x - start.x) * x + (point.y - start.y) * y + (point.z - start.z) * z) / lengthSq));
  const dx = point.x - (start.x + x * t);
  const dy = point.y - (start.y + y * t);
  const dz = point.z - (start.z + z * t);
  return dx * dx + dy * dy + dz * dz;
}

/** First non-negative ray/sphere intersection. `direction` must be normalized. */
export function RaycastSphere(origin, direction, center, radius) {
  const mx = origin.x - center.x, my = origin.y - center.y, mz = origin.z - center.z;
  const b = mx * direction.x + my * direction.y + mz * direction.z;
  const c = mx * mx + my * my + mz * mz - radius * radius;
  if (c > 0 && b > 0) return null;
  const h = b * b - c;
  if (h < 0) return null;
  return Math.max(0, -b - Math.sqrt(h));
}

/**
 * First non-negative ray/oriented-ellipsoid intersection.
 *
 * `axes` contains the ellipsoid's three orthonormal world axes and `radii` the matching
 * half-extents. Projecting the ray into unit-sphere space keeps `t` in world metres because
 * the transformed direction is used only inside the quadratic; `direction` must be normalized.
 */
export function RaycastEllipsoid(origin, direction, center, radii, axes) {
  const relative = {
    x: origin.x - center.x,
    y: origin.y - center.y,
    z: origin.z - center.z,
  };
  let a = 0, b = 0, c = -1;
  for (const key of ["x", "y", "z"]) {
    const radius = radii[key];
    if (!(radius > EPSILON)) return null;
    const projectedOrigin = Dot(relative, axes[key]) / radius;
    const projectedDirection = Dot(direction, axes[key]) / radius;
    a += projectedDirection * projectedDirection;
    b += projectedOrigin * projectedDirection;
    c += projectedOrigin * projectedOrigin;
  }
  if (c <= 0) return 0;
  if (a < EPSILON || b > 0) return null;
  const discriminant = b * b - a * c;
  if (discriminant < 0) return null;
  const near = (-b - Math.sqrt(discriminant)) / a;
  return near >= 0 ? near : null;
}

/**
 * Exact first intersection between a normalized ray and a finite capsule.
 *
 * The old approximation measured nearest ray/bone distance then subtracted a sphere chord.
 * That only holds for a perpendicular cut; a diagonal bullet could receive a hit point that
 * was visibly outside the proxy. This solves the cylinder and both hemispherical caps.
 */
export function RaycastCapsule(origin, direction, start, end, radius) {
  if (DistanceSqToSegment(origin, start, end) <= radius * radius) return 0;

  const bax = end.x - start.x, bay = end.y - start.y, baz = end.z - start.z;
  const oax = origin.x - start.x, oay = origin.y - start.y, oaz = origin.z - start.z;
  const baLenSq = bax * bax + bay * bay + baz * baz;
  if (baLenSq < EPSILON) return RaycastSphere(origin, direction, start, radius);

  const baDir = bax * direction.x + bay * direction.y + baz * direction.z;
  const baOrigin = bax * oax + bay * oay + baz * oaz;
  const dirOrigin = direction.x * oax + direction.y * oay + direction.z * oaz;
  const originLenSq = oax * oax + oay * oay + oaz * oaz;
  const qa = baLenSq - baDir * baDir;
  const qb = baLenSq * dirOrigin - baOrigin * baDir;
  const qc = baLenSq * originLenSq - baOrigin * baOrigin - radius * radius * baLenSq;
  let best = null;

  if (qa > EPSILON) {
    const discriminant = qb * qb - qa * qc;
    if (discriminant >= 0) {
      const root = Math.sqrt(discriminant);
      for (const t of [(-qb - root) / qa, (-qb + root) / qa]) {
        if (t < 0) continue;
        const axial = baOrigin + t * baDir;
        if (axial >= 0 && axial <= baLenSq && (best === null || t < best)) best = t;
      }
    }
  }

  for (const cap of [start, end]) {
    const t = RaycastSphere(origin, direction, cap, radius);
    if (t !== null && (best === null || t < best)) best = t;
  }
  return best;
}

/**
 * 关节处的首交点归哪一段肢体。
 *
 * 同一关节串起来的两根肢体胶囊（大腿 b 与小腿 a 是同一根骨头）在关节周围互相重叠：
 * 大腿的圆端帽以关节为心、按大腿半径悬出到小腿上，反过来小腿的端帽也伸进大腿。
 * 只比「谁先被射线碰到」时，粗的那一段总是先碰到 —— 膝盖一弯、子弹从上往下来，
 * 瞄小腿中段打到的是大腿，而那一点的蒙皮 95% 权重在小腿骨上（2026-09-13 实测，
 * docs/Data_Dismemberment.md §11.9）。
 *
 * 所以关节球里的点按**关节夹角的平分面**分给两段：腿伸直时就是过关节垂直于腿的那个面；
 * 屈膝时膝盖前面（髌骨）归大腿，膝盖下面的胫骨归小腿。离关节超过端帽半径的点（胶囊
 * 圆柱面上的）不动，躯干与头不参与（伤害分类照原样），已经断掉的那一段不在
 * `shapes` 里，也就抢不走任何点。
 *
 * @param {Array<object>} shapes 当前还在的全部命中体（运行时 `GetHitboxes()` 的结果）
 * @param {object} shape 射线最先碰到的那一个
 * @param {{x:number,y:number,z:number}} point 首交点（世界）
 * @returns {object} 这个点真正属于的命中体（多数情况就是 `shape` 本身）
 */
export function JointOwner(shapes, shape, point) {
  if (!shape || shape.part !== "limb" || shape.type !== "capsule" || !point || !shapes) return shape;
  for (const other of shapes) {
    if (!other || other === shape || other.part !== "limb" || other.type !== "capsule") continue;
    // shape 是上一段（关节在它的 end）还是下一段（关节在它的 start）。
    const shapeIsParent = shape.b != null && other.a === shape.b;
    if (!shapeIsParent && !(shape.a != null && other.b === shape.a)) continue;
    const parent = shapeIsParent ? shape : other, child = shapeIsParent ? other : shape;
    const joint = child.start;
    const px = point.x - joint.x, py = point.y - joint.y, pz = point.z - joint.z;
    const reach = Math.max(parent.worldRadius ?? parent.radius ?? 0, child.worldRadius ?? child.radius ?? 0);
    if (px * px + py * py + pz * pz > reach * reach * (1 + 1e-6)) continue;
    const ux = parent.start.x - joint.x, uy = parent.start.y - joint.y, uz = parent.start.z - joint.z;
    const vx = child.end.x - joint.x, vy = child.end.y - joint.y, vz = child.end.z - joint.z;
    const uLen = Math.hypot(ux, uy, uz), vLen = Math.hypot(vx, vy, vz);
    if (uLen < EPSILON || vLen < EPSILON) continue;
    // 平分面法线 = 指向上一段的单位向量 − 指向下一段的单位向量；> 0 在上一段那侧。
    const side = px * (ux / uLen - vx / vLen) + py * (uy / uLen - vy / vLen) + pz * (uz / uLen - vz / vLen);
    if (shapeIsParent ? side < 0 : side > 0) return other;
  }
  return shape;
}

/**
 * 一组世界坐标命中体里，射线最先碰到的那一个：`{ t, part, shape }` 或 null。
 * 等距时取 priority 高的；关节球里的点再按 JointOwner 归段。
 * 蒙皮人物（`CharacterModel.Raycast`）与远景姿势桶（`Actor.RaycastHitboxes`）共用这一份。
 */
export function RaycastShapes(shapes, origin, direction, maxDistance) {
  let best = null;
  for (const shape of shapes) {
    let distance;
    if (shape.type === "ellipsoid") {
      distance = RaycastEllipsoid(origin, direction, shape.center, shape.worldRadii, shape.worldAxes);
    } else if (shape.type === "sphere") {
      distance = RaycastSphere(origin, direction, shape.center, shape.worldRadius);
    } else {
      distance = RaycastCapsule(origin, direction, shape.start, shape.end, shape.worldRadius);
    }
    if (distance !== null && distance <= maxDistance && (!best
        || distance < best.t - 1e-6
        || (Math.abs(distance - best.t) <= 1e-6 && (shape.priority || 0) > (best.shape.priority || 0)))) {
      best = { t: distance, part: shape.part, shape };
    }
  }
  if (best) {
    // 关节球里的首交点按关节平分面归段（屈膝时粗的大腿端帽悬在胫骨上，不能抢小腿的弹）。
    const point = { x: origin.x + direction.x * best.t, y: origin.y + direction.y * best.t, z: origin.z + direction.z * best.t };
    const owner = JointOwner(shapes, best.shape, point);
    if (owner !== best.shape) best = { t: best.t, part: owner.part, shape: owner };
  }
  return best;
}
