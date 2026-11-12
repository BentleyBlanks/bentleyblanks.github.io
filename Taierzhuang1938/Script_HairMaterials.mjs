// 头发 / 胡子的着色器（docs/Data_HairSystem.md §4）。四种几何、一套光照：
//
//   发丝 strands  导向发丝数据贴图 + 每根渲染发丝的实例属性，顶点着色器里插出发丝、按视线展开成带子；
//                 真实发丝不到一个像素宽，带子按最少 uMinPixels 像素画，「真宽 / 画宽」当覆盖率，片元按哈希丢弃（hashed alpha），
//                 靠 TAA 把一帧帧的随机覆盖积起来 —— UE 发丝在没有 MSAA 可见性缓冲时也是这条路。
//   发片 cards    图集一格一撮头发（R 覆盖 / G 根到梢 / B 发丝随机数 / A 前后深度），同样哈希丢弃。
//   头发壳 shell  不透明面，切线方向拉长的程序化条纹 + 发际线处按覆盖率丢弃。
//   胡茬 stubble  贴着皮肤的半透明一层，程序化短茬点（近看是一根根茬，远了退成平均颜色）。
//
// 光照照 UE4/5 的 HairShading（Marschner 三瓣 R / TT / TRT + Kajiya 式多次散射漫反射），底色由黑色素量算出；
// 自阴影 = 沿光线方向在发丝消光体素（Script_HairGroomBuild 烘的）里走 10 步；场景阴影走公共的太阳阴影接口
// （Script_Light.SUN_SHADOW_GLSL，级联 + PCSS，和体积雾、接触阴影同一份）；环境光吃 three 的 SH 探针 + 环境光。
//
// 预通道：材质都是自定义顶点位移，换不成预通道的覆盖材质，所以每种都带一份自己的预通道版本（userData.ownPrepass），
// 输出与 Script_PostPrepass 的覆盖材质同格式：RT0 = 视空间法线 + 视深，RT1 = 速度（无抖动 UV 差，上一帧模型矩阵由预通道给）。
// 哈希丢弃两趟用同一个帧号，预通道的轮廓和主场景一致。
import * as THREE from 'three';
import { SUN_SHADOW_GLSL, BindSunShadowUniforms } from './Script_Light.mjs';
import { HAIR_SHADING } from './Data_Tuning_Hair.mjs';

// ---------------------------------------------------------------------------------------------------------------
const GLSL_HASH = /* glsl */`
float HairIgn(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }
// 哈希丢弃：屏幕位置 + 帧号 + 发丝随机数（两根叠在同一像素的发丝要各丢各的）。
float HairCoverageHash(vec2 fragCoord, float frame, float seed) {
  vec2 p = fragCoord + vec2(seed * 113.7, seed * 71.3) + mod(frame, 64.0) * vec2(5.588238, 3.137);
  return HairIgn(p);
}
`;

// 发丝消光体素 + 自阴影
const GLSL_DENSITY = /* glsl */`
uniform highp sampler3D uDensity;
uniform vec3 uDensityMin;
uniform vec3 uDensityInvSize;
uniform float uDensityStep;
uniform float uExtinction;
float HairDensity(vec3 p) {
  vec3 uvw = (p - uDensityMin) * uDensityInvSize;
  if (any(lessThan(uvw, vec3(0.0))) || any(greaterThan(uvw, vec3(1.0)))) return 0.0;
  float d = textureLod(uDensity, uvw, 0.0).r;
  return d * d * uExtinction;
}
// 沿光线走 10 步的透过率（深阴影图的体素版）
float HairSelfShadow(vec3 p, vec3 l, float jitter) {
  float sum = 0.0;
  vec3 q = p + l * uDensityStep * (0.6 + jitter);
  for (int i = 0; i < 10; i++) { sum += HairDensity(q) * uDensityStep; q += l * uDensityStep; }
  return exp(-sum);
}
`;

// UE HairShading（HairBsdf.ush 的 Marschner 近似），视空间
const GLSL_BSDF = /* glsl */`
float HairPow2(float x) { return x * x; }
float HairG(float B, float theta) { return exp(-0.5 * theta * theta / (B * B)) / (2.5066283 * B); }
float HairF(float c) { const float F0 = 0.04652; return F0 + (1.0 - F0) * pow(1.0 - clamp(c, 0.0, 1.0), 5.0); }
vec3 HairColorFromMelanin(float melanin, float redness) {
  float m = -log(max(1.0 - clamp(melanin, 0.0, 0.995), 1e-4));
  float eu = m * (1.0 - redness), ph = m * redness;
  vec3 absorption = eu * vec3(0.506, 0.841, 1.653) + ph * vec3(0.343, 0.733, 1.924);
  // UE ColorFromAbsorption（Chiang 2016 的反函数，方位粗糙度 0.3 时分母约 5.65）：吸收 → 底色
  return exp(-sqrt(absorption) * ${(5.65 * HAIR_SHADING.melaninScale).toFixed(3)});
}
vec3 HairBsdf(vec3 T, vec3 V, vec3 L, vec3 base, float rough, float spec, float scatter, float backlit, float shadow) {
  float VoL = dot(V, L);
  float SinL = clamp(dot(T, L), -1.0, 1.0), SinV = clamp(dot(T, V), -1.0, 1.0);
  float CosThetaD = max(cos(0.5 * abs(asin(SinV) - asin(SinL))), 0.05);
  vec3 Lp = L - SinL * T, Vp = V - SinV * T;
  float CosPhi = dot(Lp, Vp) * inversesqrt(dot(Lp, Lp) * dot(Vp, Vp) + 1e-4);
  float CosHalfPhi = sqrt(clamp(0.5 + 0.5 * CosPhi, 0.0, 1.0));
  float nPrime = 1.19 / CosThetaD + 0.36 * CosThetaD;
  const float Shift = 0.035;
  float r2 = rough * rough;
  float B0 = max(r2, 0.015), B1 = max(r2 * 0.5, 0.008), B2 = max(r2 * 2.0, 0.03);
  vec3 S = vec3(0.0);
  // R：表面反射，白色主高光，往发根方向偏
  float sa = sin(-Shift * 2.0), ca = cos(-Shift * 2.0);
  float shiftR = 2.0 * sa * (ca * CosHalfPhi * sqrt(max(0.0, 1.0 - SinV * SinV)) + sa * SinV);
  float Mp = HairG(B0 * 1.41421 * CosHalfPhi + 1e-3, SinL + SinV - shiftR);
  float Np = 0.25 * CosHalfPhi;
  float Fp = HairF(sqrt(clamp(0.5 + 0.5 * VoL, 0.0, 1.0)));
  S += vec3(spec * 2.0 * Mp * Np * Fp) * mix(1.0, backlit, clamp(-VoL, 0.0, 1.0));
  // TT：穿过发丝（逆光时的透光边）
  Mp = HairG(B1, SinL + SinV - Shift);
  float a = 1.0 / nPrime;
  float h = CosHalfPhi * (1.0 + a * (0.6 - 0.8 * CosPhi));
  float f = HairF(CosThetaD * sqrt(clamp(1.0 - h * h, 0.0, 1.0)));
  Fp = HairPow2(1.0 - f);
  vec3 Tp = pow(base, vec3(0.5 * sqrt(max(0.0, 1.0 - HairPow2(h * a))) / CosThetaD));
  Np = exp(-3.65 * CosPhi - 3.98);
  S += Mp * Np * Fp * Tp * backlit;
  // TRT：内壁反射一次，带发色的第二高光
  Mp = HairG(B2, SinL + SinV - Shift * 4.0);
  f = HairF(CosThetaD * 0.5);
  Fp = HairPow2(1.0 - f) * f;
  Tp = pow(base, vec3(0.8 / CosThetaD));
  Np = exp(17.0 * CosPhi - 16.78);
  S += Mp * Np * Fp * Tp;
  // 多次散射（UE KajiyaKayDiffuseAttenuation）
  float kajiya = 1.0 - abs(SinL);
  vec3 fakeN = normalize(V - T * SinV);
  float NoL = clamp((dot(fakeN, L) + 1.0) * 0.25, 0.0, 1.0);
  float diffuse = 0.31831 * mix(NoL, kajiya, 0.33) * scatter;
  float luma = max(dot(base, vec3(0.3, 0.59, 0.11)), 1e-4);
  vec3 tint = pow(base / luma, vec3(1.0 - shadow));
  S += sqrt(base) * diffuse * tint;
  return S;
}
`;

