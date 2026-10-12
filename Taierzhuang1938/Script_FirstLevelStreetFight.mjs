// ===========================================================================
// Script_FirstLevelStreetFight.mjs —— 第一关 08–11 耿家庄巷战的纯规则（2026-10-12 03–11 重构 C 包）
//
// 口径：docs/Data_FirstLevel0311Refactor20261012Contract.md §1.7 / §3.6–3.9 / §5.1；改稿「08 主街口 / 09 穿屋 / 10 守巷口」。
//
//   08 主街是杀伤区：东巷来的 4 人（streetPush）从玩家看见街堵了起逐个放出，贴东墙根往北压向担架墙；
//      **推进点**：玩家跨进灶屋北门或西侧夹道（sideRouteEntered）之后街口不再补人（已出来的照打）。
//   09 两条侧路汇到后院：西侧夹道走到一半（≥ 8 m）机枪屋侧门里那个窜出来（alleyPop）；后院屋顶上那个
//      在玩家进后院 6 s 后投弹，妮儿先一步拍车板指他（他已死就都不发生）。
//   10 守巷口只看东边：院门真开了之后第二拨（含草垛机枪）逐个放出，整段 ≤ 90 s 不再补人；
//      担架只在机枪被压住（压住 ≥ 2 s，会再抬头）或射手死了的时候过门；驴车堵门 / 推车过门槛的 10 s 窗口。
//   人口：村落同时存活日军 ≤ 14（契约 §4）—— 放人前先数活人。
//
// 零 three、零场景、零事实表：每帧 Update(dt, s) 喂现场，返回这一帧新发生的事件名；副作用（生人、记事实、
// 喊 cue、摆老耿 / 驴车、投弹）全在 Script_FirstLevelVillageBlock。Script_FirstLevelStreetFightTest 逐帧喂现场对账。
// 玩家可见中文一律不进这里（Script_TextTest 闸门模块）。
// ===========================================================================
import { MID_TUNING as M } from "./Data_Tuning_FirstLevelMid.mjs";

/** 点在轴对齐矩形里（含边）。 */
export function InBox(p, box) {
  return !!p && !!box && p.x >= box.minX && p.x <= box.maxX && p.z >= box.minZ && p.z <= box.maxZ;
}

/**
 * 夹道里走了多远：从进来的那一头量。north = 从北口进（里程 = z − minZ），south = 从后院那一头进（里程 = maxZ − z）。
 * 纯几何。
 */
export function AlleyDepth(p, box, enteredFrom) {
  if (!InBox(p, box)) return 0;
  return enteredFrom === "south" ? box.maxZ - p.z : p.z - box.minZ;
}

/**
 * 投弹初速与 power：Combat.Throw 的抛物线（竖直分量 = 初速 × arcLift，水平 = 初速），出手点比落点高 dropM 时
 * 落地时间 t = (vy + sqrt(vy² + 2 g dropM)) / g，射程 = v × t。按射程反解初速（二分），再折成 [0,1] 的 power。
 * 纯函数（Script_FirstLevelStreetFightTest 对账）。
 */
export function ThrowPowerFor(rangeM, dropM = 0, T = M.streetFight) {
  const [vMin, vMax] = T.throwSpeedRange, g = T.throwGravity, k = T.throwArcLift;
  const Range = (v) => { const vy = v * k; return v * (vy + Math.sqrt(vy * vy + 2 * g * Math.max(0, dropM))) / g; };
  let lo = vMin, hi = vMax;
  if (rangeM <= Range(lo)) return { speed: lo, power: 0, rangeM: Range(lo) };
  if (rangeM >= Range(hi)) return { speed: hi, power: 1, rangeM: Range(hi) };
  for (let i = 0; i < 40; i++) { const mid = (lo + hi) / 2; if (Range(mid) < rangeM) lo = mid; else hi = mid; }
  const speed = (lo + hi) / 2;
  return { speed, power: (speed - vMin) / (vMax - vMin), rangeM: Range(speed) };
}

/**
 * 纯规则。每帧 Update(dt, s) 喂现场：
 *   s.stage            当前内部步骤 id（Village / Melee / Courtyard / TransferApproach …）
 *   s.streetSeen       streetBlockSeen 落了
 *   s.kitchenEntered   玩家进过灶屋
 *   s.player           { x, z }
 *   s.aliveVillage     村落里此刻活着的日军数（含装睡的）
 *   s.pushSpawned      streetPush 已放出的人数（副作用层回报）
 *   s.alleyPop         { present, alive }（AlleyPop 生出来了没、活着没）
 *   s.roof             { present, alive }（RoofThrower）
 *   s.gateOpen         courtyardGateOpen 落了
 *   s.laneSpawned      laneWave2 已放出的人数
 *   s.gunner           { present, alive, suppressed }（LaneGunner）
 *   s.cartAtThreshold  驴车停在门槛上等人推
 *   s.cartPushed       玩家按了 F 推车
 * 返回事件名数组：
 *   spawnPusher / pushStopped / westAlleyEntered / sideRouteEntered / alleyPop / yardEntered / roofSpot / roofThrow / roofDown
 *   spawnLane / laneSpent / laneSuppressed / laneRaised / cartHelp
 */
