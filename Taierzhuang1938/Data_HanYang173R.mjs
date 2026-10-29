// Dots 173R author-space metres, +Y up, muzzle -Z. Values are measured in the
// delivered GLB; weapon operation remains driven by the existing game timeline.
export const HANYANG_173R = Object.freeze({
  version: '173R-20261029',
  url: './Model/HanYang173R/Model_HanYang173R.glb?v=173r-20261029',
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
