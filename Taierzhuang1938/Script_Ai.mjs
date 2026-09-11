// 《台儿庄：血战滕县》士兵 AI 与战斗结算。
//
// 对标 Easy Red 2 的取向：**同屏几十个人**、会找掩体、会被压得抬不起头、
// 会因为班里死得太多而往后缩。不追求单个 AI 有多聪明 —— 战场感来自数量与行为的
// 层次，而不是某一个 AI 的战术天才。
//
// 性能预算（1600×900 / 55fps）：
//   · 同屏活人上限 56（中日各 28），超出的排队等位。
//   · AI 决策**分帧轮转**：每帧只更新 1/6 的人做"想"，所有人都做"动"。
//     全员每帧跑视线检测会直接掉到 20fps。
//   · 视线检测走 Battlefield.Raycast（AABB 空间散列），并带 0.25 s 的结果缓存。

import * as THREE from "three";
import { Mulberry32, HashString, Clamp, Clamp01 } from "./Script_Noise.mjs";
import { WEAPONS } from "./Data_Weapons.mjs";
import { COMBAT, NAME_POOL, DIFFICULTY } from "./Data_Battle.mjs";
import { TRAVERSAL, TraversalPlan, TraversalCurve, TraversalLanding } from "./Data_Traversal.mjs";
import { ActorCrowd } from "./Script_ActorCrowd.mjs";
import {
  SIGHT_BY_STANCE, SIGHT_SCALE_RANGE, SQUAD, ENGAGE, ACTOR_DETAIL, HURT_FLINCH, BRAIN, WATCH,
} from "./Data_Tuning_Ai.mjs";
import { PlayerHitboxes, PlayerAimPoint, RaycastPlayerHitboxes, GaussianPair } from "./Script_PlayerHitbox.mjs";
// 敌军 AI 的四件基建（docs/Data_EnemyAi.md §4）。四个模块都不 import three，
// 只吃普通对象 `{x,y,z}` 与本文件组装的 host 回调 —— Script_Ai 仍是唯一的 three 适配层。
import { PerceptionModel, PLAYER_TRACK_ID, ALERT_ORDER } from "./Script_AiPerception.mjs";
import { CoverRegistry } from "./Script_AiCover.mjs";
import { COVER, COVER_CYCLE } from "./Data_Tuning_AiCover.mjs";
import { ShootingModel, CloseRangeWeight } from "./Script_AiShooting.mjs";
import { CLOSE_RANGE } from "./Data_Tuning_AiShooting.mjs";
import { TacticsDirector, TASK, IsManeuverTask, CanManeuver, ManeuverAllowed, ChargeOpportunity } from "./Script_AiTactics.mjs";
// 只读 TACTICS：压制射击的情报门槛与守区掩体余量。侧翼 / 投弹 / 查看的那几张表
// 由 `TacticsDirector` 自己消费 —— 大脑只按 `task.kind` 选状态，不重复读它们的数。
import { TACTICS, INVESTIGATE } from "./Data_Tuning_AiTactics.mjs";
// 断肢只借一个数：被卸掉肢体的那一下死亡推力乘多少（docs/Data_Dismemberment.md §8.1）。
// 判定与执行都在 ctx.gore 那一层，这里不认识 three 以外的任何断肢概念。
import { DEATH_PUSH_SCALE as GORE_DEATH_PUSH_SCALE } from "./Data_Tuning_Gore.mjs";

// 发现距离、班组队形、交火距离与人物 LOD 预算全在 `Data_Tuning_Ai.mjs`
//（每一组的账跟着数搬过去了）。这里按原名 re-export —— 那两个名字是跨系统契约：
// 照明弹按 SIGHT_SCALE_RANGE 夹倍率，人物动作编辑器与 FlareTest 都按名字找它们。
export { SIGHT_BY_STANCE, SIGHT_SCALE_RANGE };

// 状态字符串是跨系统契约：`Threatens` 认 "suppressed"、`EnemyCombatState` 认 "suppressed"、
// `AiBehaviorTest` 认 "charge"/"advance"、P012 冒烟认 fire/charge/bayonet/melee。
// 所以第二波（docs/Data_EnemyAi.md §5）**只增不改**：旧的九个值一个字都没动。
const STATE = {
  IDLE: "idle", ADVANCE: "advance", COVER: "cover", FIRE: "fire",
  SUPPRESSED: "suppressed", RELOAD: "reload", DEAD: "dead", CHARGE: "charge",
  VAULT: "vault",
  // --- 第二波新增 ---------------------------------------------------------
  /** 在掩体里打：hide → peek → 点射 → hide 的周期（COVER_CYCLE 定节拍）。 */
  COVER_ENGAGE: "cover_engage",
  /** 目标藏起来了 / 没拿到攻击令牌：向 LKP 或掩体沿压制射击。 */
  SUPPRESS: "suppress",
  /** 跃进：跑向下一个掩体，到位转 COVER_ENGAGE。 */
  BOUND: "bound",
  /** 绕侧翼：沿导航去 Tactics 给的点。 */
  FLANK: "flank",
  /** 去查看最后目击位置。 */
  INVESTIGATE: "investigate",
  /** 散伙后撤。 */
  RETREAT: "retreat",
  /** 投弹（走 actor.BeginGrenadeThrow + combat.Throw）。 */
  GRENADE: "grenade",
  // --- 第三波新增（docs/Data_EnemyAi.md §15）--------------------------------
  /**
   * 戒备：**不在交战中，但也不站着发呆**。有目标可是超出交战距离、或者只听见了
   * 动静没看见人 —— 跪下（压制高就卧倒）、面向那个方向、每隔 scanIntervalS 扫一次扇面，
   * 有掩体就缩在掩体后面，**一枪不开**（`Act` 的 WATCH 分支根本不调 TryFire）。
   * 推进中的人（还没走到 goal）不进这个状态，站着走、跑着走照旧。
   */
  WATCH: "watch",
};

/** 剧本旗单位走感知时用的空候选（`WatchScripted`）。复用常量，热路径不新建数组。 */
const EMPTY_CANDIDATES = Object.freeze([]);



/**
 * 行为 → 喊话的对照表（docs/Data_EnemyAi.md §8）。
 *
 * 键全部是 `Data_Voice.mjs` 里**已经烘出来的**行，一条新词都没加：
 * 中方走「找掩护 / 左手边绕过去 / 手榴弹 / 打莫歇气」，日方走对应的
 * `ija_warn_cover` / `ija_move_flank` / `ija_warn_grenade` / `ija_rally_suppress`。
 * `lost`（跟丢了）两侧都没有现成的词 —— 于是它**不在表里**，Bark 直接返回 null，
 * 等 Script_VoiceBake 补了词再加一行就行（这就是「静默降级」的形状）。
 */
const BARK_LINES = Object.freeze({
  spot: { nra: { kind: "spot" }, ija: { kind: "spot" } },
  cover: {
    nra: { kind: "move", key: "move_cover" },
    ija: { kind: "warn", key: "ija_warn_cover" },
  },
  flank: {
    nra: { kind: "move", key: "move_flank" },
    ija: { kind: "move", key: "ija_move_flank" },
  },
  grenade: {
    nra: { kind: "warn", key: "warn_grenade" },
    ija: { kind: "warn", key: "ija_warn_grenade" },
  },
  suppress: {
    nra: { kind: "rally", key: "rally_shoot" },
    ija: { kind: "rally", key: "ija_rally_suppress" },
  },
});

function AngleDelta(from, to) {
  return Math.atan2(Math.sin(to - from), Math.cos(to - from));
}

function ApproachAngle(from, to, maxStep) {
  return from + Clamp(AngleDelta(from, to), -maxStep, maxStep);
}

let nextId = 1;

// 人物 LOD 的距离预算在 `Data_Tuning_Ai.ACTOR_DETAIL`（为什么改成距离 LOD、
// 迟滞留多少，那段账跟着数搬过去了）。这三个是复用的临时对象，不是调参。
const _cullFrustum = new THREE.Frustum();
const _cullMatrix = new THREE.Matrix4();
const _cullSphere = new THREE.Sphere(new THREE.Vector3(), ACTOR_DETAIL.boundRadiusM);

/**
 * 屏幕上只有二十来像素高的人不需要 60 Hz 解十三个关节。位移与转向仍每帧同步，
 * 只把内部姿势分档；用士兵 id 错开更新帧，避免十个人在同一帧一起算。
 */
function ActorAnimationCadence(soldier) {
  const distanceSq = soldier.actor?.renderDistanceSq ?? 0;
  if (distanceSq > ACTOR_DETAIL.animation30HzM ** 2) return 3;
  if (distanceSq > ACTOR_DETAIL.animation60HzM ** 2) return 2;
  return 1;
}

/** 按权重抽一个。 */
function Pick(list, rnd) {
  const total = list.reduce((s, i) => s + (i.weight ?? 1), 0);
  let r = rnd() * total;
  for (const item of list) { r -= (item.weight ?? 1); if (r <= 0) return item; }
  return list[list.length - 1];
}

/** 生成一个有名有姓有籍贯的兵。ER2 式「换一个人接着打」靠它。 */
export function MakeSoldierIdentity(seed) {
  const rnd = Mulberry32(seed);
  const surname = NAME_POOL.surnames[Math.floor(rnd() * NAME_POOL.surnames.length)];
  const given = NAME_POOL.given[Math.floor(rnd() * NAME_POOL.given.length)];
  const origin = Pick(NAME_POOL.origins, rnd);
  const weapon = Pick(NAME_POOL.weapons, rnd);
  return {
    name: surname + given,
    origin: origin.place,
    weapon: weapon.id,
    age: 17 + Math.floor(rnd() * 18),
  };
}

/**
 * 三种姿态的胶囊。与 Script_Player.STANCE 是同一套数 ——
 * 两边对"人有多高多粗"必须一致，否则玩家钻得过去的门洞 AI 钻不过去。
 *
 * **这是移动碰撞体，不是命中体。** 子弹判定另有一个球（`COMBAT.hitbox`），
 * 两者互不相干：胶囊决定人挤不挤得过去，球决定子弹算不算打中。
 * 导出是给人物动作编辑器把两者并排画出来用的 —— 这个区别光看代码很难记住。
 */
export const CAPSULE = [
  { radius: 0.34, height: 1.78 },     // 0 站
  { radius: 0.34, height: 1.21 },     // 1 蹲
  { radius: 0.42, height: 0.58 },     // 2 卧
];

export class Soldier {
  constructor(side, options = {}) {
    this.id = nextId++;
    this.side = side;                       // "nra" | "ija"
    this.identity = options.identity || MakeSoldierIdentity(this.id * 7919 + (side === "nra" ? 11 : 97));
    this.weaponId = options.weapon || (side === "nra" ? this.identity.weapon : "Type38");
    this.weapon = WEAPONS[this.weaponId] || WEAPONS.Type38;
    this.position = new THREE.Vector3(options.x || 0, 0, options.z || 0);
    this.velocity = new THREE.Vector3();
    this.yaw = options.ry || 0;
    this.health = 100;
    this.state = STATE.IDLE;
    this.stateTime = 0;
    /**
     * 最近 32 次状态切换的环形记录（敌军 AI 编辑器的「30 s 状态时间带」读它）。
     *
     * 为什么记在人身上而不是导演身上：时间带问的是「**这一个人**刚才经历了什么」，
     * 全局事件流要按 id 过滤一遍才能回答，而 70 个人 × 每秒几次切换会把那条流
     * 冲得只剩最近半秒。为什么是环形复用槽而不是 push/shift：这条记录每帧都可能写，
     * 数组增删与对象字面量都会产生垃圾 —— 调试设施不许把 GC 压力算进玩法的帧预算。
     * 槽在第一次真的发生切换时才建（`AiDirector._LogStateChange`），
     * 木桩兵与平民一辈子不切状态，就一个字节都不占。
     */
    this.stateLog = null;
    this.stateLogHead = 0;
    this.stateLogCount = 0;
    /** 上一次写进 stateLog 的状态。与 `state` 不同就说明该记一条了。 */
    this.stateLogged = this.state;
    this.combatModeUntil = -99;
    this.suppression = 0;
    this.hurtPose = 0;                      // 中弹踉跄（Actor 的 hurt 覆盖姿势），Act 里按 HURT_FLINCH.decayS 衰减
    this.stance = 0;                        // 0 站 1 蹲 2 卧
    // 姿态决定是离散的，画面过渡必须是连续的。以前 Think 每 0.1 s 在阈值两侧切 0/1，
    // Actor 每次都直接吃满 0/1，于是整个人像电门一样反复蹲起。
    this.crouchBlend = 0;
    this.proneBlend = 0;
    this.stanceUntil = -99;
    this.lastRiseAt = -99;
    this.suppressedAt = -99;
    // 被压制打断的自动冲锋记冷却：几秒内不重新发起。没有它，压制一衰减过阈值
    // 就再冲、站上火线半秒又被压回卧倒，charge↔suppressed 两秒一圈来回抽。
    this.chargeCooldownUntil = -99;
    this.target = null;
    this.targetVisible = false;
    this.targetLostTime = 0;
    // 目标锁至少维持一小段时间；否则距离相近的两个人每次 Think 都互换名次，
    // 身体又逐帧朝新目标转，视觉上就是原地转圈。
    this.targetLockUntil = -99;
    this.targetChanges = 0;
    // 枪不直接吃离散状态。FIRE/ADVANCE 在决策边界上偶尔切一次时，枪托仍应连续
    // 上肩/放下；上身看向也必须相对「当前身体」而不是会量化跳变的导航方向。
    this.aimBlend = 0;
    this.aimUntil = -99;
    this.lookYaw = 0;
    /** 上一次「把枪口转到玩家身上」的时刻。首发必偏窗口按它算（见 TryFire）。 */
    this.playerLockAt = -99;
    this.aimTime = 0;
    this.ammo = this.weapon.magazine || 5;
    this.reloadTimer = 0;
    this.fireTimer = 0;
    this.cover = null;
    this.coverUntil = -99;
    this.goal = new THREE.Vector3(options.x || 0, 0, options.z || 0);
    this.order = "advance";
    /**
     * 靶场木桩兵（Script_Main ?range=1 时由装配层置真）。
     * Update 里跳过 Think —— 不索敌、不开火、不自行走位（TryFire 要 target，
     * Think 不跑就永远没有）；挨打、倒地、被准心识别照旧走原链路。
     */
    this.dummy = false;
    this.rnd = Mulberry32(this.id * 2654435761);
    this.actor = null;
    this.deadTime = 0;
    this.moveSpeed = 0;
    /**
     * 物理世界里的胶囊。**这是这一轮最要紧的一条改动** ——
     * 在此之前 AI 完全没有碰撞：位移直接写 position，再拿 StandHeight 把人吸到
     * 「脚下最高的那层」，挡不挡得住只由一个 Blocked() 启发式说了算。
     * 于是人从墙里穿过去是常态，站到房顶上也是常态。
     * 现在跟玩家用**同一套**角色控制器，两边对「这儿走不走得过去」只有一个答案。
     */
    this.body = null;
    this.velocityY = 0;
    this.grounded = true;
    /** 死后接管位移的那具刚体（见 AiDirector.StepCorpse）。 */
    this.corpse = null;
    /** 中弹方向 × 力度，死的那一帧交给尸体刚体当初速度。 */
    this.deathPush = null;
    this.corpseSettled = false;
    // 尸体贴地：躯干对齐地表的俯仰/侧倾，与「肢体下面是空的」的下垂量。
    // 全部带平滑（见 StepCorpse），所以要跨帧存在这儿。
    this.corpseTiltX = 0;
    this.corpseTiltZ = 0;
    this.corpseDroopBody = 0;
    this.corpseDroopArms = 0;
    // 滑动的「卡住换向」：上一帧位置、卡住累计时长、限时绕行航向及其剩余时间。
    this.corpseSlidePX = 0;
    this.corpseSlidePZ = 0;
    this.corpseStallT = 0;
    this.corpseDetourX = 0;
    this.corpseDetourZ = 0;
    this.corpseDetourT = 0;
    this.corpseSlideT = 0;
    // 通视缓存按**目标 id** 存三份。原来一人只有一份、不区分目标：
    // 最近的那个被墙挡住，缓存写下 clear=false，接下来 0.25 s 内换谁来问都答"看不见"，
    // 于是整条战线一起瞎掉（实跑：losCache.clear 为 true 的 0 人）。
    this.losCache = [
      { id: 0, time: -99, clear: false },
      { id: 0, time: -99, clear: false },
      { id: 0, time: -99, clear: false },
    ];
    this.losSlot = 0;
    // cohesion：34 m 内还有几个同侧活人，是**班组密度**不是士气。
    // 原名 morale 会诱导后人往 UI 上挂一条"中国守军士气条"—— 那在立场上是灾难。
    this.cohesion = 1;
    this.lonelyTime = 0;        // 20 m 内一个友军都没有已经持续了多久
    this.regoalTime = -99;      // 守点软约束上一次重设目标的时刻
    this.stuckTime = 0;         // 想走但走不动已经持续了多久
    this.detourTime = 0;        // 绕行还剩多久
    this.idleStepDt = 0;        // 静止分频物理攒下的 dt（见 Act 尾部那笔账）
    this.detourYaw = 0;         // 绕行时把前进方向拧多少
    // 沿墙走的**固定**转向。第 1 批那版每次卡住都重掷一个随机方向，
    // 于是撞墙→左绕一秒→回头撞墙→右绕一秒，是原地打转不是绕路：
    // 实跑取证 37 名日军里 15—21 名常年处在"绕行中"，而兵力重心一百二十秒一动不动。
    // 转向必须一人一个并且**认死**，这样才是真的沿着墙面兜过去。
    this.detourSign = this.rnd() < 0.5 ? 1 : -1;
    this.detourGoalDist = 1e9;  // 起绕那一刻离目标多远，用来判断这一圈有没有白绕
    this.towel = false;
    // 上刺刀。CHARGE 状态一进就上，白刃距离（2 m 内）真的会捅 —— 不是只跑过去开枪。
    this.bayonetFixed = false;
    // Shared melee rules own the animation state for players, friends and enemies.
    this.meleeCombat = null;
    this.meleeTraining = null;
    this.chargeUntil = -99;      // 玩家下"上刺刀"之后这道命令的有效期
    this.flankUntil = -99;       // 绕行命令的有效期，到点或超时就转 advance
    this.covertUntil = -99;      // 潜行命令的有效期：跟班长同姿态且不开枪
    // 翻越。院墙 2 m、窗台 0.9 m，而 Blocked() 的自动抬腿只到 TRAVERSAL.stepMax ——
    // 不给 AI 开这一条的话，玩家翻墙抄到院子里，追他的人只能绕门洞，
    // 这个动词就变成了单方面的作弊。
    this.vaultT = -1;            // >= 0 表示正在翻
    this.vaultDuration = TRAVERSAL.vaultBaseS;
    this.vaultKind = "vault";    // vault=腰高跨过 / mantle=肩高撑上去（Data_Traversal）
    this.vaultFrom = null;
    this.vaultTo = null;
    this.vaultApexY = 0;
    // 尸体上的家当。ER2 的拾取靠它，L4_LastFiveMinutes 那句"子弹得从倒下的人身上取"
    // 以前是一条死注释 —— 死人身上什么都没有。
    this.drop = null;
    // 断肢记录（GoreSystem 建、GoreSystem 清）。**非空 = 这具身上少了东西**：
    // 远景层不许接管他（那一层是整人烘的，会把肢体长回来），撤场时要先还原几何。
    this.gore = null;
    // 过热。十一年式不能换枪管，约 200 发必须冷却 —— 这是日军机枪火力
    // 有节奏间隙的史实来源，也是玩家冲过街口的战术窗口。
    this.heat = 0;
    this.coolUntil = -99;
    this.heatSmoke = 0;          // 冷却期间挂的那根白烟的 handle（0 = 没挂）
    // 排队（Conga Line）是 ER2 被骂最狠的毛病之一：一个班沿同一条线走成一串。
    // 对策是每个人生成时就领一个固定的横向偏移，跟随目标时永远偏这么多。
    this.laneOffset = (this.rnd() - 0.5) * 11;
    this.squadId = "";
    this.squadSlot = 0;
    this.tacticalRole = "rifleman";
    this.squadMateCount = 0;
    this.squadForwardX = 0;
    this.squadForwardZ = -1;
    this.squadFocusKind = "none";
    this.squadFocusId = null;
    this.manualGoalUntil = -99;
    // 守点纪律：ER2 的 AI 会在赶路途中就地对射、根本不进点，导致「只要防守方
    // 看得见攻方，这张图就极好打」。这里给防守单位一条硬规矩：
    // 一旦被派去守某个占领区，除非死亡，否则不许离开该区半径。
    this.holdZone = null;
    /**
     * 这个人占的那个**固定战位**的名字（重机枪位之类），没占就是 null。
     * 与 squadId 分开存：squadId 在 Spawn 里会因为满员而被改名成 `..._1/_2`，
     * 拿它当战位标识会认不出「这挺机枪已经有人了」。见 AiDirector.Spawn。
     */
    this.emplacementId = null;
    this.muzzle = new THREE.Vector3();
    this.lastFire = -99;
    // --- 第二波（docs/Data_EnemyAi.md §5）在士兵上新增的字段 ------------------
    // 全部在构造器里定死，不靠第一次赋值凭空长出来：V8 的隐藏类每多一次形状变更
    // 就是一次去优化，而这些字段每一帧都在热路径上被读。
    this.perception = null;      // PerceptionModel 的记忆（Attach 建）
    this.shooting = null;        // ShootingModel 的瞄准 / 暴露状态
    this.task = null;            // TacticsDirector 每秒写的班组任务
    this.alert = "unaware";      // 士兵级警戒（ALERT.*）
    this.awareness = 0;          // 当前目标的觉察度 0..1
    this.lkp = null;             // 最后目击位置（复用对象）
    this.lkpTime = -99;
    this.lkpConfidence = 0;
    this.targetMoving = false;
    this.targetFromMemory = false;   // 目标是从记忆里接回来的（只压制射击，不冲锋）
    this.targetExposedS = 0;     // 目标连续暴露了几秒（瞄准收敛加速）
    this.muzzleWorld = null;     // 这一发的枪口（UpdateMuzzle 写，对不上账时为 null）
    this.muzzleStore = null;
    this.lookPitch = 0;          // 持续跟踪瞄点的抬枪角（向上为正）
    this.lookPitchBlend = 0;     // 限速之后真正喂给 Actor 的那个
    this.burstLeft = 0;          // 这一梭子还剩几发（BurstPlan 排的）
    this.burstIntervalS = 0;
    this.burstPauseS = 0;
    this.moveOrder = null;       // 这一帧的走位命令 {x,z,speed}（Act 的 switch 读它）
    this.moveStore = { x: 0, z: 0, speed: 0 };
    this.moveArriveM = NaN;      // 这一次走位的到位半径（掩体微走位要 0.12 m，默认 1.2 m 判不出探头）
    this.stationaryS = 0;        // 在原地待了多久（投弹判据「对方钉在一处」读它）
    this.coverStore = null;      // s.cover 的复用容器（不每次选点都新建）
    this.grenadeThreatAt = -99;  // 上一次「敌方手榴弹落在我掩体边上」的时刻
    this.coverPhase = "none";    // "hide" | "peek" | "none"
    this.coverPhaseUntil = -99;
    this.coverPickAt = -99;      // 上一次（重）选掩体的时刻，reselectMinS 限流
    this.coverThreatX = 0;       // 上一次选点时威胁在哪（挪远了才值得重算）
    this.coverThreatZ = 0;
    this.peekCount = 0;          // hide→peek 循环次数（验收探针数它）
    this.lastGrenadeAt = -99;
    this.grenades = 0;           // 携行手榴弹（第一关编成发弹，见 Data_Tuning_FirstLevel）
    // --- 第三波：戒备与换位（docs/Data_EnemyAi.md §15）------------------------
    /**
     * 「这个人现在该戒备」。**由 Think 每 0.1 s 写一次，`ApplyScriptDefense` 每帧读**——
     * 后者被 `Script_FirstLevelP012ActorTest` 抽进纯 JS 沙箱重放，里面没有 WATCH 表也
     * 没有 ALERT_ORDER，所以那段代码只许读这个布尔，不许自己判警戒级别。
     */
    this.watchAlerted = false;
    this.watchYaw = NaN;         // 戒备时面向哪儿（NaN = 没有意见，保持当前朝向）
    this.watchUntil = -99;       // 这个朝向的有效期（Act 过期就不再接管转向）
    this.watchScanAt = -99;      // 上一次把扫视方向扳过去的时刻
    this.watchScanSign = 0;      // 扫视偏哪边：0 正对 / ±1 偏一侧（每 scanIntervalS 换一次）
    this.displaceX = 0;          // 换位落点（跪射之后侧向挪 2–4 m）
    this.displaceZ = 0;
    this.displaceUntil = -99;    // 这次换位的超时时刻（走不到就放弃，下一拍重算）
    this.displaceAt = -99;       // 上一次**发起**换位的时刻（displaceMinDwellS 限流）
    this.displaceFireSeq = 0;    // 发起换位那一刻的 fireSequence（数「打了几发」）
    this.displaceProne = false;  // 这次换位是匍匐后退（压制高）还是站着侧挪
    // 不能只给 Actor 一个持续 0.12 s 的 firing 布尔。500 rpm 机枪恰好每 0.12 s
    // 一发，布尔会从第一发起一直为 true，人物后坐只触发一次。序号让每发都有边沿。
    this.fireSequence = 0;
    this.director = null;       // AiDirector.Spawn 填上，Kill 时用它发阵亡事件
  }

  get alive() { return this.state !== STATE.DEAD; }

  /**
   * @param {THREE.Vector3|null} direction 中弹方向
   * @param {{limbs:string[], kind?:string, point?:THREE.Vector3}|null} sever
   *   TakeHit 里 `gore.Resolve` 的结论。非空表示这一下要卸肢：`actor.Ragdoll`
   *   之后交给 GoreSystem 执行（口径 docs/Data_Dismemberment.md §8.1）。
   */
  Kill(direction, sever = null) {
    if (this.state === STATE.DEAD) return false;
    this.state = STATE.DEAD;
    this.health = 0;
    this.deadTime = 0;
    this.vaultT = -1;
    // 倒下的人身上留下枪和还没打完的桥夹。
    // 缴获的日械**不给备弹**：六五口径我们自己没有补给线，捡了三八式就只有
    // 枪里那五发。这既是史实，也正好是"捡枪"不至于破坏弹药经济的天然闸门。
    this.drop = {
      weaponId: this.weaponId,
      // 武器外观也属于这具尸体的战利品。大刀不是两把数值不同的武器，
      // 但捡走 A 式后不该无缘无故变成 B 式。
      weaponVariant: this.actor?.weaponVariant ?? 0,
      clips: this.side === "ija" ? 0 : Math.floor(this.rnd() * 3),
      taken: false,
    };
    if (this.actor) this.actor.Ragdoll(direction || new THREE.Vector3(0, 0, 1));
    // 断肢排在 Ragdoll **之后**：倒地姿态由 Actor.PoseRagdoll 管，被卸掉的骨头照常动，
    // 只是身上没有那一段三角形了（逐关节 ragdoll 不做，见 §1）。
    // **断肢层是死亡链上的旁支，不是主干。** 一个几何 bug 绝不能让敌人打不死、
    // 或者让扣票丢失：抛出来就当「这一下没断」，deathPush / NotifyDeath / Bark 照常走完。
    let severed = 0;
    if (sever?.limbs?.length) {
      try {
        const gore = this.director?.ctx?.gore;
        severed = gore?.Sever?.(this, sever.limbs, {
          direction, kind: sever.kind, point: sever.point,
        })?.length || 0;
      } catch (error) {
        console.warn("[Gore] Sever 抛错，这一下按不断处理：", error);
        severed = 0;
      }
    }
    // 中弹的方向 × 一点力度，交给尸体刚体当初速度（见 AiDirector.StepCorpse）。
    // 不给的话人是"原地融化"；给太大就成了被炮弹掀飞，1.6 m/s 大约是踉跄一步。
    // 真的被卸掉肢体的那一下再乘一档：那是近炸/重机枪，人要多退半步。
    if (direction) {
      const push = 1.6 * (severed ? GORE_DEATH_PUSH_SCALE : 1);
      this.deathPush = {
        x: direction.x * push,
        y: 0.6,
        z: direction.z * push,
      };
    }
    // 阵亡事件从这里出，是**唯一**的一条路。
    // 以前扣票分散在三处（Combat.Blast 的 onKill、Main.TryFire、Main.DoMelee），
    // 结果是：日军炮弹炸死中国兵扣日方的票，玩家亲手打死人扣两票。
    this.director?.ctx?.vfx?.CorpseBlood?.(this.actor);
    if (this.director) this.director.NotifyDeath(this);
    // 倒下的那一声是**旁边的人**喊的（「班长！班长！」），所以位置取阵亡处、
    // 但语气归活人。这一条比"死人自己惨叫"更接近战场，也更不容易滥。
    const A2 = this.director && this.director.ctx && this.director.ctx.audio;
    if (A2) {
      A2.Bark("hurt", { position: this.position.clone(), seed: (this.id | 0) + 7, side: this.side });
    }
    return true;
  }

