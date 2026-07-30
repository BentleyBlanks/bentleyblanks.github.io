import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  AssignEnemyCoordinationRoles,
  UpdateEnemy,
  UpdateEnemySquad,
  UpdateTacticalDirector,
} from "./Script_Ai.mjs";
import { GetOperationLayout } from "./Data_Operations.mjs";
import {
  CalculateStartupTacticalFrame,
  ProjectTacticalPoint,
  tacticalFramingContract,
} from "./Script_CameraFraming.mjs";
import {
  ApplyAbilityCommand,
  ApplyBuddyRescue,
  ApplyCampAction,
  CanBuddyRescue,
  CanFriendlySeeEnemy,
  CanSee,
  CreateInitialCampState,
  CreateInitialMissionState,
  Distance,
  GetCampDecisionOptions,
  GetTacticalDistance,
  GetTerrainElevation,
  HasLineOfSight,
  PrepareMissionFromCamp,
  ResolveDeterministicShot,
} from "./Script_Rules.mjs";

function TestSharedVisualElevationContract() {
  const worldSource = readFileSync(fileURLToPath(new URL("./Script_World.mjs", import.meta.url)), "utf8");
  assert.match(
    worldSource,
    /import \{[^}]*GetTerrainElevation[^}]*\} from "\.\/Script_Rules\.mjs";/,
    "The renderer must import the simulation's canonical terrain elevation function.",
  );
  assert.match(
    worldSource,
    /function GetSurfaceHeight\(x, z\) \{\s*return GetTerrainElevation\(\{ x, z \}, activeMissionDefinition\);\s*\}/,
    "Visual surface placement must delegate directly to the canonical terrain contract.",
  );
  const visualFunctionSource = worldSource.match(
    /function GetSurfaceHeight\(x, z\) \{\s*return GetTerrainElevation\(\{ x, z \}, activeMissionDefinition\);\s*\}/,
  )?.[0];
  assert.ok(visualFunctionSource);
  for (const operationId of ["infiltrateSignalStation", "nightRendezvous", "quarryInterdiction"]) {
    const definition = GetOperationLayout(operationId);
    const getVisualSurfaceHeight = Function(
      "GetTerrainElevation",
      "activeMissionDefinition",
      `"use strict"; ${visualFunctionSource}; return GetSurfaceHeight;`,
    )(GetTerrainElevation, definition);
    let maximumError = 0;
    for (let x = Math.ceil(definition.bounds.minimumX); x <= definition.bounds.maximumX; x += 1) {
      for (let z = Math.ceil(definition.bounds.minimumZ); z <= definition.bounds.maximumZ; z += 1) {
        const rulesElevation = GetTerrainElevation({ x, z }, definition);
        const visualElevation = getVisualSurfaceHeight(x, z);
        maximumError = Math.max(maximumError, Math.abs(visualElevation - rulesElevation));
      }
    }
    assert.ok(maximumError <= Number.EPSILON, `${operationId} visual/rules 1m elevation samples must have zero drift.`);
  }
}

