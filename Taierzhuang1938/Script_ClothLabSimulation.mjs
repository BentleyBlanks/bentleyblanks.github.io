// Wind is applied only to the lab's private grid. Surface density changes acceleration,
// never gravity; aerodynamic force follows the actual deformed surface normal.
import { CLOTH_LAB_SIM as S } from './Data_Tuning_ClothRange.mjs';

/** Position-level Coulomb contact, installed on one laboratory grid only.
 * The production solver retains its own ground damping and body-drag contract.
 * Normal and tangential projection multipliers live for a single substep, so
 * static contact opposes constraint-driven creep as well as predicted velocity.
 */
export class ClothLabContactFriction {
  constructor(cloth, { GetCoefficient = () => cloth.cfg.groundFriction } = {}) {
    this.cloth = cloth; this.GetCoefficient = GetCoefficient;
    this.before = new Float32Array(cloth.n * 3);
    this.normalLambda = new Float32Array(cloth.n);
    this.tangentLambda = new Float32Array(cloth.n * 3);
    this.contactId = new Int16Array(cloth.n).fill(-1);
    this.surfaceMotion = []; this.previousSurfaces = new Map(); this.disposed = false;
    this.metrics = { contacts: 0, sticking: 0, sliding: 0, ground: 0, body: 0, correctionsM: 0 };
    this.originalSubstep = cloth._Substep; this.originalCollide = cloth._Collide;
    this.substepWrapper = h => this.Substep(h);
    this.collideWrapper = (last, h) => this.Collide(last, h);
    cloth._Substep = this.substepWrapper; cloth._Collide = this.collideWrapper;
  }
  Reset() {
    this.normalLambda.fill(0); this.tangentLambda.fill(0); this.contactId.fill(-1);
    this.previousSurfaces.clear(); this.surfaceMotion = [];
    for (const key of Object.keys(this.metrics)) this.metrics[key] = 0;
  }
  /** Translation is measured over the caller's simulation frame, never per solver iteration.
   * Supply stable ids when a collider's index can change; omission preserves existing list order.
   */
  SetColliders(list, dt = S.stepS) {
    const next = new Map(), validDt = Number.isFinite(dt) && dt > 0 ? dt : S.stepS;
    this.surfaceMotion = list.map((entry, index) => {
      const id = entry.id ?? index;
      const center = [(entry.a.x + entry.b.x) * 0.5, (entry.a.y + entry.b.y) * 0.5, (entry.a.z + entry.b.z) * 0.5];
      const previous = this.previousSurfaces.get(id), velocity = [0, 0, 0];
      if (previous) {
        for (let k = 0; k < 3; k++) velocity[k] = (center[k] - previous[k]) / validDt;
        const speed = Math.hypot(...velocity);
        if (speed > S.frictionMaxSurfaceSpeedMps) for (let k = 0; k < 3; k++) velocity[k] *= S.frictionMaxSurfaceSpeedMps / speed;
      }
      next.set(id, center); return velocity;
    });
    this.previousSurfaces = next; this.cloth.SetColliders(list);
  }
  Substep(h) {
    const cloth = this.cloth;
    this.normalLambda.fill(0); this.tangentLambda.fill(0); this.contactId.fill(-1);
    for (const key of Object.keys(this.metrics)) this.metrics[key] = 0;
    const value = Number(this.GetCoefficient());
    this.mu = Number.isFinite(value) ? Math.max(0, Math.min(S.frictionMaxCoefficient, value)) : 0;
    // The UI value is a coefficient here, not the legacy per-substep velocity loss.
    const legacyFriction = cloth.cfg.groundFriction;
    cloth.cfg.groundFriction = 0;
    try { this.originalSubstep.call(cloth, h); }
    finally { cloth.cfg.groundFriction = legacyFriction; }
  }
  Collide(last, h) {
    const cloth = this.cloth, x = cloth.x, p = cloth.p, before = this.before;
    before.set(x); this.originalCollide.call(cloth, last, h);
    if (!(this.mu > 0)) return;
    const slop = S.frictionContactSlopM, margin = cloth.cfg.bodyMarginM;
    for (let i = 0; i < cloth.n; i++) {
      if (!cloth.inv[i]) continue;
      const o = i * 3;
      let id = -1, nx = 0, ny = 1, nz = 0, penetration = 0, bestGap = Infinity;
      let cx = 0, cy = 0, cz = 0, radius = 0;
      const groundGap = x[o + 1] - cloth.groundY[i];
      if (groundGap <= slop) { id = 0; bestGap = Math.abs(groundGap); penetration = Math.max(0, cloth.groundY[i] - before[o + 1]); }
      for (let k = 0; k < cloth.colliders.length; k++) {
        const b = cloth.colliders[k], r = b.r + margin;
        if (x[o] < b.minX - r - slop || x[o] > b.maxX + r + slop || x[o + 2] < b.minZ - r - slop || x[o + 2] > b.maxZ + r + slop || x[o + 1] > b.maxY + r + slop) continue;
        const ax = b.bx - b.ax, ay = b.by - b.ay, az = b.bz - b.az, length2 = ax * ax + ay * ay + az * az;
        const t = length2 > 1e-12 ? Math.max(0, Math.min(1, ((x[o] - b.ax) * ax + (x[o + 1] - b.ay) * ay + (x[o + 2] - b.az) * az) / length2)) : 0;
        const qx = b.ax + ax * t, qy = b.ay + ay * t, qz = b.az + az * t;
        const dx = x[o] - qx, dy = x[o + 1] - qy, dz = x[o + 2] - qz, distance = Math.hypot(dx, dy, dz), gap = Math.abs(distance - r);
        if (gap > slop || gap >= bestGap || distance < 1e-9) continue;
        id = k + 1; bestGap = gap; nx = dx / distance; ny = dy / distance; nz = dz / distance;
        penetration = Math.max(0, (x[o] - before[o]) * nx + (x[o + 1] - before[o + 1]) * ny + (x[o + 2] - before[o + 2]) * nz);
        cx = qx; cy = qy; cz = qz; radius = r;
      }
      if (id < 0) { this.contactId[i] = -1; this.normalLambda[i] = 0; this.tangentLambda.fill(0, o, o + 3); continue; }
      if (this.contactId[i] !== id) { this.normalLambda[i] = 0; this.tangentLambda.fill(0, o, o + 3); this.contactId[i] = id; }
      this.normalLambda[i] += penetration;
      const motion = id > 0 ? this.surfaceMotion[id - 1] : null;
      let dx = x[o] - p[o] - (motion?.[0] || 0) * h;
      let dy = x[o + 1] - p[o + 1] - (motion?.[1] || 0) * h;
      let dz = x[o + 2] - p[o + 2] - (motion?.[2] || 0) * h;
      const normalDisplacement = dx * nx + dy * ny + dz * nz;
      dx -= normalDisplacement * nx; dy -= normalDisplacement * ny; dz -= normalDisplacement * nz;
      const oldX = this.tangentLambda[o], oldY = this.tangentLambda[o + 1], oldZ = this.tangentLambda[o + 2];
      let tx = oldX - dx, ty = oldY - dy, tz = oldZ - dz;
      const normalLambda = tx * nx + ty * ny + tz * nz;
      tx -= normalLambda * nx; ty -= normalLambda * ny; tz -= normalLambda * nz;
      const demand = Math.hypot(tx, ty, tz), staticLimit = this.mu * this.normalLambda[i];
      const sticking = demand <= staticLimit;
      if (!sticking && demand > 0) {
        const scale = Math.min(1, staticLimit * S.frictionDynamicRatio / demand);
        tx *= scale; ty *= scale; tz *= scale;
      }
      const fx = tx - oldX, fy = ty - oldY, fz = tz - oldZ;
      x[o] += fx; x[o + 1] += fy; x[o + 2] += fz;
      this.tangentLambda[o] = tx; this.tangentLambda[o + 1] = ty; this.tangentLambda[o + 2] = tz;
      // A tangent correction is a chord on a curved support. Restore nonpenetration,
      // without counting this geometric repair as additional friction capacity.
      if (id > 0) {
        const b = cloth.colliders[id - 1], ax = b.bx - b.ax, ay = b.by - b.ay, az = b.bz - b.az;
        const axisLength2 = ax * ax + ay * ay + az * az;
        const t = axisLength2 > 1e-12 ? Math.max(0, Math.min(1, ((x[o] - b.ax) * ax + (x[o + 1] - b.ay) * ay + (x[o + 2] - b.az) * az) / axisLength2)) : 0;
        cx = b.ax + ax * t; cy = b.ay + ay * t; cz = b.az + az * t;
        const dx = x[o] - cx, dy = x[o + 1] - cy, dz = x[o + 2] - cz, length = Math.hypot(dx, dy, dz);
        if (length < radius && length > 1e-9) { const scale = radius / length; x[o] = cx + dx * scale; x[o + 1] = cy + dy * scale; x[o + 2] = cz + dz * scale; }
      }
      if (x[o + 1] < cloth.groundY[i]) x[o + 1] = cloth.groundY[i];
      if (last) {
        this.metrics.contacts++; this.metrics[sticking ? 'sticking' : 'sliding']++;
        this.metrics[id ? 'body' : 'ground']++;
      }
      this.metrics.correctionsM += Math.hypot(fx, fy, fz);
    }
  }
  Stats() { return { ...this.metrics, coefficient: this.mu ?? 0 }; }
  Dispose() {
    if (this.disposed) return;
    if (this.cloth._Substep === this.substepWrapper) this.cloth._Substep = this.originalSubstep;
    if (this.cloth._Collide === this.collideWrapper) this.cloth._Collide = this.originalCollide;
    this.Reset(); this.disposed = true;
  }
}

