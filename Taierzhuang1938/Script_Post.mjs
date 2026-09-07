// 《台儿庄：血战滕县》自研后处理管线 —— **帧图编排器**。
//
// 为什么自己写：仓库里 vendor 的 three 只有 build/，**没有 examples/jsm**，
// 没有 EffectComposer / UnrealBloomPass / SSAOPass 可用。所以整条链子从
// WebGLRenderTarget + 全屏四边形手搭。好处是顺序完全可控（AO 只压间接光、
// 泛光在 tonemap 之前、抗锯齿在 sRGB 之后）—— 这三条顺序错一条画面就"塑料"。
//
// ## 2026-09 帧图重构：这个文件只剩编排
// 每个阶段是一个独立模块，实现契约 `{ name, Prepare?, Enabled, Resize, Render, Dispose }`
// （契约与 FrameContext 字段表写在 `Script_PostCommon.mjs` 抬头）。编排器持有一张
// **有序 pass 列表**，逐个 `Enabled → GpuPush(name) → Render → GpuPop`：
//
//   0) TAA 抖动          Script_PostTaa.ApplyJitter
//   1) prepass           Script_PostPrepass  MRT：RT0 法线+视深 / RT1 速度 / DepthTexture
//   2) hzb               Script_PostPrepass  线性视深 max-reduce 金字塔
//   3) ssao              Script_PostSsao     半分辨率 + 双边模糊
//   4) main              （本文件）HDR 主场景，AO 由材质补丁注入间接光
//   5) wireframe         Script_PostDebug    着色模式非 shaded 时叠一层线
//   6) debugOverlay      Script_PostDebug    Rapier 碰撞体线框等
//   7) taa               Script_PostTaa      时域解算（线性 HDR 域，UE 的位置）
//   8) bloom             Script_PostBloom    亮部 + 降/升采样
//   9) god               Script_PostBloom    太阳拖影（太阳在屏内才跑）
//  10) composite         Script_PostComposite 运动模糊→景深→雾→曝光→ACES→调色→镜头→sRGB
//  11) fxaa              Script_PostFxaa     FXAA + 锐化 → 屏幕（或调试视图送屏）
//
// **加一个 pass = 新模块 + 这张列表里插一行 + `Data_Tuning_Graphics` 加一位开关。**
// 不要往 `Render()` 里插代码，也不要去改别人的模块。
//
// ## 公共 API 一个都没断
// 重构前所有导出、方法、`post.xxx` 属性（含 `targets` / `uniformsComposite` /
// `matGod` / `_Blit` / `_GetDebugSource` 这些测试在用的）全部保留，行为逐比特相同。
//
// 决定论：颗粒/抖动全部用 frameIndex 驱动，不用 Math.random —— 视觉审查靠逐轮
// 截图比对，画面自己在抖的话根本判断不了"这一版比上一版好"。TAA 的抖动序列
// 与历史累积同样由 frameIndex 驱动：StepFrames 推同样多帧，画面逐像素可复现。

import * as THREE from "three";
import { Blitter, FrameContext, MakeRenderTarget, RenderTargetPool } from "./Script_PostCommon.mjs";
import { MakeQualityPreset, POST_QUALITY_KEYS } from "./Data_Tuning_Graphics.mjs";
import {
  PrepassPass, MarkNoPrepass, MarkForegroundPrepass, MarkDynamicPrepass, FOREGROUND_VIEW_DEPTH,
} from "./Script_PostPrepass.mjs";
import { SsaoPass } from "./Script_PostSsao.mjs";
import { TaaPass } from "./Script_PostTaa.mjs";
import { BloomPass, GodRaysPass } from "./Script_PostBloom.mjs";
import { CompositePass } from "./Script_PostComposite.mjs";
import { FxaaPass } from "./Script_PostFxaa.mjs";
import { DebugPass, InjectDepthPull, SHADING_MODES, WIRE_BACKGROUND_PURE } from "./Script_PostDebug.mjs";
import { AtmospherePass } from "./Script_Atmosphere.mjs";

