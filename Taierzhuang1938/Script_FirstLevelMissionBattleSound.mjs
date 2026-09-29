// Script_FirstLevelMissionBattleSound.mjs — 第一关离图战场声。
//
// 01–06（Data_FirstLevelMissionBattleSound.front.stages 里有的步骤）走 2026-09-23 的新声景：
//   · FrontExchange：扇区化「一方开火、另一方还击」的远处交火（300 m – 1.5 km）；
//   · BattleArtillery：40–140 m 外无人地带的场外近落弹（先见后闻、震屏、落土）；
//   · 防炮洞环境床：01 整段、02/撤退段按听者空间档在 firstLevelDugout ↔ firstLevelFront 之间交叉淡；
//   · FirstLevelAirRaid：从 01 先头兵经过洞口起，中远处一轮接一轮的日机轰炸（Data_FirstLevelAirRaid）。
// 07 以后仍走原来的五个固定声源循环（Legacy），一行没改。
//
// 2026-09-29「战场声随传令兵显现」：01 的前线不再是一条从进 01 起的计时渐强，而是「洞里战斗间隙（稀、低、闷）→ 传令兵
// 开口那一刻外面的仗显现 → 往近爆推高」。触发是开场导演记的任务事实 runnerCallHeard（Data_..BattleSound.front.stages.
// Trapped.reveal），兜底见那里。显现 = open 由 0 → 1：每一声前线的低通打开、交火翻倍、中距离两圈交火起、远声组的床拉开、
// 一段设计好的序列（机枪、步枪连成片、一发近落弹、日军炮）、配乐让一下。口径见 docs/Data_AudioWiring.md 3d。
//
// 宿主（第二个构造参数）是任务运行时：读 ai（避人）、battlefield（地面）、vfx（画面）、
// player.shake（震屏）、Has（事实）。缺哪样就少哪样，测试夹具只给 audio 也照跑。
// 数全在 Data_FirstLevelMissionBattleSound；口径见 docs/Data_AudioWiring.md「二之三」。
import { MISSION_BATTLE_SOUND as D } from './Data_FirstLevelMissionBattleSound.mjs';
import { BATTLE_ARTILLERY, AIR_ABSORPTION } from './Data_Tuning_Audio.mjs';
import { BattleArtillery } from './Script_BattleArtillery.mjs';
import { FirstLevelAirRaid } from './Script_FirstLevelAirRaid.mjs';
import { FIRST_LEVEL_AIR_RAID } from './Data_FirstLevelAirRaid.mjs';
import { Mulberry32 } from './Script_Noise.mjs';

