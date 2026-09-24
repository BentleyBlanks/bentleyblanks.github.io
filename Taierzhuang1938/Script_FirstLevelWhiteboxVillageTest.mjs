// Geometric regression for the 06–10 Notion whitebox. Tests the module both
// before and after layout integration, without accepting unrelated baselines.
import assert from "node:assert/strict";
import { BuildVillageWhitebox } from "./Data_FirstLevelWhiteboxVillage.mjs";
import { MISSION_LAYOUT as layout, MISSION_ROUTES as routes, MISSION_PLACEMENT as placement } from "./Data_FirstLevelMissionLayout.mjs";
import { MISSION_ENCOUNTERS as encounters, MISSION_TACTICS as tactics } from "./Data_FirstLevelMission.mjs";
import { SampleMissionTerrain as Ground } from "./Data_FirstLevelMissionTerrain.mjs";
import { MISSION_CROWD_AREAS as areas } from "./Data_FirstLevelMissionCrowd.mjs";
import { MissionCarryRoutePoint, MissionRouteLength } from "./Script_FirstLevelMissionColumn.mjs";

const built = BuildVillageWhitebox(Ground), ids = new Set(built.blocks.map(b => b.id));
const blocks = [...layout.blocks.filter(b => !ids.has(b.id) && !built.replaceBlockIds.includes(b.id)), ...built.blocks]
  .filter(b => b.solid !== false);
const Named = id => blocks.find(b => b.id === id);
function Hits(p, b, radius = .35, eye = null) {
  const c = Math.cos(b.ry || 0), s = Math.sin(b.ry || 0), dx = p.x - b.x, dz = p.z - b.z;
  const low = eye === null ? Ground(p.x, p.z) + .3 : eye;
  const high = eye === null ? Ground(p.x, p.z) + 1.7 : eye;
  return Math.abs(dx * c - dz * s) < b.w / 2 + radius
    && Math.abs(dx * s + dz * c) < b.d / 2 + radius
    && b.y + b.h / 2 > low && b.y - b.h / 2 < high;
}
function Clear(name, points, tested = blocks, radius = .35) {
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i], n = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / .2);
    for (let j = 0; j <= n; j++) {
      const t = n ? j / n : 0, p = { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t };
      assert.deepEqual(tested.filter(box => Hits(p, box, radius)).map(box => box.id), [],
        `${name} blocked at ${p.x.toFixed(2)},${p.z.toFixed(2)}`);
    }
  }
}
function Ray(a, b) {
  const n = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / .1);
  for (let i = 1; i < n; i++) {
    const t = i / n, p = { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t };
    const y = a.y + (b.y - a.y) * t;
    const hit = blocks.find(box => Hits(p, box, 0, y));
    if (hit) return hit.id;
  }
  return null;
}
const Eye = (x, z, h = 1.4) => ({ x, z, y: Ground(x, z) + h });

assert.equal(ids.size, built.blocks.length, "generated ids are unique");
for (const [name, points] of Object.entries(routes)) Clear(name, points, built.blocks);
for (const name of ["southWalk", "village", "courtyardBypass"]) Clear(name, routes[name], blocks, .625);
for (const group of ["village", "melee", "courtyard"]) {
  for (const actor of encounters[group]) {
    assert.deepEqual(built.blocks.filter(b => Hits(actor, b)).map(b => b.id), [], `${actor.id} spawns clear`);
    if (tactics[actor.id]) Clear(actor.id, [actor, ...tactics[actor.id].points]);
  }
}
for (const p of [...placement.collection.litters, ...placement.streetBlock.litterWait])
  assert.deepEqual(built.blocks.filter(b => Hits(p, b, .625)).map(b => b.id), [], "litter waits clear");
