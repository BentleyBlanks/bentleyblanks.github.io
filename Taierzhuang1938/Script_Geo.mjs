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

/**
 * 单位盒子的模板。**建一次，全程只读。**
 *
 * `new THREE.BoxGeometry(w, h, d)` 每次都要跑六遍 buildPlane、往三个 JS 数组里
 * push 出两百多个数、再转成 typed array、再 addGroup 六次。建一座城要建几万个
 * 盒子（MakeBox 有七百多个调用点），这条通用路径是开机耗时里量得到的一块。
 */
const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1);

/**
 * 与 `new THREE.BoxGeometry(w, h, d)` **逐位相同**的快路。
 *
 * 单位盒子的顶点就是 ±0.5，乘以边长即得目标盒子 —— three 那边算的是
 * `ix * segmentWidth - width_half`，在一段的情况下就是 `±w/2`，而 `0.5 * w`
 * 与 `w / 2` 在 IEEE754 下是同一个数（除以 2 只动指数），所以不是"近似相同"
 * 而是逐位相同（Script_GeoTest 逐浮点比过）。法线是轴对齐的、uv 与索引与边长
 * 无关，直接照抄模板。groups 也照抄：单材质渲染其实不看它，但 clone 语义要一致。
 */
function BoxFromUnit(w, h, d) {
  const src = UNIT_BOX.attributes;
  const count = src.position.count;
  const sp = src.position.array;
  const position = new Float32Array(count * 3);
  for (let i = 0, o = 0; i < count; i += 1, o += 3) {
    position[o] = sp[o] * w;
    position[o + 1] = sp[o + 1] * h;
    position[o + 2] = sp[o + 2] * d;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(position, 3));
  geometry.setAttribute("normal", new THREE.BufferAttribute(new Float32Array(src.normal.array), 3));
  geometry.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(src.uv.array), 2));
  geometry.setIndex(new THREE.BufferAttribute(new Uint16Array(UNIT_BOX.index.array), 1));
  for (const g of UNIT_BOX.groups) geometry.addGroup(g.start, g.count, g.materialIndex);
  return geometry;
}

/** 建一块 UV 已经改好的方料。 */
export function MakeBox(w, h, d, unitsPerTile = 1.2, seed = "box", grid = null) {
  const geometry = BoxFromUnit(w, h, d);
  ScaleBoxUv(geometry, w, h, d, unitsPerTile, seed, grid);
  return geometry;
}

/**
 * 一只装满土的麻布沙袋。
 *
 * 沙袋不是砖：中段被填料撑鼓、两端被扎绳勒细。保留原来的外接尺寸，
 * 所以既有的摆放矩阵和碰撞盒无需改动；只替换实例化时的可见轮廓。
 */
