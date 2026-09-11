// Script_Tools.js —— 全套专业采耳工具的程序化几何。
//
// 契约（Data_Contract.md §5.5）：
//   BuildTool(THREE_unused, { id, materials, quality }) -> { group, spec, tip, tipRadius, axis, Update, dispose }
//   ToolIds() -> string[]
//
// 本文件的四条硬规矩：
//  1. **模块顶层零副作用**：不碰 document / window / navigator。CanvasTexture 全部在工厂函数里懒建。
//  2. **工具局部 +Z = 指向耳道深处**，tip 精确落在 (0, 0, +lengthMm/2) 附近。
//  3. **只做程序化建模**：Lathe / Tube / Extrude / 参数曲面 / InstancedMesh，不引用外部模型。
//  4. **像真的，不是圆柱加球**：竹子的节与竹青、不锈钢的拉丝与薄刃、多余的齿一律圆钝、
//     羽毛要有羽轴与羽枝层次、马尾要几十根且顶端散开、棉签要有绒毛。宁可少做几件也不做假的。
//
// 三角面预算：单件 ≤ 6k，二十件合计 ≤ 40k（quality 三档真实影响分段数与实例数）。

import * as THREE from "three";
import { PALETTE } from "./Data_Palette.mjs?v=ear005-20260911";
import { EAR_TOOLS, EAR_TOOL_BY_ID } from "./Data_EarTools.mjs?v=ear005-20260911";

// ── quality 三档：直接决定分段数、实例数与可选部件，不是「摆设参数」──
const QUALITY_LEVELS = {
  low: { seg: 10, ring: 5, featherBarbs: 40, hairCount: 24, fuzz: 0, droplets: 2, scoopStations: 5, scoopPerim: 7, extra: false },
  mid: { seg: 18, ring: 8, featherBarbs: 88, hairCount: 40, fuzz: 40, droplets: 4, scoopStations: 7, scoopPerim: 11, extra: true },
  high: { seg: 28, ring: 12, featherBarbs: 148, hairCount: 56, fuzz: 90, droplets: 6, scoopStations: 9, scoopPerim: 15, extra: true },
};

function QualityOf(quality) {
  return QUALITY_LEVELS[quality] || QUALITY_LEVELS.mid;
}

// ── 材质：优先取调用方给的（Script_Materials），取不到就用 PALETTE 现场造一份 ──
function MakeMaterialKit(THREE_ref, materials) {
  const made = new Map();   // 本工具自己造的材质，dispose 时要释放
  const textures = [];

  const Get = (key, params) => {
    // ① 调用方传了同名材质且是真的 three 材质 —— 直接用（不拥有，不释放）
    const given = materials && materials[key];
    if (given && given.isMaterial) return given;
    // ② 现场造一份并缓存（同一把工具里多次取同名只造一个）
    if (made.has(key)) return made.get(key);
    const mat = new THREE_ref.MeshStandardMaterial(params);
    made.set(key, mat);
    return mat;
  };

  // 竹：竹青偏绿黄、有节、有纵向维管束纹理
  const bambooTexture = MakeBambooTexture(THREE_ref);
  textures.push(bambooTexture);
  // 不锈钢：拉丝方向沿杆长（U 是环向，所以纹理的横条就是拉丝）
  const brushedTexture = MakeBrushedTexture(THREE_ref);
  textures.push(brushedTexture);

  return {
    made,
    textures,
    bamboo: (extra) => Get("bamboo", {
      color: new THREE_ref.Color(PALETTE.bamboo), roughness: 0.62, metalness: 0.0,
      map: bambooTexture, ...extra,
    }),
    bambooDeep: (extra) => Get("bambooDeep", {
      color: new THREE_ref.Color(PALETTE.bambooDeep), roughness: 0.7, metalness: 0.0,
      map: bambooTexture, ...extra,
    }),
    wood: (extra) => Get("wood", {
      color: new THREE_ref.Color(PALETTE.wood), roughness: 0.68, metalness: 0.0, ...extra,
    }),
    woodDeep: (extra) => Get("woodDeep", {
      color: new THREE_ref.Color(PALETTE.woodDeep), roughness: 0.72, metalness: 0.0, ...extra,
    }),
    steel: (extra) => Get("steel", {
      color: new THREE_ref.Color(PALETTE.steel), roughness: 0.34, metalness: 0.94,
      map: brushedTexture, ...extra,
    }),
    // 镜面抛光件：勺头内凹面、刀刃、镊尖
    steelMirror: (extra) => Get("steelMirror", {
      color: new THREE_ref.Color(PALETTE.steel), roughness: 0.08, metalness: 1.0, ...extra,
    }),
    steelWarm: (extra) => Get("steelWarm", {
      color: new THREE_ref.Color(PALETTE.steelWarm), roughness: 0.26, metalness: 0.96,
      map: brushedTexture, ...extra,
    }),
    steelDark: (extra) => Get("steelDark", {
      color: new THREE_ref.Color(PALETTE.steelDeep), roughness: 0.45, metalness: 0.85, ...extra,
    }),
    featherWhite: (extra) => Get("featherWhite", {
      color: new THREE_ref.Color(PALETTE.featherWhite), roughness: 0.85, metalness: 0.0,
      side: THREE_ref.DoubleSide, ...extra,
    }),
    featherBrown: (extra) => Get("featherBrown", {
      color: new THREE_ref.Color(PALETTE.featherBrown), roughness: 0.82, metalness: 0.0,
      side: THREE_ref.DoubleSide, ...extra,
    }),
    horsehair: (extra) => Get("horsehair", {
      color: new THREE_ref.Color(PALETTE.horsehair), roughness: 0.5, metalness: 0.05, ...extra,
    }),
    cotton: (extra) => Get("cotton", {
      color: new THREE_ref.Color(PALETTE.cotton), roughness: 0.98, metalness: 0.0, ...extra,
    }),
    glass: (extra) => Get("glass", {
      color: new THREE_ref.Color(PALETTE.glass), roughness: 0.14, metalness: 0.0,
      transparent: true, opacity: 0.55, ...extra,
    }),
    water: (extra) => Get("water", {
      color: new THREE_ref.Color(PALETTE.water), roughness: 0.05, metalness: 0.0,
      transparent: true, opacity: 0.82, ...extra,
    }),
    rubber: (extra) => Get("rubber", {
      color: new THREE_ref.Color(PALETTE.skyDeep), roughness: 0.9, metalness: 0.0, ...extra,
    }),
    // 灯/镜头用的自发光件
    glow: (extra) => Get("glow", {
      color: new THREE_ref.Color(PALETTE.honey), emissive: new THREE_ref.Color(PALETTE.honey),
      emissiveIntensity: 1.4, roughness: 0.3, metalness: 0.0, ...extra,
    }),
  };
}

// 程序化竹纹：横向深色节环 + 纵向维管束条纹。只在工厂函数里建，模块顶层不碰 canvas。
function MakeBambooTexture(THREE_ref) {
  const W = 64, H = 256;
  const canvas = document.createElement("canvas");
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = PALETTE.bamboo;
  ctx.fillRect(0, 0, W, H);
  const rng = MakeLocalRng(0x9e37);
  // 纵向维管束：细微的深浅条纹
  for (let i = 0; i < 34; i++) {
    const x = Math.floor(rng() * W);
    const dark = rng() > 0.45;
    ctx.fillStyle = dark ? HexAlpha(PALETTE.bambooDeep, 0.16) : HexAlpha(PALETTE.cream, 0.13);
    ctx.fillRect(x, 0, 1 + (rng() > 0.7 ? 1 : 0), H);
  }
  // 竹节：横向的深环，节上下各有一道浅色高光（真实竹节是凸起的）
  const nodes = [0.22, 0.47, 0.72];
  for (const v of nodes) {
    const y = Math.floor(v * H);
    ctx.fillStyle = HexAlpha(PALETTE.bambooDeep, 0.55);
    ctx.fillRect(0, y - 2, W, 3);
    ctx.fillStyle = HexAlpha(PALETTE.cream, 0.4);
    ctx.fillRect(0, y + 1, W, 2);
  }
  const tex = new THREE_ref.CanvasTexture(canvas);
  tex.wrapS = THREE_ref.RepeatWrapping;
  tex.wrapT = THREE_ref.ClampToEdgeWrapping;
  tex.colorSpace = THREE_ref.SRGBColorSpace;
  return tex;
}

// 程序化拉丝金属：沿 U（环向）的细密明暗条 —— 车削/拉丝留下的纹路
function MakeBrushedTexture(THREE_ref) {
  const W = 128, H = 32;
  const canvas = document.createElement("canvas");
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = PALETTE.steel;
  ctx.fillRect(0, 0, W, H);
  const rng = MakeLocalRng(0x51ed);
  for (let i = 0; i < 150; i++) {
    const v = rng();
    ctx.fillStyle = v > 0.5 ? HexAlpha(PALETTE.steelDeep, 0.1 + rng() * 0.16) : HexAlpha(PALETTE.white, 0.1 + rng() * 0.2);
    ctx.fillRect(0, Math.floor(rng() * H), W, 1);
  }
  const tex = new THREE_ref.CanvasTexture(canvas);
  tex.wrapS = THREE_ref.RepeatWrapping;
  tex.wrapT = THREE_ref.RepeatWrapping;
  tex.colorSpace = THREE_ref.SRGBColorSpace;
  return tex;
}

