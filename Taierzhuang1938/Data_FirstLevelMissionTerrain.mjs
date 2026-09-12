import { OPENING } from "./Data_FirstLevelOpening.mjs";
// Authored soil, metres: natural ground, roads, rail berm and excavated trenches.
// This function is baked once into the shared rendered/physical heightfield.
import { FRONT_BREACHES } from "./Data_FirstLevelMissionFront.mjs";
const Smooth = (value) => {
  const t = Math.max(0, Math.min(1, value));
  return t * t * (3 - 2 * t);
};
export function MissionPathDistance(point, route) {
  let best = Infinity;
  for (let i = 1; i < route.length; i++) {
    const a = route[i - 1],
      b = route[i],
      dx = b.x - a.x,
      dz = b.z - a.z;
    const t = Math.max(
      0,
      Math.min(1, ((point.x - a.x) * dx + (point.z - a.z) * dz) / (dx * dx + dz * dz || 1)),
    );
    best = Math.min(best, Math.hypot(point.x - a.x - dx * t, point.z - a.z - dz * t));
  }
  return best;
}
export const MISSION_TERRAIN = Object.freeze({
  cellM: 0.75,
  roads: [
    {
      points: [
        { x: 8, z: -119 },
        { x: 8, z: -90 },
        { x: 4, z: -66 },
        { x: -4, z: -35 },
        { x: 2, z: -8 },
        { x: 22, z: 8 },
        { x: 27, z: 40 },
        { x: 55, z: 57 },
        { x: 76, z: 85 },
        { x: 76, z: 170 },
      ],
      width: 6,
    },
    {
      points: [
        { x: -65, z: 75 },
        { x: -24, z: 48 },
        { x: 18, z: 12 },
        { x: 48, z: -2 },
        { x: 72, z: 46 },
        { x: 76, z: 123 },
        { x: 76, z: 180 },
      ],
      width: 10,
    },
    {
      points: [
        { x: -152, z: 36 },
        { x: -172, z: 22 },
        { x: -186, z: -10 },
      ],
      width: 10,
    },
    {
      points: [
        { x: 38, z: -198 },
        { x: 36, z: -169 },
        { x: 28, z: -136 },
        { x: 27, z: -111 },
      ],
      width: 7,
    },
  ],
  trenches: [
    {
      id: "FrontCommunication",
      points: [...OPENING.approachRoute.slice(1),...OPENING.supportRoute.slice(1)],
      depth: 1.5,
      bottom: 4.2,
      bank: 1.5,
    },
    {
      id: "FrontTraverse",
      points: [
        { x: -32, z: -124 },
        { x: 0, z: -124 },
        { x: 24, z: -124 },
      ],
      depth: 1.5,
      bottom: 4.2,
      bank: 1.5,
    },
    {
      id: "BundleApproach",
      points: [
        { x: 6, z: -124 },
        { x: 15, z: -111 },
        { x: 25, z: -110 },
        { x: 30, z: -117 },
      ],
      depth: 1.45,
      bottom: 3.6,
      bank: 1.3,
    },
    {
      id: "WestEvacuation",
      points: [
        { x: 54, z: 114 },
        { x: 39, z: 116 },
        { x: 18, z: 109 },
        { x: -7, z: 98 },
        { x: -28, z: 88 },
        { x: -51, z: 82 },
        { x: -67, z: 64 },
        { x: -84, z: 61 },
        { x: -99, z: 42 },
        { x: -120, z: 40 },
        { x: -138, z: 40 },
      ],
      depth: 1.1,
      bottom: 5.2,
      bank: 2.2,
    },
    // Two short choices return to the same northbound main trench.
    {id:"EntryCoverLoop",role:"localLoop",points:[{x:-45,z:41},{x:-52,z:35},{x:-52,z:27},{x:-45,z:24}],depth:1.5,bottom:3.6,bank:1.5},
    {id:"NorthCoverLoop",role:"localLoop",points:[{x:-24,z:-44},{x:-31,z:-48},{x:-31,z:-56},{x:-24,z:-60}],depth:1.5,bottom:3.6,bank:1.5},
    // A short breached enemy sap explains intruders; it never rejoins behind the player.
    {id:"FlankBreachSap",role:"enemyEntry",points:[{x:-22,z:8},{x:-28,z:8},{x:-37,z:8}],depth:1.5,bottom:3.2,bank:1.5},
    {
      id: "RearEvacuationLoop", role: "localLoop",
      points: [{x:-28,z:88},{x:-34,z:103},{x:-52,z:105},{x:-65,z:90},{x:-67,z:64}],
      depth:1.1, bottom:5.2, bank:2.2,
    },
  ],
  steps: [
    { x: 0, z: -127.5, radius: 3.6, depth: 0.88 },
    { x: 15, z: -127.5, radius: 3.2, depth: 0.9 },
    { x: -25, z: -127.5, radius: 3.2, depth: 0.88 },
  ],
  pads: [
    { x: -71, z: 74, w: 13, d: 50 },
    { x: 55, z: 6, w: 62, d: 42 },
    { x: 76, z: 113, w: 57, d: 54 },
    { x: -145, z: 35, w: 42, d: 40 },
  ],
});
export function SampleMissionNaturalHeight(x, z) {
  const field = 0.12 * Math.sin(x / 22) * Math.cos(z / 28) + 0.07 * Math.sin((x + z) / 12);
  // Low field banks enclose the playable plain; authored roads and trench floors stay shared.
  const east = 4.2 * Smooth((x - 116) / 21) * (.88 + .12 * Math.cos(z / 35));
  const west = 4.3 * Smooth((-x - 190) / 15);
  const north = 3.1 * Smooth((-z - 184) / 18) * (.86 + .14 * Math.cos(x / 31));
  return field + east + west + north;
}
export function SampleMissionTerrain(x, z, spec = MISSION_TERRAIN) {
  const natural = SampleMissionNaturalHeight(x, z);
  let height = natural;
  for (const pad of spec.pads) {
    const d = Math.hypot(
      Math.max(0, Math.abs(x - pad.x) - pad.w / 2),
      Math.max(0, Math.abs(z - pad.z) - pad.d / 2),
    );
    height *= Smooth(d / 5);
  }
  for (const road of spec.roads) {
    const d = MissionPathDistance({ x, z }, road.points);
    height = height * (0.15 + 0.85 * Smooth((d - road.width / 2) / 3));
  }
  // A continuous rail embankment, never a box pretending to be soil.
  const rail = Math.abs(x + 77);
  height += 0.62 * (1 - Smooth((rail - 2.4) / 4));
  for (const trench of spec.trenches) {
    const d = MissionPathDistance({ x, z }, trench.points);
    height = Math.min(height, natural - trench.depth * (1 - Smooth((d - trench.bottom / 2) / trench.bank)));
  }
  for (const breach of FRONT_BREACHES) {
    const blend=1-Smooth(Math.hypot(x-breach.x,z-breach.z)/breach.radius);
    if(blend>0)height=Math.max(height,height+(natural-breach.depth-height)*blend);
  }
  for (const step of spec.steps) {
    const d = Math.hypot(x - step.x, z - step.z),
      t = 1 - Smooth((d - step.radius) / 1.3);
    if (t > 0) height = height * (1 - t) + (natural - step.depth) * t;
  }
  // Broad earthen ramps connect all mouths without an invisible step.
  if (x > 54 && x < 99) height = Math.min(height, -1.8 * (1 - Smooth((Math.abs(z - 153) - 1.6) / 2.8)));
  for (const point of [
    { x: -62, z: 64 },
    { x: 54, z: 114 },
    { x: -138, z: 40 },
  ]) {
    const distance = Math.hypot(x - point.x, z - point.z);
    const blend = 1 - Smooth(distance / 9);
    height = height * (1 - blend) + natural * blend;
  }
  return height;
}

