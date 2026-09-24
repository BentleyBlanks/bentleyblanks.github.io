// Speaker gestures (03-06), pure node: the line table (Data_FirstLevelSpeakerGestures) covers every 03-06 line a body
// speaks, rows name existing clips and resolvable targets, the baked clips (Animation/SpeakerGestures) match the
// table's windows, move only one arm and the spine (never neck, head or Face_*), are unit quaternions with seamless
// hold windows, and the bake's own numbers (per-frame step, elbow bend, arm-into-torso depth, lips gap) are in range.
// The browser review on the production rigs is Script_SpeakerGestureClipsBrowserTest.
// Usage: node Taierzhuang1938/Script_SpeakerGestureTest.mjs
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import {
  FIRST_LEVEL_SPEAKER_GESTURES, SPEAKER_GESTURE_CLIPS, SPEAKER_GESTURE_TARGETS, SPEAKER_GESTURE_ASSET, SpeakerGestureForLine,
} from "./Data_FirstLevelSpeakerGestures.mjs";
import { MISSION_DIALOGUE } from "./Data_FirstLevelMissionDialogue.mjs";
import { FRONT_SCENE_IDS } from "./Script_FirstLevelFrontScenes.mjs";
import { FRONT_SORTIE, FRONT_SPACE } from "./Data_FirstLevelFrontRoute.mjs";
import {
  LoadSpeakerGestureClips, SpeakerGestureClip, SampleSpeakerGesture, SpeakerGestureFirstFrame, ResetSpeakerGestureClips,
} from "./Script_SpeakerGestureClips.mjs";

const projectDir = path.dirname(fileURLToPath(import.meta.url));
const animationDir = path.join(projectDir, SPEAKER_GESTURE_ASSET.animationBase);
// The bake's numbers: a gesture is fast (a pointing stroke turns the forearm ~20 deg a frame at 30 fps), but a
// flip is not; the elbow never locks back or folds shut; the arm stays out of the torso beyond cloth depth.
const LIMIT = { stepDeg: 35, seamDeg: 3, elbowMaxDeg: 150, elbowMinDeg: 20, penetrationM: .02, lipsGapM: .07, sampleDeg: .5 };
// Bodies that speak 03-06 lines (Data_FirstLevelSpeakingCast): the model and so the rig their clips come from.
const RIG_OF = { luo: "LugouNra05", zhou: "LugouNra02", heyoutian: "LugouNra02", liuwencai: "LugouNra02", guard: "LugouNra02",
  keeper: "LugouNra02", relief: "LugouNra02", runner: "LugouNra02" };

// ---- the line table ------------------------------------------------------------------------------------------
const cues = new Map(MISSION_DIALOGUE.map(cue => [cue.id, cue]));
const expected = new Set();
let lines = 0, gestures = 0;
for (const id of FRONT_SCENE_IDS) {
  const cue = cues.get(id);
  assert.ok(cue, `front scene ${id} in MISSION_DIALOGUE`);
  const lastGestured = {};
  cue.lines.forEach((line, i) => {
    if (line.who === "shunzi" || line.who === "bearer") return;       // the player; a figure without a skeleton
    const key = `${id}.${String(i + 1).padStart(2, "0")}`;
    expected.add(key); lines++;
    const row = FIRST_LEVEL_SPEAKER_GESTURES[key];
    assert.ok(row, `${key} (${line.who}) has a row`);
    assert.equal(row.who, line.who, `${key} speaker`);
    assert.ok(RIG_OF[row.who], `${key}: ${row.who} is a known 03-06 body`);
    if (row.gesture) {
      gestures++;
      const clip = SPEAKER_GESTURE_CLIPS[row.gesture];
      assert.ok(clip, `${key}: clip ${row.gesture}`);
      assert.equal(SpeakerGestureForLine(key), row);
      // anybody who may hold a rifle gestures with the free (left) hand; only the seated, unarmed 06 Zhou uses the right
      assert.equal(clip.hand, row.pose === "seat" ? "R" : "L", `${key}: ${row.gesture} hand for pose ${row.pose}`);
      if (clip.aim) assert.ok(row.target, `${key}: aimed clip needs a target`);
      // nobody gestures on two of his own lines in a row, except the seated cigarette talk
      if (row.pose !== "seat") assert.ok(!lastGestured[line.who], `${key}: ${line.who} gestured on his previous line too`);
    } else assert.equal(SpeakerGestureForLine(key), null);
    if (row.target) {
      const spec = SPEAKER_GESTURE_TARGETS[row.target];
      assert.ok(spec, `${key}: target ${row.target}`);
      const m = /^(sortie|space):(.+)$/.exec(spec);
      if (m) {
        const point = m[2].split(".").reduce((o, k) => o?.[k], m[1] === "sortie" ? FRONT_SORTIE : FRONT_SPACE);
        assert.ok(Number.isFinite(point?.x) && Number.isFinite(point?.z), `${key}: anchor ${spec} resolves`);
      } else assert.ok(["listener", "tank", "south"].includes(spec), `${key}: target ${spec}`);
    }
    lastGestured[line.who] = !!row.gesture;
  });
}
for (const key of Object.keys(FIRST_LEVEL_SPEAKER_GESTURES)) assert.ok(expected.has(key), `row ${key} is not a 03-06 body line`);
const ratio = gestures / lines;
assert.ok(ratio >= 1 / 3 && ratio <= .55, `about a third to a half of the lines gesture (${gestures}/${lines})`);
assert.equal(SpeakerGestureForLine("NoSuchScene.01"), null);
assert.equal(SpeakerGestureForLine("toString"), null);

