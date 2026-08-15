import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  CHAPTERS,
  PLAYABLE_CHAPTERS,
  CreateGame,
  StepGame,
  ChapterBeatList,
  DebugJump,
  CurrentBeatDef,
  BeatHintIcon,
} from "./Script_Core.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const runtimeFiles = [
  "index.html", "Script_Main.js", "Script_Core.mjs", "Script_World.js",
  "Script_Art.mjs", "Script_Rig.mjs", "Script_Light.mjs", "Script_Fluid.mjs",
  "Script_Audio.js", "Script_Soundtrack.js", "Data_Scenes.mjs",
  "Data_Scenes.json", "Data_PropArt.json", "vendor/three/build/three.module.js",
  "Icon/Icon_Lamp.png", "Texture/Texture_NoticeZhengfu.webp",
  "Audio/Bgm/AudioBgm_WithTheseHands.mp3", "Audio/Sfx/Data_SfxManifest.json",
  "Audio/Voice_Manifest.json",
];

assert.equal(PLAYABLE_CHAPTERS, 1, "Chapter One Imagegen must expose one chapter");
assert.equal(CHAPTERS.length, 8, "the copied core must retain the complete script table");
const c1 = ChapterBeatList(0);
const expectedChapterOneBeatIds = [
  "c1_thatday", "c1_descend", "c1_hide", "c1_open", "c1_forage", "c1_meal",
  "c1_tally", "c1_draw", "c1_count", "c1_field", "c1_elm", "c1_well",
  "c1_return", "c1_bell", "c1_riders", "c1_pour", "c1_dusk", "c1_share",
  "c1_cellar", "c1_knows", "c1_water", "c1_rescue", "c1_mend",
];
assert.deepEqual(
  c1.map((beat) => beat.id), expectedChapterOneBeatIds,
  "Chapter One Imagegen must retain every beat in the deployed Chapter One runtime",
);
assert.equal(new Set(c1.map((beat) => beat.id)).size, c1.length, "C1 beat ids must be unique");
assert.equal(ChapterBeatList(1).length > 0, true, "later scripts remain available to the copied core");

const state = CreateGame(0);
assert.equal(state.chapterIndex, 0);
assert.equal(state.phase, "chapterCard");
for (const flag of ["cellarTidy", "pitDug", "clothesBuried", "basketMoved"]) {
  assert.equal(state.flags[flag], false, `fresh Chapter One state must clear ${flag}`);
}
const neutral = { moveX: 0, climb: 0, crouch: false, interact: false, interactHeld: false, throw: false, advance: true };
for (let i = 0; i < 90 && state.phase === "chapterCard"; i += 1) StepGame(state, neutral, 1 / 30);
assert.equal(state.chapterIndex, 0, "neutral startup must remain in Chapter One");
assert.ok(["playing", "chapterEnd", "gameEnd"].includes(state.phase), `unexpected startup phase ${state.phase}`);

for (let i = 0; i < c1.length; i += 1) {
  const landed = DebugJump(state, 0, i);
  assert.equal(state.chapterIndex, 0, `debug jump ${i + 1} escaped Chapter One`);
  assert.equal(state.beatIndex, i, `debug jump ${i + 1} landed on the wrong index`);
  assert.equal(landed, c1[i].id, `debug jump ${i + 1} returned the wrong beat id`);
  assert.equal(CurrentBeatDef(state)?.id, c1[i].id);
}

// The cellar burial is a real playable chain, not a debug-only flag shortcut.
const burialState = CreateGame(0);
assert.equal(DebugJump(burialState, 0, 18), "c1_cellar");
const burial = CurrentBeatDef(burialState);
assert.equal(burial.kind, "chain");
const burialSteps = burial.steps;
assert.deepEqual(
  burialSteps.slice(4, 9).map((step) => step.type),
  ["pickup", "use", "pickup", "use", "use"],
  "burial chain must pick up, dig, pick up clothes, lay down, and fill",
);
assert.deepEqual(
  burialSteps.slice(4, 9).map((step) => step.item?.id || step.needs || null),
  ["chippedBowl", "chippedBowl", "bloodClothes", "bloodClothes", null],
  "burial action contracts must carry the bowl and blood clothes in order",
);
assert.deepEqual(
  burialSteps.slice(5, 9).map((step) => [step.hold, step.stroke]),
  [[2.4, "down"], [undefined, undefined], [1.3, "down"], [2.2, "down"]],
  "dig, lay-down, and fill must remain hold/stroke actions",
);
assert.equal(burialSteps[7].pose, "layDown", "clothing placement must use the lay-down pose");
assert.equal(burialSteps[5].consume, false, "digging must leave the bowl available until the action completes");

