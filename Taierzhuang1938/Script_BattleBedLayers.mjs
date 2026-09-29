// 战场远景床的「偶尔叠加」调度器（2026-09-29）。纯规则：不碰 DOM、不碰 three、不碰 WebAudio，node 里能直接断言。
//
// 用户原话（2026-09-29）：「整体A长期存在，B和C交替的随机叠加出现；E在玩家进入巷道/半室内阶段再播放（作为替换偶尔的B和C）」。
// A 是每个 battleFar 层本来播的底床；这里只管叠在它上面的那个声部：什么时候起一段、用哪一条、放素材的哪一截、放多久、淡多久。
// 起一段之后怎么在 WebAudio 里放（source + gain 挂在宿主层的组增益上）是 Script_Audio.LoopLayer.PlayOverlay 的事，
// 每 0.4 s 问调度器一次是 AudioEngine.TickBedOverlay 的事。数都在 Data_Tuning_Audio.BATTLE_BED_LAYERS，口径见 docs/Data_AudioEngine.md §15。
//
// 规则（数与理由在数据表里）：
//   · 段与段之间静一个随机间隔（从上一段结束起算），起一段：随机时长、随机淡入淡出、从素材随机位置起播；
//   · 开阔（open）时 B 与 C 严格交替；巷道 / 半室内（enclosed）时用 E，不出 B / C；离开后接着交替（不因为中间插了 E 而重排）；
//   · 「在不在巷道里」有滞回：听者所在区持续在 enclosedZones 里 enterHoldS 秒才算进、持续不在 exitHoldS 秒才算出，门口来回跳不抖；
//   · 切档时正在播的、属于旧档的那一段不硬切：在自己的淡出时长里淡出（已经在淡出的让它播完）；
//   · 素材没解码好的键不选；同一档里别的键解码好了就先用别的（B 没到 C 到了，先放 C），一条都没有就这一拍不起、下一拍再问；
//   · 换宿主层（换预设）时正在播的一段由新宿主接着播（Resume）；宿主一直没有（这一档预设里没有 battleFar 层）就停表，
//     正在播的那一段随宿主一起结束、下一段的间隔从宿主回来之后重新数。
//
// 决定论：所有随机走 Mulberry32（种子 = HashString(config.seed)），每一段固定按「时长、淡入、淡出、下一段的间隔、起播点」的顺序取数，
// 与 tick 落在哪个时刻无关；同一份输入（时刻、zone、可用素材）永远出同一条时间线。**不许 Math.random。**

import { Mulberry32, HashString } from "./Script_Noise.mjs";
import { BATTLE_BED_LAYERS } from "./Data_Tuning_Audio.mjs";

/** 起播点尽量别和同一条素材上一段的窗口重合（重合比例超过这个就重抽，最多 OFFSET_TRIES 次）。 */
const OFFSET_OVERLAP_MAX = 0.5;
const OFFSET_TRIES = 4;
/** 素材尾巴留出的余量（秒）：播放窗口不贴着素材末尾。 */
const BUFFER_TAIL_S = 0.1;
/** 时间线只留最近这么多段（取证用，别越攒越大）。 */
const TIMELINE_MAX = 64;

/** 配置自检：返回问题列表（空 = 没问题）。单测与调参口用。 */
export function ValidateBattleBedLayers(config = BATTLE_BED_LAYERS) {
  const problems = [];
  const range = (name) => {
    const r = config[name];
    if (!Array.isArray(r) || r.length !== 2 || !(r[0] > 0) || !(r[1] >= r[0])) problems.push(`${name} 要是 [lo, hi]、0 < lo ≤ hi：${JSON.stringify(r)}`);
  };
  for (const name of ["firstGapS", "gapS", "durS", "fadeS"]) range(name);
  if (!Array.isArray(config.open) || !config.open.length) problems.push("open 至少一个键");
  if (!Array.isArray(config.enclosed) || !config.enclosed.length) problems.push("enclosed 至少一个键");
  if (config.open && config.firstKey && !config.open.includes(config.firstKey)) problems.push(`firstKey ${config.firstKey} 不在 open 里`);
  for (const key of [...(config.open || []), ...(config.enclosed || [])]) {
    if (!(config.gain?.[key] > 0)) problems.push(`gain 缺 ${key}`);
  }
  if (config.durS && config.fadeS && config.durS[0] < 2 * config.fadeS[1] + config.holdMinS) {
    problems.push(`durS 下限 ${config.durS[0]} < 2 × fadeS 上限 ${config.fadeS[1]} + holdMinS ${config.holdMinS}：最短一段没有平台`);
  }
  if (!Array.isArray(config.enclosedZones) || !config.enclosedZones.length) problems.push("enclosedZones 至少一个区");
  return problems;
}

