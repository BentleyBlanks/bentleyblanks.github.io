// ===========================================================================
// Script_AiTactics.mjs —— 敌军 AI 的**班组层**：黑板、攻击令牌、任务分配、
// 侧翼点、跃进配对、投弹与撤退判定。
//
// 职责（docs/Data_EnemyAi.md §4.4）：把「一群各打各的人」变成「一个班在配合」——
// 有人咬住正面，有人压制，有人绕，有人跃进；你蹲久了会挨手榴弹；打散了会退。
// 现状的病根在 §2.4：六人编队只共享一个焦点，攻击令牌只对玩家有，
// 没有侧翼、没有跃进、没有投弹决策、没有撤退。这一层补的就是这一整块。
//
// ---------------------------------------------------------------------------
// 硬契约（项目契约 2：规则层无 three 依赖）
//
//   · **不 import three、不 import Script_Ai**。只吃普通对象与注入的宿主回调，
//     所以能在纯 Node 里毫秒级跑完（`Script_AiTacticsTest.mjs`）。
//   · 只 import 两张纯数据表：`Data_Battle.COMBAT`（读 maxShootersOnPlayer，
//     那是 TTK 账的一部分，这里绝不另存一份）与 `Data_Weapons.WEAPONS.Grenade`
//     （读投掷初速算射程上限）。调参一律在 `Data_Tuning_AiTactics.mjs`。
//   · 掩体注册表（`Script_AiCover`）**靠构造注入的鸭子类型**，不 import：
//     第一波四个模块并行编写，互相 import 会把彼此的进度绑死。
//     只用到两个方法：`Nearby(x, z, radiusM) → cover[]`、可选的 `Query/IsFlanked`。
//     没注册表时侧翼点退化为「只看可走与路程」，行为变差但不会崩。
//
// 宿主回调（`host`，由 Script_Ai 从 ctx 组装，四个模块共用同一份形状，见 §3）：
//   Time() → 秒；Rnd() → 0..1 确定性随机；Walkable(x, z) → bool；
//   Steer(x, z, tx, tz, out) → bool（估路，默认不用，见表里 steerPathProbe）；
//   GroundHeight(x, z) → m（本模块只在没有 y 时兜底）。
//   全部可缺省：缺 Walkable 当处处可走，缺 Rnd 走内置 Mulberry32（仍然确定性）。
//
// 朝向契约（全项目）：yaw = 0 正面朝 -Z；前向量 = (-sin(yaw), 0, -cos(yaw))；
// X 向东、Z 向南、Y 向上，单位米。侧翼点的「正面锥」就按这一条算。
//
// ---------------------------------------------------------------------------
// 写给集成者的四条约定
//
//   1. **携行字段**：`ShouldGrenade` 认 `soldier.throwables.Grenade`（数量）为准，
//      没有这个字段时退回 `soldier.grenades`（数量）。两个都没有 = 身上没弹 = 不扔。
//      Script_Ai 现在的 `Soldier` 两个都没有，所以接入前**默认没人扔手榴弹**，
//      这是有意的保守默认：先由第一关的编成给日军发弹，再看见手榴弹雨。
//   2. **令牌只管 ENGAGE**。压制射击（打 LKP、命中恒 false）不占令牌 ——
//      令牌限的是「同时有多少支枪真的在瞄你」，不是「有多少支枪在响」。
//      方案 §4.3 那句「压制射击…且本人有攻击令牌」与 §4.4 的「无令牌者转 SUPPRESS」
//      直接冲突，这里按 §4.4 实现（见报告里的偏离说明）。
//   3. **task.kind 可以是 null**：表示「班组这一秒没给你派活」，
//      Script_Ai 按方案 §5 走本地决策（IDLE / ADVANCE / 原有状态机）。
//      TASK 表仍然只有方案里的八条。
//   4. **返回的对象是复用的**：`FlankPoint` 与 `UpdateSquad` 的返回值、
//      `Enemies()` 的数组、`BoundPairs()` 的数组都在下一次调用时被覆盖，
//      拿到就用 / 就抄走，别存。task 与 task.point 也是**每人一份、原地改写**，
//      热路径零分配（唯一的 new 是每个兵第一次拿到任务时那一个 task 对象）。
// ===========================================================================

import { COMBAT } from "./Data_Battle.mjs";
import { WEAPONS } from "./Data_Weapons.mjs";
import {
  TACTICS, ROLE_PREFERENCE, ENGAGE_PRIORITY, FLANK, BOUND, GRENADE, RETREAT, INVESTIGATE, BLACKBOARD,
} from "./Data_Tuning_AiTactics.mjs";

/** 玩家在 AI 侧的目标 id：`Script_Ai.Think` 用 -1 推玩家进候选槽，这里沿用。 */
export const PLAYER_TARGET_ID = -1;

/** 八条任务。字符串值是跨模块契约（Debug 覆盖层、浏览器验收都读它），不许改字面量。 */
export const TASK = Object.freeze({
  ENGAGE: "engage",
  SUPPRESS: "suppress",
  FLANK: "flank",
  BOUND: "bound",
  HOLD: "hold",
  INVESTIGATE: "investigate",
  RETREAT: "retreat",
  GRENADE: "grenade",
});

/** 机动类任务：剧本旗与守区的人一条都不许拿（方案 §4.4 / §6）。 */
export const MANEUVER_TASKS = Object.freeze([TASK.FLANK, TASK.BOUND, TASK.INVESTIGATE, TASK.RETREAT]);

/** 守点 / 剧本单位允许的四条（其余一律降级）。 */
export const HOLD_SAFE_TASKS = Object.freeze([TASK.HOLD, TASK.ENGAGE, TASK.SUPPRESS, TASK.GRENADE]);

export function IsManeuverTask(kind) {
  return kind === TASK.FLANK || kind === TASK.BOUND || kind === TASK.INVESTIGATE || kind === TASK.RETREAT;
}

/** 觉察级别的序（与 Script_AiPerception 的 ALERT 同名同序；不 import，避免绑死进度）。 */
export const ALERT_RANK = Object.freeze({ unaware: 0, suspicious: 1, alert: 2, engaged: 3 });

export function AlertRank(alert) {
  if (typeof alert !== "string") return -1;
  const rank = ALERT_RANK[alert];
  return rank === undefined ? -1 : rank;
}

// ---------------------------------------------------------------- 小工具
function Clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
function Clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

