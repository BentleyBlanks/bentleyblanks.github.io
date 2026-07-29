import assert from "node:assert/strict";
import {
  CreateKilnDefenseState,
  GetKilnDefenseObjective,
  KilnDefenseActions,
  KilnDefenseFlagIds,
  PerformKilnDefenseAction,
  ResolveKilnIncomingDamage,
  StartKilnDefense,
  UpdateKilnDefense,
  ValidateKilnSurvival,
} from "./Script_KilnDefense.mjs";

let passed = 0;

function Test(name, callback) {
  try {
    callback();
    passed += 1;
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

Test("kiln defense requires the authored active steps in order", () => {
  let state = StartKilnDefense(CreateKilnDefenseState());
  assert.equal(GetKilnDefenseObjective(state).actionId, "deployAshScreen");
  const rejected = PerformKilnDefenseAction(state, "dropReedCurtain");
  assert.equal(rejected.ok, false);
  assert.equal(rejected.reasonId, "wrongDefenseStep");

  KilnDefenseActions.forEach((action, index) => {
    const result = PerformKilnDefenseAction(state, action.actionId, { minimumActionIntervalSeconds: 0 });
    assert.equal(result.ok, true);
    assert.equal(result.flags.includes(action.flagId), true);
    state = result.state;
    if (index < KilnDefenseActions.length - 1) assert.equal(state.completed, false);
  });
  assert.equal(state.completed, true);
  assert.equal(state.active, false);
  assert.equal(state.completedActionIds.length, 3);
});

Test("active defense actions create short zero-damage reposition windows", () => {
  let state = StartKilnDefense(CreateKilnDefenseState(), { initialSafetySeconds: 0 });
  let actionResult = PerformKilnDefenseAction(state, "deployAshScreen", { minimumActionIntervalSeconds: 0 });
  state = actionResult.state;
  const protectedHit = ResolveKilnIncomingDamage(state, 30, {
    playerPosition: KilnDefenseActions[0].position,
  });
  assert.equal(protectedHit.appliedDamage, 0);
  state = protectedHit.state;
  for (let index = 0; index < 24; index += 1) {
    state = UpdateKilnDefense(state, {
      delta: 0.25,
      playerPosition: KilnDefenseActions[0].position,
    }).state;
  }
  const laterHit = ResolveKilnIncomingDamage(state, 30, {
    playerPosition: KilnDefenseActions[0].position,
  });
  assert.ok(laterHit.appliedDamage > 0);
});

Test("40 health survives the full cover route without a bandage", () => {
  const events = [];
  KilnDefenseActions.forEach((action) => {
    for (let index = 0; index < 16; index += 1) events.push({ type: "tick", delta: 0.25, playerPosition: action.position });
    events.push({ type: "damage", amount: 32, playerPosition: action.position });
    events.push({ type: "action", actionId: action.actionId });
    for (let index = 0; index < 16; index += 1) events.push({ type: "tick", delta: 0.25, playerPosition: action.position });
    events.push({ type: "damage", amount: 32, playerPosition: action.position });
  });
  const result = ValidateKilnSurvival(40, events, { minimumActionIntervalSeconds: 0 });
  assert.equal(result.survived, true);
  assert.ok(result.health >= 22);
  assert.equal(result.flags.includes(KilnDefenseFlagIds.COMPLETE), true);
});

Test("40 60 80 and 100 health all survive the indicated cover route", () => {
  [40, 60, 80, 100].forEach((health) => {
    const events = [];
    KilnDefenseActions.forEach((action) => {
      for (let index = 0; index < 22; index += 1) events.push({ type: "tick", delta: 0.25, playerPosition: action.position });
      events.push({ type: "damage", amount: 28, playerPosition: action.position });
      events.push({ type: "action", actionId: action.actionId });
    });
    const result = ValidateKilnSurvival(health, events, { minimumActionIntervalSeconds: 0 });
    assert.equal(result.survived, true, `${health} health should survive the cover route`);
  });
});

Test("leaving the marked cover route remains dangerous", () => {
  let state = StartKilnDefense(CreateKilnDefenseState(), { initialSafetySeconds: 0 });
  for (let index = 0; index < 16; index += 1) {
    state = UpdateKilnDefense(state, { delta: 0.25, playerPosition: { x: -5, z: -60 } }).state;
  }
  const result = ResolveKilnIncomingDamage(state, 30, {
    playerPosition: { x: -5, z: -60 },
  });
  assert.ok(result.appliedDamage >= 20);
  assert.equal(result.inCover, false);
});

console.log(`${passed}/5 kiln defense tests passed`);