// 纹理内部的确定性随机：不用 Math.random，保证同一把工具每次生成一模一样
function MakeLocalRng(seed) {
  let s = seed >>> 0;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

function HexAlpha(hex, alpha) {
  const n = hex.replace("#", "");
  const r = parseInt(n.slice(0, 2), 16);
  const g = parseInt(n.slice(2, 4), 16);
  const b = parseInt(n.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// ── 几何工具函数 ───────────────────────────────────────────────

// 把一组几何合并成一个（自己实现，避免依赖 three/addons）
function MergeGeometries(THREE_ref, geometries) {
  const list = geometries.filter(Boolean);
  if (list.length === 0) return null;
  if (list.length === 1) return list[0];
  let vertexCount = 0, indexCount = 0;
  for (const g of list) {
    vertexCount += g.attributes.position.count;
    indexCount += g.index ? g.index.count : g.attributes.position.count;
  }
  const position = new Float32Array(vertexCount * 3);
  const normal = new Float32Array(vertexCount * 3);
  const uv = new Float32Array(vertexCount * 2);
  const index = vertexCount > 65535 ? new Uint32Array(indexCount) : new Uint16Array(indexCount);
  let vOff = 0, iOff = 0;
  for (const g of list) {
    const pos = g.attributes.position;
    const nor = g.attributes.normal;
    const tex = g.attributes.uv;
    position.set(pos.array.subarray(0, pos.count * 3), vOff * 3);
    if (nor) normal.set(nor.array.subarray(0, nor.count * 3), vOff * 3);
    if (tex) uv.set(tex.array.subarray(0, tex.count * 2), vOff * 2);
    if (g.index) {
      for (let i = 0; i < g.index.count; i++) index[iOff + i] = g.index.array[i] + vOff;
      iOff += g.index.count;
    } else {
      for (let i = 0; i < pos.count; i++) index[iOff + i] = i + vOff;
      iOff += pos.count;
    }
    vOff += pos.count;
  }
  const out = new THREE_ref.BufferGeometry();
  out.setAttribute("position", new THREE_ref.BufferAttribute(position, 3));
  out.setAttribute("normal", new THREE_ref.BufferAttribute(normal, 3));
  out.setAttribute("uv", new THREE_ref.BufferAttribute(uv, 2));
  out.setIndex(new THREE_ref.BufferAttribute(index, 1));
  return out;
}

// 参数曲面：s(u,v) -> Vector3。用于勺头（内凹面 + 薄刃）、羽毛、刀壳这类非回转体。
function SurfaceGeometry(THREE_ref, sampler, uSeg, vSeg, opts = {}) {
  const { uClosed = false, vClosed = false } = opts;
  const uCount = uSeg + 1, vCount = vSeg + 1;
  const position = new Float32Array(uCount * vCount * 3);
  const uv = new Float32Array(uCount * vCount * 2);
  const tmp = new THREE_ref.Vector3();
  for (let i = 0; i < uCount; i++) {
    const u = uSeg === 0 ? 0 : i / uSeg;
    for (let j = 0; j < vCount; j++) {
      const v = vSeg === 0 ? 0 : j / vSeg;
      sampler(u, v, tmp);
      const k = (i * vCount + j) * 3;
      position[k] = tmp.x; position[k + 1] = tmp.y; position[k + 2] = tmp.z;
      const k2 = (i * vCount + j) * 2;
      uv[k2] = u; uv[k2 + 1] = v;
    }
  }
  const idx = [];
  const uMax = uClosed ? uCount : uCount - 1;
  const vMax = vClosed ? vCount : vCount - 1;
  for (let i = 0; i < uMax; i++) {
    const i0 = i % uCount, i1 = (i + 1) % uCount;
    for (let j = 0; j < vMax; j++) {
      const j0 = j % vCount, j1 = (j + 1) % vCount;
      const a = i0 * vCount + j0, b = i1 * vCount + j0, c = i1 * vCount + j1, d = i0 * vCount + j1;
      idx.push(a, b, d, b, c, d);
    }
  }
  const g = new THREE_ref.BufferGeometry();
  g.setAttribute("position", new THREE_ref.BufferAttribute(position, 3));
  g.setAttribute("uv", new THREE_ref.BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// 沿 Z 轴的平滑弯曲：把几何整体偏移，做出「手工削出来的杆不是绝对直」的感觉。
// 位移量按 z 归一化，端点归零，避免把 tip 顶歪。
function BendAlongZ(THREE_ref, geometry, zMin, zMax, ampY, ampX, freq) {
  const pos = geometry.attributes.position;
  const span = zMax - zMin || 1;
  for (let i = 0; i < pos.count; i++) {
    const z = pos.getZ(i);
    const t = (z - zMin) / span;
    const s = Math.sin(t * Math.PI) * Math.sin(t * Math.PI);   // 两端归零
    pos.setY(i, pos.getY(i) + Math.sin(t * Math.PI * freq) * ampY * s);
    pos.setX(i, pos.getX(i) + Math.sin(t * Math.PI * freq * 0.7 + 1.1) * ampX * s);
  }
  pos.needsUpdate = true;
  geometry.computeVertexNormals();
  return geometry;
}

// 竹/木杆：带竹节的回转体 + 轻微弯曲。竹节是真的凸起（半径局部放大），不是贴图画的。
function MakeNodeRod(THREE_ref, { length, r0, r1, seg, nodes, nodeBump, curveAmp }) {
  const steps = Math.max(10, Math.round(seg * 0.9));
  const profile = [];
  // 握持端收细 → 中段匀 → 前端收细（真实竹签两头细中间粗）
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const taper = r1 + (r0 - r1) * Math.pow(t, 0.85);
    const tipNarrow = 1 - 0.22 * Math.pow(t, 3.2);         // 前端削细
    let r = taper * tipNarrow;
    for (const nt of nodes) {
      const d = Math.abs(t - nt);
      if (d < 0.035) r += nodeBump * (1 - d / 0.035);       // 竹节凸起
    }
    profile.push(new THREE_ref.Vector2(Math.max(0.02, r), t * length));
  }
  const g = new THREE_ref.LatheGeometry(profile, seg);
  // Lathe 绕 Y 轴生成，转到 Z 轴；V 坐标沿杆长，正好让竹纹贴图对齐
  g.rotateX(Math.PI / 2);
  g.translate(0, 0, -length / 2);
  if (curveAmp) BendAlongZ(THREE_ref, g, -length / 2, length / 2, curveAmp, curveAmp * 0.35, 1.6);
  return g;
}

// 勺头：手掌削出来的浅凹勺。内凹面真的凹，边缘真的薄，唇口有一道反光。
// 轮廓由「唇口线 → 薄刃 → 外弧」组成，沿 y（工具长度方向）放样若干站位。
// 局部坐标：x = 横向(宽)，y = 沿工具长度(向 tip)，z = 径向进深(凹面朝 -z，贴耳壁的一侧)
function MakeScoopHead(THREE_ref, {
  width, length, depth, rimH, stations, perim, concavePow = 1.9,
}) {
  // 唇口轮廓：k ∈ [-1, 1] 横跨勺头宽度
  const rimInner = [];   // (y, z) 内凹面上沿
  const rimOuter = [];   // (y, z) 外侧刃背
  const halfW = width / 2;
  for (let j = 0; j < perim; j++) {
    const k = -1 + (2 * j) / (perim - 1);
    const y = k * halfW;
    const profile = Math.pow(Math.max(0, 1 - k * k), 0.55);   // 中部饱满、两端收尖
    const shape = Math.pow(profile, concavePow);
    rimInner.push([y, depth * shape]);
    rimOuter.push([y, depth * shape - rimH]);
  }
  // 把 (k, 站位) 映射成三维点：站位 t 从颈(0) 到舌尖(1)
  const sample = (t, k, surface) => {
    const profile = Math.pow(Math.max(0, 1 - k * k), 0.55);
    const shape = Math.pow(profile, concavePow);
    // 舌尖收窄成圆头，颈部稍宽
    const wide = (0.62 + 0.38 * Math.sin(Math.PI * Math.pow(t, 0.62))) * (t > 0.9 ? (1 - (t - 0.9) * 4) : 1);
    const x = k * halfW * Math.max(0.12, wide);
    const y = length * t;
    // 沿长度的凹陷分布：颈浅、中深、舌尖略收
    const along = Math.sin(Math.PI * Math.pow(t, 0.75)) * (1 - 0.35 * Math.pow(t, 3));
    const zc = depth * shape * along;
    const zo = zc - rimH * (0.35 + 0.65 * shape);
    return surface === "inner" ? zc : zo;
  };
  // 网格：v 方向走一圈轮廓 = 内凹面(perim) + 外周(perim) + 外弧(perim)
  const loopCount = perim * 3;
  const uvFromIndex = (j) => {
    // j: 0..perim-1 内凹面；perim..2perim-1 外周刃；2perim..3perim-1 外侧弧背
    if (j < perim) return { surface: "inner", k: -1 + (2 * j) / (perim - 1), edge: false };
    if (j < perim * 2) return { surface: "rim", k: -1 + (2 * (j - perim)) / (perim - 1), edge: true };
    return { surface: "outer", k: -1 + (2 * (j - perim * 2)) / (perim - 1), edge: false };
  };
  const geo = SurfaceGeometry(THREE_ref, (u, v, out) => {
    const t = u;
    const { surface, k, edge } = uvFromIndex(Math.min(loopCount - 1, Math.round(v * (loopCount - 1))));
    const profile = Math.pow(Math.max(0, 1 - k * k), 0.55);
    const shape = Math.pow(profile, concavePow);
    const wide = (0.62 + 0.38 * Math.sin(Math.PI * Math.pow(t, 0.62))) * (t > 0.9 ? (1 - (t - 0.9) * 3.2) : 1);
    const x = k * halfW * Math.max(0.1, wide);
    const y = length * t;
    const along = Math.sin(Math.PI * Math.pow(Math.max(0.0001, t), 0.75)) * (1 - 0.35 * Math.pow(t, 3));
    if (surface === "inner") {
      // 内凹面：中心最深，朝 -z 凹进去
      out.set(x, y, -depth * shape * along);
    } else if (surface === "rim") {
      // 薄刃：从内凹面唇口过渡到外侧，厚度只有 rimH
      out.set(x, y, -depth * shape * along - rimH);
    } else {
      // 外弧：勺背微微凸起
      out.set(x, y, -depth * shape * along - rimH - 0.12 * rimH * (1 - shape));
    }
    return out;
  }, stations, loopCount - 1, { uClosed: false, vClosed: true });
  geo.translate(0, -length / 2, 0);   // 让勺头以自身中心为原点
  return geo;
}

// 圆钝齿（真实器械的齿一律是钝的，绝不能做成尖刺）
function MakeBluntTooth(THREE_ref, { length, r, seg, curveZ = 0 }) {
  const steps = 5;
  const profile = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    // 齿身等粗，只有最末端收成半球
    const rr = t > 0.82 ? r * Math.cos(((t - 0.82) / 0.18) * (Math.PI / 2)) : r;
    profile.push(new THREE_ref.Vector2(Math.max(0.001, rr), t * length));
  }
  const g = new THREE_ref.LatheGeometry(profile, Math.max(6, Math.round(seg * 0.5)));
  g.rotateX(Math.PI / 2);
  g.translate(0, 0, -length / 2);
  if (curveZ) {
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const t = (pos.getZ(i) + length / 2) / length;
      pos.setY(i, pos.getY(i) + curveZ * t * t);
    }
    pos.needsUpdate = true;
    g.computeVertexNormals();
  }
  return g;
}

// 一根羽毛/毛：羽轴 + 两排羽枝。羽枝用实例化薄片，带层次感。
// 返回 { rachis, barbs(InstancedMesh), barbsData } —— barbsData 供 Update 做顶点级摆动。
function MakeFeather(THREE_ref, { rachisLength, barbLength, barbs, rows, mat, taper }) {
  const rachis = new THREE_ref.CylinderGeometry(0.16, 0.34, rachisLength, 6, 4);
  rachis.rotateX(Math.PI / 2);
  // 羽轴自身带一点点弧度
  const rp = rachis.attributes.position;
  for (let i = 0; i < rp.count; i++) {
    const t = (rp.getZ(i) + rachisLength / 2) / rachisLength;
    rp.setY(i, rp.getY(i) + 0.5 * t * t);
  }
  rp.needsUpdate = true;
  rachis.computeVertexNormals();

  // 羽枝：一片细长的薄片（4 顶点 2 三角），顶端收尖
  const blade = SurfaceGeometry(THREE_ref, (u, v, out) => {
    const w = (1 - Math.pow(v, 1.5)) * 0.5;
    out.set((u - 0.5) * 2 * w, 0, v);
    return out;
  }, 1, 3);
  blade.scale(1, 1, barbLength);
  blade.translate(0, 0, 0.35);

  const inst = new THREE_ref.InstancedMesh(blade, mat, Math.max(1, barbs * rows));
  inst.instanceMatrix.setUsage(THREE_ref.DynamicDrawUsage);
  const barbsData = [];
  const rng = MakeLocalRng(0x2f1b);
  let n = 0;
  for (let r = 0; r < rows; r++) {
    for (let i = 0; i < barbs; i++) {
      const t = (i + 0.5) / barbs;
      // 羽片在羽轴上螺旋排布（真实羽毛的两排羽枝略错开）
      const ang = t * Math.PI * 2 * 1.6 + r * (Math.PI / rows);
      const rootZ = rachisLength * (t * 0.94) - rachisLength * 0.47;
      const lift = taper ? (1 - Math.pow(Math.abs(t - 0.42) * 1.5, 2)) : 1;
      const len = barbLength * (0.45 + 0.55 * Math.max(0.12, lift));
      barbsData.push({ ang, rootZ, len, rot: (t - 0.5) * 0.5, jitter: rng() * 0.25 });
      n++;
      if (n >= inst.count) break;
    }
    if (n >= inst.count) break;
  }
  return { rachis, barbs: inst, barbsData, blade };
}

// 几十根马尾：合并成一整块几何（一次 draw call），顶点级弯曲在 Update 里做。
function MakeHairBundle(THREE_ref, { count, hairLength, radius, mat, seg }) {
  const rng = MakeLocalRng(0x77c1);
  const parts = [];
  const total = hairLength;
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + rng() * 0.5;
    // 顶端散开：越靠外的毛越向侧面撇
    const spread = 0.35 + rng() * 1.0;
    const steps = 7;
    const profile = [];
    const taper = 0.55 + rng() * 0.5;
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      // 马尾是实心细丝，中段略粗、顶端收细
      const r = radius * (1 - 0.4 * Math.pow(t, 2)) * taper;
      profile.push(new THREE_ref.Vector2(Math.max(0.004, r), t * total * (0.82 + rng() * 0.36)));
    }
    const g = new THREE_ref.LatheGeometry(profile, 4);
    g.rotateX(Math.PI / 2);
    const len = profile[profile.length - 1].y;
    g.translate(0, 0, -len / 2);
    // 让毛从束根（-z 端）出发，向 +z 伸展并向外散开
    const pos = g.attributes.position;
    const dirX = Math.cos(a) * spread, dirY = Math.sin(a) * spread;
    for (let k = 0; k < pos.count; k++) {
      const z = pos.getZ(k);
      const t = (z + len / 2) / len;
      const s = t * t;                       // 根部不散、梢部散
      pos.setX(k, pos.getX(k) + dirX * s * 3.4);
      pos.setY(k, pos.getY(k) + dirY * s * 3.4);
    }
    pos.needsUpdate = true;
    g.translate(0, 0, len / 2);
    parts.push(g);
  }
  const merged = MergeGeometries(THREE_ref, parts);
  for (const p of parts) p.dispose();
  merged.computeVertexNormals();
  return merged;
}

