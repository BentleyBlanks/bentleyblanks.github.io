import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { characterDefinitions, enemyRoleDefinitions } from "./Data_Characters.mjs";
import { missionDefinition } from "./Data_Mission.mjs";
import { MoveToward, UpdateEnemySquad } from "./Script_Ai.mjs";
import {
  ApplyAbilityCommand,
  ApplyCampAction,
  ApplyMissionToCamp,
  CanFriendlySeeEnemy,
  CanSee,
  CreateInitialCampState,
  CreateInitialMissionState,
  CreateSoundEvent,
  FindPath2D,
  GetBallisticImpact,
  GetCoverAt,
  GetCoverDamageMultiplier,
  GetEnemyIntelRenderState,
  GetMissionEvaluation,
  HasLineOfSight,
  HearSound,
  IsNavigationBlocked,
  IsConcealmentZone,
  IsPositionLit,
  PointInsideBox,
  PrepareMissionFromCamp,
  QueueCommand,
  SegmentIntersectsBox,
  simulationConfig,
  UpdateEnemyIntel,
} from "./Script_Rules.mjs";

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));

function TestDefinitions() {
  assert.equal(characterDefinitions.length, 4, "The playable squad must contain four distinct operatives.");
  assert.equal(new Set(characterDefinitions.map((character) => character.id)).size, 4, "Character ids must be unique.");
  assert.equal(Object.keys(enemyRoleDefinitions).length >= 4, true, "Enemy roles must include guard, patrol, leader, and operator.");
  for (const character of characterDefinitions) {
    assert.match(character.id, /^[a-z][A-Za-z0-9]*$/, `Character id must use lowerCamelCase: ${character.id}`);
    assert.equal(character.abilities.length, 2, `${character.name} must have two readable abilities.`);
    assert.equal(new Set(character.abilities.map((ability) => ability.id)).size, 2, `${character.name} ability ids must be unique.`);
  }
  assert.equal(missionDefinition.enemies.length >= 10, true, "The tactical slice must field a meaningful enemy layout.");
  assert.equal(missionDefinition.interactables.length >= 9, true, "The level must include objectives, supplies, rescue, and environment interactions.");
  assert.equal(missionDefinition.extractionZones.length, 3, "The mission must expose three extraction routes.");
  for (const interactable of missionDefinition.interactables) {
    const hasApproach = Array.from({ length: 32 }, (_, index) => {
      const angle = (index / 32) * Math.PI * 2;
      const point = {
        x: interactable.x + Math.cos(angle) * interactable.radius * 0.82,
        z: interactable.z + Math.sin(angle) * interactable.radius * 0.82,
      };
      return !missionDefinition.obstacles.some((obstacle) => PointInsideBox(point, obstacle, 0.65));
    }).some(Boolean);
    assert.equal(hasApproach, true, `${interactable.name} must have at least one reachable approach point.`);
  }
}

function TestInitialState() {
  const state = CreateInitialMissionState(19411018);
  assert.equal(state.units.length, 4);
  assert.equal(state.enemies.length, missionDefinition.enemies.length);
  assert.equal(state.paused, true, "The mission must begin in planning pause.");
  assert.deepEqual(state.selectedUnitIds, [characterDefinitions[0].id]);
  assert.equal(state.objectives.ledger, false);
  assert.equal(state.objectives.relay, false);
  assert.equal(state.ledger.civilianHarm, 0);
  assert.equal(state.soundEvents.length, 0);
  for (const unit of state.units) {
    assert.equal(Number.isFinite(unit.x) && Number.isFinite(unit.z), true);
    assert.equal(unit.queue.length, 0);
    assert.equal(unit.health > 0, true);
  }
}

function TestQueueContract() {
  const state = CreateInitialMissionState();
  const unitId = state.units[0].id;
  for (let index = 0; index < simulationConfig.maximumQueueLength; index += 1) {
    assert.equal(QueueCommand(state, unitId, { kind: "move", x: index, z: index }, true), true);
  }
  assert.equal(
    QueueCommand(state, unitId, { kind: "move", x: 99, z: 99 }, true),
    false,
    "A fifth queued command must be rejected.",
  );
  assert.equal(state.units[0].queue.length, simulationConfig.maximumQueueLength);
  assert.equal(QueueCommand(state, unitId, { kind: "move", x: 2, z: 3 }, false), true);
  assert.equal(state.units[0].queue.length, 1, "A non-appended command must replace the existing plan.");
  state.units[0].command = state.units[0].queue.shift();
  for (let index = 0; index < simulationConfig.maximumQueueLength - 1; index += 1) {
    assert.equal(QueueCommand(state, unitId, { kind: "move", x: index + 10, z: index }, true), true);
  }
  assert.equal(
    QueueCommand(state, unitId, { kind: "move", x: 99, z: 99 }, true),
    false,
    "The active command and queued commands together must never exceed four actions.",
  );
}

