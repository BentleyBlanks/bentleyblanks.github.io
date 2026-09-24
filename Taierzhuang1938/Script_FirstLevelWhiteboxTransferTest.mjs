// 11–14: adopted Notion topology and Stage_11..14 / supplementary views.
// Pure geometry gate; runtime loading, boarding and air passes remain Mid's gate.
import assert from "node:assert/strict";
import { BuildTransferWhitebox } from "./Data_FirstLevelWhiteboxTransfer.mjs";
import { MISSION_LAYOUT as Layout, MISSION_ROUTES as Routes,
  MISSION_PLACEMENT as Placement } from "./Data_FirstLevelMissionLayout.mjs";
import { SampleMissionTerrain as Ground } from "./Data_FirstLevelMissionTerrain.mjs";
import { MISSION_STAGE_ANCHORS as Anchors } from "./Data_FirstLevelMissionTopology.mjs";
import { MISSION_CROWD_AREAS as Crowds } from "./Data_FirstLevelMissionCrowd.mjs";
import { MISSION_ENCOUNTERS as Encounters, MISSION_TACTICS as Tactics,
  MISSION_PURSUIT_ROUTE as Pursuit } from "./Data_FirstLevelMission.mjs";
import { MID_TUNING as Mid } from "./Data_Tuning_FirstLevelMid.mjs";

const authored = BuildTransferWhitebox(Ground);
assert.equal(new Set(authored.blocks.map(b => b.id)).size, authored.blocks.length);
for (const block of authored.blocks) {
  for (const key of ["x", "z", "w", "h", "d", "y"]) assert.ok(Number.isFinite(block[key]), `${block.id}.${key}`);
  assert.ok(block.w > 0 && block.h > 0 && block.d > 0, block.id);
  assert.ok(Layout.blocks.some(b => b.id === block.id), `${block.id} integrated in Layout`);
}
const solids = [...Layout.blocks, ...Layout.scenario.states.find(s => s.id === "BunkerCollapsed").blocks]
  .filter(b => b.solid !== false && !Layout.walkableSurfaces.some(s => s.id === b.id));
function Contains(box, x, z, y, mx = 0, mz = mx, ceiling = 0) {
  const c = Math.cos(box.ry || 0), s = Math.sin(box.ry || 0), dx = x - box.x, dz = z - box.z;
  return Math.abs(dx * c - dz * s) < box.w / 2 + mx
    && Math.abs(dx * s + dz * c) < box.d / 2 + mz
    && box.y + box.h / 2 > y && box.y - box.h / 2 < y + ceiling;
}
function RouteHits(route, blocks, mx = .35, mz = mx, ceiling = 2.2) {
  const bad = new Set();
  for (let i = 1; i < route.length; i++) {
    const a = route[i - 1], b = route[i], count = Math.ceil(Math.hypot(a.x - b.x, a.z - b.z) / .3);
    for (let j = 0; j <= count; j++) {
      const t = count ? j / count : 0, x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t;
      for (const box of blocks) if (Contains(box, x, z, Ground(x, z) + .3, mx, mz, ceiling - .3)) bad.add(box.id);
    }
  }
  return [...bad];
}
function SightHits(a, b, heightA = 1.6, heightB = 1.4) {
  const bad = new Set(), count = Math.ceil(Math.hypot(a.x - b.x, a.z - b.z) * 5);
  for (let j = 1; j < count; j++) {
    const t = j / count, x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t;
    const y = (Ground(a.x, a.z) + heightA) * (1 - t) + (Ground(b.x, b.z) + heightB) * t;
    if (Ground(x, z) > y + .02) bad.add("terrain");
    for (const box of solids) if (Contains(box, x, z, y, 0, 0, .001)) bad.add(box.id);
  }
  return [...bad];
}

assert.deepEqual(RouteHits(Routes.cartRide, solids, 1.25, 1.45), [], "actual southbound cart lane");
// No roof spans the loading/departure lane: the old enormous canopy is gone.
assert.deepEqual(RouteHits(Routes.cartRide, solids, 1.25, 1.45, 8), [], "open sky above cart lane");
const unload = { x: Anchors.cartHalt.x - Mid.unloadOffsetM, z: Anchors.cartHalt.z };
const ditchMouth = Routes.evacuation[0];
const carry = [unload, { x: 53, z: 114 }];
assert.deepEqual(RouteHits(carry, solids, .8, 1.5), [], "unloaded stretcher reaches west ditch");
assert.deepEqual(RouteHits([ditchMouth, Routes.evacuation[1]], solids, .35), [], "ditch mouth joins real ditch");
for (const bay of Placement.cartBays)
  assert.deepEqual(RouteHits([bay, bay], solids, 2, 3.2), [], `cart bay ${bay.x},${bay.z}`);

const transfer = Crowds.find(c => c.id === "transfer");
// Crowd pockets are existing authored placements; this checks new geometry's
// footprint separately from the full Layout route/vehicle/sight gates above.
for (const point of [...transfer.pockets, ...transfer.walkerPockets])
  assert.deepEqual(RouteHits([point, point], authored.blocks, .75, 1.7), [], "sorting pocket clear of new walls");
for (const group of ["transfer", "transferAlley", "air"]) for (const spawn of Encounters[group]) {
  const route = [spawn, ...(Tactics[spawn.id]?.points || [])];
  assert.deepEqual(RouteHits(route, authored.blocks), [], `${spawn.id} tactics clear of new walls`);
  if (group === "air") assert.deepEqual(RouteHits([spawn, ...Pursuit], authored.blocks), [], `${spawn.id} pursuit clear of new walls`);
}

const villagePost = { x: 66.5, z: 86 }, threatA = Encounters.transfer[0];
assert.ok(SightHits(villagePost, threatA, .65, 1.4).some(id => id.startsWith("TransferVillageWall")), "north wall shields crouched player from A");
assert.deepEqual(SightHits(villagePost, threatA), [], "standing player can engage A over low wall");
const alleyGun = Encounters.transferAlley[0], alleyMouth = { x: 103.5, z: 122 };
for (const point of [Routes.cartRide[2], { x: 76, z: 127 }])
  assert.deepEqual(SightHits(alleyGun, point, 1.1, 1.2), [], "B covers departing carts");
for (const point of [{ x: 66.5, z: 85.5 }, { x: 95, z: 97.5 }])
  assert.deepEqual(SightHits(point, alleyMouth), [], "player can engage the alley mouth");
console.log(`PASS transfer whitebox: ${authored.blocks.length} blocks; 4 cart bays; ${transfer.pockets.length + transfer.walkerPockets.length} crowd pockets; 1.6x3m carry corridor; 6 tactical sight checks`);
