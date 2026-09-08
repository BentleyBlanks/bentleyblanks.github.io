// Script_AiPerception.mjs — 一个兵「知道什么」。
//
// 视锥 + 觉察累积 + 听觉刺激 + 最后目击位置（LKP）+ 目标锁迟滞。
// 方案与验收口径：docs/Data_EnemyAi.md §4.1（模块契约）、§7（性能预算）、§9（验收）。
// 数全在 `Data_Tuning_AiPerception.mjs`，这里不留一个裸数字。
//
// ── 为什么单独拆一个模块 ───────────────────────────────────────────────────
// 旧 `Script_Ai.Think`（1060–1160）的感知是**360° 全向 + 一条射线**：谁在发现距离内
// 且通视，谁就是目标。于是敌人既全知（背后摸不过去）又失明（看不见就发呆，
// 玩家从背后开一枪，被打的人只会涨压制值）。这两件事看起来相反，其实是同一个缺口：
// **没有「知道」这个中间状态**。这一层补的就是这个状态机：
//
//   unaware ──看见/听见──▶ suspicious ──▶ alert ──看清了──▶ engaged
//        ◀──────────────── 衰减 + 迟滞 ────────────────
//
// ── 硬约束（docs/Data_EnemyAi.md §3）─────────────────────────────────────────
//   1. **不 import three、不 import Script_Ai**。只吃普通对象 `{x,y,z}` 与构造时注入的
//      `host` 回调，所以能在纯 Node 里毫秒级跑完（`Script_AiPerceptionTest.mjs`）。
//      `Script_Ai` 仍是唯一持有 `THREE.Vector3` 的适配层。
//   2. **不自己射线**。通视由调用方在 candidate 上给 `visible`（沿用 `HasLineOfSight`
//      的三格缓存）。射线预算在 §7 里分给了掩体验证与暴露采样，这一层一条都不占。
//   3. **不再乘一次发现距离倍率**。姿态与照明弹都已经在 `host.SightRange(stance)` 里
//      （`Script_Flare.mjs` 头注：倍率统一由 `AiDirector.SetSightScale` 加）。
//   4. **热路径零分配**：记忆挂在 `soldier.perception` 上，Track 对象走复用池，
//      `Sense` 返回同一个结果对象，内部不 new 数组、不迭代 Map（`for...of map` 每条
//      都产生一个 `[k,v]` 数组 —— 所以记忆同时维护 Map（O(1) 读）与数组（热路径迭代）。
//   5. **确定性**：只用 `host.Rnd()`，不用 Math.random。
//
// ── 朝向契约 ────────────────────────────────────────────────────────────────
// yaw = 0 正面朝 −Z；前向量 = (−sin yaw, 0, −cos yaw)；世界 X 东 / Z 南 / Y 上，单位米。
// 姿态 0 站 / 1 蹲 / 2 卧。视锥与距离一律按**平面**（XZ）算：楼上楼下的遮挡是
// `candidate.visible` 那条射线的事，不该由夹角判定重复裁一次。
//
// ── 与契约的三处偏离（都写在最终报告里）────────────────────────────────────
//   a. `Sense` 的返回值是契约的**超集**：多了 `dist` / `trackId` / `track` / `changed`。
//      `track` 是给「锁着的目标这一帧没出现在候选里」那种情况用的（Script_Ai 需要
//      `track.ref` 才能重建 `s.target`）；`changed` 给 Bark("spot") 与 ShootingModel.BeginAim。
//   b. `candidate.visible` **不是 true 就当作被挡住**。契约说通视由调用方给；
//      让「没给」等于「看得见」会在集成漏字段时静默恢复成旧的全知行为，
//      宁可让它明显地瞎掉（测试里也照这条写）。
//   c. `Alert(soldier)` 按契约不带 targetId，返回的是**士兵级**警戒（所有 Track 里
//      最高的那份觉察决定），单个目标的觉察度读 `Track(soldier, id).awareness`。

import { PERCEPTION } from "./Data_Tuning_AiPerception.mjs";

/** 警戒级别。字符串值是跨模块契约（Tactics 的 ShouldInvestigate、覆盖层文字都读它）。 */
export const ALERT = Object.freeze({
  UNAWARE: "unaware", SUSPICIOUS: "suspicious", ALERT: "alert", ENGAGED: "engaged",
});

