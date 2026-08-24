// 《血战台儿庄》粒子与特效系统。
//
// 这一层是"3A 观感"里最能一眼看出差距的地方：一发子弹打在青砖墙上有没有砖粉、
// 有没有碎砖弹跳、墙上有没有留下一个亮边暗芯的弹孔。清真寺西小讲堂南外墙
// 每平方米上百个弹孔 —— "无墙不饮弹"要靠弹孔密度表达，不是靠血浆。
//
// 三条决定架构的约束（改之前先想清楚为什么）：
//
//   1) **粒子位置在 vertex shader 里解析式求**，不在 CPU 回写矩阵。
//      生成时间/初速/加速度/阻尼全是实例属性，位置 = 带线性阻尼弹道的闭式解。
//      四千个粒子每帧回写 InstancedMesh 的矩阵是掉帧首因（4000×16 float 上传 +
//      4000 次 Matrix4 合成），改成属性后只有"生成那一帧"才碰缓冲区。
//
//   2) **粒子必须在深度法线预通道里隐身**。Script_Post 第 1 趟用
//      scene.overrideMaterial 覆盖全场烘 rtNormalDepth；半透明粒子被覆盖后会
//      写进深度，SSAO 立刻在烟雾后面出现一圈黑边，软粒子也会自己遮自己。
//      办法是挂 scene.onBeforeRender：overrideMaterial 非空的那一趟把 root 藏掉。
//      （不改 Script_Post 一个字 —— 每个 agent 只碰自己那个文件。）
//
//   3) **零 Math.random**。抖动全走 Mulberry32，同一串调用永远出同一画面，
//      视觉审查才能逐轮截图比对。
//
// 烟为什么"有体积"：多层半透明 billboard + 各自旋转 + 随时间膨胀 + 用
// rtNormalDepth 做软粒子（与背景深度差小的地方淡出，否则烟像刀切进地面）+
// 每片按假球面法线做一次朗伯着色（没有明暗面的话，叠再多层也还是一张灰纸）。
//
// 约束 2 有一条必须自己还的债：**粒子不进预通道，就吃不到合成 pass 的雾**。
// Script_Post 的大气透视挂在 rtNormalDepth 的 w 上，而且明写「深度 0 的天空不吃雾」；
// 粒子在预通道里是隐身的，于是背景是天空的那些像素上 nd.w = 0，整段雾被跳过。
// 近处看不出来（雾量本来就接近 0），两百米外的黑烟柱就变成天上一个**纯黑的洞**，
// 而且随着烟越积越多越长越大 —— 这不是 NaN，是缺了大气透视。
// 所以 AERIAL 那一段在粒子自己的着色器里补雾，且只补「背景是天空」的那一半：
// 背景有实体时合成 pass 已经按背景深度盖过雾了，再补一次就是双份。

import * as THREE from "three";
import { Mulberry32, HashString } from "./Script_Noise.mjs";
import { MarkNoPrepass } from "./Script_Post.mjs";

// ---------------------------------------------------------------------------
// 色板：全部来自 docs/Data_HistoryMaterial.md 的考据表。
// 台儿庄的爆炸主体色是**暖的砖粉黄土**，不是好莱坞的橙红火球；
// 发烟筒是白灰色贴地翻滚，**不是绿色毒雾**（1938 年 3—4 月还在催泪筒阶段）。
// ---------------------------------------------------------------------------
const SCRATCH_COLOR = new THREE.Color();

/** hex(sRGB) -> 线性工作空间三元组。整条管线是线性的，最后一 pass 才转 sRGB。 */
function LinearOf(hex, intensity = 1) {
  SCRATCH_COLOR.setHex(hex);
  return [SCRATCH_COLOR.r * intensity, SCRATCH_COLOR.g * intensity, SCRATCH_COLOR.b * intensity];
}

export const VFX_PALETTE = {
  dust: LinearOf(0xC4B49A),         // 砖粉+黄土烟尘（爆炸主体）
  dustDense: LinearOf(0x9E9078),    // 浓处
  dustPale: LinearOf(0xD8CDB6),     // 逆光边缘
  powderSmoke: LinearOf(0x9A9A96),  // 火药烟
  powderThin: LinearOf(0xC2C2BE),   // 薄火药烟
  // 真实的黑烟不是纯黑：亮天里仍会被天空散射抬成深灰。纯黑叠在半透明
  // billboard 上会变成一根吃掉天空与城墙细节的“洞”，而不是烟。
  blackSmoke: LinearOf(0x625e58),   // 木梁/柴油黑烟的外沿（深灰褐）
  blackCore: LinearOf(0x393632),    // 黑烟核心（保留重感，不压成纯黑）
  screenSmoke: LinearOf(0xE2E0D8),  // 发烟筒/催泪筒：白—灰白
  soil: LinearOf(0xA89373),         // 裸土
  soilAir: LinearOf(0xC0AE8C),      // 扬尘后的土色
  brick: LinearOf(0x7E8388),        // 青砖
  brickCore: LinearOf(0x9AA0A3),    // 新弹痕断口（比表面亮 1—2 档）
  brickHole: LinearOf(0x2A2724),    // 弹孔暗芯
  wood: LinearOf(0x5A4630),         // 素木
  woodBurnt: LinearOf(0x2E2A26),
  burlap: LinearOf(0x8C8467),       // 麻袋/沙包布
  sand: LinearOf(0xC8B583),
  water: LinearOf(0x6E7358),
  brass: LinearOf(0xC9A227),        // 弹壳
  steel: LinearOf(0x8E9299),
  blood: LinearOf(0x6E1B14),        // 暗红，克制使用
  bloodDark: LinearOf(0x3A0E0A),
  // --- HDR 发光（数值给到 3—8，泛光阈值 1.05，Script_Post 会接住）---
  fireHot: LinearOf(0xFFD9A0, 7.0),
  fireMid: LinearOf(0xFF8A2A, 4.0),
  fireCool: LinearOf(0x8E2A10, 1.6),
  flashCore: LinearOf(0xFFF3D6, 22.0),   // 爆炸中心的短命强光
  muzzleCore: LinearOf(0xFFF0CC, 8.0),
  muzzleEdge: LinearOf(0xFF9A3A, 3.2),
  tracerNra: LinearOf(0xFFE3B0, 5.5),    // 中方：偏暖白
  tracerIja: LinearOf(0xCFE6FF, 5.0),    // 日方：偏冷白/淡青
  sparkHot: LinearOf(0xFFE2B0, 6.5),
  sparkCool: LinearOf(0xD05A16, 2.0),
  markerWarn: LinearOf(0xFF6A3A, 3.0),   // 掷弹筒落点预警
};

// ---------------------------------------------------------------------------
// 画质档：预算既控制池容量，也控制每次效果的发射数量。
// 目标 1600x900 / 55fps，粒子总数 4000 以内。
// ---------------------------------------------------------------------------
const QUALITY_PRESETS = {
  low: { budget: 0.35, spawn: 0.45, decals: 60, dust: 0.35, soft: false },
  medium: { budget: 0.65, spawn: 0.72, decals: 120, dust: 0.7, soft: true },
  high: { budget: 1.0, spawn: 1.0, decals: 200, dust: 1.0, soft: true },
  ultra: { budget: 1.0, spawn: 1.25, decals: 240, dust: 1.25, soft: true },
};

// 升柱烟的阻尼系数。闭式解 v(t) = a/k + (v0 − a/k)e^(−kt)：只要浮力给成 rise·k，
// 终速就锁在 rise 上，烟柱这条支线才有"一直往上"这个行为。
// 0.55 是"还看得出初速衰减、但九秒能爬三十米"的折中；再大就又变回一颗球。
const BUOYANT_DRAG = 0.55;

// 池容量分配（占总预算的比例）。烟最费，因为它活得久、片子大。
const POOL_SHARE = {
  smoke: 0.30, fire: 0.08, streak: 0.14, debris: 0.10,
  dust: 0.16, star: 0.03, ring: 0.02, decal: 0.09, sprite: 0.08,
};

// ---------------------------------------------------------------------------
// 共用 GLSL
// ---------------------------------------------------------------------------
const GLSL_NOISE = /* glsl */`
float Hash21(vec2 p) {
  vec3 q = fract(vec3(p.xyx) * 0.1031);
  q += dot(q, q.yzx + 33.33);
  return fract((q.x + q.y) * q.z);
}
// 一层 value noise 就够把"完美圆片"打碎；烟的填充率很高，别在这里堆八度。
float Vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = Hash21(i), b = Hash21(i + vec2(1.0, 0.0));
  float c = Hash21(i + vec2(0.0, 1.0)), d = Hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
`;

const VERT_PARTICLE = /* glsl */`
attribute vec2 iSpawnLife;   // x 生成时刻 y 寿命（0 = 空槽）
attribute vec3 iOrigin;
attribute vec3 iVelocity;
attribute vec3 iAccel;       // 重力 / 浮力 / 风
attribute vec2 iSize;        // 起始半径 -> 结束半径（米）
attribute vec2 iSpin;        // 起始角 / 角速度
attribute vec3 iColorA;
attribute vec3 iColorB;
attribute vec4 iParams;      // x 峰值不透明度 y 淡入占比 z 阻尼系数 w 种子
attribute vec4 iExtra;       // x 拉伸长度(米) y 闪烁频率 z 地面高度 w 备用
#ifdef ORIENT_NORMAL
attribute vec3 iNormal;
#endif

uniform float uTime;
uniform float uGlobalFade;
uniform float uFadeOutStart;   // 淡出起点：普通池 0.45，序列帧火球 0.82（16 帧要播完）
#ifdef AERIAL
uniform vec3 uSunDirection;
uniform float uFogDensity;
uniform float uFogFalloff;
uniform float uFogBase;
uniform float uFogMax;
uniform vec3 uFogColorSky;
uniform vec3 uFogColorGround;
uniform float uFogSunGain;
uniform vec3 uSunColorFog;
varying vec4 vAerial;        // rgb 雾色 / a 雾量。逐顶点算：片子只有四个角，逐片元纯浪费
#endif

varying vec2 vShape;
varying vec3 vColor;
varying vec3 vColorAlt;      // 生命末端色，弹孔那种"同一片上要两个颜色"的形状要用
varying float vAlpha;
varying float vSeed;
varying float vAge01;
varying float vFrame;          // 序列帧池的起始帧；其余池恒为 0
varying float vViewDepth;
#if defined(LIT) || defined(LIT_SURFACE)
varying vec3 vLitNormal;
#endif
#ifdef SHAPE_DECAL
varying float vRays;       // 放射断口线的强度：弹孔 1、爆炸焦痕 0
varying float vDecalSize;  // 深度裁边容差要随贴花尺寸增长；焦痕比弹孔跨过更多地表起伏
#endif
#ifdef LIT
varying vec3 vViewDir;     // 世界空间视线（相机 -> 粒子），前向散射要用
#endif

void main() {
  float life = iSpawnLife.y;
  float age = uTime - iSpawnLife.x;
  if (life <= 0.0 || age < 0.0 || age > life) {
    // 死槽推出裁剪体：四个角落在同一点，光栅化直接丢掉，比每帧压缩缓冲区便宜得多
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    return;
  }
  float t01 = clamp(age / life, 0.0, 1.0);
  vAge01 = t01;
  vSeed = iParams.w;
  vFrame = iExtra.w;

  // 带线性阻尼的弹道闭式解：v' = a - k·v
  //   v(t) = a/k + (v0 - a/k)e^(-kt)
  //   p(t) = p0 + (a/k)t + (v0 - a/k)(1 - e^(-kt))/k
  // k 下限卡在 0.05：再小两项就开始严重相消，float 精度撑不住（会看到粒子抽搐）。
  float k = max(iParams.z, 0.05);
  vec3 world = iOrigin
    + (iVelocity - iAccel / k) * ((1.0 - exp(-k * age)) / k)
    + iAccel * (age / k);

#ifdef SHAPE_PUFF
  // 常驻烟源把 iExtra.z 写成很小的上升流摆幅；没有写时仍是 -9999，
  // max 后完全等价于旧弹道。两条不同频率的横向卷动不改变烟的总体风向，
  // 只让同一根烟柱的团絮不再像一串对齐的圆片。
  float plumeWobble = max(iExtra.z, 0.0);
  if (plumeWobble > 0.0) {
    float phase = iParams.w * 31.0;
    float swell = plumeWobble * (0.20 + t01 * 0.95);
    world.x += (sin(age * 0.77 + phase) - sin(phase)) * swell;
    world.z += (sin(age * 1.13 + phase * 1.7) - sin(phase * 1.7)) * swell * 0.72;
  }
#endif

#ifdef GROUND_BOUNCE
  // 假弹跳：陷得越深回弹越低，一定会停在地面上。真解算多次弹跳要迭代，
  // 而火星/碎块只需要"跳一下然后趴下"这个观感。
  float below = max(0.0, iExtra.z - world.y);
  if (below > 0.0) world.y = iExtra.z + below * 0.34 * exp(-below * 2.2);
#endif

  // iExtra.x 对普通烟团是“扩散曲线”：0 用默认的 2.0；小于 1 会慢慢
  // 展开。常驻火灾烟如果沿用爆炸烟的急速膨胀，会在柱顶堆成一颗遮天黑球。
  // stretch / decal 池各自复用这条属性，受自己的预处理分支约束，不受影响。
  float growthPower = iExtra.x > 0.0 ? iExtra.x : 2.0;
  float grow = 1.0 - pow(1.0 - t01, growthPower);
  float size = mix(iSize.x, iSize.y, grow);
  vec2 corner = position.xy;
  vShape = corner;

  vec3 offset;
#if defined(ORIENT_NORMAL)
  // 贴面：弹孔贴花、贴地尘环
  vec3 n = normalize(iNormal);
  vec3 guide = abs(n.y) > 0.92 ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 1.0, 0.0);
  vec3 tx = normalize(cross(guide, n));
  vec3 ty = cross(n, tx);
  float ang = iSpin.x + iSpin.y * age;
  float ca = cos(ang), sa = sin(ang);
  offset = (tx * (corner.x * ca - corner.y * sa) + ty * (corner.x * sa + corner.y * ca)) * size;
  #ifdef LIT_SURFACE
    vLitNormal = n;
  #endif
#elif defined(ORIENT_STRETCH)
  // 沿飞行方向拉长：曳光弹与火星。头在 corner.x = +1 处。
  vec3 toCam = cameraPosition - world;
  vec3 dir = normalize(iVelocity + vec3(0.0, 1e-5, 0.0));
  vec3 side = normalize(cross(dir, normalize(toCam + vec3(1e-5))));
  offset = dir * ((corner.x - 1.0) * 0.5 * iExtra.x) + side * (corner.y * size);
#else
  // 面向相机：从 viewMatrix 取相机的右/上轴（比 modelViewMatrix 稳，
  // 因为整个池挂在 root 上、模型矩阵是单位阵）
  vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
  vec3 upv   = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
  float ang = iSpin.x + iSpin.y * age;
  float ca = cos(ang), sa = sin(ang);
  vec2 c = vec2(corner.x * ca - corner.y * sa, corner.x * sa + corner.y * ca);
  offset = (right * c.x + upv * c.y) * size;
  #ifdef LIT
    // 假球面法线：把片子当成一个球来打光，烟才有明暗面
    vLitNormal = normalize(right * c.x * 0.85 + upv * c.y * 0.85 + normalize(toCamOrZ(world)) * 0.75);
    vViewDir = normalize(-toCamOrZ(world));
  #endif
#endif

  vec3 finalPos = world + offset;
  vec4 viewPos = viewMatrix * modelMatrix * vec4(finalPos, 1.0);
  vViewDepth = -viewPos.z;
  gl_Position = projectionMatrix * viewPos;

  vColor = mix(iColorA, iColorB, smoothstep(0.0, 0.8, t01));
  vColorAlt = iColorB;
#ifdef SHAPE_DECAL
  vRays = iExtra.x;        // iExtra 是顶点属性，片元拿不到，得靠 varying 递过去
  vDecalSize = size;
#endif

  // fadeIn 是"占寿命的比例"。贴花寿命是 1e5 秒，任何非零比例都会变成几十秒才浮现，
  // 所以 0 必须当"立刻出现"处理，不能靠 max() 兜一个极小值。
  float fadeIn = iParams.y <= 0.0 ? 1.0 : smoothstep(0.0, iParams.y, t01);
  float fadeOut = 1.0 - smoothstep(uFadeOutStart, 1.0, t01);
  float flicker = 1.0;
  if (iExtra.y > 0.0) {
    flicker = 0.5 + 0.5 * sin(age * iExtra.y * 6.2831853 + iParams.w * 17.0);
  }
  vAlpha = iParams.x * fadeIn * fadeOut * flicker * uGlobalFade;

#ifdef AERIAL
  // 大气透视，公式与 Script_Post 的雾逐项对齐（密度/高度衰减/上限/雾色/朝阳增益）。
  // 对不齐的话，一根烟柱跨过屋脊线时会在天空与实体的交界上裂出一条硬边。
  vAerial = vec4(0.0);
  if (uFogDensity > 0.0) {
    vec3 rayDir = normalize(finalPos - cameraPosition);
    float fd = 1.0 - exp(-max(vViewDepth, 0.0) * uFogDensity);
    float hFall = exp(-max(finalPos.y - uFogBase, 0.0) / max(uFogFalloff, 0.5));
    vec3 col = mix(uFogColorGround, uFogColorSky, clamp(rayDir.y * 2.0 + 0.35, 0.0, 1.0));
    col += uSunColorFog * pow(max(dot(rayDir, normalize(uSunDirection)), 0.0), 8.0) * uFogSunGain;
    vAerial = vec4(col, clamp(fd * hFall, 0.0, uFogMax));
  }
#endif
}
`;

