// Historical photographs 01/14: compact earthen cuts with sparse stones and grass.
export const TRENCH_SURFACE = Object.freeze({
  version: '2026100933',
  // 湿泥与积水 2026-09-28 起统一走 Data_Tuning_Terrain.TERRAIN_WATER（车道与沟底同一套水位模型）。
  mud: { tileM: 1.8, baseTileM: 1.8, compactTileM: 1.2, compactColorDetail: 1.0, reliefM: .035, roughDry: .94,
    parallaxNearM: 3, parallaxFarM: 12, pomReliefM:.005, looseReliefM:.020, normalScale:.80, colorDetail:1.25, albedoScale:1.0,
    pomMinSteps:8, pomMaxSteps:20, pomRefineSteps:4, shadowSteps:4 },
  contact: { depthM: .035, blendWidthM: .10, edgeNoiseM: .018 },
  stone: { stride: 1, chance: .04, scale: [.035,.12], embed: .36 },
  grass: { stride: 1, chance: .12, scale: [.35,.6], roughness: .97, color: 0xc7b99e, alphaTest:.48,
    matWidthM:.64, matDepthM:.35 },
  sectorM: 36,
  // Generated albedo; height, normal and AO derive from its luminance in the PBR baker.
  mudLayer: {
    base: './Texture/Texture_TrenchPomBase.webp',
    normal: './Texture/Texture_TrenchPomNormal.webp',
    orh: './Texture/Texture_TrenchPomOrh.webp',
  },
  // Approved reference 10: loose aggregates on spoil crowns, compact cut below.
  looseLayer: {
    base: './Texture/Texture_TrenchLooseEarthBase.webp',
    normal: './Texture/Texture_TrenchLooseEarthNormal.webp',
    orh: './Texture/Texture_TrenchLooseEarthOrh.webp',
  },
  // This CC0 Poly Haven rock_boulder_dry material shares the terrain array samplers.
  stoneLayer: {
    base: './Texture/Texture_TrenchStoneBase.webp',
    normal: './Texture/Texture_TrenchStoneNormal.webp',
    orh: './Texture/Texture_TrenchStoneOrm.webp',
  },
  models: { grass: './Model/Model_TrenchDryGrass.glb', stone: './Model/Model_TrenchStone.glb',
    clods: './Model/Model_TrenchClods.glb', cliffs: './Model/Model_TrenchCliffWalls.glb' },
  mudMap: './Texture/Texture_TrenchMudHeightMask.png',
  rootMap: './Texture/Texture_TrenchRootMat.webp',
});
