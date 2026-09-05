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

const RifleSprint = FixedPose(V(0.145, -0.200, -0.285), V(0.32, 0.44, 0.30));
const PistolSprint = FixedPose(V(0.105, -0.140, -0.260), V(0.26, 0.38, 0.16));
const ThrowableSprint = FixedPose(V(0.155, -0.135, -0.385), V(-0.48, 0.34, 0.24));

export const FPS_ARM_POSES = Freeze({
  ZhongZheng: WeaponPose({
    family: "boltRifle", hip: FixedPose(V(0.100, -0.142, -0.320), V(0.045, -0.060, 0.028)), ads: Sight(0.300), sprint: RifleSprint,
    right: Contact(V(0.01200, -0.03600, 0.01500), V(-0.523611478, 3.141592654, 1.570796327), CLOSED, TRIGGER), left: Contact(V(0.00000, -0.03500, -0.49938), V(-0.582726784, 2.373142020, -2.817487415), SUPPORT),
    bodyHip: RifleBody(-0.600), bodyAds: RifleAdsBody(-0.575), bodySprint: RifleSprintBody(-0.515),
    actions: { bolt: { family: "turnBolt", timing: V(0.21, 0.52, 0.82) }, reload: { family: "stripper", timing: V(0.50, 0.64, 0.78) }, bayonet: "zhongZheng" },
  }),
  HanYang: WeaponPose({
    family: "boltRifle", hip: FixedPose(V(0.105, -0.145, -0.335), V(0.050, -0.055, 0.025)), ads: Sight(0.305), sprint: RifleSprint,
    right: Contact(V(0.01200, -0.03600, 0.01500), V(-0.523611478, 3.141592654, 1.570796327), CLOSED, TRIGGER), left: Contact(V(0.00000, -0.03500, -0.41800), V(-0.582726784, 2.373142020, -2.817487415), SUPPORT),
    bodyHip: RifleBody(-0.545), bodyAds: RifleAdsBody(-0.525), bodySprint: RifleSprintBody(-0.480),
    actions: { bolt: { family: "turnBolt", timing: V(0.24, 0.55, 0.84) }, reload: { family: "stripper", timing: V(0.52, 0.66, 0.79) }, bayonet: "hanYang" },
  }),
  Type38: WeaponPose({
    family: "boltRifle", hip: FixedPose(V(0.100, -0.148, -0.340), V(0.050, -0.050, 0.025)), ads: Sight(0.305), sprint: RifleSprint,
    right: Contact(V(0.01200, -0.03600, 0.01500), V(-0.523611478, 3.141592654, 1.570796327), CLOSED, TRIGGER), left: Contact(V(0.00000, -0.03500, -0.44300), V(-0.582726784, 2.373142020, -2.817487415), SUPPORT),
    bodyHip: RifleBody(-0.560), bodyAds: RifleAdsBody(-0.540), bodySprint: RifleSprintBody(-0.490),
    actions: { bolt: { family: "type38Bolt", timing: V(0.23, 0.54, 0.83) }, reload: { family: "type38Stripper", timing: V(0.51, 0.65, 0.79) }, bayonet: "type38" },
  }),
  Zb26: WeaponPose({
    family: "lmg", hip: FixedPose(V(0.110, -0.172, -0.330), V(0.075, -0.080, 0.040)), ads: Sight(0.320), sprint: RifleSprint,
    right: Contact(V(0.01200, -0.03600, 0.01500), V(-0.523611478, 3.141592654, 1.570796327), CLOSED, TRIGGER), left: Contact(V(0.00000, -0.03500, -0.47000), V(-0.582726784, 2.373142020, -2.817487415), SUPPORT),
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
    family: "lmg", hip: FixedPose(V(0.115, -0.180, -0.340), V(0.080, -0.075, 0.040)), ads: Sight(0.400), sprint: RifleSprint,
    right: Contact(V(0.01200, -0.03600, 0.01500), V(-0.523611478, 3.141592654, 1.570796327), CLOSED, TRIGGER), left: Contact(V(0.00000, -0.03500, -0.49358), V(-0.582726784, 2.373142020, -2.817487415), SUPPORT),
    bodyHip: RifleBody(-0.590), bodyAds: RifleAdsBody(-0.565), bodySprint: RifleSprintBody(-0.510),
    actions: { reload: { family: "hopper", timing: V(0.28, 0.62, 0.86) } },
  }),
  ServicePistol: WeaponPose({
    family: "pistol", hip: FixedPose(V(0.040, -0.120, -0.320), V(0.035, -0.030, 0.012)), ads: Sight(0.400), sprint: PistolSprint,
    // Measured on the corrected A-state grip. The firing palm wraps the right
    // panel; the support palm sits ahead of it, outside the curled fingers.
    right: Contact(V(0.012, -0.020, -0.022), V(-0.400, 3.141592654, 1.570796327), CLOSED, TRIGGER), left: Contact(V(-0.026, -0.028, -0.042), V(-0.450, 3.141592654, -1.570796327), SUPPORT),
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

// 刀具和投掷物保留其状态接触；枪械握持坐标系固定在武器局部，
// 腰射/ADS/冲刺只移动武器本身，不旋转手掌去抵消不合理的肘平面。
export const FPS_ARM_STATE_ROTATIONS = Freeze({
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
