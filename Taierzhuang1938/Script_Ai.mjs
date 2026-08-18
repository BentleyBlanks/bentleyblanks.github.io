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
import { COMBAT, NAME_POOL } from "./Data_Battle.mjs";

const STATE = {
  IDLE: "idle", ADVANCE: "advance", COVER: "cover", FIRE: "fire",
  SUPPRESSED: "suppressed", RELOAD: "reload", DEAD: "dead", CHARGE: "charge",
};

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
 */
const VISIBLE_ACTOR_BUDGET = 16;

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
    this.towel = false;
    // 排队（Conga Line）是 ER2 被骂最狠的毛病之一：一个班沿同一条线走成一串。
    // 对策是每个人生成时就领一个固定的横向偏移，跟随目标时永远偏这么多。
    this.laneOffset = (this.rnd() - 0.5) * 11;
    // 守点纪律：ER2 的 AI 会在赶路途中就地对射、根本不进点，导致「只要防守方
    // 看得见攻方，这张图就极好打」。这里给防守单位一条硬规矩：
    // 一旦被派去守某个占领区，除非死亡，否则不许离开该区半径。
    this.holdZone = null;
    this.muzzle = new THREE.Vector3();
    this.lastFire = -99;
    this.director = null;       // AiDirector.Spawn 填上，Kill 时用它发阵亡事件
  }

  get alive() { return this.state !== STATE.DEAD; }

  Kill(direction) {
    if (this.state === STATE.DEAD) return false;
    this.state = STATE.DEAD;
    this.health = 0;
    this.deadTime = 0;
    if (this.actor) this.actor.Ragdoll(direction || new THREE.Vector3(0, 0, 1));
    // 阵亡事件从这里出，是**唯一**的一条路。
    // 以前扣票分散在三处（Combat.Blast 的 onKill、Main.TryFire、Main.DoMelee），
    // 结果是：日军炮弹炸死中国兵扣日方的票，玩家亲手打死人扣两票。
    if (this.director) this.director.NotifyDeath(this);
    return true;
  }

  TakeHit(damage, part, direction) {
    if (!this.alive) return false;
    const mult = part === "head" ? 3.2 : part === "torso" ? 1.0 : 0.6;
    this.health -= damage * mult;
    this.suppression = Clamp01(this.suppression + 0.45);
    if (this.health <= 0) return this.Kill(direction);
    return false;
  }
}

