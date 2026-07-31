// 《地道战 · 钟声》—— 渲染层。
//
// 职责：把 state 画出来。只读 state，绝不写 state。
// 相机是正交的，看向 -Z，参数全部来自 state.camera（Rules 负责算跟随）。
//
// 场景图分层严格按 Data_Contract.LAYER_Z：
//   FAR(-26) 天幕 / 月 / 远山   —— 伪视差，随相机部分平移
//   BACK(-14) 远处村舍剪影      —— 伪视差
//   MID(-6)  中景房舍 / 地道背墙
//   PLAY(0)  玩家 / NPC / 敌人 / 可互动道具 / 地板 / 危害
//   FORE(+5) 前景遮挡物（柴垛、树干、土坡），近黑剪影，做真实遮挡
//
// 地下剖面是本作最重要的视觉命题：把"地道占用"栅格化 → marching squares 提取
// 轮廓 → Chaikin 平滑 + 确定性扰动 → THREE.Shape + holes → ExtrudeGeometry（带
// bevel，正交视角下 bevel 是唯一能读出"土层厚度"的东西）。土层按 y 分带上顶点
// 色，越靠里越暗，做出沉积层与假 AO。
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
const _vecA = new THREE.Vector3();
const _vecB = new THREE.Vector3();

/** 相机放在 FORE 之前，保证所有分层的 fogDepth 都是正的。 */
const CAMERA_Z = 40;
/** 地下剖面正面（朝观众那一面）所在的 z。 */
const EARTH_FRONT_Z = 2.25;
/** 地道背墙 z。 */
const EARTH_BACK_Z = -6.6;

const QUALITY_PRESET = {
  low: {
    texSize: 64, cyl: 6, lathe: 8, ico: 0, bevelSeg: 1, extrudeDepth: 5.0,
    gridCell: 0.42, chaikin: 1, gasLayers: 2, particles: 90, warmLights: 2,
    shadows: false, foreDensity: 0.45, hazePlanes: false, starCount: 60,
    maxPixelRatio: 1.0, antialias: false, smoothTunnel: 0.55,
  },
  medium: {
    texSize: 128, cyl: 8, lathe: 12, ico: 0, bevelSeg: 2, extrudeDepth: 6.5,
    gridCell: 0.32, chaikin: 2, gasLayers: 3, particles: 180, warmLights: 3,
    shadows: false, foreDensity: 0.8, hazePlanes: true, starCount: 130,
    maxPixelRatio: 1.5, antialias: true, smoothTunnel: 0.75,
  },
  high: {
    texSize: 256, cyl: 12, lathe: 16, ico: 1, bevelSeg: 3, extrudeDepth: 7.5,
    gridCell: 0.26, chaikin: 2, gasLayers: 5, particles: 320, warmLights: 5,
    shadows: true, foreDensity: 1.0, hazePlanes: true, starCount: 220,
    maxPixelRatio: 2.0, antialias: true, smoothTunnel: 0.85,
  },
};

/** 敌人状态 → 视锥颜色。 */
const CONE_COLOR = {
  patrol: 0xdfe6f0,
  idle: 0xdfe6f0,
  probe: 0xffd27a,
  suspicious: 0xffd050,
  search: 0xff9130,
  spotted: 0xff3a2c,
};

/** 道具默认 z（关卡没给 z 时用）。可互动的一律拉到 PLAY。 */
const PROP_DEFAULT_Z = {
  house: -2.2, wall: -1.2, fence: -0.8, tree: -1.4, sign: -0.3,
  corpse: -0.4, trough: -0.5, cart: -0.4, kang: -1.6, stove: -1.4,
};

