import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  CreateGameState,
  GetActLabel,
  GetEvaluation,
  GetMinimumInteractionSeconds,
  GetObjectives,
  GetSiteAction,
  InteractWithSite,
  StepGame,
  ThrowDistraction,
  UseMedicine,
  gameConfig,
  obstacleDefinitions,
  patrolDefinitions,
  siteDefinitions,
  waterwayBlockadeDefinitions,
} from "./Script_Rules.mjs";

function Site(id) {
  return siteDefinitions.find((site) => site.id === id);
}

function MoveTo(state, id) {
  const site = Site(id);
  state.player.x = site.x;
  state.player.z = site.z;
}

function DisablePatrolPressure(state) {
  state.patrols.forEach((patrol, index) => {
    patrol.x = 50 - index;
    patrol.z = -50 + index;
    patrol.speed = 0;
    patrol.path = [{ x: patrol.x, z: patrol.z }];
    patrol.waypoint = 0;
  });
}

function CompleteSite(state, id) {
  MoveTo(state, id);
  assert.equal(InteractWithSite(state, id), true, `interaction should begin at ${id}`);
  let steps = 0;
  while (state.activeInteraction && steps < 2500) {
    StepGame(state, .05, {});
    steps += 1;
  }
  assert.equal(state.activeInteraction, null, `interaction should finish at ${id}`);
  assert.ok(steps > 0, `interaction at ${id} must consume time`);
}

function AssertInitialState() {
  const state = CreateGameState();
  assert.equal(state.ended, false);
  assert.equal(state.player.health, 100);
  assert.equal(state.rescued, 0);
  assert.equal(state.radioRepaired, false);
  assert.equal(state.remaining, 660);
  assert.match(state.events[0].body, /秦桂枝|吴家庄|农民/);
  assert.match(state.events[1].body, /共产党员林砚/);
  assert.equal(state.act, 1);
  assert.equal(GetActLabel(state), "第一幕 · 灶火熄灭");
  assert.equal(GetObjectives(state).length, 3);
  assert.ok(GetMinimumInteractionSeconds("standard") >= 80 && GetMinimumInteractionSeconds("standard") <= 100, "required passive interaction work should stay under 100 seconds");
}

function AssertGatedInteractions() {
  const state = CreateGameState();
  DisablePatrolPressure(state);
  MoveTo(state, "relayStation");
  assert.equal(GetSiteAction(state, Site("relayStation")).disabled, true);
  assert.equal(InteractWithSite(state, "relayStation"), false);
  MoveTo(state, "reedExit");
  assert.equal(GetSiteAction(state, Site("reedExit")).disabled, true);
  assert.equal(InteractWithSite(state, "reedExit"), false);
}

