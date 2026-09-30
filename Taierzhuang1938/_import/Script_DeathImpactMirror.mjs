// Left/right mirrors of the four Kimodo DeathCollapse clips, written into the DeathImpact library.
//
//   node Taierzhuang1938/_import/Script_DeathImpactMirror.mjs
//
// The Kimodo library GLB (Model/Character/Animation_TengxianNraDeathCollapse.glb) is retargeted onto the shipped
// TengxianNra02 rest exactly like Script_CharacterModel.RetargetAnimationLibrary does at load time (per-bone rest
// delta; the top-level GroundRoot through the two container matrices), sampled at 30 fps, then mirrored:
//
//   world frame = the frame GroundRoot lives in (glTF: +Y up, character front +Z, character left +X);
//   S = diag(-1, 1, 1);   W'(bone) = S * W(partner) * S * C(bone),   C = (S * Wrest(partner) * S)^-1 * Wrest(bone)
//
// partner = the opposite-side bone (Bip001 L X <-> Bip001 R X, itself for the centre line); C absorbs the
// left/right difference of the local bone frames, so at rest W' == Wrest exactly. Local transforms are rebuilt from
// the mirrored world matrices, so bone lengths and the hierarchy are untouched. The output joins
// Animation/HitReaction/Animation_TengxianDeathImpact.json (clips + profiles, source "kimodo-mirror").
import fs from 'node:fs';
import path from 'node:path';
import * as THREE from '../vendor/three/build/three.module.js';
import { LoadGlb, PoseScene } from './Script_LugouGlbPose.mjs';

const project = path.resolve(import.meta.dirname, '..');
const PLAYBACK_RATE = 1.6;      // DEATH_COLLAPSE_PLAYBACK_RATE in Script_CharacterModel.mjs
const OUT_FPS = 30;
const GAME_PER_ASSET = 0.9135347842293876;   // AUTHORING_SCALE of TengxianNra02 (game metres per asset unit)
const REVISION = '20260930DeathImpactV1';
const LETTERS = ['A', 'B', 'C', 'D'];

const humanoid = JSON.parse(fs.readFileSync(path.join(project, 'Model/Character/Data_TengxianHumanoid.json'), 'utf8'));
const names = humanoid.bodyBones.map(b => b.name);
const target = new PoseScene(LoadGlb(path.join(project, 'Model/Character/Model_TengxianNra02.glb')));
const library = new PoseScene(LoadGlb(path.join(project, 'Model/Character/Animation_TengxianNraDeathCollapse.glb')));
const tIndex = new Map(names.map(n => [n, target.NodeIndex(n)]));
const sIndex = new Map(names.map(n => [n, library.NodeIndex(n)]));
for (const n of names) if (tIndex.get(n) < 0 || sIndex.get(n) < 0) throw new Error('missing node ' + n);
target.animations.push({ name: 'Rest', channels: [], duration: 0 });
target.Apply(target.animations.length - 1, 0);
library.animations.push({ name: 'Rest', channels: [], duration: 0 });

const M = a => new THREE.Matrix4().fromArray(a);
const compose = (p, q) => new THREE.Matrix4().compose(new THREE.Vector3(...p), new THREE.Quaternion(...q), new THREE.Vector3(1, 1, 1));
const parentName = new Map(names.map(n => {
  const parent = target.parent[tIndex.get(n)];
  const parentOfNode = parent >= 0 ? target.nodes[parent].name : null;
  return [n, names.includes(parentOfNode) ? parentOfNode : null];   // GroundRoot's container is outside the body list
}));
const rootParentIndex = target.parent[tIndex.get('GroundRoot')];
const sourceRootParent = library.parent[sIndex.get('GroundRoot')];
if (parentName.get('GroundRoot') !== null && rootParentIndex >= 0) {
  // GroundRoot hangs under a container in the shipped GLB; that container is not in `names`
}
const containerT = rootParentIndex >= 0 ? M(target.world[rootParentIndex]) : new THREE.Matrix4();
const containerS = sourceRootParent >= 0 ? M(library.world[sourceRootParent]) : new THREE.Matrix4();
const toTarget = containerT.clone().invert().multiply(containerS);
const toTargetQ = new THREE.Quaternion().setFromRotationMatrix(toTarget);

