// 落地扬尘的画面（2026-10-20）：把 Script_DustFlow 的两层尘（贴地尘浪 + 悬浮尘云）沿视线积分出来。
// 数值表：Data_Tuning_GroundImpact.GROUND_IMPACT_RENDER；口径：docs/Data_ShellImpactDust.md。
//
// 每团尘一个世界坐标的包围盒（单位立方体缩放过去，画背面、不做深度测试 —— 相机钻进尘里照样画），
// 片元里从相机打一条射线进盒子，按预通道深度截断（墙后、地下的不画），逐步累加：
//   σ(p) = 贴地层：光学深度 / 厚度 × 竖直剖面（贴地实、顶上虚）
//        + 悬浮层：光学深度 / (顶 − 底) × 竖直剖面
//   再乘三维噪声：浓的地方几乎不动（实心核），稀的边缘被菜花状的卷团吃掉 —— 参考图里尘团边缘一坨一坨的样子。
// 受光照抄 Script_ParticleVolumeMaterial：朝太阳几步算遮光、HG 前向散射、二阶散射近似、天光；
// 颜色按「新鲜度」从刚掀起的黑土渐变到散开后的灰黄。输出预乘颜色 + 透过率，保留目标 alpha。
//
// 网格数据每帧整张上传（N ≤ 96，两张 RGBA32F，一团 ≤ 290 KB），不做增量。

import * as THREE from "three";
import { MarkNoPrepass } from "./Script_Post.mjs";
import { DustFlowField } from "./Script_DustFlow.mjs";
import { GROUND_IMPACT_RENDER as RENDER, GROUND_IMPACT_SURFACES } from "./Data_Tuning_GroundImpact.mjs";

// ---------------------------------------------------------------------------
// 可平铺三维噪声：R = Perlin-Worley 卷团（低频）、G = Worley 细节、B = 平滑值噪声。全模块共用一张。

let noiseTexture = null, noiseRefs = 0;

function Hash(x, y, z, seed) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(z | 0, 1274126177) ^ Math.imul(seed | 0, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** 平铺 Worley F1（cells³ 个特征点，每格一个），返回 1 − 归一化距离（越靠近特征点越亮 → 一个个鼓包）。 */
function WorleyTile(size, cells, seed) {
  const out = new Float32Array(size * size * size);
  const pts = new Float32Array(cells * cells * cells * 3);
  for (let z = 0; z < cells; z++) for (let y = 0; y < cells; y++) for (let x = 0; x < cells; x++) {
    const o = ((z * cells + y) * cells + x) * 3;
    pts[o] = (x + Hash(x, y, z, seed)) / cells;
    pts[o + 1] = (y + Hash(x, y, z, seed + 7)) / cells;
    pts[o + 2] = (z + Hash(x, y, z, seed + 13)) / cells;
  }
  for (let vz = 0; vz < size; vz++) for (let vy = 0; vy < size; vy++) for (let vx = 0; vx < size; vx++) {
    const px = (vx + 0.5) / size, py = (vy + 0.5) / size, pz = (vz + 0.5) / size;
    const cx = Math.floor(px * cells), cy = Math.floor(py * cells), cz = Math.floor(pz * cells);
    let best = 9;
    for (let dz = -1; dz <= 1; dz++) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      let nx = cx + dx, ny = cy + dy, nz = cz + dz, ox = 0, oy = 0, oz = 0;
      if (nx < 0) { nx += cells; ox = -1; } else if (nx >= cells) { nx -= cells; ox = 1; }
      if (ny < 0) { ny += cells; oy = -1; } else if (ny >= cells) { ny -= cells; oy = 1; }
      if (nz < 0) { nz += cells; oz = -1; } else if (nz >= cells) { nz -= cells; oz = 1; }
      const o = ((nz * cells + ny) * cells + nx) * 3;
      const ex = pts[o] + ox - px, ey = pts[o + 1] + oy - py, ez = pts[o + 2] + oz - pz;
      const d = ex * ex + ey * ey + ez * ez;
      if (d < best) best = d;
    }
    out[(vz * size + vy) * size + vx] = 1 - Math.min(1, Math.sqrt(best) * cells);
  }
  return out;
}

/** 平铺值噪声（lattice³ 个格点，三线性 + smoothstep）。 */
function ValueTile(size, lattice, seed) {
  const out = new Float32Array(size * size * size);
  const g = new Float32Array(lattice * lattice * lattice);
  for (let i = 0; i < g.length; i++) g[i] = Hash(i, i * 3 + 1, i * 7 + 2, seed);
  const L = (x, y, z) => g[(((z % lattice) + lattice) % lattice * lattice + (((y % lattice) + lattice) % lattice)) * lattice + (((x % lattice) + lattice) % lattice)];
  const S = (t) => t * t * (3 - 2 * t);
  for (let vz = 0; vz < size; vz++) for (let vy = 0; vy < size; vy++) for (let vx = 0; vx < size; vx++) {
    const fx = (vx + 0.5) / size * lattice, fy = (vy + 0.5) / size * lattice, fz = (vz + 0.5) / size * lattice;
    const x0 = Math.floor(fx), y0 = Math.floor(fy), z0 = Math.floor(fz);
    const u = S(fx - x0), v = S(fy - y0), w = S(fz - z0);
    const a = L(x0, y0, z0) + (L(x0 + 1, y0, z0) - L(x0, y0, z0)) * u;
    const b = L(x0, y0 + 1, z0) + (L(x0 + 1, y0 + 1, z0) - L(x0, y0 + 1, z0)) * u;
    const c = L(x0, y0, z0 + 1) + (L(x0 + 1, y0, z0 + 1) - L(x0, y0, z0 + 1)) * u;
    const d = L(x0, y0 + 1, z0 + 1) + (L(x0 + 1, y0 + 1, z0 + 1) - L(x0, y0 + 1, z0 + 1)) * u;
    out[(vz * size + vy) * size + vx] = (a + (b - a) * v) + ((c + (d - c) * v) - (a + (b - a) * v)) * w;
  }
  return out;
}

