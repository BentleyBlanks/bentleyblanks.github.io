// 静态分件合批：把一具尸体的若干分件按「着色签名」分组，组内把各自的贴图拼成一张
// 图集、UV 重映射之后合成一份几何 —— 一档距离一只 InstancedMesh 就够，不再是每个
// 材质一只。
//
// 为什么要有这一路：`MissionAftermath` 给每个（姿势原型 × 身体分件）克隆一份材质，
// 一具军人尸体有 4—7 个 GLB 材质、一具平民有 23—24 个分件，于是一档距离就是 4—24 只
// 网格。第一关实测每帧尸体层提交 283（车厢）/ 422（前沿）个 draw，而这一帧的瓶颈是
// 提交次数不是三角形（docs/Data_TechRenderPipeline.md §17.10 第 2 条）。
//
// ## 合的边界：只合「着色完全一样」的
//
// 分组键把所有会改变着色的东西都算进去：材质类别、side、vertexColors、金属度、绒光、
// 各向异性、specularIntensity、ior、法线强度、补丁列表（`PatchKeysOf`）、
// `materialShadingSurface`（POM / 细节法线 / 微阴影 / 地平线 / 皮肤那五位）、贴图槽位
// 组合。换句话说**这一路不会把皮肤和军装合成一只**——皮肤那份带 `USE_MATERIAL_SKIN`
// 的预积分次表面散射，合了就是肉眼看得见的着色变化。合进来的只有「同一种着色、只是
// 贴图不同」的分件，画面上唯一的差别是图集重采样。
//
// ORM 三合一（`FoldOrmMaps` 折过的材质，`userData.ormUniforms` 非空）把 AO / 金属度
// 藏在 roughnessMap 的 R / B 通道里，按通道重烘一张图集容易出错，所以这类材质只与
// **同一个材质对象**的分件合并（纯几何合并，不动贴图）。平民那 18 个共用一份材质的
// 分件走的就是这条，最省。
//
// ## 图集怎么烘
//
// 每个源材质取它实际用到的 UV 包围盒（军人 GLB 里 UV 常常超出 0—1，靠 RepeatWrapping
// 平铺），在画布上用 `createPattern("repeat")` 把源图按那个包围盒铺进一格，UV 再做一次
// 仿射映射打到格子里。这样平铺不会被截断，也不用把几何拆成非索引的。格子四周留几像素
// 的续画边，免得 mip 层间相邻格子互相渗色。
//
// 缩放超过一半时先把源图逐级减半（相当于自己做一层 mip），再铺 —— 画布的
// `drawImage` 一步缩到 1/4 会出摩尔纹。
//
// ## 顶点属性一个都不能丢
//
// 合并时按**所有分件属性的并集**建缓冲区，缺的那一份按语义补：`tangent` 由法线现构
// 一组正交基（没有法线贴图的格子读到的是平法线，TBN 怎么转结果都是几何法线），
// `color` 补白。丢 `color` 的后果是整片发黑 —— 见 docs §17.10 与
// `Script_FirstLevelMissionAftermath` 抬头那条事故。

import * as THREE from "three";
import { PatchKeysOf } from "./Script_MaterialPatches.mjs";

/** 图集边长上限（一张 2048² RGBA 是 16 MB；再大不值这点清晰度）。 */
const MAX_ATLAS = 2048;
/** 每格四周的续画边，单位像素。够前两三级 mip 不串格。 */
const CELL_PAD = 4;
/** 纯色格（源材质没有贴图，只有一个 color / roughness 标量）的边长。 */
const SOLID_CELL = 4;
/** UV 包围盒最多跨几个平铺；超过就不合，免得一格要几万像素。 */
const MAX_TILES = 8;

const ATLAS_SLOTS = ["map", "normalMap", "roughnessMap"];
/** 这些槽位一旦有人用就不合并：重烘它们没有把握。 */
const BLOCKING_SLOTS = ["alphaMap", "aoMap", "bumpMap", "displacementMap", "emissiveMap",
  "lightMap", "metalnessMap", "specularMap", "clearcoatMap", "clearcoatNormalMap",
  "clearcoatRoughnessMap", "sheenColorMap", "sheenRoughnessMap", "anisotropyMap",
  "iridescenceMap", "transmissionMap", "thicknessMap", "specularIntensityMap", "specularColorMap"];

