import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import {
  GetOperationLayout,
  GetOperationLayoutByCampaignIndex,
  operationLayoutDefinitions,
} from "./Data_Operations.mjs";
import {
  GetAtmospherePalette,
  GetOperationStorylet,
  historicalAtmosphereDefinition,
  operationStorylets,
  storyCharacterDefinitions,
} from "./Data_HistoricalAtmosphere.mjs";
import {
  AdvanceOperationClock,
  CompleteCivilianRoute,
  CreateOperationRuntime,
  DropOperationCarrierItems,
  ExtractOperationCarrier,
  GetAvailableInteractionForInteractable,
  GetAvailableOperationInteractions,
  GetOperationIntegrationSnapshot,
  IsActorAllowed,
  PickUpDroppedOperationItem,
  ResolveOperationInteraction,
} from "./Script_OperationFlow.mjs";
import {
  CreateInitialCampState,
  CreateInitialMissionState,
  Distance,
  FindPath2D,
  GetMissionDefinitionForState,
  GetTerrainElevation,
  IsNavigationBlocked,
  PrepareMissionFromCamp,
} from "./Script_Rules.mjs";

const requiredLegacyFields = [
  "bounds",
  "playerSpawns",
  "camera",
  "extractionZones",
  "zones",
  "lightingZones",
  "obstacles",
  "interactables",
  "patrols",
  "enemies",
];

assert.equal(operationLayoutDefinitions.length, 3, "exactly three authored operation layouts");
const civilianRouteBehaviors = new Set(
  operationLayoutDefinitions.flatMap((operation) => operation.civilianRoutes.map((route) => route.behavior)),
);
for (const behavior of ["pauseAndYield", "followSafeWindows", "waitAtCover", "stagedEvacuation"]) {
  assert.ok(civilianRouteBehaviors.has(behavior), `${behavior} is represented by an authored civilian route`);
}
assert.deepEqual(
  operationLayoutDefinitions.map((operation) => operation.layoutFamily),
  ["splitRavineCompound", "villageCreekLanes", "terracedQuarryRoad"],
  "every operation uses a different spatial family",
);
assert.equal(
  new Set(operationLayoutDefinitions.map((operation) => operation.id)).size,
  3,
  "operation IDs are unique",
);

for (const [index, operation] of operationLayoutDefinitions.entries()) {
  for (const field of requiredLegacyFields) {
    assert.ok(operation[field], `${operation.id} exposes legacy adapter field ${field}`);
  }
  assert.equal(
    GetOperationLayoutByCampaignIndex(index).id,
    operation.id,
    "campaign rotation selects a different authored layout",
  );
  assert.ok(operation.obstacles.length >= 10, `${operation.id} has authored spatial blockers`);
  assert.ok(operation.zones.length >= 6, `${operation.id} has tactical terrain regions`);
  assert.ok(operation.patrols.length >= 5, `${operation.id} has base and reactive patrol routes`);
  assert.ok(operation.enemies.length >= 8, `${operation.id} has a complete enemy disposition`);
  assert.ok(operation.tacticalPhases.length >= 4, `${operation.id} has a four-beat level rhythm`);
  assert.ok(operation.civilianRoutes.length >= 1, `${operation.id} has moving civilian presence`);
  assert.ok(
    operation.environmentInteractions.length >= 5,
    `${operation.id} has multiple environmental decisions`,
  );
  assert.ok(
    operation.objectives.mandatory.some((objective) => objective.id === "allExtracted"),
    `${operation.id} requires withdrawal rather than map clearing`,
  );
  assert.equal(operation.costLedgerPolicy.scoreFromEnemyCasualties, false);
  assert.equal(operation.costLedgerPolicy.rewardFromCivilianSuffering, false);

  const obstacleIds = operation.obstacles.map((obstacle) => obstacle.id);
  const patrolIds = operation.patrols.map((patrol) => patrol.id);
  const interactableIds = operation.interactables.map((interactable) => interactable.id);
  assert.equal(new Set(obstacleIds).size, obstacleIds.length, `${operation.id} obstacle IDs unique`);
  assert.equal(new Set(patrolIds).size, patrolIds.length, `${operation.id} patrol IDs unique`);
  assert.equal(
    new Set(interactableIds).size,
    interactableIds.length,
    `${operation.id} interactable IDs unique`,
  );

  for (const enemy of operation.enemies) {
    if (enemy.patrol) {
      assert.ok(patrolIds.includes(enemy.patrol), `${operation.id}/${enemy.id} patrol exists`);
    }
    assert.ok(
      enemy.x >= operation.bounds.minimumX &&
        enemy.x <= operation.bounds.maximumX &&
        enemy.z >= operation.bounds.minimumZ &&
        enemy.z <= operation.bounds.maximumZ,
      `${operation.id}/${enemy.id} stays inside bounds`,
    );
  }
  for (const interaction of operation.environmentInteractions) {
    assert.ok(
      interactableIds.includes(interaction.interactableId),
      `${operation.id}/${interaction.id} targets an authored interactable`,
    );
    const serializedEffects = JSON.stringify(interaction.effects);
    assert.doesNotMatch(
      serializedEffects,
      /reward|score|resource|morale/i,
      `${operation.id}/${interaction.id} cannot reward civilian costs`,
    );
  }
}