// Greybox surface identity uses the same authored road and trench corridors.
//
// This is sampled per lattice vertex whenever a crater tile is built, so it is a
// blast-frame cost, not a load-time one: the array-allocating version below
// (one `mix` array per corridor per vertex, every polyline walked in full) was
// ~14 of the 15 ms a grenade cost in the mission level. Same output, but scalar
// channels and corridor culling — a vertex only pays for the polylines that can
// actually tint it. `out` lets a caller reuse one array across a whole tile.
const routeBounds = new WeakMap();
function RouteBounds(route) {
  let bounds = routeBounds.get(route);
  if (!bounds) {
    bounds = { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity };
    for (const p of route) {
      if (p.x < bounds.minX) bounds.minX = p.x;
      if (p.x > bounds.maxX) bounds.maxX = p.x;
      if (p.z < bounds.minZ) bounds.minZ = p.z;
      if (p.z > bounds.maxZ) bounds.maxZ = p.z;
    }
    routeBounds.set(route, bounds);
  }
  return bounds;
}
/**
 * Distance from (x, z) to a polyline, or Infinity once it is farther than
 * `reach` — the blends below are exactly zero beyond their own reach, so the
 * early-out never changes a colour. Segment rejection is a box test; the one
 * square root is taken at the end.
 */
