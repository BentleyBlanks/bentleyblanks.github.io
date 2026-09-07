import { MISSION_TRAIN } from "./Data_FirstLevelMissionTrain.mjs";
import { FirstLevelMissionTrain } from "./Script_FirstLevelMissionTrain.mjs";
import assert from "node:assert/strict";
import fs from "node:fs";
import { FirstLevelMissionFlow } from "./Script_FirstLevelMissionFlow.mjs";
import { FirstLevelMissionColumn } from "./Script_FirstLevelMissionColumn.mjs";
import { MISSION_STAGES, MISSION_TUNING as R, FIRST_LEVEL_MISSION_PHASE } from "./Data_FirstLevelMission.mjs";
import { MISSION_LAYOUT, MISSION_ROUTES, MISSION_ANCHORS as A } from "./Data_FirstLevelMissionLayout.mjs";
import { SampleMissionTerrain } from "./Data_FirstLevelMissionTerrain.mjs";
import { CreateP012Terrain } from "./Data_FirstLevelP012Terrain.mjs";
import { MISSION_DIALOGUE, MissionVoicePrompt } from "./Data_FirstLevelMissionDialogue.mjs";
import { FirstLevelMissionVoice } from "./Script_FirstLevelMissionVoice.mjs";
const flow = new FirstLevelMissionFlow();
flow.Start();
for (const stage of MISSION_STAGES.slice(0, -1)) {
  assert.equal(flow.stage.id, stage.id);
  flow.Update(600);
  assert.equal(flow.stage.id, stage.id, "Elapsed time alone cannot pass a mission");
  for (const fact of stage.requirements) flow.Record(fact);
  const snapshot = flow.Snapshot(),
    restored = new FirstLevelMissionFlow();
  restored.Restore(snapshot);
  assert.deepEqual(restored.State(), flow.State());
  flow.Update(1);
}
assert.equal(flow.completed, true);
console.log("ok all mission gates require recorded gameplay facts and restore exactly");
const terrain = CreateP012Terrain(MISSION_LAYOUT);
for (const [x, z] of [
  [-24, -40],
  [-8, -95],
  [12, -124],
  [20, 109],
])
  assert.ok(SampleMissionTerrain(x, z) < -0.8, "Excavated soil is below natural ground");
for (const point of Object.values(A)) assert.ok(Number.isFinite(terrain.SampleHeight(point.x, point.z)));
assert.ok(!MISSION_LAYOUT.blocks.some((block) => block.semantic === "ground"));
assert.equal(FIRST_LEVEL_MISSION_PHASE.whitebox.fullMission, true);
console.log("ok shared terrain, excavated trenches, structural floors only");
for (const [name, route] of Object.entries(MISSION_ROUTES)) {
  for (let i = 1; i < route.length; i++) {
    const a = route[i - 1],
      b = route[i],
      distance = Math.hypot(a.x - b.x, a.z - b.z);
    for (let d = 0; d <= distance; d += 0.4) {
      const t = d / distance,
        x = a.x + (b.x - a.x) * t,
        z = a.z + (b.z - a.z) * t,
        y = SampleMissionTerrain(x, z);
      for (const box of MISSION_LAYOUT.blocks) {
        if (MISSION_LAYOUT.walkableSurfaces.some((surface) => surface.id === box.id)) continue;
        const blocked =
          Math.abs(x - box.x) < box.w / 2 + 0.35 &&
          Math.abs(z - box.z) < box.d / 2 + 0.35 &&
          box.y + box.h / 2 > y + 0.3 &&
          box.y - box.h / 2 < y + 1.7;
        assert.equal(
          blocked,
          false,
          `${name} capsule route intersects ${box.id} at ${x.toFixed(1)},${z.toFixed(1)}`,
        );
      }
    }
  }
}
console.log("ok authored capsule routes clear walls, crates and gun supports");
const c = new FirstLevelMissionColumn();
c.Activate();
for (let i = 0; i < 6000; i++) c.Update(0.1);
assert.equal(c.State().gatePassed, 0);
c.gateOpen = true;
for (let i = 0; i < 6000; i++) c.Update(0.1);
assert.equal(c.State().gatePassed, R.litterCount);
c.loading = true;
for (let i = 0; i < 6000; i++) c.Update(0.1);
assert.equal(c.State().loaded, R.zhouQueueIndex);
assert.equal(c.departed, 2);
assert.equal(c.QueueAhead(), 0);
assert.equal(c.zhou.loaded, false);
assert.ok(c.vehicles.slice(0, 2).every((cart) => cart.z > 180));
assert.equal(c.vehicles[2].load.length, 3);
const zhouBefore = { x: c.zhou.x, z: c.zhou.z };
assert.ok(c.BeginZhouBoarding());
for (let i = 0; i < 50; i++) c.Update(0.1);
assert.ok(Math.hypot(c.zhou.x - zhouBefore.x, c.zhou.z - zhouBefore.z) > R.boardingWitnessM);
assert.equal(
  c.zhou.loaded,
  false,
  "Zhou is physically taken to the loading bay before the raid interrupts boarding",
);
const saved = c.Snapshot(),
  copy = new FirstLevelMissionColumn();
