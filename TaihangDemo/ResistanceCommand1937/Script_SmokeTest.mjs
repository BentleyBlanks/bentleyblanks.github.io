import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  actionDefinitions,
  BuildEnemyPlan,
  CalculateOutcome,
  chapterDefinitions,
  ChooseCrisisResponse,
  ClearPlan,
  CreateInitialState,
  DeserializeState,
  focusDefinitions,
  gameConfig,
  GetActionAvailability,
  GetChapter,
  GetConnectedRegionIds,
  GetEnemyIntentPreview,
  GetFocusAvailability,
  GetNetworkSummary,
  GetPlanningSummary,
  productionDefinitions,
  QueueAction,
  regionDefinitions,
  RemovePlannedAction,
  ResolveTurn,
  RunDeterministicCampaign,
  SerializeState,
  SetFocus,
  SetProductionPriority,
  SetStance,
  stanceDefinitions,
  ValidateState,
} from "./Script_Rules.mjs";

const testResults = [];

function Test(name, testFunction) {
  try {
    testFunction();
    testResults.push({ name, passed: true });
    console.log(`✓ ${name}`);
  } catch (error) {
    testResults.push({ name, passed: false, error });
    console.error(`✗ ${name}`);
    console.error(error.stack || error.message);
  }
}

function Clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function AssertFiniteState(state) {
  const Visit = (value, path = "state") => {
    if (typeof value === "number") {
      assert.ok(Number.isFinite(value), `${path} must be finite`);
      return;
    }
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) {
      value.forEach((entry, index) => Visit(entry, `${path}[${index}]`));
      return;
    }
    for (const [key, entry] of Object.entries(value)) Visit(entry, `${path}.${key}`);
  };
  Visit(state);
  for (const value of Object.values(state.resources)) assert.ok(value >= 0, "resources cannot become negative");
  for (const metricId of ["peopleSafety", "contribution", "resilience", "frontIntegrity", "japaneseLogistics"]) {
    assert.ok(state.national[metricId] >= 0 && state.national[metricId] <= 100, `${metricId} must stay in [0,100]`);
  }
  for (const region of Object.values(state.regions)) {
    assert.ok(region.network >= 0 && region.network <= 4, "network must stay in [0,4]");
    assert.ok(region.baseLevel >= 0 && region.baseLevel <= 3, "base level must stay in [0,3]");
    for (const metricId of ["support", "pressure", "exposure", "damage"]) {
      assert.ok(region[metricId] >= 0 && region[metricId] <= 100, `${region.id}.${metricId} must stay in [0,100]`);
    }
  }
}

function PrepareTurn(state, choiceIndex = 0) {
  return ChooseCrisisResponse(state, GetChapter(state).choices[choiceIndex].id);
}

Test("initial state exposes the complete eight-stage campaign", () => {
  const state = CreateInitialState(19370707);
  assert.equal(state.version, gameConfig.version);
  assert.equal(state.turn, 0);
  assert.equal(state.maxTurns, 8);
  assert.equal(state.status, "active");
  assert.equal(state.phase, "planning");
  assert.equal(regionDefinitions.length, 8);
  assert.equal(chapterDefinitions.length, 8);
  assert.equal(actionDefinitions.length, 8);
  assert.equal(focusDefinitions.length, 8);
  assert.equal(productionDefinitions.length, 3);
  assert.equal(stanceDefinitions.length, 3);
  assert.equal(Object.keys(state.regions).length, 8);
  assert.equal(state.commandBudget, 4);
  assert.deepEqual(state.plans, []);
  assert.ok(state.enemyPlan.targetIds.length >= 1);
  assert.equal(GetConnectedRegionIds(state)[0], "ShaanGanNing");
  AssertFiniteState(state);
});

Test("enemy planning is deterministic but responds to state and seed", () => {
  const stateA = CreateInitialState(17);
  const stateB = CreateInitialState(17);
  assert.deepEqual(BuildEnemyPlan(stateA), BuildEnemyPlan(stateB));
  const stateC = CreateInitialState(18);
  assert.notDeepEqual(BuildEnemyPlan(stateA), BuildEnemyPlan(stateC));
  const exposed = Clone(stateA);
  exposed.regions.SouthChina.exposure = 100;
  exposed.regions.SouthChina.network = 4;
  const exposedPlan = BuildEnemyPlan(exposed);
  assert.ok(exposedPlan.possibleTargetIds.includes("SouthChina"), "high-value exposed region should enter the enemy shortlist");
});

