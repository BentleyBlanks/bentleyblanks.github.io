import assert from "node:assert/strict";
import {
  saveVersion,
  saveKey,
  turnLimit,
  actionDefinitions,
  institutionDefinitions,
  doctrineDefinitions,
  policyDefinitions,
  historicalTurns,
  terrainDefinitions,
  unitDefinitions,
  CreateInitialState,
  CloneState,
  GetHex,
  GetNeighbors,
  GetTurnBriefing,
  GetEnemyObservableSnapshot,
  GenerateEnemyOperationalPlan,
  FindReachableHexes,
  ListContextActions,
  GetActionPreview,
  QueueOrder,
  RemoveOrder,
  ClearOrders,
  ResolveTurn,
  GetDoctrineExperienceCost,
  UnlockDoctrine,
  SetPolicies,
  GetVictoryAssessment,
  SerializeState,
  DeserializeState,
} from "./Script_Rules.mjs";

const testResults = [];

function Test(name, callback) {
  try {
    callback();
    testResults.push({ name, passed: true });
    console.log(`✓ ${name}`);
  } catch (error) {
    testResults.push({ name, passed: false, error });
    console.error(`✗ ${name}`);
    throw error;
  }
}

function HexDistance(firstHex, secondHex) {
  const deltaQ = firstHex.q - secondHex.q;
  const deltaR = firstHex.r - secondHex.r;
  const deltaS = (-firstHex.q - firstHex.r) - (-secondHex.q - secondHex.r);
  return Math.max(Math.abs(deltaQ), Math.abs(deltaR), Math.abs(deltaS));
}

function TryQueue(state, order) {
  const next = QueueOrder(state, order);
  return next.orders.length > state.orders.length ? next : state;
}

function GetProjectedHex(state, unitId) {
  const unit = state.units.find((candidate) => candidate.id === unitId);
  const moveOrder = [...state.orders]
    .reverse()
    .find((order) => order.unitId === unitId && order.actionId === "move");
  return state.hexes.find((hex) => hex.id === (moveOrder?.targetHexId || unit.hexId));
}

function MoveToward(state, unitId, targetHex) {
  const projectedHex = GetProjectedHex(state, unitId);
  if (!projectedHex || projectedHex.id === targetHex.id) {
    return state;
  }
  const reachable = FindReachableHexes(state, unitId);
  const exactTarget = reachable.find((entry) => entry.hexId === targetHex.id);
  const bestStep = exactTarget || [...reachable].sort((first, second) => {
    const firstHex = state.hexes.find((hex) => hex.id === first.hexId);
    const secondHex = state.hexes.find((hex) => hex.id === second.hexId);
    const distanceDifference = HexDistance(firstHex, targetHex) - HexDistance(secondHex, targetHex);
    return distanceDifference || first.cost - second.cost;
  })[0];
  if (!bestStep) {
    return state;
  }
  return TryQueue(state, {
    actionId: "move",
    unitId,
    hexId: bestStep.hexId,
    targetHexId: bestStep.hexId,
  });
}

function UnlockAvailableDoctrines(state) {
  let next = state;
  for (let pass = 0; pass < 10; pass += 1) {
    let changed = false;
    for (const doctrine of doctrineDefinitions) {
      const tree = next.doctrines[doctrine.tree];
      const prerequisiteMet = !doctrine.prerequisite || tree.unlocked.includes(doctrine.prerequisite);
      if (!tree.unlocked.includes(doctrine.id)
        && prerequisiteMet
        && tree.experience >= GetDoctrineExperienceCost(doctrine)) {
        const unlocked = UnlockDoctrine(next, doctrine.id);
        if (!unlocked.lastError) {
          next = unlocked;
          changed = true;
        }
      }
    }
    if (!changed) {
      break;
    }
  }
  return next;
}

function QueueNearestSabotage(state, unitId) {
  const unit = state.units.find((candidate) => candidate.id === unitId);
  if (!unit || unit.readiness <= 0 || state.commandPoints <= 0 || state.resources.arms <= 0) {
    return state;
  }
  let next = state;
  let projectedHex = GetProjectedHex(next, unitId);
  const GetTargets = () => next.hexes
    .filter((hex) => hex.rail
      && hex.railDisabledTurns === 0
      && !next.enemies.some((enemy) => enemy.active
        && enemy.type === "Garrison"
        && enemy.hexId === hex.id))
    .sort((first, second) => {
      return HexDistance(projectedHex, first) - HexDistance(projectedHex, second);
    });
  let target = GetTargets()[0];
  if (!target) {
    return next;
  }
  if (HexDistance(projectedHex, target) > 1) {
    next = MoveToward(next, unitId, target);
    projectedHex = GetProjectedHex(next, unitId);
    target = GetTargets()[0];
  }
  if (target && HexDistance(projectedHex, target) <= 1) {
    next = TryQueue(next, {
      actionId: "sabotage",
      unitId,
      hexId: target.id,
      targetHexId: target.id,
    });
  }
  return next;
}

function QueueWorkSchedule(state) {
  const workTeamId = "Unit_WorkTeam_One";
  const warnings = state.hexes.filter((hex) => hex.warning?.turn === state.turn);
  let next = state;

  if (warnings.length > 0) {
    const workHex = GetProjectedHex(next, workTeamId);
    const target = [...warnings].sort((first, second) => {
      return HexDistance(workHex, first) - HexDistance(workHex, second);
    })[0];
    next = MoveToward(next, workTeamId, target);
    if (GetProjectedHex(next, workTeamId)?.id === target.id) {
      next = TryQueue(next, {
        actionId: "evacuate",
        unitId: workTeamId,
        hexId: target.id,
        targetHexId: target.id,
      });
    }
    return next;
  }

  const schedule = {
    1: ["Hex_Q2_R3", "buildStation"],
    2: ["Hex_Q2_R3", "organize"],
    3: ["Hex_Q2_R1", "buildClinic"],
    4: ["Hex_Q2_R1", "organize"],
    5: ["Hex_Q2_R1", "relief"],
    6: ["Hex_Q4_R1", "organize"],
    7: ["Hex_Q4_R1", "relief"],
    8: ["Hex_Q4_R1", "organize"],
    10: ["Hex_Q4_R1", "relief"],
    11: ["Hex_Q4_R4", "organize"],
    12: ["Hex_Q4_R4", "organize"],
    13: ["Hex_Q4_R4", "buildCooperative"],
    14: ["Hex_Q5_R6", "organize"],
    16: ["Hex_Q5_R6", "relief"],
  };
  const scheduledOrder = schedule[next.turn];
  if (!scheduledOrder) {
    return next;
  }
  const target = next.hexes.find((hex) => hex.id === scheduledOrder[0]);
  next = MoveToward(next, workTeamId, target);
  if (GetProjectedHex(next, workTeamId)?.id === target.id) {
    next = TryQueue(next, {
      actionId: scheduledOrder[1],
      unitId: workTeamId,
      hexId: target.id,
      targetHexId: target.id,
    });
  }
  return next;
}

function QueueWarningDefense(state) {
  const mainForceId = "Unit_MainForce_One";
  const warnings = state.hexes.filter((hex) => hex.warning?.turn === state.turn);
  if (warnings.length === 0 || state.commandPoints <= 0) {
    return state;
  }
  let next = state;
  const workTeamHex = GetProjectedHex(next, "Unit_WorkTeam_One");
  const target = warnings.find((hex) => hex.id !== workTeamHex?.id) || warnings[0];
  next = MoveToward(next, mainForceId, target);
  const mainForceHex = GetProjectedHex(next, mainForceId);
  if (next.commandPoints > 0 && mainForceHex && HexDistance(mainForceHex, target) <= 1) {
    next = TryQueue(next, {
      actionId: "ambush",
      unitId: mainForceId,
      hexId: target.id,
      targetHexId: target.id,
    });
  }
  return next;
}

function PlanBalancedTurn(state) {
  let next = UnlockAvailableDoctrines(state);
  next = QueueWorkSchedule(next);
  const warnings = next.hexes.filter((hex) => hex.warning?.turn === next.turn);
  if (warnings.length > 0) {
    next = QueueWarningDefense(next);
  } else if ([1, 4, 7, 10, 13].includes(next.turn)) {
    next = QueueNearestSabotage(next, "Unit_Guerrilla_One");
  } else if (next.commandPoints > 0) {
    const guerrillaHex = GetProjectedHex(next, "Unit_Guerrilla_One");
    next = TryQueue(next, {
      actionId: "recon",
      unitId: "Unit_Guerrilla_One",
      hexId: guerrillaHex.id,
      targetHexId: guerrillaHex.id,
    });
  }
  if (next.commandPoints > 0) {
    next = TryQueue(next, {
      actionId: "selfProduction",
      hexId: "Hex_Q1_R3",
      targetHexId: "Hex_Q1_R3",
    });
  }
  return next;
}

function PlanPassiveTurn(state) {
  return TryQueue(state, {
    actionId: "selfProduction",
    hexId: "Hex_Q1_R3",
    targetHexId: "Hex_Q1_R3",
  });
}

function PlanRecklessTurn(state) {
  let next = UnlockAvailableDoctrines(state);
  next = QueueNearestSabotage(next, "Unit_Guerrilla_One");
  next = QueueNearestSabotage(next, "Unit_MainForce_One");
  return next;
}

