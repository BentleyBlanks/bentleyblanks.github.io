// 01–02 first person, storyboard round (contract docs/Data_FirstLevelStoryboard0103Contract.md §4.3,
// Notion 《过场动画分镜图》 SB01–SB06, survey Survey_A.md / Survey_B.md 「第一人称」 rows).
// Pure data (no three). Script_OpeningFirstPerson merges EXTRA_HAND_POSES over
// Data_OpeningStoryboards.firstPerson.hands.poses, solves LEG_POSES on the kept leg triangles of the
// NRA02 player body and places FP_PROPS. The director names them in its beats (second wave):
//   beats.<phase> = { keys:[[t, leftPose, rightPose], ...], legs:"<LEG_POSE>" | [[t,"<LEG_POSE>"],...],
//                     props:["<FP_PROP>", ...] }
// A phase with only legs/props (no keys) keeps its hands on the director's code path (the loading rifle
// in Banter/Orders/Incoming); a phase with keys replaces that path.
//
// Hand pose frames (same as the base table): "cam" camera-local (x right, y up, +z back), "body" the eye
// with yaw-only axes, "ground" body axes with y measured up from the ground under the hand. Poses are the
// RIGHT hand; the left hand mirrors x. New here:
//   - "partner": the palm is solved onto a bone of another actor (like `grasp`, but the partner's own arm
//     stays on his clip). { partner:"<ijaA|luo|interpreter|castId>", bone:"forearmL|forearmR|upperArmL|
//     upperArmR|chest", at: 0–1 from the bone to its child joint (atLeft for the left hand),
//     offset:[side, out, along] m in the bone's frame (out = towards the eye), boneLeft: another bone for the
//     left hand (default `bone`), wrap: +1 fingers over the
//     top / −1 under, twistDeg: fingers turned about the back of the hand, slipM: contact error past which
//     the hand lets go (eases to `fallback`), fallback: pose used while the partner is missing or slipped,
//     sh: optional shoulder override as below }.
//     A missing partner is reported (firstPersonState.hands.<side>.partner.missing + one console warning),
//     never silently re-aimed at something else.
//   - `sh`: a shoulder override [x,y,z] camera-local (right-hand coordinates) for reaches that need the
//     shoulder brought forward (the default root sits 0.14 m behind the eye; the palm reaches ~0.52 m).
//   - `shape`: a finger shape from HAND_SHAPES (per-finger curls, splay, thumb) instead of one curl for all
//     five fingers. `c` stays the curl mixed between keys when a shape is absent.
const Freeze = (value) => Object.freeze(value);
const V = (...v) => Freeze(v);
const H = (frame, p, f, n, c, extra = {}) => Freeze({ in: frame, p: V(...p), f: V(...f), n: V(...n), c: V(...c), ...extra });
//   - `minEyeM`: a partner point nearer the eye than this is not grasped (the hand stays on / eases to its
//     fallback until the point moves out; the same rule as flingOpen's 「不许半屏肉色」). 0 = no limit (SB05
//     holds the forearm that is right under the chin).
//   A partner grip is only "held" once the palm has reached it (transition eased in, contact within slipM).
//   Before that, a point out of reach (farther from the shoulder than the palm can get, plus slipM) or nearer
//   the eye than minEyeM keeps the hand on its fallback from the very first frame instead of reaching into
//   the lens; once held, an out-of-reach contact lets go one way (slipM) until the pose changes.
// Sleeve roots: every `sh` keeps the shoulder root at least SHOULDER_BEHIND_MIN_M behind the eye (the cut arm
// root must never come into view: Script_FirstLevelCampaignOpening minShoulderBehind > 0.08 and
// Script_OpeningFirstPersonTest). The mud reaches therefore end ~0.45–0.5 m from the eye (not 0.55–0.6).
export const SHOULDER_BEHIND_MIN_M = .1;
const G = (partner, bone, at, extra = {}) => Freeze({ in: "partner", partner, bone, at, c: V(55, 70, 48), wrap: 1, twistDeg: 0,
  offset: V(0, .045, 0), slipM: .09, minEyeM: 0, fallback: "rest", shape: "grip", ...extra });

