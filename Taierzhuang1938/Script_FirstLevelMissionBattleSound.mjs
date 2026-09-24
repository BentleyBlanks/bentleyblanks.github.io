// Script_FirstLevelMissionBattleSound.mjs — 第一关离图战场声。
//
// 01–06（Data_FirstLevelMissionBattleSound.front.stages 里有的步骤）走 2026-09-23 的新声景：
//   · FrontExchange：扇区化「一方开火、另一方还击」的远处交火（300 m – 1.5 km）；
//   · BattleArtillery：40–140 m 外无人地带的场外近落弹（先见后闻、震屏、落土）；
//   · 防炮洞环境床：01 整段、02/撤退段按听者空间档在 firstLevelDugout ↔ firstLevelFront 之间交叉淡。
// 07 以后仍走原来的五个固定声源循环（Legacy），一行没改。
//
// 宿主（第二个构造参数）是任务运行时：读 ai（避人）、battlefield（地面）、vfx（画面）、
// player.shake（震屏）、Has（事实）。缺哪样就少哪样，测试夹具只给 audio 也照跑。
// 数全在 Data_FirstLevelMissionBattleSound；口径见 docs/Data_AudioWiring.md「二之三」。
import { MISSION_BATTLE_SOUND as D } from './Data_FirstLevelMissionBattleSound.mjs';
import { BATTLE_ARTILLERY } from './Data_Tuning_Audio.mjs';
import { BattleArtillery } from './Script_BattleArtillery.mjs';
import { Mulberry32 } from './Script_Noise.mjs';

/** panner inverse（soundField 那一档，参数见 front.fieldRefM / fieldRolloff）在 r 米处的衰减。 */
function FieldFalloff(r) { const F = D.front; return F.fieldRefM / (F.fieldRefM + F.fieldRolloff * Math.max(0, r - F.fieldRefM)); }

export class FirstLevelMissionBattleSound {
  /**
   * @param {object} audio
   * @param {object|null} [host]
   * @param {number|null} [seed] 测试注入固定种子；缺省时没有宿主（夹具）用固定种子、
   *   有宿主（正式运行时）每个实例另抽一个 —— 否则每次新开一局都重放同一串落点。
   */
  constructor(audio, host = null, seed = null) {
    this.audio=audio;this.host=host;this.elapsed=0;this.voices=[];this.events=[];this.startedAt=null;
    this.sources=D.sources.map(spec=>({spec,next:spec.first,count:0}));
    // --- 01–06 新声景 -------------------------------------------------------
    this.seed = (seed ?? (host ? Math.floor(Math.random() * 0x100000000) : 0x19380923)) >>> 0;
    this.rng = Mulberry32(this.seed);
    this.frontTime = 0;
    this.frontStage = null;
    this.frontStageAt = 0;        // 进当前 01–06 步骤时的 frontTime（渐强从这里算）
    this.swellU = 0; this.swellFactAt = null; this.swellFactFrom = 0; this.swellScale = null;
    this.frontSectors = D.front.sectors.map((spec) => ({ spec, nextAt: null, swellAt: 1, exchanges: 0, plays: 0 }));
    this.frontQueue = [];
    this.frontVoices = [];
    this.frontPlays = 0;
    this.frontSkipped = 0;
    this.frontExchanges = 0;
    this.frontRecent = [];
    this.dugoutWant = null;
    this.dugoutSince = 0;
    this.dugoutSwitches = 0;
    this.columns = [];          // 场外炮弹的土柱烟源：{ handle, until }（frontTime）
    this.frontPeakShared = 0;   // 取证：前线 + 炮击合计的峰值
    this.artillery = new BattleArtillery({
      audio,
      Listener: () => audio?.listenerPos || null,
      Ground: (x, z) => host?.battlefield?.GroundHeight?.(x, z) ?? 0,
      Zone: () => audio?.ListenerZone?.() || null,
      Visual: (at, radius) => this.ShellVisual(at, radius),
      // 轻震：直接往创伤桶里加（CameraShake.Explosion 的门槛在 40 m 外一律算成 0）。
      Shake: (trauma) => host?.player?.shake?.AddTrauma?.(trauma),
      Blocked: (at) => this.ShellBlocked(at),
      SharedRoom: (n) => this.frontVoices.length + this.artillery.Busy() + n <= D.front.sharedMaxVoices,
    }, (this.seed ^ 0x5eed1938) >>> 0);
  }