/** 由低到高，下标即等级 —— 内部用下标比大小，比字符串比较便宜也不会写错顺序。 */
export const ALERT_ORDER = Object.freeze([
  ALERT.UNAWARE, ALERT.SUSPICIOUS, ALERT.ALERT, ALERT.ENGAGED,
]);

/**
 * 玩家在记忆里的 id。沿用 `Script_Ai._PushNear(d, player, true, -1, …)` 的约定：
 * 玩家没有 `soldier.id`，全场用 −1 代表他。别在别处另编一个。
 */
export const PLAYER_TRACK_ID = -1;

/** 记忆结构版本。Attach 靠它判幂等，也让热重载时旧结构自动重建。 */
const MEMORY_VERSION = 1;

const DEG = Math.PI / 180;
const Clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const ClampIndex = (v, hi) => (v < 0 ? 0 : v > hi ? hi : v);

/**
 * 一条 Track 的形状。契约要求的四个字段是 `lkp / lastSeenAt / awareness / seenCount`，
 * 其余是实现需要的（`confidence0` + `lkpTime` 让置信度可以按**真实经过时间**重算，
 * 不依赖调用频率；`ref` 让 Script_Ai 能从记忆重建 `s.target`）。
 */
function MakeTrack() {
  return {
    id: null, isPlayer: false, ref: null,
    lkp: { x: 0, y: 0, z: 0 },
    lkpTime: -1e9,        // LKP 写入时刻
    confidence0: 0,       // 写入当时的置信度（视觉 1.0 / 听觉按响度折算）
    confidence: 0,        // 现在的置信度 = confidence0 − 衰减 × 年龄
    awareness: 0,         // 0..1，这个目标的觉察累积
    lastSeenAt: -1e9,
    lastHeardAt: -1e9,
    seenCount: 0,
    stance: 0,
    visible: false,
    source: "none",       // "sight" | "sound" | "none"
    sensedThisTick: false,
  };
}

function ResetTrack(t, id, isPlayer, ref) {
  t.id = id; t.isPlayer = isPlayer; t.ref = ref || null;
  t.lkp.x = 0; t.lkp.y = 0; t.lkp.z = 0;
  t.lkpTime = -1e9; t.confidence0 = 0; t.confidence = 0; t.awareness = 0;
  t.lastSeenAt = -1e9; t.lastHeardAt = -1e9; t.seenCount = 0;
  t.stance = 0; t.visible = false; t.source = "none"; t.sensedThisTick = false;
  return t;
}

export class PerceptionModel {
  /**
   * @param {object} host 宿主回调（docs/Data_EnemyAi.md §3 的同一份形状）。
   *   这一层只用到 `Time` / `Rnd` / `SightRange`；`StanceEye` 收在手边给将来的
   *   LKP 可见性验证（契约里唯一允许射线的一处）用，现在不调。
   */
  constructor(host = {}) {
    this.host = host;
    // 取证口（Debug.Ai / 测试用）。计数器都是原地自增，不产生分配。
    this.stats = { attaches: 0, senses: 0, hearCalls: 0, hearWrites: 0, trackEvictions: 0 };
  }

  // ------------------------------------------------------------------ 宿主
  _Now() { return typeof this.host.Time === "function" ? this.host.Time() : 0; }

  _Rnd() {
    return typeof this.host.Rnd === "function" ? this.host.Rnd() : PERCEPTION.fallback.rnd;
  }

  /** 目标那个姿态**现在**的被发现距离。倍率已经在宿主那一侧，这里不再乘。 */
  _SightRange(stance) {
    if (typeof this.host.SightRange === "function") {
      const v = this.host.SightRange(stance);
      if (Number.isFinite(v) && v > 0) return v;
    }
    return PERCEPTION.fallback.sightRangeM;
  }

