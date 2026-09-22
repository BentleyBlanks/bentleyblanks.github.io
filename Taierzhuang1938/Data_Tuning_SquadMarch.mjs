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
  // User 2026-09-23: a stop is breathing by default; only a low-chance stop turns
  // into a slight left/right alert scan. Stationary members re-roll every retry window.
  alertChance: .2, alertMinS: 1.8, alertMaxS: 3, alertRetryMinS: 3.5, alertRetryMaxS: 7,
  restGlanceRad: .1, lookChestShare: .3,
  // User 2026-09-23: the start is not a parade block. Followers standing still react
  // 0..startDelayMaxS late; lanes/rows jitter by this fraction of spreadM/spacingM;
  // the first run window reaches down to firstRunScale*runMinS.
  startDelayMaxS: 1.2, startStillMps: .3, formationJitter: .22, firstRunScale: .5,
  // Walk/urgent stagger: slow personal pace drift, ease-off phases for urgent, and a
  // dead-banded pull back toward the formation slot (guided keeps its leader pacing).
  paceWobble: 0, paceHzMin: .05, paceHzMax: .13, easeScale: .72, regroupM: 1.5, regroupScale: .14,
});

// cadence: rest = run/brake/breathe; pause = walk/brake/brief stop (no panting);
// ease = never stops, alternates full pace with an eased pace (urgent transfer).
export const SQUAD_MARCH_PRESETS = Object.freeze({
  guided: Object.freeze({ cadence: 'rest' }),
  walk: Object.freeze({ cadence: 'pause', speedMps: SQUAD_MARCH.walkMps, leaderSpeedScale: .94,
    runMinS: 4, runMaxS: 9, restMinS: .6, restMaxS: 1.4, stopGapS: .9, restFraction: .25, paceWobble: .06 }),
  urgent: Object.freeze({ cadence: 'ease', speedMps: 4.5, leaderSpeedScale: .95,
    runMinS: 1.6, runMaxS: 3.6, restMinS: .8, restMaxS: 1.6, stopGapS: .5, paceWobble: .05 }),
});

export const SQUAD_MARCH_EDITOR = Object.freeze({
  count: 6, seed: 17, leaderIndex: 0, preset: 'guided', startYawJitterRad: .45,
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

// User 2026-09-13: physical two-team shelters release when the player catches up.
export const SQUAD_COVER_BOUNDS = Object.freeze({arrivalM:.18,postArrivalM:.1,transitArrivalM:.5,playerArrivalM:4,playerCorridorM:3,stanceHoldS:.5});
// User 2026-09-16: bounding by pairs is a contact drill. With nobody shooting,
// seen or close, the squad walks the trench and skips the shelter posts.
// calmAfterS keeps one quiet second from collapsing the drill mid-firefight.
export const SQUAD_COVER_THREAT = Object.freeze({incomingMemoryS:3,suppression:.2,nearEnemyM:18,calmAfterS:4});