function RouteDistanceWithin(x, z, route, reach) {
  const bounds = RouteBounds(route);
  if (x < bounds.minX - reach || x > bounds.maxX + reach
    || z < bounds.minZ - reach || z > bounds.maxZ + reach) return Infinity;
  let best = reach * reach;
  for (let i = 1; i < route.length; i++) {
    const a = route[i - 1], b = route[i];
    const loX = a.x < b.x ? a.x : b.x, hiX = a.x < b.x ? b.x : a.x;
    if (x < loX - reach || x > hiX + reach) continue;
    const loZ = a.z < b.z ? a.z : b.z, hiZ = a.z < b.z ? b.z : a.z;
    if (z < loZ - reach || z > hiZ + reach) continue;
    const dx = b.x - a.x, dz = b.z - a.z;
    let t = ((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz || 1);
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const ex = x - a.x - dx * t, ez = z - a.z - dz * t, d2 = ex * ex + ez * ez;
    if (d2 < best) best = d2;
  }
  return best < reach * reach ? Math.sqrt(best) : Infinity;
}
export function SampleMissionGroundColor(x, z, out = [0, 0, 0]) {
  const variation=.94+.06*Math.sin(x*.37)*Math.sin(z*.29);
  // field [.48,.50,.43], dust [.64,.60,.51], soil [.40,.36,.29]
  let r=.48*variation, g=.50*variation, b=.43*variation;
  for(const road of MISSION_TERRAIN.roads) {
    const d=RouteDistanceWithin(x,z,road.points,road.width/2+1.8);
    if(d===Infinity)continue;
    const t=1-Smooth((d-road.width/2)/1.8);
    r+=(.64-r)*t; g+=(.60-g)*t; b+=(.51-b)*t;
  }
  for(const pad of MISSION_TERRAIN.pads) {
    const ex=Math.abs(x-pad.x)-pad.w/2, ez=Math.abs(z-pad.z)-pad.d/2;
    if(ex>=3||ez>=3)continue;
    const dx=ex>0?ex:0, dz=ez>0?ez:0, d=Math.sqrt(dx*dx+dz*dz);
    const t=.75*(1-Smooth(d/3));
    if(t<=0)continue;
    r+=(.64-r)*t; g+=(.60-g)*t; b+=(.51-b)*t;
  }
  for(const trench of MISSION_TERRAIN.trenches) {
    const d=RouteDistanceWithin(x,z,trench.points,trench.bottom/2+trench.bank);
    if(d===Infinity)continue;
    const t=1-Smooth((d-trench.bottom/2)/trench.bank);
    r+=(.40-r)*t; g+=(.36-g)*t; b+=(.29-b)*t;
  }
  const rail=Math.abs(x+77);
  const railT=1-Smooth((rail-2.4)/1.5);
  if(railT>0){ r+=(.43-r)*railT; g+=(.44-g)*railT; b+=(.41-b)*railT; }
  out[0]=r; out[1]=g; out[2]=b;
  return out;
}