// 羽毛/毛的顶点级摆动：整体绕 Z 旋转 + 梢部向侧面甩。真正动顶点，不是整块 mesh 转。
// 注意 zSpan 用几何**自身**的 z 范围，不能用归位后的整体范围——否则根部也被甩歪。
function MakeSwayDeformer(THREE_ref, geo, { spin, swipe, axis = "z" }) {
  const base = geo.attributes.position.array.slice();
  const posAttr = geo.attributes.position;
  geo.computeBoundingBox();
  const zSpan = [geo.boundingBox.min.z, geo.boundingBox.max.z];
  return (phase, speed01, active01) => {
    const arr = posAttr.array;
    const spinA = phase * 6.0 * (0.25 + speed01);
    const swipeA = Math.sin(phase * 5.2) * 0.16 * active01 * (0.5 + speed01);
    const z0 = zSpan[0], z1 = zSpan[1];
    const span = z1 - z0 || 1;
    const cs = Math.cos(spinA), sn = Math.sin(spinA);
    for (let i = 0; i < posAttr.count; i++) {
      const i3 = i * 3;
      const x = base[i3], y = base[i3 + 1], z = base[i3 + 2];
      const t = (z - z0) / span;              // 0 根 → 1 梢
      const s = t * t * (0.35 + 0.65 * t);    // 梢部摆得最厉害
      const sx = swipeA * s;
      let rx = x, ry = y;
      if (axis === "z") {
        rx = x * cs - y * sn; ry = x * sn + y * cs;
      }
      arr[i3] = rx + sx * 9.5;
      arr[i3 + 1] = ry + sx * 3.0;
      arr[i3 + 2] = z + swipeA * s * 1.6;
    }
    posAttr.needsUpdate = true;
    geo.computeVertexNormals();
  };
}

// 上下开合：绕 (0, hingeY, hingeZ) 在 YZ 平面旋转 —— 镊臂绕铰点越往前张得越大，
// x 不变。这样「捏合」是真的把两片镊臂转合上，不是整块 mesh 平移。
function MakeJawHingeDeformer(geo, hingeY, hingeZ, sign, maxAngle) {
  const base = geo.attributes.position.array.slice();
  const posAttr = geo.attributes.position;
  return (amount01) => {
    const arr = posAttr.array;
    const a = sign * Math.max(0, Math.min(1, amount01)) * maxAngle;
    const cs = Math.cos(a), sn = Math.sin(a);
    for (let i = 0; i < posAttr.count; i++) {
      const i3 = i * 3;
      const y = base[i3 + 1] - hingeY;
      const z = base[i3 + 2] - hingeZ;
      arr[i3] = base[i3];
      arr[i3 + 1] = hingeY + y * cs - z * sn;
      arr[i3 + 2] = hingeZ + y * sn + z * cs;
    }
    posAttr.needsUpdate = true;
    geo.computeVertexNormals();
  };
}

// 剪刀的开合：绕 (hingeX, hingeY, hingeZ) 在 XY 平面旋转（刀刃沿 z 伸出，所以 XY 里转
// 就等于两片刀刃上下分开）。两片给相反的 sign。
// 注：MakeScissorDeformer 就是上面的 MakeJawHingeDeformer 在 YZ 平面的对偶，单独实现是为
// 了让剪刀的刀刃真的上下分开，而不是绕同一条轴转。

// ── 各部件的建模函数（每个都返回 { parts: [{geo, mat}], extras }）──

// 竹耳勺：竹节纹理的杆（轻微弯曲）+ 手工削出来的勺头（有薄刃和弧度）+ 握持端收细
function BuildEarPickBamboo(THREE_ref, kit, q, seed) {
  const parts = [];
  const shaftLen = 116, scoopLen = 7, scoopW = 3.0, scoopD = 0.8;
  // 杆：竹子，带节、带弯
  const rod = MakeNodeRod(THREE_ref, {
    length: shaftLen, r0: 2.5, r1: 1.15, seg: q.seg,
    nodes: [0.24, 0.5, 0.76], nodeBump: 0.16, curveAmp: 0.55,
  });
  rod.translate(0, 0, -shaftLen / 2 - 2);
  parts.push({ geo: rod, mat: kit.bamboo() });

  // 勺颈：从杆前端收细过渡到勺头
  const neck = new THREE_ref.CylinderGeometry(1.15, 1.0, 6, q.seg, 1);
  neck.rotateX(Math.PI / 2);
  neck.translate(0, 0, 1);
  parts.push({ geo: neck, mat: kit.bambooDeep() });

  // 勺头：手工削的浅凹勺，薄刃 + 弧度
  const scoop = MakeScoopHead(THREE_ref, {
    width: scoopW, length: scoopLen, depth: scoopD, rimH: 0.22,
    stations: q.scoopStations, perim: q.scoopPerim,
  });
  scoop.rotateZ(Math.PI);              // 凹面朝上（-z 一侧 → 贴耳壁）
  scoop.rotateX(-Math.PI / 2);          // 勺头的「长度」方向转到 +z
  scoop.translate(0, 0, 4 + scoopLen / 2 - 2.5);
  parts.push({ geo: scoop, mat: kit.bamboo() });
  // 勺头唇口的高光条：手工削出来的刃口是竹子最亮的地方
  const lip = new THREE_ref.TorusGeometry(scoopW / 2, 0.075, 4, Math.max(8, q.seg));
  lip.rotateX(Math.PI / 2);
  lip.scale(1, 1, 0.28);
  lip.translate(0, 0, 4 + scoopLen - 2.5);
  parts.push({ geo: lip, mat: kit.bambooDeep() });

  return { parts, tipZ: 4 + scoopLen - 2.5 + 0.4, spin: true };
}

// 不锈钢耳勺：拉丝金属杆、镜面勺头、极薄反光刃
function BuildEarPickSteel(THREE_ref, kit, q) {
  const parts = [];
  const shaftLen = 118;
  // 杆：车削出来的等径细杆，握持端有滚花段
  const prof = [];
  const steps = 14;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    let r = 2.35 - 1.25 * Math.pow(t, 0.7);
    if (t < 0.18) r = 2.35 + 0.08 * Math.sin((t / 0.18) * Math.PI * 6);  // 握持端滚花
    if (t > 0.93) r = 1.1 - (t - 0.93) * 6;                              // 前端收成细颈
    prof.push(new THREE_ref.Vector2(Math.max(0.35, r), t * shaftLen));
  }
  const rod = new THREE_ref.LatheGeometry(prof, q.seg);
  rod.rotateX(Math.PI / 2);
  rod.translate(0, 0, -12);
  parts.push({ geo: rod, mat: kit.steel() });

  // 勺头：薄金属浅碗，镜面
  const scoopLen = 16, scoopW = 4.8;
  const scoop = MakeScoopHead(THREE_ref, {
    width: scoopW, length: scoopLen, depth: 1.35, rimH: 0.13,
    stations: q.scoopStations, perim: q.scoopPerim, concavePow: 2.1,
  });
  scoop.rotateZ(Math.PI);
  scoop.rotateX(-Math.PI / 2);
  scoop.translate(0, 0, 3 + scoopLen / 2 - 2);
  parts.push({ geo: scoop, mat: kit.steelMirror() });
  // 唇口：极薄的反光边（真实的不锈钢勺头就是这么亮的一条线）
  const lip = new THREE_ref.TorusGeometry(scoopW / 2, 0.06, 4, Math.max(10, q.seg));
  lip.rotateX(Math.PI / 2);
  lip.scale(1, 1, 0.3);
  lip.translate(0, 0, 3 + scoopLen - 2);
  parts.push({ geo: lip, mat: kit.steelMirror({ emissive: new THREE_ref.Color(PALETTE.white), emissiveIntensity: 0.06 }) });
  // 限深环：真实耳勺常见的 safety stop
  const stop = new THREE_ref.TorusGeometry(2.5, 0.35, 6, Math.max(10, q.seg));
  stop.translate(0, 0, -6);
  parts.push({ geo: stop, mat: kit.steelDark() });

  return { parts, tipZ: 3 + scoopLen - 2 + 0.3, spin: true };
}

// 圆头耳扒：圆润浅碗，大面积贴壁刮扫
function BuildEarSpoonRound(THREE_ref, kit, q) {
  const parts = [];
  const shaftLen = 120;
  const prof = [];
  for (let i = 0; i <= 12; i++) {
    const t = i / 12;
    const r = 2.6 - 1.5 * Math.pow(t, 0.6);
    prof.push(new THREE_ref.Vector2(Math.max(0.4, r), t * shaftLen));
  }
  const rod = new THREE_ref.LatheGeometry(prof, q.seg);
  rod.rotateX(Math.PI / 2);
  rod.translate(0, 0, -11);
  parts.push({ geo: rod, mat: kit.steel() });
  // 握持端的扁平面（防滚）
  const flat = new THREE_ref.BoxGeometry(5.4, 1.4, 22);
  flat.translate(0, 0, -shaftLen / 2 + 14);
  parts.push({ geo: flat, mat: kit.steelDark() });

  // 圆头碗：半球形浅碗，碗口朝向工具侧面（贴壁的那一面）
  const bowlR = 2.4;
  const bowl = new THREE_ref.SphereGeometry(bowlR, Math.max(10, q.seg), Math.max(6, q.seg * 0.6), 0, Math.PI * 2, Math.PI * 0.5, Math.PI * 0.5);
  bowl.scale(1, 0.52, 1);
  bowl.rotateX(-Math.PI / 2);   // 碗口朝 -z 侧
  bowl.translate(0, 0, 0);
  parts.push({ geo: bowl, mat: kit.steelMirror() });
  // 碗口圆边：钝的，不刮手
  const rim = new THREE_ref.TorusGeometry(bowlR, 0.14, 6, Math.max(12, q.seg));
  rim.rotateX(Math.PI / 2);
  rim.scale(1, 1, 0.5);
  parts.push({ geo: rim, mat: kit.steel() });
  const neck = new THREE_ref.CylinderGeometry(0.95, 1.1, 5, q.seg, 1);
  neck.rotateX(Math.PI / 2);
  neck.translate(0, 0, -bowlR - 2);
  parts.push({ geo: neck, mat: kit.steel() });
  const head = new THREE_ref.Group();   // 占位，不用（保持 parts 结构一致）
  head.visible = false;

  return {
    parts, tipZ: bowlR + 0.6, spin: true,
    // 碗头作为一个整体挂在 +z 端
    post: (group) => { }, offsetForward: bowlR + 6,
  };
}

