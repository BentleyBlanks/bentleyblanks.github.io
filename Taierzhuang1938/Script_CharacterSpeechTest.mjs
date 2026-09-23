import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import * as THREE from 'three';
import { BuildSpeechEnvelope, SampleSpeechEnvelope } from './Script_SpeechEnvelope.mjs';
import { FirstLevelMissionVoice } from './Script_FirstLevelMissionVoice.mjs';
import { CharacterFacialAnimation } from './Script_CharacterFacialAnimation.mjs';
import { FirstLevelSpeakerBinder, ParseLineId, WhoForLine, FIRST_LEVEL_SPEAKER_ROLES } from './Script_FirstLevelSpeakerBinder.mjs';
import { SpeakerLookAngles, SpeakerHeadLayer } from './Script_SpeakerHeadLayer.mjs';
import { FIRST_LEVEL_SPEAKING_CAST, SpeakingCastOptions, FIRST_LEVEL_FACE_STEPS, FIRST_LEVEL_WHOLE_LEVEL_SPEAKERS,
  FACED_FRONT_GUARD_INDEX } from './Data_FirstLevelSpeakingCast.mjs';
import { FIRST_LEVEL_STAGES } from './Data_FirstLevelMissionStages.mjs';
import { FRONT_GUARD_POSTS } from './Data_FirstLevelMissionFront.mjs';
import { FRONT_BATTLE_TUNING } from './Data_Tuning_FirstLevelFront.mjs';
import { IsApprovedCharacterVariant } from './Data_CharacterSelection.mjs';
import { MISSION_DIALOGUE } from './Data_FirstLevelMissionDialogue.mjs';
import { CHARACTER_SPEECH as C, FACE_TRACK_BAKE } from './Data_Tuning_CharacterSpeech.mjs';
import { MissionVoiceAlignmentCues } from './Data_FirstLevelMissionDialogue.mjs';
import { MISSION_VOICE_ALIGNMENT } from './Data_FirstLevelMissionVoiceAlignment.mjs';
import { HanReadings, FINAL_VISEMES, INITIAL_ONSET, KANA_VOWELS, KANA_SMALL, KANA_SPECIAL, KANA_ONSET, KANA_VOWEL_VISEME,
  VISEMES } from './Data_FaceTrackPhonemes.mjs';
import { ClearFaceTracks, FaceTrack, FaceTrackSpeech, RegisterFaceTracks, SampleFaceTrack, SampleLineFaceTrack } from './Script_FaceTrack.mjs';

// ---- runtime envelope fallback and the voice clock (unchanged contract) ----
const sampleRate = 16000, samples = new Float32Array(sampleRate * 2);
for (let i = sampleRate / 4; i < sampleRate * .8; i++) samples[i] = .2 * Math.sin(i * Math.PI * 400 / sampleRate);
for (let i = sampleRate * 1.2; i < sampleRate * 1.7; i++) samples[i] = .12 * Math.sin(i * Math.PI * 2400 / sampleRate);
const envelope = BuildSpeechEnvelope({sampleRate, length: samples.length, numberOfChannels: 1, duration: 2, getChannelData: () => samples});
assert.equal(SampleSpeechEnvelope(envelope, .1).level, 0);
assert.equal(SampleSpeechEnvelope(envelope, 1).level, 0);
assert.ok(SampleSpeechEnvelope(envelope, .5).level > .8);
assert.ok(SampleSpeechEnvelope(envelope, 1.4).brightness > SampleSpeechEnvelope(envelope, .5).brightness);
assert.equal(SampleSpeechEnvelope(envelope, 2).level, 0);
let clock = 10;
const playing = {}, parallel = {};
const audio = {storyVoice: playing, voiceBank: new Map([['MissionTest', {speechEnvelope: envelope}]]), StopStoryVoice() {this.storyVoice = null;}};
const director = new FirstLevelMissionVoice({audio, hud: {}, Clock: () => clock});
director.current = {cue: {id: 'Test', lines: [{who: 'luo'}, {who: 'yaowa'}]},
  plan: {lines: [[0, 1], [1, 2]], segments: [{start: 0, end: 2}]}, voice: playing,
  clock: 10, clockSource: 0, sourceTime: 0, phase: 'playing', segmentIndex: 0, parallel: []};
clock = 10.5;
assert.ok(director.Speech('luo').level > .8, 'audio clock drives the mouth even before another simulation tick');
director.Pause();assert.equal(director.Speech('luo'), null, 'pause closes mouth');
director.paused = false;audio.storyVoice = playing;clock = 11.4;
assert.equal(director.Speech('luo'), null, 'another speaker in the same recording cannot animate Luo');
director.current.parallel = [{...director.current, voice: parallel, clock: 11, parallel: undefined,
  cue: {id: 'Test', lines: [{who: 'luo'}]}, plan: {lines: [[0, 2]]}}];
assert.ok(director.Speech('luo').level > .8, 'parallel briefing uses its own source time');
audio.voiceMute = true;assert.equal(director.Speech('luo'), null);
audio.voiceMute = false;parallel.reclaimed = true;assert.equal(director.Speech('luo'), null, 'stopped audio cannot continue speaking');
director.current.parallel = [];director.current.phase = 'waiting';clock = 10.5;
assert.equal(director.Speech('luo'), null, 'event-gated segment waits stay closed');