  /** 场外炮弹不许落的地方：活人身边、在场的战车身边。 */
  ShellBlocked(at) {
    const A = BATTLE_ARTILLERY, host = this.host;
    if ((host?.ai?.soldiers || []).some((s) => s.alive
      && Math.hypot(s.position.x - at.x, s.position.z - at.z) < A.avoidSoldierM)) return true;
    const tank = host?.tank;
    return !!(tank?.present && Number.isFinite(tank.x) && Number.isFinite(tank.z)
      && Math.hypot(tank.x - at.x, tank.z - at.z) < A.avoidVehicleM);
  }

  /** 画面：火球与尘环（vfx.Explosion）+ 一根越得过沟沿的短命土柱（SmokeSource，emitS 后撤源）。 */
  ShellVisual(at, radius) {
    const vfx = this.host?.vfx;
    if (!vfx) return;
    vfx.Explosion?.({ x: at.x, y: at.y + 0.15, z: at.z }, { radius, kind: "shell", groundY: at.y });
    const C = BATTLE_ARTILLERY.column;
    if (!C || typeof vfx.SmokeSource !== "function") return;
    const handle = vfx.SmokeSource({ x: at.x, y: at.y + 0.3, z: at.z }, {
      kind: "dust", rate: C.rate, radius: C.radius, rise: C.rise, sizeStart: C.sizeStart, sizeEnd: C.sizeEnd,
      life: C.life, opacity: C.opacity, light: false,
    });
    if (handle != null) this.columns.push({ handle, until: this.frontTime + C.emitS });
  }

  /** 到点撤掉土柱的烟源（已经喷出去的烟团自己活完）。all = 全撤（离开 01–06 / 销毁）。 */
  UpdateColumns(all = false) {
    if (!this.columns.length) return;
    const keep = [];
    for (const c of this.columns) {
      if (all || this.frontTime >= c.until) this.host?.vfx?.RemoveSmokeSource?.(c.handle);
      else keep.push(c);
    }
    this.columns = keep;
  }

  Update(dt,stage,speaking=false) {
    // 01–06 声景的任务侧开关：接线层（Script_AudioWiring.SoundscapeOn）读它决定
    // 要不要判壕沟/防炮洞、要不要压制喘息心跳。07 以后写 false，行为回到这一轮之前。
    this.SetSoundscape(!!D.front.stages[stage]);
    if (D.front.stages[stage]) { this.UpdateFront(dt, stage, speaking); return; }
    if (this.frontStage !== null) this.LeaveFront();
    this.UpdateLegacy(dt, stage, speaking);
  }

  // =========================================================================
  // 01–06
  // =========================================================================
  R(min, max) { return min + (max - min) * this.rng(); }
  RI(pair) { return Math.floor(this.R(pair[0], pair[1] + 0.999)); }

