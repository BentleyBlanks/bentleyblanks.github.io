// Script_BattleArtillery.mjs — 场外近落弹调度（2026-09-23，第一关 01–06 声景）。
//
// 「炮火就在附近」的氛围层：落在 40–140 m 外无人地带的炮弹。**不伤人、不改地形、
// 不进压制账、不进 TTK** —— 真正打人的炮弹由 Script_Combat 与战车负责，这一层只负责
// 让玩家知道「这片地一直在挨炮」。
//
// 一发的时间线（t = 落地那一刻）：
//   t − incomingLeadS  来袭啸声（一部分炮弹才有）
//   t                  画面：vfx.Explosion + 一根越得过沟沿的短命土柱（先见）
//   t + d/340          声音：中/远档爆炸 + 一条压到 400 Hz 以下的低频冲击层（后闻，引擎按距离延迟）
//   t + d/340          震屏：一记轻震（创伤桶小量，跟着声音到，不跟着画面）；洞里更重
//   t + d/340 + 0.3 s  听者在沟里/洞里：耳边沟壁/洞顶沙沙落土
//   t + 1.1–2.1 s      近的那几发：土块砸回沟里（碎土雨）
//
// 声部账（2026-09-24 审查后改）：每一条声音登记之前都查上限（本层 maxVoices，与前线合计
// 由宿主的 SharedRoom 管）。落一发先留出爆炸本体 + 低频层两条（有啸声的那一发从啸声起就留着），
// 落土与碎土雨有空才放。
//
// **纯规则，不 import three**：宿主把世界能力用函数交进来（地面、听者、空间档、画面、震屏、
// 避人、共享声部），测试用假宿主直接跑。随机走 Mulberry32，逐轮可复现。
// 数：机制在 Data_Tuning_Audio.BATTLE_ARTILLERY，落在哪、多密在关卡数据
// （Data_FirstLevelMissionBattleSound.artillery）。

import { Mulberry32, Clamp01 } from "./Script_Noise.mjs";
import { BATTLE_ARTILLERY } from "./Data_Tuning_Audio.mjs";

const SPEED_OF_SOUND = 340;
/** 一发炮弹必须留得出的声部：爆炸本体 + 低频层。 */
const SHELL_SLOTS = 2;

export class BattleArtillery {
  /**
   * @param {object} host
   * @param {object} host.audio           AudioEngine（Play / pendingVoices / listenerPos）
   * @param {function} [host.Ground]      (x, z) → 地面高度
   * @param {function} [host.Listener]    () → {x,y,z}（缺省读 audio.listenerPos）
   * @param {function} [host.Zone]        (pos) → 空间档（"trench" / "dugout" / …）
   * @param {function} [host.Visual]      (pos, radius, distanceM) → 画面那一团
   * @param {function} [host.Shake]       (trauma, distanceM) → 震屏（往创伤桶里加这么多）
   * @param {function} [host.Blocked]     (pos) → true 表示这里有人/有车，不许落
   * @param {function} [host.SharedRoom]  (n) → 与前线合计还放得下 n 条吗（缺省放得下）
   * @param {number}   [seed]
   * @param {object}   [tuning]           默认 BATTLE_ARTILLERY；测试可注入
   */
  constructor(host, seed = 0x5eed1938, tuning = BATTLE_ARTILLERY) {
    this.host = host;
    this.T = tuning;
    this.rng = Mulberry32(seed >>> 0);
    this.time = 0;
    this.nextAt = null;
    this.pending = [];          // 排了时刻还没发生的动作：{ at, kind, … }
    this.voices = [];
    this.reserved = 0;          // 啸声已起、还没落地的那一发替自己留着的声部
    this.shells = 0;            // 取证：落了几发
    this.skipped = 0;           // 取证：挑不到落点 / 声部满了跳过几发
    this.thinned = 0;           // 取证：对白期间按 rateScale 抽掉的几发
    this.layersDropped = 0;     // 取证：声部满了没放的附属层（落土、碎土雨、低频层）
    this.peakVoices = 0;        // 取证：本层同时在响的峰值
    this.events = [];           // 最近几发（取证）
    this.stage = null;
    this.firstOfStage = false;
    this.zoneOverride = null;
  }

  R(min, max) { return min + (max - min) * this.rng(); }

