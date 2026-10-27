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
// 网格数据整张上传（N ≤ 96，三张 RGBA32F，一团 ≤ 440 KB）：两套贴图轮换、按年龄降频（GROUND_IMPACT_RENDER.upload）。
// 材质用完不销毁、回收复用：销毁最后一只就会把着色器程序一起删掉，下一发再编一遍（第一发 / 清空之后卡约半秒）。

import * as THREE from "three";
import { MarkNoPrepass } from "./Script_Post.mjs";
import { DustFlowField } from "./Script_DustFlow.mjs";
import { GROUND_IMPACT_RENDER as RENDER, GROUND_IMPACT_SURFACES } from "./Data_Tuning_GroundImpact.mjs";
import { DUST_COMPOSITE_RENDER_ORDER } from "./Script_DustOcclusion.mjs";

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

// 主着色器与两个预烘焙着色器（GROUND_IMPACT_RENDER.bake）共用的 uniform 与函数。
const FRAGMENT_COMMON = /* glsl */`
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
// 预烘焙（GROUND_IMPACT_RENDER.bake）
uniform sampler2D uSurgeB;     // 贴地尘浪网格的 B 样条（按 splineScale 倍精度预先算好）：x 地面（普通双线性）、yzw 同 uSurge
uniform sampler2D uLoftB;      // 悬浮尘云网格的 B 样条（同上）
uniform float uSplineLoft;     // 烘焙 B 样条那一趟：0 = 贴地层，1 = 悬浮层
uniform sampler2D uLight;      // 受光「切片拼图」（一层切片一张小图铺成一张二维贴图；WebGL2 渲染三维贴图要一层画一次）：
                               // r 朝太阳远段透过率、g 二阶散射远段透过率、b 天光系数
uniform vec3 uLightDims;       // 受光：水平格数 X、Z，竖直层数
uniform vec2 uLightTiles;
uniform vec3 uVolMin;          // 受光烘焙那一刻的盒子（与 uBoxMin / uBoxMax 同一份，烘焙时写）
uniform vec3 uVolExt;
uniform vec2 uVolH;            // 竖直：离当地地面的下沿、跨度（层按平方分布，贴地最细）
uniform float uBakeShadowSteps;

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
// 网格那一半（两次 B 样条，8 次取样）只跟水平位置有关：烘焙版预先按 splineScale 倍精度算进 uSurgeB / uLoftB，这里一次双线性；
// 竖直剖面（贴地实、顶上虚，尘浪顶面起伏）两版都逐像素算，竖直方向一点不丢。
float gNearSurge = 0.0;   // Field 顺手报：采样点在贴地尘浪那一层里（主循环据此加密步长）
vec4 SurgeAt(vec2 su){
#ifdef DUST_BAKED
  return texture(uSurgeB, su);
#else
  vec4 s = BSpline(uSurge, su);
  // 地面高用普通双线性：smoothstep 插值在格心处是平的，坡上会变成一级级台阶（沟壁上一道道横纹）
  s.x = texture(uSurge, su).x;
  return s;
#endif
}
vec4 LoftAt(vec2 lu){
#ifdef DUST_BAKED
  return texture(uLoftB, lu);
#else
  return BSpline(uLoft, lu);
#endif
}
float Field(vec3 p, out float fresh){
  float d = 0.0, fw = 0.0;
  gNearSurge = 0.0;
  vec2 su = (p.xz - uSurgeRect.xy) * uSurgeRect.zw;
  float groundHere = uBaseY;
  if (su.x > 0.0 && su.y > 0.0 && su.x < 1.0 && su.y < 1.0) {
    vec4 s = SurgeAt(su);
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
    vec4 l = LoftAt(lu);
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

// 当地地面高（与 Skin 同一个取法：网格外按边上的值延伸）
float GroundAt(vec2 xz){ return uBaseY + texture(uSurge, clamp((xz - uSurgeRect.xy) * uSurgeRect.zw, 0.0, 1.0)).x; }

// 世界坐标 → 受光格子坐标：水平按盒子，竖直按离当地地面的高（平方分布的反函数）
vec3 VolCoord(vec3 p, float ground){
  return vec3((p.xz - uVolMin.xz) / uVolExt.xz, sqrt(clamp((p.y - ground - uVolH.x) / uVolH.y, 0.0, 1.0)));
}

// 切片拼图取样：层内硬件双线性（夹在格心以内，不串到隔壁那张），层间手动插值
vec4 Atlas(sampler2D tex, vec3 uvw, vec3 dims, vec2 tiles){
  float L = clamp(uvw.z * dims.z - 0.5, 0.0, dims.z - 1.0);
  float i0 = floor(L), i1 = min(i0 + 1.0, dims.z - 1.0);
  vec2 st = clamp(uvw.xy, 0.5 / dims.xy, 1.0 - 0.5 / dims.xy) * dims.xy;
  float r0 = floor((i0 + 0.5) / tiles.x), r1 = floor((i1 + 0.5) / tiles.x);
  vec2 o0 = vec2(i0 - r0 * tiles.x, r0) * dims.xy, o1 = vec2(i1 - r1 * tiles.x, r1) * dims.xy;
  vec2 inv = 1.0 / (tiles * dims.xy);
  return mix(texture(tex, (o0 + st) * inv), texture(tex, (o1 + st) * inv), L - i0);
}

// 遮光的加权与原来逐像素那一版相同：t = L·u²、u 均匀取点、每点同权 —— 即 ∫σ(t)·½√(L/t) dt，越近权重越大。
// 拆成两段：u ∈ [0, 1/3]（t ≤ L/9，约 1 m 以内）逐像素 1 步（NearShadow：u = 1/6，t = L/36，正是原来 3 步里的第一步），
// u ∈ [1/3, 1] 烘进受光格子（BAKE_LIGHT_FRAGMENT，步数更多）。
// 近段这一步照原来精确算 Field(Warp(q))：大炸弹的扭曲在三十公分内就能差出一米，拿「扭曲点 + 偏移」近似会总落在同一团浓尘里、偏暗。
float NearShadow(vec3 p, vec3 light, float L){
  vec3 q = p + light * (L / 36.0);
  float f;
  return ShadowShape(q, Field(Warp(q), f)) * L / 3.0;
}
`;

