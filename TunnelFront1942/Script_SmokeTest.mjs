import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  MissionConfig,
  SoilCatalog,
} from "./Data_Level.mjs";
import {
  ActionIds,
  AdvanceTurn,
  ApplyPlayerAction,
  CollectEnemyObservations,
  CreateInitialState,
  CreateSurfaceSnapshot,
  DeserializeState,
  EnemyIntentIds,
  EvaluateMission,
  FindEvacuationPaths,
  FindTunnelPath,
  GetAttackTargets,
  GetAvailableActions,
  GetEvacuationTargets,
  GetExitWindow,
  GetMoveTargets,
  GetReconTargets,
  GetRouteSurvey,
  HexDistance,
  LayerIds,
  NeighborKeys,
  PlanEnemyTurn,
  RunEnemyPhase,
  SerializeState,
  UpdateEnemyBeliefs,
} from "./Script_Rules.mjs";

let passed = 0;

function Test(name, callback) {
  callback();
  passed += 1;
  console.log(`✓ ${name}`);
}

function Clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function Apply(state, unitId, actionId, targetKey = undefined, groupId = undefined) {
  const result = ApplyPlayerAction(state, {
    unitId,
    actionId,
    targetKey,
    groupId,
  });
  assert.equal(
    result.ok,
    true,
    `T${state.turn} ${unitId ?? "Mission"} ${actionId} ${targetKey ?? ""}: ${result.reason ?? "failed"}`,
  );
  return result.state;
}

function End(state) {
  return Apply(state, null, ActionIds.END_TURN);
}

function RunReservedDefenseScenario(actionId) {
  let state = CreateInitialState();
  state.turn = 6;
  state.sweepActive = true;
  state.tunnels["2,1"] = {
    ...Clone(state.tunnels["6,2"]),
    tileKey: "2,1",
    sealed: false,
  };
  state.enemyMemory.confirmedEntrances = ["2,1"];
  state.enemyMemory.knownEntranceStates = { "2,1": { sealed: false } };
  const patrol = state.enemies.find((enemy) => enemy.enemyId === "NorthPatrol");
  const sapper = state.enemies.find((enemy) => enemy.enemyId === "Sapper");
  state.enemies.forEach((enemy) => {
    enemy.health = [patrol.enemyId, sapper.enemyId].includes(enemy.enemyId)
      ? enemy.maxHealth
      : 0;
  });
  patrol.tileKey = "3,1";
  patrol.intent = {
    intentId: EnemyIntentIds.INVESTIGATE,
    targetKey: "2,1",
    evidenceTarget: "2,1",
    evidenceId: "UnrelatedPatrolMove",
    evidenceKind: "FreshTracks",
  };
  sapper.inactiveUntilTurn = 0;
  sapper.tileKey = "3,0";
  sapper.intent = {
    intentId: EnemyIntentIds.RESOLVE_SEAL,
    targetKey: "2,1",
    warningId: "ReservedSeal",
  };
  state.warnings = [{
    warningId: "ReservedSeal",
    kind: "Seal",
    targetKey: "2,1",
    resolvesTurn: state.turn,
    resolved: false,
    enemyId: sapper.enemyId,
    text: "工兵将在本回合封堵北枣窖",
  }];
  const militia = state.units.find((unit) => unit.unitId === "Militia");
  militia.layer = LayerIds.TUNNEL;
  militia.tileKey = "2,1";
  militia.actionPoints = 2;
  state = Apply(state, "Militia", actionId);
  return RunEnemyPhase(state);
}

function PrepareSharedOpening(state, firstDigKey) {
  const plannedExitKey = firstDigKey === "5,3" ? "0,5" : "2,1";
  let next = Apply(state, "Scout", ActionIds.RECON, plannedExitKey);
  next = Apply(next, "WorkTeam", ActionIds.ENTER_TUNNEL);
  next = Apply(next, "WorkTeam", ActionIds.DIG, firstDigKey);
  next = Apply(next, "Militia", ActionIds.MOVE, "6,2");
  next = Apply(next, "Militia", ActionIds.ENTER_TUNNEL);
  return next;
}

function RunNorthInterdictionBot() {
  let state = CreateInitialState();
  state = PrepareSharedOpening(state, "6,1");
  state = Apply(state, "Guerrilla", ActionIds.MOVE, "6,2");
  state = Apply(state, "Guerrilla", ActionIds.ENTER_TUNNEL);
  state = Apply(state, "Scout", ActionIds.MOVE, "6,3");
  state = End(state);

  state = Apply(state, "Scout", ActionIds.MOVE, "6,2");
  state = Apply(state, "Scout", ActionIds.ENTER_TUNNEL);
  state = Apply(state, "WorkTeam", ActionIds.DIG, "5,1");
  state = Apply(state, "WorkTeam", ActionIds.DIG, "4,1");
  state = Apply(state, "Guerrilla", ActionIds.MOVE, "6,1");
  state = Apply(state, "Guerrilla", ActionIds.MOVE, "5,1");
  state = End(state);

  state = Apply(state, "WorkTeam", ActionIds.DIG, "3,1");
  state = Apply(state, "WorkTeam", ActionIds.BRACE);
  state = Apply(state, "Guerrilla", ActionIds.MOVE, "4,1");
  state = Apply(state, "Guerrilla", ActionIds.MOVE, "3,1");
  state = Apply(state, "Scout", ActionIds.MOVE, "6,1");
  state = Apply(state, "Scout", ActionIds.MOVE, "5,1");
  state = End(state);

  state = Apply(state, "WorkTeam", ActionIds.DIG, "2,1");
  state = Apply(state, "Militia", ActionIds.EVACUATE, "2,1", "Wounded");
  state = Apply(state, "Guerrilla", ActionIds.MOVE, "2,1");
  state = Apply(state, "Scout", ActionIds.MOVE, "4,1");
  state = Apply(state, "Scout", ActionIds.MOVE, "3,1");
  state = End(state);

  state = Apply(state, "Militia", ActionIds.EVACUATE, "2,1", "Contacts");
  state = Apply(state, "Militia", ActionIds.MOVE, "6,1");
  state = Apply(state, "Scout", ActionIds.MOVE, "2,1");
  state = Apply(state, "Scout", ActionIds.EXIT_TUNNEL);
  state = End(state);

  state = Apply(state, "Scout", ActionIds.RECON, "2,1");
  state = Apply(state, "Militia", ActionIds.MOVE, "5,1");
  state = Apply(state, "Militia", ActionIds.MOVE, "4,1");
  state = End(state);

  state = Apply(state, "Scout", ActionIds.ENTER_TUNNEL);
  state = Apply(state, "Militia", ActionIds.MOVE, "3,1");
  state = Apply(state, "Militia", ActionIds.MOVE, "2,1");
  state = Apply(state, "Guerrilla", ActionIds.EXIT_TUNNEL);
  let attackKey = GetAttackTargets(state, "Guerrilla")[0];
  assert.ok(attackKey, "the guerrilla must have a visible adjacent threat at the north exit");
  state = Apply(state, "Guerrilla", ActionIds.ATTACK, attackKey);
  state = End(state);
  if (state.outcome) {
    return state;
  }

  const guerrillaStep = GetMoveTargets(state, "Guerrilla")[0];
  assert.ok(guerrillaStep, "the guerrilla must clear the exit for the militia");
  state = Apply(state, "Guerrilla", ActionIds.MOVE, guerrillaStep);
  state = Apply(state, "Militia", ActionIds.EXIT_TUNNEL);
  const firstMilitiaStep = GetMoveTargets(state, "Militia")[0];
  assert.ok(firstMilitiaStep, "the militia must clear the exit for the scout signal");
  state = Apply(state, "Militia", ActionIds.MOVE, firstMilitiaStep);
  state = End(state);

  state = Apply(state, "Scout", ActionIds.EXIT_TUNNEL);
  state = Apply(state, "Scout", ActionIds.RECON, "2,1");
  state = End(state);
  while (!state.outcome && state.turn <= MissionConfig.maxTurns + 1) {
    state = End(state);
  }
  return state;
}

