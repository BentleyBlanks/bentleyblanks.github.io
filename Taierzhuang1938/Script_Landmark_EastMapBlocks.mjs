// Authored east-map frames → existing city-block / landmark builders.
//
// This module deliberately owns no wall, roof, collision, or LOD geometry.  Those
// contracts already live in Script_CityBlockKit and the named landmark builders;
// keeping this as a dispatcher makes an authored closed frame look identical to
// the surrounding city at every distance instead of becoming a second building kit.

import { Clamp01 } from "./Script_Noise.mjs";
import {
  PickCityBlockArchetype, PickDuplex,
  BuildCityBlockDetail, BuildCityBlockMid, BuildCityBlockFar,
} from "./Script_CityBlockKit.mjs";
import { BuildOffice } from "./Script_Landmark_Commerce.mjs";
import { BuildBillet } from "./Script_Landmark_Headquarters.mjs";

const SECTOR_SIZE = 150;
const MIN_BLOCK_SPAN = 6;

/** The public names accepted in authored east-map data. */
export const EAST_MAP_BLOCK_KINDS = Object.freeze([
  "residential",
  "residentialRow",
  "courtyard",
  "shop",
  "storage",
  "outlyingCompound",
  "districtOffice",
  "battalion",
  "battalionBillet",
]);

const KIT_KIND = Object.freeze({
  residentialRow: "OneEntry",
  courtyard: "LCourtyard",
  shop: "ShopRow",
  storage: "ShopRow",
  outlyingCompound: "AdobeYard",
});

const NAMED_KIND = Object.freeze({
  districtOffice: "districtOffice",
  battalion: "battalion",
  battalionBillet: "battalion",
});

function NumberOr(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}

function SectorKey(x, z) {
  return `S${Math.floor(x / SECTOR_SIZE)}_${Math.floor(z / SECTOR_SIZE)}`;
}

function Frame(x, z, ry) {
  const cos = Math.cos(ry);
  const sin = Math.sin(ry);
  return (lx, lz) => ({ x: x + cos * lx + sin * lz, z: z - sin * lx + cos * lz });
}

function PointInPolygon(x, z, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const a = polygon[i];
    const b = polygon[j];
    const intersects = ((a.z > z) !== (b.z > z))
      && (x < (b.x - a.x) * (z - a.z) / (b.z - a.z) + a.x);
    if (intersects) inside = !inside;
  }
  return inside;
}

function FootprintInsidePolygon(cell, polygon) {
  const at = Frame(cell.x, cell.z, cell.ry);
  for (const lx of [-cell.w / 2, cell.w / 2]) {
    for (const lz of [-cell.d / 2, cell.d / 2]) {
      const p = at(lx, lz);
      if (!PointInPolygon(p.x, p.z, polygon)) return false;
    }
  }
  return true;
}

function ValidatePolygon(polygon, id) {
  if (polygon == null) return null;
  if (!Array.isArray(polygon) || polygon.length < 3
    || polygon.some((p) => !Number.isFinite(p?.x) || !Number.isFinite(p?.z))) {
    throw new TypeError(`East map block "${id}" polygon must contain at least three { x, z } points.`);
  }
  return polygon.map(({ x, z }) => ({ x, z }));
}

/**
 * Validate an authored block and fill the safe defaults shared by every LOD.
 * `rows` may contain explicit child specs or row definitions accepted by
 * ExpandEastMapBlockSpec.  `polygon` is world-space, so irregular frames can
 * remain authored in map coordinates instead of being converted into a hidden
 * local coordinate convention.
 */