  // ------------------------------------------------------------------ 记忆
  /** 在 soldier.perception 上挂内部记忆。幂等：同一个兵调一百次也只建一次。 */
  Attach(soldier) {
    const existing = soldier.perception;
    if (existing && existing.version === MEMORY_VERSION) return existing;
    const mem = {
      version: MEMORY_VERSION,
      // 契约里的 Map<targetId, Track>：给 Track() 与 Tactics 的黑板做 O(1) 读。
      tracks: new Map(),
      // 同一批 Track 对象的数组视图。热路径（Sense 每次 Think）只走它 ——
      // `for (const [k, v] of map)` 每条都要分配一个 [k,v] 数组，同屏上百人扛不住。
      list: [],
      pool: [],
      alert: ALERT.UNAWARE,
      alertIndex: 0,
      alertSince: -1e9,
      bestAwareness: 0,
      lockId: null,
      lockUntil: -1e9,
      lostTime: 0,
      lastSenseAt: -1e9,
      // 复用的返回对象与 LKP 出参：调用方**不许长期持有**，下一次 Sense 会就地改写。
      result: {
        target: null, visible: false, awareness: 0, alert: ALERT.UNAWARE,
        lkp: null, exposure: 0, dist: Infinity, trackId: null, track: null, changed: false,
      },
      lkpOut: { x: 0, y: 0, z: 0, time: -1e9, confidence: 0 },
    };
    soldier.perception = mem;
    this.stats.attaches += 1;
    return mem;
  }

  Detach(soldier) {
    if (soldier) soldier.perception = null;
  }

  /** 契约读口：`{ lkp, lastSeenAt, awareness, seenCount, … }`。targetId 省略时取当前锁。 */
  Track(soldier, targetId) {
    const mem = soldier && soldier.perception;
    if (!mem || mem.version !== MEMORY_VERSION) return null;
    const id = targetId === undefined ? mem.lockId : targetId;
    if (id === null || id === undefined) return null;
    return mem.tracks.get(id) || null;
  }

  /** 士兵级警戒（所有 Track 里最高的那份觉察决定，带迟滞与最小停留）。 */
  Alert(soldier) {
    const mem = soldier && soldier.perception;
    return mem && mem.version === MEMORY_VERSION ? mem.alert : ALERT.UNAWARE;
  }

  Forget(soldier, targetId) {
    const mem = soldier && soldier.perception;
    if (!mem || mem.version !== MEMORY_VERSION) return false;
    for (let i = 0; i < mem.list.length; i += 1) {
      if (mem.list[i].id === targetId) { this._DropTrack(mem, i); return true; }
    }
    return false;
  }

  /** 整个人失忆（死亡 / 重生 / 换关时用）。契约外的便利口。 */
  ForgetAll(soldier) {
    const mem = soldier && soldier.perception;
    if (!mem || mem.version !== MEMORY_VERSION) return;
    for (let i = mem.list.length - 1; i >= 0; i -= 1) this._DropTrack(mem, i);
    mem.alert = ALERT.UNAWARE; mem.alertIndex = 0; mem.alertSince = -1e9;
    mem.bestAwareness = 0; mem.lockId = null; mem.lockUntil = -1e9; mem.lostTime = 0;
  }

  _TrackFor(mem, id, isPlayer, ref, now) {
    const found = mem.tracks.get(id);
    if (found) {
      if (ref) found.ref = ref;
      found.isPlayer = isPlayer;
      return found;
    }
    if (mem.list.length >= PERCEPTION.memory.maxTracks) this._EvictWorst(mem, now);
    const t = ResetTrack(mem.pool.pop() || MakeTrack(), id, isPlayer, ref);
    mem.tracks.set(id, t);
    mem.list.push(t);
    return t;
  }

  /** 记忆满了淘汰置信度最低的一条；**当前锁定的目标永不被淘汰**。 */
  _EvictWorst(mem, now) {
    let worst = -1, worstScore = Infinity;
    for (let i = 0; i < mem.list.length; i += 1) {
      const t = mem.list[i];
      if (t.id === mem.lockId) continue;
      // 置信度打平时用觉察度当第二把尺：正在被盯上的人比听来的一声更该留下。
      const score = this._ConfidenceAt(t, now) * 2 + t.awareness;
      if (score < worstScore) { worstScore = score; worst = i; }
    }
    if (worst >= 0) { this._DropTrack(mem, worst); this.stats.trackEvictions += 1; }
  }

  _DropTrack(mem, index) {
    const t = mem.list[index];
    const last = mem.list.length - 1;
    if (index !== last) mem.list[index] = mem.list[last];
    mem.list.pop();
    mem.tracks.delete(t.id);
    if (mem.lockId === t.id) { mem.lockId = null; mem.lostTime = 0; }
    if (mem.pool.length < PERCEPTION.memory.maxTracks) { t.ref = null; mem.pool.push(t); }
  }