function CaptureAbilityEffects(state) {
  return {
    units: state.units.map((unit) => ({
      id: unit.id,
      state: unit.state,
      health: unit.health,
      ammo: unit.ammo,
      suppression: unit.suppression,
      charges: { ...unit.charges },
      cooldowns: { ...unit.cooldowns },
      overwatchTimer: unit.overwatchTimer ?? 0,
    })),
    enemies: state.enemies.map((enemy) => ({
      id: enemy.id,
      suppression: enemy.suppression,
      morale: enemy.morale,
      revealedTimer: enemy.revealedTimer ?? 0,
    })),
    shotsFired: state.ledger.shotsFired,
    soundEventCount: state.soundEvents.length,
  };
}

function TestPausedAbilityExecution() {
  const scenarios = [
    {
      unitId: "qinSuqiu",
      command: (state) => ({ kind: "observe", targetId: state.enemies.find((enemy) => enemy.id === "outerOne").id }),
      verify: (state) => assert.equal(state.enemies.find((enemy) => enemy.id === "outerOne").revealedTimer, 18),
    },
    {
      unitId: "qinSuqiu",
      command: () => ({ kind: "stone", x: -42, z: -31 }),
      verify: (state) => assert.equal(state.soundEvents.at(-1)?.kind, "stone"),
    },
    {
      unitId: "luLanzhi",
      setup: (state) => {
        const patient = state.units.find((unit) => unit.id === "qinSuqiu");
        patient.state = "downed";
        patient.health = 0;
        patient.downedTimer = 30;
      },
      command: () => ({ kind: "aid", targetId: "qinSuqiu" }),
      verify: (state) => {
        assert.equal(state.units.find((unit) => unit.id === "qinSuqiu").state, "wounded");
        assert.equal(state.units.find((unit) => unit.id === "luLanzhi").charges.aid, 1);
      },
    },
    {
      unitId: "luLanzhi",
      setup: (state) => state.units.forEach((unit) => { unit.suppression = 80; }),
      command: () => ({ kind: "steady" }),
      verify: (state) => assert.equal(state.units.every((unit) => unit.suppression <= 10), true),
    },
    {
      unitId: "weiShouyi",
      command: () => ({ kind: "suppress", x: -32, z: -20 }),
      verify: (state) => {
        const gunner = state.units.find((unit) => unit.id === "weiShouyi");
        assert.equal(gunner.ammo, 24);
        assert.equal(state.ledger.shotsFired, 6);
        assert.equal(state.soundEvents.at(-1)?.kind, "gunshot");
      },
    },
    {
      unitId: "weiShouyi",
      command: () => ({ kind: "overwatch", targetId: "hanShilei" }),
      verify: (state) => {
        assert.equal(state.units.find((unit) => unit.id === "weiShouyi").overwatchTimer, 10);
        assert.equal(state.units.find((unit) => unit.id === "hanShilei").overwatchTimer, 10);
      },
    },
  ];

  for (const scenario of scenarios) {
    const state = CreateInitialMissionState();
    scenario.setup?.(state);
    const command = scenario.command(state);
    const beforeQueue = CaptureAbilityEffects(state);
    assert.equal(QueueCommand(state, scenario.unitId, command, false), true);
    assert.deepEqual(
      CaptureAbilityEffects(state),
      beforeQueue,
      `${command.kind} must not alter combat state while the simulation is paused.`,
    );
    const unit = state.units.find((candidate) => candidate.id === scenario.unitId);
    const queued = unit.queue.shift();
    const result = ApplyAbilityCommand(state, unit.id, queued);
    assert.equal(result.success, true, `${command.kind} must execute on the first resumed simulation step.`);
    scenario.verify(state);
    const afterFirstExecution = CaptureAbilityEffects(state);
    const repeat = ApplyAbilityCommand(state, unit.id, queued);
    assert.equal(repeat.success, false, `${command.kind} must reject a second execution of the same command.`);
    assert.deepEqual(
      CaptureAbilityEffects(state),
      afterFirstExecution,
      `${command.kind} must settle exactly once.`,
    );
  }
}