Test("planning reserves command and resources without spending them", () => {
  const state = CreateInitialState(22);
  const startingResources = Clone(state.resources);
  const queued = QueueAction(state, "Evacuate", state.enemyPlan.targetIds[0]);
  assert.equal(queued.plans.length, 1);
  assert.deepEqual(queued.resources, startingResources);
  const summary = GetPlanningSummary(queued);
  assert.equal(summary.commandUsed, 1);
  assert.equal(summary.commandRemaining, 3);
  assert.equal(summary.reservedCost.grain, 4);
  assert.equal(summary.reservedCost.organization, 2);
  const removed = RemovePlannedAction(queued, queued.plans[0].id);
  assert.equal(removed.plans.length, 0);
  assert.deepEqual(removed.resources, startingResources);
  const cleared = ClearPlan(queued);
  assert.equal(cleared.plans.length, 0);
});

Test("illegal orders do not mutate the plan or spend resources", () => {
  const state = CreateInitialState(23);
  const before = SerializeState(state);
  const impossible = QueueAction(state, "Sabotage", "ShaanGanNing");
  assert.equal(impossible.lastCommand.success, false);
  assert.equal(impossible.plans.length, 0);
  assert.deepEqual(impossible.resources, state.resources);
  assert.equal(SerializeState(state), before, "source state must remain immutable");

  let full = QueueAction(state, "Evacuate", state.enemyPlan.targetIds[0]);
  full = QueueAction(full, "SecureGrain", state.enemyPlan.targetIds[0]);
  const thirdLocal = QueueAction(full, "Recon", state.enemyPlan.targetIds[0]);
  assert.equal(thirdLocal.lastCommand.success, false);
  assert.equal(thirdLocal.plans.length, 2);
});

Test("a strategic choice is required before resolving", () => {
  const state = CreateInitialState(24);
  const blocked = ResolveTurn(state);
  assert.equal(blocked.lastCommand.success, false);
  assert.equal(blocked.turn, 0);
  assert.equal(blocked.status, "active");
  assert.equal(state.turn, 0, "source state must remain unchanged");
});

Test("one full loop advances exactly one historical stage", () => {
  let state = CreateInitialState(25);
  const targetId = state.enemyPlan.targetIds[0];
  state = PrepareTurn(state, 2);
  state = QueueAction(state, "Evacuate", targetId);
  state = QueueAction(state, "Recon", targetId);
  const resolved = ResolveTurn(state);
  assert.equal(resolved.turn, 1);
  assert.equal(resolved.phase, "planning");
  assert.equal(resolved.history.length, 1);
  assert.equal(resolved.lastReport.period, "1937—1938");
  assert.equal(resolved.lastReport.actionReports.length, 2);
  assert.equal(resolved.lastReport.enemyReports.length, 1);
  assert.ok(resolved.lastReport.choiceReports.length >= 1);
  assert.ok(resolved.lastReport.production);
  const repeated = ResolveTurn(resolved);
  assert.equal(repeated.turn, 1, "repeated resolution must not skip a stage");
  assert.equal(repeated.lastCommand.success, false);
  AssertFiniteState(resolved);
});

Test("evacuation materially reduces harm during the same enemy operation", () => {
  const base = CreateInitialState(31);
  const targetId = base.enemyPlan.targetIds[0];
  let unprepared = PrepareTurn(base, 0);
  unprepared = ResolveTurn(unprepared);
  const unpreparedReport = unprepared.lastReport.enemyReports.find((entry) => entry.regionId === targetId);

  let prepared = PrepareTurn(base, 0);
  prepared = QueueAction(prepared, "Evacuate", targetId);
  prepared = ResolveTurn(prepared);
  const preparedReport = prepared.lastReport.enemyReports.find((entry) => entry.regionId === targetId);
  assert.ok(preparedReport.harmedFamilies < unpreparedReport.harmedFamilies, `${preparedReport.harmedFamilies} should be below ${unpreparedReport.harmedFamilies}`);
  assert.ok(prepared.stats.familiesProtected > 0);
  assert.ok(preparedReport.displacedFamilies > 0, "evacuation should still record displacement as a cost");
});

