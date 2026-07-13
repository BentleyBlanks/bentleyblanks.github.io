import assert from "node:assert/strict";

import {
  gameConfig,
  regionDefinitions,
  historicalTurns,
  formationDefinitions,
  actionDefinitions,
  stanceDefinitions,
  routeDefinitions,
  CreateGame,
  ChooseEventOption,
  ProbeRegion,
  GetEnemyForecast,
  GetActionPreview,
  QueueOrder,
  RemoveOrder,
  ClearOrders,
  CommitTurn,
  GetPlanAssessment,
  GetConnectedRegionIds,
  GetCampaignScore,
  SerializeGame,
  DeserializeGame,
  CheckInvariants,
  AutoPlayTurn,
} from "./Script_StrategyRules.mjs";

let assertionCount = 0;

function Assert(condition, message) {
  assertionCount += 1;
  assert.ok(condition, message);
}

function AssertEqual(actual, expected, message) {
  assertionCount += 1;
  assert.equal(actual, expected, message);
}

function AssertDeepEqual(actual, expected, message) {
  assertionCount += 1;
  assert.deepEqual(actual, expected, message);
}

function Brief(game) {
  return game.selectedEventOptionId === "briefed" ? game : ChooseEventOption(game, "briefed");
}

function GetRouteId(leftId, rightId) {
  return `route_${[leftId, rightId].sort().join("_")}`;
}

function TestDefinitions() {
  AssertEqual(historicalTurns.length, 12, "The strategy campaign should use twelve operational turns");
  AssertEqual(regionDefinitions.length, 12, "The map should retain twelve regions");
  AssertEqual(Object.keys(formationDefinitions).length, 5, "Five persistent formations should exist");
  AssertEqual(Object.keys(routeDefinitions).length, 23, "Every unique adjacency should become a route object");
  AssertEqual(gameConfig.commandPointsPerTurn, 4, "Each turn should force a choice among five formations");
  Assert(Object.keys(actionDefinitions).length >= 8, "The plan system should expose differentiated missions");
  Assert(Object.keys(stanceDefinitions).length === 3, "Plans should support three risk postures");
  for (const turn of historicalTurns) {
    Assert(Boolean(turn.fact?.text), `${turn.id} should retain historical facts`);
    Assert(Boolean(turn.abstraction?.text), `${turn.id} should label the operational abstraction`);
    Assert(Boolean(turn.objective?.objective), `${turn.id} should define an operational responsibility`);
    Assert(turn.archiveNodes.length >= 1, `${turn.id} should retain its source timeline nodes`);
  }
  AssertEqual(historicalTurns[8].objective.minimumReserveCount, 2, "The rotation turn should require a meaningful two-formation reserve");
}

function TestInitialState() {
  const game = CreateGame(19410707);
  const check = CheckInvariants(game);
  Assert(check.valid, check.errors.join("; "));
  AssertEqual(game.enemy.currentPlan.createdForTurn, 0, "Enemy intent should be generated before player planning");
  Assert(Number.isFinite(game.enemy.currentPlan.planFingerprint), "Enemy intent should have a stable fingerprint");
  AssertEqual(Object.keys(game.routes).length, Object.keys(routeDefinitions).length, "All routes should have persistent state");
  AssertEqual(Object.keys(game.formations).length, Object.keys(formationDefinitions).length, "All formations should have persistent state");
  Assert(GetConnectedRegionIds(game).length < regionDefinitions.length, "The initial map should not be a universally connected resource pool");
}

function TestEnemyIntentLockAndIntelligence() {
  let game = Brief(CreateGame(7519));
  const originalPlan = JSON.stringify(game.enemy.currentPlan);
  const forecast = GetEnemyForecast(game);
  Assert(forecast.targets.every((target) => !target.confirmed), "Passive signals should not expose exact targets");
  const actualTargetId = game.enemy.currentPlan.targets[0].regionId;
  game = ProbeRegion(game, actualTargetId);
  const confirmed = GetEnemyForecast(game).targets.find((target) => target.regionId === actualTargetId);
  Assert(confirmed?.confirmed && confirmed?.isTarget, "A paid probe should confirm a local target");
  AssertEqual(JSON.stringify(game.enemy.currentPlan), originalPlan, "Probing must not alter the precommitted enemy plan");
  const localGuard = game.formations.localGuard;
  game = QueueOrder(game, {
    formationId: "localGuard",
    missionId: "recon",
    targetRegionId: localGuard.regionId,
    stanceId: "balanced",
  });
  AssertEqual(JSON.stringify(game.enemy.currentPlan), originalPlan, "Player orders must not alter enemy intent");
  const resolved = CommitTurn(game);
  AssertEqual(resolved.lastResolution.enemyPlanFingerprint, JSON.parse(originalPlan).planFingerprint, "Resolution should use the originally locked enemy plan");
}