function AssertCompleteRoute() {
  const state = CreateGameState({ difficulty: "story" });
  DisablePatrolPressure(state);
  CompleteSite(state, "ruinedStation");
  CompleteSite(state, "wujiaVillage");
  assert.equal(state.safe, 0, "freed villagers are not safe before reaching the reeds");
  CompleteSite(state, "fieldClinic");
  assert.equal(state.rescued, 5);
  assert.equal(state.act, 2);
  assert.equal(GetActLabel(state), "第二幕 · 人比站重要");
  CompleteSite(state, "grainDepot");
  CompleteSite(state, "westContact");
  CompleteSite(state, "northDitch");
  CompleteSite(state, "eastContact");
  CompleteSite(state, "radioCache");
  assert.equal(state.grain, 4);
  assert.equal(state.medicine, 1);
  assert.equal(state.radioPart, true);
  assert.equal(state.contactsPreserved, 2);
  assert.equal(state.waterwayDetourFound, true);
  assert.equal(UseMedicine(state), true);
  assert.equal(state.wounded, 1);
  CompleteSite(state, "relayStation");
  assert.equal(state.radioStage, 1);
  assert.equal(state.radioRepaired, false);
  CompleteSite(state, "relayStation");
  assert.equal(state.radioStage, 2);
  assert.equal(state.radioRepaired, false);
  CompleteSite(state, "relayStation");
  assert.equal(state.radioRepaired, true);
  assert.equal(state.finalPressure, true);
  assert.equal(state.act, 3);
  assert.equal(GetActLabel(state), "第三幕 · 最后关门的人");
  CompleteSite(state, "relayStation");
  assert.equal(state.signalsConfirmed, 1);
  CompleteSite(state, "relayStation");
  assert.equal(state.signalsConfirmed, 2);
  CompleteSite(state, "relayStation");
  assert.equal(state.signalsConfirmed, 3);
  MoveTo(state, "relayStation");
  assert.equal(GetSiteAction(state, Site("relayStation")).disabled, true);
  assert.equal(InteractWithSite(state, "relayStation"), false, "a fourth signal confirmation must not start");
  CompleteSite(state, "rosterTable");
  CompleteSite(state, "stationDoor");
  assert.equal(state.signalsConfirmed, 3);
  assert.equal(state.rosterDestroyed, true);
  assert.equal(state.stationClosed, true);
  assert.equal(state.safe, 0);
  const partial = structuredClone(state);
  partial.civilians[4].state = "seized";
  partial.rescued = 4;
  CompleteSite(partial, "reedExit");
  assert.equal(partial.success, false, "four of five civilians must never be reported as a complete success");
  assert.equal(partial.endingId, "peopleMissing");
  assert.equal(partial.safe, 4);
  CompleteSite(state, "reedExit");
  assert.equal(state.ended, true);
  assert.equal(state.success, true);
  assert.equal(state.safe, 5);
  assert.ok(state.elapsed >= GetMinimumInteractionSeconds("story"));
  const evaluation = GetEvaluation(state);
  assert.ok(evaluation.total >= 75);
  assert.equal("kills" in evaluation, false, "evaluation must not contain a kill metric");
}

function AssertOccupationConsequences() {
  const state = CreateGameState();
  DisablePatrolPressure(state);
  for (let index = 0; index < 285 / .05 + 2; index += 1) StepGame(state, .05, {});
  assert.equal(state.villageState, "burned");
  assert.equal(state.lost, 3);
  assert.ok(state.events.some((event) => /侵华日军/.test(event.body) && /平民/.test(event.body)));
  state.usedSites.ruinedStation = true;
  CompleteSite(state, "wujiaVillage");
  assert.equal(state.ended, true);
  assert.equal(state.success, false);
  assert.equal(state.rescued, 2);
}

function AssertDistractionAndTimer() {
  const state = CreateGameState();
  state.player.x = state.patrols[0].x;
  state.player.z = state.patrols[0].z - 8;
  state.player.yaw = 0;
  assert.equal(ThrowDistraction(state), true);
  assert.equal(ThrowDistraction(state), false);
  assert.ok(state.distractionCooldown > 0);

  const timed = CreateGameState();
  DisablePatrolPressure(timed);
  for (let index = 0; index < gameConfig.durationSeconds / .05 + 3; index += 1) StepGame(timed, .05, {});
  assert.equal(timed.ended, true);
  assert.equal(timed.success, false);
  assert.equal(timed.endingId, "sweep");
}

