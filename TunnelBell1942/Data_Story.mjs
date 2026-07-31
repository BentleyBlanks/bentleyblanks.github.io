// 《地道战 · 钟声》—— 全部叙事文本。
//
// 纯数据文件：不 import 任何东西，必须能在纯 Node 里跑。
// 表达纪律（照 AGENTS.md 第 4 节）：
//   · 每条 panel 的 text ≤ 24 个汉字，宁可空着也不要写满。
//   · icons 只用契约里那 20 个名字。
//   · mood:"narrate" 全作只用 1 次（上限 4）。
//   · text:"" 的纯图标 panel 是主力手段，不是省事。
//
// 主题由玩法承载，台词里一个字都不许提。

export const SAVE_KEY = "tunnelbell1942_v1";

/**
 * 漫画气泡。
 * id 命名与 Data_Levels.mjs 的 trigger.emit.panels 一一对应：
 *   a1_open / a1_p1..a1_p12 / a1_close
 *   a2_open / a2_p1..a2_p12 / a2_close
 *   a3_open / a3_p1..a3_p14 / a3_close
 * 全部写满，关卡层可以任取其一。
 */
export const PANELS = {
  // ═══════════════ 第 1 幕 · 钟声 ═══════════════
  // 高老忠全幕一句话不说。他的台词就是那口钟。

  a1_open: {
    speaker: "",
    text: "夜里三更，狗不叫了。",
    mood: "narrate",
    icons: ["village", "quiet"],
    portrait: null,
  },
  a1_p1: {
    speaker: "高老忠",
    text: "",
    mood: "silent",
    icons: ["quiet", "eye"],
    portrait: "laozhong",
  },
  a1_p2: {
    speaker: "山田",
    text: "别惊着他们。围上。",
    mood: "talk",
    icons: ["village", "quiet"],
    portrait: "yamada",
  },
  a1_p3: {
    speaker: "高老忠",
    text: "",
    mood: "think",
    icons: ["bell", "up"],
    portrait: "laozhong",
  },
  a1_p4: {
    speaker: "王大娘",
    text: "老忠叔，咋了？",
    mood: "talk",
    icons: ["lantern", "eye"],
    portrait: "villager",
  },
  a1_p5: {
    speaker: "高老忠",
    text: "",
    mood: "silent",
    icons: ["quiet", "down"],
    portrait: "laozhong",
  },
  a1_p6: {
    speaker: "高老忠",
    text: "",
    mood: "silent",
    icons: ["boot", "quiet"],
    portrait: "laozhong",
  },
  a1_p7: {
    speaker: "山田",
    text: "这家的灶还热着。",
    mood: "talk",
    icons: ["fire", "eye"],
    portrait: "yamada",
  },
  a1_p8: {
    speaker: "秋兰",
    text: "栓柱，闭上眼。",
    mood: "talk",
    icons: ["child", "quiet"],
    portrait: "villager",
  },
  a1_p9: {
    speaker: "高老忠",
    text: "",
    mood: "think",
    icons: ["clock", "bell"],
    portrait: "laozhong",
  },
  a1_p10: {
    speaker: "山田",
    text: "挨家搜。有地窖。",
    mood: "talk",
    icons: ["tunnel", "rifle"],
    portrait: "yamada",
  },
  a1_p11: {
    speaker: "高老忠",
    text: "",
    mood: "shout",
    icons: ["bell", "village"],
    portrait: "laozhong",
  },
  a1_p12: {
    speaker: "林霞",
    text: "下地道！跟紧了！",
    mood: "shout",
    icons: ["down", "tunnel"],
    portrait: "linxia",
  },
  // 全作最重的一条。钟还在晃，树底下没人。不给褒奖，不给结论。
  a1_close: {
    speaker: "",
    text: "",
    mood: "silent",
    icons: ["bell"],
    portrait: null,
  },

  // ═══════════════ 第 2 幕 · 翻口 ═══════════════
  // 憋闷 + 相互支撑。高传宝一直想上去打，林霞一直把他按住。

  a2_open: {
    speaker: "林霞",
    text: "别等了。走。",
    mood: "talk",
    icons: ["up", "tunnel"],
    portrait: "linxia",
  },
  a2_p1: {
    speaker: "林霞",
    text: "这段矮，猫着腰。",
    mood: "talk",
    icons: ["down", "tunnel"],
    portrait: "linxia",
  },
  a2_p2: {
    speaker: "高传宝",
    text: "栓柱他娘呢？",
    mood: "talk",
    icons: ["child", "eye"],
    portrait: "chuanbao",
  },
  a2_p3: {
    speaker: "王大娘",
    text: "在后头，扶着四爷。",
    mood: "talk",
    icons: ["lantern", "village"],
    portrait: "villager",
  },
  a2_p4: {
    speaker: "四爷",
    text: "粮埋西窖了。你们先走。",
    mood: "talk",
    icons: ["grain", "down"],
    portrait: "villager",
  },
  a2_p5: {
    speaker: "高传宝",
    text: "四爷，搭俺肩上。",
    mood: "talk",
    icons: ["up"],
    portrait: "chuanbao",
  },
  // 孩子怕黑。不写形容词，只给图标。
  a2_p6: {
    speaker: "栓柱",
    text: "",
    mood: "silent",
    icons: ["child", "quiet"],
    portrait: "villager",
  },
  // 马灯递过去。全幕最暖的一下，只用三个字。
  a2_p7: {
    speaker: "王大娘",
    text: "娃，你拿着。",
    mood: "talk",
    icons: ["lantern", "child"],
    portrait: "villager",
  },
  a2_p8: {
    speaker: "林霞",
    text: "翻口。看着是死头，其实通。",
    mood: "talk",
    icons: ["tunnel", "up"],
    portrait: "linxia",
  },
  a2_p9: {
    speaker: "林霞",
    text: "通气孔在灶膛后头。",
    mood: "talk",
    icons: ["fire", "up"],
    portrait: "linxia",
  },
  a2_p10: {
    speaker: "山田",
    text: "这块地的土是新的。",
    mood: "talk",
    icons: ["dig", "eye"],
    portrait: "yamada",
  },
  // 想出去打。为第 3 幕的转变埋线。
  a2_p11: {
    speaker: "高传宝",
    text: "上头就仨。俺摸上去。",
    mood: "talk",
    icons: ["up", "rifle"],
    portrait: "chuanbao",
  },
  a2_p12: {
    speaker: "林霞",
    text: "人还没齐。",
    mood: "talk",
    icons: ["village", "quiet"],
    portrait: "linxia",
  },
  // 暗室里点人头。这句话第 3 幕结尾要原样再说一遍。
  a2_close: {
    speaker: "高传宝",
    text: "六个。都在。",
    mood: "talk",
    icons: ["lantern", "village"],
    portrait: "chuanbao",
  },

  // ═══════════════ 第 3 幕 · 转移 ═══════════════
  // 本能是反击；真正救人的是封卡口、引水、灭灯、带人走。

  a3_open: {
    speaker: "山田",
    text: "放烟。三个口一起放。",
    mood: "talk",
    icons: ["gas", "tunnel"],
    portrait: "yamada",
  },
  a3_p1: {
    speaker: "林霞",
    text: "捂住嘴，别喊。",
    mood: "talk",
    icons: ["gas", "quiet"],
    portrait: "linxia",
  },
  a3_p2: {
    speaker: "高传宝",
    text: "封卡口！",
    mood: "shout",
    icons: ["tunnel", "down"],
    portrait: "chuanbao",
  },
  a3_p3: {
    speaker: "四爷",
    text: "俺来堵。你带娃走。",
    mood: "talk",
    icons: ["child", "run"],
    portrait: "villager",
  },
  a3_p4: {
    speaker: "高传宝",
    text: "一块儿走。",
    mood: "talk",
    icons: ["village"],
    portrait: "chuanbao",
  },
  a3_p5: {
    speaker: "山田",
    text: "烟往哪走，道就往哪走。",
    mood: "talk",
    icons: ["gas", "tunnel"],
    portrait: "yamada",
  },
  a3_p6: {
    speaker: "林霞",
    text: "水道的闸在井台上。",
    mood: "talk",
    icons: ["water", "up"],
    portrait: "linxia",
  },
  a3_p7: {
    speaker: "高传宝",
    text: "",
    mood: "silent",
    icons: ["boot", "eye"],
    portrait: "chuanbao",
  },
  a3_p8: {
    speaker: "",
    text: "",
    mood: "silent",
    icons: ["water", "down"],
    portrait: null,
  },
  // 枪眼里看得见后背。全作的转折点，一个字都不说。
  a3_p9: {
    speaker: "高传宝",
    text: "",
    mood: "think",
    icons: ["rifle", "eye"],
    portrait: "chuanbao",
  },
  // 他没开枪。他把灯灭了。
  a3_p10: {
    speaker: "高传宝",
    text: "灭灯。跟紧俺。",
    mood: "talk",
    icons: ["lantern", "run"],
    portrait: "chuanbao",
  },
  a3_p11: {
    speaker: "栓柱",
    text: "俺拽着你褂子。",
    mood: "talk",
    icons: ["child", "quiet"],
    portrait: "villager",
  },
  a3_p12: {
    speaker: "山田",
    text: "水灌进来了。退。",
    mood: "talk",
    icons: ["water", "boot"],
    portrait: "yamada",
  },
  a3_p13: {
    speaker: "林霞",
    text: "黑风口。上头是苇子地。",
    mood: "talk",
    icons: ["up", "village"],
    portrait: "linxia",
  },
  // 最后一个被拉上去。天在亮。
  a3_p14: {
    speaker: "",
    text: "",
    mood: "silent",
    icons: ["up", "child"],
    portrait: null,
  },
  // 落点在"人还在"，不在"赢了"。跟 a2_close 一字不差。
  a3_close: {
    speaker: "高传宝",
    text: "六个。都在。",
    mood: "talk",
    icons: ["village", "child"],
    portrait: "chuanbao",
  },
};

