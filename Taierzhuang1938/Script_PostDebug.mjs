// 《台儿庄：血战滕县》渲染调试：中间靶展示 pass、着色模式（线框）、调试叠加层。
//
// 2026-09 帧图重构从 `Script_Post.mjs` 原样搬出，另加一个新视图：
// **SunShadow 采样**（`sunShadow`）—— 用预通道重建世界坐标，走
// `Script_Light.SUN_SHADOW_GLSL` 的 `SunShadowVisibility()` 采一遍太阳阴影。
// 它是那条公共接口的最小验证：CSM 代理把接口换成级联之后，这张图必须还是
// 「有黑有白、边界与画面里的影子对得上」。
//
// **每个展示 pass 必须读回像素验证过才算完**：GLSL ES 3.00 的保留字（sample /
// filter / input / output / patch / resource / active / common / partition）
// 编译失败时 three 只在控制台留一行，那一趟什么都不画，屏幕留着上一次 clear 的
// 颜色 —— 表现是「某个视图恒为纯黑」而正式合成链毫发无损，极难往这里想。
// 这个文件的 FRAG_DEBUG_VIEW 就踩过一次（用了 `sample` 当变量名）。

import * as THREE from "three";
import { MakeFullscreenMaterial } from "./Script_PostCommon.mjs";
import { SUN_SHADOW_GLSL, BindSunShadowUniforms } from "./Script_Light.mjs";

/**
 * 给一份材质的顶点着色器注入「朝相机拉近一点」的深度偏置。
 *
 * 线框叠加与碰撞体线框画的都是**贴在实体表面上的线**：三角形的边就在三角形上，
 * 碰撞盒的棱就在墙面的棱上。按原深度画，线与面的深度逐像素只差舍入误差，
 * 深度测试一半过一半不过，线是一串虚线。`glPolygonOffset` 对 GL_LINES 无效，
 * 所以在视空间把顶点整体往眼睛缩 `pull`（默认 0.3%）：屏幕位置不变（透视除法
 * 抵消），深度在 10 m 处提前 3 cm、100 m 处 30 cm —— 远大于 24 位深度缓冲在
 * 这些距离上的量化步长，又小到不会把墙后一步远的线漏出来。
 * 常数 NDC 偏置不行：它在 100 m 处等价于十米，墙后面整条街的线都会透出来。
 *
 * 只动 `project_vertex` 这一段，蒙皮/实例化/BatchedMesh 的矩阵链照走 three 自己的。
 */
export function InjectDepthPull(material, pull = 0.003) {
  const scale = (1 - pull).toFixed(5);
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace("#include <project_vertex>", /* glsl */`
      vec4 mvPosition = vec4( transformed, 1.0 );
      #ifdef USE_BATCHING
        mvPosition = batchingMatrix * mvPosition;
      #endif
      #ifdef USE_INSTANCING
        mvPosition = instanceMatrix * mvPosition;
      #endif
      mvPosition = modelViewMatrix * mvPosition;
      mvPosition.xyz *= ${scale};
      gl_Position = projectionMatrix * mvPosition;`);
  };
  material.customProgramCacheKey = () => `depthPull:${scale}`;
  return material;
}

/** 着色模式（Unity Scene 视图的 Shading Mode 那三档）。 */
export const SHADING_MODES = ["shaded", "wireframe", "shadedWireframe"];

/**
 * 线框覆盖材质：整场共用一份，靠 `scene.overrideMaterial` 换上去。
 *
 * 用 MeshBasicMaterial 而不是自写 ShaderMaterial：three 按**对象**决定蒙皮/实例化/
 * 形变宏（`object.isSkinnedMesh` 等），内置材质当覆盖材质时人物、合批实例、
 * 第一人称都能正确出线 —— 预通道的 normalDepthMaterial 走的是同一条路。
 * 线色偏暗、带透明度：叠在正式画面上是「压暗的边」，不是「发光的网」。
 * 纯线框模式下背景另清成深灰，同一份材质靠 `uniforms.opacity` 不变、
 * 只换 `color` 提亮（见 SetShadingMode）。
 */
