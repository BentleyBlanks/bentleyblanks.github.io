// Stretcher column walking character (Script_LitterGait): every litter team has its own
// pace, stops for a moment now and then, and drifts a little either side of the road.
import assert from "node:assert/strict";
import { LITTER_GAIT as G } from "./Data_Tuning_SquadMarch.mjs";
import { MISSION_TUNING as R } from "./Data_Tuning_FirstLevel.mjs";
import { LitterGaitCreate, LitterGaitStep, LitterGaitLane } from "./Script_LitterGait.mjs";
import { FirstLevelMissionColumn, MissionRouteProjection } from "./Script_FirstLevelMissionColumn.mjs";

const DT = 1 / 30;
const Ok = (name) => console.log(`ok ${name}`);

// --- pure gait ------------------------------------------------------------------------
{
  const a = LitterGaitCreate("Litter0", 0), b = LitterGaitCreate("Litter0", 0), c = LitterGaitCreate("Litter1", 1);
  assert.deepEqual(a, b, "same id and index give the same character (replayable)");
  assert.notEqual(a.stride, c.stride, "different teams get different strides");
  assert.ok(a.laneBase < 0 && c.laneBase > 0, "neighbouring teams take opposite sides of the road");
  for (let i = 0; i < 40; i++) {
    const g = LitterGaitCreate(`L${i}`, i);
    assert.ok(g.stride >= G.strideMin && g.stride <= G.strideMax, "stride inside the tuned range");
    assert.ok(Math.abs(LitterGaitLane(g, i * 3.7)) <= G.laneLimitM + 1e-9, "lane inside the limit");
    assert.equal(Math.abs(LitterGaitLane(g, 5, 0)), 0, "envelope 0 puts the team back on the centre line");
  }
  // A team that cannot advance never uses up its walking time and never stops for effect.
  const g = LitterGaitCreate("Held", 0);
  for (let i = 0; i < 30 * 60; i++) LitterGaitStep(g, DT, { time: i * DT, wantMove: false, canPause: true, room: 0, base: R.litterSpeedMps, peers: [] });
  assert.equal(g.stops, 0, "a blocked team does not count blocked time as walking");
  assert.equal(g.speed, 0);
  Ok("pure gait: replayable, distinct, lane-limited, blocked teams stay put");
}
{
  // Refused stops are retried later, never granted early: one peer stopped → a second may not stop.
  const g = LitterGaitCreate("Second", 1);
  g.runLeft = 0;
  const peer = { phase: "pause", lastStop: 0 };
  LitterGaitStep(g, DT, { time: 1, wantMove: true, canPause: true, room: 50, base: 1.4, peers: [peer] });
  assert.equal(g.phase, "walk", "the density rule refuses a second stop while the only peer is stopped");
  assert.ok(g.runLeft > 0, "the refused stop is retried later, not every frame");
  g.runLeft = 0;
  LitterGaitStep(g, DT, { time: 2, wantMove: true, canPause: false, room: 50, base: 1.4, peers: [] });
  assert.equal(g.phase, "walk", "no stop where standing still is not allowed");
  g.runLeft = 0;
  g.speed = 1.4;
  LitterGaitStep(g, DT, { time: 30, wantMove: true, canPause: true, room: 50, base: 1.4, peers: [{ phase: "walk", lastStop: 0 }] });
  assert.equal(g.phase, "pause", "a stop is granted when nobody nearby is stopped");
  let time = 30, speeds = [];
  while (g.phase === "pause") { time += DT; speeds.push(LitterGaitStep(g, DT, { time, wantMove: true, canPause: true, room: 50, base: 1.4, peers: [] })); }
  assert.ok(speeds.some((v) => v < G.movingMps), "the team really comes to a stop during the pause");
  assert.ok(Math.max(...speeds.slice(1).map((v, i) => speeds[i] - v)) <= G.decelMps2 * DT + 1e-9, "it brakes, it does not freeze in place");
  Ok("pure gait: density rule, safe places only, smooth braking");
}

