// 《采耳物语 · EarSpa3D》治愈系房间与灯光（agent-look）
//
// 这是一间**温馨的采耳小店 / 疗愈小房间**：木地板、矮榻、软枕、纸灯、纱帘、
// 小几上的茶具、墙上的小画、窗外有天气。不是诊所，不是手术室。
//
// 关键约定：
//  - 单位 mm，Y 轴向上。房间 3000 × 3000 × 高 2750，矮榻朝向 z-（床头靠窗）。
//  - 模块顶层零副作用；颜色从 Data_Palette.mjs 取，本文件不写死色值。
//  - 绘制预算：中低档 ≤ 60k 三角面 / ≤ 40 draw call。重复件一律 InstancedMesh，
//    静态件按材质合并成一个 BufferGeometry。
//  - 四档氛围（teaRoom / rainNight / morning / sleepy）改的是**真光**：
//    三盏灯的强度与色温、outside 天空、雾、微尘、窗帘摆速、台灯明灭。

import { PALETTE, LIGHTING } from "./Data_Palette.mjs";
import { MakeDustPoints } from "./Script_Materials.js";

// ════════════════════════════════════════════════════════════════════════
//  0. 房间尺寸常量（单位 mm）
// ════════════════════════════════════════════════════════════════════════

const ROOM = {
  halfW: 1500, // 局部 x ∈ [-1500, 1500]
  halfD: 1500, // 局部 z ∈ [-1500, 1500]
  height: 2750,
  wall: 60, // 墙体厚度（做个样子，让窗洞有纵深）
};

// ── 与耳道的落位约定（这是"房间不许穿进耳朵"的结构性约束）───────────
//
// 世界原点是**耳道口**（契约 §2：耳道空间原点 = 耳甲腔处的耳道口），
// 而角色与耳部都是绕原点建的。所以房间必须围绕原点"让开"：
//
//   · 地面在原点下方 FLOOR_Y，矮榻的躺面在原点下方 LIE_BELOW（150mm）——
//     人侧躺在枕上，耳道口本来就在接触面上方约 15~20cm；躺面比 350mm
//     规则更贴近解剖，所以单独给一条"躺面必须低于 LIE_BELOW"的约束。
//   · 原点周围 KEEP_CLEAR_R 的水平半径内，**除躺面之外**不许有任何房间几何
//     高出 SETBACK_Y。地毯、家具、窗帘、灯、墙上的画、绿植全都要让开——
//     这些是"贴上来的东西"，一旦进了这个半径，将来任何配件都会穿进耳道。
//
// 历史事故：房间原先以原点为中心，地面就在 y=0，地毯铺在耳道口下方 3.8mm 处，
// 耳道内窥射线第一个命中的就是地毯与家具。
const FLOOR_Y = -390; // 地面标高（世界坐标）
const LIE_BELOW = 150; // 躺面（床垫上表面）至少低于原点这么多
const KEEP_CLEAR_R = 350; // 原点保持空的水平半径
const SETBACK_Y = -350; // 这个半径内的几何必须低于此高度（躺面也要守这一条）

// 房间组的世界落位：原点落在"床头靠窗、身体朝 +z 平躺"的位置，
// 且四面墙都在 KEEP_CLEAR_R 之外（原点距每面墙 ≥ 470mm）。
const ROOM_OFFSET = { x: 500, y: FLOOR_Y, z: 1500 };

// BED.top 是"床垫上表面离地高度"。
// 目标：躺面世界标高 = FLOOR_Y + BED.top = -LIE_BELOW
//   → BED.top = -LIE_BELOW - FLOOR_Y = -150 + 390 = 240（一张 240mm 高的矮榻）
// 这个等式必须由代码推出来而不是手写常数：手写时踩过两次——写成 540 的那次
// 把躺面抬到原点上方 150mm，整张床穿进了耳道。
const BED = { x: 1000, z: 80, w: 900, d: 1900, top: -LIE_BELOW - FLOOR_Y, frame: 110 }; // 局部；躺面世界标高 = -150
const TABLE = { x: 240, z: -1040, h: 470, w: 460, d: 460 }; // 小几放到床的左侧前方
const LAMP = { x: 1150, z: 1050 }; // 角落落地纸灯（原点左后方）
const HANG = { x: 1000, y: 1510, z: 80 }; // 床头垂下的纸灯（离地 1900）
const DESK = { x: 2200, y: FLOOR_Y + 890, z: -1180 }; // 床头小台灯（sleepy mood 只留它）

// ════════════════════════════════════════════════════════════════════════
//  1. 氛围预设（只放"数据"，应用逻辑在 applyMood 里）
// ════════════════════════════════════════════════════════════════════════

function makeMoods() {
  return {
    // 午后茶室：暖阳斜射，最清爽。太阳在窗外偏上，光斜切进来落在榻上。
    // 强度压到 1.1 / 曝光 0.98：之前 1.5+1.12 会把床品打到纯白，布纹全丢。
    teaRoom: {
      label: "午后茶室",
      key: { color: "#FFF0D6", intensity: 1.1, pos: [-620, 1250, -1150] },
      fill: { color: PALETTE.skyDeep, intensity: 0.4, pos: [1500, 900, 800] },
      rim: { color: PALETTE.honey, intensity: 0.55, pos: [900, 700, 1500] },
      hemi: { sky: PALETTE.sky, ground: PALETTE.wood, intensity: 0.55 },
      ambient: { color: PALETTE.cream, intensity: 0.22 },
      spot: { color: PALETTE.honey, intensity: 10, distance: 2600, decay: 1.7 },
      desk: { color: PALETTE.honey, intensity: 0 },
      sky: { day: 1, night: 0, tint: "#FFF6EA" },
      fog: { color: "#F7EFE6", near: 2600, far: 9000 },
      dust: { opacity: 0.5, colorA: PALETTE.honey, colorB: PALETTE.cream },
      bg: "#F7EFE6",
      exposure: 0.98,
      rain: 0,
      curtain: 1.0,
      gloss: 0.75,
    },
    // 雨夜：窗外雨丝 + 室内暖灯，最解压。key 收到很低，靠纸灯与台灯撑。
    rainNight: {
      label: "雨夜",
      key: { color: "#B9CFEA", intensity: 0.22, pos: [-620, 1000, -1150] },
      fill: { color: "#8FB0D8", intensity: 0.26, pos: [1500, 900, 800] },
      rim: { color: PALETTE.honeyDeep, intensity: 0.55, pos: [900, 700, 1500] },
      hemi: { sky: "#7C93B8", ground: "#6B5847", intensity: 0.38 },
      ambient: { color: "#C9D8EC", intensity: 0.18 },
      spot: { color: PALETTE.honeyDeep, intensity: 20, distance: 2400, decay: 1.6 },
      desk: { color: PALETTE.honey, intensity: 5.5 },
      sky: { day: 0, night: 1, tint: "#9FB6D6" },
      fog: { color: "#5C6A7E", near: 2200, far: 8000 },
      dust: { opacity: 0.62, colorA: PALETTE.honeyDeep, colorB: PALETTE.peach },
      bg: "#4E5A6B",
      exposure: 1.0,
      rain: 1,
      curtain: 0.8,
      gloss: 0.75,
    },
    // 清晨：通透冷调暖光，微尘最明显。太阳低、光偏白，影子拉长。
    morning: {
      label: "清晨",
      key: { color: "#FFF6E4", intensity: 1.4, pos: [-900, 620, -1250] },
      fill: { color: PALETTE.sky, intensity: 0.5, pos: [1400, 1100, 900] },
      rim: { color: PALETTE.cream, intensity: 0.62, pos: [700, 820, 1500] },
      hemi: { sky: PALETTE.sky, ground: PALETTE.mintDeep, intensity: 0.68 },
      ambient: { color: PALETTE.cream, intensity: 0.28 },
      spot: { color: PALETTE.cream, intensity: 9, distance: 2600, decay: 1.7 },
      desk: { color: PALETTE.honey, intensity: 1.6 },
      sky: { day: 1, night: 0, tint: "#EAF3FF" },
      fog: { color: "#EDF4F8", near: 3000, far: 10000 },
      dust: { opacity: 0.92, colorA: PALETTE.honey, colorB: PALETTE.white },
      bg: "#EDF4F8",
      exposure: 1.02,
      rain: 0,
      curtain: 1.35,
      gloss: 0.75,
    },
    // 睡前：昏暗柔光，接近 ASMR，只留床头灯。其余灯全部压到最低。
    sleepy: {
      label: "睡前",
      key: { color: "#C9A98C", intensity: 0.1, pos: [-620, 900, -1150] },
      fill: { color: "#8C7A8E", intensity: 0.12, pos: [1500, 900, 800] },
      rim: { color: PALETTE.honeyDeep, intensity: 0.26, pos: [900, 620, 1500] },
      hemi: { sky: "#6E6478", ground: "#3E352F", intensity: 0.16 },
      ambient: { color: "#D9C3B0", intensity: 0.06 },
      spot: { color: PALETTE.honeyDeep, intensity: 3.5, distance: 2000, decay: 1.7 },
      desk: { color: PALETTE.honey, intensity: 11 },
      sky: { day: 0, night: 1, tint: "#6B6E86" },
      fog: { color: "#3E3A44", near: 1800, far: 7000 },
      dust: { opacity: 0.34, colorA: PALETTE.honeyDeep, colorB: PALETTE.peachDeep },
      bg: "#3A3640",
      exposure: 1.02,
      rain: 0,
      curtain: 0.42,
      gloss: 0.75,
    },
  };
}

export const MOOD_IDS = ["teaRoom", "rainNight", "morning", "sleepy"];

/** 氛围清单（验收页 / UI 可以直接读，避免各处复制一份描述） */
export function GetMoods() {
  const moods = makeMoods();
  return MOOD_IDS.map((id) => ({ id, label: moods[id].label }));
}

// ════════════════════════════════════════════════════════════════════════
//  2. 小程序化几何工具：把一堆 Box/Cylinder 合成一个 BufferGeometry
//     （目的只有一个：压低 draw call。房间是静态的，值得合成。）
// ════════════════════════════════════════════════════════════════════════

function buildMerged(THREE, parts) {
  const geos = [];
  for (const p of parts) {
    let g;
    if (p.type === "cylinder") {
      g = new THREE.CylinderGeometry(p.rTop, p.rBottom, p.height, p.seg || 16, 1, !!p.open);
    } else if (p.type === "plane") {
      g = new THREE.PlaneGeometry(p.w, p.h, p.wSeg || 1, p.hSeg || 1);
    } else {
      g = new THREE.BoxGeometry(p.w, p.h, p.d);
    }
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    if (p.rot) q.setFromEuler(new THREE.Euler(p.rot[0] || 0, p.rot[1] || 0, p.rot[2] || 0));
    m.compose(
      new THREE.Vector3(p.x || 0, p.y || 0, p.z || 0),
      q,
      new THREE.Vector3(p.sx || 1, p.sy || 1, p.sz || 1)
    );
    g.applyMatrix4(m);
    geos.push(g);
  }
  const merged = mergeSimple(THREE, geos);
  for (const g of geos) g.dispose();
  return merged;
}

