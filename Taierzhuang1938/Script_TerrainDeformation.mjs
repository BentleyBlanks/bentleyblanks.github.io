// Authoritative sparse height delta field. Rendering, Rapier and gameplay consume
// the same lattice and the same triangle diagonal. No texture-only collision holes.
// Positive deltas excavate; negative deltas are bounded displaced soil outside
// the cavity. New rims never fill an existing cavity. All share one heightfield.
//
// Storage is keyed by integers, never by strings: the blast frame used to spend
// most of its time building "ix,iz" keys (one per lattice lookup, tens of
// thousands per crater) and GroundHeight inside a crater tile ran ~100x slower
// than untouched soil. `tiles` / `TakeDirty()` keep the string-keyed render
// contract; everything hot below it is numeric.
import { EXPLOSIVES, ExplosiveIdFor, TERRAIN_DEFORMATION } from "./Data_Explosives.mjs";
import { ValueNoise2 } from "./Script_Noise.mjs";

// [dx, dz, lattice distance]. Distances are precomputed: the relaxation loops
// visit every neighbour of every changed node.
const NEIGHBORS = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
  [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2]];
// Unique integer keys. Node keys stay small integers for |x| < 4096 m at 0.25 m
// cells; larger coordinates still hash uniquely, only slower.
const NODE_SPAN = 65536, PAGE_SPAN = 4096;
export const NodeKey = (ix, iz) => ix * NODE_SPAN + iz;
const PageKey = (tx, tz) => tx * PAGE_SPAN + tz;

export class TerrainDeformation {
  constructor({ GroundHeight = () => 0, CanDeform = () => true, bounds, config = {} } = {}) {
    this.base = GroundHeight;
    this.canDeform = CanDeform;
    this.bounds = bounds || { minX: -2048, maxX: 2048, minZ: -2048, maxZ: 2048 };
    this.config = { ...TERRAIN_DEFORMATION, ...config };
    this.pages = new Map();          // page key -> Float32Array signed deltas
    this.basePages = new Map();      // page key -> Float64Array cached base heights (NaN = unknown)
    this.dirty = new Set();          // "tx,tz" render contract
    this.tiles = new Set();          // "tx,tz" render contract
    this.dirtyKeys = new Set();      // numeric mirror of `dirty`
    this.tileKeys = new Set();       // numeric mirror of `tiles`
    // Numeric rows keep the hot GroundHeight path allocation-free.
    this.tileRows = new Map();
    // Static deform mask memo. CanDeform walks the collider grid; a single crater
    // asks it ~1000 times, so answers are kept until InvalidateAllowed()/Clear().
    this.allowedCache = new Map();
    // Last page touched. Relaxation walks neighbours, so consecutive lookups
    // land on the same page almost every time.
    this._pageKey = NaN; this._page = null;
    this.revision = 0;
    this.impacts = 0;
    this.lastImpact = null;
  }

