// Timeline 编辑器：过场动画的分镜表 + 走带。
//
// ## 为什么不是「把 CutsceneDirector 拆开重写一个预览器」
// 过场是**实机演出**：镜头、演员、字幕、音效、黑场全由 CutsceneDirector 一条时间轴
// 驱动。另写一个预览器就等于把那条时间轴抄第二遍 —— 抄漏一条（黑场的 alpha、
// 跳过卡的补字幕、shake 的确定性噪声）都会让「预览里对、正片里不对」。
// 所以这里**驱动的就是正片那一个 director**，只是把 Update 的步长接到走带上。
//
// ## 回拨怎么做
// director 的时间只能往前（字幕靠 prevTime→time 的跨越触发、fired 是 Set）。
// 所以「拖到 12.4 秒」= 从头 Play 一遍再用固定步长快进到 12.4 秒。
// 一场最长 38 秒，1/60 步长也才 2280 次纯数学迭代，比人眼快得多。
// 快进时把 director.audio 摘掉，否则拖一次进度条会把整场的枪声一次性放出来。
//
// ## 能读出什么
//   · 分镜秒数之和 ≠ 声明时长（ValidateCutscene 的硬断言）
//   · 每一镜的焦距换算成的实际 FOV（分镜表写 mm，代码里不许写度数）
//   · 字幕/台词有没有在该出的时候出（走带日志按镜列出来）
//   · 演员轨道的关键帧密度 —— 两帧之间跨得太远就是「以几十米每秒横穿画面」

import { Panel, Section, Slider, ButtonRow, Facts, Note, ListBox, El } from "./Script_EditorUi.mjs";
import { CUTSCENES, CUTSCENE_ORDER } from "./Data_TengxianScript.mjs";
import { ValidateCutscene, FovFromFocalMm } from "./Script_Cutscene.mjs";

const SEEK_STEP = 1 / 60;

export class TimelineEditor {
  static id = "timeline";
  static label = "Timeline 过场";
  static hint = "五场过场的分镜表、走带与自检";

  constructor(host) {
    this.host = host;
    this.panel = null;
    // 相机归 CutsceneDirector（它自己存/还机位）——外壳不许插手
    this.cameraMode = "none";
    this.cutId = CUTSCENE_ORDER[0];
    this.speed = 1;
    this.playing = false;
    this.pending = null;
    this.shotIndex = 0;
  }

  get director() { return this.host.cutscene; }

  Enter(root) {
    this.panel = Panel({
      title: "Timeline 编辑器", sub: "Script_Cutscene",
      variant: "work wide", onClose: () => this.host.Close(),
    });
    root.appendChild(this.panel.root);
    this.BuildUi(this.panel.body);
    this.SelectCut(this.cutId);
    return this;
  }

  Exit() {
    this.Stop();
    if (this.panel) this.panel.root.remove();
    this.panel = null;
  }

  // -------------------------------------------------------------------------
  // 界面
  // -------------------------------------------------------------------------

  BuildUi(body) {
    const pick = Section(body, "过场（按剧情顺序）");
    this.list = ListBox(pick, { height: 136, onPick: (id) => this.SelectCut(id) });
    this.list.Fill(CUTSCENE_ORDER.map((id) => {
      const cut = CUTSCENES[id];
      return {
        id, name: cut.title, tail: `${cut.seconds.toFixed(0)}s · ${cut.shots.length} 镜`,
        title: cut.why || "",
      };
    }));
    this.list.Select(this.cutId);
    this.whyNote = Note(pick, "");

    const band = Section(body, "走带");
    this.track = El("div", "edTrack");
    this.track.addEventListener("click", (e) => {
      const rect = this.track.getBoundingClientRect();
      const cut = CUTSCENES[this.cutId];
      this.Seek(((e.clientX - rect.left) / rect.width) * cut.seconds);
    });
    band.appendChild(this.track);
    this.playhead = El("div", "play");
    this.track.appendChild(this.playhead);

    ButtonRow(band, [
      { label: "▶ 播放", onClick: () => this.Play() },
      { label: "⏸ 暂停", onClick: () => { this.playing = false; } },
      { label: "⏮ 回到头", onClick: () => this.Seek(0) },
      { label: "上一镜", onClick: () => this.StepShot(-1) },
      { label: "下一镜", onClick: () => this.StepShot(1) },
      { label: "跳过（看补卡）", onClick: () => { if (this.director) this.director.Skip(); } },
      { label: "停", onClick: () => this.Stop(), cls: "danger" },
    ]);
    Slider(band, {
      label: "速度", min: 0.1, max: 2, step: 0.05, value: 1,
      onInput: (v) => { this.speed = v; },
    });

    const shot = Section(body, "当前镜");
    this.shotFacts = Facts(shot);
    this.shotNote = Note(shot, "");

    const outline = Section(body, "分镜表");
    this.shotList = ListBox(outline, {
      height: 168,
      onPick: (n) => {
        const cut = CUTSCENES[this.cutId];
        let at = 0;
        for (const s of cut.shots) {
          if (String(s.n) === String(n)) break;
          at += s.seconds;
        }
        this.Seek(at + 0.001);
      },
    });

    const check = Section(body, "自检 / 日志");
    this.checkFacts = Facts(check);
    this.logBox = El("div", "edNote");
    this.logBox.style.maxHeight = "132px";
    this.logBox.style.overflowY = "auto";
    check.appendChild(this.logBox);
    Note(check, "分镜秒数之和必须等于声明时长；对不上 Play() 会直接抛错 —— "
      + "这类改动在画面上看不出来，只表现为字幕来不及读完。", true);
  }

