// Visual reconstruction, not a measured Tengxian ammunition specification.
// TM-E 30-480 (1944), ch. X §17: red/green/white stars, parachute variants,
// reported signal-pistol burning duration 4–15 s. Illumination is separately
// informed by Japanese Ammunition IV (20 July 1945), pp.70–71: Type95 (1935),
// approx.20 s / 90,000 candlepower, explicitly from Japanese sources (not recovered).
// Height, descent, wind and dimensions remain reconstruction, not measured data.
export const FLARE_EFFECTS = Object.freeze({
  SignalRed: Object.freeze({label:"红色信号弹", kind:"signal", physical:true, parachute:false,
    previewFromXM:-12,
    apexM:100, ascendS:4.515, ignitionS:.08, igniteS:.12, burnS:7, fadeS:.4, adaptS:6,
    descendMS:0, driftMS:1.2, swayM:0, lightColor:0xff2110, groundLux:0,
    candleCd:600, maxIntensity:600, lightRadiusM:110, exposeSight:1, adaptSight:1, smokeRate:0}),
  Illumination: Object.freeze({label:"白光伞降照明弹", kind:"illumination", physical:true, parachute:true,
    previewFromXM:-90,
    apexM:100, ascendS:4.515, igniteS:.25, burnS:20, fadeS:.7, adaptS:6,
    descendMS:2.4, driftMS:1.2, swayM:.16, swayPeriodS:3.2, lightColor:0xfff4df,
    groundLux:0, candleCd:90000, maxIntensity:90000, lightRadiusM:600,
    exposeSight:2.4, adaptSight:.72, smokeRate:0}),
});

// Editor framing only; ammunition dimensions and flight are unchanged.
export const FLARE_PREVIEW = Object.freeze({
  camera:"follow",farM:600,maxDistanceM:320,followDistanceM:9,
  overviewDistanceM:180,overviewHeightM:110,overviewTargetY:50,
});

export const FLARE_ART = Object.freeze({
  gravity:9.81, launchHeight:1.1, openingS:.65, dragS:.45,
  canopyRadius:.45, canopyHeight:.22, cordLength:1.25, leaderLength:.45, ventRadius:.022, ribs:8,
  candleRadius:.022, candleHeight:.16, candleLift:.045,
  glowSize:1.3, smokeCount:128, smokeHz:20, smokeLife:6,
  sparkCount:18, sparkHz:30, sparkLife:.55,
  groundClearance:.006, surfaceRecheckM:.004, settleS:.9, groundHoldS:7, groundFadeS:2,
  clothContactProbeM:.35,
  foldedClothBaseM:.003,foldedClothWrinkleM:.006,
  clothArcRatio:1.15,clothDrapeMaxRatio:.8,clothDrapeThresholdM:.025,
  maxFlightS:120, maxSpent:4,
  // Photometric approximations for smoke scattering and the housing-shielded cloth.
  smokeScatter:.00015, canopySelfLight:.000004, ambientFloor:.001,
});

// Two persistent maps, one update per frame. Stored in the existing RGBA32F
// cluster texture (four linear depths per texel), so PBR uses no extra sampler.
export const FLARE_SHADOW = Object.freeze({
  slots:2, size:512, nearM:.25, angle:1.35, receiverRadiusM:110, depthMarginM:30,
  biasM:.055, normalBiasM:.045,
});

// Uncalibrated night presets normally only meter. During a bright flare, allow
// measured scene luminance to reduce exposure, then recover without brightening
// the night above its authored baseline. No gameplay visibility is derived here.
export const FLARE_EXPOSURE = Object.freeze({maxDarkEv:3,recoveryS:1.8,cutoff:.001});
