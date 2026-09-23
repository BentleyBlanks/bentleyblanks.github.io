// Script_BattleArtillery.mjs — 场外近落弹调度（2026-09-23，第一关 01–06 声景）。
//
// 「炮火就在附近」的氛围层：落在 40–140 m 外无人地带的炮弹。**不伤人、不改地形、
// 不进压制账、不进 TTK** —— 真正打人的炮弹由 Script_Combat 与战车负责，这一层只负责
// 让玩家知道「这片地一直在挨炮」。
//
// 一发的时间线（t = 落地那一刻）：
//   t − incomingLeadS  来袭啸声（一部分炮弹才有）
//   t                  画面：vfx.Explosion（先见）
//   t + d/340          声音：中/远档爆炸 + 一条压到 400 Hz 以下的低频冲击（后闻，引擎按距离延迟）
//   t + d/340          震屏：CameraShake.Explosion（跟着声音到，不跟着画面）；洞里更重
//   t + d/340 + 0.3 s  听者在沟里/洞里：耳边沟壁/洞顶沙沙落土
//   t + 1.1–2.1 s      近的那几发：土块砸回沟里（碎土雨）
//
// **纯规则，不 import three**：宿主把世界能力用函数交进来（地面、听者、空间档、画面、震屏、
// 避人），测试用假宿主直接跑。随机走 Mulberry32，逐轮可复现。
// 数：机制在 Data_Tuning_Audio.BATTLE_ARTILLERY，落在哪、多密在关卡数据
// （Data_FirstLevelMissionBattleSound.artillery）。

import { Mulberry32, Clamp01 } from "./Script_Noise.mjs";
import { BATTLE_ARTILLERY } from "./Data_Tuning_Audio.mjs";

const SPEED_OF_SOUND = 340;

export class BattleArtillery {
  /**
   * @param {object} host
   * @param {object} host.audio           AudioEngine（Play / pendingVoices / listenerPos）
   * @param {function} [host.Ground]      (x, z) → 地面高度
   * @param {function} [host.Listener]    () → {x,y,z}（缺省读 audio.listenerPos）
   * @param {function} [host.Zone]        (pos) → 空间档（"trench" / "dugout" / …）
   * @param {function} [host.Visual]      (pos, radius) → 画面那一团
   * @param {function} [host.Shake]       (distanceM, reachM) → 震屏
   * @param {function} [host.Blocked]     (pos) → true 表示这里有人，不许落
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
    this.shells = 0;            // 取证：落了几发
    this.skipped = 0;           // 取证：挑不到落点 / 声部满了跳过几发
    this.events = [];           // 最近几发（取证）
    this.stage = null;
  }

  R(min, max) { return min + (max - min) * this.rng(); }

  Listener() {
    const L = this.host.Listener?.() || this.host.audio?.listenerPos;
    return L ? { x: L.x, y: L.y, z: L.z } : null;
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
    this.voices = this.voices.filter((v) => this.host.audio?.pendingVoices?.has?.(v));
    this.RunPending();
    if (stage !== this.stage) {
      this.stage = stage;
      this.nextAt = profile ? this.time + (profile.firstAfterS ?? 0) + this.NextGap(profile, rateScale) * 0.5 : null;
    }
    if (!profile || !(profile.perMin > 0)) { this.nextAt = null; return; }
    if (this.nextAt === null) this.nextAt = this.time + this.NextGap(profile, rateScale);
    if (this.time < this.nextAt) return;
    this.nextAt = this.time + this.NextGap(profile, rateScale);
    if (quiet) return;
    this.Fire(profile, zones);
  }

  /** 两发之间的间隔：均值 60/perMin 的指数分布（夹在 0.35–2.2 倍之间，免得连发或久旱）。 */
  NextGap(profile, rateScale = 1) {
    const mean = 60 / Math.max(1e-3, profile.perMin * Math.max(0.05, rateScale));
    const k = -Math.log(1 - this.rng() * 0.999);
    return mean * Math.min(2.2, Math.max(0.35, k));
  }

  /** 挑落点：矩形里随机，离听者 minM–maxM，没人。挑不到返回 null。 */
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
   * 落一发。有来袭啸声的那一发先放啸声、incomingLeadS 之后才落地；
   * 其余立刻落地。返回落点（测试用）。
   */
  Fire(profile, zones) {
    const T = this.T;
    if (this.voices.length >= T.maxVoices) { this.skipped += 1; return null; }
    const at = this.PickPoint(profile, zones);
    if (!at) { this.skipped += 1; return null; }
    this.shells += 1;
    if (this.rng() < T.incomingChance) {
      // 啸声在落点上空，比落地早 incomingLeadS 起播（引擎另按距离给它 d/340 的延迟）。
      this.Voice(this.host.audio?.Play?.("shellIncoming", {
        position: { x: at.x, y: at.y + 18, z: at.z }, volume: T.incomingVolume,
      }));
      this.pending.push({ at: this.time + T.incomingLeadS, kind: "impact", point: at });
    } else {
      this.Impact(at);
    }
    return at;
  }

