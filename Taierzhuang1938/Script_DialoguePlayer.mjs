// 多声部对白播放器（01–06 逐句干声；契约 docs/Data_FirstLevel0105Refactor20260923Contract.md §5.5）。
//
// 一句 = 一条干声 = 一个独立声源，挂在说话人头上（第一人称顺子走居中干声），按导演时间轴
// （Data_FirstLevelDialogueDirection）排：上一句结束后多久开口、可以压尾音重叠、等事件、等 gate、
// 被事件或截断点掐掉。字幕每句自己的起止；有句子在响时对环境床/音乐/远处战斗做侧链、
// 让自主喊话让路（Script_Audio.SetDialogueDuck）。
//
// 纯规则 + WebAudio 调用：不 import three。位置一律是 {x,y,z}（THREE.Vector3 也行）。
//
// 用法（Script_FirstLevelMissionVoice 包了一层，玩法包走 voice.PlayScene）：
//   const player = new DialoguePlayer({ audio, Subtitles(rows, seconds), Event(id, sceneId, detail), Clock() });
//   const handle = player.Play(scene, { speakers, gate, onLine, onEnd, priority });
//   player.Update(dt)  // 每帧
//   handle.Pause() / Resume() / Stop() / Skip() / Signal(name)；handle.lineId；handle.done
//
// scene（由调用方组装）：
//   { id, priority, lines: [{ id, index, who, key, duration, speaker, text, direction, sha256? }] }
//   key       voiceBank 键（"Mission<Scene>_<NN>"）；缺录音时为 null，照走字幕与事件（按估算时长）
//   direction 见 Data_FirstLevelDialogueDirection 顶部注释
import { DIALOGUE_DUCK, PROJECTION_OFFSCREEN_DB, MAX_LIVE_DIALOGUE_LINES, BUDGET_FADE_S } from "./Data_FirstLevelDialogueDirection.mjs";

const DbGain = (db) => Math.pow(10, db / 20);
/** 字幕在句尾多挂这么久再撤（读完最后几个字）。 */
const SUBTITLE_HOLD_S = 0.35;

/** 把 speakers[who]（演员 / 函数 / 坐标）解析成嘴的位置。解析不到返回 null。 */
export function ResolveSpeaker(entry) {
  if (!entry) return null;
  if (typeof entry === "function") return entry() || null;
  if (Number.isFinite(entry.x) && Number.isFinite(entry.z)) return entry;
  // 演员：优先头骨，其次 actor.head，最后脚底 + 1.5 m。
  const actor = entry.actor || entry;
  const head = actor.characterRig?.bones?.head || actor.head;
  if (head?.matrixWorld?.elements) {
    // 不 import three：借头骨自己的世界矩阵读平移。
    head.updateWorldMatrix?.(true, false);
    const e = head.matrixWorld.elements;
    return { x: e[12], y: e[13], z: e[14] };
  }
  const at = entry.position || actor.position;
  if (at && Number.isFinite(at.x)) return { x: at.x, y: (at.y || 0) + 1.5, z: at.z };
  return null;
}

class LineState {
  constructor(line) {
    this.line = line;
    this.state = "pending";   // pending → playing → done
    this.startAt = null;      // 场景时钟上的开口时刻
    this.endAt = null;        // 场景时钟上的实际结束时刻
    this.t = 0;               // 句内时间（源文件秒）
    this.voice = null;
    this.clock = null;        // 起播时的音频时钟（有就用它推 t，跟录音严格对齐）
    this.clockT = 0;
    this.triggerAt = null;    // event / gate 条件满足的时刻
    this.emitted = new Set();
    this.cut = false;
  }
  get playLength() {
    const d = this.line.duration, cut = this.line.direction.cutAtS;
    if (cut == null) return d;
    return Math.max(0.05, cut < 0 ? d + cut : Math.min(d, cut));
  }
}