// 公共光照：太阳（含场景阴影 × 自阴影）+ SH 探针 / 环境光
const GLSL_LIGHT = /* glsl */`
uniform float uRoughness;
uniform float uSpecular;
uniform float uScatter;
uniform float uBacklit;
uniform float uAmbient;
uniform float uEnvironmentReflection;
uniform vec3 uLightLocal;
uniform float uSelfShadow;
vec3 HairLight(vec3 T, vec3 V, vec3 base, vec3 worldPos, vec3 localPos, float occlusion, float jitter) {
  vec3 fakeN = normalize(V - T * dot(V, T));
  vec3 color = vec3(0.0);
#if NUM_DIR_LIGHTS > 0
  vec3 L = directionalLights[ 0 ].direction;
  vec3 worldN = inverseTransformDirection(fakeN, viewMatrix);
  float sun = SunShadowVisibility(worldPos, worldN);
  float volume = mix(1.0, HairSelfShadow(localPos, uLightLocal, jitter), uSelfShadow);
  float shadow = sun * volume;
  color += HairBsdf(T, V, L, base, uRoughness, uSpecular, uScatter, uBacklit, shadow) * directionalLights[ 0 ].color * shadow;
#endif
  vec3 irradiance = ambientLightColor;
#ifdef USE_LIGHT_PROBES
  irradiance += getLightProbeIrradiance(lightProbe, fakeN);
#endif
  color += irradiance * (base + sqrt(base) * uScatter * 0.35) * 0.31831 * occlusion * uAmbient;
  // Integrate the neutral surface-reflection lobe over the sky hemisphere.
  // Melanin absorbs transmitted light; this surface reflection keeps black
  // fibres readable under broad lighting even away from the sun highlight.
  color += irradiance * (uEnvironmentReflection * uSpecular * 2.0) * 0.31831 * occlusion * uAmbient;
  return color;
}
`;

const GLSL_MELANIN = /* glsl */`
vec3 HairMelaninColor(float melanin, float redness) {
  float m = -log(max(1.0 - clamp(melanin, 0.0, 0.995), 1e-4));
  vec3 absorption = m * (1.0 - redness) * vec3(0.506, 0.841, 1.653) + m * redness * vec3(0.343, 0.733, 1.924);
  return exp(-sqrt(absorption) * ${(5.65 * HAIR_SHADING.melaninScale).toFixed(3)});
}
`;
const GLSL_OUTPUT = /* glsl */`
vec4 HairOutput(vec3 color) {
  vec4 c = vec4(color, 1.0);
#ifdef TONE_MAPPING
  c.rgb = toneMapping(c.rgb);
#endif
  return linearToOutputTexel(c);
}
`;

const FRAGMENT_HEAD = /* glsl */`
precision highp float;
#include <common>
#include <lights_pars_begin>
${SUN_SHADOW_GLSL}
${GLSL_HASH}
${GLSL_DENSITY}
${GLSL_BSDF}
${GLSL_LIGHT}
${GLSL_OUTPUT}
`;

// 预通道的速度（与 Script_PostPrepass 覆盖材质同口径）
const PREPASS_VERTEX_UNIFORMS = /* glsl */`
uniform mat4 uViewProjection;
uniform mat4 uPrevViewProjection;
uniform mat4 uPrevModelMatrix;
uniform float uPrevModelValid;
uniform vec3 uPrevCameraLocal;
uniform float uPrevPixelScale;
uniform float uPrevModelScale;
out vec4 vCurClip;
out vec4 vPrevClip;
`;
const PREPASS_FRAGMENT = /* glsl */`
uniform float uVelocityValid;
uniform float uVelocityClamp;
in vec4 vCurClip;
in vec4 vPrevClip;
layout(location = 0) out vec4 oNormalDepth;
layout(location = 1) out vec4 oVelocity;
void HairPrepassOutput(vec3 viewNormal, float viewDepth) {
  oNormalDepth = vec4(viewNormal, viewDepth);
  vec2 motion = vec2(0.0);
  if (uVelocityValid > 0.5 && vCurClip.w > 0.0 && vPrevClip.w > 0.0) {
    vec2 curUv = vCurClip.xy / vCurClip.w * 0.5 + 0.5;
    vec2 prevUv = vPrevClip.xy / vPrevClip.w * 0.5 + 0.5;
    motion = clamp(curUv - prevUv, vec2(-uVelocityClamp), vec2(uVelocityClamp));
  }
  oVelocity = vec4(motion, 0.0, 1.0);
}
`;
function PrepassUniforms() {
  return {
    uViewProjection: { value: new THREE.Matrix4() }, uPrevViewProjection: { value: new THREE.Matrix4() },
    uPrevModelMatrix: { value: new THREE.Matrix4() }, uPrevModelValid: { value: 0 },
    uPrevCameraLocal: { value: new THREE.Vector3() }, uPrevPixelScale: { value: 0.001 }, uPrevModelScale: { value: 1 },
    uVelocityValid: { value: 0 }, uVelocityClamp: { value: 0.25 },
  };
}
const PREPASS_VELOCITY = /* glsl */`
  vec4 hairWorldNow = modelMatrix * vec4(hairLocal, 1.0);
  vec4 hairWorldPrev = uPrevModelValid > 0.5 ? uPrevModelMatrix * vec4(hairLocalPrev, 1.0) : hairWorldNow;
  vCurClip = uViewProjection * hairWorldNow;
  vPrevClip = uPrevViewProjection * hairWorldPrev;
`;