// toCamOrZ 只在 LIT 分支用得到，写成函数是为了让 #ifdef 里那一行读得懂。
// 相机正好落在粒子中心时 cameraPosition - world 会退化成零向量，normalize 出 NaN，
// 整片粒子会闪成黑块 —— 所以退化时给一个固定方向。
const GLSL_VERT_HELPERS = /* glsl */`
vec3 toCamOrZ(vec3 world) {
  vec3 d = cameraPosition - world;
  return dot(d, d) > 1e-8 ? d : vec3(0.0, 0.0, 1.0);
}
`;

const FRAG_PARTICLE = /* glsl */`
uniform sampler2D uNormalDepth;
uniform float uDepthValid;   // 1 = uNormalDepth 是真的预通道靶，不是 1x1 兜底
uniform vec2 uResolution;
uniform float uSoftEnabled;
uniform float uSoftRange;
uniform float uNearFade;
uniform sampler2D uSpriteMap;    // 序列帧贴图；非 SHAPE_SPRITE 池挂共享的 1×1 白图
uniform vec2 uSpriteGrid;        // 帧网格（列×行）
uniform float uSpriteFrames;     // 帧总数
uniform float uSpriteEmission;   // 自带颜色的 CC0 flipbook：只把高亮火焰抬进 HDR，烟仍保留暗部
uniform vec3 uSunDirection;
uniform vec3 uSunColor;
uniform vec3 uSkyColor;
#ifdef AERIAL
varying vec4 vAerial;
#endif

varying vec2 vShape;
varying vec3 vColor;
varying vec3 vColorAlt;
varying float vAlpha;
varying float vSeed;
varying float vAge01;
varying float vFrame;          // 序列帧池的起始帧；其余池恒为 0
varying float vViewDepth;
#if defined(LIT) || defined(LIT_SURFACE)
varying vec3 vLitNormal;
#endif
#ifdef SHAPE_DECAL
varying float vRays;       // 放射断口线的强度：弹孔 1、爆炸焦痕 0
varying float vDecalSize;
#endif
#ifdef LIT
varying vec3 vViewDir;     // 世界空间视线（相机 -> 粒子），前向散射要用
#endif

void main() {
  vec2 p = vShape;
  float d = length(p);
  float mask = 0.0;
  vec3 color = vColor;

#if defined(SHAPE_PUFF)
  // 烟/尘：两层不同尺度的噪声让每一片都是一团卷起来的絮，而不是一张
  // 单调的柔边圆盘。只啃外轮廓仍会读成“半透明云”；要让中心密度也有起伏，
  // 多片叠起来才会出现烟羽的深浅团块。
  float coarse = Vnoise(p * 1.9 + vec2(vSeed * 37.0, vSeed * 11.0));
  float fine = Vnoise(p * 5.4 + vec2(vSeed * 19.0 + vAge01 * 1.7, vSeed * 29.0));
  float edge = 0.76 + coarse * 0.26 - fine * 0.12;
  float outer = smoothstep(edge, edge * 0.16, d);
  float core = smoothstep(1.02, 0.08, d);
  mask = outer * mix(0.46 + fine * 0.16, 1.0, core * core);
  mask *= mask;                                  // 中心厚、边缘薄，叠层才有体积
#elif defined(SHAPE_STAR)
  // 枪口焰：不规则星芒 + 白核。两帧就灭，所以形状比动画重要。
  float a = atan(p.y, p.x);
  float spikes = 0.34 + 0.66 * pow(abs(sin(a * 2.5 + vSeed * 19.0)), 0.55);
  float arm = smoothstep(spikes, spikes * 0.06, d);
  float core = smoothstep(0.42, 0.0, d);
  mask = arm * 0.62 + core;
  color = mix(color, vec3(1.0), core * 0.5);
#elif defined(SHAPE_STREAK)
  // 曳光/火星：横向高斯 + 头亮尾暗
  float across = exp(-p.y * p.y * 5.5);
  float head = clamp(p.x * 0.5 + 0.5, 0.0, 1.0);
  mask = across * mix(0.03, 1.0, pow(head, 2.2));
#elif defined(SHAPE_RING)
  // 贴地扩散的尘环 —— 爆炸"有当量"的关键一笔
  float n = Vnoise(p * 3.4 + vec2(vSeed * 23.0, 7.0));
  float radius = 0.72 + 0.12 * n;
  float band = 0.30 - 0.16 * vAge01;             // 环随时间变薄
  // 外圈只做很轻的收边：卡在 1.0 会把环的外半边直接切掉，看着像半个碗
  mask = smoothstep(band, 0.0, abs(d - radius)) * smoothstep(1.38, 1.10, d);
#elif defined(SHAPE_DECAL)
  // 弹孔：暗芯 + 比墙面亮 1—2 档的砖芯环 + 放射白线（考据里的"新弹痕断口"）
  float a = atan(p.y, p.x);
  float n = Vnoise(p * 4.0 + vec2(vSeed * 13.0, 3.0));
  float hole = smoothstep(0.46 + 0.06 * n, 0.16, d);
  float rim = smoothstep(0.26, 0.5, d) * smoothstep(0.86, 0.5, d);
  // iExtra.x 在贴花池里当"放射线强度"用：弹孔要那圈断口白线，
  // 爆炸焦痕放大到几米之后同一套线会变成一个卡通星号，所以给 0。
  float rays = pow(abs(sin(a * 6.0 + vSeed * 31.0)), 9.0) * smoothstep(0.95, 0.3, d) * vRays;
  mask = hole * 0.95 + rim * 0.5 + rays * 0.35;
  // 贴花不老化，vColor 恒等于 colorA（断口色），暗芯色只能从 colorB 单独取
  color = mix(vColor, vColorAlt, hole);
#elif defined(SHAPE_SPRITE)
  // 序列帧火球。旧的 16 帧 CC0 图只提供形状，仍由台儿庄色板着色；Unity Labs
  // 三套 CC0 flipbook 自带火与烟的颜色，保留原色，并只把亮焰抬进 HDR 泛光。
  float f = min(uSpriteFrames - 1.0, vFrame + floor(vAge01 * uSpriteFrames));
  vec2 cell = vec2(mod(f, uSpriteGrid.x), floor(f / max(uSpriteGrid.x, 1.0)));
  vec2 uv = (p * 0.5 + 0.5 + cell) / uSpriteGrid;
  vec4 tex = texture2D(uSpriteMap, uv);
  mask = tex.a;
#ifdef SPRITE_AUTHORED_COLOR
  float authoredLuma = max(tex.r, max(tex.g, tex.b));
  float flame = smoothstep(0.18, 0.82, authoredLuma);
  color = tex.rgb * mix(0.78, uSpriteEmission, flame);
#else
  color = vColor * tex.rgb;
#endif
#else
  mask = smoothstep(1.0, 0.1, d);
#endif

  if (mask <= 0.004) discard;
  float alpha = vAlpha * mask;

#ifdef LIT
  // 半兰伯特而不是硬兰伯特：烟是多次散射介质，背光面绝不会黑成剪影。
  // 之前用 max(dot,0) 的版本把发烟筒的白灰烟压成了近黑色 —— 那是最典型的
  // "把烟当固体打光"的错。
  float wrapped = dot(normalize(vLitNormal), uSunDirection) * 0.5 + 0.5;
  vec3 lit = uSkyColor + uSunColor * (0.34 + 0.66 * wrapped);
  // 前向散射：视线越接近太阳方向，边缘越透亮（逆光的烟会"发光"）
  float forward = pow(max(dot(vViewDir, uSunDirection), 0.0), 4.0);
  lit += uSunColor * forward * 0.55 * (1.0 - mask * 0.75);
  color *= lit;
#endif
#ifdef LIT_SURFACE
  // 贴面的东西（弹孔、贴地尘环）必须跟它趴着的那个面一起明暗。一张恒定色的贴片
  // 在太阳底下永远比墙暗 —— 考据要的"新弹痕断口比墙面亮 1—2 档"就永远做不出来。
  color *= uSkyColor + uSunColor * max(dot(normalize(vLitNormal), uSunDirection), 0.0);
#endif

  // rtNormalDepth 的 w 是线性视深度；清成 0 的像素代表"这一路没打到东西"（= 天空）。
  // 软粒子与大气透视都要这个值，所以只取一次。
  float sceneDepth = uDepthValid > 0.5
    ? texture2D(uNormalDepth, gl_FragCoord.xy / uResolution).w
    : 0.0;

#ifdef SHAPE_DECAL
  // 贴花只是命中点切平面上的 quad，不是真正投影到承载几何上的网格。过去它靠 12 mm
  // 物理抬升躲 z-fighting：贴到墙沿会探出去，墙被打穿后还会整片留在空中。现在几何
  // 就放回命中面，polygonOffset 只改深度比较；同时拿预通道逐像素确认后面仍是原表面。
  // 小弹孔容差约 1—2 cm，大焦痕按尺寸放宽，允许它顺着轻微起伏的地面铺开。
  if (uDepthValid > 0.5) {
    float surfaceTolerance = max(0.006 + vDecalSize * 0.08, vViewDepth * 0.00008);
    if (sceneDepth <= 0.001 || abs(sceneDepth - vViewDepth) > surfaceTolerance) discard;
  }
#endif

#ifdef AERIAL
  // 补雾，且**只补背景是天空的那一半**（见文件头）。背景有实体时合成 pass 已经
  // 按背景深度上过雾了 —— 那个深度比粒子稍远，雾略微过量，但连续、无缝，
  // 而这里再叠一次就成了双份，烟柱会在屋脊线上被切成深浅两截。
  // 兜底深度图（uDepthValid = 0）时按天空处理：宁可略过量，也不要天上留个黑洞。
  if (vAerial.a > 0.0 && sceneDepth <= 0.001) {
    color = mix(color, vAerial.rgb, vAerial.a);
  }
#endif

  // 软粒子：与背景深度差小的地方淡出。没这一步，烟会像一把刀切进地面。
  // 天空（sceneDepth = 0）必须按"无穷远"处理，否则天空前的粒子会整片消失。
  //
  // uSoftRange = 0 表示这个池**贴着面**存在（弹孔贴花、贴地尘环）：它们与背景的
  // 深度差本来就只有那点法线偏移，一做软化就整体淡到看不见 —— 弹孔一度完全不显形
  // 就是栽在这儿。贴面的池靠 polygonOffset 防 z-fighting，不靠软粒子。
  if (uSoftEnabled > 0.5 && uSoftRange > 0.0 && sceneDepth > 0.001) {
    alpha *= clamp((sceneDepth - vViewDepth) / uSoftRange, 0.0, 1.0);
  }
  // 贴脸淡出：拿不到深度图时这是唯一的保险，也防止一片烟糊满屏幕
  alpha *= clamp((vViewDepth - uNearFade * 0.4) / max(uNearFade, 0.001), 0.0, 1.0);
  if (alpha <= 0.002) discard;

  gl_FragColor = vec4(color, alpha);
}
`;

