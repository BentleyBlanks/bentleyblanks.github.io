import assert from "node:assert/strict";
import {
  gameConfig,
  regionDefinitions,
  actionDefinitions,
  policyDefinitions,
  historicalTurns,
  CreateGame,
  QueueOrder,
  RemoveOrder,
  ClearOrders,
  ChangePolicy,
  ChooseEventOption,
  CommitTurn,
  GetActionPreview,
  GetEnemyForecast,
  GetCampaignScore,
  SerializeGame,
  DeserializeGame,
  CheckInvariants,
  AutoPlayTurn,
  GetCurrentTurn,
  GetInstitutionDefinitions,
} from "./Script_Rules.mjs";

const expectedDates = Object.freeze([
  "1941-07-07",
  "1941-08-12",
  "1941-08-14",
  "1941-08-23",
  "1941-08-28",
  "1941-09-02",
  "1941-09-05",
  "1941-09-07",
  "1941-09-18",
  "1941-09-25",
  "1941-09-26",
  "1941-10-16",
  "1941-12-01",
  "1942-01-15",
  "1942-02-15",
  "1942-03-20",
  "1942-04-15",
  "1942-06-20",
]);

const expectedActionIds = Object.freeze([
  "massWork",
  "relief",
  "contact",
  "recon",
  "evacuate",
  "sabotage",
  "ambush",
]);

const expectedPolicyIds = Object.freeze(["protect", "guerrilla", "network", "production"]);

function GetRegionSnapshot(game) {
  return JSON.stringify(game.regions);
}

function GetInstitutionSnapshot(game) {
  return JSON.stringify(game.institutions);
}

function AssertValid(game, message = "game state") {
  const check = CheckInvariants(game);
  assert.equal(check.valid, true, `${message}: ${check.errors.join(" | ")}`);
  for (const value of Object.values(game.resources)) {
    assert.ok(value >= 0 && value <= 100, `${message}: resource out of range`);
  }
  for (const region of Object.values(game.regions)) {
    for (const key of ["network", "safety", "enemyControl", "exposure", "devastation", "protection", "corridorRelevance", "railRelevance"]) {
      assert.ok(region[key] >= 0 && region[key] <= 100, `${message}: ${region.id}.${key} out of range`);
    }
  }
}

function AssertNoForbiddenScoreKeys(value, path = "state") {
  if (!value || typeof value !== "object") {
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    assert.notEqual(key, "killScore", `${path} must not contain killScore`);
    assert.notEqual(key, "casualtyScore", `${path} must not contain casualtyScore`);
    assert.notEqual(key, "deathReward", `${path} must not contain deathReward`);
    AssertNoForbiddenScoreKeys(child, `${path}.${key}`);
  }
}