// ---- clip windows ----------------------------------------------------------------------------------------------
for (const [name, c] of Object.entries(SPEAKER_GESTURE_CLIPS)) {
  assert.ok(c.hand === "L" || c.hand === "R", name);
  assert.ok(c.duration >= 1 && c.duration <= 2.5, `${name}: 1-2.5 s`);
  assert.ok(0 < c.inS && c.inS <= c.strokeS && c.strokeS < c.outS && c.outS < c.duration, `${name}: in <= stroke < out < end`);
  assert.ok(c.inS <= c.hold[0] + .1 && c.hold[0] < c.hold[1] && c.hold[1] <= c.outS, `${name}: hold inside [in, out]`);
}

// ---- baked clips -----------------------------------------------------------------------------------------------
const read = async file => JSON.parse(fs.readFileSync(path.join(animationDir, file), "utf8"));
const manifest = await read(SPEAKER_GESTURE_ASSET.manifest);
assert.equal(manifest.version, SPEAKER_GESTURE_ASSET.version, "manifest version = SPEAKER_GESTURE_ASSET.version");
assert.equal(manifest.fps, 30);
for (const [name, c] of Object.entries(SPEAKER_GESTURE_CLIPS)) {
  const baked = manifest.clips[name];
  assert.ok(baked, `bake table has ${name}`);
  for (const key of ["hand", "duration", "inS", "strokeS", "outS", "aim"]) assert.equal(baked[key], c[key], `${name}.${key}: bake = table`);
  assert.deepEqual(baked.hold, c.hold, `${name}.hold: bake = table`);
  assert.equal(baked.reach ?? null, c.reach ?? null, `${name}.reach: bake = table`);
  assert.ok(Math.abs(c.duration * manifest.fps - Math.round(c.duration * manifest.fps)) < 1e-9, `${name}: whole frames`);
}
const rigs = [...new Set(Object.values(RIG_OF))];
let totalBytes = 0;
for (const modelId of rigs) {
  const row = manifest.models.find(m => m.id === modelId);
  assert.ok(row, `manifest has ${modelId}`);
  const file = path.join(animationDir, row.file);
  const bytes = fs.readFileSync(file);
  totalBytes += bytes.length;
  assert.equal(crypto.createHash("sha256").update(bytes).digest("hex"), row.sha256, `${row.file} hash`);
  const glb = fs.readFileSync(path.join(projectDir, "Model/Character", `Model_${modelId}.glb`));
  assert.equal(crypto.createHash("sha256").update(glb).digest("hex"), row.originalModelSha256, `${modelId}: baked on the shipped GLB`);
  const asset = JSON.parse(bytes);
  assert.equal(asset.stride, 4);
  assert.deepEqual(Object.keys(asset.clips).sort(), Object.keys(SPEAKER_GESTURE_CLIPS).sort(), `${modelId}: every clip`);
  for (const [name, clip] of Object.entries(asset.clips)) {
    const spec = SPEAKER_GESTURE_CLIPS[name], label = `${modelId} ${name}`;
    assert.equal(clip.hand, spec.hand, label);
    assert.equal(clip.frameCount, Math.round(spec.duration * manifest.fps) + 1, `${label}: frames`);
    assert.equal(clip.values.length, clip.frameCount * clip.bones.length * 4, `${label}: values`);
    const own = spec.hand + " ";
    for (const bone of clip.bones) {
      assert.ok(!/Neck|Head|Face_|Pelvis|Thigh|Calf|Foot|Toe/.test(bone), `${label}: never writes ${bone}`);
      assert.ok(bone.includes(" " + own) || /Spine\d?$/.test(bone), `${label}: ${bone} is the gesture arm or the spine`);
    }
    assert.ok(clip.bones.some(b => b.endsWith(own + "UpperArm")) && clip.bones.some(b => b.endsWith(own + "Hand")), `${label}: arm bones`);
    for (let i = 0; i < clip.values.length; i += 4) {
      const [x, y, z, w] = clip.values.slice(i, i + 4);
      assert.ok([x, y, z, w].every(Number.isFinite), `${label}: finite`);
      assert.ok(Math.abs(Math.hypot(x, y, z, w) - 1) < 1e-3, `${label}: unit quaternion`);
    }
    if (spec.reach) {
      const anchor = asset.anchors?.[spec.reach];
      assert.ok(anchor && /Head$/.test(anchor.bone) && anchor.offset.every(Number.isFinite), `${label}: reach anchor ${spec.reach} on the head`);
    }
    if (spec.aim) assert.ok(clip.strokeDir?.length === 3 && Math.abs(Math.hypot(...clip.strokeDir) - 1) < 1e-3, `${label}: strokeDir`);
    const v = asset.validation[name];
    assert.ok(v?.finite, `${label}: bake finite`);
    assert.ok(v.maxStepDeg <= LIMIT.stepDeg, `${label}: per-frame step ${v.maxStepDeg} deg (${v.maxStepAt})`);
    assert.ok(v.holdSeamDeg <= LIMIT.seamDeg, `${label}: hold seam ${v.holdSeamDeg} deg`);
    assert.ok(v.elbowBendDeg[0] >= LIMIT.elbowMinDeg && v.elbowBendDeg[1] <= LIMIT.elbowMaxDeg, `${label}: elbow ${v.elbowBendDeg}`);
    assert.ok(v.penetrationM <= LIMIT.penetrationM, `${label}: arm into torso ${v.penetrationM} m at ${v.penetrationAt}`);
    if (name === "GestureToMouthR") assert.ok(v.lipsGapM <= LIMIT.lipsGapM, `${label}: finger roots ${v.lipsGapM} m from the lips`);
  }
}
// Download: only the two rigs, loaded in 01-06 only (well under a megabyte raw).
assert.ok(totalBytes < 1_000_000, `gesture clips ${totalBytes} bytes`);