const VERT_DEBRIS = /* glsl */`
attribute vec2 iSpawnLife;
attribute vec3 iOrigin;
attribute vec3 iVelocity;
attribute vec3 iScale;
attribute vec3 iSpin;        // 角速度向量（轴 = 归一化方向，模 = 速率）
attribute vec3 iColor;
attribute vec4 iParams;      // x 阻尼 y 地面高度 z 回弹系数 w 种子

uniform float uTime;
uniform vec3 uSunDirection;
uniform vec3 uSunColor;
uniform vec3 uSkyColor;

varying vec3 vColor;

void main() {
  float life = iSpawnLife.y;
  float age = uTime - iSpawnLife.x;
  if (life <= 0.0 || age < 0.0 || age > life) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    return;
  }
  float t01 = age / life;
  vec3 acc = vec3(0.0, -9.81, 0.0);
  float k = max(iParams.x, 0.05);
  vec3 world = iOrigin
    + (iVelocity - acc / k) * ((1.0 - exp(-k * age)) / k)
    + acc * (age / k);

  float below = max(0.0, iParams.y - world.y);
  if (below > 0.0) world.y = iParams.y + below * iParams.z * exp(-below * 2.2);

  // 转速渐停：角度取指数收敛式，落地后碎块自己停下来，不用记落地时刻
  float angle = length(iSpin) * (1.0 - exp(-age * 1.6)) / 1.6;
  vec3 axis = normalize(iSpin + vec3(0.0013, 1.0, 0.0007));
  float c = cos(angle), s = sin(angle);
  float shrink = 1.0 - smoothstep(0.80, 1.0, t01);   // 末尾缩没，避免硬弹出
  vec3 v = position * iScale * shrink;
  vec3 rp = v * c + cross(axis, v) * s + axis * dot(axis, v) * (1.0 - c);
  vec3 rn = normal * c + cross(axis, normal) * s + axis * dot(axis, normal) * (1.0 - c);

  // 半兰伯特：碎块很小、翻滚很快，硬兰伯特会让一半的块变成纯黑色方片，
  // 在青砖墙那种亮背景前特别假。
  float wrapped = dot(normalize(rn), uSunDirection) * 0.5 + 0.5;
  vColor = iColor * (uSkyColor + uSunColor * (0.18 + 0.82 * wrapped));

  vec4 viewPos = viewMatrix * modelMatrix * vec4(world + rp, 1.0);
  gl_Position = projectionMatrix * viewPos;
}
`;

const FRAG_DEBRIS = /* glsl */`
varying vec3 vColor;
void main() { gl_FragColor = vec4(vColor, 1.0); }
`;

const VERT_DUST = /* glsl */`
attribute vec3 iBase;    // 盒内归一化基准位置 0..1
attribute vec4 iMote;    // x 半径 y 相位 z 上升速率 w 种子

uniform float uTime;
uniform vec3 uBox;
uniform vec3 uCenter;
uniform float uGlobalFade;

varying vec2 vShape;
varying float vAlpha;
varying float vViewDepth;

void main() {
  vec3 p = iBase * uBox;
  // 极慢的三向漂移。浮尘不能"飞"，只能"悬"。
  p.x += sin(uTime * 0.11 + iMote.y) * 0.55;
  p.y += sin(uTime * 0.071 + iMote.y * 1.7) * 0.32 + uTime * iMote.z;
  p.z += cos(uTime * 0.093 + iMote.y * 2.3) * 0.55;
  // 绕相机所在格子回卷：浮尘永远铺满视野，又完全不需要 CPU 回收/重生
  vec3 origin = uCenter - uBox * 0.5;
  p = mod(p - origin, uBox) + origin;

  vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
  vec3 upv   = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
  vShape = position.xy;
  vec3 world = p + (right * position.x + upv * position.y) * iMote.x;

  vec4 viewPos = viewMatrix * modelMatrix * vec4(world, 1.0);
  vViewDepth = -viewPos.z;
  gl_Position = projectionMatrix * viewPos;
  vAlpha = uGlobalFade;
}
`;

const FRAG_DUST = /* glsl */`
uniform float uIntensity;
uniform vec3 uTint;
uniform float uNearFade;

varying vec2 vShape;
varying float vAlpha;
varying float vViewDepth;

void main() {
  float d = length(vShape);
  float mask = smoothstep(1.0, 0.0, d);
  mask *= mask;
  // 只留一层很淡的环境浮尘。旧版朝太阳时把 gain 从 0.10 抬到 1.80，
  // 原本会 discard 的透明片会突然铺满屏幕，在超宽分辨率产生巨量混合 overdraw。
  // 方向性的太阳光带现在统一交给低分辨率后处理 fallback。
  float gain = 0.12;
  float near = clamp((vViewDepth - uNearFade) / max(uNearFade, 0.001), 0.0, 1.0);
  float far = 1.0 - smoothstep(28.0, 48.0, vViewDepth);
  float alpha = mask * vAlpha * gain * near * far;
  if (alpha <= 0.002) discard;
  gl_FragColor = vec4(uTint * uIntensity, alpha);
}
`;

// ---------------------------------------------------------------------------
// 生成描述符：模块级唯一一份，调用方填字段再交给池。
// 每秒上千次 new {} 的 GC 压力会在爆炸那一帧变成掉帧，所以这里刻意复用。
// ---------------------------------------------------------------------------
const SPAWN = {
  x: 0, y: 0, z: 0,
  vx: 0, vy: 0, vz: 0,
  ax: 0, ay: 0, az: 0,
  life: 1, sizeStart: 0.2, sizeEnd: 0.5,
  drag: 0.8, opacity: 1, fadeIn: 0.08,
  angle: 0, spin: 0, stretch: 0, flicker: 0, groundY: -9999, frame: 0,
  colorA: VFX_PALETTE.dust, colorB: VFX_PALETTE.dustDense,
  seed: 0, nx: 0, ny: 1, nz: 0,
};

// 碎块的生成描述符，同样只有一份（爆炸一次要塞 20 个，别在这儿制造垃圾）
const DEBRIS_SPAWN = {
  x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0,
  sx: 0.03, sy: 0.03, sz: 0.03, rx: 0, ry: 0, rz: 0,
  color: VFX_PALETTE.brick, life: 2, drag: 0.55, groundY: 0, bounce: 0.3, seed: 0,
};

function ResetSpawn() {
  SPAWN.x = 0; SPAWN.y = 0; SPAWN.z = 0;
  SPAWN.vx = 0; SPAWN.vy = 0; SPAWN.vz = 0;
  SPAWN.ax = 0; SPAWN.ay = 0; SPAWN.az = 0;
  SPAWN.life = 1; SPAWN.sizeStart = 0.2; SPAWN.sizeEnd = 0.5;
  SPAWN.drag = 0.8; SPAWN.opacity = 1; SPAWN.fadeIn = 0.08;
  SPAWN.angle = 0; SPAWN.spin = 0; SPAWN.stretch = 0; SPAWN.flicker = 0;
  SPAWN.groundY = -9999; SPAWN.seed = 0; SPAWN.frame = 0;
  SPAWN.colorA = VFX_PALETTE.dust; SPAWN.colorB = VFX_PALETTE.dustDense;
  SPAWN.nx = 0; SPAWN.ny = 1; SPAWN.nz = 0;
  return SPAWN;
}

/** 四角面片（-1..1）。position.xy 直接当形状坐标用，省一套 uv。 */
function MakeQuadGeometry() {
  const geometry = new THREE.InstancedBufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(
    [-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3));
  geometry.setIndex([0, 1, 2, 0, 2, 3]);
  return geometry;
}

// ---------------------------------------------------------------------------
// 通用粒子池
// ---------------------------------------------------------------------------
class ParticlePool {
  /**
   * @param {number} capacity 槽位数
   * @param {object} config shape / orient / blending / lit / bounce / softRange / renderOrder
   * @param {object} shared 共享 uniform（uTime/uNormalDepth/... 全池同一份对象引用）
   */
  constructor(capacity, config, shared) {
    this.capacity = Math.max(4, capacity | 0);
    this.cursor = 0;
    this.config = config;
    this.deathTime = new Float32Array(this.capacity);   // CPU 侧只留死亡时刻，用来算 instanceCount
    this.dirtyMin = Infinity;
    this.dirtyMax = -Infinity;

    const geometry = MakeQuadGeometry();
    const n = this.capacity;
    this.arrays = {
      iSpawnLife: new Float32Array(n * 2),
      iOrigin: new Float32Array(n * 3),
      iVelocity: new Float32Array(n * 3),
      iAccel: new Float32Array(n * 3),
      iSize: new Float32Array(n * 2),
      iSpin: new Float32Array(n * 2),
      iColorA: new Float32Array(n * 3),
      iColorB: new Float32Array(n * 3),
      iParams: new Float32Array(n * 4),
      iExtra: new Float32Array(n * 4),
    };
    if (config.orient === "normal") this.arrays.iNormal = new Float32Array(n * 3);

    this.attributes = {};
    for (const [name, array] of Object.entries(this.arrays)) {
      const itemSize = array.length / n;
      const attribute = new THREE.InstancedBufferAttribute(array, itemSize);
      attribute.setUsage(THREE.DynamicDrawUsage);
      geometry.setAttribute(name, attribute);
      this.attributes[name] = attribute;
    }
    geometry.instanceCount = 0;
    geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);   // 关掉视锥剔除，粒子在 shader 里飞
    this.geometry = geometry;

    const defines = {};
    defines[`SHAPE_${config.shape.toUpperCase()}`] = "";
    if (config.orient === "normal") defines.ORIENT_NORMAL = "";
    else if (config.orient === "stretch") defines.ORIENT_STRETCH = "";
    if (config.lit) defines.LIT = "";
    if (config.litSurface) defines.LIT_SURFACE = "";
    if (config.bounce) defines.GROUND_BOUNCE = "";
    if (config.aerial) defines.AERIAL = "";
    if (config.sprite?.authoredColor) defines.SPRITE_AUTHORED_COLOR = "";

    const preserveTargetAlpha = !!config.preserveTargetAlpha;
    this.material = new THREE.ShaderMaterial({
      defines,
      uniforms: Object.assign({}, shared, {
        uSoftRange: { value: config.softRange ?? 0.6 },
        uFadeOutStart: { value: config.fadeOutStart ?? 0.45 },
        uSpriteMap: { value: config.sprite ? config.sprite.texture : shared.uSpriteMap.value },
        uSpriteGrid: {
          value: config.sprite
            ? new THREE.Vector2(config.sprite.grid[0], config.sprite.grid[1])
            : shared.uSpriteGrid.value,
        },
        uSpriteFrames: { value: config.sprite ? config.sprite.frames : shared.uSpriteFrames.value },
        uSpriteEmission: { value: config.sprite?.emission ?? 1 },
      }),
      vertexShader: `${GLSL_VERT_HELPERS}\n${VERT_PARTICLE}`,
      fragmentShader: `${GLSL_NOISE}\n${FRAG_PARTICLE}`,
      transparent: true,
      depthTest: true,
      depthWrite: false,                 // 半透明粒子写深度 = 互相切出硬边
      // 默认 NormalBlending 会把离屏 HDR 靶的 alpha 也按 srcAlpha 混低：贴花越深，
      // 承载物在后续链路里越像“透明了”。贴花只改 RGB，alpha 必须原样保留。
      blending: preserveTargetAlpha ? THREE.CustomBlending : config.blending,
      blendSrc: preserveTargetAlpha ? THREE.SrcAlphaFactor : undefined,
      blendDst: preserveTargetAlpha ? THREE.OneMinusSrcAlphaFactor : undefined,
      blendEquation: preserveTargetAlpha ? THREE.AddEquation : undefined,
      blendSrcAlpha: preserveTargetAlpha ? THREE.ZeroFactor : undefined,
      blendDstAlpha: preserveTargetAlpha ? THREE.OneFactor : undefined,
      blendEquationAlpha: preserveTargetAlpha ? THREE.AddEquation : undefined,
      side: THREE.DoubleSide,
      polygonOffset: !!config.polygonOffset,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -4,
    });
    this.material.userData.preserveTargetAlpha = preserveTargetAlpha;
    // 粒子是加性/半透明的 billboard：进了深度法线预通道就会在 SSAO 里
    // 挖出一片乱码，还会把体积光的天空判据搞坏。
    MarkNoPrepass(this.material);

    this.mesh = new THREE.Mesh(geometry, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = config.renderOrder ?? 0;
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = false;
    this.mesh.matrixAutoUpdate = false;
  }

  /** 环形分配：满了就覆盖最老的那个（弹孔的先进先出也靠这条）。 */
  Spawn(s, now) {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.capacity;
    const a = this.arrays;
    a.iSpawnLife[i * 2] = now;
    a.iSpawnLife[i * 2 + 1] = s.life;
    a.iOrigin[i * 3] = s.x; a.iOrigin[i * 3 + 1] = s.y; a.iOrigin[i * 3 + 2] = s.z;
    a.iVelocity[i * 3] = s.vx; a.iVelocity[i * 3 + 1] = s.vy; a.iVelocity[i * 3 + 2] = s.vz;
    a.iAccel[i * 3] = s.ax; a.iAccel[i * 3 + 1] = s.ay; a.iAccel[i * 3 + 2] = s.az;
    a.iSize[i * 2] = s.sizeStart; a.iSize[i * 2 + 1] = s.sizeEnd;
    a.iSpin[i * 2] = s.angle; a.iSpin[i * 2 + 1] = s.spin;
    a.iColorA[i * 3] = s.colorA[0]; a.iColorA[i * 3 + 1] = s.colorA[1]; a.iColorA[i * 3 + 2] = s.colorA[2];
    a.iColorB[i * 3] = s.colorB[0]; a.iColorB[i * 3 + 1] = s.colorB[1]; a.iColorB[i * 3 + 2] = s.colorB[2];
    a.iParams[i * 4] = s.opacity; a.iParams[i * 4 + 1] = s.fadeIn;
    a.iParams[i * 4 + 2] = s.drag; a.iParams[i * 4 + 3] = s.seed;
    a.iExtra[i * 4] = s.stretch; a.iExtra[i * 4 + 1] = s.flicker;
    a.iExtra[i * 4 + 2] = s.groundY; a.iExtra[i * 4 + 3] = s.frame || 0;
    if (a.iNormal) {
      a.iNormal[i * 3] = s.nx; a.iNormal[i * 3 + 1] = s.ny; a.iNormal[i * 3 + 2] = s.nz;
    }
    this.deathTime[i] = now + s.life;
    if (i < this.dirtyMin) this.dirtyMin = i;
    if (i > this.dirtyMax) this.dirtyMax = i;
    return i;
  }