copy.Restore(saved);
assert.deepEqual(copy.State(), c.State());
c.AirDamage();
assert.equal(c.litters.filter((l) => l.state === "fallen").length, 2);
assert.ok(c.vehicles.some((cart) => cart.overturned));
c.zhou.state = "waiting";
c.zhou.bearers = [75, 75];
for (const litter of c.litters) if (litter.state === "fallen") litter.state = "waiting";
c.StartRetreat();
for (const point of [A.retreatA, A.retreatB, A.retreatC]) {
  const living = c.litters.filter((l) => !l.loaded && l.health > 0),
    pass = c.RetreatLimit(point) - 12,
    cap = pass + living.length * R.litterSpacingM + 5;
  for (let i = 0; i < 4000; i++) c.Update(0.1, { maxProgress: cap });
  assert.ok(
    living.every((l) => l.progress > pass),
    "Every surviving litter must physically pass the rearguard position",
  );
}
c.StartReception();
for (let i = 0; i < 4000; i++) c.Update(0.1);
assert.ok(c.litters.filter((l) => !l.loaded && l.health > 0).every((l) => l.received));
assert.ok(Math.hypot(c.zhou.x - A.zhouPickup.x, c.zhou.z - A.zhouPickup.z) < 0.01);
c.StartFinalExit();
for (let i = 0; i < 4000; i++) c.Update(0.1);
assert.ok(c.walkers.filter((w) => w.kind === "medic" && w.health > 0).every((w) => w.escaped));
console.log(
  "ok 20 litters, closed gate, physical load queue, 2 departing carts, interrupted transfer, three passages, reception and actual rear exit",
);
const casualtyColumn = new FirstLevelMissionColumn();
casualtyColumn.litters[0].health = 0;
casualtyColumn.litters[1].health = 12;
casualtyColumn.AirDamage();
assert.equal(casualtyColumn.litters[0].health, 0, "An air-raid event never revives a previous casualty");
assert.equal(casualtyColumn.litters[1].health, 12, "An air-raid event never heals an injured patient");
assert.equal(new Set(MISSION_DIALOGUE.map((cue) => cue.id)).size, MISSION_DIALOGUE.length);
for (const cue of MISSION_DIALOGUE) {
  assert.ok(MissionVoicePrompt(cue).includes(cue.lines[0].text));
  assert.ok(cue.lines.every((line) => MissionVoicePrompt(cue).includes(line.text)));
}
if (process.argv.includes("--audio")) {
  const manifest = JSON.parse(
    fs.readFileSync(new URL("./Audio/FirstLevel/Data_FirstLevelVoiceManifest.json", import.meta.url), "utf8"),
  );
  for (const cue of MISSION_DIALOGUE) {
    const entry = manifest.cues[cue.id];
    assert.ok(entry?.continuous && entry.requests === 1 && entry.seconds > 0.5, cue.id);
    assert.ok(fs.statSync(new URL("./Audio/FirstLevel/" + cue.file, import.meta.url)).size === entry.bytes);
  }
}
console.log("ok continuous dialogue prompts; audio assets require --audio acceptance");
const completedCues = [];
const voiceOffsets = [];
const voice = new FirstLevelMissionVoice({
  audio: {
    PlayStoryVoice: (_key, options) => {
      voiceOffsets.push(options.offset || 0);
      return { duration: 1 };
    },
    StopStoryVoice() {},
  },
  hud: { Say() {} },
  Done: (id) => completedCues.push(id),
});
voice.Enqueue("TrainMeal");
voice.Enqueue("Volunteer");
voice.Update(0.3);
voice.Pause();
voice.Update(10);
assert.equal(voice.current.time, 0.3, "Paused story audio and subtitles retain the same playback position");
voice.Resume();
voice.Update(1.1);
voice.Update(1.1);
assert.deepEqual(
  completedCues,
  ["TrainMeal", "Volunteer"],
  "Retrying one continuous cue must retain queued mission dialogue",
);
assert.equal(voice.queue.length, 0);
assert.deepEqual(
  voiceOffsets,
  [0, 0.3, 0],
  "Resume plays the same uncut cue from its paused offset before queued dialogue",
);

