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
  // Acting expressions (2026-09-25, 01-03 storyboard contract section 4.2):
  // rig.facial.expression = {snarl, shock, pain, shout, grit} are targets; each
  // weight moves linearly and takes expressionBlendS for a full 0 -> 1 swing
  // (SetExpression may pass its own time, e.g. ~.12 s for the Chop shock).
  expressionBlendS: .25,
  // Speech sits on top of the expression. Shout (19 deg) and Shock (8 deg) drop
  // the jaw themselves; on top of the 10-14 deg Open that would hang the mouth
  // at 30+ deg with syllables reading as a wobble. While the face talks the
  // expression keeps only (1 - yield) of its jaw drop, so a shouted line still
  // opens and shuts on every syllable around a half-open base (Blender ShoutTalk).
  // talkBlendS: how fast the face counts as talking / not talking.
  expressionTalkJawYield: .6, talkBlendS: .12,
  // Secondary: a stressed syllable pulls the mouth corners back (a Wide pulse on
  // top of the track's own lip shape), decaying with the brows (browDecayS). It rides
  // on the open jaw (full from stressCornerPullFullJaw), so it lets go with the jaw
  // (releaseS) when the line ends or pauses: Wide carries a little jaw drop of its own.
  stressCornerPull: .35, stressCornerPullFullJaw: .4,
  // Baked face tracks (Data_FirstLevelFaceTracks.json) mostly carry wide/round at .1-.5, where
  // the lip shapes barely show at 1 m (in-game review 2026-09-25). The runtime scales the track's
  // lip-shape channels (clamped to 1); the jaw channel is left as baked.
  trackWideGain: 1.6, trackRoundGain: 1.6, trackCloseGain: 1,
  // Eyes (Face_EyeL/R): look at the attention target, clamped, with small
  // seeded saccades while holding a gaze.
  gazeMaxYawDeg: 24, gazeMaxPitchDeg: 14, gazeFollowS: .09,
  saccadeMinS: .7, saccadeMaxS: 2.4, saccadeDeg: 2.2,
});

// Face blood (Script_CharacterFaceBlood, CharacterFacial.SetFaceBlood): the captive
// comrade's bloodied face in SB03-SB04A (01-03 storyboard contract section 4.2).
// A procedural mask in face space (units of the eye distance, origin between the
// eyes, +x toward Face_EyeR, +y up, +z out of the face) on private clones of the
// head materials; no texture, so no sampler (Script_SamplerBudgetTest).
// SB03 reads at ~4 m: a dark red forehead cut with runs down the brow, cheek and
// nose, a smear on the other cheek, blood from the nose over the lip and chin,
// under a thin grime film. Colours from Data_Tuning_Blood.BLOOD_WOUND (fresh
// 0x70100e, dry 0x300b09) so face and cloth wounds match.
export const FACE_BLOOD = Object.freeze({
  fresh: 0x70100e, dry: 0x300b09,
  // Cover at amount 1 and how much of the thick part is still wet (glossy, brighter).
  opacity: .92, wetShare: .55,
  wetRoughness: .42, dryRoughness: .88,
  // Forehead cut: centre and half size in eye distances.
  // 2026-09-25 review: at .78 the cut sat under the NRA cap brim; now on the brow band
  // just under the brim, so the wound shows and the runs come out from under the cap.
  cut: [.28, .5], cutSize: [.34, .11],
  // Runs from the cut down the face: x offsets from the cut, widths, lengths at amount 1.
  runX: [-.34, -.12, .08, .3], runWidth: [.07, .1, .06, .08], runLength: [1.55, 2.25, 1.35, 1.9],
  // Cheek smear (the other side) and the nose bleed over the lip and chin.
  smear: [-.62, -.62], smearSize: [.32, .46],
  // Smear edge roughness (grain, speck weights): lower reads as a wiped streak, higher as blotches.
  smearRough: [.3, .12],
  nose: [.02, -.62], noseWidth: .16, noseLength: 1.25,
  // Face region: front of the head only (z), inside the face oval (full inside ovalEdge of
  // the radius, fading to 0 at its rim), and below the forehead band under the cap brim:
  // full up to topFrom, gone at topTo (the skin above it is under the cap anyway).
  frontFrom: -.95, frontTo: -.35, ovalCentreY: -.45, ovalRadius: [1.25, 1.95], ovalEdge: .85,
  topFrom: .62, topTo: .8,
  // Only the head surface that holds the lips takes blood: its closest vertex to
  // Face_LipUpper at bind time within this many eye distances (caps and collars are farther).
  skinLipReach: .25,
  // Shading: runs wobble sideways (two sines: amplitude, frequency per eye distance);
  // grain/speck noise frequencies; blood colour = tint * (tintBase + skin albedo * tintSkin).
  runWobble: [.05, 6, .025, 17], grainScale: 7, speckScale: 23, tintBase: .65, tintSkin: 1.2,
  // A thin grime film under the blood keeps the face from reading clean at a distance.
  grime: .22,
  // Only materials with at least this many vertices inside the face oval get a clone.
  minFaceVertices: 12,
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
