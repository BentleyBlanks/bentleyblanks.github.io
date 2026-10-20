// 第一人称共享双臂的逐武器姿势与接触真相。纯数据，不 import three。
//
// 每件可检查的第一人称装备都必须在这里有完整条目：腰射/ADS 武器姿态、左右掌
// 接触坐标系、肩锚、肘极向量、手指闭合与机械动作族。枪族只负责给初值；导出的
// FPS_ARM_POSES 已经逐枪展开，运行时不再把 rifle/lmg/pistol 五个通用姿势当成答案。
//
// 坐标：武器局部 -Z 朝前、+Y 向上、+X 向右；rotation 是 YXZ 欧拉角。
import { FPS_WEAPON_GRIPS } from "./Data_FpsWeaponGrips.mjs";
import { FPS_DADAO_SWING } from "./Data_FpsDadaoSwing.mjs";


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
const WeaponPose = ({ family, hip, ads, sprint, right, left, adsRight = right, adsLeft = left, adsSupport = null,
  sprintRight = right, sprintLeft = left, bodyHip, bodyAds, bodySprint, actions }, armRig = null) => Freeze({
  family, ...(armRig ? { armRig } : {}),
  hip: Freeze({ weapon: hip, body: bodyHip, contacts: StateContacts(right, left) }),
  // adsSupport：只换掌框和手指旋转，弯曲/扳机等其余字段沿用腰射那一份。
  ads: Freeze({ weapon: ads, body: bodyAds, contacts: StateContacts(adsRight, adsSupport ? Freeze({ ...left, ...adsSupport }) : adsLeft) }),
  sprint: Freeze({ weapon: sprint, body: bodySprint, contacts: StateContacts(sprintRight, sprintLeft) }),
  contacts: Freeze({ right, left }),
  actions: Freeze(actions),
});

const CLOSED = V(56, 74, 46);
const SUPPORT = V(48, 66, 42);
const TRIGGER = V(16, 22, 10);
// Thumb on the upper edge, index supporting the lower edge. Fitted against
// the complete scanned finger skin and the loaded packet, not pad markers.
const HopperClip = Freeze({ side:"r",palmOffset:V(.067,.014,.0012),rotation:V(-.336,3.076,.714),
  fingers:Freeze([V(0,14.5,.5),V(75,50,27.5),V(77.5,35,19.25),V(55,75,41.25),V(58,78,42.9)]),
  thumbDirection:V(1.020,-.096,.732),thumbRoll:-20,fingerSplay:Freeze([0,9,-15.25,-3,-6]) });
// Counter the scan's bind fan (+7.46/-4.74/-15.34/-29.63 degrees). These
// increments leave a small ordered fan instead of crossing the finger rows.
const PacketFingerSplay = Freeze([0,-4.5,4.7,12.3,23.6]);
const PacketClip = Freeze({side:"r",palmOffset:V(.065,.023,-.014),rotation:V(-.25,3.14,1.35),
  fingers:Freeze([V(0,16,8),V(40,52,27),V(65,85,44),V(67,88,46),V(68,90,48)]),
  thumbDirection:V(-.2,-1,.45),thumbRoll:0,fingerSplay:PacketFingerSplay});
