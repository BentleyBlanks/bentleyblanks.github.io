// Authoritative sparse height delta field. Rendering, Rapier and gameplay consume
// the same lattice and the same triangle diagonal. No texture-only collision holes.
// Updates lower the soil; slope relaxation widens repeated craters instead of
// raising their floor. Navigation topology is deliberately not invalidated.
import { EXPLOSIVES, ExplosiveIdFor, TERRAIN_DEFORMATION } from "./Data_Explosives.mjs";
import { ValueNoise2 } from "./Script_Noise.mjs";

export class TerrainDeformation {
  constructor({ GroundHeight = () => 0, CanDeform = () => true, bounds, config = {} } = {}) {
    this.base = GroundHeight;
    this.canDeform = CanDeform;
    this.bounds = bounds || { minX: -2048, maxX: 2048, minZ: -2048, maxZ: 2048 };
    this.config = { ...TERRAIN_DEFORMATION, ...config };
    this.pages = new Map();
    this.basePages = new Map();
    this.dirty = new Set();
    this.tiles = new Set();
    // Numeric rows keep the hot GroundHeight path allocation-free. `tiles`
    // remains the string-keyed render contract consumed by the view adapter.
    this.tileRows = new Map();
    this.revision = 0;
    this.impacts = 0;
    this.lastImpact = null;
  }

