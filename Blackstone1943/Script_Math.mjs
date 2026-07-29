/**
 * Script_Math.mjs — 随机 / 噪声 / 缓动 / 平面几何工具
 * Owner: AgentFoundation
 *
 * 纪律：零 import，**禁止 import three**。全部是纯函数或显式持有种子的确定性对象。
 * 向量一律普通对象 {x,y} / {x,z} / {x,y,z}，可传 out 复用以免每帧 new。
 */

export const Tau = 6.283185307179586;
export const Pi = Math.PI;
export const HalfPi = Math.PI / 2;
export const DegToRad = Math.PI / 180;
export const RadToDeg = 180 / Math.PI;
export const Epsilon = 1e-6;

/* ================================================================== *
 * 一、确定性随机
 * 核心流用 sfc32（契约指定），种子扩散用 mulberry32，同种子逐位可复现。
 * ================================================================== */

function StringToSeed(text) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** mulberry32：单变量 PRNG，用来把一个种子扩散成 sfc32 需要的四个状态字。 */
export function CreateMulberry32(seed) {
  let state = (seed >>> 0) || 0x9e3779b9;
  return function Mulberry32() {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function NormalizeSeed(seed) {
  if (typeof seed === 'string') return StringToSeed(seed);
  if (typeof seed === 'number' && Number.isFinite(seed)) return (Math.floor(seed) >>> 0) || 1;
  return 0x1943c01d >>> 0;
}

/** 确定性随机源。CreateRandom('黑石峪') 与 CreateRandom(1943) 都合法。 */
export function CreateRandom(seed) {
  const random = {
    seed: NormalizeSeed(seed),
    a: 0, b: 0, c: 0, d: 0,
    gaussSpare: null,

    Next() {
      /* sfc32 */
      const t = (((this.a + this.b) >>> 0) + this.d) >>> 0;
      this.d = (this.d + 1) >>> 0;
      this.a = (this.b ^ (this.b >>> 9)) >>> 0;
      this.b = (this.c + (this.c << 3)) >>> 0;
      this.c = ((this.c << 21) | (this.c >>> 11)) >>> 0;
      this.c = (this.c + t) >>> 0;
      return t / 4294967296;
    },
    Range(min, max) { return min + (max - min) * this.Next(); },
    Int(minInclusive, maxExclusive) {
      const span = Math.max(0, Math.floor(maxExclusive) - Math.floor(minInclusive));
      if (span <= 0) return Math.floor(minInclusive);
      return Math.floor(minInclusive) + Math.floor(this.Next() * span);
    },
    Pick(list) {
      if (!list || list.length === 0) return null;
      return list[Math.min(list.length - 1, Math.floor(this.Next() * list.length))];
    },
    PickWeighted(list, weights) { return WeightedPick(list, weights, this.Next()); },
    Shuffle(list) {
      if (!list) return list;
      for (let i = list.length - 1; i > 0; i -= 1) {
        const j = Math.floor(this.Next() * (i + 1));
        const tmp = list[i]; list[i] = list[j]; list[j] = tmp;
      }
      return list;
    },
    Chance(probability) { return this.Next() < probability; },
    Sign() { return this.Next() < 0.5 ? -1 : 1; },
    Unit2() {
      const angle = this.Next() * Tau;
      return { x: Math.cos(angle), y: Math.sin(angle) };
    },
    Gauss(mean = 0, deviation = 1) {
      if (this.gaussSpare !== null) {
        const spare = this.gaussSpare;
        this.gaussSpare = null;
        return mean + deviation * spare;
      }
      let u = 0, v = 0, s = 0;
      do {
        u = this.Next() * 2 - 1;
        v = this.Next() * 2 - 1;
        s = u * u + v * v;
      } while (s >= 1 || s === 0);
      const scale = Math.sqrt((-2 * Math.log(s)) / s);
      this.gaussSpare = v * scale;
      return mean + deviation * u * scale;
    },
    /** 派生子流：同一父种子 + 同一 tag 永远得到同一子流，互不干扰。 */
    Fork(tag) {
      return CreateRandom((this.seed ^ StringToSeed(String(tag))) >>> 0);
    },
    /** 圆盘内均匀采样（XZ 平面）。 */
    PointInDisc(radius, out) {
      const r = radius * Math.sqrt(this.Next());
      const angle = this.Next() * Tau;
      const target = out || { x: 0, z: 0 };
      target.x = Math.cos(angle) * r;
      target.z = Math.sin(angle) * r;
      return target;
    },
    /** 圆环内采样，避免全挤在圆心。 */
    PointInRing(innerRadius, outerRadius, out) {
      const inner2 = innerRadius * innerRadius;
      const outer2 = outerRadius * outerRadius;
      const r = Math.sqrt(inner2 + (outer2 - inner2) * this.Next());
      const angle = this.Next() * Tau;
      const target = out || { x: 0, z: 0 };
      target.x = Math.cos(angle) * r;
      target.z = Math.sin(angle) * r;
      return target;
    },
    Reset(nextSeed) {
      if (nextSeed !== undefined) this.seed = NormalizeSeed(nextSeed);
      const spread = CreateMulberry32(this.seed);
      this.a = (spread() * 4294967296) >>> 0;
      this.b = (spread() * 4294967296) >>> 0;
      this.c = (spread() * 4294967296) >>> 0;
      this.d = (spread() * 4294967296) >>> 0;
      this.gaussSpare = null;
      /* 预热，抹掉低质量的前几个输出 */
      for (let i = 0; i < 12; i += 1) this.Next();
    },
  };
  random.Reset(random.seed);
  return random;
}

/** 无状态加权抽取。unit01 缺省时用 0.5（保持纯函数，不偷用 Math.random）。 */
export function WeightedPick(list, weights, unit01) {
  if (!list || list.length === 0) return null;
  let total = 0;
  for (let i = 0; i < list.length; i += 1) total += Math.max(0, (weights && weights[i]) || 0);
  if (total <= 0) return list[0];
  let cursor = (unit01 === undefined ? 0.5 : Clamp01(unit01)) * total;
  for (let i = 0; i < list.length; i += 1) {
    cursor -= Math.max(0, (weights && weights[i]) || 0);
    if (cursor <= 0) return list[i];
  }
  return list[list.length - 1];
}

/** 圆盘内随机点（XZ）。random 为 CreateRandom 的产物。 */
export function RandomPointInDisc(random, radius, out) {
  const target = out || { x: 0, z: 0 };
  if (!random) { target.x = 0; target.z = 0; return target; }
  return random.PointInDisc(radius, target);
}

/* ================================================================== *
 * 二、噪声（确定性、无状态）
 * ================================================================== */

export function Hash1(x) {
  let h = Math.imul(Math.floor(x) ^ 0x27d4eb2d, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export function Hash2(x, y) {
  let h = Math.imul(Math.floor(x) ^ 0x9e3779b9, 0x85ebca6b);
  h = Math.imul(h ^ Math.floor(y), 0xc2b2ae35);
  h ^= h >>> 15;
  h = Math.imul(h, 0x27d4eb2d);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export function Hash3(x, y, z) {
  let h = Math.imul(Math.floor(x) ^ 0x9e3779b9, 0x85ebca6b);
  h = Math.imul(h ^ Math.floor(y), 0xc2b2ae35);
  h = Math.imul(h ^ Math.floor(z), 0x27d4eb2d);
  h ^= h >>> 15;
  return ((h ^ (h >>> 13)) >>> 0) / 4294967296;
}

/** value noise，返回 [-1,1]。 */
export function Noise2(x, y) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const n00 = Hash2(xi, yi);
  const n10 = Hash2(xi + 1, yi);
  const n01 = Hash2(xi, yi + 1);
  const n11 = Hash2(xi + 1, yi + 1);
  const nx0 = n00 + (n10 - n00) * u;
  const nx1 = n01 + (n11 - n01) * u;
  return (nx0 + (nx1 - nx0) * v) * 2 - 1;
}

/** 分形叠加噪声，返回约 [-1,1]。 */
export function Fbm2(x, y, octaves = 4, lacunarity = 2, gain = 0.5) {
  let amplitude = 1;
  let frequency = 1;
  let sum = 0;
  let norm = 0;
  const count = Math.max(1, Math.floor(octaves));
  for (let i = 0; i < count; i += 1) {
    sum += Noise2(x * frequency, y * frequency) * amplitude;
    norm += amplitude;
    amplitude *= gain;
    frequency *= lacunarity;
  }
  return norm > 0 ? sum / norm : 0;
}

/** 山脊噪声，返回 [0,1]，适合太行山那种硬折线山脊。 */
export function Ridge2(x, y, octaves = 4) {
  let amplitude = 0.5;
  let frequency = 1;
  let sum = 0;
  let norm = 0;
  const count = Math.max(1, Math.floor(octaves));
  for (let i = 0; i < count; i += 1) {
    const n = 1 - Math.abs(Noise2(x * frequency, y * frequency));
    sum += n * n * amplitude;
    norm += amplitude;
    amplitude *= 0.5;
    frequency *= 2;
  }
  return norm > 0 ? Clamp01(sum / norm) : 0;
}

/** Worley：到最近特征点的距离，返回 [0,1]。 */
export function Worley2(x, y) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  let best = 1e9;
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      const cx = xi + dx;
      const cy = yi + dy;
      const px = cx + Hash2(cx, cy);
      const py = cy + Hash2(cy * 31 + 7, cx * 17 + 3);
      const ex = px - x;
      const ey = py - y;
      const d2 = ex * ex + ey * ey;
      if (d2 < best) best = d2;
    }
  }
  return Clamp01(Math.sqrt(best));
}

/** 旋度噪声：无散度的二维流场，用来吹雪。 */
export function Curl2(x, y, out) {
  const step = 0.08;
  const dx = (Fbm2(x, y + step, 3) - Fbm2(x, y - step, 3)) / (2 * step);
  const dy = (Fbm2(x + step, y, 3) - Fbm2(x - step, y, 3)) / (2 * step);
  const target = out || { x: 0, y: 0 };
  target.x = dx;
  target.y = -dy;
  return target;
}

/* 契约外的友好别名（与 Noise2 / Fbm2 完全等价） */
export const ValueNoise2d = Noise2;
export const Fbm2d = Fbm2;

/* ================================================================== *
 * 三、标量
 * ================================================================== */

export function Clamp(value, min, max) {
  return value < min ? min : (value > max ? max : value);
}
export function Clamp01(value) {
  return value < 0 ? 0 : (value > 1 ? 1 : value);
}
export function Lerp(a, b, t) { return a + (b - a) * t; }
export function InvLerp(a, b, value) {
  if (Math.abs(b - a) < Epsilon) return 0;
  return (value - a) / (b - a);
}
export const InverseLerp = InvLerp;

export function Remap(value, inMin, inMax, outMin, outMax) {
  return Lerp(outMin, outMax, Clamp01(InvLerp(inMin, inMax, value)));
}
export function SmoothStep(edge0, edge1, x) {
  const t = Clamp01(InvLerp(edge0, edge1, x));
  return t * t * (3 - 2 * t);
}
export function SmootherStep(edge0, edge1, x) {
  const t = Clamp01(InvLerp(edge0, edge1, x));
  return t * t * t * (t * (t * 6 - 15) + 10);
}
export function MoveTowards(current, target, maxDelta) {
  const delta = target - current;
  if (Math.abs(delta) <= maxDelta) return target;
  return current + Math.sign(delta) * maxDelta;
}
/** 帧率无关的指数逼近。lambda 越大越快。 */
export function Damp(current, target, lambda, dt) {
  return Lerp(current, target, 1 - Math.exp(-Math.max(0, lambda) * Math.max(0, dt)));
}
/** Unity 风格 SmoothDamp。velocityRef 形如 { value: 0 }，会被就地更新。 */
export function SmoothDamp(current, target, velocityRef, smoothTime, dt, maxSpeed = Infinity) {
  const time = Math.max(0.0001, smoothTime);
  const omega = 2 / time;
  const x = omega * dt;
  const exp = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
  let change = current - target;
  const maxChange = maxSpeed * time;
  change = Clamp(change, -maxChange, maxChange);
  const goal = current - change;
  const velocity = velocityRef && typeof velocityRef.value === 'number' ? velocityRef.value : 0;
  const temp = (velocity + omega * change) * dt;
  let nextVelocity = (velocity - omega * temp) * exp;
  let output = goal + (change + temp) * exp;
  if ((target - current > 0) === (output > target)) {
    output = target;
    nextVelocity = (output - target) / dt;
  }
  if (velocityRef) velocityRef.value = nextVelocity;
  return output;
}
/** 上升与下降速率不同的逼近（警戒条、体力条这类东西天生不对称）。 */
export function Approach(current, target, riseRate, fallRate, dt) {
  const rate = target > current ? riseRate : fallRate;
  return MoveTowards(current, target, Math.max(0, rate) * Math.max(0, dt));
}

/* ================================================================== *
 * 四、角度
 * ================================================================== */

export function WrapAngle(radians) {
  let a = radians % Tau;
  if (a > Math.PI) a -= Tau;
  else if (a <= -Math.PI) a += Tau;
  return a;
}
/** from → to 的最短有向角差，落在 (-PI, PI]。 */
export function AngleDelta(from, to) { return WrapAngle(to - from); }
export const ShortestAngle = AngleDelta;

export function LerpAngle(from, to, t) { return WrapAngle(from + AngleDelta(from, to) * t); }
export function DampAngle(current, target, lambda, dt) {
  return WrapAngle(current + AngleDelta(current, target) * (1 - Math.exp(-Math.max(0, lambda) * Math.max(0, dt))));
}
export function MoveTowardsAngle(current, target, maxDelta) {
  const delta = AngleDelta(current, target);
  if (Math.abs(delta) <= maxDelta) return WrapAngle(target);
  return WrapAngle(current + Math.sign(delta) * maxDelta);
}

/* ================================================================== *
 * 五、缓动
 * ================================================================== */

export function EaseInQuad(t) { return t * t; }
export function EaseOutQuad(t) { return t * (2 - t); }
export function EaseInOutQuad(t) { return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t; }
export function EaseInCubic(t) { return t * t * t; }
export function EaseOutCubic(t) { const u = t - 1; return u * u * u + 1; }
export function EaseInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}
export function EaseOutBack(t) {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  const u = t - 1;
  return 1 + c3 * u * u * u + c1 * u * u;
}
export function EaseOutElastic(t) {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  const c4 = Tau / 3;
  return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1;
}
export function EaseOutBounce(t) {
  const n1 = 7.5625;
  const d1 = 2.75;
  let x = t;
  if (x < 1 / d1) return n1 * x * x;
  if (x < 2 / d1) { x -= 1.5 / d1; return n1 * x * x + 0.75; }
  if (x < 2.5 / d1) { x -= 2.25 / d1; return n1 * x * x + 0.9375; }
  x -= 2.625 / d1;
  return n1 * x * x + 0.984375;
}
export function PingPong(t, length) {
  if (length <= 0) return 0;
  const span = length * 2;
  const wrapped = t - Math.floor(t / span) * span;
  return wrapped <= length ? wrapped : span - wrapped;
}

