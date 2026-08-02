/**
 * Diggable soil grid — tunnels are carved, not gifted.
 *
 * Cell types:
 *  0 AIR   — walkable void
 *  1 SOFT  — diggable loess
 *  2 HARD  — brick / rock / bomb casing (cannot dig)
 *
 * World +y down. Grid origin is top-left of the dig band.
 */

export const CELL = 40;
export const AIR = 0;
export const SOFT = 1;
export const HARD = 2;

export function CreateSoilGrid({ cols, rows, originX, originY, fill = SOFT }) {
  const cells = [];
  const plan = [];
  for (let r = 0; r < rows; r++) {
    const row = new Array(cols);
    const planRow = new Array(cols);
    for (let c = 0; c < cols; c++) {
      row[c] = fill;
      planRow[c] = false;
    }
    cells.push(row);
    plan.push(planRow);
  }
  return { cols, rows, originX, originY, cell: CELL, cells, plan, carved: 0 };
}

export function InBounds(grid, c, r) {
  return c >= 0 && r >= 0 && c < grid.cols && r < grid.rows;
}

export function GetCell(grid, c, r) {
  if (!InBounds(grid, c, r)) return HARD;
  return grid.cells[r][c];
}

export function SetCell(grid, c, r, value) {
  if (!InBounds(grid, c, r)) return false;
  const prev = grid.cells[r][c];
  if (prev === value) return false;
  grid.cells[r][c] = value;
  if (value === AIR && prev !== AIR) grid.carved += 1;
  return true;
}

export function FillRect(grid, c0, r0, w, h, value) {
  for (let r = r0; r < r0 + h; r++) {
    for (let c = c0; c < c0 + w; c++) SetCell(grid, c, r, value);
  }
}

/** Carve a starter cellar / corridor. */
export function CarveRect(grid, c0, r0, w, h) {
  FillRect(grid, c0, r0, w, h, AIR);
}

export function RingHard(grid) {
  for (let c = 0; c < grid.cols; c++) {
    SetCell(grid, c, 0, HARD);
    SetCell(grid, c, grid.rows - 1, HARD);
  }
  for (let r = 0; r < grid.rows; r++) {
    SetCell(grid, 0, r, HARD);
    SetCell(grid, grid.cols - 1, r, HARD);
  }
}

export function CellWorldRect(grid, c, r) {
  return {
    x: grid.originX + c * grid.cell,
    y: grid.originY + r * grid.cell,
    w: grid.cell,
    h: grid.cell,
  };
}

export function WorldToCell(grid, x, y) {
  const c = Math.floor((x - grid.originX) / grid.cell);
  const r = Math.floor((y - grid.originY) / grid.cell);
  return { c, r };
}

export function CellCenter(grid, c, r) {
  return {
    x: grid.originX + (c + 0.5) * grid.cell,
    y: grid.originY + (r + 0.5) * grid.cell,
  };
}

/**
 * Pick dig target from player pose.
 * facing: -1|1, digDown/digUp from input.
 * Digs the soft cell immediately ahead of the shovel.
 */
export function PickDigTarget(grid, playerX, playerY, facing, digDown, digUp) {
  // Shovel point: chest / feet / crown
  let probeX = playerX + facing * (18 + grid.cell * 0.35);
  let probeY = playerY - 28;
  if (digDown) {
    probeX = playerX;
    probeY = playerY + 8;
  } else if (digUp) {
    probeX = playerX + facing * 10;
    probeY = playerY - 56;
  }
  const { c, r } = WorldToCell(grid, probeX, probeY);
  if (!InBounds(grid, c, r)) return null;
  if (GetCell(grid, c, r) !== SOFT) return null;
  // Must touch an AIR cell or the player's current cell (so you carve from a pocket outward)
  if (!TouchesAirOrPlayer(grid, c, r, playerX, playerY)) return null;
  return { c, r, rect: CellWorldRect(grid, c, r) };
}

