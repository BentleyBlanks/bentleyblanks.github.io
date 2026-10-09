// Publish-only encoding policy. Base dimensions, UVs, geometry and animation stay unchanged.
export const ASSET_PUBLISH = Object.freeze({
  version: 1,
  textureFormat: 'ktx2-uastc', quality: 40, uastcRdo: 0.5,
  opaqueColorFormat: 'ktx2-etc1s', opaqueColorQuality: 100,
  // Small WebP files can grow after adding GPU blocks and mip levels. Keep their
  // source unless explicitly overridden in the texture importer; report the decision.
  maxTransferGrowth: 1.25,
  // Avoid spending encoder time on images already far smaller than GPU blocks.
  // Explicit import settings bypass automatic policy and can force a GPU format.
  minSourceToGpuRatio: 0.2,
  // These are production models. Reference/review models and unused legacy assets remain source-only.
  models: Object.freeze([
    'Model/BaconHandoff/Model_CuredPork.glb',
    ...['Ija01','Ija02','Ija03','Ija06','Nra02','Nra05','Nra06'].map(id => `Model/Character/Model_Tengxian${id}.glb`),
    ...['AsianHousePair','AsianHouseRow','BreakableDeadTree','ChineseRuralHouse','Cigarette',
      'FirstPersonBody','FpsArmsNraSkeletal01','FpsHanYangHands','MitsubishiKi21Ia','MitsubishiKi30','Type24Grenade']
      .map(id => `Model/Model_${id}.glb`),
    ...['WoodenEvacCart','WorkingHorse','WorkingOx'].map(id => `Model/OxCart/Model_${id}.glb`),
  ]),
});