  // -------------------------------------------------------------------------
  // 选与放
  // -------------------------------------------------------------------------

  SelectCut(id) {
    this.Stop();
    this.cutId = id;
    const cut = CUTSCENES[id];
    this.whyNote.textContent = cut.why || "";
    this.shotList.Fill(cut.shots.map((s) => ({
      id: String(s.n),
      name: `镜 ${s.n} · ${s.focalMm}mm`,
      tail: `${s.seconds.toFixed(1)}s`,
      title: s.note || "",
    })));
    this.BuildTrack(cut);
    this.RefreshCheck(cut);
    this.RefreshShot(0, 0);
  }

  BuildTrack(cut) {
    // 只重建镜格，播放头留着（重建它会让指针在拖动时闪一下）
    for (let i = this.track.children.length - 1; i >= 0; i -= 1) {
      const child = this.track.children[i];
      if (child !== this.playhead) this.track.removeChild(child);
    }
    let at = 0;
    this.shotBlocks = [];
    for (const s of cut.shots) {
      const block = El("div", "shot", String(s.n));
      block.style.left = `${(at / cut.seconds) * 100}%`;
      block.style.width = `${(s.seconds / cut.seconds) * 100}%`;
      block.title = `镜 ${s.n} · ${s.seconds}s · ${s.focalMm}mm\n${s.note || ""}`;
      this.track.insertBefore(block, this.playhead);
      this.shotBlocks.push(block);
      at += s.seconds;
    }
  }

  /**
   * Play() 在**数据自检不过时是直接 throw 的**（不是 reject）——
   * 那条设计是对的（不许带着错的节奏上线），但编辑器不能跟着一起崩：
   * 崩在这里等于整个 rAF 循环停摆，用户看到的是「点了播放，游戏死了」。
   * 所以这一层把异常接住，写进自检栏。
   */
  SafePlay() {
    const director = this.director;
    if (!director) return false;
    try {
      this.pending = director.Play(this.cutId).catch(() => null);
      this.error = null;
      return true;
    } catch (error) {
      this.error = String(error && error.message ? error.message : error);
      this.checkFacts.Set("Play 失败", this.error, "bad");
      return false;
    }
  }

  Play() {
    const director = this.director;
    if (!director) return;
    if (!director.Playing && !this.SafePlay()) return;
    this.playing = true;
  }

  Stop() {
    const director = this.director;
    this.playing = false;
    if (director && director.Playing) {
      // Skip 之后还有一张补卡要读；编辑器要的是「立刻停」，所以再推一大步把它收掉
      director.Skip();
      director.Update(99);
    }
    this.pending = null;
  }

  /** 拖到 t 秒：从头重放一遍再静音快进。 */
  Seek(seconds) {
    const director = this.director;
    const cut = CUTSCENES[this.cutId];
    if (!director || !cut) return;
    const target = Math.max(0, Math.min(cut.seconds - 0.01, seconds));
    if (director.Playing) { director.Skip(); director.Update(99); }
    const audio = director.audio;
    director.audio = null;                 // 快进期间不许出声（一整场的枪声会同时炸开）
    try {
      if (this.SafePlay()) {
        let t = 0;
        let guard = 0;
        while (t < target && guard < 20000) {
          director.Update(SEEK_STEP);
          t += SEEK_STEP;
          guard += 1;
        }
      }
    } finally {
      director.audio = audio;
    }
    this.playing = false;
  }

  StepShot(delta) {
    const cut = CUTSCENES[this.cutId];
    const index = Math.max(0, Math.min(cut.shots.length - 1, this.shotIndex + delta));
    let at = 0;
    for (let i = 0; i < index; i += 1) at += cut.shots[i].seconds;
    this.Seek(at + 0.001);
  }

  // -------------------------------------------------------------------------
  // 每帧
  // -------------------------------------------------------------------------

