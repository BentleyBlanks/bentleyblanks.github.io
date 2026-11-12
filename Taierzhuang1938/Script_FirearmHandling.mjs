import { SHOT_DISTRIBUTION, FIRING_BLOOM, AUTOMATIC_RECOIL, WALL_CARRY, LOOK_SWAY, AIM_IDLE_SWAY, ADS_MOVE_BOB } from "./Data_Tuning_FirearmHandling.mjs";

const Clamp01 = (value) => Math.max(0, Math.min(1, value));
export const IsAutomaticGun = (weapon) => weapon?.kind === "lmg" || weapon?.kind === "hmg";

// Inverse CDF of a radially truncated 2D Gaussian: no rejection loop, no
// clipping pile-up on the rim, and no shots outside the HUD's maximum cone.
export function SampleShotDisk(random) {
  const variance2 = 2 * SHOT_DISTRIBUTION.sigma ** 2;
  const radius = Math.sqrt(-variance2 * Math.log(1 - random() * (1 - Math.exp(-1 / variance2))));
  const angle = random() * Math.PI * 2;
  return { x: radius * Math.cos(angle), y: radius * Math.sin(angle) };
}

export class FirearmHandling {
  constructor() { this.Reset(); }
  Reset() { this.shots = new Map(); this.movement = 0; }
  State(weapon) { return this.shots.get(weapon?.id); }
  Bloom(weapon) { return this.State(weapon)?.bloom || 0; }
  SpreadScale(weapon) { return 1 + this.Bloom(weapon) * (FIRING_BLOOM[weapon?.kind]?.gain || 0); }
  Step(dt, moving) {
    this.movement = Math.max(moving, this.movement * Math.exp(-dt / FIRING_BLOOM.moveSettleS));
    for (const state of this.shots.values()) {
      const before = Math.max(0, state.since - state.profile.delayS);
      state.since += dt;
      const recovery = Math.max(0, state.since - state.profile.delayS) - before;
      state.bloom = Math.max(0, state.bloom - recovery / state.profile.recoverS);
    }
  }
  RecordShot(weapon) {
    const profile = FIRING_BLOOM[weapon?.kind] || FIRING_BLOOM.pistol;
    const state = this.State(weapon) || { bloom: 0, since: 0, profile };
    state.bloom = Math.min(1, state.bloom + profile.perShot);
    state.since = 0;
    this.shots.set(weapon.id, state);
  }
  RecoilScale(weapon, stance, bipod = false, mounted = false) {
    if (!IsAutomaticGun(weapon)) return 1;
    const support = mounted ? AUTOMATIC_RECOIL.mountedScale : bipod ? AUTOMATIC_RECOIL.bipodScale
      : stance === "prone" ? AUTOMATIC_RECOIL.proneScale
      : stance === "crouch" ? AUTOMATIC_RECOIL.crouchScale : 1;
    return support * (1 + this.Bloom(weapon) * AUTOMATIC_RECOIL.burstGain);
  }
}

// Walls keep the approach margin; ground only counts where the held gun really
// reaches it, so a glance at the floor does not lower the gun.
function FloorGraceM(hit) {
  const normal = hit.normal, up = Array.isArray(normal) ? normal[1] : normal?.y;
  if (!Number.isFinite(up)) return 0;
  return WALL_CARRY.floorGraceM * Clamp01((up - WALL_CARRY.floorNormalY) / (1 - WALL_CARRY.floorNormalY));
}

// Probe the intended raised barrel, never the already-lowered visual muzzle:
// using the latter makes the gun raise/lower repeatedly against the same wall.
export function GunClearance(weapon, eye, forward, right, raycast) {
  if (!weapon?.ammo || !raycast) return { lower: 0, blocked: false, distance: null };
  const reach = Math.max(WALL_CARRY.minimumReachM, weapon.lengthM * WALL_CARRY.lengthScale);
  const probeLength = reach + WALL_CARRY.approachM;
  let distance = probeLength;
  const r = WALL_CARRY.probeRadiusM;
  for (const [side, down] of [[0, 0], [-r, 0], [r, 0], [0, -r]]) {
    const origin = { x: eye.x + right.x * side, y: eye.y + right.y * side + down,
      z: eye.z + right.z * side };
    const hit = raycast(origin, forward, probeLength);
    if (Number.isFinite(hit?.t) && hit.t >= 0) distance = Math.min(distance, hit.t + FloorGraceM(hit));
  }
  const full = reach * WALL_CARRY.fullLowerRatio;
  const lower = Clamp01((probeLength - distance) / (probeLength - full));
  return { lower,
    blocked: distance < reach * WALL_CARRY.blockRatio || lower > WALL_CARRY.fireReadyLower, distance };
}

