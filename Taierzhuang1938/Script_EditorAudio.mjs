// 音效音乐编辑器：全套声音的试听台 + 指认台。
//
// ## 每个音都有两层：实录采样盖在合成配方上
// 底层是 WebAudio 节点图现算的 32 个配方（Script_Audio 的 RECIPES），
// 上面盖着一层实录素材（Audio/Sfx/，来源见 Data_SfxSources.mjs）。
// 采样是异步 fetch 的，**盖不上去就自动退回合成** —— 所以列表里每条都标了
// 「实录 / 合成」：当前到底在响哪一层，只有摆出来才答得清。
// 名字（rifleNra / impactFlesh / shellIncoming）光看字面认不出是什么声音，
// 这就是「指认」那一栏存在的理由：一句中文说明 + 它在游戏里什么时候响。
//
// ## 盲听
// 混音表（MIX_GAIN）是拿实拍峰值配的，但「这一声在战场上够不够清楚」只能靠耳朵。
// 盲听模式随机播一个、给四个候选 —— 认错的那几个通常就是**需要重新配平**的：
// 拉栓与压弹分不开、砖与土分不开，玩家在战场上也就分不开。
//
// ## 三条注意
//   1. AudioContext 必须由用户手势解锁。打开这个编辑器本身就是一次点击，
//      所以 Enter() 里直接 Unlock()，人声也是在那一刻才开始下载。
//   2. 出图模式（?shot=1）里 AudioEngine 是 enabled:false —— 全栏会显示「已关闭」。
//   3. 环境床与音乐是**常驻**的：编辑器里点开之后退出编辑器不会自动停，
//      所以 Exit() 里把它们还原成进来时的样子。

import { Panel, Section, Slider, Chips, ButtonRow, Button, Facts, Note, ListBox, El }
  from "./Script_EditorUi.mjs";
import { SOUND_NAMES, AMBIENCE_PRESETS, MUSIC_CUES } from "./Script_Audio.mjs";
import { VOICE_LINES } from "./Data_Voice.mjs";

/**
 * 配方 → 「这是什么声音、什么时候响」。
 * 这张表是**给人用的**，不参与任何逻辑；漏一条只是列表里少一句说明。
 */
