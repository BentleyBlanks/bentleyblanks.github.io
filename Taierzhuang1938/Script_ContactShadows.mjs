// 《台儿庄：血战滕县》屏幕空间接触阴影（screen-space contact shadows）+ 阴影系统的调试视图。
//
// ## 它修的是哪一条
// 级联阴影为了不长痤疮，必须把着色点沿法线推出去（`shadowNormalBias`，本作最近
// 一级 ~3.5 cm）。推出去的那一点在**地面之上**，于是沙袋、木箱、弹药箱贴地那一圈
// 永远"晒得到太阳"—— 物件像是浮在地上。远级纹素粗到十几厘米时更明显：
// 一个 30 cm 的箱子在第 2 级里只占两个纹素，接触带整个丢掉。
//
// 3A 引擎的解法都是同一条：**从像素出发，沿太阳方向在深度缓冲里短距离 raymarch**
// （UE 的 Contact Shadows / Frostbite 的 SSCS / COD 的 screen-space shadows）。
// 追踪距离只有几十厘米，专门补阴影图分辨率够不到的那一段。
//
// ## 帧内位置与口径
//   · 帧图里排在 `ssao` 之后、`main` 之前 —— 它要预通道的法线+线性视深，
//     产出的图要在主场景那一趟被材质采到。
//   · 输出 R8：R = 可见度（1 = 没挡住），G = 线性视深 / 64（双边模糊要）。
//   · **只压直射太阳**，与级联阴影取 `min`（见 Script_Csm 的材质 chunk）。
//     间接光一点都不许压 —— 那是 SSAO 的活，接触阴影乘上去等于双份。
//   · 关掉时材质仍然采样，但采的是一张 1×1 纯白（`CSM_CONTACT_UNIFORMS.map`），
//     所以开关**不重编译材质**。
//
// ## 已知近似（都是有意的）
//   · 屏幕空间：射线走出屏幕、或遮挡体在屏幕外，就没有接触阴影。
//   · 厚度判据：深度缓冲只有一层，"射线钻到表面后面"与"表面后面是空的"分不开。
//     `thicknessMeters` 是那条分界线；调大 = 远处的墙给近处地面投假影，
//     调小 = 薄物件（栏杆、枪管）的接触阴影漏掉。
//   · 第一人称的手与枪写的是常数 1 m 前景标签（不是真视深），所以
//     `minViewDepth` 把它们整段排除；否则枪身上会出现一条按假深度算出来的黑带。

import * as THREE from "three";
import {
  MakeFullscreenMaterial, MakeRenderTarget, GLSL_COMMON, GLSL_VIEW_POS,
} from "./Script_PostCommon.mjs";
import { SHADOW_COMMON, MakeShadowPreset } from "./Data_Tuning_Shadows.mjs";
import {
  SUN_SHADOW_SAMPLER_GLSL, MakeSunShadowUniforms, CSM_CONTACT_UNIFORMS, CsmWhiteTexture,
  SetCsmContactCompiled,
} from "./Script_Csm.mjs";

const C = SHADOW_COMMON.contact;

