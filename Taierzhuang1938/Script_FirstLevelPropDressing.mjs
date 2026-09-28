// 第一关白盒：平色道具盒换成现成外部模型 + 墙根 / 倒墙 / 弹坑边的碎砖瓦。
// 数据与撒点规则在 Data_FirstLevelPropDressing.mjs，口径 docs/Data_FirstLevelVegetationProps.md。
//
// 接线（Script_FirstLevelWhiteboxField）：PrepareAssets 里 LoadFirstLevelPropDressing 预载模型，
// BuildWhiteBoxes 里紧跟 AddMissionFortifications 调 AddFirstLevelPropDressing —— 它往同一只
// BuildSink 里按 64 m 分区加几何，返回的 `replaced` 并进 fortifications 的 replaced 集合，
// 那几块平色盒就不再画；碰撞、掩体照旧由原块登记（这里一个 Solid / Cover 都不加）。
//
// 材质键沿用 `MissionDefenseMaterial_<uuid>`：外部模型的材质是 MaterialLibrary 的共享实例，
// 场地 Dispose 按这个前缀把它们当共享件跳过，不能被换关时释放掉。碎砖瓦是本模块自己克隆的
// 材质（Stone + 顶点色），键 `FirstLevelRubble`，随场地释放。

import * as THREE from "three";
import { InstantiateExternalProp, ExternalPropCatalog } from "./Script_ExternalProps.mjs";
import { LoadDraftCartAssets } from "./Script_DraftCartModel.mjs";
import { CloneShadedMaterial } from "./Script_Materials.mjs";
import { BuildSink } from "./Script_World.mjs";
import {
  PROP_DRESSING_ASSETS, PROP_DRESSING_SECTOR_M, PROP_MATERIAL_TINT, PROP_MATERIAL_OVERRIDE, PROP_SPECIAL_ASSETS,
  PlanPropDressing, PlanRubbleScatter, Rng,
} from "./Data_FirstLevelPropDressing.mjs";
import { MissionDressingContext } from "./Data_FirstLevelVegetation.mjs";

/** 预载替换表用到的模型：已落地、XZ 居中、绑好项目 PBR 的克隆（与沙袋同一个入口）。 */
export async function LoadFirstLevelPropDressing(library) {
  const models = new Map();
  const catalog = new Map(ExternalPropCatalog().map((spec) => [spec.id, spec]));
  // 调色克隆按源材质缓存：同一只库材质在本关只克隆一次（一种材质仍是一只合批桶）。
  const tinted = new Map();
  await Promise.all(PROP_DRESSING_ASSETS.map(async (id) => {
    const root = await InstantiateExternalProp(id, library);
    if (!root) { console.warn(`[FirstLevelPropDressing] ${id} 没有加载到，这几件保留平色盒`); return; }
    const override = PROP_MATERIAL_OVERRIDE[id];
    if (override) {
      const key = `override:${override.recipe}:${JSON.stringify(override.options)}`;
      if (!tinted.has(key)) {
        const has = library.baked?.has?.(override.recipe);
        const clone = CloneShadedMaterial(library.Get(has ? override.recipe : override.fallback,
          { ...(has ? override.options : override.fallbackOptions), metalness: 0 }));
        clone.userData.propDressingClone = true;
        tinted.set(key, clone);
      }
      root.traverse((mesh) => {
        if (!mesh.isMesh || Array.isArray(mesh.material)) return;
        mesh.material = tinted.get(key);
        // 几何是 ExternalProps 缓存里共用的，改法线前先拷一份。
        if (override.smoothNormals) mesh.geometry = SmoothNormals(mesh.geometry.clone());
      });
    }
    const tint = override ? null : PROP_MATERIAL_TINT[catalog.get(id)?.material];
    if (tint) root.traverse((mesh) => {
      if (!mesh.isMesh || Array.isArray(mesh.material)) return;
      if (!tinted.has(mesh.material.uuid)) {
        const clone = CloneShadedMaterial(mesh.material);
        clone.color.multiply(new THREE.Color(...tint));
        clone.userData.propDressingClone = true;
        tinted.set(mesh.material.uuid, clone);
      }
      mesh.material = tinted.get(mesh.material.uuid);
    });
    root.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(root), size = box.getSize(new THREE.Vector3());
    models.set(id, { root, size: size.toArray(), box });
  }));
  const wreck = await EvacCartWreck().catch((error) => {
    console.warn("[FirstLevelPropDressing] 撤运车模型没加载到，08 障碍车身保留平色盒", error);
    return null;
  });
  if (wreck) models.set("evacCartWreck", wreck);
  return { models };
}