// ---- sampler ---------------------------------------------------------------------------------------------------
ResetSpeakerGestureClips();
const library = await LoadSpeakerGestureClips(read);
for (const modelId of rigs) for (const name of Object.keys(SPEAKER_GESTURE_CLIPS)) {
  const record = SpeakerGestureClip(modelId, name, library);
  assert.ok(record && record.fps === 30 && record.spec === SPEAKER_GESTURE_CLIPS[name], `${modelId} ${name} record`);
  const first = SpeakerGestureFirstFrame(record, []), at0 = SampleSpeakerGesture(record, 0, []);
  first.forEach((q, k) => assert.ok(q.angleTo(at0[k]) < 2e-3, "t=0 is the first frame"));
  // on a frame: that frame exactly; between frames: between them; past the end: the last frame
  const n = record.keys.length, frame = 7, at = SampleSpeakerGesture(record, frame / record.fps, []);
  for (let k = 0; k < n; k++) {
    const o = (frame * n + k) * 4, q = at[k], len = Math.hypot(...record.values.slice(o, o + 4));
    assert.ok(Math.abs(Math.abs(q.x * record.values[o] + q.y * record.values[o + 1] + q.z * record.values[o + 2] + q.w * record.values[o + 3]) / len - 1) < 1e-5);
  }
  const end = SampleSpeakerGesture(record, 99, []), before = SampleSpeakerGesture(record, record.duration, []);
  end.forEach((q, k) => assert.ok(q.angleTo(before[k]) < 2e-3, "clamped past the end"));
  // the hold window's two ends sample to the same pose (the layer repeats it)
  const a = SampleSpeakerGesture(record, record.spec.hold[0], []), b = SampleSpeakerGesture(record, record.spec.hold[1], []);
  a.forEach((q, k) => assert.ok(q.angleTo(b[k]) * 180 / Math.PI <= LIMIT.seamDeg, `${modelId} ${name}: hold seam at runtime`));
  assert.ok(record.spine.filter(Boolean).length === 3, `${modelId} ${name}: three spine bones`);
}

console.log(`ok speaker gestures: ${lines} lines, ${gestures} gesture (${Math.round(ratio * 100)} %), ${Object.keys(SPEAKER_GESTURE_CLIPS).length} clips x ${rigs.length} rigs, ${totalBytes} bytes`);
