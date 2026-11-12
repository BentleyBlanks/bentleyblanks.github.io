import assert from "node:assert/strict";
import { SampleShotDisk, FirearmHandling, GunClearance, LookSway, AimIdleSway, AdsMoveBob, CyclePlayedS, CycleReferenceS } from "./Script_FirearmHandling.mjs";
import { FPS_BOLT_CYCLE } from "./Data_Tuning_FpsReload.mjs";
import { LOOK_SWAY, ADS_LOOK_SWAY, ADS_MOVE_BOB } from "./Data_Tuning_FirearmHandling.mjs";
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
function Flick(fps, turnDegPerS, flickS = 0.35, settleS = 1.2, tuning = LOOK_SWAY) {
  const sway = new LookSway(tuning), dt = 1 / fps, trace = [];
  const flickFrames = Math.round(flickS * fps);
  for (let i = 0; i < flickFrames + Math.round(settleS * fps); i += 1) {
    const chunk = i < flickFrames ? turnDegPerS * DEG * dt * (i % 2 ? 1.45 : 0.55) : 0;
    sway.Step(dt, -chunk, chunk * 0.3, 1, 0);   // turning right and a little up
    trace.push({ flick: i < flickFrames, yaw: sway.yaw, pitch: sway.pitch, x: sway.x, y: sway.y, roll: sway.roll });
  }
  return trace;
}
const capYaw = LOOK_SWAY.maxDegPerFrame * LOOK_SWAY.yawScale * DEG;
for (const fps of [144, 60, 30, 20]) {
  const fast = Flick(fps, 900), during = fast.filter((s) => s.flick), after = fast.filter((s) => !s.flick);
  const peak = Math.max(...fast.map((s) => Math.abs(s.yaw)));
  assert.ok(peak <= capYaw * 1.03 && peak > capYaw * 0.6, `${fps} fps: a 900 deg/s flick trails by at most the cap (${peak / DEG} deg)`);
  assert.ok(Math.max(...fast.map((s) => Math.abs(s.x))) <= LOOK_SWAY.maxDegPerFrame * LOOK_SWAY.horizM * 1.03, `${fps} fps: lateral lag is capped`);
  assert.ok(during.at(-1).yaw > 0 && during.at(-1).x < 0 && during.at(-1).pitch < 0, `${fps} fps: turning right/up the muzzle trails left/down`);
  // Spring eases into the lag like a held mass instead of snapping to it.
  assert.ok(during[0].yaw < peak * 0.3, `${fps} fps: the first frame of a turn only starts the lag`);
  // No visible rebound: past centre by at most 3 % of the peak, and no ringing (one crossing at most).
  const crossings = (key) => after.filter((s, i) => i && Math.sign(s[key]) !== Math.sign(after[i - 1][key]) && Math.abs(s[key]) > peak * 1e-3).length;
  assert.ok(Math.min(...after.map((s) => s.yaw)) >= -peak * 0.03, `${fps} fps: settles without visible overshoot`);
  assert.ok(Math.max(...after.map((s) => s.pitch)) <= peak * 0.03 && Math.max(...after.map((s) => s.x)) <= LOOK_SWAY.maxDegPerFrame * LOOK_SWAY.horizM * 0.03, `${fps} fps: offset never springs visibly past centre`);
  assert.ok(crossings("yaw") <= 1 && crossings("x") <= 1, `${fps} fps: no back-and-forth after the stop`);
  assert.ok(after.findIndex((s) => Math.abs(s.yaw) < peak * 0.05) / fps <= 0.4, `${fps} fps: back within 5 % in 0.4 s`);
  assert.ok(Math.abs(after.at(-1).yaw) < capYaw * 0.01, `${fps} fps: settled within 1.2 s`);
  // Uneven mouse chunks (0.55x / 1.45x per frame) must not shake the gun back and forth.
  let reversals = 0;
  for (let i = 2; i < during.length; i += 1) if ((during[i].yaw - during[i - 1].yaw) * (during[i - 1].yaw - during[i - 2].yaw) < 0) reversals += Math.abs(during[i].yaw - during[i - 1].yaw);
  assert.ok(reversals < capYaw * 0.35, `${fps} fps: frame-to-frame mouse jitter stays filtered (${reversals / DEG} deg)`);
}
const moderate = (fps) => Math.max(...Flick(fps, 150).map((s) => Math.abs(s.yaw)));
assert.ok(Math.abs(moderate(20) - moderate(60)) < moderate(60) * 0.15, "same response at 20 and 60 fps");
// Visible hip inertia (2026-11-12): an ordinary 125 deg/s turn trails by about a degree and most of a centimetre.
{
  const turn = Flick(60, 125), yaw = Math.max(...turn.map((s) => s.yaw)), x = Math.min(...turn.map((s) => s.x));
  assert.ok(yaw / DEG >= 1.0 && yaw / DEG <= 1.6 && -x >= 0.006 && -x <= 0.011, `125 deg/s hip turn trails ${yaw / DEG} deg / ${-x * 100} cm`);
}
const aimed = new LookSway().Step(1 / 60, -0.2, 0, 0, 0);
assert.equal(aimed.yaw, 0, "no look sway when the weapon's gain is zero (ADS)");
// ADS look sway: same model, rotation only, bigger lag than the hip.
const adsCap = ADS_LOOK_SWAY.maxDegPerFrame * ADS_LOOK_SWAY.yawScale * DEG;
for (const fps of [144, 60, 30, 20]) {
  const fast = Flick(fps, 900, 0.35, 1.2, ADS_LOOK_SWAY), after = fast.filter((s) => !s.flick);
  const peak = Math.max(...fast.map((s) => Math.abs(s.yaw)));
  assert.ok(peak <= adsCap * 1.0001 && peak > adsCap * 0.5, `${fps} fps: ADS flick trails by at most the cap (${peak / DEG} deg)`);
  assert.ok(fast.every((s) => s.x === 0 && s.y === 0), `${fps} fps: ADS sway is rotation only`);
  for (let i = 1; i < after.length; i += 1) assert.ok(after[i].yaw >= 0 && after[i].yaw <= after[i - 1].yaw + 1e-12, `${fps} fps: ADS settles without overshoot`);
  assert.ok(Math.abs(after.at(-1).yaw) < adsCap * 0.01, `${fps} fps: ADS settled within 1.2 s`);
}
const adsModerate = (fps) => Math.max(...Flick(fps, 150, 0.35, 1.2, ADS_LOOK_SWAY).map((s) => Math.abs(s.yaw)));
assert.ok(Math.abs(adsModerate(20) - adsModerate(60)) < adsModerate(60) * 0.15, "ADS: same response at 20 and 60 fps");

