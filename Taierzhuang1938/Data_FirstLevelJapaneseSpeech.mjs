// 第一关 01 掩蔽部两段里的日语行：**只给 TTS 和强制对齐用**。
//
// 为什么单独一个模块：Font/Script_FontChars.mjs 会把
// Data_FirstLevelMissionDialogue.mjs 整棵导出的字符串都收进界面字表，
// 假名进去就得连打包字体一起带（屏幕上又永远不显示假名）。
// 这个模块**不登记进 UI_MODULES**，所以假名不会污染字表。
//
// 口径（契约 §5）：
//   · kana   送 SeedAudio 的写法。汉字会被当中文念，所以一律纯假名。
//   · kanji  稿面写法，只作注释与验收比对，不进任何提示词。
//   · 屏幕字幕是 Notion 括号里的中文译文，写在台词表的 line.text 上。
// 键是「cue id:行下标」。
export const JAPANESE_SPEECH = Object.freeze({
  "BunkerSearch:0": Object.freeze({kana:"まえへ！いそげ！",kanji:"前へ！急げ！"}),
  "BunkerSearch:1": Object.freeze({kana:"とまるな！",kanji:"止まるな！"}),
  "BunkerKilling:1": Object.freeze({kana:"うごくな、ばかやろう！",kanji:"動くな、馬鹿野郎！"}),
  "ShunziCurse:0": Object.freeze({kana:"でろ！このやろう！",kanji:"出ろ！この野郎！"}),
});
