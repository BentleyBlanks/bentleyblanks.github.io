// ===========================================================================
// Script_TankAudio.mjs —— 第一关那辆八九式中战车（甲）的声音（战车包 Step 2 · 2026-09-23）
//
// 口径：docs/Data_FirstLevelTank20260923.md「声音」一节；数值 Data_Tuning_Tank.audio；素材 Data_SfxSources.TANK_SFX。
//
// 三条常驻循环（契约 §6：战车常驻 loop ≤ 3）：
//   · tankEngine —— 怠速 / 负载两层按转速等功率交叉，±12% 变速，底下垫 30–70 Hz 点火脉冲（音效总线，不吃对白闪避）；
//   · tankTracks —— 链节咔嗒，跟车速；原地转向也响；
//   · tankTurret —— 手摇棘轮，只在摇的时候响。**停了 = 摇到位了 = 1.2–1.8 s 后开炮**，这是躲炮的预兆。
// 一次性：起步 / 刹车 / 原地转 / 倒车的履带尖啸，主炮近 / 中 / 远三层 + 区域尾音，炮弹掠过，弹打装甲的「当」，
// 观察窗关上、舱盖打开，熄火（咳嗽→停）、炮塔卡死、冷却滴答。车载机枪走机枪类 cue + 车内低通（在 Fire 里给 Main）。
//
// 全部挂在车上：循环每帧 MoveVoice（遮挡探针每 0.25 s 重查一次，与飞机引擎同一条路），一次性音按发声点 Play。
// 03「先闻其声」：阵位没夺下、车还没开进图时，引擎已在路线起点（北面高地后面）怠速，从零渐起。
//
// 这一层**不认 three、不认运行时**：映射（转速 → 增益 / 变速、距离 → 三层权重、弹道 → 掠过点）是导出的纯函数，
// Script_FirstLevelTankBrainTest 在 node 里直接测；TankAudio 只拿 AudioEngine 的公开接口（Play / MoveVoice / StopVoice）。
// ===========================================================================

const Clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const Clamp01 = (v) => Clamp(v, 0, 1);
const DbGain = (db) => Math.pow(10, db / 20);
/** 枪尾那套的区名映射（与 Script_Audio.GUN_TAIL_ZONE 同一张）：主炮借机枪尾巴降调当炮尾。 */
const TAIL_ZONE = Object.freeze({ interior: "Interior", courtyard: "Street", street: "Street", open: "Open" });

/**
 * 三条循环此刻该有的参数。纯函数。
 * @param {object} s { rpm, load, speed, pivotRate, turretRate, cranking, idleRpm, maxRpm, cruiseMps, pivotMaxRad }
 * @param {object} A Data_Tuning_Tank.audio
 * @returns {{ engine, tracks, turret, running }}
 */
export function TankLoopParams(s, A) {
  const idle = s.idleRpm ?? 600, max = s.maxRpm ?? 1800;
  const rpm = Math.max(0, s.rpm ?? 0);
  const running = rpm >= A.runningRpm;
  // 熄火那 1.8 s：rpm 从怠速往 0 掉，整条引擎跟着 rpm/怠速 往下收（不是一刀切）。
  const alive = Clamp01(rpm / idle);
  const x = Clamp01((rpm - idle) / Math.max(1, max - idle));
  const load = Clamp01(s.load ?? 0);
  const boost = DbGain(A.loadBoostDb * load);
  const idleW = Math.cos(x * Math.PI / 2), loadW = Math.sin(x * Math.PI / 2);
  // 变速：各层在自己那一段里走 ±12%。怠速层 x∈[0, 0.5] 走满，负载层 x∈[0.3, 1] 走满；熄火时跟着 rpm 往下掉。
  const rateIdle = rpm < idle ? A.rateMin * (0.6 + 0.4 * alive) : A.rateMin + (A.rateMax - A.rateMin) * Clamp01(x / 0.5);
  const rateLoad = A.rateMin + (A.rateMax - A.rateMin) * Clamp01((x - 0.3) / 0.7);
  const engine = {
    gains: [A.idleGain * idleW * boost * alive, A.loadGain * loadW * boost * alive],
    rates: [rateIdle, rateLoad],
    subHz: Clamp(rpm * A.subHzPerRpm, A.subMinHz, A.subMaxHz),
    subGain: running ? (A.subGain + A.subLoadGain * load) * alive : 0,
  };
  const v = Clamp01(Math.abs(s.speed ?? 0) / (s.cruiseMps || 2.2));
  const pivot = Clamp01(Math.abs(s.pivotRate ?? 0) / (s.pivotMaxRad || 0.32));
  const tracks = {
    gains: [A.tracksGain * Math.min(1, Math.pow(v, 0.7) + A.tracksPivotGain * pivot)],
    rates: [A.tracksRateMin + (A.tracksRateMax - A.tracksRateMin) * Math.max(v, pivot * 0.6)],
  };
  const rate = Math.abs(s.turretRate ?? 0);
  const cranking = !!s.cranking && rate > 0.02;
  const turret = {
    gains: [cranking ? A.crankGain * Clamp01(0.55 + 0.45 * rate / A.crankRateRefRad) : 0],
    rates: [Clamp(rate / A.crankRateRefRad, A.crankRateMin, A.crankRateMax)],
    cranking,
  };
  return { engine, tracks, turret, running };
}

