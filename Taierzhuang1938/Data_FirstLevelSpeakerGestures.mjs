// Speaking gestures for first-level 03-06 (user, 2026-09-25: 04-06 speakers get hand gestures, not only the head).
// Pure data (no three). Design, layering and the inventory rationale: docs/Data_CharacterSpeech.md, section
// "Speaker gestures (03-06)". Timing and weight numbers belong in Data_Tuning_CharacterSpeech.SPEAKER_GESTURE.
//
// Who can gesture: every 03-06 body the speaker binder resolves: luo (NRA05); zhou, heyoutian, liuwencai, guard,
// keeper, relief, runner (NRA02) -- Data_FirstLevelSpeakingCast. The clips are baked on the two rigs LugouNra02 and
// LugouNra05 (a model that borrows clips through CHARACTER_CLIP_SOURCE_BY_MODEL would use its source's). 06
// ZhouLift's bearer is a MissionPeople layout figure without a skeleton: no gesture.
//
// A rifle hangs on the right hand (Script_Actor._UpdateRiggedWeaponMount: the weapon sits on the right grip and
// aims at the left grip), so anybody holding a weapon gestures with the LEFT hand only, and the weapon keeps the
// direction it had before the gesture moved the left hand. The seated 06 Zhou holds no weapon and gestures with
// the RIGHT hand. A speaker who is firing, aiming (aim > .6), in melee, carrying, prone or acted by the 01-03
// storyboard director gets no gesture (head layer only).

/** Baked arm clips: _import/Script_SpeakerGestureBake.py (Blender, both rigs) writes the manifest and one file per rig
 * here; Script_SpeakerGestureClips loads them on first use (01-06 only, never at boot). */
export const SPEAKER_GESTURE_ASSET = Object.freeze({
  version: "20260925SpeakerGesturesV1",
  animationBase: "./Animation/SpeakerGestures/",
  manifest: "Data_SpeakerGesturesAnimation.json",
});

/**
 * Gesture clips (baked 2026-09-25 on LugouNra02 and LugouNra05, 30 fps). Seconds are clip time; the bake's CLIPS table
 * must carry the same windows (Script_SpeakerGestureTest compares them with the manifest).
 *   hand    L | R: the arm the clip moves (clavicle, upper arm, forearm, hand and fingers of that side)
 *   inS     the layer weight rises 0 -> 1 over [0, inS] (the arm lifts off the rifle / knee)
 *   strokeS the accented frame (finger out, palm down, flick), lined up with the line's first stress
 *   hold    [a, b]: repeated while the line lasts longer than the clip, with a small beat on each stress
 *   outS    the layer weight falls 1 -> 0 over [outS, duration]: the arm goes back to what the body is doing
 *   aim     the upper arm is turned so that shoulder -> hand points at the line's target (cone: tuning table)
 *   reach   the arm is re-aimed (two-bone reach) so the grip lands on this anchor of the rig's live head (the manifest's
 *           per-rig `anchors`: where the grip was at the stroke, in the head bone's frame), because the body clip and
 *           the head layer turn the head away from where the clip was authored
 */
