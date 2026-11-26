// 通用车辆车辙真几何稀疏高密网格视图（Three.js 适配层）。
//
// 工作流：
//   1. 当 VehicleTrackField 压出新瓦片（3 m × 3 m）时，用 CutTerrainRectangles 从粗底地形网格裁出对应矩形孔，
//      再在同位置插入一张世界锁定的高密网格（high 档 48×48 = 6.25 cm 格距）；
//   2. 新建瓦片直接共用原地形材质与顶点属性（color / terrainLayers / uv），自动继承：
//      · Prepass（真实下陷深度与陡峭槽壁法线 → GTAO & 接触阴影自然压暗槽底）；
//      · CSM 太阳阴影（两侧隆起泥棱真实往车辙槽底投下阴影）；
//      · 分层地表着色、TerrainBlend 石土融合与 GPU 2 cm/纹素微观履齿/积水（零额外片元采样器）；
//   3. 车辆持续行驶在同一瓦片内时，只按 DirtyBox 子矩形重算受影响的几十个顶点与法线，亚毫秒局部上传。
//   4. 支持实时开关 SetEnabled(on)（A/B 零开销切回平地面 vs 真 3D 凹陷，供调试与 GPU 门禁验证）。

import * as THREE from "three";
import { CutTerrainRectangles } from "./Script_TerrainDeformationView.mjs";
import { VEHICLE_TRACK_GEOMETRY as GEO } from "./Data_VehicleTracks.mjs";

const sharedIndexCache = new Map();
function TileIndices(cells) {
  let cached = sharedIndexCache.get(cells);
  if (cached) return cached;
  const width = cells + 1;
  const indices = new Uint16Array(cells * cells * 6);
  let at = 0;
  for (let z = 0; z < cells; z++) {
    for (let x = 0; x < cells; x++) {
      const v = z * width + x;
      indices[at++] = v; indices[at++] = v + width; indices[at++] = v + 1;
      indices[at++] = v + 1; indices[at++] = v + width; indices[at++] = v + width + 1;
    }
  }
  sharedIndexCache.set(cells, indices);
  return indices;
}

export class VehicleTrackView {
  /**
   * @param {object} options
   * @param {THREE.Scene} options.scene
   * @param {import("./Script_VehicleTrackField.mjs").VehicleTrackField} options.field
   * @param {THREE.Mesh[]} options.groundMeshes  会被裁孔的原始地形网格列表
   * @param {THREE.Material} options.groundMaterial  共用的地形材质（不由此类 dispose）
   * @param {((x:number,z:number,rgb:number[],weights:number[])=>void)|null} [options.sampleGroundSurface]
   * @param {((x:number,z:number)=>number[])|null} [options.sampleGroundColor]
   * @param {((x:number,z:number,out:number[])=>void)|null} [options.sampleCraterSurface]
   */
  constructor({
    scene,
    field,
    groundMeshes = [],
    groundMaterial = null,
    sampleGroundSurface = null,
    sampleGroundColor = null,
    sampleCraterSurface = null,
  }) {
    this.scene = scene;
    this.field = field;
    this.groundMeshes = groundMeshes;
    this.groundMaterial = groundMaterial || groundMeshes[0]?.material || null;
    this.sampleGroundSurface = sampleGroundSurface;
    this.sampleGroundColor = sampleGroundColor;
    this.sampleCraterSurface = sampleCraterSurface;
    this.root = new THREE.Group();
    this.root.name = "VehicleTrackDisplacementTiles";
    this.root.matrixAutoUpdate = false;
    this.scene?.add(this.root);

    this.tileMeshes = new Map(); // tileKey -> { tile, mesh, geometry, pos, norm, baseY }
    this.cutKeys = new Set();    // 已从原地形裁掉过孔的 tileKey（Clear 后复用或新裁）
    this.enabled = true;
    this.disposed = false;
    this.stats = { tiles: 0, cuts: 0, fullRebuilds: 0, subUpdates: 0, triangles: 0 };

    const haloWidth = this.field.cells + 3;
    this._scratchHeights = new Float32Array(haloWidth * haloWidth);
    this._scratchColor = new THREE.Color();
    this._scratchRgb = [1, 1, 1];
    this._scratchWeights = [0, 0, 0, 1];
    this._scratchCrater = [0, 0, 0, 0];
  }

  /** 是否同步写入顶点色与分层权重（视原始地形网格属性而定）。 */
  _HasLayersAttr() {
    return !!this.sampleGroundSurface || !!this.groundMeshes[0]?.geometry?.attributes?.terrainLayers;
  }

  /** 是否同步写入静态弹坑焦土属性（与 Script_TerrainMaterial staticCraters 对齐）。 */
  _HasCraterAttr() {
    return !!this.sampleCraterSurface || !!this.groundMeshes[0]?.geometry?.attributes?.terrainCrater
      || !!this.groundMaterial?.userData?.staticCraters;
  }

