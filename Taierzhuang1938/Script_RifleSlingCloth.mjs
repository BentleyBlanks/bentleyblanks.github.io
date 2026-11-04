// 背着的步枪那根枪带的布料模拟（2026-11-04，用户：国军日军身上背着的步枪有一根带子，希望有布料模拟的效果，
// 至少看起来符合物理，现在那样子很奇怪）。
//
// 原来的带子（BackRifleRun GLB 的 Model_BackRifleSling，Script_RelaxedGait / Script_FirstLevelP012BackRifle 挂到胸骨
// 下的背枪挂点上）是照原国军模型的胸口捏死的一条扁带，整条跟着胸骨走、一点不动。换了身材（白盒的 X Bot、日兵甲、何有田）
// 就不贴身：X Bot 身上过右肩那段悬空翘成一个钩、斜挎过胸那段离开胸口；胖的人反过来切进身体。
//
// 现在：带子是一根绳（count 个质点），两头钉在枪的上、下背带环上（资产带子的两个端点，跟着枪走），中间受重力、
// 有惯性、碰身体。身体 = 这个人此刻看得见的蒙皮网格本身：带子附近的顶点按体素抽稀成表面采样点（带法线），
// 每帧 CPU 蒙皮（逐点四骨线性混合，跟 GPU 同一个公式），每个质点按最近三个采样点插出的局部切平面推出去；
// 开口下摆、胯边另用真实三角面拦住线段穿越。长度按这个人的身材定：装上时先把带子收紧裹到身上（PBD 把段长压短、
// 碰身体），量出裹紧的长度，再放松 slack 当绳长，所以每种身材都是「刚好挎紧、略有余量」。
//
// 求解：位置动力学（PBD），坐标系 = 枪的挂点（刚体，米制、去掉缩放）。匀速走、跑时带子跟着躯干走；躯干变速
// （起跑、急停、每一步的上下颠、转身）时把变了的那一截按 inertia 传给带子 —— 带子有甩动和滞后，又不会被几米每秒的
// 平移拖散。子步 substepS、每子步 iterations 轮：钉两头 → 段长（不许拉长、压短较软）→ 抗弯（皮带比绳硬）→ 很弱地
// 拉回资产形状（只管「从右肩过、从左肋下绕」这个走向，免得滑脱）→ 碰身体（最后做，身体说了算）。贴着身体的点有摩擦。
//
// 渲染：一个质点一根骨头的 SkinnedMesh（GPU 蒙皮、运动矢量按骨骼历史自动对，见 docs/Data_MotionVectorContract.md：
// 不许 CPU 改顶点），截面 = 宽 × 厚的扁方条。骨头朝向：沿带子、贴身处带面贴着身体表面（宽度方向 = 切线 × 表面法线），
// 悬空处与两头照资产带子的朝向。这个网格挂在场景根下的 RifleSlingCloth 组里，**不挂在人物底下**：白盒 X Bot 层会把
// 人物底下所有蒙皮网格藏掉，伤口 / 血迹也扫人物的蒙皮网格。原带子留在原地当参照（位置、显隐都由原来的代码管，
// X Bot 的 _KeepSling 照常改它），只是不画（layers 全关）；模拟出来的带子每帧照它的显隐。
//
// 接线：原带子造出来时 RegisterRifleSling(原带子, 人物根)；Script_Main.RenderScene 在整帧唯一一次 updateMatrixWorld
// 之后调 StepRifleSlings（这时姿势、挂点都是这一帧的终值）。没注册 / 没人调 Step 的页面原带子照旧画。
// halfRateM 外隔帧算、simRangeM 外不模拟（带子按挂点刚性跟着走）；装上每帧限 fitsPerFrame 根；藏起来超过 hiddenResetS
// 再出现时重新挎上。
// 口径：docs/Data_RifleSlingCloth.md；门禁 Script_RifleSlingClothTest（纯 Node）、Script_RifleSlingClothBrowserTest（白盒实机）。

import * as THREE from "three";

import { RIFLE_SLING_CLOTH as TUNING } from "./Data_Tuning_RifleSlingCloth.mjs";
import { CloneShadedMaterial } from "./Script_Materials.mjs";

export const RIFLE_SLING_CLOTH = Object.freeze({
  ...TUNING,
  skipBones: new RegExp(TUNING.skipBonesPattern, "i"),
  softBones: new RegExp(TUNING.softBonesPattern, "i"),
});

// ---------------------------------------------------------------- 资产带子 → 中线

/**
 * 资产带子（扁带：每个截面两条边，顶点按「边 A、边 B」交替、相邻截面共用的点重复出现）→ 静止中线（带子本地坐标），
 * 按弧长重采样成 count 个点：{ count, length, width, points, widthDirs, normals }（Float32Array，每点 3 个数）。
 * 认不出这种排法返回 null（调用方不接模拟，原带子照旧画）。
 */
export function ExtractSlingRest(geometry, count = RIFLE_SLING_CLOTH.count) {
  const pos = geometry?.attributes?.position, nrm = geometry?.attributes?.normal;
  if (!pos || count < 4) return null;
  const index = new Map(), uniq = [], first = [];
  for (let i = 0; i < pos.count; i += 1) {
    const k = `${Math.round(pos.getX(i) * 1e5)},${Math.round(pos.getY(i) * 1e5)},${Math.round(pos.getZ(i) * 1e5)}`;
    if (index.has(k)) continue;
    index.set(k, uniq.length);
    uniq.push(new THREE.Vector3().fromBufferAttribute(pos, i));
    first.push(i);
  }
  if (uniq.length < 8 || uniq.length % 2) return null;
  const sections = uniq.length / 2, centers = [], widths = [], normals = [];
  let widthSum = 0;
  for (let k = 0; k < sections; k += 1) {
    const a = uniq[2 * k], b = uniq[2 * k + 1];
    centers.push(a.clone().add(b).multiplyScalar(0.5));
    const w = b.clone().sub(a);
    widthSum += w.length();
    widths.push(w);
  }
  const width = widthSum / sections;
  for (let k = 0; k < sections; k += 1) {
    const w = widths[k].length();
    if (w < width * 0.5 || w > width * 2) return null;
    if (k > 0 && centers[k].distanceTo(centers[k - 1]) > Math.max(0.1, width * 6)) return null;
    widths[k].divideScalar(w);
  }
  // 法线：资产的（扁带两面同一条法线）；没有就用「切线 × 宽度」。整条朝同一面
  for (let k = 0; k < sections; k += 1) {
    const t = centers[Math.min(sections - 1, k + 1)].clone().sub(centers[Math.max(0, k - 1)]).normalize();
    let n = nrm ? new THREE.Vector3().fromBufferAttribute(nrm, first[2 * k]) : new THREE.Vector3().crossVectors(t, widths[k]);
    n.addScaledVector(t, -n.dot(t)).addScaledVector(widths[k], -n.dot(widths[k]));
    if (n.lengthSq() < 1e-10) n = new THREE.Vector3().crossVectors(t, widths[k]);
    n.normalize();
    if (k > 0 && n.dot(normals[k - 1]) < 0) n.negate();
    normals.push(n);
  }
  const arc = [0];
  for (let k = 1; k < sections; k += 1) arc.push(arc[k - 1] + centers[k].distanceTo(centers[k - 1]));
  const length = arc[sections - 1];
  const out = { count, length, width, points: new Float32Array(count * 3), widthDirs: new Float32Array(count * 3), normals: new Float32Array(count * 3) };
  const p = new THREE.Vector3(), w = new THREE.Vector3(), n = new THREE.Vector3();
  let seg = 0;
  for (let j = 0; j < count; j += 1) {
    const s = (j / (count - 1)) * length;
    while (seg < sections - 2 && arc[seg + 1] < s) seg += 1;
    const span = arc[seg + 1] - arc[seg], t = span > 1e-9 ? THREE.MathUtils.clamp((s - arc[seg]) / span, 0, 1) : 0;
    p.lerpVectors(centers[seg], centers[seg + 1], t);
    w.lerpVectors(widths[seg], widths[seg + 1], t).normalize();
    n.lerpVectors(normals[seg], normals[seg + 1], t).normalize();
    p.toArray(out.points, j * 3); w.toArray(out.widthDirs, j * 3); n.toArray(out.normals, j * 3);
  }
  return out;
}

// ---------------------------------------------------------------- 身体表面采样

const _bindVertex = new THREE.Vector3();
const geometrySamples = new WeakMap();   // geometry → Int32Array（体素抽稀后的顶点号，跳过 skipBones 的骨头）

