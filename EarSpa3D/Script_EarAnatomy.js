// 《采耳物语 · EarSpa3D》耳部解剖模块（右耳）
//
// 设计原则（为什么这么做）：
// 1) 「形状」与「判定」必须同源。耳道管腔的网格顶点和 canal.PointAt / RadiusAt 走的是
//    同一组公式（中心线 LUT + RadiusAt），所以工具尖端用 Project() 换算出来的
//    (depth, angle) 一定落在真实渲染出来的那层皮上，不会「看得到却摸不到」，
//    也不会「工具插进肉里」。想让耳道变形，必须先改 RadiusAt。
// 2) 真实解剖优先。全长 28mm、外 1/3 软骨部向前上 / 内 2/3 骨部向后下的 S 形、
//    峡部最窄、横截面是横宽竖窄的椭圆、鼓膜有光锥与锤骨短突——都按临床耳镜所见做，
//    再用「清新治愈」的配色可爱化（健康粉嫩，不惨白不深红）。
// 3) 一切程序化。不引用任何外部模型文件，几何全部由 BufferGeometry 现场生成。
//
// 坐标系（契约 §2）：+Z 指向耳道深处，+Y 上（superior），右手系。
// θ=0 指向上方，从耳道口往里看顺时针增大（后 → 下 → 前）：
// θ=0 上壁 / θ=π/2 后壁 / θ=π 下壁 / θ=3π/2 前壁。
// 已核对：截面里 right = tangent × up，而 up × right = -tangent，
// 也就是「从 +tangent 看过去」up→right 是顺时针，与契约文字一致。

import * as THREE from "three";
import { PALETTE } from "./Data_Palette.mjs?v=ear006-20260911";

// ─────────────────────────── 契约常量 ───────────────────────────

/** 耳道全长（mm）。深度 0 = 耳道口，28 = 鼓膜之后的深度上限。 */
export const CANAL_LENGTH = 28;

/** 分区表，与 Data_Contract.md §2 一致，HUD 与判定共用。 */
export const CANAL_ZONES = [
  { id: "cartilage", label: "软骨部", from: 0, to: 9, hint: "耳毛与耵聍腺都在这儿，耵聍主要产地" },
  { id: "bony", label: "骨部", from: 9, to: 21, hint: "皮肤极薄，最敏感，酥麻感来源" },
  { id: "danger", label: "危险区", from: 21, to: 25, hint: "再往里就是鼓膜，收手" },
  { id: "drum", label: "鼓膜区", from: 25, to: 28, hint: "绝对的禁区，碰到就结束" },
];

/** 鼓膜所在深度（mm）。25 是「鼓膜区」的分界线，膜片就落在这一层。 */
export const DRUM_DEPTH = 25;
/** 鼓膜直径（mm），契约给定约 9。 */
export const DRUM_DIAMETER = 9;

// ─────────────────────────── 随机数 ───────────────────────────
// 契约说 lead 也会提供 MakeRng；这里自己再导出一份，保证本模块单独可用。
// 同一颗种子必须给出同一套耳毛 / 皮纹，方便回归比对。

/** Mulberry32：小、快、分布够用，且完全由种子决定。 */
export function MakeRng(seed = 20260910) {
  let a = (seed >>> 0) || 1;
  return function rng() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ─────────────────────────── 小工具 ───────────────────────────

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const smooth01 = (t) => { const x = clamp(t, 0, 1); return x * x * (3 - 2 * x); };
const gauss = (x, s) => Math.exp(-(x * x) / (2 * s * s));

/** 32 位整数哈希 → [0,1)：无状态程序噪声的基础，同一输入永远同一输出。 */
function hash2i(x, y) {
  let h = (x | 0) * 374761393 + (y | 0) * 668265263;
  h = (h ^ (h >>> 13)) >>> 0;
  h = Math.imul(h, 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function noise1(x, seed) {
  const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f);
  return lerp(hash2i(i, seed), hash2i(i + 1, seed), u);
}

/** 周期性 value noise：角度方向专用，保证 θ=0 与 θ=2π 接得上，不留缝。 */
function noise1Periodic(x, period, seed) {
  const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f);
  const a = ((i % period) + period) % period;
  const b = (((i + 1) % period) + period) % period;
  return lerp(hash2i(a, seed), hash2i(b, seed), u);
}

function noise2(x, y, seed) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const ux = xf * xf * (3 - 2 * xf), uy = yf * yf * (3 - 2 * yf);
  const n00 = hash2i(xi + seed * 131, yi);
  const n10 = hash2i(xi + 1 + seed * 131, yi);
  const n01 = hash2i(xi + seed * 131, yi + 1);
  const n11 = hash2i(xi + 1 + seed * 131, yi + 1);
  return lerp(lerp(n00, n10, ux), lerp(n01, n11, ux), uy);
}

/** 两层 fbm 足够做皮纹和耵聍边缘抖动，再多就白烧手机算力。 */
function fbm2(x, y, seed, octaves = 2) {
  let s = 0, amp = 0.5, f = 1;
  for (let i = 0; i < octaves; i++) {
    s += amp * noise2(x * f, y * f, seed + i * 7);
    f *= 2.03;
    amp *= 0.5;
  }
  return s;
}

/** 单调点集上的 Catmull-Rom 插值：所有长轴方向的外形都用它，改一个控制点就能调形。 */
function spline1(xs, ys, x) {
  const n = xs.length;
  if (x <= xs[0]) return ys[0];
  if (x >= xs[n - 1]) return ys[n - 1];
  let i = 0;
  while (i < n - 2 && x > xs[i + 1]) i++;
  const t = (x - xs[i]) / (xs[i + 1] - xs[i]);
  const y0 = ys[i - 1] !== undefined ? ys[i - 1] : ys[i] - (ys[i + 1] - ys[i]);
  const y1 = ys[i], y2 = ys[i + 1];
  const y3 = ys[i + 2] !== undefined ? ys[i + 2] : y2 + (y2 - y1);
  const m1 = 0.5 * (y2 - y0), m2 = 0.5 * (y3 - y1);
  const t2 = t * t, t3 = t2 * t;
  return (2 * t3 - 3 * t2 + 1) * y1 + (t3 - 2 * t2 + t) * m1 + (-2 * t3 + 3 * t2) * y2 + (t3 - t2) * m2;
}

/** 周期版：角度方向的外形（耳廓轮廓 R(α)）用。 */
function spline1Periodic(ys, x01) {
  const n = ys.length;
  const fx = x01 * n;
  const i = Math.floor(fx) % n;
  const t = fx - Math.floor(fx);
  const g = (k) => ys[((k % n) + n) % n];
  const y0 = g(i - 1), y1 = g(i), y2 = g(i + 1), y3 = g(i + 2);
  const m1 = 0.5 * (y2 - y0), m2 = 0.5 * (y3 - y1);
  const t2 = t * t, t3 = t2 * t;
  return (2 * t3 - 3 * t2 + 1) * y1 + (t3 - 2 * t2 + t) * m1 + (-2 * t3 + 3 * t2) * y2 + (t3 - t2) * m2;
}

