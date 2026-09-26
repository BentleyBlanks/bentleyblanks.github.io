// Concept 07: damp mineral earth, embedded fractured stones and root-bound dead grass.
export const TRENCH_SURFACE = Object.freeze({
  version: '2026092601',
  mud: { tileM: 2.8, baseTileM: 1.3, reliefM: .052, roughDry: .87, roughWet: .24, darken: .46,
    parallaxNearM: 6, parallaxFarM: 22 },
  contact: { depthM: .045, edgeNoiseM: .025 },
  stone: { stride: 2, chance: .76, scale: [.16,.72], embed: .10 },
  grass: { stride: 2, chance: .74, scale: [.85,1.35], roughness: .91, color: 0x958267 },
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
});
