// Data_ShellImpactRangeTerrain.mjs 的配套函数（2026-11-02 从数据模块搬出来：数据模块只放能导出成 JSON 的数据，见 docs/Data_DataSources.md「数据模块只放数据」）。

import { TrenchPlanFor } from "./Data_FirstLevelMissionTerrain.mjs";
import { SampleMissionGroundSurface, SampleMissionTerrain } from "./Script_FirstLevelMissionTerrain.mjs";
import { SHELL_IMPACT_RANGE_ID, SHELL_IMPACT_WORLD } from "./Data_ShellImpactRange.mjs";
import { SHELL_IMPACT_GROUND_TINT, SHELL_IMPACT_TERRAIN } from "./Data_ShellImpactRangeTerrain.mjs";

/** 场地高度（含沟、垄），弹坑之前的那一份基线。 */
export const SampleImpactTerrain = (x, z) => SampleMissionTerrain(x, z, SHELL_IMPACT_TERRAIN);

/** 编译后的壕沟计划（站点、弧长、junction 都在里头）。 */
export const ImpactTrenchPlan = () => TrenchPlanFor(SHELL_IMPACT_TERRAIN);

/** 顶点色底色（地表图层加载失败时的退路）：偏黄褐的干土。 */
function SampleImpactGroundColor(x, z, out = [0, 0, 0]) {
  const k = 0.95 + 0.05 * Math.sin(x * 0.37) * Math.sin(z * 0.29);
  out[0] = 0.86 * k; out[1] = 0.8 * k; out[2] = 0.68 * k;
  return out;
}

/** FirstLevelWhiteboxField 吃的布局。 */
export function BuildShellImpactLayout() {
  const b = SHELL_IMPACT_WORLD;
  return {
    id: SHELL_IMPACT_RANGE_ID,
    legend: false, fortifications: false, materialLooks: false, railway: null, scenario: null,
    terrain: "P012Heightfield",
    terrainSpec: SHELL_IMPACT_TERRAIN,
    SampleGroundColor: SampleImpactGroundColor,
    // 地表图层（底土 / 草茬 / 沟边翻土）的权重：同第一关那一份，但读我们自己的 spec。
    SampleGroundSurface: (x, z, color, layers) => {
      SampleMissionGroundSurface(x, z, color, layers, SHELL_IMPACT_TERRAIN);
      color[0] *= SHELL_IMPACT_GROUND_TINT[0]; color[1] *= SHELL_IMPACT_GROUND_TINT[1]; color[2] *= SHELL_IMPACT_GROUND_TINT[2];
      return color;
    },
    bounds: { minX: b.minX, maxX: b.maxX, minZ: b.minZ, maxZ: b.maxZ },
    ground: { x: (b.minX + b.maxX) / 2, z: (b.minZ + b.maxZ) / 2, w: b.maxX - b.minX, d: b.maxZ - b.minZ,
      h: 1, y: -0.5, semantic: "ground", pbr: "Ground", pbrOptions: { normalScale: 0.5, metalness: 0 },
      terrainLayers: "MissionPlain" },
    semanticColors: { ground: 0x86877d, earthDark: 0x696452 },
    semanticSurfaces: { ground: "dirt", earthDark: "dirt" },
    blocks: [], gates: [], walkableSurfaces: [], trenchPlacements: [], zones: [],
  };
}
