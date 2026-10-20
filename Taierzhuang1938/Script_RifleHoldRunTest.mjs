// RifleHoldRun acceptance: the exported clip (Animation/RifleHoldRun, _import/Script_RifleHoldRunBake.py via Blender)
// measured on the real skinned NRA02 mesh and the real ZhongZheng rifle, independently of the baker.
//   node Taierzhuang1938/Script_RifleHoldRunTest.mjs            # assert every gate
//   node Taierzhuang1938/Script_RifleHoldRunTest.mjs --report   # print the gate table, never throw
//   node Taierzhuang1938/Script_RifleHoldRunTest.mjs --write    # also rewrite Animation/RifleHoldRun/Data_RifleHoldRun.json
// Units: runtime metres (the 1.66 m NRA actor: glTF units x scale), g = 9.81, gait axes s forward / l left / h up.
// Sources and ranges are in Animation/RifleHoldRun/Data_RifleHoldRun.md.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { LoadGlb, PoseScene, BuildSkin, ReadAccessor } from './_import/Script_LugouGlbPose.mjs';
import { MeasureProfile } from './_import/Script_RifleHoldRunProfile.mjs';
import { ALLY_GAIT } from './Data_Tuning_AllyGait.mjs';

const here = import.meta.dirname;
const dir = path.join(here, 'Animation/RifleHoldRun');
const args = new Set(process.argv.slice(2));
const G = 9.81, TARGET_HEIGHT = 1.66, GROUND_M = 0.035, PLANTED_M = 0.012;
const Sanitize = n => n.replace(/\s/g, '_');
const B = n => 'Bip001 ' + n;

// ------------------------------------------------------------------------------------------------ small vector kit
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = a => Math.hypot(a[0], a[1], a[2]);
const unit = a => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const lerp = (a, b, k) => add(a, mul(sub(b, a), k));
const deg = r => r * 180 / Math.PI;
const Mean = v => v.reduce((s, x) => s + x, 0) / v.length;
const Range = v => [Math.min(...v), Math.max(...v)];
const R = (v, d = 4) => +v.toFixed(d);
const R2 = (pair, d = 4) => pair.map(v => R(v, d));
const qMul = (a, b) => [a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1], a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
  a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3], a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]];
const qInv = q => [-q[0], -q[1], -q[2], q[3]];
const qRot = (q, v) => { const r = qMul(qMul(q, [v[0], v[1], v[2], 0]), qInv(q)); return [r[0], r[1], r[2]]; };
const qAngle = (a, b) => {   // well-conditioned near zero: chord of the (sign-aligned, normalised) pair
  const la = Math.hypot(a[0], a[1], a[2], a[3]), lb = Math.hypot(b[0], b[1], b[2], b[3]);
  const s = (a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3]) < 0 ? -1 : 1;
  const d = Math.hypot(a[0] / la - s * b[0] / lb, a[1] / la - s * b[1] / lb, a[2] / la - s * b[2] / lb, a[3] / la - s * b[3] / lb);
  return 2 * Math.asin(Math.min(1, d / 2));
};
const Corr = (a, b) => {
  const ma = Mean(a), mb = Mean(b); let n = 0, da = 0, db = 0;
  for (let i = 0; i < a.length; i++) { n += (a[i] - ma) * (b[i] - mb); da += (a[i] - ma) ** 2; db += (b[i] - mb) ** 2; }
  return n / Math.sqrt(da * db || 1);
};
/** Least-squares quadratic z = a t^2 + b t + c over (t, z); returns { a, b, c, rms }. */
function Quadratic(ts, zs) {
  const n = ts.length, t0 = Mean(ts), x = ts.map(t => t - t0);
  let s0 = n, s1 = 0, s2 = 0, s3 = 0, s4 = 0, y0 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < n; i++) { const t = x[i]; s1 += t; s2 += t * t; s3 += t ** 3; s4 += t ** 4; y0 += zs[i]; y1 += zs[i] * t; y2 += zs[i] * t * t; }
  // normal equations for [c, b, a]
  const M = [[s0, s1, s2], [s1, s2, s3], [s2, s3, s4]], Y = [y0, y1, y2];
  for (let i = 0; i < 3; i++) {
    let p = i; for (let r = i + 1; r < 3; r++) if (Math.abs(M[r][i]) > Math.abs(M[p][i])) p = r;
    [M[i], M[p]] = [M[p], M[i]]; [Y[i], Y[p]] = [Y[p], Y[i]];
    for (let r = i + 1; r < 3; r++) { const f = M[r][i] / M[i][i]; for (let c = i; c < 3; c++) M[r][c] -= f * M[i][c]; Y[r] -= f * Y[i]; }
  }
  const c3 = Y[2] / M[2][2], b3 = (Y[1] - M[1][2] * c3) / M[1][1], a3 = (Y[0] - M[0][1] * b3 - M[0][2] * c3) / M[0][0];
  let rms = 0; for (let i = 0; i < n; i++) rms += (zs[i] - (a3 + b3 * x[i] + c3 * x[i] ** 2)) ** 2;
  return { a: c3, b: b3, c: a3, rms: Math.sqrt(rms / n) };
}

// ------------------------------------------------------------------------------------------------ assets
const clipText = fs.readFileSync(path.join(dir, 'Animation_TengxianRifleHoldRun.json'), 'utf8');
const data = JSON.parse(clipText);
const clip = data.clips[0], profile = data.profiles.RifleHoldRun;
const T = clip.duration, N = Math.round(T / (clip.tracks.find(t => t.name === 'Bip001_Pelvis.position').times[1]));
const catalog = JSON.parse(fs.readFileSync(path.join(here, 'Model/Character/Data_TengxianCharacterManifest.json'), 'utf8'));
const record = catalog.models.find(r => r.id === 'TengxianNra02');
const glb = LoadGlb(path.join(here, 'Model/Character/Model_TengxianNra02.glb'));
const scene = new PoseScene(glb);
const humanoid = JSON.parse(fs.readFileSync(path.join(here, 'Model/Character/Data_TengxianHumanoid.json'), 'utf8'));
const boneNames = humanoid.bodyBones.map(b => b.name);
const nodeIndex = new Map(scene.nodes.map((n, i) => [Sanitize(n.name), i]));
const S = TARGET_HEIGHT / (record.scaleHeight || record.bounds.size[2]);   // glTF units -> runtime metres
const channels = [];
const weaponTracks = {};
for (const track of clip.tracks) {
  const [name, property] = track.name.split('.');
  if (name === data.weaponTrack) { weaponTracks[property] = track; continue; }
  assert.ok(nodeIndex.has(name), `bone ${name}`);
  channels.push({ node: nodeIndex.get(name), path: property === 'quaternion' ? 'rotation' : 'translation', width: property === 'quaternion' ? 4 : 3, input: track.times, output: track.values, interpolation: 'LINEAR' });
}
scene.animations.push({ name: '__rest', channels: [], duration: 0 });
scene.Apply(scene.animations.length - 1, 0);
const restWorld = scene.world.map(m => Float64Array.from(m));
const restLocalQ = scene.r.map(q => Float64Array.from(q));
scene.animations.push({ name: clip.name, duration: T, channels });
const animation = scene.animations.length - 1;