  UpdateFront(dt, stage, speaking) {
    const F = D.front, P = F.stages[stage];
    this.frontTime += Math.max(0, dt);
    const now = this.frontTime;
    // 「同时在响」按每一声自己的可听时长算（cueActiveS），不按引擎的回收时刻：
    // 引擎要等混响尾巴与传播延迟都过去才回收（远处一枪常常五六秒），拿它数声部
    // 会把一秒一两声的交火卡成五秒一声。
    this.frontVoices = this.frontVoices.filter((e) => now < e.until && this.audio?.pendingVoices?.has?.(e.v) !== false);
    this.UpdateColumns();
    const live = Math.max(0, Math.min(1, this.audio?.battleIntensity || 0));
    if (stage !== this.frontStage) this.EnterFront(stage);
    const swell = this.UpdateSwell(P);
    const rate = P.intensity * swell.intensity * (1 - F.rateYield * live) * (speaking ? F.speechRate : 1);
    for (const sector of this.frontSectors) {
      // 渐强期间已经排好的等待按强度的涨幅缩短（等于「等待按当前频次走」）：
      // 否则开头按低频次排下的三四十秒空档，要到近爆之后才轮到，前线反而在顶上最稀。
      if (P.swell && sector.nextAt !== null && swell.intensity > sector.swellAt) {
        sector.nextAt = now + Math.max(0, sector.nextAt - now) * sector.swellAt / swell.intensity;
        sector.swellAt = swell.intensity;
      }
      if (sector.nextAt === null || now < sector.nextAt) continue;
      this.StartExchange(sector);
      const weight = (P.weights?.[sector.spec.id] ?? 1) * sector.spec.weight;
      sector.nextAt = now + this.R(F.gapS[0], F.gapS[1]) / Math.max(0.05, rate * weight)
        + this.QueueSpanS(sector);
      sector.swellAt = swell.intensity;
    }
    this.DrainFront(P, live, swell.gain);
    // 场外近落弹。
    const A = D.artillery, AP = A.stages[stage] || null;
    let quiet = false;
    if (AP?.quietAfter) {
      // 事实第一次出现的时刻（检查点重来时事实被删掉，这里跟着忘掉）。
      const fact = AP.quietAfter.fact;
      this.factSeenAt ??= {};
      if (this.host?.Has?.(fact)) {
        this.factSeenAt[fact] ??= now;
        quiet = now - this.factSeenAt[fact] < AP.quietAfter.seconds;
      } else delete this.factSeenAt[fact];
    }
    this.artillery.Update(dt, AP ? { ...AP, firstAfterS: A.firstAfterS, firstSpreadS: A.firstSpreadS } : null,
      { zones: A.zones, rateScale: speaking ? A.speechRate : 1, quiet, stage });
    this.frontPeakShared = Math.max(this.frontPeakShared, this.frontVoices.length + this.artillery.voices.length);
    this.UpdateDugout(stage);
  }

  /** 进一个 01–06 步骤：首场交火 firstWithinS 内起，其余扇区错开。 */
  EnterFront(stage) {
    const F = D.front, P = F.stages[stage];
    const now = this.frontTime;
    const ranked = this.frontSectors.map((s) => ({ s, w: (P.weights?.[s.spec.id] ?? 1) * s.spec.weight }))
      .sort((a, b) => b.w - a.w);
    // 有渐强的步骤（01）其余扇区的第一场按起始频次往后摊（首场仍在 firstWithinS 内），
    // 不然五个扇区在头十几秒里各打一场，渐强的开头反而最密。没有渐强的步骤倍率为 1，一个数不变。
    const from = P.swell ? (P.swell.intensityFrom ?? 1) : 1;
    ranked.forEach(({ s }, i) => {
      s.nextAt = i === 0 ? now + this.R(0.15, F.firstWithinS) : now + F.firstWithinS + this.R(0.8, F.gapS[1]) / from;
      s.swellAt = from;
    });
    this.frontStage = stage;
    this.frontStageAt = now;
    this.swellU = 0;
    this.swellFactAt = null;
  }

  /**
   * 渐强（front.stages[].swell，目前只有 01）：进步骤后 riseS 秒从底爬到顶；peakFact 一出现，
   * 剩下的在 catchUpS 秒里补完。u 只增不减。返回乘在 intensity / gain 上的两个倍率。
   * 没有 swell 的步骤恒为 1。
   */
  UpdateSwell(P) {
    const S = P.swell;
    if (!S) { this.swellU = 1; this.swellScale = { u: 1, intensity: 1, gain: 1 }; return this.swellScale; }
    const age = this.frontTime - (this.frontStageAt ?? this.frontTime);
    let u = Math.min(1, age / Math.max(1e-3, S.riseS));
    if (S.peakFact && this.host?.Has?.(S.peakFact)) {
      if (this.swellFactAt == null) { this.swellFactAt = this.frontTime; this.swellFactFrom = this.swellU ?? u; }
      const k = Math.min(1, (this.frontTime - this.swellFactAt) / Math.max(1e-3, S.catchUpS ?? 0));
      u = Math.max(u, this.swellFactFrom + (1 - this.swellFactFrom) * k);
    }
    u = Math.max(u, this.swellU ?? 0);
    this.swellU = u;
    const w = Math.pow(u, S.curve ?? 1);
    const intensityFrom = S.intensityFrom ?? 1, gainFrom = Math.max(1e-4, S.gainFrom ?? 1);
    this.swellScale = { u, intensity: intensityFrom + (1 - intensityFrom) * w, gain: Math.pow(gainFrom, 1 - w) };
    return this.swellScale;
  }