export function ApplyClothWind(cloth, cfg, time, dt, gust = 0) {
  const x = cloth.x, v = cloth.v, rows = cloth.rows, cols = cloth.cols;
  const speed = cfg.wind + gust;
  if (speed <= 0) return;
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const i = r * cols + c, o = i * 3;
    if (!cloth.inv[i]) continue;
    const a = (r * cols + Math.max(0, c - 1)) * 3, b = (r * cols + Math.min(cols - 1, c + 1)) * 3;
    const d = (Math.max(0, r - 1) * cols + c) * 3, e = (Math.min(rows - 1, r + 1) * cols + c) * 3;
    const ax = x[b] - x[a], ay = x[b + 1] - x[a + 1], az = x[b + 2] - x[a + 2];
    const bx = x[e] - x[d], by = x[e + 1] - x[d + 1], bz = x[e + 2] - x[d + 2];
    let nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
    const length = Math.hypot(nx, ny, nz);
    if (length < 1e-8) continue;
    nx /= length; ny /= length; nz /= length;
    const flutter = 0.75 + 0.25 * Math.sin(time * 2.8 + r * 0.43 + c * 0.21);
    const relative = (speed * 0.3 - v[o]) * nx + (speed * 0.12 - v[o + 1]) * ny + (speed * flutter - v[o + 2]) * nz;
    const force = Math.max(-S.windAccelerationMax, Math.min(S.windAccelerationMax,
      S.pressure * relative * Math.abs(relative) / Math.max(0.1, cfg.density)));
    v[o] += nx * force * dt; v[o + 1] += ny * force * dt; v[o + 2] += nz * force * dt;
  }
}
