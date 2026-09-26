// Author RelaxedWalk (in-place walk cycle, arms swinging free) and RelaxedStand (hands-down idle)
// on the shared TengxianHumanoidV1 bind skeleton. Node-only and deterministic: no source clip is
// copied -- leg IK, heel/toe roll, pelvis bob/sway/turn, torso counter-twist, arm swing and finger
// curl are evaluated from GAIT below, and each frame's soles are measured on the real skinned mesh.
//
// Consumers: Script_RelaxedGait.mjs (a rifle slung on the back, or no weapon at all -- the
// interpreter). The rifle and its sling are not in these clips; the caller mounts them.
//   node Taierzhuang1938/_import/Script_RelaxedGaitBake.mjs            # write the clips + manifest
//   node Taierzhuang1938/_import/Script_RelaxedGaitBake.mjs --verify   # fail if the shipped files are stale
// Frames: glTF +Y up, asset forward +Z (the runtime's MODEL_FORWARD_YAW turns it to actor -Z), metres.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import * as THREE from '../vendor/three/build/three.module.js';
import { LoadGlb, PoseScene, BuildSkin } from './Script_LugouGlbPose.mjs';

const project = path.resolve(import.meta.dirname, '..');
const outputDir = path.join(project, 'Animation/RelaxedGait');
const clipFile = 'Animation_TengxianHumanoidV1RelaxedGait.json';
const manifestFile = 'Data_RelaxedGait.json';
const referenceModel = 'Model/Character/Model_TengxianNra02.glb';

export const GAIT = Object.freeze({
  revision: 'RelaxedGaitV1',
  walk: Object.freeze({
    clip: 'RelaxedWalk', fps: 60, cycleS: 1.08, speedMps: 1.35, stance: 0.61,
    heelStrikeM: 0.27,          // heel ahead of the hip joint at heel strike (pelvis-relative, +Z)
    heelRockerEnd: 0.09, toeRockerStart: 0.40,
    strikePitch: -0.30, toeOffPitch: 0.95,   // foot pitch about the side axis (+ = heel up)
    swingLiftM: 0.075, swingLiftPeak: 0.38,  // extra ankle clearance through swing
    pelvisDropM: 0.012, pelvisBobM: 0.016, pelvisSwayM: 0.022,
    pelvisTurnRad: 0.075, pelvisListRad: 0.03, pelvisTiltRad: 0.035,
    torsoLeanRad: 0.045, shoulderCounterRad: 0.09,
    armSwingRad: 0.31, armBiasRad: 0.03, armOutRad: 0.13, elbowRad: 0.22, elbowSwingRad: 0.16,
    footWidthM: 0.085,
  }),
  stand: Object.freeze({
    clip: 'RelaxedStand', fps: 30, cycleS: 4.0,
    kneeBendDropM: 0.012, breathRad: 0.012, swayM: 0.008, armOutRad: 0.1, elbowRad: 0.16, footWidthM: 0.1,
  }),
  // Relaxed hand: loose fist, thumb along the index finger. Radians per joint (base, middle, tip).
  fingerCurl: Object.freeze([0.8, 0.9, 0.55]), thumbCurl: Object.freeze([0.25, 0.35, 0.25]),
});

const { Vector3: V3, Quaternion: Q4, Matrix4: M4 } = THREE;
const X = new V3(1, 0, 0), Y = new V3(0, 1, 0), Z = new V3(0, 0, 1);
const Rot = (axis, angle) => new Q4().setFromAxisAngle(axis, angle);
const Smooth = t => { t = Math.min(1, Math.max(0, t)); return t * t * (3 - 2 * t); };
const Lerp = (a, b, t) => a + (b - a) * t;
const Round = v => +v.toFixed(4);
const Sanitize = name => name.replace(/\s/g, '_');   // THREE.PropertyBinding.sanitizeNodeName

const humanoid = JSON.parse(fs.readFileSync(path.join(project, 'Model/Character/Data_TengxianHumanoid.json'), 'utf8'));
const boneNames = humanoid.bodyBones.map(b => b.name);
const parentOf = humanoid.parents;
const B = part => 'Bip001 ' + part;

