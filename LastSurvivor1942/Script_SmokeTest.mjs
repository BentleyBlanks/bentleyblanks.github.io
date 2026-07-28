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
  siteDefinitions,
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
  assert.ok(GetMinimumInteractionSeconds("standard") >= 370);
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
  CompleteSite(state, "eastContact");
  CompleteSite(state, "radioCache");
  assert.equal(state.grain, 4);
  assert.equal(state.medicine, 1);
  assert.equal(state.radioPart, true);
  assert.equal(state.contactsPreserved, 2);
  CompleteSite(state, "relayStation");
  assert.equal(state.radioRepaired, true);
  assert.equal(state.finalPressure, true);
  assert.equal(state.act, 3);
  assert.equal(GetActLabel(state), "第三幕 · 最后关门的人");
  assert.equal(UseMedicine(state), true);
  assert.equal(state.wounded, 1);
  CompleteSite(state, "relayStation");
  CompleteSite(state, "rosterTable");
  CompleteSite(state, "stationDoor");
  assert.equal(state.signalsConfirmed, 3);
  assert.equal(state.rosterDestroyed, true);
  assert.equal(state.stationClosed, true);
  assert.equal(state.safe, 0);
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

function AssertStaticContract() {
  const html = readFileSync(new URL("./index.html", import.meta.url), "utf8");
  const gameScript = readFileSync(new URL("./Script_Game.mjs", import.meta.url), "utf8");
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
  assert.match(gameScript, /PerspectiveCamera/);
  assert.match(gameScript, /WebGLRenderer/);
  assert.match(gameScript, /touchInteract/);
  assert.match(gameScript, /requestAnimationFrame/);
  assert.match(gameScript, /patrolVision\.distance/);
  assert.doesNotMatch(gameScript, /patrol\.stun/);
  assert.match(style, /prefers-reduced-motion/);
  assert.match(style, /pointer: coarse/);
  assert.doesNotMatch(html, /击杀数|连杀|爆头|战利品/);
}

function RunSmokeTests() {
  AssertInitialState();
  AssertGatedInteractions();
  AssertCompleteRoute();
  AssertOccupationConsequences();
  AssertDistractionAndTimer();
  AssertStaticContract();
  console.log("LastSurvivor1942 smoke tests passed: ordinary-civilian viewpoint, mission gates, occupation consequences, no-kill scoring, timer, and static 3D/mobile contract.");
}

RunSmokeTests();