function TestLineOfSightAndZones() {
  const relayHouse = missionDefinition.obstacles.find((obstacle) => obstacle.id === "relayHouse");
  assert.equal(PointInsideBox({ x: relayHouse.x, z: relayHouse.z }, relayHouse), true);
  assert.equal(
    SegmentIntersectsBox({ x: relayHouse.x, z: relayHouse.z - 12 }, { x: relayHouse.x, z: relayHouse.z + 12 }, relayHouse),
    true,
  );
  assert.equal(
    HasLineOfSight({ x: relayHouse.x, z: relayHouse.z - 12 }, { x: relayHouse.x, z: relayHouse.z + 12 }),
    false,
    "A building must block sight deterministically.",
  );
  const observer = { role: "sentry", x: -10, z: 0, facing: Math.PI * 0.5 };
  const visibleTarget = { id: "target", x: -2, z: 0, stance: "walk", command: null };
  assert.equal(CanSee(observer, visibleTarget, []), true, "A close unobstructed target inside the cone must be visible.");
  observer.facing = -Math.PI * 0.5;
  assert.equal(CanSee(observer, visibleTarget, []), false, "A target behind the observer must not be visible.");
  const crate = missionDefinition.obstacles.find((obstacle) => obstacle.id === "crateStack");
  const threat = { x: crate.x, z: crate.z - 8 };
  const protectedPosition = { x: crate.x, z: crate.z + crate.depth * 0.5 + 1 };
  assert.equal(HasLineOfSight(threat, protectedPosition), false, "Crates must block sight instead of acting as decoration.");
  const cover = GetCoverAt(protectedPosition, threat);
  assert.equal(cover?.obstacleId, crate.id, "A crate must expose directional cover behind it.");
  assert.equal(GetCoverDamageMultiplier(cover) < 1, true, "Cover must reduce gunfire damage through a pure modifier.");
  assert.equal(GetCoverDamageMultiplier(cover, "melee"), 1, "Cover must not reduce melee damage.");
}

function TestBallisticImpactContract() {
  const woodImpact = GetBallisticImpact({ x: 37, z: -5 }, { x: 37, z: 8 });
  assert.equal(woodImpact?.obstacleId, "crateStack", "A blocked shot must resolve the first obstacle, not the live target behind it.");
  assert.equal(woodImpact?.material, "wood");
  assert.equal(Math.abs(woodImpact.z - 2.5) < 0.01, true, "The impact position must lie on the near face of the obstacle.");
  const stoneImpact = GetBallisticImpact({ x: -1, z: -10 }, { x: -1, z: 5 });
  assert.equal(stoneImpact?.obstacleId, "bridgeWest");
  assert.equal(stoneImpact?.material, "stone");
  const metalImpact = GetBallisticImpact(
    { x: 0, z: 0 },
    { x: 10, z: 0 },
    [{ id: "testMetal", kind: "equipment", impactMaterial: "metal", x: 5, z: 0, width: 2, depth: 2 }],
  );
  assert.equal(metalImpact?.material, "metal", "Authored metal equipment must retain its distinct impact response.");
  assert.equal(GetBallisticImpact({ x: 0, z: 0 }, { x: 2, z: 0 }, []), null, "Clear shots must not synthesize cover impacts.");
}

function FindApproachPoints(interactable) {
  return Array.from({ length: 32 }, (_, index) => {
    const angle = (index / 32) * Math.PI * 2;
    return {
      x: interactable.x + Math.cos(angle) * interactable.radius * 0.82,
      z: interactable.z + Math.sin(angle) * interactable.radius * 0.82,
    };
  }).filter((point) => !IsNavigationBlocked(point));
}

function TestNavigationContract() {
  const start = { x: 15, z: 8 };
  const destination = { x: 39, z: 8 };
  const first = FindPath2D(start, destination);
  const second = FindPath2D(start, destination);
  assert.deepEqual(first, second, "A* paths must be deterministic for identical inputs.");
  assert.equal(first.length > 1, true, "The relay house must force a route around its footprint.");
  first.forEach((waypoint) => assert.equal(IsNavigationBlocked(waypoint), false, "Navigation waypoints must be passable."));
  const actor = { id: "pathTest", ...start, facing: 0 };
  for (let tick = 0; tick < 600 && Math.hypot(actor.x - destination.x, actor.z - destination.z) > 0.8; tick += 1) {
    MoveToward(actor, destination, 3, 0.1);
  }
  assert.equal(Math.hypot(actor.x - destination.x, actor.z - destination.z) < 0.8, true, "AI movement must route around relayHouse without permanent stalling.");
  assert.equal(actor.navigation.waypoints.length > 0, true, "AI must cache its current waypoint route.");

  const spawn = missionDefinition.playerSpawns[0];
  for (const interactable of missionDefinition.interactables) {
    const reachableApproach = FindApproachPoints(interactable).find((approach) => {
      if (FindPath2D(spawn, approach).length === 0) return false;
      return missionDefinition.extractionZones.some((zone) => FindPath2D(approach, zone).length > 0);
    });
    assert.ok(reachableApproach, `${interactable.name} must be reachable from spawn and have a route onward to extraction.`);
  }
}

