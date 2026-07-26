import assert from "node:assert/strict";

import {
  ACTION_DEFINITIONS,
  CFG,
  TUTORIAL_STEPS,
  VILLAGE_DEFINITIONS,
  CalculateOutcome,
  CreateInitialState,
  GetActionAvailability,
  GetEnemyIntentPreview,
  GetPlanningSummary,
  QueueAction,
  RemovePlan,
  ResolveTurn,
  RunDeterministicSimulation,
} from "./Script_Rules.mjs";

function Clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function ForceEnemyTarget(state, villageId) {
  for (const villageDefinition of VILLAGE_DEFINITIONS) {
    state.villages[villageDefinition.id].enemySuspicion = 0;
    state.enemyKnowledge[villageDefinition.id].evidence = 0;
    state.enemyKnowledge[villageDefinition.id].knownOrganization = 0;
    state.enemyKnowledge[villageDefinition.id].confidence = 0;
    state.enemyKnowledge[villageDefinition.id].lastConfirmedTurn = null;
  }
  state.villages[villageId].enemySuspicion = 100;
  state.enemyKnowledge[villageId].evidence = 20;
  state.enemyKnowledge[villageId].knownOrganization = 3;
  state.enemyKnowledge[villageId].confidence = 100;
  state.enemyKnowledge[villageId].lastConfirmedTurn = state.turn;
  return state;
}

function GetVillageDefinition(villageId) {
  return VILLAGE_DEFINITIONS.find((villageDefinition) => villageDefinition.id === villageId);
}

function TestInitialState() {
  const state = CreateInitialState(19420501);
  assert.equal(state.version, 2);
  assert.equal(state.turn, 1);
  assert.equal(state.maxTurns, 14);
  assert.equal(state.phase, "tutorial");
  assert.equal(state.status, "active");
  assert.equal(VILLAGE_DEFINITIONS.length, 10);
  assert.equal(ACTION_DEFINITIONS.length, 8);
  assert.equal(Object.keys(state.villages).length, 10);
  assert.deepEqual(state.orderBudget, { cadre: 3, armed: 1 });
  assert.deepEqual(state.resources, { supplies: 18, arms: 7, intelligence: 4 });
  assert.equal(state.enemyOrders.length, 1);
  assert.equal(state.stats.branchCount, 1);
  assert.equal(state.stats.organizedVillageCount, 1);
  for (const village of Object.values(state.villages)) {
    assert.ok(village.livelihood >= 0 && village.livelihood <= CFG.maximumLivelihood);
    assert.ok(village.trust >= 0 && village.trust <= CFG.maximumTrust);
    assert.ok(village.organization >= 0 && village.organization <= 3);
    assert.ok(village.enemySuspicion >= 0 && village.enemySuspicion <= CFG.maximumEnemySuspicion);
    assert.ok(village.scars >= 0 && village.scars <= CFG.maximumScars);
    assert.deepEqual(village.occupationConsequences, {
      grainSeized: 0,
      homesBurned: 0,
      familiesDisplaced: 0,
      peopleWounded: 0,
      peopleKilled: 0,
      peopleDetained: 0,
    });
  }
}

function TestPlanCostsAndUndo() {
  const initialState = CreateInitialState(11);
  const startingSupplies = initialState.resources.supplies;
  const queuedState = QueueAction(initialState, "Relief", "StoneBridge");
  assert.equal(queuedState.plans.length, 1);
  assert.equal(queuedState.resources.supplies, startingSupplies, "排计划时不应提前扣除资源");
  assert.equal(GetPlanningSummary(queuedState).reservedCosts.supplies, 2);
  assert.equal(GetPlanningSummary(queuedState).remainingOrders.cadre, 2);
  const removedState = RemovePlan(queuedState, queuedState.plans[0].id);
  assert.equal(removedState.plans.length, 0);
  assert.equal(GetPlanningSummary(removedState).reservedCosts.supplies, 0);
  assert.equal(GetPlanningSummary(removedState).remainingOrders.cadre, 3);
  assert.equal(removedState.resources.supplies, startingSupplies);

  const armedPlanState = QueueAction(initialState, "Sabotage", "SouthPass");
  assert.deepEqual(GetPlanningSummary(armedPlanState).reservedCosts, { supplies: 0, arms: 1, intelligence: 1 });
  assert.equal(GetPlanningSummary(armedPlanState).remainingOrders.armed, 0);
  const blockedSecondArmedPlan = QueueAction(armedPlanState, "Scout", "StoneBridge");
  assert.equal(blockedSecondArmedPlan.plans.length, 1, "每回合只能安排一道武装令");
  assert.equal(blockedSecondArmedPlan.lastCommand.success, false);
}