/** panner inverse（soundField 那一档，参数见 front.fieldRefM / fieldRolloff）在 r 米处的衰减。 */
/** 空袭编队 / 炸弹在 AircraftFlight 编队层里的键。 */
const AIR_RAID_KEY = "firstLevelAirRaid";

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
    this.frontRefused = 0;      // 取证：DrainFront 排出、audio.Play 返回空（预算/去重/距离闸）的声数
    this.frontExchanges = 0;
    this.frontRecent = [];
    this.dugoutWant = null;
    this.dugoutSince = 0;
    this.dugoutSwitches = 0;
    this.columns = [];          // 场外炮弹的土柱烟源：{ handle, until }（frontTime）
    this.frontPeakShared = 0;   // 取证：前线 + 炮击合计的峰值
    // 显现（01 传令兵开口）：见 UpdateReveal。at = 触发时的 frontTime；source = fact / phase / time / peak / enter；
    // open = 洞口「打开」0..1；instant = 进来时就已显现 / 近爆事实先到（不演序列）。
    this.reveal = { at: null, source: null, instant: false, phaseAt: null, open: 0, uAt: 0, holdUntil: 0, beatScale: 1,
      bedsOpen: false, bedsDucked: false, speechUntil: 0, beats: 0, staleFact: false, ducks: 0, shells: 0, cutHz: null };
    this.dirtVoices = [];       // 洞顶落土（前线爆炸带动的）：{ v, until }（frontTime）
    this.dirtPlays = 0;
    this.echoes = 0;            // 取证：排了几条回声（front.echo）
    this.artillery = new BattleArtillery({
      audio,
      Listener: () => audio?.listenerPos || null,
      Ground: (x, z) => host?.battlefield?.GroundHeight?.(x, z) ?? 0,
      Zone: () => audio?.ListenerZone?.() || null,
      Visual: (at, radius) => this.ShellVisual(at, radius),
      // 轻震：直接往创伤桶里加（CameraShake.Explosion 的门槛在 40 m 外一律算成 0）。
      Shake: (trauma) => host?.player?.shake?.AddTrauma?.(trauma),
      Blocked: (at) => this.ShellBlocked(at),
      SharedRoom: (n) => this.SharedBusy() + n <= D.front.sharedMaxVoices,
    }, (this.seed ^ 0x5eed1938) >>> 0);
    // 中远处的日机轮番轰炸：与前线、场外炮击共用 sharedMaxVoices 那一本账；飞机与炸弹画在 host.aircraft 的编队层。
    this.airRaid = new FirstLevelAirRaid({
      audio,
      Listener: () => audio?.listenerPos || null,
      Ground: (x, z) => host?.battlefield?.GroundHeight?.(x, z) ?? 0,
      Zone: () => audio?.ListenerZone?.() || null,
      Visual: (at, blast, d, column) => this.BombVisual(at, blast, column),
      RemoveVisual: (handle) => host?.vfx?.RemoveSmokeSource?.(handle),
      Shake: (trauma) => host?.player?.shake?.AddTrauma?.(trauma),
      Blocked: (at, clearM) => this.ShellBlocked(at, clearM),
      // 自己放声时按「别人 + 本层真在响」算：落弹留位是给前线看的，不挡空袭自己。
      SharedRoom: (n) => this.frontVoices.length + this.dirtVoices.length + this.artillery.Busy() + this.airRaid.Active() + n <= D.front.sharedMaxVoices,
      Formation: (poses) => host?.aircraft?.SetFormation?.(AIR_RAID_KEY, poses),
      Bombs: (list) => host?.aircraft?.SetBombs?.(AIR_RAID_KEY, list),
    }, (this.seed ^ 0xb0b1938) >>> 0);
  }

  /** 前线 + 场外炮击 + 空袭合计占着的声部（契约 §6「场外炮击/前线床 ≤ 8」那一本账；空袭落弹前后按留位算）。 */
  SharedBusy() { return this.frontVoices.length + this.dirtVoices.length + this.artillery.Busy() + (this.airRaid?.Busy() ?? 0); }

  /**
   * 空袭的起点到了没有：01 要等开场导演走到 FrontPass（先头兵经过洞口）；其余步骤进来就算。
   * 宿主没有飞机渲染层（只给 audio 的测试夹具）就不起：炸弹不能从看不见的飞机上掉下来。
   */
  AirRaidStarted(stage) {
    if (typeof this.host?.aircraft?.SetFormation !== "function") return false;
    const S = FIRST_LEVEL_AIR_RAID.start;
    if (stage !== S.stage) return true;
    return !!this.host?.frontShow?.bunker?.beats?.has?.(S.phase);
  }

  /**
   * 空袭落地：按装药缩放的航空炸弹爆炸（vfx.BombBlast：火球、冲击环、抛射土柱、底涌、久留烟团）+
   *（column 时）一根升得过房顶的常驻土柱；返回土柱烟源句柄（到点由空袭层撤源）。
   * blast = { chargeKg, cube, radius, budget, dirX, dirZ }（Script_FirstLevelAirRaid.Impact）；宿主的 vfx
   * 没有 BombBlast（测试夹具）就退回一团 shell 档爆炸。
   */
  BombVisual(at, blast, column = true) {
    const vfx = this.host?.vfx;
    if (!vfx) return null;
    const b = typeof blast === "number" ? { radius: blast } : (blast || {});
    // origin 只给取证 / 测试认「这是空袭那一团」（Vfx 不读它）。
    if (typeof vfx.BombBlast === "function" && b.chargeKg) {
      vfx.BombBlast({ x: at.x, y: at.y, z: at.z }, { chargeKg: b.chargeKg, groundY: at.y, budget: b.budget ?? 1,
        dirX: b.dirX ?? 0, dirZ: b.dirZ ?? 0, origin: "airRaid" });
    } else {
      vfx.Explosion?.({ x: at.x, y: at.y + 0.3, z: at.z }, { radius: b.radius ?? 12, kind: "shell", groundY: at.y, origin: "airRaid" });
    }
    const I = FIRST_LEVEL_AIR_RAID.impact, C = I.column;
    if (!column || typeof vfx.SmokeSource !== "function") return null;
    // 装药大一级，土柱粗一圈、高一截（立方根）。
    const k = b.cube ? Math.max(1, b.cube / I.columnRefCube) : 1;
    return vfx.SmokeSource({ x: at.x, y: at.y + 1, z: at.z }, {
      kind: "dust", rate: C.rate, radius: C.radius * k, rise: C.rise * k, sizeStart: C.sizeStart * k, sizeEnd: C.sizeEnd * k,
      life: C.life, opacity: C.opacity, light: false, origin: "airRaid",
    }) ?? null;
  }

  /** 场外炮弹 / 空袭炸弹不许落的地方：活人身边、在场的战车身边（clearM 缺省按场外炮击的两个距离）。 */
  ShellBlocked(at, clearM = null) {
    const A = BATTLE_ARTILLERY, host = this.host;
    const soldierM = clearM ?? A.avoidSoldierM, vehicleM = clearM ?? A.avoidVehicleM;
    if ((host?.ai?.soldiers || []).some((s) => s.alive
      && Math.hypot(s.position.x - at.x, s.position.z - at.z) < soldierM)) return true;
    const tank = host?.tank;
    return !!(tank?.present && Number.isFinite(tank.x) && Number.isFinite(tank.z)
      && Math.hypot(tank.x - at.x, tank.z - at.z) < vehicleM);
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
    // 空袭在前线床之前推：它先占声部（近、稀、一串要响成一片），前线拿剩下的。07 以后不起新的一轮，天上那一轮飞完。
    this.airRaid.Update(dt, stage, { started: this.AirRaidStarted(stage), speaking,
      scripted: (this.host?.aircraft?.manualPoses?.size ?? 0) > 0 });
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
    // 有 reveal 的步骤里「正在说话」：任务语音在响（宿主给的 speaking），或对白播放器的侧链开着（audio.dialogueYield：01 开场的逐句台词
    // 走对白播放器，StorySpeaking 不一定为真 —— 实测 01 Orders 里侧链开着的时间占 74–78 %）；话停后再算 speech.holdS 秒（句间空隙里床不抽）。
    // 只给显现这一套读（让位 / 序列等话 / 床压低）；前线的对白抽稀（speechRate）与场外炮击仍只认宿主给的 speaking，别的步骤一个数没动。
    this.speaking = !!speaking || !!this.audio?.dialogueYield;
    if (P.reveal?.speech && this.speaking) this.reveal.speechUntil = now + P.reveal.speech.holdS;
    this.speechActive = this.speaking || now < (this.reveal.speechUntil ?? 0);
    // 「同时在响」按每一声自己的可听时长算（cueActiveS），不按引擎的回收时刻：
    // 引擎要等混响尾巴与传播延迟都过去才回收（远处一枪常常五六秒），拿它数声部
    // 会把一秒一两声的交火卡成五秒一声。
    this.frontVoices = this.frontVoices.filter((e) => now < e.until && this.audio?.pendingVoices?.has?.(e.v) !== false);
    this.dirtVoices = this.dirtVoices.filter((e) => now < e.until && this.audio?.pendingVoices?.has?.(e.v) !== false);
    this.UpdateColumns();
    const live = Math.max(0, Math.min(1, this.audio?.battleIntensity || 0));
    // 检查点重来（近爆 / 传令兵的事实被删掉）：整拍重来，回到显现之前。
    if (stage === this.frontStage && this.NeedsRestart(P)) this.RestartFront();
    if (stage !== this.frontStage) this.EnterFront(stage);
    this.UpdateReveal(P);
    // 远声组的床跟着说话让一下（显现之后）：说话时压到 beds.speechScale 倍，话停后放回。
    if (P.reveal && this.reveal.bedsOpen && this.speechActive !== this.reveal.bedsDucked) {
      this.ShapeBeds(P.reveal, true, this.speechActive ? 0.25 : 0.8, this.speechActive);
    }
    const swell = this.UpdateSwell(P);
    const open = this.reveal.open;
    this.reveal.cutHz = this.CurrentCut(P);
    // 序列（显现头几秒）期间，普通扇区的交火先按住：声部让给序列，不然序列一响随机交火也一起冒出来。
    const held = now < this.reveal.holdUntil;
    const rate = P.intensity * swell.intensity * (1 - F.rateYield * live) * (speaking ? (P.speechRate ?? F.speechRate) : 1);
    for (const sector of this.frontSectors) {
      const spec = sector.spec;
      if (spec.ring === "mid") {
        // 中距离圈：显现（open 过 minOpen）之后才起；没显现 / 不在 01 一直不起。
        if (!P.reveal || open < (spec.minOpen ?? 0)) { sector.nextAt = null; continue; }
        if (sector.nextAt === null) { sector.nextAt = now + this.R(0.6, 2.2); sector.swellAt = swell.intensity; }
      }
      // 渐强期间已经排好的等待按强度的涨幅缩短（等于「等待按当前频次走」）：
      // 否则开头按低频次排下的三四十秒空档，要到近爆之后才轮到，前线反而在顶上最稀。
      if (P.swell && sector.nextAt !== null && swell.intensity > sector.swellAt) {
        sector.nextAt = now + Math.max(0, sector.nextAt - now) * sector.swellAt / swell.intensity;
        sector.swellAt = swell.intensity;
      }
      if (sector.nextAt === null || now < sector.nextAt) continue;
      if (held) { sector.nextAt = Math.max(sector.nextAt, this.reveal.holdUntil + this.R(0, 2.5)); continue; }
      this.StartExchange(sector);
      const weight = (P.weights?.[spec.id] ?? 1) * spec.weight;
      sector.nextAt = now + this.R(F.gapS[0], F.gapS[1]) / Math.max(0.05, rate * weight)
        + this.QueueSpanS(sector);
      sector.swellAt = swell.intensity;
    }
    this.DrainFront(P, live, swell.gain);
    // 场外近落弹。
    const A = D.artillery;
    let AP = A.stages[stage] || null;
    // 01：显现前 / 显现后两套（perMin、音量、低通），按 open 插值。
    if (AP?.lull && AP.open) AP = { ...AP, ...this.LerpProfile(AP.lull, AP.open, open) };
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
      { zones: A.zones, rateScale: speaking ? (AP?.speechRate ?? A.speechRate) : 1, quiet, stage });
    this.frontPeakShared = Math.max(this.frontPeakShared,
      this.frontVoices.length + this.dirtVoices.length + this.artillery.voices.length + this.airRaid.Active());
    this.UpdateDugout(stage);
  }

  /** 两套数按 open 插值：perMin 线性、gain 与 airCut 在对数上（分贝 / 倍频程上线性）。 */
  LerpProfile(a, b, t) {
    const out = {};
    for (const key of Object.keys(b)) {
      const x = a[key], y = b[key];
      if (!Number.isFinite(x) || !Number.isFinite(y)) { out[key] = y; continue; }
      out[key] = key === "perMin" ? x + (y - x) * t : x * Math.pow(y / Math.max(1e-6, x), t);
    }
    return out;
  }

  /**
   * 检查点重来：近爆事实（或显现的事实）被删掉了，而我们已经见过它 —— 前线回到进 01 那一刻的样子。
   * 只认「已经见过又没了」：从没见过的不算（进 01 时事实本来就没有）。
   */
  NeedsRestart(P) {
    const host = this.host;
    if (!host?.Has || !P?.reveal) return false;
    const V = this.reveal, peak = P.swell?.peakFact;
    if (peak && this.swellFactAt != null && !host.Has(peak)) return true;
    if (V.at != null && V.source === "fact" && !host.Has(P.reveal.fact) && !(peak && host.Has(peak))) return true;
    return false;
  }

  /** 整拍重来：清掉显现与渐强的状态，下一步 EnterFront 按「进 01」重排。传令兵的事实若仍留着，等它被删再认。 */
  RestartFront() {
    const P = D.front.stages[this.frontStage];
    const R = P?.reveal;
    this.reveal.staleFact = !!(R && this.host?.Has?.(R.fact));
    if (R) this.ShapeBeds(R, false, R.beds?.releaseS ?? 2);
    this.frontQueue.length = 0;
    this.frontStage = null;
  }

  // =========================================================================
  // 01 传令兵开口：外面的仗显现
  // =========================================================================

  /**
   * 每帧一次（只有带 reveal 的步骤，现在是 01）。触发一到就 StartReveal；open 是触发后 riseS 秒里的平滑 0 → 1。
   * 触发源（先到先算）：
   *   fact   开场导演在传令兵远喊那句真正开始播放的那一刻记下的 runnerCallHeard（A1）；
   *   peak   近爆事实先到了（导演走得快 / 调试入口）：没有序列，直接显现；
   *   phase  兜底一：导演相位进了 fallback.phase 之后 afterS 秒（只读 host.frontShow.bunker，不改导演）；
   *   time   兜底二：进 01 后 fallback.stageS 秒（没有导演的夹具；导演卡住的保险）。
   */
  UpdateReveal(P) {
    const V = this.reveal, R = P.reveal, host = this.host;
    if (!R) { V.open = 0; return; }
    const now = this.frontTime, age = now - (this.frontStageAt ?? now);
    if (V.staleFact && !host?.Has?.(R.fact)) V.staleFact = false;
    if (V.at == null) {
      const peak = !!(P.swell?.peakFact && host?.Has?.(P.swell.peakFact));
      let source = null;
      if (host?.Has?.(R.fact) && !V.staleFact) source = V.enterFact ? "enter" : "fact";
      else if (peak) source = "peak";
      else {
        const bunker = host?.frontShow?.bunker, FB = R.fallback;
        if (bunker && (bunker.phase === FB.phase || bunker.beats?.has?.(FB.phase))) {
          V.phaseAt ??= now;
          if (now - V.phaseAt >= FB.afterS) source = "phase";
        }
        if (!source && age >= (bunker ? FB.stuckS : FB.stageS)) source = "time";
      }
      if (source) this.StartReveal(P, source);
    }
    const k = V.at == null ? 0 : (V.instant ? 1 : Math.min(1, Math.max(0, (now - V.at) / Math.max(1e-3, R.riseS))));
    V.open = k * k * (3 - 2 * k);
  }

  /** 显现开始：序列排进队列、配乐让一下、远声组的床拉开。instant（peak / enter）只拉开，不演序列。 */
  StartReveal(P, source) {
    const V = this.reveal, R = P.reveal, now = this.frontTime;
    V.at = now; V.source = source; V.uAt = this.swellU ?? 0;
    V.instant = source === "peak" || source === "enter";
    // 序列的音量固定在「显现完成」那一档（这一刻 swell 还在 lull，按当前的会轻 9 dB，序列一头一尾不一样响）。
    V.beatScale = (P.gain ?? 1) * this.GainAt(P, R.revealU);
    if (V.instant) {
      // 进来时已经显现：uAt 直接落在 revealU（swell.u 不再从 lull 爬）。
      if (source === "enter") V.uAt = R.revealU;
      this.ShapeBeds(R, true, 0.3);
      return;
    }
    V.holdUntil = now + R.holdS;
    this.QueueRevealBeats(R, now);
    if (R.musicDuck?.seconds > 0) { this.audio?.Duck?.(R.musicDuck.seconds, R.musicDuck.amount); V.ducks += 1; }
    this.ShapeBeds(R, true, R.riseS);
  }

  /** swell 在 u 处的 gain 倍率（与 UpdateSwell 同一条公式）。 */
  GainAt(P, u) {
    const S = P.swell;
    if (!S) return 1;
    const w = Math.pow(Math.min(1, Math.max(0, u)), S.curve ?? 1);
    return Math.pow(Math.max(1e-4, S.gainFrom ?? 1), 1 - w);
  }

  /** 远声组的床：显现时拉开（level × cut ×），离开 01 时收回。audio.ShapeFarBeds 没有（夹具）就跳过。 */
  ShapeBeds(R, open, rampS, ducked = false) {
    const V = this.reveal;
    if (typeof this.audio?.ShapeFarBeds !== "function") { V.bedsOpen = open; V.bedsDucked = ducked; return; }
    if (V.bedsOpen === open && V.bedsDucked === ducked) return;
    const level = open ? R.beds.level * (ducked ? (R.beds.speechScale ?? 1) : 1) : 1;
    this.audio.ShapeFarBeds(open ? { level, cut: R.beds.cut, rampS } : { level: 1, cut: 1, rampS });
    V.bedsOpen = open; V.bedsDucked = open && ducked;
  }

  /**
   * 每一声前线的低通（Hz）。没有 reveal 的步骤 = stages[].airCut。有 reveal：显现前 = airCut（隔着土），
   * 显现后按 open 在对数上滑到 cut.open，近爆之后（peakFact 出现）afterBlastS 秒里滑到 cut.afterBlast。
   */
  CurrentCut(P) {
    const base = P.airCut ?? 20000, R = P.reveal;
    if (!R) return base;
    const open = this.reveal.open;
    let hz = base * Math.pow(R.cut.open / base, open);
    if (this.swellFactAt != null) {
      const b = Math.min(1, Math.max(0, (this.frontTime - this.swellFactAt) / Math.max(1e-3, R.cut.afterBlastS)));
      hz *= Math.pow(R.cut.afterBlast / hz, b);
    }
    return hz;
  }

  /**
   * 序列排进队列（时刻相对 t0）。位置是世界坐标（在给定点周围 spreadM 里另挑），走 DrainFront 与随机交火同一条路
   * （声部账、Place、selfCapped、yieldFirst、frontRecent），带 scripted 标：低通用 cut.open、音量用 V.beatScale × gainDb、
   * 声部上限用 scriptedMaxVoices。shell 那一条交给 BattleArtillery.Scripted。
   */
  QueueRevealBeats(R, t0) {
    const F = D.front, S = F.sides, V = this.reveal;
    const push = (at, entry) => this.frontQueue.push({ at: t0 + at, sector: "Reveal", kind: "reveal", scripted: true, burst: null,
      gainDb: 0, ...entry });
    for (const b of R.beats) {
      const ys = !!b.yieldSpeech;
      if (b.kind === "burst") {
        push(b.at, { side: b.side, cue: b.cue, burst: b.burst, gainDb: b.gainDb ?? 0, yieldSpeech: ys, key: b.id, afterId: b.after, gap: b.gap,
          pos: this.Jitter(b.pos, b.spreadM ?? 20) });
      } else if (b.kind === "crackle") {
        for (let i = 0; i < b.shots; i += 1) {
          const spot = b.spots[i % b.spots.length];
          // 窗口里等分再各自抖开：不是等间隔机关枪，也不会挤成一团。
          const at = b.at + (b.to - b.at) * (i + this.rng() * 0.85) / b.shots;
          push(at, { side: spot.side, cue: S[spot.side].rifle, gainDb: b.gainDb ?? 0, filler: true, pos: this.Jitter(spot, b.spreadM ?? 25) });
        }
      } else if (b.kind === "shell") {
        push(b.at, { side: "shell", cue: null, yieldSpeech: ys, key: b.id });
      } else if (b.kind === "gunImpact") {
        const gun = F.guns[Math.floor(this.rng() * F.guns.length)];
        push(b.at, { side: "gun", cue: S.ija.gun, gainDb: b.gainDb ?? 0, yieldSpeech: ys, pos: this.Jitter(gun, F.gunSpreadM) });
        push(b.at + b.flightS, { side: "impact", cue: S.ija.impact, gainDb: b.gainDb ?? 0, yieldSpeech: ys, pos: this.Jitter(b.impact, b.spreadM ?? 25) });
      }
      V.beats += 1;
    }
    this.frontQueue.sort((a, b) => a.at - b.at);
  }

  /** 序列里那一发场外近落弹：BattleArtillery 的落点挑选（避人避车）、留位与落土、洞顶掉土；啸声一定有。 */
  FireRevealShell() {
    const A = D.artillery, AP = A.stages.Trapped;
    if (!AP?.open) return;
    const profile = { ...AP, ...AP.open, firstAfterS: A.firstAfterS, firstSpreadS: A.firstSpreadS };
    const at = this.artillery.Scripted(profile, A.zones, { incoming: true });
    if (at) this.reveal.shells += 1;
  }

  /** 进一个 01–06 步骤：首场交火 firstWithinS 内起，其余扇区错开。 */
  EnterFront(stage) {
    const F = D.front, P = F.stages[stage];
    const now = this.frontTime;
    // 中距离圈（ring: "mid"）不在这里排：显现之后才起（UpdateFront）。
    const ranked = this.frontSectors.filter((s) => s.spec.ring !== "mid")
      .map((s) => ({ s, w: (P.weights?.[s.spec.id] ?? 1) * s.spec.weight }))
      .sort((a, b) => b.w - a.w);
    for (const s of this.frontSectors) if (s.spec.ring === "mid") { s.nextAt = null; s.swellAt = 1; }
    // 有渐强的步骤（01）其余扇区的第一场按起始频次往后摊（首场仍在 firstWithinS 内），
    // 不然五个扇区在头十几秒里各打一场，渐强的开头反而最密。没有渐强的步骤倍率为 1，一个数不变。
    // 进来时 peakFact 已经为真（近爆之后从调试入口 / 读档进 01）：直接在顶上，不再从底爬
    //（2026-09-24 审查：原来 swellU 清零后 catchUpS 从 0 补起，头两秒的声音轻 7 dB 上下）。
    const atTop = !!(P.swell?.peakFact && this.host?.Has?.(P.swell.peakFact));
    const from = P.swell && !atTop ? (P.swell.intensityFrom ?? 1) : 1;
    ranked.forEach(({ s }, i) => {
      s.nextAt = i === 0 ? now + this.R(0.15, F.firstWithinS) : now + F.firstWithinS + this.R(0.8, F.gapS[1]) / from;
      s.swellAt = from;
    });
    this.frontStage = stage;
    this.frontStageAt = now;
    this.swellU = atTop ? 1 : 0;
    this.swellFactAt = atTop ? now : null;
    this.swellFactFrom = atTop ? 1 : 0;
    // 显现状态重置。换到没有 reveal 的步骤（01 → 02）：远声组的床在 releaseS 秒里收回预设原来的样子。
    const V = this.reveal, prev = V.bedsOpen, prevR = V.lastR;
    this.reveal = { at: null, source: null, instant: false, phaseAt: null, open: 0, uAt: 0, holdUntil: 0, beatScale: 1,
      bedsOpen: prev, bedsDucked: false, speechUntil: 0, beats: 0, staleFact: V.staleFact, ducks: 0, shells: 0, cutHz: null, enterFact: false, lastR: P.reveal || null };
    if (!P.reveal && prev) this.ShapeBeds(prevR || { beds: { releaseS: 4 } }, false, (prevR?.beds?.releaseS) ?? 4);
    // 没有显现的步骤（02 起）：01 里排下的序列 / 中距离圈的声不带进来。
    if (!P.reveal) {
      const mid = new Set(this.frontSectors.filter((sec) => sec.spec.ring === "mid").map((sec) => sec.spec.id));
      this.frontQueue = this.frontQueue.filter((e) => !e.scripted && !mid.has(e.sector));
    }
    if (P.reveal && this.host?.Has?.(P.reveal.fact) && !V.staleFact) this.reveal.enterFact = true;
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
    // 有 reveal 的步骤（01）：u 跟着剧情走 —— 显现前只从 0 慢爬到 lullU；显现那 riseS 秒从 uAt 爬到 revealU（与 open 同一条平滑曲线）；
    // 之后 buildS 秒推到 1。没有 reveal 的步骤仍是「进步骤后 riseS 秒到顶」的计时曲线。
    const R = P.reveal, V = this.reveal;
    let u;
    if (R) {
      if (V.at == null) u = R.lullU * Math.min(1, age / Math.max(1e-3, R.lullRiseS));
      else {
        const t = this.frontTime - V.at;
        u = !V.instant && t < R.riseS ? V.uAt + (R.revealU - V.uAt) * V.open
          : R.revealU + (1 - R.revealU) * Math.min(1, Math.max(0, (t - (V.instant ? 0 : R.riseS)) / Math.max(1e-3, R.buildS)));
      }
    } else u = Math.min(1, age / Math.max(1e-3, S.riseS));
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
    if (this.reveal.bedsOpen) this.ShapeBeds(this.reveal.lastR || { beds: { releaseS: 4 } }, false, this.reveal.lastR?.beds?.releaseS ?? 4);
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

  /** 抽一种交火。kinds（扇区的 kinds）给了就只在这几种里抽：中距离圈只打步枪与机枪，不打炮（炮落在 175 m 上是一声比台词还响的爆炸）。 */
  PickExchange(kinds = null) {
    const all = Object.entries(D.front.exchanges), E = kinds ? all.filter(([kind]) => kinds.includes(kind)) : all;
    const total = E.reduce((n, [, e]) => n + e.weight, 0);
    let roll = this.rng() * total;
    for (const [kind, spec] of E) { roll -= spec.weight; if (roll <= 0) return [kind, spec]; }
    return E[0];
  }

  /** 起一场交火：把整段来回排进队列（时刻相对现在）。 */
  StartExchange(sector) {
    const F = D.front, S = F.sides, spec = sector.spec;
    const [kind, X] = this.PickExchange(spec.kinds || null);
    const t0 = this.frontTime;
    const push = (at, side, cue, burst = null) => this.frontQueue.push({
      at: t0 + at, sector: spec.id, kind, side, cue, burst, gainDb: spec.gainDb || 0,
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
    // 引擎按摆放距离算空气吸收；摆近了的那一段按真实距离补上（同一条 ISO 9613-1 曲线）。
    const A = AIR_ABSORPTION;
    const airCut = d > placed ? Math.max(A.floorHz, Math.min(20000, A.refHz * Math.pow(A.refM / d, A.exponent))) : 20000;
    return { position: { x: L.x + dx * k, y: L.y + F.placeRiseM, z: L.z + dz * k }, gain: extra, airCut, distance: d };
  }

  DrainFront(P, live, swellGain = 1) {
    const F = D.front;
    if (!this.frontQueue.length) return;
    const due = this.frontQueue.filter((e) => e.at <= this.frontTime);
    if (!due.length) return;
    this.frontQueue = this.frontQueue.filter((e) => e.at > this.frontTime);
    const yieldScale = 1 - F.volumeYield * live;
    // 显现之后说话时：新起的前线声再压 speech.dipDb（侧链之上的一层，见 stages.Trapped.reveal.speech）。
    const dipDb = P.reveal?.speech && this.speechActive ? P.reveal.speech.dipDb : 0;
    const volumeScale = (P.gain ?? 1) * swellGain * yieldScale * Math.pow(10, dipDb / 20);
    // 显现序列的声（scripted）：音量固定在「显现完成」那一档，低通开到 cut.open，声部上限用 scriptedMaxVoices。
    const V = this.reveal, R = P.reveal;
    // 声部上限：屏幕上打得凶时收紧；与场外炮击合计不过 sharedMaxVoices（炮击留的位也算）。
    const cap = live > F.hotAbove ? Math.min(F.maxVoices, F.maxVoicesHot) : F.maxVoices;
    // 随机交火用「当前」的低通（按 open 滑动）；没有 reveal 的步骤就是 stages[].airCut。
    const cutNow = V.cutHz ?? P.airCut ?? 20000;
    const speech = R?.speech, speaking = !!this.speechActive;
    // 序列里「跟在某一件后面」的（afterId）：前一件（key）响过 / 被跳过之后才排 gap 秒响，机枪一梭延后了，回击也跟着延后。
    const Release = (e) => {
      if (!e.key) return;
      for (const q of this.frontQueue) if (q.afterId === e.key) { q.afterId = null; q.at = Math.max(q.at, this.frontTime + (q.gap ?? 0)); }
    };
    for (const e of due) {
      const scripted = !!e.scripted && !!R;
      if (e.afterId) {
        if (this.frontTime - e.at < (speech?.deferS ?? 0) + 4) { this.frontQueue.push(e); continue; }
        e.afterId = null;   // 前一件一直没响（不该发生）：不让它拖住整条序列
      }
      // 序列里标了 yieldSpeech 的大件：正说着话就往后让（最多 speech.deferS 秒），等一句话过去再响。
      if (scripted && e.yieldSpeech && speaking && speech && this.frontTime - e.at < speech.deferS) { this.frontQueue.push(e); continue; }
      // 序列里的近落弹交给 BattleArtillery（自己的留位与声部账），不占前线声部。
      if (e.side === "shell") { this.FireRevealShell(); Release(e); continue; }
      // 步枪噼啪是填充（filler）：留两条声部给机枪一梭、回击与炮，噼啪自己稀一点，不能把大件挤掉。
      const limit = scripted ? F.scriptedMaxVoices - (e.filler ? F.scriptedFillerReserve : 0) : cap;
      if (this.frontVoices.length >= limit || this.SharedBusy() >= F.sharedMaxVoices) { this.frontSkipped += 1; Release(e); continue; }
      const place = this.Place(e.pos);
      const jitter = this.R(F.jitterVolume[0], F.jitterVolume[1]);
      const dB = (x) => Math.pow(10, x / 20);
      const volume = (F.cueVolume[e.cue] ?? 0.5) * (scripted ? V.beatScale * yieldScale * dB((e.gainDb || 0) + dipDb)
        : volumeScale * dB(e.gainDb || 0)) * place.gain * jitter;
      const voice = this.audio?.Play?.(e.cue, {
        position: place.position, volume, soundField: true, bus: "sfx",
        // 声部数由上面的 cap / sharedMaxVoices 管着，不再让引擎按「远 = 低优先级」再砍一道
        //（Script_Audio.Play 的 selfCapped；01 黑屏里前线整段被饿死就是这一道）。
        selfCapped: true,
        // 预算紧时对更近的新声无条件让位（Script_Audio.StealVoices）；空袭炸弹、场外炮击不带这个标。
        yieldFirst: true,
        // 位置是摆出来的（placeMaxM），不加声速延迟：没有画面要对，空等的那 1–2.6 s 节点最容易被偷掉。
        // 交火「一方开火、另一方还击」的间隔与炮弹飞行时间都已经排在队列里。
        propagate: false,
        airCut: Math.min(place.airCut, scripted ? R.cut.open : cutNow) * (e.echo ? F.echo.cutFactor : 1),
        burst: e.burst ?? undefined,
      });
      if (voice) {
        const shot = F.mgShotS[e.cue] ?? F.mgShotS.default;
        let active = (F.cueActiveS[e.cue] ?? 1.5) + (e.burst ? e.burst * shot : 0);
        if (e.filler) active = Math.min(active, F.scriptedFillerActiveS);
        this.frontVoices.push({ v: voice, until: this.frontTime + active });
        this.frontPlays += 1;
        // 炮弹落在前线：洞里的顶板跟着掉土（P.roofDirt 的步骤）。回声不算。
        if (P.roofDirt && !e.echo && (e.side === "impact" || (e.cue === "explosionFar" && e.side !== "gun"))) this.RoofDirt(place.distance);
        if (R && !e.echo && F.echo && V.open >= F.echo.fromOpen) this.MaybeEcho(e);
      } else this.frontRefused += 1;   // 排出了、引擎没收（与 frontSkipped「自己的声部上限」分开记）
      const sector = this.frontSectors.find((s) => s.spec.id === e.sector);
      if (sector && voice) sector.plays += 1;
      this.frontRecent.push({ at: +this.frontTime.toFixed(2), sector: e.sector, kind: e.kind, side: e.side, cue: e.cue,
        distance: Math.round(place.distance), volume: +volume.toFixed(3), played: !!voice });
      if (this.frontRecent.length > 32) this.frontRecent.shift();
      Release(e);
    }
  }

  /** 远处枪炮的回声尾巴（front.echo）：同一条 cue 从另一个方位、更远、更闷、更轻地再来一次。 */
  MaybeEcho(e) {
    const E = D.front.echo, L = this.audio?.listenerPos, chance = E.chance[e.cue];
    if (!chance || !L || !e.pos || this.rng() >= chance) return;
    const dx = e.pos.x - L.x, dz = e.pos.z - L.z;
    const turn = (this.rng() < 0.5 ? -1 : 1) * this.R(E.turnDeg[0], E.turnDeg[1]) * Math.PI / 180;
    const c = Math.cos(turn), s = Math.sin(turn);
    this.frontQueue.push({ at: this.frontTime + this.R(E.delayS[0], E.delayS[1]), sector: e.sector, kind: "echo", side: e.side, cue: e.cue,
      burst: e.burst ? Math.max(2, Math.round(e.burst * E.burstShare)) : null,
      pos: { x: L.x + (dx * c - dz * s) * E.distanceScale, z: L.z + (dx * s + dz * c) * E.distanceScale },
      gainDb: (e.gainDb || 0) + E.gainDb, scripted: !!e.scripted, filler: true, echo: true });
    this.echoes += 1;
  }

  /**
   * 前线的一发炮落下来，洞顶掉一点土（front.roofDirt）：ground wave 比空气声先到，所以几乎与爆炸同时，不加距离延迟。
   * 概率随 open 由 chance → chanceOpen，越远越轻；本层同时 ≤ maxVoices 条，并进共享账。
   */
  RoofDirt(distance) {
    const D2 = D.front.roofDirt, L = this.audio?.listenerPos;
    if (!D2 || !L || distance > D2.maxM || typeof this.audio?.Play !== "function") return;
    const chance = D2.chance + (D2.chanceOpen - D2.chance) * this.reveal.open;
    if (this.rng() >= chance) return;
    if (this.dirtVoices.length >= D2.maxVoices || this.SharedBusy() + 1 > D.front.sharedMaxVoices) return;
    const a = this.rng() * Math.PI * 2, delay = this.R(D2.delayS[0], D2.delayS[1]);
    const near = 1 - 0.6 * Math.min(1, distance / D2.maxM);
    const v = this.audio.Play(D2.cue, {
      position: { x: L.x + Math.sin(a) * D2.offsetM, y: L.y + D2.riseM, z: L.z + Math.cos(a) * D2.offsetM },
      volume: D2.volume * near * (0.75 + this.rng() * 0.5), airCut: D2.airCut, delay, selfCapped: true,
    });
    if (v) { this.dirtVoices.push({ v, until: this.frontTime + delay + D2.activeS }); this.dirtPlays += 1; }
  }

  /** 01–02 防炮洞环境床：整段在洞里的步骤直接切；其余按听者空间档、带滞回地切。 */
  UpdateDugout(stage) {
    const G = D.dugout, mode = G.stages[stage];
    const audio = this.audio;
    if (!mode || typeof audio?.Ambience !== "function") { this.dugoutWant = null; return; }
    // 按步骤换一对预设（dugout.presets；开场两步用远处战场床走远声组的那两档）。
    const pair = G.presets?.[stage] || G;
    const want = mode === "forced" ? pair.preset
      : (audio.ListenerZone?.() === "dugout" ? pair.preset : pair.outside);
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
        // 【2026-09-27】bus 'ambience' → 'far'：这五条是 09-07 按环境推子 1 配的远处前线，09-11 环境推子默认改成 10 % 之后
        // 跟着风声一起被压了 −22 dB（07 以后远处的仗「完全听不见」的一大半）。远处的仗走远声组，不归环境推子（见
        // Script_Audio.FAR_BATTLE_AMBIENCE_GAIN 的抬头）。电平不换算：远声组没有环境总线那道 ×0.8，净比设计值高 +1.9 dB。
        airCut:Math.min(s.airCut,profile.airCut??Infinity),burst:s.burst,bus:'far',soundField:true};
      const voice=this.audio.Play(s.cue,options);
      if(voice)this.voices.push(voice);
      this.events.push({id:s.id,cue:s.cue,at:this.elapsed,stage,position:options.position,volume:options.volume,played:!!voice});
      if(this.events.length>48)this.events.shift();
    }
  }

  State(){
    return {elapsed:this.elapsed,sources:this.sources.map(s=>({id:s.spec.id,count:s.count})),recent:this.events.slice(-12),
      front:{stage:this.frontStage,time:+this.frontTime.toFixed(2),exchanges:this.frontExchanges,plays:this.frontPlays,
        skipped:this.frontSkipped,refused:this.frontRefused,queued:this.frontQueue.length,voices:this.frontVoices.length,
        stageTime:this.frontStage===null?null:+(this.frontTime-(this.frontStageAt??this.frontTime)).toFixed(2),
        swell:this.swellScale?{u:+this.swellScale.u.toFixed(3),intensity:+this.swellScale.intensity.toFixed(3),
          gain:+this.swellScale.gain.toFixed(3),factAt:this.swellFactAt==null?null:+(this.swellFactAt-(this.frontStageAt??0)).toFixed(2)}:null,
        sectors:this.frontSectors.map(s=>({id:s.spec.id,exchanges:s.exchanges,plays:s.plays,
          nextInS:s.nextAt===null?null:+(s.nextAt-this.frontTime).toFixed(2)})),
        recent:this.frontRecent.slice(-12),dugoutSwitches:this.dugoutSwitches,peakShared:this.frontPeakShared,
        columns:this.columns.length,dirtPlays:this.dirtPlays,echoes:this.echoes,
        reveal:{at:this.reveal.at==null?null:+(this.reveal.at-(this.frontStageAt??0)).toFixed(2),source:this.reveal.source,
          open:+this.reveal.open.toFixed(3),beats:this.reveal.beats,shells:this.reveal.shells,ducks:this.reveal.ducks,
          cutHz:this.reveal.cutHz==null?null:Math.round(this.reveal.cutHz),bedsOpen:this.reveal.bedsOpen}},
      artillery:this.artillery.State(),airRaid:this.airRaid.State()};
  }
  Dispose(){
    for(const voice of this.voices)this.audio.FreeVoice?.(voice);this.voices=[];
    for(const e of this.frontVoices)this.audio.FreeVoice?.(e.v);this.frontVoices=[];
    for(const e of this.dirtVoices)this.audio.FreeVoice?.(e.v);this.dirtVoices=[];
    if(this.reveal.bedsOpen)this.ShapeBeds(this.reveal.lastR||{beds:{releaseS:0}},false,0.1);
    this.frontQueue.length=0;
    this.UpdateColumns(true);
    this.artillery.Dispose();
    this.airRaid.Dispose();
    this.SetSoundscape(false);
  }
}
