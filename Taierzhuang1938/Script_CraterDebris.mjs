// Permanent, shallow surface dressing. Terrain remains the collision authority;
// these half-buried fragments are smaller than a boot, never gameplay cover.
// Upgraded to shared-template InstancedMesh pools (max ~14 draw calls regardless
// of crater count) plus static scene doc.craters rim/wall scatter.
import * as THREE from "three";
import { InstantiateExternalProp } from "./Script_ExternalProps.mjs";
import { CloneMaterialBase } from "./Script_MaterialPatches.mjs";
import { AttachShadowDepth } from "./Script_ShadowDepth.mjs";
import { ValueNoise2, Mulberry32 } from "./Script_Noise.mjs";
import { CraterContourFactor, NormalizeSceneCraters } from "./Script_SceneCraters.mjs";

const templates = new WeakMap();
const MAX_TILES = 256, MAX_FRAGMENTS = 170, SPACING = 0.35;

export async function PrepareCraterDebris(library) {
  if (templates.has(library)) return;
  let timer;
  const stones = await Promise.race([
    Promise.all(Array.from({ length: 7 }, (_, i) => InstantiateExternalProp(`stackableStone0${i + 1}`, library))),
    new Promise((resolve) => { timer = setTimeout(() => {
      console.warn("[CraterDebris] stone load timed out; using generated clods"); resolve([]);
    }, 30000); }),
  ]).finally(() => clearTimeout(timer));
  const shapes = [];
  for (const stone of stones) stone?.traverse((mesh) => {
    if (!mesh.isMesh) return;
    const geometry = mesh.geometry.clone();
    geometry.computeBoundingBox();
    const box = geometry.boundingBox, size = new THREE.Vector3(); box.getSize(size);
    geometry.translate(-(box.min.x + box.max.x) / 2, -box.min.y, -(box.min.z + box.max.z) / 2);
    geometry.scale(1 / Math.max(1e-4, size.x), 1 / Math.max(1e-4, size.y), 1 / Math.max(1e-4, size.z));
    shapes.push(geometry);
  });
  templates.set(library, shapes);
}

function MakeClod(seed) {
  const geometry = new THREE.IcosahedronGeometry(0.5, 1);
  const positions = geometry.attributes.position;
  const uvs = new Float32Array(positions.count * 2);
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i), y = positions.getY(i), z = positions.getZ(i);
    const wobble = 0.76 + ValueNoise2(x * 6 + y * 3, z * 6 - y * 2, seed) * 0.46;
    const px = x * wobble, py = (y + 0.5) * wobble, pz = z * wobble;
    positions.setXYZ(i, px, py, pz);
    // Clean planar-projected UVs prevent polar pinching on scorched earth texture.
    uvs[i * 2] = px * 0.85 + py * 0.25 + 0.5;
    uvs[i * 2 + 1] = pz * 0.85 + py * 0.35 + 0.5;
  }
  geometry.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
  geometry.computeVertexNormals();
  return geometry;
}

function CreateDebrisMaterials(library) {
  const rawBase = library.Get(library.baked?.has("CraterScorched") ? "CraterScorched" : "Ground",
    { normalScale: 0.65, roughness: 1, metalness: 0, aoIntensity: 0.65 });
  const baseMaterial = CloneMaterialBase(rawBase);
  baseMaterial.name = "CraterDebrisClodInstanced";
  baseMaterial.vertexColors = false;
  const rawStone = library.Get("Stone", { color: 0x80776a, normalScale: 0.7, roughness: 1, metalness: 0 });
  const stoneMaterial = CloneMaterialBase(rawStone);
  stoneMaterial.name = "CraterDebrisStoneInstanced";
  stoneMaterial.vertexColors = false;
  return { baseMaterial, stoneMaterial };
}

