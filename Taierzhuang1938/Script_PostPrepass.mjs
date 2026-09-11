// 《台儿庄：血战滕县》深度法线预通道（MRT）+ 速度缓冲 + HZB。
//
// 这一趟是整条链的**几何真相**：AO、TAA、运动模糊、景深、雾、粒子软化、水面、
// 调试视图全部从它读几何。2026-09 帧图重构把它从单靶升成 MRT：
//
//   RT0  RGBA16F  xyz = 视空间法线，w = 线性视深（**与重构前逐比特相同**）
//   RT1  RG16F    屏幕空间速度（单位 uv，= 本帧 uv − 上一帧 uv）
//   depth DepthTexture（DEPTH_COMPONENT24）—— HZB / 将来的 SSR / 体积雾复用
//
// ## 速度的口径（改这里之前先读完）
//   · **用无抖动的两帧 viewProjection 算**。拿 gl_Position 算的话 TAA 的
//     ±0.5 像素子像素抖动会整个漏进速度里，运动模糊每帧抖一下。
//   · 单位是 uv 不是像素：消费方自己乘分辨率。
//   · 第一帧（`uVelocityValid = 0`）与前景件（`uForegroundDepth > 0`）一律写 0。
//     枪绝不能糊 —— 视模带一层非等比深度压缩，按它自己的视差算速度会把开镜时
//     正在瞄的那支枪拖成一片。
//   · 天空穹整只 `skipNormalDepth` 藏出这一趟，所以 RT1 在天空位置留的是 clear 值 0。
//
// ## 逐物体速度做到哪一步（**已知近似，别当 bug**）
//   · **蒙皮人物：真的逐骨骼**。做法见下面 `_UpgradeSkeleton`：把 three 的
//     `skeleton.boneTexture` 换成一张**高度翻倍**的图，上半是本帧骨矩阵（three 自己
//     每帧写），下半是上一帧的副本（本模块在 Render 末尾 copyWithin 一次）。
//     好处是**零逐 draw 成本** —— `boneTexture` 是 three 在 `setProgram` 里
//     逐 draw 用 `p_uniforms.setValue` 塞的，本来就每次都传；换成自定义 uniform 就得
//     `material.uniformsNeedUpdate = true`，那会把整份材质 uniform（含 24 组破口
//     数组）在每个蒙皮 draw 上重传一遍，正好撞在「CPU 提交是瓶颈」那条红线上。
//     取样端 `GetPrevBoneMatrix(i)` 就是 three 的 `getBoneMatrix(i)` 把纹素下标
//     加一个 `size*size`（= 整整 size 行），列不变、行 +size，落在下半张。
//     显存与上传：一具 50 骨的骨骼 three 原本按 16×16 RGBA32F 算（4 KB），翻倍成
//     16×32（8 KB）。本关 69 名士兵满编 ≈ 0.55 MB/帧上传（原来 0.28 MB）。
//   · **静态几何 / InstancedMesh / BatchedMesh：只有相机速度**（把实例矩阵当不变）。
//     2026-09 复量：本关 161 只 InstancedMesh / 2467 个实例，再挂一份上一帧
//     instanceMatrix 只要 0.151 MB —— 显存不是拦路石，「覆盖材质全场只有一份」才是
//     （自定义属性的 define 是材质级不是对象级，缺属性的那只会静默塌到原点）。
//     详见 docs/Data_TechRenderPipeline.md §17.10。
//     `Script_ActorBatch` 与布设流送每帧改写 `instanceMatrix`，所以**远景人群与
//     会动的布设件在 RT1 里是「静止物体」**。要修得给每只 InstancedMesh 再挂一份
//     上一帧 `instanceMatrix` 属性（显存翻倍 + 每帧多一次上传），本阶段不做。
//   · **普通刚体 Mesh 默认记录上一帧世界矩阵**，包括骨骼附件、异步新建道具。
//     由覆盖材质的 onBeforeRender 统一绑定，不要求调用方逐件打标、不占对象钩子。
//     只有矩阵实际变化时上传上一帧矩阵；静态物体仍走相机速度的快速路径。
//     InstancedMesh / BatchedMesh 的逐实例形变仍不在此契约内，近景移动交互件用
//     身份稳定的普通 Mesh（如车厢背包、弹药）；不能把组矩阵当成逐实例历史。
//
// ## HZB
// 预通道之后按 max-reduce 建一条线性视深金字塔（RGBA16F，四个通道同值）：
// `levels[0]` 是半分辨率，
// 之后每级再折半，直到短边 < `HZB.minSize`。天空（w ≤ 0）按 `uFar` 记，
// 于是每一级都是它覆盖区域的**最远**视深，逐级单调不减。
// 全分辨率那一级不另存 —— 它就是 RT0 的 w 通道（`hzb.source`）。
//
// 为什么不是 R16F（省四分之三显存与带宽）：`readRenderTargetPixels` 只保证
// RGBA + UnsignedByte/HalfFloat/Float 可读，R16F 要靠 IMPLEMENTATION_COLOR_READ_FORMAT
// 碰运气。地基这一轮先要「测得动」，SSR 落地时若带宽吃紧再换格式并同步改回归口。
// 3394×1348 下整条链约 12 MB（level0 = 1697×674×8 B）。
//
// 每级不是一张纹理的一个 mip，而是**各自一张 RT**（`hzb.levels[i]`）：three 的
// mip-level 渲染要靠 texture.mipmaps + scratch framebuffer + 每级改 viewport，
// 任何一处错都是静默全黑。消费方要 textureLod 的话在自己那一轮再换。