// 预通道语义（材质/对象怎么进这一趟）与深度偏置/着色模式仍从这里导出：
// 十几个模块 import 的是 `./Script_Post.mjs`，实现搬家不该让它们跟着改。
export { MarkNoPrepass, MarkForegroundPrepass, MarkDynamicPrepass, FOREGROUND_VIEW_DEPTH };
export { InjectDepthPull, SHADING_MODES };
export { POST_QUALITY_KEYS };

export class PostPipeline {
  constructor(renderer, { width, height, quality = "high", destruction = null } = {}) {
    this.renderer = renderer;
    this.quality = POST_QUALITY_KEYS.includes(quality) ? quality : "high";
    this.preset = MakeQualityPreset(this.quality);
    this.frame = 0;
    this.width = Math.max(2, width | 0);
    this.height = Math.max(2, height | 0);

    // 半浮点渲染目标是整条链的地基：没有 HDR 就没有真正的泛光与曝光。
    // WebGL2 下 EXT_color_buffer_float / half_float 缺一不可，缺了就降级到 8 位，
    // 画面会平但不至于黑屏（也顺带关掉速度靶与 HZB —— 它们都要浮点靶）。
    const gl = renderer.getContext();
    const hasFloatRt = !!(gl.getExtension("EXT_color_buffer_float")
      || gl.getExtension("EXT_color_buffer_half_float"));
    this.hdrType = hasFloatRt ? THREE.HalfFloatType : THREE.UnsignedByteType;
    this.hdrCapable = hasFloatRt;

    this.targets = {};
    this.bloomMips = [];
    this.pool = new RenderTargetPool();
    this.blitter = new Blitter(renderer);
    this.context = new FrameContext();

    // 着色模式（Debug Rendering 面板的「着色 / 线框 / 着色线框」）。只改主场景那一趟
    // 怎么画，不进玩家设置，面板关掉必须还回 shaded。
    this.shadingMode = "shaded";
    /**
     * 调试叠加层：主场景画完后、TAA 之前，用同一张 hdr 靶（连同它的深度）再画一遍的
     * Object3D 根节点（碰撞体线框就挂在这里）。与场景图分开：进了 scene 的东西会被
     * 预通道当几何写法线、被线框覆盖材质换掉、被 SSAO 当遮挡物 —— 全是不想要的。
     * 根节点可选实现 `userData.PrepareDebugOverlay({ exposure })`，在画之前拿到本帧曝光。
     */
    this.debugOverlays = new Set();
    // final 之外的值只在开发用面板明确要求时才生效；正式出图完全不走这里。
    this.debugView = "final";
    this.debugGi = null;
    this.debugInjected = false;
    /**
     * 子系统自带的调试视图。键 = 视图 id，值 = `(pipeline) => GetSource() 的返回值`
     * （`{ texture, mode }` 或 `{ material, Prepare(ctx) }`）。
     * 有了它，新 pass 加自己的假彩色就不必去改 `Script_PostDebug` 的 switch ——
     * 八个并行子系统各加两三个视图的话，那条 switch 会变成公共冲突点。
     */
    this.debugViewProviders = new Map();

    // 出厂值来自画质档，但**运行时状态是这一位**（画质面板走 SetTaaEnabled 改它）。
    // 历史靶按它建，不按 preset 建 —— 否则 low 档打开开关也没有靶可写。
    this.taaEnabled = !!this.preset.taa;
    this.taaJitterScale = 1;
    this.sharpenStrength = this.preset.sharpen;
    this.taaFlip = false;
    this.hasTaaHistory = false;
    this.taaWasActive = false;
    // 抖动前投影矩阵第三列 x/y 的原值，主场景画完立刻还原
    this.savedProj8 = 0;
    this.savedProj9 = 0;

    this.prevViewProjection = new THREE.Matrix4();
    this.hasPrev = false;
    // 性能剖析器（Script_Profiler）。开着时 Render 在每个 pass 两侧 GpuPush/GpuPop，
    // 由 FrameProfiler.Enable/Disable 挂上与摘下；平时是 null，逐 pass 只多一次判空。
    this.profiler = null;

    // --- pass 实例 ---------------------------------------------------------
    this.prepassPass = new PrepassPass(this, { destruction });
    this.ssaoPass = new SsaoPass(this);
    this.taaPass = new TaaPass(this);
    this.bloomPass = new BloomPass(this);
    this.godRaysPass = new GodRaysPass(this, this.bloomPass);
    this.compositePass = new CompositePass(this);
    this.fxaaPass = new FxaaPass(this);
    this.debugPass = new DebugPass(this);
    // 物理大气（子系统 B4）：每帧刷天空视图与大气透视两张 LUT。
    // 排在最前是因为主场景那一趟要画天穹，天穹采的就是天空视图 LUT。
    this.atmospherePass = new AtmospherePass(this);

    // --- 有序帧图 ---------------------------------------------------------
    this.passes = [
      this.atmospherePass,
      this.prepassPass,
      {
        name: "hzb",
        Enabled: () => !!this.prepassPass.hzb,
        Resize: () => {},
        Render: (ctx) => this.prepassPass.RenderHzb(ctx),
        Dispose: () => {},
      },
      this.ssaoPass,
      {
        name: "main",
        Enabled: () => true,
        Resize: (w, h) => this._ResizeHdr(w, h),
        Render: (ctx) => this._RenderScene(ctx),
        Dispose: () => { if (this.targets.hdr) this.targets.hdr.dispose(); },
      },
      {
        name: "wireframe",
        Enabled: () => this.shadingMode !== "shaded",
        Resize: () => {},
        Render: (ctx) => this.debugPass.RenderWireframe(ctx),
        Dispose: () => {},
      },
      {
        name: "debugOverlay",
        Enabled: () => this.debugOverlays.size > 0,
        Resize: () => {},
        Render: (ctx) => this.debugPass.RenderOverlays(ctx),
        Dispose: () => {},
      },
      this.taaPass,
      {
        // 只做决策不出画：太阳拖影要在**亮部提取之前**定下来（亮部图的 alpha
        // 只在拖影开着时才顺手打包天空遮挡）。位置也不能提前 —— 太阳投影要用
        // 摘掉 TAA 抖动之后的干净投影矩阵，而摘抖动是上一行那个 pass 干的。
        name: "godPrepare",
        Prepare: (ctx) => this.godRaysPass.ResolveActivation(ctx),
        Enabled: () => false,
        Resize: () => {},
        Render: () => {},
        Dispose: () => {},
      },
      this.bloomPass,
      this.godRaysPass,
      this.compositePass,
      this.fxaaPass,
    ];

    // 旧名字的别名（测试与编辑器直接读它们，重构不许断）
    this.normalDepthMaterial = this.prepassPass.material;
    this.wireframeMaterial = this.debugPass.wireframeMaterial;
    this.uniformsAo = this.ssaoPass.uniforms;
    this.matAo = this.ssaoPass.material;
    this.uniformsAoBlur = this.ssaoPass.uniformsBlur;
    this.matAoBlur = this.ssaoPass.materialBlur;
    this.uniformsBright = this.bloomPass.uniformsBright;
    this.matBright = this.bloomPass.matBright;
    this.uniformsDown = this.bloomPass.uniformsDown;
    this.matDown = this.bloomPass.matDown;
    this.uniformsUp = this.bloomPass.uniformsUp;
    this.matUp = this.bloomPass.matUp;
    this.uniformsGod = this.godRaysPass.uniforms;
    this.matGod = this.godRaysPass.material;
    this.uniformsTaa = this.taaPass.uniforms;
    this.matTaa = this.taaPass.material;
    this.uniformsComposite = this.compositePass.uniforms;
    this.matComposite = this.compositePass.material;
    this.uniformsFxaa = this.fxaaPass.uniforms;
    this.matFxaa = this.fxaaPass.material;
    this.uniformsDebug = this.debugPass.uniforms;
    this.matDebug = this.debugPass.material;
    // 老代码用 post.quadScene / quadMesh 直接摆全屏四边形；指向同一份。
    this.quadScene = this.blitter.scene;
    this.quadMesh = this.blitter.mesh;

    this.SetSize(this.width, this.height);
  }