function Normalize(a) {
  let lo = Infinity, hi = -Infinity;
  for (const v of a) { if (v < lo) lo = v; if (v > hi) hi = v; }
  const k = hi > lo ? 1 / (hi - lo) : 0;
  for (let i = 0; i < a.length; i++) a[i] = (a[i] - lo) * k;
  return a;
}

/** 生成（或复用）共用的三维噪声。48³ 约 50–120 ms，只在第一次开扬尘时算一次。 */
export function AcquireDustNoise(size = RENDER.noiseSize) {
  if (!noiseTexture) {
    const w4 = WorleyTile(size, 4, 1938), w8 = WorleyTile(size, 8, 317), w16 = WorleyTile(size, 16, 1201);
    const v4 = ValueTile(size, 4, 77), v8 = ValueTile(size, 8, 91), v16 = ValueTile(size, 16, 233);
    const n = size * size * size, data = new Uint8Array(n * 4);
    const billow = new Float32Array(n), detail = new Float32Array(n), smooth = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const value = v4[i] * 0.55 + v8[i] * 0.3 + v16[i] * 0.15;
      const worley = w4[i] * 0.62 + w8[i] * 0.26 + w16[i] * 0.12;
      // Perlin-Worley：值噪声决定哪儿有团，Worley 把团的边做成一个个鼓包（Schneider 2015 的同一招）
      billow[i] = Math.max(0, value - (1 - worley) * 0.55);
      detail[i] = w8[i] * 0.55 + w16[i] * 0.45;
      smooth[i] = value;
    }
    Normalize(billow); Normalize(detail); Normalize(smooth);
    for (let i = 0; i < n; i++) {
      data[i * 4] = Math.round(billow[i] * 255);
      data[i * 4 + 1] = Math.round(detail[i] * 255);
      data[i * 4 + 2] = Math.round(smooth[i] * 255);
      data[i * 4 + 3] = 255;
    }
    const texture = new THREE.Data3DTexture(data, size, size, size);
    texture.format = THREE.RGBAFormat; texture.type = THREE.UnsignedByteType;
    texture.minFilter = THREE.LinearFilter; texture.magFilter = THREE.LinearFilter;
    texture.wrapS = texture.wrapT = texture.wrapR = THREE.RepeatWrapping;
    texture.colorSpace = THREE.NoColorSpace; texture.generateMipmaps = false; texture.unpackAlignment = 1;
    texture.needsUpdate = true;
    noiseTexture = texture;
  }
  noiseRefs++;
  let released = false;
  return {
    texture: noiseTexture,
    Release() {
      if (released) return; released = true;
      if (--noiseRefs === 0 && noiseTexture) { noiseTexture.dispose(); noiseTexture = null; }
    },
  };
}

// ---------------------------------------------------------------------------
// 着色器

const VERTEX = /* glsl */`
uniform vec3 uBoxMin;
uniform vec3 uBoxMax;
varying vec3 vWorld;
void main(){
  vWorld = mix(uBoxMin, uBoxMax, position + 0.5);
  gl_Position = projectionMatrix * viewMatrix * vec4(vWorld, 1.0);
}
`;

