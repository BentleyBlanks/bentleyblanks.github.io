import assert from "node:assert/strict";
import { SampleShotDisk, FirearmHandling, GunClearance } from "./Script_FirearmHandling.mjs";
import { WEAPONS } from "./Data_Weapons.mjs";
import { Mulberry32 } from "./Script_Noise.mjs";

const random = Mulberry32(1938), count = 40000;
let sumX = 0, sumY = 0, inner = 0;
const quadrants = [0, 0, 0, 0];
for (let i = 0; i < count; i += 1) {
  const p = SampleShotDisk(random), r = Math.hypot(p.x, p.y);
  assert.ok(Number.isFinite(r) && r <= 1);
  sumX += p.x; sumY += p.y; inner += r < 0.5;
  quadrants[(p.x < 0 ? 1 : 0) + (p.y < 0 ? 2 : 0)] += 1;
}
assert.ok(inner / count > 0.64 && inner / count < 0.70, "central half-radius contains about two thirds of shots, not one quarter");
assert.ok(Math.hypot(sumX, sumY) / count < 0.01);
assert.ok(quadrants.every((n) => Math.abs(n / count - 0.25) < 0.01));
const state = new FirearmHandling(), gun = WEAPONS.Zb26, rifle = WEAPONS.ZhongZheng;
for (let i = 0; i < 12; i += 1) { state.RecordShot(gun); state.Step(gun.fireIntervalS, 0); }
assert.equal(state.Bloom(gun), 1, "continuous burst grows to a bounded maximum");
assert.equal(state.SpreadScale(rifle), 1, "weapon changes do not transfer bloom");
assert.ok(state.RecoilScale(gun, "stand") > 2);
assert.ok(state.RecoilScale(gun, "crouch") < state.RecoilScale(gun, "stand"));
assert.ok(state.RecoilScale(gun, "prone", true) < state.RecoilScale(gun, "prone"));
assert.equal(state.RecoilScale(rifle, "stand"), 1, "bolt rifles keep their single-shot recoil");
state.Step(0.4, 0);
assert.ok(state.Bloom(gun) > 0 && state.Bloom(gun) < 1, "stopping recovers progressively");
state.Step(2, 0); assert.equal(state.Bloom(gun), 0);
state.RecordShot(rifle); state.Step(rifle.fireIntervalS, 0);
assert.equal(state.Bloom(rifle), 0, "bolt cycle gives full recovery before next round");
state.Step(0.1, 1); state.Step(0.1, 0);
assert.ok(state.movement > 0 && state.movement < 1, "stopping movement requires a short settling period");
const eye = {x:0,y:1.62,z:0}, forward = {x:0,y:0,z:-1}, right = {x:1,y:0,z:0};
const Probe = (distance, weapon = rifle) => GunClearance(weapon, eye, forward, right,
  (_p, _d, length) => distance <= length ? {t:distance} : null);
assert.equal(Probe(3).lower, 0);
assert.ok(Probe(1.4).lower > 0 && !Probe(1.4).blocked);
assert.ok(Probe(0.5).lower > 0.8 && Probe(0.5).blocked);
assert.ok(!Probe(0.5, WEAPONS.ServicePistol).blocked, "short weapons can be used closer to cover");
assert.equal(Probe(0.2, WEAPONS.Dadao).lower, 0, "melee and thrown items retain their own actions");
assert.deepEqual(Probe(0.5), Probe(0.5), "visual lowering cannot change the intended-barrel probe");
console.log(JSON.stringify({centerHalfFraction:inner/count, mean:[sumX/count,sumY/count], quadrants}));
console.log("FirearmHandlingTest OK");
