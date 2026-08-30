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