export function NormalizeEastMapBlockSpec(spec, index = 0) {
  if (!spec || typeof spec !== "object") throw new TypeError("East map block spec must be an object.");
  const id = typeof spec.id === "string" && spec.id ? spec.id : `EastBlock${index}`;
  const kind = spec.kind || "residential";
  if (!EAST_MAP_BLOCK_KINDS.includes(kind)) {
    throw new RangeError(`East map block "${id}" has unsupported kind "${kind}".`);
  }
  for (const key of ["x", "z", "w", "d"]) {
    if (!Number.isFinite(spec[key])) throw new TypeError(`East map block "${id}" requires finite ${key}.`);
  }
  if (spec.w < MIN_BLOCK_SPAN || spec.d < MIN_BLOCK_SPAN) {
    throw new RangeError(`East map block "${id}" must be at least ${MIN_BLOCK_SPAN} m in both dimensions.`);
  }
  if (spec.rows != null && !Array.isArray(spec.rows)) {
    throw new TypeError(`East map block "${id}" rows must be an array.`);
  }
  if (spec.grid != null && (typeof spec.grid !== "object" || Array.isArray(spec.grid))) {
    throw new TypeError(`East map block "${id}" grid must be an object.`);
  }
  return {
    ...spec,
    id,
    kind,
    ry: NumberOr(spec.ry, 0),
    seed: typeof spec.seed === "string" && spec.seed ? spec.seed : `eastMap:${id}`,
    damage: Clamp01(NumberOr(spec.damage, 0)),
    burnt: Boolean(spec.burnt),
    polygon: ValidatePolygon(spec.polygon, id),
  };
}

function RowCells(spec, row, rowIndex) {
  // Explicit cells are useful where survey data has already set each courtyard.
  if (Number.isFinite(row?.x) && Number.isFinite(row?.z) && Number.isFinite(row?.w) && Number.isFinite(row?.d)) {
    return [{ ...spec, ...row, id: row.id || `${spec.id}Row${rowIndex}`, seed: row.seed || `${spec.seed}:row${rowIndex}` }];
  }
  const axis = row?.axis === "z" ? "z" : "x";
  const count = Math.max(1, Math.floor(NumberOr(row?.count, 1)));
  const gap = Math.max(0, NumberOr(row?.gap, 0));
  const span = NumberOr(row?.span, axis === "x" ? spec.w : spec.d);
  const depth = NumberOr(row?.depth, axis === "x" ? spec.d : spec.w);
  const usable = span - gap * (count - 1);
  if (usable / count < MIN_BLOCK_SPAN || depth < MIN_BLOCK_SPAN) return [];
  const offset = NumberOr(row?.offset, 0);
  const at = Frame(spec.x, spec.z, spec.ry);
  const cells = [];
  for (let i = 0; i < count; i += 1) {
    const along = -span / 2 + (usable / count + gap) * i + usable / count / 2;
    const p = axis === "x" ? at(along, offset) : at(offset, along);
    cells.push({
      ...spec,
      ...row,
      x: p.x,
      z: p.z,
      w: axis === "x" ? usable / count : depth,
      d: axis === "x" ? depth : usable / count,
      id: row?.id ? `${row.id}${i}` : `${spec.id}Row${rowIndex}_${i}`,
      seed: `${spec.seed}:row${rowIndex}:${i}`,
      kind: row?.kind || spec.kind,
      rows: null,
    });
  }
  return cells;
}

function PolygonCells(spec) {
  const xs = spec.polygon.map((p) => p.x);
  const zs = spec.polygon.map((p) => p.z);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minZ = Math.min(...zs), maxZ = Math.max(...zs);
  const span = Math.max(MIN_BLOCK_SPAN, NumberOr(spec.cellSpan, spec.kind === "shop" ? 14 : 18));
  const nx = Math.max(1, Math.ceil((maxX - minX) / span));
  const nz = Math.max(1, Math.ceil((maxZ - minZ) / span));
  const cells = [];
  for (let ix = 0; ix < nx; ix += 1) {
    for (let iz = 0; iz < nz; iz += 1) {
      const w = (maxX - minX) / nx;
      const d = (maxZ - minZ) / nz;
      const cell = {
        ...spec, x: minX + w * (ix + 0.5), z: minZ + d * (iz + 0.5), w, d,
        id: `${spec.id}Polygon${ix}_${iz}`, seed: `${spec.seed}:polygon:${ix}:${iz}`,
        polygon: null, rows: null,
      };
      if (FootprintInsidePolygon(cell, spec.polygon)) cells.push(cell);
    }
  }
  return cells;
}

