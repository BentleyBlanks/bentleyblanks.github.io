// 03-06 speaker gestures: one arm (and a little spine) acted while a line with a gesture row is spoken.
// Owned by Script_SpeakerHeadLayer (created with it, so it exists exactly where the head layer does: the 01-06
// steps the speaker binder is active in) and run inside SpeakerHeadLayer.Apply: Apply() before the head turn,
// AfterHead() after it, the face (facial.Update) last. Design: docs/Data_CharacterSpeech.md, "Speaker gestures
// (03-06)"; rows: Data_FirstLevelSpeakerGestures; numbers: Data_Tuning_CharacterSpeech.SPEAKER_GESTURE.
//
// Which line: rig.facial.lastSpeech (the voice sample the mouth played last frame, from the binder's
// voice.Speech(who)): a new lineId with a row starts that row's clip. Nothing else calls this layer.
// Bones written: the gesture arm (clavicle .. fingers) and Spine/Spine1/Spine2 (additive). Never neck, head or
// Face_*. Every written bone is put back at the next Apply when the body mixer did not key it (head-layer
// pattern). A left-hand gesture on a two-handed weapon keeps the rifle where the two-hand pose put it:
// Script_Actor._UpdateRiggedWeaponMount asks HeldLeftGrip() for the left grip instead of the moved socket.
import { Quaternion, Vector3 } from "three";
import { SPEAKER_GESTURE as G } from "./Data_Tuning_CharacterSpeech.mjs";
import { SpeakerGestureForLine, SPEAKER_GESTURE_TARGETS } from "./Data_FirstLevelSpeakerGestures.mjs";
import { FRONT_SORTIE, FRONT_SPACE } from "./Data_FirstLevelFrontRoute.mjs";
import {
  LoadSpeakerGestureClips, SpeakerGestureLibrary, SpeakerGestureClip, BindSpeakerGestureBones,
  SampleSpeakerGesture, SpeakerGestureFirstFrame, SpeakerGestureAnchor, ReachSpeakerGestureAnchor, ReachSpeakerGestureArm,
} from "./Script_SpeakerGestureClips.mjs";

const Clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const Smooth = x => { const t = Clamp(x, 0, 1); return t * t * (3 - 2 * t); };
const DEG = Math.PI / 180;

// World providers set by the mission runtime (one line): the live tank and the ground height. Without them a
// tank line points the clip's own direction and ground anchors sit at the speaker's feet height.
const world = { tank: null, ground: null };
/** { tank: () => {x, z, y?} | null, ground: (x, z) => y } (either may be omitted). */
export function SetSpeakerGestureWorld({ tank = null, ground = null } = {}) { world.tank = tank; world.ground = ground; }

let loadStarted = false, loadError = null;
function EnsureLoaded() {
  if (loadStarted) return;
  loadStarted = true;
  LoadSpeakerGestureClips().catch(error => {
    loadError = String(error?.message || error);
    console.warn("[SpeakerGesture] clips not loaded, speakers keep the head layer only:", loadError);
  });
}

/** The row's target anchor as a world point (null: none / not resolvable now). */
export function SpeakerGestureTargetPoint(name, { root, lookAt } = {}, out = new Vector3()) {
  const spec = SPEAKER_GESTURE_TARGETS[name];
  if (!spec) return null;
  const Ground = (x, z, fallback) => { const y = world.ground?.(x, z); return Number.isFinite(y) ? y : fallback; };
  const base = root ? root.getWorldPosition(out) : out.set(0, 0, 0);
  const feet = base.y;
  const m = /^(sortie|space):(.+)$/.exec(spec);
  if (m) {
    const point = m[2].split(".").reduce((o, k) => o?.[k], m[1] === "sortie" ? FRONT_SORTIE : FRONT_SPACE);
    if (!Number.isFinite(point?.x) || !Number.isFinite(point?.z)) return null;
    return out.set(point.x, Ground(point.x, point.z, feet) + G.pointRiseM, point.z);
  }
  if (spec === "south") return out.set(base.x, feet + G.pointRiseM, base.z + G.southM);
  if (spec === "listener") {
    const target = typeof lookAt === "function" ? lookAt() : lookAt;
    return target?.isVector3 ? out.copy(target).setY(target.y - G.listenerDropM) : null;
  }
  if (spec === "tank") {
    const tank = world.tank?.();
    if (!tank || !Number.isFinite(tank.x) || !Number.isFinite(tank.z)) return null;
    return out.set(tank.x, Ground(tank.x, tank.z, Number.isFinite(tank.y) ? tank.y : feet) + G.tankRiseM, tank.z);
  }
  return null;
}