export class CraterDebris {
  constructor(view, library) {
    this.view = view; this.library = library; this.tiles = new Map();
    this.stones = templates.get(library) || [];
    this.clods = Array.from({ length: 7 }, (_, i) => MakeClod(601 + i * 17));
    const { baseMaterial, stoneMaterial } = CreateDebrisMaterials(library);
    this.baseMaterial = baseMaterial;
    this.material = this.baseMaterial;
    this.stoneMaterial = stoneMaterial;
    this.materials = [this.material, this.stoneMaterial];
    // One shared InstancedMesh pool per template shape (7 clods + up to 7 stones).
    this.pools = [
      ...this.clods.map((geometry, i) => ({
        name: `CraterDebris_Clod_${i}`, kind: "clod", geometry, material: this.baseMaterial, mesh: null, capacity: 0,
      })),
      ...this.stones.map((geometry, i) => ({
        name: `CraterDebris_Stone_${i}`, kind: "stone", geometry, material: this.stoneMaterial, mesh: null, capacity: 0,
      })),
    ];
    this._stonePoolOffset = this.clods.length;
    this._color = new THREE.Color();
    this._matrix = new THREE.Matrix4();
  }

  _SyncPools() {
    const counts = new Uint32Array(this.pools.length);
    for (const tile of this.tiles.values()) {
      for (const entry of tile.entries) counts[entry.poolIndex]++;
    }
    const offsets = new Uint32Array(this.pools.length);
    for (let p = 0; p < this.pools.length; p++) {
      const pool = this.pools[p], total = counts[p];
      if (total === 0) {
        if (pool.mesh) {
          this.view.scene.remove(pool.mesh);
          pool.mesh.dispose();
          pool.mesh = null;
          pool.capacity = 0;
        }
        continue;
      }
      if (!pool.mesh || pool.capacity < total) {
        if (pool.mesh) {
          this.view.scene.remove(pool.mesh);
          pool.mesh.dispose();
        }
        const capacity = Math.max(64, Math.ceil(total * 1.5));
        const mesh = new THREE.InstancedMesh(pool.geometry, pool.material, capacity);
        mesh.name = pool.name;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.frustumCulled = false;
        mesh.userData.craterDebris = true;
        mesh.userData.noShadowBatch = true;
        AttachShadowDepth(mesh);
        this.view.scene.add(mesh);
        pool.mesh = mesh;
        pool.capacity = capacity;
      }
      pool.mesh.count = total;
    }
    const mat = this._matrix, col = this._color;
    for (const tile of this.tiles.values()) {
      const used = new Set();
      for (const entry of tile.entries) {
        const p = entry.poolIndex, pool = this.pools[p], mesh = pool.mesh;
        if (!mesh) continue;
        const idx = offsets[p]++;
        mat.fromArray(entry.matrix);
        mesh.setMatrixAt(idx, mat);
        col.setRGB(entry.r, entry.g, entry.b, THREE.SRGBColorSpace);
        mesh.setColorAt(idx, col);
        used.add(mesh);
      }
      tile.meshes = [...used];
    }
    for (let p = 0; p < this.pools.length; p++) {
      const mesh = this.pools[p].mesh;
      if (!mesh) continue;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  }

  Update(key, tx, tz, soilWear, latticeWidth) {
    this.tiles.delete(key);
    const { model } = this.view, sizeM = model.config.cellM * model.config.tileCells;
    const x0 = tx * sizeM, z0 = tz * sizeM;
    const entries = [];
    const matrix = new THREE.Matrix4(), rotation = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0), normal = new THREE.Vector3();
    const yaw = new THREE.Quaternion(), position = new THREE.Vector3(), scale = new THREE.Vector3();
    let fragments = 0, stones = 0;
    for (let iz = Math.ceil(z0 / SPACING); iz * SPACING < z0 + sizeM; iz++) {
      for (let ix = Math.ceil(x0 / SPACING); ix * SPACING < x0 + sizeM; ix++) {
        if (fragments >= MAX_FRAGMENTS) break;
        const random = Mulberry32((Math.imul(ix, 73856093) ^ Math.imul(iz, 19349663)) >>> 0);
        const x = (ix + random() * 0.82) * SPACING, z = (iz + random() * 0.82) * SPACING;
        const cell = model.config.cellM, cells = model.config.tileCells;
        const lx = Math.round(x / cell) - tx * cells + 1, lz = Math.round(z / cell) - tz * cells + 1;
        const wear = soilWear && lx >= 1 && lx <= cells + 1 && lz >= 1 && lz <= cells + 1
          ? soilWear[lz * latticeWidth + lx] : this.view.SoilWear(x, z);
        if (wear < 0.008 || !model.Allowed(Math.round(x / model.config.cellM), Math.round(z / model.config.cellM))) continue;
        const y = model.GroundHeight(x, z), depth = model.BaseHeight(x, z) - y;
        const patch = ValueNoise2(x * 1.7, z * 1.7, 8149);
        if (random() > (depth < 0.02 ? 0.70 : 0.40) * (0.12 + patch * patch * 1.8)) continue;
        const detailed = this.stones.length && stones < 10 && random() < 0.1;
        const poolIndex = detailed
          ? this._stonePoolOffset + Math.floor(random() * this.stones.length)
          : Math.floor(random() * this.clods.length);
        const width = detailed ? 0.16 + random() * 0.16 : 0.025 + random() ** 2 * 0.19;
        const height = width * (0.25 + random() * 0.26);
        normal.set(model.GroundHeight(x - 0.12, z) - model.GroundHeight(x + 0.12, z), 0.24,
          model.GroundHeight(x, z - 0.12) - model.GroundHeight(x, z + 0.12)).normalize();
        rotation.setFromUnitVectors(up, normal);
        yaw.setFromAxisAngle(up, random() * Math.PI * 2); rotation.multiply(yaw);
        position.set(x, y - height * 0.24, z);
        scale.set(width, height, width * (0.45 + random() * 0.7));
        matrix.compose(position, rotation, scale);
        const brightness = (depth > 0.3 ? 0.62 : 1) * (0.85 + random() * 0.6) * (detailed ? 1 : 1.3);
        entries.push({
          poolIndex,
          matrix: new Float32Array(matrix.elements),
          r: Math.min(1.8, brightness * 1.1),
          g: Math.min(1.8, brightness),
          b: Math.min(1.8, brightness * 0.86),
        });
        fragments++; if (detailed) stones++;
      }
    }
    if (fragments) {
      this.tiles.set(key, { meshes: [], entries, fragments, stones });
      while (this.tiles.size > MAX_TILES) this.tiles.delete(this.tiles.keys().next().value);
    }
    this._SyncPools();
  }

