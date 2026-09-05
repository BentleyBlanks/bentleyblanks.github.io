// Permanent, shallow surface dressing. Terrain remains the collision authority;
// these half-buried fragments are smaller than a boot, never gameplay cover.
import * as THREE from "three";
import { InstantiateExternalProp } from "./Script_ExternalProps.mjs";
import { BuildSink } from "./Script_World.mjs";
import { ValueNoise2, Mulberry32 } from "./Script_Noise.mjs";

const templates = new WeakMap();
const MAX_TILES = 48, MAX_FRAGMENTS = 170, SPACING = 0.35;

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
    geometry.scale(1 / size.x, 1 / size.y, 1 / size.z);
    shapes.push(geometry);
  });
  templates.set(library, shapes);
}

function MakeClod(seed) {
  const geometry = new THREE.IcosahedronGeometry(0.5, 1);
  const positions = geometry.attributes.position;
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i), y = positions.getY(i), z = positions.getZ(i);
    const wobble = 0.76 + ValueNoise2(x * 6 + y * 3, z * 6 - y * 2, seed) * 0.46;
    positions.setXYZ(i, x * wobble, (y + 0.5) * wobble, z * wobble);
  }
  geometry.computeVertexNormals();
  return geometry;
}

// Fill one final geometry per tile/material. Cloning BufferGeometry and then
// transforming/copying it again in BuildSink cost more than the terrain itself
// during overlapping impacts. Source templates remain immutable and shared.
function BakeFragments(fragments) {
  let vertexCount = 0, indexCount = 0;
  for (const { source } of fragments) {
    vertexCount += source.attributes.position.count;
    indexCount += source.index?.count || source.attributes.position.count;
  }
  const positions = new Float32Array(vertexCount * 3), normals = new Float32Array(vertexCount * 3);
  const colors = new Float32Array(vertexCount * 3), uvs = new Float32Array(vertexCount * 2);
  const indices = vertexCount > 65535 ? new Uint32Array(indexCount) : new Uint16Array(indexCount);
  const normalMatrix = new THREE.Matrix3();
  let vertexOffset = 0, indexOffset = 0;
  for (const { source, transform, brightness } of fragments) {
    const pos = source.attributes.position.array, normal = source.attributes.normal.array;
    const m = transform.elements, n = normalMatrix.getNormalMatrix(transform).elements;
    const count = source.attributes.position.count;
    for (let i = 0; i < count; i++) {
      const at = i * 3, out = (vertexOffset + i) * 3, uv = (vertexOffset + i) * 2;
      const x = pos[at], y = pos[at + 1], z = pos[at + 2];
      const px = m[0] * x + m[4] * y + m[8] * z + m[12];
      const py = m[1] * x + m[5] * y + m[9] * z + m[13];
      const pz = m[2] * x + m[6] * y + m[10] * z + m[14];
      positions[out] = px; positions[out + 1] = py; positions[out + 2] = pz;
      const nx = normal[at], ny = normal[at + 1], nz = normal[at + 2];
      const ax = n[0] * nx + n[3] * ny + n[6] * nz;
      const ay = n[1] * nx + n[4] * ny + n[7] * nz;
      const az = n[2] * nx + n[5] * ny + n[8] * nz;
      const length = Math.hypot(ax, ay, az) || 1;
      normals[out] = ax / length; normals[out + 1] = ay / length; normals[out + 2] = az / length;
      uvs[uv] = px / 1.3 + py * 0.21; uvs[uv + 1] = -pz / 1.3 + py * 0.33;
      colors[out] = brightness * 1.10; colors[out + 1] = brightness; colors[out + 2] = brightness * 0.86;
    }
    const index = source.index?.array;
    const countIndices = index?.length || count;
    for (let i = 0; i < countIndices; i++) indices[indexOffset++] = vertexOffset + (index ? index[i] : i);
    vertexOffset += count;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
  geometry.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  geometry.computeBoundingSphere();
  return geometry;
}

export class CraterDebris {
  constructor(view, library) {
    this.view = view; this.library = library; this.tiles = new Map();
    this.stones = templates.get(library) || [];
    this.clods = Array.from({ length: 7 }, (_, i) => MakeClod(601 + i * 17));
    this.baseMaterial = library.Get(library.baked.has("CraterScorched") ? "CraterScorched" : "Ground",
      { normalScale: 0.65, roughness: 1, metalness: 0, aoIntensity: 0.65 });
    this.baseMaterial.vertexColors = true;
    this.material = library.Static(this.baseMaterial);
    this.stoneMaterial = library.Get("Stone", { color: 0x80776a, normalScale: 0.7, roughness: 1, metalness: 0 });
    this.stoneMaterial.vertexColors = true;
    this.materials = [this.material, library.Static(this.stoneMaterial)];
  }
  Update(key, tx, tz, soilWear, latticeWidth) {
    this.Remove(key);
    const { model } = this.view, sizeM = model.config.cellM * model.config.tileCells;
    const x0 = tx * sizeM, z0 = tz * sizeM;
    const batches = new Map();
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
        const source = detailed ? this.stones[Math.floor(random() * this.stones.length)]
          : this.clods[Math.floor(random() * this.clods.length)];
        const width = detailed ? 0.16 + random() * 0.16 : 0.025 + random() ** 2 * 0.19;
        const height = width * (0.25 + random() * 0.26);
        normal.set(model.GroundHeight(x - 0.12, z) - model.GroundHeight(x + 0.12, z), 0.24,
          model.GroundHeight(x, z - 0.12) - model.GroundHeight(x, z + 0.12)).normalize();
        rotation.setFromUnitVectors(up, normal);
        yaw.setFromAxisAngle(up, random() * Math.PI * 2); rotation.multiply(yaw);
        position.set(x, y - height * 0.24, z);
        scale.set(width, height, width * (0.45 + random() * 0.7));
        matrix.compose(position, rotation, scale);
        const materialName = detailed ? "CraterStone" : "CraterFragments";
        if (!batches.has(materialName)) batches.set(materialName, []);
        const brightness = (depth > 0.3 ? 0.62 : 1) * (0.85 + random() * 0.6) * (detailed ? 1 : 1.3);
        batches.get(materialName).push({ source, transform: matrix.clone(), brightness });
        fragments++; if (detailed) stones++;
      }
    }
    if (!fragments) return;
    const sink = new BuildSink().SetSector(`CraterDebris_${key}`);
    for (const [name, fragments] of batches) sink.Add(name, BakeFragments(fragments));
    const meshes = sink.Flush(this.view.scene, this.library, { resolve: (name) => name === "CraterStone" ? this.stoneMaterial : this.baseMaterial });
    for (const mesh of meshes) mesh.userData.craterDebris = true;
    this.tiles.set(key, { meshes, fragments, stones });
    while (this.tiles.size > MAX_TILES) this.Remove(this.tiles.keys().next().value);
  }
  Remove(key) {
    for (const mesh of this.tiles.get(key)?.meshes || []) { this.view.scene.remove(mesh); mesh.geometry.dispose(); }
    this.tiles.delete(key);
  }
  Reset() { for (const key of this.tiles.keys()) this.Remove(key); }
  State() { return { tiles: this.tiles.size, fragments: [...this.tiles.values()].reduce((sum, tile) => sum + tile.fragments, 0),
    stones: [...this.tiles.values()].reduce((sum, tile) => sum + tile.stones, 0), maxTiles: MAX_TILES, maxFragmentsPerTile: MAX_FRAGMENTS }; }
  Dispose() { this.Reset(); for (const geometry of this.clods) geometry.dispose(); }
}