/** 主炮近 / 中 / 远三层的权重（等功率：平方和恒为 1）。纯函数。 */
export function CannonLayerWeights(distance, A) {
  const d = Math.max(0, distance);
  if (d <= A.cannonNearM) return [1, 0, 0];
  if (d <= A.cannonMidM) {
    const t = (d - A.cannonNearM) / (A.cannonMidM - A.cannonNearM);
    return [Math.cos(t * Math.PI / 2), Math.sin(t * Math.PI / 2), 0];
  }
  if (d <= A.cannonFarM) {
    const t = (d - A.cannonMidM) / (A.cannonFarM - A.cannonMidM);
    return [0, Math.cos(t * Math.PI / 2), Math.sin(t * Math.PI / 2)];
  }
  return [0, 0, 1];
}

/**
 * 一发炮弹会不会从听者身边飞过去；会的话，何时、在哪儿（弹道离听者最近的那一点）。纯函数。
 * 落点就在听者附近（没「飞过去」）的不算 —— 那一发交给爆炸本身。
 */
export function ShellPassPoint(from, at, listener, flightS, A) {
  const dx = at.x - from.x, dy = at.y - from.y, dz = at.z - from.z;
  const len = Math.hypot(dx, dy, dz);
  if (!(len > 1)) return null;
  const ux = dx / len, uy = dy / len, uz = dz / len;
  const s = (listener.x - from.x) * ux + (listener.y - from.y) * uy + (listener.z - from.z) * uz;
  if (s <= 0 || s >= len - A.passBeyondM) return null;
  const px = from.x + ux * s, py = from.y + uy * s, pz = from.z + uz * s;
  const miss = Math.hypot(listener.x - px, listener.y - py, listener.z - pz);
  if (miss > A.passRadiusM) return null;
  return { t: flightS * s / len, point: { x: px, y: py, z: pz }, miss };
}

export class TankAudio {
  /**
   * @param {AudioEngine} audio  Script_Audio 的引擎（出图模式下 Play 返回 null，这里全部静默跳过）
   * @param {object} A           Data_Tuning_Tank.audio
   * @param {object} drive       Data_Tuning_Tank.drive（怠速 / 满转 / 巡航 / 原地转速）
   */
  constructor(audio, A, drive) {
    this.audio = audio;
    this.A = A;
    this.D = drive;
    this.loops = { tankEngine: null, tankTracks: null, tankTurret: null };
    this.fresh = new Set();         // 刚起播、还没设过值的循环：第一次 SetTank 立即生效
    this.offstage = false;
    this.fadeIn = 1;                // 03 视线外渐起（0→1）
    this.lastSqueal = -1e9;
    this.lastPing = -1e9;
    this.time = 0;
    this.state = "Intact";
    this.coolUntil = -1;
    this.nextCool = Infinity;
    this.turretWasCranking = false;
    this.pending = [];              // 延时的一次性音（炮弹掠过）：{ at, name, opts }
    this.stats = { plays: {}, cannon: [], passes: 0, pings: 0, squeals: 0, stalls: 0, loopsStarted: 0, loopsMissing: 0 };
    this.last = null;               // 最近一帧的循环参数（探针读）
  }

  get Enabled() { return !!this.audio && !!this.audio.ctx && !this.audio.disposed; }

  Play(name, opts) {
    if (!this.Enabled) return null;
    this.stats.plays[name] = (this.stats.plays[name] || 0) + 1;
    return this.audio.Play(name, opts);
  }

  /** 起播缺的循环（被引擎自己回收 / 还没起的都补上）。 */
  EnsureLoops(at, names) {
    if (!this.Enabled) return;
    for (const name of names) {
      const v = this.loops[name];
      if (v && v.nodes && v.nodes.length && !v.stopping) continue;
      const voice = this.audio.Play(name, { position: at, priority: true, sourceSizeM: this.A.sourceSizeM });
      this.loops[name] = voice || null;
      if (voice) { this.fresh.add(name); this.stats.loopsStarted += 1; } else this.stats.loopsMissing += 1;
    }
  }

