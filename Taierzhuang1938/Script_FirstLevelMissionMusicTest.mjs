import assert from "node:assert/strict";
import fs from "node:fs";
import crypto from "node:crypto";
import { MISSION_STAGES } from "./Data_FirstLevelMission.mjs";
import { FIRST_LEVEL_MUSIC_CUES, FIRST_LEVEL_STAGE_MUSIC, FIRST_LEVEL_MUSIC_MIX, FIRST_LEVEL_MUSIC_OPENING,
  FirstLevelMusicState } from "./Data_FirstLevelMissionMusic.mjs";
import { CARRIAGE_SOUND } from "./Data_FirstLevelCarriageSound.mjs";
import { FirstLevelMissionMusic } from "./Script_FirstLevelMissionMusic.mjs";

assert.deepEqual(Object.keys(FIRST_LEVEL_STAGE_MUSIC), MISSION_STAGES.map(stage => stage.id));
const cues = Object.keys(FIRST_LEVEL_MUSIC_CUES);
assert.equal(cues.length, 9);
const manifest = JSON.parse(fs.readFileSync(new URL("./Audio/Music/FirstLevel/Data_FirstLevelMusicManifest.json", import.meta.url)));
const approvedBattleTakes = {
  firstLevelCloseQuartersPressure: "2fc553c982dc6893f22e414b9a18cdb40963e07955f501433dc292176590d297",
  firstLevelIronSiege: "3b8aa2065be06d4b464e26bac421824210ef0c8696d11508f7a11f9143fa3538",
};
for (const [cue, sha256] of Object.entries(approvedBattleTakes)) {
  assert.equal(manifest.cues[cue].sourceSha256, sha256, "package the exact user-approved preview");
  assert.ok(Math.abs(manifest.cues[cue].seconds - 90) < 0.1);
}
assert.deepEqual(Object.keys(manifest.cues), cues);
for (const cue of cues) {
  const spec = FIRST_LEVEL_MUSIC_CUES[cue], entry = manifest.cues[cue];
  const bytes = fs.readFileSync(new URL(`./Audio/Music/${spec.file}`, import.meta.url));
  assert.equal(crypto.createHash("sha256").update(bytes).digest("hex"), entry.sha256);
  assert.ok(entry.seconds > 90 && entry.seconds < 130 && entry.bytes < 2_000_000);
  assert.ok(Math.abs(entry.rmsDbfs + 27) <= 0.6 && entry.peakDbfs <= -3);
}
// 【2026-09-26】01/02 开场过场原来不放乐；用户要「背景音乐 + 战场嘈杂」，改成「前线压来」压在底下。
// 近爆那一下仍是静的（黑屏、醒来、剧情档耳鸣），silenceS 之后 returnS 内一档一档爬回。
{
  const O = FIRST_LEVEL_MUSIC_OPENING;
  assert.equal(FirstLevelMusicState("Trapped").cue, "firstLevelTheFrontClosesIn");
  assert.equal(FirstLevelMusicState("BunkerRescue").cue, "firstLevelTheFrontClosesIn");
  assert.ok(FirstLevelMusicState("Trapped").scale < 1 && FirstLevelMusicState("BunkerRescue").scale < 1, "开场配乐压在底下");
  const talk = FirstLevelMusicState("Trapped", { speaking: true }).scale / FirstLevelMusicState("Trapped").scale;
  assert.ok(talk < 1 && talk > FIRST_LEVEL_MUSIC_MIX.dialogueScale, "开场说话时让位，但比常规的 0.42 让得少（另有对白侧链 −6 dB）");
  assert.equal(FirstLevelMusicState("Trapped", { shellImpact: true }).cue, null, "近爆那一刻静");
  const quiet = FirstLevelMusicState("Trapped", { shellImpact: true, shellImpactAgeS: O.silenceS - 0.1 });
  assert.ok(quiet.cue === null && quiet.fadeOut < 0.2, "近爆后 silenceS 内静（快淡出）");
  const ages = [O.silenceS + 0.5, O.silenceS + O.returnS * 0.5, O.silenceS + O.returnS + 1];
  const back = ages.map((a) => FirstLevelMusicState("Trapped", { shellImpact: true, shellImpactAgeS: a }));
  assert.ok(back.every((s) => s.cue === "firstLevelTheFrontClosesIn") && back[0].scale < back[1].scale && back[1].scale < back[2].scale
    && Math.abs(back[2].scale - FirstLevelMusicState("Trapped").scale) < 1e-9, `近爆后爬回：${back.map((s) => s.scale.toFixed(2)).join("→")}`);
  assert.ok(FirstLevelMusicState("BunkerRescue", { shellImpact: true, shellImpactAgeS: 0 }).cue !== null, "近爆静默只在 01");
  // 运行时对象：事实由假变真起算；第一次看时已经为真（跳关/读档）算很久以前。
  let now = 0;
  const seen = [];
  const live = new FirstLevelMissionMusic({ ctx: { get currentTime() { return now; } },
    Music: (cue, o) => seen.push([now, cue, o.levelScale]), SetMusicLevel: (s) => seen.push([now, "level", s]) });
  live.Update("Trapped", { shellImpact: false });
  now = 50; live.Update("Trapped", { shellImpact: true });
  now = 50 + O.silenceS - 1; live.Update("Trapped", { shellImpact: true });
  now = 50 + O.silenceS + O.returnS + 1; live.Update("Trapped", { shellImpact: true });
  assert.deepEqual(seen.map((r) => r[1]), ["firstLevelTheFrontClosesIn", null, "firstLevelTheFrontClosesIn"], JSON.stringify(seen));
  const cold = new FirstLevelMissionMusic({ ctx: { currentTime: 999 }, Music: (cue) => seen.push([999, cue]), SetMusicLevel() {} });
  cold.Update("Trapped", { shellImpact: true });
  assert.equal(seen.at(-1)[1], "firstLevelTheFrontClosesIn", "从醒来之后进 01：直接有配乐");
}
assert.equal(FirstLevelMusicState("South").cue, "firstLevelTheRoadSouth");
assert.equal(FirstLevelMusicState("TransferApproach").cue, "firstLevelTheRoadSouth");
assert.equal(FirstLevelMusicState("Death").cue, null);
for (const stage of ["Support", "MachineGun", "Tank", "Transfer", "AirFirst", "BridgeCover"]) {
  assert.equal(FirstLevelMusicState(stage).cue, "firstLevelCloseQuartersPressure", stage);
  assert.equal(FirstLevelMusicState(stage, { failed: true }).cue, null, stage);
}
for (const stage of ["RearTrench", "Village", "Melee", "Courtyard", "Rescue"]) {
  assert.equal(FirstLevelMusicState(stage).cue, "firstLevelIronSiege", stage);
}
assert.equal(FirstLevelMusicState("NightMarch").cue, "firstLevelTheLivingStillNeedUs");
assert.equal(FirstLevelMusicState("Orders").cue, "firstLevelTheFrontClosesIn");
assert.equal(FirstLevelMusicState("Handover").cue, "firstLevelKeepYourEyesOpen");
assert.equal(FirstLevelMusicState("WallPath").cue, "firstLevelTheLivingStillNeedUs");
// 15–18 的情绪核（End 包 2026.09.20）：15A 与 17 静，15B/15C 压到背景，
// 18 桥头回到紧张、爆破那一步是「南路断了」，夜入城收束。
assert.equal(FirstLevelMusicState("Regroup").cue, null, "15A 降压段不放乐");
assert.ok(FirstLevelMusicState("Regroup").fadeOut < 0.2, "15A 与 17 同一条快淡出");
assert.ok(FirstLevelMusicState("WallPath").scale < 0.6 && FirstLevelMusicState("ReceptionGate").scale < 0.6,
  "沿墙缓行与院门段的配乐压在喘息与脚步下面");
