// 《地道战 · 钟声》—— 渲染层。
//
// 职责：把 state 画出来。只读 state，绝不写 state。
// 相机是**长焦透视**（AGENTS.md 2.1），看向 -Z，永不旋转，只沿 X/Y 平移。
// 相机距离由「z=0 玩法平面上要看到 viewHeight 那么高」反推，见 ApplyCameraLens。
//
// 场景图分层严格按 Data_Contract.LAYER_Z。视差**不再手动伪造**，它是透视的
// 自然结果：z 越靠前的层，随相机横移得越快、看起来越大。
//   FAR(-26) 远山              —— 天然慢视差 + 大气透视褪色
//   BACK(-14) 远处村舍剪影      —— 天然慢视差
//   MID(-6)  中景房舍 / 地道背墙
//   PLAY(0)  玩家 / NPC / 敌人 / 可互动道具 / 地板 / 危害
//   FORE(+5) 前景遮挡物（柴垛、树干、土坡），近黑剪影，做真实遮挡
// 天幕 / 月 / 星单独挂在相机下（gSky），那是"无穷远"，不该有任何视差。
//
// 舞台必须有厚度（AGENTS.md 2.2）。透视只是前提，几何才是关键：
//   · 地面是一块向 -Z 延伸十几米的台面（土层挤出体的顶面），远端靠假 AO 沉下去；
//   · 房子是体：檐口外挑、门洞真的凹进墙里、窗台有厚度、侧墙一眼可见；
//   · 地道剖面吃透视红利：挤出体的洞壁就是坑道的地面 / 顶板 / 内壁，
//     深度拉到十几米后能一眼看进坑道里，像壕沟而不是剪纸。
//
// 地下剖面：把"地道占用"栅格化 → marching squares 提取轮廓 → Chaikin 平滑 +
// 确定性扰动 → THREE.Shape + holes → ExtrudeGeometry。土层按 y 分带上顶点色、
// 按局部 z 加假 AO，越往里越暗——透视下这层假 AO 直接变成真实的纵深。
//
// 全程程序化：没有任何外部图片 / 音频，纹理一律 CanvasTexture 现场画并缓存。
// 随机一律用确定性哈希，禁止 Math.random()。

import * as THREE from './vendor/three/build/three.module.mjs';
import * as ActorModule from './Script_Actor.mjs';
import { LAYER_Z, PALETTE, CAMERA, Clamp, Lerp } from './Data_Contract.mjs';

// vendor/three/examples/jsm/** 里的文件是用裸标识符 `from 'three'` 写的，需要
// index.html 里有 importmap 才解析得动。index.html 不归我管，所以这里用可失败的
// 动态 import 去拿 mergeGeometries：拿得到就用官方的，拿不到就退回本地实现。
// 任何情况下都不许因为这个依赖把整页搞黑。
let VendorMerge = null;
try {
  const bgu = await import('./vendor/three/examples/jsm/utils/BufferGeometryUtils.mjs');
  if (bgu && typeof bgu.mergeGeometries === 'function') VendorMerge = bgu.mergeGeometries;
} catch (e) {
  VendorMerge = null;
}

// ---------------------------------------------------------------------------
// 0. 环境探测 / 模块级预分配（Sync 里禁止 new）
// ---------------------------------------------------------------------------

const HAS_DOM = typeof document !== 'undefined' && typeof document.createElement === 'function';

const _colA = new THREE.Color();
const _colB = new THREE.Color();
const _colC = new THREE.Color();
const _colD = new THREE.Color();
const _colE = new THREE.Color();
const _vecA = new THREE.Vector3();
const _vecB = new THREE.Vector3();

/** 长焦透视的半视角正切，全篇的距离换算都用它。 */
const TAN_HALF_FOV = Math.tan((CAMERA.fovDeg * Math.PI) / 180 / 2);
/** z=0 平面上要看到 vh 那么高时，相机该站多远。这是 viewHeight 语义的唯一实现。 */
function CameraDistanceFor(vh) { return (vh * 0.5) / TAN_HALF_FOV; }
/** 距相机 dist 处的可视半高。暗角罩、天幕这些"贴屏"的东西靠它定尺寸。 */
function HalfHeightAt(dist) { return Math.max(0.01, dist) * TAN_HALF_FOV; }

/** 地下剖面正面（朝观众那一面）所在的 z。 */
const EARTH_FRONT_Z = 2.25;
/** 天幕挂在相机下面多远。它是"无穷远"，只要比 far 近、比一切场景物远就行。 */
const SKY_DEPTH = 120;

/** 角色 z：略微靠前，避免被同在 PLAY 层的道具吞掉；仍在剖面正面之后。 */
const ACTOR_Z_PLAYER = 0.55;
const ACTOR_Z_ENEMY = 0.40;
const ACTOR_Z_NPC = 0.25;

const QUALITY_PRESET = {
  // extrudeDepth 就是"舞台有多厚"。挤出体的洞壁 = 坑道的地面 / 顶板 / 内壁，
  // 挤出体的顶面 = 地表那块台面。正交时这些面全部退化成看不见的边，所以旧值
  // 只要够挡住背墙就行；透视下它直接决定了"能看进去多深"，必须给足。
  // 深度不增加三角形数（侧壁始终是四边形带），只增加可读的进深。
  low: {
    texSize: 64, cyl: 6, lathe: 8, ico: 0, bevelSeg: 1, extrudeDepth: 8.0,
    gridCell: 0.42, chaikin: 1, gasLayers: 2, particles: 90, warmLights: 2,
    shadows: false, foreDensity: 0.45, hazePlanes: false, starCount: 60,
    maxPixelRatio: 1.0, antialias: false, smoothTunnel: 0.55,
    // 纵深强化四件套（见下面 2.6 节）。low 档只留"地面纵深线"——它是纯几何、
    // 并进已有的合批，一个 draw call 都不多花，却是最强的深度信号。
    moteBands: 0, depthLayers: false, groundLines: true, foreBokeh: false,
    film: null,
  },
  medium: {
    texSize: 128, cyl: 8, lathe: 12, ico: 0, bevelSeg: 2, extrudeDepth: 10.5,
    gridCell: 0.32, chaikin: 2, gasLayers: 3, particles: 180, warmLights: 3,
    shadows: false, foreDensity: 0.8, hazePlanes: true, starCount: 130,
    maxPixelRatio: 1.5, antialias: true, smoothTunnel: 0.75,
    moteBands: 3, depthLayers: true, groundLines: true, foreBokeh: false,
    // medium 是触屏档。实测后处理在填充率受限的设备上会把帧时间翻倍
    // （SwiftShader 1920×1080：365ms → 622ms），所以这一档只留最省、
    // 也最像"电影调色"的三样：色调分离 + 颗粒 + 暗角，一个 pass、一次取样。
    // 色差要三次取样、辉光要三个额外 pass，都只在 high 档开。
    film: { split: 0.85, grain: 0.8, vignette: 0.85, bloom: 0, ca: 0, trail: 0 },
  },
  high: {
    texSize: 256, cyl: 12, lathe: 16, ico: 1, bevelSeg: 3, extrudeDepth: 12.0,
    gridCell: 0.26, chaikin: 2, gasLayers: 5, particles: 320, warmLights: 5,
    shadows: true, foreDensity: 1.0, hazePlanes: true, starCount: 220,
    maxPixelRatio: 2.0, antialias: true, smoothTunnel: 0.85,
    moteBands: 4, depthLayers: true, groundLines: true, foreBokeh: true,
    film: { split: 1.0, grain: 1.0, vignette: 1.0, bloom: 1.0, ca: 1.0, trail: 1.0 },
  },
};

// ---------------------------------------------------------------------------
// 2.6 纵深（AGENTS.md 2.1 / 2.2）
//
// 长焦透视 + 舞台厚度只是**前提**。真正让人读出"深"的，是一串连续的深度
// 线索，而不是四张卡片：
//
//  1) 中间层（`DEPTH_LAYER_Z`）。FAR(-26)/BACK(-14)/MID(-6) 之间是断的，
//     补进 -31 / -20 / -10 三层，视差与褪色就变成梯度而不是台阶。
//  2) 空气里的东西（`MOTE_BANDS`）。同一种浮尘按 z 分四层：近的大而快、
//     远的小而慢。这是最便宜的纵深线索，比任何几何都管用，一层一个 draw call。
//  3) 体积光。光柱**自带长度**，所以它本身就是纵深。通气孔的一道光改成
//     前中后三片错开的光锥 + 地面光潭；地表加几道穿过树冠的月光。
//  4) 地面的纵深线（`groundLines`）。沿 Z 的车辙、垄沟、篱笆桩——
//     **平行线向纵深收敛**是人眼判断距离最强的信号，而且它并进已有合批。
//
// 大气透视也跟着改了做法：三道空气墙不再是均匀的板，而是**带高度梯度**的
// （贴地最厚、越往上越薄）。这是上一轮的坑：均匀板给到 0.30 会把天幕一起洗，
// 远山和天空只差 2 级亮度等于没画。带梯度之后可以放心加厚——洗的是景物，
// 不是天空。
// ---------------------------------------------------------------------------

/** 补进 FAR/BACK/MID 之间的中景层。键名只是叙述用，真正决定层次的是 z。 */
const DEPTH_LAYER_Z = {
  RIDGE_FAR: -31,      // 最远的一道山脊，几乎全被雾吃掉，只剩一线比天空亮
  GROVE: -20,          // FAR 与 BACK 之间：树线 + 更远的屋顶
  YARD: -10.8,         // BACK 与 MID 之间：院墙、电线杆、碾道
  //     ^ 刻意不等于空气墙的 -10：共面的透明面与不透明面深度测试会打架，
  //       画面上是一块随机忽明忽暗的补丁。
};

/**
 * 月亮永远落在画面 ndc y = +0.50、半径 0.115（PlaceSkyMoon 写死的，与视口
 * 无关）。任何背景剪影的**最高点**都不许越过这条线——月亮是整套夜景的构图
 * 锚，被啃掉一块的代价远大于多一道山脊。新加的最远山脊按这条线反推限高：
 *     y_max = camY + MOON_CLEAR_NDC * HalfHeightAt(camDist + |z|)
 * 最紧的情况是地表标称视口（camDist 32.6），代进去 z=-31 得 y_max ≈ 5.9。
 */
const MOON_CLEAR_NDC = 0.35;

/**
 * 浮尘分层。z 越靠前 → 点越大、飘得越快、数量越少。
 * 每层一个 THREE.Points（1 draw call），位置每帧按 time 解析式算出来，
 * 零分配、无 Math.random()。地表是冷灰的夜尘，地下换成马灯旁的暖色土屑。
 */
const MOTE_BANDS = [
  { z: -17.0, n: 46, size: 1.6, drift: 0.42, rise: 0.05, aSurf: 0.30, aTun: 0.16 },
  { z: -6.5, n: 34, size: 2.5, drift: 0.62, rise: 0.09, aSurf: 0.34, aTun: 0.30 },
  { z: 1.2, n: 24, size: 4.2, drift: 0.95, rise: 0.14, aSurf: 0.30, aTun: 0.40 },
  { z: 6.4, n: 13, size: 7.0, drift: 1.45, rise: 0.20, aSurf: 0.20, aTun: 0.26 },
];

/** 空气墙的几何：高度梯度落在 [groundRef-2.1, groundRef+6]，上面全留给天空。
 *  下边一路铺到 groundRef-35，地道那一段也要盖住。 */
const HAZE_H = 42.5;
const HAZE_TOP_OFF = 7.3;

// ---------------------------------------------------------------------------
// 2.5 胶片质感（AGENTS.md 6.2）
//
// 六项分开写、分开关（`cfg.film` 里任何一项置 0 就是关掉那一项；low 档整块关，
// 直接渲到屏幕，一个后处理 pass 都不跑）。顺序是有讲究的：
//   色差 → 辉光 → 色调分离 → 色调映射 → 暗角 → 颗粒
// 调色必须在**线性空间、色调映射之前**做，颗粒和暗角在**显示空间**做，
// 否则暗部的颗粒会被 ACES 压没、亮部反而炸出来。
//
// 红线：三档强度都刻意留得很轻。潜行游戏里看不清敌人视锥、看不清角色轮廓
// 就是设计事故——"电影感"不许买单可读性。每改一次强度都要重跑健康检查里的
// "画面有明暗层次 / 色调不单一 / 角色所在处有对比"三条。
// ---------------------------------------------------------------------------

/** 复刻 three r160 的 ACESFilmicToneMapping，一字不差。
 *  后处理接管之后主 pass 渲进 RenderTarget（three 对 RT 不做色调映射也不做
 *  sRGB 编码），所以这两步必须由我们自己补上，且必须跟原来完全一致，
 *  不然一开后处理整个画面的调子就变了。 */
const GLSL_TONEMAP = `
vec3 RRTAndODTFit(vec3 v) {
  vec3 a = v * (v + 0.0245786) - 0.000090537;
  vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081;
  return a / b;
}
vec3 ACESFilmic(vec3 color, float exposure) {
  const mat3 ACESInputMat = mat3(
    vec3(0.59719, 0.07600, 0.02840),
    vec3(0.35458, 0.90834, 0.13383),
    vec3(0.04823, 0.01566, 0.83777));
  const mat3 ACESOutputMat = mat3(
    vec3( 1.60475, -0.10208, -0.00327),
    vec3(-0.53108,  1.10813, -0.07276),
    vec3(-0.07276, -0.00605,  1.07602));
  color *= exposure / 0.6;
  color = ACESInputMat * color;
  color = RRTAndODTFit(color);
  color = ACESOutputMat * color;
  return clamp(color, 0.0, 1.0);
}
vec3 LinearToSRGB(vec3 v) {
  return mix(pow(v, vec3(0.41666)) * 1.055 - vec3(0.055), v * 12.92,
             vec3(lessThanEqual(v, vec3(0.0031308))));
}
`;

const FX_VERT = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

/** 亮部提取：**只要暖光**。冷月光不许发光——那是契约里点名的。 */
const FX_BRIGHT_FRAG = `
precision mediump float;
varying vec2 vUv;
uniform sampler2D tDiffuse;
uniform vec2 uTexel;
uniform float uThreshold;
void main() {
  vec3 c = texture2D(tDiffuse, vUv + vec2(-uTexel.x, -uTexel.y)).rgb
         + texture2D(tDiffuse, vUv + vec2( uTexel.x, -uTexel.y)).rgb
         + texture2D(tDiffuse, vUv + vec2(-uTexel.x,  uTexel.y)).rgb
         + texture2D(tDiffuse, vUv + vec2( uTexel.x,  uTexel.y)).rgb;
  c *= 0.25;
  float l = max(max(c.r, c.g), c.b);
  // 暖度：红比蓝多多少。油灯 / 马灯 / 火 才过得了这一关，月光过不了。
  float warm = clamp((c.r - c.b) * 2.6, 0.0, 1.0);
  float k = max(0.0, l - uThreshold) / max(1e-4, l);
  gl_FragColor = vec4(c * k * warm, 1.0);
}
`;

/** 可分离高斯，5 抽头。要柔要小，所以只走 1/4 分辨率、两趟。 */
const FX_BLUR_FRAG = `
precision mediump float;
varying vec2 vUv;
uniform sampler2D tDiffuse;
uniform vec2 uDir;
void main() {
  vec3 s = texture2D(tDiffuse, vUv).rgb * 0.2270270;
  s += texture2D(tDiffuse, vUv + uDir * 1.3846154).rgb * 0.3162162;
  s += texture2D(tDiffuse, vUv - uDir * 1.3846154).rgb * 0.3162162;
  s += texture2D(tDiffuse, vUv + uDir * 3.2307692).rgb * 0.0702703;
  s += texture2D(tDiffuse, vUv - uDir * 3.2307692).rgb * 0.0702703;
  gl_FragColor = vec4(s, 1.0);
}
`;

const FX_COMPOSITE_FRAG = `
precision highp float;
varying vec2 vUv;
uniform sampler2D tDiffuse;
uniform sampler2D tBloom;
uniform vec2 uResolution;
uniform float uTime;
uniform float uExposure;
uniform float uCA;
uniform float uBloom;
uniform vec2 uGrain;        // x 暗部量, y 亮部量
uniform vec3 uShadowTint;
uniform vec3 uHighTint;
uniform vec2 uSplit;        // x 暗部强度, y 亮部强度
uniform vec2 uVig;          // x 强度, y 起始半径
${GLSL_TONEMAP}
const vec3 LUMA = vec3(0.2126, 0.7152, 0.0722);
float Hash21(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}
void main() {
  vec2 uv = vUv;
  vec2 d = uv - 0.5;
  float r2 = clamp(dot(d, d) * 4.0, 0.0, 2.0);   // 0 中心，1 上下边中点

  // ── 1. 轻微色差：只在边缘，中心完全干净。r2 权重保证 ≤1px。
  vec3 col;
  if (uCA > 0.0001) {
    vec2 off = d * (uCA / uResolution.x) * r2 * 2.0;
    col.r = texture2D(tDiffuse, uv + off).r;
    col.g = texture2D(tDiffuse, uv).g;
    col.b = texture2D(tDiffuse, uv - off).b;
  } else {
    col = texture2D(tDiffuse, uv).rgb;
  }

  // ── 2. 暖光辉光：线性空间相加（辉光是光，必须在色调映射之前进来）
  if (uBloom > 0.0001) col += texture2D(tBloom, uv).rgb * uBloom;

  // ── 3. 色调映射（接管 three 的那一步）
  vec3 m = ACESFilmic(col, uExposure);

  // ── 4. 色调分离：暗部压冷、亮部推暖。
  //   **必须在色调映射之后做。** 这是一部通篇夜景的游戏，线性值几乎全落在
  //   0.001~0.05，在线性空间里"按亮度分暗部/亮部"等于整幅图都是暗部，
  //   色调分离退化成一层糊满全屏的蓝，土层直接被压黑（试过，一眼就废）。
  //   显示空间里明度才真的铺开 0..1，暗部/亮部才分得开。
  //   两个 tint 都在 CPU 侧归一化到明度 1，所以这一步**只改色相不改明暗**，
  //   "村庄 > 天空 > 土层"的序位不会被调色推翻。
  float l = dot(m, LUMA);
  float sw = pow(1.0 - clamp(l * 1.30, 0.0, 1.0), 2.0);
  float hw = smoothstep(0.30, 0.92, l);
  m *= mix(vec3(1.0), uShadowTint, sw * uSplit.x);
  m *= mix(vec3(1.0), uHighTint, hw * uSplit.y);

  // ── 5. 暗角：显示空间乘，最柔
  m *= 1.0 - uVig.x * smoothstep(uVig.y, 1.45, r2);

  // ── 6. 胶片颗粒：动态 + 按亮度加权。
  //   银盐的颗粒密度在中低调最高、在高光处最低，纯黑处也压得住——所以权重是
  //   一条"低调抬起来、高光压下去"的曲线，不是简单的 1-luma。
  //   直接用 1-luma 的话夜空（几乎纯黑）会变成一屏电视雪花，那是脏屏幕不是胶片。
  if (uGrain.x > 0.0001) {
    float lm = clamp(l, 0.0, 1.0);
    float w = mix(0.45, 1.0, smoothstep(0.0, 0.24, lm)) * mix(1.0, 0.30, smoothstep(0.40, 1.0, lm));
    float amt = mix(uGrain.x, uGrain.y, lm) * w;
    // 每秒 24 格：跟胶片一个节奏，而且比逐帧跳更稳、更像"片子"
    float frame = floor(uTime * 24.0);
    vec2 gp = floor(gl_FragCoord.xy) + vec2(frame * 37.13, frame * 61.71);
    float n = Hash21(gp) + Hash21(gp * 1.37 + 11.3) - 1.0;
    m += n * amt;
  }

  gl_FragColor = vec4(LinearToSRGB(clamp(m, 0.0, 1.0)), 1.0);
}
`;

/** 拖影：把上一帧按 alpha 盖回来。只在 timeScale<1 的"放慢"瞬间开。 */
const FX_TRAIL_FRAG = `
precision mediump float;
varying vec2 vUv;
uniform sampler2D tDiffuse;
uniform float uAmount;
void main() {
  gl_FragColor = vec4(texture2D(tDiffuse, vUv).rgb, uAmount);
}
`;

/** 道具默认 z（关卡没给 z 时用）。可互动的一律拉到 PLAY。 */
const PROP_DEFAULT_Z = {
  house: -2.2, wall: -1.2, fence: -0.8, tree: -1.4, sign: -0.3,
  corpse: -0.4, trough: -0.5, cart: -0.4, kang: -1.6, stove: -1.4,
};

/** 敌人 kind → Actor rig kind。
 *
 *  漏登记一个 kind 不会报错，只会**静默**退回 fallback。puppet（汤丙会）
 *  就栽在这上面：没有条目 → 退成 'soldier' → 伪军队长长得跟日军一模一样，
 *  "内部的敌人"这个角色当场作废，山田让他走前头的层级关系也读不出来。
 *  新增敌人 kind 时先在这里登记；健康检查会拿 RigKindFor 逐个核对。 */
const ENEMY_RIG = {
  search: 'soldier', guard: 'soldier', dog: 'dog', officer: 'officer', puppet: 'puppet',
};
/** 敌人 kind 没登记时退回哪个 rig。只是兜底，不是设计。 */
const ENEMY_RIG_FALLBACK = 'soldier';
/** NPC role → Actor rig kind。 */
const NPC_RIG = { villager: 'villager', child: 'child', elder: 'elder', militia: 'villager' };

// ---------------------------------------------------------------------------
// 1. 确定性噪声（禁止 Math.random）
// ---------------------------------------------------------------------------

function Hash1(n) {
  const s = Math.sin(n * 127.1) * 43758.5453123;
  return s - Math.floor(s);
}

function Hash2(x, y) {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123;
  return s - Math.floor(s);
}

function Smooth5(t) { return t * t * (3 - 2 * t); }

/** 二维值噪声，返回 0..1。纯确定性。 */
function ValueNoise2(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = Smooth5(x - xi), yf = Smooth5(y - yi);
  const a = Hash2(xi, yi), b = Hash2(xi + 1, yi);
  const c = Hash2(xi, yi + 1), d = Hash2(xi + 1, yi + 1);
  return (a + (b - a) * xf) + ((c + (d - c) * xf) - (a + (b - a) * xf)) * yf;
}

function Fbm2(x, y, octaves) {
  let sum = 0, amp = 0.5, f = 1;
  for (let i = 0; i < octaves; i++) { sum += ValueNoise2(x * f, y * f) * amp; amp *= 0.5; f *= 2.03; }
  return sum * 2;
}

/** 从字符串取一个稳定 seed。 */
function StrSeed(s) {
  let h = 2166136261;
  const str = String(s == null ? '' : s);
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0) / 4294967296;
}

/** 建造期用的确定性 rng（不是 Math.random）。 */
function MakeRng(seed) {
  let s = Math.floor(seed * 2147483647) || 12345;
  return function () {
    s ^= s << 13; s |= 0;
    s ^= s >>> 17;
    s ^= s << 5; s |= 0;
    return ((s >>> 0) % 1000003) / 1000003;
  };
}

// ---------------------------------------------------------------------------
// 2. CanvasTexture 工厂（带缓存，尺寸随画质）
// ---------------------------------------------------------------------------

const TEX_DRAW = {
  // 土墙 / 土坯：斑驳 + 裂纹
  mud(c, s) {
    const g = c.getContext('2d');
    g.fillStyle = '#9a8264'; g.fillRect(0, 0, s, s);
    const r = MakeRng(0.11);
    for (let i = 0; i < s * 3; i++) {
      const x = r() * s, y = r() * s, w = 2 + r() * s * 0.11;
      const v = 0.72 + r() * 0.45;
      g.fillStyle = `rgba(${(150 * v) | 0},${(126 * v) | 0},${(96 * v) | 0},0.5)`;
      g.fillRect(x, y, w, w * (0.4 + r() * 0.9));
    }
    g.strokeStyle = 'rgba(60,46,32,0.42)'; g.lineWidth = Math.max(1, s / 128);
    for (let i = 0; i < 9; i++) {
      g.beginPath();
      let x = r() * s, y = r() * s; g.moveTo(x, y);
      for (let k = 0; k < 4; k++) { x += (r() - 0.5) * s * 0.3; y += (r() - 0.5) * s * 0.3; g.lineTo(x, y); }
      g.stroke();
    }
  },
  // 木纹
  wood(c, s) {
    const g = c.getContext('2d');
    g.fillStyle = '#8a6540'; g.fillRect(0, 0, s, s);
    const r = MakeRng(0.27);
    for (let i = 0; i < 26; i++) {
      const y = r() * s, h = 1 + r() * s * 0.05, v = 0.6 + r() * 0.5;
      g.fillStyle = `rgba(${(96 * v) | 0},${(66 * v) | 0},${(40 * v) | 0},0.55)`;
      g.beginPath();
      g.moveTo(0, y);
      for (let x = 0; x <= s; x += s / 8) g.lineTo(x, y + Math.sin(x * 0.05 + i) * s * 0.02);
      g.lineTo(s, y + h);
      for (let x = s; x >= 0; x -= s / 8) g.lineTo(x, y + h + Math.sin(x * 0.05 + i) * s * 0.02);
      g.closePath(); g.fill();
    }
    for (let i = 0; i < 3; i++) {
      const x = r() * s, y = r() * s, rad = s * (0.02 + r() * 0.03);
      g.fillStyle = 'rgba(58,38,22,0.7)';
      g.beginPath(); g.ellipse(x, y, rad, rad * 1.5, 0, 0, 6.3); g.fill();
    }
  },
  // 瓦（硬山顶的青瓦）
  tile(c, s) {
    const g = c.getContext('2d');
    g.fillStyle = '#5b5f68'; g.fillRect(0, 0, s, s);
    const rows = 8, cols = 8;
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
      const v = 0.78 + Hash2(i, j) * 0.5;
      g.fillStyle = `rgba(${(84 * v) | 0},${(88 * v) | 0},${(98 * v) | 0},1)`;
      const x = (i + (j % 2) * 0.5) * (s / cols), y = j * (s / rows);
      g.beginPath();
      g.ellipse(x + s / cols / 2, y + s / rows / 2, s / cols * 0.52, s / rows * 0.42, 0, 0, 6.3);
      g.fill();
    }
    g.strokeStyle = 'rgba(24,26,32,0.55)'; g.lineWidth = Math.max(1, s / 100);
    for (let j = 0; j <= rows; j++) { g.beginPath(); g.moveTo(0, j * s / rows); g.lineTo(s, j * s / rows); g.stroke(); }
  },
  // 石 / 砖
  stone(c, s) {
    const g = c.getContext('2d');
    g.fillStyle = '#787a80'; g.fillRect(0, 0, s, s);
    const r = MakeRng(0.53);
    const rows = 5;
    for (let j = 0; j < rows; j++) {
      let x = -r() * s * 0.4;
      while (x < s) {
        const w = s * (0.16 + r() * 0.2), h = s / rows;
        const v = 0.74 + r() * 0.5;
        g.fillStyle = `rgba(${(122 * v) | 0},${(122 * v) | 0},${(126 * v) | 0},1)`;
        g.fillRect(x + 1, j * h + 1, w - 2, h - 2);
        x += w;
      }
    }
  },
  // 柴 / 茅草
  thatch(c, s) {
    const g = c.getContext('2d');
    g.fillStyle = '#7d6a3c'; g.fillRect(0, 0, s, s);
    const r = MakeRng(0.71);
    g.lineWidth = Math.max(1, s / 110);
    for (let i = 0; i < s * 2.2; i++) {
      const x = r() * s, y = r() * s, len = s * (0.06 + r() * 0.16), a = -1.3 + (r() - 0.5) * 0.8;
      const v = 0.6 + r() * 0.75;
      g.strokeStyle = `rgba(${(160 * v) | 0},${(134 * v) | 0},${(72 * v) | 0},0.85)`;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len); g.stroke();
    }
  },
  // 地下土层剖面（顶点色决定色调，这里只给颗粒）
  earth(c, s) {
    const g = c.getContext('2d');
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, s, s);
    const r = MakeRng(0.37);
    for (let i = 0; i < s * 5; i++) {
      const x = r() * s, y = r() * s, w = 1 + r() * s * 0.035;
      const v = 0.62 + r() * 0.55;
      g.fillStyle = `rgba(${(255 * v) | 0},${(248 * v) | 0},${(238 * v) | 0},0.42)`;
      g.fillRect(x, y, w, w * (0.5 + r() * 1.2));
    }
    // 一锨一锨挖出来的横向刮痕
    g.strokeStyle = 'rgba(150,130,110,0.28)'; g.lineWidth = Math.max(1, s / 128);
    for (let i = 0; i < 22; i++) {
      const y = r() * s;
      g.beginPath(); g.moveTo(0, y);
      for (let x = 0; x <= s; x += s / 10) g.lineTo(x, y + Math.sin(x * 0.08 + i * 2.3) * s * 0.012);
      g.stroke();
    }
  },
  // 窗纸 / 麻布
  paper(c, s) {
    const g = c.getContext('2d');
    g.fillStyle = '#e8d6ab'; g.fillRect(0, 0, s, s);
    const r = MakeRng(0.91);
    for (let i = 0; i < s; i++) {
      const x = r() * s, y = r() * s, v = 0.85 + r() * 0.25;
      g.fillStyle = `rgba(${(214 * v) | 0},${(190 * v) | 0},${(148 * v) | 0},0.5)`;
      g.fillRect(x, y, 2, 2);
    }
  },
  // 毒烟 / 尘的滚动噪声
  noise(c, s) {
    const g = c.getContext('2d');
    const img = g.createImageData(s, s);
    for (let j = 0; j < s; j++) for (let i = 0; i < s; i++) {
      const n = Fbm2(i / s * 4.0, j / s * 4.0, 4);
      const k = (j * s + i) * 4;
      const v = Clamp(n * 210, 0, 255) | 0;
      img.data[k] = 255; img.data[k + 1] = 255; img.data[k + 2] = 255;
      // 边缘往中间收，避免层与层之间出现硬边
      const ex = Math.min(i, s - 1 - i) / (s * 0.22);
      const ey = Math.min(j, s - 1 - j) / (s * 0.22);
      img.data[k + 3] = (v * Clamp(ex, 0, 1) * Clamp(ey, 0, 1)) | 0;
    }
    g.putImageData(img, 0, 0);
  },
  // 水面焦散条纹
  water(c, s) {
    const g = c.getContext('2d');
    g.fillStyle = 'rgba(255,255,255,0)'; g.fillRect(0, 0, s, s);
    for (let j = 0; j < s; j++) for (let i = 0; i < s; i++) {
      const n = ValueNoise2(i / s * 6, j / s * 2.2);
      if (n > 0.68) {
        g.fillStyle = `rgba(255,255,255,${((n - 0.68) * 2.2).toFixed(3)})`;
        g.fillRect(i, j, 1, 1);
      }
    }
  },
  // 径向柔光（灯晕 / 粒子 / 互动光晕）
  glow(c, s) {
    const g = c.getContext('2d');
    const grd = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    grd.addColorStop(0.0, 'rgba(255,255,255,1)');
    grd.addColorStop(0.28, 'rgba(255,255,255,0.55)');
    grd.addColorStop(0.62, 'rgba(255,255,255,0.14)');
    grd.addColorStop(1.0, 'rgba(255,255,255,0)');
    g.fillStyle = grd; g.fillRect(0, 0, s, s);
  },
  // 曾经有一张 ring 贴图，专给可互动道具套一圈光环。删掉了：
  // 一屏二十几个可互动物同时套圈，读出来是"一串橙甜甜圈"，比角色还抢眼，
  // 而且"圈"是游戏 UI 的语言不是电影的语言。现在互动提示改用 glow
  // （底部地面反光 + 被主体挡掉核心的边缘提亮），见 UpdateHalos。
  // 光柱（通气孔 / 枪眼漏下来的光）
  shaft(c, s) {
    const g = c.getContext('2d');
    for (let j = 0; j < s; j++) {
      const t = j / (s - 1);
      const a = (1 - t) * (1 - t) * 0.9;
      const grd = g.createLinearGradient(0, 0, s, 0);
      grd.addColorStop(0.0, 'rgba(255,255,255,0)');
      grd.addColorStop(0.5, `rgba(255,255,255,${a.toFixed(3)})`);
      grd.addColorStop(1.0, 'rgba(255,255,255,0)');
      g.fillStyle = grd; g.fillRect(0, j, s, 1);
    }
  },
  // 招牌上的墨迹（抽象笔触，不写具体字）
  sign(c, s) {
    const g = c.getContext('2d');
    g.fillStyle = '#a98a5f'; g.fillRect(0, 0, s, s);
    const r = MakeRng(0.44);
    g.strokeStyle = 'rgba(28,20,14,0.85)';
    for (let i = 0; i < 3; i++) {
      const cx = s * (0.22 + i * 0.28);
      g.lineWidth = s * 0.05;
      g.beginPath(); g.moveTo(cx - s * 0.09, s * 0.3); g.lineTo(cx + s * 0.09, s * 0.3); g.stroke();
      g.beginPath(); g.moveTo(cx, s * 0.24); g.lineTo(cx, s * 0.72); g.stroke();
      g.beginPath(); g.moveTo(cx - s * 0.08, s * 0.55 + r() * s * 0.06); g.lineTo(cx + s * 0.08, s * 0.55); g.stroke();
    }
  },
  // 天幕渐变
  sky(c, s) {
    const g = c.getContext('2d');
    const grd = g.createLinearGradient(0, 0, 0, s);
    grd.addColorStop(0.00, 'rgba(255,255,255,0.02)');
    grd.addColorStop(0.42, 'rgba(255,255,255,0.16)');
    grd.addColorStop(0.74, 'rgba(255,255,255,0.48)');
    grd.addColorStop(1.00, 'rgba(255,255,255,0.86)');
    g.fillStyle = grd; g.fillRect(0, 0, s, s);
  },
  // 空气墙的高度梯度：贴地最厚，往上迅速消失。
  //
  // 这张图是"能不能把大气透视加狠"的全部关键。以前三道空气墙是均匀的板，
  // 它们盖在天幕前面，加厚就等于把天空一起洗掉（实测 0.30/0.19/0.10 时
  // 远山和天空只差 2 级亮度，五层里真正有厚度的只剩两层）。
  // 换成高度梯度之后，洗的是地平线附近的景物，天空一点不碰——而且这才是
  // 真实的大气透视：雾在地面附近最浓，山顶总是先露出来。
  //
  // 归零点是量出来的，不是拍的。第一版放到 groundRef+9，实测把"天空带"
  // 整条抬亮 0.6 级，「村庄 > 天空 > 土层」这条明度序位当场翻过来。
  // 现在 groundRef+6 以上就是 0，满强度收在地平线下面。
  haze(c, s) {
    const g = c.getContext('2d');
    const grd = g.createLinearGradient(0, 0, 0, s);
    grd.addColorStop(0.00, 'rgba(255,255,255,0)');
    grd.addColorStop(0.03, 'rgba(255,255,255,0)');
    grd.addColorStop(0.09, 'rgba(255,255,255,0.30)');
    grd.addColorStop(0.16, 'rgba(255,255,255,0.86)');
    grd.addColorStop(0.22, 'rgba(255,255,255,1)');
    grd.addColorStop(1.00, 'rgba(255,255,255,1)');
    g.fillStyle = grd; g.fillRect(0, 0, s, s);
  },
  // 贴地的一层薄雾。空气墙管"整片背景往雾色收"，这一条管"地平线上有一道
  // 亮带把中景和远景切开"——《勇敢的心》里最常用的一招，也是真实的夜雾：
  // 它只有一米来厚，贴着地面浮，村舍的脚全泡在里面。
  // 上边收得很干净（不许爬进天空），下边一路铺满（反正被台面挡住）。
  mist(c, s) {
    const g = c.getContext('2d');
    const grd = g.createLinearGradient(0, 0, 0, s);
    grd.addColorStop(0.00, 'rgba(255,255,255,0)');
    grd.addColorStop(0.30, 'rgba(255,255,255,0.16)');
    grd.addColorStop(0.58, 'rgba(255,255,255,0.68)');
    grd.addColorStop(0.80, 'rgba(255,255,255,1)');
    grd.addColorStop(1.00, 'rgba(255,255,255,0.92)');
    g.fillStyle = grd; g.fillRect(0, 0, s, s);
  },
  // 烟团：径向柔边 + 团絮噪声。毒烟由一堆这种柔边团组成，绝不能出现直边。
  smoke(c, s) {
    const g = c.getContext('2d');
    const img = g.createImageData(s, s);
    const half = s / 2;
    for (let j = 0; j < s; j++) {
      for (let i = 0; i < s; i++) {
        const dx = (i - half) / half, dy = (j - half) / half;
        const d = Math.sqrt(dx * dx + dy * dy);
        // 团絮：让边缘不是完美圆，读起来才像烟不像光斑
        const lump = 0.72 + Fbm2(i / s * 3.4, j / s * 3.4, 3) * 0.42;
        const fall = Clamp(1 - d / lump, 0, 1);
        const a = fall * fall * (0.55 + Fbm2(i / s * 6.1 + 11, j / s * 6.1, 2) * 0.55);
        const k = (j * s + i) * 4;
        img.data[k] = 255; img.data[k + 1] = 255; img.data[k + 2] = 255;
        img.data[k + 3] = Clamp(a * 255, 0, 255) | 0;
      }
    }
    g.putImageData(img, 0, 0);
  },
  // 暗角：中心全透明、边缘不透明。地下用它把远处的实心土压下去。
  vignette(c, s) {
    const g = c.getContext('2d');
    const grd = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    grd.addColorStop(0.00, 'rgba(255,255,255,0)');
    grd.addColorStop(0.34, 'rgba(255,255,255,0)');
    grd.addColorStop(0.62, 'rgba(255,255,255,0.42)');
    grd.addColorStop(0.86, 'rgba(255,255,255,0.86)');
    grd.addColorStop(1.00, 'rgba(255,255,255,1)');
    g.fillStyle = grd; g.fillRect(0, 0, s, s);
  },
};

