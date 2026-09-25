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

// World providers set by the mission runtime (one line): the live tank, the ground height and a ray against the
// level's walls. Without them a tank line points the clip's own direction, ground anchors sit at the speaker's feet
// height and nothing is checked against walls.
const world = { tank: null, ground: null, ray: null };
/**
 * { tank: () => {x, z, y?} | null, ground: (x, z) => y, ray: (origin, unitDir, maxDist) => distance to the first wall
 * along it | null } (any may be omitted). The mission runtime sets them when it is built and calls
 * SetSpeakerGestureWorld({}) in Dispose, so the closures do not keep a disposed level alive.
 */
export function SetSpeakerGestureWorld({ tank = null, ground = null, ray = null } = {}) { world.tank = tank; world.ground = ground; world.ray = ray; }

// Walls (world.ray). A pointing arm aimed through a wall would come out on the other side of it (2026-09-26 relay r2
// acceptance: BundleAttack_01_Close read as Luo's arm in the ammo house wall; measured, the arm was 0.7 m off it and
// the test camera in the doorway had the jamb's corner in front of the hand, but nothing checked it either way).
const UP = new Vector3(0, 1, 0), WDIR = new Vector3(), BF = new Vector3(), WSEG = new Vector3(), SH = new Vector3(), WA = new Vector3(), TIP = new Vector3();
/** Something of the world within `length` + wallPadM of `origin` along the unit `dir`. */
function WallRay(origin, dir, length) {
  const t = world.ray(origin, dir, length + G.wallPadM);
  return Number.isFinite(t);
}
function WallSegment(a, b) {
  WSEG.copy(b).sub(a); const length = WSEG.length();
  return length > 1e-4 && WallRay(a, WSEG.multiplyScalar(1 / length), length);
}