// ---------------------------------------------------------------------------------------------------------------
// 发丝
const STRAND_VERTEX = (prepass) => /* glsl */`
precision highp float;
uniform highp sampler2D uGuides;
uniform float uK;
uniform vec2 uWidth;
uniform float uWidthScale;
uniform float uClump;
uniform float uFrizz;
uniform vec2 uCurl;
uniform float uHairLength;
uniform float uPixelScale;
uniform float uMinPixels;
uniform vec3 uCameraLocal;
uniform float uModelScale;
attribute vec2 aVert;
attribute vec3 aGuides;
attribute vec2 aBary;
attribute vec2 aSeed;
out vec3 vTangent;
out vec3 vViewPos;
out vec3 vLocalPos;
out vec3 vWorldPos;
out float vCoverage;
out float vT;
out float vSeed;
out float vOpen;
${prepass ? PREPASS_VERTEX_UNIFORMS : ''}
vec4 HairGuide(float g, float f) {
  float i0 = floor(f);
  float i1 = min(i0 + 1.0, uK - 1.0);
  vec4 a = texelFetch(uGuides, ivec2(int(i0), int(g)), 0);
  vec4 b = texelFetch(uGuides, ivec2(int(i1), int(g)), 0);
  return mix(a, b, f - i0);
}
float HairHash1(float n) { return fract(sin(n) * 43758.5453); }
vec3 HairNoise3(float seed, float x) {
  float i = floor(x), t = x - i; t = t * t * (3.0 - 2.0 * t);
  vec3 a = vec3(HairHash1(seed * 17.0 + i), HairHash1(seed * 31.0 + i + 7.0), HairHash1(seed * 47.0 + i + 13.0));
  vec3 b = vec3(HairHash1(seed * 17.0 + i + 1.0), HairHash1(seed * 31.0 + i + 8.0), HairHash1(seed * 47.0 + i + 14.0));
  return mix(a, b, t) - 0.5;
}
// 插一根渲染发丝上参数 s 处的点（局部空间）：三根导向发丝重心插值 + 往聚簇中心收 + 卷曲 + 毛躁
vec3 HairPoint(float s, out float open) {
  float f = s * aSeed.y * (uK - 1.0);
  vec3 w = vec3(aBary, 1.0 - aBary.x - aBary.y);
  vec3 r0 = texelFetch(uGuides, ivec2(0, int(aGuides.x)), 0).xyz;
  vec3 r1 = texelFetch(uGuides, ivec2(0, int(aGuides.y)), 0).xyz;
  vec3 r2 = texelFetch(uGuides, ivec2(0, int(aGuides.z)), 0).xyz;
  vec4 p0 = HairGuide(aGuides.x, f), p1 = HairGuide(aGuides.y, f), p2 = HairGuide(aGuides.z, f);
  vec3 root = w.x * r0 + w.y * r1 + w.z * r2;
  vec3 S = w.x * (p0.xyz - r0) + w.y * (p1.xyz - r1) + w.z * (p2.xyz - r2);
  vec3 C = p0.xyz - r0;
  float k = uClump * s, sm = 1.0 - uClump * s * s * (3.0 - 2.0 * s);
  vec3 P = r0 + (root - r0) * sm + mix(S, C, k);
  open = clamp(w.x * p0.w + w.y * p1.w + w.z * p2.w, 0.0, 1.0);
  // 局部标架：沿聚簇中心那根导向发丝的切线
  vec3 Tg = HairGuide(aGuides.x, min(f + 0.5, uK - 1.0)).xyz - HairGuide(aGuides.x, max(f - 0.5, 0.0)).xyz;
  Tg = length(Tg) > 1e-7 ? normalize(Tg) : vec3(0.0, 1.0, 0.0);
  vec3 N1 = normalize(cross(Tg, abs(Tg.y) < 0.9 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0)));
  vec3 N2 = cross(Tg, N1);
  float len = uHairLength * aSeed.y;
  if (uCurl.x > 0.0) {   // 卷：同一聚簇相位一致（不然插值会把卷抹平），每根再错一点
    float phase = HairHash1(aGuides.x * 0.731) * 6.2832 + aSeed.x * 1.4 + s * len / max(uCurl.y, 1e-3) * 6.2832;
    float r = uCurl.x * smoothstep(0.0, 0.2, s);
    P += (N1 * cos(phase) + N2 * sin(phase)) * r;
  }
  float stray = aSeed.x > 0.985 ? 3.5 : 1.0;   // 少数几根乱翘
  vec3 n = HairNoise3(aSeed.x * 97.0, s * 5.0 + aSeed.x * 11.0);
  P += (N1 * n.x + N2 * n.y + Tg * n.z * 0.3) * uFrizz * stray * (0.04 * len + 0.0006) * pow(s, 1.3);
  return P;
}
void main() {
  float s = aVert.x;
  float open;
  vec3 P = HairPoint(s, open);
  float o2;
  float ds = 1.0 / (uK * 2.0 + 2.0);
  vec3 Pa = HairPoint(max(s - ds, 0.0), o2), Pb = HairPoint(min(s + ds, 1.0), o2);
  vec3 T = Pb - Pa;
  T = length(T) > 1e-8 ? normalize(T) : vec3(0.0, 1.0, 0.0);
  vec3 toCam = normalize(uCameraLocal - P);
  vec3 side = cross(T, toCam);
  side = length(side) > 1e-6 ? normalize(side) : vec3(1.0, 0.0, 0.0);
  float width = mix(uWidth.x, uWidth.y, s) * uWidthScale * uModelScale;
  float dist = max(length(uCameraLocal - P) * uModelScale, 1e-3);
  float px = uPixelScale * dist;
  float drawn = max(width, px * uMinPixels);
  vCoverage = clamp(width / drawn, 0.0, 1.0) * (1.0 - smoothstep(0.82, 1.0, s) * 0.7);
  vec3 hairLocal = P + side * aVert.y * drawn * 0.5 / uModelScale;
  ${prepass ? `
  vec3 prevSide = cross(T, normalize(uPrevCameraLocal - P));
  prevSide = length(prevSide) > 1e-6 ? normalize(prevSide) : vec3(1.0, 0.0, 0.0);
  float prevScale = max(uPrevModelScale, 1e-6);
  float prevWidth = mix(uWidth.x, uWidth.y, s) * uWidthScale * prevScale;
  float prevDist = max(length(uPrevCameraLocal - P) * prevScale, 1e-3);
  float prevDrawn = max(prevWidth, uPrevPixelScale * prevDist * uMinPixels);
  vec3 hairLocalPrev = P + prevSide * aVert.y * prevDrawn * 0.5 / prevScale;
  ` : ''}
  vec4 mv = modelViewMatrix * vec4(hairLocal, 1.0);
  vViewPos = mv.xyz;
  vLocalPos = P;
  vWorldPos = (modelMatrix * vec4(hairLocal, 1.0)).xyz;
  vTangent = normalize(mat3(modelViewMatrix) * T);
  vT = s;
  vSeed = aSeed.x;
  vOpen = open;
  gl_Position = projectionMatrix * mv;
  ${prepass ? PREPASS_VELOCITY : ''}
}
`;
// Registered portrait detail is fixed in head-local space, including on the
// actual fibres. The original strand coverage still owns colour and prepass.
const GLSL_REFERENCE_FRONT = /* glsl */`
uniform vec2 uReferenceCenter;
uniform vec2 uReferenceFrontFade;
float ReferenceFrontWeight(vec3 p) {
  float phi = degrees(atan(abs(p.x-uReferenceCenter.x)+.000001,-(p.z-uReferenceCenter.y)));
  return 1.0-smoothstep(uReferenceFrontFade.x,uReferenceFrontFade.y,phi);
}
`;
const GLSL_REFERENCE_COLOUR = /* glsl */`
${GLSL_REFERENCE_FRONT}
uniform sampler2D uReferenceMask;
uniform vec4 uReferenceRows[6];
uniform vec2 uReferenceWidths[6];
uniform vec4 uReferenceCrop;
uniform vec4 uReferenceTile;
uniform float uReferenceImageCenter;
uniform vec2 uReferenceCrown;
uniform float uReferenceMean;
uniform float uReferenceMelanin;
vec2 ReferenceHairDetail(vec3 p) {
  vec4 upper = uReferenceRows[0], lower = uReferenceRows[1];
  vec2 upperWidth = uReferenceWidths[0], lowerWidth = uReferenceWidths[1];
  for (int i = 1; i < 6; i++) {
    upper = uReferenceRows[i-1]; lower = uReferenceRows[i];
    upperWidth = uReferenceWidths[i-1]; lowerWidth = uReferenceWidths[i];
    if (p.y >= lower.x || i == 5) break;
  }
  float t = min(1.0, (upper.x-p.y) / max(upper.x-lower.x, .0001));
  vec4 row = mix(upper, lower, t);
  vec2 widths = mix(upperWidth, lowerWidth, t);
  float dx = p.x-uReferenceCenter.x;
  float distanceX = abs(dx);
  float imageX = distanceX <= row.z ? distanceX/row.z*row.w
    : row.w+(distanceX-row.z)/(widths.x-row.z)*(widths.y-row.w);
  vec2 imagePosition = vec2(uReferenceImageCenter-sign(dx)*imageX, row.y);
  vec2 localUv = (imagePosition-uReferenceCrop.xy)/uReferenceCrop.zw;
  float inside = step(0.0,localUv.x)*step(0.0,localUv.y)*step(localUv.x,1.0)*step(localUv.y,1.0);
  vec2 uv = uReferenceTile.xy+clamp(localUv,.001,.999)*uReferenceTile.zw;
  vec3 sampleValue = texture(uReferenceMask,uv).rgb;
  float front = ReferenceFrontWeight(p);
  float crown = smoothstep(uReferenceCrown.x,uReferenceCrown.y,p.y);
  float weight = inside*max(front,crown)*smoothstep(.02,.3,sampleValue.g);
  float detail = clamp(sqrt(max(pow(sampleValue.b,2.2),.0001)/uReferenceMean),.4,2.5);
  return vec2(weight,detail);
}
`;

