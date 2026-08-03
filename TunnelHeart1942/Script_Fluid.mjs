/**
 * Dig-coupled 2D fluid — Eulerian mass/velocity on the soil grid + free-surface paint.
 *
 * Gameplay: water only occupies AIR; sealed cells and SOFT/HARD are solid walls.
 * Visuals: column free-surface + soft SDF falloff + foam particles (no external deps).
 */

import { AIR, GetCell, InBounds, WorldToCell } from "./Script_Dig.mjs";

const ITER = 16;
const GRAVITY = 520;
const MAX_PARTICLES = 900;

export function EnsureSealGrid(soil) {
  if (!soil) return null;
  if (soil.seal && soil.seal.length === soil.rows) return soil.seal;
  soil.seal = Array.from({ length: soil.rows }, () => new Array(soil.cols).fill(false));
  return soil.seal;
}

export function IsSealed(soil, c, r) {
  if (!soil?.seal || !InBounds(soil, c, r)) return false;
  return !!soil.seal[r][c];
}

export function SetSealed(soil, c, r, on = true) {
  EnsureSealGrid(soil);
  if (!InBounds(soil, c, r)) return false;
  if (GetCell(soil, c, r) !== AIR) return false;
  soil.seal[r][c] = !!on;
  return true;
}

/** Solid for fluid: dirt / rock / sealed mouth plugs. */
export function FluidBlocked(soil, c, r) {
  if (!InBounds(soil, c, r)) return true;
  if (GetCell(soil, c, r) !== AIR) return true;
  return IsSealed(soil, c, r);
}

export function CreateFluidField(soil) {
  EnsureSealGrid(soil);
  const { cols, rows } = soil;
  const dens = Array.from({ length: rows }, () => new Float32Array(cols));
  const vx = Array.from({ length: rows }, () => new Float32Array(cols));
  const vy = Array.from({ length: rows }, () => new Float32Array(cols));
  const div = Array.from({ length: rows }, () => new Float32Array(cols));
  const p = Array.from({ length: rows }, () => new Float32Array(cols));
  return {
    cols,
    rows,
    dens,
    vx,
    vy,
    div,
    p,
    particles: [],
    time: 0,
    totalInjected: 0,
  };
}

function Clamp01(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function Sample(grid, c, r, rows, cols) {
  if (r < 0 || c < 0 || r >= rows || c >= cols) return 0;
  return grid[r][c];
}

function AdvectScalar(src, out, vx, vy, soil, dt) {
  const { rows, cols, cell, originX, originY } = soil;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (FluidBlocked(soil, c, r)) {
        out[r][c] = 0;
        continue;
      }
      const x = originX + (c + 0.5) * cell - vx[r][c] * dt;
      const y = originY + (r + 0.5) * cell - vy[r][c] * dt;
      const fc = (x - originX) / cell - 0.5;
      const fr = (y - originY) / cell - 0.5;
      const c0 = Math.floor(fc);
      const r0 = Math.floor(fr);
      const tx = fc - c0;
      const ty = fr - r0;
      const a = Sample(src, c0, r0, rows, cols);
      const b = Sample(src, c0 + 1, r0, rows, cols);
      const d = Sample(src, c0, r0 + 1, rows, cols);
      const e = Sample(src, c0 + 1, r0 + 1, rows, cols);
      // Discard samples from solid cells (keep mass in open tunnels).
      const wa = FluidBlocked(soil, c0, r0) ? 0 : 1;
      const wb = FluidBlocked(soil, c0 + 1, r0) ? 0 : 1;
      const wd = FluidBlocked(soil, c0, r0 + 1) ? 0 : 1;
      const we = FluidBlocked(soil, c0 + 1, r0 + 1) ? 0 : 1;
      const wsum = wa * (1 - tx) * (1 - ty) + wb * tx * (1 - ty) + wd * (1 - tx) * ty + we * tx * ty;
      out[r][c] = wsum > 1e-6
        ? (a * wa * (1 - tx) * (1 - ty) + b * wb * tx * (1 - ty) + d * wd * (1 - tx) * ty + e * we * tx * ty) / wsum
        : src[r][c];
    }
  }
}