export class DialogueHandle {
  constructor(player, scene, opts) {
    this.player = player;
    this.scene = scene;
    this.id = scene.id;
    this.opts = opts;
    this.priority = opts.priority ?? scene.priority ?? true;
    this.time = 0;
    this.paused = false;
    this.done = false;
    this.stopped = false;
    this.signals = new Map();
    this.lines = scene.lines.map((line) => new LineState(line));
  }
  get lineId() {
    const playing = this.lines.filter((l) => l.state === "playing");
    return (playing.at(-1) || this.lines.find((l) => l.state === "pending"))?.line.id ?? null;
  }
  /** 当前正在响的句子（可能两句重叠）。 */
  get playing() { return this.lines.filter((l) => l.state === "playing").map((l) => l.line.id); }
  Signal(name) {
    if (!this.signals.has(name)) this.signals.set(name, this.time);
    for (const l of this.lines) {
      const stop = l.line.direction.stopOn;
      if (l.state === "playing" && stop === `event:${name}`) this.player.EndLine(this, l, "stopOn");
    }
    return this;
  }
  Pause() {
    if (this.paused || this.done) return this;
    this.paused = true;
    for (const l of this.lines) if (l.state === "playing" && l.voice) { this.player.audio.StopVoice?.(l.voice); l.voice = null; }
    return this;
  }
  Resume() {
    if (!this.paused || this.done) return this;
    this.paused = false;
    for (const l of this.lines) if (l.state === "playing") this.player.StartVoice(this, l);
    return this;
  }
  Stop() {
    if (this.done) return this;
    for (const l of this.lines) if (l.state === "playing") this.player.EndLine(this, l, "stop", { silent: true });
    for (const l of this.lines) if (l.state === "pending") l.state = "done";
    this.done = true; this.stopped = true;
    return this;
  }
  /** 掐掉正在响的句子，下一句（after prev）立刻接上；等事件/gate 的句子照旧等。 */
  Skip() {
    if (this.done) return this;
    let any = false;
    for (const l of this.lines) if (l.state === "playing") { this.player.EndLine(this, l, "skip"); any = true; }
    if (!any) {
      const next = this.lines.find((l) => l.state === "pending");
      if (next && next.line.direction.after === "prev") next.skipOffset = true;
    } else {
      const next = this.lines.find((l) => l.state === "pending");
      if (next) next.skipOffset = true;
    }
    return this;
  }
}

export class DialoguePlayer {
  constructor({ audio, Subtitles = null, Event = null, Clock = null, Listener = null, duck = DIALOGUE_DUCK,
    maxLive = MAX_LIVE_DIALOGUE_LINES } = {}) {
    Object.assign(this, { audio, Subtitles, Event, Clock, Listener, duck, maxLive });
    this.handles = new Set();
    this.duckActive = false;
    this.lastSpeechAt = -1e9;
    this.now = 0;
    this.subtitleSignature = "";
    /** 口型轨采样器（Face 包的 Script_FaceTrack 注入）：(line, seconds) → {jaw,wide,round,close,stress} | null */
    this.faceTrackSampler = null;
    this.stats = { lines: 0, overlaps: 0, maxConcurrent: 0, cuts: 0, budgetCuts: 0 };
  }

  /** 真在出声的句子（有声源的；暂停的场景已经停了声源，不算）。 */
  SoundingLines() {
    const rows = [];
    for (const h of this.handles) for (const l of h.lines) if (l.state === "playing" && l.voice) rows.push([h, l]);
    return rows;
  }

  /**
   * 契约 §6：剧情语音同时 ≤ maxLive 路（旧整段单槽也算一路）。要开新的一句而已经满了，
   * 就让最早开口的那句淡出（EndLine 照常发它的句尾事件，玩法不会卡在等它说完）。
   */
  EnforceBudget() {
    const legacy = this.audio?.storyVoice ? 1 : 0;
    const sounding = this.SoundingLines().sort((a, b) => a[1].startedNow - b[1].startedNow);
    while (sounding.length && sounding.length + legacy >= this.maxLive) {
      const [h, l] = sounding.shift();
      this.EndLine(h, l, "budget");
      this.stats.budgetCuts++;
    }
  }

  Play(scene, opts = {}) {
    const handle = new DialogueHandle(this, scene, opts);
    this.handles.add(handle);
    return handle;
  }

  StopAll() { for (const h of this.handles) h.Stop(); this.handles.clear(); this.ApplyDuck(false); }
  PauseAll() { for (const h of this.handles) h.Pause(); }
  ResumeAll() { for (const h of this.handles) h.Resume(); }

  /** 场景时钟：每帧推进（暂停的场景不推进）。 */
  Update(dt) {
    this.now += dt;
    for (const handle of [...this.handles]) {
      if (handle.done) { this.handles.delete(handle); continue; }
      if (handle.paused) continue;
      handle.time += dt;
      this.Schedule(handle);
      this.Advance(handle, dt);
      if (handle.lines.every((l) => l.state === "done")) {
        handle.done = true;
        this.handles.delete(handle);
        handle.opts.onEnd?.(handle);
        this.Event?.("SceneEnd", handle.id, {});
      }
    }
    this.UpdateDuck();
    this.ShowSubtitles();
  }