// weapon track evaluation (linear / slerp like three.js)
function Track(track, t, width) {
  const times = track.times, v = track.values;
  let i = 0; while (i < times.length - 2 && times[i + 1] <= t) i++;
  const j = Math.min(i + 1, times.length - 1), span = times[j] - times[i], k = span > 0 ? (t - times[i]) / span : 0;
  if (width === 3) return lerp(v.slice(i * 3, i * 3 + 3), v.slice(j * 3, j * 3 + 3), k);
  let a = v.slice(i * 4, i * 4 + 4), b = v.slice(j * 4, j * 4 + 4);
  if (a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3] < 0) b = b.map(x => -x);
  const q = a.map((x, c) => x * (1 - k) + b[c] * k), l = Math.hypot(...q);
  return q.map(x => x / l);
}

// skin: vertex tables with normals, dominant joint, sole subsets
const parts = BuildSkin(glb);
const normals = [];
for (const node of glb.json.nodes) {
  if (node.mesh === undefined || node.skin === undefined) continue;
  for (const primitive of glb.json.meshes[node.mesh].primitives) normals.push(ReadAccessor(glb, primitive.attributes.NORMAL).data);
}
const jointName = (part, j) => scene.nodes[part.joints[j]].name;
const soleVerts = { L: [], R: [] }, bodyVerts = [];
const BODY_GROUPS = /Pelvis|Spine|Neck|Head|Clavicle|UpperArm|Thigh/;
parts.forEach((part, pi) => {
  for (let v = 0; v < part.count; v++) {
    let best = -1, bw = 0; const w = { L: 0, R: 0 };
    for (let k = 0; k < 4; k++) {
      const wt = part.weight[v * 4 + k]; if (!wt) continue;
      const name = jointName(part, part.jointIndex[v * 4 + k]);
      if (wt > bw) { bw = wt; best = name; }
      if (name === B('L Foot') || name === B('L Toe0')) w.L += wt;
      if (name === B('R Foot') || name === B('R Toe0')) w.R += wt;
    }
    if (w.L > 0.55) soleVerts.L.push([pi, v]);
    if (w.R > 0.55) soleVerts.R.push([pi, v]);
    if (best && BODY_GROUPS.test(best) && !/Hand|Finger|Forearm/.test(best)) bodyVerts.push([pi, v, best.replace('Bip001 ', '')]);
  }
});

const jointMatrices = parts.map(part => new Float64Array(part.joints.length * 16));
function RefreshJoints() {
  parts.forEach((part, pi) => {
    for (let j = 0; j < part.joints.length; j++) {
      const w = scene.world[part.joints[j]], ib = part.inverseBind, o = j * 16, m = jointMatrices[pi];
      for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
        let s = 0; for (let k = 0; k < 4; k++) s += w[k * 4 + r] * ib[j * 16 + c * 4 + k];
        m[o + c * 4 + r] = s;
      }
    }
  });
}
function SkinVertex(pi, v, withNormal = false) {
  const part = parts[pi], m = jointMatrices[pi];
  const x = part.position[v * 3], y = part.position[v * 3 + 1], z = part.position[v * 3 + 2];
  let px = 0, py = 0, pz = 0, tw = 0, nx = 0, ny = 0, nz = 0;
  const n = normals[pi];
  for (let k = 0; k < 4; k++) {
    const w = part.weight[v * 4 + k]; if (!w) continue;
    const o = part.jointIndex[v * 4 + k] * 16;
    px += w * (m[o] * x + m[o + 4] * y + m[o + 8] * z + m[o + 12]);
    py += w * (m[o + 1] * x + m[o + 5] * y + m[o + 9] * z + m[o + 13]);
    pz += w * (m[o + 2] * x + m[o + 6] * y + m[o + 10] * z + m[o + 14]);
    if (withNormal) {
      const a = n[v * 3], b = n[v * 3 + 1], c = n[v * 3 + 2];
      nx += w * (m[o] * a + m[o + 4] * b + m[o + 8] * c); ny += w * (m[o + 1] * a + m[o + 5] * b + m[o + 9] * c); nz += w * (m[o + 2] * a + m[o + 6] * b + m[o + 10] * c);
    }
    tw += w;
  }
  const p = [px / tw * S, py / tw * S, pz / tw * S];   // glTF (x left, y up, z forward) in runtime metres
  if (!withNormal) return p;
  const l = Math.hypot(nx, ny, nz) || 1;
  return [p, [nx / l, ny / l, nz / l]];
}

// rifle geometry (the shipped ZhongZheng mesh, real metres, local origin = right grip, -Z = muzzle)
const weaponJson = JSON.parse(fs.readFileSync(path.join(here, 'Model/Model_ZhongZheng.tzm.json'), 'utf8'));
const rifleVerts = [];
for (const block of weaponJson.meshes) {
  const buf = Buffer.from(block.pos, 'base64'), q = new Uint16Array(buf.buffer, buf.byteOffset, buf.length / 2);
  for (let i = 0; i < block.count; i++) rifleVerts.push([0, 1, 2].map(j => block.posMin[j] + q[i * 3 + j] * block.posScale[j]));
}
const RIFLE_GRIP_L = [0, -0.012, -0.49938], RIFLE_MUZZLE = [0, 0.035, -0.861], RIFLE_BUTT = [0, 0, 0.255];

