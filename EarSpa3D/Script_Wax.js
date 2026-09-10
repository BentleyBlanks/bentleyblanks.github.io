// 《采耳物语 · EarSpa3D》耵聍（耳屎）系统 —— 本项目的主角
//
// 为什么这个模块最费劲：整个游戏的「解压感」都在这里。所以它必须做到三件事：
// 1) 真实。四种耵聍（干性 / 湿性 / 硬结 / 碎屑）在真实人群里的分布、位置、硬度、
//    手感都不一样：东亚人多是干性片状、一刮就成小饼干屑；湿性黏稠、挑起来会拉丝；
//    硬结必须先软化否则挖不动还会痛；碎屑靠鹅毛棒/吸引器收尾。
// 2) 可复现。分布全由传入的种子 RNG 决定（不直接用 Math.random），同一场耳每次
//    跑出来一模一样，便于回归比对。
// 3) 一点一点被掏掉。removed01 从 0 到 1 的过程中，几何是真的在变薄、在缩边、
//    在被「咬掉一块」，而不是「啪」地整个消失。
//
// 几何的关键选择：不用球体拼，而是在 (depth, angle) 参数域里做 heightfield，
// 再借 canal.PointAt 映射到耳道内壁上。这样耵聍天然贴合管壁曲面、随管腔粗细自动
// 伸缩，而且 Probe() 的椭球判定域和视觉形状用的是同一份数据 —— 不会「看着碰到
// 了却判定没碰到」。

import * as THREE from "three";
import { PALETTE } from "./Data_Palette.mjs";

// ─────────────────────────── 契约常量 ───────────────────────────

export const WAX_TYPES = ["dry", "wet", "impacted", "debris"];

/** 每种耵聍的性格。这些数字就是「手感参数」，直接决定 Probe 的输出。 */
export const WAX_PROFILE = {
  dry: {
    label: "干性耵聍",
    color: PALETTE.waxDry, deep: PALETTE.waxDryDeep,
    hardness: [0.50, 0.78],        // 硬而脆
    wetness: [0.05, 0.20],
    thickness: [0.35, 0.95],       // 片状：薄
    sizeRange: [2.2, 5.0],
    softNeed: 0.06,                // 干性本来就脆，稍微润一点就掉
    crumbMul: 1.25,                // 一刮就崩碎屑
    stretch: 0.0,
    opacity: 0.97, sheen: 0.25,
    realNote: "东亚人群常见，灰黄到奶黄，片状易碎，一刮就是小饼干屑",
  },
  wet: {
    label: "湿性耵聍",
    color: PALETTE.waxWet, deep: PALETTE.waxWetDeep,
    hardness: [0.22, 0.42],
    wetness: [0.75, 0.98],
    thickness: [0.8, 2.3],
    sizeRange: [3.0, 7.0],
    softNeed: 0.0,
    crumbMul: 0.35,
    stretch: 1.0,                  // 会拉丝 —— 最解压的那一下
    opacity: 0.80, sheen: 1.0,
    realNote: "非洲与欧洲人群常见，琥珀色半透明，黏稠、挑起来拉丝",
  },
  impacted: {
    label: "硬结耵聍",
    color: PALETTE.waxImpacted, deep: "#6E4420",
    hardness: [0.92, 1.0],
    wetness: [0.25, 0.55],
    thickness: [2.2, 4.6],
    sizeRange: [5.0, 9.5],
    softNeed: 0.55,                // 不软化就挖不动，硬挖会痛
    crumbMul: 0.7,
    stretch: 0.35,
    opacity: 0.95, sheen: 0.55,
    realNote: "陈年耵聍被压成硬块，可形成栓塞堵住管腔，必须先滴耳液或音叉软化",
  },
  debris: {
    label: "碎屑灰尘",
    color: PALETTE.crumb, deep: "#C2A46B",
    hardness: [0.15, 0.35],
    wetness: [0.0, 0.15],
    thickness: [0.10, 0.30],
    sizeRange: [0.7, 1.8],
    softNeed: 0.0,
    crumbMul: 2.0,
    stretch: 0.0,
    opacity: 0.95, sheen: 0.05,
    realNote: "皮屑、灰尘、掉落的干性耵聍碎末，用鹅毛棒/马尾棒/吸引器清理",
  },
};

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const smooth01 = (t) => { const x = clamp(t, 0, 1); return x * x * (3 - 2 * x); };
const gauss = (x, s) => Math.exp(-(x * x) / (2 * s * s));

