// Data_Setpieces_Ch1.mjs — 第一关摆点的**编排数据**（谁在队里、谁抬担架）。
// 纯数据：不 import three、不 import 规则代码、不含函数。口径见 docs/Data_TextAndTuning.md §6。
//
// `Script_MissionSetpieces.mjs` 的 CH1 Setup 读这两张编成表建后送队；
// 名牌存**键**不存句子，句子在 Data_Text_Setpieces.mjs 的 `setpieces.escort.*`。
//
// 成员字段（EscortColumn 认的那几个）：
//   role       bearer（抬担架）/ guard（持枪护卫）/ walking（可行走伤兵）/ civilian（百姓）
//   labelKey   世界里那块名牌的文案键
//   weapon     可见武器；null = 手上没枪（同时约束 AI 不开火）
//   civilian   true = 平民模型与平民行为
//   p012Variant  只在 P012 白盒里给的模型分身（"male" / "female"）；普通章不传
//   p012RouteSlot 只在 P012 白盒里给的固定队列槽位（跟着走线排，不走两列分布）
//
// 编成照策划案 §2 阶段三逐条：2 副担架（4 名担架员）＋2 名持枪护卫＋2 名可行走伤兵
// ＋2 名撤离百姓。**妇孺老人必须在队里看得见** —— 阶段六「担架、女人、娃儿都照打」
// 是靠玩家自己看见成立的，不是靠台词，所以百姓那两条一男一女，不许合并成一条。

/** 沿大车路南下的武装后送队。 */
export const CH1_ESCORT_MEMBERS = Object.freeze([
  { role: "bearer", labelKey: "setpieces.escort.bearer", weapon: null },
  { role: "bearer", labelKey: "setpieces.escort.bearer", weapon: null },
  { role: "bearer", labelKey: "setpieces.escort.bearer", weapon: null },
  { role: "bearer", labelKey: "setpieces.escort.bearer", weapon: null },
  { role: "guard", labelKey: "setpieces.escort.guard", weapon: "HanYang" },
  { role: "guard", labelKey: "setpieces.escort.guard", weapon: "HanYang" },
  { role: "walking", labelKey: "setpieces.escort.walking", weapon: null },
  { role: "walking", labelKey: "setpieces.escort.walking", weapon: null },
  // 队列只传角色身份；P012 宿主通过正式 ActorFactory 复用男女平民模型，
  // 无枪标记同时约束可见武器和 AI 攻击，不在这里复制人物渲染或战斗规则。
  { role: "civilian", labelKey: "setpieces.escort.civilian", weapon: null, civilian: true,
    p012Variant: "male", p012RouteSlot: { back: 0.95, lateral: 0.8 } },
  { role: "civilian", labelKey: "setpieces.escort.civilianWoman", weapon: null, civilian: true,
    p012Variant: "female", p012RouteSlot: { back: 5.15, lateral: 0.8 } },
].map(Object.freeze));

/**
 * 阵地掩蔽部门口那一副**预置**担架：两名救护兵把伤员放下就不动了。
 * 它存在的意义是让 B11「救助伤员」有一具真的担架和一个真的伤员可以拖，
 * 不是一支会走的队伍（走线只有原地两点）。
 */
export const CH1_PREP_WOUNDED_MEMBERS = Object.freeze([
  { role: "bearer", labelKey: "setpieces.escort.medic", weapon: null },
  { role: "bearer", labelKey: "setpieces.escort.medic", weapon: null },
].map(Object.freeze));