function TestTutorialActions() {
  const expectedFocusActions = ["Relief", "Contact", "BuildBranch", "HideAndEvacuate", "CounterRecon", "Sabotage"];
  assert.deepEqual(TUTORIAL_STEPS.map((step) => step.focusActionId), expectedFocusActions);
  for (const tutorialStep of TUTORIAL_STEPS) {
    const state = CreateInitialState(22);
    state.turn = tutorialStep.turn;
    state.phase = tutorialStep.turn <= CFG.tutorialTurns ? "tutorial" : "antiSweep";
    const availability = GetActionAvailability(
      state,
      tutorialStep.focusActionId,
      tutorialStep.targetVillageId,
    );
    assert.equal(availability.available, true, `第${tutorialStep.turn}回合关键行动应可用：${availability.reason}`);
    const intent = GetEnemyIntentPreview(state);
    assert.equal(intent.scripted, true);
    assert.equal(intent.targetVillageId, tutorialStep.enemyIntent.targetVillageId);
  }
}

function TestEnemyHasNoOmniscience() {
  const baseline = CreateInitialState(333);
  baseline.turn = 7;
  baseline.phase = "antiSweep";
  const baselineIntent = GetEnemyIntentPreview(baseline);

  const secretlyOrganized = Clone(baseline);
  secretlyOrganized.villages.RearRidge.organization = 3;
  secretlyOrganized.villages.RearRidge.trust = 100;
  secretlyOrganized.villages.RearRidge.livelihood = 100;
  secretlyOrganized.villages.RearRidge.contacted = true;
  const secretIntent = GetEnemyIntentPreview(secretlyOrganized);
  assert.equal(
    secretIntent.targetVillageId,
    baselineIntent.targetVillageId,
    "仅改变敌军未知的真实状态，不应改变其目标",
  );

  secretlyOrganized.enemyKnowledge.RearRidge.evidence = 20;
  secretlyOrganized.enemyKnowledge.RearRidge.confidence = 100;
  secretlyOrganized.enemyKnowledge.RearRidge.knownOrganization = 3;
  secretlyOrganized.villages.RearRidge.enemySuspicion = 100;
  const exposedIntent = GetEnemyIntentPreview(secretlyOrganized);
  assert.equal(exposedIntent.targetVillageId, "RearRidge", "掌握明确证据后，敌军才应改变目标");
  assert.ok(exposedIntent.decisionBasis.excludedFacts.includes("真实组织度"));
}

function TestLateEnemyOperationSchedule() {
  const expectedKinds = ["Search", "Requisition", "Requisition", "Sweep", "Sweep", "Search", "Sweep", "Sweep"];
  const expectedStrengths = [2, 2, 3, 3, 4, 5, 5, 6];
  const intents = [];
  for (let turn = 7; turn <= CFG.maximumTurns; turn += 1) {
    const state = CreateInitialState(700 + turn);
    state.turn = turn;
    state.phase = "antiSweep";
    const intent = GetEnemyIntentPreview(state);
    intents.push(intent);
    assert.equal(intent.kind, expectedKinds[turn - 7]);
    assert.equal(intent.strength, expectedStrengths[turn - 7]);
    assert.ok(intent.operationPhase.length > 0);
    assert.ok(intent.policy.length > 0);
    assert.ok(Number.isInteger(intent.threatBonus));
    assert.ok(Number.isInteger(intent.organizationPressure));
  }
  assert.equal(new Set(intents.map((intent) => intent.kind)).size, 3, "后半程必须有搜捕、征粮和扫荡三类行动");
  assert.ok(intents.at(-1).threatBonus > intents[0].threatBonus);
  assert.ok(intents.at(-1).organizationPressure > intents[0].organizationPressure);
  assert.equal(intents[0].eventId, "Turn7BurnSearch");
  assert.equal(intents[0].burnSearch, true);
  assert.match(intents[0].policy, /侵华日军.*纵火.*搜捕/);
}