function HasOrm(material) {
  return material?.userData?.ormUniforms != null;
}

function ColorsDiffer(sources) {
  const first = sources[0].color?.getHex?.() ?? -1;
  return sources.some((m) => (m.color?.getHex?.() ?? -1) !== first);
}

function RoughnessDiffers(sources) {
  return sources.some((m) => m.roughness !== sources[0].roughness);
}

/** 这一组要不要图集：一样的贴图、一样的颜色粗糙度就只合几何，不动贴图。 */
function NeedsAtlas(sources) {
  if (sources.length < 2) return false;
  if (ATLAS_SLOTS.some((slot) => sources.some((m) => m[slot]))) return true;
  return ColorsDiffer(sources) || RoughnessDiffers(sources);
}

function SlotKey(material) {
  return ATLAS_SLOTS.map((slot) => (material[slot] ? "1" : "0")).join("")
    + BLOCKING_SLOTS.map((slot) => (material[slot] ? "1" : "0")).join("");
}

/**
 * 着色签名：两份材质签名相同 ⇔ 除了贴图内容以外画出来一模一样。
 * 有贴图的材质把 `color` / `roughness` 也写进签名（那两个标量不另烘图，
 * 免得给本来只有一两个采样器的材质再加一个）。
 */
export function ShadingSignature(material) {
  const m = material;
  if (!m) return "null";
  const hasMap = !!m.map;
  const Hex = (color) => (color && color.getHex ? color.getHex() : -1);
  return JSON.stringify([
    m.type, !!m.isMeshPhysicalMaterial, !!m.isMeshStandardMaterial,
    m.side, m.shadowSide, m.vertexColors, m.transparent, m.opacity, m.alphaTest, m.alphaHash,
    m.depthWrite, m.depthTest, m.blending, m.premultipliedAlpha, m.flatShading, m.wireframe,
    m.toneMapped, m.dithering, m.forceSinglePass, m.fog, m.metalness,
    Hex(m.emissive), m.emissiveIntensity, m.aoMapIntensity, m.envMapIntensity, m.lightMapIntensity,
    m.normalMapType, m.normalScale ? [m.normalScale.x, m.normalScale.y] : null,
    m.sheen ?? -1, m.sheenRoughness ?? -1, Hex(m.sheenColor),
    m.anisotropy ?? -1, m.anisotropyRotation ?? -1,
    m.clearcoat ?? -1, m.clearcoatRoughness ?? -1, m.ior ?? -1,
    m.specularIntensity ?? -1, Hex(m.specularColor),
    m.iridescence ?? -1, m.iridescenceIOR ?? -1, m.transmission ?? -1, m.thickness ?? -1,
    hasMap ? Hex(m.color) : "-", hasMap ? m.roughness : "-",
    SlotKey(m), PatchKeysOf(m).join("|"),
    JSON.stringify(m.userData?.materialShadingSurface ?? null),
    // ORM 折过的材质只与自己合（AO / 金属度藏在 roughnessMap 的通道里）
    HasOrm(m) ? m.uuid : "",
  ]);
}

// ===========================================================================
// 几何
// ===========================================================================

function TriangleCount(geometry) {
  const count = geometry.index ? geometry.index.count : geometry.attributes.position.count;
  return count / 3;
}

