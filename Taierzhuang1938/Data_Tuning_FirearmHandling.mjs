// Authored handling values (2026-09-13): dense shot centre, recoverable bloom,
// automatic-fire climb and downward wall carry. These are gameplay values.
export const SHOT_DISTRIBUTION = Object.freeze({ sigma: 0.34 });
export const FIRING_BLOOM = Object.freeze({
  boltRifle: Object.freeze({ perShot: 0.14, delayS: 0.14, recoverS: 0.35, gain: 1.0 }),
  pistol: Object.freeze({ perShot: 0.18, delayS: 0.12, recoverS: 0.55, gain: 1.2 }),
  lmg: Object.freeze({ perShot: 0.12, delayS: 0.16, recoverS: 0.95, gain: 2.0 }),
  hmg: Object.freeze({ perShot: 0.10, delayS: 0.36, recoverS: 0.95, gain: 1.4 }),
  moveSettleS: 0.22,
});
export const AUTOMATIC_RECOIL = Object.freeze({
  burstGain: 1.1, crouchScale: 0.72, proneScale: 0.5, bipodScale: 0.32,
  recoverS: 0.32, maxPitchDeg: 12, maxYawDeg: 4,
  lmg: Object.freeze({ pitchDeg: 0.85, yawDeg: 0.34, delayS: 0.16 }),
  hmg: Object.freeze({ pitchDeg: 1.05, yawDeg: 0.40, delayS: 0.36 }),
  mountedScale: 0.32,
});
export const WALL_CARRY = Object.freeze({
  lengthScale: 1.20, minimumReachM: 0.32, probeRadiusM: 0.065,
  approachM: 0.30, fullLowerRatio: 0.56, blockRatio: 0.88,
  lowerS: 0.065, raiseS: 0.16, fireReadyLower: 0.30,
  pitchRad: -1.26, backM: 0.08, downM: -0.14,
});

// Shared first-person rifle flash: a hot, masked flame and a brief PBR light pulse.
// Reuse the shipped Vefects mask; no new generated bitmap is needed.
export const MUZZLE_FLASH = Object.freeze({
  mask: "./Texture/Texture_VefectsFireMask_01.webp",
  lifeS: 0.060, lightLifeS: 0.075, lightRadiusM: 5,
  lightIntensity: 26, lightColor: 0xffc781,
  widthM: 0.13, lengthM: 0.27, coreM: 0.16,
  color: 0xffc781, radiance: 7.5,
  minScale: 0.85, maxScale: 1.25, endScale: 0.55,
});