function TestGeographyAndFormationLimits() {
  let game = Brief(CreateGame(991));
  const farPreview = GetActionPreview(game, {
    formationId: "mobileGuard",
    missionId: "move",
    targetRegionId: "xinle",
    stanceId: "balanced",
  });
  Assert(!farPreview.valid, "A formation must not teleport across the map");
  const invalidCapability = GetActionPreview(game, {
    formationId: "mobileGuard",
    missionId: "relief",
    targetRegionId: "wutai",
    stanceId: "balanced",
  });
  Assert(!invalidCapability.valid, "An armed formation should not perform a work-team-only mission");
  const adjacentPreview = GetActionPreview(game, {
    formationId: "mobileGuard",
    missionId: "move",
    targetRegionId: "fuping",
    stanceId: "balanced",
  });
  Assert(adjacentPreview.valid, "Adjacent movement over an intact route should be legal");
  const stationaryPreview = GetActionPreview(game, {
    formationId: "mobileGuard",
    missionId: "move",
    targetRegionId: "wutai",
    stanceId: "balanced",
  });
  Assert(!stationaryPreview.valid, "A zero-distance move must not satisfy movement responsibilities");
  const remoteFallbackPreview = GetActionPreview(game, {
    formationId: "transportTeam",
    missionId: "institutionMove",
    targetRegionId: "tangxian",
    stanceId: "balanced",
    fallbackRegionId: "xinle",
  });
  Assert(!remoteFallbackPreview.valid, "A fallback must not teleport a formation or institution to a non-adjacent region");
  game.routes[GetRouteId("wutai", "fuping")].integrity = 0;
  const cutPreview = GetActionPreview(game, {
    formationId: "mobileGuard",
    missionId: "move",
    targetRegionId: "fuping",
    stanceId: "balanced",
  });
  Assert(!cutPreview.valid, "A cut route should block direct movement");
}

function TestPlanningReplacementAndSynergy() {
  let game = Brief(CreateGame(3317));
  game.formations.localGuard.regionId = "fuping";
  game.formations.northWorkTeam.regionId = "fuping";
  game = QueueOrder(game, { formationId: "localGuard", missionId: "screen", targetRegionId: "fuping", stanceId: "balanced" });
  game = QueueOrder(game, { formationId: "northWorkTeam", missionId: "recon", targetRegionId: "fuping", stanceId: "balanced" });
  const screenPreview = GetActionPreview(game, game.queuedOrders.find((order) => order.formationId === "localGuard"));
  Assert(screenPreview.synergies.some((text) => text.includes("侦察")), "Recon and screening should create an explicit combined-arms synergy");
  const originalCount = game.queuedOrders.length;
  game = QueueOrder(game, { formationId: "northWorkTeam", missionId: "liaison", targetRegionId: "fuping", stanceId: "concealed" });
  AssertEqual(game.queuedOrders.length, originalCount, "A new order for the same formation should replace, not duplicate, its assignment");
  AssertEqual(game.queuedOrders.find((order) => order.formationId === "northWorkTeam").missionId, "liaison", "The replacement assignment should be retained");
  const assessment = GetPlanAssessment(game);
  Assert(assessment.commandUsed <= assessment.commandAvailable, "Plans must respect command capacity");
  game = RemoveOrder(game, "northWorkTeam");
  Assert(!game.queuedOrders.some((order) => order.formationId === "northWorkTeam"), "Orders should be removable by formation");
  game = ClearOrders(game);
  AssertEqual(game.queuedOrders.length, 0, "The full plan should be clearable");
}

function BuildOrderIndependentGame(reverse = false) {
  let game = Brief(CreateGame(44021));
  const orders = [
    { formationId: "localGuard", missionId: "screen", targetRegionId: "fuping", stanceId: "balanced" },
    { formationId: "transportTeam", missionId: "supply", targetRegionId: "tangxian", stanceId: "concealed" },
    { formationId: "northWorkTeam", missionId: "recon", targetRegionId: "laiyuan", stanceId: "balanced" },
  ];
  for (const order of reverse ? [...orders].reverse() : orders) game = QueueOrder(game, order);
  return CommitTurn(game);
}