import * as THREE from "three";
import { BindDestructionUniforms, DestructionShaderGlsl } from "./Script_Destruction.mjs";
import { MakeFullscreenMaterial, MakeRenderTarget, GLSL_COMMON } from "./Script_PostCommon.mjs";
import { HZB, VELOCITY } from "./Data_Tuning_Graphics.mjs";

/**
 * 前景（第一人称手 / 枪）在预通道里的**常数近景深度**。
 *
 * 视图模型带一层非等比的深度压缩，它的视深不是世界视深（枪口在眼前 0.2 m，
 * 枪托在眼睛后面）。真按它自己的视深写进 rtNormalDepth，下游全按"贴脸的实体"
 * 处理：开镜近景 DOF（focus 1.60 m）把正在瞄的枪整支糊掉、相机运动模糊按 0.2 m
 * 的视差把枪拖成一片、SSAO 在枪身边缘挖黑边。Composite 那边写死的口径就是
 * "视图模型等价于稳定的 1 m 近景标签"（见近景 CoC 那一段），这里把它做实。
 */
export const FOREGROUND_VIEW_DEPTH = 1.0;

/**
 * 把一份材质排除在深度法线预通道之外。
 *
 * 事故根源：r165 起 `scene.overrideMaterial` 加了 `material.allowOverride` 闸门，
 * 默认 **true** —— 也就是说粒子、贴片（Sprite/Points）、烟、天空穹全都会被
 * 覆盖材质换掉。它们的几何属性对不上覆盖材质的顶点着色器，预通道里就蹦出
 * 一堆糊在原点的方块，SSAO 与太阳拖影的天空判据跟着一起废。
 *
 * 规矩：**任何半透明的、加性混合的、billboard 的东西，建完材质立刻调这个。**
 *
 * 但要清楚它到此为止：allowOverride = false 只是"不换材质"，对象**照样会被画进
 * 预通道**，只是用的是它自己的着色器 —— 于是 rtNormalDepth 的 xyz 收到的是它的
 * 颜色、w 收到的是它的 alpha。半透明小片子影响有限，铺满全屏的东西（天空穹）
 * 就会把整片天空的 w 写成 1.0，下游一律误判成"一米外有实体"。
 * 覆盖大片屏幕的，还要给对象挂 `userData.skipNormalDepth = true`，
 * PostPipeline 那一趟会把它整个藏掉。
 */
export function MarkNoPrepass(material) {
  if (!material) return material;
  if (Array.isArray(material)) { material.forEach(MarkNoPrepass); return material; }
  material.allowOverride = false;
  return material;
}

// 覆盖材质是全场共用的一份，uniform 按 draw 上传（three 在 renderObject 里先调
// onBeforeRender 再 setProgram）—— 与破口裁切那一套是同一个手法。
function ForegroundPrepassOn(renderer, scene, camera, geometry, material) {
  const uniform = material?.userData?.foregroundDepth;
  if (uniform) uniform.value = FOREGROUND_VIEW_DEPTH;
}
function ForegroundPrepassOff(renderer, scene, camera, geometry, material) {
  const uniform = material?.userData?.foregroundDepth;
  if (uniform) uniform.value = 0;
}

/**
 * 把一棵前景子树（`viewmodel.root`）接进深度法线预通道。
 *
 * 以前这里调的是 MarkNoPrepass，但那**不是**"不进预通道"：allowOverride = false
 * 只是不换材质，物体照样被画进 rtNormalDepth，写进去的 xyz 是它自己的**光照颜色**
 * （当法线用是纯垃圾，SSAO 直接读错）、w 是它的不透明度。于是 Debug Rendering 的
 * 法线/视深/AO 三组视图里，第一人称要么是一团噪声要么整块缺失。
 *
 * 现在的口径：
 *   · 不透明件 —— 照常吃覆盖材质，写**真法线** + FOREGROUND_VIEW_DEPTH 常数深度，
 *     速度写 0（枪不许糊）；
 *   · 半透明/加性件（枪口焰）—— 仍旧整只藏出预通道（skipNormalDepth），
 *     它没有可用的法线，混进去只会污染 SSAO。
 *
 * 每次 Equip 之后都要再调一次：枪械树是 Equip 里现建的。
 */
