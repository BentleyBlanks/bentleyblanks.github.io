// 白盒关卡编辑器的河沟示意（docs/Data_EditorBlockout.md §6.3，2026-10-22）。
//
// 用户：「河汊子最好简单的表现一下他的材质，不然我想象不出来」。只改编辑器这一层，不碰 Space / Scene 生成器 / 场景 JSON：
//   · 水块（semantic "water" / blockoutWater）的顶面铺一层浑水贴图（黄褐偏绿、半透明），替掉原来的淡蓝色块；
//   · 地面上挨着水块的那一圈（沟壁、沟底、岸沿）按 BLOCKOUT_CREEK_LOOK 的规则算出泥权重，写进顶点属性 blockoutMud，
//     地面材质挂 MUD_PATCH：按权重把高度色带混成湿泥贴图（三向投影，陡壁不拉丝）、粗糙度往下压（湿泥发亮）；
//     米格线补丁在它后面照画，线落在泥上也看得见。
// 规则只看「有没有水块、离水块多远、比水面高多少、坡多陡」，凡是有水块的关卡都一样。
// 两张贴图是编辑器专用的反照率（Texture/Editor/，清单 EditorCreekMud / EditorCreekWater），模块里只下一次、材质共用。

import * as THREE from "three";
import { MakePatch } from "./Script_MaterialPatches.mjs";
import { MarkNoPrepass } from "./Script_Post.mjs";
import { BLOCKOUT_CREEK_LOOK } from "./Data_Tuning_WhiteboxMaterial.mjs";

/** 地面顶点属性名：泥权重 0…1。 */
export const MUD_ATTRIBUTE = "blockoutMud";

const textures = new Map();
/** 下一张平铺贴图（同一 URL 只下一次；Node 替身里没有 document 就返回 null）。 */
function TileTexture(url) {
  if (typeof document === "undefined") return null;
  let texture = textures.get(url);
  if (texture) return texture;
  texture = new THREE.TextureLoader().load(url);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  textures.set(url, texture);
  return texture;
}

const Smooth = (lo, hi, v) => { const t = Math.min(1, Math.max(0, (v - lo) / Math.max(1e-6, hi - lo))); return t * t * (3 - 2 * t); };

/**
 * 一个顶点的泥权重（0…1）。
 * @param {number} wx,wy,wz 世界坐标
 * @param {number} ny 顶点法线 y
 * @param {Array<{x,z,w,d,c,s,surfaceY}>} prints 水块脚印（WaterPrints）
 */
export function MudWeightAt(wx, wy, wz, ny, prints, look = BLOCKOUT_CREEK_LOOK) {
  let weight = 0;
  for (const p of prints) {
    const dx = wx - p.x, dz = wz - p.z;
    // 转进块的局部系（与 BuildCreekWater 的角点换算互逆），到矩形脚印的水平距离
    const lx = dx * p.c - dz * p.s, lz = dx * p.s + dz * p.c;
    const ox = Math.max(0, Math.abs(lx) - p.w / 2), oz = Math.max(0, Math.abs(lz) - p.d / 2);
    const dist = Math.hypot(ox, oz);
    if (dist > look.reachM) continue;
    const near = 1 - Smooth(look.reachInnerM, look.reachM, dist);
    const low = 1 - Smooth(look.bandLoM, look.bandHiM, wy - p.surfaceY);
    const steep = Smooth(look.slopeLo, look.slopeHi, 1 - ny);
    const w = near * Math.max(low, steep);
    if (w > weight) weight = w;
    if (weight >= 1) return 1;
  }
  return weight;
}

/** 水块 → 脚印（中心、半宽、旋转的 cos / sin、水面高）。 */
export function WaterPrints(blocks, groundAt) {
  return blocks.map((b) => ({
    x: b.x, z: b.z, w: b.w, d: b.d, c: Math.cos(b.ry || 0), s: Math.sin(b.ry || 0),
    surfaceY: (b.y ?? groundAt(b.x, b.z)) + (b.h || 0) / 2,
  }));
}

/**
 * 给一只地面网格写泥权重属性（顶点按世界坐标算；没有水块就全 0）。
 * @returns {number} 权重 > 0.5 的顶点数（取证用）
 */
export function PaintWaterEdgeMud(mesh, prints, look = BLOCKOUT_CREEK_LOOK) {
  const geometry = mesh.geometry;
  const position = geometry.getAttribute("position");
  if (!position) return 0;
  let mud = geometry.getAttribute(MUD_ATTRIBUTE);
  if (!mud || mud.count !== position.count) {
    mud = new THREE.BufferAttribute(new Float32Array(position.count), 1);
    geometry.setAttribute(MUD_ATTRIBUTE, mud);
  }
  const normal = geometry.getAttribute("normal");
  mesh.updateMatrixWorld?.(true);
  const e = mesh.matrixWorld?.elements;
  let painted = 0;
  for (let i = 0; i < position.count; i++) {
    let w = 0;
    if (prints.length) {
      const px = position.getX(i), py = position.getY(i), pz = position.getZ(i);
      const wx = e ? e[0] * px + e[4] * py + e[8] * pz + e[12] : px;
      const wy = e ? e[1] * px + e[5] * py + e[9] * pz + e[13] : py;
      const wz = e ? e[2] * px + e[6] * py + e[10] * pz + e[14] : pz;
      w = MudWeightAt(wx, wy, wz, normal ? normal.getY(i) : 1, prints, look);
    }
    mud.setX(i, w);
    if (w > 0.5) painted++;
  }
  mud.needsUpdate = true;
  return painted;
}