  /**
   * 每帧一次：把脏区间提交，并把 instanceCount 收到"最高的活槽 + 1"。
   * 只提交区间而不是整块，是因为整块上传（约 116 B × capacity）在连发时
   * 每帧都要走一遍 PCIe，白白吃掉几个百分点的帧时间。
   */
  Flush(now) {
    if (this.dirtyMax >= this.dirtyMin) {
      const lo = this.dirtyMin, hi = this.dirtyMax;
      for (const attribute of Object.values(this.attributes)) {
        const itemSize = attribute.itemSize;
        attribute.addUpdateRange(lo * itemSize, (hi - lo + 1) * itemSize);
        attribute.needsUpdate = true;
      }
      this.dirtyMin = Infinity;
      this.dirtyMax = -Infinity;
    }
    let last = -1;
    const death = this.deathTime;
    for (let i = this.capacity - 1; i >= 0; i -= 1) {
      if (death[i] > now) { last = i; break; }
    }
    this.geometry.instanceCount = last + 1;
  }

  Clear() {
    this.deathTime.fill(0);
    this.arrays.iSpawnLife.fill(0);
    this.dirtyMin = 0;
    this.dirtyMax = this.capacity - 1;
    this.geometry.instanceCount = 0;
  }

  Dispose() {
    this.geometry.dispose();
    this.material.dispose();
  }
}

// ---------------------------------------------------------------------------
// 碎块池：真几何小方块，会翻滚会弹跳。砖块/木屑/弹壳共用。
// ---------------------------------------------------------------------------
class DebrisPool {
  constructor(capacity, shared) {
    this.capacity = Math.max(4, capacity | 0);
    this.cursor = 0;
    this.deathTime = new Float32Array(this.capacity);
    this.dirtyMin = Infinity;
    this.dirtyMax = -Infinity;

    const box = new THREE.BoxGeometry(1, 1, 1);
    const geometry = new THREE.InstancedBufferGeometry();
    geometry.setAttribute("position", box.getAttribute("position"));
    geometry.setAttribute("normal", box.getAttribute("normal"));
    geometry.setIndex(box.getIndex());
    // 只是借它的 position/normal/index，**不能 dispose**：dispose 会把这几个
    // attribute 从渲染器的缓冲表里摘掉，而它们现在归这张实例化几何所有。
    // 源几何本身没上过 GPU，交给 GC 就行。

    const n = this.capacity;
    this.arrays = {
      iSpawnLife: new Float32Array(n * 2),
      iOrigin: new Float32Array(n * 3),
      iVelocity: new Float32Array(n * 3),
      iScale: new Float32Array(n * 3),
      iSpin: new Float32Array(n * 3),
      iColor: new Float32Array(n * 3),
      iParams: new Float32Array(n * 4),
    };
    this.attributes = {};
    for (const [name, array] of Object.entries(this.arrays)) {
      const attribute = new THREE.InstancedBufferAttribute(array, array.length / n);
      attribute.setUsage(THREE.DynamicDrawUsage);
      geometry.setAttribute(name, attribute);
      this.attributes[name] = attribute;
    }
    geometry.instanceCount = 0;
    geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
    this.geometry = geometry;

    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uTime: shared.uTime, uSunDirection: shared.uSunDirection,
        uSunColor: shared.uSunColor, uSkyColor: shared.uSkyColor,
      },
      vertexShader: VERT_DEBRIS,
      fragmentShader: FRAG_DEBRIS,
      transparent: false,
      depthWrite: true,
      side: THREE.FrontSide,
    });
    // 粒子是加性/半透明的 billboard：进了深度法线预通道就会在 SSAO 里
    // 挖出一片乱码，还会把体积光的天空判据搞坏。
    MarkNoPrepass(this.material);
    this.mesh = new THREE.Mesh(geometry, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = false;
    this.mesh.matrixAutoUpdate = false;
  }

  Spawn(d, now) {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.capacity;
    const a = this.arrays;
    a.iSpawnLife[i * 2] = now; a.iSpawnLife[i * 2 + 1] = d.life;
    a.iOrigin[i * 3] = d.x; a.iOrigin[i * 3 + 1] = d.y; a.iOrigin[i * 3 + 2] = d.z;
    a.iVelocity[i * 3] = d.vx; a.iVelocity[i * 3 + 1] = d.vy; a.iVelocity[i * 3 + 2] = d.vz;
    a.iScale[i * 3] = d.sx; a.iScale[i * 3 + 1] = d.sy; a.iScale[i * 3 + 2] = d.sz;
    a.iSpin[i * 3] = d.rx; a.iSpin[i * 3 + 1] = d.ry; a.iSpin[i * 3 + 2] = d.rz;
    a.iColor[i * 3] = d.color[0]; a.iColor[i * 3 + 1] = d.color[1]; a.iColor[i * 3 + 2] = d.color[2];
    a.iParams[i * 4] = d.drag; a.iParams[i * 4 + 1] = d.groundY;
    a.iParams[i * 4 + 2] = d.bounce; a.iParams[i * 4 + 3] = d.seed;
    this.deathTime[i] = now + d.life;
    if (i < this.dirtyMin) this.dirtyMin = i;
    if (i > this.dirtyMax) this.dirtyMax = i;
    return i;
  }

  Flush(now) {
    if (this.dirtyMax >= this.dirtyMin) {
      const lo = this.dirtyMin, hi = this.dirtyMax;
      for (const attribute of Object.values(this.attributes)) {
        attribute.addUpdateRange(lo * attribute.itemSize, (hi - lo + 1) * attribute.itemSize);
        attribute.needsUpdate = true;
      }
      this.dirtyMin = Infinity;
      this.dirtyMax = -Infinity;
    }
    let last = -1;
    for (let i = this.capacity - 1; i >= 0; i -= 1) {
      if (this.deathTime[i] > now) { last = i; break; }
    }
    this.geometry.instanceCount = last + 1;
  }

  Clear() {
    this.deathTime.fill(0);
    this.arrays.iSpawnLife.fill(0);
    this.dirtyMin = 0; this.dirtyMax = this.capacity - 1;
    this.geometry.instanceCount = 0;
  }

  Dispose() { this.geometry.dispose(); this.material.dispose(); }
}

// ---------------------------------------------------------------------------
// 浮尘场：整场战斗都在一层灰里。
// 位置是时间的周期函数 + 绕相机回卷，永远不需要生成/回收，CPU 侧每帧零成本。
// ---------------------------------------------------------------------------
class DustField {
  constructor(count, shared, seed) {
    this.count = Math.max(1, count | 0);
    const geometry = MakeQuadGeometry();
    const base = new Float32Array(this.count * 3);
    const mote = new Float32Array(this.count * 4);
    const random = Mulberry32(seed);
    for (let i = 0; i < this.count; i += 1) {
      base[i * 3] = random();
      base[i * 3 + 1] = random();
      base[i * 3 + 2] = random();
      mote[i * 4] = 0.008 + random() * 0.026;          // 半径：亚厘米级，别做成雪花
      mote[i * 4 + 1] = random() * 6.2831853;
      mote[i * 4 + 2] = 0.012 + random() * 0.045;      // 上升速率：极慢
      mote[i * 4 + 3] = random();
    }
    geometry.setAttribute("iBase", new THREE.InstancedBufferAttribute(base, 3));
    geometry.setAttribute("iMote", new THREE.InstancedBufferAttribute(mote, 4));
    geometry.instanceCount = this.count;
    geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
    this.geometry = geometry;

    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uTime: shared.uTime,
        uGlobalFade: shared.uGlobalFade,
        uNearFade: shared.uNearFade,
        uBox: { value: new THREE.Vector3(30, 9, 30) },
        uCenter: { value: new THREE.Vector3() },
        uIntensity: { value: 0.55 },
        uTint: { value: new THREE.Vector3(...VFX_PALETTE.dustPale) },
      },
      vertexShader: VERT_DUST,
      fragmentShader: FRAG_DUST,
      transparent: true,
      depthTest: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    // 粒子是加性/半透明的 billboard：进了深度法线预通道就会在 SSAO 里
    // 挖出一片乱码，还会把体积光的天空判据搞坏。
    MarkNoPrepass(this.material);
    this.mesh = new THREE.Mesh(geometry, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 12;
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = false;
    this.mesh.matrixAutoUpdate = false;
  }

  Dispose() { this.geometry.dispose(); this.material.dispose(); }
}

// ---------------------------------------------------------------------------
// 表面反馈表。每种材质"打上去应该是什么样"都写在这儿，Impact 只做分发。
// ---------------------------------------------------------------------------
const SURFACE_PROFILES = {
  brick: {
    puffs: 8, puffLife: [0.55, 1.1], puffSize: [0.05, 0.42], puffSpeed: 1.9,
    colorA: VFX_PALETTE.dustPale, colorB: VFX_PALETTE.dustDense, opacity: 0.5,
    chunks: 4, chunkSize: [0.011, 0.030], chunkSpeed: 3.4, chunkColor: VFX_PALETTE.brick,
    sparks: 0, decal: true, decalSize: 0.11,
    decalRim: VFX_PALETTE.brickCore, decalHole: VFX_PALETTE.brickHole,
  },
  dirt: {
    puffs: 10, puffLife: [0.6, 1.3], puffSize: [0.06, 0.55], puffSpeed: 2.2,
    colorA: VFX_PALETTE.soilAir, colorB: VFX_PALETTE.soil, opacity: 0.55,
    chunks: 4, chunkSize: [0.02, 0.05], chunkSpeed: 2.8, chunkColor: VFX_PALETTE.soil,
    sparks: 0, decal: true, decalSize: 0.16,
    decalRim: VFX_PALETTE.soil, decalHole: VFX_PALETTE.brickHole,
  },
  wood: {
    puffs: 4, puffLife: [0.35, 0.7], puffSize: [0.04, 0.24], puffSpeed: 1.4,
    colorA: VFX_PALETTE.dustPale, colorB: VFX_PALETTE.wood, opacity: 0.35,
    chunks: 6, chunkSize: [0.012, 0.06], chunkSpeed: 3.2, chunkColor: VFX_PALETTE.wood,
    sparks: 0, decal: true, decalSize: 0.09,
    decalRim: VFX_PALETTE.wood, decalHole: VFX_PALETTE.woodBurnt, splinter: true,
  },
  metal: {
    puffs: 3, puffLife: [0.25, 0.5], puffSize: [0.03, 0.18], puffSpeed: 1.2,
    colorA: VFX_PALETTE.powderThin, colorB: VFX_PALETTE.powderSmoke, opacity: 0.28,
    chunks: 0, chunkSize: [0.01, 0.02], chunkSpeed: 2.0, chunkColor: VFX_PALETTE.steel,
    sparks: 12, decal: true, decalSize: 0.07,
    decalRim: VFX_PALETTE.steel, decalHole: VFX_PALETTE.brickHole,
  },
  sandbag: {
    puffs: 6, puffLife: [0.5, 0.95], puffSize: [0.05, 0.3], puffSpeed: 1.3,
    colorA: VFX_PALETTE.sand, colorB: VFX_PALETTE.burlap, opacity: 0.5,
    chunks: 3, chunkSize: [0.01, 0.028], chunkSpeed: 1.6, chunkColor: VFX_PALETTE.burlap,
    sparks: 0, decal: true, decalSize: 0.1,
    decalRim: VFX_PALETTE.sand, decalHole: VFX_PALETTE.brickHole, sandStream: true,
  },
  flesh: {
    // 克制。考据明确写了：战损靠弹孔密度，不靠血浆。
    puffs: 0, puffLife: [0.3, 0.6], puffSize: [0.03, 0.16], puffSpeed: 1.0,
    colorA: VFX_PALETTE.blood, colorB: VFX_PALETTE.bloodDark, opacity: 0.4,
    chunks: 0, chunkSize: [0, 0], chunkSpeed: 0, chunkColor: VFX_PALETTE.blood,
    sparks: 0, decal: false, decalSize: 0, blood: 0.5,
  },
  water: {
    puffs: 5, puffLife: [0.35, 0.7], puffSize: [0.04, 0.26], puffSpeed: 2.6,
    colorA: VFX_PALETTE.dustPale, colorB: VFX_PALETTE.water, opacity: 0.42,
    chunks: 5, chunkSize: [0.01, 0.02], chunkSpeed: 3.0, chunkColor: VFX_PALETTE.water,
    sparks: 0, decal: false, decalSize: 0, waterRing: true,
  },
};

/**
 * 枪口焰形制。
 *
 * smoke 是出膛瞬间被高压气体推走的快烟；wisps 是火光灭后才读出来的慢余烟。
 * 过去只有前者，而且所有调用方都漏传 kind，结果每把枪都是同一团两片烟。
 * 两层拆开以后，栓动步枪是一声一缕，机枪则靠连续的小缕叠成一条烟带。
 */
const MUZZLE_KINDS = {
  rifle: { size: 0.29, life: 0.048, smoke: 2, wisps: 2, spikes: 2 },
  boltRifle: { size: 0.31, life: 0.052, smoke: 2, wisps: 3, spikes: 2 },
  // 自动武器单发焰略短；连续射击靠频率累积亮度和烟，不把每发都做成火球。
  lmg: { size: 0.28, life: 0.042, smoke: 2, wisps: 1, spikes: 2 },
  hmg: { size: 0.40, life: 0.050, smoke: 3, wisps: 2, spikes: 3 },
  pistol: { size: 0.19, life: 0.040, smoke: 1, wisps: 1, spikes: 2 },
  launcher: { size: 0.58, life: 0.075, smoke: 5, wisps: 4, spikes: 3 },
};

const EXPLOSION_KINDS = {
  grenade: { flash: 1.0, fire: 6, smoke: 9, chunks: 12, sparks: 4, sooty: 0.15, column: 1.0 },
  launcher: { flash: 0.85, fire: 4, smoke: 7, chunks: 10, sparks: 3, sooty: 0.1, column: 0.8 },
  shell: { flash: 1.4, fire: 9, smoke: 14, chunks: 20, sparks: 8, sooty: 0.35, column: 1.5 },
  tank: { flash: 1.7, fire: 14, smoke: 18, chunks: 22, sparks: 16, sooty: 0.8, column: 2.2 },
};

