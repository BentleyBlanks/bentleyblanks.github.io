// 昼夜（2026-08-09 用户："24h切换现在太生硬，我需要你做的更自然一些"）。
//
// 生硬在两处：① 光照档写在 beat 的 timeOfDay 上，**进拍即换**，整座村子当帧
// 按新调色板重烘一遍——天、地、草、房子一起跳；② 全场只有压暗罩是渐变的，
// 而它渐变的目标已经是新档了，于是先跳色、再慢慢压暗，两件事还不同步。
//
// 现在光照是**一条连续的曲线**：
//   · 环境色罩（浓度 + 颜色）从旧档平滑推到新档；白天奔夜里途经**黄昏**那一档
//     暖橙，夜里奔白天途经**拂晓**——日头落下去是有过程的；
//   · 整村重烘**推迟到过渡最暗的那一刻**（`LIGHT_DIP` 那个正弦鼓包的顶点）：
//     那一帧本来就压着一层厚罩子，调色板在这时换过去看不出接缝——
//     电影换镜头也是趁黑切。
//
// 这一套是**纯数据 + 纯函数**，故意不放在 Script_World 里：渲染层的闭包在
// node 里跑不起来，判据就没法进冒烟测试（"过渡到底连不连续"正是要盯的东西）。

/** 每一档光的环境：dark = 压暗罩的浓度，tint = 罩子的颜色 */
export const LIGHT_MOOD = {
  day: { dark: 0.00, tint: 0x000000 },
  dawn: { dark: 0.06, tint: 0x3b3654 },     // 拂晓：天还青着，冷紫
  dusk: { dark: 0.17, tint: 0x4d2f16 },     // 黄昏：日头贴着地平线，暖橙
  night: { dark: 0.28, tint: 0x111c36 },    // 夜：深蓝
  tunnel: { dark: 0.42, tint: 0x1a140c },   // 地道：土黑
  dark: { dark: 0.52, tint: 0x0a0806 },     // 熄了灯的地道
};

/**
 * 一天的次序，**是个环**：拂晓→白天→黄昏→夜→（第二天）拂晓。
 * 地道/熄灯那两档不在这条线上——它们是场景不是时刻。
 */
export const DAY_ORDER = ["dawn", "day", "dusk", "night"];

export const LIGHT_FADE = 2.6;   // 一次换挡走几秒
export const LIGHT_DIP = 0.20;   // 换挡途中额外压暗多少（重烘的接缝藏在这儿）

/**
 * 两档之间怎么走。**时间只往前走**，所以路径要顺着那个环数，不是按下标远近
 * 算距离——第一版就栽在这儿：night→day 被算成"往回退两格"，插出来的中间档
 * 是黄昏，等于太阳从西边升起来。
 *
 * 插的那一档就是**紧挨在目标前面**的那个时刻：奔夜里先经黄昏，奔白天先经
 * 拂晓，奔拂晓先过夜（"一夜过去了"）。只插一档——两秒半的过渡里塞满一整天
 * 会闪一次大亮。本来就挨着的，直接过。
 */
export function LightPath(from, to) {
  if (from === to) return [from, to];
  const a = DAY_ORDER.indexOf(from), b = DAY_ORDER.indexOf(to);
  if (a < 0 || b < 0) return [from, to];      // 地道/熄灯：不是时刻，直接过
  const before = DAY_ORDER[(b - 1 + DAY_ORDER.length) % DAY_ORDER.length];
  return before === from ? [from, to] : [from, before, to];
}

function MixHex(c0, c1, k) {
  const r = Math.round(((c0 >> 16) & 255) + (((c1 >> 16) & 255) - ((c0 >> 16) & 255)) * k);
  const g = Math.round(((c0 >> 8) & 255) + (((c1 >> 8) & 255) - ((c0 >> 8) & 255)) * k);
  const b = Math.round((c0 & 255) + ((c1 & 255) - (c0 & 255)) * k);
  return (r << 16) | (g << 8) | b;
}

/**
 * 过渡进度 t（0→1）处的环境。t 落在插出来的那条路径上分段插值，
 * 所以 day→night 的中途一定是暖的（黄昏），不是"直接把白天调暗"。
 * @returns {{dark:number, tint:number}}
 */
export function MoodAt(from, to, t) {
  const path = LightPath(from, to);
  const seg = (path.length - 1) * Math.max(0, Math.min(1, t));
  const i = Math.min(path.length - 2, Math.floor(seg));
  const k = seg - i;
  const m0 = LIGHT_MOOD[path[i]] || LIGHT_MOOD.day;
  const m1 = LIGHT_MOOD[path[i + 1]] || LIGHT_MOOD.day;
  return { dark: m0.dark + (m1.dark - m0.dark) * k, tint: MixHex(m0.tint, m1.tint, k) };
}

/** 换挡途中那个正弦鼓包：顶点就是重烘该落的那一帧 */
export function DipAt(t) {
  return t >= 1 ? 0 : Math.sin(Math.PI * Math.max(0, t)) * LIGHT_DIP;
}
