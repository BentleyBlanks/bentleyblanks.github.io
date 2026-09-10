// 第一人称共享双臂的逐武器姿势与接触真相。纯数据，不 import three。
//
// 每件可检查的第一人称装备都必须在这里有完整条目：腰射/ADS 武器姿态、左右掌
// 接触坐标系、肩锚、肘极向量、手指闭合与机械动作族。枪族只负责给初值；导出的
// FPS_ARM_POSES 已经逐枪展开，运行时不再把 rifle/lmg/pistol 五个通用姿势当成答案。
//
// 坐标：武器局部 -Z 朝前、+Y 向上、+X 向右；rotation 是 YXZ 欧拉角。


const Freeze = (value) => Object.freeze(value);
const V = (x, y, z) => Freeze([x, y, z]);
const Contact = (position, rotation, curl, trigger = null, hand = {}) => Freeze({
  position: Freeze(position),
  rotation: Freeze(rotation),
  curl: Freeze(curl),
  trigger: Freeze(trigger || curl),
  ...hand,
});
const Body = (rightShoulder, leftShoulder, rightPole, leftPole) => Freeze({
  shoulders: Freeze({ right: Freeze(rightShoulder), left: Freeze(leftShoulder) }),
  elbowPoles: Freeze({ right: Freeze(rightPole), left: Freeze(leftPole) }),
});
const Sight = (eyeDistance, offset = V(0, 0, 0)) => Freeze({
  mode: "sight", eyeDistance, offset, rotation: V(0, 0, 0),
});
const FixedPose = (position, rotation) => Freeze({ mode: "fixed", position, rotation });
const StateContacts = (right, left) => Freeze({ right, left });
const WeaponPose = ({ family, hip, ads, sprint, right, left, adsRight = right, adsLeft = left,
  sprintRight = right, sprintLeft = left, bodyHip, bodyAds, bodySprint, actions }) => Freeze({
  family,
  hip: Freeze({ weapon: hip, body: bodyHip, contacts: StateContacts(right, left) }),
  ads: Freeze({ weapon: ads, body: bodyAds, contacts: StateContacts(adsRight, adsLeft) }),
  sprint: Freeze({ weapon: sprint, body: bodySprint, contacts: StateContacts(sprintRight, sprintLeft) }),
  contacts: Freeze({ right, left }),
  actions: Freeze(actions),
});

const CLOSED = V(56, 74, 46);
const SUPPORT = V(48, 66, 42);
const TRIGGER = V(16, 22, 10);
// Working-hand poses are blended with the per-weapon holding pose. The thumb
// opposes the fingers independently. MCP/PIP/DIP angles are ordered
// thumb/index/middle/ring/little; offsets and rotations are in prop space.
export const FPS_HAND_SHAPES = Freeze({
  open: Freeze({ fingers: Freeze([V(0,10,8),V(6,12,8),V(10,18,10),V(14,22,12),V(18,26,14)]), thumbDirection: V(0.4,-0.38,0.83), thumbRoll: 0, side: "r" }),
  bolt: Freeze({ side: "r", palmOffset: V(0.026,-0.035455,-0.00535), rotation: V(0.538599,2.871593,1.493996), fingers: Freeze([V(0,41.625,60),V(63.8,90,26.155),V(55.384,91.2,24.465),V(45,65,40),V(45,65,40)]), thumbDirection: V(-0.1,-0.533,-0.15), thumbRoll: -75, fingerSplay: Freeze([0,3.15,-10.5,0,0]) }),
  clip: Freeze({ side: "r", palmOffset: V(0.03075,-0.00139,-0.00392), rotation: V(-0.3048,3.296393,1.498796), fingers: Freeze([V(0,0,48.56),V(69.552,37.1,48.515),V(42.448,64.6,36.945),V(44.56,66,40),V(48.08,90,41.105)]), thumbDirection: V(0.466,-0.714,0.996), thumbRoll: -30, fingerSplay: Freeze([0,19.39,2.625,-4.34,0]) }),
  press: Freeze({ side: "r", palmOffset: V(0.035235,-0.023,-0.0354), rotation: V(-0.0868,3.127193,1.534796), fingers: Freeze([V(0,44.17,33.38),V(45,65,40),V(45,65,40),V(38.84,69.5,40),V(9.448,64.6,41.365)]), thumbDirection: V(0.241,-0.887,0.49), thumbRoll: -26.16, fingerSplay: Freeze([0,0,0,0.77,-29.61]) }),
  magazine: Freeze({ side: "r", palmOffset: V(0.02043,0.087715,-0.26688), rotation: V(0.0636,3.134393,1.947596), fingers: Freeze([V(0,36.27,60),V(64.976,15.2,60.515),V(54.152,65,24.14),V(53.008,67.8,29.275),V(56.616,54.2,47.905)]), thumbDirection: V(0.342,-0.627,1), thumbRoll: 42.6, fingerSplay: Freeze([0,11.025,8.68,-0.14,23.38]) }),
  pistolMagazine: Freeze({ side: "l", palmOffset: V(-0.01718,0.02595,-0.028105), rotation: V(0.3848,2.908793,-1.625996), fingers: Freeze([V(0,65,60),V(88,35.8,45.85),V(53.36,84.1,1.235),V(46.232,61,36.985),V(41.48,40.3,22.36)]), thumbDirection: V(0.165,-0.942,-0.378), thumbRoll: 45, fingerSplay: Freeze([0,-29.365,-35,-35,-35]) }),
  slide: Freeze({ side: "l", palmOffset: V(0.015715,0.06075,-0.03176), rotation: V(-0.414,2.3044,-0.114), fingers: Freeze([V(0,65,60),V(88,79.6,6.33),V(59.872,65,53.65),V(40.072,53.5,54.34),V(46.408,13,0)]), thumbDirection: V(0.3,0.02,0.1), thumbRoll: 29.4, fingerSplay: Freeze([0,-11.655,-35,-23.555,-35]) }),
});

