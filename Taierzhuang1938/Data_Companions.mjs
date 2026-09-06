// Data_Companions.mjs — 具名同伴名册与跟随节奏。
//
// **纯数据**：不 import three、不 import 规则代码、不含函数。
// 导演在 `Script_Companion.mjs`（一张表 + 一台状态机）；玩家可见的名字存**文本键**，
// 句子在 Data_Text_Gameplay.mjs 的 `gameplay.cast.*`。

/**
 * 同伴名册档案。**key 就是契约 §10.2 的 CAST id**，beats 的 who 一律用这些 id。
 *
 * labelKey   场上这个人的名字（文本键）。
 * combatant  true = 「该章说过话就自动在场」的战斗员（默认名册从 beats 推导时只收这些）；
 *            false = 得由章节显式点名才在场（军医、担架员、参谋、师长）。
 * absent     永不由这一层生成，附 reason（**开发者诊断文本**，只进 director.log，
 *            玩家看不见 —— 所以它不走文本表）。改成 true/false 之前先读那条理由。
 * mode       "follow"（跟着玩家）或 "hold"（在指定 zone 待命）。
 * weapon     Data_Weapons 的 id。川军这一班发的是兵站那批汉阳造（§1 阶段二）。
 * slot       跟随时的固定站位序号；决定横向偏移，避免一个班排成一条线（Conga Line）。
 */
export const COMPANION_CAST = Object.freeze({
  // 班长。四关夜战救顺子腹部中弹牺牲 —— 他倒下那一拍要调 SetAbsent('luo')。
  // 现在五关他不在名册里只是因为五关没有他的台词，那是巧合不是保证。
  luo: Object.freeze({ labelKey: "gameplay.cast.luo", combatant: true, mode: "follow", weapon: "HanYang", slot: 0 }),
  yaowa: Object.freeze({ labelKey: "gameplay.cast.yaowa", combatant: true, mode: "follow", weapon: "HanYang", slot: 1 }),
  heyoutian: Object.freeze({ labelKey: "gameplay.cast.heyoutian", combatant: true, mode: "follow", weapon: "HanYang", slot: 2 }),
  liuwencai: Object.freeze({ labelKey: "gameplay.cast.liuwencai", combatant: true, mode: "follow", weapon: "HanYang", slot: 3 }),
  zhaodegui: Object.freeze({ labelKey: "gameplay.cast.zhaodegui", combatant: true, mode: "follow", weapon: "HanYang", slot: 4 }),
  // 通信兵。护线时要 Detach（他蹲下查断点，不跟着走）。
  xiaoqin: Object.freeze({ labelKey: "gameplay.cast.xiaoqin", combatant: true, mode: "follow", weapon: "HanYang", slot: 5 }),
  // 负伤排长。五关下军令，钉在街口不跟人跑。
  paizhang: Object.freeze({ labelKey: "gameplay.cast.paizhang", combatant: true, mode: "hold", weapon: "HanYang", slot: 6 }),
  // 第 124 师伤兵。五关视角①的机枪副射手。
  s124: Object.freeze({ labelKey: "gameplay.cast.s124", combatant: true, mode: "follow", weapon: "HanYang", slot: 7 }),
  // 只处理战伤，钉在救护所院里。章节要点名才在场。
  junyi: Object.freeze({ labelKey: "gameplay.cast.junyi", combatant: false, mode: "hold", weapon: "HanYang", slot: 8 }),
  // escortColumn 自己会摆担架队；点名之前不要重复生成。
  danjiayuan: Object.freeze({ labelKey: "gameplay.cast.danjiayuan", combatant: false, mode: "follow", weapon: "HanYang", slot: 9 }),
  // 终章通信参谋，钉在师部。
  canmou: Object.freeze({ labelKey: "gameplay.cast.canmou", combatant: false, mode: "hold", weapon: "HanYang", slot: 10 }),
  // 真实历史人物。终章由章节点名，不许自动在场。
  wangmingzhang: Object.freeze({ labelKey: "gameplay.cast.wangmingzhang", combatant: false, mode: "hold", weapon: null, slot: 11 }),

  // --- 这一层永不生成的（reason 是开发者诊断，不是玩家文本）---
  shunzi: Object.freeze({ absent: true, reason: "玩家自己" }),
  shangbing: Object.freeze({ absent: true, reason: "担架上的伤员，由 escortColumn / carryWounded 摆" }),
  junguan: Object.freeze({ absent: true, reason: "后方喊话的人不露脸（§2 阶段二原文）" }),
  ija_gunso: Object.freeze({ absent: true, reason: "日方" }),
  narrator: Object.freeze({ absent: true, reason: "旁白，没有身体" }),
  crowd: Object.freeze({ absent: true, reason: "无名无脸的人群，走布设与百姓 tzm" }),
  runner: Object.freeze({ absent: true, reason: "只出声" }),
  adjutant: Object.freeze({ absent: true, reason: "只出声" }),
});

/**
 * 同时在场的具名同伴上限。
 *
 * 六个是一个班的量级（罗班长 + 五个），也正好是七章里说话最多的那一批。
 * 再多就不是「认得出的人」而是「一群兵」，而且会把撒兵的近身班组名额挤光。
 */
export const MAX_COMPANIONS = 6;

/**
 * 默认的玩家角色。
 *
 * **玩家自己不能同时站在自己旁边。** 六章里玩家是顺子；终章 §7 明写
 * 「玩家＝小秦」，而小秦在终章话最多，按 beats 推名册会把他推出来，
 * 于是场上会有两个小秦（一个是你，一个站你旁边）。
 * 章节侧写在 `Data_MissionCh6.CHAPTER.playerCast` 上，没写就退到这个默认值。
 */
export const DEFAULT_PLAYER_CAST = "shunzi";

/** 跟随的几何与节奏。数只在这里，文档里只写常量名。 */
export const COMPANION_TUNING = Object.freeze({
  followBackM: 6.0,       // 站在玩家身后多少米（顺着玩家朝向的反方向）
  laneSpanM: 3.4,         // 相邻站位的横向间距 —— 排成一线是 AI 最难看的毛病
  laneSpreadM: 2.2,       // 纵深错开：偶数号往后再让一点，不站成一排
  regoalS: 0.45,          // 多久重设一次跟随目标（每帧写目标等于每帧打断寻路）
  leashM: 70,             // 离玩家超过这个距离就直接归队（隔着两条街追不回来）
  spawnRingM: 7.5,        // 生成时离玩家多远
  holdRadiusM: 9.0,       // hold 模式的待命半径
  // 嘴的高度。宿主给的是**脚下**坐标；声音从脚脖子发出来在 HRTF 里是听得出来的
  // （近处尤其明显：五米外的人听着像趴在地上说话）。站姿眼位约 1.62，嘴略低一点。
  mouthY: 1.52,
  // 倒下的人不抬到嘴高，只离地这么点：尸体是躺着的。
  fellMouthY: 0.35,
});