  Update(dt) {
    const director = this.director;
    if (!director) return;
    if (this.playing && director.Playing) director.Update(dt * this.speed);
    else if (director.Playing && director.cardTime >= 0) director.Update(dt);  // 补卡照读

    const cut = CUTSCENES[this.cutId];
    const time = director.Playing ? director.Time : 0;
    let at = 0;
    let index = 0;
    for (let i = 0; i < cut.shots.length; i += 1) {
      if (time < at + cut.shots[i].seconds) { index = i; break; }
      at += cut.shots[i].seconds;
      index = i;
    }
    this.playhead.style.left = `${Math.min(100, (time / cut.seconds) * 100)}%`;
    if (this.shotBlocks) {
      this.shotBlocks.forEach((block, i) => block.classList.toggle("on", i === index && director.Playing));
    }
    this.RefreshShot(index, time - at);
    this.RefreshLog();
  }

  RefreshShot(index, local) {
    const cut = CUTSCENES[this.cutId];
    const shot = cut.shots[index];
    if (!shot) return;
    this.shotIndex = index;
    const f = this.shotFacts;
    f.Set("镜", `${shot.n} / ${cut.shots.length}`);
    f.Set("时长", `${shot.seconds.toFixed(2)} s（本镜 ${Math.max(0, local).toFixed(2)}）`);
    f.Set("焦距", `${shot.focalMm} mm → FOV ${FovFromFocalMm(shot.focalMm).toFixed(1)}°`);
    const camera = shot.camera || {};
    f.Set("机位", camera.from ? camera.from.map((v) => v.toFixed(2)).join(", ") : "—");
    if (camera.to) f.Set("推到", camera.to.map((v) => v.toFixed(2)).join(", "));
    f.Set("看向", camera.look ? camera.look.map((v) => v.toFixed(2)).join(", ") : "—");
    if (camera.shake) f.Set("手持抖动", camera.shake, "warn");
    f.Set("缓动", camera.ease || "easeInOut");
    f.Set("字幕 / 音效", `${(shot.subs || []).length} / ${(shot.sfx || []).length}`);
    f.Set("台词", `${(shot.lines || []).length}`);
    this.shotNote.textContent = shot.note || "（分镜没写说明）";
  }

  RefreshCheck(cut) {
    const problems = ValidateCutscene(cut);
    const f = this.checkFacts;
    f.Clear();
    const sum = cut.shots.reduce((a, s) => a + s.seconds, 0);
    f.Set("声明时长", `${cut.seconds.toFixed(2)} s`);
    f.Set("分镜之和", `${sum.toFixed(2)} s`, Math.abs(sum - cut.seconds) > 0.005 ? "bad" : "good");
    f.Set("演员 / 道具", `${(cut.cast || []).length} / ${(cut.props || []).length}`);
    f.Set("独立布景", cut.standalone ? `是 · 原点 ${cut.setOrigin ? cut.setOrigin.join(",") : "?"}` : "叠在城上");
    f.Set("触发", cut.trigger || "—");
    // 关键帧密度：轨道两帧之间跨太远 = 演员会以几十米每秒横穿画面
    let worst = 0;
    let worstWho = "";
    for (const actor of cut.cast || []) {
      for (let i = 1; i < actor.track.length; i += 1) {
        const a = actor.track[i - 1];
        const b = actor.track[i];
        const dt = Math.max(0.001, b.t - a.t);
        const dist = Math.hypot(b.pos[0] - a.pos[0], b.pos[2] - a.pos[2]);
        const speed = dist / dt;
        // hidden 的那一段是**故意瞬移**（换场），不算
        if (b.state && b.state.hidden) continue;
        if (a.state && a.state.hidden) continue;
        if (speed > worst) { worst = speed; worstWho = `${actor.id} 第 ${i} 帧`; }
      }
    }
    f.Set("轨道最快", `${worst.toFixed(2)} m/s（${worstWho || "—"}）`, worst > 4.6 ? "bad" : "good");
    f.Set("自检", problems.length ? `${problems.length} 条不过` : "全过",
      problems.length ? "bad" : "good");
    if (problems.length) {
      for (let i = 0; i < Math.min(4, problems.length); i += 1) f.Set(`· ${i + 1}`, problems[i], "bad");
    }
  }

  RefreshLog() {
    const director = this.director;
    if (!director || !this.logBox) return;
    const lines = director.log.slice(-12).map((entry) => {
      const who = entry.who ? `${entry.who}：` : (entry.kind === "sub" ? "〔字幕〕" : "");
      return `镜${entry.shot} ${who}${entry.text}`;
    });
    const text = lines.join("\n");
    if (this.logBox.textContent !== text) this.logBox.textContent = text;
  }
}

export default TimelineEditor;
