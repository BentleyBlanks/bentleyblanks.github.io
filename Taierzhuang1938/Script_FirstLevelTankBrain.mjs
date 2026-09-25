// ===========================================================================
// Script_FirstLevelTankBrain.mjs —— 第一关 03–05 八九式中战车的纯规则大脑
//
// 口径：docs/Data_FirstLevel0105Refactor20260923Contract.md §2 第 7 条、§5.7。
// 数值：Data_Tuning_Tank.mjs。纯规则、零 three、可在 node 里直接跑
// （测试 Script_FirstLevelTankBrainTest.mjs）。
//
// 四个子脑：
//   驾驶 —— 语义路点（cruise/hullDown/firePoint/squeeze/block），有加减速；车头与路线
//           切线差太多就先停车原地转，行进中转向率随车速；停车时车体按 faceTo 摆正、
//           炮塔单独追踪；躲弹后倒 ≤3 m、不越过本阶段进入时的位置。
//   炮手 —— 10 Hz 感知、每 tick ≤6 条视线；目标打分 × 可见度 × 距离 + 惯性；
//           预兆链：手摇炮塔（0.22–0.30 rad/s）→ 1.2–1.8 s 瞄准停顿 → 开炮；只在语义
//           停车点上开主炮；对移动目标有提前量；同一目标连发散布收敛；新暴露的玩家
//           第一发打他的掩体沿；看不见就按 lastKnown 的掩体打。
//   机枪 —— 首次接触「走进来」（第一串零伤害），压 lastKnown；车体机枪 ±26° 射界；
//           贴身死角转炮塔用塔后机枪（≥6 s 转过来）、开舱盖喊护兵。
//   反应 —— 近炸后倒 + 炮塔甩向投掷者 + 机枪压 2 s + 护兵散开；枪弹打车体关观察窗、
//           每 15 s 最多被牵一次注意；10–14 s 一次的关注扫描。
// 另有护兵槽（只管走位；开火交普通 AI）与两段毁伤（Intact → MobilityKill → Disabled）。
//
// 世界坐标 X 东、Z 南、Y 上；车头是局部 −Z，yaw 按 three 的 rotation.y：
// 朝向 yaw 的前方 = (−sin yaw, −cos yaw)，右方（局部 +X）= (cos yaw, −sin yaw)。
// ===========================================================================
import { TANK } from "./Data_Tuning_Tank.mjs";

export const TANK_DAMAGE_STATES = Object.freeze(["Intact", "MobilityKill", "Disabled"]);
const STOP_KINDS = new Set(["hullDown", "firePoint", "squeeze", "block"]);

const Wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const Clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const Dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
/** 从 from 看向 to 的 yaw（three 约定，车头 −Z）。 */
export const YawTo = (from, to) => Math.atan2(from.x - to.x, from.z - to.z);
export const Forward = (yaw) => ({ x: -Math.sin(yaw), z: -Math.cos(yaw) });
export const Right = (yaw) => ({ x: Math.cos(yaw), z: -Math.sin(yaw) });
/** 世界点 → 车体局部（米）。 */
export function HullLocal(tank, point, groundY = 0) {
  const dx = point.x - tank.x, dz = point.z - tank.z, c = Math.cos(tank.hullYaw), s = Math.sin(tank.hullYaw);
  return { x: c * dx - s * dz, y: (point.y ?? groundY) - groundY, z: s * dx + c * dz };
}
const BoxDistance = (p, box) => {
  let sum = 0;
  for (const [i, k] of ["x", "y", "z"].entries()) {
    const v = p[k], d = v < box.min[i] ? box.min[i] - v : v > box.max[i] ? v - box.max[i] : 0;
    sum += d * d;
  }
  return Math.sqrt(sum);
};
function HasFact(facts, id) {
  if (!facts) return false;
  if (typeof facts.has === "function") return facts.has(id);
  if (typeof facts.Has === "function") return facts.Has(id);
  if (Array.isArray(facts)) return facts.includes(id);
  return !!facts[id];
}
/** 确定性的小随机（测试与复现用）。 */
export function SeededRng(seed = 1) {
  let s = seed >>> 0 || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}

export function CreateTankBrain(pathData, tuning = TANK, options = {}) { return new TankBrain(pathData, tuning, options); }

/**
 * 「车解决了没有」看哪个事实：大脑接管时（tank.brain）断履带（MobilityKill）炮塔机枪还活着、还封着口，
 * 要到 tankFireDisabled 才算；旧路径一颗弹同帧两样全记，仍看 tankImmobilized。
 * 补弹、带路人撤退、「停了！」这几处都用它，不各写一套。
 */
export function TankClearFact(tank) { return tank?.brain ? "tankFireDisabled" : "tankImmobilized"; }
/** 弹药屋还能不能再领集束弹：没领过，或车还没解决（大脑下 MobilityKill 以后照样能回去补）。 */
export function BundleResupplyOpen(tank, bundleTaken) {
  if (!bundleTaken) return true;
  return tank?.brain ? !tank.fireDisabled : !tank?.immobilized;
}
/**
 * 罗班长补刀（契约 §2 第 7 条「必须再投或罗班长补一枚」）：断了履带、玩家手里已经没有集束弹、
 * 这样僵了 luoFinishS 秒 —— 由他往舱盖里塞一颗。兜底，防 MobilityKill 以后卡关。
 * @param {{state:string, noBundleSince:number|null, now:number}} s
 */
export function LuoFinishDue({ state, noBundleSince, now }, tuning = TANK) {
  return state === "MobilityKill" && noBundleSince != null && now - noBundleSince >= tuning.damage.luoFinishS;
}
/**
 * 区域火力的落点（路点表 lanes[]）：玩家在沟线 radiusM 以内时，取沟线上离他最近、按 stepM 取整的那一点。
 * 不在沟边返回 null。返回 { x, z, s（沿线里程）, d（玩家到沟线的距离） }。radiusM 可放宽（盯沟口：lane.watch.rangeM）。
 */
export function LanePoint(lane, p, radiusM = lane?.radiusM ?? 4) {
  const P = lane.points || [];
  if (P.length < 2 || !p) return null;
  let best = null, run = 0;
  const segs = [];
  for (let i = 1; i < P.length; i++) {
    const a = P[i - 1], b = P[i], dx = b.x - a.x, dz = b.z - a.z, len = Math.hypot(dx, dz) || 1e-6;
    const t = Clamp(((p.x - a.x) * dx + (p.z - a.z) * dz) / (len * len), 0, 1);
    const d = Math.hypot(p.x - (a.x + dx * t), p.z - (a.z + dz * t));
    if (!best || d < best.d) best = { d, s: run + t * len };
    segs.push({ a, dx, dz, len, from: run });
    run += len;
  }
  if (best.d > radiusM) return null;
  const step = lane.stepM || 0;
  const s = Clamp(step > 0 ? Math.round(best.s / step) * step : best.s, 0, run);
  const seg = segs.find((g) => s <= g.from + g.len + 1e-6) || segs.at(-1);
  const t = Clamp((s - seg.from) / seg.len, 0, 1);
  return { x: seg.a.x + seg.dx * t, z: seg.a.z + seg.dz * t, s, d: best.d };
}

