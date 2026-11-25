// Data_ShellImpactRangeTerrain.mjs 的配套函数（2026-11-02 从数据模块搬出来：数据模块只放能导出成 JSON 的数据，见 docs/Data_DataSources.md「数据模块只放数据」）。

import { TrenchPlanFor } from "./Data_FirstLevelMissionTerrain.mjs";
import { SampleMissionGroundSurface, SampleMissionTerrain } from "./Script_FirstLevelMissionTerrain.mjs";
import { SHELL_IMPACT_RANGE_ID, SHELL_IMPACT_WORLD } from "./Data_ShellImpactRange.mjs";
import { SHELL_IMPACT_GROUND_TINT, SHELL_IMPACT_TERRAIN } from "./Data_ShellImpactRangeTerrain.mjs";
import { SCENE_ASSETS } from "./Data_SceneAssets.mjs";
import { GridSampler, SceneTrenchSpec } from "./Script_SceneTrenches.mjs";

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

/**
 * 将 Scenes/TestShellImpact/Scene_TestShellImpact.json 转换为 ShellImpactRangeField 消费的完整布局：
 *   · 保留自然高度图 + 样条壕沟的精细沟壁细分（refine）与 MissionPlain 分层土偏色；
 *   · 场景里的 Prop/* 转为 phase.externalPlacements（交给 AddExternalProps 摆真实模型与碰撞，不重复建盒）；
 *   · 场景里的 Tree/Dead 提取为 sceneTrees（交给 BreakableTrees.Load 建可炸断枯树）。
 */
export function BuildShellImpactSceneLayout(baseLayout, doc, _plan, preHeights, phase = null) {
  const b = doc.bounds || SHELL_IMPACT_WORLD;
  const naturalHeight = preHeights ? GridSampler(doc.terrain, preHeights) : SHELL_IMPACT_TERRAIN.naturalHeight;
  const trenchNetwork = doc.trenches ? SceneTrenchSpec(doc.trenches) : SHELL_IMPACT_TERRAIN.trenchNetwork;
  const terrainSpec = {
    cellM: 0.75,
    refine: { subdivisions: 3, errorM: 0.08, screenM: 0.1 },
    textureTileM: 2,
    naturalHeight,
    roads: [],
    rivers: [],
    pads: [],
    steps: [],
    whiteboxTerrain: null,
    trenchNetwork,
    get trenches() { return TrenchPlanFor(this).trenches; },
  };
  const tint = Array.isArray(doc.look?.groundTint) ? doc.look.groundTint : SHELL_IMPACT_GROUND_TINT;
  const DEG = Math.PI / 180;
  const externalPlacements = [];
  const sceneTrees = [];
  for (const obj of doc.objects || []) {
    const def = SCENE_ASSETS[obj.asset];
    if (!def) continue;
    if (def.kind === "prop") {
      externalPlacements.push({
        asset: def.model,
        x: obj.pos[0],
        z: obj.pos[2],
        ry: (obj.yawDeg || 0) * DEG,
        scale: obj.params?.scale ?? 1,
      });
    } else if (def.kind === "tree") {
      sceneTrees.push({
        id: obj.id,
        x: obj.pos[0],
        z: obj.pos[2],
        ry: (obj.yawDeg || 0) * DEG,
        scale: obj.params?.scale ?? 1,
        region: "ImpactRange",
      });
    }
  }
  if (phase) phase.externalPlacements = externalPlacements;
  const staticBlocks = (baseLayout.blocks || []).filter((blk) => !blk.propModel && !blk.sceneTree && !blk.blockoutTree);
  return {
    ...baseLayout,
    id: phase?.id || SHELL_IMPACT_RANGE_ID,
    legend: false,
    fortifications: false,
    materialLooks: false,
    railway: null,
    scenario: null,
    terrain: "P012Heightfield",
    terrainSpec,
    terrainSampler: null,
    trenchPlan: null,
    groundTint: tint,
    SampleGroundColor: SampleImpactGroundColor,
    SampleGroundSurface: (x, z, color, layers) => {
      SampleMissionGroundSurface(x, z, color, layers, terrainSpec);
      color[0] *= tint[0]; color[1] *= tint[1]; color[2] *= tint[2];
      return color;
    },
    bounds: { minX: b.minX, maxX: b.maxX, minZ: b.minZ, maxZ: b.maxZ },
    ground: {
      x: (b.minX + b.maxX) / 2, z: (b.minZ + b.maxZ) / 2, w: b.maxX - b.minX, d: b.maxZ - b.minZ,
      h: 1, y: -0.5, semantic: "ground", pbr: "Ground", pbrOptions: { normalScale: 0.5, metalness: 0 },
      terrainLayers: doc.look?.terrainLayers || "MissionPlain",
    },
    semanticColors: { ground: 0x86877d, earthDark: 0x696452 },
    semanticSurfaces: { ground: "dirt", earthDark: "dirt" },
    sceneProps: null,
    sceneTrees,
    proceduralDressing: false,
    blocks: staticBlocks,
    gates: [],
    walkableSurfaces: [],
    trenchPlacements: [],
    zones: [],
  };
}
