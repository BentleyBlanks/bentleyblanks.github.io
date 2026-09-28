// 第一关白盒体块的 PBR 外观（2026-09-28 3A 画面迭代 B1）。
//
// 口径：docs/Data_FirstLevelWhitebox0518Gap.md「2026-09-28 材质」。数据在
// Data_FirstLevelWhiteboxMaterials（语义 → 外观），风化数值在 Data_Tuning_Materials.WHITEBOX_WEATHERING，
// 风化补丁在 Script_MaterialPatches.MakeWhiteboxWeatherPatch。本模块只做三件事：
//   1. 建场前把第一关按需的贴图套下好（失败的套退回开机就有的 fallback，不卡建场）；
//   2. 外观 → 材质：走 MaterialLibrary（AO / GI / 细节法线 / 微阴影一路不少），克隆一份再挂风化补丁；
//   3. 体块 → 带风化属性的几何（瓦垄顺坡、木纹顺长边的 UV 转向；面内坐标；离地高；建筑组明度抖动），
//      以及按外观合批（BuildSink 的合并只留 position/normal/uv，风化属性要自己并）。
// 另有北沙河的水面：52 块示意水盒换成一条连续的浑水带，走 Script_Water 的河水着色。
//
// 碰撞、cover、坐标全部仍由 Script_FirstLevelWhiteboxField 的 BuildSink 登记；这里不碰。

import * as THREE from "three";
import { MakeBox, PlaceGeometry, TILE_METERS } from "./Script_Geo.mjs";
import { CloneShadedMaterial } from "./Script_Materials.mjs";
import { MakeWhiteboxWeatherPatch, MakeWhiteboxWeatherUniforms } from "./Script_MaterialPatches.mjs";
import { WHITEBOX_WEATHERING } from "./Data_Tuning_Materials.mjs";
import { CreateWaterSurface } from "./Script_Water.mjs";
import {
  WHITEBOX_LOOKS, WHITEBOX_RAILWAY_LOOKS, WHITEBOX_ROOF_SHELL as ROOF_SHELL, ResolveWhiteboxLook, WhiteboxTint,
} from "./Data_FirstLevelWhiteboxMaterials.mjs";

/** 单位盒子的 uv（每面四角 0/1），面内米坐标由它乘面尺寸得到。面序 +x,-x,+y,-y,+z,-z。 */
const UNIT_UV = new THREE.BoxGeometry(1, 1, 1).attributes.uv.array.slice();
/** 面的 U / V 分别沿哪根局部轴（0=x 1=y 2=z），与 Script_Geo.ScaleBoxUv 的面尺寸表一致。 */
const FACE_U_AXIS = [2, 2, 0, 0, 0, 0];
/**
 * 缺风化属性的几何（前沿可破坏块、铁路样条）读这组缺省：离棱 1 m、离地 1 万米、块顶 1 万米、
 * 顶点色白 —— 于是只剩色斑与朝下面压暗，不会整块被当成墙根或棱角。
 */
const DEFAULT_ATTRIBUTES = Object.freeze({ wbFace: [1, 1, 2, 2], wbSpan: [-1e4, 1e4], color: [1, 1, 1] });

const SrgbToLinear = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));

/**
 * 库材质的 userData 上挂着 AO/GI/SSR 的 uniform 包（里面有 Texture），`Material.clone()` 走 JSON
 * 拷 userData 时每份都会刷一行「Unable to serialize Texture」。克隆前先摘下、克隆完放回；
 * 克隆体随后由 InjectSurface 重新挂上同一批包。
 */
const UNIFORM_PACKS = ["ssaoUniforms", "giUniforms", "ssrUniforms", "destructionUniforms"];
function CloneLibraryMaterial(base) {
  const kept = {};
  for (const key of UNIFORM_PACKS) if (key in base.userData) { kept[key] = base.userData[key]; delete base.userData[key]; }
  let clone = null;
  try { clone = CloneShadedMaterial(base); } finally { Object.assign(base.userData, kept); }
  Object.assign(clone.userData, kept);
  return clone;
}

/**
 * 华伦式桁架一节（上下弦 + 两端竖杆 + 一对斜腹杆 + 节点板铆钉）画进 RGBA 画布：杆件不透明，其余 alpha=0。
 * 贴图 u = 沿桥一节，v = 桁高（0 = 下弦）。颜色画中性偏暖的灰，再由材质 tint 定色。
 * @param {{chordM:number, memberM:number}} spec
 * @param {number} heightM 设计桁高（换算弦杆在 v 上占多少）
 */