export class TankBrain {
  constructor(pathData, tuning = TANK, { rng = null, seed = 7 } = {}) {
    this.T = tuning;
    this.path = pathData;
    this.points = pathData.waypoints;
    if (!this.points?.length) throw new Error("TankBrain: path has no waypoints");
    this.stageOrder = pathData.stageOrder || ["Support", "MachineGun", "Tank", "Orders"];
    this.cum = [0];
    for (let i = 1; i < this.points.length; i++) this.cum.push(this.cum[i - 1] + Dist(this.points[i - 1], this.points[i]));
    this.length = this.cum.at(-1);
    // 折返点（相邻两段夹角超过 drive.reversalRad，例如 FRONT_TANK_PATH 的 HullDown 折返顶）：切线不跨它磨圆，
    // 否则在折返点上求出的「切线」指向两段之间的横向，车离开停车点时横着滑（2026-09-24 Front 包换新路时实测 83°）。
    this.reversals = [];
    const R = tuning.drive.reversalRad ?? Math.PI;
    for (let i = 1; i < this.points.length - 1; i++) {
      const a = YawTo(this.points[i - 1], this.points[i]), b = YawTo(this.points[i], this.points[i + 1]);
      if (Math.abs(Wrap(b - a)) > R) this.reversals.push(i);
    }
    this.rng = rng || SeededRng(seed);
    this.time = 0;
    // 驾驶
    this.progress = 0;
    this.speed = 0;
    this.accel = 0;
    const p0 = this.PointAt(0);
    this.x = p0.x; this.z = p0.z;
    this.hullYaw = this.TangentYaw(0);
    this.reached = 0;           // 已经到过的最远路点
    this.departed = 0;          // 最近一个停过又离开的路点（起点算离开过）
    this.holdIndex = -1;        // 正停在哪个语义路点上
    this.holdSince = 0;
    this.reverseGoal = null;
    this.reverseHoldUntil = -1;
    this.stage = null;
    this.stageFloor = 0;
    this.pivoting = false;
    this.moving = false;
    this.load = 0;
    this.rpm = tuning.drive.idleRpm;
    this.hullPitch = 0;
    this.events = []; this.barks = []; this.fire = [];
    this.queuedBarks = []; this.queuedEvents = []; this.inUpdate = false;
    // 炮手
    this.turretYaw = this.hullYaw;
    this.gunPitch = 0;
    this.traverseRate = 0;
    this.turretRate = 0;
    this.cranking = false;
    this.phase = "idle";        // idle | traverse | lay | reload
    this.layUntil = 0;
    this.layStartedAt = 0;
    this.reloadUntil = 0;
    this.plan = null;           // 当前这一发的计划 { targetId, at, warning, kind }
    this.targetId = null;
    this.shotsOnTarget = 0;
    this.lastAim = null;        // 上一发瞄的是谁、那时他在哪（目标挪开 moveResetM 以上 → 散布从头收敛）
    this.memory = new Map();    // id → { x, y, z, ground, vx, vz, seenAt, exposedSince, warned, contactAt, kind }
    this.nextPerceive = 0;
    this.visible = new Set();
    this.raysLastTick = 0;
    this.calloutsLeft = tuning.gunner.calloutCount;
    this.attention = null;      // { point, until, kind }
    this.nextScanAt = this.Range(tuning.react.scanMinS, tuning.react.scanMaxS);
    this.scanIndex = 0;
    this.lastDecoy = -Infinity;
    this.slitClosedUntil = -1;
    this.lastReaction = -Infinity;
    this.reactions = 0;
    // 机枪
    this.mg = { phase: "rest", until: 0, nextShot: 0, burst: null };
    this.rear = { phase: "rest", until: 0, nextShot: 0, burst: null };
    this.mgSuppress = null;     // { point, until }
    this.deadZone = null;       // { targetId, since }
    this.lastHatchShout = -Infinity;
    this.hatchOpenUntil = -1;
    // 护兵
    this.escortMode = null;     // { kind: "scatter"|"rally", until, point }
    this.escortsReleased = false;
    // 毁伤
    this.damageState = "Intact";
    this.damageLog = [];
    this.trackSide = 0;
    this.engineKilled = false;
    this.disabledAt = -1;
    this.lastShotAt = -Infinity;
    this.telemetry = { shots: [], bursts: [], reactions: [], states: [["Intact", 0]] };
  }

  // --- 小工具 ----------------------------------------------------------------
  Range(a, b) { return a + (b - a) * this.rng(); }
  /** 两帧之间（OnBlast / OnBulletHit）发生的喊话与事件排到下一帧的输出里。 */
  Bark(entry) { (this.inUpdate ? this.barks : this.queuedBarks).push(entry); }
  Event(entry) { (this.inUpdate ? this.events : this.queuedEvents).push(entry); }
  StageRank(stage) { const i = this.stageOrder.indexOf(stage); return i < 0 ? -1 : i; }
  PointAt(s) {
    const d = Clamp(s, 0, this.length), P = this.points;
    for (let i = 1; i < P.length; i++) {
      if (d <= this.cum[i] || i === P.length - 1) {
        const span = this.cum[i] - this.cum[i - 1] || 1, t = Clamp((d - this.cum[i - 1]) / span, 0, 1);
        return { x: P[i - 1].x + (P[i].x - P[i - 1].x) * t, z: P[i - 1].z + (P[i].z - P[i - 1].z) * t };
      }
    }
    return { x: P[0].x, z: P[0].z };
  }
  /** 行进方向（磨圆了尖角的路线切线）。 */
  TangentYaw(s) {
    const span = this.T.drive.tangentSpanM;
    for (const i of this.reversals) {
      if (Math.abs(s - this.cum[i]) > span) continue;
      // 折返点前取来路那一段、到了（含）折返点取去路那一段：原地掉头由驾驶的 pivot 负责。
      return s < this.cum[i] - 1e-6 ? YawTo(this.points[i - 1], this.points[i]) : YawTo(this.points[i], this.points[i + 1]);
    }
    const a = this.PointAt(Math.min(s - span, this.length - 2 * span)), b = this.PointAt(Math.max(s + span, 2 * span));
    return YawTo(a, b);
  }
  get Pose() { return { x: this.x, z: this.z, hullYaw: this.hullYaw }; }
  get Immobilized() { return this.damageState !== "Intact"; }
  get FireDisabled() { return this.damageState === "Disabled"; }
  /** 正停在一个语义停车点上（主炮只在这儿开）。 */
  get AtStop() {
    if (this.damageState === "MobilityKill") return Math.abs(this.speed) < 0.05;
    return this.holdIndex >= 0 && Math.abs(this.speed) < 0.05 && STOP_KINDS.has(this.points[this.holdIndex].kind);
  }
  get Waypoint() { return this.holdIndex >= 0 ? this.points[this.holdIndex] : null; }

  /** 阶段跳转 / 读档：直接摆到某个路点上（停住、车头按 faceTo）。 */
  PlaceAt(index) {
    const i = Clamp(index | 0, 0, this.points.length - 1), w = this.points[i];
    this.progress = this.cum[i]; this.x = w.x; this.z = w.z; this.speed = 0; this.accel = 0;
    this.reached = i; this.departed = i - 1; this.holdIndex = i; this.holdSince = this.time;
    this.hullYaw = w.faceTo ? YawTo(w, w.faceTo) : this.TangentYaw(this.progress);
    this.turretYaw = this.hullYaw; this.reverseGoal = null; this.stageFloor = this.progress;
  }
  /** 进入某一步时该在的位置：上一步能走到的最后一个停车点。 */
  PlaceForStage(stage) {
    const rank = this.StageRank(stage);
    let index = 0;
    for (let i = 0; i < this.points.length; i++) {
      const r = this.StageRank(this.points[i].stage ?? this.stageOrder[0]);
      if (r < rank && STOP_KINDS.has(this.points[i].kind)) index = i;
    }
    this.PlaceAt(index); this.stage = stage;
    return index;
  }

