// ===========================================================================
// Script_EditorBlockoutMusic.mjs —— 白盒关卡编辑器的「配乐」试听面板（docs/Data_FirstLevelScoreRedesign.md §4）
//
// 2026-10-13 用户：「重新给我配一下第一关需要的各个背景音乐……同时我需要能在白盒设计工具里来预览」。
//   · 右上一条胶囊：现在在放什么（现行 / 新方案 / 曲库里点的那首 / 静）；点开是面板。
//   · 面板：模式三选一（现行 / 新方案 / 关）——跟着关键帧自动换曲；当前关键帧两套方案各放什么、为什么；
//     曲库（现行九首 + 新方案十首）逐首点播；音量。
//   · 播放走自己的 AudioContext，不进游戏的音乐总线（编辑器模式不建任务运行时，游戏本来就不放乐）；
//     循环与游戏一致：整首从头放、尾部 loopFadeS 秒交叉淡进下一轮；换曲 1.6 s 交叉淡（FIRST_LEVEL_MUSIC_MIX.transitionS）。
//   · 电平：两套曲子都按 RMS −27 dBFS 打包，乘各自的 cue 电平 × 阶段电平，A/B 是同一把尺子。
//     现行这一边不模拟对白让位与 03–05 的战斗让位（预览没有对白、没有战场强度）。
// 只碰 DOM 与 WebAudio，不碰 three；挂进 BlockoutUi 的根节点，鼠标 / 键盘拦截沿用它的（Script_EditorBlockoutUi 文件头）。
// ===========================================================================
import { FIRST_LEVEL_MUSIC_MIX, FIRST_LEVEL_MUSIC_VERSION } from "./Data_FirstLevelMissionMusic.mjs";
import { CurrentScoreForKeyframe, RedesignScoreForKeyframe, ScoreLibrary, SCORE_REDESIGN_CUES, SCORE_REDESIGN_VERSION }
  from "./Data_FirstLevelScoreRedesign.mjs";

const LOOP_FADE_S = 6;
const SWITCH_FADE_S = FIRST_LEVEL_MUSIC_MIX.transitionS;
const MODES = Object.freeze([
  { id: "redesign", label: "新方案" },
  { id: "current", label: "现行" },
  { id: "off", label: "关" },
]);
// 只记本页会话的偏好（模式、音量、面板开合）：编辑器模式不写 localStorage（Data_EditorBlockout §1），用 sessionStorage，读写都包 try
const STORE_KEY = "tengxian.blockout.music";

const NOTE_SVG = '<svg viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 12.2V3.6l7-1.4v8.4"/><circle cx="4.4" cy="12.2" r="1.7"/><circle cx="11.4" cy="10.6" r="1.7"/></svg>';
const PLAY_SVG = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M5 3.4v9.2L12.4 8z" fill="currentColor"/></svg>';
const STOP_SVG = '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="4.2" y="4.2" width="7.6" height="7.6" fill="currentColor"/></svg>';

function El(tag, className = "", text = "") {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text) el.textContent = text;
  return el;
}
function Button(className, html, tip) {
  const b = El("button", `boBtn ${className}`);
  b.type = "button";
  if (html) b.innerHTML = html;
  if (tip) { b.dataset.tip = tip; b.setAttribute("aria-label", tip); }
  return b;
}
function ReadPrefs() {
  try { return JSON.parse(sessionStorage.getItem(STORE_KEY) || "{}") || {}; } catch { return {}; }
}
function WritePrefs(prefs) {
  try { sessionStorage.setItem(STORE_KEY, JSON.stringify(prefs)); } catch { /* 无痕窗口 / 被禁用：不记 */ }
}
const Db = level => (level > 0 ? `${(20 * Math.log10(level)).toFixed(1)} dB` : "—");