export class BattleBedScheduler {
  /**
   * @param {object} [config] 默认 Data_Tuning_Audio.BATTLE_BED_LAYERS；测试可传改过间隔的副本。
   * @param {{seed?: string}} [opts]
   */
  constructor(config = BATTLE_BED_LAYERS, { seed } = {}) {
    this.config = { ...config };
    this.seed = String(seed ?? config.seed ?? "battleBedLayers");
    this.rng = Mulberry32(HashString(this.seed));
    this.Reset();
  }

  /** 回到开局（种子不变，随机流重新开始）。 */
  Reset() {
    this.rng = Mulberry32(HashString(this.seed));
    this.clock = 0;                    // 调度器自己的时钟：每次 Step 前进 min(实际间隔, tickMaxS)，宿主没有时停表
    this.lastNow = null;
    this.mode = "open";                // "open" | "enclosed"
    this.zoneIn = null;                // 上一次采样：听者在不在 enclosedZones 里
    this.zoneSince = 0;                // 这个判断持续了多久的起点（clock）
    this.nextAt = null;                // 下一段最早起播的时刻（clock）
    this.active = null;
    const open = this.config.open || [];
    const first = open.indexOf(this.config.firstKey);
    this.cursor = { open: first >= 0 ? first : 0, enclosed: 0 };
    this.lastWindow = new Map();       // 键 → 上一段在素材里的窗口 [from, to]
    this.timeline = [];
    this.stats = { started: 0, byKey: {}, released: 0, modeChanges: 0, deferred: 0 };
    this.seq = 0;
  }

  /** 调参口：合并进配置（测试把间隔压短；线上不调）。不重置状态。 */
  Configure(patch = {}) {
    Object.assign(this.config, patch);
    return this.config;
  }

  Draw([lo, hi]) { return lo + (hi - lo) * this.rng(); }

  IsEnclosedZone(zone) {
    return typeof zone === "string" && (this.config.enclosedZones || []).includes(zone);
  }

  /** 这一档（open / enclosed）该轮到哪一个键；没解码好的跳过。返回 null = 一条都没有。 */
  PickKey(mode, Duration) {
    const list = (mode === "enclosed" ? this.config.enclosed : this.config.open) || [];
    if (!list.length) return null;
    const from = this.cursor[mode] % list.length;
    for (let i = 0; i < list.length; i += 1) {
      const key = list[(from + i) % list.length];
      if (Duration(key) > 0) {
        this.cursor[mode] = (from + i + 1) % list.length;
        return key;
      }
    }
    return null;
  }

  /** 素材里起播点：尽量不和同一条素材上一段的窗口重合。 */
  PickOffset(key, durS, bufferS) {
    const room = Math.max(0, bufferS - durS - BUFFER_TAIL_S);
    const prev = this.lastWindow.get(key);
    let offset = this.rng() * room;
    for (let i = 1; i < OFFSET_TRIES && prev; i += 1) {
      const overlap = Math.max(0, Math.min(offset + durS, prev[1]) - Math.max(offset, prev[0]));
      if (overlap / durS <= OFFSET_OVERLAP_MAX) break;
      offset = this.rng() * room;
    }
    this.lastWindow.set(key, [offset, offset + durS]);
    return offset;
  }