// Idle aim sway: HanYang standing rested (condition 1.12), fully aimed, standing still.
function IdleRun(fps, seconds, args, settleS = 1) {
  const sway = new AimIdleSway(), dt = 1 / fps, peaks = { pitch: 0, yaw: 0 };
  let signChanges = 0, lastSign = 0, last = { pitch: 0, yaw: 0 };
  for (let i = 0; i < Math.round(seconds * fps); i += 1) {
    const arg = typeof args === "function" ? args(i * dt) : args;
    last = sway.Step(dt, { elapsed: i * dt, ...arg });
    if (i * dt < settleS) continue;
    peaks.pitch = Math.max(peaks.pitch, Math.abs(last.pitch)); peaks.yaw = Math.max(peaks.yaw, Math.abs(last.yaw));
    const sign = Math.abs(last.yaw) > 0.1 * DEG ? Math.sign(last.yaw) : 0;   // hysteresis: tremor chatter near zero is not a breath
    if (sign && lastSign && sign !== lastSign) signChanges += 1;
    if (sign) lastSign = sign;
  }
  return { ...peaks, signChanges, last };
}
const rested = { ads: 1, gait: 0, active: true, condition: 1.12, exertion: 0 };
const ads60 = IdleRun(60, 20, rested);
assert.ok(ads60.pitch / DEG >= 0.25 && ads60.pitch / DEG <= 0.75, `ADS idle pitch peak ${ads60.pitch / DEG} deg`);
assert.ok(ads60.yaw / DEG >= 0.20 && ads60.yaw / DEG <= 0.60, `ADS idle yaw peak ${ads60.yaw / DEG} deg`);
const hip60 = IdleRun(60, 20, { ...rested, ads: 0 });
const hipRatio = Math.max(hip60.pitch, hip60.yaw) / Math.max(ads60.pitch, ads60.yaw);
assert.ok(hipRatio >= 0.4 && hipRatio <= 0.6, `hip / ADS idle peak ${hipRatio}`);
const held = IdleRun(60, 20, { ...rested, condition: 1.12 * 0.28 });
assert.ok(held.pitch <= ads60.pitch * 0.35 && held.yaw <= ads60.yaw * 0.35, "held breath keeps at most 0.35x of the rested sway");
const tired = IdleRun(60, 20, { ...rested, exertion: 1 });
assert.ok(tired.signChanges >= ads60.signChanges * 1.4, `exhausted breathing is faster (${tired.signChanges} vs ${ads60.signChanges} yaw sign changes)`);
{
  const sway = new AimIdleSway(), dt = 1 / 60;
  let prev = { pitch: 0, yaw: 0 }, jump = 0;
  for (let i = 0; i < 600; i += 1) {
    const out = sway.Step(dt, { elapsed: i * dt, ...rested, condition: i < 300 ? 1.12 : 0.31 });
    if (i >= 300) jump = Math.max(jump, Math.abs(out.pitch - prev.pitch));
    prev = out;
  }
  assert.ok(jump / DEG < 0.02, `condition jump changes pitch by ${jump / DEG} deg per frame`);
}
const ads30 = IdleRun(30, 20, rested), ads144 = IdleRun(144, 20, rested);
assert.ok(Math.abs(ads30.pitch - ads144.pitch) < ads144.pitch * 0.10 && Math.abs(ads30.yaw - ads144.yaw) < ads144.yaw * 0.10, "idle sway amplitude is frame-rate independent");
const off = IdleRun(60, 4, (t) => ({ ...rested, active: t < 1 }), 99);
assert.ok(Math.abs(off.last.pitch) < 1e-4 && Math.abs(off.last.yaw) < 1e-4, "inactive sway fades to zero");

