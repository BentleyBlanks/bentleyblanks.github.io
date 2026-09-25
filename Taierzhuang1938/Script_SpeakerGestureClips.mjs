// Speaker gesture arm clips (Animation/SpeakerGestures, baked by _import/Script_SpeakerGestureBake.py):
// loader and sampler shared by the gesture layer (docs/Data_CharacterSpeech.md, "Speaker gestures
// (03-06)") and its tests. Nothing loads at boot: the first gesture layer calls
// LoadSpeakerGestureClips(), which only happens in the 01-06 steps.
//
// A clip is one arm (clavicle, upper arm, forearm, hand, fingers) plus Spine/Spine1/Spine2, stored as
// glTF node-local rotations (x, y, z, w) per frame. Bone names are the rig's source names ("Bip002 L
// UpperArm"); GLTFLoader turns spaces into underscores and drops dots, so bones are matched on a
// normalized name (lower case, letters and digits only), the same way the opening library does.
import { Quaternion, Vector3 } from "three";
import { SPEAKER_GESTURE_ASSET as A, SPEAKER_GESTURE_CLIPS } from "./Data_FirstLevelSpeakerGestures.mjs";

let library = null, pending = null;
const NormalizeBoneName = name => String(name || "").toLowerCase().replace(/[^a-z0-9]/g, "");

async function FetchJson(file) {
  const response = await fetch(A.animationBase + file + "?v=" + A.version);
  if (!response.ok) throw Error(`Speaker gestures ${file}: ${response.status}`);
  return response.json();
}

/** Parsed clip record: values as a Float32Array, frame count, fps and the clip's windows. */
function Prepare(record, fps) {
  const clips = {};
  for (const [name, row] of Object.entries(record.clips || {})) {
    const spec = SPEAKER_GESTURE_CLIPS[name];
    clips[name] = Object.freeze({
      name, hand: row.hand, duration: row.duration, frameCount: row.frameCount, fps,
      bones: row.bones, keys: row.bones.map(NormalizeBoneName), strokeDir: row.strokeDir,
      spine: row.bones.map(bone => /\bSpine\d?$/.test(bone)),
      values: Float32Array.from(row.values), spec,
    });
  }
  return { modelId: record.modelId, clips, anchors: record.anchors || {} };
}

/**
 * Load the manifest and both rigs' clips once (a promise shared by every caller). `read(file)` returns the
 * parsed JSON of a file under the animation base; the browser default fetches it, node tests pass a reader.
 */
export function LoadSpeakerGestureClips(read = FetchJson) {
  return pending ||= (async () => {
    const manifest = await read(A.manifest);
    if (manifest.version !== A.version) throw Error(`Speaker gestures version ${manifest.version} != ${A.version}`);
    const models = new Map(await Promise.all(manifest.models.map(async row => [row.id, Prepare(await read(row.file), manifest.fps)])));
    return library = { manifest, models };
  })().catch(error => { pending = null; throw error; });   // a failed load can be tried again
}

/** The loaded library, or null before LoadSpeakerGestureClips resolved. */
export function SpeakerGestureLibrary() { return library; }

/** One rig's clip record (null when the rig or the clip was not baked, or before the load). */
export function SpeakerGestureClip(modelId, clip, from = library) {
  return from?.models.get(modelId)?.clips[clip] || null;
}

/** The rig's bones in the clip's order (null where the rig has no such bone). */
export function BindSpeakerGestureBones(root, record) {
  const byName = new Map();
  root?.traverse?.(node => { if (node.isBone) byName.set(NormalizeBoneName(node.name), node); });
  return record.keys.map(key => byName.get(key) || null);
}

const QA = new Quaternion(), QB = new Quaternion();
/**
 * Local rotations at `seconds` (clamped to the clip) into out[i] (Quaternion per clip bone): the two
 * nearest frames, slerped. Returns out.
 */
export function SampleSpeakerGesture(record, seconds, out) {
  const last = record.frameCount - 1, v = record.values, n = record.keys.length;
  const x = Math.max(0, Math.min(last, (Number(seconds) || 0) * record.fps));
  const i = Math.min(last - 1, Math.floor(x)), t = x - i;
  for (let k = 0; k < n; k++) {
    const a = (i * n + k) * 4, b = ((i + 1) * n + k) * 4;
    QA.set(v[a], v[a + 1], v[a + 2], v[a + 3]).normalize();
    QB.set(v[b], v[b + 1], v[b + 2], v[b + 3]).normalize();
    (out[k] ||= new Quaternion()).slerpQuaternions(QA, QB, t);
  }
  return out;
}