const glbBytes = fs.readFileSync(path.join(project, referenceModel));
const glb = LoadGlb(glbBytes);
const scene = new PoseScene(glb);
scene.animations.push({ name: '__rest', channels: [], duration: 0 });
scene.Apply(scene.animations.length - 1, 0);
const nodeIndex = new Map(scene.nodes.map((node, i) => [node.name, i]));
const restWorld = new Map(), restLocal = new Map(), restQ = new Map(), head = new Map();
for (const name of boneNames) {
  const i = nodeIndex.get(name);
  if (i === undefined) throw new Error(`reference model lacks ${name}`);
  const world = new M4().fromArray(scene.world[i]);
  restWorld.set(name, world); restLocal.set(name, new M4().fromArray(scene.local[i]));
  const p = new V3(), q = new Q4(), s = new V3(); world.decompose(p, q, s);
  restQ.set(name, q); head.set(name, p);
}
const groundParent = new M4().fromArray(scene.world[scene.parent[nodeIndex.get('GroundRoot')]] || new M4().elements);
const sideSign = { L: Math.sign(head.get(B('L Thigh')).x - head.get(B('Pelvis')).x), R: 0 };
sideSign.R = -sideSign.L;
const Len = (a, b) => head.get(B(b)).distanceTo(head.get(B(a)));
const upperLeg = Len('L Thigh', 'L Calf'), lowerLeg = Len('L Calf', 'L Foot');

// Soles: vertices weighted mostly to Foot/Toe0, measured on the skinned mesh each frame.
const skin = BuildSkin(glb);
const soleVerts = { L: [], R: [] };
for (const [pi, part] of skin.entries()) for (let v = 0; v < part.count; v++) {
  for (const side of ['L', 'R']) {
    let w = 0;
    for (let k = 0; k < 4; k++) {
      const joint = scene.nodes[part.joints[part.jointIndex[v * 4 + k]]]?.name;
      if (joint === B(side + ' Foot') || joint === B(side + ' Toe0')) w += part.weight[v * 4 + k];
    }
    if (w > 0.55) soleVerts[side].push([pi, v]);
  }
}
// Heel and ball pivots at rest (bottom-back and bottom-front-under-the-toe-joint of the shoe).
function RestFootPoints(side) {
  const pts = soleVerts[side].map(([pi, v]) => new V3().fromArray(skin[pi].position, v * 3));
  const floor = Math.min(...pts.map(p => p.y));
  const low = pts.filter(p => p.y < floor + 0.02);
  const heelZ = Math.min(...low.map(p => p.z));
  const toe = head.get(B(side + ' Toe0'));
  return { floor, heel: new V3(head.get(B(side + ' Foot')).x, floor, heelZ + 0.015), ball: new V3(toe.x, floor, toe.z) };
}
const restFoot = { L: RestFootPoints('L'), R: RestFootPoints('R') };

class Pose {
  constructor() { this.world = new Map(); }
  Put(name, point, delta) {
    const q = delta.clone().multiply(restQ.get(name));
    this.world.set(name, new M4().compose(point, q, new V3(1, 1, 1)));
  }
  Aim(name, child, point, target) {
    const turn = new Q4().setFromUnitVectors(head.get(child).clone().sub(head.get(name)).normalize(), target.clone().sub(point).normalize());
    this.Put(name, point, turn); return turn;
  }
  Finish() {   // unposed bones follow their parents with their rest local transform
    for (const name of boneNames) if (!this.world.has(name)) {
      const parent = parentOf[name];
      const pw = parent && parent !== name ? this.world.get(parent) : groundParent;
      this.world.set(name, pw.clone().multiply(restLocal.get(name)));
    }
    return this;
  }
  Local(name) {
    const parent = parentOf[name];
    const pw = parent && parent !== name ? this.world.get(parent) : groundParent;
    const m = pw.clone().invert().multiply(this.world.get(name)), p = new V3(), q = new Q4(), s = new V3();
    m.decompose(p, q, s); return { p, q };
  }
  SoleMin(side) {
    const cache = new Map();
    let lowest = Infinity;
    for (const [pi, v] of soleVerts[side]) {
      const part = skin[pi];
      let y = 0, total = 0;
      for (let k = 0; k < 4; k++) {
        const w = part.weight[v * 4 + k]; if (!w) continue;
        const j = part.jointIndex[v * 4 + k], key = pi + ':' + j;
        let m = cache.get(key);
        if (!m) {
          const name = scene.nodes[part.joints[j]].name;
          const world = this.world.get(name) || new M4().fromArray(scene.world[part.joints[j]]);
          m = world.clone().multiply(new M4().fromArray(part.inverseBind, j * 16)); cache.set(key, m);
        }
        const e = m.elements, x = part.position[v * 3], yy = part.position[v * 3 + 1], z = part.position[v * 3 + 2];
        y += w * (e[1] * x + e[5] * yy + e[9] * z + e[13]); total += w;
      }
      if (total > 0) lowest = Math.min(lowest, y / total);
    }
    return lowest;
  }
}

