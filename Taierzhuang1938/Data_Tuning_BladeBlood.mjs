// Blade blood stain, gravity flow, coagulation, hanging droplets, and swing-fling tuning.
// Pure data (zero three.js imports), units in metres, seconds, and linear/sRGB hex colors.
// Consumed by Script_BladeBloodModel.mjs (pure rule layer) and Script_BladeBlood.mjs (Three.js shader + 3D drip/fling).

export const BLADE_BLOOD_TEXTURE = "./Texture/Texture_BladeBloodDetail.webp?v=20261127a";

export const BLADE_BLOOD_COLORS = Object.freeze({
  // Physically calibrated sRGB hex colors harmonized with Data_Tuning_Blood / VFX_PALETTE
  // (BLOOD_ARTERIAL 0xa51e16, BloodEffects fresh 0x931f1a, VFX_PALETTE.bloodFresh 0xc22a18):
  // reads unmistakably wet crimson even on shadowed steel under cool daylight sky IBL,
  // darkening naturally in thick bevel pools and oxidizing to dark brown-maroon as it dries.
  fresh: 0x9e1812,
  arterial: 0xca2116,
  deepPool: 0x560c0a,
  // Coagulated / oxidized dried blood residue after drying on weathered steel.
  dry: 0x3e1410,
  // 3D hanging & falling liquid droplets (deep glossy crimson matching thick pooled blade blood).
  dropFresh: 0x6c0b09,
  dropDark: 0x3b0706,
  dropArterial: 0x9c1610,
});

export const BLADE_BLOOD_SURFACE = Object.freeze({
  // Fresh blood is a glossy wet liquid (n ≈ 1.38); dried blood becomes dark satin-matte.
  wetRoughness: 0.060,
  dryRoughness: 0.62,
  // Thick opaque pools & dried clots suppress metallic conductance of bare steel beneath;
  // thin translucent wet streaks retain partial ruby-tinted metallic bounce from steel underneath.
  metalSuppress: 0.90,
  // Micro-meniscus normal perturbation strength driven by liquid film thickness gradients.
  meniscusBump: 1.55,
  // Beer-Lambert optical absorption scale for darkening thicker pooled film/clots.
  beerLambertDepth: 2.05,
  // Guard/ricasso only receives fine spatter once blade saturation crosses this threshold.
  guardSpatterThreshold: 0.44,
  guardSpatterMax: 0.58,
  // Subtle edge specular lift when fresh wet film catches light at grazing angles.
  wetRimGlow: 0.16,
});

export const BLADE_BLOOD_DYNAMICS = Object.freeze({
  // Wetness e-folding time (seconds): stays vividly wet & dripping for ~15-30s,
  // gradually thickens and oxidizes to dried dark crimson over ~60-120s.
  wetDecayTauS: 34.0,
  minWetResidue: 0.03,
  // Dried blood residue stays visibly on a battle blade for minutes before gradually wearing down.
  stainHoldS: 140.0,
  stainDecayTauS: 420.0,
  // Viscous gravity creep speed along projected world -Y on the blade plane (UV units / s).
  flowSpeedPerS: 0.085,
  flowMaxOffset: 0.62,
  // Active dripping thresholds and cadence (fast right after a kill, naturally slowing as blood dries).
  dripMinWetness: 0.16,
  dripMinCoverage: 0.12,
  dripMinIntervalS: 0.72,
  dripMaxIntervalS: 4.40,
  dripWetCost: 0.026,
  dripChargeGainOnHit: 0.55,
  // Swelling 3D pendant droplets clinging to the lowest gravity point along the bloody edge.
  // Human blood capillary detachment radius is ~2.5-3.5 mm: sleek, glossy, never oversized.
  pendantCount: 2,
  pendantMinRadiusM: 0.0010,
  pendantMaxRadiusM: 0.0034,
  pendantElongation: 2.75,
  pendantNeckStart: 0.62,
  // Detach early if the blade jolts / accelerates briskly while a drop is mostly formed.
  joltSpeedThresholdMps: 1.55,
  joltDetachProgress: 0.42,
  // Rapid swing centrifugal blood-fling (shaking off / slashing with a wet blade).
  flingSpeedThresholdMps: 3.1,
  flingCooldownS: 0.095,
  flingPostHitGraceS: 0.48,
  flingMinWetness: 0.18,
  flingDropsMin: 3,
  flingDropsMax: 8,
  flingWetCost: 0.055,
  // World-space blood drop particle + ground decal sizing.
  dripSpeedDownMps: [0.10, 0.28],
  dripHalfWidthM: [0.0042, 0.0068],
  dripStretch: [0.022, 0.044],
  dripDecalRadiusM: [0.034, 0.068],
  dripDecalChance: 0.85,
  flingSpeedScale: 0.58,
  flingSpeedClampMps: [1.6, 6.2],
  flingSpread: 0.28,
  flingHalfWidthM: [0.0048, 0.0092],
  flingStretch: [0.035, 0.095],
  flingDecalRadiusM: [0.036, 0.084],
  flingDecalChance: 0.65,
});