  /**
   * @param {number} damage
   * @param {"head"|"torso"|string} part
   * @param {THREE.Vector3|null} direction
   * @param {{kind?:string, shapeId?:string, weaponId?:string, mode?:string,
   *          falloff?:number, point?:THREE.Vector3}} [info]
   *   这一下**是什么打的**。断肢判定要它（docs/Data_Dismemberment.md §8.2）；
   *   不给就退回 bullet，行为与接线之前一致。
   */
  TakeHit(damage, part, direction, info = {}) {
    if (!this.alive) return false;
    const mult = part === "head" ? 3.2 : part === "torso" ? 1.0 : 0.6;
    this.health -= damage * mult;
    // Opt-in narrative cast protection; explicit scripted Kill remains authoritative.
    if (this.scriptEssential) this.health = Math.max(1, this.health);
    this.suppression = Clamp01(this.suppression + 0.45);
    // 中弹踉跄：擦一下也晃，一发三八式基本满幅。以前这条从没接过线 —— 打中活人只有一团血。
    this.hurtPose = Math.min(1, Math.max(this.hurtPose, HURT_FLINCH.base + (damage * mult) / HURT_FLINCH.damageDiv));
    // 断肢判定排在「死没死」**之前**：近炸这一类未致死也可能卸肢，而卸掉一段
    // 肢体本身就把这一发抬成致死（规则层的 forceKill）。判定只发生一次，
    // 结论交给 Kill 去执行 —— 视觉层不在这条链上做第二次骰子。
    // 叙事保护的角色整条链都不进（forceKill 会绕过上面那道钳 1 的闸）。
    // 与 Kill 里那一层同一条理由：判定抛错就按「不断」处理，伤害链照常走完。
    const gore = this.scriptEssential ? null : this.director?.ctx?.gore;
    let sever = null;
    try {
      sever = gore?.Resolve?.(this, {
        part, shapeId: info.shapeId, kind: info.kind || "bullet", weaponId: info.weaponId,
        mode: info.mode, falloff: info.falloff, point: info.point,
        damage: damage * mult, wouldDie: this.health <= 0,
      }) || null;
    } catch (error) {
      console.warn("[Gore] Resolve 抛错，这一下按不断处理：", error);
      sever = null;
    }
    if (sever?.forceKill) this.health = 0;
    if (this.health <= 0) return this.Kill(direction, sever);
    // 中弹没死会喊。中日两侧各喊各的语言（side 由 Bark 侧过滤声库）。
    // 节流在引擎侧（全局 0.55 s / 同阵营同类 4.5 s）。
    const A = this.director && this.director.ctx && this.director.ctx.audio;
    if (A) {
      A.Bark("hurt", { position: this.position.clone(), seed: this.id | 0, side: this.side });
    }
    return false;
  }
}

export class AiDirector {
  /**
   * @param {object} ctx { battlefield, actorFactory, scene, vfx, audio, player }
   */
  constructor(ctx, { maxAlive = 56, seed = 1938, insideWalls = null } = {}) {
    this.ctx = ctx;
    this.soldiers = [];
    this.maxAlive = maxAlive;
    /**
     * 城墙以内的可站矩形。**任何一侧的兵都不许被放到墙外去。**
     *
     * 这条不变量是实跑逼出来的，而且两边都犯：日方补兵的落点算式把人扔到北寨墙北面
     * （独立复核实测 86%），而中方守中正门的人 —— 那个点圆心 z=-178、半径 26，
     * 圆边压到 z=-204，而北寨墙在 z=-190 —— 被 FindOpenSpot 撒到了 z=-192，
     * 也就是墙的**另一面**。停摆时刻的取证：163 对 40 m 内的敌我里通视 0 对，
     * 挡住的 60 条射线里 32 条 tag=rampart、28 条 tag=wall，最近的一对相距 3.9 m
     * 而中间隔着 0.6 m 处一堵 4 m 高的寨墙；那一带 200 条 30 m 射线只有 1 条是通的。
     * 两军隔着城墙贴脸站了三分钟，谁也看不见谁 —— 这就是「打一分半就停摆」。
     *
     * 修在这里而不是修在每一处撒兵的地方：撒兵有五条路径（守点、补兵、近身班组、
     * 玩家重生、软约束重设目标），漏掉任何一条这个洞就还在。
     */
    this.insideWalls = insideWalls;
    /**
     * 发现距离的全局倍率（见 SIGHT_SCALE_RANGE 的注释）。1 = 原样。
     * 唯一的写入者是第四关的照明弹；**换关/复活时一定要还原成 1**，
     * 否则下一关一进去满场就互相看得见。
     */
    this.sightScale = 1;
    this.rnd = Mulberry32(seed);
    this.tickIndex = 0;
    this.time = 0;
    this.tmpA = new THREE.Vector3();
    // 打玩家的部位几何（PlayerHitPart）用的临时量；boxes 复用一份，每发不产垃圾。
    this.tmpAim = { x: 0, y: 0, z: 0 };
    this.tmpU = new THREE.Vector3(); this.tmpW = new THREE.Vector3();
    this.tmpT = new THREE.Vector3(); this.tmpD = new THREE.Vector3();
    this.playerBoxes = [];
    this.tmpB = new THREE.Vector3();
    this.tmpC = new THREE.Vector3();
    // PlayerHitPart 的散点方向（**不许再借 tmpD**，那是 Act 的 desired）、
    // 曳光终点、枪口世界坐标：三个都只在 TryFire 里活一发的时间。
    this.tmpHit = new THREE.Vector3();
    this.tmpEnd = new THREE.Vector3();
    this.tmpMuzzle = new THREE.Vector3();
    this.playerTargetedBy = 0;
    // 本帧有多少人把玩家当目标。上限见 COMBAT.maxShootersOnPlayer ——
    // 没有这个闸门，一条街上的人会全部焊死玩家一个，出生点 27 m 上九支枪
    // 同时开火，三秒必死，而且玩家完全不知道自己做错了什么。
    this.playerTargetedBy = 0;
    // desired 必须有**自己**的向量。事故：Act 里写 desired = this.tmpA.set(cover)，
    // 紧接着 TryFire 也拿 tmpA 当枪口起点 —— desired 是引用，被就地改成了枪口位置，
    // 于是 d < 1.2、moveSpeed = 0：找掩体和白刃冲锋两条移动路径全是空转。
    this.tmpD = new THREE.Vector3();
    this.navOut = { x: 0, z: 0 };   // 导航场给出来的那一步方向
    this.fireCount = 0;                       // 全场 AI 开火累计，通关冒烟靠它取证
    this.vaultCount = 0;                      // 全场 AI 翻越累计，同上
    this.deaths = { nra: 0, ija: 0 };
    this.frontObjective = { nra: null, ija: null };
    // 每一侧的兵力重心。补兵落点要靠它判断"哪一侧是自己人的后方" ——
    // 第 1 批直接写 front.z - 30（假定日军永远在北面），前线一旦是北面的中正门
    // 就把补兵扔到 z=-208…-238，也就是北寨墙**外面**，那批人这辈子进不了城。
    this.centroid = { nra: null, ija: null };
    this.frontTimer = 0;
    this.spawnSerial = { nra: 0, ija: 0 };
    this.squadCenters = new Map();
    // 取最近三个敌人的固定槽位。每次 Think 现造数组会在 70 人规模下产生可观的 GC。
    // `visible / moving / firingRecently` 是感知层要的三个字段：**visible 不给就当被挡住**
    // （Script_AiPerception 头注偏离 b），漏填不会静默退回旧的全知行为。
    this.nearSlots = [
      { ref: null, isPlayer: false, id: 0, dist: 1e9, stance: 0, position: null,
        visible: false, moving: false, firingRecently: false },
      { ref: null, isPlayer: false, id: 0, dist: 1e9, stance: 0, position: null,
        visible: false, moving: false, firingRecently: false },
      { ref: null, isPlayer: false, id: 0, dist: 1e9, stance: 0, position: null,
        visible: false, moving: false, firingRecently: false },
    ];
    /** Sense 要的稠密候选数组（只放有 ref 的槽，长度每拍重写，不新建）。 */
    this.senseCandidates = [];

    // ---------------------------------------------------------------- 四件基建
    // 宿主回调：四个模块共用同一份形状（docs/Data_EnemyAi.md §3）。
    // **射线只认静态世界**：Script_Physics 的默认 `IG_RAY_WORLD` 是
    // `InteractionGroups(QUERY, WORLD)`，人物胶囊是 `IG_CHARACTER`，射手与目标自己的
    // 碰撞体都不在里面；`terrain` 默认 false，所以田坎、河堤也不挡视线 ——
    // 与 `HasLineOfSight` 用的是同一条判据，暴露采样不会跟通视各说各话。
    this._hostFrom = new THREE.Vector3();
    this._hostDir = new THREE.Vector3();
    this._hostTo = new THREE.Vector3();
    const host = {
      Time: () => this.time,
      Rnd: () => this.rnd(),
      Raycast: (from, dir, maxDist) => {
        const bf = this.ctx.battlefield;
        if (!bf || typeof bf.Raycast !== "function") return null;
        // 模块给的是普通对象，battlefield 只读 .x/.y/.z —— 但 Rapier 那一侧要
        // 的是能直接取分量的量，拷进复用向量最稳（也让将来换实现不必再查一遍）。
        this._hostFrom.set(from.x, from.y, from.z);
        this._hostDir.set(dir.x, dir.y, dir.z);
        return bf.Raycast(this._hostFrom, this._hostDir, maxDist);
      },
      BlocksSight: (from, to) => {
        const blocks = this.ctx.BlocksSight;
        if (typeof blocks !== "function") return false;
        this._hostFrom.set(from.x, from.y, from.z);
        this._hostTo.set(to.x, to.y, to.z);
        return blocks(this._hostFrom, this._hostTo) === true;
      },
      GroundHeight: (x, z) => (this.ctx.battlefield ? this.ctx.battlefield.GroundHeight(x, z) : 0),
      Walkable: (x, z) => (this.ctx.nav ? this.ctx.nav.Walkable(x, z) !== false : true),
      Steer: (x, z, tx, tz, out) => (this.ctx.nav
        ? this.ctx.nav.Steer(x, z, tx, tz, out) : false),
      // 照明弹倍率的唯一入口。感知层不再自己乘一次（Script_AiPerception 硬约束 3）。
      SightRange: (stance) => this.SightRange(stance),
      StanceEye: (stance, subject) => AiDirector.StanceEye(stance, subject),
    };
    this.aiHost = host;
    this.perception = new PerceptionModel(host);
    this.covers = new CoverRegistry(this.ctx.battlefield?.covers || [], host);
    /** `battlefield.covers` 换了引用（Destruction filter 之后）就重建注册表。 */
    this.coversSource = this.ctx.battlefield?.covers || null;
    this.shooting = new ShootingModel(host);
    this.tactics = new TacticsDirector(host, this.covers);
    /** 掩体查询的复用出参（Query 返回的是复用槽，必须当场拷出来）。 */
    this._coverThreat = { x: 0, y: 0, z: 0, stance: 0, id: null };
    this._coverThreats = [this._coverThreat];
    this._coverOpts = {
      radiusM: COVER.defaultRadiusM, maxCandidates: COVER.maxCandidates,
      maxValidate: COVER.maxValidate, soldierId: null, suppression: 0,
      allies: null, minAllySpacingM: COVER.minAllySpacingM,
      towardX: NaN, towardZ: NaN,
    };
    this._coverAllies = [];
    /** TryFire 的复用容器：友军躯干（射击走廊）、枪口、瞄点。 */
    this._fireAllies = [];
    this._muzzleWorld = { x: 0, y: 0, z: 0 };
    this._aimPoint = { x: 0, y: 0, z: 0 };
    this._lkpPoint = { x: 0, y: 0, z: 0 };
    /** 玩家在原地钉了多久（投弹判据用；玩家没有 soldier.cover 可查）。 */
    this.playerStationaryS = 0;
    /** 取证计数：压制射击发数、掩体重选次数、投弹数（Debug.Ai 与验收探针读）。 */
    // `displaces` 是 §15 的取证口：跪射之后**真的换了几次位**。没有它，
    // 「前沿不再钉在原地」只能靠位移差分间接推断，而位移差分里混着跃进与走向掩体。
    this.stats = { suppressShots: 0, aimedShots: 0, coverPicks: 0, grenades: 0, peeks: 0, displaces: 0 };
  }

  /**
   * 全场刺激上报口（装配层调：玩家开枪、AI 开枪、爆炸）。
   *
   * 距离预筛在 `PerceptionModel.Hear` 里做（比平方，绝大多数听者在那一行被弹掉），
   * 所以这里把全场数组直接交出去即可。`side` 是**声源那一方** —— 同阵营的枪声不写敌情。
   *
   * @param {string} kind "gunshot" | "machinegun" | "explosion" | "footstep" | "bark" | "impact"
   * @param {object} at `{x,y,z}`
   */
  NoteStimulus(kind, at, { side = null, sourceId = null, isPlayer = false, loudnessM, ref = null } = {}) {
    if (!at || !this.perception) return 0;
    // `ref` 是声源那个人（玩家对象 / soldier）。**必须带上**：记忆里没有 ref 的那条
    // Track 只能当一个坐标用，大脑没法把它接回成一个目标 —— 表现就是
    // 「听见背后一枪，人站在原地不动」（那正是 §2.1 要修的病根）。
    return this.perception.Hear({
      kind, x: at.x, y: at.y ?? 0, z: at.z, side, sourceId, isPlayer,
      time: this.time, loudnessM, ref,
    }, this.soldiers);
  }

  get aliveCount() { return this.soldiers.reduce((n, s) => n + (s.alive ? 1 : 0), 0); }
  CountSide(side) { return this.soldiers.filter((s) => s.side === side && s.alive).length; }

  /** 把一个点夹进城墙以内。没配 insideWalls 时是恒等变换。 */
  ClampInside(point) {
    const w = this.insideWalls;
    if (!w) return point;
    point.x = Clamp(point.x, w.minX, w.maxX);
    point.z = Clamp(point.z, w.minZ, w.maxZ);
    return point;
  }

  Spawn(side, x, z, options = {}) {
    if (this.aliveCount >= this.maxAlive) return null;
    /**
     * 阵地火力是**战位**，不是可以反复填的补充兵：一挺九二式就是一挺。
     *
     * 取证（phase=2 / quality=medium / scale=medium，三百秒不动手）：装配层每三秒
     * 补一次兵，而重机枪那一段没有存量检查 —— 三百秒后 70 人上限里 **39 个**是
     * `order="hold"` 的重机枪手，堆在 (541,-78) / (561,-75) / (563,-68) 等四五个点上，
     * 全部 spd=0、tgt=false、最近的敌人 52–113 m 外，一枪没开。人口预算被它们吃光，
     * 真正要打的攻方步兵（ijaTarget 40）与守军（nraTarget 29）根本挤不进来，
     * 于是每 20 s 的开火数一路衰减成 46/18/14/51/14/12/12/3/3/0/2/2/0/0/0。
     *
     * 判据用 `WEAPONS[...].emplaced`（Data_Weapons 里早就写着、一直没人读的那个字段），
     * 不用 squadId 的字符串前缀 —— 前缀是装配层的命名习惯，改个名字这条闸门就没了。
     * 战位空出来（枪手阵亡）之后下一次补兵会重新填人，这正是「重新架枪」该有的样子。
     *
     * 为什么修在这里而不是修在撒兵的地方：AiDirector 是人口预算与编队的唯一主人，
     * 撒兵路径有五条（守点、补兵、近身班组、玩家重生、软约束重设目标），
     * 任何一条把同一个战位再填一次，这个洞就还在。
     */
    const emplacementId = (options.squadId && WEAPONS[options.weapon]?.emplaced)
      ? `${side}_${options.squadId}` : null;
    if (emplacementId && this.soldiers.some((candidate) => candidate.alive
      && candidate.emplacementId === emplacementId)) return null;
    const w = this.insideWalls;
    if (w) { x = Clamp(x, w.minX, w.maxX); z = Clamp(z, w.minZ, w.maxZ); }
    // 走不到的口袋里不许生人：三个占领点的圆心在封闭院落里，守军撒进去之后
    // 攻方永远够不着，双方隔着一堵墙站到天亮（见 NavGrid.InMain 的账）。
    const nav = this.ctx.nav;
    if (nav && !nav.InMain(x, z)) {
      nav.SnapToMain(x, z, this.navOut);
      x = this.navOut.x; z = this.navOut.z;
    }
    // 撒兵点来自关卡数据与随机数，它并不知道那儿正好是一堵院墙。
    // 埋进墙里的人再也走不出来（运动学角色控制器没有脱困能力），
    // 所以放人之前先问一句「这儿站得下吗」。
    const physics = this.ctx.physics;
    const soldier = new Soldier(side, { ...options, x, z });
    soldier.unarmed = options.unarmed === true || options.actorKind === "civilian";
    const kind = options.actorKind || (side === "nra" ? (options.towel ? "nraDare" : "nra") : "ija");
    // Child geometry is seeded by ActorFactory. Resolve it before any physical
    // placement so free-space tests, initial capsule and later stance agree.
    soldier.actor = this.ctx.actorFactory.Create(kind, {
      seed: soldier.id * 131 + 7,
      weapon: soldier.unarmed ? null : soldier.weaponId,
      variant: options.actorVariant,
      modelVariant: options.modelVariant,
    });
    this.ctx.onActorSpawn?.(soldier);
    if (kind === "civilian" && ["childBoy", "childGirl"].includes(options.actorVariant)
      && soldier.actor.isChild && Number.isFinite(soldier.actor.height) && soldier.actor.height > 0
      && Number.isFinite(soldier.actor.bodyRadius) && soldier.actor.bodyRadius > 0) {
      soldier.childCapsules = CAPSULE.map(cap => {
        const height = soldier.actor.height * cap.height / CAPSULE[0].height;
        // Rapier's minimum capsule half-segment is .02; keep actual total
        // height equal to the requested child posture, including prone.
        return { radius: Math.min(soldier.actor.bodyRadius * cap.radius / CAPSULE[0].radius,
          height * .5 - .02), height };
      });
    }
    const standingCapsule = soldier.childCapsules?.[0] || CAPSULE[0];
    let y;
    if (physics) {
      const free = physics.FindFreeSpot(x, z, standingCapsule.radius, standingCapsule.height);
      x = free.x; z = free.z; y = free.y;
    } else {
      y = this.ctx.battlefield.GroundHeight(x, z);
    }
    soldier.position.x = x; soldier.position.z = z;
    if (soldier.goal) { soldier.goal.x = x; soldier.goal.z = z; }
    soldier.scriptedNoncombatant = options.scriptedNoncombatant === true;
    soldier.escortRole = options.escortRole || null;
    const serial = this.spawnSerial[side]++;
    const explicitSquadId = typeof options.squadId === "string" && options.squadId
      ? `${side}_${options.squadId}` : null;
    let assignedSquadId = explicitSquadId;
    if (assignedSquadId) {
      let overflow = 1;
      while (this.soldiers.filter((candidate) => candidate.alive
        && candidate.squadId === assignedSquadId).length >= SQUAD.size) {
        assignedSquadId = `${explicitSquadId}_${overflow}`;
        overflow += 1;
      }
    }
    let slot = serial % SQUAD.size;
    if (assignedSquadId) {
      const used = new Set(this.soldiers
        .filter((candidate) => candidate.alive && candidate.squadId === assignedSquadId)
        .map((candidate) => candidate.squadSlot));
      slot = SQUAD.slots.findIndex((_, index) => !used.has(index));
      if (slot < 0) slot = serial % SQUAD.size;
    }
    const slotSpec = SQUAD.slots[slot];
    soldier.squadId = assignedSquadId || `${side}_${Math.floor(serial / SQUAD.size)}`;
    soldier.squadSlot = slot;
    // 战位登记必须用**改名前**的那个 id（assignedSquadId 可能已被改成 `..._1`）
    soldier.emplacementId = emplacementId;
    // 真正的轻机枪手永远承担掩护，不会因为出生序号恰好落在突击位就抱着机枪冲刺。
    soldier.tacticalRole = soldier.weapon.rpm ? "support" : slotSpec.role;
    soldier.position.y = y;
    if (physics) {
      soldier.body = physics.MakeCharacter({
        radius: standingCapsule.radius, height: standingCapsule.height, position: soldier.position,
      });
    }
    soldier.actorKind = soldier.actor.kind || kind;
    soldier.actorVariant = soldier.actor.variant || null;
    if (soldier.unarmed) soldier.tacticalRole = "noncombatant";
    soldier.director = this;
    if (options.towel) { soldier.towel = true; soldier.actor.SetTowel(true); }
    soldier.actor.root.position.copy(soldier.position);
    this.ctx.scene.add(soldier.actor.root);
    this.soldiers.push(soldier);
    return soldier;
  }

  Remove(soldier) {
    // 出场也要把手上的东西交回去（阵亡走 NotifyDeath，撤场走这里）。
    // 漏一样就会有「掩体永远有人占」「令牌被一个已经不在场上的人握着」这类
    // 不报错的慢性病 —— 换关时全场撤场，一次能漏掉几十个名额。
    this.ReleaseCover(soldier);
    this.tactics.ReleaseToken(soldier.id);
    this.tactics.ReleaseTokensForTarget(soldier.id);
    this.perception.ForgetAll(soldier);
    soldier.task = null;
    if (soldier.body) { soldier.body.Remove(); soldier.body = null; }
    if (soldier.corpse) {
      if (this.ctx.physics) this.ctx.physics.RemoveBody(soldier.corpse);
      soldier.corpse = null;
    }
    if (soldier.heatSmoke) { this.ctx.vfx?.RemoveSmokeSource(soldier.heatSmoke); soldier.heatSmoke = 0; }
    // 断肢**必须在 actor.Dispose 之前**收回：身体几何是「共享属性 + 私有 index」，
    // 不还原的话这具 rig 回到对象池后，下一个从池子里出生的兵天生缺一条胳膊。
    if (soldier.gore) this.ctx.gore?.ReleaseSoldier?.(soldier);
    const i = this.soldiers.indexOf(soldier);
    if (i >= 0) this.soldiers.splice(i, 1);
    if (soldier.actor) {
      this.ctx.scene.remove(soldier.actor.root);
      soldier.actor.Dispose();
      soldier.actor = null;
    }
  }

  /**
   * 阵亡事件。票池 = 兵力池，所以「谁死了扣谁的票」必须由这一条统一发。
   * 装配层（Script_Main）挂 ctx.onSoldierDeath(side, soldier) 收。
   */
  NotifyDeath(soldier) {
    this.deaths[soldier.side] = (this.deaths[soldier.side] || 0) + 1;
    // 死人要**把手上的东西全部交出去**：占着的掩体、攻击令牌、班组任务、记忆。
    // 漏一样就会出现「掩体永远有人占」「令牌上限被尸体占满」这类不报错的慢性病。
    this.ReleaseCover(soldier);
    this.tactics.ReleaseToken(soldier.id);
    this.tactics.ReleaseTokensForTarget(soldier.id);
    this.perception.ForgetAll(soldier);
    soldier.task = null;
    soldier.target = null;
    soldier.targetVisible = false;
    if (this.ctx.onSoldierDeath) this.ctx.onSoldierDeath(soldier.side, soldier);
  }

  /**
   * 当前任务链上的推进路标。
   *
   * 滕县是线性路标链，owner 恒为 nra；拿 owner 当筛选条件会把已走过、还没走到的
   * 所有点都当成「敌方点」，每个人再各挑一个最近的，整班自然往八个方向散。
   * 两边都以第一个未完成路标为会合方向：友军向任务推进，前方日军向同一处压来。
   */
  CurrentMissionObjective() {
    const list = this.ctx.battlefield?.objectives;
    if (!list || !list.length) return null;
    return list.find((objective) => !objective.reached) || list[list.length - 1];
  }

  /** 每秒汇总两侧重心与当前任务路标；随后统一更新小队意图。 */
  UpdateFront() {
    // 掩体表被炸掉一段之后 `Script_Destruction` 会**换掉整个数组**（filter 出新的一份），
    // 所以按引用比就能认出来。旧表里那些贴在洞口上的点必须作废 ——
    // 不重建的话人会蹲在一堵已经不存在的墙后面。
    const covers = this.ctx.battlefield?.covers;
    if (covers && covers !== this.coversSource) {
      this.coversSource = covers;
      this.covers.Rebuild(covers);
    }
    const list = this.ctx.battlefield?.objectives;
    if (!list || !list.length) return;
    const mission = this.CurrentMissionObjective();
    for (const side of ["nra", "ija"]) {
      let cx = 0, cz = 0, n = 0;
      for (const s of this.soldiers) {
        if (s.side !== side || !s.alive) continue;
        cx += s.position.x; cz += s.position.z; n += 1;
      }
      if (!n) { this.frontObjective[side] = null; this.centroid[side] = null; continue; }
      cx /= n; cz /= n;
      if (this.centroid[side]) { this.centroid[side].x = cx; this.centroid[side].z = cz; }
      else this.centroid[side] = { x: cx, z: cz };
      this.frontObjective[side] = mission;
    }
    this.UpdateSquads();
  }

  /**
   * 每秒给每个战斗组做一次真正的「队级意图」。
   *
   * 旧版虽然给人写了 squadId，却仍是每名士兵各自挑目标、各自把 goal 摆到几百米外
   * 的终点；导航场在街口给六个人不同答案时，画面仍是一群散兵乱走。现在先由全队
   * 共享一个焦点和方向，再把滚动队形锚放到前方 22 m：
   *   · 92 m 内有敌人：锁住最近敌情至少四秒，全队朝该方向压；
   *   · 没有近敌：朝当前第一个未完成任务路标推进；
   *   · 守点与玩家手动命令不被自动意图覆盖。
   */
  UpdateSquads() {
    const previous = this.squadCenters;
    const groups = new Map();
    for (const s of this.soldiers) {
      if (!s.alive) continue;
      let group = groups.get(s.squadId);
      if (!group) {
        const old = previous.get(s.squadId);
        group = {
          id: s.squadId, side: s.side, x: 0, z: 0, count: 0, members: [],
          forwardX: old?.forwardX ?? 0,
          forwardZ: old?.forwardZ ?? 0,
          focusKind: old?.focusKind ?? "none",
          focusId: old?.focusId ?? null,
          focusX: old?.focusX ?? s.position.x,
          focusZ: old?.focusZ ?? s.position.z - 1,
          focusUntil: old?.focusUntil ?? -99,
        };
        groups.set(s.squadId, group);
      }
      group.x += s.position.x;
      group.z += s.position.z;
      group.count += 1;
      group.members.push(s);
    }

    const player = this.ctx.player;
    const mission = this.CurrentMissionObjective();
    for (const group of groups.values()) {
      group.x /= group.count;
      group.z /= group.count;

      // 最近敌情由小队统一看：一个人接敌，旁边五个人不应继续各走各的。
      let nearest = null;
      let nearestD = SQUAD.enemyFocusM;
      const enemySide = group.side === "nra" ? "ija" : "nra";
      for (const other of this.soldiers) {
        if (!other.alive || other.side !== enemySide) continue;
        const d = Math.hypot(other.position.x - group.x, other.position.z - group.z);
        if (d < nearestD) {
          nearestD = d;
          nearest = { id: other.id, x: other.position.x, z: other.position.z, ref: other };
        }
      }
      if (group.side === "ija" && player?.Alive && !player.Protected) {
        const d = Math.hypot(player.position.x - group.x, player.position.z - group.z);
        if (d < nearestD) {
          nearestD = d;
          nearest = { id: -1, x: player.position.x, z: player.position.z, ref: player };
        }
      }

      // 已锁住的近敌还活着、还没远到脱离战斗时，距离差不到三成就不换。
      // 这是队级迟滞；否则两名距离相近的敌人会让六把枪一起左右摆。
      let oldEnemy = null;
      if (group.focusKind === "enemy") {
        if (group.focusId === -1 && player?.Alive) {
          oldEnemy = { id: -1, x: player.position.x, z: player.position.z, ref: player };
        } else {
          const ref = this.soldiers.find((candidate) => candidate.id === group.focusId && candidate.alive);
          if (ref) oldEnemy = { id: ref.id, x: ref.position.x, z: ref.position.z, ref };
        }
        if (oldEnemy) {
          oldEnemy.dist = Math.hypot(oldEnemy.x - group.x, oldEnemy.z - group.z);
          if (oldEnemy.dist > SQUAD.enemyFocusM * 1.25) oldEnemy = null;
        }
      }
      if (oldEnemy && (this.time < group.focusUntil || !nearest || oldEnemy.dist <= nearestD * 1.3)) {
        nearest = oldEnemy;
        nearestD = oldEnemy.dist;
      }

      let focus = nearest;
      if (focus) {
        if (group.focusKind !== "enemy" || group.focusId !== focus.id) {
          group.focusUntil = this.time + 4.0;
        }
        group.focusKind = "enemy";
        group.focusId = focus.id;
      } else if (mission) {
        focus = mission;
        group.focusKind = "objective";
        group.focusId = mission.id;
      } else {
        group.focusKind = "none";
        group.focusId = null;
      }

      if (focus) {
        group.focusX = focus.x;
        group.focusZ = focus.z;
        const dx = focus.x - group.x;
        const dz = focus.z - group.z;
        const dist = Math.hypot(dx, dz);
        if (dist > 0.5) {
          const wanted = Math.atan2(dx, dz);
          const hasHeading = Math.hypot(group.forwardX, group.forwardZ) > 0.5;
          const current = hasHeading ? Math.atan2(group.forwardX, group.forwardZ) : wanted;
          const heading = ApproachAngle(current, wanted, SQUAD.turnPerUpdate);
          group.forwardX = Math.sin(heading);
          group.forwardZ = Math.cos(heading);
        }
      }

      for (const s of group.members) {
        s.squadMateCount = group.count - 1;
        s.squadForwardX = group.forwardX;
        s.squadForwardZ = group.forwardZ;
        s.squadFocusKind = group.focusKind;
        s.squadFocusId = group.focusId;
        const autoAdvance = !s.holdZone && s.order === "advance" && this.time >= s.manualGoalUntil;
        if (focus && autoAdvance) this.SetSquadGoal(s, group);
      }

      // 班组战术：每秒给这个班派一次活（压制 / 侧翼 / 跃进 / 投弹 / 撤退 / 守）。
      // **必须排在队形与焦点之后** —— Tactics 吃的就是这里刚算好的 group。
      this.tactics.UpdateSquad(group, player);
    }
    this.squadCenters = groups;
  }