  // --- 驾驶 -------------------------------------------------------------------
  HoldSatisfied(i, world) {
    const w = this.points[i];
    if (w.holdS != null && this.time - this.holdSince < w.holdS) return false;
    if (w.holdUntil) {
      if (w.holdUntil.startsWith("stage:")) {
        if (this.StageRank(world.stage) < this.StageRank(w.holdUntil.slice(6))) return false;
      } else if (!HasFact(world.facts, w.holdUntil)) return false;
    }
    return true;
  }
  /**
   * 下一个要停的路点（按当前里程往前找）：语义停车点、路线终点，或被阶段拴住的最后一个路点。
   * 没有能去的就返回 null（原地停着）。
   */
  NextStop(world) {
    const D = this.T.drive, rank = this.StageRank(world.stage), n = this.points.length;
    for (let i = 0; i < n; i++) {
      // 身后的、刚离开的（及更早的）都不算。
      if (i <= this.departed || i === this.holdIndex || this.cum[i] < this.progress - D.arriveM) continue;
      const w = this.points[i];
      if (this.StageRank(w.stage ?? this.stageOrder[0]) > rank) {
        return i > 0 && i - 1 > this.departed && i - 1 !== this.holdIndex && this.cum[i - 1] >= this.progress - D.arriveM ? i - 1 : null;
      }
      // 只是「等某件事」的 hull-down（没有停留时长、不摆车头）：那件事已经发生了就不停，直接开过去。
      if (w.kind === "hullDown" && w.holdS == null && !w.faceTo && i < n - 1 && this.HoldSatisfied(i, world)) continue;
      if (STOP_KINDS.has(w.kind) || i === n - 1) return i;
    }
    return null;
  }
  Arrive(index) {
    this.progress = this.cum[index]; this.speed = 0;
    this.reached = Math.max(this.reached, index);
    if (this.holdIndex !== index) { this.holdIndex = index; this.holdSince = this.time; this.Event({ id: "stop", index }); }
  }
  Drive(dt, world) {
    const D = this.T.drive;
    const previousSpeed = this.speed;
    this.pivoting = false;
    let targetSpeed = 0, desiredYaw = null, squeeze = false, bound = null;
    if (this.damageState !== "Intact") {
      // 履带断了 / 熄火：原地不动。
      this.speed = 0; this.reverseGoal = null;
    } else {
      if (this.reverseGoal != null) {
        // 躲弹后倒：沿路线直着退，车头不变。
        const remaining = this.progress - this.reverseGoal;
        if (remaining <= D.arriveM * 0.5) { this.reverseGoal = null; }
        else {
          targetSpeed = -Math.min(D.reverseMps, Math.sqrt(2 * D.decelMps2 * remaining)); this.holdIndex = -1;
          // 退到了停车点后面：前面的停车点重新算数（退完缓一口气再往前挤回去）。
          let behind = -1;
          for (let i = 0; i < this.points.length; i++) if (this.cum[i] < this.reverseGoal - D.arriveM) behind = i;
          this.departed = Math.min(this.departed, behind);
        }
      }
      if (this.reverseGoal == null) {
        if (this.holdIndex >= 0) {
          const w = this.points[this.holdIndex], next = this.NextStop(world);
          const ready = this.HoldSatisfied(this.holdIndex, world) && this.time >= this.reverseHoldUntil && next != null;
          if (!ready) { if (w.faceTo) desiredYaw = YawTo(this, w.faceTo); }
          else { this.departed = this.holdIndex; this.holdIndex = -1; }
        }
        if (this.holdIndex < 0) {
          if (this.time < this.reverseHoldUntil) { /* 刚退完：缓一口气再往前挤 */ }
          else {
            const next = this.NextStop(world);
            if (next != null) {
              bound = this.cum[next];
              const remaining = bound - this.progress;
              if (remaining <= D.arriveM && Math.abs(this.speed) < 0.6) this.Arrive(next);
              else {
                squeeze = this.points[next].kind === "squeeze";
                const cruise = squeeze ? D.squeezeMps : D.cruiseMps;
                const tangent = this.TangentYaw(this.progress), err = Math.abs(Wrap(tangent - this.hullYaw));
                if (this.pivotLock || (err > D.pivotThresholdRad && Math.abs(this.speed) < 0.05)) {
                  this.pivotLock = err > D.pivotDoneRad;
                  if (this.pivotLock) desiredYaw = tangent;
                }
                if (!this.pivotLock) {
                  targetSpeed = Math.min(cruise, Math.sqrt(2 * D.decelMps2 * Math.max(0, remaining - D.arriveM * 0.5)));
                  targetSpeed *= Clamp(1 - err / (D.pivotThresholdRad * 1.6), 0.25, 1);
                }
              }
            }
          }
        }
      }
    }
    // 速度：加速 / 减速按表里的上限（反向时先刹停）。
    const sameWay = Math.sign(targetSpeed) === Math.sign(this.speed) || this.speed === 0;
    const rate = sameWay && Math.abs(targetSpeed) > Math.abs(this.speed) ? D.accelMps2 : D.decelMps2;
    this.speed += Clamp(targetSpeed - this.speed, -rate * dt, rate * dt);
    if (Math.abs(this.speed) < 1e-4 && targetSpeed === 0) this.speed = 0;
    // 位置：只沿路线走（不横着滑）；前进不越过下一个停车点，后倒不越过阶段下限。
    let next = this.progress + this.speed * dt;
    if (this.speed > 0 && bound != null) next = Math.min(next, bound);
    if (this.speed < 0) next = Math.max(next, this.stageFloor, this.reverseGoal ?? -Infinity);
    this.progress = Clamp(next, 0, this.length);
    const p = this.PointAt(this.progress);
    this.x = p.x; this.z = p.z;
    // 车头：停着才原地转（≤ pivotRadS）；走着按车速给转向率。
    if (desiredYaw != null && Math.abs(this.speed) < 0.05 && this.damageState === "Intact") {
      const err = Wrap(desiredYaw - this.hullYaw);
      if (Math.abs(err) > 1e-3) {
        const step = Clamp(err, -D.pivotRadS * dt, D.pivotRadS * dt);
        this.hullYaw = Wrap(this.hullYaw + step); this.pivoting = Math.abs(step) > 1e-5;
      }
    } else if (this.speed > 0.01) {
      const turn = Math.min(D.moveTurnMaxRad, this.speed / D.turnRadiusM);
      this.hullYaw = Wrap(this.hullYaw + Clamp(Wrap(this.TangentYaw(this.progress) - this.hullYaw), -turn * dt, turn * dt));
    }
    this.accel = dt > 0 ? (this.speed - previousSpeed) / dt : 0;
    const wasMoving = this.moving;
    this.moving = Math.abs(this.speed) > 0.05;
    if (this.moving && !wasMoving) this.Event({ id: this.speed < 0 ? "reverse" : "start" });
    if (!this.moving && wasMoving) this.Event({ id: "halt" });
    if (this.pivoting && !this.wasPivoting) this.Event({ id: "pivot" });
    this.wasPivoting = this.pivoting;
    // 引擎负载与转速。
    const accelTerm = this.speed * this.accel > 0 ? Math.abs(this.accel) / D.accelMps2 : 0;
    const load = this.damageState === "Disabled" ? 0
      : D.loadAccelWeight * accelTerm + D.loadSpeedWeight * Math.abs(this.speed) / D.cruiseMps
        + (this.pivoting ? D.loadPivotWeight : 0) + (squeeze && this.moving ? D.loadSqueezeBonus : 0);
    this.load = Clamp(load, 0, 1);
    let rpmTarget = D.idleRpm + (D.maxRpm - D.idleRpm) * Clamp(this.load * 0.75 + Math.abs(this.speed) / D.cruiseMps * 0.25, 0, 1);
    if (this.damageState === "Disabled") {
      const t = (this.time - this.disabledAt) / this.T.damage.stallS;
      rpmTarget = t >= 1 ? 0 : D.idleRpm * (1 - t) * (0.6 + 0.4 * Math.abs(Math.sin(t * 19)));
    }
    this.rpm += (rpmTarget - this.rpm) * (1 - Math.exp(-dt / D.rpmLagS));
    if (this.damageState === "Disabled" && this.time - this.disabledAt >= this.T.damage.stallS) this.rpm = 0;
    // 点头 / 后仰：加速抬头（尾部下蹲），刹车点头。
    const pitchGoal = Clamp(this.accel * D.pitchPerAccel, -D.pitchMaxRad, D.pitchMaxRad);
    this.hullPitch += (pitchGoal - this.hullPitch) * (1 - Math.exp(-dt / 0.25));
  }

