// 炮击扬尘测试场的地形与布局（纯数据 + 纯函数，零 three，Node 可直接读）。
//
// 做法：复用第一关的分层土壤地形管线 —— `Data_FirstLevelMissionTerrain.SampleMissionTerrain(x, z, spec)` 吃一份
// terrain spec（道路 / 场坪 / 壕沟网络 / 自然地面），`FirstLevelWhiteboxField` 吃一份 layout。这里给它们一份自己的：
//   · 自然地面是一片缓起伏的平地（spec.naturalHeight，第一关的自然地面带着东西北三道土坎，不适合独立场地）；
//   · 壕沟网络是 Data_ShellImpactRange 的四段（射击壕 / 交通壕 / 后方横沟 / 听音哨），带 earthProfile，
//     所以沟外是不规则连续的弃土垄、沟壁陡而不规则（docs/Data_TrenchSurface.md）；
//   · 没有道路 / 场坪 / 河，地表图层只剩底土 + 草茬 + 沟边翻土，真实土色 PBR（MissionPlain 图层集）。
// 不碰第一关的任何数据：spec 是新对象，第一关的 MISSION_TERRAIN 逐位不变。
import { SampleMissionTerrain, TrenchPlanFor } from "./Data_FirstLevelMissionTerrain.mjs";
import { SampleMissionGroundSurface } from "./Data_FirstLevelMissionTerrain.mjs";
import { TRENCH_EARTH_PROFILE } from "./Data_TrenchAppearance.mjs";
import {
  SHELL_IMPACT_RANGE_ID, SHELL_IMPACT_ORIGIN, SHELL_IMPACT_WORLD, SHELL_IMPACT_TRENCH_SEGMENTS,
  SHELL_IMPACT_TRENCH_NETWORK_ID,
} from "./Data_ShellImpactRange.mjs";

/**
 * 自然地面：几乎平的黄土地，只有 ±0.15 m 的缓起伏，没有边缘土坎。
 * 大尺度的起伏用世界坐标的正弦（周期远大于沟宽），不引随机数。
 */
export function SampleImpactNaturalHeight(x, z) {
  const u = x - SHELL_IMPACT_ORIGIN.x, v = z - SHELL_IMPACT_ORIGIN.z;
  return 0.11 * Math.sin(u / 23) * Math.cos(v / 29) + 0.05 * Math.sin((u + v) / 11) + 0.03 * Math.sin(u / 5.3 + v / 7.1);
}

export const SHELL_IMPACT_TRENCH_NETWORK = Object.freeze({
  version: 1,
  seed: SHELL_IMPACT_TRENCH_NETWORK_ID,
  earthProfile: TRENCH_EARTH_PROFILE,
  segments: SHELL_IMPACT_TRENCH_SEGMENTS,
});

export const SHELL_IMPACT_TERRAIN = Object.freeze({
  cellM: 0.75,
  // 沟壁一格采不住的地方往下细分（Data_FirstLevelP012Terrain.RefineCells），同第一关。
  refine: { subdivisions: 3, errorM: 0.08, screenM: 0.1 },
  textureTileM: 2,
  naturalHeight: SampleImpactNaturalHeight,
  roads: [],
  rivers: [],
  pads: [],
  steps: [],
  whiteboxTerrain: null,
  trenchNetwork: SHELL_IMPACT_TRENCH_NETWORK,
  // 兼容视图：同 MISSION_TERRAIN.trenches（地表图层取样读它）；getter，编辑器改参数后跟着换。
  get trenches() { return TrenchPlanFor(this).trenches; },
});

/** 场地高度（含沟、垄），弹坑之前的那一份基线。 */
export const SampleImpactTerrain = (x, z) => SampleMissionTerrain(x, z, SHELL_IMPACT_TERRAIN);

/** 编译后的壕沟计划（站点、弧长、junction 都在里头）。 */
export const ImpactTrenchPlan = () => TrenchPlanFor(SHELL_IMPACT_TERRAIN);

/**
 * 地表顶点色的整体偏色（sRGB 倍率，乘在 MissionPlain 图层集的反照率上）。第一关那套土偏冷灰棕（2026-09-28 对标第一关参考图），
 * 参考图（炮击扬尘）是平坦的黄土地，所以这里往黄褐上推一点；亮度基本不变。弹坑重采样走同一个函数，坑里的土色一致。
 */
export const SHELL_IMPACT_GROUND_TINT = Object.freeze([1.06, 1.0, 0.86]);

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
