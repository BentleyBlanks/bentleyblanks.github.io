import assert from "node:assert/strict";
import {
  CreateGameState,
  DeserializeGame,
  EndTurn,
  ExecuteAction,
  GetActionPreview,
  GetFinalScore,
  SerializeGame,
  SetPolicy,
  actions,
  enemyBehaviors,
  historicalAnchors,
  mapConnections,
  mapNodes,
  policies,
  rulesMetadata,
  turnCalendar,
} from "./Rules.mjs";

let passedTestCount = 0;

function RunTest(testName, testFunction) {
  try {
    testFunction();
    passedTestCount += 1;
    console.log(`✓ ${testName}`);
  } catch (error) {
    console.error(`✗ ${testName}`);
    throw error;
  }
}

function AssertFiniteNumber(value, label) {
  assert.equal(typeof value, "number", `${label} 应为数值`);
  assert.equal(Number.isFinite(value), true, `${label} 不应为 NaN 或 Infinity`);
}

function AssertFiniteState(state) {
  AssertFiniteNumber(state.turn, "turn");
  AssertFiniteNumber(state.actionPoints, "actionPoints");
  AssertFiniteNumber(state.randomState, "randomState");
  for (const [resourceName, resourceValue] of Object.entries(state.resources)) {
    AssertFiniteNumber(resourceValue, `resources.${resourceName}`);
    assert.ok(resourceValue >= 0, `resources.${resourceName} 不应为负数`);
  }
  for (const [nodeId, node] of Object.entries(state.nodes)) {
    for (const [fieldName, fieldValue] of Object.entries(node)) {
      AssertFiniteNumber(fieldValue, `nodes.${nodeId}.${fieldName}`);
    }
  }
  for (const [routeId, route] of Object.entries(state.routes)) {
    for (const [fieldName, fieldValue] of Object.entries(route)) {
      AssertFiniteNumber(fieldValue, `routes.${routeId}.${fieldName}`);
    }
  }
  for (const [teamId, team] of Object.entries(state.teams)) {
    AssertFiniteNumber(team.level, `teams.${teamId}.level`);
    AssertFiniteNumber(team.fatigue, `teams.${teamId}.fatigue`);
  }
}

function GetAdjacentActiveNodeId(state, nodeId) {
  for (const connection of mapConnections) {
    if (connection.type !== "RuralPath") {
      continue;
    }
    const neighborNodeId = connection.from === nodeId
      ? connection.to
      : connection.to === nodeId
        ? connection.from
        : null;
    if (neighborNodeId && state.nodes[neighborNodeId].networkLevel > 0) {
      return neighborNodeId;
    }
  }
  return null;
}

function TakeSafeQuarter(state) {
  let nextState = state;
  for (const [teamId, initialTeam] of Object.entries(nextState.teams)) {
    if (nextState.actionPoints <= 0) {
      break;
    }
    const currentTeam = nextState.teams[teamId] ?? initialTeam;
    const currentNode = nextState.nodes[currentTeam.nodeId];
    const candidateActions = [];
    if (currentNode.networkLevel > 0) {
      if (currentNode.exposure > 16) {
        candidateActions.push(["ConcealTransfer", currentTeam.nodeId]);
      }
      candidateActions.push(["ProductionRelief", currentTeam.nodeId]);
      candidateActions.push(["ConcealTransfer", currentTeam.nodeId]);
      candidateActions.push(["ScoutRoute", currentTeam.nodeId]);
    } else {
      const escapeNodeId = GetAdjacentActiveNodeId(nextState, currentTeam.nodeId);
      if (escapeNodeId) {
        candidateActions.push(["ConcealTransfer", escapeNodeId]);
      }
    }
    for (const [actionId, nodeId] of candidateActions) {
      const preview = GetActionPreview(nextState, actionId, nodeId, teamId);
      if (preview.legal) {
        nextState = ExecuteAction(nextState, actionId, nodeId, teamId);
        break;
      }
    }
  }
  return nextState;
}

function RunSafeCampaign(seed) {
  let state = CreateGameState(seed);
  let completedQuarterCount = 0;
  while (state.status === "active" && completedQuarterCount < rulesMetadata.maximumTurns) {
    state = TakeSafeQuarter(state);
    state = EndTurn(state);
    completedQuarterCount += 1;
    AssertFiniteState(state);
  }
  return { state, completedQuarterCount };
}

