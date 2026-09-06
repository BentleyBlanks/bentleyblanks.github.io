// Data_Text_Setpieces.mjs — Script_MissionSetpieces 的演出角色标签与提示。
// 纯数据，不 import three。键前缀 `setpieces.`，由 Data_Locale_zhCN.mjs 拼表；口径见 docs/Data_TextAndTuning.md。
// 占位符写 {name}，代码侧 T("setpieces.xxx", { name })。同一句话只登记一次，多处复用同一键。
//
// 分段：
//   escort.*  后送队成员在世界里的名牌。由 Data_Setpieces_Ch1.CH1_ESCORT_MEMBERS 的
//             labelKey 引用（表驱动，登记在 DYNAMIC_PREFIXES）。
//   ch1.*     第一关摆点自己摆出来的交互标签与提示，代码里静态 T("…") 引用。
export const TEXT = Object.freeze({
  // --- 后送队名牌（编成表 Data_Setpieces_Ch1 点名）---------------------------
  "setpieces.escort.default": "后送队",
  "setpieces.escort.bearer": "担架员",
  "setpieces.escort.guard": "护卫",
  "setpieces.escort.walking": "可行走伤兵",
  "setpieces.escort.civilian": "百姓",
  "setpieces.escort.civilianWoman": "百姓（抱娃的婆娘）",
  "setpieces.escort.medic": "阵地救护兵",

  // --- 第一关摆点 -----------------------------------------------------------
  "setpieces.ch1.ammoCrate": "抬起弹药箱",
  "setpieces.ch1.ammoCrateLoad": "弹药箱",
  "setpieces.ch1.ammoDrop": "把箱子送过去",
  "setpieces.ch1.ammoDelivered": "弹药送到机枪位了。",
  "setpieces.ch1.woundedDrag": "拖住伤员，带回交通壕",
  "setpieces.ch1.woundedDragLoad": "拖回伤员",
  "setpieces.ch1.stretcher": "接住担架后端",
  "setpieces.ch1.stretcherLoad": "担架（伤员）",
  "setpieces.ch1.diveRetry": "再来一次 —— 它压下来的时候扑进沟里。",
  "setpieces.ch1.regrip": "重新握住担架后端",
  "setpieces.ch1.legRaised": "腿抬高了。",
});

/** 这个模块已迁完，闸门从此不许它再出现玩家可见中文字面量。 */
export const GATED_MODULES = Object.freeze([
  "Script_MissionSetpieces.mjs",
]);

/** 编成表按 labelKey 引用的前缀；闸门只查「前缀下至少有一条」。 */
export const DYNAMIC_PREFIXES = Object.freeze([
  "setpieces.escort.",
]);