  _ResizeHdr(width, height) {
    if (this.targets.hdr) this.targets.hdr.dispose();
    this.targets.hdr = MakeRenderTarget(width, height, {
      type: this.hdrType, depthBuffer: true, samples: this.preset.msaa,
    });
  }

  SetSize(width, height) {
    this.width = Math.max(2, width | 0);
    this.height = Math.max(2, height | 0);
    this.pool.Resize();
    for (const pass of this.passes) pass.Resize?.(this.width, this.height);
    // 尺寸一变 TAA 历史与上一帧矩阵全部作废（uv 与视差都对不上位）
    this.taaFlip = false;
    this.hasTaaHistory = false;
    this.taaWasActive = false;
    this.hasPrev = false;
  }

  /**
   * 运行时开关 TAA（画质面板用）。
   *
   * 与画质档不同，这一项**可以热切** —— 它不像 MSAA 采样数 / AO 靶比例 / 泛光级数
   * 那样进了建靶参数，只是多两张全分辨率历史靶。所以走 GI 那条惰性构造的先例：
   * 出厂关着的档（low）根本不建靶，玩家真打开时才建，关掉立刻还显存。
   *
   * 关掉再打开必须丢历史：TAA 关着的那几十帧没人往历史靶里写，里面躺的是
   * 上一次关掉前那一帧。不清的话重新打开的第一帧会跟一张几十秒前的画面混合 ——
   * 邻域裁剪能把它压回去，但那一帧仍会看见一层脏东西。
   */
  SetTaaEnabled(on) {
    const want = !!on;
    if (want === this.taaEnabled) return;
    this.taaEnabled = want;
    this.taaPass.SyncTargets();
    this.taaFlip = false;
    this.hasTaaHistory = false;
    this.taaWasActive = false;
  }

