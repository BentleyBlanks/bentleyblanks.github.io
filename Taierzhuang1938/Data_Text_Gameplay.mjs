// Data_Text_Gameplay.mjs — Script_Player / Script_Combat / Script_Carry / Script_Emplacement / Script_Companion / Script_Melee* / Script_Flare / Script_AircraftStrafe / Script_Telegraph 的玩家可见文案。
// 纯数据，不 import three。键前缀 `gameplay.`，由 Data_Locale_zhCN.mjs 拼表；口径见 docs/Data_TextAndTuning.md。
// 占位符写 {name}，代码侧 T("gameplay.xxx", { name })。同一句话只登记一次，多处复用同一键。
//
// 分段与代码文件一一对应，段内按「档案表里的名字 → 状态机说的话」排：
//   stance.      Script_Player 的三种姿态名（操作白盒面板读它）
//   speaker.     hud.Say 的说话人。玩家自己那一句在剧本里就写作「你」
//   carry.       Script_Carry（种类名 / 负重条上的说明 / 提示条那一行）
//   emplacement. Script_Emplacement（架设武器名 / 过热与卡壳的每一句提示）
//   cast.        Script_Companion 的具名同伴（Data_Companions 的 labelKey 指过来）
//   flare.       Script_Flare 的照明弹与两条预设
//   strafe.      Script_AircraftStrafe 的四条航线与【扑入路沟】那一条提示
//   telegraph.   Script_Telegraph 的报码纸与电键
//   melee.       Script_MeleeQte 的两种僵持
//   mortar.      Script_Combat 呼叫迫击炮被拒时的两条理由
export const TEXT = Object.freeze({
  // --- Script_Player ---------------------------------------------------------
  "gameplay.stance.stand": "立",
  "gameplay.stance.crouch": "蹲",
  "gameplay.stance.prone": "卧",

  // --- 说话人 ---------------------------------------------------------------
  "gameplay.speaker.you": "你",

  // --- Script_Carry：负重种类（Data_Carry.CARRY_KINDS 的 labelKey / holderLabelKey / noteKey）---
  "gameplay.carry.kind.stretcher": "担架",
  "gameplay.carry.kind.wounded": "伤员",
  "gameplay.carry.kind.medBox": "药箱",
  "gameplay.carry.kind.ammoCrate": "弹药箱",
  "gameplay.carry.kind.doorPlank": "门板",
  "gameplay.carry.kind.ironPot": "铁锅",
  "gameplay.carry.holder.stretcher": "担架后端",
  "gameplay.carry.holder.wounded": "背着伤员",
  "gameplay.carry.note.stretcher": "两只手都占着 —— 枪背在背上",
  "gameplay.carry.note.wounded": "背上一个人 —— 走不快，也打不了",
  "gameplay.carry.note.medBox": "抱着药箱",
  "gameplay.carry.note.ammoCrate": "拖着弹药箱",
  "gameplay.carry.note.doorPlank": "扛着一扇门板",
  "gameplay.carry.note.ironPot": "抱着一口铁锅",

  // --- Script_Carry：状态机 --------------------------------------------------
  "gameplay.carry.refuseDefault": "哪个都不准松！",
  "gameplay.carry.lifting": "抬起{name}……",
  "gameplay.carry.releasing": "放下{name}……",
  "gameplay.carry.drop": "放下{name}",
  "gameplay.carry.locked": "不许松手",

  // --- Script_Emplacement：档案表（Data_Emplacements 的 labelKey / noteKey）---
  "gameplay.emplacement.kind.Type92Hmg": "九二式重机枪",
  "gameplay.emplacement.kindNote.Type92Hmg": "架在街垒上的重机枪。短点射，莫一直压。",
  "gameplay.emplacement.kind.Zb26Nest": "捷克式（架起来的）",
  "gameplay.emplacement.kindNote.Zb26Nest": "两脚架撑在墙垛上。二十发一匣，换得勤。",

  // --- Script_Emplacement：接管与拒绝 -----------------------------------------
  "gameplay.emplacement.take": "接管机枪",
  "gameplay.emplacement.takeNamed": "接管{name}",
  "gameplay.emplacement.busy": "手上已经有一挺了",
  "gameplay.emplacement.manned": "有人在打",
  "gameplay.emplacement.wrecked": "这挺枪废了",

  // --- Script_Emplacement：过热 / 卡壳 / 弹药 ---------------------------------
  "gameplay.emplacement.jamFatal": "卡壳了 —— 按 R 拉枪机",
  "gameplay.emplacement.jamMinor": "卡壳 —— 按住 R 排障",
  "gameplay.emplacement.dead": "这挺枪废了。按 F 弃枪。",
  "gameplay.emplacement.pullAgain": "拉不动 —— 再来",
  "gameplay.emplacement.pullProgress": "拉枪机（{pulls}/{need}）",
  "gameplay.emplacement.clearPrompt": "按住 R 排障",
  "gameplay.emplacement.cleared": "排出来了",
  "gameplay.emplacement.cooled": "凉下来了 —— 短点射",
  "gameplay.emplacement.overheatHint": "枪管红了 —— 停火",
  "gameplay.emplacement.overheatShout": "莫一直压！",
  "gameplay.emplacement.overheatPrompt": "过热 —— 停火",
  "gameplay.emplacement.burstPrompt": "短点射。莫一直压。",
  "gameplay.emplacement.noBelts": "没得弹板了",
  "gameplay.emplacement.reloadPrompt": "按 R 换弹板",
  "gameplay.emplacement.reloading": "换弹板……",
  "gameplay.emplacement.ammoOut": "弹尽",
  "gameplay.emplacement.exitAbandon": "弃枪",
  "gameplay.emplacement.exitLeave": "离位",
  "gameplay.emplacement.resupply": "给机枪补弹",
  "gameplay.emplacement.resupplyHint": "弹板压进去了。",

  // --- Script_Companion：具名同伴（Data_Companions.COMPANION_CAST 的 labelKey）---
  "gameplay.cast.luo": "罗班长",
  "gameplay.cast.yaowa": "幺娃",
  "gameplay.cast.heyoutian": "何有田",
  "gameplay.cast.liuwencai": "刘文财",
  "gameplay.cast.zhaodegui": "赵德贵",
  "gameplay.cast.xiaoqin": "小秦",
  "gameplay.cast.paizhang": "排长",
  "gameplay.cast.s124": "伤兵",
  "gameplay.cast.junyi": "军医",
  "gameplay.cast.danjiayuan": "担架员",
  "gameplay.cast.canmou": "参谋",
  "gameplay.cast.wangmingzhang": "师长",

  // --- Script_Flare ----------------------------------------------------------
  "gameplay.flare.label": "照明弹",
  "gameplay.flare.preset.crossLane": "第一枚照明弹 · 横巷",
  "gameplay.flare.preset.narrowLane": "第二枚照明弹 · 窄巷白刃",

  // --- Script_AircraftStrafe --------------------------------------------------
  "gameplay.strafe.label": "扫射航线",
  "gameplay.strafe.preset.railPass": "第一次掠过 · 沿铁路打车辆",
  "gameplay.strafe.preset.crowdTurn": "转向人群 · 弹线追着队列走",
  "gameplay.strafe.preset.divePress": "配合松手 · 弹线逼到脚下",
  "gameplay.strafe.preset.flybyOnly": "只有飞越声 · 心理残留",
  "gameplay.strafe.cue.dive": "扑入路沟",

  // --- Script_Telegraph -------------------------------------------------------
  "gameplay.telegraph.label": "报码纸",
  "gameplay.telegraph.key": "按电键发下一组",
  "gameplay.telegraph.keyProgress": "{label}（{sent}/{total}）",
  "gameplay.telegraph.reconnect": "按住接回接头",
  "gameplay.telegraph.reconnectHint": "接头接回去了。接着发。",
  "gameplay.telegraph.sending": "发送中……",

  // --- Script_MeleeQte --------------------------------------------------------
  "gameplay.melee.qte.ground": "倒地抵抗",
  "gameplay.melee.qte.standing": "武器僵持",
  "gameplay.melee.qte.prompt": "快速连按 F · 抵抗",

  // --- Script_Combat ----------------------------------------------------------
  "gameplay.mortar.noShells": "没有炮弹了",
  "gameplay.mortar.reloading": "炮位还在装填",
});