/* ================================================================== *
 * 六、平面几何（XZ 平面，y 忽略）
 * ================================================================== */

export function Distance2(ax, az, bx, bz) {
  const dx = bx - ax;
  const dz = bz - az;
  return Math.sqrt(dx * dx + dz * dz);
}
export function DistanceSq2(ax, az, bx, bz) {
  const dx = bx - ax;
  const dz = bz - az;
  return dx * dx + dz * dz;
}
export function Direction2(fromX, fromZ, toX, toZ, out) {
  const target = out || { x: 0, z: 0 };
  const dx = toX - fromX;
  const dz = toZ - fromZ;
  const len = Math.sqrt(dx * dx + dz * dz);
  if (len < Epsilon) { target.x = 0; target.z = 0; return target; }
  target.x = dx / len;
  target.z = dz / len;
  return target;
}
export function Normalize2(x, z, out) {
  const target = out || { x: 0, z: 0 };
  const len = Math.sqrt(x * x + z * z);
  if (len < Epsilon) { target.x = 0; target.z = 0; return target; }
  target.x = x / len;
  target.z = z / len;
  return target;
}
export function Dot2(ax, az, bx, bz) { return ax * bx + az * bz; }
export function Cross2(ax, az, bx, bz) { return ax * bz - az * bx; }

