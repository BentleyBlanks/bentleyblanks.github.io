import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  Chapters,
  GameMetadata,
  HistoricalSources,
  GetAllChildNames,
} from "./Data_World.mjs";
import { ChapterVisuals, RenderProfiles } from "./Data_Scene3D.mjs";
import {
  ActionCinematics,
  ChapterOpeningCinematics,
  CinematicSequences,
  GetActionCinematic,
  GetChapterOpeningCinematic,
} from "./Data_Cinematics.mjs";
import { CreateCinematicDirector } from "./Script_Cinematics3D.mjs";
import {
  CreateGameState,
  CompleteAction,
  GetAvailableAction,
  GetBlockedActionReason,
  GetGroundY,
  GetLightTarget,
  IsChapterReady,
  IsPositionCovered,
  IsWindGust,
  MeasureExposure,
  MeasureNoise,
  RequirementsMet,
  RestoreGameState,
  SerializeGameState,
  StepGameState,
  ToggleFollowers,
  ValidateCampaign,
} from "./Script_Rules.mjs";

const rootDirectory = dirname(fileURLToPath(import.meta.url));
const htmlSource = readFileSync(join(rootDirectory, "index.html"), "utf8");
const styleSource = readFileSync(join(rootDirectory, "Style_Game.css"), "utf8");
const gameSource = readFileSync(join(rootDirectory, "Script_Game.mjs"), "utf8");
const rulesSource = readFileSync(join(rootDirectory, "Script_Rules.mjs"), "utf8");
const dataSource = readFileSync(join(rootDirectory, "Data_World.mjs"), "utf8");
const sceneDataSource = readFileSync(join(rootDirectory, "Data_Scene3D.mjs"), "utf8");
const actorSource = readFileSync(join(rootDirectory, "Script_Actor3D.mjs"), "utf8");
const renderSource = readFileSync(join(rootDirectory, "Script_Render3D.mjs"), "utf8");
const sceneSource = readFileSync(join(rootDirectory, "Script_Scene3D.mjs"), "utf8");
const postFxSource = readFileSync(join(rootDirectory, "Script_PostFX3D.mjs"), "utf8");
const assetSource = readFileSync(join(rootDirectory, "Script_Assets3D.mjs"), "utf8");
const assetKitSize = statSync(join(rootDirectory, "Model_ReedSignalEnvironmentKit.glb")).size;

assert.equal(Object.keys(CinematicSequences).length, 24, "four openings and every world action need an authored 3D cinematic");
assert.equal(Object.keys(ChapterOpeningCinematics).length, Chapters.length, "every chapter needs a continuous-space opening shot");
assert.equal(Object.keys(ActionCinematics).length, Chapters.flatMap((chapter) => chapter.actions).length, "all world actions need a visible 3D cinematic");
for (const chapter of Chapters) assert.ok(GetChapterOpeningCinematic(chapter.id), `${chapter.id}: opening cinematic missing`);
for (const action of Chapters.flatMap((chapter) => chapter.actions)) assert.ok(GetActionCinematic(action.id), `${action.id}: story action cinematic missing`);
for (const sequence of Object.values(CinematicSequences)) {
  assert.ok(sequence.duration > 0 && sequence.segments.length > 0, `${sequence.id}: cinematic timing missing`);
  assert.equal(sequence.lockInput, "all", `${sequence.id}: a full cinematic must not leak movement input into the shot`);
  assert.equal(sequence.segments[0].from, 0, `${sequence.id}: cinematic must start at zero`);
  assert.equal(sequence.segments.at(-1).to, sequence.duration, `${sequence.id}: cinematic must end at its declared duration`);
  sequence.segments.forEach((segment, index) => {
    if (index) assert.equal(segment.from, sequence.segments[index - 1].to, `${sequence.id}: cinematic segments must be continuous`);
    assert.ok(segment.camera && segment.caption, `${sequence.id}: every shot needs camera authorship and a human story beat`);
  });
}
assert.equal(CinematicSequences.endingDeparture.blocksEnding, true, "the ferry must leave in 3D before the ending screen appears");
assert.equal(CinematicSequences.endingDeparture.segments[1].effects.playerBoarding, 0, "all six children must board before Awei");
assert.equal(CinematicSequences.endingDeparture.segments[2].actors.player, "writeKneel", "Awei must visibly add Zhou He's eighth line before boarding");
assert.equal(CinematicSequences.endingDeparture.segments[2].effects.playerBoarding, 0, "Awei must finish the eighth line on shore");
assert.deepEqual(CinematicSequences.endingDeparture.segments[3].effects.playerBoarding, [0, 1], "Awei must board only after writing Zhou He's name");
assert.deepEqual(CinematicSequences.endingDeparture.segments[5].effects.motherDeparture, [0.72, 1], "Zhou He's southward lantern route must remain visible through the final wide shot");
assert.equal(CinematicSequences.endingDeparture.segments.length, 6, "the finale needs boarding, the eighth line, both answers, and the departure wide shot");
assert.match(CinematicSequences.endingDeparture.segments[5].caption, /周禾老师/);
assert.equal(CinematicSequences.schoolOpening.segments.length, 4, "the school opening must establish village scale, empty shoes, register, and departure");
assert.ok(CinematicSequences.schoolOpening.segments.some((segment) => segment.blocking), "school actors need authored blocking instead of static mannequin poses");
assert.deepEqual(CinematicSequences.sluiceRise.segments[1].effects.bridgeRaise, [0.42, 1], "the bridge must visibly rise during its causal shot");
assert.deepEqual(CinematicSequences.emptyBoatDiversion.segments[1].effects.emptyBoatRelease, [0.35, 1], "the empty boat must visibly drift during its diversion shot");

