import * as THREE from 'three';
import { CHARACTER_SPEECH as C } from './Data_Tuning_CharacterSpeech.mjs';
import { CharacterFaceBlood } from './Script_CharacterFaceBlood.mjs';

// Face-only layer on the Face_* bones baked by _import/Script_BakeCharacterFacial.py.
// Runs after the body mixer and never replaces body clips. Every pose is stored as
// a delta from Rest in the bone's parent (Head-local) frame and blended additively:
//   jaw*Open + wide*Wide + round*Round + close*Close + blink*Blink + brow*BrowUp
//   + snarl*Snarl + shock*Shock + pain*Pain + shout*Shout + grit*Grit + dead*DeadSlack
// A speech sample is either a baked face track {jaw, wide, round, close, stress}
// or, as fallback, the runtime envelope {level, brightness}.
// Acting expressions (01-03 storyboard contract section 4.2) are targets in
// this.expression {snarl, shock, pain, shout, grit} (0-1), eased by
// Data_Tuning_CharacterSpeech.expressionBlendS; speech is layered on top of them
// and keeps opening and shutting the jaw (expressionTalkJawYield).
const POSES = ['Open', 'Wide', 'Round', 'Close', 'Blink', 'BrowUp', 'Snarl', 'Shock', 'Pain', 'Shout', 'Grit', 'DeadSlack'];
export const FACIAL_EXPRESSIONS = Object.freeze(['snarl', 'shock', 'pain', 'shout', 'grit']);
const EXPRESSION_POSE = Object.freeze({ snarl: 'Snarl', shock: 'Shock', pain: 'Pain', shout: 'Shout', grit: 'Grit' });
const EXPRESSION_POSES = new Set(Object.values(EXPRESSION_POSE));
const ZeroExpression = () => Object.fromEntries(FACIAL_EXPRESSIONS.map(name => [name, 0]));
const Clamp01 = value => Math.min(1, Math.max(0, value));
const Smooth = (e0, e1, x) => { const t = Clamp01((x - e0) / (e1 - e0)); return t * t * (3 - 2 * t); };
const Approach = (value, target, dt, riseS, fallS) =>
  value + (target - value) * (1 - Math.exp(-Math.max(0, dt) / Math.max(1e-4, target > value ? riseS : fallS)));
const DEG = Math.PI / 180;