Test("grain security and reconnaissance affect the actual resolution", () => {
  const base = CreateInitialState(32);
  const targetId = base.enemyPlan.targetIds[0];
  let unprepared = PrepareTurn(base, 0);
  unprepared = ResolveTurn(unprepared);
  const unpreparedReport = unprepared.lastReport.enemyReports.find((entry) => entry.regionId === targetId);

  let prepared = PrepareTurn(base, 0);
  prepared = QueueAction(prepared, "SecureGrain", targetId);
  prepared = QueueAction(prepared, "Recon", targetId);
  prepared = ResolveTurn(prepared);
  const preparedReport = prepared.lastReport.enemyReports.find((entry) => entry.regionId === targetId);
  assert.ok(preparedReport.grainLoss < unpreparedReport.grainLoss);
  assert.equal(preparedReport.prepared.recon, true);
});

Test("planned reconnaissance cannot be queued and withdrawn to reveal targets for free", () => {
  let state = CreateInitialState(321);
  state.resources.intelligence = 3;
  state.enemyPlan = BuildEnemyPlan(state);
  const targetId = state.enemyPlan.targetIds[0];
  const before = GetEnemyIntentPreview(state);
  assert.equal(before.confidence, "low");
  assert.equal(before.confirmedTargetIds.includes(targetId), false);
  const queued = QueueAction(state, "Recon", targetId);
  const duringPlanning = GetEnemyIntentPreview(queued);
  assert.equal(duringPlanning.confirmedTargetIds.includes(targetId), false);
  const withdrawn = RemovePlannedAction(queued, queued.plans[0].id);
  assert.deepEqual(GetEnemyIntentPreview(withdrawn), before);
});

Test("intelligence cannot bypass a broken organization link", () => {
  const state = CreateInitialState(3211);
  state.resources.intelligence = 999;
  state.regions.CentralChina.network = 0;
  assert.equal(GetConnectedRegionIds(state).includes("SouthChina"), false);
  assert.equal(GetActionAvailability(state, "Sabotage", "SouthChina").available, false);
  assert.equal(GetActionAvailability(state, "Evacuate", "SouthChina").available, false);
  assert.equal(GetActionAvailability(state, "Recon", "SouthChina").available, true);
  assert.equal(GetActionAvailability(state, "Organize", "SouthChina").available, true);
});

Test("strategic-choice costs are reserved before regional orders", () => {
  let state = CreateInitialState(322);
  state.resources.grain = 6;
  state = ChooseCrisisResponse(state, "ProtectVillages");
  assert.equal(state.lastCommand.success, true);
  const summary = GetPlanningSummary(state);
  assert.equal(summary.crisisCost.grain, 3);
  assert.equal(summary.reservedCost.grain, 3);
  assert.equal(GetActionAvailability(state, "Evacuate", state.enemyPlan.targetIds[0]).available, false);

  let plannedFirst = CreateInitialState(323);
  plannedFirst.resources.grain = 6;
  plannedFirst = QueueAction(plannedFirst, "Evacuate", plannedFirst.enemyPlan.targetIds[0]);
  plannedFirst = ChooseCrisisResponse(plannedFirst, "ProtectVillages");
  assert.equal(plannedFirst.lastCommand.success, false);
  assert.equal(plannedFirst.crisisChoiceId, null);
});

Test("rail sabotage creates nationwide strategic effects rather than a kill score", () => {
  let state = CreateInitialState(33);
  const railRegionId = regionDefinitions.find((definition) => definition.rail && GetActionAvailability(state, "Sabotage", definition.id).available)?.id;
  assert.ok(railRegionId);
  const logisticsBefore = state.national.japaneseLogistics;
  const contributionBefore = state.national.contribution;
  state = PrepareTurn(state, 1);
  state = SetStance(state, "Disruption");
  state = QueueAction(state, "Sabotage", railRegionId);
  state = ResolveTurn(state);
  assert.ok(state.national.japaneseLogistics < logisticsBefore);
  assert.ok(state.national.contribution > contributionBefore);
  assert.equal(state.stats.railDisruptions, 1);
  assert.equal("kills" in state.stats, false, "the campaign must not center a kill counter");
});

Test("sabotage changes future logistics while only local delay affects the current sweep", () => {
  const base = CreateInitialState(4);
  const sabotageRegionId = regionDefinitions.find((definition) => (
    definition.rail
    && !base.enemyPlan.targetIds.includes(definition.id)
    && GetActionAvailability(base, "Sabotage", definition.id).available
  ))?.id;
  assert.ok(sabotageRegionId);

  let baseline = PrepareTurn(base, 0);
  baseline = ResolveTurn(baseline);
  let disrupted = PrepareTurn(base, 0);
  disrupted = QueueAction(disrupted, "Sabotage", sabotageRegionId);
  disrupted = ResolveTurn(disrupted);

  assert.ok(disrupted.national.japaneseLogistics < baseline.national.japaneseLogistics);
  assert.deepEqual(disrupted.lastReport.enemyReports, baseline.lastReport.enemyReports);
  assert.equal(disrupted.enemyPlan.logisticsAtPlanning, disrupted.national.japaneseLogistics);
});

