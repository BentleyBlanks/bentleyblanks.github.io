import assert from "node:assert/strict";
import {
  Collectibles,
  InteractionPoints,
  MovingHazards,
  Platforms,
  WorldConfig,
} from "./Data_World.mjs";
import {
  CreateWorldState,
  NearestInteraction,
  ResetWorldMonth,
  TickWorld,
} from "./Script_World.mjs";

function Tick(state, input, delta) {
  return TickWorld(state, input, delta);
}

assert.equal(WorldConfig.width, 40, "the office should span approximately forty world units");
assert.ok(Platforms.length >= 3, "the level should contain multiple solid platforms");
assert.ok(Collectibles.length >= 5, "the level should contain quest fragments");
assert.ok(MovingHazards.length >= 3, "the level should contain moving hazards");

const requiredInteractionIds = [
  "fridge",
  "bank",
  "lotteryMachine",
  "talentMachine",
  "workstationArt",
  "workstationDesign",
  "workstationClient",
  "workstationPerformance",
  "whiteboard",
  "promoSign",
  "releaseDoor",
  "monthCalendar",
  "offWorkDoor",
  "aiTerminal",
];
for (const id of requiredInteractionIds) {
  assert.ok(InteractionPoints.some((point) => point.id === id), `missing interaction point: ${id}`);
}

const initial = CreateWorldState(1);
assert.equal(initial.month, 1);
assert.equal(initial.x, WorldConfig.spawn.x);
assert.equal(initial.y, WorldConfig.spawn.y);
assert.equal(initial.grounded, true);
assert.deepEqual(initial.collectedIds, []);
assert.deepEqual(initial.disabledHazardIds, []);

// Horizontal movement is deterministic and does not mutate the source state.
const movedResult = Tick(initial, { right: true }, 0.5);
assert.ok(movedResult.state.x > initial.x, "right input should move the player");
assert.equal(movedResult.state.facing, 1);
assert.equal(initial.x, WorldConfig.spawn.x, "TickWorld must be pure");
const movedLeft = Tick(movedResult.state, { left: true }, 0.25).state;
assert.ok(movedLeft.x < movedResult.state.x, "left input should move the player back");
assert.equal(movedLeft.facing, -1);

// Jumping leaves the floor and returns to it under gravity.
const airborne = Tick(initial, { jump: true }, 0.05);
assert.ok(airborne.events.some((event) => event.type === "jump"));
assert.ok(airborne.state.y > initial.y);
assert.equal(airborne.state.grounded, false);
const groundLanded = Tick(airborne.state, {}, 1.0);
assert.ok(groundLanded.events.some((event) => event.type === "landed"));
assert.equal(groundLanded.state.grounded, true);
assert.equal(groundLanded.state.y, WorldConfig.groundY);

// The first raised platform is reachable and catches a descending player.
let platformState = Tick(initial, { right: true }, 0.6).state;
platformState = Tick(platformState, { jump: true }, 0.05).state;
platformState = Tick(platformState, {}, 0.4).state;
assert.equal(platformState.grounded, false, "the player should still be airborne above the platform");
platformState = Tick(platformState, {}, 0.4).state;
assert.equal(platformState.grounded, true);
assert.equal(platformState.surfaceId, Platforms[0].id);
assert.equal(platformState.y, Platforms[0].top);

// Collecting a fragment is one-shot and produces a structured event.
const fragment = Collectibles[0];
const collectibleProbe = {
  ...initial,
  x: fragment.x,
  y: fragment.y,
  grounded: false,
  surfaceId: null,
};
const picked = Tick(collectibleProbe, {}, 0).state;
const pickedResult = Tick(collectibleProbe, {}, 0);
assert.ok(pickedResult.events.some((event) => event.type === "collectible" && event.id === fragment.id));
assert.ok(picked.collectedIds.includes(fragment.id));
const pickedAgain = Tick(picked, {}, 0);
assert.equal(pickedAgain.events.filter((event) => event.type === "collectible").length, 0);
assert.deepEqual(collectibleProbe.collectedIds, [], "collecting must not mutate the source state");

// Moving hazards damage once, then respect the cooldown.
const hazard = MovingHazards[0];
const hazardProbe = { ...initial, x: hazard.x, y: hazard.y, grounded: true, surfaceId: "ground" };
const firstHit = Tick(hazardProbe, {}, 0.05);
assert.ok(firstHit.events.some((event) => event.type === "hazardHit" && event.id === hazard.id));
assert.ok(firstHit.state.health < firstHit.state.maxHealth);
const healthAfterHit = firstHit.state.health;
const cooldownHit = Tick(firstHit.state, {}, 0.2);
assert.equal(cooldownHit.state.health, healthAfterHit, "damage cooldown should prevent repeated hits");
assert.ok(cooldownHit.state.damageCooldown > 0);
const hazardMoved = Tick(initial, {}, 0.5).state;
assert.notEqual(hazardMoved.hazards[0].x, initial.hazards[0].x, "hazards should move with elapsed time");

// Nearest interaction uses the player's feet and returns null out of range.
const fridge = InteractionPoints.find((point) => point.id === "fridge");
assert.equal(NearestInteraction({ ...initial, x: fridge.x, y: fridge.y })?.id, fridge.id);
assert.equal(NearestInteraction({ ...initial, x: 0, y: 8 }), null);

// Pause freezes simulation, while a second pause edge resumes it.
const paused = Tick(initial, { right: true, pause: true }, 1).state;
assert.equal(paused.paused, true);
assert.equal(paused.x, initial.x);
const stillPaused = Tick(paused, { right: true }, 0.5).state;
assert.equal(stillPaused.x, paused.x);
const resumed = Tick(stillPaused, { right: true, pause: true }, 0.5).state;
assert.equal(resumed.paused, false);
assert.ok(resumed.x > stillPaused.x);

// A month reset returns a fresh spawn and clears spatial progress.
const progressed = {
  ...movedResult.state,
  collectedIds: [fragment.id],
  disabledHazardIds: [hazard.id],
  health: 12,
  damageCooldown: 0.4,
};
const reset = ResetWorldMonth(progressed, 7);
assert.equal(reset.month, 7);
assert.equal(reset.x, WorldConfig.spawn.x);
assert.equal(reset.y, WorldConfig.spawn.y);
assert.equal(reset.health, reset.maxHealth);
assert.deepEqual(reset.collectedIds, []);
assert.deepEqual(reset.disabledHazardIds, []);
assert.equal(progressed.month, 1, "ResetWorldMonth must not mutate the previous month");

console.log("StudioSurvival world smoke test passed");