/** 缺哪个属性就现补一份语义上等价的。 */
function FillAttribute(name, itemSize, count, geometry) {
  const array = new Float32Array(count * itemSize);
  if (name === "tangent") {
    // 没有法线贴图的格子读到的是平法线，TBN 用哪组正交基结果都是几何法线；
    // 这里只要保证切线与法线不共线，否则 three 算 bitangent 会得到 NaN。
    const normal = geometry.attributes.normal;
    for (let i = 0; i < count; i += 1) {
      let nx = 0, ny = 1, nz = 0;
      if (normal) { nx = normal.getX(i); ny = normal.getY(i); nz = normal.getZ(i); }
      const ax = Math.abs(ny) < 0.9 ? 0 : 1, ay = Math.abs(ny) < 0.9 ? 1 : 0;
      let tx = ay * nz - 0 * ny, ty = 0 * nx - ax * nz, tz = ax * ny - ay * nx;
      const len = Math.hypot(tx, ty, tz) || 1;
      tx /= len; ty /= len; tz /= len;
      array[i * 4] = tx; array[i * 4 + 1] = ty; array[i * 4 + 2] = tz;
      if (itemSize > 3) array[i * 4 + 3] = 1;
    }
    return array;
  }
  if (name === "color" || name.startsWith("color")) array.fill(1);
  if (name === "uv1" || name === "uv2") {
    const uv = geometry.attributes.uv;
    if (uv && itemSize === 2) for (let i = 0; i < count; i += 1) { array[i * 2] = uv.getX(i); array[i * 2 + 1] = uv.getY(i); }
  }
  return array;
}

/**
 * 按属性并集合并若干几何；`uvTransforms[i]` 给第 i 份几何的 `uv` 做仿射重映射
 * （`[su, sv, tu, tv]`，`u' = u * su + tu`），不给就原样搬。
 */
export function MergeGeometries(geometries, uvTransforms = null) {
  if (geometries.length === 1 && !uvTransforms) return geometries[0];
  const names = new Map();
  for (const geometry of geometries) {
    for (const [name, attribute] of Object.entries(geometry.attributes)) {
      const size = names.get(name);
      if (size === undefined) names.set(name, attribute.itemSize);
      else if (size !== attribute.itemSize) return null; // 同名不同宽，不合
    }
  }
  // 各份几何的属性集合不一致、而并集里有 `tangent` 时不合：缺切线的那一份原本走
  // 屏幕导数现算切线基，补一组任意正交基会把它的法线贴图转错方向。
  if (names.has("tangent") && geometries.some((g) => !g.attributes.tangent)) return null;
  let vertexCount = 0, indexCount = 0;
  for (const geometry of geometries) {
    vertexCount += geometry.attributes.position.count;
    indexCount += geometry.index ? geometry.index.count : geometry.attributes.position.count;
  }
  const merged = new THREE.BufferGeometry();
  for (const [name, itemSize] of names) {
    const array = new Float32Array(vertexCount * itemSize);
    let offset = 0;
    for (let g = 0; g < geometries.length; g += 1) {
      const geometry = geometries[g], count = geometry.attributes.position.count;
      const attribute = geometry.attributes[name];
      if (!attribute) {
        array.set(FillAttribute(name, itemSize, count, geometry), offset);
      } else {
        for (let i = 0; i < count; i += 1) {
          for (let k = 0; k < itemSize; k += 1) array[offset + i * itemSize + k] = attribute.getComponent(i, k);
        }
      }
      if (name === "uv" && uvTransforms) {
        const [su, sv, tu, tv] = uvTransforms[g];
        for (let i = 0; i < count; i += 1) {
          array[offset + i * 2] = array[offset + i * 2] * su + tu;
          array[offset + i * 2 + 1] = array[offset + i * 2 + 1] * sv + tv;
        }
      }
      offset += count * itemSize;
    }
    merged.setAttribute(name, new THREE.BufferAttribute(array, itemSize));
  }
  // 顶点数过 65535 就必须换 32 位索引，否则索引静默回绕成另一块几何
  const index = vertexCount > 65535 ? new Uint32Array(indexCount) : new Uint16Array(indexCount);
  let vOffset = 0, iOffset = 0;
  for (const geometry of geometries) {
    const count = geometry.attributes.position.count, source = geometry.index;
    if (source) for (let i = 0; i < source.count; i += 1) index[iOffset + i] = source.getX(i) + vOffset;
    else for (let i = 0; i < count; i += 1) index[iOffset + i] = i + vOffset;
    iOffset += source ? source.count : count;
    vOffset += count;
  }
  merged.setIndex(new THREE.BufferAttribute(index, 1));
  merged.computeBoundingBox();
  merged.computeBoundingSphere();
  return merged;
}