const FRAG_CONTACT = /* glsl */`
uniform sampler2D uNormalDepth;
uniform vec2 uProjScale;
uniform mat4 uProjection;
uniform vec3 uSunViewDir;      // 视空间、指向太阳的单位向量
uniform float uFrame;
uniform float uLength;         // 追踪总长（米）
uniform float uThickness;      // 厚度判据（米）
uniform float uNormalOffset;   // 起点沿法线推出去（米）
uniform float uIntensity;
uniform float uMinViewDepth;
uniform float uFadeStart;
uniform float uMaxViewDepth;
varying vec2 vUv;
${GLSL_COMMON}
${GLSL_VIEW_POS}

const int STEPS = ${C.steps};

void main() {
  vec4 nd = texture2D(uNormalDepth, vUv);
  float depth = nd.w;
  // 天空（w = 0）、前景（第一人称写常数 1 m 标签）、超过预算的远处一律"没挡住"。
  if (depth <= uMinViewDepth || depth > uMaxViewDepth) { gl_FragColor = vec4(1.0, depth / 64.0, 0.0, 1.0); return; }
  vec3 normal = normalize(nd.xyz);
  // 背光面本来就在阴影里，没必要追踪（而且掠射角上射线立刻扎进自己的表面）。
  float ndl = dot(normal, uSunViewDir);
  if (ndl <= 0.02) { gl_FragColor = vec4(1.0, depth / 64.0, 0.0, 1.0); return; }

  vec3 origin = ViewPosFromDepth(vUv, depth, uProjScale) + normal * uNormalOffset;
  float stepLength = uLength / float(STEPS);
  // 抖动起点：不抖会出现明显的同心环带（每一步的深度阈值在屏幕上连成一条线）。
  // 用 IGN + 帧序推进，不用 Math.random —— 视觉审查靠逐轮截图比对。
  float jitter = Ign(gl_FragCoord.xy + uFrame * 5.588238);

  float occlusion = 0.0;
  for (int i = 1; i <= STEPS; i++) {
    vec3 marchPos = origin + uSunViewDir * (stepLength * (float(i) - 1.0 + jitter));
    vec4 clip = uProjection * vec4(marchPos, 1.0);
    if (clip.w <= 0.0) break;
    vec2 marchUv = (clip.xy / clip.w) * 0.5 + 0.5;
    if (marchUv.x < 0.0 || marchUv.x > 1.0 || marchUv.y < 0.0 || marchUv.y > 1.0) break;
    float sceneDepth = texture2D(uNormalDepth, marchUv).w;
    if (sceneDepth <= 0.0) continue;               // 天空
    float rayDepth = -marchPos.z;
    float diff = rayDepth - sceneDepth;            // > 0 = 射线跑到了表面后面
    // 下界跟着步长走：步长本身就是一个深度容差，固定小常数会在斜面上误判自遮挡。
    if (diff > stepLength * 0.35 && diff < uThickness) { occlusion = 1.0; break; }
  }

  // 远处淡出：一个像素跨好几米的地方，接触阴影只会变成噪点。
  float fade = 1.0 - smoothstep(uFadeStart, uMaxViewDepth, depth);
  // 掠射角淡出：ndl 很小的时候射线几乎贴着表面走，误判率最高。
  fade *= smoothstep(0.02, 0.25, ndl);
  gl_FragColor = vec4(1.0 - occlusion * uIntensity * fade, depth / 64.0, 0.0, 1.0);
}
`;

// 双边模糊：跨深度边界不混。接触阴影是二值命中，不模糊的话是一片胡椒盐。
const FRAG_CONTACT_BLUR = /* glsl */`
uniform sampler2D uSource;
uniform vec2 uTexel;
uniform vec2 uDirection;
varying vec2 vUv;
void main() {
  vec2 center = texture2D(uSource, vUv).rg;
  float sum = center.r * 0.4;
  float weightSum = 0.4;
  for (int i = 1; i <= 2; i++) {
    for (int s = -1; s <= 1; s += 2) {
      vec2 uv = vUv + uDirection * uTexel * float(i) * float(s);
      vec2 t = texture2D(uSource, uv).rg;
      float w = 0.3 / float(i) * exp(-abs(t.g - center.g) * 24.0);
      sum += t.r * w;
      weightSum += w;
    }
  }
  gl_FragColor = vec4(sum / max(weightSum, 1e-4), center.g, 0.0, 1.0);
}
`;

/**
 * 接触阴影 pass。契约见 `Script_PostCommon.mjs` 抬头：
 * `{ name, Enabled, Resize, Render, Dispose }`。
 */
export class ContactShadowsPass {
  constructor(pipeline, { quality = "high" } = {}) {
    this.name = "contactShadows";
    this.pipeline = pipeline;
    this.shadowPreset = MakeShadowPreset(quality);
    // **必须在任何材质编译之前**：这一位决定材质里编不编 `CSM_CONTACT` 那一段。
    // PostPipeline 在 MaterialLibrary 之前构造（Script_Main / Script_Probe 都是），
    // 所以这里点一下就够。运行时开关不翻这一位（见 Script_Csm 那边的账）。
    // **开机那一刻**这一档支不支持接触阴影。运行时开关（画质面板）只翻
    // `preset.contactShadows`，不翻这一位 —— 靶按它建，不然「关了再开」那次
    // 要等到下一回改分辨率才有靶可写。
    this.compiled = !!pipeline.preset.contactShadows;
    SetCsmContactCompiled(this.compiled);
    this.uniforms = {
      uNormalDepth: { value: null },
      uProjScale: { value: new THREE.Vector2(1, 1) },
      uProjection: { value: new THREE.Matrix4() },
      uSunViewDir: { value: new THREE.Vector3(0, 1, 0) },
      uFrame: { value: 0 },
      uLength: { value: C.lengthMeters },
      uThickness: { value: C.thicknessMeters },
      uNormalOffset: { value: C.normalOffset },
      uIntensity: { value: C.intensity },
      uMinViewDepth: { value: C.minViewDepth ?? 1.25 },
      uFadeStart: { value: C.fadeStartViewDepth },
      uMaxViewDepth: { value: C.maxViewDepth },
    };
    this.material = MakeFullscreenMaterial(FRAG_CONTACT, this.uniforms);
    this.uniformsBlur = {
      uSource: { value: null },
      uTexel: { value: new THREE.Vector2() },
      uDirection: { value: new THREE.Vector2(1, 0) },
    };
    this.materialBlur = MakeFullscreenMaterial(FRAG_CONTACT_BLUR, this.uniformsBlur);
    this.raw = null;
    this.tmp = null;
    this.blur = null;
    this._sunView = new THREE.Vector3();
    // 材质那边永远采得到一张图：关着时是 1×1 纯白（= 没挡住）。
    CSM_CONTACT_UNIFORMS.map.value = CsmWhiteTexture();
  }