const STRAND_FRAGMENT = (reference) => /* glsl */`
${FRAGMENT_HEAD}
${reference ? GLSL_REFERENCE_COLOUR : ''}
uniform float uFrame;
uniform float uFade;
uniform float uMelanin;
uniform float uRedness;
uniform float uGray;
in vec3 vTangent;
in vec3 vViewPos;
in vec3 vLocalPos;
in vec3 vWorldPos;
in float vCoverage;
in float vT;
in float vSeed;
in float vOpen;
layout(location = 0) out vec4 fragColor;
void main() {
  ${reference ? 'vec2 photo = ReferenceHairDetail(vLocalPos);' : ''}
  float h = HairCoverageHash(gl_FragCoord.xy, uFrame, vSeed);
  if (h > vCoverage * uFade) discard;
  vec3 T = normalize(vTangent);
  vec3 V = normalize(-vViewPos);
  float gray = step(vSeed, uGray);
  vec3 base = HairColorFromMelanin(uMelanin * mix(0.94, 1.0, fract(vSeed * 7.31)) * mix(1.0, 0.9, vT * 0.4), uRedness);
  ${reference ? 'base = mix(base, vec3(dot(base,vec3(.3,.59,.11))), photo.x*(1.0-clamp(abs(uMelanin-uReferenceMelanin)*4.0,0.0,1.0)));' : ''}
  base = mix(base, vec3(0.62, 0.6, 0.56), gray);
  float occ = mix(0.25, 1.0, vOpen);
  fragColor = HairOutput(HairLight(T, V, base, vWorldPos, vLocalPos, occ, fract(h * 7.0)) ${reference ? '* mix(1.0,photo.y,photo.x)' : ''});
}
`;
const STRAND_PREPASS_FRAGMENT = /* glsl */`
precision highp float;
${GLSL_HASH}
uniform float uFrame;
uniform float uFade;
in vec3 vTangent;
in vec3 vViewPos;
in float vCoverage;
in float vSeed;
${PREPASS_FRAGMENT}
void main() {
  if (HairCoverageHash(gl_FragCoord.xy, uFrame, vSeed) > vCoverage * uFade) discard;
  vec3 T = normalize(vTangent), V = normalize(-vViewPos);
  HairPrepassOutput(normalize(V - T * dot(V, T)), -vViewPos.z);
}
`;