  /**
   * 镜头硬切（过场换机位、菜单进关这类瞬移）时调：丢掉 TAA 历史与
   * 运动模糊的上一帧矩阵。不调也不会坏 —— 邻域裁剪会在一两帧内把
   * 错误历史压回去，只是切换瞬间有一帧轻微的溶解感；UE 对应的是
   * camera cut 标记，语义相同。
   */
  NotifyCameraCut() {
    this.hasTaaHistory = false;
    this.hasPrev = false;
  }

  /** 屏幕空间 AO 贴图 —— 交给 Materials 层注入 MeshStandardMaterial 的间接光。 */
  get AoTexture() { return this.targets.aoBlur.texture; }

  /**
   * 深度法线预通道 RT0（RGBA16F：xyz = 视空间法线，w = 线性视深度）。全分辨率，
   * 与主 HDR 靶同尺寸，所以采样直接用 gl_FragCoord.xy / (width, height)。
   * 粒子层要它做软粒子，也要它判断"这一像素背后是不是天空"——
   * 合成 pass 的雾明写跳过 w = 0 的天空，粒子得自己接上那一半。
   */
  get NormalDepthTexture() { return this.prepassPass.normalDepthTexture; }

  /** 预通道 RT1：屏幕空间速度（单位 uv）。没建时是 null，口径见 Script_PostPrepass。 */
  get VelocityTexture() { return this.prepassPass.velocityTexture; }