// COD look sway (IW engine BG_CalculateWeaponPosition_Sway): the gun trails the
// turn by an amount set from this frame's look change, and DiffTrack follows it
// with a first-order step, so stopping the mouse eases back with no rebound.
// The look change is normalised to degrees per 1/60 s before the clamp, which
// keeps the response the same at 20, 30 or 144 fps; the exponential step is the
// frame-rate independent form of DiffTrack's `cur += rate * err * dt`.
// Tunings with frequencyHz / damping (hip LOOK_SWAY, 2026-11-12) follow the same
// target through a damped spring instead, integrated in fixed 1/240 s substeps so
// the response is the same at any frame rate; the spring also filters the uneven
// per-frame mouse chunks and lets the gun ease into the lag like a held mass.
const DEG = Math.PI / 180;
const Clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const SWAY_KEYS = ["yaw", "pitch", "roll", "x", "y"];
export class LookSway {
  constructor(tuning = LOOK_SWAY) { this.tuning = tuning; this.target = {}; this.Reset(); }
  Reset() {
    this.yaw = 0; this.pitch = 0; this.roll = 0; this.x = 0; this.y = 0; this.strafeRoll = 0;
    this.velocity = { yaw: 0, pitch: 0, roll: 0, x: 0, y: 0 };
    return this;
  }
  // dYaw / dPitch: radians the view turned this frame (yaw + = left, pitch + = up).
  // gain: weapon swayScale x (1 - ADS). Outputs are radians and metres for the
  // camera-origin sway layer: the muzzle points and sits behind the turn.
  Step(dt, dYaw = 0, dPitch = 0, gain = 1, strafe = 0) {
    if (!(dt > 1e-5)) return this;
    const S = this.tuning, perFrame = 1 / (dt * 60 * DEG), target = this.target;
    const yawDeg = Clamp((dYaw || 0) * perFrame, -S.maxDegPerFrame, S.maxDegPerFrame) * gain;
    const pitchDeg = Clamp((dPitch || 0) * perFrame, -S.maxDegPerFrame, S.maxDegPerFrame) * gain;
    target.yaw = -yawDeg * S.yawScale * DEG;
    target.pitch = -pitchDeg * S.pitchScale * DEG;
    target.roll = -yawDeg * S.rollScale * DEG;
    target.x = yawDeg * S.horizM;
    target.y = -pitchDeg * S.vertM;
    if (S.frequencyHz) {
      const w = TAU * S.frequencyHz, c = 2 * S.damping * w, span = Math.min(dt, 0.1);
      const n = Math.ceil(span * 240), h = span / n, v = this.velocity;
      for (let i = 0; i < n; i += 1) for (const k of SWAY_KEYS) {
        v[k] += (w * w * (target[k] - this[k]) - c * v[k]) * h;
        this[k] += v[k] * h;
      }
    } else {
      const follow = 1 - Math.exp(-S.lerpSpeed * dt);
      for (const k of SWAY_KEYS) this[k] += (target[k] - this[k]) * follow;
    }
    this.strafeRoll += (-(strafe || 0) * S.strafeRollRad * gain - this.strafeRoll) * (1 - Math.exp(-S.strafeLerpSpeed * dt));
    return this;
  }
}

const Mix = (a, b, t) => a + (b - a) * t;
const TAU = Math.PI * 2;

// Idle sway of the whole line of sight (camera + aim together). Breathing is a
// figure 8 on a phase accumulator (rate changes never jump), plus slow wander and
// fine tremor. `level` follows the stance / stamina / breath condition, `weight`
// the aimed / moving / reloading state, both with first-order smoothing.
export class AimIdleSway {
  constructor(tuning = AIM_IDLE_SWAY) { this.tuning = tuning; this.Reset(); }
  Reset() { this.weight = 0; this.level = 1; this.breathPhase = 0; this.pitch = 0; this.yaw = 0; return this; }
  // Returns { pitch, yaw } in radians (pitch + = up, yaw + = left).
  Step(dt, { elapsed = 0, ads = 0, gait = 0, cycleAway = 0, active = true, condition = 1, exertion = 0 } = {}) {
    const out = { pitch: this.pitch, yaw: this.yaw };
    if (!(dt > 1e-5)) return out;
    const S = this.tuning;
    this.level += (condition - this.level) * (1 - Math.exp(-dt / S.conditionS));
    const target = active ? Mix(S.hipScale, 1, ads) * Mix(1, S.moveKeep, gait) * (1 - cycleAway) : 0;
    this.weight += (target - this.weight) * (1 - Math.exp(-dt / S.blendS));
    this.breathPhase += dt * TAU * Mix(S.breathHzRest, S.breathHzTired, Clamp01(exertion));
    const b = this.breathPhase, e = elapsed, share = S.wanderShare;
    const [w0, w1] = S.wanderHz, [t0, t1] = S.tremorHz;
    const pitchDeg = S.adsPitchDeg * ((1 - share) * Math.sin(2 * b) + share * Math.sin(TAU * w0 * e + 0.9))
      + S.tremorDeg * (0.6 * Math.sin(TAU * t0 * e) + 0.4 * Math.sin(TAU * t1 * e + 1.3));
    const yawDeg = S.adsYawDeg * ((1 - share) * Math.sin(b + 0.6) + share * Math.sin(TAU * w1 * e + 2.1))
      + S.tremorDeg * (0.6 * Math.sin(TAU * t1 * e + 0.4) + 0.4 * Math.sin(TAU * t0 * e + 2.2));
    this.pitch = pitchDeg * DEG * this.level * this.weight;
    this.yaw = yawDeg * DEG * this.level * this.weight;
    return { pitch: this.pitch, yaw: this.yaw };
  }
}

