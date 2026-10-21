// 人物战场反应测试场的运行时（?reactions=1）：在人身边按「弹种 × 距离 × 方位」引爆，看第一人称近爆反应、听耳朵受损。
//
// 纪律：
//   · 爆炸一律走生产链：嵌一个 embedded 的 ShellImpactRange 借它的投送（炮弹 FireShell、手榴弹 / 炸弹 Combat.Blast，explosiveId 传对），
//     扬尘、弹坑、震屏、身体反应、耳朵全是正式那一条链自己出的，这里不画、不放、不叠任何反馈。
//   · 落点按「人此刻的位置与朝向」算（Data_BattleReactionRange.ReactionPoint），人走到哪就炸在哪附近。
//   · 每一发的读数（峰值超压 / dB / 两只耳朵 / 各反应强度）取 Combat 的 exposureLog，按落点对回这一发。
//   · 面板开关：人物反应（player.SetBlastReaction）、耳朵模型（audio.SetEarModel：trauma 新 / legacy 旧）、扬尘新旧、落点标记。
// 玩家可见文字一律走 T("battleReaction.…")（Data_Text_BattleReaction.mjs）；没有 Math.random（随机方位与连续炮击用 Mulberry32）。
import { T } from "./Script_Text.mjs";
import { Mulberry32 } from "./Script_Noise.mjs";
import { ShellImpactRange } from "./Script_ShellImpactRange.mjs";
import { BattleReactionLab } from "./Script_BattleReactionLab.mjs";
import {
  BATTLE_REACTION_STANDS, BATTLE_REACTION_DEFAULT_STAND, BATTLE_REACTION_DISTANCES, BATTLE_REACTION_DEFAULT_DISTANCE,
  BATTLE_REACTION_BEARINGS, BATTLE_REACTION_DEFAULT_BEARING, BATTLE_REACTION_MUNITION_SPECS, BATTLE_REACTION_DEFAULT_MUNITION,
  BATTLE_REACTION_BARRAGE, BATTLE_REACTION_TIME_SCALES, ReactionPoint,
} from "./Data_BattleReactionRange.mjs";

const RAD = 180 / Math.PI;

export class BattleReactionRange {
  /**
   * host：装配层交进来的既有对象（同 ShellImpactRange）：
   *   battlefield / combat / player / camera / scene / library / vfx / audio / hud / canvas
   *   CanUse() / Focus() / SetViewmodelHidden()
   */
  constructor(host) {
    this.host = host;
    this.impact = new ShellImpactRange(host, { embedded: true });
    this.random = Mulberry32(BATTLE_REACTION_BARRAGE.seed);
    this.munitionId = BATTLE_REACTION_DEFAULT_MUNITION;
    this.distanceM = BATTLE_REACTION_DEFAULT_DISTANCE;
    this.bearingId = BATTLE_REACTION_DEFAULT_BEARING;
    this.standId = BATTLE_REACTION_DEFAULT_STAND;
    this.reaction = true;
    this.earModel = "trauma";
    this.clock = 0;
    this.realDt = 1 / 60;
    this.paintAccum = 0;
    this.serial = 0;
    this.records = [];
    this.queue = [];
    this.last = null;
    this.peak = null;
    this.impact.SelectMunition(this.munitionId);
    this.ApplyToggles();
    this.lab = new BattleReactionLab(this);
    this.api = {
      Fire: (munitionId, options) => this.Fire(munitionId, options),
      Barrage: (options) => this.Barrage(options),
      Clear: () => this.Clear(),
      Stand: (id) => this.Stand(id),
      SetMunition: (id) => this.SetMunition(id),
      SetDistance: (m) => this.SetDistance(m),
      SetBearing: (id) => this.SetBearing(id),
      SetReaction: (on) => this.SetReaction(on),
      SetEarModel: (model) => this.SetEarModel(model),
      SetDust: (on) => this.impact.SetDust(on),
      ShowMarker: (on) => { const v = this.impact.ShowMarker(on); this.Paint(); return v; },
      ShowPanel: (on) => this.ShowPanel(on),
      SetTimeScale: (s) => this.SetTimeScale(s),
      Plan: (options) => this.Plan(options),
      State: () => this.State(),
      Flinch: () => this.host.player?.flinch?.State?.() || null,
      Ears: () => this.host.audio?.EarState?.() || null,
    };
    this.UpdateMarker();
    this.Paint();
  }