export class StreetFightRules {
  constructor(tuning = M.streetFight, boxes = {}) {
    this.T = tuning;
    this.alley = boxes.alley || null;
    this.yard = boxes.yard || tuning.yardBox;
    this.time = 0;
    // 08
    this.streetSeenAt = null;
    this.pushIndex = 0;                 // 下一个要放的 streetPush 下标
    this.pushStopped = false;
    this.sideRouteEntered = false;
    this.westAlleyEntered = false;
    this.alleyEnteredFrom = null;       // "north" | "south"
    // 09
    this.alleyPopped = false;
    this.yardEnteredAt = null;
    this.roofSpotted = false;
    this.roofThrown = false;
    this.roofDown = false;
    // 10
    this.gateOpenAt = null;
    this.laneIndex = 0;
    this.laneSpent = false;
    this.laneSuppressed = false;        // 此刻担架能不能过门（含抬头后的收尾余量）
    this.laneSuppressedEver = false;    // 事实 laneMgSuppressed（第一次压住）
    this.suppressedSince = null;
    this.regraceUntil = null;
    this.cartThresholdAt = null;
    this.cartHelpAsked = false;
    this.events = [];
  }
  Fire(out, name, detail) {
    out.push(name);
    this.events.push({ name, t: +this.time.toFixed(2), ...(detail || {}) });
    if (this.events.length > 48) this.events.shift();
  }
  /** 村落人口预算：还能不能再放一个（契约 §4：同时存活 ≤ villageAliveMax）。 */
  MaySpawn(aliveVillage) { return (aliveVillage || 0) < this.T.villageAliveMax; }
  /** 担架能不能过院门（10）：机枪没来 / 死了 = 能；活着 = 只在压住期间。 */
  LaneOpen() { return this.laneSuppressed; }

