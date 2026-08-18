// 《血战台儿庄》几何工具层：UV 密度、破损形体、批合并。
//
// 一条贯穿全场的规矩：**贴图密度统一**。墙、地、屋顶如果各自用 0..1 的 UV，
// 一面 12 米的墙和一扇 0.9 米的门会用同样多的砖 —— 那是网页 demo 的味道。
// 这里所有形体的 UV 都按"世界米数 / 每格米数"重算，全场砖缝一样大。

import * as THREE from "three";
import { Mulberry32, HashString } from "./Script_Noise.mjs";

/** 每格贴图代表多少米。砖墙一格 = 1.2 米（约 12 皮砖），地面一格 = 2.4 米。 */
export const TILE_METERS = {
  brick: 1.2, adobe: 1.6, roof: 1.1, wood: 1.0,
  ground: 2.6, stone: 1.4, sandbag: 0.9, cloth: 0.6, steel: 0.35,
};

/**
 * 按世界尺寸重算 BoxGeometry 的 UV，使各面贴图密度一致。
 * BoxGeometry 的面序固定为 +x, -x, +y, -y, +z, -z，每面 4 个顶点。
 */
export function ScaleBoxUv(geometry, w, h, d, unitsPerTile, offsetSeed = "", grid = null) {
  const uv = geometry.attributes.uv;
  const faces = [
    [d, h], [d, h],   // ±x
    [w, d], [w, d],   // ±y
    [w, h], [w, h],   // ±z
  ];
  const rnd = Mulberry32(HashString(String(offsetSeed)));
  // grid = { u, v, mirror }：把随机偏移**吸附到贴图自己的格子上**（砖墙给 1/列、1/行）。
  // 为什么非要吸附：AddWall 把一段墙切成 0.85 m 一片，每片各取一个连续随机偏移，
  // 相邻两片的横向灰缝就错开半皮砖 —— 一面墙上的砖缝每 0.85 m 断一次，
  // 拐角处两面墙也对不上。吸附到整砖之后，图案照样每片不同，而灰缝是连的。
  const snap = (value, step) => (step > 0 ? Math.round(value / step) * step : value);
  for (let f = 0; f < 6; f += 1) {
    const [su, sv] = faces[f];
    // 每个面给一个随机偏移：同规格的墙复制五面，不错开一眼看穿是同一块
    let ou = rnd() * 4, ov = rnd() * 4;
    // 镜像：约一半的面把 U 取负。three 默认的法线贴图走屏幕空间导数求切线
    //（perturbNormal2Arb），UV 翻向时切线自己跟着翻，所以不会翻出错误的凹凸方向。
    const flip = grid && grid.mirror && rnd() < 0.5 ? -1 : 1;
    if (grid) { ou = snap(ou, grid.u || 0); ov = snap(ov, grid.v || 0); }
    for (let i = 0; i < 4; i += 1) {
      const idx = f * 4 + i;
      uv.setXY(idx,
        uv.getX(idx) * (su / unitsPerTile) * flip + ou,
        uv.getY(idx) * (sv / unitsPerTile) + ov);
    }
  }
  uv.needsUpdate = true;
  return geometry;
}

/** 建一块 UV 已经改好的方料。 */
export function MakeBox(w, h, d, unitsPerTile = 1.2, seed = "box", grid = null) {
  const geometry = new THREE.BoxGeometry(w, h, d);
  ScaleBoxUv(geometry, w, h, d, unitsPerTile, seed, grid);
  return geometry;
}

/**
 * 砖墙贴图自己的格子：一格贴图 10 列 × 20 行砖（见 Script_TexBake 的 rowsPerTile）。
 * 只给砖墙用 —— 夯土、瓦、木头没有整齐的格，吸附反而会把它们的随机性吃掉。
 */
export const BRICK_UV_GRID = { u: 1 / 10, v: 1 / 20, mirror: true };

/** 平面（地面/屋面）：同样按米算 UV。 */
export function MakePlane(w, d, unitsPerTile = 2.6, segments = 1) {
  const geometry = new THREE.PlaneGeometry(w, d, segments, segments);
  const uv = geometry.attributes.uv;
  for (let i = 0; i < uv.count; i += 1) {
    uv.setXY(i, uv.getX(i) * (w / unitsPerTile), uv.getY(i) * (d / unitsPerTile));
  }
  uv.needsUpdate = true;
  geometry.rotateX(-Math.PI / 2);
  return geometry;
}

/**
 * 打碎的墙头：把一段墙沿长度切成 n 竖条，每条给一个不同的高度。
 * 台儿庄的墙没有一面是整的 —— 平齐的墙头一眼假。
 */
export function MakeBrokenWall(length, height, thickness, {
  seed = "wall", slices = 0, ruin = 0.0, unitsPerTile = 1.2,
} = {}) {
  const count = slices || Math.max(3, Math.round(length / 0.9));
  const rnd = Mulberry32(HashString(seed));
  const geometries = [];
  const sliceW = length / count;
  for (let i = 0; i < count; i += 1) {
    // 破损从两端与随机位置吃进来，中间留出可以掩蔽的高度
    const t = i / (count - 1 || 1);
    const edge = Math.min(t, 1 - t) * 2;
    const bite = ruin * (0.35 + 0.65 * rnd()) * (1.0 - edge * 0.45);
    const h = Math.max(0.22, height * (1 - bite));
    const geometry = new THREE.BoxGeometry(sliceW * 1.02, h, thickness);
    ScaleBoxUv(geometry, sliceW, h, thickness, unitsPerTile, `${seed}:${i}`);
    geometry.translate(-length / 2 + sliceW * (i + 0.5), h / 2, 0);
    geometries.push(geometry);
  }
  return MergeGeometries(geometries);
}