function GridCells(spec) {
  const cols = Math.max(1, Math.floor(NumberOr(spec.grid?.cols, 1)));
  const rows = Math.max(1, Math.floor(NumberOr(spec.grid?.rows, 1)));
  const gapX = Math.max(0, NumberOr(spec.grid?.gapX, 1));
  const gapZ = Math.max(0, NumberOr(spec.grid?.gapZ, 1));
  const w = (spec.w - gapX * (cols - 1)) / cols;
  const d = (spec.d - gapZ * (rows - 1)) / rows;
  if (w < MIN_BLOCK_SPAN || d < MIN_BLOCK_SPAN) return [];
  const kinds = Array.isArray(spec.grid?.kindCycle) && spec.grid.kindCycle.length
    ? spec.grid.kindCycle : [spec.kind];
  const at = Frame(spec.x, spec.z, spec.ry);
  const cells = [];
  for (let iz = 0; iz < rows; iz += 1) {
    for (let ix = 0; ix < cols; ix += 1) {
      const p = at(-spec.w / 2 + w / 2 + ix * (w + gapX), -spec.d / 2 + d / 2 + iz * (d + gapZ));
      cells.push({
        ...spec, x: p.x, z: p.z, w, d,
        id: `${spec.id}Grid${ix}_${iz}`, seed: `${spec.seed}:grid:${ix}:${iz}`,
        kind: kinds[(ix + iz * cols) % kinds.length], polygon: null, rows: null, grid: null,
      });
    }
  }
  return cells;
}

/** Expand an authored frame into rectangular cells consumable by the native kit. */
export function ExpandEastMapBlockSpec(rawSpec, index = 0) {
  const spec = NormalizeEastMapBlockSpec(rawSpec, index);
  if (spec.rows?.length) return spec.rows.flatMap((row, rowIndex) => RowCells(spec, row, rowIndex));
  if (spec.grid) return GridCells(spec);
  if (spec.polygon && !NAMED_KIND[spec.kind]) return PolygonCells(spec);
  return [spec];
}

/** Resolve a standard cell to its stable native-kit plan. */
export function PlanEastMapBlock(rawSpec, index = 0) {
  const spec = NormalizeEastMapBlockSpec(rawSpec, index);
  const kitKind = KIT_KIND[spec.kind]
    || PickCityBlockArchetype({
      seed: spec.seed,
      wealth: Clamp01(NumberOr(spec.wealth, spec.kind === "outlyingCompound" ? 0.15 : 0.42)),
      shop: false,
      w: spec.w,
      d: spec.d,
    });
  return {
    ...spec,
    kitKind,
    duplex: spec.duplex === undefined
      ? PickDuplex({ seed: spec.seed, kind: kitKind, w: spec.w, d: spec.d, chance: NumberOr(spec.duplexChance, 42) })
      : spec.duplex,
  };
}

function HasHostContract(host) {
  return host?.sink && host?.farSink && typeof host.FocusDistance === "function";
}

function DamageContext(host, cell) {
  // Authored `damage` is already a level-design decision.  A caller that feeds
  // raw gradient noise can opt into the city's profiling explicitly.
  if (typeof host.DamageProfile === "function" && cell.damageProfile === true) {
    const profile = host.DamageProfile(cell.damage);
    return { damage: profile.damage, burnt: cell.burnt || profile.burnt };
  }
  return { damage: cell.damage, burnt: cell.burnt };
}

function AddStats(host, field, amount = 1) {
  if (host.stats && Number.isFinite(host.stats[field])) host.stats[field] += amount;
}

