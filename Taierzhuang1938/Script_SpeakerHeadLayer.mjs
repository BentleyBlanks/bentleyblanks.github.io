// Shared attention layer for every character with a face who talks or listens:
// head/neck turn toward the attention target and a nod on each stressed syllable
// (Script_CharacterFacialAnimation.stress, which comes from the face track), plus
// a slow breath. Extracted from Script_OpeningActorPerformance (the 01-03 director
// layer keeps its gestures and calls the same look math). Runs after the body
// mixer, before the face (eyes read the turned head).
// It owns the 03-06 arm gestures (Script_SpeakerGestureLayer, rig.speakerGesture):
// the arm is posed before the head turn; the aim at a target, the beat and a reach to the mouth after it.
import { Quaternion, Vector3 } from "three";
import { SPEAKER_HEAD as H } from "./Data_Tuning_CharacterSpeech.mjs";
import { SpeakerGestureLayer } from "./Script_SpeakerGestureLayer.mjs";

const Clamp = (value, low, high) => Math.max(low, Math.min(high, value));

/**
 * Yaw/pitch (radians) from an actor's facing to a world target, forward hemisphere
 * only: rearward talk is acknowledged with a glance, never a 180-degree neck twist.
 * rootQuaternion: the actor root's world rotation (actor front is local -Z).
 */
const inverseScratch = new Quaternion();
export function SpeakerLookAngles(rootQuaternion, origin, target, out = { yaw: 0, pitch: 0 }, scratch = new Vector3()) {
  scratch.copy(target).sub(origin).applyQuaternion(inverseScratch.copy(rootQuaternion).invert());
  out.yaw = Clamp(Math.atan2(-scratch.x, -scratch.z), -H.maxYaw, H.maxYaw);
  out.pitch = Clamp(Math.atan2(scratch.y, Math.hypot(scratch.x, scratch.z)), H.minPitch, H.maxPitch);
  return out;
}

export class SpeakerHeadLayer {
  constructor(rig, seed = 0) {
    this.rig = rig;
    this.lookAt = null;      // Vector3 | () => Vector3 | null, set by the speaker binder
    this.speaking = false;
    this.enabled = true;
    this.yaw = 0; this.pitch = 0;
    this.phase = ((Number(seed) || 0) % 997) * .013;
    this.clock = 0;
    this.written = new Map(); // bone -> [base, written] to undo on bones no clip keys
    this.touched = new Set(); // bones turned this frame (base is taken before the first turn only)
    this.rootQ = new Quaternion(); this.parentQ = new Quaternion(); this.turnQ = new Quaternion();
    this.up = new Vector3(0, 1, 0); this.right = new Vector3(); this.axis = new Vector3();
    this.origin = new Vector3(); this.target = new Vector3(); this.scratch = new Vector3();
    this.angles = { yaw: 0, pitch: 0 };
    // Arm gestures for the lines in Data_FirstLevelSpeakerGestures (only where this layer exists: 01-06).
    this.gesture = rig.speakerGesture = new SpeakerGestureLayer(rig, this);
  }

  _Restore() {
    // A bone the current clip does not key keeps last frame's turn; put its base back.
    for (const [bone, [base, written]] of this.written) if (bone.quaternion.equals(written)) bone.quaternion.copy(base);
  }

  _Turn(bone, axis, angle) {
    if (!bone?.parent || !angle) return;
    const entry = this.written.get(bone) || [new Quaternion(), new Quaternion()];
    // The same bone may be turned twice a frame (yaw, then pitch): its base is the pose
    // before the first turn, or _Restore would put back half of this frame's turn.
    if (!this.touched.has(bone)) { entry[0].copy(bone.quaternion); this.touched.add(bone); }
    bone.parent.getWorldQuaternion(this.parentQ).invert();
    this.axis.copy(axis).applyQuaternion(this.parentQ).normalize();
    this.turnQ.setFromAxisAngle(this.axis, angle); bone.quaternion.premultiply(this.turnQ);
    entry[1].copy(bone.quaternion); this.written.set(bone, entry);
    bone.updateMatrixWorld(true);
  }

  Apply(dt, state = {}) {
    this._Restore();
    this.touched.clear();
    this.gesture?.Apply(dt, state);
    this._ApplyHead(dt, state);
    this.gesture?.AfterHead();
  }

  _ApplyHead(dt, state) {
    const rig = this.rig, bones = rig.bones;
    if (!this.enabled || !bones?.head || state.dead || rig.actor?.ragdollState) return;
    // The 01-03 storyboard director already acts this rig (same look math).
    if (rig.openingActorPerformanceState) return;
    const step = Math.max(0, dt || 0); this.clock += step;
    const busy = !!(state.firing || state.fire > 0 || state.aim > .6 || state.meleeCombat);
    let yaw = 0, pitch = 0;
    const target = typeof this.lookAt === "function" ? this.lookAt() : this.lookAt;
    const root = rig.actor?.root || rig.root;
    if (target) {
      bones.head.getWorldPosition(this.origin);
      root.getWorldQuaternion(this.rootQ);
      SpeakerLookAngles(this.rootQ, this.origin, target, this.angles, this.scratch);
      yaw = this.angles.yaw; pitch = this.angles.pitch;
    }
    const mix = 1 - Math.exp(-step * H.followRate);
    this.yaw += (yaw - this.yaw) * mix; this.pitch += (pitch - this.pitch) * mix;
    if (Math.abs(this.yaw) < 1e-4 && Math.abs(this.pitch) < 1e-4 && !this.speaking && !target) return;
    root.getWorldQuaternion(this.rootQ);
    this.right.set(1, 0, 0).applyQuaternion(this.rootQ);
    const nod = (rig.facial?.stress || 0) * (busy ? H.busyNodRadians : H.nodRadians);
    const breath = H.breathRadians * Math.sin((this.clock + this.phase) * H.breathRate) * (this.speaking ? .5 : 1);
    if (busy) {
      this._Turn(bones.head, this.up, Clamp(this.yaw, -H.busyMaxYaw, H.busyMaxYaw));
      this._Turn(bones.head, this.right, Clamp(this.pitch, -H.busyMaxPitch, H.busyMaxPitch) - nod + breath * .5);
    } else {
      this._Turn(bones.neck || bones.head, this.up, this.yaw * H.neckShare);
      this._Turn(bones.head, this.up, this.yaw * H.headShare);
      this._Turn(bones.head, this.right, this.pitch - nod + breath);
    }
  }

  Dispose() {
    this._Restore(); this.written.clear(); this.lookAt = null;
    this.gesture?.Dispose();
    if (this.rig.speakerGesture === this.gesture) this.rig.speakerGesture = null;
  }
}