// ---------------------------------------------------------------------------------------------------------------
// 发片 / 头发壳 / 胡茬：普通网格，局部空间顶点
const MESH_VERTEX = (prepass, skinBeard = false) => /* glsl */`
precision highp float;
attribute vec3 aTangent;
attribute vec3 aData;
${skinBeard ? 'attribute vec4 aBoneIndices; attribute vec4 aBoneWeights; uniform mat4 uBeardBones[8];' : ''}
${skinBeard && prepass ? 'uniform mat4 uPrevBeardBones[8];' : ''}
out vec3 vTangent;
out vec3 vNormalV;
out vec3 vViewPos;
out vec3 vLocalPos;
out vec3 vWorldPos;
out vec2 vUv;
out vec3 vData;
out vec3 vTangentL;
${prepass ? PREPASS_VERTEX_UNIFORMS : ''}
void main() {
  ${skinBeard ? `
  vec3 hairLocal = vec3(0.0), hairTangent = vec3(0.0), hairNormal = vec3(0.0);
  ${prepass ? 'vec3 hairLocalPrev = vec3(0.0);' : ''}
  for (int k = 0; k < 4; k++) {
    int bone = int(aBoneIndices[k]);
    float weight = aBoneWeights[k];
    hairLocal += (uBeardBones[bone] * vec4(position, 1.0)).xyz * weight;
    hairTangent += mat3(uBeardBones[bone]) * aTangent * weight;
    hairNormal += mat3(uBeardBones[bone]) * normal * weight;
    ${prepass ? 'hairLocalPrev += (uPrevBeardBones[bone] * vec4(position, 1.0)).xyz * weight;' : ''}
  }
  hairTangent = normalize(hairTangent);
  hairNormal = normalize(hairNormal);` : `
  vec3 hairLocal = position;
  vec3 hairTangent = aTangent;
  vec3 hairNormal = normal;
  ${prepass ? 'vec3 hairLocalPrev = position;' : ''}`}
  vTangentL = hairTangent;
  vec4 mv = modelViewMatrix * vec4(hairLocal, 1.0);
  vViewPos = mv.xyz;
  vLocalPos = position;
  vWorldPos = (modelMatrix * vec4(hairLocal, 1.0)).xyz;
  vTangent = normalize(mat3(modelViewMatrix) * hairTangent);
  vNormalV = normalize(normalMatrix * hairNormal);
  vUv = uv;
  vData = aData;
  gl_Position = projectionMatrix * mv;
  ${prepass ? PREPASS_VELOCITY : ''}
}
`;
const CARD_FRAGMENT = (reference) => /* glsl */`
${FRAGMENT_HEAD}
${reference ? GLSL_REFERENCE_COLOUR : ''}
uniform sampler2D uAtlas;
uniform float uFrame;
uniform float uFade;
uniform float uMelanin;
uniform float uRedness;
uniform float uGray;
uniform float uAlphaScale;
in vec3 vTangent;
in vec3 vNormalV;
in vec3 vViewPos;
in vec3 vLocalPos;
in vec3 vWorldPos;
in vec2 vUv;
in vec3 vData;
layout(location = 0) out vec4 fragColor;
void main() {
  ${reference ? 'vec2 photo = ReferenceHairDetail(vLocalPos);' : ''}
  vec4 t = texture(uAtlas, vUv);
  float h = HairCoverageHash(gl_FragCoord.xy, uFrame, t.b + vData.y);
  if (h > t.r * uAlphaScale * uFade) discard;
  vec3 N = normalize(vNormalV);
  vec3 T = normalize(vTangent);
  // 每根发丝在发片平面里偏一点，免得一片的高光是一整条
  vec3 B = normalize(cross(N, T));
  T = normalize(T + B * (t.b - 0.5) * 0.22);
  vec3 V = normalize(-vViewPos);
  float seed = fract(t.b * 3.7 + vData.y);
  float gray = step(seed, uGray);
  vec3 base = HairColorFromMelanin(uMelanin * mix(0.94, 1.0, fract(seed * 7.31)) * mix(1.0, 0.9, t.g * 0.4), uRedness);
  ${reference ? 'base = mix(base, vec3(dot(base,vec3(.3,.59,.11))), photo.x*(1.0-clamp(abs(uMelanin-uReferenceMelanin)*4.0,0.0,1.0)));' : ''}
  base = mix(base, vec3(0.62, 0.6, 0.56), gray);
  float occ = mix(0.3, 1.0, (1.0 - t.a) * 0.6 + vData.z * 0.4) * mix(0.55, 1.0, t.g);
  fragColor = HairOutput(HairLight(T, V, base, vWorldPos, vLocalPos, occ, fract(h * 7.0)) ${reference ? '* mix(1.0,photo.y,photo.x)' : ''});
}
`;
const CARD_PREPASS_FRAGMENT = /* glsl */`
precision highp float;
${GLSL_HASH}
uniform sampler2D uAtlas;
uniform float uFrame;
uniform float uFade;
uniform float uAlphaScale;
in vec3 vTangent;
in vec3 vViewPos;
in vec2 vUv;
in vec3 vData;
${PREPASS_FRAGMENT}
void main() {
  vec4 t = texture(uAtlas, vUv);
  if (HairCoverageHash(gl_FragCoord.xy, uFrame, t.b + vData.y) > t.r * uAlphaScale * uFade) discard;
  vec3 T = normalize(vTangent), V = normalize(-vViewPos);
  HairPrepassOutput(normalize(V - T * dot(V, T)), -vViewPos.z);
}
`;
const GLSL_STREAKS = /* glsl */`
float HairShellHash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float HairShellNoise(vec3 x) {
  vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(HairShellHash(i), HairShellHash(i + vec3(1, 0, 0)), f.x), mix(HairShellHash(i + vec3(0, 1, 0)), HairShellHash(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(HairShellHash(i + vec3(0, 0, 1)), HairShellHash(i + vec3(1, 0, 1)), f.x), mix(HairShellHash(i + vec3(0, 1, 1)), HairShellHash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
// 沿切线拉长的条纹：把位置在切线方向上的分量压掉，噪声只在横向变化
float HairStreaks(vec3 p, vec3 t, float freq) {
  vec3 q = (p - t * dot(p, t) * 0.97) * freq;
  return HairShellNoise(q) * 0.6 + HairShellNoise(q * 2.7 + 13.1) * 0.4;
}
`;
const SHELL_FRAGMENT = /* glsl */`
${FRAGMENT_HEAD}
${GLSL_STREAKS}
uniform float uFrame;
uniform float uFade;
uniform float uMelanin;
uniform float uRedness;
uniform float uGray;
uniform float uOpacity;
uniform float uStreakFreq;
in vec3 vTangent;
in vec3 vNormalV;
in vec3 vViewPos;
in vec3 vLocalPos;
in vec3 vWorldPos;
in vec2 vUv;
in vec3 vData;
in vec3 vTangentL;
layout(location = 0) out vec4 fragColor;
void main() {
  vec3 Tl = normalize(vTangentL);
  float st = HairStreaks(vLocalPos, Tl, uStreakFreq);
  float coverage = clamp(vData.x * uOpacity * (0.75 + st * 0.5), 0.0, 1.0);
  float h = HairCoverageHash(gl_FragCoord.xy, uFrame, 0.37);
  if (h > coverage * uFade) discard;
  vec3 T = normalize(vTangent + normalize(vNormalV) * (st - 0.5) * 0.25);
  vec3 V = normalize(-vViewPos);
  vec3 base = HairColorFromMelanin(uMelanin * mix(0.93, 1.0, st), uRedness);
  base = mix(base, vec3(0.62, 0.6, 0.56), uGray);
  float occ = mix(0.35, 0.85, st);
  fragColor = HairOutput(HairLight(T, V, base, vWorldPos, vLocalPos, occ, fract(h * 7.0)));
}
`;
const SHELL_PREPASS_FRAGMENT = /* glsl */`
precision highp float;
${GLSL_HASH}
${GLSL_STREAKS}
uniform float uFrame;
uniform float uFade;
uniform float uOpacity;
uniform float uStreakFreq;
in vec3 vTangent;
in vec3 vNormalV;
in vec3 vViewPos;
in vec3 vLocalPos;
in vec3 vData;
in vec3 vTangentL;
${PREPASS_FRAGMENT}
void main() {
  vec3 Tl = normalize(vTangentL);
  float st = HairStreaks(vLocalPos, Tl, uStreakFreq);
  float coverage = clamp(vData.x * uOpacity * (0.75 + st * 0.5), 0.0, 1.0);
  if (HairCoverageHash(gl_FragCoord.xy, uFrame, 0.37) > coverage * uFade) discard;
  HairPrepassOutput(normalize(vNormalV), -vViewPos.z);
}
`;
// 胡茬：贴在皮肤上的半透明层。茬按 uCell 一格一根，近看画出每根，远了退成平均覆盖。
const STUBBLE_FRAGMENT = /* glsl */`
precision highp float;
#include <common>
${GLSL_OUTPUT}
${GLSL_MELANIN}
uniform float uMelanin;
uniform float uRedness;
uniform float uDensity;
uniform float uStubLength;
uniform float uPerVertexLength;
uniform float uCoverageScale;
uniform float uCell;
uniform float uPixelScale;
uniform float uFade;
in vec3 vNormalV;
in vec3 vViewPos;
in vec3 vLocalPos;
in vec3 vData;
in vec3 vTangent;
layout(location = 0) out vec4 fragColor;
float StubHash(vec3 p) { p = fract(p * vec3(0.1031, 0.1030, 0.0973)); p += dot(p, p.yxz + 33.33); return fract((p.x + p.y) * p.z); }
void main() {
  float density = vData.x * uDensity;
  if (density <= 0.002) discard;
  float px = uPixelScale * max(-vViewPos.z, 0.01);
  // 平均覆盖：一格里一根茬（长 × 宽）占的面积
  float width = 0.00009;
  float stubLength = max(0.0006, mix(uStubLength, vData.y, uPerVertexLength));
  float avg = clamp(stubLength * width / (uCell * uCell), 0.0, 1.0);
  // 近看：在格子里找最近的茬（3×3×3 邻格），算到茬线段的距离
  vec3 q = vLocalPos / uCell;
  vec3 cell = floor(q);
  float best = 1e9;
  for (int z = -1; z <= 1; z++) for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec3 c = cell + vec3(x, y, z);
    if (StubHash(c * 1.37) > density) continue;
    vec3 a = (c + vec3(StubHash(c), StubHash(c + 17.1), StubHash(c + 31.7))) * uCell;
    vec3 dir = normalize(vec3(StubHash(c + 3.3) - 0.5, -1.0, StubHash(c + 5.9) - 0.5));
    vec3 b = a + dir * stubLength;
    vec3 pa = vLocalPos - a, ba = b - a;
    float t = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
    best = min(best, length(pa - ba * t));
  }
  float stub = 1.0 - smoothstep(width * 0.5, width * 0.5 + px, best);
  // A beard fibre is already unresolved once a pixel spans its 90 µm
  // diameter. Delaying this transition to 0.6 mm leaves only isolated dots.
  float alpha = mix(stub * width / (width + px), avg * density, smoothstep(0.00004, 0.00015, px));
  alpha = clamp(alpha * uCoverageScale * uFade, 0.0, 0.85);
  if (alpha < 0.004) discard;
  vec3 base = HairMelaninColor(uMelanin, uRedness);
  fragColor = HairOutput(base * 0.5 + 0.004);
  fragColor.a = alpha;
}
`;

