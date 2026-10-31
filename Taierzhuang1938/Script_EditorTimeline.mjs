// Timeline 过场（docs/Data_EditorSuite.md「Timeline 过场」）：高级工具 → 关卡 → Timeline 过场。
//
// ## 两样东西
//   · TimelineEditor —— 菜单里那一项，只是**跳转入口**（同白盒关卡编辑器）：整页换成白盒编辑器，
//     切到 Timeline 的关卡，地址带 ?timeline=<Id>；已经在白盒编辑器里就直接把面板打开，不重载。
//   · TimelinePanel —— 白盒编辑器底部那一条面板（Script_EditorBlockout 建它）。
//
// ## 不另写播放器
// 播、停、拖、逐帧全走白盒编辑器里那一个预演播放器（Script_EditorBlockoutPreviz）：面板只用
// UseSource 把数据换成 Timeline 那份，再按主时间轴调它的 Play / Seek / Pause / Resume。
// 预演的 Seek 是确定性求值，所以「拖到 41.2 秒」就是 41.2 秒那一帧，不用从头快进。
// 跨段：主时间轴上的一段 = 一个关键帧的预演；拖到别的段时先从那个关键帧的布设起播再 Seek，
// 播放中一段播完自动接下一段（预演自己的 then 跳关键帧照旧发生，接着起播下一段）。
//
// ## 以 agent 为主
// 人用的界面只有一条：走带 + 子序列 / 镜头 / 台词 / 事件四条轨，点哪拖哪。
// agent 走 window.Tengxian.Debug.Blockout.Timeline（State / Seek / Play / Pause / Step / Tracks …）
// 与命令行 Script_TimelineCli.mjs（show / check / sync / new），改内容直接改 Timeline/<Id>.timeline.json，
// 开着的面板 2 s 内重读。

import {
  TIMELINES, DEFAULT_TIMELINE_ID, FindTimeline, TIMELINE_FPS, TIMELINE_LINE_FALLBACK_S,
  TimelineAsPreviz, ValidateTimeline, TimelineLayout, TimelineTracks, TracksAt, LocateTime, FormatTimecode,
} from "./Script_TimelinePlan.mjs";

const KEEP_PARAMS = ["scale", "audio", "quality"];
const POLL_MS = 2000;
const FRAME_S = 1 / TIMELINE_FPS;

/** 菜单入口（静态，不进互斥编辑器表）。 */
export class TimelineEditor {
  static id = "timeline";
  static label = "Timeline 过场";
  static hint = "过场时间轴：第一关开场四段预演（测试拷贝），走白盒编辑器的预演播放器（打开后整页切换）";

  /** 目标地址：?editor=blockout&level=<关卡>&kf=<第一段>&timeline=<Id>，只带上规模 / 音频 / 画质。 */
  static Url(href = globalThis.location?.href || "", id = DEFAULT_TIMELINE_ID) {
    const entry = FindTimeline(id) || TIMELINES[0];
    const current = new URL(href);
    const url = new URL(current.pathname, current.origin);
    url.searchParams.set("editor", "blockout");
    url.searchParams.set("level", entry.level);
    url.searchParams.set("timeline", entry.id);
    for (const key of KEEP_PARAMS) {
      const value = current.searchParams.get(key);
      if (value !== null) url.searchParams.set(key, value);
    }
    return url.toString();
  }

  /** 已经在白盒编辑器里：直接开面板（关卡不对时面板自己换页）；否则整页跳过去。 */
  static Open(id = DEFAULT_TIMELINE_ID) {
    const inPage = new URLSearchParams(globalThis.location?.search || "").get("editor") === "blockout";
    const api = globalThis.Tengxian?.Debug?.Blockout?.Timeline;
    if (inPage && api) { api.Open(id); return null; }
    const url = this.Url(globalThis.location?.href, id);
    globalThis.location.assign(url);
    return url;
  }
}

function El(tag, cls, text) {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (text !== undefined) el.textContent = text;
  return el;
}

/** 白盒编辑器底部的 Timeline 面板。 */
export class TimelinePanel {
  /** @param {import("./Script_EditorBlockout.mjs").EditorBlockout} editor */
  constructor(editor) {
    this.editor = editor;
    this.id = null;
    this.doc = null;
    this.text = null;
    this.layout = null;
    this.tracks = null;
    this.validation = null;
    this.open = false;
    this.playing = false;       // 走带在「播」（跨段时也保持）
    this.t = 0;                 // 主时间轴秒数（面板读数；播放中每帧从预演播放器读回）
    this.token = 0;             // 每次换段起播 +1，旧段的「播完」回调认不出来就不接下一段
    this.busy = null;           // 正在换段 / Seek 的那个 Promise（连点时排队）
    this.lastPoll = 0;
    this.api = this.BuildApi();
  }

