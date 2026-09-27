// IJA alert gait acceptance (Animation/IjaAlertGait, _import/Script_IjaAlertGaitBake.py via BlenderMCP). Node-only.
//   node Taierzhuang1938/Script_IjaAlertGaitTest.mjs
// The 01 vanguard (ijaA / ijaB) comes into the shelled trench upright at a trot, rifle in both hands at the waist,
// head sweeping: the three clips loop, keep the legs' foot contacts per cycle, hold the rifle still on the chest
// (no per-step sleeve roll), reach it with both hands, sweep the head, and bind on every Tengxian model; the
// runtime loads the version the bake wrote and the director uses it for the walk-in at a trot.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { LoadGlb } from './_import/Script_LugouGlbPose.mjs';
import { RELAXED_GAIT } from './Data_Tuning_ActorLocomotion.mjs';
import { OPENING_STORYBOARDS as C } from './Data_OpeningStoryboards.mjs';

const here = import.meta.dirname;
const data = JSON.parse(fs.readFileSync(path.join(here, 'Animation/IjaAlertGait/Animation_TengxianIjaAlertGait.json'), 'utf8'));
const clips = Object.fromEntries(data.clips.map(clip => [clip.name, clip]));
assert.deepEqual(Object.keys(clips).sort(), ['IjaAlertStand', 'IjaAlertTrot', 'IjaAlertWalk']);
assert.equal(data.skeleton, 'TengxianHumanoidV1');
const runtime = fs.readFileSync(path.join(here, 'Script_RelaxedGait.mjs'), 'utf8');
assert.ok(runtime.includes(`ALERT_VERSION = "${data.revision}"`), `Script_RelaxedGait loads ${data.revision}`);

// Seamless loops; a one-key track is a constant channel.
for (const clip of data.clips) for (const track of clip.tracks) {
  const width = track.type === 'quaternion' ? 4 : 3, v = track.values, n = v.length / width;
  assert.equal(n, track.times.length, `${clip.name} ${track.name} keys`);
  if (n === 1) continue;
  let dot = 0, diff = 0;
  for (let c = 0; c < width; c++) { dot += v[c] * v[(n - 1) * width + c]; diff = Math.max(diff, Math.abs(v[c] - v[(n - 1) * width + c])); }
  if (width === 4) assert.ok(Math.abs(Math.abs(dot) - 1) < 1e-3, `${clip.name} ${track.name} loop seam`);
  else assert.ok(diff < 1e-3, `${clip.name} ${track.name} loop seam`);
  assert.ok(Math.abs(track.times.at(-1) - clip.duration) < 1e-5, `${clip.name} ${track.name} spans the clip`);
}
const Excursion = (clip, bone) => {
  const t = clips[clip].tracks.find(track => track.name === `Bip001_${bone}.quaternion`), v = t.values;
  let worst = 0; for (let i = 4; i < v.length; i += 4) worst = Math.max(worst, 2 * Math.acos(Math.min(1, Math.abs(v[0] * v[i] + v[1] * v[i + 1] + v[2] * v[i + 2] + v[3] * v[i + 3]))));
  return worst;
};
for (const id of Object.keys(clips)) {
  const p = data.profiles[id];
  // Both hands on the rifle every frame; the hold rides the chest without re-solving the arm each step.
  assert.deepEqual(p.overreach, { L: 0, R: 0 }, `${id}: both hands reach the rifle`);
  for (const bone of ['R_UpperArm', 'R_Forearm', 'L_UpperArm', 'L_Forearm', 'R_Hand', 'L_Hand'])
    assert.ok(Excursion(id, bone) < .15, `${id} ${bone} steady on the rifle (${Excursion(id, bone).toFixed(3)} rad)`);
  // Muzzle forward and a little down (right grip -> left grip); the head sweeps either side.
  assert.ok(p.barrelPitchDeg[0] > -15 && p.barrelPitchDeg[1] < 0, `${id} muzzle forward-down ${p.barrelPitchDeg}`);
  assert.ok(Excursion(id, 'Head') + Excursion(id, 'Neck') > .35, `${id} head sweeps`);
  assert.ok(Math.abs(p.leanDeg[0]) < 8 && Math.abs(p.leanDeg[1]) < 8, `${id} upright ${p.leanDeg}`);
  assert.ok(p.floorM[0] > .002 && p.floorM[0] < .006, `${id} lowest sole on the floor ${p.floorM}`);
}
// The trot keeps its flight phase (a single constant floor fit), the walk and stand stay planted.
assert.ok(data.profiles.IjaAlertTrot.floorM[1] > .03, 'trot leaves the ground');
assert.ok(data.profiles.IjaAlertWalk.floorM[1] < .006, 'walk stays planted');
assert.ok(Excursion('IjaAlertTrot', 'R_Calf') > .8 && Excursion('IjaAlertStand', 'L_Thigh') < .1, 'legs: trot runs, stand keeps still');
// Contacts: the source cycle's spans repeated per cycle; the trot is a jog (short stance), the walk a walk.
for (const [id, cycles] of [['IjaAlertTrot', 4], ['IjaAlertWalk', 3]]) {
  const p = data.profiles[id];
  assert.equal(p.cycles, cycles);
  for (const side of ['L', 'R']) {
    assert.ok(p.contacts[side].length >= cycles, `${id} ${side} contacts per cycle`);
    for (const [a, b] of p.contacts[side]) assert.ok(a >= 0 && b <= 1 && a < b, `${id} ${side} span ${a}-${b}`);
  }
}
const Share = (id, side) => data.profiles[id].contacts[side].reduce((s, [a, b]) => s + b - a, 0);
assert.ok(Share('IjaAlertTrot', 'L') < .45 && Share('IjaAlertWalk', 'L') > .45, 'trot vs walk stance share');
assert.equal(Object.keys(data.profiles.IjaAlertStand.contacts).length, 0);
assert.equal(data.profiles.IjaAlertStand.referenceMps, 0);