// 耵聍钩：细钩 + 90° 弯尖，专门挑硬结
function BuildEarCurette(THREE_ref, kit, q) {
  const parts = [];
  const shaftLen = 158;
  const prof = [];
  for (let i = 0; i <= 14; i++) {
    const t = i / 14;
    let r = 1.9 - 1.15 * Math.pow(t, 0.55);
    if (t < 0.2) r = 1.9 + 0.06 * Math.sin((t / 0.2) * Math.PI * 7);
    prof.push(new THREE_ref.Vector2(Math.max(0.32, r), t * shaftLen));
  }
  const rod = new THREE_ref.LatheGeometry(prof, q.seg);
  rod.rotateX(Math.PI / 2);
  rod.translate(0, 0, -16);
  parts.push({ geo: rod, mat: kit.steel() });

  // 钩：用 TubeGeometry 沿一条 90° 圆弧走，钩尖朝径向外侧（贴壁的那一面）
  const hookR = 2.6;
  const curve = new THREE_ref.CatmullRomCurve3([
    new THREE_ref.Vector3(0, 0, -hookR),
    new THREE_ref.Vector3(0, hookR * 0.35, -hookR * 0.55),
    new THREE_ref.Vector3(0, hookR * 0.95, hookR * 0.15),
    new THREE_ref.Vector3(0, hookR * 1.15, hookR * 1.1),
  ]);
  const hook = new THREE_ref.TubeGeometry(curve, Math.max(8, q.ring * 2), 0.42, Math.max(6, q.seg * 0.5), false);
  // 钩尖收细
  const hp = hook.attributes.position;
  const tmpV = new THREE_ref.Vector3();
  for (let i = 0; i < hp.count; i++) {
    tmpV.set(hp.getX(i), hp.getY(i), hp.getZ(i));
    const t = THREE_ref.MathUtils.clamp((tmpV.z + hookR) / (hookR * 2.1), 0, 1);
    const grow = 1 - 0.55 * Math.pow(t, 3);
    const c = curve.getPoint(t);
    hp.setXYZ(i, c.x + (tmpV.x - c.x) * grow, c.y + (tmpV.y - c.y) * grow, c.z + (tmpV.z - c.z) * grow);
  }
  hp.needsUpdate = true;
  hook.computeVertexNormals();
  hook.translate(0, 0, 6);
  parts.push({ geo: hook, mat: kit.steelMirror() });
  // 钩尖小球：钝头，避免看起来像针（真实取蜡钩是钝头）
  const ball = new THREE_ref.SphereGeometry(0.22, 8, 6);
  ball.translate(0, hookR * 1.15, 6 + hookR * 1.1);
  parts.push({ geo: ball, mat: kit.steelMirror() });

  return { parts, tipZ: 6 + hookR * 1.1 + 0.3, spin: false };
}

// 耳扒（多齿小耙）：3-5 个细齿，齿尖圆钝
function BuildEarRake(THREE_ref, kit, q) {
  const parts = [];
  const teeth = q.extra ? 5 : 3;
  const shaftLen = 128;
  const prof = [];
  for (let i = 0; i <= 12; i++) {
    const t = i / 12;
    prof.push(new THREE_ref.Vector2(Math.max(0.35, 2.3 - 1.25 * Math.pow(t, 0.6)), t * shaftLen));
  }
  const rod = new THREE_ref.LatheGeometry(prof, q.seg);
  rod.rotateX(Math.PI / 2);
  rod.translate(0, 0, -13);
  parts.push({ geo: rod, mat: kit.steel() });

  // 齿座：一片扁平的横梁
  const beam = new THREE_ref.BoxGeometry(6.4, 1.0, 4.2);
  beam.translate(0, 0, 2);
  parts.push({ geo: beam, mat: kit.steel() });

  // 齿：从横梁向前伸出，呈扇形微张，齿尖是圆的
  const toothLen = 7.5;
  for (let i = 0; i < teeth; i++) {
    const k = teeth === 1 ? 0 : -1 + (2 * i) / (teeth - 1);
    const g = MakeBluntTooth(THREE_ref, { length: toothLen, r: 0.34, seg: q.seg, curveZ: -0.9 });
    g.rotateY(k * 0.22);                 // 扇形张开
    g.translate(k * 2.1, 0, 4 + toothLen / 2);
    parts.push({ geo: g, mat: kit.steelMirror() });
    // 齿尖钝球，明确「不扎」
    const tipBall = new THREE_ref.SphereGeometry(0.34, 6, 4);
    tipBall.translate(k * 2.1 + Math.sin(k * 0.22) * -toothLen * 0.5, -0.9, 4 + toothLen);
    parts.push({ geo: tipBall, mat: kit.steelMirror() });
  }

  return { parts, tipZ: 4 + toothLen + 0.35, spin: false };
}

// 鹅毛棒：竹签 + 一圈羽毛（羽轴 + 两排羽枝），能飘摆
function BuildGooseFeather(THREE_ref, kit, q, big) {
  const parts = [];
  const stickLen = big ? 96 : 104;
  const featherLen = big ? 42 : 36;
  const barbLen = big ? 9.5 : 6.0;
  const glow = big ? 0.0 : 0.0;

  // 竹签
  const stick = MakeNodeRod(THREE_ref, {
    length: stickLen, r0: 2.0, r1: 0.95, seg: q.seg,
    nodes: [0.28, 0.58, 0.84], nodeBump: 0.12, curveAmp: 0.4,
  });
  stick.translate(0, 0, -featherLen / 2 - 6);
  parts.push({ geo: stick, mat: kit.bamboo() });

  // 羽轴：一根竹签前端伸出的细轴，羽毛就长在它上面
  const rachisGeo = new THREE_ref.CylinderGeometry(0.14, 0.3, featherLen, 6, 3);
  rachisGeo.rotateX(Math.PI / 2);
  // 羽轴自身带一点弧度，羽毛才不是直的
  {
    const rp = rachisGeo.attributes.position;
    for (let i = 0; i < rp.count; i++) {
      const t = (rp.getZ(i) + featherLen / 2) / featherLen;
      rp.setY(i, rp.getY(i) + 0.55 * t * t);
    }
    rp.needsUpdate = true;
    rachisGeo.computeVertexNormals();
  }
  parts.push({ geo: rachisGeo, mat: kit.featherWhite() });

  // 羽枝：实例化薄片，双排
  const rows = big ? 3 : 2;
  const barbs = Math.max(6, Math.round(q.featherBarbs / rows));
  const blade = SurfaceGeometry(THREE_ref, (u, v, out) => {
    const w = (1 - Math.pow(v, 1.35)) * 0.5;
    out.set((u - 0.5) * 2 * w, 0, v);
    return out;
  }, 1, 2);
  blade.scale(1, 1, barbLen);
  const inst = new THREE_ref.InstancedMesh(blade, kit.featherWhite(), barbs * rows);
  inst.instanceMatrix.setUsage(THREE_ref.DynamicDrawUsage);
  const rng = MakeLocalRng(big ? 0x1234 : 0x5678);
  const dummy = new THREE_ref.Object3D();
  const barbData = [];
  let n = 0;
  for (let r = 0; r < rows; r++) {
    for (let i = 0; i < barbs; i++) {
      const t = (i + 0.5) / barbs;
      const ang = t * Math.PI * 2 * 1.75 + (r * Math.PI * 2) / rows;
      // 羽毛中部最宽、根与梢收窄
      const lift = Math.sin(Math.PI * Math.pow(t, 0.8));
      const len = 0.42 + 0.58 * lift;
      barbData.push({ t, ang, len, jitter: rng() * 0.3 });
      dummy.position.set(0, 0, -featherLen / 2 + featherLen * t);
      dummy.rotation.set(0, 0, 0);
      dummy.rotateZ(ang);
      // 羽枝从羽轴向外斜出，并略向后掠
      dummy.rotateY(Math.PI / 2 - 0.42);
      dummy.rotateX(0);
      dummy.scale.set(1, 1, len);
      dummy.updateMatrix();
      inst.setMatrixAt(n, dummy.matrix);
      n++;
    }
  }
  inst.instanceMatrix.needsUpdate = true;

  return {
    parts, instanced: [{ mesh: inst }], tipZ: featherLen / 2 + 0.5, spin: true,
    swell: true, feathers: true, barbData, featherLen, splay: true,
    deformGeo: rachisGeo,
  };
}

// 马尾棒：几十根细马尾合并成一块几何，顶端散开，摆动最柔软
function BuildHorsehairStick(THREE_ref, kit, q) {
  const parts = [];
  const stickLen = 92, hairLen = 46;
  const stick = MakeNodeRod(THREE_ref, {
    length: stickLen, r0: 2.1, r1: 1.05, seg: q.seg,
    nodes: [0.3, 0.62], nodeBump: 0.12, curveAmp: 0.35,
  });
  stick.translate(0, 0, -hairLen / 2 - 5);
  parts.push({ geo: stick, mat: kit.wood() });

  // 束根胶圈：真实马尾棒根部有绑扎
  const collar = new THREE_ref.CylinderGeometry(1.5, 1.25, 5, Math.max(8, q.seg), 1);
  collar.rotateX(Math.PI / 2);
  collar.translate(0, 0, -hairLen / 2 + 1);
  parts.push({ geo: collar, mat: kit.steelDark() });

  const bundle = MakeHairBundle(THREE_ref, {
    count: q.hairCount, hairLength: hairLen, radius: 0.115, seg: q.seg,
  });
  parts.push({ geo: bundle, mat: kit.horsehair() });

  return { parts, tipZ: hairLen / 2 + 3.5, spin: true, swell: true, hairs: true, splay: true, deformGeo: bundle };
}

// 鸡毛棒：介于鹅毛与马尾之间
function BuildChickenFeather(THREE_ref, kit, q) {
  const built = BuildGooseFeather(THREE_ref, kit, {
    ...q, featherBarbs: Math.round(q.featherBarbs * 0.65),
  }, false);
  // 鸡毛更挺更短，把羽片换成偏褐色
  for (const p of built.parts) {
    if (p.mat && p.mat.color && p.mat.color.getHexString() === new THREE_ref.Color(PALETTE.featherWhite).getHexString()) {
      p.mat = kit.featherBrown();
    }
  }
  for (const it of built.instanced) it.mesh.material = kit.featherBrown();
  return built;
}

