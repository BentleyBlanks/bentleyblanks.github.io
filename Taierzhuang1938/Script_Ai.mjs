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
const SIGHT_BY_STANCE = [120, 80, 45];

let nextId = 1;

/**
 * 同屏可见 Actor 的预算。
 *
 * 实测（phase4 / high / small）：整个世界本身只有 **82** 个 draw call，
 * 而一个 Actor 是四十几个（身体部件没合批）—— 也就是说开销几乎全在人身上。
 * 第 1 批把两边的兵压到同一条前线上之后，镜头前的人从五六个涨到二十七个，
 * calls 从 1290 顶到 2011，越过 1400 的红线。
 *
 * 这里按到镜头的距离排序，只显示最近的这么多个。实测 20 个 = 1376 calls；
 * 取 18 时 phase1（敢死队带毛巾、部件更多）仍到 1423，所以落到 16。
 * 更远的人本来就被雾墙吃掉（fog.max 0.94），玩家看不出少了谁。
 * **要提高这个数，先去合批 Actor，别直接把它调大。**
 *
 * 【2026-08-19 换城之后从 16 降到 14】
 * 上面那笔账是照台儿庄算的，而**台儿庄那座城本身只要 82 个 draw call**。
 * 滕县这座城（600×600 m 方城、11.5 m 墙、四关在城里）实测占 352—498 个：
 * 十字街那一关 408、北门 498。等于人这边的预算凭空少了三四百。
 * 16 → 13 让出约 200 个。最贵的一关是十字街（出生点就站在 305 m 的通视走廊上，
 * 那条走廊是这一关的机制，不能拿掉）：切片压到 ±100 m、远平面收到 400 m、
 * 人像预算 13，三样一起才落回红线内。
 * 同样地：要把它调回去，先去合批 Actor（一个人四十几个 call，身体部件没合批）。
 *
 * 【2026-08-20 名额分配重做：预算没错，错的是发给谁】
 * 玩家的原话是"还是看不到日军啊，离得特别近才看得到"。实测三关（东关/十字街/城墙）
 * 的名额去向完全一致：**13 个名额 100% 被守军占满**，可见的人全在 30—46 m 以内，
 * 而活着的日军 36—37 人、最近的一个在 65—70 m，**150 m 内的日军一个都没画出来**。
 *
 * 两个原因叠在一起：
 *   1) 排序只看距离，而玩家的班组是**跟着玩家走**的 —— 十几个守军永远比任何一个
 *      日军近，名额天生就轮不到敌人。这不是调参能救的，是排序键选错了。
 *   2) 名额发给了**镜头背后**的人。three 本来就逐 mesh 做视锥剔除，屏幕外的 Actor
 *      一个 draw call 都不花 —— 拿名额去照顾他们等于把预算烧在看不见的地方。
 *
 * 所以改成：先过视锥（屏幕外的直接不占名额），再按「距离 × 权重」排。
 * 权重让敌人先拿、尸体最后拿 —— 战场上看不见开枪的人是最伤的一类 bug。
 */
const VISIBLE_ACTOR_BUDGET = 13;

/**
 * 名额排序的权重（乘在距离上，越小越优先）。
 *
 * 0.42：让 70 m 的日军（排序值 29）压过 35 m 的自己人（35）。这个数是照实测配的 ——
 * 敌人最近 65—70 m、自己人 20—46 m，要跨过这一档至少得乘到 0.5 以下；
 * 再小就会把贴脸的自己人也挤掉，而"班长站在我旁边却是个透明人"同样穿帮。
 * 2.6：尸体不占活人的名额。战场上得有尸体，但一具趴着的尸体永远不如
 * 一个正在朝你开枪的人重要。
 */
const RANK_ENEMY = 0.42;
const RANK_CORPSE = 2.6;