  // --- 感知 -------------------------------------------------------------------
  Candidates(world) {
    const G = this.T.gunner, out = [];
    for (const t of world.targets || []) {
      if (t.alive === false || t.untargetable || t.protect) continue;
      const d = Dist(this, t);
      if (d > G.rangeM) continue;
      // 区域目标进了最小射程：主炮够不着，也不值得每帧重新规划一遍。
      if (t.kind === "zone" && d < G.minRangeM) continue;
      out.push(t);
    }
    return out;
  }
  Prior(t) {
    const G = this.T.gunner;
    // 打不死的剧情人物（scriptEssential，血量托底到 1）不值得一发炮弹：权重乘一个很小的系数。
    const weight = (t.weight ?? 1) * (G.weights[t.kind] ?? G.weights.squad) * (t.essential ? G.essentialScale : 1)
      * (t.weightScale ?? 1);
    const d = Dist(this, t);
    return weight / (1 + d / G.distanceFalloffM) * (t.id === this.targetId ? G.inertia : 1);
  }
  Perceive(world) {
    const G = this.T.gunner;
    this.raysLastTick = 0;
    if (this.time < this.nextPerceive) return;
    this.nextPerceive = this.time + 1 / G.perceptionHz;
    const slitClosed = this.time < this.slitClosedUntil;
    const candidates = this.Candidates(world).sort((a, b) => this.Prior(b) - this.Prior(a));
    const from = world.tankPose?.muzzle || { x: this.x, y: (world.tankPose?.groundY ?? 0) + 2.05, z: this.z };
    const seen = new Set();
    for (const t of candidates) {
      if (this.raysLastTick >= G.raysPerTick) break;
      // 观察窗刚挨了一发、关着：这一拍只认得出还在记忆里的当前目标。
      if (slitClosed && t.id !== this.targetId) continue;
      this.raysLastTick++;
      const point = { x: t.x, y: t.y ?? 1.2, z: t.z };
      if (!world.Los || world.Los(from, point, t)) seen.add(t.id);
    }
    // 记忆：看见的刷新位置与速度；新暴露（离开视线超过 reexposeS）重置警告弹。
    // 区域目标（阵位、缺口）是已知的地方，不用看见也记着；看没看见只决定打人还是打掩体沿。
    for (const t of candidates) {
      if (!seen.has(t.id) && t.kind !== "zone") continue;
      const m = this.memory.get(t.id);
      const fresh = !m || this.time - m.seenAt > G.reexposeS;
      const vx = m && this.time > m.seenAt ? (t.x - m.x) / Math.max(0.1, this.time - m.seenAt) : 0;
      const vz = m && this.time > m.seenAt ? (t.z - m.z) / Math.max(0.1, this.time - m.seenAt) : 0;
      this.memory.set(t.id, {
        id: t.id, kind: t.kind, weight: t.weight, x: t.x, y: t.y ?? 1.2, z: t.z, ground: t.ground,
        vx: t.vx ?? vx, vz: t.vz ?? vz, seenAt: this.time,
        exposedSince: fresh ? this.time : m.exposedSince, warned: fresh ? false : m.warned,
        contactAt: m?.contactAt ?? -Infinity, zone: t.kind === "zone", scatterM: t.scatterM,
      });
    }
    this.visible = seen;
  }
  /** 当前最该打的目标（看得见的优先；看不见但记忆新鲜的打折）。 */
  ChooseTarget(world) {
    const G = this.T.gunner;
    let best = null, bestScore = 0;
    for (const t of this.Candidates(world)) {
      const m = this.memory.get(t.id);
      if (!m) continue;
      const age = this.time - m.seenAt;
      const visible = this.visible.has(t.id);
      if (!visible && age > G.memoryS) continue;
      const score = this.Prior(t) * (visible ? 1 : m.zone ? G.unseenZoneScale : G.unseenScale * (1 - age / G.memoryS));
      if (score > bestScore) { bestScore = score; best = { target: t, memory: m, visible }; }
    }
    return best;
  }