function MakeWireframeMaterial() {
  const material = new THREE.MeshBasicMaterial({
    wireframe: true, color: 0x000000, transparent: true, opacity: 0.55,
    depthTest: true, depthWrite: false, toneMapped: false, fog: false,
  });
  material.name = "DebugWireframeOverride";
  return InjectDepthPull(material, 0.002);
}
/** 「着色线框」的线色（线性）：接近黑，叠上去是压暗的边。 */
const WIRE_COLOR_SHADED = new THREE.Color(0.01, 0.012, 0.016);
/** 「线框」的线色与底色（线性）：走 0-1 直通送屏，不过曝光与调色。 */
const WIRE_COLOR_PURE = new THREE.Color(0.72, 0.75, 0.70);
export const WIRE_BACKGROUND_PURE = new THREE.Color(0.048, 0.052, 0.060);

// 渲染调试页的专用展示 pass。所有中间靶都保持在线性/HDR 空间，不能直接
// Copy 到屏幕：法线会偏暗、辐照度图集会一片白，深度更是只剩黑。这里按
// 类型做最小限度的可读化，不改变任何供正式合成使用的纹理。
const FRAG_DEBUG_VIEW = /* glsl */`
  uniform sampler2D uSource;
  uniform float uMode;
  uniform float uUnavailable;
  uniform mat4 uInvView;
  uniform vec2 uProjScale;
  uniform float uFogDensity;
  uniform float uFogFalloff;
  uniform float uFogBase;
  uniform float uFogMax;
  uniform float uDofStrength;
  uniform float uDofFocus;
  uniform float uDofRange;
  uniform float uNearDofStrength;
  uniform float uNearDofFocus;
  uniform float uNearDofRange;
  uniform mat4 uPrevViewProjection;
  uniform vec2 uResolution;
  uniform float uHasPrev;
  varying vec2 vUv;

  vec3 ToSrgb(vec3 c) {
    return pow(max(c, vec3(0.0)), vec3(1.0 / 2.2));
  }

  void main() {
    if (uUnavailable > 0.5) {
      float stripe = step(0.5, fract((vUv.x + vUv.y) * 22.0));
      gl_FragColor = vec4(mix(vec3(0.12, 0.012, 0.018), vec3(0.55, 0.03, 0.08), stripe), 1.0);
      return;
    }
    // 变量名不许叫 sample。three 从 r163 起把所有 ShaderMaterial 都按
    // GLSL ES 3.00（#version 300 es）编译，而 sample 在 3.00 里是保留字：
    // 编译直接报 Illegal use of reserved word。整个 pass 编译不过时 three 只在
    // 控制台留一行 Shader Error，屏幕上这一趟什么都不画 —— 表现就是
    // 「调试面板每一个视图都是纯黑」，而正式合成链毫发无损，极难往这里想。
    vec4 texel = texture2D(uSource, vUv);
    vec3 color = texel.rgb;
    if (uMode < 0.5) {                 // 法线：[-1, 1] -> [0, 1]
      color = color * 0.5 + 0.5;
    } else if (uMode < 1.5) {          // 线性视深：近亮、远暗，80m 对应黑
      float depth = 1.0 - clamp(texel.a / 80.0, 0.0, 1.0);
      color = vec3(depth);
    } else if (uMode < 2.5) {          // AO 本来就是可显示的遮蔽量
      color = vec3(texel.r);
    } else if (uMode < 3.5) {          // 距离图集：均值 / 不确定度 = R / G
      color = vec3(texel.r, texel.g, 0.0);
    } else if (uMode < 4.5) {          // HDR / 辐照度：Reinhard + sRGB
      color = color / (color + vec3(1.0));
      color = ToSrgb(color);
    } else if (uMode < 5.5) {          // 材质通道假彩色：0-1 数据，只做 sRGB 编码。
      // 走 Reinhard 会把 0.5 的粗糙度压成 0.33，读数就不准了；
      // 天空穹没被注入、还是 HDR 亮度，pow 后钳到白 —— 当背景正合适。
      color = ToSrgb(color);
    } else if (uMode < 6.5) {          // 雾量：严格复算 Composite 的距离 × 高度系数。
      float fog = 0.0;
      if (texel.a > 0.0 && uFogDensity > 0.0) {
        vec2 ndc = vUv * 2.0 - 1.0;
        vec3 viewPos = vec3(ndc.x / max(uProjScale.x, 0.0001),
                            ndc.y / max(uProjScale.y, 0.0001), -1.0) * texel.a;
        vec4 worldPos = uInvView * vec4(viewPos, 1.0);
        float distanceFog = 1.0 - exp(-texel.a * uFogDensity);
        float heightFog = exp(-max(worldPos.y - uFogBase, 0.0) / max(uFogFalloff, 0.5));
        fog = clamp(distanceFog * heightFog, 0.0, uFogMax);
      }
      // 雾本身可能接近灰色，直接看它不容易看出系数；假彩色才看得见断层和高度带。
      color = mix(vec3(0.015, 0.035, 0.18), vec3(1.0, 0.63, 0.04), fog);
      color = ToSrgb(color);
    } else if (uMode < 7.5) {          // 景深 CoC：严格复算 Composite 的近/远散焦系数。
      float farCoc = texel.a <= 0.0 ? 1.0
        : smoothstep(uDofFocus, uDofFocus + max(uDofRange, 0.01), texel.a);
      farCoc *= uDofStrength;
      float nearStart = max(0.0, uNearDofFocus - max(uNearDofRange, 0.01));
      float nearCoc = texel.a <= 0.0 ? 0.0
        : 1.0 - smoothstep(nearStart, uNearDofFocus, texel.a);
      nearCoc *= uNearDofStrength;
      float coc = max(farCoc, nearCoc);
      // 即使两条景深都没触发也保留深蓝底，避免「全黑」被误判成展示 pass 没出画。
      color = mix(vec3(0.015, 0.06, 0.30), vec3(1.0, 0.72, 0.04), clamp(coc, 0.0, 1.0));
      color = ToSrgb(color);
    } else if (uMode < 8.5) {          // Motion Vector：与 TAA 同一套深度反投影相机速度。
      // 没有逐物体 velocity buffer；这张图如实展示运动模糊/TAA 实际使用的速度近似。
      float depth = texel.a <= 0.0 ? 400.0 : texel.a;
      vec2 ndc = vUv * 2.0 - 1.0;
      vec3 viewPos = vec3(ndc.x / max(uProjScale.x, 0.0001),
                          ndc.y / max(uProjScale.y, 0.0001), -1.0) * depth;
      vec4 worldPos = uInvView * vec4(viewPos, 1.0);
      vec4 prevClip = uPrevViewProjection * worldPos;
      vec2 prevUv = (prevClip.xy / max(abs(prevClip.w), 0.0001)) * 0.5 + 0.5;
      vec2 velocityPx = (vUv - prevUv) * uResolution;
      if (uHasPrev < 0.5 || prevClip.w <= 0.0) velocityPx = vec2(0.0);
      vec2 encodedDirection = clamp(velocityPx / 32.0, vec2(-1.0), vec2(1.0));
      color = vec3(0.5 + encodedDirection.x * 0.5,
                   0.5 + encodedDirection.y * 0.5,
                   clamp(length(velocityPx) / 32.0, 0.0, 1.0));
    } else {                           // 速度缓冲（预通道 RT1，单位 uv）：与上面同一套编码。
      vec2 velocityPx = texel.rg * uResolution;
      vec2 encodedDirection = clamp(velocityPx / 32.0, vec2(-1.0), vec2(1.0));
      color = vec3(0.5 + encodedDirection.x * 0.5,
                   0.5 + encodedDirection.y * 0.5,
                   clamp(length(velocityPx) / 32.0, 0.0, 1.0));
    }
    gl_FragColor = vec4(color, 1.0);
  }`;

