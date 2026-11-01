// Data_BreakableTreePlacements.mjs 的配套函数（2026-11-02 从数据模块搬出来：数据模块只放能导出成 JSON 的数据，见 docs/Data_DataSources.md「数据模块只放数据」）。

import { MISSION_LAYOUT } from "./Data_FirstLevelMissionLayout.mjs";
import { MISSION_TERRAIN } from "./Data_FirstLevelMissionTerrain.mjs";
import { MissionPathDistance, SampleMissionTerrain } from "./Script_FirstLevelMissionTerrain.mjs";
import { BREAKABLE_TREES as T } from "./Data_Tuning_BreakableTrees.mjs";
import { Mulberry32 } from "./Script_Noise.mjs";
import { blocks, routes } from "./Data_BreakableTreePlacements.mjs";

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