export class AiDirector {
  /**
   * @param {object} ctx { battlefield, actorFactory, scene, vfx, audio, player }
   */
  constructor(ctx, { maxAlive = 56, seed = 1938, visibleActors = VISIBLE_ACTOR_BUDGET } = {}) {
    this.ctx = ctx;
    this.soldiers = [];
    this.maxAlive = maxAlive;
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
    // desired 必须有**自己**的向量。事故：Act 里写 desired = this.tmpA.set(cover)，
    // 紧接着 TryFire 也拿 tmpA 当枪口起点 —— desired 是引用，被就地改成了枪口位置，
    // 于是 d < 1.2、moveSpeed = 0：找掩体和白刃冲锋两条移动路径全是空转。
    this.tmpD = new THREE.Vector3();
    this.fireCount = 0;                       // 全场 AI 开火累计，通关冒烟靠它取证
    this.deaths = { nra: 0, ija: 0 };
    this.frontObjective = { nra: null, ija: null };
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

  Spawn(side, x, z, options = {}) {
    if (this.aliveCount >= this.maxAlive) return null;
    const soldier = new Soldier(side, { ...options, x, z });
    soldier.position.y = this.ctx.battlefield.GroundHeight(x, z);
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
    if (bestD < 40) return best;
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
      if (!n) { this.frontObjective[side] = null; continue; }
      cx /= n; cz /= n;
      let best = null, bestD = 1e9;
      for (const o of list) {
        if (o.owner === side) continue;
        const d = Math.hypot(o.x - cx, o.z - cz);
        if (d < bestD) { bestD = d; best = o; }
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
      n += 1;
    }
    return n;
  }

  /** 玩家给身边的弟兄下命令。 */
  IssueOrder(orderId, origin, aimPoint, radius = 26) {
    let n = 0;
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
      }
      n += 1;
    }
    return n;
  }

  Update(dt, camera) {
    this.time += dt;
    this.frontTimer -= dt;
    if (this.frontTimer <= 0) { this.frontTimer = 1.0; this.UpdateFront(); }
    this.tickIndex += 1;
    const slice = this.tickIndex % 6;
    const player = this.ctx.player;

    for (let i = 0; i < this.soldiers.length; i += 1) {
      const s = this.soldiers[i];
      if (!s.alive) {
        s.deadTime += dt;
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

  /** 只显示离镜头最近的 visibleBudget 个人（含尸体）。见 VISIBLE_ACTOR_BUDGET 的账。 */
  CullActors(camera) {
    if (!camera) return;
    const list = this.visibleScratch;
    list.length = 0;
    for (const s of this.soldiers) {
      if (!s.actor) continue;
      s.camDist = s.position.distanceToSquared(camera.position);
      list.push(s);
    }
    list.sort((a, b) => a.camDist - b.camDist);
    for (let i = 0; i < list.length; i += 1) list[i].actor.root.visible = i < this.visibleBudget;
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

    // 找目标：取最近的**三个**敌人，逐个试通视。
    // 只试最近那一个的后果是实跑出来的：一堵院墙就能让整条战线永远没有目标 ——
    // 70 名 AI 每一次采样都是 {advance: 70}，开火计数恒为 0。
    const enemySide = s.side === "nra" ? "ija" : "nra";
    const slots = this.nearSlots;
    for (const slot of slots) { slot.dist = 1e9; slot.ref = null; slot.position = null; }
    if (enemySide === "nra" && player && player.Alive) {
      const d = s.position.distanceTo(player.position);
      const st = player.stance === "prone" ? 2 : player.stance === "crouch" ? 1 : 0;
      if (d < 120) this._PushNear(d, player, true, -1, st, player.position);
    }
    for (const other of this.soldiers) {
      if (other.side !== enemySide || !other.alive) continue;
      const d = s.position.distanceTo(other.position);
      if (d < 120) this._PushNear(d, other, false, other.id, other.stance, other.position);
    }

    let acquired = null, bestDist = 1e9;
    for (const slot of slots) {
      if (!slot.ref) continue;
      if (!this.HasLineOfSight(s, slot)) continue;
      acquired = slot; bestDist = slot.dist;
      break;
    }

    if (acquired) {
      // 新建一个目标对象而不是把槽位交出去 —— 槽位下一次 Think 就被覆写了
      s.target = { position: acquired.position, isPlayer: acquired.isPlayer, ref: acquired.ref };
      s.targetLostTime = 0;
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
      }
    } else if (s.target && bestDist < 70) {
      // 近了就压上去打（尤其反攻阶段），远了就找掩体对射
      s.state = bestDist < 16 && s.cohesion > 0.5 ? STATE.CHARGE : STATE.FIRE;
      s.stance = bestDist < 20 ? 0 : 1;
    } else {
      s.state = STATE.ADVANCE;
      s.stance = s.suppression > 0.3 ? 1 : 0;
    }

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
    const bf = this.ctx.battlefield;
    let desired = null;
    let speed = 0;

    // 守点纪律（软约束）。原来是拿坐标硬夹回：越界就把 position 拉到圆边上，
    // 人贴着一个看不见的圆边横向滑动，而且因为点从不易主，中方 AI 被永久钉死。
    // 改成只重设目标点 + 转向内侧，不动 position —— 越界是被允许的，回来是自己走回来的。
    let strayed = false;
    if (s.holdZone) {
      const dx = s.position.x - s.holdZone.x, dz = s.position.z - s.holdZone.z;
      const d = Math.hypot(dx, dz);
      if (d > s.holdZone.radius) {
        strayed = true;
        if (this.time - s.regoalTime > 1.5) {
          s.regoalTime = this.time;
          const a = s.rnd() * Math.PI * 2;
          const r = s.holdZone.radius * (0.20 + s.rnd() * 0.55);
          s.goal.set(s.holdZone.x + Math.cos(a) * r, 0, s.holdZone.z + Math.sin(a) * r);
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
      case STATE.CHARGE:
        // 守点的人不冲锋 —— 冲出去就是把点让出来
        if (s.target && !s.holdZone) { desired = this.tmpD.copy(s.target.position); speed = 3.6; }
        this.TryFire(s, dt, player);
        break;
      case STATE.ADVANCE:
      default:
        desired = this.tmpD.copy(s.goal);
        speed = s.order === "hold" ? 0 : 2.6;
        break;
    }

    // 走出守区就一切以回区为先：对射也好冲锋也好，都不许把点丢在身后
    if (strayed) { desired = this.tmpD.copy(s.goal); speed = Math.max(speed, 2.2); }

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
        if (s.detourTime > 0) {
          s.detourTime -= dt;
          const c = Math.cos(s.detourYaw), sn = Math.sin(s.detourYaw);
          const rx = nx * c - nz * sn, rz = nx * sn + nz * c;
          nx = rx; nz = rz;
        }
        const step = speed * dt * (s.stance === 1 ? 0.6 : s.stance === 2 ? 0.3 : 1);
        const beforeX = s.position.x, beforeZ = s.position.z;
        const tryX = s.position.x + nx * step;
        const tryZ = s.position.z + nz * step;
        if (!this.Blocked(tryX, s.position.z, s.position.y)) s.position.x = tryX;
        if (!this.Blocked(s.position.x, tryZ, s.position.y)) s.position.z = tryZ;
        const moved = Math.hypot(s.position.x - beforeX, s.position.z - beforeZ);
        if (moved < step * 0.4) {
          s.stuckTime += dt;
          if (s.stuckTime > 1.2) {
            s.stuckTime = 0;
            s.detourTime = 1.4 + s.rnd() * 1.4;
            s.detourYaw = (s.rnd() < 0.5 ? 1 : -1) * (Math.PI * 0.5 + s.rnd() * 0.5);
          }
        } else {
          s.stuckTime = 0;
        }
        s.yaw = Math.atan2(-nx, -nz);
        s.moveSpeed = Clamp01(speed / 3.6);
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
    s.position.y = bf.GroundHeight(s.position.x, s.position.z);

    if (s.actor) {
      s.actor.root.position.copy(s.position);
      s.actor.root.rotation.y = s.yaw;
      s.actor.Update(dt, {
        moveSpeed: s.moveSpeed,
        aim: s.state === STATE.FIRE ? 1 : 0,
        crouch: s.stance === 1 ? 1 : 0,
        prone: s.stance === 2 ? 1 : 0,
        firing: this.time - s.lastFire < 0.12,
        elapsed: this.time,
        lookYaw: 0, lookPitch: 0,
      });
    }
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

  TryFire(s, dt, player) {
    s.fireTimer -= dt;
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
    s.aimTime = 0;
    this.fireCount += 1;              // 通关冒烟要的是"仗真的打起来了"的运行时证据

    // 命中判定：基础命中率按距离、压制、姿态修正。**AI 不许百发百中** ——
    // 那会让玩家觉得自己在被作弊，而不是在被压制。
    let acc = (s.weapon.aiAccuracy ?? COMBAT.aiAccuracyBase);
    acc *= Clamp(1.25 - dist / (s.weapon.effectiveRangeM || 400) * 1.6, 0.08, 1);
    acc *= s.suppression > 0.3 ? COMBAT.aiAccuracySuppressed / COMBAT.aiAccuracyBase : 1;
    if (s.target.isPlayer && player) acc *= player.stance === "prone" ? 0.45 : player.stance === "crouch" ? 0.72 : 1;

    const hit = s.rnd() < acc;
    const vfx = this.ctx.vfx;
    const audio = this.ctx.audio;
    if (vfx) {
      vfx.MuzzleFlash(from, dir, { scale: s.weapon.kind === "lmg" ? 1.25 : 1 });
      vfx.Tracer(from, this.tmpB.clone().copy(from).addScaledVector(dir, dist), {
        kind: s.side === "nra" ? "nra" : "ija",
      });
    }
    if (audio) {
      const name = s.side === "nra"
        ? (s.weaponId === "Zb26" ? "zb26" : "rifleNra")
        : (s.weaponId === "Type11" ? "type11" : s.weaponId === "Type92Hmg" ? "type92" : "rifleIja");
      audio.Play(name, { position: from.clone(), volume: 1 });
    }

    if (hit) {
      const part = s.rnd() < 0.08 ? "head" : s.rnd() < 0.6 ? "torso" : (s.rnd() < 0.5 ? "arm" : "leg");
      if (s.target.isPlayer && player) {
        player.TakeHit(s.weapon.damage * 0.55, part, dir);
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
  }
}

export { STATE };
