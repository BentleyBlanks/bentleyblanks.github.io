import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const rootDirectory = dirname(fileURLToPath(import.meta.url));
const scriptPath = join(rootDirectory, "Script_Game.mjs");
const htmlPath = join(rootDirectory, "index.html");
const stylePath = join(rootDirectory, "Style_Game.css");
const scriptSource = readFileSync(scriptPath, "utf8");
const htmlSource = readFileSync(htmlPath, "utf8");
const styleSource = readFileSync(stylePath, "utf8");

function ReadChapterData() {
  const declaration = "const ChapterData = ";
  const start = scriptSource.indexOf(declaration);
  const end = scriptSource.indexOf("\n\nconst ui", start);
  assert.ok(start >= 0 && end > start, "ChapterData declaration must be readable");
  const literal = scriptSource.slice(start + declaration.length, end).trim().replace(/;$/, "");
  return Function(`"use strict"; return (${literal});`)();
}

function ReadEpilogueBeatData() {
  const declaration = "const EpilogueBeatData = Object.freeze(";
  const start = scriptSource.indexOf(declaration);
  const end = scriptSource.indexOf("\n\nconst gameState", start);
  assert.ok(start >= 0 && end > start, "EpilogueBeatData declaration must be readable");
  const literal = scriptSource
    .slice(start + declaration.length, end)
    .trim()
    .replace(/\)\s*;$/, "");
  return Function(`"use strict"; return (${literal});`)();
}

function ReadPrologueBeatData() {
  const declaration = "const PrologueBeatData = Object.freeze(";
  const start = scriptSource.indexOf(declaration);
  const end = scriptSource.indexOf("\n\nconst EpilogueBeatData", start);
  assert.ok(start >= 0 && end > start, "PrologueBeatData declaration must be readable");
  const literal = scriptSource
    .slice(start + declaration.length, end)
    .trim()
    .replace(/\)\s*;$/, "");
  return Function(`"use strict"; return (${literal});`)();
}

function ReadWorldTaskData() {
  const declaration = "const WorldTaskData = Object.freeze(";
  const start = scriptSource.indexOf(declaration);
  const end = scriptSource.indexOf("\n\nconst EpilogueBeatData", start);
  assert.ok(start >= 0 && end > start, "WorldTaskData declaration must be readable");
  const literal = scriptSource
    .slice(start + declaration.length, end)
    .trim()
    .replace(/\)\s*;$/, "");
  return Function(`"use strict"; return (${literal});`)();
}

function AssertReachable(chapter) {
  const reached = new Set();
  let changed = true;
  while (changed) {
    changed = false;
    chapter.interactions.forEach((action) => {
      if (reached.has(action.id)) return;
      if ((action.requires || []).every((id) => reached.has(id))) {
        reached.add(action.id);
        changed = true;
      }
    });
  }
  assert.equal(reached.size, chapter.interactions.length, `${chapter.title} must have a reachable interaction graph`);
}

function AssertOrderedChain(chapter, actionIds, label) {
  const actionIndexes = new Map(chapter.interactions.map((action, index) => [action.id, index]));
  actionIds.forEach((actionId) => assert.ok(actionIndexes.has(actionId), `${label} is missing ${actionId}`));
  for (let index = 1; index < actionIds.length; index += 1) {
    assert.ok(
      actionIndexes.get(actionIds[index - 1]) < actionIndexes.get(actionIds[index]),
      `${label} must keep ${actionIds[index - 1]} before ${actionIds[index]}`
    );
  }
}

function ReadFunctionSource(functionName) {
  const declaration = `function ${functionName}(`;
  const start = scriptSource.indexOf(declaration);
  assert.ok(start >= 0, `${functionName} runtime hook must exist`);
  const nextFunction = scriptSource.indexOf("\n}\n\nfunction ", start);
  assert.ok(nextFunction > start, `${functionName} source must have a readable boundary`);
  return scriptSource.slice(start, nextFunction + 2);
}

function AssertCausalShot(action, label) {
  const shot = action.causalShot;
  assert.ok(shot && typeof shot === "object", `${label} must declare a foreground/background causal shot`);
  assert.ok(typeof shot.foreground === "string" && shot.foreground.length > 0, `${label} causal shot needs a foreground cue`);
  assert.ok(typeof shot.background === "string" && shot.background.length > 0, `${label} causal shot needs a background consequence`);
  assert.notEqual(shot.foreground, shot.background, `${label} foreground action and background consequence must remain distinct`);
  assert.ok(Number.isFinite(shot.targetX) && Math.abs(shot.targetX) <= 12.7, `${label} causal shot target must remain inside the stage`);
  assert.ok(Number.isFinite(shot.duration) && shot.duration >= 700 && shot.duration <= 5000, `${label} causal shot needs a readable cinematic duration`);
}

const chapters = ReadChapterData();
assert.equal(chapters.length, 6, "campaign must contain six chapters");
assert.deepEqual(
  chapters.map((chapter) => chapter.interactions.length),
  [8, 8, 8, 13, 12, 18],
  "Round10 must replace chapter four's five-step decoy fetch chain with one authored configuration task"
);
assert.deepEqual(
  chapters.map((chapter) => chapter.act),
  [
    "第一幕 · 钟声与教训",
    "第一幕 · 钟声与教训",
    "第二幕 · 从藏身到战斗",
    "第二幕 · 从藏身到战斗",
    "第三幕 · 高家庄到黑风口",
    "第三幕 · 高家庄到黑风口"
  ],
  "campaign must keep a two-chapter / two-chapter / two-chapter dramatic structure"
);
assert.deepEqual(
  chapters.map((chapter) => chapter.title),
  ["钟楼下的脚印", "藏身洞不能打仗", "从藏身洞到战斗地道", "翻口里的特务", "高家庄保卫战", "从西平到黑风口"],
  "the six chapters must follow the film campaign from the failed raid to the Black Wind stronghold counterattack"
);
const filmCampaignText = chapters.map((chapter) => JSON.stringify(chapter)).join("\n");
for (const requiredBeat of ["高老忠", "黑风口", "藏身洞", "战斗地道", "特务", "山田", "高家庄", "西平", "围点打援", "八路军主力"]) {
  assert.ok(filmCampaignText.includes(requiredBeat), `film-aligned campaign beat is missing: ${requiredBeat}`);
}

