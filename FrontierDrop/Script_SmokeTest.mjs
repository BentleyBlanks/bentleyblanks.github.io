import assert from "node:assert/strict";

import {
  ACTOR_MAX,
  ACTOR_MIN,
  CreateInput,
  CreateMatch,
  GenerateMap,
  GetLocalView,
  MATCH_PHASES,
  RestartMatch,
  SAFE_ZONE_PHASES,
  StepMatch,
  WEAPON_DATA,
  WORLD_SIZE,
} from "./Script_Simulation.mjs";

function AssertMapGeneration() {
  assert.equal(WORLD_SIZE, 1000, "the authoritative world must be exactly one square kilometre");
  const firstMap = GenerateMap("MapDeterminism");
  const secondMap = GenerateMap("MapDeterminism");
  const differentMap = GenerateMap("MapVariation");
  assert.deepEqual(firstMap, secondMap, "the same map seed must reproduce every object");
  assert.notDeepEqual(firstMap.buildings[0], differentMap.buildings[0], "different seeds should vary the map");
  assert.equal(firstMap.width, 1000);
  assert.equal(firstMap.height, 1000);
  assert.equal(firstMap.size, 1000);
  assert.ok(firstMap.roads.length >= 6);
  assert.ok(firstMap.buildings.length >= 45);
  assert.ok(firstMap.trees.length >= 100);
  assert.ok(firstMap.rocks.length >= 40);
  assert.ok(firstMap.loot.length >= ACTOR_MAX * 2, "there must be enough loot for a full lobby");
  assert.deepEqual(JSON.parse(JSON.stringify(firstMap)), firstMap, "map data must be plain JSON data");
}

function AssertStateAndInputApi() {
  const firstState = CreateMatch({
    seed: "StateDeterminism",
    actorCount: ACTOR_MIN,
    humanPlayerIds: ["LocalPlayer", "LanGuest"],
  });
  const secondState = CreateMatch({
    seed: "StateDeterminism",
    actorCount: ACTOR_MIN,
    humanPlayerIds: ["LocalPlayer", "LanGuest"],
  });
  assert.equal(firstState.actors.length, ACTOR_MIN);
  assert.equal(firstState.actors[0].id, "LocalPlayer");
  assert.equal(firstState.actors[1].id, "LanGuest");
  assert.equal(firstState.actors.filter((actor) => actor.isHuman).length, 2);
  assert.deepEqual(firstState, secondState, "initial state must be deterministic");
  for (let index = 0; index < 12; index += 1) {
    const inputs = {
      LocalPlayer: CreateInput({ jump: index > 4, moveX: 0.25, moveY: -0.5 }),
      LanGuest: CreateInput({ jump: index > 6, parachute: index > 9 }),
    };
    StepMatch(firstState, inputs, 0.2);
    StepMatch(secondState, inputs, 0.2);
  }
  assert.deepEqual(firstState, secondState, "stepping with identical inputs must remain deterministic");
  assert.deepEqual(JSON.parse(JSON.stringify(firstState)), firstState, "the complete match state must serialize as JSON");

  const normalizedInput = CreateInput({ moveX: 5, moveY: -3, aimX: 2, shoot: 1, pickup: "yes" });
  assert.equal(normalizedInput.moveX, 1);
  assert.equal(normalizedInput.moveY, -1);
  assert.equal(normalizedInput.aimX, 1);
  assert.equal(normalizedInput.shoot, true);
  assert.equal(normalizedInput.pickup, true);

  const view = GetLocalView(firstState, "LocalPlayer");
  assert.equal(view.worldSize, WORLD_SIZE);
  assert.equal(view.player.id, "LocalPlayer");
  assert.equal(view.actors.length, ACTOR_MIN);
}

function AssertAiDifficultyProfiles() {
  const rookieState = CreateMatch({ seed: "DifficultyProfile", actorCount: ACTOR_MIN, difficulty: "rookie" });
  const veteranState = CreateMatch({ seed: "DifficultyProfile", actorCount: ACTOR_MIN, difficulty: "veteran" });
  const eliteState = CreateMatch({ seed: "DifficultyProfile", actorCount: ACTOR_MIN, difficulty: "elite" });
  const fallbackState = CreateMatch({ seed: "DifficultyProfile", actorCount: ACTOR_MIN, difficulty: "unknown" });
  assert.equal(rookieState.config.difficulty, "rookie");
  assert.equal(veteranState.config.difficulty, "veteran");
  assert.equal(eliteState.config.difficulty, "elite");
  assert.equal(fallbackState.config.difficulty, "veteran");
  for (const state of [rookieState, eliteState]) {
    state.phase = "combat";
    state.phaseTime = 0;
    for (const actor of state.actors) {
      actor.status = "ground";
      actor.z = 0;
    }
  }
  StepMatch(rookieState, {}, 0.26);
  StepMatch(eliteState, {}, 0.26);
  assert.ok(
    rookieState.actors[0].ai.decisionTimer > eliteState.actors[0].ai.decisionTimer,
    "rookie AI must react more slowly than elite AI under the same deterministic state",
  );
}

