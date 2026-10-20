// RifleShoulderMarch gate: measures the SHIPPED clip (Animation/RifleShoulderMarch/Animation_TengxianRifleShoulderMarch.json)
// on the real skinned mesh of Model_TengxianNra02.glb, independently of the Blender baker (nothing here reads the baker's own
// numbers). Sampled at half the key rate (120 Hz for the 60 fps keys), through three.js-style linear/slerp channels.
//   node Taierzhuang1938/Script_RifleShoulderMarchTest.mjs            # gate: exit 1 on any failed limit
//   node Taierzhuang1938/Script_RifleShoulderMarchTest.mjs --table    # also print every measured number
//   node Taierzhuang1938/Script_RifleShoulderMarchTest.mjs --write    # re-measure and rewrite Animation/RifleShoulderMarch/Data_RifleShoulderMarch.json
// Frames: glTF +Y up, asset forward +Z (+X is the soldier's left), metres of the shipped GLB. The actor is scaled by
// 1.66 / 1.817118 = 0.91353 at runtime, "world" numbers below apply that factor; the rifle keeps its real size, so in
// model metres it is 1 / 0.91353 times its mesh.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { LoadGlb, PoseScene, ReadAccessor, ReadAccessorInt, Multiply } from './_import/Script_LugouGlbPose.mjs';
import { LoadRifleMesh } from './_import/Script_RifleShoulderMarchPrepare.mjs';
import * as THREE from './vendor/three/build/three.module.js';

const project = import.meta.dirname;
const clipFile = 'Animation/RifleShoulderMarch/Animation_TengxianRifleShoulderMarch.json';
const dataFile = 'Animation/RifleShoulderMarch/Data_RifleShoulderMarch.json';
const modelFile = 'Model/Character/Model_TengxianNra02.glb';
const ACTOR_SCALE = 1.66 / 1.817118;       // runtime scale of NRA02 (target height / bounds height of the manifest)
const RIFLE_SCALE = 1 / ACTOR_SCALE;       // the weapon keeps real dimensions: model metres per mesh metre
const RIFLE_MASS_KG = 4.0, BODY_MASS_KG = 60;   // Data_Weapons ZhongZheng massKg; the body mass only sets the rifle's share
const G = 9.81;
const B = (part) => 'Bip001 ' + part;

// Limits and where they come from (see Data_RifleShoulderMarch.md "口径与出处"). All lengths metres, angles degrees.
export const LIMITS = {
  loop: { seamKeyDiff: 1e-6, seamAccelRatioMax: 1.5 },
  slide: { maxM: 0.010 },
  floor: { stanceMinM: -0.002, stanceMaxM: 0.012, swingMinM: -0.002, groundedHeightM: 0.012, groundedSpeedMps: 0.30,
    doubleSupportFraction: [0.20, 0.30], footLocalAngleMaxDeg: 75 },
  joints: { hyperextensionMinDeg: -0.5, kneeMaxDeg: 140, elbowMaxDeg: 150, boneLengthErrM: 0.001, glitchDeg: 1.5, spikeDeg: 4.5 },
  gait: { cadenceSpm: [100, 120], worldSpeedMps: [1.2, 1.5], froude: [0.12, 0.30], speedErrFrac: 0.03,
    comVerticalPPM: [0.02, 0.06], comPeakInMiddleShare: 0.5, comTroughSlackCycle: 0.06, grfMinMps2: 0.05, grfHarmonics: 4 },
  upper: { pelvisYawPPDeg: [5, 12], shoulderYawPPDeg: [5, 14], yawCorrelationMax: -0.85, headPPDeg: 4.0, headHfRmsDeg: 0.2,
    armLegCorrelation: 0.8, rightHandInChestPPM: 0.015, trunkLeanLeftMeanDeg: [0.5, 4.0], trunkLeanLeftPPDeg: 6.0,
    trunkForwardMeanDeg: [2, 10] },
  rifle: { gripSlipM: 0.001, gripTurnDeg: 1.0, originToKnuckleM: 0.002, bobPitchRollPPDeg: 2.0, bobLiftPPM: 0.01,
    penetrationM: 0.012, shoulderSinkM: 0.02, seatGapM: [-0.02, 0.02] },
};

