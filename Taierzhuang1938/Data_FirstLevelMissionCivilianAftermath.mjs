import { MISSION_LAYOUT, MISSION_ROUTES, MISSION_ANCHORS } from "./Data_FirstLevelMissionLayout.mjs";
import { MISSION_AFTERMATH, FRONT_DEFENDERS } from "./Data_FirstLevelMissionFront.mjs";
import { MISSION_DEFENSE_OBJECTS } from "./Data_FirstLevelMissionFortifications.mjs";
import { SampleMissionTerrain, MissionPathDistance } from "./Data_FirstLevelMissionTerrain.mjs";

// Authored environmental storytelling, not a historical casualty census. Reuse the
// two existing adult civilian models and settled poses; no new generated assets.
export const MISSION_CIVILIAN_AFTERMATH_HOUSES = Object.freeze([
  "Kitchen", "ConnectedHouse", "MachineGunHouse", "VillageEdgeHouse",
  "VillageRearHouse", "RearFarm", "SouthFieldHouse", "NorthFarm",
  "NorthRuin", "RearCourtyardHouse", "ReceptionStreetRoom", "WestFieldHouse",
]);
const bodies = [], routes = Object.values(MISSION_ROUTES);
const houses = MISSION_CIVILIAN_AFTERMATH_HOUSES.map(id => {
  const west = MISSION_LAYOUT.blocks.find(b => b.id === id + "West");
  const east = MISSION_LAYOUT.blocks.find(b => b.id === id + "East" || b.id === id + "EastFront");
  if (!west || !east) throw new Error(`Missing civilian aftermath house: ${id}`);
  return { id, x: (west.x + east.x) / 2, z: west.z, w: east.x - west.x, d: west.d };
});
function Clear(x, z) {
  if (routes.some(route => MissionPathDistance({ x, z }, route) < 2.4)) return false;
  if (Object.values(MISSION_ANCHORS).some(p => Math.hypot(x - p.x, z - p.z) < 2.8)) return false;
  if (FRONT_DEFENDERS.some(p => Math.hypot(x - p.x, z - p.z) < 2.2)) return false;
  if ([...MISSION_AFTERMATH, ...bodies].some(p => Math.hypot(x - p.x, z - p.z) < 1.9)) return false;
  if (houses.some(h => Math.abs(x - h.x) < h.w / 2 + 1.35 && Math.abs(z - h.z) < h.d / 2 + 1.35)) return false;
  if (MISSION_DEFENSE_OBJECTS.some(p => Math.hypot(x - p.x, z - p.z) < 3.5)) return false;
  const y = SampleMissionTerrain(x, z);
  if (MISSION_LAYOUT.blocks.some(b => {
    if (b.y - b.h / 2 > y + .65) return false;
    const cos = Math.cos(b.ry || 0), sin = Math.sin(b.ry || 0), dx = x - b.x, dz = z - b.z;
    return Math.abs(dx * cos - dz * sin) < b.w / 2 + 1.3 && Math.abs(dx * sin + dz * cos) < b.d / 2 + 1.3;
  })) return false;
  // Keep the whole prone silhouette off trench banks and crater lips.
  return [[-1.15,0],[1.15,0],[0,-1.15],[0,1.15]].every(([dx,dz]) => Math.abs(SampleMissionTerrain(x + dx, z + dz) - y) < .09);
}
for (const [group, house] of houses.entries()) {
  let placed = 0;
  // Alternate wall faces and stagger the wall distance: small irregular groups,
  // with the actual room footprint as the source rather than duplicated coordinates.
  for (let attempt = 0; attempt < 160 && placed < 6; attempt++) {
    const face = (attempt + group) % 4, ring = Math.floor(attempt / 16);
    const fraction = Math.sin((attempt + 1) * 2.399963 + group) * .43;
    const offset = 1.65 + ring * .37 + (attempt % 3) * .2;
    const x = house.x + (face < 2 ? (face === 0 ? -1 : 1) * (house.w / 2 + offset) : fraction * house.w);
    const z = house.z + (face >= 2 ? (face === 2 ? -1 : 1) * (house.d / 2 + offset) : fraction * house.d);
    if (!Clear(x, z)) continue;
    bodies.push({ id: `CivilianAftermath_${house.id}_${placed}`, houseId: house.id,
      x, z, yaw: attempt * 2.399963 + group * .7, side: "civilian",
      variant: (placed + group * 2) % 4 < 2 ? "male" : "female", pose: placed % 2,
      pile: 0, scale: .96 + (placed % 3) * .035, blood: .23 + (placed % 3) * .07 });
    placed++;
  }
  if (placed < 6) throw new Error(`Insufficient clear civilian aftermath space: ${house.id} (${placed}/6)`);
}
export const MISSION_CIVILIAN_AFTERMATH = Object.freeze(bodies);