export function PointInCone(fromX, fromZ, dirX, dirZ, toX, toZ, halfAngleRadians, range) {
  const dx = toX - fromX;
  const dz = toZ - fromZ;
  const distance = Math.sqrt(dx * dx + dz * dz);
  if (distance > range) return false;
  if (distance < Epsilon) return true;
  const dot = (dx / distance) * dirX + (dz / distance) * dirZ;
  return dot >= Math.cos(halfAngleRadians);
}

/** 视锥内的强度 [0,1]：角度越正中、距离越近越大；锥外返回 0。 */
export function ConeFalloff(fromX, fromZ, dirX, dirZ, toX, toZ, halfAngleRadians, range) {
  const dx = toX - fromX;
  const dz = toZ - fromZ;
  const distance = Math.sqrt(dx * dx + dz * dz);
  if (range <= 0 || distance > range) return 0;
  if (distance < Epsilon) return 1;
  const dot = (dx / distance) * dirX + (dz / distance) * dirZ;
  const cosLimit = Math.cos(halfAngleRadians);
  if (dot < cosLimit) return 0;
  const angular = cosLimit >= 1 ? 1 : Clamp01((dot - cosLimit) / (1 - cosLimit));
  const radial = 1 - distance / range;
  return Clamp01(Math.sqrt(angular) * (0.35 + 0.65 * radial));
}

