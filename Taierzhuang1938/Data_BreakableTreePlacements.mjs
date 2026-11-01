import { MISSION_LAYOUT, MISSION_ROUTES } from "./Data_FirstLevelMissionLayout.mjs";
import { MISSION_REAR_ROUTES, MISSION_STAGE_ROUTES } from "./Data_FirstLevelMissionTopology.mjs";
import { FRONT_SPACE, FRONT_SORTIE, FRONT_TANK_PATH } from "./Data_FirstLevelFrontRoute.mjs";

// Reserve every authored route, including future scenario geometry. Nothing is
// tied to the current stage; retries regenerate the same entire planting plan.
function PointRoutes(value, result = []) {
  if (Array.isArray(value) && value.length > 1 && value.every(p => Number.isFinite(p?.x) && Number.isFinite(p?.z))) result.push(value);
  else if (value && typeof value === "object") for (const v of Object.values(value)) PointRoutes(v, result);
  return result;
}
export const routes = PointRoutes([MISSION_ROUTES, MISSION_REAR_ROUTES, MISSION_STAGE_ROUTES, FRONT_SPACE, FRONT_SORTIE, FRONT_TANK_PATH]);
export const blocks = [...MISSION_LAYOUT.blocks, ...MISSION_LAYOUT.gates, ...MISSION_LAYOUT.scenario.states.flatMap(s => s.blocks)];