  get previz() { return this.editor.previz; }

  // -------------------------------------------------------------------------
  // 开 / 关 / 读文件

  async Open(id = DEFAULT_TIMELINE_ID) {
    const entry = FindTimeline(id);
    if (!entry) throw new Error(`没有登记这份 Timeline：${id}`);
    // 子序列的关键帧在别的关卡：换页（白盒编辑器切关会重建整片场景，换页更干净）
    if (entry.level !== this.editor.levelKey) {
      globalThis.location.assign(TimelineEditor.Url(globalThis.location.href, id));
      return this.State();
    }
    this.id = id;
    if (!this.root) this.BuildDom();
    this.open = true;
    this.root.hidden = false;
    this.editor.ui.root.classList.add("boTimelineOpen");
    await this.Load({ force: true });
    await this.SeekTo(0);
    return this.State();
  }

  async Close() {
    this.playing = false;
    this.token += 1;
    this.open = false;
    if (this.root) this.root.hidden = true;
    this.editor.ui.root.classList.remove("boTimelineOpen");
    this.previz.Stop({ restore: false });
    await this.previz.UseSource(null);
    return this.State();
  }

  /** 读 Timeline 文件。force：原文没变也重新核对、重新换源。→ 有没有换。 */
  async Load({ force = false } = {}) {
    const entry = FindTimeline(this.id);
    this.lastPoll = performance.now();
    let text;
    try {
      const response = await fetch(`./${entry.file}?t=${Date.now()}`, { cache: "no-store" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      text = await response.text();
    } catch (error) {
      this.validation = { ok: false, errors: [`读不到 ${entry.file}：${error?.message || error}`], warnings: [] };
      this.RenderStatus();
      return false;
    }
    if (!force && text === this.text) return false;
    let doc;
    try { doc = JSON.parse(text); }
    catch (error) {
      // 写了一半：留着上一份能用的
      this.validation = { ok: false, errors: [`${entry.file} 不是合法 JSON：${error.message}`], warnings: [] };
      this.RenderStatus();
      return false;
    }
    const wasPlaying = this.playing;
    const at = this.t;
    this.text = text;
    this.doc = doc;
    await this.previz.UseSource(TimelineAsPreviz(doc));
    this.validation = ValidateTimeline(doc, { config: this.editor.doc, voice: this.previz.voice });
    const lineDuration = (lineId) => this.previz.LineDuration(lineId) ?? TIMELINE_LINE_FALLBACK_S;
    this.layout = TimelineLayout(doc, { lineDuration });
    this.tracks = TimelineTracks(doc, this.layout, { lineInfo: (lineId) => this.previz.lines.get(lineId) || null });
    this.RenderTracks();
    this.RenderStatus();
    if (!force) {
      // 文件改了（agent 改的）：回到刚才那一秒，播着的接着播
      this.playing = false;
      await this.SeekTo(Math.min(at, this.layout.durationS));
      if (wasPlaying) this.Play();
    }
    return true;
  }

  // -------------------------------------------------------------------------
  // 走带

  /** 现在这一秒在主时间轴上的位置（播放中从预演播放器读回）。 */
  ReadTime() {
    const st = this.previz.run;
    if (!st || !this.layout) return this.t;
    const seg = this.layout.segments.find((s) => s.keyframe === st.seq.keyframe);
    return seg ? Math.min(this.layout.durationS, seg.start + st.t) : this.t;
  }

  /**
   * 拖到主时间轴 t 秒（停住）。t 落在别的段时先从那一段的关键帧布设起播。
   * 连点时排队：上一次换段没完就等它。
   */
  SeekTo(t) {
    const job = (this.busy || Promise.resolve()).then(() => this._SeekTo(t));
    this.busy = job.catch(() => {});
    return job;
  }

  async _SeekTo(t) {
    if (!this.layout?.segments.length) return this.State();
    const { index, local } = LocateTime(this.layout, t);
    const seg = this.layout.segments[index];
    const run = this.previz.run;
    if (!run || run.seq.keyframe !== seg.keyframe) await this.StartSegment(index);
    await this.previz.Seek(local);
    this.t = seg.start + local;
    this.RenderPlayhead();
    return this.State();
  }

  /** 从第 index 段的关键帧布设起播（等它真的开播再回）。播完时如果走带还在播，接着播下一段。 */
  async StartSegment(index) {
    const seg = this.layout.segments[index];
    const token = ++this.token;
    if (!this.previz.Has(seg.keyframe)) return false;
    const done = this.previz.Play(seg.keyframe);
    const started = this.previz.starting;
    done.then((finished) => {
      if (token !== this.token || !finished) return;
      if (this.playing && index + 1 < this.layout.segments.length) {
        this.StartSegment(index + 1).then((ok) => { if (ok && this.playing) this.previz.Resume(); });
      } else {
        this.playing = false;
        this.t = this.layout.durationS;
        this.RenderPlayhead();
      }
    });
    const ok = started ? await started : false;
    // 起播那一刻预演自己在走：先按住，由调用方决定 Seek / Resume
    if (ok && token === this.token) this.previz.Pause();
    return ok;
  }

  async Play() {
    if (!this.layout) return this.State();
    if (this.t >= this.layout.durationS - FRAME_S) await this.SeekTo(0);
    else if (!this.previz.run) await this.SeekTo(this.t);
    this.playing = true;
    this.previz.Resume();
    this.RenderTransport();
    return this.State();
  }

  Pause() {
    this.playing = false;
    this.previz.Pause();
    this.t = this.ReadTime();
    this.RenderTransport();
    return this.State();
  }

  Toggle() { return this.playing ? this.Pause() : this.Play(); }

  /** 逐帧：frames 帧（负数往回），停住。 */
  Step(frames = 1) {
    if (this.playing) this.Pause();
    return this.SeekTo(this.t + frames * FRAME_S);
  }

  /** 上一镜 / 下一镜（镜头轨的切点）。 */
  StepShot(delta) {
    if (!this.tracks?.shots.length) return this.State();
    const { shotIndex } = TracksAt(this.tracks, this.t + 1e-4);
    const target = Math.max(0, Math.min(this.tracks.shots.length - 1, (shotIndex < 0 ? 0 : shotIndex) + delta));
    if (this.playing) this.Pause();
    return this.SeekTo(this.tracks.shots[target].t0 + 1e-3);
  }

  // -------------------------------------------------------------------------
  // 每帧（Script_EditorBlockout.Update 调）

  Update() {
    if (!this.open) return;
    if (this.playing && this.previz.run && !this.previz.run.paused) {
      this.t = this.ReadTime();
      this.RenderPlayhead();
    }
    if (performance.now() - this.lastPoll > POLL_MS && !this.loading) {
      this.loading = true;
      this.Load().finally(() => { this.loading = false; });
    }
  }

  // -------------------------------------------------------------------------
  // agent 接口（window.Tengxian.Debug.Blockout.Timeline）

  BuildApi() {
    return {
      List: () => TIMELINES.map((entry) => ({ ...entry })),
      Open: (id) => this.Open(id),
      Close: () => this.Close(),
      State: () => this.State(),
      Play: () => this.Play(),
      Pause: () => this.Pause(),
      Seek: (t) => this.SeekTo(t),
      Step: (frames) => this.Step(frames),
      StepShot: (delta) => this.StepShot(delta),
      Reload: () => this.Load({ force: true }),
      Layout: () => (this.layout ? JSON.parse(JSON.stringify(this.layout)) : null),
      Tracks: () => (this.tracks ? JSON.parse(JSON.stringify(this.tracks)) : null),
    };
  }

  State() {
    const t = this.open ? this.ReadTime() : this.t;
    const loc = this.layout ? LocateTime(this.layout, t) : { index: -1, local: 0 };
    const seg = this.layout?.segments[loc.index] || null;
    const at = this.tracks ? TracksAt(this.tracks, t) : { shotIndex: -1, shot: null, lines: [] };
    const previz = this.previz.State();
    return {
      open: this.open, id: this.id, title: this.doc?.title ?? null,
      t: +t.toFixed(3), timecode: FormatTimecode(t), durationS: this.layout ? +this.layout.durationS.toFixed(3) : 0,
      playing: this.playing, paused: !!previz.paused,
      segment: seg ? { index: seg.index, keyframe: seg.keyframe, title: seg.title, local: +loc.local.toFixed(3) } : null,
      shot: at.shot ? { index: at.shotIndex, label: at.shot.label, kind: at.shot.kind, src: at.shot.src } : null,
      lines: at.lines.map((l) => ({ id: l.id, label: l.label })),
      subtitles: previz.subtitles, camera: previz.camera,
      errors: this.validation?.errors ?? [], warnings: this.validation?.warnings ?? [],
      missingClips: previz.missingClips, missingLines: previz.missingLines, missingSfx: previz.missingSfx,
    };
  }

  // -------------------------------------------------------------------------
  // 界面：一条底部面板。头一行走带，下面四条轨（段 / 镜头 / 台词 / 事件），点哪拖哪。

  BuildDom() {
    const root = this.root = El("div", "boTimeline");
    root.hidden = true;
    const head = El("div", "tlHead");
    head.append(El("span", "tlName", "Timeline"));
    this.elTitle = El("span", "tlTitle");
    this.elSeg = El("span", "tlSeg");
    const transport = El("div", "tlTransport");
    const Button = (glyph, tip, fn) => {
      const b = El("button", "tlBtn", glyph);
      b.type = "button"; b.title = tip;
      b.addEventListener("click", (e) => { e.stopPropagation(); fn(); });
      transport.append(b);
      return b;
    };
    Button("⏮", "回到开头（Home）", () => { this.Pause(); this.SeekTo(0); });
    Button("⇤", "上一镜（Shift+,）", () => this.StepShot(-1));
    Button("‹", "上一帧（,）", () => this.Step(-1));
    this.elPlay = Button("▶", "播放 / 暂停（空格）", () => this.Toggle());
    Button("›", "下一帧（.）", () => this.Step(1));
    Button("⇥", "下一镜（Shift+.）", () => this.StepShot(1));
    this.elTime = El("span", "tlTime");
    this.elStatus = El("span", "tlStatus");
    const close = El("button", "tlBtn tlClose", "✕");
    close.type = "button"; close.title = "关掉 Timeline（回到白盒编辑器）";
    close.addEventListener("click", (e) => { e.stopPropagation(); this.Close(); });
    head.append(this.elTitle, this.elSeg, transport, this.elTime, this.elStatus, close);

    const body = El("div", "tlBody");
    const labels = El("div", "tlLabels");
    for (const name of ["", "段", "镜头", "台词", "事件"]) labels.append(El("div", "tlLabel", name));
    this.elLanes = El("div", "tlLanes");
    this.elRuler = El("div", "tlRuler");
    this.elLaneSeg = El("div", "tlLane seg");
    this.elLaneShot = El("div", "tlLane shot");
    this.elLaneLine = El("div", "tlLane line");
    this.elLaneEvent = El("div", "tlLane event");
    this.elHead = El("div", "tlPlayhead");
    this.elLanes.append(this.elRuler, this.elLaneSeg, this.elLaneShot, this.elLaneLine, this.elLaneEvent, this.elHead);
    body.append(labels, this.elLanes);
    root.append(head, body);
    this.editor.ui.root.append(root);
    this.BindScrub();
    this.BindKeys();
  }

  BindScrub() {
    const TimeAt = (e) => {
      const r = this.elLanes.getBoundingClientRect();
      return Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * (this.layout?.durationS || 0);
    };
    let dragging = false;
    this.elLanes.addEventListener("pointerdown", (e) => {
      if (!this.layout || e.button !== 0) return;
      e.preventDefault(); e.stopPropagation();
      // 点在某一格上 = 跳到那一格开头；点在空处 / 拖 = 跳到指针那一秒
      const item = e.target.closest?.("[data-t0]");
      if (this.playing) this.Pause();
      dragging = !item;
      this.elLanes.setPointerCapture?.(e.pointerId);
      this.SeekTo(item ? Number(item.dataset.t0) + 1e-3 : TimeAt(e));
    });
    this.elLanes.addEventListener("pointermove", (e) => {
      if (!dragging) return;
      // 拖动时只保留最新一次（排队里的旧位置没必要一个个求值）
      this.pendingScrub = TimeAt(e);
      this.t = this.pendingScrub;
      this.RenderPlayhead();
      if (!this.scrubbing) {
        this.scrubbing = true;
        const Next = () => {
          const target = this.pendingScrub;
          this.pendingScrub = null;
          this.SeekTo(target).finally(() => { if (this.pendingScrub != null) Next(); else this.scrubbing = false; });
        };
        Next();
      }
    });
    const End = () => { dragging = false; };
    this.elLanes.addEventListener("pointerup", End);
    this.elLanes.addEventListener("pointercancel", End);
  }

  BindKeys() {
    this.onKey = (e) => {
      if (!this.open || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.target?.closest?.("input, textarea, select")) return;
      const handled = { Space: () => this.Toggle(), Home: () => { this.Pause(); this.SeekTo(0); },
        End: () => { this.Pause(); this.SeekTo(this.layout?.durationS ?? 0); },
        Comma: () => (e.shiftKey ? this.StepShot(-1) : this.Step(-1)),
        Period: () => (e.shiftKey ? this.StepShot(1) : this.Step(1)) }[e.code];
      if (!handled) return;
      e.preventDefault(); e.stopImmediatePropagation();
      if (!e.repeat || e.code === "Comma" || e.code === "Period") handled();
    };
    // 捕获阶段：空格在游戏里是跳，白盒编辑器自己也监听键盘，面板开着时这几键归走带
    window.addEventListener("keydown", this.onKey, true);
  }

  Pct(t) { return `${((t / (this.layout?.durationS || 1)) * 100).toFixed(4)}%`; }

  Item(lane, item, cls, text) {
    const el = El("div", `tlItem ${cls}`, text);
    el.style.left = this.Pct(item.t0);
    if (item.t1 != null) el.style.width = `max(2px, ${this.Pct(Math.max(0, item.t1 - item.t0))})`;
    el.dataset.t0 = String(item.t0);
    el.title = `${FormatTimecode(item.t0)}${item.t1 != null ? ` → ${FormatTimecode(item.t1)}` : ""}　${item.label || ""}${item.kind ? `（${item.kind}）` : ""}\n${item.src}`;
    lane.append(el);
    return el;
  }

  RenderTracks() {
    if (!this.root || !this.tracks) return;
    const tr = this.tracks, dur = this.layout.durationS;
    // 刻度：每 5 s 一小格、30 s 一大格（第一关开场 170 s，铺满一屏刚好看得清）
    this.elRuler.replaceChildren();
    for (let s = 0; s <= dur + 1e-6; s += 5) {
      const major = s % 30 === 0;
      const tick = El("i", major ? "tlTick major" : "tlTick");
      tick.style.left = this.Pct(s);
      if (major) tick.append(El("b", "", FormatTimecode(s).slice(0, 5)));
      this.elRuler.append(tick);
    }
    this.elLaneSeg.replaceChildren();
    tr.segments.forEach((s) => this.Item(this.elLaneSeg, s, "segItem", s.label));
    this.elLaneShot.replaceChildren();
    tr.shots.forEach((s, i) => this.Item(this.elLaneShot, s, `shotItem${i % 2 ? " alt" : ""}${s.keepMove ? " move" : ""}`, ""));
    this.elLaneLine.replaceChildren();
    tr.lines.forEach((l) => this.Item(this.elLaneLine, l, `lineItem${l.missing ? " bad" : ""}`, ""));
    this.elLaneEvent.replaceChildren();
    tr.events.forEach((e) => this.Item(this.elLaneEvent, e, `eventItem ${e.t1 != null ? "range" : "mark"} ev-${e.type}`, ""));
    this.elTitle.textContent = this.doc?.title || this.id;
    this.RenderPlayhead();
  }

  RenderPlayhead() {
    if (!this.root || !this.layout) return;
    this.elHead.style.left = this.Pct(this.t);
    this.elTime.textContent = `${FormatTimecode(this.t)} / ${FormatTimecode(this.layout.durationS)}`;
    const loc = LocateTime(this.layout, this.t);
    const seg = this.layout.segments[loc.index];
    const segText = seg ? `${seg.keyframe} ${seg.title}` : "";
    if (this.elSeg.textContent !== segText) this.elSeg.textContent = segText;
    this.RenderTransport();
  }

  RenderTransport() {
    if (!this.elPlay) return;
    const glyph = this.playing ? "⏸" : "▶";
    if (this.elPlay.textContent !== glyph) this.elPlay.textContent = glyph;
  }

  RenderStatus() {
    if (!this.elStatus) return;
    const v = this.validation;
    const text = !v ? "" : v.errors.length ? `${v.errors.length} 处错误` : v.warnings.length ? `${v.warnings.length} 条提醒` : "";
    this.elStatus.textContent = text;
    this.elStatus.className = `tlStatus${v?.errors.length ? " bad" : ""}`;
    this.elStatus.title = v ? [...v.errors, ...v.warnings].slice(0, 12).join("\n") : "";
  }
}

export default TimelineEditor;
