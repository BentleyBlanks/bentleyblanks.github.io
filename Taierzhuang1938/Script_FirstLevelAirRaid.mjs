// Script_FirstLevelAirRaid.mjs — 第一关 01–06 中远处的日机轮番轰炸（2026-09-26）。
//
// 从 01 先头兵经过洞口（FrontPass）起，一轮接一轮：三架（或两架）日机从北、东北进场，
// 直线飞过一块中远处的落区（离听者 170–470 m，我方两翼阵地与后方），每架投一串炸弹，
// 落地是火球 + 土柱，声音按距离后到、滚成一片闷雷，脚下跟着一记轻震；飞机离场后隔十几二十秒下一轮。
//
// 一轮的时间线（t 从进场起算，tc = 长机飞到落区中心的时刻 = approachM / speed）：
//   0            引擎声起（一条，挂在长机上，逐帧搬位置 + 多普勒）
//   tImpact − fall  第 j 架第 k 颗离机（fall = √(2h/g)），画面上一颗黑点带着前进速度往下掉
//   tImpact      落地：画面先到；爆炸声由引擎按 d/340 延迟；震屏、洞顶掉土跟着声音到
//   (approachM + exitM) / speed  离场，编队收起，引擎声淡出
//
// **纯氛围层**：不伤人、不改地形、不记任务事实；落点离活人与战车 bombClearM 以外。
// **纯规则，不 import three**：宿主把世界能力用函数交进来（地面、听者、空间档、画面、震屏、避人、
// 共享声部、编队与炸弹的摆位），测试用假宿主直接跑。随机走 Mulberry32，逐轮可复现。
// 数全在 Data_FirstLevelAirRaid；挂在 Script_FirstLevelMissionBattleSound 下，与前线床、
// 场外炮击共用 sharedMaxVoices 那一本声部账。

import { Mulberry32, Clamp01 } from "./Script_Noise.mjs";
import { FIRST_LEVEL_AIR_RAID } from "./Data_FirstLevelAirRaid.mjs";

const DEG = Math.PI / 180;

export class FirstLevelAirRaid {
  /**
   * @param {object} host
   * @param {object}   host.audio          AudioEngine（Play / MoveVoice / StopVoice / pendingVoices / listenerPos）
   * @param {function} [host.Listener]     () → {x,y,z}（缺省读 audio.listenerPos）
   * @param {function} [host.Ground]       (x, z) → 地面高度
   * @param {function} [host.Zone]         () → 听者空间档（"trench" / "dugout" / …）
   * @param {function} [host.Visual]       (at, radius, d, column) → 落地那一团画面（column：要不要土柱）；返回烟源句柄（可空）
   * @param {function} [host.RemoveVisual] (handle) → 撤掉土柱烟源
   * @param {function} [host.Shake]        (trauma) → 往创伤桶里加
   * @param {function} [host.Blocked]      (at, clearM) → true 表示这里有人 / 有车
   * @param {function} [host.SharedRoom]   (n) → 与前线、炮击合计还放得下 n 条吗
   * @param {function} [host.Formation]    (poses) → 编队摆位（空数组 = 收起）
   * @param {function} [host.Bombs]        (list) → 在空中的炸弹摆位（空数组 = 收起）
   * @param {number}   [seed]
   * @param {object}   [data]              默认 FIRST_LEVEL_AIR_RAID；测试可注入
   */
  constructor(host, seed = 0x19380926, data = FIRST_LEVEL_AIR_RAID) {
    this.host = host;
    this.D = data;
    this.rng = Mulberry32(seed >>> 0);
    this.time = 0;
    this.started = false;
    this.startedAt = null;
    this.nextAt = null;
    this.deferred = 0;
    this.stage = null;
    this.stageAt = 0;
    this.wave = null;
    this.waveIndex = 0;
    this.pending = [];          // 排了时刻还没发生的动作：{ at, kind, … }
    this.voices = [];
    this.columns = [];          // 土柱烟源：{ handle, until }
    this.shakes = [];           // 最近 windowS 秒里加过的震：{ at, trauma }
    this.lastSoundAt = -Infinity;
    this.speaking = false;
    this.airCut = 0;
    this.zoneOverride = null;
    // 取证
    this.waves = 0;
    this.bombsDropped = 0;
    this.impacts = 0;
    this.sounds = 0;
    this.layersDropped = 0;
    this.skipped = 0;
    this.peakVoices = 0;
    this.events = [];
  }