/** 一首循环：整首从头放，尾部 fadeS 秒交叉淡进下一轮（与游戏 LoopLayer 同一个听感）。 */
class LoopVoice {
  constructor(ctx, buffer, out, { loop, fadeS }) {
    this.ctx = ctx; this.buffer = buffer; this.loop = loop;
    this.fadeS = Math.min(fadeS, buffer.duration / 4);
    this.gain = ctx.createGain();
    this.gain.gain.value = 0;
    this.gain.connect(out);
    this.sources = new Set();
    this.startedAt = ctx.currentTime;
    this.Schedule(ctx.currentTime + 0.03, true);
  }
  Schedule(at, first) {
    const src = this.ctx.createBufferSource(), env = this.ctx.createGain();
    src.buffer = this.buffer;
    src.connect(env).connect(this.gain);
    const dur = this.buffer.duration, f = this.fadeS;
    env.gain.setValueAtTime(first ? 1 : 0, at);
    if (!first) env.gain.linearRampToValueAtTime(1, at + f);
    if (this.loop) {
      env.gain.setValueAtTime(1, at + dur - f);
      env.gain.linearRampToValueAtTime(0, at + dur);
    }
    src.start(at);
    this.scheduled = (this.scheduled || 0) + 1;
    this.starts = [...(this.starts || []).slice(-1), at];
    src.onended = () => { this.sources.delete(src); };
    this.sources.add(src);
    this.nextAt = this.loop ? at + dur - f : Infinity;
  }
  Tick() { if (this.loop && !this.stopped && this.ctx.currentTime > this.nextAt - 1) this.Schedule(this.nextAt, false); }
  Fade(level, seconds) {
    const g = this.gain.gain, now = this.ctx.currentTime;
    g.cancelScheduledValues(now);
    g.setValueAtTime(g.value, now);
    g.linearRampToValueAtTime(level, now + Math.max(0.02, seconds));
  }
  Stop(seconds) {
    this.stopped = true;
    this.Fade(0, seconds);
    const end = this.ctx.currentTime + seconds + 0.05;
    for (const src of this.sources) { try { src.stop(end); } catch { /* 已停 */ } }
    setTimeout(() => { try { this.gain.disconnect(); } catch { /* 已断 */ } }, (seconds + 0.2) * 1000);
  }
  // 当前这一轮从哪儿起：最近一个已经开始的播放头
  get position() {
    const now = this.ctx.currentTime, at = [...this.starts].reverse().find(t => t <= now) ?? this.startedAt;
    return Math.min(now - at, this.buffer.duration);
  }
}

export class BlockoutMusic {
  /** @param {HTMLElement} root BlockoutUi 的根（.boRoot） */
  constructor(root) {
    const prefs = ReadPrefs();
    this.mode = MODES.some(m => m.id === prefs.mode) ? prefs.mode : "redesign";
    this.volume = Number.isFinite(prefs.volume) ? Math.min(1, Math.max(0, prefs.volume)) : 0.8;
    this.open = prefs.open !== false;
    this.levelKey = "";
    this.keyframeId = "";
    this.pick = null;              // 曲库里点播的那首（{set, cueId}）；换关键帧不动它，点模式按钮才回到跟随
    this.want = null;              // 当前应当在放的 {key, file, level, loop, title}
    this.voice = null;
    this.buffers = new Map();      // file → AudioBuffer
    this.loading = new Map();      // file → Promise
    this.missing = new Set();      // 读不到的文件（新方案还没生成）
    this.ctx = null;
    this.library = ScoreLibrary();
    this.Build(root);
    this.timer = setInterval(() => { this.voice?.voice.Tick(); this.UpdateClock(); }, 250);
    this.Render();
  }

  // ---------------------------------------------------------------------------
  // 界面

  Build(root) {
    const wrap = El("div", "boMusic");
    wrap.setAttribute("data-blockout-music", "");
    this.pill = Button("boMusicPill", "", "配乐试听");
    this.pill.dataset.tipSide = "left";
    this.pillIcon = El("i", "boMusicIcon");
    this.pillIcon.innerHTML = NOTE_SVG;
    this.pillText = El("span", "boMusicPillText");
    this.pill.append(this.pillIcon, this.pillText);
    this.pill.addEventListener("click", () => { this.open = !this.open; this.Save(); this.Render(); });

    const panel = El("section", "boMusicPanel boPanel");
    panel.setAttribute("aria-label", "配乐试听");
    const modes = El("div", "boMusicModes");
    modes.setAttribute("role", "radiogroup");
    this.modeBtns = {};
    for (const m of MODES) {
      const b = Button("boMusicMode", "", "");
      b.textContent = m.label;
      b.setAttribute("role", "radio");
      b.addEventListener("click", () => this.SetMode(m.id));
      this.modeBtns[m.id] = b;
      modes.append(b);
    }
    this.vol = El("input", "boMusicVol");
    Object.assign(this.vol, { type: "range", min: "0", max: "1", step: "0.05", value: String(this.volume) });
    this.vol.setAttribute("aria-label", "试听音量");
    this.vol.addEventListener("input", () => { this.volume = Number(this.vol.value); this.ApplyVolume(); });
    // 滑块松手就交还焦点：焦点留在界面里，WASD 会被根上的按键拦截吞掉
    this.vol.addEventListener("change", () => { this.Save(); this.vol.blur(); });
    const head = El("div", "boMusicHead");
    head.append(modes, this.vol);

    this.rowRedesign = this.BuildRow("新方案", "redesign");
    this.rowCurrent = this.BuildRow("现行", "current");
    this.elClock = El("div", "boMusicClock");

    const lib = El("details", "boMusicLib");
    const sum = El("summary", "", "曲库");
    // 不留焦点（同按钮）：焦点留在界面里，回到游戏时 WASD 会被根上的按键拦截吞掉
    sum.addEventListener("mousedown", e => e.preventDefault());
    lib.append(sum);
    this.libList = El("div", "boMusicLibList");
    lib.append(this.libList);
    lib.addEventListener("toggle", () => { if (lib.open) this.RenderLibrary(); });
    this.libEl = lib;

    panel.append(head, this.rowRedesign.el, this.rowCurrent.el, this.elClock, lib);
    this.panel = panel;
    wrap.append(this.pill, panel);
    this.el = wrap;
    root.appendChild(wrap);
  }

