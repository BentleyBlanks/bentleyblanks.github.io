// 《血战台儿庄》士兵 AI 与战斗结算。
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
import { TRAVERSAL, TraversalPlan, TraversalCurve } from "./Data_Traversal.mjs";
import { ActorCrowd } from "./Script_ActorCrowd.mjs";

const STATE = {
  IDLE: "idle", ADVANCE: "advance", COVER: "cover", FIRE: "fire",
  SUPPRESSED: "suppressed", RELOAD: "reload", DEAD: "dead", CHARGE: "charge",
  VAULT: "vault",
};

/**
 * 被发现的距离，按**目标自己的姿态**缩放：站 120 / 蹲 80 / 卧 45 m。
 *
 * 这是 ER2 的 Covert Movements 那条机制里最便宜也最值钱的一半：姿态第一次真的
 * 影响"会不会被打"。原来两边一律 120 m 一刀切，趴下除了走得慢没有任何收益，
 * 于是玩家（和 AI）永远没有理由卧倒。
 */
export const SIGHT_BY_STANCE = [120, 80, 45];

/**
 * 发现距离的**全局倍率**上下限（`AiDirector.SetSightScale`）。
 *
 * 谁在写它：第四关的照明弹（Script_Flare）—— 燃烧期把三档一起抬上去（敌我同时
 * 暴露），熄灭之后压到 1 以下几秒（暗适应），过完再还原成 1。
 *
 * 为什么是**乘一个数**而不是改这张表：三档的比例就是「姿态决定被发现的距离」
 * 那条机制本身。整表乘同一个数，站/蹲/卧的次序与比例一个都不变 ——
 * 照明弹底下趴着仍然比站着难被看见。谁要是改成「照明弹期间一律 200 m」，
 * 这条机制当场作废。
 */
export const SIGHT_SCALE_RANGE = Object.freeze({ min: 0.25, max: 4 });

// 六人战斗组。不是给 HUD 看的职业系统，而是让一群人不再对着同一个点做同一个动作：
// 组长定方向，突击手靠前，机枪/掩护手压后，侧翼手走最外侧，步枪手填中间。
// Spawn 顺序固定，所以这张表也固定；同一种子重跑不会换队形。
const SQUAD_SIZE = 6;
const SQUAD_ENEMY_FOCUS_M = 92;
const SQUAD_LOOKAHEAD_M = 22;
const SQUAD_TURN_PER_UPDATE = 0.72;
const SQUAD_SLOTS = [
  { role: "leader", lateral: 0, depth: 1 },
  { role: "assault", lateral: -2.5, depth: -4 },
  { role: "rifleman", lateral: 4, depth: 1 },
  { role: "support", lateral: -3, depth: 9 },
  { role: "rifleman", lateral: -6, depth: 3 },
  { role: "flank", lateral: 9, depth: -1 },
];

function AngleDelta(from, to) {
  return Math.atan2(Math.sin(to - from), Math.cos(to - from));
}

function ApproachAngle(from, to, maxStep) {
  return from + Clamp(AngleDelta(from, to), -maxStep, maxStep);
}

let nextId = 1;

/**
 * 【2026-08-20 可见性优先】不再给人物发“可见名额”。
 *
 * 旧实现只让 13 个（十字街甚至 10 个）Actor 走完整模型。其余活人只有超过 55 m
 * 才进入静态远景人群，导致镜头里第 14 个人若在 55 m 内就被直接设成 invisible；
 * 尸体既不进远景层、排序又垫底，通常倒下当帧就从画面消失。
 *
 * 2026-08-21 性能取证：相机朝向 23 名日军时一帧 27.5 ms / 948 calls，
 * 转身只看 8 名守军时 11.0 ms / 500 calls。视锥内全用完整 Actor 会让“朝向敌人”
 * 本身变成 CPU 尖峰；而 root.visible 又打开了每人每帧两次足底物理探测。
 *
 * 所以保留“视锥内每个人都必须看得见”，但改为距离 LOD：近处是完整 Actor，
 * 远处是 ActorCrowd 烘焙出的同款模型实例。这不按人数发名额，不会隐藏第 N 个人；
 * 活人、卧倒者与尸体都进 LOD，只是二十几像素高时不再白算关节、脚 IK 与逐件提交。
 */
const ACTOR_DETAIL_ENTER_M = 46;
const ACTOR_DETAIL_EXIT_M = 56;
// 尸体没有步态、瞄准或足部 IK 可读，投影缩到这个距离后继续保留完整分件只会
// 重复提交同一套定格网格。近处仍用真实倒地姿势，稍远处交给同款人物的尸体 LOD；
// 两档之间留 6 m 迟滞，玩家在边界前后走动时不会反复切换。
const CORPSE_DETAIL_ENTER_M = 24;
const CORPSE_DETAIL_EXIT_M = 30;
const ACTOR_ANIMATION_60HZ_M = 20;
const ACTOR_ANIMATION_30HZ_M = 32;
const ACTOR_FOOT_IK_M = 18;
const ACTOR_SHADOW_M = 24;
// 视锥判定用的包围球：半径给到 1.6 m（人高 1.7 上下）再加一点余量，
// 免得屏幕边缘上的人在转身时一格一格地闪出来。
const ACTOR_BOUND_R = 1.6;
const _cullFrustum = new THREE.Frustum();
const _cullMatrix = new THREE.Matrix4();
const _cullSphere = new THREE.Sphere(new THREE.Vector3(), ACTOR_BOUND_R);