/**
 * Why a body cannot gesture now (null: it can). `fireAge`: seconds since this body last fired. A shouldered rifle
 * alone is not "aiming": the 03-05 front AI holds aim 1 through the whole fight (ambient fire, one shot every few
 * seconds; 2026-09-25 probe), so a man counts as aiming only while he is in a shooting run (fired within aimQuietS).
 */
export function SpeakerGestureBusy(rig, state = {}, fireAge = Infinity) {
  if (state.dead || rig.actor?.ragdollState) return "dead";
  if (rig.openingActorPerformanceState) return "director";
  if (rig.forcedClip) return "forcedClip";
  if (state.firing || state.fire > 0) return "firing";
  if ((state.aim || 0) > G.maxAim && fireAge < G.aimQuietS) return "aiming";
  if (state.meleeCombat || state.melee > 0) return "melee";
  if (state.throwing > 0 || rig.infantry?.IsThrowing?.()) return "throwing";
  if (state.carryRole) return "carrying";
  if ((state.woundedWalk || 0) > .5) return "wounded";
  if ((state.prone || 0) > G.maxProne) return "prone";
  if ((state.moveSpeed || 0) > G.maxMoveSpeed) return "moving";
  return null;
}

const P = new Vector3(), P2 = new Vector3(), D = new Vector3(), S = new Vector3(), H = new Vector3(), AX = new Vector3();
const Q = new Quaternion(), Q2 = new Quaternion(), WQ = new Quaternion(), PQ = new Quaternion(), ID = new Quaternion();

function TurnWorld(bone, rotation) {
  bone.getWorldQuaternion(WQ); bone.parent.getWorldQuaternion(PQ).invert();
  bone.quaternion.copy(PQ.multiply(WQ.premultiply(rotation)));
  bone.updateMatrixWorld(true);
}

export class SpeakerGestureLayer {
  constructor(rig, head = null) {
    this.rig = rig;
    this.head = head;                   // the owning SpeakerHeadLayer (lookAt = the listener)
    this.enabled = G.enabled;
    this.active = null;                 // the running gesture
    this.lastLineId = null;             // the line a gesture was last started (or refused) for
    this.stressHigh = false;
    this.busyFade = 1;
    this.fireAge = Infinity;            // seconds since this body last fired (state.firing)
    this.written = new Map();           // bone -> [base, written]
    this.touched = new Set();
    this.bound = new Map();             // clip record -> rig bones
    this.held = { on: false, local: new Vector3(), socket: null };
    this.target = new Vector3();
    this.pending = null;                // { row, lineId } to start once the current gesture is released
    // Start fetching the clips when the first 01-06 speaker is bound (03 is minutes later); not in node tests.
    if (typeof location !== "undefined") EnsureLoaded();
    // Probe state (FRONT_ACTING, tests). lines[lineId] = { frames, gestureFrames, busyFrames, maxWeight, clip }.
    this.state = { clip: null, lineId: null, weight: 0, t: 0, phase: null, aimError: null, clamped: false,
      suppressed: null, hand: null, busyFor: 0 };
    this.lines = {};
    this.gestureFrames = 0;
  }

  get library() { return SpeakerGestureLibrary(); }

  _Mark(bone) {
    if (this.touched.has(bone)) return;
    const entry = this.written.get(bone) || [new Quaternion(), new Quaternion()];
    entry[0].copy(bone.quaternion); this.written.set(bone, entry); this.touched.add(bone);
  }

  _Seal() { for (const bone of this.touched) this.written.get(bone)[1].copy(bone.quaternion); }

  _Restore() {
    for (const [bone, [base, written]] of this.written) if (bone.quaternion.equals(written)) bone.quaternion.copy(base);
    this.written.clear(); this.touched.clear();
  }

