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
  GetAvailableActions,
  GetMoveTargets,
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

function PrepareSharedOpening(state, firstDigKey) {
  let next = Apply(state, "Scout", ActionIds.RECON);
  next = Apply(next, "WorkTeam", ActionIds.ENTER_TUNNEL);
  next = Apply(next, "WorkTeam", ActionIds.DIG, firstDigKey);
  next = Apply(next, "Militia", ActionIds.MOVE, "6,2");
  next = Apply(next, "Militia", ActionIds.ENTER_TUNNEL);
  return next;
}

function RunNorthStealthBot() {
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

  while (!state.outcome && state.turn <= 10) {
    state = End(state);
  }
  return state;
}

function RunSouthDeceptionBot(useDecoy = true) {
  let state = CreateInitialState();
  state = Apply(state, "Scout", ActionIds.RECON);
  state = Apply(state, "WorkTeam", ActionIds.ENTER_TUNNEL);
  state = Apply(state, "WorkTeam", ActionIds.DIG, "5,3");
  if (useDecoy) {
    state = Apply(state, "Militia", ActionIds.DECOY, "4,3");
  }
  state = Apply(state, "Militia", ActionIds.MOVE, "6,2");
  state = Apply(state, "Scout", ActionIds.MOVE, "6,3");
  state = End(state);

  state = Apply(state, "Militia", ActionIds.ENTER_TUNNEL);
  state = Apply(state, "Guerrilla", ActionIds.MOVE, "6,2");
  state = Apply(state, "Guerrilla", ActionIds.ENTER_TUNNEL);
  state = Apply(state, "Scout", ActionIds.MOVE, "6,2");
  state = Apply(state, "Scout", ActionIds.ENTER_TUNNEL);
  state = Apply(state, "WorkTeam", ActionIds.DIG, "4,4");
  state = Apply(state, "WorkTeam", ActionIds.DIG, "3,4");
  state = End(state);

  state = Apply(state, "WorkTeam", ActionIds.DIG, "2,4");
  state = Apply(state, "WorkTeam", ActionIds.DIG, "1,5");
  state = End(state);

  state = Apply(state, "WorkTeam", ActionIds.DIG, "0,5");
  state = Apply(state, "Militia", ActionIds.EVACUATE, "0,5", "Wounded");
  state = End(state);

  state = Apply(state, "Militia", ActionIds.EVACUATE, "0,5", "Contacts");
  state = End(state);

  while (!state.outcome && state.turn <= 10) {
    state = End(state);
  }
  return state;
}

function RunAmbushBot() {
  let state = CreateInitialState();
  state = PrepareSharedOpening(state, "5,2");
  state = Apply(state, "Scout", ActionIds.MOVE, "6,3");
  state = End(state);

  state = Apply(state, "Scout", ActionIds.MOVE, "6,2");
  state = Apply(state, "Scout", ActionIds.ENTER_TUNNEL);
  state = Apply(state, "WorkTeam", ActionIds.DIG, "4,2");
  state = Apply(state, "WorkTeam", ActionIds.MOVE, "3,2");
  state = Apply(state, "Militia", ActionIds.MOVE, "5,2");
  state = Apply(state, "Militia", ActionIds.MOVE, "4,2");
  state = End(state);

  state = Apply(state, "WorkTeam", ActionIds.DIG, "3,1");
  state = Apply(state, "WorkTeam", ActionIds.BRACE);
  state = Apply(state, "Militia", ActionIds.MOVE, "3,2");
  state = End(state);

  state = Apply(state, "WorkTeam", ActionIds.DIG, "2,1");
  state = Apply(state, "WorkTeam", ActionIds.BRACE);
  state = Apply(state, "Militia", ActionIds.MOVE, "3,1");
  state = Apply(state, "Militia", ActionIds.MOVE, "2,1");
  state = End(state);

  state = Apply(state, "Militia", ActionIds.AMBUSH);
  state = Apply(state, "Scout", ActionIds.EVACUATE, "2,1", "Wounded");
  state = End(state);

  state = End(state);
  state = Apply(state, "Scout", ActionIds.EVACUATE, "2,1", "Contacts");
  state = End(state);

  while (!state.outcome && state.turn <= 10) {
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
  assert.equal(state.sweepTurn, 5);
  assert.equal(state.enemies.filter((enemy) => !enemy.inactiveUntilTurn).length >= 2, true);
  assert.equal(GetAvailableActions(state, "Scout").includes(ActionIds.RECON), true);
  assert.equal(GetAvailableActions(state, "WorkTeam").includes(ActionIds.ENTER_TUNNEL), true);
  assert.match(state.log[0].text, /第 4 回合转移信号/);
});

