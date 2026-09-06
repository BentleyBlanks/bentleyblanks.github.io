// Data_Text_Story.mjs — Script_Story / Script_Cutscene 的系统字幕与叙事层固定文案。
// 纯数据，不 import three。键前缀 `story.`，由 Data_Locale_zhCN.mjs 拼表；口径见 docs/Data_TextAndTuning.md。
// 占位符写 {name}，代码侧 T("story.xxx", { name })。同一句话只登记一次，多处复用同一键。
//
// **这张表里没有一句台词。** 章节 beats、过场分镜、卡片、结算行都是考据过的原稿，
// 本体留在 Data_Mission* / Data_Cutscene* 里，显示时经 `Localize(id, 原稿)` 换译文
//（id 口径在 Script_TextIds.mjs，翻译清单由 Script_TextGather.mjs 导出）。
// 这里只收「不属于任何一场戏」的那几句：Esc 提示、说话人的排版、tier 标签。
export const TEXT = Object.freeze({
  // 过场右下角的跳过提示。跳过后字幕仍以卡片补出 —— 提示语不许暗示"跳过=丢信息"。
  "story.cutscene.skipHint": "ESC 跳过",
  // 台词行的说话人前缀。冒号、括号、语序在别的语言里都不一样，所以整句进表，
  // 调用点只把名字交进来（名字本身走 Localize 的 cast.<who>.short）。
  "story.cutscene.speaker": "{who}：",
  "story.cutscene.speakerOff": "{who}（画外）：",
  // 史料可信度标签。tier 的值来自内容数据（信史 / 主流 / 推演 / 虚构），
  // 这里只管把它括起来 —— 见 Script_Cutscene.TierTag 上那条「tier 值本身还翻不了」的账。
  "story.cutscene.tierTag": "【{tier}】",
});

/**
 * 这张表覆盖的代码文件：闸门（Script_TextTest）从此不许它们再出现玩家可见的中文字面量。
 *
 * Script_Audio 与 Script_Checkpoint 里本来就没有玩家文本（Audio 剩下的九条中文是
 * 只给编辑器音频面板看的 cue 标签，逐行登记了 @text-ok），登记进来是**上锁**：
 * 以后谁往里写一句中文提示，闸门当场红。
 */
export const GATED_MODULES = Object.freeze([
  "Script_Story.mjs",
  "Script_Cutscene.mjs",
  "Script_Audio.mjs",
  "Script_Checkpoint.mjs",
]);

/** 没有运行时拼键：内容层走 Localize 的 `content.*`，那一支不由静态引用检查覆盖。 */
export const DYNAMIC_PREFIXES = Object.freeze([]);
