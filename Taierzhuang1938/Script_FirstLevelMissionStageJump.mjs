import { MISSION_STAGES, MISSION_ENCOUNTERS, MISSION_TUNING as R } from "./Data_FirstLevelMission.mjs";
import { MISSION_ANCHORS as A, MISSION_PLACEMENT as P } from "./Data_FirstLevelMissionLayout.mjs";
import { BuildFirstLevelCheckpoint } from "./Script_FirstLevelMissionCheckpoint.mjs";
import { FIRST_LEVEL_STAGE_ENCOUNTERS, FIRST_LEVEL_ENCOUNTER_STARTS, FIRST_LEVEL_STAGE_CLEARED_ENEMIES } from "./Data_FirstLevelMissionStages.mjs";
import { MISSION_VOICE_TIMING } from "./Data_FirstLevelMissionVoiceTiming.mjs";
import { MissionTrainMotion } from "./Data_FirstLevelMissionTrain.mjs";

// Called once on a fresh runtime, after the shared level restart has cleared all
// combat, controls, destruction and actors. Backward jumps cannot retain future facts.
export function ApplyFirstLevelStageJump(runtime, value) {
  const r = runtime, saved = BuildFirstLevelCheckpoint(value), n = saved.phase.number;
  r.debugStart = {number:n,id:saved.phase.id};
  if (n === 1) return;
  r.hud.briefTimer = 0; r.hud.pendingTitle = null; r.hud.el.brief.classList.remove("on");
  r.voice.queue = []; r.voice.current = null;
  for (const step of MISSION_STAGES.slice(0,saved.index)) if (step.cue) {
    r.voice.played.add(step.cue); r.voice.finished.add(step.cue);
  }
  r.flow.facts = new Set(saved.facts);
  r.flow.log = [{kind:"debugJump",id:saved.phase.id,number:n,time:0}];
  r.column.Restore(saved.column);
  if (n === 2) {
    // The meal has finished while the train approaches the station. Preserve
    // that travelled distance so the real shell impact starts normal braking.
    const meal = MISSION_VOICE_TIMING.TrainMeal;
    r.time = r.flow.time = meal.segments.reduce((sum, part) => sum + part.end - part.start + (part.wait || 0), meal.tail || 0);
    const offset = MissionTrainMotion(r.time).offsetM;
    r.train.Translate(offset - r.battlefield.trainOffsetM);
    r.battlefield.SetTrainOffset(offset);
  }
  if (n > 2) {
    r.battlefield.SetTrainOffset(0);
    r.trainShellStartedAt = -60; r.shellTrainOffset = R.trainTravelM; r.trainStoppedAt = 0;
    for (let i = 0; i < 3; i++) r.battlefield.OpenGate(`TrainDoor${i}`);
    for (const entry of r.train.entries) {
      entry.exited = true; entry.arrived = true; entry.index = entry.steps.length;
      const actor = entry.actor;
      actor.missionUnloaded = true; actor.missionTrainReady = true; actor.p012OnMovingTrain = false;
      actor.missionTrainLife.weight = 0; actor.missionTrainLife.gestureWeight = 0;
      r.PlaceActor(actor,entry.steps.at(-1));
    }
    r.train.open = true;
    r.audio.Ambience(n === 7 ? "firstLevelSouth" : "firstLevelFront");
  }
  const spawn = n === 2 ? {x:A.train.x,z:A.train.z+r.battlefield.trainOffsetM} : saved.phase.spawn;
  r.player.Spawn(spawn.x,spawn.z,spawn.yaw || 0);
  if (n === 2) {
    // Generic spawn searches away from exact structural-floor contact. Reuse
    // the authored clear aisle, just above the deck, for a carriage-local retry.
    r.player.position.copy(r.Point(spawn,.025));
    r.player.body?.Teleport(r.player.position.x,r.player.position.y,r.player.position.z);
  }
  r.player.pitch = 0;
  if (n > 3) for (const [i,actor] of r.squad.entries()) {
    // Spread the squad at the checkpoint; do not leave them aboard the old train.
    const point = n <= 6 ? P.squadFrontPositions[i]
      : {x:spawn.x+(i%2?2.4:-2.4),z:spawn.z+3+Math.floor(i/2)*2.4};
    r.PlaceActor(actor,point); r.Defend(actor,point);
  }
  if (n > 3) {
    r.tank.present = true; r.tank.active = true;
    r.tank.z = n >= 5 ? R.tankStopZ : R.tankFirstFireZ;
    r.tank.immobilized = n >= 6; r.tank.shots = 1;
    r.column.zhou.health = n >= 15 ? saved.column.litters.find(l=>l.zhou).health : 65;
  }
  // Spawn only live encounters at this checkpoint. Completed finite groups stay
  // in the ledger so later Enter callbacks cannot recreate defeated enemies.
  const live = FIRST_LEVEL_STAGE_ENCOUNTERS[n-1];
  for (const id of Object.keys(MISSION_ENCOUNTERS)) if (!live.includes(id) && FIRST_LEVEL_ENCOUNTER_STARTS[id] <= n) r.spawned.add(id);
  for (const id of live) r.SpawnEncounter(id);
  while (r.spawnQueue.length) r.DrainSpawns();
  for (const id of FIRST_LEVEL_STAGE_CLEARED_ENEMIES[n] || []) {
    const actor = r.enemies.get(id);
    if (actor) { r.ai.Remove(actor); r.enemies.delete(id); }
  }
  if (n >= 4 && n <= 5) {
    r.SpawnGuards();
    if (n === 5) for (const guard of r.guards) {
      guard.safe = true; guard.progress = guard.route.length;
      r.PlaceActor(guard.actor,guard.route.at(-1));
    }
  }
  if (n >= 8 && n <= 10) {
    for (const actor of r.enemies.values()) {actor.missionDormant=false;actor.scriptedNoncombatant=false;}
    r.tutor = r.enemies.get("MeleeTutor");
    if (r.tutor) {
      r.tutor.meleeTraining = {passive:false,strength:R.meleeStrength};
      r.tutor.bayonetFixed = true; r.tutor.scriptedNoncombatant = n === 8;
    }
  }
  if (n >= 11) r.battlefield.OpenGate("MissionCourtyardGate");
  if (n >= 14) r.cartBombLaunched = true;
  if (n >= 15) r.zhouStrafeLaunched = true;
  r.flow.index = saved.index;
  r.flow.Enter();
  while (r.spawnQueue.length) r.DrainSpawns();
  if (n === 14) {r.BeginCarry();r.UpdateCarry();}
  if (n === 17) {
    const yaowa=r.companion.Handle("yaowa");
    r.PlaceActor(yaowa,{x:A.zhouDrop.x+1,z:A.zhouDrop.z});
    if (r.deathMedic) Object.assign(r.deathMedic,{x:A.zhouDrop.x-1,z:A.zhouDrop.z});
  }
  r.view.Update(0,{tank:r.tank,player:r.player,camera:r.camera});
  r.SaveCheckpoint();
}