/** 与解剖模块同源的哈希噪声（自己留一份，避免模块间循环依赖）。 */
function hash2i(x, y) {
  let h = (x | 0) * 374761393 + (y | 0) * 668265263;
  h = (h ^ (h >>> 13)) >>> 0;
  h = Math.imul(h, 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function noise2(x, y, seed) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const ux = xf * xf * (3 - 2 * xf), uy = yf * yf * (3 - 2 * yf);
  return lerp(
    lerp(hash2i(xi + seed * 131, yi), hash2i(xi + 1 + seed * 131, yi), ux),
    lerp(hash2i(xi + seed * 131, yi + 1), hash2i(xi + 1 + seed * 131, yi + 1), ux),
    uy
  );
}
function fbm2(x, y, seed, oct = 3) {
  let s = 0, amp = 0.5, f = 1;
  for (let i = 0; i < oct; i++) { s += amp * noise2(x * f, y * f, seed + i * 13); f *= 2.07; amp *= 0.5; }
  return s;
}

/** Mulberry32：与解剖模块同一套，保证跨模块可复现。 */
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

// 分区权重：耵聍腺只长在外 1/3 软骨部，所以耵聍绝大部分在 0–9mm，
// 骨部只有少量被推过去的，危险区几乎为零 —— 这不是设计方便，是解剖事实。
function sampleDepthForType(type, rng) {
  const r = rng();
  if (type === "debris") {
    if (r < 0.55) return 0.8 + rng() * 7.0;       // 软骨部最多
    if (r < 0.87) return 8.0 + rng() * 12.0;      // 骨部一路变少
    return 20.0 + rng() * 4.0;                    // 危险区边缘偶有
  }
  if (type === "impacted") {
    if (r < 0.62) return 3.0 + rng() * 6.0;       // 栓塞多发生在软骨部与骨部交界附近
    if (r < 0.92) return 9.0 + rng() * 8.0;
    return 17.0 + rng() * 4.0;
  }
  if (r < 0.80) return 1.0 + rng() * 8.0;         // 软骨部（主产地）
  if (r < 0.96) return 9.0 + rng() * 10.0;        // 骨部（少量）
  return 19.0 + rng() * 4.0;
}

/** 角度分布：沿管壁一圈不均匀。有的聚成团，有的铺开，有的专贴峡部前后壁。 */
function sampleAngleForType(type, rng) {
  const r = rng();
  if (type === "impacted" && r < 0.4) {
    // 前后壁（θ≈π/2 后 / θ≈3π/2 前）更容易被压出栓塞
    return (rng() < 0.5 ? Math.PI / 2 : Math.PI * 1.5) + (rng() - 0.5) * 1.1;
  }
  return rng() * Math.PI * 2;
}

const QUALITY_WAX = {
  low: { resMax: 11, resMin: 5, countMul: 0.5, crumbs: 160, stretchSeg: 5, stretchRad: 6, tube: false },
  mid: { resMax: 16, resMin: 7, countMul: 0.75, crumbs: 320, stretchSeg: 7, stretchRad: 8, tube: true },
  high: { resMax: 22, resMin: 9, countMul: 1.0, crumbs: 480, stretchSeg: 11, stretchRad: 10, tube: true },
};

const CRUMB_MAT_KEY = { dry: "waxDry", wet: "waxWet", impacted: "waxImpacted", debris: "crumb" };

/**
 * 耵聍场。
 * @param {*} _THREE 契约要求的位置参数（实际用模块内 import 的 THREE）。
 * @param {{canal:object, rng?:Function, materials?:object, quality?:string, seed?:number}} opts
 */
export function MakeWaxField(_THREE, { canal, rng: rngIn, materials, quality = "mid", seed } = {}) {
  if (!canal || typeof canal.Project !== "function") {
    throw new Error("MakeWaxField: 必须传入 Script_EarAnatomy 的 canal（见 Data_Contract §5.3）");
  }
  const rng = typeof rngIn === "function" ? rngIn : MakeRng(seed ?? 20260910);
  let q = QUALITY_WAX[quality] || QUALITY_WAX.mid;

  const group = new THREE.Group();
  group.name = "WaxField";
  const ownedGeometries = [];
  const ownedMaterials = [];
  const own = (g) => { ownedGeometries.push(g); return g; };

  // ─────────────── 材质 ───────────────
  // 契约要求材质从 materials 参数取、颜色从 PALETTE 取，两者都做到：
  // 优先借 lead 的材质（他有程序化贴图，白借不借），借不到才用 PALETTE 兜底。
  // 借来的材质一律不动它的属性 —— 那是共享实例，改它会污染别人。
  const waxMats = {};
  for (const t of WAX_TYPES) {
    const prof = WAX_PROFILE[t];
    const given = materials && materials[CRUMB_MAT_KEY[t]];
    if (given && given.isMaterial) { waxMats[t] = given; continue; }
    const m = new THREE.MeshStandardMaterial({
      color: new THREE.Color(prof.color),
      roughness: t === "wet" ? 0.20 : t === "impacted" ? 0.34 : 0.50,
      metalness: 0.0,
      // 「糖霜 / 琥珀糖」的观感：半透明 + 一点自带柔光（近似逆光透亮，不做真 SSS）
      transparent: t === "wet" || t === "debris",
      opacity: prof.opacity,
      sheen: prof.sheen,
      sheenColor: new THREE.Color(PALETTE.waxGlow),
      emissive: new THREE.Color(prof.color).multiplyScalar(0.05 + prof.sheen * 0.05),
      vertexColors: true,   // 几何自带顶点色：顶部亮、贴壁处深，看起来更像一坨有厚度的东西
    });
    waxMats[t] = m;
    ownedMaterials.push(m);
  }

  // ─────────────── 初始分布 ───────────────
  const deposits = [];
  let depositSeq = 0;
  const initialMass = { total: 1 };

  /** 在 (depth, angle) 参数域里的形状参数 —— 几何与 Probe 判定共用这一份。 */
  function rollShape(type) {
    const prof = WAX_PROFILE[type];
    const size = lerp(prof.sizeRange[0], prof.sizeRange[1], Math.pow(rng(), 0.8));
    // spread：有的沿管壁铺开（扁长），有的聚成一小团（接近圆）
    const spread = rng() < 0.45 ? lerp(1.4, 3.0, rng()) : lerp(1.0, 1.5, rng());
    const thickness = lerp(prof.thickness[0], prof.thickness[1], rng());
    const hard01 = lerp(prof.hardness[0], prof.hardness[1], rng());
    return { size, spread, thickness, hard01 };
  }

  function makeDeposit(type, depth, angle) {
    const sh = rollShape(type);
    const prof = WAX_PROFILE[type];
    const d = {
      id: "wax_" + (depositSeq++),
      type,
      depth,
      angle,
      size: sh.size,             // 主延展（mm）
      spread: sh.spread,         // 角度方向的拉伸倍数
      thickness: sh.thickness,   // 最大厚度（mm）
      hardness: sh.hard01,
      wetness: lerp(prof.wetness[0], prof.wetness[1], rng()),
      removed01: 0,
      softnessLocal: 0,
      occlusion: 0,
      noiseSeed: Math.floor(rng() * 100000),
      biteCenter: rng() * Math.PI * 2,
      biteSeed: Math.floor(rng() * 10000),
      mesh: null,
      geom: null,
      _resU: 0, _resV: 0,
      _lastRemoved: -1,
      _indexDirty: true,
      _liveVerts: 0,
    };
    // 分辨率按「这块在管壁上的实际尺度」给：小碎屑不该占几千个三角形
    const res = q;
    const depthRes = clamp(Math.round(sh.size * 2.2), res.resMin, res.resMax);
    const angRes = clamp(Math.round(sh.size * sh.spread * 2.2), res.resMin, res.resMax);
    buildDepositGeometry(d, depthRes, angRes);
    return d;
  }

  /** heightfield：边缘自然收薄贴住管壁，厚度带噪声起伏，中间最厚。 */
  function depHeight(d, u, v) {
    const r = Math.min(1, Math.hypot(u, v));
    const rim = Math.pow(smooth01((1 - r) / 0.28), 0.85);
    const lumps = 0.55 + 0.75 * fbm2(u * 1.7 + 3.1, v * 1.7 + 7.7, d.noiseSeed, 3);
    return 0.06 + d.thickness * rim * lumps;
  }

  /**
   * 建一块耵聍的壳面几何。
   * 参数 (u, v) ∈ [-1,1]²：u 沿深度、v 沿角度。角向用「本地弧长」而不是「角度」，
   * 整块耵聍在管壁上才不会被半径变化拉成葫芦形。
   */
  function buildDepositGeometry(d, nu, nv) {
    const vCount = (nu + 1) * (nv + 1);
    const pos = new Float32Array(vCount * 3);
    const nrm = new Float32Array(vCount * 3);
    const col = new Float32Array(vCount * 3);
    const uvs = new Float32Array(vCount * 2);
    const weights = new Float32Array(vCount);  // 1 = 完好，0 = 已被掏掉
    const dirs = new Float32Array(vCount * 3); // 由管壁指向管腔的法向（位移与碎屑方向都用它）
    const prof = WAX_PROFILE[d.type];
    const cBase = new THREE.Color(prof.color);
    const cDeep = new THREE.Color(prof.deep);
    const cGlow = new THREE.Color(PALETTE.waxGlow);
    const tmp = new THREE.Color();

    let k = 0;
    for (let i = 0; i <= nu; i++) {
      const u = (i / nu) * 2 - 1;
      const depth = clamp(d.depth + u * d.size * 0.5, 0, canal.length);
      const rLocal = Math.max(1.0, canal.RadiusAt(depth, d.angle));
      for (let j = 0; j <= nv; j++) {
        const v = (j / nv) * 2 - 1;
        const angle = d.angle + (v * d.size * d.spread * 0.5) / rLocal;
        const h = depHeight(d, u, v);
        const p = canal.PointAt(depth, angle, h);
        const n = canal.NormalAt(depth, angle); // 由管壁指向管腔中心
        pos[k * 3] = p.x; pos[k * 3 + 1] = p.y; pos[k * 3 + 2] = p.z;
        nrm[k * 3] = -n.x; nrm[k * 3 + 1] = -n.y; nrm[k * 3 + 2] = -n.z; // 朝管腔
        dirs[k * 3] = n.x; dirs[k * 3 + 1] = n.y; dirs[k * 3 + 2] = n.z;
        // 顶点色：贴壁处深、顶部亮；湿性的顶部再叠一点「透亮」
        const hNorm = clamp(h / Math.max(0.001, d.thickness + 0.06), 0, 1);
        tmp.copy(cDeep).lerp(cBase, smooth01(hNorm * 1.3));
        tmp.lerp(cGlow, smooth01((hNorm - 0.55) / 0.45) * prof.sheen * 0.55);
        col[k * 3] = tmp.r; col[k * 3 + 1] = tmp.g; col[k * 3 + 2] = tmp.b;
        uvs[k * 2] = (u + 1) * 0.5;
        uvs[k * 2 + 1] = (v + 1) * 0.5;
        weights[k] = 1;
        k++;
      }
    }
    const idx = [];
    for (let i = 0; i < nu; i++) {
      for (let j = 0; j < nv; j++) {
        const a = i * (nv + 1) + j, b = a + nv + 1;
        idx.push(a, b, a + 1, a + 1, b, b + 1);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute("normal", new THREE.BufferAttribute(nrm, 3));
    g.setAttribute("color", new THREE.BufferAttribute(col, 3));
    g.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
    g.setIndex(idx);
    g.computeBoundingSphere();

    let mesh = d.mesh;
    if (!mesh) {
      mesh = new THREE.Mesh(g, waxMats[d.type]);
      mesh.name = d.id;
      mesh.renderOrder = 1;
      mesh.frustumCulled = false;
      group.add(mesh);
      d.mesh = mesh;
    } else {
      mesh.geometry.dispose();
      mesh.geometry = g;
      mesh.visible = true;
    }
    d.geom = g;
    d._w = weights;
    d._resU = nu; d._resV = nv;
    d._pos = pos; d._nrm = nrm; d._dirs = dirs;
    d._liveVerts = vCount;
    d._indexDirty = true;
    d._lastRemoved = -1;
    // 记录「未位移」的基点：渐进掏除时按 基点 + 法向*h*w 重算，避免累积误差
    d._bx = new Float32Array(vCount);
    d._by = new Float32Array(vCount);
    d._bz = new Float32Array(vCount);
    for (let i = 0; i < vCount; i++) {
      d._bx[i] = pos[i * 3]; d._by[i] = pos[i * 3 + 1]; d._bz[i] = pos[i * 3 + 2];
    }
    if (ownedGeometries.indexOf(g) < 0) ownedGeometries.push(g);
    return g;
  }

  function seedDeposits() {
    const plan = [];
    const nDry = Math.max(4, Math.round(9 * q.countMul));
    const nWet = Math.max(2, Math.round(4 * q.countMul));
    const nImp = Math.max(1, Math.round(2 * q.countMul));
    const nDeb = Math.max(5, Math.round(11 * q.countMul));
    for (let i = 0; i < nDry; i++) plan.push("dry");
    for (let i = 0; i < nWet; i++) plan.push("wet");
    for (let i = 0; i < nImp; i++) plan.push("impacted");
    for (let i = 0; i < nDeb; i++) plan.push("debris");
    // 洗牌，避免同类型扎堆在深度上（真实耵聍是混着长的）
    for (let i = plan.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      const t = plan[i]; plan[i] = plan[j]; plan[j] = t;
    }
    for (const type of plan) {
      // 同类之间做一点排斥，避免完全重叠
      let depth = 0, angle = 0, ok = false;
      for (let attempt = 0; attempt < 12 && !ok; attempt++) {
        depth = sampleDepthForType(type, rng);
        angle = sampleAngleForType(type, rng);
        ok = true;
        for (const o of deposits) {
          const dd = Math.abs(o.depth - depth);
          if (dd < (o.size + 3) * 0.35) {
            const da = Math.abs(((o.angle - angle + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
            if (da < 0.5) { ok = false; break; }
          }
        }
      }
      deposits.push(makeDeposit(type, depth, angle));
    }
    // 硬结耵聍的特殊形态：让第一块真的堵住一部分管腔（真实「耵聍栓塞」）
    for (const d of deposits) {
      if (d.type !== "impacted") continue;
      d.occlusion = clamp(0.35 + rng() * 0.5, 0, 0.9);
      d.thickness = Math.min(d.thickness * 1.5, 4.6);
      break;
    }
    // 干性耵聍里放几片「沿壁铺开」的：薄且扁长，视觉上一眼能跟团块区分
    let spreadCount = 0;
    for (const d of deposits) {
      if (d.type === "dry" && spreadCount < 3) {
        d.spread = lerp(2.4, 3.4, rng());
        d.thickness = Math.min(d.thickness, 0.5);
        spreadCount++;
      }
    }
    initialMass.total = Math.max(1e-6, totalMass());
  }

  /** 单块耵聍的「剩余质量」估算：厚度 × 面积 × 剩余比例。 */
  function depositMass(d) {
    const remaining = 1 - d.removed01;
    if (remaining <= 0) return 0;
    return d.thickness * d.size * d.size * d.spread * remaining;
  }
  function totalMass() {
    let s = 0;
    for (const d of deposits) s += depositMass(d);
    return s;
  }

  // ── 渐进掏除：真的改几何 ──
  /**
   * 把「已挖掉的量」写成顶点位移 + 参数域裁剪。
   * 缺口中心放在 biteCenter 方向，边缘按噪声变得参差不齐，越挖越深直到整块消失。
   * 每一步都可见 —— 这就是「一点点被掏掉」的来源。
   */
  function applyRemoval(d) {
    const W = d._w;
    if (!W) return;
    const rem = d.removed01;
    if (Math.abs(rem - d._lastRemoved) < 0.004 && rem < 0.999) return;
    const nu = d._resU, nv = d._resV;
    const pos = d._pos, dirs = d._dirs, bx = d._bx, by = d._by, bz = d._bz;
    const cx = Math.cos(d.biteCenter), cy = Math.sin(d.biteCenter);
    let live = 0, k = 0;
    for (let i = 0; i <= nu; i++) {
      const u = (i / nu) * 2 - 1;
      for (let j = 0; j <= nv; j++) {
        const v = (j / nv) * 2 - 1;
        const hFull = depHeight(d, u, v);
        // 「已挖到多远」：从 biteCenter 方向往里啃，边缘用噪声抖出动口
        const along = u * cx + v * cy;
        const jag = (fbm2(u * 2.6 + d.biteSeed, v * 2.6 - d.biteSeed, d.noiseSeed + 5, 2) - 0.5) * 0.55;
        const kill = smooth01((rem * 2.05 + jag - along + 1) / 0.5);
        const w = clamp(1 - kill, 0, 1);
        W[k] = w;
        if (w > 0.02) live++;
        const h = hFull * w;
        pos[k * 3] = bx[k] + dirs[k * 3] * h;
        pos[k * 3 + 1] = by[k] + dirs[k * 3 + 1] * h;
        pos[k * 3 + 2] = bz[k] + dirs[k * 3 + 2] * h;
        k++;
      }
    }
    d._liveVerts = live;
    d.geom.getAttribute("position").needsUpdate = true;
    d._lastRemoved = rem;
    d._indexDirty = true;
    rebuildIndex(d);
    if (rem >= 0.999) d.mesh.visible = false;
  }

  /** 按顶点权重重建索引：被掏空的部分真的不再画。 */
  function rebuildIndex(d) {
    if (!d._indexDirty) return;
    const nu = d._resU, nv = d._resV, W = d._w;
    const out = [];
    for (let i = 0; i < nu; i++) {
      for (let j = 0; j < nv; j++) {
        const a = i * (nv + 1) + j, b = a + nv + 1;
        if (W[a] > 0.02 || W[b] > 0.02 || W[a + 1] > 0.02 || W[b + 1] > 0.02) {
          out.push(a, b, a + 1, a + 1, b, b + 1);
        }
      }
    }
    d.geom.setIndex(out);
    d.geom.computeBoundingSphere();
    d._indexDirty = false;
  }

  seedDeposits();

  // ─────────────── 碎屑（InstancedMesh + 简单重力） ───────────────
  // 契约要求粒子走 InstancedMesh。碎屑要有下落物理：落到管壁下缘停住，
  // 然后能被吸引器吸走、被冲洗带走、被鹅毛棒扫出来。

  const crumbGeo = own(new THREE.IcosahedronGeometry(1, 0)); // 20 面
  const crumbMatGiven = materials && materials.crumb && materials.crumb.isMaterial;
  const crumbMat = crumbMatGiven
    ? materials.crumb
    : new THREE.MeshStandardMaterial({
      color: new THREE.Color(PALETTE.crumb), roughness: 0.62, metalness: 0,
      emissive: new THREE.Color(PALETTE.crumb).multiplyScalar(0.06),
    });
  if (!crumbMatGiven) ownedMaterials.push(crumbMat);

  const crumbMesh = new THREE.InstancedMesh(crumbGeo, crumbMat, q.crumbs);
  crumbMesh.name = "WaxCrumbs";
  crumbMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  // instanceColor 必须先建出来，否则 setColorAt 会抛错
  crumbMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(q.crumbs * 3), 3);
  crumbMesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
  crumbMesh.frustumCulled = false;
  crumbMesh.count = 0;
  group.add(crumbMesh);

  const crumbs = []; // { px..pz, vx..vz, size, type, spin, life, settled, sucking }
  const crumbColor = new THREE.Color();

  function spawnCrumb(type, pos, vel, size) {
    if (crumbs.length >= q.crumbs) crumbs.shift(); // 池满了回收最老的
    crumbs.push({
      type: WAX_TYPES.indexOf(type) >= 0 ? type : "dry",
      px: pos.x, py: pos.y, pz: pos.z,
      vx: vel.x, vy: vel.y, vz: vel.z,
      size,
      spin: rng() * Math.PI * 2,
      spinV: (rng() - 0.5) * 8,
      life: 0,
      settled: false,
      sucking: 0,
    });
  }

  const _v1 = new THREE.Vector3(), _q1 = new THREE.Quaternion(), _e1 = new THREE.Euler();
  const _m4 = new THREE.Matrix4(), _s1 = new THREE.Vector3();
  const GRAVITY_MM = 320; // 真实 9.8m/s² = 9800mm/s²，但那样碎屑会「瞬移」到壁上；手感优先

  function updateCrumbs(dt) {
    let w = 0;
    for (let i = 0; i < crumbs.length; i++) {
      const c = crumbs[i];
      c.life += dt;
      if (!c.settled) {
        c.vy -= GRAVITY_MM * dt;
        c.vx *= 1 - Math.min(0.9, 0.9 * dt);
        c.vz *= 1 - Math.min(0.9, 0.9 * dt);
        c.px += c.vx * dt; c.py += c.vy * dt; c.pz += c.vz * dt;
        c.spin += c.spinV * dt;
        // 落到管壁：投影回管腔，跑到壁外就压回去
        const pr = canal.Project(_v1.set(c.px, c.py, c.pz));
        const limit = Math.max(0.15, pr.wallRadius - c.size * 0.5);
        if (pr.radialDist >= limit) {
          const p = canal.PointAt(pr.depth, pr.angle, limit);
          c.px = p.x; c.py = p.y; c.pz = p.z;
          c.vx *= 0.25; c.vz *= 0.25;
          if (Math.abs(c.vy) < 26) { c.vy = 0; c.settled = true; }
          else c.vy = -c.vy * 0.28;
        }
        if (c.life > 25) c.settled = true;
      }
      if (c.sucking > 0) {
        const pr = canal.Project(_v1.set(c.px, c.py, c.pz));
        const t = canal.PointAt(pr.depth, pr.angle, 0.1);
        const k = clamp(c.sucking * 3.4 * dt, 0, 1);
        c.px = lerp(c.px, t.x, k); c.py = lerp(c.py, t.y, k); c.pz = lerp(c.pz, t.z, k);
        c.sucking -= dt * 0.6;
        if (c.sucking <= 0) c.settled = false;
      }
      if (w < q.crumbs) {
        _e1.set(c.spin, c.spin * 0.7, c.spin * 1.3);
        _q1.setFromEuler(_e1);
        _s1.set(c.size, c.size * 0.8, c.size);
        _m4.compose(_v1.set(c.px, c.py, c.pz), _q1, _s1);
        crumbMesh.setMatrixAt(w, _m4);
        crumbColor.set(WAX_PROFILE[c.type].color);
        crumbMesh.setColorAt(w, crumbColor);
        w++;
      }
    }
    crumbMesh.count = w;
    crumbMesh.instanceMatrix.needsUpdate = true;
    if (crumbMesh.instanceColor) crumbMesh.instanceColor.needsUpdate = true;
    return w;
  }

  // ─────────────── 拉丝（湿性耵聍的灵魂） ───────────────
  // 一根从管壁附着点连到工具尖端的黏丝，中段收细、带一点重力下垂，断开瞬间给事件。

  let stretchMesh = null;
  if (q.tube) {
    const segs = q.stretchSeg, rad = q.stretchRad;
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array((segs + 1) * (rad + 1) * 3), 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute("normal", new THREE.BufferAttribute(new Float32Array((segs + 1) * (rad + 1) * 3), 3).setUsage(THREE.DynamicDrawUsage));
    const idx = [];
    for (let i = 0; i < segs; i++) {
      for (let j = 0; j < rad; j++) {
        const a = i * (rad + 1) + j, b = a + rad + 1;
        idx.push(a, b, a + 1, a + 1, b, b + 1);
      }
    }
    g.setIndex(idx);
    g.computeBoundingSphere();
    own(g);
    const given = materials && materials.waxWet && materials.waxWet.isMaterial;
    const mat = given ? materials.waxWet : new THREE.MeshStandardMaterial({
      color: new THREE.Color(PALETTE.waxWet), roughness: 0.14, metalness: 0,
      transparent: true, opacity: 0.88,
      emissive: new THREE.Color(PALETTE.waxGlow).multiplyScalar(0.10),
    });
    if (!given) ownedMaterials.push(mat);
    stretchMesh = new THREE.Mesh(g, mat);
    stretchMesh.name = "WaxStretch";
    stretchMesh.visible = false;
    stretchMesh.frustumCulled = false;
    stretchMesh.renderOrder = 4;
    group.add(stretchMesh);
    stretchMesh.userData.segs = segs;
    stretchMesh.userData.rad = rad;
  }

  const stretch = {
    active: false, depositId: null, t: 0, maxLen: 9,
    attach: new THREE.Vector3(), tip: new THREE.Vector3(),
  };

  /** 重建这段黏丝：两端插值 + 中段收细（12%）+ 侧向下垂，看起来才像被拉扯的糖丝。 */
  function updateStretchGeometry(a, b, taper) {
    const segs = stretchMesh.userData.segs, rad = stretchMesh.userData.rad;
    const pos = stretchMesh.geometry.getAttribute("position");
    const nrm = stretchMesh.geometry.getAttribute("normal");
    const dir = new THREE.Vector3().subVectors(b, a);
    const len = Math.max(1e-4, dir.length());
    dir.divideScalar(len);
    const ref = Math.abs(dir.y) < 0.95 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
    const u1 = new THREE.Vector3().crossVectors(dir, ref).normalize();
    const u2 = new THREE.Vector3().crossVectors(u1, dir).normalize();
    const sag = Math.min(1.2, len * 0.10);
    let k = 0;
    for (let i = 0; i <= segs; i++) {
      const t = i / segs;
      // 半径：根部粗、中段最细、尖端又稍粗（尖端还黏着一小坨）
      const r = lerp(0.72, 1.0, Math.pow(1 - t, 0.8)) * (0.30 + 0.70 * smooth01((t + 0.06) / 0.22)) * taper * 0.55;
      const cx = a.x + dir.x * len * t - u1.x * sag * Math.sin(Math.PI * t);
      const cy = a.y + dir.y * len * t - u1.y * sag * Math.sin(Math.PI * t);
      const cz = a.z + dir.z * len * t - u1.z * sag * Math.sin(Math.PI * t);
      for (let j = 0; j <= rad; j++) {
        const ang = (j / rad) * Math.PI * 2;
        const ca = Math.cos(ang) * r, sa = Math.sin(ang) * r;
        const nx = u1.x * ca + u2.x * sa, ny = u1.y * ca + u2.y * sa, nz = u1.z * ca + u2.z * sa;
        pos.setXYZ(k, cx + nx, cy + ny, cz + nz);
        nrm.setXYZ(k, nx, ny, nz);
        k++;
      }
    }
    pos.needsUpdate = true;
    nrm.needsUpdate = true;
  }

  function endStretch(broke) {
    if (!stretch.active) return;
    stretch.active = false;
    if (stretchMesh) stretchMesh.visible = false;
    if (broke) {
      spawnCrumb("wet", stretch.attach, new THREE.Vector3(0, -12, 0), 0.35);
      pushEvent("stretchBreak", { depositId: stretch.depositId, at: stretch.attach.clone() });
    }
  }

  // ─────────────── 事件与战利品 ───────────────

  const events = [];
  let now = 0;
  function pushEvent(name, data) {
    if (events.length > 128) events.shift();
    events.push({ name, data, t: now });
  }

  const harvest = [];
  function recordHarvest(d, amount) {
    const size = d.size * amount;
    if (size < 0.05) return;
    // 同一处、短时间内的多次刮取合并成一条，免得结算界面刷屏
    const last = harvest[harvest.length - 1];
    if (last && last._id === d.id && now - last._t < 3) {
      last.size += size; last._t = now;
      return;
    }
    harvest.push({ type: d.type, size, depth: d.depth, at: now, _id: d.id, _t: now });
  }

  // ─────────────── 状态：软化 / 湿润 / 共振 ───────────────

  const state = {
    softness01: 0,     // 0..1 全局软化度（滴耳液 / 音叉 / 湿润都会抬升）
    moisture01: 0,
    vibration01: 0,
    heat01: 0,
    irrigated: 0,
    vacuumed: 0,
    discomfort: 0,     // 硬挖累积的不适，lead 用来扣舒适分
    drumTouches: 0,
  };

  /** 当下硬度：受全局 softness01 与局部软化影响。「必须先软化」就实现这里。 */
  function hardnessNow(d) {
    const soft = clamp(state.softness01 + d.softnessLocal, 0, 1);
    // 硬结耵聍对软化最敏感（真实：滴耳液就是用来泡软栓塞的）
    const gain = d.type === "impacted" ? 1.25 : d.type === "wet" ? 0.55 : 0.85;
    return clamp(d.hardness * (1 - gain * soft * 0.92), 0.05, 1);
  }

  /** 已经掏净的比例（1 - 剩余质量/初始质量）。 */
  function Cleanliness() {
    return clamp(1 - totalMass() / (initialMass.total || 1), 0, 1);
  }

  // ─────────────── Probe：工具接触主入口 ───────────────

  const hints = new Map(); // 局部搜索用的深度提示（key: "__tip" / "__vib" / "__vac"）
  let outBuf = null;

  /**
   * 一帧的接触判定。手感规则（按采耳店真实手法来）：
   *  · 接触：canal.Project(tip) 落到某块的 (depth, angle) 椭球域内，tipRadius 参与放宽。
   *  · 角度：工具面与管壁切面的夹角越接近 spec.idealAngleDeg 刮下的量越大；偏了就只是蹭。
   *  · 速度：太慢刮不动；太快会把干性耵聍崩成碎屑（整块量反而少）——玩家要学的技巧。
   *  · 硬度：hardnessNow 受 softness01 影响；硬结没软化取不下，并且累积不适。
   *  · 拉丝：只在湿性耵聍上有，工具离开管壁后有一段「黏着—拉长—断开」。
   */
  function Probe({ tip, tipPrev, tool, dt, motion } = {}) {
    const out = outBuf || (outBuf = {});
    out.hit = false; out.depositId = null; out.spotDepth = 0; out.spotAngle = 0;
    out.removeNow = 0; out.crumbCount = 0; out.stretch01 = 0; out.hardnessNow = 0;
    out.finished = false; out.zone = null; out.danger = false; out.discomfort = 0;
    out.speed = 0; out.angleErrorDeg = 0; out.blocked = false;
    out.events = out.events || [];
    out.events.length = 0;
    if (!tip) return out;

    const spec = tool || {};
    const tipRadius = spec.tipRadius ?? spec.tipRadiusMm ?? 0.6;
    const idealAngle = (spec.idealAngleDeg ?? 35) * Math.PI / 180;
    const speedRange = spec.idealSpeedRange || [4, 40];
    const stepDt = (typeof dt === "number" && dt > 1e-6 && dt < 0.25) ? dt : 1 / 60;

    const pNow = canal.Project(tip, hints.get("__tip"));
    hints.set("__tip", pNow.depth);
    out.spotDepth = pNow.depth;
    out.spotAngle = pNow.angle;
    out.zone = canal.ZoneAt(pNow.depth);
    out.danger = out.zone === "danger" || out.zone === "drum";

    const dx = tipPrev ? tip.x - tipPrev.x : 0;
    const dy = tipPrev ? tip.y - tipPrev.y : 0;
    const dz = tipPrev ? tip.z - tipPrev.z : 0;
    const speed = clamp(Math.hypot(dx, dy, dz) / stepDt, 0, 4000);
    out.speed = speed;

    // 越界要报出来（lead 拿这个扣分）
    if (out.zone === "drum") {
      state.drumTouches++;
      pushEvent("touchDrum", { depth: pNow.depth });
      out.events.push({ name: "touchDrum", depth: pNow.depth });
    } else if (out.zone === "danger") {
      pushEvent("dangerZone", { depth: pNow.depth });
      out.events.push({ name: "dangerZone", depth: pNow.depth });
    }

    // ── 找最近的耵聍：算 (depth, angle) 椭球域里的归一化距离 ──
    let best = null, bestScore = Infinity;
    for (const d of deposits) {
      if (d.removed01 >= 0.999) continue;
      const dd = pNow.depth - d.depth;
      const halfD = d.size * 0.5 + tipRadius + 0.35;
      if (Math.abs(dd) > halfD * 1.6) continue;
      const rLocal = Math.max(1.0, canal.RadiusAt(pNow.depth, d.angle));
      const halfA = (d.size * d.spread * 0.5 + tipRadius) / rLocal + 0.08;
      let da = pNow.angle - d.angle;
      while (da > Math.PI) da -= Math.PI * 2;
      while (da < -Math.PI) da += Math.PI * 2;
      const score = (dd / halfD) * (dd / halfD) + (da / halfA) * (da / halfA);
      if (score < bestScore) { bestScore = score; best = d; }
    }
    if (best) {
      // 径向还要够靠近管壁才算「碰到耵聍」：耵聍是贴在壁上的
      const localH = best.thickness * (1 - best.removed01) + 0.10;
      const gap = pNow.wallRadius + localH + tipRadius - pNow.radialDist;
      if (gap < -0.55 || bestScore > 2.6) best = null;
    }
    if (!best) {
      if (stretch.active) endStretch(true);
      return out;
    }

    const d = best;
    out.hit = true;
    out.depositId = d.id;
    const hNow = hardnessNow(d);
    out.hardnessNow = hNow;

    // ── 角度：运动方向与「管壁切面」的夹角 ──
    const strike = (motion && motion.dir && motion.dir.lengthSq && motion.dir.lengthSq() > 1e-8)
      ? motion.dir.clone().normalize()
      : new THREE.Vector3(dx, dy, dz);
    if (strike.lengthSq() < 1e-10 && spec.axis) strike.copy(spec.axis);
    if (strike.lengthSq() < 1e-10) strike.set(0, 0, 1);
    strike.normalize();
    const surfN = canal.NormalAt(pNow.depth, pNow.angle); // 由管壁指向管腔中心
    // 与「管壁切面」的夹角：运动方向平行于壁 → 0；垂直于壁（往里压）→ ±90°
    const nAngle = Math.acos(clamp(Math.abs(strike.dot(surfN)), -1, 1)) - Math.PI / 2;
    const err = Math.abs(nAngle - idealAngle);
    out.angleErrorDeg = err * 180 / Math.PI;
    const angleScore = Math.pow(clamp(1 - err / (Math.PI / 3), 0, 1), 1.4);

    // ── 速度 ──
    const vmin = speedRange[0], vmax = speedRange[1];
    let speedScore;
    if (speed < vmin) speedScore = clamp(speed / Math.max(0.001, vmin), 0, 1);
    else if (speed > vmax) speedScore = clamp(1 - (speed - vmax) / (vmax * 1.6), 0.08, 1);
    else speedScore = 1;

    // ── 硬度：没软化到位的硬结取不下来 ──
    const prof = WAX_PROFILE[d.type];
    const softNow = clamp(state.softness01 + d.softnessLocal, 0, 1);
    const softDeficit = clamp(prof.softNeed - softNow, 0, 1);
    const hardScore = clamp(1 - softDeficit * 2.4, 0, 1) * clamp(1.15 - hNow * 0.55, 0.1, 1.15);

    // ── 本帧取下多少 ──
    // 角度只在「有运动」时才影响：工具静止轻触应该能沾下一点，而不是完全无效
    const moving = speed > vmin * 0.15;
    const angleFactor = moving ? (0.30 + 0.70 * angleScore) : 0.32;
    const effStrength = clamp((spec.comfortGain ?? 0.6) * 0.5 + 0.7, 0.5, 1.3) *
      (spec.mechanic === "pinch" ? 0.85 : 1.0);
    let removeNow = stepDt * (0.85 + 2.4 * speedScore) * angleFactor *
      (0.45 + 0.55 * hardScore) * effStrength / (1 + d.size * 0.35);
    removeNow = clamp(removeNow, 0, 0.35);

    // 太快 → 干性/硬结崩成碎屑，整块反而拿得少（真实的取舍，也是玩家要学的技巧）
    const crackRisk = clamp((spec.crackRisk ?? 0.4) * 0.6 + prof.crumbMul * 0.25, 0, 1);
    const overSpeed = clamp((speed - vmax) / Math.max(1, vmax), 0, 1);
    let crumbCount = 0;
    if (overSpeed > 0.01) {
      crumbCount = Math.min(8, Math.round(overSpeed * 5 * crackRisk * prof.crumbMul));
      removeNow *= clamp(1 - overSpeed * 0.75, 0.15, 1);
    }

    // 硬结没软化：挖不动 + 累积不适（真实会痛，这里只做「一点点委屈」的反馈）
    let discomfort = 0;
    if (softDeficit > 0.02) {
      removeNow *= clamp(1 - softDeficit * 3, 0, 1);
      discomfort = stepDt * softDeficit * 0.9;
      state.discomfort += discomfort;
      out.blocked = true;
      pushEvent("tooHard", { depositId: d.id, softness: softNow, depth: d.depth });
    }

    if (removeNow > 0.0005) {
      d.removed01 = clamp(d.removed01 + removeNow, 0, 1);
      applyRemoval(d);
      recordHarvest(d, removeNow);
    }

    // ── 碎屑生成 ──
    if (crumbCount > 0 || (removeNow > 0.004 && d.type === "debris")) {
      const n = crumbCount + (d.type === "debris" ? 1 : 0);
      const pos = canal.PointAt(pNow.depth, pNow.angle, 0);
      const nrm = canal.NormalAt(pNow.depth, pNow.angle);
      for (let i = 0; i < n; i++) {
        const sp = 6 + speed * 0.35;
        const vel = new THREE.Vector3(
          -nrm.x * sp * (0.4 + rng()),
          -nrm.y * sp * (0.4 + rng()) - 4,
          -nrm.z * sp * (0.4 + rng())
        );
        spawnCrumb(d.type, pos, vel, lerp(0.14, 0.34, rng()));
      }
      out.crumbCount = n;
    }

    // ── 拉丝（只在湿性耵聍上） ──
    const stretchable = prof.stretch > 0.05 && (d.type === "wet" || (d.type === "impacted" && hNow < 0.5));
    const nearWall = pNow.radialDist > pNow.wallRadius - 1.6;
    if (stretchable && (removeNow > 0.002 || stretch.active)) {
      if (!stretch.active) {
        stretch.active = true;
        stretch.depositId = d.id;
        stretch.t = 0;
        stretch.attach.copy(canal.PointAt(pNow.depth, pNow.angle, 0.05));
        pushEvent("stretchStart", { depositId: d.id });
      }
      stretch.t += stepDt;
      stretch.tip.copy(tip);
      const len = stretch.attach.distanceTo(tip);
      out.stretch01 = clamp(len / stretch.maxLen, 0, 1) * prof.stretch;
      if (stretchMesh) {
        stretchMesh.visible = true;
        updateStretchGeometry(stretch.attach, stretch.tip, clamp(1 - len / (stretch.maxLen * 1.15), 0.12, 1));
      }
      // 拉太长、或者工具已经离开管壁 → 断
      if (len > stretch.maxLen || (!nearWall && len > 2.4)) {
        out.events.push({ name: "stretchBreak", depositId: d.id, length: len });
        endStretch(true);
      }
    }

    out.removeNow = removeNow;
    out.finished = d.removed01 >= 0.999;
    out.discomfort = discomfort;
    if (moving && removeNow > 0.0005) out.events.push({ name: "scrape", depositId: d.id, amount: removeNow });
    if (out.finished) out.events.push({ name: "cleanedSpot", depositId: d.id, depth: d.depth });
    return out;
  }

  // ─────────────── 治疗类操作 ───────────────

  /** 滴耳液：抬升全局软化度并记一点湿润（湿润会慢慢回落，模拟蒸发/被吸收）。 */
  function Soften(amount01 = 0.1) {
    const amt = clamp(amount01, 0, 1);
    state.moisture01 = clamp(state.moisture01 + amt, 0, 1.6);
    state.softness01 = clamp(state.softness01 + amt * 0.55, 0, 1);
    return state.softness01;
  }

  /**
   * 音叉共振：让附近耵聍共振松脱（真实采耳里音叉就是用来震松顽固耵聍的）。
   * 贴得越近软化越快；已经在强振 + 耵聍本来就松，会自己震下碎屑。
   * @returns {number} 被影响到的耵聍数
   */
  function Vibration(center, radius = 6, dt = 0.016) {
    if (!center) return 0;
    const pr = canal.Project(center, hints.get("__vib"));
    hints.set("__vib", pr.depth);
    let affected = 0;
    const r2 = radius * radius;
    for (const d of deposits) {
      if (d.removed01 >= 0.999) continue;
      const dd = pr.depth - d.depth;
      const rLocal = Math.max(1.0, canal.RadiusAt(d.depth, d.angle));
      let da = pr.angle - d.angle;
      while (da > Math.PI) da -= Math.PI * 2;
      while (da < -Math.PI) da += Math.PI * 2;
      const angleArc = da * rLocal;
      const dist2 = dd * dd + angleArc * angleArc;
      if (dist2 > r2) continue;
      affected++;
      const falloff = 1 - Math.sqrt(dist2) / radius;
      d.softnessLocal = clamp(d.softnessLocal + dt * falloff * 0.85, 0, 1);
      if (state.vibration01 > 0.55) {
        const shed = dt * falloff * (d.type === "debris" ? 1.6 : 0.35) * clamp(1 - hardnessNow(d) + 0.3, 0, 1.4);
        if (shed > 0.004) {
          d.removed01 = clamp(d.removed01 + shed * 0.35, 0, 1);
          applyRemoval(d);
          const p = canal.PointAt(d.depth, d.angle, 0.1);
          spawnCrumb(d.type, p, new THREE.Vector3(0, -8, 0), lerp(0.14, 0.30, rng()));
        }
      }
    }
    return affected;
  }

  /**
   * 冲洗：水流把碎屑和松软的耵聍带走（真实最有效的就是冲碎屑）。
   * @param {{depth?:number, radius?:number, flow01?:number}} stream depth 缺省按半条耳道算
   */
  function Irrigate(stream = {}) {
    const flow = clamp(stream.flow01 ?? 0.7, 0, 1);
    const center = typeof stream.depth === "number" ? stream.depth : canal.length * 0.4;
    const radius = stream.radius ?? canal.length;
    let washed = 0, moved = 0;
    for (const c of crumbs) {
      const pr = canal.Project(_v1.set(c.px, c.py, c.pz));
      if (Math.abs(pr.depth - center) > radius) continue;
      c.settled = false;
      c.vx += (rng() - 0.5) * 20 * flow;
      c.vy += 14 * flow;
      c.vz += (rng() - 0.5) * 20 * flow;
      moved++;
    }
    for (const d of deposits) {
      if (d.removed01 >= 0.999) continue;
      if (Math.abs(d.depth - center) > radius) continue;
      const looseness = clamp(1 - hardnessNow(d), 0, 1);
      const take = 0.06 * flow * looseness * (d.type === "debris" ? 2.4 : 1) * (1 - d.removed01);
      if (take <= 0.0005) continue;
      d.removed01 = clamp(d.removed01 + take, 0, 1);
      applyRemoval(d);
      recordHarvest(d, take);
      washed += take;
      if (d.removed01 >= 0.999) pushEvent("washedOut", { depositId: d.id });
    }
    state.irrigated += washed;
    return { washed, crumbsMoved: moved };
  }

  /**
   * 吸引器：把碎屑吸走，也轻轻拽走已经松动的耵聍。
   * @returns {{sucked:number, crumbs:number, deposits:number}}
   */
  function Vacuum(center, radius = 8, dt = 0.016) {
    const res = { sucked: 0, crumbs: 0, deposits: 0 };
    if (!center) return res;
    const stepDt = (typeof dt === "number" && dt > 1e-6 && dt < 0.25) ? dt : 1 / 60;
    const pr = canal.Project(center, hints.get("__vac"));
    hints.set("__vac", pr.depth);
    for (let i = crumbs.length - 1; i >= 0; i--) {
      const c = crumbs[i];
      const pc = canal.Project(_v1.set(c.px, c.py, c.pz));
      const dd = pc.depth - pr.depth;
      let da = pc.angle - pr.angle;
      while (da > Math.PI) da -= Math.PI * 2;
      while (da < -Math.PI) da += Math.PI * 2;
      const dist = Math.hypot(dd, da * Math.max(1, canal.RadiusAt(pc.depth, pc.angle)));
      if (dist > radius) continue;
      const pull = 1 - dist / radius;
      c.sucking = clamp(pull * 1.6, 0, 1);
      if (pull > 0.45) { crumbs.splice(i, 1); res.crumbs++; }
    }
    for (const d of deposits) {
      if (d.removed01 >= 0.999) continue;
      if (Math.abs(d.depth - pr.depth) > radius) continue;
      const loose = clamp((1 - hardnessNow(d)) * (0.4 + d.removed01), 0, 1);
      const take = stepDt * loose * 0.22 * (d.type === "debris" ? 2.2 : 0.7);
      if (take <= 0.0005) continue;
      d.removed01 = clamp(d.removed01 + take, 0, 1);
      applyRemoval(d);
      recordHarvest(d, take);
      res.deposits += take;
    }
    state.vacuumed += res.crumbs;
    res.sucked = res.crumbs + res.deposits * 10;
    return res;
  }

  /** 本次取出的战利品清单（给结算界面）。返回副本。 */
  function Harvest() {
    return harvest.map((h) => ({ type: h.type, size: h.size, depth: h.depth, at: h.at }));
  }

  // ─────────────── 每帧更新 ───────────────

  function Update(dt, ctx = {}) {
    const stepDt = (typeof dt === "number" && dt > 1e-6 && dt < 0.25) ? dt : 1 / 60;
    now += stepDt;
    state.moisture01 = clamp((typeof ctx.moisture === "number" ? ctx.moisture : state.moisture01) * Math.pow(0.985, stepDt * 60), 0, 1.6);
    state.vibration01 = clamp(ctx.vibration01 ?? 0, 0, 1);
    state.heat01 = clamp(ctx.heat01 ?? 0, 0, 1);

    // 湿润 / 共振 / 温热 → 软化。变软快、变硬慢（真实：泡软了就回不太去）
    const target = clamp(state.moisture01 * 0.8 + state.vibration01 * 0.12 + state.heat01 * 0.15, 0, 1);
    const rate = target > state.softness01 ? 1.6 : 0.10;
    state.softness01 = clamp(state.softness01 + (target - state.softness01) * clamp(rate * stepDt, 0, 1), 0, 1);
    for (const d of deposits) d.softnessLocal = Math.max(0, d.softnessLocal - stepDt * 0.035);

    // 音叉余振：共振会让贴得不牢的碎屑自己掉
    if (state.vibration01 > 0.7 && ctx.vibrationCenter) {
      Vibration(ctx.vibrationCenter, ctx.vibrationRadius ?? 8, stepDt);
    }
    // 没有工具接触时，拉丝自己会断
    if (stretch.active) {
      stretch.t += stepDt;
      if (stretch.t > 0.6) endStretch(true);
    }
    updateCrumbs(stepDt);
  }

  function setQuality(next) {
    const cfg = QUALITY_WAX[next] || QUALITY_WAX.mid;
    if (cfg === q) return;
    q = cfg;
    // 真实换细节：重算每块耵聍的参数域分辨率，三角形数随之变化
    for (const d of deposits) {
      const depthRes = clamp(Math.round(d.size * 2.2), q.resMin, q.resMax);
      const angRes = clamp(Math.round(d.size * d.spread * 2.2), q.resMin, q.resMax);
      buildDepositGeometry(d, depthRes, angRes);
      applyRemoval(d);
    }
  }

  function dispose() {
    for (const g of ownedGeometries) g.dispose();
    for (const m of ownedMaterials) m.dispose();
    ownedGeometries.length = 0;
    ownedMaterials.length = 0;
    crumbMesh.dispose();
    group.clear();
    crumbs.length = 0;
    harvest.length = 0;
    events.length = 0;
  }

  function stats() {
    const byType = { dry: 0, wet: 0, impacted: 0, debris: 0 };
    let tris = 0, liveN = 0;
    for (const d of deposits) {
      if (d.removed01 >= 0.999 || !d.mesh || !d.mesh.visible) continue;
      liveN++;
      byType[d.type]++;
      const idx = d.geom && d.geom.index;
      tris += (idx ? idx.count : 0) / 3;
    }
    tris += crumbMesh.count * (crumbGeo.index ? crumbGeo.index.count / 3 : crumbGeo.getAttribute("position").count / 3);
    return {
      depositsTotal: deposits.length,
      depositsLive: liveN,
      byType,
      crumbCount: crumbs.length,
      triangles: Math.round(tris),
      cleanliness: Cleanliness(),
      softness01: state.softness01,
      discomfort01: clamp(state.discomfort, 0, 1),
    };
  }

  return {
    group,
    deposits,
    get softness01() { return state.softness01; },
    set softness01(v) { state.softness01 = clamp(v, 0, 1); },
    Update, Probe, Vibration, Soften, Irrigate, Vacuum, Cleanliness, Harvest,
    setQuality, dispose, stats,
    // 附加（契约未列，供 lead 判分 / 音频使用）
    moisture01: () => state.moisture01,
    discomfort01: () => clamp(state.discomfort, 0, 1),
    drumTouches: () => state.drumTouches,
    drainEvents: () => events.splice(0, events.length),
  };
}

export default MakeWaxField;