const RifleBody = (leftZ = -0.600) => Body(
  V(0.170, -0.300, -0.100), V(0.000, -0.340, leftZ),
  V(0.34, -0.78, 0.18), V(-0.22, -0.82, 0.12),
);
const RifleAdsBody = (leftZ = -0.570) => Body(
  V(0.165, -0.285, -0.105), V(-0.010, -0.325, leftZ),
  V(0.30, -0.82, 0.12), V(-0.18, -0.86, 0.08),
);
const RifleSprintBody = (leftZ = -0.500) => Body(
  V(0.190, -0.315, -0.080), V(-0.020, -0.350, leftZ),
  V(0.40, -0.72, 0.22), V(-0.28, -0.76, 0.18),
);
const PistolBody = () => Body(
  V(0.170, -0.300, -0.100), V(-0.105, -0.335, -0.385),
  V(0.36, -0.78, 0.18), V(-0.34, -0.80, 0.16),
);
const PistolAdsBody = () => Body(
  V(0.145, -0.290, -0.185), V(-0.090, -0.325, -0.400),
  V(0.32, -0.82, 0.12), V(-0.30, -0.84, 0.12),
);
const ThrowableBody = () => Body(
  V(0.175, -0.305, -0.115), V(-0.115, -0.345, -0.335),
  V(0.38, -0.74, 0.20), V(-0.38, -0.76, 0.18),
);
const BladeBody = (leftZ = -0.500, rightZ = -0.145) => Body(
  V(0.185, -0.305, rightZ), V(-0.090, -0.350, leftZ),
  V(0.38, -0.74, 0.22), V(-0.34, -0.76, 0.18),
);

const RifleSprint = FixedPose(V(0.145, -0.200, -0.285), V(0.32, 0.44, 0.30));
const HanYangBody = () => Body(V(.19,-.40,.08),V(-.24,-.50,-.55),V(.30,-.80,.12),V(-.40,-.75,.12));
const PistolSprint = FixedPose(V(0.105, -0.140, -0.260), V(0.26, 0.38, 0.16));
const ThrowableSprint = FixedPose(V(0.155, -0.135, -0.385), V(-0.48, 0.34, 0.24));

