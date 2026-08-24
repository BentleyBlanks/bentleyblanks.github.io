// 《血战台儿庄》模型加载器：读 _blender 出的 .tzm.json，吐一棵 Object3D 层级。
//
// 为什么不是 glTF：
//   TZM 只表达四件事：节点层级、局部变换、每节点的网格、材质名 —— 就这四件事，
//   写它的 Python 不到 400 行，读它的这个文件不到 300 行。自研管线的预通道 /
//   色彩管理约定也不用迁就外部格式。
//  （历史注：早期 vendor 里只有 three 的 build/ 核心库；后来为外部 GLB 道具、
//   蒙皮人物与过场引入了 examples/jsm 的 GLTFLoader —— 见 Script_ExternalProps /
//   Script_RiggedModel / Script_Cutscene。TZM 管线保持独立，两边各管各的。）
//
// 三条硬约束（错一条画面立刻出事）：
//   1) **不许 SkinnedMesh。** 深度法线预通道用 scene.overrideMaterial 覆盖全场，
//      覆盖材质里没有 skinning 的 define，蒙皮网格在那一 pass 会整个塌到原点，
//      SSAO 拿到一团乱码。所以这里只产 Object3D + 普通 Mesh，动画靠逐帧写
//      关节的 rotation。
//   2) **不许自己造材质。** 材质名（uniform / skin / steel / …）是 key，
//      值必须由调用方从 MaterialLibrary / ActorMaterials 传进来。这里造一份
//      默认材质的后果是它不吃 SSAO 注入、不吃染色，人身上会出现一块死板的塑料。
//   3) **加载失败一律返回 null + console.warn，不许抛。** 一个模型 404
//      不能让整页黑屏 —— 上层拿到 null 就退回程序化几何。
//
// 合批规则（这是这个文件存在的第二个理由）：
//   一个 Actor 现在是 37 个 draw call，模型精度上去只会更多。所以加载时把
//   **两个关节之间的所有网格按材质合并**：帽子 + 帽徽 + 头 + 脖子挂在 neck 这
//   一个关节下，合完就是 skin / uniform / accentA / accentB 四块，而不是
//   十来个零件各一块。会动的（四肢、武器）自然分在各自的关节里，一根不少。

// three 走相对路径不写裸名 "three"：这个模块也在加载画面那个 worker 里跑，
// worker 没有 import map，裸名解析不了。页面侧 index.html 把这条相对路径
// 映射到同一个带版本的 URL，所以页面上仍然只有一份 three。
import * as THREE from "./vendor/three/build/three.module.js";
import { HashString } from "./Script_Noise.mjs";

/** 解析结果缓存：同一个 url 只 fetch + 解码一次，实例化可以来很多次。 */
const DOC_CACHE = new Map();

const TMP_NORMAL = new THREE.Matrix3();

