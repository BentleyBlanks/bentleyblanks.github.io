// User 2026-09-13: staggered trench shelters; keep a continuous central walking lane.
const Station=(id,x,z,side)=>({id,x,z,side});
export const MISSION_TRENCH_COVER = Object.freeze({
  rally:[Station('RallyRight',-45,35,1),Station('RallyLeft',-45,31,-1)],
  approach:[Station('BreachLeft',-37,11,-1),Station('ReturnRight',-45,-3,1),Station('ShelterLeft',-45,-12,-1)],
  // 03 now enters from the casualty collection point. Every old Support post,
  // including FrontLeft, lies off the walkable rearTrench polyline; routing a
  // detour into it intersects its own wing. Retire those invalid authored
  // shelters. A later space pass may add positions only with real geometry and
  // a capsule-clear connection; this gameplay pass does not invent walls.
  support:[],
  wallOffsetM:1.65,wallWidthM:.9,wallDepthM:.6,wallHeightM:1.25,
  wingOffsetM:2.05,wingLengthM:4.1,wingDepthM:.3,
  watchYawRad:0,postOffsetM:1.45,postRearM:[1.15,2.85],
});