const FRAGMENT = /* glsl */`
precision highp float;
precision highp sampler3D;
uniform sampler2D uSurge;
uniform sampler2D uLoft;
uniform sampler2D uSkin;
uniform sampler3D uNoise;
uniform vec4 uSkinRect;
uniform vec4 uSkinShape;      // h, lift, shockR, frontV
uniform vec2 uImpact;
uniform float uSkinPatch;
uniform float uPuffFreq;
uniform float uPuffPop;
uniform float uPuffRef;
uniform float uPuffEdge;
uniform float uPuffHaze;
uniform vec4 uFire;          // 火球中心 xyz、半径
uniform vec4 uFireColor;     // 线性颜色 × 强度（a = 照亮周围尘的强度）
uniform vec3 uSkinNear;      // 细尘近土柱一圈的新鲜度：强度、半径比例 × R、时间衰减已乘进强度
uniform vec3 uSkinColor;
uniform float uSkinPhaseG;
uniform vec4 uSurgeRect;      // minX, minZ, 1/size, 1/size
uniform vec4 uLoftRect;
uniform float uBaseY;
uniform vec3 uBoxMin;
uniform vec3 uBoxMax;
uniform float uAge;
uniform float uFade;
uniform vec3 uFreshColor;
uniform vec3 uDustColor;
uniform vec3 uDrift;
uniform float uBillow;
uniform float uDetail;
uniform float uErosion;
uniform float uWarp;
uniform float uSoftDepth;
uniform float uCoverageK;
uniform float uAmbientScale;
uniform float uGroundBounce;
uniform float uSeed;
uniform float uFrame;
uniform float uStepLen;
uniform float uMaxSteps;
uniform float uShadowSteps;
uniform float uEdge;
uniform float uEdgeSoft;
uniform float uSolid;
uniform float uHaze;
uniform float uPhaseG;
uniform vec2 uMultipleScattering;
uniform float uAmbientFloor;
uniform vec3 uSunDirection;
uniform vec3 uSunColor;
uniform vec3 uSkyColor;
uniform sampler2D uNormalDepth;
uniform vec2 uResolution;
uniform float uDepthValid;
uniform float uGlobalFade;
uniform float uFogDensity;
uniform float uFogMax;
uniform vec3 uFogColorSky;
varying vec3 vWorld;

vec2 BoxHit(vec3 ro, vec3 rd){
  vec3 inv = 1.0 / (sign(rd + 1e-12) * max(abs(rd), vec3(1e-7)));
  vec3 a = (uBoxMin - ro) * inv, b = (uBoxMax - ro) * inv;
  vec3 n = min(a, b), f = max(a, b);
  return vec2(max(max(n.x, n.y), n.z), min(min(f.x, f.y), f.z));
}
float Phase(float c, float g){ return (1.0 - g * g) / pow(max(0.05, 1.0 + g * g - 2.0 * g * c), 1.5); }
// 白噪声抖动：IGN 那种有规律的抖动在一帧里没被 TAA 平均掉时会成一道道斜纹，白噪声最多是细颗粒
float Ign(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

// 平滑插值：双线性在格边上导数不连续，阈值一打（剖面、侵蚀）就描出一格一格的台阶。
// 把格内坐标过一遍 smoothstep 再交给硬件双线性（一次取样，C1 连续）。
vec2 Smoothed(vec2 uv, vec2 size){
  vec2 p = uv * size + 0.5, i = floor(p), f = p - i;
  f = f * f * (3.0 - 2.0 * f);
  return (i + f - 0.5) / size;
}

// 三次 B 样条（四次硬件双线性取样，C2 连续）：大炸弹的网格一格一米多，smoothstep 插值在格心是平的，
// 尘浪顶面会变成一格格枕头似的鼓包（画面上是一圈圈波纹）。
vec4 BSpline(sampler2D tex, vec2 uv){
  vec2 size = vec2(textureSize(tex, 0));
  vec2 st = uv * size - 0.5, i = floor(st), f = st - i;
  vec2 f2 = f * f, f3 = f2 * f;
  vec2 w0 = (1.0 - 3.0 * f + 3.0 * f2 - f3) / 6.0;
  vec2 w1 = (4.0 - 6.0 * f2 + 3.0 * f3) / 6.0;
  vec2 w2 = (1.0 + 3.0 * f + 3.0 * f2 - 3.0 * f3) / 6.0;
  vec2 w3 = f3 / 6.0;
  vec2 g0 = w0 + w1, g1 = w2 + w3;
  vec2 h0 = (i - 0.5 + w1 / g0) / size, h1 = (i + 1.5 + w3 / g1) / size;
  return g0.y * (g0.x * texture(tex, h0) + g1.x * texture(tex, vec2(h1.x, h0.y)))
       + g1.y * (g0.x * texture(tex, vec2(h0.x, h1.y)) + g1.x * texture(tex, h1));
}

// 两层尘的「平均」消光系数（不含噪声）。fresh 输出按消光加权的新鲜度。
float gNearSurge = 0.0;   // Field 顺手报：采样点在贴地尘浪那一层里（主循环据此加密步长）
float Field(vec3 p, out float fresh){
  float d = 0.0, fw = 0.0;
  gNearSurge = 0.0;
  vec2 su = (p.xz - uSurgeRect.xy) * uSurgeRect.zw;
  float groundHere = uBaseY;
  if (su.x > 0.0 && su.y > 0.0 && su.x < 1.0 && su.y < 1.0) {
    vec4 s = BSpline(uSurge, su);
    // 地面高用普通双线性：smoothstep 插值在格心处是平的，坡上会变成一级级台阶（沟壁上一道道横纹）
    s.x = texture(uSurge, su).x;
    groundHere = uBaseY + s.x;
    float h = s.y;
    if (h > 0.006 && s.z > 1e-4) {
      float y = p.y - (uBaseY + s.x);
      // 顶面起伏：尘浪顶上一个个翻滚的包，不是一块平板（平的顶在沟里像一块半透明玻璃）
      h *= 0.65 + 0.7 * texture(uNoise, vec3(p.xz * uBillow * 1.7, uAge * 0.07 + uSeed)).r;
      // 下沿伸到网格地面以下 0.6 m：真正的接地线交给预通道深度（真实地形，0.25 m 细分），
      // 网格地面（0.4 m 一格）只管上沿 —— 否则尘的下沿沿着网格折线描出台阶。
      float prof = smoothstep(-0.6, -0.25, y) * (1.0 - smoothstep(0.42 * h + 0.12, 1.12 * h + 0.3, y));
      if (y > -0.6 && y < 1.2 * h + 0.4) gNearSurge = max(gNearSurge, h);
      float sig = s.z / max(s.y, 0.05) * prof * 1.3;
      d += sig; fw += sig * (s.w / max(s.z, 1e-4));
    }
  }
  vec2 lu = (p.xz - uLoftRect.xy) * uLoftRect.zw;
  if (lu.x > 0.0 && lu.y > 0.0 && lu.x < 1.0 && lu.y < 1.0) {
    vec4 l = BSpline(uLoft, lu);
    if (l.x > 1e-4) {
      float zb = uBaseY + l.y / l.x, zt = uBaseY + l.z / l.x, th = max(0.4, zt - zb);
      float u = (p.y - zb) / th;
      float prof = smoothstep(-0.1, 0.26, u) * (1.0 - smoothstep(0.58, 1.0, u));
      float sig = l.x / th * prof * 1.6;
      d += sig; fw += sig * (l.w / l.x);
    }
  }
  fresh = fw / max(d, 1e-5);
  return d;
}

// 震起的地面尘：底面贴着这一处的真实地面（+ 上浮），厚度全场一个数；冲击波扫到之前没有。
// 用不扭曲的坐标采（扭曲幅度好几米，一层几十厘米的薄尘会被扭成一团乱麻），斑驳也是柔的、不过团块阈值。
// near：采样点在这层尘的高度附近（调用方据此加密步长 —— 薄层用粗步长会出一片网点）。
float gSkinFresh = 0.0;
float Skin(vec3 p, out float near){
  near = 0.0;
  gSkinFresh = 0.0;
  vec2 ku = (p.xz - uSkinRect.xy) * uSkinRect.zw;
  if (ku.x <= 0.0 || ku.y <= 0.0 || ku.x >= 1.0 || ku.y >= 1.0) return 0.0;
  float k = texture(uSkin, Smoothed(ku, vec2(textureSize(uSkin, 0)))).r;
  if (k < 1e-4) return 0.0;
  vec2 su = (p.xz - uSurgeRect.xy) * uSurgeRect.zw;
  float ground = uBaseY + texture(uSurge, clamp(su, 0.0, 1.0)).x;
  float h = uSkinShape.x, y = p.y - ground - uSkinShape.y;
  if (y < -0.5 || y > 1.15 * h + 0.6) return 0.0;
  near = 1.0;
  vec2 rel = p.xz - uImpact;
  float rad = length(rel);
  float front = smoothstep(-1.5, 0.0, uAge * uSkinShape.w - rad);
  // 震起的细浮土（用户 2026-10-21；对照参考：155 mm 实弹靶场、工兵爆破）：火球与黑烟周围贴地铺开的一条浅色低尘带，
  // 一团一团像爆米花 —— 冲击波扫过之后各处在半秒内先后冒起，再连成参差的一片，团顶受光发亮，团与团之间是薄尘。
  vec3 fp = vec3(p.x - uSkinRect.x, y, p.z - uSkinRect.y);
  float n1 = texture(uNoise, fp * vec3(0.12, 0.2, 0.12) + vec3(uSeed * 3.1, -uAge * 0.05, uSeed * 1.7)).b;
  // 爆米花团：Perlin-Worley 卷团噪声，竖直方向压扁（团是矮胖的），随时间往上翻
  vec3 pq = vec3(fp.x, fp.y * 1.5, fp.z) * uPuffFreq + vec3(uSeed * 5.3, -uAge * 0.12, uSeed * 2.1);
  // 再叠一层转过一个无理角度、尺度 0.43 倍的噪声：一张 48³ 的平铺贴图在几十米范围里会露出规则的点阵
  vec3 pr = vec3(pq.x * 0.8 - pq.z * 0.6, pq.y, pq.x * 0.6 + pq.z * 0.8) * 0.43 + vec3(0.17, 0.0, 0.41);
  float puff = texture(uNoise, pq).r * 0.62 + texture(uNoise, pr).r * 0.38;
  float puffD = texture(uNoise, pq * 2.7 + vec3(0.31, -uAge * 0.2, 0.57)).g * 0.6 + texture(uNoise, pr * 3.1).g * 0.4;
  // 一团一团先后冒：每处的起尘时刻 = 冲击波到达 + 0–popS 秒（低频噪声决定谁先谁后）
  float pop = smoothstep(0.0, 0.15, uAge - rad / uSkinShape.w - n1 * uPuffPop);
  float kRel = clamp(k / uPuffRef, 0.0, 1.5);
  float v = puff + 0.35 * (puffD - 0.5) + 0.12 * (kRel - 0.5) - (1.0 - pop) * 0.4;
  float s = smoothstep(uPuffEdge - 0.08, uPuffEdge + 0.08, v);
  // 团顶参差：鼓包的地方高，团之间低
  float top = h * (0.35 + 1.25 * puff);
  float prof = smoothstep(-0.45, -0.05, y) * (1.0 - smoothstep(0.25 * top, top + 0.05, y));
  // 近土柱那一圈带一点土柱的深色，往外渐浅（两样尘接得上，不像两层拼起来的）
  gSkinFresh = uSkinNear.x * exp(-rad / max(0.5, uSkinNear.y));
  return k / h * prof * front * (uPuffHaze * pop + (1.0 - uPuffHaze) * 2.4 * s);
}

// 采样坐标的三维扭曲：同一张光滑的场，被扭成一坨一坨的轮廓（菜花边的大形）。
vec3 Warp(vec3 p){
  vec3 q = (p - uDrift) * uBillow * 0.5 + vec3(uSeed * 7.0, -uAge * 0.05, uSeed * 13.0);
  vec3 big = texture(uNoise, q * 0.35 + vec3(0.61, uSeed, 0.29)).brg - 0.5;   // 整团歪一点、鼓一边
  vec3 n = texture(uNoise, q).rgb - 0.5;
  vec3 m = texture(uNoise, q * 2.3 + vec3(0.37, 0.11, 0.73)).gbr - 0.5;
  return p + (big * 1.4 + n * 1.0 + m * 0.45) * uWarp;
}

// 团块：平滑场给覆盖度，噪声把边界推进推出，过阈值的地方算尘、里面实心。
float Shape(vec3 p, float d){
  if (d < 1e-4) return 0.0;
  vec3 q = p - uDrift + vec3(uSeed * 17.0, -uAge * 0.32, uSeed * 31.0);
  float n = texture(uNoise, q * uBillow).r;
  // 细节一半 Worley、一半平滑值噪声：纯 Worley 在大片薄尘上会把格子边界描成一张多边形网
  vec4 dn = texture(uNoise, q * uDetail + vec3(0.0, -uAge * 0.18, 0.0));
  float det = dn.g * 0.5 + dn.b * 0.5;
  float c = 1.0 - exp(-d * uCoverageK);
  float v = c + (n - 0.5) * uErosion + (det - 0.5) * uErosion * 0.45;
  // 薄的地方阈值过渡放软：大片薄尘整面都落在阈值边上时，硬过渡会把噪声等高线描出来
  float soft = uEdgeSoft + 0.22 * (1.0 - c);
  // 团块之外留一层柔和的残尘（haze）：稀薄的尘不该被阈值整片吃掉 —— 久留的那层「灰蒙蒙」就是它
  return smoothstep(uEdge - soft, uEdge + soft, v) * (d + uSolid * c) + d * uHaze * (0.5 + n);
}

float ShadowShape(vec3 p, float d){
  if (d < 1e-4) return 0.0;
  vec3 q = p - uDrift + vec3(uSeed * 17.0, -uAge * 0.32, uSeed * 31.0);
  float n = texture(uNoise, q * uBillow).r;
  float c = 1.0 - exp(-d * uCoverageK);
  return smoothstep(uEdge - uEdgeSoft * 2.0, uEdge + uEdgeSoft * 2.0, c + (n - 0.5) * uErosion) * (d + uSolid * c);
}

void main(){
  vec3 ro = cameraPosition, rd = normalize(vWorld - cameraPosition);
  vec2 hit = BoxHit(ro, rd);
  float start = max(0.0, hit.x), end = hit.y;
  if (end <= start) discard;
  float sceneDepth = uDepthValid > 0.5 ? texture2D(uNormalDepth, gl_FragCoord.xy / uResolution).w : 0.0;
  if (sceneDepth > 0.0) end = min(end, sceneDepth / max(0.001, -(viewMatrix * vec4(rd, 0.0)).z));
  if (end <= start) discard;
  vec3 light = normalize(uSunDirection);
  // 步数按射线在盒子里的长度定（上限 uMaxSteps），空的地方两步并一步。
  float steps = clamp(ceil((end - start) / uStepLen), 12.0, uMaxSteps), ds = (end - start) / steps;
  float jitter = Ign(gl_FragCoord.xy + vec2(uFrame * 5.588238, uFrame * 3.112));
  float phase = Phase(dot(rd, light), uPhaseG);
  float shadowLen = min(10.0, (uBoxMax.y - uBoxMin.y) * 0.6 + 1.5);
  vec3 radiance = vec3(0.0);
  float transmission = 1.0;
  float tRay = start + jitter * ds;
  float refine = 0.0, refineStep = ds;   // 撞上很浓的一层时退半步、细步长走几步（先粗后细），表面才不随抖动跳格
  float dsFine = clamp(uSkinShape.x * 0.3, 0.06, ds);
  float phaseSkin = Phase(dot(rd, light), uSkinPhaseG);
  for (int i = 0; i < 160; i++) {
    if (tRay >= end || transmission < 0.01) break;
    vec3 p = ro + rd * tRay;
    vec3 w = Warp(p);
    float fresh, near;
    float d = Field(w, fresh);
    float surgeH = gNearSurge;
    float skin = Skin(p, near);
    float skinFresh = gSkinFresh;
    // 一瞬的火光：火球那一团自己发光（被外面的尘挡住的自然看不见），空处也要走到
    float fireD = uFireColor.a > 0.0 ? length(w - uFire.xyz) / max(uFire.w, 0.05) : 9.0;
    float fireE = fireD < 1.0 ? (1.0 - smoothstep(0.25, 1.0, fireD)) : 0.0;
    // 火球附近加密步长（一两米大的火球用 0.4 m 的步长会铺满网点）
    float fireStep = fireD < 1.4 ? clamp(uFire.w * 0.08, 0.04, ds) : ds;
    if (fireE > 0.0) { radiance += transmission * uFireColor.rgb * fireE * min(fireStep, 0.5); }
    float stepLen = near > 0.5 ? dsFine : ds;
    if (surgeH > 0.0) stepLen = min(stepLen, clamp(surgeH * 0.22, 0.12, ds));
    stepLen = min(stepLen, fireStep);
    if (refine > 0.0) { stepLen = min(stepLen, refineStep); refine -= 1.0; }
    if (d < 1e-4 && skin < 1e-4) { tRay += (near > 0.5 || surgeH > 0.0 || fireD < 1.4) ? stepLen : ds * 2.0; continue; }
    float mainS = d > 1e-4 ? Shape(p, d) : 0.0;
    float sigma = mainS + skin;
    // 贴地 / 贴墙的软过渡：离预通道深度不到 softDepth 的那一截按距离淡掉（不然沟沿上一圈锯齿）
    if (sceneDepth > 0.0) sigma *= smoothstep(0.0, uSoftDepth, end - tRay);
    if (sigma < 1e-4) { tRay += stepLen; continue; }
    if (sigma * stepLen > 1.5 && stepLen > 0.06 && refine <= 0.0) {
      refineStep = clamp(0.8 / sigma, 0.03, stepLen * 0.5);
      refine = 8.0;
      tRay -= stepLen * (0.5 - 0.5 * jitter);
      continue;
    }
    float skinShare = skin / max(mainS + skin, 1e-5);
    // 朝太阳的遮光（步长逐步拉长）
    float tau = 0.0;
    for (int j = 0; j < 6; j++) {
      if (float(j) >= uShadowSteps) break;
      float t = (float(j) + 0.5) / uShadowSteps;
      t = t * t * shadowLen;
      float f2;
      vec3 q = p + light * t;
      tau += ShadowShape(q, Field(Warp(q), f2)) * shadowLen / uShadowSteps;
    }
    // 天光：上方 1.4 m 还有多少尘，压一压底部（尘团下半截比顶上暗）
    float fu;
    float above = Field(w + vec3(0.0, 1.4, 0.0), fu);
    // 天光 + 暖色地面反光（黄土地把阳光反上来，尘团背光面偏暖灰，不是蓝灰）
    vec3 ambient = (uSkyColor * uAmbientScale + uSunColor * uGroundBounce * vec3(1.0, 0.84, 0.6)) * mix(uAmbientFloor, 1.0, exp(-above * 0.9));
    float ph = mix(phase, phaseSkin, skinShare);
    vec3 incident = ambient + uSunColor * (exp(-tau) * ph + uMultipleScattering.x * exp(-tau * uMultipleScattering.y));
    // 火光把周围的尘从里面照亮（橙红，按离火球的距离衰减）
    if (uFireColor.a > 0.0) incident += uFireColor.rgb / max(1.0, length(uFireColor.rgb)) * uFireColor.a * exp(-fireD * fireD * 0.35);
    vec3 skinAlbedo = mix(uSkinColor, uFreshColor, clamp(skinFresh, 0.0, 1.0));
    vec3 albedo = mix(mix(uDustColor, uFreshColor, smoothstep(0.05, 0.95, fresh)), skinAlbedo, skinShare);
    float next = exp(-sigma * stepLen);
    radiance += transmission * albedo * incident * (1.0 - next);
    transmission *= next;
    tRay += stepLen;
  }
  float opacity = 1.0 - transmission;
  if (uDepthValid > 0.5 && sceneDepth <= 0.0) radiance = mix(radiance, uFogColorSky * opacity, min(uFogMax, 1.0 - exp(-uFogDensity * (start + end) * 0.275)));
  float fade = uFade * uGlobalFade;
  if (opacity * fade < 0.002) discard;
  gl_FragColor = vec4(radiance * fade, opacity * fade);
}
`;