  /** 创建一张新的世界锁定高密瓦片网格。 */
  _CreateTileMesh(tile) {
    const n = this.field.cells;
    const s = this.field.cellM;
    const w = n + 1;
    const vertCount = w * w;
    const positions = new Float32Array(vertCount * 3);
    const normals = new Float32Array(vertCount * 3);
    const uvs = new Float32Array(vertCount * 2);
    const baseY = new Float32Array(vertCount);
    const hasLayers = this._HasLayersAttr();
    const hasCrater = this._HasCraterAttr();
    const hasColor = hasLayers || !!this.sampleGroundColor || !!this.groundMeshes[0]?.geometry?.attributes?.color;
    const colors = hasColor ? new Float32Array(vertCount * 3) : null;
    const layers = hasLayers ? new Float32Array(vertCount * 4) : null;
    const craters = hasCrater ? new Float32Array(vertCount * 4) : null;

    const x0 = tile.tx * this.field.tileSizeM;
    const z0 = tile.tz * this.field.tileSizeM;
    const col = this._scratchColor, rgb = this._scratchRgb, weights = this._scratchWeights, craterOut = this._scratchCrater;
    const baseHeight = this.field.base;

    for (let vz = 0; vz <= n; vz++) {
      const wz = z0 + vz * s;
      for (let vx = 0; vx <= n; vx++) {
        const wx = x0 + vx * s;
        const i = vz * w + vx;
        const by = baseHeight(wx, wz);
        baseY[i] = by;
        positions[i * 3] = wx;
        positions[i * 3 + 1] = by;
        positions[i * 3 + 2] = wz;
        normals[i * 3 + 1] = 1;
        uvs[i * 2] = wx * 0.25;
        uvs[i * 2 + 1] = wz * 0.25;
        if (hasLayers && this.sampleGroundSurface) {
          weights[0] = 0; weights[1] = 0; weights[2] = 0; weights[3] = 1;
          this.sampleGroundSurface(wx, wz, rgb, weights);
          col.setRGB(rgb[0], rgb[1], rgb[2], THREE.SRGBColorSpace).toArray(colors, i * 3);
          layers[i * 4] = weights[0]; layers[i * 4 + 1] = weights[1];
          layers[i * 4 + 2] = weights[2]; layers[i * 4 + 3] = weights[3];
        } else if (colors) {
          if (this.sampleGroundColor) {
            const sample = this.sampleGroundColor(wx, wz);
            col.setRGB(sample[0], sample[1], sample[2], THREE.SRGBColorSpace).toArray(colors, i * 3);
          } else {
            colors[i * 3] = 1; colors[i * 3 + 1] = 1; colors[i * 3 + 2] = 1;
          }
          if (layers) { layers[i * 4] = 0; layers[i * 4 + 1] = 0; layers[i * 4 + 2] = 0; layers[i * 4 + 3] = 1; }
        }
        if (craters && this.sampleCraterSurface) {
          craterOut[0] = 0; craterOut[1] = 0; craterOut[2] = 0; craterOut[3] = 0;
          this.sampleCraterSurface(wx, wz, craterOut);
          craters[i * 4] = craterOut[0]; craters[i * 4 + 1] = craterOut[1];
          craters[i * 4 + 2] = craterOut[2]; craters[i * 4 + 3] = craterOut[3];
        }
      }
    }

    const geometry = new THREE.BufferGeometry();
    const posAttr = new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage);
    const normAttr = new THREE.BufferAttribute(normals, 3).setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute("position", posAttr);
    geometry.setAttribute("normal", normAttr);
    geometry.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
    if (colors) geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    if (layers) geometry.setAttribute("terrainLayers", new THREE.BufferAttribute(layers, 4));
    if (craters) geometry.setAttribute("terrainCrater", new THREE.BufferAttribute(craters, 4));
    geometry.setIndex(new THREE.BufferAttribute(new Uint16Array(TileIndices(n)), 1));

    const mesh = new THREE.Mesh(geometry, this.groundMaterial);
    mesh.name = `VehicleTrackTile_${tile.key}`;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.matrixAutoUpdate = false;
    mesh.userData.vehicleTrackTile = true;
    mesh.userData.deformableTerrain = true;
    mesh.userData.groundSurface = true;
    // 活跃动态形变瓦片不并入静态合批，确保 Prepass 与 CSM 阴影当帧立即生效
    mesh.userData.noPrepassBatch = true;
    mesh.userData.noShadowBatch = true;
    this.root.add(mesh);