// Aimed walking bob: zero-mean sway of the sights on the step phase (radians out).
export function AdsMoveBob(phase, weight, tuning = ADS_MOVE_BOB) {
  const k = weight * DEG;
  return {
    yaw: -Math.sin(phase) * tuning.yawDeg * k,
    pitch: Math.sin(2 * phase) * tuning.pitchDeg * k,
    roll: -Math.sin(phase) * tuning.rollDeg * k,
  };
}

// Frame-matched bolt cycles (FPS_BOLT_CYCLE) keep their beats in reference seconds;
// `pace` ([reference s, played s] keys) maps them to played seconds. 2026-11-13 (user:
// the bolt cycle moved in jerks): the map was piecewise linear, so the playback rate
// jumped at every key (0.67x -> 2.67x where the bolt goes forward) and every track
// lurched with it. It is now a monotone cubic through the same keys (C1: the rate
// changes smoothly, every key still lands on its played second); outside the keys it
// runs at the rate of the end segments.
const paceSlopes = new WeakMap();
function PaceSlopes(keys) {
  let slopes = paceSlopes.get(keys);
  if (slopes) return slopes;
  const d = keys.slice(1).map((key, i) => (key[1] - keys[i][1]) / (key[0] - keys[i][0]));
  slopes = keys.map((key, i) => {
    if (i === 0) return d[0];
    if (i === keys.length - 1) return d.at(-1);
    const a = d[i - 1], b = d[i], previous = key[0] - keys[i - 1][0], next = keys[i + 1][0] - key[0];
    if (a * b <= 0) return 0;
    const w1 = 2 * next + previous, w2 = next + 2 * previous;
    return (w1 + w2) / (w1 / a + w2 / b);
  });
  paceSlopes.set(keys, slopes);
  return slopes;
}
function PaceForward(keys, slopes, i, referenceS) {
  const a = keys[i], b = keys[i + 1], span = b[0] - a[0], u = (referenceS - a[0]) / span, u2 = u * u, u3 = u2 * u;
  return (2 * u3 - 3 * u2 + 1) * a[1] + (u3 - 2 * u2 + u) * slopes[i] * span
    + (-2 * u3 + 3 * u2) * b[1] + (u3 - u2) * slopes[i + 1] * span;
}
const DefaultPace = (cycle) => cycle.pace || [[0, 0], [cycle.durationS, cycle.durationS]];
export function CyclePlayedS(cycle, referenceS) {
  const keys = DefaultPace(cycle), slopes = PaceSlopes(keys);
  if (referenceS <= keys[0][0]) return keys[0][1] + (referenceS - keys[0][0]) * slopes[0];
  if (referenceS >= keys.at(-1)[0]) return keys.at(-1)[1] + (referenceS - keys.at(-1)[0]) * slopes.at(-1);
  let i = 0;
  while (referenceS > keys[i + 1][0]) i += 1;
  return PaceForward(keys, slopes, i, referenceS);
}
export function CycleReferenceS(cycle, playedS) {
  const keys = DefaultPace(cycle), slopes = PaceSlopes(keys);
  if (playedS <= keys[0][1]) return keys[0][0] + (playedS - keys[0][1]) / slopes[0];
  if (playedS >= keys.at(-1)[1]) return keys.at(-1)[0] + (playedS - keys.at(-1)[1]) / slopes.at(-1);
  let i = 0;
  while (playedS > keys[i + 1][1]) i += 1;
  let low = keys[i][0], high = keys[i + 1][0];
  for (let n = 0; n < 32; n += 1) {
    const mid = (low + high) / 2;
    if (PaceForward(keys, slopes, i, mid) < playedS) low = mid; else high = mid;
  }
  return (low + high) / 2;
}