// 太阳阴影采样的最小验证图：拿预通道重建世界坐标 + 世界法线，
// 走 Script_Light 的公共接口采一遍。**CSM 代理换接口之后这张图必须照旧能用。**
const FRAG_SUN_SHADOW_VIEW = /* glsl */`
  uniform sampler2D uNormalDepth;
  uniform mat4 uInvView;
  uniform vec2 uProjScale;
  varying vec2 vUv;
${SUN_SHADOW_GLSL}
  void main() {
    vec4 nd = texture2D(uNormalDepth, vUv);
    if (nd.w <= 0.0) {                     // 天空：不采阴影，画成深蓝底
      gl_FragColor = vec4(0.05, 0.09, 0.20, 1.0);
      return;
    }
    vec2 ndc = vUv * 2.0 - 1.0;
    vec3 viewPos = vec3(ndc.x / max(uProjScale.x, 0.0001),
                        ndc.y / max(uProjScale.y, 0.0001), -1.0) * nd.w;
    vec3 worldPos = (uInvView * vec4(viewPos, 1.0)).xyz;
    vec3 worldNormal = normalize(mat3(uInvView) * normalize(nd.xyz));
    float visibility = SunShadowVisibility(worldPos, worldNormal);
    gl_FragColor = vec4(vec3(visibility), 1.0);
  }`;

