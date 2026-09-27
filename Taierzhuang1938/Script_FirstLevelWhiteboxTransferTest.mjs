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

// 12 守来时路（docs/Data_FirstLevelTransferCover20260927.md）：两挺机枪都量它们跑到位之后的地方
// （MISSION_TACTICS 的最后一个折点），不是出生点 —— 出生点在门楼以北的街里 / 东巷北头，本来就看不见。
const villagePost = Anchors.transferWall, threatA = Tactics[Encounters.transfer[0].id].points.at(-1);
assert.ok(SightHits(villagePost, threatA, .65, 1.4).some(id => id.startsWith("TransferVillageWall")), "north wall shields crouched player from A");
assert.deepEqual(SightHits(villagePost, threatA), [], "standing player can engage A over low wall");
assert.deepEqual(SightHits(threatA, Mid.loadingThreatPoint, 1.1, 1.2), [], "A fires down the road into the loading queue");
const alleyGun = Tactics[Encounters.transferAlley[0].id].points.at(-1);
for (const point of [Routes.cartRide[2], { x: 76, z: 127 }])
  assert.deepEqual(SightHits(alleyGun, point, 1.1, 1.2), [], "B covers departing carts");
// 东巷口在守线右手：从低墙东段打得到它，从顺子的射口打不到 —— 第二拨逼玩家沿墙往右挪。
const eastEnd = { x: 91.5, z: 85.6 };
assert.deepEqual(SightHits(eastEnd, alleyGun, 1.6, 1.1), [], "player can engage the side-lane gun from the east end of the wall");
assert.ok(SightHits(villagePost, alleyGun, 1.6, 1.1).length > 0, "the side-lane gun is out of sight from the notch");
console.log(`PASS transfer whitebox: ${authored.blocks.length} blocks; 4 cart bays; ${transfer.pockets.length + transfer.walkerPockets.length} crowd pockets; 1.6x3m carry corridor; 7 tactical sight checks`);