const SOUND_INFO = {
  rifleNra: ["枪械", "中方步枪近射", "中正式/汉阳造在身边开火。7.92 的爆响 + 街巷回声"],
  rifleNraFar: ["枪械", "中方步枪远射", "两百米外的枪声，只剩一记闷炸和尾巴。环境床的主料"],
  rifleIja: ["枪械", "日军步枪近射", "三八式。6.5 mm 声音更脆更高，与中方那一支必须听得出区别"],
  rifleIjaFar: ["枪械", "日军步枪远射", "远处日军的射击，环境床里与中方那条交替出现"],
  zb26: ["枪械", "捷克式点射", "ZB-26，全班唯一一挺轻机枪。默认 3 发一点"],
  type11: ["枪械", "十一年式点射", "日军歪把子，4 发一点"],
  type92: ["枪械", "九二式重机枪", "「啄木鸟」——射速只有 200 发/分，节奏明显慢"],
  bolt: ["枪械", "拉栓", "抬-拉-推-闭一整套。玩法反馈音，听不见等于没有"],
  stripperLoad: ["枪械", "桥夹压弹", "五发桥夹从上方压进固定弹仓"],
  magIn: ["枪械", "弹匣入位", "捷克式从上方插弹匣"],
  grenadePin: ["爆炸", "拧弹盖 / 拉弦", "木柄手榴弹的引信。攥弹倒计时从这一声起"],
  grenadeThrow: ["爆炸", "投掷", "抡臂出手的风声"],
  explosionNear: ["爆炸", "近距爆炸", "手榴弹/炮弹在身边炸。冲击 + 碎砖 + 耳鸣"],
  explosionFar: ["爆炸", "远处爆炸", "城外落弹的闷响，环境床用"],
  shellIncoming: ["爆炸", "炮弹啸声", "落点前的预警。听到它到炸有 1.5 秒 —— 这是玩家唯一的躲避窗口"],
  shellImpact: ["爆炸", "炮弹落地", "野炮/山炮命中，比手榴弹低一个八度"],
  launcherPop: ["爆炸", "掷弹筒发射", "「咚」的一声闷响，接着是 3.2 秒飞行"],
  dadaoSwing: ["白刃", "大刀挥空", "破风声。挥空与劈中必须听得出区别，不然玩家不知道砍没砍到"],
  dadaoHit: ["白刃", "大刀劈中", "钝器入肉，带一点骨头的脆响"],
  bayonetHit: ["白刃", "刺刀命中", "刺入 + 拔出。比劈砍短促"],
  impactBrick: ["命中", "打在砖上", "青砖飞屑。城里最常听到的一种跳弹"],
  impactDirt: ["命中", "打在土上", "夯土/地面，闷、短、没有尾巴"],
  impactWood: ["命中", "打在木头上", "门板、房梁、电线杆"],
  impactMetal: ["命中", "打在铁上", "铁门、战车装甲、锅碗。带金属余振"],
  impactFlesh: ["命中", "打中人", "这一声决定玩家知不知道自己命中了"],
  footstepDirt: ["身体", "脚步 · 土路", "低优先级：预算紧时先丢它"],
  footstepRubble: ["身体", "脚步 · 瓦砾", "踩碎砖的碎响，城破之后的主要地面"],
  bodyFall: ["身体", "倒地", "一个人倒下的闷响 + 装具的碰撞"],
  hurt: ["身体", "中弹闷哼", "非语言的痛呼，与人声库里那几句是两回事"],
  heartbeat: ["身体", "心跳", "重伤/濒死时的主观听感"],
  bugleCharge: ["信号", "冲锋号", "军号动机。反攻与突围的信号"],
  whistle: ["信号", "哨音", "军官下令的哨子"],
};

const CATEGORIES = ["全部", "枪械", "爆炸", "命中", "白刃", "身体", "信号"];

/** 人声按 kind 归组的中文名（Data_Voice 的 kind 字段）。 */
const VOICE_KIND = {
  rally: "鼓动 / 督战", spot: "报敌情", warn: "警告", ammo: "弹药", hurt: "负伤", move: "机动",
};

export class AudioEditor {
  static id = "audio";
  static label = "音效音乐";
  static hint = "全部配方的试听、混音参数与盲听指认";

  constructor(host) {
    this.host = host;
    this.panel = null;
    this.cameraMode = "none";   // 听声音不动相机：画面停在打开编辑器的那一帧
    this.category = "全部";
    this.soundName = SOUND_NAMES[0];
    this.volume = 1;
    this.pitch = 1;
    this.burst = 0;              // 0 = 用配方默认
    this.distance = 0;           // 0 = 非空间化
    this.blind = null;           // { answer, options, tries }
    this.blindScore = { right: 0, total: 0 };
    this.lastSampled = -1;       // 采样是异步载入的，数字一变就重刷列表尾标
    this.savedAmbience = null;
    this.savedMusic = null;
  }

  get audio() { return this.host.audio; }

  Enter(root) {
    const audio = this.audio;
    // 打开编辑器这一下就是用户手势 —— 人声也从这一刻开始下载
    if (audio) {
      audio.Unlock();
      this.savedAmbience = audio.ambiencePreset || "silence";
      this.savedMusic = audio.musicCue || null;
    }
    this.panel = Panel({
      title: "音效音乐编辑器", sub: "Script_Audio",
      variant: "work wide", onClose: () => this.host.Close(),
    });
    root.appendChild(this.panel.root);
    this.BuildUi(this.panel.body);
    this.FillSounds();
    return this;
  }

  Exit() {
    const audio = this.audio;
    if (audio) {
      // 环境床与音乐是常驻的：不还原的话退出编辑器之后战场上会一直挂着菜单音乐
      audio.Ambience(this.savedAmbience || "silence");
      audio.Music(this.savedMusic || null);
    }
    if (this.panel) this.panel.root.remove();
    this.panel = null;
  }

