// 《台儿庄：血战滕县》SSAO：视空间半球采样 + 双边模糊。
//
// 2026-09 帧图重构把它从 `Script_Post.mjs` 原样搬出来 —— GLSL 与参数一个字没改，
// 逐比特与重构前相同。将来 GTAO 落地时**替换这个模块**（帧图里换掉这一行），
// 对外契约不变：产出 `targets.aoBlur`（R 通道 = 遮蔽量，G 通道 = 线性视深）。
//
// 铁律：AO 只压间接光。真正把它乘进 `reflectedLight.indirect*` 的地方在
// `Script_MaterialPatches.SsaoPatch`（`<aomap_fragment>` 之后），不在合成 pass。

import * as THREE from "three";
import { MakeFullscreenMaterial, MakeRenderTarget, GLSL_COMMON } from "./Script_PostCommon.mjs";

// ---------------------------------------------------------------------------
// SSAO：视空间半球采样。
// ---------------------------------------------------------------------------
const FRAG_SSAO = /* glsl */`
uniform sampler2D uNormalDepth;
uniform vec2 uResolution;
uniform mat4 uProjection;
uniform float uRadius;
uniform float uBias;
uniform float uIntensity;
uniform float uFrame;
uniform vec2 uProjScale;      // (1/tan(fov/2)/aspect, 1/tan(fov/2))
varying vec2 vUv;
${GLSL_COMMON}

const int SAMPLES = 14;
// 半球方向常量表：随机方向数组在低端 GPU 上会被展开成天文数字的常量，
// 这里用固定表 + 逐像素旋转，效果一样但编译得动。
const vec3 KERNEL[14] = vec3[14](
  vec3( 0.5381, 0.1856,  0.4319), vec3( 0.1379, 0.2486,  0.4430),
  vec3( 0.3371, 0.5679,  0.0057), vec3(-0.6999,-0.0451,  0.0019),
  vec3( 0.0689,-0.1598,  0.8547), vec3( 0.0560, 0.0069,  0.1843),
  vec3(-0.0146, 0.1402,  0.0762), vec3( 0.0100,-0.1924,  0.0344),
  vec3(-0.3577,-0.5301,  0.4358), vec3(-0.3169, 0.1063,  0.0158),
  vec3( 0.0103,-0.5869,  0.0046), vec3(-0.0897,-0.4940,  0.3287),
  vec3( 0.7119,-0.0154, -0.0918), vec3(-0.0533, 0.0596, -0.5411)
);

// 由屏幕 uv + 线性深度反推视空间坐标
vec3 ViewPos(vec2 uv, float depth) {
  vec2 ndc = uv * 2.0 - 1.0;
  return vec3(ndc.x / uProjScale.x, ndc.y / uProjScale.y, -1.0) * depth;
}

void main() {
  vec4 nd = texture2D(uNormalDepth, vUv);
  float depth = nd.w;
  if (depth <= 0.0 || depth > 400.0) { gl_FragColor = vec4(1.0); return; }
  vec3 normal = normalize(nd.xyz);
  vec3 origin = ViewPos(vUv, depth);

  // 逐像素随机切线：不转的话 14 个样本的图案会在墙上排成规则波纹
  float angle = Ign(gl_FragCoord.xy + uFrame * 5.588238) * 6.2831853;
  vec3 rvec = vec3(cos(angle), sin(angle), 0.0);
  vec3 tangent = normalize(rvec - normal * dot(rvec, normal));
  vec3 bitangent = cross(normal, tangent);
  mat3 tbn = mat3(tangent, bitangent, normal);

  // 双半径：阴天没有硬阴影，形体感全靠 AO。
  // 前 7 个样本走大半径抓大范围遮蔽，后 7 个走小半径抓贴根的接触阴影 ——
  // 只有一档半径的话，要么墙角糊成一片灰，要么沙包脚下什么都没有。
  float occlusion = 0.0;
  for (int i = 0; i < SAMPLES; i++) {
    // 抓出 AO 图（readRenderTargetPixels 直接把 aoBlur 导出来看）之后才发现的三处硬伤：
    //
    // ① KERNEL 这张表里的向量**长度差了一个数量级**（0.19 到 0.86 都有），
    //    直接当偏移用等于大部分样本只走出三五厘米 —— 墙根、砖块底下什么都探不到。
    //    正确做法是取方向再自己配长度。
    // ② 表里有三个向量的 z 是**负的**（−0.5411 / −0.0918 / +0.0019）。z<0 表示
    //    采样点扎到表面背面去，深度比较必然判"被遮挡" —— 全屏恒定多出约 14% 的
    //    遮蔽底噪，AO 图整体发灰，真正的接触带反而被这层底噪淹没。abs() 掰回来。
    // ③ 长度还要沿半径**铺开**（0.35→1.0），不然样本全挤在同一个壳上，
    //    暗带是一圈硬环而不是由深到浅的渐变。
    vec3 dir = normalize(vec3(KERNEL[i].xy, abs(KERNEL[i].z) + 0.25));
    // 近半径 0.30×（≈18 cm，砖墙根部暗带的真实宽度）；bias 跟着半径等比缩小 ——
    // 3 cm 的固定 bias 会把 18 cm 的接触半径吃掉六分之一，近处那一档就废了
    float t = float(i < 7 ? i : i - 7) / 6.0;
    float radius = ((i < 7) ? uRadius : uRadius * 0.30) * (0.35 + 0.65 * t);
    float bias = (i < 7) ? uBias : uBias * 0.30;
    vec3 samplePos = origin + (tbn * dir) * radius;
    vec4 clip = uProjection * vec4(samplePos, 1.0);
    vec2 suv = (clip.xy / clip.w) * 0.5 + 0.5;
    if (suv.x < 0.0 || suv.x > 1.0 || suv.y < 0.0 || suv.y > 1.0) continue;
    float sceneDepth = texture2D(uNormalDepth, suv).w;
    if (sceneDepth <= 0.0) continue;
    float sampleDepth = -samplePos.z;
    // 范围检查：远处的墙不该给近处的地面投 AO
    float rangeCheck = smoothstep(0.0, 1.0, radius / max(0.0001, abs(depth - sceneDepth)));
    occlusion += (sceneDepth <= sampleDepth - bias ? 1.0 : 0.0) * rangeCheck;
  }
  float ao = 1.0 - (occlusion / float(SAMPLES)) * uIntensity;
  gl_FragColor = vec4(clamp(ao, 0.0, 1.0), depth, 0.0, 1.0);
}
`;

