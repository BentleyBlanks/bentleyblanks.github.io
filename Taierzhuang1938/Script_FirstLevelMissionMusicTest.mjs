import assert from "node:assert/strict";
import fs from "node:fs";
import crypto from "node:crypto";
import { MISSION_STAGES } from "./Data_FirstLevelMission.mjs";
import { FIRST_LEVEL_MUSIC_CUES, FIRST_LEVEL_STAGE_MUSIC, FirstLevelMusicState } from "./Data_FirstLevelMissionMusic.mjs";
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
assert.equal(FirstLevelMusicState("Train").cue, null);
assert.equal(FirstLevelMusicState("Unloading").cue, null);
assert.equal(FirstLevelMusicState("Unloading", { shellImpact: true }).cue, null);
assert.equal(FirstLevelMusicState("South").cue, "firstLevelTheRoadSouth");
assert.equal(FirstLevelMusicState("TransferApproach").cue, "firstLevelTheRoadSouth");
assert.equal(FirstLevelMusicState("Death").cue, null);
for (const stage of ["Support", "MachineGun", "Tank", "Transfer", "AirFirst", "FinalDefense"]) {
  assert.equal(FirstLevelMusicState(stage).cue, "firstLevelCloseQuartersPressure", stage);
  assert.equal(FirstLevelMusicState(stage, { failed: true }).cue, null, stage);
}
for (const stage of ["TrenchEntry", "Village", "Melee", "Courtyard", "Rescue", "RetreatFirst", "RetreatWall", "RetreatYard", "Reception"]) {
  assert.equal(FirstLevelMusicState(stage).cue, "firstLevelIronSiege", stage);
}
assert.equal(FirstLevelMusicState("Shelter").cue, null);
assert.equal(FirstLevelMusicState("Orders").cue, "firstLevelTheFrontClosesIn");
assert.equal(FirstLevelMusicState("FinalCarry").cue, "firstLevelKeepYourEyesOpen");
assert.equal(FirstLevelMusicState("Exit").cue, "firstLevelTheLivingStillNeedUs");
assert.equal(FirstLevelMusicState("Transfer").scale, 1);
assert.equal(FirstLevelMusicState("Complete").cue, null);
assert.equal(FirstLevelMusicState("Train", { failed: true }).cue, null);
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
director.Update("FinalDefense"); director.Update("Exit");
assert.equal(calls.at(-1)[0], "firstLevelTheLivingStillNeedUs");
const beforeVillage = calls.length;
director.Update("Village"); director.Update("Melee"); director.Update("Courtyard");
assert.equal(calls.length, beforeVillage + 1, "continuous close combat holds its recording");
assert.equal(calls.at(-1)[0], "firstLevelIronSiege");
director.Update("TransferApproach");
assert.equal(calls.at(-1)[0], "firstLevelTheRoadSouth", "travel leaves battle music");
director.Update("Rescue"); director.Update("RetreatFirst"); director.Update("RetreatWall"); director.Update("RetreatYard"); director.Update("Reception");
assert.equal(calls.at(-1)[0], "firstLevelIronSiege");
director.Update("FinalCarry");
assert.equal(calls.at(-1)[0], "firstLevelKeepYourEyesOpen", "carrying returns to the story cue");
director.Dispose(); assert.equal(calls.at(-1)[0], null);
console.log("PASS nine verified assets; battle assignments, story transitions, silence, dialogue and uninterrupted combat");