export function ClosestPointOnSegment(ax, az, bx, bz, px, pz, out) {
  const target = out || { x: 0, z: 0 };
  const abx = bx - ax;
  const abz = bz - az;
  const lengthSq = abx * abx + abz * abz;
  if (lengthSq < Epsilon) { target.x = ax; target.z = az; return target; }
  const t = Clamp01(((px - ax) * abx + (pz - az) * abz) / lengthSq);
  target.x = ax + abx * t;
  target.z = az + abz * t;
  return target;
}

const ScratchSegmentPoint = { x: 0, z: 0 };

export function SegmentPointDistance(ax, az, bx, bz, px, pz) {
  ClosestPointOnSegment(ax, az, bx, bz, px, pz, ScratchSegmentPoint);
  return Distance2(ScratchSegmentPoint.x, ScratchSegmentPoint.z, px, pz);
}

export function SegmentCircleHit(ax, az, bx, bz, cx, cz, radius) {
  return SegmentPointDistance(ax, az, bx, bz, cx, cz) <= radius;
}

export function RotatePoint2(x, z, radians, out) {
  const target = out || { x: 0, z: 0 };
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const rx = x * cos - z * sin;
  const rz = x * sin + z * cos;
  target.x = rx;
  target.z = rz;
  return target;
}

