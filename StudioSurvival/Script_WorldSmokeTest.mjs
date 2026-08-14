import assert from "node:assert/strict";
import {
  Collectibles,
  FindLocationAt,
  InteractionPoints,
  Locations,
  MovingHazards,
  Platforms,
  WorldConfig,
} from "./Data_World.mjs";
import { CONSUMER_VENUES, FindConsumerVenue } from "./Data_Game.mjs";
import {
  CreateWorldState,
  NearestInteraction,
  ResetWorldMonth,
  TickWorld,
} from "./Script_World.mjs";

const Tick = (state, input, delta) => TickWorld(state, input, delta);

assert.equal(WorldConfig.width, 90, "the nine-location city should span ninety world units");
assert.deepEqual(Locations.map((location) => location.id), ["home", "diner", "market", "talent", "bank", "hotel", "footbath", "footbathCity", "maleModelClub"]);
assert.equal(Platforms.length, 0, "the flat 2D city must not contain collectible platforms");
assert.equal(Collectibles.length, 0, "the 2D city must not use development fragments");
assert.equal(MovingHazards.length, 0, "the user explicitly removed all moving hazards");

const requiredInteractionIds = [
  "homeComputer",
  "homeFridge",
  "dinerCounter",
  "snackShelf",
  "lotteryCounter",
  "equipmentCounter",
  "talentCounter",
  "bankCounter",
  "hotelRestaurant",
  "regularFootbathCounter",
  "footbathCityCounter",
  "maleModelCounter",
];
assert.deepEqual(InteractionPoints.map((point) => point.id), requiredInteractionIds, "all interactions inside the nine places should exist in route order");

const consumerInteractions = InteractionPoints.filter((point) => point.consumerVenueId);
assert.equal(consumerInteractions.length, CONSUMER_VENUES.length, "every personal-consumption venue needs one world interaction");
for (const interaction of consumerInteractions) {
  const venue = FindConsumerVenue(interaction.consumerVenueId);
  assert(venue, `${interaction.id} must reference a registered consumer venue`);
  assert.equal(venue.interactionId, interaction.id, `${venue.name} must point back to its world interaction`);
  assert(venue.minimumCash > 0, `${venue.name} must publish a positive cash-admission threshold`);
}

for (const location of Locations) {
  const probeX = (location.startX + location.endX) / 2;
  assert.equal(FindLocationAt(probeX)?.id, location.id, `location lookup must identify ${location.id}`);
}

const initial = CreateWorldState(1);
assert.equal(initial.month, 1);
assert.equal(initial.x, WorldConfig.spawn.x);
assert.equal(initial.y, WorldConfig.spawn.y);
assert.equal(initial.grounded, true);
assert.deepEqual(initial.hazards, []);
assert.deepEqual(initial.collectibles, []);

const movedResult = Tick(initial, { right: true }, 0.5);
assert.ok(movedResult.state.x > initial.x, "right input should move the player");
assert.equal(movedResult.state.facing, 1);
assert.equal(initial.x, WorldConfig.spawn.x, "TickWorld must be pure");
const movedLeft = Tick(movedResult.state, { left: true }, 0.25).state;
assert.ok(movedLeft.x < movedResult.state.x, "left input should move the player back");
assert.equal(movedLeft.facing, -1);

const airborne = Tick(initial, { jump: true }, 0.05);
assert.ok(airborne.events.some((event) => event.type === "jump"));
assert.ok(airborne.state.y > initial.y);
assert.equal(airborne.state.grounded, false);
const groundLanded = Tick(airborne.state, {}, 1.0);
assert.ok(groundLanded.events.some((event) => event.type === "landed"));
assert.equal(groundLanded.state.grounded, true);
assert.equal(groundLanded.state.y, WorldConfig.groundY);

for (const interaction of InteractionPoints) {
  assert.equal(NearestInteraction({ ...initial, x: interaction.x, y: interaction.y })?.id, interaction.id);
}
assert.equal(NearestInteraction({ ...initial, x: 0, y: 8 }), null);

const paused = Tick(initial, { right: true, pause: true }, 1).state;
assert.equal(paused.paused, true);
assert.equal(paused.x, initial.x);
const stillPaused = Tick(paused, { right: true }, 0.5).state;
assert.equal(stillPaused.x, paused.x);
const resumed = Tick(stillPaused, { right: true, pause: true }, 0.5).state;
assert.equal(resumed.paused, false);
assert.ok(resumed.x > stillPaused.x);

const reset = ResetWorldMonth(movedResult.state, 7);
assert.equal(reset.month, 7);
assert.equal(reset.x, WorldConfig.spawn.x);
assert.equal(reset.y, WorldConfig.spawn.y);
assert.equal(movedResult.state.month, 1, "ResetWorldMonth must not mutate the previous month");

console.log("StudioSurvival 2D city world smoke test passed");