  R(min, max) { return min + (max - min) * this.rng(); }

  Listener() {
    const L = this.host.Listener?.() || this.host.audio?.listenerPos;
    return L ? { x: L.x, y: L.y, z: L.z } : null;
  }

  /** 本层真在响的声部（引擎声算一条）。 */
  Active() { return this.voices.length + (this.wave?.drone ? 1 : 0); }

  /** 落弹窗口（第一颗落地前 reserveLeadS 到最后一颗落地后 reserveTailS）里吗。 */
  Reserving() {
    const w = this.wave, A = this.D.audio;
    return !!w && w.t >= w.firstImpact - A.reserveLeadS && w.t <= w.lastImpact + A.reserveTailS;
  }

  /**
   * 给别人看的占位：落弹窗口里按 reserveVoices 留着（与场外炮击的啸声留位同一个意思）——
   * 前线床从落弹前几秒就不再起新声，一串十几颗落地时共享声部账里有这一串的位置。
   * 2026-09-26 实机取证（04）：不留位时共享的 8 条常被前线床占满，一串 12 颗只响出 2 声。
   */
  Busy() {
    const own = this.voices.length;
    return Math.max(own, this.Reserving() ? this.D.audio.reserveVoices : 0) + (this.wave?.drone ? 1 : 0);
  }

  /** 自己要放一条：本层上限按真在响的数；共享账由宿主按「别人 + 本层真在响」算（自己的留位不挡自己）。 */
  Room(n = 1) {
    if (this.Active() + n > this.D.audio.maxVoices) return false;
    return this.host.SharedRoom ? this.host.SharedRoom(n) !== false : true;
  }

  StageProfile(stage) { return (stage && this.D.stages[stage]) || null; }

  /**
   * 每帧一次。
   * @param {number} dt
   * @param {string|null} stage  当前内部步骤 id
   * @param {object} [ctx]
   * @param {boolean} [ctx.started]   起点到了没有（01 走到 FrontPass；02 以后恒真）
   * @param {boolean} [ctx.speaking]  正在播对白
   * @param {boolean} [ctx.scripted]  有别的脚本飞机在天上（03 开头的横飞），先不起新的一轮
   */
  Update(dt, stage, { started = false, speaking = false, scripted = false } = {}) {
    this.time += Math.max(0, dt);
    this.speaking = !!speaking;
    const now = this.time;
    this.voices = this.voices.filter((e) => now < e.until && this.host.audio?.pendingVoices?.has?.(e.v) !== false);
    this.UpdateColumns();
    const P = this.StageProfile(stage);
    if (stage !== this.stage) {
      this.stage = stage;
      this.stageAt = now;
      if (P?.holdS && this.nextAt !== null) this.nextAt = Math.max(this.nextAt, now + P.holdS);
    }
    this.airCut = P?.airCut || 0;
    this.zoneOverride = P?.listenerZone || null;
    if (P && started && !this.started) {
      this.started = true;
      this.startedAt = now;
      this.nextAt = now + this.D.firstAfterS;
      if (P.holdS) this.nextAt = Math.max(this.nextAt, this.stageAt + P.holdS);
    }
    if (this.wave) this.UpdateWave(dt);
    this.RunPending();
    // 07 以后（或还没到起点）不起新的一轮；已经在天上的那一轮照常飞完。
    if (!P || !this.started || this.wave || this.nextAt === null || now < this.nextAt) return;
    if (scripted) { this.nextAt = now + 1; return; }
    if (speaking && this.deferred < this.D.speechDeferS) {
      this.deferred += this.D.speechStepS;
      this.nextAt = now + this.D.speechStepS;
      return;
    }
    this.deferred = 0;
    if (!this.StartWave()) { this.skipped += 1; this.nextAt = now + this.D.retryS; }
  }

