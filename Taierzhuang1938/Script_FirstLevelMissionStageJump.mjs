import { MISSION_STAGES, MISSION_ENCOUNTERS, MISSION_TUNING as R } from "./Data_FirstLevelMission.mjs";
import { MISSION_ANCHORS as A, MISSION_PLACEMENT as P } from "./Data_FirstLevelMissionLayout.mjs";
import { BuildFirstLevelCheckpoint } from "./Script_FirstLevelMissionCheckpoint.mjs";
import { FIRST_LEVEL_STAGE_ENCOUNTERS, FIRST_LEVEL_ENCOUNTER_STARTS, FIRST_LEVEL_STAGE_CLEARED_ENEMIES, FIRST_LEVEL_DEFERRED_ENCOUNTERS } from "./Data_FirstLevelMissionStages.mjs";
import { OPENING } from "./Data_FirstLevelOpening.mjs";

// Called once on a fresh runtime, after the shared level restart has cleared all
// combat, controls, destruction and actors. Backward jumps cannot retain future facts.
// 2026.09.19 重构：18 个公开阶段按新 27 步重写（契约 §1）。
export function ApplyFirstLevelStageJump(runtime, value, { midCutscenes = false } = {}) {
  const r = runtime, saved = BuildFirstLevelCheckpoint(value), n = saved.phase.number;
  r.debugStart = {number:n,id:saved.phase.id};
  // 夜天空是模块级的（Script_Main 的 cutsceneSky），重建切片不会把它放下 ——
  // 从 18 的夜行军跳回白天那几步，不还原就会得到「夜的天、白天的地」。
  // 空间那一侧（铁路桥、北门夜景片）跟着事实自己退回去，见 MISSION_SCENARIO_SIGNALS。
  r.RestoreSky?.();
  if (n === 1) return;
  r.hud.briefTimer = 0; r.hud.pendingTitle = null; r.hud.el.brief.classList.remove("on");
  r.voice.queue = []; r.voice.current = null;
  for (const step of MISSION_STAGES.slice(0,saved.index)) if (step.cue) {
    r.voice.played.add(step.cue); r.voice.finished.add(step.cue);
  }
  r.flow.facts = new Set(saved.facts);
  r.flow.log = [{kind:"debugJump",id:saved.phase.id,number:n,time:0}];
  r.column.Restore(saved.column);
  // 01 的受困演出只在第 1 阶段跑；跳到别处就当它演完了（控制锁不许留着）。
  r.opening.bunker = null;
  if (r.controls) { const kind = r.controls.kind; r.controls = null; r.Control?.(false, kind); }
  r.audio.Ambience(n === 7 ? "firstLevelSouth" : "firstLevelFront");
  const spawn = saved.phase.spawn;
  r.player.Spawn(spawn.x,spawn.z,spawn.yaw || 0);
  r.player.pitch = 0;
  // 02 的班里人得在掩蔽部门口：罗班长在木架这头、幺娃在背包那头、何有田在后侧沟里压制。
  // 放到前沿哨位去（squadFrontPositions）那一趟，幺娃站在八十米外的机枪位上，
  // 掀木架那一拍永远凑不齐人，luoRescueComplete 记不下来（2026-09-20 实测）。
  const bunkerPosts = [P.bunker.luoLift, P.bunker.yaowaLift, P.bunker.heyoutianFire,
    {x:P.bunker.heyoutianFire.x+2.2, z:P.bunker.heyoutianFire.z+1.6}];
  // 班里人按阶段散开：02 在掩蔽部门口，04 在前沿哨位，03/05–06 在机枪位两侧，其余跟在玩家后面。
  for (const [i,actor] of (r.squad||[]).entries()) {
    actor.missionTrainReady = true;
    const point = n === 2 ? bunkerPosts[i] || bunkerPosts.at(-1)
      : n === 4 ? OPENING.frontPosts[i] : n <= 6 ? P.squadFrontPositions[i]
        : {x:spawn.x+(i%2?2.4:-2.4),z:spawn.z+3+Math.floor(i/2)*2.4};
    r.PlaceActor(actor,point); r.Defend(actor,point);
  }
  if (n > 3) {
    r.tank.present = true; r.tank.active = true;
    r.tank.z = n >= 5 ? R.tankStopZ : R.tankFirstFireZ;
    r.tank.immobilized = n >= 6; r.tank.shots = 1;
    r.column.zhou.health = n >= 15 ? saved.column.litters.find(l=>l.zhou).health
      : n >= 14 ? 45 : 65;
  }
  // Spawn only live encounters at this checkpoint. Completed finite groups stay
  // in the ledger so later Enter callbacks cannot recreate defeated enemies.
  const live = FIRST_LEVEL_STAGE_ENCOUNTERS[n-1];
  for (const id of Object.keys(MISSION_ENCOUNTERS)) if (!live.includes(id) && FIRST_LEVEL_ENCOUNTER_STARTS[id] <= n && !FIRST_LEVEL_DEFERRED_ENCOUNTERS[n]?.includes(id)) r.spawned.add(id);
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
    // 村口那批照常醒；连屋那一组保持藏着，等玩家绕到灶屋以东
    //（阶段 10 里他们已经死光，FIRST_LEVEL_STAGE_ENCOUNTERS 根本不建这一组）。
    for (const actor of r.enemies.values()) if (actor.missionEncounter !== "melee") {
      actor.missionDormant=false;actor.scriptedNoncombatant=false;
    }
  }
  if (n >= 11) r.battlefield.OpenGate("MissionCourtyardGate");
  // 13 的过关条件里有停车与卸人：跳进去时车已经开到路尽头，还没停 —— 让 UpdateCart
  // 自己走完那两拍，不许靠预置事实混过去。14 起这两拍已经是过去的事。
  if (n === 13) r.cart = { progress: 1e4, moving: true, halted: false, unloaded: false, from: { ...A.cartBoard } };
  else if (n > 13) r.cart = { progress: 1e4, moving: false, halted: true, unloaded: true };
  if (n >= 14) {
    r.cartBombLaunched = true; r.bridgeBombLaunched = true;
    r.battlefield.OpenGate("TemporaryBridge"); r.battlefield.CloseGate("MissionBridgeWreck");
  }
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