/**
 * 一个蒙皮网格的候选顶点：绑定姿势下按体素抽稀，一个体素留一个；主骨在 skipBones 里的不要。同一份几何的克隆共用。
 * 体素按真实尺寸划：绑定空间的单位各模型不一样（日兵甲、何有田的 GLB 是厘米，装进游戏才缩），用「绑定空间 → 世界」
 * 的缩放（任一根骨的 matrixWorld × boneInverse，再乘网格的 matrixWorld × bindMatrixInverse）把 sampleVoxelM 换过去。
 */
function GeometrySamples(mesh, cfg) {
  const geometry = mesh.geometry;
  const pos = geometry.attributes.position, nrm = geometry.attributes.normal;
  const si = geometry.attributes.skinIndex, sw = geometry.attributes.skinWeight, bones = mesh.skeleton?.bones;
  let list = new Int32Array(0);
  if (pos && nrm && si && sw && bones?.length) {
    const toWorld = new THREE.Matrix4().multiplyMatrices(mesh.matrixWorld, mesh.bindMatrixInverse)
      .multiply(new THREE.Matrix4().multiplyMatrices(bones[0].matrixWorld, mesh.skeleton.boneInverses[0]));
    const seen = new Set(), keep = [], voxel = cfg.sampleVoxelM / (toWorld.getMaxScaleOnAxis() || 1);
    const key = `${voxel.toPrecision(5)}:${cfg.skipBones.source}`;
    let cache = geometrySamples.get(geometry);
    if (cache?.has(key)) return cache.get(key);
    if (!cache) { cache = new Map(); geometrySamples.set(geometry, cache); }
    for (let i = 0; i < pos.count; i += 1) {
      let best = -1, bw = 0;
      for (let k = 0; k < 4; k += 1) { const wk = sw.getComponent(i, k); if (wk > bw) { bw = wk; best = si.getComponent(i, k); } }
      const bone = bones[best];
      if (!bone || cfg.skipBones.test(bone.name)) continue;
      if (voxel > 0) {
        _bindVertex.fromBufferAttribute(pos, i).applyMatrix4(mesh.bindMatrix);
        const cell = `${Math.round(_bindVertex.x / voxel)},${Math.round(_bindVertex.y / voxel)},${Math.round(_bindVertex.z / voxel)}`;
        if (seen.has(cell)) continue;
        seen.add(cell);
      }
      keep.push(i);
    }
    list = Int32Array.from(keep);
    cache.set(key, list);
  }
  return list;
}

/**
 * 身体表面采样点：这个人看得见的蒙皮网格上、离资产带子 sampleRadiusM 以内的顶点（体素抽稀）。每个点存四根骨头下的
 * 本地位置 / 法线和权重，每帧按骨头世界矩阵混合 = GPU 蒙皮同一个公式（含 Detached 绑定的 matrixWorld × bindMatrixInverse）。
 */
export class BodySurfaceSamples {
  constructor() {
    this.count = 0;
    this.meshes = [];
    this.bones = [];
    this.position = new Float32Array(0);   // 每帧：这一帧的位置 / 法线（调用方给的坐标系）
    this.normal = new Float32Array(0);
  }

  /** 从这些蒙皮网格里挑 near（世界坐标点列表，Float32Array / 数组，每点 3 个数）附近的顶点。 */
  Build(meshes, near, cfg = RIFLE_SLING_CLOTH) {
    const boneSlots = new Map(), meshSlots = [], entries = [];
    const p = new THREE.Vector3(), n = new THREE.Vector3(), local = new THREE.Vector3(), M = new THREE.Matrix4(), X = new THREE.Matrix4();
    const nearCount = Math.floor(near.length / 3), r2 = cfg.sampleRadiusM * cfg.sampleRadiusM;
    for (const mesh of meshes) {
      const list = GeometrySamples(mesh, cfg);
      if (!list.length) continue;
      const geometry = mesh.geometry, pos = geometry.attributes.position, nrm = geometry.attributes.normal;
      const si = geometry.attributes.skinIndex, sw = geometry.attributes.skinWeight, skeleton = mesh.skeleton;
      X.multiplyMatrices(mesh.matrixWorld, mesh.bindMatrixInverse);
      const skin = skeleton.bones.map((bone, b) => new THREE.Matrix4().multiplyMatrices(bone.matrixWorld, skeleton.boneInverses[b]));
      let meshSlot = -1;
      for (let li = 0; li < list.length; li += 1) {
        const i = list[li];
        // 这一刻的世界位置（同 GPU 蒙皮）
        _bindVertex.fromBufferAttribute(pos, i).applyMatrix4(mesh.bindMatrix);
        p.set(0, 0, 0);
        let wsum = 0;
        for (let k = 0; k < 4; k += 1) {
          const wk = sw.getComponent(i, k);
          if (wk < 0.02) continue;
          p.addScaledVector(local.copy(_bindVertex).applyMatrix4(skin[si.getComponent(i, k)]), wk);
          wsum += wk;
        }
        if (wsum < 1e-6) continue;
        p.divideScalar(wsum).applyMatrix4(X);
        let close = false;
        for (let j = 0; j < nearCount && !close; j += 1) {
          const dx = p.x - near[j * 3], dy = p.y - near[j * 3 + 1], dz = p.z - near[j * 3 + 2];
          close = dx * dx + dy * dy + dz * dz < r2;
        }
        if (!close) continue;
        if (meshSlot < 0) { meshSlot = meshSlots.length; meshSlots.push(mesh); }
        let dom = 0, dw = -1;
        for (let k = 0; k < 4; k += 1) { const wk = sw.getComponent(i, k); if (wk > dw) { dw = wk; dom = si.getComponent(i, k); } }
        const entry = { mesh: meshSlot, vertex: i, bones: [], weights: [], lp: [], ln: [], push: cfg.softBones?.test(skeleton.bones[dom]?.name || "") ? cfg.softPush : 1 };
        n.fromBufferAttribute(nrm, i);
        for (let k = 0; k < 4; k += 1) {
          const wk = sw.getComponent(i, k);
          if (wk < 0.02) continue;
          const b = si.getComponent(i, k), bone = skeleton.bones[b];
          if (!boneSlots.has(bone)) boneSlots.set(bone, boneSlots.size);
          M.multiplyMatrices(skeleton.boneInverses[b], mesh.bindMatrix);
          entry.bones.push(boneSlots.get(bone));
          entry.weights.push(wk / wsum);
          entry.lp.push(local.copy(_bindVertex.fromBufferAttribute(pos, i)).applyMatrix4(M).toArray());
          entry.ln.push(local.copy(n).transformDirection(M).toArray());
        }
        entries.push(entry);
      }
    }
    const S = entries.length;
    this.count = S;
    this.meshes = meshSlots;
    this.bones = [...boneSlots.keys()];
    this.meshOf = new Int32Array(S);
    this.vertexOf = new Int32Array(S);
    this.push = new Float32Array(S);         // 推回的比例（1 = 硬；softBones 的点 = softPush）
    this.boneOf = new Int32Array(S * 4).fill(-1);
    this.weight = new Float32Array(S * 4);
    this.lp = new Float32Array(S * 12);
    this.ln = new Float32Array(S * 12);
    entries.forEach((e, s) => {
      this.meshOf[s] = e.mesh;
      this.vertexOf[s] = e.vertex;
      this.push[s] = e.push;
      for (let k = 0; k < e.bones.length; k += 1) {
        this.boneOf[s * 4 + k] = e.bones[k];
        this.weight[s * 4 + k] = e.weights[k];
        this.lp.set(e.lp[k], s * 12 + k * 3);
        this.ln.set(e.ln[k], s * 12 + k * 3);
      }
    });
    this.position = new Float32Array(S * 3);
    this.normal = new Float32Array(S * 3);
    this._meshM = this.meshes.map(() => new THREE.Matrix4());
    this._boneE = new Float32Array(this.bones.length * 16);
    this._lastBoneE = new Float64Array(this.bones.length * 16).fill(NaN);
    this._lastMeshE = new Float64Array(this.meshes.length * 16).fill(NaN);
    this._fullValid = false;
    this._updatedOnly = undefined;
    return this;
  }