function SolveKnee(hip, ankle, forward) {
  const delta = ankle.clone().sub(hip), distance = Math.min(delta.length(), upperLeg + lowerLeg - 0.0005);
  const dir = delta.clone().normalize();
  const along = (upperLeg ** 2 - lowerLeg ** 2 + distance ** 2) / (2 * distance);
  const bend = forward.clone().addScaledVector(dir, -forward.dot(dir)).normalize();
  return { knee: hip.clone().addScaledVector(dir, along).addScaledVector(bend, Math.sqrt(Math.max(0, upperLeg ** 2 - along ** 2))), clamped: delta.length() > upperLeg + lowerLeg - 0.0005 };
}

/** Spine chain, clavicles, arms and hands. `arm(side)` -> { swing, out, elbow } radians. */
function PoseUpper(pose, pelvis, pelvisQ, spineTurn, lean, breath, arm) {
  let parentPart = 'Pelvis', parentPoint = pelvis, parentQ = pelvisQ, chest, chestQ;
  for (const [part, fraction] of [['Spine', 0.3], ['Spine1', 0.65], ['Spine2', 1], ['Neck', 0.5], ['Head', 0]]) {
    const p = parentPoint.clone().add(head.get(B(part)).clone().sub(head.get(B(parentPart))).applyQuaternion(parentQ));
    // Counter-twist grows up the spine; the neck and head take it back out so the gaze stays ahead.
    const turn = part === 'Neck' || part === 'Head' ? spineTurn * (part === 'Neck' ? 0.4 : 0) : spineTurn * fraction;
    const pitch = part === 'Head' ? 0 : lean * fraction + breath * (part === 'Spine2' ? 1 : 0.4);
    const q = Rot(Y, turn).multiply(Rot(X, pitch));
    pose.Put(B(part), p, q);
    if (part === 'Spine2') { chest = p.clone(); chestQ = q.clone(); }
    parentPart = part; parentPoint = p; parentQ = q;
  }
  for (const side of ['L', 'R']) {
    const s = sideSign[side], a = arm(side);
    const clavicle = chest.clone().add(head.get(B(side + ' Clavicle')).clone().sub(head.get(B('Spine2'))).applyQuaternion(chestQ));
    pose.Put(B(side + ' Clavicle'), clavicle, chestQ);
    const shoulder = chest.clone().add(head.get(B(side + ' UpperArm')).clone().sub(head.get(B('Spine2'))).applyQuaternion(chestQ));
    const upperDir = new V3(s * Math.sin(a.out), -Math.cos(a.swing) * Math.cos(a.out), Math.sin(a.swing)).normalize().applyQuaternion(chestQ);
    const lowerAngle = a.swing + a.elbow;
    const lowerDir = new V3(s * Math.sin(a.out * 0.4), -Math.cos(lowerAngle), Math.sin(lowerAngle)).normalize().applyQuaternion(chestQ);
    const elbow = shoulder.clone().addScaledVector(upperDir, Len(side + ' UpperArm', side + ' Forearm'));
    const wrist = elbow.clone().addScaledVector(lowerDir, Len(side + ' Forearm', side + ' Hand'));
    const upperTurn = pose.Aim(B(side + ' UpperArm'), B(side + ' Forearm'), shoulder, elbow);
    // The forearm keeps the upper arm's roll (a minimal turn from the T-pose would roll the palm):
    // re-aim the rolled rest direction from where the upper arm left it.
    const restLower = head.get(B(side + ' Hand')).clone().sub(head.get(B(side + ' Forearm'))).normalize().applyQuaternion(upperTurn);
    const lowerTurn = new Q4().setFromUnitVectors(restLower, lowerDir).multiply(upperTurn);
    pose.Put(B(side + ' Forearm'), elbow, lowerTurn);
    // Straight wrist, palm to the thigh (the T-pose palm-down turns inward with the arm).
    pose.Put(B(side + ' Hand'), wrist, lowerTurn);
  }
}