for (const operation of operationLayoutDefinitions.slice(0, 2)) {
  const elevations = operation.zones.map((zone) => GetTerrainElevation(zone, operation));
  assert.ok(
    Math.max(...elevations) - Math.min(...elevations) >= 5,
    `${operation.id} must expose a meaningful authored elevation range`,
  );
  assert.ok(
    operation.zones.every((zone) => Number.isFinite(zone.elevation)),
    `${operation.id} must not leave tactical terrain at an implicit flat height`,
  );
}

for (const operation of operationLayoutDefinitions) {
  for (const spawn of operation.playerSpawns) {
    assert.equal(
      IsNavigationBlocked(spawn, operation.obstacles, operation.bounds, 0.45),
      false,
      `${operation.id} spawn ${spawn.x},${spawn.z} remains on passable 2D navigation`,
    );
  }
  for (const interactable of operation.interactables) {
    const path = operation.playerSpawns
      .map((spawn) =>
        FindPath2D(spawn, interactable, {
          obstacles: operation.obstacles,
          bounds: operation.bounds,
          clearance: 0.45,
        }),
      )
      .find((candidate) => candidate.length > 0);
    assert.ok(path, `${operation.id}/${interactable.id} retains a reachable objective approach`);
    assert.ok(
      path.every((waypoint) => !("y" in waypoint) && !("elevation" in waypoint)),
      `${operation.id}/${interactable.id} navigation must remain planar`,
    );
  }
}
assert.equal(
  Distance({ x: 0, z: 0, elevation: 8 }, { x: 3, z: 4, elevation: -3 }),
  5,
  "navigation Distance must remain 2D even when tactical elevation differs",
);

const signal = GetOperationLayout("infiltrateSignalStation");
const rendezvous = GetOperationLayout("northVillageRelief");
const quarry = GetOperationLayout("quarryInterdiction");
assert.equal(signal.operationId, "cutline");
assert.equal(rendezvous.id, "nightRendezvous");
assert.equal(quarry.layoutFamily, "terracedQuarryRoad");
assert.notDeepEqual(signal.bounds, rendezvous.bounds);
assert.notDeepEqual(rendezvous.camera, quarry.camera);
assert.notDeepEqual(
  signal.playerSpawns.map(({ x, z }) => [x, z]),
  quarry.playerSpawns.map(({ x, z }) => [x, z]),
);

