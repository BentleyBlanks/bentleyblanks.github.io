// 01 Banter/Orders: what Shunzi does from Luo's order (「弹装起！往后沟撤！跟紧！」, director flag exitAt) to the mouth of the
// dugout. Pure data (no three); Script_OpeningFirstPersonGear evaluates it, Script_OpeningFirstPerson poses the arms and
// props from it, Script_OpeningStoryboards drives the eye from it (FollowShot / FollowPoint).
//
// 2026-09-29 (user: 「主角收拾装备增加一个转身背起自己的背包拿起枪然后匆匆往门口赶，不然现在的设定走的太慢了」). Before this he stood up
// on the spot, pressed the charger into the rifle, turned it over to look at both sides and walked to the mouth at 0.24 m/s
// (firstPerson.followUp, 1.5 m in 6 s). Now, in one hurried run of actions:
//   stand up with the rifle  ->  finish loading (thumb, bolt)  ->  sling it over the left shoulder  ->  turn round to the pack
//   lying at the foot of the west earth wall  ->  crouch, take both shoulder loops  ->  straighten up and swing the pack over the
//   right shoulder onto his back (the eye sinks under the weight)  ->  tug the straps  ->  pull the rifle off his shoulder into
//   his hands  ->  turn back to the mouth and run there (1.9 m/s), the rifle at the ready.
// The pack stays on his back: from the black on it is the one the fallen roof timber pins, the one that pulls tight in Wake
// (docs/Data_OpeningPinnedRescue20260927.md) and whose strap the left edge of SB03A shows (FP_PROPS.packStrap).
//
// Clock: t = seconds since the order. Units: metres, degrees (camera tracks). World X east, Z south; yaw in degrees as three.js
// actors (0 faces north -Z, +90 west, -90 east).
// Frames of an object key: "cam" (camera-local: x right, y up, +z back), "world" (x, z ground, y above the ground under it),
// "lap" (the pose the lap rifle had on the last seated frame; the key's other numbers are ignored).
// Frames of a hand key: "cam", "rifle" (rifle-local: muzzle -z, top +y, bolt side +x, origin at the right grip),
// "pack" (pack-local: x across, y up, +z the wearer's side, i.e. the back panel and the straps face +z, origin at the middle
// of the body). A hand key is [t, frame, position, finger direction, back of the hand, finger curl or shape name, shoulder root?].
const Freeze = (value) => Object.freeze(value);
const V = (...v) => Freeze(v);
const Deep = (value) => (value && typeof value === "object" ? Freeze(Array.isArray(value) ? value.map(Deep) : Object.fromEntries(Object.entries(value).map(([k, v]) => [k, Deep(v)]))) : value);

// Rifle-local grips (the HanYang's origin is the right hand's grip, bore axis on y = 0.035, butt plate at z +0.255).
const RIFLE_FORE = V(0, -.03, -.2);            // the left hand on the fore-end (what followUp.grip was)
// Hand poses on the rifle. Right: over the charger and the bolt (the old followUp.right, sped up), and the wrist grip.
const R_CHARGER = ["rifle", V(.03, .075, .06), V(-.3, 0, -.95), V(.5, .85, 0), V(45, 60, 45)];
const R_BOLT = ["rifle", V(.06, .05, .03), V(.3, -.2, -.9), V(-.3, .9, -.1), V(50, 64, 42)];
const R_WRIST = ["rifle", V(.02, -.02, .1), V(0, -.3, -.95), V(.9, .4, 0), V(55, 70, 45)];
const L_FORE = ["rifle", RIFLE_FORE, V(.2, .68, .55), V(-1, -.3, 0), V(45, 67, 37)];
// The rifle in front of him at the ready (the old followUp's last key), and slung over the left shoulder behind him (out of view).
const CARRY = ["cam", V(-.15, -.16, -.33), V(-.8, .45, -.2), V(0, .5, .85), RIFLE_FORE];
// Low ready for the run and the wait at the mouth: muzzle ahead and a little left, below the middle of the view, the fore-end in the
// left hand low in front, the butt at the right hip. CARRY held on (port arms, muzzle to the upper left a third of a metre from the
// eye) laid the rifle across the whole left of the picture (review 09-30 「咋是这个画面」).
const READY = ["cam", V(-.06, -.21, -.36), V(-.22, .08, -.97), V(.15, .98, .1), RIFLE_FORE];
const SLUNG = ["cam", V(-.4, -.34, .36), V(0, -1, -.1), V(1, 0, 0), RIFLE_FORE];
// Hands hanging low at the sides, below the frame while he looks ahead.
const L_LOW = ["cam", V(-.2, -.34, -.28), V(.2, -.4, -.9), V(-.3, .9, .3), V(20, 30, 20)];
const R_LOW = ["cam", V(.2, -.34, -.28), V(-.2, -.4, -.9), V(.3, .9, .3), V(20, 30, 20)];
// Both fists on the shoulder loops of the pack (pack-local), and tugging the straps (FP_PROPS.gearStrapL / R) at the lower corners.
// (the shoulder roots come in and up for the reach: with the eye near the floor the ones behind it are too far from the pack)
const L_LOOP = ["pack", V(-.11, .1, .16), V(.35, -.4, -.85), V(-.2, .9, .35), "grip", V(-.18, -.12, .1)];
const R_LOOP = ["pack", V(.11, .1, .16), V(-.35, -.4, -.85), V(.2, .9, .35), "grip", V(.18, -.12, .1)];
const L_TUG = ["cam", V(-.22, -.15, -.3), V(.4, -.5, -.75), V(-.3, .85, .4), V(50, 66, 46)];
const R_TUG = ["cam", V(.22, -.15, -.3), V(-.4, -.5, -.75), V(.3, .85, .4), V(50, 66, 46)];

