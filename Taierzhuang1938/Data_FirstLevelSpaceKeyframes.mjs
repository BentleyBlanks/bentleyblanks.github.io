// 第一关 01–06 关键帧机位表（2026-09-23 空间重排，docs/Data_FirstLevelSpace0106_20260923.md §7）。
// Pure data, no three. X east, Z south, metres. Consumers:
//   · Script_FirstLevelSpaceProbe（静态视线：共享地面采样器 + 体块，逐目标逐高度判通视）
//   · Script_FirstLevelFrontTopologyTest（把每一帧的 need / mustHide 钉成断言）
//   · 实拍脚本（自由相机摆到 camera + eyeM，朝 look 看；yaw/pitch 由 look 算出，不在这里手写）
// camera.eyeM 是离共享地面的眼高；state 是掩蔽部场景态（01–02 用塌方态，03 以后用完好态）。
// targets[].heights 是目标点离地高度（人：站 1.6/1.2，跪 1.0/0.75，蹲沟 1.0/0.7）；
// need = 至少几个高度通视；mustHide = 一个高度都不许通视。frameDeg = 全部目标（frame:false 除外）须落在这么宽的水平视角里。
import { FRONT_SORTIE as S, FRONT_SPACE as SP, FRONT_TANK_PATH as TP, FrontTankIndex } from "./Data_FirstLevelFrontRoute.mjs";
import { MISSION_STAGE_ANCHORS as A } from "./Data_FirstLevelMissionTopology.mjs";
import { FRONT_GUARD_POSTS, FRONT_FLANK_GROUP, FRONT_GUARD_MG_GROUP } from "./Data_FirstLevelMissionFront.mjs";
import { OPENING_STORYBOARDS as Storyboards } from "./Data_OpeningStoryboards.mjs";

// Wave 1 of the 2026-09-25 storyboard round: the blocks K2 looks past (Data_OpeningStoryboards.wave1Allowances).
const WAVE1_IGNORE = [Storyboards.wave1Allowances?.revetment].filter(Boolean);

const W = (id) => TP[FrontTankIndex(id)];
/** The guards that hold the scrape through 03: every FRONT_GUARD_POSTS index except the backslope LMG pair's. */
function FrontGuardPosts03() {
  const pair = new Set(FRONT_GUARD_MG_GROUP.members.map((m) => m.guard));
  return FRONT_GUARD_POSTS.map((p, i) => ({ i, p })).filter(({ i }) => !pair.has(i));
}
/** Type 89 (Chi-Ro) heights above ground, metres: hull roof, turret top, gun axis, hull MG, turret MG. */
export const TANK_HEIGHTS = Object.freeze({ hullTop: 1.7, turretTop: 2.56, turret: 2.35, gun: 2.05, hullMg: 0.96, turretMg: 2.0 });
const T = TANK_HEIGHTS;
const Stand = [1.6, 1.2], Kneel = [1.0, 0.75], Crouch = [1.0, 0.7];