  Listener() {
    const L = this.host.Listener?.() || this.host.audio?.listenerPos;
    return L ? { x: L.x, y: L.y, z: L.z } : null;
  }

  /** 听者现在算在哪个空间档（这一步的档给了 listenerZone 就用它：01 整段在洞里）。 */
  ListenerZone(L) {
    return this.zoneOverride || (L ? this.host.Zone?.(L) : null) || null;
  }

  /** 本层占着的声部（含替还没落地的那一发留的）。 */
  Busy() { return this.voices.length + this.reserved; }

  /** 还放得下 n 条吗：本层上限 + 与前线合计的上限。 */
  Room(n = 1) {
    if (this.Busy() + n > this.T.maxVoices) return false;
    return this.host.SharedRoom ? this.host.SharedRoom(n) !== false : true;
  }

  /**
   * 每帧一次。
   * @param {number} dt
   * @param {object|null} profile  这一步的炮击档（null = 不落，已排的照常发生完）
   * @param {object} [ctx] { zones:[矩形], rateScale:number, quiet:boolean }
   */
  Update(dt, profile, { zones = [], rateScale = 1, quiet = false, stage = null } = {}) {
    this.time += Math.max(0, dt);
    // 这一步整体隔着什么（01 在洞里）：给了 airCut 的档，每一声再压一道高频。
    this.airCut = profile?.airCut || 0;
    this.zoneOverride = profile?.listenerZone || null;
    // 声部按可听时长算（until），不等引擎回收（见 FirstLevelMissionBattleSound 同一条注释）。
    this.voices = this.voices.filter((e) => this.time < e.until && this.host.audio?.pendingVoices?.has?.(e.v) !== false);
    this.RunPending();
    // 【2026-09-23 取证后改】进一步头一发落在 firstAfterS + [0, firstSpreadS) 里。
    // 原来是 firstAfterS + 半个间隔，而且间隔按「这一刻在不在说话」放大：进步骤时
    // 正好有对白，头一发就被推到四五十秒以后 —— 实机 01–05 五个 25 s 窗口一发没落。
    if (stage !== this.stage) {
      this.stage = stage;
      this.nextAt = profile ? this.time + (profile.firstAfterS ?? 0) + this.R(0, profile.firstSpreadS ?? 0) : null;
      this.firstOfStage = !!profile;
    }
    if (!profile || !(profile.perMin > 0)) { this.nextAt = null; return; }
    if (this.nextAt === null) this.nextAt = this.time + this.NextGap(profile);
    if (this.time < this.nextAt) return;
    // 间隔一律按本档的频次排；对白只在「到点这一发落不落」上抽稀（泊松抽稀：
    // 留下的概率 = rateScale）。这样说话时密度 × rateScale，话一停就回到本档，
    // 不会因为排间隔那一刻正在说话而空一分钟。
    this.nextAt = this.time + this.NextGap(profile);
    if (quiet) return;
    // 【2026-09-24 审查后改】进一步的头一发不抽稀：01–03 对白密，头一发常被抽掉，
    // 再等一个整间隔（均值二十多秒）才来 —— 「进来几秒就有一发」的承诺落空。
    if (!this.firstOfStage && rateScale < 1 && this.rng() >= rateScale) { this.thinned += 1; return; }
    this.firstOfStage = false;
    this.Fire(profile, zones);
  }

  /** 两发之间的间隔：均值 60/perMin 的指数分布（夹在 0.35–2.2 倍之间，免得连发或久旱）。 */
  NextGap(profile, rateScale = 1) {
    const mean = 60 / Math.max(1e-3, profile.perMin * Math.max(0.05, rateScale));
    const k = -Math.log(1 - this.rng() * 0.999);
    return mean * Math.min(2.2, Math.max(0.35, k));
  }

  /** 挑落点：矩形里随机，离听者 minM–maxM，没人没车。挑不到返回 null。 */
  PickPoint(profile, zones) {
    const L = this.Listener();
    if (!L || !zones.length) return null;
    for (let i = 0; i < this.T.pickTries; i += 1) {
      const z = zones[Math.floor(this.rng() * zones.length)];
      const x = this.R(z.xMin, z.xMax), zz = this.R(z.zMin, z.zMax);
      const d = Math.hypot(x - L.x, zz - L.z);
      if (d < profile.minM || d > profile.maxM) continue;
      if (this.host.Blocked?.({ x, z: zz })) continue;
      const y = this.host.Ground ? this.host.Ground(x, zz) : 0;
      return { x, y: Number.isFinite(y) ? y : 0, z: zz, d };
    }
    return null;
  }