for (const area of areas) for (const [kind, pockets] of [["litter",area.pockets],["walker",area.walkerPockets]])
  for (const pocket of pockets) for (const route of [
    [area.trigger,{x:area.trigger.x,z:area.entryZ},{x:pocket.x,z:area.entryZ},pocket],
    [pocket,{x:pocket.x,z:area.exitZ},area.merge],
  ]) for (let distance=0; distance<MissionRouteLength(route); distance+=.3) {
    const p=MissionCarryRoutePoint(route,distance);
    for (const offset of kind==="litter"?[-1.28,0,1.28]:[0]) {
      const carrier={x:p.x-Math.sin(p.yaw)*offset,z:p.z-Math.cos(p.yaw)*offset};
      assert.deepEqual(built.blocks.filter(b=>Hits(carrier,b,.32)).map(b=>b.id),[],
        `${area.id} ${kind} actual staging/carrier sweep`);
    }
  }

Clear("east alley through side room to connected house", [
  {x:88,z:11},{x:76,z:11},{x:70,z:10},{x:66,z:8.6},{x:62.5,z:8.6},
]);
assert.equal(Ray(Eye(82,5,1.3), Eye(76.65,12,1.3)), null, "east window still covers north street");
assert.equal(Ray(Eye(70,10,1.3), Eye(83.2,5,1.3)), null, "side room can flank the street window");
const yardGun=encounters.village.find(actor=>actor.id==="VillageGunner");
const streetGun=encounters.village.find(actor=>actor.id==="RearWindow");
assert.equal(yardGun.x,placement.sideRoomGunner.x);
assert.equal(yardGun.z,placement.sideRoomGunner.z);
assert.equal(streetGun.x,placement.streetBlock.windowShooter.x);
assert.equal(streetGun.z,placement.streetBlock.windowShooter.z);
assert.ok(yardGun.hold && streetGun.hold,"both authored windows retain their sentries");
assert.equal(Ray(Eye(yardGun.x,yardGun.z,1.35),Eye(53,34,1.1)),null,
  "side room's real gun controls the inner yard gate");
assert.equal(Ray(Eye(streetGun.x,streetGun.z,1.3),Eye(76.65,12,1.3)),null,
  "the real street sentry controls the north street");
Clear("player flanks the real yard gun",[{x:58,z:8.5},{x:62.5,z:8.5},{x:65.5,z:8.5},{x:70,z:10}]);
assert.equal(Ray(Eye(70,10),Eye(yardGun.x,yardGun.z)),null,
  "connected-house east doorway leads to a clear shot at the actual courtyard gunner");
for (const p of placement.streetBlock.litterWait)
  for (const threat of [Eye(83.2,5), Eye(76.65,20)])
    assert.ok(Ray(threat, Eye(p.x,p.z)), "waiting litters retain real cover");
const west = Named("StreetBlockFallenWall"), east = Named("StreetBlockCart");
assert.ok(Math.abs(east.x-east.w/2-(west.x+west.w/2)-.9)<.001, "street man-gap remains 0.9 m");
for (const z of [-9,8]) for (let x=52.2; x<64; x+=.15) {
  const p={x,z};
  assert.ok(built.blocks.some(b => b.semantic==="roof" &&
    Math.abs(x-b.x)<b.w/2 && Math.abs(z-b.z)<b.d/2 && b.y-b.h/2>Ground(x,z)+2.5),
  "continuous roof covers the whole room, including the centre ridge");
}
for (const id of ["Kitchen","ConnectedHouse","MachineGunHouse","SideRoom"]) {
  const soffit=Named(`${id}Soffit`);
  const expected=id==="SideRoom"?{w:8,d:13.2}:{w:12,d:15};
  assert.ok(soffit && soffit.w>=expected.w && soffit.d>=expected.d && soffit.h>=.3,
    `${id} has a single solid ceiling, closing oblique sightlines through roof risers`);
}
const header=Named("CourtyardGateHeader"), cap=Named("CourtyardGateCap");
assert.ok(header.y-header.h/2>=Ground(53,34)+2.4 && header.y-header.h/2<=Ground(53,34)+2.5,
  "gate header rests on the 2.5 m wall while leaving 2.4 m headroom");
assert.ok(header.y+header.h/2>=cap.y-cap.h/2,"gate roof rests on its header");
console.log(`PASS village whitebox: ${built.blocks.length} blocks, routes, litter width, actors, side-door access and firing lanes`);