  /** 预通道的 DepthTexture（HZB / 将来的 SSR、体积雾复用）。 */
  get SceneDepthTexture() { return this.prepassPass.depthTexture; }

  /** HZB：`{ source, texture, levels, sizes, mipCount, size }` 或 null。 */
  get Hzb() { return this.prepassPass.hzb; }

  /** 合成 pass 实际采样的那一级泛光靶。调试面板与 uBloom 必须指同一张。 */
  get BloomTarget() { return this.bloomPass.BloomTarget; }

  /**
   * 让独立的渲染调试面板选择当前帧最终送往屏幕的中间结果。
   * 这个状态故意不进玩家设置，也不影响正式合成链，只在面板存活期间保留。
   */
  SetDebugView(view = "final", gi = null, injected = null) {
    this.debugView = view || "final";
    this.debugGi = gi || null;
    // 材质假彩色的可用性看「材质注了没有」（library.gi 那包 uniforms），
    // 不看 ProbeVolume：GI 出厂默认关时探针体不构造，但调试层照样编在材质里。
    // 不传第三参的旧调用点退回老代理（有探针体 = 注入过）。
    this.debugInjected = injected == null ? !!gi : !!injected;
  }

  GetDebugView() { return this.debugView; }

  /** 登记一个子系统自带的调试视图（见 `debugViewProviders`）。 */
  RegisterDebugView(id, resolve) {
    if (id && typeof resolve === "function") this.debugViewProviders.set(id, resolve);
  }

  /** 接一台 LightRig：`sunShadow` 调试视图要采它的阴影图（见 Script_Light）。 */
  SetSunShadowSource(lightRig) { this.debugPass.SetSunShadowSource(lightRig); }

  /**
   * 着色模式：
   *   shaded          正式画面（默认）；
   *   shadedWireframe 正式画面上叠一层三角形边线（进 TAA 与合成，是「带线的正片」）；
   *   wireframe       只画边线：主场景那一趟换成深灰底 + 亮线，`final` 视图改为把
   *                   hdr 靶 0-1 直通送屏 —— 不过曝光、雾、泛光与调色（Unity 的
   *                   Wireframe 也没有后处理），TAA 抖动同时停掉，1 px 的线才不爬。
   * 半透明 / 加性 / 贴片（烟、火、粒子、天空穹）和 `skipNormalDepth` 的东西不进
   * 线框那一趟：它们的材质 `allowOverride === false`，覆盖材质换不掉，再画一遍只会
   * 把加性粒子叠亮一倍。第一人称的手与枪照常出线（深度压缩是节点缩放，不在材质里）。
   */
  SetShadingMode(mode = "shaded") {
    this.shadingMode = SHADING_MODES.includes(mode) ? mode : "shaded";
    this.debugPass.ApplyShadingMode(this.shadingMode);
    return this.shadingMode;
  }

  GetShadingMode() { return this.shadingMode; }

  /** 挂一棵调试叠加层（见构造器里 debugOverlays 的账）。重复挂同一棵是幂等的。 */
  AddDebugOverlay(root) {
    if (root) this.debugOverlays.add(root);
  }

  RemoveDebugOverlay(root) {
    this.debugOverlays.delete(root);
  }

  // --- 兼容层：这几个下划线方法有外部调用点（PostTest / EditorTest），别删 ------
  _GetDebugSource() { return this.debugPass.GetSource(); }
  _CollectWireframeHidden(scene) { return this.debugPass._CollectWireframeHidden(scene); }
  _CollectSkipped(scene, camera = null) { return this.prepassPass._CollectSkipped(scene, camera); }
  _RenderWireframe(scene, camera) {
    this.debugPass.RenderWireframe({ renderer: this.renderer, scene, camera });
  }
  _RenderDebugOverlays(camera, exposure) {
    this.debugPass.RenderOverlays({ renderer: this.renderer, camera, options: { exposure } });
  }
  _Blit(material, target) { this.blitter.Blit(material, target); }

