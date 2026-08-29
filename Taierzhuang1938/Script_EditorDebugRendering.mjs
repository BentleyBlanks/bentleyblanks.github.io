// 独立的渲染调试浮窗。它不接管相机、不暂停或修改玩法，也不属于互斥编辑器：
// 美术/程序在场景、地形、摄影棚工具里工作时，仍能把 GBuffer / AO / GI 铺到
// 主画布上看。这是它不能塞进 EDITORS 数组的原因。

import { Panel, Section, Chips, Facts, Note } from "./Script_EditorUi.mjs";

const VIEWS = [
  { id: "final", label: "最终画面", group: "输出", note: "正式的合成 + FXAA 输出。" },
  { id: "hdr", label: "HDR 场景", group: "输出", note: "泛光、雾和调色之前的主场景 HDR 靶。" },
  { id: "bloomExtract", label: "Bloom 提取", group: "后处理", note: "按阈值、软膝与亮度钳制后的半分辨率亮部；黑色区域不会进入 Bloom。" },
  { id: "bloom", label: "Bloom 合成", group: "后处理", note: "多级降采样再 tent 升采样叠回的最终 Bloom 靶；与正式合成实际采样的是同一张。" },
  { id: "fog", label: "雾量", group: "后处理", note: "指数距离雾 × 高度衰减得到的实际混合系数；深蓝 = 无雾、暖黄 = 雾量高。" },
  { id: "dof", label: "景深 CoC", group: "后处理", note: "正式景深使用的散焦系数；蓝 = 锐利、暖黄 = 最大散焦。景深只在阵亡镜头启用。" },
  { id: "normal", label: "法线", group: "GBuffer", note: "NormalDepth 预通道的视空间法线。" },
  { id: "depth", label: "视深", group: "GBuffer", note: "NormalDepth 预通道 alpha；近处亮、80 m 以外渐黑。" },
  { id: "motionVector", label: "Motion Vector", group: "GBuffer", note: "由深度反投影得到的相机屏幕速度：R/G = 水平/垂直方向，B = 像素速度。没有逐物体速度缓冲。" },
  { id: "ao", label: "AO 原始", group: "AO", note: "SSAO 尚未双边模糊的半分辨率结果。" },
  { id: "aoBlur", label: "AO 模糊", group: "AO", note: "实际注入材质间接光的 AO 结果。" },
  { id: "baseColor", label: "BaseColor", group: "材质", note: "反照率（贴图×顶点色×材质色），光照之前的底色。" },
  { id: "roughness", label: "粗糙度", group: "材质", note: "ORM 采样后的 roughnessFactor；白 = 糙、黑 = 光。" },
  { id: "metalness", label: "金属度", group: "材质", note: "ORM 采样后的 metalnessFactor；这一关的世界大多是 0（黑），枪机、刺刀才亮。" },
  { id: "shadow", label: "太阳阴影", group: "光照", note: "平行光阴影因子：白 = 照到、黑 = 挡住。阴影框只有 66 m，框外恒白 —— 顺带能看到覆盖边界。不收影的材质显示黑。" },
  { id: "diffuseLighting", label: "Diffuse Lighting", group: "光照", note: "正式 reflectedLight.directDiffuse：太阳/局部直射的漫反射贡献（HDR 映射显示）。" },
  { id: "specularLighting", label: "Specular Lighting", group: "光照", note: "正式 reflectedLight.directSpecular：太阳/局部直射的镜面高光贡献（HDR 映射显示）。" },
  { id: "reflection", label: "Reflection", group: "光照", note: "正式 reflectedLight.indirectSpecular：环境 IBL 的粗糙反射，已包含正式 SSAO/GI 镜面遮蔽。" },
  { id: "indirectLighting", label: "Indirect Lighting", group: "光照", note: "正式 reflectedLight.indirectDiffuse：探针 GI 或天空 IBL 的漫反射，已包含正式 SSAO。" },
  { id: "giWorld", label: "GI 辐照度", group: "光照", note: "材质最终采用的间接辐照度（×0.05）；探针体外按正式渲染回退到天空 IBL，不应为黑。" },
  { id: "giConfidence", label: "GI 置信度", group: "光照", note: "取样置信度：1 = 全用探针，0 = 退回天空 IBL；体积边缘的淡出带就在这里看。探针体关着（出厂默认）时恒 0，全黑是准确信息。" },
  { id: "giIrradiance", label: "辐照度图集", group: "GI", note: "实时探针体的 RGB 辐照度 atlas；探针体没开时显示不可用斜纹（去「画质」里打开）。" },
  { id: "giDistance", label: "距离图集", group: "GI", note: "实时探针体的 R/G 距离矩；探针体没开时显示不可用斜纹。" },
];