/** 世界坐标 → 朝向角（three 的 yaw 约定：atan2(x, z)）。 */
export function YawFromDirection(dirX, dirZ) { return Math.atan2(dirX, dirZ); }
export function DirectionFromYaw(yaw, out) {
  const target = out || { x: 0, z: 0 };
  target.x = Math.sin(yaw);
  target.z = Math.cos(yaw);
  return target;
}

/* ================================================================== *
 * 七、表现辅助
 * ================================================================== */

/** 多频叠加的平滑抖动，[-1,1]。比 sin 自然，比随机稳定。 */
export function Wobble(time, seed = 0) {
  const offset = Hash1(seed) * 100;
  return (
    Math.sin((time + offset) * 1.7) * 0.5 +
    Math.sin((time + offset) * 2.9 + 1.3) * 0.3 +
    Math.sin((time + offset) * 5.3 + 2.7) * 0.2
  );
}

export function Shake2(time, seed = 0, out) {
  const target = out || { x: 0, y: 0 };
  target.x = Wobble(time, seed);
  target.y = Wobble(time + 37.13, seed + 101);
  return target;
}

/** 呼吸曲线：吸气快、呼气慢，比纯正弦更像人。 */
export function Breath(time, rate, amplitude) {
  const phase = (time * rate) % 1;
  const shaped = phase < 0.4
    ? SmoothStep(0, 1, phase / 0.4)
    : 1 - SmoothStep(0, 1, (phase - 0.4) / 0.6);
  return (shaped * 2 - 1) * amplitude;
}

/** 弹簧。半隐式欧拉 + 子步进，dt 抖动时不会炸。 */
export function CreateSpring(stiffness, damping) {
  return {
    value: 0,
    velocity: 0,
    target: 0,
    stiffness: stiffness,
    damping: damping,
    Update(dt) {
      const steps = Math.min(8, Math.max(1, Math.ceil(dt / 0.016)));
      const step = dt / steps;
      for (let i = 0; i < steps; i += 1) {
        const force = (this.target - this.value) * this.stiffness - this.velocity * this.damping;
        this.velocity += force * step;
        this.value += this.velocity * step;
      }
      return this.value;
    },
    Reset(value) {
      this.value = value || 0;
      this.target = value || 0;
      this.velocity = 0;
    },
  };
}

/**
 * 无对象版弹簧一步积分（后坐力、镜头推拉这类一次性用途）。
 * velocityRef 形如 { value: 0 }，会被就地更新；返回新的 value。
 */
export function SpringDamp(current, target, velocityRef, stiffness, damping, dt) {
  const steps = Math.min(8, Math.max(1, Math.ceil(dt / 0.016)));
  const step = dt / steps;
  let value = current;
  let velocity = velocityRef && typeof velocityRef.value === 'number' ? velocityRef.value : 0;
  for (let i = 0; i < steps; i += 1) {
    const force = (target - value) * stiffness - velocity * damping;
    velocity += force * step;
    value += velocity * step;
  }
  if (velocityRef) velocityRef.value = velocity;
  return value;
}
