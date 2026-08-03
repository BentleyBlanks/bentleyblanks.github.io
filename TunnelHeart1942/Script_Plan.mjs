/**
 * Tunnel dig + optional blueprint.
 * Free dig: soft cells that already touch AIR (tunnel lip) can be carved immediately.
 * Blueprint: optional long-route marks / corridor stamps — not a hard gate.
 */

import {
  AIR,
  CellCenter,
  CellWorldRect,
  GetCell,
  HARD,
  InBounds,
  SOFT,
  WorldToCell,
} from "./Script_Dig.mjs";

export function EnsurePlanGrid(soil) {
  if (!soil) return null;
  if (soil.plan && soil.plan.length === soil.rows) return soil.plan;
  soil.plan = [];
  for (let r = 0; r < soil.rows; r++) {
    soil.plan.push(new Array(soil.cols).fill(false));
  }
  return soil.plan;
}

export function IsPlanned(soil, c, r) {
  if (!soil?.plan || !InBounds(soil, c, r)) return false;
  return !!soil.plan[r][c];
}

export function ClearPlanCell(soil, c, r) {
  EnsurePlanGrid(soil);
  if (!InBounds(soil, c, r)) return false;
  if (!soil.plan[r][c]) return false;
  soil.plan[r][c] = false;
  return true;
}

/** Plan must grow from AIR or another planned cell (connected tunnel design). */
export function CanPlanCell(soil, c, r) {
  if (!InBounds(soil, c, r)) return false;
  if (GetCell(soil, c, r) !== SOFT) return false;
  if (IsPlanned(soil, c, r)) return true;
  const dirs = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];
  for (const [dc, dr] of dirs) {
    const nc = c + dc;
    const nr = r + dr;
    if (!InBounds(soil, nc, nr)) continue;
    if (GetCell(soil, nc, nr) === AIR) return true;
    if (IsPlanned(soil, nc, nr)) return true;
  }
  return false;
}

export function TogglePlanCell(soil, c, r) {
  EnsurePlanGrid(soil);
  if (!InBounds(soil, c, r)) return false;
  if (GetCell(soil, c, r) !== SOFT) return false;
  if (soil.plan[r][c]) {
    soil.plan[r][c] = false;
    return "erase";
  }
  if (!CanPlanCell(soil, c, r)) return false;
  soil.plan[r][c] = true;
  return "mark";
}

/** Stamp a chamber blueprint (soft cells only, must connect). */
export function StampChamberPlan(soil, c0, r0, w = 2, h = 2) {
  EnsurePlanGrid(soil);
  let n = 0;
  for (let r = r0; r < r0 + h; r++) {
    for (let c = c0; c < c0 + w; c++) {
      if (!InBounds(soil, c, r)) continue;
      if (GetCell(soil, c, r) !== SOFT) continue;
      if (soil.plan[r][c]) continue;
      if (!CanPlanCell(soil, c, r) && n === 0) {
        // allow first cell of stamp if any neighbor of stamp region touches air/plan
        let ok = false;
        for (let rr = r0; rr < r0 + h && !ok; rr++) {
          for (let cc = c0; cc < c0 + w && !ok; cc++) {
            if (CanPlanCell(soil, cc, rr) || IsPlanned(soil, cc, rr) || GetCell(soil, cc, rr) === AIR) ok = true;
          }
        }
        if (!ok) continue;
      }
      if (CanPlanCell(soil, c, r) || n > 0) {
        // after first mark, subsequent cells of stamp can attach to newly planned
        if (!soil.plan[r][c] && (CanPlanCell(soil, c, r) || n > 0)) {
          // force-connect: if adjacent to any cell we'll mark / marked
          soil.plan[r][c] = true;
          n += 1;
        }
      }
    }
  }
  // Second pass — fill remaining soft in rect that now connects
  for (let pass = 0; pass < 4; pass++) {
    for (let r = r0; r < r0 + h; r++) {
      for (let c = c0; c < c0 + w; c++) {
        if (!InBounds(soil, c, r)) continue;
        if (GetCell(soil, c, r) !== SOFT) continue;
        if (soil.plan[r][c]) continue;
        if (CanPlanCell(soil, c, r)) {
          soil.plan[r][c] = true;
          n += 1;
        }
      }
    }
  }
  return n;
}