// ===========================================================================
// 图集
// ===========================================================================

function MakeCanvas(width, height) {
  if (typeof OffscreenCanvas === "function") return new OffscreenCanvas(width, height);
  const canvas = document.createElement("canvas");
  canvas.width = width; canvas.height = height;
  return canvas;
}

/** 画布能不能直接画这张贴图（GLB 来的是 ImageBitmap，程序化烘的是 DataTexture）。 */
function Drawable(texture) {
  const image = texture?.image;
  if (!image) return null;
  if (typeof ImageBitmap === "function" && image instanceof ImageBitmap) return image;
  if (typeof HTMLImageElement === "function" && image instanceof HTMLImageElement) return image;
  if (typeof HTMLCanvasElement === "function" && image instanceof HTMLCanvasElement) return image;
  if (typeof OffscreenCanvas === "function" && image instanceof OffscreenCanvas) return image;
  if (image.data && image.width && image.height) {
    // DataTexture：把裸字节包成一张画布
    const canvas = MakeCanvas(image.width, image.height);
    const ctx = canvas.getContext("2d");
    const bytes = image.data;
    if (!(bytes instanceof Uint8Array) && !(bytes instanceof Uint8ClampedArray)) return null;
    const data = new Uint8ClampedArray(image.width * image.height * 4);
    if (bytes.length === data.length) data.set(bytes);
    else if (bytes.length === image.width * image.height * 3) {
      for (let i = 0, j = 0; i < data.length; i += 4, j += 3) {
        data[i] = bytes[j]; data[i + 1] = bytes[j + 1]; data[i + 2] = bytes[j + 2]; data[i + 3] = 255;
      }
    } else return null;
    ctx.putImageData(new ImageData(data, image.width, image.height), 0, 0);
    return canvas;
  }
  return null;
}

/** 逐级减半，直到不比目标大一倍 —— 画布一步缩到 1/4 会出摩尔纹。 */
function PreScale(image, targetW, targetH) {
  let source = image, width = image.width, height = image.height;
  while (width > targetW * 2 && height > targetH * 2 && width > 1 && height > 1) {
    const w = Math.max(1, width >> 1), h = Math.max(1, height >> 1);
    const canvas = MakeCanvas(w, h), ctx = canvas.getContext("2d");
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = "high";
    ctx.drawImage(source, 0, 0, w, h);
    source = canvas; width = w; height = h;
  }
  return source;
}

/** 架子式装箱：按高度降序铺行。返回总高度（放不下返回 null）。 */
function ShelfPack(cells, width, maxHeight) {
  const order = cells.map((c, i) => i).sort((a, b) => cells[b].h - cells[a].h);
  let x = 0, y = 0, shelf = 0;
  for (const i of order) {
    const cell = cells[i];
    if (cell.w > width) return null;
    if (x + cell.w > width) { y += shelf; x = 0; shelf = 0; }
    cell.x = x; cell.y = y;
    x += cell.w; shelf = Math.max(shelf, cell.h);
  }
  const total = y + shelf;
  return total > maxHeight ? null : total;
}

function NextPot(value) {
  let n = 1;
  while (n < value) n *= 2;
  return n;
}

/**
 * 为一组源材质烘一套图集。
 * @returns {{textures:object, cells:Map<string,{u0,v0,su,sv}>, canvases:Array}|null}
 */