  /**
   * 按此刻的骨头算一遍位置 / 法线，再左乘 frame（世界 → 调用方坐标系；null = 世界）。only = 只算这些点
   * （Int32Array；绳只用得着离它近的那些，其余点的值留着上次的）。
   */
  Update(frame = null, only = null, positionsOnly = false) {
    const S = only ? only.length : this.count;
    if (!this.count) return;
    let changed = false;
    for (let m = 0; m < this.meshes.length; m += 1) {
      const mesh = this.meshes[m];
      this._meshM[m].multiplyMatrices(mesh.matrixWorld, mesh.bindMatrixInverse);
      if (frame) this._meshM[m].premultiply(frame);
      const elements = this._meshM[m].elements;
      for (let k = 0; k < 16 && !changed; k++) changed = elements[k] !== this._lastMeshE[m * 16 + k];
      this._lastMeshE.set(elements, m * 16);
    }
    const B = this._boneE;
    for (let b = 0; b < this.bones.length; b += 1) {
      const elements = this.bones[b].matrixWorld.elements;
      for (let k = 0; k < 16 && !changed; k++) changed = elements[k] !== this._lastBoneE[b * 16 + k];
      this._lastBoneE.set(elements, b * 16); B.set(elements, b * 16);
    }
    if (!changed && (this._fullValid || only === this._updatedOnly)) return;
    if (changed) this._fullValid = false;
    if (!only) this._fullValid = true;
    this._updatedOnly = only;
    const P = this.position, N = this.normal, lp = this.lp, ln = this.ln, W = this.weight, bo = this.boneOf;
    for (let j = 0; j < S; j += 1) {
      const s = only ? only[j] : j;
      let px = 0, py = 0, pz = 0, nx = 0, ny = 0, nz = 0;
      for (let k = 0; k < 4; k += 1) {
        const b = bo[s * 4 + k];
        if (b < 0) break;
        const w = W[s * 4 + k], e = b * 16, o = s * 12 + k * 3;
        const x = lp[o], y = lp[o + 1], z = lp[o + 2];
        px += w * (B[e] * x + B[e + 4] * y + B[e + 8] * z + B[e + 12]);
        py += w * (B[e + 1] * x + B[e + 5] * y + B[e + 9] * z + B[e + 13]);
        pz += w * (B[e + 2] * x + B[e + 6] * y + B[e + 10] * z + B[e + 14]);
        if (!positionsOnly) {
          const a = ln[o], c = ln[o + 1], d = ln[o + 2];
          nx += w * (B[e] * a + B[e + 4] * c + B[e + 8] * d);
          ny += w * (B[e + 1] * a + B[e + 5] * c + B[e + 9] * d);
          nz += w * (B[e + 2] * a + B[e + 6] * c + B[e + 10] * d);
        }
      }
      const M = this._meshM[this.meshOf[s]].elements;
      P[s * 3] = M[0] * px + M[4] * py + M[8] * pz + M[12];
      P[s * 3 + 1] = M[1] * px + M[5] * py + M[9] * pz + M[13];
      P[s * 3 + 2] = M[2] * px + M[6] * py + M[10] * pz + M[14];
      if (!positionsOnly) {
        const ax = M[0] * nx + M[4] * ny + M[8] * nz, ay = M[1] * nx + M[5] * ny + M[9] * nz, az = M[2] * nx + M[6] * ny + M[10] * nz;
        const len = Math.sqrt(ax * ax + ay * ay + az * az) || 1;
        N[s * 3] = ax / len; N[s * 3 + 1] = ay / len; N[s * 3 + 2] = az / len;
      }
    }
  }
}

// Exact lower-garment contacts supplement the coarse surfels. Keeping the true indexed faces
// avoids treating a point below an open hem as "inside", and catches crossings between particles.
class BodyTrianglePatches extends BodySurfaceSamples {
  Build(meshes, near, cfg) {
    super.Build(meshes, near, { ...cfg, sampleVoxelM: 0, sampleRadiusM: cfg.triangleRadiusM });
    const maps = this.meshes.map(() => new Map());
    for (let i = 0; i < this.count; i++) maps[this.meshOf[i]].set(this.vertexOf[i], i);
    const triangles = [];
    for (let m = 0; m < this.meshes.length; m++) {
      const geometry = this.meshes[m].geometry, index = geometry.index;
      const count = index ? index.count : geometry.attributes.position.count, map = maps[m];
      for (let i = 0; i < count; i += 3) {
        const a = map.get(index ? index.getX(i) : i), b = map.get(index ? index.getX(i + 1) : i + 1), c = map.get(index ? index.getX(i + 2) : i + 2);
        if (a !== undefined && b !== undefined && c !== undefined) triangles.push(a, b, c);
      }
    }
    this.triangles = Int32Array.from(triangles);
    this.bounds = new Float32Array(triangles.length * 2);
    this.activeTriangles = null;
    this.candidates = [];
    this.narrowLists = [];
    this.narrowBounds = null;
    this.narrowCounts = null;
    this.narrowValid = null;
    this.active = null;
    this.ray = new THREE.Ray();
    this.triangle = new THREE.Triangle();
    this.hit = new THREE.Vector3();
    this.normalV = new THREE.Vector3();
    this.endpoint = new THREE.Vector3();
    return this;
  }

  Update(frame = null, only = null) {
    super.Update(frame, only, true);
    this.narrowValid?.fill(0);
    const list = only ? this.activeTriangles : null, T = this.triangles, P = this.position, B = this.bounds;
    for (let j = 0; j < (list ? list.length : T.length / 3); j++) {
      const t = list ? list[j] : j * 3, a = T[t] * 3, b = T[t + 1] * 3, c = T[t + 2] * 3, at = t * 2;
      for (let axis = 0; axis < 3; axis++) {
        B[at + axis] = Math.min(P[a + axis], P[b + axis], P[c + axis]);
        B[at + axis + 3] = Math.max(P[a + axis], P[b + axis], P[c + axis]);
      }
    }
  }

  RefreshCandidates(rope) {
    const lists = Array.from({ length: rope.count - 1 }, () => []), active = new Set(), activeTriangles = [];
    const p = rope.p, T = this.triangles, B = this.bounds, margin = rope.cfg.surfaceSupportM;
    this.start = Math.floor(rope.count * rope.cfg.triangleFromFraction);
    for (let t = 0; t < T.length; t += 3) {
      const at = t * 2; let used = false;
      for (let i = this.start; i < rope.count - 1; i++) {
        const j = i * 3, k = j + 3;
        let overlaps = true;
        for (let axis = 0; axis < 3 && overlaps; axis++) {
          overlaps = Math.max(p[j + axis], p[k + axis]) + margin >= B[at + axis]
            && Math.min(p[j + axis], p[k + axis]) - margin <= B[at + axis + 3];
        }
        if (overlaps) { lists[i].push(t); active.add(T[t]); active.add(T[t + 1]); active.add(T[t + 2]); used = true; }
      }
      if (used) activeTriangles.push(t);
    }
    this.candidates = lists.map(list => Int32Array.from(list));
    for (let i=0;i<lists.length;i++) if (!this.narrowLists[i] || this.narrowLists[i].length < lists[i].length)
      this.narrowLists[i] = new Int32Array(Math.max(8,2 ** Math.ceil(Math.log2(Math.max(1,lists[i].length)))));
    this.narrowBounds ||= new Float64Array(lists.length*6);
    this.narrowCounts ||= new Int32Array(lists.length);
    this.narrowValid ||= new Uint8Array(lists.length);
    this.narrowValid.fill(0);
    this.active = Int32Array.from(active);
    this.activeTriangles = Int32Array.from(activeTriangles);
  }