  /** 置信度按**真实经过时间**线性衰减，不按调用次数 —— Think 分帧不该影响记忆快慢。 */
  _ConfidenceAt(track, now) {
    if (track.confidence0 <= 0) return 0;
    const age = now - track.lkpTime;
    if (age <= 0) return track.confidence0;
    const v = track.confidence0 - PERCEPTION.memory.confidenceDecayPerS * age;
    return v > 0 ? v : 0;
  }

  // ------------------------------------------------------------------ 视觉
  /** 当前警戒级别 + 自己的姿态决定视锥半角（弧度）。 */
  _HalfAngleRad(alertIndex, stance) {
    const f = PERCEPTION.fov;
    const deg = alertIndex >= 3 ? f.halfAngleDeg.engaged
      : alertIndex === 2 ? f.halfAngleDeg.alert
        : alertIndex === 1 ? f.halfAngleDeg.suspicious : f.halfAngleDeg.unaware;
    return deg * DEG * f.stanceScale[ClampIndex(stance | 0, f.stanceScale.length - 1)];
  }

  /**
   * 觉察累积速率。r = 距离 / SightRange(目标姿态)：姿态与照明弹都从这里进来，
   * 所以「趴着更难被发现」「照明弹底下大家一起暴露」两条机制自动成立。
   */
  _RiseRate(dist, sight, moving) {
    const a = PERCEPTION.awareness;
    const r = Clamp01(sight > 0 ? dist / sight : 1);
    const gain = a.nearGain - (a.nearGain - a.edgeGain) * Math.pow(r, a.curveExp);
    return a.riseBasePerS * gain * (moving ? a.movingMul : a.stillMul);
  }

  /** 看不见的这一拍：觉察衰减（带宽限），置信度重算。 */
  _Fade(track, now, dt) {
    const a = PERCEPTION.awareness;
    const lastContact = track.lastSeenAt > track.lastHeardAt ? track.lastSeenAt : track.lastHeardAt;
    if (now - lastContact >= a.decayDelayS) {
      const v = track.awareness - a.decayPerS * dt;
      track.awareness = v > 0 ? v : 0;
    }
    track.confidence = this._ConfidenceAt(track, now);
  }

  /**
   * 警戒级别的迟滞。三条规矩：
   *   · 升级看 `thresholds`，降级看更低的 `release` —— 阈值线上不来回；
   *   · 两次变化至少隔 `minDwellS`；
   *   · 允许**跨级跳**（贴脸枪焰 unaware → engaged 一步到位），所以迟滞不拖慢反应。
   */
  _UpdateAlert(mem, best, now) {
    const a = PERCEPTION.awareness;
    let desired = 0;
    if (best >= a.thresholds.engaged) desired = 3;
    else if (best >= a.thresholds.alert) desired = 2;
    else if (best >= a.thresholds.suspicious) desired = 1;
    if (desired < mem.alertIndex) {
      const rel = mem.alertIndex >= 3 ? a.release.engaged
        : mem.alertIndex === 2 ? a.release.alert : a.release.suspicious;
      if (best >= rel) desired = mem.alertIndex;
    }
    if (desired === mem.alertIndex) return;
    if (now - mem.alertSince < a.minDwellS) return;
    mem.alertIndex = desired;
    mem.alert = ALERT_ORDER[desired];
    mem.alertSince = now;
  }

  // ------------------------------------------------------------------ 听觉
  /**
   * 一条刺激打给一批听者。
   * @param {object} stimulus `{ kind, x, y, z, side, loudnessM, sourceId, isPlayer, time, ref }`
   *   `side` 是**声源那一方**：同阵营的枪声不写敌情。`loudnessM` 缺省时按 kind 查表。
   * @param {Iterable} listeners 可迭代的 soldier。
   * @returns {number} 真正写进了几个人的记忆
   */
  Hear(stimulus, listeners) {
    if (!stimulus || !listeners) return 0;
    this.stats.hearCalls += 1;
    const h = PERCEPTION.hearing;
    const now = Number.isFinite(stimulus.time) ? stimulus.time : this._Now();
    const raw = Number.isFinite(stimulus.loudnessM)
      ? stimulus.loudnessM
      : (h.loudnessM[stimulus.kind] !== undefined ? h.loudnessM[stimulus.kind] : h.loudnessM.gunshot);
    const loud = raw > h.minLoudnessM ? raw : h.minLoudnessM;
    const sourceId = stimulus.isPlayer
      ? PLAYER_TRACK_ID
      : (stimulus.sourceId === undefined || stimulus.sourceId === null ? null : stimulus.sourceId);
    if (sourceId === null) return 0;
    let written = 0;
    // 数组走下标循环（for...of 的迭代器每次都要分配）；别的可迭代物退回 for...of。
    if (Array.isArray(listeners)) {
      for (let i = 0; i < listeners.length; i += 1) {
        written += this._HearOne(listeners[i], stimulus, sourceId, loud, now);
      }
    } else {
      for (const listener of listeners) {
        written += this._HearOne(listener, stimulus, sourceId, loud, now);
      }
    }
    this.stats.hearWrites += written;
    return written;
  }