function CreateCombatFixture(seed = "Mechanics") {
  const humanPlayerIds = Array.from({ length: ACTOR_MIN }, (_, index) => `TestPlayer_${String(index + 1).padStart(2, "0")}`);
  const state = CreateMatch({ seed, actorCount: ACTOR_MIN, humanPlayerIds });
  state.phase = "combat";
  state.phaseTime = 0;
  state.phaseHistory = ["lobby", "flight", "drop", "combat"];
  state.safeZone = {
    phaseIndex: 0,
    completedPhases: 0,
    stage: "waiting",
    stageTime: 0,
    center: { x: 500, y: 500 },
    radius: 1000,
    startCenter: { x: 500, y: 500 },
    startRadius: 1000,
    targetCenter: { x: 500, y: 500 },
    targetRadius: SAFE_ZONE_PHASES[0].radius,
    damagePerSecond: SAFE_ZONE_PHASES[0].damagePerSecond,
  };
  state.map.buildings = [];
  state.map.rocks = [];
  state.map.trees = [];
  state.map.loot = [];
  for (let index = 0; index < state.actors.length; index += 1) {
    const actor = state.actors[index];
    actor.status = "ground";
    actor.x = 700 + (index % 6) * 20;
    actor.y = 700 + Math.floor(index / 6) * 20;
    actor.z = 0;
    actor.health = 100;
    actor.armor = 0;
    actor.inventory.weaponId = null;
    actor.inventory.magazineAmmo = 0;
    actor.inventory.reserveAmmo = 0;
    actor.inventory.medkits = 0;
  }
  return state;
}

function AssertCombatMechanics() {
  const state = CreateCombatFixture();
  const shooter = state.actors[0];
  const target = state.actors[1];
  shooter.x = 100;
  shooter.y = 100;
  shooter.angle = 0;
  shooter.inventory.weaponId = "PulseCarbine";
  shooter.inventory.magazineAmmo = 4;
  shooter.inventory.reserveAmmo = 20;
  target.x = 120;
  target.y = 100;
  target.armor = 60;
  const targetHealthBefore = target.health;
  const targetArmorBefore = target.armor;

  StepMatch(state, {
    [shooter.id]: CreateInput({ aimX: 1, shoot: true }),
  }, 0.05);
  assert.equal(shooter.inventory.magazineAmmo, 3, "shooting consumes magazine ammo");
  assert.ok(target.health < targetHealthBefore, "a clear hitscan shot must damage the target");
  assert.ok(target.armor < targetArmorBefore, "armor must absorb part of a weapon hit");
  assert.ok(target.health > targetHealthBefore - WEAPON_DATA.PulseCarbine.damage, "armor must reduce health damage");

  shooter.fireCooldown = 0;
  target.health = 1;
  target.armor = 0;
  StepMatch(state, {
    [shooter.id]: CreateInput({ aimX: 1, shoot: true }),
  }, 0.05);
  assert.equal(target.alive, false, "lethal hits must eliminate an actor");
  assert.equal(shooter.kills, 1);
  assert.equal(state.killFeed.at(-1).victimId, target.id);

  state.map.loot.push({
    id: "Loot_TestMedkit",
    x: shooter.x,
    y: shooter.y,
    type: "medkit",
    amount: 1,
    available: true,
    pickedBy: null,
  });
  StepMatch(state, { [shooter.id]: CreateInput({ pickup: true }) }, 0.05);
  assert.equal(shooter.inventory.medkits, 1, "nearby loot must be picked up");
  assert.equal(state.map.loot[0].available, false);

  shooter.health = 35;
  StepMatch(state, { [shooter.id]: CreateInput({ heal: true }) }, 2.8);
  assert.ok(shooter.health > 35, "a completed medkit action must restore health");
  assert.equal(shooter.inventory.medkits, 0);

  shooter.inventory.magazineAmmo = 0;
  shooter.inventory.reserveAmmo = 17;
  shooter.reloadTimer = 0;
  StepMatch(state, { [shooter.id]: CreateInput({ reload: true }) }, 2.2);
  assert.ok(shooter.inventory.magazineAmmo > 0, "reload must transfer reserve ammo into the magazine");
  assert.ok(shooter.inventory.reserveAmmo < 17);

  const collisionState = CreateCombatFixture("Collision");
  const mover = collisionState.actors[0];
  mover.x = 185;
  mover.y = 100;
  collisionState.map.buildings.push({
    id: "Building_CollisionTest",
    x: 200,
    y: 100,
    width: 20,
    height: 40,
    roofTone: 0,
  });
  StepMatch(collisionState, { [mover.id]: CreateInput({ moveX: 1, sprint: true }) }, 1);
  assert.ok(mover.x < 189, "solid buildings must block movement");

  const zoneState = CreateCombatFixture("ZoneDamage");
  const exposedActor = zoneState.actors[0];
  exposedActor.x = 900;
  exposedActor.y = 900;
  zoneState.safeZone.center = { x: 500, y: 500 };
  zoneState.safeZone.radius = 100;
  zoneState.safeZone.damagePerSecond = 10;
  const exposedHealth = exposedActor.health;
  StepMatch(zoneState, {}, 1);
  assert.ok(exposedActor.health < exposedHealth, "actors outside the safe zone must take damage");

  assert.equal(SAFE_ZONE_PHASES.length, 6, "the match must define exactly six shrinking safe-zone phases");
  for (let index = 1; index < SAFE_ZONE_PHASES.length; index += 1) {
    assert.ok(SAFE_ZONE_PHASES[index].radius < SAFE_ZONE_PHASES[index - 1].radius);
    assert.ok(SAFE_ZONE_PHASES[index].damagePerSecond > SAFE_ZONE_PHASES[index - 1].damagePerSecond);
  }

  const phaseState = CreateCombatFixture("SixZonePhases");
  phaseState.config.zoneDurationScale = 0.08;
  let phaseGuard = 0;
  while (phaseState.safeZone.completedPhases < SAFE_ZONE_PHASES.length && phaseGuard < 400) {
    for (const actor of phaseState.actors) {
      actor.x = phaseState.safeZone.center.x;
      actor.y = phaseState.safeZone.center.y;
    }
    StepMatch(phaseState, {}, 0.05);
    phaseGuard += 1;
  }
  assert.equal(phaseState.safeZone.completedPhases, 6, "all six safe-zone phases must be able to complete");
  assert.equal(phaseState.safeZone.stage, "final");
}