  // --- 炮手 -------------------------------------------------------------------
  ProtectedPoints(world) {
    return (world.targets || []).filter((t) => t.alive !== false && (t.untargetable || t.protect));
  }
  /** 弹着点离受保护的人至少 protectClearM；推不开就返回 null（这一发不打）。 */
  ClearOfProtected(at, world) {
    const clear = this.T.gunner.protectClearM, list = this.ProtectedPoints(world);
    const point = { ...at };
    for (let pass = 0; pass < 3; pass++) {
      let moved = false;
      for (const p of list) {
        const d = Dist(point, p);
        if (d >= clear) continue;
        const dx = d > 1e-3 ? (point.x - p.x) / d : Math.sin(pass + 1), dz = d > 1e-3 ? (point.z - p.z) / d : Math.cos(pass + 1);
        point.x = p.x + dx * (clear + 0.05); point.z = p.z + dz * (clear + 0.05); moved = true;
      }
      if (!moved) return point;
    }
    return list.every((p) => Dist(point, p) >= clear - 1e-6) ? point : null;
  }
  GroundOf(m) { return m.ground ?? (m.y ?? 1.2) - 1.2; }
  /** 规划这一发打在哪。 */
  PlanShot(choice, world, from) {
    const G = this.T.gunner, m = choice.memory, t = choice.target;
    const ground = this.GroundOf(m);
    let at, kind = "HE", warning = false;
    const lip = m.zone && !choice.visible ? world.Cover?.({ x: m.x, y: m.y, z: m.z }, from) : null;
    if (lip) {
      // 区域目标躲在实遮挡后面：轰那道掩体的沿（Script_FirstLevelFrontBreakables 一截截打掉）。
      at = { ...lip }; kind = "cover";
    } else if (m.zone) {
      const r = this.Range(t.scatterM?.[0] ?? G.zoneScatterMinM, t.scatterM?.[1] ?? G.zoneScatterMaxM) * Math.sqrt(this.rng());
      const a = this.rng() * Math.PI * 2;
      at = { x: m.x + Math.cos(a) * r, y: ground + G.burstRiseM, z: m.z + Math.sin(a) * r };
      kind = "zone";
    } else if (!choice.visible) {
      // 看不见：按 lastKnown 的掩体打（掩体沿，没有就地面）。
      const lip = world.Cover?.({ x: m.x, y: m.y, z: m.z }, from);
      at = lip ? { ...lip } : { x: m.x, y: ground + 0.2, z: m.z };
      kind = "suppress";
    } else if (m.kind === "player" || m.kind === "mannedMg") {
      if (!m.warned) {
        // 新暴露的玩家：第一发打他的掩体沿，不打人；没有掩体就打在他前面的地上。
        const lip = world.Cover?.({ x: m.x, y: m.y, z: m.z }, from);
        if (lip) at = { ...lip };
        else {
          const d = Math.max(0.1, Dist(m, this)), ux = (this.x - m.x) / d, uz = (this.z - m.z) / d;
          if (d - G.warningShortM >= G.minRangeM + 0.5) at = { x: m.x + ux * G.warningShortM, y: ground + 0.1, z: m.z + uz * G.warningShortM };
          // 太近了打「短」会进最小射程：改成打在他身旁的地上。
          else { const side = this.rng() < 0.5 ? -1 : 1; at = { x: m.x - uz * G.warningShortM * side, y: ground + 0.1, z: m.z + ux * G.warningShortM * side }; }
        }
        warning = true; kind = "warning";
      }
    }
    if (!at) {
      const flight = Math.hypot(m.x - from.x, m.z - from.z) / G.shellSpeedMps;
      let lx = (m.vx || 0) * flight, lz = (m.vz || 0) * flight;
      const lead = Math.hypot(lx, lz);
      if (lead > G.leadMaxM) { lx *= G.leadMaxM / lead; lz *= G.leadMaxM / lead; }
      // 目标挪了窝（离上一发瞄的位置 moveResetM 以上，跑动 / 换掩体）：散布回到第一发，不接着收敛。
      if (this.lastAim && this.lastAim.targetId === t.id && Dist(m, this.lastAim) > G.moveResetM) this.shotsOnTarget = 0;
      const n = t.id === this.targetId ? this.shotsOnTarget : 0;
      const scatter = Math.max(G.scatterMinM, G.scatterFirstM * G.scatterShrink ** n);
      const r = scatter * Math.sqrt(this.rng()), a = this.rng() * Math.PI * 2;
      at = { x: m.x + lx + Math.cos(a) * r, y: ground + G.burstRiseM, z: m.z + lz + Math.sin(a) * r };
    }
    const cleared = this.ClearOfProtected(at, world);
    if (!cleared) return null;
    // 落点贴着一个还没被警告过的玩家（区域弹轰他面前的掩体也算）：这一发就是他的警告弹。
    // 落点在弹片够得着的范围里、而玩家这会儿带着伤害上限（剧本撤离窗口）：这一发按上限打。
    let warns = warning ? [t.id] : [], damageScale = 1;
    for (const p of world.targets || []) {
      if (p.kind !== "player" && p.kind !== "mannedMg") continue;
      const pm = this.memory.get(p.id);
      if (Dist(cleared, p) < G.warningRadiusM && !(pm?.warned)) { warning = true; if (!warns.includes(p.id)) warns.push(p.id); }
      if (p.damageCap != null && Dist(cleared, p) < G.protectClearM) damageScale = Math.min(damageScale, p.damageCap);
    }
    return { targetId: t.id, targetKind: m.kind, at: cleared, kind, warning, warns, damageScale, visible: choice.visible, plannedAt: this.time,
      aimedAt: { x: m.x, z: m.z } };
  }
  Gunner(dt, world) {
    const G = this.T.gunner, R = this.T.react, Z = this.T.deadZone;
    const from = world.tankPose?.muzzle || { x: this.x, y: (world.tankPose?.groundY ?? 0) + 2.05, z: this.z };
    const choice = this.damageState === "Disabled" ? null : this.ChooseTarget(world);
    if (choice && choice.target.id !== this.targetId) {
      this.targetId = choice.target.id; this.shotsOnTarget = 0; this.plan = null;
      if (this.phase !== "reload") this.phase = "idle";
    }
    if (!choice && this.targetId != null && this.phase !== "reload") { this.targetId = null; this.plan = null; this.phase = "idle"; }
    if (this.phase === "reload" && !choice && this.time >= this.reloadUntil) this.phase = "idle";
    const weapons = world.weaponsFree || { main: true, mg: true };
    // 死角：贴身、又不在车体机枪射界里 → 炮塔掉头用塔后机枪；开舱盖喊护兵。
    let dead = null;
    if (choice?.visible && !choice.memory.zone) {
      const d = Dist(this, choice.memory);
      const off = Math.abs(Wrap(YawTo(this, choice.memory) - this.hullYaw));
      if (d < Z.rangeM && off > this.T.mg.hullArcRad) dead = choice;
    }
    if (dead) {
      if (!this.deadZone || this.deadZone.targetId !== dead.target.id) {
        this.deadZone = { targetId: dead.target.id, since: this.time };
        if (this.time - this.lastHatchShout >= Z.hatchShoutCooldownS) {
          this.lastHatchShout = this.time; this.hatchOpenUntil = this.time + 3;
          this.Bark({ id: "hatchShout", at: { x: dead.memory.x, z: dead.memory.z } });
          this.escortMode = { kind: "rally", until: this.time + R.scatterS, point: { x: dead.memory.x, z: dead.memory.z } };
        }
      }
    } else this.deadZone = null;
    // 炮塔目标：甩向投掷者 / 被牵注意 / 扫描 / 死角掉头 / 这一发的弹着点。
    let goal = null, rate = 0, telegraph = false;
    const attention = this.attention && this.time < this.attention.until ? this.attention : null;
    if (this.damageState === "Disabled") goal = null;
    else if (dead) { goal = Wrap(YawTo(this, dead.memory) + Math.PI); rate = Z.turnRad; }
    else if (attention && (attention.kind === "thrower" || !choice?.visible)) {
      goal = YawTo(this, attention.point); rate = attention.kind === "thrower" ? G.whipRad : this.traverseRate || G.traverseMinRad;
    } else if (choice) {
      // 需要一发新的计划：装填快好了（或还没开过炮）。
      if (this.phase === "reload" && this.time >= this.reloadUntil) this.phase = "idle";
      if (this.phase === "idle" && (!this.plan || this.plan.targetId !== choice.target.id)) {
        this.plan = this.PlanShot(choice, world, from);
        if (this.plan) {
          this.phase = "traverse"; this.traverseRate = this.Range(G.traverseMinRad, G.traverseMaxRad);
          telegraph = true;
        }
      }
      // 移动目标：计划落点偏出去太多就重新规划、重新摇。
      if (this.plan && choice.visible && !choice.memory.zone && this.phase === "lay") {
        const drift = Math.abs(Wrap(YawTo(this, choice.memory) - YawTo(this, this.plan.at)));
        if (drift > G.relayRad * 2.5 && !this.plan.warning) {
          this.plan = this.PlanShot(choice, world, from);
          if (this.plan) { this.phase = "traverse"; }
        }
      }
      if (this.plan) { goal = YawTo(this, this.plan.at); rate = this.traverseRate || G.traverseMinRad; }
      // 装填的时候炮手照样摇炮塔跟着目标走（装填手装弹、炮手摇手轮，两个人的活）：换了目标不必等装填完才开始摇。
      // 预兆不变 —— 瞄准停顿（layMinS–layMaxS）只从装填完、这一发计划好、炮塔对准以后才开始算。
      // 2026-09-24 探针：05 换到攻击支路以后炮塔在「reload」里干等 4 s 才开始摇，人已经走完那段沟了。
      else if (this.phase === "reload" && weapons.main) { goal = YawTo(this, choice.memory); rate = G.traverseMinRad; }
    }
    // 摇炮塔（手摇：一次瞄准一个速度，转到位就停）。
    const before = this.turretYaw;
    if (goal != null) {
      const gap = Wrap(goal - this.turretYaw);
      // 瞄准停顿只在停车点上、主炮许可时走（走着的时候炮塔只跟踪，不算停顿）。
      if (this.phase === "lay" && (Math.abs(gap) > G.relayRad || !this.AtStop || !weapons.main)) { this.phase = "traverse"; }
      if (Math.abs(gap) > G.alignRad && (this.phase !== "lay")) {
        this.turretYaw = Wrap(this.turretYaw + Clamp(gap, -rate * dt, rate * dt));
      } else if (this.phase === "traverse" && this.plan && !dead && this.AtStop && weapons.main) {
        this.phase = "lay"; this.layStartedAt = this.time; this.layUntil = this.time + this.Range(G.layMinS, G.layMaxS);
      }
    }
    this.turretRate = dt > 0 ? Wrap(this.turretYaw - before) / dt : 0;
    this.cranking = Math.abs(this.turretRate) > 1e-3;
    if (telegraph && weapons.main && this.AtStop && this.plan && (this.plan.targetKind === "player" || this.plan.targetKind === "mannedMg") && this.calloutsLeft > 0) {
      this.calloutsLeft--; this.Bark({ id: "turretTraverse", target: this.plan.targetId });
    }
    // 俯仰。
    if (this.plan) {
      const d = Math.max(0.5, Math.hypot(this.plan.at.x - from.x, this.plan.at.z - from.z));
      const pitchGoal = Clamp(Math.atan2(this.plan.at.y - from.y, d), G.pitchMinRad, G.pitchMaxRad);
      this.gunPitch += Clamp(pitchGoal - this.gunPitch, -G.pitchRateRad * dt, G.pitchRateRad * dt);
    }
    // 开炮：停在语义停车点、瞄准停顿走完、节奏到了、射程够、这一步允许主炮。
    if (this.plan && this.phase === "lay" && weapons.main && this.damageState !== "Disabled" && !dead
      && this.AtStop && this.time >= this.layUntil) {
      const range = Math.hypot(this.plan.at.x - this.x, this.plan.at.z - this.z);
      if (range >= G.minRangeM) {
        const plan = this.plan;
        // 人吃的伤害：警告弹 ×warningDamageScale、撤离窗口按上限；打掩体的力道（coverDamage）始终是整发炮弹 ——
        // 警告弹也照样把墙沿打掉一截（「第一发打在你掩体的沿上、泥土砸下来」）。
        const scale = Math.min(plan.warning ? G.warningDamageScale : 1, plan.damageScale ?? 1);
        this.fire.push({ weapon: "main", at: { ...plan.at }, kind: plan.kind, target: plan.targetId, warning: plan.warning,
          flight: range / G.shellSpeedMps, radius: G.shellRadiusM, damage: G.shellDamage * scale, coverDamage: G.shellDamage,
          layS: this.time - this.layStartedAt });
        this.lastAim = { targetId: plan.targetId, x: plan.aimedAt?.x ?? plan.at.x, z: plan.aimedAt?.z ?? plan.at.z };
        this.telemetry.shots.push({ t: this.time, target: plan.targetId, kind: plan.kind, at: { ...plan.at },
          layS: this.time - this.layStartedAt, turretYaw: this.turretYaw, x: this.x, z: this.z, damageScale: scale,
          spreadStep: this.shotsOnTarget });
        for (const id of plan.warns || []) {
          const w = this.memory.get(id);
          if (w) w.warned = true;
          else this.memory.set(id, { id, kind: "player", x: plan.at.x, y: plan.at.y, z: plan.at.z, seenAt: -Infinity, warned: true, contactAt: -Infinity });
        }
        this.shotsOnTarget++; this.lastShotAt = this.time;
        // 节奏按「这一发到下一发」算：装填时间 = 间隔 − 预计的摇炮塔与瞄准停顿。
        const interval = G.intervalMidS + (this.rng() * 2 - 1) * G.intervalJitterS;
        this.reloadUntil = this.time + Math.max(0.5, interval - (G.layMinS + G.layMaxS) / 2 - 0.3);
        this.phase = "reload"; this.plan = null;
      } else { this.plan = null; this.phase = "idle"; }
    }
  }