assert.equal(FirstLevelMusicState("BridgeOrders").cue, "firstLevelTheFrontClosesIn");
assert.equal(FirstLevelMusicState("BridgeWithdraw").cue, "firstLevelTheSouthRoadBreaks",
  "炸桥这一步是一条通路被不可逆切断，不是「把路打开」");
assert.equal(FirstLevelMusicState("Transfer").scale, 1);
assert.equal(FirstLevelMusicState("Complete").cue, null);
assert.equal(FirstLevelMusicState("Trapped", { failed: true }).cue, null);
const ambience = JSON.parse(fs.readFileSync(new URL("./Audio/Amb/Data_AmbManifest.json", import.meta.url)));
const trainBed = ambience.beds[CARRIAGE_SOUND.trainBed];
const trainSource = ambience.carriageSources[CARRIAGE_SOUND.trainBed];
const trainBytes = fs.readFileSync(new URL(`./Audio/Amb/${trainBed.file}`, import.meta.url));
assert.equal(crypto.createHash("sha256").update(trainBytes).digest("hex"), trainSource.sha256, "play the verified train-only take");
assert.ok(trainBed.seconds > 20 && trainBed.channels === 2);
assert.ok(Math.abs(trainSource.rmsDbfs + 27) < .6 && trainSource.peakDbfs < -1);
const calls = [], levels = [];
const audio = { Music: (...args) => calls.push(args), SetMusicLevel: (...args) => levels.push(args) };
const director = new FirstLevelMissionMusic(audio);
director.Update("Support"); director.Update("MachineGun"); director.Update("Tank");
assert.equal(calls.length, 1, "continuous front battle must not restart its recording");
director.Update("Tank", { speaking: true });
assert.equal(calls.length, 1);
assert.ok(levels.at(-1)[0] < 0.5, "battle dialogue ducks the music group without restarting");
director.Update("Orders", { speaking: true });
assert.equal(calls.length, 2);
assert.equal(calls.at(-1)[0], "firstLevelTheFrontClosesIn", "orders leave battle music");
assert.ok(calls.at(-1)[1].levelScale < 0.3, "orders and dialogue combine");
director.Update("Orders", { speaking: false });
assert.ok(levels.at(-1)[0] > levels[0][0]);
director.Update("Death");
assert.equal(calls.at(-1)[0], null); assert.ok(calls.at(-1)[1].fadeOut < 0.2);
director.Update("BridgeCover"); director.Update("WallPath");
assert.equal(calls.at(-1)[0], "firstLevelTheLivingStillNeedUs");
const beforeVillage = calls.length;
director.Update("Village"); director.Update("Melee"); director.Update("Courtyard");
assert.equal(calls.length, beforeVillage + 1, "continuous close combat holds its recording");
assert.equal(calls.at(-1)[0], "firstLevelIronSiege");
director.Update("TransferApproach");
assert.equal(calls.at(-1)[0], "firstLevelTheRoadSouth", "travel leaves battle music");
director.Update("Rescue");
assert.equal(calls.at(-1)[0], "firstLevelIronSiege");
director.Update("Handover");
assert.equal(calls.at(-1)[0], "firstLevelKeepYourEyesOpen", "carrying returns to the story cue");
director.Dispose(); assert.equal(calls.at(-1)[0], null);
console.log("PASS nine verified assets; battle assignments, story transitions, silence, dialogue and uninterrupted combat");
