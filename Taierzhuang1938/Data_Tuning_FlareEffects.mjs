// Visual reconstruction, not a measured Tengxian ammunition specification.
// TM-E 30-480 (1944), ch. X §17: red/green/white stars, parachute variants,
// reported signal-pistol burning duration 4–15 s. Illumination is separately
// informed by Japanese Ammunition IV (20 July 1945), pp.70–71: Type95 (1935),
// approx.20 s / 90,000 candlepower, explicitly from Japanese sources (not recovered).
// Height, descent, wind and dimensions remain reconstruction, not measured data.
export const FLARE_EFFECTS = Object.freeze({
  SignalRed: Object.freeze({label:"红色信号弹", kind:"signal", physical:true, parachute:false,
    burnFlutter:true,photometric:true,
    previewFromXM:-12,
    apexM:100, ascendS:4.515, ignitionS:.08, igniteS:.12, burnS:7, fadeS:.4, adaptS:6,
    descendMS:0, driftMS:1.2, swayM:0, lightColor:0xff2110, groundLux:0,
    candleCd:600, maxIntensity:660, lightRadiusM:350, exposeSight:1, adaptSight:1, smokeRate:0}),
  Illumination: Object.freeze({label:"白光伞降照明弹", kind:"illumination", physical:true, parachute:true,
    opticalMotion:true,burnFlutter:true,photometric:true,
    previewFromXM:-90,
    apexM:100, ascendS:4.515, igniteS:.25, burnS:20, fadeS:.7, adaptS:6,
    descendMS:2.4, driftMS:1.2, swayM:.16, swayPeriodS:3.2, lightColor:0xfff4df,
    groundLux:0, candleCd:90000, maxIntensity:99000, lightRadiusM:600,
    exposeSight:2.4, adaptSight:.72, smokeRate:0}),
});

// Small fast flutter around nominal candlepower, not a slow dimmer envelope.
// Cohen, RSI 60 (1989), 653-656 supports rapid luminous-particle fluctuations;
// its laboratory plume is NOT a measured Type 95 waveform. Frequencies and
// amplitudes below are explicit perceptual reconstruction bands. See audit.
export const FLARE_OPTICS=Object.freeze({
  flutterBandHz:[6,22],flutterRms:.022,flutterModes:24,flutterLimit:.09,
  phaseWander:.45,phaseWanderHz:.73,settleBurnS:.12,
  tiltXRad:.10,tiltZRad:.08,gustRad:.02,secondaryPeriodRatio:.81,
  angularFloor:.70,angularPower:1.2,
});

// Scene-unit calibration, not measured weather at Tengxian. Existing daylight
// is authored in single-digit HDR units, while night is much closer to lux.
// A common 1:10000 daylight conversion keeps cd, emitting luminance and smoke
// in the same scene units without changing the authored sky or legacy lights.
export const FLARE_PHOTOMETRY=Object.freeze({dayScale:.0001,nightScale:1,
  // Two coincident active emitters must also fit the 65504 half-float target.
  coreRadiusSquared:.0025,coreFraction:.9,radianceMax:28000});

// Editor framing only; ammunition dimensions and flight are unchanged.
export const FLARE_PREVIEW = Object.freeze({
  camera:"follow",farM:600,maxDistanceM:320,followDistanceM:9,
  overviewDistanceM:180,overviewHeightM:110,overviewTargetY:50,
  environment:"night",dayPreset:"testSceneDay",nightPreset:"flarePreviewNight",
  fieldTarget:[0,48,0],fieldDistanceM:190,fieldPitch:.04,fieldYaw:Math.PI+.18,
  groundTarget:[0,1.7,0],groundDistanceM:75,groundPitch:.07,
  observerDistanceM:95,observerEyeM:1.7,observerTargetYM:40,observerFov:70,
});

// Clear, weak-moon studio night. Campaign night grading remains unchanged.
export const FLARE_PREVIEW_NIGHT = Object.freeze({
  lightIntensity:.025,envIntensity:.12,shProbeIntensity:.018,ambientIntensity:.004,
  exposure:1.15,smoke:.12,smokeColor:[.004,.006,.010],
  cloudDeck:{structure:1,underside:.6,gap:.85,silver:0,scale:1,coverage:.8,softness:.5,warp:.35,shade:[.0012,.0014,.002]},
  fog:{density:.002,falloff:14,max:.9,sky:[.003,.004,.007],ground:[.002,.003,.004],sunGain:.02,desat:.1,flatten:0},
  atmosphere:{sunIrradiance:.12,skyFloor:[.0005,.0008,.0015]},
});

export const FLARE_ART = Object.freeze({
  gravity:9.81, launchHeight:1.1, openingS:.65, dragS:.45,
  canopyRadius:.45, canopyHeight:.38, cordLength:1.25, leaderLength:.45, ventRadius:.022, ribs:8,
  candleRadius:.022, candleHeight:.16, candleLift:.045,
  glowSize:1.3, smokeCount:128, smokeHz:20, smokeLife:6,
  sparkCount:18, sparkHz:30, sparkLife:.55,
  sparkLifeMin:.18,sparkSizeMin:.003,sparkSizeMax:.012,
  sparkDragS:.22,sparkEjectMS:.7,sparkRadiance:18000,
  groundClearance:.006, surfaceRecheckM:.004, settleS:.9, groundHoldS:7, groundFadeS:2,
  clothContactProbeM:.35,
  foldedClothBaseM:.003,foldedClothWrinkleM:.006,
  clothArcRatio:1.15,clothDrapeMaxRatio:.8,clothDrapeThresholdM:.025,
  maxFlightS:120, maxSpent:4,
  // Photometric approximations for smoke scattering and the housing-shielded cloth.
  smokeScatter:.00015, canopySelfLight:.000004, ambientFloor:.001,
  smokeOpacity:.26,smokeRiseMS:.7,smokeDragS:.18,
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