  // ===========================================================================
  // 一轮
  // ===========================================================================

  /** 挑落区与航向，把整轮（每架的航迹、每颗炸弹的离机 / 落地时刻与位置）一次排好。 */
  StartWave() {
    const D = this.D;
    const L = this.Listener();
    if (!L) return false;
    const key = D.order[this.waveIndex % D.order.length];
    const F = D.formations[key];
    if (!F) return false;
    for (let attempt = 0; attempt < D.pickTries; attempt += 1) {
      const zone = D.zones[Math.floor(this.rng() * D.zones.length)];
      const cx = this.R(zone.xMin, zone.xMax), cz = this.R(zone.zMin, zone.zMax);
      const d = Math.hypot(cx - L.x, cz - L.z);
      if (d < D.minM || d > D.maxM) continue;
      const plan = this.PlanWave(key, F, zone, cx, cz);
      if (!plan) continue;
      this.wave = plan;
      this.waveIndex += 1;
      this.waves += 1;
      this.nextAt = null;
      this.StartDrone(plan);
      this.events.push({ at: +this.time.toFixed(2), wave: key, zone: zone.id, x: +cx.toFixed(1), z: +cz.toFixed(1),
        d: +d.toFixed(1), bombs: plan.bombs.length });
      if (this.events.length > 12) this.events.shift();
      this.UpdateWave(0);
      return true;
    }
    return false;
  }

  /**
   * 引擎声：一条挂在长机上（三架的合声在几百米外听不出是几条，省两条声部）。
   * 长机进到 droneStartM 以内才起（再远只剩 −25 dB 以下，04 激战时引擎节点预算贴着 120，
   * 两公里外那一条既听不见、又一定被预算闸饿死 —— 2026-09-26 实机取证）。起了走 priority：
   * 整轮只有这一条（与扫射航线的引擎声同一个口径），声部数由本层自己数。
   * 起不来（本层 / 共享声部满了）就隔 droneRetryS 再试。
   */
  StartDrone(plan) {
    const A = this.D.audio;
    plan.droneTryAt = plan.t + A.droneRetryS;
    const at = this.LeadPoint(plan, plan.t), L = this.Listener();
    if (!L || Math.hypot(at.x - L.x, at.y - L.y, at.z - L.z) > A.droneStartM) return;
    if (!this.Room(1)) { this.layersDropped += 1; return; }
    plan.drone = this.host.audio?.Play?.(A.droneCue, {
      position: at, volume: A.droneVolume, sourceSizeM: A.droneSizeM, priority: true, selfCapped: true,
      airCut: this.airCut > 0 ? this.airCut : undefined,
    }) || null;
  }

  /** 排一轮；有一颗炸点离人 / 车太近就整轮作废（换一块落区再挑）。 */
  PlanWave(key, F, zone, cx, cz) {
    const D = this.D, B = D.bomb;
    const fromLen = Math.hypot(zone.from.x, zone.from.z) || 1;
    const a = Math.atan2(-zone.from.x / fromLen, -zone.from.z / fromLen) + this.R(-1, 1) * D.headingJitterDeg * DEG;
    const dir = { x: Math.sin(a), z: Math.cos(a) };
    const right = { x: -dir.z, z: dir.x };
    const groundC = this.Ground(cx, cz);
    const speed = F.speedMps;
    const tCenter = D.approachM / speed;
    const plan = { key, zone: zone.id, aircraft: F.aircraft, center: { x: cx, y: groundC, z: cz }, dir, right, speed,
      altitude: groundC + F.altitudeM, tCenter, endT: (D.approachM + D.exitM) / speed, t: 0,
      slots: F.slots, bombs: [], drone: null };
    for (let j = 0; j < F.slots.length; j += 1) {
      const slot = F.slots[j];
      for (let k = 0; k < F.bombs; k += 1) {
        const tImpact = tCenter + slot.back / speed + (k - (F.bombs - 1) / 2) * B.intervalS + this.R(-0.05, 0.05);
        const plane = this.PlanePoint(plan, j, tImpact);
        const ix = plane.x - dir.x * B.trailM + this.R(-1, 1) * B.jitterM;
        const iz = plane.z - dir.z * B.trailM + this.R(-1, 1) * B.jitterM;
        const iy = this.Ground(ix, iz);
        if (this.host.Blocked?.({ x: ix, z: iz }, D.bombClearM)) return null;
        const fallS = Math.sqrt(2 * Math.max(10, plane.y - iy) / B.gravity);
        const tRelease = tImpact - fallS;
        const from = this.PlanePoint(plan, j, tRelease);
        plan.bombs.push({ plane: j, index: k, tRelease, tImpact, fallS, from, at: { x: ix, y: iy, z: iz },
          released: false, landed: false, first: k === 0, lead: j === 0 && k === 0 });
      }
    }
    plan.bombs.sort((p, q) => p.tImpact - q.tImpact);
    plan.firstImpact = plan.bombs[0].tImpact;
    plan.lastImpact = plan.bombs[plan.bombs.length - 1].tImpact;
    return plan;
  }