  /** 决定 pending 的句子何时开口；到点就起播。句子严格按顺序开口。 */
  Schedule(handle) {
    const lines = handle.lines;
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      if (l.state !== "pending") continue;
      const prev = i ? lines[i - 1] : null;
      if (prev && prev.state === "pending") return;          // 上一句还没开口
      const dir = l.line.direction, after = dir.after || (i ? "prev" : "start");
      const offset = l.skipOffset ? 0 : (dir.offsetS ?? 0);
      const prevEnd = !prev ? 0 : prev.state === "done" ? prev.endAt : prev.startAt + prev.playLength;
      let at;
      if (after === "start") at = Math.max(offset, prev ? prev.startAt : 0);
      else if (after === "prev") at = prevEnd + offset;
      else if (after.startsWith("event:")) {
        const name = after.slice(6);
        if (!handle.signals.has(name)) return;
        at = Math.max(handle.signals.get(name) + offset, prevEnd);
      } else if (after === "gate") {
        if (l.triggerAt == null) {
          const open = handle.opts.gate ? handle.opts.gate(l.line.id) !== false : true;
          if (!open) return;
          l.triggerAt = handle.time;
        }
        at = Math.max(l.triggerAt + offset, prevEnd);
      } else at = prevEnd + offset;
      if (prev) at = Math.max(at, prev.startAt);             // 不许比上一句更早开口
      l.startAt = at;
      if (handle.time < at) return;
      this.StartLine(handle, l);
    }
  }

  SpeakerPosition(handle, line) {
    if (line.direction.spatial === "self" || line.who === "shunzi") return null;
    const entry = handle.opts.speakers?.[line.who];
    const at = ResolveSpeaker(entry) || handle.opts.Position?.(line) || null;
    return at;
  }

  StartVoice(handle, l) {
    const line = l.line, audio = this.audio;
    const self = line.direction.spatial === "self" || line.who === "shunzi";
    const at = self ? null : this.SpeakerPosition(handle, line);
    const offscreen = !self && !at;
    const volume = offscreen ? DbGain(PROJECTION_OFFSCREEN_DB) : 1;
    l.voice = line.key && audio?.PlayDialogueLine
      ? audio.PlayDialogueLine(line.key, { position: at, firstPerson: self, volume, offset: l.t })
      : null;
    const clock = this.Clock?.();
    l.clock = l.voice && Number.isFinite(clock) ? (l.voice.t ?? clock) : null;
    l.clockT = l.t;
  }

  StartLine(handle, l) {
    if (l.line.key) this.EnforceBudget();
    l.state = "playing";
    l.t = 0;
    l.startedNow = this.now;
    this.stats.lines++;
    const concurrent = [...this.handles].reduce((n, h) => n + h.lines.filter((x) => x.state === "playing").length, 0);
    if (concurrent > 1) this.stats.overlaps++;
    this.stats.maxConcurrent = Math.max(this.stats.maxConcurrent, concurrent);
    this.StartVoice(handle, l);
    this.stats.maxSounding = Math.max(this.stats.maxSounding || 0, this.SoundingLines().length + (this.audio?.storyVoice ? 1 : 0));
    const line = l.line;
    handle.opts.onLine?.(line.id, line.who, handle);
    this.Event?.("Line", handle.id, { who: line.who, index: line.index, lineId: line.id,
      start: l.startAt, end: l.startAt + l.playLength, sourceTime: 0 });
    this.EmitAt(handle, l, "start");
  }

  EmitAt(handle, l, when) {
    for (const e of l.line.direction.emit || []) {
      if (l.emitted.has(e.id)) continue;
      const hit = e.at === when || (typeof e.at === "number" && when === "tick" && l.t >= e.at);
      if (!hit) continue;
      l.emitted.add(e.id);
      this.Event?.(e.id, handle.id, { lineId: l.line.id });
    }
  }

  EndLine(handle, l, reason, { silent = false } = {}) {
    if (l.state !== "playing") return;
    if (l.voice) this.audio?.StopVoice?.(l.voice, reason === "cut" || reason === "stopOn" ? 0 : reason === "budget" ? BUDGET_FADE_S : 0.04);
    l.voice = null;
    l.state = "done";
    l.endAt = handle.time;
    l.reason = reason;
    if (silent) return;
    if (reason === "cut") { this.stats.cuts++; if (l.line.direction.cutEvent) this.Event?.(l.line.direction.cutEvent, handle.id, { lineId: l.line.id }); }
    this.EmitAt(handle, l, "end");
  }

  Advance(handle, dt) {
    for (const l of handle.lines) {
      if (l.state !== "playing") continue;
      const clock = this.Clock?.();
      l.t = l.clock != null && Number.isFinite(clock) ? l.clockT + Math.max(0, clock - l.clock) : l.t + dt;
      this.EmitAt(handle, l, "tick");
      if (l.line.direction.cutAtS != null && l.t >= l.playLength) { this.EndLine(handle, l, "cut"); continue; }
      if (l.t >= l.line.duration) { this.EndLine(handle, l, "end"); continue; }
      if (l.voice && !(l.line.direction.spatial === "self" || l.line.who === "shunzi")) {
        const at = this.SpeakerPosition(handle, l.line);
        if (at) this.audio?.MoveVoice?.(l.voice, at);
      }
    }
  }

  /** 侧链：priority 场景有句子在响（含句间 holdS）就压。 */
  UpdateDuck() {
    let speaking = false;
    for (const h of this.handles) if (h.priority && !h.paused && h.lines.some((l) => l.state === "playing")) speaking = true;
    if (speaking) this.lastSpeechAt = this.now;
    const active = speaking || this.now - this.lastSpeechAt < this.duck.holdS;
    this.ApplyDuck(active);
  }
  ApplyDuck(active) {
    if (active === this.duckActive) return;
    this.duckActive = active;
    this.audio?.SetDialogueDuck?.(active, this.duck);
  }

  ShowSubtitles() {
    if (!this.Subtitles) return;
    const rows = [];
    const listener = this.Listener?.();
    for (const h of this.handles) for (const l of h.lines) {
      const showing = l.state === "playing" || (l.state === "done" && !h.stopped && l.reason !== "skip"
        && h.time - l.endAt < SUBTITLE_HOLD_S);
      if (!showing || l.line.subtitle === false) continue;
      const at = listener && this.SpeakerPosition(h, l.line);
      rows.push({ id: l.line.id, speaker: l.line.speaker, text: l.line.text, emphasis: "lead",
        distanceM: at ? Math.hypot(at.x - listener.x, at.y - listener.y, at.z - listener.z) : null,
        seconds: Math.max(0.05, (l.state === "playing" ? l.line.duration - l.t : 0) + SUBTITLE_HOLD_S) });
    }
    // 两句重叠时先开口的那句作 aside 叠在上面，后开口（正在抢话）的作 lead。
    rows.forEach((row, i) => { if (i < rows.length - 1) row.emphasis = "aside"; });
    const signature = rows.map((r) => r.id).join("|");
    if (signature === this.subtitleSignature) return;
    this.subtitleSignature = signature;
    for (const r of rows) r.started = !this.shown?.has(r.id);   // 新开口的句子才进 hud.spoken 审计
    this.shown = new Set(rows.map((r) => r.id));
    this.Subtitles(rows, rows.length ? Math.min(...rows.map((r) => r.seconds), 60) : 0);
  }

  /**
   * 口型驱动：who 此刻在不在说、嘴张多大。优先 faceTrackSampler（离线口型轨），
   * 否则读这句干声的实时包络（speechEnvelope：level / brightness）。
   * @returns {{jaw,wide,round,close,stress,active,who,lineId,sourceTime,level,brightness}|null}
   */
  Speech(who, sampleEnvelope) {
    for (const h of this.handles) {
      if (h.paused) continue;
      for (const l of h.lines) {
        if (l.state !== "playing" || l.line.who !== who) continue;
        const clock = this.Clock?.();
        const seconds = l.clock != null && Number.isFinite(clock) ? l.clockT + Math.max(0, clock - l.clock) : l.t;
        const base = { active: true, who, lineId: l.line.id, cue: h.id, sourceTime: seconds };
        const track = this.faceTrackSampler?.(l.line, seconds);
        if (track) return { ...base, level: track.jaw ?? 0, brightness: track.wide ?? 0, ...track };
        const envelope = l.line.key ? this.audio?.voiceBank?.get(l.line.key)?.speechEnvelope : null;
        const e = envelope && sampleEnvelope ? sampleEnvelope(envelope, seconds) : { level: 0, brightness: 0 };
        const level = e.level || 0, bright = e.brightness || 0;
        return { ...base, level, brightness: bright, jaw: level, wide: level * bright, round: level * (1 - bright),
          close: 1 - level, stress: 0 };
      }
    }
    return null;
  }

  State() {
    return {
      duckActive: this.duckActive, stats: { ...this.stats },
      scenes: [...this.handles].map((h) => ({ id: h.id, time: +h.time.toFixed(3), paused: h.paused,
        lines: h.lines.map((l) => ({ id: l.line.id, who: l.line.who, state: l.state, startAt: l.startAt,
          t: +l.t.toFixed(3), recorded: !!l.line.key, reason: l.reason || null })) })),
    };
  }
}