function Random(seed) {
  let a = (Math.imul(Number(seed) | 0, 2654435761) ^ 0x9e3779b9) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class CharacterFacialAnimation {
  constructor(root, definition, { seed = 0 } = {}) {
    this.source = null;       // () => speech sample | null (set by the speaker binder)
    this.gaze = null;         // THREE.Vector3 | () => THREE.Vector3 | null (world point)
    this.root = root;
    // Acting expression targets (0-1), writable as a whole or through SetExpression.
    this.expression = ZeroExpression();
    this.expressionWeights = ZeroExpression(); // eased weights actually applied
    this.expressionBlend = {};                  // per-expression blend seconds from SetExpression
    this.talk = 0;                              // 0-1: eased "this face is speaking"
    this.faceBlood = null;                      // CharacterFaceBlood, made on first use
    this.random = Random(seed);
    this.time = 0; this.lastSpeech = null; this.speaking = false;
    this.jaw = 0; this.wide = 0; this.round = 0; this.close = 0; this.brow = 0; this.stress = 0;
    this.level = 0; // kept for older probes: the current jaw weight
    this.blinkAge = -1; this.nextBlinkS = this._BlinkGap(); this.pendingBlinkS = -1;
    this.dead = 0; this.stressHigh = false; this.lineKey = null;
    this.yaw = 0; this.pitch = 0; this.saccade = new THREE.Vector2(); this.nextSaccadeS = 1;
    this.weights = Object.fromEntries(POSES.map(p => [p, 0]));
    const rest = definition.poses.Rest;
    this.controls = definition.bones.map(name => {
      const bone = root.getObjectByName(name);
      if (!bone) throw new Error(`Missing facial bone ${name}`);
      const position = rest?.[name] ? new THREE.Vector3().fromArray(rest[name].translation) : bone.position.clone();
      const quaternion = rest?.[name] ? new THREE.Quaternion().fromArray(rest[name].rotation) : bone.quaternion.clone();
      const inverse = quaternion.clone().invert();
      const deltas = [];
      for (const pose of POSES) {
        const data = definition.poses[pose]?.[name];
        if (!data) continue;
        const dp = new THREE.Vector3().fromArray(data.translation).sub(position);
        const dq = inverse.clone().multiply(new THREE.Quaternion().fromArray(data.rotation));
        const moves = dp.lengthSq() > 1e-12, turns = 1 - Math.abs(dq.w) > 1e-9;
        if (moves || turns) deltas.push({ pose, dp: moves ? dp : null, dq: turns ? dq : null, expression: EXPRESSION_POSES.has(pose) });
      }
      return { name, bone, position, quaternion, deltas, jaw: name === 'Face_Jaw' };
    });
    this.poses = new Set(POSES.filter(pose => definition.poses[pose]));
    const eyes = definition.eyes;
    this.eyes = (eyes?.bones || []).map(name => root.getObjectByName(name)).filter(Boolean).map(bone => ({
      bone, rest: bone.quaternion.clone(), position: bone.position.clone(),
    }));
    this.eyeAxes = eyes ? {
      yaw: new THREE.Vector3().fromArray(eyes.yawAxis || [1, 0, 0]).normalize(),
      pitch: new THREE.Vector3().fromArray(eyes.pitchAxis || [0, 0, 1]).normalize(),
      forward: new THREE.Vector3().fromArray(eyes.forward || [0, 1, 0]).normalize(),
    } : null;
    this._q = new THREE.Quaternion(); this._qa = new THREE.Quaternion(); this._qb = new THREE.Quaternion();
    this._p = new THREE.Vector3(); this._target = new THREE.Vector3(); this._id = new THREE.Quaternion();
  }

  _BlinkGap() { return C.blinkMinS + (C.blinkMaxS - C.blinkMinS) * this.random(); }

  /** Start a blink now unless one is running. */
  Blink() { if (this.blinkAge < 0) this.blinkAge = 0; }

  /**
   * Set some expression targets (0-1); the others keep theirs. blendS, when given,
   * is the time for a full 0 -> 1 swing of the named expressions (0 = snap);
   * otherwise they ease over Data_Tuning_CharacterSpeech.expressionBlendS.
   */
  SetExpression(partial = {}, blendS) {
    // A whole object assigned to rig.facial.expression may be partial or frozen: own a full copy.
    this.expression = { ...ZeroExpression(), ...(this.expression && typeof this.expression === 'object' ? this.expression : {}) };
    for (const [name, value] of Object.entries(partial || {})) {
      if (!EXPRESSION_POSE[name]) throw new Error(`Unknown facial expression "${name}" (${FACIAL_EXPRESSIONS.join(', ')})`);
      this.expression[name] = Clamp01(Number(value) || 0);
      if (Number.isFinite(blendS)) this.expressionBlend[name] = Math.max(0, blendS);
      else delete this.expressionBlend[name];
    }
    return this;
  }

  /** Blood on this face, 0-1 (Script_CharacterFaceBlood). Returns whether a head surface took it. */
  SetFaceBlood(amount) {
    this.faceBlood ||= new CharacterFaceBlood(this.root);
    return this.faceBlood.Set(amount);
  }

  /** Make the blood materials now (amount 0) so the first SetFaceBlood does not link a program mid-scene. */
  PrepareFaceBlood() {
    this.faceBlood ||= new CharacterFaceBlood(this.root);
    return this.faceBlood.Prepare();
  }

  Update(dt, state = {}) {
    const step = Math.max(0, dt || 0); this.time += step;
    const dead = !!state.dead || state.dying > 0;
    const speech = dead ? null : (state.speech ?? this.source?.() ?? null);
    const active = !!speech?.active;
    this.lastSpeech = active ? speech : null;
    // Targets: baked face track channels, else the envelope fallback.
    let jaw = 0, wide = 0, round = 0, close = 0, stress = 0;
    if (active) {
      if (Number.isFinite(speech.jaw)) {
        jaw = speech.jaw; wide = speech.wide || 0; round = speech.round || 0; close = speech.close || 0;
        stress = speech.stress || 0;
      } else {
        const level = speech.level || 0, bright = Smooth(C.fallbackWideFrom, C.fallbackWideTo, speech.brightness || 0);
        jaw = level; wide = level * bright; round = level * (1 - bright) * C.fallbackRoundScale;
        // No baked stress: a sharp opening from near-closed counts as one.
        stress = speech.stress ?? (level > C.fallbackStressLevel && this.jaw < C.fallbackStressFrom ? 1 : 0);
      }
      jaw = Math.min(C.maximumOpen, Clamp01(jaw));
      // Line starts get a natural blink sometimes.
      const key = `${speech.cue ?? ''}|${speech.line ?? ''}`;
      if (!this.speaking || key !== this.lineKey) {
        if (this.random() < C.blinkAtLineStartChance) this.Blink();
        this.lineKey = key;
      }
    } else if (!dead) {
      // Closed mouth, slow breathing drift.
      const breath = .5 + .5 * Math.sin(this.time * 2 * Math.PI / C.breathPeriodS);
      jaw = C.breathJaw * breath; close = C.breathClose * (1 - breath);
    }
    this.speaking = active;
    // When the voice stops (line end, pause, cancel) the lip shapes let go as fast
    // as the jaw, so the mouth is shut within ~0.1 s.
    const shapeRelease = active ? C.shapeReleaseS : C.releaseS;
    this.jaw = Approach(this.jaw, jaw, step, C.attackS, C.releaseS);
    this.wide = Approach(this.wide, wide, step, C.shapeAttackS, shapeRelease);
    this.round = Approach(this.round, round, step, C.shapeAttackS, shapeRelease);
    this.close = Approach(this.close, close, step, C.shapeAttackS, C.shapeReleaseS);
    this.level = this.jaw;
    // Stress: rising edge lifts the brows, feeds the head nod, may trigger a blink.
    if (stress > .5 && !this.stressHigh) {
      this.brow = Math.max(this.brow, C.browStressLift * Math.min(1, stress));
      this.stress = 1;
      if (this.random() < C.blinkAfterStressChance) this.pendingBlinkS = C.blinkAfterStressS;
    }
    this.stressHigh = stress > .5;
    this.brow *= Math.exp(-step / C.browDecayS);
    this.stress *= Math.exp(-step / C.browDecayS);
    this.talk = Approach(this.talk, active ? 1 : 0, step, C.talkBlendS, C.talkBlendS);
    // Expressions: linear ease toward the targets, a full swing in blendS.
    const targets = this.expression || {};
    for (const name of FACIAL_EXPRESSIONS) {
      const target = Clamp01(Number(targets[name]) || 0), current = this.expressionWeights[name];
      const blend = this.expressionBlend[name] ?? C.expressionBlendS;
      this.expressionWeights[name] = blend <= 0 ? target
        : current + Math.sign(target - current) * Math.min(Math.abs(target - current), step / blend);
    }
    if (this.pendingBlinkS >= 0) { this.pendingBlinkS -= step; if (this.pendingBlinkS < 0) this.Blink(); }
    // Seeded blink rhythm.
    this.nextBlinkS -= step;
    if (this.nextBlinkS <= 0) { this.Blink(); this.nextBlinkS = this._BlinkGap(); }
    let blink = 0;
    if (this.blinkAge >= 0) {
      this.blinkAge += step;
      const t = this.blinkAge / C.blinkDurationS;
      blink = t >= 1 ? 0 : 1 - Math.abs(2 * t - 1);
      if (t >= 1) this.blinkAge = -1;
    }
    // Death: slack jaw and half lids; everything else lets go.
    if (dead) {
      const target = Number.isFinite(state.deathBlend) ? Smooth(0, .85, state.deathBlend) : 1;
      this.dead = Math.max(this.dead, target);
      this.jaw = this.wide = this.round = this.close = this.brow = this.stress = 0; blink = 0;
    } else this.dead = 0;
    const w = this.weights;
    const alive = 1 - this.dead;
    w.Open = this.jaw * alive; w.Round = this.round * alive; w.Close = this.close * alive;
    // A stressed syllable also pulls the corners back (decays with the brows).
    w.Wide = Math.min(1, this.wide + C.stressCornerPull * this.stress) * alive;
    w.Blink = blink * alive; w.BrowUp = this.brow * alive;
    for (const name of FACIAL_EXPRESSIONS) w[EXPRESSION_POSE[name]] = this.expressionWeights[name] * alive;
    w.DeadSlack = this.dead * C.deadSlackWeight;
    // While talking the expressions give most of their jaw drop to the speech.
    const expressionJaw = 1 - C.expressionTalkJawYield * this.talk;
    for (const control of this.controls) {
      const { bone, position, quaternion, deltas } = control;
      bone.position.copy(position); bone.quaternion.copy(quaternion);
      for (const delta of deltas) {
        const weight = control.jaw && delta.expression ? w[delta.pose] * expressionJaw : w[delta.pose];
        if (!(weight > 1e-4)) continue;
        if (delta.dp) bone.position.addScaledVector(delta.dp, weight);
        if (delta.dq) bone.quaternion.multiply(this._q.copy(this._id).slerp(delta.dq, Math.min(weight, 1.5)));
      }
    }
    this._UpdateEyes(step, !dead);
  }

  _UpdateEyes(dt, alive) {
    if (!this.eyes.length || !this.eyeAxes) return;
    let yaw = 0, pitch = 0;
    const target = alive ? (typeof this.gaze === 'function' ? this.gaze() : this.gaze) : null;
    const axes = this.eyeAxes;
    if (target) {
      // Direction in the head frame from the midpoint between the eyes.
      const head = this.eyes[0].bone.parent;
      head.updateWorldMatrix(true, false);
      this._target.copy(target); head.worldToLocal(this._target);
      this._p.copy(this.eyes[0].position).add(this.eyes[this.eyes.length - 1].position).multiplyScalar(.5);
      this._target.sub(this._p);
      const forward = this._target.dot(axes.forward), side = this._target.dot(axes.pitch), up = this._target.dot(axes.yaw);
      if (forward > 1e-6) {
        yaw = Math.max(-C.gazeMaxYawDeg, Math.min(C.gazeMaxYawDeg, Math.atan2(side, forward) / DEG)) * DEG;
        pitch = -Math.max(-C.gazeMaxPitchDeg, Math.min(C.gazeMaxPitchDeg, Math.atan2(up, Math.hypot(forward, side)) / DEG)) * DEG;
      }
      this.nextSaccadeS -= dt;
      if (this.nextSaccadeS <= 0) {
        this.nextSaccadeS = C.saccadeMinS + (C.saccadeMaxS - C.saccadeMinS) * this.random();
        this.saccade.set((this.random() * 2 - 1) * C.saccadeDeg * DEG, (this.random() * 2 - 1) * C.saccadeDeg * .6 * DEG);
      }
      yaw += this.saccade.x; pitch += this.saccade.y;
    }
    const mix = 1 - Math.exp(-dt / C.gazeFollowS);
    this.yaw += (yaw - this.yaw) * mix; this.pitch += (pitch - this.pitch) * mix;
    for (const eye of this.eyes) {
      this._qa.setFromAxisAngle(axes.yaw, this.yaw);
      this._qb.setFromAxisAngle(axes.pitch, this.pitch);
      eye.bone.quaternion.copy(this._qa).multiply(this._qb).multiply(eye.rest);
    }
  }

  /** Probe/test view of the current channels. */
  State() {
    return { speaking: this.speaking, jaw: this.jaw, wide: this.wide, round: this.round, close: this.close,
      brow: this.brow, blink: this.weights.Blink, dead: this.dead, yaw: this.yaw, pitch: this.pitch,
      poses: [...this.poses], eyes: this.eyes.length, talk: this.talk,
      expression: { ...this.expressionWeights }, faceBlood: this.faceBlood?.amount ?? 0 };
  }

  Reset() {
    this.source = null; this.gaze = null;
    this.expression = ZeroExpression(); this.expressionWeights = ZeroExpression(); this.expressionBlend = {};
    this.faceBlood?.Dispose(); this.faceBlood = null;
    this.jaw = this.wide = this.round = this.close = this.brow = this.stress = this.dead = this.talk = 0;
    this.blinkAge = -1; this.speaking = false; this.lastSpeech = null; this.level = 0; this.yaw = this.pitch = 0;
    for (const w of Object.keys(this.weights)) this.weights[w] = 0;
    for (const { bone, position, quaternion } of this.controls) { bone.position.copy(position); bone.quaternion.copy(quaternion); }
    for (const eye of this.eyes) eye.bone.quaternion.copy(eye.rest);
  }
}

/** The face layer of a character rig, an actor (actor.characterRig) or the layer itself. */
function FacialOf(target) {
  if (target instanceof CharacterFacialAnimation) return target;
  return target?.facial ?? target?.characterRig?.facial ?? target?.actor?.characterRig?.facial ?? null;
}
function RequireFacial(target, what) {
  const facial = FacialOf(target);
  if (!facial) throw new Error(`CharacterFacial.${what}: ${target?.modelId ?? target?.characterRig?.modelId ?? 'this rig'} has no facial rig`);
  return facial;
}

// Director-facing face controls (01-03 storyboard contract section 4.2). `rig` is a
// CharacterRig (rig.facial), an actor, or the CharacterFacialAnimation itself; a rig
// without a face throws (the speaking cast always has one: Data_FirstLevelSpeakingCast).
export const CharacterFacial = Object.freeze({
  EXPRESSIONS: FACIAL_EXPRESSIONS,
  Of: FacialOf,
  /** Partial update of {snarl, shock, pain, shout, grit} targets (0-1); blendS = full-swing time. */
  SetExpression(rig, partial, blendS) { return RequireFacial(rig, 'SetExpression').SetExpression(partial, blendS); },
  /** Face blood 0-1 (the captive comrade). Returns whether a head surface took it. */
  SetFaceBlood(rig, amount) { return RequireFacial(rig, 'SetFaceBlood').SetFaceBlood(amount); },
  /** Build the blood materials ahead of time (amount 0). */
  PrepareFaceBlood(rig) { return RequireFacial(rig, 'PrepareFaceBlood').PrepareFaceBlood(); },
});