function AssertDifficultyMedicineAndDetourContracts() {
  const ConfigureVisionScenario = (difficulty) => {
    const state = CreateGameState({ difficulty });
    state.player.x = 0;
    state.player.z = 8;
    state.civilians.forEach((civilian) => { civilian.state = "detained"; });
    state.patrols.forEach((patrol, index) => {
      patrol.x = index === 0 ? 0 : 52;
      patrol.z = index === 0 ? 0 : -52;
      patrol.yaw = 0;
      patrol.speed = 0;
      patrol.path = [{ x: patrol.x, z: patrol.z }];
      patrol.waypoint = 0;
    });
    return state;
  };
  const storyVision = ConfigureVisionScenario("story");
  const standardVision = ConfigureVisionScenario("standard");
  for (let index = 0; index < 10; index += 1) {
    StepGame(storyVision, .05, {});
    StepGame(standardVision, .05, {});
  }
  assert.ok(standardVision.patrols[0].detection > storyVision.patrols[0].detection * 1.25, "story mode must accumulate suspicion materially more slowly");

  const medicineGate = CreateGameState();
  DisablePatrolPressure(medicineGate);
  medicineGate.act = 2;
  medicineGate.rescued = 5;
  medicineGate.civilians.forEach((civilian) => { civilian.state = "following"; });
  medicineGate.grain = 4;
  medicineGate.contactsPreserved = 2;
  medicineGate.radioPart = true;
  medicineGate.medicine = 1;
  medicineGate.waterwayDetourFound = true;
  MoveTo(medicineGate, "relayStation");
  assert.equal(GetSiteAction(medicineGate, Site("relayStation")).disabled, true, "radio repair must wait for the medicine decision");
  assert.equal(UseMedicine(medicineGate, "linYan"), true);
  assert.equal(GetSiteAction(medicineGate, Site("relayStation")).disabled, false);

  const detourGate = CreateGameState();
  DisablePatrolPressure(detourGate);
  detourGate.act = 2;
  detourGate.grain = 4;
  detourGate.usedSites.westContact = true;
  detourGate.contactsPreserved = 1;
  detourGate.waterwayBlocked = true;
  MoveTo(detourGate, "eastContact");
  assert.equal(GetSiteAction(detourGate, Site("eastContact")).disabled, true);
  MoveTo(detourGate, "radioCache");
  assert.equal(GetSiteAction(detourGate, Site("radioCache")).disabled, true);
  CompleteSite(detourGate, "northDitch");
  assert.equal(detourGate.waterwayDetourFound, true);
  MoveTo(detourGate, "eastContact");
  assert.equal(GetSiteAction(detourGate, Site("eastContact")).disabled, false);

  const physicalBlock = CreateGameState();
  DisablePatrolPressure(physicalBlock);
  physicalBlock.waterwayBlocked = true;
  physicalBlock.player.x = 1.5;
  physicalBlock.player.z = 17.8;
  for (let index = 0; index < 80; index += 1) StepGame(physicalBlock, .05, { moveX: 0, moveZ: 1 });
  assert.ok(physicalBlock.player.z < 19, "the newly raised waterway checkpoint must physically stop the direct route");
}

function AssertPatrolRouteIntegrity() {
  patrolDefinitions.forEach((definition) => {
    definition.path.forEach(([x, z], waypointIndex) => {
      const blocked = obstacleDefinitions.some((obstacle) => Math.hypot(x - obstacle.x, z - obstacle.z) < obstacle.radius + .58);
      assert.equal(blocked, false, `${definition.id} waypoint ${waypointIndex} must be outside every obstacle disk`);
    });
  });
  const state = CreateGameState({ difficulty: "standard" });
  state.player.x = 56;
  state.player.z = 56;
  state.civilians.forEach((civilian) => { civilian.state = "detained"; });
  const initialWaypoints = new Map(state.patrols.map((patrol) => [patrol.id, patrol.waypoint]));
  const advanced = new Set();
  for (let index = 0; index < 2400; index += 1) {
    StepGame(state, .05, {});
    state.patrols.forEach((patrol) => {
      if (patrol.waypoint !== initialWaypoints.get(patrol.id)) advanced.add(patrol.id);
    });
  }
  state.patrols.forEach((patrol) => assert.ok(advanced.has(patrol.id), `${patrol.id} must advance to another waypoint during a two-minute patrol simulation`));
}