  // -------------------------------------------------------------------------
  // 选择
  // -------------------------------------------------------------------------

  Munition(id) { return BATTLE_REACTION_MUNITION_SPECS.find((spec) => spec.id === id) || null; }

  SetMunition(id) {
    if (!this.Munition(id)) return null;
    this.munitionId = id;
    this.impact.SelectMunition(id);
    this.UpdateMarker();
    this.Paint();
    return id;
  }

  SetDistance(m) {
    const value = Number(m);
    if (!(value > 0)) return this.distanceM;
    this.distanceM = value;
    this.UpdateMarker();
    this.Paint();
    return this.distanceM;
  }

  SetBearing(id) {
    if (!BATTLE_REACTION_BEARINGS.some((entry) => entry.id === id)) return this.bearingId;
    this.bearingId = id;
    this.UpdateMarker();
    this.Paint();
    return this.bearingId;
  }

  /** 方位 id / 度数 → 度数（random 现掷一个）。 */
  BearingDeg(bearing = this.bearingId) {
    if (Number.isFinite(bearing)) return bearing;
    const entry = BATTLE_REACTION_BEARINGS.find((candidate) => candidate.id === bearing);
    if (!entry || entry.deg == null) return Math.round(this.random() * 360 - 180);
    return entry.deg;
  }

  /** 按此刻的人与所选（或给定的）距离 / 方位算落点。random 时给一个代表方向（正右）只用来摆标记。 */
  Plan({ distanceM = this.distanceM, bearing = this.bearingId, preview = false } = {}) {
    const player = this.host.player;
    const deg = preview && bearing === "random" ? null : this.BearingDeg(bearing);
    const point = ReactionPoint(player.position, player.yaw, deg ?? 90, distanceM);
    return { x: point.x, z: point.z, bearingDeg: deg, distanceM };
  }

  UpdateMarker() {
    const plan = this.Plan({ preview: true });
    this.impact.SetTarget({ x: plan.x, z: plan.z }, { quiet: true });
    // 随机方位时不给人一个误导的落点（标记只表示「这个距离」）。
    if (this.impact.marker) this.impact.marker.visible = this.impact.markerShown && this.bearingId !== "random";
  }

  // -------------------------------------------------------------------------
  // 引爆
  // -------------------------------------------------------------------------

  /** 在人身边引爆一发。options：{ distanceM, bearing（id 或度数）}，不给用面板所选。返回这一发的记录。 */
  Fire(munitionId = this.munitionId, options = {}) {
    const spec = this.Munition(munitionId) || this.Munition(this.munitionId);
    if (!spec) return null;
    const plan = this.Plan({ distanceM: options.distanceM ?? this.distanceM, bearing: options.bearing ?? this.bearingId });
    const shot = this.impact.Fire(spec.id, { x: plan.x, z: plan.z }, { quiet: true });
    if (!shot) return null;
    const player = this.host.player;
    const record = {
      id: ++this.serial, shot: shot.id, munition: spec.id, distanceM: plan.distanceM, bearingDeg: plan.bearingDeg,
      stand: this.standId, at: [plan.x, shot.target[1], plan.z], firedAt: this.clock,
      player: [player.position.x, player.position.y, player.position.z], yawDeg: player.yaw * RAD,
      exposure: null, reaction: this.reaction, earModel: this.earModel,
    };
    this.records.push(record);
    if (this.records.length > 40) this.records.shift();
    this.last = record;
    if (!options.quiet) this.host.hud?.Hint?.(T("battleReaction.hint.fired", { name: T(`shellImpact.munition.${spec.id}`), m: plan.distanceM }), 2);
    this.Paint();
    return { ...record };
  }