function RunAcceleratedMatch(seed) {
  const state = CreateMatch({
    seed,
    actorCount: ACTOR_MIN + (Number(seed.split("_").at(-1)) % (ACTOR_MAX - ACTOR_MIN + 1)),
    timing: {
      lobbyDuration: 0.08,
      planeSpeed: 250,
      dropAltitude: 120,
      freefallSpeed: 72,
      parachuteSpeed: 25,
      zoneDurationScale: 0.14,
      maxCombatDuration: 78,
    },
  });
  let calls = 0;
  while (state.phase !== "results" && calls < 160) {
    StepMatch(state, {}, 1);
    calls += 1;
  }
  assert.equal(state.phase, "results", `accelerated match ${seed} deadlocked`);
  assert.deepEqual(state.phaseHistory, MATCH_PHASES, "every match phase must be visited in order");
  assert.equal(state.restartReady, true);
  assert.equal(state.result.restartReady, true);
  assert.ok(state.winnerId, "a match must name one winner");
  assert.equal(state.result.winnerId, state.winnerId);
  assert.equal(state.actors.filter((actor) => actor.alive).length, 1, "exactly one actor must survive");
  assert.equal(state.actors.filter((actor) => actor.id === state.winnerId).length, 1, "winner IDs must be unique");
  assert.ok(state.killFeed.length > 0, "AI combat must produce eliminations");
  assert.ok(state.time < 160, "accelerated match exceeded its progress guard");
  return state;
}

function AssertManyMatchesFinish() {
  const summaries = [];
  let lastState = null;
  for (let index = 0; index < 16; index += 1) {
    lastState = RunAcceleratedMatch(`Smoke_${index}`);
    summaries.push({
      seed: lastState.seed,
      actors: lastState.actors.length,
      winnerId: lastState.winnerId,
      duration: lastState.result.duration,
      reason: lastState.result.reason,
    });
  }
  const rematch = RestartMatch(lastState, { seed: "Smoke_Restart" });
  assert.equal(rematch.phase, "lobby");
  assert.equal(rematch.restartReady, false);
  assert.equal(rematch.actors.length, lastState.actors.length);
  return summaries;
}

function RunSmokeTests() {
  AssertMapGeneration();
  AssertStateAndInputApi();
  AssertAiDifficultyProfiles();
  AssertCombatMechanics();
  const summaries = AssertManyMatchesFinish();
  const longestMatch = Math.max(...summaries.map((summary) => summary.duration));
  const timeoutMatches = summaries.filter((summary) => summary.reason === "combatTimeoutTiebreak").length;
  console.log(
    `Frontier Drop smoke tests passed: ${summaries.length} full AI matches, longest ${longestMatch.toFixed(2)}s, ${timeoutMatches} timeout tiebreaks.`,
  );
}

RunSmokeTests();
