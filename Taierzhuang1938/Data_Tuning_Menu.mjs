// Data_Tuning_Menu.mjs — 主菜单相机导演的手感数。纯数据，不 import three。
//
// 机位表本身（哪一关用哪几条推轨、停多久、黑场多长、摆几个守军）在 Data_Menu.mjs：
// 那是**编排**，一关一组。这里只放那台导演机自己的两件事 —— 手持漂移的幅度分配，
// 和机位不许穿地的那点余量。口径见 docs/Data_TextAndTuning.md §4。

/**
 * 手持漂移。整体幅度由 Data_Menu.MENU_SCENE.drift 给（0 = 完全稳的定机位），
 * 这里分配到三个轴上：**摇头比点头明显、滚转最轻**，因为真人端着机器时
 * 手腕先塌、脖子后转，肩不动。
 *
 * **不许 Math.random** —— 走 ValueNoise2，同一时刻永远同一个值，出图才可复现
 *（与过场那条规矩同源）。u/v 是各轴在噪声场里取的两条互不相关的采样线，
 * 换这两个数只换"晃的花样"，不换幅度。
 */
export const DRIFT = Object.freeze({
  /** 噪声推进速度（每秒走多少格）。越大晃得越碎。 */
  rateHz: 0.34,
  /** 噪声种子。1938 —— 与全案的可复现种子同一个。 */
  seed: 1938,
  pitch: Object.freeze({ u: 1.0, v: 3.1, gain: 0.012 }),
  yaw: Object.freeze({ u: 0.83, v: 11.7, gain: 0.014 }),
  roll: Object.freeze({ u: 0.61, v: 23.5, gain: 0.010 }),
});

export const CAMERA = Object.freeze({
  /**
   * 机位离地面至少留这么高（米）。地形是程序化的，坐标表里写死的高度有可能被
   * 土坎顶掉；1.6 m 就是一个人站着的眼高 —— 低于它，画面会从土里往外看。
   */
  groundClearanceM: 1.6,
});