/** Extend a corridor plan in a facing direction from a seed cell (2 cells tall). */
export function StampCorridorPlan(soil, c0, r0, facing, length = 4) {
  EnsurePlanGrid(soil);
  let n = 0;
  let c = c0;
  let r = r0;
  for (let i = 0; i < length; i++) {
    c += facing;
    if (!InBounds(soil, c, r)) break;
    if (GetCell(soil, c, r) === HARD) break;
    if (GetCell(soil, c, r) === AIR) {
      // still try headroom mark on soft above/below nothing — keep extending
      continue;
    }
    if (GetCell(soil, c, r) !== SOFT) break;
    if (!soil.plan[r][c] && CanPlanCell(soil, c, r)) {
      soil.plan[r][c] = true;
      n += 1;
    } else if (!soil.plan[r][c]) break;
    // Headroom cell above the floor mark
    const above = r - 1;
    if (InBounds(soil, c, above) && GetCell(soil, c, above) === SOFT && !soil.plan[above][c]) {
      if (CanPlanCell(soil, c, above) || soil.plan[r][c]) {
        soil.plan[above][c] = true;
        n += 1;
      }
    }
  }
  return n;
}

export function CountPlanned(soil) {
  EnsurePlanGrid(soil);
  let n = 0;
  for (let r = 0; r < soil.rows; r++) {
    for (let c = 0; c < soil.cols; c++) if (soil.plan[r][c]) n += 1;
  }
  return n;
}

/**
 * Soft cell next to the digger that can be excavated this tap.
 * digUp climbs a column (headroom is often already AIR — must look 2–4 cells up).
 * When digUp/digDown is set, only search that axis so side digs don't steal the tap.
 */
export function PickExcavateTarget(soil, playerX, playerY, facing, digDown, digUp) {
  EnsurePlanGrid(soil);
  const pc = WorldToCell(soil, playerX, playerY - 24);
  const face = facing >= 0 ? 1 : -1;
  const preferred = [];
  if (digUp) {
    // Vertical shaft: skip empty headroom, carve the next soft toward the surface.
    for (let dr = 1; dr <= 4; dr++) {
      preferred.push({ c: pc.c, r: pc.r - dr });
      preferred.push({ c: pc.c + face, r: pc.r - dr });
      preferred.push({ c: pc.c - face, r: pc.r - dr });
    }
  } else if (digDown) {
    for (let dr = 1; dr <= 3; dr++) {
      preferred.push({ c: pc.c, r: pc.r + dr });
      preferred.push({ c: pc.c + face, r: pc.r + dr });
    }
  } else {
    preferred.push(
      { c: pc.c + face, r: pc.r },
      { c: pc.c + face, r: pc.r - 1 },
      { c: pc.c + face * 2, r: pc.r },
      { c: pc.c + face * 2, r: pc.r - 1 },
      { c: pc.c, r: pc.r - 1 },
      { c: pc.c, r: pc.r + 1 },
      { c: pc.c - face, r: pc.r },
      { c: pc.c, r: pc.r },
    );
  }
  // Up/down shafts need a longer reach than sideways lip digs.
  const near = (c, r) =>
    digUp || digDown
      ? Math.abs(pc.c - c) <= 1 && Math.abs(pc.r - r) <= 4
      : Math.abs(pc.c - c) + Math.abs(pc.r - r) <= 2;

  const tryPick = (needPlan) => {
    const seen = new Set();
    for (const { c, r } of preferred) {
      const k = `${c},${r}`;
      if (seen.has(k)) continue;
      seen.add(k);
      if (!InBounds(soil, c, r)) continue;
      if (GetCell(soil, c, r) !== SOFT) continue;
      if (needPlan && !IsPlanned(soil, c, r)) continue;
      if (!needPlan && !CanPlanCell(soil, c, r)) continue;
      if (!near(c, r)) continue;
      return { c, r, rect: CellWorldRect(soil, c, r), free: !needPlan, dir: digUp ? "up" : digDown ? "down" : "side" };
    }
    return null;
  };

  return tryPick(true) || tryPick(false);
}

