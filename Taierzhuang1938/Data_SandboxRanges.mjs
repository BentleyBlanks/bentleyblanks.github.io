// 测试场登记表（docs/Data_SandboxRanges.md）：网址开关 → 是哪个测试场、对应哪个独立场景文件、开局写什么、要哪些通用待遇。
//
// 以前这份对照散在三处：开机路由的两张开关清单（Data_StartupRouting）和 Script_Main 里每个测试场一个布尔开关，
// 加一个测试场要改三处，漏一处就是「菜单里点得到、进去是空的」。现在只有这一张表；
// 各测试场的玩法逻辑拆在独立的 Script_SandboxPlugin_<Name>.mjs 中按需懒加载（不进主包）。
//
// **纯数据、零 import**：开机路由（Script_Entry 那个最小包）也读它，不许把关卡表或运行时拖进来。
// 顺序就是选章「测试场景」一组的顺序。
//
// 字段：
//   id           网址开关名（`?<id>=1`），也是菜单 sandboxMode 与插件的键
//   phaseId      对应关卡的 phase.id（用于零依赖反向识别测试场）
//   sceneId      对应的独立场景目录 ID（Scenes/<sceneId>/Scene_<sceneId>.json）
//   kind         分组："functional"（功能测试场）| "scenery"（独立环境预览）| "encounter"（遭遇试玩）
//   bootLabel    开始按钮上的文本键（null = 用通用的「开始」）
//   invincible   玩家一律无敌（炸点就在人身边的场地：被自己按的那一下炸死只会换人、弹阵亡卡）
//   pinsPhase    没有「通关进下一关」（AdvanceLevel 原地返回）
//   identify     准心识别（指着谁、敌我）开不开（白刃实验场关：QTE 卡片之外不叠识别）
//   targetDetail 识别开着时要不要细节档（枪械射击场只认不细读）
//   steadyView   关掉运动模糊与开镜近景虚化（量弹道、看照门）
//   bayonetFixed 开局就上着刺刀
//   meleeAnimations  开机预载白刃全身动画库
//   externalProps / trimProps  要不要摆外部 GLB 布景 / tzm 饰件层
//   tightBounds  关卡边界只留 1 m 余量（默认 10 m）
//   muteAudio    不建音频上下文
//   ownsFrame    整帧交给测试场（布料/头发/环境预览：不走第一人称移动、战斗、HUD；自己管相机与输入）

const RANGE = (spec) => Object.freeze({
  phaseId: null, sceneId: null, kind: "functional",
  bootLabel: null, invincible: false, pinsPhase: true,
  externalProps: true, trimProps: true, tightBounds: false, muteAudio: false, ownsFrame: false,
  identify: true, targetDetail: true, steadyView: false, bayonetFixed: false, meleeAnimations: false,
  ...spec,
});

export const SANDBOX_RANGES = Object.freeze([
  RANGE({ id: "encounterPlay", phaseId: "Blockout_FirstLevelEncounter", sceneId: "FirstLevelEncounter", kind: "encounter",
    externalProps: false, trimProps: false }),
  RANGE({ id: "firstLevelScenePreview", phaseId: "Blockout_FirstLevel", sceneId: "FirstLevel", kind: "scenery",
    externalProps: false, trimProps: false, muteAudio: true, ownsFrame: true, identify: false, steadyView: true }),
  RANGE({ id: "dugoutAidOpenFields", phaseId: "Blockout_DugoutAidOpenFields", sceneId: "DugoutAidOpenFields", kind: "scenery",
    externalProps: false, trimProps: false, muteAudio: true, ownsFrame: true }),
  RANGE({ id: "gengjiazhuangFieldApproach", phaseId: "Blockout_GengjiazhuangFieldApproach", sceneId: "GengjiazhuangFieldApproach", kind: "scenery",
    externalProps: false, trimProps: false, muteAudio: true, ownsFrame: true, identify: false, steadyView: true }),
  RANGE({ id: "gengjiazhuangEastSmoke", phaseId: "Blockout_GengjiazhuangEastSmoke", sceneId: "GengjiazhuangEastSmoke", kind: "scenery",
    externalProps: false, trimProps: false, muteAudio: true, ownsFrame: true, identify: false, steadyView: true }),
  RANGE({ id: "tanketteAdvanceEastTrack", phaseId: "Blockout_TanketteAdvanceEastTrack", sceneId: "TanketteAdvanceEastTrack", kind: "scenery",
    externalProps: false, trimProps: false, muteAudio: true, ownsFrame: true, identify: false, steadyView: true }),
  RANGE({ id: "aircraftEvacuationDitch", phaseId: "Blockout_AircraftEvacuationDitch", sceneId: "AircraftEvacuationDitch", kind: "scenery",
    externalProps: false, trimProps: false, muteAudio: true, ownsFrame: true, identify: false, steadyView: true }),
  RANGE({ id: "movement", phaseId: "MovementRange", sceneId: "TestMovement",
    bootLabel: "boot.start.movementRange", externalProps: false, trimProps: false }),
  RANGE({ id: "weapons", phaseId: "WeaponRange", sceneId: "TestWeapon",
    bootLabel: "boot.start.weaponRange", targetDetail: false, steadyView: true }),
  RANGE({ id: "range", phaseId: "Range", sceneId: "TestRange", pinsPhase: false }),
  RANGE({ id: "explosions", phaseId: "ExplosionRange", sceneId: "TestExplosion",
    bootLabel: "boot.start.explosionRange", invincible: true, externalProps: false, trimProps: false }),
  RANGE({ id: "melee", phaseId: "MeleeQte", sceneId: "TestMelee",
    pinsPhase: false, tightBounds: true, identify: false, bayonetFixed: true, meleeAnimations: true }),
  RANGE({ id: "gore", phaseId: "GoreRange", sceneId: "TestGore",
    bootLabel: "boot.start.goreRange", invincible: true, externalProps: false, trimProps: false }),
  RANGE({ id: "impacts", phaseId: "ShellImpactRange", sceneId: "TestShellImpact",
    bootLabel: "boot.start.impactRange", invincible: true, trimProps: false }),
  RANGE({ id: "reactions", phaseId: "BattleReactionRange", sceneId: "TestShellImpact",
    bootLabel: "boot.start.reactionRange", invincible: true, trimProps: false }),
  RANGE({ id: "cloth", phaseId: "ClothRange", sceneId: "TestCloth",
    bootLabel: "boot.start.clothRange", invincible: true, externalProps: false, trimProps: false,
    tightBounds: true, muteAudio: true, ownsFrame: true }),
  RANGE({ id: "hair", phaseId: "HairRange", sceneId: "TestHair",
    bootLabel: "boot.start.hairRange", invincible: true, externalProps: false, trimProps: false,
    tightBounds: true, muteAudio: true, ownsFrame: true }),
]);

/** 测试场的网址开关名（开机路由用）。 */
export const SANDBOX_RANGE_KEYS = Object.freeze(SANDBOX_RANGES.map((r) => r.id));

/** 按 id 找登记表行。 */
export function SandboxRangeById(id) {
  return SANDBOX_RANGES.find((r) => r.id === id) || null;
}

/** 按 phase.id 找登记表行（无需加载任何插件）。 */
export function SandboxRangeForPhase(phase) {
  return phase?.id ? SANDBOX_RANGES.find((r) => r.phaseId === phase.id) || null : null;
}

/** 网址上开着的那个测试场（`?<id>=1`），没有就是 null。 */
export function SandboxRangeFromParams(params) {
  return SANDBOX_RANGES.find((r) => params.get(r.id) === "1") || null;
}