function TestDefinitions() {
  assert.equal(gameConfig.turnCount, 18);
  assert.equal(gameConfig.ordersPerTurn, 3);
  assert.deepEqual(gameConfig.estimatedMinutes, [70, 100]);
  assert.match(gameConfig.playerRole, /虚构/);
  assert.match(gameConfig.playerRole, /并非任何真实人物/);
  assert.equal(gameConfig.nationalOutcome.includes("1945年"), true);
  assert.deepEqual(gameConfig.scoreWeights, {
    safety: 0.4,
    network: 0.25,
    institutions: 0.2,
    resistance: 0.1,
    trust: 0.05,
  });

  assert.equal(Array.isArray(regionDefinitions), true, "regionDefinitions must be iterable for the map UI");
  assert.equal(regionDefinitions.length, 12);
  assert.equal(new Set(regionDefinitions.map((region) => region.id)).size, 12);
  for (const region of regionDefinitions) {
    assert.ok(region.name && region.terrainName && region.role);
    assert.equal(Array.isArray(region.adjacentIds), true);
    for (const adjacentId of region.adjacentIds) {
      const adjacent = regionDefinitions.find((candidate) => candidate.id === adjacentId);
      assert.ok(adjacent, `${region.id} references an unknown neighbor`);
      assert.ok(adjacent.adjacentIds.includes(region.id), `${region.id} adjacency must be symmetric`);
    }
  }

  assert.deepEqual(Object.keys(actionDefinitions), expectedActionIds);
  assert.deepEqual(Object.keys(policyDefinitions), expectedPolicyIds);
  for (const action of Object.values(actionDefinitions)) {
    assert.ok(action.name && action.description);
    assert.deepEqual(Object.keys(action.costs), ["supply", "organization", "intelligence", "trust"]);
  }
  for (const policy of Object.values(policyDefinitions)) {
    assert.ok(policy.switchCost > 0);
    assert.ok(policy.cooldownTurns > 0);
  }

  assert.equal(historicalTurns.length, 18);
  assert.deepEqual(historicalTurns.map((turn) => turn.date), expectedDates);
  assert.equal(new Set(historicalTurns.map((turn) => turn.id)).size, 18);
  for (const turn of historicalTurns) {
    assert.ok(turn.title && turn.context && turn.prompt);
    assert.equal(turn.fact.label, "历史事实");
    assert.ok(turn.fact.text);
    assert.ok(turn.abstraction.label && turn.abstraction.text);
    assert.ok(turn.choices.length >= 1 && turn.choices.length <= 3);
    for (const choice of turn.choices) {
      assert.ok(choice.id && choice.name && choice.description && choice.preview);
    }
  }

  const allHistoricalCopy = historicalTurns.map((turn) => `${turn.title}${turn.context}${turn.fact.text}${turn.abstraction.text}`).join("\n");
  for (const requiredPhrase of ["抗大二分校", "狼牙山五壮士", "疾疫", "精兵简政", "树叶训令", "五一"] ) {
    assert.match(allHistoricalCopy, new RegExp(requiredPhrase));
  }
  const memorialTurn = historicalTurns.find((turn) => turn.memorial);
  assert.equal(memorialTurn.date, "1941-09-25");
  assert.deepEqual(memorialTurn.memorial, { fixed: true, noAlternateFate: true, noGameplayReward: true });
  assert.equal(memorialTurn.choices.length, 1);
  assert.deepEqual(memorialTurn.choices[0].effects, {});
  assert.match(memorialTurn.choices[0].description, /不提供任何数值奖励/);
  const famineTurn = historicalTurns.find((turn) => turn.fixedDiscipline);
  assert.ok(famineTurn.choices.every((choice) => choice.effects.flags.leafDirectiveHonored));
  const supportTurn = historicalTurns.find((turn) => turn.fixedSupportDuty);
  assert.ok(supportTurn.choices.every((choice) => choice.effects.flags.finalSupportCompleted));
  AssertNoForbiddenScoreKeys({ gameConfig, regionDefinitions, actionDefinitions, policyDefinitions, historicalTurns });
}

function TestPureQueueMechanics() {
  const initial = CreateGame(101);
  const initialSerialized = SerializeGame(initial);
  const resourcesBefore = JSON.stringify(initial.resources);
  const regionsBefore = GetRegionSnapshot(initial);
  const institutionsBefore = GetInstitutionSnapshot(initial);

  const firstPreview = GetActionPreview(initial, "relief", "fuping");
  assert.equal(firstPreview.valid, true);
  assert.equal(firstPreview.actionId, "relief");
  assert.equal(firstPreview.regionId, "fuping");
  assert.deepEqual(Object.keys(firstPreview.costs), ["supply", "organization", "intelligence", "trust"]);
  assert.deepEqual(Object.keys(firstPreview.projected), ["network", "safety", "enemyControl", "exposure", "devastation", "protection"]);
  assert.ok(["可靠", "有把握", "冒险"].includes(firstPreview.successBand));
  assert.ok(firstPreview.summary);
  assert.equal(SerializeGame(initial), initialSerialized, "preview must be pure");

  let queued = QueueOrder(initial, "relief", "fuping");
  assert.equal(queued.queuedOrders.length, 1);
  assert.equal(JSON.stringify(queued.resources), resourcesBefore, "queue must not spend resources");
  assert.equal(GetRegionSnapshot(queued), regionsBefore, "queue must not alter regions");
  assert.equal(GetInstitutionSnapshot(queued), institutionsBefore, "queue must not move institutions");
  assert.equal(SerializeGame(initial), initialSerialized, "QueueOrder must not mutate its input");
  assert.throws(() => QueueOrder(queued, "massWork", "fuping"), /每个地区只能/);

  queued = QueueOrder(queued, { actionId: "contact", regionId: "wutai" });
  queued = QueueOrder(queued, "recon", "lingqiu");
  assert.equal(queued.queuedOrders.length, 3);
  assert.throws(() => QueueOrder(queued, "massWork", "laiyuan"), /最多下达/);
  AssertValid(queued, "three queued orders");

  const firstOrderId = queued.queuedOrders[0].id;
  const removed = RemoveOrder(queued, firstOrderId);
  assert.equal(removed.queuedOrders.length, 2);
  assert.equal(queued.queuedOrders.length, 3, "RemoveOrder must not mutate its input");
  const removedByRegion = RemoveOrder(removed, "wutai");
  assert.equal(removedByRegion.queuedOrders.length, 1);
  const cleared = ClearOrders(removedByRegion);
  assert.equal(cleared.queuedOrders.length, 0);
  assert.equal(removedByRegion.queuedOrders.length, 1, "ClearOrders must not mutate its input");

  const invalidAction = GetActionPreview(initial, "notAnAction", "fuping");
  assert.equal(invalidAction.valid, false);
  assert.ok(invalidAction.warnings.length);
  const invalidRegion = GetActionPreview(initial, "relief", "notARegion");
  assert.equal(invalidRegion.valid, false);
  assert.throws(() => QueueOrder(initial, "notAnAction", "fuping"), /未知行动/);
  assert.throws(() => QueueOrder(initial, "relief", "notARegion"), /未知地区/);

  for (const actionId of expectedActionIds) {
    const preview = GetActionPreview(initial, actionId, "fuping");
    assert.equal(typeof preview.valid, "boolean");
    assert.equal(preview.actionId, actionId);
    assert.ok(preview.riskLabel);
  }
}

