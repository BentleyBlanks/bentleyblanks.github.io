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

// Who plays a speaking role when several bodies could (Script_FirstLevelSpeakerBinder).
export const SPEAKER_BINDING = Object.freeze({
  // 04 BundleOrder: the withdrawing guard with the talking face (FACED_FRONT_GUARD_INDEX)
  // points to the ammo house when he is at most this much farther from the player than
  // the nearest guard. The second batch gathers 1.35 m apart (FRONT_BATTLE_TUNING.gatherSpacingM,
  // six men = 6.75 m), so a gathered faced guard always qualifies; a far one does not.
  facedGuardSlackM: 8,
});

// Offline face tracks (Script_FirstLevelFaceTrackBake.py -> Audio/FirstLevel/
// Data_FirstLevelFaceTracks.json). Timing from per-character / per-kana alignment,
// shapes from Data_FaceTrackPhonemes, openness from speech-band energy after the
// noise measured in the aligned gaps is subtracted. Set on the 03-06 whole-cue
// takes (2026-09-23), whose ambience is baked into the same mp3.
export const FACE_TRACK_BAKE = Object.freeze({
  // Analysis frames: 25 ms Hann window every 10 ms at 16 kHz; speech band only.
  hopS: .01, windowS: .025, bandLowHz: 250, bandHighHz: 3500,
  // Spectral subtraction of the gap noise (over-subtract, keep a little floor).
  noiseOverSubtract: 1.5, noiseFloorKeep: .05, noiseGapPadS: .12, noiseMinFrames: 20,
  // A frame is speech when its denoised band energy is this far over the noise AND a
  // voiced (pitched) frame is within speechReachS. Pitch strength is the normalised
  // autocorrelation peak at 80-400 Hz lags of the 70-1000 Hz band over 40 ms: the
  // 03-06 takes measure >=.7 on vowels and .2-.5 on gunfire, rumble and hiss
  // (BorrowLight 0-1.3 s is up to +37 dB of ambience at ~.4 with single-frame spikes
  // to .8, then 兄 at 1.77 s reads .9+), so the strength is a running median over
  // pitchMedianFrames before the threshold. At 5 frames / .6 the falling-debris bed of
  // MarchToTengxian and RoadBump still passed as speech in runs of 50-200 ms.
  voicedAboveNoiseDb: 8,
  pitchBandLowHz: 70, pitchBandHighHz: 1000, pitchWindowS: .04, pitchMedianFrames: 7, pitchMin: .7,
  speechReachS: .03,
  // Syllable openness: floor + (1-floor)*(energy/p90)^gamma; inaudible syllables
  // (aligned but under the voiced threshold) still move at quietSyllableAmp.
  ampFloor: .5, ampGamma: .7, quietSyllableAmp: .4,
  // Syllable span: continuous speech runs start-to-start; a syllable is 0.14-0.42 s.
  minSyllableS: .14, maxSyllableS: .42, tailPadS: .06,
  // Before a pause or a line end a vowel may be held (called orders: 往——滕县——);
  // it stays open while speech frames continue, up to this long.
  heldVowelS: 1.5,
  // Closures (b/p/m/f and kana onsets) take the first 30 % of a syllable, at most 60 ms.
  onsetShare: .3, onsetS: .06,
  // Between syllables without a closure the jaw dips to this share of the next vowel,
  // so every syllable is its own opening (the old envelope opened 2-3 times a second).
  boundaryDip: .35,
  // A silence longer than this between two syllables closes the mouth.
  pauseGapS: .16, restLeadS: .06, restTailS: .04,
  glideWeight: .7, tailWeight: .75,
  // Stress events (brow lift, head nod, blink): a syllable this much louder than the
  // cue median and a local peak, at least stressMinGapS apart; sampled as a pulse.
  stressRatio: 1.35, stressMinGapS: .5, stressPulseS: .16,
  // Per-line alignment windows around the existing line intervals.
  lineWindowPadS: .25,
  // Whisper parks the first word of a line at the window start: either as a word that
  // spans the whole lead-in silence (BorrowLight 兄 0.0-1.88 s, its voice at 1.77 s) or
  // as a short word a second before the rest (FrontRelief 这 at 0.0 s, 批过了 at 1.88 s).
  // A character longer than longCharS is placed where its span holds the most speech
  // frames (the latest such place on a tie); then inside one phrase (no
  // punctuation) a silence over phraseGapS is closed by packing the smaller side
  // against the larger. Moved characters keep their aligned length clamped to
  // phraseCharMinS..phraseCharMaxS.
  longCharS: .5, phraseGapS: .45, phraseCharMinS: .07, phraseCharMaxS: .16,
  // The voice module only asks for a line inside its interval; the mouth closes this
  // long after the interval ends even when the aligned syllable runs on.
  lineEndPadS: .04,
  // Stats: "open" means jaw >= openJaw; "moving" also counts a visible lip shape
  // (wide or round >= shapeVisible, lips pressed close >= .5) within +-movingWindowS:
  // an "i" or a b/p/m closure is articulation, not a still mouth.
  openJaw: .1, shapeVisible: .25, movingWindowS: .04,
});