Test("grain exhaustion is suffered before the current production arrives", () => {
  let state = CreateInitialState(41);
  state.resources.grain = 3;
  state = ChooseCrisisResponse(state, "ProtectVillages");
  assert.equal(state.lastCommand.success, true);
  state = ResolveTurn(state);
  assert.ok(state.resources.grain > 0, "production should still replenish grain after the crisis");
  assert.ok(state.lastReport.systemReports.some((line) => line.includes("粮药见底")));
});

Test("the turn cost ledger includes evacuation displacement and action cadre losses", () => {
  let state = CreateInitialState(1);
  const targetId = state.enemyPlan.targetIds[0];
  state = PrepareTurn(state, 0);
  state = QueueAction(state, "Evacuate", targetId);
  state = QueueAction(state, "Sabotage", "SouthChina");
  assert.equal(state.lastCommand.success, true);
  state = ResolveTurn(state);

  const actionDisplaced = state.lastReport.actionReports.reduce((sum, entry) => sum + entry.displacedFamilies, 0);
  const actionCadres = state.lastReport.actionReports.reduce((sum, entry) => sum + entry.cadresLost, 0);
  const enemyDisplaced = state.lastReport.enemyReports.reduce((sum, entry) => sum + entry.displacedFamilies, 0);
  const enemyCadres = state.lastReport.enemyReports.reduce((sum, entry) => sum + entry.organizationLoss, 0);
  assert.ok(actionDisplaced > 0);
  assert.ok(actionCadres > 0);
  assert.equal(state.lastReport.costLedger.familiesDisplaced, actionDisplaced + enemyDisplaced);
  assert.equal(state.lastReport.costLedger.cadresLost, actionCadres + enemyCadres);
  assert.equal(state.lastReport.costLedger.grainSeized, state.stats.grainSeized);
});

Test("focus prerequisites, progress and completion work", () => {
  let state = CreateInitialState(34);
  assert.equal(GetFocusAvailability(state, "TunnelWarfare").available, false);
  state = PrepareTurn(state, 0);
  state = ResolveTurn(state);
  assert.equal(state.focusProgress, 1);
  state = PrepareTurn(state, 0);
  state = ResolveTurn(state);
  assert.ok(state.completedFocusIds.includes("MassLine"));
  assert.equal(state.activeFocusId, null);
  assert.equal(GetFocusAvailability(state, "TunnelWarfare").available, true);
  state = SetFocus(state, "TunnelWarfare");
  assert.equal(state.activeFocusId, "TunnelWarfare");
});

Test("production and stance selections are real state, not decorative controls", () => {
  let supplies = CreateInitialState(35);
  let arms = CreateInitialState(35);
  supplies = SetProductionPriority(supplies, "Supplies");
  arms = SetProductionPriority(arms, "Arms");
  supplies = PrepareTurn(supplies, 0);
  arms = PrepareTurn(arms, 0);
  supplies = ResolveTurn(supplies);
  arms = ResolveTurn(arms);
  assert.ok(supplies.resources.grain > arms.resources.grain);
  assert.ok(arms.resources.arms > supplies.resources.arms);
  const shifted = SetStance(CreateInitialState(35), "Disruption");
  assert.equal(shifted.stanceId, "Disruption");
});

Test("save round trip is stable and rejects corrupted data", () => {
  let state = CreateInitialState(36);
  state = PrepareTurn(state, 1);
  state = QueueAction(state, "Conceal", "JinSui");
  const serialized = SerializeState(state);
  const restored = DeserializeState(serialized);
  assert.equal(SerializeState(restored), serialized);
  assert.equal(ValidateState(restored).valid, true);
  assert.throws(() => DeserializeState("{broken"));
  const incompatible = Clone(restored);
  incompatible.version = 999;
  assert.throws(() => DeserializeState(JSON.stringify(incompatible)), /版本/);
});