  _Bones(record) {
    let bones = this.bound.get(record);
    if (!bones) {
      const list = BindSpeakerGestureBones(this.rig.root, record);
      const side = record.hand.toLowerCase(), prefix = (record.keys[0].match(/^bip[0-9]+/) || [""])[0];
      const find = key => list[record.keys.indexOf(prefix + side + key)] || null;
      bones = { list, clavicle: find("clavicle"), upper: find("upperarm"), fore: find("forearm"), hand: find("hand"),
        roots: [1, 2, 3, 4].map(i => find("finger" + i)).filter(Boolean) };
      this.bound.set(record, bones);
    }
    return bones;
  }

  /** Stroke direction (shoulder -> hand at the stroke) in the clavicle parent's frame, measured once on this body. */
  _StrokeDir(g) {
    const { list, clavicle, upper, hand } = g.bones;
    if (!clavicle?.parent || !upper || !hand) return null;
    const saved = list.map(bone => bone?.quaternion.clone());
    SampleSpeakerGesture(g.record, g.spec.strokeS, g.q);
    list.forEach((bone, k) => { if (bone && !g.record.spine[k]) bone.quaternion.copy(g.q[k]); });
    clavicle.updateWorldMatrix(true, true);
    upper.getWorldPosition(S); hand.getWorldPosition(H);
    const dir = H.sub(S).normalize().applyQuaternion(clavicle.parent.getWorldQuaternion(Q).invert()).clone();
    list.forEach((bone, k) => { if (bone) bone.quaternion.copy(saved[k]); });
    clavicle.updateWorldMatrix(false, true);
    return dir;
  }

  _Start(row, speech, state) {
    const library = this.library;
    const modelId = this.rig.clipModelId || this.rig.modelId;
    const record = SpeakerGestureClip(modelId, row.gesture, library);
    if (!record) return this._Refuse(library ? "noClip" : (loadError ? "loadFailed" : "loading"));
    const actor = this.rig.actor;
    const armed = !!(actor?.weaponGroup?.visible && actor?.weaponData?.kind !== "melee");
    // The rifle hangs on the right hand: a right-hand clip needs an empty right hand.
    if (record.hand === "R" && armed) return this._Refuse("rightHandOnWeapon");
    const g = { row, spec: record.spec, record, lineId: speech.lineId, bones: this._Bones(record), q: [], q0: [],
      t: 0, holdS: 0, lineT: 0, stressed: false, lineOver: false, release: 1, releasing: false, beatAge: Infinity,
      strokeDir: null, twoHanded: record.hand === "L" && armed && !!actor?.weaponTwoHanded };
    SpeakerGestureFirstFrame(record, g.q0);
    // A target far outside the arm's cone (behind him, or well round on the other side) is not pointed at: the arm
    // would point somewhere else. The head layer still turns to the listener.
    if (g.spec.aim && this._OutOfReachDeg(g) > G.maxOutOfConeDeg) return this._Refuse("targetOutOfReach");
    if (g.spec.aim) g.strokeDir = this._StrokeDir(g);
    this.active = g;
    this.busyFade = SpeakerGestureBusy(this.rig, state, this.fireAge) ? 0 : 1;
    this.state.suppressed = null;
    return g;
  }

  _Refuse(reason) { this.state.suppressed = reason; return null; }

  /** How far (degrees of yaw, seen from the body) the row's target lies outside the arm's cone; 0 inside or unknown. */
  _OutOfReachDeg(g) {
    const root = this.rig.actor?.root || this.rig.root;
    const target = SpeakerGestureTargetPoint(g.row.target, { root, lookAt: this.head?.lookAt }, this.target);
    if (!target || !root) return 0;
    root.getWorldPosition(S); D.copy(target).sub(S).applyQuaternion(root.getWorldQuaternion(Q2).invert());
    const yaw = Math.atan2(-D.x, -D.z) * (g.record.hand === "L" ? 1 : -1) / DEG;
    return Math.max(0, yaw - G.coneOutDeg, -G.coneInDeg - yaw);
  }