/**
 * 合并 BufferGeometry 列表（vendor 里没有 BufferGeometryUtils，自己写）。
 * 只处理 position / normal / uv 三个属性 —— 场景里用不到别的。
 */
export function MergeGeometries(geometries) {
  const list = geometries.filter(Boolean);
  if (list.length === 0) return new THREE.BufferGeometry();
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
  let vo = 0, io = 0;
  for (const g of list) {
    const p = g.attributes.position, nAttr = g.attributes.normal, uAttr = g.attributes.uv;
    position.set(p.array.subarray(0, p.count * 3), vo * 3);
    if (nAttr) normal.set(nAttr.array.subarray(0, p.count * 3), vo * 3);
    if (uAttr) uv.set(uAttr.array.subarray(0, p.count * 2), vo * 2);
    if (g.index) {
      for (let i = 0; i < g.index.count; i += 1) index[io + i] = g.index.array[i] + vo;
      io += g.index.count;
    } else {
      for (let i = 0; i < p.count; i += 1) index[io + i] = i + vo;
      io += p.count;
    }
    vo += p.count;
    g.dispose();
  }
  const merged = new THREE.BufferGeometry();
  merged.setAttribute("position", new THREE.BufferAttribute(position, 3));
  merged.setAttribute("normal", new THREE.BufferAttribute(normal, 3));
  merged.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  merged.setIndex(new THREE.BufferAttribute(index, 1));
  merged.computeBoundingSphere();
  return merged;
}

/** 带位姿地把一个几何体并进列表（省掉到处 clone().applyMatrix4()）。 */
export function PlaceGeometry(geometry, { x = 0, y = 0, z = 0, ry = 0, rx = 0, rz = 0, scale = 1 } = {}) {
  const g = geometry.clone();
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, "YXZ"));
  m.compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(scale, scale, scale));
  g.applyMatrix4(m);
  return g;
}

/**
 * 瓦砾堆：一堆随机旋转的碎块，用 InstancedMesh 铺。
 * 街上没有碎砖 = 没打过仗。这是画面"有故事"的最便宜来源。
 */
export function MakeRubbleField(count, {
  seed = "rubble", area = [30, 30], center = [0, 0], sizeRange = [0.08, 0.42],
  yBase = 0, mask = null,
} = {}) {
  const rnd = Mulberry32(HashString(seed));
  const matrices = [];
  const dummy = new THREE.Object3D();
  for (let i = 0; i < count * 3 && matrices.length < count; i += 1) {
    const x = center[0] + (rnd() - 0.5) * area[0];
    const z = center[1] + (rnd() - 0.5) * area[1];
    if (mask && !mask(x, z)) continue;
    const s = sizeRange[0] + rnd() * (sizeRange[1] - sizeRange[0]);
    dummy.position.set(x, yBase + s * 0.12, z);
    dummy.rotation.set(rnd() * 0.9 - 0.45, rnd() * Math.PI * 2, rnd() * 0.9 - 0.45);
    dummy.scale.set(s * (0.7 + rnd() * 0.9), s * (0.35 + rnd() * 0.5), s * (0.7 + rnd() * 0.9));
    dummy.updateMatrix();
    matrices.push(dummy.matrix.clone());
  }
  return matrices;
}

/** 把矩阵表灌进 InstancedMesh。 */
export function MakeInstanced(geometry, material, matrices, { castShadow = true, receiveShadow = true } = {}) {
  const mesh = new THREE.InstancedMesh(geometry, material, matrices.length);
  for (let i = 0; i < matrices.length; i += 1) mesh.setMatrixAt(i, matrices[i]);
  mesh.instanceMatrix.needsUpdate = true;
  mesh.castShadow = castShadow;
  mesh.receiveShadow = receiveShadow;
  mesh.frustumCulled = true;
  return mesh;
}

/**
 * 弹坑：把一块地面网格往下压出一个坑，坑沿翻起浮土。
 * @param {THREE.BufferGeometry} planeGeometry 已经是水平面的网格（MakePlane 出来的）
 */
export function CarveCraters(planeGeometry, craters) {
  const position = planeGeometry.attributes.position;
  for (let i = 0; i < position.count; i += 1) {
    const x = position.getX(i), z = position.getZ(i);
    let dy = 0;
    for (const c of craters) {
      const d = Math.hypot(x - c.x, z - c.z);
      if (d > c.radius * 1.7) continue;
      const t = d / c.radius;
      // 中心下陷 + 环形隆起（真正的弹坑就是这个剖面）
      dy += -c.depth * Math.exp(-t * t * 2.2) + c.depth * 0.34 * Math.exp(-Math.pow(t - 1.05, 2) * 6.5);
    }
    position.setY(i, position.getY(i) + dy);
  }
  position.needsUpdate = true;
  planeGeometry.computeVertexNormals();
  return planeGeometry;
}