  SetLoop(name, p, tau) {
    const v = this.loops[name];
    if (!v || typeof v.SetTank !== "function") return;
    v.SetTank(p, this.fresh.has(name) ? 0 : tau);
    this.fresh.delete(name);
  }

  MoveLoops(engineAt, turretAt) {
    if (!this.Enabled) return;
    for (const [name, v] of Object.entries(this.loops)) {
      if (!v) continue;
      this.audio.MoveVoice(v, name === "tankTurret" ? turretAt : engineAt);
    }
  }

  /**
   * 03：车还没开进图。引擎在路线起点怠速，从零渐起（「先闻其声」）；履带、手摇不响。
   * @param {{x,y,z}} at 路线起点（地面高度由调用侧给）
   */
  Offstage(dt, at) {
    this.time += dt;
    if (!this.offstage) { this.offstage = true; this.fadeIn = 0; }
    this.fadeIn = Math.min(1, this.fadeIn + dt / Math.max(0.1, this.A.offstageFadeInS));
    const engineAt = { x: at.x, y: at.y + this.A.engineY, z: at.z };
    this.EnsureLoops(engineAt, ["tankEngine"]);
    const p = TankLoopParams({ rpm: this.D.idleRpm, load: 0, idleRpm: this.D.idleRpm, maxRpm: this.D.maxRpm }, this.A);
    this.SetLoop("tankEngine", { ...p.engine, gains: p.engine.gains.map((g) => g * this.fadeIn), subGain: p.engine.subGain * this.fadeIn }, this.A.smoothS);
    this.MoveLoops(engineAt, engineAt);
    this.last = { offstage: true, fadeIn: this.fadeIn, engine: p.engine };
  }

  /**
   * 每帧（车已开进图）。
   * @param {object} t 运行时的 tank：{ x, z, groundY, rpm, load, speed, pivotRate, turretRate, cranking, damageState }
   */
  Update(dt, t) {
    this.time += dt;
    const A = this.A;
    // 从视线外怠速接过来：渐起没走完的继续走完（同一条 voice，不会重起）。
    this.fadeIn = Math.min(1, this.fadeIn + dt / Math.max(0.1, A.offstageFadeInS));
    this.offstage = false;
    const engineAt = { x: t.x, y: t.groundY + A.engineY, z: t.z };
    const turretAt = { x: t.x, y: t.groundY + A.turretY, z: t.z };
    const p = TankLoopParams({ ...t, idleRpm: this.D.idleRpm, maxRpm: this.D.maxRpm, cruiseMps: this.D.cruiseMps, pivotMaxRad: this.D.pivotRadS }, A);
    if (p.running || this.loops.tankEngine) this.EnsureLoops(engineAt, ["tankEngine"]);
    if (p.running) this.EnsureLoops(engineAt, ["tankTracks", "tankTurret"]);
    const f = this.fadeIn;
    this.SetLoop("tankEngine", { ...p.engine, gains: p.engine.gains.map((g) => g * f), subGain: p.engine.subGain * f }, A.smoothS);
    this.SetLoop("tankTracks", p.tracks, A.smoothS);
    // 手摇：起得快、停得更快 —— 「咔嗒声停了」必须是一个听得出的时刻。
    this.SetLoop("tankTurret", p.turret, p.turret.cranking ? A.crankAttackS : A.crankReleaseS);
    this.turretWasCranking = p.turret.cranking;
    this.MoveLoops(engineAt, turretAt);
    // 熄火后：引擎循环收到零再停掉（省节点），履带 / 手摇同样。
    if (!p.running && t.damageState === "Disabled") this.StopLoops(0.4);
    // 延时的一次性音。
    for (let i = this.pending.length - 1; i >= 0; i -= 1) {
      if (this.pending[i].at > this.time) continue;
      const e = this.pending.splice(i, 1)[0];
      this.Play(e.name, e.opts);
    }
    // 冷却滴答：熄火后稀稀拉拉响一阵，越来越轻。
    if (this.time >= this.nextCool && this.time < this.coolUntil) {
      const left = Clamp01((this.coolUntil - this.time) / A.coolForS);
      this.Play("tankCoolTick", { position: engineAt, volume: A.coolVolume * (0.35 + 0.65 * left) });
      this.nextCool = this.time + A.coolEveryMinS + (A.coolEveryMaxS - A.coolEveryMinS) * ((Math.sin(this.time * 12.9898) * 43758.5453) % 1 + 1) % 1;
    }
    this.last = { offstage: false, fadeIn: f, running: p.running, engine: p.engine, tracks: p.tracks, turret: p.turret };
  }