function TestEventAndInstitutionMechanics() {
  const initial = CreateGame(202);
  const turn = GetCurrentTurn(initial);
  assert.equal(turn, historicalTurns[0]);
  const resourcesBefore = JSON.stringify(initial.resources);
  const regionsBefore = GetRegionSnapshot(initial);
  const institutionsBefore = GetInstitutionSnapshot(initial);
  const chosen = ChooseEventOption(initial, turn.choices[1].id);
  assert.equal(chosen.selectedEventOptionId, turn.choices[1].id);
  assert.equal(JSON.stringify(chosen.resources), resourcesBefore, "event choice is staged until commit");
  assert.equal(GetRegionSnapshot(chosen), regionsBefore);
  assert.equal(GetInstitutionSnapshot(chosen), institutionsBefore);
  assert.equal(initial.selectedEventOptionId, null, "ChooseEventOption must not mutate its input");
  assert.throws(() => ChooseEventOption(initial, "notAChoice"), /没有选项/);

  const constrained = CreateGame(203);
  constrained.resources.supply = 10;
  assert.equal(GetActionPreview(constrained, "relief", "fuping").valid, true);
  const costlyChoice = ChooseEventOption(constrained, "stores");
  assert.equal(GetActionPreview(costlyChoice, "relief", "fuping").valid, false, "preview must reserve staged event costs");
  assert.throws(() => QueueOrder(costlyChoice, "relief", "fuping"), /资源不足/);
  const preQueued = QueueOrder(constrained, "relief", "fuping");
  assert.throws(() => ChooseEventOption(preQueued, "stores"), /选择该方案后物资不足/);

  const restingTurn = CommitTurn(ChooseEventOption(CreateGame(204), "stores"));
  assert.equal(restingTurn.lastResolution.orders.length, 0, "a zero-order recovery turn must remain valid");
  AssertValid(restingTurn, "zero-order recovery turn");

  let evacuation = ChooseEventOption(CreateGame(303), historicalTurns[0].choices[0].id);
  const beforeLocations = Object.fromEntries(Object.values(evacuation.institutions).map((institution) => [institution.id, institution.regionId]));
  evacuation = QueueOrder(evacuation, "evacuate", "fuping", "wutai");
  const stagedLocations = Object.fromEntries(Object.values(evacuation.institutions).map((institution) => [institution.id, institution.regionId]));
  assert.deepEqual(stagedLocations, beforeLocations, "evacuation must not move an institution while queued");
  const committed = CommitTurn(evacuation);
  const movedInstitutions = Object.values(committed.institutions).filter(
    (institution) => beforeLocations[institution.id] !== institution.regionId,
  );
  assert.equal(movedInstitutions.length, 1);
  assert.equal(movedInstitutions[0].regionId, "wutai");
  assert.ok(committed.lastResolution.institutionChanges.length >= 1);
  assert.equal(committed.turnIndex, 1);
  assert.equal(committed.history.length, 1);
  assert.equal(committed.lastResolution.date, "1941-07-07");
  AssertValid(committed, "evacuation commit");

  const institutions = GetInstitutionDefinitions();
  assert.deepEqual(Object.keys(institutions).sort(), ["government", "hospital", "press", "radio", "school"]);
  for (const institution of Object.values(institutions)) {
    assert.ok(institution.regionId && institution.health > 0 && institution.active);
  }
}