// 手写一个最小合并器：所有输入都只有 position / normal / uv 三个属性
// （BoxGeometry、CylinderGeometry、PlaneGeometry 都满足），所以不需要引入
// three 的 examples/jsm 工具，包体也不用多带一份代码。
function mergeSimple(THREE, geos) {
  let total = 0;
  let indexed = 0;
  for (const g of geos) {
    indexed += g.index ? g.index.count : g.attributes.position.count;
    total += g.attributes.position.count;
  }
  const pos = new Float32Array(total * 3);
  const nor = new Float32Array(total * 3);
  const uv = new Float32Array(total * 2);
  const idx = total > 65535 ? new Uint32Array(indexed) : new Uint16Array(indexed);

  let vOff = 0;
  let iOff = 0;
  for (const g of geos) {
    const gp = g.attributes.position;
    const gn = g.attributes.normal;
    const gu = g.attributes.uv;
    pos.set(gp.array.subarray(0, gp.count * 3), vOff * 3);
    if (gn) nor.set(gn.array.subarray(0, gn.count * 3), vOff * 3);
    if (gu) uv.set(gu.array.subarray(0, gu.count * 2), vOff * 2);
    if (g.index) {
      const gi = g.index.array;
      for (let i = 0; i < gi.length; i++) idx[iOff + i] = gi[i] + vOff;
      iOff += gi.length;
    } else {
      for (let i = 0; i < gp.count; i++) idx[iOff + i] = i + vOff;
      iOff += gp.count;
    }
    vOff += gp.count;
  }

  const out = new THREE.BufferGeometry();
  out.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  out.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
  out.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  out.computeBoundingSphere();
  return out;
}

// 复制一份几何并重设 UV 重复次数：合并后没法给不同部件设不同 repeat，
// 所以把重复"烘"进 UV 里（比拆成多个 mesh 省 draw call）。
function scaleUV(THREE, geo, ru, rv) {
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, uv.getX(i) * ru, uv.getY(i) * rv);
  }
  uv.needsUpdate = true;
  return geo;
}

// ════════════════════════════════════════════════════════════════════════
//  3. 程序化天空 / 窗外景（仍然零外部资产）
// ════════════════════════════════════════════════════════════════════════

function makeRng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const clampByte = (v) => (v < 0 ? 0 : v > 255 ? 255 : v | 0);
const lerp = (a, b, t) => a + (b - a) * t;

