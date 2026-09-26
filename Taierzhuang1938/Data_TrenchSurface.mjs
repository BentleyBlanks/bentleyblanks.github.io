// Concept 07: damp mineral earth, embedded fractured stones and root-bound dead grass.
export const TRENCH_SURFACE = Object.freeze({
  version: '2026092604',
  mud: { tileM: 1.7, baseTileM: 1.5, reliefM: .012, roughDry: .92, roughWet: .28, darken: .12,
    parallaxNearM: 6, parallaxFarM: 18, pomReliefM:.05, normalScale:.20, albedoScale:1.0,
    pomMinSteps:8, pomMaxSteps:28, pomRefineSteps:4, shadowSteps:6 },
  contact: { depthM: .035, blendWidthM: .10, edgeNoiseM: .018 },
  stone: { stride: 1, chance: .70, scale: [.15,.58], embed: .13 },
  grass: { stride: 1, chance: .93, scale: [.85,1.4], roughness: .97, color: 0xc7b99e, alphaTest:.42,
    matWidthM:.64, matDepthM:.35 },
  sectorM: 36,
  // Generated colour/height pair; normal and AO derive from the same authored height.
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
  rootMap: './Texture/Texture_TrenchRootMat.png',
});