  /** Clip weight: rises over [0, inS], 1 through the stroke and hold, falls over [outS, duration]. */
  _Envelope(g) {
    const s = g.spec, t = g.t;
    if (t < s.inS) return Smooth(t / Math.max(.01, s.inS));
    if (t > s.outS) return 1 - Smooth((t - s.outS) / Math.max(.01, g.record.duration - s.outS));
    return 1;
  }

  /** Advance the clip clock one frame; false when the gesture is over. `live`: its line is still being spoken. */
  _Advance(g, step, speech, live) {
    const s = g.spec, high = live && (speech.stress || 0) > .5, edge = high && !this.stressHigh;
    this.stressHigh = high;
    if (!live && !g.lineOver) {
      g.lineOver = true;
      // Line over before the release: play on when the release is close, else freeze and ease the arm back.
      if (g.t < s.outS && s.outS - g.t > G.maxTailS) g.releasing = true;
    }
    if (g.releasing) { g.release = Math.max(0, g.release - step / G.releaseS); return g.release > 0; }
    if (edge && !g.stressed) g.stressed = true;
    else if (edge && g.t >= s.strokeS) g.beatAge = 0;
    g.beatAge += step;
    // Lifted: wait for the first stressed syllable (at most stressWaitS of line time), then strike.
    const waitAt = Math.max(s.inS, s.strokeS - G.strokeLeadS);
    const lineT = g.lineT; g.lineT += step;
    if (!g.stressed && live && g.t >= waitAt && g.t < s.strokeS && lineT < G.stressWaitS) { g.t = waitAt; return true; }
    let next = g.t + step;
    if (g.t >= s.hold[0] && g.t < s.hold[1]) g.holdS += step;
    // The line goes on: repeat the hold window (it loops without a seam), at most maxHoldS in all.
    if (live && g.t < s.hold[1] && next >= s.hold[1] && g.holdS < G.maxHoldS) next = s.hold[0] + (next - s.hold[1]);
    g.t = next;
    return g.t < g.record.duration;
  }

  /** Before the head turn: pick up a new line, advance the clip, pose the arm and remember the rifle hold. */
  Apply(dt, state = {}) {
    this._Restore();
    this.held.on = false;
    const rig = this.rig, st = this.state, step = Math.max(0, dt || 0);
    this.fireAge = state.firing || state.fire > 0 ? 0 : this.fireAge + step;
    const speech = rig.facial?.lastSpeech || null;
    const lineId = speech?.active ? speech.lineId ?? null : null;
    if (!this.enabled || (this.head && this.head.enabled === false)) {
      this.active = null; st.weight = 0; st.clip = null; st.suppressed = "disabled"; this.lastLineId = lineId; return;
    }
    if (lineId && lineId !== this.lastLineId) {
      this.lastLineId = lineId;
      const row = SpeakerGestureForLine(lineId);
      // A new line while the last gesture is still up: that one eases back first, this one starts after it.
      if (row && (!speech.who || row.who === speech.who)) this.pending = { row, lineId };
      else if (!this.active) st.suppressed = null;
    } else if (!lineId) this.lastLineId = null;
    if (this.pending && this.active && this.active.lineId !== this.pending.lineId) {
      const old = this.active;
      if (!old.releasing && !old.lineOver) { old.lineOver = true; old.releasing = true; }
    }
    if (this.pending && !this.active) {
      const pending = this.pending; this.pending = null;
      if (pending.lineId === lineId) {
        this.stressHigh = false;
        if (this._Start(pending.row, speech, state)) st.lineId = lineId;
      }
    }
    const counter = lineId ? (this.lines[lineId] ||= { frames: 0, gestureFrames: 0, busyFrames: 0, maxWeight: 0, clip: null }) : null;
    if (counter) counter.frames++;
    const g = this.active;
    if (!g) { st.weight = 0; st.clip = null; st.phase = null; return; }
    const busy = SpeakerGestureBusy(rig, state, this.fireAge);
    // A shot while the arm is up ends this gesture: it fades out and does not come back after the shot (an arm
    // bobbing off and on the rifle at every shot reads worse than no gesture).
    if (busy === "firing" && g.t > 0 && this.busyFade > 0) g.cancelled = true;
    this.busyFade = busy || g.cancelled ? Math.max(0, this.busyFade - step / G.fadeS) : Math.min(1, this.busyFade + step / G.fadeS);
    st.busyFor = busy ? st.busyFor + step : 0;   // seconds busy in a row (tests: weight 0 after fadeS)
    const live = lineId === g.lineId;
    const End = phase => { this.active = null; st.weight = 0; st.clip = null; st.phase = phase; st.suppressed = busy; st.aimError = null; };
    if (g.cancelled && this.busyFade <= 0) return End("cancelled");
    // Busy when the line started: the clip waits unlifted and starts with its lift once the body is free, while the
    // line is still being said.
    if (g.t === 0 && this.busyFade <= 0 && busy) {
      if (!live) return End("missed");
      st.weight = 0; st.clip = g.record.name; st.phase = "waitFree"; st.suppressed = busy; st.aimError = null;
      if (counter) counter.busyFrames++;
      return;
    }
    if (!this._Advance(g, step, speech || {}, live)) { this.active = null; st.weight = 0; st.clip = null; st.phase = "done"; return; }
    const w = Clamp(this._Envelope(g) * this.busyFade * g.release, 0, 1);
    st.clip = g.record.name; st.hand = g.record.hand; st.t = +g.t.toFixed(3); st.weight = w;
    st.suppressed = busy; st.lineId = g.lineId;
    st.phase = g.releasing ? "release" : g.t < g.spec.inS ? "lift" : g.t < g.spec.strokeS ? "wait" : g.t <= g.spec.outS ? "hold" : "out";
    const own = g.lineId === lineId ? counter : (this.lines[g.lineId] ||= { frames: 0, gestureFrames: 0, busyFrames: 0, maxWeight: 0, clip: null });
    if (own) {
      own.clip = g.record.name; own.maxWeight = Math.max(own.maxWeight, w);
      if (w > .5) own.gestureFrames++;
      if (busy) own.busyFrames++;
    }
    if (w > .5) this.gestureFrames++;
    if (!(w > 1e-4)) { st.aimError = null; return; }
    this._Pose(g, w, state);
  }

