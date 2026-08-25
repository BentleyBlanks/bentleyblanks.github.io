// 独立的渲染调试浮窗。它不接管相机、不暂停或修改玩法，也不属于互斥编辑器：
// 美术/程序在场景、地形、摄影棚工具里工作时，仍能把 G-Buffer / AO / GI / 屏幕
// 空间三件套铺到主画布上看。这是它不能塞进 EDITORS 数组的原因。
//
// 面板文案一律英文：这是给程序看的渲染调试口，标签就是 pass 与靶的名字，
// 翻译过来反而对不上 Script_Post 里的变量名与 RenderDoc 里的抓帧。

import { Panel, Section, Chips, Facts, Note } from "./Script_EditorUi.mjs";

const VIEWS = [
  { id: "final", label: "Final", group: "Output", note: "Composite + FXAA, exactly what ships to the screen." },
  { id: "lit", label: "Lit", group: "Output", note: "HDR after the deferred screen-space combine, before bloom and grading." },
  { id: "hdr", label: "HDR", group: "Output", note: "Forward-shaded HDR target, before any screen-space pass." },
  { id: "bloom", label: "Bloom", group: "Output", note: "The bloom mip the composite pass actually samples." },

  { id: "normal", label: "Normal", group: "GBuffer", note: "View-space normal, G-Buffer attachment 0 rgb." },
  { id: "depth", label: "Depth", group: "GBuffer", note: "Linear view depth, attachment 0 alpha. Bright near, black past 80 m." },
  { id: "albedo", label: "Albedo", group: "GBuffer", note: "Linear base colour, attachment 1 rgb. Flat grey means the fallback G-Buffer material." },
  { id: "roughness", label: "Roughness", group: "GBuffer", note: "Attachment 1 alpha. Black = mirror, white = fully rough." },
  { id: "metalness", label: "Metalness", group: "GBuffer", note: "Attachment 2 red. Should be black almost everywhere in this game." },

  { id: "ao", label: "AO Raw", group: "AO", note: "SSAO before the bilateral blur, half resolution." },
  { id: "aoBlur", label: "AO Blurred", group: "AO", note: "The AO that is actually injected into indirect lighting." },

  { id: "ssgi", label: "SSGI", group: "Screen Space", note: "One-bounce screen-space indirect diffuse, before it is multiplied by albedo." },
  { id: "ssr", label: "SSR", group: "Screen Space", note: "Screen-space reflection, already weighted by its confidence (rgb x a)." },
  { id: "contact", label: "Contact Shadow", group: "Screen Space", note: "Screen-space contact shadow visibility. White = lit, black = occluded." },

  { id: "giIrradiance", label: "GI Irradiance", group: "Probe GI", note: "RGB irradiance atlas of the realtime probe volume. Striped when the volume is off." },
  { id: "giDistance", label: "GI Distance", group: "Probe GI", note: "R/G distance moments of the probe volume. Striped when the volume is off." },
];

const GROUPS = ["Output", "GBuffer", "AO", "Screen Space", "Probe GI"];

/**
 * 视图 id -> 它正在显示的那张靶。与 Post._GetDebugSource 是同一张表，
 * 改一边必须改另一边，否则面板报的尺寸不是屏幕上那张图的尺寸。
 */
const VIEW_TARGETS = {
  final: (post) => post?.targets?.ldr,
  lit: (post) => (post?.ScreenSpaceActive ? post?.targets?.lit : post?.targets?.hdr),
  hdr: (post) => post?.targets?.hdr,
  bloom: (post) => post?.BloomTarget,
  normal: (post) => post?.targets?.gbuffer,
  depth: (post) => post?.targets?.gbuffer,
  albedo: (post) => post?.targets?.gbuffer,
  roughness: (post) => post?.targets?.gbuffer,
  metalness: (post) => post?.targets?.gbuffer,
  ao: (post) => post?.targets?.ao,
  aoBlur: (post) => post?.targets?.aoBlur,
  ssgi: (post) => post?.targets?.ssgi,
  ssr: (post) => post?.targets?.ssr,
  contact: (post) => post?.targets?.contact,
  giIrradiance: (post, gi) => gi?.irradiance?.[gi.pingPong],
  giDistance: (post, gi) => gi?.distanceMoments?.[gi.pingPong],
};