function PlanMilitaryDoctrineTurn(state) {
  let next = UnlockAvailableDoctrines(state);
  const workTeamId = "Unit_WorkTeam_One";
  if (next.turn === 1) {
    next = TryQueue(next, {
      actionId: "buildStation",
      unitId: workTeamId,
      hexId: "Hex_Q2_R3",
      targetHexId: "Hex_Q2_R3",
    });
  } else if (next.turn === 2) {
    next = TryQueue(next, {
      actionId: "constructionDrive",
      unitId: workTeamId,
      hexId: "Hex_Q2_R3",
      targetHexId: "Hex_Q2_R3",
    });
  }

  if ([1, 5, 9, 13].includes(next.turn)) {
    const reconUnitIds = next.turn === 1
      ? ["Unit_Guerrilla_One", "Unit_MainForce_One"]
      : [workTeamId, "Unit_MainForce_One"];
    for (const unitId of reconUnitIds) {
      const unitHex = GetProjectedHex(next, unitId);
      next = TryQueue(next, {
        actionId: "recon",
        unitId,
        hexId: unitHex?.id,
        targetHexId: unitHex?.id,
      });
    }
  }

  for (const unitId of ["Unit_Guerrilla_One", "Unit_MainForce_One"]) {
    const unit = next.units.find((candidate) => candidate.id === unitId);
    if (unit?.recoveryRequired && unit.brokenTurnsRemaining === 0 && next.commandPoints > 0) {
      next = TryQueue(next, {
        actionId: "rest",
        unitId,
        hexId: unit.hexId,
        targetHexId: unit.hexId,
      });
    }
  }

  const recoveredUnit = next.units.find((unit) => {
    return ["Guerrilla", "MainForce"].includes(unit.type)
      && unit.hexId === "Hex_Q1_R3"
      && unit.readiness === 1
      && !unit.recoveryRequired
      && !next.orders.some((order) => order.unitId === unit.id);
  });
  const warningTarget = recoveredUnit
    ? next.hexes
      .filter((hex) => hex.warning?.turn === next.turn)
      .sort((first, second) => HexDistance(GetProjectedHex(next, recoveredUnit.id), first)
        - HexDistance(GetProjectedHex(next, recoveredUnit.id), second))[0]
    : null;
  if (recoveredUnit && warningTarget && next.resources.arms > 0 && next.resources.intel > 0) {
    next = MoveToward(next, recoveredUnit.id, warningTarget);
    const recoveredHex = GetProjectedHex(next, recoveredUnit.id);
    if (recoveredHex && HexDistance(recoveredHex, warningTarget) <= 1) {
      const ambushPlan = TryQueue(next, {
        actionId: "ambush",
        unitId: recoveredUnit.id,
        hexId: warningTarget.id,
        targetHexId: warningTarget.id,
      });
      if (ambushPlan.orders.length > next.orders.length) {
        return ambushPlan;
      }
    }
  }

  if (next.resources.arms <= 0 && next.commandPoints >= 2) {
    return TryQueue(next, {
      actionId: "emergencySupply",
      hexId: "Hex_Q1_R3",
      targetHexId: "Hex_Q1_R3",
    });
  }
  for (const unitId of ["Unit_Guerrilla_One", "Unit_MainForce_One"]) {
    const orderCount = next.orders.length;
    const candidate = QueueNearestSabotage(next, unitId);
    if (candidate.orders.length > orderCount) {
      next = candidate;
    }
  }
  return next;
}

function RunCampaign(seed, planner) {
  let state = CreateInitialState(seed);
  let safety = 0;
  while (!state.gameOver && safety < turnLimit + 2) {
    state = planner(state);
    state = ResolveTurn(state);
    safety += 1;
  }
  assert.equal(safety, turnLimit, "战役必须恰好结算16回合");
  assert.equal(state.gameOver, true);
  return state;
}

Test("常量、双树、政策与16个历史月定义完整", () => {
  assert.equal(saveVersion, 2);
  assert.match(saveKey, /^enemyrear1941_/);
  assert.equal(turnLimit, 16);
  assert.equal(historicalTurns.length, 16);
  assert.equal(historicalTurns[0].date, "1941年9月");
  assert.equal(historicalTurns[15].date, "1942年12月");
  assert.ok(terrainDefinitions.length >= 5);
  assert.ok(unitDefinitions.some((unit) => unit.id === "WorkTeam"));
  assert.ok(unitDefinitions.some((unit) => unit.id === "Guerrilla"));
  assert.ok(unitDefinitions.some((unit) => unit.id === "MainForce"));
  assert.ok(unitDefinitions.some((unit) => unit.id === "Militia"));
  assert.equal(doctrineDefinitions.filter((doctrine) => doctrine.tree === "civilian").length, 5);
  assert.equal(doctrineDefinitions.filter((doctrine) => doctrine.tree === "military").length, 5);
  assert.ok(
    doctrineDefinitions.every((doctrine) => Number.isFinite(doctrine.cost)),
    "双树经验门槛必须保留为数值，不能在冻结定义时变成对象",
  );
  assert.ok(policyDefinitions.length >= 8);
  for (const requiredAction of [
    "move",
    "recon",
    "organize",
    "relief",
    "evacuate",
    "buildStation",
    "buildClinic",
    "selfProduction",
    "emergencySupply",
    "ambush",
    "sabotage",
    "rest",
  ]) {
    assert.ok(actionDefinitions.some((action) => action.id === requiredAction), `缺少${requiredAction}`);
  }
  const civilianInstitutionIds = ["PartyBranch", "Cooperative", "Clinic", "Station", "Tunnels"];
  for (const institutionId of civilianInstitutionIds) {
    const institution = institutionDefinitions.find((candidate) => candidate.id === institutionId);
    const action = actionDefinitions.find((candidate) => candidate.institutionId === institutionId);
    assert.equal(institution.cost.arms || 0, 0, `${institution.label}不得消耗军械库存`);
    assert.equal(action.cost.arms || 0, 0, `${action.label}不得把民生建设记作武器消耗`);
  }
  assert.ok(
    actionDefinitions.find((action) => action.id === "buildArsenal").cost.arms > 0,
    "军械库存应保留给兵工、防御和军事行动",
  );
  const sweepNames = CreateInitialState().enemies
    .filter((enemy) => enemy.type === "SweepColumn")
    .map((enemy) => enemy.name);
  assert.deepEqual(sweepNames, [
    "北路临时扫荡纵队（情境合成称谓）",
    "南路临时扫荡纵队（情境合成称谓）",
  ]);
});

Test("9×7地图、轴向邻接与战争迷雾正确", () => {
  const state = CreateInitialState();
  assert.equal(state.hexes.length, 63);
  assert.equal(GetNeighbors(state, "Hex_Q4_R3").length, 6);
  assert.equal(GetNeighbors(state, "Hex_Q0_R0").length, 2);
  for (const neighbor of GetNeighbors(state, "Hex_Q4_R3")) {
    assert.ok(GetNeighbors(state, neighbor.id).some((candidate) => candidate.id === "Hex_Q4_R3"));
  }
  assert.ok(state.hexes.some((hex) => !hex.visible));
  assert.ok(state.hexes.some((hex) => hex.visible));
  const briefing = GetTurnBriefing(state);
  assert.match(briefing.historicalBoundary, /不允许提前改写/);
  assert.equal(briefing.recommendedLoop.length, 6);
});

Test("移动范围尊重地形、敌占据点和纯函数约束", () => {
  const state = CreateInitialState();
  const before = SerializeState(state);
  const reachable = FindReachableHexes(state, "Unit_WorkTeam_One");
  assert.ok(reachable.some((entry) => entry.hexId === "Hex_Q2_R1"));
  assert.ok(!reachable.some((entry) => entry.hexId === "Hex_Q6_R3"));
  assert.equal(SerializeState(state), before, "寻路不应修改传入状态");

  const moved = QueueOrder(state, {
    actionId: "move",
    unitId: "Unit_WorkTeam_One",
    hexId: "Hex_Q2_R1",
    targetHexId: "Hex_Q2_R1",
  });
  assert.equal(moved.orders.length, 1);
  assert.equal(moved.commandPoints, 3);
  assert.equal(state.orders.length, 0);
});

Test("组织行动、上下文列表和结构化预览可供新手理解", () => {
  const state = CreateInitialState();
  const context = ListContextActions(state, "Hex_Q2_R3", "Unit_WorkTeam_One");
  const organizeContext = context.find((action) => action.actionId === "organize");
  assert.equal(organizeContext.enabled, true);
  assert.equal(organizeContext.kind, "civilian");
  assert.match(organizeContext.costText, /1令/);

  const preview = GetActionPreview(state, "organize", "Hex_Q2_R3", "Unit_WorkTeam_One");
  assert.equal(preview.enabled, true);
  assert.ok(preview.effects.length >= 2);
  assert.equal(typeof preview.summary, "string");

  const queued = QueueOrder(state, {
    actionId: "organize",
    unitId: "Unit_WorkTeam_One",
    hexId: "Hex_Q2_R3",
    targetHexId: "Hex_Q2_R3",
  });
  assert.equal(queued.resources.grain, state.resources.grain, "规划阶段只预留、不立刻扣资源");
  assert.equal(queued.reserved.grain, 1);
  const resolved = ResolveTurn(queued);
  assert.ok(GetHex(resolved, "Hex_Q2_R3").contact > GetHex(state, "Hex_Q2_R3").contact);
  assert.ok(resolved.doctrines.civilian.experience > state.doctrines.civilian.experience);
});

Test("资源预留阻止超支，撤单和清空命令正确返还", () => {
  const limited = CreateInitialState();
  limited.resources.arms = 1;
  limited.units.find((unit) => unit.id === "Unit_MainForce_One").hexId = "Hex_Q5_R3";
  const built = QueueOrder(limited, {
    actionId: "sabotage",
    unitId: "Unit_Guerrilla_One",
    hexId: "Hex_Q6_R2",
    targetHexId: "Hex_Q6_R2",
  });
  assert.equal(built.reserved.arms, 1);
  const blocked = GetActionPreview(built, "sabotage", "Hex_Q6_R2", "Unit_MainForce_One");
  assert.equal(blocked.enabled, false);
  assert.match(blocked.reason, /预留|不足/);

  const removed = RemoveOrder(built, 0);
  assert.equal(removed.orders.length, 0);
  assert.equal(removed.commandPoints, removed.commandMax);
  assert.equal(removed.reserved.arms, 0);

  const cleared = ClearOrders(built);
  assert.equal(cleared.orders.length, 0);
  assert.equal(cleared.commandPoints, cleared.commandMax);
});