function BuildAtlas(sources, uvBoxes, { maxAtlas = MAX_ATLAS, pad = CELL_PAD } = {}) {
  const anyMap = sources.some((m) => m.map);
  const active = ATLAS_SLOTS.filter((slot) => sources.some((m) => m[slot]));
  // 源材质都没有贴图时，把各自的 color / roughness 烘成纯色格（合并后材质的
  // color 设成白、roughness 设成 1，乘回来一模一样）。
  if (!anyMap && ColorsDiffer(sources) && !active.includes("map")) active.unshift("map");
  if (!anyMap && RoughnessDiffers(sources) && !active.includes("roughnessMap")) active.push("roughnessMap");

  // 每格要多少像素：按它实际用到的 UV 跨度 × 源图分辨率，纯色格给一个最小格。
  const cells = [];
  for (const material of sources) {
    const box = uvBoxes.get(material.uuid);
    if (!box) return null;
    const spanU = box.u1 - box.u0, spanV = box.v1 - box.v0;
    if (!(spanU > 0) || !(spanV > 0)) return null;
    if (spanU > MAX_TILES || spanV > MAX_TILES) return null;
    let w = SOLID_CELL, h = SOLID_CELL;
    for (const slot of active) {
      const texture = material[slot];
      if (!texture?.image) continue;
      if (texture.wrapS !== THREE.RepeatWrapping && (box.u0 < 0 || box.u1 > 1)) return null;
      if (texture.wrapT !== THREE.RepeatWrapping && (box.v0 < 0 || box.v1 > 1)) return null;
      if (texture.offset.x !== 0 || texture.offset.y !== 0) return null;
      if (texture.repeat.x !== 1 || texture.repeat.y !== 1) return null;
      w = Math.max(w, Math.ceil(spanU * texture.image.width));
      h = Math.max(h, Math.ceil(spanV * texture.image.height));
    }
    cells.push({ material, box, w: 0, h: 0, baseW: w, baseH: h, x: 0, y: 0 });
  }

  // 统一缩放系数：先按面积估一把，再折半试到装得下。
  const area = cells.reduce((sum, c) => sum + (c.baseW + pad * 2) * (c.baseH + pad * 2), 0);
  const width = Math.min(maxAtlas, Math.max(NextPot(Math.ceil(Math.sqrt(area))),
    NextPot(Math.min(maxAtlas, Math.max(...cells.map((c) => c.baseW + pad * 2))))));
  let scale = 1, height = null;
  for (let attempt = 0; attempt < 12; attempt += 1) {
    for (const cell of cells) {
      cell.w = Math.max(SOLID_CELL, Math.round(cell.baseW * scale)) + pad * 2;
      cell.h = Math.max(SOLID_CELL, Math.round(cell.baseH * scale)) + pad * 2;
    }
    height = ShelfPack(cells, width, maxAtlas);
    if (height !== null) break;
    scale *= 0.75;
  }
  if (height === null) return null;
  const atlasW = width, atlasH = NextPot(height);

  const canvases = [], textures = {};
  for (const slot of active) {
    const canvas = MakeCanvas(atlasW, atlasH);
    const ctx = canvas.getContext("2d", { alpha: true });
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = "high";
    ctx.fillStyle = slot === "normalMap" ? "rgb(128,128,255)" : "rgb(255,255,255)";
    ctx.fillRect(0, 0, atlasW, atlasH);
    for (const cell of cells) {
      const texture = cell.material[slot];
      const inner = { x: cell.x + pad, y: cell.y + pad, w: cell.w - pad * 2, h: cell.h - pad * 2 };
      ctx.save();
      ctx.beginPath(); ctx.rect(cell.x, cell.y, cell.w, cell.h); ctx.clip();
      const image = texture ? Drawable(texture) : null;
      if (texture && !image) { ctx.restore(); return null; }
      if (image) {
        const spanU = cell.box.u1 - cell.box.u0, spanV = cell.box.v1 - cell.box.v0;
        const scaled = PreScale(image, inner.w / spanU, inner.h / spanV);
        const pattern = ctx.createPattern(scaled, "repeat");
        if (!pattern) { ctx.restore(); return null; }
        const a = inner.w / (scaled.width * spanU);
        const e = inner.x - inner.w * cell.box.u0 / spanU;
        const flip = texture.flipY === true;
        const d = (flip ? -1 : 1) * inner.h / (scaled.height * spanV);
        const f = flip ? inner.y + inner.h * (1 - cell.box.v0) / spanV
          : inner.y - inner.h * cell.box.v0 / spanV;
        pattern.setTransform(new DOMMatrix([a, 0, 0, d, e, f]));
        // `copy` 而不是默认的 `source-over`：源图带半透明像素时叠在白底上会把
        // 颜色拉浅（画布合成是预乘的），而着色器读的是未预乘的原值。
        ctx.globalCompositeOperation = "copy";
        ctx.fillStyle = pattern;
        ctx.fillRect(cell.x, cell.y, cell.w, cell.h);
      } else if (slot === "map") {
        ctx.fillStyle = "#" + (cell.material.color
          ? cell.material.color.getHexString(THREE.SRGBColorSpace) : "ffffff");
        ctx.fillRect(cell.x, cell.y, cell.w, cell.h);
      } else if (slot === "roughnessMap") {
        const level = Math.round(Math.min(1, Math.max(0, cell.material.roughness ?? 1)) * 255);
        ctx.fillStyle = `rgb(${level},${level},${level})`;
        ctx.fillRect(cell.x, cell.y, cell.w, cell.h);
      }
      ctx.restore();
    }
    // 源材质本来就带 roughnessMap 时，标量在合并后的材质上统一设成 1，
    // 所以这里要把各自的标量乘进图集（画布的 multiply 就是逐通道字节相乘）。
    if (slot === "roughnessMap") {
      for (const cell of cells) {
        const factor = cell.material[slot] ? (cell.material.roughness ?? 1) : 1;
        if (factor >= 0.999) continue;
        ctx.save();
        ctx.globalCompositeOperation = "multiply";
        const level = Math.round(Math.min(1, Math.max(0, factor)) * 255);
        ctx.fillStyle = `rgb(${level},${level},${level})`;
        ctx.fillRect(cell.x, cell.y, cell.w, cell.h);
        ctx.restore();
      }
    }
    const result = new THREE.CanvasTexture(canvas);
    result.flipY = false;
    result.colorSpace = slot === "map" ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    result.wrapS = THREE.ClampToEdgeWrapping;
    result.wrapT = THREE.ClampToEdgeWrapping;
    result.generateMipmaps = true;
    result.minFilter = THREE.LinearMipmapLinearFilter;
    result.magFilter = THREE.LinearFilter;
    result.anisotropy = Math.max(1, ...sources.map((m) => m[slot]?.anisotropy || 1));
    result.needsUpdate = true;
    textures[slot] = result;
    canvases.push(canvas);
  }

  const map = new Map();
  for (const cell of cells) {
    const inner = { x: cell.x + pad, y: cell.y + pad, w: cell.w - pad * 2, h: cell.h - pad * 2 };
    const spanU = cell.box.u1 - cell.box.u0, spanV = cell.box.v1 - cell.box.v0;
    // u' = (inner.x + (u - u0) / spanU * inner.w) / atlasW
    map.set(cell.material.uuid, {
      su: inner.w / (spanU * atlasW),
      tu: (inner.x - inner.w * cell.box.u0 / spanU) / atlasW,
      sv: inner.h / (spanV * atlasH),
      tv: (inner.y - inner.h * cell.box.v0 / spanV) / atlasH,
    });
  }
  return { textures, cells: map, canvases, size: [atlasW, atlasH] };
}