  Ground(x, z) {
    const y = this.host.Ground ? this.host.Ground(x, z) : 0;
    return Number.isFinite(y) ? y : 0;
  }

  LeadPoint(plan, t) { return this.PlanePoint(plan, 0, t); }

  /** 第 j 架在 t 时刻的位置（直线平飞）。 */
  PlanePoint(plan, j, t) {
    const s = plan.slots[j];
    const along = (t - plan.tCenter) * plan.speed - s.back;
    return {
      x: plan.center.x + plan.dir.x * along + plan.right.x * s.side,
      y: plan.altitude + s.up,
      z: plan.center.z + plan.dir.z * along + plan.right.z * s.side,
    };
  }

  /** 炸弹在空中的位置：水平带着离机时的前进速度、落后 trailM（u² 项），竖直自由落体。 */
  BombPose(plan, b, t) {
    const u = Clamp01((t - b.tRelease) / b.fallS);
    const vx = plan.dir.x * plan.speed * b.fallS, vz = plan.dir.z * plan.speed * b.fallS;
    const ex = b.at.x - b.from.x - vx, ez = b.at.z - b.from.z - vz;
    const drop = b.from.y - b.at.y;
    const hx = vx + 2 * ex * u, hz = vz + 2 * ez * u;
    const h = Math.hypot(hx, hz) || 1;
    return {
      x: b.from.x + vx * u + ex * u * u,
      y: b.from.y - drop * u * u,
      z: b.from.z + vz * u + ez * u * u,
      dirX: hx / h, dirZ: hz / h,
      // 机头朝下的角：dy/du 与水平 dH/du 之比（离机时平躺，越落越竖）。
      pitch: Math.atan2(2 * drop * u, h),
    };
  }

  UpdateWave(dt) {
    const plan = this.wave;
    plan.t += Math.max(0, dt);
    const t = plan.t;
    // 编队。
    const poses = [];
    for (let j = 0; j < plan.slots.length; j += 1) {
      const p = this.PlanePoint(plan, j, t);
      poses.push({ id: plan.aircraft, x: p.x, y: p.y, z: p.z, dirX: plan.dir.x, dirZ: plan.dir.z, climb: 0, bank: 0 });
    }
    this.host.Formation?.(t < plan.endT ? poses : []);
    // 引擎声跟着长机（没起来的、被引擎偷掉的，飞机还没离场就隔一会儿再试）。
    if (plan.drone && this.host.audio?.pendingVoices?.has?.(plan.drone) === false) plan.drone = null;
    if (!plan.drone && t < plan.endT && t >= (plan.droneTryAt ?? 0)) this.StartDrone(plan);
    if (plan.drone) {
      const lead = poses[0];
      this.host.audio?.MoveVoice?.(plan.drone, { x: lead.x, y: lead.y, z: lead.z },
        { velocity: { x: plan.dir.x * plan.speed, y: 0, z: plan.dir.z * plan.speed } });
    }
    // 炸弹：离机的画出来，到点的落地。
    const falling = [];
    for (const b of plan.bombs) {
      if (b.landed) continue;
      if (t < b.tRelease) continue;
      if (!b.released) { b.released = true; this.bombsDropped += 1; }
      if (t >= b.tImpact) { b.landed = true; this.Impact(plan, b); continue; }
      falling.push(this.BombPose(plan, b, t));
    }
    this.host.Bombs?.(falling);
    if (t >= plan.endT && plan.bombs.every((b) => b.landed)) this.EndWave();
  }