function TestLightingContract() {
  const searchlight = missionDefinition.lightingZones.find((zone) => zone.id === "yardSearchlight");
  assert.equal(IsPositionLit(searchlight, { generatorDisabled: false }), true, "The powered yard must be lit.");
  assert.equal(IsPositionLit(searchlight, { generatorDisabled: true }), false, "Disabling the generator must darken dependent lights.");
  const lantern = missionDefinition.lightingZones.find((zone) => zone.id === "barracksLantern");
  assert.equal(IsPositionLit(lantern, { generatorDisabled: true }), true, "Independent lanterns must survive generator sabotage.");
  assert.equal(IsPositionLit({ x: -50, z: -35 }, { generatorDisabled: false }), false, "Unlit terrain must remain dark.");
}

function TestConcealmentContract() {
  assert.equal(IsConcealmentZone({ x: -28, z: -19 }), true, "Sorghum must provide concealment.");
  assert.equal(IsConcealmentZone({ x: -19, z: -3 }), true, "The ditch must provide concealment.");
  assert.equal(IsConcealmentZone({ x: 28, z: 8 }), false, "The open yard must never grant hidden status.");
}

function TestSoundUncertainty() {
  const enemy = { id: "listener", x: 0, z: 0 };
  const event = CreateSoundEvent({ x: 8, z: 0 }, 14, "stone", "qinSuqiu", 2);
  const first = HearSound(enemy, event, 33);
  const second = HearSound(enemy, event, 33);
  assert.deepEqual(first, second, "Heard positions must be deterministic for the same seed.");
  assert.equal(first.confidence > 0 && first.confidence < 1, true);
  assert.notDeepEqual({ x: first.x, z: first.z }, { x: event.x, z: event.z }, "A distant sound must not reveal its exact source.");
  const quietEvent = CreateSoundEvent({ x: 30, z: 0 }, 5, "footstep", "qinSuqiu", 2);
  assert.equal(HearSound(enemy, quietEvent, 33), null, "Sounds outside their radius must not be heard.");
}

function TestEnemyKnowledgeBoundary() {
  const state = CreateInitialMissionState();
  const enemy = state.enemies.find((candidate) => candidate.id === "outerOne");
  const target = state.units[0];
  enemy.state = "search";
  enemy.lastKnown = { x: -20, z: -14, time: 0 };
  enemy.searchTimer = 8;
  enemy.awareness = 0;
  target.x = 50;
  target.z = 40;
  const before = { x: enemy.lastKnown.x, z: enemy.lastKnown.z };
  UpdateEnemySquad(state, 0.1);
  assert.deepEqual(
    { x: enemy.lastKnown.x, z: enemy.lastKnown.z },
    before,
    "Without a new sight or sound event, AI must not update lastKnown from the target's live coordinates.",
  );
}

