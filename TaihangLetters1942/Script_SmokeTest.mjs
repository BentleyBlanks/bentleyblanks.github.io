import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  StoryMeta,
  ItemDefinitions,
  StudentRoster,
  MemoryObjects,
  StoryScenes,
  EndingDefinitions,
} from "./Data_Story.mjs";
import {
  HistoricalSources,
  HistoricalNotes,
  HistoryById,
  SourceById,
} from "./Data_History.mjs";
import {
  ApplyChoiceEffects,
  CreateInitialState,
  FindScene,
  GetReachableChoices,
  NormalizeState,
  ResolveEndingDefinition,
} from "./Script_Game.mjs";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const htmlPath = path.join(scriptDirectory, "index.html");
const cssPath = path.join(scriptDirectory, "Style_Game.css");
const storyPath = path.join(scriptDirectory, "Data_Story.mjs");
const historyPath = path.join(scriptDirectory, "Data_History.mjs");
const gamePath = path.join(scriptDirectory, "Script_Game.mjs");

const html = fs.readFileSync(htmlPath, "utf8");
const css = fs.readFileSync(cssPath, "utf8");
const storySource = fs.readFileSync(storyPath, "utf8");
const historySource = fs.readFileSync(historyPath, "utf8");
const gameSource = fs.readFileSync(gamePath, "utf8");

function AssertUnique(values, label) {
  assert.equal(new Set(values).size, values.length, `${label} must be unique`);
}

function CollectItemIds() {
  const itemIds = new Set(StoryMeta.initialItems || []);
  for (const scene of StoryScenes) {
    for (const choice of scene.choices || []) {
      for (const itemId of choice.effects?.itemsAdd || []) {
        itemIds.add(itemId);
      }
      for (const itemId of choice.effects?.itemsRemove || []) {
        itemIds.add(itemId);
      }
      for (const itemId of choice.requires?.items || []) {
        itemIds.add(itemId);
      }
      for (const itemId of choice.requires?.notItems || []) {
        itemIds.add(itemId);
      }
    }
  }
  for (const ending of EndingDefinitions) {
    for (const itemId of ending.requires?.items || []) {
      itemIds.add(itemId);
    }
  }
  return itemIds;
}

function ExploreStaticSceneGraph() {
  const queue = [StoryMeta.startSceneId];
  const reachedScenes = new Set();
  let foundEnding = false;
  while (queue.length > 0) {
    const sceneId = queue.shift();
    if (reachedScenes.has(sceneId)) {
      continue;
    }
    const scene = FindScene(sceneId);
    assert.ok(scene, `static graph points to missing scene ${sceneId}`);
    reachedScenes.add(scene.id);
    for (const choice of scene.choices) {
      if (choice.next === StoryMeta.endingMarker) {
        foundEnding = true;
      } else {
        queue.push(choice.next);
      }
    }
  }
  assert.ok(foundEnding, "static graph never reaches the ending marker");
  return reachedScenes;
}

function SamplePlayableJourneys(maxJourneys = 100000) {
  let randomState = 0x6d2b79f5;
  let transitionCount = 0;
  let journeyCount = 0;
  const reachedScenes = new Set();
  const reachedEndings = new Set();

  function NextRandom() {
    randomState ^= randomState << 13;
    randomState ^= randomState >>> 17;
    randomState ^= randomState << 5;
    return randomState >>> 0;
  }

  for (let journeyIndex = 0; journeyIndex < maxJourneys; journeyIndex += 1) {
    let state = CreateInitialState(journeyIndex);
    let completed = false;
    journeyCount += 1;

    for (let step = 0; step < StoryScenes.length + 8; step += 1) {
      const scene = FindScene(state.currentSceneId);
      assert.ok(scene, `sampled state points to missing scene ${state.currentSceneId}`);
      reachedScenes.add(scene.id);
      const choices = GetReachableChoices(state, scene);
      assert.ok(choices.length > 0, `sampled scene ${scene.id} has no available choice`);
      const choiceIndex = (NextRandom() + journeyIndex + step) % choices.length;
      const choice = choices[choiceIndex];
      transitionCount += 1;
      state = ApplyChoiceEffects(state, choice, transitionCount);

      if (choice.next === StoryMeta.endingMarker) {
        const ending = ResolveEndingDefinition(state);
        assert.ok(ending, `terminal choice ${choice.id} resolves no ending`);
        reachedEndings.add(ending.id);
        completed = true;
        break;
      }
      state.currentSceneId = choice.next;
    }

    assert.ok(completed, `sampled journey ${journeyIndex} did not terminate`);
    if (
      journeyCount >= 5000 &&
      reachedScenes.size === StoryScenes.length &&
      reachedEndings.size === EndingDefinitions.length
    ) {
      break;
    }
  }

  return {
    journeys: journeyCount,
    transitions: transitionCount,
    reachedScenes,
    reachedEndings,
  };
}