  EndWave() {
    const plan = this.wave;
    if (!plan) return;
    this.host.Formation?.([]);
    this.host.Bombs?.([]);
    if (plan.drone) this.host.audio?.StopVoice?.(plan.drone, this.D.audio.droneStopFadeS);
    plan.drone = null;
    this.wave = null;
    this.nextAt = this.time + this.R(this.D.gapS[0], this.D.gapS[1]);
    const P = this.StageProfile(this.stage);
    if (P?.holdS) this.nextAt = Math.max(this.nextAt, this.stageAt + P.holdS);
  }

  // ===========================================================================
  // 落地
  // ===========================================================================

  VisualRadius(d) {
    const I = this.D.impact;
    return Math.min(I.radiusMaxM, I.radiusM + I.radiusPerM * Math.max(0, d - I.radiusFromM));
  }

  ShakeTrauma(d, zone) {
    const S = this.D.shake;
    const u = Clamp01((d - S.nearM) / Math.max(1, S.farM - S.nearM));
    return (S.traumaNear + (S.traumaFar - S.traumaNear) * u) * (zone === "dugout" ? S.dugoutScale : 1);
  }

  ListenerZone() { return this.zoneOverride || this.host.Zone?.() || null; }

  /** 落地那一刻：画面先到；声音由引擎按 d/340 延迟；震屏与掉土排到声音到达之后。 */
  Impact(plan, b) {
    const D = this.D, A = D.audio;
    const L = this.Listener();
    this.impacts += 1;
    if (!L) return;
    const at = b.at;
    const d = Math.hypot(at.x - L.x, at.y - L.y, at.z - L.z);
    const arrive = d / 340;
    const column = b.index % Math.max(1, D.impact.columnEvery ?? 1) === 0;
    const handle = this.host.Visual?.({ x: at.x, y: at.y, z: at.z }, this.VisualRadius(d), d, column);
    if (handle != null) this.columns.push({ handle, until: this.time + D.impact.column.emitS });
    const speech = this.speaking ? A.speechGain : 1;
    const cut = (hz) => (this.airCut > 0 ? Math.min(hz || 20000, this.airCut) : hz || undefined);
    const pos = { x: at.x, y: at.y + 2, z: at.z };
    // 一串十几颗只给其中几颗出声：相邻两声至少隔 minGapS，声部满了就这一颗不出声。
    // 长机头一颗（一轮的第一声）与它的低频层走 priority：04 激战时引擎节点预算贴着上限，
    // 几百米外的远爆偷不到比它更轻的声部，不保这两条一轮就一声不响（2026-09-26 实机取证）。
    const priority = !!(b.lead && A.leadPriority);
    if (b.lead || this.time - this.lastSoundAt >= A.minGapS) {
      if (this.Room(1)) {
        this.lastSoundAt = this.time;
        this.Voice(this.host.audio?.Play?.(A.cue, { position: pos, volume: A.volume * speech, soundField: true, bus: "sfx",
          selfCapped: true, priority, airCut: cut(0) }));
      } else this.layersDropped += 1;
    }
    // 一轮的第一颗（长机那一串的头一颗）：低频冲击层（同名 cue 的 22 ms 去重窗，晚 30 ms 起）。
    if (b.lead) {
      if (this.Room(1)) {
        this.Voice(this.host.audio?.Play?.(A.thumpCue, { position: pos, volume: A.thumpVolume * speech, soundField: true,
          bus: "sfx", selfCapped: true, priority, airCut: cut(A.thumpAirCutHz), delay: A.thumpDelayS }));
      } else this.layersDropped += 1;
    }
    // 每架那一串的第一颗：听者在洞里 / 沟里，声音到了之后耳边掉一阵土。
    if (b.first) {
      const zone = this.ListenerZone();
      if ((zone === "dugout" || zone === "trench") && d < A.dirtWithinM) {
        this.pending.push({ at: this.time + arrive + this.R(A.dirtDelayS[0], A.dirtDelayS[1]), kind: "dirt", zone });
      }
    }
    this.pending.push({ at: this.time + arrive, kind: "shake", d });
  }