const prologueBeats = ReadPrologueBeatData();
assert.deepEqual(
  prologueBeats.map((beat) => beat.id),
  ["preface", "infiltration", "alarm", "sacrifice", "evacuate", "seal", "search", "aftermath"],
  "the two-minute prologue must preserve the opening raid's eight event beats"
);
assert.equal(prologueBeats.length, 8, "the playable prologue must contain eight ordered beats");
assert.equal(prologueBeats[2].actionX, -7.35, "the alarm beat must be enacted at Gao Laozhong's bell");
assert.match(JSON.stringify(prologueBeats), /往后的形势只会更加困难/, "the user-approved key line must remain in the aftermath");
const beginPrologueBeatSource = ReadFunctionSource("BeginPrologueBeat");
const updatePrologueSource = ReadFunctionSource("UpdatePrologue");
const finishPrologueSource = ReadFunctionSource("FinishPrologue");
const updateCameraSource = ReadFunctionSource("UpdateCamera");
const renderLoopSource = ReadFunctionSource("RenderLoop");
assert.match(beginPrologueBeatSource, /sacrificeGunPlayed\s*=\s*false/, "the sacrifice beat must arm its gunshot only once");
assert.match(updatePrologueSource, /!prologue\.sacrificeGunPlayed/, "the sacrifice gunshot must be guarded against duplicate playback");
assert.match(updatePrologueSource, /BeginPrologueBeat\(1\)[\s\S]*BeginPrologueBeat\(2\)[\s\S]*BeginPrologueBeat\(4\)[\s\S]*BeginPrologueBeat\(5\)[\s\S]*BeginPrologueBeat\(6\)[\s\S]*BeginPrologueBeat\(7\)/, "the automatic prologue beats must advance in order around the three player actions");
assert.match(finishPrologueSource, /StartGame\(0, false\)/, "the prologue must flow directly into chapter one");
for (const cameraField of ["cameraX", "cameraY", "zoom"]) {
  assert.ok(updateCameraSource.includes(`prologue.${cameraField}`), `the prologue camera must author ${cameraField}`);
}
assert.match(renderLoopSource, /gameState\.prologue[\s\S]*UpdatePrologue/, "the live render loop must run the dedicated prologue sequence");
assert.match(scriptSource, /StartPrologue:\s*\(\)\s*=>\s*StartPrologue\(\)/, "browser QA must be able to launch the playable prologue");
assert.match(scriptSource, /QaPrologueBeatId[\s\S]{0,160}prologueBeat/, "browser QA must be able to initialize a reviewed prologue beat without changing production flow");
assert.match(scriptSource, /QaPrologueAutoAction[\s\S]{0,160}prologueAutoAction/, "browser QA must be able to capture authored transition frames from a real interaction");
assert.match(scriptSource, /prologueBeatIndex:/, "browser QA must expose the current prologue beat index");

const campaignIds = new Set();
chapters.forEach((chapter, chapterIndex) => {
  assert.ok(chapter.title && chapter.number && chapter.location, `chapter ${chapterIndex + 1} metadata must be complete`);
  assert.ok(Array.isArray(chapter.intro) && chapter.intro.length > 0, `${chapter.title} needs an intro`);
  assert.ok(Array.isArray(chapter.outro) && chapter.outro.length > 0, `${chapter.title} needs an outro`);
  assert.ok(Array.isArray(chapter.objectives) && chapter.objectives.length >= 3, `${chapter.title} needs paced objectives`);
  assert.ok(Array.isArray(chapter.interactions) && chapter.interactions.length >= 5, `${chapter.title} needs a playable chain`);

  const chapterIds = new Set(chapter.interactions.map((action) => action.id));
  assert.equal(chapterIds.size, chapter.interactions.length, `${chapter.title} interaction ids must be unique`);
  chapter.interactions.forEach((action) => {
    assert.ok(!campaignIds.has(action.id), `campaign interaction id ${action.id} must be globally unique`);
    campaignIds.add(action.id);
    assert.ok(action.layer === "surface" || action.layer === "tunnel", `${action.id} must use a valid layer`);
    assert.ok(Number.isFinite(action.x) && Math.abs(action.x) <= 12.7, `${action.id} must remain inside the stage`);
    (action.requires || []).forEach((requiredId) => assert.ok(chapterIds.has(requiredId), `${action.id} requires missing ${requiredId}`));
  });
  chapter.objectives.flatMap((objective) => objective.ids).forEach((id) => {
    assert.ok(chapterIds.has(id), `${chapter.title} objective references missing ${id}`);
  });
  AssertReachable(chapter);
});

AssertOrderedChain(
  chapters[0],
  ["surveyChange", "hugEmbankment", "dropIntoDitch", "openSluice", "washWheelRuts", "liftXiaoman", "findCulvert", "reachCellar"],
  "chapter one embankment-to-culvert stealth chain"
);
assert.ok(Array.isArray(chapters[0].coverZones) && chapters[0].coverZones.length >= 3, "chapter one must provide physical searchlight cover");
for (const actionId of ["hugEmbankment", "dropIntoDitch"]) {
  const action = chapters[0].interactions.find((candidate) => candidate.id === actionId);
  assert.equal(action.autoWhenCrouched, true, `${actionId} must resolve through spatial crouched traversal`);
  assert.ok(action.crouchPath, `${actionId} must require the whole exposed segment to stay low`);
}

AssertOrderedChain(
  chapters[1],
  ["eraseTracks", "watchSearchTurn", "closeVent", "turnMill", "pickMedicine", "crossMedicineCover", "hideMedicine", "knockClear"],
  "chapter two search-and-construction-tools chain"
);
const chapterTwoActions = new Map(chapters[1].interactions.map((action) => [action.id, action]));
assert.equal(chapters[1].threatMode, "patrol", "the morning search must use a visible patrol instead of a literal searchlight");
assert.equal(chapterTwoActions.get("turnMill").noiseCover, 16, "the mill must create a sixteen-second noise-cover window");
assert.equal(chapterTwoActions.get("turnMill").repeatUntil, "hideMedicine", "the mill must be repeatable until the construction tools are hidden");
assert.equal(chapterTwoActions.get("pickMedicine").pickupKind, "medicine", "the wrapped construction-tool bundle must become a carried world prop");
assert.equal(chapterTwoActions.get("pickMedicine").requiresNoiseCover, true, "picking up the tool bundle must require the mill sound window");
assert.equal(chapterTwoActions.get("crossMedicineCover").requiresNoiseCover, true, "crossing between physical covers must keep the mill sound window");
assert.equal(chapterTwoActions.get("crossMedicineCover").autoWhenCrouched, true, "the middle cover must complete through crouched spatial traversal");
assert.ok(chapterTwoActions.get("crossMedicineCover").crouchPath, "the medicine crossing must validate the whole exposed segment, not only its endpoint");
assert.equal(chapterTwoActions.get("hideMedicine").requiresHeld, "medicine", "hiding the tool bundle must require the carried parcel");
assert.equal(chapterTwoActions.get("hideMedicine").requiresNoiseCover, true, "placing the tool bundle must still sit inside the mill sound window");
assert.equal(chapterTwoActions.get("hideMedicine").consumeHeld, true, "placing the tool bundle must clear the carried parcel");
assert.ok(Array.isArray(chapters[1].coverZones) && chapters[1].coverZones.length >= 3, "chapter two must provide foreground search cover");
assert.equal(chapters[1].medicineCoverZones?.length, 3, "the carried-tool route must use three authored physical cover zones");
const mobileCover = chapterTwoActions.get("crossMedicineCover").mobileCover;
assert.ok(mobileCover, "the tool crossing must use a moving firewood-cart cover instead of only static zones");
assert.equal(mobileCover.kind, "firewoodCart", "the moving cover must remain an ordinary village firewood cart");
assert.ok(Array.isArray(mobileCover.stops) && mobileCover.stops.length >= 3, "the firewood cart must expose at least three readable stopping points");
mobileCover.stops.forEach((stopX, index) => {
  assert.ok(Number.isFinite(stopX) && Math.abs(stopX) <= 12.7, `firewood-cart stop ${index + 1} must remain inside the stage`);
  if (index > 0) assert.ok(stopX < mobileCover.stops[index - 1], "the firewood cart must advance from the tool pickup toward the stove");
});
assert.ok(mobileCover.coverHalfWidth >= .65 && mobileCover.coverHalfWidth <= 1.8, "the cart shadow must be a bounded physical occluder, not global invisibility");
assert.equal(mobileCover.noiseAction, "turnMill", "the cart may advance only inside the authored mill-sound window");
assert.equal(mobileCover.recovery, "lastStop", "detection must return the cart and player to the latest occupied stopping point");