  Key(tx, tz) { return `${tx},${tz}`; }
  Page(tx, tz) {
    const key = PageKey(tx, tz);
    if (key === this._pageKey) return this._page;
    this._pageKey = key;
    return this._page = this.pages.get(key) || null;
  }
  Node(ix, iz) {
    const n = this.config.tileCells;
    const tx = Math.floor(ix / n), tz = Math.floor(iz / n);
    const page = this.Page(tx, tz);
    return page ? page[(iz - tz * n) * n + ix - tx * n] : 0;
  }
  Allowed(ix, iz) {
    const key = NodeKey(ix, iz);
    let allowed = this.allowedCache.get(key);
    if (allowed === undefined) {
      const s = this.config.cellM, x = ix * s, z = iz * s, b = this.bounds;
      allowed = x > b.minX + s && x < b.maxX - s && z > b.minZ + s && z < b.maxZ - s && !!this.canDeform(x, z);
      this.allowedCache.set(key, allowed);
    }
    return allowed;
  }
  /** Colliders changed (destruction, editor): the protected-soil memo is stale. */
  InvalidateAllowed() { this.allowedCache.clear(); }
  MarkTile(tx, tz) {
    const key = PageKey(tx, tz);
    if (!this.dirtyKeys.has(key)) { this.dirtyKeys.add(key); this.dirty.add(this.Key(tx, tz)); }
    if (this.tileKeys.has(key)) return;
    this.tileKeys.add(key); this.tiles.add(this.Key(tx, tz));
    let row = this.tileRows.get(tz);
    if (!row) { row = new Set(); this.tileRows.set(tz, row); }
    row.add(tx);
  }
  SetNode(ix, iz, depth) {
    const n = this.config.tileCells;
    const tx = Math.floor(ix / n), tz = Math.floor(iz / n);
    let page = this.Page(tx, tz);
    if (!page) { page = new Float32Array(n * n); this.pages.set(PageKey(tx, tz), page); this._page = page; }
    const lx = ix - tx * n, lz = iz - tz * n;
    page[lz * n + lx] = depth;
    // Nodes on a tile seam belong to both meshes; normals need a one-cell halo.
    const x0 = lx === 0 ? tx - 1 : tx, x1 = lx === n - 1 ? tx + 1 : tx;
    const z0 = lz === 0 ? tz - 1 : tz, z1 = lz === n - 1 ? tz + 1 : tz;
    for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) this.MarkTile(x, z);
  }
  BasePage(tx, tz) {
    const key = PageKey(tx, tz);
    let page = this.basePages.get(key);
    if (!page) { page = new Float64Array(this.config.tileCells ** 2).fill(NaN); this.basePages.set(key, page); }
    return page;
  }
  BaseNodeHeight(ix, iz) {
    const n = this.config.tileCells, tx = Math.floor(ix / n), tz = Math.floor(iz / n);
    const page = this.BasePage(tx, tz), at = (iz - tz * n) * n + ix - tx * n;
    let height = page[at];
    if (height !== height) height = page[at] = this.base(ix * this.config.cellM, iz * this.config.cellM);
    return height;
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
    const s = this.config.cellM, n = this.config.tileCells, gx = x / s, gz = z / s;
    const ix = Math.floor(gx), iz = Math.floor(gz), u = gx - ix, v = gz - iz;
    const tx = Math.floor(ix / n), tz = Math.floor(iz / n), lx = ix - tx * n, lz = iz - tz * n;
    let a, b, c, d;
    if (lx < n - 1 && lz < n - 1) {
      // All four corners live on one page: read them straight from the arrays.
      const page = this.Page(tx, tz), bases = this.BasePage(tx, tz);
      const at = lz * n + lx;
      a = bases[at]; if (a !== a) a = bases[at] = this.base(ix * s, iz * s);
      b = bases[at + 1]; if (b !== b) b = bases[at + 1] = this.base((ix + 1) * s, iz * s);
      c = bases[at + n]; if (c !== c) c = bases[at + n] = this.base(ix * s, (iz + 1) * s);
      d = bases[at + n + 1]; if (d !== d) d = bases[at + n + 1] = this.base((ix + 1) * s, (iz + 1) * s);
      if (page) { a -= page[at]; b -= page[at + 1]; c -= page[at + n]; d -= page[at + n + 1]; }
    } else {
      a = this.NodeHeight(ix, iz); b = this.NodeHeight(ix + 1, iz);
      c = this.NodeHeight(ix, iz + 1); d = this.NodeHeight(ix + 1, iz + 1);
    }
    return u + v <= 1 ? a + u * (b - a) + v * (c - a)
      : d + (1 - u) * (c - d) + (1 - v) * (b - d);
  }
  /**
   * Copy one tile plus `halo` cells of surroundings into flat arrays
   * (width = tileCells + 1 + 2 * halo, row-major by z). `heights` receives the
   * deformed surface, `deltas` the signed displacement. Pages are visited once
   * each instead of once per vertex.
   */
  FillTile(tx, tz, halo, heights, deltas) {
    const n = this.config.tileCells, s = this.config.cellM, w = n + 1 + 2 * halo;
    const ix0 = tx * n - halo, iz0 = tz * n - halo, ix1 = ix0 + w - 1, iz1 = iz0 + w - 1;
    for (let ptz = Math.floor(iz0 / n); ptz * n <= iz1; ptz++) {
      for (let ptx = Math.floor(ix0 / n); ptx * n <= ix1; ptx++) {
        const page = this.pages.get(PageKey(ptx, ptz)), base = this.BasePage(ptx, ptz);
        const xa = Math.max(ix0, ptx * n), xb = Math.min(ix1, ptx * n + n - 1);
        const za = Math.max(iz0, ptz * n), zb = Math.min(iz1, ptz * n + n - 1);
        for (let iz = za; iz <= zb; iz++) {
          for (let ix = xa; ix <= xb; ix++) {
            const at = (iz - ptz * n) * n + ix - ptx * n, out = (iz - iz0) * w + ix - ix0;
            let b = base[at];
            if (b !== b) b = base[at] = this.base(ix * s, iz * s);
            const d = page ? page[at] : 0;
            deltas[out] = d; heights[out] = b - d;
          }
        }
      }
    }
    return w;
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
    const queue = [], changed = [], changedKeys = new Set(), caps = new Map();
    const reach = Math.ceil(maxDepthM / (maxAxisGrade * s)), step = maxAxisGrade * s;
    // Reserve a traversable ramp up to every protected foundation/boundary:
    // the cap is (rings to the nearest disallowed node) x grade. Rings are
    // scanned lazily and only as deep as the depth being asked for — a 13 cm
    // grenade dimple never needs the 26-ring scan a 2.4 m pit does — and the
    // scan resumes where it stopped when a later, deeper request arrives.
    // The clamped result is identical to a full scan: any block beyond the
    // requested depth could not have lowered min(target, cap).
    const Cap = (ix, iz, key, target) => {
      let entry = caps.get(key);
      if (!entry) { entry = { cap: maxDepthM, j: 0 }; caps.set(key, entry); }
      let j = entry.j;
      while (j < reach && (j + 1) * step < entry.cap && (j + 1) * step < target) {
        j++;
        for (let axis = 0; axis < 4; axis++) {
          if (!this.Allowed(ix + NEIGHBORS[axis][0] * j, iz + NEIGHBORS[axis][1] * j)) { entry.cap = j * step; break; }
        }
      }
      entry.j = j;
      return entry.cap;
    };
    const Lower = (ix, iz, target) => {
      const old = this.Node(ix, iz);
      if (target <= old + 0.00001 || !this.Allowed(ix, iz)) return;
      const key = NodeKey(ix, iz);
      const next = Math.min(target, Cap(ix, iz, key, target));
      if (next <= old + 0.00001) return;
      this.SetNode(ix, iz, next); queue.push(ix, iz);
      if (!changedKeys.has(key)) { changedKeys.add(key); changed.push(ix, iz); }
    };
    const phase = ValueNoise2(position.x * 0.71, position.z * 0.71, 8317) * Math.PI * 2;
    for (let iz = Math.floor((position.z - radius * 1.2) / s); iz <= Math.ceil((position.z + radius * 1.2) / s); iz++) {
      for (let ix = Math.floor((position.x - radius * 1.2) / s); ix <= Math.ceil((position.x + radius * 1.2) / s); ix++) {
        const dx = ix * s - position.x, dz = iz * s - position.z;
        // Broad asymmetric breakouts survive slope relaxation; fine noise alone
        // disappeared into a smooth circular bowl after a few overlapping shells.
        const angle = Math.atan2(dz, dx);
        const contour = 0.96 + 0.1 * Math.sin(angle * 3 + phase) + 0.055 * Math.sin(angle * 7 - phase)
          + 0.07 * (ValueNoise2(ix * s * 1.3, iz * s * 1.3, 8317) - 0.5);
        const r = Math.hypot(dx, dz) / (radius * contour);
        if (r >= 1) continue;
        const rough = 0.88 + 0.12 * ValueNoise2(ix * 0.51, iz * 0.51, 1938);
        Lower(ix, iz, this.Node(ix, iz) + depth * (1 - r * r) ** 2 * rough);
      }
    }
    // Monotone relaxation: overlapping blasts can deepen and widen, never heal.
    for (let head = 0; head < queue.length; head += 2) {
      const ix = queue[head], iz = queue[head + 1], depthHere = this.Node(ix, iz);
      for (const [dx, dz, dd] of NEIGHBORS) Lower(ix + dx, iz + dz, depthHere - maxAxisGrade * s * dd);
    }
    if (!changed.length) return null;
    const rimNodes = this.RaiseRim(changed, depth);
    this.revision++; this.impacts++;
    this.lastImpact = { id, x: position.x, z: position.z, radius, changedNodes: changed.length / 2, rimNodes,
      depth: this.base(position.x, position.z) - this.GroundHeight(position.x, position.z), revision: this.revision };
    return this.lastImpact;
  }
  /** `changed` is a flat [ix, iz, ...] list of freshly excavated nodes. */
  RaiseRim(changed, blastDepth) {
    const { cellM: s, maxAxisGrade, maxRimM, rimWidthM } = this.config;
    const entries = new Map(), queue = [];
    const Visit = (x, z, distance) => {
      const key = NodeKey(x, z), known = entries.get(key);
      if (distance >= rimWidthM || distance >= (known ? known.distance : Infinity)
        || this.Node(x, z) > 0 || !this.Allowed(x, z)) return;
      const entry = { x, z, distance, height: 0 }; entries.set(key, entry); queue.push(entry);
    };
    // Follow the actual excavation boundary, including merged/deepened pits.
    for (let i = 0; i < changed.length; i += 2) {
      const x = changed[i], z = changed[i + 1];
      if (this.Node(x, z) <= 0) continue;
      for (const [dx, dz, dd] of NEIGHBORS) Visit(x + dx, z + dz, s * dd);
    }
    for (let head = 0; head < queue.length; head++) {
      const { x, z, distance } = queue[head];
      for (const [dx, dz, dd] of NEIGHBORS) Visit(x + dx, z + dz, distance + s * dd);
    }
    const rim = [...entries.values()];
    for (const entry of rim) {
      const rough = 0.35 + 0.65 * ValueNoise2(entry.x * s * 2.3, entry.z * s * 2.3, 6319);
      entry.old = -this.Node(entry.x, entry.z);
      entry.height = Math.max(entry.old, Math.min(maxRimM, blastDepth * 0.36)
        * Math.sin(Math.PI * entry.distance / rimWidthM) ** 2 * rough);
      // Neighbours are resolved once. Those outside the rim never move during
      // relaxation, so their bound folds into one constant per node.
      entry.links = []; entry.limit = Infinity;
      for (const [dx, dz, dd] of NEIGHBORS) {
        const x = entry.x + dx, z = entry.z + dz, neighbor = entries.get(NodeKey(x, z)), w = maxAxisGrade * s * dd;
        if (neighbor) entry.links.push(neighbor, w);
        else entry.limit = Math.min(entry.limit, -this.Node(x, z) + w);
      }
    }
    // Constrain both sides of the raised lip to the same walkable slope bound.
    // Relaxation only reduces proposed NEW deposition, never raises a pit floor.
    let unsettled = true;
    while (unsettled) {
      unsettled = false;
      for (const entry of rim) {
        let next = Math.min(entry.height, entry.limit);
        const links = entry.links;
        for (let i = 0; i < links.length; i += 2) {
          const bound = links[i].height + links[i + 1];
          if (bound < next) next = bound;
        }
        next = Math.max(entry.old, next);
        if (next < entry.height - 0.00001) { entry.height = next; unsettled = true; }
      }
    }
    let count = 0;
    for (const entry of rim) if (entry.height > entry.old + 0.00001) {
      this.SetNode(entry.x, entry.z, -entry.height); count++;
    }
    return count;
  }
  TakeDirty() { const keys = [...this.dirty]; this.dirty.clear(); this.dirtyKeys.clear(); return keys; }
  State() { return { revision: this.revision, impacts: this.impacts, tiles: this.tiles.size, pages: this.pages.size,
    bytes: this.pages.size * this.config.tileCells ** 2 * 4, maxDepthM: this.config.maxDepthM, lastImpact: this.lastImpact }; }
  Clear() {
    this.pages.clear(); this.basePages.clear(); this.dirty.clear(); this.tiles.clear();
    this.dirtyKeys.clear(); this.tileKeys.clear(); this.tileRows.clear(); this.allowedCache.clear();
    this._pageKey = NaN; this._page = null;
    this.revision++; this.impacts = 0; this.lastImpact = null;
  }
}
