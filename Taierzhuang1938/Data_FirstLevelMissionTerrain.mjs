// Authored soil, metres: natural ground, roads, rail berm and excavated trenches.
// This function is baked once into the shared rendered/physical heightfield.
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
  return 0.12 * Math.sin(x / 22) * Math.cos(z / 28) + 0.07 * Math.sin((x + z) / 12);
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