// ---- facial GLB contracts (Script_BakeCharacterFacial.py output) ----
const MANIFEST = JSON.parse(fs.readFileSync(new URL('./Model/Character/Data_LugouCharacterManifest.json', import.meta.url), 'utf8'));
function Glb(file) {
  const b = fs.readFileSync(new URL(file.replace(/^\.\//, './'), import.meta.url));
  const length = b.readUInt32LE(12);
  return {bytes: b, doc: JSON.parse(b.subarray(20, 20 + length)), bin: b.subarray(28 + length)};
}
function Read(glb, index) {
  const a = glb.doc.accessors[index], v = glb.doc.bufferViews[a.bufferView];
  const n = {SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16}[a.type], ctor = {5126: Float32Array, 5123: Uint16Array, 5125: Uint32Array, 5121: Uint8Array}[a.componentType];
  const stride = v.byteStride || ctor.BYTES_PER_ELEMENT * n, out = new Float64Array(a.count * n);
  const view = new DataView(glb.bin.buffer, glb.bin.byteOffset + (v.byteOffset || 0) + (a.byteOffset || 0));
  const scale = a.normalized ? {5121: 255, 5123: 65535}[a.componentType] : 1;
  for (let i = 0; i < a.count; i++) for (let c = 0; c < n; c++) {
    const o = i * stride + c * ctor.BYTES_PER_ELEMENT;
    const value = ctor === Float32Array ? view.getFloat32(o, true) : ctor === Uint16Array ? view.getUint16(o, true)
      : ctor === Uint32Array ? view.getUint32(o, true) : view.getUint8(o);
    out[i * n + c] = value / scale;
  }
  return {values: out, n, count: a.count};
}
const LEGACY_BONES = ['Face_Jaw', 'Face_LipLower', 'Face_LipUpper', 'Face_CornerL', 'Face_CornerR', 'Face_BrowL',
  'Face_LidUpperL', 'Face_LidLowerL', 'Face_BrowR', 'Face_LidUpperR', 'Face_LidLowerR'];
const POSES = ['Rest', 'Open', 'Wide', 'Round', 'Close', 'Blink', 'BrowUp', 'Snarl', 'DeadSlack'];
const faced = MANIFEST.models.filter(record => record.facialUrl);
assert.deepEqual(faced.map(r => r.id).sort(), ['LugouIja01', 'LugouIja02', 'LugouIja06', 'LugouNra02', 'LugouNra05', 'LugouNra06']);
const definitions = {};
for (const record of faced) {
  const face = Glb(record.facialUrl), source = Glb(record.url);
  const label = record.id;
  assert.ok(face.bytes.length <= 1.5 * 1024 * 1024, `${label} facial GLB within 1.5 MB (contract section 6): ${face.bytes.length}`);
  assert.equal(crypto.createHash('sha256').update(face.bytes).digest('hex').slice(0, 16), record.facialVersion, `${label} facialVersion is the file hash`);
  assert.ok(!face.doc.images && !face.doc.textures, `${label}: no duplicated textures (rebound to the base GLB by material name)`);
  assert.ok(!face.doc.animations, `${label}: body clips come from the base GLB`);
  const rig = face.doc.extras.facialRig;
  definitions[label] = rig;
  assert.equal(rig.schema, 2); assert.equal(rig.materialsFrom, 'base'); assert.equal(rig.animationsFrom, 'base');
  for (const bone of [...LEGACY_BONES, 'Face_EyeL', 'Face_EyeR']) assert.ok(rig.bones.includes(bone), `${label} has ${bone}`);
  assert.equal(face.doc.skins[0].joints.length, source.doc.skins[0].joints.length + rig.bones.length);
  for (const pose of POSES) assert.ok(rig.poses[pose], `${label} pose ${pose}`);
  assert.deepEqual(rig.eyes.bones, ['Face_EyeL', 'Face_EyeR']);
  // Original bones, sockets and mesh node untouched; face joints appended under the head.
  for (let i = 0; i < source.doc.nodes.length; i++) {
    const original = {...source.doc.nodes[i]}, updated = {...face.doc.nodes[i]};
    for (const key of ['children', 'extras']) { delete original[key]; delete updated[key]; }
    assert.deepEqual(updated, original, `${label} original node preserved: ${original.name}`);
  }
  // Every body surface material exists by name in the base GLB (runtime rebinding).
  const baseMaterials = new Set(source.doc.materials.map(m => m.name));
  const prims = face.doc.meshes[0].primitives, basePrims = source.doc.meshes[0].primitives;
  assert.equal(prims.length, basePrims.length + 1, `${label}: one merged oral primitive`);
  for (let i = 0; i < basePrims.length; i++) {
    assert.ok(baseMaterials.has(face.doc.materials[prims[i].material].name), `${label} prim ${i} material rebinds by name`);
    assert.equal(face.doc.materials[prims[i].material].name, source.doc.materials[basePrims[i].material].name);
    const a = Read(face, prims[i].attributes.POSITION), b = Read(source, basePrims[i].attributes.POSITION);
    if (a.count === b.count) {
      let error = 0; for (let k = 0; k < a.values.length; k++) error = Math.max(error, Math.abs(a.values[k] - b.values[k]));
      assert.ok(error < 1e-6, `${label} prim ${i} positions unchanged`);
    } else {
      // The lip cut duplicates a few seam vertices of the head (sealed lips).
      assert.ok(a.count > b.count && a.count - b.count < 16, `${label} prim ${i} lip cut adds a few vertices`);
    }
  }
  const oral = prims.at(-1);
  assert.equal(face.doc.materials[oral.material].name, 'Material_FacialOral');
  assert.ok(oral.attributes.COLOR_0 !== undefined && oral.indices !== undefined, `${label} oral: indexed, vertex coloured`);
  const oralTriangles = face.doc.accessors[oral.indices].count / 3;
  assert.ok(oralTriangles < 2300, `${label} oral triangles ${oralTriangles}`);
  // Pose masks: blinking never opens the jaw, opening the mouth never lifts the brows.
  const moved = (pose, bone) => {
    const a = rig.poses[pose][bone], r = rig.poses.Rest[bone];
    return Math.hypot(...a.translation.map((x, k) => x - r.translation[k])) > 1e-4
      || Math.abs(Math.abs(a.rotation.reduce((s, x, k) => s + x * r.rotation[k], 0)) - 1) > 1e-6;
  };
  assert.ok(moved('Open', 'Face_Jaw') && !moved('Open', 'Face_BrowL'), `${label} Open: jaw only-mouth`);
  assert.ok(moved('Blink', 'Face_LidUpperL') && !moved('Blink', 'Face_Jaw'), `${label} Blink: lids only`);
  assert.ok(moved('DeadSlack', 'Face_Jaw') && moved('BrowUp', 'Face_BrowR') && moved('Close', 'Face_LipLower'));
}

// ---- speaking cast: pinned approved appearance with a face for every 01-06 speaker ----
for (const [castId, spec] of Object.entries(FIRST_LEVEL_SPEAKING_CAST)) {
  assert.ok(IsApprovedCharacterVariant(spec.actorKind, spec.modelVariant, castId), `${castId}: approved appearance`);
  const id = `Lugou${spec.actorKind === 'nra' ? 'Nra' : 'Ija'}${String(spec.modelVariant + 1).padStart(2, '0')}`;
  const record = MANIFEST.models.find(r => r.id === id);
  assert.ok(record?.facialCast?.includes(castId), `${castId} is in ${id}.facialCast`);
  assert.deepEqual(SpeakingCastOptions(castId), {castId, modelVariant: spec.modelVariant});
}
for (const record of faced) for (const castId of record.facialCast) assert.ok(FIRST_LEVEL_SPEAKING_CAST[castId], `${castId} pinned`);
for (const who of ['luo', 'yaowa', 'heyoutian', 'liuwencai', 'comrade', 'runner', 'shouter', 'guard', 'interpreter',
  'ijaA', 'ijaB', 'ijaC', 'ijaD', 'zhou', 'relief', 'keeper']) assert.ok(FIRST_LEVEL_SPEAKING_CAST[who], `01-06 speaker ${who} has a pinned face`);
assert.equal(FIRST_LEVEL_SPEAKING_CAST.ijaB.modelVariant, 0, '日兵乙 wears IJA01 (IJA03 mouth is closed geometry)');
assert.deepEqual(FIRST_LEVEL_SPEAKING_CAST.interpreter, {actorKind: 'nra', modelVariant: 5}, 'the interpreter wears NRA06 (user, 2026-09-24)');
assert.deepEqual(FIRST_LEVEL_SPEAKING_CAST.ijaA, {actorKind: 'ija', modelVariant: 5}, '日兵甲 wears the standard IJA06 (user, 2026-09-24)');
assert.deepEqual(SpeakingCastOptions('nobody'), {});

// ---- face controller on the real NRA02 rig definition ----
function FaceRoot(rig) {
  const root = new THREE.Group(), head = new THREE.Object3D(); head.name = 'Head'; root.add(head);
  const byName = {};
  for (const name of rig.bones) {
    const bone = new THREE.Bone(); bone.name = name;
    bone.position.fromArray(rig.poses.Rest[name].translation); bone.quaternion.fromArray(rig.poses.Rest[name].rotation);
    byName[name] = bone;
  }
  for (const name of rig.bones) (name === 'Face_LipLower' ? byName.Face_Jaw : head).add(byName[name]);
  root.updateMatrixWorld(true);
  return {root, byName};
}
const jawAngle = (bone, rig) => 2 * Math.acos(Math.min(1, Math.abs(bone.quaternion.dot(new THREE.Quaternion().fromArray(rig.poses.Rest.Face_Jaw.rotation))))) * 180 / Math.PI;
{
  const rig = definitions.LugouNra02, {root, byName} = FaceRoot(rig);
  const face = new CharacterFacialAnimation(root, rig, {seed: 7});
  // Silence: lips closed, only a tiny breathing drift.
  let maxSilentJaw = 0;
  for (let i = 0; i < 300; i++) { face.Update(1 / 60, {}); maxSilentJaw = Math.max(maxSilentJaw, jawAngle(byName.Face_Jaw, rig)); }
  assert.ok(maxSilentJaw < 1.0, `silent jaw stays nearly closed (${maxSilentJaw.toFixed(2)} deg)`);
  // Baked face track channels drive the jaw and lip shapes additively.
  for (let i = 0; i < 20; i++) face.Update(1 / 60, {speech: {active: true, jaw: .9, wide: 0, round: .8, close: 0, stress: 0}});
  const open = jawAngle(byName.Face_Jaw, rig);
  assert.ok(open > 8, `face track opens the jaw (${open.toFixed(1)} deg)`);
  const cornerRound = byName.Face_CornerL.position.clone();
  for (let i = 0; i < 20; i++) face.Update(1 / 60, {speech: {active: true, jaw: .9, wide: 1, round: 0, close: 0, stress: 0}});
  assert.ok(byName.Face_CornerL.position.distanceTo(cornerRound) > .2, 'wide and round are different mouth shapes');
  // A closure (m/b/p) presses the lips with the jaw shut.
  for (let i = 0; i < 20; i++) face.Update(1 / 60, {speech: {active: true, jaw: 0, wide: 0, round: 0, close: 1, stress: 0}});
  assert.ok(jawAngle(byName.Face_Jaw, rig) < 1 && face.close > .9, 'closure keeps the jaw shut');
  // Stress lifts the brows (only stress does), then settles.
  const browRest = byName.Face_BrowL.position.clone();
  for (let i = 0; i < 20; i++) face.Update(1 / 60, {speech: {active: true, jaw: .5, wide: .3, round: 0, close: 0, stress: 0}});
  assert.ok(byName.Face_BrowL.position.distanceTo(browRest) < .02, 'an open jaw alone does not lift the brows');
  face.Update(1 / 60, {speech: {active: true, jaw: .6, wide: .3, round: 0, close: 0, stress: 1}});
  assert.ok(face.brow > .5 && face.stress > .5, 'stress event lifts the brows and feeds the nod');
  // Envelope fallback still works (no face track yet).
  for (let i = 0; i < 20; i++) face.Update(1 / 60, {speech: {active: true, level: .9, brightness: .1}});
  assert.ok(jawAngle(byName.Face_Jaw, rig) > 8 && face.round > face.wide, 'envelope fallback: dark voice rounds the lips');
  // Voice stops: mouth closes within a few frames.
  for (let i = 0; i < 12; i++) face.Update(1 / 60, {speech: null});
  assert.ok(jawAngle(byName.Face_Jaw, rig) < 1.5, 'mouth closes when the line ends');
  // Death: slack jaw, still afterwards.
  face.Update(0, {dead: true, deathBlend: 1});
  const slack = jawAngle(byName.Face_Jaw, rig); const held = byName.Face_Jaw.quaternion.clone();
  face.Update(0, {dead: true, deathBlend: 1});
  assert.ok(slack > 5 && byName.Face_Jaw.quaternion.equals(held), `DeadSlack drops the jaw (${slack.toFixed(1)} deg) and holds`);
  // Eyes follow a gaze target within limits.
  face.Update(0, {}); face.dead = 0;
  const eye = byName.Face_EyeL, restEye = eye.quaternion.clone();
  face.gaze = new THREE.Vector3(0, 50, 30); // head frame of this test rig: Y forward, Z left
  for (let i = 0; i < 60; i++) face.Update(1 / 60, {});
  const eyeTurn = 2 * Math.acos(Math.min(1, Math.abs(eye.quaternion.dot(restEye)))) * 180 / Math.PI;
  assert.ok(eyeTurn > 5 && eyeTurn <= Math.hypot(C.gazeMaxYawDeg + C.saccadeDeg, C.gazeMaxPitchDeg + C.saccadeDeg) + 1, `eyes turn toward the gaze (${eyeTurn.toFixed(1)} deg)`);
}
// Blinks: seeded per actor, 2.5-6 s apart.
{
  const rig = definitions.LugouIja02;
  const Blinks = seed => { const {root} = FaceRoot(rig), face = new CharacterFacialAnimation(root, rig, {seed}); const at = [];
    let was = false; for (let i = 0; i < 60 * 30; i++) { face.Update(1 / 60, {}); const now = face.weights.Blink > .5; if (now && !was) at.push(i / 60); was = now; } return at; };
  const a = Blinks(1), b = Blinks(2);
  assert.notDeepEqual(a.map(x => x.toFixed(2)), b.map(x => x.toFixed(2)), 'different actors blink at different times');
  const gaps = a.slice(1).map((t, i) => t - a[i]);
  assert.ok(a.length >= 4 && gaps.every(g => g > C.blinkMinS - .1 && g < C.blinkMaxS + .2), `blink gaps ${gaps.map(g => g.toFixed(1))}`);
}

// ---- speaker binder: who -> face, isolation, release ----
{
  assert.deepEqual(ParseLineId('BunkerBanter', 'BunkerBanter.02'), {scene: 'BunkerBanter', index: 1});
  assert.deepEqual(ParseLineId('X', 3), {scene: 'X', index: 3});
  const cue = MISSION_DIALOGUE.find(c => c.lines.length >= 2 && c.lines[0].who !== c.lines[1].who
    && FIRST_LEVEL_SPEAKER_ROLES.includes(c.lines[0].who) && FIRST_LEVEL_SPEAKER_ROLES.includes(c.lines[1].who));
  const [whoA, whoB] = [cue.lines[0].who, cue.lines[1].who];
  assert.equal(WhoForLine(cue.id, `${cue.id}.01`), whoA);
  const rig = definitions.LugouNra02;
  const Soldier = (id, who) => { const {root} = FaceRoot(rig); const head = new THREE.Object3D(); root.add(head);
    const facial = new CharacterFacialAnimation(root, rig, {seed: id});
    return {id, alive: true, speakerRole: who, position: new THREE.Vector3(id, 0, 0),
      actor: {root, characterRig: {facial, bones: {head}, root}}}; };
  const a = Soldier(1, whoA), b = Soldier(2, whoB);
  let talking = whoA;
  const voice = {Speech: who => (who === talking ? {active: true, who, jaw: .8, wide: .2, round: 0, close: 0, stress: 0} : null)};
  const binder = new FirstLevelSpeakerBinder({voice, soldiers: () => [a, b], listener: () => new THREE.Vector3(0, 1.6, 5)});
  binder.Update();
  assert.equal(binder.ActorFor(cue.id, `${cue.id}.01`), a);
  assert.equal(binder.ActorForWho(whoB), b);
  assert.ok(a.actor.characterRig.facial.source()?.active, 'speaker face bound to its own line');
  assert.equal(b.actor.characterRig.facial.source(), null, 'listener face stays closed');
  assert.ok(b.actor.characterRig.facial.gaze, 'listener looks at the talker');
  assert.ok(binder.HeadPosition(cue, cue.lines[0]), 'voice position comes from the face that moves');
  talking = whoB; binder.Update();
  assert.equal(a.actor.characterRig.facial.source(), null); assert.ok(b.actor.characterRig.facial.source()?.active);
  a.alive = false; binder.Update();
  assert.equal(a.actor.characterRig.facial.source, null, 'dead speaker released');
  binder.Dispose(); assert.equal(b.actor.characterRig.facial.source, null, 'dispose releases every face');
}
// ---- binder scope: full binding only in 01-06; after 06 the squad keeps mouths only ----
{
  const steps = FIRST_LEVEL_STAGES.filter(stage => stage.number <= 6).flatMap(stage => stage.steps);
  assert.deepEqual([...FIRST_LEVEL_FACE_STEPS], steps, 'FIRST_LEVEL_FACE_STEPS are exactly the steps of phases 01-06');
  assert.ok(FIRST_LEVEL_WHOLE_LEVEL_SPEAKERS.every(who => FIRST_LEVEL_SPEAKING_CAST[who]));
  assert.ok(!FIRST_LEVEL_SPEAKER_ROLES.includes('bearer'), '06 bearer is a layout figure without a face');
  // One faced front guard, in the second batch (it gathers next to the player at 04).
  assert.ok(FACED_FRONT_GUARD_INDEX >= FRONT_BATTLE_TUNING.firstBatch && FACED_FRONT_GUARD_INDEX < FRONT_GUARD_POSTS.length);
  const rig = definitions.LugouNra02;
  const Soldier = (id, who) => { const {root} = FaceRoot(rig); const head = new THREE.Object3D(); root.add(head);
    const facial = new CharacterFacialAnimation(root, rig, {seed: id});
    return {id, alive: true, speakerRole: who, position: new THREE.Vector3(id, 0, 0),
      actor: {root, characterRig: {facial, bones: {head}, root}}}; };
  const luo = Soldier(1, 'luo'), guard = Soldier(2, 'guard');
  let stage = 'MachineGun';
  const voice = {Speech: who => ({active: true, who, jaw: .5, wide: 0, round: 0, close: 0, stress: 0})};
  const binder = new FirstLevelSpeakerBinder({voice, soldiers: () => [luo, guard], listener: () => new THREE.Vector3(0, 1.6, 5),
    resolvers: [who => (who === 'luo' ? luo : null)], active: () => FIRST_LEVEL_FACE_STEPS.includes(stage),
    wholeLevelRoles: FIRST_LEVEL_WHOLE_LEVEL_SPEAKERS, loadFaceTracks: false});
  const guardLine = {lines: [{who: 'guard'}]}, luoLine = {lines: [{who: 'luo'}]};
  binder.Update();
  assert.equal(binder.ActorForWho('guard'), guard); assert.ok(binder.HeadPosition(guardLine), '04: guard talks from his face');
  assert.ok(binder.bound.get(luo).layer && luo.actor.characterRig.speakerHead, '01-06: head layer attached');
  assert.ok(guard.actor.characterRig.facial.gaze, '01-06: eyes follow the talk');
  stage = 'Village'; binder.Update();
  assert.equal(binder.ActorForWho('guard'), null, "08's street guard line is never taken by a 01-06 guard body");
  assert.equal(binder.HeadPosition(guardLine), null); assert.equal(binder.HeadPosition(luoLine), null, 'after 06 voice placement is untouched');
  assert.equal(guard.actor.characterRig.facial.source, null, 'the 04 guard face is released after 06');
  assert.ok(luo.actor.characterRig.facial.source()?.active, 'Luo keeps a talking mouth after 06 (as before this package)');
  assert.equal(binder.bound.get(luo).layer, null); assert.equal(luo.actor.characterRig.speakerHead ?? null, null, 'no head layer after 06');
  assert.equal(luo.actor.characterRig.facial.gaze, null, 'no gaze after 06');
  stage = 'Orders'; binder.Update();
  assert.ok(binder.bound.get(luo).layer && binder.ActorForWho('guard') === guard, 'back in 01-06 (debug jump): full binding again');
  binder.Dispose();
}
// Shared look math: forward hemisphere clamp.
{
  const out = SpeakerLookAngles(new THREE.Quaternion(), new THREE.Vector3(), new THREE.Vector3(-1, 0, -1));
  assert.ok(out.yaw > .5 && out.yaw <= .55 && Math.abs(out.pitch) < 1e-6);
  const behind = SpeakerLookAngles(new THREE.Quaternion(), new THREE.Vector3(), new THREE.Vector3(0, 0, 5));
  assert.ok(Math.abs(behind.yaw) <= .55, 'rearward talk is a glance, not a neck twist');
}
// Head layer on bones no clip keys: the turn is undone every frame, never stacked
// (head is turned twice a frame: yaw, then pitch).
{
  const root = new THREE.Object3D(), neck = new THREE.Object3D(), head = new THREE.Object3D();
  root.add(neck); neck.add(head); neck.position.y = 1.5; head.position.y = .1; root.updateMatrixWorld(true);
  const layer = new SpeakerHeadLayer({bones: {head, neck}, actor: {root}, facial: {stress: 0}}, 7);
  layer.lookAt = new THREE.Vector3(-20, 1.6, -1);
  const Yaw = () => { const f = new THREE.Vector3(0, 0, -1).applyQuaternion(head.getWorldQuaternion(new THREE.Quaternion())); return Math.atan2(-f.x, -f.z); };
  const yaws = [];
  for (let i = 0; i < 600; i++) { layer.Apply(1 / 60, {}); root.updateMatrixWorld(true); if (i % 60 === 59) yaws.push(Yaw()); }
  assert.ok(yaws.every(y => Math.abs(y) <= .55 + .03), `head yaw stays within the clamp, no build-up: ${yaws.map(y => y.toFixed(2))}`);
  assert.ok(Math.abs(yaws.at(-1) - yaws.at(-5)) < .01, 'steady turn once converged');
  layer.Dispose(); root.updateMatrixWorld(true);
  assert.ok(Math.abs(Yaw()) < 1e-6 && neck.quaternion.angleTo(new THREE.Quaternion()) < 1e-6, 'dispose puts the rest pose back');
}
// ---- offline face tracks (Script_FirstLevelFaceTrackBake.py -> Script_FaceTrack) ----
// Lip-shape tables: every spoken Han character has a reading, every kana a vowel, every
// shape a [jaw, wide, round, close] weight in 0-1.
{
  const readings = HanReadings(), han = /[一-鿿]/;
  const kana = new Set([...Object.values(KANA_VOWELS).join(''), ...Object.keys(KANA_SMALL), ...Object.keys(KANA_SPECIAL)]);
  const missing = new Set(), missingKana = new Set();
  for (const cue of MissionVoiceAlignmentCues()) for (const line of cue.lines) for (const ch of line.text) {
    if (line.lang === 'ja') {
      const hira = ch >= 'ァ' && ch <= 'ヶ' ? String.fromCharCode(ch.charCodeAt(0) - 0x60) : ch;
      if (/[぀-ゟ]/.test(hira) && !kana.has(hira)) missingKana.add(ch);
      assert.ok(!han.test(ch), `${cue.id}: Japanese line aligned against kana, not kanji (${ch})`);
    } else if (han.test(ch) && !readings.has(ch)) missing.add(ch);
  }
  assert.equal([...missing].join(''), '', 'Data_FaceTrackPhonemes.HAN_PINYIN covers every spoken character');
  assert.equal([...missingKana].join(''), '', 'Data_FaceTrackPhonemes covers every spoken kana');
  for (const [name, weights] of Object.entries(VISEMES)) {
    assert.ok(weights.length === 4 && weights.every(w => w >= 0 && w <= 1), `viseme ${name} is [jaw, wide, round, close] in 0-1`);
  }
  for (const [final, shapes] of Object.entries(FINAL_VISEMES)) for (const s of shapes) assert.ok(VISEMES[s], `${final}: ${s}`);
  for (const s of [...Object.values(INITIAL_ONSET), ...Object.keys(KANA_ONSET), ...Object.values(KANA_VOWEL_VISEME)]) assert.ok(VISEMES[s], s);
  assert.deepEqual(VISEMES.MB, [0, 0, 0, 1], 'b/p/m press the lips shut');
}
// Sampler semantics on a hand-made track: smoothstep between keys, rest outside,
// stress a triangular pulse stressPulseS wide, line index from the track.
{
  ClearFaceTracks();
  RegisterFaceTracks({format: 1, tracks: {fake: {id: 'Fake', kind: 'cue', seconds: .4,
    lines: [[0, 200, 'luo'], [250, 400, 'yaowa']], keys: [0, 0, 0, 0, 0, 100, 100, 50, 0, 0, 200, 0, 0, 0, 100], stress: [100]}}});
  const at = t => SampleFaceTrack('fake', t);
  assert.equal(at(.1).jaw, 1); assert.equal(at(.1).wide, .5);
  assert.ok(Math.abs(at(.05).jaw - .5) < 1e-6, 'smoothstep midpoint');
  assert.ok(Math.abs(at(.15).close - .5) < 1e-6 && at(.19).close > .9, 'lips press toward the closing key');
  assert.equal(at(.1).stress, 1); assert.equal(at(.1 + FACE_TRACK_BAKE.stressPulseS / 2 + .001).stress, 0);
  assert.ok(at(.1 + FACE_TRACK_BAKE.stressPulseS / 4).stress > .45, 'the pulse is wide enough to be seen at 60 fps');
  assert.equal(at(.1).line, 0); assert.equal(at(.22).line, -1); assert.equal(at(.3).line, 1);
  assert.equal(at(-1).jaw, 0); assert.equal(at(9).jaw, 0); assert.equal(SampleFaceTrack('none', .1), null);
  const envelopeOnly = {active: true, who: 'luo', cue: 'Fake', sourceTime: .1, level: .2, brightness: .9};
  assert.equal(FaceTrackSpeech(envelopeOnly, 'fake').jaw, 1, 'envelope sample gains the track channels');
  assert.equal(FaceTrackSpeech(envelopeOnly, 'unknown'), envelopeOnly, 'no track: the envelope fallback stays');
  const baked = {active: true, jaw: .3};
  assert.equal(FaceTrackSpeech(baked, 'fake'), baked, 'a sample the voice already baked is left alone');
  // The binder looks the take up in the voice manifest by cue.
  const voice = {manifest: {cues: {Fake: {sha256: 'fake'}}}, Speech: who => (who === 'luo' ? {...envelopeOnly} : null)};
  const binder = new FirstLevelSpeakerBinder({voice, loadFaceTracks: false});
  assert.equal(binder.Speech('luo').jaw, 1); assert.equal(binder.Speech('yaowa'), null);
  const facial = new CharacterFacialAnimation(FaceRoot(definitions.LugouNra02).root, definitions.LugouNra02, {seed: 3});
  facial.source = () => binder.Speech('luo');
  for (let i = 0; i < 20; i++) facial.Update(1 / 60);
  assert.ok(facial.jaw > .6, `face follows the track's jaw: ${facial.jaw.toFixed(2)}`);
  // Per-line takes (contract 5.2): the dialogue player's faceTrackSampler(line, t).
  RegisterFaceTracks({format: 1, tracks: {lineSha: {id: 'Scene.01', kind: 'line', seconds: .3, lines: [[0, 300, 'luo']],
    keys: [0, 0, 0, 0, 0, 150, 80, 0, 0, 0, 300, 0, 0, 0, 0], stress: []}}});
  assert.ok(Math.abs(SampleLineFaceTrack({id: 'Scene.01', sha256: 'lineSha'}, .15).jaw - .8) < 1e-6);
  assert.ok(Math.abs(SampleLineFaceTrack({id: 'Scene.01'}, .15).jaw - .8) < 1e-6, 'no sha on the line: the track baked for that line id');
  assert.equal(SampleLineFaceTrack({id: 'Scene.01'}, .15).line, 'Scene.01', 'a per-line take reports its line id (line-start blink)');
  assert.equal(SampleLineFaceTrack({id: 'Scene.02'}, .15), null);
  const player = {};
  new FirstLevelSpeakerBinder({voice: {dialogue: player, Speech: () => null}, loadFaceTracks: false});
  assert.equal(player.faceTrackSampler, SampleLineFaceTrack, 'binder injects the sampler into the per-line player');
  ClearFaceTracks();
}
// The baked file: one track per recorded take (keyed by that mp3's sha256), line
// intervals equal the voice alignment, mouth moves on speech and is shut between lines.
const FACE_TRACKS = JSON.parse(fs.readFileSync(new URL('./Audio/FirstLevel/Data_FirstLevelFaceTracks.json', import.meta.url), 'utf8'));
const VOICE_MANIFEST = JSON.parse(fs.readFileSync(new URL('./Audio/FirstLevel/Data_FirstLevelVoiceManifest.json', import.meta.url), 'utf8'));
let faceTrackCount = 0;
{
  assert.equal(FACE_TRACKS.format, 1);
  faceTrackCount = RegisterFaceTracks(FACE_TRACKS);
  const cues = new Map(MissionVoiceAlignmentCues().map(cue => [cue.id, cue]));
  // 01-06 (this refactor's scope) is every mission cue before 07's SouthWhisper.
  const order = MISSION_DIALOGUE.map(cue => cue.id), scope = new Set(order.slice(0, order.indexOf('SouthWhisper')));
  assert.ok(scope.has('BorrowLight') && scope.has('TakeOverGun') && !scope.has('SouthWhisper'));
  const below = [];
  let voiced = 0, moving = 0, gap = 0, open = 0;
  const stale = [];
  let chars = 0, charsArticulated = 0;
  const Articulated = v => v.jaw >= FACE_TRACK_BAKE.openJaw || v.close >= .5
    || v.wide >= FACE_TRACK_BAKE.shapeVisible || v.round >= FACE_TRACK_BAKE.shapeVisible;
  for (const [id, entry] of Object.entries(VOICE_MANIFEST.cues)) {
    const alignment = MISSION_VOICE_ALIGNMENT[id];
    if (!cues.has(id)) continue;
    // A take whose alignment was not redone is skipped only outside 01-06; inside it is a failure.
    if (alignment?.sha256 !== entry.sha256) { stale.push(id); continue; }
    const json = FACE_TRACKS.tracks[entry.sha256];
    assert.ok(json, `${id}: face track baked for the current take (run Script_FirstLevelFaceTrackBake.py --cues ${id})`);
    assert.equal(json.id, id);
    assert.deepEqual(json.lines.map(([s, e]) => [s / 1000, e / 1000]), alignment.lines, `${id}: line intervals follow the alignment`);
    assert.deepEqual(json.lines.map(l => l[2]), cues.get(id).lines.map(l => l.who), `${id}: speakers`);
    const track = FaceTrack(entry.sha256);
    for (let i = 1; i < track.times.length; i++) assert.ok(track.times[i] >= track.times[i - 1], `${id}: keys in time order`);
    assert.ok(track.values.every(v => v >= 0 && v <= 1));
    const st = json.stats;
    if (st.voicedFrames >= 30) {
      if (scope.has(id)) assert.ok(st.voicedMoving >= .8, `${id}: mouth moves on >=80% of speech frames (${st.voicedMoving})`);
      else if (st.voicedMoving < .8) below.push(`${id} ${st.voicedMoving}`);
      assert.ok(st.voicedMoving >= .7, `${id}: mouth moves on >=70% of speech frames (${st.voicedMoving})`);
      voiced += st.voicedFrames; moving += st.voicedMoving * st.voicedFrames;
    }
    assert.ok(st.gapOpen <= .1, `${id}: mouth open in <=10% of the silence between lines (${st.gapOpen})`);
    gap += st.gapFrames; open += st.gapOpen * st.gapFrames;
    // Runtime sampler agrees: shut in the middle of every pause longer than 0.3 s.
    for (let i = 1; i < track.lines.length; i++) {
      const a = track.lines[i - 1].end, b = track.lines[i].start;
      if (b - a > .3) assert.ok(SampleFaceTrack(entry.sha256, (a + b) / 2).jaw < .05, `${id}: closed between lines ${i} and ${i + 1}`);
    }
    // Independent of the baker's own stats: re-sample the gap figure with the runtime
    // sampler (10 ms frames outside [start - 50 ms, end + 100 ms] of every line) ...
    let gapFrames = 0, gapOpenFrames = 0;
    for (let ms = 0; ms < json.seconds * 1000; ms += 10) {
      if (json.lines.some(([s, e]) => ms >= s - 50 && ms < e + 100)) continue;
      gapFrames++; if (SampleFaceTrack(entry.sha256, ms / 1000).jaw >= FACE_TRACK_BAKE.openJaw) gapOpenFrames++;
    }
    assert.ok(Math.abs(gapFrames - st.gapFrames) <= 3 && Math.abs((gapFrames ? gapOpenFrames / gapFrames : 0) - st.gapOpen) <= .01,
      `${id}: runtime-sampled gaps ${gapOpenFrames}/${gapFrames} agree with the baked stats`);
    // ... and every aligned 01-06 character of at least 60 ms moves the mouth at some
    // point inside its own window (the alignment comes from the text, not the track).
    if (scope.has(id)) for (const [, s, e] of json.chars) {
      if (e - s < 60) continue;
      chars++;
      for (let ms = s; ms <= e; ms += 10) if (Articulated(SampleFaceTrack(entry.sha256, ms / 1000))) { charsArticulated++; break; }
    }
  }
  assert.deepEqual(stale.filter(id => scope.has(id)), [], '01-06 takes re-recorded without re-alignment (run the voice aligner, then the face-track bake)');
  if (stale.length) console.log(`note: 07-18 takes skipped, alignment older than the take: ${stale.join(', ')}`);
  // Per-line takes (Voice package): once Data_FirstLevelLineTimings.json exists every take in it has its own track.
  // Since the 2026-09-24 voice merge the 01-06 dialogue lives in these per-line slices of whole-scene takes,
  // so their aligned characters count toward the same 01-06 articulation gate as the whole-cue takes above.
  const lineTimings = new URL('./Audio/FirstLevel/Data_FirstLevelLineTimings.json', import.meta.url);
  if (fs.existsSync(lineTimings)) {
    for (const [sha, row] of Object.entries(JSON.parse(fs.readFileSync(lineTimings, 'utf8')))) {
      const track = FACE_TRACKS.tracks[sha];
      assert.ok(track?.kind === 'line' && track.id === row.lineId,
        `${row.lineId}: per-line face track baked (PYTHONUTF8=1 py -3.13 Taierzhuang1938/Script_FirstLevelFaceTrackBake.py --lines --prune)`);
      for (const [, s, e] of track.chars || []) {
        if (e - s < 60) continue;
        chars++;
        for (let ms = s; ms <= e; ms += 10) if (Articulated(SampleFaceTrack(sha, ms / 1000))) { charsArticulated++; break; }
      }
    }
  }
  assert.ok(chars > 300 && charsArticulated / chars >= .97, `01-06: ${charsArticulated}/${chars} aligned characters move the mouth`);
  if (below.length) console.log(`note: 07-18 takes under 80% (noisy whole-cue alignment): ${below.join(', ')}`);
  assert.ok(voiced > 0 && moving / voiced >= .95, `all takes: mouth moves on ${(moving / voiced).toFixed(3)} of speech frames`);
  assert.ok(open / gap <= .02, `all takes: open in ${(open / gap).toFixed(3)} of line gaps`);
  ClearFaceTracks();
}
console.log(`ok speech envelope/clock/isolation; ${faced.length} facial skins (13 bones, 9 poses, shared textures/clips, <=1.5 MB); `
  + `${Object.keys(FIRST_LEVEL_SPEAKING_CAST).length} pinned speakers; additive face controller, seeded blinks, gaze, binder; `
  + `${faceTrackCount} baked face tracks (phoneme tables cover the script)`);