  Remove(key) {
    if (!this.tiles.delete(key)) return;
    this._SyncPools();
  }

  Reset() {
    this.tiles.clear();
    this._SyncPools();
  }

  State() {
    return {
      tiles: this.tiles.size,
      fragments: [...this.tiles.values()].reduce((sum, tile) => sum + tile.fragments, 0),
      stones: [...this.tiles.values()].reduce((sum, tile) => sum + tile.stones, 0),
      maxTiles: MAX_TILES,
      maxFragmentsPerTile: MAX_FRAGMENTS,
      drawCalls: this.pools.reduce((sum, pool) => sum + (pool.mesh ? 1 : 0), 0),
    };
  }

  Dispose() {
    this.Reset();
    for (const geometry of this.clods) geometry.dispose();
    this.baseMaterial.dispose();
    this.stoneMaterial.dispose();
  }
}

/**
 * 为静态场景弹坑（doc.craters）在坑沿与破壁上撒一批半埋土块/碎石，按模板合为少量 InstancedMesh。
 * 不受运行时 TerrainDeformationView.Reset() 影响；由关卡 Dispose() 释放。
 */
export function BuildStaticCraterDebris(craters, groundAt, scene, library, { maxInstances = 1800, bounds = null } = {}) {
  const list = NormalizeSceneCraters(craters).filter((c) => c.debris !== false);
  if (!list.length || !scene || !library?.Get) return { meshes: [], count: 0, stones: 0, Dispose() {} };
  const stoneTemplates = templates.get(library) || [];
  const clods = Array.from({ length: 7 }, (_, i) => MakeClod(907 + i * 29));
  const { baseMaterial, stoneMaterial } = CreateDebrisMaterials(library);
  const poolCount = clods.length + stoneTemplates.length;
  const buckets = Array.from({ length: poolCount }, () => []);

  const matrix = new THREE.Matrix4(), rotation = new THREE.Quaternion(), yaw = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0), normal = new THREE.Vector3();
  const position = new THREE.Vector3(), scale = new THREE.Vector3();
  let total = 0, stoneCount = 0;

  for (const c of list) {
    if (total >= maxInstances) break;
    if (bounds && (c.x + c.outerReach < bounds.minX || c.x - c.outerReach > bounds.maxX
      || c.z + c.outerReach < bounds.minZ || c.z - c.outerReach > bounds.maxZ)) continue;
    const rng = Mulberry32(((c.seed >>> 0) ^ 0x9e3779b9) >>> 0);
    const ageMult = c.age === "fresh" ? 1.0 : c.age === "weathered" ? 0.55 : 0.35;
    const target = Math.max(4, Math.min(28, Math.round((6 + c.radius * 4.4) * ageMult)));
    for (let i = 0; i < target && total < maxInstances; i++) {
      const theta = rng() * Math.PI * 2;
      const inRim = rng() < 0.72;
      const rFactor = inRim ? (0.86 + rng() * 0.48) : (0.38 + rng() * 0.48);
      const ux = Math.cos(theta), uz = Math.sin(theta);
      const roughDist = c.radius * rFactor;
      const dx0 = ux * roughDist, dz0 = uz * roughDist;
      const contour = CraterContourFactor(dx0, dz0, c.x + dx0, c.z + dz0, c.phase, c.dirX, c.dirZ, c.oblique);
      const x = c.x + ux * c.radius * contour * rFactor;
      const z = c.z + uz * c.radius * contour * rFactor;
      if (bounds && (x < bounds.minX + 0.5 || x > bounds.maxX - 0.5 || z < bounds.minZ + 0.5 || z > bounds.maxZ - 0.5)) continue;
      const y = groundAt(x, z);
      if (!Number.isFinite(y)) continue;
      const detailed = stoneTemplates.length > 0 && rng() < (inRim ? 0.16 : 0.1);
      const poolIndex = detailed
        ? clods.length + Math.floor(rng() * stoneTemplates.length)
        : Math.floor(rng() * clods.length);
      const width = detailed ? 0.14 + rng() * 0.16 : 0.045 + rng() ** 1.6 * 0.19;
      const height = width * (0.24 + rng() * 0.25);
      normal.set(groundAt(x - 0.16, z) - groundAt(x + 0.16, z), 0.32,
        groundAt(x, z - 0.16) - groundAt(x, z + 0.16)).normalize();
      rotation.setFromUnitVectors(up, normal);
      yaw.setFromAxisAngle(up, rng() * Math.PI * 2);
      rotation.multiply(yaw);
      position.set(x, y - height * 0.28, z);
      scale.set(width, height, width * (0.5 + rng() * 0.65));
      matrix.compose(position, rotation, scale);
      const baseBright = (inRim ? 0.96 : 0.68) * (c.age === "fresh" ? 0.92 : 0.84) * (0.82 + rng() * 0.38);
      const mult = detailed ? 1.0 : 1.18;
      buckets[poolIndex].push({
        matrix: new Float32Array(matrix.elements),
        x, y, z,
        r: Math.min(1.6, baseBright * mult * 1.08),
        g: Math.min(1.6, baseBright * mult),
        b: Math.min(1.6, baseBright * mult * 0.86),
      });
      total++;
      if (detailed) stoneCount++;
    }
  }

  const meshes = [];
  const col = new THREE.Color(), box = new THREE.Box3(), pt = new THREE.Vector3();
  for (let p = 0; p < poolCount; p++) {
    const items = buckets[p];
    if (!items.length) continue;
    const isStone = p >= clods.length;
    const geometry = isStone ? stoneTemplates[p - clods.length] : clods[p];
    const material = isStone ? stoneMaterial : baseMaterial;
    const mesh = new THREE.InstancedMesh(geometry, material, items.length);
    mesh.name = isStone ? `StaticCraterDebris_Stone_${p - clods.length}` : `StaticCraterDebris_Clod_${p}`;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.staticCraterDebris = true;
    mesh.userData.noShadowBatch = true;
    box.makeEmpty();
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      matrix.fromArray(it.matrix);
      mesh.setMatrixAt(i, matrix);
      col.setRGB(it.r, it.g, it.b, THREE.SRGBColorSpace);
      mesh.setColorAt(i, col);
      pt.set(it.x, it.y, it.z);
      box.expandByPoint(pt);
    }
    box.expandByScalar(0.5);
    mesh.boundingBox = box.clone();
    mesh.boundingSphere = box.getBoundingSphere(new THREE.Sphere());
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    AttachShadowDepth(mesh);
    scene.add(mesh);
    meshes.push(mesh);
  }

  return {
    meshes,
    count: total,
    stones: stoneCount,
    Dispose() {
      for (const mesh of meshes) { scene.remove(mesh); mesh.dispose(); }
      meshes.length = 0;
      for (const g of clods) g.dispose();
      baseMaterial.dispose();
      stoneMaterial.dispose();
    },
  };
}
