import assert from "node:assert/strict";

import { missionStages, routeChoice } from "./Data_Story.mjs";
import { interactables, levelValidation, levelZones, patrolRoutes, storyTriggers } from "./Data_Level.mjs";
import {
  BuildDialogueSchedule,
  EvaluateRouteOption,
  RequirementGroupsMet,
  RequirementsMet,
  SelectQuietPassageMaterial,
  SystemConditionMet,
} from "./Script_NarrativeState.mjs";

import {
  ApplyEnemyAlert,
  BeginBandage,
  CanCraft,
  CompanionCommandIds,
  CraftItem,
  CreateCompanionState,
  CreateEnemyState,
  CreateGameplayConfig,
  CreateGameplayState,
  CreateGameplaySystems,
  CreateInventory,
  CreateMissionRhythmState,
  CreateMovementState,
  CreateSeededRandom,
  CreateStaminaState,
  DeserializeGameplayState,
  DesktopPerformanceProfile,
  EmitNoise,
  EnemyStateIds,
  EvaluateHearing,
  EvaluateVision,
  FireWeapon,
  GameplayEventIds,
  LureTypeIds,
  MissionBeatKindIds,
  NoiseKindIds,
  PropagateNoise,
  ReloadWeapon,
  SelectAiSimulationSet,
  SerializeGameplayState,
  SetCompanionCommand,
  ShouldRunAiTick,
  ThrowLure,
  UpdateBandage,
  UpdateCompanion,
  UpdateEnemyAi,
  UpdateGameplayState,
  UpdateLure,
  UpdateMissionRhythm,
  UpdateMovement,
  UpdateStamina,
  ValidateMissionRhythm,
} from "./Script_GameplaySystems.mjs";

const testResults = [];

function Test(name, callback) {
  const startedAt = performance.now();
  try {
    callback();
    const duration = performance.now() - startedAt;
    testResults.push({ name, ok: true, duration });
    console.log(`PASS ${name} (${duration.toFixed(1)}ms)`);
  } catch (error) {
    const duration = performance.now() - startedAt;
    testResults.push({ name, ok: false, duration, error });
    console.error(`FAIL ${name} (${duration.toFixed(1)}ms)`);
    throw error;
  }
}