const tick = (input) => StepGame(burialState, {
  moveX: 0, climb: 0, crouch: false, interact: false, interactHeld: false,
  throw: false, advance: false, ...input,
}, 1 / 30);
const settle = (stepIndex, x, seconds, input = { interactHeld: true }) => {
  burialState.player.level = "under";
  burialState.player.x = x;
  let guard = 0;
  // The goto step opens a short micro-cine before the first hold can receive input.
  while (burialState.beat.stepIndex === stepIndex && guard < Math.ceil(seconds * 30) + 300) {
    tick(input);
    guard += 1;
  }
  assert.notEqual(burialState.beat.stepIndex, stepIndex, `burial step ${stepIndex} did not settle`);
};
burialState.player.level = "under";
burialState.player.x = 30.5;
tick();
assert.equal(burialState.beat.stepIndex, 1, "cellar goto must be reachable from the under level");
settle(1, 34.5, 1.2);
settle(2, 29.6, 1.2);
settle(3, 33.9, 1.3);
assert.equal(burialState.flags.cellarTidy, true);
assert.equal(BeatHintIcon(burialState).kind, "item");
burialState.player.x = 28.6;
tick({ interact: true });
assert.equal(burialState.beat.stepIndex, 5);
assert.equal(burialState.player.item?.id, "chippedBowl");
assert.equal(BeatHintIcon(burialState).item, "豁口碗");
burialState.player.x = 27.1;
tick({ interact: true });
assert.equal(burialState.beat.stepIndex, 5, "plain interact must not complete digging");
settle(5, 27.1, 2.4);
assert.equal(burialState.flags.pitDug, true);
assert.equal(burialState.player.item, null);
burialState.player.x = 27;
tick({ interact: true });
assert.equal(burialState.beat.stepIndex, 7);
assert.equal(burialState.player.item?.id, "bloodClothes");
assert.equal(BeatHintIcon(burialState).item, "那件衣裳");
burialState.player.x = 27.1;
tick({ interact: true });
assert.equal(burialState.beat.stepIndex, 7, "plain interact must not complete clothing placement");
settle(7, 27.1, 1.3);
assert.equal(burialState.flags.clothesBuried, false);
assert.equal(burialState.player.item, null);
tick({ interact: true });
assert.equal(burialState.beat.stepIndex, 8, "lay-down must advance to fill");
assert.equal(burialState.flags.clothesBuried, false);
tick({ interact: true });
assert.equal(burialState.beat.stepIndex, 8, "plain interact must not complete filling");
settle(8, 27.1, 2.2);
assert.equal(burialState.flags.clothesBuried, true);
assert.equal(DebugJump(CreateGame(0), 0, 19), "c1_knows");
const settled = CreateGame(0);
DebugJump(settled, 0, 19);
assert.equal(settled.flags.pitDug, true);
assert.equal(settled.flags.clothesBuried, true);
const scene = JSON.parse(fs.readFileSync(path.join(here, "Data_Scenes.json"), "utf8")).scenes.village;
const graveDirt = scene.props.find((prop) => prop.id === "graveDirt");
const clothBundle = scene.props.find((prop) => prop.id === "clothBundle");
assert.deepEqual(
  { showFlag: graveDirt?.showFlag, hideFlag: clothBundle?.hideFlag },
  { showFlag: "clothesBuried", hideFlag: "clothesBuried" },
  "burial props must swap on the clothesBuried flag",
);

const mainSource = fs.readFileSync(path.join(here, "Script_Main.js"), "utf8");
for (const key of [
  "tunnelLight1943_chapterOneImagegen_sound",
  "tunnelLight1943_chapterOneImagegen_vol",
  "tunnelLight1943_chapterOneImagegen_unlocked",
  "tunnelLight1943_chapterOneImagegen_bag_v1",
]) assert.ok(mainSource.includes(key), `missing isolated persistence key ${key}`);

const html = fs.readFileSync(path.join(here, "index.html"), "utf8");
assert.match(html, /Script_Main\.js\?v=one011/, "sibling index must carry its own cache bust");
assert.match(html, /第一章美术还原版/, "sibling page must identify the Chapter One art restoration");
assert.doesNotMatch(html, /白盒原型|WHITEBOX PROTOTYPE/, "restored page must not present itself as a whitebox prototype");
assert.doesNotMatch(html, /(?:src|href)=["']\.\.\//, "sibling page must not reach parent media");

for (const rel of runtimeFiles) {
  assert.ok(fs.existsSync(path.join(here, rel)), `missing copied runtime asset ${rel}`);
}
const paperTexture = fs.readFileSync(path.join(here, "Texture/Texture_PaperCharcoal.png"));
assert.equal(paperTexture.readUInt32BE(16), 1536, "generated paper texture width must be 1.5K");
assert.equal(paperTexture.readUInt32BE(20), 1536, "generated paper texture height must be 1.5K");
const forbiddenGeneratedSizes = fs.readdirSync(path.join(here, "Texture"))
  .filter((name) => /(?:2k|2048)/i.test(name));
assert.deepEqual(forbiddenGeneratedSizes, [], "2K generated assets must not enter this subpage");
const sourceFiles = fs.readdirSync(here).filter((name) => /^(Script|Data)_.*\.(?:js|mjs)$/.test(name));
for (const name of sourceFiles) {
  const source = fs.readFileSync(path.join(here, name), "utf8");
  assert.doesNotMatch(source, /(?:from|import\(|fetch\()\s*["']\.\.\//, `${name} reaches the parent runtime`);
}

console.log(`ChapterOneImagegen smoke passed: ${c1.length} C1 beats, isolated keys, local runtime assets, and no parent imports.`);