function TestThreatUsesRouteReducedStrength() {
  const baseline = CreateInitialState(810);
  baseline.turn = 10;
  baseline.phase = "antiSweep";
  ForceEnemyTarget(baseline, "RiverWest");
  baseline.villages.RiverWest.organization = 0;
  baseline.villages.RiverWest.trust = 0;
  baseline.villages.RiverWest.livelihood = 100;

  const disrupted = Clone(baseline);
  disrupted.routes.RiverRoad.currentDisruption = 4;
  const baselineResult = ResolveTurn(baseline).lastResolution.enemy;
  const disruptedResult = ResolveTurn(disrupted).lastResolution.enemy;
  assert.equal(baselineResult.baseStrength, 3);
  assert.equal(baselineResult.effectiveStrength, 3);
  assert.equal(disruptedResult.routePenalty, 2);
  assert.equal(disruptedResult.effectiveStrength, 1);
  assert.equal(baselineResult.threatenedFamilies, 21);
  assert.equal(disruptedResult.threatenedFamilies, 15);
}

function TestPopularAutonomousActions() {
  const state = CreateInitialState(444);
  state.turn = 10;
  state.phase = "antiSweep";
  state.villages.StoneBridge.organization = 3;
  state.villages.StoneBridge.trust = 70;
  state.villages.StoneBridge.livelihood = 70;
  state.villages.StoneBridge.scars = 0;
  state.enemyKnowledge.StoneBridge.evidence = 20;
  state.enemyKnowledge.StoneBridge.confidence = 100;
  state.enemyKnowledge.StoneBridge.knownOrganization = 3;
  state.villages.StoneBridge.enemySuspicion = 100;
  const resolvedState = ResolveTurn(state);
  assert.equal(resolvedState.lastResolution.enemy.targetVillageId, "StoneBridge");
  const popularActionIds = resolvedState.lastResolution.popularActions.map((action) => action.id);
  assert.ok(popularActionIds.includes("EarlyWarning"));
  assert.ok(popularActionIds.includes("HideGrain"));
  assert.ok(popularActionIds.includes("Stretcher"));
  assert.ok(popularActionIds.includes("Tunnels"));
  assert.ok(resolvedState.lastResolution.enemy.protectedFamilies > 0);
  assert.ok(resolvedState.campaignMetrics.popularActions >= 4);
}

function TestPopularInitiativeViabilityAndScars() {
  const viable = CreateInitialState(445);
  viable.turn = 10;
  viable.phase = "antiSweep";
  ForceEnemyTarget(viable, "RiverWest");
  Object.assign(viable.villages.RiverWest, {
    contacted: true,
    organization: 3,
    trust: 100,
    livelihood: 100,
    scars: 0,
  });
  const healthyActions = ResolveTurn(viable).lastResolution.popularActions;
  assert.deepEqual(
    healthyActions.map((action) => action.id),
    ["EarlyWarning", "HideGrain", "Stretcher", "Tunnels"],
  );

  const exhausted = Clone(viable);
  exhausted.villages.RiverWest.trust = 0;
  exhausted.villages.RiverWest.livelihood = 0;
  assert.deepEqual(ResolveTurn(exhausted).lastResolution.popularActions, []);

  const scarred = Clone(viable);
  scarred.villages.RiverWest.scars = 5;
  const scarredActions = ResolveTurn(scarred).lastResolution.popularActions;
  const healthyWarning = healthyActions.find((action) => action.id === "EarlyWarning");
  const scarredWarning = scarredActions.find((action) => action.id === "EarlyWarning");
  const healthyTunnels = healthyActions.find((action) => action.id === "Tunnels");
  const scarredTunnels = scarredActions.find((action) => action.id === "Tunnels");
  assert.ok(scarredWarning.effectiveness < healthyWarning.effectiveness);
  assert.ok(scarredTunnels.effectiveness < healthyTunnels.effectiveness);
  assert.ok(scarredActions.every((action) => action.effectiveness >= 1));
  assert.ok(scarredActions.every((action) => action.scarPenalty > 0));
}