AssertOrderedChain(
  chapters[2],
  ["carryTimber", "braceBase", "stabilizeWetBand", "ventRoute", "airflowTest"],
  "chapter three reversible wet-band works chain"
);
const chapterThreeActions = new Map(chapters[2].interactions.map((action) => [action.id, action]));
assert.ok(chapterThreeActions.has("stabilizeWetBand"), "chapter three must expose the reversible stabilizeWetBand field task");
assert.ok(chapterThreeActions.get("stabilizeWetBand").requires.includes("braceBase"), "wet-band work must follow the permanent old-door brace");
for (const staleActionId of ["fetchWetFrames", "setWetFrame", "takeDrainSpade", "cutLowDrain", "carryTreads", "layRaisedTreads"]) {
  assert.equal(chapterThreeActions.has(staleActionId), false, `${staleActionId} must be absorbed into stabilizeWetBand instead of remaining a linear fetch step`);
}

AssertOrderedChain(
  chapters[3],
  ["shadowSteps", "confrontWenju", "chooseDecoySite", "cutDecoy", "arrangeDecoyTraces", "rehearDecoy", "verifyDecoy", "sealDecoyRoot", "deliverMedicine", "witnessWenjuReturn"],
  "chapter four physical decoy-and-farewell chain"
);
const chapterFourActions = new Map(chapters[3].interactions.map((action) => [action.id, action]));
for (const staleActionId of ["takeOldRope", "setRopeTrace", "loosenGranaryBoard", "takeReedVent", "openGranaryVent"]) {
  assert.equal(chapterFourActions.has(staleActionId), false, `${staleActionId} must be absorbed into arrangeDecoyTraces instead of remaining a linear fetch step`);
}
assert.ok(chapterFourActions.has("arrangeDecoyTraces"), "chapter four must expose the reversible three-trace arrangement task");
assert.ok(chapterFourActions.get("arrangeDecoyTraces").requires.includes("cutDecoy"), "the three decoy traces must be arranged only after the blind tunnel is cut");
assert.ok(chapterFourActions.get("rehearDecoy").requires.includes("arrangeDecoyTraces"), "the underground rehearing must depend on the completed three-trace arrangement");
AssertCausalShot(chapterFourActions.get("verifyDecoy"), "verifyDecoy");