function AssertCompleteRouteWithoutTeleport() {
  const state = CreateGameState({ difficulty: "story" });
  state.patrols = [];
  CompleteSiteWithoutTeleport(state, "ruinedStation");
  CompleteSiteWithoutTeleport(state, "wujiaVillage");
  CompleteSiteWithoutTeleport(state, "fieldClinic");
  assert.equal(UseMedicine(state, "zhaoManCang"), true);
  CompleteSiteWithoutTeleport(state, "grainDepot");
  CompleteSiteWithoutTeleport(state, "westContact");
  CompleteSiteWithoutTeleport(state, "northDitch");
  CompleteSiteWithoutTeleport(state, "eastContact");
  CompleteSiteWithoutTeleport(state, "radioCache");
  CompleteSiteWithoutTeleport(state, "relayStation");
  CompleteSiteWithoutTeleport(state, "relayStation");
  CompleteSiteWithoutTeleport(state, "relayStation");
  CompleteSiteWithoutTeleport(state, "relayStation");
  CompleteSiteWithoutTeleport(state, "relayStation");
  CompleteSiteWithoutTeleport(state, "relayStation");
  CompleteSiteWithoutTeleport(state, "rosterTable");
  CompleteSiteWithoutTeleport(state, "stationDoor");
  CompleteSiteWithoutTeleport(state, "reedExit");
  assert.equal(state.ended, true);
  assert.equal(state.success, true);
  assert.equal(state.safe, 5);
  assert.ok(state.elapsed < gameConfig.durationSeconds, "a pure-input route must fit inside the authored timer");
}

function TestWalkable(point, state = null) {
  if (Math.abs(point.x) > gameConfig.worldHalfSize - 1 || Math.abs(point.z) > gameConfig.worldHalfSize - 1) return false;
  if (obstacleDefinitions.some((obstacle) => Math.hypot(point.x - obstacle.x, point.z - obstacle.z) < obstacle.radius + .68)) return false;
  if (state?.waterwayBlocked && waterwayBlockadeDefinitions.some((obstacle) => Math.hypot(point.x - obstacle.x, point.z - obstacle.z) < obstacle.radius + .38)) return false;
  return true;
}

function PlanWalkingPath(state, site) {
  const start = { x: Math.round(state.player.x), z: Math.round(state.player.z) };
  const key = (point) => `${point.x},${point.z}`;
  const queue = [start];
  const parents = new Map([[key(start), null]]);
  let goal = null;
  for (let cursor = 0; cursor < queue.length && cursor < 20000; cursor += 1) {
    const point = queue[cursor];
    if (TestWalkable(point, state) && Math.hypot(point.x - site.x, point.z - site.z) <= Math.max(gameConfig.interactionRadius, site.radius) + .45) {
      goal = point;
      break;
    }
    for (const [stepX, stepZ] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const next = { x: point.x + stepX, z: point.z + stepZ };
      const nextKey = key(next);
      if (parents.has(nextKey) || !TestWalkable(next, state)) continue;
      parents.set(nextKey, point);
      queue.push(next);
    }
  }
  assert.ok(goal, `a walkable path must exist to ${site.id}`);
  const path = [];
  for (let point = goal; point; point = parents.get(key(point))) path.push(point);
  return path.reverse();
}

function WalkToSite(state, id) {
  const site = Site(id);
  const path = PlanWalkingPath(state, site);
  path.forEach((waypoint) => {
    let ticks = 0;
    while (Math.hypot(waypoint.x - state.player.x, waypoint.z - state.player.z) > .16 && ticks < 240) {
      const deltaX = waypoint.x - state.player.x;
      const deltaZ = waypoint.z - state.player.z;
      StepGame(state, .05, { moveX: deltaX, moveZ: deltaZ, sprint: true });
      ticks += 1;
    }
    assert.ok(ticks < 240, `walking should not stick before ${id}`);
  });
  assert.ok(Math.hypot(state.player.x - site.x, state.player.z - site.z) <= Math.max(gameConfig.interactionRadius, site.radius) + .6, `player must reach interaction range for ${id}`);
}

