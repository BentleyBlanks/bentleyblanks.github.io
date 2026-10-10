// Historical photographs 01/14: compact earthen cuts with sparse stones and grass.
export const TRENCH_SURFACE = Object.freeze({
  version: '2026101026',
  // Reference 10: mostly dry cut earth, with subdued moisture in low ground.
  wetness: { pooling: .12, floor: .30, frontZone: .30 },
  // 湿泥与积水 2026-09-28 起统一走 Data_Tuning_Terrain.TERRAIN_WATER（车道与沟底同一套水位模型）。
  // Keep compact colour detail at 1.21 while reducing clipped shadows in loose soil.
  mud: { tileM: 1.8, baseTileM: 1.8, compactTileM: 1.0, compactColorDetail: 1.21/1.35, reliefM: .035, roughDry: .94,
    parallaxNearM: 3, parallaxFarM: 12, pomReliefM:.008, looseReliefM:.020, normalScale:.80, colorDetail:1.35, albedoScale:1.0, clodLooseFraction:.20,
    crownBlendStart: .72, crownBlendEnd: .99, crownBlendNoise: .10,
    // Keep cut-face marks upright; stochastic offsets still break tile repetition.
    variantFrequency: .42, variantRotation: 0,
    projectionFade: [.25,.50],
    pomMinSteps:8, pomMaxSteps:20, pomRefineSteps:4, shadowSteps:4 },
  contact: { depthM: .035, blendWidthM: .10, edgeNoiseM: .018 },
  stone: { stride: 1, chance: .04, scale: [.035,.12], embed: .36 },
  grass: { stride: 1, chance: .12, scale: [.35,.6], roughness: .97, color: 0xffffff, alphaTest:.30,
    matWidthM:.64, matDepthM:.35, matMaxStretch:1.45,
    wallMatCols:6, wallMatRows:5, wallMatWidthM:1.0, wallMatDropM:.75, wallMatTopM:.12, wallMatPushM:.006, wallMatMaxStretch:1.8,
    wallMatSearchM:.65, wallMatSearchStepM:.025 },
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