// 音叉（振子）：U 形金属叉 + 手柄，Update 里高频微振 + 余响衰减
function BuildTuningFork(THREE_ref, kit, q) {
  const parts = [];
  const tineLen = 68, gap = 11.4, tineR = 1.6, stemLen = 56;

  // 两根叉臂：沿 +z 伸出，顶端有小球（真实音叉的叉臂端是平/圆头）
  const tines = [];
  for (const side of [-1, 1]) {
    const prof = [];
    for (let i = 0; i <= 8; i++) {
      const t = i / 8;
      const r = tineR * (0.92 + 0.14 * Math.sin(Math.PI * t));
      prof.push(new THREE_ref.Vector2(r, t * tineLen));
    }
    const g = new THREE_ref.LatheGeometry(prof, Math.max(8, q.seg * 0.7));
    g.rotateX(Math.PI / 2);
    g.translate(side * gap / 2, 0, tineLen / 2);
    tines.push(g);
  }
  const tineMeshGeo = MergeGeometries(THREE_ref, tines);
  for (const t of tines) t.dispose();

  // U 形底部：一段圆弧把两根叉臂连起来
  const arcR = gap / 2 + tineR * 0.15;
  const arc = new THREE_ref.TorusGeometry(arcR, tineR, Math.max(6, q.seg * 0.5), Math.max(10, q.seg), Math.PI);
  arc.rotateY(Math.PI / 2);      // 环面立起来，圆弧在 xz 平面
  arc.rotateZ(Math.PI);
  arc.rotateX(Math.PI / 2);
  arc.translate(0, 0, -tineR * 0.9);
  const arcY = new THREE_ref.TorusGeometry(0, 0, 3, 3);
  arcY.dispose();

  const forkGeo = MergeGeometries(THREE_ref, [tineMeshGeo, arc]);
  tineMeshGeo.dispose();
  arc.dispose();

  // 手柄：叉底向下（-z）伸出的粗柄，末端常有球头
  const stemProf = [];
  for (let i = 0; i <= 10; i++) {
    const t = i / 10;
    let r = 1.85 - 0.35 * t;
    if (t > 0.86) r = 1.5 * Math.cos(((t - 0.86) / 0.14) * (Math.PI / 2));  // 球头
    stemProf.push(new THREE_ref.Vector2(Math.max(0.05, r), t * stemLen));
  }
  const stem = new THREE_ref.LatheGeometry(stemProf, Math.max(8, q.seg * 0.7));
  stem.rotateX(Math.PI / 2);
  stem.translate(0, 0, -stemLen / 2 - 1.2);

  parts.push({ geo: forkGeo, mat: kit.steelMirror() });
  parts.push({ geo: stem, mat: kit.steel() });

  // 振动参考标记：叉臂顶端的小圆片，共振时能看清在抖
  const mark = new THREE_ref.SphereGeometry(0.3, 6, 4);
  mark.translate(0, 0, tineLen / 2);
  parts.push({ geo: mark, mat: kit.glow({ emissiveIntensity: 0.5 }) });

  return { parts, tipZ: tineLen / 2 + 0.4, spin: false, fork: true, tineLen, gap };
}

// 耳镊 / 膝状镊：两片镊臂 + 钝齿尖，支持开合
function BuildEarForceps(THREE_ref, kit, q) {
  const parts = [];
  const armLen = 96, jawLen = 22;

  // 镊臂：一根压扁的回转体（真实镊臂是扁的，才有弹性），×2 上下相对
  const makeArm = (side) => {
    const prof = [];
    const steps = 12;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      // 根部（握环侧）窄、中段宽、前端收细
      const w = 2.35 - 0.9 * Math.pow(t, 0.55) + 0.5 * Math.sin(Math.PI * Math.min(1, t * 1.15));
      prof.push(new THREE_ref.Vector2(Math.max(0.35, w * 0.42), t * armLen));
    }
    const g = new THREE_ref.LatheGeometry(prof, Math.max(10, q.seg * 0.7));
    g.rotateX(Math.PI / 2);
    g.scale(1, 0.62, 1);                 // 压扁：镊臂的横截面是扁椭圆
    g.translate(0, side * 0.62, 0);
    return g;
  };
  const armA = makeArm(-1);
  const armB = makeArm(1);

  // 镊尖：细长收窄的嘴，合上时两片碰在一起
  const makeJaw = (side) => {
    const jawProfile = [];
    for (let i = 0; i <= 7; i++) {
      const t = i / 7;
      jawProfile.push(new THREE_ref.Vector2(Math.max(0.07, 1.35 - 1.15 * Math.pow(t, 0.65)), t * jawLen));
    }
    const g = new THREE_ref.LatheGeometry(jawProfile, Math.max(8, q.seg * 0.7));
    g.rotateX(Math.PI / 2);
    g.scale(1, 0.66, 1);
    g.translate(0, side * 0.58, armLen);
    return g;
  };
  const jawA = makeJaw(-1);
  const jawB = makeJaw(1);

  // 齿：两片镊尖内侧各 3 个小钝齿（牙科镊/鳄鱼镊的咬合齿）
  const makeTeeth = (side) => {
    const list = [];
    for (let i = 0; i < 3; i++) {
      const tt = new THREE_ref.ConeGeometry(0.15, 0.62, 6);
      tt.rotateZ(side * Math.PI / 2);
      tt.rotateX(0);
      tt.translate(0, side * (0.50 - i * 0.02), armLen + 5 + i * 5);
      list.push(tt);
    }
    const g = MergeGeometries(THREE_ref, list);
    for (const x of list) x.dispose();
    return g;
  };
  const teethA = makeTeeth(-1);
  const teethB = makeTeeth(1);

  // 握环：真实采耳镊是拇指环镊，两根指环
  const ring = new THREE_ref.TorusGeometry(6.5, 0.8, Math.max(6, q.seg * 0.5), Math.max(10, q.seg));
  ring.rotateY(Math.PI / 2);
  const ringA = ring.clone(); ringA.translate(0, -4.2, -15);
  const ringB = ring.clone(); ringB.translate(0, 4.2, -15);
  ring.dispose();

  // 枢轴：真实镊子的铰点靠近握环，所以前端张口最大
  const HINGE_Z = -10, MAX_ANGLE = 0.048;   // 张开约 2.7°，前端 118mm 处 ≈ 5.5mm 张口

  parts.push({ geo: armA, mat: kit.steel() });
  parts.push({ geo: armB, mat: kit.steel() });
  parts.push({ geo: jawA, mat: kit.steelMirror() });
  parts.push({ geo: jawB, mat: kit.steelMirror() });
  parts.push({ geo: teethA, mat: kit.steelMirror() });
  parts.push({ geo: teethB, mat: kit.steelMirror() });
  parts.push({ geo: ringA, mat: kit.steelDark() });
  parts.push({ geo: ringB, mat: kit.steelDark() });

  return {
    parts, tipZ: armLen + jawLen - 0.5, spin: false,
    forceps: true, armLen, jawLen,
    // squeeze01 = 1 → 合上；= 0 → 张开
    deformers: [
      { fn: MakeJawHingeDeformer(armA, 0, HINGE_Z, -1, MAX_ANGLE), mode: "close" },
      { fn: MakeJawHingeDeformer(armB, 0, HINGE_Z, +1, MAX_ANGLE), mode: "close" },
      { fn: MakeJawHingeDeformer(jawA, 0, HINGE_Z, -1, MAX_ANGLE), mode: "close" },
      { fn: MakeJawHingeDeformer(jawB, 0, HINGE_Z, +1, MAX_ANGLE), mode: "close" },
      { fn: MakeJawHingeDeformer(teethA, 0, HINGE_Z, -1, MAX_ANGLE), mode: "close" },
      { fn: MakeJawHingeDeformer(teethB, 0, HINGE_Z, +1, MAX_ANGLE), mode: "close" },
    ],
  };
}

// 棉签：白色纸轴 + 两端绒毛棉头
function BuildCottonSwab(THREE_ref, kit, q) {
  const parts = [];
  const shaftLen = 74, headLen = 13, headR = 2.7;

  // 纸轴：略带锥度，两端印有压痕环
  const prof = [];
  const steps = 10;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    prof.push(new THREE_ref.Vector2(1.05 + 0.1 * Math.sin(t * Math.PI * 3) * (t < 0.12 ? 1 : 0), t * shaftLen));
  }
  const shaft = new THREE_ref.LatheGeometry(prof, Math.max(8, q.seg * 0.6));
  shaft.rotateX(Math.PI / 2);
  shaft.translate(0, 0, -shaftLen / 2 + 6);
  parts.push({ geo: shaft, mat: kit.cotton({ color: new THREE_ref.Color(PALETTE.cream), roughness: 0.85, metalness: 0.0 }) });

  // 棉头：鼓起的椭球 + 纤维绒毛
  const head = new THREE_ref.SphereGeometry(headR, Math.max(10, q.seg), Math.max(8, q.seg * 0.6));
  head.scale(1, 1, headLen / (headR * 2));
  head.translate(0, 0, 6 + headLen / 2);
  parts.push({ geo: head, mat: kit.cotton() });

  // 绒毛：实例化细纤维，让棉头看起来是絮状的而不是光球
  let fuzzMesh = null;
  if (q.fuzz > 0) {
    const fiber = new THREE_ref.CylinderGeometry(0.03, 0.05, 1.5, 3, 1);
    fiber.translate(0, 0.75, 0);
    fuzzMesh = new THREE_ref.InstancedMesh(fiber, kit.cotton(), q.fuzz);
    const rng = MakeLocalRng(0xc0770);
    const dummy = new THREE_ref.Object3D();
    for (let i = 0; i < q.fuzz; i++) {
      // 球面均匀取点
      const u = rng() * 2 - 1, th = rng() * Math.PI * 2;
      const s = Math.sqrt(Math.max(0, 1 - u * u));
      const nx = s * Math.cos(th), ny = s * Math.sin(th), nz = u;
      dummy.position.set(nx * headR * 0.94, ny * headR * 0.94, 6 + headLen / 2 + nz * (headLen / 2) * 0.92);
      dummy.quaternion.setFromUnitVectors(new THREE_ref.Vector3(0, 1, 0), new THREE_ref.Vector3(nx, ny, nz * 0.6 + 0.5).normalize());
      const sc = 0.7 + rng() * 0.9;
      dummy.scale.set(1, sc, 1);
      dummy.updateMatrix();
      fuzzMesh.setMatrixAt(i, dummy.matrix);
    }
    fuzzMesh.instanceMatrix.needsUpdate = true;
  }

  return { parts, instanced: fuzzMesh ? [{ mesh: fuzzMesh }] : [], tipZ: 6 + headLen + 0.3, spin: true, swab: true };
}

// 滴耳液：小药瓶 + 滴管，能出液滴
function BuildEarDrops(THREE_ref, kit, q) {
  const parts = [];
  const bodyR = 9.5, bodyLen = 34, neckLen = 6, dropperLen = 22;

  // 药瓶：棕色以外的通透玻璃（项目基调是清新，所以做成淡琥珀玻璃）
  const prof = [];
  const steps = 14;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    let r = bodyR;
    if (t < 0.06) r = bodyR * Math.sin((t / 0.06) * (Math.PI / 2)) * 0.75;
    if (t > 0.86) r = bodyR * Math.cos(((t - 0.86) / 0.14) * (Math.PI / 2)) * 0.6 + 3.2;
    prof.push(new THREE_ref.Vector2(Math.max(0.4, r), t * bodyLen));
  }
  const body = new THREE_ref.LatheGeometry(prof, Math.max(12, q.seg));
  body.rotateX(-Math.PI / 2);        // 瓶身向 -z 倒（瓶口朝 +z）
  body.translate(0, 0, -dropperLen - bodyLen / 2 - 4);
  parts.push({ geo: body, mat: kit.glass({ color: new THREE_ref.Color(PALETTE.waxDry) }) });

  // 瓶中液体：一小段柱体，看得见液面高度
  const liquid = new THREE_ref.CylinderGeometry(bodyR * 0.82, bodyR * 0.82, bodyLen * 0.5, Math.max(10, q.seg * 0.7));
  liquid.rotateX(Math.PI / 2);
  liquid.translate(0, 0, -dropperLen - bodyLen * 0.78);
  parts.push({ geo: liquid, mat: kit.water({ color: new THREE_ref.Color(PALETTE.waxDry), opacity: 0.7 }) });

  // 瓶盖/胶头
  const cap = new THREE_ref.CylinderGeometry(4.6, 5.2, 8, Math.max(10, q.seg * 0.8));
  cap.rotateX(Math.PI / 2);
  cap.translate(0, 0, -dropperLen - 6);
  parts.push({ geo: cap, mat: kit.steelDark({ color: new THREE_ref.Color(PALETTE.mintDeep), roughness: 0.5, metalness: 0.1 }) });

  // 滴管：细玻璃管，前端收成滴口
  const dProf = [];
  for (let i = 0; i <= 10; i++) {
    const t = i / 10;
    let r = 1.5 - 0.7 * t;
    if (t > 0.9) r = 0.85 * (1 - Math.pow((t - 0.9) / 0.1, 1.6)) * 0.9 + 0.1;
    dProf.push(new THREE_ref.Vector2(Math.max(0.05, r), t * dropperLen));
  }
  const dropper = new THREE_ref.LatheGeometry(dProf, Math.max(8, q.seg * 0.7));
  dropper.rotateX(-Math.PI / 2);
  dropper.translate(0, 0, -dropperLen / 2);
  parts.push({ geo: dropper, mat: kit.glass() });

  // 液滴：可复用的几个小球，Update 里做下落动画
  const drops = [];
  const dropGeo = new THREE_ref.SphereGeometry(0.75, Math.max(6, q.seg * 0.5), Math.max(5, q.seg * 0.4));
  for (let i = 0; i < Math.max(1, q.droplets); i++) {
    const m = new THREE_ref.Mesh(dropGeo, kit.water({ color: new THREE_ref.Color(PALETTE.honey) }));
    m.visible = false;
    m.userData.t = -1 - i * 0.5;
    drops.push(m);
  }
  return { parts, tipZ: 0.2, spin: false, drops, dropGeo, dropperLen, emit: true };
}