function CompleteSiteWithoutTeleport(state, id) {
  WalkToSite(state, id);
  assert.equal(InteractWithSite(state, id), true, `walking route should begin interaction at ${id}`);
  let steps = 0;
  while (state.activeInteraction && steps < 2000) {
    StepGame(state, .05, {});
    steps += 1;
  }
  assert.equal(state.activeInteraction, null, `walking route should finish interaction at ${id}`);
}

function AssertPlayerMovementAndFiniteTime() {
  const state = CreateGameState({ difficulty: "story" });
  DisablePatrolPressure(state);
  const startX = state.player.x;
  const startZ = state.player.z;
  for (let index = 0; index < 40; index += 1) StepGame(state, .05, { moveX: 0, moveZ: 1 });
  assert.ok(Math.hypot(state.player.x - startX, state.player.z - startZ) > 3, "player must be able to walk away from the real spawn without teleporting");

  const invalidDelta = CreateGameState();
  StepGame(invalidDelta, Number.NaN, { moveX: Number.NaN, moveZ: "not-a-number" });
  assert.equal(invalidDelta.elapsed, 0);
  assert.equal(invalidDelta.remaining, gameConfig.durationSeconds);
  assert.ok(Number.isFinite(invalidDelta.player.x) && Number.isFinite(invalidDelta.player.z));

  const cancellable = CreateGameState();
  DisablePatrolPressure(cancellable);
  cancellable.player.x = -42;
  cancellable.player.z = -32.75;
  assert.equal(InteractWithSite(cancellable, "ruinedStation"), true);
  const beforeCancelZ = cancellable.player.z;
  StepGame(cancellable, .05, { moveX: 0, moveZ: 1 });
  assert.equal(cancellable.activeInteraction, null, "movement input must cancel a passive interaction immediately");
  assert.ok(cancellable.player.z > beforeCancelZ, "the same movement input should move after cancelling");

  assert.equal(InteractWithSite(cancellable, "ruinedStation"), true);
  assert.equal(InteractWithSite(cancellable, "ruinedStation"), true, "pressing interact again must cancel the current action");
  assert.equal(cancellable.activeInteraction, null);
}

function AssertGroupHidingAndPressureTiers() {
  const huddle = CreateGameState({ difficulty: "standard" });
  DisablePatrolPressure(huddle);
  huddle.player.x = -19;
  huddle.player.z = -22;
  huddle.civilians.forEach((civilian, index) => {
    civilian.state = "following";
    civilian.x = huddle.player.x + (index - 2) * .8;
    civilian.z = huddle.player.z + 2.4 + index * .12;
  });
  huddle.rescued = 5;
  for (let index = 0; index < 100; index += 1) StepGame(huddle, .05, {});
  assert.equal(huddle.player.hidden, true);
  assert.equal(huddle.civilians.filter((civilian) => civilian.hidden).length, 5, "a full five-person group must fit inside an authored hide zone");
  huddle.patrols.forEach((patrol, index) => {
    patrol.x = index === 0 ? -19 : 54;
    patrol.z = index === 0 ? -33 : -54;
    patrol.yaw = index === 0 ? 0 : Math.PI;
    patrol.speed = index === 0 ? 2.45 : 0;
    patrol.path = index === 0 ? [{ x: -19, z: -33 }, { x: -19, z: -10 }] : [{ x: patrol.x, z: patrol.z }];
    patrol.waypoint = index === 0 ? 1 : 0;
    patrol.detection = 0;
  });
  for (let index = 0; index < 30; index += 1) StepGame(huddle, .05, {});
  assert.equal(huddle.patrols[0].detection, 0, "a moving front patrol must not see a fully huddled five-person group at concealment distance");
  huddle.player.yaw = Math.PI;
  assert.equal(ThrowDistraction(huddle), true, "the live-patrol concealment segment must exercise the stone lure");
  const hiddenStartX = huddle.player.x;
  for (let index = 0; index < 10; index += 1) StepGame(huddle, .05, { moveX: 1, moveZ: 0 });
  assert.ok(huddle.player.x > hiddenStartX, "the live-patrol segment must use real movement input after the lure");

  const pressure = CreateGameState({ difficulty: "story" });
  DisablePatrolPressure(pressure);
  pressure.elapsed = 359.96;
  StepGame(pressure, .05, {});
  assert.equal(pressure.pressureTier, 1);
  assert.ok(pressure.alert >= 30);
  pressure.elapsed = 539.96;
  StepGame(pressure, .05, {});
  assert.equal(pressure.pressureTier, 2);
  assert.ok(pressure.alert >= 55);
}