  // --- 机枪 -------------------------------------------------------------------
  MgTargetPoint(m) { return { x: m.x, y: (m.ground ?? m.y - 1.2) + (m.kind === "zone" ? 0.6 : 0.9), z: m.z }; }
  StartBurst(slot, weapon, world, arcYaw, arcRad) {
    const M = this.T.mg;
    // 先看压制请求（反应 / 被牵注意），再看射界里看得见的目标，最后看记忆里的 lastKnown。
    let pick = null;
    const inArc = (p) => Math.abs(Wrap(YawTo(this, p) - arcYaw)) <= arcRad && Dist(this, p) <= M.rangeM;
    if (this.mgSuppress && this.time < this.mgSuppress.until && inArc(this.mgSuppress.point)) {
      pick = { kind: "suppress", point: this.mgSuppress.point, id: this.mgSuppress.id ?? "suppress", damage: true };
    }
    if (!pick) {
      let best = null, bestScore = 0;
      for (const t of this.Candidates(world)) {
        const m = this.memory.get(t.id);
        if (!m || !inArc(m)) continue;
        const visible = this.visible.has(t.id), age = this.time - m.seenAt;
        if (!visible && age > M.suppressS) continue;
        const score = this.Prior(t) * (visible ? 1 : 0.4);
        if (score > bestScore) { bestScore = score; best = { m, visible }; }
      }
      if (best) {
        const m = best.m;
        if (!best.visible) pick = { kind: "suppress", point: world.Cover?.({ x: m.x, y: m.y, z: m.z }, world.tankPose?.[weapon === "rear" ? "rearMg" : "mg"]) || this.MgTargetPoint(m), id: m.id, damage: true };
        else if (!m.zone && this.time - m.contactAt > M.freshContactS) {
          // 首次接触：从目标前 walkInStartM 起「走」到目标上，这一串不伤人。
          m.contactAt = this.time;
          const aim = this.MgTargetPoint(m), d = Math.max(0.1, Dist(m, this)), k = Math.min(M.walkInStartM, d * 0.8) / d;
          pick = { kind: "walkIn", from: { x: aim.x + (this.x - aim.x) * k, y: aim.y - 0.6, z: aim.z + (this.z - aim.z) * k }, point: aim, id: m.id, damage: false };
        } else { m.contactAt = this.time; pick = { kind: "burst", point: this.MgTargetPoint(m), id: m.id, damage: true }; }
      }
    }
    if (!pick) return false;
    // 撤离窗口（目标带 damageCap）：机枪这一串不伤人（压制、弹着照旧）—— 一发机枪弹不论多轻都开一道流血伤口。
    const capped = (world.targets || []).find((t) => t.id === pick.id && t.damageCap != null);
    if (capped && pick.damage) { pick.damage = false; pick.capped = true; }
    slot.burst = { ...pick, start: this.time, shots: 0 };
    slot.phase = "burst"; slot.until = this.time + M.burstS; slot.nextShot = this.time;
    this.telemetry.bursts.push({ t: this.time, weapon, kind: pick.kind, target: pick.id, damage: pick.damage });
    return true;
  }
  RunBurst(slot, weapon, dt) {
    const M = this.T.mg;
    if (slot.phase !== "burst") return;
    while (this.time >= slot.nextShot && slot.nextShot < slot.until) {
      const b = slot.burst, t = Clamp((slot.nextShot - b.start) / M.burstS, 0, 1);
      let at;
      if (b.kind === "walkIn") at = { x: b.from.x + (b.point.x - b.from.x) * t, y: b.from.y + (b.point.y - b.from.y) * t, z: b.from.z + (b.point.z - b.from.z) * t };
      else {
        const n = ++b.shots, spread = M.spreadM + (M.spreadPerM || 0) * Dist(b.point, this);
        at = { x: b.point.x + Math.sin(n * 2.399) * spread, y: b.point.y + Math.cos(n * 1.79) * spread * 0.3, z: b.point.z + Math.cos(n * 2.399) * spread };
      }
      this.fire.push({ weapon, at, kind: b.kind, target: b.id, damageScale: b.damage ? M.damageScale : 0 });
      slot.nextShot += M.shotIntervalS;
    }
    if (this.time >= slot.until) { slot.phase = "rest"; slot.until = this.time + this.Range(M.restMinS, M.restMaxS); slot.burst = null; }
  }
  Guns(dt, world) {
    const M = this.T.mg, Z = this.T.deadZone;
    const weapons = world.weaponsFree || { main: true, mg: true };
    if (this.damageState === "Disabled" || !weapons.mg) { this.mg.phase = "rest"; this.rear.phase = "rest"; return; }
    if (this.mg.phase === "rest" && this.time >= this.mg.until) this.StartBurst(this.mg, "coax", world, this.hullYaw, M.hullArcRad);
    this.RunBurst(this.mg, "coax", dt);
    // 塔后机枪：炮塔掉头对准死角里的人才开。
    const rearYaw = Wrap(this.turretYaw + Math.PI);
    if (this.deadZone && this.rear.phase === "rest" && this.time >= this.rear.until && this.time - this.deadZone.since >= Z.minRearS) {
      const m = this.memory.get(this.deadZone.targetId);
      if (m && this.visible.has(m.id) && Math.abs(Wrap(YawTo(this, m) - rearYaw)) <= Z.rearArcRad)
        this.StartBurst(this.rear, "rear", world, rearYaw, Z.rearArcRad);
    }
    this.RunBurst(this.rear, "rear", dt);
  }