// ------------------------------------------------------------------------------------------------ sampling
const SUB = 4, M = N * SUB, dt = T / M;
const bonePoint = n => { const m = scene.world[nodeIndex.get(Sanitize(B(n)))]; return [m[12] * S, m[13] * S, m[14] * S]; };
const SEG = { head: .0694, trunk: .4346, upperArm: .0271, forearm: .0162, hand: .0061, thigh: .1416, shank: .0433, foot: .0137 };
function CenterOfMass(P) {
  const parts_ = [];
  parts_.push([SEG.head, add(P('Neck'), mul(unit(sub(P('Head'), P('Neck'))), .11))]);
  parts_.push([SEG.trunk, add(P('Neck'), mul(sub(P('Pelvis'), P('Neck')), .5138))]);
  for (const s of ['L', 'R']) {
    const ua = P(s + ' UpperArm'), fa = P(s + ' Forearm'), ha = P(s + ' Hand');
    const fingers = mul([1, 2, 3, 4].map(i => P(`${s} Finger${i}`)).reduce(add), 0.25);
    parts_.push([SEG.upperArm, add(ua, mul(sub(fa, ua), .5772))]);
    parts_.push([SEG.forearm, add(fa, mul(sub(ha, fa), .4574))]);
    parts_.push([SEG.hand, add(ha, mul(sub(fingers, ha), .79))]);
    const th = P(s + ' Thigh'), ca = P(s + ' Calf'), ft = P(s + ' Foot'), to = P(s + ' Toe0');
    parts_.push([SEG.thigh, add(th, mul(sub(ca, th), .4095))]);
    parts_.push([SEG.shank, add(ca, mul(sub(ft, ca), .4459))]);
    parts_.push([SEG.foot, add(ft, mul(sub(to, ft), .55))]);
  }
  let total = [0, 0, 0], mass = 0;
  for (const [m, p] of parts_) { total = add(total, mul(p, m)); mass += m; }
  return mul(total, 1 / mass);
}
const flatBones = ['Pelvis', 'Spine', 'Spine1', 'Spine2', 'Neck', 'Head', 'L Thigh', 'L Calf', 'L Foot', 'L Toe0', 'R Thigh', 'R Calf', 'R Foot', 'R Toe0',
  'L Clavicle', 'L UpperArm', 'L Forearm', 'L Hand', 'R Clavicle', 'R UpperArm', 'R Forearm', 'R Hand', ...[1, 2, 3, 4].flatMap(i => ['L', 'R'].map(s => `${s} Finger${i}`))];
const records = [];
for (let i = 0; i <= M; i++) {
  const t = T * i / M;
  scene.Apply(animation, t);
  RefreshJoints();
  const point = {};
  for (const n of flatBones) point[n] = bonePoint(n);
  const rec = { t, point, com: CenterOfMass(n => point[n] || bonePoint(n)), sole: {}, worldQ: {}, localQ: {} };
  for (const n of ['Pelvis', 'Spine2', 'Neck', 'Head', 'L Thigh', 'R Thigh', 'L UpperArm', 'R UpperArm', 'L Hand', 'R Hand', 'L Forearm', 'R Forearm']) {
    const m = scene.world[nodeIndex.get(Sanitize(B(n)))];
    rec.worldQ[n] = Array.from(m);
  }
  for (const side of ['L', 'R']) {
    let min = Infinity, arg = -1; const pos = [];
    soleVerts[side].forEach(([pi, v], k) => { const p = SkinVertex(pi, v); pos.push(p); if (p[1] < min) { min = p[1]; arg = k; } });
    rec.sole[side] = { min, arg, pos };
  }
  for (const n of ['L Foot', 'R Foot', 'L Toe0', 'R Toe0']) rec.localQ[n] = Array.from(scene.r[nodeIndex.get(Sanitize(B(n)))]);
  rec.weapon = { p: mul(Track(weaponTracks.position, t, 3), S), q: Track(weaponTracks.quaternion, t, 4) };
  records.push(rec);
}
const keyIdx = Array.from({ length: N }, (_, k) => k * SUB);
const times = records.map(r => r.t);

// ------------------------------------------------------------------------------------------------ gates
const out = { schema: 1, revision: data.revision, clipSha256: crypto.createHash('sha256').update(clipText).digest('hex'), units: 'runtime metres (1.66 m NRA actor), seconds, degrees', samplesPerKey: SUB, gait: data.gait };
const gates = [];
const Gate = (id, name, value, pass, note = '') => { gates.push({ id, name, value, pass, note }); return pass; };

// -- 1 seamless loop ---------------------------------------------------------------------------------------------
{
  const firstTime = Math.min(...clip.tracks.filter(t => t.times.length > 1).map(t => t.times[0]));
  const lastTime = Math.max(...clip.tracks.map(t => t.times.at(-1)));
  let poseSeam = 0, quatSeam = 0, poseAtZero = 0, worstSeamTrack = '';
  for (const track of clip.tracks) {
    if (track.times.length < 2) continue;
    const width = track.type === 'quaternion' ? 4 : 3, v = track.values, n = v.length / width;
    if (width === 4) { const a = qAngle(v.slice(0, 4), v.slice((n - 1) * 4, n * 4)); if (a > quatSeam) { quatSeam = a; worstSeamTrack = track.name; } }
    else for (let c = 0; c < 3; c++) poseSeam = Math.max(poseSeam, Math.abs(v[c] - v[(n - 1) * 3 + c]) * S);
  }
  // speed continuity: the second difference of key points at the seam must not be an outlier against the rest of the cycle
  const watch = ['Pelvis', 'L Foot', 'R Foot', 'L Hand', 'R Hand', 'Head'];
  const d2 = k => watch.map(n => len(sub(add(records[keyIdx[(k + 1) % N]].point[n], records[keyIdx[(k + N - 1) % N]].point[n]), mul(records[keyIdx[k]].point[n], 2))));
  const seam = Math.max(...d2(0));
  let rest = 0; for (let k = 1; k < N; k++) rest = Math.max(rest, ...d2(k));
  const pelvisKeys = keyIdx.map(i => records[i].point.Pelvis);
  let maxStep = 0, medianStep; { const steps = pelvisKeys.map((p, k) => len(sub(pelvisKeys[(k + 1) % N], p))); maxStep = Math.max(...steps); medianStep = steps.slice().sort((a, b) => a - b)[N >> 1]; }
  out.loop = { firstTimeS: firstTime, lastTimeS: lastTime, durationS: T, positionSeamM: R(poseSeam, 6), rotationSeamDeg: R(deg(quatSeam), 4), worstSeamTrack,
    seamSecondDifferenceM: R(seam, 5), restMaxSecondDifferenceM: R(rest, 5), pelvisMaxKeyStepM: R(maxStep, 4), pelvisMedianKeyStepM: R(medianStep, 4), keysPerCycle: N };
  Gate(1, 'loop', `starts ${firstTime}s, ends ${lastTime}s, seam ${R(poseSeam * 1000, 3)} mm / ${R(deg(quatSeam), 3)} deg (${worstSeamTrack}), pelvis step max/median ${R(maxStep * 1000, 1)}/${R(medianStep * 1000, 1)} mm, seam d2 ${R(seam * 1000, 1)} vs rest ${R(rest * 1000, 1)} mm`,
    firstTime === 0 && Math.abs(lastTime - T) < 1e-5 && poseSeam < 1e-3 && deg(quatSeam) < 0.05 && seam <= rest * 1.05 && maxStep < 2.5 * medianStep + 1e-9);
}

