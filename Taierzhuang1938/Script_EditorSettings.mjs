// 设置面板：画质与音效。走的是编辑器那套接口（Enter / Update / Exit），
// 但它们不是编辑器 —— 不接管相机、不藏世界，改的是**玩家自己的偏好**，
// 所以要落盘（localStorage），下次进来还在。
//
// ## 画质参数与天光预设的分工
// 天光预设（SKY_PRESETS）决定这一关长什么样：曝光、雾色、泛光阈值，全是美术意图。
// 后处理强度以倍率相乘（见 Script_Main 的 graphics）；TAA、GI 与阴影另提供算法参数。
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
// **不是 xxxBus.gain** —— 那几个是系统自己的配平（每段音乐的 level 由 LoopLayer 施加，
// duck 会把 duckGain 压下去再放回来），滑杆写在同一个参数上会被抹掉。

import { Panel, Section, Slider, Chips, Toggle, ButtonRow, Facts, Note } from "./Script_EditorUi.mjs";
import { CONTROL_GUIDE } from "./Script_Input.mjs";


// 可热调参数的范围、标签和默认值共用；旧存档缺项时沿用默认值。
export function GraphicsDetailControls(post) {
  return {
    shadow: [
      { key: "shadowBias", label: "深度偏移", min: -0.003, max: 0.003, step: 0.0001, value: -0.0004, digits: 4 },
      { key: "shadowNormalBias", label: "法线偏移", min: 0, max: 0.15, step: 0.005, value: 0.035, digits: 3 },
      { key: "shadowExtent", label: "覆盖半径", min: 30, max: 100, step: 1, value: 66, unit: " m", digits: 0 },
    ],
    gi: [
      { key: "giNormalBias", label: "采样偏移", min: 0, max: 1.5, step: 0.05, value: 0.4, unit: " m" },
      { key: "giSpecularOcclusion", label: "反射遮蔽", min: 0, max: 1, step: 0.05, value: 0.7 },
      { key: "giIrradianceHistory", label: "光照历史权重", min: 0, max: 0.99, step: 0.01, value: 0.93 },
      { key: "giDistanceHistory", label: "遮挡历史权重", min: 0, max: 0.99, step: 0.01, value: 0.90 },
    ],
    // 物理大气（子系统 B4）。烟霾倍率乘在每档预设的 Mie 密度上：
    // 抬它天更白、远景更"隔"，压它天更蓝、远处地物更清楚。
    // 它同时改天空视图 LUT 与大气透视 LUT，所以改一下要重算 LUT + 重烘 IBL。
    atmosphere: [
      { key: "atmosphereHaze", label: "烟霾倍率", min: 0.2, max: 4, step: 0.05, value: 1, prefix: "×" },
    ],
    taa: [
      { key: "taaCurrentWeight", label: "当前帧权重", min: 0.01, max: 1, step: 0.01, value: 0.04 },
      { key: "taaJitterScale", label: "抖动幅度", min: 0, max: 1.5, step: 0.05, value: 1, prefix: "×" },
      { key: "sharpen", label: "锐化强度", min: 0, max: 1, step: 0.02, value: post?.preset.sharpen ?? 0.22 },
    ],
  };
}