AssertOrderedChain(
  chapters[4],
  ["readBlockade", "openSmokeVent", "guideStretcher", "handoffStretcherWest", "handoffStretcherEast", "guideEast", "callZhao", "confirmAll", "sealBranch"],
  "chapter five smoke-and-stretcher crisis chain"
);
const chapterFiveActions = new Map(chapters[4].interactions.map((action) => [action.id, action]));
assert.equal(chapterFiveActions.get("readBlockade").startsSmoke, true, "the northern-kiln smoke line must start in world space");
assert.equal(chapterFiveActions.get("guideWest").dialogue[0][0], "赵平原", "the west-yard evacuation order must be owned by Zhao Pingyuan");
assert.match(chapterFiveActions.get("guideWest").dialogue[0][1], /群众不齐不关门/, "the defense must keep evacuation ahead of closing the fighting tunnel");
assert.equal(chapterFiveActions.get("openSmokeVent").smokeRelief, undefined, "the wet mat may slow new leakage but must not remove smoke already in the tunnel");
assert.equal(chapterFiveActions.get("handoffStretcherWest").smokeRelief, undefined, "a shoulder handoff must move the stretcher, not reduce smoke");
assert.equal(chapterFiveActions.get("handoffStretcherEast").smokeRelief, undefined, "the second shoulder handoff must not teach that carrying clears smoke");
assert.equal(chapterFiveActions.get("sealBranch").smokeRelief, undefined, "the final wedge must stop new leakage without deleting smoke already inside");
const chapterHazardSource = ReadFunctionSource("UpdateChapterHazards");
assert.match(chapterHazardSource, /branchSealed[\s\S]*smokePressure\s*=\s*Math\.max\(0,\s*gameState\.smokePressure\s*-/, "sealed smoke must visibly decay instead of vanishing in one frame");
assert.match(chapterHazardSource, /smokeVisible[\s\S]*smokePressure\s*>\s*\.015/, "the smoke layer must remain visible after sealing until old smoke has faded");
for (const actionId of ["callZhao", "listenStone", "callXiaoman"]) {
  assert.ok(chapterFiveActions.has(actionId), `chapter five must retain the named listening point ${actionId}`);
  assert.ok(chapterFiveActions.get("confirmAll").requires.includes(actionId), `the ledger must wait for ${actionId}`);
}

AssertOrderedChain(
  chapters[5],
  ["extendElmRoute", "braceMulberryBreak", "openReedBypass", "waitElmTail", "returnSignal"],
  "chapter six village-network-to-Black-Wind counterattack chain"
);
const chapterSixActions = new Map(chapters[5].interactions.map((action) => [action.id, action]));
const tailSignalActionIds = ["waitElmTail", "hearMulberryGap", "confirmReedTail"];
for (const actionId of tailSignalActionIds) {
  assert.ok(chapterSixActions.has(actionId), `chapter six must retain the final echo point ${actionId}`);
  assert.ok(chapterSixActions.get("returnSignal").requires.includes(actionId), `the final partition must wait for ${actionId}`);
  AssertCausalShot(chapterSixActions.get(actionId), actionId);
}
AssertCausalShot(chapterSixActions.get("returnSignal"), "returnSignal");
assert.equal(
  new Set(tailSignalActionIds.map((actionId) => chapterSixActions.get(actionId).causalShot.background)).size,
  tailSignalActionIds.length,
  "each tail signal must reveal a different background team's consequence"
);
assert.match(chapterSixActions.get("extendElmRoute").name, /高家庄.*庄稼地/, "chapter six must visibly extend the village tunnel into the fields");
assert.match(chapterSixActions.get("braceMulberryBreak").name, /邻村交通口/, "chapter six must connect the neighboring-village relay");
assert.match(chapterSixActions.get("openReedBypass").name, /西平.*黑风口/, "chapter six must open the field route between Xiping and Black Wind Pass");
assert.match(chapters[5].location, /高家庄.*西平.*黑风口/, "the finale must span the film's village, relief-point, and stronghold geography");
assert.match(chapterSixActions.get("openReedBypass").caption, /高家庄、野外出口与邻村交通口/, "the network route must join the three human-relay nodes");
assert.match(chapters[5].quote, /高家庄民兵.*八路军主力.*游击队/, "the ending must join the three forces that attack Black Wind Pass");
assert.doesNotMatch(chapters[5].quote, /成熟地道网|没有被写成|胜利没有抹去/, "the ending must not speak in a modern authorial review voice");

const worldTasks = ReadWorldTaskData();
const worldTaskInteractionRadius = .7;
const worldTaskMinimumSpacing = 1.45;
const stageLimitMatch = scriptSource.match(/^const StageLimit = ([0-9.]+);$/m);
assert.ok(stageLimitMatch, "StageLimit must remain readable for world-task boundary checks");
const stageLimit = Number(stageLimitMatch[1]);
const campaignActions = new Map(chapters.flatMap((chapter) => chapter.interactions.map((action) => [action.id, action])));
const requiredWorldTaskIds = [
  "airflowTest",
  "arrangeDecoyTraces",
  "chooseDecoySite",
  "eraseTracks",
  "guideEast",
  "guideWest",
  "handoffStretcherEast",
  "handoffStretcherWest",
  "openPrisonCart",
  "openSmokeVent",
  "relayElm",
  "relayMulberry",
  "relayReed",
  "returnSignal",
  "shadowSteps",
  "stabilizeWetBand",
  "turnMill",
  "verifyDecoy"
];
requiredWorldTaskIds.forEach((taskId) => assert.ok(worldTasks[taskId], `${taskId} must run as an authored world-space task`));
assert.deepEqual(
  Object.keys(worldTasks).sort(),
  requiredWorldTaskIds.slice().sort(),
  "all eighteen core puzzles must run directly in world space"
);
for (const [taskId, task] of Object.entries(worldTasks)) {
  assert.ok(["stations", "holdSequence", "configuration", "evidence", "placement"].includes(task.type), `${taskId} must use a world-space interaction`);
  const steps = task.type === "holdSequence" ? task.pulses
    : task.type === "evidence" ? [...task.listens, ...task.choices]
      : task.type === "placement" ? task.pieces
        : task.nodes;
  assert.ok(Array.isArray(steps) && steps.length >= 3, `${taskId} must expose at least three readable physical beats`);
}

const freeMarkerTasks = Object.entries(worldTasks).filter(([, task]) => ["configuration", "placement", "evidence"].includes(task.type));
for (const [taskId, task] of freeMarkerTasks) {
  const action = campaignActions.get(taskId);
  assert.ok(action && Number.isFinite(action.x), `${taskId} must map to a finite campaign action position`);
  const verifyMarker = task.verify ? [{ ...task.verify, id: "verify" }] : [];
  const allMarkers = task.type === "configuration" ? [...task.nodes, ...verifyMarker]
    : task.type === "placement" ? [...task.pieces, ...task.sockets, ...verifyMarker]
      : [...task.listens, ...task.choices];
  const markerIds = allMarkers.map((marker) => marker.id);
  assert.equal(new Set(markerIds).size, markerIds.length, `${taskId} free-marker ids must be unique`);
  allMarkers.forEach((marker) => {
    assert.ok(Number.isFinite(marker.xOffset), `${taskId}/${marker.id} must declare a finite xOffset`);
  });

  const visiblePhases = task.type === "configuration" || task.type === "placement"
    ? [["all", allMarkers]]
    : task.listens.length > 0
      ? [["listen", task.listens], ["choice", task.choices]]
      : [["choice", task.choices]];
  visiblePhases.forEach(([phaseName, markers]) => {
    const sortedMarkers = markers.slice().sort((left, right) => left.xOffset - right.xOffset);
    for (let markerIndex = 1; markerIndex < sortedMarkers.length; markerIndex += 1) {
      const leftMarker = sortedMarkers[markerIndex - 1];
      const rightMarker = sortedMarkers[markerIndex];
      const spacing = rightMarker.xOffset - leftMarker.xOffset;
      assert.ok(
        spacing >= worldTaskMinimumSpacing - 1e-9,
        `${taskId}/${phaseName} ${leftMarker.id}->${rightMarker.id} spacing ${spacing} must be at least ${worldTaskMinimumSpacing}`
      );
    }
  });

  const furthestOffset = Math.max(...allMarkers.map((marker) => Math.abs(marker.xOffset)));
  const maxDistance = Number(task.maxDistance) || 1.75;
  assert.ok(
    maxDistance >= furthestOffset + worldTaskInteractionRadius - 1e-9,
    `${taskId} maxDistance ${maxDistance} must cover offset ${furthestOffset} plus interaction radius ${worldTaskInteractionRadius}`
  );
  allMarkers.forEach((marker) => {
    const absoluteX = action.x + marker.xOffset;
    assert.ok(
      Math.abs(absoluteX) + worldTaskInteractionRadius <= stageLimit + 1e-9,
      `${taskId}/${marker.id} at ${absoluteX} must keep its full interaction radius inside StageLimit ${stageLimit}`
    );
  });
}
assert.equal(worldTasks.eraseTracks.type, "configuration", "restoring the yard must be an adjustable trace configuration, not a one-button cleanup");
assert.deepEqual(
  worldTasks.eraseTracks.nodes.map((node) => node.id),
  ["waterTrace", "hoofTrace", "childTrace"],
  "yard camouflage must reconstruct water, hoof, and child traces as three distinct physical states"
);
worldTasks.eraseTracks.nodes.forEach((node) => {
  assert.ok(Array.isArray(node.options) && node.options.length >= 2, `${node.id} must expose at least two repeatable physical states`);
  assert.ok(node.options.some((option) => option.id === node.initial), `${node.id} initial state must be one of its authored options`);
  assert.ok(node.options.some((option) => option.id === node.correct), `${node.id} correct state must be one of its authored options`);
  assert.notEqual(node.initial, node.correct, `${node.id} must require an actual adjustment before the yard can pass inspection`);
});
assert.ok(worldTasks.eraseTracks.verify && typeof worldTasks.eraseTracks.verify === "object", "the reconstructed yard must have a separate physical verification point");

assert.equal(worldTasks.arrangeDecoyTraces.type, "configuration", "the decoy's rope, echo, and vent must be arranged together in world space");
assert.equal(worldTasks.arrangeDecoyTraces.preserveWrongState, true, "an incorrect decoy arrangement must remain visible after a failed review");
assert.deepEqual(
  worldTasks.arrangeDecoyTraces.nodes.map((node) => node.id),
  ["rope", "echo", "vent"],
  "the decoy configuration must expose the rope wear, coin echo, and shallow vent as three distinct traces"
);
worldTasks.arrangeDecoyTraces.nodes.forEach((node) => {
  assert.ok(Array.isArray(node.options) && node.options.length >= 2, `${node.id} trace must remain physically adjustable`);
  assert.ok(node.options.some((option) => option.id === node.initial), `${node.id} trace needs a valid initial state`);
  assert.ok(node.options.some((option) => option.id === node.correct), `${node.id} trace needs a valid historically grounded target state`);
});
assert.ok(
  worldTasks.arrangeDecoyTraces.verify && typeof worldTasks.arrangeDecoyTraces.verify.success === "string",
  "the three traces must be reheard together at a separate verification point"
);

const verifyDecoyTask = worldTasks.verifyDecoy;
assert.equal(verifyDecoyTask.type, "stations", "the enemy review must be a traversed world-space stealth task, not one interaction");
assert.equal(verifyDecoyTask.nodes.length, 3, "the enemy review must have exactly three readable observation beats");
assert.deepEqual(
  verifyDecoyTask.nodes.map((node) => node.id),
  ["brokenWall", "lateralBlind", "stoveSlit"],
  "the player must follow rope wear, board echo, and stove signal in causal order"
);
assert.deepEqual(
  verifyDecoyTask.nodes.map((node) => node.layer),
  ["surface", "tunnel", "surface"],
  "the review must descend into the lateral blind tunnel and return to the surface"
);
assert.equal(verifyDecoyTask.nodes[1].requiresCrouch, true, "the lateral blind tunnel observation must require a crouched silhouette");
assert.equal(verifyDecoyTask.nodes[2].requiresCrouch, true, "the stove-slit observation must remain behind low physical cover");
assert.ok(verifyDecoyTask.nodes[1].waitDuration >= 1, "the board echo must require the player to stay low through a readable sound window");
assert.equal(verifyDecoyTask.nodes[1].waitStartSound, "knock", "the solid board strike must begin with a distinct knock before the loose metal echo");
assert.equal(verifyDecoyTask.nodes[1].sound, "metal", "the delayed loose-nail response must use a distinct material sound");
assert.ok(verifyDecoyTask.nodes[2].waitDuration >= .8, "the final slit must require a readable wait for both draft and signal");
assert.ok(
  verifyDecoyTask.nodes[2].recoveryXOffsets?.length >= 3 && verifyDecoyTask.nodes[2].recoveryCoverRadius > 0,
  "the long surface crawl must expose several bounded physical cover checkpoints"
);
for (const node of verifyDecoyTask.nodes.filter((candidate) => candidate.requiresCrouch)) {
  assert.ok(node.crouchPath && Number.isFinite(node.crouchPath.minOffset) && Number.isFinite(node.crouchPath.maxOffset), `${node.id} needs a continuous crouched approach path`);
  assert.ok(node.crouchPath.maxOffset > node.crouchPath.minOffset, `${node.id} crouch path must have positive world-space length`);
}
assert.match(
  `${verifyDecoyTask.nodes[1].caption} ${verifyDecoyTask.nodes[1].verb}`,
  /侧向厚土|厚土盲道/,
  "the middle station must use a side-cut thick-earth blind rather than supernatural hearing"
);
assert.match(verifyDecoyTask.nodes[1].caption, /不在复查者脚下/, "the protagonist must never hide directly beneath the reviewers");
assert.match(verifyDecoyTask.nodes[1].caption, /一声实响.*散响/, "the board clue must preserve the authored solid-then-loose physical sound");
assert.match(verifyDecoyTask.nodes[2].caption, /浅|发凉/, "the last station must observe only a shallow physical draft");
assert.match(verifyDecoyTask.nodes[2].caption, /便衣.*空粮棚/, "the last station must combine the shallow draft with the spy's visible turn toward the empty granary");
assert.equal(verifyDecoyTask.allowDepthTransitions, true, "the active review task must allow a real entrance-driven layer change");
assert.equal(verifyDecoyTask.localRecovery, true, "mistakes must use authored local cover recovery");
verifyDecoyTask.nodes.forEach((node) => {
  assert.ok(Number.isFinite(node.recoveryXOffset), `${node.id} needs a finite local-cover recovery point`);
  assert.equal(node.recoveryLayer, node.layer, `${node.id} recovery must stay on its own physical layer`);
});
assert.ok(
  verifyDecoyTask.maxDistance >= Math.max(...verifyDecoyTask.nodes.map((node) => Math.abs(node.xOffset))) + .82,
  "the mixed-layer task boundary must include the final station's full interaction radius"
);
assert.doesNotMatch(JSON.stringify(verifyDecoyTask), /2\.5/, "player-facing task guidance must name the disguised entrance instead of exposing internal coordinates");
const verifyDecoyAction = chapterFourActions.get("verifyDecoy");
assert.ok(verifyDecoyAction.causalShot.duration <= 1700, "the closing causal shot must be materially shorter than the former 2600 ms replay");
assert.match(verifyDecoyAction.causalShot.foreground, /废灶.*缝/, "the causal shot foreground must remain at the player's final observation slit");
assert.match(verifyDecoyAction.causalShot.background, /便衣.*粮棚/, "the causal shot background must reveal the enemy decision, not replay all three checks");
assert.equal(verifyDecoyAction.causalShot.layer, "surface", "the final review tableau must render on the same surface layer as the stove slit");
assert.equal(verifyDecoyAction.causalShot.foregroundKind, "proof", "the foreground prop must depict observation instead of a tunnel relay token");

const handleDepthSource = ReadFunctionSource("HandleDepth");
assert.match(handleDepthSource, /allowDepthTransitions/, "a mixed-layer task must opt into real entrance-driven depth changes");
const setWorldTaskNodeSource = ReadFunctionSource("SetWorldTaskNode");
assert.match(setWorldTaskNodeSource, /node\.layer/, "each sequential station must place its marker on its authored layer");
assert.match(setWorldTaskNodeSource, /task\.taskLayer/, "the active marker must remember its current station layer");
const updateMarkersSource = ReadFunctionSource("UpdateMarkers");
assert.match(updateMarkersSource, /taskLayer/, "marker visibility must follow the active station layer instead of the action's starting layer");
const advanceWorldTaskStationSource = ReadFunctionSource("AdvanceWorldTaskStation");
assert.match(advanceWorldTaskStationSource, /requiresCrouch/, "authored stealth stations must validate crouching");
assert.match(advanceWorldTaskStationSource, /RecoverWorldTaskStation/, "wrong station approach must return to local cover");
assert.match(advanceWorldTaskStationSource, /nearOutOfSequenceStation/, "ordinary distant input must not teleport the player unless they approached a station out of order");
assert.doesNotMatch(advanceWorldTaskStationSource, /ResetWorldTask/, "a station mistake must not reset the full enemy review");
const recoverWorldTaskStationSource = ReadFunctionSource("RecoverWorldTaskStation");
assert.doesNotMatch(
  recoverWorldTaskStationSource,
  /ResetWorldTask|task\.step\s*=\s*0|completed\.(?:delete|clear)|arrangeDecoyTraces/,
  "local recovery must preserve the current station and the completed decoy arrangement"
);
const updateWorldTaskSource = ReadFunctionSource("UpdateWorldTask");
assert.match(updateWorldTaskSource, /allowDepthTransitions/, "mixed-layer tasks must not reset merely because the player changed depth");
assert.match(updateWorldTaskSource, /localRecovery[\s\S]*RecoverWorldTaskStation/, "leaving the observation line must recover locally instead of wiping progress");
assert.match(updateWorldTaskSource, /crouchPath[\s\S]*insideExposedPath[\s\S]*!gameState\.keys\.crouch/, "standing anywhere along an exposed approach must trigger recovery");
assert.match(updateWorldTaskSource, /insideRecoveryCover/, "authored recovery points must remain safe cover instead of instantly retriggering exposure");
assert.match(updateWorldTaskSource, /stationWaitStart[\s\S]*waitedSeconds/, "listening stations must require a real stationary wait instead of one instant press");

assert.equal(worldTasks.relayElm.type, "holdSequence", "the Elm relay must be repaired through an authored knock sequence");
const elmShortPulses = worldTasks.relayElm.pulses.filter((pulse) => pulse.label.includes("短"));
const elmLongPulses = worldTasks.relayElm.pulses.filter((pulse) => pulse.label.includes("长"));
assert.ok(elmShortPulses.length > 0 && elmLongPulses.length > 0, "the Elm relay sequence must visibly distinguish short and long knocks");
assert.ok(
  Math.min(...elmLongPulses.map((pulse) => pulse.holdMin)) > Math.max(...elmShortPulses.map((pulse) => pulse.holdMax)),
  "the Elm relay's long-knock timing window must be physically distinct from every short-knock window"
);

assert.equal(worldTasks.relayMulberry.type, "evidence", "the Mulberry relay must compare physical echo evidence before choosing a route");
assert.equal(worldTasks.relayMulberry.listens.length, 2, "the Mulberry relay must require both left-wall and right-wall listening points");
assert.ok(
  worldTasks.relayMulberry.listens.some((listen) => /left/i.test(listen.id) || /左/.test(`${listen.label}${listen.caption}`)),
  "the Mulberry relay must expose a left-wall listening point"
);
assert.ok(
  worldTasks.relayMulberry.listens.some((listen) => /right/i.test(listen.id) || /右/.test(`${listen.label}${listen.caption}`)),
  "the Mulberry relay must expose a right-wall listening point"
);
assert.ok(worldTasks.relayMulberry.choices.length >= 2, "the Mulberry evidence task must offer at least two physical routes after listening");
assert.equal(worldTasks.relayMulberry.choices.filter((choice) => choice.correct).length, 1, "only one Mulberry route may agree with both wall echoes");

assert.equal(worldTasks.relayReed.type, "configuration", "the Reed relay must tune the concealed lamp and both vents as one airflow state");
const reedNodeText = (node) => `${node.id} ${node.label}`;
assert.ok(worldTasks.relayReed.nodes.some((node) => /wick/i.test(reedNodeText(node)) || /灯芯/.test(reedNodeText(node))), "the Reed relay must include the shaded lamp wick");
assert.ok(worldTasks.relayReed.nodes.some((node) => /east.*vent|vent.*east/i.test(reedNodeText(node)) || /东.*风口/.test(reedNodeText(node))), "the Reed relay must include the east-side vent");
assert.ok(worldTasks.relayReed.nodes.some((node) => /west.*vent|vent.*west/i.test(reedNodeText(node)) || /西.*风口/.test(reedNodeText(node))), "the Reed relay must include the west-side vent");
assert.ok(worldTasks.relayReed.verify && typeof worldTasks.relayReed.verify === "object", "the concealed Reed lamp must have a separate airflow-and-light verification point");

assert.equal(worldTasks.airflowTest.type, "configuration", "airflow must be a reversible physical-state puzzle");
assert.equal(worldTasks.shadowSteps.type, "stations", "echo tracking must physically visit both walls before Wenju is confronted");
assert.equal(worldTasks.chooseDecoySite.type, "evidence", "the decoy site must be chosen only after Wenju gives the review order");
assert.equal(worldTasks.chooseDecoySite.listens.length, 0, "the decoy choice must reuse evidence already heard instead of replaying it");
assert.equal(worldTasks.openSmokeVent.type, "configuration", "smoke control must preserve adjustable world states and a final verification");
assert.ok(worldTasks.openSmokeVent.nodes.some((node) => node.id === "listen" && node.correct === "open"), "smoke relief must preserve the return-air-side listening hole");
assert.equal(worldTasks.guideWest.type, "stations", "the west-yard choice must be enacted by listening, turning back, and roll call");
assert.equal(worldTasks.openPrisonCart.type, "holdSequence", "the prison cart rescue must be earned under three hammer beats");
assert.equal(worldTasks.openPrisonCart.pulses.length, 3, "the prison cart must require all three wooden pins");
assert.equal(worldTasks.returnSignal.type, "evidence", "the final route must require complete listening before choosing a bypass");
assert.equal(worldTasks.returnSignal.listens.length, 0, "the final partition must not replay three tail signals the player just heard");
assert.equal(worldTasks.returnSignal.choices.filter((choice) => choice.correct).length, 1, "only the reed bypass may match all three tail signals");
assert.equal(worldTasks.stabilizeWetBand.type, "placement", "wet-band construction must be a spatial placement puzzle");
assert.equal(worldTasks.stabilizeWetBand.reversible, true, "every wet-band material must be removable and repositionable");
assert.equal(worldTasks.stabilizeWetBand.preserveWrongState, true, "incorrect earthwork must remain visible for diagnosis instead of resetting");
assert.equal(worldTasks.stabilizeWetBand.pieces?.length, 3, "wet-band work must expose exactly three movable materials");
assert.equal(worldTasks.stabilizeWetBand.sockets?.length, 3, "wet-band work must expose exactly three candidate sockets");
assert.deepEqual(
  worldTasks.stabilizeWetBand.pieces.map((piece) => piece.id),
  ["frame", "drain", "treads"],
  "wet-band work must use the short frames, low drain, and raised treads"
);
assert.deepEqual(
  worldTasks.stabilizeWetBand.pieces.map((piece) => piece.correctSocket),
  ["dryBank", "wetLowSide", "raisedTurn"],
  "load, water, and walking surfaces must occupy historically credible positions"
);
const wetBandPieces = new Map(worldTasks.stabilizeWetBand.pieces.map((piece) => [piece.id, piece]));
assert.ok(wetBandPieces.get("frame").constraints.includes("loadOnDrySoil"), "short frames must transfer load into dry, firm soil");
assert.ok(wetBandPieces.get("drain").constraints.includes("keepWalkwayDry"), "the low drain must remain on the wet side and outside the walking line");
assert.ok(wetBandPieces.get("treads").constraints.includes("aboveWaterline"), "treads must sit above the old water mark");
assert.ok(wetBandPieces.get("treads").constraints.includes("leaveShoulderClearance"), "raised treads must preserve a stretcher shoulder-change space");
assert.equal(new Set(worldTasks.stabilizeWetBand.sockets.map((socket) => socket.id)).size, 3, "wet-band work must expose three distinct physical sockets");
assert.deepEqual(worldTasks.guideEast.pulses.map((pulse) => pulse.label), ["第一记短敲", "第二记短敲", "第三记长敲"], "the east relay must be short-short-long in world input");
assert.match(scriptSource, /const ChallengeData = Object\.freeze\(\{\}\);/, "campaign actions must not open the legacy paper challenge panel");

const updateMobileCoverSource = ReadFunctionSource("UpdateMobileCover");
assert.match(updateMobileCoverSource, /noiseCover/, "moving firewood-cart progress must stop when the mill-sound window expires");
assert.match(updateMobileCoverSource, /mobileCoverStopIndex/, "moving firewood-cart progress must remember the latest stopping point");
const getMobileCoverZoneSource = ReadFunctionSource("GetMobileCoverZone");
assert.match(getMobileCoverZoneSource, /coverHalfWidth/, "the cart must contribute a bounded physical cover interval");
assert.match(ReadFunctionSource("GetActiveCoverZones"), /GetMobileCoverZone/, "patrol visibility must consume the live cart occlusion zone");
const recoverySource = ReadFunctionSource("RecoverFromDetection");
assert.match(recoverySource, /mobileCover[\s\S]*lastStop|lastStop[\s\S]*mobileCover/, "detection must restore the player and cart to the closest completed stop");

const advancePlacementSource = ReadFunctionSource("AdvancePlacementTask");
assert.match(advancePlacementSource, /task\.placements/, "placement state must record each material's current socket");
assert.doesNotMatch(advancePlacementSource, /FailWorldTask|ResetWorldTask/, "a wrong earthwork placement must stay in world space until the player moves it");
assert.match(scriptSource, /definition\.type === "placement"/, "world-task markers and input must route the placement task");

const advanceConfigurationSource = ReadFunctionSource("AdvanceConfigurationTask");
assert.match(advanceConfigurationSource, /\(currentIndex \+ 1\) % node\.options\.length/, "configuration nodes must cycle repeatedly instead of locking after one adjustment");
assert.doesNotMatch(advanceConfigurationSource, /task\.values\.clear|task\.touched\.clear|task\.values\s*=\s*new Map/, "failed configuration review must preserve every adjusted physical state for diagnosis");

const buildWorldTaskMarkersSource = ReadFunctionSource("BuildWorldTaskFreeMarkers");
assert.match(buildWorldTaskMarkersSource, /marker\.visible = definition\.listens\.length === 0/, "evidence choices must stay hidden until every authored listening point has been heard");

const causalShotSource = ReadFunctionSource("StartCausalShot");
assert.match(causalShotSource, /foreground/, "causal shots must expose the player's foreground action");
assert.match(causalShotSource, /background/, "causal shots must expose the distant team's consequence");
assert.match(causalShotSource, /shot\.layer\s*\|\|\s*action\.layer/, "causal-shot tableaux must render on their authored surface or tunnel layer");
assert.match(causalShotSource, /shot\.foregroundKind/, "causal shots must choose a foreground prop that matches the player's actual action");
assert.match(scriptSource, /action\.causalShot[\s\S]{0,160}StartCausalShot/, "resolving a tail signal must dispatch its authored causal shot");

const epilogueBeats = ReadEpilogueBeatData();
assert.equal(epilogueBeats.length, 5, "the walkable epilogue must contain exactly five positional beats");
assert.equal(new Set(epilogueBeats.map((beat) => beat.id)).size, 5, "epilogue beat ids must be unique");
assert.deepEqual(
  epilogueBeats.map((beat) => beat.id),
  ["bellMemorial", "sealedSmokeBranch", "threeForces", "blackWindDark", "connectedNetwork"],
  "the ending walk must close the film-aligned bell, defense, joint attack, stronghold, and tunnel-network arcs"
);
epilogueBeats.forEach((beat) => assert.ok(Number.isFinite(beat.x) && beat.lines?.length, `${beat.id} must be spatial and voiced`));

const requiredAssets = [
  "Assets/Script_ThreeVendor.mjs",
  "Assets/Data_ThreeLicense.txt",
  "Assets/Texture_MountainFarV2.webp",
  "Assets/Texture_VillageGraphicNovelV2.webp",
  "Assets/Texture_VillageMidgroundV2.webp",
  "Assets/Texture_VillageForegroundV2.webp",
  "Assets/Texture_TunnelGraphicNovelV2.webp",
  "Assets/Texture_TunnelMidgroundV3.webp",
  "Assets/Texture_TunnelForegroundV2.webp",
  "Assets/Texture_CharacterLinQingheStripV3.webp",
  "Assets/Texture_CharacterLinQingheStripSafeV3.webp",
  "Assets/Texture_CharacterLinQingheWalkV2.webp",
  "Assets/Texture_CharacterLinQingheWalkSafeV2.webp",
  "Assets/Texture_CharacterDuXiaomanInjuredV3.webp",
  "Assets/Texture_CharacterPatrolGuardAtlasV2.webp",
  "Assets/Texture_CharacterGaoChuanbaoPrologueV2.png",
  "Assets/Texture_CharacterGaoLaozhongPrologueV2.png",
  "Assets/Texture_PropPrologueBellFrameV1.png",
  "Assets/Texture_PropPrologueBellBodyV1.png",
  "Assets/Texture_PropPrologueBellRopeV1.png",
  "Assets/Texture_VillageRoadRibbonV3.webp",
  "Assets/Texture_VillageRoadRibbonSafeV3.webp",
  "Assets/Texture_PropIrrigationSluiceV2.webp",
  "Assets/Texture_PropWaterCartCulvertV2.webp",
  "Assets/Texture_PropFirewoodCartV2.webp",
  "Assets/Texture_ChapterSetDressFarAtlasV4.webp",
  "Assets/Texture_PropAtlasVillageTunnelV3.webp",
  "Assets/Texture_PropAtlasEvacuationNetworkV3.webp"
];
requiredAssets.forEach((relativePath) => assert.ok(existsSync(join(rootDirectory, relativePath)), `missing ${relativePath}`));
const runtimeAssets = [...scriptSource.matchAll(/loadAsync\(["']\.\/(Assets\/[^"']+)["']\)/g)].map((match) => match[1]);
assert.ok(runtimeAssets.length >= 10, "the production scene must preload its runtime art set");
runtimeAssets.forEach((relativePath) => assert.ok(existsSync(join(rootDirectory, relativePath)), `runtime references missing ${relativePath}`));

assert.match(scriptSource, /marker\.visible = \(available \|\| persistent\) && layerVisible;/, "locked and off-layer markers must stay hidden");
assert.match(scriptSource, /persistent = completed && !action\.pickupKind && PersistentPropKinds\.has\(action\.kind\)/, "picked-up props must not remain duplicated at their source marker");
assert.match(scriptSource, /function SetGridAtlasFrame\(/, "production art atlases must use deterministic UV frames");
assert.match(scriptSource, /playbackFrames:\s*\[0, 1, 2, 3, 4, 5\]/, "walk cycle must exclude the mismatched second visual set");
assert.match(scriptSource, /walkAtlas:\s*\{ texture: walkTexture, frameCount: 6/, "walk atlas UVs must match the optimized six-frame texture");
assert.match(scriptSource, /renderer\.capabilities\.maxTextureSize >= 2304/, "walk atlas must select a 2048-safe fallback from actual GPU capability");
assert.match(scriptSource, /renderer\.capabilities\.maxTextureSize >= 2172/, "state and road atlases must select 2048-safe fallbacks from actual GPU capability");
assert.doesNotMatch(scriptSource, /Texture_CharacterLinQingheWalkV1\.webp/, "the oversized twelve-cell walk atlas must not return to runtime");
assert.doesNotMatch(scriptSource, /spriteMesh\.material\.needsUpdate\s*=\s*true/, "sprite frame changes must not recompile the material");
assert.match(scriptSource, /function CreatePatrolGuard\(/, "the morning search must show a physical patrolling figure and gaze direction");
assert.match(scriptSource, /chapter\.threatMode === "patrol"/, "threat logic must branch between night searchlight and morning patrol");
const createPatrolSource = ReadFunctionSource("CreatePatrolGuard");
const updateThreatSource = ReadFunctionSource("UpdateThreat");
const createCartSource = ReadFunctionSource("CreateMobileFirewoodCart");
const updateDepthSource = ReadFunctionSource("UpdateDepthTransition");
assert.match(createPatrolSource, /SetGridAtlasFrame\(geometry, 4, 1, 3\)/, "patrol art must use the reviewed four-frame walk/turn/listen atlas");
assert.match(updateThreatSource, /facingPivot\.scale\.set\(facing, 1, 1\)/, "patrol facing must switch at full width instead of collapsing through zero");
assert.doesNotMatch(updateThreatSource, /lerp\([^\n]*facing|facingScale/, "patrol direction must never interpolate its horizontal scale through zero");
assert.match(updateThreatSource, /phase === "listen"/, "patrol route must include an authored listening pause at each endpoint");
assert.match(updateThreatSource, /SetPatrolFrame\(patrol, 2\)/, "patrol reversal must expose a dedicated turn frame");
assert.match(createCartSource, /new THREE\.PlaneGeometry\(3\.72, 1\.86\)/, "mobile cover must render the standalone firewood-cart art at its natural ratio");
assert.doesNotMatch(createCartSource, /attributes\.uv|SetGridAtlasFrame/, "standalone firewood-cart art must not crop a culvert or ground strip through UVs");
assert.match(scriptSource, /world\.surfaceDress = new THREE\.Group\(\)/, "chapter set dressing needs its own parallax stratum");
assert.match(scriptSource, /surfaceDress\.position\.x = OffsetFor\(LayerScroll\.surfaceDress\)/, "chapter set dressing must scroll independently from village silhouettes");
assert.match(updateDepthSource, /player\.position\.y = THREE\.MathUtils\.lerp\(transition\.fromY, transition\.toY, eased\)/, "depth transitions must move the player continuously through the shaft");
assert.match(updateDepthSource, /DepthPlayerMinOpacity/, "depth transitions must keep the player visibly traceable at midpoint");
assert.doesNotMatch(updateDepthSource, /scale\.y\s*=\s*\.84|lerp\(1, \.84/, "depth transitions must use a crouch drawing instead of vertically squashing the actor");
assert.match(scriptSource, /world\.tunnelLightLayer = new THREE\.Group\(\)/, "tunnels need a dedicated hand-painted darkness and local-light layer");
assert.match(scriptSource, /completed\.has\("relayReed"\)\) storyMultiplier = 0/, "the reed-cove test lamp must visibly extinguish after verification");
assert.match(styleSource, /body\.isDialogue #gameHeader,[\s\S]*?body\.isDialogue #worldTaskHud/, "dialogue composition must clear routine HUD cards from the frame");
assert.match(styleSource, /width: min\(680px, calc\(100vw - var\(--cinematicSafeLeft\)/, "desktop dialogue cards must preserve more of the cinematic scene");
assert.doesNotMatch(scriptSource, /noiseMultiplier/, "mill sound must never reduce direct visual exposure");
assert.match(scriptSource, /function UpdateCrouchPaths\(/, "stealth paths must detect standing up between physical covers");
assert.match(scriptSource, /gameState\.worldTask\.definition\.sheltered/, "wall-side world tasks must honor their authored physical shelter");
assert.match(scriptSource, /function GetActiveCoverZones\(/, "stealth recovery must use the active physical cover route");
assert.match(scriptSource, /gameState\.player\.position\.x = safeX/, "detection must return to the last occupied cover instead of rewarding failure");
assert.match(scriptSource, /distance < \.7 && distance < nearestDistance/, "adjacent world-task stations must not share an ambiguous interaction zone");
assert.match(scriptSource, /QaMode && gameState\.worldTask && \["\[", "\]"\]/, "QA builds need deterministic world-task station traversal for real-browser checks");
assert.match(scriptSource, /function AdvanceQaWorldTaskPulse\(/, "QA builds need deterministic hold-pulse playback when browser automation cannot sustain keydown");
assert.match(scriptSource, /gameState\.chapterIndex === 4 && gameState\.completed\.has\("readBlockade"\)/, "QA checkpoints must seed the in-flight smoke side effect for seal-and-decay browser checks");
assert.match(scriptSource, /gameState\.chapterIndex === 4\) gameState\.lastSmokeSafeX = action\.x/, "smoke QA checkpoints must recover at the inspected action instead of an unrelated old safe point");
assert.match(scriptSource, /smokeDecayCinematic/, "the final seal must stage a visible old-smoke decay beat before chapter completion");
assert.match(scriptSource, /\(!gameState\.paused \|\| gameState\.smokeDecayCinematic\)/, "old smoke must keep decaying while the post-seal camera locks player input");
assert.match(scriptSource, /window\.setTimeout\(\(\) => \{[\s\S]*?FinishChapter\(\);[\s\S]*?\}, duration\)/, "chapter completion must wait for the post-seal smoke shot");
assert.match(scriptSource, /function DisposeChildren\(/, "rebuilding chapter tableaux must release owned scene resources");
assert.match(scriptSource, /surfaceFar\.visible = surfaceVisible/, "fully hidden parallax strata must stop submitting draw calls");
assert.match(scriptSource, /function ClampCameraX\(/, "camera must use responsive scene bounds");
assert.match(scriptSource, /renderer\.domElement\.style\.width/, "resize must synchronize the canvas CSS width");
assert.match(scriptSource, /camera\.lookAt\(gameState\.cameraX, gameState\.cameraY, 0\)/, "resize must preserve the camera look target");
assert.match(updateCameraSource, /gameState\.depthTransition[\s\S]{0,160}?\.055/, "depth transitions need dedicated vertical follow so the player remains in frame");
assert.match(scriptSource, /function Resize\(\)[\s\S]*?RenderOnce\(\);/, "resize must render even while gameplay is paused");
assert.match(scriptSource, /pendingDialogue/, "checkpoints must preserve interrupted dialogue");
assert.match(scriptSource, /heldPropKind:\s*useLiveState \? gameState\.heldPropKind/, "checkpoints must preserve an in-flight carried prop");
assert.match(scriptSource, /playerX:\s*useLiveState \? Number\(gameState\.player\?\.position\.x/, "checkpoints must preserve the player's physical location");
assert.match(scriptSource, /chapterIndex === 1 && restoredHeldKind === "medicine"/, "medicine checkpoints must recover inside an authored physical cover");
assert.match(scriptSource, /function ActionDependsOn\(/, "legacy checkpoints must restore props across indirect requirement chains");
assert.doesNotMatch(scriptSource, /from\s+["']https?:\/\//, "runtime imports must remain local");
assert.equal((scriptSource.match(/earthveins1942_campaign_v1/g) || []).length, 1, "storage key must remain unique in the game script");
assert.doesNotMatch(scriptSource, /type:\s*["']allocation["']/, "dropdown-style allocation puzzles must not return");
for (const stalePhrase of ["第一章那回", "备用回路", "复核人数", "门板滑架", "土层研判"]) {
  assert.ok(!scriptSource.includes(stalePhrase), `stale phrase must stay removed: ${stalePhrase}`);
}
for (const auditPhrase of ["不是西沟那一下穿土传回来", "不是同一声跑了三处", "不是拿回声猜路", "没有用回声猜路"]) {
  assert.ok(!scriptSource.includes(auditPhrase), `review-note dialogue must stay out of the playable script: ${auditPhrase}`);
}

const htmlIds = [...htmlSource.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]);
assert.equal(new Set(htmlIds).size, htmlIds.length, "HTML ids must be unique");
const cacheUiSource = scriptSource.match(/function CacheUi\(\) \{([\s\S]*?)ui\.touchDepthLabel/)?.[1] || "";
const cachedUiIds = [...cacheUiSource.matchAll(/"([A-Za-z][A-Za-z0-9]+)"/g)].map((match) => match[1]);
assert.ok(cachedUiIds.length > 30, "CacheUi must expose the complete cinematic HUD");
cachedUiIds.forEach((id) => assert.ok(htmlIds.includes(id), `CacheUi references missing HTML id ${id}`));
assert.match(htmlSource, /data-touch="depth"/, "touch depth control must exist");
assert.match(htmlSource, /data-touch="interact"/, "touch interaction control must exist");
for (const id of ["worldTaskHud", "worldTaskKicker", "worldTaskTitle", "worldTaskProgress", "worldTaskHint"]) {
  assert.ok(htmlIds.includes(id), `world-space task HUD is missing ${id}`);
}
assert.match(htmlSource, /Style_Game\.css\?v=20260801g/, "index must load the current reviewed interface build");
assert.match(htmlSource, /Script_Game\.mjs\?v=20260801x/, "index must load the current reviewed game build");

console.log(`EarthVeins1942 smoke test passed: ${chapters.length} chapters, ${campaignIds.size} interactions, ${requiredAssets.length} production assets.`);