// -- contact segmentation (3.5 cm on the lowest sole vertex) ----------------------------------------------------
const grounded = side => records.map(r => r.sole[side].min < GROUND_M);
const airborne = records.map(r => r.sole.L.min >= GROUND_M && r.sole.R.min >= GROUND_M);
const flightFraction = airborne.slice(0, M).filter(Boolean).length / M;
function Runs(flags) {   // contiguous true runs over one cycle (wrapped)
  const runs = []; let start = -1;
  const n = M; const f = i => flags[i % n];
  let first = 0; while (first < n && f(first)) first++;
  if (first === n) return [[0, n]];
  for (let k = 0; k < n; k++) { const i = first + k; if (f(i) && start < 0) start = i; if (!f(i) && start >= 0) { runs.push([start, i]); start = -1; } }
  if (start >= 0) runs.push([start, first + n]);
  return runs;
}
const contacts = { L: Runs(grounded('L')), R: Runs(grounded('R')) };
const flights = Runs(airborne);
out.contact = {
  thresholdM: GROUND_M, flightFraction: R(flightFraction, 4),
  stanceS: R(Mean(['L', 'R'].flatMap(s => contacts[s].map(([a, b]) => (b - a) * dt))), 4),
  flightS: R(Mean(flights.map(([a, b]) => (b - a) * dt)), 4),
  contacts: Object.fromEntries(['L', 'R'].map(s => [s, contacts[s].map(([a, b]) => [R((a % M) / M, 4), R(((b - 1) % M + 1) / M, 4)])])),
};

// -- 2 support foot does not slide -----------------------------------------------------------------------------
// Two material anchors per shoe (the rear-most and the front-most sole vertex at rest). While an anchor bears weight (its
// height under a threshold) it must stay where it is on the ground: ground frame = character frame + the run speed.
let anchors;
{
  scene.Apply(scene.animations.length - 2, 0); RefreshJoints();
  anchors = {};
  for (const side of ['L', 'R']) {
    const pts = soleVerts[side].map(([pi, v]) => SkinVertex(pi, v));
    const floor = Math.min(...pts.map(p => p[1]));
    const low = pts.map((p, k) => [p, k]).filter(([p]) => p[1] < floor + 0.02);
    const toe = (() => { const m = scene.world[nodeIndex.get(Sanitize(B(side + ' Toe0')))]; return [m[12] * S, m[13] * S, m[14] * S]; })();
    anchors[side] = { heel: low.reduce((a, b) => (b[0][2] < a[0][2] ? b : a))[1], ball: low.reduce((a, b) => (b[0][2] > a[0][2] ? b : a))[1] };
  }
  scene.Apply(animation, 0);
}
{
  const V = profile.designReferenceMps;
  const results = [];
  const ground = (side, which, i) => {   // ground-frame (lateral, forward) of an anchor at record i (i may exceed M: next cycle)
    const r = records[i % M], p = r.sole[side].pos[anchors[side][which]], t = (i % M) * dt + Math.floor(i / M) * T;
    return { x: p[0], z: p[2] + V * t, h: p[1] };
  };
  for (const side of ['L', 'R']) for (const [a, b] of contacts[side]) {
    for (const which of ['heel', 'ball']) {
      const travel = thr => {   // largest ground-frame distance between any two samples of the bearing window (anchor under thr)
        const pts = []; for (let i = a - SUB; i < b + SUB; i++) { const g = ground(side, which, ((i % M) + M) % M + Math.floor(i / M) * M + (i < 0 ? -M * 0 : 0)); if (g.h < thr) pts.push(g); }
          let worst = 0; for (const p of pts) for (const q of pts) worst = Math.max(worst, Math.hypot(p.x - q.x, p.z - q.z));
        return { worst, n: pts.length };
      };
      const w35 = travel(GROUND_M), wPl = travel(PLANTED_M);
      results.push({ side, anchor: which, from: R((a % M) / M, 3), to: R(((b - 1) % M + 1) / M, 3), travel35cm: R(w35.worst, 4), travelPlantedCm: R(wPl.worst, 4), samples35: w35.n });
    }
  }
  out.slip = { referenceMps: V, contactThresholdM: GROUND_M, plantedThresholdM: PLANTED_M, anchors: 'rear-most (heel) and front-most (toe tip) sole vertex at rest', stances: results,
    maxTravel35M: R(Math.max(...results.map(r => r.travel35cm)), 4), maxTravelPlantedM: R(Math.max(...results.map(r => r.travelPlantedCm)), 4) };
  Gate(2, 'no slip', `anchor travel in the ground frame: ${R(out.slip.maxTravel35M * 100, 2)} cm while under 3.5 cm, ${R(out.slip.maxTravelPlantedM * 100, 2)} cm while under 1.2 cm`, out.slip.maxTravel35M <= 0.015 && results.length >= 4);
}

// -- 3 ground, flight, foot roll -----------------------------------------------------------------------------------
{
  const windows = { L: [[0, profile.designContacts.L[0][1]]], R: [[profile.designContacts.R[0][0], profile.designContacts.R[0][1]]] };
  const inStance = (side, phase) => windows[side].some(([a, b]) => phase >= a - 1e-9 && phase <= b + 1e-9);
  const stanceMin = [], swingMin = [];
  records.forEach((r, i) => {
    const phase = (i % M) / M;
    for (const side of ['L', 'R']) (inStance(side, phase) ? stanceMin : swingMin).push(r.sole[side].min);
  });
  const belowFlight = records.map((r, i) => airborne[i] ? Math.min(r.sole.L.min, r.sole.R.min) : null).filter(v => v !== null);
  const footAngle = [];
  for (const r of records) for (const n of ['L Foot', 'R Foot']) { const k = nodeIndex.get(Sanitize(B(n))); footAngle.push(qAngle(r.localQ[n], restLocalQ[k])); }
  out.ground = { stanceSoleM: R2(Range(stanceMin), 4), swingSoleMinM: R(Math.min(...swingMin), 4), flightFraction: R(flightFraction, 4),
    flightMaxClearanceM: R(Math.max(...belowFlight), 4), footLocalAngleDeg: { mean: R(deg(Mean(footAngle)), 1), max: R(deg(Math.max(...footAngle)), 1) } };
  Gate(3, 'ground/flight', `stance sole ${R2(Range(stanceMin).map(v => v * 1000), 1)} mm, swing min ${R(Math.min(...swingMin) * 1000, 1)} mm, flight ${R(flightFraction * 100, 1)} %, clearance ${R(Math.max(...belowFlight) * 100, 1)} cm, foot angle mean ${R(deg(Mean(footAngle)), 0)} max ${R(deg(Math.max(...footAngle)), 0)}`,
    Math.min(...stanceMin) > -0.002 && Math.max(...stanceMin) < 0.012 && Math.min(...swingMin) > -0.002 && flightFraction > .15 && flightFraction < .35
    && Math.max(...belowFlight) > 0.02 && Math.max(...belowFlight) < 0.25 && deg(Mean(footAngle)) <= 90 && deg(Math.max(...footAngle)) < 140);
}

