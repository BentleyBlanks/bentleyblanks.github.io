// Sparse dirty-tile adapter. Original terrain triangles are clipped out once per
// allocated tile, so the crater is a real hole in every render pass (including
// depth, shadow and SSAO), with no coplanar overlay or special discard shader.
// Each tile's mesh and Rapier trimesh share one position/index buffer. Baseline
// ground sampling remains owned by the field (including SampleJieheHeight).
import * as THREE from "three";
import { TerrainDeformation } from "./Script_TerrainDeformation.mjs";
import { TERRAIN_DEFORMATION } from "./Data_Explosives.mjs";

function ClipByDistance(polygon, Distance) {
  const inside = [], outside = [];
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i], b = polygon[(i + 1) % polygon.length];
    const da = Distance(a), db = Distance(b);
    (da >= 0 ? inside : outside).push(a);
    if ((da < 0) !== (db < 0)) {
      const t = da / (da - db), cross = a.map((v, j) => v + (b[j] - v) * t);
      inside.push(cross); outside.push(cross);
    }
  }
  return { inside, outside };
}
function ClipPolygon(polygon, axis, edge, sign) {
  return ClipByDistance(polygon, (v) => (v[axis] - edge) * sign);
}

export function CutTerrainRectangle(mesh, rect, { AllowTriangle = null, OnCut = null } = {}) {
  const geometry = mesh.geometry, pos = geometry.attributes.position;
  if (!geometry.boundingBox) geometry.computeBoundingBox();
  mesh.updateMatrixWorld(true);
  const worldBox = geometry.boundingBox.clone().applyMatrix4(mesh.matrixWorld);
  if (worldBox.max.x <= rect.minX || worldBox.min.x >= rect.maxX || worldBox.max.z <= rect.minZ || worldBox.min.z >= rect.maxZ) return false;
  const attrs = Object.entries(geometry.attributes).filter(([, a]) => a.itemSize <= 4);
  const index = geometry.index, count = index?.count || pos.count;
  const offsets = []; let stride = 0;
  for (const [name, a] of attrs) { offsets.push({ name, size: a.itemSize, offset: stride }); stride += a.itemSize; }
  const pOffset = offsets.find((a) => a.name === "position").offset;
  const data = [], kept = [], temp = new THREE.Vector3(); let removed = false;
  // Reject with positions first. Recopying every UV/normal of the entire city
  // for each small hole used to dominate the blast frame.
  const matrix = mesh.matrixWorld.elements, identity = matrix.every((v, i) => v === (i % 5 === 0 ? 1 : 0));
  const worldPositions = identity ? pos.array : new Float32Array(pos.count * 3);
  if (!identity) for (let i = 0; i < pos.count; i++) temp.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld).toArray(worldPositions, i * 3);
  const Emit = (polygon) => { for (let k = 1; k < polygon.length - 1; k++) data.push(...polygon[0], ...polygon[k], ...polygon[k + 1]); };
  for (let i = 0; i < count; i += 3) {
    const ai = index ? index.getX(i) : i, bi = index ? index.getX(i + 1) : i + 1, ci = index ? index.getX(i + 2) : i + 2;
    const ax = worldPositions[ai * 3], az = worldPositions[ai * 3 + 2];
    const bx = worldPositions[bi * 3], bz = worldPositions[bi * 3 + 2];
    const cx = worldPositions[ci * 3], cz = worldPositions[ci * 3 + 2];
    if (Math.max(ax, bx, cx) <= rect.minX || Math.min(ax, bx, cx) >= rect.maxX
      || Math.max(az, bz, cz) <= rect.minZ || Math.min(az, bz, cz) >= rect.maxZ) { kept.push(ai, bi, ci); continue; }
    const up = (bz - az) * (cx - ax) - (bx - ax) * (cz - az);
    if (!AllowTriangle && up <= 1e-9) { kept.push(ai, bi, ci); continue; }
    const tri = [];
    for (const at of [ai, bi, ci]) {
      const values = [];
      for (const [, a] of attrs) for (let c = 0; c < a.itemSize; c++) values.push(a.array[at * a.itemSize + c]);
      values[pOffset] = worldPositions[at * 3]; values[pOffset + 1] = worldPositions[at * 3 + 1]; values[pOffset + 2] = worldPositions[at * 3 + 2];
      tri.push(values);
    }
    if (AllowTriangle && !AllowTriangle(tri, pOffset, up)) { kept.push(ai, bi, ci); continue; }
    const start = data.length;
    let polygon = tri;
    for (const [axis, edge, sign] of [[pOffset, rect.minX, 1], [pOffset, rect.maxX, -1], [pOffset + 2, rect.minZ, 1], [pOffset + 2, rect.maxZ, -1]]) {
      if (!polygon.length) break;
      const cut = ClipPolygon(polygon, axis, edge, sign);
      Emit(cut.outside); polygon = cut.inside;
    }
    if (polygon.length >= 3) { removed = true; OnCut?.(polygon, offsets, pOffset, up); }
    else { data.length = start; kept.push(ai, bi, ci); }
  }
  if (!removed) return false;
  const result = new THREE.BufferGeometry(), inverse = mesh.matrixWorld.clone().invert();
  for (const attr of offsets) {
    const original = geometry.attributes[attr.name];
    const values = new Float32Array(original.array.length + data.length / stride * attr.size);
    values.set(original.array);
    for (let i = 0; i < data.length / stride; i++) {
      const at = original.array.length + i * attr.size;
      for (let j = 0; j < attr.size; j++) values[at + j] = data[i * stride + attr.offset + j];
      if (attr.name === "position") {
        temp.fromArray(values, at).applyMatrix4(inverse); temp.toArray(values, at);
      }
    }
    result.setAttribute(attr.name, new THREE.BufferAttribute(values, attr.size, original.normalized));
  }
  for (let i = 0; i < data.length / stride; i++) kept.push(pos.count + i);
  result.setIndex(kept);
  // A cut only shrinks the source; the old conservative bounds stay valid.
  result.boundingBox = geometry.boundingBox.clone();
  result.boundingSphere = geometry.boundingSphere?.clone() || null;
  mesh.geometry = result;
  return true;
}