/** Finger curl in each joint's rest frame: about (finger direction x palm normal), palm normal -Y at rest. */
function CurlFingers(pose) {
  for (const name of boneNames) {
    const match = name.match(/ (L|R) Finger(\d)(\d?)$/); if (!match) continue;
    const [, side, digit, joint] = match, j = joint === '' ? 0 : Number(joint);
    const child = boneNames.find(n => parentOf[n] === name);
    const dir = child ? head.get(child).clone().sub(head.get(name)).normalize()
      : head.get(name).clone().sub(head.get(parentOf[name])).normalize();
    const palm = new V3(0, -1, 0);
    const thumb = digit === '0';
    // The thumb folds toward the palm and across it (in toward the body).
    const axisWorld = thumb ? dir.clone().cross(new V3(-sideSign[side], -1, 0).normalize()).normalize() : dir.clone().cross(palm).normalize();
    const angle = (thumb ? GAIT.thumbCurl : GAIT.fingerCurl)[j];
    const axisLocal = axisWorld.clone().applyQuaternion(restQ.get(name).clone().invert());
    pose.curl ||= new Map();
    pose.curl.set(name, Rot(axisLocal, angle));
  }
}
function FingerLocal(pose, name) {
  const base = new V3(), q = new Q4(), s = new V3();
  restLocal.get(name).decompose(base, q, s);
  return { p: base, q: q.multiply(pose.curl?.get(name) || new Q4()) };
}

// ---------------------------------------------------------------------------- walk
const W = GAIT.walk, cycle = W.cycleS, strideM = W.speedMps * cycle;
const heelToBall = { L: restFoot.L.ball.clone().sub(restFoot.L.heel), R: restFoot.R.ball.clone().sub(restFoot.R.heel) };
const ankleFromHeel = side => head.get(B(side + ' Foot')).clone().sub(restFoot[side].heel);
const ankleFromBall = side => head.get(B(side + ' Foot')).clone().sub(restFoot[side].ball);
const toeFromAnkle = side => head.get(B(side + ' Toe0')).clone().sub(head.get(B(side + ' Foot')));

/** Foot state at foot-phase u (0 = heel strike), pelvis-relative, before the height correction. */
function FootState(side, u, pelvisX) {
  const s = sideSign[side], x = s * W.footWidthM + pelvisX * 0.15;
  const heelZ0 = W.heelStrikeM;
  const Stance = uu => {
    // The heel lands at heelZ0 and stays put in the world; the pelvis walks away at speedMps.
    const heel = new V3(x, restFoot[side].floor, heelZ0 - strideM * uu);
    let pitch = 0, ankle;
    if (uu < W.heelRockerEnd) {
      pitch = W.strikePitch * (1 - Smooth(uu / W.heelRockerEnd));
      ankle = heel.clone().add(ankleFromHeel(side).applyQuaternion(Rot(X, pitch)));
    } else if (uu < W.toeRockerStart) {
      ankle = heel.clone().add(ankleFromHeel(side));
    } else {
      const t = (uu - W.toeRockerStart) / (W.stance - W.toeRockerStart);
      pitch = W.toeOffPitch * t ** 1.6;
      const ball = heel.clone().add(heelToBall[side]);
      ankle = ball.clone().add(ankleFromBall(side).applyQuaternion(Rot(X, pitch)));
    }
    return { ankle, pitch, stance: true, toeFlat: uu >= W.toeRockerStart ? 1 : 0 };
  };
  if (u <= W.stance) return Stance(u);
  const off = Stance(W.stance), on = Stance(0), t = (u - W.stance) / (1 - W.stance);
  // Swing: the knee folds first (heel up and back), then the shank unfolds forward under the knee.
  const e = Smooth(Math.min(1, Math.max(0, (t - 0.08) / 0.84)));
  const ankle = new V3(Lerp(off.ankle.x, on.ankle.x, t), 0, Lerp(off.ankle.z, on.ankle.z, e));
  const lift = W.swingLiftM * Math.sin(Math.PI * Math.min(1, t ** (Math.log(0.5) / Math.log(W.swingLiftPeak))));
  ankle.y = Lerp(off.ankle.y, on.ankle.y, Smooth(t)) + lift;
  const pitch = t < 0.5 ? Lerp(W.toeOffPitch, -0.05, Smooth(t / 0.5)) : Lerp(-0.05, W.strikePitch, Smooth((t - 0.5) / 0.5));
  return { ankle, pitch, stance: false, toeFlat: Math.max(0, 1 - t / 0.25) };
}