function MakeTrussTexture(spec, heightM = 2.4) {
  const W = 512, H = 256;
  const canvas = document.createElement("canvas");
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, W, H);
  const chord = Math.max(8, Math.round((spec.chordM / heightM) * H));
  const member = Math.max(6, Math.round((spec.memberM / heightM) * H));
  ctx.fillStyle = "#a8a39c";
  ctx.strokeStyle = "#a8a39c";
  ctx.fillRect(0, 0, W, chord);                 // 上弦（画布 y 向下 = 贴图 v 向上翻转，flipY 处理）
  ctx.fillRect(0, H - chord, W, chord);         // 下弦
  ctx.fillRect(0, 0, member, H);                // 竖杆（两节共用，画在两端各半根）
  ctx.fillRect(W - member, 0, member, H);
  ctx.lineWidth = member * 1.15;
  ctx.lineCap = "butt";
  ctx.beginPath();
  ctx.moveTo(0, H - chord / 2); ctx.lineTo(W / 2, chord / 2); ctx.lineTo(W, H - chord / 2);
  ctx.stroke();
  // 节点板与铆钉、锈迹：只在杆件上（source-atop 不越界到镂空处）
  ctx.globalCompositeOperation = "source-atop";
  let seed = 1938;
  const Rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 900; i += 1) {
    const x = Rand() * W, y = Rand() * H, r = 2 + Rand() * 10, a = 0.08 + Rand() * 0.18;
    ctx.fillStyle = Rand() < 0.55 ? `rgba(92,70,52,${a})` : `rgba(60,58,55,${a})`;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }
  ctx.fillStyle = "rgba(40,38,36,0.55)";
  for (const cx of [0, W / 2, W]) for (const cy of [chord / 2, H - chord / 2]) {
    for (let k = 0; k < 6; k += 1) {
      const x = cx + (k % 3 - 1) * 9, y = cy + (k < 3 ? -5 : 5);
      ctx.beginPath(); ctx.arc(x, y, 2.4, 0, Math.PI * 2); ctx.fill();
    }
  }
  ctx.globalCompositeOperation = "source-over";
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.anisotropy = 4;
  return texture;
}

/**
 * 下第一关按需贴图集（阶段 A 的 MaterialLibrary.LoadLevelSets，永不 reject）。
 * 返回退回了 fallback 的套名集合（外观据此改用 fallbackTint）。没有加载口的库（Node 替身）返回空集。
 */
export async function LoadWhiteboxTextureSets(library) {
  if (typeof library?.LoadLevelSets !== "function") return new Set();
  const report = await library.LoadLevelSets("FirstLevel");
  return new Set((report?.failed || []).map((item) => item.name));
}

/** 按外观合并一串带风化属性的几何（位置已在世界系）。 */
export function MergeWhiteboxGeometries(list) {
  const parts = list.filter(Boolean);
  let vertexCount = 0, indexCount = 0;
  for (const g of parts) { vertexCount += g.attributes.position.count; indexCount += g.index.count; }
  const layout = [["position", 3], ["normal", 3], ["uv", 2], ["color", 3], ["wbFace", 4], ["wbSpan", 2]];
  const arrays = Object.fromEntries(layout.map(([name, size]) => [name, new Float32Array(vertexCount * size)]));
  const index = vertexCount > 65535 ? new Uint32Array(indexCount) : new Uint16Array(indexCount);
  let vo = 0, io = 0;
  for (const g of parts) {
    const count = g.attributes.position.count;
    for (const [name, size] of layout) arrays[name].set(g.attributes[name].array.subarray(0, count * size), vo * size);
    const src = g.index.array;
    for (let i = 0; i < src.length; i += 1) index[io + i] = src[i] + vo;
    io += src.length; vo += count;
    g.dispose();
  }
  const merged = new THREE.BufferGeometry();
  for (const [name, size] of layout) merged.setAttribute(name, new THREE.BufferAttribute(arrays[name], size));
  merged.setIndex(new THREE.BufferAttribute(index, 1));
  merged.computeBoundingSphere();
  return merged;
}

export class WhiteboxLooks {
  /**
   * @param {object} library MaterialLibrary
   * @param {Set<string>} failedSets LoadWhiteboxTextureSets 的结果（退回了 fallback 的按需套）
   */
  constructor(library, failedSets = new Set()) {
    this.library = library;
    this.failed = failedSets;
    this.weather = MakeWhiteboxWeatherUniforms(WHITEBOX_WEATHERING);
    this.cache = new Map();
    this.stats = { looks: {}, fallbackSets: [...failedSets] };
  }