function TestPortraitStartupFramingContract() {
  for (const operationId of ["infiltrateSignalStation", "nightRendezvous", "quarryInterdiction"]) {
    const definition = GetOperationLayout(operationId);
    const overviewDirection = {
      x: definition.camera.position.x - definition.camera.target.x,
      y: definition.camera.position.y - definition.camera.target.y,
      z: definition.camera.position.z - definition.camera.target.z,
    };
    const frame = CalculateStartupTacticalFrame({
      definition,
      squadPositions: definition.playerSpawns,
      fallbackPosition: definition.playerSpawns[0],
      requestedDistance: 46,
      aspect: 390 / 844,
      fieldOfView: 44,
      viewportWidth: 390,
      viewportHeight: 844,
      overviewDirection,
    });
    assert.equal(frame.portrait, true);
    assert.ok(frame.distance <= 72, `${operationId} portrait tactical distance must remain local and below 72.`);
    assert.ok(frame.distance < 136, `${operationId} must never hit the former extreme portrait cap.`);
    assert.ok(frame.projectedActorPixels >= 30, `${operationId} actors must remain at least 30px tall at 390x844.`);
    assert.equal(frame.squadWithinSafeViewport, true, `${operationId} must place all four actors above the portrait HUD.`);
    assert.equal(frame.squadProjections.length, 4, `${operationId} must project all four squad actors.`);
    for (const [index, actor] of frame.squadProjections.entries()) {
      assert.ok(actor.top >= frame.safeViewport.top, `${operationId} squad ${index + 1} must clear the top HUD.`);
      assert.ok(actor.bottom <= frame.safeViewport.bottom, `${operationId} squad ${index + 1} must clear the roster HUD.`);
      assert.ok(actor.pixelHeight >= 30, `${operationId} squad ${index + 1} must retain a readable 1.8m silhouette.`);
    }
    assert.ok(
      frame.threatIncluded || frame.threatDirection,
      `${operationId} must either show the nearest threat or provide an edge direction.`,
    );
    assert.ok(frame.actorSpan > 0, `${operationId} must expose a real squad-to-threat composition.`);

    const firstSquadPoint = {
      ...definition.playerSpawns[0],
      y: GetTerrainElevation(definition.playerSpawns[0], definition),
    };
    const projectedPoint = ProjectTacticalPoint({
      point: firstSquadPoint,
      target: frame.target,
      direction: frame.direction,
      distance: frame.distance,
      aspect: 390 / 844,
      fieldOfView: 44,
      viewportWidth: 390,
      viewportHeight: 844,
    });
    assert.ok(Number.isFinite(projectedPoint.screenY) && projectedPoint.depth > 0, `${operationId} projector must produce a valid forward screen point.`);

    const desktopFrame = CalculateStartupTacticalFrame({
      definition,
      squadPositions: definition.playerSpawns,
      fallbackPosition: definition.playerSpawns[0],
      requestedDistance: 46,
      aspect: 1920 / 1080,
      fieldOfView: 44,
      viewportWidth: 1920,
      viewportHeight: 1080,
      overviewDirection,
    });
    assert.ok(desktopFrame.distance >= 46 && desktopFrame.distance <= 96, `${operationId} desktop framing must remain tactical.`);
  }
}

function TestQuarryCameraSurfaceClearance() {
  const definition = GetOperationLayout("quarryInterdiction");
  const overviewDirection = {
    x: definition.camera.position.x - definition.camera.target.x,
    y: definition.camera.position.y - definition.camera.target.y,
    z: definition.camera.position.z - definition.camera.target.z,
  };
  for (const [width, height] of [[1920, 1080], [390, 844]]) {
    const frame = CalculateStartupTacticalFrame({
      definition,
      squadPositions: definition.playerSpawns,
      fallbackPosition: definition.playerSpawns[0],
      requestedDistance: 46,
      aspect: width / height,
      fieldOfView: 44,
      viewportWidth: width,
      viewportHeight: height,
      overviewDirection,
    });
    const canonicalSurface = GetTerrainElevation(frame.target, definition);
    assert.equal(frame.targetSurfaceElevation, canonicalSurface);
    assert.ok(
      frame.target.y >= canonicalSurface + tacticalFramingContract.targetSurfaceClearance,
      `${width}x${height} quarry target must clear its canonical local surface.`,
    );
    assert.ok(
      frame.targetSurfaceClearance >= tacticalFramingContract.targetSurfaceClearance,
      `${width}x${height} quarry target must retain tactical observation clearance.`,
    );
    assert.ok(frame.distance <= 85, `${width}x${height} quarry framing must retain the local distance contract.`);
    if (width === 390) assert.ok(frame.projectedActorPixels >= 30, "Portrait quarry actors must retain the 30px true-model floor.");
  }
}