// Working-hand poses are blended with the per-weapon holding pose. The thumb
// opposes the fingers independently. MCP/PIP/DIP angles are ordered
// thumb/index/middle/ring/little; offsets and rotations are in prop space.
export const FPS_HAND_SHAPES = Freeze({
  packetClip: PacketClip,
  hopperClip: HopperClip,
  // Thumb loads the packet; the other digits fold back into a loose fist.
  // Half-extended MCPs with strongly bent tips read as hooks from the player view.
  packetPress: Freeze({side:"r",palmOffset:V(.0846,.032,-.035),rotation:V(-.12,3.14,.2),
    fingers:Freeze([V(0,12,4),V(62,78,38),V(65,82,42),V(68,84,44),V(70,86,46)]),
    thumbDirection:V(.65,-.65,.35),thumbRoll:0,fingerSplay:PacketFingerSplay}),
  packetRelax: Freeze({side:"r",fingers:Freeze([V(0,14,8),V(18,32,16),V(24,42,22),V(30,48,25),V(36,54,28)]),
    thumbDirection:V(.4,-.45,.65),thumbRoll:0,fingerSplay:PacketFingerSplay}),
  packetRecover: Freeze({side:"r",fingers:Freeze([V(0,18,10),V(36,54,28),V(40,60,32),V(44,64,34),V(48,68,36)]),
    thumbDirection:V(.35,-.5,.65),thumbRoll:0,fingerSplay:PacketFingerSplay}),
  // The finger row runs diagonally outside the cocking piece. Opposed pads
  // surround the knob while the ring/little fingers clear the receiver.
  packetBolt: Freeze({side:"r",palmOffset:V(.053730633,-.025207960,.005244321),rotation:V(.403990256,2.830473596,.901371334),
    fingers:Freeze([V(0,20,12),V(48,68,38),V(50,60,35),V(66,84,43),V(68,86,44)]),
    thumbDirection:V(-.4,-.35,.9),thumbRoll:0,fingerSplay:Freeze([0,-4.5,3,12.3,23.6])}),
  packetLatch: Freeze({side:"r",fingers:Freeze([V(0,12,8),V(6,18,10),V(40,58,30),V(45,64,34),V(50,68,36)]),
    thumbDirection:V(-.15,-.30,.90),thumbRoll:0,fingerSplay:PacketFingerSplay}),
  packetClear: Freeze({side:"r",fingers:Freeze([V(0,18,12),V(6,12,8),V(10,18,10),V(14,22,12),V(18,26,14)]),
    thumbDirection:V(.053441512,-.171495334,1.066645843),thumbRoll:4.8,fingerSplay:PacketFingerSplay}),
  packetBoltClear: Freeze({side:"r",fingers:Freeze([V(0,20,12),V(20,32,18),V(28,40,22),V(36,48,26),V(40,52,28)]),
    thumbDirection:V(-.4,-.35,.9),thumbRoll:0,fingerSplay:PacketFingerSplay}),
  // Grasp the broad face above the magazine well. The wrist exits on the
  // receiver's right side, leaving the little finger and sleeve above it.
  zbMagazine: Freeze({side:"r",palmOffset:V(.054,.141,-.278),rotation:V(-.08,3.36,1.60),
    fingers:Freeze([V(0,16,10),V(52,65,35.75),V(46,68,37.4),V(52,72,39.6),V(54,74,40.7)]),
    thumbDirection:V(-.09,-.53,.77),thumbRoll:0,fingerSplay:PacketFingerSplay}),
  // Unbend each authored grip joint along its captured bind hinge, preserving
  // the original finger row and roll. The grip thumb keeps its exact rotations.
  zbClear: Freeze({side:"r",fingers:Freeze([V(0,32.25,12),V(8,12,8),V(20,18,22),V(22,22,12),V(12,16,4)]),
    thumbDirection:V(-.058124,.450695,.884954),thumbRoll:-13.0004,fingerSplay:PacketFingerSplay,
    fingerRotations:Freeze({
      ...Object.fromEntries(["0","01","02"].map(key=>[key,FPS_WEAPON_GRIPS.Zb26.right.fingerRotations[key]])),
      "1":Freeze([-.016169886,-.118555750,.124584069,.984967958]),
      "11":Freeze([-.002679957,-.002521407,.104687547,.994498355]),
      "12":Freeze([-.001789341,-.001681872,.069938331,.997548294]),
      "2":Freeze([-.017270044,-.092514613,.230440099,.968524730]),
      "21":Freeze([.002768088,-.004682115,.189910727,.981786296]),
      "22":Freeze([.003141644,-.005843648,.197149309,.980351025]),
      "3":Freeze([-.006527867,-.045820774,.277088269,.959729095]),
      "31":Freeze([.009766736,-.009548865,.196770840,.980354358]),
      "32":Freeze([.005281024,-.005300893,.110801385,.993814401]),
      "4":Freeze([-.007171534,.056464231,.183696092,.981333840]),
      "41":Freeze([.012466040,-.013966697,.144420672,.989339274]),
      "42":Freeze([.003079800,-.003543144,.041155251,.999141735]),
    })}),
  open: Freeze({ fingers: Freeze([V(0,10,8),V(6,12,8),V(10,18,10),V(14,22,12),V(18,26,14)]), thumbDirection: V(0.4,-0.38,0.83), thumbRoll: 0, side: "r" }),
  latch: Freeze({ fingers: Freeze([V(0,30,20),V(0,8,6),V(55,65,40),V(55,65,40),V(55,65,40)]), thumbDirection: V(-0.2,-0.7,0.1), thumbRoll: -60, side: "r" }),
  relax: Freeze({ fingers: Freeze([V(0,20,18),V(18,30,15),V(26,36,18),V(34,42,20),V(38,46,22)]), thumbDirection: V(0.1,-0.55,0.6), thumbRoll: -20, side: "r" }),
  recover: Freeze({ fingers: Freeze([V(0,22,25),V(30,48,22),V(36,55,28),V(40,58,30),V(45,62,34)]), thumbDirection: V(0.1,-0.48,0.5), thumbRoll: -18, side: "r" }),
  bolt: Freeze({ side: "r", palmOffset: V(0.026,-0.035455,-0.00535), rotation: V(0.538599,2.871593,1.493996), fingers: Freeze([V(0,41.625,60),V(63.8,90,26.155),V(55.384,91.2,24.465),V(45,65,40),V(45,65,40)]), thumbDirection: V(-0.1,-0.533,-0.15), thumbRoll: -75, fingerSplay: Freeze([0,3.15,-10.5,0,0]) }),
  clip: Freeze({ side: "r", palmOffset: V(0.03075,-0.00139,-0.00392), rotation: V(-0.3048,3.296393,1.498796), fingers: Freeze([V(0,0,48.56),V(69.552,37.1,48.515),V(42.448,64.6,36.945),V(44.56,66,40),V(48.08,90,41.105)]), thumbDirection: V(0.466,-0.714,0.996), thumbRoll: -30, fingerSplay: Freeze([0,19.39,2.625,-4.34,0]) }),
  press: Freeze({ side: "r", palmOffset: V(0.035235,-0.023,-0.0354), rotation: V(-0.0868,3.127193,1.534796), fingers: Freeze([V(0,44.17,33.38),V(45,65,40),V(45,65,40),V(38.84,69.5,40),V(9.448,64.6,41.365)]), thumbDirection: V(0.241,-0.887,0.49), thumbRoll: -26.16, fingerSplay: Freeze([0,0,0,0.77,-29.61]) }),
  magazine: Freeze({ side: "r", palmOffset: V(0.02043,0.087715,-0.26688), rotation: V(0.0636,3.134393,1.947596), fingers: Freeze([V(0,36.27,60),V(64.976,15.2,60.515),V(54.152,65,24.14),V(53.008,67.8,29.275),V(56.616,54.2,47.905)]), thumbDirection: V(0.342,-0.627,1), thumbRoll: 42.6, fingerSplay: Freeze([0,11.025,8.68,-0.14,23.38]) }),
  pistolMagazine: Freeze({ side: "l", palmOffset: V(-0.01718,0.02595,-0.028105), rotation: V(0.3848,2.908793,-1.625996), fingers: Freeze([V(0,65,60),V(88,35.8,45.85),V(53.36,84.1,1.235),V(46.232,61,36.985),V(41.48,40.3,22.36)]), thumbDirection: V(0.165,-0.942,-0.378), thumbRoll: 45, fingerSplay: Freeze([0,-29.365,-35,-35,-35]) }),
  slide: Freeze({ side: "l", palmOffset: V(0.015715,0.06075,-0.03176), rotation: V(-0.414,2.3044,-0.114), fingers: Freeze([V(0,65,60),V(88,79.6,6.33),V(59.872,65,53.65),V(40.072,53.5,54.34),V(46.408,13,0)]), thumbDirection: V(0.3,0.02,0.1), thumbRoll: 29.4, fingerSplay: Freeze([0,-11.655,-35,-23.555,-35]) }),
  // Thumb opposes the index/middle fingers on the follower rim; the other
  // digits stay relaxed. Calibrated with the spring follower closed and open.
  hopperFollower: Freeze({ side: "l", palmOffset: V(-0.03018,0.000661172,0.038449285), rotation: V(0.024889709,-0.08501921,1.90290484), fingers: Freeze([V(0,79,23),V(90,58.8,30.85),V(53.36,95.1,0),V(46.232,49,62.985),V(40.48,41.3,25.36)]), thumbDirection: V(0.165,-0.942,-0.378), thumbRoll: 45, fingerSplay: Freeze([0,-29.365,-35,-35,-35]) }),
  type11Charge: Freeze({ side: "l", palmOffset: V(-0.0268,-0.0082,0.0274), rotation: V(0.104889709,-0.08501921,2.03390484), fingers: Freeze([V(0,79,23),V(55.5,105,0),V(53.36,95.1,0),V(46.232,49,62.985),V(40.48,41.3,25.36)]), thumbDirection: V(0.165,-0.942,-0.378), thumbRoll: 45, fingerSplay: Freeze([0,-18,-35,-35,-35]) }),
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
const HanYangBody = () => Body(V(.19,-.40,.08),V(-.28,-.42,-.38),V(.30,-.80,.12),V(-.40,-.75,.12));
// 三支栓动步枪开镜时的左肩：比腰射后移约 30 cm、内收 4–6 cm。开镜眼距 0.22 m 时托枪手离眼仅
// 0.3–0.45 m，肩还挂在眼前 0.38 m 处前臂就只能折回；后移后前臂从画面左下角斜着伸向护木，
// 袖子入画（对标 COD 三八式开镜），左腕约 35°。
const ADS_SUPPORT_SHOULDER = V(-.22,-.38,-.08);
// 开镜左肘朝下、朝后（收向身体）并往外撇：前臂从袖口斜向画面左下角，像 COD 那样整截入画。
// 默认 [-.40,-.75,.12] 时肘落在正下方，前臂几乎垂直掉出画面，只露袖口一点、腕弯 35°。
// v12 的 [-.30,-.50,.80] 肘贴着枪身，前臂和袖子穿过机匣、弹仓和木托（整臂探针三八式 88、中正式 70 个三角面）；
// 肘再往外撇（与汉阳造同一组）：前臂离枪身最近三八式 4.9、中正式 10 mm，左腕 28°，前臂在画面上约 33° 斜进左下角。
const ADS_SUPPORT_POLE = V(-.45,-.45,.70);
// HanYang: align both forearms with the repaired hand frames; avoid a sharp wrist kink.
const HanYangHandBodies = Freeze({
  hip: Body(V(0.19,-0.38,0.06), V(-0.22,-0.43,-0.4), V(0.3,-0.8,0.12), V(-0.56,-0.55,0.78)),
  // 开镜眼距 0.22 m 时枪托贴到右前臂内侧：右肘外抬（极向量 x 0.30→0.45），整臂不再擦进木托。
  // 汉阳造弹仓外凸：开镜左肩外移 2 cm、下移 2 cm，肘再往外偏一点，左袖不擦枪身。
  ads: Body(V(0.19,-0.38,0.06), V(-.24,-.40,-.08), V(0.45,-0.75,0.12), V(-.45,-.45,.70)),
  sprint: Body(V(0.19,-0.38,0.06), V(-0.2,-0.42,-0.34), V(0.3,-0.8,0.12), V(-0.4,-0.75,0.12)),
});
const HanYangHandBody = (state) => HanYangHandBodies[state];
// Type38NraArms_20260913 Blender mount: 20 mm up / forward clears stripper release without overbending the wrist.
const Type38Body = () => Body(V(.19,-.38,.06),V(-.28,-.42,-.38),V(.30,-.80,.12),V(-.40,-.75,.12));
// Retain the Type 11's established shoulder mounts with the fixed-length
// scanned rig; the old shared arm bridge used these mounts implicitly.
const Type11Body = () => Body(V(.19,-.40,.08),V(-.19,-.40,-.41),V(.30,-.80,.12),V(-.30,-.80,.12));
const PistolSprint = FixedPose(V(0.105, -0.140, -0.260), V(0.26, 0.38, 0.16));
const ThrowableSprint = FixedPose(V(0.155, -0.135, -0.385), V(-0.48, 0.34, 0.24));

// 栓动步枪开镜时照门离眼多远（米）。对标 COD WWII 三八式开镜：机柄尾端约占画面高 35%、
// 拉机柄球心偏右约 0.55 屏高，三八式 0.22 时两项都对上。旧值 0.55 把整支枪推到一臂外，
// 开镜后枪只剩画面中间一小条。下限看开枪 + 拉栓全程离相机最近的顶点（近裁面 0.06）：
// 0.22 时三八式 75 mm、汉阳造 78 mm；中正式机柄更靠后，0.22 会到 54 mm 穿进近裁面，取 0.24（73 mm）。
const RIFLE_ADS_EYE = Freeze({ Type38: 0.220, HanYang: 0.220, ZhongZheng: 0.240 });

// 开镜专用的托枪左手（只有三支栓动步枪）。开镜眼距 0.22–0.24 m 时腰射那只托枪手
// 离眼只有 0.31 m：掌竖贴护木左侧、拇指从上沿翘到瞄准线下，玩家正对着它的指背和翘起的拇指；
// 手又落在左肩挂点后面，前臂只能折回来，腕弯顶到 64°。对标 COD 三八式开镜：左手握在机匣左侧，
// 手顶端在瞄准线下约 0.12–0.14 屏高，前臂和袖子从左下角斜着伸进来（ADS_SUPPORT_SHOULDER +
// ADS_SUPPORT_POLE），开镜左腕三八式／中正式约 28°。拇指顺着木托左侧上半部朝枪口、略上翘 8–12°，指尖停在
// 木托上沿下面（用户手绘）；四指整根低于拇指，在木托底下托住、指尖往上勾住木头。手指按单轴铰链
// 拟合，不从腰射作者旋转求增量（三八式／中正式那份当时本身有反折：小指末节 -27°、拇指掌指 -25°，v13 已修）：
// 两个指间关节只往掌心弯，指根上翘 ≤10°，五个指腹都贴木 ≤4 mm。
// （v12 首版把手整只藏到机匣后，用户要求像 COD 那样看得到手。）
// Blender 拟合：_blender/Script_FpsAdsSupportGripFit.py，源工程
// OneDrive/AI/Models/Blender/Taierzhuang1938/FpsAdsSupportGrip_20261020/。
// 运行时由 RiggedModel/FpsAnatomy 按「是否按住瞄准」平滑混合（拉栓时不来回换握法）。
// 三八式掌框在拟合结果上绕食指尖（枪体坐标 [-.0275,-.004,-.440]）、绕枪体竖轴往外偏 0.57°（-0.01 rad；
// 原值 position [-0.001806,-0.018425,-0.37178]、rotation y 3.00703）：拟合只按手骨算皮肤，游戏里腕部那圈
// 混着两三成前臂权重，把掌根拇指侧带进木托左面 0.1–0.4 mm（整臂探针 9–14 个三角面，肩肘怎么摆都在，
// 除非左腕弯到 45° 以上）。偏转后掌根离木 0.8 mm，指尖基本不动（食指指腹离木 3.06→3.02 mm），手指旋转不动。
// 整体平移 1 mm 也能让开，但食指指腹会被带到 3.96 mm，贴着 4 mm 门限。
const AdsSupport = (position, rotation, fingerRotations) => Freeze({
  position: Freeze(position), rotation: Freeze(rotation),
  fingerRotations: Freeze(Object.fromEntries(Object.entries(fingerRotations).map(([key, q]) => [key, Freeze(q)]))),
});
const RIFLE_ADS_SUPPORT = Freeze({
  Type38: AdsSupport([-0.002489, -0.018425, -0.371526], [0.178083, 2.99703, -2.613137], {"0":[0.640020788,0.120106503,0.234687597,0.721712887],"01":[0.000833292,0.00419066,-0.018843267,0.999813259],"02":[0.001335611,0.008440869,-0.01795936,0.999802232],"1":[0.014581607,0.073998928,0.169386894,0.982659459],"11":[4.86e-07,2.5e-08,0.00022574,1.0],"12":[-3.59e-07,2e-09,0.000225018,1.0],"2":[-0.002445194,0.003233515,0.173736513,0.984783947],"21":[-0.003071993,0.00519829,0.207002297,0.97832191],"22":[-0.00035926,0.000668199,0.028376166,0.999597132],"3":[-0.043732591,-0.075542241,0.368263662,0.925614834],"31":[-0.031104444,0.030415166,0.61131376,0.79019171],"32":[-0.010204803,0.010244424,0.207897604,0.978043795],"4":[-0.232131258,-0.160551652,0.663772762,0.692635596],"41":[-0.038177505,0.042769883,0.428245604,0.901841938],"42":[-6.1e-08,3.865e-06,0.006577695,0.999978364]}),
  HanYang: AdsSupport([-0.009998, -0.01766, -0.39218], [0.253013, 3.140768, -2.499622], {"0":[0.638460934,-0.150892496,0.109710127,0.7467013],"01":[0.073880114,0.371415734,0.060133919,0.923567057],"02":[0.00800841,0.050621614,-0.009100181,0.998644352],"1":[-0.006546758,-0.088390902,0.078983359,0.992927969],"11":[0.012864655,0.012108701,0.501772344,0.864819348],"12":[0.002958037,0.002782145,0.11552266,0.993296564],"2":[-0.002445194,0.003233515,0.173736513,0.984783947],"21":[-0.004876771,0.008251459,0.308068186,0.951315999],"22":[-0.003352845,0.006237827,0.209952906,0.977685809],"3":[-0.091122106,-0.167493731,0.400859118,0.896077335],"31":[-0.030014649,0.029349504,0.590182126,0.806177855],"32":[-0.015125652,0.015184519,0.304876685,0.952150702],"4":[-0.318167984,-0.170264646,0.723111391,0.588972807],"41":[-0.031371865,0.035144914,0.353178918,0.934368968],"42":[-6.1e-08,3.865e-06,0.006577695,0.999978364]}),
  ZhongZheng: AdsSupport([-0.002862, -0.01267, -0.3358], [0.167676, 2.972072, -2.489826], {"0":[0.645668864,0.105909288,0.269273907,0.706672847],"01":[0.003333947,0.0167621,-0.016189313,0.999722898],"02":[0.000334169,0.00211046,-0.01928569,0.999811769],"1":[-0.002210486,-0.077276424,0.013967398,0.996909499],"11":[0.008848874,0.008328747,0.345212072,0.938446045],"12":[0.007506056,0.007059195,0.292766243,0.956128597],"2":[0.002705544,0.064905882,0.044063717,0.996914446],"21":[-0.006087697,0.010299991,0.375656456,0.926681757],"22":[-0.007794949,0.014502472,0.478946656,0.87768966],"3":[-0.087295778,-0.028727647,0.716895401,0.69109714],"31":[-0.014965861,0.014633993,0.297904074,0.954366267],"32":[-0.009099027,0.009134324,0.186095864,0.982447028],"4":[-0.218638211,-0.087864712,0.757259429,0.609126687],"41":[-0.03764629,0.042174719,0.422388107,0.90465045],"42":[-6.1e-08,3.865e-06,0.006577695,0.999978364]}),
});

export const FPS_ARM_POSES = Freeze({
  // Use the corrected HanYang arm silhouette. The firing palm follows this
  // rifle's trigger (28 mm rearward / 4 mm down); support fingers close around
  // its narrower fore-end with independent MCP rotations (under 10 degrees).
  // 腰射托枪手（v13）：掌框不动，反折的关节（小指末节 -27°、拇指掌指 -25°、食指／无名指／小指中节
  // 偏离铰链 12–14°）按单轴铰链重拟合，其余关节保留原旋转只许微调。见 docs/Data_FpsRifleView20261016.md。
  ZhongZheng: WeaponPose({
    family: "boltRifle", hip: FixedPose(V(0.100, -0.142, -0.320), V(0.045, -0.060, 0.028)), ads: Sight(RIFLE_ADS_EYE.ZhongZheng), adsSupport: RIFLE_ADS_SUPPORT.ZhongZheng, sprint: RifleSprint,
    right: Contact(V(0.01577,-0.03573,-0.00096), V(0.2,3.392992654,1.957596327), CLOSED, TRIGGER, {"fingers":[[0,18,12],[0,0,50.96],[50,78,35],[55,75,32],[60,70,28]],"fingerSplay":[0,-21.53,0,-4,-8],"thumbDirection":[0.053441512,-0.171495334,1.066645843],"thumbRoll":4.8,"triggerFingers":[0,2,51.96],"triggerSplay":0}),
    left: Contact(V(-0.0115,-0.0005,-0.355), V(0.087127039,3.116151099,-2.174507012), CLOSED, TRIGGER, {"fingerRotations":{"0":[0.592924416,0.101418905,0.29768315,0.741309345],"1":[0.07536526369121042,0.25786273068957366,-0.026149452542675082,-0.9628827006867396],"2":[0.10728552958824142,0.25772553348803673,-0.07096438443884788,-0.9576175753767748],"3":[0.2984122279996583,0.20083249546852944,-0.2916904186646492,-0.8863030805561972],"4":[0.31035018,-0.013110928,-0.642161548,-0.700813472],"11":[0.005250753,0.004941938,0.204929486,0.978750229],"12":[0.001671844,0.041505586,-0.287557483,-0.956862211],"21":[-0.007791017251800866,0.040486870246200506,-0.5281352394470694,-0.8481587600455686],"22":[-0.018474565730816794,-0.03218673376098089,0.5524135222172574,0.8327436610760729],"31":[-0.027443051,0.026834855,0.540296197,0.84059912],"32":[-0.020801324,0.003022461,0.258739471,0.965718448],"41":[-0.030601976,0.034282342,0.344683945,0.937593341],"42":[-0.00038514,0.000446901,0.01090116,0.999940515],"01":[-0.006667795,-0.033519242,-0.026783928,0.999056935],"02":[-0.005005916429194111,-0.03164683429981269,-0.026344065361953304,0.9991393340769391]}}),
    bodyHip: HanYangBody(), bodyAds: Body(V(.19,-.40,.08),ADS_SUPPORT_SHOULDER,V(.30,-.80,.12),ADS_SUPPORT_POLE), bodySprint: HanYangBody(),
    actions: { bolt: { family: "turnBolt", timing: V(0.187, 0.4594, 0.70), lockEnd: 0.83 }, reload: { family: "stripper", timing: V(0.50, 0.64, 0.78) }, bayonet: "zhongZheng" },
  }),
  // Retain the close rifle view with neutral wrists, flexed thumbs and
  // distributed finger bends. Finger bone lengths remain the scanned bind.
  HanYang: WeaponPose({
    family: "boltRifle", hip: FixedPose(V(0.105, -0.145, -0.335), V(0.050, -0.055, 0.025)), ads: Sight(RIFLE_ADS_EYE.HanYang), adsSupport: RIFLE_ADS_SUPPORT.HanYang, sprint: RifleSprint,
    right: Contact(V(0.008199999981540685,-0.037,-0.015), V(-0.05,3.306592654,1.72), CLOSED, TRIGGER, {"fingers":[[0,35,20],[0,24,13.2],[28,77,48],[60,73,32],[88,65,12]],"fingerSplay":[0,-21.53,0,-4,-8],"thumbDirection":[0.053441512,-0.171495334,1.066645843],"thumbRoll":4.8,"triggerFingers":[0,2,51.96],"triggerSplay":0,"fingerRotations":{"0":[0.8329746706381793,0.010443875833265752,0.2719980972467485,-0.48172726581224856],"1":[0.00815787251163664,0.2159034129304495,-0.10743313180491544,0.9704521047386396],"2":[0.05647315595801472,0.15892571405683603,0.2999025102655398,0.9389419118897012],"3":[0.13321734477917993,0.14029915126365136,0.5641192090215507,0.8027072273815206],"4":[0.3349445159867505,0.22221192170386783,0.6732556496297719,0.6206134091195277],"11":[-0.005330476783653258,-0.005015153278065666,0.20800301864133391,0.9781008277084531],"12":[-0.0029481629539024386,-0.0027711818949583294,0.11509006273571588,0.9933468464038125],"21":[0.011015750235640708,-0.018632216167778583,0.648449058560066,0.7609502283007301],"22":[0.006696706728120413,-0.012456510345712532,0.4124936974295151,0.9108506861740575],"31":[0.030445159539165094,-0.029767426100620678,0.5985704104762651,0.7999377670678858],"32":[0.013925429580038463,-0.013978227081933726,0.2812488096618857,0.9594320268825798],"41":[0.04812830927757282,-0.05392082587742499,0.5379538003497698,0.8398701901768052],"42":[0.009224335291666809,-0.010612263331767468,0.11011785606959718,0.9938190695238523],"02":[-0.026576373836616915,-0.16795801694668588,0.015743908835614558,0.9853101258150142],"01":[-0.05745869289153731,-0.28881007801465164,0.04209262643529091,0.9547332289556489]},"triggerRotations":{"1":[0.00815787251163664,0.2159034129304495,-0.10743313180491544,0.9704521047386396],"11":[-0.005592791196739975,-0.0052619522719325375,0.21822772039952987,0.9758676624389918],"12":[-0.0030926375788873717,-0.002906990284859325,0.12071926689781243,0.9926776131251999]}}),
    left: Contact(V(-0.014,0.001,-0.39858), V(0,3.116151099,-2.174507012), CLOSED, TRIGGER, {"fingerRotations":{"0":[0.7080275034901694,-0.13644120971866366,0.1270640240846616,0.6811281702993927],"1":[0.0725348296809345,0.22867672354369245,0.054181229431194786,-0.9692832655987638],"2":[0.08635266222830637,0.24368204311528097,0.017899482397642646,-0.9658374025265034],"3":[0.1859664706306499,0.17971015467024604,-0.28744750695102056,-0.9222226753106968],"4":[0.2858161400543949,0.04840966827226908,-0.6141749987084288,-0.733999120615057],"11":[0.007494442131543572,0.007053858436649188,0.292406392468301,0.956238792913751],"12":[0.0011181520011135783,0.0010518757880234953,0.043817159042484906,0.9990384129257487],"21":[-0.006749639743696825,0.011419800289404118,0.41252230451691185,0.9108509364430144],"22":[-0.003133104261674756,0.005828995076022747,0.1966321224429185,0.9804550535741254],"31":[-0.0255161731013737,0.024950648866727754,0.5028988540413745,0.8636082597368986],"32":[-0.010003876391465032,0.010042711646376651,0.20393631796742598,0.9788815354621515],"41":[-0.0318400169856501,0.03566942405467454,0.3583442061530539,0.9323643868444557],"42":[-0.009041298872479614,0.01040586436407968,0.10805491115222568,0.9940493461828888],"02":[0.013336257135320407,0.08430051927656944,-0.0019995888992526277,0.9963491782637847],"01":[0.04135007288133577,0.20787892655718054,0.024579154923450693,0.9769710769647996]},"fingers":[[0,25,10],[0,0,0],[0,0,0],[0,0,0],[0,0,0]]}),
    bodyHip: HanYangHandBody("hip"), bodyAds: HanYangHandBody("ads"), bodySprint: HanYangHandBody("sprint"),
    // Full 90-degree unlock/lock, with longer turns inside the same firing cycle.
    actions: { operatingBody: { elbowPoles: { right: V(.30,-.80,.12), left: V(-.4,-.75,.12) } }, bolt: { family: "turnBolt", timing: V(0.2721, 0.51737, 0.675), lockEnd: 0.83 }, reload: { family: "enBloc", timing: V(0.52, 0.66, 0.79) }, bayonet: "hanYang" },
  }),
  // Blender Type38Grip_20260916: HanYang palm frames, trigger-aligned right hand,
  // independent support MCP rotations fitted to the narrower Type38 fore-end.
  // 腰射托枪手（v13）：同中正式去反折；中指原先穿进护木（71 个三角面），一并微调出来。
  Type38: WeaponPose({
    family: "boltRifle", hip: FixedPose(V(0.100, -0.148, -0.340), V(0.050, -0.050, 0.025)), ads: Sight(RIFLE_ADS_EYE.Type38), adsSupport: RIFLE_ADS_SUPPORT.Type38, sprint: RifleSprint,
    right: Contact(V(0.01677,-0.03373,-0.07396), V(0.2,3.392992654,1.957596327), CLOSED, TRIGGER, {"fingers":[[0,18,12],[0,0,50.96],[50,78,35],[55,75,32],[60,70,28]],"fingerSplay":[0,-21.53,0,-4,-8],"thumbDirection":[0.053441512,-0.171495334,1.066645843],"thumbRoll":4.8,"triggerFingers":[0,2,51.96],"triggerSplay":0}),
    left: Contact(V(-0.0115,-0.0005,-0.40058), V(0.087127039,3.116151099,-2.174507012), CLOSED, TRIGGER, {"fingerRotations":{"0":[0.608859181,0.139649004,0.230667487,0.746043742],"1":[0.06913205607600259,0.27916944177094083,0.05653032172565456,-0.9560802813203502],"2":[0.084807791,0.293999076,0.02102837,-0.951803565],"3":[0.202413753,0.284071296,-0.238507524,-0.906336844],"4":[0.238257229,0.021292821,-0.578526855,-0.779799223],"11":[0.003598667,0.003386879,0.140516952,0.990065992],"12":[0.003384613,0.039087962,-0.355673224,-0.933786571],"21":[-0.010868236,0.040854003,-0.490677834,-0.870314896],"22":[-0.012660824,-0.035261378,0.47404474,0.879703403],"31":[-0.027443051,0.026834855,0.540296197,0.84059912],"32":[-0.023842983,0.006004822,0.308749348,0.950825691],"41":[-0.029497292,0.033044666,0.332493901,0.942064643],"42":[-0.000577677,0.000668417,0.013062818,0.999914289],"01":[-0.006667795,-0.033519242,-0.026783928,0.999056935],"02":[-0.005005916429194111,-0.03164683429981269,-0.026344065361953304,0.9991393340769391]}}),
    bodyHip: Type38Body(), bodyAds: Body(V(.19,-.38,.06),ADS_SUPPORT_SHOULDER,V(.30,-.80,.12),ADS_SUPPORT_POLE), bodySprint: Type38Body(),
    actions: { bolt: { family: "type38Bolt", timing: V(0.2066, 0.4821, 0.65), lockEnd: 0.76 }, reload: { family: "type38Stripper", timing: V(0.51, 0.65, 0.79) }, bayonet: "type38" },
  }),
  Zb26: WeaponPose({
    family: "lmg", hip: FixedPose(V(0.110, -0.172, -0.330), V(0.075, -0.080, 0.040)), ads: Sight(0.550), sprint: RifleSprint,
    ...FPS_WEAPON_GRIPS.Zb26,
    actions: { reload: { family: "topMag", timing: V(0.32, 0.55, 0.76) } },
  }),
  Type92Hmg: WeaponPose({
    family: "lmg", hip: FixedPose(V(0.110, -0.172, -0.330), V(0.075, -0.080, 0.040)), ads: Sight(0.400), sprint: RifleSprint,
    right: Contact(V(0.01200, -0.03600, 0.01500), V(-0.523611478, 3.141592654, 1.570796327), CLOSED, TRIGGER), left: Contact(V(0.00000, -0.03500, -0.47000), V(-0.582726784, 2.373142020, -2.817487415), SUPPORT),
    bodyHip: RifleBody(-0.575), bodyAds: RifleAdsBody(-0.555), bodySprint: RifleSprintBody(-0.500),
    actions: { reload: { family: "stripFeed", timing: V(0.34, 0.58, 0.72) } },
  }),
  Type11: WeaponPose({
    family: "lmg", hip: FixedPose(V(0.115, -0.180, -0.340), V(0.080, -0.075, 0.040)), ads: Sight(0.550), sprint: RifleSprint,
    right: Contact(V(0.02765,-0.077,-0.09425), V(0,2.991592654,1.573196327), CLOSED, TRIGGER, {"fingers":[[0,57.16,46.68],[22,30.6,61.69],[68.07,38.1,45.29],[70.05,27.5,48.88],[71.59,32.6,27.36]],"fingerSplay":[0,-1.72,13.79,14.98,9.42],"thumbDirection":[1,-0.472,-0.15],"thumbRoll":15,"triggerFingers":[22,32.6,62.69],"triggerSplay":0,"fingerRotations":{"0":[-0.278027654,-0.813567162,-0.346694946,0.374982357],"01":[-0.097748071,-0.491318792,0.086663097,0.861127555],"02":[-0.060849335,-0.384559929,0.06242881,0.918974221],"1":[-0.001773497,0.003823247,0.221379399,0.975178599],"11":[-0.007356655,-0.006921487,0.286980331,0.957883239],"12":[-0.013746211,-0.012921528,0.535795629,0.844136953],"2":[0.013131344,-0.007760643,0.541426599,0.84060961],"21":[0.005994091,-0.010138582,0.370402902,0.92879647],"22":[0.00684927,-0.012740298,0.421726823,0.906607628],"3":[-0.01021353,-0.066046014,0.643468559,0.762549579],"31":[0.012166018,-0.011894783,0.243458822,0.969761968],"32":[0.020952523,-0.021032093,0.419647008,0.907201767],"4":[0.083663292,0.033603255,0.614394486,0.783830881],"41":[0.023447504,-0.026269756,0.265733361,0.963403344],"42":[0.020121282,-0.023148902,0.232338279,0.972151339]},"triggerRotations":{"1":[-0.001773497,0.003823247,0.221379399,0.975178599],"11":[-0.00778416,-0.007323706,0.303643674,0.952725768],"12":[-0.013934651,-0.013098665,0.543137014,0.839426279]}}),
    left: Contact(V(0.0091,-0.03949,-0.33357), V(-0.0996,1.536196327,-3.236392654), CLOSED, TRIGGER, {"fingers":[[0,65,50.52],[7.39,86.6,2.01],[0.88,76,29.9],[0,62.2,41.41],[0.7,29.8,37.77]],"fingerSplay":[0,23.13,7.98,-10.71,-30.49],"thumbDirection":[-0.408,-0.35,0.67],"thumbRoll":-0.12,"triggerFingers":[12,28,18],"triggerSplay":0,"fingerRotations":{"0":[0.486863434,0.397443533,-0.248833939,0.736942589],"01":[0.092621677,0.465634286,0.080941938,0.876387119],"02":[0.079687037,0.503723741,0.088641413,0.855602205],"1":[-0.014246442,-0.108540222,0.147540748,0.98297888],"11":[0.017861843,0.016812453,0.696582317,0.717057586],"12":[0.000617194,0.000580764,0.024293207,0.999704599],"2":[-0.006663604,-0.068581551,0.08790268,0.993743181],"21":[-0.011105524,0.018788595,0.65340966,0.756689906],"22":[-0.004247399,0.007902166,0.264168322,0.964434922],"3":[0.007879592,0.019943051,0.089554861,0.995751083],"31":[-0.026439859,0.025853878,0.52082783,0.852860451],"32":[-0.017863154,0.017932724,0.35879609,0.933072746],"4":[0.0356755,0.093535334,0.093703233,0.990554452],"41":[-0.025104651,0.028123207,0.284009904,0.958079934],"42":[-0.029474469,0.033914201,0.337128252,0.940385878]}}),
    bodyHip: Type11Body(), bodyAds: Type11Body(), bodySprint: Type11Body(),
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
    ...FPS_WEAPON_GRIPS.Grenade,
    actions: { throw: { family: "stickGrenade", release: 0.48 } },
  }),
  GrenadeBundle: WeaponPose({
    family: "throwable",
    ...FPS_WEAPON_GRIPS.GrenadeBundle,
    actions: { throw: { family: "bundleGrenade", release: 0.50 } },
  }),
  Dadao: WeaponPose({
    family: "melee", hip: FixedPose(V(...FPS_DADAO_SWING.guardWeaponPosition), V(...FPS_DADAO_SWING.guardWeaponRotation)), ads: FixedPose(V(0.175, -0.170, -0.470), V(0.900, -0.540, -1.500)), sprint: FixedPose(V(0.255, -0.225, -0.500), V(-0.130, -0.520, 1.890)),
    ...FPS_WEAPON_GRIPS.Dadao,
    actions: { melee: { family: "dadao", release: 0.18 } },
  }),
  OfficerSwordSet: WeaponPose({
    family: "melee", hip: FixedPose(V(0.205, -0.180, -0.500), V(0.660, -0.570, 1.480)), ads: FixedPose(V(0.155, -0.155, -0.450), V(0.820, -0.500, -1.520)), sprint: FixedPose(V(0.230, -0.215, -0.480), V(-0.160, -0.460, 1.820)),
    right: Contact(V(0, 0, 0.030), V(-0.25769, -1.95745, -1.61314), CLOSED), left: Contact(V(0, 0, 0.150), V(0.40452, -2.69819, -0.75324), CLOSED),
    bodyHip: BladeBody(-0.485), bodyAds: BladeBody(-0.455), bodySprint: BladeBody(-0.425), actions: { melee: { family: "officerSword", release: 0.20 } },
  }),
});

// 架设（接管）机枪的双臂姿势，键名是武器 id，运行时以 `<weaponId>@mounted` 取用。
//
// 枪架在两脚架/三脚架上、指向就是视线，所以这里的腰射与开镜都**不带旋转**：
// hip.position / ads 解出来的位置就是「枪局部原点在相机空间里的位置」，装配层反过来
// 用它把相机摆到枪后头（Script_Main.MountedCameraEye）—— 枪钉在工事上不动，
// 动的是人的眼睛。武器姿态以外（接触、手指、动作）与随身那一把同一套数据。
// armRig：借哪一把枪的手臂资产。玩家端着汉阳造/中正式走过来，上了枪位还是那双土灰袖口的手。
export const FPS_MOUNTED_SUFFIX = "@mounted";
// fingers：换了一双手（armRig）之后按那双手的手指粗细重新拟合的屈曲角，只替换 `fingers`，
// 掌心接触坐标、拇指朝向、扳机指与随身那一把相同。
const RefitFingers = (contact, fingers) => fingers
  ? Freeze({ ...contact, fingers: Freeze(fingers.map((f) => Freeze(f))) }) : contact;
const Mounted = (weaponId, hip, overrides = {}) => {
  const base = FPS_ARM_POSES[weaponId];
  const hipPose = FixedPose(hip, V(0, 0, 0));
  return WeaponPose({
    family: base.family, hip: hipPose, ads: overrides.ads || base.ads.weapon, sprint: hipPose,
    right: RefitFingers(base.contacts.right, overrides.rightFingers),
    left: RefitFingers(base.contacts.left, overrides.leftFingers),
    bodyHip: overrides.bodyHip || base.hip.body, bodyAds: overrides.bodyAds || base.ads.body,
    bodySprint: overrides.bodyHip || base.hip.body,
    actions: base.actions,
  }, overrides.armRig || "HanYang");
};
export const FPS_MOUNTED_ARM_POSES = Freeze({
  // 腰射把枪放在视线右下：上插弹匣让开准心，左小臂从左下角斜着伸到弹匣座下面托住。
  // 手指：BlenderMCP 工程 Zb26MountedGrip_20260927 按汉阳造那双（更厚的）手在机枪位姿势下逐指拟合，
  // 同一套正向运动学（误差 3e-8 m）；除右拇指（根节随 thumbDirection）4 mm 外，九指皮肤陷入枪体 ≤1.6 mm、
  // 指腹离枪面 ≤2 mm。右食指是扳机指，不参与拟合。
  Zb26: Mounted("Zb26", V(0.085, -0.180, -0.380), { bodyHip: HanYangBody(), bodyAds: HanYangBody(),
    rightFingers: [[0,-8.01,7.86],[21.3,71.4,18.59],[21.9,65.8,18.53],[9.58,79.75,3],[27.46,35.6,54.15]],
    leftFingers: [[0,43.04,60],[30.12,91.4,12.4],[11.12,93,10.47],[9.1,77,24.94],[-4.59,65.4,4.69]] }),
  Type92Hmg: Mounted("Type92Hmg", V(0.000, -0.190, -0.420), { bodyHip: HanYangBody(), bodyAds: HanYangBody() }),
});

/** 这支枪有没有架设姿势；有就返回 `<weaponId>@mounted`，没有返回 null。 */
export function FpsMountedPoseKey(weaponId) {
  return weaponId && FPS_MOUNTED_ARM_POSES[weaponId] ? `${weaponId}${FPS_MOUNTED_SUFFIX}` : null;
}

// 刀具和投掷物保留其状态接触；枪械握持坐标系固定在武器局部，
// 腰射/ADS/冲刺只移动武器本身，不旋转手掌去抵消不合理的肘平面。
export const FPS_ARM_STATE_ROTATIONS = Freeze({
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
  if (typeof weaponId === "string" && weaponId.endsWith(FPS_MOUNTED_SUFFIX)) {
    return FPS_MOUNTED_ARM_POSES[weaponId.slice(0, -FPS_MOUNTED_SUFFIX.length)] || null;
  }
  return FPS_ARM_POSES[weaponId] || null;
}

export function FpsArmStateRotation(weaponId, state, side) {
  return FPS_ARM_STATE_ROTATIONS[weaponId]?.[state]?.[side]
    || FpsArmPose(weaponId)?.hip?.contacts?.[side]?.rotation
    || null;
}

/**
 * 这一侧有没有开镜专用握点、此刻混多少。没有（ads 接触就是腰射那一份）返回 0；
 * 调用方临时换掉 spec.contacts（开场演出、标定导出）时也返回 0，不去混一份对不上的数据。
 */
export function AdsContactMix(spec, side, ads) {
  const hip = spec?.hip?.contacts?.[side], adsContact = spec?.ads?.contacts?.[side];
  if (!adsContact || adsContact === hip || spec.contacts?.[side] !== hip) return 0;
  return Math.max(0, Math.min(1, ads || 0));
}