  /** 这块该用哪个外观（null = 不归外观表管）。 */
  LookOf(block) { return ResolveWhiteboxLook(block); }

  /**
   * 外观 → 材质（同一外观 + 同一 UV 单位只建一次）。
   * @param {string} lookName
   * @param {{uvUnitM?:number}} options UV 一个单位代表多少米（白盒体块是 1 米；铁路样条是 TILE_METERS 的格）
   */
  Material(lookName, { uvUnitM = 1 } = {}) {
    const key = `${lookName}|${uvUnitM}`;
    const cached = this.cache.get(key);
    if (cached) return cached;
    const look = WHITEBOX_LOOKS[lookName];
    if (!look) return null;
    let material = null;
    if (look.plain) {
      material = CloneLibraryMaterial(this.library.Plain(`FirstLevelWhitebox_${lookName}`, look.plain));
    } else {
      // 按需套失败时加载器已把 fallback 借给同名（Script_LevelTextureSets），名字不变、只换 tint。
      const fallback = this.failed.has(look.set);
      const setName = look.set;
      const tint = fallback ? (look.fallbackTint ?? look.tint ?? 0xffffff) : (look.tint ?? 0xffffff);
      let base;
      try {
        base = this.library.Get(setName, {
          repeat: uvUnitM / look.tileM, normalScale: look.normalScale ?? 1,
          roughness: look.roughness ?? 1, metalness: look.metalness ?? 0, color: tint,
        });
      } catch (error) {
        console.warn(`[WhiteboxLooks] ${lookName}: set ${setName} not baked`, error);
        base = this.library.Plain(`FirstLevelWhitebox_${lookName}`, { color: tint, roughness: 0.85 });
      }
      material = CloneLibraryMaterial(base);
      material.vertexColors = true;
      material.defaultAttributeValues = { ...DEFAULT_ATTRIBUTES };
      this.library.InjectSurface(material, MakeWhiteboxWeatherPatch(this.weather, look.weather ?? 1, look.peel || null));
      // 贴图本身偏暗的套（青砖）整体提一档：tint 是十六进制、最多到白，提亮只能乘在克隆体的颜色上
      if (look.brightness) material.color.multiplyScalar(look.brightness);
      if (look.truss && typeof document !== "undefined") {
        // 桁架：反照率换成运行时画的镂空节（alphaTest）；双面，从一侧的空当看得见另一片桁的背面。
        material.map = MakeTrussTexture(look.truss);
        material.alphaTest = 0.5;
        material.side = THREE.DoubleSide;
        material.userData.ownedMap = true;
        material.needsUpdate = true;
      }
    }
    material.name = `FirstLevelWhitebox_${lookName}`;
    material.userData.firstLevelWhitebox = true;
    material.userData.whiteboxLook = lookName;
    this.cache.set(key, material);
    return material;
  }

  /** 铁路样条（Script_RoadSpline）用语义键进合批：键 → 材质（UV 单位按样条自己的格子）。 */
  RailwayMaterial(key) {
    const entry = WHITEBOX_RAILWAY_LOOKS[key];
    if (!entry) return null;
    return this.Material(entry.look, { uvUnitM: TILE_METERS[entry.uvUnit] ?? 1 });
  }