const FRAGMENT = /* glsl */`
// 第二个输出：尘的前沿视深度（Script_DustOcclusion）。降分辨率那一趟是两张靶（MRT）；没开降分辨率、直接画进主靶时只有一张，这一路自动丢掉。
layout(location = 0) out highp vec4 pc_fragColor;
layout(location = 1) out highp vec4 pc_dustFront;
#define gl_FragColor pc_fragColor
${FRAGMENT_COMMON}
varying vec3 vWorld;

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
  float frontW = 0.0, frontZ = 0.0, frontZ2 = 0.0;   // 按这一段挡掉的光加权的射线距离与其平方（→ 尘沿视线的位置与散开程度）
  float tRay = start + jitter * ds;
  float refine = 0.0, refineStep = ds;   // 撞上很浓的一层时退半步、细步长走几步（先粗后细），表面才不随抖动跳格
  float dsFine = clamp(uSkinShape.x * 0.3, 0.06, ds);
  float phaseSkin = Phase(dot(rd, light), uSkinPhaseG);
  for (int i = 0; i < 160; i++) {
    if (tRay >= end || transmission < 0.01) break;
    vec3 p = ro + rd * tRay;
    float fresh, near;
    // 扭曲逐像素现算（团块轮廓靠它，烘进格子再插值会被抹平）
    vec3 w = Warp(p);
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
    // 朝太阳的透过率（单次散射用 exp(−τ)、二阶散射用 exp(−τ·k)）与天光系数 exp(−上方的尘 × 0.9)
    float sunT, msT, skyK;
#ifdef DUST_BAKED
    // 受光（原来每步约 52 次取样）：远段与天光系数查烘焙好的受光格子（按没扭曲的坐标查）；近段那一步逐像素算。
    // 格子里存的是透过率不是光学深度：τ 在扭曲很陡的地方变化剧烈，先平均 τ 再取指数会系统性偏暗（大炸弹里暗一成半）
    vec3 lit = Atlas(uLight, VolCoord(p, GroundAt(p.xz)), uLightDims, uLightTiles).rgb;
    float tauNear = NearShadow(p, light, shadowLen);
    sunT = lit.r * exp(-tauNear);
    msT = lit.g * exp(-tauNear * uMultipleScattering.y);
    skyK = lit.b;
#else
    float tau = 0.0, above;
    // 朝太阳的遮光（步长逐步拉长）
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
    above = Field(w + vec3(0.0, 1.4, 0.0), fu);
    sunT = exp(-tau); msT = exp(-tau * uMultipleScattering.y); skyK = exp(-above * 0.9);
#endif
    // 天光 + 暖色地面反光（黄土地把阳光反上来，尘团背光面偏暖灰，不是蓝灰）
    vec3 ambient = (uSkyColor * uAmbientScale + uSunColor * uGroundBounce * vec3(1.0, 0.84, 0.6)) * mix(uAmbientFloor, 1.0, skyK);
    float ph = mix(phase, phaseSkin, skinShare);
    vec3 incident = ambient + uSunColor * (sunT * ph + uMultipleScattering.x * msT);
    // 火光把周围的尘从里面照亮（橙红，按离火球的距离衰减）
    if (uFireColor.a > 0.0) incident += uFireColor.rgb / max(1.0, length(uFireColor.rgb)) * uFireColor.a * exp(-fireD * fireD * 0.35);
    vec3 skinAlbedo = mix(uSkinColor, uFreshColor, clamp(skinFresh, 0.0, 1.0));
    vec3 albedo = mix(mix(uDustColor, uFreshColor, smoothstep(0.05, 0.95, fresh)), skinAlbedo, skinShare);
    float next = exp(-sigma * stepLen);
    float dw = transmission * (1.0 - next);
    frontW += dw; frontZ += dw * tRay; frontZ2 += dw * tRay * tRay;
    radiance += transmission * albedo * incident * (1.0 - next);
    transmission *= next;
    tRay += stepLen;
  }
  float opacity = 1.0 - transmission;
  if (uDepthValid > 0.5 && sceneDepth <= 0.0) radiance = mix(radiance, uFogColorSky * opacity, min(uFogMax, 1.0 - exp(-uFogDensity * (start + end) * 0.275)));
  float fade = uFade * uGlobalFade;
  if (opacity * fade < 0.002) discard;
  float alphaOut = opacity * fade;
  gl_FragColor = vec4(radiance * fade, alphaOut);
  // 射线距离换成视深度（粒子那边比的是视深度 vViewDepth）
  float viewK = max(0.001, -(viewMatrix * vec4(rd, 0.0)).z);
  float frontDepth = (frontW > 1e-5 ? frontZ / frontW : start) * viewK;
  float frontDepth2 = (frontW > 1e-5 ? frontZ2 / frontW : start * start) * viewK * viewK;
  // b：深度平方（× 1e-4，半精度够到两公里）——粒子那边由它算尘沿视线散得多开（Script_DustOcclusion）
  pc_dustFront = vec4(frontDepth * alphaOut, alphaOut, frontDepth2 * 1e-4 * alphaOut, alphaOut);
}
`;