  /**
   * 给滚动锚排一个有前后、左右层次的六人落位。
   * 锚只放到队伍前方一小段，不再把每个人直接拽到几百米外的终点。
   */
  SetSquadGoal(s, group) {
    const slot = SQUAD.slots[s.squadSlot] || SQUAD.slots[2];
    const fx = group.forwardX, fz = group.forwardZ;
    const rx = -fz, rz = fx;
    const focusDist = Math.hypot(group.focusX - group.x, group.focusZ - group.z);
    const lookahead = Math.min(focusDist, group.focusKind === "enemy" ? 14 : SQUAD.lookaheadM);
    const anchorX = group.x + fx * lookahead;
    const anchorZ = group.z + fz * lookahead;
    // 支援位即使序号不是 3，也按掩护纵深站；机枪手不顶到突击手前面。
    const depth = s.tacticalRole === "support" ? Math.max(8, slot.depth) : slot.depth;
    const lateral = slot.lateral + s.laneOffset * 0.18;
    s.goal.set(anchorX + rx * lateral - fx * depth, 0,
      anchorZ + rz * lateral - fz * depth);
    this.ClampInside(s.goal);
  }

  /** 给某一侧下达总目标（占领点）。带横向偏移，避免全班走成一条线。 */
  SetSideGoal(side, x, z) {
    for (const s of this.soldiers) {
      if (s.side !== side || !s.alive) continue;
      if (s.order === "hold" || s.holdZone) continue;
      s.goal.set(x + s.laneOffset, 0, z + s.laneOffset * 0.4);
    }
  }

  /** 派若干人去守一个占领区。进了区就不许再出去。 */
  AssignDefenders(side, objective, count) {
    let n = 0;
    const pool = this.soldiers
      .filter((s) => s.side === side && s.alive && !s.holdZone)
      .sort((a, b) => a.position.distanceTo(objective) - b.position.distanceTo(objective));
    for (const s of pool) {
      if (n >= count) break;
      s.holdZone = objective;
      const a = s.rnd() * Math.PI * 2;
      const r = objective.radius * (0.35 + s.rnd() * 0.55);
      s.goal.set(objective.x + Math.cos(a) * r, 0, objective.z + Math.sin(a) * r);
      this.ClampInside(s.goal);
      n += 1;
    }
    return n;
  }

  /**
   * 玩家给身边的弟兄下命令。
   *
   * flank 与 charge 以前只写了 `s.order = orderId` 就 `n += 1` —— 实跑取证：
   * IssueOrder("charge") 返回 affected=2 但 goalChanged=false，Act() 里也只判
   * `s.order === "hold"`。**这两条命令按下去什么也不会发生。**
   * 上刺刀冲锋对台儿庄是文化上的必做项，不能是一个按下去没反应的键。
   */
  IssueOrder(orderId, origin, aimPoint, radius = 26) {
    let n = 0;
    // 下令要**听得见**。原来命令只改数据不出声，玩家按了 Tab 转轮盘松手，
    // 除了小队开始动之外没有任何反馈 —— 不知道令下没下、下的是哪条。
    // priority: true —— 玩家自己下的令必须响，不能被一街的喊杀挤掉。
    const ORDER_LINE = {
      follow: "rally_follow", advance: "move_go", charge: "rally_charge",
      hold: "rally_hold", spread: "move_flank", flank: "move_flank",
      cover: "move_cover", fire: "rally_shoot",
    };
    if (this.ctx.audio && ORDER_LINE[orderId]) {
      this.ctx.audio.Bark("rally", {
        key: ORDER_LINE[orderId], position: origin ? origin.clone() : null,
        priority: true, volume: 1.1,
      });
    }
    // 绕行要分左右两半，所以先算一条从下令者指向瞄点的法线
    let px = 0, pz = 0;
    if (aimPoint) {
      const dx = aimPoint.x - origin.x, dz = aimPoint.z - origin.z;
      const len = Math.hypot(dx, dz) || 1;
      px = -dz / len; pz = dx / len;
    }
    for (const s of this.soldiers) {
      if (s.side !== "nra" || !s.alive) continue;
      if (s.position.distanceTo(origin) > radius) continue;
      s.order = orderId;
      // 玩家明确点出的推进点保留三十秒；队级任务 fallback 不能下一秒就把它盖掉。
      if (orderId === "advance") s.manualGoalUntil = this.time + 30;
      if (orderId === "follow") s.goal.copy(origin);
      else if (orderId === "advance" && aimPoint) s.goal.copy(aimPoint);
      else if (orderId === "hold") s.goal.copy(s.position);
      else if (orderId === "spread") {
        const a = s.rnd() * Math.PI * 2;
        s.goal.set(s.position.x + Math.cos(a) * 7, 0, s.position.z + Math.sin(a) * 7);
      } else if (orderId === "flank" && aimPoint) {
        // 瞄点两侧各 25 m 的绕行点，按序号分半数走左、半数走右。
        // 全班走同一侧等于换个方向正面顶，那就白绕了。
        const side = (n % 2 === 0) ? 1 : -1;
        s.goal.set(aimPoint.x + px * 25 * side, 0, aimPoint.z + pz * 25 * side);
        s.flankUntil = this.time + 30;
        s.holdZone = null;         // 绕行本身就是要出区，不出去就不叫绕
      } else if (orderId === "covert") {
        // 姿态传染（ER2 的 Covert Movements）：全班照班长的姿态走，而且不开枪。
        // P4 夜袭阶段（白毛巾缠上、大刀背身后）几乎是为这条机制生的 ——
        // 在它落地之前，那一关除了换天光与换携行之外，玩法上跟白天没有任何区别。
        s.covertUntil = this.time + 60;
        s.holdZone = null;
        s.target = null;
        s.targetVisible = false;
        s.goal.copy(origin);
      } else if (orderId === "charge") {
        // 白刃冲锋**例外地覆盖守点纪律**：防守时不许离开占领区是对的，
        // 但上刺刀是主动出击，那一刻就是要冲出去。有效期 18 秒，之后归队。
        s.state = STATE.CHARGE;
        s.stance = 0;
        s.bayonetFixed = true;
        s.chargeUntil = this.time + 18;
        s.goal.copy(aimPoint || origin);
      }
      n += 1;
    }
    // 喊杀声只放一次（每个人放一次就是七十条重叠的号音）
    if (orderId === "charge" && n > 0 && this.ctx.audio) {
      this.ctx.audio.Play("bugleCharge", { volume: 0.85 });
    }
    return n;
  }

  Update(dt, camera) {
    this.time += dt;
    if (this.ctx.nav) this.ctx.nav.BeginFrame();
    this.frontTimer -= dt;
    if (this.frontTimer <= 0) { this.frontTimer = 1.0; this.UpdateFront(); }
    this.tickIndex += 1;
    // 重数当前锁着玩家的人。Think 是分帧轮转的，所以按实际 target 重算，
    // 不能每帧清零 —— 清零的话上限只对当帧被 Think 的那六分之一生效。
    this.playerTargetedBy = 0;
    for (const s2 of this.soldiers) {
      // 只数**真的看见他**的人：靠记忆压制射击的不占名额，否则听见一声枪响的三个人
      // 会把射手上限占满，真正看得见的人反而选不上他（那正是旧版集体抽搐的一条源头）。
      if (s2.alive && s2.target?.isPlayer && s2.targetVisible && !s2.targetFromMemory && !s2.missionFireHold) this.playerTargetedBy += 1;
    }
    // 玩家在原地钉了多久。投弹判据（TacticsDirector.ShouldGrenade 的第②条
    //「对方钉在一处」）读它 —— 玩家没有 `soldier.cover` 可查，只能看他挪没挪窝。
    {
      // 「钉在一处」按位移窗口判（BRAIN.stationaryDriftM 那段账）：锚点漂出半径才归零。
      // 用速度判的话，被击退的玩家永远不算钉住，投弹任务一次都派不出去。
      const p = this.ctx.player;
      const pos = p && p.position;
      if (pos) {
        const a = this._playerAnchor || (this._playerAnchor = { x: pos.x, z: pos.z });
        const dx = pos.x - a.x, dz = pos.z - a.z;
        if (dx * dx + dz * dz > BRAIN.stationaryDriftM * BRAIN.stationaryDriftM) {
          a.x = pos.x; a.z = pos.z;
          this.playerStationaryS = 0;
        } else {
          this.playerStationaryS += dt;
        }
      }
    }
    const slice = this.tickIndex % 6;
    const player = this.ctx.player;
    this.UpdateGrenadeThreats();

    for (let i = 0; i < this.soldiers.length; i += 1) {
      const s = this.soldiers[i];
      // 状态切换记一条。放在循环最前面而不是 Think 里：`s.state` 有二十多个赋值点
      // （Think / Act / 换弹 / 翻墙 / 投弹 / Kill 各一处），逐点插桩必漏，
      // 而且 DEAD 那一条根本不走 Think。这里一次比较就盖全，代价是记录晚一帧 ——
      // 对一条 30 秒的时间带无所谓。
      if (s.state !== s.stateLogged) this._LogStateChange(s);
      if (!s.alive) {
        s.deadTime += dt;
        this.StepCorpse(s, dt);
        // 倒地姿势在 0.9 s 时已经收敛，之后只有尸体根节点还会跟着刚体移动；
        // StepCorpse 上面已经单独同步了 root.position，不需要再把四五十个骨骼／
        // 分件从头解算一遍。旧条件只要尸体还在视锥内就会永远 Actor.Update：
        // 中等规模开战十几秒便有十余具近景尸体，每具每帧都重跑一套定格姿势，
        // 144 Hz 下很快跨过 6.9 ms 的整帧门槛，读数就从 144 直接落到 72。
        //
        // 死亡前 0.9 s 仍无条件更新：远景／镜头外的精细层也必须把倒地动作收完，
        // 否则以后走近、从 LOD 切回完整模型时会突然“复活”成站姿。
        // 尸体刚体还在（最多 8 秒，见 StepCorpse）也继续更新 —— 从坟顶滑到平地的
        // 途中肢体下垂量在变，姿势冻住的话滑到平地后手脚还保持着悬空下垂的角度。
        if (s.actor && (s.deadTime <= 0.9 || s.corpse)) {
          s.actor.Update(dt, { dead: true, dying: Clamp01(s.deadTime / 0.9), elapsed: this.time });
        }
        continue;
      }
      // 「想」分帧轮转：每帧只有六分之一的人重新决策。
      // 木桩兵（s.dummy，见 Soldier 构造器）不想：Act 照走 —— 重力、贴地、
      // 姿态动画、守点纪律都要，只是永远不会有目标、不会开火。
      if (i % 6 === slice && !s.dummy && !s.meleeCombat) this.Think(s, dt * 6, player);
      this.Act(s, dt, player);
    }

    this.CullActors(camera);
  }

  /**
   * 在飞的敌方手榴弹：落在谁的隐蔽位附近，谁就该换个地方（方案 §4.4 末条）。
   *
   * 每帧扫一遍，但**在途投掷物通常是 0—2 枚**，所以这是一条几乎恒为空的循环；
   * 真有弹的时候才付 O(弹 × 人) 的账。标记只写一个时刻戳，
   * 由 `UpdateCover` 当成「紧急重选」的触发条件（不吃 reselectMinS 限流）。
   */
  UpdateGrenadeThreats() {
    const list = this.ctx.combat && this.ctx.combat.projectiles;
    if (!list || !list.length) return;
    const r2 = BRAIN.grenadeDodgeM * BRAIN.grenadeDodgeM;
    for (let i = 0; i < list.length; i += 1) {
      const p = list[i];
      if (!p.alive || p.fuse <= 0) continue;
      for (let j = 0; j < this.soldiers.length; j += 1) {
        const s = this.soldiers[j];
        if (!s.alive) continue;
        // owner 是 "player" | "nra" | "ija"：只有**不是自己这一方**扔的才算威胁。
        if (p.owner === s.side || (p.owner === "player" && s.side === "nra")) continue;
        const at = s.cover ? s.cover.hidePos : s.position;
        const dx = p.position.x - at.x;
        const dz = p.position.z - at.z;
        if (dx * dx + dz * dz > r2) continue;
        if (this.time - s.grenadeThreatAt > 1) this.Bark(s, "grenade");
        s.grenadeThreatAt = this.time;
      }
    }
  }

  /**
   * 只剔除真正落在镜头视锥外的人。视锥内不分阵营、不分生死、不设数量名额；
   * 只按投影尺寸近似值（距离）选完整 Actor / 合批远景层。
   */
  CullActors(camera) {
    if (!camera) return;
    // 视图矩阵自己从 matrixWorld 求，**不要用 camera.matrixWorldInverse** ——
    // 那个只在 renderer.render() 里更新，剔除跑在逻辑帧里，读到的是上一帧的机位。
    // 平时差一帧看不出来，换关/过场刚把相机瞬移过去的那一帧就是整批人闪一下。
    camera.updateMatrixWorld();
    _cullMatrix.copy(camera.matrixWorld).invert().premultiply(camera.projectionMatrix);
    _cullFrustum.setFromProjectionMatrix(_cullMatrix);
    const crowd = this._Crowd();
    if (crowd) crowd.Begin();
    for (const s of this.soldiers) {
      if (!s.actor) continue;
      // 包围球取胸口高度：脚下那个点在贴地俯视时会掉出视锥，人整个闪掉
      _cullSphere.center.set(s.position.x, s.position.y + 0.9, s.position.z);
      if (!_cullFrustum.intersectsSphere(_cullSphere)) {
        this._SetDetailedAttached(s.actor, false);
        s.actor.allowFootIk = false;
        s.renderLod = "culled";
        continue;
      }
      const distanceSq = s.position.distanceToSquared(camera.position);
      s.actor.renderDistanceSq = distanceSq;
      s.actor.allowFootIk = distanceSq <= ACTOR_DETAIL.footIkM ** 2;
      s.actor.SetShadowEnabled(distanceSq <= ACTOR_DETAIL.shadowM ** 2);
      const settledCorpse = !s.alive && s.deadTime >= 0.9;
      // 远景层里的尸体有距离上限（ACTOR_DETAIL.corpseCrowdMaxM 那段账）；活人没有。
      if (settledCorpse && distanceSq > ACTOR_DETAIL.corpseCrowdMaxM * ACTOR_DETAIL.corpseCrowdMaxM) {
        this._SetDetailedAttached(s.actor, false);
        s.actor.allowFootIk = false;
        s.renderLod = "culled";
        continue;
      }
      const detailLimit = settledCorpse
        ? (s.renderLod === "detail" ? ACTOR_DETAIL.corpseExitM : ACTOR_DETAIL.corpseEnterM)
        : (s.renderLod === "detail" ? ACTOR_DETAIL.exitM : ACTOR_DETAIL.enterM);
      // 纯逻辑测试没有 scene/factory，没有远景层可以接手时必须回退完整 Actor。
      // **断过肢的人不进远景层**：远景层是按姿势桶烘的整人（见 ActorCrowd 的头注），
      // 换过去等于把卸掉的胳膊长回来 —— 四十米外的尸体会突然肢体齐全。
      // 距离更远时仍按 corpseCrowdMaxM 整个剔除，那一条不受影响。
      const detailed = !crowd || !!s.gore || distanceSq <= detailLimit * detailLimit;
      this._SetDetailedAttached(s.actor, detailed);
      s.renderLod = detailed ? "detail" : "crowd";
      if (!detailed) {
        const prone = Math.max(s.proneBlend ?? 0, s.stance === 2 ? 1 : 0);
        // 姿态与移动信号一并交给远景层，让它挑姿势桶（站 / 跪 / 真卧 / 跑步翻页）。
        // 【为什么补这一条】2026-09-09 实拍：前沿开战 20 s，46—74 m 那一档 31 个日军
        // 里 20 个其实在跪射，画面上却全是站着的 —— 远景层收到的只有「卧不卧」，
        // 蹲和跑一个字都没往下传。玩家说的「远处的敌人干站着」有一半是这一行的账。
        //
        // 跑步翻页的相位交给远景层自己算：**循环时长是它烘焙时从资产量出来的**
        // （RifleRun 实测 1.47 s），这边只给时间与每个人的固定错位（免得整条战线
        // 齐步走）。时间取 AI 自己的 this.time 而不是墙钟 —— 分帧、暂停与
        // StepFrames 重放都跟着同一条时间轴，闸门才可复现。
        crowd.Push(s.actor.kind, s.position, s.yaw ?? 0, s.actor.sizeScale ?? 1, prone, !s.alive,
          { stance: s.stance | 0, moveSpeed: s.moveSpeed ?? 0, crouch: s.crouchBlend ?? 0,
            elapsed: this.time, jitter: s.id * 0.37 });
      }
    }
    if (crowd) crowd.End();
  }

  /**
   * 完整人物进远景 LOD / 屏外时，不只设 invisible，还从场景树摘下整棵分件子树。
   * three 的 updateMatrixWorld 与 projectObject 都会递归 invisible 子树：69 个人约四千
   * 节点，即使画面里只有几个人也曾经每帧全走一遍。远景画面由 ActorCrowd 接手，
   * 逻辑位姿仍写 actor.root；回到近景时挂回同一 scene，本帧统一更新世界矩阵。
   */
  _SetDetailedAttached(actor, detailed) {
    const root = actor?.root;
    if (!root) return;
    const scene = this.ctx.scene;
    root.visible = !!detailed;
    if (!scene) return;
    if (detailed) {
      if (!root.parent) scene.add(root);
    } else if (root.parent === scene) {
      scene.remove(root);
    }
  }

  /**
   * 进关时先把这些 kind 的远景层烘出来（见 ActorCrowd.Prepare）。
   * 装配层的人物着色器预热调它；纯逻辑环境（没有 scene / factory）是空操作。
   */
  PrepareCrowd(kinds = [], cellM = 0) {
    if((this.crowd?.cellM||0)!==cellM){this.crowd?.Dispose();this.crowd=undefined;}
    this.crowdCellM=cellM;
    const crowd = this._Crowd();
    if (crowd) crowd.Prepare(kinds);
    return crowd;
  }

  /** 远景层按需建；纯逻辑环境下一直是 null。 */
  _Crowd() {
    if (this.crowd !== undefined) return this.crowd;
    const { scene, actorFactory } = this.ctx;
    this.crowd = (scene && actorFactory) ? new ActorCrowd(scene, actorFactory,{cellM:this.crowdCellM||0}) : null;
    return this.crowd;
  }

  /** 姿态对应的枪眼高度。站 1.5 / 蹲 1.0 / 卧 0.5 —— 卧倒的人本来就该更难被看见。 */
  static StanceEye(stance, subject = null) {
    const heightScale = (subject?.ref || subject)?.childCapsules?.[0]?.height / CAPSULE[0].height;
    return (stance === 2 ? 0.5 : stance === 1 ? 1.0 : 1.5) * (Number.isFinite(heightScale) ? heightScale : 1);
  }

  /**
   * 某个姿态**现在**的被发现距离。三处判定（玩家、友邻、旧目标复核）共读这一条，
   * 别在调用点各乘各的倍率。
   */
  SightRange(stance) {
    // 下标夹一次而不是写两遍 `SIGHT_BY_STANCE[...] ?? SIGHT_BY_STANCE[0]`：
    // FlareTest 会数这张表被下标读了几次 —— 多一处就是多一条绕过倍率的路。
    // stance 缺失（undefined）按 |0 落到 0 = 站着，与旧写法的 ?? 120 同义。
    return SIGHT_BY_STANCE[Clamp(stance | 0, 0, SIGHT_BY_STANCE.length - 1)] * this.sightScale;
  }

  /**
   * 设发现距离的全局倍率（照明弹的暴露机制）。夹在 SIGHT_SCALE_RANGE 里 ——
   * 一个写错的 0 会让全场瞎掉，一个写错的 50 会让全城一起开火。
   * @returns {number} 夹过之后真正生效的倍率
   */
  SetSightScale(scale) {
    const v = Number(scale);
    this.sightScale = Number.isFinite(v)
      ? Clamp(v, SIGHT_SCALE_RANGE.min, SIGHT_SCALE_RANGE.max) : 1;
    return this.sightScale;
  }

  /** 取证口：Debug.Flare 与 FlareTest 靠它断言「照亮期抬了、熄灭后还回去了」。 */
  SightState() {
    return {
      scale: this.sightScale,
      base: [...SIGHT_BY_STANCE],
      now: SIGHT_BY_STANCE.map((_, i) => this.SightRange(i)),
    };
  }

  /**
   * 卧倒可以立即发生（活命反应），重新起身必须等承诺时间过去。
   * 这道迟滞专门消掉 suppression=0.50、距离=20 m 两侧的站蹲振荡。
   */
  SetStance(s, stance, holdS = 0.9, force = false) {
    if (s.stance === stance) return;
    // 真正需要抢先执行的只有「卧倒」。站→蹲只是射击姿势，仍应尊重上一姿态的承诺；
    // 否则冲锋边界上依旧会站/蹲各抢一次。
    const emergencyDrop = stance === 2 && stance > s.stance;
    if (!force && !emergencyDrop && this.time < s.stanceUntil) return;
    // 从卧倒爬起来的时刻。SUPPRESSED 的 mayProne 按它再武装：刚起身的人
    // 除非压制爆表（emergencyDrop 那档），不许马上再趴回去。
    if (s.stance === 2) s.lastRiseAt = this.time;
    s.stance = stance;
    s.stanceUntil = this.time + holdS;
  }

  /** 换目标只有这一条入口，锁定时长与切换计数都在这里结算。 */
  SetTarget(s, candidate) {
    const same = s.target && (candidate.isPlayer
      ? s.target.isPlayer
      : !s.target.isPlayer && s.target.ref === candidate.ref);
    if (same) {
      s.target.position = candidate.position;
      s.target.stance = candidate.stance;
      s.targetLostTime = 0;
      s.targetVisible = true;
      return false;
    }
    if (s.target) {
      s.targetChanges += 1;
      // 换人就把名额让出来：不还的话上限会被一个已经不打他的人占着，
      // 后面的人一律拿不到令牌、集体转压制射击。
      this.tactics.ReleaseToken(s.id);
    }
    const wasPlayer = !!(s.target && s.target.isPlayer);
    s.target = {
      position: candidate.position, isPlayer: candidate.isPlayer, ref: candidate.ref,
      id: candidate.id, stance: candidate.stance,
    };
    s.targetLostTime = 0;
    s.targetVisible = true;
    s.targetLockUntil = this.time + 3.0 + s.rnd() * 0.8;
    if (candidate.isPlayer && !wasPlayer) s.playerLockAt = this.time;
    return true;
  }

  /**
   * 丢掉当前目标。**只此一条出口** —— 攻击令牌、瞄准状态与目标字段必须一起清，
   * 少清一样就会出现「令牌被一个已经不打他的人占着」，上限一满全班转去压制射击。
   */
  DropTarget(s) {
    if (s.target) this.tactics.ReleaseToken(s.id);
    s.target = null;
    s.targetVisible = false;
    s.targetExposedS = 0;
    s.targetFromMemory = false;
  }

  /** 放掉这个人占的掩体（死亡 / 换关 / 进白刃 / 上战位 / 剧本接管都要走它）。 */
  ReleaseCover(s) {
    if (s.cover) this.covers.Release(s.id);
    s.cover = null;
    s.coverMove = null;
    s.coverPhase = "none";
    s.coverPhaseUntil = -99;
  }

  /**
   * 行为喊话（docs/Data_EnemyAi.md §8）。
   *
   * 中日两套声库各有自己的键名，而 `Audio.Bark` 按 `side` 过滤池子、按 `key` 点名。
   * **没有音频的类静默降级**：`Bark` 找不到 key 时 pool 为空、直接返回 null，
   * 行为一步都不会被挡住（这一条是硬要求：喊话是可读性，不是玩法闸门）。
   */
  Bark(s, kind) {
    const audio = this.ctx.audio;
    if (!audio || typeof audio.Bark !== "function") return null;
    const line = BARK_LINES[kind];
    if (!line) return null;
    const pick = line[s.side] || null;
    if (!pick) return null;
    return audio.Bark(pick.kind, {
      position: s.position.clone(), seed: s.id | 0, side: s.side, key: pick.key,
    });
  }

  /** 把一个候选敌人塞进"最近三个"的槽位里（插入排序，不产生垃圾）。 */
  _PushNear(dist, ref, isPlayer, id, stance, position) {
    const slots = this.nearSlots;
    if (dist >= slots[2].dist) return;
    let i = 2;
    while (i > 0 && dist < slots[i - 1].dist) {
      const dst = slots[i], src = slots[i - 1];
      dst.dist = src.dist; dst.ref = src.ref; dst.isPlayer = src.isPlayer;
      dst.id = src.id; dst.stance = src.stance; dst.position = src.position;
      i -= 1;
    }
    const t = slots[i];
    t.dist = dist; t.ref = ref; t.isPlayer = isPlayer;
    t.id = id; t.stance = stance; t.position = position;
  }