// Thin earth/road/crop surface layers are retessellated only where terrain tiles
// change. Keep their original UVs and perimeter; never leave a road floating over
// the new hole. Clip to BOTH triangles of each ground cell so all surfaces agree.
function MakeOverlayGeometry(polygons, cellM) {
  const positions = [], uvs = [], colors = [];
  const Emit = (poly, p, uv, color) => {
    for (let k = 1; k < poly.length - 1; k++) for (const v of [poly[0], poly[k], poly[k + 1]]) {
      positions.push(v[p], v[p + 1], v[p + 2]);
      uvs.push(uv ? v[uv.offset] : 0, uv ? v[uv.offset + 1] : 0);
      colors.push(color ? v[color.offset] : 1, color ? v[color.offset + 1] : 1, color ? v[color.offset + 2] : 1);
    }
  };
  for (const { polygon, attrs, p } of polygons) {
    const uv = attrs.find((a) => a.name === "uv"), color = attrs.find((a) => a.name === "color");
    const minX = Math.floor(Math.min(...polygon.map((v) => v[p])) / cellM);
    const maxX = Math.ceil(Math.max(...polygon.map((v) => v[p])) / cellM);
    const minZ = Math.floor(Math.min(...polygon.map((v) => v[p + 2])) / cellM);
    const maxZ = Math.ceil(Math.max(...polygon.map((v) => v[p + 2])) / cellM);
    for (let z = minZ; z < maxZ; z++) for (let x = minX; x < maxX; x++) {
      let cell = polygon;
      for (const [axis, edge, sign] of [[p, x * cellM, 1], [p, (x + 1) * cellM, -1],
        [p + 2, z * cellM, 1], [p + 2, (z + 1) * cellM, -1]]) {
        if (!cell.length) break;
        cell = ClipPolygon(cell, axis, edge, sign).inside;
      }
      if (cell.length < 3) continue;
      const split = ClipByDistance(cell, (v) => (x + z + 1) * cellM - v[p] - v[p + 2]);
      Emit(split.inside, p, uv, color); Emit(split.outside, p, uv, color);
    }
  }
  if (!positions.length) return null;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3).setUsage(THREE.DynamicDrawUsage));
  geometry.userData.basePositions = new Float32Array(positions);
  geometry.userData.baseColors = new Float32Array(colors);
  return geometry;
}

const GROUND_OVERLAYS = /^(DirtRoad|RoadWear|RoadLitter|CartRoad|YardEarth|FieldEarth(?:Dark)?|FreshEarth|FieldSoil(?:Dark)?|PloughSoil(?:Dark)?|RiverSand|WheatRow(?:Dry)?|WinterWheat)$/;