const Rad = (d) => d * Math.PI / 180, Deg = (r) => r * 180 / Math.PI;
const Sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const Add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const Mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const Dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const Cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const Len = (a) => Math.hypot(a[0], a[1], a[2]);
const Unit = (a) => { const l = Len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const Lerp3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const Range = (list) => [Math.min(...list), Math.max(...list)];
const PP = (list) => Math.max(...list) - Math.min(...list);
const Mean = (list) => list.reduce((s, v) => s + v, 0) / list.length;
const Median = (list) => { const s = [...list].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };
const Corr = (a, b) => {
  const ma = Mean(a), mb = Mean(b);
  let sab = 0, saa = 0, sbb = 0;
  for (let i = 0; i < a.length; i += 1) { sab += (a[i] - ma) * (b[i] - mb); saa += (a[i] - ma) ** 2; sbb += (b[i] - mb) ** 2; }
  return sab / Math.sqrt(saa * sbb);
};
const Pos = (world) => [world[12], world[13], world[14]];
const Rot3 = (world, v) => [world[0] * v[0] + world[4] * v[1] + world[8] * v[2], world[1] * v[0] + world[5] * v[1] + world[9] * v[2], world[2] * v[0] + world[6] * v[1] + world[10] * v[2]];
const Round = (v, n = 5) => (Number.isFinite(v) ? +v.toFixed(n) : v);

function QuatSlerp(a, b, t) {
  let dot = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
  const bb = dot < 0 ? b.map((v) => -v) : b;
  dot = Math.abs(dot);
  let s0 = 1 - t, s1 = t;
  if (dot < 0.9995) { const th = Math.acos(dot), sn = Math.sin(th); s0 = Math.sin((1 - t) * th) / sn; s1 = Math.sin(t * th) / sn; }
  const q = [0, 1, 2, 3].map((i) => s0 * a[i] + s1 * bb[i]);
  const l = Math.hypot(...q);
  return q.map((v) => v / l);
}
function SampleTrack(track, t, width) {
  const { times, values } = track;
  if (times.length === 1) return values.slice(0, width);
  let i = 0;
  while (i < times.length - 2 && times[i + 1] <= t) i += 1;
  const a = Math.min(1, Math.max(0, (t - times[i]) / (times[i + 1] - times[i])));
  const va = values.slice(i * width, (i + 1) * width), vb = values.slice((i + 1) * width, (i + 2) * width);
  return width === 4 ? QuatSlerp(va, vb, a) : va.map((v, k) => v + (vb[k] - v) * a);
}
function QuatToMat(q) {
  const [x, y, z, w] = q;
  return [1 - 2 * (y * y + z * z), 2 * (x * y + w * z), 2 * (x * z - w * y), 0, 2 * (x * y - w * z), 1 - 2 * (x * x + z * z), 2 * (y * z + w * x), 0,
    2 * (x * z + w * y), 2 * (y * z - w * x), 1 - 2 * (x * x + y * y), 0, 0, 0, 0, 1];
}


/** First derivative (per s) of a periodic series, harmonics 1..K only. */
function PeriodicFirstDerivative(series, T, K) {
  const n = series.length, out = new Array(n).fill(0);
  for (let k = 1; k <= K; k += 1) {
    let a = 0, b = 0;
    for (let i = 0; i < n; i += 1) { a += series[i] * Math.cos(2 * Math.PI * k * i / n); b += series[i] * Math.sin(2 * Math.PI * k * i / n); }
    a *= 2 / n; b *= 2 / n;
    const w = 2 * Math.PI * k / T;
    for (let i = 0; i < n; i += 1) out[i] += w * (-a * Math.sin(2 * Math.PI * k * i / n) + b * Math.cos(2 * Math.PI * k * i / n));
  }
  return out;
}

/** Second derivative (per s^2) of a periodic series over one cycle of T seconds, from its Fourier harmonics 1..K only. */
function PeriodicSecondDerivative(series, T, K) {
  const n = series.length, out = new Array(n).fill(0);
  for (let k = 1; k <= K; k += 1) {
    let a = 0, b = 0;
    for (let i = 0; i < n; i += 1) { a += series[i] * Math.cos(2 * Math.PI * k * i / n); b += series[i] * Math.sin(2 * Math.PI * k * i / n); }
    a *= 2 / n; b *= 2 / n;
    const w = 2 * Math.PI * k / T;
    for (let i = 0; i < n; i += 1) out[i] -= w * w * (a * Math.cos(2 * Math.PI * k * i / n) + b * Math.sin(2 * Math.PI * k * i / n));
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------- model
function LoadModel() {
  const glb = LoadGlb(path.join(project, modelFile));
  const scene = new PoseScene(glb);
  const nodeIndex = new Map(scene.nodes.map((n, i) => [n.name, i]));
  const parts = [];
  for (const node of glb.json.nodes) {
    if (node.mesh === undefined || node.skin === undefined) continue;
    const skin = glb.json.skins[node.skin];
    const inverseBind = ReadAccessor(glb, skin.inverseBindMatrices).data;
    for (const primitive of glb.json.meshes[node.mesh].primitives) {
      const position = ReadAccessor(glb, primitive.attributes.POSITION);
      parts.push({ joints: skin.joints, inverseBind, position: position.data, count: position.count,
        jointIndex: ReadAccessorInt(glb, primitive.attributes.JOINTS_0).data, weight: ReadAccessor(glb, primitive.attributes.WEIGHTS_0).data,
        index: ReadAccessorInt(glb, primitive.indices).data });
    }
  }
  return { glb, scene, nodeIndex, parts };
}

/** Skinned positions of every vertex of every part (Float64Array per part), for the current scene pose. */
function SkinPositions(scene, parts) {
  const scratch = new Float64Array(16), bind = new Float64Array(16);
  return parts.map((part) => {
    const matrices = new Float64Array(part.joints.length * 16);
    for (let j = 0; j < part.joints.length; j += 1) {
      for (let k = 0; k < 16; k += 1) bind[k] = part.inverseBind[j * 16 + k];
      Multiply(scratch, scene.world[part.joints[j]], bind);
      matrices.set(scratch, j * 16);
    }
    const out = new Float64Array(part.count * 3);
    for (let v = 0; v < part.count; v += 1) {
      const x = part.position[v * 3], y = part.position[v * 3 + 1], z = part.position[v * 3 + 2];
      let px = 0, py = 0, pz = 0, total = 0;
      for (let k = 0; k < 4; k += 1) {
        const w = part.weight[v * 4 + k];
        if (w === 0) continue;
        const o = part.jointIndex[v * 4 + k] * 16;
        px += w * (matrices[o] * x + matrices[o + 4] * y + matrices[o + 8] * z + matrices[o + 12]);
        py += w * (matrices[o + 1] * x + matrices[o + 5] * y + matrices[o + 9] * z + matrices[o + 13]);
        pz += w * (matrices[o + 2] * x + matrices[o + 6] * y + matrices[o + 10] * z + matrices[o + 14]);
        total += w;
      }
      out[v * 3] = px / total; out[v * 3 + 1] = py / total; out[v * 3 + 2] = pz / total;
    }
    return out;
  });
}

function JointWeight(part, v, jointNode) {
  let w = 0;
  for (let k = 0; k < 4; k += 1) if (part.joints[part.jointIndex[v * 4 + k]] === jointNode) w += part.weight[v * 4 + k];
  return w;
}

// Region of a triangle = the body part carrying most of its weight.
const REGION_RULES = [
  ['handR', /R (Hand|Finger)/], ['forearmR', /R Forearm/], ['upperArmR', /R (UpperArm|Clavicle)/],
  ['arms L', /L (UpperArm|Forearm|Clavicle|Hand|Finger)/], ['head', / Head/], ['neck', / Neck/], ['torso', / (Spine|Pelvis)/], ['legs', /(Thigh|Calf|Foot|Toe)/],
];
function RegionOf(name) { for (const [region, rule] of REGION_RULES) if (rule.test(name)) return region; return 'other'; }

// ------------------------------------------------------------------------------------- triangle distance
function ClosestOnTriangle(p, a, b, c) {
  const ab = Sub(b, a), ac = Sub(c, a), ap = Sub(p, a);
  const d1 = Dot(ab, ap), d2 = Dot(ac, ap);
  if (d1 <= 0 && d2 <= 0) return a;
  const bp = Sub(p, b), d3 = Dot(ab, bp), d4 = Dot(ac, bp);
  if (d3 >= 0 && d4 <= d3) return b;
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) return Add(a, Mul(ab, d1 / (d1 - d3)));
  const cp = Sub(p, c), d5 = Dot(ab, cp), d6 = Dot(ac, cp);
  if (d6 >= 0 && d5 <= d6) return c;
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) return Add(a, Mul(ac, d2 / (d2 - d6)));
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) return Add(b, Mul(Sub(c, b), (d4 - d3) / ((d4 - d3) + (d5 - d6))));
  const denom = 1 / (va + vb + vc);
  return Add(a, Add(Mul(ab, vb * denom), Mul(ac, vc * denom)));
}

class TriangleGrid {
  constructor(positions, parts, regions, cell = 0.05) {
    this.cell = cell; this.map = new Map(); this.tris = [];
    parts.forEach((part, pi) => {
      const P = positions[pi];
      for (let i = 0; i < part.index.length; i += 3) {
        const ia = part.index[i], ib = part.index[i + 1], ic = part.index[i + 2];
        const a = [P[ia * 3], P[ia * 3 + 1], P[ia * 3 + 2]], b = [P[ib * 3], P[ib * 3 + 1], P[ib * 3 + 2]], c = [P[ic * 3], P[ic * 3 + 1], P[ic * 3 + 2]];
        const n = Cross(Sub(b, a), Sub(c, a));
        const ln = Len(n);
        if (ln < 1e-12) continue;
        const tri = { a, b, c, n: [n[0] / ln, n[1] / ln, n[2] / ln], region: regions[pi][i / 3] };
        const id = this.tris.push(tri) - 1;
        const lo = [0, 1, 2].map((k) => Math.floor(Math.min(a[k], b[k], c[k]) / cell)), hi = [0, 1, 2].map((k) => Math.floor(Math.max(a[k], b[k], c[k]) / cell));
        for (let x = lo[0]; x <= hi[0]; x += 1) for (let y = lo[1]; y <= hi[1]; y += 1) for (let z = lo[2]; z <= hi[2]; z += 1) {
          const key = TriangleGrid.Key(x, y, z);
          let list = this.map.get(key); if (!list) this.map.set(key, list = []);
          list.push(id);
        }
      }
    });
  }
  static Key(x, y, z) { return (x + 512) * 1048576 + (y + 512) * 1024 + (z + 512); }
  /** Nearest triangle within one cell: { dist (signed, + = outside), region } or null. */
  Nearest(p, exclude = null) {
    const c = this.cell;
    const ix = Math.floor(p[0] / c), iy = Math.floor(p[1] / c), iz = Math.floor(p[2] / c);
    let best = null, bestD2 = Infinity;
    const seen = new Set();
    for (let x = ix - 1; x <= ix + 1; x += 1) for (let y = iy - 1; y <= iy + 1; y += 1) for (let z = iz - 1; z <= iz + 1; z += 1) {
      const list = this.map.get(TriangleGrid.Key(x, y, z));
      if (!list) continue;
      for (const id of list) {
        if (seen.has(id)) continue; seen.add(id);
        const t = this.tris[id];
        if (exclude && exclude.has(t.region)) continue;
        const q = ClosestOnTriangle(p, t.a, t.b, t.c), d = Sub(p, q), d2 = Dot(d, d);
        if (d2 < bestD2) { bestD2 = d2; best = { tri: t, d }; }
      }
    }
    if (!best) return null;
    const dist = Math.sqrt(bestD2);
    const sign = Dot(best.d, best.tri.n) >= 0 ? 1 : -1;
    return { dist: sign * dist, region: best.tri.region };
  }
}