  /**
   * 每 tick 问一次。
   * @param {{now: number, zone?: string|null, hosts?: number, available?: Map|object|null, canStart?: boolean}} input
   *   now 音频时钟（秒）；zone 听者所在区（null = 不知道，按开阔）；hosts 当前有几个能放叠加的宿主层（0 = 停表）；
   *   available 键 → 解码好的素材时长（秒），没有的键不选；canStart 引擎说现在有没有节点余量。
   * @returns {{start: null|object, release: null|{key: string, fadeS: number}, modeChanged: null|string, mode: string}}
   *   start：{ key, mode, offsetS, durS, fadeInS, fadeOutS, gain }，宿主层照它起一段；
   *   release：正在播的那一段要在 fadeS 秒里淡出（切档）。
   */
  Step({ now, zone = null, hosts = 1, available = null, canStart = true } = {}) {
    const out = { start: null, release: null, modeChanged: null, mode: this.mode };
    const c = this.config;
    if (!(hosts > 0)) {
      // 没有宿主层（这一档预设里没有 battleFar，或床还没载到）：停表。正在播的那一段是挂在宿主上的，宿主没了它也没了，
      // 不留着等下次宿主出现时从半截接上（暂停 / 恢复不走这里：暂停期间没有心跳，恢复时新宿主起来直接 Resume）。
      this.lastNow = now;
      if (this.active) { this.nextAt = this.clock + this.active.gapAfterS; this.active = null; }
      return out;
    }
    const dt = this.lastNow == null ? 0 : Math.min(Math.max(0, now - this.lastNow), c.tickMaxS ?? 1);
    this.lastNow = now;
    this.clock += dt;
    if (this.nextAt == null) this.nextAt = this.clock + this.Draw(c.firstGapS);

    // 1. 在不在巷道里：带滞回。
    const inSet = this.IsEnclosedZone(zone);
    if (this.zoneIn === null || inSet !== this.zoneIn) { this.zoneIn = inSet; this.zoneSince = this.clock; }
    const held = this.clock - this.zoneSince;
    let mode = this.mode;
    if (mode === "open" && inSet && held >= c.enterHoldS) mode = "enclosed";
    else if (mode === "enclosed" && !inSet && held >= c.exitHoldS) mode = "open";
    if (mode !== this.mode) {
      this.mode = mode;
      this.stats.modeChanges += 1;
      out.modeChanged = mode;
      out.mode = mode;
      // 正在播的、不属于新档的那一段：在自己的淡出时长里淡出，不硬切。
      const a = this.active;
      if (a && !a.releasing && a.mode !== mode && a.endAt - this.clock > a.fadeOutS) {
        a.endAt = this.clock + a.fadeOutS;
        a.releasing = true;
        this.stats.released += 1;
        const row = this.timeline.find((r) => r.n === a.n);
        if (row) { row.released = true; row.endAt = a.endAt; row.releasedAt = this.clock; }
        out.release = { key: a.key, fadeS: a.fadeOutS };
      }
    }

    // 2. 这一段放完了：下一段的时刻按它的结束时刻 + 起播时已经定好的间隔算（不按 tick 落在哪里算）。
    if (this.active && this.clock >= this.active.endAt) {
      this.nextAt = this.active.endAt + this.active.gapAfterS;
      this.active = null;
    }

    // 3. 该起一段了。
    if (!this.active && this.clock >= this.nextAt) {
      const Duration = (key) => {
        const d = available instanceof Map ? available.get(key) : available?.[key];
        return Number.isFinite(d) ? d : 0;
      };
      if (!canStart) { this.stats.deferred += 1; return out; }
      const key = this.PickKey(this.mode, Duration);
      if (!key) return out;                                  // 一条都没解码好：不出声，下一拍再问
      const bufferS = Duration(key);
      let durS = this.Draw(c.durS);
      let fadeInS = this.Draw(c.fadeS);
      let fadeOutS = this.Draw(c.fadeS);
      const gapAfterS = this.Draw(c.gapS);
      durS = Math.min(durS, Math.max(2, bufferS - BUFFER_TAIL_S));
      const maxFade = Math.max(0.2, (durS - (c.holdMinS ?? 0.5)) / 2);
      fadeInS = Math.min(fadeInS, maxFade);
      fadeOutS = Math.min(fadeOutS, maxFade);
      const offsetS = this.PickOffset(key, durS, bufferS);
      const gain = c.gain?.[key] ?? 0.5;
      this.seq += 1;
      this.active = {
        n: this.seq, key, mode: this.mode, zone,
        startAt: this.clock, endAt: this.clock + durS, offsetS, durS, fadeInS, fadeOutS, gain, gapAfterS, releasing: false,
      };
      this.stats.started += 1;
      this.stats.byKey[key] = (this.stats.byKey[key] || 0) + 1;
      this.timeline.push({ n: this.seq, key, mode: this.mode, zone, at: now, startAt: this.clock, endAt: this.clock + durS, offsetS, durS, fadeInS, fadeOutS, gain, released: false });
      if (this.timeline.length > TIMELINE_MAX) this.timeline.shift();
      out.start = { key, mode: this.mode, offsetS, durS, fadeInS, fadeOutS, gain };
    }
    return out;
  }

  /**
   * 新宿主层起来（换预设）时问：正在播的那一段还剩多少、该从素材哪儿接着放。null = 没有在播的 / 剩得太少不接。
   * 不改调度器状态。
   */
  Resume(now) {
    const a = this.active;
    if (!a) return null;
    const c = this.config;
    const dt = this.lastNow == null ? 0 : Math.min(Math.max(0, now - this.lastNow), c.tickMaxS ?? 1);
    const t = this.clock + dt;
    const remain = a.endAt - t;
    if (!(remain >= (c.joinMinRemainS ?? 3))) return null;
    const played = Math.max(0, t - a.startAt);
    const fadeInS = Math.min(c.joinFadeS ?? 2, remain * 0.4);
    const fadeOutS = Math.min(a.fadeOutS, Math.max(0.2, remain - fadeInS - (c.holdMinS ?? 0.5)));
    return { key: a.key, mode: a.mode, offsetS: a.offsetS + played, durS: remain, fadeInS, fadeOutS, gain: a.gain, resumed: true };
  }

  /** 取证用：当前状态与时间线的快照（不含随机流）。 */
  Snapshot() {
    return {
      seed: this.seed, clock: this.clock, mode: this.mode, zoneIn: this.zoneIn, nextAt: this.nextAt,
      active: this.active ? { ...this.active } : null,
      stats: { ...this.stats, byKey: { ...this.stats.byKey } },
      timeline: this.timeline.map((r) => ({ ...r })),
    };
  }
}