/** 三幕。epilogue 是幕间黑屏上的一行字，三条连起来是一条线：钟 → 数人头 → 还是六个。 */
export const CHAPTERS = [
  {
    id: "act1",
    index: 1,
    title: "钟声",
    subtitle: "一九四二年 · 冀中 · 高家庄",
    opening: ["a1_open"],
    closing: ["a1_close"],
    epilogue: "那口钟响了三下。人没下来。",
  },
  {
    id: "act2",
    index: 2,
    title: "翻口",
    subtitle: "同一夜 · 高家庄地下",
    opening: ["a2_open"],
    closing: ["a2_close"],
    epilogue: "地底下数人头。少一个都不走。",
  },
  {
    id: "act3",
    index: 3,
    title: "转移",
    subtitle: "天亮以前 · 黑风口",
    opening: ["a3_open"],
    closing: ["a3_close"],
    epilogue: "出了黑风口，还是六个。天亮了。",
  },
];

/** 史料注解。玩家在关卡里"读"到，不影响玩法。写实、克制、只说这东西是干什么用的。 */
export const CODEX = [
  {
    id: "codex_santong",
    title: "地道三通",
    body:
      "地道要三通：高低相通、内外相通、街道相通。一条道只有一个口就是死路；" +
      "堵了一处，人还能从别处走。冀中平原无山可依，通路本身就是依托。",
  },
  {
    id: "codex_fanko",
    title: "翻口",
    body:
      "翻口是地道里特意做出的假死头。看着已经到头，其实侧壁或顶上另留一口，" +
      "翻过去接着走。敌人顺道追到这里，只见一堵土墙。",
  },
  {
    id: "codex_qiangyan",
    title: "枪眼与地堡",
    body:
      "枪眼多开在墙根、碾盘、井壁和灶台上，孔小、位低、朝外一线。" +
      "地堡设在街口高处，下面与地道相连，用完能退回地下，不在原地久留。",
  },
  {
    id: "codex_tonghuo",
    title: "通气孔与防毒",
    body:
      "通气孔从地道通到地面，出口藏在灶膛、烟囱、枯井或坟头里。" +
      "敌人放毒烟时，先用湿布捂口鼻，再拿木塞和土袋把孔封死，另开一处出气。",
  },
  {
    id: "codex_shuidao",
    title: "水道与灌水反制",
    body:
      "地道多与水井、水沟相接。敌人往洞里灌水，就把水引进旧井、枯窖或村外水沟，" +
      "水存不住。自家引水也能压住毒烟。",
  },
  {
    id: "codex_zhuanyi",
    title: "坚壁清野与转移",
    body:
      "报警之后先藏东西再藏人：粮食入窖、牲口牵远、锅灶抹灰。" +
      "人分批下地道，老人孩子先走，最后一个下去的负责封口。",
  },
];