// --- real column, south walk -------------------------------------------------------------
function Run(seconds, { gateOpen = false, mutate = () => {} } = {}) {
  const column = new FirstLevelMissionColumn();
  column.Activate();
  column.gateOpen = gateOpen;
  const log = column.litters.map(() => ({ stopped: false, stops: [], starts: [], maxLane: 0, speeds: [] }));
  const overlaps = [];
  let stoppedMax = 0;
  for (let step = 0; step < seconds / DT; step++) {
    mutate(column, step);
    column.Update(DT, { moving: true });
    let stopped = 0;
    column.litters.forEach((litter, i) => {
      const entry = log[i], phase = litter.gait?.phase === "pause";
      if (phase) stopped++;
      if (phase && !entry.stopped) entry.stops.push(column.elapsed);
      if (!phase && entry.stopped) entry.starts.push(column.elapsed);
      entry.stopped = phase;
      if (!litter.staging && !litter.stagedAreas?.length)
        entry.maxLane = Math.max(entry.maxLane, MissionRouteProjection(column.route, litter).distance);
      entry.speeds.push(litter.gait?.speed ?? 0);
    });
    stoppedMax = Math.max(stoppedMax, stopped);
    for (let i = 1; i < column.litters.length; i++) {
      // Teams that reach a staging area are gathered there on purpose (their own pockets), so only the free road counts.
      const front = column.litters[i - 1], litter = column.litters[i], gap = front.progress - litter.progress;
      if (!front.staging && !litter.staging && !litter.stagedAreas?.length && gap < R.litterSpacingM - 1e-6) overlaps.push({ step, i, gap });
    }
  }
  return { column, log, overlaps, stoppedMax };
}

const first = Run(150, { gateOpen: true });
const { column, log } = first;
assert.ok(column.litters.every((litter) => litter.gait), "every litter of the south walk has a gait");
assert.equal(first.overlaps.length, 0, "teams never close up inside the litter spacing");
const stops = log.map((entry) => entry.stops.length);
assert.ok(stops.filter((n) => n >= 1).length >= Math.ceil(R.litterCount / 2), `most teams stop at least once in 150 s (${stops})`);
const maxAllowed = Math.max(1, Math.floor(R.litterCount * G.restFraction));
assert.ok(first.stoppedMax <= maxAllowed, `at most ${maxAllowed} teams stopped at once, saw ${first.stoppedMax}`);
const allStops = log.flatMap((entry) => entry.stops).sort((a, b) => a - b);
for (let i = 1; i < allStops.length; i++)
  assert.ok(allStops[i] - allStops[i - 1] >= G.stopGapS - DT, `new stops at least ${G.stopGapS} s apart (${allStops[i] - allStops[i - 1]})`);
for (const entry of log) assert.ok(entry.maxLane <= G.laneLimitM + .05, `a team never leaves its lane (${entry.maxLane.toFixed(2)} m)`);
assert.ok(log.some((entry) => entry.maxLane > .1), "the teams really drift off the centre line");
const meanSpeeds = log.map((entry) => entry.speeds.filter((v) => v > G.movingMps).reduce((a, v) => a + v, 0) / entry.speeds.filter((v) => v > G.movingMps).length);
assert.ok(Math.max(...meanSpeeds) - Math.min(...meanSpeeds) > .12, `some teams are clearly quicker than others (${meanSpeeds.map((v) => v.toFixed(2))})`);
assert.ok(column.litters.every((litter) => litter.state === "moving" || litter.state === "waiting"));
Ok(`column: ${stops.join("/")} stops per team, at most ${first.stoppedMax} at once, spacing kept, lanes ≤ ${Math.max(...log.map((e) => e.maxLane)).toFixed(2)} m`);

const again = Run(150, { gateOpen: true });
assert.deepEqual(again.log.map((entry) => entry.stops), log.map((entry) => entry.stops), "same run replays the same stops");
Ok("column: deterministic replay");

// The march still arrives: the gate holds the queue, opening it lets everyone through.
{
  const held = Run(200, { gateOpen: false });
  const gate = held.column.GateProgress();
  assert.ok(held.column.litters.every((litter) => litter.progress <= gate - 3 + 1e-6), "a closed gate still holds every team outside");
  const open = Run(260, { gateOpen: true });
  assert.equal(open.column.State().gatePassed, R.litterCount, "an open gate lets every team through");
  Ok("column: gate still holds and releases the column");
}

// Snapshot/restore keeps the gait (plain data) and later behaviour identical.
{
  const a = new FirstLevelMissionColumn();
  a.Activate();
  for (let i = 0; i < 600; i++) a.Update(DT, { moving: true });
  const b = new FirstLevelMissionColumn();
  b.Restore(a.Snapshot());
  for (let i = 0; i < 900; i++) { a.Update(DT, { moving: true }); b.Update(DT, { moving: true }); }
  assert.deepEqual(b.litters.map((l) => [l.progress, l.x, l.z]), a.litters.map((l) => [l.progress, l.x, l.z]));
  Ok("column: snapshot and restore replay the same walk");
}

// Other stages keep their old, exact walk: no gait outside the south walk or on a join route.
{
  const other = new FirstLevelMissionColumn();
  other.Activate();
  other.mode = "retreat";
  for (let i = 0; i < 60; i++) other.Update(DT, { moving: true });
  assert.ok(other.litters.every((litter) => !litter.gait), "no gait outside the south walk");
  Ok("column: only the south walk gets the gait");
}