assert.equal(StoryMeta.startSceneId, StoryScenes[0].id, "first scene should be the start scene");
assert.equal(StoryMeta.title, "名册", "the plain-language title must stay in place");
assert.equal(StoryMeta.endingMarker, "__ending__", "ending marker contract changed");
assert.match(StoryMeta.saveKey, /^TaihangLetters1942_/, "save key must stay page-specific");
assert.deepEqual(StoryMeta.estimatedMinutes, [15, 25], "declared playtime changed");
assert.equal(NormalizeState(null), null, "null save must be rejected");
assert.equal(
  NormalizeState({ storyId: "anotherStory" }),
  null,
  "a save from another story must be rejected",
);
const malformedState = NormalizeState({
  ...CreateInitialState(10),
  started: "yes",
  completed: true,
  updatedAt: "not-a-date",
  completedAt: "also-not-a-date",
});
assert.equal(malformedState.started, true, "completed save must remain started");
assert.equal(malformedState.updatedAt, 10, "bad updatedAt must fall back to startedAt");
assert.equal(malformedState.completedAt, 10, "bad completedAt must fall back to updatedAt");
for (const invalidTimestamp of [null, "", false, [], Number.MAX_VALUE]) {
  const normalizedTimestampState = NormalizeState({
    ...CreateInitialState(10),
    updatedAt: invalidTimestamp,
  });
  assert.equal(
    normalizedTimestampState.updatedAt,
    10,
    `invalid timestamp ${String(invalidTimestamp)} must fall back to startedAt`,
  );
}
assert.equal(
  ResolveEndingDefinition(CreateInitialState()),
  null,
  "an unmatched state must not receive a false fallback ending",
);

assert.ok(StoryScenes.length >= 15, "story should contain at least 15 scenes");
assert.ok(
  StoryScenes.reduce((count, scene) => count + scene.choices.length, 0) >= 45,
  "story should provide meaningful choice density",
);
AssertUnique(
  StoryScenes.map((scene) => scene.id),
  "scene IDs",
);
AssertUnique(
  StoryScenes.flatMap((scene) => scene.choices.map((choice) => choice.id)),
  "choice IDs",
);

const sceneIds = new Set(StoryScenes.map((scene) => scene.id));
for (const scene of StoryScenes) {
  assert.ok(scene.copy.length >= 1, `${scene.id} needs narrative copy`);
  assert.ok(scene.dialogue.length >= 1, `${scene.id} needs character dialogue`);
  assert.ok(HistoryById[scene.historyId], `${scene.id} references missing history ${scene.historyId}`);
  for (const choice of scene.choices) {
    assert.ok(choice.label && choice.hint, `${scene.id}/${choice.id} needs label and hint`);
    assert.ok(
      choice.next === StoryMeta.endingMarker || sceneIds.has(choice.next),
      `${scene.id}/${choice.id} points to missing next scene ${choice.next}`,
    );
  }
}

assert.equal(StudentRoster.length, 19, "the roster must contain exactly nineteen students");
AssertUnique(
  StudentRoster.map((student) => student.id),
  "student IDs",
);
AssertUnique(
  StudentRoster.map((student) => student.name),
  "student names",
);
const missingStudent = StudentRoster.find((student) => student.id === "zhaoShitou");
assert.equal(missingStudent?.status, "待寻", "赵石头 must remain honestly marked 待寻");

assert.deepEqual(
  MemoryObjects.map((memory) => memory.glyph),
  ["伤", "册", "标", "址"],
  "concrete record category order is part of the story",
);
assert.deepEqual(
  MemoryObjects.map((memory) => memory.label),
  ["伤员", "名册", "路标", "地址"],
  "player-facing records must stay concrete",
);
AssertUnique(
  MemoryObjects.map((memory) => memory.id),
  "memory IDs",
);

const definitionIds = new Set(ItemDefinitions.map((item) => item.id));
for (const itemId of CollectItemIds()) {
  assert.ok(definitionIds.has(itemId), `item ${itemId} has no ItemDefinitions entry`);
}
AssertUnique(
  ItemDefinitions.map((item) => item.id),
  "item definition IDs",
);