  // -------------------------------------------------------------------------
  // 界面
  // -------------------------------------------------------------------------

  BuildUi(body) {
    const state = Section(body, "引擎");
    this.engineFacts = Facts(state);

    const sfx = Section(body, "音效配方");
    Chips(sfx, CATEGORIES, this.category, (v) => { this.category = v; this.FillSounds(); });
    this.soundList = ListBox(sfx, {
      height: 210,
      onPick: (name) => { this.soundName = name; this.Describe(); this.PlayCurrent(); },
    });
    this.soundNote = Note(sfx, "");

    const play = Section(body, "试听参数");
    Slider(play, { label: "音量", min: 0, max: 2, step: 0.05, value: 1, onInput: (v) => { this.volume = v; } });
    Slider(play, { label: "变调", min: 0.5, max: 2, step: 0.01, value: 1, onInput: (v) => { this.pitch = v; } });
    Slider(play, {
      label: "点射发数", min: 0, max: 10, step: 1, value: 0,
      format: (v) => (v === 0 ? "默认" : String(v)),
      onInput: (v) => { this.burst = v; },
    });
    Slider(play, {
      label: "距离", min: 0, max: 200, step: 1, value: 0,
      format: (v) => (v === 0 ? "贴耳" : `${v} m`),
      onInput: (v) => { this.distance = v; },
    });
    ButtonRow(play, [
      { label: "▶ 播放", onClick: () => this.PlayCurrent() },
      { label: "连播 ×5", onClick: () => this.PlayCurrent(5) },
      { label: "耳鸣", onClick: () => this.audio && this.audio.Deafen(0.6) },
      { label: "压音乐", onClick: () => this.audio && this.audio.Duck(1.2, 0.6) },
    ]);
    Slider(play, {
      label: "总音量", min: 0, max: 1, step: 0.02, value: 1,
      onInput: (v) => this.audio && this.audio.SetMasterVolume(v),
    });

    const amb = Section(body, "环境床");
    const ambBox = El("div", "edBtns");
    amb.appendChild(ambBox);
    for (const name of Object.keys(AMBIENCE_PRESETS)) {
      Button(ambBox, name, () => { if (this.audio) this.audio.Ambience(name); });
    }
    Note(amb, "环境床 = 风 + 按概率随机撒的远处枪炮。**不贴循环样本**，"
      + "撒出来的每一发都是现算的，永远不重复。");

    const music = Section(body, "音乐");
    const musicBox = El("div", "edBtns");
    music.appendChild(musicBox);
    for (const cue of Object.keys(MUSIC_CUES)) {
      Button(musicBox, cue, () => { if (this.audio) this.audio.Music(cue); });
    }
    Button(musicBox, "停", () => { if (this.audio) this.audio.Music(null); }, { cls: "danger" });
    this.musicFacts = Facts(music);

    const voice = Section(body, "人声（四川话 · 采样）");
    this.voiceList = ListBox(voice, {
      height: 168,
      onPick: (key) => this.PlayVoice(key),
    });
    this.voiceList.Fill(VOICE_LINES.map((line) => ({
      id: line.key,
      name: line.text,
      tail: `${VOICE_KIND[line.kind] || line.kind}`,
      title: `${line.key} · ${line.role} · ${line.dur.toFixed(2)}s${line.event ? " · 事件句（不许随机抽中）" : ""}`,
    })));
    const barkBox = El("div", "edBtns");
    voice.appendChild(barkBox);
    for (const kind of Object.keys(VOICE_KIND)) {
      Button(barkBox, `喊 ${VOICE_KIND[kind]}`, () => {
        if (this.audio) this.audio.Bark(kind, { priority: true, seed: Math.floor(Math.random() * 1000) });
      });
    }
    this.voiceNote = Note(voice, "带「事件句」标记的三条有前提条件（战车/飞机/无枪），"
      + "只能由知道前提的调用方点名喊 —— 随机抽中就是穿帮。", true);

    const quiz = Section(body, "盲听指认");
    ButtonRow(quiz, [
      { label: "出一题", onClick: () => this.NewBlind() },
      { label: "再听一遍", onClick: () => this.ReplayBlind() },
      { label: "清零", onClick: () => { this.blindScore = { right: 0, total: 0 }; this.RefreshBlind(); } },
    ]);
    this.blindBox = El("div", "edBtns");
    quiz.appendChild(this.blindBox);
    this.blindFacts = Facts(quiz);
    Note(quiz, "认错的那几对通常就是需要重新配平的：拉栓与压弹分不开、砖与土分不开，"
      + "玩家在战场上也就分不开。");
  }