function ConfigureCraterSurface(material, source, soil) {
  const CompileSource = source.onBeforeCompile, SourceKey = source.customProgramCacheKey.bind(source);
  material.vertexColors = true;
  material.onBeforeCompile = (shader, renderer) => {
    CompileSource.call(material, shader, renderer);
    shader.uniforms.uCraterSoil = { value: soil.map };
    shader.uniforms.uCraterNormal = { value: soil.normalMap };
    shader.vertexShader = shader.vertexShader.replace("#include <common>", `#include <common>
      attribute vec2 terrainDelta;
      varying float vTerrainDelta;
      varying float vTerrainWear;
      varying vec2 vSoilUv;`)
      .replace("#include <begin_vertex>", `#include <begin_vertex>
        vTerrainDelta = terrainDelta.x;
        vTerrainWear = terrainDelta.y;
        vSoilUv = (modelMatrix * vec4(position, 1.0)).xz / 2.4;`);
    shader.fragmentShader = shader.fragmentShader.replace("#include <common>", `#include <common>
      uniform sampler2D uCraterSoil;
      uniform sampler2D uCraterNormal;
      varying float vTerrainDelta;
      varying float vTerrainWear;
      varying vec2 vSoilUv;`)
      .replace("#include <color_fragment>", `#include <color_fragment>
        vec3 soil = texture2D(uCraterSoil, vSoilUv).rgb;
        vec3 fineSoil = texture2D(uCraterSoil, mat2(0.8, 0.6, -0.6, 0.8) * vSoilUv * 3.7).rgb;
        float grain = clamp(dot(fineSoil, vec3(0.333)) * 3.0, 0.0, 1.0);
        float exposed = smoothstep(0.001, 0.06, vTerrainWear * mix(0.65, 1.45, grain));
        float cavity = smoothstep(0.02, 0.7, vTerrainDelta);
        vec3 earth = mix(soil, fineSoil, 0.25) * mix(1.12, 0.72, cavity);
        diffuseColor.rgb = mix(diffuseColor.rgb, earth, exposed);`)
      .replace("#include <roughnessmap_fragment>", `#include <roughnessmap_fragment>
        roughnessFactor = mix(roughnessFactor, 0.96, exposed);`)
      .replace("#include <normal_fragment_maps>", `#include <normal_fragment_maps>
        vec2 soilSlope = texture2D(uCraterNormal, vSoilUv).xy * 2.0 - 1.0;
        normal = normalize(normal + mat3(viewMatrix) * vec3(soilSlope.x, 0.0, -soilSlope.y) * exposed * 0.42);`);
  };
  material.customProgramCacheKey = () => `${SourceKey()}|CraterSoilV1`;
}

