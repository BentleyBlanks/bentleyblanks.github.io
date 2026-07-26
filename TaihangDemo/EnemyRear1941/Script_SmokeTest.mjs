import assert from "node:assert/strict";
import {
  saveVersion,
  saveKey,
  turnLimit,
  actionDefinitions,
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
  FindReachableHexes,
  ListContextActions,
  GetActionPreview,
  QueueOrder,
  RemoveOrder,
  ClearOrders,
  ResolveTurn,
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
        && tree.experience >= doctrine.cost) {
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
  let next = QueueNearestSabotage(state, "Unit_Guerrilla_One");
  next = QueueNearestSabotage(next, "Unit_MainForce_One");
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
  assert.equal(saveVersion, 1);
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
    "ambush",
    "sabotage",
    "rest",
  ]) {
    assert.ok(actionDefinitions.some((action) => action.id === requiredAction), `缺少${requiredAction}`);
  }
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
  const built = QueueOrder(limited, {
    actionId: "buildStation",
    unitId: "Unit_WorkTeam_One",
    hexId: "Hex_Q2_R3",
    targetHexId: "Hex_Q2_R3",
  });
  assert.equal(built.reserved.arms, 1);
  const blocked = GetActionPreview(built, "sabotage", "Hex_Q6_R3", "Unit_Guerrilla_One");
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

Test("预警疏散显著减轻扫荡损失，但流离只记入不可逆账本", () => {
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
  assert.ok(prepared.ledger.displacedHouseholds > 0);
  assert.equal(GetVictoryAssessment(prepared).civilianCostLedger.excludedFromScore, true);
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

  state = ResolveTurn(state);
  const intelBeforeCompletion = state.resources.intel;
  state = ResolveTurn(state);
  const village = GetHex(state, "Hex_Q2_R3");
  assert.equal(village.institution, "Station");
  assert.equal(village.construction, null);
  assert.ok(state.resources.intel > intelBeforeCompletion);
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

Test("群众路线与军事路线独立解锁，政策严格限制为两个槽", () => {
  let state = CreateInitialState();
  state.doctrines.civilian.experience = 100;
  state.doctrines.military.experience = 100;
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
    state = UnlockDoctrine(state, doctrineId);
    assert.equal(state.lastError, null, `${doctrineId}应能按前置顺序解锁`);
  }
  assert.equal(state.commandMax, 5);

  const selected = SetPolicies(state, ["MutualAidProduction", "MilitiaScreen"]);
  assert.deepEqual(selected.policies, ["MutualAidProduction", "MilitiaScreen"]);
  const tooMany = SetPolicies(selected, ["MassDiscipline", "FlexibleDispersion", "MilitiaScreen"]);
  assert.match(tooMany.lastError, /至多两个/);
  assert.deepEqual(tooMany.policies, selected.policies);
});

Test("有效存档往返，损坏或错版存档安全回退", () => {
  const state = CreateInitialState(7654321);
  const roundTrip = DeserializeState(SerializeState(state));
  assert.equal(roundTrip.seed, state.seed);
  assert.equal(roundTrip.hexes.length, 63);
  assert.equal(roundTrip.turn, 1);

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

Test("批量平衡：组织建设路线优于龟缩和莽攻，莽攻平民代价更高", () => {
  const seeds = [19410918, 19420501, 19421231, 20260727, 7654321, 8888888];
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

  assert.ok(balancedScore > passiveScore, `balanced ${balancedScore} 应高于 passive ${passiveScore}`);
  assert.ok(balancedScore > recklessScore, `balanced ${balancedScore} 应高于 reckless ${recklessScore}`);
  assert.ok(
    recklessCivilianCost > balancedCivilianCost,
    `reckless 平民代价 ${recklessCivilianCost} 应高于 balanced ${balancedCivilianCost}`,
  );
  assert.ok(results.balanced.every((state) => state.meters.contribution >= 10));
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