  // -------------------------------------------------------------------------
  // 音效
  // -------------------------------------------------------------------------

  Names() {
    return SOUND_NAMES.filter((name) => {
      if (this.category === "全部") return true;
      const info = SOUND_INFO[name];
      return info && info[0] === this.category;
    });
  }

  FillSounds() {
    const names = this.Names();
    const sampled = this.audio ? this.audio.sampleCues : new Set();
    this.soundList.Fill(names.map((name) => {
      const info = SOUND_INFO[name] || ["", name, ""];
      // 尾标直接写「实录 / 合成」：采样包是异步载入的，「怎么听着还是合成的」
      // 这个问题只有把当前实际生效的那一层摆在列表里才答得出来。
      const tag = sampled.has(name) ? "实录" : "合成";
      return { id: name, name: info[1], tail: `${tag} · ${name}`, title: info[2] };
    }));
    if (!names.includes(this.soundName) && names.length) this.soundName = names[0];
    this.soundList.Select(this.soundName);
    this.Describe();
  }

  /** 这一条现在到底在响哪一层：实录素材的出处，还是合成配方。 */
  Describe() {
    const info = SOUND_INFO[this.soundName];
    const base = info ? `${this.soundName} —— ${info[2]}` : this.soundName;
    const audio = this.audio;
    let source = "合成（Script_Audio 的 RECIPES）";
    if (audio && audio.sampleCues.has(this.soundName)) {
      const cue = this.soundName === "bugleCharge" ? "bugleTone" : this.soundName;
      const entry = audio.sfxManifest && audio.sfxManifest.cues[cue];
      source = entry ? `实录：${entry.credit}（${entry.files.length} 个变体）` : "实录";
    }
    this.soundNote.textContent = `${base}\n${source}`;
  }

  PlayCurrent(times = 1) {
    const audio = this.audio;
    if (!audio) return;
    audio.Unlock();
    for (let i = 0; i < times; i += 1) this.PlayName(this.soundName, i * 0.42);
  }

  PlayName(name, delay = 0) {
    const audio = this.audio;
    if (!audio) return null;
    const options = { volume: this.volume, pitch: this.pitch, delay, priority: true };
    if (this.burst > 0) options.burst = this.burst;
    // 距离 > 0：摆在相机正前方那么远的地方，走 PannerNode。
    // 「远处的枪」听着不对，多半是这一层（衰减模型）而不是配方本身的问题。
    if (this.distance > 0 && this.host.camera) {
      const camera = this.host.camera;
      const forward = { x: 0, y: 0, z: -1 };
      const e = camera.matrixWorld.elements;
      forward.x = -e[8]; forward.y = -e[9]; forward.z = -e[10];
      options.position = {
        x: camera.position.x + forward.x * this.distance,
        y: camera.position.y + forward.y * this.distance,
        z: camera.position.z + forward.z * this.distance,
      };
    }
    return audio.Play(name, options);
  }

  PlayVoice(key) {
    const audio = this.audio;
    if (!audio) return;
    audio.Unlock();
    const line = VOICE_LINES.find((v) => v.key === key);
    const played = audio.Play(`voice.${key}`, { volume: this.volume, priority: true });
    if (this.voiceNote && line) {
      this.voiceNote.textContent = played
        ? `${line.role}（pitch ${line.pitch}）：「${line.text}」`
        : `人声还没载入完（或已被关闭）：${line.file}`;
    }
  }