function RunSouthDeceptionBot(useDecoy = true, useTrap = true, seed = 19420501) {
  let state = CreateInitialState({ seed });
  state = Apply(state, "Scout", ActionIds.RECON, "0,5");
  state = Apply(state, "WorkTeam", ActionIds.ENTER_TUNNEL);
  state = Apply(state, "WorkTeam", ActionIds.DIG, "5,3");
  if (useDecoy) {
    state = Apply(state, "Militia", ActionIds.DECOY, "6,5");
  }
  state = Apply(state, "Militia", ActionIds.MOVE, "6,2");
  state = Apply(state, "Scout", ActionIds.MOVE, "6,3");
  state = End(state);

  state = Apply(state, "Militia", ActionIds.ENTER_TUNNEL);
  state = Apply(state, "Militia", ActionIds.MOVE, "5,3");
  state = Apply(state, "Guerrilla", ActionIds.MOVE, "6,2");
  state = Apply(state, "Guerrilla", ActionIds.ENTER_TUNNEL);
  state = Apply(state, "Scout", ActionIds.MOVE, "6,2");
  state = Apply(state, "Scout", ActionIds.ENTER_TUNNEL);
  state = Apply(state, "WorkTeam", ActionIds.DIG, "4,4");
  state = Apply(state, "WorkTeam", ActionIds.DIG, "3,4");
  state = End(state);

  state = Apply(state, "WorkTeam", ActionIds.DIG, "2,4");
  state = Apply(state, "WorkTeam", ActionIds.DIG, "1,5");
  state = Apply(state, "Militia", ActionIds.MOVE, "4,4");
  state = Apply(state, "Militia", ActionIds.MOVE, "3,4");
  state = Apply(state, "Scout", ActionIds.MOVE, "5,3");
  state = Apply(state, "Scout", ActionIds.MOVE, "4,4");
  state = End(state);

  state = Apply(state, "WorkTeam", ActionIds.DIG, "0,5");
  state = Apply(state, "Guerrilla", ActionIds.EVACUATE, "0,5", "Wounded");
  state = Apply(state, "Militia", ActionIds.MOVE, "2,4");
  state = Apply(state, "Militia", ActionIds.MOVE, "1,5");
  state = Apply(state, "Scout", ActionIds.MOVE, "3,4");
  state = Apply(state, "Scout", ActionIds.MOVE, "2,4");
  state = End(state);

  state = Apply(state, "Guerrilla", ActionIds.EVACUATE, "0,5", "Contacts");
  state = Apply(state, "Militia", ActionIds.MOVE, "0,5");
  if (useTrap) {
    state = Apply(state, "Militia", ActionIds.TRAP);
  }
  state = Apply(state, "Scout", ActionIds.MOVE, "1,5");
  state = Apply(state, "Scout", ActionIds.MOVE, "0,5");
  state = End(state);

  state = Apply(state, "Scout", ActionIds.EXIT_TUNNEL);
  state = Apply(state, "Scout", ActionIds.RECON, "0,5");
  state = End(state);

  state = Apply(state, "Scout", ActionIds.ENTER_TUNNEL);
  state = End(state);

  state = Apply(state, "Scout", ActionIds.EXIT_TUNNEL);
  state = Apply(state, "Scout", ActionIds.RECON, "0,5");
  state = End(state);

  while (!state.outcome && state.turn <= MissionConfig.maxTurns + 1) {
    state = End(state);
  }
  return state;
}

function RunSouthAllGroupsBot(seed) {
  let state = CreateInitialState({ seed });
  let pressureObserved = false;
  state = Apply(state, "Scout", ActionIds.RECON, "0,5");
  state = Apply(state, "WorkTeam", ActionIds.ENTER_TUNNEL);
  state = Apply(state, "WorkTeam", ActionIds.DIG, "5,3");
  state = Apply(state, "Militia", ActionIds.MOVE, "6,2");
  state = Apply(state, "Militia", ActionIds.ENTER_TUNNEL);
  state = Apply(state, "Guerrilla", ActionIds.MOVE, "6,2");
  state = Apply(state, "Guerrilla", ActionIds.ENTER_TUNNEL);
  state = Apply(state, "Scout", ActionIds.MOVE, "6,3");
  state = End(state);

  state = Apply(state, "WorkTeam", ActionIds.DIG, "4,4");
  state = Apply(state, "WorkTeam", ActionIds.DIG, "3,4");
  state = Apply(state, "Scout", ActionIds.MOVE, "6,2");
  state = Apply(state, "Scout", ActionIds.ENTER_TUNNEL);
  state = End(state);

  state = Apply(state, "WorkTeam", ActionIds.DIG, "2,4");
  state = Apply(state, "WorkTeam", ActionIds.DIG, "1,5");
  state = Apply(state, "Scout", ActionIds.MOVE, "5,3");
  state = Apply(state, "Scout", ActionIds.MOVE, "4,4");
  state = End(state);

  state = Apply(state, "WorkTeam", ActionIds.DIG, "0,5");
  state = Apply(state, "Militia", ActionIds.EVACUATE, "0,5", "Wounded");
  state = Apply(state, "Scout", ActionIds.MOVE, "3,4");
  state = Apply(state, "Scout", ActionIds.MOVE, "2,4");
  state = End(state);

  state = Apply(state, "Militia", ActionIds.EVACUATE, "0,5", "Families");
  state = Apply(state, "Scout", ActionIds.MOVE, "1,5");
  state = Apply(state, "Scout", ActionIds.MOVE, "0,5");
  state = End(state);

  state = Apply(state, "Militia", ActionIds.EVACUATE, "0,5", "Contacts");
  state = Apply(state, "Scout", ActionIds.EXIT_TUNNEL);
  state = Apply(state, "Scout", ActionIds.RECON, "0,5");
  state = End(state);
  pressureObserved ||= ["Watched", "Sealing", "Smoking"].includes(
    GetExitWindow(state, "0,5").status,
  );

  if (!state.outcome) {
    state = End(state);
    pressureObserved ||= ["Watched", "Sealing", "Smoking"].includes(
      GetExitWindow(state, "0,5").status,
    );
  }
  if (
    !state.outcome
    && GetAvailableActions(state, "Scout").includes(ActionIds.RECON)
  ) {
    state = Apply(state, "Scout", ActionIds.RECON, "0,5");
  }
  while (!state.outcome && state.turn <= MissionConfig.maxTurns + 1) {
    pressureObserved ||= ["Watched", "Sealing", "Smoking"].includes(
      GetExitWindow(state, "0,5").status,
    );
    state = End(state);
  }
  return { state, pressureObserved };
}

function RunAmbushBot() {
  let state = CreateInitialState();
  state = PrepareSharedOpening(state, "6,1");
  state = Apply(state, "Guerrilla", ActionIds.MOVE, "6,2");
  state = Apply(state, "Guerrilla", ActionIds.ENTER_TUNNEL);
  state = Apply(state, "Scout", ActionIds.MOVE, "6,3");
  state = End(state);

  state = Apply(state, "Scout", ActionIds.MOVE, "6,2");
  state = Apply(state, "Scout", ActionIds.ENTER_TUNNEL);
  state = Apply(state, "WorkTeam", ActionIds.DIG, "5,1");
  state = Apply(state, "WorkTeam", ActionIds.DIG, "4,1");
  state = End(state);

  state = Apply(state, "WorkTeam", ActionIds.DIG, "3,1");
  state = Apply(state, "WorkTeam", ActionIds.BRACE);
  state = Apply(state, "Militia", ActionIds.MOVE, "6,1");
  state = Apply(state, "Militia", ActionIds.MOVE, "5,1");
  state = Apply(state, "Scout", ActionIds.MOVE, "6,1");
  state = Apply(state, "Scout", ActionIds.MOVE, "5,1");
  state = End(state);

  state = Apply(state, "WorkTeam", ActionIds.DIG, "2,1");
  state = Apply(state, "Guerrilla", ActionIds.EVACUATE, "2,1", "Wounded");
  state = Apply(state, "Militia", ActionIds.MOVE, "4,1");
  state = Apply(state, "Militia", ActionIds.MOVE, "3,1");
  state = Apply(state, "Scout", ActionIds.MOVE, "4,1");
  state = Apply(state, "Scout", ActionIds.MOVE, "3,1");
  state = End(state);

  state = Apply(state, "Guerrilla", ActionIds.EVACUATE, "2,1", "Contacts");
  state = Apply(state, "Guerrilla", ActionIds.EXIT_TUNNEL);
  state = Apply(state, "Militia", ActionIds.MOVE, "2,1");
  state = Apply(state, "Militia", ActionIds.AMBUSH);
  state = Apply(state, "Scout", ActionIds.MOVE, "2,1");
  state = Apply(state, "Scout", ActionIds.EXIT_TUNNEL);
  state = End(state);

  state = Apply(state, "Scout", ActionIds.RECON, "2,1");
  state = Apply(state, "Scout", ActionIds.ENTER_TUNNEL);
  state = End(state);
  state = Apply(state, "Militia", ActionIds.MOVE, "3,1");
  state = Apply(state, "Militia", ActionIds.MOVE, "2,1");
  state = End(state);
  if (state.outcome) {
    return state;
  }

  state = Apply(state, "Militia", ActionIds.AMBUSH);
  state = End(state);

  state = Apply(state, "Scout", ActionIds.EXIT_TUNNEL);
  state = Apply(state, "Scout", ActionIds.RECON, "2,1");
  state = End(state);
  while (!state.outcome && state.turn <= MissionConfig.maxTurns + 1) {
    state = End(state);
  }
  return state;
}