  BuildRow(label, set) {
    const el = El("div", `boMusicRow ${set}`);
    const play = Button("boIconBtn boMusicPlay", PLAY_SVG, `只放${label}这一首`);
    play.dataset.tipSide = "left";
    play.addEventListener("click", () => this.SetMode(set));
    const body = El("div", "boMusicRowBody");
    const top = El("div", "boMusicRowTop");
    const tag = El("span", "boMusicTag", label);
    const title = El("span", "boMusicTitle");
    const meta = El("span", "boMusicMeta");
    top.append(tag, title, meta);
    const why = El("div", "boMusicWhy");
    body.append(top, why);
    el.append(body, play);
    return { el, title, meta, why, play };
  }

  RenderLibrary() {
    this.libList.textContent = "";
    for (const [set, list, label] of [["redesign", this.library.redesign, "新方案"], ["current", this.library.current, "现行"]]) {
      this.libList.append(El("div", "boMusicLibHead", label));
      for (const item of list) {
        const row = El("button", "boMusicLibItem");
        row.type = "button";
        const playing = this.pick?.set === set && this.pick.cueId === item.cueId;
        row.classList.toggle("on", playing);
        row.classList.toggle("missing", this.missing.has(item.file));
        const icon = El("i", "boMusicLibIcon");
        icon.innerHTML = playing ? STOP_SVG : PLAY_SVG;
        row.append(icon, El("span", "boMusicLibTitle", item.title),
          El("span", "boMusicLibNote", this.missing.has(item.file) ? "未生成" : item.note));
        row.addEventListener("click", () => {
          this.pick = playing ? null : { set, cueId: item.cueId };
          this.missing.delete(item.file);
          if (!this.pick && this.mode === "off") this.mode = "redesign";
          this.Refresh();
        });
        this.libList.append(row);
      }
    }
  }

  Render() {
    this.el.classList.toggle("open", this.open);
    this.pill.setAttribute("aria-expanded", String(this.open));
    for (const m of MODES) {
      const on = !this.pick && this.mode === m.id;
      this.modeBtns[m.id].classList.toggle("on", on);
      this.modeBtns[m.id].setAttribute("aria-checked", String(on));
    }
    const plan = this.Plans();
    for (const [row, info, set] of [[this.rowRedesign, plan.redesign, "redesign"], [this.rowCurrent, plan.current, "current"]]) {
      row.el.classList.toggle("on", !this.pick && this.mode === set);
      row.el.classList.toggle("none", !info?.file);
      row.title.textContent = !plan.known ? "这一关还没有配乐方案" : info?.file ? `《${info.title}》` : "不放乐";
      row.meta.textContent = info?.file ? (this.missing.has(info.file) ? "未生成" : `${info.role ? `${info.role} · ` : ""}${Db(info.level)}`) : "";
      row.why.textContent = info?.why || (set === "current" && info?.step ? `任务步骤 ${info.step}` : set === "current" && plan.known ? "这一步游戏不放乐" : "");
      row.play.disabled = !info?.file;
    }
    const w = this.want;
    this.pillText.textContent = this.mode === "off" && !this.pick ? "配乐 · 关"
      : w ? `${this.pick ? "曲库" : this.mode === "current" ? "现行" : "新方案"} · ${w.title}` : `${this.mode === "current" ? "现行" : "新方案"} · 静`;
    this.el.classList.toggle("playing", !!w);
    if (this.libEl.open) this.RenderLibrary();
    this.UpdateClock();
  }

  UpdateClock() {
    if (!this.elClock) return;
    const w = this.want, v = this.voice;
    if (!w) { this.elClock.textContent = ""; return; }
    if (this.missing.has(w.file)) { this.elClock.textContent = `《${w.title}》还没生成（Script_FirstLevelScoreRedesignBake）`; return; }
    if (!v || v.key !== w.key) { this.elClock.textContent = this.loading.has(w.file) ? "载入中…" : ""; return; }
    const t = v.voice.position, d = v.voice.buffer.duration;
    const fmt = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
    this.elClock.textContent = `${fmt(t)} / ${fmt(d)}${w.loop ? " · 循环" : ""}`;
  }

  // ---------------------------------------------------------------------------
  // 选曲