for (const [operationId, fileName] of [
  ["infiltrateSignalStation", "Model_EnvironmentCounty.glb"],
  ["nightRendezvous", "Model_EnvironmentNorthVillage.glb"],
  ["quarryInterdiction", "Model_EnvironmentQuarrySlope.glb"],
]) {
  const assetUrl = new URL(`./Models/${fileName}`, import.meta.url);
  assert.ok(existsSync(assetUrl), `${operationId} environment GLB exists`);
  assert.ok(statSync(assetUrl).size > 1024, `${operationId} environment GLB is non-empty`);
}

let signalRuntime = CreateOperationRuntime("infiltrateSignalStation");
const initialSignalSnapshot = GetOperationIntegrationSnapshot(signalRuntime);
assert.equal(initialSignalSnapshot.missionDefinition.id, "infiltrateSignalStation");
assert.ok(initialSignalSnapshot.objectives.definitions.mandatory.length >= 3);

let result = ResolveOperationInteraction(
  signalRuntime,
  "disableStationPower",
  "qinSuqiu",
);
assert.equal(result.ok, false);
assert.equal(result.reason, "wrongActor");
result = ResolveOperationInteraction(signalRuntime, "disableStationPower", "hanShilei");
assert.equal(result.ok, true);
signalRuntime = result.state;
assert.ok(signalRuntime.disabledLighting.includes("compoundSearchlight"));
assert.equal(signalRuntime.patrolRouteOverrides.compoundOne, "generatorInspection");

result = ResolveOperationInteraction(signalRuntime, "cutStationTelephone", "hanShilei");
assert.equal(result.ok, true);
signalRuntime = result.state;
assert.ok(signalRuntime.disabledReinforcements.includes("telephoneTruck"));
assert.ok(signalRuntime.enabledReinforcements.includes("southRunner"));
assert.equal(signalRuntime.reinforcementDelaySeconds, 100);
assert.ok(signalRuntime.completedObjectives.includes("stationSwitchboard"));

result = ResolveOperationInteraction(signalRuntime, "cutNorthJunction", "hanShilei");
assert.equal(result.ok, true);
signalRuntime = result.state;
assert.ok(signalRuntime.unlockedExtractions.includes("reedFord"));
assert.ok(signalRuntime.revealedIntel.includes("northReedsSafeWindow"));
assert.equal(
  GetAvailableInteractionForInteractable(signalRuntime, "stationLedger", "qinSuqiu")?.id,
  "takeStationLedger",
);
result = ResolveOperationInteraction(signalRuntime, "takeStationLedger");
assert.equal(result.ok, false);
assert.equal(result.reason, "carrierRequired");
result = ResolveOperationInteraction(signalRuntime, "takeStationLedger", "qinSuqiu");
assert.equal(result.ok, true);
signalRuntime = result.state;
assert.equal(signalRuntime.carriedItems.stationLedger, "qinSuqiu");
assert.ok(
  !signalRuntime.completedObjectives.includes("stationLedger"),
  "picking up intelligence is not the same as extracting it",
);
let droppedRuntime = DropOperationCarrierItems(signalRuntime, "qinSuqiu", { x: 5, z: 7 });
assert.equal(droppedRuntime.carriedItems.stationLedger, undefined);
assert.deepEqual(droppedRuntime.droppedItems[0], { itemId: "stationLedger", x: 5, z: 7 });
const recoveredResult = PickUpDroppedOperationItem(droppedRuntime, "stationLedger", "luLanzhi");
assert.equal(recoveredResult.ok, true);
assert.equal(recoveredResult.state.carriedItems.stationLedger, "luLanzhi");
assert.equal(recoveredResult.state.droppedItems.length, 0);
signalRuntime = ExtractOperationCarrier(signalRuntime, "qinSuqiu");
assert.ok(signalRuntime.completedObjectives.includes("stationLedger"));
assert.equal(signalRuntime.carriedItems.stationLedger, undefined);

let rendezvousRuntime = CreateOperationRuntime("nightRendezvous");
let routeResult;
result = ResolveOperationInteraction(
  rendezvousRuntime,
  "openIrrigationSluice",
  "hanShilei",
);
assert.equal(result.ok, false, "contact verification gates civilian departure");
assert.equal(result.reason, "requirementsNotMet");