// Regression: 40 real recruit bodies plus Luo, stable carriage-local positions, all three doors.
{
  const dt = 1/60, actors = [];
  const Make = () => { const a = { id: actors.length, alive: true, position: {x:0,y:1.17,z:0}, goal:{x:0,z:0} }; actors.push(a); return a; };
  const originals = Array.from({length:6}, Make), guide = Make();
  let offset = R.trainTravelM, player = {...MISSION_TRAIN.player,z:MISSION_TRAIN.player.z+offset};
  const train = new FirstLevelMissionTrain({ Originals:()=>originals, Guide:()=>guide, Spawn:Make,
    Offset:()=>offset, Place:(a,p)=>Object.assign(a.position,p), Hold:a=>Object.assign(a.goal,a.position),
    Move:(a,p,speed)=>{const d=Math.hypot(p.x-a.position.x,p.z-a.position.z);if(d>MISSION_TRAIN.arrivalRadiusM){const step=Math.min(speed*dt,d)/d;a.position.x+=(p.x-a.position.x)*step;a.position.z+=(p.z-a.position.z)*step;}},
    Player:()=>player, Exited:()=>{},
  });
  train.Initialize(); train.Initialize();
  assert.equal(actors.length,41);assert.deepEqual(train.State().counts,[8,24,8]);
  const local=actors.map(a=>({x:a.position.x,z:a.position.z-offset}));
  for(let i=0;i<120;i++){offset-=R.trainTravelM/120;train.Translate(-R.trainTravelM/120);train.Update(dt,false);}
  for(const [i,a] of actors.entries()) {assert.ok(Math.abs(a.position.z-offset-local[i].z)<1e-8);assert.equal(a.position.x,local[i].x);assert.ok(a.p012OnMovingTrain);}
  player={x:-71,z:110};
  let ticks=0;
  for(;ticks<180/dt;ticks++) {
    train.Update(dt,true);
    for(let i=0;i<actors.length;i++)for(let j=i+1;j<actors.length;j++)assert.ok(Math.hypot(actors[i].position.x-actors[j].position.x,actors[i].position.z-actors[j].position.z)>=.899,'train queue bodies do not overlap');
    if(train.entries.every(e=>e.arrived))break;
  }
  assert.equal(train.State().exited,40,JSON.stringify(train.State()));
  assert.ok(train.entries.every(e=>e.arrived),'all passengers physically reach their own muster point: '+JSON.stringify(train.State().entries.filter(e=>!e.arrived)));
  assert.ok(actors.every(a=>!a.p012OnMovingTrain&&a.missionUnloaded));
  console.log('ok train 8/24/8, Luo separate, unchanged local positions while moving, all physical exits in '+(ticks*dt).toFixed(1)+'s');
}
