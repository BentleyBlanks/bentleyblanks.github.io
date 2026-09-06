// Interaction strings for the September first-level replacement.
export const TEXT = Object.freeze({
  "firstLevel.interaction.bundle": "领取集束手榴弹 · 按住 H 瞄准，松开投掷",
  "firstLevel.interaction.gate": "打开院门，让担架通过",
  "firstLevel.interaction.carry": "接过老周担架后端",
  "firstLevel.interaction.place": "将老周放在卫生兵旁",
  "firstLevel.interaction.supply": "补充弹药、手榴弹和绷带",
  "firstLevel.hint.melee": "V 拔刀 · F 拨推 · 左键挥刀",
  "firstLevel.hint.queue": "担架已通过 {passed}/{total} · 已转运 {loaded} 副",
});
export const DYNAMIC_PREFIXES = ["firstLevel.interaction."];
export const GATED_MODULES = ["Script_FirstLevelMissionRuntime.mjs", "Script_FirstLevelMissionVoice.mjs"];
