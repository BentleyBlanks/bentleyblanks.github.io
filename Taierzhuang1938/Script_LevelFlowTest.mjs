import assert from "node:assert/strict";
import { FLOW_STAGES, FLOW_WAVES } from "./Data_LevelFlow.mjs";
import { FLOW_SOURCE_EXCERPTS } from "./Data_LevelFlowSource.mjs";
import { BeatById, CameraAt, Distance, EvaluateFlow, FLOW_DURATION, FLOW_TIMELINE, STAGE_TIMELINE } from "./Script_LevelFlowModel.mjs";

assert.equal(FLOW_STAGES.length,10);
assert.equal(FLOW_TIMELINE.length,68);
assert.ok(FLOW_STAGES.slice(0,7).every((stage)=>stage.status === "定稿"));
assert.ok(FLOW_STAGES.slice(7).every((stage)=>stage.status === "草稿"));
assert.equal(FLOW_DURATION,1870);
assert.deepEqual(Object.keys(FLOW_SOURCE_EXCERPTS),FLOW_TIMELINE.map((beat)=>beat.id));
assert.ok(Object.values(FLOW_SOURCE_EXCERPTS).every((text)=>text.length>10));
assert.equal(STAGE_TIMELINE[6].end,1060);
for(let index=1;index<FLOW_TIMELINE.length;index++) {
  const previous=FLOW_TIMELINE[index-1],beat=FLOW_TIMELINE[index];
  assert.equal(beat.start,previous.end,`${beat.id} timeline continuity`);
  assert.ok(Distance(previous.p.at(-1),beat.p[0])<0.01,`${beat.id} player continuity`);
}
for(const wave of FLOW_WAVES) {
  assert.ok(BeatById(wave.beat),`${wave.id} trigger exists`);
  assert.ok(wave.count>0 && wave.interval>=0);
}
assert.deepEqual(FLOW_WAVES.filter((wave)=>wave.beat.startsWith("03")).map((wave)=>wave.count),[5,2,2]);
assert.equal(FLOW_WAVES.filter((wave)=>wave.id.startsWith("Tank")).reduce((sum,wave)=>sum+wave.count,0),10);

for(let time=0;time<=FLOW_DURATION;time+=0.5) {
  const frame=EvaluateFlow(time);
  for(const actor of frame.actors) assert.ok(actor.p.every(Number.isFinite),`${time} ${actor.id}`);
  for(const mode of ["player","tracking","overview"]) {
    const camera=CameraAt(frame,mode);
    assert.ok([...camera.eye,...camera.aim].every(Number.isFinite));
  }
  if(frame.beat.stage === "06") {
    const tank=frame.actors.find((actor)=>actor.id === "tank1");
    for(const enemy of frame.actors.filter((actor)=>actor.wave?.startsWith("Tank") && actor.pose !== "dead")) {
      assert.ok(enemy.p[1]<=tank.p[1],`${time} escort remains behind leading tank`);
    }
  }
  if(frame.beat.stage === "09" && frame.beat.id !== "09j") {
    assert.equal(frame.effects.filter((effect)=>effect.kind === "fire" && effect.b === frame.player).length,0,"stealth does not attract generic hostile fire");
  }
  if(frame.beat.stage === "10") {
    assert.equal(frame.actors.filter((actor)=>actor.wave === "EastStreet" && actor.pose !== "dead").length<=5,true);
  }
}
const sampleTimes=[0,39.9,40,178,251,300,399.9,400,600,799,1000,1100,1400,1800,FLOW_DURATION];
const baseline=sampleTimes.map((time)=>EvaluateFlow(time));
for(const time of [...sampleTimes].reverse()) EvaluateFlow(time);
assert.deepEqual(sampleTimes.map((time)=>EvaluateFlow(time)),baseline,"backward seek is independent of evaluation history");
assert.equal(EvaluateFlow(-20).time,0);
assert.equal(EvaluateFlow(Infinity).time,0);
assert.equal(EvaluateFlow(99999).time,FLOW_DURATION);
assert.equal(EvaluateFlow(BeatById("10f").start).stretchersPassed,12);
assert.equal(EvaluateFlow(BeatById("10f").start+1).effects.filter((effect)=>effect.kind === "fire").length,0,"whistle stops hostile fire before artillery");
console.log("ok  LevelFlow 68 beats, 10 stages, fixed 03/06 waves, capped replenishment, 3741 deterministic samples and cameras");