function WalkPose(phase, corrections, pelvisHeight) {
  const pose = new Pose(), th = 2 * Math.PI * phase;
  const sL = sideSign.L;
  // Lowest in double support, highest at mid-stance (twice per cycle).
  const midL = W.stance / 2;
  const bob = W.pelvisBobM * Math.cos(2 * th - 4 * Math.PI * midL) - W.pelvisDropM;
  const pelvisX = sL * W.pelvisSwayM * Math.cos(th - 2 * Math.PI * midL);
  const pelvis = new V3(head.get(B('Pelvis')).x + pelvisX, pelvisHeight + bob, head.get(B('Pelvis')).z);
  // The leading leg's hip goes forward (turn), the swing-side hip drops (list), a slight forward tilt.
  const turn = -sL * W.pelvisTurnRad * Math.cos(th);
  const list = sL * W.pelvisListRad * Math.cos(th - 2 * Math.PI * midL);
  const pelvisQ = Rot(Y, turn).multiply(Rot(Z, list)).multiply(Rot(X, W.pelvisTiltRad));
  pose.Put(B('Pelvis'), pelvis, pelvisQ);
  const feet = {};
  let clamped = 0;
  for (const [side, offset] of [['L', 0], ['R', 0.5]]) {
    const u = (phase + offset) % 1, f = FootState(side, u, pelvisX);
    f.ankle.y += corrections[side];
    const hip = pelvis.clone().add(head.get(B(side + ' Thigh')).clone().sub(head.get(B('Pelvis'))).applyQuaternion(pelvisQ));
    const { knee, clamped: c } = SolveKnee(hip, f.ankle, Z.clone().applyQuaternion(Rot(Y, turn * 0.5)));
    clamped += c ? 1 : 0;
    pose.Aim(B(side + ' Thigh'), B(side + ' Calf'), hip, knee);
    pose.Aim(B(side + ' Calf'), B(side + ' Foot'), knee, f.ankle);
    const footQ = Rot(X, f.pitch);
    pose.Put(B(side + ' Foot'), f.ankle, footQ);
    const toe = f.ankle.clone().add(toeFromAnkle(side).applyQuaternion(footQ));
    pose.Put(B(side + ' Toe0'), toe, Rot(X, f.pitch * (1 - f.toeFlat)));
    feet[side] = { ...f, u };
  }
  // Arms swing against the legs: the left arm is forward when the right heel strikes (phase 0.5).
  const arm = side => {
    const forward = Math.cos(th - (side === 'L' ? Math.PI : 0));
    return { swing: W.armBiasRad + W.armSwingRad * forward, out: W.armOutRad, elbow: W.elbowRad + W.elbowSwingRad * Math.max(0, forward) };
  };
  PoseUpper(pose, pelvis, pelvisQ, -turn * (1 + W.shoulderCounterRad / W.pelvisTurnRad) , W.torsoLeanRad, 0.006 * Math.cos(2 * th), arm);
  CurlFingers(pose);
  return { pose: pose.Finish(), feet, clamped };
}

