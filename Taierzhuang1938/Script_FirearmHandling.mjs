import { SHOT_DISTRIBUTION, FIRING_BLOOM, AUTOMATIC_RECOIL, WALL_CARRY, LOOK_SWAY } from "./Data_Tuning_FirearmHandling.mjs";

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
const DEG = Math.PI / 180;
const Clamp = (value, low, high) => Math.max(low, Math.min(high, value));
export class LookSway {
  constructor(tuning = LOOK_SWAY) { this.tuning = tuning; this.Reset(); }
  Reset() { this.yaw = 0; this.pitch = 0; this.roll = 0; this.x = 0; this.y = 0; this.strafeRoll = 0; return this; }
  // dYaw / dPitch: radians the view turned this frame (yaw + = left, pitch + = up).
  // gain: weapon swayScale x (1 - ADS). Outputs are radians and metres for the
  // camera-origin sway layer: the muzzle points and sits behind the turn.
  Step(dt, dYaw = 0, dPitch = 0, gain = 1, strafe = 0) {
    if (!(dt > 1e-5)) return this;
    const S = this.tuning, perFrame = 1 / (dt * 60 * DEG);
    const yawDeg = Clamp((dYaw || 0) * perFrame, -S.maxDegPerFrame, S.maxDegPerFrame) * gain;
    const pitchDeg = Clamp((dPitch || 0) * perFrame, -S.maxDegPerFrame, S.maxDegPerFrame) * gain;
    const follow = 1 - Math.exp(-S.lerpSpeed * dt);
    this.yaw += (-yawDeg * S.yawScale * DEG - this.yaw) * follow;
    this.pitch += (-pitchDeg * S.pitchScale * DEG - this.pitch) * follow;
    this.roll += (-yawDeg * S.rollScale * DEG - this.roll) * follow;
    this.x += (yawDeg * S.horizM - this.x) * follow;
    this.y += (-pitchDeg * S.vertM - this.y) * follow;
    this.strafeRoll += (-(strafe || 0) * S.strafeRollRad * gain - this.strafeRoll) * (1 - Math.exp(-S.strafeLerpSpeed * dt));
    return this;
  }
}