// 预烘焙（GROUND_IMPACT_RENDER.bake）：片元着色器当计算用。全屏一个三角形：网格上传那一帧烘两张 B 样条，每帧烘一次受光。
const BAKE_VERTEX = /* glsl */`
void main(){ gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

const BAKE_HEAD = /* glsl */`
layout(location = 0) out highp vec4 pc_fragColor;
${FRAGMENT_COMMON}
`;

// 网格的 B 样条：输出像素中心 = 预烘焙图的格心，与主着色器 texture(uSurgeB, su) 的双线性一一对上
const BAKE_SPLINE_FRAGMENT = /* glsl */`
${BAKE_HEAD}
uniform vec2 uSplineSize;
void main(){
  vec2 uv = gl_FragCoord.xy / uSplineSize;
  if (uSplineLoft > 0.5) { pc_fragColor = BSpline(uLoft, uv); return; }
  vec4 s = BSpline(uSurge, uv);
  s.x = texture(uSurge, uv).x;
  pc_fragColor = s;
}
`;

const BAKE_VOXEL = /* glsl */`
${BAKE_HEAD}
// 这个像素是拼图里哪一个体素：水平 st∈(0,1)（格心）、竖直 r∈(0,1)；拼图末尾多出来的空格返回 false
bool Voxel(vec3 dims, vec2 tiles, out vec3 p, out float ground){
  vec2 px = floor(gl_FragCoord.xy);
  vec2 tile = floor((px + 0.5) / dims.xy);
  float layer = tile.y * tiles.x + tile.x;
  vec2 st = (px - tile * dims.xy + 0.5) / dims.xy;
  float r = (layer + 0.5) / dims.z;
  p.xz = uVolMin.xz + st * uVolExt.xz;
  ground = GroundAt(p.xz);
  p.y = ground + uVolH.x + uVolH.y * r * r;
  return layer < dims.z - 0.5;
}
`;

// 受光：朝太阳走远段 u ∈ [1/3, 1]（加权同原来，步数更多；每步同原来 ShadowShape(q, Field(Warp(q)))，Field 用预烘焙网格），
// 存透过率 exp(−τ)、exp(−τ·k) 与天光系数 exp(−上方的尘 × 0.9)（插值透过率，不插值 τ，见主着色器）
const BAKE_LIGHT_FRAGMENT = /* glsl */`
#define DUST_BAKED 1
${BAKE_VOXEL}
void main(){
  vec3 p; float ground;
  if (!Voxel(uLightDims, uLightTiles, p, ground)) { pc_fragColor = vec4(0.0); return; }
  vec3 light = normalize(uSunDirection);
  float shadowLen = min(10.0, (uBoxMax.y - uBoxMin.y) * 0.6 + 1.5);
  float tau = 0.0;
  for (int j = 0; j < 16; j++) {
    if (float(j) >= uBakeShadowSteps) break;
    float u = 1.0 / 3.0 + (float(j) + 0.5) / uBakeShadowSteps * (2.0 / 3.0);
    vec3 q = p + light * (u * u * shadowLen);
    float f;
    tau += ShadowShape(q, Field(Warp(q), f));
  }
  tau *= shadowLen * (2.0 / 3.0) / uBakeShadowSteps;
  float f;
  float above = Field(Warp(p) + vec3(0.0, 1.4, 0.0), f);
  pc_fragColor = vec4(exp(-tau), exp(-tau * uMultipleScattering.y), exp(-above * 0.9), 1.0);
}
`;

const SHARED_KEYS = ["uSunDirection", "uSunColor", "uSkyColor", "uNormalDepth", "uResolution", "uDepthValid",
  "uGlobalFade", "uFogDensity", "uFogMax", "uFogColorSky"];

/** 预烘焙的尺寸（按画质）：受光格子的 [X, Z, 层数] 与拼图排布 [一行几张, 几行]；网格 B 样条的倍数；受光烘焙的步数。 */
export function BakeLayout(quality) {
  const B = RENDER.bake;
  const [xz, layers] = B.light[quality] ?? B.light.high;
  const across = Math.ceil(Math.sqrt(layers)), rows = Math.ceil(layers / across);
  return {
    light: { dims: [xz, xz, layers], tiles: [across, rows], width: across * xz, height: rows * xz },
    splineScale: B.splineScale[quality] ?? B.splineScale.high,
    shadowSteps: B.shadowSteps[quality] ?? B.shadowSteps.high,
  };
}

function MakeMaterial(shared, noise, quality, reference = false) {
  const layout = BakeLayout(quality);
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
    uSurgeB: { value: null }, uLoftB: { value: null }, uSplineLoft: { value: 0 }, uSplineSize: { value: new THREE.Vector2(1, 1) },
    uLight: { value: null },
    uLightDims: { value: new THREE.Vector3(...layout.light.dims) }, uLightTiles: { value: new THREE.Vector2(...layout.light.tiles) },
    uVolMin: { value: new THREE.Vector3() }, uVolExt: { value: new THREE.Vector3(1, 1, 1) }, uVolH: { value: new THREE.Vector2(RENDER.bake.hMinM, 1) },
    uBakeShadowSteps: { value: layout.shadowSteps },
  };
  for (const key of SHARED_KEYS) if (shared[key]) uniforms[key] = shared[key];
  const material = new THREE.ShaderMaterial({
    vertexShader: VERTEX, fragmentShader: FRAGMENT, uniforms, glslVersion: THREE.GLSL3,
    // 默认走预烘焙版；参考版（groundDustReference / ?dustRef=1）是原来逐像素全算的那一条
    defines: reference ? {} : { DUST_BAKED: 1 },
    side: THREE.BackSide, transparent: true, depthTest: false, depthWrite: false,
    blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
    blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor,
    blendEquation: THREE.AddEquation, blendEquationAlpha: THREE.AddEquation,
  });
  material.name = "GroundImpactDust";
  material.userData.preserveTargetAlpha = true;
  MarkNoPrepass(material);
  // 两只烘焙材质与主材质共用同一个 uniforms 对象：网格贴图、盒子、种子、漂移这些每帧量自动是同一份
  //（B 样条那一只不带 DUST_BAKED：它读的就是原始网格；受光那一只着色器里自己定义了 DUST_BAKED，读预烘焙网格）
  const Bake = (fragmentShader, name) => {
    const m = new THREE.ShaderMaterial({
      vertexShader: BAKE_VERTEX, fragmentShader, uniforms, glslVersion: THREE.GLSL3,
      depthTest: false, depthWrite: false, blending: THREE.NoBlending,
    });
    m.name = name;
    MarkNoPrepass(m);
    return m;
  };
  material.userData.bakeSpline = Bake(BAKE_SPLINE_FRAGMENT, "GroundImpactDustBakeSpline");
  material.userData.bakeLight = Bake(BAKE_LIGHT_FRAGMENT, "GroundImpactDustBakeLight");
  return material;
}

function DisposeMaterial(material) {
  material.userData.bakeSpline?.dispose(); material.userData.bakeLight?.dispose();
  material.dispose();
}

function MakeBakeTarget(width, height) {
  const target = new THREE.WebGLRenderTarget(width, height, {
    type: THREE.HalfFloatType, format: THREE.RGBAFormat, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
    generateMipmaps: false, depthBuffer: false, stencilBuffer: false,
  });
  target.texture.colorSpace = THREE.NoColorSpace;
  target.texture.wrapS = target.texture.wrapT = THREE.ClampToEdgeWrapping;
  return target;
}

/** 一团尘的预烘焙靶：两张网格 B 样条（N × splineScale 见方）+ 一张受光拼图。按网格边长 N 回收复用。 */
function MakeBake(N, layout) {
  const size = Math.max(2, Math.round(N * layout.splineScale));
  return { N, size, surge: MakeBakeTarget(size, size), loft: MakeBakeTarget(size, size),
    light: MakeBakeTarget(layout.light.width, layout.light.height) };
}

function DisposeBake(bake) { bake.surge.dispose(); bake.loft.dispose(); bake.light.dispose(); }

function MakeTexture(N) {
  const texture = new THREE.DataTexture(new Float32Array(N * N * 4), N, N, THREE.RGBAFormat, THREE.FloatType);
  texture.minFilter = texture.magFilter = THREE.LinearFilter;
  texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.generateMipmaps = false; texture.colorSpace = THREE.NoColorSpace;
  texture.needsUpdate = true;
  return texture;
}

// ---------------------------------------------------------------------------
// 降分辨率（Script_PostGroundDust）：尘团挂在专用层上只由那一趟画进低分辨率靶，主场景里换成一张全屏片按深度放大叠上。

/** 尘团在降分辨率模式下所在的层（主相机只看第 0 层；29 / 30 / 31 已被第一人称自阴影、人物合批、隐藏层占用）。 */
export const GROUND_DUST_LAYER = 28;

const UPSAMPLE_VERTEX = /* glsl */ `
void main(){ gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

// 按深度放大：取四个最近的低分辨率样本，双线性权重 × 深度相近度（低分辨率那条射线截在它像素中心的深度上，
// 与这个全分辨率像素的深度差得多 = 那条射线看到的不是这里），把尘糊到近处物体边上的那圈晕压掉。
const UPSAMPLE_FRAGMENT = /* glsl */ `
uniform sampler2D uDustHalf;
uniform sampler2D uNormalDepth;
uniform vec2 uFullRes;
uniform vec2 uHalfRes;
uniform float uDepthValid;
float SceneDepth(vec2 uv){ float d = texture2D(uNormalDepth, uv).w; return d > 0.0 ? d : 1.0e5; }
void main(){
  vec2 uv = gl_FragCoord.xy / uFullRes;
  vec2 hp = uv * uHalfRes - 0.5;
  vec2 base = floor(hp), f = hp - base;
  float d0 = uDepthValid > 0.5 ? SceneDepth(uv) : 1.0;
  vec4 acc = vec4(0.0);
  float wsum = 0.0;
  vec4 nearest = vec4(0.0, 0.0, 0.0, 1.0);
  float nearestErr = 1.0e9;
  for (int k = 0; k < 4; k++) {
    vec2 o = vec2(float(k - (k / 2) * 2), float(k / 2));
    vec2 tuv = clamp((base + o + 0.5) / uHalfRes, vec2(0.0), vec2(1.0));
    vec4 s = texture2D(uDustHalf, tuv);
    float bil = (o.x > 0.5 ? f.x : 1.0 - f.x) * (o.y > 0.5 ? f.y : 1.0 - f.y);
    float err = uDepthValid > 0.5 ? abs(SceneDepth(tuv) - d0) / max(d0, 0.5) : 0.0;
    float w = bil / (1.0 + 60.0 * err) + 1.0e-5;
    acc += s * w; wsum += w;
    if (err < nearestErr) { nearestErr = err; nearest = s; }
  }
  vec4 dust = acc / wsum;
  // 四个都对不上（深度边上）：用最接近的那一个，不要平均出一圈晕
  if (uDepthValid > 0.5 && nearestErr > 0.08) dust = nearest;
  gl_FragColor = vec4(max(dust.rgb, vec3(0.0)), clamp(dust.a, 0.0, 1.0));
}
`;

// ---------------------------------------------------------------------------
// 管理：一团尘 = 一张 DustFlowField + 一只盒子网格。

export class DustFieldSystem {
  constructor(root, shared, quality = "high") {
    this.root = root; this.shared = shared; this.quality = quality;
    this.fields = [];
    // 所有尘团的盒子挂在这一组下（降分辨率那一趟只渲染这一组，不必遍历整个场景）。
    this.group = new THREE.Group();
    this.group.name = "GroundImpactDustFields";
    this.root.add(this.group);
    // 尘团着色器用 gl_FragCoord / uResolution 去取预通道深度：降分辨率时这是低分辨率靶的尺寸，平时跟着共享的那份。
    this.resolution = { value: new THREE.Vector2(1, 1) };
    this.halfMode = false;
    this.upsample = null;     // 主场景里的全屏片（降分辨率模式才有、才显示）
    this.halfFrames = 0;
    this.noise = null;
    this.geometry = new THREE.BoxGeometry(1, 1, 1);
    this.frame = 0;
    this.nextSeed = 1;
    this.created = 0;
    this.floatLinear = null;
    this.materialPool = [];   // 用完的材质（不销毁：程序要一直留着，见文件头）
    this.uploads = 0;         // 取证：一共传了几次网格
    // 预烘焙（GROUND_IMPACT_RENDER.bake）：每团尘绘制前先烘两张拼图（体积、受光），一帧一次
    this.bakeLayout = BakeLayout(quality);
    this.bakePool = [];       // 用完的预烘焙靶（按网格边长 N 复用）
    this.bakes = 0;           // 取证：一共烘了几次受光
    this.splineBakes = 0;     // 取证：一共烘了几次网格 B 样条（只在网格上传那一帧）
    this.bakeScene = null; this.bakeQuad = null; this.bakeCamera = null;
    // 参考版（原来逐像素全算）：画质预设 groundDustReference 或 ?dustRef=1（referenceForced）
    this.reference = false;
    this.referenceForced = false;
    this.profiler = null;     // Script_Profiler（Vfx 每帧交进来）：烘焙单独记一段 GPU
  }

  /**
   * 参考版开 / 关（Script_PostGroundDust 每帧按画质预设调；referenceForced 压过预设）。
   * 两条路是同一份着色器的两个变体（DUST_BAKED），切换时现有材质重编一次。
   */
  SetReference(on) {
    const reference = !!on || this.referenceForced;
    if (reference === this.reference) return;
    this.reference = reference;
    for (const material of [...this.fields.map((e) => e.material), ...this.materialPool]) {
      material.defines = reference ? {} : { DUST_BAKED: 1 };
      material.needsUpdate = true;
    }
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
    // 每个随团写的统一变量下面与 Update 都会重写，回收来的材质直接用。
    const material = this.materialPool.pop() || MakeMaterial(this.shared, this.noise.texture, this.quality, this.reference);
    material.uniforms.uResolution = this.resolution;
    this._ApplyMode(material);
    const sets = [0, 1].map(() => ({ surge: MakeTexture(N), loft: MakeTexture(N), skin: MakeTexture(N) }));
    material.uniforms.uSurge.value = sets[0].surge; material.uniforms.uLoft.value = sets[0].loft; material.uniforms.uSkin.value = sets[0].skin;
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
    mesh.frustumCulled = false; mesh.matrixAutoUpdate = false; mesh.renderOrder = DUST_COMPOSITE_RENDER_ORDER;
    mesh.userData.skipNormalDepth = true;
    mesh.visible = false;
    mesh.layers.set(this.halfMode ? GROUND_DUST_LAYER : 0);
    this.group.add(mesh);
    const entry = { field, mesh, material, sets, back: 0, packed: false, slot: this.created % 4, info: null,
      origin: { x: field.minX, z: field.minZ }, retiring: false, bake: null, bakedFrame: -1, splineDirty: true };
    // 绘制前一刻烘焙（降分辨率那一趟、全分辨率画在主场景里都走这里）：渲染里套一次渲染，three 的反射镜同一个做法
    mesh.onBeforeRender = (renderer) => { this._CheckFloatLinear(renderer); this._Bake(renderer, entry); };
    this.fields.push(entry);
    this.created++;
    return entry;
  }

  /**
   * 一团尘的预烘焙（参考版不烘）：
   *   · 网格这一帧刚上传（splineDirty）：两层网格的 B 样条按 splineScale 倍精度算进 uSurgeB / uLoftB（与时间无关，传了才烘）；
   *   · 受光拼图 ← 朝太阳走远段（噪声、漂移、扭曲都随时间动）：刚炸的 upload.fullS 秒内每帧烘，之后隔帧烘（各团错开）——
   *     受光变化慢，隔帧看不出来，四团同屏时省一半烘焙。盒子按烘受光那一刻的 uBoxMin / uBoxMax 记进 uVolMin / uVolExt。
   */
  _Bake(renderer, e) {
    if (this.reference || e.bakedFrame === this.frame) return;
    e.bakedFrame = this.frame;
    const u = e.material.uniforms;
    if (!u.uSurge.value) return;
    const lightDue = !u.uLight.value || e.field.time < RENDER.upload.fullS || (this.frame + e.slot) % 2 === 0;
    if (!lightDue && !e.splineDirty) return;
    const N = e.field.N;
    if (!e.bake) {
      const k = this.bakePool.findIndex((b) => b.N === N);
      e.bake = k >= 0 ? this.bakePool.splice(k, 1)[0] : MakeBake(N, this.bakeLayout);
      e.splineDirty = true;
    }
    if (!this.bakeScene) {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
      this.bakeQuad = new THREE.Mesh(geometry, e.material.userData.bakeLight);
      this.bakeQuad.frustumCulled = false; this.bakeQuad.matrixAutoUpdate = false;
      this.bakeScene = new THREE.Scene();
      this.bakeScene.add(this.bakeQuad);
      this.bakeScene.matrixWorldAutoUpdate = false;
      this.bakeCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    }
    if (lightDue) {
      const min = u.uBoxMin.value, max = u.uBoxMax.value;
      u.uVolMin.value.copy(min);
      u.uVolExt.value.set(Math.max(0.1, max.x - min.x), Math.max(0.1, max.y - min.y), Math.max(0.1, max.z - min.z));
      // 竖直：离当地地面 hMinM 到盒顶（按盒底那么低的地面算，沟底、坑底也够得着）
      u.uVolH.value.set(RENDER.bake.hMinM, Math.max(1, max.y - min.y - RENDER.bake.hMinM + 0.5));
    }
    const P = this.profiler?.on ? this.profiler : null;
    const prevTarget = renderer.getRenderTarget(), prevFace = renderer.getActiveCubeFace(), prevLevel = renderer.getActiveMipmapLevel();
    const prevAuto = renderer.autoClear, infoAuto = renderer.info.autoReset;
    renderer.autoClear = false; renderer.info.autoReset = false;
    P?.GpuPush("groundDust/bake");
    try {
      if (e.splineDirty) {
        e.splineDirty = false;
        this.bakeQuad.material = e.material.userData.bakeSpline;
        u.uSplineSize.value.set(e.bake.size, e.bake.size);
        for (const [loft, target] of [[0, e.bake.surge], [1, e.bake.loft]]) {
          u.uSplineLoft.value = loft;
          renderer.setRenderTarget(target);
          renderer.render(this.bakeScene, this.bakeCamera);
        }
        u.uSurgeB.value = e.bake.surge.texture; u.uLoftB.value = e.bake.loft.texture;
        this.splineBakes++;
      }
      if (lightDue) {
        this.bakeQuad.material = e.material.userData.bakeLight;
        renderer.setRenderTarget(e.bake.light);
        renderer.render(this.bakeScene, this.bakeCamera);
        u.uLight.value = e.bake.light.texture;
        this.bakes++;
      }
    } finally {
      P?.GpuPop();
      renderer.setRenderTarget(prevTarget, prevFace, prevLevel);
      renderer.autoClear = prevAuto; renderer.info.autoReset = infoAuto;
    }
  }

  /** 极少数机器不支持浮点贴图线性过滤：退回最近点，块感重一点但不会黑。 */
  _CheckFloatLinear(renderer) {
    if (this.floatLinear !== null) return;
    this.floatLinear = !!renderer.extensions?.has?.("OES_texture_float_linear");
    if (!this.floatLinear) for (const e of this.fields) for (const set of e.sets) {
      for (const t of [set.surge, set.loft, set.skin]) { t.minFilter = t.magFilter = THREE.NearestFilter; t.needsUpdate = true; }
    }
  }

  /** 有没有要画的尘（降分辨率那一趟据此决定跑不跑）。 */
  HasVisible() { return this.fields.some((e) => e.mesh.visible); }

  /** 一只尘团材质按当前模式设混合：降分辨率靶里 alpha 要累积透过率，主场景里保留目标 alpha。 */
  _ApplyMode(material) {
    material.blendDstAlpha = this.halfMode ? THREE.OneMinusSrcAlphaFactor : THREE.OneFactor;
  }

  /**
   * 降分辨率开 / 关（Script_PostGroundDust 每帧：跑了 = 开，被跳过 = 关）。开：尘团挪到专用层（主场景那一趟看不见），
   * 全屏片显示；关：尘团回第 0 层按原样全分辨率画，全屏片收起，分辨率跟回共享的那份。
   */
  SetHalfMode(on) {
    const half = !!on;
    if (!half) {
      this.resolution.value.copy(this.shared.uResolution.value);
      // 没有降分辨率尘：粒子不再按尘的前沿深度遮挡（全分辨率时没有那张前沿深度）
      if (this.shared.uDustOcclusion) this.shared.uDustOcclusion.value = 0;
    }
    if (half === this.halfMode) { if (this.upsample) this.upsample.visible = half && this.HasVisible(); return; }
    this.halfMode = half;
    for (const e of this.fields) { e.mesh.layers.set(half ? GROUND_DUST_LAYER : 0); this._ApplyMode(e.material); }
    for (const material of this.materialPool) this._ApplyMode(material);
    if (this.upsample) this.upsample.visible = half && this.HasVisible();
  }

  _EnsureUpsample() {
    if (this.upsample) return this.upsample;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
    const material = new THREE.ShaderMaterial({
      vertexShader: UPSAMPLE_VERTEX, fragmentShader: UPSAMPLE_FRAGMENT,
      uniforms: {
        uDustHalf: { value: null }, uNormalDepth: this.shared.uNormalDepth, uDepthValid: this.shared.uDepthValid,
        uFullRes: { value: new THREE.Vector2(1, 1) }, uHalfRes: { value: new THREE.Vector2(1, 1) },
      },
      transparent: true, depthTest: false, depthWrite: false,
      // hdr = hdr·T + C（靶里存的是预乘散射 + 累积透过率）；目标 alpha 原样保留
      blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.SrcAlphaFactor,
      blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor,
      blendEquation: THREE.AddEquation, blendEquationAlpha: THREE.AddEquation,
    });
    material.name = "GroundImpactDustUpsample";
    material.userData.preserveTargetAlpha = true;
    MarkNoPrepass(material);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = "GroundImpactDustUpsample";
    // 排在所有粒子之前（Script_DustOcclusion）：之后画的烟、火、溅射土按「尘的前沿深度」自己决定在尘前还是尘后。
    mesh.frustumCulled = false; mesh.matrixAutoUpdate = false; mesh.renderOrder = DUST_COMPOSITE_RENDER_ORDER;
    mesh.userData.skipNormalDepth = true;
    mesh.visible = false;
    this.root.add(mesh);
    this.upsample = mesh;
    return mesh;
  }

  /**
   * Script_PostGroundDust.Render：把所有尘团画进低分辨率靶（清成「没有散射、全透」），再让主场景里的全屏片去放大它。
   * 渲染器的目标 / 清屏色 / autoClear 与相机的层都原样还回去。
   */
  RenderHalf(renderer, camera, target, fullWidth, fullHeight) {
    this.SetHalfMode(true);
    // 按真正出图的相机再排一次（Update 时拿到的可能还是玩家相机：测试场自由相机、过场机位是之后才套上的）
    this.SortForCamera(camera.position);
    this.resolution.value.set(target.width, target.height);
    const prevTarget = renderer.getRenderTarget(), prevAuto = renderer.autoClear, prevAlpha = renderer.getClearAlpha();
    const prevColor = renderer.getClearColor(this._clearColor ??= new THREE.Color()), prevLayers = camera.layers.mask;
    renderer.setRenderTarget(target);
    renderer.setClearColor(0x000000, 1);
    renderer.clear(true, false, false);
    renderer.autoClear = false;
    camera.layers.set(GROUND_DUST_LAYER);
    try { renderer.render(this.group, camera); }
    finally {
      camera.layers.mask = prevLayers;
      renderer.autoClear = prevAuto;
      renderer.setClearColor(prevColor, prevAlpha);
      renderer.setRenderTarget(prevTarget);
    }
    const quad = this._EnsureUpsample();
    const u = quad.material.uniforms;
    u.uDustHalf.value = target.texture;
    // 粒子按尘的前沿深度与透过率决定前后（Script_DustOcclusion）：靶的第二张是前沿深度
    if (this.shared.uDustOcclusion && target.textures?.length > 1) {
      this.shared.uDustHalf.value = target.textures[0];
      this.shared.uDustFront.value = target.textures[1];
      this.shared.uDustOcclusion.value = 1;
    }
    u.uFullRes.value.set(fullWidth, fullHeight);
    u.uHalfRes.value.set(target.width, target.height);
    quad.visible = true;
    this.halfFrames++;
  }

  Update(dt, wind = null, camera = null) {
    this.frame = (this.frame + 1) % 4096;
    // 不在降分辨率模式时，尘团取深度用的分辨率跟着共享的那份（主靶尺寸）。
    if (!this.halfMode) this.resolution.value.copy(this.shared.uResolution.value);
    for (let k = this.fields.length - 1; k >= 0; k--) {
      const e = this.fields[k], field = e.field;
      if (wind) { field.wind.x = wind.x; field.wind.z = wind.z; }
      const alive = dt > 0 ? field.Step(dt) : !field.finished;
      if (!alive) { this._Remove(k); continue; }
      if (!field.ready) { e.mesh.visible = false; continue; }
      const u = e.material.uniforms;
      // 上传节流（GROUND_IMPACT_RENDER.upload）：新的一团每帧传，之后隔帧、再之后每几帧传一次（各团错开）；
      // 写进「不在画的那一套」贴图再换上去，显卡读上一帧那套时不用停下来等。网格范围这几项跟着这一次的数据走。
      const U = RENDER.upload, age = field.time;
      const every = age < U.fullS ? 1 : age < U.halfS ? 2 : U.slowEvery;
      if (!e.packed || (this.frame + e.slot) % every === 0) {
        const set = e.sets[e.back];
        const info = field.Pack(set.surge.image.data, set.loft.image.data, set.skin.image.data);
        for (const t of [set.surge, set.loft, set.skin]) {
          if (this.floatLinear === false) t.minFilter = t.magFilter = THREE.NearestFilter;
          t.needsUpdate = true;
        }
        u.uSurge.value = set.surge; u.uLoft.value = set.loft; u.uSkin.value = set.skin;
        e.back ^= 1; e.packed = true; e.info = info; this.uploads++;
        e.splineDirty = true;
        u.uSurgeRect.value.set(info.surgeRect[0], info.surgeRect[1], 1 / info.surgeRect[2], 1 / info.surgeRect[3]);
        u.uLoftRect.value.set(info.loftRect[0], info.loftRect[1], 1 / info.loftRect[2], 1 / info.loftRect[3]);
        u.uBaseY.value = info.baseY;
        u.uSkinRect.value.set(info.skinRect[0], info.skinRect[1], 1 / info.skinRect[2], 1 / info.skinRect[3]);
        u.uSkinShape.value.set(info.skinH, info.skinLift, info.shockR, info.shockV);
        u.uImpact.value.set(info.impact[0], info.impact[1]);
        // 采样坐标的三维扭曲会把尘往外推出数据的范围（大炸弹七八米）：盒子按扭曲幅度留余量，不然尘团顶被盒顶切成一块平盖
        const pad = u.uWarp.value * 1.6;
        u.uBoxMin.value.set(info.minX - pad, info.minY, info.minZ - pad);
        u.uBoxMax.value.set(info.maxX + pad, info.maxY + pad, info.maxZ + pad);
      }
      const info = e.info, fade = field.Fade();
      this._FireUniforms(u, field, info);
      u.uAge.value = field.time;
      u.uFade.value = fade;
      u.uDrift.value.set(field.loftX - e.origin.x, 0, field.loftZ - e.origin.z);
      u.uFrame.value = this.frame;
      e.mesh.visible = fade > 0.001;
    }
    if (camera) this.SortForCamera(camera.position);
  }

  /**
   * 尘团之间的前后（2026-10-28）：每团一只透明盒子、互不写深度，只能按画的先后叠。原来都是同一个 renderOrder、
   * 网格位置又都在原点，three 只好按创建先后排 —— 后炸的那团哪怕更远也盖在先炸的那团上。
   * 现在按相机到每团尘质心（尘柱层的网格中心、土柱三成高）的距离从远到近排：远的先画，人在里头的那团最后画。
   */
  SortForCamera(eye) {
    const order = [];
    for (const e of this.fields) {
      const f = e.field;
      if (!f.ready) continue;
      const half = 0.5 * f.N * f.loftCell;
      const cx = f.loftX + half, cz = f.loftZ + half;
      const cy = (f.groundY ?? e.info?.baseY ?? 0) + 0.3 * (f.columnHeight || 0);
      order.push({ e, d: Math.hypot(cx - eye.x, cy - eye.y, cz - eye.z) });
    }
    order.sort((a, b) => b.d - a.d);
    order.forEach(({ e }, k) => { e.mesh.renderOrder = DUST_COMPOSITE_RENDER_ORDER + k * 1e-3; });
    this.lastSort = order.map(({ e, d }) => ({ x: +e.field.cx.toFixed(1), z: +e.field.cz.toFixed(1), d: +d.toFixed(2) }));
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
    for (const set of e.sets) { set.surge.dispose(); set.loft.dispose(); set.skin.dispose(); }
    // 材质回收（不 dispose：最后一只一销毁，着色器程序跟着删，下一发重编）。池子封顶，多出来的才销毁。
    e.material.uniforms.uSurge.value = e.material.uniforms.uLoft.value = e.material.uniforms.uSkin.value = null;
    e.material.uniforms.uSurgeB.value = e.material.uniforms.uLoftB.value = e.material.uniforms.uLight.value = null;
    if (this.materialPool.length < RENDER.maxFields + 2) this.materialPool.push(e.material); else DisposeMaterial(e.material);
    if (e.bake) {
      if (this.bakePool.length < 4) this.bakePool.push(e.bake); else DisposeBake(e.bake);
      e.bake = null;
    }
    this.fields.splice(k, 1);
  }

  Clear() { for (let k = this.fields.length - 1; k >= 0; k--) this._Remove(k); }

  Inspect() {
    return {
      live: this.fields.length, created: this.created, floatLinear: this.floatLinear, uploads: this.uploads, pooled: this.materialPool.length,
      halfMode: this.halfMode, halfFrames: this.halfFrames, reference: this.reference, bakes: this.bakes, splineBakes: this.splineBakes,
      bakeLayout: { light: this.bakeLayout.light.dims, splineScale: this.bakeLayout.splineScale },
      fields: this.fields.map((e) => e.field.Inspect()),
    };
  }

  Dispose() {
    this.Clear();
    for (const material of this.materialPool) DisposeMaterial(material);
    this.materialPool.length = 0;
    for (const bake of this.bakePool) DisposeBake(bake);
    this.bakePool.length = 0;
    if (this.bakeQuad) { this.bakeQuad.geometry.dispose(); this.bakeQuad = null; this.bakeScene = null; }
    if (this.upsample) { this.upsample.removeFromParent(); this.upsample.geometry.dispose(); this.upsample.material.dispose(); this.upsample = null; }
    this.group.removeFromParent();
    this.geometry.dispose();
    this.noise?.Release(); this.noise = null;
  }
}