  Collide(rope, broad = false) {
    const p = rope.p, P = this.position, T = this.triangles, B = this.bounds;
    const ray = this.ray, triangle = this.triangle, hit = this.hit, normal = this.normalV;
    let needsBroad = false;
    for (let i = this.start; i < rope.count - 1; i++) {
      let list = this.candidates[i];
      if (!list?.length) continue;
      const from = i * 3, to = from + 3;
      ray.origin.fromArray(p, from); this.endpoint.fromArray(p, to);
      let length = ray.direction.subVectors(this.endpoint, ray.origin).length();
      if (length < 1e-9) continue;
      ray.direction.multiplyScalar(1 / length);
      let minX=Math.min(p[from],p[to]),maxX=Math.max(p[from],p[to]),minY=Math.min(p[from+1],p[to+1]),maxY=Math.max(p[from+1],p[to+1]),minZ=Math.min(p[from+2],p[to+2]),maxZ=Math.max(p[from+2],p[to+2]);
      let count=list.length;
      const useNarrow=!broad&&!rope.hard,E=this.narrowBounds,off=i*6;
      if(useNarrow) {
        if(!this.narrowValid[i]||minX<E[off]||minY<E[off+1]||minZ<E[off+2]||maxX>E[off+3]||maxY>E[off+4]||maxZ>E[off+5]) {
          const margin=rope.cfg.contactM;
          E[off]=minX-margin;E[off+1]=minY-margin;E[off+2]=minZ-margin;E[off+3]=maxX+margin;E[off+4]=maxY+margin;E[off+5]=maxZ+margin;
          const nearby=this.narrowLists[i];let selected=0;
          for(const t of list){const at=t*2;if(B[at+3]>=E[off]&&B[at]<=E[off+3]&&B[at+4]>=E[off+1]&&B[at+1]<=E[off+4]&&B[at+5]>=E[off+2]&&B[at+2]<=E[off+5])nearby[selected++]=t;}
          this.narrowCounts[i]=selected;this.narrowValid[i]=1;
        }
        list=this.narrowLists[i];count=this.narrowCounts[i];
      }
      for (let candidate=0;candidate<count;candidate++) {
        const t=list[candidate];
        const at = t * 2;
        if (maxX < B[at] || minX > B[at+3] || maxY < B[at+1] || minY > B[at+4] || maxZ < B[at+2] || minZ > B[at+5]) continue;
        const a = T[t] * 3, b = T[t + 1] * 3, c = T[t + 2] * 3;
        triangle.a.fromArray(P, a); triangle.b.fromArray(P, b); triangle.c.fromArray(P, c);
        if (!ray.intersectTriangle(triangle.a, triangle.b, triangle.c, false, hit) || hit.distanceToSquared(ray.origin) > length * length) continue;
        triangle.getNormal(normal);
        for (const endpoint of [i, i + 1]) {
          if (endpoint === 0 || endpoint === rope.count - 1) continue;
          const at = endpoint * 3;
          const distance = (p[at] - hit.x) * normal.x + (p[at + 1] - hit.y) * normal.y + (p[at + 2] - hit.z) * normal.z;
          if (distance < rope.radius) {
            const correction = rope.radius - distance;
            p[at] += normal.x * correction; p[at + 1] += normal.y * correction; p[at + 2] += normal.z * correction;
          }
        }
        ray.origin.fromArray(p, from); this.endpoint.fromArray(p, to);
        length = ray.direction.subVectors(this.endpoint, ray.origin).length();
        if (length < 1e-9) break;
        ray.direction.multiplyScalar(1 / length);
        minX=Math.min(p[from],p[to]);maxX=Math.max(p[from],p[to]);minY=Math.min(p[from+1],p[to+1]);maxY=Math.max(p[from+1],p[to+1]);minZ=Math.min(p[from+2],p[to+2]);maxZ=Math.max(p[from+2],p[to+2]);
        if(useNarrow&&(minX<E[off]||minY<E[off+1]||minZ<E[off+2]||maxX>E[off+3]||maxY>E[off+4]||maxZ>E[off+5])) needsBroad=true;
      }
    }
    // A projection which leaves the cached envelope gets the complete broad list immediately.
    // The cache can therefore omit no triangle that could intersect the current segment.
    if(needsBroad)this.Collide(rope,true);
  }
}

// ---------------------------------------------------------------- 绳（求解器，纯数）

/**
 * 两头钉住的绳（count 个质点，坐标系由调用方定：这里不管世界 / 挂点）。热循环里不用 Math.hypot（V8 里比 sqrt 慢一个量级）。身体 = 表面采样点（位置 + 外法线），
 * 每个质点按最近那个采样点的切平面推出去。rest = 资产形状（同一坐标系，每帧可换：拉回走向用、两头钉在它的端点上）。
 */
export class SlingRope {
  constructor(count, cfg = RIFLE_SLING_CLOTH) {
    this.cfg = cfg;
    this.count = count;
    this.p = new Float64Array(count * 3);
    this.prev = new Float64Array(count * 3);
    this.rest = new Float64Array(count * 3);
    this.guide = null;
    this.segment = 0.03;
    this.radius = cfg.thicknessM / 2 + cfg.surfaceGapM;
    this.candidates = [];                       // 每个质点的候选采样点号
    this.plane = new Int32Array(count).fill(-1); // 这一子步最近的采样点（-1 = 附近没有身体）
    this.planeP = new Float64Array(count * 3);   // 这一子步的切平面：过哪一点、外法线（PickPlanes）
    this.planeN = new Float64Array(count * 3);
    this.planeK = new Float32Array(count).fill(1); // 这一子步推回的比例（最近几个采样点的 push 插值）
    this.hard = false;                          // true = 不管 planeK 一律硬推（装上收紧那几轮）
    this.distance = new Float32Array(count).fill(1);   // 离那个切平面的距离（推完之后）
    this.samples = null;                        // { count, position, normal }
    this.active = new Int32Array(0);            // 所有候选的并集（每帧只用更新这些采样点）
    this.candidateAge = Infinity;               // 候选算了多少帧了（调用方数）
  }

  /** rest：Float32Array / Float64Array（count × 3）。 */
  SetRest(rest) { this.rest.set(rest); }

  SetSamples(samples) { this.samples = samples; this.candidateAge = Infinity; }

  /** 每个质点的候选采样点：此刻离它 candidateRadiusM 以内的（采样点要是这一刻的全部位置）。 */
  RefreshCandidates() {
    const S = this.samples, n = this.count, r2 = this.cfg.candidateRadiusM ** 2;
    this.candidateAge = 0;
    this.candidates = [];
    if (!S?.count) { for (let i = 0; i < n; i += 1) this.candidates.push(new Int32Array(0)); this.active = new Int32Array(0); return; }
    const union = new Set();
    const P = S.position, p = this.p;
    for (let i = 0; i < n; i += 1) {
      const list = [];
      const x = p[i * 3], y = p[i * 3 + 1], z = p[i * 3 + 2];
      const r = this.cfg.candidateRadiusM;
      for (let s = 0; s < S.count; s += 1) {
        const dx = P[s * 3] - x;
        if (dx > r || dx < -r) continue;
        const dy = P[s * 3 + 1] - y, dz = P[s * 3 + 2] - z;
        if (dx * dx + dy * dy + dz * dz < r2) { list.push(s); union.add(s); }
      }
      this.candidates.push(Int32Array.from(list));
    }
    this.active = Int32Array.from(union);
    this.patches?.RefreshCandidates(this);
  }

  /**
   * 每个质点的切平面（这一子步用）：候选里最近的三个采样点，位置、法线按距离倒数加权插（只拿最近一个的话，3 cm 一个点
   * 在曲面上切平面太粗，真表面量出来会陷进去 5–6 mm）。plane = 最近那个采样点号（-1 = 附近没有身体）。
   */
  PickPlanes() {
    const S = this.samples, p = this.p, PP = this.planeP, PN = this.planeN;
    if (!S?.count) { this.plane.fill(-1); return; }
    const P = S.position, N = S.normal;
    for (let i = 0; i < this.count; i += 1) {
      const list = this.candidates[i];
      let s0 = -1, s1 = -1, s2 = -1, d0 = Infinity, d1 = Infinity, d2 = Infinity;
      const x = p[i * 3], y = p[i * 3 + 1], z = p[i * 3 + 2];
      for (let c = 0; c < list.length; c += 1) {
        const s = list[c], dx = P[s * 3] - x, dy = P[s * 3 + 1] - y, dz = P[s * 3 + 2] - z, d = dx * dx + dy * dy + dz * dz;
        if (d < d0) { s2 = s1; d2 = d1; s1 = s0; d1 = d0; s0 = s; d0 = d; }
        else if (d < d1) { s2 = s1; d2 = d1; s1 = s; d1 = d; }
        else if (d < d2) { s2 = s; d2 = d; }
      }
      this.plane[i] = s0;
      if (s0 < 0) continue;
      let px = 0, py = 0, pz = 0, nx = 0, ny = 0, nz = 0, wsum = 0, k = 0;
      for (let near = 0; near < 3; near++) {
        const s = near === 0 ? s0 : near === 1 ? s1 : s2, d = near === 0 ? d0 : near === 1 ? d1 : d2;
        if (s < 0) continue;
        const w = 1 / (Math.sqrt(d) + 0.004);
        k += w * (S.push ? S.push[s] : 1);
        px += w * P[s * 3]; py += w * P[s * 3 + 1]; pz += w * P[s * 3 + 2];
        nx += w * N[s * 3]; ny += w * N[s * 3 + 1]; nz += w * N[s * 3 + 2];
        wsum += w;
      }
      const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
      if (len < 1e-6) { nx = N[s0 * 3]; ny = N[s0 * 3 + 1]; nz = N[s0 * 3 + 2]; } else { nx /= len; ny /= len; nz /= len; }
      PP[i * 3] = px / wsum; PP[i * 3 + 1] = py / wsum; PP[i * 3 + 2] = pz / wsum;
      this.planeK[i] = k / wsum;
      PN[i * 3] = nx; PN[i * 3 + 1] = ny; PN[i * 3 + 2] = nz;
      const dx = x - px / wsum, dy = y - py / wsum, dz = z - pz / wsum;
      const signed = dx * nx + dy * ny + dz * nz;
      // Do not extend the hem's top/bottom tangent across empty space beside the hip.
      if (dx * dx + dy * dy + dz * dz - signed * signed > this.cfg.surfaceSupportM ** 2) this.plane[i] = -1;
    }
  }