Test("真实UI参数会规范化目标，撤销移动会级联撤销依赖命令", () => {
  let planned = CreateInitialState();
  planned = QueueOrder(planned, {
    actionId: "move",
    unitId: "Unit_WorkTeam_One",
    hexId: "Hex_Q2_R3",
    targetHexId: "Hex_Q2_R1",
  });
  planned = QueueOrder(planned, {
    actionId: "buildClinic",
    unitId: "Unit_WorkTeam_One",
    hexId: "Hex_Q2_R3",
    targetHexId: "Hex_Q2_R1",
  });
  assert.equal(planned.orders.length, 2, planned.lastError || "移动后的建设应能排队");
  assert.equal(planned.orders[0].hexId, "Hex_Q2_R1");
  assert.equal(planned.orders[1].hexId, "Hex_Q2_R1");
  const removedMove = RemoveOrder(planned, 0);
  assert.equal(removedMove.orders.length, 0, "撤销移动必须同时撤销依赖该移动的后续行动");

  let production = CreateInitialState();
  production = QueueOrder(production, {
    actionId: "selfProduction",
    unitId: "Unit_WorkTeam_One",
    hexId: "Hex_Q2_R3",
    targetHexId: "Hex_Q1_R3",
  });
  const duplicate = QueueOrder(production, {
    actionId: "selfProduction",
    unitId: "Unit_Militia_North",
    hexId: "Hex_Q2_R1",
    targetHexId: "Hex_Q1_R3",
  });
  assert.equal(duplicate.orders.length, 1);
  assert.match(duplicate.lastError, /已经安排生产/);
});

Test("政策每回合只锁定一次，订单快照阻止排单后换策套利", () => {
  const state = CreateInitialState(20260729);
  const queued = QueueOrder(state, {
    actionId: "organize",
    unitId: "Unit_WorkTeam_One",
    hexId: "Hex_Q2_R3",
    targetHexId: "Hex_Q2_R3",
  });
  assert.deepEqual(queued.orders[0].policySnapshot, ["MassDiscipline", "FlexibleDispersion"]);
  assert.equal(queued.policyLock.locked, true);
  const switchedAfterOrder = SetPolicies(queued, []);
  assert.match(switchedAfterOrder.lastError, /已经锁定|排单后/);
  assert.deepEqual(switchedAfterOrder.policies, queued.policies);

  const tamperedPolicies = CloneState(queued);
  tamperedPolicies.policies = [];
  const resolved = ResolveTurn(tamperedPolicies);
  assert.equal(
    GetHex(resolved, "Hex_Q2_R3").contact - GetHex(state, "Hex_Q2_R3").contact,
    17,
    "结算必须读取锁定快照，不能读取排单后被篡改的政策列表",
  );

  const tamperedSnapshot = CloneState(queued);
  tamperedSnapshot.orders[0].policySnapshot = [];
  const rejected = ResolveTurn(tamperedSnapshot);
  assert.match(rejected.lastError, /不能结算/);

  const nextTurn = ResolveTurn(queued);
  const selectedOnce = SetPolicies(nextTurn, []);
  assert.equal(selectedOnce.lastError, null);
  const selectedTwice = SetPolicies(selectedOnce, ["MassDiscipline"]);
  assert.match(selectedTwice.lastError, /已经锁定/);
});

Test("固定种子结算完全确定且不使用刷新刷结果", () => {
  let planned = CreateInitialState(20260727);
  planned = QueueOrder(planned, {
    actionId: "organize",
    unitId: "Unit_WorkTeam_One",
    hexId: "Hex_Q2_R3",
    targetHexId: "Hex_Q2_R3",
  });
  const first = ResolveTurn(planned);
  const second = ResolveTurn(planned);
  assert.equal(SerializeState(first), SerializeState(second));
});

Test("战备直接影响伏击与扫荡战力，工作队不再充当战斗单位", () => {
  const BuildAmbush = (readiness) => {
    let state = CreateInitialState(44332211);
    const mainForce = state.units.find((unit) => unit.id === "Unit_MainForce_One");
    mainForce.hexId = "Hex_Q5_R2";
    mainForce.readiness = readiness;
    state = QueueOrder(state, {
      actionId: "ambush",
      unitId: mainForce.id,
      hexId: "Hex_Q6_R2",
      targetHexId: "Hex_Q6_R2",
    });
    assert.equal(state.orders.length, 1, state.lastError || "伏击反例应能排队");
    return ResolveTurn(state);
  };
  const readyAmbush = BuildAmbush(4);
  const depletedAmbush = BuildAmbush(1);
  assert.ok(readyAmbush.meters.contribution > depletedAmbush.meters.contribution);

  const BuildSweep = (readiness) => {
    const state = CreateInitialState(55667788);
    const target = state.hexes.find((hex) => hex.id === "Hex_Q2_R3");
    const mainForce = state.units.find((unit) => unit.id === "Unit_MainForce_One");
    mainForce.hexId = target.id;
    mainForce.readiness = readiness;
    target.warning = {
      turn: 1,
      kind: "Sweep",
      intensity: 3,
      text: "战备缩放反例",
    };
    return ResolveTurn(state);
  };
  const readyDefense = BuildSweep(4);
  const depletedDefense = BuildSweep(1);
  const readyTarget = GetHex(readyDefense, "Hex_Q2_R3");
  const depletedTarget = GetHex(depletedDefense, "Hex_Q2_R3");
  assert.ok(readyTarget.livelihood > depletedTarget.livelihood);
  assert.ok(
    readyDefense.ledger.affectedHouseholds < depletedDefense.ledger.affectedHouseholds,
    "低战备主力不能继续按满编战力减免扫荡损失",
  );
});

Test("军民协同防御只提供受限相邻支援，并受战备、补给与暴露约束", () => {
  const BuildSweep = ({
    targetId = "Hex_Q2_R3",
    mainForceHexId = "Hex_Q3_R3",
    readiness = 4,
    exposure = 20,
    coordinated = true,
    coordinatedPolicy = true,
    organizedNeighbor = false,
  } = {}) => {
    const state = CreateInitialState(55667789);
    state.doctrines.military.unlocked.push("IntelligenceBeforeAction", "MineAndSabotage", "AntiSweepDefense");
    if (coordinated) {
      state.doctrines.military.unlocked.push("CoordinatedDefense");
    }
    if (coordinatedPolicy) {
      state.policies = ["FlexibleDispersion", "CoordinatedAmbush"];
      state.policyLock.policyIds = [...state.policies];
    }
    state.meters.exposure = exposure;
    const target = state.hexes.find((hex) => hex.id === targetId);
    target.contact = Math.max(30, target.contact);
    target.warning = {
      turn: 1,
      kind: "Sweep",
      intensity: 3,
      text: "军民协同防御黑盒反例",
    };
    const mainForce = state.units.find((unit) => unit.id === "Unit_MainForce_One");
    mainForce.hexId = mainForceHexId;
    mainForce.readiness = readiness;
    if (organizedNeighbor) {
      const neighbor = state.hexes.find((hex) => hex.id === "Hex_Q2_R1");
      Object.assign(neighbor, {
        control: "player",
        contact: 100,
        hardship: 0,
        livelihood: 100,
        households: 30,
        originalHouseholds: 30,
      });
      mainForce.hexId = "Hex_Q5_R5";
    }
    const resolved = ResolveTurn(state);
    return {
      state: resolved,
      target: GetHex(resolved, targetId),
      sweep: resolved.ledger.civilianCosts.find((entry) => {
        return entry.type === "Sweep" && entry.villageId === targetId;
      }),
      mainForce: resolved.units.find((unit) => unit.id === mainForce.id),
    };
  };

  const adjacent = BuildSweep();
  const remote = BuildSweep({ mainForceHexId: "Hex_Q5_R5" });
  const noPolicy = BuildSweep({ coordinatedPolicy: false });
  const noDoctrine = BuildSweep({ coordinated: false, coordinatedPolicy: false });
  assert.ok(adjacent.target.livelihood > remote.target.livelihood);
  assert.ok(
    adjacent.sweep.households <= remote.sweep.households,
    `相邻协防户数 ${adjacent.sweep.households} 不得高于远端 ${remote.sweep.households}`,
  );
  assert.equal(noPolicy.sweep.livelihoodDamage, noDoctrine.sweep.livelihoodDamage);
  assert.equal(adjacent.mainForce.readiness, 3, "相邻主力协防后也必须承担一点战备消耗");
  assert.equal(remote.mainForce.readiness, 4, "远端主力不能被视为参战或承担战备消耗");

  const depleted = BuildSweep({ readiness: 1 });
  const exposed = BuildSweep({ exposure: 100 });
  assert.ok(adjacent.sweep.livelihoodDamage < depleted.sweep.livelihoodDamage);
  const GetLoggedSupport = (result) => Number(
    result.state.log.find((entry) => entry.includes("相邻支援折算"))?.match(/折算 ([\d.]+) 防御/)?.[1] || 0,
  );
  assert.ok(GetLoggedSupport(adjacent) > GetLoggedSupport(exposed));
  assert.equal(adjacent.state.meters.exposure, remote.state.meters.exposure + 1);

  const unsupportedRemoteVillage = BuildSweep({
    targetId: "Hex_Q4_R4",
    mainForceHexId: "Hex_Q1_R3",
  });
  const unsuppliedAdjacent = BuildSweep({
    targetId: "Hex_Q4_R4",
    mainForceHexId: "Hex_Q3_R4",
  });
  assert.equal(
    unsuppliedAdjacent.sweep.livelihoodDamage,
    unsupportedRemoteVillage.sweep.livelihoodDamage,
    "脱离驻地和交通站补给的相邻主力不能形成协防光环",
  );

  const isolatedVillage = BuildSweep({
    targetId: "Hex_Q4_R1",
    mainForceHexId: "Hex_Q5_R5",
  });
  const organizedVillage = BuildSweep({
    targetId: "Hex_Q4_R1",
    mainForceHexId: "Hex_Q5_R5",
    organizedNeighbor: true,
  });
  assert.ok(organizedVillage.sweep.livelihoodDamage < isolatedVillage.sweep.livelihoodDamage);
  assert.equal(
    organizedVillage.state.units.find((unit) => unit.id === "Unit_Militia_North").readiness,
    1,
  );

  const BuildDoubleSweep = (mainForceHexId) => {
    const state = CreateInitialState(55667790);
    state.doctrines.military.unlocked.push(
      "IntelligenceBeforeAction",
      "MineAndSabotage",
      "AntiSweepDefense",
      "CoordinatedDefense",
    );
    state.policies = ["FlexibleDispersion", "CoordinatedAmbush"];
    state.policyLock.policyIds = [...state.policies];
    state.units.find((unit) => unit.id === "Unit_MainForce_One").hexId = mainForceHexId;
    const northVillage = state.hexes.find((hex) => hex.id === "Hex_Q2_R1");
    const stoneVillage = state.hexes.find((hex) => hex.id === "Hex_Q2_R3");
    northVillage.warning = { turn: 1, kind: "Sweep", intensity: 3, text: "主攻" };
    stoneVillage.warning = { turn: 1, kind: "Sweep", intensity: 2, text: "次要方向" };
    return ResolveTurn(state);
  };
  const sharedReserve = BuildDoubleSweep("Hex_Q2_R2");
  const distantReserve = BuildDoubleSweep("Hex_Q5_R5");
  const GetSweepEntry = (state, villageId) => state.ledger.civilianCosts.find((entry) => {
    return entry.type === "Sweep" && entry.villageId === villageId;
  });
  assert.ok(
    GetSweepEntry(sharedReserve, "Hex_Q2_R1").livelihoodDamage
      < GetSweepEntry(distantReserve, "Hex_Q2_R1").livelihoodDamage,
    "共同预备队应优先支援强度更高的主攻方向",
  );
  assert.equal(
    GetSweepEntry(sharedReserve, "Hex_Q2_R3").livelihoodDamage,
    GetSweepEntry(distantReserve, "Hex_Q2_R3").livelihoodDamage,
    "同一支队不能在一次敌军阶段重复支援第二个扫荡目标",
  );
  assert.equal(
    sharedReserve.units.find((unit) => unit.id === "Unit_MainForce_One").readiness,
    3,
  );
});

