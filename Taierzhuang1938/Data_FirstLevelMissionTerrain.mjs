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
      points: [
        { x: -62, z: 64 },
        { x: -45, z: 41 },
        { x: -40, z: 4 },
        { x: -24, z: -18 },
        { x: -24, z: -60 },
        { x: -8, z: -78 },
        { x: -8, z: -112 },
        { x: 6, z: -124 },
      ],
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
    // Connected alternatives inside each mission area; the original four paths retain
    // their indices because mission escorts consume those routes. These are authored
    // reconstructions, not surveyed 1938 trench coordinates (see fortifications doc).
    {
      id: "WestCommunicationLoop", role: "communicationLoop",
      points: [{x:-30,z:-124},{x:-42,z:-114},{x:-42,z:-101},{x:-51,z:-92},
        {x:-48,z:-74},{x:-36,z:-66},{x:-24,z:-60}],
      depth:1.5, bottom:4.2, bank:1.5,
    },
    {
      id: "SupportTraverseLink", role: "lateralLink",
      points: [{x:-42,z:-101},{x:-32,z:-99},{x:-26,z:-94},{x:-8,z:-94}],
      depth:1.5, bottom:3.6, bank:1.5,
    },
    {
      id: "WestListeningSap", role: "shelterSap",
      points: [{x:-42,z:-114},{x:-54,z:-111},{x:-54,z:-120}],
      depth:1.5, bottom:3.2, bank:1.5,
    },
    {
      id: "ReserveShelterSap", role: "shelterSap",
      points: [{x:-48,z:-74},{x:-60,z:-67},{x:-60,z:-57}],
      depth:1.5, bottom:3.6, bank:1.5,
    },
    {
      id: "MiddleCommunicationLoop", role: "communicationLoop",
      points: [{x:-24,z:-18},{x:-38,z:-27},{x:-54,z:-18},{x:-56,z:3},
        {x:-51,z:17},{x:-51,z:30},{x:-45,z:41}],
      depth:1.5, bottom:4.2, bank:1.5,
    },
    {
      id: "StationReserveLoop", role: "localLoop",
      points: [{x:-54,z:-18},{x:-66,z:-10},{x:-65,z:6},{x:-56,z:3}],
      depth:1.5, bottom:3.6, bank:1.5,
    },
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
export function SampleMissionGroundColor(x, z) {
  const mix=(a,b,t)=>a.map((v,i)=>v+(b[i]-v)*t);
  const variation=.94+.06*Math.sin(x*.37)*Math.sin(z*.29);
  const field=[.48,.50,.43], dust=[.64,.60,.51], soil=[.40,.36,.29];
  let color=field.map(v=>v*variation);
  for(const road of MISSION_TERRAIN.roads) {
    const d=MissionPathDistance({x,z},road.points);
    color=mix(color,dust,1-Smooth((d-road.width/2)/1.8));
  }
  for(const pad of MISSION_TERRAIN.pads) {
    const d=Math.hypot(Math.max(0,Math.abs(x-pad.x)-pad.w/2),Math.max(0,Math.abs(z-pad.z)-pad.d/2));
    color=mix(color,dust,.75*(1-Smooth(d/3)));
  }
  for(const trench of MISSION_TERRAIN.trenches) {
    const d=MissionPathDistance({x,z},trench.points);
    color=mix(color,soil,1-Smooth((d-trench.bottom/2)/trench.bank));
  }
  const rail=Math.abs(x+77);
  color=mix(color,[.43,.44,.41],1-Smooth((rail-2.4)/1.5));
  return color;
}