RunTest("静态规则数据完整且使用28季度", () => {
  assert.equal(mapNodes.length, 16);
  assert.equal(mapConnections.filter((connection) => connection.type === "EnemyRoute").length, 5);
  assert.ok(mapConnections.filter((connection) => connection.type === "RuralPath").length >= 20);
  assert.equal(policies.length, 6);
  assert.equal(actions.length, 6);
  assert.equal(enemyBehaviors.length, 4);
  assert.equal(historicalAnchors.length, 9);
  assert.equal(turnCalendar.length, 28);
  assert.deepEqual(turnCalendar[0], { turn: 1, year: 1938, quarter: 4, label: "1938年 第4季度" });
  assert.deepEqual(turnCalendar.at(-1), { turn: 28, year: 1945, quarter: 3, label: "1945年 第3季度" });
  assert.equal(new Set(mapNodes.map((node) => node.id)).size, mapNodes.length);
  assert.equal(new Set(actions.map((action) => action.id)).size, actions.length);
});

RunTest("初始状态、史实锚点和敌方预案可直接供前端读取", () => {
  const state = CreateGameState(193810);
  assert.equal(state.version, 1);
  assert.equal(state.turn, 1);
  assert.equal(state.maxTurns, 28);
  assert.equal(state.actionPoints, 2);
  assert.equal(state.status, "active");
  assert.equal(state.triggeredAnchors.includes("StrategicStalemate"), true);
  assert.equal(state.historyLog.some((entry) => entry.type === "HistoricalAnchor"), true);
  assert.ok(enemyBehaviors.some((behavior) => behavior.id === state.enemyPlan.behaviorId));
  assert.equal(mapNodes.every((node) => state.nodes[node.id]), true);
  AssertFiniteState(state);
});

RunTest("六项主要行动均可预览、执行且不修改原状态", () => {
  const actionCases = [
    ["OpenContact", "Taiyue", "TeamTaihang"],
    ["RootDevelopment", "Beiyue", "TeamBeiyue"],
    ["ScoutRoute", "Beiyue", "TeamBeiyue"],
    ["SabotageRoute", "Beiyue", "TeamBeiyue"],
    ["ConcealTransfer", "Beiyue", "TeamBeiyue"],
    ["ProductionRelief", "Beiyue", "TeamBeiyue"],
  ];
  for (let caseIndex = 0; caseIndex < actionCases.length; caseIndex += 1) {
    const [actionId, nodeId, teamId] = actionCases[caseIndex];
    const state = CreateGameState(1000 + caseIndex);
    const originalStateJson = JSON.stringify(state);
    const preview = GetActionPreview(state, actionId, nodeId, teamId);
    assert.equal(preview.legal, true, `${actionId} 应可执行：${preview.reason}`);
    assert.ok(preview.chance >= 10 && preview.chance <= 100);
    const nextState = ExecuteAction(state, actionId, nodeId, teamId);
    assert.equal(JSON.stringify(state), originalStateJson, `${actionId} 不应修改原状态`);
    assert.notEqual(nextState, state);
    assert.equal(nextState.actionPoints, 1);
    assert.equal(nextState.teams[teamId].acted, true);
    assert.equal(nextState.lastResolution.actionId, actionId);
    assert.equal(nextState.lastResolution.legal, true);
    AssertFiniteState(nextState);
  }
});

RunTest("非法行动返回原因且不消耗部署令", () => {
  const state = CreateGameState(7);
  const preview = GetActionPreview(state, "OpenContact", "Beiyue", "TeamBeiyue");
  assert.equal(preview.legal, false);
  assert.ok(preview.reason.length > 0);
  const nextState = ExecuteAction(state, "OpenContact", "Beiyue", "TeamBeiyue");
  assert.equal(nextState.actionPoints, 2);
  assert.equal(nextState.resources.supplies, state.resources.supplies);
  assert.equal(nextState.lastResolution.legal, false);
});

RunTest("年度方针限制为两项，并在新年度恢复调整次数", () => {
  const initialState = CreateGameState(9);
  const firstPolicyState = SetPolicy(initialState, "RentAndInterestReduction");
  const secondPolicyState = SetPolicy(firstPolicyState, "CivilianProtection");
  assert.deepEqual(secondPolicyState.selectedPolicies, ["RentAndInterestReduction", "CivilianProtection"]);
  assert.equal(secondPolicyState.policyChangesRemaining, 0);
  const rejectedState = SetPolicy(secondPolicyState, "ProductionSelfReliance");
  assert.equal(rejectedState.lastResolution.legal, false);
  assert.equal(rejectedState.selectedPolicies.length, 2);
  const newYearState = EndTurn(rejectedState);
  assert.equal(newYearState.calendar.year, 1939);
  assert.equal(newYearState.calendar.quarter, 1);
  assert.equal(newYearState.policyChangesRemaining, 2);
  const disabledState = SetPolicy(newYearState, "CivilianProtection", false);
  assert.equal(disabledState.lastResolution.legal, true);
  assert.equal(disabledState.selectedPolicies.includes("CivilianProtection"), false);
});