  _HearOne(soldier, stimulus, sourceId, loud, now) {
    if (!soldier || soldier.alive === false || !soldier.position) return 0;
    // 只对**不同阵营**的人写：自己人开枪不是敌情。声源没写 side 时按「谁都听得见」处理。
    if (stimulus.side && soldier.side === stimulus.side) return 0;
    if (!stimulus.isPlayer && soldier.id === sourceId) return 0;
    // 便宜的距离预筛：先比平方，过了才开方。O(N) 的听者里绝大多数在这一行被弹掉。
    const dx = soldier.position.x - stimulus.x;
    const dz = soldier.position.z - stimulus.z;
    const d2 = dx * dx + dz * dz;
    if (d2 >= loud * loud) return 0;

    const h = PERCEPTION.hearing;
    const dist = Math.sqrt(d2);
    const ratio = dist / loud;
    const conf = h.confidenceEdge
      + (h.confidenceNear - h.confidenceEdge) * Math.pow(1 - ratio, h.curveExp);

    const mem = this.Attach(soldier);
    const track = this._TrackFor(mem, sourceId, !!stimulus.isPlayer, stimulus.ref || null, now);
    // 已有更可靠的情报（多半是刚刚亲眼看见的）就不让一声枪响把它冲淡。
    if (this._ConfidenceAt(track, now) < conf) {
      // 听觉定位有误差，随距离比放大：这就是「他们朝我刚才那边打，但没打准地方」。
      const e = h.localizationErrorM;
      const err = e.near + (e.edge - e.near) * ratio;
      const angle = this._Rnd() * Math.PI * 2;
      const radius = err * Math.sqrt(this._Rnd());   // sqrt 让落点在圆内均匀，不堆在圆心
      track.lkp.x = stimulus.x + Math.cos(angle) * radius;
      track.lkp.y = Number.isFinite(stimulus.y) ? stimulus.y : 0;
      track.lkp.z = stimulus.z + Math.sin(angle) * radius;
      track.lkpTime = now;
      track.confidence0 = conf;
      track.confidence = conf;
      track.source = "sound";
    }
    // 觉察度只升不降，且封顶在 awarenessCap：**光靠听永远进不了 ENGAGED**。
    const cap = conf < h.awarenessCap ? conf : h.awarenessCap;
    if (cap > track.awareness) track.awareness = cap;
    track.lastHeardAt = now;
    const best = track.awareness > mem.bestAwareness ? track.awareness : mem.bestAwareness;
    mem.bestAwareness = best;
    this._UpdateAlert(mem, best, now);
    return 1;
  }