  _Pose(g, w, state) {
    const rig = this.rig, { list } = g.bones;
    this.state.aimError = null; this.state.clamped = false;
    // Rifle: remember the left grip in the right grip's frame before the left arm moves.
    if (g.twoHanded) {
      const left = rig.Grip?.("weaponL"), right = rig.Grip?.("weaponR");
      if (left && right) {
        left.getWorldPosition(this.held.local); right.worldToLocal(this.held.local);
        this.held.socket = right; this.held.on = true;
      }
    }
    SampleSpeakerGesture(g.record, g.t, g.q);
    list.forEach((bone, k) => {
      if (!bone) return;
      this._Mark(bone);
      if (g.record.spine[k]) bone.quaternion.multiply(Q.copy(g.q0[k]).invert().multiply(g.q[k]).slerp(ID, 1 - w));
      else bone.quaternion.slerp(g.q[k], w);
    });
    (g.bones.clavicle || rig.root).updateWorldMatrix(true, true);
    ID.identity();
    this._Seal();
  }

  /**
   * Aimed clips: turn the upper arm so that shoulder -> hand points at the row's target (inside the cone). Runs after
   * the head turn: the Biped clavicles hang off the neck, so the head layer's neck yaw swings the arm (measured before
   * the turn, a point at the tank was 37 deg off on screen; 2026-09-25 browser test).
   */
  _Aim(g, w) {
    const rig = this.rig, { upper } = g.bones;
    this.state.aimError = null; this.state.clamped = false;
    if (g.strokeDir && upper?.parent && g.bones.clavicle?.parent) {
      const root = rig.actor?.root || rig.root;
      const target = SpeakerGestureTargetPoint(g.row.target, { root, lookAt: this.head?.lookAt }, this.target);
      if (target) {
        upper.getWorldPosition(S);
        D.copy(target).sub(S);
        if (D.lengthSq() > 1e-6) {
          // Clamp in the body's frame (front -Z, left -X): out = toward the gesture hand's side.
          root.getWorldQuaternion(Q2); D.applyQuaternion(Q.copy(Q2).invert());
          const side = g.record.hand === "L" ? 1 : -1;
          const yaw = Math.atan2(-D.x, -D.z) * side, pitch = Math.atan2(D.y, Math.hypot(D.x, D.z));
          const cy = Clamp(yaw, -G.coneInDeg * DEG, G.coneOutDeg * DEG) * side;
          let cp = Clamp(pitch, -G.coneDownDeg * DEG, G.coneUpDeg * DEG);
          // With a rifle up in the other hand, an arm pointing across the front goes over the barrel, not along it.
          this.state.clamped = Math.abs(cy - yaw * side) > 1e-3 || Math.abs(cp - pitch) > 1e-3;
          if (g.twoHanded && yaw < 0) cp = Math.max(cp, G.crossLiftDeg * DEG * Math.min(1, -yaw / (G.coneInDeg * DEG)));
          const aimDir = P.set(-Math.sin(cy) * Math.cos(cp), Math.sin(cp), -Math.cos(cy) * Math.cos(cp)).applyQuaternion(Q2);
          const stroke = H.copy(g.strokeDir).applyQuaternion(g.bones.clavicle.parent.getWorldQuaternion(Q));
          Q.setFromUnitVectors(stroke, aimDir); ID.identity(); Q.slerp(ID, 1 - Clamp(w * G.aimStrength, 0, 1));
          TurnWorld(upper, Q);
          const hand = g.bones.hand;
          // From the stroke on, take out what is left: the clip's stroke direction was measured once on this body,
          // the hold pose and a crouch or kneel differ from it by up to ~15 deg (2026-09-25 browser test).
          const settle = Clamp(w * G.aimStrength, 0, 1) * Smooth((g.t - g.spec.strokeS + .1) / .2);
          if (hand && settle > 0) {
            hand.getWorldPosition(H); upper.getWorldPosition(S); H.sub(S).normalize();
            Q.setFromUnitVectors(H, aimDir); ID.identity(); Q.slerp(ID, 1 - settle);
            TurnWorld(upper, Q);
            // A pointing arm is (nearly) straight: reach the hand out along the aim.
            const fore = g.bones.fore;
            if (g.spec.extend && fore) {
              upper.getWorldPosition(S); fore.getWorldPosition(P2); hand.getWorldPosition(H);
              const length = S.distanceTo(P2) + P2.distanceTo(H);
              ReachSpeakerGestureArm(upper, fore, hand, H, P2.copy(S).addScaledVector(aimDir, length * g.spec.extend), settle);
            }
          }
          if (hand) {
            hand.getWorldPosition(H); upper.getWorldPosition(S);
            D.copy(target).sub(S);
            this.state.aimError = +(H.sub(S).angleTo(D) / DEG).toFixed(1);
          }
        }
      }
    }
  }