function AssertCivilianRiskRecoveryAndMedicineChoice() {
  const freedVillage = CreateGameState({ difficulty: "story" });
  DisablePatrolPressure(freedVillage);
  CompleteSite(freedVillage, "ruinedStation");
  CompleteSite(freedVillage, "wujiaVillage");
  freedVillage.civilians.forEach((civilian) => { civilian.state = "seized"; });
  freedVillage.rescued = 0;
  MoveTo(freedVillage, "wujiaVillage");
  assert.equal(GetSiteAction(freedVillage, Site("wujiaVillage")).disabled, true, "a cleared village must not become a repeatable rescue when all followers are later seized");
  assert.equal(InteractWithSite(freedVillage, "wujiaVillage"), false);

  const state = CreateGameState({ difficulty: "story" });
  state.player.x = 0;
  state.player.z = 7;
  state.civilians.forEach((civilian) => { civilian.state = "detained"; });
  const civilian = state.civilians[0];
  civilian.state = "following";
  civilian.x = 0;
  civilian.z = 0;
  state.rescued = 1;
  state.patrols.forEach((patrol, index) => {
    patrol.x = index === 0 ? 0 : 55;
    patrol.z = index === 0 ? -2 : -55;
    patrol.yaw = 0;
    patrol.speed = index === 0 ? 2.45 : 0;
    patrol.detection = index === 0 ? 2 : 0;
    patrol.alerted = index === 0;
    patrol.mode = index === 0 ? "search" : "patrol";
    patrol.lastKnown = index === 0 ? { x: civilian.x, z: civilian.z } : null;
  });
  for (let index = 0; index < 180 && civilian.state === "following"; index += 1) StepGame(state, .05, {});
  assert.equal(civilian.state, "seized", "a follower held at close range must become recoverable instead of being an invulnerable score token");
  assert.equal(state.rescued, 0);
  state.patrols.forEach((patrol, index) => {
    patrol.x = 55 - index;
    patrol.z = -55 + index;
    patrol.speed = 0;
    patrol.alerted = false;
    patrol.mode = "patrol";
    patrol.detection = 0;
    patrol.path = [{ x: patrol.x, z: patrol.z }];
    patrol.waypoint = 0;
  });
  state.player.x = civilian.x;
  state.player.z = civilian.z;
  assert.equal(InteractWithSite(state, `recover:${civilian.id}`), true);
  while (state.activeInteraction) StepGame(state, .05, {});
  assert.equal(civilian.state, "following");
  assert.equal(state.rescued, 1);

  const treatZhao = CreateGameState();
  treatZhao.rescued = 5;
  treatZhao.medicine = 1;
  treatZhao.civilians.forEach((candidate) => { candidate.state = "following"; });
  assert.equal(UseMedicine(treatZhao, "zhaoManCang"), true);
  assert.equal(treatZhao.medicineTarget, "zhaoManCang");
  assert.equal(treatZhao.civilians.find((candidate) => candidate.id === "zhaoManCang").wounded, false);

  const treatLin = CreateGameState();
  treatLin.rescued = 5;
  treatLin.medicine = 1;
  treatLin.civilians.forEach((candidate) => { candidate.state = "following"; });
  assert.equal(UseMedicine(treatLin, "linYan"), true);
  assert.equal(treatLin.medicineTarget, "linYan");
  assert.equal(treatLin.liaison.health, 82);
  assert.equal(treatLin.civilians.find((candidate) => candidate.id === "zhaoManCang").wounded, true);
}

