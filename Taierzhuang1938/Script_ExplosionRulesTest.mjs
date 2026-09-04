import assert from "node:assert/strict";
import { TerrainDeformation } from "./Script_TerrainDeformation.mjs";
import { FindReturnableGrenade, RegisterGrenadeReturn } from "./Script_GrenadeReturn.mjs";
import { InteractSystem } from "./Script_Interact.mjs";
import { EXPLOSIVES, TERRAIN_DEFORMATION, GRENADE_RETURN } from "./Data_Explosives.mjs";
import { EXPLOSION_GRENADES, EXPLOSION_VEHICLES } from "./Data_ExplosionRange.mjs";
import { WEAPONS } from "./Data_Weapons.mjs";

const bounds = { minX: -30, maxX: 30, minZ: -30, maxZ: 30 };
const terrain = new TerrainDeformation({ bounds });
const depths = {};
for (const id of Object.keys(EXPLOSIVES)) {
  terrain.Clear(); terrain.ApplyBlast({ x: 0, y: 0, z: 0 }, id);
  depths[id] = -terrain.GroundHeight(0, 0);
  assert.ok(depths[id] > 0, `${id} excavates soil`);
}
assert.ok(depths.GrenadeBundle > depths.Grenade && depths.Shell57 > depths.Shell37);
assert.ok(depths.Shell75 > depths.Shell57);
terrain.Clear();
let previous = 0;
for (let i = 0; i < 80; i++) {
  const y = terrain.GroundHeight(0, 0);
  terrain.ApplyBlast({ x: 0, y, z: 0 }, "Shell75");
  const depth = -terrain.GroundHeight(0, 0);
  assert.ok(depth >= previous - 1e-6 && depth <= TERRAIN_DEFORMATION.maxDepthM + 1e-5);
  previous = depth;
}
assert.ok(previous > TERRAIN_DEFORMATION.maxDepthM - 0.001, "stacked crater reaches the real depth cap");
for (let z = -22; z <= 22; z++) for (let x = -22; x <= 22; x++) {
  const a = terrain.Node(x, z);
  for (const [dx, dz] of [[1, 0], [0, 1]]) assert.ok(Math.abs(a - terrain.Node(x + dx, z + dz))
    <= TERRAIN_DEFORMATION.maxAxisGrade * TERRAIN_DEFORMATION.cellM + 1e-5, "deep crater always has a traversable ramp");
}
// Tile-seam and negative-coordinate blasts must write both render/collider tiles.
terrain.Clear(); terrain.ApplyBlast({ x: 8, y: 0, z: -8 }, "Shell57");
const dirty = terrain.TakeDirty(); assert.ok(dirty.length >= 4 && terrain.GroundHeight(8, -8) < -0.1);
assert.equal(terrain.TakeDirty().length, 0, "only changed tiles rebuild");
assert.equal(terrain.ApplyBlast({ x: 0, y: 30, z: 0 }, "Grenade"), null, "airbursts do not excavate faraway soil");
assert.equal(terrain.ApplyBlast({ x: NaN, y: 0, z: 0 }, "Grenade"), null);
terrain.Clear(); assert.equal(terrain.GroundHeight(8, -8), 0); assert.equal(terrain.State().bytes, 0);
const protectedTerrain = new TerrainDeformation({ bounds, CanDeform: (x) => x < 1.5 });
for (let i = 0; i < 20; i++) protectedTerrain.ApplyBlast({ x: 0, y: protectedTerrain.GroundHeight(0, 0), z: 0 }, "Shell75");
assert.equal(protectedTerrain.GroundHeight(1.5, 0), 0, "foundation retained");
assert.ok(-protectedTerrain.GroundHeight(1.25, 0) <= TERRAIN_DEFORMATION.cellM * TERRAIN_DEFORMATION.maxAxisGrade + 1e-5);

const player = { Alive: true, position: { x: 0, y: 0, z: 0 }, yaw: 0 };
const MakeGrenade = (overrides = {}) => ({ alive: true, kind: "Grenade", owner: "ija", fuse: 2, age: 1,
  position: { x: 0, y: 0.05, z: -1 }, ...overrides });
const grenade = MakeGrenade();
assert.equal(FindReturnableGrenade([grenade], player), grenade);
assert.equal(FindReturnableGrenade([MakeGrenade({ fuse: GRENADE_RETURN.minFuseS })], player), null);
assert.equal(FindReturnableGrenade([grenade], player, () => false), null, "wall blocks pickup");
assert.equal(FindReturnableGrenade([MakeGrenade({ age: 0 })], player), null, "no recatching immediately after own throw");
assert.equal(FindReturnableGrenade([MakeGrenade({ position: { x: 0, y: 3, z: 0 } })], player), null, "no through-floor pickup");
assert.equal(FindReturnableGrenade([MakeGrenade({ position: { x: 8, y: 0, z: 0 } })], player), null);
assert.equal(FindReturnableGrenade([grenade], { ...player, Alive: false }), null);
const urgent = MakeGrenade({ fuse: 1 }); assert.equal(FindReturnableGrenade([grenade, urgent], player), urgent);
const interact = new InteractSystem({}, {}); let picked = 0;
RegisterGrenadeReturn(interact, { ReturnCandidate: () => grenade, BeginReturn: () => { picked++; return true; } }, player);
interact.Register({ id: "OtherFixture", position: grenade.position, label: "other", OnComplete: () => assert.fail("live grenade has priority") });
assert.equal(interact.Query(player).point.id, "LiveGrenadeReturn"); interact.Press(player); assert.equal(picked, 1);
assert.deepEqual(EXPLOSION_GRENADES.map((g) => g.id).sort(), Object.values(WEAPONS).filter((w) => w.kind === "throwable").map((w) => w.id).sort());
assert.deepEqual(EXPLOSION_VEHICLES.map((g) => g.id).sort(), Object.values(WEAPONS).filter((w) => w.kind === "vehicle" && w.side === "ija").map((w) => w.id).sort());
assert.equal(new Set(EXPLOSION_VEHICLES.map((v) => v.z)).size, 1, "lineup is horizontal");
assert.ok(EXPLOSION_VEHICLES.every((v) => EXPLOSIVES[v.explosive]));
console.log("PASS ExplosionRulesTest: inventory, ordnance response, stacking/depth/slope, seams, reset, foundations, live-grenade reach/fuse/priority");
