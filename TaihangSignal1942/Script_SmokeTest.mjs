import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  contentNotice,
  gameConfig,
  historicalSources,
  historicalTerms,
} from "./Data_History.mjs";
import {
  chapters,
  evacueeNames,
  rememberedConsequences,
} from "./Data_Story.mjs";
import {
  CanTriggerChapterAction,
  CreateInitialState,
  GetObservedCount,
  NormalizeState,
  SelectChoice,
} from "./Script_Game.mjs";

const currentDirectory = dirname(fileURLToPath(import.meta.url));

function TestHistoricalContract() {
  assert.equal(gameConfig.id, "TaihangSignal1942");
  assert.equal(gameConfig.saveKey, "TaihangSignal1942_Save_V1");
  assert.match(gameConfig.historyBoundary, /虚构/);
  assert.match(gameConfig.historyBoundary, /1942年5月/);
  assert.match(gameConfig.historyBoundary, /5月25日左权/);
  assert.match(gameConfig.historyBoundary, /不可改写/);
  assert.match(gameConfig.respectNote, /没有歼敌数/);
  assert.match(contentNotice.responsibility, /侵略者负全部责任/);
  assert.match(contentNotice.responsibility, /不针对今天的日本人民/);
  assert.ok(historicalSources.length >= 6);
  assert.ok(historicalSources.every((source) => /^https?:\/\//.test(source.url)));
  assert.ok(historicalSources.some((source) => /有线电话网/.test(source.title)));
  assert.ok(historicalSources.some((source) => /左权/.test(source.title)));
  assert.ok(historicalTerms.some((item) => /磁石式有线电话/.test(item.term)));
  assert.ok(historicalTerms.some((item) => item.term === "辽县" && /左权县/.test(item.definition)));
}

function TestStoryStructure() {
  assert.equal(chapters.length, 7);
  assert.deepEqual(
    chapters.map((chapter) => chapter.id),
    ["Connect", "Dust", "Names", "Repair", "Encirclement", "RollCall", "StillConnected"],
  );
  assert.deepEqual(
    chapters.map((chapter) => chapter.order),
    [0, 1, 2, 3, 4, 5, 6],
  );
  assert.ok(chapters.every((chapter) => chapter.date.startsWith("1942年5月")));
  assert.ok(chapters.every((chapter) => chapter.title && chapter.objective && chapter.historyNote && chapter.viewLabel));
  assert.ok(chapters.every((chapter) => chapter.palette?.skyTop && chapter.palette?.near && chapter.palette?.accent));

  const allClueIds = [];
  chapters.forEach((chapter) => {
    const clueIds = chapter.clues.map((clue) => clue.id);
    assert.equal(new Set(clueIds).size, clueIds.length, `${chapter.id}: duplicate clue id`);
    assert.ok(chapter.requiredClues.every((clueId) => clueIds.includes(clueId)), `${chapter.id}: required clue missing`);
    chapter.clues.forEach((clue) => {
      assert.ok(clue.x >= 0 && clue.x <= 1 && clue.y >= 0 && clue.y <= 1, `${clue.id}: invalid position`);
      assert.ok(clue.label && clue.hint && clue.detail && clue.kind);
      allClueIds.push(`${chapter.id}:${clue.id}`);
    });
    if (chapter.choice) {
      assert.equal(chapter.choice.options.length, 2, `${chapter.id}: choice must expose two legible costs`);
      assert.ok(chapter.choice.options.every((option) => option.title && option.cost && option.detail));
      assert.ok(chapter.choice.options.every((option) => chapter.choiceDialogue?.[option.id]?.length >= 2));
    }
  });
  assert.equal(new Set(allClueIds).size, allClueIds.length);
  assert.equal(chapters[5].rollCall, true);
  assert.match(chapters[5].intro.at(-1)[1], /线路里只报编号/);
  assert.doesNotMatch(JSON.stringify(chapters.slice(0, 6)), /全到/);
  assert.equal(chapters[6].dialogue[2][1], "乙村六十七号，全到。东西丢了些，人都在。");
  assert.equal(chapters[6].dialogue.at(-3)[1], "我也在。");
  assert.match(chapters[6].dialogue.at(-1)[1], /杏树没有碑/);
  assert.doesNotMatch(JSON.stringify(chapters), /无月|接头发热|测试火花|被踩断的铜线/);

  const dialogueOnly = chapters.flatMap((chapter) => [
    ...(chapter.intro || []),
    ...(chapter.dialogue || []),
    ...Object.values(chapter.choiceDialogue || {}).flat(),
  ]).map((line) => line[1]).join("\n");
  assert.doesNotMatch(dialogueOnly, /左权说|左权：|冈村宁次说/);
  assert.doesNotMatch(dialogueOnly, /解放军|五星红旗|步话机|耳麦/);
  assert.doesNotMatch(dialogueOnly, /五一大扫荡/);
  assert.doesNotMatch(
    chapters.slice(0, 6).flatMap((chapter) => [
      ...(chapter.intro || []),
      ...(chapter.dialogue || []),
      ...Object.values(chapter.choiceDialogue || {}).flat(),
    ]).filter(([speaker]) => ["He", "Liang"].includes(speaker)).map((line) => line[1]).join("\n"),
    /风口梁|青石峪|石板桥|槐树坪|北山口|卫生所|守田|何先生/,
  );
}

function TestNamesAndConsequences() {
  assert.equal(evacueeNames.length, 67);
  assert.deepEqual(evacueeNames.map((person) => person.number), Array.from({ length: 67 }, (_, index) => index + 1));
  assert.equal(new Set(evacueeNames.map((person) => person.id)).size, 67);
  assert.equal(new Set(evacueeNames.map((person) => person.name)).size, 67);
  assert.ok(evacueeNames.every((person) => person.name && Number.isInteger(person.age) && person.age >= 0));
  assert.deepEqual(
    Object.keys(rememberedConsequences),
    ["Medicine", "Seed", "River", "StoneRoad", "Listen", "Cut"],
  );
  assert.ok(Object.values(rememberedConsequences).every((item) => item.label && item.ledger && item.epilogue));
}

function TestPureStateFlow() {
  const state = CreateInitialState();
  assert.equal(state.chapterIndex, 0);
  assert.equal(state.stage, "intro");
  assert.equal(GetObservedCount(state, chapters[0]), 0);
  assert.equal(CanTriggerChapterAction(state, chapters[0]), false);
  state.stage = "explore";
  state.observed.Connect = [...chapters[0].requiredClues];
  assert.equal(GetObservedCount(state, chapters[0]), 3);
  assert.equal(CanTriggerChapterAction(state, chapters[0]), true);

  const brokenState = NormalizeState({
    saveVersion: gameConfig.saveVersion,
    chapterIndex: 999,
    stage: "unknown",
    zoom: 9,
    viewOffset: -9,
    transcript: "not-an-array",
  });
  assert.equal(brokenState.chapterIndex, chapters.length - 1);
  assert.equal(brokenState.stage, "intro");
  assert.equal(brokenState.zoom, 1.35);
  assert.equal(brokenState.viewOffset, -0.16);
  assert.deepEqual(brokenState.transcript, []);

  const transitionState = NormalizeState({
    ...CreateInitialState(),
    chapterIndex: 1,
    stage: "transition",
    completedChapters: ["Connect", "Dust"],
  });
  assert.equal(transitionState.chapterIndex, 2);
  assert.equal(transitionState.stage, "intro");

  const choiceState = CreateInitialState();
  choiceState.chapterIndex = 2;
  choiceState.stage = "choice";
  const choiceResult = SelectChoice(choiceState, "Medicine");
  assert.equal(choiceResult.valid, true);
  assert.equal(choiceState.choices.SupplyChoice, "Medicine");
  assert.equal(choiceState.stage, "choiceDialogue");
  assert.equal(SelectChoice(choiceState, "Unknown").valid, false);
}

function TestStaticPageContract() {
  const html = readFileSync(join(currentDirectory, "index.html"), "utf8");
  const css = readFileSync(join(currentDirectory, "Style_Game.css"), "utf8");
  const gameScript = readFileSync(join(currentDirectory, "Script_Game.mjs"), "utf8");
  assert.match(html, /lang="zh-CN"/);
  assert.match(html, /viewport-fit=cover/);
  assert.match(html, /山那边，线还通着/);
  assert.match(html, /原创历史虚构叙事/);
  assert.match(html, /约 20 分钟/);
  assert.doesNotMatch(html, /Texture_SocialCard\.png/);
  assert.match(html, /Script_Game\.mjs\?v=1/);
  assert.match(html, /Style_Game\.css\?v=1/);
  assert.match(html, /aria-live="polite"/);
  assert.match(html, /aria-label="打开记事簿"/);
  assert.match(html, /data-open-modal="history"/);
  assert.match(html, /无血腥画面/);
  assert.match(html, /本作批判日本军国主义与侵略战争/);
  assert.doesNotMatch(html, /https:\/\/cdnjs|unpkg|jsdelivr|three\.js/);

  assert.match(css, /@media \(max-width: 540px\)/);
  assert.match(css, /orientation: landscape/);
  assert.match(css, /@media \(pointer: coarse\)/);
  assert.match(css, /prefers-reduced-motion/);
  assert.match(css, /safe-area-inset-bottom/);
  assert.match(css, /focus-visible/);

  assert.match(gameScript, /localStorage/);
  assert.match(gameScript, /requestAnimationFrame/);
  assert.match(gameScript, /pointerdown/);
  assert.match(gameScript, /visibilitychange/);
  assert.match(gameScript, /const stepDelay = 2000/);
  assert.match(gameScript, /activeModal \|\| document\.hidden \|\| gameState\.rollCallPaused/);
  assert.match(
    gameScript,
    /gameState\.rollCallIndex = Math\.min\(63, gameState\.rollCallIndex \+ 1\);\s*RenderRollCallLine\(\);\s*SaveGame\(\);/,
  );
  assert.match(html, /id="rollCallModeButton"/);
  assert.match(gameScript, /AudioContext/);
  assert.match(gameScript, /if \(typeof window !== "undefined"/);

  const referencedElementIds = [...new Set(
    [...gameScript.matchAll(/element\.([A-Za-z][A-Za-z0-9]*)/g)].map((match) => match[1]),
  )];
  referencedElementIds.forEach((id) => {
    assert.match(html, new RegExp(`id="${id}"`), `Script references missing DOM id: ${id}`);
  });

  const localAssets = [...html.matchAll(/(?:href|src)="\.\/([^"?]+)(?:\?[^"]*)?"/g)].map((match) => match[1]);
  localAssets.forEach((assetPath) => {
    assert.equal(existsSync(join(currentDirectory, assetPath)), true, `Missing local page asset: ${assetPath}`);
  });
}

function RunSmokeTest() {
  TestHistoricalContract();
  TestStoryStructure();
  TestNamesAndConsequences();
  TestPureStateFlow();
  TestStaticPageContract();
  console.log("TaihangSignal1942 smoke test passed.");
  console.log(`Validated ${chapters.length} chapters, ${evacueeNames.length} fictional names, ${historicalSources.length} historical sources, and ${Object.keys(rememberedConsequences).length} visible consequences.`);
}

RunSmokeTest();