// 洗耳球 / 冲洗器：橡皮球 + 弯管，捏的时候变形
function BuildEarSyringe(THREE_ref, kit, q) {
  const parts = [];
  const bulbR = 21, nozzleLen = 62;

  // 橡皮球
  const bulb = new THREE_ref.SphereGeometry(bulbR, Math.max(14, q.seg), Math.max(10, q.seg * 0.75));
  parts.push({ geo: bulb, mat: kit.rubber() });
  // 球体上的收缩环（真实洗耳球中部有加强环）
  const ring = new THREE_ref.TorusGeometry(bulbR * 1.005, 0.9, 6, Math.max(14, q.seg));
  parts.push({ geo: ring, mat: kit.rubber({ color: new THREE_ref.Color(PALETTE.sky) }) });

  // 弯管：从球体前上方伸出，末端是略粗的冲洗嘴
  const curve = new THREE_ref.CatmullRomCurve3([
    new THREE_ref.Vector3(0, 1.5, bulbR * 0.55),
    new THREE_ref.Vector3(0, 2.6, bulbR * 0.95),
    new THREE_ref.Vector3(0, 2.2, bulbR * 0.95 + nozzleLen * 0.45),
    new THREE_ref.Vector3(0, 1.4, bulbR * 0.95 + nozzleLen * 0.8),
    new THREE_ref.Vector3(0, 1.0, bulbR * 0.95 + nozzleLen),
  ]);
  const tube = new THREE_ref.TubeGeometry(curve, Math.max(14, q.ring * 2), 2.0, Math.max(8, q.seg * 0.7), false);
  parts.push({ geo: tube, mat: kit.glass({ color: new THREE_ref.Color(PALETTE.cream), opacity: 0.75 }) });

  // 冲洗嘴：略外扩的钝头，管口是出水孔
  const nozzle = new THREE_ref.CylinderGeometry(2.5, 2.0, 6, Math.max(10, q.seg * 0.8));
  nozzle.rotateX(Math.PI / 2);
  nozzle.translate(0, 1.0, bulbR * 0.95 + nozzleLen + 3);
  parts.push({ geo: nozzle, mat: kit.steel() });

  // 水柱：捏的时候射出的锥形，默认隐藏
  const jetGeo = new THREE_ref.CylinderGeometry(0.35, 1.5, 26, 8, 1, true);
  jetGeo.translate(0, 0, 13);
  const jet = new THREE_ref.Mesh(jetGeo, kit.water({ opacity: 0.5, transparent: true, side: THREE_ref.DoubleSide }));
  jet.position.set(0, 1.0, bulbR * 0.95 + nozzleLen + 6);
  jet.visible = false;

  // 一滴水落在管口，提醒「要接水盆」
  const dripGeo = new THREE_ref.SphereGeometry(1.0, 8, 6);
  const drip = new THREE_ref.Mesh(dripGeo, kit.water({ color: new THREE_ref.Color(PALETTE.water) }));
  drip.visible = false;

  return {
    parts, tipZ: bulbR * 0.95 + nozzleLen + 6, spin: false,
    jet, drip, bulbMesh: bulb, bulbR, squeeze: true, deformGeo: bulb,
  };
}

// 电动吸引器：手柄 + 细吸管 + 集液瓶，管口有吸气视觉
function BuildEarVacuum(THREE_ref, kit, q) {
  const parts = [];
  const bodyLen = 96, tubeLen = 62, bodyR = 11;

  // 手柄主机：握把 + 顶部的电机鼓包
  const prof = [];
  const steps = 14;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    let r = bodyR * (0.72 + 0.42 * Math.sin(Math.PI * Math.pow(t, 0.8)));
    if (t < 0.08) r = bodyR * 0.6;
    if (t > 0.92) r = bodyR * 0.55;
    prof.push(new THREE_ref.Vector2(Math.max(0.5, r), t * bodyLen));
  }
  const body = new THREE_ref.LatheGeometry(prof, Math.max(12, q.seg));
  body.rotateX(-Math.PI / 2);
  body.translate(0, 0, -bodyLen / 2 - tubeLen - 6);
  parts.push({ geo: body, mat: kit.steelDark({ color: new THREE_ref.Color(PALETTE.mint), roughness: 0.55, metalness: 0.15 }) });

  // 集液瓶：透明小瓶挂在手柄上
  const jarR = 7.5, jarLen = 20;
  const jar = new THREE_ref.CylinderGeometry(jarR, jarR * 0.85, jarLen, Math.max(10, q.seg * 0.8));
  jar.rotateX(Math.PI / 2);
  jar.translate(0, -bodyR * 1.05, -bodyLen / 2 - tubeLen - 10);
  parts.push({ geo: jar, mat: kit.glass() });
  const jarLiquid = new THREE_ref.CylinderGeometry(jarR * 0.8, jarR * 0.7, jarLen * 0.35, Math.max(8, q.seg * 0.7));
  jarLiquid.rotateX(Math.PI / 2);
  jarLiquid.translate(0, -bodyR * 1.05, -bodyLen / 2 - tubeLen - 14);
  parts.push({ geo: jarLiquid, mat: kit.water({ color: new THREE_ref.Color(PALETTE.waxDryDeep), opacity: 0.7 }) });

  // 细吸管：Zoellner 类，管径 1.0-2.5mm
  const tubeProf = [];
  for (let i = 0; i <= 10; i++) {
    const t = i / 10;
    tubeProf.push(new THREE_ref.Vector2(1.15 - 0.35 * Math.pow(t, 2), t * tubeLen));
  }
  const tube = new THREE_ref.LatheGeometry(tubeProf, Math.max(8, q.seg * 0.6));
  tube.rotateX(Math.PI / 2);
  tube.translate(0, 0, -tubeLen / 2 - 3);
  parts.push({ geo: tube, mat: kit.steelMirror() });

  // 管口的吸气光晕：一个小发光环，抽吸时亮起
  const haloGeo = new THREE_ref.TorusGeometry(1.5, 0.3, 5, 10);
  const halo = new THREE_ref.Mesh(haloGeo, kit.glow({ emissiveIntensity: 1.2 }));
  halo.position.set(0, 0, tubeLen / 2 - 3);
  halo.visible = false;

  return { parts, tipZ: tubeLen / 2 - 2.5, spin: false, halo, vacuum: true };
}

// 检耳镜：手柄 + 头部 + 喇叭口 speculum + 光源（环形补光）
function BuildOtoscope(THREE_ref, kit, q) {
  const parts = [];
  const handleLen = 74, headLen = 42, specR = 3.0, specLen = 26;

  // 手柄：握起来是圆柱，底部稍宽
  const hProf = [];
  for (let i = 0; i <= 10; i++) {
    const t = i / 10;
    hProf.push(new THREE_ref.Vector2(6.0 - 1.1 * Math.pow(t, 0.6), t * handleLen));
  }
  const handle = new THREE_ref.LatheGeometry(hProf, Math.max(12, q.seg));
  handle.rotateX(-Math.PI / 2);
  handle.translate(0, -8.5, -headLen / 2 - handleLen / 2);
  parts.push({ geo: handle, mat: kit.steelDark({ color: new THREE_ref.Color(PALETTE.mintDeep), roughness: 0.5, metalness: 0.2 }) });

  // 头部：扁圆柱，一侧装镜头
  const head = new THREE_ref.CylinderGeometry(8.5, 8.5, headLen, Math.max(14, q.seg));
  head.rotateX(Math.PI / 2);
  head.rotateY(0);
  head.translate(0, 0, -6);
  parts.push({ geo: head, mat: kit.steel() });

  // 喇叭口 speculum：Hartmann 式截锥，从头部向 +z 张开后收窄
  const sProf = [];
  for (let i = 0; i <= 10; i++) {
    const t = i / 10;
    // 根部 5.5mm → 前端 3.0mm 的截锥，前缘有外翻喇叭口
    let r = 5.6 - 2.6 * t;
    if (t > 0.88) r = 3.0 + 0.9 * Math.sin(((t - 0.88) / 0.12) * Math.PI);
    sProf.push(new THREE_ref.Vector2(r, t * specLen));
  }
  const spec = new THREE_ref.LatheGeometry(sProf, Math.max(14, q.seg));
  spec.rotateX(Math.PI / 2);
  spec.translate(0, 0, headLen / 2 + specLen / 2 - 8);
  parts.push({ geo: spec, mat: kit.glass({ color: new THREE_ref.Color(PALETTE.ceramic), opacity: 0.42, side: THREE_ref.DoubleSide }) });

  // 镜头：头部后方的目镜
  const lens = new THREE_ref.CylinderGeometry(6.2, 6.2, 3.5, Math.max(12, q.seg * 0.8));
  lens.rotateX(Math.PI / 2);
  lens.translate(0, 0, -headLen / 2 - 6 + 4);
  parts.push({ geo: lens, mat: kit.glass({ color: new THREE_ref.Color(PALETTE.sky), opacity: 0.6 }) });

  // 光源：环形的 LED，环绕在 speculum 根部
  const ledGeo = new THREE_ref.TorusGeometry(5.2, 0.45, 6, Math.max(12, q.seg));
  const led = new THREE_ref.Mesh(ledGeo, kit.glow({ emissiveIntensity: 1.6 }));
  led.position.set(0, 0, headLen / 2 - 7);

  // 环形补光：契约要求暴露 light 引用，强度交给 lead 调
  const light = new THREE_ref.PointLight(new THREE_ref.Color(PALETTE.honey), 0.0, 260, 2);
  light.position.set(0, 0, headLen / 2 + specLen * 0.55 - 8);
  const spot = new THREE_ref.SpotLight(new THREE_ref.Color(PALETTE.honey), 0.0, 200, 0.7, 0.55, 1.6);
  spot.position.set(0, 0, headLen / 2 - 8);
  spot.target.position.set(0, 0, 120);

  return {
    parts, tipZ: specLen / 2 + headLen / 2 - 8, spin: false,
    led, light, spot, otoscope: true, hasLight: true,
  };
}