const REFERENCE_BEARD_FRAGMENT = /* glsl */`
precision highp float;
#include <common>
#include <lights_pars_begin>
${SUN_SHADOW_GLSL}
${GLSL_OUTPUT}
${GLSL_MELANIN}
${GLSL_REFERENCE_FRONT}
uniform sampler2D uReferenceMask;
uniform float uChinY;
uniform sampler2D uReferenceBeardLuminance;
uniform float uUseReferenceLuminance;
uniform float uReferenceLuminanceGain;
uniform float uReferenceMelanin;
uniform float uMelanin;
uniform float uRedness;
uniform float uGray;
uniform float uCoverageGain;
uniform float uCoverageScale;
uniform float uFade;
in vec2 vUv;
in vec3 vData;
in vec3 vLocalPos;
in vec3 vNormalV;
in vec3 vWorldPos;
layout(location = 0) out vec4 fragColor;
void main() {
  float coverage = min(1.0, texture(uReferenceMask, vUv).r * uCoverageGain) * uCoverageScale * vData.x * uFade * ReferenceFrontWeight(vLocalPos);
  coverage *= smoothstep(uChinY - .001, uChinY + .002, vLocalPos.y);
  if (coverage < .003) discard;
  vec3 normalV = normalize(vNormalV);
  vec3 illumination = ambientLightColor;
#ifdef USE_LIGHT_PROBES
  illumination += getLightProbeIrradiance(lightProbe, normalV);
#endif
#if NUM_DIR_LIGHTS > 0
  vec3 worldNormal = inverseTransformDirection(normalV, viewMatrix);
  illumination += directionalLights[0].color * max(0.0, dot(normalV, directionalLights[0].direction)) * SunShadowVisibility(vWorldPos, worldNormal);
#endif
  vec3 color = mix(HairMelaninColor(uMelanin, uRedness)*.5+.004,
    vec3(.62, .6, .56)*illumination*.31831+.004, uGray);
  float originalPigment = max(dot(HairMelaninColor(uReferenceMelanin,uRedness),vec3(.3,.59,.11)),.0001);
  float pigment = max(dot(HairMelaninColor(uMelanin,uRedness),vec3(.3,.59,.11)),.0001);
  float luminance = min(.6,pow(texture(uReferenceBeardLuminance,vUv).r,2.2)*uReferenceLuminanceGain);
  color = mix(color,vec3(luminance)*illumination*.31831*sqrt(pigment/originalPigment),uUseReferenceLuminance);
  fragColor = HairOutput(color);
  fragColor.a = coverage;
}
`;