// Finger shapes (ApplyAnatomicalFingers contact fields): fingers[0] is the thumb (segments 1–2; segment 0
// follows thumbDirection in the hand's anatomical frame: x across the palm, y back of the hand, z fingers),
// fingers[1..4] index..little [proximal, middle, distal] degrees; splay degrees per finger; thumbRoll degrees.
// Written for the right hand; the left mirrors thumb x, splay and roll.
export const HAND_SHAPES = Freeze({
  // SB01 「掌心朝上托一排 5 发桥夹」: a shallow cup, thumb laid along the clip.
  cradle: Freeze({ fingers: Freeze([V(0, 12, 16), V(16, 24, 16), V(18, 26, 16), V(20, 28, 18), V(24, 30, 20)]), splay: V(0, -3, 0, 3, 6), thumbDirection: V(.62, .05, .78), thumbRoll: -10 }),
  // SB02 「右手张开甩向洞口」: spread wide, barely curled.
  fling: Freeze({ fingers: Freeze([V(0, 4, 6), V(4, 6, 4), V(6, 8, 5), V(8, 10, 6), V(10, 12, 8)]), splay: V(0, -14, -4, 7, 17), thumbDirection: V(.8, -.05, .6), thumbRoll: 0 }),
  // SB04/04A/05 「抓住……前臂」: a closed wrap round a forearm (~0.09 m across), thumb opposed.
  grip: Freeze({ fingers: Freeze([V(0, 24, 30), V(58, 68, 46), V(62, 72, 48), V(64, 74, 48), V(66, 76, 50)]), splay: V(0, -3, 0, 3, 6), thumbDirection: V(.15, -.78, .6), thumbRoll: -20 }),
  // SB05A 「手按在日兵甲身上」: flat, fingers a little apart.
  press: Freeze({ fingers: Freeze([V(0, 10, 10), V(12, 16, 8), V(14, 18, 10), V(16, 20, 10), V(18, 22, 12)]), splay: V(0, -6, 0, 4, 9), thumbDirection: V(.6, -.25, .75), thumbRoll: 0 }),
  // SB03A 「手掌按在泥里向前够」: spread and pressing.
  claw: Freeze({ fingers: Freeze([V(0, 8, 10), V(10, 16, 12), V(12, 18, 12), V(14, 20, 14), V(16, 22, 16)]), splay: V(0, -10, -2, 6, 14), thumbDirection: V(.72, -.22, .66), thumbRoll: 0 }),
});