RunTest("零粮秣与零情报时仍有保底行动，不会形成资源死锁", () => {
  const state = CreateGameState(11);
  state.resources.supplies = 0;
  state.resources.intelligence = 0;
  const productionPreview = GetActionPreview(state, "ProductionRelief", "Beiyue", "TeamBeiyue");
  const concealPreview = GetActionPreview(state, "ConcealTransfer", "Taihang", "TeamTaihang");
  assert.equal(productionPreview.legal, true);
  assert.equal(concealPreview.legal, true);
  let nextState = ExecuteAction(state, "ProductionRelief", "Beiyue", "TeamBeiyue");
  nextState = ExecuteAction(nextState, "ConcealTransfer", "Taihang", "TeamTaihang");
  nextState = EndTurn(nextState);
  assert.ok(nextState.resources.supplies > 0);
  assert.equal(nextState.status, "active");
  AssertFiniteState(nextState);
});

RunTest("存档序列化与回读保持完整状态", () => {
  let state = CreateGameState("SaveRoundTrip");
  state = SetPolicy(state, "ProductionSelfReliance");
  state = ExecuteAction(state, "ProductionRelief", "Beiyue", "TeamBeiyue");
  state = EndTurn(state);
  const serializedGame = SerializeGame(state);
  const restoredState = DeserializeGame(serializedGame);
  assert.deepEqual(restoredState, JSON.parse(serializedGame));
  assert.equal(SerializeGame(restoredState), serializedGame);
  assert.throws(() => DeserializeGame("{not valid json"), /无法读取存档/);
});

RunTest("相同固定种子和命令序列产生完全相同结果", () => {
  const firstCampaign = RunSafeCampaign(20260713);
  const secondCampaign = RunSafeCampaign(20260713);
  assert.equal(SerializeGame(firstCampaign.state), SerializeGame(secondCampaign.state));
  const differentSeedCampaign = RunSafeCampaign(20260714);
  assert.notEqual(SerializeGame(firstCampaign.state), SerializeGame(differentSeedCampaign.state));
});

RunTest("完整局推进28季度、触发关键史实并自动结算", () => {
  const { state, completedQuarterCount } = RunSafeCampaign(20260713);
  assert.equal(completedQuarterCount, 28);
  assert.equal(state.turn, 28);
  assert.equal(state.status, "victory");
  assert.equal(state.triggeredAnchors.includes("HundredRegimentsOffensive"), true);
  assert.equal(state.triggeredAnchors.includes("MayFirstSweep"), true);
  assert.equal(state.triggeredAnchors.includes("JapaneseSurrender"), true);
  assert.ok(state.historyLog.some((entry) => entry.anchorId === "JapaneseSurrender"));
  assert.ok(state.finalScore.total >= 0 && state.finalScore.total <= 100);
  assert.ok(["FireKeptAlive", "RootsConnected", "NetworkAcrossTheater"].includes(state.ending));
  assert.deepEqual(GetFinalScore(state), state.finalScore);
});

RunTest("1942年第二季度强制生成冀中历史扫荡预案", () => {
  let state = CreateGameState(33);
  while (state.turn < 15 && state.status === "active") {
    state = TakeSafeQuarter(state);
    state = EndTurn(state);
  }
  assert.equal(state.turn, 15);
  assert.equal(state.enemyPlan.behaviorId, "Sweep");
  assert.equal(state.enemyPlan.strength, 5);
  assert.equal(state.enemyPlan.revealed, true);
  assert.equal(state.enemyPlan.historicalAnchorId, "MayFirstSweep");
});

RunTest("连续两季度网络或群众安全崩溃会进入失败结算", () => {
  const state = CreateGameState(17);
  state.resources.safety = 10;
  state.counters.lowSafetyTurns = 1;
  const defeatedState = EndTurn(state);
  assert.equal(defeatedState.status, "defeat");
  assert.equal(defeatedState.ending, "NetworkInterruptedForSafety");
  assert.ok(defeatedState.finalScore);
  assert.equal(GetActionPreview(defeatedState, "ProductionRelief", "Beiyue", "TeamBeiyue").legal, false);
});

RunTest("评分只使用网络、群众安全、贡献和联络，不统计击杀", () => {
  const state = CreateGameState(21);
  for (const node of Object.values(state.nodes)) {
    node.networkLevel = 3;
    node.trust = 100;
  }
  state.resources.safety = 100;
  state.resources.contribution = 100;
  const score = GetFinalScore(state);
  assert.equal(score.total, 100);
  assert.equal(score.tier, "NetworkAcrossTheater");
  assert.deepEqual(Object.keys(score.components), ["network", "safety", "contribution", "connectivity"]);
});

console.log(`\nResistanceNetwork smoke tests passed: ${passedTestCount}`);