export class TerrainDeformationView {
  constructor(field, scene, library) {
    this.field = field; this.scene = scene; this.physics = null;
    this.originalHeight = field.GroundHeight.bind(field);
    this.originalGeometry = new Map(); this.tileMeshes = new Map();
    this.overlayTiles = new Map(); this.overlayMaterials = new Map();
    const groundMaterial = library.Get("Ground");
    this.soilMaterial = groundMaterial;
    this.sources = field.meshes.filter((m) => m.geometry && (m.userData.deformableTerrain
      || m.material === groundMaterial || /(?:^Static_|\|)Ground$/.test(m.name)
      || /^(JieheGround_|CityPlatform$|OuterGround$|RangeGround$)/.test(m.name)));
    this.overlaySources = field.meshes.filter((m) => m.geometry && !m.isInstancedMesh
      && GROUND_OVERLAYS.test(m.name.split("|").pop().replace(/^Static_/, "")));
    this.material = (this.sources[0]?.material || groundMaterial).clone();
    const sourceMaterial = this.sources[0]?.material || groundMaterial;
    ConfigureCraterSurface(this.material, sourceMaterial, this.soilMaterial);
    this.model = new TerrainDeformation({ GroundHeight: this.originalHeight, bounds: field.bounds,
      CanDeform: (x, z) => this.CanDeform(x, z) });
    field.BaseGroundHeight = this.originalHeight;
    field.GroundHeight = (x, z) => this.model.GroundHeight(x, z);
    field.deformation = this;
  }
  CanDeform(x, z) {
    if (!this.sources.length) return false;
    const y = this.model.BaseHeight(x, z), margin = TERRAIN_DEFORMATION.foundationMarginM;
    if ((this.field.WaterDepth?.(x, z, y) || 0) > 0.15) return false;
    // Foundations and elevated walkable objects remain supported; characters are
    // dynamic and never enter this static mask. Open soil between them deforms.
    for (const b of this.field.NearbyColliders(x, z, margin + 1)) {
      if (b.destroyed || b.terrain) continue;
      if (b.min[1] > y + 1.5 || b.max[1] < y - 0.1) continue;
      if (x > b.min[0] - margin && x < b.max[0] + margin && z > b.min[2] - margin && z < b.max[2] + margin) return false;
    }
    return true;
  }
  AttachPhysics(physics) { this.physics = physics; }
  SoilWear(x, z) {
    const ix = Math.round(x / this.model.config.cellM), iz = Math.round(z / this.model.config.cellM);
    let wear = Math.abs(this.model.Node(ix, iz));
    // Keep freshly exposed earth continuous across the zero-height crossing
    // between the depression and raised lip; signed displacement alone leaves
    // a bright ring of untouched whitebox material through every crater.
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      wear = Math.max(wear, Math.abs(this.model.Node(ix + dx, iz + dz)) * 0.85);
    }
    return wear;
  }
  CutSource(source, rect, options) {
    const before = source.geometry;
    if (!CutTerrainRectangle(source, rect, options)) return false;
    if (!this.originalGeometry.has(source)) this.originalGeometry.set(source, before);
    else before.dispose();
    return true;
  }
  MakeOverlays(key, rect) {
    const meshes = [];
    for (const source of this.overlaySources) {
      const polygons = [];
      this.CutSource(source, rect, {
        AllowTriangle: (tri, p) => tri.every((v) => Math.abs(v[p + 1] - this.originalHeight(v[p], v[p + 2])) < 1),
        OnCut: (polygon, attrs, p, up) => { if (up > 1e-9) polygons.push({ polygon, attrs, p }); },
      });
      if (!polygons.length) continue;
      const geometry = MakeOverlayGeometry(polygons, this.model.config.cellM);
      if (!geometry) continue;
      const original = geometry.userData.basePositions, baseHeights = new Float64Array(original.length / 3);
      for (let i = 0; i < baseHeights.length; i++) baseHeights[i] = this.model.BaseHeight(original[i * 3], original[i * 3 + 2]);
      geometry.userData.baseHeights = baseHeights;
      geometry.setAttribute("terrainDelta", new THREE.BufferAttribute(new Float32Array(baseHeights.length * 2), 2).setUsage(THREE.DynamicDrawUsage));
      let material = this.overlayMaterials.get(source.material);
      if (!material) {
        material = source.material.clone(); material.vertexColors = true;
        ConfigureCraterSurface(material, source.material, this.soilMaterial);
        this.overlayMaterials.set(source.material, material);
      }
      const mesh = new THREE.Mesh(geometry, material); mesh.name = `TerrainSurface_${key}_${source.name}`;
      mesh.receiveShadow = source.receiveShadow; mesh.castShadow = source.castShadow;
      mesh.onBeforeRender = source.onBeforeRender; mesh.onAfterRender = source.onAfterRender;
      mesh.customDepthMaterial = source.customDepthMaterial;
      this.scene.add(mesh); meshes.push(mesh);
    }
    this.overlayTiles.set(key, meshes);
  }
  UpdateOverlays(key) {
    for (const mesh of this.overlayTiles.get(key) || []) {
      const geo = mesh.geometry, pos = geo.attributes.position, color = geo.attributes.color;
      const original = geo.userData.basePositions, baseColor = geo.userData.baseColors;
      for (let i = 0; i < pos.count; i++) {
        const x = original[i * 3], z = original[i * 3 + 2], baseline = geo.userData.baseHeights[i];
        const ground = this.model.GroundHeight(x, z), delta = baseline - ground, depth = Math.abs(delta);
        // Intact surface retains its old crown. Exposed deep soil converges on
        // the shared collision surface with only a subpixel rendering offset.
        const crown = original[i * 3 + 1] - baseline;
        pos.setY(i, ground + crown * Math.max(0, 1 - depth / 0.18) + (depth > 0 ? 0.003 : 0));
        color.setXYZ(i, baseColor[i * 3], baseColor[i * 3 + 1], baseColor[i * 3 + 2]);
        geo.attributes.terrainDelta.setXY(i, delta, this.SoilWear(x, z));
      }
      pos.needsUpdate = true; color.needsUpdate = true;
      geo.attributes.terrainDelta.needsUpdate = true;
      geo.computeVertexNormals(); geo.computeBoundingBox(); geo.computeBoundingSphere();
    }
  }
  ApplyBlast(position, kind) {
    const start = performance.now();
    const hit = this.model.ApplyBlast(position, kind);
    const rulesEnd = performance.now();
    if (hit) this.Flush();
    this.lastUpdateMs = { rules: rulesEnd - start, surface: performance.now() - rulesEnd };
    return hit;
  }
  Flush() {
    const { cellM: s, tileCells: n } = this.model.config, width = n + 1;
    const dirty = this.model.TakeDirty();
    for (const key of dirty) {
      const [tx, tz] = key.split(",").map(Number), x0 = tx * n * s, z0 = tz * n * s;
      let mesh = this.tileMeshes.get(key);
      if (!mesh) {
        const rect = { minX: x0, maxX: x0 + n * s, minZ: z0, maxZ: z0 + n * s };
        for (const source of this.sources) this.CutSource(source, rect);
        this.MakeOverlays(key, rect);
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(width * width * 3), 3).setUsage(THREE.DynamicDrawUsage));
        geometry.setAttribute("normal", new THREE.BufferAttribute(new Float32Array(width * width * 3), 3).setUsage(THREE.DynamicDrawUsage));
        geometry.setAttribute("color", new THREE.BufferAttribute(new Float32Array(width * width * 3), 3).setUsage(THREE.DynamicDrawUsage));
        geometry.setAttribute("terrainDelta", new THREE.BufferAttribute(new Float32Array(width * width * 2), 2).setUsage(THREE.DynamicDrawUsage));
        const uv = new Float32Array(width * width * 2), indices = [];
        for (let z = 0; z <= n; z++) for (let x = 0; x <= n; x++) {
          const at = z * width + x; uv[at * 2] = (x0 + x * s) / 3.4; uv[at * 2 + 1] = -(z0 + z * s) / 3.4;
          if (x < n && z < n) indices.push(at, at + width, at + 1, at + 1, at + width, at + width + 1);
        }
        geometry.setAttribute("uv", new THREE.BufferAttribute(uv, 2)); geometry.setIndex(indices);
        mesh = new THREE.Mesh(geometry, this.material); mesh.name = `TerrainCrater_${tx}_${tz}`;
        mesh.receiveShadow = true; mesh.castShadow = true; mesh.userData.terrainTile = key;
        this.scene.add(mesh); this.tileMeshes.set(key, mesh);
      }
      const geo = mesh.geometry, position = geo.attributes.position, color = geo.attributes.color, normals = geo.attributes.normal;
      for (let z = 0; z <= n; z++) for (let x = 0; x <= n; x++) {
        const ix = tx * n + x, iz = tz * n + z, at = z * width + x;
        const y = this.model.NodeHeight(ix, iz), depth = this.model.Node(ix, iz);
        position.setXYZ(at, ix * s, y, iz * s);
        const nx = this.model.NodeHeight(ix - 1, iz) - this.model.NodeHeight(ix + 1, iz);
        const nz = this.model.NodeHeight(ix, iz - 1) - this.model.NodeHeight(ix, iz + 1);
        const norm = Math.hypot(nx, 2 * s, nz); normals.setXYZ(at, nx / norm, 2 * s / norm, nz / norm);
        color.setXYZ(at, 1, 1, 1);
        geo.attributes.terrainDelta.setXY(at, depth, this.SoilWear(ix * s, iz * s));
      }
      position.needsUpdate = true; normals.needsUpdate = true; color.needsUpdate = true;
      geo.attributes.terrainDelta.needsUpdate = true;
      geo.computeBoundingBox(); geo.computeBoundingSphere();
      this.physics?.SetTerrainTile(key, position.array, geo.index.array);
      this.UpdateOverlays(key);
    }
    if (dirty.length) this.physics?.RefreshStaticQueries();
  }
  Reset() {
    for (const [source, original] of this.originalGeometry) { source.geometry.dispose(); source.geometry = original; }
    this.originalGeometry.clear();
    for (const [key, mesh] of this.tileMeshes) { this.scene.remove(mesh); mesh.geometry.dispose(); this.physics?.RemoveTerrainTile(key); }
    for (const meshes of this.overlayTiles.values()) for (const mesh of meshes) { this.scene.remove(mesh); mesh.geometry.dispose(); }
    this.overlayTiles.clear();
    this.tileMeshes.clear(); this.model.Clear();
    this.physics?.RefreshStaticQueries();
  }
  State() { return { ...this.model.State(), meshes: this.tileMeshes.size,
    lastUpdateMs: this.lastUpdateMs || null,
    overlays: [...this.overlayTiles.values()].reduce((sum, meshes) => sum + meshes.length, 0),
    colliderTiles: this.physics?.terrainTiles.size || 0 }; }
  Dispose() {
    this.Reset(); this.material.dispose();
    for (const material of this.overlayMaterials.values()) material.dispose();
    this.overlayMaterials.clear(); this.field.GroundHeight = this.originalHeight; this.field.deformation = null;
  }
}