function TestPolicyMechanics() {
  const initial = CreateGame(404);
  const eventLimited = CreateGame(405);
  eventLimited.resources.organization = 8;
  const recordsChoice = ChooseEventOption(eventLimited, "records");
  assert.throws(() => ChangePolicy(recordsChoice, "network"), /组织力不足/, "policy switch must reserve staged event costs");
  const changed = ChangePolicy(initial, "network");
  assert.equal(changed.policyId, "network");
  assert.equal(changed.resources.organization, initial.resources.organization - policyDefinitions.network.switchCost);
  assert.equal(changed.policyCooldown, policyDefinitions.network.cooldownTurns);
  assert.equal(initial.policyId, "protect", "ChangePolicy must not mutate its input");
  assert.throws(() => ChangePolicy(changed, "production"), /等待/);
  const unchanged = ChangePolicy(initial, "protect");
  assert.equal(unchanged.resources.organization, initial.resources.organization);
  assert.notEqual(unchanged, initial);

  let progressed = CommitTurn(changed);
  assert.equal(progressed.policyCooldown, 1);
  progressed = CommitTurn(progressed);
  assert.equal(progressed.policyCooldown, 0);
  const changedAgain = ChangePolicy(progressed, "production");
  assert.equal(changedAgain.policyId, "production");
  AssertValid(changedAgain, "policy cooldown");
}

function TestEnemyKnowledgeBoundary() {
  const game = CreateGame(505);
  const baseline = GetEnemyForecast(game);
  assert.equal(baseline.turnIndex, 0);
  assert.equal(baseline.date, "1941-07-07");
  assert.ok(["清晰", "有限", "模糊"].includes(baseline.certainty));
  assert.equal(baseline.targets.length, 3);
  for (const target of baseline.targets) {
    assert.ok(target.regionId && target.regionName && Number.isFinite(target.score));
    assert.ok(["高", "中", "低"].includes(target.likelihood));
    assert.ok(target.reasons.length);
  }

  const hiddenFactsChanged = DeserializeGame(SerializeGame(game));
  hiddenFactsChanged.regions.fuping.network = 1;
  hiddenFactsChanged.regions.jingxing.network = 99;
  hiddenFactsChanged.regions.fuping.safety = 1;
  hiddenFactsChanged.regions.jingxing.safety = 99;
  hiddenFactsChanged.institutions.press.regionId = "xinle";
  const hiddenForecast = GetEnemyForecast(hiddenFactsChanged);
  assert.deepEqual(hiddenForecast, baseline, "forecast must not use hidden network, safety, or institution locations");

  const observableFactsChanged = DeserializeGame(SerializeGame(game));
  observableFactsChanged.regions.fuping.exposure = 100;
  observableFactsChanged.enemy.suspicionByRegion.fuping = 100;
  const observableForecast = GetEnemyForecast(observableFactsChanged);
  assert.notDeepEqual(observableForecast, baseline, "forecast must respond to observable suspicion and exposure");
}

function TestSerializationAndDeterminism() {
  const initial = CreateGame(606);
  const serialized = SerializeGame(initial);
  const restored = DeserializeGame(serialized);
  assert.deepEqual(restored, initial);
  assert.equal(SerializeGame(restored), serialized);
  restored.resources.supply -= 1;
  assert.notEqual(restored.resources.supply, initial.resources.supply, "DeserializeGame must return an independent object");
  assert.throws(() => DeserializeGame("{bad json"), /无法解析/);
  assert.throws(() => DeserializeGame(JSON.stringify({ ...initial, saveVersion: 999 })), /不支持的存档版本/);
  assert.throws(() => DeserializeGame(JSON.stringify({ ...initial, resources: { ...initial.resources, supply: -1 } })), /校验失败/);

  let left = CreateGame(777);
  let right = CreateGame(777);
  for (let turnIndex = 0; turnIndex < historicalTurns.length; turnIndex += 1) {
    left = AutoPlayTurn(left);
    right = AutoPlayTurn(right);
    assert.equal(SerializeGame(left), SerializeGame(right), `seeded games diverged on turn ${turnIndex + 1}`);
  }
  assert.equal(left.phase, "ended");
  assert.deepEqual(left.outcome, right.outcome);
  assert.notEqual(SerializeGame(left), SerializeGame(CreateGame(778)), "different seed state should serialize differently");
}