  /** 按切平面推出去（返回推完之后离平面的距离存进 distance）。 */
  Collide() {
    const S = this.samples, p = this.p, r = this.radius;
    if (!S?.count) { this.distance.fill(1); return; }
    const P = this.planeP, N = this.planeN;
    for (let i = 1; i < this.count - 1; i += 1) {
      if (this.plane[i] < 0) { this.distance[i] = 1; continue; }
      const nx = N[i * 3], ny = N[i * 3 + 1], nz = N[i * 3 + 2];
      let d = (p[i * 3] - P[i * 3]) * nx + (p[i * 3 + 1] - P[i * 3 + 1]) * ny + (p[i * 3 + 2] - P[i * 3 + 2]) * nz - r;
      if (d < 0) { const k = this.hard ? 1 : this.planeK[i]; p[i * 3] -= nx * d * k; p[i * 3 + 1] -= ny * d * k; p[i * 3 + 2] -= nz * d * k; d *= 1 - k; }
      this.distance[i] = d;
    }
  }

  _Pin() {
    const n = this.count, p = this.p, R = this.rest;
    for (const i of [0, n - 1]) { p[i * 3] = R[i * 3]; p[i * 3 + 1] = R[i * 3 + 1]; p[i * 3 + 2] = R[i * 3 + 2]; }
  }

  /** 段长约束：拉长按 stretch、压短按 compress 改回 segment（两头的点不动）。reverse = 从尾扫到头（交替扫，两头的钉子都传得开）。 */
  _Distances(segment, stretch, compress, reverse = false) {
    const n = this.count, p = this.p;
    for (let j = 0; j < n - 1; j += 1) {
      const i = reverse ? n - 2 - j : j;
      const a = i * 3, b = a + 3;
      const dx = p[b] - p[a], dy = p[b + 1] - p[a + 1], dz = p[b + 2] - p[a + 2];
      const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (len < 1e-9) continue;
      const k = len > segment ? stretch : compress;
      if (!k) continue;
      const wa = i === 0 ? 0 : 1, wb = i + 1 === n - 1 ? 0 : 1, wsum = wa + wb;
      if (!wsum) continue;
      const c = (k * (len - segment)) / (len * wsum);
      p[a] += dx * c * wa; p[a + 1] += dy * c * wa; p[a + 2] += dz * c * wa;
      p[b] -= dx * c * wb; p[b + 1] -= dy * c * wb; p[b + 2] -= dz * c * wb;
    }
  }

  /** 抗弯：中间点往左右邻点的中点挪一点（皮带不打死折）。 */
  _Bend(k) {
    if (!k) return;
    const n = this.count, p = this.p;
    for (let i = 1; i < n - 1; i += 1) {
      const a = (i - 1) * 3, b = i * 3, c = (i + 1) * 3;
      for (let j = 0; j < 3; j += 1) p[b + j] += k * ((p[a + j] + p[c + j]) * 0.5 - p[b + j]);
    }
  }

  _Bias(k) {
    if (!k) return;
    const n = this.count, p = this.p, R = this.guide || this.rest;
    for (let i = 3; i < 3 * (n - 1); i += 1) p[i] += k * (R[i] - p[i]);
  }

  /** 装上：从资产形状起收紧裹到身上，量裹紧的长度定绳长，再垂一会儿。gravity = [x, y, z]（这个坐标系里）。 */
  Fit(gravity = [0, -this.cfg.gravity, 0]) {
    const cfg = this.cfg, n = this.count;
    this.guide = null;
    this.p.set(this.rest);
    let restLength = 0;
    for (let i = 0; i < n - 1; i += 1) restLength += this._SegmentLength(i);
    const shrink = (restLength / (n - 1)) * cfg.wrapShrink;
    // 收紧时全部硬推：软推的前臂拦不住收紧的拉力，带子会被拉穿到胳膊外面（应从胳膊和腰之间过）
    this.hard = true;
    this.RefreshCandidates();
    for (let it = 0; it < cfg.wrapIterations; it += 1) {
      if (it % 10 === 0) this.RefreshCandidates();
      this._Pin();
      this._Distances(shrink, 0.5, 0.5, (it & 1) === 1);
      this._Bend(cfg.bend);
      this._Bias(cfg.restBias * 4);
      this.PickPlanes();
      this.Collide();
      this.patches?.Collide(this);
    }
    this.hard = false;
    let wrapped = 0;
    for (let i = 0; i < n - 1; i += 1) wrapped += this._SegmentLength(i);
    this.segment = (wrapped * (1 + cfg.slack)) / (n - 1);
    this.wrappedLength = wrapped;
    this.prev.set(this.p);
    // 垂稳：照常推，每 0.05 s 清一次速度
    const steps = Math.ceil(cfg.settleS / cfg.substepS), clearEvery = Math.max(1, Math.round(0.05 / cfg.substepS));
    for (let s = 0; s < steps; s += 1) {
      this.Substep(cfg.substepS, gravity);
      if (s % clearEvery === 0) this.prev.set(this.p);
    }
    this.prev.set(this.p);
    // 垂稳后身体把带子撑得比收紧时还长（收紧那几轮有的点从采样点之间抄了近路）：按撑开后的长度算，开场不绷着
    let settled = 0;
    for (let i = 0; i < n - 1; i += 1) settled += this._SegmentLength(i);
    this.segment = Math.max(this.segment, settled / (n - 1));
    // Keep the authored over-shoulder / under-arm topology. On the chest, an artist guide
    // outside the contact allowance must follow the settled body fit, not pull it out again.
    this.guide = Float64Array.from(this.rest);
    const surface = this.samples;
    if (surface?.count) for (let i = Math.floor(n * cfg.guideFromFraction); i < Math.floor(n * cfg.guideToFraction); i++) {
      const at = i * 3, P = surface.position, N = surface.normal;
      let nearest = -1, best = Infinity;
      for (let sampleIndex = 0; sampleIndex < surface.count; sampleIndex++) {
        const j = sampleIndex * 3, dx = this.rest[at] - P[j], dy = this.rest[at + 1] - P[j + 1], dz = this.rest[at + 2] - P[j + 2];
        const distance = dx * dx + dy * dy + dz * dz;
        if (distance < best) { best = distance; nearest = j; }
      }
      const j = nearest, gap = (this.rest[at] - P[j]) * N[j] + (this.rest[at + 1] - P[j + 1]) * N[j + 1] + (this.rest[at + 2] - P[j + 2]) * N[j + 2];
      if (gap > this.radius + cfg.contactM) for (let axis = 0; axis < 3; axis++) this.guide[at + axis] = this.p[at + axis];
    }
    this.RefreshCandidates();
  }