// rest deltas
const restDelta = new Map(names.map(n => {
  const t = tIndex.get(n), s = sIndex.get(n);
  const dq = new THREE.Quaternion(...target.baseR[t]).multiply(new THREE.Quaternion(...library.baseR[s]).invert());
  const dp = new THREE.Vector3(...target.baseT[t]).sub(new THREE.Vector3(...library.baseT[s]));
  return [n, { dq, dp }];
}));

// forward kinematics over the shipped hierarchy: locals (Map name -> {p, q}) -> world matrices in GroundRoot's parent frame
const orderNames = names.slice();   // bodyBones lists parents first (GroundRoot first)
const Fk = locals => {
  const world = new Map();
  for (const n of orderNames) {
    const local = compose(locals.get(n).p.toArray(), locals.get(n).q.toArray());
    const parent = parentName.get(n);
    world.set(n, parent && world.has(parent) ? world.get(parent).clone().multiply(local) : local);
  }
  return world;
};
const restLocals = new Map(names.map(n => [n, { p: new THREE.Vector3(...target.baseT[tIndex.get(n)]), q: new THREE.Quaternion(...target.baseR[tIndex.get(n)]) }]));
const restWorld = Fk(restLocals);
const S = new THREE.Matrix4().makeScale(-1, 1, 1);
const partner = n => n.replace(/ L /, ' \u0000 ').replace(/ R /, ' L ').replace(/ \u0000 /, ' R ');
const correction = new Map(names.map(n => {
  const mirroredRest = S.clone().multiply(restWorld.get(partner(n))).multiply(S);
  return [n, mirroredRest.invert().multiply(restWorld.get(n))];
}));
// self check: the rest pose maps onto itself
for (const n of names) {
  const w = S.clone().multiply(restWorld.get(partner(n))).multiply(S).multiply(correction.get(n));
  const err = w.elements.reduce((m, v, i) => Math.max(m, Math.abs(v - restWorld.get(n).elements[i])), 0);
  if (err > 1e-6) throw new Error('mirror rest mismatch on ' + n + ' ' + err);
}

function SampleRetargeted(animation, time) {
  library.Apply(library.animations.indexOf(animation), time);
  const locals = new Map();
  for (const n of names) {
    const s = sIndex.get(n);
    const q = new THREE.Quaternion(...library.r[s]);
    const p = new THREE.Vector3(...library.t[s]);
    if (n === 'GroundRoot') {
      p.applyMatrix4(toTarget);
      q.premultiply(toTargetQ);
    } else {
      p.add(restDelta.get(n).dp);
      q.premultiply(restDelta.get(n).dq);
    }
    locals.set(n, { p, q: q.normalize() });
  }
  return locals;
}

function MirrorLocals(locals) {
  const world = Fk(locals);
  const mirrored = new Map();
  for (const n of names) {
    mirrored.set(n, S.clone().multiply(world.get(partner(n))).multiply(S).multiply(correction.get(n)));
  }
  const out = new Map();
  for (const n of names) {
    const parent = parentName.get(n);
    const local = parent ? mirrored.get(parent).clone().invert().multiply(mirrored.get(n)) : mirrored.get(n).clone();
    const p = new THREE.Vector3(), q = new THREE.Quaternion(), sc = new THREE.Vector3();
    local.decompose(p, q, sc);
    out.set(n, { p, q: q.normalize() });
  }
  return out;
}

function BuildClip(name, frames) {
  const times = frames.map((_, k) => Math.round(k / OUT_FPS * 1e6) / 1e6);
  const tracks = [];
  for (const n of names) {
    for (const [prop, width, kind] of [['position', 3, 'vector'], ['quaternion', 4, 'quaternion']]) {
      const rows = frames.map(f => (prop === 'position' ? f.get(n).p.toArray() : f.get(n).q.toArray()));
      if (kind === 'quaternion') {
        for (let r = 1; r < rows.length; r += 1) {
          if (rows[r].reduce((s, v, i) => s + v * rows[r - 1][i], 0) < 0) rows[r] = rows[r].map(v => -v);
        }
      }
      const dev = Math.max(...rows.map(row => Math.max(...row.map((v, i) => Math.abs(v - rows[0][i])))));
      const round = v => Math.round(v * 1e5) / 1e5;
      if (dev < 2e-5) tracks.push({ name: n.replace(/ /g, '_') + '.' + prop, type: kind, times: [0, times[times.length - 1]], values: [...rows[0], ...rows[0]].map(round) });
      else tracks.push({ name: n.replace(/ /g, '_') + '.' + prop, type: kind, times, values: rows.flat().map(round) });
    }
  }
  return { name, uuid: name, duration: times[times.length - 1], tracks, blendMode: 2500 };
}