export const FPS_ARM_POSES = Freeze({
  ZhongZheng: WeaponPose({
    family: "boltRifle", hip: FixedPose(V(0.100, -0.142, -0.320), V(0.045, -0.060, 0.028)), ads: Sight(0.550), sprint: RifleSprint,
    right: Contact(V(0.02322,-0.03986,-0.00875), V(0.2,3.135592654,1.576796327), CLOSED, TRIGGER, {"fingers":[[0,45.98,59.52],[0,49.3,13.52],[26.44,100,26.98],[65.65,76.5,0],[88,58.1,0]],"fingerSplay":[0,-20.3,7.88,-12.85,-26.91],"thumbDirection":[0.321,-0.9,0.388],"thumbRoll":-3.96,"triggerFingers":[0,51.3,14.52],"triggerSplay":0}),
    left: Contact(V(0.00847,-0.00447,-0.43417), V(-0.1122,1.531796327,-3.146392654), CLOSED, TRIGGER, {"fingers":[[0,62.53,3.72],[36.57,47.9,64.35],[22.94,65.1,43.57],[18.25,66.9,27.18],[19.14,42.9,22.37]],"fingerSplay":[0,35,17.39,-9.91,-32.27],"thumbDirection":[-0.797,-0.644,0.82],"thumbRoll":30,"triggerFingers":[12,28,18],"triggerSplay":0}),
    bodyHip: RifleBody(-0.600), bodyAds: RifleAdsBody(-0.575), bodySprint: RifleSprintBody(-0.515),
    actions: { bolt: { family: "turnBolt", timing: V(0.21, 0.52, 0.82) }, reload: { family: "stripper", timing: V(0.50, 0.64, 0.78) }, bayonet: "zhongZheng" },
  }),
  HanYang: WeaponPose({
    family: "boltRifle", hip: FixedPose(V(0.105, -0.145, -0.335), V(0.050, -0.055, 0.025)), ads: Sight(0.550), sprint: RifleSprint,
    right: Contact(V(0.01577,-0.03173,-0.02896), V(0.2,3.392992654,1.957596327), CLOSED, TRIGGER, {"fingers":[[0,29.01,17.52],[0,0,50.96],[50,78,35],[55,75,32],[60,70,28]],"fingerSplay":[0,-21.53,0,-4,-8],"thumbDirection":[-0.21,-1,0.596],"thumbRoll":4.8,"triggerFingers":[0,2,51.96],"triggerSplay":0}),
    left: Contact(V(0.00739,-0.0051,-0.41441), V(-0.1092,1.455796327,-3.112792654), CLOSED, TRIGGER, {"fingers":[[0,62.21,46.8],[19.06,100,9.68],[20.97,67.6,60.52],[9.99,72,39.11],[10.91,36.5,45.32]],"fingerSplay":[0,35,13.37,-15.43,-34.93],"thumbDirection":[-0.179,-0.843,-0.099],"thumbRoll":81.12,"triggerFingers":[12,28,18],"triggerSplay":0}),
    bodyHip: HanYangBody(), bodyAds: HanYangBody(), bodySprint: HanYangBody(),
    actions: { bolt: { family: "turnBolt", timing: V(0.24, 0.55, 0.84) }, reload: { family: "stripper", timing: V(0.52, 0.66, 0.79) }, bayonet: "hanYang" },
  }),
  Type38: WeaponPose({
    family: "boltRifle", hip: FixedPose(V(0.100, -0.148, -0.340), V(0.050, -0.050, 0.025)), ads: Sight(0.550), sprint: RifleSprint,
    right: Contact(V(0.01558,-0.0483,-0.06834), V(0.2,3.332392654,1.777196327), CLOSED, TRIGGER, {"fingers":[[0,41.56,35.88],[0,0.4,48.36],[57.74,58.8,13.2],[61.81,71.1,0.65],[88,51.5,0]],"fingerSplay":[0,-5.74,-20.89,-7.63,0.04],"thumbDirection":[0.355,-0.607,0.27],"thumbRoll":5.4,"triggerFingers":[0,2.4,49.36],"triggerSplay":0}),
    left: Contact(V(0.00747,-0.01221,-0.40058), V(-0.1364,1.441596327,-3.248792654), CLOSED, TRIGGER, {"fingers":[[0,24.53,60],[18.78,85.7,0],[20.28,58.6,38.07],[9.59,69.6,9.1],[0,50.5,2.34]],"fingerSplay":[0,15.65,1.51,-16.87,-34.13],"thumbDirection":[0.036,-0.847,-0.094],"thumbRoll":90.6,"triggerFingers":[12,28,18],"triggerSplay":0}),
    bodyHip: RifleBody(-0.560), bodyAds: RifleAdsBody(-0.540), bodySprint: RifleSprintBody(-0.490),
    actions: { bolt: { family: "type38Bolt", timing: V(0.23, 0.54, 0.83) }, reload: { family: "type38Stripper", timing: V(0.51, 0.65, 0.79) }, bayonet: "type38" },
  }),
  Zb26: WeaponPose({
    family: "lmg", hip: FixedPose(V(0.110, -0.172, -0.330), V(0.075, -0.080, 0.040)), ads: Sight(0.550), sprint: RifleSprint,
    right: Contact(V(0.0252,-0.083,-0.10038), V(0.1106,3.011392654,1.736396327), CLOSED, TRIGGER, {"fingers":[[0,3.99,9.36],[21.3,71.4,18.59],[27.9,65.8,18.53],[26.08,76,0],[27.46,35.6,54.15]],"fingerSplay":[0,-11.16,-31.95,-5.25,-35],"thumbDirection":[-0.35,-0.921,0.354],"thumbRoll":-76.08,"triggerFingers":[21.3,73.4,19.59],"triggerSplay":0}),
    left: Contact(V(0.00987,-0.02669,-0.35151), V(-0.1152,1.332796327,-3.153592654), CLOSED, TRIGGER, {"fingers":[[0,48.29,60],[36.12,91.4,12.4],[14.12,93,10.47],[10.6,77,24.94],[1.41,65.4,1.69]],"fingerSplay":[0,-21.8,7.77,-24.61,-35],"thumbDirection":[0.042,-0.415,-0.117],"thumbRoll":91.92,"triggerFingers":[12,28,18],"triggerSplay":0}),
    bodyHip: RifleBody(-0.575), bodyAds: RifleAdsBody(-0.555), bodySprint: RifleSprintBody(-0.500),
    actions: { reload: { family: "topMag", timing: V(0.32, 0.55, 0.76) } },
  }),
  Type92Hmg: WeaponPose({
    family: "lmg", hip: FixedPose(V(0.110, -0.172, -0.330), V(0.075, -0.080, 0.040)), ads: Sight(0.400), sprint: RifleSprint,
    right: Contact(V(0.01200, -0.03600, 0.01500), V(-0.523611478, 3.141592654, 1.570796327), CLOSED, TRIGGER), left: Contact(V(0.00000, -0.03500, -0.47000), V(-0.582726784, 2.373142020, -2.817487415), SUPPORT),
    bodyHip: RifleBody(-0.575), bodyAds: RifleAdsBody(-0.555), bodySprint: RifleSprintBody(-0.500),
    actions: { reload: { family: "hopper", timing: V(0.32, 0.55, 0.76) } },
  }),
  Type11: WeaponPose({
    family: "lmg", hip: FixedPose(V(0.115, -0.180, -0.340), V(0.080, -0.075, 0.040)), ads: Sight(0.550), sprint: RifleSprint,
    right: Contact(V(0.02765,-0.077,-0.09425), V(0,2.991592654,1.573196327), CLOSED, TRIGGER, {"fingers":[[0,57.16,46.68],[22,30.6,61.69],[68.07,38.1,45.29],[70.05,27.5,48.88],[71.59,32.6,27.36]],"fingerSplay":[0,-1.72,13.79,14.98,9.42],"thumbDirection":[1,-0.472,-0.15],"thumbRoll":15,"triggerFingers":[22,32.6,62.69],"triggerSplay":0}),
    left: Contact(V(0.0091,-0.03949,-0.33357), V(-0.0996,1.536196327,-3.236392654), CLOSED, TRIGGER, {"fingers":[[0,65,50.52],[7.39,86.6,2.01],[0.88,76,29.9],[0,62.2,41.41],[0.7,29.8,37.77]],"fingerSplay":[0,23.13,7.98,-10.71,-30.49],"thumbDirection":[-0.408,-0.35,0.67],"thumbRoll":-0.12,"triggerFingers":[12,28,18],"triggerSplay":0}),
    bodyHip: RifleBody(-0.590), bodyAds: RifleAdsBody(-0.565), bodySprint: RifleSprintBody(-0.510),
    actions: { reload: { family: "hopper", timing: V(0.28, 0.62, 0.86) } },
  }),
  ServicePistol: WeaponPose({
    family: "pistol", hip: FixedPose(V(0.040, -0.120, -0.320), V(0.035, -0.030, 0.012)), ads: Sight(0.450), sprint: PistolSprint,
    // Measured on the corrected A-state grip. The firing palm wraps the right
    // panel; the support palm sits ahead of it, outside the curled fingers.
    right: Contact(V(0.01512,-0.05054,-0.02588), V(0.0304,3.103192654,1.775596327), CLOSED, TRIGGER, {"fingers":[[0,23.75,60],[0,85.7,4.68],[29.43,90.9,15.34],[31.19,100,8.58],[55.92,55.6,44.25]],"fingerSplay":[0,1.01,35,28,-11.76],"thumbDirection":[-0.207,-0.841,-0.146],"thumbRoll":-87.6,"triggerFingers":[0,87.7,5.68],"triggerSplay":0}),
    left: Contact(V(-0.029,-0.055,-0.042), V(0.05,3.141592654,-1.570796327), CLOSED, TRIGGER, {"fingers":[[0,46.25,45.68],[68,5.3,0],[67.7,12.7,8.7],[83,0,0],[88,0,0]],"fingerSplay":[0,35,35,31,20.8],"thumbDirection":[0.164,-0.724,0.6],"thumbRoll":150,"triggerFingers":[12,28,18],"triggerSplay":0}),
    bodyHip: PistolBody(), bodyAds: PistolAdsBody(), bodySprint: PistolBody(),
    actions: { reload: { family: "boxMag", timing: V(0.32, 0.57, 0.80), handPath: [
      { at: 0.10, position: V(-0.026, -0.078, 0.004) },
      { at: 0.25, position: V(-0.026, -0.145, 0.014) },
      { at: 0.40, position: V(-0.090, -0.180, 0.050) },
      { at: 0.52, position: V(-0.026, -0.145, 0.014) },
      { at: 0.70, position: V(-0.026, -0.078, 0.004) },
      { at: 0.79, position: V(-0.025, 0.020, 0.008) },
      { at: 0.88, position: V(-0.025, 0.020, 0.035) },
    ] } },
  }),
  Grenade: WeaponPose({
    family: "throwable", hip: FixedPose(V(0.100, -0.140, -0.420), V(0.150, -0.250, 0.100)), ads: FixedPose(V(0.080, -0.100, -0.350), V(0.28, -0.10, 0.05)), sprint: ThrowableSprint,
    right: Contact(V(0, 0, 0), V(0.40576, -2.33420, -2.38987), CLOSED), left: Contact(V(-0.090, -0.035, 0.080), V(-0.85212, 2.76034, -2.50878), SUPPORT),
    bodyHip: ThrowableBody(), bodyAds: ThrowableBody(), bodySprint: ThrowableBody(), actions: { throw: { family: "stickGrenade", release: 0.48 } },
  }),
  GrenadeBundle: WeaponPose({
    family: "throwable", hip: FixedPose(V(0.100, -0.140, -0.420), V(0.150, -0.250, 0.100)), ads: FixedPose(V(0.080, -0.100, -0.350), V(0.28, -0.10, 0.05)), sprint: FixedPose(V(0.130, -0.090, -0.250), V(-0.48, 0.34, 0.24)),
    right: Contact(V(0, 0, 0.390), V(0.15106, -2.02303, -2.55292), CLOSED), left: Contact(V(-0.105, -0.045, 0.075), V(-1.29538, 1.24026, 2.15563), SUPPORT),
    bodyHip: ThrowableBody(), bodyAds: ThrowableBody(), bodySprint: ThrowableBody(), actions: { throw: { family: "bundleGrenade", release: 0.50 } },
  }),
  Dadao: WeaponPose({
    family: "melee", hip: FixedPose(V(0.235, -0.195, -0.520), V(0.720, -0.620, 1.540)), ads: FixedPose(V(0.175, -0.170, -0.470), V(0.900, -0.540, -1.500)), sprint: FixedPose(V(0.255, -0.225, -0.500), V(-0.130, -0.520, 1.890)),
    right: Contact(V(0, 0, 0.030), V(0.05208, -1.93229, -1.75862), CLOSED, TRIGGER, {thumbDirection:[0,-.7,1],thumbRoll:0}), left: Contact(V(0, 0, 0.155), V(0.20553, -2.61358, -0.42501), CLOSED, TRIGGER, {thumbDirection:[0,-.7,1],thumbRoll:0}),
    bodyHip: BladeBody(-0.500, -0.175), bodyAds: BladeBody(-0.470, -0.175), bodySprint: BladeBody(-0.440, -0.165), actions: { melee: { family: "dadao", release: 0.18 } },
  }),
  OfficerSwordSet: WeaponPose({
    family: "melee", hip: FixedPose(V(0.205, -0.180, -0.500), V(0.660, -0.570, 1.480)), ads: FixedPose(V(0.155, -0.155, -0.450), V(0.820, -0.500, -1.520)), sprint: FixedPose(V(0.230, -0.215, -0.480), V(-0.160, -0.460, 1.820)),
    right: Contact(V(0, 0, 0.030), V(-0.25769, -1.95745, -1.61314), CLOSED), left: Contact(V(0, 0, 0.150), V(0.40452, -2.69819, -0.75324), CLOSED),
    bodyHip: BladeBody(-0.485), bodyAds: BladeBody(-0.455), bodySprint: BladeBody(-0.425), actions: { melee: { family: "officerSword", release: 0.20 } },
  }),
});