  Plans() {
    const known = this.levelKey === "FirstLevel" && !!this.keyframeId;
    if (!known) return { known: false, current: null, redesign: null };
    return { known, current: CurrentScoreForKeyframe(this.keyframeId), redesign: RedesignScoreForKeyframe(this.keyframeId) };
  }

  /** 由总控在每次切关键帧时调用。 */
  SetKeyframe(levelKey, keyframeId) {
    if (levelKey === this.levelKey && keyframeId === this.keyframeId) return;
    this.levelKey = levelKey || "";
    this.keyframeId = keyframeId || "";
    this.Refresh();
  }

  SetMode(mode) {
    if (!MODES.some(m => m.id === mode)) return;
    this.mode = mode;
    this.pick = null;
    // 点按钮 = 再试一次：之前没读到的（新曲刚生成完）重新去读
    this.missing.clear();
    this.Save();
    this.Refresh();
  }

  Want() {
    if (this.pick) {
      const item = this.library[this.pick.set].find(it => it.cueId === this.pick.cueId);
      const loop = this.pick.set === "current" || SCORE_REDESIGN_CUES[item.cueId]?.loop !== false;
      return item && { key: `${this.pick.set}:${item.cueId}`, file: item.file, level: item.level, loop, title: `《${item.title}》`, set: this.pick.set };
    }
    if (this.mode === "off") return null;
    const info = this.Plans()[this.mode];
    if (!info?.file) return null;
    const loop = this.mode === "current" || SCORE_REDESIGN_CUES[info.cueId]?.loop !== false;
    return { key: `${this.mode}:${info.cueId}`, file: info.file, level: info.level, loop, title: `《${info.title}》`, set: this.mode };
  }

  Refresh() {
    const want = this.Want();
    const same = want && this.voice && this.voice.key === want.key;
    this.want = want;
    if (same) this.voice.voice.Fade(want.level * this.volume, SWITCH_FADE_S);
    else this.Switch(want);
    this.Render();
  }

  Url(want) {
    return `./${want.file}?v=${want.set === "current" ? FIRST_LEVEL_MUSIC_VERSION : SCORE_REDESIGN_VERSION}`;
  }

  Load(want) {
    if (this.buffers.has(want.file)) return Promise.resolve(this.buffers.get(want.file));
    if (this.loading.has(want.file)) return this.loading.get(want.file);
    const p = fetch(this.Url(want))
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.arrayBuffer(); })
      .then(data => this.Context().decodeAudioData(data))
      .then(buffer => { this.buffers.set(want.file, buffer); return buffer; })
      .catch(error => { this.missing.add(want.file); console.warn(`[BlockoutMusic] ${want.file}: ${error.message}`); return null; })
      .finally(() => { this.loading.delete(want.file); this.Render(); });
    this.loading.set(want.file, p);
    return p;
  }

  Context() {
    if (!this.ctx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      this.ctx = new Ctx();
      this.out = this.ctx.createGain();
      this.out.connect(this.ctx.destination);
    }
    if (this.ctx.state === "suspended") this.ctx.resume().catch(() => {});
    return this.ctx;
  }

  async Switch(want) {
    const old = this.voice;
    this.voice = null;
    if (old) old.voice.Stop(SWITCH_FADE_S);
    if (!want || this.missing.has(want.file)) return;
    const buffer = await this.Load(want);
    // 晚到的旧请求不许打断后来的选择
    if (!buffer || this.disposed || this.want?.key !== want.key || this.voice) return;
    const voice = new LoopVoice(this.Context(), buffer, this.out, { loop: want.loop, fadeS: LOOP_FADE_S });
    voice.Fade(want.level * this.volume, old ? SWITCH_FADE_S : 0.4);
    this.voice = { key: want.key, voice };
    this.Render();
  }

  ApplyVolume() {
    if (this.voice && this.want) this.voice.voice.Fade(this.want.level * this.volume, 0.08);
  }

  Save() { WritePrefs({ mode: this.mode, volume: this.volume, open: this.open }); }

  State() {
    return {
      mode: this.mode, pick: this.pick, open: this.open, volume: this.volume,
      levelKey: this.levelKey, keyframeId: this.keyframeId,
      want: this.want ? { ...this.want } : null,
      playing: this.voice ? { key: this.voice.key, position: this.voice.voice.position, duration: this.voice.voice.buffer.duration,
        sources: this.voice.voice.sources.size, loops: this.voice.voice.scheduled } : null,
      contextState: this.ctx?.state ?? null,
      missing: [...this.missing],
      plans: this.Plans(),
    };
  }

  Dispose() {
    this.disposed = true;
    clearInterval(this.timer);
    this.voice?.voice.Stop(0.2);
    this.voice = null;
    setTimeout(() => { this.ctx?.close().catch(() => {}); }, 400);
    this.el.remove();
  }
}