function TestOrderIndependenceAndSerialization() {
  const forward = BuildOrderIndependentGame(false);
  const reverse = BuildOrderIndependentGame(true);
  const selectState = (game) => ({
    resources: game.resources,
    regions: game.regions,
    routes: game.routes,
    formations: game.formations,
    institutions: game.institutions,
    objectiveResults: game.objectiveResults,
  });
  AssertDeepEqual(selectState(forward), selectState(reverse), "Click order must not create hidden resolution effects");
  const roundTrip = DeserializeGame(SerializeGame(forward));
  AssertDeepEqual(roundTrip, forward, "Strategy state should serialize deterministically");
}

function TestLocalCacheAndReserveConsequences() {
  let withCache = Brief(CreateGame(771));
  withCache.formations.northWorkTeam.regionId = "laiyuan";
  withCache.regions.laiyuan.localCache = 2;
  withCache = QueueOrder(withCache, { formationId: "northWorkTeam", missionId: "relief", targetRegionId: "laiyuan", stanceId: "balanced" });
  const safetyBefore = withCache.regions.laiyuan.safety;
  withCache = CommitTurn(withCache);
  const cacheGain = withCache.regions.laiyuan.safety - safetyBefore;

  let withoutCache = Brief(CreateGame(771));
  withoutCache.formations.northWorkTeam.regionId = "laiyuan";
  withoutCache.regions.laiyuan.localCache = 0;
  withoutCache = QueueOrder(withoutCache, { formationId: "northWorkTeam", missionId: "relief", targetRegionId: "laiyuan", stanceId: "balanced" });
  const emptySafetyBefore = withoutCache.regions.laiyuan.safety;
  withoutCache = CommitTurn(withoutCache);
  const emptyGain = withoutCache.regions.laiyuan.safety - emptySafetyBefore;
  Assert(cacheGain > emptyGain, "Local caches should materially change relief effectiveness");
  const reserveIds = withoutCache.lastResolution.reservedFormationIds;
  Assert(reserveIds.length >= 4, "Unassigned formations should be recorded as reserves");
}

function TestInstitutionDisruptionAndRouteRotation() {
  let institutionGame = Brief(CreateGame(19410707));
  institutionGame = QueueOrder(institutionGame, {
    formationId: "transportTeam",
    missionId: "institutionMove",
    targetRegionId: "tangxian",
    stanceId: "balanced",
    fallbackRegionId: "quyang",
  });
  institutionGame = CommitTurn(institutionGame);
  AssertEqual(institutionGame.institutions.hospital.regionId, "quyang", "A valid institution move should use the adjacent fallback");
  AssertEqual(institutionGame.institutions.hospital.disruptedTurns, 1, "A moved institution should remain disrupted throughout the following turn");

  let routeGame = Brief(CreateGame(4407));
  routeGame = QueueOrder(routeGame, { formationId: "mobileGuard", missionId: "recon", targetRegionId: "fuping", stanceId: "balanced" });
  routeGame = QueueOrder(routeGame, { formationId: "localGuard", missionId: "screen", targetRegionId: "wutai", stanceId: "balanced" });
  routeGame = CommitTurn(routeGame);
  const rotatedRouteId = GetRouteId("fuping", "wutai");
  Assert(routeGame.routes[rotatedRouteId].consecutiveUses >= 2, "Two formations using one route should create a repeated-use trace");
  routeGame = CommitTurn(Brief(routeGame));
  AssertEqual(routeGame.routes[rotatedRouteId].consecutiveUses, 0, "Leaving a route unused for a turn should clear its consecutive-use memory");
}

function TestInactionIsCostly() {
  let game = CreateGame(1999);
  const startingSafety = Object.values(game.regions).reduce((sum, region) => sum + region.safety, 0);
  for (let turn = 0; turn < 4; turn += 1) game = CommitTurn(Brief(game));
  const endingSafety = Object.values(game.regions).reduce((sum, region) => sum + region.safety, 0);
  Assert(endingSafety < startingSafety - 40, "Repeated inaction should allow the fixed enemy campaign to damage local safety");
  AssertEqual(game.objectiveResults.filter((result) => result.success).length, 0, "Inaction should not complete operational responsibilities");
}

function ShuffleDeterministically(values, seed) {
  return [...values].sort((left, right) => {
    const leftHash = (String(left).split("").reduce((sum, character) => sum + character.charCodeAt(0), seed) * 2654435761) >>> 0;
    const rightHash = (String(right).split("").reduce((sum, character) => sum + character.charCodeAt(0), seed) * 2654435761) >>> 0;
    return leftHash - rightHash || String(left).localeCompare(String(right));
  });
}