function RunNorthIdleBot() {
  let state = CreateInitialState();
  state = PrepareSharedOpening(state, "6,1");
  state = Apply(state, "Guerrilla", ActionIds.MOVE, "6,2");
  state = Apply(state, "Guerrilla", ActionIds.ENTER_TUNNEL);
  state = Apply(state, "Scout", ActionIds.MOVE, "6,3");
  state = End(state);
  state = Apply(state, "Scout", ActionIds.MOVE, "6,2");
  state = Apply(state, "Scout", ActionIds.ENTER_TUNNEL);
  state = Apply(state, "WorkTeam", ActionIds.DIG, "5,1");
  state = Apply(state, "WorkTeam", ActionIds.DIG, "4,1");
  state = End(state);
  state = Apply(state, "WorkTeam", ActionIds.DIG, "3,1");
  state = Apply(state, "WorkTeam", ActionIds.BRACE);
  state = End(state);
  state = Apply(state, "WorkTeam", ActionIds.DIG, "2,1");
  state = Apply(state, "Militia", ActionIds.EVACUATE, "2,1", "Wounded");
  state = End(state);
  state = Apply(state, "Militia", ActionIds.EVACUATE, "2,1", "Contacts");
  state = End(state);
  while (!state.outcome && state.turn <= MissionConfig.maxTurns + 1) {
    state = End(state);
  }
  return state;
}

function CheapestRoute(state, goalKey) {
  const costs = new Map([["6,2", 0]]);
  const noise = new Map([["6,2", 0]]);
  const open = ["6,2"];
  while (open.length) {
    open.sort((first, second) => costs.get(first) - costs.get(second));
    const currentKey = open.shift();
    if (currentKey === goalKey) {
      break;
    }
    for (const neighborKey of NeighborKeys(currentKey)) {
      const tile = state.tiles[neighborKey];
      if (!tile) {
        continue;
      }
      const nextCost = costs.get(currentKey) + SoilCatalog[tile.soilId].digCost;
      if (nextCost < (costs.get(neighborKey) ?? Infinity)) {
        costs.set(neighborKey, nextCost);
        noise.set(
          neighborKey,
          noise.get(currentKey) + SoilCatalog[tile.soilId].noise,
        );
        open.push(neighborKey);
      }
    }
  }
  return {
    distance: HexDistance("6,2", goalKey),
    cost: costs.get(goalKey),
    noise: noise.get(goalKey),
  };
}

Test("mission opens with visible pressure, countdown, recon, and excavation options", () => {
  const state = CreateInitialState();
  assert.equal(state.turn, 1);
  assert.equal(state.maxTurns, 11);
  assert.equal(state.sweepTurn, 5);
  assert.equal(state.enemies.filter((enemy) => !enemy.inactiveUntilTurn).length >= 2, true);
  assert.equal(GetAvailableActions(state, "Scout").includes(ActionIds.RECON), true);
  assert.equal(GetAvailableActions(state, "WorkTeam").includes(ActionIds.ENTER_TUNNEL), true);
  assert.equal(state.planningReconCompleted, false);
  assert.match(state.log[0].text, /第 4 回合转移信号/);
});

Test("planning reconnaissance commits to one exit and exposes distinct corridor tradeoffs", () => {
  const initial = CreateInitialState();
  assert.deepEqual(GetReconTargets(initial, "Scout").sort(), ["0,5", "2,1"]);
  const untargeted = ApplyPlayerAction(initial, {
    unitId: "Scout",
    actionId: ActionIds.RECON,
  });
  assert.equal(untargeted.ok, false);
  assert.match(untargeted.reason, /选择北枣窖或西南苇井/);

  const north = Apply(initial, "Scout", ActionIds.RECON, "2,1");
  const south = Apply(initial, "Scout", ActionIds.RECON, "0,5");
  const northSurvey = GetRouteSurvey(initial, "2,1");
  const southSurvey = GetRouteSurvey(initial, "0,5");
  assert.equal(north.plannedExitKey, "2,1");
  assert.equal(south.plannedExitKey, "0,5");
  assert.equal(north.planningReconCompleted, true);
  assert.equal(south.planningReconCompleted, true);
  assert.notDeepEqual(north.plannedFastPath, south.plannedFastPath);
  assert.notDeepEqual(north.plannedQuietPath, south.plannedQuietPath);
  assert.equal(northSurvey.fast.segments < southSurvey.fast.segments, true);
  assert.equal(northSurvey.fast.noise > southSurvey.fast.noise, true);
  assert.equal(northSurvey.nearestThreat.enemyId, "NorthPatrol");
  assert.equal(southSurvey.nearestThreat.enemyId, "BridgePatrol");
  assert.equal(north.exitSignalsIssued, 0);
  assert.match(north.log.at(-1).text, /快掘.*静掘.*主出口接通前/);
});

Test("the surveyed main exit must connect before another exit can launch civilians", () => {
  let state = CreateInitialState();
  state = Apply(state, "Scout", ActionIds.RECON, "2,1");
  state.turn = MissionConfig.evacuationTurn;
  const militia = state.units.find((unit) => unit.unitId === "Militia");
  militia.layer = LayerIds.TUNNEL;
  militia.tileKey = "6,2";
  militia.actionPoints = 2;
  const nodeTemplate = Clone(state.tunnels["6,2"]);
  for (const tileKey of ["5,3", "4,4", "3,4", "2,4", "1,5", "0,5"]) {
    state.tunnels[tileKey] = { ...Clone(nodeTemplate), tileKey };
  }
  assert.deepEqual(GetEvacuationTargets(state, "Militia"), []);
  const blockedLaunch = ApplyPlayerAction(state, {
    unitId: "Militia",
    actionId: ActionIds.EVACUATE,
    targetKey: "0,5",
    groupId: "Wounded",
  });
  assert.equal(blockedLaunch.ok, false);
  assert.match(blockedLaunch.reason, /主勘线出口北枣窖尚未接通/);
  for (const tileKey of ["6,1", "5,1", "4,1", "3,1", "2,1"]) {
    state.tunnels[tileKey] = { ...Clone(nodeTemplate), tileKey };
  }
  assert.deepEqual(GetEvacuationTargets(state, "Militia").sort(), ["0,5", "2,1"]);
});

Test("intel reveals threats along the chosen corridor instead of acting as a dead resource", () => {
  let north = CreateInitialState();
  north = Apply(north, "Scout", ActionIds.RECON, "2,1");
  north.enemies.forEach((enemy) => {
    enemy.scoutedUntilTurn = 0;
    enemy.intentRevealed = false;
  });
  const lowIntel = Clone(north);
  lowIntel.intel = 0;
  PlanEnemyTurn(lowIntel);
  PlanEnemyTurn(north);
  assert.equal(
    north.enemies.find((enemy) => enemy.enemyId === "NorthPatrol").intentRevealed,
    true,
  );
  assert.equal(
    lowIntel.enemies.find((enemy) => enemy.enemyId === "NorthPatrol").intentRevealed,
    false,
  );

  let south = CreateInitialState();
  south = Apply(south, "Scout", ActionIds.RECON, "0,5");
  south.enemies.forEach((enemy) => {
    enemy.scoutedUntilTurn = 0;
    enemy.intentRevealed = false;
  });
  PlanEnemyTurn(south);
  assert.equal(
    south.enemies.find((enemy) => enemy.enemyId === "BridgePatrol").intentRevealed,
    true,
  );
  assert.equal(
    south.enemies.find((enemy) => enemy.enemyId === "NorthPatrol").intentRevealed,
    false,
  );

  const movedOffNorthCorridor = Clone(north);
  const movedNorthPatrol = movedOffNorthCorridor.enemies.find((enemy) => (
    enemy.enemyId === "NorthPatrol"
  ));
  movedNorthPatrol.tileKey = "0,0";
  movedNorthPatrol.intentRevealed = false;
  movedNorthPatrol.scoutedUntilTurn = 0;
  PlanEnemyTurn(movedOffNorthCorridor);
  assert.equal(movedNorthPatrol.intentRevealed, false);

  const movedOntoSouthCorridor = Clone(south);
  const movedSouthPatrol = movedOntoSouthCorridor.enemies.find((enemy) => (
    enemy.enemyId === "NorthPatrol"
  ));
  movedSouthPatrol.tileKey = "1,5";
  movedSouthPatrol.intentRevealed = false;
  movedSouthPatrol.scoutedUntilTurn = 0;
  PlanEnemyTurn(movedOntoSouthCorridor);
  assert.equal(movedSouthPatrol.intentRevealed, true);
});

