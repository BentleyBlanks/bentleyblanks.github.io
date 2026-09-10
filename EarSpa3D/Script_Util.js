// 全项目共用的小工具：随机数、数学、时间。
//
// 为什么单独一份：契约要求「同一场耳的耵聍分布可复现」，那就必须只有一个
// 随机数实现——各模块自己写一份 Mulberry32 的话，种子语义会在某次改动后
// 悄悄分叉，回归比对就再也对不上了。
//
// 顶层零副作用，纯函数。单位一律 mm / 秒 / 弧度。

/** 32 位整数哈希 → [0,1)。用于把 (x, y, z) 这种坐标直接变成稳定噪声。 */
export function Hash01(x, y = 0, z = 0) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(z | 0, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** 种子随机数（mulberry32）。返回 [0,1) 的函数，另挂 .range/.int/.pick/.sign 等便利方法。 */
export function MakeRng(seed = 1) {
  let a = (seed >>> 0) || 1;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  next.range = (lo, hi) => lo + (hi - lo) * next();
  next.int = (lo, hi) => Math.floor(lo + (hi - lo + 1) * next());
  next.sign = () => (next() < 0.5 ? -1 : 1);
  next.pick = (list) => list[Math.min(list.length - 1, Math.floor(next() * list.length))];
  /** 中心偏置：把均匀分布往中间压，用来做「多数耵聍不大不小」这种自然分布 */
  next.bell = (lo, hi, power = 2) => {
    const t = (next() + next() + next()) / 3;
    return lo + (hi - lo) * Math.pow(t * 2 > 1 ? 1 - (1 - t) * 2 : t * 2, 1 / power);
  };
  /** 洗牌（Fisher-Yates），不修改入参 */
  next.shuffle = (list) => {
    const out = list.slice();
    for (let i = out.length - 1; i > 0; i -= 1) {
      const j = Math.floor(next() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  };
  return next;
}

/** 平滑阻尼：与帧率无关的指数趋近，second = 追上 63% 所需秒数 */
export function Damp(current, target, second, dt) {
  if (second <= 0) return target;
  return target + (current - target) * Math.exp(-dt / second);
}

export function Clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

export function Lerp(a, b, t) {
  return a + (b - a) * t;
}

/** 把 v 从 [a0,a1] 映射到 [b0,b1] 并夹紧 */
export function Remap(v, a0, a1, b0, b1, clamp = true) {
  const t = (v - a0) / (a1 - a0 || 1);
  const out = b0 + (b1 - b0) * t;
  return clamp ? Clamp(out, Math.min(b0, b1), Math.max(b0, b1)) : out;
}

/** 0→1→0 的钟形，做各种「脉冲式」反馈 */
export function Bell(t) {
  const x = Clamp(t, 0, 1);
  return Math.sin(x * Math.PI);
}

export function Smoothstep(edge0, edge1, x) {
  const t = Clamp((x - edge0) / (edge1 - edge0 || 1), 0, 1);
  return t * t * (3 - 2 * t);
}

/** 帧率无关的一阶低通（对速度、压力这类读数做去抖） */
export function Smooth(prev, next, halfLifeS, dt) {
  const k = 1 - Math.pow(0.5, dt / Math.max(1e-4, halfLifeS));
  return prev + (next - prev) * k;
}

/** 环形量的最短角差（角度在 [0,2π) 上循环，直接相减会在 0/2π 接缝处跳一下） */
export function AngleDelta(from, to) {
  let d = (to - from) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export const TAU = Math.PI * 2;