// 四套爆炸序列帧共用同一套粒子 API，但不能共用一个材质：一次炮击的烟尾还没散，
// 下一颗手榴弹若把 sampler 换掉，屏幕上的旧实例会在半空中瞬间变脸。每套各占原
// sprite 总预算的四分之一，显存/实例总量不增加，只多三个很便宜的 draw call。
const EXPLOSION_SPRITE_VARIANTS = Object.freeze({
  legacy: Object.freeze({
    pool: "spriteLegacy", path: "./Texture/Texture_ExplosionFire_01.png",
    grid: [4, 4], frames: 16, authoredColor: false, blending: "additive",
    emission: 1, aerial: false, fadeOutStart: 0.82,
    life: [0.40, 0.52], mainSize: [0.55, 1.45], secondarySize: [0.30, 0.85],
  }),
  compact: Object.freeze({
    pool: "spriteCompact", path: "./Texture/Texture_ExplosionUnityCompact_01.webp",
    grid: [5, 5], frames: 25, authoredColor: true, blending: "normal",
    emission: 2.6, aerial: true, fadeOutStart: 0.88,
    life: [0.72, 0.90], mainSize: [0.50, 1.25], secondarySize: [0.28, 0.75],
  }),
  fireball: Object.freeze({
    pool: "spriteFireball", path: "./Texture/Texture_ExplosionUnityFireBall_02.webp",
    grid: [8, 8], frames: 64, authoredColor: true, blending: "additive",
    emission: 3.4, aerial: false, fadeOutStart: 0.88,
    life: [0.55, 0.72], mainSize: [0.45, 1.22], secondarySize: [0.25, 0.70],
  }),
  heavy: Object.freeze({
    pool: "spriteHeavy", path: "./Texture/Texture_ExplosionUnityHeavy_02.webp",
    grid: [5, 5], frames: 25, authoredColor: true, blending: "normal",
    emission: 3.0, aerial: true, fadeOutStart: 0.92,
    life: [1.00, 1.25], mainSize: [0.62, 1.55], secondarySize: [0.35, 0.90],
  }),
});

/**
 * 按实际冲击量挑动画，而不是把手榴弹和师团炮放进同一个纯随机袋。
 * 每档保留两种邻近形制：连续爆炸不会克隆粘贴，但也不会小炮炸出重炮蘑菇云。
 */
export function SelectExplosionSpriteVariant(effectivePower, roll = 0.5) {
  const power = Math.max(0, Number(effectivePower) || 0);
  const r = Math.min(0.999999, Math.max(0, Number(roll) || 0));
  if (power < 5.2) return r < 0.35 ? "legacy" : "compact";
  if (power < 10) return r < 0.65 ? "compact" : "fireball";
  return r < 0.18 ? "fireball" : "heavy";
}

const CASING_SIZES = {
  "7.92": [0.0079, 0.057], "7.7": [0.0077, 0.058],
  "6.5": [0.0065, 0.050], "7.63": [0.0076, 0.025],
};

const TMP_A = new THREE.Vector3();
const TMP_B = new THREE.Vector3();
const TMP_C = new THREE.Vector3();

// ---------------------------------------------------------------------------
export class VfxSystem {
  constructor(scene, library, { quality = "high", maxParticles = 4000 } = {}) {
    this.scene = scene;
    // 材质库这里用不上：粒子全部走自定义 ShaderMaterial（PBR 材质进不了加性混合，
    // 也吃不起 SSAO 注入）。留着引用是给以后"贴图版弹孔贴花"用的。
    this.library = library;
    this.quality = QUALITY_PRESETS[quality] ? quality : "high";
    this.preset = QUALITY_PRESETS[this.quality];
    this.budget = Math.max(200, Math.round(maxParticles * this.preset.budget));
    this.spawnScale = this.preset.spawn;

    this.time = 0;
    /** 上一帧的机位。Blood 按它算屏幕张角做距离补偿（见 Blood 的抬头）。 */
    this.eye = new THREE.Vector3();
    this.random = Mulberry32(HashString("Taierzhuang.Vfx.1938"));
    this.wind = new THREE.Vector3(0.35, 0, -0.15);     // 鲁南春季多西南风，考据里写死的
    this.groundLevel = 0;                              // 碎块/弹壳落到哪一层，见 SetGroundLevel
    this.smokeSources = new Map();
    this.nextSourceId = 1;
    // 运行时取证：冒烟测试确认调用方传了真实枪种、快烟与余烟两层都生成。
    this.lastMuzzleProfile = null;

    this.root = new THREE.Group();
    this.root.name = "VfxRoot";
    this.root.frustumCulled = false;
    this.root.matrixAutoUpdate = false;
    scene.add(this.root);

    // 1x1 兜底深度图：WebGL2 下未绑定的 sampler 是未定义行为，哪怕分支里不采样也得挂一张
    this.fallbackDepth = new THREE.DataTexture(
      new Float32Array([0, 0, 0, 0]), 1, 1, THREE.RGBAFormat, THREE.FloatType);
    this.fallbackDepth.needsUpdate = true;

    // 序列帧贴图的 1×1 白图占位：贴图异步加载到位前，火球池采样这张白图，
    // mask 恒为 1，形状退化成普通辉光圆片 —— 与旧版程序化火球观感一致，绝不黑屏。
    this.spritePlaceholder = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
    this.spritePlaceholder.needsUpdate = true;
    // Unity Labs 两张爆炸图走 NormalBlending；白图兜底会变成方形闪光，所以它们在
    // 贴图未到位时用全透明占位，外层程序化火焰/尘环/烟柱仍照常生成。
    this.spriteTransparentPlaceholder = new THREE.DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1);
    this.spriteTransparentPlaceholder.needsUpdate = true;

    this.shared = {
      uTime: { value: 0 },
      uGlobalFade: { value: 1 },
      uNormalDepth: { value: this.fallbackDepth },
      uResolution: { value: new THREE.Vector2(1600, 900) },
      uSoftEnabled: { value: 0 },
      uNearFade: { value: 0.45 },
      // 序列帧与淡出曲线：除火球池外全部用默认值（淡出起点 0.45、单帧白图）。
      uFadeOutStart: { value: 0.45 },
      uSpriteMap: { value: this.spritePlaceholder },
      uSpriteGrid: { value: new THREE.Vector2(1, 1) },
      uSpriteFrames: { value: 1 },
      uSunDirection: { value: new THREE.Vector3(0.32, 0.62, -0.72).normalize() },
      // 默认值对齐 LightRig 的 smokyDay：平行光 5.4，漫反射出射亮度约 I/π ≈ 1.7。
      // 这里给小了的话，碎块和烟会比同一场景里的 PBR 物体暗一大截，一眼假。
      uSunColor: { value: new THREE.Vector3(1.72, 1.58, 1.34) },
      uSkyColor: { value: new THREE.Vector3(0.14, 0.17, 0.22) },
      // 大气透视。默认值抄 SKY_PRESETS.smokyDay.fog —— 调用方不接 SetFog 时
      // 也得有一档能用的雾，不然远处的烟又变回天上的黑洞。
      uDepthValid: { value: 0 },
      uFogDensity: { value: 0.0145 },
      uFogFalloff: { value: 15 },
      uFogBase: { value: 0 },
      uFogMax: { value: 0.88 },
      uFogColorSky: { value: new THREE.Vector3(0.72, 0.70, 0.66) },
      uFogColorGround: { value: new THREE.Vector3(0.38, 0.39, 0.42) },
      uFogSunGain: { value: 0.24 },
      uSunColorFog: { value: new THREE.Vector3(1, 0.92, 0.78) },
    };

    const cap = (share, floor) => Math.max(floor, Math.round(this.budget * share));
    const spriteCapacity = cap(POOL_SHARE.sprite / Object.keys(EXPLOSION_SPRITE_VARIANTS).length, 8);
    const makeSpritePool = (variant) => new ParticlePool(spriteCapacity, {
      shape: "sprite", orient: "billboard",
      blending: variant.blending === "normal" ? THREE.NormalBlending : THREE.AdditiveBlending,
      aerial: variant.aerial, softRange: 0.25, renderOrder: 8,
      fadeOutStart: variant.fadeOutStart,
      sprite: {
        texture: variant.pool === "spriteLegacy"
          ? this.spritePlaceholder : this.spriteTransparentPlaceholder,
        grid: variant.grid, frames: variant.frames,
        authoredColor: variant.authoredColor, emission: variant.emission,
      },
    }, this.shared);
    this.pools = {
      // 烟：alpha 混合 + 朗伯着色 + 软粒子，是"体积感"的全部来源。
      // aerial 只给它一个池：加性的火/曳光/枪口焰是 HDR 自发光，大气透视对它们
      // 是**消光**（乘 1−fog）而不是混向雾色，压下去两百米外的火就没了；
      // 它们又都是零点几秒的短命货，天上留不住洞。要补的话另开一轮，别混在这儿。
      smoke: new ParticlePool(cap(POOL_SHARE.smoke, 96), {
        shape: "puff", orient: "billboard", blending: THREE.NormalBlending,
        lit: true, aerial: true, softRange: 0.45, renderOrder: 6,
      }, this.shared),
      // 火/闪光：加性，HDR 3—22，交给 Script_Post 的泛光
      fire: new ParticlePool(cap(POOL_SHARE.fire, 64), {
        shape: "puff", orient: "billboard", blending: THREE.AdditiveBlending,
        softRange: 0.25, renderOrder: 8,
      }, this.shared),
      // 四套序列帧按当量随机：旧 16 帧、紧凑爆炸、持续火球、重炮爆炸。容量四等分，
      // 总预算仍是 POOL_SHARE.sprite；NormalBlending 两池能留下黑烟，另两池走 HDR 加性。
      spriteLegacy: makeSpritePool(EXPLOSION_SPRITE_VARIANTS.legacy),
      spriteCompact: makeSpritePool(EXPLOSION_SPRITE_VARIANTS.compact),
      spriteFireball: makeSpritePool(EXPLOSION_SPRITE_VARIANTS.fireball),
      spriteHeavy: makeSpritePool(EXPLOSION_SPRITE_VARIANTS.heavy),
      // 曳光与火星共用一个"沿速度拉长"的池
      streak: new ParticlePool(cap(POOL_SHARE.streak, 64), {
        shape: "streak", orient: "stretch", blending: THREE.AdditiveBlending,
        bounce: true, softRange: 0.12, renderOrder: 9,
      }, this.shared),
      // 枪口焰：星芒
      star: new ParticlePool(cap(POOL_SHARE.star, 24), {
        shape: "star", orient: "billboard", blending: THREE.AdditiveBlending,
        softRange: 0.2, renderOrder: 10,
      }, this.shared),
      // 贴面的环：爆炸尘环、落点预警、水花圈
      ring: new ParticlePool(cap(POOL_SHARE.ring, 16), {
        shape: "ring", orient: "normal", blending: THREE.NormalBlending,
        litSurface: true, softRange: 0, renderOrder: 5,
      }, this.shared),
      // 弹孔贴花：几何留在命中面，polygonOffset 只动深度；预通道逐像素裁掉悬空部分。
      decal: new ParticlePool(Math.min(this.preset.decals, cap(POOL_SHARE.decal, 32)), {
        shape: "decal", orient: "normal", blending: THREE.NormalBlending,
        litSurface: true, softRange: 0, renderOrder: 3, polygonOffset: true,
        preserveTargetAlpha: true,
      }, this.shared),
    };
    this.debris = new DebrisPool(cap(POOL_SHARE.debris, 48), this.shared);

    for (const pool of Object.values(this.pools)) this.root.add(pool.mesh);
    this.root.add(this.debris.mesh);

    this.dust = null;
    this.dustBox = null;

    // 四套 CC0 爆炸贴图并行加载，来源与许可见 _import/Data_SourceLicenses.md。
    // 单张失败只让对应层透明降级，不会拖死页面，程序化火焰/尘环/碎块仍完整存在。
    this.explosionSpriteTextures = new Map();
    this.loadedExplosionSprites = new Set();
    this.lastExplosionSprite = null;
    const textureLoader = new THREE.TextureLoader();
    for (const [key, variant] of Object.entries(EXPLOSION_SPRITE_VARIANTS)) {
      textureLoader.load(new URL(variant.path, import.meta.url).href, (texture) => {
        texture.colorSpace = THREE.SRGBColorSpace;
        // 所有源图都按左上→右下排帧；沿用旧爆炸图验证过的 UV 方向。
        texture.flipY = false;
        texture.wrapS = THREE.ClampToEdgeWrapping;
        texture.wrapT = THREE.ClampToEdgeWrapping;
        texture.needsUpdate = true;
        this.explosionSpriteTextures.set(key, texture);
        this.loadedExplosionSprites.add(key);
        const pool = this.pools?.[variant.pool];
        if (pool) pool.material.uniforms.uSpriteMap.value = texture;
      }, undefined, () => {});
    }