  /**
   * 一块体块 → 世界系几何（带 uv 转向与风化属性）。
   * @param {{id,x,y,z,w,h,d,ry?}} block
   * @param {string} look
   * @param {(x:number,z:number)=>number} groundAt 地形高度（不含可走面）
   * @param {{place?:boolean}} options place=false 时留在局部系（调用方自己给 mesh 设位姿）
   */
  BoxGeometry(block, look, groundAt, { place = true } = {}) {
    const { w, h, d } = block;
    const geometry = MakeBox(w, h, d, 1, block.id);
    const uv = geometry.attributes.uv.array;
    const count = geometry.attributes.position.count;
    const face = new Float32Array(count * 4);
    const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
    const spec = WHITEBOX_LOOKS[look];
    const mode = spec?.uv;
    const longAxis = w >= h && w >= d ? 0 : (h >= d ? 1 : 2);
    // 桁架：两个大竖面（长边所在的那对）按一节 panelM 铺，其余面取贴图里的实心弦杆
    const trussFaces = d >= w ? [0, 1] : [4, 5];
    for (let f = 0; f < 6; f += 1) {
      const [su, sv] = dims[f];
      // 瓦：顶/底面的瓦垄转到沿水平短边（顺坡，垂直于脊）；木：纹理 V 顺盒子最长边。
      const swap = mode === "roof" ? (f === 2 || f === 3) && d > w
        : mode === "grain" ? FACE_U_AXIS[f] === longAxis : false;
      for (let k = 0; k < 4; k += 1) {
        const i = f * 4 + k;
        face[i * 4] = UNIT_UV[i * 2] * su;
        face[i * 4 + 1] = UNIT_UV[i * 2 + 1] * sv;
        face[i * 4 + 2] = su;
        face[i * 4 + 3] = sv;
        if (swap) { const u = uv[i * 2]; uv[i * 2] = uv[i * 2 + 1]; uv[i * 2 + 1] = u; }
        if (mode === "truss") {
          const panel = spec.truss.panelM;
          if (trussFaces.includes(f)) { uv[i * 2] = UNIT_UV[i * 2] * su / panel; uv[i * 2 + 1] = UNIT_UV[i * 2 + 1]; }
          else { uv[i * 2] = 0.25; uv[i * 2 + 1] = 0.03; }
        }
      }
    }
    geometry.setAttribute("wbFace", new THREE.BufferAttribute(face, 4));
    const out = place ? PlaceGeometry(geometry, { x: block.x, y: block.y, z: block.z, ry: block.ry || 0 }) : geometry;
    if (place) geometry.dispose();
    const position = out.attributes.position.array;
    const span = new Float32Array(count * 2), color = new Float32Array(count * 3);
    const top = block.y + h / 2;
    const tint = WhiteboxTint(block, look).map(SrgbToLinear);
    const c = Math.cos(block.ry || 0), s = Math.sin(block.ry || 0);
    for (let i = 0; i < count; i += 1) {
      let x = position[i * 3], z = position[i * 3 + 2];
      // 局部系：按块的位姿换到世界系再采地面（与 PlaceGeometry 同一个 YXZ / ry 约定）
      if (!place) { const lx = x, lz = z; x = block.x + lx * c + lz * s; z = block.z - lx * s + lz * c; }
      span[i * 2] = groundAt ? groundAt(x, z) : -1e4;
      span[i * 2 + 1] = top;
      color[i * 3] = tint[0]; color[i * 3 + 1] = tint[1]; color[i * 3 + 2] = tint[2];
    }
    out.setAttribute("wbSpan", new THREE.BufferAttribute(span, 2));
    out.setAttribute("color", new THREE.BufferAttribute(color, 3));
    this.stats.looks[look] = (this.stats.looks[look] || 0) + 1;
    return out;
  }

  /**
   * 按外观分桶的体块 → 合批网格（每个外观一只）。桶里是 BoxGeometry 的产物。
   * @returns {THREE.Mesh[]}
   */
  FlushBuckets(buckets, scene, name) {
    const meshes = [];
    for (const [look, list] of buckets) {
      if (!list.length) continue;
      const mesh = new THREE.Mesh(MergeWhiteboxGeometries(list), this.Material(look));
      mesh.name = name;
      mesh.userData.whiteboxLook = look;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      scene.add(mesh);
      meshes.push(mesh);
    }
    buckets.clear();
    return meshes;
  }

  /**
   * 一个坡顶的两片斜瓦面 + 一道脊（只是外观几何，见 PlanRoofShells）。产物是世界系、带风化属性，
   * 直接进 "roofTile" 外观的桶。瓦面是一块薄板把顶点按坡面抬起：顶 / 底面的法线跟着坡倾斜，
   * 两个端面（山墙那头）仍是竖直的，法线不变。
   */
  RoofShellGeometries(shell, groundAt) {
    const { alongZ, cx, cz, len, outerA, eaveTop, slope } = shell;
    const thick = ROOF_SHELL.thick, lift = ROOF_SHELL.lift;
    const Plane = (a) => eaveTop + slope * (outerA - a) + lift;
    const out = [];
    for (const side of [-1, 1]) {
      const half = (outerA + ROOF_SHELL.overhang) / 2, offset = side * half;
      const block = { id: `${shell.id}Shell${side}`, y: 0, h: thick,
        x: alongZ ? cx + offset : cx, z: alongZ ? cz : cz + offset,
        w: alongZ ? half * 2 : len, d: alongZ ? len : half * 2 };
      const geometry = this.BoxGeometry(block, "roofTile", groundAt);
      const position = geometry.attributes.position, normal = geometry.attributes.normal, span = geometry.attributes.wbSpan;
      // 坡面法线：y = Plane(a)，a 沿外侧方向 u 增大，dy/da = -slope → n ∝ (slope·u, 1)
      const inv = 1 / Math.hypot(slope, 1), nu = slope * side * inv, ny = inv;
      for (let i = 0; i < position.count; i += 1) {
        const px = position.getX(i), pz = position.getZ(i), top = position.getY(i) > 0;
        const a = Math.min(outerA + ROOF_SHELL.overhang, Math.abs(alongZ ? px - cx : pz - cz));
        position.setY(i, Plane(a) + (top ? thick : 0));
        const n = normal.getY(i);
        if (Math.abs(n) > 0.5) {
          const s = n > 0 ? 1 : -1;
          normal.setXYZ(i, alongZ ? s * nu : 0, s * ny, alongZ ? 0 : s * nu);
        }
        span.setY(i, Plane(0) + thick);
      }
      out.push(geometry);
    }
    // 脊：两片瓦面在 a = 0 处相交，上面压一道筒瓦脊
    const ridgeY = Plane(0) + thick - 0.04;
    out.push(this.BoxGeometry({ id: `${shell.id}ShellRidge`, y: ridgeY + ROOF_SHELL.ridgeH / 2, h: ROOF_SHELL.ridgeH,
      x: cx, z: cz, w: alongZ ? ROOF_SHELL.ridgeW : len + 0.1, d: alongZ ? len + 0.1 : ROOF_SHELL.ridgeW }, "roofTile", groundAt));
    return out;
  }