// Fetched once; a failed fetch is tried again by the next line that asks for a clip (a new line, not every frame).
let loadStarted = false, loadError = null;
function EnsureLoaded() {
  if (loadStarted || typeof location === "undefined") return;
  loadStarted = true; loadError = null;
  LoadSpeakerGestureClips().catch(error => {
    loadError = String(error?.message || error); loadStarted = false;
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
    return out.set(point.x, Ground(point.x, point.z, feet) + (G.pointRiseByTarget?.[name] ?? G.pointRiseM), point.z);
  }
  if (spec === "south") return out.set(base.x, feet + (G.pointRiseByTarget?.[name] ?? G.pointRiseM), base.z + G.southM);
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
  if ((state.woundedWalk || 0) > G.maxWoundedWalk) return "wounded";
  if ((state.prone || 0) > G.maxProne) return "prone";
  if ((state.moveSpeed || 0) > G.maxMoveSpeed) return "moving";
  return null;
}

const P = new Vector3(), P2 = new Vector3(), D = new Vector3(), S = new Vector3(), H = new Vector3(), AX = new Vector3();
const Q = new Quaternion(), Q2 = new Quaternion(), WQ = new Quaternion(), PQ = new Quaternion(), ID = new Quaternion();
const RO = new Vector3(), RA = new Vector3(), TW = new Vector3();

// World position from a matrixWorld known to be fresh (getWorldPosition recomputes the whole parent chain each call;
// AfterHead and AfterActorAim refresh the arm once from the clavicle and TurnWorld keeps the turned subtree fresh).
const WP = (bone, out) => out.setFromMatrixPosition(bone.matrixWorld);
const SCALE = new Vector3();
/** Turn `bone` by a world rotation; reads the bone's and its parent's matrixWorld, which must be fresh (see WP). */
function TurnWorld(bone, rotation) {
  bone.matrixWorld.decompose(TW, WQ, SCALE); bone.parent.matrixWorld.decompose(TW, PQ, SCALE); PQ.invert();
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
    this.aimDir = new Vector3();
    this.pending = null;                // { row, lineId } to start once the current gesture is released
    // Start fetching the clips when the first 01-06 speaker is bound (03 is minutes later); not in node tests.
    if (typeof location !== "undefined") EnsureLoaded();
    // Probe state (FRONT_ACTING, tests). lines[lineId] = { frames, gestureFrames, busyFrames, maxWeight, clip }.
    // aimYaw / aimPitch: the target seen from the shoulder (degrees, body frame, yaw + toward the gesture hand's side);
    // crossLift: the point was raised over the rifle; wallTurn: degrees the aim was turned off a wall; wallBlocked: no
    // clear direction near the target this frame (the arm eases back); wallHit: the posed arm reached a wall this
    // frame (the arm eases back); wallFallback: the point was swapped for the unaimed beat at the start.
    this.state = { clip: null, lineId: null, weight: 0, t: 0, phase: null, aimError: null, solveError: null, aimDir: null, clamped: false, alongLift: false,
      suppressed: null, hand: null, busyFor: 0, aimYaw: null, aimPitch: null, crossLift: false, wallTurn: 0, wallBlocked: false, wallHit: false,
      wallFallback: false };
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
        roots: [1, 2, 3, 4].map(i => find("finger" + i)).filter(Boolean), armM: G.wallArmM };
      // Shoulder to wrist (the bones' lengths do not change): the reach checked against walls.
      if (bones.upper && bones.fore && bones.hand) {
        const a = bones.upper.getWorldPosition(new Vector3()), b = bones.fore.getWorldPosition(new Vector3()), c = bones.hand.getWorldPosition(new Vector3());
        const length = a.distanceTo(b) + b.distanceTo(c);
        if (length > .2 && length < 1.2) bones.armM = length;
      }
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
    this.state.wallFallback = false;
    if (!record) {
      if (!library) EnsureLoaded();       // a fetch that failed earlier is tried again here
      return this._Refuse(library ? "noClip" : (loadError ? "loadFailed" : "loading"));
    }
    const actor = this.rig.actor;
    const armed = !!(actor?.weaponGroup?.visible && actor?.weaponData?.kind !== "melee");
    // The rifle hangs on the right hand: a right-hand clip needs an empty right hand.
    if (record.hand === "R" && armed) return this._Refuse("rightHandOnWeapon");
    const Make = clip => {
      const made = { row, spec: clip.spec, record: clip, lineId: speech.lineId, bones: this._Bones(clip), q: [], q0: [],
        t: 0, holdS: 0, lineT: 0, stressed: false, lineOver: false, release: 1, releasing: false, releaseS: G.releaseS, beatAge: Infinity,
        strokeDir: null, lastAim: null, wallTurn: 0, twoHanded: clip.hand === "L" && armed && !!actor?.weaponTwoHanded };
      SpeakerGestureFirstFrame(clip, made.q0);
      return made;
    };
    let g = Make(record);
    // A target far outside the arm's cone (behind him, or well round on the other side) is not pointed at: the arm
    // would point somewhere else. With a rifle up in the other hand the limit across the front is tighter: the arm
    // clamped there and lifted over the barrel ends in front of the face. The head layer still turns to the listener.
    if (g.spec.aim) {
      const yaw = this._TargetYawDeg(g);
      if (yaw != null && Math.max(0, yaw - G.coneOutDeg, -G.coneInDeg - yaw) > G.maxOutOfConeDeg) return this._Refuse("targetOutOfReach");
      if (yaw != null && g.twoHanded && -G.coneInDeg - yaw > G.maxCrossOutDeg) return this._Refuse("targetAcrossRifle");
      g.strokeDir = this._StrokeDir(g);
      // A wall along every direction near the target (within the arm's reach): an unaimed beat instead of a point
      // (the one-handed clips only; a right-hand aimed clip has no unaimed stand-in and is not made).
      if (world.ray && g.strokeDir && !this._WallFreeAim(g)) {
        const beat = record.hand === "L" ? SpeakerGestureClip(modelId, G.wallFallbackClip, library) : null;
        if (!beat) return this._Refuse("wall");
        g = Make(beat); this.state.wallFallback = true;
      }
    }
    this.active = g;
    this.busyFade = SpeakerGestureBusy(this.rig, state, this.fireAge) ? 0 : 1;
    this.state.suppressed = null;
    return g;
  }

  _Refuse(reason) { this.state.suppressed = reason; return null; }

  /** The row's target seen from the body: degrees of yaw off his front, + toward the gesture hand's side (out), - across
   * the chest (in); null when there is no target now. */
  _TargetYawDeg(g) {
    const root = this.rig.actor?.root || this.rig.root;
    const target = SpeakerGestureTargetPoint(g.row.target, { root, lookAt: this.head?.lookAt }, this.target);
    if (!target || !root) return null;
    root.getWorldPosition(S); D.copy(target).sub(S).applyQuaternion(root.getWorldQuaternion(Q2).invert());
    return Math.atan2(-D.x, -D.z) * (g.record.hand === "L" ? 1 : -1) / DEG;
  }

  /** The rifle held in the other hand as origin RO and barrel direction RA (world); false when there is none. Before
   * the actor places it (`placed` false) an infantry clip's rifle prop helper is this frame's pose. */
  _RifleLine(placed) {
    const rig = this.rig, group = rig.actor?.weaponGroup;
    if (!group?.isObject3D || !group.visible) return false;
    const prop = !placed && (rig.infantryPropWeight || 0) > .5 ? rig.infantryProps?.rifle : null;
    const rifle = prop?.isObject3D ? prop : group;
    rifle.updateWorldMatrix(true, false);
    WP(rifle, RO); RA.set(0, 0, -1).transformDirection(rifle.matrixWorld);
    return true;
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
    if (g.releasing) { g.release = Math.max(0, g.release - step / g.releaseS); return g.release > 0; }
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
    this.step = step;                    // AfterHead's frame time (the wall turn's ease)
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
        // Clips still on the way (a cold start at 03): try again next frame while the line lasts, not drop it.
        else if (st.suppressed === "loading") this.pending = pending;
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
    this.state.aimError = null; this.state.solveError = null; this.state.aimDir = null; this.state.clamped = false; this.state.alongLift = false;
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
    ID.identity();
    this._Seal();
  }

  /**
   * The direction (world, into `out`) the arm is aimed from `shoulder` at `target`: clamped into the cone around the
   * body's front, raised over the rifle held up in the other hand when it points across the front (crossLift) and off
   * the barrel line when it points along it (alongLift). Leaves the body's world rotation in Q2 and sets the state's
   * clamped / alongLift / crossLift / aimYaw / aimPitch.
   */
  _AimDirection(g, target, shoulder, out) {
    const st = this.state, root = this.rig.actor?.root || this.rig.root;
    // Clamp in the body's frame (front -Z, left -X): out = toward the gesture hand's side.
    D.copy(target).sub(shoulder);
    root.getWorldQuaternion(Q2); D.applyQuaternion(Q.copy(Q2).invert());
    const side = g.record.hand === "L" ? 1 : -1;
    const yaw = Math.atan2(-D.x, -D.z) * side, pitch = Math.atan2(D.y, Math.hypot(D.x, D.z));
    const cy = Clamp(yaw, -G.coneInDeg * DEG, G.coneOutDeg * DEG) * side;
    let cp = Clamp(pitch, -G.coneDownDeg * DEG, G.coneUpDeg * DEG);
    st.aimYaw = +(yaw / DEG).toFixed(1); st.aimPitch = +(pitch / DEG).toFixed(1);
    // With a rifle up in the other hand, an arm pointing across the front goes over the barrel, not along it.
    st.clamped = Math.abs(cy - yaw * side) > 1e-3 || Math.abs(cp - pitch) > 1e-3;
    const unlifted = cp;
    if (g.twoHanded && yaw < 0) cp = Math.max(cp, G.crossLiftDeg * DEG * Math.min(1, -yaw / (G.coneInDeg * DEG)));
    st.crossLift = cp > unlifted + 1e-3;
    out.set(-Math.sin(cy) * Math.cos(cp), Math.sin(cp), -Math.cos(cy) * Math.cos(cp)).applyQuaternion(Q2);
    // Along the rifle held up in the other hand: raise the point off the barrel line (or lower it, when the
    // target is below the barrel), so it does not read as a second man aiming.
    st.alongLift = false;
    if (g.twoHanded && this._RifleLine(false) && out.angleTo(RA) < G.alongRifleDeg * DEG) {
      const riflePitch = Math.asin(Clamp(RA.y, -1, 1));
      cp = cp >= riflePitch ? Math.max(cp, riflePitch + G.alongLiftDeg * DEG) : Math.min(cp, riflePitch - G.alongLiftDeg * DEG);
      cp = Clamp(cp, -G.coneDownDeg * DEG, G.coneUpDeg * DEG);
      out.set(-Math.sin(cy) * Math.cos(cp), Math.sin(cp), -Math.cos(cy) * Math.cos(cp)).applyQuaternion(Q2);
      st.alongLift = true;
    }
    return out;
  }

  /**
   * Walls (world.ray): true when the arm can point along `aimDir`, turned (in place) about the vertical toward the
   * body's front (`bodyQ`) as far as a wall beside it needs; false when no direction is clear. A direction is clear
   * when shoulder -> fingertips along it and along it turned wallMarginDeg further toward the wall are (the posed arm
   * bends: the forearm and the pointing hand end a little outside the straight line). The turn is searched in
   * wallStepDeg steps, at most wallMaxTurnDeg, never past the cone's `in` edge and never more than wallMaxOffTargetDeg
   * off the target (further off it points somewhere else). With `g` held across frames (g.wallTurn) the turn goes up
   * at once when a wall needs more and comes back at wallEaseDegS when it needs less (no 5-10 deg pops from frame to
   * frame as the shoulder rises with the lift); state.wallTurn is the turn used.
   */
  _WallAim(g, shoulder, aimDir, target, bodyQ, dt = 0) {
    this.state.wallTurn = 0;
    if (!world.ray) return true;
    const reach = g.bones.armM + G.wallHandM;
    const side = g.record.hand === "L" ? 1 : -1;
    const front = BF.set(0, 0, -1).applyQuaternion(bodyQ);
    const turn = Math.sign(aimDir.z * front.x - aimDir.x * front.z) || side;
    D.copy(target).sub(shoulder);
    Q.copy(bodyQ).invert();
    // turn (degrees toward the front) -> WDIR; false when that turn is out of bounds
    const Turned = deg => {
      WDIR.copy(aimDir).applyAxisAngle(UP, turn * deg * DEG);
      BF.copy(WDIR).applyQuaternion(Q);
      return deg === 0 || (Math.atan2(-BF.x, -BF.z) * side >= -G.coneInDeg * DEG - 1e-6 && WDIR.angleTo(D) <= G.wallMaxOffTargetDeg * DEG);
    };
    const Clear = () => !WallRay(shoulder, WDIR, reach)
      && !WallRay(shoulder, WSEG.copy(WDIR).applyAxisAngle(UP, -turn * G.wallMarginDeg * DEG), reach);
    let need = -1;
    for (let deg = 0; deg <= G.wallMaxTurnDeg + 1e-6; deg += G.wallStepDeg) {
      if (!Turned(deg)) break;
      if (Clear()) { need = deg; break; }
    }
    if (need < 0) { g.wallTurn = 0; return false; }
    let use = need;
    if (g.wallTurn > need) {
      use = Math.max(need, g.wallTurn - G.wallEaseDegS * dt);
      if (use > need && !(Turned(use) && Clear())) use = need;
    }
    g.wallTurn = use;
    Turned(use); aimDir.copy(WDIR);
    this.state.wallTurn = +use.toFixed(1);
    return true;
  }

  /** _Start: whether the point can be made without a wall in the arm's way (the aim as the first posed frame makes it). */
  _WallFreeAim(g) {
    const root = this.rig.actor?.root || this.rig.root;
    const target = SpeakerGestureTargetPoint(g.row.target, { root, lookAt: this.head?.lookAt }, this.target);
    if (!target || !g.bones.upper) return true;
    g.bones.upper.getWorldPosition(SH);
    if (target.distanceToSquared(SH) <= 1e-6) return true;
    return this._WallAim(g, SH, this._AimDirection(g, target, SH, WA), target, Q2);
  }

  /** Shoulder -> elbow -> wrist -> fingertips of the posed gesture arm reaches a wall (matrixWorld fresh). */
  _ArmInWall(g) {
    const { upper, fore, hand } = g.bones;
    if (!world.ray || !upper || !fore || !hand) return false;
    WP(upper, SH); WP(fore, WA); WP(hand, TIP);
    if (WallSegment(SH, WA) || WallSegment(WA, TIP)) return true;
    WA.subVectors(TIP, WA);
    return WA.lengthSq() > 1e-8 && WallRay(TIP, WA.normalize(), G.wallHandM);
  }

  /** A wall in the arm's way: the arm eases back to the body over wallReleaseS (the line may go on). */
  _WallRelease(g) {
    if (!g.releasing) { g.lineOver = true; g.releasing = true; }
    g.releaseS = Math.min(g.releaseS, G.wallReleaseS);
  }

  /**
   * Aimed clips: turn the upper arm so that shoulder -> hand points at the row's target (inside the cone). Runs after
   * the head turn: the Biped clavicles hang off the neck, so the head layer's neck yaw swings the arm (measured before
   * the turn, a point at the tank was 37 deg off on screen; 2026-09-25 browser test).
   */
  _Aim(g, w) {
    const rig = this.rig, { upper } = g.bones;
    this.state.aimError = null; this.state.solveError = null; this.state.aimDir = null; this.state.clamped = false; this.state.alongLift = false;
    this.state.crossLift = false; this.state.wallTurn = 0; this.state.wallBlocked = false;
    if (g.strokeDir && upper?.parent && g.bones.clavicle?.parent) {
      const root = rig.actor?.root || rig.root;
      const target = SpeakerGestureTargetPoint(g.row.target, { root, lookAt: this.head?.lookAt }, this.target);
      if (target) {
        WP(upper, S);
        D.copy(target).sub(S);
        if (D.lengthSq() > 1e-6) {
          const aimDir = this._AimDirection(g, target, S, P);
          // Walls: turned off a wall toward the front; no clear direction near the target (the body walked up to a
          // wall mid-line): the last clear aim is held and the arm eases back.
          if (this._WallAim(g, S, aimDir, target, Q2, this.step)) (g.lastAim ||= new Vector3()).copy(aimDir);
          else {
            this.state.wallBlocked = true;
            if (g.lastAim) aimDir.copy(g.lastAim);
            this._WallRelease(g);
          }
          g.bones.clavicle.parent.matrixWorld.decompose(P2, Q, SCALE);
          const stroke = H.copy(g.strokeDir).applyQuaternion(Q);
          Q.setFromUnitVectors(stroke, aimDir); ID.identity(); Q.slerp(ID, 1 - Clamp(w * G.aimStrength, 0, 1));
          TurnWorld(upper, Q);
          const hand = g.bones.hand;
          // From the stroke on, take out what is left: the clip's stroke direction was measured once on this body,
          // the hold pose and a crouch or kneel differ from it by up to ~15 deg (2026-09-25 browser test).
          const settle = Clamp(w * G.aimStrength, 0, 1) * Smooth((g.t - g.spec.strokeS + G.settleLeadS) / G.settleS);
          if (hand && settle > 0) {
            WP(hand, H); WP(upper, S); H.sub(S).normalize();
            Q.setFromUnitVectors(H, aimDir); ID.identity(); Q.slerp(ID, 1 - settle);
            TurnWorld(upper, Q);
            // A pointing arm is (nearly) straight: reach the hand out along the aim.
            const fore = g.bones.fore;
            if (g.spec.extend && fore) {
              WP(upper, S); WP(fore, P2); WP(hand, H);
              const length = S.distanceTo(P2) + P2.distanceTo(H);
              ReachSpeakerGestureArm(upper, fore, hand, H, P2.copy(S).addScaledVector(aimDir, length * g.spec.extend), settle);
            }
          }
          if (hand) {
            // aimError: shoulder -> hand against the target; solveError: against the direction aimed at (the target
            // moved into the cone and off the rifle line, see clamped / alongLift; aimDir, world).
            WP(hand, H); WP(upper, S);
            D.copy(target).sub(S); H.sub(S);
            this.state.aimError = +(H.angleTo(D) / DEG).toFixed(1);
            this.state.solveError = +(H.angleTo(aimDir) / DEG).toFixed(1);
            this.state.aimDir = this.aimDir.copy(aimDir);
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
    const { upper, hand, roots } = g.bones;
    if (!upper || !hand || !this._RifleLine(placed)) return;
    for (let pass = 0; pass < 2; pass++) {
      let near = Infinity, below = true;
      for (const bone of [hand, ...roots]) {
        WP(bone, D).sub(RO);
        const u = Clamp(D.dot(RA), -G.rifleBehindM, G.rifleAheadM);
        S.copy(RA).multiplyScalar(u); const d = D.distanceTo(S);
        if (d < near) { near = d; below = D.y >= S.y - G.rifleBelowM; }
      }
      if (!(near < G.rifleClearM)) return;
      WP(upper, S); WP(hand, H); H.sub(S);
      const reach = Math.max(G.rifleMinReachM, H.length());
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
    this.state.wallHit = false;
    if (g && this.state.weight > 1e-4) {
      g.bones.clavicle?.updateWorldMatrix(true, true);   // after the head turn: once, for WP below
      if (g.spec.aim) { if (g.bones.upper) this._Mark(g.bones.upper); this._Aim(g, this.state.weight); }
      this._Beat(g, this.state.weight);
      if (g.twoHanded) this._ClearRifle(g);
      // Whatever the clip (an unaimed one too): the posed arm in a wall eases back.
      if (this._ArmInWall(g)) { this.state.wallHit = true; this._WallRelease(g); }
    }
    if (g?.spec.reach && this.state.weight > 1e-4) {
      const s = g.spec, t = g.t, { upper, fore, hand, roots } = g.bones;
      const anchor = SpeakerGestureAnchor(this.rig.clipModelId || this.rig.modelId, s.reach);
      const head = this.rig.bones?.head;
      const w = Math.min(Math.max(0, (t - s.inS) / Math.max(.01, s.strokeS - s.inS)), 1, Math.max(0, 1 - (t - s.outS) / G.reachFadeS))
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
    if (!(g?.twoHanded && this.state.weight > 1e-4)) return;
    g.bones.clavicle?.updateWorldMatrix(true, true);     // the actor set the arm's local rotations
    this._ClearRifle(g, true);
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