function TouchesAirOrPlayer(grid, c, r, playerX, playerY) {
  const dirs = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];
  for (const [dc, dr] of dirs) {
    if (GetCell(grid, c + dc, r + dr) === AIR) return true;
  }
  const pc = WorldToCell(grid, playerX, playerY - 24);
  if (Math.abs(pc.c - c) + Math.abs(pc.r - r) <= 1) return true;
  return false;
}

export function CarveCell(grid, c, r) {
  if (GetCell(grid, c, r) !== SOFT) return false;
  SetCell(grid, c, r, AIR);
  if (grid.plan?.[r]) grid.plan[r][c] = false;
  return true;
}

/** Flood-fill AIR connectivity between two world points (must sit in AIR). */
export function AirConnected(grid, x0, y0, x1, y1) {
  const a = WorldToCell(grid, x0, y0);
  const b = WorldToCell(grid, x1, y1);
  if (GetCell(grid, a.c, a.r) !== AIR || GetCell(grid, b.c, b.r) !== AIR) return false;
  if (a.c === b.c && a.r === b.r) return true;
  const key = (c, r) => `${c},${r}`;
  const seen = new Set([key(a.c, a.r)]);
  const q = [[a.c, a.r]];
  const dirs = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];
  while (q.length) {
    const [c, r] = q.shift();
    for (const [dc, dr] of dirs) {
      const nc = c + dc;
      const nr = r + dr;
      if (!InBounds(grid, nc, nr) || GetCell(grid, nc, nr) !== AIR) continue;
      const k = key(nc, nr);
      if (seen.has(k)) continue;
      if (nc === b.c && nr === b.r) return true;
      seen.add(k);
      q.push([nc, nr]);
    }
  }
  return false;
}

/** Count AIR cells inside an inclusive rect of cell coords. */
export function CountAirInRect(grid, c0, r0, w, h) {
  let n = 0;
  for (let r = r0; r < r0 + h; r++) {
    for (let c = c0; c < c0 + w; c++) {
      if (GetCell(grid, c, r) === AIR) n += 1;
    }
  }
  return n;
}

/** Build physics solids from non-AIR cells (merged horizontally per row). */
export function SolidsFromSoil(grid, idPrefix = "soil") {
  const solids = [];
  let n = 0;
  for (let r = 0; r < grid.rows; r++) {
    let c = 0;
    while (c < grid.cols) {
      if (GetCell(grid, c, r) === AIR) {
        c += 1;
        continue;
      }
      const c0 = c;
      while (c < grid.cols && GetCell(grid, c, r) !== AIR) c += 1;
      const rect = CellWorldRect(grid, c0, r);
      solids.push({
        id: `${idPrefix}_${n++}`,
        x: rect.x,
        y: rect.y,
        w: (c - c0) * grid.cell,
        h: grid.cell,
        digOnly: false,
        soil: true,
      });
    }
  }
  return solids;
}

/** Bedrock slab under the dig band so you never fall out of the world. */
export function BedrockSolid(grid) {
  const y = grid.originY + grid.rows * grid.cell;
  return {
    id: "bedrock",
    x: grid.originX - 40,
    y,
    w: grid.cols * grid.cell + 80,
    h: 160,
    digOnly: false,
    soil: false,
  };
}

export function RebuildTunnelSolids(level) {
  if (!level.soil) {
    level.tunnelSolids = level.tunnelSolids || [];
    return level.tunnelSolids;
  }
  level.tunnelSolids = [...SolidsFromSoil(level.soil), BedrockSolid(level.soil)];
  return level.tunnelSolids;
}

/**
 * Seed a classic dig puzzle band: soft fill, hard shell, optional hard blobs.
 * Returns grid.
 */
export function BuildDigBand({
  originX,
  originY,
  cols,
  rows,
  hardBlobs = [],
  cellars = [],
}) {
  const grid = CreateSoilGrid({ cols, rows, originX, originY, fill: SOFT });
  RingHard(grid);
  for (const blob of hardBlobs) {
    FillRect(grid, blob.c, blob.r, blob.w, blob.h, HARD);
  }
  for (const cellar of cellars) {
    CarveRect(grid, cellar.c, cellar.r, cellar.w, cellar.h);
  }
  return grid;
}
