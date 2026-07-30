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
  ApplyPlayerActionPath,
  CollectEnemyObservations,
  CreateInitialState,
  CreateSurfaceSnapshot,
  DeserializeState,
  EnemyIntentIds,
  EvaluateMission,
  FindEvacuationPaths,
  FindTunnelPath,
  GetAttackTargets,
  GetActionPathPlans,
  GetAvailableActions,
  GetCivilianTransitEstimate,
  GetDecoyResponder,
  GetEvacuationTargets,
  GetExitWindow,
  GetMoveTargets,
  GetReconTargets,
  GetRouteSurvey,
  HexDistance,
  IsSoilKnown,
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

function AddTestTunnel(state, fromKey, tileKey, options = {}) {
  state.tunnels[tileKey] = {
    ...Clone(state.tunnels["6,2"]),
    tileKey,
    isOriginal: false,
    ...options,
  };
  const edgeId = [fromKey, tileKey].sort().join("|");
  if (!state.tunnelEdges.includes(edgeId)) {
    state.tunnelEdges.push(edgeId);
  }
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

function RunNorthInterdictionBot(
  seed = 19420501,
  groupOrder = ["Wounded", "Families", "Contacts"],
  refreshEverySignal = false,
) {
  let state = CreateInitialState({ seed });
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
  state = Apply(state, "WorkTeam", ActionIds.BRACE);
  state = Apply(state, "Militia", ActionIds.EVACUATE, "2,1", groupOrder[0]);
  state = Apply(state, "Guerrilla", ActionIds.MOVE, "2,1");
  state = Apply(state, "Scout", ActionIds.MOVE, "4,1");
  state = Apply(state, "Scout", ActionIds.MOVE, "3,1");
  state = End(state);

  state = Apply(state, "Militia", ActionIds.EVACUATE, "2,1", groupOrder[1]);
  state = Apply(state, "Scout", ActionIds.MOVE, "2,1");
  state = Apply(state, "Scout", ActionIds.EXIT_TUNNEL);
  state = End(state);

  state = Apply(state, "Scout", ActionIds.RECON, "2,1");
  state = Apply(state, "Militia", ActionIds.EVACUATE, "2,1", groupOrder[2]);
  state = Apply(state, "Militia", ActionIds.MOVE, "6,1");
  state = End(state);

  state = Apply(state, "Scout", ActionIds.ENTER_TUNNEL);
  state = Apply(state, "Militia", ActionIds.MOVE, "5,1");
  state = Apply(state, "Militia", ActionIds.MOVE, "4,1");
  state = Apply(state, "Guerrilla", ActionIds.EXIT_TUNNEL);
  let attackKey = GetAttackTargets(state, "Guerrilla")[0];
  assert.ok(attackKey, "the guerrilla must have a visible adjacent threat at the north exit");
  state = Apply(state, "Guerrilla", ActionIds.ATTACK, attackKey);
  state = End(state);
  if (state.outcome) {
    return state;
  }

  const guerrillaStep = GetMoveTargets(state, "Guerrilla")[0];
  assert.ok(guerrillaStep, "the guerrilla must clear the exit for the signal");
  state = Apply(state, "Guerrilla", ActionIds.MOVE, guerrillaStep);
  state = Apply(state, "Militia", ActionIds.MOVE, "3,1");
  state = Apply(state, "Militia", ActionIds.MOVE, "2,1");
  state = Apply(state, "Scout", ActionIds.EXIT_TUNNEL);
  state = Apply(state, "Scout", ActionIds.RECON, "2,1");
  state = End(state);
  while (!state.outcome && state.turn <= MissionConfig.maxTurns + 1) {
    if (
      refreshEverySignal
      && GetAvailableActions(state, "Scout").includes(ActionIds.RECON)
    ) {
      state = Apply(state, "Scout", ActionIds.RECON, "2,1");
    }
    state = End(state);
  }
  return state;
}

function RunNorthFamilyFirstBot(seed = 19420501) {
  return RunNorthInterdictionBot(
    seed,
    ["Families", "Wounded", "Contacts"],
    true,
  );
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
  state = Apply(state, "WorkTeam", ActionIds.BRACE);
  state = Apply(state, "Guerrilla", ActionIds.EVACUATE, "0,5", "Wounded");
  state = Apply(state, "Militia", ActionIds.MOVE, "2,4");
  state = Apply(state, "Militia", ActionIds.MOVE, "1,5");
  state = Apply(state, "Scout", ActionIds.MOVE, "3,4");
  state = Apply(state, "Scout", ActionIds.MOVE, "2,4");
  state = End(state);

  state = Apply(state, "Guerrilla", ActionIds.EVACUATE, "0,5", "Families");
  state = Apply(state, "Militia", ActionIds.MOVE, "0,5");
  if (useTrap) {
    state = Apply(state, "Militia", ActionIds.TRAP);
  }
  state = Apply(state, "Scout", ActionIds.MOVE, "1,5");
  state = Apply(state, "Scout", ActionIds.MOVE, "0,5");
  state = End(state);

  state = Apply(state, "Guerrilla", ActionIds.EVACUATE, "0,5", "Contacts");
  state = Apply(state, "Guerrilla", ActionIds.MOVE, "5,3");
  state = End(state);

  state = Apply(state, "Guerrilla", ActionIds.MOVE, "4,4");
  state = Apply(state, "Guerrilla", ActionIds.MOVE, "3,4");
  state = End(state);

  state = Apply(state, "Guerrilla", ActionIds.MOVE, "2,4");
  state = Apply(state, "Guerrilla", ActionIds.MOVE, "1,5");
  let southExitResult = ApplyPlayerAction(state, {
    unitId: "Scout",
    actionId: ActionIds.EXIT_TUNNEL,
  });
  while (!southExitResult.ok && state.turn < 10) {
    state = End(state);
    southExitResult = ApplyPlayerAction(state, {
      unitId: "Scout",
      actionId: ActionIds.EXIT_TUNNEL,
    });
  }
  assert.equal(southExitResult.ok, true, `the scout needs a surface window by T9: ${southExitResult.reason}`);
  state = southExitResult.state;
  state = Apply(state, "Scout", ActionIds.RECON, "0,5");
  state = End(state);
  assert.equal(
    state.exitWindows["0,5"].checkedUntilTurn,
    state.turn,
    JSON.stringify({ turn: state.turn, window: state.exitWindows["0,5"], log: state.log.slice(-5) }),
  );

  if (useDecoy && useTrap && !state.outcome) {
    if (state.units.find((unit) => unit.unitId === "Militia").tileKey !== "0,5") {
      state = Apply(state, "Militia", ActionIds.MOVE, "0,5");
    }
    if (!state.tunnels["0,5"].trap) {
      state = Apply(state, "Militia", ActionIds.TRAP);
    }
    state = End(state);
    if (!state.outcome) {
      state = Apply(state, "Scout", ActionIds.RECON, "0,5");
      if (!state.tunnels["0,5"].trap) {
        state = Apply(state, "Militia", ActionIds.TRAP);
      }
      state = End(state);
    }
  } else {
    state = End(state);
  }

  while (!state.outcome && state.turn <= MissionConfig.maxTurns + 1) {
    state = End(state);
  }
  return state;
}

function RunSouthContactsSecondBot(seed = 19420501) {
  let state = CreateInitialState({ seed });
  state = Apply(state, "Scout", ActionIds.RECON, "0,5");
  state = Apply(state, "WorkTeam", ActionIds.ENTER_TUNNEL);
  state = Apply(state, "WorkTeam", ActionIds.DIG, "5,3");
  state = Apply(state, "Militia", ActionIds.DECOY, "6,5");
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
  state = Apply(state, "WorkTeam", ActionIds.BRACE);
  state = Apply(state, "Guerrilla", ActionIds.EVACUATE, "0,5", "Wounded");
  state = Apply(state, "Militia", ActionIds.MOVE, "2,4");
  state = Apply(state, "Militia", ActionIds.MOVE, "1,5");
  state = Apply(state, "Scout", ActionIds.MOVE, "3,4");
  state = Apply(state, "Scout", ActionIds.MOVE, "2,4");
  state = End(state);

  state = Apply(state, "Guerrilla", ActionIds.EVACUATE, "0,5", "Contacts");
  state = Apply(state, "Militia", ActionIds.MOVE, "0,5");
  state = Apply(state, "Militia", ActionIds.TRAP);
  state = Apply(state, "Scout", ActionIds.MOVE, "1,5");
  state = Apply(state, "Scout", ActionIds.MOVE, "0,5");
  state = End(state);

  state = Apply(state, "Guerrilla", ActionIds.EVACUATE, "0,5", "Families");
  state = Apply(state, "Guerrilla", ActionIds.MOVE, "5,3");
  state = End(state);

  state = Apply(state, "Guerrilla", ActionIds.MOVE, "4,4");
  state = Apply(state, "Guerrilla", ActionIds.MOVE, "3,4");
  state = End(state);

  state = Apply(state, "Guerrilla", ActionIds.MOVE, "2,4");
  state = Apply(state, "Guerrilla", ActionIds.MOVE, "1,5");
  state = Apply(state, "Scout", ActionIds.EXIT_TUNNEL);
  state = Apply(state, "Scout", ActionIds.RECON, "0,5");
  state = End(state);

  if (!state.tunnels["0,5"].trap) {
    state = Apply(state, "Militia", ActionIds.TRAP);
  }
  state = End(state);

  state = Apply(state, "Scout", ActionIds.RECON, "0,5");
  state = Apply(state, "Scout", ActionIds.ENTER_TUNNEL);
  state = Apply(state, "Guerrilla", ActionIds.MOVE, "0,5");
  state = Apply(state, "Guerrilla", ActionIds.EXIT_TUNNEL);
  state = End(state);

  const northPatrol = state.enemies.find((enemy) => enemy.enemyId === "NorthPatrol");
  const blockingKey = northPatrol.intent?.targetKey ?? null;
  assert.ok(blockingKey);
  assert.equal(GetMoveTargets(state, "Guerrilla").includes(blockingKey), true);
  state = Apply(state, "Guerrilla", ActionIds.MOVE, blockingKey);
  state = End(state);
  while (!state.outcome && state.turn <= MissionConfig.maxTurns + 1) {
    state = End(state);
  }
  return { state, blockingKey };
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

function RunAmbushBot(seed = 19420501) {
  let state = CreateInitialState({ seed });
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
  state = Apply(state, "WorkTeam", ActionIds.BRACE);
  state = Apply(state, "Guerrilla", ActionIds.EVACUATE, "2,1", "Wounded");
  state = Apply(state, "Militia", ActionIds.MOVE, "4,1");
  state = Apply(state, "Militia", ActionIds.MOVE, "3,1");
  state = Apply(state, "Scout", ActionIds.MOVE, "4,1");
  state = Apply(state, "Scout", ActionIds.MOVE, "3,1");
  state = End(state);

  state = Apply(state, "Guerrilla", ActionIds.EVACUATE, "2,1", "Families");
  state = Apply(state, "Militia", ActionIds.MOVE, "2,1");
  state = Apply(state, "Militia", ActionIds.AMBUSH);
  state = Apply(state, "Scout", ActionIds.MOVE, "2,1");
  state = Apply(state, "Scout", ActionIds.EXIT_TUNNEL);
  state = End(state);

  state = Apply(state, "Scout", ActionIds.RECON, "2,1");
  state = Apply(state, "Scout", ActionIds.ENTER_TUNNEL);
  state = Apply(state, "Guerrilla", ActionIds.EVACUATE, "2,1", "Contacts");
  state = Apply(state, "Guerrilla", ActionIds.EXIT_TUNNEL);
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
  state = Apply(state, "WorkTeam", ActionIds.BRACE);
  state = Apply(state, "Militia", ActionIds.EVACUATE, "2,1", "Wounded");
  state = End(state);
  state = Apply(state, "Militia", ActionIds.EVACUATE, "2,1", "Families");
  state = End(state);
  state = Apply(state, "Militia", ActionIds.EVACUATE, "2,1", "Contacts");
  state = End(state);
  while (!state.outcome && state.turn <= MissionConfig.maxTurns + 1) {
    state = End(state);
  }
  return state;
}

const northEvacuationPath = ["6,2", "6,1", "5,1", "4,1", "3,1", "2,1"];
const southEvacuationPath = ["6,2", "5,3", "4,4", "3,4", "2,4", "1,5", "0,5"];

function CreateLogisticsState(bracedExit = false) {
  const state = CreateInitialState();
  const nodeTemplate = Clone(state.tunnels["6,2"]);
  state.turn = MissionConfig.evacuationTurn;
  state.sweepActive = true;
  state.planningReconCompleted = true;
  state.plannedExitKey = "2,1";
  state.tunnelsDug = northEvacuationPath.length - 1;
  state.organization = 99;
  state.outcome = null;
  state.enemies.forEach((enemy) => {
    enemy.health = 0;
    enemy.intent = null;
  });
  state.tunnels = Object.fromEntries(northEvacuationPath.map((tileKey, index) => [
    tileKey,
    {
      ...Clone(nodeTemplate),
      tileKey,
      braced: index === 0 || (bracedExit && tileKey === "2,1"),
      cracked: false,
      collapsed: false,
      sealed: false,
      smoke: 0,
      trap: false,
      dugTurn: 1,
      isOriginal: index === 0,
    },
  ]));
  state.exitWindows["2,1"] = {
    exitKey: "2,1",
    checkedTurn: state.turn,
    checkedUntilTurn: 20,
    signalCount: 1,
  };
  const militia = state.units.find((unit) => unit.unitId === "Militia");
  militia.layer = LayerIds.TUNNEL;
  militia.tileKey = "6,2";
  militia.actionPoints = militia.maxActionPoints;
  return state;
}

function CreateDualRouteLogisticsState() {
  const state = CreateLogisticsState(false);
  const nodeTemplate = Clone(state.tunnels["6,2"]);
  for (const tileKey of southEvacuationPath.slice(1)) {
    state.tunnels[tileKey] = {
      ...Clone(nodeTemplate),
      tileKey,
      braced: false,
      cracked: false,
      collapsed: false,
      sealed: false,
      smoke: 0,
      trap: false,
      dugTurn: 1,
      isOriginal: false,
    };
  }
  state.exitWindows["0,5"] = {
    exitKey: "0,5",
    checkedTurn: state.turn,
    checkedUntilTurn: 20,
    signalCount: 1,
  };
  return state;
}

function RunCivilianOrder(groupIds, bracedExit = false) {
  let state = CreateLogisticsState(bracedExit);
  const timeline = [];
  for (const groupId of groupIds) {
    state = Apply(state, "Militia", ActionIds.EVACUATE, "2,1", groupId);
    state = End(state);
    timeline.push({ turn: state.turn - 1, safePeople: state.civiliansSafe });
  }
  while (!state.outcome && state.turn <= MissionConfig.maxTurns + 1) {
    state = End(state);
    timeline.push({ turn: state.turn - 1, safePeople: state.civiliansSafe });
  }
  const firstSafe = timeline.find((entry) => entry.safePeople > 0) ?? null;
  return {
    state,
    timeline,
    firstSafe,
    delaySignature: state.civilians
      .map((group) => `${group.groupId}:${group.trafficDelays ?? 0}`)
      .join("|"),
  };
}

function SafetyAfterFirstLaunch(groupId) {
  let state = CreateLogisticsState(false);
  const pressureEnemy = state.enemies.find((enemy) => enemy.enemyId === "NorthPatrol");
  pressureEnemy.health = pressureEnemy.maxHealth;
  pressureEnemy.tileKey = "5,2";
  pressureEnemy.intent = null;
  state = Apply(state, "Militia", ActionIds.EVACUATE, "2,1", groupId);
  return End(state).peopleSafety;
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
  assert.equal(
    north.plannedCorridorKeys.every((tileKey) => IsSoilKnown(north, tileKey)),
    true,
  );
  assert.equal(
    Object.values(north.tiles).some((tile) => (
      !north.plannedCorridorKeys.includes(tile.tileKey) && !IsSoilKnown(north, tile.tileKey)
    )),
    true,
  );
  assert.notDeepEqual(north.plannedFastPath, south.plannedFastPath);
  assert.notDeepEqual(north.plannedQuietPath, south.plannedQuietPath);
  assert.equal(northSurvey.fast.segments < southSurvey.fast.segments, true);
  assert.equal(northSurvey.fast.noise > southSurvey.fast.noise, true);
  assert.equal(northSurvey.nearestThreat.enemyId, "NorthPatrol");
  assert.equal(southSurvey.nearestThreat.enemyId, "BridgePatrol");
  assert.equal(north.exitSignalsIssued, 0);
  assert.match(north.log.at(-1).text, /快掘.*静掘.*主出口接通前/);

  const northDigger = north.units.find((unit) => unit.unitId === "WorkTeam");
  northDigger.layer = LayerIds.TUNNEL;
  northDigger.actionPoints = 2;
  const continuousDigPlans = GetActionPathPlans(north, "WorkTeam", ActionIds.DIG)
    .filter((plan) => plan.steps > 1);
  assert.equal(continuousDigPlans.length > 0, true);
  assert.equal(continuousDigPlans.every((plan) => (
    plan.targetKeys.every((tileKey) => IsSoilKnown(north, tileKey))
  )), true);
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
  group.moveSteps = 2;

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

Test("current-turn move paths are pure and exactly replay authoritative steps", () => {
  const state = CreateInitialState();
  const untouched = Clone(state);
  const plans = GetActionPathPlans(state, "Scout", ActionIds.MOVE);
  assert.deepEqual(state, untouched);
  const plan = plans.find((entry) => entry.targetKey === "5,5");
  assert.deepEqual(plan.targetKeys, ["5,4", "5,5"]);
  assert.equal(plan.steps, 2);
  const batch = ApplyPlayerActionPath(state, {
    unitId: "Scout",
    actionId: ActionIds.MOVE,
    targetKeys: plan.targetKeys,
  });
  assert.equal(batch.ok, true);
  let manual = Apply(state, "Scout", ActionIds.MOVE, "5,4");
  manual = Apply(manual, "Scout", ActionIds.MOVE, "5,5");
  assert.deepEqual(batch.state, manual);
  assert.equal(batch.state.turn, state.turn);
  assert.equal(batch.state.phase, "Player");
  assert.equal(SerializeState(batch.state).includes('"targetKeys"'), false);
});

Test("move paths cannot skip costly terrain, occupied cells, or a decision stop", () => {
  let state = CreateInitialState();
  const scout = state.units.find((unit) => unit.unitId === "Scout");
  scout.tileKey = "1,3";
  scout.actionPoints = 2;
  state.enemies.forEach((enemy) => {
    enemy.health = 0;
  });
  const untouched = Clone(state);
  const costly = ApplyPlayerActionPath(state, {
    unitId: "Scout",
    actionId: ActionIds.MOVE,
    targetKeys: ["1,4", "1,5"],
  });
  assert.equal(costly.ok, false);
  assert.deepEqual(costly.state, untouched);

  state = CreateInitialState();
  state.enemies.find((enemy) => enemy.enemyId === "BridgePatrol").tileKey = "5,4";
  const occupied = ApplyPlayerActionPath(state, {
    unitId: "Scout",
    actionId: ActionIds.MOVE,
    targetKeys: ["5,4", "5,5"],
  });
  assert.equal(occupied.ok, false);
  assert.deepEqual(occupied.state, state);

  state = CreateInitialState();
  const sighted = ApplyPlayerActionPath(state, {
    unitId: "Scout",
    actionId: ActionIds.MOVE,
    targetKeys: ["4,4", "3,4"],
  });
  assert.equal(sighted.ok, false);
  assert.match(sighted.reason, /敌军视线/);
  assert.deepEqual(sighted.state, state);
});

Test("current-turn dig paths preserve every tool, noise, warning, and log mutation", () => {
  const state = CreateInitialState();
  const digger = state.units.find((unit) => unit.unitId === "WorkTeam");
  digger.layer = LayerIds.TUNNEL;
  digger.actionPoints = 2;
  state.tiles["5,3"].soilRevealed = true;
  state.tiles["4,4"].soilRevealed = true;
  const plans = GetActionPathPlans(state, "WorkTeam", ActionIds.DIG);
  const plan = plans.find((entry) => entry.targetKey === "4,4");
  assert.deepEqual(plan.targetKeys, ["5,3", "4,4"]);
  const batch = ApplyPlayerActionPath(state, {
    unitId: "WorkTeam",
    actionId: ActionIds.DIG,
    targetKeys: plan.targetKeys,
  });
  assert.equal(batch.ok, true);
  let manual = Apply(state, "WorkTeam", ActionIds.DIG, "5,3");
  manual = Apply(manual, "WorkTeam", ActionIds.DIG, "4,4");
  assert.deepEqual(batch.state, manual);
  assert.equal(batch.state.tunnelsDug, state.tunnelsDug + 2);
  assert.deepEqual(
    batch.plan.evidenceAdded.map((evidence) => [evidence.kind, evidence.tileKey]),
    [["DigNoise", "5,3"], ["DigNoise", "4,4"]],
  );
  assert.equal(batch.plan.toolsCost, 2);
});

Test("CLI path discovery may expose explicit branch routes without making UI endpoints ambiguous", () => {
  const state = CreateInitialState();
  const digger = state.units.find((unit) => unit.unitId === "WorkTeam");
  digger.layer = LayerIds.TUNNEL;
  digger.actionPoints = 2;
  state.plannedCorridorKeys = Object.keys(state.tiles);
  const interfacePlans = GetActionPathPlans(state, "WorkTeam", ActionIds.DIG);
  assert.equal(interfacePlans.some((plan) => plan.targetKey === "4,3"), false);
  const explicitPlans = GetActionPathPlans(state, "WorkTeam", ActionIds.DIG, {
    includeAmbiguous: true,
  }).filter((plan) => plan.targetKey === "4,3");
  assert.deepEqual(
    explicitPlans.map((plan) => plan.targetKeys),
    [["5,2", "4,3"], ["5,3", "4,3"]],
  );
  assert.equal(explicitPlans.every((plan) => ApplyPlayerActionPath(state, {
    unitId: "WorkTeam",
    actionId: ActionIds.DIG,
    targetKeys: plan.targetKeys,
  }).ok), true);
});

Test("dig paths reject unknown, unaffordable, or post-crack continuation atomically", () => {
  let state = CreateInitialState();
  let digger = state.units.find((unit) => unit.unitId === "WorkTeam");
  digger.layer = LayerIds.TUNNEL;
  digger.actionPoints = 2;
  let result = ApplyPlayerActionPath(state, {
    unitId: "WorkTeam",
    actionId: ActionIds.DIG,
    targetKeys: ["5,3", "4,4"],
  });
  assert.equal(result.ok, false);
  assert.match(result.reason, /土层尚未侦明/);
  assert.deepEqual(result.state, state);

  state = CreateInitialState();
  digger = state.units.find((unit) => unit.unitId === "WorkTeam");
  digger.layer = LayerIds.TUNNEL;
  digger.actionPoints = 2;
  state.tiles["5,3"].soilRevealed = true;
  state.tiles["4,4"].soilRevealed = true;
  state.tools = 1;
  result = ApplyPlayerActionPath(state, {
    unitId: "WorkTeam",
    actionId: ActionIds.DIG,
    targetKeys: ["5,3", "4,4"],
  });
  assert.equal(result.ok, false);
  assert.deepEqual(result.state, state);

  state = CreateInitialState();
  digger = state.units.find((unit) => unit.unitId === "WorkTeam");
  digger.layer = LayerIds.TUNNEL;
  digger.actionPoints = 3;
  for (const tileKey of ["5,3", "5,4", "4,4"]) {
    state.tiles[tileKey].soilRevealed = true;
  }
  result = ApplyPlayerActionPath(state, {
    unitId: "WorkTeam",
    actionId: ActionIds.DIG,
    targetKeys: ["5,3", "5,4", "4,4"],
  });
  assert.equal(result.ok, false);
  assert.match(result.reason, /新挖这一段下回合将开裂/);
  assert.deepEqual(result.state, state);
  const stopAtCrack = ApplyPlayerActionPath(state, {
    unitId: "WorkTeam",
    actionId: ActionIds.DIG,
    targetKeys: ["5,3", "5,4"],
  });
  assert.equal(stopAtCrack.ok, true);
  assert.match(stopAtCrack.plan.decisionStop, /新挖这一段下回合将开裂/);
  assert.equal(stopAtCrack.state.warnings.some((warning) => (
    warning.kind === "Collapse" && warning.targetKey === "5,4"
  )), true);
});

Test("path execution stops before hiding smoke damage or an ambush cancellation", () => {
  let state = CreateInitialState();
  let scout = state.units.find((unit) => unit.unitId === "Scout");
  scout.layer = LayerIds.TUNNEL;
  scout.tileKey = "6,2";
  scout.actionPoints = 2;
  AddTestTunnel(state, "6,2", "5,3", { smoke: 2 });
  AddTestTunnel(state, "5,3", "4,4");
  let result = ApplyPlayerActionPath(state, {
    unitId: "Scout",
    actionId: ActionIds.MOVE,
    targetKeys: ["5,3", "4,4"],
  });
  assert.equal(result.ok, false);
  assert.match(result.reason, /烟段/);
  assert.deepEqual(result.state, state);
  const smokeStep = ApplyPlayerActionPath(state, {
    unitId: "Scout",
    actionId: ActionIds.MOVE,
    targetKeys: ["5,3"],
  });
  assert.equal(smokeStep.ok, true);
  assert.equal(smokeStep.plan.healthLoss, 1);

  state.units.find((unit) => unit.unitId === "Scout").health = 1;
  result = ApplyPlayerActionPath(state, {
    unitId: "Scout",
    actionId: ActionIds.MOVE,
    targetKeys: ["5,3", "4,4"],
  });
  assert.equal(result.ok, false);
  assert.match(result.reason, /烟段/);
  assert.deepEqual(result.state, state);
  const minimumHealthSmokeStep = ApplyPlayerActionPath(state, {
    unitId: "Scout",
    actionId: ActionIds.MOVE,
    targetKeys: ["5,3"],
  });
  assert.equal(minimumHealthSmokeStep.ok, true);
  assert.equal(minimumHealthSmokeStep.state.units.find((unit) => unit.unitId === "Scout").health, 1);
  assert.match(minimumHealthSmokeStep.plan.decisionStop, /烟段/);

  state = CreateInitialState();
  const militia = state.units.find((unit) => unit.unitId === "Militia");
  militia.layer = LayerIds.TUNNEL;
  militia.tileKey = "6,2";
  militia.actionPoints = 2;
  militia.ambushPrepared = true;
  militia.ambushTileKey = "6,2";
  AddTestTunnel(state, "6,2", "5,3");
  AddTestTunnel(state, "5,3", "4,4");
  result = ApplyPlayerActionPath(state, {
    unitId: "Militia",
    actionId: ActionIds.MOVE,
    targetKeys: ["5,3", "4,4"],
  });
  assert.equal(result.ok, false);
  assert.match(result.reason, /取消伏击/);
  assert.deepEqual(result.state, state);
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

Test("decoy responders are deterministic across enemy array order and match the eventual investigator", () => {
  for (let seed = 1; seed <= 100; seed += 1) {
    const state = CreateInitialState({ seed });
    state.units.forEach((unit) => {
      unit.layer = LayerIds.TUNNEL;
    });
    state.enemies.forEach((enemy) => {
      enemy.inactiveUntilTurn = 0;
      enemy.stunnedUntilTurn = 0;
      enemy.intent = null;
    });
    const expected = GetDecoyResponder(state, "4,3")?.enemyId;
    assert.ok(expected);
    const reversed = Clone(state);
    reversed.enemies.reverse();
    const rotated = Clone(state);
    rotated.enemies.push(rotated.enemies.shift());
    assert.equal(GetDecoyResponder(reversed, "4,3")?.enemyId, expected);
    assert.equal(GetDecoyResponder(rotated, "4,3")?.enemyId, expected);
  }

  let state = CreateInitialState({ seed: 17 });
  const responder = GetDecoyResponder(state, "6,5");
  assert.ok(responder);
  state = Apply(state, "Militia", ActionIds.DECOY, "6,5");
  const evidence = state.evidence.find((entry) => entry.kind === "Decoy");
  assert.equal(evidence.claimedEnemyId, responder.enemyId);
  state.enemies.reverse();
  PlanEnemyTurn(state);
  const investigator = state.enemies.find((enemy) => enemy.intent?.evidenceId === evidence.evidenceId);
  assert.equal(investigator.enemyId, responder.enemyId);
  state = RunEnemyPhase(state);
  assert.equal(state.decoyDiversions, 1);
  assert.equal(state.eventLedger.some((event) => event.text.includes(responder.name)), true);
});

Test("a decoy with no feasible responder is visibly allowed to expire without diversion", () => {
  let state = CreateInitialState();
  state.enemies.forEach((enemy) => {
    enemy.health = 0;
    enemy.intent = null;
  });
  assert.equal(GetDecoyResponder(state, "6,5"), null);
  state = Apply(state, "Militia", ActionIds.DECOY, "6,5");
  const evidence = state.evidence.find((entry) => entry.kind === "Decoy");
  assert.equal(evidence.claimedEnemyId, null);
  PlanEnemyTurn(state);
  assert.equal(state.enemies.some((enemy) => enemy.intent?.evidenceKind === "Decoy"), false);
  for (let index = 0; index < 5; index += 1) {
    state = RunEnemyPhase(state);
  }
  assert.equal(state.decoyDiversions, 0);
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

Test("a warning-bound trap can stop that same enemy's adjacent attack without erasing the warning", () => {
  let state = CreateInitialState();
  state.turn = 8;
  state.sweepActive = true;
  state.tunnels["2,1"] = {
    ...Clone(state.tunnels["6,2"]),
    tileKey: "2,1",
    braced: true,
    trap: false,
  };
  const militia = state.units.find((unit) => unit.unitId === "Militia");
  militia.layer = LayerIds.TUNNEL;
  militia.tileKey = "2,1";
  militia.actionPoints = 2;
  state = Apply(state, "Militia", ActionIds.TRAP);
  const sapper = state.enemies.find((enemy) => enemy.enemyId === "Sapper");
  state.enemies.forEach((enemy) => {
    enemy.health = enemy.enemyId === sapper.enemyId ? enemy.maxHealth : 0;
    enemy.intent = null;
  });
  sapper.inactiveUntilTurn = 0;
  sapper.tileKey = "3,1";
  sapper.intent = {
    intentId: EnemyIntentIds.PREPARE_SEAL,
    targetKey: "2,1",
  };
  state = RunEnemyPhase(state);
  const warning = state.warnings.find((entry) => !entry.resolved && entry.enemyId === "Sapper");
  assert.ok(warning);
  assert.equal(state.tunnels["2,1"].trapEnemyId, "Sapper");
  const scout = state.units.find((unit) => unit.unitId === "Scout");
  scout.layer = LayerIds.SURFACE;
  scout.tileKey = "2,1";
  const scoutHealth = scout.health;
  state.enemies.find((enemy) => enemy.enemyId === "Sapper").intent = {
    intentId: EnemyIntentIds.ATTACK,
    targetKey: "2,1",
    unitId: "Scout",
  };
  state = RunEnemyPhase(state);
  assert.equal(state.trapsTriggered, 1);
  assert.equal(state.units.find((unit) => unit.unitId === "Scout").health, scoutHealth);
  assert.equal(state.warnings.find((entry) => entry.warningId === warning.warningId).resolved, false);
  const trapEvent = state.eventLedger.find((event) => /原封洞\/灌烟预警仍待处理/.test(event.text));
  assert.equal(trapEvent?.relatedWarningId, warning.warningId);
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
  assert.equal(state.eventLedger.some((event) => /本次攻击/.test(event.text)), false);
});

Test("bracing resolves collapse warnings and lets a light convoy share a heavy chokepoint", () => {
  let state = CreateInitialState();
  state = Apply(state, "WorkTeam", ActionIds.ENTER_TUNNEL);
  state = Apply(state, "WorkTeam", ActionIds.DIG, "6,1");
  const warning = state.warnings.find((entry) => entry.kind === "Collapse");
  if (warning) {
    state = Apply(state, "WorkTeam", ActionIds.BRACE);
    assert.equal(state.warnings.find((entry) => entry.warningId === warning.warningId).resolved, true);
  }
  function RunChokepoint(braced) {
    const convoy = CreateInitialState();
    convoy.enemies.forEach((enemy) => {
      enemy.health = 0;
    });
    convoy.tunnels["5,3"] = {
      ...Clone(convoy.tunnels["6,2"]),
      tileKey: "5,3",
      braced,
    };
    for (const [index, group] of convoy.civilians.slice(0, 2).entries()) {
      group.status = "Moving";
      group.path = ["6,2", "5,3"];
      group.pathIndex = 0;
      group.tileKey = "6,2";
      group.exitKey = "5,3";
      group.launchOrder = index + 1;
    }
    return RunEnemyPhase(convoy);
  }
  const unbraced = RunChokepoint(false);
  assert.equal(unbraced.civilians[0].tileKey, "5,3");
  assert.equal(unbraced.civilians[1].tileKey, "6,2");
  assert.equal(unbraced.civilians[1].delayed, true);
  const braced = RunChokepoint(true);
  assert.equal(braced.civilians[0].tileKey, "5,3");
  assert.equal(braced.civilians[1].tileKey, "5,3");
});

Test("all six launch orders create distinct timing or congestion signatures with valid first-batch reasons", () => {
  const orders = [
    ["Wounded", "Families", "Contacts"],
    ["Wounded", "Contacts", "Families"],
    ["Families", "Wounded", "Contacts"],
    ["Families", "Contacts", "Wounded"],
    ["Contacts", "Wounded", "Families"],
    ["Contacts", "Families", "Wounded"],
  ];
  const results = orders.map((order) => RunCivilianOrder(order));
  assert.equal(results.every(({ state }) => state.outcome?.status === "Victory"), true);
  const signatures = new Set(results.map(({ state, timeline, delaySignature }) => (
    `${state.turn}|${delaySignature}|${timeline.map((entry) => entry.safePeople).join(",")}`
  )));
  assert.equal(signatures.size >= 3, true);

  const woundedFirst = results[0];
  const familiesFirst = results[2];
  const contactsFirst = results[4];
  const bracedWoundedFirst = RunCivilianOrder(orders[0], true);
  assert.equal(bracedWoundedFirst.state.turn < woundedFirst.state.turn, true);
  assert.equal(familiesFirst.firstSafe.turn < woundedFirst.firstSafe.turn, true);
  assert.equal(contactsFirst.firstSafe.turn < familiesFirst.firstSafe.turn, true);
  assert.equal(contactsFirst.firstSafe.safePeople, 3);
  assert.equal(SafetyAfterFirstLaunch("Families") > SafetyAfterFirstLaunch("Contacts"), true);
  assert.equal(SafetyAfterFirstLaunch("Families") > SafetyAfterFirstLaunch("Wounded"), true);

  const estimateState = CreateLogisticsState(false);
  assert.equal(GetCivilianTransitEstimate(estimateState, "Wounded", "2,1").readyTurn, 9);
  assert.equal(GetCivilianTransitEstimate(estimateState, "Families", "2,1").readyTurn, 6);
  assert.equal(GetCivilianTransitEstimate(estimateState, "Contacts", "2,1").readyTurn, 5);
});

Test("queue forecasts match real movement without solving future enemy pressure", () => {
  function ActualReadyTurn(inputState, groupId, launchExitKey = "2,1") {
    let state = Apply(
      inputState,
      "Militia",
      ActionIds.EVACUATE,
      launchExitKey,
      groupId,
    );
    while (state.civilians.find((group) => group.groupId === groupId).status !== "Safe") {
      const phaseTurn = state.turn;
      state = End(state);
      if (state.civilians.find((group) => group.groupId === groupId).status === "Safe") {
        return { phaseTurn, state };
      }
      assert.equal(state.turn <= MissionConfig.maxTurns + 3, true);
    }
    throw new Error(`${groupId} was already safe before forecast verification`);
  }

  function ActualInjectedReadyTurn(inputState, groupId, launchExitKey) {
    let state = Clone(inputState);
    const route = FindEvacuationPaths(state)
      .find((entry) => entry.exitKey === launchExitKey);
    const group = state.civilians
      .find((entry) => entry.groupId === groupId && entry.status === "Waiting");
    assert.ok(route);
    assert.ok(group);
    group.status = "Moving";
    group.path = [...route.path];
    group.pathIndex = 0;
    group.tileKey = route.path[0];
    group.exitKey = launchExitKey;
    group.launchTurn = state.turn;
    group.launchOrder = state.civilianLaunchSerial;
    group.trafficDelays = 0;
    group.lastTrafficDelayTileKey = null;
    group.exitArrivalTurn = null;
    state.civilianLaunchSerial += 1;
    while (group.status !== "Safe") {
      const phaseTurn = state.turn;
      state = RunEnemyPhase(state);
      const updatedGroup = state.civilians.find((entry) => entry.groupId === groupId);
      if (updatedGroup.status === "Safe") {
        return { phaseTurn, state };
      }
      assert.equal(state.turn <= MissionConfig.maxTurns + 3, true);
    }
    throw new Error(`${groupId} was already safe before injected forecast verification`);
  }

  let queueState = CreateLogisticsState(false);
  const pristineState = Clone(queueState);
  const baseline = GetCivilianTransitEstimate(queueState, "Wounded", "2,1");
  assert.deepEqual(queueState, pristineState);
  assert.deepEqual(GetCivilianTransitEstimate(queueState, "Wounded", "2,1"), baseline);
  assert.equal(baseline.queueOrder, 1);
  assert.equal(baseline.readyTurn, 9);
  assert.equal(baseline.soloReadyTurn, 9);
  assert.equal(baseline.congestionTurns, 0);
  assert.equal(baseline.etaDelayTurns, 0);
  assert.equal(baseline.signalCoverage, "Covered");
  assert.equal(Object.hasOwn(baseline, "projectedSafeTurn"), false);
  assert.equal(Object.hasOwn(baseline, "earliestSafeTurn"), false);
  assert.equal(Object.hasOwn(baseline, "idealSafeTurn"), false);

  const dissipatingSmoke = CreateLogisticsState(false);
  dissipatingSmoke.tunnels["2,1"].smoke = 2;
  const dissipatingEstimate = GetCivilianTransitEstimate(
    dissipatingSmoke,
    "Wounded",
    "2,1",
  );
  assert.equal(GetExitWindow(dissipatingSmoke, "2,1").status, "Smoking");
  assert.equal(dissipatingEstimate.signalCoverage, "Covered");
  assert.equal(dissipatingEstimate.signalStatusAtReady, "Clear");
  assert.equal(
    ActualReadyTurn(dissipatingSmoke, "Wounded").phaseTurn,
    dissipatingEstimate.readyTurn,
  );

  let recoveringThreat = CreateLogisticsState(false);
  const recoveringPatrol = recoveringThreat.enemies
    .find((enemy) => enemy.enemyId === "NorthPatrol");
  recoveringPatrol.health = recoveringPatrol.maxHealth;
  recoveringPatrol.tileKey = "2,2";
  recoveringPatrol.intent = null;
  recoveringPatrol.inactiveUntilTurn = 99;
  recoveringPatrol.stunnedUntilTurn = recoveringThreat.turn;
  const recoveringEstimate = GetCivilianTransitEstimate(
    recoveringThreat,
    "Wounded",
    "2,1",
  );
  assert.equal(GetExitWindow(recoveringThreat, "2,1").status, "Clear");
  assert.equal(recoveringEstimate.signalCoverage, "MissingOrBlocked");
  assert.equal(recoveringEstimate.signalStatusAtReady, "Watched");
  recoveringThreat = Apply(
    recoveringThreat,
    "Militia",
    ActionIds.EVACUATE,
    "2,1",
    "Wounded",
  );
  while (recoveringThreat.turn <= recoveringEstimate.readyTurn) {
    recoveringThreat = End(recoveringThreat);
  }
  const threatenedWounded = recoveringThreat.civilians
    .find((group) => group.groupId === "Wounded");
  assert.equal(threatenedWounded.status, "Moving");
  assert.equal(threatenedWounded.waitingForSignal, true);

  queueState = Apply(queueState, "Militia", ActionIds.EVACUATE, "2,1", "Wounded");
  assert.equal(GetCivilianTransitEstimate(queueState, "Wounded", "2,1"), null);
  queueState = End(queueState);
  const familiesEstimate = GetCivilianTransitEstimate(queueState, "Families", "2,1");
  assert.equal(familiesEstimate.queueOrder, 2);
  assert.equal(familiesEstimate.soloReadyTurn, 7);
  assert.equal(familiesEstimate.readyTurn, 9);
  assert.equal(familiesEstimate.congestionTurns, 4);
  assert.equal(familiesEstimate.etaDelayTurns, 2);
  assert.equal(familiesEstimate.bottleneckKey, "5,1");
  assert.equal(familiesEstimate.bottleneckUsedLoad, 2);
  assert.equal(familiesEstimate.trafficLoad, 1);
  assert.equal(familiesEstimate.bottleneckCapacity, 2);
  assert.deepEqual(familiesEstimate.conflictingGroupIds, ["Wounded"]);
  assert.equal(familiesEstimate.firstBottleneckBraceRelief, "Helps");
  assert.equal(ActualReadyTurn(queueState, "Families").phaseTurn, familiesEstimate.readyTurn);
  const bracedFamilyQueue = Clone(queueState);
  bracedFamilyQueue.tunnels["5,1"].braced = true;
  const bracedFamiliesEstimate = GetCivilianTransitEstimate(
    bracedFamilyQueue,
    "Families",
    "2,1",
  );
  assert.equal(bracedFamiliesEstimate.congestionTurns, 3);
  assert.equal(bracedFamiliesEstimate.congestionTurns < familiesEstimate.congestionTurns, true);

  queueState = Apply(queueState, "Militia", ActionIds.EVACUATE, "2,1", "Families");
  queueState = End(queueState);
  const contactsEstimate = GetCivilianTransitEstimate(queueState, "Contacts", "2,1");
  assert.equal(contactsEstimate.queueOrder, 3);
  assert.equal(contactsEstimate.readyTurn, 10);
  assert.equal(contactsEstimate.congestionTurns, 4);
  assert.equal(contactsEstimate.etaDelayTurns, 3);
  assert.equal(contactsEstimate.bottleneckUsedLoad, 1);
  assert.equal(contactsEstimate.trafficLoad, 2);
  assert.equal(contactsEstimate.firstBottleneckBraceRelief, "Insufficient");
  assert.equal(ActualReadyTurn(queueState, "Contacts").phaseTurn, contactsEstimate.readyTurn);

  const bracedQueue = Clone(queueState);
  bracedQueue.tunnels["2,1"].braced = true;
  const bracedContacts = GetCivilianTransitEstimate(bracedQueue, "Contacts", "2,1");
  assert.equal(bracedContacts.readyTurn, 9);
  assert.equal(ActualReadyTurn(bracedQueue, "Contacts").phaseTurn, bracedContacts.readyTurn);

  const heavyConflictState = CreateLogisticsState(false);
  let woundedMoving = Apply(
    heavyConflictState,
    "Militia",
    ActionIds.EVACUATE,
    "2,1",
    "Wounded",
  );
  woundedMoving = End(woundedMoving);
  const contactsBehindWounded = GetCivilianTransitEstimate(
    woundedMoving,
    "Contacts",
    "2,1",
  );
  assert.equal(contactsBehindWounded.bottleneckUsedLoad, 2);
  assert.equal(contactsBehindWounded.trafficLoad, 2);
  assert.equal(contactsBehindWounded.firstBottleneckBraceRelief, "Insufficient");

  const expiredSignal = Clone(woundedMoving);
  expiredSignal.exitWindows["2,1"].checkedUntilTurn = expiredSignal.turn;
  assert.equal(
    GetCivilianTransitEstimate(expiredSignal, "Families", "2,1").signalCoverage,
    "ExpiresBefore",
  );
  const missingSignal = Clone(woundedMoving);
  missingSignal.exitWindows["2,1"].checkedTurn = 0;
  missingSignal.exitWindows["2,1"].checkedUntilTurn = 0;
  missingSignal.exitWindows["2,1"].signalCount = 0;
  assert.equal(
    GetCivilianTransitEstimate(missingSignal, "Families", "2,1").signalCoverage,
    "MissingOrBlocked",
  );
  let noSignalState = CreateLogisticsState(false);
  noSignalState.exitWindows["2,1"].checkedTurn = 0;
  noSignalState.exitWindows["2,1"].checkedUntilTurn = 0;
  noSignalState.exitWindows["2,1"].signalCount = 0;
  const noSignalEstimate = GetCivilianTransitEstimate(
    noSignalState,
    "Wounded",
    "2,1",
  );
  noSignalState = Apply(
    noSignalState,
    "Militia",
    ActionIds.EVACUATE,
    "2,1",
    "Wounded",
  );
  while (noSignalState.turn <= noSignalEstimate.readyTurn) {
    noSignalState = End(noSignalState);
  }
  const waitingWounded = noSignalState.civilians.find((group) => group.groupId === "Wounded");
  assert.equal(noSignalEstimate.readyTurn, 9);
  assert.equal(waitingWounded.status, "Moving");
  assert.equal(waitingWounded.waitingForSignal, true);
  assert.equal(noSignalState.civiliansSafe, 0);

  const warnedReroute = CreateDualRouteLogisticsState();
  warnedReroute.warnings = [{
    warningId: "ForecastSmoke",
    kind: "Smoke",
    targetKey: "2,1",
    resolvesTurn: warnedReroute.turn + 1,
    resolved: false,
    enemyId: "Sapper",
    text: "工兵准备向北枣窖灌烟",
  }];
  const warnedEstimate = GetCivilianTransitEstimate(
    warnedReroute,
    "Wounded",
    "2,1",
  );
  const warnedActual = ActualReadyTurn(warnedReroute, "Wounded");
  assert.equal(warnedEstimate.rerouted, true);
  assert.equal(warnedEstimate.projectedExitKey, "0,5");
  assert.equal(warnedEstimate.readyTurn, 10);
  assert.equal(warnedActual.phaseTurn, warnedEstimate.readyTurn);
  assert.equal(
    warnedActual.state.civilians.find((group) => group.groupId === "Wounded").exitKey,
    warnedEstimate.projectedExitKey,
  );

  let reroutingQueue = CreateDualRouteLogisticsState();
  reroutingQueue = Apply(
    reroutingQueue,
    "Militia",
    ActionIds.EVACUATE,
    "2,1",
    "Wounded",
  );
  const sealedReroute = Clone(reroutingQueue);
  sealedReroute.tunnels["2,1"].sealed = true;
  sealedReroute.plannedExitKey = null;
  const sealedEstimate = GetCivilianTransitEstimate(
    sealedReroute,
    "Families",
    "0,5",
  );
  const sealedActual = ActualInjectedReadyTurn(sealedReroute, "Families", "0,5");
  assert.equal(sealedEstimate.readyTurn, 10);
  assert.equal(sealedEstimate.congestionTurns, 6);
  assert.equal(sealedActual.phaseTurn, sealedEstimate.readyTurn);
  assert.equal(
    sealedActual.state.civilians.find((group) => group.groupId === "Wounded").exitKey,
    "0,5",
  );

  const smokyReroute = Clone(reroutingQueue);
  smokyReroute.tunnels["2,1"].smoke = 2;
  const smokyEstimate = GetCivilianTransitEstimate(
    smokyReroute,
    "Families",
    "0,5",
  );
  const smokyActual = ActualInjectedReadyTurn(smokyReroute, "Families", "0,5");
  assert.equal(smokyEstimate.readyTurn, 10);
  assert.equal(smokyEstimate.congestionTurns, 6);
  assert.equal(smokyActual.phaseTurn, smokyEstimate.readyTurn);
  assert.equal(
    smokyActual.state.civilians.find((group) => group.groupId === "Wounded").exitKey,
    "0,5",
  );

  const tooLate = CreateLogisticsState(false);
  tooLate.turn = 7;
  const lateWounded = GetCivilianTransitEstimate(tooLate, "Wounded", "2,1");
  assert.equal(lateWounded.readyTurn, 12);
  assert.equal(lateWounded.deadlineSlack, -1);
  assert.equal(lateWounded.deadlineRisk, true);
  assert.match(lateWounded.assumptions, /未计后续新增敌情、烟流、封口、塌方或玩家改道/);
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
  assert.equal(deception.outcome.status, "Victory", JSON.stringify({
    outcome: deception.outcome,
    civilians: deception.civilians,
    turn: deception.turn,
    organization: deception.organization,
    exitWindow: deception.exitWindows["0,5"],
    enemies: deception.enemies,
    log: deception.log.slice(-8),
  }));
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
  assert.equal(deception.organization, 0);
  assert.equal(southWithoutDecoy.organization > deception.organization, true);
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
  const noCounterResults = seeds.map((seed) => (
    RunSouthDeceptionBot(false, false, seed)
  ));
  assert.equal(supportedDeceptionResults.every((state) => (
    state.outcome?.status === "Victory"
    && state.decoyDiversions > 0
    && state.trapsTriggered > 0
  )), true);
  assert.equal(pureTrapResults.some((state) => state.outcome?.status === "Defeat"), true);
  assert.equal(pureTrapResults.some((state) => state.trapsTriggered > 0), true);
  assert.equal(pureTrapResults.some((state, index) => (
    state.trapsTriggered > 0
    && (
      state.peopleSafety > noCounterResults[index].peopleSafety
      || state.enemies.reduce((sum, enemy) => sum + enemy.health, 0)
        < noCounterResults[index].enemies.reduce((sum, enemy) => sum + enemy.health, 0)
    )
  )), true);
  assert.equal(supportedDeceptionResults.every((state, index) => (
    state.exposure < pureTrapResults[index].exposure
  )), true);
  assert.equal(decoyOnlyResults.every((state) => (
    state.outcome?.status === "Defeat"
    && state.civiliansSafe === 0
    && state.trapsTriggered === 0
  )), true);
  assert.equal(noCounterResults.every((state) => state.trapsTriggered === 0), true);
});

Test("three legal strategy identities stay seed-stable through the full eight-person schedule", () => {
  const seeds = Array.from({ length: 100 }, (_, index) => index + 1);
  const northResults = seeds.map((seed) => RunNorthInterdictionBot(seed));
  const southResults = seeds.map((seed) => RunSouthDeceptionBot(true, true, seed));
  const ambushResults = seeds.map((seed) => RunAmbushBot(seed));
  assert.equal(northResults.every((state) => (
    state.outcome?.status === "Victory"
    && state.turn <= MissionConfig.maxTurns
    && state.enemiesDefeated >= 1
    && state.peopleSafety >= 85
  )), true);
  assert.equal(southResults.every((state) => (
    state.outcome?.status === "Victory"
    && state.turn <= MissionConfig.maxTurns
    && state.decoyDiversions >= 1
    && state.trapsTriggered >= 1
    && state.peopleSafety >= 85
  )), true);
  assert.equal(ambushResults.every((state) => (
    state.outcome?.status === "Victory"
    && state.turn <= MissionConfig.maxTurns
    && state.ambushesTriggered >= 1
    && state.peopleSafety >= 65
  )), true);
  assert.equal(seeds.every((_, index) => (
    southResults[index].exposure < ambushResults[index].exposure
    && ambushResults[index].exposure < northResults[index].exposure
  )), true);
});

Test("different launch orders survive full enemy pressure across mission seeds", () => {
  function SignalTurns(state) {
    return state.eventLedger
      .filter((event) => event.text.includes("发出安全信号"))
      .map((event) => event.turn);
  }

  const seeds = Array.from({ length: 100 }, (_, index) => index + 1);
  const northResults = seeds.map((seed) => RunNorthFamilyFirstBot(seed));
  const southResults = seeds.map((seed) => RunSouthContactsSecondBot(seed));

  assert.equal(northResults.every((state) => (
    state.outcome?.status === "Victory"
    && state.civiliansSafe === MissionConfig.totalEvacuees
    && state.exitSignalsIssued === 3
    && state.enemiesDefeated === 1
    && state.peopleSafety >= 90
    && JSON.stringify(SignalTurns(state)) === JSON.stringify([6, 8, 10])
    && state.civilians.find((group) => group.groupId === "Families").launchTurn === 4
    && state.civilians.find((group) => group.groupId === "Families").launchOrder === 1
    && state.civilians.find((group) => group.groupId === "Wounded").launchTurn === 5
    && state.civilians.find((group) => group.groupId === "Wounded").launchOrder === 2
    && state.civilians.find((group) => group.groupId === "Contacts").launchTurn === 6
    && state.civilians.find((group) => group.groupId === "Contacts").launchOrder === 3
  )), true);
  assert.equal(southResults.every(({ state, blockingKey }) => (
    state.outcome?.status === "Victory"
    && state.turn <= MissionConfig.maxTurns + 1
    && state.civiliansSafe === MissionConfig.totalEvacuees
    && state.exitSignalsIssued === 2
    && state.decoyDiversions === 1
    && state.trapsTriggered === 2
    && state.enemiesDefeated === 1
    && state.peopleSafety >= 95
    && JSON.stringify(SignalTurns(state)) === JSON.stringify([8, 10])
    && state.civilians.find((group) => group.groupId === "Wounded").launchTurn === 4
    && state.civilians.find((group) => group.groupId === "Wounded").launchOrder === 1
    && state.civilians.find((group) => group.groupId === "Contacts").launchTurn === 5
    && state.civilians.find((group) => group.groupId === "Contacts").launchOrder === 2
    && state.civilians.find((group) => group.groupId === "Families").launchTurn === 6
    && state.civilians.find((group) => group.groupId === "Families").launchOrder === 3
    && state.units.find((unit) => unit.unitId === "Guerrilla").tileKey === blockingKey
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

Test("victory requires all three groups safe and derives its person count from group status", () => {
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
  assert.equal(outcome, null);

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
  state.civiliansSafe = MissionConfig.totalEvacuees;
  state.civilians.forEach((group) => {
    group.status = "Safe";
  });
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
  state.civilians.forEach((group) => {
    group.status = "Safe";
  });
  state.civiliansSafe = MissionConfig.totalEvacuees;
  const outcome = EvaluateMission(state);
  assert.equal(outcome.failureId, "ReconMissing");
});

Test("failure advice names the real missing batch, living actor, and connected-route limits", () => {
  const incomplete = CreateLogisticsState(false);
  incomplete.turn = MissionConfig.maxTurns + 1;
  incomplete.civilians[0].status = "Safe";
  incomplete.civilians[1].status = "Safe";
  incomplete.civilians[2].status = "Waiting";
  incomplete.civiliansSafe = 5;
  const incompleteOutcome = EvaluateMission(incomplete);
  assert.equal(incompleteOutcome.failureId, "EvacuationIncomplete");
  assert.equal(incompleteOutcome.missingPeople, 3);
  assert.match(incompleteOutcome.tip, /还差 3 人；三批必须全部发车/);
  assert.match(incompleteOutcome.tip, /交通站骨干/);

  const missedWindow = CreateLogisticsState(false);
  missedWindow.turn = MissionConfig.maxTurns + 1;
  const waitingAtExit = missedWindow.civilians[0];
  waitingAtExit.status = "Moving";
  waitingAtExit.path = [...northEvacuationPath];
  waitingAtExit.pathIndex = northEvacuationPath.length - 1;
  waitingAtExit.tileKey = "2,1";
  waitingAtExit.exitKey = "2,1";
  waitingAtExit.waitingForSignal = true;
  waitingAtExit.launchOrder = 1;
  waitingAtExit.launchTurn = 4;
  waitingAtExit.exitArrivalTurn = 11;
  missedWindow.units.find((unit) => unit.unitId === "Scout").health = 0;
  const deadScoutWindow = EvaluateMission(missedWindow);
  assert.equal(deadScoutWindow.failureId, "ExitWindowMissed");
  assert.match(deadScoutWindow.tip, /第 1 批（伤员与担架队，T4 发车，1 段\/回合）已于 T11 到达/);
  assert.match(deadScoutWindow.tip, /交通员已阵亡，本局无法/);
  assert.doesNotMatch(deadScoutWindow.tip, /让交通员.*(?:上浮|复查|侦察)/);
  assert.match(deadScoutWindow.tip, /当前仅接通北枣窖，不存在可立即改走的备用出口/);
  assert.doesNotMatch(deadScoutWindow.tip, /改走已接通/);

  const aliveScoutWindow = Clone(missedWindow);
  aliveScoutWindow.units.find((unit) => unit.unitId === "Scout").health = 3;
  const oneExitOutcome = EvaluateMission(aliveScoutWindow);
  assert.match(oneExitOutcome.tip, /让交通员在该批预计到达前一回合从北枣窖上浮并复查/);
  assert.match(oneExitOutcome.tip, /不存在可立即改走的备用出口/);

  const laterBatchWindow = CreateLogisticsState(false);
  laterBatchWindow.turn = MissionConfig.maxTurns + 1;
  laterBatchWindow.civilians[0].status = "Safe";
  laterBatchWindow.civiliansSafe = 3;
  const familiesAtExit = laterBatchWindow.civilians[1];
  familiesAtExit.status = "Moving";
  familiesAtExit.path = [...northEvacuationPath];
  familiesAtExit.pathIndex = northEvacuationPath.length - 1;
  familiesAtExit.tileKey = "2,1";
  familiesAtExit.exitKey = "2,1";
  familiesAtExit.waitingForSignal = true;
  familiesAtExit.launchOrder = 2;
  familiesAtExit.launchTurn = 5;
  familiesAtExit.exitArrivalTurn = 8;
  const laterBatchOutcome = EvaluateMission(laterBatchWindow);
  assert.equal(laterBatchOutcome.failureId, "ExitWindowMissed");
  assert.match(laterBatchOutcome.tip, /第 2 批（两户乡亲，T5 发车，2 段\/回合）已于 T8 到达/);
  assert.doesNotMatch(laterBatchOutcome.tip, /首批到达前/);

  const missedPlanning = CreateInitialState();
  missedPlanning.turn = MissionConfig.maxTurns + 1;
  missedPlanning.sweepActive = true;
  missedPlanning.tunnelsDug = 1;
  missedPlanning.civilians.forEach((group) => {
    group.status = "Safe";
  });
  missedPlanning.civiliansSafe = MissionConfig.totalEvacuees;
  missedPlanning.units.find((unit) => unit.unitId === "Scout").health = 0;
  const deadScoutRecon = EvaluateMission(missedPlanning);
  assert.equal(deadScoutRecon.failureId, "ReconMissing");
  assert.match(deadScoutRecon.tip, /交通员已阵亡，本局无法补回/);
  assert.doesNotMatch(deadScoutRecon.tip, /让交通员执行/);

  const collapsed = CreateLogisticsState(false);
  collapsed.turn = MissionConfig.maxTurns + 1;
  collapsed.civilians[0].status = "Trapped";
  collapsed.lastFailureCause = {
    failureId: "UnbracedCollapse",
    warningId: "CollapseTest",
    text: "返沙层未支护，人员经过时塌方。",
    tip: "让地道队在下回合前支护。",
  };
  const collapseOutcome = EvaluateMission(collapsed);
  assert.equal(collapseOutcome.failureId, "UnbracedCollapse");
  assert.match(collapseOutcome.summary, /返沙层未支护/);
});

Test("late evacuation advice diagnoses slow last launch, congestion, and a sealed exit", () => {
  const slowLast = CreateLogisticsState(false);
  slowLast.turn = MissionConfig.maxTurns + 1;
  slowLast.civilians[1].status = "Safe";
  slowLast.civilians[2].status = "Safe";
  slowLast.civiliansSafe = 5;
  const wounded = slowLast.civilians[0];
  wounded.status = "Moving";
  wounded.path = [...northEvacuationPath];
  wounded.pathIndex = 3;
  wounded.tileKey = "4,1";
  wounded.exitKey = "2,1";
  wounded.launchOrder = 3;
  wounded.launchTurn = 6;
  wounded.waitingForSignal = false;
  const slowOutcome = EvaluateMission(slowLast);
  assert.equal(slowOutcome.failureId, "EvacuationLate");
  assert.match(slowOutcome.tip, /第 3 批（伤员与担架队，T6 发车，1 段\/回合）/);
  assert.match(slowOutcome.tip, /仍距北枣窖 2 段/);
  assert.match(slowOutcome.tip, /优先发出伤员，并支护出口咽喉/);
  assert.doesNotMatch(slowOutcome.tip, /接通第一出口|组织第一批/);

  const congested = Clone(slowLast);
  congested.civilians[0].trafficDelays = 2;
  congested.civilians[0].lastTrafficDelayTileKey = "5,1";
  const congestionOutcome = EvaluateMission(congested);
  assert.match(congestionOutcome.tip, /麦田因拥堵等待 2 回合/);
  assert.match(congestionOutcome.tip, /重载 2 与轻载 1.*容量 3/);
  assert.match(congestionOutcome.tip, /两支重载 2\+2 仍须错开发车/);

  const sealed = Clone(slowLast);
  sealed.civilians[0].pathIndex = northEvacuationPath.length - 1;
  sealed.civilians[0].tileKey = "2,1";
  sealed.tunnels["2,1"].sealed = true;
  const sealedOutcome = EvaluateMission(sealed);
  assert.equal(sealedOutcome.failureId, "EvacuationLate");
  assert.match(sealedOutcome.tip, /到达北枣窖时洞口已封闭/);
  assert.match(sealedOutcome.tip, /地道队抢通/);
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

  const legacyWithoutCivilianLedger = Clone(state);
  delete legacyWithoutCivilianLedger.civilians;
  delete legacyWithoutCivilianLedger.civilianLaunchSerial;
  const migratedWithoutLedger = DeserializeState(JSON.stringify(legacyWithoutCivilianLedger));
  assert.equal(migratedWithoutLedger.civilianLaunchSerial, 1);
});

Test("HTML and game source wire Three.js, path previews, both layers, and touch-safe input", () => {
  const html = readFileSync(new URL("./index.html", import.meta.url), "utf8");
  const gameSource = readFileSync(new URL("./Script_Game.mjs", import.meta.url), "utf8");
  const cliSource = readFileSync(new URL("./Script_PlayCli.mjs", import.meta.url), "utf8");
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
  assert.match(gameSource, /成功诱导只浪费该敌军一次调查行动/);
  assert.match(gameSource, /预计响应：/);
  assert.match(gameSource, /段\/回合 · 负载/);
  assert.match(gameSource, /三批全撤 · 速度\/负载各异/);
  assert.match(gameSource, /约 T.*进入出洞窗口/);
  assert.match(gameSource, /首个冲突：/);
  assert.match(gameSource, /未计后续新增敌情、烟流、封口、塌方或玩家改道/);
  assert.doesNotMatch(gameSource, /无拥堵且信号及时最早.*安全撤出/);
  assert.match(gameSource, /通行容量 2→3/);
  assert.match(gameSource, /mobileCivilianSummary/);
  assert.match(gameSource, /classList\.add\("previewOpen"\)/);
  assert.match(gameSource, /ApplyPlayerActionPath/);
  assert.match(gameSource, /确认执行 \$\{steps\} 步/);
  assert.match(gameSource, /computeLineDistances/);
  assert.match(gameSource, /data-path-target/);
  assert.match(gameSource, /本回合连续终点 · 仍逐格结算/);
  assert.match(gameSource, /敌军预警只在手动结束回合后结算/);
  assert.match(gameSource, /eventLedger\.slice\(eventCountBefore\)/);
  assert.match(gameSource, /IsSoilKnown\(gameState, tileKey\)/);
  assert.match(gameSource, /window\.scrollTo\(0, 0\)/);
  assert.match(gameSource, /1 AP｜预留弹药 1｜离开洞口不返还/);
  assert.match(gameSource, /锁定当前预警工兵，其他敌军不会抢先消耗/);
  assert.match(style, /touch-action:\s*none/);
  assert.match(style, /min-height:\s*44px/);
  assert.match(style, /\.exitWindowCard\.actionable/);
  assert.match(style, /\.civilianLedger\s*\{[\s\S]*?position:\s*fixed/);
  assert.match(style, /\.civilianEntry \.mobileCivilianSummary/);
  assert.match(style, /grid-template-rows:\s*minmax\(0, 1fr\) 44px/);
  assert.match(style, /\.actionButtons \.pathChoice/);
  assert.match(cliSource, /case "path"/);
  assert.match(cliSource, /ApplyPlayerActionPath/);
});

console.log(`\nTunnelFront1942 smoke test: ${passed} assertions passed.`);