const SHARED_KEYS = ["uSunDirection", "uSunColor", "uSkyColor", "uNormalDepth", "uResolution", "uDepthValid",
  "uGlobalFade", "uFogDensity", "uFogMax", "uFogColorSky"];

function MakeMaterial(shared, noise, quality) {
  const uniforms = {
    uSurge: { value: null }, uLoft: { value: null }, uSkin: { value: null }, uNoise: { value: noise },
    uSkinRect: { value: new THREE.Vector4() }, uSkinShape: { value: new THREE.Vector4(0.3, 0, 0, 160) },
    uImpact: { value: new THREE.Vector2() }, uSkinPatch: { value: 0.75 },
    uPuffFreq: { value: 0.2 }, uPuffPop: { value: 0.45 }, uPuffRef: { value: 1 }, uPuffEdge: { value: 0.5 }, uPuffHaze: { value: 0.25 },
    uFire: { value: new THREE.Vector4() }, uFireColor: { value: new THREE.Vector4() }, uSkinNear: { value: new THREE.Vector3() },
    uSkinColor: { value: new THREE.Vector3() }, uSkinPhaseG: { value: RENDER.skinPhaseG },
    uSurgeRect: { value: new THREE.Vector4() }, uLoftRect: { value: new THREE.Vector4() },
    uBaseY: { value: 0 }, uBoxMin: { value: new THREE.Vector3() }, uBoxMax: { value: new THREE.Vector3(1, 1, 1) },
    uAge: { value: 0 }, uFade: { value: 1 },
    uFreshColor: { value: new THREE.Vector3() }, uDustColor: { value: new THREE.Vector3() },
    uDrift: { value: new THREE.Vector3() }, uBillow: { value: 0.1 }, uDetail: { value: 0.3 },
    uErosion: { value: RENDER.erosion }, uSeed: { value: 0 }, uFrame: { value: 0 },
    uWarp: { value: RENDER.warpM }, uSoftDepth: { value: RENDER.softDepthM }, uCoverageK: { value: RENDER.coverageK },
    uAmbientScale: { value: RENDER.ambientScale }, uGroundBounce: { value: RENDER.groundBounce },
    uStepLen: { value: RENDER.stepM[quality] ?? RENDER.stepM.high },
    uMaxSteps: { value: RENDER.maxSteps[quality] ?? RENDER.maxSteps.high },
    uEdge: { value: RENDER.edge }, uEdgeSoft: { value: RENDER.edgeSoft }, uSolid: { value: RENDER.solid }, uHaze: { value: RENDER.haze },
    uShadowSteps: { value: RENDER.shadowSteps[quality] ?? RENDER.shadowSteps.high },
    uPhaseG: { value: RENDER.phaseG },
    uMultipleScattering: { value: new THREE.Vector2(...RENDER.multipleScattering) },
    uAmbientFloor: { value: RENDER.ambientFloor },
  };
  for (const key of SHARED_KEYS) if (shared[key]) uniforms[key] = shared[key];
  const material = new THREE.ShaderMaterial({
    vertexShader: VERTEX, fragmentShader: FRAGMENT, uniforms,
    side: THREE.BackSide, transparent: true, depthTest: false, depthWrite: false,
    blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
    blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor,
    blendEquation: THREE.AddEquation, blendEquationAlpha: THREE.AddEquation,
  });
  material.name = "GroundImpactDust";
  material.userData.preserveTargetAlpha = true;
  MarkNoPrepass(material);
  return material;
}