/** 敌人 kind → Actor rig kind。 */
const ENEMY_RIG = { search: 'soldier', guard: 'soldier', dog: 'dog', officer: 'officer' };
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
  // 圆环（可互动提示用的极淡边光）
  ring(c, s) {
    const g = c.getContext('2d');
    const grd = g.createRadialGradient(s / 2, s / 2, s * 0.30, s / 2, s / 2, s * 0.5);
    grd.addColorStop(0.0, 'rgba(255,255,255,0)');
    grd.addColorStop(0.55, 'rgba(255,255,255,0.9)');
    grd.addColorStop(1.0, 'rgba(255,255,255,0)');
    g.fillStyle = grd; g.fillRect(0, 0, s, s);
  },
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

  function GroundY(x) {
    if (flatGround) return defaultGround;
    let best = -Infinity;
    for (let i = 0; i < surf.length; i++) {
      const f = surf[i];
      if (x >= f.x0 - 0.25 && x <= f.x1 + 0.25 && f.y > best) best = f.y;
    }
    if (best === -Infinity) return defaultGround - 2.0;   // 没地板 = 沟 / 缺口
    return best;
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
    p = Roughen(p, isHole ? 0.115 : 0.055, isHole ? 0.55 : 0.28, isHole ? 11.3 : 3.1);
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
    const k = sp * ao;
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

const RIG_HEIGHT = { laozhong: 1.70, chuanbao: 1.72, villager: 1.66, child: 1.18, elder: 1.58, soldier: 1.70, officer: 1.72, dog: 0.72 };

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

  /** 冀中土坯房：厚土墙 + 硬山顶（山墙齐着屋面，不出檐）。 */
  house(ctx, p, rng) {
    const d = p.data || {};
    const w = Number(d.w) || (5.2 + rng() * 2.4);
    const h = Number(d.h) || 2.9;
    const dep = Number(d.d) || 4.6;
    const ridge = h + Math.max(0.9, w * 0.17);
    // 台明（石基）
    ctx.E('stone', GBox(w + 0.5, 0.28, dep + 0.5, 0, 0.14, 0));
    // 土坯墙
    ctx.E('mud', GBox(w, h, dep, 0, 0.28 + h / 2, 0));
    // 硬山：两端山墙升到脊，屋面夹在中间
    const gable = [-w / 2, 0, w / 2, 0, 0, ridge - h];
    ctx.E('mud', GPrism(gable, 0.34, 0, 0.28 + h, dep / 2 - 0.17));
    ctx.E('mud', GPrism(gable, 0.34, 0, 0.28 + h, -dep / 2 + 0.17));
    // 屋面（两坡），比山墙略窄，才是硬山
    const slope = Math.atan2(ridge - h, w / 2);
    const rl = Math.hypot(w / 2, ridge - h);
    ctx.E('tile', GBox(rl, 0.16, dep - 0.34, -w / 4, 0.28 + (h + ridge) / 2, 0, slope));
    ctx.E('tile', GBox(rl, 0.16, dep - 0.34, w / 4, 0.28 + (h + ridge) / 2, 0, -slope));
    // 脊
    ctx.E('tile', GBox(0.3, 0.2, dep - 0.3, 0, 0.28 + ridge + 0.04, 0));
    // 门（凹进去的暗口）
    const doorW = 1.0, doorH = 1.85;
    ctx.E('woodDark', GBox(doorW, doorH, 0.16, -w * 0.16, 0.28 + doorH / 2, dep / 2 + 0.01));
    ctx.E('wood', GBox(doorW + 0.22, 0.16, 0.2, -w * 0.16, 0.28 + doorH + 0.06, dep / 2 + 0.02));
    ctx.E('wood', GBox(0.12, doorH, 0.2, -w * 0.16 - doorW / 2 - 0.06, 0.28 + doorH / 2, dep / 2 + 0.02));
    ctx.E('wood', GBox(0.12, doorH, 0.2, -w * 0.16 + doorW / 2 + 0.06, 0.28 + doorH / 2, dep / 2 + 0.02));
    // 窗（棂 + 窗纸）
    const wx = w * 0.24, wy = 0.28 + h * 0.62, ww = 1.15, wh = 0.9;
    ctx.E('paper', GQuad(ww, wh, wx, wy, dep / 2 + 0.03));
    ctx.E('wood', GBox(ww + 0.16, 0.1, 0.1, wx, wy + wh / 2 + 0.05, dep / 2 + 0.05));
    ctx.E('wood', GBox(ww + 0.16, 0.1, 0.1, wx, wy - wh / 2 - 0.05, dep / 2 + 0.05));
    for (let i = 0; i < 4; i++) ctx.E('wood', GBox(0.05, wh, 0.08, wx - ww / 2 + ww * (i / 3), wy, dep / 2 + 0.05));
    for (let i = 0; i < 3; i++) ctx.E('wood', GBox(ww, 0.05, 0.08, wx, wy - wh / 2 + wh * (i / 2), dep / 2 + 0.05));
    if (d.lit !== false) ctx.Glow(wx, wy, dep / 2 + 0.35, 2.2, 0xffb066, 0.42, 0.9);
    // 墙根泥剥落
    for (let i = 0; i < 4; i++) {
      const bx = -w / 2 + w * rng();
      ctx.E('mudDark', GBox(0.4 + rng() * 0.5, 0.3 + rng() * 0.35, 0.08, bx, 0.28 + rng() * 0.5, dep / 2 + 0.02));
    }
  },

  /** 土院墙：顶上不平，压一层瓦。 */
  wall(ctx, p, rng) {
    const d = p.data || {};
    const w = Number(d.w) || 4.5;
    const h = Number(d.h) || 1.9;
    ctx.E('mud', GBox(w, h, 0.55, 0, h / 2, 0));
    ctx.E('tile', GBox(w + 0.16, 0.14, 0.72, 0, h + 0.07, 0));
    const n = Math.max(2, Math.floor(w / 1.4));
    for (let i = 0; i < n; i++) {
      const bx = -w / 2 + w * ((i + 0.5) / n) + (rng() - 0.5) * 0.3;
      ctx.E('mudDark', GBox(0.5 + rng() * 0.5, 0.28 + rng() * 0.3, 0.06, bx, h * (0.15 + rng() * 0.55), 0.29));
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

  /** 碾盘：碾台 + 立着的碾磙 + 木框推杆。 */
  millstone(ctx, p) {
    const seg = ctx.cyl;
    ctx.E('stone', GCylY(1.55, 1.62, 0.34, Math.max(10, seg + 4), 0, 0.17, 0));
    ctx.E('stone', GCylY(1.42, 1.5, 0.1, Math.max(10, seg + 4), 0, 0.38, 0));
    ctx.E('stone', GCylZ(0.52, 0.52, 0.95, Math.max(10, seg + 4), 0.35, 0.86, 0));  // 碾磙
    ctx.E('wood', GBox(0.1, 0.1, 1.25, 0.35, 1.46, 0));
    ctx.E('wood', GBox(1.9, 0.1, 0.1, -0.55, 1.46, 0.6));
    ctx.E('wood', GBox(1.9, 0.1, 0.1, -0.55, 1.46, -0.6));
    ctx.E('wood', GBox(0.1, 0.62, 0.1, -1.5, 1.16, 0));
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

  /** 驴槽。 */
  trough(ctx, p) {
    const w = 1.9;
    ctx.E('wood', GBox(w, 0.1, 0.7, 0, 0.62, 0));
    ctx.E('wood', GBox(w, 0.38, 0.08, 0, 0.8, 0.31));
    ctx.E('wood', GBox(w, 0.38, 0.08, 0, 0.8, -0.31));
    ctx.E('wood', GBox(0.08, 0.38, 0.7, -w / 2, 0.8, 0));
    ctx.E('wood', GBox(0.08, 0.38, 0.7, w / 2, 0.8, 0));
    ctx.E('woodDark', GBox(0.13, 0.6, 0.13, -w / 2 + 0.2, 0.3, 0.24));
    ctx.E('woodDark', GBox(0.13, 0.6, 0.13, w / 2 - 0.2, 0.3, -0.24));
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

  /** 篱笆。 */
  fence(ctx, p, rng) {
    const w = Number((p.data || {}).w) || 4.0;
    const n = Math.max(2, Math.round(w / 1.1));
    for (let i = 0; i <= n; i++) {
      const x = -w / 2 + w * (i / n);
      ctx.E('woodDark', GBox(0.1, 1.25 + rng() * 0.2, 0.1, x, 0.62, 0, (rng() - 0.5) * 0.08));
    }
    ctx.E('woodDark', GBox(w, 0.07, 0.07, 0, 1.05, 0));
    ctx.E('woodDark', GBox(w, 0.07, 0.07, 0, 0.6, 0));
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

  /** 支撑木：两立柱 + 顶梁 + 麻绳捆扎。 */
  prop_beam(ctx, p) {
    const w = Number((p.data || {}).w) || 1.55;
    const h = Number((p.data || {}).h) || 1.95;
    ctx.E('wood', GBox(0.2, h, 0.22, -w / 2, h / 2, 0));
    ctx.E('wood', GBox(0.2, h, 0.22, w / 2, h / 2, 0));
    ctx.E('wood', GBox(w + 0.5, 0.22, 0.26, 0, h + 0.11, 0));
    ctx.E('wood', GBox(0.36, 0.12, 0.24, -w / 2, h - 0.16, 0, 0.7));
    ctx.E('wood', GBox(0.36, 0.12, 0.24, w / 2, h - 0.16, 0, -0.7));
    ctx.E('cloth', GBox(0.24, 0.07, 0.26, -w / 2, h * 0.55, 0));
    ctx.E('cloth', GBox(0.24, 0.07, 0.26, w / 2, h * 0.55, 0));
    ctx.E('woodDark', GBox(w + 0.3, 0.08, 0.24, 0, h + 0.26, 0));
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

  /** 卡口：两侧土肩夹出一个窄口 + 木导槽（挡板另做，可被封住）。 */
  chokepoint(ctx, p) {
    const gap = Number((p.data || {}).gap) || 0.85;
    const h = Number((p.data || {}).h) || 1.9;
    ctx.E('mudDark', GPrism([-1.5, 0, -gap / 2, 0, -gap / 2, h, -1.5, h], 1.6, 0, 0, 0));
    ctx.E('mudDark', GPrism([gap / 2, 0, 1.5, 0, 1.5, h, gap / 2, h], 1.6, 0, 0, 0));
    ctx.E('wood', GBox(0.14, h, 0.3, -gap / 2 - 0.07, h / 2, 0.7));
    ctx.E('wood', GBox(0.14, h, 0.3, gap / 2 + 0.07, h / 2, 0.7));
    ctx.E('wood', GBox(gap + 0.5, 0.14, 0.3, 0, h - 0.07, 0.7));
    // 备好的沙袋 / 土坯，一眼看出"可以被堵上"
    for (let i = 0; i < 3; i++) {
      ctx.E('cloth', GIco(1, 0, -gap / 2 - 0.55 + i * 0.12, 0.14 + i * 0.24, 0.55, 0.34, 0.14, 0.24));
    }
  },

  /** 通气孔：一段竖直土筒 + 铁栅 + 漏下来的光柱。 */
  vent(ctx, p) {
    const h = Number((p.data || {}).h) || 2.6;
    ctx.E('mudDark', GBox(0.16, h, 0.9, -0.36, h / 2, 0));
    ctx.E('mudDark', GBox(0.16, h, 0.9, 0.36, h / 2, 0));
    for (let i = 0; i < 3; i++) ctx.E('metal', GBox(0.6, 0.04, 0.04, 0, h - 0.1, -0.24 + i * 0.24));
    ctx.E('mud', GBox(1.0, 0.12, 1.0, 0, h + 0.06, 0));
    ctx.Shaft(0, h * 0.5 - 0.2, 1.1, 0.95, h + 0.3, 0xbcd2f2, 0.30);
  },

  /** 翻口：地道口的木盖。盖板单独做，能翻开。 */
  trapdoor(ctx, p) {
    ctx.E('wood', GBox(1.5, 0.12, 0.22, 0, 0.06, 0.55));
    ctx.E('wood', GBox(1.5, 0.12, 0.22, 0, 0.06, -0.55));
    ctx.E('wood', GBox(0.22, 0.12, 1.3, -0.64, 0.06, 0));
    ctx.E('wood', GBox(0.22, 0.12, 1.3, 0.64, 0.06, 0));
    ctx.E('mudDark', GQuad(1.25, 1.1, 0, 0.02, 0));
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
  const camera = new THREE.OrthographicCamera(-10, 10, 6, -6, CAMERA.near, CAMERA.far);
  camera.position.set(0, 0, CAMERA_Z);
  camera.lookAt(0, 0, 0);
  scene.add(camera);

  // ---- 分层 group ----
  const gFar = new THREE.Group(); gFar.position.z = LAYER_Z.FAR; scene.add(gFar);
  const gBack = new THREE.Group(); gBack.position.z = LAYER_Z.BACK; scene.add(gBack);
  const gMid = new THREE.Group(); scene.add(gMid);
  const gPlay = new THREE.Group(); scene.add(gPlay);
  const gFore = new THREE.Group(); gFore.position.z = 0; scene.add(gFore);
  const gFx = new THREE.Group(); scene.add(gFx);

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
    ring: 1.0, shaft: 1.0, sign: 1.0, sky: 1.0,
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
    earth: new THREE.MeshLambertMaterial({ color: 0xffffff, vertexColors: true, map: T('earth') || null }),
    earthBack: LambertMat(0x241a12, 'earth'),
    fore: new THREE.MeshBasicMaterial({ color: 0x05070d }),
    farSil: new THREE.MeshBasicMaterial({ color: 0x131c2c, fog: false }),
    backSil: new THREE.MeshBasicMaterial({ color: 0x182233 }),
    sky: new THREE.MeshBasicMaterial({ color: 0x1a2740, map: T('sky') || null, fog: false, depthWrite: false, transparent: true }),
    skyBase: new THREE.MeshBasicMaterial({ color: 0x0b1220, fog: false, depthWrite: false }),
    moon: new THREE.MeshBasicMaterial({ color: 0xdce8fb, fog: false, transparent: true, map: T('glow') || null, blending: THREE.AdditiveBlending, depthWrite: false }),
    star: new THREE.PointsMaterial({ color: 0xcfe0f6, size: 2.2, sizeAttenuation: false, transparent: true, opacity: 0.75, fog: false, depthWrite: false }),
    actor: LambertMat(0x22242c, null),
    glowAdd: new THREE.MeshBasicMaterial({ map: T('glow') || null, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }),
    haloAdd: new THREE.MeshBasicMaterial({ map: T('ring') || null, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }),
    shaftAdd: new THREE.MeshBasicMaterial({ map: T('shaft') || null, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }),
    gas: new THREE.MeshBasicMaterial({ map: T('noise') || null, color: 0x9aa36a, transparent: true, opacity: 0.3, depthWrite: false, fog: false }),
    water: new THREE.MeshPhongMaterial({ color: 0x1d3c4a, specular: 0x9fd8ee, shininess: 90, transparent: true, opacity: 0.72, depthWrite: false }),
    waterLine: new THREE.MeshBasicMaterial({ map: T('water') || null, color: 0x8fd6ef, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }),
    dust: new THREE.PointsMaterial({ map: T('glow') || null, vertexColors: true, transparent: true, size: 6, sizeAttenuation: false, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }),
    blob: new THREE.MeshBasicMaterial({ map: T('glow') || null, color: 0x000000, transparent: true, opacity: 0.45, depthWrite: false }),
    haze: new THREE.MeshBasicMaterial({ color: 0x1a2a40, transparent: true, opacity: 0.13, depthWrite: false, fog: false }),
  };
  mats.foliage.flatShading = true;

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
  const warmLights = [];
  for (let i = 0; i < QUALITY_PRESET.high.warmLights; i++) {
    const l = new THREE.PointLight(0xffb066, 0, 9, 1.4);
    l.visible = false;
    scene.add(l);
    warmLights.push(l);
  }

  function SetupShadow(light) {
    light.castShadow = true;
    light.shadow.mapSize.set(1024, 1024);
    const c = light.shadow.camera;
    c.left = -14; c.right = 14; c.top = 12; c.bottom = -12; c.near = 0.5; c.far = 60;
    light.shadow.bias = -0.0012;
    light.shadow.normalBias = 0.04;
    c.updateProjectionMatrix();
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
  let earthGroundRef = 0;
  let levelExitMark = null;

  // 粒子池
  let dustGeo = null, dustPoints = null;
  let dustPos = null, dustCol = null, dustVel = null, dustLife = null, dustMax = null;
  let dustCursor = 0, dustCapacity = 0;

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

    // 无条件清空：即使上一次 BuildLevel 中途炸了，也不许把残留几何留给下一关。
    gFar.clear(); gBack.clear(); gMid.clear(); gPlay.clear(); gFore.clear(); gFx.clear();
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

      const b = level.bounds || {};
      const bx0 = typeof b.x0 === 'number' ? b.x0 : 0;
      const bx1 = typeof b.x1 === 'number' ? b.x1 : 140;
      const byTop = typeof b.yTop === 'number' ? b.yTop : 6;
      const byBottom = typeof b.yBottom === 'number' ? b.yBottom : -12;

      // 每个阶段单独兜底：一个阶段炸了不许把整个场景带走。
      let outline = null;
      Phase('sky', function () { BuildSky(bx0, bx1, byTop, byBottom); });
      Phase('earth', function () { outline = BuildEarth(bx0, bx1, byTop, byBottom); });
      Phase('floors', BuildFloors);
      Phase('backdrop', function () { BuildBackdrop(bx0, bx1, outline); });
      Phase('props', BuildProps);
      Phase('foreground', function () { BuildForeground(bx0, bx1, outline); });
      Phase('actors', BuildActors);
      Phase('hazards', BuildHazards);
      Phase('exit', BuildExitMark);
      Phase('batches', BuildBatches);
      Phase('dust', BuildDust);
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
  function BuildSky(bx0, bx1, byTop, byBottom) {
    const w = (bx1 - bx0) + 400;
    const h = (byTop - byBottom) + 220;
    const cx = (bx0 + bx1) / 2;
    const base = new THREE.Mesh(TrackGeo(GQuad(w, h, 0, 0, 0)), mats.skyBase);
    base.position.set(cx, (byTop + byBottom) / 2 + 10, -8);
    base.renderOrder = -200; base.frustumCulled = false;
    gFar.add(base);
    const grad = new THREE.Mesh(TrackGeo(GQuad(w, h, 0, 0, 0)), mats.sky);
    grad.position.set(cx, (byTop + byBottom) / 2 + 10, -7.5);
    grad.renderOrder = -199; grad.frustumCulled = false;
    gFar.add(grad);

    // 月
    const moonMesh = new THREE.Mesh(TrackGeo(GQuad(9, 9, 0, 0, 0)), mats.moon);
    moonMesh.position.set(cx - 16, byTop + 9, -6);
    moonMesh.renderOrder = -190; moonMesh.frustumCulled = false;
    moonMesh.name = 'moon';
    gFar.add(moonMesh);
    const disc = new THREE.Mesh(TrackGeo(new THREE.CircleGeometry(1.55, 20)), TrackMat(new THREE.MeshBasicMaterial({ color: 0xf2f6ff, fog: false })));
    disc.position.copy(moonMesh.position); disc.position.z += 0.2;
    disc.renderOrder = -189; disc.frustumCulled = false;
    gFar.add(disc);

    // 星
    const n = cfg.starCount;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = bx0 - 40 + Hash1(i * 3.1) * (bx1 - bx0 + 80);
      pos[i * 3 + 1] = byTop - 2 + Hash1(i * 7.7 + 2) * 26;
      pos[i * 3 + 2] = -5;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const stars = new THREE.Points(TrackGeo(g), mats.star);
    stars.frustumCulled = false; stars.renderOrder = -195;
    gFar.add(stars);
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

    // 地道背墙：从洞里看进去的那面暗土墙
    const bw = new THREE.Mesh(
      TrackGeo(GQuad(bx1 - bx0 + 24, Math.max(4, earthGroundRef - byBottom + 6), 0, 0, 0)),
      mats.earthBack
    );
    bw.position.set((bx0 + bx1) / 2, (earthGroundRef + byBottom) / 2 - 2, EARTH_BACK_Z);
    bw.matrixAutoUpdate = false; bw.updateMatrix();
    bw.frustumCulled = false;
    gMid.add(bw);

    return outline;
  }

  // ---- 地板：正视图里读作一条台沿 ----
  function BuildFloors() {
    const floors = Array.isArray(level.floors) ? level.floors : [];
    const buckets = NewBuckets();
    for (let i = 0; i < floors.length; i++) {
      const f = floors[i];
      if (!f || typeof f.x0 !== 'number' || typeof f.x1 !== 'number' || typeof f.y !== 'number') continue;
      const w = f.x1 - f.x0;
      if (w <= 0.01) continue;
      const cx = (f.x0 + f.x1) / 2;
      if (f.kind === 'tunnel') {
        BucketPush(buckets, 'mudDark', GBox(w, 0.3, 2.6, cx, f.y - 0.15, -0.5));
        BucketPush(buckets, 'mud', GBox(w, 0.06, 2.2, cx, f.y - 0.01, -0.4));
      } else if (f.kind === 'stone') {
        BucketPush(buckets, 'stone', GBox(w, 0.42, 3.0, cx, f.y - 0.21, -0.5));
      } else if (f.kind === 'roof') {
        BucketPush(buckets, 'tile', GBox(w, 0.26, 3.4, cx, f.y - 0.13, -0.6));
      } else if (f.kind === 'plank') {
        BucketPush(buckets, 'wood', GBox(w, 0.18, 1.9, cx, f.y - 0.09, -0.3));
        BucketPush(buckets, 'woodDark', GBox(0.14, 0.5, 0.3, f.x0 + 0.3, f.y - 0.3, -0.3));
        BucketPush(buckets, 'woodDark', GBox(0.14, 0.5, 0.3, f.x1 - 0.3, f.y - 0.3, -0.3));
      } else if (Math.abs(f.y - earthGroundRef) > 0.4) {
        // 台地 / 土坡：地表线以外的土地才补一块
        BucketPush(buckets, 'mud', GBox(w, 0.55, 3.0, cx, f.y - 0.28, -0.5));
      }
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
        BucketPush(buckets, 'wood', GBox(0.09, h, 0.09, s.x - 0.24, yc, -0.4));
        BucketPush(buckets, 'wood', GBox(0.09, h, 0.09, s.x + 0.24, yc, -0.4));
        const rungs = Math.max(1, Math.floor(h / 0.42));
        for (let k = 0; k < rungs; k++) BucketPush(buckets, 'wood', GBox(0.56, 0.06, 0.06, s.x, Math.min(yT, yB) + 0.25 + k * 0.42, -0.4));
      }
    }
    FlushBuckets(buckets, gPlay, 0);
  }

  // ---- 远山 + 远处村舍剪影 ----
  function BuildBackdrop(bx0, bx1, outline) {
    const span = bx1 - bx0;
    // 远山（FAR）：确定性山脊
    const ridge = [];
    const segN = Math.max(24, Math.floor(span / 6));
    const ptsA = [];
    for (let i = 0; i <= segN; i++) {
      const x = bx0 - 60 + (span + 160) * (i / segN);
      const y = 1.6 + Fbm2(x * 0.017, 1.3, 3) * 3.4 + Math.sin(x * 0.031) * 1.1;
      ptsA.push(x, y);
    }
    ptsA.push(bx1 + 100, -30, bx0 - 60, -30);
    ridge.push(GPrism(ptsA, 0.4, 0, 0, 0));
    const ptsB = [];
    for (let i = 0; i <= segN; i++) {
      const x = bx0 - 60 + (span + 160) * (i / segN);
      const y = 0.4 + Fbm2(x * 0.026 + 40, 8.1, 3) * 2.0;
      ptsB.push(x, y);
    }
    ptsB.push(bx1 + 100, -30, bx0 - 60, -30);
    ridge.push(GPrism(ptsB, 0.4, 0, 0, 4));
    const rm = SafeMerge(ridge);
    if (rm) {
      const mesh = new THREE.Mesh(rm, mats.farSil);
      mesh.position.y = earthGroundRef;
      mesh.matrixAutoUpdate = false; mesh.updateMatrix(); mesh.frustumCulled = false;
      gFar.add(mesh); TrackGeo(rm);
    }

    // 远处村舍剪影（BACK）
    const houses = [];
    const count = Math.max(6, Math.floor(span / 14));
    for (let i = 0; i < count; i++) {
      const t = (i + 0.5) / count;
      const x = bx0 - 20 + (span + 40) * t + (Hash1(i * 5.3) - 0.5) * 8;
      const w = 4 + Hash1(i * 2.1) * 5;
      const h = 2.2 + Hash1(i * 9.7) * 1.5;
      const r = h + 0.7 + Hash1(i * 4.4) * 0.6;
      houses.push(GPrism([-w / 2, 0, w / 2, 0, w / 2, h, 0, r, -w / 2, h], 0.5, x, earthGroundRef - 0.6, 0));
      if (Hash1(i * 11.1) > 0.62) {
        houses.push(GBox(0.35, 1.1, 0.5, x + w * 0.3, earthGroundRef + h + 0.2, 0));
      }
    }
    // 一排树线
    for (let i = 0; i < count; i++) {
      const x = bx0 - 24 + (span + 48) * ((i + 0.2) / count) + Hash1(i * 13.7) * 6;
      const h = 3.2 + Hash1(i * 3.9) * 2.4;
      houses.push(GBox(0.28, h, 0.3, x, earthGroundRef + h / 2 - 0.6, -1.2));
      houses.push(GIco(1, 0, x, earthGroundRef + h - 0.3, -1.2, 1.1, 0.8, 0.6));
    }
    const hm = SafeMerge(houses);
    if (hm) {
      const mesh = new THREE.Mesh(hm, mats.backSil);
      mesh.matrixAutoUpdate = false; mesh.updateMatrix(); mesh.frustumCulled = false;
      gBack.add(mesh); TrackGeo(hm);
    }

    // 层间空气（拉开纵深；low 档关掉）
    if (cfg.hazePlanes) {
      for (let i = 0; i < 2; i++) {
        const q = new THREE.Mesh(TrackGeo(GQuad(span + 200, 90, 0, 0, 0)), mats.haze);
        q.position.set((bx0 + bx1) / 2, earthGroundRef + 12, i === 0 ? LAYER_Z.BACK + 3 : LAYER_Z.MID + 2);
        q.renderOrder = -50 + i; q.frustumCulled = false;
        gFx.add(q);
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

      // 可互动 → 极淡暖色边光，玩家不用试错找互动点
      if (p.interact && p.interact !== 'none') {
        haloItems.push({
          x: px, y: py + InteractHaloY(p), z: 0, r: InteractHaloR(p),
          propId: p.id, interact: p.interact, vStart: 0, vCount: 0, cur: 0,
        });
      }
    }

    FlushBuckets(staticBuckets, gPlay, 0);
    FlushBuckets(foreBuckets, gFore, 0, mats.fore);
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
      case 'house': case 'haystack': case 'millstone': case 'tree': return 2.6;
      case 'bell': case 'chokepoint': case 'well': return 2.2;
      default: return 1.7;
    }
  }

  // ---- FORE：《勇敢的心》的招牌构图，必须有真实遮挡 ----
  function BuildForeground(bx0, bx1, outline) {
    const buckets = NewBuckets();
    const span = bx1 - bx0;
    const step = 13 / Math.max(0.2, cfg.foreDensity);
    // 避开互动点 / 地道口 / 出口，别挡住玩法
    const avoid = [];
    const props = Array.isArray(level.props) ? level.props : [];
    for (let i = 0; i < props.length; i++) {
      if (props[i] && props[i].interact && props[i].interact !== 'none') avoid.push(props[i].x || 0);
    }
    const hatches = Array.isArray(level.hatches) ? level.hatches : [];
    for (let i = 0; i < hatches.length; i++) if (typeof hatches[i].x === 'number') avoid.push(hatches[i].x);
    if (level.exit && typeof level.exit.x === 'number') avoid.push(level.exit.x);
    if (typeof level.startX === 'number') avoid.push(level.startX);

    function TooClose(x) {
      for (let i = 0; i < avoid.length; i++) if (Math.abs(avoid[i] - x) < 4.2) return true;
      return false;
    }

    const groundAt = outline ? outline.groundY : function () { return earthGroundRef; };
    const n = Math.max(3, Math.floor(span / step));
    for (let i = 0; i < n; i++) {
      const x = bx0 + span * ((i + 0.35 + Hash1(i * 6.1) * 0.4) / n);
      if (TooClose(x)) continue;
      const gy = groundAt(x);
      const pick = Hash1(i * 17.3);
      const rng = MakeRng(StrSeed('fore' + i));
      if (pick < 0.28) {
        // 树干：只有一根近黑的干，画面被切成两半，这是最有效的一招
        const h = 7 + rng() * 4;
        const w = 0.55 + rng() * 0.45;
        buckets.set('fore', buckets.get('fore') || []);
        BucketPush(buckets, 'fore', GBox(w, h, 0.9, x, gy + h / 2 - 1.2, 0, (rng() - 0.5) * 0.09));
        BucketPush(buckets, 'fore', GBox(w * 2.6, 0.5, 0.9, x + w * 1.0, gy + h * 0.62, 0, -0.5));
        BucketPush(buckets, 'fore', GIco(1, 0, x + w * 2.2, gy + h * 0.78, 0, 2.4, 1.3, 0.8));
      } else if (pick < 0.52) {
        // 柴垛
        const w = 2.0 + rng() * 1.4, h = 1.5 + rng() * 0.8;
        BucketPush(buckets, 'fore', GIco(1, 0, x, gy + h * 0.45, 0, w * 0.55, h * 0.5, 0.7));
        for (let k = 0; k < 8; k++) {
          BucketPush(buckets, 'fore', GBox(0.08, h * (0.7 + rng() * 0.6), 0.08,
            x + (rng() - 0.5) * w * 0.8, gy + h * 0.45 + (rng() - 0.5) * h * 0.4, 0.2, -0.4 + rng() * 1.6));
        }
      } else if (pick < 0.72) {
        // 土坡：把画面下缘压住
        const w = 6 + rng() * 6, h = 1.4 + rng() * 1.2;
        BucketPush(buckets, 'fore', GPrism([
          -w / 2, -3, w / 2, -3, w / 2, h * 0.35, w * 0.2, h, -w * 0.25, h * 0.8, -w / 2, h * 0.2,
        ], 1.0, x, gy - 0.6, 0));
      } else if (pick < 0.86) {
        // 苇丛
        for (let k = 0; k < 12; k++) {
          const h = 1.6 + rng() * 1.6;
          BucketPush(buckets, 'fore', GBox(0.05, h, 0.05, x + (rng() - 0.5) * 2.4, gy + h / 2 - 0.4, (rng() - 0.5) * 0.8, (rng() - 0.5) * 0.5));
        }
      } else {
        // 断墙
        const w = 2.4 + rng() * 2.0, h = 1.6 + rng() * 1.4;
        BucketPush(buckets, 'fore', GPrism([
          -w / 2, -2, w / 2, -2, w / 2, h * 0.7, w * 0.15, h, -w * 0.2, h * 0.55, -w / 2, h * 0.85,
        ], 0.9, x, gy, 0));
      }
    }

    // 地下的前景：只压住脚下和头顶，绝不挡住玩家身体
    const tunnels = [];
    const floors = Array.isArray(level.floors) ? level.floors : [];
    for (let i = 0; i < floors.length; i++) if (floors[i] && floors[i].kind === 'tunnel') tunnels.push(floors[i]);
    for (let i = 0; i < tunnels.length; i++) {
      const f = tunnels[i];
      const count = Math.max(1, Math.floor((f.x1 - f.x0) / 9 * cfg.foreDensity));
      for (let k = 0; k < count; k++) {
        const rng = MakeRng(StrSeed('ft' + i + '_' + k));
        const x = f.x0 + (f.x1 - f.x0) * ((k + 0.5) / count) + (rng() - 0.5) * 3;
        if (TooClose(x)) continue;
        // 脚下的土堆
        const w = 1.4 + rng() * 1.6;
        BucketPush(buckets, 'fore', GPrism([-w / 2, -1, w / 2, -1, w / 2, 0.1, 0, 0.36 + rng() * 0.2, -w / 2, 0.14], 0.8, x, f.y, 0));
        // 头顶垂下的树根
        if (rng() > 0.45) {
          for (let r = 0; r < 4; r++) {
            const h = 0.4 + rng() * 0.7;
            BucketPush(buckets, 'fore', GBox(0.05, h, 0.05, x + (rng() - 0.5) * 1.6, f.y + 2.0 - h / 2, (rng() - 0.5) * 0.6, (rng() - 0.5) * 0.6));
          }
        }
      }
    }

    const merged = SafeMerge(buckets.get('fore') || []);
    if (merged) {
      const mesh = new THREE.Mesh(merged, mats.fore);
      mesh.position.z = LAYER_Z.FORE;
      mesh.matrixAutoUpdate = false; mesh.updateMatrix(); mesh.frustumCulled = false;
      gFore.add(mesh);
      TrackGeo(merged);
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
    blobs.push(MakeBlob(playerRig));

    const enemies = Array.isArray(level.enemies) ? level.enemies : [];
    for (let i = 0; i < enemies.length; i++) {
      const e = enemies[i];
      if (!e || e.id == null) continue;
      const rig = MakeRig(ENEMY_RIG[e.kind] || 'soldier', mats.actor);
      if (rig && rig.group) gPlay.add(rig.group);
      enemyRigs.set(e.id, rig);
      blobs.push(MakeBlob(rig));
      // 视锥
      const range = (e.vision && e.vision.range) || 9;
      const halfDeg = (e.vision && e.vision.halfAngleDeg) || 26;
      const cone = MakeVisionCone(range, halfDeg);
      cone.visible = false;
      gPlay.add(cone);
      enemyCones.set(e.id, { obj: cone, mat: cone.material, height: (e.vision && e.vision.height) || 1.5, range });
    }

    const npcs = Array.isArray(level.npcs) ? level.npcs : [];
    for (let i = 0; i < npcs.length; i++) {
      const nn = npcs[i];
      if (!nn || nn.id == null) continue;
      const rig = MakeRig(NPC_RIG[nn.role] || 'villager', mats.actor);
      if (rig && rig.group) gPlay.add(rig.group);
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

  function MakeVisionCone(range, halfDeg) {
    const seg = 14;
    const half = Math.max(0.05, halfDeg * Math.PI / 180);
    const vCount = seg + 2;
    const pos = new Float32Array(vCount * 3);
    const col = new Float32Array(vCount * 4);
    pos[0] = 0; pos[1] = 0; pos[2] = 0;
    col[0] = 1; col[1] = 1; col[2] = 1; col[3] = 0.34;
    for (let i = 0; i <= seg; i++) {
      const a = -half + (half * 2) * (i / seg);
      const k = (i + 1) * 3;
      pos[k] = Math.cos(a) * range;
      pos[k + 1] = Math.sin(a) * range;
      pos[k + 2] = 0;
      const c = (i + 1) * 4;
      col[c] = 1; col[c + 1] = 1; col[c + 2] = 1; col[c + 3] = 0.0;
    }
    const idx = [];
    for (let i = 0; i < seg; i++) idx.push(0, i + 1, i + 2);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 4));
    g.setIndex(idx);
    TrackGeo(g);
    const mat = new THREE.MeshBasicMaterial({
      vertexColors: true, transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
      color: 0xdfe6f0, opacity: 0.55,
    });
    enemyConeMats.push(mat);
    const mesh = new THREE.Mesh(g, mat);
    mesh.renderOrder = 18;
    return mesh;
  }

  // ---- 危害 ----
  function BuildHazards() {
    const hz = Array.isArray(level.hazards) ? level.hazards : [];
    for (let i = 0; i < hz.length; i++) {
      const h = hz[i];
      if (!h || h.id == null) continue;
      const x0 = typeof h.x0 === 'number' ? h.x0 : 0;
      const x1 = typeof h.x1 === 'number' ? h.x1 : x0 + 10;
      const y = typeof h.y === 'number' ? h.y : -6;
      const view = { id: h.id, kind: h.kind, x0, x1, y, group: new THREE.Group(), layers: [], front: null, band: null };
      view.group.visible = false;
      gFx.add(view.group);

      if (h.kind === 'water') {
        const body = new THREE.Mesh(TrackGeo(GQuad(1, 1, 0.5, 0.5, 0)), mats.water);
        body.renderOrder = 12;
        view.group.add(body);
        view.layers.push(body);
        const line = new THREE.Mesh(TrackGeo(GQuad(1, 1, 0.5, 0, 0)), mats.waterLine);
        line.renderOrder = 13;
        view.group.add(line);
        view.band = line;
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
        // gas：多层带噪声的半透明面，靠 UV 滚动做翻滚感
        const n = cfg.gasLayers;
        for (let k = 0; k < n; k++) {
          const m = mats.gas.clone();
          m.opacity = 0.16 + 0.1 * (1 - k / Math.max(1, n));
          if (m.map) {
            m.map = m.map.clone();
            m.map.needsUpdate = true;
            m.map.wrapS = m.map.wrapT = THREE.RepeatWrapping;
            m.map.repeat.set(0.16 + k * 0.04, 0.55);
            TrackMat({ dispose() { m.map.dispose(); } });
          }
          TrackMat(m);
          const q = new THREE.Mesh(TrackGeo(GQuad(1, 1, 0.5, 0.5, 0)), m);
          q.position.z = 0.35 + k * 0.55;
          q.renderOrder = 14 + k;
          view.group.add(q);
          view.layers.push(q);
        }
        // 蔓延前锋：更浓的一道，看得出方向
        const fm = mats.gas.clone();
        fm.opacity = 0.34; fm.color.setHex(0xb9c07a);
        TrackMat(fm);
        const front = new THREE.Mesh(TrackGeo(GQuad(1, 1, 0, 0.5, 0)), fm);
        front.renderOrder = 19;
        view.group.add(front);
        view.front = front;
      }
      hazardViews.push(view);
    }
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
        function (it) { return { w: it.r * 2, h: it.r * 2, tilt: 0 }; },
        function () { return { r: 1, g: 0.72, b: 0.42, a: 0 }; });
      if (batch) {
        haloMesh = new THREE.Mesh(batch.geo, mats.haloAdd);
        haloMesh.renderOrder = 21; haloMesh.frustumCulled = false;
        haloMesh.position.z = 0.5;
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
    dustPoints.renderOrder = 24;
    gFx.add(dustPoints);
    dustCursor = 0;
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
      renderer.render(scene, camera);
      stats.drawCalls = renderer.info.render.calls;
      stats.triangles = renderer.info.render.triangles;
    } catch (e) {
      if (typeof console !== 'undefined') console.error('[Render] render 失败。', e);
    }
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
    const vh = typeof cam.viewHeight === 'number' && cam.viewHeight > 0.5 ? cam.viewHeight : CAMERA.viewHeight;
    if (Math.abs(vh - lastViewHeight) > 1e-4) {
      viewHeight = vh;
      ApplyCameraFrustum();
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
    camera.position.z = CAMERA_Z;
    camera.rotation.z = shake * 0.012 * Math.sin(t * 26.1);
    camera.updateMatrixWorld();

    // ---- 伪视差：远层随相机部分平移 ----
    gFar.position.x = cx * 0.62;
    gFar.position.y = cy * 0.55;
    gBack.position.x = cx * 0.30;
    gBack.position.y = cy * 0.26;
    gFore.position.x = -cx * 0.055;
    gFore.position.y = -cy * 0.04;

    // ---- 光照 / 雾：地表 ⇄ 地下平滑插值 ----
    const mix = layerMix;
    _colA.setHex(palette.ambientSurface);
    _colB.setHex(palette.ambientTunnel);
    ambient.color.copy(_colB).lerp(_colA, mix);
    ambient.intensity = Lerp(0.55, 3.2, mix);

    _colC.setHex(palette.moon);
    moon.color.copy(_colC);
    moon.intensity = Lerp(0.06, (palette.moonIntensity || 1) * 2.15, mix * mix);
    moon.position.set(cx - 9, cy + 15, 12);
    moon.target.position.set(cx, cy - 1, 0);
    moon.target.updateMatrixWorld();
    if (moon.castShadow) { moon.shadow.camera.updateProjectionMatrix(); }

    _colA.setHex(palette.fogSurface);
    _colB.setHex(palette.fogTunnel);
    scene.fog.color.copy(_colB).lerp(_colA, mix);
    scene.fog.near = Lerp(35.5, 33.0, mix);
    scene.fog.far = Lerp(52.0, 84.0, mix);
    _colD.setHex(palette.sky);
    scene.background.copy(_colB).lerp(_colD, mix);
    mats.skyBase.color.copy(scene.background);
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

    // ---- 暖光池：只点亮离相机最近的几盏 ----
    UpdateWarmLights(cx, t, mix);

    // ---- 玩家 ----
    if (playerRig && playerRig.group) {
      playerRig.group.position.set(px, py, LAYER_Z.PLAY);
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
          rig.group.position.set(ex, ey, LAYER_Z.PLAY);
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
          cone.obj.scale.set(rr, rr, 1);
          const hex = CONE_COLOR[e.state] || CONE_COLOR.patrol;
          cone.mat.color.setHex(hex);
          const alert = Clamp(typeof e.alertness === 'number' ? e.alertness : 0, 0, 1);
          const pulse = e.state === 'spotted' ? 0.75 + 0.25 * Math.sin(t * 16) : 1;
          cone.mat.opacity = (0.24 + alert * 0.4) * pulse;
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
        rig.group.position.set(nx, typeof nn.y === 'number' ? nn.y : 0, LAYER_Z.PLAY - 0.35);
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
        const a = it.alpha * (0.78 + 0.22 * Math.sin(t * 0.9 + it.phase)) * Lerp(1.15, 0.45, mix);
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

    // ---- 星与月的呼吸 ----
    mats.star.opacity = (0.45 + 0.3 * mix) * (0.85 + 0.15 * Math.sin(t * 0.7));
  }

  function ApplyCameraFrustum() {
    const aspect = viewW / Math.max(1, viewH);
    const hh = viewHeight / 2;
    const hw = hh * aspect;
    camera.left = -hw; camera.right = hw;
    camera.top = hh; camera.bottom = -hh;
    camera.near = CAMERA.near; camera.far = CAMERA.far;
    camera.updateProjectionMatrix();
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
      const a = g.on ? g.base * fl * Lerp(1.0, 0.7, mix) : 0;
      for (let k = 0; k < 4; k++) arr[(g.vStart + k) * 4 + 3] = a;
    }
    glowColorAttr.needsUpdate = true;
  }

  function UpdateHalos(state, px, py, cx, halfW, t) {
    if (!haloMesh || !haloColorAttr) return;
    const world = state.world || {};
    const arr = haloColorAttr.array;
    const pulse = 0.78 + 0.22 * Math.sin(t * 2.1);
    for (let i = 0; i < haloItems.length; i++) {
      const h = haloItems[i];
      let want = 0;
      if (Math.abs(h.x - cx) < halfW) {
        const gone = h.interact === 'pickup' && world.picked && world.picked[h.propId];
        if (!gone) {
          const d = Math.hypot(h.x - px, (h.y - 0.4) - py);
          want = 0.11 * pulse;                       // 平时：极淡，不打断沉浸
          if (d < 3.4) want = 0.11 + 0.30 * (1 - d / 3.4) * pulse;  // 走近：亮起来
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
        const h = 0.3 + lvl * 2.0;
        v.group.position.set(v.x0, v.y, 1.15);
        const body = v.layers[0];
        body.scale.set(reach, h, 1);
        mats.water.opacity = 0.5 + lvl * 0.3;
        if (v.band) {
          v.band.position.set(0, h, 0.05);
          v.band.scale.set(reach, 0.34, 1);
          if (mats.waterLine.map) {
            mats.waterLine.map.offset.x = -t * 0.14;
            mats.waterLine.map.offset.y = Math.sin(t * 0.7) * 0.05;
          }
          mats.waterLine.opacity = 0.35 + 0.2 * Math.sin(t * 2.3);
        }
      } else if (v.kind === 'collapse') {
        const s = 0.35 + lvl * 0.85;
        v.group.scale.set(s, s, s);
        for (let k = 0; k < v.layers.length; k++) v.layers[k].position.y = 0;
      } else {
        v.group.position.set(v.x0, v.y, 0);
        for (let k = 0; k < v.layers.length; k++) {
          const q = v.layers[k];
          q.scale.set(reach, 2.3 + k * 0.35, 1);
          q.position.y = -0.25 - k * 0.12 + Math.sin(t * 0.6 + k) * 0.1;
          const m = q.material;
          if (m.map) {
            m.map.offset.x = -t * (0.035 + k * 0.018);
            m.map.offset.y = Math.sin(t * (0.22 + k * 0.07)) * 0.09;
            m.map.repeat.x = Math.max(0.04, reach * 0.06 + k * 0.02);
          }
          m.opacity = (0.13 + 0.11 * (1 - k / Math.max(1, v.layers.length))) * (0.5 + lvl * 0.7);
        }
        if (v.front) {
          v.front.position.set(reach, -0.2, 1.9);
          v.front.scale.set(2.4, 3.0, 1);
          v.front.material.opacity = 0.14 + 0.2 * lvl * (0.75 + 0.25 * Math.sin(t * 3.1));
          if (v.front.material.map) {
            v.front.material.map.offset.x = -t * 0.22;
            v.front.material.map.repeat.set(0.5, 0.5);
          }
        }
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
    ApplyCameraFrustum();
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
    mats.haloAdd.map = T('ring');
    mats.shaftAdd.map = T('shaft');
    mats.gas.map = T('noise');
    mats.waterLine.map = T('water');
    mats.dust.map = T('glow');
    mats.blob.map = T('glow');
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
    gFx.traverse(function (o) { if (o.isMesh && o.material === mats.haze) o.visible = cfg.hazePlanes; });
    // 毒烟层数
    for (let i = 0; i < hazardViews.length; i++) {
      const v = hazardViews[i];
      if (v.kind !== 'gas') continue;
      for (let k = 0; k < v.layers.length; k++) v.layers[k].visible = k < cfg.gasLayers;
    }
    // 暖光池预算
    for (let i = 0; i < warmLights.length; i++) if (i >= cfg.warmLights) warmLights[i].visible = false;
    // 剖面细分 / 前景密度 / 纹理尺寸下一次 BuildLevel 才完全生效
  }

  function Dispose() {
    ClearLevel();
    scene.remove(gFar); scene.remove(gBack); scene.remove(gMid);
    scene.remove(gPlay); scene.remove(gFore); scene.remove(gFx);
    const keys = Object.keys(mats);
    for (let i = 0; i < keys.length; i++) { try { mats[keys[i]].dispose(); } catch (e) { /* 忽略 */ } }
    texCache.forEach(function (tex) { if (tex) { try { tex.dispose(); } catch (e) { /* 忽略 */ } } });
    texCache.clear();
    try { renderer.dispose(); } catch (e) { /* 忽略 */ }
    try { if (renderer.forceContextLoss) renderer.forceContextLoss(); } catch (e) { /* 忽略 */ }
  }

  // 初始化尺寸
  Resize(viewW, viewH, opts.pixelRatio);
  ApplyCameraFrustum();

  return {
    scene, camera, renderer, three: THREE,
    BuildLevel, Sync, ConsumeEvent, Resize, SetQuality, Dispose,
    stats,
  };
}

export default { CreateRenderer };