  // ---------------------------------------------------------------- 决策
  InFireSector(s, point) {
    const sector=s.scriptFireSector;
    return !sector || Math.hypot(point.x-s.position.x,point.z-s.position.z)<sector.selfDefenseM ||
      (point.x>=sector.minX&&point.x<=sector.maxX&&point.z>=sector.minZ&&point.z<=sector.maxZ);
  }
  Think(s, dt, player) {
    s.suppression = Math.max(0, s.suppression - COMBAT.suppressDecayPerS * dt);
    // 翻墙翻到一半不做决策：状态机会立刻把 VAULT 打回 advance，人卡在墙头上
    if (s.state === STATE.VAULT) return;

    // Opt-in scene actors follow the host's evacuation goals, never a combat cover/target.
    // Physics, suppression accounting, wounded poses and death remain on the normal path.
    if (s.scriptedNoncombatant) {
      s.target = null; s.targetVisible = false; s.bayonetFixed = false;
      s.state = STATE.ADVANCE; s.aimBlend = 0;
      this.ReleaseCover(s);
      // 【2026-09-09 §15】原来这里每拍 `ForgetAll` —— 听觉刚写进去的记忆立刻被抹掉，
      // 于是村里那批（village / melee 遭遇编成、`missionDormant`）日军在正片打了
      // 二十秒之后警戒**仍然是 unaware**、站得笔直（实拍：>120 m 档 6/6 站立 unaware）。
      // 剧本旗管的是「不许打」，不是「听不见」：`WatchScripted` 走一次空候选的 Sense
      //（不打射线、不建新条目），只让听来的记忆按时间衰减，再给停在原地的武装单位
      // 上一个戒备姿态。目标已经在上面清掉了，所以他仍然一枪都不会开。
      // 写成可缺省调用是因为 `Script_FirstLevelP012ActorTest` 把这段源码抽进纯 JS
      // 沙箱重放，那里没有 AiDirector 实例 —— 缺了就退回原来的 ForgetAll。
      if (this.WatchScripted) this.WatchScripted(s, dt);
      else this.perception.ForgetAll(s);
      return;
    }

    // 找目标：取最近的**三个**敌人，逐个试通视。
    // 只试最近那一个的后果是实跑出来的：一堵院墙就能让整条战线永远没有目标 ——
    // 70 名 AI 每一次采样都是 {advance: 70}，开火计数恒为 0。
    const enemySide = s.side === "nra" ? "ija" : "nra";
    const slots = this.nearSlots;
    for (const slot of slots) {
      slot.dist = 1e9; slot.ref = null; slot.position = null;
      slot.visible = false; slot.moving = false; slot.firingRecently = false;
    }
    // 距离门槛按**目标的姿态**缩放：站着的人一百二十米外就看得见，趴下的四十五米。
    // 这是姿态第一次真的影响"会不会被打"，也是潜行命令能成立的前提。
    // 玩家能不能被选中，取决于三件事：活着、出生保护过了、**已经锁他的人还没到上限**。
    // 最后一条比调命中率管用得多：实测出生点 27 m 上九个人同时开火，
    // 每秒挨四发，三秒必死，而玩家完全不知道自己做错了什么。
    // ER2 的 AI 会分散目标，不会九个人焊死一个人。
    // Authored covering teams may keep observing while their trigger is held.
    // Visibility, sector checks and the real firing-token cap still apply.
    const playerOpen = player && player.Alive && !player.Protected && (s.scriptTrackPlayer || !s.missionFireHold)
      // 已经锁住玩家的人不占「新锁」名额。旧写法达到上限后会把现有三个人也一起
      // 排除，下一次 Think 全部转头找 NPC，再下一次又转回来，正是集体抽搐的一条源头。
      && (s.scriptTrackPlayer || s.target?.isPlayer || this.playerTargetedBy < (COMBAT.maxShootersOnPlayer ?? 3)
        || s.position.distanceTo(player.position) <= CLOSE_RANGE.priorityM);
    if (enemySide === "nra" && playerOpen) {
      const d = s.position.distanceTo(player.position);
      const st = player.stance === "prone" ? 2 : player.stance === "crouch" ? 1 : 0;
      if (d < this.SightRange(st) && this.InFireSector(s,player.position)) {
        this._PushNear(d, player, true, PLAYER_TRACK_ID, st, player.position);
      }
    }
    for (const other of this.soldiers) {
      if (other.side !== enemySide || !other.alive) continue;
      if (!this.InFireSector(s,other.position)) continue;
      const d = s.position.distanceTo(other.position);
      if (d < this.SightRange(other.stance)) {
        this._PushNear(d, other, false, other.id, other.stance, other.position);
      }
    }

    // 通视与「在动 / 刚开过枪」三个字段由这一层填：感知层一条射线都不打
    // （§7 的射线预算分给了掩体验证与暴露采样），它只消费 `candidate.visible`。
    // 不给 visible 一律当被挡住 —— 漏填只会让 AI 变瞎，不会静默恢复成旧的全知。
    const cands = this.senseCandidates;
    let candCount = 0;
    for (const slot of slots) {
      if (!slot.ref) continue;
      slot.visible = this.HasLineOfSight(s, slot);
      if (slot.isPlayer) {
        const v = slot.ref.velocity;
        // Math.hypot 会给剩余参数建数组，热路径一律 sqrt（Script_AiCover 头注同款账）。
        slot.moving = !!v && Math.sqrt(v.x * v.x + v.z * v.z) > BRAIN.movingMps;
        slot.firingRecently = this.time - (slot.ref.lastShotAt ?? -99) < BRAIN.firingRecentS;
      } else {
        slot.moving = slot.ref.moveSpeed > BRAIN.movingSignal;
        slot.firingRecently = this.time - slot.ref.lastFire < BRAIN.firingRecentS;
      }
      cands[candCount] = slot;
      candCount += 1;
    }
    cands.length = candCount;

    // 目标锁迟滞（1.2 s 保持 / 5 s 遗忘 / 0.5 倍距离才换人）已经整段搬进 Sense，
    // 这里不再写第二份（docs/Data_EnemyAi.md §4.1 最后一条）。
    const sense = this.perception.Sense(s, cands, dt);
    const hadTarget = !!s.target;
    let bestDist = sense.dist;
    // **最后目击位置先落地**：下面的「从记忆里把目标接回来」与压制射击都读 `s.lkp`。
    if (sense.lkp) {
      s.lkp = s.lkp || { x: 0, y: 0, z: 0 };
      s.lkp.x = sense.lkp.x; s.lkp.y = sense.lkp.y; s.lkp.z = sense.lkp.z;
      s.lkpTime = sense.lkp.time;
      s.lkpConfidence = sense.lkp.confidence;
    } else {
      s.lkpConfidence = 0;
    }
    if (sense.target) {
      const changed = this.SetTarget(s, sense.target);
      s.targetVisible = sense.visible === true;
      s.targetMoving = sense.target.moving === true;
      // 换了人就重新举枪：误差回到初值（`ShootingModel.BeginAim` 幂等，
      // 同一个目标反复调不会重置 —— 那会让 AI 永远瞄不准）。
      if (changed) this.shooting.BeginAim(s, sense.trackId);
      s.targetFromMemory = false;
      // 「发现敌情」只在从无到有那一下喊；目标切换不重复喊。
      if (!hadTarget && changed) this.Bark(s, "spot");
    } else if (sense.track && sense.track.ref) {
      // 锁着的人这一拍没出现在候选里（跑出筛选半径 / 被更近的人挤掉槽位）：
      // 目标保住，位置退回记忆里的最后目击点，TryFire 那边会走压制射击。
      const ref = sense.track.ref;
      const stillAlive = sense.track.isPlayer ? !!(player && player.Alive) : ref.alive !== false;
      if (stillAlive) {
        if (!s.target || s.target.id !== sense.trackId) {
          s.target = {
            position: ref.position || sense.lkp, isPlayer: !!sense.track.isPlayer,
            ref, id: sense.trackId, stance: sense.track.stance | 0,
          };
        }
        s.target.stance = sense.track.stance | 0;
        s.targetVisible = false;
        s.targetFromMemory = true;
      } else {
        this.DropTarget(s);
        bestDist = 1e9;
      }
    } else if (!this.ReviveTargetFromMemory(s, sense)) {
      this.DropTarget(s);
      bestDist = 1e9;
    } else {
      bestDist = Math.sqrt((s.lkp.x - s.position.x) ** 2 + (s.lkp.z - s.position.z) ** 2);
    }
    // 旧字段仍要有值：SoldierInfo / 覆盖层 / 关卡脚本读它们。
    s.targetLostTime = s.targetVisible ? 0 : s.targetLostTime + dt;
    s.alert = sense.alert;
    s.awareness = sense.awareness;
    // 目标连续暴露了多久 —— ShootingModel.UpdateAim 拿它加速收敛（老兵越打越准）。
    s.targetExposedS = s.targetVisible ? (s.targetExposedS || 0) + dt : 0;

    if (s.scriptDefensive) {
      // 守点单位一样要选掩体、一样走探头周期 —— 变的只是「不许离开锚点半径」。
      // 掩体查询在 Think 里（1/6 分帧、带 reselectMinS 限流），Act 每帧只读结果。
      this.ShareTrack(s, sense);
      this.UpdateCover(s);
      // 【§15】守点单位没有目标时不再一律 IDLE 站着：听见 / 看见过动静的人跪下面向
      // 那个方向（`ApplyScriptDefense` 每帧只读这个布尔，判级别的活在这儿做）。
      s.watchAlerted = !s.target && this.WantWatch(s);
      this.ApplyScriptDefense(s);
      if (s.state === STATE.WATCH) this.ApplyWatchPose(s);
      this.UpdateMoveOrder(s, null);
      return;
    }

    // cohesion：34 m 内还有几个同侧活人。这是班组密度，不是士气，永不出 UI。
    let mates = 0, close = 0;
    for (const o of this.soldiers) {
      if (o.side !== s.side || !o.alive || o === s) continue;
      const d = o.position.distanceTo(s.position);
      if (d < 34) mates += 1;
      if (d < 20) close += 1;
    }
    s.cohesion = Clamp01(0.35 + mates / 8);
    s.lonelyTime = close > 0 ? 0 : s.lonelyTime + dt;

    // 班组黑板：谁看见都算全班看见。这一条是「敌人会追打你最后露头的地方」的数据底座
    //（现状里一个人被打冷枪，旁边五个人一无所知，见 docs/Data_EnemyAi.md §2.1）。
    this.ShareTrack(s, sense);
    // 任务过期就当没派活：Tactics 每秒写一次，中间掉帧不该让人抱着一分钟前的活不放。
    const task = s.task && s.task.kind && this.time < s.task.until ? s.task : null;
    const charge = this.UpdateChargeIntent(s);

    // 掩体：先选点，状态机才知道有没有「躲得住的地方」可选。
    this.UpdateCover(s);

    // 状态机。压制门槛从 0.72 降到 0.50：ER2 的 allowFindCoverWhenSuppressed
    // 是一条**独立行为**，被打得抬不起头的表现是往掩体里缩，不是站着不动。
    const engageRange = s.tacticalRole === "support" ? ENGAGE.supportM : ENGAGE.defaultM;
    const wasEngaged = s.state === STATE.FIRE || s.state === STATE.CHARGE
      || s.state === STATE.COVER_ENGAGE || s.state === STATE.SUPPRESS;
    const prevState = s.state;
    if (s.suppression > 0.50 || (s.state === STATE.SUPPRESSED && s.suppression > 0.32)) {
      // 被压制打断的冲锋是失败的冲锋：这一轮不再自动重起。冷却带抖动，
      // 免得全班同一秒重新站起来吃同一轮齐射。玩家下的刺刀令不受此限。
      if (s.state === STATE.CHARGE && s.order !== "charge") {
        s.chargeCooldownUntil = this.time + TACTICS.chargeCooldownS + s.rnd() * TACTICS.chargeCooldownJitterS;
      }
      if (s.state !== STATE.SUPPRESSED) s.suppressedAt = this.time;
      s.state = STATE.SUPPRESSED;
      // 中等压制先蹲住，强压制才卧倒；刚爬起来三秒内除非压制爆表，不重复趴。
      // 旧版每一发近失弹都触发「卧倒→衰减→起身」，连续枪声下看起来就像抽搐。
      const mayProne = this.time - s.lastRiseAt > 3.0 || s.suppression > 0.82;
      if (s.stance === 2 || (s.suppression > 0.66 && mayProne)) {
        // 卧倒承诺 3.4–4.6 秒，比压制从 0.9 衰减清零（1.6 秒）长：起身时机由
        // 承诺期决定而不是由压制阈值决定，双方就不会在同一条阈值线上同步蹲起。
        this.SetStance(s, 2, 3.4 + s.rnd() * 1.2, true);
      } else if (this.time - s.suppressedAt > 0.2) {
        // 蹲下压半拍（0.2 秒反应时间）：一轮排枪两三发连着到，等这半拍能分清
        // 「蹲得住」还是「必须趴」，不然 0.1 秒内先蹲一次又趴一次，白多一次切换。
        this.SetStance(s, 1, 1.35);
      }
    } else if (s.ammo <= 0) {
      // 计时器**只在进入这个状态的那一次**上弦。
      // 原来每次 Think 都重设 —— Think 每 0.1 s 跑一次，而 reloadTimeS 是 3.2 s，
      // 计时器永远回不到 0：打空弹仓的人从此卡在 reload 里，再也不开枪。
      // 实跑取证：60 s 后 reload 状态的人只增不减（5→11→15），全场火力越打越少。
      if (s.state !== STATE.RELOAD) {
        s.state = STATE.RELOAD;
        s.reloadTimer = s.weapon.reloadTimeS || 3.2;
        // 「我换弹！掩护我！」—— 这一声同时是给玩家的战术信息：
        // 身边那个人接下来三秒不开枪。
        if (this.ctx.audio) {
          this.ctx.audio.Bark("ammo", { position: s.position.clone(), seed: s.id | 0, side: s.side });
        }
        // 换弹的**手上动作**：固定弹仓压桥夹 / 捷克式换弹匣。喊话是意图，
        // 这一声是事实 —— 喊话有 0.55 s 全局闸与 4.5 s 同类闸，十有八九被吃掉，
        // 于是「他在换弹」这条战术信息一直只有字幕没有声音。
        this.ctx?.audioWiring?.AiReload(s, s.weapon.kind);
      }
    } else if (charge && task?.kind !== TASK.RETREAT && task?.kind !== TASK.GRENADE) {
      s.state = STATE.CHARGE;
      this.SetStance(s, 0, 1.0, true);
    } else if (task && IsManeuverTask(task.kind) && (task.point || task.kind === TASK.BOUND)) {
      // **班组的机动任务优先于「就地对射」**（方案 §5 的状态表就是这么排的）。
      // 排在对射后面的话，交战距离（74 m）之内永远轮不到它 —— 侧翼手拿了任务
      // 却站在原地开枪，「会绕」这条机制等于没有。
      // 谁能拿到机动任务由 Tactics 决定：剧本仍优先，显式开放的守区只在范围内机动，
      // 每班最多 `FLANK.flankers` 个人去绕，正面仍然有人咬着。
      s.state = task.kind === TASK.FLANK ? STATE.FLANK
        : task.kind === TASK.BOUND ? STATE.BOUND
          : task.kind === TASK.INVESTIGATE ? STATE.INVESTIGATE : STATE.RETREAT;
      this.SetStance(s, s.suppression > 0.55 ? 1 : 0, 1.0);
    } else if (s.target && bestDist < engageRange + (wasEngaged ? ENGAGE.hysteresisM : 0)) {
      // 六人组内不再人人同一种打法：突击位先压、侧翼位次之，步枪位只在贴脸时冲，
      // 支援位永不自行冲锋，留在后方持续射击。
      // 投弹排在自发冲锋前面：班组把弹派给他，就该先扔再说 —— 十几米上一枚手榴弹比端着刺刀
      // 冲进火力里划算；拿了投弹任务却去冲锋的人会把班组的投弹租约白白占满二十秒。
      // 玩家下的「上刺刀」命令（order==="charge"）仍然压过投弹。
      if (task && task.kind === TASK.GRENADE && s.order !== "charge" && this.CanThrowGrenade(s)) {
        s.state = STATE.GRENADE;
        this.SetStance(s, 0, 0.8, true);
      } else if (s.cover) {
        // **有掩体就进掩体打**：hide → peek → 点射 → hide（§5 的 COVER_ENGAGE）。
        // 姿态由掩体决定（矮掩体蹲藏跪射 / 高掩体贴墙侧步），所以这里不调 FireStance ——
        // 那条问的是「对射要不要蹲」，这条问的是「这堵墙该怎么藏、怎么探头」，
        // 两个问题两套阈值（1.25 m vs COVER.tallM 1.55 m），故意不合并。
        s.state = s.targetVisible || (s.lkpConfidence || 0) >= TACTICS.suppressConfidence
          ? STATE.COVER_ENGAGE : STATE.FIRE;
      } else if (!s.targetVisible && (s.lkpConfidence || 0) >= TACTICS.suppressConfidence) {
        // 看不见但知道他在哪：向最后目击位置压制射击，不再闭嘴发呆。
        s.state = STATE.SUPPRESS;
        this.SetStance(s, this.FireStance(s, bestDist), 2.2);
      } else {
        s.state = STATE.FIRE;
        // 对射姿势的承诺期 2.2 秒：FireStance 的迟滞带挡得住近失弹的小波动，
        // 挡不住压制在带宽两侧的慢波 —— 1.35 秒时实测还剩 1.4–1.8 秒节奏的
        // 站蹲微调。卧倒（emergencyDrop）与冲锋（force）都不吃这条承诺。
        this.SetStance(s, this.FireStance(s, bestDist), 2.2);
      }
    } else if (this.WantWatch(s)) {
      // 【§15】不在交战中，但也不是没事：有目标可是超出交战距离（74 m）、
      // 或者只听见了动静 —— **不站直**。跪下、面向那边、隔几秒扫一次扇面，
      // 有掩体就缩进去（走位由 UpdateMoveOrder 的 WATCH 分支排），一枪不开。
      s.state = STATE.WATCH;
      this.ApplyWatchPose(s);
    } else {
      // 推进途中的蹲行门槛从 0.3 提到 0.55：0.3 一发近失弹就能压到，
      // 于是整条推进线都在以 0.6 倍速半蹲着蹭。真被打住了才蹲着走。
      s.state = STATE.ADVANCE;
      this.SetStance(s, s.suppression > 0.55 ? 1 : 0, 1.0);
    }

    // 行为喊话（docs/Data_EnemyAi.md §8）：只在**状态真的换了**那一下喊。
    // `Audio.Bark` 自己还有 0.55 s 全局闸与 4.5 s 同类闸，所以不会变成一街的复读；
    // 没有对应音频的类（比如「跟丢了」）在 Bark 里静默返回 null，不阻塞行为。
    if (s.state !== prevState) {
      if (s.state === STATE.COVER_ENGAGE) this.Bark(s, "cover");
      else if (s.state === STATE.FLANK) this.Bark(s, "flank");
      else if (s.state === STATE.SUPPRESS) this.Bark(s, "suppress");
    }

    // 潜行：跟着班长（玩家）的姿态走，跟着他的位置走，而且**不开枪**。
    // 必须压在状态机后面 —— 上面那段刚按"看不看得见敌人"重设过 stance。
    if (s.order === "covert") {
      if (this.time > s.covertUntil) {
        s.order = "advance";
      } else if (player) {
        this.SetStance(s, player.stance === "prone" ? 2 : player.stance === "crouch" ? 1 : 0,
          0.7, true);
        s.state = s.state === STATE.RELOAD ? STATE.RELOAD : STATE.ADVANCE;
        s.goal.set(player.position.x + s.laneOffset * 0.5, 0, player.position.z + s.laneOffset * 0.35);
        this.ClampInside(s.goal);
      }
    }

    // 命令有效期。绕行到位（或超时）转 advance；冲锋打完 18 秒归队 ——
    // 不设有效期的话，一次上刺刀就把整个班永久踢出守点纪律。
    if (s.order === "flank") {
      const arrived = Math.hypot(s.goal.x - s.position.x, s.goal.z - s.position.z) < 6;
      if (arrived || this.time > s.flankUntil) s.order = "advance";
    } else if (s.order === "charge" && this.time > s.chargeUntil) {
      s.order = "advance";
      s.bayonetFixed = false;
    }

    // 上刺刀期间强制保持 CHARGE：状态机上面那一段会按"看不看得见目标"把它打回
    // advance，于是命令下出去半秒就没了。装填那一档不覆盖 —— 空枪冲锋也得先压弹。
    if (s.order === "charge" && this.time < s.chargeUntil && s.state !== STATE.RELOAD) {
      s.state = STATE.CHARGE;
      this.SetStance(s, 0, 0.7, true);
    }
    if (s.state === STATE.CHARGE) s.bayonetFixed = true;

    // 这一拍要往哪儿挪。**必须排在最后**：走位是状态的结果，不是原因，
    // 而潜行 / 上刺刀这两条会在状态机之后再改一次状态。
    this.UpdateMoveOrder(s, task);
  }

  /** Commit a visible local charge, and cancel it when contact or support is lost. */
  UpdateChargeIntent(s) {
    if (s.order === "charge") return false;
    if (s.state === STATE.CHARGE) {
      const point = this.ThreatPoint(s);
      if (CanManeuver(s,this.time) && point && ManeuverAllowed(s,point)
        && s.target?.id === s.autoChargeTarget && this.time < s.autoChargeUntil
        && s.targetLostTime < TACTICS.chargeLostS && s.suppression < TACTICS.chargeAbortSuppression) return true;
      s.chargeCooldownUntil = this.time + TACTICS.chargeCooldownS;
      s.autoChargeUntil = 0;
    }
    if (s.ammo <= 0 || s.task?.kind === TASK.RETREAT || s.task?.kind === TASK.GRENADE) return false;
    let attackers = 0;
    for (const other of this.soldiers) {
      if (other !== s && other.alive && other.side === s.side && other.state === STATE.CHARGE
        && other.target?.id === s.target?.id) attackers++;
    }
    if (!ChargeOpportunity(s,this.time,attackers)) return false;
    s.autoChargeTarget = s.target.id;
    s.autoChargeUntil = this.time + TACTICS.chargeMaxS;
    this.ReleaseCover(s);
    return true;
  }

  ChargePoint(s, ordered) {
    const point = this.ThreatPoint(s) || (ordered ? s.goal : null);
    return point && (ordered || ManeuverAllowed(s,point)) ? point : null;
  }

  /** Translate the selected state into this frame's movement order. */
  UpdateMoveOrder(s, task) {
    s.moveOrder = null;
    s.moveArriveM = NaN;
    switch (s.state) {
      case STATE.COVER_ENGAGE:
        // 换弹与压制爆表都先缩头（方案 §5：换弹只在 hide）。
        this.UpdateCoverCycle(s, s.suppression > COVER.suppressionProneAt ? "hide" : null);
        break;
      case STATE.SUPPRESS:
        // Suppression fire shares the cover rhythm and open-ground relocation.
        if (s.cover) this.UpdateCoverCycle(s, null);
        else if (this.UpdateDisplace(s)) this.MoveTo(s,s.displaceX,s.displaceZ,WATCH.displaceSpeedMps,WATCH.displaceArriveM);
        break;
      case STATE.FIRE:
        // 【§15】跪射之后换位：站定超过 displaceAfterS 秒、或连着打了
        // displaceAfterShots 发，就侧向挪 2–4 m（压制高时改成匍匐后退）。
        // 有掩体的人不走这条 —— 那边有自己的 hide/peek 节奏。
        if (this.UpdateDisplace(s)) {
          this.MoveTo(s, s.displaceX, s.displaceZ, WATCH.displaceSpeedMps, WATCH.displaceArriveM);
        }
        break;
      case STATE.WATCH:
        // 戒备：有掩体就缩在隐蔽位（**只 hide，不探头**，探头是为了开枪，
        // 而戒备的人不开枪）；没掩体就站定在原地看着，不写走位命令。
        if (s.cover) this.UpdateCoverCycle(s, "hide");
        break;
      case STATE.RELOAD:
        // 换弹先回 hide；没掩体就地蹲下换（方案 §5 的 RELOAD 行）。
        if (s.cover) this.UpdateCoverCycle(s, "hide");
        else this.SetStance(s, 1, s.weapon.reloadTimeS || 3.2);
        break;
      case STATE.SUPPRESSED:
        // 被压住的人**优先爬向验证过的掩体**：这是「往掩体里缩」而不是「站着不动」。
        if (s.cover && s.cover.blockedCrouched) this.UpdateCoverCycle(s, "hide");
        else if (this.UpdateDisplace(s)) this.MoveTo(s,s.displaceX,s.displaceZ,WATCH.displaceSpeedMps,WATCH.displaceArriveM);
        break;
      case STATE.BOUND:
        // 跃进：下一个掩体已经由 UpdateCover 带 toward 查过了，跑过去就是。
        if (s.cover) {
          this.UpdateCoverCycle(s, null);
          if (s.coverPhase !== "approach") s.state = STATE.COVER_ENGAGE;
        } else {
          // A missing next cover is a failed bound, not an order to stand idle.
          s.state = s.target ? STATE.FIRE : STATE.WATCH;
          if (this.UpdateDisplace(s)) this.MoveTo(s,s.displaceX,s.displaceZ,WATCH.displaceSpeedMps,WATCH.displaceArriveM);
        }
        break;
      case STATE.FLANK:
      case STATE.INVESTIGATE:
      case STATE.RETREAT:
        if (task && task.point) this.MoveTo(s, task.point.x, task.point.z, BRAIN.taskMoveMps);
        break;
      default:
        break;
    }
  }

  /**
   * 把这个兵知道的敌情并进班组黑板。
   *
   * 用的是**锁定目标那一条 Track 自己的**位置与置信度，不混 `sense.lkp`
   * （后者可能指向另一条置信度更高的记忆，两边拼在一起就是一条不存在的情报）。
   */
  ShareTrack(s, sense) {
    const track = sense.track;
    if (!track || sense.trackId === null || sense.trackId === undefined) return;
    const e = this._share || (this._share = {
      id: 0, isPlayer: false, lkp: { x: 0, y: 0, z: 0, time: -1e9, confidence: 0 },
      lastSeenAt: -1e9, awareness: 0, yaw: NaN, ref: null, coverId: null, stationaryS: 0,
    });
    e.id = sense.trackId;
    e.isPlayer = !!track.isPlayer;
    e.lkp.x = track.lkp.x; e.lkp.y = track.lkp.y; e.lkp.z = track.lkp.z;
    e.lkp.time = track.lkpTime;
    e.lkp.confidence = track.confidence;
    e.lastSeenAt = track.lastSeenAt;
    e.awareness = track.awareness;
    e.ref = track.ref;
    // 投弹判据要的两项：他躲在哪个掩体后、在原地钉了多久。
    // 玩家没有 `cover`，「钉在一处」就只能靠他自己有没有挪窝（Update 里累计）。
    if (track.isPlayer) {
      e.yaw = Number.isFinite(track.ref?.yaw) ? track.ref.yaw : NaN;
      e.coverId = null;
      e.stationaryS = this.playerStationaryS;
    } else {
      e.yaw = Number.isFinite(track.ref?.yaw) ? track.ref.yaw : NaN;
      e.coverId = track.ref && track.ref.cover ? track.ref.cover.id : null;
      e.stationaryS = track.ref ? (track.ref.stationaryS || 0) : 0;
    }
    this.tactics.Blackboard(s.squadId, s.side).Share(s, e);
  }

  /** 身上还有手榴弹、也不在白刃里，才走投掷通道。 */
  CanThrowGrenade(s) {
    if (s.meleeCombat || s.unarmed) return false;
    if (!this.ctx.combat || !s.actor) return false;
    return TacticsDirector.GrenadeCount(s) > 0;
  }

  /**
   * 交火时站还是蹲。
   *
   * 旧版是 `FIRE 一律蹲` —— 实跑取证 12 秒内全场 80% 的人帧在蹲，其中 fire/1 独占
   * 一万九千帧，而且七成以上的**移动**帧也是蹲着的：一群人半蹲着在街上以 0.6 倍速
   * 蹭来蹭去，既看不出在打谁，也看不出在往哪去 —— 「老是下蹲不知道在干嘛」就是这个。
   *
   * 蹲是有代价的姿势（移动减速 40%、视线降到 1.0 m），所以要有理由才蹲。三条理由：
   *   1. 有人正朝我打（suppression 起来了）——最正当的一条；
   *   2. 我已经缩到矮掩体后面了：跑向掩体的路上站着跑，**到位**才蹲下去；
   *      掩体本身高过 1.25 m 的话站着就能靠，蹲下反而看不见敌人；
   *   3. 二十六米内的对射：这个距离缩小轮廓才划算。
   * 一条都不占就站着打 —— 远距离站姿射击本来就是这场仗里最常见的样子。
   */
  FireStance(s, bestDist) {
    // 已经卧倒且压制未清的人保持卧姿射击：头顶还在过弹时不撑起半个身子，
    // 起身统一等真正安静下来（压制清到 0.20 以下）。这半格迟滞消掉卧↔蹲往返。
    if (s.stance === 2 && s.suppression > 0.20) return 2;
    // 压制项两侧取不同阈值：站着的 0.35 才蹲，蹲着的要清到 0.12 才站。
    // 单阈值（旧 0.25）会被近失弹的 +0.16 在两侧来回踢，对射中每两秒蹲起一次。
    if (s.stance >= 1 ? s.suppression > 0.12 : s.suppression > 0.35) return 1;
    const c = s.cover;
    if (c && (c.height ?? 1) < 1.25
      && Math.hypot(c.x - s.position.x, c.z - s.position.z) < 1.3) return 1;
    return bestDist < 26 ? 1 : 0;
  }

  /**
   * 这一拍的威胁点：能看见就是目标本人，看不见就是最后目击位置。
   * 写进复用的 `_coverThreat` 并返回它；两样都没有时返回 null。
   */
  ThreatPoint(s) {
    const t = this._coverThreat;
    if (s.target && s.targetVisible) {
      t.x = s.target.position.x; t.y = s.target.position.y; t.z = s.target.position.z;
      t.stance = s.target.stance | 0;
      t.id = s.target.id;
      return t;
    }
    if (s.lkp && (s.lkpConfidence || 0) >= TACTICS.suppressConfidence) {
      t.x = s.lkp.x; t.y = s.lkp.y; t.z = s.lkp.z;
      t.stance = s.target ? (s.target.stance | 0) : 0;
      t.id = s.target ? s.target.id : null;
      return t;
    }
    return null;
  }

  // ------------------------------------------------- 戒备与换位（§15）
  /**
   * 士兵级警戒的**下标**（`ALERT_ORDER`：0 unaware / 1 suspicious / 2 alert / 3 engaged）。
   * 门槛一律按下标比 —— 字符串比大小写错了不会报错，只会静默地永远为真。
   */
  AlertIndex(s) {
    const i = ALERT_ORDER.indexOf(s.alert);
    return i < 0 ? 0 : i;
  }

  /**
   * 这个人这一拍是不是「站定了」。
   *
   * 戒备只给站定的人：**推进中的人（有 goal 还没走到）一个字都不改** ——
   * 站着走、跑着走都照旧，否则整条推进线会变成一群蹲着挪的人（那正是
   * 2026-08 那一轮修掉的毛病）。已经在戒备的人用 2.5 倍的到位半径做迟滞：
   * 班组每秒重派一次槽位，不留这条的话人会一秒蹲一次（`AiBehaviorTest`
   * 的「姿态没有阈值抽动 ≤ 6 次 / 12 s」当场翻红）。
   */
  Arrived(s) {
    if (s.order === "hold") return true;
    if (!s.goal) return true;
    const base = Number.isFinite(s.scriptArrivalRadius) ? Math.max(0.3, s.scriptArrivalRadius) : 1.2;
    const arriveM = s.state === STATE.WATCH ? base * 2.5 : base;
    const dx = s.goal.x - s.position.x;
    const dz = s.goal.z - s.position.z;
    return dx * dx + dz * dz <= arriveM * arriveM;
  }

