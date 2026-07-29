import assert from 'node:assert/strict';
import * as Campaign from './Data_Campaign.mjs';
import * as Rules from './Script_Rules.mjs';

function Clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function PlanAt(state, turn, eraKey) {
  const next = Clone(state);
  next.turn = turn;
  next.eraKey = eraKey;
  const campaign = Campaign.CreateCampaignState(next);
  return { state: next, campaign, plan: Campaign.GenerateTurnObjectives(next, campaign) };
}

{
  const state = Rules.CreateInitialState({ seed: 20260730 });
  const before = JSON.stringify(state);
  const campaign = Campaign.CreateCampaignState(state);
  const planA = Campaign.GenerateTurnObjectives(state, campaign);
  const planB = Campaign.GenerateTurnObjectives(Clone(state), Clone(campaign));
  assert.deepEqual(planA, planB, '同种子同态势必须生成完全相同的目标');
  assert.equal(JSON.stringify(state), before, '创建与生成任务不得修改传入 state');
  assert.ok(planA.primary, '每回合应有主目标');
  assert.ok(planA.optional, '正常地图应有可选目标');
  for (const objective of planA.objectives) {
    assert.ok(state.map.hexes[objective.targetKey], `${objective.type} 目标必须落在真实地图格`);
    assert.ok(objective.reach.distance <= objective.reach.horizon, `${objective.type} 目标必须在任务时限内可达`);
  }
}

{
  const state = Rules.CreateInitialState({ seed: 44 });
  state.turn = 16;
  state.eraKey = 'Hardship';
  state.units[0].isolated = true;
  state.units[0].cutOff = true;
  state.units[0].supply = 0.1;
  const campaign = Campaign.CreateCampaignState(state);
  const plan = Campaign.GenerateTurnObjectives(state, campaign);
  assert.equal(plan.primary.type, 'RescueEncircled', '被围部队必须抢占主目标优先级');
  assert.equal(plan.primary.targetUnitId, state.units[0].id);

  const relieved = Clone(state);
  const unit = relieved.units.find((item) => item.id === plan.primary.targetUnitId);
  unit.isolated = false;
  unit.cutOff = false;
  unit.outOfSupply = false;
  unit.supply = 1;
  unit.key = plan.primary.safeKey;
  const result = Campaign.EvaluateObjectives(relieved, [plan.primary]);
  assert.equal(result.primary.status, 'Success', '解除孤立并进入安全交通网应完成救援');
}

{
  const base = Rules.CreateInitialState({ seed: 555 });
  const { state, campaign, plan } = PlanAt(base, 0, 'Opening');
  const objective = plan.primary;
  const failedState = Clone(state);
  failedState.turn = objective.deadlineTurn;
  // 移开守备并让目标落入敌手，稳定触发失败分支。
  for (const unit of failedState.units) {
    if (unit.key === objective.targetKey) unit.key = failedState.startKey;
  }
  failedState.map.hexes[objective.targetKey].control = 'Enemy';
  const evaluated = Campaign.EvaluateObjectives(failedState, [objective]);
  assert.equal(evaluated.primary.status, 'Failed', '到期未完成必须进入失败分支');
  const advanced = Campaign.AdvanceCampaign(failedState, campaign, {
    objectives: [objective],
    evaluations: evaluated.evaluations,
  });
  assert.ok(advanced.branchFlags[objective.failure.branchFlag], '失败必须留下有策略意义的后续分支');
  assert.ok(advanced.pressure > campaign.pressure, '失败应增加战役压力');
  const nextTurn = Clone(failedState);
  nextTurn.turn += 1;
  const branched = Campaign.GenerateTurnObjectives(nextTurn, advanced);
  if (objective.failure.branchFlag === 'passLost') {
    assert.equal(branched.primary.type, 'EstablishSupplyCorridor', '丢失隘口后应动态转入交通线重建');
  }
}

{
  const base = Rules.CreateInitialState({ seed: 777 });
  const { state, plan } = PlanAt(base, 22, 'Recovery');
  const objective = plan.objectives.find((item) => item.type === 'CutRailway')
    || plan.objectives.find((item) => item.type === 'RaidThenWithdraw')
    || plan.primary;
  const unsafe = Clone(state);
  unsafe.campaignSignals = { sabotagedKeys: [objective.targetKey] };
  unsafe.ledger.civilianDeaths += 1;
  const beforeStock = Clone(unsafe.stock);
  const evaluated = Campaign.EvaluateObjectives(unsafe, [objective]);
  assert.notEqual(evaluated.primary.status, 'Success', '战术动作不得用人民伤亡换取任务成功');
  assert.equal(evaluated.primary.stockDelta, null);
  assert.equal(evaluated.primary.scoreDelta, null);
  assert.equal(evaluated.primary.ledgerDelta, null);
  assert.deepEqual(unsafe.stock, beforeStock, '任务评估不得发放资源');
}

{
  const state = Rules.CreateInitialState({ seed: 9090 });
  const seen = new Set();
  for (const [turn, eraKey] of [[0, 'Opening'], [6, 'Growth'], [14, 'Hardship'], [22, 'Recovery'], [28, 'Counter']]) {
    const { plan } = PlanAt(state, turn, eraKey);
    for (const objective of plan.objectives) seen.add(objective.type);
  }
  assert.ok(seen.has('CutRailway'), '五时期节奏应出现铁路破袭');
  assert.ok(seen.has('HoldPass'), '五时期节奏应出现隘口防御');
  assert.ok(seen.has('EstablishSupplyCorridor'), '五时期节奏应出现补给走廊');
  assert.ok(seen.has('EvacuateAndDeny'), '五时期节奏应出现疏散坚壁');
  assert.ok(seen.has('StrategicCounteroffensive'), '反攻期应出现战略反攻');
}

{
  const emptyCampaign = Campaign.CreateCampaignState({});
  const emptyPlan = Campaign.GenerateTurnObjectives({}, emptyCampaign);
  assert.deepEqual(emptyPlan.objectives, [], '旧档缺少地图/部队字段时应安全降级为空任务');
  assert.equal(Campaign.GetObjectivePreview({}, null), null);
}

console.log('Script_MissionTest: 确定性、可达性、救援、失败分支、五时期与账本红线通过');