  SetSoundscape(on) {
    if (this.audio && this.audio.firstLevelSoundscape !== on) this.audio.firstLevelSoundscape = on;
  }

  LeaveFront() {
    this.frontStage = null;
    this.UpdateColumns(true);
    this.frontQueue.length = 0;
    for (const s of this.frontSectors) s.nextAt = null;
    this.dugoutWant = null;
  }

  /** 这个扇区已经排进队列、还没播完的那一段有多长（下一场从它之后算）。 */
  QueueSpanS(sector) {
    let last = this.frontTime;
    for (const e of this.frontQueue) if (e.sector === sector.spec.id) last = Math.max(last, e.at);
    return last - this.frontTime;
  }

  /** 在锚点周围 spreadM 的圆盘里随机一个位置。 */
  Jitter(anchor, spread) {
    const a = this.rng() * Math.PI * 2, r = Math.sqrt(this.rng()) * spread;
    return { x: anchor.x + Math.sin(a) * r, z: anchor.z + Math.cos(a) * r };
  }

  PickExchange() {
    const E = D.front.exchanges;
    const total = Object.values(E).reduce((n, e) => n + e.weight, 0);
    let roll = this.rng() * total;
    for (const [kind, spec] of Object.entries(E)) { roll -= spec.weight; if (roll <= 0) return [kind, spec]; }
    return Object.entries(E)[0];
  }

  /** 起一场交火：把整段来回排进队列（时刻相对现在）。 */
  StartExchange(sector) {
    const F = D.front, S = F.sides, spec = sector.spec;
    const [kind, X] = this.PickExchange();
    const t0 = this.frontTime;
    const push = (at, side, cue, burst = null) => this.frontQueue.push({
      at: t0 + at, sector: spec.id, kind, side, cue, burst,
      pos: this.Jitter(side === "gun" ? F.guns[Math.floor(this.rng() * F.guns.length)] : spec[side === "impact" ? "nra" : side],
        side === "gun" ? F.gunSpreadM : spec.spreadM),
    });
    const other = (side) => (side === "ija" ? "nra" : "ija");
    const mgOf = (side) => S[side].mg[Math.floor(this.rng() * S[side].mg.length)];
    let t = 0;
    if (kind === "rifleSkirmish") {
      let side = this.rng() < X.ijaFirst ? "ija" : "nra";
      const rounds = this.RI(X.rounds);
      for (let r = 0; r < rounds; r += 1) {
        const shots = this.RI(X.shots);
        for (let i = 0; i < shots; i += 1) { push(t, side, S[side].rifle); t += this.R(X.shotGapS[0], X.shotGapS[1]); }
        t += this.R(X.replyS[0], X.replyS[1]);
        side = other(side);
      }
    } else if (kind === "mgDuel") {
      let side = this.rng() < X.ijaFirst ? "ija" : "nra";
      const rounds = this.RI(X.rounds);
      for (let r = 0; r < rounds; r += 1) {
        const burst = this.RI(side === "ija" ? X.ijaBurst : X.nraBurst);
        const cue = mgOf(side);
        push(t, side, cue, burst);
        // 点射本身占的时长：每发间隔读 mgShotS（九二式 200 rpm、其余 500 rpm），与 DrainFront 同一张表。
        const span = burst * (F.mgShotS[cue] ?? F.mgShotS.default);
        if (this.rng() < X.rifleChance) {
          const n = this.RI(X.rifleShots);
          for (let i = 0; i < n; i += 1) push(t + this.R(X.rifleAfterS, span + X.rifleTailS), side, S[side].rifle);
        }
        t += span + this.R(X.replyS[0], X.replyS[1]);
        side = other(side);
      }
    } else if (kind === "barrage" || kind === "mortar") {
      const shells = this.RI(X.shells);
      for (let i = 0; i < shells; i += 1) {
        const flight = this.R(X.flightS[0], X.flightS[1]);
        if (kind === "barrage") push(t, "gun", S.ija.gun);
        else push(t, "ija", S.ija.mortar);
        push(t + flight, "impact", S.ija.impact);
        t += this.R(X.shellGapS[0], X.shellGapS[1]);
      }
      if (kind === "barrage" && this.rng() < X.answerChance) {
        push(t + this.R(X.answerDelayS[0], X.answerDelayS[1]), "nra", mgOf("nra"), this.RI(X.answerBurst));
      }
    }
    sector.exchanges += 1;
    this.frontExchanges += 1;
  }