result = ResolveOperationInteraction(rendezvousRuntime, "verifyContactLiu", "luLanzhi");
assert.equal(result.ok, true);
rendezvousRuntime = result.state;
assert.ok(rendezvousRuntime.activeCivilianRoutes.includes("westHouseholds"));

result = ResolveOperationInteraction(
  rendezvousRuntime,
  "openIrrigationSluice",
  "hanShilei",
);
assert.equal(result.ok, true);
rendezvousRuntime = result.state;
assert.ok(rendezvousRuntime.soundMasks.includes("creekBed"));
assert.ok(rendezvousRuntime.unlockedExtractions.includes("eastCanalExit"));
assert.equal(rendezvousRuntime.patrolRouteOverrides.eastOne, "sluiceInspection");

result = ResolveOperationInteraction(
  rendezvousRuntime,
  "disableVillageLamps",
  "hanShilei",
);
assert.equal(result.ok, true);
rendezvousRuntime = result.state;
assert.ok(rendezvousRuntime.disabledLighting.includes("westStreetLamp"));
assert.ok(rendezvousRuntime.blockedRoutes.includes("openThreshingCrossing"));
routeResult = CompleteCivilianRoute(rendezvousRuntime, "westHouseholds");
assert.equal(routeResult.ok, true);
rendezvousRuntime = routeResult.state;
assert.ok(
  !rendezvousRuntime.completedObjectives.includes("escortHouseholds"),
  "one household route is not enough to complete the escort",
);
routeResult = CompleteCivilianRoute(rendezvousRuntime, "eastHouseholds");
assert.equal(routeResult.ok, true);
rendezvousRuntime = routeResult.state;
assert.ok(rendezvousRuntime.completedObjectives.includes("escortHouseholds"));

let quarrySafeRuntime = CreateOperationRuntime("quarryInterdiction");
assert.ok(
  GetAvailableOperationInteractions(quarrySafeRuntime, "hanShilei").some(
    (interaction) => interaction.id === "triggerUnsafeRockfall",
  ),
  "unsafe rockfall is a deliberate, costly choice before evacuation",
);
assert.ok(
  !GetAvailableOperationInteractions(quarrySafeRuntime, "hanShilei").some(
    (interaction) => interaction.id === "triggerSafeRockfall",
  ),
  "safe rockfall requires completed evacuation",
);

result = ResolveOperationInteraction(
  quarrySafeRuntime,
  "coordinateWorkerEvacuation",
  "luLanzhi",
);
assert.equal(result.ok, true);
quarrySafeRuntime = result.state;
assert.equal(quarrySafeRuntime.flags.quarryWorkersEvacuating, true);
assert.equal(
  quarrySafeRuntime.flags.quarryWorkersClear,
  undefined,
  "starting evacuation does not immediately clear the blast area",
);

routeResult = CompleteCivilianRoute(quarrySafeRuntime, "quarryWorkersToGully");
assert.equal(routeResult.ok, true);
quarrySafeRuntime = routeResult.state;
assert.equal(quarrySafeRuntime.flags.quarryWorkersClear, true);
assert.ok(quarrySafeRuntime.completedObjectives.includes("evacuateQuarryWorkers"));

result = ResolveOperationInteraction(
  quarrySafeRuntime,
  "triggerSafeRockfall",
  "hanShilei",
);
assert.equal(result.ok, true);
quarrySafeRuntime = result.state;
assert.equal(quarrySafeRuntime.civilianCostLedger.harm, 0);
assert.ok(quarrySafeRuntime.blockedRoutes.includes("eastMountainRoad"));
assert.ok(quarrySafeRuntime.concealmentZones.includes("rockfallDust"));
assert.ok(quarrySafeRuntime.completedObjectives.includes("blockMountainRoad"));