/** 材质兜底：可选依赖缺失时不许抛异常，退回 MeshStandardMaterial + PALETTE 色。 */
function pickMaterial(materials, key, color, opts = {}) {
  const m = materials && materials[key];
  if (m && m.isMaterial) return { mat: m, owned: false };
  return {
    mat: new THREE.MeshStandardMaterial({
      color: new THREE.Color(color),
      roughness: opts.roughness ?? 0.8,
      metalness: opts.metalness ?? 0,
      ...opts,
    }),
    owned: true,
  };
}

// ═══════════════════════════ 耳道中心线 ═══════════════════════════
//
// 临床依据（成人右耳，耳镜与解剖学教材共识）：
//   · 外耳道口到鼓膜全长 25–30mm，本项目取 28。
//   · 外 1/3（约 8–9mm）为软骨部：可活动、有耳毛与耵聍腺，走向「向前上」。
//   · 内 2/3 为骨部：被颞骨包住、不可动，走向「向后下」，皮肤极薄极敏感。
//   · 交界处为峡部（isthmus），管腔最窄，约 9–11mm 深处。
//   · 横截面非正圆：成人横径 7–9mm、竖径 5–7mm 的椭圆（本项目取 8.6×6.2 左右）。

/** 归一化控制点：x = 后(+)/前(-)，y = 上(+)/下(-)，z = 进深(+)。 */
const CANAL_PATH_PTS = [
  [0.0, 0.0, 0.0],   // 0 耳道口（耳甲腔底）
  [1.0, 0.3, 2.5],   // 1 软骨部起始，先偏后
  [2.2, 0.7, 5.5],   // 2 软骨部中段，向前上抬
  [3.2, 0.8, 9.5],   // 3 峡部前后：横向弓到最大
  [3.0, 0.2, 13.5],  // 4 骨部起始，转向下
  [1.4, -0.8, 17.0], // 5 骨部，落向前下
  [-0.6, -1.0, 20.0], // 6 危险区，继续向前下
  [-1.4, -0.5, 23.0], // 7 贴近鼓膜
  [-1.6, 0.0, 25.5], // 8 鼓膜平面
];
/** 一个缩放常数，把上面这串数字的总弧长精确标定成 CANAL_LENGTH。 */
const CANAL_PATH_SCALE = 28 / 26.5565;

const PATH_LUT_N = 1024; // LUT 越密，Project 的精度越高（这里到 0.01mm 级）