Test("repeat surface reconnaissance costs organization, respects cooldown, and cannot be spammed", () => {
  let state = CreateInitialState();
  state.reconActions = 1;
  state.reconVisitedTiles = ["6,3"];
  state.planningReconCompleted = true;
  state.plannedExitKey = "2,1";
  state.exposure = 30;
  state = Apply(state, "Scout", ActionIds.RECON, "5,3");
  assert.equal(state.exposure, 25);
  assert.equal(state.reconActions, 2);
  assert.equal(state.planningReconCompleted, true);
  assert.equal(state.organization, MissionConfig.startingOrganization - 1);
  assert.equal(GetAvailableActions(state, "Scout").includes(ActionIds.RECON), false);
  const repeated = ApplyPlayerAction(state, {
    unitId: "Scout",
    actionId: ActionIds.RECON,
  });
  assert.equal(repeated.ok, false);
  assert.equal(
    state.enemies.some((enemy) => enemy.intentRevealed && enemy.scoutedUntilTurn >= state.turn),
    true,
  );
  const scout = state.units.find((unit) => unit.unitId === "Scout");
  scout.layer = LayerIds.TUNNEL;
  assert.equal(GetAvailableActions(state, "Scout").includes(ActionIds.RECON), false);
});

Test("civilians wait safely below an unknown exit until the scout signals a clear window", () => {
  let state = CreateInitialState();
  state.enemies.forEach((enemy) => {
    enemy.health = 0;
  });
  state.turn = 5;
  state.sweepActive = true;
  state.tunnels["2,1"] = {
    ...Clone(state.tunnels["6,2"]),
    tileKey: "2,1",
    sealed: false,
  };
  const group = state.civilians[0];
  group.status = "Moving";
  group.path = ["6,2", "2,1"];
  group.pathIndex = 1;
  group.tileKey = "2,1";
  group.exitKey = "2,1";
  const safetyBefore = state.peopleSafety;
  state = RunEnemyPhase(state);
  assert.equal(state.civilians[0].waitingForSignal, true);
  assert.equal(state.civiliansSafe, 0);
  assert.equal(state.peopleSafety, safetyBefore);
  assert.equal(GetExitWindow(state, "2,1").status, "Unknown");
  const missed = Clone(state);
  missed.turn = MissionConfig.maxTurns + 1;
  missed.outcome = EvaluateMission(missed);
  assert.equal(missed.outcome.failureId, "ExitWindowMissed");
  assert.equal(missed.outcome.groupId, "Wounded");

  const scout = state.units.find((unit) => unit.unitId === "Scout");
  scout.tileKey = "2,1";
  scout.layer = LayerIds.SURFACE;
  scout.actionPoints = 2;
  state.reconActions = 1;
  state.planningReconCompleted = true;
  state.plannedExitKey = "2,1";
  state.lastReconTurn = 0;
  state = Apply(state, "Scout", ActionIds.RECON, "2,1");
  assert.equal(GetExitWindow(state, "2,1").status, "Clear");
  assert.equal(state.intel, 1);
  const expiredSignal = Clone(state);
  expiredSignal.turn = expiredSignal.exitWindows["2,1"].checkedUntilTurn + 1;
  assert.equal(GetExitWindow(expiredSignal, "2,1").status, "Unknown");
  state = RunEnemyPhase(state);
  assert.equal(state.civilians[0].status, "Safe");
  assert.equal(state.civiliansSafe, 3);
});

Test("surface control overrides a fresh clear signal at an exit", () => {
  const state = CreateInitialState();
  state.turn = 6;
  state.tunnels["2,1"] = {
    ...Clone(state.tunnels["6,2"]),
    tileKey: "2,1",
    sealed: false,
  };
  state.exitWindows["2,1"].checkedTurn = state.turn;
  state.exitWindows["2,1"].checkedUntilTurn = state.turn + 1;
  const patrol = state.enemies.find((enemy) => enemy.enemyId === "NorthPatrol");
  state.enemies.forEach((enemy) => {
    enemy.health = enemy.enemyId === patrol.enemyId ? 3 : 0;
  });
  patrol.inactiveUntilTurn = 0;
  patrol.stunnedUntilTurn = 0;
  patrol.intent = null;

  patrol.tileKey = "2,1";
  assert.equal(GetExitWindow(state, "2,1").status, "Watched");

  patrol.tileKey = "2,2";
  assert.equal(HexDistance(patrol.tileKey, "2,1"), 1);
  assert.equal(GetExitWindow(state, "2,1").status, "Watched");

  patrol.health = 0;
  assert.equal(GetExitWindow(state, "2,1").status, "Clear");
});

Test("enemy movement cannot overlap a surface player unit", () => {
  let state = CreateInitialState();
  state.turn = 6;
  state.sweepActive = true;
  const scout = state.units.find((unit) => unit.unitId === "Scout");
  scout.layer = LayerIds.SURFACE;
  scout.tileKey = "2,1";
  const patrol = state.enemies.find((enemy) => enemy.enemyId === "NorthPatrol");
  state.enemies.forEach((enemy) => {
    enemy.health = enemy.enemyId === patrol.enemyId ? 3 : 0;
  });
  patrol.tileKey = "3,1";
  patrol.intent = {
    intentId: EnemyIntentIds.INVESTIGATE,
    targetKey: "2,1",
    evidenceTarget: "2,1",
    evidenceId: "OccupiedExit",
    evidenceKind: "SurfaceSighting",
  };
  state = RunEnemyPhase(state);
  assert.equal(state.enemies.find((enemy) => enemy.enemyId === "NorthPatrol").tileKey, "3,1");
  assert.equal(state.units.find((unit) => unit.unitId === "Scout").tileKey, "2,1");
});

Test("a new seal warning reroutes civilians in transit and still permits a T11 escape", () => {
  let state = CreateInitialState();
  state.turn = 7;
  state.sweepActive = true;
  const northPath = ["6,2", "6,1", "5,1", "4,1", "3,1", "2,1"];
  const southPath = ["6,2", "5,3", "4,4", "3,4", "2,4", "1,5", "0,5"];
  for (const tileKey of [...new Set([...northPath, ...southPath])]) {
    state.tunnels[tileKey] = {
      ...Clone(state.tunnels["6,2"]),
      tileKey,
      sealed: false,
      collapsed: false,
      braced: true,
    };
  }
  const sapper = state.enemies.find((enemy) => enemy.enemyId === "Sapper");
  state.enemies.forEach((enemy) => {
    enemy.health = enemy.enemyId === sapper.enemyId ? 4 : 0;
  });
  sapper.inactiveUntilTurn = 0;
  sapper.tileKey = "3,1";
  sapper.intent = {
    intentId: EnemyIntentIds.PREPARE_SEAL,
    targetKey: "2,1",
  };
  const group = state.civilians[0];
  group.status = "Moving";
  group.path = northPath;
  group.pathIndex = 3;
  group.tileKey = "4,1";
  group.exitKey = "2,1";

  state = RunEnemyPhase(state);
  const rerouted = state.civilians[0];
  assert.equal(state.warnings.some((warning) => !warning.resolved && warning.kind === "Seal"), true);
  assert.equal(rerouted.tileKey === "2,1", false);
  assert.equal(rerouted.path[0], "4,1");
  assert.equal(rerouted.exitKey, "0,5");
  assert.equal(rerouted.delayed, true);
  assert.equal(
    state.eventLedger.some((event) => event.text.includes(state.tiles["0,5"].name)),
    true,
  );

  sapper.health = 0;
  sapper.intent = null;
  while (state.turn < MissionConfig.maxTurns) {
    state = RunEnemyPhase(state);
  }
  assert.equal(state.turn, MissionConfig.maxTurns);
  assert.equal(state.civilians[0].status, "Moving");
  state.exitWindows["0,5"].checkedTurn = state.turn;
  state.exitWindows["0,5"].checkedUntilTurn = state.turn + 1;
  state = RunEnemyPhase(state);
  assert.equal(state.turn, MissionConfig.maxTurns + 1);
  assert.equal(state.civilians[0].status, "Safe");
  assert.equal(state.civiliansSafe, 3);
});