const MUD_UNIFORMS = {
  uBlockoutMudMap: { value: null },
  uBlockoutMudTile: { value: 1 / BLOCKOUT_CREEK_LOOK.mud.tileM },
  uBlockoutMudTint: { value: new THREE.Color(BLOCKOUT_CREEK_LOOK.mud.tint) },
  uBlockoutMudRoughness: { value: BLOCKOUT_CREEK_LOOK.mud.roughness },
};

/**
 * 地面材质的湿泥补丁：读顶点属性 blockoutMud，按权重把反照率混成泥贴图、粗糙度压到 mud.roughness。
 * 贴图按世界 xz 俯视投影：地面是高度场，最陡的沟壁（河汊子 2.5 m 走 3 m）也只拉伸 1.6 倍，泥纹是各向同性的噪点、看不出；
 * 三向投影在 45° 坡上两个方向各一半，反而出人字斜纹（10-22 第一版截图）。
 * 泥上的米格线再压一道（GRID_PATCH 的 15% / 20% 在褐色泥上看不清）：这里用自己的函数名算同一套线，只乘在泥权重上。
 * 装在米格线补丁前面。
 */
export const MUD_PATCH = MakePatch({
  key: "blockoutMud2",
  uniforms: (uniforms) => {
    MUD_UNIFORMS.uBlockoutMudMap.value = TileTexture(BLOCKOUT_CREEK_LOOK.mud.url);
    Object.assign(uniforms, MUD_UNIFORMS);
  },
  vertex: [
    ["#include <common>", "attribute float blockoutMud; varying float vBlockoutMud; varying vec3 vBlockoutMudWorld;"],
    ["#include <project_vertex>", "vBlockoutMud = blockoutMud; vBlockoutMudWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;"],
  ],
  fragment: [
    ["#include <common>", `
      varying float vBlockoutMud;
      varying vec3 vBlockoutMudWorld;
      uniform sampler2D uBlockoutMudMap;
      uniform float uBlockoutMudTile;
      uniform vec3 uBlockoutMudTint;
      uniform float uBlockoutMudRoughness;
      float BlockoutMudGridLine(vec2 p, float size, float width) {
        vec2 cell = p / size;
        vec2 fw = max(fwidth(cell), vec2(0.00001));
        vec2 d = abs(fract(cell + 0.5) - 0.5);
        float halfWidth = width / size * 0.5;
        vec2 line = 1.0 - smoothstep(vec2(halfWidth), vec2(halfWidth) + fw, d);
        line *= 1.0 - smoothstep(vec2(0.25), vec2(0.5), fw);
        return max(line.x, line.y);
      }
    `],
    ["#include <color_fragment>", `
      if (vBlockoutMud > 0.001) {
        vec3 mudColor = texture2D(uBlockoutMudMap, vBlockoutMudWorld.xz * uBlockoutMudTile).rgb * uBlockoutMudTint;
        diffuseColor.rgb = mix(diffuseColor.rgb, mudColor, vBlockoutMud);
        float mudFine = BlockoutMudGridLine(vBlockoutMudWorld.xz, 1.0, 0.035);
        float mudCoarse = BlockoutMudGridLine(vBlockoutMudWorld.xz, 10.0, 0.09);
        diffuseColor.rgb *= 1.0 - vBlockoutMud * (0.22 * mudFine + 0.25 * mudCoarse);
      }
    `],
    ["#include <roughnessmap_fragment>", "roughnessFactor = mix(roughnessFactor, uBlockoutMudRoughness, vBlockoutMud);"],
  ],
});

/**
 * 水块顶面铺一层水面（默认是世界坐标平铺的浑水贴图、半透明；给了 material 就用它，例：白盒水材质）。名字带 water。
 * @param {Array} blocks semantic "water" 的块
 * @param {(x:number,z:number)=>number} groundAt 没写 y 的块按地面高取
 * @param {THREE.Scene} scene
 * @param {{ name?: string, material?: THREE.Material }} [options]
 * @returns {THREE.Mesh|null}
 */
export function BuildCreekWater(blocks, groundAt, scene, { name = "BlockoutWater", material: given = null } = {}) {
  if (!blocks.length) return null;
  const look = BLOCKOUT_CREEK_LOOK.water;
  const positions = [], uvs = [], indices = [];
  for (const b of blocks) {
    const c = Math.cos(b.ry || 0), s = Math.sin(b.ry || 0), y = (b.y ?? groundAt(b.x, b.z)) + (b.h || 0) / 2;
    const base = positions.length / 3;
    for (const [lx, lz] of [[-b.w / 2, -b.d / 2], [b.w / 2, -b.d / 2], [b.w / 2, b.d / 2], [-b.w / 2, b.d / 2]]) {
      const x = b.x + lx * c + lz * s, z = b.z - lx * s + lz * c;
      positions.push(x, y, z);
      uvs.push(x / look.tileM, z / look.tileM);
    }
    indices.push(base, base + 2, base + 1, base, base + 3, base + 2);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  let material = given;
  if (material) {
    // 不透明的水面和水块顶面同一高度：往相机拉一点，不闪
    material.polygonOffset = true; material.polygonOffsetFactor = -2; material.polygonOffsetUnits = -2;
  } else {
    material = MarkNoPrepass(new THREE.MeshStandardMaterial({
      color: look.tint, map: TileTexture(look.url), roughness: look.roughness, metalness: 0,
      transparent: true, opacity: look.opacity, depthWrite: false, side: THREE.DoubleSide,
    }));
    material.name = "BlockoutCreekWater";
  }
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  scene?.add(mesh);
  return mesh;
}