  _SegmentLength(i) {
    const p = this.p, a = i * 3, b = a + 3;
    const dx = p[b] - p[a], dy = p[b + 1] - p[a + 1], dz = p[b + 2] - p[a + 2];
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  /** 一个子步：Verlet（重力、阻尼、限速）→ iterations 轮约束 → 贴身的点摩擦、限速。gravity = [x, y, z]（这个坐标系里）。 */
  Substep(h, gravity) {
    const cfg = this.cfg, n = this.count, p = this.p, q = this.prev;
    const damp = Math.max(0, 1 - cfg.airDamping * h), vmax = cfg.maxSpeedMps * h;
    const gx = gravity[0] * h * h, gy = gravity[1] * h * h, gz = gravity[2] * h * h;
    for (let i = 1; i < n - 1; i += 1) {
      const a = i * 3;
      let vx = (p[a] - q[a]) * damp, vy = (p[a + 1] - q[a + 1]) * damp, vz = (p[a + 2] - q[a + 2]) * damp;
      const v = Math.sqrt(vx * vx + vy * vy + vz * vz);
      if (v > vmax) { const k = vmax / v; vx *= k; vy *= k; vz *= k; }
      q[a] = p[a]; q[a + 1] = p[a + 1]; q[a + 2] = p[a + 2];
      p[a] += vx + gx; p[a + 1] += vy + gy; p[a + 2] += vz + gz;
    }
    for (let it = 0; it < cfg.iterations; it += 1) {
      this._Pin();
      this._Distances(this.segment, cfg.stretch, cfg.compress, (it & 1) === 1);
      this._Bend(cfg.bend);
      this._Bias(cfg.restBias);
      if (it === 0) this.PickPlanes();
      this.Collide();
      this.patches?.Collide(this);
    }
    // 摩擦：贴着身体的点去掉一部分切向位移；再限速（身体一下顶出来的那一推不弹飞）
    const S = this.samples;
    for (let i = 1; i < n - 1; i += 1) {
      const a = i * 3;
      let dx = p[a] - q[a], dy = p[a + 1] - q[a + 1], dz = p[a + 2] - q[a + 2];
      if (S && this.plane[i] >= 0 && this.distance[i] < cfg.contactM) {
        const N = this.planeN, nx = N[a], ny = N[a + 1], nz = N[a + 2], dn = dx * nx + dy * ny + dz * nz;
        const tx = dx - nx * dn, ty = dy - ny * dn, tz = dz - nz * dn, f = cfg.friction;
        q[a] += tx * f; q[a + 1] += ty * f; q[a + 2] += tz * f;
        dx -= tx * f; dy -= ty * f; dz -= tz * f;
      }
      const v = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (v > vmax) { const k = 1 - vmax / v; q[a] += dx * k; q[a + 1] += dy * k; q[a + 2] += dz * k; }
    }
  }

  /**
   * 挂点坐标系在动：传惯性。now / last = 这一帧、上一帧「上一帧坐标 → 这一帧坐标」的变换（Matrix4 的 elements）。
   * 匀速平移 / 匀速转动时两者相同，带子跟着走、不受力；变速（起跑、急停、跑动的上下颠、转身）时差出来的那一截
   * 就是惯性把带子甩开的位移，按 k 加到 p 上（prev 不动 = 给了一个速度）。ratio = 这一帧 dt / 上一帧 dt（帧长不等时
   * 上一帧的位移按它折算，匀速不因帧长抖动受力）。每点最多 maxM。
   */
  Carry(now, last, ratio, k, maxM) {
    if (!k) return;
    const p = this.p, m2 = maxM * maxM, r = ratio;
    for (let i = 1; i < this.count - 1; i += 1) {
      const a = i * 3, x = p[a], y = p[a + 1], z = p[a + 2];
      const ux = now[0] * x + now[4] * y + now[8] * z + now[12] - x, vx = last[0] * x + last[4] * y + last[8] * z + last[12] - x;
      const uy = now[1] * x + now[5] * y + now[9] * z + now[13] - y, vy = last[1] * x + last[5] * y + last[9] * z + last[13] - y;
      const uz = now[2] * x + now[6] * y + now[10] * z + now[14] - z, vz = last[2] * x + last[6] * y + last[10] * z + last[14] - z;
      let dx = ux - r * vx, dy = uy - r * vy, dz = uz - r * vz;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 > m2) { const s = maxM / Math.sqrt(d2); dx *= s; dy *= s; dz *= s; }
      p[a] += k * dx; p[a + 1] += k * dy; p[a + 2] += k * dz;
    }
  }

  /** 清速度。 */
  Still() { this.prev.set(this.p); }

  /** 当前总长 / 最长一段相对绳段长的倍数（门禁、调参用）。 */
  Stats() {
    let total = 0, maxRatio = 0;
    for (let i = 0; i < this.count - 1; i += 1) { const l = this._SegmentLength(i); total += l; maxRatio = Math.max(maxRatio, l / this.segment); }
    return { length: total, segment: this.segment, maxStretch: maxRatio, wrapped: this.wrappedLength };
  }
}

// ---------------------------------------------------------------- 带子网格（一个质点一根骨头）

const skinnedMaterials = new WeakMap();
/** 原带子的材质拷一份给蒙皮的用（同一个材质被蒙皮 / 不蒙皮的网格交替画会每次重选着色器）。 */
function SkinnedMaterialFor(material) {
  if (Array.isArray(material)) return material.map(SkinnedMaterialFor);
  if (!skinnedMaterials.has(material)) {
    const copy = CloneShadedMaterial(material);
    copy.name = `${material.name || "Sling"}_Skinned`;
    skinnedMaterials.set(material, copy);
  }
  return skinnedMaterials.get(material);
}

/** 截面 = 宽 × 厚的扁方条，每个环 8 个点（上下两面、左右两侧各自的法线），环 i 全绑骨头 i。 */
export function BuildStrapGeometry(count, width, thickness) {
  const hw = width / 2, ht = thickness / 2;
  // [x, y, nx, ny]：上面 L R、下面 L R、+x 侧 下 上、-x 侧 下 上
  const ring = [[-hw, ht, 0, 1], [hw, ht, 0, 1], [-hw, -ht, 0, -1], [hw, -ht, 0, -1], [hw, -ht, 1, 0], [hw, ht, 1, 0], [-hw, -ht, -1, 0], [-hw, ht, -1, 0]];
  const V = count * 8, position = new Float32Array(V * 3), normal = new Float32Array(V * 3);
  const skinIndex = new Uint16Array(V * 4), skinWeight = new Float32Array(V * 4);
  for (let i = 0; i < count; i += 1) {
    for (let k = 0; k < 8; k += 1) {
      const v = i * 8 + k, [x, y, nx, ny] = ring[k];
      position.set([x, y, 0], v * 3); normal.set([nx, ny, 0], v * 3);
      skinIndex[v * 4] = i; skinWeight[v * 4] = 1;
    }
  }
  const index = [];
  for (let i = 0; i < count - 1; i += 1) {
    const a = i * 8, b = a + 8;
    // 上（+y）、下（-y）、+x 侧、-x 侧；绕向让面法线与顶点法线同向
    index.push(a, b, b + 1, a, b + 1, a + 1);
    index.push(a + 2, b + 3, b + 2, a + 2, a + 3, b + 3);
    index.push(a + 4, a + 5, b + 5, a + 4, b + 5, b + 4);
    index.push(a + 6, b + 7, a + 7, a + 6, b + 6, b + 7);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(position, 3));
  geometry.setAttribute("normal", new THREE.BufferAttribute(normal, 3));
  geometry.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(skinIndex, 4));
  geometry.setAttribute("skinWeight", new THREE.BufferAttribute(skinWeight, 4));
  geometry.setIndex(index);
  return geometry;
}

// ---------------------------------------------------------------- 一根带子（原带子 ↔ 模拟 ↔ 网格）

const restCache = new WeakMap();   // 原带子几何 → ExtractSlingRest 的结果
const _F = new THREE.Matrix4(), _Fi = new THREE.Matrix4(), _R = new THREE.Matrix4(), _T = new THREE.Matrix4();
const _pos = new THREE.Vector3(), _quat = new THREE.Quaternion(), _scale = new THREE.Vector3(), _one = new THREE.Vector3(1, 1, 1);
const _t = new THREE.Vector3(), _n = new THREE.Vector3(), _w = new THREE.Vector3(), _m = new THREE.Matrix4(), _a = new THREE.Vector3(), _b = new THREE.Vector3();

function SceneOf(object) {
  let o = object;
  while (o.parent) o = o.parent;
  return o.isScene ? o : null;
}

function EffectivelyVisible(object) {
  for (let o = object; o; o = o.parent) if (!o.visible) return false;
  return true;
}

/** 身体：人物根底下此刻看得见的蒙皮网格（白盒里是 X Bot / 日兵甲那层，原身体藏着）。都看不见就用全部。 */
function BodyMeshes(root) {
  const all = [], shown = [];
  root?.traverse((o) => {
    if (!o.isSkinnedMesh || !o.skeleton || !o.geometry?.attributes?.skinIndex) return;
    all.push(o);
    if (EffectivelyVisible(o)) shown.push(o);
  });
  return shown.length ? shown : all;
}

export class RifleSlingCloth {
  constructor(sling, body, cfg = RIFLE_SLING_CLOTH) {
    this.sling = sling;
    this.body = body;
    this.cfg = cfg;
    this.mesh = null;
    this.failed = false;
    this.ready = false;            // 挎上了（Fit 过）
    this.hidden = 0;               // 连续看不见了多久（秒）
    this.gone = 0;                 // 原带子离开场景多久
    this.frame = 0;
    this.bodyKey = "";
    this.samples = new BodySurfaceSamples();
    this.triangleSamples = new BodyTrianglePatches();
    this.prevFrame = new THREE.Matrix4();
    this.pendingDt = 0;
    this.phase = 0;                // 远处隔帧算的相位（RegisterRifleSling 按注册顺序错开）
    this.originalLayerMask = sling.layers.mask;
    this.originalLocal = sling.matrix.clone();
    this.anchorRoot = null;
    this.anchorLocal = null;
    this.wasFar = false;
    this.restLocal = null;         // 资产形状（这一帧，挂点坐标系）
    this.normalsLocal = null;
    this.widthLocal = null;
  }