function MakeTexture(N) {
  const texture = new THREE.DataTexture(new Float32Array(N * N * 4), N, N, THREE.RGBAFormat, THREE.FloatType);
  texture.minFilter = texture.magFilter = THREE.LinearFilter;
  texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.generateMipmaps = false; texture.colorSpace = THREE.NoColorSpace;
  texture.needsUpdate = true;
  return texture;
}

// ---------------------------------------------------------------------------
// 管理：一团尘 = 一张 DustFlowField + 一只盒子网格。

export class DustFieldSystem {
  constructor(root, shared, quality = "high") {
    this.root = root; this.shared = shared; this.quality = quality;
    this.fields = [];
    this.noise = null;
    this.geometry = new THREE.BoxGeometry(1, 1, 1);
    this.frame = 0;
    this.nextSeed = 1;
    this.created = 0;
    this.floatLinear = null;
  }

  /** 第一次用之前把噪声算好（开扬尘的那一刻调，免得第一发炮弹那一帧卡 100 ms）。 */
  Warm() { if (!this.noise) this.noise = AcquireDustNoise(); }

  /**
   * 加一团尘。options 原样给 DustFlowField（x, y, z, chargeKg, groundAt, incoming, wind, surface, massScale）。
   * @returns {object} 句柄（含 field）
   */
  Add(options) {
    this.Warm();
    const field = new DustFlowField(options);
    // 同屏上限：最老的一团提前进入淡出（把它的时钟拨到淡出段的起点）
    const live = this.fields.filter((f) => !f.retiring);
    if (live.length >= RENDER.maxFields) {
      const oldest = live[0];
      oldest.retiring = true;
      const L = oldest.field.T.loft;
      oldest.field.time = Math.max(oldest.field.time, L.life - L.fadeS);
    }
    const N = field.N;
    const material = MakeMaterial(this.shared, this.noise.texture, this.quality);
    const surgeTex = MakeTexture(N), loftTex = MakeTexture(N), skinTex = MakeTexture(N);
    material.uniforms.uSurge.value = surgeTex; material.uniforms.uLoft.value = loftTex; material.uniforms.uSkin.value = skinTex;
    material.uniforms.uSkinPatch.value = field.T.shock.patch;
    {
      const S = field.T.shock;
      // 噪声 R 通道最粗一层是一张平铺 4 个 Worley 格：一团 ≈ 平铺 / 4，按 √∛W 放大（大炸弹的团更大）
      material.uniforms.uPuffFreq.value = 1 / (4 * S.puffM * Math.sqrt(field.scale.cube));
      material.uniforms.uPuffPop.value = S.popS;
      material.uniforms.uPuffRef.value = S.center;
      material.uniforms.uPuffEdge.value = S.puffEdge;
      material.uniforms.uPuffHaze.value = S.puffHaze;
    }
    const surface = GROUND_IMPACT_SURFACES[field.surfaceId];
    material.uniforms.uSkinColor.value.fromArray(surface.skin ?? surface.dust);
    material.uniforms.uFreshColor.value.fromArray(surface.fresh);
    material.uniforms.uDustColor.value.fromArray(surface.dust);
    const root = Math.sqrt(field.scale.cube);
    // 噪声贴图一张平铺里，R 通道最粗一层是 4 个 Worley 格、G 通道是 8 个：换算成米
    material.uniforms.uBillow.value = 1 / (4 * RENDER.billowM * root);
    material.uniforms.uDetail.value = 1 / (8 * RENDER.detailM * root);
    material.uniforms.uWarp.value = RENDER.warpM * root;
    material.uniforms.uStepLen.value = (RENDER.stepM[this.quality] ?? RENDER.stepM.high) * root;
    material.uniforms.uSeed.value = (this.nextSeed++ * 0.61803398875) % 1;
    const mesh = new THREE.Mesh(this.geometry, material);
    mesh.name = "GroundImpactDust";
    mesh.frustumCulled = false; mesh.matrixAutoUpdate = false; mesh.renderOrder = 6;
    mesh.userData.skipNormalDepth = true;
    mesh.visible = false;
    mesh.onBeforeRender = (renderer) => this._CheckFloatLinear(renderer);
    this.root.add(mesh);
    const entry = { field, mesh, material, surgeTex, loftTex, skinTex, origin: { x: field.minX, z: field.minZ }, retiring: false };
    this.fields.push(entry);
    this.created++;
    return entry;
  }