Test("repeat surface reconnaissance costs organization, needs a new tile, and cannot be spammed", () => {
  let state = CreateInitialState();
  state.reconActions = 1;
  state.reconVisitedTiles = ["6,3"];
  state.exposure = 30;
  state = Apply(state, "Scout", ActionIds.RECON);
  assert.equal(state.exposure, 25);
  assert.equal(state.reconActions, 2);
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
  state.tunnels["5,2"] = {
    ...Clone(state.tunnels["6,2"]),
    tileKey: "5,2",
  };
  state = Apply(state, "Militia", ActionIds.MOVE, "5,2");
  assert.equal(state.units.find((unit) => unit.unitId === "Militia").ambushPrepared, false);
});

Test("north stealth, south deception, and delayed ambush strategies all win differently", () => {
  const stealth = RunNorthStealthBot();
  const deception = RunSouthDeceptionBot();
  const southWithoutDecoy = RunSouthDeceptionBot(false);
  const ambush = RunAmbushBot();
  assert.equal(stealth.outcome.status, "Victory");
  assert.equal(deception.outcome.status, "Victory");
  assert.equal(ambush.outcome.status, "Victory");
  assert.equal(stealth.outcome.path, "stealth");
  assert.equal(deception.outcome.path, "deception");
  assert.equal(ambush.outcome.path, "ambush");
  assert.equal(deception.decoyDiversions > 0, true);
  assert.equal(deception.exposure < southWithoutDecoy.exposure, true);
  assert.equal(deception.organization, southWithoutDecoy.organization - 1);
  assert.equal(ambush.ambushesTriggered > 0, true);
  assert.notDeepEqual(
    Object.keys(stealth.tunnels).sort(),
    Object.keys(deception.tunnels).sort(),
  );
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
  state.turn = 10;
  state.sweepActive = true;
  state.tunnelsDug = 4;
  state.civiliansSafe = 6;
  state.civilians[0].status = "Safe";
  state.civilians[2].status = "Safe";
  const outcome = EvaluateMission(state);
  assert.equal(outcome.failureId, "ReconMissing");
  assert.match(outcome.summary, /没有完成地面侦察/);
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
  const state = RunNorthStealthBot();
  const restored = DeserializeState(SerializeState(state));
  assert.deepEqual(restored.tunnels, state.tunnels);
  assert.deepEqual(restored.enemyMemory, state.enemyMemory);
  assert.equal(restored.outcome.path, "stealth");
});

Test("HTML and game source wire Three.js, both layers, previews, and touch-safe input", () => {
  const html = readFileSync(new URL("./index.html", import.meta.url), "utf8");
  const gameSource = readFileSync(new URL("./Script_Game.mjs", import.meta.url), "utf8");
  const style = readFileSync(new URL("./Style_Game.css", import.meta.url), "utf8");
  assert.match(html, /three\.module\.mjs/);
  assert.match(html, /SurfaceLayerButton/);
  assert.match(html, /TunnelLayerButton/);
  assert.match(html, /PreviewPanel/);
  assert.match(gameSource, /THREE\.Raycaster/);
  assert.match(gameSource, /pointerState\.moved/);
  assert.match(gameSource, /1 AP｜组织 1｜暴露 -8｜假迹持续 4 回合/);
  assert.match(gameSource, /1 AP｜预留弹药 1｜离开洞口不返还/);
  assert.match(style, /touch-action:\s*none/);
  assert.match(style, /min-height:\s*44px/);
});

console.log(`\nTunnelFront1942 smoke test: ${passed} assertions passed.`);