/**
 * 材质注入侧的假彩色编号（Script_Gi.MakeGiUniforms 的 debugView，
 * Script_Materials 按它把对应通道当颜色写出）。前向管线没有 GBuffer，
 * BaseColor / 粗糙度 / 金属度 / 阴影只存在于材质着色器内部，只能这么拿。
 * 表里没有的视图必须把 uniform 归零，否则材质还在输出上一个假彩色。
 */
const MATERIAL_VIEW_MODES = {
  giWorld: 1, giConfidence: 3, baseColor: 6, roughness: 7, metalness: 8, shadow: 9,
  diffuseLighting: 10, specularLighting: 11, reflection: 12, indirectLighting: 13,
};

/**
 * 视图 id -> 它正在显示的那张靶。与 Post._GetDebugSource 是同一张表，
 * 改一边必须改另一边，否则面板报的尺寸不是屏幕上那张图的尺寸。
 */
const VIEW_TARGETS = {
  final: (post) => post?.targets?.ldr,
  hdr: (post) => post?.targets?.hdr,
  bloomExtract: (post) => post?.targets?.bright,
  bloom: (post) => post?.BloomTarget,
  fog: (post) => post?.targets?.normalDepth,
  dof: (post) => post?.targets?.normalDepth,
  normal: (post) => post?.targets?.normalDepth,
  depth: (post) => post?.targets?.normalDepth,
  motionVector: (post) => post?.targets?.normalDepth,
  ao: (post) => post?.targets?.ao,
  aoBlur: (post) => post?.targets?.aoBlur,
  giIrradiance: (post, gi) => gi?.irradiance?.[gi.pingPong],
  giDistance: (post, gi) => gi?.distanceMoments?.[gi.pingPong],
  // 材质通道假彩色都是场景按调试口径重画进 hdr 靶再送屏
  baseColor: (post) => post?.targets?.hdr,
  roughness: (post) => post?.targets?.hdr,
  metalness: (post) => post?.targets?.hdr,
  shadow: (post) => post?.targets?.hdr,
  diffuseLighting: (post) => post?.targets?.hdr,
  specularLighting: (post) => post?.targets?.hdr,
  reflection: (post) => post?.targets?.hdr,
  indirectLighting: (post) => post?.targets?.hdr,
  giWorld: (post) => post?.targets?.hdr,
  giConfidence: (post) => post?.targets?.hdr,
};

export class DebugRenderingEditor {
  static id = "debugRendering";
  static label = "Debug Rendering";
  static hint = "叠加查看 GBuffer、AO、GI 与后处理靶；切换其它编辑器时保持打开";

  constructor(host) {
    this.host = host;
    this.panel = null;
    this.view = "final";
    this.facts = null;
    // 四组 chips 是四个各自独立的高亮控件，但它们表示的是**同一个**选择。
    // 不集中同步的话，点了「辐照度图集」之后「最终画面」那一格还亮着 ——
    // 面板上会同时亮四格，读者根本判断不出当前送屏的是哪一张靶。
    this.chipGroups = [];
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
    // 退出这个浮窗，必须立即归还正常屏幕输出；不能把上一次的法线图带回游戏，
    // 材质 uniform 也要一并归零 —— 留着的话所有材质还在往 hdr 靶里写假彩色。
    this.host.post?.SetDebugView?.("final");
    const pack = this.host.library?.gi;
    if (pack) pack.debugView.value = 0;
    this.panel?.root.remove();
    this.panel = null;
    this.facts = null;
    this.chipGroups = [];
  }

