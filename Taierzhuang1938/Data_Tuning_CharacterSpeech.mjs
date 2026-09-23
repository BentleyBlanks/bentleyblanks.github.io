// Speech envelope values calibrated against the reviewed NRA05 facial rig and the
// retained Seed Audio takes (2026-09-13). The face controller values below were
// tuned on the 2026-09-23 NRA02/IJA02/NRA05 bone rigs (Blender previews under
// OneDrive/.../FacialRigs_20260923 and the in-game close-ups at 1-2 m).
export const CHARACTER_SPEECH = Object.freeze({
  // Runtime envelope fallback (Script_SpeechEnvelope): used only when a line has
  // no baked face track.
  samplesPerSecond: 50, referencePercentile: .95, minimumReference: .01,
  silenceRatio: .065, brightnessScale: 1.8,
  // Jaw follows speech fast on opening, a touch slower on closing (syllable
  // closures still read at 5-6 syllables per second).
  attackS: .025, releaseS: .045,
  maximumOpen: .92, expressionScale: .65,
  // Lip shapes (wide/round/close) ease in over a few frames so vowel changes
  // do not flicker at 60 Hz.
  shapeAttackS: .035, shapeReleaseS: .07,
  // Envelope fallback: spectral brightness splits the open mouth between the
  // wide and the rounded shape (soft band instead of the old hard .35 switch).
  fallbackWideFrom: .22, fallbackWideTo: .55, fallbackRoundScale: .6,
  // ...and a jump from nearly closed (< .3) to wide open (> .72) stands in for a stress event.
  fallbackStressLevel: .72, fallbackStressFrom: .3,
  // Blinks: every face has its own seeded rhythm, 2.5-6 s apart, 0.16 s long;
  // extra blinks at line starts and shortly after a stressed syllable.
  blinkMinS: 2.5, blinkMaxS: 6.0, blinkDurationS: .16,
  blinkAtLineStartChance: .55, blinkAfterStressS: .18, blinkAfterStressChance: .35,
  // Brows lift only on stress events (not with every open jaw), then settle.
  browStressLift: .85, browDecayS: .45,
  // Silent faces: lips stay closed; a slow, tiny breathing drift keeps them
  // from being a mask without reading as mouthing words.
  breathPeriodS: 4.4, breathJaw: .025, breathClose: .12,
  // Death: jaw drops and lids sag to DeadSlack while the body collapses.
  deadSlackWeight: 1,
  // Eyes (Face_EyeL/R): look at the attention target, clamped, with small
  // seeded saccades while holding a gaze.
  gazeMaxYawDeg: 24, gazeMaxPitchDeg: 14, gazeFollowS: .09,
  saccadeMinS: .7, saccadeMaxS: 2.4, saccadeDeg: 2.2,
});

// Shared head layer for faces that talk or listen (Script_SpeakerHeadLayer).
// Look/nod ranges carried over from Script_OpeningActorPerformance (01-03).
export const SPEAKER_HEAD = Object.freeze({
  // Head/neck turn toward the attention target: forward hemisphere only.
  maxYaw: .55, minPitch: -.25, maxPitch: .32, followRate: 4,
  neckShare: .65, headShare: .35,
  // Gunners and other busy hands: head only, small range.
  busyMaxYaw: .14, busyMaxPitch: .10,
  // Nod on each stress event: a short dip of the head, decaying.
  nodRadians: .10, nodDecayS: .28, busyNodRadians: .065,
  // Listeners glance at whoever is speaking within this range.
  listenRangeM: 9,
  breathRadians: .025, breathRate: 2.1,
});