  /**
   * Keep the gesturing hand off the rifle the other hand still holds: the rifle stays where the two-hand pose put
   * it (a crouched advance carries it across the chest), so a point or a chop toward the front can end on it (2.5 cm
   * from the receiver in the 2026-09-25 browser test). When the wrist or a finger root comes within rifleClearM of
   * the barrel line, the whole arm is turned up (down, if the rifle is above the hand) about the shoulder until it
   * clears. The actor places the rifle after this layer runs: on an infantry clip it copies this frame's rifle prop
   * helper (already sampled), otherwise the rifle's pose from the last frame is used; with the rifle up the actor's
   * aim IK then turns it again, and AfterActorAim clears against where it really ended (`placed`).
   */
  _ClearRifle(g, placed = false) {
    const rig = this.rig, group = rig.actor?.weaponGroup, { upper, hand, roots } = g.bones;
    if (!group?.isObject3D || !group.visible || !upper || !hand) return;
    const prop = !placed && (rig.infantryPropWeight || 0) > .5 ? rig.infantryProps?.rifle : null;
    const rifle = prop?.isObject3D ? prop : group;
    rifle.updateWorldMatrix(true, false);
    rifle.getWorldPosition(P2); AX.set(0, 0, -1).transformDirection(rifle.matrixWorld);
    for (let pass = 0; pass < 2; pass++) {
      let near = Infinity, below = true;
      for (const bone of [hand, ...roots]) {
        bone.getWorldPosition(D).sub(P2);
        const u = Clamp(D.dot(AX), -.35, .9);
        S.copy(AX).multiplyScalar(u); const d = D.distanceTo(S);
        if (d < near) { near = d; below = D.y >= S.y - .02; }
      }
      if (!(near < G.rifleClearM)) return;
      upper.getWorldPosition(S); hand.getWorldPosition(H); H.sub(S);
      const reach = Math.max(.2, H.length());
      D.crossVectors(H.normalize(), P.set(0, 1, 0));
      if (D.lengthSq() < 1e-6) return;
      this._Mark(upper);
      TurnWorld(upper, Q.setFromAxisAngle(D.normalize(), (below ? 1 : -1) * Math.min(G.rifleClearMaxDeg * DEG, (G.rifleClearM - near + .01) / reach)));
      this.state.rifleLift = (this.state.rifleLift || 0) + 1;
    }
  }