export function MarkForegroundPrepass(root) {
  if (!root) return root;
  root.traverse((object) => {
    if (!object.isMesh || !object.material) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    const translucent = materials.some((material) => material
      && (material.transparent || material.alphaTest > 0 || material.depthWrite === false));
    if (translucent) {
      MarkNoPrepass(object.material);
      object.userData.skipNormalDepth = true;
      object.userData.foregroundPrepass = false;
      return;
    }
    for (const material of materials) if (material) material.allowOverride = true;
    object.userData.skipNormalDepth = false;
    object.userData.foregroundPrepass = true;
    // 视图模型的网格没有别的 onBeforeRender 用户（破口裁切只挂在世界静态件上），
    // 直接赋值即可，重复调用是幂等的。
    object.onBeforeRender = ForegroundPrepassOn;
    object.onAfterRender = ForegroundPrepassOff;
  });
  return root;
}

// ---------------------------------------------------------------------------
// 深度法线预通道用的覆盖材质
// 用 three 的 chunk 拼，USE_INSTANCING / USE_SKINNING / 形变这些分支交给它自己处理，
// 不然实例化的瓦砾会塌到原点，蒙皮人物会留在绑定姿势，AO / TAA / 运动模糊一起读错。
//
// MRT 的两条硬要求（漏一条 three 只在控制台留一行，整趟不画）：
//   · `glslVersion: THREE.GLSL3`；
//   · 自己写 `layout(location = N) out vec4` —— 不设 glslVersion 的话 three 会注入
//     `layout(location = 0) out highp vec4 pc_fragColor` 并 `#define gl_FragColor`，
//     第二个 out 要么冲突要么永远写不出去。
// 非 Raw 材质本来就永远是 `#version 300 es`，`#include <chunk>` 与 `varying` 照常可用。
// ---------------------------------------------------------------------------
function MakeNormalDepthMaterial(destruction = null, { velocity = false } = {}) {
  const uniforms = {
    uFar: { value: 500 },
    uForegroundDepth: { value: 0 },
  };
  if (velocity) {
    uniforms.uViewProjection = { value: new THREE.Matrix4() };
    uniforms.uPrevViewProjection = { value: new THREE.Matrix4() };
    uniforms.uPrevModelMatrix = { value: new THREE.Matrix4() };
    uniforms.uPrevModelValid = { value: 0 };
    uniforms.uVelocityValid = { value: 0 };
    uniforms.uVelocityClamp = { value: VELOCITY.clampUv };
  }
  const damageEnabled = { value: 0 };
  if (destruction) BindDestructionUniforms(uniforms, destruction, damageEnabled);
  const velocityVertex = velocity ? /* glsl */`
        {
          // 世界坐标自己算：实例化 / 合批 / 蒙皮的矩阵顺序照抄 <project_vertex>。
          vec4 worldLocal = vec4(transformed, 1.0);
          #ifdef USE_BATCHING
            worldLocal = batchingMatrix * worldLocal;
          #endif
          #ifdef USE_INSTANCING
            worldLocal = instanceMatrix * worldLocal;
          #endif
          vec4 worldNow = modelMatrix * worldLocal;
          vec4 worldPrev = worldNow;
          #ifdef USE_SKINNING
            // 上一帧骨矩阵在同一张 boneTexture 的下半张（见文件头「逐物体速度」）。
            // **喂给它的必须是蒙皮前的顶点**（vPreSkinPosition，在 skinning_vertex
            // 之前存下）。这里若用 transformed，那已经是本帧蒙皮完的位置，
            // 再乘一遍上一帧骨矩阵 = 把骨骼的世界变换叠了两次 —— 上一帧位置会被
            // 甩到几百米外，速度整条钳到 uVelocityClamp（0.25 uv）。表现是
            // 人物一动就拖一串鬼影、周身一圈恒定的运动模糊。
            vec4 prevSkinVertex = bindMatrix * vec4(vPreSkinPosition, 1.0);
            vec4 prevSkinned = vec4(0.0);
            prevSkinned += GetPrevBoneMatrix(skinIndex.x) * prevSkinVertex * skinWeight.x;
            prevSkinned += GetPrevBoneMatrix(skinIndex.y) * prevSkinVertex * skinWeight.y;
            prevSkinned += GetPrevBoneMatrix(skinIndex.z) * prevSkinVertex * skinWeight.z;
            prevSkinned += GetPrevBoneMatrix(skinIndex.w) * prevSkinVertex * skinWeight.w;
            worldPrev = modelMatrix * vec4((bindMatrixInverse * prevSkinned).xyz, 1.0);
          #endif
          if (uPrevModelValid > 0.5) worldPrev = uPrevModelMatrix * worldLocal;
          vCurClip = uViewProjection * worldNow;
          vPrevClip = uPrevViewProjection * worldPrev;
        }` : "";
  const material = new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3,
    uniforms,
    vertexShader: /* glsl */`
      #include <common>
      #include <batching_pars_vertex>
      #include <skinning_pars_vertex>
      #include <morphtarget_pars_vertex>
      varying vec3 vViewNormal;
      varying float vViewDepth;
      ${velocity ? `uniform mat4 uViewProjection;
      uniform mat4 uPrevViewProjection;
      uniform mat4 uPrevModelMatrix;
      uniform float uPrevModelValid;
      varying vec4 vCurClip;
      varying vec4 vPrevClip;
      #ifdef USE_SKINNING
        // three 的 getBoneMatrix 原样照抄，只把纹素下标推到下半张图（+ size*size）。
        mat4 GetPrevBoneMatrix(const in float boneIndex) {
          int texSize = textureSize(boneTexture, 0).x;
          int j = int(boneIndex) * 4 + texSize * texSize;
          int px = j % texSize;
          int py = j / texSize;
          vec4 c0 = texelFetch(boneTexture, ivec2(px, py), 0);
          vec4 c1 = texelFetch(boneTexture, ivec2(px + 1, py), 0);
          vec4 c2 = texelFetch(boneTexture, ivec2(px + 2, py), 0);
          vec4 c3 = texelFetch(boneTexture, ivec2(px + 3, py), 0);
          return mat4(c0, c1, c2, c3);
        }
      #endif` : ""}
      ${destruction ? "varying vec3 vDamageWorldPos;" : ""}
      void main() {
        #include <batching_vertex>
        #include <beginnormal_vertex>
        #include <morphinstance_vertex>
        #include <morphnormal_vertex>
        #include <skinbase_vertex>
        #include <skinnormal_vertex>
        #include <defaultnormal_vertex>
        vViewNormal = normalize(transformedNormal);
        #include <begin_vertex>
        #include <morphtarget_vertex>
        ${velocity ? "vec3 vPreSkinPosition = transformed;   // 蒙皮前（上一帧骨矩阵要吃它）" : ""}
        #include <skinning_vertex>
        #include <project_vertex>
        vViewDepth = -mvPosition.z;
        ${velocityVertex}
        ${destruction ? `
        vec4 damageWorld = vec4(transformed, 1.0);
        #ifdef USE_BATCHING
          damageWorld = batchingMatrix * damageWorld;
        #endif
        #ifdef USE_INSTANCING
          damageWorld = instanceMatrix * damageWorld;
        #endif
        vDamageWorldPos = (modelMatrix * damageWorld).xyz;` : ""}
      }
    `,
    fragmentShader: /* glsl */`
      precision highp float;
      uniform float uFar;
      uniform float uForegroundDepth;
      varying vec3 vViewNormal;
      varying float vViewDepth;
      ${velocity ? `uniform float uVelocityValid;
      uniform float uVelocityClamp;
      varying vec4 vCurClip;
      varying vec4 vPrevClip;` : ""}
      ${destruction ? `varying vec3 vDamageWorldPos;
${DestructionShaderGlsl(destruction.maxVolumes)}` : ""}
      layout(location = 0) out vec4 oNormalDepth;
      ${velocity ? "layout(location = 1) out vec4 oVelocity;" : ""}
      void main() {
        ${destruction ? "ApplyDamageVolumes(vDamageWorldPos);" : ""}
        vec3 n = normalize(vViewNormal);
        if (!gl_FrontFacing) n = -n;
        // 前景件（第一人称手/枪）写常数近景深度，不写自己的真实视深：
        // 见 MarkForegroundPrepass 的抬头。法线仍然是真的。
        float depth = uForegroundDepth > 0.0 ? uForegroundDepth : vViewDepth;
        oNormalDepth = vec4(n, depth);
        ${velocity ? `
        vec2 motion = vec2(0.0);
        if (uVelocityValid > 0.5 && uForegroundDepth <= 0.0
            && vCurClip.w > 0.0 && vPrevClip.w > 0.0) {
          vec2 curUv = vCurClip.xy / vCurClip.w * 0.5 + 0.5;
          vec2 prevUv = vPrevClip.xy / vPrevClip.w * 0.5 + 0.5;
          motion = clamp(curUv - prevUv, vec2(-uVelocityClamp), vec2(uVelocityClamp));
        }
        oVelocity = vec4(motion, 0.0, 1.0);` : ""}
      }
    `,
    side: THREE.FrontSide,
  });
  // BuildSink 的静态网格会在自己的 onBeforeRender/onAfterRender 里只为这一 draw
  // 打开裁切。演员、枪、碎片共用 overrideMaterial，但不会被破口 OBB 切掉。
  if (destruction) material.userData.damageObjectEnabled = damageEnabled;
  // 同一套「按 draw 开关」的手法给第一人称用（MarkForegroundPrepass 读这个）。
  material.userData.foregroundDepth = uniforms.uForegroundDepth;
  material.userData.velocity = velocity;
  return material;
}

// --- HZB：线性视深的 max-reduce 金字塔 ---------------------------------------
// uMode = 0 从预通道 RT0 的 w 通道起步（天空 w ≤ 0 记成 uFar）；
// uMode = 1 从上一级的 r 通道继续。两级共用一份材质，只换 uniform。
const FRAG_HZB = /* glsl */`
uniform sampler2D uSource;
uniform vec2 uTexel;
uniform float uMode;
uniform float uFar;
varying vec2 vUv;
float Fetch(vec2 uv) {
  vec4 texel = texture2D(uSource, uv);
  float value = uMode < 0.5 ? texel.a : texel.r;
  // 天空在预通道里是 clear 出来的 0：当最远处理，否则 max-reduce 会被它咬回近处。
  return value <= 0.0 ? uFar : value;
}
void main() {
  vec2 o = uTexel * 0.5;
  float m = Fetch(vUv + vec2(-o.x, -o.y));
  m = max(m, Fetch(vUv + vec2(o.x, -o.y)));
  m = max(m, Fetch(vUv + vec2(-o.x, o.y)));
  m = max(m, Fetch(vUv + vec2(o.x, o.y)));
  gl_FragColor = vec4(m, m, m, 1.0);
}
`;

/**
 * 深度法线预通道 pass。
 *
 * 契约见 `Script_PostCommon` 抬头。这个 pass 额外对外暴露：
 *   `target`            MRT 渲染靶（textures[0] = normalDepth，[1] = velocity）
 *   `normalDepthTexture` / `velocityTexture` / `depthTexture`
 *   `hzb`               { source, texture, levels, sizes, mipCount, size }
 */
export class PrepassPass {
  constructor(pipeline, { destruction = null } = {}) {
    this.name = "prepass";
    this.pipeline = pipeline;
    this.destruction = destruction;
    this.velocityEnabled = !!(pipeline.preset.velocity && pipeline.hdrCapable);
    this.hzbEnabled = !!(pipeline.preset.hzb && pipeline.hdrCapable);
    this.material = MakeNormalDepthMaterial(destruction, { velocity: this.velocityEnabled });
    this.target = null;
    this.hzbLevels = [];
    this.hzb = null;
    this.hasPrevVelocity = false;

    this._skipScratch = [];            // _CollectSkipped 的复用数组，别每帧 new
    this._skipWorldPosition = new THREE.Vector3();
    this._skeletons = new Set();       // 本帧在场的骨骼（下面拷上一帧矩阵用）
    this._upgraded = new WeakSet();    // 已经换成「高度翻倍」boneTexture 的骨骼
    this._failedUpgrade = new WeakSet();
    this._rigidHistory = new WeakMap();
    this._rigidDrawn = [];
    this._velocityFrame = 0;
    if (this.velocityEnabled) this.material.onBeforeRender = (renderer, scene, camera, geometry, object) => {
      this._BindRigidVelocity(object);
    };

    this.uniformsHzb = {
      uSource: { value: null }, uTexel: { value: new THREE.Vector2() },
      uMode: { value: 0 }, uFar: { value: 500 },
    };
    this.matHzb = MakeFullscreenMaterial(FRAG_HZB, this.uniformsHzb);
  }

  get normalDepthTexture() { return this.target ? this.target.textures[0] : null; }
  get velocityTexture() {
    return this.target && this.target.textures.length > 1 ? this.target.textures[1] : null;
  }
  get depthTexture() { return this.target ? this.target.depthTexture : null; }

  Enabled() { return true; }

  Resize(width, height) {
    const w = Math.max(2, width | 0);
    const h = Math.max(2, height | 0);
    if (this.target) this.target.dispose();
    for (const rt of this.hzbLevels) rt.dispose();
    this.hzbLevels = [];

    // minFilter=Nearest / magFilter=Linear 是重构前就有的口径，一个字都不许改：
    // SSAO 在半分辨率上取全分辨率的这张图，过滤方式换了读数就换了。
    this.target = MakeRenderTarget(w, h, {
      type: this.pipeline.hdrType,
      minFilter: THREE.NearestFilter,
      depthBuffer: true,
      count: this.velocityEnabled ? 2 : 1,
    });
    this.target.textures[0].name = "normalDepth";
    if (this.velocityEnabled) {
      // 两张附件可以各用各的格式（三方按 texture.format 逐附件建）。
      // 速度只要两个通道，RG16F 比 RGBA16F 省一半带宽。
      const velocity = this.target.textures[1];
      velocity.name = "velocity";
      velocity.format = THREE.RGFormat;
      velocity.type = THREE.HalfFloatType;
    }
    // DepthTexture 而不是 renderbuffer：HZB / 将来的 SSR、体积雾要能直接采它。
    // 精度与原来的 DEPTH_COMPONENT24 renderbuffer 相同，颜色输出不受影响。
    // **不要挂到 MSAA 靶上** —— 那需要额外的 depth blit，部分驱动直接给未定义值。
    this.target.depthTexture = new THREE.DepthTexture(w, h, THREE.UnsignedIntType);
    this.target.depthTexture.name = "sceneDepth";

    if (this.hzbEnabled) {
      let mw = Math.max(1, w >> 1);
      let mh = Math.max(1, h >> 1);
      for (let level = 0; level < HZB.maxLevels; level += 1) {
        this.hzbLevels.push(MakeRenderTarget(mw, mh, {
          type: THREE.HalfFloatType,
          minFilter: THREE.NearestFilter,
          magFilter: THREE.NearestFilter,
        }));
        if (Math.min(mw, mh) <= HZB.minSize) break;
        mw = Math.max(1, mw >> 1);
        mh = Math.max(1, mh >> 1);
      }
    }
    this.hzb = this.hzbLevels.length ? {
      source: this.target.textures[0],          // 全分辨率那一级 = RT0 的 w 通道
      texture: this.hzbLevels[0].texture,
      levels: this.hzbLevels.map((rt) => rt.texture),
      sizes: this.hzbLevels.map((rt) => [rt.width, rt.height]),
      mipCount: this.hzbLevels.length,
      size: [this.hzbLevels[0].width, this.hzbLevels[0].height],
    } : null;
    this.hasPrevVelocity = false;
    // 编排器按老名字对外暴露（消费方与测试读的是 post.targets.normalDepth）
    this.pipeline.targets.normalDepth = this.target;
  }

  /**
   * 收集这一帧要在预通道里藏掉的对象：显式 skipNormalDepth，或超过自己的
   * normalDepthMaxDistance（只给蒙皮人物的小分件用；躯干主轮廓没有距离上限）。
   * 顺手把在场的骨骼记下来（上一帧骨矩阵要按它们拷）。
   *
   * 每帧遍历一次场景图：这一趟本来就要被渲染器自己遍历好几遍，多一次几十微秒，
   * 换来的是"挂上去就生效"——缓存一份列表的话，换关重建场景那一帧必然是脏的，
   * 而这个 bug 的表现（天上一个黑洞）恰恰要花一小时才定位得到。
   * 只收当前可见的：本来就藏着的对象不该被这里"帮忙"打开。
   */
  _CollectSkipped(scene, camera = null) {
    const list = this._skipScratch;
    list.length = 0;
    const wantSkeletons = this.velocityEnabled && VELOCITY.skinnedPrev;
    const mrt = this.velocityEnabled;
    if (wantSkeletons) this._skeletons.clear();
    scene.traverse((object) => {
      if (!object.visible || !object.userData) return;
      if (wantSkeletons && object.isSkinnedMesh && object.skeleton) {
        this._skeletons.add(object.skeleton);
      }
      if (object.userData.skipNormalDepth) {
        list.push(object);
        return;
      }
      // **MRT 的硬约束**：WebGL2 里「有一个 enabled 的 draw buffer 却没有对应的
      // 片元着色器输出」是 INVALID_OPERATION，那一次 draw 被整个丢掉。实测
      // （RTX 4070 SUPER / ANGLE-D3D11）：单靶 + 单输出材质 → 0；MRT(2) + 单输出
      // 材质 → 1282（RG16F 与 RGBA16F 都一样）；MRT(2) + 两输出材质 → 0。
      //
      // `allowOverride === false` 的东西（天空穹、水面、粒子、烟、编辑器线框）用的是
      // **它们自己的**一输出材质，换不成覆盖材质，所以升成 MRT 之后它们必须整只
      // 藏出这一趟 —— 否则每帧刷 GL 错误，而且那些 draw 本来也被驱动丢掉了。
      //
      // 顺带修掉一条老账：它们以前**是**被画进 rtNormalDepth 的，写进去的 xyz 是
      // 自己的光照颜色（当法线用是纯垃圾）、w 是不透明度（水面那种 depthWrite=false
      // 的半透明大面会把 w 写成 0~1，下游一律误判成「一米内有实体」）。
      // 这一条是本轮重构**唯一一处刻意的行为变化**，见 docs §1.5 的说明。
      if (mrt && (object.isMesh || object.isLine || object.isPoints || object.isSprite)) {
        const material = object.material;
        if (Array.isArray(material)) {
          if (material.some((item) => item && item.allowOverride === false)) {
            list.push(object);
            return;
          }
        } else if (material && material.allowOverride === false) {
          list.push(object);
          return;
        }
      }
      const maxDistance = Number(object.userData.normalDepthMaxDistance) || 0;
      if (camera && maxDistance > 0) {
        // RenderScene 已在本帧统一更新 scene.matrixWorld；直接读矩阵，别让每个小分件
        // 再沿父链 updateWorldMatrix 一遍，把省下的 GPU 成本换成 JS 遍历。
        this._skipWorldPosition.setFromMatrixPosition(object.matrixWorld);
        if (camera.position.distanceToSquared(this._skipWorldPosition) > maxDistance * maxDistance) {
          list.push(object);
        }
      }
    });
    return list;
  }

  /**
   * 把一具骨骼的 `boneTexture` 换成高度翻倍的版本：上半 = 本帧，下半 = 上一帧。
   *
   * 主 pass 读到的东西**逐纹素不变** —— 宽度没动，`getBoneMatrix(i)` 的
   * `x = (i*4) % size` / `y = (i*4) / size` 对 i < size²/4 落点完全一样，
   * 只是纹理下面多了一片它永远不会取到的行。
   */
  _UpgradeSkeleton(skeleton) {
    if (this._upgraded.has(skeleton) || this._failedUpgrade.has(skeleton)) return;
    try {
      if (skeleton.boneTexture === null) skeleton.computeBoneTexture();
      const old = skeleton.boneTexture;
      const size = old.image.width;
      if (old.image.height !== size) { this._failedUpgrade.add(skeleton); return; }
      const half = size * size * 4;
      const big = new Float32Array(half * 2);
      big.set(skeleton.boneMatrices.subarray(0, Math.min(half, skeleton.boneMatrices.length)));
      big.copyWithin(half, 0, half);      // 第一帧：上一帧 = 本帧，速度 0
      const texture = new THREE.DataTexture(big, size, size * 2, THREE.RGBAFormat, THREE.FloatType);
      texture.name = "boneTextureWithPrev";
      texture.needsUpdate = true;
      old.dispose();
      skeleton.boneTexture = texture;
      // three 每帧往 boneMatrices 写本帧矩阵；让它写进大数组的上半部分。
      skeleton.boneMatrices = big.subarray(0, half);
      skeleton.userData = skeleton.userData || {};
      skeleton.userData.prevBoneOffset = half;
      this._upgraded.add(skeleton);
    } catch (error) {
      console.warn("[Prepass] 骨骼上一帧矩阵纹理升级失败，该骨骼退回相机速度", error);
      this._failedUpgrade.add(skeleton);
    }
  }

  /** Render 末尾调一次：把本帧骨矩阵拷进下半张，供下一帧当「上一帧」。 */
  _SnapshotSkeletons() {
    if (!this.velocityEnabled || !VELOCITY.skinnedPrev) return;
    for (const skeleton of this._skeletons) {
      const offset = skeleton.userData?.prevBoneOffset;
      if (!offset) continue;
      const data = skeleton.boneTexture?.image?.data;
      if (!data || data.length < offset * 2) continue;
      data.copyWithin(offset, 0, offset);
    }
  }

  // Called after the object's existing hooks, before three uploads uniforms.
  // Keep history per pass, outside userData (cloning must not clone live history).
  _BindRigidVelocity(object) {
    const U = this.material.uniforms;
    let valid = 0;
    if (object.isMesh && !object.isSkinnedMesh && !object.isInstancedMesh && !object.isBatchedMesh
        && !object.userData.foregroundPrepass) {
      let history = this._rigidHistory.get(object);
      if (!history) {
        history = { object, matrix: object.matrixWorld.clone(), frame: -1, queued: -1 };
        this._rigidHistory.set(object, history);
      }
      if (history.frame === this._velocityFrame - 1 && !history.matrix.equals(object.matrixWorld)) {
        U.uPrevModelMatrix.value.copy(history.matrix);
        valid = 1;
      }
      if (history.queued !== this._velocityFrame) {
        history.queued = this._velocityFrame;
        this._rigidDrawn.push(history);
      }
    }
    // Restore the default before static/skinned/instanced draws too. Upload only
    // for moving draws and the transition back, not for every static wall.
    if (valid || U.uPrevModelValid.value !== valid) this.material.uniformsNeedUpdate = true;
    U.uPrevModelValid.value = valid;
  }

  _SnapshotRigids() {
    for (const history of this._rigidDrawn) {
      history.matrix.copy(history.object.matrixWorld);
      history.frame = this._velocityFrame;
    }
    this._rigidDrawn.length = 0;
  }

  Render(ctx) {
    const renderer = ctx.renderer;
    const scene = ctx.scene;
    const camera = ctx.camera;
    const material = this.material;
    this._velocityFrame += 1;
    this._rigidDrawn.length = 0;

    // 事故（这一条是好几个"远景不对劲"的共同根因）：allowOverride = false 只保证
    // **不被换材质**，它照样会被画进这一趟。天空穹正是这样用自己那套着色器
    // 写进 rtNormalDepth 的：xyz 是天空颜色（当法线用是纯垃圾），w 是它的
    // 不透明度 1.0 —— 于是整片天空在下游看起来像"一米外有东西"。
    // 后果一路传下去：SSAO 拿天空色当法线算遮蔽；合成 pass 的雾判据
    // `nd.w > 0.0` 对天空成立（只是雾量≈0，蒙混过关）；而粒子层用
    // `nd.w > 0.001` 判断"背景是不是天空"时全判反 —— 软粒子把天空前的烟
    // 整片抹掉，二百米外的黑烟柱就成了天上一个越长越大的黑洞。
    // Script_Sky 早就标了 userData.skipNormalDepth，只是从来没人读它。
    const skipped = this._CollectSkipped(scene, camera);
    for (const object of skipped) object.visible = false;
    const prevBackground = scene.background;
    const prevOverride = scene.overrideMaterial;
    scene.background = null;
    scene.overrideMaterial = material;
    // 前景标签逐 draw 由 MarkForegroundPrepass 的钩子开关；这一趟开头先归零，
    // 上一帧要是在某个 draw 中途出错（onAfterRender 没跑），整个世界会被写成 1 m。
    material.userData.foregroundDepth.value = 0;
    if (this.velocityEnabled) {
      for (const skeleton of this._skeletons) this._UpgradeSkeleton(skeleton);
      const U = material.uniforms;
      U.uViewProjection.value.copy(ctx.viewProjection);
      U.uPrevViewProjection.value.copy(ctx.prevViewProjection);
      U.uVelocityValid.value = ctx.hasPrev && this.hasPrevVelocity ? 1 : 0;
      U.uPrevModelValid.value = 0;
      U.uFar.value = camera.far;
      material.uniformsNeedUpdate = true;   // 每帧一次，不是每 draw 一次
    }
    renderer.setRenderTarget(this.target);
    renderer.setClearColor(0x000000, 0);
    renderer.clear(true, true, false);
    renderer.render(scene, camera);
    // Advance once after every material group has drawn, never between groups.
    this._SnapshotRigids();
    scene.overrideMaterial = prevOverride;
    scene.background = prevBackground;
    for (const object of skipped) object.visible = true;

    ctx.normalDepthTexture = this.target.textures[0];
    ctx.velocityTexture = this.velocityTexture;
    ctx.sceneDepthTexture = this.target.depthTexture;
    this.hasPrevVelocity = true;
  }

  /** HZB 单列一段计时：它是 SSR / 体积雾的公共输入，成本要看得见。 */
  RenderHzb(ctx) {
    if (!this.hzbLevels.length) { ctx.hzb = null; return; }
    const U = this.uniformsHzb;
    U.uFar.value = ctx.camera.far;
    let source = this.target.textures[0];
    let sourceWidth = this.target.width;
    let sourceHeight = this.target.height;
    for (let level = 0; level < this.hzbLevels.length; level += 1) {
      const dst = this.hzbLevels[level];
      U.uSource.value = source;
      U.uMode.value = level === 0 ? 0 : 1;
      U.uTexel.value.set(1 / sourceWidth, 1 / sourceHeight);
      ctx.blitter.Blit(this.matHzb, dst);
      source = dst.texture;
      sourceWidth = dst.width;
      sourceHeight = dst.height;
    }
    ctx.hzb = this.hzb;
  }

  Dispose() {
    if (this.target) this.target.dispose();
    for (const rt of this.hzbLevels) rt.dispose();
    this.hzbLevels = [];
    this.material.dispose();
    this.matHzb.dispose();
  }
}

/**
 * Compatibility/diagnostic marker for existing callers. Ordinary rigid meshes
 * are tracked automatically by PrepassPass, including unmarked new props.
 * Never replace object hooks: destruction and foreground rendering own them.
 */
export function MarkDynamicPrepass(object) {
  if (!object || !object.isMesh || object.userData.prepassDynamic) return object;
  object.userData.prepassDynamic = true;
  return object;
}

export { GLSL_COMMON };