Test("崩散单位至少整顿两回合并消耗药品，不能免费传送即战", () => {
  let state = CreateInitialState(77889900);
  state.units.find((unit) => unit.id === "Unit_MainForce_One").readiness = 0;
  state = ResolveTurn(state);
  let mainForce = state.units.find((unit) => unit.id === "Unit_MainForce_One");
  assert.equal(mainForce.recoveryRequired, true);
  assert.equal(mainForce.brokenTurnsRemaining, 2);
  assert.equal(mainForce.readiness, 0);
  assert.equal(mainForce.moves, 0);
  assert.equal(mainForce.hexId, "Hex_Q1_R3");

  const prematureRest = QueueOrder(state, {
    actionId: "rest",
    unitId: mainForce.id,
    hexId: mainForce.hexId,
    targetHexId: mainForce.hexId,
  });
  assert.equal(prematureRest.orders.length, 0);
  assert.match(prematureRest.lastError, /隐蔽整顿/);

  state = ResolveTurn(state);
  assert.equal(state.units.find((unit) => unit.id === mainForce.id).brokenTurnsRemaining, 1);
  state = ResolveTurn(state);
  mainForce = state.units.find((unit) => unit.id === mainForce.id);
  assert.equal(mainForce.brokenTurnsRemaining, 0);
  assert.equal(mainForce.readiness, 0);
  assert.equal(mainForce.moves, 0);

  const medicineBefore = state.resources.medicine;
  const recoveryOrder = QueueOrder(state, {
    actionId: "rest",
    unitId: mainForce.id,
    hexId: mainForce.hexId,
    targetHexId: mainForce.hexId,
  });
  assert.equal(recoveryOrder.orders.length, 1, recoveryOrder.lastError || "整顿期满后应能补充整编");
  assert.equal(recoveryOrder.reserved.medicine, 1);
  state = ResolveTurn(recoveryOrder);
  mainForce = state.units.find((unit) => unit.id === mainForce.id);
  assert.equal(mainForce.recoveryRequired, false);
  assert.equal(mainForce.readiness, 1);
  assert.ok(state.resources.medicine <= medicineBefore - 1);
});

Test("补给封锁约束远端单位与生产，交通站或工作队可恢复连接", () => {
  const disconnected = CreateInitialState(1357911);
  disconnected.units.find((unit) => unit.id === "Unit_MainForce_One").hexId = "Hex_Q4_R4";
  let disconnectedResult = ResolveTurn(disconnected);
  disconnectedResult = ResolveTurn(disconnectedResult);
  const disconnectedForce = disconnectedResult.units.find((unit) => unit.id === "Unit_MainForce_One");
  assert.equal(disconnectedForce.outOfSupplyTurns, 2);
  assert.ok(disconnectedForce.readiness < disconnectedForce.maximumReadiness);

  const connected = CreateInitialState(1357911);
  connected.units.find((unit) => unit.id === "Unit_MainForce_One").hexId = "Hex_Q4_R4";
  connected.hexes.find((hex) => hex.id === "Hex_Q4_R4").institution = "Station";
  let connectedResult = ResolveTurn(connected);
  connectedResult = ResolveTurn(connectedResult);
  const connectedForce = connectedResult.units.find((unit) => unit.id === "Unit_MainForce_One");
  assert.equal(connectedForce.outOfSupplyTurns, 0);
  assert.equal(connectedForce.readiness, connectedForce.maximumReadiness);

  const remote = CreateInitialState(2468024);
  remote.hexes.find((hex) => hex.id === "Hex_Q4_R4").contact = 50;
  const blockedProduction = QueueOrder(remote, {
    actionId: "selfProduction",
    hexId: "Hex_Q4_R4",
    targetHexId: "Hex_Q4_R4",
  });
  assert.equal(blockedProduction.orders.length, 0);
  assert.match(blockedProduction.lastError, /工作队|本地劳力/);

  const stationLinked = CloneState(remote);
  stationLinked.hexes.find((hex) => hex.id === "Hex_Q2_R3").institution = "Station";
  const linkedProduction = QueueOrder(stationLinked, {
    actionId: "selfProduction",
    hexId: "Hex_Q4_R4",
    targetHexId: "Hex_Q4_R4",
  });
  assert.equal(linkedProduction.orders.length, 1, linkedProduction.lastError || "交通站应连接远端生产");

  const workTeamLinked = CloneState(remote);
  workTeamLinked.units.find((unit) => unit.id === "Unit_WorkTeam_One").hexId = "Hex_Q4_R4";
  const onSiteProduction = QueueOrder(workTeamLinked, {
    actionId: "selfProduction",
    unitId: "Unit_WorkTeam_One",
    hexId: "Hex_Q4_R4",
    targetHexId: "Hex_Q4_R4",
  });
  assert.equal(onSiteProduction.orders.length, 1, onSiteProduction.lastError || "驻村工作队应替代远端交通连接");
});

Test("敌军作战计划在玩家下令前锁定，侦察只提高清晰度", () => {
  const state = CreateInitialState(20260729);
  const lockedPlan = CloneState(state.enemyPlanning.currentPlan);
  assert.equal(lockedPlan.locked, true);
  assert.equal(lockedPlan.executionTurn, 1);
  assert.ok(lockedPlan.primaryTargetId);
  assert.ok(lockedPlan.feintTargetIds.length >= 1);
  assert.ok(lockedPlan.routeProtectionIds.length >= 1);
  assert.ok(lockedPlan.intentBudgets.mainAssault >= 2);
  assert.ok(lockedPlan.intentBudgets.feint >= 2);
  assert.ok(lockedPlan.intentBudgets.routeProtection >= 1);
  assert.ok(lockedPlan.intentBudgets.pacification >= 1);
  assert.ok(lockedPlan.reserveBudget >= 1);

  const queued = QueueOrder(state, {
    actionId: "recon",
    unitId: "Unit_Guerrilla_One",
    hexId: "Hex_Q5_R3",
    targetHexId: "Hex_Q5_R3",
  });
  assert.equal(queued.orders.length, 1, queued.lastError || "侦察应能入列");
  assert.deepEqual(
    queued.enemyPlanning.currentPlan,
    lockedPlan,
    "排队命令不能重掷、改写或偷看敌军锁定计划",
  );

  const resolved = ResolveTurn(queued);
  const archivedPlan = resolved.enemyPlanning.planHistory.find((plan) => plan.executionTurn === 1);
  assert.equal(archivedPlan.fingerprint, lockedPlan.fingerprint);
  assert.equal(archivedPlan.primaryTargetId, lockedPlan.primaryTargetId);
  assert.deepEqual(archivedPlan.intentBudgets, lockedPlan.intentBudgets);
  assert.equal(archivedPlan.reconClarity, lockedPlan.reconClarity + 1);
  assert.equal(resolved.enemyPlanning.currentPlan.executionTurn, 2);
  assert.equal(resolved.enemyPlanning.currentPlan.reconClarity, 1);
});

