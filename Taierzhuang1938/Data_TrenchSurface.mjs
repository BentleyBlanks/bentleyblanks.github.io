// Historical photographs 01/14: compact earthen cuts with sparse stones and grass.
export const TRENCH_SURFACE = Object.freeze({
  version: '2026100701',
  // 湿泥与积水 2026-09-28 起统一走 Data_Tuning_Terrain.TERRAIN_WATER（车道与沟底同一套水位模型）。
  mud: { tileM: 1.7, baseTileM: 1.8, reliefM: .012, roughDry: .94,
    parallaxNearM: 6, parallaxFarM: 18, pomReliefM:.018, normalScale:.16, albedoScale:1.0,
    pomMinSteps:8, pomMaxSteps:28, pomRefineSteps:4, shadowSteps:6 },
  contact: { depthM: .035, blendWidthM: .10, edgeNoiseM: .018 },
  stone: { stride: 1, chance: .16, scale: [.09,.25], embed: .19 },
  grass: { stride: 1, chance: .27, scale: [.45,.8], roughness: .97, color: 0xc7b99e, alphaTest:.42,
    matWidthM:.64, matDepthM:.35 },
  sectorM: 36,
  // Generated albedo; height, normal and AO derive from its luminance in the PBR baker.
  mudLayer: {
    base: './Texture/Texture_TrenchPomBase.webp',
    normal: './Texture/Texture_TrenchPomNormal.webp',
    orh: './Texture/Texture_TrenchPomOrh.webp',
  },
  // This CC0 Poly Haven rock_boulder_dry material shares the terrain array samplers.
  stoneLayer: {
    base: './Texture/Texture_TrenchStoneBase.webp',
    normal: './Texture/Texture_TrenchStoneNormal.webp',
    orh: './Texture/Texture_TrenchStoneOrm.webp',
  },
  models: { grass: './Model/Model_TrenchDryGrass.glb', stone: './Model/Model_TrenchStone.glb' },
  mudMap: './Texture/Texture_TrenchMudHeightMask.png',
  rootMap: './Texture/Texture_TrenchRootMat.webp',
});