  /** A further stress in the hold: dip the forearm about the body's right axis (after the aim, so it shows). */
  _Beat(g, w) {
    const rig = this.rig, fore = g.bones.fore;
    if (!fore?.parent || !(g.beatAge < G.beatS)) return;
    this._Mark(fore);
    const root = rig.actor?.root || rig.root;
    AX.set(1, 0, 0).applyQuaternion(root.getWorldQuaternion(Q2));
    TurnWorld(fore, Q.setFromAxisAngle(AX, -G.beatRadians * Math.sin(Math.PI * g.beatAge / G.beatS) * w));
  }

  /** After the head turn: a reach clip (the cigarette to the lips) re-aims the arm at the live head. */
  AfterHead() {
    const g = this.active;
    if (g && this.state.weight > 1e-4) {
      if (g.spec.aim) { if (g.bones.upper) this._Mark(g.bones.upper); this._Aim(g, this.state.weight); }
      this._Beat(g, this.state.weight);
      if (g.twoHanded) this._ClearRifle(g);
    }
    if (g?.spec.reach && this.state.weight > 1e-4) {
      const s = g.spec, t = g.t, { upper, fore, hand, roots } = g.bones;
      const anchor = SpeakerGestureAnchor(this.rig.clipModelId || this.rig.modelId, s.reach);
      const head = this.rig.bones?.head;
      const w = Math.min(Math.max(0, (t - s.inS) / Math.max(.01, s.strokeS - s.inS)), 1, Math.max(0, 1 - (t - s.outS) / .15))
        * this.busyFade * g.release;
      if (anchor && head && upper && fore && hand && w > 0) {
        for (const bone of [upper, fore, hand]) this._Mark(bone);
        this.state.reachError = +ReachSpeakerGestureAnchor(upper, fore, hand, roots, head, anchor, w).toFixed(3);
      }
    }
    this._Seal();
  }

  /** Script_Actor._ApplyRiggedAim, after its arms are solved: keep the gesturing hand off the rifle where it ended. */
  AfterActorAim() {
    const g = this.active;
    if (g?.twoHanded && this.state.weight > 1e-4) this._ClearRifle(g, true);
  }

  /**
   * Script_Actor._ApplyRiggedAim: how much of the aim IK on this arm to give back to the gesture (its upper arm
   * bone; 0 when this layer is not gesturing with it). The rifle aim correction then turns the right arm and the
   * rifle only; the pointing arm keeps the direction it was aimed at.
   */
  ArmWeight(upperArm) {
    const g = this.active;
    return g && upperArm && g.bones.upper === upperArm ? this.state.weight : 0;
  }

  /**
   * The rifle's left grip for Script_Actor._UpdateRiggedWeaponMount while a left-hand gesture has moved the left
   * hand: where the left grip was before the gesture, carried by the right grip (so the rifle keeps its pose in
   * the right hand, neck turn included). Returns false when the actor should use its own socket.
   */
  HeldLeftGrip(out) {
    if (!this.held.on || !this.held.socket) return false;
    this.held.socket.updateWorldMatrix(true, false);
    out.copy(this.held.local); this.held.socket.localToWorld(out);
    return true;
  }

  Dispose() { this._Restore(); this.active = null; this.pending = null; this.held.on = false; this.bound.clear(); }
}