Test("敌军计划只使用可观察信息，不读取隐藏单位或未执行命令", () => {
  const baseline = CreateInitialState(88776655);
  const baselineBeforePlanning = SerializeState(baseline);
  const obscured = CloneState(baseline);
  obscured.units.forEach((unit, index) => {
    unit.hexId = index % 2 === 0 ? "Hex_Q0_R0" : "Hex_Q8_R6";
    unit.readiness = index;
    unit.visible = false;
  });
  obscured.enemies.forEach((enemy) => {
    enemy.hexId = "Hex_Q8_R0";
    enemy.intent = "测试中不应成为决策输入";
  });
  obscured.orders = [{
    id: "FutureHiddenOrder",
    actionId: "sabotage",
    unitId: "Unit_Guerrilla_One",
    targetHexId: "Hex_Q6_R4",
    hexId: "Hex_Q6_R4",
    cost: { command: 1, arms: 1 },
  }];
  obscured.resources.intel = 99;
  obscured.meters.people = 1;
  obscured.meters.network = 99;
  obscured.hexes.forEach((hex, index) => {
    hex.visible = index % 2 === 0;
    if (hex.feature === "Village") {
      hex.contact = 100 - index;
      hex.hardship = index;
      hex.livelihood = Math.max(1, 100 - index);
    }
  });

  assert.deepEqual(
    GetEnemyObservableSnapshot(obscured, 4),
    GetEnemyObservableSnapshot(baseline, 4),
    "敌军可观察快照不得包含隐藏兵力、未执行命令或内部民生数值",
  );
  const baselinePlan = GenerateEnemyOperationalPlan(baseline, 4);
  const obscuredPlan = GenerateEnemyOperationalPlan(obscured, 4);
  assert.equal(SerializeState(baseline), baselineBeforePlanning, "计划生成器必须保持纯函数语义");
  assert.equal(obscuredPlan.fingerprint, baselinePlan.fingerprint);
  assert.equal(obscuredPlan.primaryTargetId, baselinePlan.primaryTargetId);

  const exposed = CloneState(baseline);
  exposed.meters.exposure += 20;
  assert.notEqual(
    GenerateEnemyOperationalPlan(exposed, 4).fingerprint,
    baselinePlan.fingerprint,
    "全局暴露属于敌军可观察信息，应能改变后续计划",
  );
});

Test("连续破袭会使后续计划提高护路抢修预算并盯紧同一路段", () => {
  let state = CreateInitialState(19410918);
  state = QueueOrder(state, {
    actionId: "move",
    unitId: "Unit_Guerrilla_One",
    hexId: "Hex_Q5_R4",
    targetHexId: "Hex_Q5_R4",
  });
  state = QueueOrder(state, {
    actionId: "sabotage",
    unitId: "Unit_Guerrilla_One",
    hexId: "Hex_Q6_R4",
    targetHexId: "Hex_Q6_R4",
  });
  assert.equal(state.orders.length, 2, state.lastError || "首次破袭命令应能执行");
  state = ResolveTurn(state);
  const afterFirstSabotage = CloneState(state.enemyPlanning.currentPlan);
  assert.equal(afterFirstSabotage.routeProtectionIds[0], "Hex_Q6_R4");

  state = ResolveTurn(state);
  assert.equal(GetHex(state, "Hex_Q6_R4").railDisabledTurns, 0);
  state = QueueOrder(state, {
    actionId: "sabotage",
    unitId: "Unit_Guerrilla_One",
    hexId: "Hex_Q6_R4",
    targetHexId: "Hex_Q6_R4",
  });
  assert.equal(state.orders.length, 1, state.lastError || "同一路段恢复后应可再次破袭");
  state = ResolveTurn(state);
  const afterRepeatedSabotage = state.enemyPlanning.currentPlan;
  assert.equal(state.enemyPlanning.routeMemory.sabotageByHexId.Hex_Q6_R4, 2);
  assert.equal(afterRepeatedSabotage.routeProtectionIds[0], "Hex_Q6_R4");
  assert.ok(
    afterRepeatedSabotage.intentBudgets.routeProtection
      > afterFirstSabotage.intentBudgets.routeProtection,
    "连续破袭必须提高护路与抢修权重",
  );
});

Test("佯动征候保留战略不确定性且不会提前泄露主攻", () => {
  const configurations = new Set();
  for (const seed of [17, 29, 41, 53, 67, 79, 97, 113, 131, 149, 167, 181]) {
    const state = CreateInitialState(seed);
    const plan = state.enemyPlanning.currentPlan;
    const briefing = GetTurnBriefing(state);
    configurations.add(`${plan.primaryTargetId}|${plan.feintTargetIds.join(",")}`);
    assert.notEqual(plan.primaryTargetId, plan.feintTargetIds[0]);
    assert.equal(briefing.enemySignals.locked, true);
    assert.equal(briefing.enemySignals.likelyMainTargetId, null);
    assert.ok(briefing.enemySignals.possibleDirections.length >= 2);
    assert.match(briefing.enemySignals.reports.join(" "), /佯动|真假方向/);
  }
  assert.ok(configurations.size >= 3, "不同种子应形成多种主攻—佯动组合");
});

Test("铁路破袭同时提高战略牵制与暴露", () => {
  let state = CreateInitialState();
  state.meters.exposure = 55;
  state = QueueOrder(state, {
    actionId: "move",
    unitId: "Unit_Guerrilla_One",
    hexId: "Hex_Q5_R4",
    targetHexId: "Hex_Q5_R4",
  });
  state = QueueOrder(state, {
    actionId: "sabotage",
    unitId: "Unit_Guerrilla_One",
    hexId: "Hex_Q6_R4",
    targetHexId: "Hex_Q6_R4",
  });
  assert.equal(state.orders.length, 2, state.lastError || "移动后应能破袭相邻铁路");
  const exposureBefore = state.meters.exposure;
  const contributionBefore = state.meters.contribution;
  const resolved = ResolveTurn(state);
  assert.ok(resolved.meters.exposure > exposureBefore);
  assert.ok(resolved.meters.contribution > contributionBefore);
  assert.ok(resolved.doctrines.military.experience >= 6);
  assert.ok(
    GetHex(resolved, "Hex_Q6_R4").railDisabledTurns >= 1,
    "敌军抢修与自然衰减不能在破袭当回合把两回合停运直接清零",
  );
  assert.ok(
    resolved.hexes.some((hex) => hex.warning?.turn === 2),
    "破袭推高暴露后，扫荡风险必须预告到下一回合，而非当回合无预警结算",
  );
  assert.equal(
    resolved.ledger.civilianCosts.filter((entry) =>
      entry.turn === 1 && ["扫荡", "大规模扫荡"].includes(entry.source)
    ).length,
    0,
    "暴露触发的计划扫荡不得在生成警告的同一回合执行",
  );
});

Test("保护性疏散显著减轻扫荡损失，且不会自动算作永久流离", () => {
  const base = CreateInitialState(19420501);
  base.turn = 9;
  base.phase = "planning";
  base.commandPoints = base.commandMax;
  const target = base.hexes.find((hex) => hex.id === "Hex_Q2_R3");
  target.warning = {
    turn: 9,
    kind: "Sweep",
    intensity: 3,
    text: "扫荡可能指向石门村",
  };
  const workTeam = base.units.find((unit) => unit.id === "Unit_WorkTeam_One");
  workTeam.hexId = target.id;

  const unprepared = ResolveTurn(CloneState(base));
  let preparedPlan = QueueOrder(base, {
    actionId: "evacuate",
    unitId: workTeam.id,
    hexId: target.id,
    targetHexId: target.id,
  });
  assert.equal(preparedPlan.orders.length, 1, preparedPlan.lastError || "疏散应可入列");
  const prepared = ResolveTurn(preparedPlan);
  const unpreparedTarget = GetHex(unprepared, target.id);
  const preparedTarget = GetHex(prepared, target.id);
  const unpreparedSweep = unprepared.ledger.civilianCosts.find((entry) => {
    return entry.type === "Sweep" && entry.villageId === target.id;
  });
  const preparedSweep = prepared.ledger.civilianCosts.find((entry) => {
    return entry.type === "Sweep" && entry.villageId === target.id;
  });
  assert.ok(preparedTarget.livelihood > unpreparedTarget.livelihood);
  assert.ok(preparedSweep.households < unpreparedSweep.households);
  assert.equal(prepared.ledger.displacedHouseholds, 0);
  assert.equal(preparedTarget.households, target.households);
  assert.ok(
    prepared.ledger.civilianCosts.some((entry) =>
      entry.type === "ProtectiveShelter"
      && entry.temporary === true
      && entry.villageId === target.id
    ),
  );
  assert.ok(
    prepared.log.some((entry) => entry.includes("未形成新增可确认永久流离")),
    "威胁解除后必须核验去向，不能把保护性安置直接记成永久流离",
  );
  assert.equal(GetVictoryAssessment(prepared).civilianCostLedger.excludedFromScore, true);
});

Test("只有侵略破坏导致无法返村时，临时安置才转为已确认流离", () => {
  const base = CreateInitialState(19420502);
  base.turn = 9;
  base.phase = "planning";
  base.commandPoints = base.commandMax;
  const target = base.hexes.find((hex) => hex.id === "Hex_Q2_R3");
  target.livelihood = 1;
  target.warning = {
    turn: 9,
    kind: "Sweep",
    intensity: 3,
    text: "扫荡可能指向石门村",
  };
  const workTeam = base.units.find((unit) => unit.id === "Unit_WorkTeam_One");
  workTeam.hexId = target.id;
  const plan = QueueOrder(base, {
    actionId: "evacuate",
    unitId: workTeam.id,
    hexId: target.id,
    targetHexId: target.id,
  });
  const resolved = ResolveTurn(plan);
  const resolvedTarget = GetHex(resolved, target.id);
  const displacement = resolved.ledger.civilianCosts.find((entry) =>
    entry.type === "Displacement" && entry.villageId === target.id
  );
  assert.ok(displacement?.households > 0);
  assert.equal(resolved.ledger.displacedHouseholds, displacement.households);
  assert.equal(resolvedTarget.households, target.households - displacement.households);
  assert.match(displacement.text, /侵略军扫荡破坏.*责任属于实施侵略与破坏者/);
});