function StandPose(phase, corrections) {
  const S = GAIT.stand, pose = new Pose(), th = 2 * Math.PI * phase;
  const pelvisX = sideSign.L * S.swayM * Math.sin(th);
  const pelvis = new V3(head.get(B('Pelvis')).x + pelvisX, head.get(B('Pelvis')).y - S.kneeBendDropM, head.get(B('Pelvis')).z);
  const pelvisQ = Rot(Z, -sideSign.L * 0.01 * Math.sin(th));
  pose.Put(B('Pelvis'), pelvis, pelvisQ);
  let clamped = 0;
  for (const side of ['L', 'R']) {
    const s = sideSign[side];
    const ankle = restFoot[side].heel.clone().add(ankleFromHeel(side));
    ankle.x = s * S.footWidthM; ankle.y += corrections[side];
    const hip = pelvis.clone().add(head.get(B(side + ' Thigh')).clone().sub(head.get(B('Pelvis'))).applyQuaternion(pelvisQ));
    const { knee, clamped: c } = SolveKnee(hip, ankle, Z.clone().applyQuaternion(Rot(Y, s * 0.12)));
    clamped += c ? 1 : 0;
    pose.Aim(B(side + ' Thigh'), B(side + ' Calf'), hip, knee);
    pose.Aim(B(side + ' Calf'), B(side + ' Foot'), knee, ankle);
    const footQ = Rot(Y, s * 0.12);
    pose.Put(B(side + ' Foot'), ankle, footQ);
    pose.Put(B(side + ' Toe0'), ankle.clone().add(toeFromAnkle(side).applyQuaternion(footQ)), footQ);
  }
  const arm = () => ({ swing: 0.03 + 0.01 * Math.sin(th), out: S.armOutRad, elbow: S.elbowRad });
  PoseUpper(pose, pelvis, pelvisQ, 0, 0.02, S.breathRad * Math.sin(2 * th), arm);
  CurlFingers(pose);
  return { pose: pose.Finish(), clamped };
}

/** Sample a cycle; soles are pulled onto the floor (stance) or its clearance (swing) by 3 corrections. */
function Bake(kind) {
  const spec = kind === 'walk' ? W : GAIT.stand, frames = Math.round(spec.cycleS * spec.fps), samples = [];
  const floor = Math.min(restFoot.L.floor, restFoot.R.floor);
  // Pelvis height for the walk: the highest that keeps every frame's leg inside its reach.
  let pelvisHeight = head.get(B('Pelvis')).y;
  if (kind === 'walk') for (; pelvisHeight > 0.7; pelvisHeight -= 0.002) {
    let ok = true;
    for (let f = 0; f < frames && ok; f++) if (WalkPose(f / frames, { L: 0, R: 0 }, pelvisHeight).clamped) ok = false;
    if (ok) break;
  }
  const clearance = 0.004;
  for (let f = 0; f <= frames; f++) {
    const phase = (f % frames) / frames;
    const corrections = { L: 0, R: 0 };
    let result;
    for (let iteration = 0; iteration < 3; iteration++) {
      result = kind === 'walk' ? WalkPose(phase, corrections, pelvisHeight) : StandPose(phase, corrections);
      for (const side of ['L', 'R']) {
        const sole = result.pose.SoleMin(side) - floor;
        // Only stance soles are pinned; a swinging foot only must not scuff below the clearance.
        const planted = kind !== 'walk' || result.feet[side].stance;
        const want = planted ? clearance : Math.max(clearance, sole);
        corrections[side] += want - sole;
      }
    }
    samples.push({ phase, result, soles: { L: result.pose.SoleMin('L') - floor, R: result.pose.SoleMin('R') - floor } });
  }
  const tracks = [];
  const times = samples.map((_, f) => Round(f / frames * spec.cycleS));
  for (const name of boneNames) {
    if (name === 'GroundRoot') continue;
    const locals = samples.map(s => /Finger/.test(name) ? FingerLocal(s.result.pose, name) : s.result.pose.Local(name));
    const values = [];
    let prev = null;
    for (const { q } of locals) { if (prev && prev.dot(q) < 0) q.set(-q.x, -q.y, -q.z, -q.w); values.push(...q.toArray().map(Round)); prev = q; }
    // A track that never moves (the curled fingers) keeps its first and last key only.
    const still = values.every((v, i) => Math.abs(v - values[i % 4]) < 2e-4);
    tracks.push({ name: Sanitize(name) + '.quaternion', type: 'quaternion', times: still ? [times[0], times.at(-1)] : times,
      values: still ? [...values.slice(0, 4), ...values.slice(0, 4)] : values });
    if (name === B('Pelvis')) tracks.push({ name: Sanitize(name) + '.position', type: 'vector', times, values: locals.flatMap(({ p }) => p.toArray().map(Round)) });
  }
  return { spec, frames, samples, pelvisHeight, clip: { name: spec.clip, duration: Round(spec.cycleS), tracks, uuid: spec.clip, blendMode: 2500 } };
}