// -- 4 joints and bone lengths ---------------------------------------------------------------------------------
const flex = (rec, side, kind) => {
  const P = n => rec.point[n];
  const [a, b, c, axisRest, wq] = kind === 'knee' ? [P(side + ' Thigh'), P(side + ' Calf'), P(side + ' Foot'), [1, 0, 0], rec.worldQ[side + ' Thigh']]
    : [P(side + ' UpperArm'), P(side + ' Forearm'), P(side + ' Hand'), side === 'L' ? [0, -1, 0] : [0, 1, 0], rec.worldQ[side + ' UpperArm']];
  const k = nodeIndex.get(Sanitize(B(side + (kind === 'knee' ? ' Thigh' : ' UpperArm'))));
  // world rotation of the bone relative to its rest world rotation (3x3 columns from the column-major matrices)
  const W = wq, Rw = restWorld[k];
  const mul3 = (A, Bm) => { const o = new Array(9); for (let c = 0; c < 3; c++) for (let r = 0; r < 3; r++) { let s = 0; for (let q = 0; q < 3; q++) s += A[q * 4 + r] * Bm[c * 4 + q]; o[c * 3 + r] = s; } return o; };
  // delta = W * Rw^T
  const delta = new Array(9); for (let c = 0; c < 3; c++) for (let r = 0; r < 3; r++) { let s = 0; for (let q = 0; q < 3; q++) s += W[q * 4 + r] * Rw[q * 4 + c]; delta[c * 3 + r] = s; }
  const axis = [delta[0] * axisRest[0] + delta[3] * axisRest[1] + delta[6] * axisRest[2], delta[1] * axisRest[0] + delta[4] * axisRest[1] + delta[7] * axisRest[2], delta[2] * axisRest[0] + delta[5] * axisRest[1] + delta[8] * axisRest[2]];
  const d1 = unit(sub(b, a)), d2 = unit(sub(c, b));
  const ang = Math.acos(Math.max(-1, Math.min(1, dot(d1, d2))));
  return dot(cross(d1, d2), axis) >= 0 ? ang : -ang;
};
{
  const kneeSeries = { L: records.map(r => deg(flex(r, 'L', 'knee'))), R: records.map(r => deg(flex(r, 'R', 'knee'))) };
  const elbowSeries = { L: records.map(r => deg(flex(r, 'L', 'elbow'))), R: records.map(r => deg(flex(r, 'R', 'elbow'))) };
  // touchdown and stance extremes (left foot touchdown is at phase 0; the right at 0.5)
  const tdIndex = { L: 0, R: M / 2 }, stanceEnd = { L: Math.round(profile.designContacts.L[0][1] * M), R: Math.round(profile.designContacts.R[0][1] * M) };
  const tdFlex = ['L', 'R'].map(s => kneeSeries[s][tdIndex[s]]);
  const stancePeak = ['L', 'R'].map(s => { let m = -1e9; for (let i = tdIndex[s]; i <= stanceEnd[s]; i++) m = Math.max(m, kneeSeries[s][i]); return m; });
  const swingPeak = ['L', 'R'].map(s => { let m = -1e9; for (let i = stanceEnd[s]; i < tdIndex[s] + M; i++) m = Math.max(m, kneeSeries[s][i % M]); return m; });
  // bone lengths against the bind (every non-root bone, every sample at key rate)
  let worst = 0, worstBone = '';
  const bind = {}; scene.Apply(scene.animations.length - 2, 0); RefreshJoints();
  for (const n of boneNames) { const k = nodeIndex.get(Sanitize(n)), p = scene.parent[k]; if (p >= 0 && n !== B('Pelvis') && n !== 'GroundRoot') bind[n] = [k, p, len(sub([restWorld[k][12], restWorld[k][13], restWorld[k][14]], [restWorld[p][12], restWorld[p][13], restWorld[p][14]])) * S]; }
  for (const i of keyIdx) {
    scene.Apply(animation, records[i].t);
    for (const [n, [k, p, rest]] of Object.entries(bind)) {
      const l = len(sub([scene.world[k][12], scene.world[k][13], scene.world[k][14]], [scene.world[p][12], scene.world[p][13], scene.world[p][14]])) * S;
      if (Math.abs(l - rest) > worst) { worst = Math.abs(l - rest); worstBone = n; }
    }
  }
  // angle smoothness: key-rate second differences of the joint angle series, spikes against their neighbours
  const smooth = {};
  let worstSpike = 0;
  for (const [label, series] of Object.entries({ kneeL: kneeSeries.L, kneeR: kneeSeries.R, elbowL: elbowSeries.L, elbowR: elbowSeries.R })) {
    const key = keyIdx.map(i => series[i]);
    const d2 = key.map((v, k) => Math.abs(key[(k + 1) % N] - 2 * v + key[(k + N - 1) % N]));
    // a glitch is a one-key outlier: the second difference at k flips sign on both sides (the +1/2, -1, +1/2 signature)
    const sd = key.map((v, k) => key[(k + 1) % N] - 2 * v + key[(k + N - 1) % N]);
    let spike = 0; sd.forEach((v, k) => { const a = sd[(k + N - 1) % N], b = sd[(k + 1) % N]; if (Math.abs(v) > 8 && a * v < 0 && b * v < 0 && Math.abs(a) > .3 * Math.abs(v) && Math.abs(b) > .3 * Math.abs(v)) spike = Math.max(spike, Math.abs(v)); });
    smooth[label] = { maxSecondDifferenceDeg: R(Math.max(...d2), 2), spikeDeg: R(spike, 2), atKey: spike ? d2.indexOf(spike) : -1, series: key.map(v => R(v, 1)) };
    worstSpike = Math.max(worstSpike, spike);
  }
  out.joints = { kneeFlexDeg: { L: R2(Range(kneeSeries.L), 1), R: R2(Range(kneeSeries.R), 1) }, kneeTouchdownDeg: tdFlex.map(v => R(v, 1)), kneeStancePeakDeg: stancePeak.map(v => R(v, 1)),
    kneeSwingPeakDeg: swingPeak.map(v => R(v, 1)), elbowFlexDeg: { L: R2(Range(elbowSeries.L), 1), R: R2(Range(elbowSeries.R), 1) },
    boneLengthWorstErrorMm: R(worst * 1000, 4), worstBone, smoothness: smooth };
  const minKnee = Math.min(...kneeSeries.L, ...kneeSeries.R), minElbow = Math.min(...elbowSeries.L, ...elbowSeries.R), maxElbow = Math.max(...elbowSeries.L, ...elbowSeries.R);
  Gate(4, 'joints', `knee min ${R(minKnee, 1)} td ${tdFlex.map(v => R(v, 0))} stance peak ${stancePeak.map(v => R(v, 0))} swing peak ${swingPeak.map(v => R(v, 0))}; elbow ${R(minElbow, 0)}..${R(maxElbow, 0)}; bone err ${R(worst * 1000, 3)} mm (${worstBone}); spike ${R(worstSpike, 1)}`,
    minKnee >= 2 && minElbow >= 15 && maxElbow <= 165 && worst < 0.001 && worstSpike === 0 && tdFlex.every(v => v >= 8 && v <= 45) && stancePeak.every(v => v <= 85) && swingPeak.every(v => v <= 140));
  scene.Apply(animation, 0);
}