// ---------------------------------------------------------------------------------------------------- measure
export function Measure({ clipPath = path.join(project, clipFile), quiet = false } = {}) {
  const raw = fs.readFileSync(clipPath);
  const data = JSON.parse(raw);
  const clip = data.clips[0];
  const profile = data.profiles[clip.name];
  const model = LoadModel();
  const { scene, nodeIndex, parts } = model;
  const metrics = {}, checks = [];
  const Check = (id, label, value, ok, limit) => checks.push({ id, label, value, ok: !!ok, limit });
  const ni = (name) => { const i = nodeIndex.get(name); if (i === undefined) throw new Error('no node ' + name); return i; };

  // ---- animation channels from the shipped tracks (rifle prop track kept apart)
  const byBone = new Map(scene.nodes.map((n, i) => [n.name.replace(/\s/g, '_'), i]));
  const channels = [], propTracks = {};
  for (const track of clip.tracks) {
    const [name, property] = track.name.split('.');
    if (name === 'AllyRifle') { propTracks[property] = track; continue; }
    assert.ok(byBone.has(name), 'clip bone ' + name + ' missing in the model');
    channels.push({ node: byBone.get(name), path: property === 'quaternion' ? 'rotation' : 'translation', width: property === 'quaternion' ? 4 : 3,
      input: track.times, output: track.values, interpolation: 'LINEAR' });
  }
  scene.animations.push({ name: clip.name, channels, duration: clip.duration });
  const clipIndex = scene.animations.length - 1;
  scene.animations.push({ name: '__rest', channels: [], duration: 0 });
  const restIndex = scene.animations.length - 1;

  // ---- sampling grid: half the key rate
  const fps = Math.round(1 / (clip.tracks.find((t) => t.times.length > 2).times[1]));
  const keyCount = Math.round(clip.duration * fps);
  const N = keyCount * 2;                    // samples per cycle at half-frame spacing
  const T = clip.duration, dt = T / N;
  const refSpeed = profile.referenceMps;
  metrics.frames = { keys: keyCount, fps, durationS: T, samplesPerCycle: N, referenceMps: refSpeed };

  // ---- rest data: sole vertices, pivot vertices, rest bone frames
  scene.Apply(restIndex, 0);
  const restPos = SkinPositions(scene, parts);
  const restWorld = scene.world.map((m) => Float64Array.from(m));
  const restHead = (name) => Pos(restWorld[ni(name)]);
  const sole = {}, pivots = {};
  for (const s of ['L', 'R']) {
    const foot = ni(B(s + ' Foot')), toe = ni(B(s + ' Toe0'));
    const list = [];
    parts.forEach((part, pi) => { for (let v = 0; v < part.count; v += 1) { if (JointWeight(part, v, foot) + JointWeight(part, v, toe) > 0.55) list.push([pi, v]); } });
    sole[s] = list;
    const low = list.filter(([pi, v]) => restPos[pi][v * 3 + 1] < 0.010);
    const footHead = restHead(B(s + ' Foot')), toeHead = restHead(B(s + ' Toe0'));
    const Z = ([pi, v]) => restPos[pi][v * 3 + 2], X = ([pi, v]) => restPos[pi][v * 3];
    const rear = Math.min(...low.map(Z));
    const heelCand = low.filter((e) => Z(e) < rear + 0.006);
    const heel = heelCand.reduce((a, e) => (Math.abs(X(e) - footHead[0]) < Math.abs(X(a) - footHead[0]) ? e : a));
    const ballCand = low.filter(([pi, v]) => JointWeight(parts[pi], v, toe) > 0.95 && restPos[pi][v * 3 + 2] > toeHead[2] - 0.002)
      .sort((a, b) => Z(a) - Z(b)).slice(0, 12);
    const ball = ballCand.reduce((a, e) => (Math.abs(X(e) - toeHead[0]) < Math.abs(X(a) - toeHead[0]) ? e : a));
    pivots[s] = { heel, ball };
  }
  // triangle regions (once)
  const regions = parts.map((part) => {
    const out = [];
    for (let i = 0; i < part.index.length; i += 3) {
      const score = new Map();
      for (let k = 0; k < 3; k += 1) {
        const v = part.index[i + k];
        for (let j = 0; j < 4; j += 1) {
          const w = part.weight[v * 4 + j]; if (!w) continue;
          const name = scene.nodes[part.joints[part.jointIndex[v * 4 + j]]].name;
          const region = RegionOf(name);
          score.set(region, (score.get(region) || 0) + w);
        }
      }
      out.push([...score.entries()].sort((a, b) => b[1] - a[1])[0][0]);
    }
    return out;
  });
  const rifle = LoadRifleMesh();
  const riflePoints = [];
  for (const mesh of rifle.meshes) for (let i = 0; i < mesh.position.length; i += 15) riflePoints.push([mesh.position[i], mesh.position[i + 1], mesh.position[i + 2]]);
  
  // ---- per-sample pass
  const names = {
    pelvis: B('Pelvis'), spine2: B('Spine2'), neck: B('Neck'), head: B('Head'),
  };
  const samples = [];
  const bones = [...scene.nodes.keys()].filter((i) => /^Bip001/.test(scene.nodes[i].name));
  const kneeAxisRest = { L: [1, 0, 0], R: [1, 0, 0] };
  const elbowAxisRest = {};
  for (const s of ['L', 'R']) {
    const d1 = Unit(Sub(restHead(B(s + ' Forearm')), restHead(B(s + ' UpperArm')))), d2 = Unit(Sub(restHead(B(s + ' Hand')), restHead(B(s + ' Forearm'))));
    elbowAxisRest[s] = Unit(Cross(d1, d2));
  }
  const restRotInv = (name) => { const m = restWorld[ni(name)]; return [m[0], m[1], m[2], m[4], m[5], m[6], m[8], m[9], m[10]]; };   // row-major transpose of the rest 3x3 (= its inverse)
  const MatVec3T = (m, v) => [m[0] * v[0] + m[1] * v[1] + m[2] * v[2], m[3] * v[0] + m[4] * v[1] + m[5] * v[2], m[6] * v[0] + m[7] * v[1] + m[8] * v[2]];
  // express a world vector/point in the world-aligned frame a bone would have if it still sat at its rest orientation
  const Undo = (name, world, v) => {
    const now = world[ni(name)], rest = restWorld[ni(name)];
    const c = [Dot(v, [now[0], now[1], now[2]]), Dot(v, [now[4], now[5], now[6]]), Dot(v, [now[8], now[9], now[10]])];
    return [c[0] * rest[0] + c[1] * rest[4] + c[2] * rest[8], c[0] * rest[1] + c[1] * rest[5] + c[2] * rest[9], c[0] * rest[2] + c[1] * rest[6] + c[2] * rest[10]];
  };

  for (let s = 0; s <= N; s += 1) {
    const t = Math.min(T, s * dt);
    scene.Apply(clipIndex, t);
    const W = (name) => Pos(scene.world[ni(name)]);
    const world = scene.world.map((m) => Float64Array.from(m));
    const positions = SkinPositions(scene, parts);
    const rec = { t, world, positions };
    // soles
    rec.soleMin = {}; rec.heel = {}; rec.ball = {};
    for (const side of ['L', 'R']) {
      let low = Infinity;
      for (const [pi, v] of sole[side]) low = Math.min(low, positions[pi][v * 3 + 1]);
      rec.soleMin[side] = low;
      const [hp, hv] = pivots[side].heel, [bp, bv] = pivots[side].ball;
      rec.heel[side] = [positions[hp][hv * 3], positions[hp][hv * 3 + 1], positions[hp][hv * 3 + 2]];
      rec.ball[side] = [positions[bp][bv * 3], positions[bp][bv * 3 + 1], positions[bp][bv * 3 + 2]];
    }
    // joint angles
        rec.knee = {}; rec.elbow = {}; rec.hip = {}; rec.ankle = {};
    for (const side of ['L', 'R']) {
      const hip = W(B(side + ' Thigh')), knee = W(B(side + ' Calf')), ankle = W(B(side + ' Foot')), toe = W(B(side + ' Toe0'));
      const t1 = Unit(Sub(knee, hip)), s1 = Unit(Sub(ankle, knee));
      const axis = Rot3(scene.world[ni(B(side + ' Thigh'))], MatVec3T(restRotInv(B(side + ' Thigh')), kneeAxisRest[side]));
      rec.knee[side] = Deg(Math.atan2(Dot(Cross(t1, s1), Unit(axis)), Dot(t1, s1)));
      const sh = W(B(side + ' UpperArm')), el = W(B(side + ' Forearm')), wr = W(B(side + ' Hand'));
      const u1 = Unit(Sub(el, sh)), f1 = Unit(Sub(wr, el));
      const ax2 = Rot3(scene.world[ni(B(side + ' UpperArm'))], MatVec3T(restRotInv(B(side + ' UpperArm')), elbowAxisRest[side]));
      rec.elbow[side] = Deg(Math.atan2(Dot(Cross(u1, f1), Unit(ax2)), Dot(u1, f1)));
      // sagittal hip angle: thigh from straight down, forward positive, in the pelvis frame
      const down = [0, -1, 0];
      rec.hip[side] = Deg(Math.atan2(Dot(t1, [0, 0, 1]), Dot(t1, down)));
      const footDir = Unit(Sub(toe, ankle));
      rec.ankle[side] = Deg(Math.acos(Math.min(1, Math.max(-1, Dot(s1, footDir)))));
    }
    // yaw of pelvis / shoulders (+ = right side forward), trunk lean, head attitude
    const Yaw = (l, r) => { const v = Sub(W(l), W(r)); return Deg(Math.atan2(-v[2], v[0])); };
    rec.pelvisYaw = Yaw(B('L Thigh'), B('R Thigh'));
    rec.shoulderYaw = Yaw(B('L UpperArm'), B('R UpperArm'));
    // chest "up" = rest up carried by the chest's rotation relative to rest
    const chestDelta = (name, v) => Rot3(scene.world[ni(name)], MatVec3T(restRotInv(name), v));
    const up = chestDelta(names.spine2, [0, 1, 0]);
    rec.trunkLeanLeft = Deg(Math.atan2(up[0], up[1]));
    rec.trunkLeanForward = Deg(Math.atan2(up[2], up[1]));
    const hf = chestDelta(names.head, [0, 0, 1]), hu = chestDelta(names.head, [0, 1, 0]);
    rec.headYaw = Deg(Math.atan2(hf[0], hf[2])); rec.headPitch = Deg(Math.asin(Math.max(-1, Math.min(1, -hf[1])))); rec.headRoll = Deg(Math.atan2(-hu[0], hu[1]));
    // hands
    const knuckles = (side) => { let c = [0, 0, 0]; for (let k = 1; k <= 4; k += 1) c = Add(c, W(B(side + ' Finger' + k))); return Mul(c, 0.25); };
    rec.knuckleR = knuckles('R'); rec.handLpos = W(B('L Hand'));
    rec.pelvisPos = W(names.pelvis); rec.ankle3 = { L: W(B('L Foot')), R: W(B('R Foot')) };
    // rifle pose from the prop track
    const rp = SampleTrack(propTracks.position, t, 3), rq = SampleTrack(propTracks.quaternion, t, 4);
    rec.rifle = { pos: rp, q: rq, m: QuatToMat(rq) };
    samples.push(rec);
  }
  const cyc = samples.slice(0, N);                           // one cycle (sample N equals sample 0)

  // ========================================================================= gate 1: loop
  {
    let keyDiff = 0;
    for (const c of scene.animations[clipIndex].channels) {
      const w = c.width, n = c.output.length / w;
      if (n < 2) continue;
      for (let k = 0; k < w; k += 1) keyDiff = Math.max(keyDiff, Math.abs(c.output[k] - c.output[(n - 1) * w + k]));
    }
    const starts = clip.tracks.filter((t) => t.times.length > 1).map((t) => t.times[0]);
    const ends = clip.tracks.filter((t) => t.times.length > 1).map((t) => t.times.at(-1));
    const periodOk = Math.abs(clip.duration - keyCount / fps) < 2e-6 && starts.every((v) => v === 0) && ends.every((v) => Math.abs(v - clip.duration) < 1e-9);
    // world-position second differences of every body bone at the seam vs inside the cycle
    const second = (i, b) => { const p0 = Pos(samples[(i - 1 + N) % N].world[b]), p1 = Pos(samples[i % N].world[b]), p2 = Pos(samples[(i + 1) % N].world[b]);
      return Len([p0[0] - 2 * p1[0] + p2[0], p0[1] - 2 * p1[1] + p2[1], p0[2] - 2 * p1[2] + p2[2]]); };
    let seam = 0, inner = 0;
    for (const b of bones) { seam = Math.max(seam, second(0, b)); for (let i = 1; i < N; i += 1) inner = Math.max(inner, second(i, b)); }
    const pelvisJump = Len(Sub(Pos(samples[N].world[ni(names.pelvis)]), Pos(samples[0].world[ni(names.pelvis)])));
    metrics.loop = { durationS: T, keyDiffMax: keyDiff, pelvisSeamJumpM: pelvisJump, seamSecondDiffM: Round(seam, 6), innerSecondDiffMaxM: Round(inner, 6), seamAccelRatio: Round(seam / inner, 3) };
    Check('G1', 'duration = period, tracks start at 0', clip.duration, periodOk, `${keyCount}/${fps}`);
    Check('G1', 'first key == last key (max abs)', keyDiff, keyDiff <= LIMITS.loop.seamKeyDiff, LIMITS.loop.seamKeyDiff);
    Check('G1', 'seam second difference / interior max', seam / inner, seam / inner <= LIMITS.loop.seamAccelRatioMax, LIMITS.loop.seamAccelRatioMax);
    Check('G1', 'pelvis jump at the seam (m)', pelvisJump, pelvisJump <= 1e-6, 1e-6);
  }

  // ========================================================================= gate 2/3: ground contact
  const speedModel = refSpeed;                                // model m/s: the ground slides back at this speed in the clip frame
  const ground = (p, t) => [p[0], p[1], p[2] + speedModel * t];
  const grounded = { L: [], R: [] }, pivotRuns = { L: { heel: [], ball: [] }, R: { heel: [], ball: [] } };
  const flagsByFoot = { L: {}, R: {} };
  {
    const lowCut = LIMITS.floor.groundedHeightM;
    for (const side of ['L', 'R']) {
      const flags = { heel: [], ball: [] };
      for (const kind of ['heel', 'ball']) {
        for (let i = 0; i < N; i += 1) {
          const a = samples[(i - 1 + N) % N], c = samples[(i + 1) % N];
          const pa = ground(a[kind][side], i === 0 ? a.t - T : a.t), pc = ground(c[kind][side], i === N - 1 ? c.t + T : c.t);
          const sp = Len(Sub(pc, pa)) / (2 * dt);
          flags[kind].push(samples[i][kind][side][1] < lowCut && sp < LIMITS.floor.groundedSpeedMps);
        }
      }
      flagsByFoot[side] = flags;
      for (let i = 0; i < N; i += 1) grounded[side].push(flags.heel[i] || flags.ball[i]);
      // runs (circular) of each pivot flag
      for (const kind of ['heel', 'ball']) {
        const f = flags[kind];
        if (f.every(Boolean)) { pivotRuns[side][kind].push([0, N - 1]); continue; }
        const first = f.findIndex((v) => !v);
        let cur = null;
        for (let k = 1; k <= N; k += 1) {
          const i = (first + k) % N;
          if (f[i]) cur = cur ? [cur[0], cur[1] + 1] : [k, k];
          else if (cur) { pivotRuns[side][kind].push([(first + cur[0]) % N, cur[1] - cur[0] + 1]); cur = null; }
        }
        if (cur) pivotRuns[side][kind].push([(first + cur[0]) % N, cur[1] - cur[0] + 1]);
      }
    }
  }
  {
    // slide: ground-frame spread of each pivot vertex over each support run (time unwrapped around the seam)
    let worst = 0; const detail = [];
    for (const side of ['L', 'R']) for (const kind of ['heel', 'ball']) {
      for (const [start, length] of pivotRuns[side][kind]) {
        if (length < 4) continue;
        const pts = [];
        for (let k = 0; k < length; k += 1) { const i = (start + k) % N; pts.push(ground(samples[i][kind][side], samples[0].t + (start + k) * dt)); }
        const mean = pts.reduce((a, p) => Add(a, p), [0, 0, 0]).map((v) => v / pts.length);
        const spread = Math.max(...pts.map((p) => Len(Sub(p, mean))));
        worst = Math.max(worst, spread);
        detail.push({ foot: side, pivot: kind, fromPhase: Round(start / N, 4), samples: length, slideM: Round(spread, 5) });
      }
    }
    metrics.slide = { worstM: Round(worst, 5), runs: detail };
    Check('G2', 'support-pivot slide, worst (m)', worst, worst <= LIMITS.slide.maxM, LIMITS.slide.maxM);
  }
  {
    const stance = [], swing = [], bothDown = [];
    let flights = 0;
    for (let i = 0; i < N; i += 1) {
      const count = (grounded.L[i] ? 1 : 0) + (grounded.R[i] ? 1 : 0);
      if (count === 0) flights += 1;
      bothDown.push(count === 2 ? 1 : 0);
      for (const side of ['L', 'R']) (grounded[side][i] ? stance : swing).push(samples[i].soleMin[side]);
    }
    const ds = Mean(bothDown);
    // foot bones' local turn from bind (a flipped foot reads 160..180 deg)
    let footTurn = 0;
    for (let i = 0; i < N; i += 1) {
      scene.Apply(clipIndex, samples[i].t);
      for (const side of ['L', 'R']) for (const part of ['Foot', 'Toe0']) {
        const id = ni(B(side + ' ' + part)), q = scene.r[id], b = scene.baseR[id];
        const d = Math.abs(q[0] * b[0] + q[1] * b[1] + q[2] * b[2] + q[3] * b[3]);
        footTurn = Math.max(footTurn, Deg(2 * Math.acos(Math.min(1, d))));
      }
    }
    metrics.floor = { stanceSoleMM: [Round(Math.min(...stance) * 1000, 2), Round(Math.max(...stance) * 1000, 2)],
      swingSoleMinMM: Round(Math.min(...swing) * 1000, 2), flightSamples: flights, doubleSupportFraction: Round(ds, 4),
      singleSupportFraction: Round(1 - ds, 4), footLocalTurnMaxDeg: Round(footTurn, 2), stanceSamples: stance.length };
    Check('G3', 'stance sole lowest point (mm)', metrics.floor.stanceSoleMM, Math.min(...stance) >= LIMITS.floor.stanceMinM && Math.max(...stance) <= LIMITS.floor.stanceMaxM, [LIMITS.floor.stanceMinM * 1000, LIMITS.floor.stanceMaxM * 1000]);
    Check('G3', 'swing sole never below floor (mm)', metrics.floor.swingSoleMinMM, Math.min(...swing) >= LIMITS.floor.swingMinM, LIMITS.floor.swingMinM * 1000);
    Check('G3', 'no flight sample', flights, flights === 0, 0);
    Check('G3', 'double support fraction', ds, ds >= LIMITS.floor.doubleSupportFraction[0] && ds <= LIMITS.floor.doubleSupportFraction[1], LIMITS.floor.doubleSupportFraction);
    Check('G3', 'foot/toe bone local turn max (deg)', footTurn, footTurn <= LIMITS.floor.footLocalAngleMaxDeg, LIMITS.floor.footLocalAngleMaxDeg);
  }

  // ========================================================================= gate 4: joints & bones
  {
    const series = (get) => cyc.map(get);
    const kneeL = series((r) => r.knee.L), kneeR = series((r) => r.knee.R), elL = series((r) => r.elbow.L), elR = series((r) => r.elbow.R);
    const hipL = series((r) => r.hip.L), hipR = series((r) => r.hip.R), ankL = series((r) => r.ankle.L), ankR = series((r) => r.ankle.R);
    // (a) curvature: second difference at the key spacing (two half-frame samples apart: the samples between the keys of a linear channel add nothing)
    const curvature = (arr) => { let worst = 0; for (let i = 0; i < arr.length; i += 1) { const a = arr[(i - 2 + arr.length) % arr.length], b = arr[i], c = arr[(i + 2) % arr.length]; worst = Math.max(worst, Math.abs(a - 2 * b + c)); } return worst; };
    // (b) single-frame spike: how far a key sits from the quadratic through its five key neighbours (Savitzky-Golay residual)
    const SG = [-3, 12, 17, 12, -3];
    const glitch = (arr) => { let worst = 0; for (let i = 0; i < arr.length; i += 2) { let fit = 0; for (let j = -2; j <= 2; j += 1) fit += SG[j + 2] / 35 * arr[(i + 2 * j + 2 * arr.length) % arr.length]; worst = Math.max(worst, Math.abs(arr[i] - fit)); } return worst; };
    const spikes = curvature;
    const spike = { kneeL: spikes(kneeL), kneeR: spikes(kneeR), hipL: spikes(hipL), hipR: spikes(hipR), ankleL: spikes(ankL), ankleR: spikes(ankR) };
    const spikeAt = (arr) => { let worst = 0, at = 0; for (let i = 0; i < arr.length; i += 1) { const d = Math.abs(arr[(i - 2 + arr.length) % arr.length] - 2 * arr[i] + arr[(i + 2) % arr.length]); if (d > worst) { worst = d; at = i; } } return Round(at / arr.length, 3); };
    const lengthErr = (() => {
      let worst = 0;
      for (let i = 0; i < N; i += 1) {
        scene.Apply(clipIndex, samples[i].t);
        for (const b of bones) {
          const name = scene.nodes[b].name;
          if (name === B('Pelvis')) continue;
          worst = Math.max(worst, Math.abs(Len(scene.t[b]) - Len(scene.baseT[b])), Len(Sub(Array.from(scene.t[b]), Array.from(scene.baseT[b]))));
        }
      }
      return worst;
    })();
    metrics.joints = {
      kneeFlexionDeg: { L: Range(kneeL).map((v) => Round(v, 1)), R: Range(kneeR).map((v) => Round(v, 1)) },
      elbowFlexionDeg: { L: Range(elL).map((v) => Round(v, 1)), R: Range(elR).map((v) => Round(v, 1)) },
      hipSagittalDeg: { L: Range(hipL).map((v) => Round(v, 1)), R: Range(hipR).map((v) => Round(v, 1)) },
      ankleAngleDeg: { L: Range(ankL).map((v) => Round(v, 1)), R: Range(ankR).map((v) => Round(v, 1)) },
      maxSecondDiffDeg: Object.fromEntries(Object.entries(spike).map(([k, v]) => [k, Round(v, 3)])),
      maxSecondDiffPhase: { kneeR: spikeAt(kneeR), hipR: spikeAt(hipR), ankleR: spikeAt(ankR) },
      boneLengthErrM: Round(lengthErr, 6),
      debugSeries: process.argv.includes('--grf') ? { kneeR: kneeR.filter((_, i) => i % 2 === 0).map((v) => Round(v, 1)), hipR: hipR.filter((_, i) => i % 2 === 0).map((v) => Round(v, 1)), ankleR: ankR.filter((_, i) => i % 2 === 0).map((v) => Round(v, 1)), pelvisY: cyc.filter((_, i) => i % 2 === 0).map((r) => Round(r.pelvisPos[1], 4)) } : undefined,
    };
    const minFlex = Math.min(...kneeL, ...kneeR, ...elL, ...elR);
    Check('G4', 'knee/elbow never hyperextended (min deg)', minFlex, minFlex >= LIMITS.joints.hyperextensionMinDeg, LIMITS.joints.hyperextensionMinDeg);
    Check('G4', 'knee flexion max (deg)', Math.max(...kneeL, ...kneeR), Math.max(...kneeL, ...kneeR) <= LIMITS.joints.kneeMaxDeg, LIMITS.joints.kneeMaxDeg);
    Check('G4', 'elbow flexion max (deg)', Math.max(...elL, ...elR), Math.max(...elL, ...elR) <= LIMITS.joints.elbowMaxDeg, LIMITS.joints.elbowMaxDeg);
    Check('G4', 'bone length error (m)', lengthErr, lengthErr < LIMITS.joints.boneLengthErrM, LIMITS.joints.boneLengthErrM);
    const glitches = { kneeL: glitch(kneeL), kneeR: glitch(kneeR), hipL: glitch(hipL), hipR: glitch(hipR), ankleL: glitch(ankL), ankleR: glitch(ankR) };
    metrics.joints.singleFrameGlitchDeg = Object.fromEntries(Object.entries(glitches).map(([k, v]) => [k, Round(v, 3)]));
    const worstSpike = Math.max(...Object.values(spike)), worstGlitch = Math.max(...Object.values(glitches));
    Check('G4', 'hip/knee/ankle single-frame spike (deg from the local quadratic)', worstGlitch, worstGlitch <= LIMITS.joints.glitchDeg, LIMITS.joints.glitchDeg);
    Check('G4', 'hip/knee/ankle curvature, second difference per key (deg)', worstSpike, worstSpike <= LIMITS.joints.spikeDeg, LIMITS.joints.spikeDeg);
  }

  // ========================================================================= gate 5: tempo, COM
  {
    const cadence = 120 / T;                                   // steps per minute (two steps per cycle)
    const worldSpeed = refSpeed * ACTOR_SCALE;
    const hipHeightModel = Pos(restWorld[ni(B('L Thigh'))])[1];
    const legWorld = hipHeightModel * ACTOR_SCALE;
    const froude = worldSpeed ** 2 / (G * legWorld);
    // measured planted-point speed in the clip frame (median over runs of the least-squares slope of z against t)
    const slopes = [];
    for (const side of ['L', 'R']) for (const kind of ['heel', 'ball']) for (const [start, length] of pivotRuns[side][kind]) {
      if (length < 8) continue;
      const ts = [], zs = [];
      for (let k = 0; k < length; k += 1) { const i = (start + k) % N; ts.push((start + k) * dt); zs.push(samples[i][kind][side][2]); }
      const mt = Mean(ts), mz = Mean(zs);
      let num = 0, den = 0; for (let k = 0; k < ts.length; k += 1) { num += (ts[k] - mt) * (zs[k] - mz); den += (ts[k] - mt) ** 2; }
      slopes.push(-num / den);
    }
    const measuredSpeed = Median(slopes);
    // body-segment centre of mass (Winter/Dempster) + the rifle as a point mass
    const SEG = [['UpperArm', 'Forearm', 0.028, 0.436], ['Forearm', 'Hand', 0.016, 0.430], ['Thigh', 'Calf', 0.100, 0.433], ['Calf', 'Foot', 0.0465, 0.433], ['Foot', 'Toe0', 0.0145, 0.5]];
    const headIdx = ni(B('Head'));
    const headVerts = [];
    parts.forEach((part, pi) => { for (let v = 0; v < part.count; v += 1) if (JointWeight(part, v, headIdx) > 0.9) headVerts.push([pi, v]); });
    const com = [], comBody = [];
    for (let i = 0; i <= N; i += 1) {
      const r = samples[i], W = (n) => Pos(r.world[ni(n)]);
      const terms = [];
      for (const side of ['L', 'R']) for (const [a, b, m, f] of SEG) terms.push([m, Lerp3(W(B(side + ' ' + a)), W(B(side + ' ' + b)), f)]);
      for (const side of ['L', 'R']) {                         // hands: wrist -> mean of the last finger joints
        const tip = ['1', '2', '3', '4'].map((k) => W(B(side + ' Finger' + k + '2'))).reduce((acc, p) => Add(acc, Mul(p, 0.25)), [0, 0, 0]);
        terms.push([0.006, Lerp3(W(B(side + ' Hand')), tip, 0.506)]);
      }
      const hipC = Mul(Add(W(B('L Thigh')), W(B('R Thigh'))), 0.5), shC = Mul(Add(W(B('L UpperArm')), W(B('R UpperArm'))), 0.5);
      terms.push([0.497, Lerp3(hipC, shC, 0.5)]);
      let hc = [0, 0, 0]; for (const [pi, v] of headVerts) hc = Add(hc, [r.positions[pi][v * 3], r.positions[pi][v * 3 + 1], r.positions[pi][v * 3 + 2]]);
      terms.push([0.081, Mul(hc, 1 / headVerts.length)]);
      let mass = 0, c = [0, 0, 0];
      for (const [m, p] of terms) { mass += m; c = Add(c, Mul(p, m)); }
      comBody.push(Mul(c, 1 / mass));
      const rifleCom = Add(r.rifle.pos, Rot3(r.rifle.m, [0, 0, -0.195 * RIFLE_SCALE]));
      const k = RIFLE_MASS_KG / BODY_MASS_KG;
      com.push(Mul(Add(c, Mul(rifleCom, k)), 1 / (1 + k)));
    }
    const comY = com.slice(0, N).map((p) => p[1] * ACTOR_SCALE);
    const comYBody = comBody.slice(0, N).map((p) => p[1] * ACTOR_SCALE);
    // support timing from the pivots
    // runs (circular) of a boolean series: [{ begin, len }]
    const Runs = (flags) => {
      if (flags.every(Boolean)) return [{ begin: 0, len: N }];
      if (!flags.some(Boolean)) return [];
      const first = flags.findIndex((v) => !v);
      const runs = []; let cur = null;
      for (let k = 1; k <= N; k += 1) {
        const i = (first + k) % N;
        if (flags[i]) { if (cur) cur.len += 1; else cur = { begin: i, len: 1 }; } else if (cur) { runs.push(cur); cur = null; }
      }
      if (cur) runs.push(cur);
      return runs;
    };
    const singleRuns = { L: Runs(grounded.L.map((g, i) => g && !grounded.R[i])), R: Runs(grounded.R.map((g, i) => g && !grounded.L[i])) };
    const doubleRuns = Runs(grounded.L.map((g, i) => g && grounded.R[i]));
    const allSingle = [...singleRuns.L, ...singleRuns.R];
    const rel = (i, run) => ((i - run.begin) % N + N) % N;
    const inMiddle = (i, runs) => runs.some((run) => { const r = rel(i, run); return r < run.len && r >= run.len * (0.5 - LIMITS.gait.comPeakInMiddleShare / 2) && r <= run.len * (0.5 + LIMITS.gait.comPeakInMiddleShare / 2); });
    const slack = Math.round(LIMITS.gait.comTroughSlackCycle * N);
    const nearRun = (i, runs) => runs.some((run) => { const r = rel(i, run); return r < run.len + slack || r > N - slack; });
    const iMax = comY.indexOf(Math.max(...comY)), iMin = comY.indexOf(Math.min(...comY));
    // the vertical curve peaks twice per cycle: the highest sample of either half must sit in a single-support middle
    const halfMax = [iMax, (comY.slice(0, N / 2).concat(comY.slice(N / 2)).map((v, i) => [v, i]).filter(([, i]) => Math.abs(((i - iMax + N) % N) - N / 2) <= N / 4).sort((x, y) => y[0] - x[0])[0] || [0, iMax])[1]];
    const peakInMiddle = halfMax.every((i) => inMiddle(i, allSingle));
    const troughNearDouble = nearRun(iMin, doubleRuns);
    // braking then propulsion: forward COM acceleration (ground frame; the clip-frame COM is periodic, the mean speed adds none)
    const comZ = com.map((p) => p[2]);
    const comAcc = PeriodicSecondDerivative(comZ.slice(0, N), T, LIMITS.gait.grfHarmonics).map((v) => v * ACTOR_SCALE);
    const comVel = PeriodicFirstDerivative(comZ.slice(0, N), T, LIMITS.gait.grfHarmonics).map((v) => v * ACTOR_SCALE);
    const pushes = [];
    for (const side of ['L', 'R']) for (const run of singleRuns[side]) {
      const half = Math.floor(run.len / 2);
      const first = Mean(Array.from({ length: half }, (_, k) => comAcc[(run.begin + k) % N]));
      const second = Mean(Array.from({ length: half }, (_, k) => comAcc[(run.begin + run.len - 1 - k) % N]));
      pushes.push({ foot: side, firstHalfMps2: Round(first, 3), secondHalfMps2: Round(second, 3), ok: first <= -LIMITS.gait.grfMinMps2 && second >= LIMITS.gait.grfMinMps2 });
    }
    const vMinI = comVel.indexOf(Math.min(...comVel)), vMaxI = comVel.indexOf(Math.max(...comVel));
    const slowInMiddle = inMiddle(vMinI, allSingle) || inMiddle((vMinI + N / 2) % N, allSingle);
    const fastInDouble = nearRun(vMaxI, doubleRuns) || nearRun((vMaxI + N / 2) % N, doubleRuns);
    const velZ = comVel;
    const phase = (i) => i / N;
    const bothIdx = []; for (let i = 0; i < N; i += 1) if (grounded.L[i] && grounded.R[i]) bothIdx.push(i);
    metrics.gait = {
      cadenceStepsPerMin: Round(cadence, 2), referenceSpeedModelMps: refSpeed, worldSpeedMps: Round(worldSpeed, 3), measuredPivotSpeedModelMps: Round(measuredSpeed, 4),
      strideModelM: Round(refSpeed * T, 4), stepModelM: Round(refSpeed * T / 2, 4), stepWorldM: Round(refSpeed * T / 2 * ACTOR_SCALE, 4),
      legLengthWorldM: Round(legWorld, 4), froude: Round(froude, 3), relativeStep: Round(refSpeed * T / 2 / hipHeightModel, 3),
      comVerticalPPWorldM: { bodyAndRifle: Round(PP(comY), 4), bodyOnly: Round(PP(comYBody), 4) },
      comMaxPhase: Round(phase(iMax), 3), comMinPhase: Round(phase(iMin), 3), comPeakInSingleSupportMiddle: peakInMiddle,
      comTroughNearDoubleSupport: troughNearDouble, brakingThenPropulsion: pushes, slowestInSingleSupportMiddle: slowInMiddle, fastestNearDoubleSupport: fastInDouble,
      comAccelerationMps2: { min: Round(Math.min(...comAcc), 3), max: Round(Math.max(...comAcc), 3) },
      comForwardSpeedVariationMps: { min: Round(Math.min(...velZ), 3), max: Round(Math.max(...velZ), 3), minPhase: Round(vMinI / N, 3), maxPhase: Round(vMaxI / N, 3) },
      debugSeries: process.argv.includes('--grf') ? { acc: comAcc.filter((_, i) => i % 2 === 0).map((v) => Round(v, 2)), vel: comVel.filter((_, i) => i % 2 === 0).map((v) => Round(v, 3)) } : undefined,
      doubleSupportPhases: bothIdx.length ? [Round(bothIdx[0] / N, 3), Round(bothIdx.at(-1) / N, 3)] : [],
    };
    Check('G5', 'cadence (steps/min)', cadence, cadence >= LIMITS.gait.cadenceSpm[0] && cadence <= LIMITS.gait.cadenceSpm[1], LIMITS.gait.cadenceSpm);
    Check('G5', 'world speed (m/s)', worldSpeed, worldSpeed >= LIMITS.gait.worldSpeedMps[0] && worldSpeed <= LIMITS.gait.worldSpeedMps[1], LIMITS.gait.worldSpeedMps);
    Check('G5', 'Froude number', froude, froude >= LIMITS.gait.froude[0] && froude <= LIMITS.gait.froude[1], LIMITS.gait.froude);
    Check('G5', 'planted-pivot speed matches reference', measuredSpeed / refSpeed - 1, Math.abs(measuredSpeed / refSpeed - 1) <= LIMITS.gait.speedErrFrac, LIMITS.gait.speedErrFrac);
    Check('G5', 'COM vertical peak-to-peak, body+rifle (m)', PP(comY), PP(comY) >= LIMITS.gait.comVerticalPPM[0] && PP(comY) <= LIMITS.gait.comVerticalPPM[1], LIMITS.gait.comVerticalPPM);
    Check('G5', 'COM highest inside the middle of single support', iMax / N, peakInMiddle, 'middle 50%');
    Check('G5', 'COM lowest near double support', iMin / N, troughNearDouble, `+-${LIMITS.gait.comTroughSlackCycle} cycle`);
    Check('G5', 'braking in the first half, propulsion in the second half of each single support', pushes.map((q) => [q.firstHalfMps2, q.secondHalfMps2]), pushes.length === 2 && pushes.every((q) => q.ok), `|a| >= ${LIMITS.gait.grfMinMps2} m/s2`);
    Check('G5', 'COM forward speed lowest in single-support middle, highest at double support', [vMinI / N, vMaxI / N], slowInMiddle && fastInDouble, 'timing');
  }

  // ========================================================================= gate 6: upper body & arms
  {
    const pYaw = cyc.map((r) => r.pelvisYaw), sYaw = cyc.map((r) => r.shoulderYaw);
    const hY = cyc.map((r) => r.headYaw), hP = cyc.map((r) => r.headPitch), hR = cyc.map((r) => r.headRoll);
    const hf = (arr) => Math.sqrt(Mean(arr.map((v, i) => { const a = arr[(i - 1 + arr.length) % arr.length], c = arr[(i + 1) % arr.length]; return (v - (a + c) / 2) ** 2; })));
    const forwardOf = (side) => cyc.map((r) => r.ankle3[side][2] - r.pelvisPos[2]);
    const handFwd = cyc.map((r) => r.handLpos[2] - r.pelvisPos[2]);
    const cLR = Corr(handFwd, forwardOf('R')), cLL = Corr(handFwd, forwardOf('L'));
    const chestFrame = cyc.map((r) => Undo(names.spine2, r.world, Sub(r.knuckleR, Pos(r.world[ni(names.spine2)]))));
    const handMean = [0, 1, 2].map((k) => Mean(chestFrame.map((p) => p[k])));
    const handRange = [2 * Math.max(...chestFrame.map((p) => Len(Sub(p, handMean))))];
    const leanL = cyc.map((r) => r.trunkLeanLeft), leanF = cyc.map((r) => r.trunkLeanForward);
    metrics.upper = {
      pelvisYawDeg: { range: Range(pYaw).map((v) => Round(v, 2)), peakToPeak: Round(PP(pYaw), 2) }, shoulderYawDeg: { range: Range(sYaw).map((v) => Round(v, 2)), peakToPeak: Round(PP(sYaw), 2) },
      yawCorrelation: Round(Corr(pYaw, sYaw), 3), relativeTwistPPDeg: Round(PP(cyc.map((r) => r.shoulderYaw - r.pelvisYaw)), 2),
      headPPDeg: { yaw: Round(PP(hY), 2), pitch: Round(PP(hP), 2), roll: Round(PP(hR), 2) }, headHighFrequencyRmsDeg: Round(Math.max(hf(hY), hf(hP), hf(hR)), 4),
      leftHandVsRightAnkle: Round(cLR, 3), leftHandVsLeftAnkle: Round(cLL, 3),
      rightHandInChestM: handRange.map((v) => Round(v, 4)), trunkLeanLeftDeg: { mean: Round(Mean(leanL), 2), peakToPeak: Round(PP(leanL), 2) },
      trunkForwardLeanDeg: { mean: Round(Mean(leanF), 2), peakToPeak: Round(PP(leanF), 2) },
      leftArmSwingPPM: Round(PP(handFwd), 3),
    };
    const L = LIMITS.upper;
    Check('G6', 'pelvis yaw peak-to-peak (deg)', PP(pYaw), PP(pYaw) >= L.pelvisYawPPDeg[0] && PP(pYaw) <= L.pelvisYawPPDeg[1], L.pelvisYawPPDeg);
    Check('G6', 'shoulder yaw peak-to-peak (deg)', PP(sYaw), PP(sYaw) >= L.shoulderYawPPDeg[0] && PP(sYaw) <= L.shoulderYawPPDeg[1], L.shoulderYawPPDeg);
    Check('G6', 'shoulders counter-rotate against the pelvis (corr)', Corr(pYaw, sYaw), Corr(pYaw, sYaw) <= L.yawCorrelationMax, L.yawCorrelationMax);
    Check('G6', 'head steady: max peak-to-peak (deg)', Math.max(PP(hY), PP(hP), PP(hR)), Math.max(PP(hY), PP(hP), PP(hR)) <= L.headPPDeg, L.headPPDeg);
    Check('G6', 'head high-frequency jitter (deg rms)', Math.max(hf(hY), hf(hP), hf(hR)), Math.max(hf(hY), hf(hP), hf(hR)) <= L.headHfRmsDeg, L.headHfRmsDeg);
    Check('G6', 'left hand swings with the right leg (corr)', cLR, cLR >= L.armLegCorrelation, L.armLegCorrelation);
    Check('G6', 'left hand against the left leg (corr)', cLL, cLL <= -L.armLegCorrelation, -L.armLegCorrelation);
    Check('G6', 'right hand fixed to the chest (max range m)', Math.max(...handRange), Math.max(...handRange) <= L.rightHandInChestPPM, L.rightHandInChestPPM);
    Check('G6', 'trunk leans left against the load (mean deg)', Mean(leanL), Mean(leanL) >= L.trunkLeanLeftMeanDeg[0] && Mean(leanL) <= L.trunkLeanLeftMeanDeg[1], L.trunkLeanLeftMeanDeg);
    Check('G6', 'trunk side sway peak-to-peak (deg)', PP(leanL), PP(leanL) <= L.trunkLeanLeftPPDeg, L.trunkLeanLeftPPDeg);
    Check('G6', 'trunk forward lean (mean deg)', Mean(leanF), Mean(leanF) >= L.trunkForwardMeanDeg[0] && Mean(leanF) <= L.trunkForwardMeanDeg[1], L.trunkForwardMeanDeg);
  }

  // ========================================================================= gate 7: rifle
  {
    const R = LIMITS.rifle;
    // rigid in the hand: rifle origin / axes expressed in the Hand bone frame
    const handId = ni(B('R Hand'));
    const rel = cyc.map((r) => {
      const hm = r.world[handId], hp = Pos(hm), q = r.rifle;
      const inv = (v) => [Dot(v, [hm[0], hm[1], hm[2]]), Dot(v, [hm[4], hm[5], hm[6]]), Dot(v, [hm[8], hm[9], hm[10]])];
      return { origin: inv(Sub(q.pos, hp)), axis: inv(Rot3(q.m, [0, 0, -1])), up: inv(Rot3(q.m, [0, 1, 0])) };
    });
    const slip = Math.max(...[0, 1, 2].map((k) => PP(rel.map((e) => e.origin[k]))));
    const turn = Math.max(...rel.map((e) => Deg(Math.acos(Math.min(1, Dot(e.axis, rel[0].axis))))), ...rel.map((e) => Deg(Math.acos(Math.min(1, Dot(e.up, rel[0].up))))));
    const originErr = Math.max(...cyc.map((r) => Len(Sub(r.rifle.pos, r.knuckleR))));
    // bob against the chest
    const chestId = ni(names.spine2);
    const bob = cyc.map((r) => {
      const a = Undo(names.spine2, r.world, Rot3(r.rifle.m, [0, 0, -1])), u = Undo(names.spine2, r.world, Rot3(r.rifle.m, [0, 1, 0])), p = Undo(names.spine2, r.world, Sub(r.rifle.pos, Pos(r.world[chestId])));
      return { pitch: Deg(Math.asin(a[1])), roll: Deg(Math.atan2(u[0], u[1])), p };
    });
    const bobP = PP(bob.map((e) => e.pitch)), bobR = PP(bob.map((e) => e.roll)), lift = PP(bob.map((e) => e.p[1]));
    // clearance and shoulder seating
    const worstByRegion = {}, deepest = {}; let stockGapMin = Infinity, stockGapMax = -Infinity;
    for (let i = 0; i < N; i += 1) {
      const r = samples[i];
      const grid = new TriangleGrid(r.positions, parts, regions);
      const world = (p) => Add(r.rifle.pos, Rot3(r.rifle.m, Mul(p, RIFLE_SCALE)));
      for (const p of riflePoints) {
        const hit = grid.Nearest(world(p)); if (!hit) continue;
        const cur = worstByRegion[hit.region]; if (cur === undefined || hit.dist < cur) { worstByRegion[hit.region] = hit.dist; deepest[hit.region] = { phase: Round(i / N, 3), rifleLocal: p.map((v) => Round(v, 3)) }; }
      }
      let gap = Infinity;
      for (const p of riflePoints) {
        const hit = grid.Nearest(world(p)); if (!hit) continue;
        if (hit.region === 'upperArmR') gap = Math.min(gap, hit.dist);
      }
      if (Number.isFinite(gap)) { stockGapMin = Math.min(stockGapMin, gap); stockGapMax = Math.max(stockGapMax, gap); }
    }
    const checked = ['head', 'neck', 'torso', 'arms L', 'forearmR', 'legs'];
    const depth = Object.fromEntries(Object.entries(worstByRegion).map(([k, v]) => [k, Round(v, 4)]));
    metrics.rifle = { gripSlipM: Round(slip, 6), gripTurnDeg: Round(turn, 4), originToKnuckleM: Round(originErr, 6),
      bobPitchPPDeg: Round(bobP, 3), bobRollPPDeg: Round(bobR, 3), bobLiftPPM: Round(lift, 4), rifleScaleModelPerMesh: Round(RIFLE_SCALE, 4),
      nearestSignedDistanceByRegionM: depth, deepestPoints: deepest, shoulderSeatGapM: [Round(stockGapMin, 4), Round(stockGapMax, 4)] };
    Check('G7', 'rifle rigid in the hand: origin slip (m)', slip, slip <= R.gripSlipM, R.gripSlipM);
    Check('G7', 'rifle rigid in the hand: axis turn (deg)', turn, turn <= R.gripTurnDeg, R.gripTurnDeg);
    Check('G7', 'rifle origin at the knuckle centroid (m)', originErr, originErr <= R.originToKnuckleM, R.originToKnuckleM);
    Check('G7', 'rifle bob vs chest: pitch/roll peak-to-peak (deg)', Math.max(bobP, bobR), Math.max(bobP, bobR) <= R.bobPitchRollPPDeg, R.bobPitchRollPPDeg);
    Check('G7', 'rifle bob vs chest: lift peak-to-peak (m)', lift, lift <= R.bobLiftPPM, R.bobLiftPPM);
    const worst = Math.min(...checked.map((k) => (worstByRegion[k] === undefined ? Infinity : worstByRegion[k])));
    const shoulderSink = worstByRegion.upperArmR === undefined ? Infinity : worstByRegion.upperArmR;
    Check('G7', 'no penetration into head/cap/neck/torso/left arm/right forearm (deepest, m)', worst, worst >= -R.penetrationM, -R.penetrationM);
    Check('G7', 'right shoulder under the rifle sinks at most (m)', shoulderSink, shoulderSink >= -R.shoulderSinkM, -R.shoulderSinkM);
    Check('G7', 'rifle rests on the right shoulder: closest approach range over the cycle (m)', [stockGapMin, stockGapMax], stockGapMin >= R.seatGapM[0] && stockGapMax <= R.seatGapM[1], R.seatGapM);
  }

  // ---- the clip as the runtime loads it, and on every body that shares the skeleton
  {
    const parsed = THREE.AnimationClip.parse(clip);
    const motion = parsed.tracks.filter((t) => !t.name.startsWith('AllyRifle.'));
    Check('P', 'three.js AnimationClip.parse: duration, tracks, validate', [parsed.duration, parsed.tracks.length], parsed.duration === clip.duration && parsed.tracks.length === clip.tracks.length && parsed.validate(), [clip.duration, clip.tracks.length]);
    const names = new Set(motion.map((t) => t.name.split('.')[0]));
    const missing = [];
    for (const id of ['Nra02', 'Nra05', 'Nra06', 'Ija01', 'Ija02', 'Ija03', 'Ija06']) {
      const file = path.join(project, 'Model/Character/Model_Tengxian' + id + '.glb');
      if (!fs.existsSync(file)) continue;
      const have = new Set(LoadGlb(file).json.nodes.map((n) => THREE.PropertyBinding.sanitizeNodeName(n.name || '')));
      for (const n of names) if (!have.has(n)) missing.push(id + ':' + n);
    }
    Check('P', 'every animated bone exists on all seven shared-skeleton bodies', missing.length, missing.length === 0, 0);
  }

  // ---- profile contacts (runtime footstep data) against the measured grounded runs
  {
    const toeContacts = profile.contacts;
    Check('P', 'profile has contact spans for both feet', Object.keys(toeContacts).join(','), toeContacts.L?.length > 0 && toeContacts.R?.length > 0, 'L,R');
    Check('P', 'profile referenceMps > 0 and duration matches', profile.duration, profile.referenceMps > 0 && Math.abs(profile.duration - clip.duration) < 1e-6, clip.duration);
  }

  const sha = crypto.createHash('sha256').update(raw).digest('hex');
  return { metrics, checks, sha256: sha, clipName: clip.name, revision: data.revision, bytes: raw.length };
}