// ===========================================================================
// 对外入口
// ===========================================================================

function UvBox(geometry, box) {
  const uv = geometry.attributes.uv;
  if (!uv) return box;
  for (let i = 0; i < uv.count; i += 1) {
    const u = uv.getX(i), v = uv.getY(i);
    if (u < box.u0) box.u0 = u; if (u > box.u1) box.u1 = u;
    if (v < box.v0) box.v0 = v; if (v > box.v1) box.v1 = v;
  }
  return box;
}

/**
 * 把一具尸体的分件合成尽量少的「一材质一几何」。
 *
 * @param {Array<{key:string, source:THREE.Material, tiers:THREE.BufferGeometry[]}>} staged
 * @param {object} options
 * @param {(m:THREE.Material)=>THREE.Material} options.clone 克隆已装补丁的材质（`CloneShadedMaterial`）
 * @param {Map} [options.cache] 跨原型共用图集与材质（同一套源材质只烘一次）
 * @param {Array} [options.owned] 新建的材质 / 几何 / 贴图登记到这里，供 Dispose
 * @returns {Array<{material:THREE.Material, tiers:THREE.BufferGeometry[], triangles:number[]}>}
 */
export function MergeBodyParts(staged, { clone, cache = null, owned = null,
  maxAtlas = MAX_ATLAS, pad = CELL_PAD } = {}) {
  const groups = new Map();
  for (const part of staged) {
    const signature = ShadingSignature(part.source);
    let group = groups.get(signature);
    if (!group) { group = { signature, parts: [] }; groups.set(signature, group); }
    group.parts.push(part);
  }
  const result = [];
  for (const group of groups.values()) {
    const sources = [];
    const seen = new Set();
    for (const part of group.parts) {
      if (seen.has(part.source.uuid)) continue;
      seen.add(part.source.uuid); sources.push(part.source);
    }
    // 属性并集也进缓存键：同一份材质同时挂在「有 tangent」和「没有 tangent」的几何上，
    // three 每帧会在两套 program 参数之间来回重算（见 docs 的 getProgram 风暴那条）。
    const attributes = new Set();
    for (const part of group.parts) for (const geometry of part.tiers) {
      for (const name of Object.keys(geometry.attributes)) attributes.add(name);
    }
    const cacheKey = group.signature + " " + sources.map((m) => m.uuid).sort().join(",")
      + " " + [...attributes].sort().join(",");
    let shared = cache?.get(cacheKey) || null;
    let atlas = shared?.atlas ?? null;
    if (!shared && NeedsAtlas(sources)) {
      const boxes = new Map();
      for (const part of group.parts) {
        let box = boxes.get(part.source.uuid);
        if (!box) { box = { u0: Infinity, u1: -Infinity, v0: Infinity, v1: -Infinity }; boxes.set(part.source.uuid, box); }
        for (const geometry of part.tiers) UvBox(geometry, box);
      }
      atlas = BuildAtlas(sources, boxes, { maxAtlas, pad });
    }
    if (!shared) {
      // 图集烘不出来（贴图画不了 / 平铺太多）就退回「按源材质各合各的」，
      // 仍然比每个分件一只网格省。
      if (NeedsAtlas(sources) && !atlas) {
        for (const source of sources) {
          const subset = group.parts.filter((p) => p.source.uuid === source.uuid);
          result.push(...MergeBodyParts(subset, { clone, cache, owned, maxAtlas, pad }));
        }
        continue;
      }
      const material = clone(sources[0]);
      material.name = sources[0].name;
      if (atlas) {
        for (const [slot, texture] of Object.entries(atlas.textures)) {
          material[slot] = texture;
          owned?.textures?.push(texture);
        }
        if (atlas.textures.roughnessMap) material.roughness = 1;
        if (atlas.textures.map && !sources[0].map) material.color?.setHex(0xffffff);
        material.needsUpdate = true;
      }
      shared = { material, atlas };
      cache?.set(cacheKey, shared);
      owned?.materials?.push(material);
    }
    const tierCount = group.parts[0].tiers.length;
    const transforms = shared.atlas
      ? group.parts.map((part) => {
        const cell = shared.atlas.cells.get(part.source.uuid);
        return [cell.su, cell.sv, cell.tu, cell.tv];
      })
      : null;
    const tiers = [];
    for (let tier = 0; tier < tierCount; tier += 1) {
      const list = group.parts.map((part) => part.tiers[tier]);
      const merged = (list.length === 1 && !transforms) ? list[0] : MergeGeometries(list, transforms);
      if (!merged) { tiers.length = 0; break; }
      if (merged !== list[0]) owned?.geometries?.push(merged);
      tiers.push(merged);
    }
    if (!tiers.length) {
      // 属性对不齐（同名不同宽）——退回逐分件，画面绝不冒险。
      cache?.delete(cacheKey);
      for (const part of group.parts) {
        const material = clone(part.source);
        owned?.materials?.push(material);
        result.push({ material, tiers: part.tiers, triangles: part.tiers.map(TriangleCount) });
      }
      continue;
    }
    result.push({ material: shared.material, tiers, triangles: tiers.map(TriangleCount) });
  }
  return result;
}