  /**
   * 这一拍该不该戒备（`STATE.WATCH`）而不是站着推进 / 站着守点。
   *
   * 三条都要满足：① 不是走剧本路线 / 潜行 / 上刺刀的人；② 已经站定（见 `Arrived`）；
   * ③ 手上有目标（在这条分支上意味着**超出交战距离**），或者警戒到了
   * `WATCH.minAlertIndex`（听见枪声就够）。
   */
  WantWatch(s) {
    if (s.order === "covert" || s.order === "charge") return false;
    if (s.meleeCombat || s.unarmed || s.dummy) return false;
    if (s.p012Guided === true && Number.isFinite(s.scriptMoveSpeedMps)) return false;
    if (!this.Arrived(s)) return false;
    return !!s.target || this.AlertIndex(s) >= WATCH.minAlertIndex;
  }

  /**
   * 戒备时朝哪儿看：看得见就是目标本人，看不见就是最后目击位置
   *（听来的那条也算 —— 「朝枪声那边看」正是这一条要的东西）。
   */
  WatchPoint(s) {
    if (s.targetVisible && s.target?.position) return s.target.position;
    if (s.lkp && (s.lkpConfidence || 0) > 0) return s.lkp;
    return null;
  }

  /**
   * 戒备姿态：跪（压制过 `proneSuppressionAt` 就卧倒）+ 面向威胁 + 隔几秒扫一次扇面。
   *
   * **不写状态、不开火**：状态由调用方定（主梯的 WATCH、守点子梯的 WATCH、
   * 剧本旗单位仍然是 ADVANCE 只借姿态），开火在 `Act` 里根本没有 WATCH 这条路径。
   * 转向本身仍走 `Act` 尾部的 `ApproachAngle` 限速 —— 这里只给一个目标角度。
   */
  ApplyWatchPose(s) {
    this.SetStance(s, s.suppression > WATCH.proneSuppressionAt ? 2 : 1, WATCH.stanceHoldS);
    const at = this.WatchPoint(s);
    if (!at) return;
    const dx = at.x - s.position.x;
    const dz = at.z - s.position.z;
    if (dx * dx + dz * dz < 1e-4) return;
    if (this.time - s.watchScanAt > WATCH.scanIntervalS) {
      s.watchScanAt = this.time;
      // 正对 → 偏一侧 → 正对 → 偏另一侧。**起手是正对着动静**（scanSign 从 0 开始），
      // 不然刚听见枪声的人第一眼是斜着看的，读起来像没听见。
      s.watchScanSign = s.watchScanSign === 0 ? (s.rnd() < 0.5 ? 1 : -1) : 0;
    }
    s.watchYaw = Math.atan2(-dx, -dz) + s.watchScanSign * WATCH.scanYawRad;
    s.watchUntil = this.time + WATCH.faceHoldS;
  }

  /**
   * 剧本旗单位（`scriptedNoncombatant`）这一拍的感知与姿态。
   *
   * 为什么不直接沿用 `ForgetAll`：那句话每拍抹一次记忆，听觉写进去的东西活不过
   * 一拍，于是**开着仗的战场上有人始终 unaware 且站得笔直**（2026-09-09 实拍：
   * >120 m 档 6/6）。这里改成走一次**空候选**的 `Sense`：一条射线都不打、
   * 不建新条目，只让听来的记忆按真实时间衰减，`alert` / `lkp` 照常出账。
   * 目标在调用方已经清掉了，所以这个人仍然不选掩体、不开枪、不接任务。
   *
   * 姿态只给「停在原地的武装单位」（有守区、order=hold、没有剧本速度）——
   * P012 的担架队、平民、开场发枪的队列走的是 `MoveActor`（清掉守区、order=advance），
   * 一个都不受影响。
   */
  WatchScripted(s, dt) {
    const sense = this.perception.Sense(s, EMPTY_CANDIDATES, dt);
    s.alert = sense.alert;
    s.awareness = sense.awareness;
    if (sense.lkp) {
      s.lkp = s.lkp || { x: 0, y: 0, z: 0 };
      s.lkp.x = sense.lkp.x; s.lkp.y = sense.lkp.y; s.lkp.z = sense.lkp.z;
      s.lkpTime = sense.lkp.time;
      s.lkpConfidence = sense.lkp.confidence;
    } else {
      s.lkpConfidence = 0;
    }
    s.watchAlerted = !s.unarmed && !!s.holdZone && s.order === "hold"
      && !Number.isFinite(s.scriptMoveSpeedMps)
      && this.AlertIndex(s) >= WATCH.minAlertIndex;
    if (s.watchAlerted) this.ApplyWatchPose(s);
  }

  /**
   * 跪射之后换位（§15 第 2 条）。**只给「有目标、身边没有掩体」的原地对射**：
   * 有掩体的人走 hide/peek 周期，那是另一套节奏。
   *
   * 触发：站定超过 `displaceAfterS` 秒（读 `s.stationaryS`，一动就清零），
   * 或者自上次换位起打了 `displaceAfterShots` 发；两条都还要过
   * `displaceMinDwellS` 的最小间隔（不然机枪半秒就想挪一次）。
   * 压制过 `displaceProneAt` 时改成**匍匐后退** `displaceBackM`，不再站着横挪。
   *
   * 守点纪律不松：落点必须落在 `CoverReachM`（守区半径 + 掩体余量）之内，
   * 余量比 `displaceMinReachM` 还小的（机枪战位 0.4 + 0.9 = 1.3 m）**一步都不挪**。
   *
   * @returns {boolean} 这一拍有没有换位要走（true 时落点在 s.displaceX/Z）
   */
  UpdateDisplace(s) {
    if (s.cover) { s.displaceUntil = -99; return false; }
    // 走到一半：接着走，别每拍重算落点（重算 = 原地画圈）。
    if (this.time < s.displaceUntil) {
      const dx = s.displaceX - s.position.x;
      const dz = s.displaceZ - s.position.z;
      if (dx * dx + dz * dz > WATCH.displaceArriveM * WATCH.displaceArriveM) return true;
      s.displaceUntil = -99;
      return false;
    }
    if (this.time - s.displaceAt < WATCH.displaceMinDwellS) return false;
    const shots = s.fireSequence - s.displaceFireSeq;
    if (s.stationaryS < WATCH.displaceAfterS && shots < WATCH.displaceAfterShots) return false;
    // 试过就记时刻：**找不到落点也算试过**，否则「四面都走不通」的人每拍都要
    // 把候选点重扫一遍（前沿几十个人就是每秒几百次空间散列查询）。
    s.displaceAt = this.time;
    s.displaceFireSeq = s.fireSequence;
    const spot = this.PickDisplaceSpot(s);
    if (!spot) return false;
    s.displaceX = spot.x;
    s.displaceZ = spot.z;
    s.displaceProne = spot.prone;
    s.displaceUntil = this.time + WATCH.displaceTimeoutS;
    if (spot.prone) this.SetStance(s, 2, WATCH.stanceHoldS);
    this.stats.displaces += 1;
    return true;
  }

  /**
   * 换位落点：以威胁方向为轴，左右各试两档（压制高时改成沿威胁反方向后退）。
   * **一条射线都不打** —— 只查导航可走 + 胶囊撞不撞（`Blocked` 走 AABB 空间散列）
   * + 地面高差，射线预算（docs/Data_EnemyAi.md §7）一条都不占。
   */
  PickDisplaceSpot(s) {
    const reach = this.CoverReachM(s);
    const limited = Number.isFinite(reach);
    if (limited && reach < WATCH.displaceMinReachM) return null;
    const anchor = s.holdZone || s.position;
    const threat = this.ThreatPoint(s);
    let tx = 0, tz = 1;
    if (threat) {
      const dx = threat.x - s.position.x;
      const dz = threat.z - s.position.z;
      const len = Math.sqrt(dx * dx + dz * dz);
      if (len > 1e-3) { tx = dx / len; tz = dz / len; }
    }
    const prone = s.suppression >= WATCH.displaceProneAt;
    const first = s.rnd() < 0.5 ? 1 : -1;
    const span = Math.max(0, WATCH.displaceMaxM - WATCH.displaceMinM);
    const out = this._displaceSpot || (this._displaceSpot = { x: 0, z: 0, prone: false });
    const tries = Math.max(1, WATCH.displaceTries | 0);
    for (let i = 0; i < tries; i += 1) {
      const side = i % 2 === 0 ? first : -first;
      const shrink = 1 - Math.floor(i / 2) * 0.45;      // 第二轮试短一点，别为了 4 m 放弃 2 m
      let nx, nz;
      if (prone) {
        // 匍匐：背着威胁退，两侧各偏一点，别整班沿同一条线往后爬。
        const back = WATCH.displaceBackM * shrink;
        nx = s.position.x - tx * back - tz * side * back * 0.4;
        nz = s.position.z - tz * back + tx * side * back * 0.4;
      } else {
        const dist = (WATCH.displaceMinM + s.rnd() * span) * shrink;
        nx = s.position.x - tz * side * dist;
        nz = s.position.z + tx * side * dist;
      }
      if (limited) {
        const ax = nx - anchor.x, az = nz - anchor.z;
        if (ax * ax + az * az > reach * reach) continue;
      }
      if (this.ctx.nav && this.ctx.nav.Walkable(nx, nz) === false) continue;
      const bf = this.ctx.battlefield;
      const gy = bf ? bf.GroundHeight(nx, nz) : s.position.y;
      if (Math.abs(gy - s.position.y) > 1.2) continue;           // 别一步跨下一道坎
      if (bf && this.Blocked(nx, nz, gy + 0.1, CAPSULE[0])) continue;
      out.x = nx; out.z = nz; out.prone = prone;
      return out;
    }
    return null;
  }

  /**
   * 这个人允许离锚点多远（守区半径 + 掩体余量）。没有守区就是 NaN（不限）。
   *
   * 余量来自关卡编排（`scriptCoverSlackM`）：普通守兵 6 m 能进旁边那堵墙，
   * 机枪位只有 0.9 m —— 够一个探头的侧步，不够换点。缺省时退回战术层的
   * `TACTICS.holdCoverSlackM`，与 Tactics 写在 task 上的提示同源。
   */
  CoverReachM(s) {
    const zone = s.holdZone;
    if (!zone && !s.scriptDefensive) return NaN;
    const base = zone && Number.isFinite(zone.radius) ? zone.radius : 0;
    const slack = Number.isFinite(s.scriptCoverSlackM) ? s.scriptCoverSlackM : TACTICS.holdCoverSlackM;
    return Math.max(base + slack, s.tacticalRadiusM || 0);
  }

  /** 这个候选掩体的隐蔽位与射击位是不是都还在守区允许的范围里。 */
  CoverAllowed(s, cand) {
    const reach = this.CoverReachM(s);
    if (!Number.isFinite(reach)) return true;
    const anchor = s.holdZone || s.position;
    const hx = cand.hidePos.x - anchor.x, hz = cand.hidePos.z - anchor.z;
    if (hx * hx + hz * hz > reach * reach) return false;
    const fx = cand.firePos.x - anchor.x, fz = cand.firePos.z - anchor.z;
    return fx * fx + fz * fz <= reach * reach;
  }

  /** 掩体打分要避开的友军（间距惩罚）。返回复用数组。 */
  CoverAllies(s) {
    const out = this._coverAllies;
    let n = 0;
    const r2 = COVER.defaultRadiusM * COVER.defaultRadiusM;
    for (let i = 0; i < this.soldiers.length; i += 1) {
      const o = this.soldiers[i];
      if (o === s || o.side !== s.side || !o.alive) continue;
      const dx = o.position.x - s.position.x;
      const dz = o.position.z - s.position.z;
      if (dx * dx + dz * dz > r2) continue;
      let slot = out[n];
      if (!slot) { slot = { x: 0, z: 0, id: 0 }; out[n] = slot; }
      slot.x = o.position.x; slot.z = o.position.z; slot.id = o.id;
      n += 1;
    }
    out.length = n;
    return out;
  }

  /**
   * 选 / 重选掩体（docs/Data_EnemyAi.md §4.2 / §7）。
   *
   * 什么时候查：首次接敌、被判抄侧翼、压制越阈值、敌方手榴弹落在身边、
   * 掩体被炸没了、跃进要带推进方向。其余一律按 `COVER_CYCLE.reselectMinS` 限流 ——
   * Query 的候选验证和最终候补的补查均有限额，重选节流避免全员逐帧打射线。
   *
   * @returns {boolean} 这一拍有没有换点
   */
  UpdateCover(s) {
    // 正走剧本路线的人（P012 的护送、第一关跃进途中的冲击）**不选掩体**：
    // 他的位移由 `Act` 的 scriptedPathFollower 分支接管，选了也走不过去 ——
    // 只会占着一个点不去（实测前沿 21 个人各占一个掩体、12 秒里 20 个一步没挪）。
    if (s.p012Guided === true && Number.isFinite(s.scriptMoveSpeedMps)) {
      this.ReleaseCover(s);
      return false;
    }
    const threat = this.ThreatPoint(s);
    if (!threat) { this.ReleaseCover(s); return false; }
    const now = this.time;
    const task = s.task;
    const bounding = !!task && task.kind === TASK.BOUND;
    let cover = s.cover;
    if (cover && s.coverPhase === "approach") {
      const left = Math.hypot(cover.hidePos.x-s.position.x,cover.hidePos.z-s.position.z);
      if (!Number.isFinite(s.coverProgressM) || left < s.coverProgressM-COVER_CYCLE.progressM) {
        s.coverProgressM = left; s.coverProgressAt = now;
      } else if (now-s.coverProgressAt > COVER_CYCLE.stalledApproachS) {
        s.failedCoverId = cover.id; s.failedCoverUntil = now+COVER_CYCLE.failedRetryS;
        this.ReleaseCover(s); cover = null; s.coverPickAt = -99;
      }
    } else { s.coverProgressM = Infinity; s.coverProgressAt = now; }

    // ① 紧急重选：使用更短的重查间隔，因为当前藏身点已经失效。
    // **「身上没有掩体」不在这一档里**：那正是「附近根本没有掩体」的常态
    //（第一关前沿的日军身边 11 m 内实测 0 个点），当成紧急的话每次 Think 都要重查一遍，
    //  52 个人就是每秒五百次 Query、上千条验证射线 —— 直接把 §7 的预算烧穿。
    let urgent = false;
    if (cover) {
      if (!this.covers.index.has(cover.id)) urgent = true;                       // 掩体被炸没了
      else if (this.covers.IsFlanked(cover, threat, s.position)) urgent = true;
      else if (s.suppression > COVER.suppressionProneAt) urgent = true;          // 压得抬不起头
      else if (now - s.grenadeThreatAt < COVER_CYCLE.reselectMinS) urgent = true;
    }
    // ② 常规重选：威胁挪远了才值得重算（他还在原地的话上一次的账仍然成立）。
    let want = urgent || bounding || !cover;
    if (!want && cover
      && Math.sqrt((threat.x - s.coverThreatX) ** 2 + (threat.z - s.coverThreatZ) ** 2) > BRAIN.threatMoveM) {
      want = true;
    }
    if (!want) return false;
    if (now - s.coverPickAt < (urgent ? COVER_CYCLE.urgentReselectS : COVER_CYCLE.reselectMinS)) return false;

    const opts = this._coverOpts;
    let radiusM = task && Number.isFinite(task.coverRadiusM) ? task.coverRadiusM : COVER.defaultRadiusM;
    // 守区的人只在区里找：查得比走得远，人就会一直朝一个到不了的点「接近」，
    // 探头周期永远起不来（机枪位那 0.4 m 的圈尤其明显）。
    //
    // **半径以关卡给的余量为准，不以战术层的提示为准**：`task.coverRadiusM` 是
    // `TACTICS.holdCoverSlackM`（6 m）算的，而第一关给跃进到线的人放的是
    // `assaultCoverSearchM`（9 m）。取小的那个会把唯一那个合格点筛在半径之外 ——
    // 实测前沿有人手工重跑 Query 找得到、正式路径却找不到，差的就是这 3 m。
    // 查询圆以人为心、守区圆以锚点为心，所以还要把人离锚点的漂移补进半径。
    const allowed = this.CoverReachM(s);
    if (Number.isFinite(allowed)) {
      const anchor = s.holdZone || s.position;
      const dx = s.position.x - anchor.x;
      const dz = s.position.z - anchor.z;
      radiusM = Math.min(COVER.defaultRadiusM, allowed + Math.sqrt(dx * dx + dz * dz));
    }
    opts.radiusM = radiusM;
    opts.soldierId = s.id;
    opts.suppression = s.suppression;
    opts.allies = this.CoverAllies(s);
    if (bounding && (task.towardX || task.towardZ)) {
      // Tactics 只给方向（跃进往哪儿压），`Query` 要的是一个点：往前推一个 towardCapM。
      opts.towardX = s.position.x + task.towardX * COVER.towardCapM;
      opts.towardZ = s.position.z + task.towardZ * COVER.towardCapM;
    } else {
      opts.towardX = NaN; opts.towardZ = NaN;
    }
    const found = this.covers.Query(s, this._coverThreats, opts);
    s.coverPickAt = now;
    s.coverThreatX = threat.x;
    s.coverThreatZ = threat.z;
    // 守区的人得挑一个**隐蔽位与射击位都还在区里**的点：查询半径是以人为圆心的，
    // 而守区是以锚点为圆心的，两个圆不重合时前几名有可能落在区外。
    let best = null, extraValidations = 0;
    for (let i = 0; i < found.length; i += 1) {
      const cand = found[i];
      if (cand.cover.id === s.failedCoverId && now < s.failedCoverUntil) continue;
      if (!this.CoverAllowed(s, cand)) continue;
      // Query only ray-tests its first few scores. Never accept an untested
      // runner-up just because the tested candidates failed their protection check.
      if (!cand.validated && typeof this.covers.host.Raycast === "function") {
        if (extraValidations >= COVER_CYCLE.selectedValidationBudget) continue;
        extraValidations++;
        const validation = this.covers.Validate(cand.cover,threat,{hidePos:cand.hidePos,suppression:s.suppression});
        cand.validated = true;
        cand.blockedCrouched = validation.blockedCrouched;
        cand.blockedStanding = validation.blockedStanding;
      }
      if (cand.validated && !cand.blockedCrouched && !cand.blockedStanding) continue;
      if (cand.validated && !cand.blockedStanding) cand.hideStance = Math.max(1,cand.hideStance);
      best = cand; break;
    }
    if (!best) { this.ReleaseCover(s); return false; }
    if (cover && best.cover.id === cover.id) {
      // 还是同一个点：把姿势与验证结果刷新一遍就行，不重新登记占用。
      this.WriteCover(s, best, now);
      return false;
    }
    // **先 Release 再 Claim**，否则一个人会同时占着新旧两个点（注册表头注）。
    this.covers.Release(s.id);
    this.covers.Claim(best.cover.id, s.id);
    this.WriteCover(s, best, now);
    s.coverProgressM = Infinity; s.coverProgressAt = now;
    s.coverPhase = "approach";
    s.coverPhaseUntil = -99;
    this.stats.coverPicks += 1;
    return true;
  }

  /**
   * 把候选槽拷进 `s.cover`。**旧三个字段 `{x, z, height}` 一个都不许删** ——
   * `FireStance`、`Debug.SoldierInfo` 与第一关的剧本都在读它们（方案 §5 兼容表）。
   */
  WriteCover(s, cand, now) {
    const c = s.coverStore || (s.coverStore = {
      x: 0, z: 0, height: 0, id: 0, nx: 0, nz: 0,
      hidePos: { x: 0, z: 0 }, firePos: { x: 0, z: 0 },
      side: "over", hideStance: 1, fireStance: 1,
      validated: false, blockedCrouched: false, blockedStanding: false, at: -99,
    });
    c.x = cand.cover.x; c.z = cand.cover.z; c.height = cand.cover.height;
    c.id = cand.cover.id; c.nx = cand.cover.nx; c.nz = cand.cover.nz;
    c.hidePos.x = cand.hidePos.x; c.hidePos.z = cand.hidePos.z;
    c.firePos.x = cand.firePos.x; c.firePos.z = cand.firePos.z;
    c.side = cand.side;
    c.hideStance = cand.hideStance;
    c.fireStance = cand.fireStance;
    c.validated = cand.validated;
    c.blockedCrouched = cand.blockedCrouched;
    c.blockedStanding = cand.blockedStanding;
    c.at = now;
    s.cover = c;
    return c;
  }

  /**
   * 掩体周期：缩头（hide）→ 探头（peek）→ 点射 → 缩头（`COVER_CYCLE` 定节拍）。
   *
   * 写的是 `s.moveOrder` 与 `s.moveArriveM`，由 `Act` 的状态分支消费 ——
   * **到位半径必须单独给**：hide↔peek 的侧步只有 `sideStepM`（0.55 m），
   * 而 Act 的默认到位半径是 1.2 m，拿默认值判的话人永远「已经到了」，探头一次都不会发生。
   *
   * @param {string} force "hide" 时强制缩头（换弹、压制爆表）
   */
  UpdateCoverCycle(s, force) {
    s.moveOrder = null;
    s.moveArriveM = NaN;
    const c = s.cover;
    if (!c) { s.coverPhase = "none"; return; }
    const move = s.moveStore;
    const dx = c.hidePos.x - s.position.x;
    const dz = c.hidePos.z - s.position.z;
    if (Math.sqrt(dx * dx + dz * dz) > COVER_CYCLE.arriveRadiusM) {
      // 还在路上：跑过去（正常速度、正常到位半径，走导航场）。
      s.coverPhase = "approach";
      move.x = c.hidePos.x; move.z = c.hidePos.z; move.speed = BRAIN.coverApproachMps;
      s.moveOrder = move;
      return;
    }
    if (force === "hide") {
      s.coverPhase = "hide";
      s.coverPhaseUntil = this.time + COVER_CYCLE.hideDwellMinS;
    } else if (s.coverPhase !== "hide" && s.coverPhase !== "peek") {
      s.coverPhase = "hide";
      s.coverPhaseUntil = this.time
        + COVER_CYCLE.hideDwellMinS + s.rnd() * (COVER_CYCLE.hideDwellMaxS - COVER_CYCLE.hideDwellMinS);
    } else if (this.time >= s.coverPhaseUntil) {
      if (s.coverPhase === "peek") {
        s.coverPhase = "hide";
        s.coverPhaseUntil = this.time
          + COVER_CYCLE.hideDwellMinS + s.rnd() * (COVER_CYCLE.hideDwellMaxS - COVER_CYCLE.hideDwellMinS);
      } else {
        s.coverPhase = "peek";
        s.coverPhaseUntil = this.time
          + COVER_CYCLE.peekMinS + s.rnd() * (COVER_CYCLE.peekMaxS - COVER_CYCLE.peekMinS);
        s.peekCount += 1;
        this.stats.peeks += 1;
        // 每次探头都是重新举枪：误差回到初值，探头本身有代价（§4.3）。
        if (s.target) this.shooting.BeginAim(s, s.target.id, { force: true });
      }
    }
    const peeking = s.coverPhase === "peek";
    const at = peeking ? c.firePos : c.hidePos;
    move.x = at.x; move.z = at.z; move.speed = BRAIN.coverMoveMps;
    s.moveOrder = move;
    s.moveArriveM = BRAIN.coverArriveM;
    this.SetStance(s, peeking ? c.fireStance : c.hideStance, COVER_CYCLE.peekMinS);
  }

  /** 走到一个点（侧翼 / 查看 / 后撤 / 跃进都用它）。写复用的 moveOrder。 */
  MoveTo(s, x, z, speed, arriveM = NaN) {
    const move = s.moveStore;
    move.x = x; move.z = z; move.speed = speed;
    s.moveOrder = move;
    s.moveArriveM = arriveM;
    return move;
  }

  /**
   * 【已由 `Script_AiCover.CoverRegistry` 取代，2026-09-08】
   *
   * 旧的 `FindCover` 抽 24 个随机点按「距离 / 高度 / 朝向夹角」打分，**不验证掩体
   * 真的挡住威胁**、不看掩体朝向、不记占用、到位后不探头不缩头（docs/Data_EnemyAi.md §2.2）。
   * 那三件事现在分别是注册表的 `Validate` / `PeekPose` / `Claim`，选点入口是 `UpdateCover`。
   * 这个函数整段删掉而不是留着当兜底：留着就会有人在某条分支上把它接回去，
   * 于是同一场仗里两套掩体逻辑并存，谁也说不清人为什么蹲在那儿。
   */

  /**
   * 通视。cand 是 nearSlots 里的一个槽（带 id 与目标姿态）。
   *
   * 两处修正：
   *  1. 两端的高度按**姿态**取（站 1.5 / 蹲 1.0 / 卧 0.5），原来两端写死 1.5/1.4，
   *     于是卧倒的人跟站着的人一样好瞄，掩体后的射孔高度也全对不上；
   *  2. 缓存按目标 id 存三份，不再一人一份。原来最近那个被挡住就把 clear=false
   *     写进唯一那一格，接下来 0.25 s 内问谁都答"看不见"。
   */
  HasLineOfSight(s, cand) {
    const id = cand.id;
    const cache = s.losCache;
    const lean = cand.isPlayer ? (cand.ref?.LeanOffsetM || 0) : 0;
    for (const entry of cache) {
      if (entry.id === id && entry.lean === lean && this.time - entry.time < 0.25) return entry.clear;
    }
    const from = this.tmpA.set(s.position.x,
      s.position.y + AiDirector.StanceEye(s.stance, s), s.position.z);
    const to = this.tmpB.set(cand.position.x,
      cand.position.y + AiDirector.StanceEye(cand.stance, cand), cand.position.z);
    if (lean) to.copy(cand.ref.EyePosition);
    if (this.ctx.BlocksSight?.(from, to)) return false;
    const dir = this.tmpC.subVectors(to, from);
    const dist = dir.length();
    if (dist < 0.001) return true;
    dir.divideScalar(dist);
    const hit = this.ctx.battlefield.Raycast(from, dir, dist);
    const clear = !hit || hit.t >= dist - 0.4;
    const entry = cache[s.losSlot % cache.length];
    entry.id = id; entry.time = this.time; entry.clear = clear; entry.lean = lean;
    s.losSlot = (s.losSlot + 1) % cache.length;
    return clear;
  }

