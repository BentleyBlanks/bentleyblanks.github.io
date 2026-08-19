// 设置面板：画质与音效。走的是编辑器那套接口（Enter / Update / Exit），
// 但它们不是编辑器 —— 不接管相机、不藏世界，改的是**玩家自己的偏好**，
// 所以要落盘（localStorage），下次进来还在。
//
// ## 画质这一栏为什么只有倍率
// 天光预设（SKY_PRESETS）决定这一关长什么样：曝光、雾色、泛光阈值，全是美术意图。
// 画质设置只决定「画多重」，一律以倍率的形式乘上去（见 Script_Main 的 graphics）。
// 两件事混在一张表里的下场是玩家把画质调低之后夜战关变成纯黑 ——
// 那一关的 exposure 是 3.6，被当成画质项一起压掉了。
//
// **真正省时间的只有「渲染分辨率」那一根。** 整条合成链（法线深度、AO、泛光六级、
// 体积光、运动模糊）都按 post 靶的尺寸走，减半就是省掉四分之三。泛光/体积光的
// 强度倍率是观感项，关掉它们省的是几个 pass，不是分辨率那个量级。
//
// 档位（low/medium/high）是**构造期**的：MSAA 采样数、AO 靶比例、泛光级数在
// PostPipeline 建靶时就定死了，改不了。所以那一栏给的是「按这个档重开页面」，
// 老老实实带 ?quality= 刷新，不假装能热切。
//
// ## 音效这一栏
// 三条总线各有一个 *User 增益节点（Script_Audio.BuildGraph）。滑杆写的是它们，
// **不是 xxxBus.gain** —— 那几个是系统自己的配平，Music() 换 cue 时会重写 musicBus，
// duck 会把 duckGain 压下去再放回来，滑杆写在同一个参数上会被抹掉。

import { Panel, Section, Slider, Chips, Toggle, ButtonRow, Facts, Note } from "./Script_EditorUi.mjs";

const KEY_GFX = "tengxian1938_graphics_v1";
const KEY_SFX = "tengxian1938_audio_v1";

function ReadJson(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch (error) {
    return null;
  }
}

function WriteJson(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch (error) { /* 无痕模式就算了 */ }
}

/**
 * 开机时把存下来的设置装回去。EditorSuite 的构造函数调它 ——
 * 只在打开面板时才生效的设置不叫设置，那叫开关。
 */
export function ApplySavedSettings(host) {
  const gfx = ReadJson(KEY_GFX);
  if (gfx && host.game && host.game.graphics) {
    for (const key of Object.keys(host.game.graphics)) {
      if (typeof gfx[key] === typeof host.game.graphics[key] && gfx[key] != null) {
        host.game.graphics[key] = gfx[key];
      }
    }
    if (host.game.ApplyGraphics) host.game.ApplyGraphics();
  }
  const sfx = ReadJson(KEY_SFX);
  const audio = host.audio;
  if (sfx && audio) {
    if (typeof sfx.master === "number") audio.SetMasterVolume(sfx.master);
    for (const kind of ["sfx", "music", "ambience"]) {
      if (typeof sfx[kind] === "number") audio.SetBusVolume(kind, sfx[kind]);
    }
    if (typeof sfx.voiceMute === "boolean") audio.voiceMute = sfx.voiceMute;
    if (typeof sfx.pauseSilence === "boolean") audio.pauseSilence = sfx.pauseSilence;
  }
}

// ===========================================================================
// 画质
// ===========================================================================
export class GraphicsSettings {
  static id = "graphics";
  static label = "画质";
  static hint = "分辨率、阴影、后处理强度、视场";

  constructor(host) {
    this.host = host;
    this.cameraMode = "none";
    this.panel = null;
    this.fps = { frames: 0, time: 0, value: 0 };
  }

  get gfx() { return this.host.game.graphics; }

  Enter(root) {
    this.panel = Panel({
      title: "画质设置", sub: "Script_Post",
      variant: "work", onClose: () => this.host.Close(),
    });
    root.appendChild(this.panel.root);
    this.BuildUi(this.panel.body);
    return this;
  }

  Exit() {
    this.Save();
    if (this.panel) this.panel.root.remove();
    this.panel = null;
  }

  Save() {
    WriteJson(KEY_GFX, { ...this.gfx });
  }

  Apply() {
    if (this.host.game.ApplyGraphics) this.host.game.ApplyGraphics();
    this.Save();
  }

