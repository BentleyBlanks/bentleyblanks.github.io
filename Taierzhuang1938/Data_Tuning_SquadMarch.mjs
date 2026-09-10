// Shared squad movement. Initial cadence ranges: docs/Data_NpcGuideCadence.md.
// Metres, seconds and radians; independent of level, renderer and actor names.
export const SQUAD_MARCH = Object.freeze({
  speedMps: 3.8, walkMps: 1.45, speedVariation: .08, leaderSpeedScale: .76,
  runMinS: 2.5, runMaxS: 5.5, restMinS: .8, restMaxS: 2,
  stopGapS: .65, restFraction: .34, localRadiusM: 12,
  accelerationMps2: 3.4, decelerationMps2: 6,
  spacingM: 1.8, spreadM: 2.2, separationM: .85,
  arrivalM: .45, catchupM: 12, catchupScale: 1.18,
  waitDistanceM: 22, resumeDistanceM: 14,
  lookYawRad: .48, breathRateHz: .65, breathScale: 1.5,
  turnRateRad: 3.6, maxCount: 24, maxRoutePoints: 128,
});

export const SQUAD_MARCH_PRESETS = Object.freeze({
  guided: Object.freeze({}),
  walk: Object.freeze({ speedMps: SQUAD_MARCH.walkMps }),
  urgent: Object.freeze({ pauses: false, speedMps: 4.5 }),
});

export const SQUAD_MARCH_EDITOR = Object.freeze({
  count: 6, seed: 17, leaderIndex: 0, preset: 'guided',
  storageKey: 'tengxian1938_squad_march_v1',
  route: Object.freeze([
    Object.freeze({x:-12,z:10}), Object.freeze({x:-12,z:-12}),
    Object.freeze({x:12,z:-12}), Object.freeze({x:12,z:10}),
  ]),
});

// Local crowd recovery only; static collision and slope checks remain in the AI host.
export const SQUAD_MARCH_AVOID = Object.freeze({
  queryRadiusM:12, circleSamples:12, clearanceScale:1.05, ringScale:1.18,
  retryS:.5, timeoutS:12, blockedS:3, startSpeedMps:.4, stoppedSpeedMps:.15,
  arrivalM:.12, brakingMarginM:.04, hostArrivalM:.06, narrowWidthM:2.5,
});

export const SQUAD_MARCH_GUARDS = Object.freeze({
  recentFireS:1.5,grenadeThreatS:2,suppression:.4,hurt:.4,groundDeltaM:.35,
  // AiDirector uses its navigation field for goals beyond 14 metres.
  navigationStallS:.8,navigationMinDistanceM:14,navigationMovingMps:.15,navigationCommandMps:.5,
  localRecoveryStallS:1.6,localRecoveryProbeM:.65,localRecoveryGoalM:1.2,
  localRecoveryTimeoutS:1.5,localRecoveryMinFraction:.65,localRecoveryAngles:16,localRecoveryRetryS:1,
  localRecoveryPersistence:1.2,localRecoveryMaxGrade:.9,
});