let quarryUnsafeRuntime = CreateOperationRuntime("quarryInterdiction");
result = ResolveOperationInteraction(
  quarryUnsafeRuntime,
  "triggerUnsafeRockfall",
  "hanShilei",
);
assert.equal(result.ok, true);
quarryUnsafeRuntime = result.state;
assert.equal(quarryUnsafeRuntime.civilianCostLedger.risk, 5);
assert.equal(quarryUnsafeRuntime.civilianCostLedger.harm, 1);
assert.ok(
  quarryUnsafeRuntime.completedObjectives.includes("blockMountainRoad"),
  "unsafe shortcut may complete terrain objective but retains irreversible cost",
);
result = ResolveOperationInteraction(
  quarryUnsafeRuntime,
  "coordinateWorkerEvacuation",
  "luLanzhi",
);
assert.equal(result.ok, true);
quarryUnsafeRuntime = result.state;
routeResult = CompleteCivilianRoute(quarryUnsafeRuntime, "quarryWorkersToGully");
assert.equal(routeResult.ok, true);
quarryUnsafeRuntime = routeResult.state;
result = ResolveOperationInteraction(
  quarryUnsafeRuntime,
  "triggerSafeRockfall",
  "hanShilei",
);
assert.equal(result.ok, false);
assert.equal(result.reason, "interactableAlreadyUsed", "a collapsed support cannot trigger twice");

let scheduledRuntime = CreateOperationRuntime("nightRendezvous");
scheduledRuntime = AdvanceOperationClock(scheduledRuntime, 400);
assert.equal(scheduledRuntime.flags.curfewTightened, true);
assert.ok(scheduledRuntime.events.some((entry) => entry.event === "curfewTightens"));
const eventCount = scheduledRuntime.events.length;
scheduledRuntime = AdvanceOperationClock(scheduledRuntime, 30);
assert.equal(scheduledRuntime.events.length, eventCount, "scheduled events settle once");

assert.ok(historicalAtmosphereDefinition.verifiedBoundaries.length >= 6);
assert.ok(storyCharacterDefinitions.length >= 4);
assert.ok(Object.keys(operationStorylets).length >= 12);
for (const operation of operationLayoutDefinitions) {
  assert.ok(GetAtmospherePalette(operation.id), `${operation.id} has a sensory palette`);
  assert.ok(GetOperationStorylet(operation.narrativeRefs.briefing), `${operation.id} has briefing`);
  assert.ok(GetOperationStorylet(operation.narrativeRefs.debrief), `${operation.id} has debrief`);
}
assert.match(
  historicalAtmosphereDefinition.framing,
  /不.*爽点|不.*传奇/,
  "historical framing rejects spectacle built from suffering",
);

const deployedLayoutIds = [];
for (let completedMissions = 0; completedMissions < operationLayoutDefinitions.length; completedMissions += 1) {
  const camp = CreateInitialCampState();
  camp.completedMissions = completedMissions;
  const deployment = PrepareMissionFromCamp(CreateInitialMissionState(), camp);
  const layout = operationLayoutDefinitions[completedMissions];
  deployedLayoutIds.push(deployment.operationLayoutId);
  assert.equal(deployment.operationLayoutId, layout.id, "campaign deployment selects authored layout");
  assert.equal(GetMissionDefinitionForState(deployment).id, layout.id);
  assert.deepEqual(
    deployment.units.map(({ x, z }) => ({ x, z })),
    layout.playerSpawns,
    `${layout.id} uses its own live player spawns`,
  );
  assert.equal(deployment.enemies.length, layout.enemies.length, `${layout.id} uses its own enemies`);
  assert.equal(
    Object.keys(deployment.interactables).length,
    layout.interactables.length,
    `${layout.id} uses its own interactables`,
  );
  assert.deepEqual(
    deployment.extractionZones.map((zone) => zone.id),
    layout.extractionZones.map((zone) => zone.id),
    `${layout.id} uses its own extraction routes`,
  );
  assert.deepEqual(
    deployment.mainObjectiveIds,
    [...layout.objectives.mandatory.map((objective) => objective.id)],
    `${layout.id} exposes its authored mandatory objectives`,
  );
}
assert.equal(new Set(deployedLayoutIds).size, 3, "three campaign deployments produce three live layouts");