  Update(dt, s = {}) {
    this.time += Math.max(0, dt || 0);
    const T = this.T, out = [];
    const stage = s.stage;
    // --- 08 东巷来人：逐个放，跨进侧路就停 -------------------------------------
    if (s.streetSeen && this.streetSeenAt == null) this.streetSeenAt = this.time;
    if (!this.sideRouteEntered) {
      // 西侧夹道：从北口或后院那一头跨进去都算；记下从哪头进的（AlleyDepth 用）。
      if (this.alley && InBox(s.player, this.alley)) {
        if (!this.westAlleyEntered) {
          this.westAlleyEntered = true;
          this.alleyEnteredFrom = s.player.z > (this.alley.minZ + this.alley.maxZ) / 2 ? "south" : "north";
          this.Fire(out, "westAlleyEntered", { from: this.alleyEnteredFrom });
        }
      }
      if (s.kitchenEntered || this.westAlleyEntered) { this.sideRouteEntered = true; this.Fire(out, "sideRouteEntered"); }
    } else if (this.alley && !this.westAlleyEntered && InBox(s.player, this.alley)) {
      // 先走了灶屋、后来又绕进夹道：照记（AlleyPop 还是会窜出来）。
      this.westAlleyEntered = true;
      this.alleyEnteredFrom = s.player.z > (this.alley.minZ + this.alley.maxZ) / 2 ? "south" : "north";
      this.Fire(out, "westAlleyEntered", { from: this.alleyEnteredFrom });
    }
    if (this.sideRouteEntered && !this.pushStopped) { this.pushStopped = true; this.Fire(out, "pushStopped", { spawned: this.pushIndex }); }
    if (this.streetSeenAt != null && !this.pushStopped && this.pushIndex < T.pushGapsS.length
      && this.time - this.streetSeenAt >= T.pushGapsS[this.pushIndex] && this.MaySpawn(s.aliveVillage)) {
      this.Fire(out, "spawnPusher", { index: this.pushIndex });
      this.pushIndex++;
    }
    // --- 09 夹道：走到一半窜出来 ------------------------------------------------
    if (this.westAlleyEntered && !this.alleyPopped && s.alleyPop?.present && s.alleyPop.alive !== false
      && AlleyDepth(s.player, this.alley, this.alleyEnteredFrom) >= T.alleyPopDepthM) {
      this.alleyPopped = true; this.Fire(out, "alleyPop");
    }
    // --- 09 后院：进院计时 → 妮儿指 → 投弹；先打死就什么都不发生 -------------------
    if (s.roof?.present && s.roof.alive === false && !this.roofDown) { this.roofDown = true; this.Fire(out, "roofDown"); }
    if (this.yardEnteredAt == null && ["Melee", "Courtyard"].includes(stage) && InBox(s.player, this.yard)) {
      this.yardEnteredAt = this.time; this.Fire(out, "yardEntered");
    }
    if (this.yardEnteredAt != null && !this.roofDown && s.roof?.present && s.roof.alive) {
      const since = this.time - this.yardEnteredAt;
      if (!this.roofSpotted && since >= T.roofSpotDelayS) { this.roofSpotted = true; this.Fire(out, "roofSpot"); }
      if (!this.roofThrown && since >= T.roofThrowDelayS) { this.roofThrown = true; this.Fire(out, "roofThrow"); }
    }
    // --- 10 巷口第二拨与担架放行门 ---------------------------------------------
    if (s.gateOpen && this.gateOpenAt == null) this.gateOpenAt = this.time;
    if (this.gateOpenAt != null) {
      const since = this.time - this.gateOpenAt;
      if (!this.laneSpent && since >= T.laneWaveCapS) { this.laneSpent = true; this.Fire(out, "laneSpent", { spawned: this.laneIndex }); }
      if (!this.laneSpent && this.laneIndex < T.laneWaveGapsS.length && since >= T.laneWaveGapsS[this.laneIndex]
        && this.MaySpawn(s.aliveVillage)) {
        this.Fire(out, "spawnLane", { index: this.laneIndex });
        this.laneIndex++;
      }
    }
    const gunner = s.gunner || { present: false, alive: false, suppressed: false };
    if (!gunner.present || !gunner.alive) {
      // 机枪还没来 / 死了：门是开的。死了算「压住」（第一次成立记事实）。
      if (!this.laneSuppressed) { this.laneSuppressed = true; if (gunner.present) this.Fire(out, "laneSuppressed", { dead: true }); }
      if (gunner.present && !gunner.alive) this.laneSuppressedEver = true;
      this.suppressedSince = null; this.regraceUntil = null;
    } else if (gunner.suppressed) {
      this.suppressedSince ??= this.time;
      if (this.time - this.suppressedSince >= T.laneMgSuppressS) {
        if (!this.laneSuppressed) this.Fire(out, "laneSuppressed", { dead: false });
        this.laneSuppressed = true; this.laneSuppressedEver = true; this.regraceUntil = null;
      }
    } else {
      this.suppressedSince = null;
      if (this.laneSuppressed && this.regraceUntil == null) this.regraceUntil = this.time + T.laneMgRegraceS;
      if (this.laneSuppressed && this.regraceUntil != null && this.time >= this.regraceUntil) {
        this.laneSuppressed = false; this.regraceUntil = null; this.Fire(out, "laneRaised");
      }
    }
    // --- 10 推车过门槛：10 s 没人推，何有田去推 -----------------------------------
    if (s.cartAtThreshold && this.cartThresholdAt == null) this.cartThresholdAt = this.time;
    if (this.cartThresholdAt != null && !this.cartHelpAsked && !s.cartPushed && this.time - this.cartThresholdAt >= T.cartPushWindowS) {
      this.cartHelpAsked = true; this.Fire(out, "cartHelp");
    }
    return out;
  }

  State() {
    return {
      time: +this.time.toFixed(2),
      push: { seenAt: this.streetSeenAt, spawned: this.pushIndex, stopped: this.pushStopped },
      sideRouteEntered: this.sideRouteEntered, westAlleyEntered: this.westAlleyEntered, alleyEnteredFrom: this.alleyEnteredFrom,
      alleyPopped: this.alleyPopped,
      yard: { enteredAt: this.yardEnteredAt, roofSpotted: this.roofSpotted, roofThrown: this.roofThrown, roofDown: this.roofDown },
      lane: { openAt: this.gateOpenAt, spawned: this.laneIndex, spent: this.laneSpent, open: this.laneSuppressed,
        suppressedEver: this.laneSuppressedEver,
        suppressedFor: this.suppressedSince == null ? 0 : +(this.time - this.suppressedSince).toFixed(2) },
      cart: { thresholdAt: this.cartThresholdAt, helpAsked: this.cartHelpAsked },
      events: this.events.slice(-24),
    };
  }
}