export function MakeSandbag(w = 0.62, h = 0.24, d = 0.34, unitsPerTile = TILE_METERS.sandbag, seed = "sandbag") {
  const profile = [
    [-0.50, 0.16], [-0.44, 0.58], [-0.32, 0.88], [-0.16, 1.0],
    [0.0, 1.0], [0.16, 1.0], [0.32, 0.88], [0.44, 0.58], [0.50, 0.16],
  ];
  const around = 10;
  const positions = [];
  const uvs = [];
  const indices = [];
  const rnd = Mulberry32(HashString(seed));
  const uOffset = rnd() * 3;
  const vOffset = rnd() * 3;
  for (let r = 0; r < profile.length; r += 1) {
    const [along, fullness] = profile[r];
    for (let a = 0; a <= around; a += 1) {
      const theta = (a / around) * Math.PI * 2;
      positions.push(
        along * w,
        Math.sin(theta) * h * 0.5 * fullness,
        Math.cos(theta) * d * 0.5 * fullness,
      );
      uvs.push(
        uOffset + (r / (profile.length - 1)) * (w / unitsPerTile),
        vOffset + (a / around) * ((Math.PI * (h + d) * 0.5) / unitsPerTile),
      );
    }
  }
  const ring = around + 1;
  for (let r = 0; r < profile.length - 1; r += 1) {
    for (let a = 0; a < around; a += 1) {
      const i = r * ring + a;
      indices.push(i, i + ring, i + 1, i + 1, i + ring, i + ring + 1);
    }
  }
  // 两端封口藏在扎绳处，避免斜看时露出黑洞。
  const leftCap = positions.length / 3;
  positions.push(-w * 0.5, 0, 0);
  uvs.push(uOffset, vOffset + 0.5);
  const rightCap = positions.length / 3;
  positions.push(w * 0.5, 0, 0);
  uvs.push(uOffset + w / unitsPerTile, vOffset + 0.5);
  const rightRing = (profile.length - 1) * ring;
  for (let a = 0; a < around; a += 1) {
    indices.push(leftCap, a + 1, a);
    indices.push(rightCap, rightRing + a, rightRing + a + 1);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
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

// PlaceGeometry 的算草稿。**别在函数里 new 这些**：这个函数一次开机要被调
// 十几万次（851 个调用点），每次五个临时对象就是几十万次分配，GC 在开机剖析里
// 是能单独看见一条的。
const _placeMatrix = new THREE.Matrix4();
const _placeQuat = new THREE.Quaternion();
const _placeEuler = new THREE.Euler();
const _placePos = new THREE.Vector3();
const _placeScale = new THREE.Vector3();
const _placeNormal = new THREE.Matrix3();

/**
 * 带位姿地把一个几何体并进列表（省掉到处 clone().applyMatrix4()）。
 *
 * 实现上**不走 `clone()` + `applyMatrix4()`**：那是"先整份 memcpy 一遍，再把
 * position 和 normal 各重走一遍"，还顺带拷了 morphAttributes / userData /
 * drawRange 这些这座城里根本没有的东西。这里直接开目标数组、一趟写完，
 * 逐浮点与旧路一致（每顶点的算式照抄 Vector3.applyMatrix4 / applyNormalMatrix，
 * 连 w 除法和 normalize 的顺序都一样，Script_GeoTest 拿旧实现对着比）。
 * position 与 normal 之外的属性（个别地方有 color）原样拷过来，不做变换 ——
 * 与 clone 的行为相同。
 */
export function PlaceGeometry(geometry, { x = 0, y = 0, z = 0, ry = 0, rx = 0, rz = 0, scale = 1 } = {}) {
  _placeEuler.set(rx, ry, rz, "YXZ");
  _placeQuat.setFromEuler(_placeEuler);
  _placeMatrix.compose(_placePos.set(x, y, z), _placeQuat, _placeScale.set(scale, scale, scale));
  const src = geometry.attributes;
  // 交错缓冲（GLTFLoader 可能给出 InterleavedBufferAttribute）走不了下面这条
  // 按 itemSize 紧排的快路 —— 它的 `.array` 是整条交错缓冲。这种退回老路：
  // clone() 会把交错属性解成普通属性，正确性优先。
  if (!src.position || src.position.isInterleavedBufferAttribute) {
    const g = geometry.clone();
    g.applyMatrix4(_placeMatrix);
    return g;
  }
  const e = _placeMatrix.elements;
  const out = new THREE.BufferGeometry();

  const sp = src.position;
  const count = sp.count;
  const pa = sp.array;
  const position = new Float32Array(count * 3);
  for (let i = 0, o = 0; i < count; i += 1, o += 3) {
    const vx = pa[o], vy = pa[o + 1], vz = pa[o + 2];
    const w = 1 / (e[3] * vx + e[7] * vy + e[11] * vz + e[15]);
    position[o] = (e[0] * vx + e[4] * vy + e[8] * vz + e[12]) * w;
    position[o + 1] = (e[1] * vx + e[5] * vy + e[9] * vz + e[13]) * w;
    position[o + 2] = (e[2] * vx + e[6] * vy + e[10] * vz + e[14]) * w;
  }
  out.setAttribute("position", new THREE.BufferAttribute(position, 3));

  if (src.normal) {
    const n = _placeNormal.getNormalMatrix(_placeMatrix).elements;
    const na = src.normal.array;
    const normal = new Float32Array(count * 3);
    for (let i = 0, o = 0; i < count; i += 1, o += 3) {
      const vx = na[o], vy = na[o + 1], vz = na[o + 2];
      const nx = n[0] * vx + n[3] * vy + n[6] * vz;
      const ny = n[1] * vx + n[4] * vy + n[7] * vz;
      const nz = n[2] * vx + n[5] * vy + n[8] * vz;
      const inv = 1 / (Math.sqrt(nx * nx + ny * ny + nz * nz) || 1);
      normal[o] = nx * inv;
      normal[o + 1] = ny * inv;
      normal[o + 2] = nz * inv;
    }
    out.setAttribute("normal", new THREE.BufferAttribute(normal, 3));
  }
  for (const name of Object.keys(src)) {
    if (name === "position" || name === "normal") continue;
    const a = src[name];
    if (a.isInterleavedBufferAttribute) { out.setAttribute(name, a.clone()); continue; }
    out.setAttribute(name, new THREE.BufferAttribute(
      new a.array.constructor(a.array), a.itemSize, a.normalized));
  }
  if (geometry.index) {
    const i = geometry.index;
    out.setIndex(new THREE.BufferAttribute(new i.array.constructor(i.array), 1));
  }
  for (const g of geometry.groups) out.addGroup(g.start, g.count, g.materialIndex);
  return out;
}

/**
 * 一座硬山两坡顶的确定性剖面。**局部 +X 是开间（正脊方向），局部 +Z 是进深**；
 * 两片坡面都自 z=0 的正脊向前后檐**下降**。
 *
 * 为什么要有这个函数：坡面是「一块薄板绕自己的 x 轴转一个角度、再挪到半进深处」，
 * 位移方向与 rx 的正负号必须配对。配反了不会报错，只会得到一个**倒 V** ——
 * 两片瓦朝外翘起来、中间那条「正脊」反倒是最低点。城外村屋踩过一次（玩家原话
 * 「楼顶做反了」），城内院落的远景档又独立踩了第二次：那一版写死 `rx: ±0.5`、
 * 位移写成 `+s*d*0.24`，于是俯瞰整城是一片悬空交叉的板。
 * 现在剖面只此一份，谁盖坡顶都从这里取，别再各自猜宽/深与正负号。
 *
 * 用法（ry 是建筑朝向；局部→世界的换算用调用方自己的 Frame/VillagePoint）：
 *   const roof = RoofSlopeLayout(width, depth, eaveY);
 *   for (const half of roof.halves) {
 *     const [px, pz] = Frame(0, half.localZ);
 *     sink.Add("RoofTile", PlaceGeometry(
 *       MakeBox(half.width, 0.16, half.depth, TILE_METERS.roof, seed),
 *       { x: px, y: half.centerY, z: pz, ry, rx: half.rotationX }));
 *   }
 *
 * @param pitch 坡度（弧度）。默认 0.47 ≈ 27°，落在鲁南小青瓦 26°—29° 的区间里。
 */
export function RoofSlopeLayout(width, depth, eaveY, pitch = 0.47, overhang = 0.45) {
  const halfRun = depth / 2 + overhang;
  const ridgeY = eaveY + depth / 2 * Math.tan(pitch);
  const outerY = eaveY - overhang * Math.tan(pitch);
  const slopeLength = halfRun / Math.cos(pitch);
  return {
    ridgeY,
    outerY,
    ridgeLength: width + overhang * 2,
    halves: [-1, 1].map((side) => ({
      side,
      localZ: side * halfRun / 2,
      centerY: (ridgeY + outerY) / 2,
      rotationX: side * pitch,
      width: width + overhang * 2,
      depth: slopeLength,
      // 这两个是**转过之后那块板**的两个局部端点。把它们跟剖面放在一起，
      // 调用方与测试就不可能拿一个好看的标量 ridgeY 去证明一个倒 V 的屋顶。
      localRidgeZ: -side * slopeLength / 2,
      localEaveZ: side * slopeLength / 2,
      slabRidgeY: ridgeY,
      slabEaveY: outerY,
    })),
  };
}

/** 一片已转好的坡面在其局部 Z 处的高度。 */
export function RoofSlabY(half, localZ) {
  return half.centerY - Math.sin(half.rotationX) * localZ;
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


/**
 * 射线 vs 轴对齐盒（slab 法）。返回 { t, normal, box } 或 null。
 *
 * 场景全是方料，所以静态几何的求交一律走这条 —— 不建 BVH，也不用 three 的
 * Raycaster（那要遍历网格的每个三角形，而我们的碰撞体是一张 AABB 表）。
 *
 * 原来住在 Script_Battlefield.mjs（台儿庄那座城）里。那个模块随台儿庄一起退役了，
 * 而这个函数与哪座城无关，所以搬到纯几何模块来。
 */
export function RayAabb(origin, direction, box, maxDist) {
  let tmin = 0, tmax = maxDist;
  let axis = -1, sign = 1;
  const o = [origin.x, origin.y, origin.z];
  const d = [direction.x, direction.y, direction.z];
  for (let i = 0; i < 3; i += 1) {
    if (Math.abs(d[i]) < 1e-8) {
      if (o[i] < box.min[i] || o[i] > box.max[i]) return null;
      continue;
    }
    const inv = 1 / d[i];
    let t1 = (box.min[i] - o[i]) * inv;
    let t2 = (box.max[i] - o[i]) * inv;
    let s = -1;
    if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; s = 1; }
    if (t1 > tmin) { tmin = t1; axis = i; sign = s; }
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return null;
  }
  if (axis < 0) return null;
  const normal = [0, 0, 0];
  normal[axis] = sign;
  return { t: tmin, normal, box };
}
