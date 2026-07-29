import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

import {
  ApplyMissionEvent,
  BuildEpilogueSummary,
  CreateMissionState,
  CurrentObjective,
  IsMissionComplete,
  missionPhaseOrder,
} from "./Script_Rules.mjs";
import {
  chapters,
  historicalFrame,
  interactionCopy,
} from "./Data_Story.mjs";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const html = await readFile(path.join(scriptDirectory, "index.html"), "utf8");
const css = await readFile(path.join(scriptDirectory, "Style_Game.css"), "utf8");
const gameSource = await readFile(path.join(scriptDirectory, "Script_Game.mjs"), "utf8");
const worldSource = await readFile(path.join(scriptDirectory, "Script_World.mjs"), "utf8");
const storySource = await readFile(path.join(scriptDirectory, "Data_Story.mjs"), "utf8");

function CompleteStory(itemChoices = ["Medicine", "Seed"]) {
  let state = CreateMissionState();
  for (const task of ["Mill", "Bowl", "Shoe"]) {
    state = ApplyMissionEvent(state, { type: "CompleteBreakfastTask", task });
  }
  assert.equal(state.phase, "Choice");
  for (const item of itemChoices) state = ApplyMissionEvent(state, { type: "ChooseItem", item });
  state = ApplyMissionEvent(state, { type: "EnterCellar" });
  assert.equal(state.phase, "Cellar");
  state = ApplyMissionEvent(state, { type: "CompleteCellar" });
  assert.equal(state.phase, "Rescue");
  for (const group of ["Family", "AuntSun", "Zhou"]) {
    state = ApplyMissionEvent(state, { type: "FindRescueGroup", group });
    state = ApplyMissionEvent(state, { type: "DeliverRescueGroup" });
  }
  assert.equal(state.phase, "Battle");
  for (const task of ["Message", "Cart", "Gate"]) {
    state = ApplyMissionEvent(state, { type: "CompleteBattleTask", task });
  }
  assert.equal(state.phase, "Reeds");
  for (let crossing = 0; crossing < 3; crossing += 1) {
    state = ApplyMissionEvent(state, { type: "CompleteFerryCrossing" });
  }
  return state;
}

assert.deepEqual(missionPhaseOrder, [
  "Breakfast", "Choice", "Cellar", "Rescue", "Battle", "Reeds", "Epilogue",
]);
assert.equal(Object.keys(chapters).length, 7);
assert.match(historicalFrame.statement, /日本侵略军/);
assert.match(historicalFrame.statement, /抢掠、拘捕、杀害与纵火/);
assert.match(historicalFrame.boundary, /缺粮、缺药、缺枪弹/);

assert.match(html, /id="GameCanvas"/);
assert.match(html, /id="TouchControls"/);
assert.match(html, /aria-live="polite"/);
assert.match(html, /内容提示/);
assert.match(html, /虚构村庄与复合人物/);
assert.match(html, /日本侵略军/);
assert.match(html, /无击杀计分/);
assert.match(html, /不使用血腥特写、慢镜杀戮、爆头音效或击杀榜/);
assert.match(html, /三样东西只能带走两样|最多带走两样/);
assert.match(html, /梁穗儿/);
assert.match(html, /陈守义/);
assert.match(html, /周文嫂/);
assert.match(css, /prefers-reduced-motion/);
assert.match(css, /@media \(pointer: coarse\)/);
assert.match(css, /@media \(max-height: 520px\) and \(orientation: landscape\)/);
assert.match(css, /min-height: 48px/);

assert.doesNotMatch(html, /cdn\.jsdelivr|unpkg|cdnjs/);
assert.match(worldSource, /\.\.\/taihang\/vendor\/three\/build\/three\.module\.mjs/);
assert.doesNotMatch(worldSource, /https?:\/\//);
assert.doesNotMatch(gameSource, /killCount|killsLabel|headshot|killStreak/i);
assert.doesNotMatch(html, /id="[^"]*(Kill|Score|Headshot)[^"]*"/i);
assert.doesNotMatch(storySource, /群众\s*[+＋]\s*\d+/);
assert.doesNotMatch(storySource, /全歼|爆头奖励|连杀奖励/);

let invalid = CreateMissionState();
invalid = ApplyMissionEvent(invalid, { type: "CompleteBreakfastTask", task: "Shoe" });
assert.equal(invalid.phase, "Breakfast");
assert.equal(CurrentObjective(invalid).target, "Mill");
invalid = ApplyMissionEvent(invalid, { type: "EnterCellar" });
assert.equal(invalid.phase, "Breakfast");

const completed = CompleteStory(["Medicine", "Seed"]);
assert.equal(IsMissionComplete(completed), true);
assert.equal(completed.phase, "Epilogue");
assert.equal(completed.rescuedGroups.length, 3);
const summary = BuildEpilogueSummary(completed);
assert.equal(summary.hasScore, false);
assert.equal(summary.hasKillCount, false);
assert.match(summary.people, /陈守义未归/);
assert.equal(summary.itemOutcomes.find((entry) => entry.item === "Register").saved, false);

for (const choices of [
  ["Medicine", "Seed"],
  ["Medicine", "Register"],
  ["Seed", "Register"],
]) {
  const outcome = BuildEpilogueSummary(CompleteStory(choices));
  assert.equal(outcome.itemOutcomes.filter((entry) => entry.saved).length, 2);
  assert.equal(outcome.hasScore, false);
}

for (let run = 0; run < 100; run += 1) {
  const combinations = [
    ["Medicine", "Seed"],
    ["Medicine", "Register"],
    ["Seed", "Register"],
  ];
  const state = CompleteStory(combinations[run % combinations.length]);
  assert.equal(IsMissionComplete(state), true, `simulation ${run} should not soft-lock`);
}

for (const target of ["Mill", "Bowl", "Shoe", "Family", "AuntSun", "Zhou", "Canal", "Message", "Cart", "Gate", "Ferry"]) {
  assert.ok(interactionCopy[target], `interaction copy missing for ${target}`);
}

console.log("CivilianFront1942 smoke test passed: seven chapters, three consequence paths, 100 deterministic full-story runs, zero kill-score surface.");