function TestEnemyCanBreakExposedOrganization() {
  const exposed = CreateInitialState(912);
  exposed.turn = 12;
  exposed.phase = "antiSweep";
  ForceEnemyTarget(exposed, "RiverWest");
  Object.assign(exposed.villages.RiverWest, {
    contacted: true,
    organization: 1,
    trust: 0,
    livelihood: 100,
    scars: 0,
  });
  const exposedResult = ResolveTurn(exposed);
  const enemyReport = exposedResult.lastResolution.enemy;
  assert.equal(enemyReport.kind, "Search");
  assert.equal(enemyReport.frustrated, false);
  assert.equal(enemyReport.organizationBefore, 1);
  assert.equal(enemyReport.organizationLoss, 1);
  assert.equal(enemyReport.organizationAfter, 0);
  assert.equal(enemyReport.contactLost, true);
  assert.equal(exposedResult.villages.RiverWest.contacted, false);
  assert.match(enemyReport.text, /地下组织损失1级，联络被切断/);

  const defended = Clone(exposed);
  Object.assign(defended.villages.RiverWest, {
    contacted: true,
    organization: 3,
    trust: 100,
    livelihood: 100,
    scars: 0,
  });
  defended.routes.RiverRoad.currentDisruption = 6;
  const defendedReport = ResolveTurn(defended).lastResolution.enemy;
  assert.equal(defendedReport.frustrated, true);
  assert.equal(defendedReport.organizationLoss, 0);
  assert.equal(defendedReport.organizationAfter, 3);
  assert.equal(defendedReport.contactLost, false);
}

function TestUniqueFamilyCountersAndBounds() {
  const protectedState = CreateInitialState(1001);
  protectedState.villages.StoneBridge.protectedFamilies = 37;
  protectedState.campaignMetrics.protectedFamilies = 37;
  const protectedResult = ResolveTurn(QueueAction(protectedState, "Relief", "StoneBridge"));
  assert.equal(protectedResult.villages.StoneBridge.protectedFamilies, 38);
  assert.equal(protectedResult.campaignMetrics.protectedFamilies, 38);

  const harmedState = CreateInitialState(1002);
  harmedState.turn = 14;
  harmedState.phase = "antiSweep";
  ForceEnemyTarget(harmedState, "RiverWest");
  harmedState.villages.RiverWest.harmedFamilies = 44;
  Object.assign(harmedState.villages.RiverWest, { organization: 0, trust: 0, livelihood: 100 });
  const harmedResult = ResolveTurn(harmedState);
  assert.equal(harmedResult.lastResolution.enemy.threatenedFamilies, 1);
  assert.equal(harmedResult.lastResolution.enemy.harmedFamilies, 1);
  assert.equal(harmedResult.villages.RiverWest.harmedFamilies, 45);
  assert.equal(harmedResult.campaignMetrics.victimizedFamilies, 45);

  const exhaustedState = Clone(harmedState);
  exhaustedState.turn = 13;
  exhaustedState.villages.RiverWest.harmedFamilies = 45;
  const exhaustedReport = ResolveTurn(exhaustedState).lastResolution.enemy;
  assert.equal(exhaustedReport.threatenedFamilies, 0);
  assert.equal(exhaustedReport.harmedFamilies, 0);

  const simulation = RunDeterministicSimulation({ seed: 1003 });
  const totalFamilies = VILLAGE_DEFINITIONS.reduce((sum, villageDefinition) => sum + villageDefinition.families, 0);
  for (const villageDefinition of VILLAGE_DEFINITIONS) {
    const village = simulation.state.villages[villageDefinition.id];
    assert.ok(village.protectedFamilies <= villageDefinition.families);
    assert.ok(village.harmedFamilies <= villageDefinition.families);
  }
  assert.ok(simulation.state.campaignMetrics.protectedFamilies <= totalFamilies);
  assert.ok(simulation.state.campaignMetrics.victimizedFamilies <= totalFamilies);
}

