import assert from "node:assert/strict";
import { SampleShotDisk, FirearmHandling, GunClearance, LookSway } from "./Script_FirearmHandling.mjs";
import { LOOK_SWAY } from "./Data_Tuning_FirearmHandling.mjs";
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
const Surface = (distance, normal) => GunClearance(rifle, eye, forward, right,
  (_p, _d, length) => distance <= length ? {t:distance, normal} : null);
assert.equal(Surface(1.0, [0, 1, 0]).lower, 0, "looking down at flat ground a metre off keeps the gun up");
assert.ok(Surface(1.0, [0, 0, 1]).blocked && Surface(1.0, [0, 0, 1]).lower > 0.6, "a wall at the same distance still lowers it");
const bank = Surface(1.0, [0, Math.SQRT1_2, Math.SQRT1_2]).lower;
assert.ok(bank > 0 && bank < Surface(1.0, [0, 0, 1]).lower, "a 45 degree bank sits between floor and wall");
assert.ok(Surface(0.4, {x:0, y:1, z:0}).blocked, "ground right at the barrel (prone) still lowers it");
// COD look sway: a fast mouse turn, uneven per-frame mouse chunks, then a dead stop.
const DEG = Math.PI / 180;
function Flick(fps, turnDegPerS, flickS = 0.35, settleS = 1.2) {
  const sway = new LookSway(), dt = 1 / fps, trace = [];
  const flickFrames = Math.round(flickS * fps);
  for (let i = 0; i < flickFrames + Math.round(settleS * fps); i += 1) {
    const chunk = i < flickFrames ? turnDegPerS * DEG * dt * (i % 2 ? 1.45 : 0.55) : 0;
    sway.Step(dt, -chunk, chunk * 0.3, 1, 0);   // turning right and a little up
    trace.push({ flick: i < flickFrames, yaw: sway.yaw, pitch: sway.pitch, x: sway.x, roll: sway.roll });
  }
  return trace;
}
const capYaw = LOOK_SWAY.maxDegPerFrame * LOOK_SWAY.yawScale * DEG;
for (const fps of [144, 60, 30, 20]) {
  const fast = Flick(fps, 900), during = fast.filter((s) => s.flick), after = fast.filter((s) => !s.flick);
  const peak = Math.max(...fast.map((s) => Math.abs(s.yaw)));
  assert.ok(peak <= capYaw * 1.0001 && peak > capYaw * 0.6, `${fps} fps: a 900 deg/s flick trails by at most the COD cap (${peak / DEG} deg)`);
  assert.ok(Math.max(...fast.map((s) => Math.abs(s.x))) <= LOOK_SWAY.maxDegPerFrame * LOOK_SWAY.horizM * 1.0001, `${fps} fps: lateral lag is capped`);
  assert.ok(during.at(-1).yaw > 0 && during.at(-1).x < 0 && during.at(-1).pitch < 0, `${fps} fps: turning right/up the muzzle trails left/down`);
  // No rebound: after the stop the lag only shrinks and never crosses to the other side.
  for (let i = 1; i < after.length; i += 1) {
    assert.ok(after[i].yaw >= 0 && after[i].yaw <= after[i - 1].yaw + 1e-12, `${fps} fps: settles without overshoot`);
    assert.ok(after[i].pitch <= 0 && after[i].x <= 0, `${fps} fps: offset never springs past centre`);
  }
  assert.ok(Math.abs(after.at(-1).yaw) < capYaw * 0.01, `${fps} fps: settled within 1.2 s`);
  // Uneven mouse chunks (0.55x / 1.45x per frame) must not shake the gun back and forth.
  let reversals = 0;
  for (let i = 2; i < during.length; i += 1) if ((during[i].yaw - during[i - 1].yaw) * (during[i - 1].yaw - during[i - 2].yaw) < 0) reversals += Math.abs(during[i].yaw - during[i - 1].yaw);
  assert.ok(reversals < capYaw * 0.35, `${fps} fps: frame-to-frame mouse jitter stays filtered (${reversals / DEG} deg)`);
}
const moderate = (fps) => Math.max(...Flick(fps, 150).map((s) => Math.abs(s.yaw)));
assert.ok(Math.abs(moderate(20) - moderate(60)) < moderate(60) * 0.15, "same response at 20 and 60 fps");
const aimed = new LookSway().Step(1 / 60, -0.2, 0, 0, 0);
assert.equal(aimed.yaw, 0, "no look sway when the weapon's gain is zero (ADS)");
console.log(JSON.stringify({centerHalfFraction:inner/count, mean:[sumX/count,sumY/count], quadrants,
  lookSwayPeakDeg: { at60: moderate(60) / DEG, at20: moderate(20) / DEG, cap: capYaw / DEG }}));
console.log("FirearmHandlingTest OK");