// Hit-kind coating profiles: each strike adds coverage, bevel pooling, spatter, wetness,
// penetration reach along the blade, and an immediate post-cut spray/drip burst.
export const BLADE_BLOOD_HITS = Object.freeze({
  light: Object.freeze({
    coverage: 0.48, edge: 0.72, spatter: 0.40, wetness: 0.84, thickness: 0.56,
    lengthReach: 0.60, dripCharge: 0.58, flingBurst: 2,
  }),
  heavy: Object.freeze({
    coverage: 0.74, edge: 0.90, spatter: 0.66, wetness: 0.95, thickness: 0.78,
    lengthReach: 0.84, dripCharge: 0.82, flingBurst: 4,
  }),
  kill: Object.freeze({
    coverage: 0.84, edge: 0.96, spatter: 0.80, wetness: 1.00, thickness: 0.88,
    lengthReach: 0.92, dripCharge: 0.92, flingBurst: 5,
  }),
  lodge: Object.freeze({
    coverage: 0.86, edge: 0.96, spatter: 0.68, wetness: 1.00, thickness: 0.92,
    lengthReach: 0.94, dripCharge: 0.88, flingBurst: 3,
  }),
  yank: Object.freeze({
    coverage: 0.94, edge: 1.00, spatter: 0.92, wetness: 1.00, thickness: 0.96,
    lengthReach: 0.97, dripCharge: 1.00, flingBurst: 7,
  }),
  cleave: Object.freeze({
    coverage: 0.84, edge: 0.95, spatter: 0.74, wetness: 1.00, thickness: 0.90,
    lengthReach: 0.92, dripCharge: 0.85, flingBurst: 4,
  }),
  rip: Object.freeze({
    coverage: 0.97, edge: 1.00, spatter: 0.96, wetness: 1.00, thickness: 0.98,
    lengthReach: 0.99, dripCharge: 1.00, flingBurst: 8,
  }),
  slideSlash: Object.freeze({
    coverage: 0.88, edge: 0.96, spatter: 0.82, wetness: 1.00, thickness: 0.90,
    lengthReach: 0.92, dripCharge: 0.94, flingBurst: 5,
  }),
  crushFinish: Object.freeze({
    coverage: 0.92, edge: 0.98, spatter: 0.88, wetness: 1.00, thickness: 0.94,
    lengthReach: 0.95, dripCharge: 0.96, flingBurst: 6,
  }),
  bayonetLight: Object.freeze({
    coverage: 0.56, edge: 0.74, spatter: 0.40, wetness: 0.82, thickness: 0.58,
    lengthReach: 0.60, dripCharge: 0.60, flingBurst: 2,
  }),
  bayonetHeavy: Object.freeze({
    coverage: 0.86, edge: 0.95, spatter: 0.70, wetness: 0.98, thickness: 0.86,
    lengthReach: 0.88, dripCharge: 0.90, flingBurst: 4,
  }),
  corpse: Object.freeze({
    coverage: 0.52, edge: 0.68, spatter: 0.44, wetness: 0.66, thickness: 0.56,
    lengthReach: 0.68, dripCharge: 0.52, flingBurst: 2,
  }),
});