export class DebugPass {
  constructor(pipeline) {
    this.name = "debug";
    this.pipeline = pipeline;
    this.wireframeMaterial = MakeWireframeMaterial();
    this._wireScratch = [];            // _CollectWireframeHidden 的复用数组
    this.uniforms = {
      uSource: { value: null }, uMode: { value: 4 }, uUnavailable: { value: 0 },
      uInvView: { value: new THREE.Matrix4() }, uProjScale: { value: new THREE.Vector2(1, 1) },
      uFogDensity: { value: 0 }, uFogFalloff: { value: 18 }, uFogBase: { value: 0 }, uFogMax: { value: 0.94 },
      uDofStrength: { value: 0 }, uDofFocus: { value: 1.5 }, uDofRange: { value: 2.8 },
      uNearDofStrength: { value: 0 }, uNearDofFocus: { value: 1.6 }, uNearDofRange: { value: 0.85 },
      uPrevViewProjection: { value: new THREE.Matrix4() }, uResolution: { value: new THREE.Vector2(1, 1) }, uHasPrev: { value: 0 },
    };
    this.material = MakeFullscreenMaterial(FRAG_DEBUG_VIEW, this.uniforms);
    this.uniformsSunShadow = {
      uNormalDepth: { value: null },
      uInvView: { value: new THREE.Matrix4() },
      uProjScale: { value: new THREE.Vector2(1, 1) },
    };
    BindSunShadowUniforms(this.uniformsSunShadow, null);
    this.materialSunShadow = MakeFullscreenMaterial(FRAG_SUN_SHADOW_VIEW, this.uniformsSunShadow);
    this.sunShadowRig = null;
    /**
     * 子系统自带的调试视图。
     *
     * 下面 `GetSource()` 那张 switch 表只认这个文件里的靶；八个并行子系统各自
     * 有自己的中间产物（自动曝光的直方图、光晕靶、体积雾的 froxel …），它们的
     * 材质与 uniform 都住在自己的模块里，硬塞进这张 switch 只会让这个文件
     * 变成所有人的公共垃圾场。
     *
     * 契约：`RegisterView(id, resolver)`，resolver 收 pipeline、返回
     *   { texture, mode, unavailable }                  —— 走通用展示 pass；
     *   { material, Prepare?(ctx), unavailable }         —— 自带材质，直接送屏。
     * 面板那一侧（Script_EditorDebugRendering 的 VIEWS）也要有对应一行。
     */
    this.extraViews = new Map();
  }