  /**
   * 把一个世界坐标换成「摆在哪、多响、多闷」。引擎只保留 1000 m 内的 soundField，
   * 更远的沿方向摆到 placeMaxM，音量按反比律补上两段距离之差。
   */
  Place(pos) {
    const F = D.front, L = this.audio?.listenerPos || { x: 0, y: 0, z: 0 };
    const dx = pos.x - L.x, dz = pos.z - L.z, d = Math.hypot(dx, dz) || 1;
    const placed = Math.min(d, F.placeMaxM);
    const k = placed / d;
    const extra = d > placed ? FieldFalloff(d) / FieldFalloff(placed) : 1;
    let airCut = 20000;
    if (d > F.airCutFromM) {
      const u = Math.min(1, (d - F.airCutFromM) / (F.airCutFarM - F.airCutFromM));
      airCut = 700 + (F.airCutAtFarHz - 700) * u;
    }
    return { position: { x: L.x + dx * k, y: L.y + F.placeRiseM, z: L.z + dz * k }, gain: extra, airCut, distance: d };
  }

  DrainFront(P, live, swellGain = 1) {
    const F = D.front;
    if (!this.frontQueue.length) return;
    const due = this.frontQueue.filter((e) => e.at <= this.frontTime);
    if (!due.length) return;
    this.frontQueue = this.frontQueue.filter((e) => e.at > this.frontTime);
    const volumeScale = (P.gain ?? 1) * swellGain * (1 - F.volumeYield * live);
    // 声部上限：屏幕上打得凶时收紧；与场外炮击合计不过 sharedMaxVoices（炮击留的位也算）。
    const cap = live > F.hotAbove ? Math.min(F.maxVoices, F.maxVoicesHot) : F.maxVoices;
    for (const e of due) {
      if (this.frontVoices.length >= cap
        || this.frontVoices.length + this.artillery.Busy() >= F.sharedMaxVoices) { this.frontSkipped += 1; continue; }
      const place = this.Place(e.pos);
      const jitter = this.R(F.jitterVolume[0], F.jitterVolume[1]);
      const volume = (F.cueVolume[e.cue] ?? 0.5) * volumeScale * place.gain * jitter;
      const voice = this.audio?.Play?.(e.cue, {
        position: place.position, volume, soundField: true, bus: "sfx",
        airCut: Math.min(place.airCut, P.airCut ?? 20000),
        burst: e.burst ?? undefined,
      });
      if (voice) {
        const shot = F.mgShotS[e.cue] ?? F.mgShotS.default;
        const active = (F.cueActiveS[e.cue] ?? 1.5) + (e.burst ? e.burst * shot : 0);
        this.frontVoices.push({ v: voice, until: this.frontTime + active });
        this.frontPlays += 1;
      }
      const sector = this.frontSectors.find((s) => s.spec.id === e.sector);
      if (sector && voice) sector.plays += 1;
      this.frontRecent.push({ at: +this.frontTime.toFixed(2), sector: e.sector, kind: e.kind, side: e.side, cue: e.cue,
        distance: Math.round(place.distance), volume: +volume.toFixed(3), played: !!voice });
      if (this.frontRecent.length > 32) this.frontRecent.shift();
    }
  }