function DecodeBase64(text) {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function TypedFrom(text, Ctor) {
  const bytes = DecodeBase64(text);
  return new Ctor(bytes.buffer, bytes.byteOffset, bytes.byteLength / Ctor.BYTES_PER_ELEMENT);
}

/**
 * 把一个量化的 mesh 块还原成 BufferGeometry。
 * 位置 / UV 是 uint16 + (min, scale) 反量化，法线是 int8 snorm。
 * 量化的理由在 TzmCore.py 的 _Quantize 里：明文十进制的顶点数组比这大四倍，
 * 而**要读要改的是节点树，不是浮点数**。
 */
function DecodeMesh(block) {
  const count = block.count | 0;
  const qpos = TypedFrom(block.pos, Uint16Array);
  const qnrm = TypedFrom(block.nrm, Int8Array);
  const quv = TypedFrom(block.uv, Uint16Array);
  const index = TypedFrom(block.idx, block.idxBits === 32 ? Uint32Array : Uint16Array);

  const positions = new Float32Array(count * 3);
  const normals = new Float32Array(count * 3);
  const uvs = new Float32Array(count * 2);
  const [pmx, pmy, pmz] = block.posMin;
  const [psx, psy, psz] = block.posScale;
  const [umx, umy] = block.uvMin;
  const [usx, usy] = block.uvScale;
  for (let i = 0; i < count; i += 1) {
    positions[i * 3] = pmx + qpos[i * 3] * psx;
    positions[i * 3 + 1] = pmy + qpos[i * 3 + 1] * psy;
    positions[i * 3 + 2] = pmz + qpos[i * 3 + 2] * psz;
    // int8 → 单位向量。除 127 再归一化：量化后长度不是 1，直接喂给 three
    // 会让粗糙面的高光忽明忽暗（法线长度参与了 BRDF）。
    let nx = qnrm[i * 3] / 127, ny = qnrm[i * 3 + 1] / 127, nz = qnrm[i * 3 + 2] / 127;
    const len = Math.hypot(nx, ny, nz) || 1;
    normals[i * 3] = nx / len;
    normals[i * 3 + 1] = ny / len;
    normals[i * 3 + 2] = nz / len;
    uvs[i * 2] = umx + quv[i * 2] * usx;
    uvs[i * 2 + 1] = umy + quv[i * 2 + 1] * usy;
  }
  return { positions, normals, uvs, index: Array.from(index), material: block.material };
}

/** 位置里混进 NaN 的后果是整块几何的包围球变 NaN，视锥剔除随之全表失灵。 */
function HasNonFinite(array) {
  for (let i = 0; i < array.length; i += 1) {
    if (!Number.isFinite(array[i])) return true;
  }
  return false;
}

/** 读一个 .tzm.json 并解码。失败返回 null（**不抛**）。 */
export async function LoadDocument(url) {
  if (DOC_CACHE.has(url)) return DOC_CACHE.get(url);
  let doc = null;
  try {
    const response = await fetch(url);
    if (!response.ok) {
      console.warn(`[MeshLoad] ${url} 取不到：HTTP ${response.status}`);
      DOC_CACHE.set(url, null);
      return null;
    }
    doc = await response.json();
  } catch (error) {
    console.warn(`[MeshLoad] ${url} 加载失败：${String(error).slice(0, 200)}`);
    DOC_CACHE.set(url, null);
    return null;
  }
  if (!doc || doc.format !== "tzm" || !Array.isArray(doc.nodes) || !Array.isArray(doc.meshes)) {
    console.warn(`[MeshLoad] ${url} 不是 TZM 文档`);
    DOC_CACHE.set(url, null);
    return null;
  }
  let decoded;
  try {
    decoded = doc.meshes.map(DecodeMesh);
  } catch (error) {
    console.warn(`[MeshLoad] ${url} 网格解码失败：${String(error).slice(0, 200)}`);
    DOC_CACHE.set(url, null);
    return null;
  }
  for (let i = 0; i < decoded.length; i += 1) {
    if (HasNonFinite(decoded[i].positions) || HasNonFinite(decoded[i].normals)) {
      console.warn(`[MeshLoad] ${url} 第 ${i} 块网格含 NaN，整个模型作废`);
      DOC_CACHE.set(url, null);
      return null;
    }
  }
  const parsed = {
    url,
    id: HashString(`${doc.name || ""}:${url}`) >>> 0,   // 确定性 id，不许 Math.random
    name: doc.name || "unnamed",
    bounds: doc.bounds || null,
    notes: doc.notes || "",
    triangles: doc.triangles | 0,
    nodes: doc.nodes,
    meshes: decoded,
  };
  DOC_CACHE.set(url, parsed);
  return parsed;
}

/** 手写的几何合并。**不用 BufferGeometryUtils** —— 那是 examples/jsm，仓里没有。 */
function MergeChunks(chunks) {
  let vertexCount = 0;
  let indexCount = 0;
  for (const chunk of chunks) {
    vertexCount += chunk.positions.length / 3;
    indexCount += chunk.index.length;
  }
  const positions = new Float32Array(vertexCount * 3);
  const normals = new Float32Array(vertexCount * 3);
  const uvs = new Float32Array(vertexCount * 2);
  // 顶点数过 65535 就必须换 32 位索引，否则索引静默回绕成另一块几何
  const index = vertexCount > 65535 ? new Uint32Array(indexCount) : new Uint16Array(indexCount);
  let vOffset = 0;
  let iOffset = 0;
  for (const chunk of chunks) {
    positions.set(chunk.positions, vOffset * 3);
    normals.set(chunk.normals, vOffset * 3);
    uvs.set(chunk.uvs, vOffset * 2);
    for (let i = 0; i < chunk.index.length; i += 1) index[iOffset + i] = chunk.index[i] + vOffset;
    vOffset += chunk.positions.length / 3;
    iOffset += chunk.index.length;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
  geometry.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
  // 同一张 ORM 喂 aoMap，而 three 的 aoMap 读的是 uv1 —— 不补这一份
  // 环境光遮蔽整张贴图就当没有（这是材质库那边既定的打包约定）
  geometry.setAttribute("uv1", new THREE.BufferAttribute(uvs.slice(), 2));
  geometry.setIndex(new THREE.BufferAttribute(index, 1));
  geometry.computeBoundingSphere();
  geometry.computeBoundingBox();
  return geometry;
}

function ChunkTransformed(chunk, matrix) {
  if (!matrix) return chunk;
  const positions = chunk.positions.slice();
  const normals = chunk.normals.slice();
  TMP_NORMAL.getNormalMatrix(matrix);
  const v = new THREE.Vector3();
  for (let i = 0; i < positions.length; i += 3) {
    v.set(positions[i], positions[i + 1], positions[i + 2]).applyMatrix4(matrix);
    positions[i] = v.x; positions[i + 1] = v.y; positions[i + 2] = v.z;
    v.set(normals[i], normals[i + 1], normals[i + 2]).applyMatrix3(TMP_NORMAL).normalize();
    normals[i] = v.x; normals[i + 1] = v.y; normals[i + 2] = v.z;
  }
  return { positions, normals, uvs: chunk.uvs, index: chunk.index, material: chunk.material };
}

/**
 * 把解码好的文档实例化成一棵 Object3D。
 *
 * @param {object} doc            LoadDocument 的返回值
 * @param {object} options
 *   materials  {Record<string, THREE.Material>} 必给。键就是模型里的材质名
 *   mergeMap   {Record<string, string>} 降级用：把材质名重映射到另一个桶再合批
 *                                       （low 档把 accessory/shoe/accent 全并进 uniform）
 *   batch      默认 true。false 时每个 mesh 块各自成 Mesh（调试看零件用）
 * @returns {{root, nodes, meshes, tris, draws, bounds}}
 */
export function InstantiateModel(doc, options = {}) {
  const materials = options.materials || {};
  const mergeMap = options.mergeMap || null;
  const batch = options.batch !== false;
  const castShadow = options.castShadow !== false;
  const receiveShadow = options.receiveShadow !== false;

  const objects = [];
  const nodes = new Map();
  const ownerOf = [];
  const relative = [];

  for (let i = 0; i < doc.nodes.length; i += 1) {
    const spec = doc.nodes[i];
    const object = new THREE.Group();
    object.name = spec.name;
    if (spec.t) object.position.fromArray(spec.t);
    if (spec.r) object.quaternion.setFromEuler(new THREE.Euler(spec.r[0], spec.r[1], spec.r[2], "XYZ"));
    if (spec.s) object.scale.fromArray(spec.s);
    objects.push(object);
    // 同名节点只留第一个（挂点名重复是建模脚本的 bug，这里不掩盖，只是不让它覆盖）
    if (!nodes.has(spec.name)) nodes.set(spec.name, object);

    const parent = spec.parent;
    if (parent >= 0) objects[parent].add(object);

    // 合批归属：关节自己是一个区间的头，非关节跟着父节点走。
    // 挂点（没有网格的节点）照样进树 —— 枪口/握把/视线全靠它们。
    const isJoint = !!spec.joint || parent < 0;
    ownerOf[i] = isJoint ? i : ownerOf[parent];
    if (isJoint) {
      relative[i] = null;                     // 区间头，局部系就是自己
    } else {
      const parentRelative = relative[parent];
      const local = new THREE.Matrix4().compose(object.position, object.quaternion, object.scale);
      relative[i] = parentRelative ? parentRelative.clone().multiply(local) : local;
    }
  }

  const buckets = new Map();
  let blockCount = 0;
  for (let i = 0; i < doc.nodes.length; i += 1) {
    const spec = doc.nodes[i];
    if (!spec.meshes) continue;
    for (const meshIndex of spec.meshes) {
      const chunk = doc.meshes[meshIndex];
      if (!chunk) continue;
      blockCount += 1;
      const materialName = (mergeMap && mergeMap[chunk.material]) || chunk.material;
      const owner = batch ? ownerOf[i] : i;
      const key = `${owner}|${materialName}`;
      let bucket = buckets.get(key);
      if (!bucket) {
        bucket = { owner, materialName, chunks: [] };
        buckets.set(key, bucket);
      }
      bucket.chunks.push(batch ? ChunkTransformed(chunk, relative[i]) : chunk);
    }
  }

  const fallbackName = materials.uniform ? "uniform" : Object.keys(materials)[0];
  const missing = new Set();
  const meshes = [];
  let tris = 0;
  for (const bucket of buckets.values()) {
    let material = materials[bucket.materialName];
    if (!material) {
      missing.add(bucket.materialName);
      material = fallbackName ? materials[fallbackName] : null;
    }
    if (!material) continue;              // 一份材质都没给：宁可少画，也不自己造
    const geometry = MergeChunks(bucket.chunks);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = `${doc.name}_${objects[bucket.owner].name}_${bucket.materialName}`;
    mesh.castShadow = castShadow;
    mesh.receiveShadow = receiveShadow;
    objects[bucket.owner].add(mesh);
    meshes.push(mesh);
    tris += geometry.index.count / 3;
  }
  if (missing.size) {
    console.warn(`[MeshLoad] ${doc.name} 缺材质：${[...missing].join(", ")}（已退回 ${fallbackName}）`);
  }

  const bounds = doc.bounds
    ? new THREE.Box3(new THREE.Vector3().fromArray(doc.bounds.min),
                     new THREE.Vector3().fromArray(doc.bounds.max))
    : null;

  return {
    root: objects[0],
    nodes,
    meshes,
    tris,
    draws: meshes.length,       // 换模后单人的 draw call 数，就是这个
    blocks: blockCount,
    bounds,
    name: doc.name,
    id: doc.id,
  };
}

/**
 * 读一个模型并实例化。**失败返回 null，不抛。**
 * 上层拿到 null 就退回 Script_Actor 的程序化几何 —— 一个模型 404 不能整页黑屏。
 *
 * @example
 *   const built = await LoadModel("./Model/SoldierNra.tzm.json",
 *     { materials: factory.ActorMaterials("nra", rnd) });
 *   if (built) {
 *     scene.add(built.root);
 *     built.nodes.get("chest").rotation.y = 0.2;   // 逐帧改关节，没有 SkinnedMesh
 *   }
 */
export async function LoadModel(url, options = {}) {
  const doc = await LoadDocument(url);
  if (!doc) return null;
  try {
    return InstantiateModel(doc, options);
  } catch (error) {
    console.warn(`[MeshLoad] ${url} 实例化失败：${String(error).slice(0, 200)}`);
    return null;
  }
}

/** 批量预读（开机时并发拉完，之后 InstantiateModel 是纯同步的）。 */
export async function PreloadModels(urls) {
  const docs = await Promise.all(urls.map((url) => LoadDocument(url)));
  const table = new Map();
  urls.forEach((url, i) => { if (docs[i]) table.set(url, docs[i]); });
  return table;
}

/** 丢缓存（热重载 / 单测用）。 */
export function ClearMeshCache() {
  DOC_CACHE.clear();
}