  // ---------------------------------------------------------------- 执行
  Act(s, dt, player) {
    // The firearm laboratory supplies exact positions before Ai.Update. Keep its
    // animation and crowd LOD inside the normal AI scheduling contract, but do
    // not let gravity, navigation or idle collision steps move the measured rig.
    if (s.weaponRangeTargetId) { this.StepWeaponRange(s, dt); return; }
    if (s.p012CarriedCasualty) { this.StepCarriedCasualty(s, dt, player); return; }
    if (s.actor?.pendingGrenadeThrow || s.actor?.characterRig?.infantry.IsThrowing()) {
      if (s.meleeCombat) { s.actor.pendingGrenadeThrow = null; this.StepMeleeCombat(s, dt); return; }
      s.stance = 0; s.crouchBlend = 0; s.proneBlend = 0; s.moveSpeed = 0;
      this.StepBody(s, 0, 0, dt);
      s.actor.root.position.copy(s.position); s.actor.root.rotation.y = s.yaw;
      s.actor.Update(dt, { throwing: s.actor.pendingGrenadeThrow ? 1 : 0,
        grounded: s.grounded, elapsed: this.time, moveSpeed: 0 });
      return;
    }
    const animationStartX = s.position.x, animationStartZ = s.position.z;
    let wantsFire = false;
    let desired = null;
    let speed = 0;
    let wantedYaw = s.yaw;
    // 这一帧有没有走过物理。没走的（站着不动、在射击）也要补一次 ——
    // 不补的话站在墙头上的人在墙被炸掉之后会浮在半空。
    let stepped = false;
    if (s.hurtPose > 0) s.hurtPose = Math.max(0, s.hurtPose - dt / HURT_FLINCH.decayS);
    if (s.scriptDefensive && s.state !== STATE.VAULT) this.ApplyScriptDefense(s);

    // 白刃演出接管整帧：不重新 Think、不走导航、不在格挡中途再开一枪。
    if (s.meleeCombat) { this.StepMeleeCombat(s, dt); return; }

    // 翻越途中接管整帧：走位移曲线，不做别的。
    if (s.state === STATE.VAULT) { this.StepVault(s, dt); return; }

    // 冷却结束就把枪口那根白烟拆掉。**这一句必须在 Act 里**，不能只写在 TryFire 里：
    // TryFire 只在 FIRE/SUPPRESSED/CHARGE 三个状态下被调用，机枪手一旦转进 ADVANCE
    // 就再也不进那条路径，烟源留在原地按每秒六颗一直吐到这局结束 ——
    // 六个阶段跑下来会攒出几十个常驻烟源，粒子池被占满、帧率一路掉下去。
    if (s.heatSmoke && this.time >= s.coolUntil) {
      if (this.ctx.vfx) this.ctx.vfx.RemoveSmokeSource(s.heatSmoke);
      s.heatSmoke = 0;
    }

    // 守点纪律（软约束）。原来是拿坐标硬夹回：越界就把 position 拉到圆边上，
    // 人贴着一个看不见的圆边横向滑动，而且因为点从不易主，中方 AI 被永久钉死。
    // 改成只重设目标点 + 转向内侧，不动 position —— 越界是被允许的，回来是自己走回来的。
    let strayed = false;
    if (s.holdZone && s.order !== "charge") {
      const dx = s.position.x - s.holdZone.x, dz = s.position.z - s.holdZone.z;
      const d = Math.hypot(dx, dz);
      // 【2026-09-08】守区半径在**有掩体时**按 `CoverReachM` 放宽（守区 + 掩体余量）。
      // 不放宽的话会死锁：`CoverAllowed` 允许他进区外 6 m 的那堵墙，走过去之后
      // 这一段又判他「出区了」、把目标点拽回守位，人在两点之间来回蹭，
      // 掩体永远到不了位（实测整班 anyCover=6 而 inCover=0）。
      // 换位途中（§15）与有掩体时同一条口径：允许半径放宽到「守区 + 掩体余量」。
      // 不放宽的话，非剧本的守区单位刚侧向挪出两米就被这一段判成「出区了」、
      // 把目标点拽回守位 —— 人在两点之间来回蹭，换位一次都完不成。
      const reach = s.cover || this.time < s.displaceUntil ? this.CoverReachM(s) : NaN;
      const limit = Math.max(s.tacticalRadiusM || 0, Number.isFinite(reach) ? Math.max(s.holdZone.radius, reach) : s.holdZone.radius);
      if (d > limit) {
        strayed = true;
        if (this.time - s.regoalTime > 1.5) {
          s.regoalTime = this.time;
          const a = s.rnd() * Math.PI * 2;
          const r = Number.isFinite(s.scriptArrivalRadius) ? 0 : s.holdZone.radius * (0.20 + s.rnd() * 0.55);
          s.goal.set(s.holdZone.x + Math.cos(a) * r, 0, s.holdZone.z + Math.sin(a) * r);
          // 中正门那个点的圆边压过北寨墙，随机撒出来的守位有一部分在墙外面 ——
          // 人走不过去，只会贴着墙抖到死。
          this.ClampInside(s.goal);
        }
        if (!s.target && d > 0.001) wantedYaw = Math.atan2(dx / d, dz / d);
      }
    }

    switch (s.state) {
      case STATE.SUPPRESSED: {
        // 三档：0.50–0.75 卧倒并往掩体里爬（还能还击）；
        //       0.75 以上停火，仍能向掩体爬行；
        //       0.90 以上且 20 m 内五秒没有友军 —— 往后缩。这不是投降，是被打散。
        if (s.moveOrder) {
          desired = this.tmpD.set(s.moveOrder.x,0,s.moveOrder.z); speed = s.moveOrder.speed;
          wantsFire = s.suppression <= .75;
        } else if (s.suppression > 0.90 && s.lonelyTime > 5 && s.target) {
          desired = this.tmpD.set(
            s.position.x * 2 - s.target.position.x, 0, s.position.z * 2 - s.target.position.z);
          speed = 2.0;
        } else if (s.suppression <= 0.75) {
          // 优先爬向**验证过的**掩体（moveOrder 由 UpdateMoveOrder 排好）；
          // 没有验证过的点时退回旧行为：朝掩体本身挪。
          const m = s.moveOrder;
          if (m) { desired = this.tmpD.set(m.x, 0, m.z); speed = 1.8; }
          else if (s.cover) {
            const d = Math.hypot(s.cover.x - s.position.x, s.cover.z - s.position.z);
            if (d > 1.1) { desired = this.tmpD.set(s.cover.x, 0, s.cover.z); speed = 1.8; }
          }
          wantsFire = true;
        }
        break;
      }
      case STATE.RELOAD: {
        s.reloadTimer -= dt;
        // 换弹时先缩回掩体（方案 §5：换弹只在 hide 做）。
        const m = s.moveOrder;
        if (m) { desired = this.tmpD.set(m.x, 0, m.z); speed = m.speed; }
        if (s.reloadTimer <= 0) { s.ammo = s.weapon.magazine || 5; s.state = STATE.IDLE; }
        break;
      }
      case STATE.FIRE: {
        // 换位（§15）优先于「奔隐蔽位」：走位命令在的时候就走它 ——
        // 身边没有掩体才会有换位命令，两条不会同时成立。
        const m = s.moveOrder;
        if (m) { desired = this.tmpD.set(m.x, 0, m.z); speed = m.speed; }
        else if (s.cover) {
          // 有 hidePos 就奔隐蔽位（掩体点本身是墙心，不是站人的地方）；
          // 没有的话仍按掩体坐标走，跟旧行为一字不差。
          const cx = s.cover.hidePos ? s.cover.hidePos.x : s.cover.x;
          const cz = s.cover.hidePos ? s.cover.hidePos.z : s.cover.z;
          const d = Math.hypot(cx - s.position.x, cz - s.position.z);
          if (d > 1.1) { desired = this.tmpD.set(cx, 0, cz); speed = 2.4; }
        }
        wantsFire = true;
        break;
      }
      case STATE.WATCH: {
        // 戒备：**一枪不开**（这一条就是这个状态存在的理由）。有掩体的话
        // UpdateMoveOrder 把他压在 hide 相位上，跟着那个走位挪半步；没有就站定。
        const m = s.moveOrder;
        if (m) { desired = this.tmpD.set(m.x, 0, m.z); speed = m.speed; }
        break;
      }
      case STATE.COVER_ENGAGE: {
        // 缩头 → 探头 → 点射 → 缩头。**只在探头相位开火** ——
        // 缩着头还打枪的话，「躲」就退化成一个不影响任何事的动画。
        const m = s.moveOrder;
        if (m) { desired = this.tmpD.set(m.x, 0, m.z); speed = m.speed; }
        if (s.coverPhase === "peek") wantsFire = true;
        break;
      }
      case STATE.SUPPRESS: {
        // 压制射击：向最后目击位置 / 掩体沿打。命中恒 false，近失弹压制照旧。
        const m = s.moveOrder;
        if (m) { desired = this.tmpD.set(m.x, 0, m.z); speed = m.speed; }
        wantsFire = true;
        break;
      }
      case STATE.BOUND: {
        // 跃进：跑向下一个掩体，到位由 Think 转回 COVER_ENGAGE。跑动中不开枪。
        const m = s.moveOrder;
        if (m) { desired = this.tmpD.set(m.x, 0, m.z); speed = m.speed; }
        break;
      }
      case STATE.FLANK:
      case STATE.RETREAT: {
        // 走到班组给的点。途中仍走 TryFire —— 它自己的枪口方向闸会挡住
        // 「一边横着跑一边往侧后方开枪」，所以不必在这儿再判一次。
        const m = s.moveOrder;
        if (m) { desired = this.tmpD.set(m.x, 0, m.z); speed = m.speed; }
        wantsFire = true;
        break;
      }
      case STATE.INVESTIGATE: {
        const m = s.moveOrder;
        if (m) { desired = this.tmpD.set(m.x,0,m.z); speed = m.speed; }
        break;
      }
      case STATE.GRENADE:
        this.TryGrenade(s, player);
        break;
      case STATE.CHARGE: {
        // 自主冲锋受局部战区约束；玩家明确下达的刺刀令可越出守区。
        const ordered = s.order === "charge" && this.time < s.chargeUntil;
        const dest = this.ChargePoint ? this.ChargePoint(s,ordered) : (s.target ? s.target.position : (ordered ? s.goal : null));
        if (dest && (!s.holdZone || ordered || s.tacticalRadiusM > 0)) {
          desired = this.tmpD.copy(dest);
          speed = ordered ? 3.6 * 1.4 : 3.6;      // 下了命令的冲锋跑得更快
        }
        wantsFire = true;
        this.TryBayonet(s, dt, player);
        break;
      }
      case STATE.ADVANCE:
      default:
        desired = this.tmpD.copy(s.goal);
        speed = s.order === "hold" ? 0 : 2.6;
        break;
    }

    // 走出守区就一切以回区为先：对射也好，都不许把点丢在身后。
    // **唯一的例外是上刺刀**：玩家亲口下的冲锋命令要能覆盖守点纪律，
    // 否则守点单位（也就是最需要被冲出去的那批人）按下去纹丝不动 ——
    // 独立复核实测带 holdZone 时位移 0.00 m，正是被这一行盖回去的。
    if (strayed && s.order !== "charge") { desired = this.tmpD.copy(s.goal); speed = Math.max(speed, 2.2); }
    // Scripted defence can fire in place, but never pursue an enemy or remote cover.
    // 【2026-09-08】守点从「钉在一个点上」改成「锚点 + 半径」（docs/Data_EnemyAi.md §6）：
    // 掩体微走位（进隐蔽位、探头、缩头）只要落在允许半径内就放行，其余照旧回锚点。
    // `ScriptDefenseSpot` 在纯规则重放（P012RuntimeTest 把这段源码抽进沙箱）里不存在，
    // 那时整段自动退回旧行为 —— 这也是它写成可缺省调用的原因。
    if (s.scriptDefensive) {
      const anchor = s.holdZone || s.position;
      const spot = this.ScriptDefenseSpot ? this.ScriptDefenseSpot(s, anchor) : null;
      const goX = spot ? spot.x : anchor.x;
      const goZ = spot ? spot.z : anchor.z;
      const reach = spot ? spot.arriveM : 2;
      const outside = Math.hypot(s.position.x - goX, s.position.z - goZ) > reach;
      desired = outside ? this.tmpD.set(goX, 0, goZ) : null;
      speed = outside ? (spot ? spot.speed : 2.2) : 0;
    }

    // 移动：直奔目标 + 撞墙就沿墙滑 + **卡住就拐弯绕**。
    //
    // 最后那一条原来只写在注释里（"真卡住 1.5 秒就随机换个方向绕"），代码里一行没有。
    // 后果实跑取证得到：这座城 1.5 m 高度上 30 m 的随机射线只有 19/200 是通的
    // （4674 个 wall 碰撞盒，鲁南民居对外不开窗），撞墙的人贴着墙原地抖到死，
    // 两边各自站在自己的院子里 —— 「仗根本没在打」有一半是这么来的。
    // 这不是寻路，是"摸着墙走"：拐九十度走一两秒再回头奔目标。在一座街巷本来
    // 就通的城里够用，而且比 A* 便宜两个数量级。
    // P012 route followers use an explicit metres/second pace, not a cap on the
    // ordinary 2.6m/s advance state. Scouts still perceive and fire normally.
    const scriptedPathFollower = s.p012Guided === true && Number.isFinite(s.scriptMoveSpeedMps);
    // Exact escort corridors own their queue waits. Locally mobile infantry
    // retain obstacle recovery even during authored bounds.
    const lockedCorridor = scriptedPathFollower && !(s.tacticalRadiusM > 0);
    if (scriptedPathFollower) {
      if (lockedCorridor) { s.detourTime = 0; s.stuckTime = 0; }
      // Combat still owns aiming, firing, reloading and damage above. The
      // checked corridor owns movement: FIRE's cached cover must not pull the
      // leader away from the escort, and RELOAD must not cancel his next step.
      if (!s.scriptDefensive) desired = this.tmpD.copy(s.goal);
    }
    if (s.p012ScoutDirected || s.p012RouteRejoining) { desired = this.tmpD.copy(s.goal); speed = 2.6; }
    if (Number.isFinite(s.scriptMoveSpeedMps)) speed = s.p012Guided && desired
      ? Math.max(0, s.scriptMoveSpeedMps) : Math.min(speed, Math.max(0, s.scriptMoveSpeedMps));
    if (desired && speed > 0) {
      const dx = desired.x - s.position.x, dz = desired.z - s.position.z;
      const d = Math.hypot(dx, dz);
      // 掩体微走位要自己的到位半径：hide↔peek 的侧步只有 sideStepM（0.55 m），
      // 拿默认的 1.2 m 判的话人永远「已经到了」，探头一次都不会发生。
      const arrivalRadius = Number.isFinite(s.moveArriveM) ? Math.max(0.05, s.moveArriveM)
        : (Number.isFinite(s.scriptArrivalRadius) ? Math.max(0.05, s.scriptArrivalRadius) : 1.2);
      if (d > arrivalRadius) {
        let nx = dx / d, nz = dz / d;
        // 远目标走导航场：直奔目标在这座城里等于直奔一堵院墙。
        // 近目标（掩体、眼前的敌人）仍然直奔 —— 那种距离上局部避障就够，
        // 而且导航场是按格量化的，六米以内会把人推得一格一格地跳。
        let navigated = false;
        // 门槛取 14 m 而不是 8 m：导航场的目标被量化到 16 m，近距离用它反而会
        // 把人往格心上推。十四米以内本来就是"看得见就直接过去"的距离。
        if (this.ctx.nav && d > 14 && !s.p012RouteRejoining) {
          navigated = this.ctx.nav.Steer(s.position.x, s.position.z, desired.x, desired.z, this.navOut);
          if (navigated) { nx = this.navOut.x; nz = this.navOut.z; s.detourTime = 0; s.stuckTime = 0; }
        }
        if (!lockedCorridor && !navigated && s.detourTime > 0) {
          s.detourTime -= dt;
          const c = Math.cos(s.detourYaw), sn = Math.sin(s.detourYaw);
          const rx = nx * c - nz * sn, rz = nx * sn + nz * c;
          nx = rx; nz = rz;
        }
        // 姿态减速：蹲 0.6、卧 0.3。这个系数**必须同时进 moveSpeed** ——
        // 它是喂给 Script_Actor 的唯一速度信号，动作层拿它算步频与匍匐的循环频率。
        // 只减位移不减信号的话，趴着的人以三倍于真实位移的频率蹬腿，
        // 蹲着的人步频快 1.67 倍：两样都是在原地蹭。
        const stanceMul = s.stance === 1 ? 0.6 : s.stance === 2 ? 0.3 : 1;
        const step = speed * dt * stanceMul;
        const beforeX = s.position.x, beforeZ = s.position.z;
        this.StepBody(s, nx * step, nz * step, dt);
        stepped = true;
        const moved = Math.hypot(s.position.x - beforeX, s.position.z - beforeZ);
        // 掩体微走位（半米的侧步）不参与「卡住就翻墙 / 卡住就绕路」那一套：
        // 一帧只挪两三厘米，胶囊求解的余量本来就吃得下，判成"卡住"的话
        // 探头探到一半会去翻墙。
        const microStep = Number.isFinite(s.moveArriveM) && d < COVER_CYCLE.microMoveM;
        if (moved < step * 0.4 && !microStep) {
          s.stuckTime += dt;
          // 挡在前面的要是一堵翻得过去的墙，就翻过去 —— 别沿着院墙兜半圈找门洞。
          // 门槛比"卡住就绕"的 0.8 s 早一点：能翻就不该先绕。
          if (!lockedCorridor && s.stuckTime > 0.3 && this.TryVault(s, nx, nz)) return;
          // 绕着还是不动就**翻到另一面**再绕。这一条不能写成"只有不在绕行时才重掷"：
          // 那样一旦直奔方向与拐 99° 的方向同时被挡就是死锁，实跑量到位置整整
          // 两百四十秒一帧都不动。翻面 + 每次重掷都带一点抖动才出得来。
          if (!lockedCorridor && s.stuckTime > 0.8) {
            s.stuckTime = 0;
            if (s.detourTime > 0) s.detourSign = -s.detourSign;
            s.detourTime = 2.0 + s.rnd() * 1.2;
            s.detourGoalDist = d;
            s.detourYaw = s.detourSign * (Math.PI * 0.5 + s.rnd() * 0.55);
          }
        } else {
          s.stuckTime = 0;
        }
        wantedYaw = Math.atan2(-nx, -nz);
        s.moveSpeed = Clamp01((s.p012Guided || s.scriptDefensive) ? moved / Math.max(dt,.0001) / 3.6 : speed * stanceMul / 3.6);
      } else {
        s.moveSpeed = 0;
        s.stuckTime = 0;
      }
    } else {
      s.moveSpeed = 0;
      s.stuckTime = 0;
    }

    let targetYaw = null;
    if (s.target && s.targetVisible) {
      // Track height before the first shot and during the cooldown, not after firing.
      this.UpdateMuzzle(s);
      const from = this.shooting.MuzzleOrigin(s);
      const samples = s.target.isPlayer && player ? this.shooting.PlayerSamples(player)
        : this.shooting.SoldierSamples(s.target.position, s.target.stance, undefined,
          AiDirector.HeightScale(s.target.ref));
      const targetId = s.target.isPlayer ? PLAYER_TRACK_ID : s.target.id;
      const point = this._aimPoint;
      const sample = samples.find(p => p.part === s.visualAimPart && s.visualAimTargetId === targetId)
        || samples[1] || samples[0];
      if (sample) {
        point.x = sample.x; point.y = sample.y; point.z = sample.z;
        s.lookPitch = this.shooting.LookPitch(from, point);
        s.muzzleAimYaw = Math.atan2(-(point.x - from.x), -(point.z - from.z));
      }
      const dx = s.target.position.x - s.position.x, dz = s.target.position.z - s.position.z;
      targetYaw = Math.atan2(-dx, -dz);
      // 停火瞄准与冲锋面向敌人；跑向掩体时身体面向移动方向，只让上身有限度地看敌。
      // 旧代码无条件用 targetYaw 覆盖移动朝向，移动与目标分列两侧时会逐帧互相抢方向。
      if (s.moveSpeed < 0.08 || s.state === STATE.CHARGE) wantedYaw = targetYaw;
    } else if (s.lkp && (s.lkpConfidence || 0) > 0) {
      targetYaw = Math.atan2(s.position.x-s.lkp.x,s.position.z-s.lkp.z);
      if(s.state===STATE.INVESTIGATE && s.moveSpeed<.08){
        targetYaw += Math.sin(this.time*2*Math.PI/INVESTIGATE.scanS)*WATCH.scanYawRad;
      }
      s.muzzleAimYaw=targetYaw;
      if(s.moveSpeed<.08)wantedYaw=targetYaw;
    } else if (this.time < s.watchUntil && Number.isFinite(s.watchYaw)) {
      // 【§15】戒备：没有目标，但听见过动静 —— 面向那边（`ApplyWatchPose` 每
      // scanIntervalS 把这个角度往左右扳一次，看起来就是在扫扇面）。转速仍由下面
      // 那条 `ApproachAngle` 限着，不会瞬转；`mayAim` 里没有 WATCH，所以枪不上肩。
      targetYaw = s.watchYaw;
      if (s.moveSpeed < 0.08) wantedYaw = targetYaw;
    }
    // 人体不可能一帧转 180°。移动时略快，卧倒/受压时更慢；所有角度都走最短弧。
    const turnRate = s.stance === 2 ? 2.4 : s.moveSpeed > 0.08 ? 5.0 : 3.4;
    s.yaw = ApproachAngle(s.yaw, wantedYaw, turnRate * dt);

    // 枪口/上身偏航必须相对**这一帧真实的身体朝向**。旧版拿 wantedYaw 当基准，
    // 导航场在相邻格之间切方向时 wantedYaw 会左右跳，身体因为有转速限制尚且平滑，
    // 枪却每帧直接吃跳变后的 lookYaw，于是原地疯狂改枪口方向。
    const wantedLookYaw = targetYaw === null
      ? 0 : Clamp(AngleDelta(s.yaw, s.target ? (s.muzzleAimYaw ?? targetYaw) : targetYaw), -0.75, 0.75);
    s.lookYaw += Clamp(wantedLookYaw - s.lookYaw, -4.8 * dt, 4.8 * dt);

    // FIRE/ADVANCE 是离散战术状态，枪托不是电门。短暂离开 FIRE 仍保留 0.35 s
    // 的据枪承诺，再用连续 blend 上肩/放下，距离阈值两侧不会横着甩枪。
    const mayAim = wantsFire || s.state === STATE.FIRE || s.state === STATE.COVER_ENGAGE
      || s.state === STATE.SUPPRESS
      || (s.state === STATE.SUPPRESSED && s.target && s.suppression <= 0.75);
    if (mayAim && s.target) s.aimUntil = this.time + 0.35;
    const wantedAim = s.target && this.time < s.aimUntil ? 1 : 0;
    const aimRate = wantedAim ? 5.5 : 4.0;
    s.aimBlend += Clamp(wantedAim - s.aimBlend, -aimRate * dt, aimRate * dt);
    // 抬枪 / 压枪。`s.lookPitch` 持续按「枪口 → 瞄点」跟踪（向上为正），
    // 这里跟 lookYaw 同一套做法：不据枪时回零，且**限速** ——
    // 一发打完立刻把枪甩平，画面上就是每开一枪抖一下头。
    const wantedPitch = s.target && this.time < s.aimUntil ? (s.lookPitch || 0) : 0;
    s.lookPitchBlend = (s.lookPitchBlend || 0)
      + Clamp(wantedPitch - (s.lookPitchBlend || 0), -3.2 * dt, 3.2 * dt);

    // 0.24—0.32 秒完成一次姿态过渡。胶囊仍立刻采用战术姿态，视觉骨架连续插值。
    const blendStep = dt / (s.stance === 2 || s.proneBlend > 0.01 ? 0.32 : 0.24);
    const crouchTarget = s.stance === 1 ? 1 : 0;
    const proneTarget = s.stance === 2 ? 1 : 0;
    s.crouchBlend += Clamp(crouchTarget - s.crouchBlend, -blendStep, blendStep);
    s.proneBlend += Clamp(proneTarget - s.proneBlend, -blendStep, blendStep);
    // 站着不动的人也要走一次物理：重力、脚下的东西被炸掉、被别的东西顶开，
    // 都得在这一步里结算。但**不必每帧**：Rapier 的胶囊 Move 是 Act 的最大单项
    //（2026-08-27 拆账：Act 占 ai 桶的六成，其中大半是全场静止守军的空移动），
    // 落了地又没动的人按屏内 2 帧 / 远景与屏外 4 帧一步，dt 累着补偿 ——
    // 脚下被炸掉最多晚三帧（≈50 ms）才开始掉，屏外根本看不见。
    // 悬空的（正在掉、刚被炸飞）照旧每帧结算，别让人一顿一顿地落地。
    if (!stepped) {
      s.idleStepDt += dt;
      const cadence = !s.grounded ? 1
        : (s.renderLod === "detail" ? 2 : 4);
      if (cadence === 1 || (this.tickIndex + s.id) % cadence === 0) {
        this.StepBody(s, 0, 0, Math.min(s.idleStepDt, 0.1));
        s.idleStepDt = 0;
      }
    } else {
      s.idleStepDt = 0;
    }
    // 在原地钉了多久。班组黑板把它交给 `ShouldGrenade` 的第②条
    //「对方钉在一处 ≥ holdS」—— 蹲在同一堵墙后面不动的人才会挨手榴弹。
    s.stationaryS = s.moveSpeed > BRAIN.movingSignal ? 0 : s.stationaryS + dt;

    if (s.actor) {
      s.actor.root.position.copy(s.position);
      s.actor.root.rotation.y = s.yaw;
      const cadence = ActorAnimationCadence(s);
      if (s.actor.root.visible && (wantsFire || (this.tickIndex + s.id) % cadence === 0)) s.actor.Update(dt * (wantsFire ? 1 : cadence), {
        moveSpeed: s.moveSpeed,
        moveSpeedMps: Math.hypot(s.position.x - animationStartX, s.position.z - animationStartZ) / Math.max(dt, .0001),
        bayonetFixed: s.bayonetFixed,
        aim: s.aimBlend,
        crouch: s.crouchBlend,
        prone: s.proneBlend,
        grounded: s.grounded,
        verticalVelocity: s.velocityY,
        firing: this.time - s.lastFire < 0.12,
        fireSequence: s.fireSequence,
        hurt: s.hurtPose,
        elapsed: this.time,
        lookYaw: s.lookYaw, lookPitch: s.lookPitchBlend || 0,
        // 摆点层（EscortColumn）钉在 soldier 上的两个负重旗：担架员前/后位
        // 与「能走的轻伤员」。姿态取用在 CharacterModel._ActionForState。
        carryRole: s.carryRole || null,
        woundedWalk: s.woundedWalk || 0,
      });
    }
    // Fire only after movement, turning and this frame's visible skeleton are synchronized.
    if (wantsFire && !s.meleeCombat) this.TryFire(s, dt, player);
  }

  /** A named living casualty is attached to the carrier, with the same model and body. */
  StepCarriedCasualty(s, dt, player) {
    if(!player?.position)return;
    const yaw=player.yaw||0;
    s.position.copy(player.position);
    s.position.x+=Math.sin(yaw)*.35;s.position.z+=Math.cos(yaw)*.35;
    s.position.y+=1.05;s.yaw=yaw+Math.PI/2;
    s.moveSpeed=0;s.aimBlend=0;s.velocityY=0;s.grounded=false;s.idleStepDt=0;
    s.body?.SetSize(.42,.58);s.body?.Teleport(s.position.x,s.position.y,s.position.z);
    if(s.actor){
      s.actor.root.position.copy(s.position);s.actor.root.rotation.y=s.yaw;
      s.actor.Update(dt,{moveSpeed:0,aim:0,crouch:0,prone:1,grounded:true,hurt:s.hurtPose,
        elapsed:this.time,lookYaw:0,lookPitch:0});
    }
  }

  /** Exact-distance firearm fixtures; only this explicit laboratory flag enters. */
  StepWeaponRange(s, dt) {
    s.moveSpeed = Clamp01(s.weaponRangeMoveSpeed || 0);
    s.aimBlend = 0;
    s.lookYaw = 0;
    s.crouchBlend = 0;
    s.proneBlend = 0;
    s.stance = 0;
    s.grounded = true;
    s.velocityY = 0;
    if (!s.actor) return;
    s.actor.root.position.copy(s.position);
    s.actor.root.rotation.y = s.yaw;
    const cadence = ActorAnimationCadence(s);
    if (s.actor.root.visible && (this.tickIndex + s.id) % cadence === 0) {
      s.actor.Update(dt * cadence, { moveSpeed: s.moveSpeed, aim: 0, crouch: 0,
        prone: 0, grounded: true, elapsed: this.time, lookYaw: 0, lookPitch: 0, hurt: s.hurtPose });
    }
    // RaycastHitboxes refreshes world matrices on demand, including detached
    // far actors, so roots stay exact without solving forty skeletons per frame.
  }

  /** 通用规则已经完成决策和位移；这里只接重力、真实演员与动画。 */
  StepMeleeCombat(s, dt) {
    s.moveSpeed = Math.abs(s.meleeCombat.move || 0) * 1.5;
    s.aimBlend += Clamp(-s.aimBlend, -4 * dt, 4 * dt);
    s.lookYaw += Clamp(-s.lookYaw, -4.8 * dt, 4.8 * dt);
    s.aimUntil = -99; s.stance = 0;
    this.StepBody(s, 0, 0, dt);
    if (!s.actor) return;
    s.actor.root.position.copy(s.position); s.actor.root.rotation.y = s.yaw;
    s.actor.Update(dt, { moveSpeed: s.moveSpeed, aim: s.aimBlend, crouch: 0, prone: 0,
      grounded: s.grounded, verticalVelocity: s.velocityY, elapsed: this.time,
      meleeCombat: s.meleeCombat, bayonetFixed: s.bayonetFixed, lookYaw: s.lookYaw, lookPitch: 0 });
  }

  /**
   * AI 侧的翻越。玩家能翻墙进院，追他的人只能绕门洞的话，这个动词就是单方面作弊。
   *
   * 判据跟玩家那份一致 —— 两边读同一张 `Data_Traversal.TRAVERSAL`：
   * 正前方顶面落在通行阶梯里（腰高翻越 / 肩高攀爬）、落点站得下，高过硬顶就绕路。
   * 不同的是 AI 不做物理，所以位移曲线直接改 position，落地高度问 StandHeight。
   *
   * @param {number} nx,nz 当前想走的方向（已归一化）
   */
  TryVault(s, nx, nz) {
    if (s.stance === 2) return false;             // 趴着的人先站起来再说
    const bf = this.ctx.battlefield;
    const feet = s.position.y;
    const probeX = s.position.x + nx * 0.7;
    const probeZ = s.position.z + nz * 0.7;
    let top = -Infinity;
    let wall = false;
    const climbed = new Set();
    for (const b of bf.NearbyColliders(probeX, probeZ, 1.0)) {
      if (probeX < b.min[0] - 0.35 || probeX > b.max[0] + 0.35) continue;
      if (probeZ < b.min[2] - 0.35 || probeZ > b.max[2] + 0.35) continue;
      if (b.min[1] > feet + 1.0) continue;
      const rel = b.max[1] - feet;
      if (rel > TRAVERSAL.mantleMax) {            // 高过硬顶 = 一堵真墙，绕路去
        // 判死只认**正挡在探针点上**的那一只盒（同玩家那份的理由）
        if (b.min[1] <= feet + TRAVERSAL.vaultMin
          && probeX > b.min[0] - 0.15 && probeX < b.max[0] + 0.15
          && probeZ > b.min[2] - 0.15 && probeZ < b.max[2] + 0.15) wall = true;
        continue;
      }
      if (rel < TRAVERSAL.vaultMin) continue;
      climbed.add(b);                             // 正在翻的那几只，落点检查里不算挡路
      if (b.max[1] > top) top = b.max[1];
    }
    if (wall || !Number.isFinite(top)) return false;
    const plan = TraversalPlan(top - feet);
    if (!plan) return false;
    const landX = s.position.x + nx * plan.reach;
    const landZ = s.position.z + nz * plan.reach;
    // 落点判据与玩家共用一份（Data_Traversal.TraversalLanding）：盖住落点、
    // 顶面容得下人的才算落脚面。原来只问 StandHeight，擦着落点的一条板沿
    // 也会被当成地面，人就站到了半空里。
    const landY = TraversalLanding(bf.NearbyColliders(landX, landZ, 0.95),
      s.position, { x: landX, z: landZ }, bf.GroundHeight(landX, landZ), top + 0.05, 0.35, climbed);
    if (landY === null) return false;
    if (this.Blocked(landX, landZ, landY)) return false;
    s.state = STATE.VAULT;
    s.vaultT = 0;
    s.vaultKind = plan.kind;
    s.vaultDuration = plan.duration;
    s.vaultFrom = { x: s.position.x, y: feet, z: s.position.z };
    s.vaultTo = { x: landX, y: landY, z: landZ };
    s.vaultApexY = Math.max(top + plan.apexOver, feet, landY);
    s.stuckTime = 0;
    s.detourTime = 0;
    this.vaultCount += 1;
    return true;
  }

