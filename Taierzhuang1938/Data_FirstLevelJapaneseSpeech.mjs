// 第一关 01–02 的日语行：**只给 TTS 和强制对齐用**。
//
// 为什么单独一个模块：Font/Script_FontChars.mjs 会把
// Data_FirstLevelMissionDialogue.mjs 整棵导出的字符串都收进界面字表，
// 假名进去就得连打包字体一起带（屏幕上又永远不显示假名）。
// 这个模块**不登记进 UI_MODULES**，所以假名不会污染字表。
//
// 口径（契约 §5；2026-09-23 契约 §5.2）：
//   · kana   送 SeedAudio 的写法。汉字会被当中文念，所以一律纯假名。
//   · kanji  稿面写法，只作注释与验收比对（whisper 转写的字错率对它算），不进任何提示词。
//   · 屏幕字幕是稿里「中文：」那一行，写在台词表的 line.text 上。
// 键：09.23 逐句格式用逐句 id「<Scene>.<NN>」（09.21 旧整段 cue 已随 Opening 包 2026-09-24 下线）。
const J = (kana, kanji) => Object.freeze({ kana, kanji });
export const JAPANESE_SPEECH = Object.freeze({
  // —— 2026-09-23 新稿，18 句
  "BunkerSearch.01": J("まえへ！いそげ！", "前へ！急げ！"),
  "BunkerSearch.02": J("とまるな！", "止まるな！"),
  "CaptiveDragged.02": J("たて！", "立て！"),
  "CaptiveDragged.04": J("みぎだ！うて！", "右だ！撃て！"),
  "CaptiveInterrogation.01": J("ぶたいは、どこへひいた！きけ！", "部隊はどこへ退いた！聞け！"),
  "CaptiveInterrogation.02": J("はい！", "はい！"),
  "CaptiveInterrogation.06": J("このしなやろう！はやくいえ！", "この支那野郎！早く言え！"),
  "CaptiveInterrogation.08": J("なんといった！", "何と言った！"),
  "CaptiveInterrogation.09": J("なにもはなしません！あくたいばかりです！", "何も話しません！悪態ばかりです！"),
  "CaptiveTaunt.01": J("どうした、しなやろう！", "どうした、支那野郎！"),
  "CaptiveTaunt.02": J("そのくちで、まだののしってみろ！", "その口で、まだ罵ってみろ！"),
  "CaptiveTaunt.03": J("ばかやろう。", "馬鹿野郎。"),
  "CaptiveTaunt.04": J("まえへ！いそげ！", "前へ！急げ！"),
  "ShunziFound.01": J("まだいたか、このしなやろう。", "まだいたか、この支那野郎。"),
  "RescueInterrogation.01": J("こいつにもきけ！", "こいつにも聞け！"),
  "RescueInterrogation.02": J("はい！", "はい！"),
  "RescueInterrogation.05": J("はやくしろ！", "早くしろ！"),
  "RescueFlee.01": J("てきだ！", "敵だ！"),
});