export const SPACE_KEYFRAMES = Object.freeze([
  // 2026-09-25 storyboard round (contract docs/Data_FirstLevelStoryboard0103Contract.md §2.1, SB03): Shunzi is pinned
  // in the dugout mouth itself (Data_OpeningStoryboards.shunzi.trap), the eye just inside the door posts and low
  // over the mud. The interrogation is at the comrade's wall root on the north wall 3.8 m out, J and F beyond it.
  { id: "K1", label: "01 dugout mouth, pinned low view (SB03)", state: "BunkerCollapsed",
    camera: { x: 0.35, z: -125.15, eyeM: 0.26 }, look: { x: 4.1, z: -125.6, h: 0.9 },
    targets: [
      { name: "ijaA holding the comrade (standing)", at: { x: 4.1, z: -125.63 }, heights: Stand, need: 2 },
      { name: "comrade kneeling at the north wall", at: { x: 4.06, z: -125.9 }, heights: [1.0, 0.7], need: 2 },
      { name: "junction J (ijaD standing)", at: SP.bunkerJunction, heights: Stand, need: 2 },
      { name: "fold F (ijaC standing)", at: SP.bunkerFold, heights: Stand, need: 2 },
      { name: "rifle in the mouth mud", at: { x: 1.25, z: -125.75 }, heights: [0.08], need: 1 },
    ] },
  // C's intact-state check: before the collapse, sitting at the back of the dugout (SB01 seat), the roof must not
  // hide the trench.
  { id: "K1i", label: "01 opening, intact dugout, sitting (SB01)", state: "BunkerIntact",
    camera: { x: -1.95, z: -126.25, eyeM: 0.95 }, look: { ...SP.bunkerJunction, h: 1.2 },
    targets: [
      { name: "trench floor outside the mouth", at: SP.bunkerBend, heights: [0.6], need: 1 },
      { name: "a runner coming down the trench (J)", at: SP.bunkerJunction, heights: [1.5, 1.2], need: 2 },
    ] },
  // 2026-09-25 storyboard round (contract §2.6, SB05): 02's circle closes in the SSW leg's north mouth
  // (Data_OpeningStoryboards.shunzi.dragged); held up by the collar he looks south past ijaA's shoulder down the straight
  // leg to Luo creeping up its west wall and He behind him. The eye sits in BunkerSouthRevetment until its east end is
  // opened (pendingWiring SB04A/SB05): the rows ignore it through Data_OpeningStoryboards.wave1Allowances.revetment.
  { id: "K2", label: "02 past ijaA's shoulder down the SSW leg to the leader (SB05)", state: "BunkerCollapsed",
    camera: { x: 0.6, z: -123.9, eyeM: 0.75 }, look: { x: -3.1, z: -116.9, h: 1.0 },
    targets: [
      { name: "Luo creeping up the SSW leg's west wall", at: { x: -3.1, z: -116.9 }, heights: Crouch, need: 2, ignore: WAVE1_IGNORE },
      { name: "ijaB standing guard in the leg", at: { x: 0.04, z: -119.94 }, heights: Stand, need: 2, ignore: WAVE1_IGNORE },
    ] },
  // 02 hand-back seat (contract §2.9, SB06: Data_OpeningStoryboards.shunzi.cover) east of the mouth rubble: J is in view
  // (its man is down by then, Liu's shot) and so is F -- a known exposure, recorded here as a need row: from the seat F is
  // 4.5° from J, and no seat within ±0.6 m hides F while J stays in view (09-25 grid probe), so no rubble can mask F alone.
  // The hand-back hold-fire covers it (Data_OpeningStoryboards.rescue.handbackHoldFireS; Script_FirstLevelCampaignOpening
  // asserts it). The old return spot behind the spoil (bunkerRear, both hidden) stays measured by Script_FirstLevelSpaceTest.
  { id: "K2b", label: "02 hand-back seat east of the mouth rubble (SB06)", state: "BunkerCollapsed",
    camera: { x: 2.4, z: -125.2, eyeM: 1.0 }, look: { ...SP.bunkerJunction, h: 1.2 },
    targets: [
      { name: "the junction J down the front trench", at: SP.bunkerJunction, heights: [1.6, 1.2], need: 2 },
      { name: "the fold F beyond J (known exposure, covered by the hand-back hold-fire)", at: SP.bunkerFold, heights: [1.6, 1.2], need: 2 },
    ] },
  { id: "K3", label: "03 observation step: guards, gap, burning nest", state: "BunkerIntact", frameDeg: 80,
    camera: { x: SP.observation.x, z: SP.observation.z, eyeM: 1.6 }, look: { x: -7.3, z: -154.6, h: 1.0 },
    targets: [
      // Every guard reads kneeling (both heights) AND lying (0.5 m, the AI's prone chest): 09.23 review found 7 of 8
      // prone in the engine and hidden by the scrape lip.
      // 09-25 storyboard round (contract Data_FirstLevelStoryboard0103Contract §2.11): guards 6 and 7 spend 03 as the
      // backslope LMG pair (FRONT_GUARD_MG_GROUP), not on their scrape posts, so six guards are measured in the scrape
      // and the pair where it lies (prone chest 0.5 m, and kneeling for the moment it comes down); the K3 job -- guards,
      // gap, burning nest in one look -- is unchanged, the frame gets narrower (the pair sits between the guards and the nest).
      ...FrontGuardPosts03().flatMap(({ i, p }) => [{ name: `guard ${i} kneeling in the scrape`, at: p, heights: Kneel, need: 2 },
        { name: `guard ${i} lying in the scrape`, at: p, heights: [0.5], need: 1 }]),
      ...FRONT_GUARD_MG_GROUP.members.flatMap((m) => [{ name: `LMG ${m.role} (guard ${m.guard}) lying on the backslope`, at: { x: m.x, z: m.z }, heights: [0.5], need: 1 },
        { name: `LMG ${m.role} (guard ${m.guard}) kneeling on the backslope`, at: { x: m.x, z: m.z }, heights: Kneel, need: 2 }]),
      { name: "the gap (a man crossing, crouched)", at: S.gap, heights: Crouch, need: 2 },
      { name: "nest MG muzzle over the west wall", at: { x: 24.0, z: -153.9 }, heights: [1.55, 1.4], need: 1 },
      { name: "nest gable peak (landmark)", at: { x: 37, z: -151.2 }, heights: [5.2, 4.4], need: 1,
        ignore: ["RightNestGablePeak", "RightNestEastGable"] },
      { name: "Zhou at the left gun (turn left, not in the frame)", at: S.leftSeat, heights: [1.1, 0.9], need: 1, frame: false },
    ] },
  // K4 is three looks from the captured gun, not one frame (gap west, flank group north-east, far road north-east:
  // 120 deg apart): K4 the gap, K4b the flank group's last line, K4c the road far segment.
  { id: "K4", label: "03 after capture: MG seat over the gap", state: "BunkerIntact", frameDeg: 40,
    camera: { x: S.seat.x, z: S.seat.z, eyeM: 1.5 }, look: { ...S.gap, h: 1.0 },
    targets: [
      { name: "the gap (crossing man)", at: S.gap, heights: Crouch, need: 2 },
    ] },
  { id: "K4b", label: "03 after capture: MG seat on the flank group's last line", state: "BunkerIntact", frameDeg: 40,
    camera: { x: S.seat.x, z: S.seat.z, eyeM: 1.5 }, look: { x: 39.6, z: -163.6, h: 1.0 },
    targets: FRONT_FLANK_GROUP.map((s) => ({ name: `${s.id} last line`, at: s.lane.at(-1), heights: Crouch, need: 1 })) },
  { id: "K4c", label: "03 after capture: MG seat on the far road", state: "BunkerIntact",
    camera: { x: S.seat.x, z: S.seat.z, eyeM: 1.5 }, look: { ...W("HullDown"), h: 2.0 },
    targets: [
      { name: "road far segment (HullDown turret)", at: W("HullDown"), heights: [T.turretTop, T.turret], need: 1 },
    ] },
  { id: "K5", label: "03 tank hull-down on the far road", state: "BunkerIntact",
    camera: { x: S.seat.x, z: S.seat.z, eyeM: 1.5 }, look: { ...W("HullDown"), h: 2.0 },
    targets: [
      { name: "HullDown turret", at: W("HullDown"), heights: [T.turretTop, T.turret], need: 2 },
      { name: "HullDown hull", at: W("HullDown"), heights: [T.hullTop - 0.05, 1.2, 0.7], mustHide: true },
      { name: "Start (out of sight)", at: W("Start"), heights: [T.turretTop, 1.2], mustHide: true },
    ] },
  { id: "K6", label: "04 tank out of the bend", state: "BunkerIntact",
    camera: { x: S.seat.x, z: S.seat.z, eyeM: 1.5 }, look: { ...W("BendExit"), h: 1.5 },
    targets: [
      { name: "Bend (behind NorthRuin)", at: W("Bend"), heights: [T.turretTop, T.hullTop, 1.0], mustHide: true },
      { name: "BendExit hull", at: W("BendExit"), heights: [1.0, T.hullTop], need: 2 },
      { name: "BendExit turret", at: W("BendExit"), heights: [T.turretTop], need: 1 },
      { name: "Pressure hull", at: W("Pressure"), heights: [1.0, T.hullTop], need: 2 },
    ] },
  { id: "K7", label: "04 rear wall looking back at the nest", state: "BunkerIntact",
    camera: { x: 29.7, z: -144.4, eyeM: 1.6 }, look: { ...S.seat, h: 1.2 },
    targets: [
      { name: "north wall top (HE impacts)", at: { x: 27.5, z: -156.8 }, heights: [1.35], need: 1, ignore: ["RightNestNorthLow"] },
      { name: "the MG seat through the rear door", at: S.seat, heights: [1.2, 0.9], need: 1 },
      { name: "tank at Block", at: W("Block"), heights: [T.turretTop, T.hullTop, 1.0], mustHide: true },
      { name: "tank at Pressure", at: W("Pressure"), heights: [T.turretTop, T.hullTop, 1.0], mustHide: true },
    ] },
  { id: "K8", label: "05 damaged lip: the same tank, standing up", state: "BunkerIntact",
    camera: { x: S.damagedLip.x, z: S.damagedLip.z, eyeM: 1.6 }, look: { ...W("Block"), h: 2.0 },
    targets: [
      { name: "tank at Block, turret", at: W("Block"), heights: [T.turretTop, T.turret], need: 1 },
      // Recognising the same tank needs more than a turret corner: the upper hull shows along 4 m of its length
      // (AttackRuinA, the attack branch's cover, hides the lower hull from here; that is the price of the 05 cover beat).
      ...[-1.2, 0, 1.2, 2.4].map((dx) => ({ name: `upper hull at ${dx} m along`, at: { x: W("Block").x + dx, z: W("Block").z }, heights: [T.hullTop + 0.1], need: 1 })),
    ] },
  { id: "K9", label: "05 attack position: the tank's rear quarter", state: "BunkerIntact",
    camera: { x: S.throw.x, z: S.throw.z, eyeM: 1.5 }, look: { ...W("Block"), h: 1.2 },
    targets: [
      { name: "tank side (hull centre)", at: W("Block"), heights: [1.2, 1.5], need: 2 },
      { name: "tank rear deck", at: { x: W("Block").x + 2.2, z: W("Block").z - 0.9 }, heights: [1.6, 1.4], need: 1 },
      { name: "tank after the 05 squeeze", at: W("Squeeze"), heights: [1.2, 1.5], need: 2 },
    ] },
  { id: "K10", label: "05 the gap reopens, the rest of the line crosses", state: "BunkerIntact",
    // 1 m north of the door's middle: the backslope wire's stakes fall clear below-left of the crossing man.
    camera: { x: SP.westDoor.x, z: SP.westDoor.z - 1.0, eyeM: 1.6 }, look: { ...S.gap, h: 1.2 },
    targets: [
      { name: "the gap (guard crossing, standing)", at: S.gap, heights: [1.4, 1.0], need: 2 },
    ] },
  { id: "K11", label: "06 back at the collection, borrowing a light", state: "BunkerIntact",
    // Look 30 deg east of Zhou: he sits right of centre at the wall's east end; the litter wall runs off the right
    // edge instead of filling half the frame, the collection and its litters fill the left.
    camera: { x: -36.5, z: -98.5, eyeM: 1.6 }, look: { x: -34.9, z: -95.9, h: 0.9 },
    targets: [
      { name: "Zhou sitting at the litter wall", at: { x: -36.4, z: -95.9 }, heights: [1.0, 0.8], need: 2 },
    ] },
]);