Test("a visible seal warning makes civilians take a connected second exit", () => {
  let state = CreateInitialState();
  state.turn = 7;
  state.sweepActive = true;
  state.enemies.forEach((enemy) => {
    enemy.health = 0;
  });
  const northPath = ["6,2", "6,1", "5,1", "4,1", "3,1", "2,1"];
  const southPath = ["6,2", "5,3", "4,4", "3,4", "2,4", "1,5", "0,5"];
  for (const tileKey of [...new Set([...northPath, ...southPath])]) {
    state.tunnels[tileKey] = {
      ...Clone(state.tunnels["6,2"]),
      tileKey,
      sealed: false,
      collapsed: false,
      braced: true,
    };
  }
  state.warnings = [{
    warningId: "NorthSeal",
    kind: "Seal",
    targetKey: "2,1",
    resolvesTurn: state.turn + 1,
    resolved: false,
    enemyId: "Sapper",
  }];
  state.exitWindows["0,5"].checkedTurn = state.turn;
  state.exitWindows["0,5"].checkedUntilTurn = state.turn + 2;
  const group = state.civilians[0];
  group.status = "Moving";
  group.path = northPath;
  group.pathIndex = northPath.length - 1;
  group.tileKey = "2,1";
  group.exitKey = "2,1";
  state = RunEnemyPhase(state);
  assert.equal(state.civilians[0].status, "Moving");
  assert.equal(state.civilians[0].exitKey, "0,5");
  assert.equal(state.civilians[0].delayed, true);
  assert.equal(
    state.eventLedger.some((event) => event.text.includes(state.tiles["0,5"].name)),
    true,
  );
});

Test("hex helpers return six unique neighbors and symmetric distance", () => {
  const neighbors = NeighborKeys("3,2");
  assert.equal(neighbors.length, 6);
  assert.equal(new Set(neighbors).size, 6);
  assert.equal(HexDistance("6,2", "2,1"), HexDistance("2,1", "6,2"));
});

Test("north route is shorter and louder while south route is longer and steadier", () => {
  const state = CreateInitialState();
  const north = CheapestRoute(state, "2,1");
  const south = CheapestRoute(state, "0,5");
  assert.equal(north.distance < south.distance, true);
  assert.equal(north.cost < south.cost, true);
  assert.equal(north.noise > south.noise, true);
});

Test("digging requires the digger underground on an adjacent cell and exact resources", () => {
  const state = CreateInitialState();
  const surfaceAttempt = ApplyPlayerAction(state, {
    unitId: "WorkTeam",
    actionId: ActionIds.DIG,
    targetKey: "5,2",
  });
  assert.equal(surfaceAttempt.ok, false);
  let underground = Apply(state, "WorkTeam", ActionIds.ENTER_TUNNEL);
  const toolsBefore = underground.tools;
  const expectedCost = SoilCatalog[underground.tiles["5,2"].soilId].digCost;
  underground = Apply(underground, "WorkTeam", ActionIds.DIG, "5,2");
  assert.equal(underground.tools, toolsBefore - expectedCost);
  assert.equal(underground.tunnelsDug, 1);
});

Test("evacuation cannot launch before turn four or twice from one entrance in a turn", () => {
  let state = CreateInitialState();
  for (const key of ["5,3", "4,4", "3,4", "2,4", "1,5", "0,5"]) {
    state.tunnels[key] = {
      ...Clone(state.tunnels["6,2"]),
      tileKey: key,
      sealed: false,
      isOriginal: false,
    };
  }
  state.units.find((unit) => unit.unitId === "Militia").layer = LayerIds.TUNNEL;
  state.units.find((unit) => unit.unitId === "Militia").tileKey = "6,2";
  assert.deepEqual(FindEvacuationPaths(state).map((entry) => entry.exitKey), ["0,5"]);
  assert.equal(GetAvailableActions(state, "Militia").includes(ActionIds.EVACUATE), false);
  state.turn = MissionConfig.evacuationTurn;
  state = Apply(state, "Militia", ActionIds.EVACUATE, "0,5", "Wounded");
  const secondLaunch = ApplyPlayerAction(state, {
    unitId: "Militia",
    actionId: ActionIds.EVACUATE,
    targetKey: "0,5",
    groupId: "Contacts",
  });
  assert.equal(secondLaunch.ok, false);
});

Test("sealed entrances block crossing layers but not underground horizontal movement", () => {
  let state = CreateInitialState();
  state.tunnels["5,2"] = {
    ...Clone(state.tunnels["6,2"]),
    tileKey: "5,2",
    sealed: true,
  };
  const digger = state.units.find((unit) => unit.unitId === "WorkTeam");
  digger.layer = LayerIds.TUNNEL;
  digger.tileKey = "6,2";
  assert.equal(GetMoveTargets(state, "WorkTeam").includes("5,2"), true);
  state.tunnels["6,2"].sealed = true;
  digger.layer = LayerIds.SURFACE;
  assert.equal(GetAvailableActions(state, "WorkTeam").includes(ActionIds.ENTER_TUNNEL), false);
});

Test("one evidence token is processed once and never remotely confirms an entrance", () => {
  const memory = {
    suspectedEntrances: {},
    confirmedEntrances: [],
    knownEntranceStates: {},
    processedEvidenceIds: [],
    lastKnownSurfaceUnit: null,
  };
  const observation = {
    evidenceId: "NoiseA",
    kind: "DigNoise",
    tileKey: "2,1",
    strength: 1,
    createdTurn: 1,
    expiresTurn: 4,
  };
  const once = UpdateEnemyBeliefs(memory, [observation], 1);
  const twice = UpdateEnemyBeliefs(once, [observation], 2);
  assert.equal(once.suspectedEntrances["2,1"], twice.suspectedEntrances["2,1"]);
  assert.deepEqual(twice.confirmedEntrances, []);
});

Test("enemy planning does not peek at a hidden sealed tunnel node", () => {
  const first = CreateInitialState();
  first.turn = 5;
  first.sweepActive = true;
  const sapper = first.enemies.find((enemy) => enemy.enemyId === "Sapper");
  sapper.inactiveUntilTurn = 0;
  sapper.tileKey = "3,1";
  first.enemyMemory.confirmedEntrances = ["2,1"];
  first.enemyMemory.knownEntranceStates = { "2,1": { sealed: false } };
  first.tunnels["2,1"] = {
    ...Clone(first.tunnels["6,2"]),
    tileKey: "2,1",
    sealed: false,
  };
  first.tiles["2,1"].entranceKnownByEnemy = true;
  const second = Clone(first);
  second.tunnels["2,1"].sealed = true;
  assert.deepEqual(CreateSurfaceSnapshot(first), CreateSurfaceSnapshot(second));
  PlanEnemyTurn(first);
  PlanEnemyTurn(second);
  assert.deepEqual(
    first.enemies.find((enemy) => enemy.enemyId === "Sapper").intent,
    second.enemies.find((enemy) => enemy.enemyId === "Sapper").intent,
  );
});

Test("sapper moves two hexes only during the active sweep and still follows public evidence", () => {
  function PlannedDistance(sweepActive) {
    const state = CreateInitialState();
    state.turn = sweepActive ? 5 : 3;
    state.sweepActive = sweepActive;
    state.evidence = [{
      evidenceId: "PublicNoise",
      kind: "DigNoise",
      tileKey: "2,1",
      strength: 1,
      createdTurn: state.turn,
      expiresTurn: state.turn + 3,
    }];
    state.enemyMemory.confirmedEntrances = [];
    state.enemies.forEach((enemy) => {
      if (enemy.enemyId !== "Sapper") {
        enemy.health = 0;
      }
    });
    const sapper = state.enemies.find((enemy) => enemy.enemyId === "Sapper");
    sapper.inactiveUntilTurn = 0;
    sapper.tileKey = "5,0";
    PlanEnemyTurn(state);
    assert.equal(sapper.intent.evidenceId, "PublicNoise");
    return HexDistance("5,0", sapper.intent.targetKey);
  }
  assert.equal(PlannedDistance(false), 1);
  assert.equal(PlannedDistance(true), 2);
});