function AssertStaticContract() {
  const html = readFileSync(new URL("./index.html", import.meta.url), "utf8");
  const gameScript = readFileSync(new URL("./Script_Game.mjs", import.meta.url), "utf8");
  const threeLoader = readFileSync(new URL("./Script_ThreeLoader.mjs", import.meta.url), "utf8");
  const style = readFileSync(new URL("./Style_Game.css", import.meta.url), "utf8");
  assert.match(html, /普通农妇秦桂枝|吴家庄的农民/);
  assert.match(html, /侵华日军/);
  assert.match(html, /不统计击杀/);
  assert.match(html, /史实与创作边界/);
  assert.match(html, /1942年5月/);
  assert.match(html, /秦桂枝、林砚、吴家庄/);
  assert.match(html, /对应强征、拘押、纵火与集体惩罚/);
  assert.match(html, /对应共产党员维系联络、组织群众的工作/);
  assert.match(html, /data-difficulty="story"/);
  assert.match(html, /ResultReturnTitleButton/);
  assert.match(html, /AudioButton/);
  assert.match(html, /ShowLastSurvivorFailure/);
  assert.match(html, /<noscript>/);
  assert.match(html, /aria-live="polite"/);
  assert.match(gameScript, /PerspectiveCamera/);
  assert.match(gameScript, /WebGLRenderer/);
  assert.match(gameScript, /touchInteract/);
  assert.match(gameScript, /requestAnimationFrame/);
  assert.match(gameScript, /patrolVision\.distance/);
  assert.doesNotMatch(gameScript, /patrol\.stun/);
  assert.match(gameScript, /ResetForNewRun/);
  assert.match(gameScript, /webglcontextlost/);
  assert.match(gameScript, /lastObjectiveSignature/);
  assert.match(gameScript, /coneGeometry\.rotateX\(Math\.PI \/ 2\)/);
  assert.match(gameScript, /detectionFill/);
  assert.match(gameScript, /captionQueue/);
  assert.match(gameScript, /UpdateGuidance/);
  assert.match(gameScript, /AudioContext|webkitAudioContext/);
  assert.match(gameScript, /ProceduralSoundscape/);
  assert.match(gameScript, /cinematicMode/);
  assert.match(gameScript, /waterwayBlockadeGroup/);
  assert.match(gameScript, /site\.id === "northDitch"/);
  assert.match(gameScript, /signalLamp/);
  assert.match(gameScript, /PlaySignalBeat/);
  assert.match(gameScript, /this\.reducedMotion \? 4\.8 : 6\.8/);
  assert.match(threeLoader, /cdn\.jsdelivr\.net/);
  assert.match(threeLoader, /unpkg\.com/);
  assert.match(style, /prefers-reduced-motion/);
  assert.match(style, /transition-duration:\s*\.01ms/);
  assert.match(style, /pointer: coarse/);
  assert.doesNotMatch(html, /击杀数|连杀|爆头|战利品/);
}

function RunSmokeTests() {
  AssertInitialState();
  AssertGatedInteractions();
  AssertDifficultyMedicineAndDetourContracts();
  AssertPatrolRouteIntegrity();
  AssertCompleteRoute();
  AssertCompleteRouteWithoutTeleport();
  AssertOccupationConsequences();
  AssertDistractionAndTimer();
  AssertPlayerMovementAndFiniteTime();
  AssertGroupHidingAndPressureTiers();
  AssertCivilianRiskRecoveryAndMedicineChoice();
  AssertStaticContract();
  console.log("LastSurvivor1942 smoke tests passed: ordinary-civilian viewpoint, mission gates, occupation consequences, no-kill scoring, timer, and static 3D/mobile contract.");
}

RunSmokeTests();