// 头皮染色：贴着头皮的半透明深色，发根之间不透出光头皮。覆盖率按发际线渐变，再加一点细噪声免得像一块贴纸。
const SCALP_FRAGMENT = (reference) => /* glsl */`
precision highp float;
#include <common>
${reference ? '#include <lights_pars_begin>\n' + SUN_SHADOW_GLSL : ''}
${GLSL_OUTPUT}
${GLSL_MELANIN}
${GLSL_STREAKS}
${reference ? GLSL_REFERENCE_FRONT : ''}
uniform float uMelanin;
uniform float uRedness;
uniform float uStrength;
uniform float uFade;
${reference ? 'uniform sampler2D uReferenceMask; uniform float uReferenceMelanin; in vec2 vUv; in vec3 vNormalV; in vec3 vWorldPos;' : ''}
in vec3 vLocalPos;
in vec3 vData;
in vec3 vTangentL;
layout(location = 0) out vec4 fragColor;
void main() {
  float st = HairStreaks(vLocalPos, normalize(vTangentL), 900.0);
  float alpha = clamp(pow(vData.x, 0.8) * uStrength * (0.8 + 0.35 * st), 0.0, 0.92) * uFade;
  ${reference ? 'float referenceBlend = vData.z * ReferenceFrontWeight(vLocalPos); alpha = mix(alpha, texture(uReferenceMask, vUv).g * uFade, referenceBlend);' : ''}
  if (alpha < 0.004) discard;
  vec3 base = HairMelaninColor(uMelanin, uRedness);
  vec3 color = base * 0.6 + 0.003;
  ${reference ? `
  vec3 normalV = normalize(vNormalV);
  vec3 illumination = ambientLightColor;
#ifdef USE_LIGHT_PROBES
  illumination += getLightProbeIrradiance(lightProbe, normalV);
#endif
#if NUM_DIR_LIGHTS > 0
  vec3 worldNormal = inverseTransformDirection(normalV, viewMatrix);
  float visibility = SunShadowVisibility(vWorldPos, worldNormal);
  illumination += directionalLights[0].color * max(0.0, dot(normalV, directionalLights[0].direction)) * visibility;
#endif
  float fibreLuminance = pow(texture(uReferenceMask, vUv).b, 2.2);
  vec3 pigment = sqrt(base);
  float pigmentLuminance = max(dot(pigment, vec3(.3, .59, .11)), .0001);
  float originalLuminance = max(dot(sqrt(HairMelaninColor(uReferenceMelanin, uRedness)), vec3(.3, .59, .11)), .0001);
  float dyeAmount = clamp(abs(uMelanin-uReferenceMelanin)*4.0, 0.0, 1.0);
  vec3 dye = mix(vec3(1.0), pigment/pigmentLuminance, dyeAmount) * sqrt(pigmentLuminance/originalLuminance);
  color = mix(color, vec3(fibreLuminance) * dye * illumination * 0.31831, referenceBlend);
  ` : ''}
  fragColor = HairOutput(color);
  fragColor.a = alpha;
}
`;

// ---------------------------------------------------------------------------------------------------------------
// 材质工厂。shared = 这一套头发所有材质共用的逐帧 uniform（帧号、光方向、相机局部位置、像素尺度……）
export function MakeHairSharedUniforms() {
  return {
    uFrame: { value: 0 }, uLightLocal: { value: new THREE.Vector3(0, 1, 0) }, uCameraLocal: { value: new THREE.Vector3() },
    uPixelScale: { value: 0.001 }, uModelScale: { value: 1 }, uMinPixels: { value: HAIR_SHADING.minPixels },
    uSelfShadow: { value: 1 }, uAmbient: { value: HAIR_SHADING.ambient }, uBacklit: { value: HAIR_SHADING.backlit },
    uEnvironmentReflection: {value: HAIR_SHADING.environmentReflection},
  };
}
function DensityUniforms(density) {
  return {
    uDensity: { value: density.texture }, uDensityMin: { value: density.min.clone() }, uDensityInvSize: { value: density.invSize.clone() },
    uDensityStep: { value: density.step }, uExtinction: { value: density.extinction * HAIR_SHADING.extinctionScale },
  };
}
function LitMaterial(vertexShader, fragmentShader, uniforms, { lightRig, side = THREE.DoubleSide, transparent = false } = {}) {
  const merged = THREE.UniformsUtils.merge([THREE.UniformsLib.lights]);
  Object.assign(merged, uniforms);
  BindSunShadowUniforms(merged, lightRig || null);
  const m = new THREE.ShaderMaterial({ glslVersion: THREE.GLSL3, vertexShader, fragmentShader, uniforms: merged, lights: true, side, transparent });
  m.allowOverride = false;   // 预通道换不了它：由 userData.ownPrepass 那份自己画
  m.userData.hairLightRig = lightRig || null;
  return m;
}
function PrepassMaterial(vertexShader, fragmentShader, uniforms, side = THREE.DoubleSide) {
  const m = new THREE.ShaderMaterial({ glslVersion: THREE.GLSL3, vertexShader, fragmentShader, uniforms: { ...uniforms, ...PrepassUniforms() }, side });
  m.allowOverride = false;
  m.userData.hairPrepass = true;
  return m;
}
function ColorUniforms(color) {
  return { uMelanin: { value: color.melanin }, uRedness: { value: color.redness }, uGray: { value: color.gray ?? 0 } };
}
function ReferenceFrontUniforms(center) {
  return {
    uReferenceCenter: {value: new THREE.Vector2().fromArray(center)},
    uReferenceFrontFade: {value: new THREE.Vector2().fromArray(HAIR_SHADING.referenceFrontFadeDegrees)},
  };
}
function ReferenceColourUniforms(reference, atlas, melanin) {
  if (!atlas) throw new Error('Missing original-reference fibre atlas');
  const registration = reference.projection;
  if (registration.rows.length !== 6) throw new Error('Hair reference requires six registered height rows');
  const [left, top, right, bottom] = reference.crop;
  return {
    uReferenceMask: {value: atlas},
    uReferenceRows: {value: registration.rows.map(row => new THREE.Vector4(row.y, row.imageY, row.innerX, row.innerImageX))},
    uReferenceWidths: {value: registration.rows.map(row => new THREE.Vector2(row.outerX, row.outerImageX))},
    uReferenceCrop: {value: new THREE.Vector4(left, top, right-left, bottom-top)},
    uReferenceTile: {value: new THREE.Vector4().fromArray(reference.tile)},
    ...ReferenceFrontUniforms([registration.centerX, reference.centerZ]),
    uReferenceImageCenter: {value: registration.reference.centerX},
    uReferenceCrown: {value: new THREE.Vector2(reference.top-.065, reference.top-.02)},
    uReferenceMean: {value: Math.max(reference.normalizationLuminance ?? reference.meanLuminance ?? .005, .0001)},
    uReferenceMelanin: {value: melanin},
  };
}