Test("seed deterministically breaks equal evidence ties without reading tunnel state", () => {
  function EvidenceTarget(seed) {
    const state = CreateInitialState({ seed });
    state.turn = 5;
    state.sweepActive = true;
    state.evidence = ["2,1", "0,5"].map((tileKey, index) => ({
      evidenceId: `Tie${index}`,
      kind: "DigNoise",
      tileKey,
      strength: 0.8,
      createdTurn: 5,
      expiresTurn: 8,
    }));
    state.enemyMemory.confirmedEntrances = [];
    state.enemies.forEach((enemy) => {
      if (enemy.enemyId !== "Sapper") {
        enemy.health = 0;
      }
    });
    const sapper = state.enemies.find((enemy) => enemy.enemyId === "Sapper");
    sapper.inactiveUntilTurn = 0;
    sapper.tileKey = "2,3";
    PlanEnemyTurn(state);
    return sapper.intent.evidenceTarget;
  }
  assert.equal(EvidenceTarget(2), EvidenceTarget(2));
  assert.notEqual(EvidenceTarget(2), EvidenceTarget(3));
});

Test("a consumed decoy cannot keep retargeting another enemy", () => {
  const state = CreateInitialState();
  state.turn = 5;
  state.sweepActive = true;
  state.evidence = [
    {
      evidenceId: "SpentDecoy",
      kind: "Decoy",
      tileKey: "4,3",
      strength: 1,
      createdTurn: 4,
      expiresTurn: 8,
    },
    {
      evidenceId: "FreshNoise",
      kind: "DigNoise",
      tileKey: "4,1",
      strength: 0.6,
      createdTurn: 5,
      expiresTurn: 8,
    },
  ];
  state.usedDecoyIds = ["SpentDecoy"];
  state.enemyMemory.confirmedEntrances = [];
  state.enemies.forEach((enemy) => {
    if (enemy.enemyId !== "Sapper") {
      enemy.health = 0;
    }
  });
  const sapper = state.enemies.find((enemy) => enemy.enemyId === "Sapper");
  sapper.inactiveUntilTurn = 0;
  PlanEnemyTurn(state);
  assert.equal(sapper.intent.evidenceId, "FreshNoise");
});

Test("a decoy spends one investigation action but cannot freeze later turns", () => {
  let state = CreateInitialState();
  state.units.forEach((unit) => {
    unit.layer = LayerIds.TUNNEL;
  });
  state.enemies.forEach((enemy) => {
    enemy.health = enemy.enemyId === "BridgePatrol" ? enemy.maxHealth : 0;
  });
  state.evidence = [{
    evidenceId: "SingleDiversion",
    kind: "Decoy",
    tileKey: "6,5",
    strength: 0.95,
    createdTurn: state.turn,
    expiresTurn: state.turn + 4,
  }];
  state.decoys = [{
    decoyId: "DecoySingleDiversion",
    evidenceId: "SingleDiversion",
    tileKey: "6,5",
    strength: 0.95,
    createdTurn: state.turn,
    expiresTurn: state.turn + 4,
  }];
  const bridgePatrol = state.enemies.find((enemy) => enemy.enemyId === "BridgePatrol");
  PlanEnemyTurn(state);
  assert.equal(bridgePatrol.intent.intentId, EnemyIntentIds.INVESTIGATE);
  assert.equal(bridgePatrol.intent.evidenceKind, "Decoy");
  const previousTileKey = bridgePatrol.tileKey;
  state = RunEnemyPhase(state);
  const divertedPatrol = state.enemies.find((enemy) => enemy.enemyId === "BridgePatrol");
  assert.notEqual(divertedPatrol.tileKey, previousTileKey);
  assert.equal(state.decoyDiversions, 1);
  assert.equal(state.decoys.length, 0);
  assert.equal(divertedPatrol.stunnedUntilTurn, 0);
  assert.notEqual(divertedPatrol.intent.intentId, EnemyIntentIds.STALLED);
});

Test("sapper ignores a stale emergency cellar and can confirm the searched village entrance", () => {
  const state = CreateInitialState();
  state.turn = 5;
  state.sweepActive = true;
  state.evidence = [];
  state.units.forEach((unit) => {
    unit.layer = LayerIds.TUNNEL;
  });
  state.enemies.forEach((enemy) => {
    if (enemy.enemyId !== "Sapper") {
      enemy.health = 0;
    }
  });
  const sapper = state.enemies.find((enemy) => enemy.enemyId === "Sapper");
  sapper.inactiveUntilTurn = 0;
  sapper.tileKey = "5,1";
  PlanEnemyTurn(state);
  assert.equal(sapper.intent.intentId, EnemyIntentIds.SEARCH);
  assert.notEqual(sapper.intent.targetKey, "3,2");
  const searched = RunEnemyPhase(state);
  assert.equal(searched.enemyMemory.confirmedEntrances.includes("6,2"), true);
  const nextIntent = searched.enemies.find((enemy) => enemy.enemyId === "Sapper").intent;
  assert.equal(nextIntent.intentId, EnemyIntentIds.PREPARE_SEAL);
  assert.equal(nextIntent.targetKey, "6,2");
});

Test("seal preparation telegraphs for a full turn and an entrance trap cancels resolution", () => {
  let state = CreateInitialState();
  state.turn = 5;
  state.sweepActive = true;
  state.tunnels["2,1"] = {
    ...Clone(state.tunnels["6,2"]),
    tileKey: "2,1",
    sealed: false,
  };
  state.enemyMemory.confirmedEntrances = ["2,1"];
  state.enemyMemory.knownEntranceStates = { "2,1": { sealed: false } };
  const sapper = state.enemies.find((enemy) => enemy.enemyId === "Sapper");
  sapper.inactiveUntilTurn = 0;
  sapper.tileKey = "3,1";
  PlanEnemyTurn(state);
  assert.equal(sapper.intent.intentId, "PrepareSeal");
  state = RunEnemyPhase(state);
  assert.equal(state.tunnels["2,1"].sealed, false);
  assert.equal(state.warnings.some((warning) => !warning.resolved && warning.kind === "Seal"), true);
  const militia = state.units.find((unit) => unit.unitId === "Militia");
  militia.layer = LayerIds.TUNNEL;
  militia.tileKey = "2,1";
  militia.actionPoints = 2;
  state = Apply(state, "Militia", ActionIds.TRAP);
  state = RunEnemyPhase(state);
  assert.equal(state.tunnels["2,1"].sealed, false);
  assert.equal(state.trapsTriggered, 1);
  assert.equal(state.warnings.every((warning) => warning.resolved), true);
});

Test("warning-bound traps and ambushes cannot be stolen by an unrelated patrol", () => {
  const trapped = RunReservedDefenseScenario(ActionIds.TRAP);
  const ambushed = RunReservedDefenseScenario(ActionIds.AMBUSH);
  for (const [state, counterKey] of [
    [trapped, "trapsTriggered"],
    [ambushed, "ambushesTriggered"],
  ]) {
    const patrol = state.enemies.find((enemy) => enemy.enemyId === "NorthPatrol");
    const sapper = state.enemies.find((enemy) => enemy.enemyId === "Sapper");
    assert.equal(patrol.tileKey, "2,1");
    assert.equal(patrol.health, patrol.maxHealth);
    assert.equal(sapper.health, sapper.maxHealth - 2);
    assert.equal(state.tunnels["2,1"].sealed, false);
    assert.equal(state[counterKey], 1);
    assert.equal(state.warnings.find((warning) => warning.warningId === "ReservedSeal").resolved, true);
  }
});

Test("an unreserved entrance defense still stops the first ordinary enemy entry", () => {
  let state = CreateInitialState();
  state.turn = 6;
  state.sweepActive = true;
  state.tunnels["2,1"] = {
    ...Clone(state.tunnels["6,2"]),
    tileKey: "2,1",
    sealed: false,
  };
  const patrol = state.enemies.find((enemy) => enemy.enemyId === "NorthPatrol");
  state.enemies.forEach((enemy) => {
    enemy.health = enemy.enemyId === patrol.enemyId ? enemy.maxHealth : 0;
  });
  patrol.tileKey = "3,1";
  patrol.intent = {
    intentId: EnemyIntentIds.INVESTIGATE,
    targetKey: "2,1",
    evidenceTarget: "2,1",
    evidenceId: "OrdinaryEntry",
    evidenceKind: "FreshTracks",
  };
  const militia = state.units.find((unit) => unit.unitId === "Militia");
  militia.layer = LayerIds.TUNNEL;
  militia.tileKey = "2,1";
  militia.actionPoints = 2;
  state = Apply(state, "Militia", ActionIds.TRAP);
  state = RunEnemyPhase(state);
  assert.equal(state.trapsTriggered, 1);
  assert.equal(state.enemies.find((enemy) => enemy.enemyId === patrol.enemyId).tileKey, "3,1");
  assert.equal(state.enemies.find((enemy) => enemy.enemyId === patrol.enemyId).health, 1);
});