  /** 极少数机器不支持浮点贴图线性过滤：退回最近点，块感重一点但不会黑。 */
  _CheckFloatLinear(renderer) {
    if (this.floatLinear !== null) return;
    this.floatLinear = !!renderer.extensions?.has?.("OES_texture_float_linear");
    if (!this.floatLinear) for (const e of this.fields) {
      for (const t of [e.surgeTex, e.loftTex, e.skinTex]) { t.minFilter = t.magFilter = THREE.NearestFilter; t.needsUpdate = true; }
    }
  }

  Update(dt, wind = null) {
    this.frame = (this.frame + 1) % 4096;
    for (let k = this.fields.length - 1; k >= 0; k--) {
      const e = this.fields[k], field = e.field;
      if (wind) { field.wind.x = wind.x; field.wind.z = wind.z; }
      const alive = dt > 0 ? field.Step(dt) : !field.finished;
      if (!alive) { this._Remove(k); continue; }
      if (!field.ready) { e.mesh.visible = false; continue; }
      const info = field.Pack(e.surgeTex.image.data, e.loftTex.image.data, e.skinTex.image.data);
      if (this.floatLinear === false) for (const t of [e.surgeTex, e.loftTex, e.skinTex]) t.minFilter = t.magFilter = THREE.NearestFilter;
      e.surgeTex.needsUpdate = true; e.loftTex.needsUpdate = true; e.skinTex.needsUpdate = true;
      const u = e.material.uniforms;
      u.uSurgeRect.value.set(info.surgeRect[0], info.surgeRect[1], 1 / info.surgeRect[2], 1 / info.surgeRect[3]);
      u.uLoftRect.value.set(info.loftRect[0], info.loftRect[1], 1 / info.loftRect[2], 1 / info.loftRect[3]);
      u.uBaseY.value = info.baseY;
      u.uSkinRect.value.set(info.skinRect[0], info.skinRect[1], 1 / info.skinRect[2], 1 / info.skinRect[3]);
      u.uSkinShape.value.set(info.skinH, info.skinLift, info.shockR, info.shockV);
      u.uImpact.value.set(info.impact[0], info.impact[1]);
      this._FireUniforms(u, field, info);
      // 采样坐标的三维扭曲会把尘往外推出数据的范围（大炸弹七八米）：盒子按扭曲幅度留余量，不然尘团顶被盒顶切成一块平盖
      const pad = u.uWarp.value * 1.6;
      u.uBoxMin.value.set(info.minX - pad, info.minY, info.minZ - pad);
      u.uBoxMax.value.set(info.maxX + pad, info.maxY + pad, info.maxZ + pad);
      u.uAge.value = field.time;
      u.uFade.value = info.fade;
      u.uDrift.value.set(field.loftX - e.origin.x, 0, field.loftZ - e.origin.z);
      u.uFrame.value = this.frame;
      e.mesh.visible = info.fade > 0.001;
    }
  }