  /** 登记一个子系统自带的调试视图（见 extraViews 的契约）。 */
  RegisterView(id, resolver) {
    if (id && typeof resolver === "function") this.extraViews.set(id, resolver);
  }

  Resize() { /* 没有自己的靶 */ }

  /** 接一台 LightRig，`sunShadow` 调试视图才有阴影图可采。 */
  SetSunShadowSource(lightRig) {
    if (this.sunShadowRig && this.sunShadowRig !== lightRig) {
      this.sunShadowRig.UnregisterShadowUniforms?.(this.uniformsSunShadow);
    }
    this.sunShadowRig = lightRig || null;
    BindSunShadowUniforms(this.uniformsSunShadow, lightRig);
  }

  /**
   * 线框那一趟要藏掉的对象：覆盖材质换不掉的（allowOverride=false：粒子、烟、天空穹、
   * 水面之类自带着色器的）、显式 skipNormalDepth 的，以及 Points / Sprite / Line ——
   * 后三类几何属性对不上 MeshBasicMaterial 的顶点着色器（预通道那次事故就是它们）。
   * 只收当前可见的：本来就藏着的不该被这里"帮忙"打开。
   */
  _CollectWireframeHidden(scene) {
    const list = this._wireScratch;
    list.length = 0;
    scene.traverse((object) => {
      if (!object.visible) return;
      if (object.userData?.skipNormalDepth) { list.push(object); return; }
      if (object.isPoints || object.isSprite || object.isLine) { list.push(object); return; }
      if (!object.isMesh || !object.material) return;
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      if (materials.some((material) => material && material.allowOverride === false)) list.push(object);
    });
    return list;
  }

  /** 用线框覆盖材质把场景再画一遍进当前靶（不清屏，吃主场景留下的深度）。 */
  RenderWireframe(ctx) {
    const renderer = ctx.renderer;
    const scene = ctx.scene;
    const hidden = this._CollectWireframeHidden(scene);
    for (const object of hidden) object.visible = false;
    const prevBackground = scene.background;
    const prevOverride = scene.overrideMaterial;
    const prevAutoClear = renderer.autoClear;
    scene.background = null;
    scene.overrideMaterial = this.wireframeMaterial;
    renderer.autoClear = false;
    try {
      renderer.render(scene, ctx.camera);
    } finally {
      renderer.autoClear = prevAutoClear;
      scene.overrideMaterial = prevOverride;
      scene.background = prevBackground;
      for (const object of hidden) object.visible = true;
    }
  }

  /** 调试叠加层：与主场景同一张 hdr 靶、同一份深度，画在 TAA 之前。 */
  RenderOverlays(ctx) {
    const renderer = ctx.renderer;
    const exposure = ctx.options.exposure ?? 1.0;
    const prevAutoClear = renderer.autoClear;
    renderer.autoClear = false;
    try {
      for (const root of this.pipeline.debugOverlays) {
        if (!root.visible) continue;
        root.userData?.PrepareDebugOverlay?.({ exposure });
        renderer.render(root, ctx.camera);
      }
    } finally {
      renderer.autoClear = prevAutoClear;
    }
  }

  /** 着色模式改线色（`shaded` 之外那两档共用一份材质，只换 color/opacity）。 */
  ApplyShadingMode(mode) {
    const material = this.wireframeMaterial;
    if (mode === "wireframe") {
      material.color.copy(WIRE_COLOR_PURE);
      material.opacity = 1;
    } else {
      material.color.copy(WIRE_COLOR_SHADED);
      material.opacity = 0.55;
    }
  }

