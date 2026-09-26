// RelaxedWalk / RelaxedStand acceptance (Animation/RelaxedGait, _import/Script_RelaxedGaitBake.mjs). Node-only.
//   node Taierzhuang1938/Script_RelaxedGaitTest.mjs
// The shipped clips are what the bake writes now (not stale), loop seamlessly, keep the stance soles on the
// floor and the swing soles off it, never need a leg longer than it is, and bind on every Tengxian model.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { LoadGlb } from './_import/Script_LugouGlbPose.mjs';
import { RELAXED_GAIT } from './Data_Tuning_ActorLocomotion.mjs';
import { OPENING_STORYBOARDS as C } from './Data_OpeningStoryboards.mjs';

const here = import.meta.dirname, dir = path.join(here, 'Animation/RelaxedGait');
execFileSync(process.execPath, [path.join(here, '_import/Script_RelaxedGaitBake.mjs'), '--verify'], { stdio: 'pipe' });
const data = JSON.parse(fs.readFileSync(path.join(dir, 'Animation_TengxianHumanoidV1RelaxedGait.json'), 'utf8'));
const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'Data_RelaxedGait.json'), 'utf8'));
const clips = Object.fromEntries(data.clips.map(clip => [clip.name, clip]));
assert.deepEqual(Object.keys(clips).sort(), ['RelaxedStand', 'RelaxedWalk']);

// Seamless loops: the last key of every track equals its first (quaternion sign-agnostic).
for (const clip of data.clips) for (const track of clip.tracks) {
  const width = track.type === 'quaternion' ? 4 : 3, v = track.values, n = v.length / width;
  let dot = 0, diff = 0;
  for (let c = 0; c < width; c++) { dot += v[c] * v[(n - 1) * width + c]; diff = Math.max(diff, Math.abs(v[c] - v[(n - 1) * width + c])); }
  if (width === 4) assert.ok(Math.abs(Math.abs(dot) - 1) < 1e-3, `${clip.name} ${track.name} loop seam`);
  else assert.ok(diff < 1e-3, `${clip.name} ${track.name} loop seam`);
  assert.equal(track.times.at(-1), clip.duration, `${clip.name} ${track.name} spans the cycle`);
}
// Real limb motion in the walk (legs and arms), a quiet stand.
const Excursion = (clip, bone) => {
  const t = clips[clip].tracks.find(track => track.name === `Bip001_${bone}.quaternion`), v = t.values;
  let worst = 0; for (let i = 4; i < v.length; i += 4) worst = Math.max(worst, 2 * Math.acos(Math.min(1, Math.abs(v[0] * v[i] + v[1] * v[i + 1] + v[2] * v[i + 2] + v[3] * v[i + 3]))));
  return worst;
};
assert.ok(Excursion('RelaxedWalk', 'L_Thigh') > .6 && Excursion('RelaxedWalk', 'R_Calf') > .6, 'walk legs swing');
assert.ok(Excursion('RelaxedWalk', 'L_UpperArm') > .35, 'walk arms swing');
assert.ok(Excursion('RelaxedStand', 'L_Thigh') < .1, 'stand keeps still');

// Ground: soles planted through stance, clear of the floor in swing; no leg asked past its reach.
const W = manifest.walk, S = manifest.stand;
for (const side of ['L', 'R']) {
  assert.ok(W.stanceSoleM[side][0] > -.002 && W.stanceSoleM[side][1] < .012, `walk ${side} stance sole on the floor ${W.stanceSoleM[side]}`);
  assert.ok(W.swingSoleMinM[side] > -.002, `walk ${side} swing sole above the floor`);
  assert.ok(S.soleM[side][0] > -.002 && S.soleM[side][1] < .012, `stand ${side} sole on the floor`);
  assert.equal(W.contacts[side].length > 0, true, `walk ${side} has a measured contact`);
}
assert.equal(W.legReachClampedFrames, 0, 'walk legs within reach');
assert.equal(S.legReachClampedFrames, 0, 'stand legs within reach');
// The toe is locked while it carries weight: it travels back at the authored pace.
assert.ok(Math.abs(W.measuredToeSpeedMps - W.referenceSpeedMps) < .05, `toe speed ${W.measuredToeSpeedMps} vs ${W.referenceSpeedMps}`);
const L = W.contacts.L.reduce((s, [a, b]) => s + b - a, 0), R = W.contacts.R.reduce((s, [a, b]) => s + b - a, 0);
assert.ok(L > .45 && R > .45, `walking, not running: stance share L ${L} R ${R}`);

// Every Tengxian model binds every track.
const catalog = JSON.parse(fs.readFileSync(path.join(here, 'Model/Character/Data_TengxianCharacterManifest.json'), 'utf8'));
for (const record of catalog.models) {
  const glb = LoadGlb(fs.readFileSync(path.join(here, `Model/Character/Model_${record.id}.glb`)));
  const names = new Set(glb.json.nodes.map(node => node.name.replace(/\s/g, '_')));
  for (const clip of data.clips) for (const track of clip.tracks) assert.ok(names.has(track.name.split('.')[0]), `${record.id} lacks ${track.name}`);
}
// The director's paces land on the intended cycle (walk vs run switch with its hold band).
assert.ok(RELAXED_GAIT.walkBelowMps < RELAXED_GAIT.runAboveMps && RELAXED_GAIT.switchFrames >= 2);
for (const pace of ['stroll', 'walk', 'amble']) assert.ok(C.speed[pace] < RELAXED_GAIT.walkBelowMps, `${pace} walks`);
for (const pace of ['brisk', 'trot', 'run', 'flee']) assert.ok(C.speed[pace] > RELAXED_GAIT.runAboveMps, `${pace} runs`);
assert.ok(C.interrogation.hurryMps > RELAXED_GAIT.runAboveMps, 'the interpreter hurries back at a run');
console.log(`ok relaxed gait: walk ${W.referenceSpeedMps} m/s stride ${W.strideM} m pelvis ${W.pelvisHeightM} m, contacts L ${JSON.stringify(W.contacts.L)} R ${JSON.stringify(W.contacts.R)}, ${catalog.models.length} models bind ${data.clips.reduce((n, c) => n + c.tracks.length, 0)} tracks`);