function Approximate(actual, expected, tolerance = 1e-6, message = "values should be approximately equal") {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${message}: ${actual} vs ${expected}`);
}

function SimulateEnemy(initialEnemy, frameFactory, stepCount, delta = 0.1, config) {
  let enemy = CreateEnemyState(initialEnemy, config);
  const states = [enemy.stateId];
  const events = [];
  let lastResult = null;
  for (let step = 0; step < stepCount; step += 1) {
    const frame = frameFactory(step, enemy);
    lastResult = UpdateEnemyAi(enemy, {
      ...frame,
      delta,
      timeSeconds: step * delta,
    }, frame.dependencies ?? {}, config);
    enemy = lastResult.state;
    events.push(...lastResult.events);
    if (states.at(-1) !== enemy.stateId) {
      states.push(enemy.stateId);
    }
  }
  return { enemy, states, events, lastResult };
}

Test("seeded random is deterministic and restorable", () => {
  const firstRandom = CreateSeededRandom(1942);
  const secondRandom = CreateSeededRandom(1942);
  const firstSequence = Array.from({ length: 8 }, () => firstRandom.Next());
  const secondSequence = Array.from({ length: 8 }, () => secondRandom.Next());
  assert.deepEqual(firstSequence, secondSequence);
  assert.ok(new Set(firstSequence).size > 6);
  const savedState = firstRandom.GetState();
  const expectedNext = firstRandom.Next();
  firstRandom.SetState(savedState);
  assert.equal(firstRandom.Next(), expectedNext);
});

Test("the single desktop simulation profile keeps every fidelity system enabled", () => {
  const desktopConfig = CreateGameplayConfig();
  assert.equal(desktopConfig.performance.profileId, "desktop");
  assert.equal(desktopConfig.performance.maxSimulatedEnemies, DesktopPerformanceProfile.maxSimulatedEnemies);
  assert.equal(desktopConfig.performance.visionRayBudgetPerFrame, DesktopPerformanceProfile.visionRayBudgetPerFrame);
  assert.equal(desktopConfig.performance.enableAcousticOcclusion, true);
  assert.equal(desktopConfig.performance.enablePeripheralVision, true);
});

Test("stamina drains only during a valid sprint and recovers after its delay", () => {
  const originalState = CreateStaminaState({ current: 100 });
  let stamina = originalState;
  for (let step = 0; step < 8; step += 1) {
    stamina = UpdateStamina(stamina, {
      wantsSprint: true,
      isMoving: true,
      isGrounded: true,
      isCrouched: false,
    }, 0.25);
  }
  assert.equal(originalState.current, 100, "input stamina state must not be mutated");
  Approximate(stamina.current, 52, 1e-6);
  assert.equal(stamina.isSprinting, true);
  for (let step = 0; step < 8; step += 1) {
    stamina = UpdateStamina(stamina, {
      wantsSprint: false,
      isMoving: false,
      isGrounded: true,
      isCrouched: false,
    }, 0.25);
  }
  assert.ok(stamina.current > 52, "recovery should begin after the recovery delay");
  const crouchedAttempt = UpdateStamina(stamina, {
    wantsSprint: true,
    isMoving: true,
    isGrounded: true,
    isCrouched: true,
  }, 0.25);
  assert.equal(crouchedAttempt.isSprinting, false);
  assert.ok(crouchedAttempt.current >= stamina.current);
});

Test("movement produces quieter crouch footsteps and preserves x,z coordinates", () => {
  let standingState = CreateMovementState();
  let crouchedState = CreateMovementState();
  const standingNoises = [];
  const crouchedNoises = [];
  let standingOutput;
  let crouchedOutput;
  for (let step = 0; step < 30; step += 1) {
    standingOutput = UpdateMovement(standingState, {
      actorId: "linYan",
      move: { x: 0, z: 1 },
      position: { x: 1, z: 2 },
      surfaceId: "stone",
      timeSeconds: step * 0.1,
    }, 0.1);
    standingState = standingOutput.state;
    standingNoises.push(...standingOutput.noiseEvents);
    crouchedOutput = UpdateMovement(crouchedState, {
      actorId: "linYanCrouched",
      move: { x: 0, z: 1 },
      position: { x: 1, z: 2 },
      crouch: true,
      surfaceId: "stone",
      timeSeconds: step * 0.1,
    }, 0.1);
    crouchedState = crouchedOutput.state;
    crouchedNoises.push(...crouchedOutput.noiseEvents);
  }
  assert.ok(standingOutput.speed > crouchedOutput.speed);
  assert.ok(standingNoises.length > 0);
  assert.ok(crouchedNoises.length > 0);
  assert.ok(standingNoises[0].radius > crouchedNoises[0].radius * 1.5);
  assert.deepEqual(Object.keys(standingOutput.desiredDisplacement).sort(), ["x", "z"]);
});

Test("noise propagation respects range, acoustic obstacles, and listener budget", () => {
  const noise = EmitNoise({
    eventId: "bottleCourtyard",
    sourceId: "player",
    kindId: NoiseKindIds.BOTTLE_BREAK,
    position: { x: 0, z: 0 },
    radius: 18,
    timestamp: 2,
  });
  const listener = CreateEnemyState({ enemyId: "guard", position: { x: 0, z: 7 } });
  const openResult = EvaluateHearing(listener, noise);
  assert.equal(openResult.heard, true);
  assert.ok(openResult.audibility > 0.1);
  const wall = {
    position: { x: 0, z: 3.5 },
    radius: 0.8,
    acousticTransmission: 0.08,
    blocksVision: true,
  };
  const blockedResult = EvaluateHearing(listener, noise, { obstacles: [wall] });
  assert.equal(blockedResult.heard, false);
  assert.ok(blockedResult.audibility < openResult.audibility);

  const propagation = PropagateNoise(noise, [
    { enemyId: "far", position: { x: 0, z: 12 } },
    { enemyId: "engaged", stateId: EnemyStateIds.ENGAGE, position: { x: 0, z: 11 } },
    { enemyId: "near", position: { x: 0, z: 3 } },
  ], { hearingListenerBudget: 1 });
  assert.equal(propagation.results.length, 1);
  assert.equal(propagation.results[0].listenerId, "engaged", "engaged guards retain priority under load");
  assert.equal(propagation.deferredListenerIds.length, 2);
});

Test("vision accounts for facing, crouch exposure, darkness, and occlusion", () => {
  const observer = CreateEnemyState({
    enemyId: "sentry",
    position: { x: 0, z: 0 },
    forward: { x: 0, z: 1 },
  });
  const target = {
    playerId: "player",
    position: { x: 0, z: 6 },
    illumination: 1,
    speed: 1,
    alive: true,
  };
  const openResult = EvaluateVision(observer, target);
  assert.equal(openResult.visible, true);
  const crouchedResult = EvaluateVision(observer, { ...target, isCrouched: true, illumination: 0.15 });
  assert.equal(crouchedResult.visible, true);
  assert.ok(crouchedResult.detectionStrength < openResult.detectionStrength * 0.65);
  const behindResult = EvaluateVision(observer, { ...target, position: { x: 0, z: -4 } });
  assert.equal(behindResult.visible, false);
  const blockedResult = EvaluateVision(observer, target, {
    obstacles: [{ position: { x: 0, z: 3 }, radius: 0.7, blocksVision: true }],
  });
  assert.equal(blockedResult.visible, false);
  const closeCoverResult = EvaluateVision(observer, {
    ...target,
    position: { x: 0, z: 1 },
    isCrouched: true,
    visibilityMultiplier: 0.16,
    concealment: 0.84,
    illumination: 0.2,
  });
  assert.equal(closeCoverResult.visible, true, "cover must not grant invisibility at touching distance");
  assert.ok(closeCoverResult.detectionStrength >= 0.2);
});

Test("enemy investigates a bottle, searches, then returns to patrol when no evidence appears", () => {
  const bottleNoise = EmitNoise({
    eventId: "kilnBottle",
    sourceId: "player",
    kindId: NoiseKindIds.BOTTLE_BREAK,
    position: { x: 4, z: 3 },
    radius: 18,
    timestamp: 0,
  });
  const simulation = SimulateEnemy({
    enemyId: "kilnGuard",
    position: { x: 0, z: 0 },
    forward: { x: 0, z: 1 },
    patrolPoints: [{ x: 0, z: 0 }, { x: 3, z: 0 }],
    searchAnchors: [{ x: 4, z: 3 }, { x: 5, z: 2 }],
  }, (step) => ({
    player: { position: { x: 0, z: -30 }, hidden: true, alive: true },
    noises: step < 30 ? [bottleNoise] : [],
  }), 150, 0.1);
  assert.deepEqual(simulation.states.slice(0, 3), [
    EnemyStateIds.PATROL,
    EnemyStateIds.SUSPICIOUS,
    EnemyStateIds.SEARCH,
  ]);
  assert.equal(simulation.enemy.stateId, EnemyStateIds.PATROL);
  assert.ok(simulation.events.some((event) => event.eventId === GameplayEventIds.ENEMY_HEARD_NOISE));
  assert.equal(
    simulation.events.filter((event) => event.eventId === GameplayEventIds.ENEMY_HEARD_NOISE).length,
    1,
    "one buffered noise must not retrigger every AI tick",
  );
});

Test("enemy visually escalates to alert and engagement, then enters lost target and search", () => {
  let enemy = CreateEnemyState({
    enemyId: "blockadeGuard",
    position: { x: 0, z: 0 },
    forward: { x: 0, z: 1 },
  });
  const states = [enemy.stateId];
  for (let step = 0; step < 20 && enemy.stateId !== EnemyStateIds.ENGAGE; step += 1) {
    const result = UpdateEnemyAi(enemy, {
      delta: 0.25,
      timeSeconds: step * 0.25,
      player: {
        playerId: "player",
        position: { x: 0, z: 4 },
        illumination: 1,
        alive: true,
      },
      noises: [],
    });
    enemy = result.state;
    if (states.at(-1) !== enemy.stateId) {
      states.push(enemy.stateId);
    }
  }
  assert.ok(states.includes(EnemyStateIds.SUSPICIOUS));
  assert.ok(states.includes(EnemyStateIds.ALERT));
  assert.equal(enemy.stateId, EnemyStateIds.ENGAGE);
  assert.ok(enemy.shotCooldownSeconds >= 1.25, "a fire request should schedule a deterministic cooldown");
  const cooldownResult = UpdateEnemyAi(enemy, {
    delta: 0.1,
    timeSeconds: 9,
    player: { position: { x: 0, z: 4 }, illumination: 1, alive: true },
    noises: [],
  });
  assert.equal(cooldownResult.intent.shouldFire, false, "engaged enemies must not request a shot every frame");
  enemy = cooldownResult.state;

  for (let step = 0; step < 8 && enemy.stateId !== EnemyStateIds.LOST_TARGET; step += 1) {
    enemy = UpdateEnemyAi(enemy, {
      delta: 0.25,
      player: { position: { x: 0, z: 4 }, illumination: 1, alive: true },
      noises: [],
      obstacles: [{ position: { x: 0, z: 2 }, radius: 0.75, blocksVision: true }],
    }).state;
  }
  assert.equal(enemy.stateId, EnemyStateIds.LOST_TARGET);
  for (let step = 0; step < 30 && enemy.stateId === EnemyStateIds.LOST_TARGET; step += 1) {
    enemy = UpdateEnemyAi(enemy, {
      delta: 0.25,
      player: { position: { x: 0, z: 4 }, hidden: true, alive: true },
      noises: [],
    }).state;
  }
  assert.equal(enemy.stateId, EnemyStateIds.SEARCH);
  assert.ok(enemy.lastKnownTargetPosition);
});

Test("stealth balance audit makes sprint exposure faster than walking and crouching", () => {
  function TimeToAlert(profile, distance) {
    let enemy = CreateEnemyState({
      enemyId: `${profile.id}${distance}`,
      position: { x: 0, z: 0 },
      forward: { x: 0, z: 1 },
    });
    for (let step = 0; step < 200; step += 1) {
      const result = UpdateEnemyAi(enemy, {
        delta: 0.1,
        timeSeconds: step * 0.1,
        player: {
          position: { x: 0, z: distance },
          illumination: 0.5,
          speed: profile.speed,
          isCrouched: profile.isCrouched,
          isSprinting: profile.isSprinting,
          alive: true,
        },
        noises: [],
      });
      enemy = result.state;
      if ([EnemyStateIds.ALERT, EnemyStateIds.ENGAGE].includes(enemy.stateId)) {
        return (step + 1) * 0.1;
      }
    }
    return Infinity;
  }

  const profiles = {
    crouch: { id: "crouch", speed: 0.8, isCrouched: true, isSprinting: false },
    walk: { id: "walk", speed: 2.2, isCrouched: false, isSprinting: false },
    sprint: { id: "sprint", speed: 4.3, isCrouched: false, isSprinting: true },
  };
  const distances = [5, 8, 12, 16];
  const averages = {};
  for (const [profileId, profile] of Object.entries(profiles)) {
    const times = distances.map((distance) => TimeToAlert(profile, distance));
    assert.ok(times.every(Number.isFinite), `${profileId} should remain detectable in an open lane`);
    averages[profileId] = times.reduce((sum, time) => sum + time, 0) / times.length;
  }
  assert.ok(averages.sprint < averages.walk);
  assert.ok(averages.walk < averages.crouch);
  assert.ok(averages.crouch >= averages.sprint * 1.45, "crouching should create a meaningful timing window");
});

Test("ally alerts decay with distance and never alert the source enemy", () => {
  const source = CreateEnemyState({ enemyId: "source", position: { x: 0, z: 0 } });
  const ally = CreateEnemyState({ enemyId: "ally", position: { x: 3, z: 0 } });
  const farAlly = CreateEnemyState({ enemyId: "farAlly", position: { x: 30, z: 0 } });
  const alert = {
    sourceId: "source",
    position: { x: 0, z: 0 },
    targetPosition: { x: 2, z: 5 },
    radius: 18,
    intensity: 0.9,
  };
  assert.equal(ApplyEnemyAlert(source, alert).stateId, EnemyStateIds.PATROL);
  assert.equal(ApplyEnemyAlert(ally, alert).stateId, EnemyStateIds.ALERT);
  assert.equal(ApplyEnemyAlert(farAlly, alert).stateId, EnemyStateIds.PATROL);
});

Test("finite ammunition, deterministic spread, dry fire, and reload all conserve rounds", () => {
  const inventory = CreateInventory({
    magazineAmmo: 2,
    reserveAmmo: 3,
    bottleCount: 1,
  });
  const firstShot = FireWeapon(inventory, {
    actorId: "player",
    position: { x: 1, z: 2 },
    direction: { x: 0, z: 1 },
    timeSeconds: 1,
    random: CreateSeededRandom(99),
  });
  const repeatShot = FireWeapon(inventory, {
    actorId: "player",
    position: { x: 1, z: 2 },
    direction: { x: 0, z: 1 },
    timeSeconds: 1,
    random: CreateSeededRandom(99),
  });
  assert.equal(firstShot.ok, true);
  assert.equal(firstShot.inventory.weapon.magazineAmmo, 1);
  assert.equal(inventory.weapon.magazineAmmo, 2, "fire must not mutate caller inventory");
  assert.equal(firstShot.shot.spreadYawRadians, repeatShot.shot.spreadYawRadians);
  const secondShot = FireWeapon(firstShot.inventory, {
    actorId: "player",
    position: { x: 1, z: 2 },
    direction: { x: 0, z: 1 },
    timeSeconds: 2,
  });
  const dryFire = FireWeapon(secondShot.inventory, {
    actorId: "player",
    position: { x: 1, z: 2 },
    direction: { x: 0, z: 1 },
    timeSeconds: 3,
  });
  assert.equal(dryFire.ok, false);
  assert.equal(dryFire.reasonId, "emptyMagazine");
  assert.equal(dryFire.noiseEvents[0].kindId, NoiseKindIds.DRY_FIRE);
  const reload = ReloadWeapon(dryFire.inventory);
  assert.equal(reload.ok, true);
  assert.equal(reload.transferredAmmo, 3);
  assert.equal(reload.inventory.weapon.magazineAmmo, 3);
  assert.equal(reload.inventory.weapon.reserveAmmo, 0);
});

Test("crafting checks ingredients, consumes exact resources, and never goes negative", () => {
  const inventory = CreateInventory({
    materials: { cloth: 4, alcohol: 2, scrap: 0 },
    items: { bandage: 0, bottle: 0, emptyCan: 0, tinCan: 0 },
  });
  assert.equal(CanCraft(inventory, "bandage", 2), true);
  const crafted = CraftItem(inventory, "bandage", 2);
  assert.equal(crafted.ok, true);
  assert.equal(crafted.inventory.materials.cloth, 0);
  assert.equal(crafted.inventory.materials.alcohol, 0);
  assert.equal(crafted.inventory.items.bandage, 2);
  assert.equal(inventory.materials.cloth, 4, "craft must not mutate caller inventory");
  const rejected = CraftItem(crafted.inventory, "bandage", 1);
  assert.equal(rejected.ok, false);
  assert.deepEqual(rejected.missing, { cloth: 2, alcohol: 1 });
  assert.ok(Object.values(rejected.inventory.materials).every((value) => value >= 0));

  const lureMaterials = CreateInventory({
    materials: { cloth: 1, scrap: 1 },
    items: { emptyCan: 1, tinCan: 0 },
  });
  const lureCraft = CraftItem(lureMaterials, "noiseBundle");
  assert.equal(lureCraft.ok, true);
  assert.equal(lureCraft.inventory.materials.cloth, 0);
  assert.equal(lureCraft.inventory.materials.scrap, 0);
  assert.equal(lureCraft.inventory.items.emptyCan, 0);
  assert.equal(lureCraft.inventory.items.tinCan, 1);
  assert.equal(lureMaterials.items.emptyCan, 1, "craft must not mutate the source empty can");
});

Test("bandaging heals only after completion and interruption preserves the item", () => {
  const inventory = CreateInventory({ items: { bandage: 1 } });
  const started = BeginBandage({
    playerId: "player",
    health: 30,
    maximumHealth: 100,
    position: { x: 0, z: 0 },
  }, inventory, 5);
  assert.equal(started.ok, true);
  const interrupted = UpdateBandage(started.player, started.inventory, {
    delta: 0.2,
    movementSpeed: 1.2,
    timeSeconds: 5.2,
  });
  assert.equal(interrupted.interrupted, true);
  assert.equal(interrupted.inventory.items.bandage, 1);
  assert.equal(interrupted.player.health, 30);

  let player = BeginBandage(interrupted.player, interrupted.inventory, 6).player;
  let activeInventory = player.inventory;
  let updateResult;
  for (let step = 0; step < 20; step += 1) {
    updateResult = UpdateBandage(player, activeInventory, {
      delta: 0.25,
      movementSpeed: 0,
      timeSeconds: 6 + step * 0.25,
    });
    player = updateResult.player;
    activeInventory = updateResult.inventory;
    if (updateResult.completed) {
      break;
    }
  }
  assert.equal(updateResult.completed, true);
  assert.equal(player.health, 68);
  assert.equal(activeInventory.items.bandage, 0);
});

Test("bottle and tin can throws consume inventory and create physical impact noises", () => {
  let inventory = CreateInventory({ items: { bottle: 1, tinCan: 1 } });
  const bottleThrow = ThrowLure(inventory, {
    actorId: "player",
    typeId: LureTypeIds.BOTTLE,
    position: { x: 0, z: 0 },
    direction: { x: 0, z: 1 },
    timeSeconds: 1,
  });
  assert.equal(bottleThrow.ok, true);
  assert.equal(bottleThrow.inventory.items.bottle, 0);
  assert.equal(inventory.items.bottle, 1);
  inventory = bottleThrow.inventory;
  let bottle = bottleThrow.lure;
  const bottleNoises = [];
  for (let step = 0; step < 50 && bottle.active; step += 1) {
    const result = UpdateLure(bottle, { delta: 0.1, timeSeconds: 1 + step * 0.1 });
    bottle = result.state;
    bottleNoises.push(...result.noiseEvents);
  }
  assert.equal(bottle.active, false);
  assert.ok(bottle.position.z > 5);
  assert.equal(bottleNoises.length, 1);
  assert.equal(bottleNoises[0].kindId, NoiseKindIds.BOTTLE_BREAK);
  const settledAge = bottle.ageSeconds;
  bottle = UpdateLure(bottle, { delta: 0.25, timeSeconds: 4 }).state;
  assert.ok(bottle.ageSeconds > settledAge, "settled lures need a cleanup clock for the host runtime");

  const tinThrow = ThrowLure(inventory, {
    actorId: "player",
    typeId: LureTypeIds.TIN_CAN,
    position: { x: 0, z: 0 },
    direction: { x: 1, z: 0 },
    timeSeconds: 4,
  });
  let tinCan = tinThrow.lure;
  const tinNoises = [];
  for (let step = 0; step < 100 && tinCan.active; step += 1) {
    const result = UpdateLure(tinCan, { delta: 0.1, timeSeconds: 4 + step * 0.1 });
    tinCan = result.state;
    tinNoises.push(...result.noiseEvents);
  }
  assert.equal(tinCan.active, false);
  assert.equal(tinCan.settled, true);
  assert.ok(tinNoises.length >= 2, "tin can should rattle across multiple impacts");
  assert.ok(tinNoises.every((noise) => noise.kindId === NoiseKindIds.TIN_CAN_IMPACT));
});

Test("companion follow, stay, revive, and cover actions have spatial and resource gates", () => {
  const companion = CreateCompanionState({
    companionId: "zhaoSheng",
    position: { x: 0, z: 0 },
    ammo: 1,
    bandages: 1,
  });
  const followResult = UpdateCompanion(companion, {
    delta: 0.1,
    player: { playerId: "player", position: { x: 0, z: 12 }, forward: { x: 0, z: 1 } },
    enemies: [],
  });
  assert.equal(followResult.intent.movementId, "catchUp");

  const stayCommand = SetCompanionCommand(companion, CompanionCommandIds.STAY, {
    position: { x: 0, z: 0 },
  });
  const stayResult = UpdateCompanion(stayCommand.state, {
    delta: 0.1,
    player: { playerId: "player", position: { x: 0, z: 12 } },
    enemies: [],
  });
  assert.equal(stayResult.intent.movementId, "hold");
  assert.deepEqual(stayResult.intent.targetPosition, { x: 0, z: 0 });

  const assistCommand = SetCompanionCommand(companion, CompanionCommandIds.ASSIST).state;
  const reviveResult = UpdateCompanion(assistCommand, {
    delta: 0.1,
    player: {
      playerId: "player",
      position: { x: 1, z: 0 },
      health: 0,
      maximumHealth: 100,
      downed: true,
    },
    playerDowned: true,
    enemies: [],
  });
  assert.equal(reviveResult.intent.assistActionId, "revivePlayer");
  assert.ok(reviveResult.events.some((event) => event.eventId === GameplayEventIds.COMPANION_ASSIST_REQUESTED));

  const coverResult = UpdateCompanion({ ...assistCommand, assistCooldownSeconds: 2 }, {
    delta: 0.1,
    player: { playerId: "player", position: { x: 1, z: 0 }, health: 80, maximumHealth: 100 },
    enemies: [{
      enemyId: "threat",
      stateId: EnemyStateIds.ENGAGE,
      position: { x: 5, z: 0 },
      alive: true,
    }],
    playerUnderPressure: true,
  });
  assert.equal(coverResult.intent.assistActionId, "coverShot");
  assert.equal(coverResult.state.ammo, 0);
});

Test("companion follow points stay outside the near-camera corridor without breaking rescue", () => {
  const desktopConfig = CreateGameplayConfig();
  assert.equal(desktopConfig.companion.preferredFollowDistance, 3.2);
  assert.equal(desktopConfig.companion.lateralFollowDistance, 2.8);
  const player = {
    playerId: "player",
    position: { x: 0, z: 0 },
    forward: { x: 0, z: -1 },
    health: 100,
    maximumHealth: 100,
  };
  const cameraForward = { x: 0, z: -1 };
  const companion = CreateCompanionState({
    companionId: "duXiangyun",
    position: { x: 0.1, z: 2.4 },
  });
  const followResult = UpdateCompanion(companion, {
    delta: 0.1,
    player,
    cameraForward,
    cameraRight: { x: 1, z: 0 },
    enemies: [],
  });
  const target = followResult.intent.targetPosition;
  const targetOffset = {
    x: target.x - player.position.x,
    z: target.z - player.position.z,
  };
  const rearDistance = -(targetOffset.x * cameraForward.x + targetOffset.z * cameraForward.z);
  const lateralDistance = Math.abs(targetOffset.x);
  assert.ok(rearDistance >= desktopConfig.companion.preferredFollowDistance - 1e-6);
  assert.ok(lateralDistance >= desktopConfig.companion.cameraSafeLateralDistance - 1e-6);
  assert.ok(target.x < 0, "Du Xiangyun should use the camera-left flank instead of the right foreground");
  const targetDepthFromCamera = 5.8 - rearDistance;
  for (const aspectRatio of [1280 / 720, 1024 / 640]) {
    const horizontalHalfSpan = Math.tan((48 * Math.PI / 180) * 0.5)
      * aspectRatio
      * targetDepthFromCamera;
    assert.ok(
      lateralDistance - 0.45 > horizontalHalfSpan,
      `the companion body should clear the ${aspectRatio.toFixed(2)} desktop frame at the follow point`,
    );
  }

  const turningResult = UpdateCompanion({
    ...companion,
    position: { x: 3, z: -1.2 },
  }, {
    delta: 0.1,
    player,
    cameraForward,
    cameraRight: { x: 1, z: 0 },
    enemies: [],
  });
  assert.ok(
    turningResult.intent.targetPosition.x >= desktopConfig.companion.cameraSafeLateralDistance - 1e-6,
    "a camera turn should keep the companion on her current safe edge instead of crossing the foreground",
  );

  const assistState = SetCompanionCommand({
    ...companion,
    position: { x: -4.2, z: 1.8 },
  }, CompanionCommandIds.ASSIST).state;
  const rescueApproach = UpdateCompanion(assistState, {
    delta: 0.1,
    player: { ...player, health: 0, downed: true },
    playerDowned: true,
    cameraForward,
    enemies: [],
  });
  assert.equal(rescueApproach.intent.movementId, "assistApproach");
  assert.deepEqual(rescueApproach.intent.targetPosition, player.position);
});

Test("mission rhythm accepts story schema, honors signals, and exposes pacing directives", () => {
  const missionData = {
    storyStages: [{
      stageId: "villageApproach",
      title: "Village approach",
      objectiveId: "reachKiln",
      entryTriggerId: "villageEntry",
      exitTriggerId: "kilnExit",
      aiZoneIds: ["villageEdgePatrolZone"],
      beats: [{
        beatId: "listenAtRidge",
        eventId: "ridgeConversation",
        kind: MissionBeatKindIds.COMPANION_STORY,
        targetSeconds: 5,
        intensity: 0.2,
        allowCombat: false,
        resourcePressure: 0.1,
      }, {
        beatId: "crossPatrol",
        kind: MissionBeatKindIds.STEALTH_TENSION,
        targetSeconds: 8,
        intensity: 0.72,
        allowCombat: true,
        resourcePressure: 0.55,
        advanceTriggerIds: ["kilnExit"],
      }],
    }, {
      stageId: "kilnAftermath",
      title: "Kiln aftermath",
      aiZoneIds: ["kilnPursuitZone"],
      beats: [{
        beatId: "countTheCost",
        kind: MissionBeatKindIds.AFTERMATH,
        targetSeconds: 5,
        intensity: 0.15,
        allowCombat: false,
        resourcePressure: 0.25,
      }],
    }],
  };
  const validation = ValidateMissionRhythm(missionData);
  assert.equal(validation.valid, true);
  assert.equal(validation.stages.length, 2);
  let rhythmState = CreateMissionRhythmState(missionData);
  let result;
  for (let step = 0; step < 5; step += 1) {
    result = UpdateMissionRhythm(rhythmState, missionData, {}, 1);
    rhythmState = result.state;
  }
  assert.equal(rhythmState.beatId, "crossPatrol");
  assert.equal(result.directives.allowCombat, true);
  assert.deepEqual(result.directives.aiZoneIds, ["villageEdgePatrolZone"]);
  for (let step = 0; step < 4; step += 1) {
    result = UpdateMissionRhythm(rhythmState, missionData, {}, 1);
    rhythmState = result.state;
  }
  assert.equal(rhythmState.beatId, "crossPatrol", "signal-gated beat should not advance early");
  result = UpdateMissionRhythm(rhythmState, missionData, { triggerIds: ["kilnExit"] }, 1);
  assert.equal(result.state.stageId, "kilnAftermath");
  assert.equal(result.state.beatId, "countTheCost");
});

Test("authored story pacing and AI zones run through the production system schema", () => {
  const validation = ValidateMissionRhythm({ missionStages });
  assert.equal(validation.valid, true);
  assert.equal(validation.stages.length, 12);
  const holdStage = validation.stages.find((stage) => stage.stageId === "holdKilnMouth");
  assert.ok(holdStage);
  assert.ok(holdStage.holdSeconds >= 24 && holdStage.holdSeconds <= 45, "rear guard must remain a limited hold");
  assert.equal(holdStage.aiZoneIds.includes("kilnPursuitZone"), true);

  const patrolRoute = patrolRoutes.find((route) => route.zoneId === "villageEdgePatrolZone");
  const patrolZone = levelZones.find((zone) => zone.zoneId === patrolRoute.zoneId);
  assert.ok(patrolRoute.points.length >= 3);
  assert.ok(patrolZone.searchAnchors.length >= 2);
  const guard = CreateEnemyState({
    enemyId: patrolRoute.routeId,
    position: patrolRoute.points[0],
    forward: { x: 0, z: -1 },
    patrolPoints: patrolRoute.points,
    searchAnchors: patrolZone.searchAnchors,
    hearingMultiplier: patrolZone.hearingMultiplier,
  });
  assert.deepEqual(Object.keys(guard.position).sort(), ["x", "z"]);
  assert.ok(guard.patrolPoints.every((point) => Object.keys(point).sort().join(",") === "x,z"));
  const authoredNoise = EmitNoise({
    eventId: "authoredZoneLure",
    sourceId: "player",
    kindId: NoiseKindIds.BOTTLE_BREAK,
    position: patrolRoute.points[1],
    radius: 18,
    timestamp: 1,
  });
  const result = UpdateEnemyAi(guard, {
    delta: 0.1,
    timeSeconds: 1,
    player: { position: { x: -30, z: 60 }, hidden: true, alive: true },
    noises: [authoredNoise],
    aiZone: patrolZone,
  });
  assert.equal(result.state.stateId, EnemyStateIds.SUSPICIOUS);
  assert.equal(result.intent.movementId, "investigate");
});

Test("the east gate is a required authored step that starts the convoy", () => {
  const stageIds = missionStages.map((stage) => stage.stageId);
  assert.deepEqual(stageIds, levelValidation.expectedStageOrder);
  assert.equal(stageIds.indexOf("openEastGate"), stageIds.indexOf("prepareQuietPassage") + 1);
  assert.equal(stageIds.indexOf("reachIrrigationDitch"), stageIds.indexOf("openEastGate") + 1);
  const gateStage = missionStages.find((stage) => stage.stageId === "openEastGate");
  const gateTrigger = storyTriggers.find((trigger) => trigger.triggerId === gateStage.exitTriggerId);
  const gateInteractable = interactables.find((entry) => entry.interactableId === gateStage.targetId);
  assert.equal(gateStage.mode, "interact");
  assert.equal(gateTrigger.interactableId, "eastGateLatch");
  assert.equal(gateTrigger.eventId, "eventEastGateOpened");
  assert.equal(gateInteractable.requires.allFlags.includes("cartMuffled"), true);
  assert.equal(gateInteractable.setsFlags.includes("eastGateOpen"), true);
  assert.equal(gateInteractable.setsFlags.includes("convoyMoving"), true);
  assert.equal(
    RequirementGroupsMet([gateInteractable.requires, gateTrigger.requires], {
      flags: new Set(["cartMuffled"]),
      stageId: "openEastGate",
      counters: {},
      equipment: new Set(["wireCutters"]),
    }),
    true,
  );
});

Test("narrative requirements enforce flags, tools, and counter ceilings", () => {
  const baseState = {
    stageId: "decideRouteFate",
    flags: new Set(["routeDecisionReady", "allCiviliansClear", "warningLineCut"]),
    counters: { alertLevel: 1 },
    equipment: new Set(["wireCutters"]),
  };
  assert.equal(RequirementsMet({
    stageId: "decideRouteFate",
    allFlags: ["routeDecisionReady"],
    equippedTool: "wireCutters",
    countersAtMost: { alertLevel: 1 },
  }, baseState), true);
  assert.equal(RequirementsMet({ countersAtMost: { alertLevel: 0 } }, baseState), false);
  assert.equal(RequirementsMet({ allFlags: ["missingFlag"] }, baseState), false);

  const context = { interactables, triggers: storyTriggers };
  assert.equal(EvaluateRouteOption(routeChoice, "falseTrail", baseState, context).available, true);
  assert.equal(EvaluateRouteOption(routeChoice, "falseTrail", {
    ...baseState,
    counters: { alertLevel: 2 },
  }, context).available, false);
  assert.equal(EvaluateRouteOption(routeChoice, "falseTrail", {
    ...baseState,
    flags: new Set(["routeDecisionReady", "allCiviliansClear"]),
  }, context).available, false);
  assert.equal(EvaluateRouteOption(routeChoice, "seal", {
    ...baseState,
    counters: { alertLevel: 9 },
  }, context).available, true);
  assert.equal(EvaluateRouteOption(routeChoice, "seal", {
    ...baseState,
    flags: new Set(["allCiviliansClear"]),
  }, context).available, false, "alwaysAvailable must not bypass the routeDecisionReady flag");
});

Test("system-condition triggers resolve only from actual narrative facts", () => {
  assert.equal(SystemConditionMet("playerDetectedInBlockadePostZone", {
    playerDetectedInBlockadePostZone: true,
  }), true);
  assert.equal(SystemConditionMet("playerDetectedInBlockadePostZone", {
    playerDetectedInBlockadePostZone: false,
  }), false);
  assert.equal(SystemConditionMet("firstKilnThreatBrokenOrEvaded", {
    flags: new Set(["kilnAshScreenDeployed"]),
  }), true);
  assert.equal(SystemConditionMet("firstKilnThreatBrokenOrEvaded", {
    flags: new Set(),
    firstKilnThreatDisengaged: true,
  }), true);
  assert.equal(SystemConditionMet("kilnHoldSecondsAtLeastThirtySixOrThreatsDisengaged", {
    flags: new Set(),
    kilnHoldSeconds: 35.9,
  }), false);
  assert.equal(SystemConditionMet("kilnHoldSecondsAtLeastThirtySixOrThreatsDisengaged", {
    flags: new Set(),
    kilnHoldSeconds: 36,
  }), true);
  assert.equal(SystemConditionMet("kilnHoldSecondsAtLeastThirtySixOrThreatsDisengaged", {
    flags: new Set(["kilnRockslideReleased"]),
  }), true);
  assert.equal(SystemConditionMet("routeChoiceResolved", {
    routeChoice: "seal",
    flags: new Set(["endingRouteBroken"]),
  }), true);
});

Test("authored dialogue delays remain part of the playback schedule", () => {
  const schedule = BuildDialogueSchedule([
    { speaker: "苗槐生", text: "第一句", duration: 4.8, delay: 0 },
    { speaker: "杜湘云", text: "第二句", duration: 4.8, delay: 5.4 },
    { speaker: "何芹", text: "第三句", duration: 5.2, delay: 10.8 },
  ], 1000);
  assert.deepEqual(schedule.map((line) => line.readyAt), [1000, 6400, 11800]);
  assert.deepEqual(schedule.map((line) => line.delaySeconds), [0, 5.4, 10.8]);
  const inferred = BuildDialogueSchedule([["杜湘云", "先走。"], ["赵同岑", "我跟着。"]], 500);
  assert.equal(inferred[0].readyAt, 500);
  assert.equal(inferred[1].readyAt, 500 + inferred[0].duration * 1000);
});

Test("quiet-passage preparation consumes cloth or a field dressing and never advances for free", () => {
  assert.deepEqual(SelectQuietPassageMaterial({ cloth: 1, bandage: 0 }), { itemId: "cloth", amount: 1 });
  assert.deepEqual(SelectQuietPassageMaterial({ cloth: 0, bandage: 1 }), { itemId: "bandage", amount: 1 });
  assert.equal(SelectQuietPassageMaterial({ cloth: 0, bandage: 0 }), null);
});

Test("AI performance scheduling is deterministic and prioritizes combatants", () => {
  const schedulingConfig = CreateGameplayConfig({
    performance: { maxSimulatedEnemies: 2, farAiFrameStride: 11 },
  });
  const decisions = Array.from({ length: 30 }, (_, frameIndex) => (
    ShouldRunAiTick("guardSeven", frameIndex, 50, schedulingConfig)
  ));
  assert.ok(decisions.some(Boolean));
  assert.ok(decisions.some((decision) => !decision));
  assert.deepEqual(decisions, Array.from({ length: 30 }, (_, frameIndex) => (
    ShouldRunAiTick("guardSeven", frameIndex, 50, schedulingConfig)
  )));
  const selected = SelectAiSimulationSet([
    { enemyId: "near", position: { x: 1, z: 0 }, stateId: EnemyStateIds.PATROL },
    { enemyId: "farCombat", position: { x: 80, z: 0 }, stateId: EnemyStateIds.ENGAGE },
    { enemyId: "mid", position: { x: 8, z: 0 }, stateId: EnemyStateIds.SEARCH },
  ], { x: 0, z: 0 }, schedulingConfig);
  assert.equal(selected.length, 2);
  assert.equal(selected[0].enemyId, "farCombat");
  assert.equal(selected[1].enemyId, "near");

  let throttledEnemy = UpdateEnemyAi(CreateEnemyState({
    enemyId: "throttledGuard",
    position: { x: 0, z: 0 },
  }), {
    delta: 1 / 60,
    timeSeconds: 1,
    player: { position: { x: 0, z: -30 }, hidden: true },
    noises: [],
  }).state;
  const elapsedBeforeSkip = throttledEnemy.stateElapsedSeconds;
  throttledEnemy = UpdateEnemyAi(throttledEnemy, {
    delta: 1 / 60,
    timeSeconds: 1.2,
    player: { position: { x: 0, z: -30 }, hidden: true },
    noises: [],
  }).state;
  assert.ok(
    throttledEnemy.stateElapsedSeconds - elapsedBeforeSkip >= 0.19,
    "AI timers must account for frames skipped by a configured simulation stride",
  );
});

Test("aggregate gameplay update runs AI, movement, companion, lures, and mission without DOM or THREE", () => {
  const missionStages = [{
    stageId: "approach",
    beats: [{
      beatId: "quietStep",
      kind: MissionBeatKindIds.QUIET_EXPLORE,
      targetSeconds: 6,
      intensity: 0.2,
    }],
  }];
  const state = CreateGameplayState({
    seed: 1942,
    missionStages,
    player: {
      playerId: "player",
      position: { x: 0, z: 0 },
      inventory: { magazineAmmo: 2, reserveAmmo: 3 },
    },
    enemies: [{
      enemyId: "gateGuard",
      position: { x: 0, z: 7 },
      forward: { x: 0, z: 1 },
    }],
    companion: {
      companionId: "zhaoSheng",
      position: { x: -1, z: -2 },
      commandId: CompanionCommandIds.FOLLOW,
    },
  });
  const noise = EmitNoise({
    eventId: "thrownBottle",
    sourceId: "player",
    kindId: NoiseKindIds.BOTTLE_BREAK,
    position: { x: 3, z: 7 },
    radius: 18,
    timestamp: 0,
  });
  const update = UpdateGameplayState(state, {
    delta: 0.1,
    player: { ...state.player, hidden: true },
    noises: [noise],
    obstacles: [],
    movementInput: { move: { x: 0, z: 1 }, crouch: true, surfaceId: "dirt" },
  });
  assert.equal(update.state.enemies[0].stateId, EnemyStateIds.SUSPICIOUS);
  assert.equal(update.enemyIntents[0].intent.movementId, "investigate");
  assert.ok(update.companionIntent);
  assert.equal(update.missionDirectives.beatId, "quietStep");
  assert.equal(state.enemies[0].stateId, EnemyStateIds.PATROL, "aggregate update must be immutable");
});

Test("legacy runtime aliases adapt without losing canonical deterministic state", () => {
  const legacyEnemy = {
    enemyId: "legacyGuard",
    displayName: "封锁哨巡逻兵",
    position: { x: 0, z: 5 },
    forward: { x: 0, z: -1 },
    state: "patrol",
    stateTime: 1.2,
    suspicion: 0,
    lastKnown: null,
    investigateTarget: null,
    fireCooldown: 0,
    patrolPoints: [{ x: 0, z: 5 }],
    health: 100,
    active: true,
  };
  const legacyNoise = {
    noiseId: "legacyBottle_1",
    position: { x: 1, z: 5 },
    radius: 16,
    kind: "bottleBreak",
    createdAt: 3,
    expiresAt: 6.5,
  };
  const result = UpdateEnemyAi(legacyEnemy, {
    delta: 0.1,
    timeSeconds: 3.1,
    player: {
      position: { x: 0, z: 0 },
      crouched: true,
      sprinting: false,
      hidden: true,
      active: true,
    },
    noises: [legacyNoise],
  });
  assert.equal(result.state.stateId, EnemyStateIds.SUSPICIOUS);
  assert.equal(result.state.state, EnemyStateIds.SUSPICIOUS);
  assert.equal(result.state.active, true);
  assert.equal(result.state.displayName, legacyEnemy.displayName);
  assert.deepEqual(result.state.investigateTarget, legacyNoise.position);
  assert.ok(result.state.stateTime < legacyEnemy.stateTime, "transition resets both canonical and legacy timers");
  assert.equal(result.hearing.noise.eventId, legacyNoise.noiseId);

  const legacyCompanion = CreateCompanionState({
    position: { x: 0, z: 0 },
    facing: Math.PI,
    command: "stay",
    maxHealth: 80,
    active: true,
  });
  assert.equal(legacyCompanion.commandId, CompanionCommandIds.STAY);
  assert.equal(legacyCompanion.command, CompanionCommandIds.STAY);
  assert.equal(legacyCompanion.maximumHealth, 80);
});

Test("save serialization round-trips plain gameplay state and rejects invalid versions", () => {
  const state = CreateGameplayState({
    seed: 77,
    timeSeconds: 12.5,
    player: {
      playerId: "player",
      position: { x: 2, z: -3 },
      health: 63,
      inventory: {
        materials: { cloth: 3, alcohol: 1 },
        items: { bandage: 1, bottle: 2, tinCan: 0 },
        weapon: { magazineAmmo: 2, reserveAmmo: 4 },
      },
    },
    enemies: [{ enemyId: "guard", position: { x: 5, z: 6 }, awareness: 0.4 }],
  });
  const serialized = SerializeGameplayState(state);
  assert.equal(serialized.includes("THREE"), false);
  const restored = DeserializeGameplayState(serialized);
  assert.deepEqual(restored, state);
  assert.throws(() => DeserializeGameplayState(JSON.stringify({
    saveVersion: 999,
    gameplayState: {},
  })), /Unsupported or invalid/);
});

Test("bound gameplay systems inject deterministic random and the desktop config", () => {
  const systems = CreateGameplaySystems({
    seed: 123,
  });
  assert.equal(systems.config.performance.profileId, "desktop");
  const inventory = CreateInventory({ magazineAmmo: 1 });
  const firstState = systems.random.GetState();
  const firstShot = systems.FireWeapon(inventory, {
    position: { x: 0, z: 0 },
    direction: { x: 0, z: 1 },
  });
  systems.random.SetState(firstState);
  const secondShot = systems.FireWeapon(inventory, {
    position: { x: 0, z: 0 },
    direction: { x: 0, z: 1 },
  });
  assert.equal(firstShot.shot.spreadYawRadians, secondShot.shot.spreadYawRadians);
  assert.equal(typeof systems.UpdateEnemyAi, "function");
  assert.equal(typeof systems.UpdateCompanion, "function");
  assert.equal(typeof systems.SerializeGameplayState, "function");

  const injectedSystems = CreateGameplaySystems({ random: () => 0.5 });
  assert.equal(injectedSystems.random.Next(), 0.5);
  assert.equal(injectedSystems.random.Range(2, 4), 3);
  assert.equal(injectedSystems.random.Integer(1, 3), 2);
  assert.equal(injectedSystems.random.Pick(["left", "middle", "right"]), "middle");
});

const failedTests = testResults.filter((result) => !result.ok);
const totalDuration = testResults.reduce((sum, result) => sum + result.duration, 0);
console.log(`\nSystems smoke test: ${testResults.length - failedTests.length}/${testResults.length} passed in ${totalDuration.toFixed(1)}ms`);
if (failedTests.length > 0) {
  process.exitCode = 1;
}