  GetSource() {
    const P = this.pipeline;
    const T = P.targets;
    // 纯线框：主场景靶里就是「深灰底 + 亮线」，直接 0-1 直通送屏。别走合成 ——
    // 雾会把远处的线整片抹成雾色、暗角与颗粒叠在线框上只是噪声。
    // 其它视图（GBuffer / AO / 材质假彩色 …）不受着色模式影响，照常各看各的靶。
    if (P.debugView === "final" && P.shadingMode === "wireframe") {
      return { texture: T.hdr.texture, mode: 5 };
    }
    switch (P.debugView) {
      case "normal": return { texture: T.normalDepth.texture, mode: 0 };
      case "depth": return { texture: T.normalDepth.texture, mode: 1 };
      case "ao": return { texture: T.ao.texture, mode: 2, unavailable: !P.preset.ssao };
      case "aoBlur": return { texture: T.aoBlur.texture, mode: 2, unavailable: !P.preset.ssao };
      case "hdr": return { texture: T.hdr.texture, mode: 4 };
      // Bloom 提取与最终合成分开看：前者用于判断阈值/软膝是否切掉了该进的亮部，
      // 后者用于判断多级 tent 叠加后的覆盖范围和强度。
      case "bloomExtract": return { texture: T.bright.texture, mode: 4 };
      // 送屏的要与合成 pass 真正吃的是同一张（见 uBloom 那一行）：bloomMips[0]
      // 只是第 0 级的降采样，还没叠上更小几级的 tent 放大，看着比实际泛光弱一大截。
      case "bloom": return { texture: P.BloomTarget?.texture, mode: 4 };
      // 这两项没有独立 RT：Debug pass 从与 Composite 同一张 NormalDepth 靶取深度，
      // 用同一套 uniforms 实时重算效果系数。这样不会为纯调试多占一张全分辨率显存靶。
      case "fog": return { texture: T.normalDepth.texture, mode: 6 };
      case "dof": return { texture: T.normalDepth.texture, mode: 7 };
      case "motionVector": return { texture: T.normalDepth.texture, mode: 8 };
      // 2026-09 新增：预通道 RT1 的逐物体速度靶本尊（上面那张是深度反投影的近似）。
      case "velocity": return {
        texture: P.prepassPass.velocityTexture, mode: 9,
        unavailable: !P.prepassPass.velocityTexture,
      };
      // 2026-09 新增：太阳阴影采样接口的最小验证图（CSM 代理换接口后必须照旧可用）。
      case "sunShadow": return {
        material: this.materialSunShadow, unavailable: !this.sunShadowRig?.sun?.shadow?.map,
        texture: T.normalDepth.texture, mode: 0,
      };
      // enabled 为 false 时图集是上一次收敛留下的陈旧内容，或者干脆一片全黑
      // （画质档从没开过 GI 就是这一种）。这种情况要显式报"不可用"斜纹，
      // 而不是把一张黑图送到屏幕上 —— 后者跟"渲染坏了"长得一模一样。
      case "giIrradiance": return {
        texture: P.debugGi?.irradiance?.[P.debugGi.pingPong]?.texture,
        mode: 4, unavailable: !P.debugGi?.enabled,
      };
      case "giDistance": return {
        texture: P.debugGi?.distanceMoments?.[P.debugGi.pingPong]?.texture,
        mode: 3, unavailable: !P.debugGi?.enabled,
      };
      // 材质通道假彩色：真正的换色发生在材质注入里（Script_MaterialPatches 按
      // uGiDebugView 把该通道当颜色写进 hdr 靶），这里只负责把 hdr 靶
      // 以 0-1 直通模式送屏。谁设 uGiDebugView：Debug Rendering 面板
      // （SetView 同步材质 uniform 与这里的视图名）或 ?giView= 直连。
      // 可用性看 debugInjected（材质里有没有调试层）：low 档材质没有注入，
      // 屏幕上会是原样 HDR，画不可用斜纹。GI 出厂默认关（2026-08-26 起）时
      // ProbeVolume 不构造，但调试层照样编在材质里 —— 这些视图必须照常能用，
      // 所以不能再拿 debugGi 缺席当"未注入"的代理。
      case "baseColor": case "roughness": case "metalness": case "shadow":
        return { texture: T.hdr.texture, mode: 5, unavailable: !P.debugInjected };
      // 光照分量是线性 HDR；沿用 hdr 的 Reinhard + sRGB 可视化，别把高亮全钳白。
      case "diffuseLighting": case "specularLighting": case "reflection": case "indirectLighting":
        return { texture: T.hdr.texture, mode: 4, unavailable: !P.debugInjected };
      // GI 的世界空间视图同理只要求材质注入过：探针体关着时 giWorld 显示的
      // 是材质**实际在用**的间接辐照度（天空 IBL 回退），giConfidence 恒 0
      // （黑 = 没有探针 GI）—— 都是准确信息，不是"不可用"。
      case "giWorld": case "giConfidence":
        return { texture: T.hdr.texture, mode: 5, unavailable: !P.debugInjected };
      default: {
        // 子系统自带的视图（自动曝光直方图、镜头光晕、LUT 校验 …）
        const resolver = this.extraViews.get(P.debugView);
        return resolver ? (resolver(P) || null) : null;
      }
    }
  }