  /**
   * 落一发。有来袭啸声的那一发先放啸声、incomingLeadS 之后才落地（落地要的两条声部
   * 从这一刻起就留着）；其余立刻落地。返回落点（测试用）。
   */
  Fire(profile, zones) {
    const T = this.T;
    if (!this.Room(SHELL_SLOTS)) { this.skipped += 1; return null; }
    const at = this.PickPoint(profile, zones);
    if (!at) { this.skipped += 1; return null; }
    this.shells += 1;
    if (this.rng() < T.incomingChance && this.Room(SHELL_SLOTS + 1)) {
      // 啸声在落点上空，比落地早 incomingLeadS 起播（引擎另按距离给它 d/340 的延迟）。
      // 它只算到落地那一刻：之后那一截是爆炸本体盖住的。
      this.Voice(this.host.audio?.Play?.("shellIncoming", {
        position: { x: at.x, y: at.y + T.incomingHeightM, z: at.z }, volume: T.incomingVolume,
        // 整段隔着土的步骤（01）：啸声也闷（2026-09-24 补：原来只有爆炸与低频层吃 airCut）。
        airCut: this.airCut > 0 ? this.airCut : undefined,
      }), T.incomingLeadS);
      this.reserved += SHELL_SLOTS;
      this.pending.push({ at: this.time + T.incomingLeadS, kind: "impact", point: at, reserved: SHELL_SLOTS });
    } else {
      this.Impact(at);
    }
    return at;
  }

  /** 画面半径：近处 vfxRadiusM，远处稍放大（封顶）。 */
  VisualRadius(d) {
    const T = this.T;
    return Math.min(T.vfxRadiusMaxM ?? T.vfxRadiusM,
      T.vfxRadiusM + (T.vfxRadiusPerM ?? 0) * Math.max(0, d - (T.vfxGrowFromM ?? Infinity)));
  }

  /** 距离 d 处这一发的轻震创伤量（洞里另乘 dugoutShakeScale）。 */
  ShakeTrauma(d, zone) {
    const T = this.T;
    const u = Clamp01((d - T.shakeNearM) / Math.max(1, T.shakeFarM - T.shakeNearM));
    const trauma = T.shakeTraumaNear + (T.shakeTraumaFar - T.shakeTraumaNear) * u;
    return trauma * (zone === "dugout" ? T.dugoutShakeScale : 1);
  }

  /** 落地那一刻：画面先到，声音与震屏按 d/340 后到，落土再晚。 */
  Impact(at, reserved = 0) {
    const T = this.T;
    const audio = this.host.audio;
    this.reserved = Math.max(0, this.reserved - reserved);
    const L = this.Listener();
    if (!L) return;
    const d = Math.hypot(at.x - L.x, at.y - L.y, at.z - L.z);
    const arrive = d / SPEED_OF_SOUND;
    const radius = this.VisualRadius(d);
    this.host.Visual?.({ x: at.x, y: at.y, z: at.z }, radius, d);
    // 爆炸 cue 由引擎按 d/340 自己延迟（IsPropagated：explosion* 与 shellImpact 都在表里）。
    const cue = d < T.midM ? "explosionMid" : "explosionFar";
    const pos = { x: at.x, y: at.y + 1.2, z: at.z };
    const cut = (hz) => (this.airCut > 0 ? Math.min(hz || 20000, this.airCut) : hz || undefined);
    // 爆炸本体：Fire 时已留了位（留过的不再看 SharedRoom —— 前线看得见留位，不会占它）。
    if (reserved > 0 || this.Room(1)) {
      this.Voice(audio?.Play?.(cue, {
        position: pos, volume: d < T.midM ? T.midVolume : T.farVolume, sourceSizeM: T.vfxRadiusM,
        airCut: cut(0),
      }));
    } else this.layersDropped += 1;
    // 低频冲击层：同一发的胸口那一下（远爆那条压到 400 Hz 以下；9 个节点，shellImpact 要 19 个）。
    // 晚 30 ms 起：同名 cue 在 22 ms 去重窗里只活得下来一条（远档那一发本身就是 explosionFar）。
    if (reserved > 0 || this.Room(1)) {
      this.Voice(audio?.Play?.(T.thumpCue, {
        position: pos, volume: T.thumpVolume, airCut: cut(T.thumpAirCutHz), sourceSizeM: T.vfxRadiusM,
        delay: T.thumpDelayS,
      }));
    } else this.layersDropped += 1;
    this.pending.push({ at: this.time + arrive, kind: "shake", d });
    const zone = this.ListenerZone(L);
    if (zone === "trench" || zone === "dugout") {
      this.pending.push({ at: this.time + arrive + this.R(T.wallDirtDelayS[0], T.wallDirtDelayS[1]), kind: "wallDirt", zone });
    }
    if (d < T.dirtRainM) {
      this.pending.push({ at: this.time + this.R(T.dirtRainDelayS[0], T.dirtRainDelayS[1]), kind: "dirtRain", d, from: at });
    }
    this.events.push({ at: +this.time.toFixed(2), x: +at.x.toFixed(1), z: +at.z.toFixed(1), d: +d.toFixed(1), cue, zone,
      radius: +radius.toFixed(1) });
    if (this.events.length > 12) this.events.shift();
  }