  _Build(scene) {
    const source = this.sling.geometry;
    let rest = restCache.get(source);
    if (rest === undefined) { rest = ExtractSlingRest(source, this.cfg.count); restCache.set(source, rest); }
    if (!rest) { this.failed = true; return false; }
    this.rest = rest;
    const n = rest.count, width = this.cfg.widthM || rest.width;
    this.rope = new SlingRope(n, this.cfg);
    this.restLocal = new Float64Array(n * 3);
    this.normalsLocal = new Float64Array(n * 3);
    this.widthLocal = new Float64Array(n * 3);
    const bones = [], inverses = [];
    for (let i = 0; i < n; i += 1) {
      const b = new THREE.Bone();
      b.name = `SlingClothBone${i}`;
      b.matrixAutoUpdate = false;   // _Write 直接写 matrix / matrixWorld（父节点是单位阵），不拆成位置、朝向
      bones.push(b); inverses.push(new THREE.Matrix4());
    }
    const mesh = new THREE.SkinnedMesh(BuildStrapGeometry(n, width, this.cfg.thicknessM), SkinnedMaterialFor(this.sling.material));
    mesh.name = "RifleSlingClothStrap";
    mesh.layers.mask = this.originalLayerMask;
    mesh.add(...bones);
    mesh.bind(new THREE.Skeleton(bones, inverses), new THREE.Matrix4());
    mesh.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1);
    mesh.userData.rifleSlingCloth = this;
    mesh.raycast = () => {};   // 不给拾取 / 射线打中（原带子 layers 全关，本来也打不中）
    this.mesh = mesh;
    this.bones = bones;
    this.normalSign = 1;
    this._Reparent(scene);
    // 原带子不画（显隐、位置照旧由原来的代码管）
    this.sling.layers.disableAll();
    return true;
  }

  /** 挂点坐标系（刚体、米制）：原带子的世界矩阵去掉缩放（_F / _Fi）。顺便把资产形状换进这个坐标系。 */
  _Frame() {
    this.sling.matrixWorld.decompose(_pos, _quat, _scale);
    _F.compose(_pos, _quat, _one);
    _Fi.copy(_F).invert();
    _R.multiplyMatrices(_Fi, this.sling.matrixWorld);
    // 原带子相对挂点不动（游戏里一直如此；白盒 X Bot 的 _KeepSling 只在换人物 / 推挂件时改）就不用重算
    const e = _R.elements, last = this.lastR || (this.lastR = new Float64Array(16).fill(NaN));
    let same = true;
    for (let k = 0; k < 16 && same; k += 1) same = Math.abs(e[k] - last[k]) < 1e-7;
    const r = this.rest, n = r.count;
    if (!same) {
      last.set(e);
      for (let i = 0; i < n; i += 1) {
        _a.fromArray(r.points, i * 3).applyMatrix4(_R).toArray(this.restLocal, i * 3);
        _a.fromArray(r.normals, i * 3).transformDirection(_R).toArray(this.normalsLocal, i * 3);
        _a.fromArray(r.widthDirs, i * 3).transformDirection(_R).toArray(this.widthLocal, i * 3);
      }
    }
    if (this.anchorRoot && this.anchorLocal) {
      _T.multiplyMatrices(_Fi, this.anchorRoot.matrixWorld).multiply(this.anchorLocal);
      for (const i of [0, n - 1]) {
        _a.fromArray(r.points, i * 3).applyMatrix4(_T).toArray(this.restLocal, i * 3);
        _a.fromArray(r.normals, i * 3).transformDirection(_T).toArray(this.normalsLocal, i * 3);
        _a.fromArray(r.widthDirs, i * 3).transformDirection(_T).toArray(this.widthLocal, i * 3);
      }
    }
    this.rope.SetRest(this.restLocal);
  }

  _RefreshBody(force) {
    const meshes = BodyMeshes(this.body);
    const key = meshes.map(m => m.id).join(",");
    if (!force && key === this.bodyKey) return false;
    this.bodyKey = key;
    // 选点用世界坐标：资产形状这一刻在哪
    const near = new Float32Array(this.rest.count * 3);
    for (let i = 0; i < this.rest.count; i += 1) _a.fromArray(this.restLocal, i * 3).applyMatrix4(_F).toArray(near, i * 3);
    this.samples.Build(meshes, near, this.cfg);
    this.triangleSamples.Build(meshes, near.subarray(Math.floor(this.rest.count * this.cfg.triangleFromFraction) * 3), this.cfg);
    this.rope.SetSamples(this.samples);
    this.rope.patches = this.triangleSamples;
    return true;
  }

  /** 一帧。budget = { fits }：这一帧还能装几根。返回这一帧做了什么（"skip" / "wait" / "rigid" / "sim"）。 */
  Frame(dt, camera, budget = { fits: Infinity }) {
    const cfg = this.cfg, sling = this.sling;
    if (this.failed) return "skip";
    const own = SceneOf(sling);
    if (!own) {
      this.gone += dt;
      if (this.mesh) this.mesh.visible = false;
      return "skip";
    }
    this.gone = 0;
    if (!EffectivelyVisible(sling)) {
      this.hidden += Math.max(dt, 1 / 60);
      if (this.mesh) this.mesh.visible = false;
      if (this.hidden > cfg.hiddenResetS) this.ready = false;
      return "skip";
    }
    this.hidden = 0;
    if (!this.mesh && !this._Build(own)) return "skip";
    if (this.mesh.parent?.parent !== own) this._Reparent(own);   // 人被挪到别的场景
    this.mesh.visible = true;
    this.mesh.castShadow = sling.castShadow;
    this.mesh.receiveShadow = sling.receiveShadow;
    this._Frame();
    const rope = this.rope;
    this.frame += 1;
    const dist = camera ? _a.setFromMatrixPosition(_F).distanceTo(camera.getWorldPosition(_b)) : 0;
    // A far-away actor may have finished retargeting or changed pose while its cloth was frozen.
    // Re-enter simulation on the current visible pose, instead of pulling a stale fit through it.
    if (this.wasFar && dist <= cfg.simRangeM) this.ready = false;
    this.wasFar = dist > cfg.simRangeM;
    // The editor replaces the original skin asynchronously. A new body needs a new fitted
    // length as well as new collision samples; keeping the first body's fit leaves it floating.
    if (this.ready && this.frame % cfg.candidateRefreshFrames === 0 && this._RefreshBody(false)) this.ready = false;
    if (!this.ready) {
      if (budget.fits <= 0) {
        // 没轮到装：这一帧照旧画原带子
        this.mesh.visible = false;
        this.sling.layers.mask = this.originalLayerMask;
        return "wait";
      }
      budget.fits -= 1;
      this.sling.layers.disableAll();
      this._RefreshBody(true);
      rope.SetSamples(this.samples);
      this.samples.Update(_Fi);
      this.triangleSamples.Update(_Fi);
      _a.set(0, -1, 0).transformDirection(_Fi).multiplyScalar(cfg.gravity);
      rope.Fit([_a.x, _a.y, _a.z]);
      this._OrientNormals();
      this.prevFrame.copy(_F);
      this.pendingDt = 0;
      this.lastMove = null;
      this.ready = true;
      this._Write();
      return "sim";
    }
    rope._Pin();   // 两头先跟上挂点（轮空 / 刚性的帧也要：原带子相对挂点可能刚被改过）
    this.pendingDt += Math.max(0, dt || 0);
    // 远处隔帧算：轮空的这一帧带子跟着挂点走，时长攒到下一帧一起推
    if (dist > cfg.halfRateM && dist <= cfg.simRangeM && dt > 0 && ((this.frame + this.phase) & 1)) { this._Write(); return "rigid"; }
    // 挂点从上次推到现在动了多少（上次坐标 → 这一帧坐标）：跳了就清速度；否则比上次变了的那部分传成惯性（Carry）
    _T.multiplyMatrices(_Fi, this.prevFrame);
    _T.decompose(_pos, _quat, _scale);
    const jumped = _pos.length() > cfg.teleportM || 2 * Math.acos(Math.min(1, Math.abs(_quat.w))) > THREE.MathUtils.degToRad(cfg.teleportDeg);
    this.prevFrame.copy(_F);
    const step = this.pendingDt;
    this.pendingDt = 0;
    if (jumped || dist > cfg.simRangeM || !(step > 0)) {
      if (jumped) rope.Still();
      this.lastMove = null;
      this._Write();
      return "rigid";
    }
    if (this.lastMove) rope.Carry(_T.elements, this.lastMove.elements, step / this.lastDt, cfg.inertia, cfg.inertiaMaxM);
    (this.lastMove ||= new THREE.Matrix4()).copy(_T);
    this.lastDt = step;
    // 采样点：每 candidateRefreshFrames 帧全算一遍、重挑候选；其余帧只算候选用得着的
    if (++rope.candidateAge >= cfg.candidateRefreshFrames) { this.samples.Update(_Fi); this.triangleSamples.Update(_Fi); rope.RefreshCandidates(); }
    else { this.samples.Update(_Fi, rope.active); this.triangleSamples.Update(_Fi, this.triangleSamples.active); }
    _a.set(0, -1, 0).transformDirection(_Fi).multiplyScalar(cfg.gravity);
    const g = [_a.x, _a.y, _a.z];
    const steps = Math.min(cfg.maxSubsteps, Math.max(1, Math.round(step / cfg.substepS)));
    const h = Math.min(step, cfg.maxSubsteps * cfg.substepS) / steps;
    for (let s = 0; s < steps; s += 1) rope.Substep(h, g);
    this._Write();
    return "sim";
  }

  _Reparent(scene) {
    let group = scene.userData.rifleSlingClothGroup;
    if (!group || group.parent !== scene) {
      group = new THREE.Group();
      group.name = "RifleSlingCloth";
      scene.add(group);
      scene.userData.rifleSlingClothGroup = group;
    }
    group.add(this.mesh);
  }

  /** 资产法线朝向统一成「离开身体」：挎上之后贴身那些点的表面法线投票。 */
  _OrientNormals() {
    const rope = this.rope, N = rope.planeN;
    let vote = 0;
    for (let i = 0; i < rope.count; i += 1) {
      if (rope.plane[i] < 0 || rope.distance[i] > this.cfg.contactM) continue;
      vote += N[i * 3] * this.normalsLocal[i * 3] + N[i * 3 + 1] * this.normalsLocal[i * 3 + 1] + N[i * 3 + 2] * this.normalsLocal[i * 3 + 2];
    }
    this.normalSign = vote < 0 ? -1 : 1;
  }

  /** 质点 → 骨头（世界矩阵直接写：这一帧的 updateMatrixWorld 已经过了）。 */
  _Write() {
    const rope = this.rope, n = rope.count, p = rope.p, S = this.samples, cfg = this.cfg;
    const normals = this._normals || (this._normals = new Float64Array(n * 3));
    for (let i = 0; i < n; i += 1) {
      // 资产法线 → 贴身处换成身体表面法线（按离表面远近渐变）；两头照资产
      _n.fromArray(this.normalsLocal, i * 3).multiplyScalar(this.normalSign);
      const end = Math.max(0, 1 - Math.min(i, n - 1 - i) / cfg.endBlend);
      if (rope.plane[i] >= 0 && S.count) {
        const c = (1 - THREE.MathUtils.smoothstep(rope.distance[i], cfg.contactM, cfg.contactM + 0.03)) * (1 - end);
        if (c > 0) _n.lerp(_a.fromArray(rope.planeN, i * 3), c).normalize();
      }
      _n.toArray(normals, i * 3);
    }
    // 沿带子平滑两遍（相邻采样点法线跳一下，带面不跟着拧）
    for (let pass = 0; pass < 2; pass += 1) {
      for (let i = 1; i < n - 1; i += 1) {
        for (let j = 0; j < 3; j += 1) normals[i * 3 + j] = (normals[(i - 1) * 3 + j] + 2 * normals[i * 3 + j] + normals[(i + 1) * 3 + j]) / 4;
      }
    }
    let minX = Infinity, minY = Infinity, minZ = Infinity, maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    for (let i = 0; i < n; i += 1) {
      const a = Math.max(0, i - 1), b = Math.min(n - 1, i + 1);
      _t.set(p[b * 3] - p[a * 3], p[b * 3 + 1] - p[a * 3 + 1], p[b * 3 + 2] - p[a * 3 + 2]).normalize();
      _n.fromArray(normals, i * 3);
      _w.crossVectors(_n, _t);
      if (_w.lengthSq() < 1e-8) _w.fromArray(this.widthLocal, i * 3);
      _w.normalize();
      _n.crossVectors(_t, _w).normalize();
      _m.makeBasis(_w, _n, _t).setPosition(p[i * 3], p[i * 3 + 1], p[i * 3 + 2]).premultiply(_F);
      const bone = this.bones[i];
      bone.matrix.copy(_m);
      bone.matrixWorld.copy(_m);
      const e = _m.elements;
      minX = Math.min(minX, e[12]); minY = Math.min(minY, e[13]); minZ = Math.min(minZ, e[14]);
      maxX = Math.max(maxX, e[12]); maxY = Math.max(maxY, e[13]); maxZ = Math.max(maxZ, e[14]);
    }
    const sphere = this.mesh.boundingSphere;
    sphere.center.set((minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2);
    sphere.radius = Math.hypot(maxX - minX, maxY - minY, maxZ - minZ) / 2 + 0.05;
  }

  Dispose() {
    if (this.mesh) { this.mesh.removeFromParent(); this.mesh.geometry.dispose(); this.mesh.skeleton?.dispose?.(); }
    this.sling.layers.mask = this.originalLayerMask;
    this.mesh = null;
  }
}