export const SPEAKER_GESTURE_CLIPS = Object.freeze({
  GesturePointL: Object.freeze({ hand: "L", duration: 1.8, inS: .35, strokeS: .40, hold: [.45, 1.15], outS: 1.25, aim: true,
    note: "index finger out, arm up to shoulder height toward the target, wrist straight" }),
  GestureWaveOnL: Object.freeze({ hand: "L", duration: 1.6, inS: .30, strokeS: .48, hold: [.40, 1.00], outS: 1.10, aim: true,
    note: "go / move up: flat hand lifted beside the head, chopped forward and down toward the target" }),
  GestureBeckonL: Object.freeze({ hand: "L", duration: 1.8, inS: .30, strokeS: .55, hold: [.35, 1.20], outS: 1.30, aim: false,
    note: "come / follow me: the forearm swings from out in front back past the shoulder, twice" }),
  GestureDownL: Object.freeze({ hand: "L", duration: 1.4, inS: .25, strokeS: .40, hold: [.35, .90], outS: .95, aim: false,
    note: "get down / keep low: palm down at chest height, pushed down twice" }),
  GestureBeatL: Object.freeze({ hand: "L", duration: 1.6, inS: .30, strokeS: .50, hold: [.40, 1.05], outS: 1.10, aim: false,
    note: "assigning / explaining: open hand half raised, small downward beats" }),
  GestureAskR: Object.freeze({ hand: "R", duration: 1.6, inS: .35, strokeS: .55, hold: [.50, 1.10], outS: 1.15, aim: true,
    note: "asking for something: open palm up, held out low toward the listener" }),
  GestureToMouthR: Object.freeze({ hand: "R", duration: 1.8, inS: .40, strokeS: .60, hold: [.55, 1.20], outS: 1.30, aim: false, reach: "mouth",
    note: "index and middle finger lifted to the cigarette at the lips, then away" }),
  GestureOfferR: Object.freeze({ hand: "R", duration: 2.2, inS: .45, strokeS: .70, hold: [.65, 1.60], outS: 1.70, aim: true,
    note: "handing over: the arm extends toward the listener, fingers loosely closed as if holding a cigarette" }),
  GestureHaltR: Object.freeze({ hand: "R", duration: 1.4, inS: .25, strokeS: .35, hold: [.35, .90], outS: .95, aim: false,
    note: "wait: palm raised toward the listener at shoulder height" }),
  GestureFlickR: Object.freeze({ hand: "R", duration: 1.2, inS: .20, strokeS: .38, hold: [.40, .70], outS: .75, aim: false,
    note: "dismissive back-hand flick out and away (annoyed)" }),
});

/**
 * Pointing targets. `sortie:<key>` / `space:<key>` are anchors in Data_FirstLevelFrontRoute (FRONT_SORTIE /
 * FRONT_SPACE); `listener` is whoever the head layer looks at (the player by default); `tank` is the live tank
 * (a runtime provider); `south` is a point 30 m due south (+Z) of the speaker. The anchors are checked on screen
 * in Step 3; a target outside the arm's cone is clamped to the cone's edge.
 */
export const SPEAKER_GESTURE_TARGETS = Object.freeze({
  rightNest: "sortie:nest",       // FrontBlockade: the right position with the burning broken wall that seals the way
  gap: "sortie:gap",              // the one gap in the backslope
  leftGun: "sortie:leftSeat",
  ammoHouse: "sortie:house",
  ammoBox: "sortie:bundle",
  attackBranch: "sortie:throw",   // the attack branch's end at the road-side ruin
  safeZone: "space:safeZone",
  south: "south",
  tank: "tank",
  listener: "listener",
});

/**
 * Every 03-06 line spoken by a body (shunzi is the player; the bearer has no skeleton). gesture null = no gesture
 * on purpose (head turn, nods and breath only). 22 of the 45 lines gesture: commands and pointing first; in the
 * front scenes nobody gestures on two of his own lines in a row, and questions and replies stay still. The 06
 * cigarette talk (BorrowLight, ZhouLift) is the exception: a seated conversation carried by its hands. Lines said
 * at the gun or while shooting keep their entry, but the runtime drops the gesture while the body is busy.
 * `pose` is the posture expected from the 2026-09-24 code (to be measured in Step 3):
 *   gun (at the machine-gun emplacement) | crouch | kneel | stand | move | seat.
 */