export const OPENING_GEAR_UP = Deep({
  version: "20260929OpeningGearUpV3",
  // The whole action done: at shunzi.followTo with the pack on and the rifle at the ready. A stage jump straight into Incoming
  // starts the clock this far along (PhaseIncoming), so he is already there.
  doneS: 6.4,
  // The director's view may turn this fast while the gear-up runs (rad/s; its own limit is Data_OpeningStoryboards.cameraTurnRps,
  // made for the director's cuts, and would drag the turn behind its keys).
  turnRps: 7,

  // ---- the eye ----------------------------------------------------------------------------------------------------
  cam: {
    // Heading (deg, unwrapped: -93 is the seat's look east, -248 the pack after a 155 deg turn to the right), pitch (+ up),
    // height above the floor (null = the seated eye), roll. Monotone cubic through the keys (an equal pair is a hold).
    yawDeg: [[0, -93], [.5, -96], [1.1, -102], [2.0, -248], [3.45, -252], [4.25, -94], [4.75, -90]],
    pitchDeg: [[0, -18], [.45, -30], [1.0, -24], [1.7, -30], [2.2, -50], [2.7, -46], [3.05, -24], [3.4, -14], [3.9, -10], [4.4, -6], [5.0, -3]],
    heightM: [[0, null], [.85, 1.32], [1.6, 1.28], [1.95, 1.0], [2.3, .76], [2.6, .78], [2.95, 1.1], [3.2, 1.3], [3.48, 1.22], [3.8, 1.32]],
    rollDeg: [[0, 0], [1.4, -1.5], [2.4, 1], [3.3, -2.2], [3.7, 0], [4.4, 1]],
    // From lookOut [t, blend s] the look leaves the keys for the men going out of the mouth (the wounded comrade in Incoming).
    lookOut: [4.9, .8],
    // Where the eye stands: a smooth step to `pad` (where the pack lies at his feet), then the run to followTo.
    moves: [{ t0: 1.1, t1: 2.0, to: "pad" }, { t0: 4.0, to: "followTo", mps: 1.9, rampS: .45, stopEaseM: .5 }],
    pad: { x: -2.18, z: -125.7 },
    // The run's bob (up and down once a stride), sway and pitch nod, scaled by the pace as a share of the run speed; and the breathing
    // of a man standing (rise and fall breathM, sway breathRad, breathHz) while the pace is low.
    bob: { m: .03, stepHz: 2.7, swayRad: .022, pitchRad: .012, breathM: .005, breathRad: .004, breathHz: .3 },
  },

  // ---- the rifle ------------------------------------------------------------------------------------------------------
  // Keys of the rifle itself: [t, frame, anchor point (frame coordinates), muzzle direction, top direction, rifle-local anchor].
  rifle: {
    keys: [
      [0, "lap"],
      [.3, "cam", V(-.15, -.07, -.36), V(-.85, .35, -.25), V(.05, .75, .65), RIFLE_FORE],
      [.78, "cam", V(-.15, -.07, -.36), V(-.85, .35, -.25), V(.05, .75, .65), RIFLE_FORE],
      [.97, "cam", V(-.15, -.09, -.35), V(-.9, .25, -.2), V(0, .7, .7), RIFLE_FORE],
      [1.12, ...CARRY],
      [1.25, ...CARRY],
      [1.65, ...SLUNG],
      [3.6, ...SLUNG],
      [4.1, ...READY],
    ],
    // The charger stands in the guide, is pressed down by the thumb and thrown out by the bolt (seconds, depth m, rifle-local).
    // ride: [t the hand starts riding, over s, t it lets go, over s] (the right hand stays on the rounds while they go down).
    charger: { at: V(0, .085, -.027), pressM: .036, press: V(.25, .74), offS: .86, thumbM: .01, thumbHz: 2.2, ride: V(.05, .18, .735, .085) },
  },

  // ---- the pack --------------------------------------------------------------------------------------------------------
  pack: {
    // Body 0.34 x 0.40 x 0.14, a blanket rolled over the top, two shoulder loops on the back panel (+z). The three shades are what the
    // soldier's own cloth is multiplied by (r, g, b) to read as khaki canvas, brown webbing and grey wool.
    sizeM: V(.34, .4, .14), rollM: V(.36, .06), loopM: V(.045, .32, .075),
    canvasShade: V(.8, .76, .66), strapShade: V(.5, .46, .38), rollShade: V(.52, .5, .46),
    // At rest: stood on its front against the earth slope, the straps towards the room, leaning back onto it.
    rest: { x: -2.4, z: -125.62, yawDeg: 90, leanDeg: 12 },
    keys: [
      [0, "world"],
      [2.45, "world"],
      [2.75, "cam", V(0, -.2, -.42), V(0, 0, -1), V(0, 1, 0)],
      [2.98, "cam", V(.05, -.1, -.4), V(.05, .25, -.97), V(-.04, .97, .24)],
      [3.15, "cam", V(.18, .02, -.32), V(.25, .5, -.83), V(-.3, .83, .47)],
      [3.32, "cam", V(.3, .12, -.16), V(.5, .4, -.77), V(-.55, .65, .52)],
      [3.46, "cam", V(.36, .18, .12), V(.6, .2, -.77), V(-.6, .6, .5)],
    ],
    onBackS: 3.46,
    // The two shoulder straps (FP_PROPS.gearStrapL / R) are drawn only while the hands tug them: left on, they lie across the lower
    // corners of the view as two dark bars all through the run and Incoming (review 09-30 「咋是这个画面」). Gone mid-turn back.
    strapsOffS: 3.9,
  },
  // The ammunition crate he sat on stays under him until he has left it.
  crate: { hideS: 4.4 },

  // ---- the hands ------------------------------------------------------------------------------------------------------
  hands: {
    l: [
      [0, ...L_FORE],
      [1.36, ...L_FORE],
      [1.7, ...L_LOW],
      [2.05, ...L_LOW],
      [2.45, ...L_LOOP],
      [3.0, ...L_LOOP],
      [3.35, ...L_TUG],
      [3.6, ...L_TUG],
      [3.98, ...L_FORE],
      [4.1, ...L_FORE],
    ],
    r: [
      [0, ...R_WRIST],
      [.23, ...R_CHARGER],
      [.735, ...R_CHARGER],
      [.82, ...R_BOLT],
      [.88, "rifle", V(.06, .05, -.04), V(.3, -.2, -.9), V(-.3, .9, -.1), V(50, 64, 42)],
      [.945, "rifle", V(.07, .02, -.04), V(.3, -.2, -.9), V(-.3, .9, -.1), V(50, 64, 42)],
      [1.09, ...R_WRIST],
      [1.2, ...R_WRIST],
      [1.5, ...R_LOW],
      [2.05, ...R_LOW],
      [2.5, ...R_LOOP],
      [3.32, ...R_LOOP],
      [3.55, ...R_TUG],
      [3.7, ...R_TUG],
      [4.05, ...R_WRIST],
    ],
  },

  // ---- sound (existing cues) -------------------------------------------------------------------------------------------
  // [t, cue, volume, pitch]: the cloth of the pack taken up, the buckles as it lands, the rifle taken again, the strides.
  cues: [
    [.35, "gearRattle", .5, 1],
    [1.5, "gearRattle", .45, .95],
    [2.4, "clothMove", .55, .95],
    [2.75, "clothMove", .6, 1],
    [3.3, "gearRustle", .7, 1],
    [3.75, "gearRattle", .55, 1.05],
    [4.15, "footstepDirt", .55, 1], [4.45, "footstepDirt", .6, 1.05], [4.75, "footstepDirt", .6, 1],
    [5.05, "footstepDirt", .6, 1.05], [5.35, "footstepDirt", .55, 1],
  ],
});