// ---------------------------------------------------------------------------
// 3. 几何小工具（建造期用；返回已经摆好位置的 BufferGeometry）
// ---------------------------------------------------------------------------

function GBox(w, h, d, x, y, z, rz) {
  const g = new THREE.BoxGeometry(Math.max(1e-3, w), Math.max(1e-3, h), Math.max(1e-3, d));
  if (rz) g.rotateZ(rz);
  g.translate(x || 0, y || 0, z || 0);
  return g;
}

function GCylY(rTop, rBot, h, seg, x, y, z) {
  const g = new THREE.CylinderGeometry(rTop, rBot, h, Math.max(3, seg | 0), 1, false);
  g.translate(x || 0, y || 0, z || 0);
  return g;
}

/** 轴沿 Z 的圆柱：正视图里读作一个圆盘（碾磙、车轮、辘轳都靠它）。 */
function GCylZ(rTop, rBot, h, seg, x, y, z) {
  const g = new THREE.CylinderGeometry(rTop, rBot, h, Math.max(3, seg | 0), 1, false);
  g.rotateX(Math.PI / 2);
  g.translate(x || 0, y || 0, z || 0);
  return g;
}

/** 轴沿 X 的圆柱：横梁、水管。 */
function GCylX(rTop, rBot, h, seg, x, y, z) {
  const g = new THREE.CylinderGeometry(rTop, rBot, h, Math.max(3, seg | 0), 1, false);
  g.rotateZ(Math.PI / 2);
  g.translate(x || 0, y || 0, z || 0);
  return g;
}

function GSphere(r, seg, x, y, z, sy) {
  const g = new THREE.SphereGeometry(r, Math.max(4, seg | 0), Math.max(3, (seg / 2) | 0));
  if (sy && sy !== 1) g.scale(1, sy, 1);
  g.translate(x || 0, y || 0, z || 0);
  return g;
}

function GIco(r, detail, x, y, z, sx, sy, sz) {
  const g = new THREE.IcosahedronGeometry(r, detail | 0);
  g.scale(sx || 1, sy || 1, sz || 1);
  g.translate(x || 0, y || 0, z || 0);
  return g;
}

function GLathe(profile, seg, x, y, z) {
  const pts = [];
  for (let i = 0; i < profile.length; i += 2) pts.push(new THREE.Vector2(Math.max(1e-4, profile[i]), profile[i + 1]));
  const g = new THREE.LatheGeometry(pts, Math.max(4, seg | 0));
  g.translate(x || 0, y || 0, z || 0);
  return g;
}

/** 由 2D 多边形挤出的棱柱（三角山墙、土坡、剖面小件）。 */
function GPrism(poly2d, depth, x, y, z) {
  const shape = new THREE.Shape();
  shape.moveTo(poly2d[0], poly2d[1]);
  for (let i = 2; i < poly2d.length; i += 2) shape.lineTo(poly2d[i], poly2d[i + 1]);
  shape.closePath();
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 1 });
  g.translate(x || 0, y || 0, (z || 0) - depth / 2);
  return g;
}

function GQuad(w, h, x, y, z) {
  const g = new THREE.PlaneGeometry(Math.max(1e-3, w), Math.max(1e-3, h));
  g.translate(x || 0, y || 0, z || 0);
  return g;
}

/** 归一化到可合并的属性集：非索引 + position/normal/uv。 */
function NormalizeGeo(geo) {
  if (!geo || !geo.attributes || !geo.attributes.position) return null;
  let g = geo;
  if (g.index) { const n = g.toNonIndexed(); g.dispose(); g = n; }
  if (!g.attributes.normal) g.computeVertexNormals();
  if (!g.attributes.uv) {
    g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  }
  const keys = Object.keys(g.attributes);
  for (let i = 0; i < keys.length; i++) {
    const k = keys[i];
    if (k !== 'position' && k !== 'normal' && k !== 'uv') g.deleteAttribute(k);
  }
  g.morphAttributes = {};
  return g;
}

/**
 * 本地合并。输入保证已经被 NormalizeGeo 处理过：非索引、只有 position/normal/uv。
 * 只在拿不到 vendor 的 mergeGeometries 时用。
 */
function LocalMerge(list) {
  let total = 0;
  for (let i = 0; i < list.length; i++) total += list[i].attributes.position.count;
  if (total === 0) return null;
  const pos = new Float32Array(total * 3);
  const nor = new Float32Array(total * 3);
  const uv = new Float32Array(total * 2);
  let off = 0;
  for (let i = 0; i < list.length; i++) {
    const g = list[i];
    const pa = g.attributes.position, na = g.attributes.normal, ua = g.attributes.uv;
    const c = pa.count;
    for (let k = 0; k < c; k++) {
      const d3 = (off + k) * 3, d2 = (off + k) * 2;
      pos[d3] = pa.getX(k); pos[d3 + 1] = pa.getY(k); pos[d3 + 2] = pa.getZ(k);
      nor[d3] = na.getX(k); nor[d3 + 1] = na.getY(k); nor[d3 + 2] = na.getZ(k);
      uv[d2] = ua.getX(k); uv[d2 + 1] = ua.getY(k);
    }
    off += c;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return out;
}

/** 稳妥合并；失败返回 null（调用方降级为逐个 mesh）。 */
function SafeMerge(list) {
  if (!list || list.length === 0) return null;
  const norm = [];
  for (let i = 0; i < list.length; i++) {
    const g = NormalizeGeo(list[i]);
    if (g) norm.push(g);
  }
  if (norm.length === 0) return null;
  if (norm.length === 1) return norm[0];
  let merged = null;
  if (VendorMerge) { try { merged = VendorMerge(norm, false); } catch (e) { merged = null; } }
  if (!merged) { try { merged = LocalMerge(norm); } catch (e) { merged = null; } }
  if (!merged) return norm[0];
  for (let i = 0; i < norm.length; i++) norm[i].dispose();
  return merged;
}

// ---------------------------------------------------------------------------
// 4. 地下剖面：占用栅格 → marching squares → 平滑 → Shape + holes
// ---------------------------------------------------------------------------

// 求解规则：实心(土)在行进方向的左边 → 外轮廓 CCW，内洞 CW。
const MS_TABLE = [
  [], [0, 3], [1, 0], [1, 3], [2, 1], [0, 1, 2, 3], [2, 0], [2, 3],
  [3, 2], [0, 2], [3, 0, 1, 2], [1, 2], [3, 1], [0, 1], [3, 0], [],
];

function SignedArea(pts) {
  let a = 0;
  for (let i = 0, n = pts.length; i < n; i += 2) {
    const j = (i + 2) % n;
    a += pts[i] * pts[j + 1] - pts[j] * pts[i + 1];
  }
  return a * 0.5;
}

function PointInPoly(px, py, pts) {
  let inside = false;
  for (let i = 0, n = pts.length, j = n - 2; i < n; j = i, i += 2) {
    const xi = pts[i], yi = pts[i + 1], xj = pts[j], yj = pts[j + 1];
    if ((yi > py) !== (yj > py) && px < (xj - xi) * (py - yi) / (yj - yi + 1e-12) + xi) inside = !inside;
  }
  return inside;
}

/** Chaikin 角切（闭合曲线），把 marching squares 的锯齿变成手挖的圆润轮廓。 */
function ChaikinClosed(pts, ratio) {
  const n = pts.length;
  if (n < 8) return pts;
  const out = new Array(n * 2);
  const r = ratio, s = 1 - ratio;
  for (let i = 0, k = 0; i < n; i += 2) {
    const j = (i + 2) % n;
    const x0 = pts[i], y0 = pts[i + 1], x1 = pts[j], y1 = pts[j + 1];
    out[k++] = x0 * s + x1 * r; out[k++] = y0 * s + y1 * r;
    out[k++] = x0 * r + x1 * s; out[k++] = y0 * r + y1 * s;
  }
  return out;
}

/** 抽稀：距离太近或近似共线的点丢掉。 */
function Decimate(pts, minStep, angleEps) {
  const n = pts.length;
  if (n < 12) return pts;
  const out = [];
  let lx = pts[0], ly = pts[1];
  out.push(lx, ly);
  for (let i = 2; i < n; i += 2) {
    const x = pts[i], y = pts[i + 1];
    const dx = x - lx, dy = y - ly;
    if (dx * dx + dy * dy < minStep * minStep) {
      // 距离不够，但如果转角很大还是保留
      const j = (i + 2) % n;
      const ax = x - lx, ay = y - ly, bx = pts[j] - x, by = pts[j + 1] - y;
      const la = Math.hypot(ax, ay) + 1e-9, lb = Math.hypot(bx, by) + 1e-9;
      const dot = (ax * bx + ay * by) / (la * lb);
      if (dot > 1 - angleEps) continue;
    }
    out.push(x, y); lx = x; ly = y;
  }
  if (out.length < 12) return pts;
  return out;
}

/** 沿外法线加确定性扰动：让洞壁像人一锨锨挖的。 */
function Roughen(pts, amp, freq, phase) {
  const n = pts.length;
  const out = new Array(n);
  for (let i = 0; i < n; i += 2) {
    const p = (i - 2 + n) % n, q = (i + 2) % n;
    const tx = pts[q] - pts[p], ty = pts[q + 1] - pts[p + 1];
    const len = Math.hypot(tx, ty) + 1e-9;
    // 左法线（与 MS 的绕向一致 → 指向土体内部），取反得到指向洞内
    const nx = ty / len, ny = -tx / len;
    const x = pts[i], y = pts[i + 1];
    const d = (Fbm2(x * freq + phase, y * freq * 1.7 - phase, 3) - 1) * amp
      + Math.sin(x * 2.31 + y * 1.13 + phase * 3.0) * amp * 0.35;
    out[i] = x + nx * d; out[i + 1] = y + ny * d;
  }
  return out;
}

/**
 * 把关卡的地道占用栅格化，用 marching squares 抽出土体轮廓。
 * 返回 { contours:[pts], holes:[pts] }，坐标是世界 XY。
 */
function ExtractEarthOutline(level, cfg) {
  const b = level.bounds || {};
  const x0 = (typeof b.x0 === 'number' ? b.x0 : 0) - 6;
  const x1 = (typeof b.x1 === 'number' ? b.x1 : 120) + 6;
  const yBottom = (typeof b.yBottom === 'number' ? b.yBottom : -12) - 3;
  const floors = Array.isArray(level.floors) ? level.floors : [];
  const ceils = Array.isArray(level.ceils) ? level.ceils : [];
  const shafts = Array.isArray(level.shafts) ? level.shafts : [];

  // --- 地表线 groundY(x) ---
  const surf = [];
  let maxSurfY = 0, coveredLen = 0;
  for (let i = 0; i < floors.length; i++) {
    const f = floors[i];
    if (!f || typeof f.x0 !== 'number' || typeof f.x1 !== 'number' || typeof f.y !== 'number') continue;
    if (f.kind !== 'dirt' && f.kind !== 'stone') continue;
    if (f.y < -1.2 || f.y > 2.6) continue;
    surf.push(f); coveredLen += Math.max(0, f.x1 - f.x0);
    if (f.y > maxSurfY) maxSurfY = f.y;
  }
  const spanLen = Math.max(1, (b.x1 || 120) - (b.x0 || 0));
  const flatGround = coveredLen < spanLen * 0.25;  // 以地下为主的关卡：地表拍平，别乱挖沟
  const defaultGround = surf.length ? maxSurfY : 0;

  // 石板路的地方土面要让下去一层。正交时两者重合在一条看不见的线上无所谓；
  // 透视下台面顶面是实打实要画出来的，土面和石板同高就会打架出条纹。
  const PAVE_DROP = 0.16;
  function GroundY(x) {
    if (flatGround) return defaultGround;
    let best = -Infinity, drop = 0;
    for (let i = 0; i < surf.length; i++) {
      const f = surf[i];
      if (x >= f.x0 - 0.25 && x <= f.x1 + 0.25 && f.y > best) {
        best = f.y;
        drop = f.kind === 'stone' ? PAVE_DROP : 0;
      }
    }
    if (best === -Infinity) return defaultGround - 2.0;   // 没地板 = 沟 / 缺口
    return best - drop;
  }

  // --- 地道占用 ---
  const tunnels = [];
  for (let i = 0; i < floors.length; i++) {
    const f = floors[i];
    if (!f || f.kind !== 'tunnel') continue;
    if (typeof f.x0 !== 'number' || typeof f.x1 !== 'number' || typeof f.y !== 'number') continue;
    tunnels.push(f);
  }
  function CeilAt(x, fallback) {
    let best = Infinity;
    for (let i = 0; i < ceils.length; i++) {
      const c = ceils[i];
      if (!c || typeof c.y !== 'number') continue;
      if (x >= c.x0 - 0.05 && x <= c.x1 + 0.05 && c.y < best) best = c.y;
    }
    return best === Infinity ? fallback : best;
  }

  const shaftHalf = { ladder: 0.72, rope: 0.64, dirt: 0.82 };

  const cell = cfg.gridCell;
  const nx = Math.max(4, Math.ceil((x1 - x0) / cell) + 1);
  const ny = Math.max(4, Math.ceil((GroundY(x0) + 3 - yBottom) / cell) + 1);
  const yTopGrid = yBottom + (ny - 1) * cell;

  // 晶格取样：1 = 土（实心）
  const val = new Uint8Array(nx * ny);
  for (let j = 0; j < ny; j++) {
    const wy = yBottom + j * cell;
    for (let i = 0; i < nx; i++) {
      const wx = x0 + i * cell;
      // 四周留一圈"空"。土体必须严格落在栅格内部，它的轮廓才闭合得上——
      // 一旦实心区贴到栅格边界，marching squares 追出来的就是断链而不是闭环。
      if (i === 0 || i === nx - 1 || j === 0 || j === ny - 1) { val[j * nx + i] = 0; continue; }
      const gy = GroundY(wx) + Math.sin(wx * 0.63) * 0.07 + (ValueNoise2(wx * 0.31, 3.7) - 0.5) * 0.16;
      if (wy > gy) { val[j * nx + i] = 0; continue; }
      let solid = 1;
      for (let t = 0; t < tunnels.length; t++) {
        const f = tunnels[t];
        if (wx < f.x0 - 0.1 || wx > f.x1 + 0.1) continue;
        const top = CeilAt(wx, f.y + 2.05);
        if (wy >= f.y - 0.3 && wy <= top + 0.1) { solid = 0; break; }
      }
      if (solid) {
        for (let t = 0; t < shafts.length; t++) {
          const s = shafts[t];
          if (!s || typeof s.x !== 'number') continue;
          const hw = shaftHalf[s.kind] || 0.72;
          if (Math.abs(wx - s.x) > hw) continue;
          const sTop = Math.min(typeof s.yTop === 'number' ? s.yTop : 0, gy + 0.05);
          const sBot = typeof s.yBottom === 'number' ? s.yBottom : -8;
          if (wy >= Math.min(sBot, sTop) - 0.3 && wy <= Math.max(sBot, sTop) + 0.1) { solid = 0; break; }
        }
      }
      val[j * nx + i] = solid;
    }
  }

  // --- marching squares ---
  const nxny = nx * ny;
  const nextOf = new Map();
  const ptOf = new Map();

  function KeyH(i, j) { return j * nx + i; }
  function KeyV(i, j) { return nxny + j * nx + i; }
  function PosH(i, j) { return [x0 + (i + 0.5) * cell, yBottom + j * cell]; }
  function PosV(i, j) { return [x0 + i * cell, yBottom + (j + 0.5) * cell]; }

  for (let j = 0; j < ny - 1; j++) {
    for (let i = 0; i < nx - 1; i++) {
      const a = val[j * nx + i], bb = val[j * nx + i + 1];
      const c = val[(j + 1) * nx + i + 1], d = val[(j + 1) * nx + i];
      const code = a | (bb << 1) | (c << 2) | (d << 3);
      const segs = MS_TABLE[code];
      if (segs.length === 0) continue;
      for (let k = 0; k < segs.length; k += 2) {
        const eFrom = segs[k], eTo = segs[k + 1];
        const kf = eFrom === 0 ? KeyH(i, j) : eFrom === 1 ? KeyV(i + 1, j) : eFrom === 2 ? KeyH(i, j + 1) : KeyV(i, j);
        const kt = eTo === 0 ? KeyH(i, j) : eTo === 1 ? KeyV(i + 1, j) : eTo === 2 ? KeyH(i, j + 1) : KeyV(i, j);
        if (!ptOf.has(kf)) ptOf.set(kf, eFrom === 0 ? PosH(i, j) : eFrom === 1 ? PosV(i + 1, j) : eFrom === 2 ? PosH(i, j + 1) : PosV(i, j));
        if (!ptOf.has(kt)) ptOf.set(kt, eTo === 0 ? PosH(i, j) : eTo === 1 ? PosV(i + 1, j) : eTo === 2 ? PosH(i, j + 1) : PosV(i, j));
        if (!nextOf.has(kf)) nextOf.set(kf, kt);
      }
    }
  }

  const visited = new Set();
  const loops = [];
  nextOf.forEach(function (_v, startKey) {
    if (visited.has(startKey)) return;
    const pts = [];
    let k = startKey, guard = 0, closed = false;
    while (guard++ < 400000) {
      if (visited.has(k)) break;
      visited.add(k);
      const p = ptOf.get(k);
      if (!p) break;
      pts.push(p[0], p[1]);
      const n = nextOf.get(k);
      if (n === undefined) break;
      if (n === startKey) { closed = true; break; }
      k = n;
    }
    // 只接受真正闭合的环；断链一律丢掉（挤出时会炸）
    if (closed && pts.length >= 12) loops.push(pts);
  });

  // --- 平滑 + 抽稀 + 扰动 ---
  const processed = [];
  for (let i = 0; i < loops.length; i++) {
    let p = loops[i];
    const area = SignedArea(p);
    if (Math.abs(area) < 0.45) continue;
    const iterations = cfg.chaikin;
    for (let t = 0; t < iterations; t++) p = ChaikinClosed(p, 0.26);
    p = Decimate(p, cell * 0.85, 0.0016);
    const isHole = area < 0;
    // Chaikin 把边缘磨成了圆角，整块土读起来像一条肥皂。土是一锨锨挖出来的，
    // 边缘必须是碎的 —— 外轮廓的扰动幅度和频率都要够，才有"挖"的手感。
    p = Roughen(p, isHole ? 0.135 : 0.155, isHole ? 0.55 : 0.85, isHole ? 11.3 : 3.1);
    processed.push({ pts: p, area: SignedArea(p) });
  }

  // --- 轮廓 / 洞分类（按嵌套深度，偶数层是土体外轮廓）---
  const contours = [], holes = [];
  for (let i = 0; i < processed.length; i++) {
    let depth = 0;
    const px = processed[i].pts[0], py = processed[i].pts[1];
    for (let j = 0; j < processed.length; j++) {
      if (i === j) continue;
      if (PointInPoly(px, py, processed[j].pts)) depth++;
    }
    if (depth % 2 === 0) contours.push(processed[i]); else holes.push(processed[i]);
  }
  // 洞归属到面积最小的包含它的轮廓
  for (let i = 0; i < contours.length; i++) contours[i].holes = [];
  for (let h = 0; h < holes.length; h++) {
    let best = -1, bestArea = Infinity;
    const px = holes[h].pts[0], py = holes[h].pts[1];
    for (let c = 0; c < contours.length; c++) {
      if (!PointInPoly(px, py, contours[c].pts)) continue;
      const a = Math.abs(contours[c].area);
      if (a < bestArea) { bestArea = a; best = c; }
    }
    if (best >= 0) contours[best].holes.push(holes[h].pts);
  }
  return { contours, groundY: GroundY, defaultGround, yTopGrid, x0, x1, yBottom };
}

/** 从轮廓点集造 THREE.Shape。 */
function ShapeFromLoop(pts, holeList) {
  const shape = new THREE.Shape();
  shape.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) shape.lineTo(pts[i], pts[i + 1]);
  shape.closePath();
  if (holeList) {
    for (let h = 0; h < holeList.length; h++) {
      const hp = holeList[h];
      const path = new THREE.Path();
      path.moveTo(hp[0], hp[1]);
      for (let i = 2; i < hp.length; i += 2) path.lineTo(hp[i], hp[i + 1]);
      path.closePath();
      shape.holes.push(path);
    }
  }
  return shape;
}