  Enabled(ctx) { return this.compiled && !!ctx.preset.contactShadows && !!this.blur; }

  Resize(width, height) {
    for (const rt of [this.raw, this.tmp, this.blur]) if (rt) rt.dispose();
    this.raw = null; this.tmp = null; this.blur = null;
    // 材质按 gl_FragCoord / **主靶尺寸**取样（不是接触阴影靶的尺寸！）——
    // 这一行不许跟着 compiled 走，调试面板与关掉的档位也要有正确的分辨率。
    CSM_CONTACT_UNIFORMS.resolution.value.set(width, height);
    if (!this.compiled) { delete this.pipeline.targets.contactShadow; return; }
    const scale = this.shadowPreset.contactScale || 1;
    const w = Math.max(2, Math.round(width * scale));
    const h = Math.max(2, Math.round(height * scale));
    this.raw = MakeRenderTarget(w, h, { type: THREE.UnsignedByteType });
    this.tmp = MakeRenderTarget(w, h, { type: THREE.UnsignedByteType });
    this.blur = MakeRenderTarget(w, h, { type: THREE.UnsignedByteType });
    this.pipeline.targets.contactShadow = this.blur;
  }

  Render(ctx) {
    const U = this.uniforms;
    U.uNormalDepth.value = ctx.normalDepthTexture;
    U.uProjScale.value.copy(ctx.projScale);
    // 预通道与主场景吃的是**带抖动**的投影矩阵，追踪时的重投影必须跟着它，
    // 否则采样位置与深度图差半个像素（SSAO 那边同一条口径）。
    U.uProjection.value.copy(ctx.camera.projectionMatrix);
    this._sunView.copy(ctx.sunDirection).transformDirection(ctx.view);
    U.uSunViewDir.value.copy(this._sunView).normalize();
    U.uFrame.value = ctx.frame;
    U.uIntensity.value = ctx.options.contactShadowIntensity ?? C.intensity;
    ctx.blitter.Blit(this.material, this.raw);

    this.uniformsBlur.uTexel.value.set(1 / this.raw.width, 1 / this.raw.height);
    this.uniformsBlur.uSource.value = this.raw.texture;
    this.uniformsBlur.uDirection.value.set(1, 0);
    ctx.blitter.Blit(this.materialBlur, this.tmp);
    this.uniformsBlur.uSource.value = this.tmp.texture;
    this.uniformsBlur.uDirection.value.set(0, 1);
    ctx.blitter.Blit(this.materialBlur, this.blur);

    CSM_CONTACT_UNIFORMS.map.value = this.blur.texture;
  }

  /** pass 被跳过的那一帧也要把材质那边还原成中性值，否则画面留着上一帧的图。 */
  Idle() {
    if (CSM_CONTACT_UNIFORMS.map.value !== CsmWhiteTexture()) {
      CSM_CONTACT_UNIFORMS.map.value = CsmWhiteTexture();
    }
  }

  Dispose() {
    for (const rt of [this.raw, this.tmp, this.blur]) if (rt) rt.dispose();
    this.material.dispose();
    this.materialBlur.dispose();
    CSM_CONTACT_UNIFORMS.map.value = CsmWhiteTexture();
  }
}

// ---------------------------------------------------------------------------
// Debug Rendering 的三张图
// ---------------------------------------------------------------------------

