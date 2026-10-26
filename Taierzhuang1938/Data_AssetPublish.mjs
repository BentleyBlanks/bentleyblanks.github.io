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
    'Model/HanYang173R/Model_HanYang173R.glb',
    'Model/BaconHandoff/Model_CuredPork.glb',
    ...['Ija01','Ija02','Ija03','Ija06','Nra02','Nra05','Nra06'].map(id => `Model/Character/Model_Tengxian${id}.glb`),
    ...['AsianHousePair','AsianHouseRow','BreakableDeadTree','ChineseRuralHouse','Cigarette',
      'FirstPersonBody','FpsArmsNraSkeletal01','FpsHanYangHands','MitsubishiKi21Ia','MitsubishiKi30','Type24Grenade','WardProps']
      .map(id => `Model/Model_${id}.glb`),
    ...['WoodenEvacCart','WorkingHorse','WorkingOx'].map(id => `Model/OxCart/Model_${id}.glb`),
  ]),
});

// 手机版贴图（2026-10-26 用户定：手机上大部分贴图 1024 + ASTC 6×6；法线图 1024 + ASTC 4×4，6×6 压法线会起颗粒）。
// 只在 Pages 发布时由 Script_PublishMobileAssets 生成；运行时手机 / 平板且显卡支持 ASTC 才用，电脑端不变。
// preset 是 astcenc 的质量档（-fast / -medium / -thorough）；zstdLevel 是 KTX2 的 zstd 超压缩级别（0 = 不压）。
export const MOBILE_ASSETS = Object.freeze({
  version: 1,
  maxSize: 1024,
  colorBlock: '6x6', dataBlock: '6x6', normalBlock: '4x4',
  preset: '-medium',
  zstdLevel: 19,
});
