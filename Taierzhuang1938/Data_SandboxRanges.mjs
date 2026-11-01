// 测试场登记表（docs/Data_SandboxRanges.md）：网址开关 → 是哪个测试场、开局写什么、要哪些通用待遇。
//
// 以前这份对照散在三处：开机路由的两张开关清单（Data_StartupRouting）和 Script_Main 里每个测试场一个布尔开关，
// 加一个测试场要改三处，漏一处就是「菜单里点得到、进去是空的」。现在只有这一张表；
// 场地类、关卡表、建什么、每帧做什么在 Script_SandboxRanges（插件那一半）。
//
// **纯数据、零 import**：开机路由（Script_Entry 那个最小包）也读它，不许把关卡表或运行时拖进来。
// 顺序就是选章「测试场景」一组的顺序。
//
// 字段：
//   id           网址开关名（`?<id>=1`），也是菜单 sandboxMode 与插件的键
//   bootLabel    开始按钮上的文本键（null = 用通用的「开始」）
//   invincible   玩家一律无敌（炸点就在人身边的场地：被自己按的那一下炸死只会换人、弹阵亡卡）
//   pinsPhase    没有「通关进下一关」（AdvanceLevel 原地返回）
//   respawn      补兵怎么补：null = 不补；"range" / "melee" = 走装配层的木桩兵复位
//   externalProps / trimProps  要不要摆外部 GLB 布景 / tzm 饰件层
//   tightBounds  关卡边界只留 1 m 余量（默认 10 m）
//   muteAudio    不建音频上下文
//   ownsFrame    整帧交给测试场（不走第一人称移动、战斗、HUD；自己管相机与输入）

const RANGE = (spec) => Object.freeze({
  bootLabel: null, invincible: false, pinsPhase: true, respawn: null,
  externalProps: true, trimProps: true, tightBounds: false, muteAudio: false, ownsFrame: false,
  ...spec,
});

export const SANDBOX_RANGES = Object.freeze([
  RANGE({ id: "movement", bootLabel: "boot.start.movementRange", externalProps: false, trimProps: false }),
  RANGE({ id: "weapons", bootLabel: "boot.start.weaponRange" }),
  RANGE({ id: "range", pinsPhase: false, respawn: "range" }),
  RANGE({ id: "explosions", bootLabel: "boot.start.explosionRange", invincible: true, externalProps: false, trimProps: false }),
  RANGE({ id: "melee", pinsPhase: false, respawn: "melee", tightBounds: true }),
  RANGE({ id: "gore", bootLabel: "boot.start.goreRange", invincible: true, externalProps: false, trimProps: false }),
  RANGE({ id: "impacts", bootLabel: "boot.start.impactRange", invincible: true, trimProps: false }),
  RANGE({ id: "reactions", bootLabel: "boot.start.reactionRange", invincible: true, trimProps: false }),
  RANGE({ id: "cloth", bootLabel: "boot.start.clothRange", invincible: true, externalProps: false, trimProps: false,
    tightBounds: true, muteAudio: true, ownsFrame: true }),
]);

/** 测试场的网址开关名（开机路由用）。 */
export const SANDBOX_RANGE_KEYS = Object.freeze(SANDBOX_RANGES.map((r) => r.id));

/** 网址上开着的那个测试场（`?<id>=1`），没有就是 null。 */
export function SandboxRangeFromParams(params) {
  return SANDBOX_RANGES.find((r) => params.get(r.id) === "1") || null;
}