// Measured mesh-local blade geometry profiles (from TZM vertex bounds & procedural builders).
// In each profile:
//   zTip / zGuard  : blade span along local -Z (tip is more negative than guard)
//   yEdge / ySpine : representative local Y bounds of the cutting edge vs thick spine
//   edgeSign       : +1 if cutting edge is toward +Y (Model_Dadao TZM), -1 if toward -Y (BuildDadao)
//   mode           : "slash" (edge-to-spine bevel bias) | "stab" (tip-to-guard axial bias)
//   dripPoints     : [x, y, z, along01] candidate edge/tip points in mesh-local coordinates
export const BLADE_PROFILES = Object.freeze({
  Dadao: Object.freeze({
    mode: "slash",
    zTip: -0.630,
    zGuard: -0.095,
    zGuardSpatterEnd: -0.015,
    yEdge: 0.072,
    ySpine: -0.036,
    edgeSign: 1,
    // Four edge contour control points (tip -> front -> belly -> heel) matching Model_Dadao.tzm.json.
    edgeYCurve: Object.freeze([0.018, 0.056, 0.073, 0.064]),
    spineYCurve: Object.freeze([-0.022, -0.042, -0.008, -0.007]),
    // Candidate drip stations: [x, yEdge, z, along01, ySpine], measured directly from Model_Dadao.tzm.json
    // and tucked ~1.5 mm inside the rim so the liquid meniscus fillet meets the steel with zero air gap.
    dripPoints: Object.freeze([
      Object.freeze([0.0, 0.013, -0.605, 0.05, -0.016]),
      Object.freeze([0.0, 0.038, -0.540, 0.17, -0.029]),
      Object.freeze([0.0, 0.057, -0.460, 0.32, -0.030]),
      Object.freeze([0.0, 0.068, -0.360, 0.50, -0.012]),
      Object.freeze([0.0, 0.070, -0.260, 0.69, -0.002]),
    ]),
  }),
  DadaoBox: Object.freeze({
    mode: "slash",
    zTip: -0.775,
    zGuard: -0.115,
    zGuardSpatterEnd: -0.070,
    yEdge: -0.058,
    ySpine: 0.030,
    edgeSign: -1,
    edgeYCurve: Object.freeze([-0.055, -0.052, -0.044, -0.026]),
    spineYCurve: Object.freeze([0.022, 0.028, 0.030, 0.028]),
    dripPoints: Object.freeze([
      Object.freeze([0.0, -0.048, -0.755, 0.03]),
      Object.freeze([0.0, -0.052, -0.600, 0.26]),
      Object.freeze([0.0, -0.046, -0.420, 0.54]),
      Object.freeze([0.0, -0.032, -0.220, 0.84]),
    ]),
  }),
  BayonetHanYang: Object.freeze({
    mode: "stab",
    zTip: -0.395,
    zGuard: -0.020,
    zGuardSpatterEnd: 0.025,
    yEdge: -0.010,
    ySpine: 0.013,
    edgeSign: -1,
    edgeYCurve: Object.freeze([-0.003, -0.008, -0.010, -0.005]),
    spineYCurve: Object.freeze([0.006, 0.011, 0.013, 0.008]),
    dripPoints: Object.freeze([
      Object.freeze([0.0, 0.001, -0.390, 0.02]),
      Object.freeze([0.0, -0.007, -0.320, 0.20]),
      Object.freeze([0.0, -0.010, -0.220, 0.47]),
      Object.freeze([0.0, -0.008, -0.110, 0.76]),
    ]),
  }),
  BayonetZhongZheng: Object.freeze({
    mode: "stab",
    zTip: -0.428,
    zGuard: -0.020,
    zGuardSpatterEnd: 0.025,
    yEdge: -0.011,
    ySpine: 0.015,
    edgeSign: -1,
    edgeYCurve: Object.freeze([-0.002, -0.009, -0.011, -0.005]),
    spineYCurve: Object.freeze([0.005, 0.012, 0.015, 0.008]),
    dripPoints: Object.freeze([
      Object.freeze([0.0, 0.001, -0.422, 0.02]),
      Object.freeze([0.0, -0.008, -0.340, 0.22]),
      Object.freeze([0.0, -0.011, -0.230, 0.49]),
      Object.freeze([0.0, -0.008, -0.110, 0.78]),
    ]),
  }),
  BayonetType38: Object.freeze({
    mode: "stab",
    zTip: -0.400,
    zGuard: -0.020,
    zGuardSpatterEnd: 0.025,
    yEdge: -0.012,
    ySpine: 0.005,
    edgeSign: -1,
    edgeYCurve: Object.freeze([0.0, -0.010, -0.012, -0.010]),
    spineYCurve: Object.freeze([0.005, 0.005, 0.005, 0.006]),
    dripPoints: Object.freeze([
      Object.freeze([0.0, 0.002, -0.394, 0.02]),
      Object.freeze([0.0, -0.009, -0.310, 0.24]),
      Object.freeze([0.0, -0.012, -0.200, 0.53]),
      Object.freeze([0.0, -0.010, -0.095, 0.80]),
    ]),
  }),
  OfficerSwordSet: Object.freeze({
    mode: "slash",
    zTip: -0.730,
    zGuard: -0.045,
    zGuardSpatterEnd: 0.010,
    yEdge: -0.032,
    ySpine: 0.024,
    edgeSign: -1,
    edgeYCurve: Object.freeze([-0.024, -0.030, -0.032, -0.028]),
    spineYCurve: Object.freeze([0.016, 0.022, 0.024, 0.020]),
    dripPoints: Object.freeze([
      Object.freeze([0.0, -0.012, -0.715, 0.02]),
      Object.freeze([0.0, -0.028, -0.540, 0.28]),
      Object.freeze([0.0, -0.032, -0.340, 0.57]),
      Object.freeze([0.0, -0.028, -0.150, 0.85]),
    ]),
  }),
});