function TestSquadIntelBoundary() {
  const state = CreateInitialMissionState();
  const scout = state.units[0];
  const enemy = state.enemies[0];
  state.units.slice(1).forEach((unit) => { unit.state = "evacuated"; });
  scout.x = 0;
  scout.z = 0;
  enemy.x = 12;
  enemy.z = 0;
  enemy.facing = 1;
  assert.equal(CanFriendlySeeEnemy(scout, enemy, []), true, "A living scout with clear LOS must establish current contact.");
  UpdateEnemyIntel(state, 0, []);
  let intel = GetEnemyIntelRenderState(enemy);
  assert.equal(enemy.intelState, "current");
  assert.equal(intel.showModel && intel.showAwareness && intel.showVision && intel.canTarget, true);
  assert.deepEqual(intel.position, { x: 12, z: 0, facing: 1 });

  enemy.x = 40;
  enemy.z = 8;
  enemy.facing = 2;
  UpdateEnemyIntel(state, 1, []);
  intel = GetEnemyIntelRenderState(enemy);
  assert.equal(enemy.intelState, "lastKnown", "Lost contact must become a remembered position, not live tracking.");
  assert.deepEqual(
    { x: intel.position.x, z: intel.position.z, facing: intel.position.facing, time: intel.position.time },
    { x: 12, z: 0, facing: 1, time: 0 },
    "Last-known intel must freeze at the observed coordinate.",
  );
  assert.equal(intel.showModel, true);
  assert.equal(intel.showAwareness || intel.showVision || intel.canTarget, false, "A memory marker must leak no live combat data.");
  enemy.x = 44;
  enemy.z = 12;
  UpdateEnemyIntel(state, simulationConfig.lastSeenSeconds, []);
  intel = GetEnemyIntelRenderState(enemy);
  assert.equal(enemy.intelState, "unknown", "Last-known positions must decay.");
  assert.equal(intel.showModel || intel.showAwareness || intel.showVision || intel.canTarget, false);

  enemy.discovered = true;
  UpdateEnemyIntel(state, 0, []);
  intel = GetEnemyIntelRenderState(enemy);
  assert.equal(enemy.intelState, "discovered");
  assert.equal(intel.showModel, false, "Camp intelligence may reveal a patrol route but never its live actor position.");
  assert.equal(intel.showPatrol, true);

  enemy.revealedTimer = 5;
  UpdateEnemyIntel(state, 0, []);
  intel = GetEnemyIntelRenderState(enemy);
  assert.equal(enemy.intelState, "tracked", "The observe ability must create a distinct tracked state.");
  assert.deepEqual(intel.position, { x: enemy.x, z: enemy.z, facing: enemy.facing });
  assert.equal(intel.showVision && intel.showPatrol && intel.canTarget, true);
  assert.equal(intel.showAwareness, false, "Tracked patrol knowledge must remain distinct from direct current sight.");

  scout.state = "downed";
  enemy.revealedTimer = 0;
  enemy.x = 4;
  enemy.z = 0;
  assert.equal(CanFriendlySeeEnemy(scout, enemy, []), false, "Downed operatives must not provide omniscient spotting.");
}

function TestEnemyTargetAndReportBoundaries() {
  const state = CreateInitialMissionState();
  const enemy = state.enemies.find((candidate) => candidate.id === "outerOne");
  enemy.x = -10;
  enemy.z = 0;
  enemy.facing = Math.PI * 0.5;
  state.units.forEach((unit) => { unit.state = "evacuated"; });
  const downed = state.units[0];
  downed.state = "downed";
  downed.x = -6;
  downed.z = 0;
  const ready = state.units[1];
  ready.state = "ready";
  ready.x = -3;
  ready.z = 0;
  ready.hidden = false;
  UpdateEnemySquad(state, 0.1);
  assert.equal(enemy.target, ready.id, "Enemies must ignore downed operatives and acquire an actionable target.");

  enemy.state = "report";
  enemy.reportTimer = 1;
  enemy.awareness = 100;
  UpdateEnemySquad(state, 0.1);
  assert.equal(enemy.state, "report", "Continuous visibility must not cancel an in-progress alarm report.");
  assert.equal(enemy.reportTimer < 1, true, "An uninterrupted report must continue counting down.");
  const timerBeforeSound = enemy.reportTimer;
  state.soundEvents = [CreateSoundEvent({ x: -8, z: 0 }, 30, "explosion", "test", state.time)];
  UpdateEnemySquad(state, 0.1);
  assert.equal(enemy.state, "report", "A strong sound must not overwrite an in-progress alarm report.");
  assert.equal(enemy.reportTimer < timerBeforeSound, true, "Strong sound perception must not reset the report timer.");
}

function TestAiSimulation() {
  const state = CreateInitialMissionState();
  state.units.forEach((unit) => {
    unit.x = -50;
    unit.z = -37;
  });
  for (let tick = 0; tick < 1800; tick += 1) {
    state.time += simulationConfig.aiStep;
    UpdateEnemySquad(state, simulationConfig.aiStep);
  }
  for (const enemy of state.enemies) {
    assert.equal(Number.isFinite(enemy.x) && Number.isFinite(enemy.z), true, `${enemy.id} produced invalid coordinates.`);
    assert.equal(Number.isFinite(enemy.awareness), true, `${enemy.id} produced invalid awareness.`);
    assert.equal(enemy.state.length > 0, true);
  }
}

function TestScoringBoundary() {
  const state = CreateInitialMissionState();
  state.objectives.ledger = true;
  state.objectives.relay = true;
  state.objectives.detainee = true;
  state.objectives.seedGrain = true;
  state.units.forEach((unit) => {
    unit.state = "evacuated";
  });
  const baseline = GetMissionEvaluation(state);
  state.ledger.enemiesKilled = 100;
  state.ledger.enemiesDisabled = 100;
  const afterKills = GetMissionEvaluation(state);
  assert.equal(afterKills.score, baseline.score, "Kills and incapacitations must never create score.");
  state.ledger.civilianHarm = 1;
  const afterHarm = GetMissionEvaluation(state);
  assert.equal(afterHarm.score < baseline.score, true, "Civilian harm must reduce evaluation.");
  state.ledger.civilianHarm = 0;
  state.units[0].state = "dead";
  const afterDeath = GetMissionEvaluation(state);
  assert.equal(afterDeath.complete, false, "A dead operative must prevent complete extraction.");
  assert.equal(["S", "A"].includes(afterDeath.grade), false, "Any operative death must hard-cap the grade below A.");
  assert.equal(afterDeath.sections.preservation < baseline.sections.preservation, true, "A death must visibly reduce preservation score.");
}