  BuildUi(body) {
    this.chipGroups = [];
    for (const group of ["输出", "后处理", "GBuffer", "材质", "光照", "AO", "GI"]) {
      const section = Section(body, group);
      const options = VIEWS.filter((item) => item.group === group)
        .map((item) => ({ value: item.id, label: item.label, title: item.note }));
      this.chipGroups.push(Chips(section, options, this.view, (id) => this.SetView(id)));
    }
    Note(body,
      "前景叠加，开着别的编辑器也不关。前向管线没有 GBuffer：「材质」「光照」是"
      + "假彩色重画一帧（low 档不可用）。", true);
    const stat = Section(body, "当前靶");
    this.facts = Facts(stat);
  }

  SetView(id) {
    if (!VIEWS.some((item) => item.id === id)) id = "final";
    this.view = id;
    // 每一组都刷一遍：选中的那一组把自己点亮，其余各组一起熄掉。
    for (const chips of this.chipGroups) chips.Set(id);
    // 材质假彩色与送屏视图必须同帧同步：uniform 指挥材质写什么，
    // post 决定拿哪张靶、按哪种口径显示。只设一边就是「面板亮着、画面没变」。
    const pack = this.host.library?.gi;
    if (pack) pack.debugView.value = MATERIAL_VIEW_MODES[id] || 0;
    // 第三参 = 材质注了调试层没有：GI 出厂默认关时探针体（host.gi）是 null，
    // 但材质/光照组的假彩色照样可用 —— 可用性要看 library.gi，不看探针体。
    this.host.post?.SetDebugView?.(id, this.host.gi, !!pack);
  }

  Update() {
    if (!this.facts) return;
    const post = this.host.post;
    const gi = this.host.gi;
    const item = VIEWS.find((entry) => entry.id === this.view) || VIEWS[0];
    // 以前这一行按视图 id 直接去 post.targets 里查同名键，于是 final 与 bloom
    // 恒为"—"（两者都没有同名靶），看着像靶根本没建出来。
    const target = VIEW_TARGETS[this.view]?.(post, gi) ?? null;
    this.facts.Set("显示", item.label);
    this.facts.Set("说明", item.note);
    this.facts.Set("尺寸", target ? `${target.width} × ${target.height}` : "—", target ? "" : "warn");
    this.facts.Set("SSAO", post?.preset?.ssao ? "启用" : "当前画质档关闭", post?.preset?.ssao ? "good" : "warn");
    this.facts.Set("GI 探针体", gi ? (gi.enabled ? `启用 · ${gi.warmed}/${gi.probeCount}` : "已构造，当前关闭") : "未构造（出厂默认关，画质 → 全局光照里打开）", gi?.enabled ? "good" : "warn");
    // 材质/光照组的两个前置条件：材质注入过（low 档没有）、阴影真的开着
    const injected = !!this.host.library?.gi;
    this.facts.Set("材质假彩色", injected ? "已注入" : "low 档未注入，材质/光照组不可用", injected ? "good" : "warn");
    const shadowOn = !!this.host.renderer?.shadowMap?.enabled;
    this.facts.Set("太阳阴影", shadowOn ? "启用" : "关闭（阴影视图会是全黑/全白）", shadowOn ? "good" : "warn");
    const composite = post?.uniformsComposite;
    if (this.view === "fog") {
      const density = composite?.uFogDensity?.value ?? 0;
      this.facts.Set("雾效", density > 0 ? `启用 · 密度 ${density.toFixed(3)}` : "关闭（雾量图为深蓝）", density > 0 ? "good" : "warn");
    }
    if (this.view === "dof") {
      const farStrength = composite?.uDofStrength?.value ?? 0;
      const nearStrength = composite?.uNearDofStrength?.value ?? 0;
      const strength = Math.max(farStrength, nearStrength);
      const mode = farStrength > nearStrength ? "阵亡远景" : "开镜近景";
      this.facts.Set("景深", strength > 0 ? `启用 · ${mode} ${strength.toFixed(2)}` : "当前未触发", strength > 0 ? "good" : "warn");
    }
  }
}

export default DebugRenderingEditor;