export const EXTRA_HAND_POSES = Freeze({
  // SB01: the LEFT palm up with a five-round clip, low centre-left (survey target screen (0.33,0.80)).
  // Original -15 degree shot targets in the yaw-only body frame: looking down cannot pull the hand into the jacket.
  palmClip: H("body", [.14, -.2284, -.3115], [-.38, -.143, -.997], [.28, -.953, .307], [18, 26, 16], { shape: "cradle" }),
  palmClipTilt: H("body", [.135, -.2262, -.3224], [-.32, -.066, -1.018], [.16, -.974, .23], [18, 26, 16], { shape: "cradle" }),
  // SB02: the RIGHT hand flung open towards the mouth, ≥0.35 m from the eye (not a half-screen of skin);
  // survey target screen (0.72,0.45) in the mirrored shot. Storyboard: the back of the hand to the eye, the
  // spread fingers up and out in the picture plane (review 09-25: fingers pointing into the frame foreshortened
  // to a fist) — fingers (0.4,0.85,−0.3), back of the hand ~0.8 towards the eye (node bench).
  flingOpen: H("cam", [.22, -.03, -.33], [.4, .85, -.3], [-.1, .35, .93], [5, 8, 5], { shape: "fling" }),
  // SB04: the RIGHT hand round ijaA's LEFT forearm (the arm holding the collar: the manifest contacts of
  // IjaHoldCollarUp / IjaCollarDragSnag are handL), fingers over the top. Not while that forearm is inside
  // 0.35 m of the eye (the strike swings it into the lens: review 09-25 had half a screen of bare arm).
  gripForearm: G("ijaA", "forearmL", .55, { minEyeM: .35 }),
  // SB04A: Shunzi's hand on the sleeve of the arm that drags him (ijaA's left), near the cuff; lets go at 5 cm
  // (at 9 cm the review saw the hand hover 8 cm off the sleeve and still count as holding).
  gripSleeve: G("ijaA", "forearmL", .78, { offset: V(0, .05, 0), twistDeg: -15, slipM: .05, minEyeM: .35 }),
  // SB05: both hands at the bottom of frame on the arm holding the collar. Browser bench 09-25 at the contract
  // camera (eye 0.75, pitch +3): his collar forearm runs from under the chin down out of frame (elbow at the
  // bottom edge), so the hands hold the arm at the elbow — the right just below it on the forearm, the left
  // just above it on the upper arm — and both show at the bottom (palms ≈ (0.59,0.76) and (0.63,0.95); on
  // the forearm alone only one hand was in frame).
  // TengxianHumanoidV1 (2026-09-26): ijaA's upper arm is 15 % shorter on the common skeleton and rests level; at .65 the left hand
  // stopped 3.6 cm short of its point (node bench); at .75 it holds ~5 cm above the elbow (8 cm before).
  gripArm: G("ijaA", "forearmL", .05, { boneLeft: "upperArmL", atLeft: .75 }),
  // SB05A: the RIGHT palm flat on ijaA's chest, left of centre (storyboard hand ≈ (0.3,0.5)); the shoulder comes
  // forward to reach across (his right upper arm, 0.7 m from the shoulder, is out of reach); it slides off as
  // he turns (slipM).
  // Shoulder root 0.1 m behind the eye (was 0.08: exactly on the sleeve-root guard) and low (0.3 m under it), so
  // the upper arm passes under the frame (browser bench 09-25: at 0.24 m under the eye the rolled sleeve showed as
  // a pale flat patch in the lower right corner); palm on the chest within 0.053 m.
  pressBody: G("ijaA", "chest", .35, { offset: V(-.03, .07, 0), twistDeg: 60, slipM: .06, fallback: "flat", shape: "press", c: V(12, 16, 10), sh: V(.08, -.3, .1) }),
  // SB03: the RIGHT palm flat in the mud at the lower right (base `flat` is 0.25 m). The shoulder stays 0.1 m
  // behind the eye (review 09-25: the old 0.12 m forward shoulder showed the cut sleeve root), which leaves the
  // palm 0.44 m out, 0.52 m from the eye — at the eye 0.26 m up / pitch +5° that is the bottom edge (palm
  // ≈ (0.76,1.0), fingers into the frame). Fingers turned to the upper left as in the storyboard, back of
  // the hand to the eye (dorsal·eye 0.85, node bench; it read as one finger edge-on before).
  palmMud: H("ground", [.26, .04, -.44], [-.6, -.08, -.8], [-.05, .65, .75], [8, 12, 8], { shape: "claw", sh: V(.2, -.2, .1) }),
  // SB03A: the LEFT arm out from the lower left, palm pressing the mud ahead of the eye (further than `reach`,
  // 0.29 m). Shoulder 0.1 m behind the eye (see palmMud): the palm ends 0.44 m out, 0.48 m from the eye, at
  // about (0.35,0.78) at eye 0.18 / pitch +4° (storyboard (0.33,0.6); the task's ~0.55 m needs the shoulder
  // in front of the eye). Fingers turned out to the left so the back of the hand shows (dorsal·eye 0.33).
  reachLeft: H("ground", [.14, .05, -.44], [.6, -.1, -.8], [-.3, .7, .6], [10, 16, 12], { shape: "claw", sh: V(.19, -.16, .1) }),
});