function TestCampBoundary() {
  const missionState = CreateInitialMissionState();
  missionState.supplies.medicine = 2;
  missionState.supplies.tools = 1;
  missionState.supplies.radioParts = 1;
  missionState.ledger.civilianHarm = 2;
  missionState.ledger.civilianRisk = 3;
  const initialCamp = CreateInitialCampState();
  const camp = ApplyMissionToCamp(initialCamp, missionState);
  assert.equal(camp.resources.medicine, initialCamp.resources.medicine + 2);
  assert.equal(camp.resources.tools, initialCamp.resources.tools + 1);
  assert.equal(camp.civilianCostLedger.harm, 2);
  assert.equal(
    camp.resources.trust < initialCamp.resources.trust,
    true,
    "Civilian harm must create a cost, not a reward.",
  );
  assert.equal(initialCamp.resources.medicine, 1, "Mission application must not mutate the input camp.");
  const rest = ApplyCampAction(camp, "rest");
  assert.equal(rest.success, true);
  assert.equal(rest.state.day, camp.day + 1);
  assert.notEqual(rest.state, camp, "Camp actions must return a cloned state.");

  const preparationCamp = structuredClone(camp);
  preparationCamp.facilities.workshop = 2;
  preparationCamp.facilities.intelligence = 2;
  preparationCamp.roster[0].wounds = 1;
  preparationCamp.roster[0].fatigue = 2;
  preparationCamp.roster[2].available = false;
  const freshMission = CreateInitialMissionState();
  const prepared = PrepareMissionFromCamp(freshMission, preparationCamp);
  assert.notEqual(prepared, freshMission, "Mission preparation must remain pure.");
  assert.equal(prepared.units.some((unit) => unit.id === preparationCamp.roster[2].id), false, "Unavailable operatives must not deploy.");
  const wounded = prepared.units.find((unit) => unit.id === preparationCamp.roster[0].id);
  assert.equal(wounded.maximumHealth < freshMission.units[0].maximumHealth, true, "Persistent wounds must reduce next-mission health.");
  assert.equal(wounded.speedMultiplier < 1 && wounded.morale < 100, true, "Fatigue must reduce next-mission speed and morale.");
  const sapper = prepared.units.find((unit) => unit.id === "hanShilei");
  assert.equal(sapper.charges.charge > 1, true, "An upgraded workshop must provide an extra demolition charge.");
  assert.equal(prepared.preparation.knownPatrolIds.length, 4, "Intelligence level two must pre-reveal four patrols.");
  assert.equal(freshMission.units.length, 4, "Mission preparation must not mutate the source mission.");

  const convalescentCamp = CreateInitialCampState();
  convalescentCamp.resources.medicine = 0;
  convalescentCamp.roster.forEach((operative) => {
    operative.wounds = 2;
    operative.available = false;
  });
  const convalescence = ApplyCampAction(convalescentCamp, "rest");
  assert.equal(convalescence.success, true, "An all-wounded roster must have a time-cost recovery path.");
  assert.equal(
    convalescence.state.roster.some((operative) => operative.available && operative.wounds < 2),
    true,
    "Four days of convalescence must restore at least one deployable operative.",
  );
  assert.equal(convalescence.state.day, convalescentCamp.day + 4);

  const fatalMission = CreateInitialMissionState();
  fatalMission.units[0].state = "dead";
  fatalMission.units[0].health = 0;
  const fatalCamp = ApplyMissionToCamp(CreateInitialCampState(), fatalMission);
  assert.equal(fatalCamp.roster[0].lost, true, "A dead operative must remain a permanent loss.");
  assert.equal(fatalCamp.roster[0].available, false);
  const afterTreatment = ApplyCampAction(fatalCamp, "treat");
  assert.equal(afterTreatment.state.roster[0].lost, true, "Treatment must never revive a permanently lost operative.");
  const nextDeployment = PrepareMissionFromCamp(CreateInitialMissionState(), fatalCamp);
  assert.equal(
    nextDeployment.units.some((unit) => unit.id === fatalMission.units[0].id),
    false,
    "Permanently lost operatives must not deploy in the next mission.",
  );

  const successfulMission = CreateInitialMissionState();
  successfulMission.objectives.ledger = true;
  successfulMission.objectives.relay = true;
  successfulMission.units.forEach((unit) => { unit.state = "evacuated"; });
  const advancedCamp = ApplyMissionToCamp(CreateInitialCampState(), successfulMission);
  assert.equal(advancedCamp.completedMissions, 1, "A complete operation must advance the campaign.");
  const secondOperation = PrepareMissionFromCamp(CreateInitialMissionState(), advancedCamp);
  assert.equal(secondOperation.operation.id, "northVillageRelief", "Campaign advancement must unlock a different operation.");
  assert.deepEqual(
    secondOperation.mainObjectiveIds,
    ["detainee", "medicines", "generator", "allExtracted"],
    "The second operation must change the required tactical objectives.",
  );
  secondOperation.objectives.detainee = true;
  secondOperation.objectives.medicines = true;
  secondOperation.objectives.generator = true;
  secondOperation.units.forEach((unit) => { unit.state = "evacuated"; });
  assert.equal(GetMissionEvaluation(secondOperation).complete, true, "Alternate campaign objectives must drive completion.");

  const clinicCamp = CreateInitialCampState();
  clinicCamp.roster[0].wounds = 1;
  const clinicUpgrade = ApplyCampAction(clinicCamp, "treat");
  assert.equal(clinicUpgrade.state.facilities.clinic, 2, "Treatment must develop the clinic.");
  const trainingUpgrade = ApplyCampAction(CreateInitialCampState(), "rest");
  assert.equal(trainingUpgrade.state.facilities.training, 1, "Rest and review must develop training.");
}