function Project(field, soil) {
  const { dens, vx, vy, div, p, rows, cols } = field;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (FluidBlocked(soil, c, r) || dens[r][c] < 0.02) {
        div[r][c] = 0;
        p[r][c] = 0;
        continue;
      }
      const vl = FluidBlocked(soil, c - 1, r) ? vx[r][c] : vx[r][c - 1];
      const vr = FluidBlocked(soil, c + 1, r) ? vx[r][c] : vx[r][c + 1];
      const vt = FluidBlocked(soil, c, r - 1) ? vy[r][c] : vy[r - 1][c];
      const vb = FluidBlocked(soil, c, r + 1) ? vy[r][c] : vy[r + 1][c];
      div[r][c] = -0.5 * (vr - vl + vb - vt);
      p[r][c] = 0;
    }
  }
  for (let k = 0; k < ITER; k++) {
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (FluidBlocked(soil, c, r) || dens[r][c] < 0.02) {
          p[r][c] = 0;
          continue;
        }
        const pl = FluidBlocked(soil, c - 1, r) ? p[r][c] : p[r][c - 1];
        const pr = FluidBlocked(soil, c + 1, r) ? p[r][c] : p[r][c + 1];
        const pt = FluidBlocked(soil, c, r - 1) ? p[r][c] : p[r - 1][c];
        const pb = FluidBlocked(soil, c, r + 1) ? p[r][c] : p[r + 1][c];
        p[r][c] = (div[r][c] + pl + pr + pt + pb) * 0.25;
      }
    }
  }
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (FluidBlocked(soil, c, r)) {
        vx[r][c] = 0;
        vy[r][c] = 0;
        continue;
      }
      if (dens[r][c] < 0.02) continue;
      const pl = FluidBlocked(soil, c - 1, r) ? p[r][c] : p[r][c - 1];
      const pr = FluidBlocked(soil, c + 1, r) ? p[r][c] : p[r][c + 1];
      const pt = FluidBlocked(soil, c, r - 1) ? p[r][c] : p[r - 1][c];
      const pb = FluidBlocked(soil, c, r + 1) ? p[r][c] : p[r + 1][c];
      vx[r][c] -= 0.5 * (pr - pl);
      vy[r][c] -= 0.5 * (pb - pt);
    }
  }
}

function EnforceBounds(field, soil) {
  const { dens, vx, vy, rows, cols } = field;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (FluidBlocked(soil, c, r)) {
        dens[r][c] = 0;
        vx[r][c] = 0;
        vy[r][c] = 0;
        continue;
      }
      dens[r][c] = Clamp01(dens[r][c]);
      // Hydrostatic settle: denser cells push sideways into emptier neighbors.
      if (dens[r][c] > 0.15) {
        if (!FluidBlocked(soil, c, r + 1) && dens[r + 1][c] < dens[r][c]) {
          const move = Math.min(0.08, dens[r][c] - dens[r + 1][c]) * 0.35;
          dens[r][c] -= move;
          dens[r + 1][c] = Clamp01(dens[r + 1][c] + move);
          vy[r][c] += 40;
        }
        for (const dc of [-1, 1]) {
          if (FluidBlocked(soil, c + dc, r)) continue;
          if (dens[r][c + dc] + 0.05 >= dens[r][c]) continue;
          const move = Math.min(0.05, dens[r][c] - dens[r][c + dc]) * 0.25;
          dens[r][c] -= move;
          dens[r][c + dc] = Clamp01(dens[r][c + dc] + move);
          vx[r][c] += dc * 30;
        }
      }
      const spd = Math.hypot(vx[r][c], vy[r][c]);
      if (spd > 280) {
        vx[r][c] *= 280 / spd;
        vy[r][c] *= 280 / spd;
      }
    }
  }
}

function SpawnFoam(field, soil, c, r, n = 2) {
  if (field.particles.length >= MAX_PARTICLES) return;
  const cell = soil.cell;
  const x0 = soil.originX + c * cell;
  const y0 = soil.originY + r * cell;
  for (let i = 0; i < n && field.particles.length < MAX_PARTICLES; i++) {
    field.particles.push({
      x: x0 + Math.random() * cell,
      y: y0 + Math.random() * cell * 0.6,
      vx: (Math.random() - 0.5) * 60 + field.vx[r][c] * 0.2,
      vy: -40 - Math.random() * 80 + field.vy[r][c] * 0.15,
      life: 0.35 + Math.random() * 0.55,
      r: 1.5 + Math.random() * 2.5,
    });
  }
}

/**
 * @param {object} field
 * @param {object} soil
 * @param {number} dt
 * @param {{ c:number, r:number, rate:number }[]} inlets  inject density into open AIR
 */