  // -------------------------------------------------------------------------
  // 盲听
  // -------------------------------------------------------------------------

  NewBlind() {
    const names = this.Names().filter((n) => SOUND_INFO[n]);
    if (names.length < 4) return;
    const answer = names[Math.floor(Math.random() * names.length)];
    const options = [answer];
    let guard = 0;
    while (options.length < 4 && guard < 200) {
      const pick = names[Math.floor(Math.random() * names.length)];
      if (!options.includes(pick)) options.push(pick);
      guard += 1;
    }
    // 洗牌，别让答案总在第一个
    for (let i = options.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [options[i], options[j]] = [options[j], options[i]];
    }
    this.blind = { answer, options, done: false };
    this.RefreshBlind();
    this.ReplayBlind();
  }

  ReplayBlind() {
    if (!this.blind) return;
    this.PlayName(this.blind.answer);
  }

  Answer(name) {
    if (!this.blind || this.blind.done) return;
    this.blind.done = true;
    this.blind.picked = name;
    this.blindScore.total += 1;
    if (name === this.blind.answer) this.blindScore.right += 1;
    this.RefreshBlind();
  }

  RefreshBlind() {
    this.blindBox.innerHTML = "";
    if (this.blind) {
      for (const name of this.blind.options) {
        const info = SOUND_INFO[name] || ["", name, ""];
        const right = name === this.blind.answer;
        const btn = Button(this.blindBox, info[1], () => this.Answer(name));
        if (this.blind.done) {
          if (right) btn.classList.add("on");
          else if (name === this.blind.picked) btn.classList.add("danger");
        }
      }
    }
    const s = this.blindScore;
    this.blindFacts.Set("成绩", `${s.right} / ${s.total}`,
      s.total === 0 ? "" : (s.right === s.total ? "good" : "warn"));
    if (this.blind && this.blind.done) {
      this.blindFacts.Set("答案", `${SOUND_INFO[this.blind.answer][1]}（${this.blind.answer}）`,
        this.blind.picked === this.blind.answer ? "good" : "bad");
    }
  }

  // -------------------------------------------------------------------------
  // 每帧
  // -------------------------------------------------------------------------

  Update() {
    const audio = this.audio;
    const f = this.engineFacts;
    if (!f) return;
    if (!audio || !audio.enabled) {
      f.Set("状态", "已关闭（出图模式下 AudioEngine enabled=false）", "bad");
      return;
    }
    f.Set("状态", audio.Ready ? "运行中" : "未解锁（点任意一个播放键）", audio.Ready ? "good" : "warn");
    f.Set("在响的节点", audio.liveNodes);
    f.Set("配方数", SOUND_NAMES.length);
    // 采样一载进来就把同名合成配方盖掉了，列表的尾标要跟着翻
    const sampled = audio.sampleCues.size;
    f.Set("实录采样", sampled
      ? `${sampled} / ${SOUND_NAMES.length} 条已盖上`
      : "载入中 / 全部走合成", sampled === SOUND_NAMES.length ? "good" : sampled ? "warn" : "warn");
    if (sampled !== this.lastSampled) { this.lastSampled = sampled; this.FillSounds(); }
    if (audio.sfxErrors && audio.sfxErrors.length) {
      f.Set("采样缺失", `${audio.sfxErrors.length} 条读不到（已退回合成）`, "bad");
    }
    f.Set("人声", audio.voicesReady ? `${audio.voiceBank.size} / ${VOICE_LINES.length} 条已载入`
      : "载入中 / 不可用", audio.voicesReady ? "good" : "warn");
    if (audio.voiceErrors && audio.voiceErrors.length) {
      f.Set("人声缺失", `${audio.voiceErrors.length} 条读不到`, "bad");
    }
    if (this.musicFacts) {
      this.musicFacts.Set("当前音乐", audio.musicCue || "（无）");
      this.musicFacts.Set("当前环境", audio.ambiencePreset || "silence");
      this.musicFacts.Set("空间", audio.space || "—");
    }
  }
}

export default AudioEditor;