function TestStaticPageContract() {
  const html = fs.readFileSync(path.join(currentDirectory, "index.html"), "utf8");
  const css = fs.readFileSync(path.join(currentDirectory, "Style_Game.css"), "utf8");
  const gameScript = fs.readFileSync(path.join(currentDirectory, "Script_Game.mjs"), "utf8");
  const worldScript = fs.readFileSync(path.join(currentDirectory, "Script_World.mjs"), "utf8");
  assert.match(html, /three\.module\.mjs/, "Three.js must be vendored through the import map.");
  assert.doesNotMatch(html, /https?:\/\/[^"']+(three|font|cdn)/i, "The page must not rely on a runtime CDN.");
  assert.match(html, /id="worldCanvas"/);
  assert.match(html, /id="rosterPanel"/);
  assert.match(html, /id="campScreen"/);
  assert.match(html, /id="resultScreen"/);
  assert.match(html, /群众代价账本/);
  assert.match(css, /@media \(max-width: 760px\)/);
  assert.match(css, /prefers-reduced-motion/);
  assert.match(gameScript, /simulationConfig\.fixedStep/);
  assert.match(gameScript, /soundEvents = state\.soundEvents\.filter/);
  assert.match(gameScript, /renderBurstUntil/, "Paused interactions must open a short high-frame rendering window.");
  assert.match(gameScript, /effectsActive/, "Paused visual effects must keep rendering until they settle.");
  assert.match(gameScript, /interactiveRendering[\s\S]+renderAccumulator >= 1 \/ 12/, "Only fully idle paused scenes may fall back to 12 fps.");
  assert.match(worldScript, /FindPath2D\(origin, target, \{ clearance: 0\.68 \}\)/, "Route preview must use the execution A* contract.");
  assert.match(worldScript, /command\.waypoints\.slice/, "Paused mid-command previews must consume the execution's remaining waypoints.");
  assert.match(worldScript, /GetSoundRadius\(routeActor\)/, "Route sound previews must account for stance and terrain along the path.");
  assert.match(worldScript, /GetEnemyIntelRenderState/, "Enemy rendering must consume the bounded squad-intel view.");
  assert.match(worldScript, /intel\.showAwareness/, "Awareness bars must be gated by current contact.");
  assert.match(worldScript, /hiddenByIntel/, "Unknown and last-known enemies must not expose clickable live actors.");
  assert.match(gameScript, /hoverPick\?\.kind === "enemy" \? hoverPick\.id : null/, "Mouse hover must resolve a visible enemy pick.");
  assert.match(gameScript, /view\.hoverEnemyId = nextHoverEnemyId/, "Enemy hover must update the world highlight state.");
  assert.match(gameScript, /pointerleave", HandlePointerLeave/, "Leaving the battlefield must clear stale enemy hover.");
  assert.match(worldScript, /intel\.showVision[\s\S]*UpdateClippedVision/, "Only bounded current or tracked intel may expose clipped vision geometry.");
  assert.match(worldScript, /outlineGeometry[\s\S]*new THREE\.Line\(/, "Vision cones must retain a screenshot-readable clipped boundary.");
  assert.match(worldScript, /const isLastKnown = intel\?\.mode === "lastKnown"/, "Last-known contact must use a distinct visual mode.");
  assert.match(worldScript, /lastSeenTimer \?\? 0\) \/ 12/, "Last-known visual strength must decay across the 12-second memory contract.");
  assert.match(worldScript, /body\.material\.opacity = isLastKnown[\s\S]*: 1;/, "Current and tracked models must remain solid while memories become translucent.");
  assert.match(worldScript, /body\.material\.color\.setHex\(isLastKnown \? 0x8299a8 : 0xffffff\)/, "Memory actors must use a desaturated blue-grey ghost treatment.");
  assert.match(worldScript, /memoryRing\.material\.opacity = isLastKnown/, "Last-known positions must display a decaying memory ring.");
  assert.match(worldScript, /function SpawnImpact\(/, "World feedback must implement a bounded impact-particle effect.");
  assert.match(worldScript, /SpawnImpact,\s*\n\s*SpawnExplosion/, "SpawnImpact must remain part of the public world contract.");
  assert.match(worldScript, /kind === "body"/, "Body impacts must have a dedicated restrained particle palette.");
  assert.match(worldScript, /kind === "stone"/, "Stone impacts must remain visually distinct from earth and wood.");
  assert.match(gameScript, /SpawnImpact\?\.\(enemy, "body"\)/, "Player gunfire damage must trigger exactly one body impact.");
  assert.match(gameScript, /SpawnImpact\?\.\(target, "body"\)/, "Enemy gunfire damage must trigger exactly one friendly body impact.");
  assert.match(gameScript, /GetBallisticImpact\(unit, enemy\)/, "Player shots blocked after aiming must resolve the struck cover surface.");
  assert.match(gameScript, /SpawnImpact\?\.\(obstacleImpact, obstacleImpact\.material\)/, "Cover impacts must use authored material response.");
  assert.equal((gameScript.match(/SpawnImpact\?\.\(enemy, "body"\)/g) ?? []).length, 1, "A player damage event must not duplicate body feedback.");
  assert.equal((gameScript.match(/SpawnImpact\?\.\(target, "body"\)/g) ?? []).length, 1, "An enemy damage event must not duplicate body feedback.");
  assert.match(gameScript, /framePacingP95/, "Performance diagnostics must distinguish browser frame pacing.");
  assert.match(gameScript, /totalWorkP95/, "Performance diagnostics must expose actual total CPU work p95.");
  assert.match(gameScript, /simulationWorkP95/, "Simulation CPU work must be measured independently.");
  assert.match(gameScript, /renderWorkP95/, "Render submission CPU work must be measured independently.");
  assert.match(gameScript, /hudWorkP95/, "HUD CPU work must be measured independently.");
  assert.match(gameScript, /p95: framePacingP95/, "The legacy p95 field must remain a frame-pacing alias.");
  assert.match(gameScript, /performance\.now\(\) - frameWorkStartedAt/, "Total work timing must measure frame-internal CPU work, not rAF delta.");
  assert.match(worldScript, /BakeMeshRoots\(staticObstacleRoots\)/, "Static obstacles must remain merged into a low-draw-call mesh.");
  assert.match(css, /\.unitHealth,[\s\S]*?display: block;[\s\S]*?max-height: 3px;/, "Roster health and suppression rails must stay thin block bars.");
  assert.match(css, /@media \(max-width: 760px\)[\s\S]*?\.unitCard strong \{[\s\S]*?font-size: 12px;/, "Mobile operative names must remain at least 12px.");
  assert.doesNotMatch(worldScript, /https?:\/\//);
  assert.equal(
    (css.match(/{/g) || []).length,
    (css.match(/}/g) || []).length,
    "CSS braces must remain balanced.",
  );
}

function Run() {
  TestDefinitions();
  TestInitialState();
  TestQueueContract();
  TestPausedAbilityExecution();
  TestLineOfSightAndZones();
  TestBallisticImpactContract();
  TestNavigationContract();
  TestLightingContract();
  TestConcealmentContract();
  TestSoundUncertainty();
  TestEnemyKnowledgeBoundary();
  TestSquadIntelBoundary();
  TestEnemyTargetAndReportBoundaries();
  TestAiSimulation();
  TestScoringBoundary();
  TestCampBoundary();
  TestStaticPageContract();
  console.log("MountainEmber1941 smoke tests passed.");
}

Run();