  /** 翻越途中的一帧。走完就落回 ADVANCE，由下一次 Think 重新决策。 */
  StepVault(s, dt) {
    s.vaultT += dt;
    const k = Clamp01(s.vaultT / s.vaultDuration);
    const c = TraversalCurve(s.vaultKind, k);
    const from = s.vaultFrom, to = s.vaultTo;
    s.position.x = from.x + (to.x - from.x) * c.h;
    s.position.z = from.z + (to.z - from.z) * c.h;
    // 与玩家同一条曲线：起点 →（爬）→ 顶点 →（掉）→ 落点
    s.position.y = from.y + (s.vaultApexY - from.y) * c.up - (s.vaultApexY - to.y) * c.down;
    s.moveSpeed = 1;
    s.yaw = ApproachAngle(s.yaw, Math.atan2(-(to.x - from.x), -(to.z - from.z)), COVER_CYCLE.traversalTurnRadPerS * dt);
    if (k >= 1) {
      s.vaultT = -1;
      s.state = STATE.ADVANCE;
      s.position.x = to.x; s.position.y = to.y; s.position.z = to.z;
    }
    // 翻越是一段写死的位移曲线（人要从墙上跨过去），胶囊得跟着瞬移，
    // 不然落地那一帧引擎按起跳点算，人会被弹回墙这边。
    if (s.body) s.body.Teleport(s.position.x, s.position.y, s.position.z);
    if (s.body) { s.velocityY = 0; s.grounded = true; }
    if (s.actor) {
      s.actor.root.position.copy(s.position);
      s.actor.root.rotation.y = s.yaw;
      const cadence = ActorAnimationCadence(s);
      if (s.actor.root.visible && (this.tickIndex + s.id) % cadence === 0) s.actor.Update(dt * cadence, {
        moveSpeed: 1, aim: 0, crouch: 0, prone: 0, firing: false,
        bayonetFixed: s.bayonetFixed,
        grounded: false,
        verticalVelocity: Math.cos(Math.PI * k) * Math.PI
          * Math.max(0, s.vaultApexY - Math.max(from.y, to.y)) / s.vaultDuration,
        elapsed: this.time, lookYaw: 0, lookPitch: 0,
      });
    }
  }

  /**
   * 尸体的一帧。
   *
   * 断气之前，人的位移归运动学角色控制器；断气之后归一具**动态刚体**（见
   * PhysicsWorld.MakeCorpse）。这一步补的是原来完全没有的一件事：
   * 在城墙上、马道上、屋顶上中弹的人**会掉下来**。以前他钉在断气那一帧的坐标上，
   * 悬在半空 —— 那是「站立面」查询的必然结果，因为死人不再走 Act，
   * 也就不再重新问脚下有没有东西。
   *
   * 停下来之后（速度足够小、或者超过 4 秒）就把刚体拆掉：
   * 一场仗几十具尸体，留着全是白算的。
   */
  StepCorpse(s, dt) {
    const physics = this.ctx.physics;
    if (!physics) return;
    // 活着那具胶囊要先拆：留着的话尸体会一直挡着路，而且它是运动学的，不会掉
    if (s.body) { s.body.Remove(); s.body = null; }
    if (!s.corpse) {
      if (s.corpseSettled) return;
      s.corpse = physics.MakeCorpse({ position: s.position, velocity: s.deathPush });
      s.deathPush = null;
    }

    // --- 尸体脚下的地形长什么样 --------------------------------------------
    // 沿身体轴（yaw 正前）与侧轴各探一对点，加中心共五点。查询走 StandHeight
    // 而不是 groundAt：坟头、街垒这类东西**视觉是圆包、碰撞是方台**，只存在于
    // 碰撞层里 —— 尸体明明架在坟顶上，groundAt 却只看得见底下的耕地。
    const bf = this.ctx.battlefield;
    const t0 = s.corpse.translation();
    const feetY = t0.y - (s.corpse.userFeetOffset || 0);
    const yaw = s.yaw || 0;
    const fx = -Math.sin(yaw), fz = -Math.cos(yaw);    // 人物正面
    const sxv = Math.cos(yaw), szv = -Math.sin(yaw);   // 人物局部 +X 一侧
    const L = 0.75, W = 0.35;                          // 半身长 / 半展宽
    const At = (px, pz) => bf.StandHeight(px, pz, feetY + 0.1);
    const hC = At(t0.x, t0.z);
    const dF = At(t0.x + fx * L, t0.z + fz * L) - hC;
    const dB = At(t0.x - fx * L, t0.z - fz * L) - hC;
    const dR = At(t0.x + sxv * W, t0.z + szv * W) - hC;
    const dL = At(t0.x - sxv * W, t0.z - szv * W) - hC;
    // 高差超过 CLIFF 的采样是「另一层」（旁边的墙顶、台子底下的街面），
    // 不参与躯干贴合 —— 不然靠墙倒下的人会朝墙面立起 35°。
    const CLIFF = 0.7;
    const cF = Math.abs(dF) > CLIFF ? 0 : dF, cB = Math.abs(dB) > CLIFF ? 0 : dB;
    const cR = Math.abs(dR) > CLIFF ? 0 : dR, cL = Math.abs(dL) > CLIFF ? 0 : dL;
    const slopeF = (cF - cB) / (2 * L), slopeS = (cR - cL) / (2 * W);

    // --- 坟尖 / 台缘 / 陡坡：滑下去，别定格在刀脊上 ------------------------
    // 身体两端（或两侧）都比中心低一截 = 蹲在凸尖上；拟合坡度过陡 = 挂在陡坡上。
    // 真人的尸体不会平衡在这种地方。速度直接写而不是加力 —— 胶囊摩擦 1.1，
    // 靠力推不动，而这一下要的就是「顺坡出溜」的观感。
    const convex = Math.max(-(dF + dB) / 2, -(dR + dL) / 2);
    let sliding = convex > 0.32 || Math.hypot(slopeF, slopeS) > 0.78;
    let ux = fx, uz = fz;
    if (sliding) {
      let low = dF;
      if (dB < low) { low = dB; ux = -fx; uz = -fz; }
      if (dR < low) { low = dR; ux = sxv; uz = szv; }
      if (dL < low) { low = dL; ux = -sxv; uz = -szv; }
    } else {
      // 正趴在某个小件的方台顶上（坟头/街垒/沙袋垛）：台面比五点采样的跨距还大
      // 一圈时上面那条测不出凸度，但台面又比一具人小 —— 人不该躺在这种东西顶上。
      // 判据：脚下那块盒子两个方向的半宽都收在 1.9 m 内，且顶面高出大地半米以上。
      // 城墙马道、屋顶这类躺得住的面至少有一个方向是长的，不会被误伤。
      for (const b of bf.BoxesNear(t0.x, t0.z)) {
        // 包含判定往外扩一圈胶囊半径：中心刚出台缘时胶囊还踩着台角，
        // 推力在这儿断掉的话尸体会被摩擦定在台唇上，悬在半空（回归 4g 抓过）。
        if (t0.x < b.min[0] - 0.4 || t0.x > b.max[0] + 0.4
          || t0.z < b.min[2] - 0.4 || t0.z > b.max[2] + 0.4) continue;
        if (Math.abs(b.max[1] - feetY) > 0.3) continue;
        if ((b.max[0] - b.min[0]) > 3.8 || (b.max[2] - b.min[2]) > 3.8) continue;
        if (b.max[1] - physics.groundAt(t0.x, t0.z) < 0.5) continue;
        const ex = t0.x - (b.min[0] + b.max[0]) / 2, ez = t0.z - (b.min[2] + b.max[2]) / 2;
        const em = Math.hypot(ex, ez);
        // 朝离台缘最近的方向推（正好在正中就顺着身体朝向走）
        if (em > 0.05) { ux = ex / em; uz = ez / em; }
        // 但四个采样里若有真正的低处（比脚低半米以上），优先朝低处走 ——
        // 「远离台心」那条路可能被贴着的下一座坟头堵死（坟丛里两座相依时，
        // 尸体会被推进夹缝楔住，悬在坟腰高度不下来；诊断 2026-08-27 抓过）。
        let lowH = hC + dF, lx = fx, lz = fz;
        if (hC + dB < lowH) { lowH = hC + dB; lx = -fx; lz = -fz; }
        if (hC + dR < lowH) { lowH = hC + dR; lx = sxv; lz = szv; }
        if (hC + dL < lowH) { lowH = hC + dL; lx = -sxv; lz = -szv; }
        if (lowH < feetY - 0.4) { ux = lx; uz = lz; }
        sliding = true;
        break;
      }
    }
    // 滑动总预算 2.5 s：坟丛里两座相贴时，尸体可能在夹缝里怎么推都出不去
    //（换向也只是沿着壁来回蹭）。预算烧完就认命 —— 躺在坟缝、坟唇上，
    // 由下面的贴合与下垂把姿势收拾好；要消灭的只是「平摊在孤坟顶上悬空」。
    if (sliding) {
      s.corpseSlideT += dt;
      if (s.corpseSlideT > 2.5) sliding = false;
    }
    if (sliding) {
      // 卡住换向：推着却没挪动（被下一座坟的箱壁、箱角顶住）超过 0.35 s，
      // 就锁一个拧了 90° 的绕行航向推 0.6 s 沿壁走，到期回到正常算向，
      // 再堵就再拧。绕行必须**限时**：无时效的转角会叠着正常算向来回打摆，
      // 把尸体推回坟顶正中钉死（诊断 2026-08-27 第二轮抓过）。
      const moved = Math.hypot(t0.x - s.corpseSlidePX, t0.z - s.corpseSlidePZ);
      s.corpseStallT = moved < 0.35 * dt ? s.corpseStallT + dt : 0;
      if (s.corpseDetourT > 0) {
        s.corpseDetourT -= dt;
        ux = s.corpseDetourX;
        uz = s.corpseDetourZ;
      }
      if (s.corpseStallT > 0.35) {
        s.corpseDetourX = -uz;
        s.corpseDetourZ = ux;
        s.corpseDetourT = 0.6;
        s.corpseStallT = 0;
        ux = s.corpseDetourX;
        uz = s.corpseDetourZ;
      }
      const v0 = s.corpse.linvel();
      s.corpse.setLinvel({ x: ux * 1.4, y: Math.min(v0.y, 0), z: uz * 1.4 }, true);
    } else {
      s.corpseStallT = 0;
      s.corpseDetourT = 0;
    }
    s.corpseSlidePX = t0.x;
    s.corpseSlidePZ = t0.z;

    // **先钳地再读位置。** 反过来的话读到的是"还没落地"的那一帧，
    // 而尸体停稳之后刚体就被拆了，那个偏差会永久留在尸体上（实测下沉 0.15 m）。
    physics.ClampToGround(s.corpse, dt, { lift: s.corpse.userFeetOffset || 0.85, restitution: 0, rollDrag: sliding ? 1.2 : 6 });
    const t = s.corpse.translation();
    const feet = t.y - (s.corpse.userFeetOffset || 0);
    s.position.set(t.x, feet, t.z);

    // --- 贴合：躯干对齐地表，悬空的肢体往下垂 ------------------------------
    // 倒地动画假设的是平地；真实落点是斜坡、坟包、台缘。躯干的俯仰/侧倾照
    // 拟合面套在 root 上（死人 root 的朝向本来就没人再管），肢体按「末端相对
    // 拟合面悬空多少」折算 0—1 的下垂量喂给 PoseRagdoll。都带平滑，滑动途中
    // 地形变了姿态跟着缓过去，不跳。
    const p = Clamp01((s.deadTime - 0.25) / 0.65);
    const ease = p * p * (3 - 2 * p);
    const k = Math.min(1, 8 * dt);
    s.corpseTiltX += (Clamp(Math.atan(slopeF), -0.6, 0.6) * ease - s.corpseTiltX) * k;
    s.corpseTiltZ += (Clamp(Math.atan(slopeS), -0.6, 0.6) * ease - s.corpseTiltZ) * k;
    const rF = dF - (cF - cB) / 2, rB = dB + (cF - cB) / 2;      // 相对拟合面的残差
    const rR = dR - (cR - cL) / 2, rL = dL + (cR - cL) / 2;
    const hangEnds = Clamp01(Math.max(-rF, -rB) / 0.35);
    const hangAll = Clamp01(Math.max(-rF, -rB, -rR, -rL) / 0.35);
    s.corpseDroopBody += (hangEnds * ease - s.corpseDroopBody) * k;
    s.corpseDroopArms += (hangAll * ease - s.corpseDroopArms) * k;
    if (s.actor) {
      s.actor.root.position.copy(s.position);
      s.actor.root.rotation.set(s.corpseTiltX, s.yaw, s.corpseTiltZ, "YXZ");
      if (s.actor.ragdollState) {
        s.actor.ragdollState.droopBody = s.corpseDroopBody;
        s.actor.ragdollState.droopArms = s.corpseDroopArms;
      }
    }

    const v = s.corpse.linvel();
    // 滑动中不落定 —— 落定拆刚体，人会冻在坡腰上。8 秒是硬闸，防止在两个
    // 采样点之间来回振荡的病态地形把刚体永远留在场上。
    if ((!sliding && (s.deadTime > 4 || (Math.hypot(v.x, v.y, v.z) < 0.08 && s.deadTime > 0.6))) || s.deadTime > 8) {
      physics.RemoveBody(s.corpse);
      s.corpse = null;
      s.corpseSettled = true;
    }
  }

  /**
   * 走一步（AI 侧）。位移与落地全部交给角色控制器，与玩家同一套解算。
   *
   * 姿态一变就换胶囊：趴着的人只有 0.58 m 高，得能从 0.6 m 的窗台底下爬过去，
   * 而站着的人不行 —— 这一条在原来的 Blocked() 里是做不到的（它只认一个高度）。
   *
   * 没有物理世界时退回老路（Blocked + StandHeight）：编辑器在切片重建的空档里
   * 也会驱动 AI，那时物理世界正好是空的。
   */
  StepBody(s, dx, dz, dt) {
    const body = s.body;
    if (!body) {
      const bf = this.ctx.battlefield;
      const cap = s.childCapsules?.[s.stance] || s.childCapsules?.[0];
      this.ctx.audioWiring?.AiStep(s, dx, dz);
      if (!this.Blocked(s.position.x + dx, s.position.z, s.position.y, cap)) s.position.x += dx;
      if (!this.Blocked(s.position.x, s.position.z + dz, s.position.y, cap)) s.position.z += dz;
      s.position.y = bf.StandHeight(s.position.x, s.position.z, s.position.y);
      return;
    }
    // 有人绕过物理直接改了 position（撒兵、剧本摆位、冒烟脚本摆人）就认外面那份。
    // 不对账的话表现很怪：把人挪到某处，下一帧他自己"弹"回胶囊所在的老位置 ——
    // 通关冒烟里「圈里留一个敌人」那一条就是这么失效的（人被弹回去，圈里没人了）。
    this.ctx.audioWiring?.AiStep(s, dx, dz);
    body.ReconcileTo(s.position.x, s.position.y, s.position.z);
    const capsules = s.childCapsules || CAPSULE;
    const cap = capsules[s.stance] || capsules[0];
    body.SetSize(cap.radius, cap.height);
    s.velocityY = s.grounded ? -0.6 : s.velocityY - 19.6 * dt;   // 贴地那一点向下的力保证 grounded 稳定
    const r = body.Move(dx, s.velocityY * dt, dz);
    s.position.set(r.x, r.y, r.z);
    s.grounded = r.grounded;
    if (r.grounded) s.velocityY = 0;
  }

  Blocked(x, z, y, capsule = null) {
    const radius = capsule?.radius ?? .35;
    const height = capsule?.height ?? 1.6;
    const list = this.ctx.battlefield.NearbyColliders(x, z, 1.2);
    for (const b of list) {
      if (x < b.min[0] - radius || x > b.max[0] + radius) continue;
      if (z < b.min[2] - radius || z > b.max[2] + radius) continue;
      if (y + height < b.min[1] || y > b.max[1]) continue;
      if (b.max[1] - y < TRAVERSAL.stepMax) continue;  // 矮的东西自动抬腿跨过去
      return true;
    }
    return false;
  }

  /**
   * 投一枚手榴弹（docs/Data_EnemyAi.md §4.4）。
   *
   * 走的是**玩家那条投掷链**：`actor.BeginGrenadeThrow(release)` 把弹压到动画的
   * 脱手帧，脱手时 `combat.Throw` 造一枚真的投掷物（弹道、刚体、爆炸、返掷全都一样）。
   * 范本是剧本齐投 `VolleyThrow`，两处唯一的差别是 owner —— 见下面那段。
   *
   * **owner 必须传对**：`Combat.Throw` 的 owner 以前写死 "player"，而 `Detonate`
   * 按 owner 决定 `hurtSide`（伤哪一方）与 `byPlayer`（算不算玩家的战绩）。
   * 日军的弹传 `owner:"ija"` 之后：伤中方与玩家（玩家在 Blast 里单独结算，
   * 不受 hurtSide 约束）、不给玩家记击杀、HUD 的返掷提示按 owner!=="player"
   * 立刻报警（不吃 0.35 s 的己方宽限）。
   */
  TryGrenade(s, player) {
    if (!s.target || !this.CanThrowGrenade(s)) { s.state = STATE.FIRE; return; }
    const actor = s.actor;
    if (actor.pendingGrenadeThrow || actor.characterRig?.infantry?.IsThrowing()) return;
    // 瞄点：目标此刻的位置（看得见）或最后目击位置。抛物线的落点由 Combat 自己解。
    const at = s.targetVisible || !s.lkp ? s.target.position : s.lkp;
    const dir = this.tmpD.set(at.x - s.position.x, 0, at.z - s.position.z);
    if (dir.lengthSq() < 1e-4) { s.state = STATE.FIRE; return; }
    dir.normalize();
    // **不许直接把 yaw 掰过去**：人体一帧转不了 180°，而 `AiBehaviorTest` 有一条
    // 「身体没有逐帧瞬转」的硬闸。GRENADE 状态本来就不移动，Act 里的
    // `moveSpeed < 0.08 → wantedYaw = targetYaw` 会按转速把他转过去；
    // 这里只等他转到位（与 TryFire 的枪口方向闸同一条口径）。
    if (Math.abs(AngleDelta(s.yaw, Math.atan2(-dir.x, -dir.z))) > BRAIN.faceTargetRad) return;
    const combat = this.ctx.combat;
    const from = this.tmpB.set(s.position.x, s.position.y + BRAIN.grenadeReleaseY, s.position.z);
    const dirCopy = dir.clone();          // 脱手回调在几帧之后才跑，不能借复用向量
    const fromCopy = from.clone();
    const power = BRAIN.grenadePowerMin + s.rnd() * (BRAIN.grenadePowerMax - BRAIN.grenadePowerMin);
    const Release = (handPosition) => {
      if (!s.alive) return;
      combat.Throw("Grenade", power, handPosition || fromCopy, dirCopy, 0,
        { owner: s.side, ownerId: s.id });
    };
    if (!actor.BeginGrenadeThrow(Release)) Release(fromCopy);
    // 冷却由 Tactics 记（班组一枚一枚地扔，不是一起扔）；携行也由它扣。
    this.tactics.NoteGrenadeThrown(s, this.time, true);
    this.stats.grenades += 1;
    this.Bark(s, "grenade");
    s.state = STATE.FIRE;
  }

  /**
   * 白刃。上了刺刀冲到 2 m 以内是真的捅，不是跑过去继续开枪 ——
   * 「上刺刀」按下去只是让人跑快一点的话，这个动词就还是假的。
   */
  TryBayonet(s, dt, player) {
    // The shared director owns windup, contact, parry and recovery for both sides.
    // No immediate damage or automatic QTE path remains here.
    if (s.unarmed || s.scriptDefensive || !s.bayonetFixed || !s.target) return;
    this.ctx.meleeCombat?.Fighter(s);
  }

  /**
   * 剧本守点单位的状态（第一关的前沿日军全走这一支）。
   *
   * **`s.cover = null` 那一句删掉了**（docs/Data_EnemyAi.md §2.2 的第一条病根）：
   * 它是「正片里的敌人在设计上被禁止找掩体」的字面原因 —— 第一关每一个前沿日军
   * 都被 `Defend()` 置了 scriptDefensive，而这个函数第一句就把刚选好的掩体扔掉。
   * 现在守点只管**不许追击、不许绕后、不许跃进出区**（scriptDefensive 这个旗
   * 在 `Script_AiTactics.IsScripted` 里就是这个意思），能不能躲另说。
   */
  ApplyScriptDefense(s) {
    s.order = "hold"; s.bayonetFixed = false;
    if(s.scriptSuppressible && s.suppression>=.5){
      s.state=STATE.SUPPRESSED;
      this.SetStance(s,s.suppression>.8?2:1,1.5,s.suppression>.8);
      return;
    }
    if (s.ammo <= 0) {
      if (s.state !== STATE.RELOAD) {
        s.reloadTimer = s.weapon.reloadTimeS || 3.2;
        this.ctx?.audioWiring?.AiReload(s, s.weapon.kind);
      }
      s.state = STATE.RELOAD;
    } else if (!s.target) {
      // 【2026-09-09 §15】守点单位没有目标：听见 / 看见过动静的人**不站直**（WATCH），
      // 彻底安静的才是 IDLE。级别在 Think 里判完写进 `s.watchAlerted` —— 这一段
      // 每帧都跑，而且被 `Script_FirstLevelP012ActorTest` 抽进没有表也没有
      // ALERT_ORDER 的纯 JS 沙箱重放，所以这儿只许读那个布尔。
      s.state = s.watchAlerted ? STATE.WATCH : STATE.IDLE;
    } else if (s.task && s.task.kind === TASK.GRENADE && this.time < s.task.until
      && this.CanThrowGrenade(s)) {
      // 投弹是**原地能做的事**，所以剧本守点单位也许可（Script_AiTactics 的
      // `HOLD_SAFE_TASKS` 就是这么定的：守区的人不许绕后、不许跃进，但可以扔）。
      s.state = STATE.GRENADE;
    } else if (s.cover) {
      // 有掩体就在掩体里打：缩头 → 探头 → 点射 → 缩头，走位半径由 holdZone 管着。
      s.state = STATE.COVER_ENGAGE;
    } else {
      s.state = STATE.FIRE;
    }
  }

  /**
   * 守点单位这一帧允许挪到哪儿（`Act` 的 scriptDefensive 分支读它）。
   *
   * 允许的范围是「锚点半径 + `scriptCoverSlackM`」：机枪位只放行一个侧步（探头），
   * 普通守兵放行进掩体、换掩体。超出范围一律不给 —— 守点纪律没有松动。
   *
   * 这个方法**故意不写在 Act 的那段源码里**：`Script_FirstLevelP012RuntimeTest`
   * 会把 Act 的 `switch (s.state)` 到 `if (desired && speed > 0)` 之间整段抽出来
   * 放进纯 JS 沙箱重放，沙箱里没有 AiDirector 实例，所以那段只许出现
   * `this.xxx ? this.xxx(...) : 兜底` 这种可缺省的调用。
   */
  ScriptDefenseSpot(s, anchor) {
    const m = s.moveOrder;
    if (!m) return null;
    const limit = (Number.isFinite(anchor.radius) ? anchor.radius : 0)
      + (Number.isFinite(s.scriptCoverSlackM) ? s.scriptCoverSlackM : 0);
    const dx = m.x - anchor.x;
    const dz = m.z - anchor.z;
    if (Math.sqrt(dx * dx + dz * dz) > limit) return null;
    const out = this._defenseSpot || (this._defenseSpot = { x: 0, z: 0, speed: 0, arriveM: 1.2 });
    out.x = m.x; out.z = m.z; out.speed = m.speed;
    out.arriveM = Number.isFinite(s.moveArriveM) ? s.moveArriveM : 1.2;
    return out;
  }

  ScriptFireFactors(s) {
    return {
      interval: Number.isFinite(s.scriptFireIntervalScale) ? Math.max(0.1, Math.min(20, s.scriptFireIntervalScale)) : 1,
      accuracy: Number.isFinite(s.scriptAccuracyScale) ? Math.max(0, Math.min(4, s.scriptAccuracyScale)) : 1,
    };
  }

  /**
   * AI 命中玩家的部位。命中率那一掷已经说了「这发打中了」，几何只回答打中哪儿：
   * 在瞄点周围按 COMBAT.player.aimScatterM（1σ，米）散一个点，从枪口向它射线，
   * 碰到玩家的哪根胶囊就是哪个部位；散出去没碰到身体的那一支算躯干 ——
   * 不能让几何把命中率偷偷再打一次折（那会让 docs/Data_PlayerDamage.md 的 TTK 账全部作废）。
   */
  PlayerHitPart(s, from, aim, dir, player) {
    const sigma = COMBAT.player?.aimScatterM ?? 0.24;
    const boxes = PlayerHitboxes(player.position, player.yaw, player.stance, this.playerBoxes, player.LeanOffsetM);
    const [g1, g2] = GaussianPair(s.rnd);
    const u = this.tmpU.set(dir.z, 0, -dir.x);
    if (u.lengthSq() < 1e-8) u.set(1, 0, 0);
    u.normalize();
    const w = this.tmpW.crossVectors(dir, u);
    const target = this.tmpT.copy(aim).addScaledVector(u, g1 * sigma).addScaledVector(w, g2 * sigma);
    // **不能借 tmpD**：Act 的 `desired` 用的就是它（构造器里那段注释说的正是这件事），
    // 而 TryFire 是在 `case STATE.FIRE:` 把 desired 摆好之后才调的 ——
    // 借了就等于把「去掩体」的目标点就地改成一条归一化的射击方向。
    const d = this.tmpHit.subVectors(target, from).normalize();
    const struck = RaycastPlayerHitboxes(from, d, boxes);
    return struck ? struck.part : "torso";
  }

  /**
   * 把这一发的枪口写进 `s.muzzleWorld`（`ShootingModel.MuzzleOrigin` 读它）。
   *
   * Actor 的世界矩阵是 `Act` 每帧从 `s.position` 同步的。规则层直调 TryFire 的场合
   * （伤害靶场、AiBehaviorTest 的过热对账）人被瞬移过，而 actor.root 还停在出生点 ——
   * 拿那个枪口去打射线就是从几十米外开枪。所以先对一次账，对不上就**不写**，
   * 让 MuzzleOrigin 走它自己的姿态高兜底（眼高 − muzzleDropM）。
   */
  UpdateMuzzle(s) {
    s.muzzleWorld = null;
    const root = s.actor && s.actor.root;
    if (!root) return;
    // **骨架没在更新的人，枪口是假的**：`Act` 只在 `root.visible` 时调 `actor.Update`，
    // 而远景层与镜头外的人 `visible = false`（`CullActors` 把整棵子树摘掉了）。
    // 那时 weaponGroup 的局部变换还停在上一次更新甚至出生姿势上，
    // `MuzzleWorld` 会把枪口算到脚底下 —— 暴露采样的射线从地里射出去，
    // 一条都通不过，整条战线静默退化成「只会压制射击」。
    if (!root.visible) return;
    const dx = root.position.x - s.position.x;
    const dy = root.position.y - s.position.y;
    const dz = root.position.z - s.position.z;
    if (dx * dx + dy * dy + dz * dz > BRAIN.muzzleSyncM * BRAIN.muzzleSyncM) return;
    const m = s.actor.MuzzleWorld(this.tmpMuzzle);
    const out = s.muzzleStore || (s.muzzleStore = { x: 0, y: 0, z: 0 });
    out.x = m.x; out.y = m.y; out.z = m.z;
    s.muzzleWorld = out;
  }

