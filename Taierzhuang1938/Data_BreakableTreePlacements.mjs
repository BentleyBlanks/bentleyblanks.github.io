import { Mulberry32 } from "./Script_Noise.mjs";
import { BREAKABLE_TREES as T } from "./Data_Tuning_BreakableTrees.mjs";
import { MISSION_LAYOUT, MISSION_ROUTES } from "./Data_FirstLevelMissionLayout.mjs";
import { MISSION_TERRAIN, MissionPathDistance, SampleMissionTerrain } from "./Data_FirstLevelMissionTerrain.mjs";
import { MISSION_REAR_ROUTES, MISSION_STAGE_ROUTES } from "./Data_FirstLevelMissionTopology.mjs";
import { FRONT_SPACE, FRONT_SORTIE, FRONT_TANK_PATH } from "./Data_FirstLevelFrontRoute.mjs";

// Reserve every authored route, including future scenario geometry. Nothing is
// tied to the current stage; retries regenerate the same entire planting plan.
function PointRoutes(value, result = []) {
  if (Array.isArray(value) && value.length > 1 && value.every(p => Number.isFinite(p?.x) && Number.isFinite(p?.z))) result.push(value);
  else if (value && typeof value === "object") for (const v of Object.values(value)) PointRoutes(v, result);
  return result;
}
const routes = PointRoutes([MISSION_ROUTES, MISSION_REAR_ROUTES, MISSION_STAGE_ROUTES, FRONT_SPACE, FRONT_SORTIE, FRONT_TANK_PATH]);
const blocks = [...MISSION_LAYOUT.blocks, ...MISSION_LAYOUT.gates, ...MISSION_LAYOUT.scenario.states.flatMap(s => s.blocks)];
function BlockDistance(p, b) {
  const c = Math.cos(b.ry || 0), s = Math.sin(b.ry || 0), dx = p.x - b.x, dz = p.z - b.z;
  return Math.hypot(Math.max(0, Math.abs(c * dx - s * dz) - b.w / 2), Math.max(0, Math.abs(s * dx + c * dz) - b.d / 2));
}
export function TreePlacementAllowed(p) {
  if (Math.abs(p.x + 77) < T.routeClearanceM) return false; // railway
  if (routes.some(route => MissionPathDistance(p, route) < T.routeClearanceM)) return false;
  if (MISSION_TERRAIN.roads.some(r => MissionPathDistance(p, r.points) < r.width / 2 + T.routeClearanceM)) return false;
  if (MISSION_TERRAIN.trenches.some(r => MissionPathDistance(p, r.points) < (r.bottom || 4) / 2 + (r.bank || 2) + T.routeClearanceM)) return false;
  if (MISSION_LAYOUT.zones.some(z => Math.hypot(p.x - z.x, p.z - z.z) < (z.radius || 8) + 3)) return false;
  if (blocks.some(b => BlockDistance(p, b) < T.blockClearanceM)) return false;
  // Roots spread over several metres; keep them on gently sloping dry ground.
  const heights = [[0,0],[-1.7,0],[1.7,0],[0,-1.7],[0,1.7]].map(([x,z]) => SampleMissionTerrain(p.x+x,p.z+z));
  return Math.max(...heights) - Math.min(...heights) < 0.32;
}
export function MakeAuthoredTreePlacements() {
  return MISSION_LAYOUT.blocks.filter(b => b.treeModel).map(b => ({
    id:b.id, x:b.x, z:b.z, ry:b.ry || 0, scale:b.treeModel.heightM/T.heightM,
    region:b.treeModel.region, authored:true,
  }));
}
export function MakeTreePlacements(seed = T.seed) {
  const random = Mulberry32(seed), result = [];
  for (const region of T.regions) {
    let count = 0;
    for (let trial = 0; trial < 10000 && count < region.count; trial++) {
      const [x0,x1,z0,z1] = region.bounds;
      const p = { x: x0 + random()*(x1-x0), z: z0 + random()*(z1-z0) };
      if (!TreePlacementAllowed(p) || result.some(q => Math.hypot(p.x-q.x,p.z-q.z) < T.minSpacingM)) continue;
      result.push({ ...p, id: `Tree${region.id}${count++}`, region: region.id,
        ry: random()*Math.PI*2, scale: T.scaleMin + random()*(T.scaleMax-T.scaleMin) });
    }
    if (count !== region.count) throw new Error(`Tree region ${region.id} has only ${count} safe placements`);
  }
  // Authored anchors already belong to the proven layout. They do not use the
  // scatter exclusion zones (the old-yard landmark deliberately borders a route).
  return [...result, ...MakeAuthoredTreePlacements()];
}
export function TreeBlastDamage(distance, radius, damage) {
  if (!(radius > 0) || !(damage > 0) || distance >= radius) return 0;
  return damage * (1 - Math.max(0,distance)/radius) ** 2;
}
