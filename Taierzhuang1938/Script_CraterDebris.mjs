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
    const sink = new BuildSink().SetSector(`CraterDebris_${key}`);
    const colorsByMaterial = new Map();
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
        const geometry = source.clone();
        normal.set(model.GroundHeight(x - 0.12, z) - model.GroundHeight(x + 0.12, z), 0.24,
          model.GroundHeight(x, z - 0.12) - model.GroundHeight(x, z + 0.12)).normalize();
        rotation.setFromUnitVectors(up, normal);
        yaw.setFromAxisAngle(up, random() * Math.PI * 2); rotation.multiply(yaw);
        position.set(x, y - height * 0.24, z);
        scale.set(width, height, width * (0.45 + random() * 0.7));
        matrix.compose(position, rotation, scale); geometry.applyMatrix4(matrix);
        // World-scale soil grains; normalized prop UVs would enlarge one tiny
        // clod to a metre-wide boulder texture.
        const pos = geometry.attributes.position, uv = new Float32Array(pos.count * 2);
        for (let i = 0; i < pos.count; i++) {
          uv[i * 2] = pos.getX(i) / 1.3 + pos.getY(i) * 0.21;
          uv[i * 2 + 1] = -pos.getZ(i) / 1.3 + pos.getY(i) * 0.33;
        }
        geometry.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
        const materialName = detailed ? "CraterStone" : "CraterFragments";
        if (!colorsByMaterial.has(materialName)) colorsByMaterial.set(materialName, []);
        const brightness = (depth > 0.3 ? 0.62 : 1) * (0.85 + random() * 0.6) * (detailed ? 1 : 1.3);
        colorsByMaterial.get(materialName).push({ vertices: pos.count, brightness });
        sink.Add(materialName, geometry); fragments++; if (detailed) stones++;
      }
    }
    if (!fragments) return;
    const meshes = sink.Flush(this.view.scene, this.library, { resolve: (name) => name === "CraterStone" ? this.stoneMaterial : this.baseMaterial });
    for (const mesh of meshes) {
      const pos = mesh.geometry.attributes.position, color = new Float32Array(pos.count * 3);
      let at = 0;
      // BuildSink preserves bucket order. One soil-height/tint sample per fragment
      // replaces thousands of repeated height queries at its individual vertices.
      for (const { vertices, brightness } of colorsByMaterial.get(mesh.name.split("|").pop())) {
        for (let i = 0; i < vertices; i++) {
          color[at++] = brightness * 1.10; color[at++] = brightness; color[at++] = brightness * 0.86;
        }
      }
      mesh.geometry.setAttribute("color", new THREE.BufferAttribute(color, 3));
      mesh.userData.craterDebris = true;
    }
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