  // --- 反应 / 扫描 --------------------------------------------------------------
  Scan(world) {
    const R = this.T.react;
    if (this.damageState === "Disabled" || this.time < this.nextScanAt) return;
    this.nextScanAt = this.time + this.Range(R.scanMinS, R.scanMaxS);
    const rank = this.StageRank(world.stage);
    const points = (this.path.scan || []).filter((p) => this.StageRank(p.stage ?? this.stageOrder[0]) <= rank);
    if (!points.length) return;
    if (this.visible.size && this.targetId && this.visible.has(this.targetId)) return;
    const p = points[this.scanIndex++ % points.length];
    this.attention = { point: { x: p.x, z: p.z }, until: this.time + R.scanLookS, kind: "scan" };
    this.Event({ id: "scan", point: { x: p.x, z: p.z } });
  }
  /** 爆炸：先判毁伤（车体局部坐标），再做反应。返回 { zone, state, reaction }。 */
  OnBlast({ x, y, z, explosiveId, damage = 0, radius = 1, thrower = null, byPlayer = false, occluded = null } = {}, world = {}) {
    const R = this.T.react, K = this.T.damage;
    const groundY = world.tankPose?.groundY ?? this.lastGroundY ?? 0;
    const local = HullLocal(this, { x, y, z }, groundY);
    const result = { local, zone: null, state: this.damageState, reaction: false };
    if (this.damageState === "Disabled") return result;
    // 毁伤：只有表里那几种爆炸物；按车体局部坐标挑最先生效的部位。
    if (K.explosives.includes(explosiveId) && (byPlayer || thrower?.friendly !== false)) {
      let hit = null;
      for (const zone of K.zones) {
        const d = BoxDistance(local, zone);
        if (d >= radius) continue;
        const effective = damage * (1 - d / radius) ** 2;
        const need = zone.kind === "track" ? K.trackMinDamage : K.engineMinDamage;
        if (effective < need) continue;
        if (occluded && occluded(zone)) continue;
        const priority = zone.kind === "track" ? 1 : 2;
        if (!hit || priority > hit.priority || (priority === hit.priority && d < hit.d)) hit = { zone, d, priority, effective };
      }
      if (hit) {
        result.zone = hit.zone.id;
        if (hit.zone.kind === "track" && this.damageState === "Intact") this.SetDamage("MobilityKill", { zone: hit.zone.id, side: hit.zone.side });
        else this.SetDamage("Disabled", { zone: hit.zone.id, side: hit.zone.side ?? 0 });
        result.state = this.damageState;
      }
    }
    // 反应：近炸（不论伤没伤到）。
    const near = Math.hypot(x - this.x, z - this.z) <= R.blastRangeM;
    if (near && this.damageState !== "Disabled" && this.time - this.lastReaction >= R.cooldownS) {
      this.lastReaction = this.time; this.reactions++; result.reaction = true;
      const source = thrower ? { x: thrower.x, z: thrower.z } : { x, z };
      if (this.damageState === "Intact") {
        const want = this.Range(R.reverseMinM, R.reverseMaxM);
        this.reverseGoal = this.ReverseGoal(want, source);
        if (this.reverseGoal != null) this.reverseHoldUntil = this.time + R.cooldownS + 2;
      }
      this.attention = { point: source, until: this.time + R.suppressS + 1.5, kind: "thrower" };
      this.mgSuppress = { point: { x: source.x, y: (y ?? groundY) + 0.4, z: source.z }, until: this.time + R.suppressS, id: "thrower" };
      if (this.mg.phase === "rest") this.mg.until = this.time;
      this.escortMode = { kind: "scatter", until: this.time + R.scatterS, point: source };
      this.Bark({ id: "escortScatter" });
      this.telemetry.reactions.push({ t: this.time, kind: "blast", reverseTo: this.reverseGoal, source });
    }
    return result;
  }
  /** 后倒目标：1.5–3 m，不越过阶段下限，投掷者仍在投掷距离内。 */
  ReverseGoal(want, thrower) {
    const R = this.T.react, D = this.T.drive;
    const floor = Math.max(this.stageFloor, 0);
    let d = Math.min(want, D.reverseMaxM, this.progress - floor);
    if (d <= 0.05) return null;
    const limit = Math.max(R.keepThrowRangeM, Dist(this, thrower));
    const at = (k) => Dist(this.PointAt(this.progress - k), thrower);
    if (at(d) > limit) {
      let lo = 0, hi = d;
      for (let i = 0; i < 20; i++) { const mid = (lo + hi) / 2; if (at(mid) <= limit) lo = mid; else hi = mid; }
      d = lo;
    }
    return d > 0.05 ? this.progress - d : null;
  }
  /** 枪弹打在车体上：关观察窗；每 decoyCooldownS 最多被牵一次注意。 */
  OnBulletHit({ from = null, shooterId = null } = {}) {
    const R = this.T.react;
    if (this.damageState === "Disabled") return { decoy: false };
    const wasOpen = this.time >= this.slitClosedUntil;
    this.slitClosedUntil = this.time + R.slitClosedS;
    if (wasOpen) this.Bark({ id: "visionSlit" });
    if (!from || this.time - this.lastDecoy < R.decoyCooldownS) return { decoy: false };
    this.lastDecoy = this.time;
    this.attention = { point: { x: from.x, z: from.z }, until: this.time + R.decoyLookS, kind: "decoy" };
    if (shooterId) {
      const m = this.memory.get(shooterId);
      if (m) Object.assign(m, { x: from.x, z: from.z, seenAt: this.time });
    }
    this.mgSuppress = { point: { x: from.x, y: from.y ?? 1, z: from.z }, until: this.time + R.suppressS, id: shooterId || "decoy" };
    this.telemetry.reactions.push({ t: this.time, kind: "decoy", source: { x: from.x, z: from.z } });
    return { decoy: true };
  }
  /** 剧本补刀（例如罗班长往打开的舱盖里塞一颗）。 */
  ForceDisable(reason = "scripted") { if (this.damageState !== "Disabled") this.SetDamage("Disabled", { zone: reason, side: 0 }); }
  SetDamage(state, { zone, side = 0 } = {}) {
    const previous = this.damageState;
    if (previous === state || previous === "Disabled") return;
    this.damageState = state;
    if (zone?.startsWith?.("track") && side) this.trackSide = this.trackSide || side;
    if (state === "Disabled" && (zone === "engineDeck" || zone === "engineGrille" || zone === "turretRing")) this.engineKilled = true;
    if (state === "Disabled") {
      this.disabledAt = this.time; this.plan = null; this.phase = "idle"; this.escortsReleased = true;
      this.Event({ id: "stall" }); this.Bark({ id: "tankDisabled" });
    } else this.Bark({ id: "trackCut" });
    this.speed = 0; this.reverseGoal = null;
    this.damageLog.push({ t: this.time, from: previous, to: state, zone, side });
    this.telemetry.states.push([state, this.time]);
  }