  BuildUi(body) {
    const gfx = this.gfx;

    const perf = Section(body, "分辨率与阴影");
    this.resSlider = Slider(perf, {
      label: "渲染分辨率", min: 0.4, max: 1.6, step: 0.05, value: gfx.renderScale,
      format: (v) => `${Math.round(v * 100)}%`,
      onInput: (v) => { gfx.renderScale = v; this.Apply(); },
    });
    Note(perf, "整条合成链都按这个尺寸走：减到 70% 大约省掉一半的合成开销，"
      + "而画面只是软一点（最后一 pass 会拉回屏幕分辨率）。这是唯一真正省时间的一根。");

    const shadowBox = document.createElement("div");
    shadowBox.className = "edBtns";
    perf.appendChild(shadowBox);
    Toggle(shadowBox, "阴影", gfx.shadows, (on) => { gfx.shadows = on; this.Apply(); });
    Chips(perf, [
      { value: 0, label: "出厂" }, { value: 512, label: "512" },
      { value: 1024, label: "1k" }, { value: 2048, label: "2k" }, { value: 4096, label: "4k" },
    ], gfx.shadowSize, (v) => { gfx.shadowSize = Number(v); this.Apply(); });
    Note(perf, "开关阴影要重编译一次全场材质（几百毫秒的卡顿），因为它是编译期的 "
      + "#define。只改标志位不重编译的话，画面会留着一层永不更新的假阴影。", true);

    const post = Section(body, "后处理强度（倍率）");
    const Mul = (key, label) => Slider(post, {
      label, min: 0, max: 2, step: 0.05, value: gfx[key],
      format: (v) => `×${v.toFixed(2)}`,
      onInput: (v) => { gfx[key] = v; this.Save(); },
    });
    Mul("ssao", "环境光遮蔽");
    Mul("bloom", "泛光");
    Mul("god", "体积光");
    Mul("motionBlur", "运动模糊");
    Mul("grain", "颗粒");
    Mul("vignette", "暗角");
    Note(post, "这些是乘在**天光预设**算出来的值上的。预设决定这一关长什么样"
      + "（曝光、雾色、泛光阈值是美术意图），设置只决定画多重 —— 两者不许混。");

    const view = Section(body, "视场");
    Slider(view, {
      label: "FOV", min: 40, max: 90, step: 1, value: gfx.fov,
      format: (v) => `${v.toFixed(0)}°`,
      onInput: (v) => { gfx.fov = v; this.Save(); },
    });
    Note(view, "出厂 55°：Easy Red 2 那种「周围很远、人很小但看得清」的观感靠窄视场。"
      + "70° 以上会把巷战拉成鱼眼，远处的人缩成一个点，尺度感全没了。开镜倍率是"
      + "按武器的 adsFovScale 乘在这上面的，改这里不会影响瞄准倍率。");

    const level = Section(body, "画质档（要重开页面）");
    ButtonRow(level, [
      { label: "low", onClick: () => this.Reload("low") },
      { label: "medium", onClick: () => this.Reload("medium") },
      { label: "high", onClick: () => this.Reload("high") },
      { label: "ultra", onClick: () => this.Reload("ultra") },
    ]);
    Note(level, "MSAA 采样数、AO 靶比例、泛光级数是 PostPipeline **建靶时**定死的，"
      + "热切不了。所以这一栏老老实实带 ?quality= 刷新，不假装能实时换。");

    const stat = Section(body, "读数");
    this.facts = Facts(stat);
    ButtonRow(stat, [
      { label: "全部恢复出厂", onClick: () => this.Reset(), cls: "danger" },
    ]);
  }

  Reload(quality) {
    const params = new URLSearchParams(location.search);
    params.set("quality", quality);
    location.search = params.toString();
  }

  Reset() {
    const gfx = this.gfx;
    gfx.renderScale = 1; gfx.shadows = true; gfx.shadowSize = 0;
    gfx.ssao = 1; gfx.bloom = 1; gfx.god = 1;
    gfx.motionBlur = 1; gfx.grain = 1; gfx.vignette = 1; gfx.fov = 55;
    this.Apply();
    if (this.panel) {
      this.panel.body.innerHTML = "";
      this.BuildUi(this.panel.body);
    }
  }

  Update(dt) {
    // 帧率：设置面板里唯一有意义的反馈就是「我改完之后是不是真的快了」。
    // 玩法是停的，但渲染照跑，所以这个数量的是**合成链**的成本，正好是这一栏管的东西。
    this.fps.frames += 1;
    this.fps.time += dt;
    if (this.fps.time >= 0.5) {
      this.fps.value = this.fps.frames / this.fps.time;
      this.fps.frames = 0;
      this.fps.time = 0;
    }
    if (!this.facts) return;
    const post = this.host.renderer ? this.host.post : null;
    const f = this.facts;
    f.Set("帧率（渲染）", `${this.fps.value.toFixed(0)} fps`);
    if (this.host.post) {
      f.Set("合成靶", `${this.host.post.width} × ${this.host.post.height}`);
      f.Set("画质档", this.host.post.quality);
      f.Set("HDR", this.host.post.hdrCapable ? "可用" : "退回 8 位");
    }
    void post;
    const canvas = this.host.canvas;
    f.Set("画布", `${canvas.width} × ${canvas.height}`);
    f.Set("阴影图", this.host.lights
      ? `${this.host.lights.sun.shadow.mapSize.x}${this.host.renderer.shadowMap.enabled ? "" : "（已关）"}`
      : "—");
  }
}

