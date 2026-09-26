// Concept 07: damp mineral earth, embedded fractured stones and root-bound dead grass.
export const TRENCH_SURFACE = Object.freeze({
  version: '2026092603',
  mud: { tileM: 1.7, baseTileM: .8, reliefM: .012, roughDry: .92, roughWet: .28, darken: .12,
    parallaxNearM: 4, parallaxFarM: 14, scanReliefM:.025, normalScale:1.25, albedoScale:1.9 },
  contact: { depthM: .035, edgeNoiseM: .018 },
  stone: { stride: 1, chance: .70, scale: [.15,.58], embed: .13 },
  grass: { stride: 1, chance: .93, scale: [.85,1.4], roughness: .97, color: 0xc7b99e, alphaTest:.42,
    matWidthM:.64, matDepthM:.35 },
  sectorM: 36,
  // True scanned normal/roughness/displacement, replacing inferred data only in trenches.
  mudLayer: {
    base: './Texture/Texture_TrenchMudBase.webp',
    normal: './Texture/Texture_TrenchMudNormal.webp',
    orh: './Texture/Texture_TrenchMudOrh.webp',
  },
  // This CC0 Poly Haven rock_boulder_dry material shares the terrain array samplers.
  stoneLayer: {
    base: './Texture/Texture_TrenchStoneBase.webp',
    normal: './Texture/Texture_TrenchStoneNormal.webp',
    orh: './Texture/Texture_TrenchStoneOrm.webp',
  },
  models: { grass: './Model/Model_TrenchDryGrass.glb', stone: './Model/Model_TrenchStone.glb' },
  mudMap: './Texture/Texture_TrenchMudHeightMask.png',
  rootMap: './Texture/Texture_TrenchRootMat.png',
});