Test("balanced play outperforms passivity, while reckless fighting destroys safety", () => {
  const balanced = RunDeterministicCampaign("balanced", 19370707);
  const reckless = RunDeterministicCampaign("reckless", 19370707);
  const idle = RunDeterministicCampaign("idle", 19370707);
  const balancedOutcome = CalculateOutcome(balanced);
  const recklessOutcome = CalculateOutcome(reckless);
  const idleOutcome = CalculateOutcome(idle);
  assert.equal(balanced.status, "completed");
  assert.equal(balancedOutcome.mainstay, true, "a disciplined organization-and-protection route must be able to earn the top evaluation");
  assert.equal(balancedOutcome.grade, "S");
  assert.ok(balancedOutcome.score > idleOutcome.score);
  assert.ok(balanced.national.peopleSafety > reckless.national.peopleSafety);
  assert.ok(reckless.national.contribution > balanced.national.contribution);
  assert.equal(idle.status, "failed");
  assert.ok(reckless.national.peopleSafety <= balanced.national.peopleSafety);
});

Test("one hundred deterministic campaigns terminate and preserve invariants", () => {
  for (let seed = 1000; seed < 1100; seed += 1) {
    const strategyId = seed % 3 === 0 ? "balanced" : seed % 3 === 1 ? "reckless" : "idle";
    const state = RunDeterministicCampaign(strategyId, seed);
    assert.ok(["completed", "failed"].includes(state.status));
    assert.ok(state.turn <= gameConfig.maxTurns);
    assert.ok(state.history.length <= gameConfig.maxTurns);
    AssertFiniteState(state);
  }
});

Test("terminal state is locked and 1945 victory remains fixed history", () => {
  const completed = RunDeterministicCampaign("balanced", 19370707);
  assert.equal(completed.status, "completed");
  assert.equal(completed.turn, 8);
  assert.match(chapterDefinitions.at(-1).history, /日本宣布无条件投降/);
  const before = SerializeState(completed);
  const queued = QueueAction(completed, "Conceal", "JinSui");
  assert.equal(queued.lastCommand.success, false);
  assert.deepEqual(queued.plans, completed.plans);
  const resolved = ResolveTurn(completed);
  assert.equal(resolved.turn, completed.turn);
  assert.equal(resolved.history.length, completed.history.length);
  const incompleteFocus = focusDefinitions.find((focus) => !completed.completedFocusIds.includes(focus.id));
  assert.ok(incompleteFocus);
  assert.equal(GetFocusAvailability(completed, incompleteFocus.id).available, false);
  const focusLocked = SetFocus(completed, incompleteFocus.id);
  assert.equal(focusLocked.lastCommand.success, false);
  assert.equal(focusLocked.activeFocusId, completed.activeFocusId);
  assert.equal(focusLocked.focusProgress, completed.focusProgress);
  assert.equal(SerializeState(completed), before, "terminal source state must not change");
  const outcome = CalculateOutcome(completed);
  assert.ok(outcome.evidence.some((entry) => entry.id === "people"));
  assert.ok(outcome.evidence.some((entry) => entry.id === "network"));
  assert.ok(outcome.evidence.some((entry) => entry.id === "contribution"));
  assert.ok(outcome.evidence.some((entry) => entry.id === "resilience"));
});

Test("page contract includes responsive, accessible, dependency-free controls", () => {
  const directory = fileURLToPath(new URL(".", import.meta.url));
  const html = readFileSync(`${directory}/index.html`, "utf8");
  const css = readFileSync(`${directory}/Style_Game.css`, "utf8");
  const gameScript = readFileSync(`${directory}/Script_Game.mjs`, "utf8");
  assert.match(html, /<!doctype html>/i);
  assert.match(html, /<html lang="zh-CN">/);
  assert.match(html, /name="viewport"/);
  assert.match(html, /aria-live="assertive"/);
  assert.match(html, /role="dialog"/);
  assert.match(html, /id="strategyCanvas"/);
  assert.match(html, /id="regionLayer"/);
  assert.match(html, /Script_Game\.mjs\?v=20260727a/);
  assert.match(css, /@media \(max-width: 760px\)/);
  assert.match(css, /prefers-reduced-motion/);
  assert.match(gameScript, /localStorage/);
  assert.match(gameScript, /gameState\.stats\.grainSeized/);
  assert.match(gameScript, /gameState\.stats\.cadresLost/);
  assert.doesNotMatch(`${html}\n${css}\n${gameScript}`, /(?:src|href|url\(|from\s+)["'(]?https?:\/\//i);
  assert.equal(html.includes("�"), false);
});

const failures = testResults.filter((result) => !result.passed);
console.log(`\n${testResults.length - failures.length}/${testResults.length} tests passed.`);
if (failures.length) process.exit(1);