/**
 * Construct closed, authored east-map frames through the existing native kit.
 *
 * `host` is the live TengxianCity-like object: it supplies the two sinks,
 * focus culling, its street predicate, and (when present) damage profiling.
 * Callers can replace `delegates` with the dedicated east-suburb feature
 * builders, or set a named delegate to `null` to reserve its exact frame for a
 * later pass.  Reserved frames are returned, never silently filled with houses.
 */
export function BuildEastMapBlocks(host, specs, {
  baseY = 0,
  sectorKey = SectorKey,
  canPlace = null,
  delegates = {},
  namedMode = "delegate",
  onReserve = null,
} = {}) {
  if (!HasHostContract(host)) {
    throw new TypeError("BuildEastMapBlocks needs host.sink, host.farSink, and host.FocusDistance(x, z).");
  }
  if (!Array.isArray(specs)) throw new TypeError("BuildEastMapBlocks specs must be an array.");
  if (namedMode !== "delegate" && namedMode !== "reserve") {
    throw new RangeError('BuildEastMapBlocks namedMode must be "delegate" or "reserve".');
  }
  const result = { detail: 0, mid: 0, far: 0, delegated: 0, skipped: 0, reserved: [] };
  const namedDelegates = {
    districtOffice: delegates.districtOffice === undefined ? BuildOffice : delegates.districtOffice,
    battalion: delegates.battalion === undefined ? BuildBillet : delegates.battalion,
  };
  const cells = specs.flatMap((spec, index) => ExpandEastMapBlockSpec(spec, index));
  try {
    for (const rawCell of cells) {
      const named = NAMED_KIND[rawCell.kind];
      // Named grounds are expressly reserved by the authored map.  Their own
      // builders test exterior props against OnStreet; rejecting the whole
      // footprint here would wrongly discard a gate that intentionally fronts a
      // street.  Ordinary cells remain conservative by default.
      const placeAllowed = canPlace
        ? canPlace(rawCell, host)
        : (named ? true : (typeof host.OnStreet === "function"
          ? !host.OnStreet(rawCell.x, rawCell.z, rawCell.w / 2, rawCell.d / 2) : true));
      if (!placeAllowed) {
        result.skipped += 1;
        continue;
      }
      const sector = sectorKey(rawCell.x, rawCell.z);
      host.sink.SetSector(sector);
      host.farSink.SetSector(sector);
      if (named) {
        const delegate = namedMode === "delegate" ? namedDelegates[named] : null;
        if (typeof delegate !== "function") {
          result.reserved.push(rawCell);
          if (typeof onReserve === "function") onReserve(rawCell, host);
          continue;
        }
        const context = { ...DamageContext(host, rawCell), ry: rawCell.ry, baseY };
        delegate(host, rawCell, context);
        result.delegated += 1;
        continue;
      }
      const cell = PlanEastMapBlock(rawCell);
      const damage = DamageContext(host, cell);
      const dist = host.FocusDistance(cell.x, cell.z);
      const lod = { ...damage, baseY, kind: cell.kitKind, ry: cell.ry, duplex: cell.duplex };
      const bareCell = { x: cell.x, z: cell.z, w: cell.w, d: cell.d, seed: cell.seed };
      if (dist < NumberOr(host.detailRadius, Infinity)) {
        AddStats(host, "householdProps", BuildCityBlockDetail(host.sink, { ...bareCell, ...lod }));
        AddStats(host, "compoundsDetail");
        result.detail += 1;
      } else if (dist < NumberOr(host.midRadius, Infinity)) {
        BuildCityBlockMid(host.sink, bareCell, lod);
        AddStats(host, "compoundsMid");
        result.mid += 1;
      } else {
        BuildCityBlockFar(host.farSink, bareCell, lod);
        AddStats(host, "silhouettes");
        result.far += 1;
      }
    }
  } finally {
    // BuildSink sector state is ambient; never leak a closed frame into the next pass.
    host.sink.SetSector("");
    host.farSink.SetSector("");
  }
  return result;
}