function TestScoring() {
  const game = CreateGame(808);
  const score = GetCampaignScore(game);
  assert.ok(score.total >= 0 && score.total <= 100);
  assert.deepEqual(Object.keys(score.components), ["safety", "network", "institutions", "resistance", "trust"]);
  assert.equal(score.components.safety.weight, 0.4);
  assert.equal(score.components.network.weight, 0.25);
  assert.equal(score.components.institutions.weight, 0.2);
  assert.equal(score.components.resistance.weight, 0.1);
  assert.equal(score.components.trust.weight, 0.05);
  const weightedTotal = Object.values(score.components).reduce((sum, component) => sum + component.weighted, 0);
  assert.ok(Math.abs(score.total - weightedTotal) <= 0.11);
  assert.equal(score.nationalOutcomeFixed, true);
  assert.equal(score.nationalOutcome, gameConfig.nationalOutcome);
  assert.doesNotMatch(score.summary, /歼敌数|击杀数/);
  assert.ok(Number.isInteger(score.requirements.effectiveNetworkRegions));
  assert.ok(Number.isInteger(score.requirements.institutionSurvivors));
  assert.equal(typeof score.requirements.corridorOpen, "boolean");
}

function TestFiveHundredCampaigns() {
  const campaignCount = 500;
  let minimumScore = 100;
  let maximumScore = 0;
  let totalScore = 0;
  const resolvedDates = new Set();
  const eventChoices = new Set();
  const startTime = Date.now();

  for (let seed = 1; seed <= campaignCount; seed += 1) {
    let game = CreateGame(seed);
    let turnGuard = 0;
    while (game.phase !== "ended" && turnGuard < historicalTurns.length + 2) {
      const previousTurnIndex = game.turnIndex;
      game = AutoPlayTurn(game);
      turnGuard += 1;
      assert.equal(game.turnIndex, previousTurnIndex + 1, `seed ${seed} failed to advance`);
      AssertValid(game, `seed ${seed}, turn ${game.turnIndex}`);
      assert.equal(game.lastResolution.turnIndex, previousTurnIndex);
      assert.equal(game.lastResolution.date, historicalTurns[previousTurnIndex].date);
      assert.ok(game.lastResolution.event.optionId);
      assert.ok(Array.isArray(game.lastResolution.orders));
      assert.ok(Array.isArray(game.lastResolution.enemy));
      resolvedDates.add(game.lastResolution.date);
      eventChoices.add(`${previousTurnIndex}:${game.lastResolution.event.optionId}`);
    }
    assert.equal(turnGuard, historicalTurns.length, `seed ${seed} deadlocked`);
    assert.equal(game.phase, "ended");
    assert.equal(game.turnIndex, historicalTurns.length);
    assert.equal(game.history.length, historicalTurns.length);
    assert.equal(game.flags.leafDirectiveHonored, true, `seed ${seed} did not honor the fixed food discipline`);
    assert.equal(game.flags.finalSupportCompleted, true, `seed ${seed} did not complete the fixed support duty`);
    assert.equal(game.outcome.nationalOutcomeFixed, true);
    assert.equal(game.outcome.nationalOutcome, gameConfig.nationalOutcome);
    AssertNoForbiddenScoreKeys(game);

    const score = GetCampaignScore(game);
    minimumScore = Math.min(minimumScore, score.total);
    maximumScore = Math.max(maximumScore, score.total);
    totalScore += score.total;
  }
  assert.deepEqual([...resolvedDates].sort(), [...expectedDates].sort());
  assert.ok(eventChoices.size >= historicalTurns.length, "all turns must resolve an event option");
  return {
    campaignCount,
    minimumScore,
    maximumScore,
    averageScore: Math.round((totalScore / campaignCount) * 10) / 10,
    elapsedMilliseconds: Date.now() - startTime,
  };
}

function RunSmokeTest() {
  TestDefinitions();
  TestPureQueueMechanics();
  TestEventAndInstitutionMechanics();
  TestPolicyMechanics();
  TestEnemyKnowledgeBoundary();
  TestSerializationAndDeterminism();
  TestScoring();
  const campaignSummary = TestFiveHundredCampaigns();
  console.log("Beiyue1941 deterministic smoke test passed.");
  console.log(`Validated ${historicalTurns.length} historical turns, ${regionDefinitions.length} regions, ${Object.keys(actionDefinitions).length} actions, and ${Object.keys(policyDefinitions).length} policies.`);
  console.log(`Autoplay: ${campaignSummary.campaignCount} campaigns, score ${campaignSummary.minimumScore}–${campaignSummary.maximumScore}, average ${campaignSummary.averageScore}, ${campaignSummary.elapsedMilliseconds} ms.`);
}

RunSmokeTest();