    const record = { tile, mesh, geometry, pos: posAttr, norm: normAttr, baseY };
    this.tileMeshes.set(tile.key, record);
    this.stats.tiles = this.tileMeshes.size;
    this.stats.triangles = this.tileMeshes.size * n * n * 2;
    return record;
  }

  /** 将高度场的最新下陷与泥棱写入该瓦片几何体（仅更新 box 脏子矩形，并重算平滑法线）。 */
  _UpdateTileGeometry(record, box = null) {
    const n = this.field.cells, s = this.field.cellM, w = n + 1;
    const { tx, tz } = record.tile;
    const heights = this._scratchHeights;
    const hw = this.field.FillTile(tx, tz, 1, heights, null, box);

    const x0 = box ? box.x0 : 0, x1 = box ? box.x1 : n;
    const z0 = box ? box.z0 : 0, z1 = box ? box.z1 : n;
    const pos = record.pos.array;
    const norm = record.norm.array;
    const baseY = record.baseY;
    const twoS = 2 * s;
    const useDisp = this.enabled;

    for (let vz = z0; vz <= z1; vz++) {
      const hz = vz + 1;
      for (let vx = x0; vx <= x1; vx++) {
        const hx = vx + 1;
        const vi = vz * w + vx;
        const hi = hz * hw + hx;
        const y = useDisp ? heights[hi] : baseY[vi];
        pos[vi * 3 + 1] = y;
        let nx, ny, nz;
        if (useDisp) {
          nx = heights[hi - 1] - heights[hi + 1];
          nz = heights[hi - hw] - heights[hi + hw];
          ny = twoS;
        } else {
          // 禁用态（A/B 对照）恢复未下陷地形的精确平滑法线
          const wx = tx * this.field.tileSizeM + vx * s;
          const wz = tz * this.field.tileSizeM + vz * s;
          nx = this.field.base(wx - s, wz) - this.field.base(wx + s, wz);
          nz = this.field.base(wx, wz - s) - this.field.base(wx, wz + s);
          ny = twoS;
        }
        const inv = 1 / Math.hypot(nx, ny, nz);
        norm[vi * 3] = nx * inv;
        norm[vi * 3 + 1] = ny * inv;
        norm[vi * 3 + 2] = nz * inv;
      }
    }

    const startVert = z0 * w + x0;
    const endVert = z1 * w + x1 + 1;
    const countVerts = Math.max(0, endVert - startVert);
    record.pos.clearUpdateRanges?.();
    record.pos.addUpdateRange?.(startVert * 3, countVerts * 3);
    record.pos.needsUpdate = true;
    record.norm.clearUpdateRanges?.();
    record.norm.addUpdateRange?.(startVert * 3, countVerts * 3);
    record.norm.needsUpdate = true;

    if (!box || !record.geometry.boundingBox) {
      record.geometry.computeBoundingBox();
      record.geometry.computeBoundingSphere();
      // 给 Y 方向留足最大凹陷与泥棱余量，后续局部子矩形更新不致被视锥误剔
      record.geometry.boundingBox.min.y -= GEO.maxDepthM + 0.05;
      record.geometry.boundingBox.max.y += GEO.maxRimM + 0.05;
      if (record.geometry.boundingSphere) record.geometry.boundingSphere.radius += GEO.maxDepthM + GEO.maxRimM + 0.1;
      this.stats.fullRebuilds++;
    } else {
      this.stats.subUpdates++;
    }
  }

  /** 每帧或静态烘完后调一次：把新增/脏瓦片同步到 GPU。返回更新的瓦片数。 */
  Sync() {
    if (this.disposed || !this.groundMaterial) return 0;
    const dirty = this.field.TakeDirty();
    if (!dirty.length) return 0;

    // 批量裁孔：同一帧所有新出现的瓦片只扫一次原地形三角形
    const newRects = [];
    for (const tile of dirty) {
      if (!this.cutKeys.has(tile.key)) {
        this.cutKeys.add(tile.key);
        newRects.push(this.field.TileRect(tile.tx, tile.tz));
      }
    }
    if (newRects.length) {
      for (const mesh of this.groundMeshes) {
        if (!mesh || !mesh.geometry || mesh.userData.vehicleTrackTile) continue;
        if (CutTerrainRectangles(mesh, newRects)) this.stats.cuts++;
      }
    }

    for (const tile of dirty) {
      let record = this.tileMeshes.get(tile.key);
      const isNew = !record;
      if (!record) record = this._CreateTileMesh(tile);
      const box = isNew ? null : this.field.DirtyBox(tile.tx, tile.tz);
      this._UpdateTileGeometry(record, box);
    }
    return dirty.length;
  }

  /** A/B 开关：开启真 3D 几何下陷或瞬间恢复未下陷平地（便于目视对比与 GPU 验收）。 */
  SetEnabled(on) {
    const next = !!on;
    if (next === this.enabled) return;
    this.enabled = next;
    for (const record of this.tileMeshes.values()) {
      this._UpdateTileGeometry(record, null);
    }
  }

  /** 清空所有凹陷（恢复已裁孔瓦片到未下陷原高度，不重新缝合原地形，零卡顿）。 */
  ResetVisuals() {
    for (const record of this.tileMeshes.values()) {
      this._UpdateTileGeometry(record, null);
    }
  }

  Describe() {
    return {
      enabled: this.enabled,
      ...this.stats,
      field: this.field.State(),
    };
  }

  Dispose() {
    if (this.disposed) return;
    this.disposed = true;
    for (const record of this.tileMeshes.values()) {
      this.root.remove(record.mesh);
      record.geometry.dispose();
    }
    this.tileMeshes.clear();
    this.cutKeys.clear();
    this.root.removeFromParent();
  }
}
