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
  // Ground facing up (normal y above floorNormalY, full at flat) counts this much
  // farther away: looking down at the floor stand/crouch never carries the gun
  // low; prone starts near 22 deg down, where the barrel really meets the dirt.
  floorGraceM: 0.70, floorNormalY: 0.50,
});

// First-person look sway (2026-10-20 user: a quick mouse turn swung the gun hard
// and it sprang back when the turn stopped; match COD). Same model as the IW
// engine of COD2 / WaW / COD4 (BG_CalculateWeaponPosition_Sway + DiffTrack): the
// look change this frame, in degrees per 1/60 s and clamped to maxDegPerFrame,
// sets how far the gun trails; the gun follows that target with a first-order
// tracker at lerpSpeed per second, so it settles without overshoot. Values are
// WaW's Kar98k hip weapon file (swayMaxAngle 5, swayLerpSpeed 5, swayPitchScale /
// swayYawScale 0.1, swayHorizScale 0.08 in, swayVertScale 0.12 in), inches in
// metres. Data_Weapons.swayScale multiplies; ADS keeps no look sway (2026-08-21).
export const LOOK_SWAY = Object.freeze({
  maxDegPerFrame: 5, lerpSpeed: 5,
  yawScale: 0.1, pitchScale: 0.1,                 // degrees of lag per degree/frame
  horizM: 0.08 * 0.0254, vertM: 0.12 * 0.0254,    // metres of lag per degree/frame
  rollScale: 0.06,                                // slight bank into the turn
  strafeRollRad: 0.045, strafeLerpSpeed: 6,       // existing strafe lean, now without rebound
});

// Shared first-person muzzle flash, COD view-flash recipe (WaW raw/fx/weapon/
// muzzleflashes/*_view.efx): every shot picks random atlas cells, roll, size and
// count, so no two flashes match. Sprites: one or two camera-facing gas flashes,
// one or two flame tongues along the bore, a soft glow; plus the PBR light pulse.
// Age 0 is the first frame that is drawn (fired inside the frame, so the frame
// time is not charged against the flash), and lives are COD's 30-100 ms.
// Kinds override in Data_Tuning_FirearmEffects.
export const MUZZLE_FLASH = Object.freeze({
  // Photographic cells (imagegen sheets, see _import/Script_BakeMuzzleFlashAtlas.py).
  atlas: "./Texture/Texture_MuzzleFlash_01.webp?v=20261021000000",
  atlasGrid: 4, rifleCells: Object.freeze([0, 1, 2, 3]), fireballCells: Object.freeze([4, 5, 6, 7]),
  tongueCells: Object.freeze([8, 9, 10, 11, 12, 13, 14]), glowCell: 15,
  fireballChance: 0.3,             // machine guns lean to the billowing fireball cells
  lifeS: 0.050, tongueLifeS: 0.060, glowLifeS: 0.070,
  lightLifeS: 0.060, lightRadiusM: 5, lightIntensity: 26, lightColor: 0xffc781,
  frontM: 0.20, frontScale: Object.freeze([0.80, 1.20]), frontAspect: Object.freeze([0.85, 1.18]),
  frontAheadM: 0.035, secondFrontChance: 0.35, secondFrontScale: Object.freeze([0.50, 0.75]),
  tongueM: 0.24, tongueScale: Object.freeze([0.70, 1.30]), tongueWidth: 0.60,
  secondTongueChance: 0.6, secondTongueTurn: Object.freeze([0.5, 1.2]), secondTongueScale: Object.freeze([0.6, 0.9]),
  glowM: 0.30, glowGain: 0.30,
  frontCover: 0.6, tongueCover: 0.5, // premultiplied coverage: fire stays orange over a bright sky, gas stays see-through
  grow: 0.35,                      // gas keeps expanding while it fades
  adsScale: 1.0,                   // aimed: same size; the sights hide the core and the cloud spills around them
  radiance: 3.4, radianceJitter: Object.freeze([0.85, 1.20]),
  tints: Object.freeze([0xfff0de, 0xffd2a6]),
});