  /** 主炮开火：三层按距离交叉 + 区域尾音；弹道若掠过听者，排一声掠过。 */
  OnCannon(from, at, flightS) {
    if (!this.Enabled) return;
    const A = this.A, L = this.audio.listenerPos;
    const d = Math.hypot(from.x - L.x, from.y - L.y, from.z - L.z);
    const w = CannonLayerWeights(d, A);
    const names = ["tankCannon", "tankCannonMid", "tankCannonFar"];
    const played = [];
    names.forEach((name, i) => {
      if (w[i] <= 0.02) return;
      const v = this.Play(name, { position: from, volume: A.cannonVolume * w[i], priority: true, sourceSizeM: 2 });
      played.push({ name, weight: Number(w[i].toFixed(3)), ok: !!v });
    });
    const zone = TAIL_ZONE[this.audio.SourceZone?.(from)] || "Open";
    this.Play(`gunTail${zone}Mg`, { position: from, volume: A.tailGain, pitch: A.tailPitch });
    this.stats.cannon.push({ t: Number(this.time.toFixed(2)), distance: Number(d.toFixed(1)), layers: played, tail: zone });
    if (this.stats.cannon.length > 24) this.stats.cannon.shift();
    const pass = ShellPassPoint(from, at, L, flightS, A);
    if (pass) {
      this.stats.passes += 1;
      // 掠过声在弹道最近点：出膛之后 pass.t 秒到那儿，声音再走 miss / 340 秒（几毫秒，忽略）。
      this.pending.push({ at: this.time + Math.max(0, pass.t - 0.25), name: "tankShellPass",
        opts: { position: pass.point, volume: A.passVolume * Clamp01(1.15 - pass.miss / A.passRadiusM), priority: true } });
    }
  }

  /** 大脑的驾驶事件：起步 / 刹车 / 原地转 / 倒车 → 履带尖啸（节流）。 */
  OnEvent(id, at) {
    const vol = this.A.squealVolume[id];
    if (vol == null || this.time - this.lastSqueal < this.A.squealCooldownS) return;
    this.lastSqueal = this.time;
    this.stats.squeals += 1;
    this.Play("tankTrackSqueal", { position: at, volume: vol });
  }

  /** 大脑的喊话 / 动作：观察窗关上、开舱盖。 */
  OnBark(id, at) {
    const A = this.A;
    if (id === "visionSlit") this.Play("tankHatch", { position: at, volume: A.slitVolume, pitch: A.slitPitch });
    else if (id === "hatchShout") this.Play("tankHatch", { position: at, volume: A.hatchVolume });
  }

  /** 枪弹打在车体上：一声「当」（跳弹由 Main 的 Ricochet 那条照旧出）。 */
  OnBulletHit(point) {
    if (this.time - this.lastPing < this.A.pingCooldownS) return;
    this.lastPing = this.time;
    this.stats.pings += 1;
    this.Play("tankArmorPing", { position: point, volume: this.A.pingVolume });
  }

  /** 毁伤状态变了。Disabled：熄火（咳嗽→停）+ 炮塔卡死 + 过一会儿开始冷却滴答。 */
  OnState(state, at) {
    if (state === this.state) return;
    this.state = state;
    if (state !== "Disabled") return;
    const A = this.A;
    this.stats.stalls += 1;
    this.Play("tankStall", { position: { x: at.x, y: at.y + A.engineY, z: at.z }, volume: A.stallVolume, priority: true });
    this.Play("tankTurretJam", { position: { x: at.x, y: at.y + A.turretY, z: at.z }, volume: A.jamVolume, delay: 0.6 });
    this.nextCool = this.time + A.coolDelayS;
    this.coolUntil = this.time + A.coolDelayS + A.coolForS;
  }

  StopLoops(fadeS = 0.3) {
    for (const [name, v] of Object.entries(this.loops)) {
      if (v && this.audio) this.audio.StopVoice(v, fadeS);
      this.loops[name] = null;
    }
    this.fresh.clear();
  }

  /** 离开 03–06：全部收掉。 */
  Stop() { this.StopLoops(0.5); this.pending.length = 0; this.coolUntil = -1; this.offstage = false; }

  /** 探针 / 取证：循环数、各层参数、有效电平、一次性音计数。 */
  State() {
    const loops = {};
    for (const [name, v] of Object.entries(this.loops)) {
      loops[name] = v ? { live: !!(v.nodes && v.nodes.length), nodes: v.nodes?.length || 0, distance: Number((v.distance || 0).toFixed(1)),
        effectiveGain: Number((v.effectiveGain || 0).toFixed(4)), occ: Number((v.occ || 0).toFixed(2)) } : null;
    }
    return { loops, liveLoops: Object.values(loops).filter((l) => l && l.live).length, last: this.last,
      state: this.state, stats: JSON.parse(JSON.stringify(this.stats)) };
  }
}