/** First-frame rotations (the reference the spine lean is measured from). */
export function SpeakerGestureFirstFrame(record, out) {
  const v = record.values;
  for (let k = 0; k < record.keys.length; k++) (out[k] ||= new Quaternion()).set(v[k * 4], v[k * 4 + 1], v[k * 4 + 2], v[k * 4 + 3]).normalize();
  return out;
}

/** Test hook: forget the loaded library (node tests load with different readers). */
export function ResetSpeakerGestureClips() { library = null; pending = null; }

/** A rig's reach anchor (manifest `anchors[name]`: bone name and glTF node-local offset), or null. */
export function SpeakerGestureAnchor(modelId, name, from = library) {
  return from?.models.get(modelId)?.anchors?.[name] || null;
}

const U = new Vector3(), F = new Vector3(), E = new Vector3(), T = new Vector3(), A1 = new Vector3(), A2 = new Vector3();
const HL = new Vector3(), RQ = new Quaternion(), WQ = new Quaternion(), PQ = new Quaternion();
function TurnWorld(bone, rotation) {
  bone.getWorldQuaternion(WQ); bone.parent.getWorldQuaternion(PQ).invert();
  bone.quaternion.copy(PQ.multiply(WQ.premultiply(rotation)));
  bone.updateMatrixWorld(true);
}
/**
 * Two-bone reach: bend the elbow and turn the upper arm so that `effector` (a world point carried rigidly by
 * `hand`, e.g. the finger-root grip) moves `weight` of the way to `target` (world). The bend stays in the arm's
 * current plane; the hand keeps its orientation relative to the forearm. Returns the remaining distance (m).
 */
export function ReachSpeakerGestureArm(upper, fore, hand, effector, target, weight = 1) {
  return Reach(upper, fore, hand, effector, target, weight);
}

const HQ = new Quaternion(), HW = new Quaternion(), GRIP = new Vector3(), SUM = new Vector3();
/**
 * Reach to an anchor on the live head (the manifest's per-rig `anchors[name]`: grip offset and hand rotation in
 * the head bone's frame): the hand takes the authored rotation relative to the head, then the arm reaches so the
 * grip (the centroid of `gripBones`, the finger roots) lands on the anchor. Two passes (turning the hand moves the
 * grip). `weight` blends both. Returns the remaining grip distance (m).
 */
export function ReachSpeakerGestureAnchor(upper, fore, hand, gripBones, head, anchor, weight = 1) {
  if (!(weight > 0) || !head || !anchor || !gripBones?.length) return Infinity;
  const w = Math.min(1, weight);
  T.fromArray(anchor.offset); head.updateWorldMatrix(true, false); head.localToWorld(T);
  const target = GRIP.copy(T);
  let error = Infinity;
  for (let pass = 0; pass < 2; pass++) {
    if (anchor.handQ) {
      head.getWorldQuaternion(HW).multiply(HQ.fromArray(anchor.handQ));
      hand.getWorldQuaternion(WQ); WQ.slerp(HW, w);
      hand.parent.getWorldQuaternion(PQ).invert(); hand.quaternion.copy(PQ.multiply(WQ)); hand.updateMatrixWorld(true);
    }
    SUM.set(0, 0, 0); for (const bone of gripBones) SUM.add(bone.getWorldPosition(E)); SUM.divideScalar(gripBones.length);
    error = Reach(upper, fore, hand, SUM, target, w);
  }
  return error;
}

function Reach(upper, fore, hand, effector, target, weight) {
  if (!(weight > 0) || !upper?.parent || !fore || !hand) return Infinity;
  upper.updateWorldMatrix(true, true);
  HL.copy(effector); hand.worldToLocal(HL);
  upper.getWorldPosition(U); fore.getWorldPosition(F); E.copy(effector);
  T.copy(E).lerp(target, Math.min(1, weight));
  const a = U.distanceTo(F), b = F.distanceTo(E);
  const d = Math.max(Math.abs(a - b) + 1e-4, Math.min(a + b - 1e-4, U.distanceTo(T)));
  A1.copy(U).sub(F); A2.copy(E).sub(F);
  const now = A1.angleTo(A2), want = Math.acos(Math.max(-1, Math.min(1, (a * a + b * b - d * d) / (2 * a * b))));
  const axis = A1.cross(A2);
  if (axis.lengthSq() > 1e-10 && Math.abs(want - now) > 1e-5) TurnWorld(fore, RQ.setFromAxisAngle(axis.normalize(), want - now));
  E.copy(HL); hand.localToWorld(E);
  A1.copy(E).sub(U).normalize(); A2.copy(T).sub(U).normalize();
  TurnWorld(upper, RQ.setFromUnitVectors(A1, A2));
  E.copy(HL); hand.localToWorld(E);
  return E.distanceTo(T);
}
