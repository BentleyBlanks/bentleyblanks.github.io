// 第一人称共享双臂的逐武器姿势与接触真相。纯数据，不 import three。
//
// 每件可检查的第一人称装备都必须在这里有完整条目：腰射/ADS 武器姿态、左右掌
// 接触坐标系、肩锚、肘极向量、手指闭合与机械动作族。枪族只负责给初值；导出的
// FPS_ARM_POSES 已经逐枪展开，运行时不再把 rifle/lmg/pistol 五个通用姿势当成答案。
//
// 坐标：武器局部 -Z 朝前、+Y 向上、+X 向右；rotation 是 YXZ 欧拉角。


const Freeze = (value) => Object.freeze(value);
const V = (x, y, z) => Freeze([x, y, z]);
const Contact = (position, rotation, curl, trigger = null) => Freeze({
  position: Freeze(position),
  rotation: Freeze(rotation),
  curl: Freeze(curl),
  trigger: Freeze(trigger || curl),
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

const RifleSprint = FixedPose(V(0.145, -0.140, -0.285), V(-0.70, 0.44, 0.30));
const PistolSprint = FixedPose(V(0.105, -0.105, -0.205), V(-0.58, 0.38, 0.26));
const ThrowableSprint = FixedPose(V(0.155, -0.135, -0.385), V(-0.48, 0.34, 0.24));

export const FPS_ARM_POSES = Freeze({
  ZhongZheng: WeaponPose({
    family: "boltRifle", hip: FixedPose(V(0.100, -0.142, -0.320), V(0.045, -0.060, 0.028)), ads: Sight(0.300), sprint: RifleSprint,
    right: Contact(V(0, 0, 0), V(-0.63443, -0.79093, -2.12380), CLOSED, TRIGGER), left: Contact(V(0, -0.012, -0.49938), V(-1.31058, -1.51322, -1.83938), SUPPORT),
    bodyHip: RifleBody(-0.600), bodyAds: RifleAdsBody(-0.575), bodySprint: RifleSprintBody(-0.515),
    actions: { bolt: { family: "turnBolt", timing: V(0.21, 0.52, 0.82) }, reload: { family: "stripper", timing: V(0.50, 0.64, 0.78) }, bayonet: "zhongZheng" },
  }),
  HanYang: WeaponPose({
    family: "boltRifle", hip: FixedPose(V(0.105, -0.145, -0.335), V(0.050, -0.055, 0.025)), ads: Sight(0.305), sprint: RifleSprint,
    right: Contact(V(0, 0, 0), V(-0.62150, -1.01054, -2.06688), CLOSED, TRIGGER), left: Contact(V(0, -0.012, -0.418), V(-1.17369, -1.74804, -1.84777), SUPPORT),
    bodyHip: RifleBody(-0.545), bodyAds: RifleAdsBody(-0.525), bodySprint: RifleSprintBody(-0.480),
    actions: { bolt: { family: "turnBolt", timing: V(0.24, 0.55, 0.84) }, reload: { family: "stripper", timing: V(0.52, 0.66, 0.79) }, bayonet: "hanYang" },
  }),
  Type38: WeaponPose({
    family: "boltRifle", hip: FixedPose(V(0.100, -0.148, -0.340), V(0.050, -0.050, 0.025)), ads: Sight(0.305), sprint: RifleSprint,
    right: Contact(V(0, 0, 0), V(-0.62604, -1.05063, -2.05201), CLOSED, TRIGGER), left: Contact(V(0, -0.012, -0.443), V(-1.29924, -1.51829, -1.83544), SUPPORT),
    bodyHip: RifleBody(-0.560), bodyAds: RifleAdsBody(-0.540), bodySprint: RifleSprintBody(-0.490),
    actions: { bolt: { family: "type38Bolt", timing: V(0.23, 0.54, 0.83) }, reload: { family: "type38Stripper", timing: V(0.51, 0.65, 0.79) }, bayonet: "type38" },
  }),
  Zb26: WeaponPose({
    family: "lmg", hip: FixedPose(V(0.110, -0.172, -0.330), V(0.075, -0.080, 0.040)), ads: Sight(0.320), sprint: RifleSprint,
    right: Contact(V(0, 0, 0), V(-0.36676, -1.11004, -1.76784), CLOSED, TRIGGER), left: Contact(V(0, -0.012, -0.470), V(-1.29253, -1.92084, -1.54942), SUPPORT),
    bodyHip: RifleBody(-0.575), bodyAds: RifleAdsBody(-0.555), bodySprint: RifleSprintBody(-0.500),
    actions: { reload: { family: "topMag", timing: V(0.32, 0.55, 0.76) } },
  }),
  Type11: WeaponPose({
    family: "lmg", hip: FixedPose(V(0.115, -0.180, -0.340), V(0.080, -0.075, 0.040)), ads: Sight(0.325), sprint: RifleSprint,
    right: Contact(V(0, 0, 0), V(-0.26867, -1.27395, -1.71020), CLOSED, TRIGGER), left: Contact(V(0, -0.012, -0.49358), V(-1.49399, -2.39014, -0.80414), SUPPORT),
    bodyHip: RifleBody(-0.590), bodyAds: RifleAdsBody(-0.565), bodySprint: RifleSprintBody(-0.510),
    actions: { reload: { family: "hopper", timing: V(0.28, 0.62, 0.86) } },
  }),
  Mauser96: WeaponPose({
    family: "pistol", hip: FixedPose(V(0.045, -0.105, -0.235), V(0.040, -0.035, 0.015)), ads: Sight(0.335), sprint: PistolSprint,
    right: Contact(V(0, 0, 0), V(-0.29322, -0.66184, -2.26530), CLOSED, TRIGGER), left: Contact(V(-0.030, -0.016, -0.030), V(-0.36071, 1.81197, -2.78481), SUPPORT),
    bodyHip: PistolBody(), bodyAds: PistolAdsBody(), bodySprint: PistolBody(),
    actions: { reload: { family: "c96Stripper", timing: V(0.48, 0.63, 0.77) } },
  }),
  ServicePistol: WeaponPose({
    family: "pistol", hip: FixedPose(V(0.040, -0.100, -0.240), V(0.035, -0.030, 0.012)), ads: Sight(0.340), sprint: PistolSprint,
    right: Contact(V(0, 0, 0), V(-0.28057, -0.80071, -2.27676), CLOSED, TRIGGER), left: Contact(V(-0.030, -0.016, -0.028), V(-0.36795, 1.78970, -2.81160), SUPPORT),
    bodyHip: PistolBody(), bodyAds: PistolAdsBody(), bodySprint: PistolBody(),
    actions: { reload: { family: "boxMag", timing: V(0.32, 0.57, 0.80) } },
  }),
  WaltherP38: WeaponPose({
    family: "pistol", hip: FixedPose(V(0.045, -0.102, -0.230), V(0.035, -0.030, 0.012)), ads: Sight(0.335), sprint: PistolSprint,
    right: Contact(V(0, 0, 0), V(-0.25260, -0.70339, -2.27881), CLOSED, TRIGGER), left: Contact(V(-0.029, -0.015, -0.027), V(-0.36093, 1.79819, -2.72216), SUPPORT),
    bodyHip: PistolBody(), bodyAds: PistolAdsBody(), bodySprint: PistolBody(),
    actions: { reload: { family: "boxMag", timing: V(0.30, 0.56, 0.79) } },
  }),
  Karabiner98k: WeaponPose({
    family: "boltRifle", hip: FixedPose(V(0.100, -0.142, -0.325), V(0.045, -0.055, 0.026)), ads: Sight(0.300), sprint: RifleSprint,
    right: Contact(V(0, 0, 0), V(-0.62802, -0.86877, -2.11318), CLOSED, TRIGGER), left: Contact(V(0, -0.012, -0.49938), V(-1.35453, -1.40479, -1.86981), SUPPORT),
    bodyHip: RifleBody(-0.600), bodyAds: RifleAdsBody(-0.575), bodySprint: RifleSprintBody(-0.515),
    actions: { bolt: { family: "turnBolt", timing: V(0.20, 0.50, 0.81) }, reload: { family: "stripper", timing: V(0.49, 0.63, 0.77) } },
  }),
  UnidentifiedBoltActionRifle: WeaponPose({
    family: "boltRifle", hip: FixedPose(V(0.105, -0.148, -0.330), V(0.050, -0.055, 0.028)), ads: Sight(0.305), sprint: RifleSprint,
    right: Contact(V(0, 0, 0), V(-0.64463, -0.91345, -2.06511), CLOSED, TRIGGER), left: Contact(V(0, -0.012, -0.50518), V(-1.42036, -1.40854, -1.79562), SUPPORT),
    bodyHip: RifleBody(-0.605), bodyAds: RifleAdsBody(-0.580), bodySprint: RifleSprintBody(-0.520),
    actions: { bolt: { family: "turnBolt", timing: V(0.22, 0.53, 0.83) }, reload: { family: "stripper", timing: V(0.51, 0.65, 0.79) } },
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
    right: Contact(V(0, 0, 0.030), V(0.05208, -1.93229, -1.75862), CLOSED), left: Contact(V(0, 0, 0.155), V(0.20553, -2.61358, -0.42501), CLOSED),
    bodyHip: BladeBody(-0.500, -0.175), bodyAds: BladeBody(-0.470, -0.175), bodySprint: BladeBody(-0.440, -0.165), actions: { melee: { family: "dadao", release: 0.18 } },
  }),
  OfficerSwordSet: WeaponPose({
    family: "melee", hip: FixedPose(V(0.205, -0.180, -0.500), V(0.660, -0.570, 1.480)), ads: FixedPose(V(0.155, -0.155, -0.450), V(0.820, -0.500, -1.520)), sprint: FixedPose(V(0.230, -0.215, -0.480), V(-0.160, -0.460, 1.820)),
    right: Contact(V(0, 0, 0.030), V(-0.25769, -1.95745, -1.61314), CLOSED), left: Contact(V(0, 0, 0.150), V(0.40452, -2.69819, -0.75324), CLOSED),
    bodyHip: BladeBody(-0.485), bodyAds: BladeBody(-0.455), bodySprint: BladeBody(-0.425), actions: { melee: { family: "officerSword", release: 0.20 } },
  }),
  RingPommelDagger: WeaponPose({
    family: "melee", hip: FixedPose(V(0.160, -0.145, -0.370), V(0.540, -0.430, 1.390)), ads: FixedPose(V(0.125, -0.125, -0.340), V(0.700, -0.380, -1.500)), sprint: FixedPose(V(0.185, -0.180, -0.350), V(-0.220, -0.340, 1.720)),
    right: Contact(V(0, 0, 0.030), V(0.24310, 1.71802, 3.00760), CLOSED), left: Contact(V(0, 0, 0.105), V(0.58329, -3.10039, -1.12722), SUPPORT),
    bodyHip: BladeBody(-0.390), bodyAds: BladeBody(-0.370), bodySprint: BladeBody(-0.350), actions: { melee: { family: "dagger", release: 0.14 } },
  }),
});

// 玩家相机逐枪反标定：在各状态的肩锚/肘平面先生成自然骨链，再反求武器局部
// palm frame。它们不是“纠腕角”，而是该状态下真实手掌接触面的数据真相。
export const FPS_ARM_STATE_ROTATIONS = Freeze({
  ZhongZheng: Freeze({ ads: StateContacts(V(-0.86389, -0.16985, -2.18510), V(-0.62765, 0.86807, -2.98640)), sprint: StateContacts(V(-0.76126, -0.74930, -2.82059), V(-0.29054, 1.40176, 1.83260)) }),
  HanYang: Freeze({ ads: StateContacts(V(-0.83827, -0.27468, -2.18032), V(-1.26783, 0.04964, 2.69840)), sprint: StateContacts(V(-0.75964, -0.65592, -2.85139), V(0.16338, 1.24649, 2.80900)) }),
  Type38: Freeze({ ads: StateContacts(V(-1.00620, 0.18936, -2.38468), V(-1.24476, 0.49277, 2.47044)), sprint: StateContacts(V(-0.75926, -0.63759, -2.85734), V(0.05808, 1.23766, 2.60965)) }),
  Zb26: Freeze({ ads: StateContacts(V(-0.86603, 0.83638, -2.62546), V(-0.82008, 3.10700, 2.51883)), sprint: StateContacts(V(-0.74185, -0.96583, -2.68225), V(-0.05111, 1.28407, 2.38186)) }),
  Type11: Freeze({ ads: StateContacts(V(-0.61723, -0.71811, -2.09215), V(-0.62179, 1.18917, -2.94727)), sprint: StateContacts(V(-0.74883, -0.70969, -2.76990), V(-0.32622, 1.48668, 1.62506)) }),
  Mauser96: Freeze({ ads: StateContacts(V(-0.41150, -0.75286, -2.32740), V(-0.31512, 1.76062, -2.81317)), sprint: StateContacts(V(-0.36625, -0.35932, -2.41014), V(-0.07549, 1.14615, -1.82975)) }),
  ServicePistol: Freeze({ ads: StateContacts(V(-0.44175, -0.75050, -2.34443), V(-0.00381, 1.69977, 2.94288)), sprint: StateContacts(V(-0.34539, -0.36767, -2.41643), V(-0.07505, 1.13724, -1.84352)) }),
  WaltherP38: Freeze({ ads: StateContacts(V(-0.37814, -0.79117, -2.34000), V(-0.30876, 1.74502, -2.75291)), sprint: StateContacts(V(-0.34946, -0.37923, -2.41054), V(-0.08042, 1.15500, -1.80571)) }),
  Karabiner98k: Freeze({ ads: StateContacts(V(-0.83180, -0.38366, -2.15379), V(-1.27736, -0.58460, -3.06093)), sprint: StateContacts(V(-0.76055, -0.70002, -2.83690), V(-0.28995, 1.41318, 1.81879)) }),
  UnidentifiedBoltActionRifle: Freeze({ ads: StateContacts(V(-0.82690, -0.42129, -2.15031), V(-1.29002, -0.48458, -3.08735)), sprint: StateContacts(V(-0.76139, -0.72335, -2.82893), V(-0.29086, 1.45657, 1.77255)) }),
  Grenade: Freeze({ ads: StateContacts(V(0.47682, -2.25383, -2.35885), V(-0.04976, 1.95825, 2.94739)), sprint: StateContacts(V(-0.69827, -2.06503, -2.19207), V(-0.44412, 1.71442, -1.41136)) }),
  GrenadeBundle: Freeze({ ads: StateContacts(V(0.27029, -2.14081, -2.48461), V(-1.29617, -0.29859, -2.97260)), sprint: StateContacts(V(-0.53731, 1.84973, -2.48936), V(-0.96956, 1.92130, -0.20501)) }),
  Dadao: Freeze({ ads: StateContacts(V(1.00986, -1.23190, -1.06748), V(0.01292, 2.28903, 2.98643)), sprint: StateContacts(V(-0.03165, -2.61229, -1.31738), V(0.19628, -2.95993, -0.35701)) }),
  OfficerSwordSet: Freeze({ ads: StateContacts(V(0.99884, -1.28117, -1.03785), V(-0.11189, 2.30043, 2.79591)), sprint: StateContacts(V(-0.30442, -2.64893, -1.21062), V(0.44444, -2.98694, -0.63058)) }),
  RingPommelDagger: Freeze({ ads: StateContacts(V(0.41975, -1.25846, -0.41276), V(-0.21474, 2.61787, 2.92900)), sprint: StateContacts(V(0.49947, 1.81057, -2.59434), V(0.79681, 2.88797, -0.96011)) }),
});

export const FPS_ARM_LIMITS = Freeze({
  handClosureM: 0.003,
  positionResidualM: 0.006,
  rotationResidualDeg: 8,
  maxReachRatio: 0.985,
  maxStretchRatio: 1.005,
  handTwistDeg: 18,
  handSwingDeg: 32,
  twistShare: Freeze({ clavicle: 0.15, upperArm: 0.32, forearm: 0.53, hand: 0 }),
});

export function FpsArmPose(weaponId) {
  return FPS_ARM_POSES[weaponId] || null;
}

export function FpsArmStateRotation(weaponId, state, side) {
  return FPS_ARM_STATE_ROTATIONS[weaponId]?.[state]?.[side]
    || FPS_ARM_POSES[weaponId]?.hip?.contacts?.[side]?.rotation
    || null;
}