// -- 5 centre-of-mass dynamics ------------------------------------------------------------------------------------
{
  const V = profile.designReferenceMps;
  const zs = records.map(r => r.com[1]);
  const flightFits = flights.map(([a, b]) => {
    const idx = []; for (let i = a; i < b; i++) idx.push(i);
    const ts = idx.map(i => times[i % M] + Math.floor(i / M) * T), vals = idx.map(i => zs[i % M]);
    const fit = Quadratic(ts, vals);
    return { from: R((a % M) / M, 3), to: R(((b - 1) % M + 1) / M, 3), samples: idx.length, accelMps2: R(2 * fit.a, 3), residualRmsMm: R(fit.rms * 1000, 3) };
  });
  // key-rate accelerations (the CoM is exact at keys); vertical and horizontal (relative to the character frame)
  const h = T / N, key = keyIdx.map(i => records[i].com);
  const accel = key.map((c, k) => [0, 1, 2].map(ax => (key[(k + 1) % N][ax] - 2 * c[ax] + key[(k + N - 1) % N][ax]) / (h * h)));
  const keyPhase = k => k / N;
  const stanceKeys = side => { const [a, b] = side === 'L' ? [0, profile.designContacts.L[0][1]] : [0.5, profile.designContacts.R[0][1]]; return key.map((_, k) => k).filter(k => keyPhase(k) >= a - 1e-9 && keyPhase(k) <= b + 1e-9); };
  const stanceReport = ['L', 'R'].map(side => {
    const ks = stanceKeys(side), az = ks.map(k => accel[k][1]), as = ks.map(k => accel[k][2]);
    const third = Math.max(1, Math.floor(ks.length / 3));
    return { side, peakVerticalAccelMps2: R(Math.max(...az), 2), grfPeakBw: R(Math.max(...az) / G + 1, 2), meanVerticalAccelMps2: R(Mean(az), 2),
      firstThirdHorizontalMps2: R(Mean(as.slice(0, third)), 2), lastThirdHorizontalMps2: R(Mean(as.slice(-third)), 2),
      firstPositiveKeyOfStance: ks[az.findIndex(v => v > 0)] - ks[0] };
  });
  const flightHorizontal = flights.map(([a, b]) => { const ks = key.map((_, k) => k).filter(k => k * SUB >= a % M && k * SUB <= (b - 1) % M + (b > M ? 0 : 0)); return ks.length ? Mean(ks.map(k => Math.abs(accel[k][2]))) : 0; });
  const pelvisBob = Range(records.map(r => r.com[1])), swayLat = Range(records.map(r => r.com[0])), surge = Range(records.map(r => r.com[2]));
  const stepsPerMin = 120 / T, stepM = V * T / 2, stanceMean = out.contact.stanceS, flightMean = out.contact.flightS;
  // the same flights with the 4 kg rifle (body 65 kg assumed) added at its mid-barrel point: a second, looser reading
  const rifleKg = weaponJson.mass || 4.0, bodyKg = 65;
  const withRifle = records.map(r => { const m = r.weapon, mid = add(m.p, qRot(m.q, [0, 0, -0.2])); return mul(add(mul(r.com, bodyKg), mul(mid, rifleKg)), 1 / (bodyKg + rifleKg))[1]; });
  const rifleFits = flights.map(([a, b]) => { const idx = []; for (let i = a; i < b; i++) idx.push(i); const fit = Quadratic(idx.map(i => times[i % M] + Math.floor(i / M) * T), idx.map(i => withRifle[i % M])); return R(2 * fit.a, 3); });
  out.com = { flightParabola: flightFits, flightAccelWithRifleMps2: rifleFits, comDefinition: 'de Leva 1996 male segment masses, joint-centre segments, trunk = neck base to pelvis joint (COM 51.38 % from the neck end)', stance: stanceReport, verticalPeakToPeakCm: R((pelvisBob[1] - pelvisBob[0]) * 100, 2), lateralPeakToPeakCm: R((swayLat[1] - swayLat[0]) * 100, 2), surgePeakToPeakCm: R((surge[1] - surge[0]) * 100, 2),
    stepsPerMin: R(stepsPerMin, 1), speedMps: V, stepLengthM: R(stepM, 3), strideM: R(stepM * 2, 3), stepLengthPerHeight: R(stepM / TARGET_HEIGHT, 3), stanceS: stanceMean, flightS: flightMean,
    dutyFactorDesign: R((profile.designContacts.L[0][1] - profile.designContacts.L[0][0]) * 2, 3), dutyFactorUnder3p5cm: R(stanceMean / (stanceMean + flightMean), 3), froude: R(V * V / (G * 0.87), 2) };
  const accelOk = flightFits.every(f => Math.abs(f.accelMps2 + G) / G <= 0.15);
  const signsOk = stanceReport.every(s => s.firstThirdHorizontalMps2 < -0.3 && s.lastThirdHorizontalMps2 > 0.3 && s.peakVerticalAccelMps2 > 0.8 * G && s.peakVerticalAccelMps2 < 2.6 * G);
  Gate(5, 'center of mass', `flight a ${flightFits.map(f => f.accelMps2)} (-9.81 +-15%), bob ${out.com.verticalPeakToPeakCm} cm, GRF peak ${stanceReport.map(s => s.grfPeakBw)} BW, brake/push ${stanceReport.map(s => s.firstThirdHorizontalMps2 + '/' + s.lastThirdHorizontalMps2)}, ${R(stepsPerMin, 0)} steps/min, ${V} m/s`,
    accelOk && signsOk && out.com.verticalPeakToPeakCm >= 4.5 && out.com.verticalPeakToPeakCm <= 11 && stepsPerMin >= 150 && stepsPerMin <= 170 && V >= 3.0 && V <= 4.5);
}

