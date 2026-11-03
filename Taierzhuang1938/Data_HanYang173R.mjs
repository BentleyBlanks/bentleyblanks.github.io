// Dots 173R author-space metres, +Y up, muzzle -Z. Values are measured in the
// delivered GLB; weapon operation remains driven by the existing game timeline.
export const HANYANG_173R = Object.freeze({
  version: '173R-20261103',
  url: './Model/HanYang173R/Model_HanYang173R.glb?v=173r-20261103',
  sourceSha256: '3f380317c1930c7c141f6f0c0abb415a336354e25b78f24cc7bb9aa8c650a38c',
  // SideWoodButton is metal in the source ORM despite its object name.
  wood: ['MainWood_ContinuousLowerShoulder', 'FrontWood_ContinuousOval', 'UpperWood_Rebuilt_ShortRearShoulder_ContinuousFront'],
  // 2026-10-29 user: 要原版的那种质感. Dots' base colours are 5-10x darker than
  // real walnut/steel (wood ~41/29/20 sRGB); their Blender validation renders
  // expose for the rifle. One shared gain stands in for that exposure on every
  // part: roughness, metalness and the parts' relative values stay as authored.
  // Retired: per-part steel gains x2.5-18 (equalised the parts into grey paint),
  // wood x6-12 (light oak), roughness x1.4-2.2 and metalness 0.7 (lost the sheen).
  // Visible display luma p50 wood/steel at 2.5: whitebox 71/60, medium daylight
  // 36/31; the Blender overview's wood is 51.
  exposureGain: 2.5,
  textureAnisotropy: 16,
  // 2026-11-03 底色校准（用户看过候选后定：「确实好很多，改了推吧」）。只调材质球上的底色倍率（material.color），
  // 贴图与 GLB 字节不动；`?gunBase=authored` 可切回旧的单一 exposureGain 对照。
  // 依据见 _shots/BaseColorCompare：木头 3.3% 低于实测最暗木材（≈9%）与 COD 二战木托（粗估 ≈9%）；
  // 钢件的来源素材 blue_metal_plate 在 Poly Haven 是金属度 0 的涂层漫反射色，被当成了金属反射率，
  // 发蓝层（四氧化三铁）约 20%。只动底色倍率，粗糙度 / 金属度 / 贴图一个字节不动。
  //   wood   三件木头共用一组逐通道倍率（乘在原始底色上，替代 exposureGain）：大件 MainWood 落到
  //          线性 ≈(0.151,0.077,0.039)、亮度 ≈9%，色相从 Poly Haven 那张橙棕（1:0.48:0.22）收一点到 1:0.51:0.26，
  //          再冷就会在蓝天光下发紫灰（HanYang173RBrowserTest 的暖色断言抓到过 1:0.6:0.4 与 1:0.52:0.28 两版）
  //          （10-29 被否的「浅橙色木头」是直接把橙棕拉亮）；三件之间原有的明暗差别保留。
  //   steel  每件按 gain = clamp((target / 现亮度)^exponent, 1, maxGain) 乘在 exposureGain 上：
  //          朝 20% 拉但按 0.75 次方压缩，件与件的高低顺序保留（被否的「灰漆」是全拉成一个值）；
  //          本来就亮于 20% 的不动，准星座这类深件最多 ×3、继续偏暗。
  //   partBaseY 各金属件原始底色贴图的线性亮度均值（GLB 原图缩到 64² 求均值）。
  //   2026-11-03 重烘的件沿用这里的旧值（岛内平均亮度只差 −13…+7%，定过的颜色不动）。
  baseCandidate: {
    wood: [5.72, 6.01, 6.76],
    steel: { target: 0.2, exponent: 0.75, maxGain: 3 },
    partBaseY: { ButtCap_LimitedProfileBlend: 0.0618, FrontBandSideStrip: 0.0478, FrontBand_ContinuousEnvelopeContact: 0.0344, FrontSideBoss_LowRoundedExterior: 0.0396, HY150_ExteriorSideRelief_Neg: 0.0146, HY150_ExteriorSideRelief_Pos: 0.0146, HY150_RoundedUpperExterior: 0.0151, HY150_VisualFrontSleeve: 0.0177, HY151_LowRearShoulder: 0.0145, HY153_VisualMouthLipAndShallowRecess: 0.0318, HY155_ContinuousInnerEdgeTrim_Neg: 0.0367, HY155_ContinuousInnerEdgeTrim_Pos: 0.0377, HandleNeck: 0.0725, HandleRoot: 0.0844, HandleSphere: 0.1478, HandledCylinder: 0.1119, LongOuterSteel_TrueRound: 0.0487, LowerPlateGuard_FlatSideNarrowReturn: 0.043, MiddleSideDisk: 0.0901, PlateExterior_ShallowSurfaceMark_1: 0.1035, PlateExterior_ShallowSurfaceMark_2: 0.0919, PlateExterior_ShallowSurfaceMark_3: 0.11, RearBand_ControlledCrown: 0.0372, RearBand_ExternalAttachmentBridge: 0.0989, RearBand_ExternalAttachmentLoop: 0.099, RearCockingExterior: 0.082, RearOuterCover_RoundedSideReturn: 0.0316, RearSmallCover: 0.081, RearSmallPin: 0.0817, RearStock_ExternalAttachmentBridge: 0.099, RearStock_ExternalAttachmentLoop: 0.099, RearTab: 0.0815, RearTopExternalLever: 0.0335, ReceiverOuterCollar: 0.031, SideWoodButton: 0.0941, Sight_LowContinuousLeaf_NoUnknownNumbers: 0.0385, Sight_LowCrossPiece: 0.0302, Sight_ShallowRoundSeat: 0.083, 'Sight_SideRoundHead_-1': 0.083, Sight_SideRoundHead_1: 0.083, Trigger_FlatCurvedExternalStrip: 0.0283 },
  },
  bolt: ['HandledCylinder', 'HandleRoot', 'HandleNeck', 'HandleSphere'],
  cocking: ['RearCockingExterior', 'RearOuterCover_RoundedSideReturn', 'RearSmallCover', 'RearSmallPin', 'RearTab', 'RearTopExternalLever'],
  frontSight: ['HY150_RoundedUpperExterior', 'HY150_ExteriorSideRelief_Neg', 'HY150_ExteriorSideRelief_Pos', 'HY151_LowRearShoulder'],
  rearSight: ['Sight_LowContinuousLeaf_NoUnknownNumbers', 'Sight_LowCrossPiece', 'Sight_ShallowRoundSeat', 'Sight_SideRoundHead_1', 'Sight_SideRoundHead_-1'],
  trigger: 'Trigger_FlatCurvedExternalStrip',
  mounts: {
    muzzle: [0, 0.03857, -0.995], gripR: [0, 0, 0], gripL: [0, -0.012, -0.418],
    sight: [0, 0.06535, -0.321], magazine: [0, -0.015, -0.04],
    feedMouth: [0, 0.041, -0.187], ejection: [0.016, 0.042, -0.187], boltOpen: [0, 0, 0.078],
  },
  mechanism: {pivot: [0, 0.04194, -0.1468], handle: [0.051525, 0.04194, -0.14678], seat: [0, 0.041, -0.187]},
  aimRotation: [Math.atan2(0.06535-0.05920874,0.9655-0.321),0,0],
  openGripOffset: [.038,0,0],
});