  /** 起爆火光与细尘近土柱新鲜度的每帧参数（GROUND_IMPACT_RENDER.fire / skinNear）。 */
  _FireUniforms(u, field, info) {
    const F = RENDER.fire, N = RENDER.skinNear, cube = field.scale.cube, root = Math.sqrt(cube), t = field.time;
    // 沟里炸：火光从沟里往上窜（被沟壁收住、往上冲），火球抬高、放大一点，不然整团藏在沟沿下面
    const confined = field.confined || 0;
    const R = F.radiusK * cube * (1 + 0.3 * confined);
    const grow = Math.min(1, t / F.riseS), decay = Math.exp(-t / (F.decayS * root));
    const on = t < F.lifeS * root ? grow * decay : 0;
    const r = R * (0.35 + 0.65 * grow) * (1 + 0.25 * (1 - decay));
    const g = field.groundY ?? info.baseY;
    u.uFire.value.set(field.cx, g + R * F.centerK + F.ventM * confined * Math.sqrt(cube), field.cz, r);
    const k = 1 - decay;   // 0 = 刚起爆（白黄），1 = 冷了（橙红）
    const c = [0, 1, 2].map((i) => F.hot[i] + (F.cool[i] - F.hot[i]) * k);
    u.uFireColor.value.set(c[0] * F.emission * on, c[1] * F.emission * on, c[2] * F.emission * on, F.glow * on);
    u.uSkinNear.value.set(N.fresh * Math.exp(-t / N.nearS), N.nearK * (info.shockR || 10), 0);
  }

  _Remove(k) {
    const e = this.fields[k];
    e.mesh.removeFromParent();
    e.material.dispose(); e.surgeTex.dispose(); e.loftTex.dispose(); e.skinTex.dispose();
    this.fields.splice(k, 1);
  }

  Clear() { for (let k = this.fields.length - 1; k >= 0; k--) this._Remove(k); }

  Inspect() {
    return {
      live: this.fields.length, created: this.created, floatLinear: this.floatLinear,
      fields: this.fields.map((e) => e.field.Inspect()),
    };
  }

  Dispose() {
    this.Clear();
    this.geometry.dispose();
    this.noise?.Release(); this.noise = null;
  }
}
