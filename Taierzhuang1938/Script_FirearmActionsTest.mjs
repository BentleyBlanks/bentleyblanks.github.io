import assert from "node:assert/strict";
import { FirearmCadence, FirearmReloadTimeline, RecoilAfterInput, GunReadyFromCover } from "./Script_FirearmActions.mjs";
import { WEAPONS } from "./Data_Weapons.mjs";
import { RELOAD_EVENTS } from "./Data_Tuning_FirearmActions.mjs";

for (const weapon of [WEAPONS.Zb26, WEAPONS.Type11, WEAPONS.Type92Hmg]) {
  for (const fps of [20, 30, 60, 120, 144]) {
    const clock = new FirearmCadence(), times = [];
    for (let frame = 0; frame < fps * 12; frame++) {
      clock.Step(1 / fps);
      if (clock.Ready()) { times.push(frame / fps); clock.Fired(weapon.fireIntervalS, frame === 0); }
    }
    assert.ok(Math.abs(times.length - 12 / weapon.fireIntervalS) <= 1, `${weapon.id} @ ${fps}: ${times.length}`);
    for (let index = 0; index < times.length; index++)
      assert.ok(Math.abs(times[index] - index * weapon.fireIntervalS) <= 1 / fps + 1e-8, "fractional phase is retained");
    // A reload/blocked/idle period cannot accumulate deferred shots.
    for (let i = 0; i < fps * 10; i++) clock.Step(1 / fps);
    assert.ok(clock.Ready()); clock.Fired(weapon.fireIntervalS);
    assert.equal(clock.remainingS, weapon.fireIntervalS);
  }
}
for (const weapon of Object.values(WEAPONS).filter(w => w.reloadKind)) {
  assert.ok(RELOAD_EVENTS[weapon.reloadKind], weapon.id);
  const timeline = new FirearmReloadTimeline(weapon), events = [];
  for (const t of [0, 0.11, 0.39, 0.91, 0.91, 1, 1]) timeline.Advance(t, e => events.push(e));
  assert.equal(events.filter(e => e.id === "loaded").length, 1, `${weapon.id} commits exactly once`);
  assert.ok(events.find(e => e.id === "loaded").at >= 0.6, "ammo waits for actual insertion");
  assert.equal(new Set(events.map(e => e.id)).size, events.length);
}
const early = new FirearmReloadTimeline(WEAPONS.HanYang), cancelled = [];
early.Advance(0.4, e => cancelled.push(e));
assert.ok(!cancelled.some(e => e.id === "loaded"), "cancelling before insertion never grants rounds");
const partial=new FirearmReloadTimeline(WEAPONS.HanYang,{packetRounds:2}),partialEvents=[];
partial.Advance(.66,event=>partialEvents.push(event));
assert.ok(!partialEvents.some(event=>event.id==="loaded"),"a partial packet must be removed before the fresh one can finish insertion");
partial.Advance(1,event=>partialEvents.push(event));
assert.equal(partialEvents.find(event=>event.id==="loaded").at,.70);
assert.equal(partialEvents.filter(event=>event.id==="loaded").length,1);
const alreadyOpen=new FirearmReloadTimeline(WEAPONS.HanYang,{startedOpen:true});
assert.ok(!alreadyOpen.events.some(event=>event.id==="open"),"an already open bolt must not replay its opening cue");
assert.equal(RecoilAfterInput(12, -10), 2);
assert.equal(RecoilAfterInput(2, -10), 0);
assert.equal(RecoilAfterInput(-4, 3), -1);
assert.equal(RecoilAfterInput(4, 3), 4);
assert.equal(GunReadyFromCover({blocked:false,lower:0.31},0.1),false);
assert.equal(GunReadyFromCover({blocked:false,lower:0},0.31),false);
assert.equal(GunReadyFromCover({blocked:false,lower:0},0.1),true);
assert.equal(WEAPONS.Type11.bipod,true);
assert.equal(WEAPONS.Type38.shotCue,"rifleIja");
assert.equal(WEAPONS.Type11.shotCue,"type11");
console.log("FirearmActionsTest OK: cadence at 20/30/60/120/144 FPS, blocked-clock restart, mechanical events, recoil compensation and cover readiness");
