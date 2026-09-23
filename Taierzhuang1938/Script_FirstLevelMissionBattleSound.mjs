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

/** panner inverse（refDistance 64、rolloff 0.9，soundField 那一档）在 r 米处的衰减。 */
function FieldFalloff(r) { return 64 / (64 + 0.9 * Math.max(0, r - 64)); }

export class FirstLevelMissionBattleSound {
  constructor(audio, host = null) {
    this.audio=audio;this.host=host;this.elapsed=0;this.voices=[];this.events=[];this.startedAt=null;
    this.sources=D.sources.map(spec=>({spec,next:spec.first,count:0}));
    // --- 01–06 新声景 -------------------------------------------------------
    this.rng = Mulberry32(0x19380923);
    this.frontTime = 0;
    this.frontStage = null;
    this.frontSectors = D.front.sectors.map((spec) => ({ spec, nextAt: null, exchanges: 0, plays: 0 }));
    this.frontQueue = [];
    this.frontVoices = [];
    this.frontPlays = 0;
    this.frontSkipped = 0;
    this.frontExchanges = 0;
    this.frontRecent = [];
    this.dugoutWant = null;
    this.dugoutSince = 0;
    this.dugoutSwitches = 0;
    this.artillery = new BattleArtillery({
      audio,
      Listener: () => audio?.listenerPos || null,
      Ground: (x, z) => host?.battlefield?.GroundHeight?.(x, z) ?? 0,
      Zone: () => audio?.ListenerZone?.() || null,
      Visual: (at, radius) => host?.vfx?.Explosion?.({ x: at.x, y: at.y + 0.15, z: at.z },
        { radius, kind: "shell", groundY: at.y }),
      Shake: (d, reach) => host?.player?.shake?.Explosion?.(d, reach, false),
      Blocked: (at) => (host?.ai?.soldiers || []).some((s) => s.alive
        && Math.hypot(s.position.x - at.x, s.position.z - at.z) < BATTLE_ARTILLERY.avoidSoldierM),
    });
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
    const live = Math.max(0, Math.min(1, this.audio?.battleIntensity || 0));
    const rate = P.intensity * (1 - F.rateYield * live) * (speaking ? F.speechRate : 1);
    if (stage !== this.frontStage) this.EnterFront(stage);
    for (const sector of this.frontSectors) {
      if (sector.nextAt === null || now < sector.nextAt) continue;
      this.StartExchange(sector);
      const weight = (P.weights?.[sector.spec.id] ?? 1) * sector.spec.weight;
      sector.nextAt = now + this.R(F.gapS[0], F.gapS[1]) / Math.max(0.05, rate * weight)
        + this.QueueSpanS(sector);
    }
    this.DrainFront(P, live);
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
    this.artillery.Update(dt, AP ? { ...AP, firstAfterS: A.firstAfterS } : null,
      { zones: A.zones, rateScale: speaking ? A.speechRate : 1, quiet, stage });
    this.UpdateDugout(stage);
  }

  /** 进一个 01–06 步骤：首场交火 firstWithinS 内起，其余扇区错开。 */
  EnterFront(stage) {
    const F = D.front, P = F.stages[stage];
    const now = this.frontTime;
    const ranked = this.frontSectors.map((s) => ({ s, w: (P.weights?.[s.spec.id] ?? 1) * s.spec.weight }))
      .sort((a, b) => b.w - a.w);
    ranked.forEach(({ s }, i) => {
      s.nextAt = i === 0 ? now + this.R(0.15, F.firstWithinS) : now + F.firstWithinS + this.R(0.8, F.gapS[1]);
    });
    this.frontStage = stage;
  }

  SetSoundscape(on) {
    if (this.audio && this.audio.firstLevelSoundscape !== on) this.audio.firstLevelSoundscape = on;
  }

  LeaveFront() {
    this.frontStage = null;
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
        side === "gun" ? 80 : spec.spreadM),
    });
    const other = (side) => (side === "ija" ? "nra" : "ija");
    const mgOf = (side) => S[side].mg[Math.floor(this.rng() * S[side].mg.length)];
    let t = 0;
    if (kind === "rifleSkirmish") {
      let side = this.rng() < 0.55 ? "ija" : "nra";
      const rounds = this.RI(X.rounds);
      for (let r = 0; r < rounds; r += 1) {
        const shots = this.RI(X.shots);
        for (let i = 0; i < shots; i += 1) { push(t, side, S[side].rifle); t += this.R(X.shotGapS[0], X.shotGapS[1]); }
        t += this.R(X.replyS[0], X.replyS[1]);
        side = other(side);
      }
    } else if (kind === "mgDuel") {
      let side = this.rng() < 0.6 ? "ija" : "nra";
      const rounds = this.RI(X.rounds);
      for (let r = 0; r < rounds; r += 1) {
        const burst = this.RI(side === "ija" ? X.ijaBurst : X.nraBurst);
        const cue = mgOf(side);
        push(t, side, cue, burst);
        // 点射本身占的时长：九二式 200 rpm、其余 500 rpm。
        const span = burst * (cue === "type92Far" ? 0.3 : 0.12);
        if (this.rng() < X.rifleChance) {
          const n = 1 + Math.floor(this.rng() * 3);
          for (let i = 0; i < n; i += 1) push(t + this.R(0.1, span + 0.6), side, S[side].rifle);
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
      if (kind === "barrage" && this.rng() < X.answerChance) push(t + this.R(1, 2.5), "nra", mgOf("nra"), this.RI([3, 6]));
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
    return { position: { x: L.x + dx * k, y: L.y + 3, z: L.z + dz * k }, gain: extra, airCut, distance: d };
  }

  DrainFront(P, live) {
    const F = D.front;
    if (!this.frontQueue.length) return;
    const due = this.frontQueue.filter((e) => e.at <= this.frontTime);
    if (!due.length) return;
    this.frontQueue = this.frontQueue.filter((e) => e.at > this.frontTime);
    const volumeScale = (P.gain ?? 1) * (1 - F.volumeYield * live);
    for (const e of due) {
      if (this.frontVoices.length >= F.maxVoices) { this.frontSkipped += 1; continue; }
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
        sectors:this.frontSectors.map(s=>({id:s.spec.id,exchanges:s.exchanges,plays:s.plays,
          nextInS:s.nextAt===null?null:+(s.nextAt-this.frontTime).toFixed(2)})),
        recent:this.frontRecent.slice(-12),dugoutSwitches:this.dugoutSwitches},
      artillery:this.artillery.State()};
  }
  Dispose(){
    for(const voice of this.voices)this.audio.FreeVoice?.(voice);this.voices=[];
    for(const e of this.frontVoices)this.audio.FreeVoice?.(e.v);this.frontVoices=[];
    this.frontQueue.length=0;
    this.artillery.Dispose();
    this.SetSoundscape(false);
  }
}