  /** 把选中的中间靶送屏。参数是 GetSource() 的返回值。 */
  RenderView(ctx, source) {
    const P = this.pipeline;
    const U = this.uniforms;
    const C = P.compositePass.uniforms;
    if (source.material === this.materialSunShadow && !source.unavailable) {
      const S = this.uniformsSunShadow;
      S.uNormalDepth.value = ctx.normalDepthTexture;
      S.uInvView.value.copy(ctx.invView);
      S.uProjScale.value.copy(ctx.projScale);
      // 阴影框每帧都在滚（跟玩家 + 吸附纹素），矩阵必须现取。
      this.sunShadowRig?.SyncShadowUniforms?.();
      ctx.blitter.Blit(this.materialSunShadow, null);
      return;
    }
    // 子系统自带材质的视图：本帧参数由它自己在 Prepare 里摆，这里只负责送屏。
    if (source.material && !source.unavailable) {
      source.Prepare?.(ctx);
      ctx.blitter.Blit(source.material, null);
      return;
    }
    // 雾量 / CoC 调试视图必须复用刚刚送进 Composite 的本帧参数。不要另存一份
    // "调试参数"：时段预设切换一帧后两份数字就会分叉，面板反而成了假信息。
    U.uInvView.value.copy(C.uInvView.value);
    U.uProjScale.value.copy(C.uProjScale.value);
    U.uFogDensity.value = C.uFogDensity.value;
    U.uFogFalloff.value = C.uFogFalloff.value;
    U.uFogBase.value = C.uFogBase.value;
    U.uFogMax.value = C.uFogMax.value;
    U.uDofStrength.value = C.uDofStrength.value;
    U.uDofFocus.value = C.uDofFocus.value;
    U.uDofRange.value = C.uDofRange.value;
    U.uNearDofStrength.value = C.uNearDofStrength.value;
    U.uNearDofFocus.value = C.uNearDofFocus.value;
    U.uNearDofRange.value = C.uNearDofRange.value;
    U.uPrevViewProjection.value.copy(C.uPrevViewProjection.value);
    U.uResolution.value.copy(C.uResolution.value);
    U.uHasPrev.value = P.hasPrev ? 1 : 0;
    U.uSource.value = source.texture || P.targets.ldr.texture;
    U.uMode.value = source.mode;
    U.uUnavailable.value = source.unavailable || !source.texture ? 1 : 0;
    ctx.blitter.Blit(this.material, null);
  }

  Dispose() {
    this.material.dispose();
    this.materialSunShadow.dispose();
    this.wireframeMaterial.dispose();
  }
}
