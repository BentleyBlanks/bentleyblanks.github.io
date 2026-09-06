// Data_Tuning_Cutscene.mjs — 过场演出的节奏数值。纯数据，不 import 任何东西。
// 口径见 docs/Data_TextAndTuning.md §4。
//
// **这里只收「分镜数据没写时用多少」那几个数。** 三类东西故意不搬进来：
//   · `CutsceneDirector.LIFE`（说话 / 转头的旋钮）留在类身上 —— Script_CutsceneControlTest
//     用 new Function 把 `export class CutsceneDirector` 那一段源码单独切出来跑，
//     模块作用域里的东西在那个 eval 里一个都看不见。这条账写在 Script_Cutscene 的类顶部，
//     搬走它等于把那个测试打成 ReferenceError。
//   · 黑边比例 BAR_RATIO = 0.12：设计书给死的版式，不是可调手感。
//   · 每一场自己的 seconds / focalMm / 关键帧时间：那是**分镜数据**，在 Data_Cutscene* 里。

/** 分镜没写 `seconds` 时，字幕与台词各停多久（秒）。有语音时取「它与语音时长的长者」。 */
export const TEXT_HOLD = Object.freeze({
  subtitleS: 3.0,
  lineS: 3.0,
});

/**
 * 补出卡片（跳过卡 / 尾声卡 / 结算卡）读秒：一行大约 perLineS，另加 baseS 余量。
 * 任意键可以提前翻过，所以这是「不按键时至少能读完」的下限，不是节奏设计。
 */
export const CARD = Object.freeze({
  baseS: 2.0,
  perLineS: 1.6,
});

/**
 * headLook 的鼠标灵敏度基准（弧度/像素）。每一场再乘自己的
 * `headLook.sensitivityScale`（分镜数据里那一档，车厢是 0.8）。
 */
export const LOOK = Object.freeze({
  radPerPixel: 0.002,
});
