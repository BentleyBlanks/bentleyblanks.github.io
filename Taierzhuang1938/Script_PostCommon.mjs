// 《台儿庄：血战滕县》后处理帧图的公共地基。
//
// 这个文件里没有任何画面效果，只有八个并行子系统都要用的四样东西：
//   1) 全屏四边形 blit（`Blitter`）与公共 GLSL（`GLSL_COMMON`）；
//   2) 渲染靶工厂与按名字租用的瞬时靶池（`RenderTargetPool`）；
//   3) 一帧的只读上下文（`FrameContext`）—— pass 之间唯一约定的传参方式；
//   4) pass 契约（`Pass` 的 jsdoc，纯约定，不做基类：JS 里继承只会挡住组合）。
//
// ## pass 契约（新增一个 pass 就照这四个方法写）
// ```js
// const pass = {
//   name: "ssr",                       // GPU 分段名，profiler 按它归账
//   Prepare(ctx) {},                   // 可选：出 GPU 段之外先算好本帧参数
//   Enabled(ctx) { return ctx.preset.ssr; },
//   Resize(width, height) {},          // SetSize 时建/重建自己的靶
//   Render(ctx) {},                    // 真正出画
//   Dispose() {},                      // 材质与靶一起还
// };
// ```
// 编排器（`Script_Post.mjs`）持有一张**有序** pass 列表，逐个
// `Enabled → GpuPush(name) → Render → GpuPop`。所以「新增一个 pass」=
// 新模块 + 列表里插一行 + `Data_Tuning_Graphics` 加一位开关，不动别人。
//
// ## 三条不许破的铁律（写在这里是因为每个新 pass 都会撞）
//   · **中间靶一律 `NoColorSpace`**：three 渲进 RenderTarget 时不做 sRGB 编码，
//     最后一趟必须自己手写编码（见 Composite）。
//   · **GLSL ES 3.00 保留字不许当标识符**：`sample` / `filter` / `input` /
//     `output` / `patch` / `resource` / `active` / `common` / `partition`。
//     编译失败 three 只在控制台留一行，那一趟什么都不画 —— 每个展示 pass
//     都必须读回像素验证过才算完。
//   · **抖动/噪声一律由 `ctx.frame` 驱动**，不用 `Math.random`：视觉审查靠逐轮
//     截图比对，画面自己在抖就判断不了「这一版比上一版好」。

import * as THREE from "three";

/** 全屏四边形。整条链共用一份几何与一台正交相机，别各建各的。 */
export const QUAD_GEOMETRY = new THREE.PlaneGeometry(2, 2);
export const QUAD_CAMERA = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

export const VERT_QUAD = /* glsl */`
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

// --- 公共 GLSL 片段 ---------------------------------------------------------
export const GLSL_COMMON = /* glsl */`
float Luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }

// 交错梯度噪声（Jorge Jimenez）：比 hash 噪声在低样本数下更"均匀"，
// 泛光抖动、太阳拖影采样、颗粒都用它。
float Ign(vec2 p) {
  return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715))));
}

float Hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
`;

/**
 * 由屏幕 uv + 线性视深反推视空间坐标。
 * `uProjScale` = (1/tan(fov/2)/aspect, 1/tan(fov/2))，由 FrameContext 每帧算好。
 * SSAO / TAA / Composite / 调试视图四处都在用同一份公式，别再各抄一遍。
 */
export const GLSL_VIEW_POS = /* glsl */`
vec3 ViewPosFromDepth(vec2 uv, float viewDepth, vec2 projScale) {
  vec2 ndc = uv * 2.0 - 1.0;
  return vec3(ndc.x / projScale.x, ndc.y / projScale.y, -1.0) * viewDepth;
}
`;

/** 全屏 pass 的标准材质：不写深度、不测深度、顶点着色器固定。 */
export function MakeFullscreenMaterial(fragmentShader, uniforms, options = {}) {
  return new THREE.ShaderMaterial({
    uniforms,
    vertexShader: VERT_QUAD,
    fragmentShader,
    depthTest: false,
    depthWrite: false,
    glslVersion: options.glslVersion ?? null,
  });
}

/**
 * 建一张中间靶。默认口径：RGBA + 线性过滤 + 无 mipmap + 无深度 + `NoColorSpace`。
 * @param {THREE.WebGLRenderer} renderer 只用来问扩展，不持有
 */
export function MakeRenderTarget(width, height, options = {}) {
  const rt = new THREE.WebGLRenderTarget(Math.max(1, width | 0), Math.max(1, height | 0), {
    type: options.type ?? THREE.HalfFloatType,
    format: options.format ?? THREE.RGBAFormat,
    // magFilter 默认 Linear 而不是跟着 minFilter 走：预通道靶的取样口径
    // （minFilter=Nearest、magFilter=Linear）从来就是这一对，改了 SSAO 的读数就变。
    minFilter: options.minFilter ?? THREE.LinearFilter,
    magFilter: options.magFilter ?? THREE.LinearFilter,
    generateMipmaps: false,
    depthBuffer: options.depthBuffer ?? false,
    stencilBuffer: false,
    samples: options.samples ?? 0,
    count: options.count ?? 1,
  });
  for (const texture of rt.textures) {
    texture.colorSpace = THREE.NoColorSpace;   // 全链路线性，最后一 pass 才转 sRGB
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
  }
  return rt;
}

/**
 * 全屏 blit。持有唯一一份四边形场景 —— 每个 pass 各建一个 Mesh 的话，
 * three 会为每一份重新走一遍 bindingStates。
 */
export class Blitter {
  constructor(renderer) {
    this.renderer = renderer;
    this.scene = new THREE.Scene();
    this.mesh = new THREE.Mesh(QUAD_GEOMETRY, null);
    this.mesh.frustumCulled = false;
    this.scene.add(this.mesh);
  }

  /** 把 material 画满 target（target = null 表示画布）。 */
  Blit(material, target) {
    this.mesh.material = material;
    this.renderer.setRenderTarget(target ?? null);
    this.renderer.render(this.scene, QUAD_CAMERA);
  }
}

/**
 * 按名字租用的渲染靶池。
 *
 * 用途是「瞬时靶」：某个 pass 本帧要一张半分辨率的中转靶，但它不该为此在
 * SetSize 里写一段建靶代码、在 Dispose 里写一段还靶代码 —— 那正是老版
 * `Script_Post.SetSize` 变成一坨的原因。规矩：
 *   · `Rent(name, w, h, options)` 同名同尺寸同格式就复用，否则重建；
 *   · `Resize()` 把整池作废（尺寸变了历史内容也没意义）；
 *   · `Dispose()` 统一释放。
 * **池子里的靶不保证跨帧留内容**（同名同规格时实际上会留，但别依赖它）——
 * 需要跨帧留内容的（TAA 历史、GI 图集）自己持有，别进池。
 */
export class RenderTargetPool {
  constructor() {
    this.entries = new Map();
  }

  Rent(name, width, height, options = {}) {
    const w = Math.max(1, width | 0);
    const h = Math.max(1, height | 0);
    const key = `${options.type ?? THREE.HalfFloatType}|${options.format ?? THREE.RGBAFormat}`
      + `|${options.minFilter ?? THREE.LinearFilter}|${options.samples ?? 0}`
      + `|${options.depthBuffer ? 1 : 0}|${options.count ?? 1}`;
    const existing = this.entries.get(name);
    if (existing && existing.width === w && existing.height === h && existing.key === key) {
      return existing.rt;
    }
    if (existing) existing.rt.dispose();
    const rt = MakeRenderTarget(w, h, options);
    rt.textures[0].name = name;
    this.entries.set(name, { rt, width: w, height: h, key });
    return rt;
  }

  /** 已经租过的那张（没租过返回 null）。 */
  Peek(name) {
    return this.entries.get(name)?.rt ?? null;
  }

  Resize() {
    for (const entry of this.entries.values()) entry.rt.dispose();
    this.entries.clear();
  }

  Dispose() {
    this.Resize();
  }
}

/**
 * 一帧的上下文。**pass 之间唯一约定的传参方式** —— 谁也别去读别人的字段。
 *
 * 矩阵一律是「无抖动」的那一份（`viewProjection` / `prevViewProjection`）：
 * TAA 的子像素抖动只在预通道与主场景那两趟生效，速度、运动模糊、太阳投影
 * 拿到的必须是干净矩阵，否则速度里会混进 ±0.5 像素的抖动噪声。
 *
 * 字段表（新增字段一定要在这里登记，八个并行子系统靠它接线）：
 *   renderer / scene / camera        本帧的三件套
 *   pipeline                         编排器自己（要拿 targets / preset 时用）
 *   preset                           `Data_Tuning_Graphics` 那一档的运行时副本
 *   targets                          编排器持有的具名靶（见 Script_Post.SetSize）
 *   pool                             瞬时靶池（RenderTargetPool）
 *   blitter                          全屏 blit
 *   profiler                         Script_Profiler（可能是 null）
 *   options                          Render() 的第三参，原样透传
 *   frame                            帧序号（所有确定性噪声的种子）
 *   width / height / resolution      主靶尺寸（= **内部分辨率**：预通道/HZB/SSAO/主场景）
 *   outputWidth / outputHeight / outputResolution
 *                                    **输出分辨率**：TAA 之后那几趟（taa / motionBlur /
 *                                    dof / composite / fxaa）的靶尺寸。TAAU 关着时
 *                                    与内部分辨率相等，所以不关心上采样的 pass
 *                                    继续只读 width/height 就对（2026-09 追加）
 *   jitterX / jitterY                本帧 TAA 抖动（像素，未乘 2/width）
 *   taaActive                        本帧 TAA 是否真的在跑
 *   projScale                        (1/tan(fov/2)/aspect, 1/tan(fov/2))
 *   view / projection                本帧无抖动视图 / 投影矩阵
 *   viewProjection                   本帧无抖动 viewProj
 *   prevViewProjection               上一帧无抖动 viewProj（hasPrev=false 时无意义）
 *   invView / invProjection          相机 matrixWorld / 投影逆
 *   hasPrev                          上一帧矩阵可用
 *   sceneColor                       当前「场景颜色」靶（TAA 之后会换成解算靶）
 *   normalDepthTexture               RT0：xyz 视空间法线，w 线性视深
 *   velocityTexture                  RT1：屏幕空间速度（uv），没建时是 null
 *   sceneDepthTexture                预通道的 DepthTexture（HZB / SSR / 体积雾复用）
 *   hzb                              { texture, mipCount, size:[w,h] } 或 null
 *   sunDirection / sunColor          太阳方向（世界，指向太阳）与颜色
 *   exposure                         本帧曝光（Composite 与调试叠加层共用）
 *   godActive / godStrength / sunUv  太阳拖影本帧的判定结果（GodRaysPass.Prepare 写）
 */
export class FrameContext {
  constructor() {
    this.renderer = null;
    this.scene = null;
    this.camera = null;
    this.pipeline = null;
    this.preset = null;
    this.targets = null;
    this.pool = null;
    this.blitter = null;
    this.profiler = null;
    this.options = null;

    this.frame = 0;
    this.width = 2;
    this.height = 2;
    this.resolution = new THREE.Vector2(2, 2);
    // 2026-09 TAAU 追加：输出分辨率（TAA 之后那几趟的靶尺寸）。
    this.outputWidth = 2;
    this.outputHeight = 2;
    this.outputResolution = new THREE.Vector2(2, 2);

    this.jitterX = 0;
    this.jitterY = 0;
    this.taaActive = false;

    this.projScale = new THREE.Vector2(1, 1);
    this.view = new THREE.Matrix4();
    this.projection = new THREE.Matrix4();
    this.viewProjection = new THREE.Matrix4();
    this.prevViewProjection = new THREE.Matrix4();
    this.invView = new THREE.Matrix4();
    this.invProjection = new THREE.Matrix4();
    this.hasPrev = false;

    this.sceneColor = null;
    this.normalDepthTexture = null;
    this.velocityTexture = null;
    this.sceneDepthTexture = null;
    this.hzb = null;

    this.sunDirection = new THREE.Vector3(0, 1, 0);
    this.sunColor = new THREE.Vector3(1, 0.92, 0.78);
    this.exposure = 1;

    this.godActive = false;
    this.godStrength = 0;
    this.sunUv = new THREE.Vector2(0.5, 0.8);
    this.sunNdc = new THREE.Vector3();
  }

  /**
   * 每帧开头由编排器调一次。**必须在抖动写进 projectionMatrix 之前调**：
   * 这里存的 projection / viewProjection 是干净矩阵。
   */
  Begin(pipeline, scene, camera, options) {
    const THREE_MathUtils = THREE.MathUtils;
    this.pipeline = pipeline;
    this.renderer = pipeline.renderer;
    this.scene = scene;
    this.camera = camera;
    this.preset = pipeline.preset;
    this.targets = pipeline.targets;
    this.pool = pipeline.pool;
    this.blitter = pipeline.blitter;
    this.profiler = pipeline.profiler;
    this.options = options;
    // **先把相机的世界矩阵算到本帧**。三方是在 `renderer.render()` 里做这件事的
    // （`camera.parent === null && matrixWorldAutoUpdate` 时调 `updateMatrixWorld`，
    // 它顺带算 `matrixWorldInverse`）。重构前每个 pass 各自在自己那一趟里读矩阵，
    // 所以读到的都是本帧的；现在整帧只在这里读一次，不先更新的话
    // `invView` / `viewProjection` 会**整体落后一帧** —— 表现是速度缓冲恒为 0、
    // 运动模糊少一帧、雾按上一帧的相机位置算。回归口是 PostFrameGraphTest
    // 「相机右移时中心像素速度 x 为负」那一条（它第一次就抓到了这个 bug）。
    if (camera.parent === null && camera.matrixWorldAutoUpdate === true) {
      camera.updateMatrixWorld();
    }
    this.frame = pipeline.frame;
    this.width = pipeline.width;
    this.height = pipeline.height;
    this.resolution.set(pipeline.width, pipeline.height);
    // TAAU 关着时 resolveWidth/Height 就等于内部分辨率，所以这两行对旧 pass 是恒等式。
    this.outputWidth = pipeline.resolveWidth ?? pipeline.width;
    this.outputHeight = pipeline.resolveHeight ?? pipeline.height;
    this.outputResolution.set(this.outputWidth, this.outputHeight);

    const tanHalf = Math.tan(THREE_MathUtils.degToRad(camera.fov * 0.5));
    const projScaleY = 1 / tanHalf;
    this.projScale.set(projScaleY / camera.aspect, projScaleY);

    this.projection.copy(camera.projectionMatrix);
    this.view.copy(camera.matrixWorldInverse);
    this.invView.copy(camera.matrixWorld);
    this.invProjection.copy(camera.projectionMatrixInverse);
    this.viewProjection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this.prevViewProjection.copy(pipeline.prevViewProjection);
    this.hasPrev = pipeline.hasPrev;

    this.godActive = false;
    this.godStrength = 0;
    // 每帧先清掉「上一帧算出来的东西」：pass 关掉之后不该还留着一份陈旧引用，
    // 那种 bug 的表现是「关了开关画面还在动」，极难定位。
    this.hzb = null;
    this.velocityTexture = null;
    return this;
  }
}
