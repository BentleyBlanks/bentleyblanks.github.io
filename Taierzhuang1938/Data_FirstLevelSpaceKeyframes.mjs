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
import { FRONT_GUARD_POSTS, FRONT_FLANK_GROUP } from "./Data_FirstLevelMissionFront.mjs";

const W = (id) => TP[FrontTankIndex(id)];
/** Type 89 (Chi-Ro) heights above ground, metres: hull roof, turret top, gun axis, hull MG, turret MG. */
export const TANK_HEIGHTS = Object.freeze({ hullTop: 1.7, turretTop: 2.56, turret: 2.35, gun: 2.05, hullMg: 0.96, turretMg: 2.0 });
const T = TANK_HEIGHTS;
const Stand = [1.6, 1.2], Kneel = [1.0, 0.75], Crouch = [1.0, 0.7];

export const SPACE_KEYFRAMES = Object.freeze([
  { id: "K1", label: "01 dugout, waking low view", state: "BunkerCollapsed",
    camera: { x: -1.3, z: -126.2, eyeM: 0.42 }, look: { ...SP.bunkerJunction, h: 1.2 },
    targets: [
      { name: "kill spot (ijaA standing)", at: SP.bunkerKilling, heights: Stand, need: 2 },
      { name: "comrade against the trench wall (kneeling)", at: { x: 6.5, z: -123.1 }, heights: [1.0, 0.7], need: 2 },
      { name: "junction J (ijaD standing)", at: SP.bunkerJunction, heights: Stand, need: 2 },
      { name: "fold F (ijaC standing)", at: SP.bunkerFold, heights: Stand, need: 2 },
      { name: "rifle in the mouth", at: { x: 0.1, z: -125.7 }, heights: [0.08], need: 1 },
    ] },
  // C's intact-state check: before the collapse, sitting in the dugout, the roof must not hide the trench.
  { id: "K1i", label: "01 opening, intact dugout, sitting", state: "BunkerIntact",
    camera: { x: -1.3, z: -126.2, eyeM: 0.9 }, look: { ...SP.bunkerJunction, h: 1.2 },
    targets: [
      { name: "trench floor outside the mouth", at: SP.bunkerBend, heights: [0.6], need: 1 },
      { name: "a runner coming down the trench (J)", at: SP.bunkerJunction, heights: [1.5, 1.2], need: 2 },
    ] },
  { id: "K2", label: "02 over the translator's shoulder to the leader", state: "BunkerCollapsed",
    camera: { x: SP.shunziDragged.x, z: SP.shunziDragged.z, eyeM: 0.9 }, look: { ...SP.rearCorner, h: 1.4 },
    targets: [
      { name: "Luo at the rear corner RC", at: SP.rearCorner, heights: Stand, need: 2 },
      { name: "Luo halfway up the SSW leg", at: { x: -2, z: -116.5 }, heights: Stand, need: 2 },
      { name: "RC frame lintel (landmark)", at: SP.rearCorner, heights: [2.3], need: 1, ignore: ["RearCornerLintel"] },
    ] },
  // 02 return-of-control spot: the mouth spoil hides it from the fold F and the junction J.
  { id: "K2b", label: "02 return spot behind the mouth spoil", state: "BunkerCollapsed",
    camera: { x: A.bunkerRear.x, z: A.bunkerRear.z, eyeM: 1.0 }, look: { ...SP.bunkerFold, h: 1.5 },
    targets: [
      { name: "ijaC at the fold F (standing)", at: SP.bunkerFold, heights: [1.6, 1.2], mustHide: true },
      { name: "a man at the junction J (standing)", at: SP.bunkerJunction, heights: [1.6, 1.2], mustHide: true },
    ] },
  { id: "K3", label: "03 observation step: guards, gap, burning nest", state: "BunkerIntact", frameDeg: 80,
    camera: { x: SP.observation.x, z: SP.observation.z, eyeM: 1.6 }, look: { x: -7.3, z: -154.6, h: 1.0 },
    targets: [
      // Every guard reads kneeling (both heights) AND lying (0.5 m, the AI's prone chest): 09.23 review found 7 of 8
      // prone in the engine and hidden by the scrape lip.
      ...FRONT_GUARD_POSTS.map((p, i) => ({ name: `guard ${i} kneeling in the scrape`, at: p, heights: Kneel, need: 2 })),
      ...FRONT_GUARD_POSTS.map((p, i) => ({ name: `guard ${i} lying in the scrape`, at: p, heights: [0.5], need: 1 })),
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
      // 05 the tank holds Block until its track is cut (Squeeze is reserved, the brain never goes there): the turret that
      // swings onto the attack branch's last metres shows from the throw spot too.
      { name: "tank turret at Block through 05", at: W("Block"), heights: [T.turret, T.turretTop], need: 1 },
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