  // --- 护兵 -------------------------------------------------------------------
  Escorts(world) {
    const E = this.T.escorts;
    const ids = world.escortIds || [];
    if (this.escortsReleased || this.damageState === "Disabled") return [];
    const f = Forward(this.hullYaw), r = Right(this.hullYaw);
    const mode = this.escortMode && this.time < this.escortMode.until ? this.escortMode : null;
    const holding = !this.moving && this.holdIndex >= 0 && ["firePoint", "hullDown", "block", "squeeze"].includes(this.points[this.holdIndex].kind);
    // 路点自带护兵槽（FRONT_TANK_PATH 的 Block/Squeeze → FRONT_TANK_ESCORT_SLOTS，Space 包量过：都在车北侧/西侧弹坑里、
    // 看不见缺口）：停在这儿时护兵去这几个绝对位置，不按车体相对槽往路边推（那样会有人顺土坎南坡看见缺口）。
    const fixed = holding ? this.points[this.holdIndex].escortSlots : null;
    // 看守位（路点的 escortOverwatch，Data_Tuning_Tank TANK_ESCORT_OVERWATCH）：到了 E.overwatchFromStage（04）车还没开过
    // BendExit（还在路堑、折返顶或北残院后面的路弯里），护兵不再贴着车走，去残院西北土台上的看守位 —— 车身旁那条路从头到尾
    // 对前沿一个点都打不着。03 照旧跟车藏在路堑里（土台对夺下的机枪敞着，03 就上去会被一个个打掉）。车开往 Pressure
    //（下一个路点没有 escortOverwatch）就归队。
    const leg = this.cum.findIndex((c) => c >= this.progress - 0.05);
    const overStage = this.StageRank(world.stage) >= this.StageRank(E.overwatchFromStage);
    const over = !fixed && overStage && leg >= 0 ? this.points[leg].escortOverwatch || null : null;
    const out = [];
    for (const [i, slot] of E.slots.entries()) {
      const id = ids[i];
      if (id == null) continue;
      let lateral = E.lateralM, ahead = slot.ahead, radius = E.moveRadiusM, slack = E.moveSlackM;
      if (holding) { lateral += E.holdPushM; radius = E.holdRadiusM; slack = E.holdSlackM; }
      let anchor = { x: this.x + f.x * ahead + r.x * slot.side * lateral, z: this.z + f.z * ahead + r.z * slot.side * lateral };
      if (mode?.kind === "scatter") {
        lateral += E.scatterPushM; radius = E.scatterRadiusM; slack = E.holdSlackM;
        anchor = { x: this.x + f.x * ahead + r.x * slot.side * lateral, z: this.z + f.z * ahead + r.z * slot.side * lateral };
      } else if (mode?.kind === "rally") {
        // 车长开舱盖喊：往贴身那个人所在的一侧收。
        const toward = { x: mode.point.x - this.x, z: mode.point.z - this.z }, d = Math.hypot(toward.x, toward.z) || 1;
        anchor = { x: this.x + toward.x / d * 3 + r.x * slot.side * 1.5, z: this.z + toward.z / d * 3 + r.z * slot.side * 1.5 };
        radius = E.rallyRadiusM; slack = E.moveSlackM;
      }
      if (over?.[i] && mode?.kind !== "rally") {
        out.push({ id, slot: over[i].id ?? slot.id, anchor: { x: over[i].x, z: over[i].z }, radius: E.slotRadiusM, slack: E.slotSlackM, mode: "overwatch" });
        continue;
      }
      if (fixed?.[i] && mode?.kind !== "rally") {
        out.push({ id, slot: fixed[i].id ?? slot.id, anchor: { x: fixed[i].x, z: fixed[i].z }, radius: E.slotRadiusM, slack: E.slotSlackM, mode: "slot" });
        continue;
      }
      out.push({ id, slot: slot.id, anchor, radius, slack, mode: mode?.kind || (holding ? "hold" : "move") });
    }
    return out;
  }

  // --- 一帧 -------------------------------------------------------------------
  /**
   * @param {number} dt 秒
   * @param {object} world { stage, facts, targets[], Los(a,b,t), Cover(at,from), tankPose:{groundY,muzzle,mg,rearMg},
   *                         weaponsFree:{main,mg}, escortIds[] }
   */
  Update(dt, world = {}) {
    const step = Clamp(Number(dt) || 0, 0, 0.25);
    this.time += step;
    this.fire = []; this.barks = this.queuedBarks; this.events = this.queuedEvents;
    this.queuedBarks = []; this.queuedEvents = []; this.inUpdate = true;
    if (world.tankPose?.groundY != null) this.lastGroundY = world.tankPose.groundY;
    if (world.stage && world.stage !== this.stage) {
      this.stage = world.stage; this.stageFloor = this.progress;
    }
    this.Drive(step, world);
    this.Perceive(world);
    this.Scan(world);
    this.Gunner(step, world);
    this.Guns(step, world);
    const escorts = this.Escorts(world);
    this.inUpdate = false;
    const stop = this.holdIndex >= 0 ? this.points[this.holdIndex] : null;
    return {
      drive: { speed: this.speed, yaw: this.hullYaw, reverse: this.speed < -0.01, x: this.x, z: this.z,
        progress: this.progress, moving: this.moving, pivoting: this.pivoting, load: this.load, rpm: this.rpm,
        pitch: this.hullPitch, accel: this.accel, holdIndex: this.holdIndex, waypoint: stop, reached: this.reached },
      turret: { yaw: this.turretYaw, pitch: this.gunPitch, rate: this.turretRate, cranking: this.cranking, phase: this.phase,
        hatchOpen: this.time < this.hatchOpenUntil },
      fire: this.fire,
      barks: this.barks,
      events: this.events,
      escorts,
      releaseEscorts: this.escortsReleased,
      state: this.damageState,
      target: this.targetId,
      rays: this.raysLastTick,
    };
  }
  /** 取证快照（探针 / 调试面板）。 */
  Debug() {
    return {
      time: this.time, x: this.x, z: this.z, progress: this.progress, speed: this.speed, hullYaw: this.hullYaw,
      turretYaw: this.turretYaw, gunPitch: this.gunPitch, phase: this.phase, target: this.targetId,
      holdIndex: this.holdIndex, reached: this.reached, state: this.damageState, reactions: this.reactions,
      shots: this.telemetry.shots.length, bursts: this.telemetry.bursts.length, stageFloor: this.stageFloor,
      damageLog: this.damageLog.slice(), attention: this.attention, deadZone: this.deadZone,
    };
  }
}
