import assert from 'node:assert/strict';
import * as Ai from './Script_Ai.mjs';
import * as Rules from './Script_Rules.mjs';
import { HexDistance, ParseHexKey } from './Script_Hex.mjs';

function Clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function DistanceKeys(a, b) {
  return HexDistance(ParseHexKey(a), ParseHexKey(b));
}

function FindHiddenCells(state) {
  return state.map.order
    .filter((key) => state.enemies.every((enemy) => DistanceKeys(key, enemy.key) > 5))
    .filter((key) => state.strongholds.every((stronghold) => DistanceKeys(key, stronghold.key) > 5))
    .slice(0, 2);
}

{
  const state = Rules.CreateInitialState({ seed: 20260730, difficulty: 'Hard' });
  state.turn = 15;
  const railKey = state.map.railwayKeys.find((key) => state.map.hexes[key]);
  assert.ok(railKey, '测试地图应有铁路');
  state.map.hexes[railKey].railBroken = 3;
  state.map.hexes[railKey].control = 'Contested';

  const stronghold = state.strongholds
    .filter((item) => item.garrison > 0)
    .sort((a, b) => a.key.localeCompare(b.key))[0];
  stronghold.supply = 18;
  stronghold.alarm = 80;
  const contactKey = state.map.order.find((key) => DistanceKeys(key, stronghold.key) === 1);
  assert.ok(contactKey, '受压据点应有相邻格');
  state.units[0].key = contactKey;
  state.units[0].hidden = false;

  const before = JSON.stringify(state);
  const network = Ai.AnalyzeEnemyNetwork(state);
  assert.ok(network.gaps.some((gap) => gap.key === railKey), 'AI 应识别被破袭的交通缺口');
  assert.ok(network.threatenedStrongholds.some((item) => item.id === stronghold.id), 'AI 应识别受围或断粮据点');

  const plan = Ai.PlanEnemyTurn(state, { difficulty: 'Hard', doctrineKey: 'Cage', noSweep: true });
  assert.equal(JSON.stringify(state), before, '战役分析与规划不得修改传入 state');
  assert.ok(plan.campaignIntents.some((intent) => intent.kind === 'Relieve' && intent.targetKey === stronghold.key), '应生成解围意图');
  assert.ok(plan.campaignIntents.some((intent) => intent.kind === 'Repair' && intent.targetKey === railKey), '应生成抢修意图');

  const repeat = Ai.PlanEnemyTurn(Clone(state), { difficulty: 'Hard', doctrineKey: 'Cage', noSweep: true });
  assert.deepEqual(repeat, plan, '同局面同种子必须得到完全一致的战役计划');

  const applied = Ai.ApplyEnemyTurn(state, plan, { ensureOpeningContact: false });
  assert.equal(JSON.stringify(state), before, '执行敌回合不得修改传入 state');
  assert.ok(applied.nextState.aiMemory.campaignIntents.length > 0, '多回合意图应写入 AI 记忆');
  assert.ok(applied.report.campaignIntents.some((intent) => !intent.continued), '首次战役调动应形成预警信号');
}

{
  const base = Rules.CreateInitialState({ seed: 918273, difficulty: 'Normal' });
  base.turn = 10;
  base.exposure = 0;
  base.alert = 0;
  const hiddenCells = FindHiddenCells(base);
  assert.equal(hiddenCells.length, 2, '测试地图应有两个敌视野外格');

  const left = Clone(base);
  const right = Clone(base);
  left.units[0].key = hiddenCells[0];
  right.units[0].key = hiddenCells[1];
  left.units[0].hidden = true;
  right.units[0].hidden = true;

  const options = { difficulty: 'Normal', doctrineKey: 'Nibble', noSweep: true };
  assert.deepEqual(
    Ai.PlanEnemyTurn(left, options),
    Ai.PlanEnemyTurn(right, options),
    '移动敌视野外的隐藏部队不应改变 AI 计划',
  );
}

{
  const baseline = Rules.CreateInitialState({ seed: 314159, difficulty: 'Normal' });
  baseline.turn = 15;
  baseline.exposure = 42;
  baseline.alert = 45;
  baseline.campaign = { momentum: 0, pressure: 0, branchFlags: {}, activeObjectives: [], history: [] };
  const pressured = Clone(baseline);
  pressured.campaign = {
    ...pressured.campaign,
    momentum: -4,
    pressure: 7,
    branchFlags: { exposureCrisis: { sinceTurn: 14 }, enemyRailFlow: { sinceTurn: 13 } },
  };
  const initiative = Clone(baseline);
  initiative.campaign = { ...initiative.campaign, momentum: 6, pressure: 0, branchFlags: {} };

  const baseDoctrine = Ai.GetEnemyDoctrine(baseline, { difficulty: 'Normal' });
  const pressureDoctrine = Ai.GetEnemyDoctrine(pressured, { difficulty: 'Normal' });
  const initiativeDoctrine = Ai.GetEnemyDoctrine(initiative, { difficulty: 'Normal' });
  assert.ok(pressureDoctrine.scores.Sweep > baseDoctrine.scores.Sweep, '战役压力未提高扫荡姿态权重');
  assert.ok(pressureDoctrine.scores.Cage > baseDoctrine.scores.Cage, '铁路失控分支未提高封锁姿态权重');
  assert.ok(initiativeDoctrine.scores.Retrench > baseDoctrine.scores.Retrench, '我方战役主动权未促使敌军收缩');

  const stockBefore = JSON.stringify(pressured.stock);
  const ledgerBefore = JSON.stringify(pressured.ledger);
  const basePlan = Ai.PlanEnemyTurn(baseline, { difficulty: 'Normal', noSweep: true });
  const pressurePlan = Ai.PlanEnemyTurn(pressured, { difficulty: 'Normal', noSweep: true });
  assert.ok(pressurePlan.campaignSignal.sweepPressure > basePlan.campaignSignal.sweepPressure, '战役压力未提高可解释的扫荡压力');
  assert.ok(pressurePlan.campaignSignal.rationale.includes('战役压力'), '计划未解释战役变量的影响');
  assert.equal(JSON.stringify(pressured.stock), stockBefore, '战役变量影响 AI 时修改了资源');
  assert.equal(JSON.stringify(pressured.ledger), ledgerBefore, '战役变量影响 AI 时修改了人民代价账本');
}

{
  const state = Rules.CreateInitialState({ seed: 271828, difficulty: 'Hard' });
  state.turn = 12;
  const trapped = state.enemies[0];
  trapped.supplyState = 'Isolated';
  trapped.supply = 8;
  trapped.isolationTurns = 2;
  trapped.cutOff = true;
  const plan = Ai.PlanEnemyTurn(state, { difficulty: 'Hard', doctrineKey: 'Cage', noSweep: true });
  const relief = plan.campaignIntents.find((intent) => intent.kind === 'Relieve' && intent.targetUnitId === trapped.id);
  assert.ok(relief, '机动部队被围后 AI 未生成优先救援意图');
  assert.ok(
    plan.orders.some((order) => order.unitId !== trapped.id && order.payload?.intent === 'Relieve'),
    'AI 未分配另一支部队重开被围部队退路',
  );
}

console.log('Script_AiTest: 交通网、解围、跨回合意图、确定性与反作弊断言通过');