export function StepFluid(field, soil, dt, inlets = []) {
  if (!field || !soil) return;
  const step = Math.min(0.033, Math.max(0, dt));
  field.time += step;
  const { dens, vx, vy, rows, cols } = field;

  // Forces
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (FluidBlocked(soil, c, r)) continue;
      if (dens[r][c] < 0.01) {
        vx[r][c] *= 0.5;
        vy[r][c] *= 0.5;
        continue;
      }
      vy[r][c] += GRAVITY * step * (0.55 + dens[r][c] * 0.45);
      vx[r][c] *= 0.985;
      vy[r][c] *= 0.99;
    }
  }

  for (const inn of inlets) {
    if (!inn || FluidBlocked(soil, inn.c, inn.r)) continue;
    const add = (inn.rate || 0.4) * step;
    dens[inn.r][inn.c] = Clamp01(dens[inn.r][inn.c] + add);
    vy[inn.r][inn.c] += 90 * step;
    field.totalInjected += add;
    if (Math.random() < 0.45) SpawnFoam(field, soil, inn.c, inn.r, 3);
  }

  const tmpD = Array.from({ length: rows }, () => new Float32Array(cols));
  const tmpVx = Array.from({ length: rows }, () => new Float32Array(cols));
  const tmpVy = Array.from({ length: rows }, () => new Float32Array(cols));
  AdvectScalar(dens, tmpD, vx, vy, soil, step);
  AdvectScalar(vx, tmpVx, vx, vy, soil, step);
  AdvectScalar(vy, tmpVy, vx, vy, soil, step);
  for (let r = 0; r < rows; r++) {
    dens[r].set(tmpD[r]);
    vx[r].set(tmpVx[r]);
    vy[r].set(tmpVy[r]);
  }
  Project(field, soil);
  EnforceBounds(field, soil);

  // Foam from fast shear
  for (let r = 1; r < rows - 1; r++) {
    for (let c = 1; c < cols - 1; c++) {
      if (dens[r][c] < 0.35) continue;
      const spd = Math.hypot(vx[r][c], vy[r][c]);
      if (spd > 90 && Math.random() < 0.08) SpawnFoam(field, soil, c, r, 1);
    }
  }

  const next = [];
  for (const p of field.particles) {
    p.life -= step;
    if (p.life <= 0) continue;
    p.vy += GRAVITY * 0.55 * step;
    p.x += p.vx * step;
    p.y += p.vy * step;
    const { c, r } = WorldToCell(soil, p.x, p.y);
    if (FluidBlocked(soil, c, r)) {
      p.vy *= -0.25;
      p.y -= 4;
      p.life *= 0.6;
    }
    next.push(p);
  }
  field.particles = next;
}

export function FluidFillAtWorld(field, soil, x, y) {
  if (!field || !soil) return 0;
  const { c, r } = WorldToCell(soil, x, y);
  if (!InBounds(soil, c, r)) return 0;
  return field.dens[r][c] || 0;
}

/** Column free-surface Y in world space (top of water), or null if dry. */
export function FluidSurfaceY(field, soil, c) {
  if (!field || !soil || c < 0 || c >= soil.cols) return null;
  let acc = 0;
  let top = null;
  for (let r = soil.rows - 1; r >= 0; r--) {
    const d = field.dens[r][c];
    if (d < 0.08) continue;
    acc += d;
    const fill = Math.min(1, d);
    top = soil.originY + r * soil.cell + soil.cell * (1 - fill);
  }
  return acc > 0.12 ? top : null;
}

/**
 * Paint free-surface water into an existing cutaway. Expects world→screen helpers.
 * @param {*} ctx
 * @param {*} field
 * @param {*} soil
 * @param {{ WX:(x:number)=>number, WY:(y:number)=>number, scale:number, cam0:number, cam1:number, night?:boolean }} view
 */