AssertUnique(
  HistoricalNotes.map((note) => note.id),
  "historical note IDs",
);
AssertUnique(
  HistoricalSources.map((source) => source.id),
  "historical source IDs",
);
for (const note of HistoricalNotes) {
  for (const sourceId of note.sourceIds) {
    assert.ok(SourceById[sourceId], `${note.id} references missing source ${sourceId}`);
  }
}
for (const source of HistoricalSources) {
  assert.match(source.url, /^https?:\/\//, `${source.id} needs a public URL`);
  assert.ok(source.title.length >= 4, `${source.id} needs an exact source title`);
}

const staticScenes = ExploreStaticSceneGraph();
assert.equal(staticScenes.size, StoryScenes.length, "every scene must be statically reachable");
const exploration = SamplePlayableJourneys();
assert.equal(exploration.reachedScenes.size, StoryScenes.length, "every scene must be reachable");
assert.deepEqual(
  [...exploration.reachedEndings].sort(),
  EndingDefinitions.map((ending) => ending.id).sort(),
  "every authored ending must be reachable through valid choices",
);

const requiredIds = [
  "TitleScreen",
  "NewGameButton",
  "ContinueButton",
  "ArchiveButton",
  "TitleSettingsButton",
  "GameScreen",
  "BrandButton",
  "ChapterLabel",
  "TimeMeter",
  "TimeValue",
  "SoundMeter",
  "SoundValue",
  "BondMeter",
  "BondValue",
  "GameSettingsButton",
  "RouteRail",
  "SceneEyebrow",
  "SceneTitle",
  "StoryCopy",
  "DialogueList",
  "MemoryTray",
  "HistoryNoteButton",
  "ChoiceList",
  "InventoryList",
  "SaveStatus",
  "EndingScreen",
  "EndingKicker",
  "EndingTitle",
  "EndingCopy",
  "EndingSummary",
  "RestartButton",
  "EndingArchiveButton",
  "ArchiveDialog",
  "ArchiveContent",
  "ArchiveCloseButton",
  "SettingsDialog",
  "MotionToggle",
  "ContrastToggle",
  "TextSizeSelect",
  "SettingsCloseButton",
  "Toast",
  "LiveRegion",
];
const htmlIds = [...html.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]);
AssertUnique(htmlIds, "HTML IDs");
for (const requiredId of requiredIds) {
  assert.ok(htmlIds.includes(requiredId), `index.html is missing #${requiredId}`);
}

assert.match(html, /lang="zh-CN"/, "document language must be Chinese");
assert.match(html, /<meta name="viewport"/, "mobile viewport is required");
assert.match(html, /Script_Game\.mjs\?v=\d+/, "game module needs a cache-bust");
assert.match(html, /Style_Game\.css\?v=\d+/, "game stylesheet needs a cache-bust");
assert.doesNotMatch(html, /<script[^>]+src="https?:/i, "runtime must not use external scripts");
assert.doesNotMatch(html, /<link[^>]+href="https?:[^"]+\.css/i, "runtime must not use external CSS");
assert.doesNotMatch(
  `${html}\n${css}`,
  /Texture_TitleField|url\(\s*["']?https?:/i,
  "page must not reference a missing or remote title image",
);

const relativeReferences = [
  ...html.matchAll(/(?:src|href)="\.\/([^"#?]+)(?:\?[^"]*)?"/g),
].map((match) => match[1]);
for (const relativePath of relativeReferences) {
  assert.ok(
    fs.existsSync(path.join(scriptDirectory, relativePath)),
    `missing local page dependency ${relativePath}`,
  );
}

const combinedNarrative = `${storySource}\n${html}`;
assert.doesNotMatch(
  combinedNarrative,
  /铅字|字匣|typeCase|晋察冀辽县|五一大扫荡|春水也只到大人膝下/,
  "historically risky wording returned",
);
assert.doesNotMatch(
  combinedNarrative,
  /青霉素|输液袋|击杀得分|儿童兵|小八路/,
  "anachronistic or militarizing wording returned",
);
assert.doesNotMatch(
  combinedNarrative,
  /纸上有家|人先过河|名字才有地方抵达|路越走越短|走完的路不会替历史作证|把名字交给她|人、名、路、家|“人”“名”“路”“家”/,
  "discarded slogan-like copy returned",
);
assert.match(storySource, /钢板[^。\n]*铁笔|铁笔[^。\n]*蜡纸/, "mimeograph method must stay explicit");
assert.match(historySource, /1942年9月18日/, "county rename date must remain explicit");
assert.match(historySource, /不是冀中平原/, "regional distinction must remain explicit");

assert.doesNotMatch(
  `${gameSource}\n${storySource}\n${historySource}`,
  /\bfunction\s+[a-z][A-Za-z0-9_]*/,
  "project-owned named functions must use PascalCase",
);
assert.equal(
  (css.match(/{/g) || []).length,
  (css.match(/}/g) || []).length,
  "CSS braces must balance",
);

console.log(
  `TaihangLetters1942 smoke test passed: ${StoryScenes.length} scenes, ` +
    `${exploration.journeys} sampled journeys, ${exploration.transitions} transitions, ` +
    `${exploration.reachedEndings.size} endings, ${HistoricalSources.length} sources.`,
);
