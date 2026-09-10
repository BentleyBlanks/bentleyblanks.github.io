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
import { AUDIO_MIX_DEFAULTS } from "./Data_Tuning_Audio.mjs";


// 可热调参数的范围、标签和默认值共用；旧存档缺项时沿用默认值。
export function GraphicsDetailControls(post) {
  return {
    // 级联阴影（Script_Csm）。这三根给的都是**第 0 级的基准**，往外逐级按纹素
    // 尺度自动缩放 —— 远级纹素粗四倍，痤疮台阶也粗四倍，同一个绝对偏移必然是
    // 「近处彼得潘 + 远处痤疮」二选一。
    // shadowExtent（旧的单张框「覆盖半径」）已废：级联的每级半径由 practical split
    // 与视锥切片包围球算，不再是一个数。换成 shadowDistance = 最远一级铺到哪。
    shadow: [
      { key: "shadowBias", label: "深度偏移", min: -0.003, max: 0.003, step: 0.0001, value: -0.0004, digits: 4 },
      { key: "shadowNormalBias", label: "法线偏移", min: 0, max: 0.15, step: 0.005, value: 0.035, digits: 3 },
      // 0 = 用档位默认（high 220 m / ultra 300 m / medium 130 / low 70）。
      // 不能把默认写成 220：那样 ultra 会被这根滑杆悄悄压回 high 的覆盖。
      { key: "shadowDistance", label: "阴影距离", min: 0, max: 400, step: 10, value: 0, unit: " m", digits: 0,
        format: (v) => (v > 0 ? `${v.toFixed(0)} m` : "档位默认") },
      { key: "shadowIntensity", label: "阴影强度", min: 0.4, max: 1, step: 0.02, value: 1, digits: 2 },
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
    // 材质着色升级（2026-09）：这一组全是**运行时倍率**，拖了立刻生效不重编译。
    // 开关（编不编）是上面那几个 Toggle，翻一次要整场重编译几百毫秒。
    material: [
      { key: "pomDepth", label: "视差深度", min: 0, max: 2, step: 0.05, value: 1, prefix: "×" },
      { key: "detailNormalStrength", label: "细节法线", min: 0, max: 2, step: 0.05, value: 1, prefix: "×" },
      { key: "microShadowStrength", label: "微阴影", min: 0, max: 2, step: 0.05, value: 1, prefix: "×" },
      { key: "horizonStrength", label: "地平线遮蔽", min: 0, max: 2, step: 0.05, value: 1, prefix: "×" },
      { key: "skinStrength", label: "皮肤散射", min: 0, max: 2, step: 0.05, value: 1, prefix: "×" },
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
          // 逐项可以自带 format（阴影距离的 0 要显示成「档位默认」而不是「0 m」）
          format: control.format
            ?? ((v) => (control.prefix ?? "") + v.toFixed(control.digits ?? 2) + (control.unit ?? "")),
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
    Note(perf, this.host.post?.preset.taaUpscale
      ? "TAA 开着时低于 100% 走 TAAU 超分：主场景在这个分辨率跑，TAA 解算回满分辨率，末趟不再有拉伸。"
      : "本档没有 TAAU：低于 100% 时末趟做一次双线性放大。");

    // 自动降档（docs §13）。它给的是**乘在上面那根滑杆上**的倍率，不覆盖玩家的值。
    const autoQuality = this.host.game?.autoQuality;
    if (autoQuality) {
      const autoBox = document.createElement("div");
      autoBox.className = "edBtns";
      perf.appendChild(autoBox);
      // 只写 gfx 那一位；同步到规则层是 ApplyGraphics 的事（存档回灌走同一条路）。
      Toggle(autoBox, "自动降档", gfx.autoQuality !== false, (on) => {
        gfx.autoQuality = on;
        this.Apply();
      });
      Note(perf, "帧时间中位数持续 >20 ms 就按阶梯往回收内部分辨率（再往下依次摘掉"
        + "SSR、接触阴影，最后才摘近级每帧阴影烘焙），<13 ms 持续 8 s 才升回去，每次降级锁 30 s。"
        + "只动运行时旋钮，不整档切换 —— 换档要重编译全场材质，在已经掉帧时更糟。");
    }

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
    // 屏幕空间接触阴影：补物件贴地那一圈（normalBias 把着色点推出地面造成的漏光）。
    // 只是「跑不跑那一趟 pass」，材质里那段 GLSL 是档位级的编译期开关，热切不重编译。
    Toggle(shadowBox, "接触阴影", gfx.contactShadows !== false, (on) => {
      gfx.contactShadows = on;
      this.Apply();
    });
    // 级联之后这一栏是**每一级**的图边长（high/ultra 四级、medium 三级、low 两级）。
    // 「默认」= 档位值（high/ultra 2k、medium/low 1k）；4k × 四级 = 半 GB 显存，
    // 留着是给取证用的，不是给玩家日常开的。
    const shadowSize = Section(perf, "阴影分辨率（每级）");
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
    // 材质着色（POM / 细节法线 / 微阴影 / 地平线镜面遮蔽 / 皮肤预积分）。
    // 开关是**编译期**的：翻一次要把全场材质重编译（几百毫秒，一次性）——
    // 与阴影总闸、GI 采样层同一个先例，所以放 Toggle 不放滑杆。
    // 出厂值跟画质档走（Data_Tuning_Graphics 的 pom / detailNormal / … 那几位）：
    // 面板上显示的是「这一档实际编了没有」，不是一个独立的偏好。
    const mat = Section(body, "材质细节");
    const matRow = document.createElement("div");
    matRow.className = "edBtns";
    mat.appendChild(matRow);
    const preset = this.host.post?.preset || {};
    const Bit = (key, fallback) => (typeof gfx[key] === "boolean" ? gfx[key] : !!fallback);
    // 出厂值由 Script_Main 从画质档拷进 graphics（与 taa 同款），所以这里读的是
    // 玩家的实际选择；fallback 只在旧存档缺项时兜底。
    Toggle(matRow, "视差遮蔽 POM", Bit("pom", (preset.pom || 0) > 0),
      (on) => { gfx.pom = on; this.Apply(); });
    Toggle(matRow, "POM 自阴影", Bit("pomSelfShadow", preset.pomSelfShadow),
      (on) => { gfx.pomSelfShadow = on; this.Apply(); });
    Toggle(matRow, "细节法线", Bit("detailNormal", preset.detailNormal),
      (on) => { gfx.detailNormal = on; this.Apply(); });
    const matRow2 = document.createElement("div");
    matRow2.className = "edBtns";
    mat.appendChild(matRow2);
    Toggle(matRow2, "微阴影", Bit("microShadow", preset.microShadow),
      (on) => { gfx.microShadow = on; this.Apply(); });
    Toggle(matRow2, "地平线镜面遮蔽", Bit("horizonOcclusion", preset.horizonOcclusion),
      (on) => { gfx.horizonOcclusion = on; this.Apply(); });
    Toggle(matRow2, "皮肤预积分散射", Bit("skinSss", preset.skinSss),
      (on) => { gfx.skinSss = on; this.Apply(); });
    Details(mat, "material");
    if ((preset.pom || 0) === 0) Note(mat, "POM 需 medium 及以上档位；步数由档位决定。");
    else if (!preset.pomSelfShadow) Note(mat, "POM 自阴影只在 ultra 档编译进材质。");

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

    // froxel 体积雾。low 档没有 froxel 网格，这一位打开也只是空转；面板照常给，
    // 因为「读数」那一栏会照实说当前用的是体积雾还是解析雾（不跟着开关喊）。
    const fogSection = Section(body, "体积雾 / 体积光");
    const fogBox = document.createElement("div");
    fogBox.className = "edBtns";
    fogSection.appendChild(fogBox);
    Toggle(fogBox, "froxel 体积雾", gfx.volumetrics !== false, (on) => {
      gfx.volumetrics = on;
      this.Apply();
    });
    Note(fogSection, "带阴影的体积雾：光柱会被建筑切断，火与照明弹会照亮周围的空气。"
      + "关掉退回合成 pass 里的解析式高度雾（low 档出厂就是那一条）。"
      + "透过率与解析雾逐像素相同，开关它不改变七十米外的能见度。");

    const post = Section(body, "后处理强度（倍率）");
    const godBox = document.createElement("div");
    godBox.className = "edBtns";
    post.appendChild(godBox);
    Toggle(godBox, "屏幕空间体积光（体积雾关时才生效）", gfx.godEnabled === true,
      (on) => { gfx.godEnabled = on; this.Save(); });
    const Mul = (key, label) => Slider(post, {
      label, min: 0, max: 2, step: 0.05, value: gfx[key],
      format: (v) => `×${v.toFixed(2)}`,
      onInput: (v) => { gfx[key] = v; this.Save(); },
    });
    Mul("ssao", "环境光遮蔽");
    // SSIL 只在给了它的档位上才有意义（构造期开关，见 Data_Tuning_Graphics.ssil）。
    // 档位没给就不画这一行 —— 一根拖了没反应的滑杆比没有滑杆更糟。
    if (this.host.post?.preset?.ssil) {
      Mul("ssil", "屏幕空间间接光");
      Note(post, "SSIL 与 GTAO 共用同一趟地平线搜索；拖到 0 会把那一趟一起停掉。");
    }
    Mul("bloom", "泛光");
    Mul("god", "体积光");
    Mul("motionBlur", "运动模糊");
    Mul("grain", "颗粒");
    Mul("vignette", "暗角");

    // --- 相机（曝光 / 色调映射 / 光晕 / 分级）--------------------------------
    // 与上面那一栏分开：那一栏是「后处理开多重」，这一栏是「这是一台什么相机」。
    const camera = Section(body, "相机");
    const cameraRow = document.createElement("div");
    cameraRow.className = "edBtns";
    camera.appendChild(cameraRow);
    Toggle(cameraRow, "自动曝光", gfx.autoExposure !== false, (on) => {
      gfx.autoExposure = on;
      this.Apply();
    });
    Toggle(cameraRow, "3D LUT 分级", gfx.lut !== false, (on) => { gfx.lut = on; this.Apply(); });
    Toggle(cameraRow, "泛光 Karis 平均", gfx.bloomKaris === true, (on) => {
      gfx.bloomKaris = on;
      this.Apply();
    });
    Slider(camera, {
      label: "曝光补偿", min: -3, max: 3, step: 0.1, value: gfx.exposureCompensation ?? 0,
      format: (v) => `${v >= 0 ? "+" : ""}${v.toFixed(1)} EV`,
      onInput: (v) => { gfx.exposureCompensation = v; this.Apply(); },
    });
    const tone = Section(camera, "色调映射");
    Chips(tone, [
      { value: "aces", label: "ACES" },
      { value: "agx", label: "AgX" },
    ], gfx.tonemap || "aces", (v) => { gfx.tonemap = String(v); this.Apply(); });
    Slider(camera, {
      label: "镜头光晕", min: 0, max: 2, step: 0.05, value: gfx.lensFlare ?? 1,
      format: (v) => `×${v.toFixed(2)}`,
      onInput: (v) => { gfx.lensFlare = v; this.Apply(); },
    });
    Slider(camera, {
      label: "镜头脏污", min: 0, max: 2, step: 0.05, value: gfx.lensDirt ?? 1,
      format: (v) => `×${v.toFixed(2)}`,
      onInput: (v) => { gfx.lensDirt = v; this.Apply(); },
    });
    Slider(camera, {
      label: "输出抖动", min: 0, max: 2, step: 0.1, value: gfx.dither ?? 0,
      format: (v) => (v <= 0 ? "关" : `${v.toFixed(1)} / 255`),
      onInput: (v) => { gfx.dither = v; this.Apply(); },
    });
    if (this.host.post && !this.host.post.preset.lensFlare) {
      Note(camera, "镜头光晕需 high 及以上档位。");
    }

    const view = Section(body, "视场");
    Slider(view, {
      label: "视野角度", min: 40, max: 90, step: 1, value: gfx.fov,
      format: (v) => `${v.toFixed(0)}°`,
      onInput: (v) => { gfx.fov = v; this.Save(); },
    });

    // --- 内容 ---------------------------------------------------------------
    // **不是画质项**：断肢既不省时间也不改画风，它决定的是玩家愿不愿意看到这个。
    // 所以单开一节，不塞进上面任何一栏（口径见 docs/Data_Dismemberment.md §1 最后一行）。
    // 存的是 gfx.gore 那一位，落地由 Script_Main 的 ApplyGraphics 转给 GoreSystem；
    // 关掉时场上已经飞出去的肢块会立刻收回（GoreSystem.SetEnabled → ReleaseAll）。
    const content = Section(body, "内容");
    const contentRow = document.createElement("div");
    contentRow.className = "edBtns";
    content.appendChild(contentRow);
    Toggle(contentRow, "断肢表现", gfx.gore !== false, (on) => { gfx.gore = on; this.Apply(); });
    Note(content, "关掉之后子弹与爆炸不再卸掉肢体，断肢音效也一并不响；血迹与倒地不受影响。"
      + "带 ?gore=0 打开时这一位被强制关掉（出图与回归要确定的画面）。");

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
    // 渲染分辨率的出厂值跟画质档走（TAAU：medium 0.75 / high 0.8 / ultra 1.0），
    // 不是固定的 1 —— 「恢复出厂」要回到这一档真正的出厂设置。
    gfx.renderScale = this.host.post?.preset.renderScale ?? 1;
    // 自动降档出厂开（Data_Tuning_Graphics.AUTO_QUALITY.enabled），
    // 并把阶梯收回第 0 级 —— 否则「恢复出厂」之后画面还留在降过的分辨率上。
    gfx.autoQuality = true;
    this.host.game?.autoQuality?.Reset(0);
    gfx.shadows = true; gfx.shadowSize = 0;
    gfx.firstPersonSelfShadow = true;
    gfx.firstPersonSelfShadowSoft = false;
    gfx.atmosphere = true;
    gfx.contactShadows = true;
    gfx.ssao = 1; gfx.ssil = 1; gfx.bloom = 1; gfx.god = 1; gfx.godEnabled = false;
    // 体积雾的出厂值跟画质档走（medium 及以上开），不是固定的 true —— 同 TAA 那条先例。
    // 读的是 froxel 网格在不在（VOLUMETRIC_GRIDS 里 low 是 null），不是 preset 那一位：
    // 后者已经被 ApplyGraphics 按当前开关改写过，拿它当出厂值等于恢复了个寂寞。
    gfx.volumetrics = !!this.host.post?.volumetricsPass?.grid;
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
    // 材质着色的开关恢复出厂 = **按当前画质档重取**，不是钉成 true/false ——
    // 在 low 档按恢复出厂不该给它编上 POM（与 taa 那一行同一个道理）。
    const matPreset = this.host.post?.preset || {};
    gfx.pom = (matPreset.pom || 0) > 0;
    gfx.pomSelfShadow = !!matPreset.pomSelfShadow;
    gfx.detailNormal = !!matPreset.detailNormal;
    gfx.microShadow = !!matPreset.microShadow;
    gfx.horizonOcclusion = !!matPreset.horizonOcclusion;
    gfx.skinSss = !!matPreset.skinSss;
    gfx.pomDepth = 1; gfx.detailNormalStrength = 1; gfx.microShadowStrength = 1;
    gfx.horizonStrength = 1; gfx.skinStrength = 1; gfx.pomSelfShadowStrength = 1;
    // 相机那一栏：自动曝光与 LUT 的出厂值**跟画质档走**（同 TAA 的先例），
    // 不是固定的 true/false —— 在 low 档按「恢复出厂」应该回到关。
    gfx.exposureCompensation = 0;
    gfx.lensFlare = 1; gfx.lensDirt = 1;
    gfx.tonemap = "aces";
    gfx.bloomKaris = false;
    gfx.dither = 0;
    gfx.autoExposure = this.host.post ? this.host.post.preset.autoExposure !== false : true;
    gfx.lut = this.host.post ? this.host.post.preset.lut !== false : true;
    // 内容项：断肢出厂开（Data_Tuning_Gore.ENABLED）。`?gore=0` 那条硬覆盖在
    // ApplyGraphics 里，这里照常写 true —— 恢复出厂不是绕过参数的后门。
    gfx.gore = true;
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
      const P = this.host.post;
      f.Set("合成靶", `${P.width} × ${P.height}`);
      // TAAU 开着时内部与输出是两组尺寸；只报一组会让人以为分辨率没生效。
      f.Set("输出靶", `${P.resolveWidth ?? P.width} × ${P.resolveHeight ?? P.height}`);
      f.Set("画质档", P.quality);
      f.Set("HDR", P.hdrCapable ? "可用" : "退回 8 位");
      // 读的是**管线的实际状态**不是设置里那一位：历史靶没建起来时这里会照实说
      // FXAA，而不是跟着开关喊 TAA。
      f.Set("抗锯齿", P.taaEnabled
        ? (P.taauActive ? "TAAU 超分（FXAA 已让位）" : "TAA（FXAA 已让位）") : "FXAA");
      f.Set("锐化", `CAS ×${(P.sharpenStrength ?? 0).toFixed(2)}`);
      f.Set("运动模糊", P.preset.motionBlur
        ? `${P.motionBlurPass?.taps ?? 0} 抽样 · ${Math.round((P.motionBlurPass?.scale ?? 1) * 100)}%`
        : "关");
      f.Set("景深", P.preset.dof
        ? `散景 · ${Math.round((P.dofPass?.scale ?? 0) * 50)}%` : "关");
      // 读管线的实际状态而不是设置里那一位：档位不支持时这里照实说「不可用」
      const ssrPass = this.host.post.ssrPass;
      f.Set("屏幕空间反射", ssrPass?.available
        ? (ssrPass.enabled
          ? `开（${this.host.post.preset.ssrScale === 1 ? "全" : "半"}分辨率 · ${this.host.post.preset.ssrSteps} 步）`
          : "关")
        : "本档不可用");
      // 读的是管线**实际在跑**的那条路（uFogSource），不是设置里那一位：
      // 网格没有、这一档天光 density = 0、开机前几帧都会照实说「解析式高度雾」。
      const volumetrics = this.host.post.volumetricsPass;
      const grid = volumetrics?.grid;
      const on = this.host.post.uniformsComposite?.uFogSource.value > 0.5;
      f.Set("雾", on && grid
        ? `froxel 体积雾 ${grid.x}×${grid.y}×${grid.z}`
        : "解析式高度雾（合成 pass 内联）");
    }
    void post;
    const canvas = this.host.canvas;
    f.Set("画布", `${canvas.width} × ${canvas.height}`);
    // 级联：报「N 级 × 每级边长」，再报最近一级的纹素世界尺寸 ——
    // 后者才是「阴影糊不糊」的那个数（重构前是一张 4096 铺 132 m = 3.2 cm）。
    const csm = this.host.lights?.GetShadowState?.();
    f.Set("阴影图", csm
      ? `${csm.cascades} 级 × ${csm.mapSize}${csm.active ? "" : (csm.userEnabled ? "（天光预设：无太阳影）" : "（已关）")}`
      : "—");
    if (csm) {
      f.Set("最近级纹素", `${(csm.texelWorld[0] * 100).toFixed(2)} cm`);
      f.Set("阴影覆盖", `${(csm.splits[csm.splits.length - 1] || 0).toFixed(0)} m`);
      // 烘焙排班是按**实测**三角数自己升降档的（见 Data_Tuning_Shadows 抬头
      // 「近级每帧烘」）。这一栏是那个决定的取证口：看得见它现在烘几张、
      // 凭的是多少三角，才不用去猜「这一关的近影为什么跳」。
      f.Set("阴影烘焙", `${csm.nearEveryFrame ? "近级每帧 + 远级轮转" : "一帧一张（轮转）"}`
        + `${csm.nearBakeAllowed ? "" : " · 自动降档已摘"}`
        + ` · ${(csm.bakeTriangles / 1e6).toFixed(2)}M / ${(csm.bakeTriangleBudget / 1e6).toFixed(2)}M 三角`);
    }
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
    for (const [kind, value] of Object.entries(AUDIO_MIX_DEFAULTS)) audio.SetBusVolume(kind, value);
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