/** 确定性随机兜底：宿主没给 Rnd 时用它，绝不用 Math.random（同种子必须重跑一致）。 */
function Mulberry32(seed) {
  let a = seed >>> 0;
  return function Next() {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 位置读取：兼容 `{position:{x,y,z}}`（Script_Ai 的 Soldier）与裸 `{x,z}`。 */
function PosX(o) {
  if (!o) return NaN;
  if (o.position && Number.isFinite(o.position.x)) return o.position.x;
  return Number.isFinite(o.x) ? o.x : NaN;
}
function PosZ(o) {
  if (!o) return NaN;
  if (o.position && Number.isFinite(o.position.z)) return o.position.z;
  return Number.isFinite(o.z) ? o.z : NaN;
}
function PosY(o) {
  if (!o) return 0;
  if (o.position && Number.isFinite(o.position.y)) return o.position.y;
  return Number.isFinite(o.y) ? o.y : 0;
}

/** 敌情读取：优先取 LKP（我们**知道**的位置），没有才退回对象自己的坐标。 */
function EnemyX(e) {
  if (!e) return NaN;
  if (e.lkp && Number.isFinite(e.lkp.x)) return e.lkp.x;
  return PosX(e);
}
function EnemyZ(e) {
  if (!e) return NaN;
  if (e.lkp && Number.isFinite(e.lkp.z)) return e.lkp.z;
  return PosZ(e);
}
function EnemyY(e) {
  if (!e) return 0;
  if (e.lkp && Number.isFinite(e.lkp.y)) return e.lkp.y;
  return PosY(e);
}

/**
 * 剧本旗：这些人的走位由关卡编排说了算，战术层只许给他们**原地能做的事**。
 * 名单来自方案 §4.4 与 Script_Ai 现有字段，多一个少一个都会改变第一关的表演。
 */
export function IsScripted(soldier, now = null) {
  if (!soldier) return true;
  if (soldier.scriptDefensive === true) return true;
  if (soldier.p012Guided === true) return true;
  if (soldier.emplacementId !== null && soldier.emplacementId !== undefined) return true;
  if (soldier.meleeCombat) return true;
  if (soldier.scriptedNoncombatant === true) return true;
  if (soldier.dummy === true) return true;
  if (soldier.order === "covert") return true;
  // covertUntil 是 IssueOrder("covert") 写的有效期；order 会被别的命令改掉，
  // 但潜行的六十秒里这个人仍然不该被派去绕后。
  if (now !== null && Number.isFinite(soldier.covertUntil) && now < soldier.covertUntil) return true;
  return false;
}

/** 能不能给机动任务：剧本旗之外，守区（holdZone）同样一步都不许出。 */
export function CanManeuver(soldier, now = null) {
  if (!soldier || soldier.alive === false) return false;
  if (IsScripted(soldier, now)) return false;
  if (soldier.holdZone) return false;
  return true;
}

/** 不参与战术分配的人（伙夫、担架队、赤手空拳的）。 */
function IsNoncombatant(soldier) {
  if (!soldier) return true;
  if (soldier.unarmed === true) return true;
  return ROLE_PREFERENCE[soldier.tacticalRole] === "none";
}

function RolePreference(role) {
  const pref = ROLE_PREFERENCE[role];
  return pref === undefined ? "fill" : pref;
}

/**
 * 任务对象：每人一份，之后只原地改写。
 * point 与 pointStore 是同一个对象的两个名字：不需要点位时把 point 置 null，
 * 需要时再指回 pointStore —— 这样「有没有点」是一个可判空的字段，又不产生垃圾。
 */
function EnsureTask(soldier) {
  let task = soldier.task;
  if (!task) {
    task = {
      kind: null,
      point: null,
      targetId: null,
      until: -1e9,
      partnerId: null,
      // --- 以下是给集成者的提示字段，不在方案的最小契约里，读不读都行 ---
      coverRadiusM: TACTICS.coverSearchM,   // 掩体查询半径上限（守区的人被压在区内）
      towardX: 0, towardZ: 0,               // 跃进方向（队向），给 Query 的 toward 用
      flankUntil: -1e9,                     // 侧翼点的认账期，中途不重选
      flankDoneAt: -1e9,                    // 上一次绕到位的时刻（recycleS 内不再派绕）
      issuedAt: -1e9,
      squadId: "",
      pointStore: { x: 0, z: 0 },
    };
    soldier.task = task;
  }
  return task;
}

/** 清任务（死亡 / 退出战术层时用）。不删对象，下次复用。 */
export function ClearTask(soldier, now = 0) {
  if (!soldier || !soldier.task) return;
  const task = soldier.task;
  task.kind = null;
  task.point = null;
  task.targetId = null;
  task.partnerId = null;
  task.until = now;
}

// ===========================================================================
// 班组黑板
// ===========================================================================

function MakeEntry() {
  return {
    id: 0,
    isPlayer: false,
    lkp: { x: 0, y: 0, z: 0, time: -1e9, confidence: 0 },
    lastSeenAt: -1e9,
    confidence: 0,
    seenBy: 0,
    awareness: 0,
    yaw: NaN,
    ref: null,
    coverId: null,
    stationaryS: 0,
    contributors: [],
    contributorCount: 0,
    index: -1,
  };
}

function ResetEntry(entry, id, isPlayer) {
  entry.id = id;
  entry.isPlayer = isPlayer;
  entry.lkp.x = 0; entry.lkp.y = 0; entry.lkp.z = 0;
  entry.lkp.time = -1e9; entry.lkp.confidence = 0;
  entry.lastSeenAt = -1e9;
  entry.confidence = 0;
  entry.seenBy = 0;
  entry.awareness = 0;
  entry.yaw = NaN;
  entry.ref = null;
  entry.coverId = null;
  entry.stationaryS = 0;
  entry.contributorCount = 0;
  entry.index = -1;
}

/**
 * 一个班共用的敌情黑板。
 *
 * 为什么要有它：现状（§2.1）里班组只共享「最近敌人的坐标」，不共享**谁看见了什么**。
 * 于是一个人被打冷枪，旁边五个人一无所知；玩家从墙后探头打一枪缩回去，
 * 整条战线的记忆随他一起消失。黑板把每个人的 Track 合并成一份队级敌情，
 * 谁看见都算全班看见 —— 这是「敌人会追打你最后露头的地方」的数据底座。
 *
 * 合并规则：同一个目标**取最新**；同一时刻**取高置信**。
 * 过期（blackboardMemoryS）自动清理，不留昨天的鬼影。
 */
export class SquadBlackboard {
  /** @param {string} squadId @param {string} side @param {object|null} host 只用 Time() */
  constructor(squadId, side, host = null) {
    this.squadId = squadId;
    this.side = side;
    this.host = host || null;
    this.entries = new Map();     // targetId → entry
    this.order = [];              // 同一批 entry 的稠密数组，遍历走它（Map 迭代器要分配）
    this.pool = [];
    this.list = [];               // Enemies() 复用的返回数组
    this.centerX = 0;
    this.centerZ = 0;
    this.focusId = null;
    this.focusUntil = -1e9;
    this.latest = 0;              // 见过的最大时间戳：没有 host 时拿它当"现在"
  }

  Now() {
    const t = this.host && typeof this.host.Time === "function" ? this.host.Time() : NaN;
    return Number.isFinite(t) ? t : this.latest;
  }

  /** 队级重心，`Primary()` 按它算远近（由 TacticsDirector.UpdateSquad 每秒喂）。 */
  SetCenter(x, z) {
    if (Number.isFinite(x)) this.centerX = x;
    if (Number.isFinite(z)) this.centerZ = z;
  }

  /**
   * 成员上报一条 Track。
   * track: { id, isPlayer, lkp:{x,y,z,time,confidence}, lastSeenAt, awareness,
   *          yaw?, ref?, coverId?, stationaryS? }
   * 后四项是**可选**的加料：宿主愿意带就带（侧翼锥要 yaw、投弹要 coverId/stationaryS），
   * 不带时本模块各有兜底。
   */
  Share(soldier, track) {
    if (!track) return null;
    let id = track.id;
    if (id === undefined || id === null) id = track.isPlayer ? PLAYER_TARGET_ID : null;
    if (id === null) return null;
    const lkp = track.lkp;
    if (!lkp || !Number.isFinite(lkp.x) || !Number.isFinite(lkp.z)) return null;

    const time = Number.isFinite(lkp.time) ? lkp.time : this.Now();
    if (time > this.latest) this.latest = time;
    const confidence = Number.isFinite(lkp.confidence) ? Clamp01(lkp.confidence) : 1;

    let entry = this.entries.get(id);
    if (!entry) {
      if (this.order.length >= BLACKBOARD.maxEnemies) this._DropOldest();
      entry = this.pool.pop() || MakeEntry();
      ResetEntry(entry, id, track.isPlayer === true || id === PLAYER_TARGET_ID);
      entry.index = this.order.length;
      this.order.push(entry);
      this.entries.set(id, entry);
    }

    // 取最新；同一时刻取高置信。**旧情报不许覆盖新情报**，哪怕它当时看得更清楚 ——
    // 「他半分钟前在这儿」不是「他现在在这儿」。
    if (time > entry.lkp.time || (time === entry.lkp.time && confidence > entry.lkp.confidence)) {
      entry.lkp.x = lkp.x;
      entry.lkp.y = Number.isFinite(lkp.y) ? lkp.y : 0;
      entry.lkp.z = lkp.z;
      entry.lkp.time = time;
      entry.lkp.confidence = confidence;
      entry.confidence = confidence;
      if (Number.isFinite(track.yaw)) entry.yaw = track.yaw;
      if (track.ref) entry.ref = track.ref;
      if (Number.isFinite(track.stationaryS)) entry.stationaryS = track.stationaryS;
      if (track.coverId !== undefined) entry.coverId = track.coverId;
    }
    // 「最后真的看见」与「觉察度」按最大值合并：谁看得最清楚算谁的。
    const seenAt = Number.isFinite(track.lastSeenAt) ? track.lastSeenAt : time;
    if (seenAt > entry.lastSeenAt) entry.lastSeenAt = seenAt;
    if (Number.isFinite(track.awareness) && track.awareness > entry.awareness) entry.awareness = track.awareness;

    this._NoteContributor(entry, soldier, time);
    return entry;
  }

  /** 复用数组：[{ id, isPlayer, lkp, lastSeenAt, confidence, seenBy }]（按分享时间新→旧无保证）。 */
  Enemies() {
    const now = this.Now();
    this.Prune(now);
    const list = this.list;
    list.length = 0;
    for (let i = 0; i < this.order.length; i += 1) list.push(this.order[i]);
    return list;
  }

  /**
   * 队级焦点。沿用 `UpdateSquads` 的迟滞语义：
   * 锁住的目标在 focusHoldS 内不换；窗口过后也要新目标近到 switchRatio 倍以内才换。
   */
  Primary() {
    const now = this.Now();
    this.Prune(now);
    if (this.order.length === 0) { this.focusId = null; return null; }

    let best = null;
    let bestD = Infinity;
    for (let i = 0; i < this.order.length; i += 1) {
      const e = this.order[i];
      const d = Math.hypot(e.lkp.x - this.centerX, e.lkp.z - this.centerZ);
      if (d < bestD) { bestD = d; best = e; }
    }

    const current = this.focusId === null ? null : this.entries.get(this.focusId) || null;
    if (current) {
      const cd = Math.hypot(current.lkp.x - this.centerX, current.lkp.z - this.centerZ);
      if (now < this.focusUntil || !best || cd <= bestD * BLACKBOARD.switchRatio) {
        best = current;
        bestD = cd;
      }
    }
    if (!best) { this.focusId = null; return null; }
    if (this.focusId !== best.id) {
      this.focusId = best.id;
      this.focusUntil = now + BLACKBOARD.focusHoldS;
    }
    return best;
  }

  Get(targetId) { return this.entries.get(targetId) || null; }

  Forget(targetId) {
    const entry = this.entries.get(targetId);
    if (!entry) return false;
    this._Remove(entry.index);
    return true;
  }

  Clear() {
    for (let i = this.order.length - 1; i >= 0; i -= 1) this._Remove(i);
    this.focusId = null;
    this.focusUntil = -1e9;
  }

  /** 过期清理：LKP 比 blackboardMemoryS 还旧的条目直接丢。 */
  Prune(now = this.Now()) {
    const cutoff = now - BLACKBOARD.blackboardMemoryS;
    for (let i = this.order.length - 1; i >= 0; i -= 1) {
      const entry = this.order[i];
      if (entry.lkp.time > cutoff) { this._RefreshSeenBy(entry, now); continue; }
      this._Remove(i);
    }
    return this.order.length;
  }

  _NoteContributor(entry, soldier, time) {
    const id = soldier && soldier.id !== undefined ? soldier.id : null;
    if (id === null) return;
    const list = entry.contributors;
    for (let i = 0; i < entry.contributorCount; i += 1) {
      if (list[i].id === id) { if (time > list[i].time) list[i].time = time; return; }
    }
    let cell = list[entry.contributorCount];
    if (!cell) { cell = { id: 0, time: 0 }; list[entry.contributorCount] = cell; }
    cell.id = id;
    cell.time = time;
    entry.contributorCount += 1;
  }

  _RefreshSeenBy(entry, now) {
    const cutoff = now - BLACKBOARD.blackboardMemoryS;
    let n = 0;
    for (let i = 0; i < entry.contributorCount; i += 1) {
      if (entry.contributors[i].time > cutoff) n += 1;
    }
    entry.seenBy = n;
  }

  _DropOldest() {
    let worst = -1;
    let worstTime = Infinity;
    for (let i = 0; i < this.order.length; i += 1) {
      if (this.order[i].lkp.time < worstTime) { worstTime = this.order[i].lkp.time; worst = i; }
    }
    if (worst >= 0) this._Remove(worst);
  }

  _Remove(index) {
    if (index < 0 || index >= this.order.length) return;
    const entry = this.order[index];
    const last = this.order[this.order.length - 1];
    this.order[index] = last;
    last.index = index;
    this.order.length -= 1;
    this.entries.delete(entry.id);
    if (this.focusId === entry.id) { this.focusId = null; this.focusUntil = -1e9; }
    entry.index = -1;
    entry.ref = null;
    this.pool.push(entry);
  }
}

// ===========================================================================
// 战术分配
// ===========================================================================

function MakeSlot() {
  return {
    soldier: null,
    role: "rifleman",
    preference: "fill",
    restricted: false,
    excluded: false,
    dist: Infinity,
    prevKind: null,
    prevPartnerId: null,
    kind: null,
    targetId: null,
    partnerId: null,
    hasPoint: false,
    pointX: 0,
    pointZ: 0,
    leaseS: TACTICS.taskLeaseS,
    coverRadiusM: TACTICS.coverSearchM,
    towardX: 0,
    towardZ: 0,
    keepFlank: false,
    arrivedFlank: false,
  };
}

function MakeSquadRecord(id, side) {
  return {
    id,
    side,
    blackboard: null,
    aliveCount: 0,
    peakCount: 0,
    peakAt: -1e9,
    boundPhase: 0,
    boundPhaseUntil: -1e9,
    lastGrenadeAt: -1e9,          // 真的扔出去了（NoteGrenadeThrown 写）
    lastGrenadeAssignAt: -1e9,    // 派了投弹任务（UpdateSquad 写，防止全班一起扔）
    grenadeHolderId: null,
    flankCount: 0,
  };
}

/**
 * 班组战术总管。一个 AiDirector 配一台，挂在 `UpdateSquads` 之后每秒跑一次。
 *
 * 它**不碰任何 three 对象**，只往 `soldier.task` 上写字，
 * 由 Script_Ai 的大脑（方案 §5）按 task.kind 选状态。
 */
export class TacticsDirector {
  /**
   * @param {object} host   宿主回调（Time / Rnd / Walkable / Steer / GroundHeight），可缺省
   * @param {object} coverRegistry 掩体注册表（鸭子类型：Nearby / Query / IsFlanked），可为 null
   */
  constructor(host = null, coverRegistry = null) {
    this.host = host || {};
    this.coverRegistry = coverRegistry || null;
    this.fallbackRnd = Mulberry32(0x54414354);   // "TACT"：没有宿主随机时也必须可重跑
    this.fallbackNow = 0;

    this.squads = new Map();

    // --- 攻击令牌 ---------------------------------------------------------
    // holders 是稠密数组（遍历不产生迭代器），holderBySoldier 做 O(1) 查，
    // tokenCounts 做 O(1) 计数。三份必须一起改，只走 _Grant / _Drop 两个口。
    this.holders = [];
    this.freeHolders = [];
    this.holderBySoldier = new Map();
    this.tokenCounts = new Map();
    this.lastSweepAt = -1e9;

    // --- 复用的临时物 -----------------------------------------------------
    this.slots = [];
    this.pairs = [];
    this.pairStore = [];
    this.pairPool = [];
    this.pairUsed = [];
    this.steerOut = { x: 0, z: 0 };
    this.flankScratch = { x: 0, z: 0 };
    this.enemyScratch = {
      id: null, isPlayer: false, x: 0, y: 0, z: 0, yaw: NaN,
      confidence: 0, ageS: 0, lastSeenAt: -1e9, coverId: null, stationaryS: 0,
      ref: null, entry: null,
      lkp: { x: 0, y: 0, z: 0, time: -1e9, confidence: 0 },
    };

    this.lastAssigned = 0;
    this.stats = {
      updates: 0, tokensGranted: 0, tokensDenied: 0, flankPoints: 0, flankFailed: 0,
      grenades: 0, retreats: 0, bounds: 0, investigates: 0,
    };
  }

  /** 掩体表被重建（Script_Destruction 炸掉一段墙）之后换一张。 */
  SetCoverRegistry(registry) { this.coverRegistry = registry || null; }

  Time() {
    const t = typeof this.host.Time === "function" ? this.host.Time() : NaN;
    return Number.isFinite(t) ? t : this.fallbackNow;
  }

  Rnd() {
    if (typeof this.host.Rnd === "function") {
      const v = this.host.Rnd();
      if (Number.isFinite(v)) return v;
    }
    return this.fallbackRnd();
  }

  Walkable(x, z) {
    if (typeof this.host.Walkable !== "function") return true;
    return this.host.Walkable(x, z) !== false;
  }

  /** 一个班的记录（黑板、峰值人数、跃进相位、投弹冷却都挂在这儿）。 */
  SquadRecord(squadId, side = "ija") {
    const key = squadId === undefined || squadId === null || squadId === "" ? "_solo" : squadId;
    let squad = this.squads.get(key);
    if (!squad) {
      squad = MakeSquadRecord(key, side);
      squad.blackboard = new SquadBlackboard(key, side, this.host);
      this.squads.set(key, squad);
    }
    if (side) squad.side = side;
    return squad;
  }

  /** 方案 §4.4 的 `Blackboard(squadId, side)`。 */
  Blackboard(squadId, side = "ija") { return this.SquadRecord(squadId, side).blackboard; }

  /** 换关 / 重开：把令牌、黑板、班记录全清掉。 */
  Reset() {
    this.squads.clear();
    this.holders.length = 0;
    this.freeHolders.length = 0;
    this.holderBySoldier.clear();
    this.tokenCounts.clear();
    this.lastSweepAt = -1e9;
  }

  // ------------------------------------------------------------ 攻击令牌
  /**
   * 抢一个「我现在正瞄着这个目标」的名额。
   *
   * 上限：玩家用 `COMBAT.maxShootersOnPlayer`（TTK 账的一部分，只读不改），
   * AI 目标用 `TACTICS.maxShootersPerTarget`。
   * 已经持有同一目标令牌的人是**续租**，不重新排队 —— 否则上限一满，
   * 现有持有者也会被挤掉，整条战线每秒集体换目标（那正是 §2.1 里的抽搐源）。
   */
  AcquireToken(targetId, soldierId, isPlayer = undefined) {
    if (targetId === undefined || targetId === null) return false;
    if (soldierId === undefined || soldierId === null) return false;
    const now = this.Time();
    this.SweepTokens(now);

    let holder = this.holderBySoldier.get(soldierId);
    if (holder && holder.targetId !== targetId) { this._Drop(holder); holder = null; }
    if (holder) { holder.until = now + TACTICS.tokenLeaseS; return true; }

    const player = isPlayer === undefined ? targetId === PLAYER_TARGET_ID : isPlayer === true;
    const cap = player
      ? (Number.isFinite(COMBAT.maxShootersOnPlayer) ? COMBAT.maxShootersOnPlayer : 3)
      : TACTICS.maxShootersPerTarget;
    const count = this.tokenCounts.get(targetId) || 0;
    if (count >= cap) { this.stats.tokensDenied += 1; return false; }

    holder = this.freeHolders.pop() || { soldierId: null, targetId: null, until: 0, index: -1 };
    holder.soldierId = soldierId;
    holder.targetId = targetId;
    holder.until = now + TACTICS.tokenLeaseS;
    holder.index = this.holders.length;
    this.holders.push(holder);
    this.holderBySoldier.set(soldierId, holder);
    this.tokenCounts.set(targetId, count + 1);
    this.stats.tokensGranted += 1;
    return true;
  }

  /** 释放（死亡 / 换目标 / 转成非 ENGAGE 任务时调）。 */
  ReleaseToken(soldierId) {
    const holder = this.holderBySoldier.get(soldierId);
    if (!holder) return false;
    this._Drop(holder);
    return true;
  }

  /** 目标死了：把所有指着他的令牌一次收回。 */
  ReleaseTokensForTarget(targetId) {
    let n = 0;
    for (let i = this.holders.length - 1; i >= 0; i -= 1) {
      const holder = this.holders[i];
      if (holder.targetId !== targetId) continue;
      this._Drop(holder);
      n += 1;
    }
    return n;
  }

  /** 到期回收。同一时刻只扫一次（Think 一帧内会问很多次）。 */
  SweepTokens(now = this.Time()) {
    if (now === this.lastSweepAt) return;
    this.lastSweepAt = now;
    for (let i = this.holders.length - 1; i >= 0; i -= 1) {
      const holder = this.holders[i];
      if (holder.until > now) continue;
      this._Drop(holder);
    }
  }

  TokenCount(targetId) { return this.tokenCounts.get(targetId) || 0; }

  TokenTarget(soldierId) {
    const holder = this.holderBySoldier.get(soldierId);
    return holder ? holder.targetId : null;
  }

  HasToken(soldierId, targetId = undefined) {
    const holder = this.holderBySoldier.get(soldierId);
    if (!holder) return false;
    return targetId === undefined ? true : holder.targetId === targetId;
  }

  _Drop(holder) {
    const index = holder.index;
    const last = this.holders[this.holders.length - 1];
    this.holders[index] = last;
    last.index = index;
    this.holders.length -= 1;
    this.holderBySoldier.delete(holder.soldierId);
    const left = (this.tokenCounts.get(holder.targetId) || 1) - 1;
    if (left <= 0) this.tokenCounts.delete(holder.targetId);
    else this.tokenCounts.set(holder.targetId, left);
    holder.index = -1;
    holder.soldierId = null;
    holder.targetId = null;
    holder.until = -1e9;
    this.freeHolders.push(holder);
  }

  // ------------------------------------------------------------ 每秒分配
  /**
   * 给一个班派活（每秒一次，挂在 `UpdateSquads` 之后）。
   *
   * group 是 UpdateSquads 已经算好的那个对象：
   *   { id, side, members, count, x, z, forwardX, forwardZ, focusKind, focusId, focusX, focusZ }
   * player 只用来取**朝向**（侧翼锥要知道他面朝哪儿）与死活，不用来取坐标 ——
   * 位置一律走黑板的 LKP，不给 AI 开天眼。
   *
   * @returns {object|null} 本次解出的队级敌情（**复用对象**，别存）；没有敌情时 null。
   */
  UpdateSquad(group, player = null) {
    if (!group || !Array.isArray(group.members)) return null;
    const now = this.Time();
    this.SweepTokens(now);
    this.stats.updates += 1;

    const squad = this.SquadRecord(group.id, group.side);
    const blackboard = squad.blackboard;
    blackboard.SetCenter(group.x, group.z);
    blackboard.Prune(now);

    const enemy = this._ResolveEnemy(group, player, squad, now);

    // --- 建槽（顺带回收死人的令牌） ---------------------------------------
    const slots = this.slots;
    let n = 0;
    for (let i = 0; i < group.members.length; i += 1) {
      const soldier = group.members[i];
      if (!soldier) continue;
      if (soldier.alive === false) { this.ReleaseToken(soldier.id); ClearTask(soldier, now); continue; }
      let slot = slots[n];
      if (!slot) { slot = MakeSlot(); slots[n] = slot; }
      this._FillSlot(slot, soldier, enemy, now);
      n += 1;
    }
    squad.aliveCount = n;
    if (n > squad.peakCount || now - squad.peakAt > RETREAT.peakWindowS) {
      squad.peakCount = n;
      squad.peakAt = now;
    }
    squad.flankCount = 0;

    // --- ① 撤退（最高优先：这个班已经不成班了） ---------------------------
    for (let i = 0; i < n; i += 1) {
      const slot = slots[i];
      if (slot.kind || slot.restricted) continue;
      if (!this.ShouldRetreat(slot.soldier, group)) continue;
      slot.kind = TASK.RETREAT;
      slot.leaseS = RETREAT.holdS;
      this._SetRetreatPoint(slot, group, enemy);
      this.stats.retreats += 1;
    }

    // --- ② 投弹（每次更新最多一枚，剧本旗的人也能扔：原地能做的事） -------
    if (enemy) {
      for (let i = 0; i < n; i += 1) {
        const slot = slots[i];
        if (slot.kind || slot.excluded) continue;
        if (!this.ShouldGrenade(slot.soldier, enemy, now)) continue;
        slot.kind = TASK.GRENADE;
        slot.targetId = enemy.id;
        slot.hasPoint = true;
        slot.pointX = enemy.lkp.x;
        slot.pointZ = enemy.lkp.z;
        squad.lastGrenadeAssignAt = now;
        squad.grenadeHolderId = slot.soldier.id;
        this.stats.grenades += 1;
        break;
      }
    }

    // --- ③ 侧翼（先给专职侧翼手） -----------------------------------------
    if (enemy) this._AssignFlanks(group, slots, n, squad, enemy, now, true);

    // --- ④ 攻击令牌 → ENGAGE（按角色优先级抢） ----------------------------
    let engagers = 0;
    if (enemy && this._EngageWorthy(enemy, now)) {
      // 先给已经持有令牌的人续租：稳定压倒公平，否则每秒重新排队 = 集体换目标。
      for (let i = 0; i < n; i += 1) {
        const slot = slots[i];
        if (slot.kind || slot.excluded || !this.HasToken(slot.soldier.id, enemy.id)) continue;
        if (this.AcquireToken(enemy.id, slot.soldier.id, enemy.isPlayer)) {
          this._AssignEngage(slot, enemy);
          engagers += 1;
        }
      }
      for (let p = 0; p < ENGAGE_PRIORITY.length; p += 1) {
        const role = ENGAGE_PRIORITY[p];
        for (let i = 0; i < n; i += 1) {
          const slot = slots[i];
          if (slot.kind || slot.excluded || slot.role !== role) continue;
          if (!this.AcquireToken(enemy.id, slot.soldier.id, enemy.isPlayer)) continue;
          this._AssignEngage(slot, enemy);
          engagers += 1;
        }
      }
      // 角色表里没登记的兵（自定义 tacticalRole）最后填。
      for (let i = 0; i < n; i += 1) {
        const slot = slots[i];
        if (slot.kind || slot.excluded || ENGAGE_PRIORITY.indexOf(slot.role) >= 0) continue;
        if (!this.AcquireToken(enemy.id, slot.soldier.id, enemy.isPlayer)) continue;
        this._AssignEngage(slot, enemy);
        engagers += 1;
      }
    }

    // --- ⑤ 补一个侧翼（正面已经有人咬住时才放第二个人走） -----------------
    if (enemy && engagers >= TACTICS.fillFlankMinEngagers) {
      this._AssignFlanks(group, slots, n, squad, enemy, now, false);
    }

    // --- ⑥ 跃进配对（一动一掩护） -----------------------------------------
    if (enemy) this._AssignBounds(group, slots, n, squad, enemy, now);

    // --- ⑦ 压制 / 查看 / 守 -----------------------------------------------
    const track = enemy ? enemy.entry : null;
    for (let i = 0; i < n; i += 1) {
      const slot = slots[i];
      if (slot.kind || slot.excluded) continue;
      if (enemy && this._SuppressWorthy(enemy, now)) {
        slot.kind = TASK.SUPPRESS;
        slot.targetId = enemy.id;
        slot.hasPoint = true;
        slot.pointX = enemy.lkp.x;
        slot.pointZ = enemy.lkp.z;
        continue;
      }
      if (!slot.restricted && track && this.ShouldInvestigate(slot.soldier, track, now)) {
        slot.kind = TASK.INVESTIGATE;
        slot.targetId = track.id;
        slot.hasPoint = true;
        slot.pointX = track.lkp.x;
        slot.pointZ = track.lkp.z;
        slot.leaseS = INVESTIGATE.holdS;
        this.stats.investigates += 1;
        continue;
      }
      if (slot.restricted) {
        // 守区 / 剧本单位没别的活时就是「守」：原地找掩体、监视扇面。
        slot.kind = TASK.HOLD;
        const zone = slot.soldier.holdZone;
        if (zone) { slot.hasPoint = true; slot.pointX = zone.x; slot.pointZ = zone.z; }
      }
      // 其余人 kind 保持 null：班组这一秒没派活，Script_Ai 走本地决策。
    }

    // --- 落笔 --------------------------------------------------------------
    let assigned = 0;
    for (let i = 0; i < n; i += 1) {
      const slot = slots[i];
      const soldier = slot.soldier;
      const task = EnsureTask(soldier);
      task.kind = slot.kind;
      task.targetId = slot.targetId;
      task.partnerId = slot.partnerId;
      task.coverRadiusM = slot.coverRadiusM;
      task.towardX = slot.towardX;
      task.towardZ = slot.towardZ;
      task.issuedAt = now;
      task.squadId = squad.id;
      task.until = now + slot.leaseS;
      if (slot.hasPoint) {
        task.pointStore.x = slot.pointX;
        task.pointStore.z = slot.pointZ;
        task.point = task.pointStore;
      } else {
        task.point = null;
      }
      if (slot.kind === TASK.FLANK) { if (!slot.keepFlank) task.flankUntil = now + FLANK.holdS; }
      else task.flankUntil = -1e9;
      // ENGAGE 之外的人不该占着令牌：绕后的、跃进的、压制的都把名额让出来。
      if (slot.kind !== TASK.ENGAGE) this.ReleaseToken(soldier.id);
      if (slot.kind) assigned += 1;
      slot.soldier = null;   // 不留引用，免得死兵被槽位吊住
    }
    this.lastAssigned = assigned;
    return enemy;
  }

  _FillSlot(slot, soldier, enemy, now) {
    slot.soldier = soldier;
    slot.role = typeof soldier.tacticalRole === "string" ? soldier.tacticalRole : "rifleman";
    slot.preference = RolePreference(slot.role);
    slot.restricted = !CanManeuver(soldier, now);
    slot.prevKind = soldier.task ? soldier.task.kind : null;
    slot.prevPartnerId = soldier.task ? soldier.task.partnerId : null;
    slot.kind = null;
    slot.targetId = null;
    slot.partnerId = null;
    slot.hasPoint = false;
    slot.pointX = 0;
    slot.pointZ = 0;
    slot.leaseS = TACTICS.taskLeaseS;
    slot.towardX = 0;
    slot.towardZ = 0;
    slot.keepFlank = false;
    slot.arrivedFlank = false;
    slot.dist = enemy ? Math.hypot(PosX(soldier) - enemy.lkp.x, PosZ(soldier) - enemy.lkp.z) : Infinity;
    // 掩体查询半径提示：守区的人被压在区内（方案 §6 的 Defend 语义），其余按交火半径。
    const zone = soldier.holdZone;
    slot.coverRadiusM = zone && Number.isFinite(zone.radius)
      ? zone.radius + TACTICS.holdCoverSlackM
      : TACTICS.coverSearchM;
    // 不参与战术分配的人（伙夫、担架队、赤手空拳的）：一条任务都不给，
    // kind 留 null 让 Script_Ai 走本地决策（他们本来就有自己的走位）。
    slot.excluded = IsNoncombatant(soldier);
    if (slot.excluded) slot.restricted = true;
  }

  _AssignEngage(slot, enemy) {
    slot.kind = TASK.ENGAGE;
    slot.targetId = enemy.id;
    slot.hasPoint = true;
    slot.pointX = enemy.lkp.x;
    slot.pointZ = enemy.lkp.z;
  }

  _SetRetreatPoint(slot, group, enemy) {
    let dx = 0;
    let dz = 0;
    if (enemy) {
      dx = group.x - enemy.lkp.x;
      dz = group.z - enemy.lkp.z;
    } else {
      dx = group.x - PosX(slot.soldier);
      dz = group.z - PosZ(slot.soldier);
    }
    const len = Math.hypot(dx, dz);
    if (len < 1e-3) { slot.hasPoint = true; slot.pointX = group.x; slot.pointZ = group.z; return; }
    slot.hasPoint = true;
    slot.pointX = group.x + (dx / len) * RETREAT.fallbackM;
    slot.pointZ = group.z + (dz / len) * RETREAT.fallbackM;
  }

  /**
   * 侧翼分配。primaryPass=true 只给专职侧翼手，false 是「正面有人咬住之后补一个」。
   * 已经在路上的人不重选点（FLANK.holdS 内认账），否则每秒一个新点 = 原地打转。
   */
  _AssignFlanks(group, slots, n, squad, enemy, now, primaryPass) {
    if (squad.flankCount >= FLANK.flankers) return;
    for (let i = 0; i < n; i += 1) {
      const slot = slots[i];
      if (slot.kind || slot.restricted) continue;
      // 第一遍只给专职侧翼手；补位那一遍只给"填空缺"的步枪手 ——
      // 机枪手要压制、突击手要跃进，把他们抽去绕后等于拆了班的形状。
      if (primaryPass) { if (slot.preference !== "flank") continue; }
      else if (slot.preference !== "fill") continue;
      if (squad.flankCount >= FLANK.flankers) return;

      const soldier = slot.soldier;
      const task = soldier.task;
      // 刚绕完一圈的人先在正面待一会儿：不给它「到位→立刻再派下一个点」的机会。
      if (slot.arrivedFlank) continue;
      if (task && now - task.flankDoneAt < FLANK.recycleS) continue;
      // 认账期内、还没走到、点仍然可走 → 继续走原来那个点。
      if (task && task.kind === TASK.FLANK && task.point && now < task.flankUntil) {
        const left = Math.hypot(task.point.x - PosX(soldier), task.point.z - PosZ(soldier));
        if (left <= FLANK.arriveM) {
          // 到位了：这一轮不再绕，落回令牌 / 压制那一档（方案 §4.4「到位后转 ENGAGE」）。
          task.flankDoneAt = now;
          task.flankUntil = -1e9;
          slot.arrivedFlank = true;
          continue;
        }
        if (this.Walkable(task.point.x, task.point.z)) {
          slot.kind = TASK.FLANK;
          slot.targetId = enemy.id;
          slot.hasPoint = true;
          slot.pointX = task.point.x;
          slot.pointZ = task.point.z;
          slot.leaseS = FLANK.holdS;
          slot.keepFlank = true;
          squad.flankCount += 1;
          continue;
        }
      }
      const point = this.FlankPoint(group, enemy, slot.soldier);
      if (!point) { this.stats.flankFailed += 1; continue; }
      slot.kind = TASK.FLANK;
      slot.targetId = enemy.id;
      slot.hasPoint = true;
      slot.pointX = point.x;
      slot.pointZ = point.z;
      slot.leaseS = FLANK.holdS;
      squad.flankCount += 1;
    }
  }

  /**
   * 跃进：一个人动，另一个人在原地掩护，到相位时间再互换。
   * 配对本身由 `BoundPairs` 做；这里只决定「谁是这一轮的 mover」。
   */
  _AssignBounds(group, slots, n, squad, enemy, now) {
    const repair = now >= squad.boundPhaseUntil;
    if (!repair) {
      // 相位没到：保持上一轮的分工（mover 继续往前，coverer 继续掩护）。
      for (let i = 0; i < n; i += 1) {
        const slot = slots[i];
        if (slot.kind || slot.restricted) continue;
        if (slot.prevKind !== TASK.BOUND) continue;
        this._AssignBoundMover(slot, group, enemy, slot.prevPartnerId);
      }
      return;
    }
    squad.boundPhaseUntil = now + BOUND.phaseS;
    const pairs = this.BoundPairs(group);
    for (let p = 0; p < pairs.length; p += 1) {
      let mover = pairs[p][0];
      let coverer = pairs[p][1];
      let moverSlot = this._SlotOf(slots, n, mover);
      let covererSlot = this._SlotOf(slots, n, coverer);
      // 相位指定的 mover 已经有活（在打 / 在绕）就换手：没活干的那个去动。
      if ((!moverSlot || moverSlot.kind) && covererSlot && !covererSlot.kind) {
        const swap = mover; mover = coverer; coverer = swap;
        const swapSlot = moverSlot; moverSlot = covererSlot; covererSlot = swapSlot;
      }
      if (!moverSlot || moverSlot.kind) continue;
      if (moverSlot.preference === "suppress") continue;   // 机枪手不当跃进的那一头
      this._AssignBoundMover(moverSlot, group, enemy, coverer ? coverer.id : null);
      if (covererSlot && !covererSlot.kind) {
        covererSlot.kind = TASK.SUPPRESS;
        covererSlot.targetId = enemy.id;
        covererSlot.partnerId = mover.id;
        covererSlot.hasPoint = true;
        covererSlot.pointX = enemy.lkp.x;
        covererSlot.pointZ = enemy.lkp.z;
      }
    }
  }

  _AssignBoundMover(slot, group, enemy, partnerId) {
    slot.kind = TASK.BOUND;
    slot.targetId = enemy.id;
    slot.partnerId = partnerId === undefined ? null : partnerId;
    slot.coverRadiusM = Math.min(slot.coverRadiusM, TACTICS.boundCoverSearchM);
    // 只给方向，不给点：下一个掩体由集成者用 coverRegistry.Query(..., {towardX, towardZ}) 求。
    let tx = group.forwardX;
    let tz = group.forwardZ;
    if (!Number.isFinite(tx) || !Number.isFinite(tz) || (tx === 0 && tz === 0)) {
      tx = enemy.lkp.x - PosX(slot.soldier);
      tz = enemy.lkp.z - PosZ(slot.soldier);
    }
    const len = Math.hypot(tx, tz);
    if (len > 1e-4) { slot.towardX = tx / len; slot.towardZ = tz / len; }
    slot.hasPoint = false;
    this.stats.bounds += 1;
  }

  _SlotOf(slots, n, soldier) {
    if (!soldier) return null;
    for (let i = 0; i < n; i += 1) if (slots[i].soldier === soldier) return slots[i];
    return null;
  }

  /** 情报够不够新、够不够准，值不值得派人真瞄着打。 */
  _EngageWorthy(enemy, now) {
    if (!enemy) return false;
    if (enemy.confidence < TACTICS.engageConfidence) return false;
    return now - enemy.lkp.time <= TACTICS.engageMaxAgeS;
  }

  /** 压制射击的门槛比 ENGAGE 松：「他大概还在那堵墙后面」就够了。 */
  _SuppressWorthy(enemy, now) {
    if (!enemy) return false;
    if (enemy.confidence < TACTICS.suppressConfidence) return false;
    return now - enemy.lkp.time <= TACTICS.suppressMaxAgeS;
  }

  /**
   * 解出队级敌情。优先黑板（共享情报），黑板空着时退回 `UpdateSquads` 已经算好的
   * 队级焦点 —— 第一波只有 Tactics 上线、Perception 还没接的那段时间里，
   * 行为至少不比现状差。
   */
  _ResolveEnemy(group, player, squad, now) {
    const scratch = this.enemyScratch;
    const primary = squad.blackboard.Primary();
    if (primary) {
      scratch.entry = primary;
      scratch.id = primary.id;
      scratch.isPlayer = primary.isPlayer;
      scratch.lkp.x = primary.lkp.x;
      scratch.lkp.y = primary.lkp.y;
      scratch.lkp.z = primary.lkp.z;
      scratch.lkp.time = primary.lkp.time;
      scratch.lkp.confidence = primary.lkp.confidence;
      scratch.confidence = primary.confidence;
      scratch.lastSeenAt = primary.lastSeenAt;
      scratch.coverId = primary.coverId;
      scratch.stationaryS = primary.stationaryS;
      scratch.ref = primary.ref;
      scratch.yaw = primary.yaw;
    } else if (group.focusKind === "enemy" && Number.isFinite(group.focusX)) {
      scratch.entry = null;
      scratch.id = group.focusId === undefined ? null : group.focusId;
      scratch.isPlayer = group.focusId === PLAYER_TARGET_ID;
      scratch.lkp.x = group.focusX;
      scratch.lkp.y = 0;
      scratch.lkp.z = group.focusZ;
      scratch.lkp.time = now;
      scratch.lkp.confidence = 1;
      scratch.confidence = 1;
      scratch.lastSeenAt = now;
      scratch.coverId = null;
      scratch.stationaryS = 0;
      scratch.ref = null;
      scratch.yaw = NaN;
    } else {
      return null;
    }
    if (scratch.id === null || scratch.id === undefined) return null;
    // 侧翼锥要知道目标面朝哪儿。玩家的朝向按方案 §4.4 直接读 player.yaw
    // （这是**有意**开的一点天眼：不知道正面就绕不成侧翼，代价是玩家转身时侧翼点会重算）。
    if (scratch.isPlayer && player && Number.isFinite(player.yaw)) scratch.yaw = player.yaw;
    else if (!Number.isFinite(scratch.yaw) && scratch.ref && Number.isFinite(scratch.ref.yaw)) {
      scratch.yaw = scratch.ref.yaw;
    }
    scratch.x = scratch.lkp.x;
    scratch.y = scratch.lkp.y;
    scratch.z = scratch.lkp.z;
    scratch.ageS = now - scratch.lkp.time;
    return scratch;
  }

  // ------------------------------------------------------------ 侧翼点
  /**
   * 在目标**正面锥以外**找一个可走、附近有掩体、路程够短的点。
   *
   * @param group 队（要 x / z 当重心，用于不知道目标朝向时的兜底正面）
   * @param enemy 敌情（要 lkp；有 yaw 更好）
   * @param opts  可以是一个兵（取它的位置估路），也可以是
   *              { soldier, fromX, fromZ, radiusM, samples, minAngleRad, maxPathM, coverNearbyM }
   * @returns {{x:number,z:number}|null} **复用对象**，拿到就抄走
   */
  FlankPoint(group, enemy, opts = null) {
    if (!enemy) return null;
    const ex = EnemyX(enemy);
    const ez = EnemyZ(enemy);
    if (!Number.isFinite(ex) || !Number.isFinite(ez)) return null;

    const soldier = opts && opts.soldier ? opts.soldier
      : (opts && (opts.position || Number.isFinite(opts.x)) ? opts : null);
    const options = opts && !soldier ? opts : (opts && opts.soldier ? opts : null);
    let fromX = options && Number.isFinite(options.fromX) ? options.fromX : PosX(soldier);
    let fromZ = options && Number.isFinite(options.fromZ) ? options.fromZ : PosZ(soldier);
    if (!Number.isFinite(fromX) || !Number.isFinite(fromZ)) {
      fromX = Number.isFinite(group && group.x) ? group.x : ex;
      fromZ = Number.isFinite(group && group.z) ? group.z : ez;
    }
    const radiusM = options && Number.isFinite(options.radiusM) ? options.radiusM : FLANK.flankRadiusM;
    const samples = Math.max(3, Math.round(
      options && Number.isFinite(options.samples) ? options.samples : FLANK.flankSamples));
    const minAngle = options && Number.isFinite(options.minAngleRad) ? options.minAngleRad : FLANK.flankMinAngleRad;
    const maxPathM = options && Number.isFinite(options.maxPathM) ? options.maxPathM : FLANK.flankMaxPathM;
    const coverNearbyM = options && Number.isFinite(options.coverNearbyM) ? options.coverNearbyM : FLANK.coverNearbyM;

    // 目标正面：yaw=0 面朝 -Z（全项目朝向契约）。不知道 yaw 就拿
    // 「目标 → 我方重心」当正面 —— 他多半正对着开火的那一侧。
    let fx;
    let fz;
    if (Number.isFinite(enemy.yaw)) {
      fx = -Math.sin(enemy.yaw);
      fz = -Math.cos(enemy.yaw);
    } else {
      const gx = Number.isFinite(group && group.x) ? group.x : fromX;
      const gz = Number.isFinite(group && group.z) ? group.z : fromZ;
      fx = gx - ex;
      fz = gz - ez;
      const len = Math.hypot(fx, fz);
      if (len < 1e-4) { fx = 0; fz = -1; } else { fx /= len; fz /= len; }
    }

    const jitter = this.Rnd() * Math.PI * 2;
    let bestScore = -Infinity;
    let bestX = 0;
    let bestZ = 0;
    let found = false;
    for (let i = 0; i < samples; i += 1) {
      const a = jitter + (i / samples) * Math.PI * 2;
      const dx = Math.sin(a);
      const dz = Math.cos(a);
      const angle = Math.acos(Clamp(dx * fx + dz * fz, -1, 1));
      if (angle < minAngle) continue;                       // 还在正面锥里，绕了等于没绕
      const px = ex + dx * radiusM;
      const pz = ez + dz * radiusM;
      if (!this.Walkable(px, pz)) continue;
      if (this.coverRegistry && typeof this.coverRegistry.Nearby === "function") {
        const near = this.coverRegistry.Nearby(px, pz, coverNearbyM);
        if (!near || near.length === 0) continue;           // 绕过去站在空地上＝送人头
      }
      const path = this.EstimatePathM(fromX, fromZ, px, pz, maxPathM);
      if (!(path <= maxPathM)) continue;
      const score = angle * FLANK.angleWeight - path * FLANK.pathWeight;
      if (score > bestScore) { bestScore = score; bestX = px; bestZ = pz; found = true; }
    }
    if (!found) return null;
    this.stats.flankPoints += 1;
    const out = this.flankScratch;
    out.x = bestX;
    out.z = bestZ;
    return out;
  }

  /**
   * 估路。默认走**直线采样 + Walkable**：便宜、零分配、够判「这条路通不通」。
   * 打开 `TACTICS.steerPathProbe` 才逐步问导航场（Script_Navigation 每换一个目标格
   * 就要建一张距离场，十几个候选点全走 Steer 会把场缓存冲垮）。
   * @returns 估计路程（米），不可达时 Infinity
   */
  EstimatePathM(fromX, fromZ, toX, toZ, maxPathM = FLANK.flankMaxPathM) {
    const straight = Math.hypot(toX - fromX, toZ - fromZ);
    if (!Number.isFinite(straight)) return Infinity;
    if (straight > maxPathM) return Infinity;

    if (TACTICS.steerPathProbe && typeof this.host.Steer === "function") {
      let x = fromX;
      let z = fromZ;
      let travelled = 0;
      const out = this.steerOut;
      let stepped = false;
      for (let i = 0; i < FLANK.pathMaxSteps; i += 1) {
        const left = Math.hypot(toX - x, toZ - z);
        if (left <= FLANK.pathStepM) return travelled + left;
        if (!this.host.Steer(x, z, toX, toZ, out)) break;
        stepped = true;
        x += out.x * FLANK.pathStepM;
        z += out.z * FLANK.pathStepM;
        travelled += FLANK.pathStepM;
        if (travelled > maxPathM) return Infinity;
      }
      // 走满步数还没到＝真的绕不过去；Steer 一步都没给出方向＝导航场还没热，
      // 那不能算「不可达」，退回直线采样。
      if (stepped) return Infinity;
    }

    const steps = Math.max(1, Math.ceil(straight / FLANK.pathStepM));
    for (let i = 1; i <= steps; i += 1) {
      const t = i / steps;
      if (!this.Walkable(fromX + (toX - fromX) * t, fromZ + (toZ - fromZ) * t)) return Infinity;
    }
    return straight * FLANK.pathDetourFactor;
  }

  // ------------------------------------------------------------ 跃进配对
  /**
   * 把可机动成员按距离两两配对，返回 [[mover, coverer], ...]。
   * **每次调用翻一次相位**：同一对人两次调用会互换 mover / coverer，
   * 这就是「一动一掩护、到位后互换」。UpdateSquad 只在相位到期（BOUND.phaseS）时调它，
   * 中间那几秒保持上一轮的分工。
   *
   * 返回的是**复用数组**（内含复用的二元组），下次调用即失效。
   */
  BoundPairs(group) {
    const pairs = this.pairs;
    pairs.length = 0;
    if (!group || !Array.isArray(group.members)) return pairs;
    const now = this.Time();
    const squad = this.SquadRecord(group.id, group.side);
    squad.boundPhase = squad.boundPhase === 0 ? 1 : 0;

    const pool = this.pairPool;
    pool.length = 0;
    for (let i = 0; i < group.members.length; i += 1) {
      const soldier = group.members[i];
      if (!soldier || soldier.alive === false) continue;
      if (!CanManeuver(soldier, now)) continue;
      if (IsNoncombatant(soldier)) continue;
      pool.push(soldier);
    }
    const used = this.pairUsed;
    used.length = 0;
    for (let i = 0; i < pool.length; i += 1) used.push(false);

    for (let i = 0; i < pool.length; i += 1) {
      if (used[i]) continue;
      let best = -1;
      let bestD = BOUND.maxPairDistM;
      for (let j = i + 1; j < pool.length; j += 1) {
        if (used[j]) continue;
        const d = Math.hypot(PosX(pool[i]) - PosX(pool[j]), PosZ(pool[i]) - PosZ(pool[j]));
        if (d < bestD) { bestD = d; best = j; }
      }
      if (best < 0) continue;
      used[i] = true;
      used[best] = true;
      let cell = this.pairStore[pairs.length];
      if (!cell) { cell = [null, null]; this.pairStore[pairs.length] = cell; }
      if (squad.boundPhase === 0) { cell[0] = pool[i]; cell[1] = pool[best]; }
      else { cell[0] = pool[best]; cell[1] = pool[i]; }
      pairs.push(cell);
      if (pairs.length >= BOUND.maxPairs) break;
    }
    return pairs;
  }

  // ------------------------------------------------------------ 投弹
  /** 身上还有几枚手榴弹（字段约定见文件头注）。 */
  static GrenadeCount(soldier) {
    if (!soldier) return 0;
    if (soldier.throwables && Number.isFinite(soldier.throwables.Grenade)) return soldier.throwables.Grenade;
    if (Number.isFinite(soldier.grenades)) return soldier.grenades;
    return 0;
  }

  /** 按初速算出的投掷距离上限（乘 rangeSafety：真人不是 45° 满力抛）。 */
  static GrenadeReachM() {
    const grenade = WEAPONS.Grenade;
    const v = grenade && Number.isFinite(grenade.throwSpeedMax) ? grenade.throwSpeedMax : 20;
    return (v * v / GRENADE.gravityMps2) * GRENADE.rangeSafety;
  }

  /** 自身安全距离：杀伤半径 + 余量，与表里的 minM 取大者。 */
  static GrenadeMinM() {
    const grenade = WEAPONS.Grenade;
    const radius = grenade && Number.isFinite(grenade.radiusM) ? grenade.radiusM : 6.5;
    return Math.max(GRENADE.minM, radius + GRENADE.selfSafetyMarginM);
  }

  /**
   * 要不要给这个人派投弹。**纯判据，无副作用** —— 冷却由
   * `UpdateSquad`（派活时）与 `NoteGrenadeThrown`（真扔出去时）写。
   *
   * 七个条件，缺一不可：
   *   ① 身上有手榴弹；② 对方钉在一处（在掩体里 / 静止 ≥ holdS）；
   *   ③ 距离在 [minM, maxM] 内（minM 含自身安全半径，maxM 含初速射程上限）；
   *   ④ 班组冷却；⑤ 个人冷却；⑥ 抛物线粗验（目标不能比我高出 maxRiseM）；
   *   ⑦ 情报够新（不往三秒前的影子上扔）。
   */
  ShouldGrenade(soldier, enemy, now = this.Time()) {
    if (!soldier || !enemy || soldier.alive === false) return false;
    if (soldier.meleeCombat) return false;
    if (TacticsDirector.GrenadeCount(soldier) <= 0) return false;              // ①

    const pinned = (enemy.coverId !== null && enemy.coverId !== undefined)
      || (Number.isFinite(enemy.stationaryS) && enemy.stationaryS >= GRENADE.holdS);
    if (!pinned) return false;                                                 // ②

    const ex = EnemyX(enemy);
    const ez = EnemyZ(enemy);
    if (!Number.isFinite(ex) || !Number.isFinite(ez)) return false;
    const dist = Math.hypot(ex - PosX(soldier), ez - PosZ(soldier));
    const minM = TacticsDirector.GrenadeMinM();
    const maxM = Math.min(GRENADE.maxM, TacticsDirector.GrenadeReachM());
    if (!(dist >= minM && dist <= maxM)) return false;                         // ③

    const squad = this.SquadRecord(soldier.squadId, soldier.side);
    if (now - squad.lastGrenadeAt < GRENADE.squadCooldownS) return false;      // ④
    if (squad.grenadeHolderId !== soldier.id
      && now - squad.lastGrenadeAssignAt < GRENADE.squadCooldownS) return false;
    const personal = Number.isFinite(soldier.lastGrenadeAt) ? soldier.lastGrenadeAt : -1e9;
    if (now - personal < GRENADE.personalCooldownS) return false;              // ⑤

    const rise = EnemyY(enemy) - PosY(soldier);
    if (rise > GRENADE.maxRiseM) return false;                                 // ⑥

    const lkpTime = enemy.lkp && Number.isFinite(enemy.lkp.time) ? enemy.lkp.time : now;
    if (now - lkpTime > GRENADE.lkpMaxAgeS) return false;                      // ⑦
    return true;
  }

  /**
   * 真扔出去那一刻由 Script_Ai 调（投掷通道是 actor.BeginGrenadeThrow → combat.Throw）。
   * 它写班组与个人冷却，并**默认替你扣一枚**；集成层自己扣携行时传 consume=false，
   * 否则一次投掷会掉两枚。
   */
  NoteGrenadeThrown(soldier, now = this.Time(), consume = true) {
    if (!soldier) return;
    soldier.lastGrenadeAt = now;
    const squad = this.SquadRecord(soldier.squadId, soldier.side);
    squad.lastGrenadeAt = now;
    squad.grenadeHolderId = soldier.id;
    if (!consume) return;
    if (soldier.throwables && Number.isFinite(soldier.throwables.Grenade)) {
      soldier.throwables.Grenade = Math.max(0, soldier.throwables.Grenade - 1);
    } else if (Number.isFinite(soldier.grenades)) {
      soldier.grenades = Math.max(0, soldier.grenades - 1);
    }
  }

  // ------------------------------------------------------------ 撤退 / 查看
  /**
   * 散伙判定。守区与剧本旗的人**永不撤**（守点纪律，方案 §4.4 / §6）。
   *
   * ① 本班存活比低于 retreatSurvivorRatio（六个人剩两个）；或者
   * ② 「二十米内没有友军」已经持续 lonelyS 秒，**并且**班组密度低 / 压制高。
   * 第二条写成合取是有意的：人堆里被压得抬不起头该往掩体里缩（那是 SUPPRESSED），
   * 不是转身就跑。
   */
  ShouldRetreat(soldier, group = null) {
    if (!soldier || soldier.alive === false) return false;
    if (!CanManeuver(soldier)) return false;

    const squadId = group && group.id !== undefined ? group.id : soldier.squadId;
    const squad = this.SquadRecord(squadId, (group && group.side) || soldier.side);
    let alive = squad.aliveCount;
    if (group && Array.isArray(group.members)) {
      alive = 0;
      for (let i = 0; i < group.members.length; i += 1) {
        const m = group.members[i];
        if (m && m.alive !== false) alive += 1;
      }
    }
    let peak = squad.peakCount;
    if (group && Number.isFinite(group.peakCount)) peak = Math.max(peak, group.peakCount);
    if (alive > peak) peak = alive;
    if (peak >= RETREAT.minSquadForRatio && alive / peak < RETREAT.retreatSurvivorRatio) return true;

    const lonely = Number.isFinite(soldier.lonelyTime) ? soldier.lonelyTime : 0;
    if (lonely < RETREAT.lonelyS) return false;
    const cohesion = Number.isFinite(soldier.cohesion) ? soldier.cohesion : 1;
    const suppression = Number.isFinite(soldier.suppression) ? soldier.suppression : 0;
    return cohesion < RETREAT.retreatCohesion || suppression > RETREAT.retreatSuppression;
  }

  /**
   * 要不要去查看最后目击位置。
   * track 认 `{ lkp:{x,z,time,confidence}, alert?, awareness? }`；
   * alert 没给时退回 awareness（Perception 的 0..1 觉察度）。
   */
  ShouldInvestigate(soldier, track, now = this.Time()) {
    if (!soldier || !track || soldier.alive === false) return false;
    if (!CanManeuver(soldier, now)) return false;          // 守区的人不许去查看
    const lkp = track.lkp;
    if (!lkp || !Number.isFinite(lkp.x) || !Number.isFinite(lkp.z)) return false;

    const rank = AlertRank(track.alert !== undefined ? track.alert : soldier.alert);
    const awareness = Number.isFinite(track.awareness) ? track.awareness : 0;
    if (rank < ALERT_RANK.suspicious && awareness < INVESTIGATE.minAwareness) return false;

    const confidence = Number.isFinite(lkp.confidence) ? lkp.confidence : 0;
    if (confidence < INVESTIGATE.investigateConfidence) return false;

    const lkpTime = Number.isFinite(lkp.time) ? lkp.time : now;
    if (now - lkpTime > INVESTIGATE.maxAgeS) return false;

    const d = Math.hypot(lkp.x - PosX(soldier), lkp.z - PosZ(soldier));
    if (!Number.isFinite(d)) return false;
    if (d > INVESTIGATE.investigateMaxM) return false;
    if (d < INVESTIGATE.minM) return false;                // 已经站在最后目击点上了
    return true;
  }

  // ------------------------------------------------------------ 取证
  /** Debug.Ai / 覆盖层用的快照。**只在调试路径上调**（这里允许分配）。 */
  State(squadId = null) {
    const tokens = [];
    for (let i = 0; i < this.holders.length; i += 1) {
      tokens.push({
        soldierId: this.holders[i].soldierId,
        targetId: this.holders[i].targetId,
        until: this.holders[i].until,
      });
    }
    const squads = [];
    this.squads.forEach((squad) => {
      if (squadId !== null && squad.id !== squadId) return;
      squads.push({
        id: squad.id,
        side: squad.side,
        alive: squad.aliveCount,
        peak: squad.peakCount,
        flankers: squad.flankCount,
        enemies: squad.blackboard.order.length,
        focusId: squad.blackboard.focusId,
        lastGrenadeAt: squad.lastGrenadeAt,
      });
    });
    return { time: this.Time(), tokens, squads, stats: this.stats };
  }
}