  /** 连续炮击：count 发、间隔随机、距离与方位随机（人走动时照样围着人炸）。第一发立刻出。 */
  Barrage({ count = BATTLE_REACTION_BARRAGE.count, munitionId = this.munitionId } = {}) {
    const B = BATTLE_REACTION_BARRAGE;
    let at = this.clock;
    for (let i = 0; i < count; i += 1) {
      const distanceM = Math.round(B.minM + (B.maxM - B.minM) * Math.pow(this.random(), 1.3));
      const bearing = Math.round(this.random() * 360 - 180);
      this.queue.push({ at, munitionId, distanceM, bearing });
      at += B.intervalMinS + (B.intervalMaxS - B.intervalMinS) * this.random();
    }
    this.queue.sort((a, b) => a.at - b.at);
    this.UpdateQueue();
    this.host.hud?.Hint?.(T("battleReaction.hint.barrage", { count }), 2);
    this.Paint();
    return { count, queued: this.queue.length };
  }

  UpdateQueue() {
    while (this.queue.length && this.queue[0].at <= this.clock) {
      const next = this.queue.shift();
      this.Fire(next.munitionId, { distanceM: next.distanceM, bearing: next.bearing, quiet: true });
    }
  }

  /** 清空：在途的弹、排队的连续炮击、弹坑、扬尘；人的反应与耳朵一起复位。 */
  Clear() {
    this.queue.length = 0;
    this.impact.Clear();
    this.host.player?.flinch?.Reset?.();
    this.host.audio?.ResetDeafen?.();
    this.records.length = 0; this.last = null; this.peak = null;
    this.host.hud?.Hint?.(T("battleReaction.hint.cleared"), 2);
    this.Paint();
    return this.State();
  }

  // -------------------------------------------------------------------------
  // 站位 / 开关 / 时间
  // -------------------------------------------------------------------------

  Stand(id) {
    const stand = BATTLE_REACTION_STANDS.find((entry) => entry.id === id);
    if (!stand) return null;
    this.standId = stand.id;
    this.host.player.Spawn(stand.x, stand.z, stand.ry);
    this.UpdateMarker();
    this.Paint();
    return { id: stand.id, position: this.host.player.position.toArray() };
  }

  SetReaction(on = !this.reaction) {
    this.reaction = !!on;
    this.ApplyToggles();
    this.Paint();
    return this.reaction;
  }

  SetEarModel(model) {
    this.earModel = model === "legacy" ? "legacy" : "trauma";
    this.ApplyToggles();
    this.Paint();
    return this.earModel;
  }

  ApplyToggles() {
    this.host.player?.SetBlastReaction?.(this.reaction);
    this.host.audio?.SetEarModel?.(this.earModel);
  }

  SetTimeScale(scale) {
    if (!BATTLE_REACTION_TIME_SCALES.includes(Number(scale))) return this.impact.timeScale;
    this.impact.flightFast = true;
    const value = this.impact.SetTimeScale(Number(scale));
    this.Paint();
    return value;
  }

  /** Script_Main.Frame 的第一件事：慢放（飞行中照旧用 1×，落地后用所选倍速 —— 看反应用）。 */
  ScaleDt(realDt) {
    this.realDt = realDt;
    return this.impact.ScaleDt(realDt);
  }

  CapturesInput() { return false; }
  ApplyCamera() { return false; }

  ShowPanel(on = !this.panelShown) {
    this.panelShown = !!on;
    this.Paint();
    return this.panelShown;
  }

  // -------------------------------------------------------------------------
  // 每帧
  // -------------------------------------------------------------------------

  /** 在 combat.Update 之后调；dt 是 ScaleDt 之后的仿真时长。 */
  Update(dt) {
    this.clock += dt;
    this.impact.Update(dt);
    this.UpdateQueue();
    this.MatchExposures();
    this.TrackPeak();
    this.paintAccum += this.realDt;
    if (this.paintAccum >= 0.1) {
      this.paintAccum = 0;
      this.UpdateMarker();
      this.Paint();
    }
  }