Test("终局结算不会遗漏仍在临时安置中的已确认流离", () => {
  const state = CreateInitialState(19421231);
  state.turn = turnLimit;
  state.phase = "planning";
  state.commandPoints = state.commandMax;
  const target = state.hexes.find((hex) => hex.id === "Hex_Q2_R3");
  target.livelihood = 0;
  target.evacuated = true;
  target.evacuationProtection = 1;
  target.shelteredHouseholds = 15;
  state.ledger.villageAbandonments.push(target.id);

  const resolved = ResolveTurn(state);
  const resolvedTarget = GetHex(resolved, target.id);
  const displacement = resolved.ledger.civilianCosts.find((entry) =>
    entry.type === "Displacement" && entry.villageId === target.id
  );
  assert.equal(resolved.gameOver, true);
  assert.equal(resolvedTarget.shelteredHouseholds, 0);
  assert.equal(resolved.ledger.displacedHouseholds, 15);
  assert.equal(displacement?.households, 15);
  assert.match(displacement?.text ?? "", /责任属于实施侵略与破坏者/);
});

Test("每村单队列会完成专业机构，并产生持续建设收益", () => {
  let state = CreateInitialState();
  state = QueueOrder(state, {
    actionId: "buildStation",
    unitId: "Unit_WorkTeam_One",
    hexId: "Hex_Q2_R3",
    targetHexId: "Hex_Q2_R3",
  });
  state = ResolveTurn(state);
  assert.ok(GetHex(state, "Hex_Q2_R3").construction);
  const doubleBuildPreview = GetActionPreview(
    state,
    "buildClinic",
    "Hex_Q2_R3",
    "Unit_WorkTeam_One",
  );
  assert.equal(doubleBuildPreview.enabled, false);
  assert.match(doubleBuildPreview.reason, /一个专业机构|建设队列/);

  let constructionTurns = 0;
  while (GetHex(state, "Hex_Q2_R3").construction && constructionTurns < 8) {
    state = ResolveTurn(state);
    constructionTurns += 1;
  }
  const village = GetHex(state, "Hex_Q2_R3");
  assert.equal(village.institution, "Station");
  assert.equal(village.construction, null);
  assert.ok(constructionTurns >= 3, "建设速度必须受本村有效劳力约束");
  const intelAfterCompletion = state.resources.intel;
  state = ResolveTurn(state);
  assert.ok(state.resources.intel > intelAfterCompletion);
});

Test("地块改良进入持续产出系统", () => {
  let state = CreateInitialState();
  state = QueueOrder(state, {
    actionId: "improveTile",
    unitId: "Unit_WorkTeam_One",
    hexId: "Hex_Q3_R3",
    targetHexId: "Hex_Q3_R3",
  });
  assert.equal(state.orders.length, 1, state.lastError || "相邻地块应可改良");
  state = ResolveTurn(state);
  assert.equal(GetHex(state, "Hex_Q3_R3").improvement, "TerracedFields");
});

Test("改良订单保存显式选择，同一共享地块每回合只能服务一个村庄", () => {
  const base = CreateInitialState(99887766);
  const preview = GetActionPreview(base, "improveTile", "Hex_Q2_R4", "Unit_WorkTeam_One");
  assert.deepEqual(
    preview.improvementOptions.map((option) => option.improvementId),
    ["TerracedFields", "HiddenWorkshop"],
  );
  assert.equal(preview.defaultImprovementId, "TerracedFields");

  let terraced = QueueOrder(base, {
    actionId: "improveTile",
    unitId: "Unit_WorkTeam_One",
    hexId: "Hex_Q2_R4",
    targetHexId: "Hex_Q2_R4",
    improvementId: "TerracedFields",
  });
  assert.equal(terraced.orders[0].improvementId, "TerracedFields");
  terraced = ResolveTurn(terraced);
  assert.equal(GetHex(terraced, "Hex_Q2_R4").improvement, "TerracedFields");

  let workshop = QueueOrder(base, {
    actionId: "improveTile",
    unitId: "Unit_WorkTeam_One",
    hexId: "Hex_Q2_R4",
    targetHexId: "Hex_Q2_R4",
    improvementId: "HiddenWorkshop",
  });
  assert.equal(workshop.orders[0].improvementId, "HiddenWorkshop");
  workshop = ResolveTurn(workshop);
  assert.equal(GetHex(workshop, "Hex_Q2_R4").improvement, "HiddenWorkshop");

  const invalid = QueueOrder(base, {
    actionId: "improveTile",
    unitId: "Unit_WorkTeam_One",
    hexId: "Hex_Q2_R4",
    targetHexId: "Hex_Q2_R4",
    improvementId: "ObservationPost",
  });
  assert.equal(invalid.orders.length, 0);
  assert.match(invalid.lastError, /不适合/);

  let shared = CreateInitialState(11223344);
  shared.hexes.find((hex) => hex.id === "Hex_Q3_R1").improvement = "ObservationPost";
  shared.hexes.find((hex) => hex.id === "Hex_Q4_R1").contact = 50;
  shared.hexes.find((hex) => hex.id === "Hex_Q2_R3").institution = "Station";
  shared = QueueOrder(shared, {
    actionId: "selfProduction",
    hexId: "Hex_Q2_R1",
    targetHexId: "Hex_Q2_R1",
  });
  shared = QueueOrder(shared, {
    actionId: "selfProduction",
    hexId: "Hex_Q4_R1",
    targetHexId: "Hex_Q4_R1",
  });
  assert.equal(shared.orders.length, 2, shared.lastError || "两个村庄应能分别组织劳力");
  shared = ResolveTurn(shared);
  assert.equal(shared.lastTurnEconomy.turn, 1);
  assert.equal(
    shared.lastTurnEconomy.workedImprovementByHexId.Hex_Q3_R1,
    "Hex_Q2_R1",
    "共享改良必须由首个合法村庄占用，后续村庄不能重复计算",
  );
});

Test("村庄产出和建设按有效户数劳力缩放，零户不再凭空运行", () => {
  const RunLaborCase = (households) => {
    const state = CreateInitialState(31415926);
    for (const village of state.hexes.filter((hex) => hex.feature === "Village")) {
      village.households = 0;
      village.contact = 0;
    }
    const target = state.hexes.find((hex) => hex.id === "Hex_Q2_R3");
    target.households = households;
    target.contact = 60;
    target.hardship = 0;
    target.livelihood = 80;
    target.institution = "Cooperative";
    state.resources.grain = 50;
    return ResolveTurn(state);
  };
  const fullLabor = RunLaborCase(42);
  const halfLabor = RunLaborCase(21);
  const noLabor = RunLaborCase(0);
  assert.ok(fullLabor.resources.grain > halfLabor.resources.grain);
  assert.ok(halfLabor.resources.grain > noLabor.resources.grain);

  const stalled = CreateInitialState(27182818);
  const village = stalled.hexes.find((hex) => hex.id === "Hex_Q2_R3");
  village.households = 0;
  village.construction = {
    institutionId: "Station",
    progress: 3,
    required: 7,
    cost: 7,
    startedTurn: 1,
  };
  const stalledResult = ResolveTurn(stalled);
  assert.equal(GetHex(stalledResult, village.id).construction.progress, 3);
});

Test("生产自救每地每阶段递减封顶，路线经验每阶段最多四点", () => {
  let state = CreateInitialState(42424242);
  const productionTargets = ["Hex_Q1_R3", "Hex_Q2_R3", "Hex_Q2_R1", "Hex_Q1_R5"];
  for (const targetHexId of productionTargets) {
    state = QueueOrder(state, {
      actionId: "selfProduction",
      hexId: targetHexId,
      targetHexId,
    });
  }
  assert.equal(state.orders.length, 4, state.lastError || "四处合法劳力应能同时组织");
  state = ResolveTurn(state);
  assert.equal(state.productionLedger.civilianExperienceByStage.Stage_1, 4);
  assert.equal(state.doctrines.civilian.experience, 4);

  for (const targetHexId of productionTargets) {
    state = QueueOrder(state, {
      actionId: "selfProduction",
      hexId: targetHexId,
      targetHexId,
    });
  }
  state = ResolveTurn(state);
  assert.equal(state.productionLedger.civilianExperienceByStage.Stage_1, 4);
  assert.equal(state.doctrines.civilian.experience, 4);
  assert.ok(productionTargets.every((targetHexId) => {
    return state.productionLedger.usesByStage.Stage_1[targetHexId] === 2;
  }));

  const capped = QueueOrder(state, {
    actionId: "selfProduction",
    hexId: "Hex_Q2_R3",
    targetHexId: "Hex_Q2_R3",
  });
  assert.equal(capped.orders.length, 0);
  assert.match(capped.lastError, /阶段.*上限/);
});

Test("84点经验不能免费连续解完整科技链", () => {
  let state = CreateInitialState(84848484);
  state.doctrines.civilian.experience = 84;
  state = UnlockDoctrine(state, "RentAndInterestReduction");
  assert.equal(state.lastError, null);
  assert.equal(state.doctrines.civilian.experience, 68);
  const sameTurnChain = UnlockDoctrine(state, "CooperativeProduction");
  assert.match(sameTurnChain.lastError, /每回合只能推进一层/);

  state.turn = 2;
  state = UnlockDoctrine(state, "CooperativeProduction");
  assert.equal(state.lastError, null);
  assert.equal(state.doctrines.civilian.experience, 48);
  state.turn = 3;
  state = UnlockDoctrine(state, "DemocraticBaseGovernance");
  assert.equal(state.lastError, null);
  assert.equal(state.doctrines.civilian.experience, 24);
  state.turn = 4;
  state = UnlockDoctrine(state, "DeepShelterNetwork");
  assert.equal(state.lastError, null);
  assert.equal(state.doctrines.civilian.experience, 0);
  assert.equal(state.doctrines.civilian.spentExperience, 84);

  const ordered = QueueOrder(state, {
    actionId: "recon",
    unitId: "Unit_Guerrilla_One",
    hexId: "Hex_Q5_R3",
    targetHexId: "Hex_Q5_R3",
  });
  ordered.doctrines.military.experience = 100;
  const afterOrderUnlock = UnlockDoctrine(ordered, "IntelligenceBeforeAction");
  assert.match(afterOrderUnlock.lastError, /已有命令/);
  assert.equal(afterOrderUnlock.doctrines.military.unlocked.includes("IntelligenceBeforeAction"), false);

  const completed = CloneState(state);
  completed.gameOver = true;
  completed.phase = "complete";
  const terminalUnlock = UnlockDoctrine(completed, "IntelligenceBeforeAction");
  assert.match(terminalUnlock.lastError, /当前阶段/);
});