// 双边模糊：跨深度边界不混，不然人物脚下的接触阴影会糊成一团光晕
const FRAG_AO_BLUR = /* glsl */`
uniform sampler2D uAo;
uniform vec2 uTexel;
uniform vec2 uDirection;
varying vec2 vUv;
void main() {
  vec2 center = texture2D(uAo, vUv).rg;
  float sum = center.r * 0.2270270270;
  float wsum = 0.2270270270;
  const float OFFSETS[3] = float[3](1.3846153846, 3.2307692308, 5.1153846154);
  const float WEIGHTS[3] = float[3](0.3162162162, 0.0702702703, 0.0162162162);
  for (int i = 0; i < 3; i++) {
    for (int s = -1; s <= 1; s += 2) {
      vec2 uv = vUv + uDirection * uTexel * OFFSETS[i] * float(s);
      vec2 t = texture2D(uAo, uv).rg;
      float dw = exp(-abs(t.g - center.g) * 2.0);
      sum += t.r * WEIGHTS[i] * dw;
      wsum += WEIGHTS[i] * dw;
    }
  }
  gl_FragColor = vec4(sum / max(wsum, 1e-4), center.g, 0.0, 1.0);
}
`;

export class SsaoPass {
  constructor(pipeline) {
    this.name = "ssao";
    this.pipeline = pipeline;
    this.uniforms = {
      uNormalDepth: { value: null }, uResolution: { value: new THREE.Vector2() },
      // 半径 0.52 / 强度 1.20。1.85 是上一轮的补偿值：那时候 AO 图被
      // Script_Main 喂错分辨率、整张错位放大 1.333 倍，看不见暗带就一路往上抬。
      // 采样位置修正之后再留 1.85 会把墙角压成一团死黑，退回 1.20。
      // 半径收小是为了让暗带贴根而不是整墙发灰。
      uProjection: { value: new THREE.Matrix4() }, uRadius: { value: 0.52 },
      uBias: { value: 0.030 }, uIntensity: { value: 1.20 }, uFrame: { value: 0 },
      uProjScale: { value: new THREE.Vector2(1, 1) },
    };
    this.material = MakeFullscreenMaterial(FRAG_SSAO, this.uniforms);
    this.uniformsBlur = {
      uAo: { value: null }, uTexel: { value: new THREE.Vector2() },
      uDirection: { value: new THREE.Vector2(1, 0) },
    };
    this.materialBlur = MakeFullscreenMaterial(FRAG_AO_BLUR, this.uniformsBlur);
    this.ao = null;
    this.aoTmp = null;
    this.aoBlur = null;
  }