export class DebugRenderingEditor {
  static id = "debugRendering";
  static label = "Debug Rendering";
  static hint = "叠加查看 G-Buffer、AO、GI 与屏幕空间三件套；切换其它编辑器时保持打开";

  constructor(host) {
    this.host = host;
    this.panel = null;
    this.view = "final";
    this.facts = null;
    // 五组 chips 是五个各自独立的高亮控件，但它们表示的是**同一个**选择。
    // 不集中同步的话，点了 SSR 之后 Final 那一格还亮着 —— 面板上会同时亮好几格，
    // 读者根本判断不出当前送屏的是哪一张靶。
    this.chipGroups = [];
  }

  Enter(root) {
    this.panel = Panel({
      title: "Debug Rendering", sub: "overlay",
      variant: "work debugRendering", onClose: () => this.host.CloseDebugRendering(),
    });
    root.appendChild(this.panel.root);
    this.BuildUi(this.panel.body);
    this.SetView(this.host.post?.GetDebugView?.() || "final");
    return this;
  }

  Exit() {
    // 退出这个浮窗，必须立即归还正常屏幕输出；不能把上一次的法线图带回游戏。
    this.host.post?.SetDebugView?.("final");
    this.panel?.root.remove();
    this.panel = null;
    this.facts = null;
    this.chipGroups = [];
  }

  BuildUi(body) {
    this.chipGroups = [];
    for (const group of GROUPS) {
      const section = Section(body, group);
      const options = VIEWS.filter((item) => item.group === group)
        .map((item) => ({ value: item.id, label: item.label, title: item.note }));
      this.chipGroups.push(Chips(section, options, this.view, (id) => this.SetView(id)));
    }
    Note(body,
      "Foreground overlay: it survives opening the scene, terrain, prop or studio editors. "
      + "Screen-space GI / reflection / contact shadow are quality-preset gated (SSGI is high and up) "
      + "and are combined deferred, off the G-Buffer, not injected per object.", true);
    const stat = Section(body, "Current Target");
    this.facts = Facts(stat);
  }

  SetView(id) {
    if (!VIEWS.some((item) => item.id === id)) id = "final";
    this.view = id;
    // 每一组都刷一遍：选中的那一组把自己点亮，其余几组一起熄掉。
    for (const chips of this.chipGroups) chips.Set(id);
    this.host.post?.SetDebugView?.(id, this.host.gi);
  }

  Update() {
    if (!this.facts) return;
    const post = this.host.post;
    const gi = this.host.gi;
    const preset = post?.preset;
    const item = VIEWS.find((entry) => entry.id === this.view) || VIEWS[0];
    // 以前这一行按视图 id 直接去 post.targets 里查同名键，于是 final 与 bloom
    // 恒为 "-"（两者都没有同名靶），看着像靶根本没建出来。
    const target = VIEW_TARGETS[this.view]?.(post, gi) ?? null;
    const On = (flag) => (flag ? "on" : "off");
    this.facts.Set("View", item.label);
    this.facts.Set("Note", item.note);
    this.facts.Set("Size", target ? `${target.width} x ${target.height}` : "-", target ? "" : "warn");
    this.facts.Set("Quality", post?.quality ?? "-");
    this.facts.Set("SSAO", On(preset?.ssao), preset?.ssao ? "good" : "warn");
    this.facts.Set("SSGI", On(preset?.ssgi), preset?.ssgi ? "good" : "warn");
    this.facts.Set("SSR", On(preset?.ssr), preset?.ssr ? "good" : "warn");
    this.facts.Set("Contact Shadow", On(preset?.contact), preset?.contact ? "good" : "warn");
    this.facts.Set("GBuffer Variants", post?.gbufferVariants?.size ?? 0);
    this.facts.Set("Probe Volume",
      gi ? (gi.enabled ? `on - ${gi.warmed}/${gi.probeCount} warmed` : "built, currently off") : "not built at this quality",
      gi?.enabled ? "good" : "warn");
  }
}

export default DebugRenderingEditor;
