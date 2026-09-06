// Data_Carry.mjs — 负重档案表（担架 / 伤员 / 药箱 / 弹药箱 / 门板 / 铁锅）。
//
// **纯数据**：不 import three、不 import 规则代码、不含函数。
// 状态机在 `Script_Carry.mjs`（一张表 + 一台状态机，见 docs/Data_TextAndTuning.md §6）；
// 玩家可见的名字与说明存**文本键**，句子在 Data_Text_Gameplay.mjs 的 `gameplay.carry.*`。
//
// 数值只在这里，文档里只写常量名（AGENTS 硬规矩 12）。
//
// speedScale       乘进 `player.carrySpeedScale`；<1 时冲刺与开镜一并封掉。
// liftS            举起的收尾时间：这一段已经走不快也开不了枪，但还没「抬稳」。
// releaseS         主动放下的收尾时间。担架比箱子长，因为要跟前端那个人对上节奏。
// canThrow         慌了能不能直接摔在地上（左键）。**担架不许摔** —— 那是个人，不是麻袋。
// holders          几个人抬。2 表示需要一个前端同伴（由 AI/演员占位，不在负重层驱动）。
// spanM            前后端的间距，`PartnerAnchor` 按它算前端该站哪儿。
// sfxLift/Drop/Throw  三个动作各用哪条现成的音效配方（Script_Audio 的 RECIPES 名）。
// labelKey         HUD 负重条上的名字（摆点时可以用 `label` 整条覆盖）。
// holderLabelKey   「你在这件东西的哪一端」——双人抬与背人才有。
// noteKey          负重条第二行那句说明（HUD 真的会显示，所以它是玩家文本）。
export const CARRY_KINDS = Object.freeze({
  stretcher: Object.freeze({
    id: "stretcher",
    labelKey: "gameplay.carry.kind.stretcher",
    holderLabelKey: "gameplay.carry.holder.stretcher",
    noteKey: "gameplay.carry.note.stretcher",
    speedScale: 0.42, liftS: 0.75, releaseS: 0.60,
    canThrow: false, holders: 2, spanM: 1.85,
    sfxLift: "footstepRubble", sfxDrop: "impactDirt", sfxThrow: "bodyFall",
  }),
  wounded: Object.freeze({
    id: "wounded",
    labelKey: "gameplay.carry.kind.wounded",
    holderLabelKey: "gameplay.carry.holder.wounded",
    noteKey: "gameplay.carry.note.wounded",
    speedScale: 0.38, liftS: 1.00, releaseS: 0.55,
    canThrow: false, holders: 1, spanM: 0,
    sfxLift: "footstepRubble", sfxDrop: "bodyFall", sfxThrow: "bodyFall",
  }),
  medBox: Object.freeze({
    id: "medBox",
    labelKey: "gameplay.carry.kind.medBox",
    noteKey: "gameplay.carry.note.medBox",
    speedScale: 0.58, liftS: 0.55, releaseS: 0.35,
    canThrow: true, holders: 1, spanM: 0,
    sfxLift: "footstepRubble", sfxDrop: "impactWood", sfxThrow: "impactWood",
  }),
  ammoCrate: Object.freeze({
    id: "ammoCrate",
    labelKey: "gameplay.carry.kind.ammoCrate",
    noteKey: "gameplay.carry.note.ammoCrate",
    speedScale: 0.50, liftS: 0.65, releaseS: 0.40,
    canThrow: true, holders: 1, spanM: 0,
    sfxLift: "footstepRubble", sfxDrop: "impactWood", sfxThrow: "impactWood",
  }),
  doorPlank: Object.freeze({
    id: "doorPlank",
    labelKey: "gameplay.carry.kind.doorPlank",
    noteKey: "gameplay.carry.note.doorPlank",
    speedScale: 0.54, liftS: 0.70, releaseS: 0.40,
    canThrow: true, holders: 1, spanM: 0,
    sfxLift: "footstepRubble", sfxDrop: "impactWood", sfxThrow: "impactWood",
  }),
  ironPot: Object.freeze({
    id: "ironPot",
    labelKey: "gameplay.carry.kind.ironPot",
    noteKey: "gameplay.carry.note.ironPot",
    speedScale: 0.72, liftS: 0.40, releaseS: 0.25,
    canThrow: true, holders: 1, spanM: 0,
    sfxLift: "footstepRubble", sfxDrop: "impactMetal", sfxThrow: "impactMetal",
  }),
});

// 状态机自己的节奏数（重拾空窗、字幕时长）不在这张档案表里 ——
// 它们与交互点、架设武器的同类数一起放在 Data_Tuning_Interact.mjs 的 `CARRY` 段。