  Enabled(ctx) { return !!ctx.preset.ssao; }

  Resize(width, height) {
    for (const rt of [this.ao, this.aoTmp, this.aoBlur]) if (rt) rt.dispose();
    const scale = this.pipeline.preset.aoScale;
    const aw = Math.max(2, Math.round(width * scale));
    const ah = Math.max(2, Math.round(height * scale));
    this.ao = MakeRenderTarget(aw, ah, { type: THREE.UnsignedByteType });
    this.aoTmp = MakeRenderTarget(aw, ah, { type: THREE.UnsignedByteType });
    this.aoBlur = MakeRenderTarget(aw, ah, { type: THREE.UnsignedByteType });
    this.pipeline.targets.ao = this.ao;
    this.pipeline.targets.aoTmp = this.aoTmp;
    this.pipeline.targets.aoBlur = this.aoBlur;
  }

  Render(ctx) {
    const U = this.uniforms;
    U.uNormalDepth.value = ctx.normalDepthTexture;
    U.uResolution.value.set(this.ao.width, this.ao.height);
    // 抖动的投影矩阵：预通道与主场景吃的是同一份，SSAO 必须跟着，否则采样位置
    // 与深度图差半个像素。ctx.projection 是干净矩阵，这里要的是相机当下那一份。
    U.uProjection.value.copy(ctx.camera.projectionMatrix);
    U.uProjScale.value.copy(ctx.projScale);
    U.uFrame.value = ctx.frame;
    // 调用点（Main / Probe）从来不传这两项，所以这里的默认值就是全场的实际值。
    // 0.52 → 0.60：抬了太阳之后阴影侧不再靠 IBL 提亮，AO 的大半径要够到墙角；
    // 1.20 → 1.50：接触带的 bias 修好之后强度才真的落在贴根那一圈，
    // 不会像以前那样整墙均匀发灰。
    U.uRadius.value = ctx.options.aoRadius ?? 0.60;
    U.uIntensity.value = ctx.options.aoIntensity ?? 1.85;
    ctx.blitter.Blit(this.material, this.ao);

    this.uniformsBlur.uTexel.value.set(1 / this.ao.width, 1 / this.ao.height);
    this.uniformsBlur.uAo.value = this.ao.texture;
    this.uniformsBlur.uDirection.value.set(1, 0);
    ctx.blitter.Blit(this.materialBlur, this.aoTmp);
    this.uniformsBlur.uAo.value = this.aoTmp.texture;
    this.uniformsBlur.uDirection.value.set(0, 1);
    ctx.blitter.Blit(this.materialBlur, this.aoBlur);
  }

  Dispose() {
    for (const rt of [this.ao, this.aoTmp, this.aoBlur]) if (rt) rt.dispose();
    this.material.dispose();
    this.materialBlur.dispose();
  }
}
