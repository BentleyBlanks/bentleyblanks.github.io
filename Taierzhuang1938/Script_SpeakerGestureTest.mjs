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
import * as THREE from "three";
import { SpeakerGestureLayer, SpeakerGestureBusy, SpeakerGestureTargetPoint, SetSpeakerGestureWorld } from "./Script_SpeakerGestureLayer.mjs";
import { SpeakerHeadLayer } from "./Script_SpeakerHeadLayer.mjs";
import { SPEAKER_GESTURE as GT } from "./Data_Tuning_CharacterSpeech.mjs";

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

// ---- runtime layer on a stub Biped (weights, stroke on stress, suppression, restore, rifle hold, aim) -----------
// The stub's bone lengths are made up; the layer's clock, weights and bone bookkeeping do not depend on them, and
// the aim is checked against the stub's own FK. The production-rig check is Script_SpeakerGestureLayerBrowserTest.
function StubRig(modelId, { armed = false } = {}) {
  const root = new THREE.Group(), bone = (name, parent, x, y, z) => {
    const b = new THREE.Bone(); b.name = name.replace(/ /g, "_"); b.position.set(x, y, z); parent.add(b); return b;
  };
  const pelvis = bone("Bip002 Pelvis", root, 0, .95, 0), spine = bone("Bip002 Spine", pelvis, 0, .1, 0);
  const spine1 = bone("Bip002 Spine1", spine, 0, .12, 0), spine2 = bone("Bip002 Spine2", spine1, 0, .12, 0);
  const neck = bone("Bip002 Neck", spine2, 0, .16, 0), head = bone("Bip002 Head", neck, 0, .1, 0);
  const sides = {};
  for (const [s, x] of [["L", -1], ["R", 1]]) {
    const clav = bone(`Bip002 ${s} Clavicle`, neck, .03 * x, -.03, 0), upper = bone(`Bip002 ${s} UpperArm`, clav, .15 * x, 0, 0);
    const fore = bone(`Bip002 ${s} Forearm`, upper, .28 * x, 0, 0), hand = bone(`Bip002 ${s} Hand`, fore, .25 * x, 0, 0);
    for (let f = 0; f <= 4; f++) {
      let parent = hand;
      for (const suffix of ["", "1", "2"]) parent = bone(`Bip002 ${s} Finger${f}${suffix}`, parent, .03 * x, 0, (f - 2) * .01);
    }
    const grip = new THREE.Object3D(); grip.position.set(.06 * x, 0, 0); hand.add(grip);
    sides[s] = { clav, upper, fore, hand, grip };
  }
  root.updateMatrixWorld(true);
  const rig = { root, modelId, clipModelId: modelId, bones: { head, neck, pelvis }, facial: { lastSpeech: null, stress: 0 },
    Grip: role => (role === "weaponL" ? sides.L.grip : role === "weaponR" ? sides.R.grip : null), sides };
  rig.actor = { root, weaponGroup: armed ? { visible: true } : null, weaponTwoHanded: armed, weaponData: armed ? { kind: "boltRifle" } : null };
  rig.rest = new Map(); root.traverse(o => { if (o.isBone) rig.rest.set(o, o.quaternion.clone()); });
  return rig;
}
// One frame of a driven line: speech from `line` (null = silent), state from `busy`.
function RunLine(layer, rig, { lineId, who, lengthS, stressAt = [], seconds, busyFrom = Infinity, state = {} }) {
  const out = [], dt = 1 / 60;
  for (let f = 0; f < Math.round(seconds / dt); f++) {
    const t = f * dt, live = t < lengthS;
    const stress = Math.max(0, ...stressAt.map(s => 1 - Math.abs(t - s) / .08));
    rig.facial.lastSpeech = live ? { active: true, who, lineId, cue: lineId.split(".")[0], sourceTime: t, stress } : null;
    layer.Apply(dt, t >= busyFrom ? { ...state, firing: true } : state);
    layer.AfterHead();
    out.push({ ...layer.state, clipT: layer.state.t, t });   // t: line time; clipT: the clip's clock
  }
  return out;
}
{
  // Luo points at the right position (FrontBlockade.02, GesturePointL) with a rifle in both hands.
  const rig = StubRig("LugouNra05", { armed: true }), layer = new SpeakerGestureLayer(rig, { lookAt: new THREE.Vector3(0, 1.6, 5) });
  rig.root.position.set(FRONT_SORTIE.nest.x - 30, 0, FRONT_SORTIE.nest.z);   // 30 m west of the nest
  rig.root.rotation.y = -Math.PI / 2;            // front (-Z) turned to +X: facing the nest
  rig.root.updateMatrixWorld(true);
  const leftBefore = rig.sides.L.grip.getWorldPosition(new THREE.Vector3());
  const leftInRight = rig.sides.R.grip.worldToLocal(leftBefore.clone());   // the rifle's two grips, rigid
  const rows = RunLine(layer, rig, { lineId: "FrontBlockade.02", who: "luo", lengthS: 1.6, stressAt: [.7], seconds: 4 });
  const spec = SPEAKER_GESTURE_CLIPS.GesturePointL;
  const up = rows.filter(r => r.weight > .5);
  assert.ok(up.length >= 40, `point: weight > .5 on ${up.length} frames while the line plays`);
  assert.ok(rows.every(r => r.clip === null || r.clip === "GesturePointL"));
  // Stroke on the stress: the arm waits lifted until the stress edge (pulse over .5 from .66 s), then strikes.
  const stroke = rows.find(r => r.clip && r.phase === "hold");
  assert.ok(stroke && stroke.t >= .66 - 1e-6 && stroke.t < .66 + .2, `point: stroke after the stress edge (hold from ${stroke?.t.toFixed(2)} s)`);
  assert.ok(rows.some(r => r.phase === "wait" && r.t > .3), "point: the lifted arm waited for the stress");
  // Released after the line: weight 0 and the arm back on the rest pose within tail + release.
  const after = rows.filter(r => r.t > 1.6 + spec.duration);
  assert.ok(after.length && after.every(r => r.weight === 0 && r.clip === null), "point: arm back after the line");
  layer.Apply(1 / 60, {});
  for (const [b, q] of rig.rest) assert.ok(b.quaternion.angleTo(q) < 1e-6, `restore: ${b.name} back on its base`);
  // Aim: pointed at the nest (in the cone), shoulder -> hand within a few degrees of it at the hold.
  const aimed = rows.filter(r => r.phase === "hold" && r.aimError !== null);
  assert.ok(aimed.length && Math.min(...aimed.map(r => r.aimError)) < 4, `point: aim error ${Math.min(...aimed.map(r => r.aimError))} deg`);
  assert.ok(aimed.every(r => !r.clamped), "point: the nest is inside the cone");
  assert.ok(layer.lines["FrontBlockade.02"].gestureFrames >= 40, "per-line gestureFrames");
  // Rifle: the held left grip keeps its place relative to the right grip (the spine lean moves both hands; the
  // rifle goes with the right hand, never with the gesturing left one).
  rig.facial.lastSpeech = { active: true, who: "luo", lineId: "FrontBlockade.01x", sourceTime: 0, stress: 0 };
  const layer2 = new SpeakerGestureLayer(rig, null);
  const rows2 = RunLine(layer2, rig, { lineId: "FrontBlockade.02", who: "luo", lengthS: 1.6, stressAt: [.4], seconds: .9 });
  assert.ok(rows2.at(-1).weight > .5);
  const held = new THREE.Vector3();
  assert.ok(layer2.HeldLeftGrip(held), "two-handed: the layer holds the left grip");
  const heldInRight = rig.sides.R.grip.worldToLocal(held.clone());
  assert.ok(heldInRight.distanceTo(leftInRight) < 1e-4, `held left grip ${heldInRight.distanceTo(leftInRight)} m off the rifle's grip pair`);
  assert.ok(rig.sides.L.grip.getWorldPosition(new THREE.Vector3()).distanceTo(leftBefore) > .05, "the left hand itself moved");
  layer2.Dispose();
  // Firing from the start: no gesture at all; firing mid-gesture: gone within fadeS.
  const layer3 = new SpeakerGestureLayer(rig, null);
  const firing = RunLine(layer3, rig, { lineId: "FrontBlockade.02", who: "luo", lengthS: 1.6, stressAt: [.4], seconds: 2, busyFrom: 0 });
  assert.ok(firing.every(r => r.weight === 0), "firing: weight 0 throughout");
  assert.equal(layer3.lines["FrontBlockade.02"].gestureFrames, 0);
  assert.ok(firing.some(r => r.suppressed === "firing"), "firing: reported as suppressed");
  const layer4 = new SpeakerGestureLayer(rig, null);
  const cut = RunLine(layer4, rig, { lineId: "FrontBlockade.02", who: "luo", lengthS: 1.6, stressAt: [.4], seconds: 2, busyFrom: .8 });
  assert.ok(cut.some(r => r.t < .8 && r.weight > .9), "busy later: gesture up before");
  assert.ok(cut.filter(r => r.t >= .8 + GT.fadeS + 1 / 60).every(r => r.weight === 0), "busy later: weight 0 after fadeS");
  // A line without a gesture row, and another speaker's line: nothing.
  const layer5 = new SpeakerGestureLayer(rig, null);
  assert.ok(RunLine(layer5, rig, { lineId: "FrontBlockade.03", who: "luo", lengthS: 1.2, seconds: 1.4 }).every(r => r.weight === 0));
  assert.ok(RunLine(layer5, rig, { lineId: "FrontBlockade.01", who: "luo", lengthS: 1.2, seconds: 1.4 }).every(r => r.weight === 0),
    "a row for zhou does not play on luo");
}
{
  // Seated Zhou offers the cigarette (BorrowLight.07, GestureOfferR, aimed at the listener); a long line holds the
  // arm at most maxHoldS, then releases while he still talks. Armed: the right hand is on the rifle, refused.
  const rig = StubRig("LugouNra02"), listener = new THREE.Vector3(1.2, 1.5, -2);
  const layer = new SpeakerGestureLayer(rig, { lookAt: () => listener });
  const rows = RunLine(layer, rig, { lineId: "BorrowLight.07", who: "zhou", lengthS: 6, stressAt: [.5, 1.4, 2.3], seconds: 7 });
  const spec = SPEAKER_GESTURE_CLIPS.GestureOfferR;
  assert.ok(rows.filter(r => r.weight > .5).length >= 60, "offer: gesture up");
  const lastUp = rows.filter(r => r.weight > 0).at(-1);
  assert.ok(lastUp.t < 6, `offer: released before the 6 s line ended (last weight at ${lastUp.t.toFixed(2)} s)`);
  assert.ok(lastUp.t > spec.strokeS + GT.maxHoldS - .2, "offer: held about maxHoldS");
  assert.ok(rows.filter(r => r.phase === "hold" && r.aimError !== null).some(r => r.aimError < 6), "offer: aimed at the listener");
  const armed = StubRig("LugouNra02", { armed: true }), layer2 = new SpeakerGestureLayer(armed, null);
  const refused = RunLine(layer2, armed, { lineId: "BorrowLight.07", who: "zhou", lengthS: 2, seconds: 2.2 });
  assert.ok(refused.every(r => r.weight === 0) && layer2.state.suppressed === "rightHandOnWeapon", "right-hand clip refused with a rifle");
  // The reach clip lands on the head anchor (the stub has no face; only that it runs and reports a distance).
  const layer3 = new SpeakerGestureLayer(rig, null);
  const mouth = RunLine(layer3, rig, { lineId: "BorrowLight.03", who: "zhou", lengthS: 1.6, stressAt: [.3], seconds: 1.2 });
  assert.ok(mouth.some(r => r.clip === "GestureToMouthR" && r.weight > .9) && Number.isFinite(layer3.state.reachError), "to-mouth: reach ran");
}
{
  // Busy reasons, targets and the head layer owning the gesture layer.
  const rig = { actor: {}, infantry: null };
  assert.equal(SpeakerGestureBusy(rig, {}), null);
  for (const [state, why] of [[{ firing: true }, "firing"], [{ aim: .5 }, "aiming"], [{ meleeCombat: {} }, "melee"],
    [{ carryRole: "front" }, "carrying"], [{ prone: 1 }, "prone"], [{ moveSpeed: .8 }, "moving"], [{ dead: true }, "dead"]]) {
    assert.equal(SpeakerGestureBusy(rig, state), why);
  }
  assert.equal(SpeakerGestureBusy({ openingActorPerformanceState: {} }, {}), "director");
  const root = new THREE.Object3D(); root.position.set(5, 2, 7); root.updateMatrixWorld(true);
  SetSpeakerGestureWorld({ ground: () => 3, tank: () => ({ x: 40, z: -120 }) });
  assert.deepEqual(SpeakerGestureTargetPoint("rightNest", { root }).toArray(), [FRONT_SORTIE.nest.x, 3 + GT.pointRiseM, FRONT_SORTIE.nest.z]);
  assert.deepEqual(SpeakerGestureTargetPoint("south", { root }).toArray(), [5, 2 + GT.pointRiseM, 7 + GT.southM]);
  assert.deepEqual(SpeakerGestureTargetPoint("tank", { root }).toArray(), [40, 3 + GT.tankRiseM, -120]);
  SetSpeakerGestureWorld({});
  assert.equal(SpeakerGestureTargetPoint("tank", { root }), null, "no tank provider: no tank point");
  const stub = StubRig("LugouNra02"), head = new SpeakerHeadLayer(stub, 3);
  assert.ok(stub.speakerGesture instanceof SpeakerGestureLayer && head.gesture === stub.speakerGesture, "head layer owns rig.speakerGesture");
  head.Dispose();
  assert.equal(stub.speakerGesture, null, "disposed with the head layer");
}

console.log(`ok speaker gestures: ${lines} lines, ${gestures} gesture (${Math.round(ratio * 100)} %), ${Object.keys(SPEAKER_GESTURE_CLIPS).length} clips x ${rigs.length} rigs, ${totalBytes} bytes; runtime layer on a stub rig`);