const specialistPresentCamp = CreateInitialCampState();
const specialistPresentMission = PrepareMissionFromCamp(CreateInitialMissionState(), specialistPresentCamp);
const specialistPresentRuntime = specialistPresentMission.operationRuntime;
const stationTelephone = GetOperationLayout("infiltrateSignalStation").environmentInteractions.find(
  (interaction) => interaction.id === "cutStationTelephone",
);
assert.deepEqual(
  specialistPresentRuntime.deployedActorIds,
  specialistPresentMission.units.map((unit) => unit.id),
  "the operation runtime records the actual deployment manifest",
);
assert.equal(IsActorAllowed(specialistPresentRuntime, stationTelephone, "hanShilei"), true);
assert.equal(IsActorAllowed(specialistPresentRuntime, stationTelephone, "qinSuqiu"), false);
assert.equal(IsActorAllowed(specialistPresentRuntime, stationTelephone, null), false);
assert.equal(
  ResolveOperationInteraction(specialistPresentRuntime, "cutStationTelephone").reason,
  "wrongActor",
  "role-bound work cannot settle without a deployed actor",
);
assert.equal(
  GetAvailableInteractionForInteractable(specialistPresentRuntime, "stationSwitchboard", "qinSuqiu"),
  null,
  "a deployed specialist keeps the specialist-only interaction strict",
);

function CreateCampWithoutEngineer(completedMissions) {
  const camp = CreateInitialCampState();
  camp.completedMissions = completedMissions;
  const engineer = camp.roster.find((operative) => operative.id === "hanShilei");
  engineer.wounds = 3;
  engineer.available = false;
  engineer.lost = true;
  return camp;
}

function AssertEmergencyInteraction(runtime, interactableId, actorId, expectedInteractionId) {
  const interaction = GetAvailableInteractionForInteractable(runtime, interactableId, actorId);
  const authored = GetOperationLayout(runtime.operationId).environmentInteractions.find(
    (candidate) => candidate.id === expectedInteractionId,
  );
  assert.equal(interaction?.id, expectedInteractionId);
  assert.equal(interaction.emergencyExecution, true);
  assert.equal(interaction.duration, authored.duration * 1.75);
  assert.equal(interaction.emergencyNoise.radius, 18);
  const result = ResolveOperationInteraction(runtime, expectedInteractionId, actorId);
  assert.equal(result.ok, true);
  assert.equal(result.interaction.emergencyExecution, true);
  assert.ok(
    result.state.emergencyNoiseEvents.some(
      (event) =>
        event.interactionId === expectedInteractionId &&
        event.actorId === actorId &&
        event.radius === 18,
    ),
    `${expectedInteractionId} emits an explicit extra-noise event`,
  );
  return result.state;
}

const signalFallbackMission = PrepareMissionFromCamp(
  CreateInitialMissionState(),
  CreateCampWithoutEngineer(0),
);
assert.ok(!signalFallbackMission.operationRuntime.deployedActorIds.includes("hanShilei"));
let signalFallbackRuntime = AssertEmergencyInteraction(
  signalFallbackMission.operationRuntime,
  "stationSwitchboard",
  "qinSuqiu",
  "cutStationTelephone",
);
assert.ok(signalFallbackRuntime.completedObjectives.includes("stationSwitchboard"));

const rendezvousFallbackMission = PrepareMissionFromCamp(
  CreateInitialMissionState(),
  CreateCampWithoutEngineer(1),
);
let rendezvousFallbackRuntime = ResolveOperationInteraction(
  rendezvousFallbackMission.operationRuntime,
  "verifyContactLiu",
  "qinSuqiu",
).state;
rendezvousFallbackRuntime = AssertEmergencyInteraction(
  rendezvousFallbackRuntime,
  "irrigationSluice",
  "weiShouyi",
  "openIrrigationSluice",
);
assert.ok(rendezvousFallbackRuntime.activeCivilianRoutes.includes("eastHouseholds"));