export function InitPlanCursor(soil, playerX, playerY, facing) {
  EnsurePlanGrid(soil);
  const pc = WorldToCell(soil, playerX, playerY - 24);
  // Prefer a SOFT (ideally already planned) neighbor — never start the cursor on AIR.
  const candidates = [
    { c: pc.c + facing, r: pc.r },
    { c: pc.c + facing, r: pc.r - 1 },
    { c: pc.c, r: pc.r - 1 },
    { c: pc.c, r: pc.r + 1 },
    { c: pc.c - facing, r: pc.r },
    { c: pc.c + facing, r: pc.r + 1 },
  ];
  for (const cell of candidates) {
    if (!InBounds(soil, cell.c, cell.r)) continue;
    if (GetCell(soil, cell.c, cell.r) !== SOFT) continue;
    if (IsPlanned(soil, cell.c, cell.r) || CanPlanCell(soil, cell.c, cell.r)) return cell;
  }
  for (const cell of candidates) {
    if (InBounds(soil, cell.c, cell.r) && GetCell(soil, cell.c, cell.r) === SOFT) return cell;
  }
  const probe = WorldToCell(soil, playerX + facing * 24, playerY - 24);
  return {
    c: Math.max(1, Math.min(soil.cols - 2, probe.c)),
    r: Math.max(1, Math.min(soil.rows - 2, probe.r)),
  };
}

/**
 * BFS soft path between two cells (around HARD), then mark every soft step as planned.
 * Used to pre-draw tutorial corridors so Act1 is playable without inventing the UX.
 */
export function PlanSoftPath(soil, c0, r0, c1, r1) {
  EnsurePlanGrid(soil);
  if (!InBounds(soil, c0, r0) || !InBounds(soil, c1, r1)) return 0;
  const key = (c, r) => `${c},${r}`;
  const walkable = (c, r) => {
    if (!InBounds(soil, c, r)) return false;
    const v = GetCell(soil, c, r);
    return v === SOFT || v === AIR;
  };
  const q = [[c0, r0]];
  const prev = new Map([[key(c0, r0), null]]);
  const dirs = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];
  let found = false;
  while (q.length) {
    const [c, r] = q.shift();
    if (c === c1 && r === r1) {
      found = true;
      break;
    }
    for (const [dc, dr] of dirs) {
      const nc = c + dc;
      const nr = r + dr;
      const k = key(nc, nr);
      if (prev.has(k)) continue;
      if (!walkable(nc, nr)) continue;
      prev.set(k, [c, r]);
      q.push([nc, nr]);
    }
  }
  if (!found) return 0;
  let n = 0;
  let cur = [c1, r1];
  while (cur) {
    const [c, r] = cur;
    if (GetCell(soil, c, r) === SOFT && !soil.plan[r][c]) {
      soil.plan[r][c] = true;
      n += 1;
    }
    cur = prev.get(key(c, r));
  }
  return n;
}

/**
 * Player is ~2 cells tall — any planned floor cell also needs the soft cell above
 * marked, or digging a 1-high crawlway traps you against the ceiling solid.
 */
export function PlanCorridorHeadroom(soil) {
  EnsurePlanGrid(soil);
  let n = 0;
  for (let r = 1; r < soil.rows; r++) {
    for (let c = 0; c < soil.cols; c++) {
      if (!soil.plan[r][c]) continue;
      if (GetCell(soil, c, r) !== SOFT) continue;
      const above = r - 1;
      if (GetCell(soil, c, above) !== SOFT) continue;
      if (soil.plan[above][c]) continue;
      soil.plan[above][c] = true;
      n += 1;
    }
  }
  return n;
}

export function MovePlanCursor(soil, cursor, dc, dr) {
  const nc = Math.max(0, Math.min(soil.cols - 1, cursor.c + dc));
  const nr = Math.max(0, Math.min(soil.rows - 1, cursor.r + dr));
  return { c: nc, r: nr };
}

export function PlanCursorWorld(soil, cursor) {
  return CellCenter(soil, cursor.c, cursor.r);
}