const Actor = v => [-v.x * GAME_PER_ASSET, v.y * GAME_PER_ASSET, -v.z * GAME_PER_ASSET];   // actor local (x right, y up, z back)
function Measure(world, startRoot) {
  const at = n => new THREE.Vector3().setFromMatrixPosition(world.get('Bip001 ' + n));
  const pelvis = at('Pelvis'), head = at('Head');
  const rel = v => Actor(v.clone().sub(new THREE.Vector3(startRoot.x, 0, startRoot.z)));
  return { pelvis: rel(pelvis), head: rel(head), pelvisHeight: pelvis.y * GAME_PER_ASSET };
}

const report = {};
const outClips = [], outProfiles = {};
for (const letter of LETTERS) {
  const animation = library.animations.find(a => a.name.endsWith(`DeathCollapse${letter}_V1`));
  if (!animation) throw new Error('missing DeathCollapse' + letter);
  const count = Math.ceil(animation.duration * OUT_FPS);
  const originals = [], mirrors = [];
  for (let k = 0; k <= count; k += 1) {
    const locals = SampleRetargeted(animation, Math.min(animation.duration, k / OUT_FPS));
    originals.push(locals);
    mirrors.push(MirrorLocals(locals));
  }
  const clipName = `DeathCollapse${letter}Mirror`;
  outClips.push(BuildClip(clipName, mirrors));
  const startWorld = Fk(originals[0]);
  const startRoot = new THREE.Vector3().setFromMatrixPosition(startWorld.get('Bip001 Pelvis'));
  const startMirror = Fk(mirrors[0]);
  const startRootM = new THREE.Vector3().setFromMatrixPosition(startMirror.get('Bip001 Pelvis'));
  const endO = Measure(Fk(originals[count]), startRoot);
  const endM = Measure(Fk(mirrors[count]), startRootM);
  const fall = [endM.head[0], endM.head[2]];
  const len = Math.hypot(...fall);
  const fallO = [endO.head[0], endO.head[2]];
  report[letter] = { original: { pelvis: endO.pelvis.map(v => +v.toFixed(3)), head: endO.head.map(v => +v.toFixed(3)) },
                     mirror: { pelvis: endM.pelvis.map(v => +v.toFixed(3)), head: endM.head.map(v => +v.toFixed(3)) } };
  outProfiles[clipName] = {
    family: 'left',
    fallLocal: fall.map(v => +(v / len).toFixed(4)),
    fallDistanceM: +len.toFixed(3),
    pelvisEndLocal: [endM.pelvis[0], endM.pelvisHeight, endM.pelvis[2]].map(v => +v.toFixed(4)),
    headEndLocal: [endM.head[0], endM.head[1], endM.head[2]].map(v => +v.toFixed(4)),
    pelvisDropM: +(startRootM.y * GAME_PER_ASSET - endM.pelvisHeight).toFixed(3),
    durationS: +(animation.duration / PLAYBACK_RATE).toFixed(4),
    playbackRate: PLAYBACK_RATE,
    settleS: +(animation.duration / PLAYBACK_RATE).toFixed(3),
    floorM: null,      // filled from the browser probe (visible skin), see Data_DeathImpactClips.md
    impact: { part: 'torso', dirLocal: [-1, 0, 0] },   // the originals fall right; pushed from the right they now fall left
    source: 'kimodo-mirror',
    mirrorOf: `DeathCollapse${letter}`,
    originalFallLocal: fallO.map(v => +(v / Math.hypot(...fallO)).toFixed(4)),
  };
}
console.log(JSON.stringify(report, null, 1));

const file = path.join(project, 'Animation/HitReaction/Animation_TengxianDeathImpact.json');
fs.mkdirSync(path.dirname(file), { recursive: true });
const library_ = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8'))
  : { schema: 1, revision: REVISION, skeleton: 'TengxianHumanoidV1', clips: [], profiles: {} };
const byName = new Map(library_.clips.map(c => [c.name, c]));
for (const clip of outClips) byName.set(clip.name, clip);
library_.clips = [...byName.values()];
Object.assign(library_.profiles, outProfiles);
library_.revision = REVISION;
const text = JSON.stringify(library_);
fs.writeFileSync(file, text);
console.log('wrote', file, text.length, 'bytes,', library_.clips.length, 'clips');