/**
 * 坏在街上的撤运车：Script_DraftCartModel 的车（一只蒙皮网格、按材质分图元），取绑定姿势的静态几何，
 * 丢掉主要蒙在 dropBone 上的三角形（那只轮子），落地、XZ 居中。只搬 position / normal / uv：
 * 没有 uv 的漆面图元（COLOR_0）补零 uv、顶点色的平均值折进材质颜色（BuildSink 合并不带顶点色）。
 */
async function EvacCartWreck() {
  const spec = PROP_SPECIAL_ASSETS.evacCartWreck;
  const assets = await LoadDraftCartAssets();
  const root = new THREE.Group();
  root.name = "evacCartWreck_Grounded";
  const holder = new THREE.Group();
  root.add(holder);
  assets.cart.scene.updateMatrixWorld(true);
  assets.cart.scene.traverse((mesh) => {
    if (!mesh.isMesh || Array.isArray(mesh.material)) return;
    const source = mesh.geometry, position = source.attributes.position, normal = source.attributes.normal;
    const skinIndex = source.attributes.skinIndex, skinWeight = source.attributes.skinWeight;
    const drop = mesh.skeleton?.bones.findIndex((bone) => bone.name === spec.dropBone) ?? -1;
    const Dominant = (i) => {
      let best = -1, weight = -1;
      for (let c = 0; c < 4; c++) if (skinWeight.getComponent(i, c) > weight) { weight = skinWeight.getComponent(i, c); best = skinIndex.getComponent(i, c); }
      return best;
    };
    const index = source.index ? source.index.array : Array.from({ length: position.count }, (_, i) => i);
    const kept = [];
    for (let t = 0; t < index.length; t += 3) {
      const tri = [index[t], index[t + 1], index[t + 2]];
      if (drop >= 0 && skinIndex && tri.every((i) => Dominant(i) === drop)) continue;
      kept.push(...tri);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", position.clone());
    geometry.setAttribute("normal", normal.clone());
    geometry.setAttribute("uv", source.attributes.uv ? source.attributes.uv.clone() : new THREE.BufferAttribute(new Float32Array(position.count * 2), 2));
    geometry.setIndex(kept);
    geometry.applyMatrix4(mesh.matrixWorld);
    const material = mesh.material.clone();
    const colors = source.attributes.color;
    if (colors) {
      const mean = [0, 0, 0];
      for (let i = 0; i < colors.count; i++) { mean[0] += colors.getX(i); mean[1] += colors.getY(i); mean[2] += colors.getZ(i); }
      material.color.multiply(new THREE.Color(mean[0] / colors.count, mean[1] / colors.count, mean[2] / colors.count));
      material.vertexColors = false;
    }
    material.color.multiply(new THREE.Color(...spec.tint));
    material.userData.propDressingClone = true;
    material.needsUpdate = true;
    holder.add(new THREE.Mesh(geometry, material));
  });
  holder.updateMatrixWorld(true);
  const raw = new THREE.Box3().setFromObject(holder);
  holder.position.set(-(raw.min.x + raw.max.x) / 2, -raw.min.y, -(raw.min.z + raw.max.z) / 2);
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  return { root, size: box.getSize(new THREE.Vector3()).toArray(), box };
}

/** 同位置顶点的法线取平均（面积加权的面法线已经在各自顶点上），硬边多面体读成圆滑的一团。 */
function SmoothNormals(geometry) {
  const position = geometry.attributes.position, normal = geometry.attributes.normal;
  if (!position || !normal) return geometry;
  const sums = new Map(), key = (i) => `${position.getX(i).toFixed(4)},${position.getY(i).toFixed(4)},${position.getZ(i).toFixed(4)}`;
  for (let i = 0; i < position.count; i++) {
    const k = key(i), sum = sums.get(k) || [0, 0, 0];
    sum[0] += normal.getX(i); sum[1] += normal.getY(i); sum[2] += normal.getZ(i);
    sums.set(k, sum);
  }
  for (let i = 0; i < position.count; i++) {
    const [x, y, z] = sums.get(key(i)), length = Math.hypot(x, y, z) || 1;
    normal.setXYZ(i, x / length, y / length, z / length);
  }
  normal.needsUpdate = true;
  return geometry;
}

// 碎块模板（单位尺寸，底面贴 y=0）：砖 / 半砖 / 瓦片是削过角的扁盒，石块是扰动过的二十面体。
function ChippedBox(seed) {
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const position = geometry.attributes.position, rng = Rng(seed);
  const offsets = new Map();
  for (let i = 0; i < position.count; i++) {
    const key = `${position.getX(i)},${position.getY(i)},${position.getZ(i)}`;
    if (!offsets.has(key)) offsets.set(key, [(rng() - 0.5) * 0.18, (rng() - 0.5) * 0.25, (rng() - 0.5) * 0.18]);
    const [dx, dy, dz] = offsets.get(key);
    position.setXYZ(i, position.getX(i) + dx, position.getY(i) + dy + 0.5, position.getZ(i) + dz);
  }
  geometry.computeVertexNormals();
  return geometry;
}
function StoneShape(seed) {
  const geometry = new THREE.IcosahedronGeometry(0.5, 0);
  const position = geometry.attributes.position, rng = Rng(seed);
  const offsets = new Map();
  for (let i = 0; i < position.count; i++) {
    const key = `${position.getX(i).toFixed(4)},${position.getY(i).toFixed(4)},${position.getZ(i).toFixed(4)}`;
    if (!offsets.has(key)) offsets.set(key, 0.78 + rng() * 0.4);
    const k = offsets.get(key);
    position.setXYZ(i, position.getX(i) * k, position.getY(i) * k + 0.5, position.getZ(i) * k);
  }
  geometry.computeVertexNormals();
  // 二十面体是非索引几何（每面三个独立顶点 = 硬边石面）；补一份顺序索引，烘焙统一按索引走。
  geometry.setIndex(Array.from({ length: position.count }, (_, i) => i));
  return geometry;
}

let templates = null;
function RubbleTemplates() {
  if (templates) return templates;
  templates = {
    Brick: [ChippedBox(11), ChippedBox(12), ChippedBox(13)],
    BrickHalf: [ChippedBox(21), ChippedBox(22)],
    TileShard: [ChippedBox(31), ChippedBox(32)],
    Stone: [StoneShape(41), StoneShape(42), StoneShape(43)],
  };
  return templates;
}

/** 一区的碎块烘成一份几何（位置 / 法线 / 世界米 UV / 顶点色）。BuildSink 的合并会丢顶点色，所以这里自己并好再交一份。 */
function BakeRubble(pieces) {
  const t = RubbleTemplates();
  let vertexCount = 0, indexCount = 0;
  const chosen = pieces.map((piece, i) => {
    const list = t[piece.kind] || t.Brick, source = list[i % list.length];
    vertexCount += source.attributes.position.count; indexCount += source.index.count;
    return source;
  });
  const positions = new Float32Array(vertexCount * 3), normals = new Float32Array(vertexCount * 3);
  const colors = new Float32Array(vertexCount * 3), uvs = new Float32Array(vertexCount * 2);
  const indices = vertexCount > 65535 ? new Uint32Array(indexCount) : new Uint16Array(indexCount);
  const matrix = new THREE.Matrix4(), normalMatrix = new THREE.Matrix3(), q = new THREE.Quaternion(), e = new THREE.Euler();
  const v = new THREE.Vector3(), n = new THREE.Vector3();
  let vo = 0, io = 0;
  pieces.forEach((piece, k) => {
    const source = chosen[k];
    matrix.compose(v.set(piece.x, piece.y, piece.z), q.setFromEuler(e.set(piece.tilt, piece.yaw, piece.tilt * 0.6, "YXZ")),
      n.set(piece.size[0], piece.size[1], piece.size[2]));
    normalMatrix.getNormalMatrix(matrix);
    const p = source.attributes.position, nn = source.attributes.normal;
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i).applyMatrix4(matrix);
      n.fromBufferAttribute(nn, i).applyMatrix3(normalMatrix).normalize();
      const o = (vo + i) * 3;
      positions[o] = v.x; positions[o + 1] = v.y; positions[o + 2] = v.z;
      normals[o] = n.x; normals[o + 1] = n.y; normals[o + 2] = n.z;
      // 三平面里挑法线主轴投影（世界米 / 0.8 m 一格），碎块多小都有贴图细节、不拉丝。
      const ax = Math.abs(n.x), ay = Math.abs(n.y), az = Math.abs(n.z);
      const u = ay >= ax && ay >= az ? v.x : ax >= az ? v.z : v.x, w = ay >= ax && ay >= az ? v.z : v.y;
      uvs[(vo + i) * 2] = u / 0.8; uvs[(vo + i) * 2 + 1] = w / 0.8;
      // 贴地那一圈压暗一点（接触阴影的替身）。
      const contact = Math.min(1, Math.max(0.55, (v.y - piece.y) / Math.max(piece.size[1], 0.02) + 0.45));
      colors[o] = piece.shade[0] * contact; colors[o + 1] = piece.shade[1] * contact; colors[o + 2] = piece.shade[2] * contact;
    }
    const index = source.index.array;
    for (let i = 0; i < index.length; i++) indices[io++] = vo + index[i];
    vo += p.count;
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
  geometry.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  geometry.computeBoundingSphere();
  return geometry;
}

function SectorKey(x, z) {
  return `PropDressing_${Math.floor(x / PROP_DRESSING_SECTOR_M)}_${Math.floor(z / PROP_DRESSING_SECTOR_M)}`;
}

/**
 * 往 BuildSink 里加道具与碎砖瓦。返回：
 *   replaced —— 不再画的白盒块 id（调用方并进 fortifications 的 replaced）；
 *   placements / rubble / missing —— 给测试与调试面板看。
 */
export function AddFirstLevelPropDressing(sink, layout, dressing, groundAt, materials, library, { scene = null, meshes = null } = {}) {
  const started = typeof performance !== "undefined" ? performance.now() : 0;
  const sizes = new Map([...dressing.models].map(([id, model]) => [id, model.size]));
  const plan = PlanPropDressing(layout.blocks, groundAt, sizes);
  const matrix = new THREE.Matrix4(), local = new THREE.Matrix4(), roll = new THREE.Matrix4();
  const q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), position = new THREE.Vector3(), scale = new THREE.Vector3();
  let triangles = 0;
  for (const placement of plan.placements) {
    const model = dressing.models.get(placement.asset);
    // 歪倒的件（平躺的车轮、缺了轮子的车）：先绕自身 Z 轴转 rollDeg，再把歪倒后包围盒的底面挪回 y=0、X 居中。
    if (placement.rollDeg) {
      const [mx, my] = model.size, a = placement.rollDeg * Math.PI / 180, c = Math.cos(a), sn = Math.sin(a);
      const xs = [], ys = [];
      for (const [px, py] of [[-mx / 2, 0], [mx / 2, 0], [-mx / 2, my], [mx / 2, my]]) { xs.push(px * c - py * sn); ys.push(px * sn + py * c); }
      roll.makeRotationZ(a).premultiply(new THREE.Matrix4().makeTranslation(-(Math.min(...xs) + Math.max(...xs)) / 2, -Math.min(...ys), 0));
    } else roll.identity();
    // scale 是放倒之后那一帧里的逐轴缩放（FitPropToBox 的约定）。
    matrix.compose(position.set(placement.x, placement.y, placement.z), q.setFromAxisAngle(up, placement.yaw),
      scale.set(placement.scale[0], placement.scale[1], placement.scale[2]));
    sink.SetSector(SectorKey(placement.x, placement.z));
    model.root.traverse((mesh) => {
      if (!mesh.isMesh) return;
      if (Array.isArray(mesh.material)) throw new Error(`Unsplit prop dressing material: ${placement.asset}`);
      // 库里的共享材质用 MissionDefenseMaterial_ 前缀（场地 Dispose 跳过）；本模块的调色克隆随场地释放。
      const key = `${mesh.material.userData.propDressingClone ? "PropDressingMaterial_" : "MissionDefenseMaterial_"}${mesh.material.uuid}`;
      materials.set(key, mesh.material);
      local.multiplyMatrices(matrix, roll).multiply(mesh.matrixWorld);
      const geometry = mesh.geometry.clone().applyMatrix4(local);
      triangles += (geometry.index?.count ?? geometry.attributes.position.count) / 3;
      sink.Add(key, geometry);
    });
  }
  // 碎砖瓦：一区一份预并好的几何。
  const rubble = PlanRubbleScatter(MissionDressingContext(layout, groundAt));
  let rubbleTriangles = 0;
  if (rubble.pieces.length && library) {
    if (!materials.has("FirstLevelRubble")) {
      const material = CloneShadedMaterial(library.Get("Stone", { normalScale: 0.8, roughness: 0.95, metalness: 0 }));
      material.name = "FirstLevelRubble";
      material.vertexColors = true;
      material.needsUpdate = true;
      materials.set("FirstLevelRubble", material);
    }
    const bySector = new Map();
    for (const piece of rubble.pieces) {
      const key = SectorKey(piece.x, piece.z);
      if (!bySector.has(key)) bySector.set(key, []);
      bySector.get(key).push(piece);
    }
    // 碎块不投影（每块比鞋小，三级阴影各画一遍只是白费三角形）：自己一只 BuildSink，不进场地那只全投影的。
    const own = scene ? new BuildSink() : sink;
    for (const [key, pieces] of bySector) {
      const geometry = BakeRubble(pieces);
      rubbleTriangles += geometry.index.count / 3;
      own.SetSector(key);
      own.Add("FirstLevelRubble", geometry);
    }
    if (scene) for (const mesh of own.Flush(scene, { Get: () => materials.get("FirstLevelRubble") },
      { castShadow: false, receiveShadow: true })) {
      mesh.name = "FirstLevelRubble";
      meshes?.push(mesh);
    }
  }
  sink.SetSector("FirstLevelWhitebox");
  return {
    replaced: new Set([...plan.replaced, ...(library ? rubble.hidden : [])]),
    placements: plan.placements, missing: plan.missing,
    rubble: library ? rubble.pieces.length : 0,
    stats: { props: plan.placements.length, propTriangles: Math.round(triangles), rubble: rubble.pieces.length,
      rubbleTriangles: Math.round(rubbleTriangles), hiddenLoose: rubble.hidden.size,
      buildMs: started ? Math.round(performance.now() - started) : 0 },
  };
}