  Voice(v, activeS = this.D.audio.voiceActiveS) {
    if (v) {
      this.voices.push({ v, until: this.time + activeS });
      this.sounds += 1;
      this.peakVoices = Math.max(this.peakVoices, this.Active());
    }
    return v;
  }

  RunPending() {
    if (!this.pending.length) return;
    const due = this.pending.filter((p) => p.at <= this.time);
    if (!due.length) return;
    this.pending = this.pending.filter((p) => p.at > this.time);
    const A = this.D.audio, S = this.D.shake;
    const L = this.Listener();
    for (const p of due) {
      if (p.kind === "shake") {
        // 一串连着到：windowS 秒里合计不超过 windowMax（不然十几颗叠满创伤桶，远处的炸弹震得像在脚下）。
        this.shakes = this.shakes.filter((s) => this.time - s.at < S.windowS);
        const spent = this.shakes.reduce((n, s) => n + s.trauma, 0);
        const trauma = Math.min(this.ShakeTrauma(p.d, this.ListenerZone()), Math.max(0, S.windowMax - spent));
        if (trauma > 1e-3) { this.host.Shake?.(trauma); this.shakes.push({ at: this.time, trauma }); }
      } else if (p.kind === "dirt" && L) {
        if (!this.Room(1)) { this.layersDropped += 1; continue; }
        const dugout = p.zone === "dugout";
        const a = this.rng() * Math.PI * 2;
        const r = dugout ? 0.6 : 1.3;
        this.Voice(this.host.audio?.Play?.("debrisFall", {
          position: { x: L.x + Math.sin(a) * r, y: L.y + (dugout ? 0.9 : -0.3), z: L.z + Math.cos(a) * r },
          volume: dugout ? A.dugoutDirtVolume : A.trenchDirtVolume,
          airCut: dugout ? A.dugoutDirtAirCutHz : A.trenchDirtAirCutHz,
        }), A.debrisActiveS);
      }
    }
  }

  /** 到点撤掉土柱的烟源（已经喷出去的烟团自己活完）。all = 全撤。 */
  UpdateColumns(all = false) {
    if (!this.columns.length) return;
    const keep = [];
    for (const c of this.columns) {
      if (all || this.time >= c.until) this.host.RemoveVisual?.(c.handle);
      else keep.push(c);
    }
    this.columns = keep;
  }

  State() {
    const w = this.wave;
    return {
      started: this.started, waves: this.waves, bombsDropped: this.bombsDropped, impacts: this.impacts, sounds: this.sounds,
      skipped: this.skipped, layersDropped: this.layersDropped, voices: this.voices.length, peakVoices: this.peakVoices,
      reserving: this.Reserving(),
      nextInS: this.nextAt === null ? null : +(this.nextAt - this.time).toFixed(2),
      wave: w ? { key: w.key, zone: w.zone, t: +w.t.toFixed(2), tCenter: +w.tCenter.toFixed(2), endT: +w.endT.toFixed(2),
        bombs: w.bombs.length, landed: w.bombs.filter((b) => b.landed).length, drone: !!w.drone,
        lead: (() => { const p = this.LeadPoint(w, w.t); return { x: +p.x.toFixed(1), y: +p.y.toFixed(1), z: +p.z.toFixed(1) }; })() } : null,
      recent: this.events.slice(-6),
    };
  }

  /** 整个撤掉（换关 / 销毁）：编队与炸弹收起、引擎声掐掉、土柱撤源。 */
  Dispose() {
    if (this.wave?.drone) this.host.audio?.StopVoice?.(this.wave.drone, 0);
    this.wave = null;
    this.host.Formation?.([]);
    this.host.Bombs?.([]);
    for (const e of this.voices) this.host.audio?.FreeVoice?.(e.v);
    this.voices = [];
    this.pending = [];
    this.UpdateColumns(true);
  }
}
