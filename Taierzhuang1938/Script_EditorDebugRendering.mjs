// 独立的渲染调试浮窗。它不接管相机、不暂停或修改玩法，也不属于互斥编辑器：
// 美术/程序在场景、地形、摄影棚工具里工作时，仍能把 GBuffer / AO / GI 铺到
// 主画布上看。这是它不能塞进 EDITORS 数组的原因。

import { Panel, Section, Chips, Facts, Note } from "./Script_EditorUi.mjs";

const VIEWS = [
  { id: "final", label: "最终画面", group: "输出", note: "正式的合成 + FXAA 输出。" },
  { id: "hdr", label: "HDR 场景", group: "输出", note: "泛光、雾和调色之前的主场景 HDR 靶。" },
  { id: "bloom", label: "泛光", group: "输出", note: "亮部提取与多级升采样后的泛光输入。" },
  { id: "normal", label: "法线", group: "GBuffer", note: "NormalDepth 预通道的视空间法线。" },
  { id: "depth", label: "视深", group: "GBuffer", note: "NormalDepth 预通道 alpha；近处亮、80 m 以外渐黑。" },
  { id: "ao", label: "AO 原始", group: "AO", note: "SSAO 尚未双边模糊的半分辨率结果。" },
  { id: "aoBlur", label: "AO 模糊", group: "AO", note: "实际注入材质间接光的 AO 结果。" },
  { id: "giIrradiance", label: "辐照度图集", group: "GI", note: "实时探针体的 RGB 辐照度 atlas。" },
  { id: "giDistance", label: "距离图集", group: "GI", note: "实时探针体的 R/G 距离矩；没有探针体时显示不可用纹。" },
];

export class DebugRenderingEditor {
  static id = "debugRendering";
  static label = "Debug Rendering";
  static hint = "叠加查看 GBuffer、AO、GI 与后处理靶；切换其它编辑器时保持打开";

  constructor(host) {
    this.host = host;
    this.panel = null;
    this.view = "final";
    this.facts = null;
  }

  Enter(root) {
    this.panel = Panel({
      title: "Debug Rendering", sub: "叠加预览",
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
  }

  BuildUi(body) {
    for (const group of ["输出", "GBuffer", "AO", "GI"]) {
      const section = Section(body, group);
      const options = VIEWS.filter((item) => item.group === group)
        .map((item) => ({ value: item.id, label: item.label, title: item.note }));
      Chips(section, options, this.view, (id) => this.SetView(id));
    }
    Note(body,
      "这是前景叠加工具：打开场景、地形、构件或摄影棚编辑器时不会被关闭。"
      + "当前管线的 GBuffer 是 Normal + Depth 预通道，不存在延迟渲染的 Albedo / Roughness 靶。", true);
    const stat = Section(body, "当前靶");
    this.facts = Facts(stat);
  }

  SetView(id) {
    if (!VIEWS.some((item) => item.id === id)) id = "final";
    this.view = id;
    this.host.post?.SetDebugView?.(id, this.host.gi);
  }

  Update() {
    if (!this.facts) return;
    const post = this.host.post;
    const gi = this.host.gi;
    const item = VIEWS.find((entry) => entry.id === this.view) || VIEWS[0];
    const target = this.view.startsWith("gi")
      ? (this.view === "giIrradiance" ? gi?.irradiance?.[gi.pingPong] : gi?.distanceMoments?.[gi.pingPong])
      : post?.targets?.[this.view === "normal" || this.view === "depth" ? "normalDepth" : this.view];
    this.facts.Set("显示", item.label);
    this.facts.Set("说明", item.note);
    this.facts.Set("尺寸", target ? `${target.width} × ${target.height}` : "—", target ? "" : "warn");
    this.facts.Set("SSAO", post?.preset?.ssao ? "启用" : "当前画质档关闭", post?.preset?.ssao ? "good" : "warn");
    this.facts.Set("GI 探针体", gi ? (gi.enabled ? `启用 · ${gi.warmed}/${gi.probeCount}` : "已构造，当前关闭") : "当前画质档未构造", gi?.enabled ? "good" : "warn");
  }
}

export default DebugRenderingEditor;