function TestMoonlessRainReadabilityContract() {
  const worldSource = readFileSync(fileURLToPath(new URL("./Script_World.mjs", import.meta.url)), "utf8");
  assert.match(worldSource, /const nightReadabilityContract = Object\.freeze\(\{[\s\S]*minimumExposure:\s*1\.25,[\s\S]*minimumHemisphereIntensity:\s*1\.5,[\s\S]*minimumKeyIntensity:\s*1\.7,[\s\S]*minimumActorFillIntensity:\s*0\.85,[\s\S]*minimumActorRimIntensity:\s*1\.1,[\s\S]*maximumFogDensity:\s*0\.016,/);
  assert.match(worldSource, /id:\s*"moonlessRain"[\s\S]*fogDensity:\s*0\.015,[\s\S]*hemisphereIntensity:\s*1\.62,[\s\S]*keyIntensity:\s*1\.86,[\s\S]*exposure:\s*1\.3,[\s\S]*actorFillIntensity:\s*0\.92,[\s\S]*actorRimIntensity:\s*1\.2,[\s\S]*readabilityContract:\s*nightReadabilityContract,/);
  assert.match(worldSource, /actorFillLight\.name = "MoonlessRain_ActorFill";[\s\S]*actorRimLight\.name = "MoonlessRain_ActorRim";/);
  assert.match(worldSource, /const renderedFogDensity = atmosphereProfile\.readabilityContract[\s\S]*Math\.min\(atmosphereProfile\.fogDensity, atmosphereProfile\.readabilityContract\.maximumFogDensity\)/);
  assert.match(worldSource, /function ConstrainCameraToTerrain\(target, desiredPosition\)[\s\S]*tacticalFramingContract\.targetSurfaceClearance[\s\S]*tacticalFramingContract\.cameraSurfaceClearance[\s\S]*tacticalFramingContract\.minimumVerticalViewingClearance/);
}

function TestElevationCreatesTacticalAdvantage() {
  const signal = GetOperationLayout("infiltrateSignalStation");
  const rendezvous = GetOperationLayout("nightRendezvous");
  const quarry = GetOperationLayout("quarryInterdiction");
  assert.ok(
    GetTerrainElevation({ x: 8, z: -35 }, signal) -
      GetTerrainElevation({ x: -25, z: 2 }, signal) >
      5,
    "The signal-station ridge must stand materially above the dry ravine.",
  );
  assert.ok(
    GetTerrainElevation({ x: -37, z: 38 }, rendezvous) -
      GetTerrainElevation({ x: 16, z: 4 }, rendezvous) >
      5,
    "The village orchard slope must stand materially above the creek bed.",
  );

  const highScout = { id: "qinSuqiu", state: "ready", stance: "stand", x: -23, z: 33.1 };
  const lowScout = { ...highScout, z: 32 };
  const target = { id: "ridgeContact", role: "patrol", stance: "stand", x: 5, z: 32 };
  assert.ok(GetTacticalDistance(highScout, target, quarry) > Distance(highScout, target));
  assert.equal(
    CanFriendlySeeEnemy(highScout, target, [], quarry),
    true,
    "A scout on the quarry ridge must gain an observation window beyond flat-ground sight.",
  );
  assert.equal(
    CanFriendlySeeEnemy(lowScout, target, [], quarry),
    false,
    "The same horizontal sight line without elevation must remain outside scout range.",
  );
  const targetAngle = Math.atan2(target.x - highScout.x, target.z - highScout.z);
  assert.equal(
    CanSee({ ...highScout, id: "highLeader", role: "leader", facing: targetAngle }, target, [], quarry),
    true,
    "Enemy perception must consume the same high-ground range advantage.",
  );
  assert.equal(
    CanSee({ ...lowScout, id: "lowLeader", role: "leader", facing: Math.PI * 0.5 }, target, [], quarry),
    false,
  );

  assert.equal(
    HasLineOfSight(
      { x: -23, z: 39, stance: "stand" },
      { x: -2, z: -27, stance: "stand" },
      [],
      quarry,
    ),
    false,
    "The upper terrace ridge line must hide the quarry floor even without a building obstacle.",
  );
  assert.equal(
    HasLineOfSight(
      { x: 20, z: -35, stance: "stand" },
      { x: 20, z: 0, stance: "stand" },
      signal.obstacles,
      signal,
    ),
    true,
    "A high ridge firing line must pass over a low compound wall when the ray clears its authored top.",
  );
  assert.equal(
    HasLineOfSight(
      { x: 20, z: -29, stance: "crouch" },
      { x: 20, z: 0, stance: "crouch" },
      signal.obstacles,
      signal,
    ),
    false,
    "The same wall must still block a low same-level sight line.",
  );

  const highShot = ResolveDeterministicShot(
    { ...highScout, id: "hanShilei", suppression: 0 },
    target,
    { definition: quarry, seed: 17, shotIndex: 2, cover: null },
  );
  const lowShot = ResolveDeterministicShot(
    { ...lowScout, id: "hanShilei", suppression: 0 },
    target,
    { definition: quarry, seed: 17, shotIndex: 2, cover: null },
  );
  assert.ok(highShot.hitChance > lowShot.hitChance);
  assert.equal(highShot.modifiers.elevationDelta, 8);
}

function TestDeterministicShotResolution() {
  const state = CreateInitialMissionState();
  state.time = 10;
  const engineer = state.units.find((unit) => unit.id === "hanShilei");
  const gunner = state.units.find((unit) => unit.id === "weiShouyi");
  const target = state.enemies[0];
  engineer.x = 0;
  engineer.z = 0;
  engineer.stance = "stand";
  engineer.suppression = 0;
  gunner.x = 0;
  gunner.z = 0;
  gunner.stance = "stand";
  target.x = 14;
  target.z = 0;
  target.stance = "stand";
  const openOptions = { time: state.time, seed: 73, shotIndex: 4, cover: null };
  const first = ResolveDeterministicShot(engineer, target, openOptions);
  const repeat = ResolveDeterministicShot(engineer, target, openOptions);
  assert.deepEqual(repeat, first, "identical shot inputs must resolve identically");

  const farTarget = { ...target, x: 28 };
  const far = ResolveDeterministicShot(engineer, farTarget, openOptions);
  assert.ok(first.hitChance > far.hitChance, "distance must materially reduce hit probability");

  const coveredCrouchingTarget = { ...target, stance: "crouch" };
  const covered = ResolveDeterministicShot(engineer, coveredCrouchingTarget, {
    ...openOptions,
    cover: { obstacleId: "testWall", kind: "wall", protection: 0.52, distance: 0.4 },
  });
  assert.ok(first.hitChance > covered.hitChance, "cover and target stance must reduce hit probability");

  const suppressedShooter = { ...engineer, suppression: 85, stance: "sprint" };
  const suppressed = ResolveDeterministicShot(suppressedShooter, target, openOptions);
  assert.ok(first.hitChance > suppressed.hitChance * 1.8, "shooter suppression and sprinting must be costly");

  const gunnerShot = ResolveDeterministicShot(gunner, target, openOptions);
  assert.ok(
    first.modifiers.firearmAccuracy > gunnerShot.modifiers.firearmAccuracy && first.hitChance > gunnerShot.hitChance,
    "role-specific firearm accuracy must affect the result",
  );
}

function TestCoordinationWindowsAffectFire() {
  const state = CreateInitialMissionState();
  state.time = 20;
  const shooter = state.units.find((unit) => unit.id === "hanShilei");
  const target = state.enemies[0];
  shooter.x = 0;
  shooter.z = 0;
  shooter.stance = "stand";
  shooter.suppression = 62;
  target.x = 17;
  target.z = 0;
  target.stance = "crouch";
  const cover = { obstacleId: "stoneWall", kind: "wall", protection: 0.52, distance: 0.3 };
  const baseline = ResolveDeterministicShot(shooter, target, {
    time: state.time,
    seed: 91,
    shotIndex: 0,
    cover,
  });

  const coordinatedShooter = {
    ...shooter,
    steadyUntil: state.time + 8,
    maneuverWindowUntil: state.time + 8,
    rescueCoverUntil: state.time + 8,
    coordinationLink: { partnerId: "weiShouyi", kind: "breachCover", expiresAt: state.time + 8 },
  };
  const coordinated = ResolveDeterministicShot(coordinatedShooter, target, {
    time: state.time,
    seed: 91,
    shotIndex: 0,
    cover,
  });
  assert.ok(
    coordinated.hitChance > baseline.hitChance + 0.25,
    "steady, maneuver, rescue cover, and a live coordination link must create a qualitative firing window",
  );
  assert.ok(
    coordinated.cover.protection < baseline.cover.protection,
    "maneuver windows must open an angle around existing cover",
  );
  for (const modifier of [
    "steadyActive",
    "maneuverActive",
    "shooterRescueCoverActive",
    "coordinationActive",
  ]) {
    assert.equal(coordinated.modifiers[modifier], true, `${modifier} must be consumed by shot resolution`);
  }

  let outcomeDifference = null;
  for (let shotIndex = 0; shotIndex < 128; shotIndex += 1) {
    const options = { time: state.time, seed: 91, shotIndex, cover };
    const plainShot = ResolveDeterministicShot(shooter, target, options);
    const coordinatedShot = ResolveDeterministicShot(coordinatedShooter, target, options);
    if (!plainShot.hit && coordinatedShot.hit) {
      outcomeDifference = { plainShot, coordinatedShot };
      break;
    }
  }
  assert.ok(outcomeDifference, "the same deterministic roll must miss normally and hit inside the coordination window");

  const protectedTarget = {
    ...target,
    rescueCoverUntil: state.time + 8,
    steadyUntil: state.time + 8,
  };
  const protectedResult = ResolveDeterministicShot(shooter, protectedTarget, {
    time: state.time,
    seed: 91,
    shotIndex: 0,
    cover,
  });
  assert.ok(protectedResult.hitChance < baseline.hitChance, "rescue cover must make a casualty detail harder to hit");
  assert.ok(
    protectedResult.suppression < baseline.suppression,
    "rescue cover and steady must reduce incoming suppression",
  );
}

function TestSuppressiveFireTradesDamageForPressure() {
  const state = CreateInitialMissionState();
  const gunner = state.units.find((unit) => unit.id === "weiShouyi");
  const target = state.enemies[0];
  gunner.x = 0;
  gunner.z = 0;
  gunner.stance = "crouch";
  target.x = 10;
  target.z = 0;
  target.stance = "stand";
  const options = { time: 0, seed: 19, shotIndex: 5, cover: null };
  const aimed = ResolveDeterministicShot(gunner, target, { ...options, mode: "aimed" });
  const suppress = ResolveDeterministicShot(gunner, target, { ...options, mode: "suppress" });
  assert.ok(suppress.hitChance < aimed.hitChance, "suppressive bursts must trade precision for area pressure");
  assert.ok(suppress.damage <= Math.ceil(aimed.damage * 0.25), "suppressive fire must not be a high-damage substitute");
  assert.ok(suppress.suppression >= suppress.damage * 6, "suppression must dominate suppressive-shot output");
}

function TestSequenceDependentCombos() {
  const coordinated = CreateInitialMissionState();
  const scout = coordinated.units.find((unit) => unit.id === "qinSuqiu");
  const gunner = coordinated.units.find((unit) => unit.id === "weiShouyi");
  const target = coordinated.enemies.find((enemy) => enemy.id === "outerOne");
  const initialMorale = target.morale;
  assert.equal(
    ApplyAbilityCommand(coordinated, scout.id, { kind: "observe", targetId: target.id }).success,
    true,
  );
  const coordinatedResult = ApplyAbilityCommand(coordinated, gunner.id, {
    kind: "suppress",
    x: target.x,
    z: target.z,
  });
  assert.equal(coordinatedResult.combo, "markAndPin");
  assert.equal(target.suppression, 86);
  assert.equal(target.morale, initialMorale - 30);
  assert.equal(target.isolatedUntil > coordinated.time, true);
  assert.deepEqual(coordinated.coordination.lastCombo.participants, [scout.id, gunner.id]);

  const uncoordinated = CreateInitialMissionState();
  const baselineGunner = uncoordinated.units.find((unit) => unit.id === "weiShouyi");
  const baselineTarget = uncoordinated.enemies.find((enemy) => enemy.id === "outerOne");
  const baselineResult = ApplyAbilityCommand(uncoordinated, baselineGunner.id, {
    kind: "suppress",
    x: baselineTarget.x,
    z: baselineTarget.z,
  });
  assert.equal(baselineResult.combo, undefined);
  assert.equal(baselineTarget.suppression, 68);
  assert.equal(
    target.morale < baselineTarget.morale,
    true,
    "Mark-then-pin must create a qualitative isolation window, not merely duplicate suppression.",
  );
}

function TestMutualRescueAndCover() {
  const state = CreateInitialMissionState();
  const patient = state.units.find((unit) => unit.id === "qinSuqiu");
  const engineer = state.units.find((unit) => unit.id === "hanShilei");
  const medic = state.units.find((unit) => unit.id === "luLanzhi");
  const gunner = state.units.find((unit) => unit.id === "weiShouyi");
  patient.x = 0;
  patient.z = 0;
  patient.state = "downed";
  patient.health = 0;
  patient.downedTimer = 5;
  engineer.x = 1.5;
  engineer.z = 0;
  medic.x = -1.5;
  medic.z = 0;
  gunner.x = 2.5;
  gunner.z = 1;
  assert.equal(CanBuddyRescue(state, engineer.id, patient.id), true);
  const temporaryRescue = ApplyBuddyRescue(state, engineer.id, patient.id);
  assert.equal(temporaryRescue.success, true);
  assert.equal(patient.state, "downed", "A non-medic rescue buys time but must not erase the medic's role.");
  assert.equal(patient.downedTimer > 5, true);

  const aid = ApplyAbilityCommand(state, medic.id, { kind: "aid", targetId: patient.id });
  assert.equal(aid.success, true);
  assert.equal(aid.combo, "buddyEvacuation");
  assert.equal(aid.assistantId, engineer.id);
  assert.equal(patient.state, "wounded");
  assert.equal(patient.health, 28);
  assert.equal(patient.rescueCoverUntil > state.time, true);

  const crossWatch = ApplyAbilityCommand(state, gunner.id, { kind: "overwatch", targetId: medic.id });
  assert.equal(crossWatch.combo, "rescueCover");
  assert.equal(medic.coordinationLink.kind, "rescueCover");
  assert.equal(medic.rescueCoverUntil > state.time, true);
}

function TestEnemySquadRolesAndSearchSectors() {
  const state = CreateInitialMissionState();
  state.enemies.forEach((enemy) => {
    enemy.state = "search";
    enemy.lastKnown = { x: 0, z: 0, time: 10 };
  });
  const assignments = AssignEnemyCoordinationRoles(state);
  const roles = new Set(assignments.map((assignment) => assignment.role));
  for (const requiredRole of ["coordinator", "reporter", "anchor", "suppressor", "flankerLeft", "flankerRight"]) {
    assert.equal(roles.has(requiredRole), true, `Enemy squad must assign ${requiredRole}.`);
  }

  const source = state.enemies[0];
  const nearby = state.enemies[1];
  const distant = state.enemies[2];
  state.enemies.forEach((enemy) => {
    enemy.lastKnown = null;
    enemy.sharedContact = undefined;
  });
  source.x = 0;
  source.z = 0;
  source.lastKnown = { x: 4, z: 3, time: 20 };
  nearby.x = 8;
  nearby.z = 0;
  nearby.lastKnown = null;
  distant.x = 40;
  distant.z = 35;
  distant.lastKnown = null;
  AssignEnemyCoordinationRoles(state);
  assert.equal(nearby.sharedContact?.sourceId, source.id, "Nearby enemies must relay bounded contact.");
  assert.equal(distant.sharedContact, undefined, "Contact sharing must not become map-wide omniscience.");

  state.units.forEach((unit) => { unit.state = "evacuated"; });
  const nearSearcher = state.enemies[3];
  const wideSearcher = state.enemies[4];
  for (const enemy of [nearSearcher, wideSearcher]) {
    enemy.state = "search";
    enemy.x = -42;
    enemy.z = 32;
    enemy.lastKnown = { x: -32, z: 32, time: 20 };
    enemy.searchPoint = null;
    enemy.searchPointTimer = 0;
    enemy.searchPhase = 0;
    enemy.seedOffset = 42;
  }
  nearSearcher.coordinationRole = "searcherNear";
  wideSearcher.coordinationRole = "searcherWide";
  UpdateEnemy(nearSearcher, state, 0.1);
  UpdateEnemy(wideSearcher, state, 0.1);
  assert.equal(
    Distance(wideSearcher.searchPoint, wideSearcher.lastKnown) >
      Distance(nearSearcher.searchPoint, nearSearcher.lastKnown) + 2,
    true,
    "Search roles must cover different rings instead of stacking on one point.",
  );
}

function TestEnemyFlankAndSuppressionExecution() {
  const flankState = CreateInitialMissionState();
  const target = flankState.units[0];
  target.x = 0;
  target.z = 0;
  flankState.units.slice(1).forEach((unit) => { unit.state = "evacuated"; });
  flankState.alertLevel = 2;
  const flanker = flankState.enemies[0];
  flanker.x = -12;
  flanker.z = 0;
  flanker.facing = Math.PI * 0.5;
  flanker.state = "combat";
  flanker.target = target.id;
  flanker.lastKnown = { x: target.x, z: target.z, time: 0 };
  flanker.awareness = 100;
  flanker.radioed = true;
  flanker.coordinationRole = "flankerLeft";
  UpdateEnemy(flanker, flankState, 0.2);
  assert.equal(flanker.fireIntent, "flank");
  assert.equal(Math.abs(flanker.z) > 0.01, true, "A flanker must move off the direct firing axis.");

  const suppressState = CreateInitialMissionState();
  const suppressTarget = suppressState.units[0];
  suppressTarget.x = 0;
  suppressTarget.z = 0;
  suppressState.units.slice(1).forEach((unit) => { unit.state = "evacuated"; });
  suppressState.alertLevel = 2;
  const suppressor = suppressState.enemies[0];
  suppressor.x = -10;
  suppressor.z = 0;
  suppressor.facing = Math.PI * 0.5;
  suppressor.state = "combat";
  suppressor.target = suppressTarget.id;
  suppressor.lastKnown = { x: 0, z: 0, time: 0 };
  suppressor.awareness = 100;
  suppressor.radioed = true;
  suppressor.coordinationRole = "suppressor";
  suppressor.shotCooldown = 0;
  let shots = 0;
  UpdateEnemy(suppressor, suppressState, 0.1, { OnEnemyShot: () => { shots += 1; } });
  assert.equal(suppressor.fireIntent, "suppress");
  assert.equal(shots, 1);
  assert.equal(suppressor.shotCooldown < 1.8, true, "Suppressors must maintain a distinct covering cadence.");
}

function TestCampMutualExclusionAndNonlinearCosts() {
  const camp = CreateInitialCampState();
  camp.resources = { medicine: 5, tools: 5, radioParts: 5, food: 5, trust: 50 };
  camp.roster[0].wounds = 1;
  const options = GetCampDecisionOptions(camp);
  assert.equal(options.every((option) => option.available), true);

  const repair = ApplyCampAction(camp, "repair");
  assert.equal(repair.success, true);
  assert.equal(repair.state.facilities.workshop, 2);
  assert.equal(repair.state.roster.find((operative) => operative.id === "hanShilei").fatigue, 1);
  assert.equal(ApplyCampAction(repair.state, "rest").success, false, "One sortie permits one strategic camp commitment.");

  const expensiveWorkshop = CreateInitialCampState();
  expensiveWorkshop.facilities.workshop = 2;
  expensiveWorkshop.resources.tools = 1;
  assert.equal(ApplyCampAction(expensiveWorkshop, "repair").success, false, "High-level upgrades must have nonlinear costs.");

  const signalsCamp = CreateInitialCampState();
  signalsCamp.resources.radioParts = 3;
  const signals = ApplyCampAction(signalsCamp, "decode");
  assert.equal(signals.success, true);
  assert.equal(signals.state.readiness.intelFreshness, 3);
  assert.equal(signals.state.roster.find((operative) => operative.id === "qinSuqiu").fatigue, 1);

  const restCamp = CreateInitialCampState();
  restCamp.roster.forEach((operative) => { operative.fatigue = 2; });
  const rest = ApplyCampAction(restCamp, "rest");
  assert.equal(rest.success, true);
  assert.equal(rest.state.resources.food, restCamp.resources.food - 1);
  assert.equal(rest.state.roster.every((operative) => operative.fatigue === 1), true);

  const repairMission = PrepareMissionFromCamp(CreateInitialMissionState(), repair.state);
  const signalsMission = PrepareMissionFromCamp(CreateInitialMissionState(), signals.state);
  assert.equal(repairMission.units.find((unit) => unit.id === "hanShilei").charges.charge, 2);
  assert.equal(repairMission.environment.campSignature > 0, true, "Workshop capacity must carry an enemy-readiness tradeoff.");
  assert.equal(
    signalsMission.preparation.knownPatrolIds.length > repairMission.preparation.knownPatrolIds.length,
    true,
    "Signals and workshop choices must produce different next-mission information states.",
  );
}

function TestAuthoredReinforcementTimingAfterAlarm() {
  const layout = GetOperationLayout("infiltrateSignalStation");
  const state = CreateInitialMissionState(1941, layout);
  state.units.forEach((unit) => { unit.state = "evacuated"; });
  const reporter = state.enemies[0];
  reporter.state = "report";
  reporter.reportTimer = 0;
  reporter.radioed = false;
  const firstRoute = layout.reinforcementRoutes[0];

  assert.equal(state.reinforcementTimer, null);
  UpdateEnemy(reporter, state, 0.1);
  assert.equal(state.activeReinforcementRouteId, firstRoute.id);
  assert.equal(
    state.reinforcementTimer,
    firstRoute.arrivalSeconds,
    "An alarm must turn the authored route's arrivalSeconds into a live reinforcement countdown.",
  );

  state.enemies.forEach((enemy) => { enemy.disabled = true; });
  UpdateEnemySquad(state, 1);
  assert.equal(state.reinforcementTimer, firstRoute.arrivalSeconds - 1);
  let arrivals = 0;
  UpdateEnemySquad(state, state.reinforcementTimer + 0.01, {
    OnReinforcement: () => { arrivals += 1; },
  });
  assert.equal(arrivals, 1);
  assert.equal(state.reinforcementTimer, null, "The authored countdown must invoke reinforcement exactly once.");
}

function TestWorkshopNoiseSuspicionHold() {
  const camp = CreateInitialCampState();
  camp.resources.tools = 5;
  const repair = ApplyCampAction(camp, "repair");
  assert.equal(repair.success, true);
  const state = PrepareMissionFromCamp(CreateInitialMissionState(), repair.state);
  state.units.forEach((unit) => { unit.state = "evacuated"; });
  const suspiciousEnemy = state.enemies[0];
  assert.equal(suspiciousEnemy.state, "suspicious");
  assert.equal(state.environment.campSignature > 0, true);

  state.time = 0.1;
  UpdateEnemy(suspiciousEnemy, state, 1);
  assert.equal(
    suspiciousEnemy.state,
    "suspicious",
    "Workshop-noise suspicion must survive the first AI tick while its authored hold window is active.",
  );

  suspiciousEnemy.awareness = 0;
  state.time = 18 + state.environment.campSignature * 6 + 0.1;
  UpdateEnemy(suspiciousEnemy, state, 1);
  assert.equal(suspiciousEnemy.state, "patrol", "Suspicion may decay only after the workshop-noise window expires.");
}

function SimulateDirector(passive) {
  const state = CreateInitialMissionState();
  const progressIds = ["ledger", "relay", "detainee", "medicines"];
  for (let tick = 0; tick < 480; tick += 1) {
    state.time += 0.5;
    if (!passive && tick > 0 && tick % 110 === 0) {
      const objectiveId = progressIds[Math.floor(tick / 110) - 1];
      if (objectiveId) state.objectives[objectiveId] = true;
    }
    UpdateTacticalDirector(state, 0.5);
  }
  return state.tacticalDirector;
}

function TestAntiTurtlePressure() {
  const passive = SimulateDirector(true);
  const proactive = SimulateDirector(false);
  assert.equal(passive.sweepCount > 0, true, "Extended inaction must trigger deterministic area sweeps.");
  assert.equal(
    passive.sweepCount > proactive.sweepCount,
    true,
    "Objective progress must create breathing room; passive hiding cannot be the dominant strategy.",
  );
  assert.equal(passive.pressure > proactive.pressure, true);
}

function Run() {
  TestSharedVisualElevationContract();
  TestPortraitStartupFramingContract();
  TestQuarryCameraSurfaceClearance();
  TestMoonlessRainReadabilityContract();
  TestElevationCreatesTacticalAdvantage();
  TestDeterministicShotResolution();
  TestCoordinationWindowsAffectFire();
  TestSuppressiveFireTradesDamageForPressure();
  TestSequenceDependentCombos();
  TestMutualRescueAndCover();
  TestEnemySquadRolesAndSearchSectors();
  TestEnemyFlankAndSuppressionExecution();
  TestCampMutualExclusionAndNonlinearCosts();
  TestAuthoredReinforcementTimingAfterAlarm();
  TestWorkshopNoiseSuspicionHold();
  TestAntiTurtlePressure();
  console.log("MountainEmber1941 tactical depth tests passed.");
}

Run();