/**
 * 远景人群的近端门槛（米）。名额之外、且比这个远的人交给 ActorCrowd 的
 * InstancedMesh 去画（静态姿势，全场合起来约二十个 draw call）。
 *
 * 55 m：那个距离上一个人在 900 px 高的屏幕上是 28 px，动作已经读不出来了，
 * 而 40 m（41 px）还看得出胳膊不动。比这更近的人如果挤不进名额，宁可不画 ——
 * 眼前站着一个一动不动的塑料兵比少一个人穿帮得多。
 */
const CROWD_MIN_DISTANCE = 55;
// 视锥判定用的包围球：半径给到 1.6 m（人高 1.7 上下）再加一点余量，
// 免得屏幕边缘上的人在转身时一格一格地闪出来。
const ACTOR_BOUND_R = 1.6;
const _cullFrustum = new THREE.Frustum();
const _cullMatrix = new THREE.Matrix4();
const _cullSphere = new THREE.Sphere(new THREE.Vector3(), ACTOR_BOUND_R);

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
 */
const CAPSULE = [
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
    this.suppression = 0;
    this.stance = 0;                        // 0 站 1 蹲 2 卧
    this.target = null;
    this.targetLostTime = 0;
    /** 上一次「把枪口转到玩家身上」的时刻。首发必偏窗口按它算（见 TryFire）。 */
    this.playerLockAt = -99;
    this.aimTime = 0;
    this.ammo = this.weapon.magazine || 5;
    this.reloadTimer = 0;
    this.fireTimer = 0;
    this.cover = null;
    this.goal = new THREE.Vector3(options.x || 0, 0, options.z || 0);
    this.order = "advance";
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
    this.meleeTimer = 0;
    this.chargeUntil = -99;      // 玩家下"上刺刀"之后这道命令的有效期
    this.flankUntil = -99;       // 绕行命令的有效期，到点或超时就转 advance
    this.covertUntil = -99;      // 潜行命令的有效期：跟班长同姿态且不开枪
    // 翻越。院墙 2 m、窗台 0.9 m，而 Blocked() 的自动抬腿只到 0.56 m ——
    // 不给 AI 开这一条的话，玩家翻墙抄到院子里，追他的人只能绕门洞，
    // 这个动词就变成了单方面的作弊。
    this.vaultT = -1;            // >= 0 表示正在翻
    this.vaultDuration = 0.5;
    this.vaultFrom = null;
    this.vaultTo = null;
    this.vaultApex = 0;
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
    // 守点纪律：ER2 的 AI 会在赶路途中就地对射、根本不进点，导致「只要防守方
    // 看得见攻方，这张图就极好打」。这里给防守单位一条硬规矩：
    // 一旦被派去守某个占领区，除非死亡，否则不许离开该区半径。
    this.holdZone = null;
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
  constructor(ctx, { maxAlive = 56, seed = 1938, visibleActors = VISIBLE_ACTOR_BUDGET,
    insideWalls = null } = {}) {
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
    this.visibleBudget = visibleActors;
    this.visibleScratch = [];
    this.rnd = Mulberry32(seed);
    this.tickIndex = 0;
    this.time = 0;
    this.corpses = [];
    this.maxCorpses = 26;
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
    let y;
    if (physics) {
      const free = physics.FindFreeSpot(x, z, CAPSULE[0].radius, CAPSULE[0].height);
      x = free.x; z = free.z; y = free.y;
    } else {
      y = this.ctx.battlefield.GroundHeight(x, z);
    }
    const soldier = new Soldier(side, { ...options, x, z });
    soldier.position.y = y;
    if (physics) {
      soldier.body = physics.MakeCharacter({
        radius: CAPSULE[0].radius, height: CAPSULE[0].height, position: soldier.position,
      });
    }
    const kind = side === "nra" ? (options.towel ? "nraDare" : "nra") : "ija";
    soldier.actor = this.ctx.actorFactory.Create(kind, {
      seed: soldier.id * 131 + 7,
      weapon: soldier.weaponId,
    });
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
   * 离这个兵最近的、还在对方手上的占领点。
   * 日方每次 Think 都要重取 —— 用生成那一刻的快照会让整条战线钉死在开局的那个点上，
   * 点丢了也没人往下一个点推，于是八个点的 owner 从头到尾一个都不变。
   */
  NearestEnemyObjective(s) {
    const list = this.ctx.battlefield?.objectives;
    if (!list || !list.length) return null;
    let best = null, bestD = 1e9;
    for (const o of list) {
      if (o.owner === s.side) continue;
      const d = Math.hypot(o.x - s.position.x, o.z - s.position.z);
      if (d < bestD) { bestD = d; best = o; }
    }
    // 已经近在眼前的点就打眼前这个，否则归队去打全军的那个主攻点。
    // 各打各的最近点会把 38 个人摊到八个方向上 —— 一座 500×460 m 的城里
    // 1.5 m 高度 30 m 的射线只有 19/200 是通的，摊开就等于谁也遇不上谁。
    // ER2 的战场之所以像战场，是因为它有一条**前线**：兵力压在同一处。
    // 眼前五十五米内还有敌方的点就打眼前这个：导航网格落地之后他们真的走得到，
    // 不必再像第 1 批那样把所有人硬压到同一条前线上才能碰上面。
    if (bestD < 55) return best;
    const front = this.frontObjective[s.side];
    return front || best;
  }

  /**
   * 每一侧的主攻点：己方兵力重心最近的那个敌方占领点。
   * 一秒重算一次就够 —— 这是战线的位置，不是瞄准点。
   */
  UpdateFront() {
    const list = this.ctx.battlefield?.objectives;
    if (!list || !list.length) return;
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
      let best = null, bestD = 1e9;
      for (const o of list) {
        if (o.owner === side) continue;
        const d = Math.hypot(o.x - cx, o.z - cz);
        if (d < bestD) { bestD = d; best = o; }
      }
      // 迟滞：主攻点一旦定下来，除非**打下来了**或者出现一个近三成半以上的新目标，
      // 否则不许换。没有这一条的后果是实跑量到的：前线每秒按兵力重心重算，
      // 重心一飘就换点，四十个人半路集体掉头，两军从此擦肩而过 ——
      // 采样里连着几段 under70 只有 1 对、targets 0，仗停在"互相找不到"上。
      const current = this.frontObjective[side];
      if (current && current.owner !== side) {
        const dCur = Math.hypot(current.x - cx, current.z - cz);
        if (!best || dCur < bestD * 1.35) best = current;
      }
      this.frontObjective[side] = best;
    }
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
        if (s.actor) s.actor.Update(dt, { dead: true, dying: Clamp01(s.deadTime / 0.9), elapsed: this.time });
        continue;
      }
      // 「想」分帧轮转：每帧只有六分之一的人重新决策
      if (i % 6 === slice) this.Think(s, dt * 6, player);
      this.Act(s, dt, player);
    }

    // 尸体上限：超了就把最早的移走（战场上得有尸体，但不能无限堆）
    const dead = this.soldiers.filter((s) => !s.alive).sort((a, b) => b.deadTime - a.deadTime);
    while (dead.length > this.maxCorpses) this.Remove(dead.shift());

    this.CullActors(camera);
  }

  /**
   * 发放同屏可见 Actor 的名额。见 VISIBLE_ACTOR_BUDGET 上面那一大段账。
   *
   * 两步：① 屏幕外的一律不占名额（它们本来就不花 draw call）；
   *      ② 剩下的按「距离 × 权重」排，敌人优先、尸体垫底，取前 visibleBudget 个。
   */
  CullActors(camera) {
    if (!camera) return;
    // 视图矩阵自己从 matrixWorld 求，**不要用 camera.matrixWorldInverse** ——
    // 那个只在 renderer.render() 里更新，剔除跑在逻辑帧里，读到的是上一帧的机位。
    // 平时差一帧看不出来，换关/过场刚把相机瞬移过去的那一帧就是整批人闪一下。
    camera.updateMatrixWorld();
    _cullMatrix.copy(camera.matrixWorld).invert().premultiply(camera.projectionMatrix);
    _cullFrustum.setFromProjectionMatrix(_cullMatrix);
    const list = this.visibleScratch;
    list.length = 0;
    for (const s of this.soldiers) {
      if (!s.actor) continue;
      // 包围球取胸口高度：脚下那个点在贴地俯视时会掉出视锥，人整个闪掉
      _cullSphere.center.set(s.position.x, s.position.y + 0.9, s.position.z);
      if (!_cullFrustum.intersectsSphere(_cullSphere)) {
        s.actor.root.visible = false;
        continue;
      }
      const weight = !s.alive ? RANK_CORPSE : (s.side === "ija" ? RANK_ENEMY : 1);
      s.camRange = Math.sqrt(s.position.distanceToSquared(camera.position));
      s.camDist = s.camRange * weight;
      list.push(s);
    }
    list.sort((a, b) => a.camDist - b.camDist);

    // 名额内的走精细 Actor；名额外、又够远的交给远景人群（一批人共二十来个
    // draw call，与人数无关）。**这是"最远能看见多远"的那条线** ——
    // 精细层受 draw call 限制只能到七八十米，远景层一直铺到相机远平面。
    const crowd = this._Crowd();
    if (crowd) crowd.Begin();
    for (let i = 0; i < list.length; i += 1) {
      const s = list[i];
      const detailed = i < this.visibleBudget;
      s.actor.root.visible = detailed;
      if (detailed || !crowd || !s.alive) continue;
      if (s.camRange < CROWD_MIN_DISTANCE) continue;
      crowd.Push(s.actor.kind, s.position, s.yaw ?? 0,
        s.actor.sizeScale ?? 1, s.stance === 2 ? 1 : 0);
    }
    if (crowd) crowd.End();
  }

  /** 远景人群按需建：没有场景或工厂（纯逻辑冒烟测试）时就一直没有。 */
  _Crowd() {
    if (this.crowd !== undefined) return this.crowd;
    const { scene, actorFactory } = this.ctx;
    this.crowd = (scene && actorFactory) ? new ActorCrowd(scene, actorFactory) : null;
    return this.crowd;
  }

  /** 姿态对应的枪眼高度。站 1.5 / 蹲 1.0 / 卧 0.5 —— 卧倒的人本来就该更难被看见。 */
  static StanceEye(stance) { return stance === 2 ? 0.5 : stance === 1 ? 1.0 : 1.5; }

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
      && this.playerTargetedBy < (COMBAT.maxShootersOnPlayer ?? 3);
    if (enemySide === "nra" && playerOpen) {
      const d = s.position.distanceTo(player.position);
      const st = player.stance === "prone" ? 2 : player.stance === "crouch" ? 1 : 0;
      if (d < SIGHT_BY_STANCE[st]) this._PushNear(d, player, true, -1, st, player.position);
    }
    for (const other of this.soldiers) {
      if (other.side !== enemySide || !other.alive) continue;
      const d = s.position.distanceTo(other.position);
      if (d < (SIGHT_BY_STANCE[other.stance] ?? 120)) {
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

    if (acquired) {
      // 「发现敌情」只在**从无到有**那一下喊，不是每次 Think 都喊 ——
      // Think 每 0.1 s 一次，不判这一条的话一个人就能自己把节流闸门吃满，
      // 场上其他所有口令都再也发不出来了。
      if (!s.target && this.ctx.audio) {
        this.ctx.audio.Bark("spot", { position: s.position.clone(), seed: s.id | 0, side: s.side });
      }
      // 新建一个目标对象而不是把槽位交出去 —— 槽位下一次 Think 就被覆写了
      const wasPlayer = !!(s.target && s.target.isPlayer);
      s.target = { position: acquired.position, isPlayer: acquired.isPlayer, ref: acquired.ref };
      s.targetLostTime = 0;
      // 「刚把枪口转到玩家身上」的时刻。TryFire 用它让这一秒的枪必偏 ——
      // 见 COMBAT.player.firstShotGraceS 那段账。只在**从别处切到玩家**时重置，
      // 不然 Think 每 0.1 s 跑一次会把窗口无限续上，那就成了永远打不中。
      if (acquired.isPlayer && !wasPlayer) s.playerLockAt = this.time;
    } else if (s.target) {
      s.targetLostTime += dt;
      if (s.targetLostTime > 2.5) s.target = null;
      else bestDist = s.position.distanceTo(s.target.position);
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

    // 日方的总目标每次 Think 重取：往当前还在中方手里的、离自己最近的那个点压。
    // 守点的人与跟着镜头走的近身班组不动（他们的 goal 由别处负责）。
    if (s.side === "ija" && !s.holdZone && s.order !== "hold" && s.order !== "follow") {
      const objective = this.NearestEnemyObjective(s);
      if (objective) s.goal.set(objective.x + s.laneOffset, 0, objective.z + s.laneOffset * 0.4);
    }

    // 状态机。压制门槛从 0.72 降到 0.50：ER2 的 allowFindCoverWhenSuppressed
    // 是一条**独立行为**，被打得抬不起头的表现是往掩体里缩，不是站着不动。
    if (s.suppression > 0.50) {
      s.state = STATE.SUPPRESSED;
      s.stance = 2;
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
    } else if (s.target && bestDist < 70) {
      // 近了就压上去打（尤其反攻阶段），远了就找掩体对射
      s.state = bestDist < 16 && s.cohesion > 0.5 ? STATE.CHARGE : STATE.FIRE;
      s.stance = bestDist < 20 ? 0 : 1;
    } else {
      s.state = STATE.ADVANCE;
      s.stance = s.suppression > 0.3 ? 1 : 0;
    }

    // 潜行：跟着班长（玩家）的姿态走，跟着他的位置走，而且**不开枪**。
    // 必须压在状态机后面 —— 上面那段刚按"看不看得见敌人"重设过 stance。
    if (s.order === "covert") {
      if (this.time > s.covertUntil) {
        s.order = "advance";
      } else if (player) {
        s.stance = player.stance === "prone" ? 2 : player.stance === "crouch" ? 1 : 0;
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
      s.stance = 0;
    }
    if (s.state === STATE.CHARGE) s.bayonetFixed = true;

    // 掩体：朝目标方向找一个 1 米内能挡住的点。被压住的人尤其需要。
    if ((s.state === STATE.FIRE || s.state === STATE.SUPPRESSED)
      && (!s.cover || s.rnd() < 0.12)) {
      s.cover = this.FindCover(s, s.target ? s.target.position : null);
    }
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
      s.position.y + AiDirector.StanceEye(s.stance), s.position.z);
    const to = this.tmpB.set(cand.position.x,
      cand.position.y + AiDirector.StanceEye(cand.stance), cand.position.z);
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
    let desired = null;
    let speed = 0;
    // 这一帧有没有走过物理。没走的（站着不动、在射击）也要补一次 ——
    // 不补的话站在墙头上的人在墙被炸掉之后会浮在半空。
    let stepped = false;

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
          const r = s.holdZone.radius * (0.20 + s.rnd() * 0.55);
          s.goal.set(s.holdZone.x + Math.cos(a) * r, 0, s.holdZone.z + Math.sin(a) * r);
          // 中正门那个点的圆边压过北寨墙，随机撒出来的守位有一部分在墙外面 ——
          // 人走不过去，只会贴着墙抖到死。
          this.ClampInside(s.goal);
        }
        if (!s.target && d > 0.001) s.yaw = Math.atan2(dx / d, dz / d);
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

    // 移动：直奔目标 + 撞墙就沿墙滑 + **卡住就拐弯绕**。
    //
    // 最后那一条原来只写在注释里（"真卡住 1.5 秒就随机换个方向绕"），代码里一行没有。
    // 后果实跑取证得到：这座城 1.5 m 高度上 30 m 的随机射线只有 19/200 是通的
    // （4674 个 wall 碰撞盒，鲁南民居对外不开窗），撞墙的人贴着墙原地抖到死，
    // 两边各自站在自己的院子里 —— 「仗根本没在打」有一半是这么来的。
    // 这不是寻路，是"摸着墙走"：拐九十度走一两秒再回头奔目标。在一座街巷本来
    // 就通的城里够用，而且比 A* 便宜两个数量级。
    if (desired && speed > 0) {
      const dx = desired.x - s.position.x, dz = desired.z - s.position.z;
      const d = Math.hypot(dx, dz);
      if (d > 1.2) {
        let nx = dx / d, nz = dz / d;
        // 远目标走导航场：直奔目标在这座城里等于直奔一堵院墙。
        // 近目标（掩体、眼前的敌人）仍然直奔 —— 那种距离上局部避障就够，
        // 而且导航场是按格量化的，六米以内会把人推得一格一格地跳。
        let navigated = false;
        // 门槛取 14 m 而不是 8 m：导航场的目标被量化到 16 m，近距离用它反而会
        // 把人往格心上推。十四米以内本来就是"看得见就直接过去"的距离。
        if (this.ctx.nav && d > 14) {
          navigated = this.ctx.nav.Steer(s.position.x, s.position.z, desired.x, desired.z, this.navOut);
          if (navigated) { nx = this.navOut.x; nz = this.navOut.z; s.detourTime = 0; s.stuckTime = 0; }
        }
        if (!navigated && s.detourTime > 0) {
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
          if (s.stuckTime > 0.3 && this.TryVault(s, nx, nz)) return;
          // 绕着还是不动就**翻到另一面**再绕。这一条不能写成"只有不在绕行时才重掷"：
          // 那样一旦直奔方向与拐 99° 的方向同时被挡就是死锁，实跑量到位置整整
          // 两百四十秒一帧都不动。翻面 + 每次重掷都带一点抖动才出得来。
          if (s.stuckTime > 0.8) {
            s.stuckTime = 0;
            if (s.detourTime > 0) s.detourSign = -s.detourSign;
            s.detourTime = 2.0 + s.rnd() * 1.2;
            s.detourGoalDist = d;
            s.detourYaw = s.detourSign * (Math.PI * 0.5 + s.rnd() * 0.55);
          }
        } else {
          s.stuckTime = 0;
        }
        s.yaw = Math.atan2(-nx, -nz);
        s.moveSpeed = Clamp01(speed * stanceMul / 3.6);
      } else {
        s.moveSpeed = 0;
        s.stuckTime = 0;
      }
    } else {
      s.moveSpeed = 0;
      s.stuckTime = 0;
    }

    if (s.target) {
      const dx = s.target.position.x - s.position.x, dz = s.target.position.z - s.position.z;
      s.yaw = Math.atan2(-dx, -dz);
    }
    // 站着不动的人也要走一次物理：重力、脚下的东西被炸掉、被别的东西顶开，
    // 都得在这一步里结算。
    if (!stepped) this.StepBody(s, 0, 0, dt);

    if (s.actor) {
      s.actor.root.position.copy(s.position);
      s.actor.root.rotation.y = s.yaw;
      s.actor.Update(dt, {
        moveSpeed: s.moveSpeed,
        aim: s.state === STATE.FIRE ? 1 : 0,
        crouch: s.stance === 1 ? 1 : 0,
        prone: s.stance === 2 ? 1 : 0,
        grounded: s.grounded,
        verticalVelocity: s.velocityY,
        firing: this.time - s.lastFire < 0.12,
        fireSequence: s.fireSequence,
        elapsed: this.time,
        lookYaw: 0, lookPitch: 0,
      });
    }
  }

  /**
   * AI 侧的翻越。玩家能翻墙进院，追他的人只能绕门洞的话，这个动词就是单方面作弊。
   *
   * 判据跟玩家那份一致：正前方顶面在 0.6—2.25 m 之间、落点站得下。
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
    for (const b of bf.NearbyColliders(probeX, probeZ, 1.0)) {
      if (probeX < b.min[0] - 0.35 || probeX > b.max[0] + 0.35) continue;
      if (probeZ < b.min[2] - 0.35 || probeZ > b.max[2] + 0.35) continue;
      const rel = b.max[1] - feet;
      if (rel < 0.56 || rel > 2.25) continue;
      if (b.min[1] > feet + 1.0) continue;
      if (b.max[1] > top) top = b.max[1];
    }
    if (!Number.isFinite(top)) return false;
    const landX = s.position.x + nx * 1.7;
    const landZ = s.position.z + nz * 1.7;
    const landY = bf.StandHeight(landX, landZ, top);
    if (landY > top + 0.05) return false;
    if (this.Blocked(landX, landZ, landY)) return false;
    s.state = STATE.VAULT;
    s.vaultT = 0;
    s.vaultDuration = 0.55 + Math.max(0, top - feet - 0.56) * 0.16;
    s.vaultFrom = { x: s.position.x, y: feet, z: s.position.z };
    s.vaultTo = { x: landX, y: landY, z: landZ };
    s.vaultApex = top + 0.3;
    s.stuckTime = 0;
    s.detourTime = 0;
    this.vaultCount += 1;
    return true;
  }

  /** 翻越途中的一帧。走完就落回 ADVANCE，由下一次 Think 重新决策。 */
  StepVault(s, dt) {
    s.vaultT += dt;
    const k = Clamp01(s.vaultT / s.vaultDuration);
    const from = s.vaultFrom, to = s.vaultTo;
    s.position.x = from.x + (to.x - from.x) * k;
    s.position.z = from.z + (to.z - from.z) * k;
    const base = from.y + (to.y - from.y) * k;
    s.position.y = base + Math.max(0, s.vaultApex - Math.max(from.y, to.y)) * Math.sin(Math.PI * k);
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
      s.actor.Update(dt, {
        moveSpeed: 1, aim: 0, crouch: 0, prone: 0, firing: false,
        grounded: false,
        verticalVelocity: Math.cos(Math.PI * k) * Math.PI
          * Math.max(0, s.vaultApex - Math.max(from.y, to.y)) / s.vaultDuration,
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
    // **先钳地再读位置。** 反过来的话读到的是"还没落地"的那一帧，
    // 而尸体停稳之后刚体就被拆了，那个偏差会永久留在尸体上（实测下沉 0.15 m）。
    physics.ClampToGround(s.corpse, dt, { lift: s.corpse.userFeetOffset || 0.85, restitution: 0, rollDrag: 6 });
    const t = s.corpse.translation();
    const feet = t.y - (s.corpse.userFeetOffset || 0);
    s.position.set(t.x, feet, t.z);
    if (s.actor) s.actor.root.position.copy(s.position);
    const v = s.corpse.linvel();
    if (s.deadTime > 4 || (Math.hypot(v.x, v.y, v.z) < 0.08 && s.deadTime > 0.6)) {
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
      if (!this.Blocked(s.position.x + dx, s.position.z, s.position.y)) s.position.x += dx;
      if (!this.Blocked(s.position.x, s.position.z + dz, s.position.y)) s.position.z += dz;
      s.position.y = bf.StandHeight(s.position.x, s.position.z, s.position.y);
      return;
    }
    // 有人绕过物理直接改了 position（撒兵、剧本摆位、冒烟脚本摆人）就认外面那份。
    // 不对账的话表现很怪：把人挪到某处，下一帧他自己"弹"回胶囊所在的老位置 ——
    // 通关冒烟里「圈里留一个敌人」那一条就是这么失效的（人被弹回去，圈里没人了）。
    body.ReconcileTo(s.position.x, s.position.y, s.position.z);
    const cap = CAPSULE[s.stance] || CAPSULE[0];
    body.SetSize(cap.radius, cap.height);
    s.velocityY = s.grounded ? -0.6 : s.velocityY - 19.6 * dt;   // 贴地那一点向下的力保证 grounded 稳定
    const r = body.Move(dx, s.velocityY * dt, dz);
    s.position.set(r.x, r.y, r.z);
    s.grounded = r.grounded;
    if (r.grounded) s.velocityY = 0;
  }

  Blocked(x, z, y) {
    const list = this.ctx.battlefield.NearbyColliders(x, z, 1.2);
    for (const b of list) {
      if (x < b.min[0] - 0.35 || x > b.max[0] + 0.35) continue;
      if (z < b.min[2] - 0.35 || z > b.max[2] + 0.35) continue;
      if (y + 1.6 < b.min[1] || y > b.max[1]) continue;
      if (b.max[1] - y < 0.56) continue;             // 矮的东西能跨过去
      return true;
    }
    return false;
  }

  /**
   * 白刃。上了刺刀冲到 2 m 以内是真的捅，不是跑过去继续开枪 ——
   * 「上刺刀」按下去只是让人跑快一点的话，这个动词就还是假的。
   */
  TryBayonet(s, dt, player) {
    s.meleeTimer -= dt;
    if (!s.bayonetFixed || s.meleeTimer > 0 || !s.target) return;
    const dx = s.target.position.x - s.position.x;
    const dz = s.target.position.z - s.position.z;
    if (Math.hypot(dx, dz) > 2.0) return;
    s.meleeTimer = 1.1;
    const dir = this.tmpC.set(dx, 0, dz).normalize();
    // 刺刀伤害比步枪一发重（三八式带刺刀全长 1.663 m，捅上就是致命伤），
    // 但对玩家要缩（COMBAT.player.meleeScale）—— 一下秒杀玩家会让"被冲锋"
    // 变成读盘而不是危机。46 点仍然是满血的将近一半：挨两下就该退了。
    if (s.target.isPlayer && player) {
      player.TakeHit(110 * (COMBAT.player?.meleeScale ?? 0.42), "torso", dir,
        { from: s.position.clone(), melee: true });
    } else if (s.target.ref) {
      const died = s.target.ref.TakeHit(110, "torso", dir);
      if (this.ctx.vfx) this.ctx.vfx.Blood(s.target.position, dir, died ? 1 : 0.6);
    }
    if (this.ctx.audio) this.ctx.audio.Play("bayonetHit", { position: s.position.clone(), volume: 0.8 });
  }

  TryFire(s, dt, player) {
    s.fireTimer -= dt;
    // 潜行的班不许开枪 —— 这是那道命令的全部代价，也是它区别于"跟我来"的地方
    if (s.order === "covert" && this.time < s.covertUntil) return;
    // 过热：Type11.overheatShots = 200 / coolDownS = 8.0 以前是死字段。
    // 冷却期间枪口冒白烟并且**真的打不出去** —— 这就是玩家冲过街口的那个窗口。
    if (this.time < s.coolUntil) return;
    if (s.fireTimer > 0 || !s.target || s.ammo <= 0) return;
    s.aimTime += dt;
    const aimNeeded = s.weapon.aiAimTimeS ?? 0.8;
    if (s.aimTime < aimNeeded * (1 + s.suppression)) return;

    const from = this.tmpA.set(s.position.x, s.position.y + (s.stance === 2 ? 0.5 : s.stance === 1 ? 1.1 : 1.5), s.position.z);
    const to = this.tmpB.copy(s.target.position);
    to.y += 1.1;
    const dir = this.tmpC.subVectors(to, from);
    const dist = dir.length();
    dir.divideScalar(dist || 1);

    s.ammo -= 1;
    s.fireTimer = s.weapon.fireIntervalS ?? 1.2;
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
    let acc = COMBAT.aiAccuracyBase * (DIFFICULTY.aiAccuracy ?? 1);
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
          vfx.Impact(p, new THREE.Vector3(h.normal[0], h.normal[1], h.normal[2]), "brick");
        }
      }
    }
  }

  Dispose() {
    for (const s of [...this.soldiers]) this.Remove(s);
    this.soldiers.length = 0;
    // 远景人群的几何是这里烘的，拆关时要还回去；材质是工厂缓存的共用件，不动。
    if (this.crowd) this.crowd.Dispose();
    this.crowd = undefined;
  }
}

export { STATE };