  Key(tx, tz) { return `${tx},${tz}`; }
  Node(ix, iz) {
    const n = this.config.tileCells;
    const tx = Math.floor(ix / n), tz = Math.floor(iz / n);
    return this.pages.get(this.Key(tx, tz))?.[(iz - tz * n) * n + ix - tx * n] || 0;
  }
  Allowed(ix, iz) {
    const s = this.config.cellM, x = ix * s, z = iz * s, b = this.bounds;
    return x > b.minX + s && x < b.maxX - s && z > b.minZ + s && z < b.maxZ - s && this.canDeform(x, z);
  }
  SetNode(ix, iz, depth) {
    const n = this.config.tileCells;
    const tx = Math.floor(ix / n), tz = Math.floor(iz / n), key = this.Key(tx, tz);
    let page = this.pages.get(key);
    if (!page) { page = new Float32Array(n * n); this.pages.set(key, page); }
    page[(iz - tz * n) * n + ix - tx * n] = depth;
    // Nodes on a tile seam belong to both meshes; normals need a one-cell halo.
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      const tile = this.Key(Math.floor((ix + dx) / n), Math.floor((iz + dz) / n));
      const tileX = Math.floor((ix + dx) / n), tileZ = Math.floor((iz + dz) / n);
      this.dirty.add(tile); this.tiles.add(tile);
      let row = this.tileRows.get(tileZ);
      if (!row) { row = new Set(); this.tileRows.set(tileZ, row); }
      row.add(tileX);
    }
  }
  BaseNodeHeight(ix, iz) {
    const n = this.config.tileCells, tx = Math.floor(ix / n), tz = Math.floor(iz / n), key = this.Key(tx, tz);
    let page = this.basePages.get(key);
    if (!page) { page = new Float64Array(n * n).fill(NaN); this.basePages.set(key, page); }
    const at = (iz - tz * n) * n + ix - tx * n;
    if (Number.isNaN(page[at])) page[at] = this.base(ix * this.config.cellM, iz * this.config.cellM);
    return page[at];
  }
  BaseHeight(x, z) {
    const gx = x / this.config.cellM, gz = z / this.config.cellM;
    return Number.isInteger(gx) && Number.isInteger(gz) ? this.BaseNodeHeight(gx, gz) : this.base(x, z);
  }
  NodeHeight(ix, iz) { return this.BaseNodeHeight(ix, iz) - this.Node(ix, iz); }
  HasTile(x, z) {
    const t = this.config.cellM * this.config.tileCells;
    const tx = Math.floor(x / t), tz = Math.floor(z / t);
    return this.tileRows.get(tz)?.has(tx) || false;
  }
  GroundHeight(x, z) {
    if (!this.HasTile(x, z)) return this.base(x, z);
    const s = this.config.cellM, gx = x / s, gz = z / s;
    const ix = Math.floor(gx), iz = Math.floor(gz), u = gx - ix, v = gz - iz;
    const a = this.NodeHeight(ix, iz), b = this.NodeHeight(ix + 1, iz);
    const c = this.NodeHeight(ix, iz + 1), d = this.NodeHeight(ix + 1, iz + 1);
    return u + v <= 1 ? a + u * (b - a) + v * (c - a)
      : d + (1 - u) * (c - d) + (1 - v) * (b - d);
  }

  ApplyBlast(position, kind) {
    if (![position?.x, position?.y, position?.z].every(Number.isFinite)) return null;
    const id = ExplosiveIdFor(kind), spec = EXPLOSIVES[id];
    const surface = this.GroundHeight(position.x, position.z);
    const gap = Math.max(0, position.y - surface);
    if (gap > spec.groundReachM || !this.canDeform(position.x, position.z)) return null;
    const coupling = Math.max(0, 1 - gap / spec.groundReachM);
    const radius = spec.craterRadiusM * (0.75 + 0.25 * coupling);
    const depth = spec.craterDepthM * coupling;
    if (depth < 0.001) return null;
    const { cellM: s, maxDepthM, maxAxisGrade } = this.config;
    const queue = [], changed = new Set(), allowed = new Map(), caps = new Map();
    const Allowed = (ix, iz) => {
      const key = `${ix},${iz}`;
      if (!allowed.has(key)) allowed.set(key, this.Allowed(ix, iz));
      return allowed.get(key);
    };
    const Lower = (ix, iz, target) => {
      const old = this.Node(ix, iz);
      if (target <= old + 0.00001 || !Allowed(ix, iz)) return;
      // Reserve a traversable ramp up to every protected foundation/boundary.
      const key = `${ix},${iz}`;
      let cap = caps.get(key);
      if (cap === undefined) {
        cap = maxDepthM;
        const reach = Math.ceil(maxDepthM / (maxAxisGrade * s));
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          for (let j = 1; j <= reach && j * maxAxisGrade * s < cap; j++) {
            if (!Allowed(ix + dx * j, iz + dz * j)) { cap = Math.min(cap, j * maxAxisGrade * s); break; }
          }
        }
        caps.set(key, cap);
      }
      const next = Math.min(target, cap);
      if (next <= old + 0.00001) return;
      this.SetNode(ix, iz, next); queue.push([ix, iz]); changed.add(`${ix},${iz}`);
    };
    for (let iz = Math.floor((position.z - radius) / s); iz <= Math.ceil((position.z + radius) / s); iz++) {
      for (let ix = Math.floor((position.x - radius) / s); ix <= Math.ceil((position.x + radius) / s); ix++) {
        const dx = ix * s - position.x, dz = iz * s - position.z;
        const r = Math.hypot(dx, dz) / radius;
        if (r >= 1) continue;
        const rough = 0.94 + 0.06 * ValueNoise2(ix * 0.26, iz * 0.26, 1938);
        Lower(ix, iz, this.Node(ix, iz) + depth * (1 - r * r) ** 2 * rough);
      }
    }
    // Monotone relaxation: overlapping blasts can deepen and widen, never heal.
    for (let head = 0; head < queue.length; head++) {
      const [ix, iz] = queue[head], depthHere = this.Node(ix, iz);
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
        Lower(ix + dx, iz + dz, depthHere - maxAxisGrade * s * Math.hypot(dx, dz));
      }
    }
    if (!changed.size) return null;
    this.revision++; this.impacts++;
    this.lastImpact = { id, x: position.x, z: position.z, radius, changedNodes: changed.size,
      depth: this.base(position.x, position.z) - this.GroundHeight(position.x, position.z), revision: this.revision };
    return this.lastImpact;
  }
  TakeDirty() { const keys = [...this.dirty]; this.dirty.clear(); return keys; }
  State() { return { revision: this.revision, impacts: this.impacts, tiles: this.tiles.size, pages: this.pages.size,
    bytes: this.pages.size * this.config.tileCells ** 2 * 4, maxDepthM: this.config.maxDepthM, lastImpact: this.lastImpact }; }
  Clear() { this.pages.clear(); this.basePages.clear(); this.dirty.clear(); this.tiles.clear(); this.tileRows.clear(); this.revision++; this.impacts = 0; this.lastImpact = null; }
}