Test("bracing resolves a collapse warning and doubles civilian tunnel throughput", () => {
  let state = CreateInitialState();
  state = Apply(state, "WorkTeam", ActionIds.ENTER_TUNNEL);
  state = Apply(state, "WorkTeam", ActionIds.DIG, "6,1");
  const warning = state.warnings.find((entry) => entry.kind === "Collapse");
  if (warning) {
    state = Apply(state, "WorkTeam", ActionIds.BRACE);
    assert.equal(state.warnings.find((entry) => entry.warningId === warning.warningId).resolved, true);
  }
  state.tunnels["5,3"] = {
    ...Clone(state.tunnels["6,2"]),
    tileKey: "5,3",
    braced: false,
  };
  state.tunnels["4,4"] = {
    ...Clone(state.tunnels["6,2"]),
    tileKey: "4,4",
    braced: false,
  };
  for (const group of state.civilians.slice(0, 2)) {
    group.status = "Moving";
    group.path = ["6,2", "5,3", "4,4"];
    group.pathIndex = 0;
    group.tileKey = "6,2";
    group.exitKey = "4,4";
  }
  const advanced = RunEnemyPhase(state);
  assert.equal(advanced.civilians[0].tileKey, "4,4");
  assert.equal(advanced.civilians[1].tileKey, "6,2");
  assert.equal(advanced.civilians[1].delayed, true);
});

Test("clay slows smoke by one segment and keeps civilians beyond it moving", () => {
  function ResolveTestSmoke(soilId) {
    const state = CreateInitialState();
    const tunnelKeys = ["3,2", "4,2", "5,2", "6,2", "7,1"];
    const nodeTemplate = Clone(state.tunnels["6,2"]);
    state.turn = 6;
    state.outcome = null;
    state.tunnels = Object.fromEntries(tunnelKeys.map((tileKey) => [
      tileKey,
      {
        ...Clone(nodeTemplate),
        tileKey,
        braced: false,
        cracked: false,
        collapsed: false,
        sealed: false,
        smoke: 0,
        isOriginal: false,
      },
    ]));
    state.tunnels["3,2"].sealed = true;
    state.tiles["4,2"].soilId = soilId;
    const sapper = Clone(state.enemies.find((enemy) => enemy.enemyId === "Sapper"));
    sapper.inactiveUntilTurn = 0;
    sapper.intent = {
      intentId: EnemyIntentIds.RESOLVE_SMOKE,
      targetKey: "3,2",
      warningId: "SmokeTest",
    };
    state.enemies = [sapper];
    state.warnings = [{
      warningId: "SmokeTest",
      kind: "Smoke",
      targetKey: "3,2",
      resolvesTurn: state.turn,
      resolved: false,
      enemyId: sapper.enemyId,
    }];
    state.enemyMemory.confirmedEntrances = ["3,2"];
    state.enemyMemory.knownEntranceStates = { "3,2": { sealed: true } };
    state.civilians = [{
      groupId: "TestGroup",
      name: "测试群众",
      people: 3,
      status: "Moving",
      tileKey: "7,1",
      path: ["7,1", "6,2"],
      pathIndex: 0,
      exitKey: "6,2",
      delayed: false,
    }];
    state.exitWindows["6,2"] = {
      exitKey: "6,2",
      checkedTurn: state.turn,
      checkedUntilTurn: state.turn + 2,
      signalCount: 1,
    };
    return RunEnemyPhase(state);
  }

  const clay = ResolveTestSmoke("clay");
  const packed = ResolveTestSmoke("packed");
  assert.equal(clay.tunnels["6,2"].smoke, 0);
  assert.equal(packed.tunnels["6,2"].smoke, 2);
  assert.equal(clay.civilians[0].status, "Safe");
  assert.equal(packed.civilians[0].status, "Moving");
  assert.equal(packed.civilians[0].delayed, true);
  assert.equal(packed.peopleSafety, clay.peopleSafety - 5);
});

Test("a moving civilian group cannot skip across an unbraced cracked segment", () => {
  let state = CreateInitialState();
  state.turn = 3;
  state.tunnels["4,1"] = {
    ...Clone(state.tunnels["6,2"]),
    tileKey: "4,1",
    braced: true,
  };
  state.tunnels["3,1"] = {
    ...Clone(state.tunnels["6,2"]),
    tileKey: "3,1",
    braced: false,
    cracked: true,
    collapsed: false,
    dugTurn: 1,
  };
  state.tunnels["2,1"] = {
    ...Clone(state.tunnels["6,2"]),
    tileKey: "2,1",
    braced: true,
  };
  const group = state.civilians[0];
  group.status = "Moving";
  group.path = ["4,1", "3,1", "2,1"];
  group.pathIndex = 0;
  group.tileKey = "4,1";
  group.exitKey = "2,1";
  state = RunEnemyPhase(state);
  assert.equal(state.tunnels["3,1"].collapsed, true);
  assert.equal(state.civilians[0].status, "Trapped");
});

Test("ambush ammunition is reserved at preparation and moving cancels the prepared tile", () => {
  let state = CreateInitialState();
  const militia = state.units.find((unit) => unit.unitId === "Militia");
  militia.layer = LayerIds.TUNNEL;
  militia.tileKey = "6,2";
  militia.actionPoints = 2;
  const ammoBefore = militia.ammo;
  state = Apply(state, "Militia", ActionIds.AMBUSH);
  assert.equal(state.units.find((unit) => unit.unitId === "Militia").ammo, ammoBefore - 1);
  assert.equal(GetAvailableActions(state, "Militia").includes(ActionIds.TRAP), false);
  state.tunnels["5,2"] = {
    ...Clone(state.tunnels["6,2"]),
    tileKey: "5,2",
  };
  state = Apply(state, "Militia", ActionIds.MOVE, "5,2");
  assert.equal(state.units.find((unit) => unit.unitId === "Militia").ambushPrepared, false);

  let timed = CreateInitialState();
  const timedMilitia = timed.units.find((unit) => unit.unitId === "Militia");
  timedMilitia.layer = LayerIds.TUNNEL;
  timedMilitia.tileKey = "6,2";
  timed = Apply(timed, "Militia", ActionIds.AMBUSH);
  timed = End(timed);
  timed = End(timed);
  assert.equal(timed.units.find((unit) => unit.unitId === "Militia").ambushPrepared, true);
  timed = End(timed);
  assert.equal(timed.units.find((unit) => unit.unitId === "Militia").ambushPrepared, false);
});

Test("north interdiction, south combined defense, and delayed ambush win differently", () => {
  const interdiction = RunNorthInterdictionBot();
  const deception = RunSouthDeceptionBot();
  const southWithoutDecoy = RunSouthDeceptionBot(false);
  const decoyOnly = RunSouthDeceptionBot(true, false);
  const ambush = RunAmbushBot();
  assert.equal(interdiction.outcome.status, "Victory");
  assert.equal(deception.outcome.status, "Victory");
  assert.equal(southWithoutDecoy.outcome.status, "Defeat");
  assert.equal(decoyOnly.outcome.status, "Defeat");
  assert.equal(ambush.outcome.status, "Victory");
  assert.equal(interdiction.outcome.path, "interdiction");
  assert.equal(deception.outcome.path, "deception");
  assert.equal(ambush.outcome.path, "ambush");
  assert.equal(interdiction.exitSignalsIssued >= 1, true);
  assert.equal(deception.exitSignalsIssued >= 2, true);
  assert.equal(ambush.exitSignalsIssued >= 2, true);
  assert.equal(interdiction.eventLedger.some((event) => /从北枣窖出洞/.test(event.text)), true);
  assert.equal(deception.eventLedger.some((event) => /从西南苇井出洞/.test(event.text)), true);
  assert.equal(deception.decoyDiversions > 0, true);
  assert.equal(deception.trapsTriggered > 0, true);
  assert.equal(deception.peopleSafety > southWithoutDecoy.peopleSafety, true);
  assert.equal(deception.turn < southWithoutDecoy.turn, true);
  assert.equal(deception.exposure < southWithoutDecoy.exposure, true);
  assert.equal(deception.organization, southWithoutDecoy.organization - 1);
  assert.equal(decoyOnly.trapsTriggered, 0);
  assert.equal(decoyOnly.civiliansSafe, 0);
  assert.match(decoyOnly.outcome.tip, /假迹已经消耗/);
  assert.doesNotMatch(decoyOnly.outcome.tip, /先诱敌/);
  assert.equal(ambush.ambushesTriggered > 0, true);
  assert.notDeepEqual(
    Object.keys(interdiction.tunnels).sort(),
    Object.keys(deception.tunnels).sort(),
  );
});