// Contact spans like _import/Script_LocomotionProfileBake.mjs (toe joint low and travelling back).
function Contacts(bake) {
  const out = {}, speeds = [];
  const dt = bake.spec.cycleS / bake.frames;
  for (const side of ['L', 'R']) {
    const toe = bake.samples.map(s => new V3().setFromMatrixPosition(s.result.pose.world.get(B(side + ' Toe0'))));
    const floorY = Math.min(...toe.map(p => p.y));
    const stance = toe.slice(0, bake.frames).map((p, i) => {
      const next = toe[i + 1], prev = toe[(i + bake.frames - 1) % bake.frames];
      const velocity = -(next.z - prev.z) / (2 * dt);
      const grounded = p.y < floorY + 0.035 && velocity > 0.12;
      if (grounded) speeds.push(velocity);
      return grounded;
    });
    out[side] = [];
    for (let start = 0; start < bake.frames; start++) {
      if (!stance[start]) continue;
      let end = start + 1; while (end < bake.frames && stance[end]) end++;
      if ((end - start) * dt > 0.075) out[side].push([Round(start / bake.frames), Round(end / bake.frames)]);
      start = end;
    }
  }
  speeds.sort((a, b) => a - b);
  return { contacts: out, measuredMps: Round(speeds[Math.floor(speeds.length / 2)]) };
}

const walk = Bake('walk'), stand = Bake('stand');
const { contacts, measuredMps } = Contacts(walk);
const Range = (bake, pick) => { const v = bake.samples.map(pick); return [Round(Math.min(...v)), Round(Math.max(...v))]; };
const stanceSoles = side => walk.samples.filter(s => s.result.feet[side].stance).map(s => s.soles[side]);
const swingSoles = side => walk.samples.filter(s => !s.result.feet[side].stance).map(s => s.soles[side]);
const clipJson = JSON.stringify({
  schema: 1, generator: '_import/Script_RelaxedGaitBake.mjs', revision: GAIT.revision, skeleton: humanoid.id,
  source: referenceModel, frame: 'glTF +Y up, asset forward +Z, metres; tracks use sanitized node names',
  restPelvis: head.get(B('Pelvis')).toArray().map(Round),
  clips: [walk.clip, stand.clip],
});
const manifest = {
  schema: 1, revision: GAIT.revision, skeleton: humanoid.id, file: clipFile,
  sourceModel: referenceModel, sourceSha256: crypto.createHash('sha256').update(glbBytes).digest('hex'),
  clipSha256: crypto.createHash('sha256').update(clipJson).digest('hex'),
  gait: GAIT,
  walk: {
    clip: W.clip, duration: Round(W.cycleS), referenceSpeedMps: W.speedMps, measuredToeSpeedMps: measuredMps,
    strideM: Round(strideM), contacts, pelvisHeightM: Round(walk.pelvisHeight),
    legReachClampedFrames: walk.samples.reduce((n, s) => n + s.result.clamped, 0),
    stanceSoleM: { L: Range({ samples: stanceSoles('L').map(v => ({ v })) }, s => s.v), R: Range({ samples: stanceSoles('R').map(v => ({ v })) }, s => s.v) },
    swingSoleMinM: { L: Round(Math.min(...swingSoles('L'))), R: Round(Math.min(...swingSoles('R'))) },
  },
  stand: {
    clip: GAIT.stand.clip, duration: Round(GAIT.stand.cycleS),
    soleM: { L: Range(stand, s => s.soles.L), R: Range(stand, s => s.soles.R) },
    legReachClampedFrames: stand.samples.reduce((n, s) => n + s.result.clamped, 0),
  },
};
const manifestJson = JSON.stringify(manifest, null, 2) + '\n';
if (process.argv.includes('--verify')) {
  const Read = file => fs.readFileSync(path.join(outputDir, file), 'utf8').replace(/\r\n/g, '\n');
  if (Read(clipFile) !== clipJson || Read(manifestFile) !== manifestJson) throw new Error('RelaxedGait clips are stale; rebake them');
  console.log('RelaxedGait verify OK');
} else {
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(path.join(outputDir, clipFile), clipJson);
  fs.writeFileSync(path.join(outputDir, manifestFile), manifestJson);
  console.log(JSON.stringify({ walk: manifest.walk, stand: manifest.stand, bytes: clipJson.length }, null, 1));
}