// 刀具和投掷物保留其状态接触；枪械握持坐标系固定在武器局部，
// 腰射/ADS/冲刺只移动武器本身，不旋转手掌去抵消不合理的肘平面。
export const FPS_ARM_STATE_ROTATIONS = Freeze({
  Grenade: Freeze({ ads: StateContacts(V(0.47682, -2.25383, -2.35885), V(-0.04976, 1.95825, 2.94739)), sprint: StateContacts(V(-0.69827, -2.06503, -2.19207), V(-0.44412, 1.71442, -1.41136)) }),
  GrenadeBundle: Freeze({ ads: StateContacts(V(0.27029, -2.14081, -2.48461), V(-1.29617, -0.29859, -2.97260)), sprint: StateContacts(V(-0.53731, 1.84973, -2.48936), V(-0.96956, 1.92130, -0.20501)) }),
  Dadao: Freeze({ ads: StateContacts(V(1.00986, -1.23190, -1.06748), V(0.01292, 2.28903, 2.98643)), sprint: StateContacts(V(-0.03165, -2.61229, -1.31738), V(0.19628, -2.95993, -0.35701)) }),
  OfficerSwordSet: Freeze({ ads: StateContacts(V(0.99884, -1.28117, -1.03785), V(-0.11189, 2.30043, 2.79591)), sprint: StateContacts(V(-0.30442, -2.64893, -1.21062), V(0.44444, -2.98694, -0.63058)) }),
});

// Bayonet work braces the fore-end with the palm facing up. The height matches
// the three bolt rifles' physical gripL mounts; shooting retains its own contacts.
export const FPS_BAYONET_SUPPORT = Freeze({ heightM: -0.012,
  rotation: V(-0.119428926, Math.PI / 2, -Math.PI) });

export const FPS_ARM_LIMITS = Freeze({
  handClosureM: 0.003,
  positionResidualM: 0.006,
  rotationResidualDeg: 8,
  maxReachRatio: 0.985,
  maxStretchRatio: 1.005,
  handTwistDeg: 18,
  wristBendDeg: 65,
  wristRelaxedDeg: 35,
  wristPoseSlackDeg: 12,
  elbowReturnRadPerS: 4,
  elbowSpeedRadPerS: 10,
});

export function FpsArmPose(weaponId) {
  return FPS_ARM_POSES[weaponId] || null;
}

export function FpsArmStateRotation(weaponId, state, side) {
  return FPS_ARM_STATE_ROTATIONS[weaponId]?.[state]?.[side]
    || FPS_ARM_POSES[weaponId]?.hip?.contacts?.[side]?.rotation
    || null;
}