function PlayRandomTurn(game, seed) {
  let nextGame = Brief(game);
  const formationIds = ShuffleDeterministically(Object.keys(formationDefinitions), seed + nextGame.turnIndex);
  for (const formationId of formationIds) {
    const definition = formationDefinitions[formationId];
    const formation = nextGame.formations[formationId];
    const missionIds = ShuffleDeterministically(definition.missionIds, seed + nextGame.turnIndex * 17 + formationId.length);
    const targetIds = ShuffleDeterministically([formation.regionId, ...nextGame.regions[formation.regionId].adjacentIds], seed + formationId.length * 31);
    let queued = false;
    for (const missionId of missionIds) {
      for (const targetRegionId of targetIds) {
        const fallbackRegionId = actionDefinitions[missionId].requiresFallback
          ? nextGame.regions[targetRegionId].adjacentIds[0]
          : null;
        const order = { formationId, missionId, targetRegionId, stanceId: ["concealed", "balanced", "urgent"][(seed + nextGame.turnIndex + formationId.length) % 3], fallbackRegionId };
        const preview = GetActionPreview(nextGame, order);
        if (!preview.valid) continue;
        nextGame = QueueOrder(nextGame, order);
        queued = true;
        break;
      }
      if (queued) break;
    }
  }
  return CommitTurn(nextGame);
}

function TestFiveHundredCampaigns() {
  const scores = [];
  for (let campaign = 0; campaign < 500; campaign += 1) {
    let game = CreateGame(8000 + campaign * 97);
    while (game.phase !== "ended") {
      game = PlayRandomTurn(game, campaign + 11);
      const check = CheckInvariants(game);
      Assert(check.valid, `Campaign ${campaign} invalid: ${check.errors.join("; ")}`);
    }
    const score = GetCampaignScore(game).total;
    Assert(Number.isFinite(score) && score >= 0 && score <= 100, `Campaign ${campaign} should have a bounded score`);
    scores.push(score);
  }
  const minimum = Math.min(...scores);
  const maximum = Math.max(...scores);
  Assert(maximum - minimum >= 8, "Different spatial plans should produce materially different campaigns");
  return { minimum, maximum, average: scores.reduce((sum, value) => sum + value, 0) / scores.length };
}

function TestCoherentStrategies() {
  const results = {};
  const inactiveScores = [];
  let bestCoherentScore = 0;
  for (let seedIndex = 0; seedIndex < 20; seedIndex += 1) {
    let game = CreateGame(12000 + seedIndex * 131);
    while (game.phase !== "ended") game = CommitTurn(Brief(game));
    inactiveScores.push(GetCampaignScore(game).total);
  }
  for (const strategy of ["balanced", "network", "protection"]) {
    const scores = [];
    for (let seedIndex = 0; seedIndex < 20; seedIndex += 1) {
      let game = CreateGame(12000 + seedIndex * 131);
      while (game.phase !== "ended") game = AutoPlayTurn(game, strategy);
      scores.push(GetCampaignScore(game).total);
    }
    bestCoherentScore = Math.max(bestCoherentScore, ...scores);
    results[strategy] = scores.reduce((sum, score) => sum + score, 0) / scores.length;
  }
  const inactiveMean = inactiveScores.reduce((sum, score) => sum + score, 0) / inactiveScores.length;
  const rounded = Object.values(results).map((value) => Math.round(value * 10) / 10);
  Assert(new Set(rounded).size >= 2, "Coherent priorities should lead to distinct average outcomes");
  Assert(Math.min(...Object.values(results)) >= inactiveMean + 8, "Every coherent strategy should decisively outperform issuing no orders");
  Assert(bestCoherentScore >= 62, "A strong coherent campaign should be able to reach the highest local assessment tier");
  return { results, inactiveMean, bestCoherentScore };
}

function RunSmokeTest() {
  TestDefinitions();
  TestInitialState();
  TestEnemyIntentLockAndIntelligence();
  TestGeographyAndFormationLimits();
  TestPlanningReplacementAndSynergy();
  TestOrderIndependenceAndSerialization();
  TestLocalCacheAndReserveConsequences();
  TestInstitutionDisruptionAndRouteRotation();
  TestInactionIsCostly();
  const campaignStats = TestFiveHundredCampaigns();
  const strategyStats = TestCoherentStrategies();
  console.log(`Beiyue strategy smoke test passed: ${assertionCount} assertions.`);
  console.log(`500 campaigns: ${campaignStats.minimum.toFixed(1)}–${campaignStats.maximum.toFixed(1)}, average ${campaignStats.average.toFixed(1)}.`);
  console.log(`Coherent strategy means: ${Object.entries(strategyStats.results).map(([name, score]) => `${name} ${score.toFixed(1)}`).join(", ")}; inaction ${strategyStats.inactiveMean.toFixed(1)}, best ${strategyStats.bestCoherentScore.toFixed(1)}.`);
}

RunSmokeTest();