// 白天窗外：奶油色天空 + 几朵软云 + 远处树影。
function paintSkyDay(ctx, w, h) {
  const img = ctx.createImageData(w, h);
  const d = img.data;
  const rng = makeRng(0x5ee1);
  // 云：随机几个软椭圆
  const clouds = [];
  for (let i = 0; i < 9; i++) {
    clouds.push({ u: rng(), v: 0.08 + rng() * 0.34, r: 0.07 + rng() * 0.10, a: 0.4 + rng() * 0.45 });
  }
  const top = [214, 235, 250];
  const mid = [242, 246, 246];
  const low = [255, 244, 226];
  for (let y = 0; y < h; y++) {
    const v = y / h;
    const t = v < 0.55 ? v / 0.55 : 1;
    const base =
      v < 0.55
        ? [lerp(top[0], mid[0], t), lerp(top[1], mid[1], t), lerp(top[2], mid[2], t)]
        : [
            lerp(mid[0], low[0], (v - 0.55) / 0.45),
            lerp(mid[1], low[1], (v - 0.55) / 0.45),
            lerp(mid[2], low[2], (v - 0.55) / 0.45),
          ];
    for (let x = 0; x < w; x++) {
      const u = x / w;
      let r = base[0];
      let g = base[1];
      let b = base[2];
      for (const c of clouds) {
        let du = Math.abs(u - c.u);
        du = Math.min(du, 1 - du);
        const dv = v - c.v;
        const dist = Math.sqrt(du * du * 1.6 + dv * dv);
        const k = Math.max(0, 1 - dist / c.r) * c.a;
        r = lerp(r, 255, k);
        g = lerp(g, 255, k);
        b = lerp(b, 252, k * 0.95);
      }
      // 地平线以下压一点绿（远处树线），窗外就不空
      if (v > 0.5) {
        const k = Math.min(1, (v - 0.5) / 0.35) * 0.34;
        r = lerp(r, 168, k);
        g = lerp(g, 206, k);
        b = lerp(b, 172, k);
      }
      const o = (y * w + x) * 4;
      d[o] = clampByte(r);
      d[o + 1] = clampByte(g);
      d[o + 2] = clampByte(b);
      d[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
}

// 夜里窗外：夜蓝渐变 + 月亮 + 星点 + 城市暖灯。雨夜时窗外是暖路灯的色调。
function paintSkyNight(ctx, w, h, rainy) {
  const img = ctx.createImageData(w, h);
  const d = img.data;
  const rng = makeRng(rainy ? 0x5ee2 : 0x5ee3);
  const stars = [];
  for (let i = 0; i < 130; i++) stars.push({ u: rng(), v: rng() * 0.62, s: 0.4 + rng() * 1.2 });
  const top = rainy ? [58, 70, 92] : [46, 54, 84];
  const low = rainy ? [126, 122, 132] : [96, 96, 126];
  const moonU = 0.68;
  const moonV = 0.2;

  for (let y = 0; y < h; y++) {
    const v = y / h;
    for (let x = 0; x < w; x++) {
      const u = x / w;
      const t = Math.pow(v, 0.85);
      let r = lerp(top[0], low[0], t);
      let g = lerp(top[1], low[1], t);
      let b = lerp(top[2], low[2], t);

      // 月亮（雨夜被云遮住一大半，只留个晕）
      let du = Math.abs(u - moonU);
      du = Math.min(du, 1 - du);
      const dv = v - moonV;
      const md = Math.sqrt(du * du + dv * dv);
      const moonCore = Math.max(0, 1 - md / 0.035);
      const moonHalo = Math.max(0, 1 - md / 0.22) * (rainy ? 0.22 : 0.4);
      r = lerp(r, 255, moonCore * (rainy ? 0.35 : 0.95) + moonHalo * 0.5);
      g = lerp(g, 252, moonCore * (rainy ? 0.35 : 0.92) + moonHalo * 0.5);
      b = lerp(b, 236, moonCore * (rainy ? 0.3 : 0.85) + moonHalo * 0.45);

      // 星星（雨夜几乎看不到）
      for (const s of stars) {
        let su = Math.abs(u - s.u);
        su = Math.min(su, 1 - su);
        const sv = v - s.v;
        const sd = su * su + sv * sv;
        const k = Math.max(0, 1 - sd / 0.00035) * s.s * (rainy ? 0.15 : 0.9);
        r += k * 200;
        g += k * 200;
        b += k * 180;
      }

      // 地平线附近的暖灯（远处小店 / 街灯）
      if (v > 0.56) {
        const k = Math.max(0, 1 - Math.abs(v - 0.62) / 0.09) * (rainy ? 0.5 : 0.3);
        const flick = 0.7 + 0.3 * Math.sin(u * 90.0);
        r = lerp(r, 255, k * flick * 0.6);
        g = lerp(g, 200, k * flick * 0.55);
        b = lerp(b, 130, k * flick * 0.4);
      }
      const o = (y * w + x) * 4;
      d[o] = clampByte(r);
      d[o + 1] = clampByte(g);
      d[o + 2] = clampByte(b);
      d[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
}

// 柔光灯晕 sprite：中心白、外圈暖、α 快速衰减。灯罩的"发光感"靠它，不用真体积光。
function makeGlowTexture(THREE, size = 128, warm = true) {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  const img = ctx.createImageData(size, size);
  const d = img.data;
  const c = (size - 1) / 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (x - c) / c;
      const dy = (y - c) / c;
      const r = Math.min(1, Math.sqrt(dx * dx + dy * dy));
      // 两层：很亮的小芯 + 很宽很淡的晕
      const core = Math.pow(1 - r, 3.4);
      const halo = Math.pow(1 - r, 1.35) * 0.42;
      const a = Math.min(1, core + halo);
      const o = (y * size + x) * 4;
      d[o] = 255;
      d[o + 1] = clampByte(warm ? 238 - r * 40 : 246 - r * 20);
      d[o + 2] = clampByte(warm ? 206 - r * 70 : 255 - r * 40);
      d[o + 3] = clampByte(a * 255);
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;
  tex.userData.procedural = true;
  tex.userData.resolution = size;
  return tex;
}

// 窗玻璃外的一层水汽/雨膜（雨夜用）：淡蓝色薄雾，稍微降低外面的清晰度。
function makeMistTexture(THREE, size = 128) {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  const img = ctx.createImageData(size, size);
  const d = img.data;
  const n1 = makeRng(0x7711);
  const drops = [];
  for (let i = 0; i < 90; i++) drops.push({ x: n1() * size, y: n1() * size, r: 1 + n1() * 3.4 });
  // 先铺一层很淡的白雾
  for (let i = 0; i < size * size; i++) {
    d[i * 4] = 236;
    d[i * 4 + 1] = 242;
    d[i * 4 + 2] = 250;
    d[i * 4 + 3] = 26;
  }
  ctx.putImageData(img, 0, 0);
  // 再点上一颗颗小水珠（带一点高光）
  ctx.save();
  for (const dr of drops) {
    const g = ctx.createRadialGradient(dr.x, dr.y, 0, dr.x, dr.y, dr.r);
    g.addColorStop(0, "rgba(255,255,255,0.55)");
    g.addColorStop(0.6, "rgba(226,238,250,0.22)");
    g.addColorStop(1, "rgba(226,238,250,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(dr.x, dr.y, dr.r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.needsUpdate = true;
  tex.userData.procedural = true;
  tex.userData.resolution = size;
  return tex;
}

// ════════════════════════════════════════════════════════════════════════
//  4. 窗帘顶点动画：纱帘与布帘共用同一段 GLSL
//     （不用 ShaderMaterial 重写整套光照，只给 onBeforeCompile 插一段顶点位移）
// ════════════════════════════════════════════════════════════════════════

const CURTAIN_COMMON = `
uniform float uTime;
uniform float uSway;
uniform float uPivotY;
`;

const CURTAIN_BEGIN = `
  vec3 wp = (modelMatrix * vec4(transformed, 1.0)).xyz;
  float drop = max(uPivotY - wp.y, 0.0) * 0.001;
  float t = uTime * uSway;
  // 两层不同周期的波，避免看起来像一张规则的正弦布
  float amp = drop * drop * 46.0;
  vec3 offs;
  offs.x = (sin(t * 1.05 + drop * 2.3 + wp.z * 0.0135) * 0.65 + sin(t * 0.61 + wp.y * 0.0062) * 0.5) * amp;
  offs.z = (cos(t * 0.87 + drop * 1.7 + wp.x * 0.0112) * 0.55 + sin(t * 0.43 + wp.x * 0.004) * 0.45) * amp;
  // 摆动会拉长布面，竖直方向稍微回缩，看起来才有"布料被拉住"的重量感
  offs.y = -abs(offs.x) * 0.16 - abs(offs.z) * 0.16;
  wp += offs;
  transformed = (inverse(modelMatrix) * vec4(wp, 1.0)).xyz;
`;

function attachCurtainSway(mat, pivotY) {
  mat.userData.swayUniforms = {
    uTime: { value: 0 },
    uSway: { value: 1 },
    uPivotY: { value: pivotY },
  };
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = mat.userData.swayUniforms.uTime;
    shader.uniforms.uSway = mat.userData.swayUniforms.uSway;
    shader.uniforms.uPivotY = mat.userData.swayUniforms.uPivotY;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\n" + CURTAIN_COMMON)
      .replace("#include <begin_vertex>", "#include <begin_vertex>\n" + CURTAIN_BEGIN);
  };
  // 让 three 认得出这是"同一份程序"的变体，别每帧重编译
  mat.customProgramCacheKey = () => "curtainSway";
}

// 给材质套一份带摆动的克隆（漂浮的纸灯 / 挂植物也用这段，摆幅小一点）
function cloneWithSway(srcMat, pivotY, sway) {
  const m = srcMat.clone();
  attachCurtainSway(m, pivotY);
  m.userData.swayUniforms.uSway.value = sway;
  m.userData.ownsSway = true;
  return m;
}

// ════════════════════════════════════════════════════════════════════════
//  5. 主入口：BuildRoom
// ════════════════════════════════════════════════════════════════════════

/**
 * 搭一间治愈系采耳小房间。
 * @param {object} THREE_unused three 命名空间
 * @param {{materials?: object, quality?: "low"|"mid"|"high", dustCount?: number}} [options]
 */
export function BuildRoom(THREE_unused, { materials = null, quality = "mid", dustCount } = {}) {
  const THREE = THREE_unused;
  const q = quality === "low" || quality === "high" ? quality : "mid";
  const low = q === "low";
  const high = q === "high";

  const group = new THREE.Group();
  group.name = "EarSpaRoom";
  // 房间的落位：世界原点是耳道口，人躺的位置与四面墙都要围绕它排开。
  // 这里只设一次 group.position，房间内部所有坐标仍写"局部"的（好读）。
  group.position.set(ROOM_OFFSET.x, ROOM_OFFSET.y, ROOM_OFFSET.z);

  // 材质兜底：契约要求"材质没传就退回 MeshStandardMaterial 默认色"，绝不抛异常。
  const mat = (key, fallbackColor) => {
    const m = materials && materials[key];
    if (m) return m;
    return new THREE.MeshStandardMaterial({ color: new THREE.Color(fallbackColor || PALETTE.cream) });
  };

  const M = {
    bone: mat("wood", PALETTE.wood),
    bamboo: mat("bamboo", PALETTE.bamboo),
    woodDark: mat("woodDark", PALETTE.woodDeep),
    cloth: mat("cloth", PALETTE.creamDeep),
    ceramic: mat("ceramic", PALETTE.ceramic),
    steel: mat("steel", PALETTE.steel),
    steelDark: mat("steelDark", PALETTE.steelDeep),
    glass: mat("glass", PALETTE.glass),
    water: mat("water", PALETTE.water),
    cotton: mat("cotton", PALETTE.cotton),
    featherWhite: mat("featherWhite", PALETTE.featherWhite),
    featherBrown: mat("featherBrown", PALETTE.featherBrown),
    horsehair: mat("horsehair", PALETTE.horsehair),
    hair: mat("hair", PALETTE.inkSoft),
    ceramicMint: null,
  };

  // 房间自己的派生材质（都不是从 materials 里直接拿的通用件）。
  // sheen / clearcoat 属于 MeshPhysicalMaterial：Standard 不认这些键，three 会忽略并
  // 打 setValues 告警——所以必须走构造参数，且低档整条退回 Standard（用 emissive 找补）。
  const accent = (name, color, sheenColor) =>
    low
      ? Object.assign(
          new THREE.MeshStandardMaterial({
            color: new THREE.Color(color),
            roughness: 0.82,
            metalness: 0,
            emissive: new THREE.Color(sheenColor),
            emissiveIntensity: 0.08,
            envMapIntensity: 0.5,
          }),
          { name }
        )
      : Object.assign(
          new THREE.MeshPhysicalMaterial({
            color: new THREE.Color(color),
            roughness: 0.85,
            metalness: 0,
            sheen: 0.45,
            sheenColor: new THREE.Color(sheenColor),
            envMapIntensity: 0.5,
          }),
          { name }
        );
  const MINT = accent("AccentMint", PALETTE.mintDeep, PALETTE.mint);
  const PEACH = accent("AccentPeach", PALETTE.peachDeep, PALETTE.peach);
  const SHAFT = new THREE.MeshStandardMaterial({
    color: new THREE.Color(PALETTE.cream),
    emissive: new THREE.Color(PALETTE.honey),
    emissiveIntensity: 1.5,
    roughness: 0.6,
    metalness: 0,
  });
  SHAFT.name = "PaperLampGlow";
  const BULB = new THREE.MeshStandardMaterial({
    color: new THREE.Color(PALETTE.white),
    emissive: new THREE.Color(PALETTE.honey),
    emissiveIntensity: 3.2,
    roughness: 0.4,
    metalness: 0,
  });
  BULB.name = "LampBulb";
  const GLOW_TEX = makeGlowTexture(THREE, low ? 64 : 128, true);
  const MIST_TEX = makeMistTexture(THREE, low ? 64 : 128);

  const disposables = [MINT, PEACH, SHAFT, BULB, GLOW_TEX, MIST_TEX];
  const ownGeos = [];
  const ownMats = [];
  const swayMats = [];

  // 把一份几何摆到指定位置/姿态，返回它自己（合并几何时按材质归堆用）。
  // 为什么要有这个：BuildRoom 里绝大多数零件是静态的，与其每个零件一个 mesh，
  // 不如把同材质的零件烘成一份几何——draw call 是移动端最容易撞上的上限。
  const place = (geo, x, y, z, rot) => {
    const m = new THREE.Matrix4().compose(
      new THREE.Vector3(x, y, z),
      new THREE.Quaternion().setFromEuler(
        new THREE.Euler(rot ? rot[0] || 0 : 0, rot ? rot[1] || 0 : 0, rot ? rot[2] || 0 : 0)
      ),
      new THREE.Vector3(1, 1, 1)
    );
    geo.applyMatrix4(m);
    return geo;
  };

  // 零件清单里的 y 都写成"离地高度"（好读、好改），这里统一抬到世界标高。
  // 为什么要统一抬：世界原点是耳道口，地面必须在原点下方（见 FLOOR_Y 的说明），
  // 而零件表里只愿意写"踢脚线高 110"这种离地数。抬升集中在这一处，
  // 以后调整标高不用再翻遍整个文件。
  const lift = (parts) => {
    for (const p of parts) if (typeof p.y === "number") p.y += FLOOR_Y;
    return parts;
  };

  // ── 5.1 房间外壳：地板 / 墙 / 天花 ────────────────────────────────
  // 拆成三块几何：地板（顺纹长条）、墙体（细密纹）、深木件。
  // 目的不是好看，是 UV 尺度——木纹贴图里只有 3 圈年轮，3000mm 的大面
  // 直接用单位 UV 会把年轮拉到一米宽，所以这里把 repeat 烘进 UV。
  const floorParts = [];
  // 地板（暖木，木纹顺 z 走：把 v 轴对到 z 上）
  floorParts.push({ type: "box", w: ROOM.halfW * 2, h: 40, d: ROOM.halfD * 2, y: -20 });
  // 天花（浅一点，用同一张贴图但 UV 密一些）
  floorParts.push({ type: "box", w: ROOM.halfW * 2, h: 40, d: ROOM.halfD * 2, y: ROOM.height + 20 });
  const floorGeo = buildMerged(THREE, lift(floorParts));
  scaleUV(THREE, floorGeo, 4, 4); // 一张贴图铺 750mm，年轮约 250mm 一道
  ownGeos.push(floorGeo);
  const floorMesh = new THREE.Mesh(floorGeo, M.bone);
  floorMesh.name = "FloorCeiling";
  floorMesh.receiveShadow = true;
  group.add(floorMesh);

  const shell = [];
  // 四面墙（左 / 右 / 前；后墙带窗洞，单独拼）
  shell.push({ type: "box", w: ROOM.wall, h: ROOM.height, d: ROOM.halfD * 2, x: -ROOM.halfW - ROOM.wall / 2, y: ROOM.height / 2 });
  shell.push({ type: "box", w: ROOM.wall, h: ROOM.height, d: ROOM.halfD * 2, x: ROOM.halfW + ROOM.wall / 2, y: ROOM.height / 2 });
  shell.push({ type: "box", w: ROOM.halfW * 2 + ROOM.wall * 2, h: ROOM.height, d: ROOM.wall, z: ROOM.halfD + ROOM.wall / 2, y: ROOM.height / 2 });
  // 后墙分四块留出窗洞（窗：x ∈ [-950, 950]，y ∈ [720, 2050]）
  const winL = -950;
  const winR = 950;
  const winB = 720;
  const winT = 2050;
  shell.push({ type: "box", w: winL + ROOM.halfW, h: ROOM.height, d: ROOM.wall, x: (-ROOM.halfW + winL) / 2, z: -ROOM.halfD - ROOM.wall / 2, y: ROOM.height / 2 });
  shell.push({ type: "box", w: ROOM.halfW - winR, h: ROOM.height, d: ROOM.wall, x: (ROOM.halfW + winR) / 2, z: -ROOM.halfD - ROOM.wall / 2, y: ROOM.height / 2 });
  shell.push({ type: "box", w: winR - winL, h: winB, d: ROOM.wall, x: (winL + winR) / 2, z: -ROOM.halfD - ROOM.wall / 2, y: winB / 2 });
  shell.push({ type: "box", w: winR - winL, h: ROOM.height - winT, d: ROOM.wall, x: (winL + winR) / 2, z: -ROOM.halfD - ROOM.wall / 2, y: (ROOM.height + winT) / 2 });
  // 踢脚线（深木，一圈，给房间一点"装修过"的细节）
  const skirtH = 110;
  const skirtT = 26;
  shell.push({ type: "box", w: skirtT, h: skirtH, d: ROOM.halfD * 2, x: -ROOM.halfW + skirtT / 2, y: skirtH / 2, z: 0 });
  shell.push({ type: "box", w: skirtT, h: skirtH, d: ROOM.halfD * 2, x: ROOM.halfW - skirtT / 2, y: skirtH / 2, z: 0 });
  shell.push({ type: "box", w: ROOM.halfW * 2, h: skirtH, d: skirtT, z: ROOM.halfD - skirtT / 2, y: skirtH / 2 });
  shell.push({ type: "box", w: ROOM.halfW * 2, h: skirtH, d: skirtT, z: -ROOM.halfD + skirtT / 2, y: skirtH / 2 });
  // 窗框（内圈深木线脚）+ 窗台
  const frameT = 70;
  shell.push({ type: "box", w: frameT, h: winT - winB, d: 140, x: winL - frameT / 2, y: (winB + winT) / 2, z: -ROOM.halfD - 60 });
  shell.push({ type: "box", w: frameT, h: winT - winB, d: 140, x: winR + frameT / 2, y: (winB + winT) / 2, z: -ROOM.halfD - 60 });
  shell.push({ type: "box", w: winR - winL + frameT * 2, h: frameT, d: 140, x: (winL + winR) / 2, y: winT + frameT / 2, z: -ROOM.halfD - 60 });
  shell.push({ type: "box", w: winR - winL + frameT * 2, h: frameT, d: 220, x: (winL + winR) / 2, y: winB - frameT / 2, z: -ROOM.halfD + 20 });
  // 窗棂（一根竖 + 一根横）——日式格子窗的味
  shell.push({ type: "box", w: 54, h: winT - winB, d: 60, x: 0, y: (winB + winT) / 2, z: -ROOM.halfD - 40 });
  shell.push({ type: "box", w: winR - winL, h: 54, d: 60, x: 0, y: (winB + winT) / 2 + 180, z: -ROOM.halfD - 40 });
  const shellGeo = buildMerged(THREE, lift(shell));
  scaleUV(THREE, shellGeo, 2.2, 2.2); // 墙面：一张贴图约 1360mm
  ownGeos.push(shellGeo);
  const shellMesh = new THREE.Mesh(shellGeo, M.bone);
  shellMesh.name = "RoomShell";
  shellMesh.receiveShadow = true;
  shellMesh.castShadow = false;
  group.add(shellMesh);

  // 深木件：窗框的线条感 + 后面的家具，共用一个 draw call 的组
  const darkParts = [];
  // 榻的床架：**只有矮腿 + 一圈边条**，不做一个从地面到床面的实心盒子。
  // 原因见 FLOOR_Y 的说明：实心床架的顶面会正好顶到原点附近，耳道就被"包"进去了。
  // 矮腿 + 边条既保住了榻的体量感，又把床面附近让了出来。
  for (const [dx, dz] of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ]) {
    darkParts.push({
      type: "box",
      w: 70,
      h: BED.frame,
      d: 70,
      x: BED.x + dx * (BED.w / 2 - 50),
      y: BED.frame / 2,
      z: BED.z + dz * (BED.d / 2 - 50),
    });
  }
  // 床边条（四面围一圈，托住床垫）
  const railY = BED.frame - 15;
  darkParts.push({ type: "box", w: BED.w + 60, h: 30, d: 60, x: BED.x, y: railY, z: BED.z - BED.d / 2 });
  darkParts.push({ type: "box", w: BED.w + 60, h: 30, d: 60, x: BED.x, y: railY, z: BED.z + BED.d / 2 });
  darkParts.push({ type: "box", w: 60, h: 30, d: BED.d, x: BED.x - BED.w / 2, y: railY, z: BED.z });
  darkParts.push({ type: "box", w: 60, h: 30, d: BED.d, x: BED.x + BED.w / 2, y: railY, z: BED.z });
  // 床头小几（四条细腿 + 台面）
  darkParts.push({ type: "box", w: TABLE.w, h: 48, d: TABLE.d, x: TABLE.x, y: TABLE.h, z: TABLE.z });
  for (const [dx, dz] of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ]) {
    darkParts.push({
      type: "cylinder",
      rTop: 22,
      rBottom: 26,
      height: TABLE.h - 24,
      seg: 10,
      x: TABLE.x + dx * (TABLE.w / 2 - 40),
      y: (TABLE.h - 24) / 2,
      z: TABLE.z + dz * (TABLE.d / 2 - 40),
    });
  }
  // 墙上两幅小画的框（挂在 -x 侧墙）
  darkParts.push({ type: "box", w: 380, h: 500, d: 34, x: -1180, y: 1800, z: -1420, rot: [0, Math.PI / 2, 0] });
  darkParts.push({ type: "box", w: 300, h: 300, d: 34, x: -1180, y: 1180, z: -960, rot: [0, Math.PI / 2, 0] });
  // 矮凳（挪到床的右后侧，原先的位置会和床头小几叠在一起）
  darkParts.push({ type: "box", w: 420, h: 60, d: 420, x: 300, y: 430, z: 1180 });
  for (const [dx, dz] of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ]) {
    darkParts.push({ type: "box", w: 46, h: 400, d: 46, x: 300 + dx * 165, y: 200, z: 1180 + dz * 165 });
  }
  // 落纸灯的底座与灯杆
  darkParts.push({ type: "cylinder", rTop: 150, rBottom: 180, height: 60, seg: 20, x: LAMP.x, y: 30, z: LAMP.z });
  darkParts.push({ type: "cylinder", rTop: 16, rBottom: 16, height: 1500, seg: 10, x: LAMP.x, y: 810, z: LAMP.z });
  const darkGeo = buildMerged(THREE, lift(darkParts));
  ownGeos.push(darkGeo);
  const darkMesh = new THREE.Mesh(darkGeo, M.woodDark);
  darkMesh.name = "RoomFurnitureDark";
  darkMesh.castShadow = !low;
  darkMesh.receiveShadow = true;
  group.add(darkMesh);

  // 竹编地毯（细条 InstancedMesh：一张毯子只花 1 个 draw call）
  // 位置：铺在床的**远侧**（局部 x 偏大 = 世界 x 偏左），离开原点 KEEP_CLEAR_R 之外。
  // 原先它铺在床尾正下方，正好压在耳道口下方 3.8mm 处，是这次穿模的主犯。
  const RUG = { w: 1400, d: 1250, x: 260, z: 420 };
  const rugStrips = low ? 26 : 40;
  const rugGeo = new THREE.BoxGeometry(RUG.w, 16, RUG.d / rugStrips - 8);
  const rugMesh = new THREE.InstancedMesh(rugGeo, M.bamboo, rugStrips);
  rugMesh.name = "Rug";
  ownGeos.push(rugGeo);
  {
    const m4 = new THREE.Matrix4();
    for (let i = 0; i < rugStrips; i++) {
      const z = -RUG.d / 2 + (i + 0.5) * (RUG.d / rugStrips);
      // 竹条轻微错位，看起来是手工编的
      const jitter = ((i * 37) % 7) / 7 - 0.5;
      m4.makeTranslation(RUG.x + jitter * 6, FLOOR_Y + 8 + (i % 2) * 2, RUG.z + z);
      rugMesh.setMatrixAt(i, m4);
    }
    rugMesh.instanceMatrix.needsUpdate = true;
  }
  rugMesh.receiveShadow = true;
  rugMesh.castShadow = false;
  group.add(rugMesh);

  // ── 5.2 矮榻：床垫 / 软枕 / 被子 ──────────────────────────────────
  // 躺面（床垫上表面）由 BED.top 反算，定在原点下方 LIE_BELOW=150mm——这是
  // 侧躺时耳道口离接触面的真实量级。枕头放在**头的后方**（-z 侧），不压在耳道口上：
  // 真实采耳也是侧躺、耳朵悬在枕沿外，任何压在耳朵上的东西都会挡住耳道。
  const soft = [];
  const bedTop = FLOOR_Y + BED.top; // 床垫上表面（世界标高）= -150
  const matH = 130;
  soft.push({
    type: "box",
    w: BED.w - 40,
    h: matH,
    d: BED.d - 40,
    x: BED.x,
    y: bedTop - matH / 2 - FLOOR_Y,
    z: BED.z,
  });
  // 被子（盖在下半身那一段，带一点压痕的厚度）
  soft.push({ type: "box", w: BED.w - 20, h: 90, d: 820, x: BED.x, y: bedTop + 45 - FLOOR_Y, z: BED.z + 440 });
  // 软枕两个，都放在头的后方（-z 侧），近侧那一面在 z ≈ -120mm 之外
  soft.push({ type: "box", w: BED.w - 120, h: 170, d: 320, x: BED.x, y: bedTop + 85 - FLOOR_Y, z: BED.z - 680 });
  soft.push({ type: "box", w: BED.w - 220, h: 130, d: 260, x: BED.x, y: bedTop + 65 - FLOOR_Y, z: BED.z - 900 });
  // 床头板：刻意做矮。它离原点很近，做高了就会顶进 KEEP_CLEAR 半径里
  // （450mm 高的板曾经让躺面最高点跑到原点上方 310mm，正是穿模的来源之一）。
  soft.push({ type: "box", w: BED.w - 60, h: 120, d: 110, x: BED.x, y: bedTop + 60 - FLOOR_Y, z: BED.z - 1090 });
  const softGeo = buildMerged(THREE, soft);
  // 布的 UV 拉大：织纹在世界里才有真实尺度。
  // 但也不能过头——同一张贴图同时当 map 与 normalMap，repeat 太高会起摩尔纹，
  // 5 是在 900mm 宽的床垫上"看得出布纹又不起噪点"的折中值。
  scaleUV(THREE, softGeo, 5, 5);
  ownGeos.push(softGeo);
  const softMesh = new THREE.Mesh(softGeo, M.cloth);
  softMesh.name = "Bedding";
  softMesh.castShadow = !low;
  softMesh.receiveShadow = true;
  group.add(softMesh);

  // 抱枕 / 装饰靠垫：3 个低模圆角块（够可爱就行，不做布料模拟）
  const cushionGeo = new THREE.BoxGeometry(1, 1, 1, 3, 3, 3);
  {
    // 把方块捏成"鼓鼓的软垫"：按到中心的距离把顶点往外顶一点
    const p = cushionGeo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i);
      const y = p.getY(i);
      const z = p.getZ(i);
      const bulge = 1 + (1 - (x * x + y * y + z * z) / 3) * 0.12;
      p.setXYZ(i, x * bulge, y * bulge, z * bulge);
    }
    cushionGeo.computeVertexNormals();
  }
  ownGeos.push(cushionGeo);
  const cushions = [
    { m: MINT, x: -430, z: BED.z - 700, y: bedTop + 100, s: [280, 300, 180], ry: 0.2 },
    { m: PEACH, x: 470, z: BED.z - 640, y: bedTop + 90, s: [250, 260, 170], ry: -0.35 },
    { m: M.cloth, x: 300, z: BED.z + 620, y: bedTop + 80, s: [340, 200, 260], ry: 0.5 },
  ];
  for (let i = 0; i < cushions.length; i++) {
    const c = cushions[i];
    const mesh = new THREE.Mesh(cushionGeo, c.m);
    mesh.position.set(c.x, c.y, c.z);
    mesh.scale.set(c.s[0], c.s[1], c.s[2]);
    mesh.rotation.y = c.ry;
    mesh.name = "Cushion" + i;
    // 抱枕压在软垫上，投影本来就糊成一团，省掉一次阴影 pass 更划算
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    group.add(mesh);
  }

  // ── 5.3 小几上的茶具（陶瓷：一个托盘 + 壶 + 两只杯）───────────────
  // 每件单独一个 mesh 会白吃 draw call，这里按材质合并：壶的四件并成一个，
  // 两只杯并成一个，两杯茶汤并成一个。合并后的整体摆位用外层 Group 承担。
  const teaY = FLOOR_Y + TABLE.h + 24;
  const tray = new THREE.Mesh(new THREE.BoxGeometry(320, 16, 220), M.woodDark);
  ownGeos.push(tray.geometry);
  tray.position.set(TABLE.x, teaY + 8, TABLE.z);
  tray.receiveShadow = true;
  group.add(tray);

  const potGeo = buildMerged(THREE, [
    { type: "cylinder", rTop: 0.0001, rBottom: 74, height: 74, seg: high ? 24 : 16, y: 64 }, // 壶身（下宽上收）
    { type: "cylinder", rTop: 74, rBottom: 50, height: 60, seg: high ? 24 : 16, y: 62 },
    { type: "cylinder", rTop: 30, rBottom: 30, height: 12, seg: 14, y: 128 }, // 壶盖
    { type: "cylinder", rTop: 10, rBottom: 10, height: 22, seg: 10, y: 142 }, // 盖钮
    { type: "cylinder", rTop: 12, rBottom: 18, height: 70, seg: 10, x: 66, y: 84, rot: [0, 0, -0.9] }, // 壶嘴
  ]);
  ownGeos.push(potGeo);
  const potHandleGeo = new THREE.TorusGeometry(40, 8, 6, 16, Math.PI * 1.1);
  const potHandleM = new THREE.Matrix4().compose(
    new THREE.Vector3(-64, 92, 0),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, -0.4)),
    new THREE.Vector3(1, 1, 1)
  );
  potHandleGeo.applyMatrix4(potHandleM);
  ownGeos.push(potHandleGeo);
  const pot = new THREE.Mesh(mergeSimple(THREE, [potGeo, potHandleGeo]), M.ceramic);
  pot.position.set(TABLE.x - 40, teaY + 16, TABLE.z - 20);
  pot.rotation.y = 0.4;
  pot.castShadow = !low;
  pot.name = "Teapot";
  group.add(pot);

  const cupGeoRaw = new THREE.CylinderGeometry(38, 30, 54, high ? 20 : 14, 1, true);
  const cupParts = [];
  const soupParts = [];
  const cupSpots = [];
  for (let i = 0; i < 2; i++) {
    cupSpots.push([TABLE.x + 96 + i * 58, TABLE.z + 46 - i * 70]);
  }
  for (const [cx, cz] of cupSpots) {
    const g = cupGeoRaw.clone();
    g.applyMatrix4(new THREE.Matrix4().makeTranslation(cx, teaY + 43, cz));
    cupParts.push(g);
    const s = new THREE.CircleGeometry(33, high ? 18 : 12);
    s.applyMatrix4(
      new THREE.Matrix4().compose(
        new THREE.Vector3(cx, teaY + 58, cz),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0)),
        new THREE.Vector3(1, 1, 1)
      )
    );
    soupParts.push(s);
  }
  cupGeoRaw.dispose();
  const cupsGeo = mergeSimple(THREE, cupParts);
  for (const g of cupParts) g.dispose();
  ownGeos.push(cupsGeo);
  const cups = new THREE.Mesh(cupsGeo, M.ceramic);
  cups.castShadow = !low;
  cups.name = "Teacups";
  group.add(cups);
  // 茶汤：低粗糙高透明的两片圆面，合成一个 mesh
  const soupGeo = mergeSimple(THREE, soupParts);
  for (const g of soupParts) g.dispose();
  ownGeos.push(soupGeo);
  const soup = new THREE.Mesh(soupGeo, M.water);
  soup.name = "TeaSurface";
  group.add(soup);

  // ── 5.4 灯：纸灯（吊 + 落地）+ 床头小台灯 ────────────────────────
  // 三盏灯的零件都按材质合并：一盏灯 2~3 个 draw call，而不是每个零件一个。
  // 可以合并的前提：所有合并件都是**纯旋转**动画，没有位移/缩放，UV 尺度也一致。
  const lamps = [];

  // 吊灯（床头正上方，暖纸灯，会轻轻摇）
  const hangGroup = new THREE.Group();
  {
    const cordH = ROOM.height - HANG.y - 300;
    const cordGeo = new THREE.CylinderGeometry(5, 5, cordH, 6);
    cordGeo.applyMatrix4(new THREE.Matrix4().makeTranslation(0, cordH / 2 + 300, 0));
    ownGeos.push(cordGeo);
    const cord = new THREE.Mesh(cordGeo, M.woodDark);

    const shadeGeo = new THREE.CylinderGeometry(200, 300, 360, high ? 28 : 18, 1, true);
    shadeGeo.applyMatrix4(new THREE.Matrix4().makeTranslation(0, 120, 0));
    const capGeo = new THREE.CircleGeometry(200, high ? 28 : 18);
    capGeo.applyMatrix4(
      new THREE.Matrix4().compose(
        new THREE.Vector3(0, 300, 0),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0)),
        new THREE.Vector3(1, 1, 1)
      )
    );
    const shadeMerged = mergeSimple(THREE, [shadeGeo, capGeo]);
    shadeGeo.dispose();
    capGeo.dispose();
    ownGeos.push(shadeMerged);
    const shade = new THREE.Mesh(shadeMerged, SHAFT);
    SHAFT.side = THREE.DoubleSide;

    const bulbGeo = new THREE.SphereGeometry(58, 16, 12);
    bulbGeo.applyMatrix4(new THREE.Matrix4().makeTranslation(0, 60, 0));
    ownGeos.push(bulbGeo);
    const bulb = new THREE.Mesh(bulbGeo, BULB);

    hangGroup.add(cord, shade, bulb);
  }
  hangGroup.position.set(HANG.x, HANG.y, HANG.z);
  hangGroup.name = "HangingLamp";
  group.add(hangGroup);
  lamps.push({ obj: hangGroup, base: 0, amp: 0.035, speed: 0.55, axis: "z" });

  // 落地纸灯（角落，高高的纸罩）
  const floorLamp = new THREE.Group();
  {
    const shadeGeo = new THREE.CylinderGeometry(210, 260, 620, high ? 24 : 16, 1, true);
    const capGeo = new THREE.CircleGeometry(210, high ? 24 : 16);
    capGeo.applyMatrix4(
      new THREE.Matrix4().compose(
        new THREE.Vector3(0, 310, 0),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0)),
        new THREE.Vector3(1, 1, 1)
      )
    );
    const merged = mergeSimple(THREE, [shadeGeo, capGeo]);
    shadeGeo.dispose();
    capGeo.dispose();
    ownGeos.push(merged);
    const shade = new THREE.Mesh(merged, SHAFT);
    const bulbGeo = new THREE.SphereGeometry(52, 14, 10);
    ownGeos.push(bulbGeo);
    const bulb = new THREE.Mesh(bulbGeo, BULB);
    floorLamp.add(shade, bulb);
  }
  floorLamp.position.set(LAMP.x, FLOOR_Y + 1680, LAMP.z);
  floorLamp.name = "FloorLamp";
  group.add(floorLamp);
  lamps.push({ obj: floorLamp, base: 0, amp: 0.018, speed: 0.42, axis: "x" });

  // 床头小台灯（sleepy mood 只剩它）
  const deskLamp = new THREE.Group();
  {
    const baseGeo = new THREE.CylinderGeometry(96, 120, 40, 18);
    ownGeos.push(baseGeo);
    const base = new THREE.Mesh(baseGeo, M.woodDark);
    const poleGeo = new THREE.CylinderGeometry(12, 12, 300, 8);
    poleGeo.applyMatrix4(new THREE.Matrix4().makeTranslation(0, 170, 0));
    ownGeos.push(poleGeo);
    const pole = new THREE.Mesh(poleGeo, M.steel);

    const shadeGeo = new THREE.CylinderGeometry(120, 190, 220, high ? 22 : 14, 1, true);
    shadeGeo.applyMatrix4(new THREE.Matrix4().makeTranslation(0, 400, 0));
    ownGeos.push(shadeGeo);
    const shade = new THREE.Mesh(shadeGeo, SHAFT);

    const bulbGeo = new THREE.SphereGeometry(46, 14, 10);
    bulbGeo.applyMatrix4(new THREE.Matrix4().makeTranslation(0, 340, 0));
    ownGeos.push(bulbGeo);
    const bulb = new THREE.Mesh(bulbGeo, BULB);

    deskLamp.add(base, pole, shade, bulb);
  }
  deskLamp.position.set(DESK.x, DESK.y, DESK.z);
  deskLamp.name = "DeskLamp";
  group.add(deskLamp);

  // 三个柔光晕：每盏灯三张交叉的 billboard 平面（单张从侧面看会成一条线），
  // 九个面片合成一个 InstancedMesh —— 只花一次 draw call。
  // 位置在构建时就把灯组的变换烘进实例矩阵里，所以灯摆动时光晕不跟着动
  // （摆幅只有 2° 左右，看不出来，但省下一次 draw call）。
  const glowMat = new THREE.MeshBasicMaterial({
    map: GLOW_TEX,
    color: new THREE.Color(PALETTE.honey),
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
    opacity: 0.6,
  });
  glowMat.name = "LampGlow";
  ownMats.push(glowMat);
  const glowGeo = new THREE.PlaneGeometry(1, 1);
  ownGeos.push(glowGeo);
  const glowSpots = [
    { at: new THREE.Vector3(HANG.x, HANG.y + 90, HANG.z), size: 1500 },
    { at: new THREE.Vector3(LAMP.x, FLOOR_Y + 1680, LAMP.z), size: 1250 },
    { at: new THREE.Vector3(DESK.x, DESK.y + 380, DESK.z), size: 900 },
  ];
  const glowMesh = new THREE.InstancedMesh(glowGeo, glowMat, glowSpots.length * 3);
  glowMesh.name = "LampGlows";
  glowMesh.renderOrder = 5;
  glowMesh.frustumCulled = false;
  {
    const m4 = new THREE.Matrix4();
    const q4 = new THREE.Quaternion();
    const e4 = new THREE.Euler();
    const s4 = new THREE.Vector3();
    let n = 0;
    for (const spot of glowSpots) {
      for (let k = 0; k < 3; k++) {
        e4.set(0, (k * Math.PI) / 3, 0);
        q4.setFromEuler(e4);
        s4.set(spot.size, spot.size, 1);
        m4.compose(spot.at, q4, s4);
        glowMesh.setMatrixAt(n++, m4);
      }
    }
    glowMesh.instanceMatrix.needsUpdate = true;
  }
  group.add(glowMesh);

  // ── 5.5 窗：玻璃 + 纱帘 + 布帘 + 窗外天空 ────────────────────────
  const winW = winR - winL;
  const winH = winT - winB;
  const winCy = (winB + winT) / 2;
  const winZ = -ROOM.halfD - 60; // 玻璃/雨膜再往里让 30mm，确保离开原点 350mm 之外

  // 玻璃：很淡的一层，给窗外景一点"隔着玻璃"的分隔
  const winGlass = new THREE.Mesh(new THREE.PlaneGeometry(winW, winH), M.glass);
  ownGeos.push(winGlass.geometry);
  winGlass.position.set(0, winCy, winZ);
  winGlass.name = "WindowGlass";
  group.add(winGlass);

  // 雨膜（雨夜才显形，靠 opacity 交叉淡入）
  const mistMat = new THREE.MeshBasicMaterial({
    map: MIST_TEX,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  mistMat.map.repeat.set(3, 2);
  ownMats.push(mistMat);
  const mist = new THREE.Mesh(new THREE.PlaneGeometry(winW, winH), mistMat);
  ownGeos.push(mist.geometry);
  mist.position.set(0, winCy, winZ + 12);
  mist.name = "WindowMist";
  group.add(mist);

  // 窗外：一片大地面 + 天空球（天空球用两层材质做昼夜交叉淡入）
  const outsideGround = new THREE.Mesh(new THREE.PlaneGeometry(9000, 6000), M.bamboo);
  ownGeos.push(outsideGround.geometry);
  outsideGround.rotation.x = -Math.PI / 2;
  outsideGround.position.set(0, -80, -5200);
  outsideGround.name = "OutsideGround";
  group.add(outsideGround);

  const skyCanvasDay = document.createElement("canvas");
  skyCanvasDay.width = low ? 128 : 256;
  skyCanvasDay.height = low ? 64 : 128;
  paintSkyDay(skyCanvasDay.getContext("2d"), skyCanvasDay.width, skyCanvasDay.height);
  const skyTexDay = new THREE.CanvasTexture(skyCanvasDay);
  skyTexDay.colorSpace = THREE.SRGBColorSpace;
  skyTexDay.mapping = THREE.EquirectangularReflectionMapping;
  skyTexDay.userData.procedural = true;
  const skyCanvasNight = document.createElement("canvas");
  skyCanvasNight.width = low ? 128 : 256;
  skyCanvasNight.height = low ? 64 : 128;
  paintSkyNight(skyCanvasNight.getContext("2d"), skyCanvasNight.width, skyCanvasNight.height, true);
  const skyTexNight = new THREE.CanvasTexture(skyCanvasNight);
  skyTexNight.colorSpace = THREE.SRGBColorSpace;
  skyTexNight.mapping = THREE.EquirectangularReflectionMapping;
  skyTexNight.userData.procedural = true;
  disposables.push(skyTexDay, skyTexNight);

  const skyMatDay = new THREE.MeshBasicMaterial({
    map: skyTexDay,
    side: THREE.BackSide,
    transparent: true,
    opacity: 1,
    depthWrite: false,
    fog: false,
  });
  const skyMatNight = new THREE.MeshBasicMaterial({
    map: skyTexNight,
    side: THREE.BackSide,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    fog: false,
  });
  ownMats.push(skyMatDay, skyMatNight);
  const skyGeo = new THREE.SphereGeometry(4200, low ? 16 : 24, low ? 12 : 16);
  ownGeos.push(skyGeo);
  const skyMesh = new THREE.Mesh(skyGeo, [skyMatDay, skyMatNight]);
  skyMesh.position.set(0, 900, -600);
  skyMesh.name = "OutsideSky";
  skyMesh.castShadow = false;
  skyMesh.receiveShadow = false;
  skyMesh.frustumCulled = false;
  group.add(skyMesh);

  // 雨丝：InstancedMesh（一根细长条 = 一道雨），走实例矩阵更新，1 个 draw call
  const rainCount = low ? 90 : 170;
  const rainGeo = new THREE.BoxGeometry(7, 130, 7);
  ownGeos.push(rainGeo);
  const rainMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(PALETTE.sky),
    transparent: true,
    opacity: 0.42,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    fog: false,
  });
  ownMats.push(rainMat);
  const rainMesh = new THREE.InstancedMesh(rainGeo, rainMat, rainCount);
  rainMesh.name = "Rain";
  rainMesh.frustumCulled = false;
  rainMesh.visible = false;
  group.add(rainMesh);
  const drops = [];
  {
    const rng = makeRng(0x9a17);
    for (let i = 0; i < rainCount; i++) {
      drops.push({
        x: -1800 + rng() * 3600,
        y: winB + rng() * (winH + 900),
        z: -ROOM.halfD - 260 - rng() * 900,
        speed: 1500 + rng() * 1900,
        len: 0.6 + rng() * 0.9,
        tilt: (rng() - 0.5) * 0.2,
      });
    }
  }

  // 纱帘（tulle，半透、摆动最大）+ 布帘（厚一点、摆动小）
  const curtainPivot = winT + 60;
  const tulleMat = M.cloth.clone();
  tulleMat.color = new THREE.Color(PALETTE.cream);
  tulleMat.transparent = true;
  tulleMat.opacity = 0.62;
  tulleMat.depthWrite = false;
  tulleMat.side = THREE.DoubleSide;
  attachCurtainSway(tulleMat, curtainPivot);
  ownMats.push(tulleMat);
  swayMats.push(tulleMat);

  const drapeMat = cloneWithSway(M.cloth, curtainPivot, 0.42);
  drapeMat.color = new THREE.Color(PALETTE.mintDeep);
  drapeMat.roughness = 0.95;
  ownMats.push(drapeMat);
  swayMats.push(drapeMat);

  // 窗帘几何：分段平面（段数决定摆动的柔顺度），横跨窗两侧
  const curtainGeoMat = new THREE.PlaneGeometry(700, winH + 420, 8, 16);
  ownGeos.push(curtainGeoMat);
  for (const [x, zOff, material, name] of [
    [-1400, -20, drapeMat, "DrapeLeft"],
    [1400, -20, drapeMat, "DrapeRight"],
    // 纱帘：这是唯一一块"正对原点"的大面积几何，必须留在 KEEP_CLEAR_R 之外。
    // zOff 是相对 winZ 的偏移，winZ 已经在墙外；410 让纱帘落在世界 z=350（原点前方）。
    // 历史事故：zOff 给 40 时纱帘贴到耳道口 10mm 处，内窥射线第一个命中的就是它。
    [-620, 410, tulleMat, "TulleLeft"],
    [620, 410, tulleMat, "TulleRight"],
  ]) {
    const c = new THREE.Mesh(curtainGeoMat, material);
    c.position.set(x, curtainPivot - (winH + 420) / 2, winZ + zOff);
    c.name = name;
    c.castShadow = false;
    c.receiveShadow = false;
    c.frustumCulled = false; // 顶点会被推出去，包围球判不准
    group.add(c);
  }
  // 窗帘杆
  const rod = new THREE.Mesh(new THREE.CylinderGeometry(22, 22, winW + 1500, 10), M.woodDark);
  ownGeos.push(rod.geometry);
  rod.rotation.z = Math.PI / 2;
  rod.position.set(0, curtainPivot + 40, winZ - 40);
  group.add(rod);

  // ── 5.6 墙面装饰：两幅小画 + 挂着的绿植 ──────────────────────────
  // 画芯：薄荷 & 蜜桃两色小色块（抽象风景，可爱不吵）。两张画各一次 draw call，
  // 不再为省 1 个 call 硬并成一张——配色不同就得换材质，合并反而要牺牲颜色。
  const artMint = new THREE.Mesh(new THREE.PlaneGeometry(300, 420), MINT);
  ownGeos.push(artMint.geometry);
  artMint.position.set(-1160, 1800, -1420);
  artMint.rotation.y = Math.PI / 2;
  artMint.name = "WallArtMint";
  artMint.castShadow = false;
  artMint.receiveShadow = false;
  group.add(artMint);
  const artPeach = new THREE.Mesh(new THREE.PlaneGeometry(220, 220), PEACH);
  ownGeos.push(artPeach.geometry);
  artPeach.position.set(-1156, 1180, -960);
  artPeach.rotation.y = Math.PI / 2;
  artPeach.name = "WallArtPeach";
  artPeach.castShadow = false;
  artPeach.receiveShadow = false;
  group.add(artPeach);

  // 挂植物：一根藤 + 花盆（合并成一个 mesh）+ 一簇 InstancedMesh 叶子（会轻轻摆）
  const plantGroup = new THREE.Group();
  plantGroup.position.set(1600, FLOOR_Y + ROOM.height - 40, -700);
  plantGroup.name = "HangingPlant";
  {
    const vineGeo = place(new THREE.CylinderGeometry(7, 5, 520, 6), 0, -260, 0);
    const potGeo2 = place(new THREE.CylinderGeometry(150, 110, 180, 16), 0, -600, 0);
    const merged = mergeSimple(THREE, [vineGeo, potGeo2]);
    vineGeo.dispose();
    potGeo2.dispose();
    ownGeos.push(merged);
    const plantBody = new THREE.Mesh(merged, PEACH);
    plantBody.castShadow = false;
    plantGroup.add(plantBody);
  }
  const leafCount = low ? 14 : 26;
  const leafGeo = new THREE.PlaneGeometry(70, 150, 1, 3);
  {
    // 叶子捏成柳叶形（中间宽两头尖）
    const p = leafGeo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i);
      const t = Math.abs(y) / 75;
      p.setX(i, p.getX(i) * (1 - t * t * 0.75));
    }
    leafGeo.computeVertexNormals();
  }
  ownGeos.push(leafGeo);
  const leafMesh = new THREE.InstancedMesh(leafGeo, MINT, leafCount);
  leafMesh.name = "PlantLeaves";
  leafMesh.castShadow = false;
  leafMesh.receiveShadow = false;
  leafMesh.frustumCulled = false;
  {
    const rng = makeRng(0x1eaf);
    const m4 = new THREE.Matrix4();
    const q4 = new THREE.Quaternion();
    const e = new THREE.Euler();
    for (let i = 0; i < leafCount; i++) {
      const a = rng() * Math.PI * 2;
      const r = 60 + rng() * 190;
      const y = -560 - rng() * 640;
      e.set((rng() - 0.5) * 1.1, a, (rng() - 0.5) * 1.4);
      q4.setFromEuler(e);
      m4.compose(new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r), q4, new THREE.Vector3(1, 1, 1));
      leafMesh.setMatrixAt(i, m4);
    }
    leafMesh.instanceMatrix.needsUpdate = true;
  }
  plantGroup.add(leafMesh);
  group.add(plantGroup);
  lamps.push({ obj: plantGroup, base: 0, amp: 0.02, speed: 0.75, axis: "x", rotOnly: true });

  // ── 5.7 小道具：棉球罐、鹅毛掸子、药水瓶（都是采耳店的物件）───────
  // 这些小东西每一个都单独成 mesh 的话要白吃十几个 draw call，
  // 这里按材质归堆合并：玻璃一个、水一个、木一个、羽毛两个。
  const propY = FLOOR_Y + TABLE.h + 24 + 16;
  const propGeos = { glass: [], water: [], cotton: [], wood: [], featherW: [], featherB: [] };
  // 小罐子（玻璃）+ 里面的棉球
  const jarAt = [TABLE.x + 120, propY + 90, TABLE.z - 150];
  propGeos.glass.push(place(new THREE.CylinderGeometry(76, 76, 180, high ? 20 : 14, 1, true), jarAt[0], jarAt[1], jarAt[2]));
  propGeos.cotton.push(place(new THREE.SphereGeometry(64, 16, 12), jarAt[0], jarAt[1] - 6, jarAt[2]));
  // 药水瓶（玻璃 + 里面的水）
  const vialAt = [TABLE.x + 210, propY + 78, TABLE.z + 120];
  propGeos.glass.push(place(new THREE.CylinderGeometry(34, 38, 150, 14, 1, true), vialAt[0], vialAt[1], vialAt[2]));
  propGeos.water.push(place(new THREE.CylinderGeometry(31, 34, 96, 14), vialAt[0], vialAt[1] - 22, vialAt[2]));
  // 鹅毛掸子：细杆 + 一小簇羽毛
  propGeos.wood.push(place(new THREE.CylinderGeometry(6, 8, 260, 8), TABLE.x - 190, propY + 150, TABLE.z + 150, [0, 0, 0.32]));
  for (let i = 0; i < 4; i++) {
    const g = place(
      new THREE.PlaneGeometry(90, 200, 1, 3),
      TABLE.x - 190 + Math.cos(i * 1.7) * 16,
      propY + 300,
      TABLE.z + 150 + Math.sin(i * 1.7) * 16,
      [(i - 1.5) * 0.12, i * 0.9, (i - 1.5) * 0.22]
    );
    propGeos[i % 3 === 0 ? "featherB" : "featherW"].push(g);
  }
  const propGroups = [
    ["PropsGlass", propGeos.glass, M.glass],
    ["PropsWater", propGeos.water, M.water],
    ["PropsCotton", propGeos.cotton, M.cotton],
    ["PropsWood", propGeos.wood, M.woodDark],
    ["PropsFeatherWhite", propGeos.featherW, M.featherWhite],
    ["PropsFeatherBrown", propGeos.featherB, M.featherBrown],
  ];
  for (const [name, geos, material] of propGroups) {
    if (!geos.length) continue;
    const merged = geos.length === 1 ? geos[0] : mergeSimple(THREE, geos);
    if (geos.length > 1) for (const g of geos) g.dispose();
    ownGeos.push(merged);
    const mesh = new THREE.Mesh(merged, material);
    mesh.name = name;
    // 小道具不投影：它们的阴影在画面里读不出来，却要多吃一次阴影 pass
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    group.add(mesh);
  }

  // ── 5.8 灯光 ──────────────────────────────────────────────────────
  const keyLight = new THREE.DirectionalLight(new THREE.Color(PALETTE.honey), LIGHTING.key);
  keyLight.name = "KeyLight";
  keyLight.castShadow = !low; // 低档关阴影，改用假阴影贴片
  keyLight.shadow.mapSize.set(high ? 2048 : 1024, high ? 2048 : 1024);
  keyLight.shadow.camera.near = 1;
  keyLight.shadow.camera.far = 5200;
  keyLight.shadow.camera.left = -1700;
  keyLight.shadow.camera.right = 1700;
  keyLight.shadow.camera.top = 1700;
  keyLight.shadow.camera.bottom = -1700;
  keyLight.shadow.bias = -0.0006;
  // normalBias 按世界单位走，房间是 3000mm 尺度，1.6mm 已经足够把自阴影痤疮压掉；
  // 再大就会让阴影"浮起来"（peter-panning），而且阴影 pass 的剔除范围也会变宽。
  keyLight.shadow.normalBias = 1.6;
  keyLight.shadow.radius = high ? 3 : 2;
  keyLight.shadow.camera.updateProjectionMatrix();
  group.add(keyLight);
  group.add(keyLight.target);

  const fillLight = new THREE.DirectionalLight(new THREE.Color(PALETTE.skyDeep), LIGHTING.fill);
  fillLight.name = "FillLight";
  fillLight.castShadow = false;
  group.add(fillLight);

  const rimLight = new THREE.DirectionalLight(new THREE.Color(PALETTE.honey), LIGHTING.rim);
  rimLight.name = "RimLight";
  rimLight.castShadow = false;
  group.add(rimLight);

  const hemi = new THREE.HemisphereLight(new THREE.Color(PALETTE.sky), new THREE.Color(PALETTE.wood), 0.6);
  hemi.name = "AmbientHemi";
  group.add(hemi);

  const ambient = new THREE.AmbientLight(new THREE.Color(PALETTE.cream), 0.3);
  ambient.name = "Ambient";
  group.add(ambient);

  // 纸灯的近场暖光（不太贵：一盏无阴影点光）
  const lampPoint = new THREE.PointLight(new THREE.Color(PALETTE.honey), 12, 2600, 1.7);
  lampPoint.name = "PaperLampLight";
  lampPoint.castShadow = false;
  lampPoint.position.set(HANG.x, HANG.y + 60, HANG.z);
  group.add(lampPoint);

  // 床头台灯（sleepy 的氛围主角）
  const deskPoint = new THREE.PointLight(new THREE.Color(PALETTE.honey), 0, 1400, 1.7);
  deskPoint.name = "DeskLampLight";
  deskPoint.castShadow = false;
  deskPoint.position.set(DESK.x, DESK.y + 360, DESK.z);
  group.add(deskPoint);

  const lights = {
    key: keyLight,
    fill: fillLight,
    rim: rimLight,
    hemi,
    ambient,
    lamp: lampPoint,
    desk: deskPoint,
  };

  // 低档假阴影贴片：榻下面一片压暗的软椭圆，替代真 shadowMap
  let fakeShadow = null;
  if (low) {
    const shadowTex = makeGlowTexture(THREE, 64, false);
    disposables.push(shadowTex);
    const sm = new THREE.MeshBasicMaterial({
      map: shadowTex,
      color: new THREE.Color(PALETTE.shadow),
      transparent: true,
      opacity: 0.28,
      depthWrite: false,
      blending: THREE.NormalBlending,
    });
    ownMats.push(sm);
    fakeShadow = new THREE.Mesh(new THREE.PlaneGeometry(BED.w + 420, BED.d + 420), sm);
    ownGeos.push(fakeShadow.geometry);
    fakeShadow.rotation.x = -Math.PI / 2;
    fakeShadow.position.set(BED.x, 46, BED.z);
    fakeShadow.name = "FakeShadow";
    group.add(fakeShadow);
  }

  // ── 5.9 微尘光点 ──────────────────────────────────────────────────
  const dust = MakeDustPoints(THREE, {
    count: dustCount != null ? dustCount : low ? 110 : high ? 320 : 220,
    radius: 1500,
    seed: 0x1337c0de,
    color: PALETTE.honey,
    colorHot: PALETTE.cream,
    opacity: 0.5,
  });
  dust.position.set(0, 0, 0);
  group.add(dust);

  // ── 5.10 氛围：当前值 → 目标值，用 lerp 平滑过渡 ─────────────────
  const MOODS = makeMoods();
  const cur = {
    keyI: 0,
    keyC: new THREE.Color(),
    fillI: 0,
    fillC: new THREE.Color(),
    rimI: 0,
    rimC: new THREE.Color(),
    hemiI: 0,
    hemiSky: new THREE.Color(),
    hemiGround: new THREE.Color(),
    ambI: 0,
    ambC: new THREE.Color(),
    lampI: 0,
    lampC: new THREE.Color(),
    deskI: 0,
    deskC: new THREE.Color(),
    dustOp: 0,
    fogNear: 2000,
    fogFar: 8000,
    rain: 0,
    sky: 0,
    curtain: 1,
    exposure: 1.1,
  };
  const tgt = Object.assign({}, cur);
  const keyPos = new THREE.Vector3();
  const keyPosT = new THREE.Vector3();
  let moodId = "teaRoom";
  let ready = false;
  let elapsed = 0;
  let shaftBase = 1.6;
  let bulbBase = 3.2;
  const bgColor = new THREE.Color(PALETTE.cream);

  function readMood(id) {
    const m = MOODS[id] || MOODS.teaRoom;
    tgt.keyI = m.key.intensity * LIGHTING.key;
    tgt.keyC.set(m.key.color);
    keyPosT.set(m.key.pos[0], m.key.pos[1], m.key.pos[2]);
    tgt.fillI = m.fill.intensity * LIGHTING.fill * 2; // 方向光的"补光"实际要提一点才看得出
    tgt.fillC.set(m.fill.color);
    tgt.rimI = m.rim.intensity * LIGHTING.rim;
    tgt.rimC.set(m.rim.color);
    tgt.hemiI = m.hemi.intensity;
    tgt.hemiSky.set(m.hemi.sky);
    tgt.hemiGround.set(m.hemi.ground);
    tgt.ambI = m.ambient.intensity;
    tgt.ambC.set(m.ambient.color);
    tgt.lampI = m.spot.intensity;
    tgt.lampC.set(m.spot.color);
    tgt.deskI = m.desk.intensity;
    tgt.deskC.set(m.desk.color);
    tgt.dustOp = m.dust.opacity;
    tgt.fogNear = m.fog.near;
    tgt.fogFar = m.fog.far;
    tgt.rain = m.rain;
    tgt.sky = m.sky.night;
    tgt.curtain = m.curtain;
    tgt.exposure = m.exposure;
    return m;
  }

  /** 切换氛围：改的是真光（位置/强度/色温）、窗外天空、雾、微尘、雨、窗帘摆速 */
  function setMood(id) {
    const m = readMood(id);
    moodId = MOODS[id] ? id : "teaRoom";
    bgColor.set(m.bg);
    fillLight.position.set(m.fill.pos[0], m.fill.pos[1], m.fill.pos[2]);
    rimLight.position.set(m.rim.pos[0], m.rim.pos[1], m.rim.pos[2]);
    lampPoint.distance = m.spot.distance || 2600;
    lampPoint.decay = m.spot.decay || 1.7;
    deskPoint.decay = 1.7;
    // 天空色调（用材质 color 染色，不用重建贴图）
    skyMatDay.color.set(m.sky.tint);
    skyMatNight.color.set(m.sky.tint);
    rainMesh.visible = m.rain > 0.5;
    if (!ready) {
      // 第一次：直接吃满目标值，避免开场从"全黑"淡入
      for (const k of Object.keys(cur)) {
        if (cur[k] && cur[k].isColor) cur[k].copy(tgt[k]);
        else cur[k] = tgt[k];
      }
      keyPos.copy(keyPosT);
      ready = true;
      applyCur();
    }
  }

  function applyCur() {
    keyLight.intensity = cur.keyI;
    keyLight.color.copy(cur.keyC);
    keyLight.position.copy(keyPos);
    fillLight.intensity = cur.fillI;
    fillLight.color.copy(cur.fillC);
    rimLight.intensity = cur.rimI;
    rimLight.color.copy(cur.rimC);
    hemi.intensity = cur.hemiI;
    hemi.color.copy(cur.hemiSky);
    hemi.groundColor.copy(cur.hemiGround);
    ambient.intensity = cur.ambI;
    ambient.color.copy(cur.ambC);
    lampPoint.intensity = cur.lampI;
    lampPoint.color.copy(cur.lampC);
    deskPoint.intensity = cur.deskI;
    deskPoint.color.copy(cur.deskC);
    dust.setOpacity(cur.dustOp);
    // 纸灯的发光体跟着灯强走，否则暗的时候灯罩还在发白。
    // 这里只算"基准亮度"，每帧的呼吸在 Update 里乘上去（不能让乘法自己叠上去）。
    // sleepy 这类暗场氛围要把灯罩压下去：不压的话灯罩自己把整个房间照亮，
    // "昏暗柔光"就变成了"亮堂的白天"。
    const k = Math.max(0.08, Math.min(1.15, cur.lampI / 14 + cur.deskI / 26));
    shaftBase = 0.3 + k * 1.05;
    bulbBase = 0.9 + k * 2.1;
    SHAFT.emissiveIntensity = shaftBase;
    BULB.emissiveIntensity = bulbBase;
    glowMat.opacity = 0.1 + k * 0.34;
    mistMat.opacity = cur.rain * 0.5;
    rainMat.opacity = 0.18 + cur.rain * 0.3;
    skyMatNight.opacity = cur.sky;
    skyMatDay.opacity = 1 - cur.sky;
    bgColor.set(MOODS[moodId].bg);
  }

  // ── 5.11 每帧更新：灯呼吸、窗帘摆、纸灯摇、雨、尘 ────────────────
  function Update(dt, ctx = {}) {
    const d = Math.min(0.05, Math.max(0, dt || 0));
    elapsed += d;
    const mood01 = typeof ctx.mood01 === "number" ? ctx.mood01 : 0;

    // 氛围过渡：0.6 秒左右的平滑，切换 mood 时不会"啪"地跳光
    const k = 1 - Math.pow(0.0025, d);
    cur.keyI = lerp(cur.keyI, tgt.keyI, k);
    cur.keyC.lerp(tgt.keyC, k);
    cur.fillI = lerp(cur.fillI, tgt.fillI, k);
    cur.fillC.lerp(tgt.fillC, k);
    cur.rimI = lerp(cur.rimI, tgt.rimI, k);
    cur.rimC.lerp(tgt.rimC, k);
    cur.hemiI = lerp(cur.hemiI, tgt.hemiI, k);
    cur.hemiSky.lerp(tgt.hemiSky, k);
    cur.hemiGround.lerp(tgt.hemiGround, k);
    cur.ambI = lerp(cur.ambI, tgt.ambI, k);
    cur.ambC.lerp(tgt.ambC, k);
    cur.lampI = lerp(cur.lampI, tgt.lampI, k);
    cur.lampC.lerp(tgt.lampC, k);
    cur.deskI = lerp(cur.deskI, tgt.deskI, k);
    cur.deskC.lerp(tgt.deskC, k);
    cur.dustOp = lerp(cur.dustOp, tgt.dustOp, k);
    cur.fogNear = lerp(cur.fogNear, tgt.fogNear, k);
    cur.fogFar = lerp(cur.fogFar, tgt.fogFar, k);
    cur.rain = lerp(cur.rain, tgt.rain, k);
    cur.sky = lerp(cur.sky, tgt.sky, k);
    cur.curtain = lerp(cur.curtain, tgt.curtain, k);
    cur.exposure = lerp(cur.exposure, tgt.exposure, k);
    keyPos.lerp(keyPosT, k);

    // 灯的"呼吸"：两盏纸灯各自一个很慢的正弦，幅度小到几乎察觉不到，
    // 但画面会一直"活着"。mood01 是外部情绪值（0 平静 → 1 兴奋），会加快节奏。
    const breathe = 1 + Math.sin(elapsed * 0.9) * 0.035 + Math.sin(elapsed * 2.3) * 0.012;
    const speedUp = 1 + mood01 * 0.5;
    cur.keyI *= breathe;
    // 主光轻微漂移：像窗外的云在动
    keyLight.position.x = keyPos.x + Math.sin(elapsed * 0.08) * 60;
    keyLight.position.y = keyPos.y + Math.sin(elapsed * 0.061 + 1.3) * 30;
    applyCur();
    keyLight.intensity = cur.keyI;
    lampPoint.intensity = cur.lampI * breathe;
    // 灯光目标点跟着房间中心，方向光才照得进屋子
    keyLight.target.position.set(0, 0, 0);
    keyLight.target.updateMatrixWorld();

    // 窗帘 / 纱帘
    for (const m of swayMats) {
      const u = m.userData.swayUniforms;
      u.uTime.value = elapsed;
      u.uSway.value = (m === tulleMat ? 1.0 : 0.42) * cur.curtain * speedUp;
    }

    // 纸灯摇曳（吊灯摆得最明显，落地灯与挂植物只是微微晃）
    for (const l of lamps) {
      const a = l.amp * (1 + mood01 * 0.4);
      const s = Math.sin(elapsed * l.speed * speedUp + l.base);
      if (l.rotOnly) {
        l.obj.rotation.z = s * a;
      } else if (l.axis === "z") {
        l.obj.rotation.z = s * a;
        l.obj.rotation.x = Math.cos(elapsed * l.speed * 0.77) * a * 0.5;
      } else {
        l.obj.rotation.x = s * a * 0.6;
      }
    }

    // 灯罩发光体的呼吸（纸灯"吸一口气"）。用基准值 × 呼吸系数，不做自乘。
    const flick = 1 + Math.sin(elapsed * 3.1) * 0.03 + Math.sin(elapsed * 7.7) * 0.012;
    SHAFT.emissiveIntensity = shaftBase * flick;
    BULB.emissiveIntensity = bulbBase * flick;

    // 窗外雨丝：竖直下落（带一点倾斜），落到窗台以下就回顶部
    if (rainMesh.visible) {
      const m4 = rainMesh.userData._m4 || (rainMesh.userData._m4 = new THREE.Matrix4());
      const q4 = rainMesh.userData._q4 || (rainMesh.userData._q4 = new THREE.Quaternion());
      const e4 = rainMesh.userData._e4 || (rainMesh.userData._e4 = new THREE.Euler());
      for (let i = 0; i < drops.length; i++) {
        const dr = drops[i];
        dr.y -= dr.speed * d * (0.6 + cur.rain * 0.6);
        if (dr.y < winB - 500) dr.y = winT + 700 + (i % 5) * 90;
        e4.set(0, 0, dr.tilt);
        q4.setFromEuler(e4);
        m4.compose(new THREE.Vector3(dr.x, dr.y, dr.z), q4, new THREE.Vector3(1, dr.len, 1));
        rainMesh.setMatrixAt(i, m4);
      }
      rainMesh.instanceMatrix.needsUpdate = true;
      rainMesh.material.opacity = 0.16 + cur.rain * 0.34;
    }

    // 微尘
    dust.Update(d);
    dust.rotation.y += d * 0.006;

    // 假阴影（低档）：跟着灯的方向稍微偏移，别像贴在底上的一块死斑
    if (fakeShadow) {
      fakeShadow.material.opacity = 0.14 + (cur.keyI / 2) * 0.2;
      fakeShadow.position.x = BED.x - keyPos.x * 0.012;
    }

    // 雾：房间不大，雾只用来托"空气感"，不做能见度
    return {
      exposure: cur.exposure,
      fog: { color: MOODS[moodId].fog.color, near: cur.fogNear, far: cur.fogFar },
      background: MOODS[moodId].bg,
    };
  }

  // ── 5.12 释放 ─────────────────────────────────────────────────────
  function dispose() {
    for (const g of ownGeos) g.dispose();
    for (const m of ownMats) m.dispose();
    for (const m of swayMats) if (m !== tulleMat && m !== drapeMat) m.dispose();
    for (const m of disposables) {
      if (m && m.isTexture) m.dispose();
      else if (m && m.dispose) m.dispose();
    }
    tulleMat.dispose();
    drapeMat.dispose();
    dust.dispose();
    group.clear();
    if (fakeShadow) fakeShadow.material.dispose();
    ownGeos.length = 0;
    ownMats.length = 0;
    swayMats.length = 0;
    disposables.length = 0;
  }

  setMood("teaRoom");

  // ── 落位约定：交给调用方的 landmarks ─────────────────────────────
  // 世界原点 = 耳道口。下面这几个数就是"房间是怎么围绕耳道排开的"，写出来是为了让
  // 上游（Script_Main / Script_Camera）不必再自己猜"躺面在哪个高度"。
  const lyingSurfaceY = FLOOR_Y + BED.top; // 床垫上表面（世界标高）
  const landmarks = {
    floorY: FLOOR_Y,
    lyingSurface: {
      x: ROOM_OFFSET.x + BED.x,
      y: lyingSurfaceY,
      z: ROOM_OFFSET.z + BED.z,
    },
    /** 原点周围必须保持空的水平半径（mm）：耳朵、镜头、任何贴上去的配件都靠它 */
    originKeepClearRadius: KEEP_CLEAR_R,
    /** 躺面相对原点的高度（mm，负值 = 在原点下方） */
    lyingSurfaceBelowOrigin: -lyingSurfaceY,
    /** 房间在世界里的范围，方便机位判断"人在不在屋里" */
    bounds: {
      min: { x: ROOM_OFFSET.x - ROOM.halfW - ROOM.wall, y: FLOOR_Y, z: ROOM_OFFSET.z - ROOM.halfD - ROOM.wall },
      max: { x: ROOM_OFFSET.x + ROOM.halfW + ROOM.wall, y: FLOOR_Y + ROOM.height, z: ROOM_OFFSET.z + ROOM.halfD + ROOM.wall },
    },
    ceilingY: FLOOR_Y + ROOM.height,
    /**
     * 自查：原点 KEEP_CLEAR_R 内不许有"贴上来的东西"。
     *
     * 为什么要逐顶点算而不是比包围盒：BuildRoom 大部分零件是合并过的，
     * 一块 RoomFurnitureDark 的包围盒跨越整间房、必然"包含原点"，用包围盒
     * 会报一堆假阳性，真正贴到耳朵上的那一块反而看不出来。
     * 这里取每个网格的世界坐标顶点样本，逐点算到原点的距离——
     * 墙、地板这种"把房间围起来"的东西自然就落在半径之外了。
     *
     * 躺面（床垫/被子/靠垫）是唯一的例外，而且**只允许在原点下方**：
     * 现实里耳朵就贴在垫子上，不能要求垫子离耳朵 350mm；但垫子必须整个低于
     * SETBACK_Y（原点下方 350mm）——躺着时垫子本来就在耳道口下方 150mm 上下，
     * 守得住；守不住说明整张床被放高了（这个坑踩过）。
     *
     * 枕头是**唯一**允许高过 SETBACK_Y 的：头枕在上面，枕面本来就在耳道口上下
     * 20~40mm 的真实高度上。把它也算违规的话，规则就自相矛盾了——
     * 真实采耳里耳朵就是贴着枕沿的，不存在"让耳朵离枕头 350mm"的躺法。
     *
     * 返回 { ok, offending, bedSurfaceAbove }，两个数组正常情况下都是空的。
     */
    auditKeepClear({ radius = KEEP_CLEAR_R, report = false } = {}) {
      // 躺面：允许近，但必须低于 SETBACK_Y。枕头单独一类（见上面的说明）。
      const BED_SURFACE = [/^Bedding$/, /^Cushion\d/];
      // 枕头在合并几何里的高度带：床面往上 20~230mm 那一段算枕头（头枕在上面）。
      // 被子会稍微高过床面（100mm 左右），它也在这个带里——被子在脚那一头，
      // 离原点 1.5m 以上，进不了 KEEP_CLEAR 半径，单独用 belowMesaLimit 报出来核对。
      const PILLOW_BAND = { lo: lyingSurfaceY + 20, hi: lyingSurfaceY + 230 };
      const MESA_LIMIT = lyingSurfaceY + 150; // 非枕头部分的躺面最高允许到这个高度
      group.updateMatrixWorld(true);
      const v = new THREE.Vector3();
      const offending = [];
      const bedSurfaceAbove = [];
      group.traverse((o) => {
        if (!o.isMesh && !o.isPoints && !o.isLine) return;
        const isBed = BED_SURFACE.some((re) => re.test(o.name || ""));
        const pos = o.geometry && o.geometry.getAttribute ? o.geometry.getAttribute("position") : null;
        if (!pos) return;
        const count = pos.count;
        const step = Math.max(1, Math.floor(count / 800)); // 每个网格最多采 800 个点
        let minDist = Infinity;
        let closest = null;
        let bedPeak = -Infinity;
        for (let i = 0; i < count; i += step) {
          v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld);
          if (v.y > SETBACK_Y) {
            const d = v.length();
            if (d < minDist) {
              minDist = d;
              closest = [Math.round(v.x * 10) / 10, Math.round(v.y * 10) / 10, Math.round(v.z * 10) / 10];
            }
          }
          if (isBed && (v.y < PILLOW_BAND.lo || v.y > PILLOW_BAND.hi) && v.y > bedPeak) bedPeak = v.y;
        }
        if (isBed) {
          if (Number.isFinite(bedPeak) && bedPeak > MESA_LIMIT) {
            const box = new THREE.Box3().setFromObject(o);
            bedSurfaceAbove.push({
              name: o.name || o.type,
              highestY: Math.round(bedPeak * 10) / 10,
              limit: MESA_LIMIT,
              min: box.min.toArray().map((n) => Math.round(n * 10) / 10),
              max: box.max.toArray().map((n) => Math.round(n * 10) / 10),
            });
          }
        } else if (Number.isFinite(minDist) && minDist < radius) {
          const box = new THREE.Box3().setFromObject(o);
          offending.push({
            name: o.name || o.type,
            minDist: Math.round(minDist * 100) / 100,
            at: closest,
            min: box.min.toArray().map((n) => Math.round(n * 10) / 10),
            max: box.max.toArray().map((n) => Math.round(n * 10) / 10),
          });
        }
      });
      offending.sort((a, b) => a.minDist - b.minDist);
      bedSurfaceAbove.sort((a, b) => b.highestY - a.highestY);
      const out = {
        radius,
        setbackY: SETBACK_Y,
        lyingSurfaceY,
        pillowBand: PILLOW_BAND,
        mesaLimit: MESA_LIMIT,
        offending, // 应为空：这个半径内不许有除躺面/枕头以外的房间几何
        bedSurfaceAbove, // 应为空：非枕头部分的躺面不得高过 mesaLimit
        ok: offending.length === 0 && bedSurfaceAbove.length === 0,
      };
      if (report && !out.ok) {
        console.warn("[EarSpaRoom] 原点保持空自查未通过：", JSON.stringify(out));
      }
      return out;
    },
  };

  // 建完就自查一遍：把"耳道被房间包住"这类问题在开发期就打出来，
  // 不要去等验收射线发现（那时已经很难倒推是哪一块几何）。
  landmarks.auditKeepClear({ report: true });

  return {
    group,
    lights,
    ambient,
    setMood,
    Update,
    dispose,
    landmarks,
    /** 额外给验收/调试用（不在契约里，但只增不改） */
    mood: () => moodId,
    moods: MOOD_IDS,
    dust,
  };
}

export default BuildRoom;