// ------------------------------------------------------------------------------------------------------ main
function Fmt(v) { return typeof v === 'number' ? (Math.abs(v) < 1e-3 && v !== 0 ? v.toExponential(2) : String(Round(v, 4))) : JSON.stringify(v); }
if (process.argv[1] && path.resolve(process.argv[1]) === import.meta.filename) {
  const started = Date.now();
  const result = Measure();
  const failed = result.checks.filter((c) => !c.ok);
  for (const c of result.checks) console.log(`${c.ok ? 'PASS' : 'FAIL'}  ${c.id}  ${c.label}: ${Fmt(c.value)}   [limit ${Fmt(c.limit)}]`);
  if (process.argv.includes('--table')) console.log(JSON.stringify(result.metrics, null, 1));
  if (process.argv.includes('--write')) {
    const out = { schema: 1, revision: result.revision, clip: result.clipName, clipFile, clipSha256: result.sha256, clipBytes: result.bytes,
      measuredBy: 'Script_RifleShoulderMarchTest.mjs (real skinned mesh of Model_TengxianNra02.glb, half-key-rate samples)',
      actorScale: ACTOR_SCALE, limits: LIMITS, measured: result.metrics, allPass: failed.length === 0,
      checks: result.checks.map((c) => ({ id: c.id, label: c.label, value: c.value, limit: c.limit, pass: c.ok })) };
    fs.writeFileSync(path.join(project, dataFile), JSON.stringify(out, null, 1) + '\n');
    console.log('wrote', dataFile);
  } else if (fs.existsSync(path.join(project, dataFile))) {
    const recorded = JSON.parse(fs.readFileSync(path.join(project, dataFile), 'utf8'));
    if (recorded.clipSha256 !== result.sha256) { console.log(`FAIL  ${dataFile} records another clip (sha256 differs); rerun with --write`); failed.push({}); }
  }
  console.log(`${result.checks.length - failed.length}/${result.checks.length} checks passed in ${((Date.now() - started) / 1000).toFixed(1)} s`);
  process.exit(failed.length ? 1 : 0);
}
