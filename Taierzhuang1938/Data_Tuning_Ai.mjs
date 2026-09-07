// Data_Tuning_Ai.mjs — 士兵 AI 的发现距离、班组队形、交火距离与人物 LOD 预算。
//
// **纯数据**：不 import three、不 import 规则代码、不含函数。规则在 `Script_Ai.mjs`，
// 它 import 这张表读并按原名 re-export（`SIGHT_BY_STANCE` / `SIGHT_SCALE_RANGE` /
// `CAPSULE` 是跨系统契约名，改名会同时打断照明弹、人物动作编辑器与三个测试）。
//
// **不在这张表里的**：
//   · 命中率、压制、部位倍率、AI 枪伤 → `Data_Battle.COMBAT`（docs/Data_PlayerDamage.md，
//     `aiAccuracyBase` 那一组数尤其不许在这里再存一份）；
//   · 难度档（aiAccuracy / suppressionScale / …）→ `Data_Battle.DIFFICULTY`；
//   · 通行阶梯（翻越 / 攀爬 / 自动抬腿）→ `Data_Traversal.TRAVERSAL`；
//   · 三种姿态的胶囊 `CAPSULE`：那是**移动碰撞体**，与 `Data_Tuning_Player.STANCE`
//     的 eye/radius 是同一套「人有多高多粗」的几何契约，留在 Script_Ai 与人物动作
//     编辑器手边（子弹判定另有一个球 `COMBAT.hitbox`，两者互不相干）。

/**
 * 被发现的距离，按**目标自己的姿态**缩放：站 120 / 蹲 80 / 卧 45 m。
 *
 * 这是 ER2 的 Covert Movements 那条机制里最便宜也最值钱的一半：姿态第一次真的
 * 影响「会不会被打」。原来两边一律 120 m 一刀切，趴下除了走得慢没有任何收益，
 * 于是玩家（和 AI）永远没有理由卧倒。
 *
 * 下标 0 站 / 1 蹲 / 2 卧，与 CAPSULE、Script_Identify 同一套。
 */
export const SIGHT_BY_STANCE = [120, 80, 45];

/**
 * 发现距离的**全局倍率**上下限（`AiDirector.SetSightScale`）。
 *
 * 谁在写它：第四关的照明弹（Script_Flare）—— 燃烧期把三档一起抬上去（敌我同时
 * 暴露），熄灭之后压到 1 以下几秒（暗适应），过完再还原成 1。
 *
 * 为什么是**乘一个数**而不是改上面那张表：三档的比例就是「姿态决定被发现的距离」
 * 那条机制本身。整表乘同一个数，站/蹲/卧的次序与比例一个都不变 ——
 * 照明弹底下趴着仍然比站着难被看见。谁要是改成「照明弹期间一律 200 m」，
 * 这条机制当场作废。
 */
export const SIGHT_SCALE_RANGE = Object.freeze({ min: 0.25, max: 4 });

/**
 * 六人战斗组。不是给 HUD 看的职业系统，而是让一群人不再对着同一个点做同一个动作：
 * 组长定方向，突击手靠前，机枪/掩护手压后，侧翼手走最外侧，步枪手填中间。
 * Spawn 顺序固定，所以这张表也固定；同一种子重跑不会换队形。
 *
 * size            一组几个人
 * enemyFocusM     组长把「敌人在哪个方向」算进推进方向的搜索半径
 * lookaheadM      推进方向往前投多远当作组目标
 * turnPerUpdate   组方向每次决策最多转多少弧度（不许一帧掉头）
 * slots           每个位置相对组方向的横向 / 纵深偏移（米）
 */
export const SQUAD = Object.freeze({
  size: 6,
  enemyFocusM: 92,
  lookaheadM: 22,
  turnPerUpdate: 0.72,
  slots: Object.freeze([
    Object.freeze({ role: "leader", lateral: 0, depth: 1 }),
    Object.freeze({ role: "assault", lateral: -2.5, depth: -4 }),
    Object.freeze({ role: "rifleman", lateral: 4, depth: 1 }),
    Object.freeze({ role: "support", lateral: -3, depth: 9 }),
    Object.freeze({ role: "rifleman", lateral: -6, depth: 3 }),
    Object.freeze({ role: "flank", lateral: 9, depth: -1 }),
  ]),
});

/**
 * 交火距离。超过它就不再把目标当「现在要打的人」，转回推进 / 找掩体。
 * 机枪 / 掷弹筒手（support）压后，射程也更远，所以单开一档。
 * hysteresisM 是已经在交火中的人多给的余量 —— 不给的话人会在边界上开一枪停一枪。
 */
export const ENGAGE = Object.freeze({
  defaultM: 74,
  supportM: 95,
  hysteresisM: 12,
});

/**
 * 人物 LOD 的距离预算。**这是性能账，不是玩法数** —— 改它只影响一帧多少提交，
 * 不影响谁看得见谁（那条在 SIGHT_BY_STANCE）。
 *
 * 【2026-08-20 可见性优先】不再给人物发「可见名额」。旧实现只让 13 个 Actor 走
 * 完整模型，镜头里第 14 个人若在 55 m 内就被直接设成 invisible。现在保留「视锥内
 * 每个人都必须看得见」，改为距离 LOD：近处是完整 Actor，远处是 ActorCrowd 烘焙
 * 出的同款模型实例 —— 不按人数发名额，不会隐藏第 N 个人。
 *
 * enterM / exitM 之间留迟滞，玩家在边界前后走动时不会反复切换。
 * 尸体没有步态、瞄准或足部 IK 可读，所以它的两档比活人近得多。
 */
export const ACTOR_DETAIL = Object.freeze({
  enterM: 46,
  exitM: 56,
  corpseEnterM: 24,
  corpseExitM: 30,
  animation60HzM: 20,
  animation30HzM: 32,
  footIkM: 18,
  shadowM: 24,
  // 视锥判定用的包围球：半径给到 1.6 m（人高 1.7 上下）再加一点余量，
  // 免得屏幕边缘上的人在转身时一格一格地闪出来。
  boundRadiusM: 1.6,
});

/**
 * 中弹踉跄（Actor 的 `hurt` 覆盖姿势）。
 *
 * 姿势代码与编辑器预览一直都在（Script_Actor 的「上身被顶得后仰、头往后甩、脚下错半步」），
 * 但 Script_Ai 的七处 actor.Update 从没传过 `hurt` —— 打中活着的人身上没有任何动作反馈，
 * 只有一团血。现在 Soldier.TakeHit 抬一下、Act 每帧按 decayS 衰减、Update 带过去。
 *
 * base        挨一下最少抬到多少（擦一下腿也得晃一下）
 * damageDiv   伤害 / 这个数 再叠上去（三八式 72 → +0.8，基本满幅）
 * decayS      从 1 衰减到 0 用几秒
 */
export const HURT_FLINCH = Object.freeze({ base: 0.45, damageDiv: 90, decayS: 0.45 });