  /** 落地那一刻：画面先到，声音与震屏按 d/340 后到，落土再晚。 */
  Impact(at) {
    const T = this.T;
    const audio = this.host.audio;
    const L = this.Listener();
    if (!L) return;
    const d = Math.hypot(at.x - L.x, at.y - L.y, at.z - L.z);
    const arrive = d / SPEED_OF_SOUND;
    this.host.Visual?.({ x: at.x, y: at.y, z: at.z }, T.vfxRadiusM);
    // 爆炸 cue 由引擎按 d/340 自己延迟（IsPropagated：explosion* 与 shellImpact 都在表里）。
    const cue = d < T.midM ? "explosionMid" : "explosionFar";
    const pos = { x: at.x, y: at.y + 1.2, z: at.z };
    const cut = (hz) => (this.airCut > 0 ? Math.min(hz || 20000, this.airCut) : hz || undefined);
    this.Voice(audio?.Play?.(cue, {
      position: pos, volume: d < T.midM ? T.midVolume : T.farVolume, sourceSizeM: T.vfxRadiusM,
      airCut: cut(0),
    }));
    // 低频冲击层：同一发的胸口那一下（shellImpact 压到 400 Hz 以下）。
    this.Voice(audio?.Play?.("shellImpact", {
      position: pos, volume: T.thumpVolume, airCut: cut(T.thumpAirCutHz), sourceSizeM: T.vfxRadiusM,
    }));
    this.pending.push({ at: this.time + arrive, kind: "shake", d });
    const zone = this.host.Zone?.(L) || null;
    if (zone === "trench" || zone === "dugout") {
      this.pending.push({ at: this.time + arrive + this.R(T.wallDirtDelayS[0], T.wallDirtDelayS[1]), kind: "wallDirt", zone });
    }
    if (d < T.dirtRainM) {
      this.pending.push({ at: this.time + this.R(T.dirtRainDelayS[0], T.dirtRainDelayS[1]), kind: "dirtRain", d, from: at });
    }
    this.events.push({ at: +this.time.toFixed(2), x: +at.x.toFixed(1), z: +at.z.toFixed(1), d: +d.toFixed(1), cue, zone });
    if (this.events.length > 12) this.events.shift();
  }

  Voice(v) { if (v) this.voices.push(v); return v; }

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
        this.Impact(p.point);
      } else if (p.kind === "shake") {
        const zone = this.host.Zone?.(L) || null;
        const reach = T.shakeReachM * (zone === "dugout" ? T.dugoutShakeScale : 1);
        this.host.Shake?.(p.d, reach);
      } else if (p.kind === "wallDirt" && L) {
        // 沟壁：耳边一侧、比耳朵低一点；洞顶：头顶上方。非空间化会像在脑子里，所以给位置。
        const dugout = p.zone === "dugout";
        const a = this.rng() * Math.PI * 2;
        const r = dugout ? 0.6 : 1.3;
        this.Voice(audio?.Play?.("debrisFall", {
          position: { x: L.x + Math.sin(a) * r, y: L.y + (dugout ? 0.9 : -0.3), z: L.z + Math.cos(a) * r },
          volume: dugout ? T.dugoutDirtVolume : T.wallDirtVolume,
          airCut: dugout ? T.dugoutDirtAirCutHz : T.wallDirtAirCutHz,
        }));
      } else if (p.kind === "dirtRain" && L) {
        // 土块从爆点那一侧砸回来：落在听者朝爆点方向 2–5 m 处，越近越响。
        const dx = p.from.x - L.x, dz = p.from.z - L.z, n = Math.hypot(dx, dz) || 1;
        const r = this.R(2, 5);
        const k = Clamp01(1 - p.d / T.dirtRainM);
        this.Voice(audio?.Play?.("debrisFall", {
          position: { x: L.x + dx / n * r, y: L.y - 0.8, z: L.z + dz / n * r },
          volume: T.dirtRainVolume * (0.45 + 0.55 * k), airCut: T.dirtRainAirCutHz,
        }));
      }
    }
  }

  State() {
    return { shells: this.shells, skipped: this.skipped, pending: this.pending.length,
      voices: this.voices.length, nextInS: this.nextAt === null ? null : +(this.nextAt - this.time).toFixed(2),
      recent: this.events.slice(-6) };
  }

  Dispose() {
    for (const v of this.voices) this.host.audio?.FreeVoice?.(v);
    this.voices = [];
    this.pending = [];
  }
}