// Every Tengxian model binds every track.
const catalog = JSON.parse(fs.readFileSync(path.join(here, 'Model/Character/Data_TengxianCharacterManifest.json'), 'utf8'));
for (const record of catalog.models) {
  const glb = LoadGlb(fs.readFileSync(path.join(here, `Model/Character/Model_${record.id}.glb`)));
  const names = new Set(glb.json.nodes.map(node => node.name.replace(/\s/g, '_')));
  for (const clip of data.clips) for (const track of clip.tracks) assert.ok(names.has(track.name.split('.')[0]), `${record.id} lacks ${track.name}`);
}
// The director: the vanguard walks in "alert" at a trot (the relaxed-gait run band picks IjaAlertTrot).
const director = fs.readFileSync(path.join(here, 'Script_OpeningStoryboards.mjs'), 'utf8');
const walkIn = director.slice(director.indexOf('  WalkIn(age){'), director.indexOf('  InterpreterCall(){'));
assert.ok(walkIn.includes('SetRelaxedGait(actor,"alert")') && walkIn.includes('C.speed.trot'), 'WalkIn: alert gait at a trot');
assert.ok(walkIn.includes('"IjaReadyRifle"') && walkIn.includes('SetRelaxedGait(actor,"slung")'), 'WalkIn: slings the rifle on the mark');
assert.ok(C.speed.trot > RELAXED_GAIT.runAboveMps, 'trot picks the trot cycle');
const trot = data.profiles.IjaAlertTrot.referenceMps;
assert.ok(C.speed.trot / trot > .8 && C.speed.run / trot < 1.35, `trot cycle ${trot} m/s plays near its pace`);
console.log(`ok IJA alert gait ${data.revision}: trot ${trot} m/s x${data.profiles.IjaAlertTrot.cycles} cycles, barrel ${data.profiles.IjaAlertTrot.barrelPitchDeg} deg, ${catalog.models.length} models bind ${data.clips.reduce((n, c) => n + c.tracks.length, 0)} tracks`);