  Dispose() {
    for (const material of this.cache.values()) {
      if (material.userData.ownedMap) material.map?.dispose();
      material.dispose();
    }
    this.cache.clear();
  }
}

/**
 * 北沙河水面：把沿河铺的示意水盒（同一条河、6 m 一段、顶面高度随槽底起伏）换成一条连续的
 * 浑水带，相邻两段的接缝取两段顶面的平均高，不再是一级级的台阶。水走 Script_Water 的
 * 河水着色（菲涅耳天空反射 + SSR + 按身后河床深度吸收 + 岸线泡沫），流向顺河（+x 方向缓流）。
 * @param {Array} blocks semantic === "water" 的体块（同一条河，z 相同）
 * @returns {THREE.Mesh|null}
 */
export function BuildWhiteboxWater(blocks, scene, { preset = "muddyRiver", name = "FirstLevelWhitebox_Water" } = {}) {
  if (!blocks.length || typeof document === "undefined") return null;
  const sorted = blocks.slice().sort((a, b) => a.x - b.x);
  // 按 x 连续性切成几条（浅滩处断开）
  const runs = [];
  for (const block of sorted) {
    const run = runs[runs.length - 1];
    const prev = run?.[run.length - 1];
    if (prev && block.x - block.w / 2 <= prev.x + prev.w / 2 + 0.01) run.push(block);
    else runs.push([block]);
  }
  const positions = [], uvs = [], normals = [], indices = [];
  const across = 6;       // 横向分段：Gerstner 顶点位移要有顶点可动
  for (const run of runs) {
    const edges = [];
    for (let i = 0; i <= run.length; i += 1) {
      const a = run[Math.max(0, i - 1)], b = run[Math.min(run.length - 1, i)];
      const x = i === 0 ? b.x - b.w / 2 : i === run.length ? a.x + a.w / 2 : (a.x + a.w / 2 + b.x - b.w / 2) / 2;
      const y = ((a.y + a.h / 2) + (b.y + b.h / 2)) / 2 - 0.04;
      const half = (a.d + b.d) / 4;
      edges.push({ x, y, z: (a.z + b.z) / 2, half });
    }
    // 每段再细分到 ~2 m 一格
    const rows = [];
    for (let i = 0; i < edges.length - 1; i += 1) {
      const e0 = edges[i], e1 = edges[i + 1], steps = Math.max(1, Math.round((e1.x - e0.x) / 2));
      for (let s = i === 0 ? 0 : 1; s <= steps; s += 1) {
        const t = s / steps;
        rows.push({ x: e0.x + (e1.x - e0.x) * t, y: e0.y + (e1.y - e0.y) * t,
          z: e0.z + (e1.z - e0.z) * t, half: e0.half + (e1.half - e0.half) * t });
      }
    }
    const base = positions.length / 3;
    for (const row of rows) {
      for (let j = 0; j <= across; j += 1) {
        const z = row.z - row.half + (2 * row.half * j) / across;
        positions.push(row.x, row.y, z); normals.push(0, 1, 0); uvs.push(row.x, z);
      }
    }
    for (let r = 0; r < rows.length - 1; r += 1) {
      for (let j = 0; j < across; j += 1) {
        const a = base + r * (across + 1) + j, b = a + 1, c = a + across + 1, d = c + 1;
        indices.push(a, b, c, b, d, c);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();
  return CreateWaterSurface({ geometry, scene, preset, name });
}