export function MakeStrandMaterials(hair, shared, lightRig, referenceAtlas = null) {
  const r = hair.render;
  const reference = !!hair.referenceScalp?.projection;
  const own = {
    uGuides: { value: hair.guideTexture }, uK: { value: hair.points }, uWidth: { value: new THREE.Vector2(r.width[0], r.width[1]) },
    uWidthScale: { value: 1 }, uClump: { value: r.clump }, uFrizz: { value: r.frizz }, uCurl: { value: new THREE.Vector2(r.curl[0], r.curl[1]) },
    uHairLength: { value: r.length }, uFade: { value: 1 },
    uRoughness: { value: r.roughness }, uSpecular: { value: r.specular }, uScatter: { value: r.scatter },
  };
  if (reference) Object.assign(own, ReferenceColourUniforms(hair.referenceScalp, referenceAtlas, r.color.melanin));
  const uniforms = { ...shared, ...own, ...ColorUniforms(r.color), ...DensityUniforms(hair.density) };
  const main = LitMaterial(STRAND_VERTEX(false), STRAND_FRAGMENT(reference), uniforms, { lightRig });
  const prepass = PrepassMaterial(STRAND_VERTEX(true), STRAND_PREPASS_FRAGMENT, { ...shared, ...own });
  return { main, prepass, own };
}
export function MakeCardMaterials(part, atlas, shared, lightRig, density, referenceAtlas = null, skinBeard = null) {
  const r = part.render;
  const reference = !!part.referenceScalp?.projection;
  const own = { uAtlas: { value: atlas }, uFade: { value: 1 }, uAlphaScale: { value: HAIR_SHADING.cardAlphaScale * (part.render.cardAlphaScale ?? (part.stubble?.perVertexLength ? HAIR_SHADING.referenceBeardAlphaScale : 1)) },
    uRoughness: { value: r.roughness }, uSpecular: { value: r.specular }, uScatter: { value: r.scatter } };
  if (reference) Object.assign(own, ReferenceColourUniforms(part.referenceScalp, referenceAtlas, r.color.melanin));
  const uniforms = { ...shared, ...own, ...ColorUniforms(r.color), ...DensityUniforms(density), ...(skinBeard || {}) };
  const main = LitMaterial(MESH_VERTEX(false, !!skinBeard), CARD_FRAGMENT(reference), uniforms, { lightRig });
  const prepass = PrepassMaterial(MESH_VERTEX(true, !!skinBeard), CARD_PREPASS_FRAGMENT, { ...shared, ...own, ...(skinBeard || {}) });
  return { main, prepass, own };
}
export function MakeShellMaterials(hair, shared, lightRig, skinBones = null) {
  const r = hair.render;
  const own = { uFade: { value: 1 }, uOpacity: { value: hair.shellOpacity }, uStreakFreq: { value: HAIR_SHADING.shellStreakFrequency },
    uRoughness: { value: Math.min(0.9, r.roughness + 0.12) }, uSpecular: { value: r.specular * 0.7 }, uScatter: { value: r.scatter } };
  const uniforms = { ...shared, ...own, ...ColorUniforms(r.color), ...DensityUniforms(hair.density), ...(skinBones || {}) };
  const main = LitMaterial(MESH_VERTEX(false, !!skinBones), SHELL_FRAGMENT, uniforms, { lightRig, side: THREE.FrontSide });
  const prepass = PrepassMaterial(MESH_VERTEX(true, !!skinBones), SHELL_PREPASS_FRAGMENT, { ...shared, ...own, ...(skinBones || {}) }, THREE.FrontSide);
  return { main, prepass, own };
}
export function MakeStubbleMaterial(beard, shared, referenceAtlas = null, lightRig = null, referenceLuminance = null, skinBeard = null) {
  if (beard.referenceMask) {
    if (!referenceAtlas) throw new Error('Missing character reference beard atlas');
    if (beard.render.referenceLuminance && !referenceLuminance) throw new Error('Missing character beard luminance atlas');
    const own = {
      ...ReferenceFrontUniforms(beard.referenceMask.center),
      uReferenceMask: {value: referenceAtlas}, uChinY: {value: beard.referenceMask.chinY}, uMelanin: {value: beard.render.color.melanin},
      uRedness: {value: beard.render.color.redness}, uFade: {value: 1},
      uGray: {value: beard.render.color.gray ?? 0},
      uCoverageGain: {value: beard.render.referenceCoverageGain ?? 1},
      uCoverageScale: {value: beard.render.referenceCoverageScale ?? 1},
      uReferenceBeardLuminance: {value: referenceLuminance || referenceAtlas},
      uUseReferenceLuminance: {value: beard.render.referenceLuminance ? 1 : 0},
      uReferenceLuminanceGain: {value: beard.render.referenceLuminanceGain ?? 1},
      uReferenceMelanin: {value: beard.render.color.melanin},
    };
    const material = LitMaterial(MESH_VERTEX(false, !!skinBeard), REFERENCE_BEARD_FRAGMENT, { ...own, ...(skinBeard || {}) }, {lightRig, transparent:true, side:THREE.FrontSide});
    material.depthWrite = false; material.polygonOffset = true;
    material.polygonOffsetFactor = -2; material.polygonOffsetUnits = -2;
    return {main: material, own};
  }
  const own = { uMelanin: { value: beard.render.color.melanin }, uRedness: { value: beard.render.color.redness },
    uDensity: { value: 1 }, uStubLength: { value: Math.max(0.0006, beard.stubble.length) }, uPerVertexLength: { value: beard.stubble.perVertexLength ? 1 : 0 },
    uCoverageScale: { value: beard.stubble.perVertexLength ? HAIR_SHADING.referenceStubbleCoverageScale : 1 },
    uCell: { value: HAIR_SHADING.stubbleCell }, uFade: { value: 1 } };
  const m = new THREE.ShaderMaterial({ glslVersion: THREE.GLSL3, vertexShader: MESH_VERTEX(false, !!skinBeard), fragmentShader: STUBBLE_FRAGMENT,
    uniforms: { uPixelScale: shared.uPixelScale, ...own, ...(skinBeard || {}) }, transparent: true, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  m.allowOverride = false;
  return { main: m, own };
}

export function MakeScalpTintMaterial(hair, referenceAtlas = null, lightRig = null) {
  const own = { uMelanin: { value: hair.render.color.melanin }, uRedness: { value: hair.render.color.redness },
    uStrength: { value: hair.scalpTint }, uFade: { value: 1 } };
  if (hair.referenceScalp) {
    if (!referenceAtlas) throw new Error('Missing character reference scalp atlas');
    own.uReferenceMask = {value: referenceAtlas};
    own.uReferenceMelanin = {value: hair.render.color.melanin};
    Object.assign(own, ReferenceFrontUniforms([hair.referenceScalp.projection.centerX, hair.referenceScalp.centerZ]));
  }
  const m = hair.referenceScalp
    ? LitMaterial(MESH_VERTEX(false), SCALP_FRAGMENT(true), own, {lightRig, transparent: true, side: THREE.FrontSide})
    : new THREE.ShaderMaterial({glslVersion: THREE.GLSL3, vertexShader: MESH_VERTEX(false), fragmentShader: SCALP_FRAGMENT(false), uniforms: own, transparent: true});
  m.depthWrite = false;
  m.polygonOffset = true; m.polygonOffsetFactor = -1; m.polygonOffsetUnits = -1;
  m.allowOverride = false;
  return { main: m, own };
}