// ---------------------------------------------------------------- 注册表 + 每帧入口

const registry = new Map();   // 原带子 → RifleSlingCloth
let registered = 0;
let enabled = true;
const stats = { count: 0, simulated: 0, ms: 0 };

/** 原带子造出来时调一次：sling = 挂在枪挂点下的原带子网格，body = 这个人的根（找身体网格用）。重复注册无害。 */
export function RegisterRifleSling(sling, body) {
  if (!sling?.isMesh || registry.has(sling)) return registry.get(sling) || null;
  const cloth = new RifleSlingCloth(sling, body);
  cloth.phase = registered++ & 1;
  registry.set(sling, cloth);
  return cloth;
}

/** The editor counter-fits the old rigid sling for body shape. Keep that path as a guide,
 * but pin simulated ends to the actual rifle mount, before the old counter-fit was applied. */
export function SetRifleSlingAnchors(sling, root, localMatrix = null) {
  const cloth = registry.get(sling);
  if (!cloth || !root) return false;
  const local = localMatrix || cloth.originalLocal;
  if (cloth.anchorRoot !== root || !cloth.anchorLocal?.equals(local)) cloth.ready = false;
  cloth.anchorRoot = root;
  (cloth.anchorLocal ||= new THREE.Matrix4()).copy(local);
  return true;
}

/**
 * 整帧一次，排在 scene.updateMatrixWorld() 之后、第一次出画之前（Script_Main.RenderScene）。模拟出来的带子挂在
 * 原带子所在场景的 RifleSlingCloth 组下。dt = 玩法时间（暂停 = 0：带子跟着挂点走、不推模拟）。
 */
export function StepRifleSlings(dt, camera) {
  const t0 = performance.now();
  let simulated = 0;
  const budget = { fits: RIFLE_SLING_CLOTH.fitsPerFrame };
  for (const [sling, cloth] of registry) {
    const clothStart = performance.now();
    if (!enabled) {
      if (cloth.mesh) cloth.mesh.visible = false;
      cloth.gone = SceneOf(sling) ? 0 : cloth.gone + Math.max(0, dt || 0);
    } else if (cloth.Frame(dt, camera, budget) === "sim") simulated += 1;
    cloth.ms = performance.now() - clothStart;
    // Removing the actor or its mount leaves sling.parent intact. Those detached subtrees
    // still need to release the simulated mesh and skeleton, including while disabled.
    if (cloth.failed || cloth.gone > cloth.cfg.disposeAfterS) { cloth.Dispose(); registry.delete(sling); }
  }
  stats.count = registry.size;
  stats.simulated = simulated;
  stats.ms = performance.now() - t0;
}

/** 关掉 = 全部退回原带子（调试 / A/B 对比用）。 */
export function SetRifleSlingClothEnabled(on) {
  enabled = !!on;
  for (const cloth of registry.values()) {
    if (enabled) { if (cloth.mesh) cloth.sling.layers.disableAll(); cloth.ready = false; }
    else { cloth.sling.layers.mask = cloth.originalLayerMask; if (cloth.mesh) cloth.mesh.visible = false; }
  }
}

/** 全部丢掉、原带子还原（门禁换场景用）。 */
export function ClearRifleSlings() {
  for (const cloth of registry.values()) cloth.Dispose();
  registry.clear();
  enabled = true;
  stats.count = 0; stats.simulated = 0; stats.ms = 0;
}

/** 取证口：{ count, simulated, ms, enabled, cloths }。 */
export function RifleSlingClothStats() {
  return { ...stats, enabled, cloths: [...registry.values()] };
}