// ===========================================================================
// 音效
// ===========================================================================
export class AudioSettings {
  static id = "sound";
  static label = "音效";
  static hint = "分路音量、配音开关、暂停时静音";

  constructor(host) {
    this.host = host;
    this.cameraMode = "none";
    this.panel = null;
  }

  get audio() { return this.host.audio; }

  Enter(root) {
    if (this.audio) this.audio.Unlock();
    this.panel = Panel({
      title: "音效设置", sub: "Script_Audio",
      variant: "work", onClose: () => this.host.Close(),
    });
    root.appendChild(this.panel.root);
    this.BuildUi(this.panel.body);
    return this;
  }

  Exit() {
    this.Save();
    if (this.panel) this.panel.root.remove();
    this.panel = null;
  }

  Save() {
    const audio = this.audio;
    if (!audio) return;
    WriteJson(KEY_SFX, {
      master: audio.masterVolume,
      sfx: audio.mix.sfx, music: audio.mix.music, ambience: audio.mix.ambience,
      voiceMute: !!audio.voiceMute,
      pauseSilence: audio.pauseSilence !== false,
    });
  }

  BuildUi(body) {
    const audio = this.audio;
    if (!audio || !audio.enabled) {
      Note(Section(body, "引擎"), "音频在这个模式下是关掉的（出图模式 enabled=false）。", true);
      this.facts = Facts(body);
      return;
    }

    const mix = Section(body, "音量");
    Slider(mix, {
      label: "总音量", min: 0, max: 1, step: 0.02, value: audio.masterVolume,
      format: (v) => `${Math.round(v * 100)}%`,
      onInput: (v) => { audio.SetMasterVolume(v); this.Save(); },
    });
    const Bus = (kind, label, note) => {
      Slider(mix, {
        label, min: 0, max: 1, step: 0.02, value: audio.mix[kind],
        format: (v) => `${Math.round(v * 100)}%`,
        onInput: (v) => { audio.SetBusVolume(kind, v); this.Save(); },
      });
      if (note) Note(mix, note);
    };
    Bus("sfx", "音效", "枪炮、命中、脚步、人声都走这条。压制与耳鸣不受它影响。");
    Bus("music", "音乐");
    Bus("ambience", "环境床", "风 + 按概率随机撒的远处枪炮。觉得战场太吵先压这一条，"
      + "它是「一直在响」的那一层。");

    const opts = Section(body, "开关");
    const box = document.createElement("div");
    box.className = "edBtns";
    opts.appendChild(box);
    Toggle(box, "配音", !audio.voiceMute, (on) => { audio.voiceMute = !on; this.Save(); });
    Toggle(box, "暂停时静音背景", audio.pauseSilence !== false, (on) => {
      audio.pauseSilence = on;
      // 现在就是暂停着的（这个面板本身就在暂停里），所以当场生效
      if (on) audio.SetPaused(true); else audio.SetPaused(false);
      this.Save();
    });
    Note(opts, "「暂停时静音背景」修的是这条：暂停只让 Frame() 提前返回，"
      + "**一点也拦不住声音** —— 环境床是一张自己在跑的节点图 + 一个 400 ms 的调度器，"
      + "玩法停了它照样每隔几百毫秒撒一发远处的枪声。", true);

    ButtonRow(opts, [
      { label: "静音", onClick: () => { audio.SetMasterVolume(0); this.Rebuild(); } },
      { label: "恢复出厂", onClick: () => this.Reset() },
      { label: "试一声", onClick: () => audio.Play("rifleNra", { volume: 0.9, priority: true }) },
    ]);

    const stat = Section(body, "读数");
    this.facts = Facts(stat);
  }

  Rebuild() {
    if (!this.panel) return;
    this.panel.body.innerHTML = "";
    this.BuildUi(this.panel.body);
    this.Save();
  }

  Reset() {
    const audio = this.audio;
    if (!audio) return;
    audio.SetMasterVolume(1);
    for (const kind of ["sfx", "music", "ambience"]) audio.SetBusVolume(kind, 1);
    audio.voiceMute = false;
    audio.pauseSilence = true;
    this.Rebuild();
  }

  Update() {
    const audio = this.audio;
    const f = this.facts;
    if (!f || !audio) return;
    f.Set("状态", audio.enabled ? (audio.Ready ? "运行中" : "未解锁") : "已关闭",
      audio.Ready ? "good" : "warn");
    f.Set("背景层", audio.paused ? "已暂停（静音）" : "在响", audio.paused ? "good" : "");
    f.Set("环境 / 音乐", `${audio.ambiencePreset || "silence"} / ${audio.musicCue || "无"}`);
    f.Set("在响的节点", audio.liveNodes);
    f.Set("配音", audio.voiceMute ? "已关" : `${audio.voiceBank ? audio.voiceBank.size : 0} 条`);
  }
}

export default { GraphicsSettings, AudioSettings, ApplySavedSettings };