function TestOccupationConsequencesAndMitigation() {
  const exposed = CreateInitialState(1107);
  exposed.turn = 7;
  exposed.phase = "antiSweep";
  ForceEnemyTarget(exposed, "RiverWest");
  Object.assign(exposed.villages.RiverWest, {
    contacted: true,
    organization: 0,
    trust: 0,
    livelihood: 100,
    scars: 0,
  });
  const exposedState = ResolveTurn(exposed);
  const exposedReport = exposedState.lastResolution.enemy;
  assert.equal(exposedReport.eventId, "Turn7BurnSearch");
  assert.equal(exposedReport.burnSearch, true);
  assert.ok(exposedReport.grainSeized > 0);
  assert.ok(exposedReport.homesBurned > 0);
  assert.ok(exposedReport.familiesDisplaced > 0);
  assert.ok(exposedReport.peopleWounded > 0);
  assert.ok(exposedReport.peopleKilled > 0);
  assert.ok(exposedReport.peopleDetained > 0);
  assert.equal(exposedReport.perpetrator, "侵华日军占领部队");
  assert.match(exposedReport.responsibility, /侵华日军.*造成.*群众抵抗不是/);
  assert.match(exposedReport.text, /侵华日军占领行动.*焚毁/);

  const defended = Clone(exposed);
  Object.assign(defended.villages.RiverWest, {
    contacted: true,
    organization: 3,
    trust: 100,
    livelihood: 100,
    scars: 0,
  });
  const defendedReport = ResolveTurn(defended).lastResolution.enemy;
  assert.ok(defendedReport.homesBurned < exposedReport.homesBurned);
  assert.ok(defendedReport.familiesDisplaced < exposedReport.familiesDisplaced);
  assert.ok(defendedReport.peopleKilled <= exposedReport.peopleKilled);

  const nearCapacity = Clone(exposed);
  nearCapacity.villages.RiverWest.occupationConsequences = {
    grainSeized: 134,
    homesBurned: 44,
    familiesDisplaced: 44,
    peopleWounded: 1,
    peopleKilled: 178,
    peopleDetained: 0,
  };
  const cappedVillage = ResolveTurn(nearCapacity).villages.RiverWest;
  assert.equal(cappedVillage.occupationConsequences.grainSeized, 135);
  assert.equal(cappedVillage.occupationConsequences.homesBurned, 45);
  assert.equal(cappedVillage.occupationConsequences.familiesDisplaced, 45);
  assert.ok(
    cappedVillage.occupationConsequences.peopleWounded
      + cappedVillage.occupationConsequences.peopleKilled
      + cappedVillage.occupationConsequences.peopleDetained
      <= 180,
  );

  const simulation = RunDeterministicSimulation({ seed: 1108 });
  const consequenceFields = [
    "grainSeized",
    "homesBurned",
    "familiesDisplaced",
    "peopleWounded",
    "peopleKilled",
    "peopleDetained",
  ];
  const campaignTotals = Object.fromEntries(consequenceFields.map((fieldName) => [fieldName, 0]));
  for (const villageDefinition of VILLAGE_DEFINITIONS) {
    const consequences = simulation.state.villages[villageDefinition.id].occupationConsequences;
    assert.ok(consequences.grainSeized <= villageDefinition.families * 3);
    assert.ok(consequences.homesBurned <= villageDefinition.families);
    assert.ok(consequences.familiesDisplaced <= villageDefinition.families);
    assert.ok(
      consequences.peopleWounded + consequences.peopleKilled + consequences.peopleDetained
        <= villageDefinition.families * 4,
    );
    for (const fieldName of consequenceFields) {
      campaignTotals[fieldName] += consequences[fieldName];
    }
  }
  for (const fieldName of consequenceFields) {
    assert.equal(simulation.state.campaignMetrics[fieldName], campaignTotals[fieldName]);
  }
}