  /** 把 Combat 记下的每一次爆炸读数按落点对回这一发。 */
  MatchExposures() {
    const log = this.host.combat?.exposureLog;
    if (!log?.length) return;
    for (const record of this.records) {
      if (record.exposure) continue;
      const shot = this.impact.records.find((entry) => entry.id === record.shot);
      if (!shot?.impact) continue;
      const hit = log.find((entry) => entry.position && !entry.claimed
        && Math.hypot(entry.position[0] - shot.impact[0], entry.position[2] - shot.impact[2]) < 0.8);
      if (!hit) continue;
      hit.claimed = true;
      record.exposure = this.Exposure(hit);
      record.impact = [...shot.impact];
    }
  }

  Exposure(e) {
    const r = (v, k = 100) => Math.round(v * k) / k;
    return {
      distanceM: r(e.distanceM, 10), chargeKg: e.chargeKg, kPa: r(e.kPa, 10), db: r(e.db, 10),
      dbLeft: r(e.dbLeft, 10), dbRight: r(e.dbRight, 10), occluded: e.occluded,
      blink: r(e.blink), flinch: r(e.flinch), squeeze: r(e.squeeze), daze: r(e.daze), tremor: r(e.tremor),
      tinnitusLeft: r(e.tinnitusLeft), tinnitusRight: r(e.tinnitusRight),
      lateral: r(e.lateral), forward: r(e.forward), up: r(e.up),
    };
  }

  /** 上一发之后各通道的峰值（面板读数用：反应是在几帧里一闪而过的）。 */
  TrackPeak() {
    const fl = this.host.player?.flinch;
    if (!fl) return;
    if (this.last && (!this.peak || this.peak.id !== this.last.id)) this.peak = { id: this.last.id, yaw: 0, pitch: 0, roll: 0, drop: 0, eye: 0, daze: 0, tremor: 0 };
    const p = this.peak;
    if (!p) return;
    p.yaw = Math.max(p.yaw, Math.abs(fl.yaw) * RAD);
    p.pitch = Math.max(p.pitch, Math.abs(fl.pitch) * RAD);
    p.roll = Math.max(p.roll, Math.abs(fl.roll) * RAD);
    p.drop = Math.max(p.drop, fl.dropM * 100);
    p.eye = Math.max(p.eye, fl.eyeClosure);
    p.daze = Math.max(p.daze, fl.daze.focus);
    p.tremor = Math.max(p.tremor, fl.tremor);
  }

  // -------------------------------------------------------------------------
  // 读数
  // -------------------------------------------------------------------------

  State() {
    const player = this.host.player;
    const flinch = player?.flinch?.State?.() || null;
    return {
      munition: this.munitionId, distanceM: this.distanceM, bearing: this.bearingId, stand: this.standId,
      reaction: this.reaction, earModel: this.earModel, dust: this.impact.dustNew, marker: this.impact.markerShown,
      panel: this.panelShown !== false, timeScale: this.impact.timeScale, paused: this.impact.paused, clock: this.clock,
      player: player ? { position: player.position.toArray(), yawDeg: player.yaw * RAD } : null,
      inFlight: this.impact.InFlight(), flying: (this.host.combat?.shells?.length || 0) + (this.impact.bombs?.length || 0),
      queued: this.queue.length, shots: this.serial,
      last: this.last ? { ...this.last } : null, peak: this.peak ? { ...this.peak } : null,
      records: this.records.map((record) => ({ ...record })),
      flinch, ears: this.host.audio?.EarState?.() || null,
      timeScales: [...BATTLE_REACTION_TIME_SCALES], distances: [...BATTLE_REACTION_DISTANCES],
    };
  }

  Paint() { this.lab?.Update(this.State()); }

  Dispose() {
    this.queue.length = 0;
    this.lab?.Dispose(); this.lab = null;
    this.impact?.Dispose(); this.impact = null;
    this.host.player?.SetBlastReaction?.(false);
    this.host.audio?.SetEarModel?.("legacy");
  }
}

export default BattleReactionRange;