export function DrawFluidField(ctx, field, soil, view) {
  if (!field || !soil) return;
  const { WX, WY, scale: s, cam0, cam1, night } = view;
  const cell = soil.cell;
  const t = field.time;

  ctx.save();
  for (let c = 0; c < soil.cols; c++) {
    const x0 = soil.originX + c * cell;
    if (x0 + cell < cam0 || x0 > cam1) continue;
    // Build bottom-up segments of wet cells for a continuous column look.
    let runStart = -1;
    let runFill = 0;
    const flush = (rEnd) => {
      if (runStart < 0) return;
      const yBot = soil.originY + (rEnd + 1) * cell;
      const yTop = soil.originY + runStart * cell + cell * (1 - Math.min(1, runFill));
      const wave =
        Math.sin(t * 3.1 + c * 0.55) * 2.2 + Math.sin(t * 5.4 + c * 1.3) * 1.1;
      const sx = WX(x0);
      const syTop = WY(yTop + wave);
      const syBot = WY(yBot);
      const sw = cell * s;
      const sh = Math.max(1, syBot - syTop);
      const g = ctx.createLinearGradient(0, syTop, 0, syBot);
      if (night) {
        g.addColorStop(0, "rgba(120,190,210,.22)");
        g.addColorStop(0.35, "rgba(40,110,140,.55)");
        g.addColorStop(1, "rgba(12,40,60,.78)");
      } else {
        g.addColorStop(0, "rgba(150,210,220,.28)");
        g.addColorStop(0.4, "rgba(50,130,150,.58)");
        g.addColorStop(1, "rgba(20,60,80,.8)");
      }
      ctx.fillStyle = g;
      // Soft top lip (cheap SDF falloff).
      ctx.globalAlpha = 1;
      ctx.fillRect(sx, syTop, sw + 0.5, sh);
      ctx.fillStyle = night ? "rgba(200,230,240,.55)" : "rgba(220,245,250,.65)";
      ctx.fillRect(sx, syTop, sw + 0.5, Math.max(1.2, 2.4 * s));
      // Caustic ticks
      ctx.strokeStyle = "rgba(255,255,255,.12)";
      ctx.lineWidth = 1;
      for (let i = 0; i < 2; i++) {
        const yy = syTop + sh * (0.35 + i * 0.25) + Math.sin(t * 2 + c + i) * 3 * s;
        ctx.beginPath();
        ctx.moveTo(sx + 2, yy);
        ctx.lineTo(sx + sw - 2, yy + Math.sin(t * 4 + c) * 2 * s);
        ctx.stroke();
      }
      runStart = -1;
      runFill = 0;
    };

    for (let r = 0; r < soil.rows; r++) {
      const d = field.dens[r][c];
      if (d < 0.08 || FluidBlocked(soil, c, r)) {
        if (runStart >= 0) flush(r - 1);
        continue;
      }
      if (runStart < 0) {
        runStart = r;
        runFill = d;
      } else {
        runFill = Math.max(runFill, d);
      }
    }
    if (runStart >= 0) flush(soil.rows - 1);
  }

  // Foam / spray particles
  for (const p of field.particles) {
    const px = WX(p.x);
    const py = WY(p.y);
    ctx.globalAlpha = Math.max(0, Math.min(0.85, p.life * 1.4));
    ctx.fillStyle = night ? "rgba(200,220,230,.9)" : "rgba(240,250,255,.95)";
    ctx.beginPath();
    ctx.arc(px, py, p.r * s, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}

/** Seal plugs drawn as timber / clay caps in AIR cells. */
export function DrawSealPlugs(ctx, soil, view) {
  if (!soil?.seal) return;
  const { WX, WY, scale: s, cam0, cam1 } = view;
  for (let r = 0; r < soil.rows; r++) {
    for (let c = 0; c < soil.cols; c++) {
      if (!soil.seal[r][c]) continue;
      const rect = {
        x: soil.originX + c * soil.cell,
        y: soil.originY + r * soil.cell,
        w: soil.cell,
        h: soil.cell,
      };
      if (rect.x + rect.w < cam0 || rect.x > cam1) continue;
      const x = WX(rect.x + 4);
      const y = WY(rect.y + 6);
      const w = (rect.w - 8) * s;
      const h = (rect.h - 12) * s;
      ctx.fillStyle = "#6a4a28";
      ctx.strokeStyle = "#1a1410";
      ctx.lineWidth = Math.max(1.5, 2 * s);
      ctx.fillRect(x, y, w, h);
      ctx.strokeRect(x, y, w, h);
      ctx.strokeStyle = "rgba(40,24,12,.5)";
      ctx.beginPath();
      ctx.moveTo(x + 3, y + h * 0.35);
      ctx.lineTo(x + w - 3, y + h * 0.35);
      ctx.moveTo(x + 3, y + h * 0.65);
      ctx.lineTo(x + w - 3, y + h * 0.65);
      ctx.stroke();
    }
  }
}