const naturalDirector = CreateCinematicDirector();
assert.equal(naturalDirector.Start("schoolOpening"), true);
assert.equal(naturalDirector.GetFrame()?.id, "schoolOpening");
for (let step = 0; step < 260 && naturalDirector.IsPlaying(); step += 1) naturalDirector.Update(0.05);
assert.equal(naturalDirector.IsPlaying(), false, "opening cinematic must finish deterministically");
assert.deepEqual(naturalDirector.ConsumeFinished(), {
  id: "schoolOpening",
  reason: "complete",
  blocksCompletion: false,
  blocksEnding: false,
});

const skipDirector = CreateCinematicDirector();
skipDirector.Start("endingDeparture");
for (let step = 0; step < 50; step += 1) skipDirector.Update(0.05);
assert.equal(skipDirector.GetFrame()?.canSkip, true, "long ending shot must become skippable after its authored hold");
skipDirector.Update(0.05, true);
assert.equal(skipDirector.IsPlaying(), false, "skip input must finish the cinematic cleanly");
assert.deepEqual(skipDirector.ConsumeFinished(), {
  id: "endingDeparture",
  reason: "skipped",
  blocksCompletion: true,
  blocksEnding: true,
});

const validation = ValidateCampaign();
assert.equal(validation.valid, true, validation.errors.join("\n"));
assert.equal(Chapters.length, 4, "the story must keep its four-chapter dramatic arc");
assert.equal(validation.actionCount, 20, "all twenty authored world actions must remain testable");
assert.deepEqual(Chapters.map((chapter) => chapter.title), ["空教室", "风过封锁沟", "井下有六口气", "最后一次点名"]);
assert.deepEqual(Chapters.map((chapter) => chapter.actions.length), [5, 4, 6, 5]);
assert.equal(new Set(Chapters.map((chapter) => chapter.id)).size, Chapters.length, "chapter ids must be unique");
assert.equal(GameMetadata.saveKey, "reedsignal1942_campaign_v1", "save data must stay isolated from other pages");
assert.match(GameMetadata.historyBoundary, /虚构复合创作/);
assert.match(GameMetadata.historyBoundary, /不能改写真实战役与历史结局/);
assert.match(GameMetadata.responsibility, /侵华日军/);
assert.match(GameMetadata.responsibility, /平民苦难不计分/);
assert.ok(HistoricalSources.length >= 4, "the history panel needs a compact public source trail");
HistoricalSources.forEach((source) => {
  assert.match(source.url, /^https?:\/\//, `${source.title} needs a public URL`);
  assert.ok(source.organization && source.usedFor, `${source.title} needs provenance and a stated use`);
});

const allText = `${dataSource}\n${htmlSource}`;
for (const phrase of ["点名不是数数", "名字", "侵华日军", "五一大扫荡", "不计分", "虚构复合"]) {
  assert.ok(allText.includes(phrase), `historical and thematic framing is missing: ${phrase}`);
}
for (const forbiddenPhrase of ["击杀得分", "平民奖励", "改变抗战结局", "真实的苇河县"]) {
  assert.equal(allText.includes(forbiddenPhrase), false, `disallowed framing found: ${forbiddenPhrase}`);
}

function FindElapsed(predicate) {
  for (let time = 0; time < 60; time += 0.05) if (predicate(time)) return time;
  throw new Error("unable to find requested deterministic phase");
}

const lightState = CreateGameState(0);
const towerLight = Chapters[0].hazards[0];
lightState.elapsed = FindElapsed((time) => {
  lightState.elapsed = time;
  const target = GetLightTarget(towerLight, lightState);
  return target > 1290 && target < 1450;
});
lightState.player.x = GetLightTarget(towerLight, lightState);
lightState.player.crouching = false;
assert.ok(MeasureExposure(lightState) > 0.95, "standing in the visible beam must create near-total exposure");
lightState.cartX = lightState.player.x;
lightState.player.crouching = true;
assert.equal(IsPositionCovered(Chapters[0], lightState, lightState.player.x, true), true, "the hand-pushed cart must be physical cover");
assert.equal(MeasureExposure(lightState), 0, "crouching behind the cart must defeat direct light");
lightState.player.crouching = false;
assert.ok(MeasureExposure(lightState) > 0.9, "standing behind low cover must remain visible");

const windState = CreateGameState(1);
windState.player.x = 650;
windState.player.vx = 90;
windState.player.crouching = true;
const quietTime = FindElapsed((time) => !IsWindGust(time));
const gustTime = FindElapsed((time) => IsWindGust(time));
windState.elapsed = quietTime;
const dryNoise = MeasureNoise(windState);
windState.elapsed = gustTime;
const coveredNoise = MeasureNoise(windState);
assert.ok(dryNoise > 0.8, "dry reeds must be unsafe even while crouching when the air is still");
assert.ok(coveredNoise < dryNoise * 0.25, "a full gust must audibly cover reed movement");

const distractionState = CreateGameState(1);
const boatLight = Chapters[1].hazards[0];
distractionState.elapsed = 5;
const ordinaryTarget = GetLightTarget(boatLight, distractionState);
distractionState.completed.add("releaseBoat");
distractionState.distractionUntil = 17;
const divertedTarget = GetLightTarget(boatLight, distractionState);
assert.notEqual(divertedTarget, ordinaryTarget, "releasing the empty boat must change the light target");
assert.ok(divertedTarget < boatLight.x0, "the empty boat must pull the beam away from the crossing");

const bridgeState = CreateGameState(1);
assert.equal(GetGroundY(Chapters[1], 2000, bridgeState, null), null, "the drainage gap must be open before the sluice rises");
bridgeState.completed.add("readWind");
bridgeState.completed.add("releaseBoat");
CompleteAction(bridgeState, Chapters[1].actions.find((action) => action.id === "raiseSluice"));
assert.equal(GetGroundY(Chapters[1], 2000, bridgeState, null), -8, "the raised door-plank bridge must become walkable terrain");

const cartState = CreateGameState(0);
cartState.completed.add("takeRegister");
cartState.completed.add("findMizi");
cartState.completed.add("dropBlind");
cartState.player.x = cartState.cartX - 56;
for (let step = 0; step < 190 && !cartState.completed.has("cartPlaced"); step += 1) {
  cartState.player.crouching = true;
  StepGameState(cartState, { right: true, left: false, crouch: true, interact: true }, 0.05);
}
assert.equal(cartState.completed.has("cartPlaced"), true, "holding the action key and moving must physically push the cart to the wall");
assert.ok(cartState.cartX >= Chapters[0].cart.targetX, "cart completion must depend on its world position");

const smokeState = CreateGameState(2);
assert.ok(smokeState.smokeFrontX < 4000, "smoke pressure must exist at chapter start");
CompleteAction(smokeState, Chapters[2].actions.find((action) => action.id === "openWellVent"));
const ventedFront = smokeState.smokeFrontX;
assert.ok(ventedFront > Chapters[2].smoke.startX, "opening the high vent must push the smoke front away");
CompleteAction(smokeState, Chapters[2].actions.find((action) => action.id === "sealEastCrack"));
assert.equal(smokeState.smokeFrontX, 99999, "sealing the lower crack after opening the well must stop the smoke advance");

const teamState = CreateGameState(3);
const raiseScreen = Chapters[3].actions.find((action) => action.id === "raiseScreen");
teamState.completed.add("countChildren");
teamState.player.x = raiseScreen.x;
assert.equal(GetAvailableAction(teamState)?.id, "raiseScreen", "the reed-screen action must be spatially discoverable");
assert.match(GetBlockedActionReason(teamState, raiseScreen), /按 F/, "the screen puzzle must teach a physical wait command");
assert.equal(ToggleFollowers(teamState), true, "the six-child group must respond to the team command");
assert.equal(teamState.followersHolding, true, "the first command must make the group wait");
teamState.followers.forEach((follower, index) => { follower.x = 760 + index * 34; });
assert.equal(GetBlockedActionReason(teamState, raiseScreen), "", "waiting the group must unlock the solo crossing action");
CompleteAction(teamState, raiseScreen);
const ferryAction = Chapters[3].actions.find((action) => action.id === "boardFerry");
teamState.completed.add("meetMother");
teamState.completed.add("motherSignal");
teamState.player.x = ferryAction.x;
assert.match(GetBlockedActionReason(teamState, ferryAction), /重新跟上/, "a waiting group cannot be silently teleported onto the ferry");
ToggleFollowers(teamState);
teamState.followers.forEach((follower, index) => { follower.x = teamState.player.x - 38 * (index + 1); });
assert.equal(GetBlockedActionReason(teamState, ferryAction), "", "the ferry must accept a physically gathered group");
const finalLight = Chapters[3].hazards.find((hazard) => hazard.distractBy === "motherSignal");
const signalState = CreateGameState(3);
signalState.completed.add("motherSignal");
signalState.distractionUntil = Number.POSITIVE_INFINITY;
assert.equal(GetLightTarget(finalLight, signalState), finalLight.x1 + 260, "the mother's white-cloth signal must draw the final searchlight toward the south branch");

for (let chapterIndex = 0; chapterIndex < Chapters.length; chapterIndex += 1) {
  const chapter = Chapters[chapterIndex];
  const state = CreateGameState(chapterIndex);
  for (const action of chapter.actions) {
    assert.equal(RequirementsMet(state, action), true, `${chapter.title}:${action.id} must follow a reachable action graph`);
    if (action.condition === "followersWaiting") state.followersHolding = true;
    if (action.condition === "followersTogether") {
      state.followersHolding = false;
      state.followers.forEach((follower, index) => { follower.x = action.x - 35 * index; });
      state.player.x = action.x;
    }
    CompleteAction(state, action);
  }
  if (chapterIndex < Chapters.length - 1) assert.equal(IsChapterReady(state), true, `${chapter.title} must reach a chapter handoff`);
  else assert.equal(state.endingReady, true, "the final ferry action must reach the authored ending");
}

const saveState = CreateGameState(2);
saveState.completed.add("openWellVent");
saveState.player.x = 712;
saveState.checkpoint = { x: 590, completed: ["openWellVent"] };
saveState.detections = 2;
const restoredState = RestoreGameState(SerializeGameState(saveState));
assert.equal(restoredState.chapterIndex, 2);
assert.equal(restoredState.player.x, 712);
assert.equal(restoredState.completed.has("openWellVent"), true);
assert.equal(restoredState.detections, 2);
assert.equal(restoredState.smokeFrontX, Chapters[2].smoke.startX + 380, "save restoration must preserve the opened high vent's causal effect");

const distractionSave = CreateGameState(1);
distractionSave.completed.add("readWind");
distractionSave.completed.add("releaseBoat");
const restoredDistraction = RestoreGameState(SerializeGameState(distractionSave));
assert.ok(restoredDistraction.distractionUntil > restoredDistraction.elapsed, "reloading at the empty-boat checkpoint must restore its light-diversion window");

const htmlIds = [...htmlSource.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]);
assert.equal(new Set(htmlIds).size, htmlIds.length, "HTML ids must be unique");
for (const id of ["GameCanvas", "StartButton", "HistoryScreen", "ObjectiveCard", "TouchControls", "CinematicOverlay", "EndingScreen", "RollCallList"]) {
  assert.ok(htmlIds.includes(id), `required interface id missing: ${id}`);
}
for (const control of ["left", "right", "crouch", "jump", "command", "interact"]) {
  assert.match(htmlSource, new RegExp(`data-input="${control}"`), `touch control missing: ${control}`);
}
assert.match(htmlSource, /A、D移动，S蹲伏，空格跳跃，E互动，F让队伍等待或跟随/, "canvas needs a complete accessible control summary");
assert.match(styleSource, /@media \(pointer: coarse\)/, "touch layouts need a coarse-pointer breakpoint");
assert.match(styleSource, /prefers-reduced-motion/, "motion-sensitive players need a reduced-motion mode");
assert.match(styleSource, /orientation: portrait/, "portrait phones need a rotation notice");
assert.match(gameSource, /window\.ReedSignal1942/, "browser QA needs a small public inspection surface");
assert.match(gameSource, /Runtime\.state\.cinematicCue = null/, "director-owned story actions must not replay their short rule-layer cue after the shot");
assert.doesNotMatch(gameSource, /IsPlaying\(\)\) InputState\.cinematicSkipPressed = true/, "ordinary movement or touch input must not silently skip cinematics");
assert.match(gameSource, /code === "Escape" && !event\.repeat\) InputState\.cinematicSkipPressed = true/, "cinematics need one explicit keyboard skip command");
assert.match(gameSource, /localStorage\.setItem\(GameMetadata\.saveKey/, "the runtime must persist authored checkpoints");
assert.match(gameSource, /createBufferSource/, "ambient audio must be synthesized at runtime");
assert.doesNotMatch(gameSource, /from\s+["']https?:\/\//, "runtime imports must remain local");
assert.doesNotMatch(rulesSource, /document\.|window\.|Canvas|AudioContext/, "the rules layer must remain runnable in plain Node");

assert.doesNotMatch(gameSource, /getContext\(["']2d["']\)/, "the game controller must not restore the rejected Canvas2D renderer");
assert.match(gameSource, /CreateRender3D/, "the browser controller must boot the 3D renderer");
assert.match(renderSource, /vendor\/three\/build\/three\.module\.mjs/, "Three.js must stay repository-local");
assert.match(renderSource, /PerspectiveCamera/, "the side view must use a real perspective camera");
assert.match(renderSource, /ACESFilmicToneMapping/, "cinematic highlights need ACES tone mapping");
assert.match(renderSource, /SRGBColorSpace/, "the renderer must output sRGB");
assert.match(renderSource, /FogExp2/, "chapters need depth-separated atmospheric fog");
assert.match(renderSource, /GetLightTarget/, "visual searchlights must share the rules-layer target");
assert.match(renderSource, /renderer\.info\.render/, "runtime draw calls and triangles must be observable");
for (const builder of ["BuildSchool", "BuildBlockade", "BuildTunnel", "BuildFerry"]) {
  assert.match(sceneSource, new RegExp(`function ${builder}\\(`), `missing authored 3D chapter builder: ${builder}`);
}
assert.match(sceneSource, /InstancedMesh/, "dense reeds and terrain detail must use instancing");
assert.match(sceneSource, /CreateWaterRipples/, "water chapters need readable moving surface detail");
assert.match(actorSource, /CreateActor3D/, "player and civilians need procedural 3D rigs");
assert.match(assetSource, /GLTFLoader/, "BlenderMCP-authored GLB assets need the repository-local glTF loader");
assert.match(postFxSource, /DepthTexture/, "cinematic post-processing must use scene depth for restrained focus separation");
assert.match(postFxSource, /uFocusDistance/, "cinematic focus must track the playable subject");
assert.match(postFxSource, /uVignetteStrength/, "cinematic grading must keep a controlled vignette rather than CSS-only filtering");
for (const assetName of [
  "Asset_SchoolFacade",
  "Asset_WaterSluice",
  "Asset_CivilianSampan",
  "Asset_TunnelInteriorKit",
  "Asset_DistantVillageCluster",
  "Asset_SchoolCourtyardVista",
  "Asset_BlockadeVista",
  "Asset_TunnelShaftVista",
  "Asset_FerryRiverbankVista",
]) {
  assert.match(assetSource, new RegExp(assetName), `Blender asset library missing: ${assetName}`);
}
assert.ok(assetKitSize > 1_000_000 && assetKitSize < 8_000_000, `embedded GLB asset kit should stay web-sized (${assetKitSize} bytes)`);
assert.doesNotMatch(`${renderSource}\n${sceneSource}\n${actorSource}\n${assetSource}\n${postFxSource}\n${sceneDataSource}`, /from\s+["']https?:\/\//, "3D runtime imports must not use a CDN");
for (const [chapterId, profile] of Object.entries(ChapterVisuals)) {
  assert.ok(profile.camera.fov >= 22 && profile.camera.fov <= 28, `${chapterId}: long-lens FOV must stay between 22 and 28 degrees`);
  assert.ok(profile.camera.distance > 12, `${chapterId}: camera needs real stage depth`);
  assert.ok(profile.fogDensity > 0 && profile.fogDensity < 0.06, `${chapterId}: fog must separate depth without blanking the frame`);
}
assert.equal(RenderProfiles.desktop.shadows, true, "desktop mode must retain real-time shadows");
assert.equal(RenderProfiles.mobile.shadows, false, "mobile mode must drop the expensive shadow pass");

console.log(`ReedSignal1942 smoke test passed: ${Chapters.length} 3D chapters, ${validation.actionCount} world actions, ${GetAllChildNames().length} children, cinematic render and light/sound/team/water/smoke rules verified.`);