Test("重复侦察按阶段递减封顶，不能空转刷满情报和军事路线", () => {
  let state = CreateInitialState(51515151);
  state.units.find((unit) => unit.id === "Unit_Guerrilla_One").hexId = "Hex_Q1_R3";
  while (!state.gameOver) {
    const queued = QueueOrder(state, {
      actionId: "recon",
      unitId: "Unit_Guerrilla_One",
      hexId: "Hex_Q1_R3",
      targetHexId: "Hex_Q1_R3",
    });
    state = ResolveTurn(queued.orders.length > 0 ? queued : state);
  }
  assert.equal(state.intelligenceLedger.reconUsesByStage.Stage_1.Unit_Guerrilla_One, 2);
  assert.equal(state.intelligenceLedger.reconUsesByStage.Stage_4.Unit_Guerrilla_One, 2);
  assert.equal(state.doctrines.military.experience, 16);
  assert.ok(state.resources.intel < 30, `重复侦察后的情报不应膨胀到 ${state.resources.intel}`);
});

Test("全部稀缺资源归零时仍有昂贵且有代价的恢复路径", () => {
  const state = CreateInitialState(60606060);
  for (const resourceId of Object.keys(state.resources)) {
    state.resources[resourceId] = 0;
  }
  state.units.find((unit) => unit.id === "Unit_WorkTeam_One").hexId = "Hex_Q1_R3";
  const exposureBefore = state.meters.exposure;
  const peopleBefore = state.meters.people;
  const unityBefore = state.meters.unity;
  const disciplineBefore = state.meters.discipline;
  const queued = QueueOrder(state, {
    actionId: "emergencySupply",
    unitId: "Unit_WorkTeam_One",
    hexId: "Hex_Q1_R3",
    targetHexId: "Hex_Q1_R3",
  });
  assert.equal(queued.orders.length, 1, queued.lastError || "归零状态必须保留恢复路径");
  assert.equal(queued.orders[0].cost.command, 2);
  assert.equal(queued.orders[0].cost.cadres, 0, "干部归零时由驻地留守联络人员保底，不能锁死战役");
  const resolved = ResolveTurn(queued);
  for (const resourceId of ["grain", "arms", "medicine", "intel", "cadres"]) {
    assert.ok(resolved.resources[resourceId] > 0, `${resourceId}必须恢复最低周转量`);
  }
  assert.ok(resolved.meters.exposure >= exposureBefore + 10);
  assert.equal(resolved.meters.people, peopleBefore, "人民安全与群众基础不是可消费的接济货币");
  assert.ok(resolved.meters.unity < unityBefore);
  assert.ok(resolved.meters.discipline < disciplineBefore);
  assert.equal(resolved.emergencySupplyCooldownUntil, 3);

  const cooling = CloneState(resolved);
  for (const resourceId of Object.keys(cooling.resources)) {
    cooling.resources[resourceId] = 0;
  }
  const blockedByCooldown = QueueOrder(cooling, {
    actionId: "emergencySupply",
    hexId: "Hex_Q1_R3",
    targetHexId: "Hex_Q1_R3",
  });
  assert.equal(blockedByCooldown.orders.length, 0);
  assert.match(blockedByCooldown.lastError, /重新隐蔽|第 3 回合/);
  const afterGap = ResolveTurn(cooling);
  for (const resourceId of Object.keys(afterGap.resources)) {
    afterGap.resources[resourceId] = 0;
  }
  const availableAgain = QueueOrder(afterGap, {
    actionId: "emergencySupply",
    hexId: "Hex_Q1_R3",
    targetHexId: "Hex_Q1_R3",
  });
  assert.equal(availableAgain.orders.length, 1, availableAgain.lastError || "线路冷却一整回合后应可再次调运");

  const cadreFunded = CreateInitialState(60606062);
  cadreFunded.resources.grain = 0;
  cadreFunded.units.find((unit) => unit.id === "Unit_WorkTeam_One").hexId = "Hex_Q1_R3";
  const cadreFundedOrder = QueueOrder(cadreFunded, {
    actionId: "emergencySupply",
    unitId: "Unit_WorkTeam_One",
    hexId: "Hex_Q1_R3",
    targetHexId: "Hex_Q1_R3",
  });
  assert.equal(cadreFundedOrder.reserved.cadres, 1, "仍有交通骨干时，邻区调运必须占用一名干部");

  const noWorkTeam = CreateInitialState(60606061);
  for (const resourceId of Object.keys(noWorkTeam.resources)) {
    noWorkTeam.resources[resourceId] = 0;
  }
  const workTeam = noWorkTeam.units.find((unit) => unit.id === "Unit_WorkTeam_One");
  workTeam.readiness = 0;
  workTeam.recoveryRequired = true;
  workTeam.brokenTurnsRemaining = 1;
  const reserveLaborOrder = QueueOrder(noWorkTeam, {
    actionId: "emergencySupply",
    hexId: "Hex_Q1_R3",
    targetHexId: "Hex_Q1_R3",
  });
  assert.equal(
    reserveLaborOrder.orders.length,
    1,
    reserveLaborOrder.lastError || "工作队崩散时驻地留守交通人员仍应提供昂贵保底路径",
  );
});

Test("群众路线与军事路线独立解锁，政策严格限制为两个槽", () => {
  let state = CreateInitialState();
  for (const doctrineId of [
    "RentAndInterestReduction",
    "CooperativeProduction",
    "DemocraticBaseGovernance",
    "DeepShelterNetwork",
    "IntelligenceBeforeAction",
    "MineAndSabotage",
    "AntiSweepDefense",
    "CoordinatedDefense",
  ]) {
    const definition = doctrineDefinitions.find((doctrine) => doctrine.id === doctrineId);
    const unlockCost = GetDoctrineExperienceCost(definition);
    state.turn = definition.tier;
    state.doctrines[definition.tree].experience += unlockCost;
    const experienceBefore = state.doctrines[definition.tree].experience;
    state = UnlockDoctrine(state, doctrineId);
    assert.equal(state.lastError, null, `${doctrineId}应能按前置顺序解锁`);
    assert.equal(
      state.doctrines[definition.tree].experience,
      experienceBefore - unlockCost,
      `${doctrineId}必须实际消耗路线经验`,
    );
  }
  assert.equal(state.commandMax, 5);
  const antiSweepPath = [
    "IntelligenceBeforeAction",
    "MineAndSabotage",
    "AntiSweepDefense",
  ].map((doctrineId) => GetDoctrineExperienceCost(
    doctrineDefinitions.find((doctrine) => doctrine.id === doctrineId),
  ));
  assert.deepEqual(antiSweepPath, [16, 18, 22]);
  assert.equal(
    antiSweepPath.reduce((total, cost) => total + cost, 0),
    56,
    "反扫荡体系应能以三回合逐层投入累计 56 点军事经验解锁",
  );

  const selected = SetPolicies(state, ["MutualAidProduction", "MilitiaScreen"]);
  assert.deepEqual(selected.policies, ["MutualAidProduction", "MilitiaScreen"]);
  const tooMany = SetPolicies(selected, ["MassDiscipline", "FlexibleDispersion", "MilitiaScreen"]);
  assert.match(tooMany.lastError, /至多两个/);
  assert.deepEqual(tooMany.policies, selected.policies);
});

