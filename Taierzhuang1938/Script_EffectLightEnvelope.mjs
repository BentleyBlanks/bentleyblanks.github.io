// 特效光的包络（纯函数，零依赖）：火在烧的抖动、爆炸光的白热峰与余辉、枪口闪光的衰减。
//
// 游戏的灯光装置（Script_Light）与独立特效预览窗口的预览灯都按这里算亮度，
// 这样「火光怎么抖、爆炸光多久灭」只有一份定义，预览与正片不会各写一套慢慢走样。

function Clamp01(value) { return Math.max(0, Math.min(1, value)); }

/**
 * 火焰闪烁系数：两个不同频率的正弦叠一点噪声（单频率会看出规律的「呼吸」），
 * 下限 0.28。`elapsed` 按秒、`seed` 是每盏火自己的相位。
 */
export function FireFlicker(elapsed, seed) {
  const t = elapsed * 1.0 + seed;
  const flicker = 0.72
    + 0.18 * Math.sin(t * 7.3)
    + 0.10 * Math.sin(t * 17.9 + 1.7)
    + 0.08 * Math.sin(t * 31.1 + 3.1);
  return Math.max(0.28, flicker);
}

/** 聚光（探照灯 / 车灯）开了抖动时的系数，下限 0.3。 */
export function SpotFlicker(elapsed, seed) {
  const t = elapsed * 1.0 + seed;
  const flicker = 0.78 + 0.14 * Math.sin(t * 6.1) + 0.08 * Math.sin(t * 15.3 + 2.2);
  return Math.max(0.3, flicker);
}

/**
 * 爆炸光包络：极短的白热峰 + 稍长的火球余辉，两项都按秒算（30/60/120 fps 下同一时刻同亮度）。
 * @returns {{done:boolean, intensity:number, radius:number, warm:number}}
 *   intensity / radius 是相对基准值的倍率；warm 0→1 = 白热核色 → 火球色。
 */
export function ExplosionEnvelope(age, duration) {
  const t = Clamp01(age / duration);
  if (t >= 1) return { done: true, intensity: 0, radius: 1, warm: 1 };
  const flash = 0.62 * Math.exp(-8 * t);
  const fire = 0.38 * (1 - t) * (1 - t);
  return {
    done: false,
    intensity: flash + fire,
    radius: 0.55 + 0.45 * Clamp01(t / 0.22),
    warm: 1 - Math.exp(-12 * t),
  };
}

/** 枪口闪光：按当前年龄给亮度（开枪那一帧满亮度），二次衰减到 0。 */
export function MuzzleEnvelope(age, duration) {
  if (age >= duration) return 0;
  const t = Clamp01(age / duration);
  return (1 - t) * (1 - t);
}