  /**
   * 射击走廊要避开的友军躯干。返回**复用数组**（槽也是复用的）。
   *
   * 只收 `allyCorridorM` 内的活人：更远的人挡不住这一枪，而全场扫一遍
   * 在 110 人规模下是每发一次的 O(N)。
   */
  FriendlyTorsos(s) {
    const out = this._fireAllies;
    let n = 0;
    const r2 = BRAIN.allyCorridorM * BRAIN.allyCorridorM;
    for (let i = 0; i < this.soldiers.length; i += 1) {
      const o = this.soldiers[i];
      if (o === s || o.side !== s.side || !o.alive) continue;
      const dx = o.position.x - s.position.x;
      const dz = o.position.z - s.position.z;
      if (dx * dx + dz * dz > r2) continue;
      let slot = out[n];
      if (!slot) { slot = { x: 0, y: 0, z: 0, radius: 0 }; out[n] = slot; }
      slot.x = o.position.x;
      slot.y = o.position.y + AiDirector.StanceEye(o.stance, o) - BRAIN.torsoBelowEyeM;
      slot.z = o.position.z;
      slot.radius = (o.childCapsules?.[o.stance] || CAPSULE[o.stance] || CAPSULE[0]).radius;
      n += 1;
    }
    out.length = n;
    return out;
  }

  /**
   * 目标锁掉了，但记忆里还留着一条够新的敌情 —— 把它接回来当「记忆目标」。
   *
   * 修的是 §2.1 那条病根的后半段：**看不见就发呆**。听见背后一枪、跟丢了一个人之后，
   * 旧代码（与第二波接入前的这一版）会把 `s.target` 清成 null，于是状态机落回
   * ADVANCE —— 有守区的人连挪都不挪，站在原地等下一发。现在他会进掩体、
   * 向最后目击位置压制射击，直到记忆过期。
   *
   * 三条硬规矩：
   *   · 位置用 `s.lkp`（我们**知道**的位置），不用 ref 的真坐标 —— 那是开天眼；
   *   · `targetVisible` 恒 false ⇒ `TryFire` 只走压制射击（baseAccuracy = 0，永不命中）；
   *   · 打上 `targetFromMemory` 标记：不占「同时锁玩家的人数」名额，也不许发起白刃冲锋。
   *
   * @returns {boolean} 有没有接回来
   */
  ReviveTargetFromMemory(s, sense) {
    if ((s.lkpConfidence || 0) < TACTICS.suppressConfidence) return false;
    const mem = s.perception;
    if (!mem || !mem.list) return false;
    // 两条不同的尺（迟滞）：**接一个新的**要够可信，**留住手上这个**只要记忆还在。
    // 一把尺量到底的话，两条记忆的置信度一交叉就换一次人、跌破阈值就丢一次目标，
    // 十二秒能换十几次 —— `AiBehaviorTest` 的「不来回甩枪口」当场翻红，
    // 玩家看到的也是枪口在两个方向之间抽。
    let best = null;
    let keep = null;
    for (let i = 0; i < mem.list.length; i += 1) {
      const t = mem.list[i];
      if (!t.ref) continue;
      if (t.isPlayer ? !(this.ctx.player && this.ctx.player.Alive) : t.ref.alive === false) continue;
      if (s.target && t.id === s.target.id) { keep = t; continue; }
      if (t.confidence < TACTICS.suppressConfidence) continue;
      if (!best || t.confidence > best.confidence) best = t;
    }
    if (keep) best = keep;
    if (!best) return false;
    if (!s.target || s.target.id !== best.id) {
      if (s.target) this.tactics.ReleaseToken(s.id);
      s.target = {
        position: s.lkp, isPlayer: !!best.isPlayer, ref: best.ref,
        id: best.id, stance: best.stance | 0,
      };
    } else {
      s.target.position = s.lkp;
      s.target.stance = best.stance | 0;
    }
    s.targetVisible = false;
    s.targetFromMemory = true;
    void sense;
    return true;
  }

  /** 目标这一帧在不在动（瞄准扩散用）。玩家读 velocity，AI 读动作信号 moveSpeed。 */
  TargetMoving(s, player) {
    const t = s.target;
    if (!t) return false;
    if (t.isPlayer) {
      const v = player && player.velocity;
      return !!v && Math.sqrt(v.x * v.x + v.z * v.z) > BRAIN.movingMps;
    }
    return !!t.ref && t.ref.moveSpeed > BRAIN.movingSignal;
  }

  /** 身高缩放（童子军的胶囊比成人矮）。暴露采样按它摆采样柱。 */
  static HeightScale(ref) {
    const h = ref?.childCapsules?.[0]?.height;
    return Number.isFinite(h) && h > 0 ? h / CAPSULE[0].height : 1;
  }

  /** Visible close threats can take a distant shooter's slot, never add one. */
  AcquireFireToken(s, targetId, player) {
    if (this.tactics.AcquireToken(targetId, s.id, s.target.isPlayer)) return true;
    if (!s.target.isPlayer || !player
      || s.position.distanceTo(player.position) > CLOSE_RANGE.priorityM) return false;
    let farthest = null;
    const nearDistance = s.position.distanceTo(player.position);
    let distance = Math.max(nearDistance * CLOSE_RANGE.priorityDistanceRatio,
      nearDistance + CLOSE_RANGE.priorityDistanceGapM);
    for (const other of this.soldiers) {
      if (other === s || !this.tactics.HasToken(other.id, targetId)) continue;
      const d = other.position.distanceTo(player.position);
      if (d > distance) { distance = d; farthest = other; }
    }
    if (!farthest) return false;
    this.tactics.ReleaseToken(farthest.id);
    return this.tactics.AcquireToken(targetId, s.id, true);
  }

  TryFire(s, dt, player) {
    if (s.unarmed) return;
    s.fireTimer -= dt;
    // 潜行的班不许开枪 —— 这是那道命令的全部代价，也是它区别于"跟我来"的地方
    if (s.order === "covert" && this.time < s.covertUntil) return;
    // 过热：Type11.overheatShots = 200 / coolDownS = 8.0 以前是死字段。
    // 冷却期间枪口冒白烟并且**真的打不出去** —— 这就是玩家冲过街口的那个窗口。
    if (this.time < s.coolUntil) return;
    // 瞄准误差每帧收敛。**必须排在 fireTimer 那道闸前面** —— 两发之间的等待
    // 正是瞄准收敛的时间；排在后面的话误差永远停在初值，AI 再也瞄不准。
    if (s.target) {
      this.shooting.UpdateAim(s, dt, {
        moving: s.moveSpeed > BRAIN.movingSignal,
        suppression: s.suppression,
        stance: s.stance,
        // **现算，不吃 Think 的隔夜数据**：瞄准扩散每帧都在用这一位，
        // 而 Think 是 1/6 分帧的，拿它的缓存会让「目标停下来了」晚 0.1 s 才生效，
        // 更糟的是规则层直调（靶场）根本不跑 Think，那一位会一直冻在开局的值上。
        targetMoving: this.TargetMoving(s, player),
        exposedS: s.targetExposedS || 0,
      });
    }
    if (s.fireTimer > 0 || !s.target || s.ammo <= 0) return;
    s.aimTime += dt;
    // Authored fire windows hold the trigger, while cooling and acquiring aim
    // continue normally between bursts.
    if (s.missionSurfaceRest || (s.missionFireHold && s.target.isPlayer)) return;
    const aimNeeded = s.weapon.aiAimTimeS ?? 0.8;
    if (s.aimTime < aimNeeded * (1 + s.suppression)) return;
    // 枪口还没转过去就不能凭概率从侧后方命中。方向闸门也让「转身—瞄准—开火」
    // 成为能看懂的动作链，而不是身体原地转圈、子弹照样四面飞。
    const tx = s.target.position.x - s.position.x;
    const tz = s.target.position.z - s.position.z;
    const targetYaw = Math.atan2(-tx, -tz);
    if (Math.abs(AngleDelta(s.yaw, targetYaw)) > 0.34) return;

    // --- 这一发是瞄准射击还是压制射击 -------------------------------------
    // 三道闸，任何一道不过就尝试压制：看不见 / 没抢到攻击令牌 / 暴露采样全被挡。
    // 压制射击**不占令牌**（否则「没令牌→去压制→压制又要令牌」是死循环）。
    this.UpdateMuzzle(s);
    const from = this.shooting.MuzzleOrigin(s);
    const toPlayer = s.target.isPlayer && !!player;
    const targetId = s.target.isPlayer ? PLAYER_TRACK_ID : s.target.id;
    let exposure = 0;
    let aimed = null;
    if (s.targetVisible !== false) {
      const samples = toPlayer
        ? this.shooting.PlayerSamples(player)
        : this.shooting.SoldierSamples(s.target.position, s.target.stance, undefined,
          AiDirector.HeightScale(s.target.ref));
      const seen = this.shooting.Exposure(s, from, samples, { targetId, now: this.time });
      if (seen.fraction > 0 && this.AcquireFireToken(s, targetId, player)) {
        exposure = seen.fraction;
        aimed = seen.aimPoint;
      }
    }

    const aimV = this.tmpB;
    if (aimed) {
      aimV.set(aimed.x, aimed.y, aimed.z);
    } else {
      // 打不着人就打他躲的那个地方：最后目击位置 / 掩体沿上方 0.3 m。
      // 情报太旧或太不可信就干脆闭嘴 —— 那才是「没有目标」，不是「盲射」。
      // **看得见就一定够可信**：没抢到令牌的人照样要开火压住对面，
      // 否则「令牌满了 → 转压制 → 压制又被情报闸挡掉 → 干脆不打」。
      if (!s.targetVisible && (s.lkpConfidence || 0) < TACTICS.suppressConfidence) return;
      const lkp = s.targetVisible ? s.target.position : (s.lkp || s.target.position);
      const hideCover = !s.target.isPlayer && s.target.ref ? s.target.ref.cover : null;
      const point = this.shooting.SuppressPoint(lkp, hideCover);
      aimV.set(point.x, point.y, point.z);
    }
    // 玩家有自己的命中几何（Script_PlayerHitbox）：暴露采样已经按那套几何挑好了
    // 瞄点（趴着瞄背心、探身瞄露出来的头），这里不再另算一次 PlayerAimPoint。
    const fromV = this.tmpA.set(from.x, from.y, from.z);
    const dir = this.tmpC.subVectors(aimV, fromV);
    const dist = dir.length();
    dir.divideScalar(dist || 1);

    // Remember the exposed body part for pre-shot tracking on following frames.
    s.lookPitch = this.shooting.LookPitch(from, aimV);
    if (aimed) {
      const samples = toPlayer ? this.shooting.PlayerSamples(player)
        : this.shooting.SoldierSamples(s.target.position, s.target.stance, undefined,
          AiDirector.HeightScale(s.target.ref));
      const sample = samples.find(p => Math.hypot(p.x - aimV.x, p.y - aimV.y, p.z - aimV.z) < 0.01);
      s.visualAimPart = sample?.part;
      s.visualAimTargetId = targetId;
    }
    // Body yaw alone cannot validate a skinned weapon (kneeling/turning/raising).
    // Hidden LOD actors retain the rule-layer origin and facing fallback.
    if (s.muzzleWorld && typeof s.actor?.MuzzleDirection === "function"
        && (s.aimBlend < BRAIN.fireAimBlendMin
          || s.actor.MuzzleDirection(this.tmpMuzzle).dot(dir) < Math.cos(BRAIN.fireBarrelAngleRad))) return;

    // 射击线上有自己人就不扣扳机（后排隔着前排的后脑勺开枪）。
    if (!this.shooting.LineOfFireClear(from, aimV, this.FriendlyTorsos(s))) return;

    // Suppression still needs a reachable point above cover or at the last sighting.
    // A hidden target must not turn a solid intervening wall into an endless firing
    // order. Recheck aimed shots too: exposure/visibility may predate a moving blocker.
    if (!this.shooting.ShotPathClear(from, aimV)) return;

    s.ammo -= 1;
    const scriptFactors = this.ScriptFireFactors(s);
    // 点射：BurstPlan 消费 Data_Weapons 的 aiBurstMin/Max（这一轮之前是死字段）。
    // 步枪恒 1 发 + 0 停顿 ⇒ fireTimer 与旧式子逐位相同；机枪打完一梭子才加停顿。
    if (!(s.burstLeft > 0)) {
      const plan = this.shooting.BurstPlan(s.weapon, s.rnd);
      s.burstLeft = plan.shots;
      s.burstIntervalS = plan.intervalS;
      s.burstPauseS = plan.pauseS;
    }
    s.burstLeft -= 1;
    s.fireTimer = (s.burstIntervalS + (s.burstLeft > 0 ? 0 : s.burstPauseS)) * scriptFactors.interval;
    s.lastFire = this.time;
    s.fireSequence += 1;
    s.aimTime = 0;
    this.fireCount += 1;              // 通关冒烟要的是"仗真的打起来了"的运行时证据
    if (aimed) this.stats.aimedShots += 1; else this.stats.suppressShots += 1;
    // AI 的枪声也是刺激：一条街上的人听得见谁在开火（docs/Data_EnemyAi.md §4.1）。
    this.NoteStimulus(s.weapon.rpm ? "machinegun" : "gunshot", s.position,
      { side: s.side, sourceId: s.id, ref: s });

    // 打满 overheatShots 就强制冷却。挂一根白烟在枪口上，让"它现在打不了"看得见。
    if (DIFFICULTY.overheat && s.weapon.overheatShots) {
      s.heat += 1;
      if (s.heat >= s.weapon.overheatShots) {
        s.heat = 0;
        s.coolUntil = this.time + (s.weapon.coolDownS ?? 8);
        if (this.ctx.vfx) {
          s.heatSmoke = this.ctx.vfx.SmokeSource(
            { x: s.position.x, y: s.position.y + 0.9, z: s.position.z },
            { kind: "screen", rate: 6, radius: 0.18, rise: 1.2,
              sizeStart: 0.10, sizeEnd: 0.9, life: 1.8, opacity: 0.30 });
        }
      }
    }

    // 命中判定：基础命中率按距离、压制、姿态修正。**AI 不许百发百中** ——
    // 那会让玩家觉得自己在被作弊，而不是在被压制。
    let acc = COMBAT.aiAccuracyBase * (DIFFICULTY.aiAccuracy ?? 1) * scriptFactors.accuracy;
    // 距离衰减按**绝对米数**，不按枪的标称有效射程 —— 三八式标称 460 m，
    // 于是原来的式子在 27 m 上算出来还是满命中（1.25 − 0.09 → 钳到 1）。
    // 实际上机械瞄具打一个会动的人：25 m 内基本能打中，100 m 打一半，200 m 靠运气。
    acc *= Clamp(1.0 - Math.max(0, dist - 25) / 175, 0.10, 1);
    const closeWeight = toPlayer ? CloseRangeWeight(dist) : 0;
    if (s.target.isPlayer && player) {
      acc *= COMBAT.player?.accuracyScale ?? 1;
      // Explicit zero accuracy still disables damage (script/debug contract).
      // Nearby visible bodies should not inherit the campaign's 0.28 multiplier.
      if (acc > 0) {
        const closeAccuracy = Math.min(CLOSE_RANGE.maxAccuracy,
          CLOSE_RANGE.accuracy * (DIFFICULTY.aiAccuracy ?? 1));
        acc += (Math.max(acc, closeAccuracy) - acc) * closeWeight;
      }
      const stanceScale = player.stance === "prone" ? 0.45 : player.stance === "crouch" ? 0.72 : 1;
      acc *= stanceScale + (1 - stanceScale) * closeWeight;
    }
    acc *= s.suppression > 0.3 ? COMBAT.aiAccuracySuppressed / COMBAT.aiAccuracyBase : 1;

    // Distant crossfire keeps the warning-miss window. At close contact the
    // shorter window allows a properly acquired first shot to inflict damage.
    const farGrace = COMBAT.player?.firstShotGraceS ?? 0;
    const grace = farGrace + (Math.min(farGrace, CLOSE_RANGE.firstShotGraceS) - farGrace) * closeWeight;
    const firstShot = s.target.isPlayer
      && this.time - (s.playerLockAt ?? -99) < grace;
    if (firstShot) acc = 0;

    // Resolve adds exposure and acquisition error after the distance-aware
    // player balance. The existing 25 m+ damage/TTK baseline is unchanged.
    // 压制射击传 baseAccuracy = 0 且 exposure = 0：永不命中，但近失弹压制照旧。
    const shot = this.shooting.Resolve(s, from, aimV, {
      baseAccuracy: aimed ? acc : 0,
      exposure: aimed ? exposure : 0,
      distance: dist,
      targetRadiusM: toPlayer ? CLOSE_RANGE.targetRadiusM : 0,
      rnd: s.rnd,
    });
    const hit = shot.hit;
    // 曳光与弹着都跟着**真正飞出去的那条线**走：打偏时是 missDir，不再是瞄点方向
    // 加一团随机偏移（那会让曳光穿过目标、弹着却出现在别处）。
    const flight = hit ? shot.dir : shot.missDir;
    dir.set(flight.x, flight.y, flight.z);
    const vfx = this.ctx.vfx;
    const audio = this.ctx.audio;
    if (vfx) {
      vfx.MuzzleFlash(fromV, dir, {
        scale: s.weapon.kind === "lmg" ? 1.15 : 1,
        kind: s.weapon.kind,
      });
      vfx.Tracer(fromV, this.tmpEnd.copy(fromV).addScaledVector(dir, dist), {
        kind: s.side === "nra" ? "nra" : "ija",
      });
    }
    // 这一发的枪声本体 cue。**在 if (audio) 外面算**：近失弹那条链要拿它算
    // 「弹啸不许比自己这一枪还响」的上限（见 AudioWiring.CrackVolume）。
    const gunCue = s.side === "nra"
      ? (s.weaponId === "Zb26" ? "zb26" : "rifleNra")
      : (s.weaponId === "Type11" ? "type11" : s.weaponId === "Type92Hmg" ? "type92" : "rifleIja");
    if (audio) {
      const name = gunCue;
      // PlayGunshot 而不是 Play：一百米外那一枪要换成**另一段录音**，
      // 不是同一段加低通（Script_Audio.FAR_CUE 那段注释）。
      // 步枪走两层交叉淡入，机枪没有远场素材、内部自动落回 Play()。
      audio.PlayGunshot(name, { position: fromV.clone(), volume: 1 });
    }
    // 每发之后的拉栓。玩家自己那一支早就有了（Script_Main.TryFire），
    // 而**满场几十个兵一条 foley 都没有** —— 于是敌人开枪只是一记枪声，
    // 听不出他是栓动还是自动、也听不出他打完了这一发正在低头拉栓。
    // 只有栓动才有：捷克式、歪把子、九二式自己上膛。
    this.ctx.audioWiring?.AiBolt(s, s.weapon.kind === "boltRifle");

    // Threat feedback is tied to this bullet's unobstructed segment, independent
    // of audio being enabled and of whom the enemy intended to shoot.
    if (player?.Alive && s.side === "ija" && !(hit && toPlayer)) {
      const pass = this.shooting.PlayerNearMiss(from, dir, player, hit ? dist : dist + 6, COMBAT.suppressRadius);
      if (Number.isFinite(pass)) {
        player.Suppress(COMBAT.suppressPerNearMiss * (1 - pass / COMBAT.suppressRadius) * 3, "bullet", from);
      }
    }

    if (hit) {
      if (toPlayer) {
        // 打玩家的部位不抽概率：照 aimScatterM 在瞄点周围散一个点，射线去碰玩家自己的
        // 命中几何 —— 站着基本打躯干，趴着头露在最前面（部位倍率见 COMBAT.player）。
        const part = this.PlayerHitPart(s, fromV, aimV, dir, player);
        player.TakeHit(s.weapon.damage * (COMBAT.player?.bulletScale ?? 0.40), part, dir, {
          from: fromV.clone(), bullet: true,
        });
      } else if (s.target.ref) {
        // AI 打 AI 仍按概率抽部位：那边的胶囊是给玩家的子弹用的，这条链一帧几十发不做几何。
        const part = s.rnd() < 0.08 ? "head" : s.rnd() < 0.6 ? "torso" : (s.rnd() < 0.5 ? "arm" : "leg");
        // shapeId 留空：这条链不做几何（一帧几十发），断肢规则层按部位与权重自己挑段。
        const died = s.target.ref.TakeHit(s.weapon.damage, part, dir,
          { kind: s.weapon.rpm ? "hmg" : "bullet", weaponId: s.weaponId, point: aimV.clone() });
        if (vfx) vfx.Blood(aimV, dir, died ? 1 : 0.5);
      }
    } else {
      // 打偏了：仍然要压制。近失弹从耳边过去，那声音本身就是武器。
      // 压制射击走的也是这一支 —— 「藏起来也有子弹擦着掩体过」就是它。
      if (s.target.isPlayer && player) {
        const miss = 0.4 + s.rnd() * 1.4;
        // Retain the legacy random draw so the damage sequence does not drift;
        // suppression and its bearing now use the actual passage measured above.
        // **打偏的这一发要听得见。**
        //
        // `dir` 这时已经是 `shot.missDir` —— 这一发**真正飞出去的方向**
        //（散布按瞄准误差 × 距离算，见 Script_AiShooting.Resolve）。
        // 接线层拿它对听者求垂足，得到真的掠过点与掠过距离；上面那个 `miss`
        // 只喂压制账（它与距离无关，拿来定位弹啸会让一百五十米外的流弹
        // 也在耳边炸，见 AudioWiring.AiNearMissAtPlayer 的头注）。
        // 挡住就不播：子弹根本没到那儿，而 targetVisible 只保证开枪那一刻能看见，
        // 弹道上后来挡进来的东西（塌下来的墙、走过去的人）它管不着。
        this.ctx.audioWiring?.AiNearMissAtPlayer(s, from, dir, aimV, miss, gunCue);
      } else if (s.target.ref) {
        s.target.ref.suppression = Clamp01(s.target.ref.suppression + COMBAT.suppressPerNearMiss);
      }
      if (vfx) {
        // 弹着点由 Resolve 给：散布是按**瞄准误差 × 距离**算的高斯，
        // 不再是围着瞄点撒的一团各向同性随机数（那个数跟枪、跟距离都没关系）。
        const bf = this.ctx.battlefield;
        const h = bf.Raycast(fromV, dir, dist + 6);
        if (h) {
          const p = fromV.clone().addScaledVector(dir, h.t);
          const normal = new THREE.Vector3(h.normal[0], h.normal[1], h.normal[2]);
          const tag = h.box ? h.box.tag : "wall";
          const surface = tag === "prop" || tag === "balk" || tag === "bridge" || tag === "platform"
            ? "wood" : (tag === "kan" || tag === "embankment" || tag === "grave") ? "dirt" : "brick";
          vfx.Impact(p, normal, surface);
          // AI 的流弹也走同一份局部耐久。这里仍只在“真的打到静态碰撞体”时记伤，
          // 概率命中人物的那一支不会凭空再穿过去伤一堵墙。
          if (this.ctx.destruction && h.box) {
            this.ctx.destruction.Hit(h.box, p, s.weapon.damage,
              { kind: "bullet", normal });
          }
        }
      }
    }
  }

  /**
   * 敌军 AI 的运行时取证口（`window.Taierzhuang.Debug.Ai.State()`）。
   *
   * **只在调试路径上调**，所以这里允许分配。给 id 就出一个人的完整快照，
   * 不给就出全场直方图 —— 验收探针（`Script_AiCombatBrowserTest`）与
   * `?aidebug=1` 覆盖层读的都是它。
   *
   * 字段全是英文：这条路径是开发者诊断，不进 `Script_Text` 的字符串表
   * （docs/Data_TextAndTuning.md：闸门模块里不许再有玩家可见中文）。
   */
  DebugState(id = null) {
    if (id !== null && id !== undefined) {
      const s = this.soldiers.find((x) => x.id === id);
      return s ? this.DebugSoldier(s) : null;
    }
    const states = {};
    const tasks = {};
    const alerts = {};
    let inCover = 0;
    let validatedCover = 0;
    let hiding = 0;
    let alive = 0;
    for (const s of this.soldiers) {
      if (!s.alive) continue;
      alive += 1;
      states[s.state] = (states[s.state] || 0) + 1;
      const kind = s.task && s.task.kind ? s.task.kind : "none";
      tasks[kind] = (tasks[kind] || 0) + 1;
      alerts[s.alert || "unaware"] = (alerts[s.alert || "unaware"] || 0) + 1;
      if (s.cover) {
        inCover += 1;
        if (s.cover.validated) validatedCover += 1;
        if (s.coverPhase === "hide") hiding += 1;
      }
    }
    return {
      time: this.time, alive, states, tasks, alerts,
      inCover, validatedCover, hiding,
      covers: this.covers.Stats(),
      shooting: { rays: this.shooting.rayCount },
      perception: { ...this.perception.stats },
      tactics: this.tactics.State(),
      stats: { ...this.stats },
    };
  }

  /** 每人最多留多少条状态切换记录。32 条在实测里够盖住 30 秒（每秒约 0.6 次切换）。 */
  static STATE_LOG_SIZE = 32;

  /**
   * 记一条状态切换（`Update` 里每人每帧一次比较，真的变了才进来）。
   *
   * **零分配**：槽是首次切换时一次建好的定长环，之后只改三个字段。
   */
  _LogStateChange(s) {
    let log = s.stateLog;
    if (!log) {
      log = [];
      for (let i = 0; i < AiDirector.STATE_LOG_SIZE; i += 1) log.push({ t: -1, from: "", to: "" });
      s.stateLog = log;
      s.stateLogHead = 0;
      s.stateLogCount = 0;
    }
    const slot = log[s.stateLogHead];
    slot.t = this.time;
    slot.from = s.stateLogged;
    slot.to = s.state;
    s.stateLogHead = (s.stateLogHead + 1) % AiDirector.STATE_LOG_SIZE;
    if (s.stateLogCount < AiDirector.STATE_LOG_SIZE) s.stateLogCount += 1;
    s.stateLogged = s.state;
  }

  /**
   * 把环形记录按时间顺序（旧 → 新）读出来。**只在调试路径上调**，允许分配。
   * @return {Array<{t:number, from:string, to:string}>}
   */
  static ReadStateLog(s) {
    const log = s.stateLog;
    if (!log || !s.stateLogCount) return [];
    const size = AiDirector.STATE_LOG_SIZE;
    const out = [];
    const start = (s.stateLogHead - s.stateLogCount + size) % size;
    for (let i = 0; i < s.stateLogCount; i += 1) {
      const slot = log[(start + i) % size];
      out.push({ t: slot.t, from: slot.from, to: slot.to });
    }
    return out;
  }

  /** 一个人的快照（感知 / 任务 / 掩体 / 令牌 / 暴露 / 瞄准）。 */
  DebugSoldier(s) {
    const ex = s.shooting && s.shooting.exposure;
    return {
      id: s.id, side: s.side, squad: s.squadId, role: s.tacticalRole,
      state: s.state, stance: s.stance, suppression: +s.suppression.toFixed(2),
      alert: s.alert, awareness: +(s.awareness || 0).toFixed(2),
      target: s.target ? { id: s.target.id, isPlayer: !!s.target.isPlayer, visible: !!s.targetVisible } : null,
      lkp: s.lkp ? { x: +s.lkp.x.toFixed(1), z: +s.lkp.z.toFixed(1),
        ageS: +(this.time - s.lkpTime).toFixed(1), confidence: +(s.lkpConfidence || 0).toFixed(2) } : null,
      task: s.task && s.task.kind ? {
        kind: s.task.kind, targetId: s.task.targetId, partnerId: s.task.partnerId,
        point: s.task.point ? { x: +s.task.point.x.toFixed(1), z: +s.task.point.z.toFixed(1) } : null,
        leftS: +(s.task.until - this.time).toFixed(1),
      } : null,
      cover: s.cover ? {
        id: s.cover.id, x: +s.cover.x.toFixed(1), z: +s.cover.z.toFixed(1),
        height: +s.cover.height.toFixed(2), side: s.cover.side,
        validated: s.cover.validated, blockedCrouched: s.cover.blockedCrouched,
        phase: s.coverPhase, peeks: s.peekCount,
        hideDistM: +Math.sqrt((s.cover.hidePos.x - s.position.x) ** 2
          + (s.cover.hidePos.z - s.position.z) ** 2).toFixed(2),
        occupant: this.covers.OccupantOf(s.cover.id),
      } : null,
      token: this.tactics.TokenTarget(s.id),
      exposure: ex ? +ex.fraction.toFixed(2) : 0,
      visibleParts: ex ? ex.visibleParts.join("/") : "",
      aimErrorRad: s.shooting ? +s.shooting.errorRad.toFixed(4) : null,
      aimFloorRad: s.shooting ? +s.shooting.floorRad.toFixed(4) : null,
      grenades: TacticsDirector.GrenadeCount(s),
      x: +s.position.x.toFixed(1), z: +s.position.z.toFixed(1),
      // 编辑器的状态时间带与「最近走过的边」都读它；时刻是 `this.time` 的绝对秒。
      stateLog: AiDirector.ReadStateLog(s),
    };
  }

  Dispose() {
    for (const s of [...this.soldiers]) this.Remove(s);
    this.soldiers.length = 0;
    // 换关：黑板、令牌、班记录全清。留着的话下一关开局就带着上一关的敌情。
    this.tactics.Reset();
    this.covers.Rebuild([]);
    this.coversSource = null;
    if (this.crowd) this.crowd.Dispose();
    this.crowd = undefined;
  }
}

export { STATE };