/**
 * 屏幕上只有二十来像素高的人不需要 60 Hz 解十三个关节。位移与转向仍每帧同步，
 * 只把内部姿势分档；用士兵 id 错开更新帧，避免十个人在同一帧一起算。
 */
function ActorAnimationCadence(soldier) {
  const distanceSq = soldier.actor?.renderDistanceSq ?? 0;
  if (distanceSq > ACTOR_ANIMATION_30HZ_M * ACTOR_ANIMATION_30HZ_M) return 3;
  if (distanceSq > ACTOR_ANIMATION_60HZ_M * ACTOR_ANIMATION_60HZ_M) return 2;
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
    this.combatModeUntil = -99;
    this.suppression = 0;
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
    // 不能只给 Actor 一个持续 0.12 s 的 firing 布尔。500 rpm 机枪恰好每 0.12 s
    // 一发，布尔会从第一发起一直为 true，人物后坐只触发一次。序号让每发都有边沿。
    this.fireSequence = 0;
    this.director = null;       // AiDirector.Spawn 填上，Kill 时用它发阵亡事件
  }

  get alive() { return this.state !== STATE.DEAD; }

  Kill(direction) {
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
    // 中弹的方向 × 一点力度，交给尸体刚体当初速度（见 AiDirector.StepCorpse）。
    // 不给的话人是"原地融化"；给太大就成了被炮弹掀飞，1.6 m/s 大约是踉跄一步。
    if (direction) {
      this.deathPush = {
        x: direction.x * 1.6,
        y: 0.6,
        z: direction.z * 1.6,
      };
    }
    // 阵亡事件从这里出，是**唯一**的一条路。
    // 以前扣票分散在三处（Combat.Blast 的 onKill、Main.TryFire、Main.DoMelee），
    // 结果是：日军炮弹炸死中国兵扣日方的票，玩家亲手打死人扣两票。
    if (this.director) this.director.NotifyDeath(this);
    // 倒下的那一声是**旁边的人**喊的（「班长！班长！」），所以位置取阵亡处、
    // 但语气归活人。这一条比"死人自己惨叫"更接近战场，也更不容易滥。
    const A2 = this.director && this.director.ctx && this.director.ctx.audio;
    if (A2) {
      A2.Bark("hurt", { position: this.position.clone(), seed: (this.id | 0) + 7, side: this.side });
    }
    return true;
  }

  TakeHit(damage, part, direction) {
    if (!this.alive) return false;
    const mult = part === "head" ? 3.2 : part === "torso" ? 1.0 : 0.6;
    this.health -= damage * mult;
    // Opt-in narrative cast protection; explicit scripted Kill remains authoritative.
    if (this.scriptEssential) this.health = Math.max(1, this.health);
    this.suppression = Clamp01(this.suppression + 0.45);
    if (this.health <= 0) return this.Kill(direction);
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
    this.tmpB = new THREE.Vector3();
    this.tmpC = new THREE.Vector3();
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
    this.nearSlots = [
      { ref: null, isPlayer: false, id: 0, dist: 1e9, stance: 0, position: null },
      { ref: null, isPlayer: false, id: 0, dist: 1e9, stance: 0, position: null },
      { ref: null, isPlayer: false, id: 0, dist: 1e9, stance: 0, position: null },
    ];
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
        && candidate.squadId === assignedSquadId).length >= SQUAD_SIZE) {
        assignedSquadId = `${explicitSquadId}_${overflow}`;
        overflow += 1;
      }
    }
    let slot = serial % SQUAD_SIZE;
    if (assignedSquadId) {
      const used = new Set(this.soldiers
        .filter((candidate) => candidate.alive && candidate.squadId === assignedSquadId)
        .map((candidate) => candidate.squadSlot));
      slot = SQUAD_SLOTS.findIndex((_, index) => !used.has(index));
      if (slot < 0) slot = serial % SQUAD_SIZE;
    }
    const slotSpec = SQUAD_SLOTS[slot];
    soldier.squadId = assignedSquadId || `${side}_${Math.floor(serial / SQUAD_SIZE)}`;
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
    if (soldier.body) { soldier.body.Remove(); soldier.body = null; }
    if (soldier.corpse) {
      if (this.ctx.physics) this.ctx.physics.RemoveBody(soldier.corpse);
      soldier.corpse = null;
    }
    if (soldier.heatSmoke) { this.ctx.vfx?.RemoveSmokeSource(soldier.heatSmoke); soldier.heatSmoke = 0; }
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
      let nearestD = SQUAD_ENEMY_FOCUS_M;
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
          if (oldEnemy.dist > SQUAD_ENEMY_FOCUS_M * 1.25) oldEnemy = null;
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
          const heading = ApproachAngle(current, wanted, SQUAD_TURN_PER_UPDATE);
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
    }
    this.squadCenters = groups;
  }

  /**
   * 给滚动锚排一个有前后、左右层次的六人落位。
   * 锚只放到队伍前方一小段，不再把每个人直接拽到几百米外的终点。
   */
  SetSquadGoal(s, group) {
    const slot = SQUAD_SLOTS[s.squadSlot] || SQUAD_SLOTS[2];
    const fx = group.forwardX, fz = group.forwardZ;
    const rx = -fz, rz = fx;
    const focusDist = Math.hypot(group.focusX - group.x, group.focusZ - group.z);
    const lookahead = Math.min(focusDist, group.focusKind === "enemy" ? 14 : SQUAD_LOOKAHEAD_M);
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
      if (s2.alive && s2.target && s2.target.isPlayer) this.playerTargetedBy += 1;
    }
    const slice = this.tickIndex % 6;
    const player = this.ctx.player;

    for (let i = 0; i < this.soldiers.length; i += 1) {
      const s = this.soldiers[i];
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
      s.actor.allowFootIk = distanceSq <= ACTOR_FOOT_IK_M * ACTOR_FOOT_IK_M;
      s.actor.SetShadowEnabled(distanceSq <= ACTOR_SHADOW_M * ACTOR_SHADOW_M);
      const settledCorpse = !s.alive && s.deadTime >= 0.9;
      const detailLimit = settledCorpse
        ? (s.renderLod === "detail" ? CORPSE_DETAIL_EXIT_M : CORPSE_DETAIL_ENTER_M)
        : (s.renderLod === "detail" ? ACTOR_DETAIL_EXIT_M : ACTOR_DETAIL_ENTER_M);
      // 纯逻辑测试没有 scene/factory，没有远景层可以接手时必须回退完整 Actor。
      const detailed = !crowd || distanceSq <= detailLimit * detailLimit;
      this._SetDetailedAttached(s.actor, detailed);
      s.renderLod = detailed ? "detail" : "crowd";
      if (!detailed) {
        const prone = Math.max(s.proneBlend ?? 0, s.stance === 2 ? 1 : 0);
        crowd.Push(s.actor.kind, s.position, s.yaw ?? 0, s.actor.sizeScale ?? 1, prone, !s.alive);
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

  /** 远景层按需建；纯逻辑环境下一直是 null。 */
  _Crowd() {
    if (this.crowd !== undefined) return this.crowd;
    const { scene, actorFactory } = this.ctx;
    this.crowd = (scene && actorFactory) ? new ActorCrowd(scene, actorFactory) : null;
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
    if (s.target) s.targetChanges += 1;
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
  Think(s, dt, player) {
    s.suppression = Math.max(0, s.suppression - COMBAT.suppressDecayPerS * dt);
    // 翻墙翻到一半不做决策：状态机会立刻把 VAULT 打回 advance，人卡在墙头上
    if (s.state === STATE.VAULT) return;

    // Opt-in scene actors follow the host's evacuation goals, never a combat cover/target.
    // Physics, suppression accounting, wounded poses and death remain on the normal path.
    if (s.scriptedNoncombatant) {
      s.target = null; s.targetVisible = false; s.cover = null; s.bayonetFixed = false;
      s.state = STATE.ADVANCE; s.aimBlend = 0;
      return;
    }

    // 找目标：取最近的**三个**敌人，逐个试通视。
    // 只试最近那一个的后果是实跑出来的：一堵院墙就能让整条战线永远没有目标 ——
    // 70 名 AI 每一次采样都是 {advance: 70}，开火计数恒为 0。
    const enemySide = s.side === "nra" ? "ija" : "nra";
    const slots = this.nearSlots;
    for (const slot of slots) { slot.dist = 1e9; slot.ref = null; slot.position = null; }
    // 距离门槛按**目标的姿态**缩放：站着的人一百二十米外就看得见，趴下的四十五米。
    // 这是姿态第一次真的影响"会不会被打"，也是潜行命令能成立的前提。
    // 玩家能不能被选中，取决于三件事：活着、出生保护过了、**已经锁他的人还没到上限**。
    // 最后一条比调命中率管用得多：实测出生点 27 m 上九个人同时开火，
    // 每秒挨四发，三秒必死，而玩家完全不知道自己做错了什么。
    // ER2 的 AI 会分散目标，不会九个人焊死一个人。
    const playerOpen = player && player.Alive && !player.Protected
      // 已经锁住玩家的人不占「新锁」名额。旧写法达到上限后会把现有三个人也一起
      // 排除，下一次 Think 全部转头找 NPC，再下一次又转回来，正是集体抽搐的一条源头。
      && (s.target?.isPlayer || this.playerTargetedBy < (COMBAT.maxShootersOnPlayer ?? 3));
    if (enemySide === "nra" && playerOpen) {
      const d = s.position.distanceTo(player.position);
      const st = player.stance === "prone" ? 2 : player.stance === "crouch" ? 1 : 0;
      if (d < this.SightRange(st)) this._PushNear(d, player, true, -1, st, player.position);
    }
    for (const other of this.soldiers) {
      if (other.side !== enemySide || !other.alive) continue;
      const d = s.position.distanceTo(other.position);
      if (d < this.SightRange(other.stance)) {
        this._PushNear(d, other, false, other.id, other.stance, other.position);
      }
    }

    let acquired = null, bestDist = 1e9;
    for (const slot of slots) {
      if (!slot.ref) continue;
      if (!this.HasLineOfSight(s, slot)) continue;
      acquired = slot; bestDist = slot.dist;
      break;
    }

    // 先问旧目标还在不在、还看不看得见。旧目标不必是最近三个之一：交火中略近一米
    // 的人不该让枪口立刻甩过去。只有锁定期已过且新目标近到一半，才允许主动换人。
    let currentVisible = false;
    let currentDist = 1e9;
    if (s.target) {
      const alive = s.target.isPlayer ? !!(player && player.Alive) : !!s.target.ref?.alive;
      if (!alive) { s.target = null; s.targetVisible = false; }
      else {
        s.target.position = s.target.isPlayer ? player.position : s.target.ref.position;
        s.target.stance = s.target.isPlayer
          ? (player.stance === "prone" ? 2 : player.stance === "crouch" ? 1 : 0)
          : s.target.ref.stance;
        currentDist = s.position.distanceTo(s.target.position);
        currentVisible = currentDist < this.SightRange(s.target.stance) * 1.12
          && this.HasLineOfSight(s, s.target);
      }
    }
    const sameAcquired = acquired && s.target && (acquired.isPlayer
      ? s.target.isPlayer
      : !s.target.isPlayer && acquired.ref === s.target.ref);
    const muchBetter = acquired && s.target && !sameAcquired
      && this.time >= s.targetLockUntil && acquired.dist < currentDist * 0.50;

    if (currentVisible && !muchBetter) {
      bestDist = currentDist;
      s.targetLostTime = 0;
      s.targetVisible = true;
    } else if (s.target && !currentVisible && s.targetLostTime < 1.2) {
      // 墙角、烟尘、队友身体会让通视短暂闪断。至少等 1.2 秒再把枪口甩给别人；
      // 目标已死亡时上面已清空，不会因此对尸体发呆。
      s.targetLostTime += dt;
      bestDist = currentDist;
      s.targetVisible = false;
    } else if (acquired) {
      const hadTarget = !!s.target;
      const changed = this.SetTarget(s, acquired);
      bestDist = acquired.dist;
      // 「发现敌情」只在从无到有那一下喊；目标切换不重复喊。
      if (!hadTarget && changed && this.ctx.audio) {
        this.ctx.audio.Bark("spot", { position: s.position.clone(), seed: s.id | 0, side: s.side });
      }
    } else if (s.target) {
      s.targetLostTime += dt;
      s.targetVisible = false;
      // 保留较长的「最后所见目标」记忆，重新露头时仍是同一个锁，不经历 null→目标
      // 的二次甩枪口。看不见时 TryFire 有独立闸门，不会隔墙射击。
      if (s.targetLostTime > 5) s.target = null;
      else bestDist = s.position.distanceTo(s.target.position);
    }

    if (s.scriptDefensive) { this.ApplyScriptDefense(s); return; }

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

    // 状态机。压制门槛从 0.72 降到 0.50：ER2 的 allowFindCoverWhenSuppressed
    // 是一条**独立行为**，被打得抬不起头的表现是往掩体里缩，不是站着不动。
    const engageRange = s.tacticalRole === "support" ? 95 : 74;
    const wasEngaged = s.state === STATE.FIRE || s.state === STATE.CHARGE;
    if (s.suppression > 0.50 || (s.state === STATE.SUPPRESSED && s.suppression > 0.32)) {
      // 被压制打断的冲锋是失败的冲锋：这一轮不再自动重起。冷却带抖动，
      // 免得全班同一秒重新站起来吃同一轮齐射。玩家下的刺刀令不受此限。
      if (s.state === STATE.CHARGE && s.order !== "charge") {
        s.chargeCooldownUntil = this.time + 8 + s.rnd() * 4;
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
      }
    } else if (s.target && bestDist < engageRange + (wasEngaged ? 12 : 0)) {
      // 六人组内不再人人同一种打法：突击位先压、侧翼位次之，步枪位只在贴脸时冲，
      // 支援位永不自行冲锋，留在后方持续射击。
      const chargeRange = s.tacticalRole === "assault" ? 24
        : s.tacticalRole === "flank" ? 18
          : s.tacticalRole === "leader" ? 13
            : s.tacticalRole === "rifleman" ? 10 : 0;
      const wasAutoCharge = s.state === STATE.CHARGE && s.order !== "charge";
      // 冲锋的**发起**也看压制值：压制没清完（≥0.25）、还押着姿态承诺（多半是
      // 卧倒没到期）、或上一次冲锋刚被压制打断的人，都不许新起冲锋。旧版在
      // SUPPRESSED 一跌破 0.32 时就转 CHARGE 强制站立，正是姿态抽动环的另一半。
      // 已在冲锋中的不看这些 —— 一发近失弹不该打散端着刺刀的人。
      const chargeReady = this.time >= s.chargeCooldownUntil && s.suppression < 0.25
        && (s.stance === 0 || this.time >= s.stanceUntil);
      const charge = chargeRange > 0
        && (wasAutoCharge ? bestDist < chargeRange + 7 : chargeReady && bestDist < chargeRange)
        && s.cohesion > 0.5 && s.squadMateCount > 0;
      if (charge && !wasAutoCharge) s.combatModeUntil = this.time + 1.4;
      const committedCharge = charge || (wasAutoCharge && this.time < s.combatModeUntil
        && bestDist < chargeRange + 10);
      s.state = committedCharge ? STATE.CHARGE : STATE.FIRE;
      // 对射姿势的承诺期 2.2 秒：FireStance 的迟滞带挡得住近失弹的小波动，
      // 挡不住压制在带宽两侧的慢波 —— 1.35 秒时实测还剩 1.4–1.8 秒节奏的
      // 站蹲微调。卧倒（emergencyDrop）与冲锋（force）都不吃这条承诺。
      this.SetStance(s, committedCharge ? 0 : this.FireStance(s, bestDist),
        committedCharge ? 1.0 : 2.2, committedCharge);
    } else {
      // 推进途中的蹲行门槛从 0.3 提到 0.55：0.3 一发近失弹就能压到，
      // 于是整条推进线都在以 0.6 倍速半蹲着蹭。真被打住了才蹲着走。
      s.state = STATE.ADVANCE;
      this.SetStance(s, s.suppression > 0.55 ? 1 : 0, 1.0);
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

    // 掩体：朝目标方向找一个 1 米内能挡住的点。被压住的人尤其需要。
    if ((s.state === STATE.FIRE || s.state === STATE.SUPPRESSED)
      && (!s.cover || this.time >= s.coverUntil)) {
      const nextCover = this.FindCover(s, s.target ? s.target.position : null);
      if (nextCover) s.cover = nextCover;
      s.coverUntil = this.time + 4 + s.rnd() * 2;
    }
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

  FindCover(s, threatPos) {
    const covers = this.ctx.battlefield.covers;
    if (!covers || !covers.length) return null;
    let best = null, bestScore = -1e9;
    // 只在附近抽样看 24 个 —— 全场几千个掩体点，全扫会卡
    const start = Math.floor(s.rnd() * covers.length);
    for (let i = 0; i < 24; i += 1) {
      const c = covers[(start + i * 37) % covers.length];
      const d = Math.hypot(c.x - s.position.x, c.z - s.position.z);
      if (d > 22) continue;
      let score = -d * 0.5 + Math.min(c.height, 1.4) * 6;
      if (threatPos) {
        // 掩体要在自己与威胁之间
        const toThreat = Math.atan2(threatPos.x - s.position.x, threatPos.z - s.position.z);
        const toCover = Math.atan2(c.x - s.position.x, c.z - s.position.z);
        const diff = Math.abs(((toCover - toThreat + Math.PI) % (Math.PI * 2)) - Math.PI);
        score -= diff * 6;
      }
      if (score > bestScore) { bestScore = score; best = c; }
    }
    return best;
  }

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
    for (const entry of cache) {
      if (entry.id === id && this.time - entry.time < 0.25) return entry.clear;
    }
    const from = this.tmpA.set(s.position.x,
      s.position.y + AiDirector.StanceEye(s.stance, s), s.position.z);
    const to = this.tmpB.set(cand.position.x,
      cand.position.y + AiDirector.StanceEye(cand.stance, cand), cand.position.z);
    if (this.ctx.BlocksSight?.(from, to)) return false;
    const dir = this.tmpC.subVectors(to, from);
    const dist = dir.length();
    if (dist < 0.001) return true;
    dir.divideScalar(dist);
    const hit = this.ctx.battlefield.Raycast(from, dir, dist);
    const clear = !hit || hit.t >= dist - 0.4;
    const entry = cache[s.losSlot % cache.length];
    entry.id = id; entry.time = this.time; entry.clear = clear;
    s.losSlot = (s.losSlot + 1) % cache.length;
    return clear;
  }

  // ---------------------------------------------------------------- 执行
  Act(s, dt, player) {
    // The firearm laboratory supplies exact positions before Ai.Update. Keep its
    // animation and crowd LOD inside the normal AI scheduling contract, but do
    // not let gravity, navigation or idle collision steps move the measured rig.
    if (s.weaponRangeTargetId) { this.StepWeaponRange(s, dt); return; }
    let desired = null;
    let speed = 0;
    let wantedYaw = s.yaw;
    // 这一帧有没有走过物理。没走的（站着不动、在射击）也要补一次 ——
    // 不补的话站在墙头上的人在墙被炸掉之后会浮在半空。
    let stepped = false;
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
      if (d > s.holdZone.radius) {
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
      case STATE.SUPPRESSED:
        // 三档：0.50–0.75 卧倒并往掩体里爬（还能还击）；
        //       0.75 以上停火、保持姿态；
        //       0.90 以上且 20 m 内五秒没有友军 —— 往后缩。这不是投降，是被打散。
        if (s.suppression > 0.90 && s.lonelyTime > 5 && s.target) {
          desired = this.tmpD.set(
            s.position.x * 2 - s.target.position.x, 0, s.position.z * 2 - s.target.position.z);
          speed = 2.0;
        } else if (s.suppression <= 0.75) {
          if (s.cover) {
            const d = Math.hypot(s.cover.x - s.position.x, s.cover.z - s.position.z);
            if (d > 1.1) { desired = this.tmpD.set(s.cover.x, 0, s.cover.z); speed = 1.8; }
          }
          this.TryFire(s, dt, player);
        }
        break;
      case STATE.RELOAD:
        s.reloadTimer -= dt;
        if (s.reloadTimer <= 0) { s.ammo = s.weapon.magazine || 5; s.state = STATE.IDLE; }
        break;
      case STATE.FIRE:
        if (s.cover) {
          const d = Math.hypot(s.cover.x - s.position.x, s.cover.z - s.position.z);
          if (d > 1.1) { desired = this.tmpD.set(s.cover.x, 0, s.cover.z); speed = 2.4; }
        }
        this.TryFire(s, dt, player);
        break;
      case STATE.CHARGE: {
        // 守点的人平时不冲锋（冲出去就是把点让出来），但玩家下的"上刺刀"是例外。
        const ordered = s.order === "charge" && this.time < s.chargeUntil;
        const dest = s.target ? s.target.position : (ordered ? s.goal : null);
        if (dest && (!s.holdZone || ordered)) {
          desired = this.tmpD.copy(dest);
          speed = ordered ? 3.6 * 1.4 : 3.6;      // 下了命令的冲锋跑得更快
        }
        this.TryFire(s, dt, player);
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
    if (s.scriptDefensive) {
      const anchor = s.holdZone || s.position;
      const outside = Math.hypot(s.position.x - anchor.x, s.position.z - anchor.z) > 2;
      desired = outside ? this.tmpD.set(anchor.x, 0, anchor.z) : null;
      speed = outside ? 2.2 : 0;
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
    // P012 has already swept its corridor and owns queue waits. A stale random
    // detour must not turn a resumed walker out of that corridor or vault a desk.
    if (scriptedPathFollower) { s.detourTime = 0; s.stuckTime = 0; }
    if (s.p012ScoutDirected || s.p012RouteRejoining) { desired = this.tmpD.copy(s.goal); speed = 2.6; }
    if (Number.isFinite(s.scriptMoveSpeedMps)) speed = s.p012Guided && desired
      ? Math.max(0, s.scriptMoveSpeedMps) : Math.min(speed, Math.max(0, s.scriptMoveSpeedMps));
    if (desired && speed > 0) {
      const dx = desired.x - s.position.x, dz = desired.z - s.position.z;
      const d = Math.hypot(dx, dz);
      const arrivalRadius = Number.isFinite(s.scriptArrivalRadius) ? Math.max(0.05, s.scriptArrivalRadius) : 1.2;
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
        if (!scriptedPathFollower && !navigated && s.detourTime > 0) {
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
        if (moved < step * 0.4) {
          s.stuckTime += dt;
          // 挡在前面的要是一堵翻得过去的墙，就翻过去 —— 别沿着院墙兜半圈找门洞。
          // 门槛比"卡住就绕"的 0.8 s 早一点：能翻就不该先绕。
          if (!scriptedPathFollower && s.stuckTime > 0.3 && this.TryVault(s, nx, nz)) return;
          // 绕着还是不动就**翻到另一面**再绕。这一条不能写成"只有不在绕行时才重掷"：
          // 那样一旦直奔方向与拐 99° 的方向同时被挡就是死锁，实跑量到位置整整
          // 两百四十秒一帧都不动。翻面 + 每次重掷都带一点抖动才出得来。
          if (!scriptedPathFollower && s.stuckTime > 0.8) {
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
        s.moveSpeed = Clamp01(speed * stanceMul / 3.6);
      } else {
        s.moveSpeed = 0;
        s.stuckTime = 0;
      }
    } else {
      s.moveSpeed = 0;
      s.stuckTime = 0;
    }

    let targetYaw = null;
    if (s.target) {
      const dx = s.target.position.x - s.position.x, dz = s.target.position.z - s.position.z;
      targetYaw = Math.atan2(-dx, -dz);
      // 停火瞄准与冲锋面向敌人；跑向掩体时身体面向移动方向，只让上身有限度地看敌。
      // 旧代码无条件用 targetYaw 覆盖移动朝向，移动与目标分列两侧时会逐帧互相抢方向。
      if (s.moveSpeed < 0.08 || s.state === STATE.CHARGE) wantedYaw = targetYaw;
    }
    // 人体不可能一帧转 180°。移动时略快，卧倒/受压时更慢；所有角度都走最短弧。
    const turnRate = s.stance === 2 ? 2.4 : s.moveSpeed > 0.08 ? 5.0 : 3.4;
    s.yaw = ApproachAngle(s.yaw, wantedYaw, turnRate * dt);

    // 枪口/上身偏航必须相对**这一帧真实的身体朝向**。旧版拿 wantedYaw 当基准，
    // 导航场在相邻格之间切方向时 wantedYaw 会左右跳，身体因为有转速限制尚且平滑，
    // 枪却每帧直接吃跳变后的 lookYaw，于是原地疯狂改枪口方向。
    const wantedLookYaw = targetYaw === null
      ? 0 : Clamp(AngleDelta(s.yaw, targetYaw), -0.75, 0.75);
    s.lookYaw += Clamp(wantedLookYaw - s.lookYaw, -4.8 * dt, 4.8 * dt);

    // FIRE/ADVANCE 是离散战术状态，枪托不是电门。短暂离开 FIRE 仍保留 0.35 s
    // 的据枪承诺，再用连续 blend 上肩/放下，距离阈值两侧不会横着甩枪。
    const mayAim = s.state === STATE.FIRE
      || (s.state === STATE.SUPPRESSED && s.target && s.suppression <= 0.75);
    if (mayAim && s.target) s.aimUntil = this.time + 0.35;
    const wantedAim = s.target && this.time < s.aimUntil ? 1 : 0;
    const aimRate = wantedAim ? 5.5 : 4.0;
    s.aimBlend += Clamp(wantedAim - s.aimBlend, -aimRate * dt, aimRate * dt);

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

    if (s.actor) {
      s.actor.root.position.copy(s.position);
      s.actor.root.rotation.y = s.yaw;
      const cadence = ActorAnimationCadence(s);
      if (s.actor.root.visible && (this.tickIndex + s.id) % cadence === 0) s.actor.Update(dt * cadence, {
        moveSpeed: s.moveSpeed,
        bayonetFixed: s.bayonetFixed,
        aim: s.aimBlend,
        crouch: s.crouchBlend,
        prone: s.proneBlend,
        grounded: s.grounded,
        verticalVelocity: s.velocityY,
        firing: this.time - s.lastFire < 0.12,
        fireSequence: s.fireSequence,
        elapsed: this.time,
        lookYaw: s.lookYaw, lookPitch: 0,
        // 摆点层（EscortColumn）钉在 soldier 上的两个负重旗：担架员前/后位
        // 与「能走的轻伤员」。姿态取用在 CharacterModel._ActionForState。
        carryRole: s.carryRole || null,
        woundedWalk: s.woundedWalk || 0,
      });
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
        prone: 0, grounded: true, elapsed: this.time, lookYaw: 0, lookPitch: 0 });
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
      if (b.max[1] > top) top = b.max[1];
    }
    if (wall || !Number.isFinite(top)) return false;
    const plan = TraversalPlan(top - feet);
    if (!plan) return false;
    const landX = s.position.x + nx * plan.reach;
    const landZ = s.position.z + nz * plan.reach;
    const landY = bf.StandHeight(landX, landZ, top);
    if (landY > top + 0.05) return false;
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
    s.yaw = Math.atan2(-(to.x - from.x), -(to.z - from.z));
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
      if (!this.Blocked(s.position.x + dx, s.position.z, s.position.y, cap)) s.position.x += dx;
      if (!this.Blocked(s.position.x, s.position.z + dz, s.position.y, cap)) s.position.z += dz;
      s.position.y = bf.StandHeight(s.position.x, s.position.z, s.position.y);
      return;
    }
    // 有人绕过物理直接改了 position（撒兵、剧本摆位、冒烟脚本摆人）就认外面那份。
    // 不对账的话表现很怪：把人挪到某处，下一帧他自己"弹"回胶囊所在的老位置 ——
    // 通关冒烟里「圈里留一个敌人」那一条就是这么失效的（人被弹回去，圈里没人了）。
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
   * 白刃。上了刺刀冲到 2 m 以内是真的捅，不是跑过去继续开枪 ——
   * 「上刺刀」按下去只是让人跑快一点的话，这个动词就还是假的。
   */
  TryBayonet(s, dt, player) {
    // The shared director owns windup, contact, parry and recovery for both sides.
    // No immediate damage or automatic QTE path remains here.
    if (s.unarmed || s.scriptDefensive || !s.bayonetFixed || !s.target) return;
    this.ctx.meleeCombat?.Fighter(s);
  }

  ApplyScriptDefense(s) {
    s.order = "hold"; s.cover = null; s.bayonetFixed = false;
    if (s.ammo <= 0) {
      if (s.state !== STATE.RELOAD) s.reloadTimer = s.weapon.reloadTimeS || 3.2;
      s.state = STATE.RELOAD;
    } else s.state = s.target ? STATE.FIRE : STATE.IDLE;
  }

  ScriptFireFactors(s) {
    return {
      interval: Number.isFinite(s.scriptFireIntervalScale) ? Math.max(0.1, Math.min(20, s.scriptFireIntervalScale)) : 1,
      accuracy: Number.isFinite(s.scriptAccuracyScale) ? Math.max(0, Math.min(4, s.scriptAccuracyScale)) : 1,
    };
  }

  TryFire(s, dt, player) {
    if (s.unarmed) return;
    s.fireTimer -= dt;
    // 潜行的班不许开枪 —— 这是那道命令的全部代价，也是它区别于"跟我来"的地方
    if (s.order === "covert" && this.time < s.covertUntil) return;
    // 过热：Type11.overheatShots = 200 / coolDownS = 8.0 以前是死字段。
    // 冷却期间枪口冒白烟并且**真的打不出去** —— 这就是玩家冲过街口的那个窗口。
    if (this.time < s.coolUntil) return;
    if (s.fireTimer > 0 || !s.target || s.ammo <= 0) return;
    if (s.targetVisible === false) return;
    s.aimTime += dt;
    const aimNeeded = s.weapon.aiAimTimeS ?? 0.8;
    if (s.aimTime < aimNeeded * (1 + s.suppression)) return;
    // 枪口还没转过去就不能凭概率从侧后方命中。方向闸门也让「转身—瞄准—开火」
    // 成为能看懂的动作链，而不是身体原地转圈、子弹照样四面飞。
    const tx = s.target.position.x - s.position.x;
    const tz = s.target.position.z - s.position.z;
    const targetYaw = Math.atan2(-tx, -tz);
    if (Math.abs(AngleDelta(s.yaw, targetYaw)) > 0.34) return;

    const from = this.tmpA.set(s.position.x, s.position.y + (s.stance === 2 ? 0.5 : s.stance === 1 ? 1.1 : 1.5), s.position.z);
    const to = this.tmpB.copy(s.target.position);
    to.y += 1.1;
    const dir = this.tmpC.subVectors(to, from);
    const dist = dir.length();
    dir.divideScalar(dist || 1);

    s.ammo -= 1;
    const scriptFactors = this.ScriptFireFactors(s);
    s.fireTimer = (s.weapon.fireIntervalS ?? 1.2) * scriptFactors.interval;
    s.lastFire = this.time;
    s.fireSequence += 1;
    s.aimTime = 0;
    this.fireCount += 1;              // 通关冒烟要的是"仗真的打起来了"的运行时证据

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
    acc *= s.suppression > 0.3 ? COMBAT.aiAccuracySuppressed / COMBAT.aiAccuracyBase : 1;
    if (s.target.isPlayer && player) {
      acc *= COMBAT.player?.accuracyScale ?? 1;
      acc *= player.stance === "prone" ? 0.45 : player.stance === "crouch" ? 0.72 : 1;
    }

    // 刚锁上玩家的那一发必偏。理由与代价都写在 COMBAT.player 那段注释里：
    // 它买的是**一次预警**——子弹先从耳边过、暗角先亮一下，玩家才有得反应。
    const firstShot = s.target.isPlayer
      && this.time - (s.playerLockAt ?? -99) < (COMBAT.player?.firstShotGraceS ?? 0);
    if (firstShot) acc = 0;

    const hit = s.rnd() < acc;
    const vfx = this.ctx.vfx;
    const audio = this.ctx.audio;
    if (vfx) {
      vfx.MuzzleFlash(from, dir, {
        scale: s.weapon.kind === "lmg" ? 1.15 : 1,
        kind: s.weapon.kind,
      });
      vfx.Tracer(from, this.tmpB.clone().copy(from).addScaledVector(dir, dist), {
        kind: s.side === "nra" ? "nra" : "ija",
      });
    }
    if (audio) {
      const name = s.side === "nra"
        ? (s.weaponId === "Zb26" ? "zb26" : "rifleNra")
        : (s.weaponId === "Type11" ? "type11" : s.weaponId === "Type92Hmg" ? "type92" : "rifleIja");
      // PlayGunshot 而不是 Play：一百米外那一枪要换成**另一段录音**，
      // 不是同一段加低通（Script_Audio.FAR_CUE 那段注释）。
      // 步枪走两层交叉淡入，机枪没有远场素材、内部自动落回 Play()。
      audio.PlayGunshot(name, { position: from.clone(), volume: 1 });
    }

    if (hit) {
      // 打玩家时爆头概率单独一档（0.035 而不是 0.08）：AI 是照胸口打的，
      // 而在玩家这边"随机爆头"等于随机读盘 —— 部位倍率见 COMBAT.player。
      const toPlayer = s.target.isPlayer && !!player;
      const headChance = toPlayer ? (COMBAT.player?.headChance ?? 0.035) : 0.08;
      const part = s.rnd() < headChance ? "head" : s.rnd() < 0.6 ? "torso" : (s.rnd() < 0.5 ? "arm" : "leg");
      if (toPlayer) {
        player.TakeHit(s.weapon.damage * (COMBAT.player?.bulletScale ?? 0.40), part, dir, {
          from: from.clone(), bullet: true,
        });
      } else if (s.target.ref) {
        const died = s.target.ref.TakeHit(s.weapon.damage, part, dir);
        if (vfx) vfx.Blood(to, dir, died ? 1 : 0.5);
      }
    } else {
      // 打偏了：仍然要压制。近失弹从耳边过去，那声音本身就是武器。
      if (s.target.isPlayer && player) {
        const miss = 0.4 + s.rnd() * 1.4;
        if (miss < COMBAT.suppressRadius) player.Suppress(COMBAT.suppressPerNearMiss * (1 - miss / COMBAT.suppressRadius) * 3);
      } else if (s.target.ref) {
        s.target.ref.suppression = Clamp01(s.target.ref.suppression + COMBAT.suppressPerNearMiss);
      }
      if (vfx) {
        const missPoint = to.clone().add(new THREE.Vector3((s.rnd() - 0.5) * 2.2, (s.rnd() - 0.5) * 1.6, (s.rnd() - 0.5) * 2.2));
        const bf = this.ctx.battlefield;
        const h = bf.Raycast(from, missPoint.sub(from).normalize(), dist + 6);
        if (h) {
          const p = from.clone().addScaledVector(missPoint, h.t);
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

  Dispose() {
    for (const s of [...this.soldiers]) this.Remove(s);
    this.soldiers.length = 0;
    if (this.crowd) this.crowd.Dispose();
    this.crowd = undefined;
  }
}

export { STATE };