function TestSimultaneousResolutionIsOrderIndependent() {
  const initialState = CreateInitialState(555);
  let firstOrder = QueueAction(initialState, "Relief", "StoneBridge");
  firstOrder = QueueAction(firstOrder, "CounterRecon", "StoneBridge");
  let secondOrder = QueueAction(initialState, "CounterRecon", "StoneBridge");
  secondOrder = QueueAction(secondOrder, "Relief", "StoneBridge");
  const firstResult = ResolveTurn(firstOrder);
  const secondResult = ResolveTurn(secondOrder);
  assert.deepEqual(firstResult.villages, secondResult.villages);
  assert.deepEqual(firstResult.enemyKnowledge, secondResult.enemyKnowledge);
  assert.deepEqual(firstResult.campaignMetrics, secondResult.campaignMetrics);
}

function TestFourteenTurnSettlementAndDeterminism() {
  const firstSimulation = RunDeterministicSimulation({ seed: 666 });
  const secondSimulation = RunDeterministicSimulation({ seed: 666 });
  assert.equal(firstSimulation.resolvedTurns, 14);
  assert.equal(firstSimulation.state.status, "completed");
  assert.equal(firstSimulation.state.turn, 14);
  assert.ok(firstSimulation.outcome);
  assert.equal(firstSimulation.signature, secondSimulation.signature);
  assert.deepEqual(firstSimulation.state, secondSimulation.state);
}

function CreateOutcomeFixture({ livelihood, trust, organization, scars, metrics }) {
  const state = CreateInitialState(777);
  for (const village of Object.values(state.villages)) {
    village.livelihood = livelihood;
    village.trust = trust;
    village.organization = organization;
    village.scars = scars;
  }
  Object.assign(state.campaignMetrics, metrics);
  return state;
}

function TestThreeOutcomeTiers() {
  const highState = CreateOutcomeFixture({
    livelihood: 92,
    trust: 90,
    organization: 3,
    scars: 0,
    metrics: {
      protectedFamilies: 160,
      victimizedFamilies: 8,
      enemyRequisitionsFrustrated: 3,
      enemySweepsFrustrated: 6,
      routeDisruption: 14,
    },
  });
  const middleState = CreateOutcomeFixture({
    livelihood: 55,
    trust: 55,
    organization: 1,
    scars: 1,
    metrics: {
      protectedFamilies: 20,
      victimizedFamilies: 15,
      enemyRequisitionsFrustrated: 1,
      enemySweepsFrustrated: 1,
      routeDisruption: 4,
    },
  });
  const lowState = CreateOutcomeFixture({
    livelihood: 15,
    trust: 15,
    organization: 0,
    scars: 5,
    metrics: {
      protectedFamilies: 0,
      victimizedFamilies: 150,
      enemyRequisitionsFrustrated: 0,
      enemySweepsFrustrated: 0,
      routeDisruption: 0,
    },
  });
  assert.equal(CalculateOutcome(highState).tier, "GreatWallOfPeople");
  assert.equal(CalculateOutcome(middleState).tier, "EnduringBaseArea");
  assert.equal(CalculateOutcome(lowState).tier, "WoundedEmbers");
}

TestInitialState();
TestPlanCostsAndUndo();
TestTutorialActions();
TestEnemyHasNoOmniscience();
TestLateEnemyOperationSchedule();
TestThreatUsesRouteReducedStrength();
TestPopularAutonomousActions();
TestPopularInitiativeViabilityAndScars();
TestEnemyCanBreakExposedOrganization();
TestUniqueFamilyCountersAndBounds();
TestOccupationConsequencesAndMitigation();
TestSimultaneousResolutionIsOrderIndependent();
TestFourteenTurnSettlementAndDeterminism();
TestThreeOutcomeTiers();

console.log("PeopleWar rule smoke tests passed: varied occupation operations, viable popular resistance, capped household consequences, network damage, 14 turns, 3 endings.");