    // 深度法线预通道里必须隐身（见文件头第 2 条）。挂钩子而不是改 Script_Post。
    this.previousSceneHook = scene.onBeforeRender;
    this.sceneHook = (renderer, hookScene, camera, target) => {
      if (typeof this.previousSceneHook === "function") {
        this.previousSceneHook.call(hookScene, renderer, hookScene, camera, target);
      }
      this.root.visible = !hookScene.overrideMaterial;
    };
    scene.onBeforeRender = this.sceneHook;
  }

  // --- 外部接线 -------------------------------------------------------------

  /**
   * 交出 Script_Post 的 rtNormalDepth（RGBA16F，w = 线性视深度），软粒子才成立。
   * 分辨率能从 RenderTarget 纹理的 image 上直接读，所以不用调用方再报一遍。
   */
  SetDepthSource(texture, width = 0, height = 0) {
    if (!texture) {
      this.shared.uNormalDepth.value = this.fallbackDepth;
      this.shared.uSoftEnabled.value = 0;
      this.shared.uDepthValid.value = 0;
      return;
    }
    this.shared.uNormalDepth.value = texture;
    this.shared.uSoftEnabled.value = this.preset.soft ? 1 : 0;
    // 软粒子可以按画质档关掉，但"背景是不是天空"这个判据不能跟着关 ——
    // 大气透视要靠它区分"合成 pass 已经上过雾"和"这一像素合成 pass 根本不管"。
    this.shared.uDepthValid.value = 1;
    const image = texture.image;
    const w = width || (image && image.width) || this.shared.uResolution.value.x;
    const h = height || (image && image.height) || this.shared.uResolution.value.y;
    this.shared.uResolution.value.set(w, h);
  }

  /** 编辑器/冒烟测试可传固定 roll 预览分档；实战省略时仍走本系统的确定性随机流。 */
  SelectExplosionSpriteVariant(effectivePower, roll = this.random()) {
    return SelectExplosionSpriteVariant(effectivePower, roll);
  }

  /**
   * 太阳方向（指向太阳）与光色 —— 烟的明暗面与碎块受光都靠它。
   * 粒子不走 PBR，所以强度得手动对齐灯光钻机：漫反射出射亮度 ≈ lightIntensity / π，
   * 环境项约等于 hemi 的天空色乘一个小系数。给 SKY_PRESETS 的话就是
   *   SetSun(sky.sunDirection, preset.lightColor, preset.hemiSky,
   *          { sunIntensity: preset.lightIntensity / Math.PI });
   * @param {*} sunColor Color / hex / 字符串都行
   */
  SetSun(direction, sunColor = null, skyColor = null,
    { sunIntensity = 1.7, skyIntensity = 0.38 } = {}) {
    if (direction) this.shared.uSunDirection.value.copy(direction).normalize();
    if (sunColor !== null && sunColor !== undefined) {
      SCRATCH_COLOR.set(sunColor);
      this.shared.uSunColor.value.set(
        SCRATCH_COLOR.r * sunIntensity, SCRATCH_COLOR.g * sunIntensity, SCRATCH_COLOR.b * sunIntensity);
    }
    if (skyColor !== null && skyColor !== undefined) {
      SCRATCH_COLOR.set(skyColor);
      this.shared.uSkyColor.value.set(
        SCRATCH_COLOR.r * skyIntensity, SCRATCH_COLOR.g * skyIntensity, SCRATCH_COLOR.b * skyIntensity);
    }
  }

  /**
   * 大气透视。参数就是 SKY_PRESETS[...].fog 那一坨，原样传进来即可：
   *   SetFog(preset.fog, preset.sunColor);
   * 必须与喂给 post.Render 的是同一份 —— 两边对不齐，烟柱跨过屋脊线会裂成两截。
   */
  SetFog(fog, sunColor = null) {
    const U = this.shared;
    if (fog) {
      U.uFogDensity.value = fog.density ?? 0.0145;
      U.uFogFalloff.value = fog.falloff ?? 15;
      U.uFogBase.value = fog.base ?? 0;
      U.uFogMax.value = fog.max ?? 0.88;
      if (fog.sky) U.uFogColorSky.value.fromArray(fog.sky);
      if (fog.ground) U.uFogColorGround.value.fromArray(fog.ground);
      U.uFogSunGain.value = fog.sunGain ?? 0.24;
    } else {
      U.uFogDensity.value = 0;
    }
    if (sunColor) U.uSunColorFog.value.fromArray(sunColor);
  }

  SetWind(vector) { this.wind.copy(vector); }

  /**
   * 当前脚下的地面高度（米）。碎砖、木屑、弹壳落到这一层就停。
   * 关卡里上了屋顶/城墙就把它改掉，否则碎块会穿过屋顶掉到街上。
   */
  SetGroundLevel(y) { this.groundLevel = y; }

  /** 全局淡出（过场/死亡黑屏时把特效一起收掉）。 */
  SetGlobalFade(value) { this.shared.uGlobalFade.value = Math.max(0, Math.min(1, value)); }

  // --- 主循环 ---------------------------------------------------------------

  Update(dt, camera, elapsed) {
    const step = Number.isFinite(dt) ? Math.min(Math.max(dt, 0), 0.1) : 0;
    this.time = Number.isFinite(elapsed) ? elapsed : this.time + step;
    this.shared.uTime.value = this.time;
    // 记一份机位。Blood 要按距离补尺寸（见那边的抬头），而粒子是**世界尺寸**的
    // 广告牌，只有拿到相机才知道它在屏幕上究竟有几个像素。
    if (camera) this.eye.copy(camera.position);

    this._UpdateSmokeSources(step);

    if (this.dust && camera) {
      // 浮尘盒跟着相机走，但被 AmbientDust 给的战斗区域夹住 —— 越出战场就没有尘
      const center = this.dust.material.uniforms.uCenter.value;
      center.copy(camera.position);
      if (this.dustBox) this.dustBox.clampPoint(center, center);
    }

    for (const pool of Object.values(this.pools)) pool.Flush(this.time);
    this.debris.Flush(this.time);
  }

  // --- 效果 -----------------------------------------------------------------

  /**
   * 枪口焰。真枪就是两帧的事，所以寿命 45—75 ms；
   * 观感靠"不规则星芒 + 一小团发白的烟 + 一片向前炸开的空气扰动"，不靠持续时间。
   */
  MuzzleFlash(position, direction, { scale = 1, kind = "rifle" } = {}) {
    const profile = MUZZLE_KINDS[kind] || MUZZLE_KINDS.rifle;
    const dir = TMP_A.copy(direction).normalize();
    const size = profile.size * scale;
    const smokeCount = Math.max(1, Math.round(profile.smoke * this.spawnScale));
    const wispCount = Math.max(1, Math.round(profile.wisps * this.spawnScale));
    this.lastMuzzleProfile = {
      kind: MUZZLE_KINDS[kind] ? kind : "rifle",
      size,
      smokeCount,
      wispCount,
      life: profile.life,
    };

    for (let i = 0; i < profile.spikes; i += 1) {
      const s = ResetSpawn();
      s.x = position.x + dir.x * 0.04;
      s.y = position.y + dir.y * 0.04;
      s.z = position.z + dir.z * 0.04;
      s.vx = dir.x * 2.2; s.vy = dir.y * 2.2; s.vz = dir.z * 2.2;
      s.drag = 12;
      s.life = profile.life * (i === 0 ? 1 : 0.7);
      s.sizeStart = size * (i === 0 ? 1 : 0.62);
      s.sizeEnd = size * (i === 0 ? 1.35 : 0.8);
      s.opacity = 1;
      s.fadeIn = 0.02;
      s.angle = this._Range(0, 6.283);
      s.spin = this._Signed(6);
      s.colorA = VFX_PALETTE.muzzleCore;
      s.colorB = VFX_PALETTE.muzzleEdge;
      s.seed = this.random();
      this.pools.star.Spawn(s, this.time);
    }

    // 枪口前那一小团 HDR 亮核，负责在泛光里"炸开"
    {
      const s = ResetSpawn();
      s.x = position.x + dir.x * 0.06;
      s.y = position.y + dir.y * 0.06;
      s.z = position.z + dir.z * 0.06;
      s.life = profile.life * 1.1;
      s.sizeStart = size * 0.55; s.sizeEnd = size * 0.9;
      s.drag = 10; s.opacity = 1; s.fadeIn = 0.02;
      s.colorA = VFX_PALETTE.muzzleCore; s.colorB = VFX_PALETTE.fireMid;
      s.seed = this.random();
      this.pools.fire.Spawn(s, this.time);
    }

    // 向前的空气扰动：一片飞快膨胀又消失的贴面，正对枪口方向
    {
      const s = ResetSpawn();
      s.x = position.x + dir.x * 0.18;
      s.y = position.y + dir.y * 0.18;
      s.z = position.z + dir.z * 0.18;
      s.nx = dir.x; s.ny = dir.y; s.nz = dir.z;
      s.life = 0.09;
      s.sizeStart = size * 0.5; s.sizeEnd = size * 3.4;
      s.opacity = 0.16; s.fadeIn = 0.05; s.drag = 20;
      s.colorA = VFX_PALETTE.powderThin; s.colorB = VFX_PALETTE.powderSmoke;
      s.angle = this._Range(0, 3.14);
      s.seed = this.random();
      this.pools.ring.Spawn(s, this.time);
    }

    // 发白的火药烟，被枪口气流往前推一点点
    for (let i = 0; i < smokeCount; i += 1) {
      const s = ResetSpawn();
      s.x = position.x + dir.x * (0.1 + i * 0.05) + this._Signed(0.03);
      s.y = position.y + dir.y * (0.1 + i * 0.05) + this._Signed(0.03);
      s.z = position.z + dir.z * (0.1 + i * 0.05) + this._Signed(0.03);
      s.vx = dir.x * 1.6 + this._Signed(0.35);
      s.vy = dir.y * 1.6 + this._Signed(0.25) + 0.3;
      s.vz = dir.z * 1.6 + this._Signed(0.35);
      s.ax = this.wind.x * 0.5; s.ay = 0.35; s.az = this.wind.z * 0.5;
      s.drag = 2.6;
      s.life = this._Range(0.45, 0.85) * scale;
      s.sizeStart = 0.06 * scale; s.sizeEnd = this._Range(0.35, 0.6) * scale;
      s.opacity = 0.34; s.fadeIn = 0.12;
      s.angle = this._Range(0, 6.283); s.spin = this._Signed(1.6);
      s.colorA = VFX_PALETTE.powderThin; s.colorB = VFX_PALETTE.powderSmoke;
      s.seed = this.random();
      this.pools.smoke.Spawn(s, this.time);
    }

    // 慢余烟：初速很低、受风比爆口快烟更明显，并用较长 fadeIn 让它在火光灭后浮出来。
    // 它们立即进 GPU 粒子池但前 0.12—0.20 s 几乎透明，不需要 CPU 定时器或逐帧发射器。
    for (let i = 0; i < wispCount; i += 1) {
      const s = ResetSpawn();
      const along = 0.045 + i * 0.025;
      s.x = position.x + dir.x * along + this._Signed(0.012);
      s.y = position.y + dir.y * along + this._Signed(0.012);
      s.z = position.z + dir.z * along + this._Signed(0.012);
      s.vx = dir.x * this._Range(0.10, 0.28) + this._Signed(0.05);
      s.vy = dir.y * 0.12 + this._Range(0.10, 0.22);
      s.vz = dir.z * this._Range(0.10, 0.28) + this._Signed(0.05);
      s.ax = this.wind.x * 0.9; s.ay = 0.22; s.az = this.wind.z * 0.9;
      s.drag = 0.72;
      s.life = this._Range(0.90, 1.45) * Math.sqrt(scale);
      s.sizeStart = this._Range(0.018, 0.035) * scale;
      s.sizeEnd = this._Range(0.16, 0.28) * scale;
      s.opacity = 0.18; s.fadeIn = this._Range(0.14, 0.22);
      s.angle = this._Range(0, 6.283); s.spin = this._Signed(0.65);
      s.colorA = VFX_PALETTE.powderThin; s.colorB = VFX_PALETTE.powderSmoke;
      s.seed = this.random();
      this.pools.smoke.Spawn(s, this.time);
    }
  }

  /**
   * 曳光/弹道。中方偏暖白、日方偏冷白 —— 这是玩家分辨"谁在朝我打"的唯一线索。
   * 拉伸长度按速度给：帧间位移约 8 m，streak 短了就变成一串虚线。
   */
  Tracer(from, to, { speed = 480, kind = "nra" } = {}) {
    TMP_A.copy(to).sub(from);
    const distance = TMP_A.length();
    if (distance < 0.05) return;
    TMP_A.divideScalar(distance);
    const s = ResetSpawn();
    s.x = from.x; s.y = from.y; s.z = from.z;
    s.vx = TMP_A.x * speed; s.vy = TMP_A.y * speed; s.vz = TMP_A.z * speed;
    s.drag = 0.05;
    s.life = Math.min(distance / speed, 1.2);
    s.sizeStart = 0.035; s.sizeEnd = 0.02;
    s.stretch = Math.min(Math.max(speed * 0.022, 2), 14);
    s.opacity = 1; s.fadeIn = 0.01;
    s.groundY = -9999;                                   // 曳光不弹跳
    const warm = kind !== "ija";
    s.colorA = warm ? VFX_PALETTE.tracerNra : VFX_PALETTE.tracerIja;
    s.colorB = warm ? VFX_PALETTE.fireMid : VFX_PALETTE.tracerIja;
    s.seed = this.random();
    this.pools.streak.Spawn(s, this.time);
  }

  /** 命中反馈。不同表面必须一眼分得出来，这是"打得实不实"的全部。 */
  Impact(position, normal, surface = "dirt") {
    const profile = SURFACE_PROFILES[surface] || SURFACE_PROFILES.dirt;
    const n = TMP_A.copy(normal).normalize();
    // 打在地上（法线朝上）碎块就落在弹着点；打在墙上则要一路掉到地面 ——
    // 早先一律用 position.y 的版本，让碎砖悬在墙面高度上不动，像一堆黑方块贴着墙。
    const groundY = n.y > 0.6 ? position.y - 0.02 : this.groundLevel;

    const puffs = Math.round(profile.puffs * this.spawnScale);
    for (let i = 0; i < puffs; i += 1) {
      const s = ResetSpawn();
      this._ConeVelocity(n, 0.75, profile.puffSpeed * this._Range(0.35, 1));
      // 离面 8 cm 起手：贴着面生成的话，软粒子会把刚出生的砖粉抹掉一大半
      s.x = position.x + n.x * 0.08; s.y = position.y + n.y * 0.08; s.z = position.z + n.z * 0.08;
      s.vx = TMP_B.x; s.vy = TMP_B.y + 0.35; s.vz = TMP_B.z;
      s.ax = this.wind.x * 0.3; s.ay = -0.9; s.az = this.wind.z * 0.3;
      s.drag = 3.4;
      s.life = this._Range(profile.puffLife[0], profile.puffLife[1]);
      s.sizeStart = profile.puffSize[0];
      s.sizeEnd = profile.puffSize[1] * this._Range(0.7, 1.25);
      s.opacity = profile.opacity;
      s.fadeIn = 0.08;
      s.angle = this._Range(0, 6.283); s.spin = this._Signed(2.2);
      s.colorA = profile.colorA; s.colorB = profile.colorB;
      s.seed = this.random();
      this.pools.smoke.Spawn(s, this.time);
    }

    const chunks = Math.round(profile.chunks * this.spawnScale);
    for (let i = 0; i < chunks; i += 1) {
      this._ConeVelocity(n, 1.0, profile.chunkSpeed * this._Range(0.4, 1));
      const long = profile.splinter ? this._Range(2.5, 5.5) : 1;
      const size = this._Range(profile.chunkSize[0], profile.chunkSize[1]);
      this._SpawnDebris(
        position.x + n.x * 0.03, position.y + n.y * 0.03, position.z + n.z * 0.03,
        TMP_B.x, TMP_B.y + 1.2, TMP_B.z,
        size, size * this._Range(0.6, 1.1), size * long,
        profile.chunkColor, this._Range(1.1, 1.9), groundY, 0.34, 0.9);
    }

    // 火星只有金属才有：明亮、有拖尾、会弹跳
    const sparks = Math.round(profile.sparks * this.spawnScale);
    for (let i = 0; i < sparks; i += 1) {
      const s = ResetSpawn();
      this._ConeVelocity(n, 1.25, this._Range(3, 9));
      s.x = position.x + n.x * 0.02; s.y = position.y + n.y * 0.02; s.z = position.z + n.z * 0.02;
      s.vx = TMP_B.x; s.vy = TMP_B.y + 1.4; s.vz = TMP_B.z;
      s.ay = -9.8; s.drag = 1.1;
      s.life = this._Range(0.28, 0.7);
      s.sizeStart = 0.012; s.sizeEnd = 0.004;
      s.stretch = this._Range(0.15, 0.4);
      s.opacity = 1; s.fadeIn = 0.02;
      s.groundY = groundY;
      s.colorA = VFX_PALETTE.sparkHot; s.colorB = VFX_PALETTE.sparkCool;
      s.seed = this.random();
      this.pools.streak.Spawn(s, this.time);
    }

    // 沙包被打穿：一股顺着重力往下淌的沙流，不是爆开的云
    if (profile.sandStream) {
      const count = Math.round(7 * this.spawnScale);
      for (let i = 0; i < count; i += 1) {
        const s = ResetSpawn();
        s.x = position.x + n.x * 0.04 + this._Signed(0.03);
        s.y = position.y + this._Signed(0.02);
        s.z = position.z + n.z * 0.04 + this._Signed(0.03);
        s.vx = n.x * this._Range(0.2, 0.6); s.vy = -this._Range(0.4, 1.1); s.vz = n.z * this._Range(0.2, 0.6);
        s.ay = -6.5; s.drag = 1.6;
        s.life = this._Range(0.5, 0.95);
        s.sizeStart = 0.02; s.sizeEnd = 0.05;
        s.opacity = 0.6; s.fadeIn = 0.05;
        s.colorA = VFX_PALETTE.sand; s.colorB = VFX_PALETTE.soil;
        s.seed = this.random();
        this.pools.smoke.Spawn(s, this.time);
      }
    }

    if (profile.waterRing) {
      const s = ResetSpawn();
      s.x = position.x; s.y = position.y + 0.01; s.z = position.z;
      s.nx = 0; s.ny = 1; s.nz = 0;
      s.life = 0.75; s.sizeStart = 0.06; s.sizeEnd = 0.7;
      s.opacity = 0.35; s.fadeIn = 0.06;
      s.colorA = VFX_PALETTE.dustPale; s.colorB = VFX_PALETTE.water;
      s.seed = this.random();
      this.pools.ring.Spawn(s, this.time);
    }

    if (profile.blood) this.Blood(position, n, profile.blood);

    if (profile.decal) {
      this._SpawnDecal(position, n, profile.decalSize, profile.decalRim, profile.decalHole);
    }
  }

  /**
   * 爆炸。看起来"有当量"的关键不是火球大小，是**贴地扩散的尘环**：
   * 冲击波沿地面推出去的那一圈灰，才让人相信地面被砸了一下。
   */
  Explosion(position, {
    radius = 6, kind = "grenade", groundY = null, spriteVariant = null,
  } = {}) {
    const profile = EXPLOSION_KINDS[kind] || EXPLOSION_KINDS.grenade;
    const scale = Math.max(0.35, radius / 6);
    // 空炸（打在墙上、屋顶上）时爆点比地面高，碎块得继续往下掉
    const ground = groundY ?? Math.min(position.y - 0.05, this.groundLevel);
    const effectivePower = radius * profile.flash;
    const spriteKey = EXPLOSION_SPRITE_VARIANTS[spriteVariant]
      ? spriteVariant : this.SelectExplosionSpriteVariant(effectivePower);
    const spriteProfile = EXPLOSION_SPRITE_VARIANTS[spriteKey];
    const spritePool = this.pools[spriteProfile.pool];
    this.lastExplosionSprite = {
      key: spriteKey, effectivePower, radius, kind,
      loaded: this.loadedExplosionSprites.has(spriteKey),
    };

    // 1) 中心强光：HDR 20+，只活三四帧
    {
      const s = ResetSpawn();
      s.x = position.x; s.y = position.y; s.z = position.z;
      // 三四帧、直径远小于当量半径 —— 剩下的"大"交给泛光去铺。
      // 做成 radius 级别的白球会直接糊掉半个屏幕，那不是强光是曝光失败。
      s.life = 0.055 * profile.flash;
      s.sizeStart = radius * 0.08; s.sizeEnd = radius * 0.26 * profile.flash;
      s.opacity = 1; s.fadeIn = 0.02; s.drag = 8;
      s.colorA = VFX_PALETTE.flashCore; s.colorB = VFX_PALETTE.fireHot;
      s.seed = this.random();
      this.pools.fire.Spawn(s, this.time);
    }

    // 2) 火球：按冲击量从相邻的两档 CC0 序列帧里随机挑一套，再裹一层程序化辉光。
    //    一次爆炸内的所有片共用同一套动画，避免火/烟轮廓互相穿帮；下一次爆炸才重抽。
    const spriteCount = Math.max(1,
      Math.min(3, Math.round(profile.fire / 5) * Math.round(this.spawnScale)));
    for (let i = 0; i < spriteCount; i += 1) {
      const s = ResetSpawn();
      const size = i === 0 ? spriteProfile.mainSize : spriteProfile.secondarySize;
      const spread = i === 0 ? 0 : radius * 0.18;
      s.x = position.x + this._Signed(spread);
      s.y = position.y + this._Range(0, radius * 0.10) + i * radius * 0.06;
      s.z = position.z + this._Signed(spread);
      s.vx = this._Signed(1.1) * scale; s.vy = this._Range(1.4, 3.0) * scale; s.vz = this._Signed(1.1) * scale;
      s.ay = 2.4; s.drag = 2.8;
      s.life = this._Range(spriteProfile.life[0], spriteProfile.life[1]);
      s.sizeStart = radius * size[0];
      s.sizeEnd = radius * size[1];
      s.opacity = i === 0 ? 0.95 : 0.6; s.fadeIn = 0.04;
      s.angle = this._Range(0, 6.283); s.spin = this._Signed(0.5);
      s.frame = i === 0 ? 0 : Math.floor(this.random() * Math.min(8, spriteProfile.frames));
      s.colorA = VFX_PALETTE.fireHot; s.colorB = VFX_PALETTE.fireCool;
      s.seed = this.random();
      spritePool.Spawn(s, this.time);
    }

    // 程序化辉光裹在序列帧外面：向上加速，黄 -> 暗红
    const fireCount = Math.max(1, Math.round(profile.fire * 0.5 * this.spawnScale));
    for (let i = 0; i < fireCount; i += 1) {
      const s = ResetSpawn();
      s.x = position.x + this._Signed(radius * 0.14);
      s.y = position.y + this._Range(0, radius * 0.16);
      s.z = position.z + this._Signed(radius * 0.14);
      s.vx = this._Signed(2.4 * scale); s.vy = this._Range(1.2, 4.2) * scale; s.vz = this._Signed(2.4 * scale);
      s.ay = 3.2; s.drag = 3.0;
      s.life = this._Range(0.22, 0.45);
      s.sizeStart = radius * 0.16; s.sizeEnd = radius * this._Range(0.3, 0.5);
      s.opacity = 1; s.fadeIn = 0.03;
      s.angle = this._Range(0, 6.283); s.spin = this._Signed(2.5);
      s.colorA = VFX_PALETTE.fireHot; s.colorB = VFX_PALETTE.fireCool;
      s.seed = this.random();
      this.pools.fire.Spawn(s, this.time);
    }

    // 3) 贴地尘环（两圈错开，前一圈快、后一圈慢）
    for (let i = 0; i < 2; i += 1) {
      const s = ResetSpawn();
      s.x = position.x; s.y = ground + 0.08 + i * 0.05; s.z = position.z;
      s.nx = 0; s.ny = 1; s.nz = 0;
      s.life = 0.9 + i * 0.5;
      s.sizeStart = radius * 0.2;
      // 环的可见半径约是这个半宽的 0.72 倍，1.05 差不多正好铺到杀伤半径外沿
      s.sizeEnd = radius * (1.05 + i * 0.4);
      s.opacity = 0.55 - i * 0.18; s.fadeIn = 0.05;
      s.angle = this._Range(0, 3.14);
      s.colorA = VFX_PALETTE.dust; s.colorB = VFX_PALETTE.dustDense;
      s.seed = this.random();
      this.pools.ring.Spawn(s, this.time);
    }

    // 4) 抛射碎块
    const chunkCount = Math.round(profile.chunks * this.spawnScale);
    for (let i = 0; i < chunkCount; i += 1) {
      const a = this.random() * 6.2831853;
      const up = this._Range(0.35, 1.5);
      const speed = this._Range(3.5, 11) * scale;
      const size = this._Range(0.02, 0.075) * scale;
      this._SpawnDebris(
        position.x, position.y + 0.1, position.z,
        Math.cos(a) * speed, up * speed * 0.8, Math.sin(a) * speed,
        size, size * this._Range(0.5, 1.0), size * this._Range(0.8, 2.2),
        this.random() < profile.sooty ? VFX_PALETTE.woodBurnt : VFX_PALETTE.brick,
        this._Range(0.9, 1.8), ground, 0.3, this._Range(1.6, 3.2));
    }

    // 5) 火星（战车/炮弹才明显）
    const sparkCount = Math.round(profile.sparks * this.spawnScale);
    for (let i = 0; i < sparkCount; i += 1) {
      const s = ResetSpawn();
      const a = this.random() * 6.2831853;
      const speed = this._Range(4, 14) * scale;
      s.x = position.x; s.y = position.y + 0.1; s.z = position.z;
      s.vx = Math.cos(a) * speed; s.vy = this._Range(2, 9); s.vz = Math.sin(a) * speed;
      s.ay = -9.8; s.drag = 0.9;
      s.life = this._Range(0.4, 1.1);
      s.sizeStart = 0.016; s.sizeEnd = 0.005;
      s.stretch = this._Range(0.2, 0.6);
      s.opacity = 1; s.fadeIn = 0.02; s.groundY = ground;
      s.colorA = VFX_PALETTE.sparkHot; s.colorB = VFX_PALETTE.sparkCool;
      s.seed = this.random();
      this.pools.streak.Spawn(s, this.time);
    }

    // 6) 慢慢升起的柱状烟：这是爆炸留在画面里的"尾巴"，比火球活得久十倍
    const smokeCount = Math.round(profile.smoke * this.spawnScale);
    for (let i = 0; i < smokeCount; i += 1) {
      const t = i / Math.max(1, smokeCount - 1);
      const s = ResetSpawn();
      s.x = position.x + this._Signed(radius * 0.2 * (1 - t * 0.5));
      s.y = position.y + t * radius * 0.5 * profile.column;
      s.z = position.z + this._Signed(radius * 0.2 * (1 - t * 0.5));
      s.vx = this._Signed(1.1) + this.wind.x * 0.6;
      s.vy = this._Range(1.0, 2.6) * profile.column;
      s.vz = this._Signed(1.1) + this.wind.z * 0.6;
      s.ax = this.wind.x * 0.4; s.ay = 0.55; s.az = this.wind.z * 0.4;
      s.drag = 1.5;
      s.life = this._Range(2.6, 5.0);
      s.sizeStart = radius * 0.14;
      s.sizeEnd = radius * this._Range(0.42, 0.78);
      s.opacity = 0.5; s.fadeIn = 0.14;
      s.angle = this._Range(0, 6.283); s.spin = this._Signed(0.7);
      // 越靠近爆心越黑（燃烧产物），越往外越是砖粉黄土
      const sooty = this.random() < profile.sooty;
      s.colorA = sooty ? VFX_PALETTE.blackCore : VFX_PALETTE.dustDense;
      s.colorB = sooty ? VFX_PALETTE.blackSmoke : VFX_PALETTE.dust;
      s.seed = this.random();
      this.pools.smoke.Spawn(s, this.time);
    }

    // 7) 地面焦痕
    TMP_C.set(0, 1, 0);
    this._SpawnDecal({ x: position.x, y: ground + 0.02, z: position.z }, TMP_C,
      radius * 0.42, VFX_PALETTE.soil, VFX_PALETTE.woodBurnt, 0.5, 0);
  }

  /**
   * 抛壳。尺寸按真实弹壳给（7.92×57 就是 7.9 mm × 57 mm）—— 做大了会立刻假。
   * @param {*} caliber 数字(mm) 或 "7.92×57mm" / "7.92" 这类字符串
   */
  ShellCasing(position, direction, caliber = "7.92") {
    const key = typeof caliber === "number"
      ? caliber.toFixed(2).replace(/0+$/, "").replace(/\.$/, "")
      : String(caliber).split(/[×x* ]/)[0];
    const size = CASING_SIZES[key] || CASING_SIZES["7.92"];
    const dir = TMP_A.copy(direction).normalize();
    const speed = this._Range(1.8, 3.2);
    this._SpawnDebris(
      position.x, position.y, position.z,
      dir.x * speed + this._Signed(0.4),
      dir.y * speed + this._Range(0.8, 1.8),
      dir.z * speed + this._Signed(0.4),
      size[0], size[0], size[1],
      VFX_PALETTE.brass, this._Range(0.5, 1.1), this.groundLevel, 0.42,
      this._Range(8, 18));                    // 弹壳出膛是翻着飞的，转速要高
  }

  /**
   * 持续冒烟源（烧着的房子、烧毁的战车、发烟筒）。
   * @returns {number} handle，交给 RemoveSmokeSource
   */
  SmokeSource(position, opts = {}) {
    const id = this.nextSourceId;
    this.nextSourceId += 1;
    const kind = opts.kind || "dust";
    const palette = kind === "black"
      ? [VFX_PALETTE.blackCore, VFX_PALETTE.blackSmoke]
      : kind === "screen"
        ? [VFX_PALETTE.screenSmoke, VFX_PALETTE.powderThin]   // 发烟筒：白灰，贴地翻滚
        : [VFX_PALETTE.dustDense, VFX_PALETTE.dust];
    this.smokeSources.set(id, {
      position: new THREE.Vector3(position.x, position.y, position.z),
      rate: (opts.rate ?? 10) * this.spawnScale,
      radius: opts.radius ?? 0.35,
      rise: opts.rise ?? (kind === "screen" ? 0.35 : 1.5),
      sizeStart: opts.sizeStart ?? 0.35,
      sizeEnd: opts.sizeEnd ?? (kind === "screen" ? 2.4 : 3.0),
      life: opts.life ?? 4.5,
      opacity: opts.opacity ?? 0.42,
      // 黑烟是持续上升的羽流，不能套爆炸烟“半程已膨到终值”的曲线。
      // turbulence 让每个烟团以不同相位轻轻摆动：层级来自上升流，不是堆
      // 更大的黑色透明片。发烟筒仍略快一些，让贴地扩散读得出来。
      growthPower: opts.growthPower ?? (kind === "black" ? 0.82 : kind === "screen" ? 1.35 : 2.0),
      turbulence: opts.turbulence ?? (kind === "black" ? 0.28 : 0),
      fire: opts.fire ?? 0,
      colorA: opts.colorA || palette[0],
      colorB: opts.colorB || palette[1],
      groundHug: kind === "screen",
      accumulator: 0,
      fireAccumulator: 0,
    });
    return id;
  }

  RemoveSmokeSource(handle) { this.smokeSources.delete(handle); }

  /**
   * 空气里的浮尘。只保留很淡的环境层；方向性太阳拖影由后处理负责。
   * @param {THREE.Box3} box 战斗区域；微粒盒会跟着相机走但被夹在这个范围内
   * @param {number} density 每立方米微粒数（0.04—0.12 是合适的量）
   */
  AmbientDust(box, density = 0.06) {
    const capacity = Math.max(32, Math.round(this.budget * POOL_SHARE.dust * this.preset.dust));
    TMP_A.set(0, 0, 0);
    let cell = TMP_A.set(30, 9, 30);
    if (box && box.isBox3) {
      this.dustBox = box.clone();
      box.getSize(TMP_B);
      cell = TMP_A.set(Math.min(TMP_B.x, 34), Math.min(Math.max(TMP_B.y, 3), 12), Math.min(TMP_B.z, 34));
    } else {
      this.dustBox = null;
    }
    const volume = Math.max(1, cell.x * cell.y * cell.z);
    const count = Math.max(32, Math.min(capacity, Math.round(volume * density)));

    if (this.dust) { this.root.remove(this.dust.mesh); this.dust.Dispose(); }
    this.dust = new DustField(count, this.shared, HashString("Taierzhuang.Dust"));
    this.dust.material.uniforms.uBox.value.copy(cell);
    this.dust.material.uniforms.uIntensity.value = 0.5;
    this.root.add(this.dust.mesh);
    return count;
  }

  /**
   * 血。**克制**：考据里写死了"无墙不饮弹，无土不沃血"要靠弹孔密度表达，
   * 不是靠满屏血浆。所以这里只有一小团暗红雾 + 几点落地。
   */
  Blood(position, direction, amount = 1) {
    const dir = TMP_A.copy(direction).normalize();
    const count = Math.max(1, Math.round(4 * amount * this.spawnScale));
    // 距离补偿：粒子是世界尺寸的广告牌，0.17 m 的一团在一百米外张角 0.097°，
    // 1600 px 宽 / 55° 视场上折合 **2.8 个像素** —— 也就是说，四十米以外
    // 「打中了」这件事在画面上根本没有发生过。
    // 补偿的是**屏幕张角**而不是"让血更多"：粒子数、寿命、透明度一个不动，
    // 只把尺寸按距离往上抬，封顶 3.2 倍（一百米上约九个像素，看得见但仍是一小团）。
    // 25 m 以内不补 —— 贴脸的那一下本来就够大，再放大就成了血浆片。
    const eyeDist = Math.hypot(position.x - this.eye.x, position.y - this.eye.y,
      position.z - this.eye.z);
    const far = Math.min(3.2, Math.max(1, eyeDist / 25));
    for (let i = 0; i < count; i += 1) {
      const s = ResetSpawn();
      this._ConeVelocity(dir, 0.55, this._Range(0.8, 2.4) * amount);
      s.x = position.x; s.y = position.y; s.z = position.z;
      s.vx = TMP_B.x; s.vy = TMP_B.y + 0.2; s.vz = TMP_B.z;
      s.ay = -3.6; s.drag = 4.5;
      s.life = this._Range(0.3, 0.6);
      s.sizeStart = 0.05 * amount * far; s.sizeEnd = 0.17 * amount * far;
      s.opacity = 0.5; s.fadeIn = 0.05;
      s.angle = this._Range(0, 6.283); s.spin = this._Signed(2);
      s.colorA = VFX_PALETTE.blood; s.colorB = VFX_PALETTE.bloodDark;
      s.seed = this.random();
      this.pools.smoke.Spawn(s, this.time);
    }
  }

  /**
   * 掷弹筒落点预警。八九式有 3.2 s 飞行时间、1.5 s 提前量，
   * 玩家要能"听到啸声看见地上一圈"然后跑掉 —— 这一圈是收缩的，越收越急。
   */
  IncomingMarker(position, secondsToImpact = 1.5) {
    const life = Math.max(0.35, secondsToImpact);
    for (let i = 0; i < 2; i += 1) {
      const s = ResetSpawn();
      s.x = position.x; s.y = position.y + 0.05 + i * 0.02; s.z = position.z;
      s.nx = 0; s.ny = 1; s.nz = 0;
      s.life = life * (i === 0 ? 1 : 0.62);
      s.sizeStart = 3.2 - i * 1.1;            // 收缩：从外往内套住落点
      s.sizeEnd = 0.7;
      s.opacity = 0.55; s.fadeIn = 0.05;
      s.flicker = 3.5 + i;                     // 越接近落地闪得越显眼
      s.angle = this._Range(0, 3.14);
      s.colorA = VFX_PALETTE.markerWarn; s.colorB = VFX_PALETTE.dustDense;
      s.seed = this.random();
      this.pools.ring.Spawn(s, this.time);
    }
    // 落点上方一点微弱的尘扬，提示"有东西正在下来"
    const s = ResetSpawn();
    s.x = position.x; s.y = position.y + 0.15; s.z = position.z;
    s.life = life; s.sizeStart = 0.25; s.sizeEnd = 0.6;
    s.opacity = 0.18; s.fadeIn = 0.25; s.drag = 6;
    s.vy = 0.25;
    s.colorA = VFX_PALETTE.dust; s.colorB = VFX_PALETTE.dustDense;
    s.seed = this.random();
    this.pools.smoke.Spawn(s, this.time);
  }

  Dispose() {
    if (this.scene.onBeforeRender === this.sceneHook) {
      this.scene.onBeforeRender = this.previousSceneHook;
    }
    this.scene.remove(this.root);
    for (const pool of Object.values(this.pools)) pool.Dispose();
    this.debris.Dispose();
    if (this.dust) this.dust.Dispose();
    for (const texture of this.explosionSpriteTextures.values()) texture.dispose();
    this.explosionSpriteTextures.clear();
    this.loadedExplosionSprites.clear();
    if (this.spritePlaceholder) this.spritePlaceholder.dispose();
    if (this.spriteTransparentPlaceholder) this.spriteTransparentPlaceholder.dispose();
    this.fallbackDepth.dispose();
    this.smokeSources.clear();
    this.dust = null;
  }

  // --- 内部 -----------------------------------------------------------------

  _Range(a, b) { return a + (b - a) * this.random(); }
  _Signed(scale) { return (this.random() * 2 - 1) * scale; }

  /** 以 axis 为中心、halfAngle 张角的锥形速度，结果写进 TMP_B。 */
  _ConeVelocity(axis, spread, speed) {
    const ax = axis.x, ay = axis.y, az = axis.z;
    // 取一个与 axis 不共线的参考轴构正交基（axis 接近 ±Y 时换一根，否则叉积退化）
    const gx = Math.abs(ay) > 0.9 ? 1 : 0;
    const gy = Math.abs(ay) > 0.9 ? 0 : 1;
    let tx = gy * az - 0 * ay;
    let ty = 0 * ax - gx * az;
    let tz = gx * ay - gy * ax;
    const tl = Math.hypot(tx, ty, tz) || 1;
    tx /= tl; ty /= tl; tz /= tl;
    const bx = ay * tz - az * ty;
    const by = az * tx - ax * tz;
    const bz = ax * ty - ay * tx;
    const angle = this.random() * 6.2831853;
    const r = Math.sqrt(this.random()) * spread;
    const dx = ax + (tx * Math.cos(angle) + bx * Math.sin(angle)) * r;
    const dy = ay + (ty * Math.cos(angle) + by * Math.sin(angle)) * r;
    const dz = az + (tz * Math.cos(angle) + bz * Math.sin(angle)) * r;
    const dl = Math.hypot(dx, dy, dz) || 1;
    TMP_B.set(dx / dl * speed, dy / dl * speed, dz / dl * speed);
    return TMP_B;
  }

  _SpawnDebris(x, y, z, vx, vy, vz, sx, sy, sz, color, life, groundY, bounce, spinRate) {
    const d = DEBRIS_SPAWN;
    d.x = x; d.y = y; d.z = z;
    d.vx = vx; d.vy = vy; d.vz = vz;
    d.sx = sx; d.sy = sy; d.sz = sz;
    d.color = color; d.life = life; d.groundY = groundY;
    d.bounce = bounce; d.drag = 0.55; d.seed = this.random();
    d.rx = this._Signed(spinRate); d.ry = this._Signed(spinRate); d.rz = this._Signed(spinRate);
    this.debris.Spawn(d, this.time);
  }

  /** 弹孔贴花：原位贴面；polygonOffset 负责防 z-fighting，深度预通道负责裁悬空边。 */
  _SpawnDecal(position, normal, size, rim, hole, opacity = 0.85, rays = 1) {
    const s = ResetSpawn();
    s.x = position.x;
    s.y = position.y;
    s.z = position.z;
    s.nx = normal.x; s.ny = normal.y; s.nz = normal.z;
    s.life = 1e5;                       // 一关打不完；超上限由环形缓冲先进先出淘汰
    s.sizeStart = size; s.sizeEnd = size;
    s.opacity = opacity; s.fadeIn = 0;
    s.stretch = rays;                    // 贴花池里 stretch 复用为放射线强度
    s.angle = this._Range(0, 6.283);
    s.colorA = rim; s.colorB = hole;
    s.seed = this.random();
    this.pools.decal.Spawn(s, this.time);
  }

  _UpdateSmokeSources(dt) {
    if (dt <= 0 || this.smokeSources.size === 0) return;
    for (const source of this.smokeSources.values()) {
      source.accumulator += source.rate * dt;
      const emit = Math.floor(source.accumulator);
      source.accumulator -= emit;
      for (let i = 0; i < emit; i += 1) {
        const s = ResetSpawn();
        const a = this.random() * 6.2831853;
        const r = Math.sqrt(this.random()) * source.radius;
        s.x = source.position.x + Math.cos(a) * r;
        s.y = source.position.y + this._Range(0, 0.15);
        s.z = source.position.z + Math.sin(a) * r;
        s.vx = this._Signed(0.25) + this.wind.x * 0.4;
        s.vy = source.rise * this._Range(0.7, 1.3);
        s.vz = this._Signed(0.25) + this.wind.z * 0.4;
        s.ax = this.wind.x * 0.5;
        // 发烟筒是贴地翻滚的：浮力压到接近零，让它铺开而不是升柱
        //
        // 事故：升柱那一支原来是 drag 1.3 配固定浮力 0.42 —— 闭式解的终速是 a/k，
        // 也就是 0.32 m/s，rise 给到 3.4 也没用，初速在半秒内就被阻尼吃干净。
        // 实测九秒寿命的"烟柱"最高只爬到 6.6 m，而同一片子膨到 11 m 半径：
        // 宽度是高度的三倍多，柱子变成一颗球，几百片叠在一起 alpha 直接饱和。
        // 天上那个越长越大的黑球就是这么来的（另一半原因是没有大气透视）。
        // 浮力改成跟着 rise 走（a = rise·k），终速就等于 rise，柱子才真的是柱子。
        s.ay = source.groundHug ? 0.05 : source.rise * BUOYANT_DRAG;
        s.az = this.wind.z * 0.5;
        s.drag = source.groundHug ? 0.9 : BUOYANT_DRAG;
        // 标准烟团不走 GROUND_BOUNCE，故 iExtra.z 可安全作为羽流摇摆幅度。
        // 负值是 ResetSpawn 的“未启用”哨兵，别让枪烟与尘土也开始摇。
        s.groundY = source.turbulence > 0 ? source.turbulence : -9999;
        s.life = source.life * this._Range(0.75, 1.25);
        s.sizeStart = source.sizeStart;
        s.sizeEnd = source.sizeEnd * this._Range(0.8, 1.2);
        s.stretch = source.growthPower;
        s.opacity = source.opacity;
        s.fadeIn = 0.18;
        s.angle = this._Range(0, 6.283); s.spin = this._Signed(0.55);
        s.colorA = source.colorA; s.colorB = source.colorB;
        s.seed = this.random();
        this.pools.smoke.Spawn(s, this.time);
      }
      if (source.fire > 0) {
        source.fireAccumulator += source.fire * 22 * dt * this.spawnScale;
        const fires = Math.floor(source.fireAccumulator);
        source.fireAccumulator -= fires;
        for (let i = 0; i < fires; i += 1) {
          const s = ResetSpawn();
          const a = this.random() * 6.2831853;
          const r = Math.sqrt(this.random()) * source.radius * 0.7;
          s.x = source.position.x + Math.cos(a) * r;
          s.y = source.position.y;
          s.z = source.position.z + Math.sin(a) * r;
          s.vy = this._Range(1.2, 2.6) * source.fire;
          s.vx = this._Signed(0.3); s.vz = this._Signed(0.3);
          s.ay = 3.6;                                    // 火焰是向上**加速**的，不是匀速飘
          s.drag = 2.2;
          s.life = this._Range(0.3, 0.6);
          s.sizeStart = 0.18 * source.fire;
          s.sizeEnd = 0.42 * source.fire;
          s.opacity = 1; s.fadeIn = 0.05;
          s.angle = this._Range(0, 6.283); s.spin = this._Signed(2);
          s.flicker = this._Range(6, 11);                 // 火苗要抖
          s.colorA = VFX_PALETTE.fireHot; s.colorB = VFX_PALETTE.fireCool;
          s.seed = this.random();
          this.pools.fire.Spawn(s, this.time);
        }
      }
    }
  }
}