/** 按 y 分带 + 按 z 加深的土层顶点色（黑土 → 黄土 → 沙土）。 */
function PaintEarthStrata(geo, groundRef, frontZ, backZ) {
  const pos = geo.attributes.position;
  const n = pos.count;
  const arr = new Float32Array(n * 3);
  const topSoil = [0.20, 0.155, 0.115];
  const loess = [0.44, 0.305, 0.165];
  const clay = [0.36, 0.215, 0.125];
  const sand = [0.47, 0.415, 0.315];
  for (let i = 0; i < n; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const depth = groundRef - y;
    // 层界带确定性起伏，别是直线
    const w1 = 0.85 + (ValueNoise2(x * 0.09, 1.7) - 0.5) * 0.9;
    const w2 = 2.9 + (ValueNoise2(x * 0.07, 5.1) - 0.5) * 1.5;
    const w3 = 6.4 + (ValueNoise2(x * 0.05, 9.3) - 0.5) * 2.0;
    let r, g, b;
    if (depth < w1) {
      const t = Clamp(depth / Math.max(0.2, w1), 0, 1);
      r = Lerp(topSoil[0], loess[0], t); g = Lerp(topSoil[1], loess[1], t); b = Lerp(topSoil[2], loess[2], t);
    } else if (depth < w2) {
      const t = Clamp((depth - w1) / Math.max(0.2, w2 - w1), 0, 1);
      r = Lerp(loess[0], clay[0], t); g = Lerp(loess[1], clay[1], t); b = Lerp(loess[2], clay[2], t);
    } else {
      const t = Clamp((depth - w2) / Math.max(0.2, w3 - w2), 0, 1);
      r = Lerp(clay[0], sand[0], t); g = Lerp(clay[1], sand[1], t); b = Lerp(clay[2], sand[2], t);
    }
    // 斑驳
    const sp = 0.86 + Fbm2(x * 0.7, y * 0.7, 2) * 0.28;
    // 假 AO：越往里越暗，坑道壁自然向深处沉下去
    const zt = Clamp((z - backZ) / Math.max(0.5, frontZ - backZ), 0, 1);
    const ao = 0.30 + 0.70 * (zt * zt);
    // 整体压暗：土是"地下"的东西，站在地表时它不该跟被月光直照的墙一样亮。
    // 靠近地表的一薄层留亮些，好让 bevel 把地平线那道边勾出来。
    const dim = Lerp(0.80, 0.42, Clamp(depth / 3.2, 0, 1));
    const k = sp * ao * dim;
    arr[i * 3] = r * k; arr[i * 3 + 1] = g * k; arr[i * 3 + 2] = b * k;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
}

// ---------------------------------------------------------------------------
// 5. Actor 模块的防御性包装（动画层可能缺失 / 抛错，绝不许黑屏）
// ---------------------------------------------------------------------------

const ActorApi = {
  ok: true,
  bellOk: true,
  Create: typeof ActorModule.CreateActorRig === 'function' ? ActorModule.CreateActorRig : null,
  Pose: typeof ActorModule.PoseActor === 'function' ? ActorModule.PoseActor : null,
  Dispose: typeof ActorModule.DisposeRig === 'function' ? ActorModule.DisposeRig : null,
  CreateBell: typeof ActorModule.CreateBellRig === 'function' ? ActorModule.CreateBellRig : null,
  PoseBell: typeof ActorModule.PoseBell === 'function' ? ActorModule.PoseBell : null,
};

const RIG_HEIGHT = { laozhong: 1.70, chuanbao: 1.72, villager: 1.66, child: 1.18, elder: 1.58, soldier: 1.70, officer: 1.72, puppet: 1.71, dog: 0.72 };

function FallbackRig(kind, mat) {
  const group = new THREE.Group();
  const h = RIG_HEIGHT[kind] || 1.68;
  const geo = kind === 'dog'
    ? SafeMerge([GBox(0.95, 0.36, 0.3, 0, 0.42, 0), GBox(0.3, 0.28, 0.26, 0.52, 0.62, 0), GBox(0.1, 0.4, 0.1, -0.3, 0.2, 0), GBox(0.1, 0.4, 0.1, 0.3, 0.2, 0)])
    : SafeMerge([GBox(0.46, h * 0.52, 0.3, 0, h * 0.62, 0), GSphere(0.155, 8, 0, h * 0.92, 0), GBox(0.16, h * 0.42, 0.16, -0.11, h * 0.2, 0), GBox(0.16, h * 0.42, 0.16, 0.11, h * 0.2, 0)]);
  const mesh = new THREE.Mesh(geo || new THREE.BoxGeometry(0.4, h, 0.3), mat);
  group.add(mesh);
  return { group, joints: {}, kind, height: h, __fallback: true, __geo: geo };
}

function MakeRig(kind, fallbackMat) {
  if (ActorApi.ok && ActorApi.Create) {
    try {
      const rig = ActorApi.Create(kind, THREE);
      if (rig && rig.group && rig.group.isObject3D) return rig;
    } catch (e) {
      ActorApi.ok = false;
      if (typeof console !== 'undefined') console.warn('[Render] Script_Actor.CreateActorRig 失败，降级为占位剪影。', e);
    }
  }
  return FallbackRig(kind, fallbackMat);
}

// ---------------------------------------------------------------------------
// 5.1 角色轮廓边光（契约 6.1：深色主体 + 轮廓边光）
// ---------------------------------------------------------------------------
// 夜里地表没有暖光源，深色角色贴在同样暗的背景上是零对比 —— 实测只能靠头上
// 那块白毛巾找到人。这里给角色材质补一层视角相关的边光：正交相机看向 -Z，
// 所以"法线越偏离 Z 轴"就越靠近轮廓，用它当 rim 因子最稳。
// 顺带给每种 kind 一个乘色，8 种角色不再只分得出 3 类。
//
// 边光强度是全局共享 uniform（一个对象喂给所有材质），Sync 里改一次就全体生效，
// 每帧零分配。

/** kind → [tintR, tintG, tintB, rimScale]。 */
const KIND_TINT = {
  laozhong: [1.06, 1.02, 0.94, 1.15],
  chuanbao: [1.00, 1.02, 1.02, 1.15],
  villager: [0.80, 0.84, 0.96, 0.85],
  child: [1.10, 0.98, 0.80, 1.05],
  elder: [0.96, 0.94, 0.90, 0.95],
  soldier: [0.74, 0.86, 0.70, 0.80],
  officer: [0.70, 0.78, 0.94, 1.20],
  // 汤丙会：全场最暖的一个，土黄偏灰褐——比日军的冷绿黄，比村民的青蓝暖。
  // 缺条目会拿到默认 [1,1,1,1] + rimScale 1，他反而比所有人亮一档、边光最重，
  // 一个"矮半头的伪军"变成画面里最抢眼的人，正好读反。
  puppet: [0.94, 0.85, 0.66, 0.92],
  dog: [0.92, 0.80, 0.66, 0.80],
};

const rimUniform = { value: new THREE.Color(0.55, 0.68, 0.92) };
const rimPowerUniform = { value: 0.55 };
const patchedActorMats = new WeakSet();

function PatchActorMaterial(mat, kind) {
  if (!mat || patchedActorMats.has(mat)) return;
  patchedActorMats.add(mat);
  const tint = KIND_TINT[kind] || [1, 1, 1, 1];
  try {
    mat.onBeforeCompile = function (shader) {
      shader.uniforms.uRimColor = rimUniform;
      shader.uniforms.uRimStrength = rimPowerUniform;
      shader.uniforms.uKindTint = { value: new THREE.Vector3(tint[0], tint[1], tint[2]) };
      shader.uniforms.uRimScale = { value: tint[3] };
      shader.fragmentShader = shader.fragmentShader
        .replace('void main() {', 'uniform vec3 uRimColor;\nuniform float uRimStrength;\nuniform vec3 uKindTint;\nuniform float uRimScale;\nvoid main() {')
        .replace(
          '#include <opaque_fragment>',
          'outgoingLight *= uKindTint;\n' +
          'float tbRim = 1.0 - abs(normalize(normal).z);\n' +
          'outgoingLight += uRimColor * pow(clamp(tbRim, 0.0, 1.0), 3.4) * uRimStrength * uRimScale;\n' +
          '#include <opaque_fragment>'
        );
    };
    // 不给 cacheKey 的话 three 会把"没打补丁"的 program 直接复用过来
    mat.customProgramCacheKey = function () { return 'tbActorRim'; };
    mat.needsUpdate = true;
  } catch (e) {
    if (typeof console !== 'undefined') console.warn('[Render] 角色边光补丁失败，按原样渲染。', e);
  }
}

/** 给一个 rig 的所有材质打边光补丁（材质按 kind 共享，补丁只打一次）。 */
function ApplyRimLight(rig) {
  if (!rig || !rig.group) return;
  const kind = rig.kind || 'villager';
  rig.group.traverse(function (o) {
    if (!o.isMesh || !o.material) return;
    if (Array.isArray(o.material)) {
      for (let i = 0; i < o.material.length; i++) PatchActorMaterial(o.material[i], kind);
    } else {
      PatchActorMaterial(o.material, kind);
    }
  });
}

function PoseRig(rig, anim, facing, time) {
  if (!rig) return;
  if (rig.__fallback || !ActorApi.ok || !ActorApi.Pose) {
    rig.group.rotation.y = facing < 0 ? Math.PI : 0;
    return;
  }
  try { ActorApi.Pose(rig, anim, facing, time); }
  catch (e) {
    ActorApi.ok = false;
    if (typeof console !== 'undefined') console.warn('[Render] Script_Actor.PoseActor 抛错，后续帧停用。', e);
  }
}

function KillRig(rig) {
  if (!rig) return;
  if (rig.group && rig.group.parent) rig.group.parent.remove(rig.group);
  if (rig.__fallback) { if (rig.__geo) rig.__geo.dispose(); return; }
  if (ActorApi.Dispose) { try { ActorApi.Dispose(rig); } catch (e) { /* 忽略 */ } }
}

// ---------------------------------------------------------------------------
// 6. 道具构建器
// ---------------------------------------------------------------------------
// 约定：builder(ctx, prop, seedRng) 在局部空间造几何（原点 = 道具锚点，+X = 朝向）。
// ctx.E(matKey, geo)            不动的部分，参与合并
// ctx.D(matKey, geo)            需要单独控制的部分（返回 mesh 交给调用方）
// ctx.Glow(x,y,z,size,color,i)  暖光源（灯 / 火），进 glow 批 + 暖光池
// ctx.Shaft(x,y,z,w,h,color,a)  漏下来的光柱，进 additive 批

const PROPS = {

  // ---------- 地表 ----------

  /**
   * 冀中土坯房：厚土墙 + 硬山顶。
   *
   * 透视下这栋房子必须读成**一个体**，不是一张立面图：
   *  · 山墙（正对观众的那面）在门洞、窗洞处真的开了洞，墙分块砌，
   *    门扇退到墙里 0.55 米——侧过去一点就能看见门洞的侧壁（门道）；
   *  · 檐口沿 ±X 挑出墙外，挑檐下面有一条实实在在的阴影和一排椽头；
   *  · 窗台是一块出挑的木板，有厚度、有下沿的暗；
   *  · 侧墙 4.6 米进深，玩家走到画面边缘就能看见整面侧墙。
   */
  house(ctx, p, rng) {
    const d = p.data || {};
    const w = Number(d.w) || (5.2 + rng() * 2.4);
    const h = Number(d.h) || 2.9;
    const dep = Number(d.d) || 4.6;
    const ridge = h + Math.max(0.9, w * 0.17);
    const y0 = 0.28;                 // 台明顶面
    const fz = dep / 2;              // 山墙外皮
    const FACE = 0.55;               // 正面墙皮厚度：门洞/窗洞的进深
    // 台明（石基）：向前多探出一点，透视下这一圈台沿是"房子站在地上"的证据
    ctx.E('stone', GBox(w + 0.5, 0.28, dep + 0.7, 0, 0.14, 0.1));
    ctx.E('stone', GBox(w + 0.62, 0.1, dep + 0.86, 0, 0.05, 0.1));

    // 门 / 窗的洞口尺寸
    const doorW = 1.0, doorH = 1.95, doorX = -w * 0.16;
    const winW = 1.15, winH = 0.9, winX = w * 0.24, winY = y0 + h * 0.62;

    // 主体：正面墙皮之后的那一大块。它整块实心，洞只开在墙皮上。
    ctx.E('mud', GBox(w, h, dep - FACE, 0, y0 + h / 2, -FACE / 2));
    // 正面墙皮分块砌，把门洞和窗洞真的留出来
    const faceZ = fz - FACE / 2;
    const dL = doorX - doorW / 2, dR = doorX + doorW / 2;
    const wL = winX - winW / 2, wR = winX + winW / 2;
    ctx.E('mud', GBox(dL + w / 2, h, FACE, (-w / 2 + dL) / 2, y0 + h / 2, faceZ));           // 门左
    ctx.E('mud', GBox(wL - dR, h, FACE, (dR + wL) / 2, y0 + h / 2, faceZ));                  // 门窗之间
    ctx.E('mud', GBox(w / 2 - wR, h, FACE, (wR + w / 2) / 2, y0 + h / 2, faceZ));            // 窗右
    ctx.E('mud', GBox(doorW, h - doorH, FACE, doorX, y0 + doorH + (h - doorH) / 2, faceZ));  // 门过梁
    ctx.E('mud', GBox(winW, winY - winH / 2 - y0, FACE, winX, (y0 + winY - winH / 2) / 2, faceZ));   // 窗下墙
    ctx.E('mud', GBox(winW, y0 + h - winY - winH / 2, FACE, winX, (winY + winH / 2 + y0 + h) / 2, faceZ)); // 窗上墙

    // 门扇：退在洞底，两侧留出可见的门道
    ctx.E('woodDark', GBox(doorW + 0.04, doorH, 0.12, doorX, y0 + doorH / 2, fz - FACE + 0.06));
    ctx.E('woodDark', GBox(0.05, doorH, 0.1, doorX, y0 + doorH / 2, fz - FACE + 0.13));
    // 门框 / 门槛：贴在洞口外沿，出挑一点点，给洞口勾一道边
    ctx.E('wood', GBox(doorW + 0.3, 0.15, 0.14, doorX, y0 + doorH + 0.07, fz + 0.05));
    ctx.E('wood', GBox(0.14, doorH + 0.15, 0.14, dL - 0.07, y0 + doorH / 2, fz + 0.05));
    ctx.E('wood', GBox(0.14, doorH + 0.15, 0.14, dR + 0.07, y0 + doorH / 2, fz + 0.05));
    ctx.E('wood', GBox(doorW + 0.3, 0.12, 0.26, doorX, y0 + 0.06, fz + 0.06));               // 门槛

    // 窗：窗纸退在洞底，窗台是一块出挑的板
    ctx.E('paper', GQuad(winW, winH, winX, winY, fz - FACE + 0.04));
    ctx.E('wood', GBox(winW + 0.3, 0.12, 0.42, winX, winY - winH / 2 - 0.06, fz + 0.1));     // 窗台（有厚度）
    ctx.E('woodDark', GBox(winW + 0.3, 0.06, 0.1, winX, winY - winH / 2 - 0.14, fz + 0.28)); // 窗台下沿的暗
    ctx.E('wood', GBox(winW + 0.16, 0.1, 0.18, winX, winY + winH / 2 + 0.05, fz + 0.02));
    for (let i = 0; i < 4; i++) ctx.E('wood', GBox(0.05, winH, 0.08, winX - winW / 2 + winW * (i / 3), winY, fz - FACE + 0.1));
    for (let i = 0; i < 3; i++) ctx.E('wood', GBox(winW, 0.05, 0.08, winX, winY - winH / 2 + winH * (i / 2), fz - FACE + 0.1));
    if (d.lit !== false) ctx.Glow(winX, winY, fz + 0.35, 2.2, 0xffb066, 0.42, 0.9);

    // 硬山：两端山墙升到脊
    const gable = [-w / 2, 0, w / 2, 0, 0, ridge - h];
    ctx.E('mud', GPrism(gable, 0.34, 0, y0 + h, fz - 0.17));
    ctx.E('mud', GPrism(gable, 0.34, 0, y0 + h, -fz + 0.17));
    // 屋面（两坡）：向外挑出 EAVE，挑出来的那一截就是檐口，
    // 透视下它在侧墙上压出一道横向的暗，房子立刻有了"顶"。
    const slope = Math.atan2(ridge - h, w / 2);
    const EAVE = 0.62;
    const rl = Math.hypot(w / 2, ridge - h) + EAVE;
    const ox = (EAVE / 2) * Math.cos(slope), oy = (EAVE / 2) * Math.sin(slope);
    ctx.E('tile', GBox(rl, 0.18, dep - 0.34, -w / 4 - ox, y0 + (h + ridge) / 2 - oy, 0, slope));
    ctx.E('tile', GBox(rl, 0.18, dep - 0.34, w / 4 + ox, y0 + (h + ridge) / 2 - oy, 0, -slope));
    // 檐口的椽头：一排小方木顶着挑檐，是"屋檐有进深"最直接的证据
    const eaveY = y0 + h - EAVE * Math.sin(slope) * 0.5 - 0.08;
    const rafters = Math.max(3, Math.round((dep - 0.5) / 0.62));
    for (let i = 0; i < rafters; i++) {
      const rz = -(dep - 0.7) / 2 + (dep - 0.7) * (i / Math.max(1, rafters - 1));
      ctx.E('woodDark', GBox(0.34, 0.11, 0.11, -w / 2 - 0.2, eaveY, rz, slope));
      ctx.E('woodDark', GBox(0.34, 0.11, 0.11, w / 2 + 0.2, eaveY, rz, -slope));
    }
    // 脊
    ctx.E('tile', GBox(0.3, 0.2, dep - 0.3, 0, y0 + ridge + 0.04, 0));

    // 墙根泥剥落 / 侧墙的斑：侧墙不能是一整块干净的板
    for (let i = 0; i < 4; i++) {
      const bx = -w / 2 + w * rng();
      ctx.E('mudDark', GBox(0.4 + rng() * 0.5, 0.3 + rng() * 0.35, 0.08, bx, y0 + rng() * 0.5, fz + 0.02));
    }
    for (let i = 0; i < 3; i++) {
      const sz = (rng() - 0.5) * (dep - 0.8);
      ctx.E('mudDark', GBox(0.09, 0.3 + rng() * 0.4, 0.5 + rng() * 0.6, -w / 2 - 0.01, y0 + 0.2 + rng() * (h - 0.6), sz));
      ctx.E('mudDark', GBox(0.09, 0.3 + rng() * 0.4, 0.5 + rng() * 0.6, w / 2 + 0.01, y0 + 0.2 + rng() * (h - 0.6), -sz));
    }
  },

  /** 土院墙：顶上不平，压一层瓦。墙有厚度，压顶出挑，透视下墙顶是一条能看见的面。 */
  wall(ctx, p, rng) {
    const d = p.data || {};
    const w = Number(d.w) || 4.5;
    const h = Number(d.h) || 1.9;
    const th = 0.78;                                  // 墙厚：立牌变成墙的关键一条
    ctx.E('mud', GBox(w, h, th, 0, h / 2, 0));
    ctx.E('tile', GBox(w + 0.16, 0.14, th + 0.34, 0, h + 0.07, 0));      // 压顶两侧出挑
    ctx.E('tile', GBox(w + 0.16, 0.09, th + 0.14, 0, h + 0.18, 0));
    ctx.E('mudDark', GBox(w + 0.2, 0.05, 0.08, 0, h, th / 2 + 0.17));    // 出挑下面那道暗
    const n = Math.max(2, Math.floor(w / 1.4));
    for (let i = 0; i < n; i++) {
      const bx = -w / 2 + w * ((i + 0.5) / n) + (rng() - 0.5) * 0.3;
      ctx.E('mudDark', GBox(0.5 + rng() * 0.5, 0.28 + rng() * 0.3, 0.06, bx, h * (0.15 + rng() * 0.55), th / 2 + 0.01));
    }
  },

  /** 木院门。 */
  gate(ctx, p) {
    const w = 2.0, h = 2.3;
    ctx.E('wood', GBox(0.26, h, 0.32, -w / 2 - 0.13, h / 2, 0));
    ctx.E('wood', GBox(0.26, h, 0.32, w / 2 + 0.13, h / 2, 0));
    ctx.E('wood', GBox(w + 0.6, 0.28, 0.36, 0, h + 0.14, 0));
    ctx.E('tile', GBox(w + 0.9, 0.12, 0.6, 0, h + 0.34, 0));
    ctx.E('woodDark', GBox(w / 2 - 0.04, h - 0.15, 0.12, -w / 4, (h - 0.15) / 2, 0.02));
    ctx.E('woodDark', GBox(w / 2 - 0.04, h - 0.15, 0.12, w / 4, (h - 0.15) / 2, 0.02));
    ctx.E('metal', GBox(0.1, h - 0.3, 0.16, -w / 4, (h - 0.15) / 2, 0.1));
    ctx.E('metal', GBox(0.1, h - 0.3, 0.16, w / 4, (h - 0.15) / 2, 0.1));
    const ring = new THREE.TorusGeometry(0.11, 0.026, 6, 12);
    ring.rotateY(Math.PI / 2); ring.translate(-0.16, 1.15, 0.12);
    ctx.E('metal', ring);
    const ring2 = new THREE.TorusGeometry(0.11, 0.026, 6, 12);
    ring2.rotateY(Math.PI / 2); ring2.translate(0.16, 1.15, 0.12);
    ctx.E('metal', ring2);
  },

  /** 辘轳井：井台 + 辘轳（轴沿 Z，正视图是个圆）+ 桶。 */
  well(ctx, p) {
    const seg = ctx.cyl;
    ctx.E('stone', GCylY(0.95, 1.02, 0.65, seg, 0, 0.32, 0));
    ctx.E('woodDark', GCylY(0.72, 0.72, 0.26, seg, 0, 0.63, 0));  // 井口暗芯
    ctx.E('wood', GBox(0.16, 1.75, 0.16, -0.78, 0.95, 0));
    ctx.E('wood', GBox(0.16, 1.75, 0.16, 0.78, 0.95, 0));
    ctx.E('wood', GCylX(0.17, 0.17, 1.7, seg, 0, 1.75, 0));       // 辘轳筒
    ctx.E('wood', GBox(0.09, 0.42, 0.09, 0.88, 1.55, 0));         // 曲柄
    ctx.E('wood', GBox(0.32, 0.08, 0.08, 1.02, 1.36, 0));
    ctx.E('woodDark', GBox(0.035, 1.0, 0.035, 0.1, 1.22, 0.12));  // 绳
    ctx.E('wood', GCylY(0.2, 0.17, 0.28, seg, 0.1, 0.62, 0.12));  // 桶
    ctx.E('metal', GCylY(0.205, 0.205, 0.03, seg, 0.1, 0.75, 0.12));
  },

  /** 碾盘：碾台 + 立着的碾磙 + 木框推杆。碾台是个 3 米直径的圆盘，透视下顶面全露。 */
  millstone(ctx, p) {
    const seg = ctx.cyl;
    ctx.E('stone', GCylY(1.62, 1.72, 0.16, Math.max(12, seg + 6), 0, 0.08, 0));    // 台基
    ctx.E('stone', GCylY(1.55, 1.62, 0.34, Math.max(10, seg + 4), 0, 0.33, 0));
    ctx.E('stone', GCylY(1.42, 1.5, 0.1, Math.max(10, seg + 4), 0, 0.54, 0));
    ctx.E('mudDark', GCylY(1.2, 1.2, 0.04, Math.max(10, seg + 4), 0, 0.58, 0));    // 磨道的暗圈
    ctx.E('stone', GCylZ(0.52, 0.52, 0.95, Math.max(10, seg + 4), 0.35, 1.02, 0));  // 碾磙
    ctx.E('wood', GBox(0.1, 0.1, 1.25, 0.35, 1.62, 0));
    ctx.E('wood', GBox(1.9, 0.1, 0.1, -0.55, 1.62, 0.6));
    ctx.E('wood', GBox(1.9, 0.1, 0.1, -0.55, 1.62, -0.6));
    ctx.E('wood', GBox(0.1, 0.1, 1.25, -1.5, 1.62, 0));
    ctx.E('wood', GBox(0.1, 0.62, 0.1, -1.5, 1.32, 0));
  },

  /** 灶台：土砌灶 + 拱火门 + 铁锅 + 烟囱。火光是暖点光。 */
  stove(ctx, p) {
    const seg = ctx.cyl;
    ctx.E('mud', GBox(1.7, 0.95, 1.15, 0, 0.48, 0));
    ctx.E('mudDark', GBox(0.62, 0.5, 0.12, -0.2, 0.32, 0.58));      // 火门
    ctx.E('mud', GBox(0.14, 0.5, 0.14, -0.55, 0.32, 0.6));
    ctx.E('mud', GBox(0.14, 0.5, 0.14, 0.15, 0.32, 0.6));
    ctx.E('mud', GBox(0.86, 0.14, 0.16, -0.2, 0.6, 0.6));
    const wok = new THREE.SphereGeometry(0.52, Math.max(8, seg), 6, 0, Math.PI * 2, Math.PI * 0.52, Math.PI * 0.48);
    wok.translate(0.25, 1.05, 0);
    ctx.E('metal', wok);
    ctx.E('metal', GCylY(0.55, 0.55, 0.05, Math.max(8, seg), 0.25, 1.03, 0));
    ctx.E('mud', GBox(0.42, 1.9, 0.42, -0.62, 1.9, -0.2));           // 烟囱
    ctx.E('tile', GBox(0.5, 0.08, 0.5, -0.62, 2.88, -0.2));
    ctx.Glow(-0.2, 0.34, 0.72, 1.5, 0xff8a30, 0.85, 3.1);
  },

  /** 炕：土台 + 席 + 卷起来的被 + 炕洞。 */
  kang(ctx, p) {
    ctx.E('mud', GBox(3.2, 0.62, 2.0, 0, 0.31, 0));
    ctx.E('cloth', GBox(3.0, 0.05, 1.85, 0, 0.645, 0));
    ctx.E('cloth', GCylX(0.32, 0.32, 1.5, ctx.cyl, -0.75, 0.83, -0.1));
    ctx.E('cloth', GBox(1.2, 0.16, 1.4, 0.85, 0.72, 0));
    ctx.E('mudDark', GBox(0.42, 0.32, 0.1, 1.35, 0.2, 1.0));
  },

  /** 水缸（旋转体）。 */
  vat(ctx, p) {
    const s = Number((p.data || {}).scale) || 1;
    ctx.E('clay', GLathe([
      0.001, 0, 0.32, 0, 0.46, 0.1, 0.56, 0.34, 0.58, 0.6,
      0.50, 0.82, 0.42, 0.94, 0.45, 1.0, 0.41, 1.02,
    ].map((v, i) => v * s), ctx.lathe, 0, 0, 0));
    ctx.E('clay', GLathe([0.001, 0.99 * s, 0.42 * s, 0.99 * s, 0.42 * s, 1.0 * s], ctx.lathe, 0, 0, 0));
  },

  /** 柴垛：藏身点。乱柴 + 麻绳捆。 */
  haystack(ctx, p, rng) {
    const w = Number((p.data || {}).w) || 1.9;
    const h = Number((p.data || {}).h) || 1.7;
    ctx.E('thatch', GIco(1, ctx.ico, 0, h * 0.48, 0, w * 0.52, h * 0.5, w * 0.42));
    ctx.E('thatch', GIco(1, ctx.ico, w * 0.16, h * 0.78, 0.1, w * 0.34, h * 0.28, w * 0.3));
    const sticks = 14;
    for (let i = 0; i < sticks; i++) {
      const a = -0.35 + rng() * 1.9;
      const len = h * (0.6 + rng() * 0.7);
      const px = (rng() - 0.5) * w * 0.85;
      const pz = (rng() - 0.5) * w * 0.6;
      ctx.E('woodDark', GBox(0.055, len, 0.055, px, h * 0.42 + (rng() - 0.5) * h * 0.35, pz, a));
    }
    ctx.E('woodDark', GBox(w * 1.02, 0.05, w * 0.86, 0, h * 0.5, 0));
  },

  /** 驴槽：一只有内腔的木槽。槽口朝上，透视下能看见槽底和内壁。 */
  trough(ctx, p) {
    const w = 1.9, dp = 0.92;
    ctx.E('wood', GBox(w, 0.1, dp, 0, 0.62, 0));                       // 槽底
    ctx.E('mudDark', GBox(w - 0.16, 0.04, dp - 0.16, 0, 0.68, 0));     // 槽内的暗（有腔）
    ctx.E('wood', GBox(w, 0.42, 0.1, 0, 0.86, dp / 2));                // 前帮
    ctx.E('wood', GBox(w, 0.42, 0.1, 0, 0.86, -dp / 2));               // 后帮
    ctx.E('wood', GBox(0.1, 0.42, dp, -w / 2, 0.86, 0));
    ctx.E('wood', GBox(0.1, 0.42, dp, w / 2, 0.86, 0));
    ctx.E('woodDark', GBox(0.14, 0.62, 0.14, -w / 2 + 0.2, 0.31, dp * 0.3));
    ctx.E('woodDark', GBox(0.14, 0.62, 0.14, w / 2 - 0.2, 0.31, -dp * 0.3));
    ctx.E('woodDark', GBox(0.14, 0.62, 0.14, -w / 2 + 0.2, 0.31, -dp * 0.3));
    ctx.E('woodDark', GBox(0.14, 0.62, 0.14, w / 2 - 0.2, 0.31, dp * 0.3));
  },

  /** 老槐树：确定性递归枝干 + 低模冠。 */
  tree(ctx, p, rng) {
    const d = p.data || {};
    const scale = Number(d.scale) || 1;
    const seg = Math.max(5, ctx.cyl - 2);
    const trunkH = 3.0 * scale;
    // 主干分几节，每节稍稍偏一点，读起来才"老"
    let bx = 0, by = 0, ang = 0;
    const nodes = 4;
    for (let i = 0; i < nodes; i++) {
      const len = trunkH / nodes;
      const rb = (0.4 - i * 0.06) * scale, rt = (0.4 - (i + 1) * 0.06) * scale;
      const a = (rng() - 0.5) * 0.2;
      ang += a;
      const g = new THREE.CylinderGeometry(Math.max(0.06, rt), Math.max(0.08, rb), len, seg);
      g.translate(0, len / 2, 0); g.rotateZ(ang); g.translate(bx, by, 0);
      ctx.E('bark', g);
      bx += -Math.sin(ang) * len; by += Math.cos(ang) * len;
    }
    // 分枝
    const branches = 5;
    for (let i = 0; i < branches; i++) {
      const a = ang + (i - (branches - 1) / 2) * 0.42 + (rng() - 0.5) * 0.24;
      const len = (1.5 + rng() * 1.1) * scale;
      const g = new THREE.CylinderGeometry(0.06 * scale, 0.16 * scale, len, 5);
      g.translate(0, len / 2, 0); g.rotateZ(a); g.translate(bx, by - 0.25 * scale, (rng() - 0.5) * 0.7 * scale);
      ctx.E('bark', g);
      const tx = bx - Math.sin(a) * len, ty = by - 0.25 * scale + Math.cos(a) * len;
      const g2 = new THREE.CylinderGeometry(0.03 * scale, 0.07 * scale, len * 0.6, 4);
      g2.translate(0, len * 0.3, 0); g2.rotateZ(a + (rng() - 0.5) * 0.8); g2.translate(tx, ty, 0);
      ctx.E('bark', g2);
      // 冠
      ctx.E('foliage', GIco(1, ctx.ico, tx + (rng() - 0.5) * 0.5, ty + 0.4 * scale, (rng() - 0.5) * 1.2 * scale,
        (1.0 + rng() * 0.6) * scale, (0.72 + rng() * 0.4) * scale, (0.9 + rng() * 0.5) * scale));
    }
    ctx.E('foliage', GIco(1, ctx.ico, bx, by + 1.0 * scale, 0, 1.9 * scale, 1.15 * scale, 1.5 * scale));
    // 根盘
    for (let i = 0; i < 4; i++) {
      const a = rng() * Math.PI * 2;
      ctx.E('bark', GBox(0.7 * scale, 0.18 * scale, 0.22 * scale, Math.cos(a) * 0.4 * scale, 0.08 * scale, Math.sin(a) * 0.4 * scale, Math.cos(a) * 0.2));
    }
  },

  /** 老槐树上的钟：这里只造挂钟的横梁与吊环，钟本体交给 Script_Actor.CreateBellRig。 */
  bell(ctx, p) {
    const y = Number((p.data || {}).height) || 2.6;
    ctx.E('wood', GBox(1.5, 0.16, 0.18, 0, y + 0.1, 0));
    ctx.E('wood', GBox(0.13, 0.6, 0.13, -0.68, y - 0.2, 0, 0.4));
    ctx.E('wood', GBox(0.13, 0.6, 0.13, 0.68, y - 0.2, 0, -0.4));
    const ring = new THREE.TorusGeometry(0.07, 0.02, 5, 10);
    ring.translate(0, y, 0);
    ctx.E('metal', ring);
    ctx.E('woodDark', GBox(0.03, 1.5, 0.03, 0.34, y - 1.35, 0.1));  // 拉绳
  },

  /** 独轮车。 */
  cart(ctx, p) {
    const seg = Math.max(8, ctx.cyl);
    ctx.E('woodDark', GCylZ(0.42, 0.42, 0.1, seg, 0, 0.42, 0));
    ctx.E('wood', GCylZ(0.11, 0.11, 0.14, seg, 0, 0.42, 0));
    for (let i = 0; i < 6; i++) ctx.E('wood', GBox(0.05, 0.78, 0.05, 0, 0.42, 0, i * Math.PI / 6));
    ctx.E('wood', GBox(1.55, 0.07, 0.09, -0.55, 0.62, 0.34, 0.13));
    ctx.E('wood', GBox(1.55, 0.07, 0.09, -0.55, 0.62, -0.34, 0.13));
    ctx.E('wood', GBox(1.0, 0.06, 0.72, -0.35, 0.68, 0));
    ctx.E('wood', GBox(0.06, 0.3, 0.62, 0.12, 0.83, 0));
    ctx.E('woodDark', GBox(0.09, 0.44, 0.09, -1.2, 0.44, 0.3));
    ctx.E('woodDark', GBox(0.09, 0.44, 0.09, -1.2, 0.44, -0.3));
  },

  /** 篱笆：桩子在 z 上错开，透视下前后两排的间距不一样，一眼读出深度。 */
  fence(ctx, p, rng) {
    const w = Number((p.data || {}).w) || 4.0;
    const n = Math.max(2, Math.round(w / 1.1));
    for (let i = 0; i <= n; i++) {
      const x = -w / 2 + w * (i / n);
      const z = (rng() - 0.5) * 0.3;
      ctx.E('woodDark', GBox(0.11, 1.25 + rng() * 0.2, 0.11, x, 0.62, z, (rng() - 0.5) * 0.08));
      if (i % 2 === 0) ctx.E('woodDark', GBox(0.09, 0.9 + rng() * 0.3, 0.09, x + 0.14, 0.48, z - 0.52, (rng() - 0.5) * 0.14));
    }
    ctx.E('woodDark', GBox(w, 0.07, 0.09, 0, 1.05, 0));
    ctx.E('woodDark', GBox(w, 0.07, 0.09, 0, 0.6, 0));
    ctx.E('woodDark', GBox(w, 0.06, 0.08, 0, 0.82, -0.52));
  },

  /** 院里的灯杆。 */
  lamp(ctx, p) {
    ctx.E('woodDark', GBox(0.12, 2.3, 0.12, 0, 1.15, 0));
    ctx.E('wood', GBox(0.42, 0.08, 0.1, 0.18, 2.28, 0));
    ctx.E('metal', GBox(0.28, 0.04, 0.28, 0.34, 2.1, 0));
    ctx.E('metal', GBox(0.28, 0.04, 0.28, 0.34, 1.68, 0));
    ctx.E('paper', GBox(0.24, 0.4, 0.24, 0.34, 1.89, 0));
    for (let i = 0; i < 4; i++) {
      const a = i * Math.PI / 2 + Math.PI / 4;
      ctx.E('metal', GBox(0.03, 0.42, 0.03, 0.34 + Math.cos(a) * 0.13, 1.89, Math.sin(a) * 0.13));
    }
    ctx.Glow(0.34, 1.89, 0.2, 1.5, 0xffb066, 0.7, 2.6);
  },

  /** 遗体：克制处理——盖着的形，没有细节，没有血。 */
  corpse(ctx, p) {
    ctx.E('cloth', GIco(1, ctx.ico, 0, 0.2, 0, 1.0, 0.2, 0.34));
    ctx.E('cloth', GIco(1, ctx.ico, -0.55, 0.24, 0, 0.28, 0.24, 0.28));
    ctx.E('thatch', GBox(2.3, 0.04, 0.85, 0, 0.03, 0));
    ctx.E('stone', GBox(0.2, 0.34, 0.16, 1.25, 0.17, 0));
  },

  /** 路牌 / 布告。 */
  sign(ctx, p) {
    ctx.E('woodDark', GBox(0.11, 1.7, 0.11, 0, 0.85, 0));
    ctx.E('signBoard', GBox(0.9, 0.62, 0.06, 0, 1.5, 0.05));
    ctx.E('wood', GBox(1.0, 0.07, 0.09, 0, 1.85, 0.05));
  },

  // ---------- 地下 ----------

  /**
   * 支撑木：坑道里最能说明"这条通道有进深"的东西。
   * 两榀框架前后错开 2.6 米，中间用顺水木连起来——透视下后一榀明显小一圈、
   * 位置更靠画面中心，一眼看出坑道是往里走的，不是贴在墙上的一张图。
   */
  prop_beam(ctx, p) {
    const w = Number((p.data || {}).w) || 1.55;
    const h = Number((p.data || {}).h) || 1.95;
    const frames = [0.35, -2.45];      // 前后两榀的 z
    for (let f = 0; f < frames.length; f++) {
      const z = frames[f];
      ctx.E('timber', GBox(0.22, h, 0.42, -w / 2, h / 2, z));
      ctx.E('timber', GBox(0.22, h, 0.42, w / 2, h / 2, z));
      ctx.E('timber', GBox(w + 0.5, 0.24, 0.46, 0, h + 0.12, z));
      ctx.E('timber', GBox(0.36, 0.12, 0.4, -w / 2, h - 0.16, z, 0.7));
      ctx.E('timber', GBox(0.36, 0.12, 0.4, w / 2, h - 0.16, z, -0.7));
      ctx.E('cloth', GBox(0.26, 0.07, 0.46, -w / 2, h * 0.55, z));
      ctx.E('cloth', GBox(0.26, 0.07, 0.46, w / 2, h * 0.55, z));
      ctx.E('timberDark', GBox(w + 0.3, 0.08, 0.42, 0, h + 0.28, z));
    }
    // 顺水木：把两榀连起来，沿 -Z 拉出去的三根线就是纵深本身
    const zc = (frames[0] + frames[1]) / 2, zl = Math.abs(frames[0] - frames[1]) + 0.4;
    ctx.E('timberDark', GBox(0.13, 0.13, zl, -w / 2, h - 0.1, zc));
    ctx.E('timberDark', GBox(0.13, 0.13, zl, w / 2, h - 0.1, zc));
    ctx.E('timberDark', GBox(0.11, 0.11, zl, 0, h + 0.2, zc));
    // 后一榀之间的挡土板：坑道尽头不是一片虚无
    ctx.E('timberDark', GBox(w * 0.9, 0.1, zl * 0.7, 0, h + 0.05, zc));
  },

  /** 马灯：铁座 + 玻璃罩 + 火苗 + 提梁。 */
  lantern(ctx, p) {
    const seg = Math.max(6, ctx.cyl);
    ctx.E('metal', GCylY(0.14, 0.16, 0.08, seg, 0, 0.04, 0));
    ctx.E('metal', GCylY(0.11, 0.13, 0.06, seg, 0, 0.11, 0));
    ctx.E('glass', GCylY(0.115, 0.115, 0.24, seg, 0, 0.26, 0));
    ctx.E('flame', GSphere(0.045, 6, 0, 0.23, 0, 1.7));
    ctx.E('metal', GCylY(0.14, 0.11, 0.07, seg, 0, 0.42, 0));
    ctx.E('metal', GCylY(0.05, 0.09, 0.06, seg, 0, 0.48, 0));
    for (let i = 0; i < 3; i++) {
      const a = i * Math.PI * 2 / 3;
      ctx.E('metal', GBox(0.02, 0.26, 0.02, Math.cos(a) * 0.115, 0.26, Math.sin(a) * 0.115));
    }
    const bail = new THREE.TorusGeometry(0.11, 0.014, 4, 10, Math.PI);
    bail.rotateY(Math.PI / 2); bail.translate(0, 0.5, 0);
    ctx.E('metal', bail);
    ctx.Glow(0, 0.26, 0.25, 1.35, 0xffb066, 0.95, 3.4);
  },

  /** 粮罐。 */
  crock(ctx, p) {
    const s = Number((p.data || {}).scale) || 1;
    ctx.E('clay', GLathe([
      0.001, 0, 0.26, 0, 0.38, 0.08, 0.44, 0.26, 0.4, 0.46, 0.3, 0.58, 0.32, 0.62,
    ].map((v) => v * s), ctx.lathe, 0, 0, 0));
    ctx.E('wood', GCylY(0.34 * s, 0.34 * s, 0.05 * s, ctx.lathe, 0, 0.645 * s, 0));
    ctx.E('cloth', GBox(0.72 * s, 0.05 * s, 0.72 * s, 0, 0.55 * s, 0));
  },

  /** 卡口：两侧土肩夹出一个窄口 + 木导槽（挡板另做，可被封住）。土肩要有进深，读成一段"门道"。 */
  chokepoint(ctx, p) {
    const gap = Number((p.data || {}).gap) || 0.85;
    const h = Number((p.data || {}).h) || 1.9;
    const dep = 3.4;                                   // 土肩进深：卡口是一段窄道，不是一道门框
    ctx.E('mudDark', GPrism([-1.5, 0, -gap / 2, 0, -gap / 2, h, -1.5, h], dep, 0, 0, -0.6));
    ctx.E('mudDark', GPrism([gap / 2, 0, 1.5, 0, 1.5, h, gap / 2, h], dep, 0, 0, -0.6));
    ctx.E('mudDark', GBox(gap + 3.0, 0.5, dep, 0, h + 0.25, -0.6));   // 卡口顶板
    ctx.E('timber', GBox(0.14, h, 0.34, -gap / 2 - 0.07, h / 2, 0.95));
    ctx.E('timber', GBox(0.14, h, 0.34, gap / 2 + 0.07, h / 2, 0.95));
    ctx.E('timber', GBox(gap + 0.5, 0.14, 0.34, 0, h - 0.07, 0.95));
    // 里口再来一道，透视下前后两道框把"这是一段窄道"说死
    ctx.E('timber', GBox(0.12, h, 0.28, -gap / 2 - 0.06, h / 2, -2.1));
    ctx.E('timber', GBox(0.12, h, 0.28, gap / 2 + 0.06, h / 2, -2.1));
    // 备好的沙袋 / 土坯，一眼看出"可以被堵上"
    for (let i = 0; i < 3; i++) {
      ctx.E('cloth', GIco(1, 0, -gap / 2 - 0.55 + i * 0.12, 0.14 + i * 0.24, 0.75, 0.34, 0.14, 0.3));
    }
  },

  /** 通气孔：一段竖直土筒（四面围合，背面封住）+ 铁栅 + 漏下来的光柱。 */
  vent(ctx, p) {
    const h = Number((p.data || {}).h) || 2.6;
    const dp = 1.1;
    ctx.E('mudDark', GBox(0.18, h, dp, -0.36, h / 2, -0.1));
    ctx.E('mudDark', GBox(0.18, h, dp, 0.36, h / 2, -0.1));
    ctx.E('mudDark', GBox(0.9, h, 0.16, 0, h / 2, -0.1 - dp / 2));   // 背壁：看进去有底
    for (let i = 0; i < 3; i++) ctx.E('metal', GBox(0.6, 0.045, 0.045, 0, h - 0.1, -0.34 + i * 0.28));
    ctx.E('metal', GBox(0.05, 0.045, dp - 0.1, -0.2, h - 0.1, -0.1));
    ctx.E('metal', GBox(0.05, 0.045, dp - 0.1, 0.2, h - 0.1, -0.1));
    ctx.E('mud', GBox(1.1, 0.14, dp + 0.3, 0, h + 0.07, -0.1));
    // 体积光：一片贴图不是光柱，是一条亮带。三片在 z 上错开、越靠前越窄，
    // 透视下它们叠成一个向观众张开的锥——**光柱本身就是纵深，因为它有长度**。
    // 底下再补一摊地面光潭，把"这束光落到了地上"说死。
    ctx.Shaft(0, h * 0.5 - 0.1, -0.9, 1.65, h + 0.5, 0xa8c2ea, 0.13);
    ctx.Shaft(0, h * 0.5 - 0.2, 1.1, 0.95, h + 0.3, 0xbcd2f2, 0.30);
    ctx.Shaft(0, h * 0.5 - 0.35, 2.6, 0.52, h + 0.1, 0xd2e2ff, 0.17);
    ctx.Glow(0, 0.06, 0.55, 2.5, 0x9fbce8, 0.11, 0);
  },

  /** 翻口：地道口的木盖。口子是真的凹下去的，透视下能看见井壁。 */
  trapdoor(ctx, p) {
    ctx.E('wood', GBox(1.5, 0.14, 0.24, 0, 0.07, 0.57));
    ctx.E('wood', GBox(1.5, 0.14, 0.24, 0, 0.07, -0.57));
    ctx.E('wood', GBox(0.24, 0.14, 1.4, -0.63, 0.07, 0));
    ctx.E('wood', GBox(0.24, 0.14, 1.4, 0.63, 0.07, 0));
    // 井壁：四面往下 0.55 米，围出一个能看进去的口
    ctx.E('mudDark', GBox(0.1, 0.6, 1.1, -0.5, -0.3, 0));
    ctx.E('mudDark', GBox(0.1, 0.6, 1.1, 0.5, -0.3, 0));
    ctx.E('mudDark', GBox(1.1, 0.6, 0.1, 0, -0.3, -0.5));
    ctx.E('void', GBox(1.0, 0.06, 1.0, 0, -0.58, 0));               // 口底的黑
  },

  /** 水道：土壁上的陶管口 + 引水槽 + 铁箅。 */
  waterpipe(ctx, p) {
    const seg = Math.max(6, ctx.cyl);
    ctx.E('clay', GCylX(0.3, 0.3, 0.7, seg, -0.5, 0.42, 0));
    ctx.E('mudDark', GCylX(0.22, 0.22, 0.74, seg, -0.5, 0.42, 0));
    ctx.E('stone', GBox(2.0, 0.1, 0.7, 0.55, 0.06, 0));
    ctx.E('stone', GBox(2.0, 0.26, 0.08, 0.55, 0.19, 0.31));
    ctx.E('stone', GBox(2.0, 0.26, 0.08, 0.55, 0.19, -0.31));
    for (let i = 0; i < 4; i++) ctx.E('metal', GBox(0.04, 0.24, 0.62, -0.16 + i * 0.11, 0.2, 0));
  },

  /** 枪眼：斜着穿出土层的小口，外面透进一线光。 */
  loophole(ctx, p) {
    ctx.E('wood', GBox(0.62, 0.1, 0.5, 0, 0.28, 0));
    ctx.E('wood', GBox(0.62, 0.1, 0.5, 0, -0.28, 0));
    ctx.E('wood', GBox(0.1, 0.66, 0.5, -0.3, 0, 0));
    ctx.E('wood', GBox(0.1, 0.66, 0.5, 0.3, 0, 0));
    ctx.E('void', GQuad(0.5, 0.46, 0, 0, -0.24));
    // 同上：两片错开的斜光锥，才读得出"一线光斜插进土层里"
    ctx.Shaft(0.45, -0.22, -0.4, 0.82, 2.2, 0xa8c2ea, 0.08, -0.85);
    ctx.Shaft(0.6, -0.35, 0.9, 0.5, 1.9, 0xbcd2f2, 0.18, -0.85);
  },
};

/** 未实现的 kind：优雅降级成一个带标记的占位块，绝不抛异常。 */
function PlaceholderProp(ctx) {
  ctx.E('mud', GBox(0.85, 0.85, 0.85, 0, 0.43, 0));
  ctx.E('mudDark', GBox(0.9, 0.1, 0.9, 0, 0.86, 0));
}

// ---------------------------------------------------------------------------
// 7. CreateRenderer
// ---------------------------------------------------------------------------

export function CreateRenderer(canvas, options = {}) {
  const opts = options || {};
  let qualityName = QUALITY_PRESET[opts.quality] ? opts.quality : 'high';
  let cfg = QUALITY_PRESET[qualityName];

  // ---- renderer ----
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: cfg.antialias,
    alpha: false,
    stencil: false,
    powerPreference: 'high-performance',
    // 保留绘制缓冲：截图 / 像素级健康检查要能 drawImage(canvas) 读回像素。
    // 关掉的话画面照常显示，但任何 canvas 读回都会拿到全透明黑。
    preserveDrawingBuffer: opts.preserveDrawingBuffer !== false,
  });
  renderer.setClearColor(0x0b1220, 1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.25;
  renderer.shadowMap.enabled = cfg.shadows;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.info.autoReset = true;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0b1220);
  scene.fog = new THREE.Fog(0x121c2c, 34, 82);

  let viewW = (canvas && canvas.width) || 1280;
  let viewH = (canvas && canvas.height) || 720;
  let viewHeight = CAMERA.viewHeight;
  // 长焦透视。FOV 窄到 20°，相机拉到三十多米开外：竖直边缘几乎不外扩，
  // 横版仍然成立，但层与层之间有了真实的近大远小和视差。
  const camera = new THREE.PerspectiveCamera(CAMERA.fovDeg, 16 / 9, CAMERA.near, CAMERA.far);
  let camDist = CameraDistanceFor(viewHeight);
  camera.position.set(0, 0, camDist);
  camera.rotation.set(0, 0, 0);          // 永远看向 -Z，永远不转
  scene.add(camera);

  // ---- 天幕：挂在相机下面，等于无穷远。它不许有任何视差 ----
  const gSky = new THREE.Group();
  gSky.name = 'SKY';
  gSky.position.z = -SKY_DEPTH;
  camera.add(gSky);

  // ---- 分层 group ----
  const gFar = new THREE.Group(); gFar.name = 'FAR'; gFar.position.z = LAYER_Z.FAR; scene.add(gFar);
  const gBack = new THREE.Group(); gBack.name = 'BACK'; gBack.position.z = LAYER_Z.BACK; scene.add(gBack);
  // 补进去的中间层。它们不进 LAYER_Z（那是玩法/关卡也认的契约），只是渲染层
  // 自己在契约的五档之间填出来的梯度，让视差是连续的而不是四张卡片。
  const gDepth = new THREE.Group(); gDepth.name = 'DEPTH'; scene.add(gDepth);
  const gMid = new THREE.Group(); gMid.name = 'MID'; scene.add(gMid);
  const gPlay = new THREE.Group(); gPlay.name = 'PLAY'; scene.add(gPlay);
  const gFore = new THREE.Group(); gFore.name = 'FORE'; gFore.position.z = 0; scene.add(gFore);
  // FORE 拆三份（三份都不再做任何手动位移，视差由透视天然给出）：
  //   gForePar 程序生成的剪影
  //   gForeFix 关卡手放的 z>=FORE 道具
  //   gForeTun 地道里的前景（土堆/树根）
  const gForePar = new THREE.Group(); gForePar.name = 'FORE_PAR'; gFore.add(gForePar);
  const gForeFix = new THREE.Group(); gForeFix.name = 'FORE_FIX'; gFore.add(gForeFix);
  const gForeTun = new THREE.Group(); gForeTun.name = 'FORE_TUN'; gFore.add(gForeTun);
  const gFx = new THREE.Group(); gFx.name = 'FX'; scene.add(gFx);

  // ---- 纹理缓存 ----
  const texCache = new Map();
  function GetTex(key, repeatX, repeatY) {
    if (!HAS_DOM) return null;
    const cached = texCache.get(key);
    if (cached) return cached;
    const draw = TEX_DRAW[key];
    if (!draw) return null;
    let tex = null;
    try {
      const s = cfg.texSize;
      const cv = document.createElement('canvas');
      cv.width = s; cv.height = s;
      draw(cv, s);
      tex = new THREE.CanvasTexture(cv);
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      // 单张竖向渐变（空气墙 / 贴地薄雾）必须 clamp：RepeatWrapping 下，
      // 顶边那一行会跟底边那一行做双线性混合，画面上就是一条横贯全屏的硬边。
      if (key === 'haze' || key === 'mist') tex.wrapT = THREE.ClampToEdgeWrapping;
      tex.repeat.set(repeatX || 1, repeatY || repeatX || 1);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = qualityName === 'low' ? 1 : 4;
      tex.needsUpdate = true;
    } catch (e) { tex = null; }
    texCache.set(key, tex);
    return tex;
  }
  const texRepeats = {
    mud: 0.42, wood: 0.7, tile: 0.55, stone: 0.4, thatch: 0.9,
    earth: 0.22, paper: 1.0, noise: 1.0, water: 1.0, glow: 1.0,
    shaft: 1.0, sign: 1.0, sky: 1.0, smoke: 1.0, vignette: 1.0, haze: 1.0, mist: 1.0,
  };
  function T(key) { const r = texRepeats[key] || 1; return GetTex(key, r, r); }

  // ---- 材质库 ----
  function LambertMat(color, texKey, extra) {
    const m = new THREE.MeshLambertMaterial(Object.assign({ color, map: T(texKey) || null }, extra || {}));
    m.__tex = texKey || null;
    return m;
  }
  const mats = {
    mud: LambertMat(0x8a7358, 'mud'),
    mudDark: LambertMat(0x4e4032, 'mud'),
    clay: LambertMat(0x8d6244, 'mud'),
    wood: LambertMat(0x6f5133, 'wood'),
    woodDark: LambertMat(0x3d2c1c, 'wood'),
    bark: LambertMat(0x4a3a2a, 'wood'),
    foliage: LambertMat(0x33402f, null, { flatShading: true }),
    tile: LambertMat(0x4d5058, 'tile'),
    stone: LambertMat(0x6d6f75, 'stone'),
    thatch: LambertMat(0x8a763f, 'thatch'),
    metal: LambertMat(0x4d5259, null),
    cloth: LambertMat(0x5d5044, null),
    paper: LambertMat(0xcbb086, 'paper', { emissive: 0x3a2a14 }),
    signBoard: LambertMat(0x9a7c54, 'sign'),
    glass: new THREE.MeshBasicMaterial({ color: 0xffd9a0, transparent: true, opacity: 0.22, depthWrite: false }),
    flame: new THREE.MeshBasicMaterial({ color: 0xffd08a, fog: false }),
    void: new THREE.MeshBasicMaterial({ color: 0x05070c }),
    // 剖面自带一层很低的暖自发光：月光是冷的，光靠它照土层会被中和成灰，
    // 而"地下偏赭褐橙"是硬要求。这层暖底同时保证坑道壁永远不会掉进纯黑。
    earth: new THREE.MeshLambertMaterial({
      color: 0xffffff, vertexColors: true, map: T('earth') || null,
      emissive: 0x30200f, emissiveIntensity: 0.55,
    }),
    // 坑道背墙：必须自带暖底。它离马灯有十几米开外，靠光照永远是纯黑，
    // 结果"该走人的空间"比周围实心土还暗，空间读反。地表看进地道口时同理，
    // 所以暖底基本不随 layerMix 变——地道任何时候都是暖的。
    earthBack: new THREE.MeshLambertMaterial({
      color: 0x3a2a1c, map: T('earth') || null,
      emissive: 0x4a3018, emissiveIntensity: 0.5,
    }),
    // 坑道地面：透视下它是一块向里退的台面，是"这是壕沟不是剪纸"的第一判据。
    // 自带暖底，保证远端不会掉进纯黑（掉黑就又读成一条缝）。
    tunnelFloor: new THREE.MeshLambertMaterial({
      color: 0x59452e, map: T('earth') || null,
      emissive: 0x3a2410, emissiveIntensity: 0.55,
    }),
    // 坑道里的木作（支撑木、梯子、卡口框）。地道的环境光只有 0x1a1008，
    // 普通 wood 在里面算下来是纯黑，前后两榀支撑木的进深全丢了。
    // 给一点暖自发光，木头才立得住，"框架一榀比一榀小"这条纵深线索才成立。
    timber: new THREE.MeshLambertMaterial({
      color: 0x6f5133, map: T('wood') || null,
      emissive: 0x2e1c0c, emissiveIntensity: 0.62,
    }),
    timberDark: new THREE.MeshLambertMaterial({
      color: 0x412e1b, map: T('wood') || null,
      emissive: 0x1e1207, emissiveIntensity: 0.6,
    }),
    fore: new THREE.MeshBasicMaterial({ color: 0x05070d, transparent: true, opacity: 1 }),
    foreTunnel: new THREE.MeshBasicMaterial({ color: 0x0a0704, transparent: true, opacity: 1 }),
    // 远山 / 远村：跟天空 0x0b1220 只差 9 级亮度时等于没画，五层里真正有厚度的
    // 只剩 PLAY 和土层。拉开明度差，视差才看得出来。
    //
    // 现在两层都吃雾（大气透视：越远越淡、越偏冷、对比越低）。雾会把它们一路
    // 拉向天空色，所以底色必须先抬起来，washed 完还剩得下层次：
    //   BACK(z=-14, 雾 37%) → 比 FAR 深、对比高
    //   FAR (z=-26, 雾 75%) → 更淡更冷，但仍明显亮于天幕
    farSil: new THREE.MeshBasicMaterial({ color: 0x33455f, fog: true }),
    backSil: new THREE.MeshBasicMaterial({ color: 0x2a3a55 }),
    // 补进 FAR/BACK/MID 之间的三层。
    //
    // 底色必须**按雾量反解**，不能凭感觉排。雾系数只跟 |z| 有关（near/far 都是
    // camDist + 常数，所以跟视口无关）：f = (|z| - 0.8) / 33.2
    //     z=-10.8 → 0.30   z=-14 → 0.40   z=-20 → 0.58   z=-26 → 0.76   z=-31 → 0.91
    // 夜景里"越远越暗"（都往深色的雾/天空收），所以目标屏幕亮度是
    //     MID(近乎黑) < YARD < FAR < BACK …… 不是一条单调线，BACK 才是最亮的一档。
    // 第一版凭感觉给的底色实测下来 YARD 和 BACK 算出来只差 1 级，插层等于白插。
    // 这三个值是拿 out = (1-f)*base + f*fog 反解出来的：
    //     YARD  → 屏幕 (26,37,58)    GROVE → (30,43,63)    RIDGE → (23,33,49)
    ridgeSil: new THREE.MeshBasicMaterial({ color: 0x3c4050, fog: true }),
    groveSil: new THREE.MeshBasicMaterial({ color: 0x2c3d57, fog: true }),
    yardSil: new THREE.MeshBasicMaterial({ color: 0x1f2b41, fog: true }),
    sky: new THREE.MeshBasicMaterial({ color: 0x1a2740, map: T('sky') || null, fog: false, depthWrite: false, transparent: true }),
    skyBase: new THREE.MeshBasicMaterial({ color: 0x0b1220, fog: false, depthWrite: false }),
    moon: new THREE.MeshBasicMaterial({ color: 0xdce8fb, fog: false, transparent: true, map: T('glow') || null, blending: THREE.AdditiveBlending, depthWrite: false }),
    star: new THREE.PointsMaterial({ color: 0xcfe0f6, size: 2.2, sizeAttenuation: false, transparent: true, opacity: 0.75, fog: false, depthWrite: false }),
    actor: LambertMat(0x22242c, null),
    glowAdd: new THREE.MeshBasicMaterial({ map: T('glow') || null, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }),
    // 互动提示：柔光而不是光环。depthTest 保持开着——「边缘提亮」那一片
    // 就是靠道具自己把柔光的核心挡掉，只漏出一圈轮廓，才读成"被光照到"。
    haloAdd: new THREE.MeshBasicMaterial({ map: T('glow') || null, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }),
    shaftAdd: new THREE.MeshBasicMaterial({ map: T('shaft') || null, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }),
    // 毒烟：柔边烟团 + 顶点色（浓度/前锋写在 alpha 里）。普通混合，不发光——
    // 烟是遮挡物不是光源，additive 会让它读成"亮雾"。
    gas: new THREE.MeshBasicMaterial({ map: T('smoke') || null, vertexColors: true, transparent: true, opacity: 1, depthWrite: false, fog: false }),
    // 灌水：自带一点冷自发光，否则在没有马灯的坑道里是纯黑，等于没画。
    // 冀中地道里灌进来的是浑水，不是游泳池。压低饱和、往土色偏，
    // 但保留高光和一点自发光，好让"液面"这条线在没有马灯时也读得出来。
    water: new THREE.MeshPhongMaterial({
      color: 0x1b2a2c, specular: 0xa8ccd8, shininess: 110,
      emissive: 0x101f26, emissiveIntensity: 0.8,
      transparent: true, opacity: 0.8, depthWrite: false,
    }),
    waterLine: new THREE.MeshBasicMaterial({ map: T('water') || null, color: 0x7fc0d6, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }),
    waterEdge: new THREE.MeshBasicMaterial({ map: T('glow') || null, color: 0x8fcbe0, transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }),
    // 地下暗角：把远离玩家的实心土压下去，同时让"灭灯"真的变暗。
    vignette: new THREE.MeshBasicMaterial({ map: T('vignette') || null, color: 0x02040a, transparent: true, opacity: 0, depthWrite: false, fog: false }),
    dust: new THREE.PointsMaterial({ map: T('glow') || null, vertexColors: true, transparent: true, size: 6, sizeAttenuation: false, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }),
    blob: new THREE.MeshBasicMaterial({ map: T('glow') || null, color: 0x000000, transparent: true, opacity: 0.45, depthWrite: false }),
    // 大气透视的三道空气墙：越远越厚。雾负责连续衰减，这三层负责把
    // FAR / BACK / MID 之间"啪"地切出可读的层次差——只有雾的话三层会糊成一坨。
    //
    // 现在带 haze 高度梯度贴图（贴地厚、越高越薄），所以敢给厚了：以前不敢
    // 超过 0.16 是因为均匀板会把天幕一起洗，远山和天空撞成同一个色；带梯度
    // 之后天空那一段的 alpha 本来就是 0，加厚只作用在地平线附近的景物上。
    // 强度由 Sync 按 layerMix 在地表/地道两套值之间插（HAZE_A_SURF/TUN）。
    hazeFar: new THREE.MeshBasicMaterial({ color: 0x1a2a40, map: T('haze') || null, transparent: true, opacity: 0.34, depthWrite: false, fog: false }),
    hazeMid: new THREE.MeshBasicMaterial({ color: 0x1a2a40, map: T('haze') || null, transparent: true, opacity: 0.22, depthWrite: false, fog: false }),
    hazeNear: new THREE.MeshBasicMaterial({ color: 0x1a2a40, map: T('haze') || null, transparent: true, opacity: 0.12, depthWrite: false, fog: false }),
    // 贴地薄雾：一条只有三四米厚、**比雾色亮**的带子，压在地平线上。
    // 它跟空气墙分工不同——空气墙把整片背景往雾色收（远景变淡），
    // 这一条把村舍的脚泡掉（层与层之间多一条硬边界），而且因为它够窄，
    // 抬亮的是"村庄带"而不是天空。颜色每帧在 Sync 里往月色调。
    mist: new THREE.MeshBasicMaterial({ color: 0x2c3d55, map: T('mist') || null, transparent: true, opacity: 0.22, depthWrite: false, fog: false }),
  };
  mats.foliage.flatShading = true;
  const hazeMats = [mats.hazeFar, mats.hazeMid, mats.hazeNear];
  /** 空气墙强度：地表 / 地道两套。地道那套跟改造前一致，别把坑道糊成雾。
   *
   *  地表这三档同时还是"抬高村庄带"的唯一干净手柄：三道墙都在剖面正面
   *  (z=2.25) 后面、都在 groundRef+6 以下，所以加厚**只**作用在地平线附近的
   *  背景上——土层（在它们前面）和天空（在梯度归零区）一点不受影响。
   *  「村庄 > 天空 > 土层」这条序位就是靠它压住的。 */
  const HAZE_A_SURF = [0.26, 0.18, 0.11];
  const HAZE_A_TUN = [0.16, 0.11, 0.07];

  /** 浮尘：每层一个材质（点大小是材质级的，这就是"近大远小"的实现）。 */
  const moteMats = [];
  for (let i = 0; i < MOTE_BANDS.length; i++) {
    moteMats.push(new THREE.PointsMaterial({
      map: T('glow') || null, vertexColors: true, transparent: true,
      size: MOTE_BANDS[i].size, sizeAttenuation: false,
      depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    }));
  }
  /** 极近景的失焦叶团：不是剪影，是一团化开的暗。景深的暗示，不是特效。 */
  mats.foreBokeh = new THREE.MeshBasicMaterial({
    map: T('glow') || null, color: 0x05070d, transparent: true,
    opacity: 0.62, depthWrite: false, fog: false,
  });

  // ---- 灯光 ----
  const ambient = new THREE.AmbientLight(0x2a3a52, 3.2);
  scene.add(ambient);
  const moon = new THREE.DirectionalLight(0xa9c4e8, 2.0);
  moon.position.set(-6, 14, 9);
  moon.target.position.set(0, 0, 0);
  scene.add(moon); scene.add(moon.target);
  if (cfg.shadows) SetupShadow(moon);
  const lanternLight = new THREE.PointLight(0xffb066, 0, 12, 1.35);
  scene.add(lanternLight);
  // 地表补光：只跟着玩家走的一小盏冷色补光。夜里地表没有暖光源，主角会糊在
  // 同样暗的地面上；这盏灯把剪影从背景里拉出来（"站位清楚"是硬要求）。
  const fillLight = new THREE.PointLight(0xa9c4e8, 0, 7.0, 1.2);
  fillLight.visible = false;
  scene.add(fillLight);
  const warmLights = [];
  for (let i = 0; i < QUALITY_PRESET.high.warmLights; i++) {
    const l = new THREE.PointLight(0xffb066, 0, 9, 1.4);
    l.visible = false;
    scene.add(l);
    warmLights.push(l);
  }

  // 地下暗角：跟着玩家走的一块巨大柔边暗罩。它同时解决两件事——
  //   1) 地下 80% 的实心土在远处沉下去，视线被收回坑道；
  //   2) 丢下马灯后画面真的变暗（规则层的潜行收益要在画面上兑现）。
  // 纵深现在主要交给雾（透视相机吃得到雾了），暗角只管收视线和灭灯的代价。
  // z 放在剖面正面(2.25)之前、FORE(5) 之后，所以压土层压角色，但不压前景剪影。
  const vignetteGeo = new THREE.PlaneGeometry(1, 1);
  const vignetteMesh = new THREE.Mesh(vignetteGeo, mats.vignette);
  vignetteMesh.position.z = 3.4;
  vignetteMesh.renderOrder = 26;
  vignetteMesh.frustumCulled = false;
  vignetteMesh.visible = false;
  scene.add(vignetteMesh);

  function SetupShadow(light) {
    light.castShadow = true;
    light.shadow.mapSize.set(1024, 1024);
    const c = light.shadow.camera;
    // 舞台变厚以后（地面台面向 -Z 退十几米），阴影视锥也要跟着放大，
    // 否则台面远端会在阴影图外面，出现一条硬邦邦的亮暗分界。
    c.left = -17; c.right = 17; c.top = 14; c.bottom = -16; c.near = 0.5; c.far = 96;
    light.shadow.bias = -0.0012;
    light.shadow.normalBias = 0.04;
    c.updateProjectionMatrix();
  }

  // ------------------------------------------------------------------
  // 胶片质感（后处理链）
  //
  // 一张全屏 RT + 一个全屏 quad 就够了；辉光另外走 1/4 分辨率两趟模糊。
  // low 档整条链关掉，直接渲屏幕，一个 pass 都不多花。
  //
  // 精度：主 pass 必须渲进 **HalfFloat** RT。这个游戏几乎全是暗部，
  // 8 位线性缓冲会把夜景的土墙、坑道壁压成一道道色带（three 对 RT 一律写
  // 线性值，不做 sRGB 编码，所以 8 位的有效精度全浪费在亮部）。
  // 拿不到 half-float 就直接不开后处理——宁可没有胶片感，也不要一屏色带。
  // ------------------------------------------------------------------

  const filmSupported = (function () {
    try {
      return !!(renderer.extensions.has('EXT_color_buffer_half_float') ||
        renderer.extensions.has('EXT_color_buffer_float'));
    } catch (e) { return false; }
  })();

  const fxCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const fxScene = new THREE.Scene();
  const fxGeo = new THREE.PlaneGeometry(2, 2);
  const fxQuad = new THREE.Mesh(fxGeo, null);
  fxQuad.frustumCulled = false;
  fxScene.add(fxQuad);

  const fxComposite = new THREE.ShaderMaterial({
    uniforms: {
      tDiffuse: { value: null }, tBloom: { value: null },
      uResolution: { value: new THREE.Vector2(1280, 720) },
      uTime: { value: 0 },
      uExposure: { value: 1.25 },
      uCA: { value: 0 }, uBloom: { value: 0 },
      uGrain: { value: new THREE.Vector2(0, 0) },
      uShadowTint: { value: new THREE.Color(0.78, 0.88, 1.18) },
      uHighTint: { value: new THREE.Color(1.10, 1.02, 0.88) },
      uSplit: { value: new THREE.Vector2(0, 0) },
      uVig: { value: new THREE.Vector2(0, 0.55) },
    },
    vertexShader: FX_VERT, fragmentShader: FX_COMPOSITE_FRAG,
    depthTest: false, depthWrite: false, toneMapped: false,
  });
  const fxBright = new THREE.ShaderMaterial({
    // 阈值卡得高：只有真正"在发光"的东西（窗纸后的油灯、马灯火苗、灶火）
    // 才过得去。压低到 0.7 时互动光晕那圈极淡的暖色边光也会被点着，
    // 画面上多出一串橙色甜甜圈——那是提示，不是光源，不该辉光。
    uniforms: { tDiffuse: { value: null }, uTexel: { value: new THREE.Vector2() }, uThreshold: { value: 1.15 } },
    vertexShader: FX_VERT, fragmentShader: FX_BRIGHT_FRAG,
    depthTest: false, depthWrite: false, toneMapped: false,
  });
  const fxBlur = new THREE.ShaderMaterial({
    uniforms: { tDiffuse: { value: null }, uDir: { value: new THREE.Vector2() } },
    vertexShader: FX_VERT, fragmentShader: FX_BLUR_FRAG,
    depthTest: false, depthWrite: false, toneMapped: false,
  });
  const fxTrail = new THREE.ShaderMaterial({
    uniforms: { tDiffuse: { value: null }, uAmount: { value: 0 } },
    vertexShader: FX_VERT, fragmentShader: FX_TRAIL_FRAG,
    depthTest: false, depthWrite: false, toneMapped: false, transparent: true,
  });

  let rtMain = null, rtPrev = null, rtBloomA = null, rtBloomB = null;
  let filmOn = false;
  let trailAmt = 0;
  let trailPrimed = false;

  function MakeTarget(w, h, withDepth) {
    const rt = new THREE.WebGLRenderTarget(Math.max(2, w), Math.max(2, h), {
      type: THREE.HalfFloatType,
      minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
      depthBuffer: !!withDepth, stencilBuffer: false, generateMipmaps: false,
    });
    rt.texture.colorSpace = THREE.LinearSRGBColorSpace;
    return rt;
  }

  function DisposeTargets() {
    const list = [rtMain, rtPrev, rtBloomA, rtBloomB];
    for (let i = 0; i < list.length; i++) { if (list[i]) { try { list[i].dispose(); } catch (e) { /* 忽略 */ } } }
    rtMain = null; rtPrev = null; rtBloomA = null; rtBloomB = null;
  }

  /** 按当前画质 / 视口重建后处理资源。Resize 与 SetQuality 都走这里。 */
  function RebuildFilm() {
    const want = !!(cfg.film && filmSupported && HAS_DOM);
    if (!want) { DisposeTargets(); filmOn = false; return; }
    const ratio = renderer.getPixelRatio();
    const w = Math.max(2, Math.round(viewW * ratio));
    const h = Math.max(2, Math.round(viewH * ratio));
    if (rtMain && rtMain.width === w && rtMain.height === h) { filmOn = true; return; }
    DisposeTargets();
    rtMain = MakeTarget(w, h, true);
    if (cfg.film.trail > 0) rtPrev = MakeTarget(w, h, false);
    if (cfg.film.bloom > 0) {
      const bw = Math.max(2, Math.round(w / 4)), bh = Math.max(2, Math.round(h / 4));
      rtBloomA = MakeTarget(bw, bh, false);
      rtBloomB = MakeTarget(bw, bh, false);
    }
    fxComposite.uniforms.uResolution.value.set(w, h);
    trailPrimed = false;
    filmOn = true;
  }

  /** 跑一个全屏 pass。零分配。 */
  function FxPass(mat, target) {
    fxQuad.material = mat;
    renderer.setRenderTarget(target || null);
    renderer.render(fxScene, fxCam);
    return renderer.info.render.calls;
  }

  // ---- 关卡级资源（BuildLevel 造，Dispose / 重建时释放）----
  const levelGeos = [];
  const levelMats = [];
  let levelRoot = null;          // 所有静态几何的父节点，便于一次性移除
  let level = null;
  let palette = PALETTE.night;

  let playerRig = null;
  const enemyRigs = new Map();
  const npcRigs = new Map();
  const enemyCones = new Map();
  const enemyConeMats = [];
  const blobs = [];              // 与 actor 一一对应的接触暗斑
  let bellRig = null;
  let bellRingT = -1;

  const glowSources = [];        // { x,y,z,base,phase,vStart,vCount, kind }
  let glowMesh = null, glowColorAttr = null;
  const haloItems = [];          // { x,y,r,vStart,vCount, propId }
  let haloMesh = null, haloColorAttr = null;
  let shaftMesh = null, shaftColorAttr = null;
  const shaftItems = [];

  const dynProps = [];           // { obj, kind, prop, base:{x,y,z} }
  const hazardViews = [];
  const gasFields = [];          // 毒烟的柔边烟团场（每个 hazard 一个，1 draw call）
  const foreOccluders = [];      // 会挡住玩家身体的前景 { x, w, z }
  let earthGroundRef = 0;
  let earthBackZ = -8.0;         // 剖面挤出体背面所在的 z（随 extrudeDepth 变）
  let levelExitMark = null;
  const skyMoon = [null, null];  // [光晕, 实心盘]，挂在相机下

  // 粒子池
  let dustGeo = null, dustPoints = null;
  let dustPos = null, dustCol = null, dustVel = null, dustLife = null, dustMax = null;
  let dustCursor = 0, dustCapacity = 0;

  // 浮尘（空气里的东西）。每层：一个 Points + 一份预生成的确定性相位表。
  // 位置每帧由 time 解析式算出来，不积分、不 new、不 Math.random()。
  const moteLayers = [];         // { points, geo, posAttr, colAttr, seed, band, n }

  // Sync 用的暂存
  let shakeExtra = 0;
  let elapsed = 0;
  let layerMix = 1;              // 1 = 地表, 0 = 地下
  let lastViewHeight = -1;
  const warmPick = new Int32Array(QUALITY_PRESET.high.warmLights);
  const warmPickD = new Float32Array(QUALITY_PRESET.high.warmLights);

  const stats = { drawCalls: 0, triangles: 0 };

  // ------------------------------------------------------------------
  // 建造工具
  // ------------------------------------------------------------------

  function TrackGeo(g) { if (g) levelGeos.push(g); return g; }
  function TrackMat(m) { if (m) levelMats.push(m); return m; }

  function NewBuckets() { return new Map(); }
  function BucketPush(buckets, key, geo) {
    if (!geo) return;
    let a = buckets.get(key);
    if (!a) { a = []; buckets.set(key, a); }
    a.push(geo);
  }
  function FlushBuckets(buckets, parent, zOffset, matOverride) {
    buckets.forEach(function (list, key) {
      const merged = SafeMerge(list);
      if (!merged) return;
      const mat = matOverride || mats[key] || mats.mud;
      const mesh = new THREE.Mesh(merged, mat);
      mesh.position.z = zOffset || 0;
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      if (cfg.shadows && !matOverride) { mesh.castShadow = true; mesh.receiveShadow = true; }
      parent.add(mesh);
      TrackGeo(merged);
    });
  }

  /** 造一个道具的局部几何，返回 { buckets, glows, shafts }。任何异常都降级。 */
  function BuildPropLocal(prop) {
    const buckets = NewBuckets();
    const glows = [], shafts = [];
    const rng = MakeRng(StrSeed(prop.id || prop.kind || 'p'));
    const ctx = {
      cyl: cfg.cyl, lathe: cfg.lathe, ico: cfg.ico,
      E(key, geo) { BucketPush(buckets, key, geo); },
      Glow(x, y, z, size, color, intensity, lightPower) {
        glows.push({ x, y, z, size, color, intensity, lightPower: lightPower || 0 });
      },
      Shaft(x, y, z, w, h, color, alpha, tilt) {
        shafts.push({ x, y, z, w, h, color, alpha, tilt: tilt || 0 });
      },
    };
    const builder = PROPS[prop.kind];
    try {
      if (builder) builder(ctx, prop, rng);
      else PlaceholderProp(ctx, prop, rng);
    } catch (e) {
      if (typeof console !== 'undefined') console.warn('[Render] 道具 ' + prop.kind + ' 构建失败，降级占位。', e);
      buckets.clear();
      try { PlaceholderProp(ctx, prop, rng); } catch (e2) { /* 忽略 */ }
    }
    return { buckets, glows, shafts };
  }

  function PropZ(p) {
    if (typeof p.z === 'number' && isFinite(p.z)) return p.z;
    if (p.interact && p.interact !== 'none') return LAYER_Z.PLAY;
    const d = PROP_DEFAULT_Z[p.kind];
    return typeof d === 'number' ? d : LAYER_Z.PLAY;
  }

  // ------------------------------------------------------------------
  // BuildLevel
  // ------------------------------------------------------------------

  function ClearLevel() {
    if (playerRig) { KillRig(playerRig); playerRig = null; }
    enemyRigs.forEach(KillRig); enemyRigs.clear();
    npcRigs.forEach(KillRig); npcRigs.clear();
    if (bellRig) {
      if (bellRig.group && bellRig.group.parent) bellRig.group.parent.remove(bellRig.group);
      if (ActorApi.Dispose && !bellRig.__fallback) { try { ActorApi.Dispose(bellRig); } catch (e) { /* 忽略 */ } }
      bellRig = null;
    }
    enemyCones.clear();
    for (let i = 0; i < enemyConeMats.length; i++) enemyConeMats[i].dispose();
    enemyConeMats.length = 0;
    blobs.length = 0;
    glowSources.length = 0;
    haloItems.length = 0;
    shaftItems.length = 0;
    dynProps.length = 0;
    hazardViews.length = 0;
    glowMesh = null; glowColorAttr = null;
    haloMesh = null; haloColorAttr = null;
    shaftMesh = null; shaftColorAttr = null;
    levelExitMark = null;
    dustGeo = null; dustPoints = null;
    moteLayers.length = 0;

    foreOccluders.length = 0;
    gasFields.length = 0;
    skyMoon[0] = null; skyMoon[1] = null;

    // 无条件清空：即使上一次 BuildLevel 中途炸了，也不许把残留几何留给下一关。
    // gFore 只清子组的内容，三个子组本身要留着（它们是渲染器级别的骨架）。
    gSky.clear();
    gFar.clear(); gBack.clear(); gDepth.clear(); gMid.clear(); gPlay.clear(); gFx.clear();
    gForePar.clear(); gForeFix.clear(); gForeTun.clear();
    for (let i = 0; i < levelGeos.length; i++) { try { levelGeos[i].dispose(); } catch (e) { /* 忽略 */ } }
    levelGeos.length = 0;
    for (let i = 0; i < levelMats.length; i++) { try { levelMats[i].dispose(); } catch (e) { /* 忽略 */ } }
    levelMats.length = 0;
    levelRoot = null;
  }

  function BuildLevel(lv) {
    try {
      ClearLevel();
      level = lv && typeof lv === 'object' ? lv : {};
      palette = PALETTE[level.timeOfDay] || PALETTE.night;
      levelRoot = gPlay;
      bellRingT = -1;
      // 开局就在地道里的幕（第 2 幕）不许先亮一下再暗下去
      layerMix = Clamp(((typeof level.startY === 'number' ? level.startY : 0) + 3.4) / 2.8, 0, 1);
      lastViewHeight = -1;

      const b = level.bounds || {};
      const bx0 = typeof b.x0 === 'number' ? b.x0 : 0;
      const bx1 = typeof b.x1 === 'number' ? b.x1 : 140;
      const byTop = typeof b.yTop === 'number' ? b.yTop : 6;
      const byBottom = typeof b.yBottom === 'number' ? b.yBottom : -12;

      // 每个阶段单独兜底：一个阶段炸了不许把整个场景带走。
      let outline = null;
      Phase('sky', function () { BuildSky(); });
      Phase('earth', function () { outline = BuildEarth(bx0, bx1, byTop, byBottom); });
      Phase('floors', function () { BuildFloors(bx0, bx1, outline); });
      Phase('backdrop', function () { BuildBackdrop(bx0, bx1, outline); });
      Phase('props', BuildProps);
      Phase('foreground', function () { BuildForeground(bx0, bx1, outline); });
      Phase('actors', BuildActors);
      Phase('hazards', BuildHazards);
      Phase('exit', BuildExitMark);
      Phase('batches', BuildBatches);
      Phase('dust', BuildDust);
      Phase('motes', BuildMotes);
    } catch (e) {
      if (typeof console !== 'undefined') console.error('[Render] BuildLevel 失败，场景可能不完整。', e);
    }
  }

  function Phase(name, fn) {
    try { fn(); }
    catch (e) {
      if (typeof console !== 'undefined') console.error('[Render] BuildLevel 阶段 "' + name + '" 失败，跳过。', e);
    }
  }

  // ---- 天幕 / 月 / 星 ----
  //
  // 全部挂在 gSky（相机的子节点）上，坐标是**相机局部坐标**。
  // 天空、月亮、星星在物理上是无穷远的：它们不该有视差，也不该被关卡长度
  // 甩出画面。以前月亮钉在世界 x 上，走到关卡另一头就再也看不见了。
  // gSky 距相机 SKY_DEPTH，可视半高 = tan(fov/2)*SKY_DEPTH，尺寸按它算。
  function BuildSky() {
    const halfH = HalfHeightAt(SKY_DEPTH);
    const halfW = halfH * Math.max(0.4, camera.aspect || 16 / 9);
    // 竖屏时 aspect < 1，半宽会缩水；统一按最宽的情况铺满，省得 Resize 后穿帮。
    const w = Math.max(halfW, halfH) * 3.2;
    const h = Math.max(halfW, halfH) * 3.2;

    const base = new THREE.Mesh(TrackGeo(GQuad(w, h, 0, 0, 0)), mats.skyBase);
    base.position.set(0, 0, 0);
    base.renderOrder = -200; base.frustumCulled = false;
    gSky.add(base);
    // 渐变：天顶深、地平线亮。贴图是一张竖向 alpha 渐变，所以这块四边形的高度
    // 必须**贴着可视范围**给（halfH*2.4），大了就只取到渐变最上面那一小截，
    // 地平线的辉光整个丢掉，天空变成一块死黑——顺带把"天空亮于土层"也搞反。
    const grad = new THREE.Mesh(TrackGeo(GQuad(w, halfH * 2.4, 0, 0, 0)), mats.sky);
    grad.position.set(0, 0, 0.4);
    grad.renderOrder = -199; grad.frustumCulled = false;
    gSky.add(grad);

    // 月：放在画面左上角，永远在那儿。这是《勇敢的心》式夜景的锚。
    // 具体位置交给 PlaceSkyMoon，横竖屏切换时它会跟着重新摆。
    const moonMesh = new THREE.Mesh(TrackGeo(GQuad(halfH * 0.85, halfH * 0.85, 0, 0, 0)), mats.moon);
    moonMesh.position.set(0, 0, 0.8);
    moonMesh.renderOrder = -190; moonMesh.frustumCulled = false;
    moonMesh.name = 'moon';
    gSky.add(moonMesh);
    const disc = new THREE.Mesh(
      TrackGeo(new THREE.CircleGeometry(halfH * 0.115, 22)),
      TrackMat(new THREE.MeshBasicMaterial({ color: 0xf2f6ff, fog: false, transparent: true, opacity: 1 }))
    );
    disc.position.set(0, 0, 1.0);
    disc.renderOrder = -189; disc.frustumCulled = false;
    gSky.add(disc);
    skyMoon[0] = moonMesh; skyMoon[1] = disc;
    PlaceSkyMoon();

    // 星：按最宽的那一边铺，横竖屏都不会露出没星星的角
    const spread = Math.max(halfW, halfH);
    const n = cfg.starCount;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = (Hash1(i * 3.1) - 0.5) * spread * 2.4;
      pos[i * 3 + 1] = (Hash1(i * 7.7 + 2) - 0.3) * spread * 2.2;
      pos[i * 3 + 2] = 0.6;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const stars = new THREE.Points(TrackGeo(g), mats.star);
    stars.frustumCulled = false; stars.renderOrder = -195;
    gSky.add(stars);
  }

  /** 月亮贴在画面左上角。相机 aspect 变了就重摆一次，不进 Sync。 */
  function PlaceSkyMoon() {
    if (!skyMoon[0]) return;
    const halfH = HalfHeightAt(SKY_DEPTH);
    const halfW = halfH * Math.max(0.4, camera.aspect || 16 / 9);
    const mx = -Math.min(halfW, halfH * 1.15) * 0.60;
    const my = halfH * 0.50;
    skyMoon[0].position.x = mx; skyMoon[0].position.y = my;
    skyMoon[1].position.x = mx; skyMoon[1].position.y = my;
  }

  // ---- 地下剖面 ----
  function BuildEarth(bx0, bx1, byTop, byBottom) {
    let outline = null;
    try { outline = ExtractEarthOutline(level, cfg); }
    catch (e) {
      if (typeof console !== 'undefined') console.warn('[Render] 地下剖面提取失败，用平板降级。', e);
    }
    earthGroundRef = outline ? outline.defaultGround : 0;

    const depth = cfg.extrudeDepth;
    const bevelT = 0.45, bevelS = 0.32;
    const zPos = EARTH_FRONT_Z - (depth + bevelT);
    // 挤出体背面。台面的远端、坑道的尽头都在这儿。
    earthBackZ = zPos - bevelT;
    const geos = [];

    if (outline && outline.contours.length) {
      for (let i = 0; i < outline.contours.length; i++) {
        const c = outline.contours[i];
        if (Math.abs(c.area) < 2) continue;
        try {
          const shape = ShapeFromLoop(c.pts, c.holes);
          const g = new THREE.ExtrudeGeometry(shape, {
            depth, curveSegments: 1, steps: 1,
            bevelEnabled: true, bevelThickness: bevelT, bevelSize: bevelS, bevelOffset: 0,
            bevelSegments: cfg.bevelSeg,
          });
          geos.push(g);
        } catch (e) { /* 单个轮廓失败就跳过 */ }
      }
    }
    if (geos.length === 0) {
      // 降级：一整块土板，至少不黑屏
      geos.push(new THREE.BoxGeometry(bx1 - bx0 + 12, Math.max(2, -byBottom), depth));
      geos[0].translate((bx0 + bx1) / 2, byBottom / 2, depth / 2);
    }

    const merged = SafeMerge(geos);
    if (merged) {
      // 注意：顶点 z 是几何局部坐标（-bevelThickness .. depth+bevelThickness），
      // 所以假 AO 的深度区间也必须用局部值，不能用世界 z。
      PaintEarthStrata(merged, earthGroundRef, depth + bevelT, -bevelT);
      const mesh = new THREE.Mesh(merged, mats.earth);
      mesh.position.z = zPos;
      mesh.matrixAutoUpdate = false; mesh.updateMatrix();
      mesh.frustumCulled = false;
      if (cfg.shadows) mesh.receiveShadow = true;
      gMid.add(mesh);
      TrackGeo(merged);
    }

    // 地道背墙：从洞里看进去的那面暗土墙。
    //
    // 位置有两条硬约束，透视相机下两条都会立刻穿帮：
    //  1) 它必须**紧贴**挤出体背面。离得远了，站在地表往下看时，背墙的顶边会
    //     从台面远端的上方冒出来，村庄背后凭空多出一堵棕色墙。
    //  2) 它的顶边不许高过地表线。这里压到 groundRef - 0.12，正好被台面远端遮住。
    const bwTop = earthGroundRef - 0.12;
    const bwBottom = byBottom - 6;
    const bw = new THREE.Mesh(
      TrackGeo(GQuad(bx1 - bx0 + 40, Math.max(4, bwTop - bwBottom), 0, 0, 0)),
      mats.earthBack
    );
    bw.position.set((bx0 + bx1) / 2, (bwTop + bwBottom) / 2, earthBackZ - 0.08);
    bw.matrixAutoUpdate = false; bw.updateMatrix();
    bw.frustumCulled = false;
    gMid.add(bw);

    return outline;
  }

  // ---- 地板：透视下它不是一条台沿，是一块向 -Z 退进去的台面 ----
  //
  // 玩家站在台面靠前的边缘（z≈0），台面一路退到剖面挤出体的背面。
  // 这是"舞台有厚度"里最便宜也最有效的一条：地面一有进深，画面立刻不平了。
  function BuildFloors(bx0, bx1, outline) {
    const floors = Array.isArray(level.floors) ? level.floors : [];
    const buckets = NewBuckets();
    const tunnelSlabs = [];
    const tunnelFloors = [];
    // 台面前沿：略微伸到玩家身前，让"站在台沿上"有个可读的边
    const deckFront = 1.55;
    const deckBack = earthBackZ + 0.25;
    const deckDepth = Math.max(2.0, deckFront - deckBack);
    const deckZ = (deckFront + deckBack) / 2;

    for (let i = 0; i < floors.length; i++) {
      const f = floors[i];
      if (!f || typeof f.x0 !== 'number' || typeof f.x1 !== 'number' || typeof f.y !== 'number') continue;
      const w = f.x1 - f.x0;
      if (w <= 0.01) continue;
      const cx = (f.x0 + f.x1) / 2;
      if (f.kind === 'tunnel') {
        tunnelFloors.push(f);
        // 坑道地面必须一路铺到挤出体背面。只铺 2.6 米的话，后面那截会直接
        // 看到背墙——坑道就读成"墙上一道缝"，而不是"一条走得进去的通道"。
        tunnelSlabs.push(GBox(w, 0.34, deckDepth, cx, f.y - 0.17, deckZ));
        tunnelSlabs.push(GBox(w, 0.05, deckDepth - 0.5, cx, f.y - 0.005, deckZ));
        // 坑道里的暖底：沿地面和顶板各铺一串极淡的暖光斑。
        // 没有它，"该走人的空间"是一条纯黑的缝，读起来像"棕墙上挖了道黑槽"，
        // 而不是"你在一条通道里"——支撑木、粮罐、梯子全在黑里消失。
        const amb = Math.max(1, Math.round(w / 4.2));
        for (let k = 0; k < amb; k++) {
          const gx = f.x0 + w * ((k + 0.5) / amb);
          glowSources.push({
            x: gx, y: f.y + 0.28, z: -1.4, size: 5.4, color: 0xd08a42, base: 0.10,
            lightPower: 0, phase: StrSeed('tfa' + i + k) * 6.28,
            propId: null, vStart: 0, vCount: 0, on: true, tunnelOnly: true,
          });
          glowSources.push({
            x: gx, y: f.y + 1.92, z: -1.4, size: 4.2, color: 0xb87438, base: 0.055,
            lightPower: 0, phase: StrSeed('tfb' + i + k) * 6.28,
            propId: null, vStart: 0, vCount: 0, on: true, tunnelOnly: true,
          });
        }
      } else if (f.kind === 'stone') {
        // 石板路：一块有厚度的台面 + 前沿的一道石棱（透视下这道棱就是"台沿"）
        BucketPush(buckets, 'stone', GBox(w, 0.42, deckDepth, cx, f.y - 0.21, deckZ));
        BucketPush(buckets, 'stone', GBox(w, 0.16, 0.34, cx, f.y - 0.06, deckFront - 0.1));
        const slabs = Math.max(2, Math.round(w / 1.6));
        for (let k = 0; k < slabs; k++) {
          // 板缝：沿 Z 拉一条窄暗槽，正是它让台面读出"往里退"
          BucketPush(buckets, 'mudDark', GBox(0.08, 0.05, deckDepth * 0.82,
            f.x0 + w * ((k + 1) / (slabs + 1)), f.y - 0.005, deckZ - 0.4));
        }
      } else if (f.kind === 'roof') {
        // 屋顶：檐口向前挑出，两侧压瓦。人踩上去时脚下有实实在在的一块面。
        BucketPush(buckets, 'tile', GBox(w, 0.26, 4.6, cx, f.y - 0.13, -0.5));
        BucketPush(buckets, 'tile', GBox(w + 0.5, 0.14, 0.5, cx, f.y - 0.2, 2.2));
        BucketPush(buckets, 'woodDark', GBox(w + 0.5, 0.12, 0.16, cx, f.y - 0.32, 2.42));
      } else if (f.kind === 'plank') {
        BucketPush(buckets, 'wood', GBox(w, 0.18, 2.6, cx, f.y - 0.09, -0.2));
        const planks = Math.max(2, Math.round(w / 0.9));
        for (let k = 0; k < planks; k++) {
          BucketPush(buckets, 'woodDark', GBox(0.05, 0.05, 2.5,
            f.x0 + w * ((k + 1) / (planks + 1)), f.y + 0.005, -0.2));
        }
        BucketPush(buckets, 'woodDark', GBox(0.14, 0.5, 0.3, f.x0 + 0.3, f.y - 0.3, 0.9));
        BucketPush(buckets, 'woodDark', GBox(0.14, 0.5, 0.3, f.x1 - 0.3, f.y - 0.3, 0.9));
        BucketPush(buckets, 'woodDark', GBox(0.14, 0.5, 0.3, f.x0 + 0.3, f.y - 0.3, -1.3));
        BucketPush(buckets, 'woodDark', GBox(0.14, 0.5, 0.3, f.x1 - 0.3, f.y - 0.3, -1.3));
      } else if (Math.abs(f.y - earthGroundRef) > 0.4) {
        // 台地 / 土坡：地表线以外的土地才补一块，同样是有进深的台子
        BucketPush(buckets, 'mud', GBox(w, 0.55, deckDepth * 0.7, cx, f.y - 0.28, deckZ * 0.7 + 0.4));
      }
    }

    // 坑道地面单独一个 mesh：它要用自带暖底的材质，掉进纯黑就前功尽弃。
    const tunnelDeck = SafeMerge(tunnelSlabs);
    if (tunnelDeck) {
      const mesh = new THREE.Mesh(tunnelDeck, mats.tunnelFloor);
      mesh.matrixAutoUpdate = false; mesh.updateMatrix();
      mesh.frustumCulled = false;
      if (cfg.shadows) mesh.receiveShadow = true;
      gPlay.add(mesh);
      TrackGeo(tunnelDeck);
    }
    // 竖井里的梯子 / 绳
    const shafts = Array.isArray(level.shafts) ? level.shafts : [];
    for (let i = 0; i < shafts.length; i++) {
      const s = shafts[i];
      if (!s || typeof s.x !== 'number') continue;
      const yT = typeof s.yTop === 'number' ? s.yTop : 0;
      const yB = typeof s.yBottom === 'number' ? s.yBottom : yT - 5;
      const h = Math.abs(yT - yB);
      const yc = (yT + yB) / 2;
      if (s.kind === 'rope') {
        BucketPush(buckets, 'cloth', GBox(0.07, h, 0.07, s.x, yc, -0.35));
        const knots = Math.max(1, Math.floor(h / 0.9));
        for (let k = 0; k < knots; k++) BucketPush(buckets, 'cloth', GBox(0.14, 0.1, 0.14, s.x, Math.min(yT, yB) + 0.5 + k * 0.9, -0.35));
      } else if (s.kind === 'dirt') {
        // 土壁：一排掏出来的脚窝
        const steps = Math.max(1, Math.floor(h / 0.6));
        for (let k = 0; k < steps; k++) {
          BucketPush(buckets, 'mudDark', GBox(0.42, 0.1, 0.36, s.x + (k % 2 ? 0.2 : -0.2), Math.min(yT, yB) + 0.35 + k * 0.6, -0.55));
        }
      } else {
        // 梯子用 timber：坑道环境光下普通 wood 算出来是纯黑，整条梯子消失。
        // 踏棍在 z 上给出厚度，透视下梯子有正反面，能读出朝向。
        BucketPush(buckets, 'timber', GBox(0.1, h, 0.1, s.x - 0.24, yc, -0.32));
        BucketPush(buckets, 'timber', GBox(0.1, h, 0.1, s.x + 0.24, yc, -0.32));
        const rungs = Math.max(1, Math.floor(h / 0.42));
        for (let k = 0; k < rungs; k++) BucketPush(buckets, 'timber', GBox(0.56, 0.07, 0.16, s.x, Math.min(yT, yB) + 0.25 + k * 0.42, -0.32));
      }
    }
    if (cfg.groundLines) BuildGroundLines(buckets, bx0, bx1, outline, deckFront, deckBack, deckZ, deckDepth, tunnelFloors);
    FlushBuckets(buckets, gPlay, 0);
  }

  // ---- 地面的纵深线 ----
  //
  // **一组沿 Z 的平行线向纵深收敛**是人眼判断距离最强的信号，比大气透视、
  // 比视差都强，而且它是纯几何——全部并进 BuildFloors 已经在用的合批桶，
  // 一个 draw call 都不多花。改之前那块台面干净得像张纸，透视全白给了。
  //
  // 三样东西：车辙（两道 1.3 米间距的槽）、垄沟（一小片田）、篱笆桩
  // （**同一个 x 上沿 Z 排开的一列桩子**——近的大远的小，最直接的深度尺）。
  // 全部压在地表线上 2 厘米，绝不许高到能挡住玩家的脚。
  function BuildGroundLines(buckets, bx0, bx1, outline, deckFront, deckBack, deckZ, deckDepth, tunnels) {
    const groundAt = outline && typeof outline.groundY === 'function'
      ? outline.groundY : function () { return earthGroundRef; };
    const span = Math.max(1, bx1 - bx0);

    // 避开地道口 / 竖井：那些地方地表是破的，槽画上去会浮在洞口上。
    const skip = [];
    const hatches = Array.isArray(level.hatches) ? level.hatches : [];
    for (let i = 0; i < hatches.length; i++) if (typeof hatches[i].x === 'number') skip.push(hatches[i].x);
    const shafts = Array.isArray(level.shafts) ? level.shafts : [];
    for (let i = 0; i < shafts.length; i++) if (shafts[i] && typeof shafts[i].x === 'number') skip.push(shafts[i].x);
    function Blocked(x, r) {
      for (let i = 0; i < skip.length; i++) if (Math.abs(skip[i] - x) < r) return true;
      return false;
    }

    const zc = deckZ, dz = deckDepth * 0.94;
    const nSlot = Math.max(3, Math.floor(span / 10.5));
    for (let i = 0; i < nSlot; i++) {
      const x = bx0 + span * ((i + 0.5) / nSlot) + (Hash1(i * 4.7 + 1) - 0.5) * 4.5;
      if (Blocked(x, 3.2)) continue;
      const gy = groundAt(x);
      // 地表线塌得厉害的地方（沟、坎）不画：槽是平地上的东西
      if (Math.abs(gy - groundAt(x + 1.4)) > 0.35 || Math.abs(gy - groundAt(x - 1.4)) > 0.35) continue;
      const pick = Hash1(i * 9.1 + 6);
      if (pick < 0.42) {
        // 车辙：两道，中间再来一条被牲口踩实的浅印
        const gap = 1.22 + Hash1(i * 2.3) * 0.22;
        BucketPush(buckets, 'mudDark', GBox(0.17, 0.05, dz, x - gap / 2, gy + 0.012, zc));
        BucketPush(buckets, 'mudDark', GBox(0.17, 0.05, dz, x + gap / 2, gy + 0.012, zc));
        BucketPush(buckets, 'mudDark', GBox(0.42, 0.03, dz * 0.72, x, gy + 0.006, zc - 0.3));
      } else if (pick < 0.74) {
        // 垄沟：五六条等距的浅槽。等距 + 沿 Z = 收敛，这是最"数学"的一条深度线
        const rows = 5 + (Hash1(i * 6.1) > 0.5 ? 2 : 0);
        const step = 0.46;
        for (let k = 0; k < rows; k++) {
          BucketPush(buckets, 'mudDark', GBox(0.13, 0.045, dz * (0.8 + Hash1(i * 3.1 + k) * 0.2),
            x + (k - (rows - 1) / 2) * step, gy + 0.010, zc));
        }
      } else {
        // 篱笆桩：同一个 x 上沿 Z 排开的一列。它们在屏幕上几乎重合，
        // 只有高度和间距在变——这就是"往里走"最干净的读法。
        const posts = 5;
        for (let k = 0; k < posts; k++) {
          const pz = deckFront - 0.6 - (deckFront - deckBack - 1.0) * (k / (posts - 1));
          const ph = 0.52 + Hash1(i * 7.7 + k) * 0.16;
          BucketPush(buckets, 'woodDark', GBox(0.11, ph, 0.11, x + (Hash1(i * 11.3 + k) - 0.5) * 0.18, gy + ph / 2, pz));
        }
        // 横杆：两根，把桩子串成一条向里退的线
        const zl = deckFront - deckBack - 1.0;
        BucketPush(buckets, 'woodDark', GBox(0.07, 0.07, zl, x, gy + 0.46, (deckFront - 0.6 + deckBack + 0.4) / 2));
        BucketPush(buckets, 'woodDark', GBox(0.06, 0.06, zl, x, gy + 0.24, (deckFront - 0.6 + deckBack + 0.4) / 2));
      }
    }

    // 坑道：地上的拖痕 + 一串向里退的顶架。
    // 顶架全部落在 z<-3 的凹进去那一段，永远不会挡住 z≈0.55 的玩家，
    // 但走起来一榀比一榀小，坑道立刻变成"能走进去的一条道"。
    for (let i = 0; i < tunnels.length; i++) {
      const f = tunnels[i];
      const tw = f.x1 - f.x0;
      const nRib = Math.max(1, Math.floor(tw / 4.6));
      for (let k = 0; k < nRib; k++) {
        const x = f.x0 + tw * ((k + 0.5) / nRib);
        if (Blocked(x, 1.6)) continue;
        const ribZ = [-3.6, -6.9];
        for (let r = 0; r < ribZ.length; r++) {
          const rz = Math.max(deckBack + 0.5, ribZ[r]);
          const hw = 1.05;
          BucketPush(buckets, 'timber', GBox(0.16, 1.9, 0.24, x - hw, f.y + 0.95, rz));
          BucketPush(buckets, 'timber', GBox(0.16, 1.9, 0.24, x + hw, f.y + 0.95, rz));
          BucketPush(buckets, 'timber', GBox(hw * 2 + 0.34, 0.18, 0.26, x, f.y + 1.98, rz));
        }
        // 顺水木：把两榀连起来，沿 -Z 的两条线就是纵深本身
        const zm = (ribZ[0] + ribZ[1]) / 2, zl2 = Math.abs(ribZ[0] - ribZ[1]) + 0.3;
        BucketPush(buckets, 'timber', GBox(0.10, 0.10, zl2, x - 1.05, f.y + 1.88, zm));
        BucketPush(buckets, 'timber', GBox(0.10, 0.10, zl2, x + 1.05, f.y + 1.88, zm));
      }
      // 拖痕：沿 Z 的两道浅槽，坑道地面不再是一块干净的板
      const nDrag = Math.max(1, Math.floor(tw / 7.5));
      for (let k = 0; k < nDrag; k++) {
        const x = f.x0 + tw * ((k + 0.5) / nDrag) + (Hash1(i * 3.7 + k) - 0.5) * 2.4;
        BucketPush(buckets, 'mudDark', GBox(0.14, 0.05, deckDepth * 0.9, x - 0.35, f.y + 0.015, deckZ));
        BucketPush(buckets, 'mudDark', GBox(0.14, 0.05, deckDepth * 0.9, x + 0.35, f.y + 0.015, deckZ));
      }
    }
  }

  // ---- 远山 + 远处村舍剪影 ----
  function BuildBackdrop(bx0, bx1, outline) {
    const span = bx1 - bx0;
    // 远山（FAR）：确定性山脊。
    // FAR 在 z=-26，透视下只有玩法平面 55% 左右的大小，旧的高度（最高 6 米）
    // 缩完只剩两米出头，跟 BACK 的村舍剪影撞在同一条高度上，层次糊掉。
    // 山脊整体拔高，缩完之后仍然明确压在村舍之上。
    const ridge = [];
    const segN = Math.max(24, Math.floor(span / 6));
    const ptsA = [];
    for (let i = 0; i <= segN; i++) {
      const x = bx0 - 120 + (span + 300) * (i / segN);
      const y = 2.1 + Fbm2(x * 0.017, 1.3, 3) * 3.3 + Math.sin(x * 0.031) * 1.0;
      ptsA.push(x, y);
    }
    ptsA.push(bx1 + 180, -40, bx0 - 120, -40);
    ridge.push(GPrism(ptsA, 0.4, 0, 0, 0));
    const ptsB = [];
    for (let i = 0; i <= segN; i++) {
      const x = bx0 - 120 + (span + 300) * (i / segN);
      const y = 0.9 + Fbm2(x * 0.026 + 40, 8.1, 3) * 2.1;
      ptsB.push(x, y);
    }
    ptsB.push(bx1 + 180, -40, bx0 - 120, -40);
    ridge.push(GPrism(ptsB, 0.4, 0, 0, 5));
    const rm = SafeMerge(ridge);
    if (rm) {
      const mesh = new THREE.Mesh(rm, mats.farSil);
      mesh.position.y = earthGroundRef;
      mesh.matrixAutoUpdate = false; mesh.updateMatrix(); mesh.frustumCulled = false;
      gFar.add(mesh); TrackGeo(rm);
    }

    // 远处村舍剪影（BACK）。z=-14 缩到 70%，所以整体也要放大一点。
    const houses = [];
    const count = Math.max(6, Math.floor(span / 14));
    for (let i = 0; i < count; i++) {
      const t = (i + 0.5) / count;
      const x = bx0 - 40 + (span + 80) * t + (Hash1(i * 5.3) - 0.5) * 8;
      const w = 5.2 + Hash1(i * 2.1) * 6.4;
      const h = 3.0 + Hash1(i * 9.7) * 2.0;
      const r = h + 0.9 + Hash1(i * 4.4) * 0.8;
      // 剪影也给一点厚度：BACK 层在透视下会露出很窄的一条侧面，
      // 那条侧面正是"这一层比玩法层远"的证据。
      houses.push(GPrism([-w / 2, 0, w / 2, 0, w / 2, h, 0, r, -w / 2, h], 2.2, x, earthGroundRef - 1.0, 0));
      if (Hash1(i * 11.1) > 0.62) {
        houses.push(GBox(0.45, 1.4, 0.6, x + w * 0.3, earthGroundRef + h + 0.1, 0));
      }
    }
    // 一排树线
    for (let i = 0; i < count; i++) {
      const x = bx0 - 44 + (span + 88) * ((i + 0.2) / count) + Hash1(i * 13.7) * 6;
      const h = 4.4 + Hash1(i * 3.9) * 3.2;
      houses.push(GBox(0.36, h, 0.4, x, earthGroundRef + h / 2 - 1.0, -1.6));
      houses.push(GIco(1, 0, x, earthGroundRef + h - 0.6, -1.6, 1.5, 1.1, 0.8));
    }
    const hm = SafeMerge(houses);
    if (hm) {
      const mesh = new THREE.Mesh(hm, mats.backSil);
      mesh.matrixAutoUpdate = false; mesh.updateMatrix(); mesh.frustumCulled = false;
      gBack.add(mesh); TrackGeo(hm);
    }

    // 大气透视：三道空气墙，越远越厚。雾负责连续衰减，这三道负责把
    // FAR / BACK / MID 之间切出一眼可读的层次差。low 档关掉。
    //
    // 每道墙带高度梯度（TEX_DRAW.haze）：满强度落在 groundRef+0.5 以下，
    // 到 groundRef+9 归零。所以它洗的是地平线附近的景物，天幕一点不碰——
    // 这才是真实的大气透视（雾在地面最浓，山顶先露出来），也是敢把强度
    // 从 0.16/0.11/0.07 加到 0.34/0.22/0.12 的原因。
    if (cfg.hazePlanes) {
      const hazeZ = [LAYER_Z.FAR + 7, LAYER_Z.BACK + 4, LAYER_Z.MID + 2.4];
      for (let i = 0; i < 3; i++) {
        const q = new THREE.Mesh(TrackGeo(GQuad(span + 400, HAZE_H, 0, 0, 0)), hazeMats[i]);
        q.position.set((bx0 + bx1) / 2, earthGroundRef + HAZE_TOP_OFF - HAZE_H / 2, hazeZ[i]);
        q.renderOrder = -60 + i; q.frustumCulled = false;
        q.userData.isHaze = true;
        gFx.add(q);
      }
      // 贴地薄雾：只有 4.2 米厚，压在地平线上。窄是关键——宽一点就变成
      // 第四道空气墙，把天空一起抬亮，「村庄 > 天空」当场翻掉（实测过）。
      const mq = new THREE.Mesh(TrackGeo(GQuad(span + 400, 4.2, 0, 0, 0)), mats.mist);
      mq.position.set((bx0 + bx1) / 2, earthGroundRef + 0.4, -8.0);
      mq.renderOrder = -57; mq.frustumCulled = false;
      mq.userData.isHaze = true;
      gFx.add(mq);
    }

    // 中间层 / 浮尘 / 失焦叶团一律**照造不误**，靠 visible 开关档位。
    // 它们都是极小的合并 mesh，造出来放着不画的代价可以忽略；换来的是
    // SetQuality 双向都立刻生效（否则 low→high 得等下一次 BuildLevel）。
    BuildDepthLayers(bx0, bx1, span);
    gDepth.visible = !!cfg.depthLayers;
    BuildMoonShafts(bx0, bx1, span);
  }

  // ---- 中间层：把五档层次填成连续梯度 ----
  //
  // 改之前 FAR(-26) / BACK(-14) / MID(-6) 之间是断的，三层一样大的卡片
  // 摆在三个 z 上，眼睛只读到"三张贴纸"。补进 -31 / -20 / -10 三层之后，
  // 相邻两层的视差速度差从 1.9 倍收到 1.25 倍左右，走起来是连续退去的。
  // 每层一个合并 mesh = 1 draw call。
  function BuildDepthLayers(bx0, bx1, span) {
    // A) -31：最远的一道山脊。这个距离上雾吃掉九成，只剩一线比天空亮的边，
    //    正是"再远还有山"的那一笔。轮廓要软、要低，不许和 FAR 的山脊撞形。
    //    限高严格按 MOON_CLEAR_NDC 反推（地表标称视口是最紧的一档）：
    //    第一版给到 9.4 米，实测直接把月亮啃掉半个，构图当场垮掉。
    const deep = [];
    const segD = Math.max(18, Math.floor(span / 9));
    const deepCap = MOON_CLEAR_NDC * HalfHeightAt(CameraDistanceFor(CAMERA.viewHeight) - DEPTH_LAYER_Z.RIDGE_FAR)
      + CAMERA.surfaceLift;
    const ptsD = [];
    for (let i = 0; i <= segD; i++) {
      const x = bx0 - 180 + (span + 420) * (i / segD);
      const y = 1.5 + Fbm2(x * 0.011 + 7.3, 22.5, 3) * 2.2 + Math.sin(x * 0.019 + 1.1) * 0.6;
      ptsD.push(x, Math.min(y, deepCap));
    }
    ptsD.push(bx1 + 250, -40, bx0 - 180, -40);
    deep.push(GPrism(ptsD, 0.4, 0, 0, 0));
    const dm = SafeMerge(deep);
    if (dm) {
      const mesh = new THREE.Mesh(dm, mats.ridgeSil);
      mesh.position.set(0, earthGroundRef, DEPTH_LAYER_Z.RIDGE_FAR);
      mesh.matrixAutoUpdate = false; mesh.updateMatrix(); mesh.frustumCulled = false;
      gDepth.add(mesh); TrackGeo(dm);
    }

    // B) -20：FAR 与 BACK 之间。树线 + 更远的屋顶 + 一座砖塔。
    //    这里放"和 BACK 同类但更小"的东西是有意的——同一种物体在两个尺度上
    //    出现，眼睛立刻把尺寸差读成距离差，比换一种新形状管用得多。
    const grove = [];
    const nG = Math.max(9, Math.floor(span / 8.5));
    for (let i = 0; i < nG; i++) {
      const x = bx0 - 60 + (span + 120) * ((i + 0.5) / nG) + (Hash1(i * 6.7 + 3) - 0.5) * 6;
      // 冠顶压在 BACK 那排村舍的屋脊线附近，不许整片顶进天空里——
      // 每多一块亮剪影伸进天空，「村庄 > 天空」这条序位就少一点余量。
      const h = 2.9 + Hash1(i * 2.9 + 1) * 2.3;
      // 树：一根杆 + 三团互相咬住的冠。密度调到冠与冠会重叠——这一层要读成
      // 一条**树线**，不是一排飘着的菱形；单个 GIco 的剪影就是个菱形。
      grove.push(GBox(0.28, h, 0.32, x, earthGroundRef + h / 2 - 0.6, 0));
      // 冠用 cfg.ico 细分：detail=0 的八面体正面就是个菱形，一排菱形读成
      // "飘着的风筝"而不是树。这一层的冠比 BACK 那排大，菱形边更扎眼。
      grove.push(GIco(1, cfg.ico, x, earthGroundRef + h - 0.35, 0, 1.55, 1.05, 0.7));
      grove.push(GIco(1, cfg.ico, x + 0.95, earthGroundRef + h - 0.85, 0.4, 1.15, 0.78, 0.6));
      grove.push(GIco(1, cfg.ico, x - 0.85, earthGroundRef + h - 0.80, -0.3, 1.05, 0.72, 0.6));
      if (Hash1(i * 15.1) > 0.62) {
        const w = 3.6 + Hash1(i * 4.3) * 3.4;
        const hh = 2.2 + Hash1(i * 8.1) * 1.4;
        grove.push(GPrism([-w / 2, 0, w / 2, 0, w / 2, hh, 0, hh + 0.8, -w / 2, hh],
          1.6, x + 4.4 + Hash1(i * 9.3) * 5, earthGroundRef - 0.7, 0));
      }
    }
    // 一座砖塔／烟囱：给这一层一个能记住的地标，走的时候它退得比村舍慢
    const towerX = bx0 + span * 0.63;
    grove.push(GBox(1.4, 7.0, 1.4, towerX, earthGroundRef + 3.0, 0));
    grove.push(GBox(1.9, 0.5, 1.9, towerX, earthGroundRef + 6.7, 0));
    const gm = SafeMerge(grove);
    if (gm) {
      const mesh = new THREE.Mesh(gm, mats.groveSil);
      mesh.position.z = DEPTH_LAYER_Z.GROVE;
      mesh.matrixAutoUpdate = false; mesh.updateMatrix(); mesh.frustumCulled = false;
      gDepth.add(mesh); TrackGeo(gm);
    }

    // C) -10.8：BACK 与 MID 之间。院墙、电线杆 + 垂弧的线、碾道。
    //    电线杆是这一层的主角：**一串等间距、等高的东西沿 X 排开**，透视下
    //    近的高远的矮，是判读距离最直接的尺子；垂下来的线把它们串成一条。
    //
    //    两条从实测里学来的规矩：
    //     1) 杆顶必须压在村舍屋脊线以下。第一版给了 7.4 米，电线直接横穿
    //        月亮，整幅画被一根线切成两半。
    //     2) 横担要短、要低于杆顶。长横担顶在杆顶上，剪影就是个十字架——
    //        一排十字架立在中国村庄的地平线上，是硬伤不是风格。
    const yard = [];
    const poleGap = 19.0;
    const nP = Math.max(3, Math.ceil((span + 60) / poleGap));
    const pole0 = bx0 - 30;
    const poleH = 5.0;
    const wireY = earthGroundRef + poleH - 0.9;
    for (let i = 0; i < nP; i++) {
      const x = pole0 + i * poleGap;
      yard.push(GBox(0.24, poleH, 0.26, x, earthGroundRef + poleH / 2 - 0.4, 0));
      yard.push(GBox(0.92, 0.13, 0.17, x, wireY, 0));               // 短横担，低于杆顶 0.5
      yard.push(GBox(0.10, 0.26, 0.12, x - 0.34, wireY + 0.18, 0)); // 瓷瓶
      yard.push(GBox(0.10, 0.26, 0.12, x + 0.34, wireY + 0.18, 0));
      // 电线：四段折线近似垂弧。段与段必须接上，否则读成一排短横线。
      if (i < nP - 1) {
        for (let k = 0; k < 4; k++) {
          const u0 = k / 4, u1 = (k + 1) / 4;
          const sag = 0.72;
          const y0 = wireY + 0.2 - Math.sin(u0 * Math.PI) * sag;
          const y1 = wireY + 0.2 - Math.sin(u1 * Math.PI) * sag;
          const cxw = x + poleGap * (u0 + u1) / 2;
          const dy = y1 - y0, dx = poleGap * 0.25;
          yard.push(GBox(Math.sqrt(dx * dx + dy * dy), 0.055, 0.07,
            cxw, (y0 + y1) / 2, 0, Math.atan2(dy, dx)));
        }
      }
    }
    // 院墙：长、低、断续、顶边有起伏。它把这一层压在地平线上，村舍不再是
    // "浮着的剪影"。一整块等高的长条会读成一块蓝色 UI 面板（第一版就是），
    // 所以拆成几段不等高的墙，段与段之间留豁口。
    const nW = Math.max(4, Math.floor(span / 22));
    for (let i = 0; i < nW; i++) {
      const x = bx0 - 20 + (span + 40) * ((i + 0.5) / nW) + (Hash1(i * 11.7 + 9) - 0.5) * 10;
      const w = 10 + Hash1(i * 3.3) * 12;
      const segs = 3;
      for (let k = 0; k < segs; k++) {
        const sw = w / segs * (0.82 + Hash1(i * 7.1 + k) * 0.16);
        const sh = 1.35 + Hash1(i * 4.9 + k * 2.3) * 0.55;
        const sx = x + (k - (segs - 1) / 2) * (w / segs);
        yard.push(GBox(sw, sh, 1.0, sx, earthGroundRef + sh / 2 - 0.35, 0));
        yard.push(GBox(sw + 0.4, 0.22, 1.35, sx, earthGroundRef + sh - 0.28, 0));  // 墙帽
      }
      // 门楼：墙上一个可读的凸起，纯剪影也要有内容
      if (Hash1(i * 5.9) > 0.5) {
        yard.push(GBox(2.4, 0.9, 1.3, x + w * 0.18, earthGroundRef + 1.45, 0));
        yard.push(GPrism([-1.6, 0, 1.6, 0, 0, 0.9], 1.6, x + w * 0.18, earthGroundRef + 1.9, 0));
      }
    }
    // 碾道：一盘碾 + 碾架。低矮、圆，跟一堆方剪影拉开形状差。
    const millX = bx0 + span * 0.31;
    yard.push(GCylY(1.9, 2.0, 0.5, Math.max(8, cfg.cyl), millX, earthGroundRef - 0.1, 0));
    yard.push(GCylY(0.55, 0.55, 1.15, Math.max(8, cfg.cyl), millX + 1.0, earthGroundRef + 0.7, 0.5));
    yard.push(GBox(2.6, 0.16, 0.2, millX + 0.3, earthGroundRef + 1.25, 0.5, 0.12));
    const ym = SafeMerge(yard);
    if (ym) {
      const mesh = new THREE.Mesh(ym, mats.yardSil);
      mesh.position.z = DEPTH_LAYER_Z.YARD;
      mesh.matrixAutoUpdate = false; mesh.updateMatrix(); mesh.frustumCulled = false;
      gDepth.add(mesh); TrackGeo(ym);
    }
  }

  // ---- 体积光：穿过树冠的月光 ----
  //
  // 光柱本身就是纵深，因为它**有长度**：一道从画面外斜插到地面的光，
  // 一眼给出"这里有很深的一段空气"。全部并进已有的 shaft 合批，0 draw call。
  // 强度必须极小（0.03–0.06）：月光柱一亮就成了舞台追光，而且会把天空洗白。
  function BuildMoonShafts(bx0, bx1, span) {
    const n = Math.max(2, Math.floor(span / 34));
    for (let i = 0; i < n; i++) {
      const x = bx0 + span * ((i + 0.5) / n) + (Hash1(i * 21.3 + 4) - 0.5) * 16;
      const beams = 2 + (Hash1(i * 7.1) > 0.55 ? 1 : 0);
      for (let k = 0; k < beams; k++) {
        const h = 11 + Hash1(i * 3.9 + k * 1.7) * 5;
        // z 拉开：同一束光在两三个深度上各有一片，透视下它们错开成一个楔形，
        // 这就是"体积"——单独一片永远只是贴在背景上的一条亮带。
        const z = -12.5 + k * 5.2 + Hash1(i * 5.5 + k) * 2.0;
        shaftItems.push({
          x: x + k * 2.3, y: earthGroundRef + 3.2 + Hash1(i * 9.1 + k) * 1.4,
          z,
          w: 2.4 + Hash1(i * 13.3 + k) * 2.6, h,
          color: 0xbcd2f2, alpha: 0.044 - k * 0.009, tilt: -0.30 - Hash1(i * 2.7 + k) * 0.10,
          phase: StrSeed('ms' + i + '_' + k) * 6.28, vStart: 0, vCount: 0,
          surfaceOnly: true,
        });
      }
    }
  }

  // ---- 道具 ----
  function BuildProps() {
    const props = Array.isArray(level.props) ? level.props : [];
    const staticBuckets = NewBuckets();
    const foreBuckets = NewBuckets();
    const mat4 = new THREE.Matrix4();
    const mat4b = new THREE.Matrix4();

    for (let i = 0; i < props.length; i++) {
      const p = props[i];
      if (!p || typeof p !== 'object') continue;
      const px = typeof p.x === 'number' ? p.x : 0;
      const py = typeof p.y === 'number' ? p.y : 0;
      const pz = PropZ(p);
      const facing = p.facing === -1 ? -1 : 1;
      const local = BuildPropLocal(p);

      mat4.makeRotationY(facing < 0 ? Math.PI : 0);
      mat4b.makeTranslation(px, py, pz);
      mat4.premultiply(mat4b);

      // 需要单独控制的道具（会动 / 会变状态）不参与合并
      const dynamic = p.kind === 'trapdoor' || p.kind === 'chokepoint' ||
        p.interact === 'push' || p.interact === 'hide' || p.interact === 'pickup';

      const targetIsFore = pz >= LAYER_Z.FORE - 0.5;

      if (dynamic) {
        const group = new THREE.Group();
        local.buckets.forEach(function (list, key) {
          const merged = SafeMerge(list);
          if (!merged) return;
          const mesh = new THREE.Mesh(merged, mats[key] || mats.mud);
          if (cfg.shadows) { mesh.castShadow = true; mesh.receiveShadow = true; }
          group.add(mesh);
          TrackGeo(merged);
        });
        group.position.set(px, py, pz);
        group.rotation.y = facing < 0 ? Math.PI : 0;
        gPlay.add(group);
        const rec = { obj: group, kind: p.kind, prop: p, bx: px, by: py, bz: pz, facing, sealBoard: null, lid: null };
        dynProps.push(rec);
        // 卡口的封堵板：默认藏起来，封上了才出现
        if (p.kind === 'chokepoint') {
          const gap = Number((p.data || {}).gap) || 0.85;
          const h = Number((p.data || {}).h) || 1.9;
          const board = new THREE.Mesh(TrackGeo(GBox(gap + 0.3, h * 0.92, 0.22, 0, h * 0.46, 0.7)), mats.wood);
          board.visible = false;
          group.add(board);
          rec.sealBoard = board;   // 缓存引用，Sync 里不做场景遍历
        }
        if (p.kind === 'trapdoor') {
          const lid = new THREE.Group();
          const board = new THREE.Mesh(TrackGeo(GBox(1.3, 0.12, 1.15, 0.65, 0.06, 0)), mats.wood);
          const bar = new THREE.Mesh(TrackGeo(GBox(1.3, 0.08, 0.18, 0.65, 0.16, 0.4)), mats.woodDark);
          lid.add(board); lid.add(bar);
          lid.position.set(-0.65, 0.1, 0);
          group.add(lid);
          rec.lid = lid;
        }
      } else {
        const target = targetIsFore ? foreBuckets : staticBuckets;
        // 手放的前景也参与"玩家在后面时淡出"，否则一样会把人吞掉
        if (targetIsFore) foreOccluders.push({ x: px, w: 1.6, z: pz });
        local.buckets.forEach(function (list, key) {
          for (let k = 0; k < list.length; k++) {
            list[k].applyMatrix4(mat4);
            BucketPush(target, targetIsFore ? 'fore' : key, list[k]);
          }
        });
      }

      // 光 / 光柱：不管静动，坐标都拍平到世界
      for (let k = 0; k < local.glows.length; k++) {
        const gl = local.glows[k];
        glowSources.push({
          x: px + (facing < 0 ? -gl.x : gl.x), y: py + gl.y, z: pz + gl.z,
          size: gl.size, color: gl.color, base: gl.intensity,
          lightPower: gl.lightPower, phase: StrSeed((p.id || '') + 'g' + k) * 6.28,
          propId: p.id, vStart: 0, vCount: 0, on: true,
        });
      }
      for (let k = 0; k < local.shafts.length; k++) {
        const sh = local.shafts[k];
        shaftItems.push({
          x: px + (facing < 0 ? -sh.x : sh.x), y: py + sh.y, z: pz + sh.z,
          w: sh.w, h: sh.h, color: sh.color, alpha: sh.alpha, tilt: sh.tilt,
          phase: StrSeed((p.id || '') + 's' + k) * 6.28, vStart: 0, vCount: 0,
        });
      }

      // 可互动 → 两片柔光，不是一个圈。玩家不用试错找互动点，
      // 但也不许把画面读成一排橙灯笼（见 UpdateHalos 的距离衰减）。
      if (p.interact && p.interact !== 'none') {
        const hr = InteractHaloR(p);
        const ay = py + InteractHaloY(p);
        // A) 底部地面反光：横宽竖扁的一摊暖光，中心压在地面线上——
        //    下半片被土层前脸（z=EARTH_FRONT_Z）挡掉，剩下贴地的半月，
        //    读成"这东西脚下有光"，而不是"这东西被圈起来了"。
        haloItems.push({
          role: 0, peak: 0.135, ay,
          x: px, y: py + 0.02, z: 0.85, w: hr * 2.35, h: hr * 1.15,
          propId: p.id, interact: p.interact, vStart: 0, vCount: 0, cur: 0,
        });
        // B) 边缘提亮：贴在道具**背面**，主体自己把柔光的核心遮掉，
        //    只在轮廓外漏一圈很淡的暖边。这是造型和光位的暗示，不是标记。
        haloItems.push({
          role: 1, peak: 0.075, ay,
          x: px, y: ay, z: -0.75, w: hr * 1.7, h: hr * 1.7,
          propId: p.id, interact: p.interact, vStart: 0, vCount: 0, cur: 0,
        });
      }
    }

    FlushBuckets(staticBuckets, gPlay, 0);
    // 手放的前景进 gForeFix：设计师放哪就在哪，视差由透视自己给。
    FlushBuckets(foreBuckets, gForeFix, 0, mats.fore);
  }

  function InteractHaloY(p) {
    switch (p.kind) {
      case 'bell': return 2.6;
      case 'house': return 1.2;
      case 'haystack': return 0.9;
      case 'well': return 1.2;
      case 'millstone': return 0.9;
      case 'tree': return 1.4;
      case 'vent': return 1.4;
      case 'chokepoint': return 1.0;
      case 'lantern': return 0.3;
      case 'trapdoor': return 0.2;
      default: return 0.75;
    }
  }
  function InteractHaloR(p) {
    switch (p.kind) {
      case 'house': case 'haystack': case 'millstone': case 'tree': return 1.9;
      case 'bell': case 'chokepoint': case 'well': return 1.6;
      default: return 1.15;
    }
  }

  // ---- FORE：《勇敢的心》的招牌构图，必须有真实遮挡 ----
  //
  // 三条硬规矩，写在这里免得以后又被改回去：
  //  1) 沿 X 每 12–18 米必须有一处遮挡。做法是"按槽位行军"，不是随机撒点——
  //     随机撒点碰上 32 个可互动道具的关卡会被否掉 8/9。
  //  2) 实体剪影的顶不许超过 gy+1.15（玩家 1.70 高）。遮腿、遮半身可以，
  //     把人整个吞掉是玩法事故。只有"窄"的东西（树干 ≤1.1m 宽）允许通天。
  //  3) 底边不许伸到地表线以下。伸下去就会在坑道剖面上戳纯黑的房子形窟窿。
  //
  // 透视重标定（换相机后必须做，否则整层撑爆画面）：
  //   FORE 在 z=+5，相机在 z≈32.6，放大率 = 32.6/27.6 ≈ 1.18（地道视口收紧到
  //   7.2 时相机只有 20.4 米远，放大率涨到 1.32）。所以：
  //   · 横向尺寸统一乘 FORE_SHRINK ≈ 1/1.18，屏幕上占多大跟改之前一致；
  //   · 顶高上限按投影反推：世界 y 到屏幕的偏移也乘了 1.18，而且是**绕相机
  //     中心**放大的——低于相机中心的东西会被压得更低。底边尤其危险，
  //     旧的 -0.55 投出来是 -1.0，会顺着地表线往坑道里扎，所以收到 -0.30。
  // 按地表标称视口算，跟建造时相机恰好在哪一档无关（确定性）
  const FORE_MAG = CameraDistanceFor(CAMERA.viewHeight) /
    Math.max(1, CameraDistanceFor(CAMERA.viewHeight) - LAYER_Z.FORE);
  const FORE_SHRINK = 1 / FORE_MAG;                 // ≈0.85
  const FORE_TOP_LIMIT = 1.15 * FORE_SHRINK;        // 投影后仍然只遮到腰
  const FORE_BOTTOM = -0.30;                        // 投影后底边落在 gy-0.55 上下

  function BuildForeground(bx0, bx1, outline) {
    const buckets = NewBuckets();
    const tunBuckets = NewBuckets();
    // 极近景的失焦叶团（景深的暗示，不是特效）。真 DoF 要深度缓冲，太贵；
    // 这里用"比 FORE 还近一点、边缘完全化开的一团暗"代替：眼睛把"化开的边"
    // 直接读成"离得太近，对不上焦"，纵深立刻多出最前面这一档。
    // 只挂在画面顶上（树冠那一带），绝不许碰到玩家——FORE 不吞人是红线。
    const bokehQuads = [];
    const span = bx1 - bx0;
    const S = FORE_SHRINK;

    // —— 避让表分两档 ——
    // hard：地道口 / 出口 / 出生点 / 敌人巡逻段。这些是"判读区"，宽剪影绝不许压上去。
    // soft：可互动道具。低矮的土坡、苇丛可以贴近，通天的树干要让开。
    const hard = [], soft = [];
    const props = Array.isArray(level.props) ? level.props : [];
    for (let i = 0; i < props.length; i++) {
      const p = props[i];
      if (!p) continue;
      // 躲藏点本身就是"被挡住"的地方，前景贴着它反而对；只避让别的互动
      if (p.interact && p.interact !== 'none' && p.interact !== 'hide') soft.push(p.x || 0);
    }
    const hatches = Array.isArray(level.hatches) ? level.hatches : [];
    for (let i = 0; i < hatches.length; i++) if (typeof hatches[i].x === 'number') hard.push(hatches[i].x);
    const shafts = Array.isArray(level.shafts) ? level.shafts : [];
    for (let i = 0; i < shafts.length; i++) if (shafts[i] && typeof shafts[i].x === 'number') hard.push(shafts[i].x);
    if (level.exit && typeof level.exit.x === 'number') hard.push(level.exit.x);
    if (typeof level.startX === 'number') hard.push(level.startX);
    // 敌人视锥的关键判读区：巡逻段整段都要留出来，不然玩家看不见哨兵在哪
    const enemies = Array.isArray(level.enemies) ? level.enemies : [];
    const enemySpans = [];
    for (let i = 0; i < enemies.length; i++) {
      const e = enemies[i];
      if (!e) continue;
      const ex = typeof e.x === 'number' ? e.x : 0;
      const p0 = e.patrol && typeof e.patrol.x0 === 'number' ? e.patrol.x0 : ex;
      const p1 = e.patrol && typeof e.patrol.x1 === 'number' ? e.patrol.x1 : ex;
      enemySpans.push([Math.min(p0, p1) - 2.0, Math.max(p0, p1) + 2.0]);
    }

    function Clear(x, hardR, softR, wide) {
      for (let i = 0; i < hard.length; i++) if (Math.abs(hard[i] - x) < hardR) return false;
      for (let i = 0; i < soft.length; i++) if (Math.abs(soft[i] - x) < softR) return false;
      if (wide) for (let i = 0; i < enemySpans.length; i++) if (x > enemySpans[i][0] && x < enemySpans[i][1]) return false;
      return true;
    }

    const groundAt = outline ? outline.groundY : function () { return earthGroundRef; };

    /** 到最近一个"绝对不许挡"的点有多远。第三档兜底用它挑最不碍事的位置。 */
    function HardDist(x) {
      let d = Infinity;
      for (let i = 0; i < hard.length; i++) d = Math.min(d, Math.abs(hard[i] - x));
      for (let i = 0; i < soft.length; i++) d = Math.min(d, Math.abs(soft[i] - x));
      return d;
    }

    // —— 槽位行军：每 slot 米一格，格内挑一个能落脚的 x ——
    // 三档退让，最后一档一定会放东西：不许出现 30 米一处遮挡都没有的段落。
    //   1 宽（土坡/断墙/柴垛）：让开判读区 5.0m、互动点 3.2m、整段巡逻路线
    //   2 窄（树干）：只让开 2.6m / 1.5m
    //   3 苇丛：本身是透光的细杆，挡不住任何判读，挑格子里最空的位置硬放
    const slot = Clamp(13 / Math.max(0.35, cfg.foreDensity), 11, 24);
    const slots = Math.max(2, Math.round(span / slot));
    for (let i = 0; i < slots; i++) {
      const c0 = bx0 + span * (i / slots);
      const c1 = bx0 + span * ((i + 1) / slots);
      const rng = MakeRng(StrSeed('fore' + level.id + i));
      const pick = Hash1(i * 17.3 + StrSeed(String(level.id)) * 7);

      let x = -1, wide = false, reedOnly = false;
      for (let k = 0; k < 7; k++) {
        const t = (k + 0.5) / 7;
        const cand = c0 + (c1 - c0) * t;
        if (Clear(cand, 5.0, 3.2, true)) { x = cand; wide = true; break; }
      }
      if (x < 0) {
        for (let k = 0; k < 9; k++) {
          const t = (k + 0.5) / 9;
          const cand = c0 + (c1 - c0) * t;
          if (Clear(cand, 2.6, 1.5, false)) { x = cand; break; }
        }
      }
      if (x < 0) {
        let best = -1, bestD = -1;
        for (let k = 0; k < 13; k++) {
          const cand = c0 + (c1 - c0) * ((k + 0.5) / 13);
          const d = HardDist(cand);
          if (d > bestD) { bestD = d; best = cand; }
        }
        x = best; reedOnly = true;
      }
      if (x < 0) continue;
      const gy = groundAt(x);

      if (reedOnly || (wide && pick >= 0.72 && pick < 0.86)) {
        // 苇丛：一丛细杆，本身是透的，可以高一点。杆子在 z 上拉开，
        // 透视下前后两排的间距不一样，一眼看出这是"一丛"不是"一排"。
        for (let k = 0; k < 14; k++) {
          const h = (1.3 + rng() * 1.1) * S;
          BucketPush(buckets, 'fore', GBox(0.05, h, 0.05, x + (rng() - 0.5) * 2.6 * S, gy + h / 2 - 0.3, (rng() - 0.5) * 1.6, (rng() - 0.5) * 0.45));
        }
        foreOccluders.push({ x, w: 1.0 * S, z: LAYER_Z.FORE });
      } else if (!wide || pick < 0.30) {
        // 树干：一根近黑的干把画面切成两半，这是最有效也最安全的一招（窄，不吞人）。
        // 宽度重标定后投影仍然 ≤1.1 米，符合"只有窄的允许通天"。
        const h = 6.5 + rng() * 3.5;
        const w = (0.5 + rng() * 0.4) * S;
        BucketPush(buckets, 'fore', GBox(w, h, 1.2, x, gy + h / 2 - 0.5, 0, (rng() - 0.5) * 0.09));
        BucketPush(buckets, 'fore', GBox(w * 2.4, 0.42, 1.0, x + w * 1.0, gy + h * 0.7, 0, -0.5));
        BucketPush(buckets, 'fore', GIco(1, 0, x + w * 2.2, gy + h * 0.84, 0, 2.2 * S, 1.2 * S, 0.9));
        foreOccluders.push({ x, w: w * 1.4, z: LAYER_Z.FORE });
      } else if (pick < 0.50) {
        // 柴垛：压低到齐腰，人从后面走过露出上半身
        const w = (2.4 + rng() * 1.6) * S;
        const h = Math.min(FORE_TOP_LIMIT, (0.85 + rng() * 0.3) * S);
        BucketPush(buckets, 'fore', GIco(1, 0, x, gy + h * 0.42, 0, w * 0.55, h * 0.62, 0.85));
        for (let k = 0; k < 9; k++) {
          BucketPush(buckets, 'fore', GBox(0.07, h * (0.8 + rng() * 0.7), 0.07,
            x + (rng() - 0.5) * w * 0.85, gy + h * 0.45 + (rng() - 0.5) * h * 0.5, 0.2, -0.4 + rng() * 1.6));
        }
        foreOccluders.push({ x, w: w * 0.6, z: LAYER_Z.FORE });
      } else if (pick < 0.72) {
        // 土坡：把画面下缘压住。底边收在 FORE_BOTTOM，绝不伸进坑道剖面。
        const w = (6 + rng() * 6) * S;
        const h = Math.min(FORE_TOP_LIMIT, (0.75 + rng() * 0.4) * S);
        BucketPush(buckets, 'fore', GPrism([
          -w / 2, FORE_BOTTOM, w / 2, FORE_BOTTOM, w / 2, h * 0.35, w * 0.2, h, -w * 0.25, h * 0.8, -w / 2, h * 0.2,
        ], 1.6, x, gy, 0));
        foreOccluders.push({ x, w: w * 0.5, z: LAYER_Z.FORE });
      } else {
        // 断墙：齐腰高的残墙，底边同样收住
        const w = (2.4 + rng() * 2.0) * S;
        const h = Math.min(FORE_TOP_LIMIT, (0.9 + rng() * 0.25) * S);
        BucketPush(buckets, 'fore', GPrism([
          -w / 2, FORE_BOTTOM, w / 2, FORE_BOTTOM, w / 2, h * 0.7, w * 0.15, h, -w * 0.2, h * 0.55, -w / 2, h * 0.85,
        ], 1.3, x, gy, 0));
        foreOccluders.push({ x, w: w * 0.55, z: LAYER_Z.FORE });
      }

      // 画面顶上垂下来的枝叶：只压顶边，碰不到玩法，纯构图，可以随便放。
      // 叶团要互相咬住，不然读成一排飘着的黑六边形。
      // 高度上限也得重标定：透视是绕相机中心放大的，高过相机中心的东西会被
      // 推得更高，旧的 5.6 米投出来直接顶出画外，枝叶就只剩两片贴边的黑角。
      if (Hash1(i * 3.7 + 5) > 0.42) {
        const bxc = c0 + (c1 - c0) * (0.15 + Hash1(i * 8.9) * 0.7);
        const by = gy + CAMERA.surfaceLift + (3.9 + rng() * 0.9) * S;
        const tilt = -0.1 + rng() * 0.2;
        // 主枝：从画面外斜伸进来，分两段，别是一根笔直的板
        BucketPush(buckets, 'fore', GBox((3.2 + rng() * 1.6) * S, 0.22, 1.1, bxc - 1.4 * S, by + 0.35, 0, tilt));
        BucketPush(buckets, 'fore', GBox((2.4 + rng() * 1.4) * S, 0.17, 1.0, bxc + 1.3 * S, by + 0.1, 0, tilt - 0.22));
        // 叶团沿枝排一条弧，互相咬住 60% 以上，silhouette 才是一整片
        const leaves = 13;
        for (let k = 0; k < leaves; k++) {
          const u = (k + 0.5) / leaves;
          const lx = bxc + (u - 0.5) * 6.4 * S + (rng() - 0.5) * 0.7;
          const arc = -Math.sin(u * Math.PI) * 0.85;
          const ly = by + 0.25 + arc + (rng() - 0.5) * 0.35;
          BucketPush(buckets, 'fore', GIco(1, cfg.ico, lx, ly, (rng() - 0.5) * 0.9,
            (1.15 + rng() * 0.7) * S, (0.62 + rng() * 0.4) * S, 0.75));
        }
        // 更近一档的失焦叶团：两三块化开的暗，压在枝叶更前面
        if (Hash1(i * 6.3 + 11) > 0.45) {
          const nb = 2 + (Hash1(i * 12.7) > 0.6 ? 1 : 0);
          for (let k = 0; k < nb; k++) {
            const sz = 3.4 + rng() * 2.6;
            bokehQuads.push(GQuad(sz * 1.5, sz, bxc + (rng() - 0.5) * 7.5, by + 0.9 + (rng() - 0.5) * 1.3, 0));
          }
        }
      }
    }

    // 地下的前景：只压住脚下和头顶，绝不挡住玩家身体。单独一层，不吃视差。
    const tunnels = [];
    const floors = Array.isArray(level.floors) ? level.floors : [];
    for (let i = 0; i < floors.length; i++) if (floors[i] && floors[i].kind === 'tunnel') tunnels.push(floors[i]);
    for (let i = 0; i < tunnels.length; i++) {
      const f = tunnels[i];
      const count = Math.max(1, Math.floor((f.x1 - f.x0) / 9 * cfg.foreDensity));
      for (let k = 0; k < count; k++) {
        const rng = MakeRng(StrSeed('ft' + i + '_' + k));
        const x = f.x0 + (f.x1 - f.x0) * ((k + 0.5) / count) + (rng() - 0.5) * 3;
        if (!Clear(x, 2.2, 1.3, false)) continue;
        // 脚下的土堆。地道视口只有 7.2 米高，相机拉到 20 米，FORE 的放大率
        // 涨到 1.32——旧尺寸投出来是一间横在坑道正中的黑房子（改前截图里
        // 那块最扎眼的黑）。整体压扁压窄，底边收到 -0.10 贴着地板沿。
        const TS = 0.62;
        const w = (1.0 + rng() * 0.9) * TS;
        const h1 = (0.20 + rng() * 0.14) * TS, h2 = (0.13 + rng() * 0.12) * TS;
        BucketPush(tunBuckets, 'fore', GPrism([
          -w / 2, -0.10, w / 2, -0.10, w / 2, 0.03,
          w * 0.22, h1, 0, h1 * 0.55, -w * 0.24, h2, -w / 2, 0.04,
        ], 0.8, x, f.y, 0));
        if (rng() > 0.5) {
          const w2 = (0.6 + rng() * 0.6) * TS;
          BucketPush(tunBuckets, 'fore', GPrism([
            -w2 / 2, -0.10, w2 / 2, -0.10, w2 / 2, 0.04, 0, (0.13 + rng() * 0.1) * TS, -w2 / 2, 0.02,
          ], 0.8, x + (rng() - 0.5) * 2.2, f.y, 0));
        }
        // 头顶垂下的树根
        if (rng() > 0.45) {
          for (let r = 0; r < 4; r++) {
            const h = (0.4 + rng() * 0.7) * TS;
            BucketPush(tunBuckets, 'fore', GBox(0.045, h, 0.045, x + (rng() - 0.5) * 1.6, f.y + 1.95 - h / 2, (rng() - 0.5) * 0.6, (rng() - 0.5) * 0.6));
          }
        }
      }
    }

    const merged = SafeMerge(buckets.get('fore') || []);
    if (merged) {
      const mesh = new THREE.Mesh(merged, mats.fore);
      mesh.position.z = LAYER_Z.FORE;
      mesh.matrixAutoUpdate = false; mesh.updateMatrix(); mesh.frustumCulled = false;
      gForePar.add(mesh);
      TrackGeo(merged);
    }
    const mergedTun = SafeMerge(tunBuckets.get('fore') || []);
    if (mergedTun) {
      const mesh = new THREE.Mesh(mergedTun, mats.foreTunnel);
      mesh.position.z = LAYER_Z.FORE;
      mesh.matrixAutoUpdate = false; mesh.updateMatrix(); mesh.frustumCulled = false;
      gForeTun.add(mesh);
      TrackGeo(mergedTun);
    }
    const mergedBokeh = SafeMerge(bokehQuads);
    if (mergedBokeh) {
      const mesh = new THREE.Mesh(mergedBokeh, mats.foreBokeh);
      // 比 FORE 再近 2.4 米：放大率 1.30（FORE 是 1.18），一眼比剪影更"贴脸"
      mesh.position.z = LAYER_Z.FORE + 2.4;
      mesh.renderOrder = 12;
      mesh.visible = !!cfg.foreBokeh;
      mesh.matrixAutoUpdate = false; mesh.updateMatrix(); mesh.frustumCulled = false;
      gForePar.add(mesh);
      TrackGeo(mergedBokeh);
    }
  }

  // ---- 角色 ----
  function BuildActors() {
    const actorKind = level.actor === 'chuanbao' ? 'chuanbao' : (level.actor || 'laozhong');
    playerRig = MakeRig(actorKind, mats.actor);
    if (playerRig && playerRig.group) {
      gPlay.add(playerRig.group);
      if (cfg.shadows) playerRig.group.traverse(function (o) { if (o.isMesh) o.castShadow = true; });
    }
    ApplyRimLight(playerRig);
    blobs.push(MakeBlob(playerRig));

    const enemies = Array.isArray(level.enemies) ? level.enemies : [];
    for (let i = 0; i < enemies.length; i++) {
      const e = enemies[i];
      if (!e || e.id == null) continue;
      const rig = MakeRig(RigKindFor(e.kind), mats.actor);
      if (rig && rig.group) gPlay.add(rig.group);
      ApplyRimLight(rig);
      enemyRigs.set(e.id, rig);
      blobs.push(MakeBlob(rig));
      // 视锥
      const range = (e.vision && e.vision.range) || 9;
      const halfDeg = (e.vision && e.vision.halfAngleDeg) || 26;
      const cone = MakeVisionCone(range, halfDeg);
      cone.visible = false;
      gPlay.add(cone);
      enemyCones.set(e.id, {
        obj: cone, mat: cone.material, height: (e.vision && e.vision.height) || 1.5, range,
        colorAttr: cone.__colorAttr, seg: cone.__seg,
      });
    }

    const npcs = Array.isArray(level.npcs) ? level.npcs : [];
    for (let i = 0; i < npcs.length; i++) {
      const nn = npcs[i];
      if (!nn || nn.id == null) continue;
      const rig = MakeRig(NPC_RIG[nn.role] || 'villager', mats.actor);
      if (rig && rig.group) gPlay.add(rig.group);
      ApplyRimLight(rig);
      npcRigs.set(nn.id, rig);
      blobs.push(MakeBlob(rig));
    }

    // 钟
    const props = Array.isArray(level.props) ? level.props : [];
    for (let i = 0; i < props.length; i++) {
      const p = props[i];
      if (!p || p.kind !== 'bell') continue;
      if (ActorApi.CreateBell && ActorApi.bellOk) {
        try {
          const rig = ActorApi.CreateBell(THREE);
          if (rig && rig.group && rig.group.isObject3D) {
            rig.group.position.set(p.x || 0, (p.y || 0) + (Number((p.data || {}).height) || 2.6), PropZ(p));
            gPlay.add(rig.group);
            bellRig = rig;
          }
        } catch (e) {
          ActorApi.bellOk = false;
          if (typeof console !== 'undefined') console.warn('[Render] CreateBellRig 失败，用占位钟。', e);
        }
      }
      if (!bellRig) {
        const g = new THREE.Group();
        const body = new THREE.Mesh(TrackGeo(GLathe([0.001, 0, 0.34, 0.02, 0.36, 0.2, 0.26, 0.5, 0.14, 0.66, 0.1, 0.72], cfg.lathe, 0, -0.72, 0)), mats.metal);
        g.add(body);
        g.position.set(p.x || 0, (p.y || 0) + (Number((p.data || {}).height) || 2.6), PropZ(p));
        gPlay.add(g);
        bellRig = { group: g, __fallback: true };
      }
      break;
    }
  }

  function MakeBlob(rig) {
    const mesh = new THREE.Mesh(TrackGeo(GQuad(1.5, 0.75, 0, 0, 0)), mats.blob);
    mesh.renderOrder = 4;
    mesh.visible = false;
    gPlay.add(mesh);
    return { mesh, rig };
  }

  /**
   * 视锥。两条硬约束：
   *  1) 视口只有 11.5 米高。range 15m × 半角 36° 的对称扇形上下各铺开 8.8 米，
   *     直接超出画面。所以垂直方向必须压扁成"贴地的梯形"：向上最多 0.7m、
   *     向下最多 2.0m（够罩住站着的玩家和地面就行，天上没人）。
   *  2) 分近/远两圈，alpha 分开控——patrol 只亮近端一小截，spotted 才整片烧红。
   */
  function MakeVisionCone(range, halfDeg) {
    const seg = 14;
    const half = Math.max(0.05, halfDeg * Math.PI / 180);
    const upCap = 0.75, downCap = 2.05;
    const rings = [0.42, 1.0];
    const vCount = 1 + rings.length * (seg + 1);
    const pos = new Float32Array(vCount * 3);
    const col = new Float32Array(vCount * 4);
    pos[0] = 0; pos[1] = 0; pos[2] = 0;
    col[0] = 1; col[1] = 1; col[2] = 1; col[3] = 1;
    for (let r = 0; r < rings.length; r++) {
      const rr = rings[r];
      for (let i = 0; i <= seg; i++) {
        const a = -half + (half * 2) * (i / seg);
        const vi = 1 + r * (seg + 1) + i;
        const k = vi * 3;
        const sy = Math.sin(a) * range * rr;
        // 软压扁：近端保持真实张角，远端渐近到上限。硬 clamp 会把扇形削成
        // 一个方框，读起来像贴了张半透明的矩形贴纸，而不是"视线"。
        const cap = sy >= 0 ? upCap : downCap;
        pos[k] = Math.cos(a) * range * rr;
        pos[k + 1] = cap * Math.tanh(sy / cap);
        pos[k + 2] = 0;
        const c = vi * 4;
        col[c] = 1; col[c + 1] = 1; col[c + 2] = 1; col[c + 3] = r === 0 ? 0.55 : 0;
      }
    }
    const idx = [];
    for (let i = 0; i < seg; i++) idx.push(0, 1 + i, 2 + i);
    const base0 = 1, base1 = 1 + (seg + 1);
    for (let i = 0; i < seg; i++) {
      idx.push(base0 + i, base1 + i, base1 + i + 1);
      idx.push(base0 + i, base1 + i + 1, base0 + i + 1);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const ca = new THREE.BufferAttribute(col, 4);
    ca.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('color', ca);
    g.setIndex(idx);
    TrackGeo(g);
    const mat = new THREE.MeshBasicMaterial({
      vertexColors: true, transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
      color: 0x8ea4bc, opacity: 0.06,
    });
    enemyConeMats.push(mat);
    const mesh = new THREE.Mesh(g, mat);
    mesh.renderOrder = 18;
    mesh.__colorAttr = ca;
    mesh.__seg = seg;
    return mesh;
  }

  /**
   * 警戒色语言（这是玩法信息，必须"越危险越刺眼"）：
   *   patrol   几乎看不见的冷灰，只有近端一小截
   *   probe    暖黄，短
   *   suspicious 开始填充
   *   search   橙，整片起来
   *   spotted  高饱和红 + 脉冲，画面里最亮的东西
   * 元组：[hex, matOpacity, apexAlpha, nearAlpha, farAlpha]
   */
  // ACES + 曝光 1.25 会把高亮往白/黄压，所以级差不能只靠色相——不透明度必须
  // 拉开好几倍，spotted 才会真的比 search 刺眼。
  const CONE_LOOK = {
    idle: [0x8ea4bc, 0.045, 0.5, 0.14, 0.00],
    patrol: [0x8ea4bc, 0.065, 0.6, 0.20, 0.00],
    probe: [0xffc46a, 0.100, 0.8, 0.38, 0.04],
    suspicious: [0xffd050, 0.115, 0.9, 0.50, 0.09],
    search: [0xff7a18, 0.190, 1.0, 0.74, 0.20],
    spotted: [0xff1a10, 0.780, 1.0, 1.00, 0.52],
  };

  // ---- 危害 ----
  function BuildHazards() {
    const hz = Array.isArray(level.hazards) ? level.hazards : [];
    for (let i = 0; i < hz.length; i++) {
      const h = hz[i];
      if (!h || h.id == null) continue;
      const x0 = typeof h.x0 === 'number' ? h.x0 : 0;
      const x1 = typeof h.x1 === 'number' ? h.x1 : x0 + 10;
      const y = typeof h.y === 'number' ? h.y : -6;
      const view = { id: h.id, kind: h.kind, x0, x1, y, group: new THREE.Group(), layers: [], front: null, band: null, glint: null, field: null };
      view.group.visible = false;
      gFx.add(view.group);

      if (h.kind === 'water') {
        // 水体：实体 + 液面线 + 前沿亮边 + 两道反光条。
        // 关键是"看得出液面在涨、看得出从哪边灌过来"。
        const body = new THREE.Mesh(TrackGeo(GQuad(1, 1, 0.5, 0.5, 0)), mats.water);
        body.renderOrder = 12;
        view.group.add(body);
        view.layers.push(body);
        const line = new THREE.Mesh(TrackGeo(GQuad(1, 1, 0.5, 0, 0)), mats.waterLine);
        line.renderOrder = 13;
        view.group.add(line);
        view.band = line;
        // 推进前沿：一道竖的亮边，指出水是从哪边过来的
        const edge = new THREE.Mesh(TrackGeo(GQuad(1, 1, 0, 0.5, 0)), mats.waterEdge);
        edge.renderOrder = 14;
        view.group.add(edge);
        view.front = edge;
        // 液面反光：两条横的柔光条，随液面一起升
        const glint = new THREE.Mesh(TrackGeo(GQuad(1, 1, 0.5, 0, 0)), mats.waterEdge);
        glint.renderOrder = 14;
        view.group.add(glint);
        view.glint = glint;
        view.group.position.z = 1.15;
      } else if (h.kind === 'collapse') {
        const g = [];
        const rng = MakeRng(StrSeed('cl' + h.id));
        for (let k = 0; k < 10; k++) {
          g.push(GIco(1, 0, (rng() - 0.5) * (x1 - x0) * 0.8, rng() * 1.4, (rng() - 0.5) * 1.6,
            0.4 + rng() * 0.6, 0.3 + rng() * 0.4, 0.4 + rng() * 0.4));
        }
        const merged = SafeMerge(g);
        if (merged) {
          const mesh = new THREE.Mesh(merged, mats.mudDark);
          view.group.add(mesh); view.layers.push(mesh); TrackGeo(merged);
        }
        view.group.position.set((x0 + x1) / 2, y, 0.4);
      } else {
        // gas：一片柔边烟团。旧版是几张轴对齐的长方形贴图，看得见拼接缝，
        // 而且和水长得一模一样。烟必须是翻滚的、往上飘的、边缘柔的，
        // 而且要一眼读出浓度（level）和蔓延方向（前沿在哪）。
        view.field = BuildGasField(view, x0, x1, y);
        view.group.position.set(0, 0, 0);
      }
      hazardViews.push(view);
    }
  }

  /**
   * 毒烟团场：所有烟团合成一个 BufferGeometry（1 draw call）。
   * 每帧只改 position.y（上飘）和 color.a（浓度 / 前沿），不新建任何对象。
   */
  function BuildGasField(view, x0, x1, y) {
    const span = Math.max(1, x1 - x0);
    const rows = Math.max(2, Math.min(4, cfg.gasLayers - 1));
    const stepX = 1.35;
    const cols = Math.max(2, Math.min(140, Math.ceil(span / stepX) + 1));
    const n = rows * cols;
    const pos = new Float32Array(n * 4 * 3);
    const uv = new Float32Array(n * 4 * 2);
    const col = new Float32Array(n * 4 * 4);
    const idx = n * 4 > 65535 ? new Uint32Array(n * 6) : new Uint16Array(n * 6);
    const puffs = new Array(n);
    const rng = MakeRng(StrSeed('gas' + view.id));
    let i = 0;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const px = x0 + span * (c / Math.max(1, cols - 1));
        // 三排：贴地、齐腰、顶到坑道顶。上下总跨度控制在 ~2.6m，别糊出坑道。
        const baseY = y + 0.28 + r * 0.72 + (rng() - 0.5) * 0.22;
        const size = 2.0 + rng() * 1.3 - r * 0.12;
        const hw = size / 2;
        const b = i * 4;
        const corners = [-hw, -hw, hw, -hw, hw, hw, -hw, hw];
        for (let k = 0; k < 4; k++) {
          const v = (b + k) * 3;
          pos[v] = px + corners[k * 2];
          pos[v + 1] = baseY + corners[k * 2 + 1];
          pos[v + 2] = 0;
        }
        uv[(b + 0) * 2] = 0; uv[(b + 0) * 2 + 1] = 0;
        uv[(b + 1) * 2] = 1; uv[(b + 1) * 2 + 1] = 0;
        uv[(b + 2) * 2] = 1; uv[(b + 2) * 2 + 1] = 1;
        uv[(b + 3) * 2] = 0; uv[(b + 3) * 2 + 1] = 1;
        const o = i * 6;
        idx[o] = b; idx[o + 1] = b + 1; idx[o + 2] = b + 2;
        idx[o + 3] = b; idx[o + 4] = b + 2; idx[o + 5] = b + 3;
        puffs[i] = { x: px, y0: baseY, hw, row: r, phase: rng() * 6.28, drift: 0.25 + rng() * 0.5 };
        i++;
      }
    }
    const g = new THREE.BufferGeometry();
    const pa = new THREE.BufferAttribute(pos, 3); pa.setUsage(THREE.DynamicDrawUsage);
    const ca = new THREE.BufferAttribute(col, 4); ca.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', pa);
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setAttribute('color', ca);
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    TrackGeo(g);
    const mesh = new THREE.Mesh(g, mats.gas);
    mesh.position.z = 1.25;        // 在角色之前：毒烟要能把人罩住
    mesh.renderOrder = 15;
    mesh.frustumCulled = false;
    view.group.add(mesh);
    return { mesh, puffs, posAttr: pa, colorAttr: ca, x0, x1, span };
  }

  // ---- 出口指示：远处的一点光 ----
  function BuildExitMark() {
    const ex = level.exit;
    if (!ex || typeof ex.x !== 'number') return;
    const m = new THREE.MeshBasicMaterial({
      map: T('glow') || null, color: 0xffd9a0, transparent: true,
      opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
    });
    TrackMat(m);
    const mesh = new THREE.Mesh(TrackGeo(GQuad(5.5, 5.5, 0, 0, 0)), m);
    mesh.position.set(ex.x, (ex.y || 0) + 1.6, -1.2);
    mesh.renderOrder = 8;
    gFx.add(mesh);
    levelExitMark = { mesh, mat: m };
  }

  // ---- 把 glow / halo / shaft 合成大批次（各 1 个 draw call）----
  function MakeQuadBatch(items, sizeOf, colorOf) {
    if (!items.length) return null;
    const n = items.length;
    const pos = new Float32Array(n * 4 * 3);
    const uv = new Float32Array(n * 4 * 2);
    const col = new Float32Array(n * 4 * 4);
    const idx = n * 4 > 65535 ? new Uint32Array(n * 6) : new Uint16Array(n * 6);
    for (let i = 0; i < n; i++) {
      const it = items[i];
      const s = sizeOf(it);
      const hw = (isFinite(s.w) ? s.w : 1) / 2, hh = (isFinite(s.h) ? s.h : 1) / 2;
      const ca = Math.cos(s.tilt || 0), sa = Math.sin(s.tilt || 0);
      const ix = isFinite(it.x) ? it.x : 0;
      const iy = isFinite(it.y) ? it.y : 0;
      const iz = isFinite(it.z) ? it.z : 0;   // halo 没有 z 字段，缺省到 0，绝不许写进 NaN
      const corners = [-hw, -hh, hw, -hh, hw, hh, -hw, hh];
      for (let k = 0; k < 4; k++) {
        const lx = corners[k * 2], ly = corners[k * 2 + 1];
        const vx = lx * ca - ly * sa, vy = lx * sa + ly * ca;
        const v = (i * 4 + k) * 3;
        pos[v] = ix + vx + (s.ox || 0); pos[v + 1] = iy + vy + (s.oy || 0); pos[v + 2] = iz;
      }
      uv[(i * 4 + 0) * 2] = 0; uv[(i * 4 + 0) * 2 + 1] = 0;
      uv[(i * 4 + 1) * 2] = 1; uv[(i * 4 + 1) * 2 + 1] = 0;
      uv[(i * 4 + 2) * 2] = 1; uv[(i * 4 + 2) * 2 + 1] = 1;
      uv[(i * 4 + 3) * 2] = 0; uv[(i * 4 + 3) * 2 + 1] = 1;
      const c = colorOf(it);
      for (let k = 0; k < 4; k++) {
        const v = (i * 4 + k) * 4;
        col[v] = c.r; col[v + 1] = c.g; col[v + 2] = c.b; col[v + 3] = c.a;
      }
      it.vStart = i * 4; it.vCount = 4;
      const o = i * 6, b = i * 4;
      idx[o] = b; idx[o + 1] = b + 1; idx[o + 2] = b + 2;
      idx[o + 3] = b; idx[o + 4] = b + 2; idx[o + 5] = b + 3;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    const ca = new THREE.BufferAttribute(col, 4);
    ca.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('color', ca);
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    TrackGeo(g);
    return { geo: g, colorAttr: ca };
  }

  function BuildBatches() {
    if (glowSources.length) {
      const batch = MakeQuadBatch(glowSources,
        function (it) { return { w: it.size, h: it.size, tilt: 0 }; },
        function (it) { _colA.setHex(it.color); return { r: _colA.r, g: _colA.g, b: _colA.b, a: it.base }; });
      if (batch) {
        glowMesh = new THREE.Mesh(batch.geo, mats.glowAdd);
        glowMesh.renderOrder = 22; glowMesh.frustumCulled = false;
        gFx.add(glowMesh);
        glowColorAttr = batch.colorAttr;
      }
    }
    if (haloItems.length) {
      const batch = MakeQuadBatch(haloItems,
        function (it) { return { w: it.w, h: it.h, tilt: 0 }; },
        // 地面反光偏灯火色，边缘提亮再淡一档：都往油灯的暖色靠，
        // 而不是一个饱和到发甜的橙——饱和橙立刻读成 UI 标记。
        function (it) {
          return it.role === 0
            ? { r: 1.0, g: 0.63, b: 0.31, a: 0 }
            : { r: 1.0, g: 0.72, b: 0.46, a: 0 };
        });
      if (batch) {
        haloMesh = new THREE.Mesh(batch.geo, mats.haloAdd);
        // z 逐项写死在顶点里（地面反光在道具前、边缘提亮在道具后），
        // 所以整块 mesh 不许再整体平移 z。
        haloMesh.renderOrder = 21; haloMesh.frustumCulled = false;
        gFx.add(haloMesh);
        haloColorAttr = batch.colorAttr;
      }
    }
    if (shaftItems.length) {
      const batch = MakeQuadBatch(shaftItems,
        function (it) { return { w: it.w, h: it.h, tilt: it.tilt }; },
        function (it) { _colA.setHex(it.color); return { r: _colA.r, g: _colA.g, b: _colA.b, a: it.alpha }; });
      if (batch) {
        shaftMesh = new THREE.Mesh(batch.geo, mats.shaftAdd);
        shaftMesh.renderOrder = 20; shaftMesh.frustumCulled = false;
        gFx.add(shaftMesh);
        shaftColorAttr = batch.colorAttr;
      }
    }
  }

  // ---- 尘 ----
  function BuildDust() {
    dustCapacity = cfg.particles;
    dustPos = new Float32Array(dustCapacity * 3);
    dustCol = new Float32Array(dustCapacity * 4);
    dustVel = new Float32Array(dustCapacity * 3);
    dustLife = new Float32Array(dustCapacity);
    dustMax = new Float32Array(dustCapacity);
    for (let i = 0; i < dustCapacity; i++) dustPos[i * 3 + 1] = -9999;
    dustGeo = new THREE.BufferGeometry();
    const pa = new THREE.BufferAttribute(dustPos, 3); pa.setUsage(THREE.DynamicDrawUsage);
    const ca = new THREE.BufferAttribute(dustCol, 4); ca.setUsage(THREE.DynamicDrawUsage);
    dustGeo.setAttribute('position', pa);
    dustGeo.setAttribute('color', ca);
    TrackGeo(dustGeo);
    dustPoints = new THREE.Points(dustGeo, mats.dust);
    dustPoints.frustumCulled = false;
    dustPoints.visible = qualityName !== 'low';
    dustPoints.renderOrder = 24;
    gFx.add(dustPoints);
    dustCursor = 0;
  }

  // ---- 浮尘：空气里的东西 ----
  //
  // 夜里的浮尘、虫、草籽、灶火飘起的灰。**在多个 z 上各放一层**，近处的
  // 大而快、远处的小而慢——这是最便宜也最有效的纵深线索，比任何几何都管用。
  // 地道里同一批点换成暖色（马灯周围的浮尘 + 飘落的土屑），靠 layerMix 过渡。
  //
  // 实现上的两条硬要求：
  //  1) 一层一个 Points = 1 draw call。绝不许一个粒子一个物体。
  //  2) 位置是 time 的解析函数（不积分、不 new、不 Math.random）：
  //     世界坐标 = 相位表 + 漂移 * t，再按"以相机为中心的一个盒子"取模回卷。
  //     取模回卷让它们永远铺满画面，同时**保留世界锚定**，所以视差是真的。
  function BuildMotes() {
    for (let b = 0; b < MOTE_BANDS.length; b++) {
      const band = MOTE_BANDS[b];
      const n = band.n;
      const pos = new Float32Array(n * 3);
      const col = new Float32Array(n * 4);
      // 相位表：确定性、只算一次。[0]=x 基址 [1]=y 基址 [2]=速度扰动 [3]=摆动相位
      const seed = new Float32Array(n * 4);
      for (let i = 0; i < n; i++) {
        seed[i * 4] = Hash1(i * 3.7 + b * 41.3) * 4000;
        seed[i * 4 + 1] = Hash1(i * 8.9 + b * 17.7) * 4000;
        seed[i * 4 + 2] = 0.45 + Hash1(i * 5.1 + b * 29.1) * 1.25;
        seed[i * 4 + 3] = Hash1(i * 11.7 + b * 7.3) * 6.28318;
        pos[i * 3 + 1] = -9999;
      }
      const geo = new THREE.BufferGeometry();
      const pa = new THREE.BufferAttribute(pos, 3); pa.setUsage(THREE.DynamicDrawUsage);
      const ca = new THREE.BufferAttribute(col, 4); ca.setUsage(THREE.DynamicDrawUsage);
      geo.setAttribute('position', pa);
      geo.setAttribute('color', ca);
      TrackGeo(geo);
      const pts = new THREE.Points(geo, moteMats[b]);
      pts.frustumCulled = false;
      pts.renderOrder = 23;
      pts.visible = b < (cfg.moteBands || 0);
      gFx.add(pts);
      moteLayers.push({ geo, pos, col, seed, band, n, posAttr: pa, colAttr: ca, points: pts });
    }
  }

  function UpdateMotes(t, cx, cy, mix) {
    for (let b = 0; b < moteLayers.length; b++) {
      const L = moteLayers[b];
      if (!L.points.visible) continue;
      const band = L.band;
      // 这一层所在深度上的可视范围。乘 2.2 让盒子明显大于画面，取模的接缝
      // 就落在画外；再配合边缘淡出，任何机位都看不见"忽然冒出来一个点"。
      const halfH = HalfHeightAt(camDist - band.z);
      const W = halfH * (viewW / Math.max(1, viewH)) * 2.2;
      const H = halfH * 2.2;
      const pos = L.pos, col = L.col, seed = L.seed;
      // 地表：冷灰蓝的夜尘，缓缓上浮。地道：暖赭的土屑，慢慢往下落。
      const cr = Lerp(1.00, 0.68, mix), cg = Lerp(0.74, 0.78, mix), cb = Lerp(0.44, 0.92, mix);
      const alpha = Lerp(band.aTun, band.aSurf, mix);
      const riseY = Lerp(-band.rise * 1.6, band.rise, mix);
      for (let i = 0; i < L.n; i++) {
        const spd = seed[i * 4 + 2];
        const ph = seed[i * 4 + 3];
        let dx = seed[i * 4] + t * band.drift * spd + Math.sin(t * 0.31 + ph) * 0.9 - cx;
        dx -= W * Math.round(dx / W);
        let dy = seed[i * 4 + 1] + t * riseY * spd * 6 + Math.sin(t * 0.23 + ph * 1.7) * 0.5 - cy;
        dy -= H * Math.round(dy / H);
        pos[i * 3] = cx + dx;
        pos[i * 3 + 1] = cy + dy;
        pos[i * 3 + 2] = band.z;
        // 接缝淡出：靠近盒子边缘时把 alpha 收掉
        const fx = 1 - Math.abs(dx) / (W * 0.5), fy = 1 - Math.abs(dy) / (H * 0.5);
        const fade = Clamp(Math.min(fx, fy) * 3.2, 0, 1);
        col[i * 4] = cr; col[i * 4 + 1] = cg; col[i * 4 + 2] = cb;
        // 每颗自己的明暗呼吸，一层里不许所有点一样亮
        col[i * 4 + 3] = alpha * fade * (0.55 + 0.45 * Math.sin(t * (0.6 + spd * 0.5) + ph));
      }
      L.posAttr.needsUpdate = true;
      L.colAttr.needsUpdate = true;
    }
  }

  function SpawnDust(x, y, power, kind) {
    if (!dustGeo) return;
    const count = Math.max(1, Math.round(Clamp(power, 0, 1) * (dustCapacity * 0.06)));
    for (let k = 0; k < count; k++) {
      const i = dustCursor;
      dustCursor = (dustCursor + 1) % dustCapacity;
      const h1 = Hash1(elapsed * 91.7 + i * 3.3);
      const h2 = Hash1(elapsed * 57.1 + i * 7.9);
      const h3 = Hash1(elapsed * 33.3 + i * 11.1);
      dustPos[i * 3] = x + (h1 - 0.5) * 0.7;
      dustPos[i * 3 + 1] = y + h2 * 0.5;
      dustPos[i * 3 + 2] = 0.9;
      dustVel[i * 3] = (h1 - 0.5) * 1.9;
      dustVel[i * 3 + 1] = 0.5 + h3 * 1.7;
      dustVel[i * 3 + 2] = (h2 - 0.5) * 0.4;
      dustMax[i] = 0.55 + h3 * 0.9;
      dustLife[i] = dustMax[i];
      const warm = kind === 'warm';
      dustCol[i * 4] = warm ? 1.0 : 0.72;
      dustCol[i * 4 + 1] = warm ? 0.74 : 0.66;
      dustCol[i * 4 + 2] = warm ? 0.45 : 0.56;
      dustCol[i * 4 + 3] = 0.55;
    }
  }

  // ------------------------------------------------------------------
  // Sync：每帧。禁止在这里 new 几何 / 材质 / 纹理 / Vector3。
  // ------------------------------------------------------------------

  function Sync(state, dt) {
    try { SyncInner(state, typeof dt === 'number' && isFinite(dt) ? Clamp(dt, 0, 0.25) : 0.016); }
    catch (e) {
      if (typeof console !== 'undefined') console.warn('[Render] Sync 异常（已吞掉，继续出图）。', e);
    }
    try {
      if (filmOn && rtMain) RenderWithFilm();
      else {
        renderer.setRenderTarget(null);
        renderer.render(scene, camera);
        stats.drawCalls = renderer.info.render.calls;
        stats.triangles = renderer.info.render.triangles;
      }
    } catch (e) {
      if (typeof console !== 'undefined') console.error('[Render] render 失败。', e);
      // 后处理炸了就永久退回直渲。宁可没有胶片感，也不许黑屏。
      filmOn = false;
      try { renderer.setRenderTarget(null); renderer.render(scene, camera); } catch (e2) { /* 忽略 */ }
    }
  }

  /**
   * 胶片链。renderer.info 每次 render 自动清零，所以逐 pass 累加，
   * stats.drawCalls 报的是**含后处理的总提交量**。
   */
  function RenderWithFilm() {
    let calls = 0;
    // 1) 场景 → HalfFloat RT（three 对 RT 不做色调映射，线性值原样存下来）
    renderer.setRenderTarget(rtMain);
    renderer.render(scene, camera);
    calls += renderer.info.render.calls;
    stats.triangles = renderer.info.render.triangles;

    // 2) 快门拖影：**只在 timeScale<1 的放慢瞬间**开。平时一个 pass 都不跑，
    //    连"存上一帧"的 blit 都省掉——它是全屏的，白跑一帧就白花一次填充率。
    if (rtPrev && trailAmt > 0.004) {
      if (trailPrimed) {
        fxTrail.uniforms.tDiffuse.value = rtPrev.texture;
        fxTrail.uniforms.uAmount.value = trailAmt;
        fxQuad.material = fxTrail;
        renderer.setRenderTarget(rtMain);
        renderer.autoClear = false;             // 盖在本帧上面，绝不能清
        renderer.render(fxScene, fxCam);
        renderer.autoClear = true;
        calls += renderer.info.render.calls;
      }
      fxTrail.uniforms.tDiffuse.value = rtMain.texture;
      fxTrail.uniforms.uAmount.value = 1;
      calls += FxPass(fxTrail, rtPrev);
      trailPrimed = true;
    } else {
      trailPrimed = false;                      // 下次开拖影时不许拿隔了半天的旧帧
    }

    // 3) 暖光辉光：亮部提取 → 横 → 竖，全在 1/4 分辨率
    if (rtBloomA && rtBloomB && fxComposite.uniforms.uBloom.value > 0.0001) {
      fxBright.uniforms.tDiffuse.value = rtMain.texture;
      fxBright.uniforms.uTexel.value.set(1 / rtMain.width, 1 / rtMain.height);
      calls += FxPass(fxBright, rtBloomA);
      fxBlur.uniforms.tDiffuse.value = rtBloomA.texture;
      fxBlur.uniforms.uDir.value.set(1.35 / rtBloomA.width, 0);
      calls += FxPass(fxBlur, rtBloomB);
      fxBlur.uniforms.tDiffuse.value = rtBloomB.texture;
      fxBlur.uniforms.uDir.value.set(0, 1.35 / rtBloomA.height);
      calls += FxPass(fxBlur, rtBloomA);
      fxComposite.uniforms.tBloom.value = rtBloomA.texture;
    } else {
      fxComposite.uniforms.tBloom.value = null;
    }

    // 4) 合成到屏幕：色差 → 辉光 → 色调分离 → ACES → 暗角 → 颗粒 → sRGB
    fxComposite.uniforms.tDiffuse.value = rtMain.texture;
    calls += FxPass(fxComposite, null);

    stats.drawCalls = calls;
  }

  function SyncInner(state, dt) {
    if (!state) return;
    elapsed += dt;
    const t = elapsed;
    const p = state.player || {};
    const cam = state.camera || {};

    // ---- 地表 / 地下混合系数（按 player.y 平滑过渡，不许硬切）----
    const py = typeof p.y === 'number' ? p.y : 0;
    const targetMix = Clamp((py + 3.4) / 2.8, 0, 1);
    layerMix += (targetMix - layerMix) * (1 - Math.exp(-6.0 * dt));

    // ---- 相机 ----
    // viewHeight 的语义锁死为「z=0 玩法平面上的可视世界高度」。
    // 长焦透视下这靠**相机距离**兑现，不是靠改 FOV：dist = (vh/2)/tan(fov/2)。
    // 玩法层的夹紧、机器人、冒烟测试全建立在这个语义上，算错玩家就跑到画面外。
    const vh = typeof cam.viewHeight === 'number' && cam.viewHeight > 0.5 ? cam.viewHeight : CAMERA.viewHeight;
    if (Math.abs(vh - lastViewHeight) > 1e-4) {
      viewHeight = vh;
      ApplyCameraLens();
      lastViewHeight = vh;
    }
    shakeExtra = Math.max(0, shakeExtra - dt * CAMERA.shakeDecay);
    const shake = Clamp((typeof cam.shake === 'number' ? cam.shake : 0) + shakeExtra, 0, 1);
    const sx = shake * 0.42 * (Math.sin(t * 47.3) * 0.6 + Math.sin(t * 88.1) * 0.4);
    const sy = shake * 0.34 * (Math.sin(t * 39.7 + 1.7) * 0.6 + Math.sin(t * 71.3) * 0.4);
    const cx = (typeof cam.x === 'number' ? cam.x : 0) + sx;
    const cy = (typeof cam.y === 'number' ? cam.y : 0) + sy;
    camera.position.x = cx;
    camera.position.y = cy;
    camera.position.z = camDist;
    camera.rotation.z = shake * 0.012 * Math.sin(t * 26.1);
    camera.updateMatrixWorld();

    // 视差**没有代码**。它是透视的自然结果：FORE(z=+5) 随相机移动得比玩法层
    // 快 18%，FAR(z=-26) 只有 56%。旧的 gFar/gBack/gForePar 手动位移全部删除
    // ——那套东西在 act3 末端会把整层拖走 9.9 米。

    // ---- 光照 / 雾：地表 ⇄ 地下平滑插值 ----
    const mix = layerMix;
    // 马灯量：0 = 没灯，1 = 满灯。地下的一切明暗都挂在它上面，
    // "放下马灯"必须在画面上有代价，否则规则层给的潜行收益是白给的。
    const lanternAmt = Clamp((typeof p.lightRadius === 'number' ? p.lightRadius : 0) / 6.0, 0, 1);
    _colA.setHex(palette.ambientSurface);
    _colB.setHex(palette.ambientTunnel);
    ambient.color.copy(_colB).lerp(_colA, mix);
    // 地下环境光刻意留一点底，够看清坑道轮廓就行；亮度主体仍然靠马灯。
    ambient.intensity = Lerp(Lerp(3.05, 4.7, lanternAmt), 3.2, mix);

    _colC.setHex(palette.moon);
    moon.color.copy(_colC);
    moon.intensity = Lerp(0.06, (palette.moonIntensity || 1) * 2.15, mix * mix);
    // z 分量压低：正对观众的剖面（法线 +Z）少吃直射月光，免得整块土被打亮、打灰
    moon.position.set(cx - 9, cy + 15, 3);

    // ---- 土层剖面的明度：地表沉下去，地下才是主角 ----
    // 之前地表档 emissive 0.42 + 顶点色原样，实测土层亮度 64、天空 17、
    // 点着灯的房子墙 22 —— 眼睛第一眼落在一块什么内容都没有的土上，构图垮掉。
    // 这里按 layerMix 同时压 emissive 和整体乘色（顺带去饱和），把视觉重量还给村庄。
    mats.earth.emissiveIntensity = Lerp(0.42 + lanternAmt * 0.5, 0.10, mix);
    // 乘色同时做压暗和去饱和：R 压得比 GB 多一点，土就不会在地表读成"发红的亮块"
    mats.earth.color.setRGB(Lerp(1.0, 0.60, mix), Lerp(1.0, 0.575, mix), Lerp(1.0, 0.565, mix));
    // 坑道背墙：任何时候都是暖的。地表俯看地道口时也不许读成冷蓝（act1 第一次
    // 见到地道的那一帧就栽在这上面）。地下再亮一档，保证腔体比周围实心土亮。
    mats.earthBack.emissiveIntensity = Lerp(0.86, 0.46, mix) * (0.72 + lanternAmt * 0.42);
    moon.target.position.set(cx, cy - 1, 0);
    moon.target.updateMatrixWorld();
    if (moon.castShadow) { moon.shadow.camera.updateProjectionMatrix(); }

    _colA.setHex(palette.fogSurface);
    _colB.setHex(palette.fogTunnel);
    scene.fog.color.copy(_colB).lerp(_colA, mix);
    // 雾在透视下的行为跟正交完全不同：fogDepth 是到相机的真实视深，而相机
    // 距离随 viewHeight 变（地表 32.6 米，地道收紧到 20.4 米）。所以 near/far
    // 必须**相对相机距离**给，写死绝对值会让地道里整屏糊成一块雾。
    //   地表：z=0 刚好出雾，FAR(-26) 吃到七成半 → 远山褪色、偏冷、对比降低；
    //   地道：收得很紧，坑道往里十来米就沉进暖褐色，壕沟的纵深全靠它。
    scene.fog.near = camDist + Lerp(0.8, 2.2, mix);
    scene.fog.far = camDist + Lerp(17.5, 34.0, mix);
    _colD.setHex(palette.sky);
    scene.background.copy(_colB).lerp(_colD, mix);
    mats.skyBase.color.copy(scene.background);
    // 三道空气墙跟着雾色走：地道里必须是暖褐，不许在坑道上盖一层冷蓝。
    //
    // 强度分地表 / 地道两套。**地表这套试过往月色抬（当"月光下的地面薄雾"），
    // 实测是个坑**：抬色之后"天空带"跟着涨 6 级，比村庄带涨得还多——因为
    // 地平线以上那一大片背景也在空气墙的作用范围里，而村庄带有一半是地面
    // （地面在剖面正面 z=2.25，压根在空气墙前面）。所以这里一律用纯雾色。
    _colE.copy(scene.fog.color);
    for (let i = 0; i < hazeMats.length; i++) {
      hazeMats[i].color.copy(_colE);
      hazeMats[i].opacity = Lerp(HAZE_A_TUN[i], HAZE_A_SURF[i], mix);
    }
    // 贴地薄雾反过来：它必须**亮于**雾色才起作用（月光打在雾上），
    // 所以往月色抬 34%。地道里整条淡掉——坑道里没有地平线，也没有月亮。
    mats.mist.color.copy(scene.fog.color).lerp(_colC, 0.34 * mix);
    mats.mist.opacity = 0.24 * mix * mix;
    // 地平线辉光 / 月色跟着时段走；进地道后天幕整体压暗
    mats.sky.color.copy(_colA);
    mats.sky.opacity = Lerp(0.18, 1.0, mix);
    mats.moon.color.copy(_colC);
    mats.moon.opacity = Lerp(0.12, 1.0, mix);

    // ---- 玩家马灯 ----
    const lr = typeof p.lightRadius === 'number' ? p.lightRadius : 0;
    const px = typeof p.x === 'number' ? p.x : 0;
    const flick = 1 + Math.sin(t * 11.3) * 0.045 + Math.sin(t * 27.9) * 0.03;
    lanternLight.position.set(px, py + 0.95, 1.4);
    _colA.setHex(palette.warmLight);
    lanternLight.color.copy(_colA);
    const wantLantern = lr > 0.2;
    lanternLight.visible = wantLantern;
    if (wantLantern) {
      lanternLight.distance = lr * 2.2;
      lanternLight.intensity = Clamp(lr * 1.95 * flick, 0.5, 40) * Lerp(1.0, 0.5, mix);
    }

    // ---- 地表补光：跟着玩家，只在地表生效 ----
    fillLight.visible = mix > 0.06;
    if (fillLight.visible) {
      fillLight.position.set(px, py + 1.05, 3.2);
      fillLight.color.copy(_colC);
      fillLight.intensity = 5.0 * mix;
    }

    // ---- FORE：地表 / 地下互斥 + 读穿 ----
    // 地表的剪影底边虽然已经收在地表线上，但整层压在剖面(z=2.25)前面，
    // 玩家钻进地道后它没有任何意义，直接淡掉，省得再在坑道里看见房子形黑影。
    const foreSurfA = Clamp((mix - 0.12) / 0.5, 0, 1);
    const foreTunA = Clamp((0.86 - mix) / 0.5, 0, 1);
    gForePar.visible = foreSurfA > 0.02;
    gForeFix.visible = foreSurfA > 0.02;
    gForeTun.visible = foreTunA > 0.02;
    // 读穿：玩家正躲在某个前景后面时把整层压到 0.62，剪影还在但人看得见。
    //
    // "躲在后面"必须按**投影后**判，不能比世界坐标。前景在 z=+5，比玩家所在的
    // 平面近 4.5 米，横向位移被放大 ~18%：世界坐标上还差 1 米的柴垛，屏幕上
    // 可能已经压在人身上了。把每个遮挡物换算成"它在玩法平面上等效的 x"。
    const foreToPlay = (camDist - ACTOR_Z_PLAYER);
    let nearestFore = 99;
    for (let i = 0; i < foreOccluders.length; i++) {
      const oc = foreOccluders[i];
      const k = foreToPlay / Math.max(1, camDist - oc.z);
      const ox = cx + (oc.x - cx) * k;
      const d = Math.abs(ox - px) - oc.w * k;
      if (d < nearestFore) nearestFore = d;
    }
    const seeThrough = nearestFore < 0.9 ? Lerp(1.0, 0.62, Clamp(1 - nearestFore / 0.9, 0, 1)) : 1.0;
    mats.fore.opacity = foreSurfA * seeThrough;
    mats.foreTunnel.opacity = foreTunA;

    // ---- 暖光池：只点亮离相机最近的几盏 ----
    UpdateWarmLights(cx, t, mix);

    // ---- 角色轮廓边光：地表冷月色，地下暖马灯色 ----
    // 共享 uniform，改一次全体生效；这里一帧只写两个数，零分配。
    rimUniform.value.setRGB(Lerp(0.62, 0.44, mix), Lerp(0.42, 0.56, mix), Lerp(0.22, 0.86, mix));
    rimPowerUniform.value = Lerp(0.10 + lanternAmt * 0.10, 0.19, mix);

    // ---- 玩家 ----
    // 角色比 PLAY 层道具略靠前一点点：否则站在柴垛/碾盘旁边时会被道具整个吞掉。
    // 仍然远在剖面正面(z=2.25)和 FORE(z=5)之后，所以该被挡的地方照样被挡。
    if (playerRig && playerRig.group) {
      playerRig.group.position.set(px, py, ACTOR_Z_PLAYER);
      PoseRig(playerRig, p.anim || null, p.facing === -1 ? -1 : 1, t);
      playerRig.group.visible = !p.hidden;
    }

    // ---- 敌人 ----
    const halfW = viewHeight * (viewW / Math.max(1, viewH)) * 0.5 + 6;
    const enemies = Array.isArray(state.enemies) ? state.enemies : [];
    for (let i = 0; i < enemies.length; i++) {
      const e = enemies[i];
      if (!e) continue;
      const rig = enemyRigs.get(e.id);
      const ex = typeof e.x === 'number' ? e.x : 0;
      const ey = typeof e.y === 'number' ? e.y : 0;
      const near = Math.abs(ex - cx) < halfW;
      if (rig && rig.group) {
        rig.group.visible = near;
        if (near) {
          rig.group.position.set(ex, ey, ACTOR_Z_ENEMY);
          PoseRig(rig, e.anim || null, e.facing === -1 ? -1 : 1, t);
        }
      }
      const cone = enemyCones.get(e.id);
      if (cone) {
        const show = near && e.state !== 'idle';
        cone.obj.visible = show;
        if (show) {
          cone.obj.position.set(ex, ey + cone.height, 1.3);
          cone.obj.rotation.y = e.facing === -1 ? Math.PI : 0;
          const rr = typeof e.visionRange === 'number' && e.visionRange > 0 ? e.visionRange / cone.range : 1;
          // 只横向拉伸：竖向已经压扁成贴地梯形，再乘一次就又糊满天了
          cone.obj.scale.set(rr, 1, 1);
          const look = CONE_LOOK[e.state] || CONE_LOOK.patrol;
          cone.mat.color.setHex(look[0]);
          const alert = Clamp(typeof e.alertness === 'number' ? e.alertness : 0, 0, 1);
          const pulse = e.state === 'spotted' ? 0.72 + 0.28 * Math.sin(t * 16) : 1;
          // 离画面中心越远越淡：屏幕边上半截锥体是纯噪声
          const fade = Clamp(1.25 - Math.abs(ex - cx) / Math.max(4, halfW), 0.25, 1);
          cone.mat.opacity = look[1] * pulse * fade * (0.82 + alert * 0.4);
          // 近/远两圈的 alpha 分别写。patrol 时远圈是 0，只剩哨兵脚边一小截。
          const arr = cone.colorAttr.array;
          const seg = cone.seg;
          arr[3] = look[2];
          for (let k = 0; k <= seg; k++) {
            arr[(1 + k) * 4 + 3] = look[3];
            arr[(1 + seg + 1 + k) * 4 + 3] = look[4];
          }
          cone.colorAttr.needsUpdate = true;
        }
      }
    }

    // ---- NPC ----
    const npcs = Array.isArray(state.npcs) ? state.npcs : [];
    for (let i = 0; i < npcs.length; i++) {
      const nn = npcs[i];
      if (!nn) continue;
      const rig = npcRigs.get(nn.id);
      if (!rig || !rig.group) continue;
      const nx = typeof nn.x === 'number' ? nn.x : 0;
      const near = Math.abs(nx - cx) < halfW;
      rig.group.visible = near && !nn.rescued;
      if (near) {
        rig.group.position.set(nx, typeof nn.y === 'number' ? nn.y : 0, ACTOR_Z_NPC);
        PoseRig(rig, nn.anim || null, nn.facing === -1 ? -1 : 1, t);
      }
    }

    // ---- 接触暗斑 ----
    for (let i = 0; i < blobs.length; i++) {
      const bl = blobs[i];
      const r = bl.rig;
      if (!r || !r.group || !r.group.visible) { bl.mesh.visible = false; continue; }
      bl.mesh.visible = qualityName !== 'low';
      if (bl.mesh.visible) {
        bl.mesh.position.set(r.group.position.x, r.group.position.y + 0.12, LAYER_Z.PLAY - 0.9);
        bl.mesh.scale.set(1, 0.5, 1);
      }
    }

    // ---- 钟 ----
    if (bellRig) {
      if (bellRingT >= 0) {
        bellRingT += dt;
        if (bellRingT > 7) bellRingT = -1;
      }
      if (!bellRig.__fallback && ActorApi.PoseBell && ActorApi.bellOk) {
        try { ActorApi.PoseBell(bellRig, bellRingT < 0 ? 0 : bellRingT); }
        catch (e) { ActorApi.bellOk = false; }
      } else if (bellRig.group) {
        bellRig.group.rotation.z = bellRingT < 0 ? 0 : Math.sin(bellRingT * 7.4) * 0.34 * Math.exp(-bellRingT * 0.5);
      }
    }

    // ---- 动态道具 ----
    const world = state.world || {};
    for (let i = 0; i < dynProps.length; i++) {
      const dp = dynProps[i];
      const near = Math.abs(dp.bx - cx) < halfW + 8;
      dp.obj.visible = near;
      if (!near) continue;
      if (dp.kind === 'chokepoint') {
        const ch = dp.prop.data && dp.prop.data.channel;
        const sealed = !!(world.levers && (world.levers.gasSeal || (ch && world.levers[ch])));
        if (dp.sealBoard) dp.sealBoard.visible = sealed;
      } else if (dp.kind === 'trapdoor') {
        const hid = dp.prop.data && dp.prop.data.hatchId;
        const hrec = hid && world.hatches ? world.hatches[hid] : null;
        const open = hrec ? !!hrec.opened : false;
        if (dp.lid) {
          const want = open ? -1.35 : 0;
          dp.lid.rotation.z += (want - dp.lid.rotation.z) * (1 - Math.exp(-7 * dt));
        }
      } else if (dp.prop.interact === 'push') {
        const target = world.pushed ? world.pushed[dp.prop.id] : undefined;
        if (typeof target === 'number') {
          dp.obj.position.x += (target - dp.obj.position.x) * (1 - Math.exp(-8 * dt));
        }
      } else if (dp.prop.interact === 'pickup') {
        const gone = world.picked ? !!world.picked[dp.prop.id] : false;
        dp.obj.visible = !gone;
      } else if (dp.prop.interact === 'hide') {
        // 藏进去时轻微晃一下，给出反馈
        const k = p.hidden ? Math.abs(px - dp.bx) < 1.6 : false;
        dp.obj.rotation.z = k ? Math.sin(t * 9.3) * 0.022 : dp.obj.rotation.z * 0.85;
      }
    }

    // ---- 互动光晕 ----
    UpdateHalos(state, px, py, cx, halfW, t);

    // ---- 灯的呼吸（顶点色，不新建材质）----
    UpdateGlows(t, mix);

    // ---- 光柱 ----
    if (shaftMesh && shaftColorAttr) {
      const arr = shaftColorAttr.array;
      for (let i = 0; i < shaftItems.length; i++) {
        const it = shaftItems[i];
        // 通气孔／枪眼漏下来的光在地道里最该看见，所以默认地下更亮；
        // 穿树冠的月光反过来——钻进地道还看得见月光柱就穿帮了。
        const env = it.surfaceOnly ? mix * mix : Lerp(1.15, 0.45, mix);
        const a = it.alpha * (0.78 + 0.22 * Math.sin(t * 0.9 + it.phase)) * env;
        for (let k = 0; k < 4; k++) arr[(it.vStart + k) * 4 + 3] = a;
      }
      shaftColorAttr.needsUpdate = true;
    }

    // ---- 危害 ----
    UpdateHazards(state, t, dt);

    // ---- 出口的一点光 ----
    if (levelExitMark) {
      levelExitMark.mat.opacity = 0.26 + 0.12 * Math.sin(t * 1.6);
    }

    // ---- 尘 ----
    UpdateDust(dt);

    // ---- 浮尘：空气里的东西（纵深线索的主力）----
    UpdateMotes(t, cx, cy, mix);

    // ---- 地下暗角 ----
    // 跟着玩家而不是相机：玩家才是"手里那点光"的中心。
    // 有马灯时罩子松一点，丢了马灯立刻收紧——这就是灭灯在画面上的代价。
    const vigA = (1 - mix) * Lerp(0.72, 0.44, lanternAmt);
    vignetteMesh.visible = vigA > 0.01 && qualityName !== 'low';
    if (vignetteMesh.visible) {
      // 罩子在 z=3.4，比玩法平面近 3.4 米，透视下会被放大——尺寸得按它自己
      // 那个深度上的可视范围算。照 viewHeight 直接算会小一圈，四角漏出来。
      const halfH = HalfHeightAt(camDist - 3.4);
      const halfWv = halfH * (viewW / Math.max(1, viewH));
      const rad = Math.max(halfWv, halfH) * Lerp(2.05, 2.75, lanternAmt);
      vignetteMesh.position.set(px, py + 0.7, 3.4);
      vignetteMesh.scale.set(rad * 2, rad * 2, 1);
      mats.vignette.opacity = vigA;
    }

    // ---- 星与月的呼吸 ----
    mats.star.opacity = (0.45 + 0.3 * mix) * (0.85 + 0.15 * Math.sin(t * 0.7));

    // ---- 胶片质感 ----
    UpdateFilm(state, t, dt, mix, lanternAmt);
  }

  /**
   * 每帧驱动后处理的强度。全部是写 uniform 的标量，零分配。
   *
   * 三个来自玩法的输入：
   *   layerMix        地表 ⇄ 地道：色调分离的暗部色要跟着换（冷蓝 ⇄ 冷褐）
   *   hud.suspicion   越紧张暗角收得越紧（镜头语言，不是随机变化）
   *   timeScale       放慢的瞬间才开拖影和更重的颗粒
   */
  /** 写一个"只改色相、不改明度"的乘色：把 rgb 除以它自己的明度。零分配。 */
  function NormalizedTint(target, r, g, b) {
    const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    const k = l > 1e-4 ? 1 / l : 1;
    target.setRGB(r * k, g * k, b * k);
  }

  function UpdateFilm(state, t, dt, mix, lanternAmt) {
    if (!filmOn) { trailAmt = 0; return; }
    const f = cfg.film;
    const u = fxComposite.uniforms;
    u.uTime.value = t;
    u.uExposure.value = renderer.toneMappingExposure;

    // —— 1. 色调分离 ——
    // 暗部：地表压冷蓝（月夜），地道压冷褐（土 + 马灯的补色）。
    // 亮部：一律推暖橙——画面里所有亮的东西都是火（窗、马灯、灶），推暖是对的。
    // 两个 tint 都**归一化到明度 1**：调色只许改色相，不许改明暗序位。
    // 不归一化的话（试过）整幅夜景被乘掉 6%，土层和远山一起沉进黑里。
    NormalizedTint(u.uShadowTint.value,
      Lerp(0.96, 0.90, mix), Lerp(0.95, 0.97, mix), Lerp(0.84, 1.16, mix));
    NormalizedTint(u.uHighTint.value, 1.12, 1.00, 0.82);
    u.uSplit.value.set(f.split * 0.70, f.split * 0.55);

    // —— 2. 颗粒 ——
    // 暗部多、亮部少。地道更粗一点（暗、闭塞、更像老胶片）。
    // 放慢的瞬间再加一档，"这一下不一样"要在画面上说出来。
    const ts = typeof state.timeScale === 'number' && isFinite(state.timeScale)
      ? Clamp(state.timeScale, 0.2, 1) : 1;
    const slow = 1 - ts;
    const gk = f.grain * (1 + slow * 0.6);
    u.uGrain.value.set(Lerp(0.0165, 0.0225, 1 - mix) * gk, 0.006 * gk);

    // —— 3. 暗角（镜头语言）——
    // 基础值很轻，只做取景；suspicion 高时才收紧，收得也很克制。
    const hud = state.hud || {};
    const sus = typeof hud.suspicion === 'number' ? Clamp(hud.suspicion, 0, 1) : 0;
    u.uVig.value.set(f.vignette * (0.26 + sus * 0.17 + (1 - mix) * 0.06),
      0.62 - sus * 0.12);

    // —— 4. 暖光辉光 ——
    // 只有暖光进得来（亮部提取里按 r-b 加权）。地道里马灯是唯一光源，给足；
    // 地表夜里油灯零星，给一半，免得整条街糊成一片橙。
    u.uBloom.value = f.bloom * Lerp(0.62 + lanternAmt * 0.25, 0.34, mix);

    // —— 5. 色差 ——：边缘 ≤1px，过量立刻廉价
    u.uCA.value = f.ca * 0.95;

    // —— 6. 快门拖影 ——：只有放慢时才开，最多 0.34
    trailAmt = f.trail > 0 ? f.trail * Clamp(slow * 1.7, 0, 1) * 0.34 : 0;
  }

  /**
   * 长焦透视的唯一入口。
   *
   * FOV 固定在 CAMERA.fovDeg（20°，窄 = 长焦 = 横版可读），**永远不动**；
   * 取景大小全靠相机距离兑现：
   *     dist = (viewHeight / 2) / tan(fov / 2)
   * 于是「z=0 平面上看到 viewHeight 那么高」这条语义在任何视口下都成立，
   * 玩法层的夹紧 / 机器人 / 冒烟测试跟渲染层用的是同一把尺子。
   * 地道把 viewHeight 收到 7.2，相机就从 32.6 米推到 20.4 米——距离一近，
   * 层间视差和坑道的进深同时变强，压迫感是免费送的。
   */
  function ApplyCameraLens() {
    camera.fov = CAMERA.fovDeg;
    camera.aspect = viewW / Math.max(1, viewH);
    camera.near = CAMERA.near;
    camera.far = CAMERA.far;
    camDist = CameraDistanceFor(viewHeight);
    camera.position.z = camDist;
    camera.updateProjectionMatrix();
    PlaceSkyMoon();
  }

  function UpdateWarmLights(cx, t, mix) {
    const budget = cfg.warmLights;
    for (let i = 0; i < warmLights.length; i++) {
      if (i >= budget) { warmLights[i].visible = false; continue; }
      warmPick[i] = -1; warmPickD[i] = Infinity;
    }
    for (let i = 0; i < glowSources.length; i++) {
      const g = glowSources[i];
      if (!g.lightPower || !g.on) continue;
      const d = Math.abs(g.x - cx);
      if (d > 26) continue;
      for (let k = 0; k < budget; k++) {
        if (d < warmPickD[k]) {
          for (let m = budget - 1; m > k; m--) { warmPickD[m] = warmPickD[m - 1]; warmPick[m] = warmPick[m - 1]; }
          warmPickD[k] = d; warmPick[k] = i;
          break;
        }
      }
    }
    for (let k = 0; k < budget; k++) {
      const l = warmLights[k];
      const gi = warmPick[k];
      if (gi < 0) { l.visible = false; continue; }
      const g = glowSources[gi];
      l.visible = true;
      l.position.set(g.x, g.y, g.z + 0.2);
      l.color.setHex(g.color);
      const fl = 1 + Math.sin(t * 9.1 + g.phase) * 0.09 + Math.sin(t * 23.7 + g.phase * 2.1) * 0.05;
      l.distance = Math.max(3.5, g.lightPower * 2.4);
      l.intensity = g.lightPower * 2.6 * fl * Lerp(1.0, 0.65, mix);
    }
  }

  function UpdateGlows(t, mix) {
    if (!glowMesh || !glowColorAttr) return;
    const arr = glowColorAttr.array;
    for (let i = 0; i < glowSources.length; i++) {
      const g = glowSources[i];
      const fl = 0.82 + 0.13 * Math.sin(t * 8.3 + g.phase) + 0.07 * Math.sin(t * 19.1 + g.phase * 1.7);
      // 坑道暖底只在地下亮：地表看见一条发光的地缝会很怪
      const layerK = g.tunnelOnly ? Lerp(1.0, 0.0, mix) : Lerp(1.0, 0.7, mix);
      const a = g.on ? g.base * fl * layerK : 0;
      for (let k = 0; k < 4; k++) arr[(g.vStart + k) * 4 + 3] = a;
    }
    glowColorAttr.needsUpdate = true;
  }

  /**
   * 互动提示的亮度。
   *
   * 教训写在这儿，免得又被调回去：第一幕光藏身点就有二十多个，只要"在画面里
   * 就常亮"，一屏立刻排开六七个等亮的暖色团——比玩家还抢眼，而且全亮等于没提示。
   * 加法混色还有个陷阱：线性 0.055 经 ACES + sRGB 编码出来是屏幕上的 ~27%，
   * 所谓"极淡"其实一点也不淡。所以现在按距离分三档：
   *   · < HALO_NEAR：真正亮起来，玩家一眼知道能上手；
   *   · NEAR→FAR：迅速掉到十几分之一，只剩"那边有点暖"；
   *   · > HALO_FAR：只留一丝地板色，够把可互动和纯装饰分开，不参与构图。
   * 同时把玩家的**高度差**算进距离：地表走路时不该点亮脚下坑道里的道具。
   */
  const HALO_NEAR = 3.6;      // 米：走到这么近就是"能上手"
  const HALO_FAR = 8.2;       // 米：出了这个圈只剩底噪
  const HALO_FLOOR = 0.055;   // 远处保留的比例（乘 peak，不是绝对亮度）

  function UpdateHalos(state, px, py, cx, halfW, t) {
    if (!haloMesh || !haloColorAttr) return;
    const world = state.world || {};
    const arr = haloColorAttr.array;
    // 呼吸压到几乎看不出来：会跳的东西自动读成 UI，油灯只是轻轻晃
    const pulse = 0.93 + 0.07 * Math.sin(t * 1.35);
    for (let i = 0; i < haloItems.length; i++) {
      const h = haloItems[i];
      let want = 0;
      if (Math.abs(h.x - cx) < halfW) {
        const gone = h.interact === 'pickup' && world.picked && world.picked[h.propId];
        if (!gone) {
          const dx = h.x - px;
          const dy = h.ay - 0.6 - py;
          const d = Math.sqrt(dx * dx + dy * dy);
          const near = Clamp((HALO_NEAR - d) / HALO_NEAR, 0, 1);
          const mid = Clamp((HALO_FAR - d) / (HALO_FAR - HALO_NEAR), 0, 1);
          // 中段给足（走过来的路上就看得出"那儿有东西"），远端塌得很快
          const k = HALO_FLOOR + 0.32 * Math.pow(mid, 1.6) + 0.63 * Math.pow(near, 1.2);
          want = h.peak * k * pulse;
        }
      }
      h.cur += (want - h.cur) * 0.16;
      const a = h.cur;
      for (let k = 0; k < 4; k++) arr[(h.vStart + k) * 4 + 3] = a;
    }
    haloColorAttr.needsUpdate = true;
  }

  function UpdateHazards(state, t, dt) {
    const list = Array.isArray(state.hazards) ? state.hazards : null;
    for (let i = 0; i < hazardViews.length; i++) {
      const v = hazardViews[i];
      let live = null;
      if (list) for (let k = 0; k < list.length; k++) if (list[k] && list[k].id === v.id) { live = list[k]; break; }
      const active = live ? !!live.active : false;
      const lvl = live && typeof live.level === 'number' ? Clamp(live.level, 0, 1) : 0;
      v.group.visible = active && lvl > 0.001;
      if (!v.group.visible) continue;

      const span = Math.max(0.2, v.x1 - v.x0);
      const reach = span * lvl;

      if (v.kind === 'water') {
        // 液面高度直接读 level：0 → 脚脖子，1 → 齐胸偏上。
        // 上限刻意压在坑道净空（约 1.78m）以下——一旦灌到顶，液面线就贴到顶板上
        // 看不见了，"水在涨"这条唯一的判定信息当场消失。
        const h = 0.18 + lvl * 1.42;
        v.group.position.set(v.x0, v.y, 1.15);
        const body = v.layers[0];
        body.scale.set(reach, h, 1);
        mats.water.opacity = 0.55 + lvl * 0.3;
        mats.water.emissiveIntensity = 0.8 + lvl * 0.55;
        if (v.band) {
          // 液面线：一条随波动的亮带，位置就是水面
          v.band.position.set(0, h, 0.06);
          v.band.scale.set(reach, 0.34 + 0.10 * Math.sin(t * 1.9), 1);
          if (mats.waterLine.map) {
            mats.waterLine.map.offset.x = -t * 0.14;
            mats.waterLine.map.offset.y = Math.sin(t * 0.7) * 0.05;
          }
          mats.waterLine.opacity = (0.52 + 0.26 * Math.sin(t * 2.3)) * (0.55 + lvl * 0.55);
        }
        if (v.glint) {
          // 液面反光：一道更宽更淡的柔光贴在水面上，读作"这是液体不是色块"
          v.glint.position.set(reach * (0.35 + 0.25 * Math.sin(t * 0.55)), h - 0.06, 0.05);
          v.glint.scale.set(reach * 0.5, 1.1, 1);
        }
        if (v.front) {
          // 推进前沿：竖的一道亮边，明确"水从左往右灌"
          v.front.position.set(reach, h * 0.45, 0.1);
          v.front.scale.set(1.5, h * 1.5 + 0.8, 1);
          v.front.material.opacity = (0.26 + 0.16 * Math.sin(t * 3.4)) * Clamp(lvl * 2.2, 0, 1);
        }
      } else if (v.kind === 'collapse') {
        const s = 0.35 + lvl * 0.85;
        v.group.scale.set(s, s, s);
        for (let k = 0; k < v.layers.length; k++) v.layers[k].position.y = 0;
      } else if (v.field) {
        // 毒烟：逐团算浓度。前沿之外完全不画，前沿附近半透 —— 这样蔓延方向
        // 和浓度都是一眼可读的，而不是一块整齐的灰绿色板。
        const f = v.field;
        const front = v.x0 + reach;
        const pos = f.posAttr.array;
        const col = f.colorAttr.array;
        const puffs = f.puffs;
        for (let k = 0; k < puffs.length; k++) {
          const pf = puffs[k];
          // 前沿软过渡：离前沿 3 米内线性起浓
          const behind = front - pf.x;
          let c = Clamp(behind / 3.0, 0, 1);
          // 靠近源头更浓，越往前越稀 —— 这就是"看得出从哪边来"
          const depth = Clamp((pf.x - v.x0) / Math.max(1, f.span), 0, 1);
          c *= Lerp(1.0, 0.55, depth);
          // 翻滚：每团自己的呼吸
          const roll = 0.72 + 0.28 * Math.sin(t * (0.8 + pf.drift) + pf.phase);
          const rowOff = f.rowLimit != null && pf.row >= f.rowLimit ? 0 : 1;
          const a = c * lvl * roll * (0.30 - pf.row * 0.045) * rowOff;
          // 上飘：低排慢、高排快，整体缓慢向上循环
          const rise = ((t * pf.drift * 0.45 + pf.phase) % 2.2);
          const yy = pf.y0 + rise * 0.42 + Math.sin(t * 0.6 + pf.phase) * 0.12;
          const fade = rise > 1.7 ? Clamp((2.2 - rise) / 0.5, 0, 1) : 1;
          const b = k * 4;
          for (let q = 0; q < 4; q++) {
            const vi = (b + q) * 3;
            pos[vi + 1] = yy + (q === 2 || q === 3 ? pf.hw : -pf.hw);
            const ci = (b + q) * 4;
            // 前沿那一圈偏黄绿（更"呛"），后方偏灰绿
            const lead = Clamp(1 - behind / 4.0, 0, 1);
            col[ci] = 0.50 + lead * 0.30;
            col[ci + 1] = 0.64 + lead * 0.08;
            col[ci + 2] = 0.28;
            col[ci + 3] = a * fade;
          }
        }
        f.posAttr.needsUpdate = true;
        f.colorAttr.needsUpdate = true;
      }
    }
  }

  function UpdateDust(dt) {
    if (!dustGeo) return;
    let any = false;
    for (let i = 0; i < dustCapacity; i++) {
      if (dustLife[i] <= 0) continue;
      any = true;
      dustLife[i] -= dt;
      if (dustLife[i] <= 0) {
        dustPos[i * 3 + 1] = -9999;
        dustCol[i * 4 + 3] = 0;
        continue;
      }
      dustVel[i * 3 + 1] -= 1.9 * dt;
      dustVel[i * 3] *= (1 - 1.5 * dt);
      dustPos[i * 3] += dustVel[i * 3] * dt;
      dustPos[i * 3 + 1] += dustVel[i * 3 + 1] * dt;
      dustPos[i * 3 + 2] += dustVel[i * 3 + 2] * dt;
      dustCol[i * 4 + 3] = Clamp(dustLife[i] / Math.max(0.01, dustMax[i]), 0, 1) * 0.6;
    }
    if (any) {
      dustGeo.attributes.position.needsUpdate = true;
      dustGeo.attributes.color.needsUpdate = true;
    }
    mats.dust.size = Clamp(0.16 * (viewH / Math.max(1, viewHeight)), 2, 22);
  }

  // ------------------------------------------------------------------
  // ConsumeEvent
  // ------------------------------------------------------------------

  function ConsumeEvent(ev) {
    if (!ev || typeof ev !== 'object') return;
    try {
      switch (ev.kind) {
        case 'dust':
          SpawnDust(ev.x || 0, ev.y || 0, typeof ev.power === 'number' ? ev.power : 0.5, null);
          break;
        case 'shake':
          shakeExtra = Clamp(shakeExtra + (typeof ev.power === 'number' ? ev.power : 0.3), 0, 1);
          break;
        case 'sfx':
          if (ev.id === 'bell_ring') bellRingT = 0;
          else if (ev.id === 'dig' || ev.id === 'hatch_open' || ev.id === 'push') SpawnDust(ev.x || 0, ev.y || 0, 0.55, null);
          else if (ev.id === 'land') SpawnDust(ev.x || 0, ev.y || 0, 0.4, null);
          else if (ev.id === 'lever') SpawnDust(ev.x || 0, ev.y || 0, 0.22, null);
          break;
        case 'spot':
          shakeExtra = Clamp(shakeExtra + 0.22, 0, 1);
          break;
        case 'checkpoint':
        case 'codex':
          SpawnDust(camera.position.x, camera.position.y, 0.3, 'warm');
          break;
        case 'lost':
          shakeExtra = Clamp(shakeExtra + 0.5, 0, 1);
          break;
        default:
          break;
      }
    } catch (e) { /* 事件绝不许把渲染搞崩 */ }
  }

  // ------------------------------------------------------------------
  // Resize / SetQuality / Dispose
  // ------------------------------------------------------------------

  function Resize(width, height, dpr) {
    viewW = Math.max(1, Math.floor(width || 1));
    viewH = Math.max(1, Math.floor(height || 1));
    const ratio = Clamp(dpr || (typeof window !== 'undefined' ? window.devicePixelRatio : 1) || 1, 0.5, cfg.maxPixelRatio);
    renderer.setPixelRatio(ratio);
    renderer.setSize(viewW, viewH, false);
    ApplyCameraLens();
    RebuildFilm();
  }

  function RebuildTextures() {
    if (!HAS_DOM) return;
    const old = [];
    texCache.forEach(function (tex) { if (tex) old.push(tex); });
    texCache.clear();
    const keys = Object.keys(mats);
    for (let i = 0; i < keys.length; i++) {
      const m = mats[keys[i]];
      if (m && m.__tex) { m.map = T(m.__tex); m.needsUpdate = true; }
    }
    // 非 __tex 标记的特殊材质
    mats.earth.map = T('earth');
    mats.sky.map = T('sky');
    mats.moon.map = T('glow');
    mats.glowAdd.map = T('glow');
    mats.haloAdd.map = T('glow');
    mats.shaftAdd.map = T('shaft');
    mats.gas.map = T('smoke');
    mats.waterLine.map = T('water');
    mats.waterEdge.map = T('glow');
    mats.vignette.map = T('vignette');
    mats.earthBack.map = T('earth');
    mats.dust.map = T('glow');
    mats.blob.map = T('glow');
    mats.foreBokeh.map = T('glow');
    mats.mist.map = T('mist');
    for (let i = 0; i < hazeMats.length; i++) { hazeMats[i].map = T('haze'); hazeMats[i].needsUpdate = true; }
    for (let i = 0; i < moteMats.length; i++) { moteMats[i].map = T('glow'); moteMats[i].needsUpdate = true; }
    for (let i = 0; i < old.length; i++) { try { old[i].dispose(); } catch (e) { /* 忽略 */ } }
  }

  function SetQuality(q) {
    if (!QUALITY_PRESET[q] || q === qualityName) return;
    const prevTex = cfg.texSize;
    qualityName = q;
    cfg = QUALITY_PRESET[q];
    // 立刻生效的部分
    renderer.shadowMap.enabled = cfg.shadows;
    if (cfg.shadows && !moon.castShadow) SetupShadow(moon);
    moon.castShadow = cfg.shadows;
    renderer.setPixelRatio(Clamp(renderer.getPixelRatio(), 0.5, cfg.maxPixelRatio));
    if (cfg.texSize !== prevTex) RebuildTextures();
    // 层间空气雾
    gFx.traverse(function (o) { if (o.isMesh && o.userData.isHaze) o.visible = cfg.hazePlanes; });
    // 暖光池预算
    for (let i = 0; i < warmLights.length; i++) if (i >= cfg.warmLights) warmLights[i].visible = false;
    // low 档：关掉尘。暗角罩和接触暗斑每帧在 Sync 里按 qualityName 判定，
    // 这里只处理 Sync 不会重置的那一个。
    if (dustPoints) dustPoints.visible = qualityName !== 'low';
    // 纵深强化的三样"贴上去"的东西：档位一降立刻全关。
    //   浮尘层：按 cfg.moteBands 逐层收（low = 0 层，一颗都不画）
    //   中间层：整组隐藏（几何还在，下一次 BuildLevel 才真正不造）
    //   失焦叶团：只在 high 档
    for (let i = 0; i < moteLayers.length; i++) {
      const pts = moteLayers[i].points;
      if (pts) pts.visible = i < (cfg.moteBands || 0);
    }
    gDepth.visible = !!cfg.depthLayers;
    gForePar.traverse(function (o) { if (o.isMesh && o.material === mats.foreBokeh) o.visible = !!cfg.foreBokeh; });
    // 毒烟团场：low 档砍掉最上面那一排
    for (let i = 0; i < hazardViews.length; i++) {
      const v = hazardViews[i];
      if (!v.field) continue;
      v.field.rowLimit = qualityName === 'low' ? 2 : 99;
    }
    // 胶片链：low 档整块关（连 RT 都释放），medium 去掉辉光和拖影
    RebuildFilm();
    // 剖面细分 / 前景密度 / 纹理尺寸下一次 BuildLevel 才完全生效
  }

  function Dispose() {
    ClearLevel();
    DisposeTargets();
    try { fxGeo.dispose(); } catch (e) { /* 忽略 */ }
    const fxMats = [fxComposite, fxBright, fxBlur, fxTrail];
    for (let i = 0; i < fxMats.length; i++) { try { fxMats[i].dispose(); } catch (e) { /* 忽略 */ } }
    camera.remove(gSky);
    scene.remove(gFar); scene.remove(gBack); scene.remove(gDepth); scene.remove(gMid);
    scene.remove(gPlay); scene.remove(gFore); scene.remove(gFx);
    scene.remove(vignetteMesh);
    try { vignetteGeo.dispose(); } catch (e) { /* 忽略 */ }
    for (let i = 0; i < moteMats.length; i++) { try { moteMats[i].dispose(); } catch (e) { /* 忽略 */ } }
    const keys = Object.keys(mats);
    for (let i = 0; i < keys.length; i++) { try { mats[keys[i]].dispose(); } catch (e) { /* 忽略 */ } }
    texCache.forEach(function (tex) { if (tex) { try { tex.dispose(); } catch (e) { /* 忽略 */ } } });
    texCache.clear();
    try { renderer.dispose(); } catch (e) { /* 忽略 */ }
    try { if (renderer.forceContextLoss) renderer.forceContextLoss(); } catch (e) { /* 忽略 */ }
  }

  /**
   * 敌人 kind 实际用的是哪个 Actor rig。
   *
   * 存在的意义是**可测**。"新 kind 静默退化成另一个 kind"这类 bug 不抛异常、
   * 不掉帧、像素测试也照样过——只有人盯着画面才会发现"这俩怎么长得一样"。
   * 健康检查可以拿关卡里出现的每个 enemy kind 调它，比对返回值是否等于自己；
   * 落到 ENEMY_RIG_FALLBACK 就直接判失败。
   */
  function RigKindFor(enemyKind) {
    const k = ENEMY_RIG[enemyKind];
    return typeof k === 'string' ? k : ENEMY_RIG_FALLBACK;
  }

  // 初始化尺寸（Resize 里会顺带建起后处理链）
  Resize(viewW, viewH, opts.pixelRatio);
  ApplyCameraLens();

  return {
    scene, camera, renderer, three: THREE,
    BuildLevel, Sync, ConsumeEvent, Resize, SetQuality, Dispose,
    RigKindFor,
    stats,
  };
}

export default { CreateRenderer };
