// P012 blueprint-to-world compilation. Pure data: no three or runtime conversion.
// Compile each owned data package once at initialization; gameplay subsequently
// uses world coordinates only. Do not feed already compiled points back here.
// Tactical blocks move rigidly: heights, widths, depths, speeds and radii do not
// scale. Cross-region connections need explicit new world-space waypoints;
// transforming the two endpoints of an old connection does not design a road.
// Boundary points belong to their semantic region: use the explicit transforms
// below when automatic classification would select the neighbouring region.

export { P012_HORIZON_BOUNDS as P012_SPACE_BOUNDS } from "./Data_FirstLevelP012Horizon.mjs";

export function P012NorthPoint(x, z) { return { x, z: z - 40 }; }
export function P012SouthPoint(x, z) { return { x: x + 60, z }; }
export function P012RailPoint(x, z) { return { x, z }; }

export function P012Point(x, z) {
  if (z <= -20) return P012NorthPoint(x, z);
  if (x >= 20 && z >= 10) return P012SouthPoint(x, z);
  return { x, z };
}

// Clone plain configuration trees, transforming coordinate-bearing records only.
// Rectangle corners are mapped independently and their enclosing world bounds
// returned. Rectangles crossing a region seam must instead be split explicitly
// by the caller or compiled with their region's rigid transform; an enclosing
// rectangle is not a new walkable corridor or a scaled physical block.
export function P012MapPoints(value, transform = P012Point) {
  if (Array.isArray(value)) return value.map((item) => P012MapPoints(item, transform));
  if (!value || typeof value !== "object") return value;
  const mapped = Object.fromEntries(Object.entries(value)
    .map(([key, item]) => [key, P012MapPoints(item, transform)]));
  if (Number.isFinite(value.x) && Number.isFinite(value.z)) {
    const point = transform(value.x, value.z);
    mapped.x = point.x;
    mapped.z = point.z;
  }
  if ([value.minX, value.maxX, value.minZ, value.maxZ].every(Number.isFinite)) {
    const corners = [
      transform(value.minX, value.minZ), transform(value.maxX, value.minZ),
      transform(value.minX, value.maxZ), transform(value.maxX, value.maxZ),
    ];
    mapped.minX = Math.min(...corners.map((point) => point.x));
    mapped.maxX = Math.max(...corners.map((point) => point.x));
    mapped.minZ = Math.min(...corners.map((point) => point.z));
    mapped.maxZ = Math.max(...corners.map((point) => point.z));
  }
  return mapped;
}