export function NormalizeGraphicsDetails(gfx, post, reset = false) {
  for (const control of Object.values(GraphicsDetailControls(post)).flat()) {
    const value = reset ? control.value : gfx[control.key];
    gfx[control.key] = Number.isFinite(value)
      ? Math.min(control.max, Math.max(control.min, value)) : control.value;
  }
}

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
  static hint = "分辨率、阴影、全局光照、后处理强度、视场";

  constructor(host) {
    this.host = host;
    this.cameraMode = "none";
    this.panel = null;
    this.fps = { frames: 0, time: 0, value: 0 };
  }

  get gfx() { return this.host.game.graphics; }

  Enter(root) {
    this.panel = Panel({
      title: "画质设置", sub: "",
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

    const controls = GraphicsDetailControls(this.host.post);
    const Details = (parent, group) => {
      for (const control of controls[group]) {
        const slider = Slider(parent, {
          ...control, value: gfx[control.key],
          format: (v) => (control.prefix ?? "") + v.toFixed(control.digits ?? 2) + (control.unit ?? ""),
          onInput: (v) => { gfx[control.key] = v; this.Apply(); },
        });
        slider.root.lastElementChild.style.whiteSpace = "nowrap";
      }
    };
    const perf = Section(body, "分辨率与阴影");
    this.resSlider = Slider(perf, {
      label: "渲染分辨率", min: 0.4, max: 1.6, step: 0.05, value: gfx.renderScale,
      format: (v) => `${Math.round(v * 100)}%`,
      onInput: (v) => { gfx.renderScale = v; this.Apply(); },
    });

    const shadowBox = document.createElement("div");
    shadowBox.className = "edBtns";
    perf.appendChild(shadowBox);
    Toggle(shadowBox, "阴影", gfx.shadows, (on) => { gfx.shadows = on; this.Apply(); });
    Toggle(shadowBox, "第一人称自阴影", gfx.firstPersonSelfShadow !== false, (on) => {
      gfx.firstPersonSelfShadow = on;
      this.Apply();
    });
    Toggle(shadowBox, "自阴影软化", gfx.firstPersonSelfShadowSoft === true, (on) => {
      gfx.firstPersonSelfShadowSoft = on;
      this.Apply();
    });
    const shadowSize = Section(perf, "阴影分辨率");
    Chips(shadowSize, [
      { value: 0, label: "默认" }, { value: 512, label: "512" },
      { value: 1024, label: "1k" }, { value: 2048, label: "2k" }, { value: 4096, label: "4k" },
    ], gfx.shadowSize, (v) => { gfx.shadowSize = Number(v); this.Apply(); });

    Details(perf, "shadow");

    const giBox = Section(body, "全局光照 GI");
    const giRow = document.createElement("div");
    giRow.className = "edBtns";
    giBox.appendChild(giRow);
    Toggle(giRow, "实时全局光照", gfx.gi === true, (on) => { gfx.gi = on; this.Apply(); });
    Slider(giBox, {
      label: "间接光强度", min: 0, max: 2, step: 0.05, value: gfx.giStrength ?? 1,
      format: (v) => `×${v.toFixed(2)}`,
      onInput: (v) => { gfx.giStrength = v; this.Apply(); },
    });

    Details(giBox, "gi");
    if (this.host.post?.quality === "low") Note(giBox, "GI 需 medium 及以上档位。");

    // 簇状局部光：把动态光预算从 6 盏解到 32/64/128 盏。总闸是运行时 uniform
    // （关掉不重编译）；英雄光阴影是编译期的，翻它会重编译一次整场材质。
    const clusterBox = Section(body, "局部光源（簇状前向）");
    const clusterRow = document.createElement("div");
    clusterRow.className = "edBtns";
    clusterBox.appendChild(clusterRow);
    const clusterToggle = Toggle(clusterRow, "簇状多光源", gfx.clusteredLights !== false, (on) => {
      gfx.clusteredLights = on;
      this.Apply();
    });
    clusterToggle.root.dataset.role = "clusteredLights";
    clusterToggle.root.title = "关掉就退回 2026-09 之前的固定灯池（同时只有几盏火有光）";
    const heroToggle = Toggle(clusterRow, "英雄光阴影", gfx.clusterHeroShadow === true, (on) => {
      gfx.clusterHeroShadow = on;
      this.Apply();
    });
    heroToggle.root.dataset.role = "clusterHeroShadow";
    heroToggle.root.title = "给优先级最高的那一盏局部光加立方体阴影：整城几何多画六遍，很贵";
    this.clusterFacts = Facts(clusterBox, ["局部光", "簇均值 / 峰值", "簇表构建"]);
    if (!this.host.lights?.clustered) {
      Note(clusterBox, "当前画质档不跑簇（low 档保持固定灯池），面板开关无效。");
    }
    const atmoBox = Section(body, "大气");
    const atmoRow = document.createElement("div");
    atmoRow.className = "edBtns";
    atmoBox.appendChild(atmoRow);
    Toggle(atmoRow, "物理大气", gfx.atmosphere !== false, (on) => { gfx.atmosphere = on; this.Apply(); });
    Details(atmoBox, "atmosphere");
    Note(atmoBox, "关掉退回旧的解析天空（等同 ?skyLegacy=1）。烟霾倍率乘在预设的 Mie 密度上。");

    const aa = Section(body, "抗锯齿 TAA");
    const aaRow = document.createElement("div");
    aaRow.className = "edBtns";
    aa.appendChild(aaRow);
    Toggle(aaRow, "TAA（时域抗锯齿）", gfx.taa !== false, (on) => {
      gfx.taa = on;
      this.Apply();
    });

    Details(aa, "taa");

    // 屏幕空间反射：布尔总闸 + 强度倍率。**不重编译材质** —— 强度归零时材质
    // 那一行等价于「radiance 原样」，成本只剩一次纹理取样（GI 那种编译期开关
    // 是因为探针采样层占着一堆采样器与寄存器，SSR 的补丁没有那个体量）。
    const reflect = Section(body, "屏幕空间反射 SSR");
    const ssrRow = document.createElement("div");
    ssrRow.className = "edBtns";
    reflect.appendChild(ssrRow);
    Toggle(ssrRow, "屏幕空间反射", gfx.ssr !== false, (on) => { gfx.ssr = on; this.Apply(); });
    Slider(reflect, {
      label: "反射强度", min: 0, max: 2, step: 0.05, value: gfx.ssrStrength ?? 1,
      format: (v) => `×${v.toFixed(2)}`,
      onInput: (v) => { gfx.ssrStrength = v; this.Apply(); },
    });
    if (this.host.post && !this.host.post.preset.ssr) {
      Note(reflect, "SSR 需 medium 及以上档位（low 档连追踪靶都不建）。");
    }

    const post = Section(body, "后处理强度（倍率）");
    const godBox = document.createElement("div");
    godBox.className = "edBtns";
    post.appendChild(godBox);
    Toggle(godBox, "体积光", gfx.godEnabled === true,
      (on) => { gfx.godEnabled = on; this.Save(); });
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

    const view = Section(body, "视场");
    Slider(view, {
      label: "视野角度", min: 40, max: 90, step: 1, value: gfx.fov,
      format: (v) => `${v.toFixed(0)}°`,
      onInput: (v) => { gfx.fov = v; this.Save(); },
    });

    const level = Section(body, "画质档位（切换将刷新）");
    ButtonRow(level, [
      { label: "low", onClick: () => this.Reload("low") },
      { label: "medium", onClick: () => this.Reload("medium") },
      { label: "high", onClick: () => this.Reload("high") },
      { label: "ultra", onClick: () => this.Reload("ultra") },
    ]);

    const stat = Section(body, "读数");
    this.facts = Facts(stat, ["帧率（渲染）"]);
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
    gfx.firstPersonSelfShadow = true;
    gfx.firstPersonSelfShadowSoft = false;
    gfx.atmosphere = true;
    gfx.ssao = 1; gfx.bloom = 1; gfx.god = 1; gfx.godEnabled = false;
    gfx.motionBlur = 1; gfx.grain = 1; gfx.vignette = 1; gfx.fov = 55;
    gfx.gi = false; gfx.giStrength = 1;
    // SSR 的出厂值跟画质档走（medium 及以上开），和 TAA 同一个先例：
    // 在 low 档按「恢复出厂」应该回到关，而不是给它开一个建不出靶的开关。
    gfx.ssr = this.host.post ? !!this.host.post.preset.ssr : true;
    gfx.ssrStrength = 1;
    // 簇状局部光的出厂值跟画质档走（low 那一档的表里就是 false），
    // 与 TAA 同一条规矩：别在 low 上「恢复出厂」反而把它打开。
    gfx.clusteredLights = this.host.post ? this.host.post.preset.clusteredLights !== false : true;
    gfx.clusterHeroShadow = false;
    NormalizeGraphicsDetails(gfx, this.host.post, true);
    // TAA 的出厂值跟画质档走（medium 及以上开），不是固定的 true/false ——
    // 在 low 档上按「恢复出厂」应该回到关，而不是给它按上一份历史靶。
    gfx.taa = this.host.post ? !!this.host.post.preset.taa : true;
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
      // 读的是**管线的实际状态**不是设置里那一位：历史靶没建起来时这里会照实说
      // FXAA，而不是跟着开关喊 TAA。
      f.Set("抗锯齿", this.host.post.taaEnabled ? "TAA（FXAA 已让位）" : "FXAA");
      // 读管线的实际状态而不是设置里那一位：档位不支持时这里照实说「不可用」
      const ssrPass = this.host.post.ssrPass;
      f.Set("屏幕空间反射", ssrPass?.available
        ? (ssrPass.enabled
          ? `开（${this.host.post.preset.ssrScale === 1 ? "全" : "半"}分辨率 · ${this.host.post.preset.ssrSteps} 步）`
          : "关")
        : "本档不可用");
    }
    void post;
    const canvas = this.host.canvas;
    f.Set("画布", `${canvas.width} × ${canvas.height}`);
    f.Set("阴影图", this.host.lights
      ? `${this.host.lights.sun.shadow.mapSize.x}${this.host.renderer.shadowMap.enabled ? "" : "（已关）"}`
      : "—");
    const fpShadow = this.host.game?.firstPersonSelfShadow?.Status?.();
    f.Set("第一人称自阴影", fpShadow?.enabled ? `开（${fpShadow.size}${fpShadow.soft ? " · 软化" : " · 硬 3×3"}）` : "关");
    // 簇状局部光的实况。「簇均值」量的是**每片元实际要循环几盏灯** —— 这一栏
    // 才是这套东西的性能开关，光看「亮了几盏」没有意义。
    if (this.clusterFacts) {
      const cluster = this.host.lights?.clustered;
      const cf = this.clusterFacts;
      if (!cluster) {
        cf.Set("局部光", "固定灯池（本档不跑簇）");
        cf.Set("簇均值 / 峰值", "—");
        cf.Set("簇表构建", "—");
      } else {
        const s = cluster.stats;
        cf.Set("局部光", `${s.active} / ${cluster.maxLights}${cluster.enabled ? "" : "（已关）"}`
          + `${this.host.lights.heroShadow ? " · 英雄光投影" : ""}`);
        cf.Set("簇均值 / 峰值",
          `${s.meanPerOccupied.toFixed(2)} / ${s.maxPerCluster}（${s.occupied}/${s.clusters} 簇非空）`);
        cf.Set("簇表构建", `${s.buildMs.toFixed(3)} ms${s.overflow ? ` · 溢出 ${s.overflow}` : ""}`);
      }
    }
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
      title: "音效设置", sub: "",
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
      Note(body, "当前模式未启用音频。", true);
      this.facts = Facts(body, ["状态"]);
      return;
    }

    const mix = Section(body, "音量");
    Slider(mix, {
      label: "总音量", min: 0, max: 1, step: 0.02, value: audio.masterVolume,
      format: (v) => `${Math.round(v * 100)}%`,
      onInput: (v) => { audio.SetMasterVolume(v); this.Save(); },
    });
    const Bus = (kind, label) => {
      Slider(mix, {
        label, min: 0, max: 1, step: 0.02, value: audio.mix[kind],
        format: (v) => `${Math.round(v * 100)}%`,
        onInput: (v) => { audio.SetBusVolume(kind, v); this.Save(); },
      });
    };
    Bus("sfx", "音效");
    Bus("music", "音乐");
    Bus("ambience", "环境音");

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

    ButtonRow(opts, [
      { label: "静音", onClick: () => { audio.SetMasterVolume(0); this.Rebuild(); } },
      { label: "恢复出厂", onClick: () => this.Reset() },
      { label: "试一声", onClick: () => audio.Play("rifleNra", { volume: 0.9, priority: true }) },
    ]);

    const stat = Section(body, "读数");
    this.facts = Facts(stat, ["状态"]);
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

// ===========================================================================
// 操作说明
// ===========================================================================
/**
 * 操作说明也走设置面板的接口，但它只读、不落盘。键位文案来自 Script_Input，
 * 所以这里不会另养一份迟早与真实 KEYMAP 分叉的快捷键表。
 */
export class ControlsSettings {
  static id = "controls";
  static label = "操作";
  static hint = "键鼠操作、武器槽、交互、包扎与班组命令";

  constructor(host) {
    this.host = host;
    this.cameraMode = "none";
    this.panel = null;
  }

  Enter(root) {
    this.panel = Panel({
      title: "操作说明", sub: "键盘与鼠标",
      variant: "work wide", onClose: () => this.host.Close(),
    });
    root.appendChild(this.panel.root);
    this.BuildUi(this.panel.body);
    return this;
  }

  BuildUi(body) {
    for (const group of CONTROL_GUIDE) {
      const section = Section(body, group.title);
      const grid = document.createElement("div");
      grid.className = "edControlGrid";
      for (const row of group.rows) {
        const item = document.createElement("div");
        item.className = "edControlRow";
        const keys = document.createElement("kbd");
        keys.textContent = row.keys;
        const label = document.createElement("span");
        label.textContent = row.label;
        item.append(keys, label);
        grid.appendChild(item);
      }
      section.appendChild(grid);
    }

  }

  Exit() {
    if (this.panel) this.panel.root.remove();
    this.panel = null;
  }

  Update() {}
}

export default { GraphicsSettings, AudioSettings, ControlsSettings, ApplySavedSettings };