// Legs (the kept leg and boot triangles of the NRA02 body). Frame: the eye with yaw-only axes (x right,
// z back), y measured up from the ground under the point. hip = pelvis centre; up = the pelvis' up
// direction (a man sitting back against a wall tilts it back, +z); per leg: ankle target, knee = the
// direction the kneecap points, flexDeg bends the foot about the knee axis (+ toes up).
// NRA02 leg: thigh 0.39 m, calf 0.39 m, ankle 0.10 m up, toe 0.15 m ahead of the ankle.
const Leg = (ankle, knee, flexDeg = 0) => Freeze({ ankle: V(...ankle), knee: V(...knee), flexDeg });
export const LEG_POSES = Freeze({
  // SB01 (eye 0.95, pitch −15°): sitting against the back wall, legs out towards the mouth, right knee
  // up under the loading rifle (bolt low right), left leg longer.
  // Hips sit just behind the eye, jacket leaning back, feet ahead of the seat. Move the whole seated
  // pose together: the old hips ahead of the eye put the restored torso in front of the camera.
  sitForward: Freeze({ hip: V(.02, .4, .1), up: V(0, .95, .3),
    l: Leg([-.25, .1, -.52], [-.2, 1, -.1], 5), r: Leg([.3, .1, -.25], [.15, 1, 0], 0) }),
  // SB02 (eye falling to 0.75, roll +17°): thrown down, legs sprawled in the foreground, one knee up.
  sprawl: Freeze({ hip: V(0, .16, -.22), up: V(-.2, .7, .7),
    l: Leg([-.36, .09, -.95], [-.5, 1, 0], -5), r: Leg([.2, .12, -.6], [.1, 1, .1], 10) }),
  // SB03–SB04A (eye 0.18–0.35): on the side under the timber; the legs lie behind the head and must stay
  // out of frame (no leg through the camera). Hip 0.8 m behind the eye.
  lieSide: Freeze({ hip: V(.05, .16, .8), up: V(0, .1, -1),
    l: Leg([-.05, .1, 1.55], [0, .3, -1], 0), r: Leg([.15, .12, 1.52], [.3, .4, -1], 0) }),
  // SB06 (eye 0.72, pitch −8°): sitting against the spoil, both legs forward, right thigh and boot visible
  // low right.
  sitCover: Freeze({ hip: V(.02, .13, -.15), up: V(0, .9, .44),
    l: Leg([-.05, .1, -.9], [-.15, 1, -.05], 8), r: Leg([.48, .12, -.78], [.2, 1, 0], 12) }),
});

// Props of the first-person body. Geometry reuses the director's procedural clip and loading HanYang
// (Script_OpeningStoryboards.MakeSupplyProps), cloned; the strap is a small ribbon.
//   palmClipProp: on the named hand's palm frame; offset [x,y,z] m in that frame (y = back of the hand, so
//     negative sits it on the palm side), yawDeg turns it in the palm.
//   loadingRifleOnLegs: resting on the thighs at the mix of hip and knee (`along` 0 = hip, 1 = knee) of one
//     thigh (`thigh`) or of both, lifted `lift` m (the receiver sits there); its front grip is `gripAheadM`
//     further along the muzzle direction; muzzle direction and the up of the rifle in the body frame (x right, z back).
//     SB01 「枪栓朝镜头」: bolt (right side of the action) towards the eye, muzzle to the upper left.
//   rifleSlide: SB02 Blast 0.25–0.7 s (beat clock) the rifle slides `moveM` along `direction` (body frame at
//     the start of the slide), turning `spinDeg`, and settles `restM` above the ground.
//   packStrap: SB03A 「左边缘能看到背包带」: a canvas strap from the left shoulder root, camera-local points.
export const FP_PROPS = Freeze({
  palmClipProp: Freeze({ kind: "clip", hand: "l", offset: V(0, -.02, 0), yawDeg: 0 }),
  // The receiver on the right thigh short of the knee, muzzle forward-left (browser bench 09-25, variant B).
  loadingRifleOnLegs: Freeze({ kind: "rifle", thigh: "r", along: .6, lift: .07, gripAheadM: .2, muzzle: V(-.45, -.1, -.88), up: V(-.3, 1, .2) }),
  rifleSlide: Freeze({ kind: "track", prop: "loadingRifleOnLegs", t0: .25, t1: .7, direction: V(-.45, 0, -.55), moveM: .4, spinDeg: 28, restM: .03 }),
  // Canvas olive-drab with darker hems and a stitched band every few centimetres (vertex shades), a steel
  // buckle at buckleAt (0–1 along); review 09-25: the flat 0x4a4031 read as a black bar.
  packStrap: Freeze({ kind: "strap", widthM: .05, thickM: .006, color: 0x7a6a4a, hemShade: .62, stitchShade: .8, stitchEveryM: .035,
    buckleAt: .45, buckleColor: 0x8a8a82, buckleM: V(.034, .026, .006),
    // screen ≈ (0.02,0.25) → (0.18,1.0) down the left edge, 0.16–0.28 m in front of the eye
    points: Freeze([V(-.174, .051, -.16), V(-.19, 0, -.2), V(-.196, -.076, -.24), V(-.203, -.178, -.28)]) }),
});

// Leg pose changes ease over legBlendS (the hands use 0.5 s too); a slipped grip eases to its fallback over
// slipBlendS.
export const FIRST_PERSON_EXTRA = Freeze({ legBlendS: .5, slipBlendS: .25 });