// 耳毛剪：两片刀刃 + 指环，支持开合动画
function BuildEarHairScissors(THREE_ref, kit, q) {
  const parts = [];
  const bladeLen = 42;
  const makeBlade = (side) => {
    const shape = new THREE_ref.Shape();
    shape.moveTo(0, -1.1);
    shape.lineTo(0, 1.1);
    shape.quadraticCurveTo(bladeLen * 0.62, 1.0, bladeLen, side * 0.35);
    shape.quadraticCurveTo(bladeLen * 0.6, -0.55, 0, -1.1);
    const g = new THREE_ref.ExtrudeGeometry(shape, { depth: 0.75, bevelEnabled: true, bevelSize: 0.1, bevelThickness: 0.1, bevelSegments: 1, curveSegments: 4 });
    g.rotateX(Math.PI / 2);
    g.rotateY(-Math.PI / 2);
    // 刀刃扁平方向转到 y 轴（上下两片相对）
    g.rotateZ(Math.PI / 2);
    g.rotateX(Math.PI / 2);
    return g;
  };
  const bladeA = makeBlade(1);
  const bladeB = makeBlade(-1);
  const bladesGeo = MergeGeometries(THREE_ref, [bladeA, bladeB]);
  bladeA.dispose(); bladeB.dispose();
  bladesGeo.translate(0, 0, 10);

  // 指环
  const ring = new THREE_ref.TorusGeometry(7, 0.9, Math.max(6, q.seg * 0.5), Math.max(10, q.seg));
  ring.rotateY(Math.PI / 2);
  const rA = ring.clone(); rA.translate(0, -7.5, -22);
  const rB = ring.clone(); rB.translate(0, 7.5, -22);
  ring.dispose();
  const ringsGeo = MergeGeometries(THREE_ref, [rA, rB]);
  rA.dispose(); rB.dispose();

  // 枢轴
  const pivot = new THREE_ref.CylinderGeometry(1.4, 1.4, 3.0, Math.max(8, q.seg * 0.6));
  pivot.rotateX(Math.PI / 2);
  pivot.rotateY(Math.PI / 2);
  pivot.translate(0, 0, -9);

  parts.push({ geo: bladesGeo, mat: kit.steelMirror() });
  parts.push({ geo: ringsGeo, mat: kit.steel() });
  parts.push({ geo: pivot, mat: kit.steelDark() });

  // 限深梳齿：真实耳毛剪刀尖带齿，剪不到深处
  const combParts = [];
  for (const side of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      const t = new THREE_ref.CylinderGeometry(0.16, 0.16, 1.2, 5);
      t.rotateZ(Math.PI / 2);
      t.translate(0, side * 1.4, 22 + i * 5);
      combParts.push(t);
    }
  }
  const combGeo = MergeGeometries(THREE_ref, combParts);
  for (const c of combParts) c.dispose();
  parts.push({ geo: combGeo, mat: kit.steelMirror() });

  return { parts, tipZ: 10 + bladeLen * 0.62, spin: false, scissors: true, bladeLen };
}

// 拇指灯 / 充电头灯
function BuildThumbLight(THREE_ref, kit, q) {
  const parts = [];
  // 套在拇指上的弧形壳
  const shell = new THREE_ref.CylinderGeometry(11, 11, 26, Math.max(12, q.seg), 1, true, 0, Math.PI * 1.25);
  shell.rotateX(Math.PI / 2);
  parts.push({ geo: shell, mat: kit.rubber({ color: new THREE_ref.Color(PALETTE.lavender), side: THREE_ref.DoubleSide }) });

  // 灯头：前端的小圆柱 + 透镜
  const barrel = new THREE_ref.CylinderGeometry(5.6, 6.2, 14, Math.max(10, q.seg * 0.8));
  barrel.rotateX(Math.PI / 2);
  barrel.translate(0, 0, 17);
  parts.push({ geo: barrel, mat: kit.steelDark({ color: new THREE_ref.Color(PALETTE.steelWarm), metalness: 0.8, roughness: 0.35 }) });

  const lensGeo = new THREE_ref.SphereGeometry(4.6, Math.max(10, q.seg * 0.7), 8, 0, Math.PI * 2, 0, Math.PI * 0.5);
  lensGeo.rotateX(Math.PI / 2);
  lensGeo.translate(0, 0, 24);
  parts.push({ geo: lensGeo, mat: kit.glow({ emissiveIntensity: 1.8 }) });

  // 三档拨片（真实拇指灯有三档亮度开关）
  for (let i = 0; i < 3; i++) {
    const sw = new THREE_ref.BoxGeometry(4.5, 1.6, 3.0);
    sw.translate(-3.5 + i * 3.5, -9.5, 6);
    parts.push({ geo: sw, mat: kit.glow({ emissiveIntensity: i === 0 ? 1.5 : 0.25, color: new THREE_ref.Color(PALETTE.mintAccent) }) });
  }

  const light = new THREE_ref.PointLight(new THREE_ref.Color(PALETTE.honey), 0.0, 180, 2);
  light.position.set(0, 0, 26);

  return { parts, tipZ: 26, spin: false, light, hasLight: true };
}

// 双氧水 / 清洁消毒液
function BuildPeroxideBottle(THREE_ref, kit, q) {
  const built = BuildEarDrops(THREE_ref, kit, q);
  // 双氧水用更高的瓶身、不同标签色
  for (const p of built.parts) {
    if (p.mat && p.mat === kit.made.get("glass")) { /* 保持玻璃 */ }
  }
  const bodyR = 8.5, bodyLen = 40;
  const prof = [];
  for (let i = 0; i <= 12; i++) {
    const t = i / 12;
    let r = bodyR;
    if (t < 0.07) r = bodyR * Math.sin((t / 0.07) * (Math.PI / 2)) * 0.8;
    if (t > 0.88) r = bodyR * Math.cos(((t - 0.88) / 0.12) * (Math.PI / 2)) * 0.55 + 2.6;
    prof.push(new THREE_ref.Vector2(Math.max(0.4, r), t * bodyLen));
  }
  const body = new THREE_ref.LatheGeometry(prof, Math.max(12, q.seg));
  body.rotateX(-Math.PI / 2);
  body.rotateX(Math.PI);           // 瓶口朝 +z
  body.translate(0, 0, -bodyLen / 2 + 6);
  // 标签：一圈色带，标明是消毒液而不是药液
  const label = new THREE_ref.CylinderGeometry(bodyR * 1.02, bodyR * 1.02, 12, Math.max(12, q.seg), 1, true);
  label.rotateX(Math.PI / 2);
  label.translate(0, 0, -bodyLen / 2 + 6 - bodyLen * 0.15);
  const cap = new THREE_ref.CylinderGeometry(5.4, 5.4, 9, Math.max(10, q.seg * 0.8));
  cap.rotateX(Math.PI / 2);
  cap.translate(0, 0, 6 + 4.5);

  return {
    parts: [
      { geo: body, mat: kit.glass({ color: new THREE_ref.Color(PALETTE.mint) }) },
      { geo: label, mat: kit.rubber({ color: new THREE_ref.Color(PALETTE.mintAccent), roughness: 0.7, side: THREE_ref.DoubleSide }) },
      { geo: cap, mat: kit.steelDark({ color: new THREE_ref.Color(PALETTE.ceramic), metalness: 0.05, roughness: 0.6 }) },
    ],
    tipZ: 11, spin: false, emit: true,
    drops: built.drops, dropGeo: built.dropGeo, dropperLen: 11,
  };
}

// 可视耳勺：杆 + 摄像头 + LED 环灯
function BuildVisualEarPick(THREE_ref, kit, q) {
  const parts = [];
  const shaftLen = 120, camLen = 18;

  // 杆：细长带轻微弯（真实可视耳勺是弹性细杆，能随耳道弯）
  const prof = [];
  for (let i = 0; i <= 14; i++) {
    const t = i / 14;
    let r = 2.4 - 1.5 * Math.pow(t, 0.65);
    if (t < 0.16) r = 2.4 + 0.07 * Math.sin((t / 0.16) * Math.PI * 6);
    prof.push(new THREE_ref.Vector2(Math.max(0.35, r), t * shaftLen));
  }
  const shaft = new THREE_ref.LatheGeometry(prof, q.seg);
  shaft.rotateX(Math.PI / 2);
  shaft.translate(0, 0, -shaftLen / 2 - camLen / 2 + 2);
  BendAlongZ(THREE_ref, shaft, -shaftLen, 0, 0.55, 0.3, 1.3);
  parts.push({ geo: shaft, mat: kit.steelWarm() });

  // 摄像头模块：前端的小圆柱 + 镜头
  const cam = new THREE_ref.CylinderGeometry(2.9, 3.1, camLen, Math.max(12, q.seg * 0.8));
  cam.rotateX(Math.PI / 2);
  cam.translate(0, 0, 4);
  parts.push({ geo: cam, mat: kit.steelDark({ color: new THREE_ref.Color(PALETTE.steelWarm), metalness: 0.85, roughness: 0.3 }) });

  // 镜头：微微内凹的深色玻璃
  const lens = new THREE_ref.SphereGeometry(1.9, Math.max(10, q.seg * 0.7), 8, 0, Math.PI * 2, Math.PI * 0.25, Math.PI * 0.5);
  lens.scale(1, 1, 0.55);
  lens.translate(0, 0, 13);
  parts.push({ geo: lens, mat: kit.glass({ color: new THREE_ref.Color(PALETTE.ink), opacity: 0.9, roughness: 0.05, metalness: 0.4 }) });

  // LED 环灯：一圈小发光点
  const ledCount = q.extra ? 8 : 5;
  const ledParts = [];
  for (let i = 0; i < ledCount; i++) {
    const a = (i / ledCount) * Math.PI * 2;
    const led = new THREE_ref.SphereGeometry(0.55, 6, 5);
    led.translate(Math.cos(a) * 2.6, Math.sin(a) * 2.6, 12.2);
    ledParts.push(led);
  }
  const ledGeo = MergeGeometries(THREE_ref, ledParts);
  for (const l of ledParts) l.dispose();
  parts.push({ geo: ledGeo, mat: kit.glow({ emissiveIntensity: 1.7 }) });

  // 微小的刮取刃：可视耳勺前端通常带一个软硅胶勺
  const scoop = MakeScoopHead(THREE_ref, {
    width: 3.8, length: 8, depth: 1.0, rimH: 0.16,
    stations: Math.max(3, q.scoopStations - 2), perim: Math.max(5, q.scoopPerim - 4),
  });
  scoop.rotateZ(Math.PI);
  scoop.rotateX(-Math.PI / 2);
  scoop.translate(0, 0, 2);
  parts.push({ geo: scoop, mat: kit.steelDark({ color: new THREE_ref.Color(PALETTE.steelWarm), metalness: 0.7, roughness: 0.4 }) });

  const light = new THREE_ref.PointLight(new THREE_ref.Color(PALETTE.honey), 0.0, 150, 2);
  light.position.set(0, 0, 14);

  return { parts, tipZ: 13.5, spin: false, light, hasLight: true, camera: true };
}

// ── 建造器注册表：id → 建模函数 ──────────────────────────────
const TOOL_BUILDERS = {
  earPickBamboo: BuildEarPickBamboo,
  earPickSteel: BuildEarPickSteel,
  earSpoonRound: BuildEarSpoonRound,
  earCurette: BuildEarCurette,
  earRake: BuildEarRake,
  gooseFeatherBig: (T, k, q) => BuildGooseFeather(T, k, q, true),
  gooseFeatherSmall: (T, k, q) => BuildGooseFeather(T, k, q, false),
  horsehairStick: BuildHorsehairStick,
  chickenFeather: BuildChickenFeather,
  tuningFork: BuildTuningFork,
  earForceps: BuildEarForceps,
  cottonSwab: BuildCottonSwab,
  earDrops: BuildEarDrops,
  earSyringe: BuildEarSyringe,
  earVacuum: BuildEarVacuum,
  otoscope: BuildOtoscope,
  earHairScissors: BuildEarHairScissors,
  thumbLight: BuildThumbLight,
  peroxideBottle: BuildPeroxideBottle,
  visualEarPick: BuildVisualEarPick,
};

// ── 对外 API ─────────────────────────────────────────────────

export function ToolIds() {
  return EAR_TOOLS.map((t) => t.id);
}

