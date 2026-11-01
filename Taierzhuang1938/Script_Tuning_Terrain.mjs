// Data_Tuning_Terrain.mjs 的配套函数（2026-11-02 从数据模块搬出来：数据模块只放能导出成 JSON 的数据，见 docs/Data_DataSources.md「数据模块只放数据」）。

import { TERRAIN_QUALITY, TERRAIN_SETS } from "./Data_Tuning_Terrain.mjs";

/** 一套地形的三张图 URL（相对 Taierzhuang1938/）。 */
export function TerrainLayerUrls(setName) {
  const set = TERRAIN_SETS[setName];
  if (!set) throw new Error(`Unknown terrain set: ${setName}`);
  return set.layers.map((layer) => ({
    id: layer.id,
    base: `./Texture/Texture_Terrain${layer.file}Base.webp?v=${set.version}`,
    normal: `./Texture/Texture_Terrain${layer.file}Normal.webp?v=${set.version}`,
    orh: `./Texture/Texture_Terrain${layer.file}Orh.webp?v=${set.version}`,
  }));
}

/** 一档画质对应的地形分档；没登记的档位按 high。 */
export function TerrainQualityOf(quality) {
  return TERRAIN_QUALITY[quality] || TERRAIN_QUALITY.high;
}