const Row = (who, pose, gesture = null, target = null) => Object.freeze({ who, pose, gesture, target });
export const FIRST_LEVEL_SPEAKER_GESTURES = Object.freeze({
  // 03 Support. Cold start: head layer and gestures. Run from 01: the storyboard director still acts the squad in
  // this step (its own PointBlockade on FrontBlockade.02) and both shared layers yield to it.
  "FrontBlockade.01": Row("zhou", "gun", "GesturePointL", "rightNest"),
  "FrontBlockade.02": Row("luo", "crouch", "GesturePointL", "rightNest"),
  "FrontBlockade.03": Row("luo", "crouch"),
  "FrontApproach.01": Row("luo", "move"),
  "FrontApproach.02": Row("luo", "crouch", "GestureWaveOnL", "gap"),
  "FrontAttack.01": Row("luo", "crouch"),
  "FrontWithdraw.01": Row("luo", "crouch", "GestureBeckonL", "listener"),
  // 04 MachineGun (TankTerror and BundleOrder are said while the tank blocks the gap, still in this step)
  "TakeOverGun.01": Row("luo", "crouch", "GesturePointL", "leftGun"),
  "TakeOverGun.02": Row("zhou", "gun"),
  "TakeOverGun.03": Row("luo", "crouch"),
  "TankRoadContact.01": Row("heyoutian", "gun", "GesturePointL", "tank"),
  "TankRoadContact.02": Row("luo", "crouch"),
  "TankTerror.01": Row("luo", "crouch", "GestureDownL"),
  "BundleOrder.01": Row("guard", "kneel", "GesturePointL", "ammoHouse"),
  "BundleOrder.02": Row("luo", "crouch"),
  "BundleOrder.03": Row("luo", "crouch", "GestureBeckonL", "listener"),
  "BundleOrder.05": Row("luo", "crouch"),
  // 05 Tank
  "BundleGo.01": Row("heyoutian", "gun"),
  "BundleGo.02": Row("luo", "move", "GesturePointL", "ammoHouse"),
  "BundleProne.01": Row("luo", "crouch", "GestureDownL"),
  "BundleProne.02": Row("luo", "crouch"),
  "BundleSupply.01": Row("keeper", "crouch", "GesturePointL", "ammoBox"),
  "BundleSupply.02": Row("luo", "crouch"),
  "BundleReturnCall.01": Row("heyoutian", "gun"),
  "BundleReturnCall.02": Row("luo", "move"),
  "BundleAttack.01": Row("luo", "crouch", "GesturePointL", "attackBranch"),
  "BundleAttack.02": Row("luo", "crouch"),
  "BundleRetreat.01": Row("luo", "crouch", "GestureBeckonL", "listener"),
  "TankStopped.01": Row("heyoutian", "gun"),
  "TankStopped.02": Row("luo", "crouch"),
  "TankStopped.03": Row("liuwencai", "crouch"),
  "FrontRelief.01": Row("liuwencai", "crouch"),
  "FrontRelief.02": Row("relief", "stand", "GestureWaveOnL", "safeZone"),
  "FrontRelief.03": Row("luo", "move"),
  // 06 Orders (the rally point)
  "Volunteer.01": Row("runner", "crouch", "GesturePointL", "south"),
  "Volunteer.02": Row("luo", "stand"),
  "Volunteer.03": Row("runner", "crouch"),
  "Volunteer.05": Row("luo", "stand", "GestureBeatL"),
  "BorrowLight.01": Row("zhou", "seat", "GestureAskR", "listener"),
  "BorrowLight.03": Row("zhou", "seat", "GestureToMouthR"),
  "BorrowLight.05": Row("zhou", "seat"),
  "BorrowLight.07": Row("zhou", "seat", "GestureOfferR", "listener"),
  "BorrowLight.09": Row("zhou", "seat"),
  "ZhouLift.02": Row("zhou", "seat", "GestureHaltR", "listener"),
  "ZhouLift.04": Row("zhou", "seat", "GestureFlickR"),
});

/** The gesture row for a per-line voice sample's lineId ("<Scene>.<NN>"), or null (no gesture on that line). */
export function SpeakerGestureForLine(lineId) {
  const row = Object.hasOwn(FIRST_LEVEL_SPEAKER_GESTURES, lineId) ? FIRST_LEVEL_SPEAKER_GESTURES[lineId] : null;
  return row?.gesture ? row : null;
}