export function BuildTool(THREE_unused, { id, materials, quality } = {}) {
  const THREE_ref = THREE;                       // 本模块自己 import 了 three，参数只是契约占位
  const spec = EAR_TOOL_BY_ID[id];
  if (!spec) throw new Error(`[Script_Tools] 未知工具 id: ${id}`);
  const builder = TOOL_BUILDERS[id];
  if (!builder) throw new Error(`[Script_Tools] 工具 ${id} 还没有建模实现`);

  const q = QualityOf(quality);
  const kit = MakeMaterialKit(THREE_ref, materials);
  const built = builder(THREE_ref, kit, q);

  const group = new THREE_ref.Group();
  group.name = `Tool_${id}`;
  group.userData.toolId = id;

  const ownedGeometries = new Set();
  const meshes = [];

  // ① 普通部件
  for (const { geo, mat } of built.parts) {
    const mesh = new THREE_ref.Mesh(geo, mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.baseGeometry = geo;
    group.add(mesh);
    meshes.push(mesh);
    ownedGeometries.add(geo);
  }
  // ② 实例化部件（羽毛、绒毛）
  if (built.instanced) {
    for (const { mesh } of built.instanced) {
      mesh.castShadow = true;
      group.add(mesh);
      meshes.push(mesh);
      ownedGeometries.add(mesh.geometry);
    }
  }
  // ③ 动态挂件（液滴、水柱、光晕、灯环）
  //    这些不是 parts 里的东西，必须单独登记几何，否则 dispose 会漏。
  const dangling = [built.drops, built.jet, built.drip, built.halo, built.led];
  for (const thing of dangling) {
    const list = Array.isArray(thing) ? thing : (thing ? [thing] : []);
    for (const mesh of list) {
      group.add(mesh);
      if (mesh.geometry) ownedGeometries.add(mesh.geometry);
    }
  }
  if (built.light) group.add(built.light);
  if (built.spot) { group.add(built.spot); group.add(built.spot.target); }

  // ④ 归位：把几何整体居中，并统一缩放，使 z 跨度恰好 = lengthMm
  //    这样 tip 必然落在 (0, 0, +lengthMm/2)，不需要每件工具手工对长度。
  const box = new THREE_ref.Box3();
  group.updateMatrixWorld(true);
  for (const mesh of meshes) {
    mesh.geometry.computeBoundingBox();
    const bb = mesh.geometry.boundingBox.clone();
    bb.applyMatrix4(mesh.matrixWorld);
    box.union(bb);
  }
  const size = box.getSize(new THREE_ref.Vector3());
  const center = box.getCenter(new THREE_ref.Vector3());
  for (const mesh of meshes) mesh.position.z -= center.z;
  // 缩放到契约长度（保留真实比例，不拉伸）
  const scale = size.z > 1e-4 ? spec.lengthMm / size.z : 1;
  if (Math.abs(scale - 1) > 1e-3) group.scale.setScalar(scale);

  // ⑤ tip：接触判定的最前端。挂在一个 pivot 上，位置 = (0,0,+halfZ)
  const tip = new THREE_ref.Object3D();
  tip.name = `Tip_${id}`;
  // builder 标出的工作端仍在局部空间，不能先乘 scale 再让父节点重复缩放。
  tip.position.set(0, 0, (built.tipZ ?? box.max.z) - center.z);
  group.add(tip);

  // ⑥ 摆动/动画用的形变器
  //    只对**该变形的那块几何**（羽轴 / 马尾束 / 橡皮球）做顶点级形变，
  //    对整把工具的第一个 mesh 做会把竹签和勺头一起甩歪。
  const deformTarget = built.deformGeo || null;
  const deformer = deformTarget ? MakeSwayDeformer(THREE_ref, deformTarget, { spin: true, swipe: true, axis: "z" }) : null;
  const baseTinePositions = deformTarget
    ? deformTarget.attributes.position.array.slice()
    : null;

  // ⑦ 动画状态
  const state = {
    phase: 0,
    spinAngle: 0,
    vibration01: 0,
    residual: 0,        // 音叉余响
    active01: 0,
    squeeze01: 0,
    speed01: 0,
    bladeOpen: 0,
    ledOn: 0,
  };
  const basePositions = meshes.map((m) => m.position.clone());

  const axis = new THREE_ref.Vector3(0, 0, 1);

  function Update(dt, ctx = {}) {
    const d = Number.isFinite(dt) ? Math.min(0.1, Math.max(0, dt)) : 0;
    const active01 = THREE_ref.MathUtils.clamp(ctx.active01 ?? 0, 0, 1);
    const vibration01 = THREE_ref.MathUtils.clamp(ctx.vibration01 ?? 0, 0, 1);
    const squeeze01 = THREE_ref.MathUtils.clamp(ctx.squeeze01 ?? 0, 0, 1);
    const speed01 = THREE_ref.MathUtils.clamp(ctx.speed01 ?? 0, 0, 1);
    const lightOn = ctx.lightOn !== undefined ? THREE_ref.MathUtils.clamp(ctx.lightOn, 0, 1)
      : (built.hasLight ? active01 : 0);

    state.active01 = active01;
    state.squeeze01 = squeeze01;
    state.speed01 = speed01;
    // 速度直接调制动画相位：转得越快，羽毛/毛摆动越快
    state.phase += d * (0.9 + speed01 * 4.2) * (0.25 + active01);
    state.spinAngle += d * (2.0 + speed01 * 26.0) * active01;

    // ── 羽毛 / 马尾：顶点级摆动 + 绕轴旋转 ──
    if (deformer) {
      deformer(state.spinAngle, speed01, active01);
    }
    // 羽毛棒的整簇还会轻微张合（酥麻时的「开合」感）
    if (built.splay && built.instanced) {
      const inst = built.instanced[0] && built.instanced[0].mesh;
      if (inst && built.barbData) {
        const dummy = new THREE_ref.Object3D();
        const featherLen = built.featherLen || 40;
        const open = 0.55 + 0.45 * Math.sin(state.phase * 2.4) * active01;
        for (let i = 0; i < built.barbData.length && i < inst.count; i++) {
          const b = built.barbData[i];
          dummy.position.set(0, 0, -featherLen / 2 + featherLen * b.t);
          dummy.rotation.set(0, 0, 0);
          dummy.rotateZ(b.ang + state.spinAngle * 0.35);
          dummy.rotateY(Math.PI / 2 - 0.42 * open - b.jitter * 0.1);
          dummy.scale.set(1, 1, b.len * (0.9 + 0.2 * open));
          dummy.updateMatrix();
          inst.setMatrixAt(i, dummy.matrix);
        }
        inst.instanceMatrix.needsUpdate = true;
      }
    }

    // ── 音叉：高频微振 + 余响衰减 ──
    if (built.fork) {
      // 敲响后进入余响；vibration01 持续供能
      state.residual = Math.max(state.residual, vibration01);
      state.residual *= Math.pow(0.12, d);          // 约 1 秒衰减到 12%
      const amp = state.residual * 0.07;            // 视觉上「抖」，但不夸张
      const hz = 46;                                 // 视觉采样下来的高频抖动（真实 512Hz 会闪）
      const w = Math.sin(state.phase * hz) * amp;
      for (let i = 0; i < meshes.length; i++) {
        const m = meshes[i];
        if (!m.userData.baseGeometry) continue;
        m.position.x = basePositions[i].x + w * (0.4 + i * 0.25);
        m.position.y = basePositions[i].y;
      }

    }

    // ── 耳镊 / 耳毛剪：捏合动画 ──
    if (built.forceps || built.scissors) {
      const target = 1 - squeeze01;                 // squeeze=1 → 合上
      state.bladeOpen += (target - state.bladeOpen) * Math.min(1, d * 14);

      const tilt = (0.5 - state.bladeOpen) * 0.030;
      // 直接微调各部件 y 方向：镊臂看起来在开合
      for (let i = 0; i < meshes.length; i++) {
        const m = meshes[i];
        if (!m.userData.baseGeometry) continue;
        const dir = i % 2 === 0 ? 1 : -1;
        m.position.y = basePositions[i].y;
        m.rotation.z = dir * tilt * 0.4;
      }
    }

    // ── 洗耳球：捏的时候变形（球体压扁、水柱射出）──
    if (built.squeeze) {
      const k = 1 - squeeze01 * 0.28;
      if (built.bulb) built.bulb.scale.set(1 + squeeze01 * 0.18, k, k);
      if (built.jet) {
        built.jet.visible = squeeze01 > 0.08;
        if (built.jet.visible) {
          built.jet.scale.set(0.6 + squeeze01 * 0.5, 0.6 + squeeze01 * 0.5, 0.7 + squeeze01 * 0.9);
          built.jet.material.opacity = 0.25 + squeeze01 * 0.4;
        }
      }
      if (built.drip) {
        built.drip.visible = squeeze01 < 0.12 && active01 > 0.4;
        built.drip.position.set(0, 1.0, built.tipZ + 2 + Math.sin(state.phase * 3) * 0.6);
      }
    }

    // ── 滴耳液 / 双氧水：出液滴（生成 → 下落 → 回收）──
    if (built.emit && built.drops) {
      const span = built.dropperLen + 10;
      for (const drop of built.drops) {
        if (active01 > 0.5) {
          if (drop.userData.t < 0) drop.userData.t = 0;
          drop.userData.t += d;
          const t = drop.userData.t;
          drop.visible = t < 1.6;
          // 滴口先鼓起再脱离，然后下落
          const phase = t / 1.6;
          drop.position.set(0, 0, 0.6 + phase * span);
          const sc = t < 0.2 ? 0.5 + t * 2.5 : 1.0;
          drop.scale.setScalar(sc * (1 - Math.max(0, phase - 0.85) * 3));
          if (t >= 1.6) drop.userData.t = -0.35;     // 负值 = 等待下一次
        } else if (drop.userData.t < 0) {
          drop.userData.t = -0.35;
          drop.visible = false;
        } else {
          drop.userData.t = -0.35;
          drop.visible = false;
        }
      }
    }

    // ── 吸引器：管口吸气光晕 ──
    if (built.vacuum && built.halo) {
      const on = active01 * (0.55 + 0.45 * Math.abs(Math.sin(state.phase * 7)));
      built.halo.visible = on > 0.05;
      built.halo.material.emissiveIntensity = 0.4 + on * 1.6;
      built.halo.scale.setScalar(0.9 + on * 0.35);
    }

    // ── 检耳镜 / 拇指灯 / 可视耳勺：灯与镜头 ──
    if (built.hasLight) {
      if (built.light) built.light.intensity = lightOn * 2.4;
      if (built.spot) built.spot.intensity = lightOn * 4.0;
      if (built.led) {
        built.led.material.emissiveIntensity = 0.25 + lightOn * 1.9;
        built.led.visible = lightOn > 0.02;
      }
    }

    // ── 通用：握持时的轻微手持抖动，让静止的工具不像贴图 ──
    const bob = Math.sin(state.phase * 1.7) * 0.012 * (0.3 + active01);
    // 世界位姿完全由 Hand 管理，不能在局部动画里清零位置或欧拉角。
  }

  function dispose() {
    for (const g of ownedGeometries) g.dispose();
    ownedGeometries.clear();
    for (const mat of kit.made.values()) mat.dispose();
    kit.made.clear();
    for (const tex of kit.textures) tex.dispose();
    kit.textures.length = 0;
    if (built.dropGeo) built.dropGeo.dispose();
    if (built.halo) built.halo.geometry.dispose();
    group.clear();
  }

  return {
    group,
    spec,
    tip,
    tipRadius: spec.tipRadiusMm,
    axis,
    Update,
    dispose,
    // 额外暴露：面数统计与灯光引用（lead 与自测页要用）
    triangleCount: CountTriangles(THREE_ref, group),
    light: built.light || null,
    spot: built.spot || null,
  };
}

// 统计一棵子树里所有 mesh 的三角面（InstancedMesh 按实例数计）
export function CountTriangles(THREE_ref, root) {
  let tris = 0;
  root.traverse((obj) => {
    const geo = obj.geometry;
    if (!geo) return;
    const idx = geo.index;
    const count = idx ? idx.count : (geo.attributes.position ? geo.attributes.position.count : 0);
    let t = count / 3;
    if (obj.isInstancedMesh) t *= obj.count;
    tris += t;
  });
  return Math.round(tris);
}