const quarryFallbackMission = PrepareMissionFromCamp(
  CreateInitialMissionState(),
  CreateCampWithoutEngineer(2),
);
let quarryFallbackRuntime = AssertEmergencyInteraction(
  quarryFallbackMission.operationRuntime,
  "quarryTelephone",
  "luLanzhi",
  "cutQuarryTelephone",
);
quarryFallbackRuntime = AssertEmergencyInteraction(
  quarryFallbackRuntime,
  "oreCartBrake",
  "qinSuqiu",
  "releaseOreCarts",
);
assert.ok(quarryFallbackRuntime.completedObjectives.includes("cutQuarryTelephone"));
assert.ok(quarryFallbackRuntime.completedObjectives.includes("blockMountainRoad"));

const gameSource = readFileSync(new URL("./Script_Game.mjs", import.meta.url), "utf8");
const worldSource = readFileSync(new URL("./Script_World.mjs", import.meta.url), "utf8");
assert.doesNotMatch(gameSource, /from ["']\.\/Data_Mission\.mjs["']/);
assert.doesNotMatch(worldSource, /from ["']\.\/Data_Mission\.mjs["']/);
assert.match(gameSource, /ResolveOperationInteraction/);
assert.match(
  gameSource,
  /activeReinforcementRoute[\s\S]*state\.activeReinforcementRouteId[\s\S]*activeReinforcementRoute \?\?/,
  "the spawned reinforcement entry must prefer the route selected when the alarm started",
);
assert.match(
  gameSource,
  /function ConsumeEmergencyNoiseEvents\([\s\S]*CreateSoundEvent\([\s\S]*noiseEvent\.radius[\s\S]*noiseEvent\.kind/,
  "emergency specialist fallback noise must enter the live AI sound-event stream",
);
assert.match(gameSource, /ConsumeEmergencyNoiseEvents\(previousRuntime, state\.operationRuntime, interactable\)/);
assert.match(gameSource, /UpdateCivilianRoutes\(deltaTime\)/);
assert.match(gameSource, /function GetCivilianEscort\(position, radius\)/);
assert.match(gameSource, /CanSee\(enemy, position, obstacles\)/);
assert.match(gameSource, /route\.behavior === "pauseAndYield"/);
assert.match(gameSource, /route\.behavior === "followSafeWindows"/);
assert.match(gameSource, /route\.behavior === "waitAtCover"/);
assert.match(gameSource, /route\.behavior === "stagedEvacuation"/);
assert.match(gameSource, /civilian\.segmentCommitted/);
assert.match(gameSource, /previousGroupClear/);
assert.match(gameSource, /civilianCostLedger\.risk \+= cost/);
assert.match(gameSource, /civilianCostLedger\.displacement \+= civilian\.groupSize/);
assert.match(gameSource, /这些记录不转化为物资或奖励/);
assert.match(gameSource, /PopulateMissionBriefing\(\)/);
assert.match(gameSource, /TriggerFieldStorylets\(`objective:\$\{objectiveId\}`\)/);
assert.match(gameSource, /TriggerFieldStorylets\(`flag:\$\{flagId\}`\)/);
assert.match(gameSource, /narrativeRefs\?\.debrief/);
assert.match(gameSource, /missionDefinition: GetActiveMissionDefinition\(\)/);
assert.match(gameSource, /state\.environment\.dynamicObstacles = dynamicObstacles/);
assert.match(worldSource, /activeMissionDefinition = options\.missionDefinition/);
assert.match(worldSource, /state\.environment\?\.dynamicObstacles/);
assert.match(worldSource, /civilianObjects/);
assert.match(worldSource, /environmentArtAssets\[activeMissionDefinition\.id\]/);
assert.match(worldSource, /operationFallbackRoot\.visible = false/);

console.log("MountainEmber1941 level smoke tests passed.");