// -- 6 trunk, head, rifle -----------------------------------------------------------------------------------------
{
  const leans = records.map(r => { const d = sub(r.point.Neck, r.point.Pelvis); return deg(Math.atan2(d[2], d[1])); });
  const yawOf = (a, b) => records.map(r => { const d = sub(r.point[a], r.point[b]); return deg(Math.atan2(-d[2], d[0])); });   // + = line turns left
  const hipYaw = yawOf('L Thigh', 'R Thigh'), shoulderYaw = yawOf('L UpperArm', 'R UpperArm');
  const headIndex = nodeIndex.get(Sanitize(B('Head')));
  const DeltaApply = (W, Rw, v) => {   // (W * Rw^T) v with the column-major glTF matrices
    const o = [0, 0, 0];
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) { let s = 0; for (let q = 0; q < 3; q++) s += W[q * 4 + r] * Rw[q * 4 + c]; o[r] += s * v[c]; }
    return o;
  };
  const headEuler = records.map(r => {
    const fwd = DeltaApply(r.worldQ.Head, restWorld[headIndex], [0, 0, 1]), up = DeltaApply(r.worldQ.Head, restWorld[headIndex], [0, 1, 0]);
    return { pitch: deg(Math.atan2(-fwd[1], Math.hypot(fwd[0], fwd[2]))), yaw: deg(Math.atan2(fwd[0], fwd[2])), roll: deg(Math.atan2(up[0], up[1])) };
  });
  // rifle in the world and the hands in the rifle frame
  const frameOf = rec => {
    const q = rec.weapon.q, p = rec.weapon.p;
    return { to: v => add(p, qRot(q, v)), from: v => qRot(qInv(q), sub(v, p)), q, p };
  };
  // glTF -> gait axes happen implicitly: the weapon track is in glTF coordinates (x left, y up, z forward), so are the points
  const gripCenter = (rec, s) => mul([1, 2, 3, 4].map(i => rec.point[`${s} Finger${i}`]).reduce(add), 0.25);
  const rGrip = [], lGrip = [], axisPitch = [], axisYaw = [], elev = [], handRot = [];
  const muzzleHeights = [], handFrames = { L: [], R: [] };
  for (const rec of records) {
    const f = frameOf(rec);
    rGrip.push(f.from(gripCenter(rec, 'R'))); lGrip.push(f.from(gripCenter(rec, 'L')));
    const axis = qRot(f.q, [0, 0, -1]);                      // muzzle direction, glTF (x left, y up, z forward)
    axisPitch.push(deg(Math.atan2(axis[1], axis[2])));       // sagittal projection: up over forward
    elev.push(deg(Math.asin(axis[1])));
    axisYaw.push(deg(Math.atan2(axis[0], axis[2])));         // + = to the soldier's left
    muzzleHeights.push(f.to(RIFLE_MUZZLE)[1]);
  }
  const rg = [0, 1, 2].map(c => Range(rGrip.map(v => v[c]))), lg = [0, 1, 2].map(c => Range(lGrip.map(v => v[c])));
  const spanSeries = lGrip.map(v => -v[2]);
  // chest-relative stiffness: hands and rifle relative to the chest bone
  const chestRel = (pick) => { const rel = records.map(r => { const m = r.worldQ.Spine2, ax = [[m[0], m[1], m[2]], [m[4], m[5], m[6]], [m[8], m[9], m[10]]]; const d = sub(pick(r), r.point.Spine2); return ax.map(a => dot(d, a)); }); return [0, 1, 2].map(c => Range(rel.map(v => v[c]))); };
  const handRel = { R: chestRel(r => r.point['R Hand']), L: chestRel(r => r.point['L Hand']) };
  const chestRotRange = (() => { // rifle orientation relative to the chest
    const rel = records.map(r => { const m = r.worldQ.Spine2, ch = [m[8], m[9], m[10]]; const ax = qRot(r.weapon.q, [0, 0, -1]); return [dot(ax, [m[0], m[1], m[2]]), dot(ax, [m[4], m[5], m[6]]), dot(ax, ch)]; });
    const angles = rel.map(v => deg(Math.atan2(v[1], v[2]))); const yaws = rel.map(v => deg(Math.atan2(v[0], v[2])));
    return { pitchDeg: Range(angles), yawDeg: Range(yaws) };
  })();
  // rifle penetration against torso, neck, head, shoulders, hips
  let worstPen = 0, penAt = -1, nearest = 1, penPart = '', penRifle = null;
  for (let i = 0; i <= M; i += SUB) {
    scene.Apply(animation, records[i].t); RefreshJoints();
    const body = bodyVerts.map(([pi, v]) => SkinVertex(pi, v, true));
    const cell = 0.03, grid = new Map();
    body.forEach(([p, n], k) => { const key = `${Math.floor(p[0] / cell)},${Math.floor(p[1] / cell)},${Math.floor(p[2] / cell)}`; (grid.get(key) || grid.set(key, []).get(key)).push(k); });
    const f = frameOf(records[i]);
    const toWorld = v => { const g = qRot(f.q, v); return add(f.p, g); };
    for (let v = 0; v < rifleVerts.length; v += 3) {
      const p = toWorld(rifleVerts[v]);
      const cx = Math.floor(p[0] / cell), cy = Math.floor(p[1] / cell), cz = Math.floor(p[2] / cell);
      let best = null, bd = 0.045;
      for (let x = -1; x <= 1; x++) for (let y = -1; y <= 1; y++) for (let z = -1; z <= 1; z++) {
        const list = grid.get(`${cx + x},${cy + y},${cz + z}`); if (!list) continue;
        for (const k of list) { const d = len(sub(p, body[k][0])); if (d < bd) { bd = d; best = k; } }
      }
      if (best !== null) {
        const signed = dot(sub(p, body[best][0]), body[best][1]);
        nearest = Math.min(nearest, signed);
        if (-signed > worstPen) { worstPen = -signed; penAt = i / SUB; penPart = bodyVerts[best][2]; penRifle = rifleVerts[v].map(x => R(x, 3)); }
      }
    }
  }
  scene.Apply(animation, 0);
  const headRange = c => R(Range(headEuler.map(e => e[c])).reduce((a, b) => b - a), 2);
  const corr = Corr(hipYaw, shoulderYaw);
  const span = Range(spanSeries);
  out.upperBody = { leanDeg: { range: R2(Range(leans), 2), mean: R(Mean(leans), 2), peakToPeak: R(Range(leans)[1] - Range(leans)[0], 2) },
    hipYawDeg: R2(Range(hipYaw), 2), shoulderYawDeg: R2(Range(shoulderYaw), 2), hipShoulderCorrelation: R(corr, 3),
    headPeakToPeakDeg: { pitch: headRange('pitch'), yaw: headRange('yaw'), roll: headRange('roll') },
    rifle: { sagittalPitchDeg: R2(Range(axisPitch), 2), sagittalPitchMean: R(Mean(axisPitch), 2), elevationDeg: R2(Range(elev), 2), yawLeftDeg: R2(Range(axisYaw), 2),
      muzzleHeightM: R2(Range(muzzleHeights), 3), muzzleDriftVsChest: chestRotRange },
    grips: { rightGripInRifleFrameMm: { x: R2(rg[0].map(v => v * 1000), 2), y: R2(rg[1].map(v => v * 1000), 2), z: R2(rg[2].map(v => v * 1000), 2) },
      leftGripInRifleFrameMm: { x: R2(lg[0].map(v => v * 1000), 2), y: R2(lg[1].map(v => v * 1000), 2), z: R2(lg[2].map(v => v * 1000), 2) }, spanM: R2(span, 4) },
    handMotionInChestFrameCm: { R: handRel.R.map(r => R((r[1] - r[0]) * 100, 2)), L: handRel.L.map(r => R((r[1] - r[0]) * 100, 2)) },
    rifleClearance: { worstPenetrationMm: R(worstPen * 1000, 2), atKey: penAt, bodyPart: penPart, rifleLocalPoint: penRifle, nearestSignedMm: R(nearest * 1000, 2) } };
  const gripSpread = Math.max(...[...rg, ...lg].map(r => r[1] - r[0]));
  Gate(6, 'trunk & rifle', `lean ${R2(Range(leans), 1)} (p-p ${R(Range(leans)[1] - Range(leans)[0], 1)}), hip/shoulder yaw ${R(Range(hipYaw)[1] - Range(hipYaw)[0], 1)}/${R(Range(shoulderYaw)[1] - Range(shoulderYaw)[0], 1)} deg r=${R(corr, 2)}, head p-p ${headRange('pitch')}/${headRange('yaw')}/${headRange('roll')}, grips move ${R(gripSpread * 1000, 1)} mm, muzzle ${R(Mean(axisPitch), 1)} deg (${R2(Range(axisPitch), 1)}), penetration ${R(worstPen * 1000, 1)} mm`,
    Mean(leans) >= 14 && Mean(leans) <= 21 && Range(leans)[1] - Range(leans)[0] <= 4.5 && corr < -0.8 && Range(hipYaw)[1] - Range(hipYaw)[0] >= 6 && Range(shoulderYaw)[1] - Range(shoulderYaw)[0] >= 5
    && Number(headRange('pitch')) <= 6 && Number(headRange('yaw')) <= 8 && Number(headRange('roll')) <= 6 && gripSpread < 0.004 && Mean(axisPitch) >= 45 && Mean(axisPitch) <= 55 && Range(axisPitch)[1] - Range(axisPitch)[0] <= 6 && worstPen < 0.008);
}