const FRAG_CASCADE_VIEW = /* glsl */`
uniform sampler2D uNormalDepth;
uniform mat4 uInvView;
uniform vec2 uProjScale;
uniform float uMode;          // 0 = 级联假彩色, 1 = 半影尺寸
varying vec2 vUv;
${SUN_SHADOW_SAMPLER_GLSL}

// 级号 -> 颜色。红/黄/绿/蓝，与「近到远」一一对应；级联之外是深灰。
vec3 CascadeColor(float level) {
  if (level < -0.5) return vec3(0.10, 0.10, 0.12);
  if (level < 0.5) return vec3(0.85, 0.22, 0.18);
  if (level < 1.5) return vec3(0.92, 0.74, 0.16);
  if (level < 2.5) return vec3(0.26, 0.72, 0.32);
  return vec3(0.24, 0.48, 0.92);
}

void main() {
  vec4 nd = texture2D(uNormalDepth, vUv);
  if (nd.w <= 0.0) { gl_FragColor = vec4(0.05, 0.09, 0.20, 1.0); return; }
  vec2 ndc = vUv * 2.0 - 1.0;
  vec3 viewPos = vec3(ndc.x / max(uProjScale.x, 0.0001),
                      ndc.y / max(uProjScale.y, 0.0001), -1.0) * nd.w;
  vec3 worldPos = (uInvView * vec4(viewPos, 1.0)).xyz;
  vec3 worldNormal = normalize(mat3(uInvView) * normalize(nd.xyz));
  if (uMode < 0.5) {
    vec4 hit = SunShadowProject(worldPos, worldNormal);
    float visibility = SunShadowVisibility(worldPos, worldNormal);
    // 级联底色 × 阴影可见度：既看得到级的边界，也看得到影子落在哪
    gl_FragColor = vec4(CascadeColor(hit.w) * (0.35 + 0.65 * visibility), 1.0);
  } else {
    float texels = SunShadowPenumbraTexels(worldPos, worldNormal);
    float t = clamp(texels / ${(SHADOW_COMMON.maxPenumbraTexels).toFixed(1)}, 0.0, 1.0);
    // 蓝 = 硬（接触处），橙 = 软（远离遮挡体）。看「近处硬远处软」有没有发生。
    gl_FragColor = vec4(mix(vec3(0.06, 0.16, 0.55), vec3(1.0, 0.62, 0.10), t), 1.0);
  }
}
`;

/**
 * 造三张阴影调试图，注册进 `DebugPass.RegisterView`。
 * 视图 id：`csmCascade`（级联假彩色）、`csmPenumbra`（半影尺寸）、
 * `contactShadow`（接触阴影靶本尊，走通用展示 pass 的 mode 2）。
 */
export function MakeShadowDebugViews(pipeline) {
  const uniforms = MakeSunShadowUniforms({
    uNormalDepth: { value: null },
    uInvView: { value: new THREE.Matrix4() },
    uProjScale: { value: new THREE.Vector2(1, 1) },
    uMode: { value: 0 },
  });
  const material = MakeFullscreenMaterial(FRAG_CASCADE_VIEW, uniforms);
  let rig = null;
  const Prepare = (ctx, mode) => {
    uniforms.uNormalDepth.value = ctx.normalDepthTexture;
    uniforms.uInvView.value.copy(ctx.invView);
    uniforms.uProjScale.value.copy(ctx.projScale);
    uniforms.uMode.value = mode;
    // 级联框每帧都在滚（跟相机 + 吸附纹素 + 逐级节流），矩阵必须现取。
    rig?.SyncShadowUniforms?.();
  };
  return {
    uniforms,
    material,
    /** DebugPass.SetSunShadowSource 转发过来：把这几张图接到当前的 LightRig 上。 */
    SetSunShadowSource(nextRig) {
      if (rig && rig !== nextRig) rig.UnregisterShadowUniforms?.(uniforms);
      rig = nextRig || null;
      rig?.RegisterShadowUniforms?.(uniforms);
      rig?.SyncShadowUniforms?.();
    },
    views: {
      // **可用性判据不许读 uSunShadowCount** —— 那个值是 Prepare 里 SyncUniforms 写的，
      // 而 GetSource 的 Unavailable 跑在 Prepare **之前**：第一次进这张图时它还是 0，
      // 于是永远画不可用斜纹、Prepare 永远不会跑。问 rig 要「第一级烘了没有」才对。
      csmCascade: {
        material,
        Prepare: (ctx) => Prepare(ctx, 0),
        Unavailable: () => !rig?.sun?.shadow?.map,
      },
      csmPenumbra: {
        material,
        Prepare: (ctx) => Prepare(ctx, 1),
        Unavailable: () => !rig?.sun?.shadow?.map,
      },
      contactShadow: {
        Texture: () => pipeline.targets.contactShadow?.texture ?? null,
        mode: 2,
        Unavailable: () => !pipeline.preset.contactShadows,
      },
    },
    Dispose() { material.dispose(); },
  };
}