Test("a fixed opening decoy needs follow-up counterplay across mission seeds", () => {
  const seeds = Array.from({ length: 100 }, (_, index) => index + 1);
  const supportedDeceptionResults = seeds.map((seed) => (
    RunSouthDeceptionBot(true, true, seed)
  ));
  const pureTrapResults = seeds.map((seed) => (
    RunSouthDeceptionBot(false, true, seed)
  ));
  const decoyOnlyResults = seeds.map((seed) => (
    RunSouthDeceptionBot(true, false, seed)
  ));
  assert.equal(supportedDeceptionResults.every((state) => (
    state.outcome?.status === "Victory"
    && state.decoyDiversions > 0
    && state.trapsTriggered > 0
  )), true);
  assert.equal(pureTrapResults.some((state) => state.outcome?.status === "Defeat"), true);
  assert.equal(supportedDeceptionResults.every((state, index) => (
    state.exposure < pureTrapResults[index].exposure
  )), true);
  assert.equal(decoyOnlyResults.every((state) => (
    state.outcome?.status === "Defeat"
    && state.civiliansSafe === 0
    && state.trapsTriggered === 0
  )), true);
});

Test("public south-side digging noise breaks the fixed undefended eight-person script", () => {
  const results = Array.from({ length: 100 }, (_, index) => RunSouthAllGroupsBot(index + 1));
  assert.equal(results.every(({ pressureObserved }) => pressureObserved), true);
  assert.equal(results.every(({ state }) => !(
    state.outcome?.status === "Victory"
    && state.civiliansSafe === MissionConfig.totalEvacuees
    && state.peopleSafety === MissionConfig.startingPeopleSafety
  )), true);
});

Test("victory waits for every launched group and derives its safe-person count from group status", () => {
  const state = CreateInitialState();
  state.turn = 6;
  state.sweepActive = true;
  state.planningReconCompleted = true;
  state.reconActions = 1;
  state.tunnelsDug = 1;
  state.civilians[0].status = "Safe";
  state.civilians[2].status = "Safe";
  state.civilians[1].status = "Moving";
  state.civiliansSafe = 6;
  assert.equal(EvaluateMission(state), null);

  state.civilians[1].status = "Trapped";
  assert.equal(EvaluateMission(state), null);

  state.civilians[1].status = "Waiting";
  let outcome = EvaluateMission(state);
  assert.equal(outcome.status, "Victory");

  state.civilians[1].status = "Safe";
  assert.equal(EvaluateMission(state), null);
  state.civiliansSafe = 8;
  outcome = EvaluateMission(state);
  assert.equal(outcome.status, "Victory");
  assert.equal(
    state.civiliansSafe,
    state.civilians
      .filter((group) => group.status === "Safe")
      .reduce((sum, group) => sum + group.people, 0),
  );
});

Test("the old all-underground north script cannot coast to victory", () => {
  const idle = RunNorthIdleBot();
  assert.equal(idle.outcome.status, "Defeat");
  assert.equal(["ExitWindowMissed", "EvacuationLate"].includes(idle.outcome.failureId), true);
  assert.equal(idle.civiliansSafe, 0);
  assert.equal(idle.exitSignalsIssued, 0);
});

Test("waiting or combat without a tunnel cannot satisfy the mission", () => {
  let state = CreateInitialState();
  while (!state.outcome && state.turn <= 10) {
    state = AdvanceTurn(state);
  }
  assert.equal(state.outcome.status, "Defeat");
  assert.equal(state.civiliansSafe, 0);
  assert.equal(state.tunnelsDug, 0);
  assert.equal(state.outcome.path, "none");
});

Test("missing reconnaissance reports the actual gate instead of a false evacuation tip", () => {
  const state = CreateInitialState();
  state.turn = MissionConfig.maxTurns + 1;
  state.sweepActive = true;
  state.tunnelsDug = 4;
  state.civiliansSafe = 6;
  state.civilians[0].status = "Safe";
  state.civilians[2].status = "Safe";
  const outcome = EvaluateMission(state);
  assert.equal(outcome.failureId, "ReconMissing");
  assert.match(outcome.summary, /首次开挖前没有选择主出口完成走廊勘线/);
});

Test("exit reconnaissance after blind digging cannot replace planning reconnaissance", () => {
  let state = CreateInitialState();
  state = Apply(state, "WorkTeam", ActionIds.ENTER_TUNNEL);
  state = Apply(state, "WorkTeam", ActionIds.DIG, "5,3");
  state = Apply(state, "Scout", ActionIds.RECON, "5,3");
  assert.equal(state.reconActions, 1);
  assert.equal(state.planningReconCompleted, false);
  const legacyState = Clone(state);
  delete legacyState.planningReconCompleted;
  const migratedState = DeserializeState(JSON.stringify(legacyState));
  assert.equal(migratedState.planningReconCompleted, false);
  state.turn = MissionConfig.maxTurns + 1;
  state.sweepActive = true;
  state.civilians[0].status = "Safe";
  state.civilians[2].status = "Safe";
  state.civiliansSafe = 6;
  const outcome = EvaluateMission(state);
  assert.equal(outcome.failureId, "ReconMissing");
});

Test("civilian harm never creates tools, organization, intel, or ammunition", () => {
  const state = CreateInitialState();
  const resourcesBefore = {
    tools: state.tools,
    organization: state.organization,
    intel: state.intel,
    ammo: state.units.reduce((sum, unit) => sum + (unit.ammo ?? 0), 0),
  };
  state.peopleSafety = 42;
  const outcome = EvaluateMission(state);
  assert.equal(outcome.status, "Defeat");
  assert.deepEqual(
    {
      tools: state.tools,
      organization: state.organization,
      intel: state.intel,
      ammo: state.units.reduce((sum, unit) => sum + (unit.ammo ?? 0), 0),
    },
    resourcesBefore,
  );
});

Test("save data round-trips without losing the tunnel graph or enemy memory", () => {
  const state = RunNorthInterdictionBot();
  const restored = DeserializeState(SerializeState(state));
  assert.deepEqual(restored.tunnels, state.tunnels);
  assert.deepEqual(restored.enemyMemory, state.enemyMemory);
  assert.deepEqual(restored.exitWindows, state.exitWindows);
  assert.deepEqual(restored.reconTileTurns, state.reconTileTurns);
  assert.equal(restored.plannedExitKey, state.plannedExitKey);
  assert.deepEqual(restored.plannedFastPath, state.plannedFastPath);
  assert.deepEqual(restored.plannedQuietPath, state.plannedQuietPath);
  assert.equal(restored.outcome.path, "interdiction");
});

Test("HTML and game source wire Three.js, both layers, previews, and touch-safe input", () => {
  const html = readFileSync(new URL("./index.html", import.meta.url), "utf8");
  const gameSource = readFileSync(new URL("./Script_Game.mjs", import.meta.url), "utf8");
  const style = readFileSync(new URL("./Style_Game.css", import.meta.url), "utf8");
  assert.match(html, /three\.module\.mjs/);
  assert.match(html, /SurfaceLayerButton/);
  assert.match(html, /TunnelLayerButton/);
  assert.match(html, /PreviewPanel/);
  assert.match(html, /ExitWindowBoard/);
  assert.match(gameSource, /THREE\.Raycaster/);
  assert.match(gameSource, /pointerState\.moved/);
  assert.match(gameSource, /地表压制开窗路线/);
  assert.match(gameSource, /信号持续本回合与下一回合/);
  assert.match(gameSource, /主走廊勘线预览/);
  assert.match(gameSource, /候选出口 ·/);
  assert.match(gameSource, /plannedFastPath/);
  assert.match(gameSource, /divergenceIndex/);
  assert.match(gameSource, /data-exit-key/);
  assert.match(gameSource, /exitCardActionTargets/);
  assert.match(gameSource, /浪费当次行动改道，但不会额外停摆/);
  assert.match(gameSource, /1 AP｜预留弹药 1｜离开洞口不返还/);
  assert.match(gameSource, /锁定当前预警工兵，其他敌军不会抢先消耗/);
  assert.match(style, /touch-action:\s*none/);
  assert.match(style, /min-height:\s*44px/);
  assert.match(style, /\.exitWindowCard\.actionable/);
});

console.log(`\nTunnelFront1942 smoke test: ${passed} assertions passed.`);