// -- 7 secondary motion --------------------------------------------------------------------------------------------
{
  const bob = records.map(r => r.com[1]), pelvis = records.map(r => r.point.Pelvis[1]), rifle = records.map(r => r.weapon.p[1]), chest = records.map(r => r.point.Spine2[1]);
  const amp = v => (Math.max(...v) - Math.min(...v)) / 2;
  const lagDeg = (ref, sig) => { let best = 0, bc = -2; for (let s = 0; s < M; s++) { const shifted = sig.slice(0, M).map((_, i) => sig[(i + s) % M]);  /* advance sig by s: it lags ref by s when they line up */ const c = Corr(ref.slice(0, M), shifted); if (c > bc) { bc = c; best = s; } } return best / M * 360; };
  const lag = lagDeg(chest, rifle);
  out.secondary = { pack: 'rigid on Spine2 (the model has no pack bones; none added)', rifleVerticalAmplitudeCm: R(amp(rifle) * 100, 2), chestVerticalAmplitudeCm: R(amp(chest) * 100, 2), rifleLagBehindChestDeg: R(lag > 180 ? lag - 360 : lag, 1) };
  Gate(7, 'secondary', `rifle bob ${R(amp(rifle) * 100, 1)} cm vs chest ${R(amp(chest) * 100, 1)} cm, lag ${R(lag > 180 ? lag - 360 : lag, 0)} deg (pack rigid, none added)`,
    amp(rifle) <= amp(chest) && amp(rifle) >= 0.5 * amp(chest) && (lag > 180 ? lag - 360 : lag) >= 5 && (lag > 180 ? lag - 360 : lag) <= 90);
}

// -- the runtime profile (production rule, model units) is fresh, and the runtime loads this revision -----------------
{
  const measured = MeasureProfile(data);
  for (const key of ['duration', 'referenceMps', 'contacts']) assert.deepEqual(profile[key], measured[key], `profile.${key} is stale: run _import/Script_RifleHoldRunProfile.mjs`);
  assert.equal(data.revision, ALLY_GAIT.holdRunVersion, 'Data_Tuning_AllyGait.holdRunVersion matches the shipped clip revision');
  const runtimeScale = S, runtimeMps = measured.referenceMps * runtimeScale;
  assert.ok(Math.abs(runtimeMps - profile.designReferenceMps) / profile.designReferenceMps < 0.03, `measured toe speed ${R(runtimeMps, 3)} m/s vs design ${profile.designReferenceMps}`);
  assert.ok(ALLY_GAIT.holdRunBelowMps < runtimeMps && runtimeMps < ALLY_GAIT.holdRunAboveMps + 1.2, 'the run speed band brackets the clip speed');
  out.runtimeProfile = { referenceMpsModelUnits: measured.referenceMps, referenceMpsRuntime: R(runtimeMps, 3), contacts: measured.contacts, rule: 'toe joint within 3.5 cm of its floor and travelling back > 0.12 m/s for > 75 ms, 120 Hz (Script_LocomotionProfileBake)' };
}

// -- every Tengxian model binds every track ------------------------------------------------------------------------
{
  let tracks = 0;
  for (const rec of catalog.models) {
    const g = LoadGlb(fs.readFileSync(path.join(here, `Model/Character/Model_${rec.id}.glb`)));
    const names = new Set(g.json.nodes.map(n => n.name.replace(/\s/g, '_')));
    for (const track of clip.tracks) { if (track.name.startsWith(data.weaponTrack + '.')) continue; assert.ok(names.has(track.name.split('.')[0]), `${rec.id} lacks ${track.name}`); tracks++; }
  }
  out.binds = { models: catalog.models.length, tracksChecked: tracks };
}

out.gates = gates.map(({ id, name, pass, value }) => ({ id, name, pass, value }));
// ------------------------------------------------------------------------------------------------ report
const width = Math.max(...gates.map(g => g.name.length));
console.log(gates.map(g => `${g.pass ? 'PASS' : 'FAIL'} gate ${g.id} ${g.name.padEnd(width)}  ${g.value}`).join('\n'));
if (args.has('--write')) { fs.writeFileSync(path.join(dir, 'Data_RifleHoldRun.json'), JSON.stringify(out, null, 1) + '\n'); console.log('wrote Data_RifleHoldRun.json'); }
if (args.has('--json')) fs.writeFileSync(path.join(here, '../tmp/RifleHoldRun/Last_Measure.json'), JSON.stringify(out, null, 1));
if (!args.has('--write') && !args.has('--report')) {
  const committed = JSON.parse(fs.readFileSync(path.join(dir, 'Data_RifleHoldRun.json'), 'utf8'));
  assert.equal(committed.clipSha256, out.clipSha256, 'Data_RifleHoldRun.json is stale: run the test with --write after a rebake');
  assert.ok(committed.gates.every(g => g.pass), 'committed Data_RifleHoldRun.json records a failed gate');
}
if (!args.has('--report')) assert.ok(gates.every(g => g.pass), 'gates failed: ' + gates.filter(g => !g.pass).map(g => g.name).join(', '));
console.log(`ok RifleHoldRun ${data.revision}: ${out.com.stepsPerMin} steps/min, ${out.com.speedMps} m/s, flight ${out.ground.flightFraction}`);