/**
 * 这张表覆盖的代码文件。登记之后 Script_TextTest 就对它们生效：
 * 玩家可见的中文字面量一条都不许再出现（注释 / 诊断 / `// @text-ok` 除外）。
 */
export const GATED_MODULES = Object.freeze([
  "Script_Player.mjs",
  "Script_Carry.mjs",
  "Script_Emplacement.mjs",
  "Script_Companion.mjs",
  "Script_Combat.mjs",
  "Script_Flare.mjs",
  "Script_AircraftStrafe.mjs",
  "Script_Telegraph.mjs",
  "Script_MeleeQte.mjs",
  "Script_MeleeCombat.mjs",
  "Script_Ai.mjs",
  "Script_Navigation.mjs",
]);

/**
 * 运行时拼出来的键前缀。这几段的可变部分都来自**数据表里的 id**
 *（姿态 id / 负重种类 id / 架设武器 id / CAST id / 预设 id），
 * 由各自那张表的测试保证每个 id 都有一条对应文本 —— 不许用自由字符串拼键。
 */
export const DYNAMIC_PREFIXES = Object.freeze([
  "gameplay.stance.",
  "gameplay.carry.kind.",
  "gameplay.carry.holder.",
  "gameplay.carry.note.",
  "gameplay.emplacement.kind.",
  "gameplay.emplacement.kindNote.",
  "gameplay.cast.",
  "gameplay.flare.",
  "gameplay.strafe.",
  "gameplay.telegraph.",
]);