  /** 01–02 防炮洞环境床：整段在洞里的步骤直接切；其余按听者空间档、带滞回地切。 */
  UpdateDugout(stage) {
    const G = D.dugout, mode = G.stages[stage];
    const audio = this.audio;
    if (!mode || typeof audio?.Ambience !== "function") { this.dugoutWant = null; return; }
    const want = mode === "forced" ? G.preset
      : (audio.ListenerZone?.() === "dugout" ? G.preset : G.outside);
    if (audio.ambiencePreset === want) { this.dugoutWant = null; return; }
    if (this.dugoutWant !== want) { this.dugoutWant = want; this.dugoutSince = this.frontTime; }
    if (mode !== "forced" && this.frontTime - this.dugoutSince < G.holdS) return;
    audio.Ambience(want, { fadeS: G.fadeS });
    this.dugoutSwitches += 1;
    this.dugoutWant = null;
  }

  // =========================================================================
  // 07 以后（原样保留）
  // =========================================================================
  UpdateLegacy(dt,stage,speaking=false) {
    const profile=D.profiles[stage];
    if(!profile)return;
    this.elapsed+=dt;
    this.voices=this.voices.filter(v=>this.audio.pendingVoices?.has(v));
    // 有 startAfterS 的档（车厢）在开档之前不撒，开档那一刻把每条声源的第一次
    // **重新排一遍** —— 否则攒了十二秒的 next 会在同一帧一起放炮。
    const active=this.elapsed-(profile.startAfterS||0);
    if(active<0)return;
    if(this.startedAt===null){
      this.startedAt=this.elapsed;
      if(profile.startAfterS)for(const source of this.sources)source.next=this.elapsed+source.spec.first;
    }
    // 军列一路往北开，前线由「几乎听不见」长到「就在前头」。没有 rampS 的档恒为 1。
    const ramp=profile.rampS>0
      ? (profile.rampFromGain??1)+(1-(profile.rampFromGain??1))*Math.min(1,active/profile.rampS) : 1;
    for(const source of this.sources){
      if(this.elapsed<source.next)continue;
      const s=source.spec;
      source.next=this.elapsed+s.intervals[source.count%s.intervals.length]*profile.interval;
      source.count++;
      const options={position:{x:s.x,y:s.y,z:s.z},volume:s.volume*profile.gain*ramp*(speaking?D.speechGain:1),
        // 车厢那一档再压一道墙：隔着木板与铁皮，外面只剩低频。
        airCut:Math.min(s.airCut,profile.airCut??Infinity),burst:s.burst,bus:'ambience',soundField:true};
      const voice=this.audio.Play(s.cue,options);
      if(voice)this.voices.push(voice);
      this.events.push({id:s.id,cue:s.cue,at:this.elapsed,stage,position:options.position,volume:options.volume,played:!!voice});
      if(this.events.length>48)this.events.shift();
    }
  }

  State(){
    return {elapsed:this.elapsed,sources:this.sources.map(s=>({id:s.spec.id,count:s.count})),recent:this.events.slice(-12),
      front:{stage:this.frontStage,time:+this.frontTime.toFixed(2),exchanges:this.frontExchanges,plays:this.frontPlays,
        skipped:this.frontSkipped,queued:this.frontQueue.length,voices:this.frontVoices.length,
        stageTime:this.frontStage===null?null:+(this.frontTime-(this.frontStageAt??this.frontTime)).toFixed(2),
        swell:this.swellScale?{u:+this.swellScale.u.toFixed(3),intensity:+this.swellScale.intensity.toFixed(3),
          gain:+this.swellScale.gain.toFixed(3),factAt:this.swellFactAt==null?null:+(this.swellFactAt-(this.frontStageAt??0)).toFixed(2)}:null,
        sectors:this.frontSectors.map(s=>({id:s.spec.id,exchanges:s.exchanges,plays:s.plays,
          nextInS:s.nextAt===null?null:+(s.nextAt-this.frontTime).toFixed(2)})),
        recent:this.frontRecent.slice(-12),dugoutSwitches:this.dugoutSwitches,peakShared:this.frontPeakShared,
        columns:this.columns.length},
      artillery:this.artillery.State()};
  }
  Dispose(){
    for(const voice of this.voices)this.audio.FreeVoice?.(voice);this.voices=[];
    for(const e of this.frontVoices)this.audio.FreeVoice?.(e.v);this.frontVoices=[];
    this.frontQueue.length=0;
    this.UpdateColumns(true);
    this.artillery.Dispose();
    this.SetSoundscape(false);
  }
}