  /** HDR 主场景那一趟（帧图里的 `main`）。 */
  _RenderScene(ctx) {
    const renderer = ctx.renderer;
    renderer.setRenderTarget(this.targets.hdr);
    if (this.shadingMode === "wireframe") {
      // 纯线框：不画着色场景，只留深灰底。深度也清掉 —— 线框没有面可写深度，
      // 所有边全画出来（Unity 的 Wireframe 同样不做隐藏线消除）。
      renderer.setClearColor(WIRE_BACKGROUND_PURE, 1);
      renderer.clear(true, true, false);
    } else {
      renderer.setClearColor(0x000000, 1);
      renderer.clear(true, true, false);
      renderer.render(ctx.scene, ctx.camera);
    }
    ctx.sceneColor = this.targets.hdr;
  }

  /**
   * 跑完整一帧。
   * @param {THREE.Scene} scene
   * @param {THREE.PerspectiveCamera} camera
   * @param {object} options sunDirection / exposure / damage / fade / bloom / godStrength / dt
   */
  Render(scene, camera, options = {}) {
    this.frame += 1;
    const P = this.profiler;
    // FrameContext 必须在抖动写进 projectionMatrix **之前**建：它存的
    // projection / viewProjection 是干净矩阵（速度、运动模糊、太阳投影都要它）。
    const ctx = this.context.Begin(this, scene, camera, options);

    // options.taa === false 是**逐次调用**的 escape hatch（A/B 像素对比测试用），
    // 与面板那一位（taaEnabled）是两回事：前者不动状态，只是这一趟不跑。
    // 纯线框模式也不抖：那一趟的输出绕过 TAA 解算直接送屏，抖动只会让 1 px 的线逐帧爬。
    ctx.taaActive = !!(this.taaEnabled && this.targets.taaA) && options.taa !== false
      && this.shadingMode !== "wireframe";
    // 中断过一趟就丢历史：那几帧没人写历史靶，里面是中断前的旧画面。
    if (!ctx.taaActive && this.taaWasActive) this.hasTaaHistory = false;
    this.taaWasActive = ctx.taaActive;
    this.taaPass.ApplyJitter(ctx);

    ctx.sceneColor = this.targets.hdr;
    for (const pass of this.passes) {
      // 太阳拖影要在亮部提取**之前**定下来（亮部图的 alpha 只在拖影开着时
      // 才顺手打包天空遮挡）。Prepare 跑在 GPU 段之外，不占别人的账。
      pass.Prepare?.(ctx);
      if (pass.Enabled && !pass.Enabled(ctx)) continue;
      // TAA 解算前先把抖动从投影矩阵上摘掉：泛光/雾/运动模糊/太阳投影
      // 拿到的必须是干净矩阵。
      if (pass === this.taaPass) this.taaPass.RemoveJitter(ctx);
      if (P) P.GpuPush(pass.name);
      pass.Render(ctx);
      if (P) P.GpuPop();
    }
    // 兜底：TAA 那一趟万一被跳过（将来有人给它加了别的 Enabled 条件），
    // 抖动也必须从投影矩阵上摘干净 —— 留着的话太阳投影、拾取射线全跟着偏。
    // RemoveJitter 是幂等的（写回同一份 savedProj），重复调一次不花钱。
    this.taaPass.RemoveJitter(ctx);

    // 记录本帧 viewProjection，下一帧的运动模糊与速度缓冲要用
    this.prevViewProjection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this.hasPrev = true;
    // 骨骼上一帧矩阵：本帧的拷进 boneTexture 下半张（口径见 Script_PostPrepass）
    this.prepassPass._SnapshotSkeletons();
  }

  Dispose() {
    for (const pass of this.passes) pass.Dispose?.();
    this.debugPass.Dispose();
    this.pool.Dispose();
    this.targets = {};
    this.bloomMips = [];
    this.debugOverlays.clear();
  }
}