// Aimed walking bob.
const bobZero = AdsMoveBob(1.3, 0);
assert.ok(Math.abs(bobZero.yaw) + Math.abs(bobZero.pitch) + Math.abs(bobZero.roll) === 0, "zero weight gives no bob");
{
  const n = 3600; let maxYaw = 0, meanYaw = 0, meanPitch = 0, pitchCrossings = 0, yawCrossings = 0, prev = AdsMoveBob(0.0001, 1);
  for (let i = 1; i <= n; i += 1) {
    const b = AdsMoveBob(i / n * Math.PI * 2 + 0.0001, 1);
    maxYaw = Math.max(maxYaw, Math.abs(b.yaw)); meanYaw += b.yaw / n; meanPitch += b.pitch / n;
    if (b.pitch * prev.pitch < 0) pitchCrossings += 1;
    if (b.yaw * prev.yaw < 0) yawCrossings += 1;
    prev = b;
  }
  assert.ok(Math.abs(maxYaw - ADS_MOVE_BOB.yawDeg * DEG) < ADS_MOVE_BOB.yawDeg * DEG * 0.01, "bob yaw reaches its tuned amplitude");
  assert.ok(Math.abs(meanYaw) < 1e-6 && Math.abs(meanPitch) < 1e-6, "bob is zero-mean");
  assert.equal(pitchCrossings, 2 * yawCrossings, "pitch runs two cycles per yaw cycle");
}
// Bolt-cycle time warp (2026-11-13): keys land exactly, the inverse round-trips, the playback
// rate is monotone and continuous across every key (the piecewise-linear map jumped 0.67x -> 2.67x).
{
  const cycle = FPS_BOLT_CYCLE.HanYang, keys = cycle.pace, h = 1e-5;
  for (const [reference, played] of keys) {
    assert.ok(Math.abs(CyclePlayedS(cycle, reference) - played) < 1e-9, `pace key ${reference} lands on ${played}`);
    const left = (CyclePlayedS(cycle, reference) - CyclePlayedS(cycle, reference - h)) / h;
    const right = (CyclePlayedS(cycle, reference + h) - CyclePlayedS(cycle, reference)) / h;
    assert.ok(Math.abs(left - right) < 1e-3 * Math.max(1, left), `rate is continuous at ${reference} (${left} vs ${right})`);
  }
  let last = -Infinity;
  for (let s = -0.05; s <= cycle.durationS + 0.05; s += 0.001) {
    const played = CyclePlayedS(cycle, s);
    assert.ok(played > last, `time warp is strictly increasing at ${s}`);
    assert.ok(Math.abs(CycleReferenceS(cycle, played) - s) < 1e-6, `inverse round-trips at ${s}`);
    last = played;
  }
}
console.log(JSON.stringify({ adsIdleDeg: { pitch: ads60.pitch / DEG, yaw: ads60.yaw / DEG, hipRatio, held: [held.pitch / DEG, held.yaw / DEG] },
  yawSignChanges: { rested: ads60.signChanges, tired: tired.signChanges }, adsLookCapDeg: adsCap / DEG }));
console.log(JSON.stringify({centerHalfFraction:inner/count, mean:[sumX/count,sumY/count], quadrants,
  lookSwayPeakDeg: { at60: moderate(60) / DEG, at20: moderate(20) / DEG, cap: capYaw / DEG }}));
console.log("FirearmHandlingTest OK");
