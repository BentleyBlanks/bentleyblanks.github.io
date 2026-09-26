// Concept 07: damp mineral earth, embedded fractured stones and root-bound dead grass.
export const TRENCH_SURFACE = Object.freeze({
  version: '2026092602',
  mud: { tileM: 1.7, baseTileM: .85, reliefM: .018, roughDry: .92, roughWet: .28, darken: .16,
    parallaxNearM: 4, parallaxFarM: 14, scanReliefM:.025, normalScale:.85, albedoScale:1.18 },
  contact: { depthM: .11, edgeNoiseM: .045 },
  stone: { stride: 1, chance: .70, scale: [.09,.46], embed: .17 },
  grass: { stride: 1, chance: .93, scale: [.85,1.4], roughness: .97, color: 0xd5d3c9, alphaTest:.42,
    matWidthM:1.45, matDepthM:.58 },
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
