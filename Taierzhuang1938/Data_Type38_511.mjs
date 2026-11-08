// Dots 511, user-approved HanYang-class reduction. Author frame measured from
// the delivered vertices: metres, +Y up, muzzle -Z. See Model/Type38_511.
export const TYPE38_511 = {
  version: '511-20261108',
  url: './Model/Type38_511/Model_Type38_511.glb?v=511-20261108',
  npcLodUrl: './Model/Type38_511/Model_Type38_511NpcLod.glb?v=1',
  npcLodPart: 'Exterior_FoldedFrame12',
  npcTriangles: 64978,
  triangles: 69586,
  parts: 45,
  sourceSha256: '77768c563db9fe7a3db3b0fd937279b4b6d05eb058cc441cafb3bcda0e668ad5',
  frameOffset: [0, -0.005, -0.027],
  textureAnisotropy: 16,
  // One shared exposure compensation for the author's studio-lit PBR bake;
  // texture pixels, relative part colours, metalness and roughness stay authored.
  exposureGain: 2.5,
  wood: ['T38_460G_WoodGroove_VisualCandidate','Wood_UpperFittedCrown05'],
  bolt: ['Exterior_HandleOval08','T38_435F2_IndependentTailNeckExterior',
    'T38_435F2_VisualBackingRearEnd','T38_440D2_IndependentVisibleRecess'],
  dustCover: ['T38_430B_IndependentLeftCoverSkin','T38_430B_RetainedRightCoverHalf'],
  frontSight: ['Exterior_FrontUpperRoot80','Exterior_FrontUpperDetail76_Neg','Exterior_FrontUpperDetail76_Pos','T38_430J_Exterior_ImportedRemainder_Plate72'],
  rearSight: ['Exterior_FoldedFrame12','Exterior_FoldedShortBridge47','Exterior_FoldedRoundShoulder47_-1',
    'Exterior_FoldedRoundShoulder47_1','Exterior_RearTransverseRelief49','Exterior_FrontWindowBacking49',
    'Exterior_LowRoundedSupport70','Exterior_ShortTransverseHead71','SightDetail335_CentralVisibleBacking_ART_ASSUMED_DEPTH',
    'SightDetailV3_DecorativeConvexRoundSurface','SightDetailV3_ShallowVisibleEdgeFacets_ART_ONLY'],
  trigger: 'T38_462_TriggerTip_VisualCandidate',
  mounts: {
    muzzle: [0, 0.0349, -1.0481], gripR: [0,0,0], gripL: [0,-0.012,-0.443],
    sight: [-0.000284,0.056,-0.3351], magazine: [0,-0.006,-0.087],
    feedMouth: [0,0.039,-0.225], ejection: [0.017,0.040,-0.225], boltOpen: [0,0,0.12],
  },
  mechanism: {pivot:[0,0.039,-0.128],handle:[0.066,0.040,-0.128],seat:[0,0.039,-0.225]},
  aimRotation: [0.0052084,0.000417,0],
  // The retained source mesh contains the actual blade; Root80 is only its base.
  frontSightRegion: {x:0,z:-1.016108,base:0.048},
};