Test("有效存档往返，损坏或错版存档安全回退", () => {
  const state = CreateInitialState(7654321);
  state.emergencySupplyCooldownUntil = 3;
  const roundTrip = DeserializeState(SerializeState(state));
  assert.equal(roundTrip.seed, state.seed);
  assert.equal(roundTrip.hexes.length, 63);
  assert.equal(roundTrip.turn, 1);
  assert.equal(SerializeState(roundTrip), SerializeState(state));
  assert.equal(roundTrip.emergencySupplyCooldownUntil, 3);
  assert.deepEqual(roundTrip.enemyPlanning, state.enemyPlanning);
  assert.equal(
    GenerateEnemyOperationalPlan(roundTrip, 5).fingerprint,
    GenerateEnemyOperationalPlan(state, 5).fingerprint,
    "存档往返不能改变未来计划的确定性",
  );

  const completed = RunCampaign(12345, (current) => current);
  const completedRoundTrip = DeserializeState(SerializeState(completed));
  assert.equal(completedRoundTrip.gameOver, true);
  assert.equal(completedRoundTrip.commandPoints, 0, "终局存档载入后不能恢复行动令");

  const corrupt = DeserializeState("{not valid json");
  assert.equal(corrupt.turn, 1);
  assert.equal(corrupt.hexes.length, 63);
  assert.match(corrupt.lastError, /存档损坏/);

  const wrongVersion = JSON.parse(SerializeState(state));
  wrongVersion.saveVersion = saveVersion + 1;
  const recovered = DeserializeState(JSON.stringify(wrongVersion));
  assert.match(recovered.lastError, /存档损坏/);

  const missingDoctrineBranch = JSON.parse(SerializeState(state));
  delete missingDoctrineBranch.doctrines.civilian;
  const safelyRecovered = DeserializeState(JSON.stringify(missingDoctrineBranch));
  assert.equal(safelyRecovered.turn, 1);
  assert.equal(safelyRecovered.hexes.length, 63);
  assert.match(safelyRecovered.lastError, /存档损坏/);

  const legacyCooldown = JSON.parse(SerializeState(state));
  delete legacyCooldown.emergencySupplyCooldownUntil;
  const migratedCooldown = DeserializeState(JSON.stringify(legacyCooldown));
  assert.equal(migratedCooldown.emergencySupplyCooldownUntil, 0);

  const legacyEvacuation = JSON.parse(SerializeState(state));
  legacyEvacuation.saveVersion = 1;
  const legacyVillage = legacyEvacuation.hexes.find((hex) => hex.id === "Hex_Q2_R3");
  legacyVillage.households -= 12;
  legacyVillage.evacuated = true;
  legacyVillage.evacuationProtection = 1;
  delete legacyVillage.shelteredHouseholds;
  legacyEvacuation.ledger.displacedHouseholds = 12;
  legacyEvacuation.ledger.civilianCosts.push({
    turn: 1,
    type: "Displacement",
    villageId: legacyVillage.id,
    villageName: legacyVillage.name,
    households: 12,
    text: `${legacyVillage.name}有 12 户转入山地隐蔽安置。流离本身是不可抹去的代价。`,
  });
  const migratedEvacuation = DeserializeState(JSON.stringify(legacyEvacuation));
  const migratedVillage = GetHex(migratedEvacuation, legacyVillage.id);
  const migratedShelterEntry = migratedEvacuation.ledger.civilianCosts.find((entry) =>
    entry.villageId === legacyVillage.id && entry.type === "ProtectiveShelter"
  );
  assert.equal(migratedEvacuation.saveVersion, saveVersion);
  assert.equal(migratedEvacuation.lastError, null);
  assert.equal(migratedVillage.households, legacyVillage.originalHouseholds);
  assert.equal(migratedVillage.shelteredHouseholds, 12);
  assert.equal(migratedEvacuation.ledger.displacedHouseholds, 0);
  assert.equal(migratedShelterEntry?.temporary, true);
  assert.match(
    migratedEvacuation.log.at(-1),
    /保护性临时安置不再自动计作永久流离/,
  );
});

Test("不可逆民生账本是胜利硬约束，不能由高贡献抵消", () => {
  const state = CreateInitialState(20260729);
  state.turn = turnLimit;
  state.gameOver = true;
  state.phase = "complete";
  state.meters.people = 100;
  state.meters.network = 100;
  state.meters.contribution = 99;
  state.meters.unity = 100;
  state.hexes.filter((hex) => hex.feature === "Village").forEach((village, index) => {
    village.livelihood = 100;
    village.contact = 100;
    if (index < 2) {
      village.institution = index === 0 ? "Station" : "Clinic";
    }
  });
  state.ledger.affectedHouseholds = 999;
  const assessment = GetVictoryAssessment(state);
  assert.equal(assessment.requirements.civilianLedgerWithinLimit, false);
  assert.notEqual(assessment.status, "HistoricalContinuity");
  assert.equal(assessment.civilianCostLedger.excludedFromScore, true);

  state.ledger.affectedHouseholds = 0;
  state.hexes.filter((hex) => hex.feature === "Village").forEach((village) => {
    village.households = 1;
    village.hardship = 95;
  });
  const laborCollapse = GetVictoryAssessment(state);
  assert.equal(laborCollapse.requirements.householdsMaintained, false);
  assert.equal(laborCollapse.requirements.hardshipContained, false);
  assert.notEqual(laborCollapse.status, "HistoricalContinuity");
});

Test("空命令也能完整走完16回合且历史终点不被改写", () => {
  const completed = RunCampaign(19410918, (state) => state);
  assert.equal(completed.turn, 16);
  assert.equal(completed.phase, "complete");
  assert.equal(completed.history.length, 16);
  const assessment = GetVictoryAssessment(completed);
  assert.match(assessment.historicalCoda, /1945年/);
  assert.equal(assessment.requirements.historicalEndpointReached, true);
});

Test("情报—破袭—交通保障路线能在真实16回合战役中抵达第四层军事学说", () => {
  const seeds = [19410918, 19420501, 20260727, 7654321, 101, 2203];
  const campaigns = seeds.map((seed) => RunCampaign(seed, PlanMilitaryDoctrineTurn));
  const reports = campaigns.map((completed, index) => {
    const militaryEarned = completed.doctrines.military.experience
      + completed.doctrines.military.spentExperience;
    return {
      seed: seeds[index],
      completed,
      militaryEarned,
      reached: completed.doctrines.military.unlocked.includes("CoordinatedDefense"),
    };
  });
  assert.ok(
    reports.every((report) => report.reached),
    `多种子专项路线未稳定可达：${reports.map((report) => `${report.seed}:${report.militaryEarned}/${report.reached ? "已解锁" : "未解锁"}`).join("，")}`,
  );
  for (const { completed, militaryEarned, reached } of reports) {
    if (reached) {
      assert.ok(militaryEarned >= 80, "第四层路线必须来自实际侦察和破袭所得，而非测试注入经验");
    }
    assert.ok(
      Object.keys(completed.intelligenceLedger.reconUsesByStage).length >= 4,
      "专项路线必须在四个战役阶段持续轮换侦察，而非依靠单一刷取点",
    );
    assert.ok(
      completed.log.some((entry) => entry.includes("地下交通站")),
      "专项军事路线仍须建设交通保障，不能让长期脱离补给成为免费策略",
    );
  }
});

Test("批量平衡：组织建设路线优于龟缩和莽攻，莽攻平民代价更高", () => {
  const seeds = [
    19410918,
    19420501,
    19421231,
    20260727,
    7654321,
    8888888,
    101,
    303,
    707,
    1103,
    1601,
    2203,
  ];
  const results = {
    balanced: [],
    passive: [],
    reckless: [],
  };
  for (const seed of seeds) {
    results.balanced.push(RunCampaign(seed, PlanBalancedTurn));
    results.passive.push(RunCampaign(seed, PlanPassiveTurn));
    results.reckless.push(RunCampaign(seed, PlanRecklessTurn));
  }
  const Average = (values) => values.reduce((total, value) => total + value, 0) / values.length;
  const balancedScore = Average(results.balanced.map((state) => GetVictoryAssessment(state).score));
  const passiveScore = Average(results.passive.map((state) => GetVictoryAssessment(state).score));
  const recklessScore = Average(results.reckless.map((state) => GetVictoryAssessment(state).score));
  const balancedCivilianCost = Average(results.balanced.map((state) => state.ledger.affectedHouseholds));
  const recklessCivilianCost = Average(results.reckless.map((state) => state.ledger.affectedHouseholds));
  const balancedContributions = results.balanced.map((state) => state.meters.contribution);
  const balancedAssessments = results.balanced.map((state) => GetVictoryAssessment(state));
  const balancedContinuities = balancedAssessments.filter(
    (assessment) => assessment.status === "HistoricalContinuity",
  ).length;
  const civilianUnlockCounts = results.balanced.map((state) => state.doctrines.civilian.unlocked.length);
  const militaryUnlockCounts = results.balanced.map((state) => state.doctrines.military.unlocked.length);
  const recklessMilitaryUnlockCounts = results.reckless.map(
    (state) => state.doctrines.military.unlocked.length,
  );
  const civilianEarned = results.balanced.map((state) => (
    state.doctrines.civilian.experience + state.doctrines.civilian.spentExperience
  ));
  const recklessMilitaryEarned = results.reckless.map((state) => (
    state.doctrines.military.experience + state.doctrines.military.spentExperience
  ));
  console.log(`  组织建设贡献样本：${balancedContributions.join(", ")}`);
  console.log(
    `  历史延续 ${balancedContinuities}/${seeds.length}；`
    + `民生路线层数 ${civilianUnlockCounts.join(", ")}；`
    + `军事路线层数 ${militaryUnlockCounts.join(", ")}；`
    + `破袭路线军事层数 ${recklessMilitaryUnlockCounts.join(", ")}；`
    + `破袭军事总经验 ${recklessMilitaryEarned.join(", ")}；`
    + `民生总经验 ${civilianEarned.join(", ")}`,
  );

  assert.ok(balancedScore > passiveScore, `balanced ${balancedScore} 应高于 passive ${passiveScore}`);
  assert.ok(balancedScore > recklessScore, `balanced ${balancedScore} 应高于 reckless ${recklessScore}`);
  assert.ok(
    recklessCivilianCost > balancedCivilianCost,
    `reckless 平民代价 ${recklessCivilianCost} 应高于 balanced ${balancedCivilianCost}`,
  );
  assert.ok(Average(balancedContributions) >= 9.5);
  assert.ok(
    balancedContributions.filter((contribution) => contribution >= 10).length >= 9,
    "多数种子中的组织建设路线应完成贡献硬门槛，但仍允许少量困难局形成脆弱存续",
  );
  assert.ok(balancedContinuities >= 8, "组织建设路线应在多数种子中达成历史延续");
  assert.ok(
    civilianUnlockCounts.filter((count) => count >= 4).length >= 6,
    "正常组织建设应让后期民生路线在多数种子中可达，而不是只存在于定义表",
  );
  assert.ok(results.reckless.every((state) => state.meters.exposure > results.passive[0].meters.exposure));

  console.log(
    `  平衡样本：balanced=${balancedScore.toFixed(1)}，`
    + `passive=${passiveScore.toFixed(1)}，reckless=${recklessScore.toFixed(1)}；`
    + `平民受影响户数 balanced=${balancedCivilianCost.toFixed(1)}，`
    + `reckless=${recklessCivilianCost.toFixed(1)}`,
  );
});

const passedCount = testResults.filter((result) => result.passed).length;
console.log(`\nEnemyRear1941 smoke tests: ${passedCount}/${testResults.length} passed.`);