function buildPathLut() {
  const pts = CANAL_PATH_PTS.map((p) => new THREE.Vector3(p[0], p[1], p[2]).multiplyScalar(CANAL_PATH_SCALE));
  // 两端各补一个镜像虚控制点，让首尾也平滑（否则起点切向会偏）
  const ext = [
    pts[0].clone().multiplyScalar(2).sub(pts[1]),
    ...pts,
    pts[pts.length - 1].clone().multiplyScalar(2).sub(pts[pts.length - 2]),
  ];
  const dense = [];
  const per = 256;
  for (let s = 0; s < ext.length - 3; s++) {
    const p0 = ext[s], p1 = ext[s + 1], p2 = ext[s + 2], p3 = ext[s + 3];
    for (let i = 0; i < per; i++) {
      const t = i / per, t2 = t * t, t3 = t2 * t;
      dense.push(new THREE.Vector3(
        0.5 * ((2 * p1.x) + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
        0.5 * ((2 * p1.y) + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
        0.5 * ((2 * p1.z) + (-p0.z + p2.z) * t + (2 * p0.z - 5 * p1.z + 4 * p2.z - p3.z) * t2 + (-p0.z + 3 * p1.z - 3 * p2.z + p3.z) * t3)
      ));
    }
  }
  dense.push(ext[ext.length - 2].clone());

  const cum = [0];
  for (let i = 1; i < dense.length; i++) cum.push(cum[i - 1] + dense[i].distanceTo(dense[i - 1]));
  const total = cum[cum.length - 1];

  // 按弧长均匀重采样：这样 LUT 的 index 能线性换算成 depth（契约里的「沿中心线距离」）
  const pos = new Float32Array(PATH_LUT_N * 3);
  let j = 0;
  for (let i = 0; i < PATH_LUT_N; i++) {
    const target = (i / (PATH_LUT_N - 1)) * total;
    while (j < cum.length - 2 && cum[j + 1] < target) j++;
    const t = (target - cum[j]) / Math.max(1e-9, cum[j + 1] - cum[j]);
    const a = dense[j], b = dense[j + 1];
    pos[i * 3] = lerp(a.x, b.x, t);
    pos[i * 3 + 1] = lerp(a.y, b.y, t);
    pos[i * 3 + 2] = lerp(a.z, b.z, t);
  }
  const tan = new Float32Array(PATH_LUT_N * 3);
  for (let i = 0; i < PATH_LUT_N; i++) {
    const i0 = Math.max(0, i - 1), i1 = Math.min(PATH_LUT_N - 1, i + 1);
    const dx = pos[i1 * 3] - pos[i0 * 3], dy = pos[i1 * 3 + 1] - pos[i0 * 3 + 1], dz = pos[i1 * 3 + 2] - pos[i0 * 3 + 2];
    const l = Math.max(1e-9, Math.hypot(dx, dy, dz));
    tan[i * 3] = dx / l; tan[i * 3 + 1] = dy / l; tan[i * 3 + 2] = dz / l;
  }

  // 平行传输参考系：比 Frenet 稳（直线段不会翻滚），保证 θ=0 一路连续指向上方
  const frm = new Float32Array(PATH_LUT_N * 6); // up(3) + right(3)
  const T = new THREE.Vector3(), U = new THREE.Vector3(), R = new THREE.Vector3();
  let up = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i < PATH_LUT_N; i++) {
    T.set(tan[i * 3], tan[i * 3 + 1], tan[i * 3 + 2]);
    U.copy(up).addScaledVector(T, -up.dot(T));
    if (U.lengthSq() < 1e-8) U.set(0, 1, 0).addScaledVector(T, -T.y);
    U.normalize();
    R.copy(T).cross(U).normalize();
    frm[i * 6] = U.x; frm[i * 6 + 1] = U.y; frm[i * 6 + 2] = U.z;
    frm[i * 6 + 3] = R.x; frm[i * 6 + 4] = R.y; frm[i * 6 + 5] = R.z;
    up.copy(U);
  }
  return { pos, tan, frm, total };
}

// ═══════════════════════════ 管腔粗细与皮纹 ═══════════════════════════

/** 竖径（上下方向）半径曲线（mm）。峡部 9–11mm 处最窄，这是不可逾越的解剖事实。 */
const R_VER_XS = [0, 3, 6, 9, 11, 14, 18, 21, 25, 28];
const R_VER_YS = [2.55, 2.60, 2.55, 2.55, 2.50, 2.70, 2.90, 3.00, 3.10, 3.25];
/** 横径（前后方向）半径曲线（mm）。整体比竖径大，合起来就是 8.6×6.2 的椭圆。 */
const R_HOR_XS = R_VER_XS;
const R_HOR_YS = [3.30, 3.60, 3.80, 3.50, 3.30, 3.60, 4.00, 4.20, 4.30, 4.40];

/**
 * 管腔半径（mm）。这是「形状」与「判定」共用的唯一一份公式。
 * θ 用近似角度参与椭圆各向异性：因为 max/min = 1.33，且后面乘的皮纹系数在 ±5% 内，
 * 所以由 PointAt 反解出来的 (r, θ) 仍然自洽（相对误差 <5%，见 _dev 自测页）。
 */
function radiusRaw(depth, angle) {
  const d = clamp(depth, 0, CANAL_LENGTH);
  const rh = spline1(R_HOR_XS, R_HOR_YS, d);
  const rv = spline1(R_VER_XS, R_VER_YS, d);
  const ca = Math.cos(angle), sa = Math.sin(angle);
  let r = 1 / Math.sqrt((ca * ca) / (rv * rv) + (sa * sa) / (rh * rh));
  // 皮纹：真实耳道内壁不是光滑水管。软骨部厚皮起伏明显，骨部皮薄、起伏很轻。
  const roughAmp = spline1([0, 6, 10, 16, 28], [0.055, 0.05, 0.016, 0.010, 0.008], d);
  const n1 = fbm2(d * 1.35, angle * 2.2, 17, 2) - 0.5;
  const n2 = noise1Periodic(angle * 5.5 + d * 0.9, 7, 29) - 0.5;
  const lumps = gauss(d - 5.2, 1.6) * (fbm2(angle * 1.6, d * 0.7, 5, 2) - 0.5) * 0.10;
  r *= 1 + roughAmp * (n1 * 2 + n2 * 1.2) + lumps;
  return Math.max(1.2, r);
}

/** 皮纹噪声入口，导出让耵聍系统复用同一份图案（两边各写一套必然对不上）。 */
export function AnatomyNoise(x, y) {
  return fbm2(x, y, 17, 2);
}

// ═══════════════════════════ 耳廓高度场 ═══════════════════════════
//
// 耳廓在「耳廓平面」里做参数化曲面。平面坐标 (u, v)：
//   u = 上(+)/下(-)，v = 前(+，朝脸)/后(-)。
// 平面基准在 z = PINNA_PLANE_Z，高度朝 +Z（朝外、朝检查者）长。
// 径向参数 s：s=0 在耳甲中心，s=1 在外轮廓；α 绕耳甲中心一圈，
//   α=0 → 下方（耳垂），α≈0.35π → 前方（耳屏），α=0.55π → 上方，α≈π → 后方。
// 为什么不用「以耳道口为中心的放射网格」：耳廓外形上长下圆、前方窄，
// 用 R(α) 直接控制轮廓比椭圆网格省参数，也更好调。
//
// 关键解剖关系：**耳道口不在耳甲中心，而是偏前偏下**（这正是耳屏能遮住它的原因）。
// 所以 (u, v) 的原点取在耳甲中心，耳道口在 (MEATUS_U, MEATUS_V)；
// 而 SURFACE 参数里的 s·R(α) 是「到耳道口的距离」，开耳甲碗直接用它会得到正确的碗底。

const PINNA_PLANE_Z = -2.6; // 耳廓相对耳道口平面的前后位置（mm），负 = 更靠里
const MEATUS_U = -8.2;      // 耳道口相对耳甲中心的上下偏移（负 = 更靠下）
const MEATUS_V = 0.0;       // 前后基本对齐耳甲中心
// 耳廓轮廓半径 R(α)（mm）。参照成人耳廓高约 60mm、宽约 33mm、耳垂约占下方 1/4：
// 从耳道口量起，上缘约 34mm、后缘约 26mm、下缘（耳垂尖）约 24mm、前缘约 14.5mm。
const RIM_R = [24.0, 20.0, 14.5, 21.5, 33.0, 34.0, 33.0, 27.0, 25.5, 25.0, 25.5, 26.5];

function rimRadius(a01) {
  return spline1Periodic(RIM_R, a01);
}

/** 耳廓平面内的位置（未加高度）。s 是「到耳道口的距离 / R(α)」。 */
function pinnaPlanePoint(a01, s, out) {
  const a = a01 * Math.PI * 2;
  const r = s * rimRadius(a01);
  out.u = MEATUS_U + (-Math.cos(a)) * r;
  out.v = MEATUS_V + Math.sin(a) * r;
  return out;
}

/** 耳廓上表面高度（mm，朝 +Z 外）。所有解剖特征都在这里叠加。 */
function pinnaHeight(a01, s) {
  const a = a01 * Math.PI * 2;
  const rr = s * rimRadius(a01);
  const dx = -Math.cos(a) * rr, dy = Math.sin(a) * rr; // 相对耳道口的平面偏移

  // ① 耳轮 helix：外缘隆起，越靠边越厚。耳垂段（a01≈0）改用肉感处理，所以淡出。
  const helixFade = 1 - 0.75 * gauss(a01 - 0.02, 0.06) - 0.75 * gauss(a01 - 0.98, 0.06);
  let h = 2.35 * Math.pow(clamp(s, 0, 1), 2.1) * helixFade;
  // ② 舟状窝 scapha：耳轮与对耳轮之间的浅沟（主要在上方与后方）
  h -= 1.15 * gauss(s - 0.815, 0.075) * (0.45 + 0.55 * smooth01((Math.cos(a - 2.35) + 0.25) / 0.9));
  // ③ 对耳轮 antihelix：一条从后下方绕上来的脊，到上方分叉成两支脚
  const ahMask = 0.28 + 0.72 * smooth01((Math.cos(a - 2.25) + 0.3) / 1.0);
  h += 1.55 * gauss(s - 0.635, 0.085) * ahMask;
  // ④ 三角窝 triangular fossa：两脚之间的浅窝
  h -= 0.85 * gauss(s - 0.545, 0.115) * gauss(a - Math.PI * 1.06, 0.30);
  // ⑤ 对耳轮上脚 / 下脚：两条脊
  h += 0.85 * gauss(a - Math.PI * 0.93, 0.135) * gauss(s - 0.50, 0.13);
  h += 0.72 * gauss(a - Math.PI * 1.19, 0.135) * gauss(s - 0.47, 0.13);
  // ⑥ 耳甲腔 concha：一个真正的碗。碗心就是耳道口，所以按「到耳道口的距离」开碗。
  h -= 6.2 * gauss(rr, 7.4);
  // ⑦ 耳道口的环形唇：让「洞」看起来是长出来的而不是凿出来的
  h += 0.62 * gauss(rr - 5.0, 1.15);
  // ⑧ 耳屏 tragus：遮在耳道口前方的肉瓣（前方 = +v）
  h += 2.05 * gauss(dx + 3.6, 3.1) * gauss(dy - 9.5, 3.4);
  // ⑨ 对耳屏 antitragus：耳道口后下方的肉丘，比耳屏矮
  h += 1.50 * gauss(dx - 7.5, 3.4) * gauss(dy - 8.0, 3.4);
  // ⑩ 屏间切迹 intertragic notch：两者之间的缺口
  h -= 0.90 * gauss(dx - 2.6, 2.4) * gauss(dy - 8.6, 2.2);
  // ⑪ 耳垂 lobule：没有软骨，是一团又软又厚的肉
  h += 0.90 * gauss(a01 - 0.015, 0.062) * smooth01((0.42 - s) / 0.42);
  // ⑫ 细纹：高模下的皮肤起伏；低模看不出来也不至于死板
  h += (fbm2(a01 * 9.0, s * 7.0, 3, 2) - 0.5) * 0.22;
  return h;
}

/** 耳廓厚度（mm）：耳垂与耳屏肉厚、耳轮边缘薄，做出「一瓣肉」的观感。 */
function pinnaThickness(a01, s) {
  const a = a01 * Math.PI * 2;
  const rimT = 0.85 + 3.3 * smooth01((0.94 - s) / 0.30);
  const lobeT = 3.4 * gauss(a01 - 0.015, 0.08);
  const tragusT = 1.4 * gauss(s - 0.72, 0.16) * gauss(Math.cos(a - Math.PI * 0.34) - 0.62, 0.24);
  return clamp(rimT + lobeT + tragusT, 0.7, 7.5);
}

// ═══════════════════════════ 主体构建 ═══════════════════════════

const QUALITY_TABLE = {
  low: { ringN: 26, segN: 16, pinnaA: 56, pinnaS: 26, hairs: 24, drumSeg: 16 },
  mid: { ringN: 40, segN: 24, pinnaA: 80, pinnaS: 36, hairs: 40, drumSeg: 24 },
  high: { ringN: 56, segN: 32, pinnaA: 112, pinnaS: 52, hairs: 56, drumSeg: 32 },
};

/**
 * 造一只右耳。
 * @param {*} _THREE 契约要求的位置参数；实际用模块内 import 的 THREE，保持签名兼容。
 * @param {{materials?:object, quality?:string, seed?:number}} opts
 */
export function BuildEar(_THREE, { materials, quality = "mid", seed = 20260910 } = {}) {
  const rng = MakeRng(seed);
  const group = new THREE.Group();
  group.name = "EarAnatomy";
  const ownedGeometries = [];
  const ownedMaterials = [];
  const own = (g) => { ownedGeometries.push(g); return g; };

  let q = QUALITY_TABLE[quality] || QUALITY_TABLE.mid;
  const path = buildPathLut();
  const LUT_LAST = PATH_LUT_N - 1;

  // ── 中心线 / 参考系查询 ──
  const _c = new THREE.Vector3(), _t = new THREE.Vector3(), _u = new THREE.Vector3(), _r = new THREE.Vector3();
  const _pv = new THREE.Vector3();

  const lutIndex = (depth) => clamp((depth / CANAL_LENGTH) * LUT_LAST, 0, LUT_LAST);

  function CenterAt(depth) {
    const f = lutIndex(depth);
    const i = Math.min(LUT_LAST - 1, Math.floor(f));
    const t = f - i;
    return new THREE.Vector3(
      lerp(path.pos[i * 3], path.pos[(i + 1) * 3], t),
      lerp(path.pos[i * 3 + 1], path.pos[(i + 1) * 3 + 1], t),
      lerp(path.pos[i * 3 + 2], path.pos[(i + 1) * 3 + 2], t)
    );
  }

  function TangentAt(depth) {
    const f = lutIndex(depth);
    const i = Math.min(LUT_LAST - 1, Math.floor(f));
    const t = f - i;
    return new THREE.Vector3(
      lerp(path.tan[i * 3], path.tan[(i + 1) * 3], t),
      lerp(path.tan[i * 3 + 1], path.tan[(i + 1) * 3 + 1], t),
      lerp(path.tan[i * 3 + 2], path.tan[(i + 1) * 3 + 2], t)
    ).normalize();
  }

  /** 把截面参考系写进 out（避免每帧分配对象）。 */
  function frameInto(depth, out) {
    const f = lutIndex(depth);
    const i = Math.min(LUT_LAST - 1, Math.floor(f));
    const t = f - i;
    out.tangent.set(
      lerp(path.tan[i * 3], path.tan[(i + 1) * 3], t),
      lerp(path.tan[i * 3 + 1], path.tan[(i + 1) * 3 + 1], t),
      lerp(path.tan[i * 3 + 2], path.tan[(i + 1) * 3 + 2], t)
    ).normalize();
    out.up.set(
      lerp(path.frm[i * 6], path.frm[(i + 1) * 6], t),
      lerp(path.frm[i * 6 + 1], path.frm[(i + 1) * 6 + 1], t),
      lerp(path.frm[i * 6 + 2], path.frm[(i + 1) * 6 + 2], t)
    ).normalize();
    out.right.set(
      lerp(path.frm[i * 6 + 3], path.frm[(i + 1) * 6 + 3], t),
      lerp(path.frm[i * 6 + 4], path.frm[(i + 1) * 6 + 4], t),
      lerp(path.frm[i * 6 + 5], path.frm[(i + 1) * 6 + 5], t)
    ).normalize();
    // 重正交，消掉插值带来的微小误差
    out.right.addScaledVector(out.tangent, -out.right.dot(out.tangent)).normalize();
    out.up.copy(out.tangent).cross(out.right).normalize().negate();
    out.center.copy(CenterAt(depth));
    return out;
  }

  const frameScratch = () => ({
    center: new THREE.Vector3(), tangent: new THREE.Vector3(),
    up: new THREE.Vector3(), right: new THREE.Vector3(),
  });

  function FrameAt(depth) {
    return frameInto(clamp(depth, 0, CANAL_LENGTH), frameScratch());
  }

  function RadiusAt(depth, angle) {
    return radiusRaw(clamp(depth, 0, CANAL_LENGTH), angle);
  }

  function PointAt(depth, angle, inflate = 0) {
    const d = clamp(depth, 0, CANAL_LENGTH);
    const fr = frameInto(d, { center: _c, tangent: _t, up: _u, right: _r });
    const r = radiusRaw(d, angle) + inflate;
    const cu = Math.cos(angle) * r, sr = Math.sin(angle) * r;
    return new THREE.Vector3(
      fr.center.x + fr.up.x * cu + fr.right.x * sr,
      fr.center.y + fr.up.y * cu + fr.right.y * sr,
      fr.center.z + fr.up.z * cu + fr.right.z * sr
    );
  }

  /** 由管壁指向管腔中心的方向（单位向量）。 */
  function NormalAt(depth, angle) {
    const fr = frameInto(clamp(depth, 0, CANAL_LENGTH), { center: _c, tangent: _t, up: _u, right: _r });
    const ca = Math.cos(angle), sa = Math.sin(angle);
    return new THREE.Vector3(
      -(fr.up.x * ca + fr.right.x * sa),
      -(fr.up.y * ca + fr.right.y * sa),
      -(fr.up.z * ca + fr.right.z * sa)
    ).normalize();
  }

  function segDist2(px, py, pz, f) {
    const i = clamp(Math.floor(f), 0, LUT_LAST - 1);
    const t = clamp(f - i, 0, 1);
    const ax = path.pos[i * 3], ay = path.pos[i * 3 + 1], az = path.pos[i * 3 + 2];
    const ex = path.pos[(i + 1) * 3] - ax, ey = path.pos[(i + 1) * 3 + 1] - ay, ez = path.pos[(i + 1) * 3 + 2] - az;
    const dx = px - (ax + ex * t), dy = py - (ay + ey * t), dz = pz - (az + ez * t);
    return dx * dx + dy * dy + dz * dz;
  }

  /**
   * 最近中心线投影 —— 交互的命门：工具尖端每一帧都要靠它换算成 (depth, angle)。
   * 先在 LUT 上粗扫找最近段，再在邻域里三分细化（LUT 是分片线性的，收敛很快），
   * 最后在该深度的截面上算角度与径向距离。
   * hint = 上一帧的 depth 时只做局部搜索，60fps 下能省一半以上开销（签名向后兼容）。
   */
  function Project(worldPoint, hint) {
    const px = worldPoint.x, py = worldPoint.y, pz = worldPoint.z;
    let best = 0, bestD2 = Infinity;
    if (typeof hint === "number" && hint >= 0) {
      const hf = lutIndex(hint);
      const lo = Math.max(0, Math.floor(hf) - 48), hi = Math.min(LUT_LAST, Math.floor(hf) + 48);
      for (let i = lo; i <= hi; i++) {
        const dx = px - path.pos[i * 3], dy = py - path.pos[i * 3 + 1], dz = pz - path.pos[i * 3 + 2];
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 < bestD2) { bestD2 = d2; best = i; }
      }
    }
    if (bestD2 === Infinity) {
      const stride = Math.max(1, Math.floor(LUT_LAST / 128));
      for (let i = 0; i <= LUT_LAST; i += stride) {
        const dx = px - path.pos[i * 3], dy = py - path.pos[i * 3 + 1], dz = pz - path.pos[i * 3 + 2];
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 < bestD2) { bestD2 = d2; best = i; }
      }
    }
    let lo = Math.max(0, best - 2), hi = Math.min(LUT_LAST, best + 2);
    for (let it = 0; it < 26 && hi - lo > 1e-4; it++) {
      const m1 = lo + (hi - lo) / 3, m2 = hi - (hi - lo) / 3;
      if (segDist2(px, py, pz, m1) < segDist2(px, py, pz, m2)) hi = m2; else lo = m1;
    }
    const f = (lo + hi) * 0.5;
    const depth = clamp((f / LUT_LAST) * CANAL_LENGTH, 0, CANAL_LENGTH);
    const fr = frameInto(depth, { center: _c, tangent: _t, up: _u, right: _r });
    _pv.set(px - fr.center.x, py - fr.center.y, pz - fr.center.z);
    const eu = _pv.dot(fr.up), er = _pv.dot(fr.right);
    let angle = Math.atan2(er, eu);
    if (angle < 0) angle += Math.PI * 2;
    const radialDist = Math.hypot(eu, er);
    const wallRadius = radiusRaw(depth, angle);
    return { depth, angle, radialDist, inside: radialDist <= wallRadius, wallRadius, center: fr.center.clone() };
  }

  function ZoneAt(depth) {
    const d = clamp(depth, 0, CANAL_LENGTH);
    for (const z of CANAL_ZONES) if (d >= z.from && d < z.to) return z.id;
    return "drum";
  }

  // ─────────────────── 耳道管壁网格 ───────────────────
  // 沿中心线扫掠椭圆环，每一圈的顶点直接由 radiusRaw + frameInto 生成。
  // 只做内表面（我们从管腔里往外看），法线朝管腔中心，材质用 BackSide。

  function buildCanalMesh(cfg) {
    const rings = cfg.ringN, segs = cfg.segN;
    const vCount = (rings + 1) * (segs + 1);
    const posArr = new Float32Array(vCount * 3);
    const nrmArr = new Float32Array(vCount * 3);
    const colArr = new Float32Array(vCount * 3);
    const uvArr = new Float32Array(vCount * 2);
    const cWall = new THREE.Color(PALETTE.canalWall);
    const cDeep = new THREE.Color(PALETTE.canalDeep);
    const cDrum = new THREE.Color(PALETTE.drumMembrane);
    const tmpC = new THREE.Color();

    let k = 0;
    for (let i = 0; i <= rings; i++) {
      const depth = (i / rings) * CANAL_LENGTH;
      // 越深越暖越深；靠近鼓膜处泛灰粉，一眼能看出「到尽头了」
      tmpC.copy(cWall).lerp(cDeep, smooth01(clamp((depth - 6) / 17, 0, 1)));
      tmpC.lerp(cDrum, smooth01((depth - 21) / 4.5) * 0.75);
      // 若隐若现的皮下血管感：低频噪声轻微偏红，绝不能像发炎
      const vasc = (fbm2(depth * 0.8, 3.1, 41, 1) - 0.5) * 0.10;
      tmpC.r = clamp(tmpC.r * (1 + vasc), 0, 1);
      tmpC.g = clamp(tmpC.g * (1 - Math.abs(vasc) * 0.35), 0, 1);
      const fr = frameInto(depth, { center: _c, tangent: _t, up: _u, right: _r });
      for (let j = 0; j <= segs; j++) {
        const angle = (j / segs) * Math.PI * 2;
        const r = radiusRaw(depth, angle);
        const cu = Math.cos(angle) * r, sr = Math.sin(angle) * r;
        posArr[k * 3] = fr.center.x + fr.up.x * cu + fr.right.x * sr;
        posArr[k * 3 + 1] = fr.center.y + fr.up.y * cu + fr.right.y * sr;
        posArr[k * 3 + 2] = fr.center.z + fr.up.z * cu + fr.right.z * sr;
        const ca = Math.cos(angle), sa = Math.sin(angle);
        nrmArr[k * 3] = -(fr.up.x * ca + fr.right.x * sa);
        nrmArr[k * 3 + 1] = -(fr.up.y * ca + fr.right.y * sa);
        nrmArr[k * 3 + 2] = -(fr.up.z * ca + fr.right.z * sa);
        colArr[k * 3] = tmpC.r; colArr[k * 3 + 1] = tmpC.g; colArr[k * 3 + 2] = tmpC.b;
        uvArr[k * 2] = j / segs;
        uvArr[k * 2 + 1] = depth / CANAL_LENGTH;
        k++;
      }
    }
    const idx = [];
    for (let i = 0; i < rings; i++) {
      for (let j = 0; j < segs; j++) {
        const a = i * (segs + 1) + j, b = a + segs + 1;
        idx.push(a, b, a + 1, a + 1, b, b + 1);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(posArr, 3));
    g.setAttribute("normal", new THREE.BufferAttribute(nrmArr, 3));
    g.setAttribute("color", new THREE.BufferAttribute(colArr, 3));
    g.setAttribute("uv", new THREE.BufferAttribute(uvArr, 2));
    g.setIndex(idx);
    g.computeBoundingSphere();
    return g;
  }

  const canalPick = pickMaterial(materials, "skinInner", PALETTE.canalWall, {
    roughness: 0.62, metalness: 0, side: THREE.BackSide, vertexColors: true,
  });
  if (canalPick.owned) ownedMaterials.push(canalPick.mat);
  const canalGeo = own(buildCanalMesh(q));
  const canalMesh = new THREE.Mesh(canalGeo, canalPick.mat);
  canalMesh.name = "CanalWall";
  group.add(canalMesh);

  // ─────────────────── 鼓膜 ───────────────────
  // 要一眼认出「这是鼓膜，别碰」：珍珠灰粉半透明、鼓膜脐的浅漏斗、
  // 前下象限的光锥（cone of light）、后上象限锤骨短突的淡影、周边纤维环。

  function buildDrum() {
    const segs = q.drumSeg, rMax = DRUM_DIAMETER / 2; // 4.5mm
    const fr = frameInto(DRUM_DEPTH, frameScratch());
    const center = fr.center.clone(), up = fr.up.clone(), right = fr.right.clone(), tangent = fr.tangent.clone();
    // 光锥方向：前下象限。right 是「后」，所以前 = -right；下 = -up。
    const coneDir = right.clone().multiplyScalar(-0.62).addScaledVector(up, -0.78).normalize();
    const vCount = 1 + (segs + 1) * 2;
    const posArr = new Float32Array(vCount * 3);
    const colArr = new Float32Array(vCount * 3);
    const cDrum = new THREE.Color(PALETTE.drumMembrane);
    const cCone = new THREE.Color(PALETTE.drumCone);
    const cUmbo = new THREE.Color(PALETTE.canalDeep);
    const tmp = new THREE.Color();
    let k = 0;

    const write = (rad, ang) => {
      const cu = Math.cos(ang), sr = Math.sin(ang);
      const t = rad / rMax;
      const dish = -1.15 * (1 - t * t); // 紧张部呈浅漏斗，中心（脐）最凹
      posArr[k * 3] = center.x + up.x * cu * rad + right.x * sr * rad + tangent.x * dish;
      posArr[k * 3 + 1] = center.y + up.y * cu * rad + right.y * sr * rad + tangent.y * dish;
      posArr[k * 3 + 2] = center.z + up.z * cu * rad + right.z * sr * rad + tangent.z * dish;
      const dirDot = cu * coneDir.dot(up) + sr * coneDir.dot(right);
      const lit = smooth01((dirDot - 0.12) / 0.55) * (0.35 + 0.65 * (1 - Math.min(1, Math.abs(t - 0.55) / 0.55)));
      tmp.copy(cDrum).lerp(cCone, clamp(lit, 0, 1) * 0.95);
      // 锤骨短突：光锥对侧（后上象限）一条从中心向外约 60% 的淡影
      const mall = gauss(dirDot + 0.55, 0.30) * smooth01((t - 0.05) / 0.35) * smooth01((0.62 - t) / 0.30);
      tmp.lerp(cUmbo, mall * 0.5);
      // 周边纤维环稍深，鼓膜才有明确边界
      tmp.lerp(cUmbo, smooth01((t - 0.82) / 0.18) * 0.35);
      colArr[k * 3] = tmp.r; colArr[k * 3 + 1] = tmp.g; colArr[k * 3 + 2] = tmp.b;
      k++;
    };
    write(0, 0);
    for (let j = 0; j <= segs; j++) write(rMax * 0.5, (j / segs) * Math.PI * 2);
    for (let j = 0; j <= segs; j++) write(rMax, (j / segs) * Math.PI * 2);

    const idx = [];
    for (let j = 0; j < segs; j++) {
      idx.push(0, 1 + j + 1, 1 + j);
      const a = 1 + j, b = 1 + j + 1, c = 1 + segs + 1 + j, d = 1 + segs + 1 + j + 1;
      idx.push(a, c, b, b, c, d);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(posArr, 3));
    g.setAttribute("color", new THREE.BufferAttribute(colArr, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    // 法线朝管腔内侧（我们从耳道口方向看过去）
    const nrm = g.getAttribute("normal");
    for (let i = 0; i < nrm.count; i++) {
      if (nrm.getX(i) * tangent.x + nrm.getY(i) * tangent.y + nrm.getZ(i) * tangent.z > 0) {
        nrm.setXYZ(i, -nrm.getX(i), -nrm.getY(i), -nrm.getZ(i));
      }
    }
    nrm.needsUpdate = true;
    g.computeBoundingSphere();
    return { g, center, tangent, up, right, coneDir };
  }

  const drumInfo = buildDrum();
  const drumPick = pickMaterial(materials, "drum", PALETTE.drumMembrane, {
    roughness: 0.28, metalness: 0, vertexColors: true, transparent: true, opacity: 0.97, side: THREE.DoubleSide,
  });
  if (drumPick.owned) {
    // 珍珠般的柔光，近似半透明薄膜的通透感（不做真 SSS，手机扛不住）
    drumPick.mat.emissive = new THREE.Color(PALETTE.drumCone).multiplyScalar(0.09);
    ownedMaterials.push(drumPick.mat);
  }
  const drumMesh = new THREE.Mesh(own(drumInfo.g), drumPick.mat);
  drumMesh.name = "TympanicMembrane";
  drumMesh.renderOrder = 2;
  group.add(drumMesh);

  // ─────────────────── 耳廓网格 ───────────────────
  // 闭合壳：外表面（高度场）+ 内表面（压一个厚度）+ 外缘与中心缝合。

  function buildPinna() {
    const NA = q.pinnaA, NS = q.pinnaS;
    const ringVerts = NS + 1;
    const faceBase = ringVerts * (NA + 1);
    const totalVerts = faceBase * 2;
    const posArr = new Float32Array(totalVerts * 3);
    const colArr = new Float32Array(totalVerts * 3);
    const uvArr = new Float32Array(totalVerts * 2);
    const cSkin = new THREE.Color(PALETTE.skin);
    const cDeep = new THREE.Color(PALETTE.skinDeep);
    const cShadow = new THREE.Color(PALETTE.skinShadow);
    const cSheen = new THREE.Color(PALETTE.skinSheen);
    const cBlush = new THREE.Color(PALETTE.blush);
    const tmp = new THREE.Color();
    const pp = { u: 0, v: 0 };

    let k = 0;
    for (let face = 0; face < 2; face++) {
      const back = face === 1;
      for (let si = 0; si <= NS; si++) {
        const s = si / NS;
        for (let ai = 0; ai <= NA; ai++) {
          const a01 = (ai % NA) / NA; // 角向闭合：末列复用首列参数，位置严格一致
          pinnaPlanePoint(a01, s, pp);
          let h = pinnaHeight(a01, s);
          // 耳道口收口：把最中心一小圈压向耳道口平面，跟管子平滑接上
          const pinch = smooth01((0.16 - s) / 0.16) * 0.92;
          h = lerp(h, Math.min(h, 0.35), pinch);
          const th = pinnaThickness(a01, s);
          const zz = back ? PINNA_PLANE_Z + h - th : PINNA_PLANE_Z + h;
          posArr[k * 3] = pp.u; posArr[k * 3 + 1] = pp.v; posArr[k * 3 + 2] = zz;
          // 颜色：耳轮受光、耳甲腔偏深、耳垂带血色
          const a = a01 * Math.PI * 2;
          const rr = s * rimRadius(a01);
          tmp.copy(cSkin).lerp(cDeep, clamp((h + 2.0) / 6.0, 0, 1) * 0.55);
          tmp.lerp(cShadow, gauss(rr - 3.0, 3.2) * 0.28);
          tmp.lerp(cSheen, smooth01((h - 1.5) / 2.5) * 0.7);
          tmp.lerp(cBlush, gauss(a01 - 0.015, 0.07) * 0.30);
          void a;
          if (back) tmp.multiplyScalar(0.88);
          colArr[k * 3] = tmp.r; colArr[k * 3 + 1] = tmp.g; colArr[k * 3 + 2] = tmp.b;
          uvArr[k * 2] = s;
          uvArr[k * 2 + 1] = a01;
          k++;
        }
      }
    }

    const idx = [];
    const vid = (face, si, ai) => face * faceBase + si * (NA + 1) + ai;
    for (let si = 0; si < NS; si++) {
      for (let ai = 0; ai < NA; ai++) {
        const a = vid(0, si, ai), b = vid(0, si + 1, ai), c = vid(0, si, ai + 1), d = vid(0, si + 1, ai + 1);
        idx.push(a, b, c, c, b, d);
      }
    }
    for (let si = 0; si < NS; si++) {
      for (let ai = 0; ai < NA; ai++) {
        const a = vid(1, si, ai), b = vid(1, si + 1, ai), c = vid(1, si, ai + 1), d = vid(1, si + 1, ai + 1);
        idx.push(a, c, b, c, d, b);
      }
    }
    for (let ai = 0; ai < NA; ai++) { // 外缘一圈缝成薄边
      const a = vid(0, NS, ai), b = vid(0, NS, ai + 1), c = vid(1, NS, ai), d = vid(1, NS, ai + 1);
      idx.push(a, c, b, b, c, d);
    }
    for (let ai = 0; ai < NA; ai++) { // 中心封口
      const a = vid(0, 0, ai), b = vid(0, 0, ai + 1), c = vid(1, 0, ai), d = vid(1, 0, ai + 1);
      idx.push(a, b, c, b, d, c);
    }

    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(posArr, 3));
    g.setAttribute("color", new THREE.BufferAttribute(colArr, 3));
    g.setAttribute("uv", new THREE.BufferAttribute(uvArr, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    const nrm = g.getAttribute("normal");
    for (let i = faceBase; i < totalVerts; i++) nrm.setXYZ(i, -nrm.getX(i), -nrm.getY(i), -nrm.getZ(i));
    nrm.needsUpdate = true;
    g.computeBoundingSphere();
    return g;
  }

  const pinnaPick = pickMaterial(materials, "skin", PALETTE.skin, {
    roughness: 0.72, metalness: 0, vertexColors: true, side: THREE.FrontSide,
  });
  if (pinnaPick.owned) ownedMaterials.push(pinnaPick.mat);
  const pinnaGeo = own(buildPinna());
  const pinnaMesh = new THREE.Mesh(pinnaGeo, pinnaPick.mat);
  pinnaMesh.name = "Pinna";
  group.add(pinnaMesh);

  // ─────────────────── 耳毛 / 绒毛（InstancedMesh） ───────────────────
  // 契约明令：不给每根毛一个 Mesh。一份毛的几何 + 若干实例 + 每帧重写实例矩阵做摆动。
  // 耳毛集中在软骨部（耵聍腺所在），角度随机但由种子决定 —— 同一场耳必须可复现。

  function makeHairClusters(cfg) {
    const list = [];
    if (cfg.hairs <= 0) return list;
    const clusters = Math.max(4, Math.round(cfg.hairs / 6));
    for (let c = 0; c < clusters; c++) {
      const cd = lerp(1.6, 8.4, rng());
      const ca = rng() * Math.PI * 2;
      const n = 2 + Math.floor(rng() * 3);
      for (let i = 0; i < n; i++) {
        list.push({
          kind: "canal",
          depth: clamp(cd + (rng() - 0.5) * 1.8, 0.8, 9.0),
          angle: ca + (rng() - 0.5) * 0.55,
          len: lerp(0.5, 1.1, rng()),
          rad: lerp(0.02, 0.035, rng()),
          wander: (rng() - 0.5) * 0.7,
          phase: rng() * Math.PI * 2,
        });
      }
    }
    const vellus = Math.round(clusters * 0.9); // 耳廓外缘的细软绒毛，负责「可爱」
    for (let i = 0; i < vellus; i++) {
      list.push({
        kind: "vellus",
        a01: rng(),
        s: lerp(0.86, 0.99, rng()),
        len: lerp(0.9, 1.7, rng()),
        rad: 0.035,
        phase: rng() * Math.PI * 2,
      });
    }
    return list;
  }

  /** 一根毛 = 沿一条微弯的线扫掠的 3 面管，尖端收细。实例矩阵只做缩放定位。 */
  function makeHairGeometry() {
    const segs = 5, hp = [], hi = [];
    for (let i = 0; i <= segs; i++) {
      const t = i / segs;
      const r = Math.pow(1 - t, 0.65) * 0.999 + 0.02;
      const bend = Math.sin(t * Math.PI * 0.5) * 0.18;
      for (let j = 0; j < 3; j++) {
        const a = (j / 3) * Math.PI * 2;
        hp.push(Math.cos(a) * r, bend, Math.sin(a) * r);
      }
    }
    for (let i = 0; i < segs; i++) {
      for (let j = 0; j < 3; j++) {
        const a = i * 3 + j, b = i * 3 + ((j + 1) % 3);
        const c = (i + 1) * 3 + j, d = (i + 1) * 3 + ((j + 1) % 3);
        hi.push(a, c, b, b, c, d);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(hp, 3));
    g.setIndex(hi);
    g.computeVertexNormals();
    return g;
  }

  let hairMesh = null;
  function buildHairs(cfg) {
    if (hairMesh) {
      group.remove(hairMesh);
      hairMesh.geometry.dispose();
      hairMesh.dispose();
      hairMesh = null;
    }
    const list = makeHairClusters(cfg);
    if (list.length === 0) return;
    const hg = own(makeHairGeometry());
    const pick = pickMaterial(materials, "horsehair", PALETTE.horsehair, { roughness: 0.78, metalness: 0 });
    if (pick.owned) ownedMaterials.push(pick.mat);
    const im = new THREE.InstancedMesh(hg, pick.mat, list.length);
    im.name = "CanalHairs";
    im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    im.frustumCulled = false;

    const attach = [];
    const m4 = new THREE.Matrix4(), quat = new THREE.Quaternion(), sc = new THREE.Vector3();
    const fr = frameScratch();
    for (let i = 0; i < list.length; i++) {
      const h = list[i];
      let origin, dir;
      if (h.kind === "vellus") {
        const pp = { u: 0, v: 0 };
        pinnaPlanePoint(h.a01, h.s, pp);
        origin = new THREE.Vector3(pp.u, pp.v, PINNA_PLANE_Z + pinnaHeight(h.a01, h.s) - 0.15);
        dir = new THREE.Vector3(0.4 * Math.sin(h.a01 * 6.283), 0.4 * Math.cos(h.a01 * 6.283), 1).normalize();
      } else {
        frameInto(h.depth, fr);
        const radial = new THREE.Vector3(
          fr.up.x * Math.cos(h.angle) + fr.right.x * Math.sin(h.angle),
          fr.up.y * Math.cos(h.angle) + fr.right.y * Math.sin(h.angle),
          fr.up.z * Math.cos(h.angle) + fr.right.z * Math.sin(h.angle)
        ).normalize();
        origin = fr.center.clone().addScaledVector(radial, radiusRaw(h.depth, h.angle) - 0.06);
        // 耳毛顺着管壁往耳道深处倒（真实耳毛就是这么长的）
        dir = fr.tangent.clone().multiplyScalar(0.78)
          .addScaledVector(radial, -0.42)
          .addScaledVector(fr.up, h.wander * 0.28)
          .normalize();
      }
      const refUp = Math.abs(dir.y) < 0.95 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
      const rv = new THREE.Vector3().crossVectors(dir, refUp).normalize();
      const uv2 = new THREE.Vector3().crossVectors(rv, dir).normalize();
      quat.setFromRotationMatrix(new THREE.Matrix4().makeBasis(rv, uv2, dir));
      sc.set(h.rad, h.rad, h.len);
      m4.compose(origin, quat, sc);
      im.setMatrixAt(i, m4);
      attach.push({ origin, quat, base: sc.clone(), phase: h.phase });
    }
    im.instanceMatrix.needsUpdate = true;
    im.userData.attach = attach;
    hairMesh = im;
    group.add(im);
  }
  buildHairs(q);

  // ─────────────────── landmarks ───────────────────
  const pinnaPointAt = (a01, s, lift = 0) => {
    const pp = { u: 0, v: 0 };
    pinnaPlanePoint(a01, s, pp);
    return new THREE.Vector3(pp.u, pp.v, PINNA_PLANE_Z + pinnaHeight(a01, s) + lift);
  };
  const landmarks = {
    canalOpening: CenterAt(0),
    conchaCenter: pinnaPointAt(0.42, 0.55),
    concha: PointAt(1.0, Math.PI, 0),
    tragus: pinnaPointAt(0.34, 0.78),
    antitragus: pinnaPointAt(0.95, 0.80),
    intertragicNotch: pinnaPointAt(0.70, 0.92),
    lobule: pinnaPointAt(0.0, 0.95),
    helixTop: pinnaPointAt(0.5, 0.98),
    isthmus: CenterAt(10.5),
    drumCenter: drumInfo.center.clone(),
    drumNormal: drumInfo.tangent.clone(),
    drumConeDir: drumInfo.coneDir.clone(),
    entryFrame: FrameAt(0),
  };

  // ─────────────────── 对外 ───────────────────

  const canal = {
    length: CANAL_LENGTH,
    drumDepth: DRUM_DEPTH,
    CenterAt, TangentAt, FrameAt, RadiusAt, PointAt, NormalAt, Project, ZoneAt,
  };

  let triCount = 0;
  function recountTris() {
    triCount = 0;
    group.traverse((o) => {
      if (!o.isMesh) return;
      const g = o.geometry;
      if (!g) return;
      const n = g.index ? g.index.count / 3 : (g.getAttribute("position")?.count || 0) / 3;
      triCount += n * (o.isInstancedMesh ? o.count : 1);
    });
  }
  recountTris();

  function setQuality(next) {
    const cfg = QUALITY_TABLE[next] || QUALITY_TABLE.mid;
    q = cfg;
    // 真实换几何：耳道环数/段数、耳廓分辨率、鼓膜分段、耳毛数量全部重建。
    canalMesh.geometry = own(buildCanalMesh(cfg));
    pinnaMesh.geometry = own(buildPinna());
    const d2 = buildDrum();
    drumMesh.geometry = own(d2.g);
    landmarks.drumCenter = d2.center.clone();
    landmarks.drumNormal = d2.tangent.clone();
    landmarks.drumConeDir = d2.coneDir.clone();
    buildHairs(cfg);
    recountTris();
  }

  /** 程序化摆动：没有骨骼，靠每帧重写实例矩阵；只改朝向，代价可控。 */
  function Update(dt, ctx = {}) {
    if (!hairMesh) return;
    const attach = hairMesh.userData.attach;
    if (!attach) return;
    const t = (ctx.time ?? ((typeof performance !== "undefined" ? performance.now() : Date.now()) / 1000));
    const sway = (ctx.sway01 ?? 0) + (ctx.breath01 ?? 0) * 0.3;
    const e = new THREE.Euler(), q2 = new THREE.Quaternion(), m4 = new THREE.Matrix4();
    for (let i = 0; i < attach.length; i++) {
      const a = attach[i];
      const w = Math.sin(t * 0.9 + a.phase) * 0.06 * (0.4 + sway);
      e.set(w * 0.6, 0, w);
      q2.setFromEuler(e).multiply(a.quat);
      m4.compose(a.origin, q2, a.base);
      hairMesh.setMatrixAt(i, m4);
    }
    hairMesh.instanceMatrix.needsUpdate = true;
  }

  function dispose() {
    for (const g of ownedGeometries) g.dispose();
    for (const m of ownedMaterials) m.dispose();
    ownedGeometries.length = 0;
    ownedMaterials.length = 0;
    if (hairMesh) hairMesh.dispose();
    group.clear();
  }

  return {
    group,
    side: "right",
    canal,
    landmarks,
    setQuality,
    Update,
    dispose,
    /** 自测页统计用（契约未要求，附加信息） */
    stats: () => {
      let meshes = 0;
      group.traverse((o) => { if (o.isMesh) meshes++; });
      return { triangles: triCount, meshes, quality };
    },
  };
}

export default BuildEar;