  // ------------------------------------------------------------------ 主循环
  /**
   * 每次 Think 调一次。
   *
   * @param {object} soldier 需要 `id / side / position{x,y,z} / yaw / stance`
   * @param {Array} candidates `Script_Ai` 已按距离筛过的槽，每个带
   *   `{ ref, isPlayer, id, position, stance, moving, firingRecently, visible }`。
   *   **`visible` 必须由调用方给**（沿用 `HasLineOfSight` 的三格缓存）；不是 `true`
   *   一律当作被挡住 —— 见头注偏离 b。
   * @param {number} dtThink 距上一次 Think 的秒数
   * @returns {object} 复用的结果对象（下一次 Sense 会就地改写，别长期持有）：
   *   `{ target, visible, awareness, alert, lkp, exposure, dist, trackId, track, changed }`
   */
  Sense(soldier, candidates, dtThink) {
    const mem = this.Attach(soldier);
    const now = this._Now();
    let dt = dtThink;
    if (!(dt > 0)) { dt = now - mem.lastSenseAt; if (!(dt > 0) || dt > 1e6) dt = 0; }
    mem.lastSenseAt = now;
    this.stats.senses += 1;

    const pos = soldier.position;
    const sx = pos.x, sz = pos.z;
    const yaw = Number.isFinite(soldier.yaw) ? soldier.yaw : 0;
    // 朝向契约：yaw = 0 面朝 −Z，前向量 = (−sin yaw, 0, −cos yaw)。
    const forwardX = -Math.sin(yaw), forwardZ = -Math.cos(yaw);
    const halfAngle = this._HalfAngleRad(mem.alertIndex, soldier.stance | 0);
    const cosHalf = Math.cos(halfAngle < Math.PI ? halfAngle : Math.PI);
    const flashHalf = halfAngle + PERCEPTION.fov.muzzleFlashBonusDeg * DEG;
    const cosFlash = Math.cos(flashHalf < Math.PI ? flashHalf : Math.PI);
    const engagedOmni = PERCEPTION.fov.engagedTargetOmni && mem.alertIndex >= 3;

    for (let i = 0; i < mem.list.length; i += 1) mem.list[i].sensedThisTick = false;

    // ── 1. 这一拍看见了谁 ──────────────────────────────────────────────
    let nearest = null, nearestDist = Infinity, nearestId = null;
    let lockCand = null, lockDist = Infinity, lockSeen = false;
    const count = candidates ? candidates.length : 0;
    for (let i = 0; i < count; i += 1) {
      const c = candidates[i];
      if (!c || !c.position) continue;
      if (c.ref && c.ref.alive === false) continue;
      const id = c.isPlayer ? PLAYER_TRACK_ID : c.id;
      if (id === undefined || id === null) continue;
      const dx = c.position.x - sx, dz = c.position.z - sz;
      const dist = Math.sqrt(dx * dx + dz * dz);
      const stance = c.stance | 0;
      const isLock = mem.lockId !== null && id === mem.lockId;

      // 通视 → 视锥 → 距离，三道闸按从便宜到贵排（射线结果是现成的，最便宜）。
      let seen = c.visible === true;
      if (seen && dist > PERCEPTION.fov.omniRadiusM && !(engagedOmni && isLock)) {
        const cosA = (forwardX * dx + forwardZ * dz) / (dist > 1e-6 ? dist : 1);
        seen = cosA >= (c.firingRecently ? cosFlash : cosHalf);
      }
      // 目标那个姿态现在的发现距离。**一拍只问宿主一次** —— 视锥闸与累积速率共用它，
      // 问两次不但白花钱，还给「照明弹倍率在半拍中间变了」留了一条不一致的缝。
      const sight = seen ? this._SightRange(stance) : 0;
      if (seen) {
        // 已经锁上的人给一点距离余量（沿用 Script_Ai 的 * 1.12）：退后一米不该凭空消失。
        seen = dist < sight * (isLock ? PERCEPTION.lock.visibleRangeSlack : 1);
      }

      // 既没看见、也没有旧记忆的候选**不建条目**：视锥外的路人每一拍都建一条再删一条，
      // 光 Map 的增删就够把「热路径零分配」这条毁掉。
      let track = mem.tracks.get(id);
      if (!track) {
        if (!seen) { if (isLock) { lockCand = c; lockDist = dist; lockSeen = false; } continue; }
        track = this._TrackFor(mem, id, !!c.isPlayer, c.ref || null, now);
      } else if (c.ref) {
        track.ref = c.ref;
      }
      track.sensedThisTick = true;
      track.stance = stance;

      if (seen) {
        if (c.firingRecently) {
          track.awareness = PERCEPTION.awareness.firingFillsTo;   // 枪口焰 = 瞬间拉满
        } else {
          const rate = this._RiseRate(dist, sight, !!c.moving);
          track.awareness = Clamp01(track.awareness + rate * dt);
        }
        track.lastSeenAt = now;
        track.seenCount += 1;
        track.visible = true;
        track.source = "sight";
        track.confidence0 = PERCEPTION.memory.seenConfidence;
        track.confidence = PERCEPTION.memory.seenConfidence;
        track.lkp.x = c.position.x;
        track.lkp.y = Number.isFinite(c.position.y) ? c.position.y : 0;
        track.lkp.z = c.position.z;
        track.lkpTime = now;
        if (dist < nearestDist) { nearestDist = dist; nearest = c; nearestId = id; }
      } else {
        track.visible = false;
        this._Fade(track, now, dt);
      }
      if (isLock) { lockCand = c; lockDist = dist; lockSeen = seen; }
    }

    // ── 2. 这一拍没出现在候选里的记忆：衰减 / 过期 ─────────────────────
    for (let i = mem.list.length - 1; i >= 0; i -= 1) {
      const t = mem.list[i];
      if (!t.sensedThisTick) { t.visible = false; this._Fade(t, now, dt); }
      const age = now - t.lkpTime;
      if (age > PERCEPTION.memory.memoryS
        || (t.confidence < PERCEPTION.memory.minConfidence && t.awareness <= 0)) {
        this._DropTrack(mem, i);
      }
    }

    // ── 3. 目标锁迟滞（原样搬自 Script_Ai.Think，分支顺序一条都没换）────
    const lock = PERCEPTION.lock;
    let target = null, visible = false, dist = Infinity, changed = false;
    const sameAcquired = nearest !== null && mem.lockId !== null && nearestId === mem.lockId;
    // 锁定期过了、而且新目标近到当前目标的一半，才允许主动换人。
    const muchBetter = nearest !== null && mem.lockId !== null && !sameAcquired
      && now >= mem.lockUntil && nearestDist < lockDist * lock.switchDistanceRatio;

    if (lockSeen && !muchBetter) {
      target = lockCand; dist = lockDist; visible = true; mem.lostTime = 0;
    } else if (mem.lockId !== null && !lockSeen && mem.lostTime < lock.keepBlindS) {
      // 墙角、烟尘、队友身体会让通视短暂闪断：至少等 keepBlindS 再把枪口甩给别人。
      mem.lostTime += dt;
      target = lockCand; dist = lockDist;
    } else if (nearest !== null) {
      changed = mem.lockId !== nearestId;
      if (changed) mem.lockUntil = now + lock.lockS + this._Rnd() * lock.lockJitterS;
      mem.lockId = nearestId;
      mem.lostTime = 0;
      target = nearest; dist = nearestDist; visible = true;
    } else if (mem.lockId !== null) {
      mem.lostTime += dt;
      if (mem.lostTime > lock.forgetS) { mem.lockId = null; mem.lostTime = 0; }
      else { target = lockCand; dist = lockDist; }
    }

    const lockTrack = mem.lockId !== null ? (mem.tracks.get(mem.lockId) || null) : null;
    if (target === null && lockTrack) {
      // 锁着的人这一拍没出现在候选里（跑出筛选半径 / 被别的更近的人挤掉槽位）。
      // 目标给 null，但把 Track 交出去 —— Script_Ai 能从 track.ref 重建 s.target。
      dist = Math.hypot(lockTrack.lkp.x - sx, lockTrack.lkp.z - sz);
    }

    // ── 4. 士兵级警戒 ────────────────────────────────────────────────
    let best = 0, bestTrack = null;
    for (let i = 0; i < mem.list.length; i += 1) {
      const t = mem.list[i];
      if (t.awareness > best) { best = t.awareness; bestTrack = t; }
    }
    mem.bestAwareness = best;
    this._UpdateAlert(mem, best, now);

    // ── 5. LKP：先看当前目标的，没有就取置信度最高的那条记忆 ───────────
    let lkpTrack = lockTrack && lockTrack.confidence >= PERCEPTION.memory.minConfidence
      ? lockTrack : null;
    if (!lkpTrack) {
      let bestConf = PERCEPTION.memory.minConfidence;
      for (let i = 0; i < mem.list.length; i += 1) {
        const t = mem.list[i];
        if (t.confidence > bestConf) { bestConf = t.confidence; lkpTrack = t; }
      }
    }

    const out = mem.result;
    out.target = target;
    out.visible = visible;
    out.dist = dist;
    out.changed = changed;
    out.trackId = mem.lockId;
    out.track = lockTrack;
    out.alert = mem.alert;
    out.awareness = lockTrack ? lockTrack.awareness : (bestTrack ? bestTrack.awareness : 0);
    out.exposure = visible && target
      ? PERCEPTION.exposure.byStance[ClampIndex(target.stance | 0, PERCEPTION.exposure.byStance.length - 1)]
      : 0;
    if (lkpTrack) {
      const o = mem.lkpOut;
      o.x = lkpTrack.lkp.x; o.y = lkpTrack.lkp.y; o.z = lkpTrack.lkp.z;
      o.time = lkpTrack.lkpTime; o.confidence = lkpTrack.confidence;
      out.lkp = o;
    } else {
      out.lkp = null;
    }
    return out;
  }
}

export default PerceptionModel;