  Voice(v, activeS = this.T.voiceActiveS) {
    if (v) {
      this.voices.push({ v, until: this.time + activeS });
      this.peakVoices = Math.max(this.peakVoices, this.voices.length);
    }
    return v;
  }

  RunPending() {
    if (!this.pending.length) return;
    const due = this.pending.filter((p) => p.at <= this.time);
    if (!due.length) return;
    this.pending = this.pending.filter((p) => p.at > this.time);
    const T = this.T;
    const audio = this.host.audio;
    const L = this.Listener();
    for (const p of due) {
      if (p.kind === "impact") {
        this.Impact(p.point, p.reserved || 0);
      } else if (p.kind === "shake") {
        this.host.Shake?.(this.ShakeTrauma(p.d, this.ListenerZone(L)), p.d);
      } else if (p.kind === "wallDirt" && L) {
        if (!this.Room(1)) { this.layersDropped += 1; continue; }
        // 沟壁：耳边一侧、比耳朵低一点；洞顶：头顶上方。非空间化会像在脑子里，所以给位置。
        const dugout = p.zone === "dugout";
        const a = this.rng() * Math.PI * 2;
        const r = dugout ? T.dugoutDirtOffsetM : T.wallDirtOffsetM;
        this.Voice(audio?.Play?.("debrisFall", {
          position: { x: L.x + Math.sin(a) * r, y: L.y + (dugout ? T.dugoutDirtRiseM : T.wallDirtRiseM), z: L.z + Math.cos(a) * r },
          volume: dugout ? T.dugoutDirtVolume : T.wallDirtVolume,
          airCut: dugout ? T.dugoutDirtAirCutHz : T.wallDirtAirCutHz,
        }), T.debrisActiveS);
      } else if (p.kind === "dirtRain" && L) {
        if (!this.Room(1)) { this.layersDropped += 1; continue; }
        // 土块从爆点那一侧砸回来：落在听者朝爆点方向几米处，越近越响。
        const dx = p.from.x - L.x, dz = p.from.z - L.z, n = Math.hypot(dx, dz) || 1;
        const r = this.R(T.dirtRainAtM[0], T.dirtRainAtM[1]);
        const k = Clamp01(1 - p.d / T.dirtRainM);
        this.Voice(audio?.Play?.("debrisFall", {
          position: { x: L.x + dx / n * r, y: L.y - T.dirtRainDropM, z: L.z + dz / n * r },
          volume: T.dirtRainVolume * (T.dirtRainFarShare + (1 - T.dirtRainFarShare) * k), airCut: T.dirtRainAirCutHz,
        }), T.debrisActiveS);
      }
    }
  }

  State() {
    return { shells: this.shells, skipped: this.skipped, thinned: this.thinned, pending: this.pending.length,
      voices: this.voices.length, reserved: this.reserved, peakVoices: this.peakVoices, layersDropped: this.layersDropped,
      nextInS: this.nextAt === null ? null : +(this.nextAt - this.time).toFixed(2),
      recent: this.events.slice(-6) };
  }

  Dispose() {
    for (const e of this.voices) this.host.audio?.FreeVoice?.(e.v);
    this.voices = [];
    this.pending = [];
    this.reserved = 0;
  }
}
