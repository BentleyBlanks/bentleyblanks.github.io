// 第一关壕沟网络：中心线与段级参数。**纯数据，零 three**，Node 里直接可读。
//
// 这是壕沟的唯一口径。以前 7 条折线各带 depth/bottom/bank 常量写死在
// Data_FirstLevelMissionTerrain 的 MISSION_TERRAIN.trenches 里，宽窄深浅都是
// 数字常量；现在只留「中心线 + 用哪个预设 + 少数段级覆盖」，逐点的宽/深/抛土
// 由 Script_TrenchPlan 的位置噪声算，布设参数在 TRENCH_PRESETS。
//
// ## points 从哪来（改点先改来源，别在这里抄一份）
// 大部分段的控制点**就是任务/AI 路线本身**（routeBound: true）：沟是照着人
// 要走的线挖出来的，两边各写一份必然对不上（旧账：支援路线改了一个点，沟没
// 跟着改，老周的担架队就从沟沿上走过去）。`source` 逐段写清来源文件与字段。
//
// ## 连接关系
// 三岔口在 (6,-124)：FrontCommunication 末端 + FrontTraverse 中段 +
// BundleApproach 起点。两个回环（EntryCoverLoop / NorthCoverLoop）两端都接
// FrontCommunication。FlankBreachSap 一端接 FrontCommunication (-37,8)，另一端
// 是缺口（尽端由 FRONT_BREACHES 抬到 1.05，敌人从那儿进来）。
// 这些不写死在数据里 —— CompileTrenchNetwork 按「端点落在别段中心线上」自动
// 认出来，拖点之后不用手工维护一张连接表。
//
// ## 宽度
// 段里不写宽度的，取预设（§见 Script_TrenchPlan.TRENCH_PRESETS）。
// 只有 BundleApproach 例外：它的宽/深/坡与 FRONT_SORTIE 的爬行净空是一笔账
// （crawlRoofM / crawlClearanceM 按 trench*M 采样），所以仍从那边取。
// 旧宽度（bottom/bank，全部 depth 2）留作 legacy 对拍的基准，见
// Script_TrenchPlanTest：FrontCommunication 4.2/1.5、FrontTraverse 4.2/1.5、
// BundleApproach 3.6/1.3、WestEvacuation 5.2/2.2、两回环 3.6/1.5、Sap 3.2/1.5。

import { OPENING } from "./Data_FirstLevelOpening.mjs";
import { FRONT_SORTIE as Sortie } from "./Data_FirstLevelFrontRoute.mjs";
import { MISSION_REAR_ROUTES } from "./Data_FirstLevelMissionTopology.mjs";

export const MISSION_TRENCH_NETWORK = Object.freeze({
  version: 1,
  seed: "tengxian1938:trench",
  segments: Object.freeze([
    {
      id: "FrontCommunication", preset: "communication", role: null,
      points: [...OPENING.approachRoute.slice(1), ...OPENING.supportRoute.slice(1)],
      source: "Data_FirstLevelOpening.OPENING.approachRoute.slice(1)+supportRoute.slice(1)（AI/任务路线共用，改点先改那边）",
      routeBound: true,
    },
    {
      id: "FrontTraverse", preset: "fire", role: null,
      points: [{ x: -32, z: -124 }, { x: 0, z: -124 }, { x: 24, z: -124 }],
      bermSide: "minus",            // 北侧=敌方：抛土朝敌，自己这侧不挡射界
      source: "Data_FirstLevelMissionTrenches（自有点；与 OPENING.frontPosts / zhouGunSeat 同一条线）",
      routeBound: false,
    },
    {
      id: "BundleApproach", preset: "communication", role: null,
      points: Sortie.route,
      depth: Sortie.trenchDepthM, floorW: Sortie.trenchBottomM, bankW: Sortie.trenchBankM,
      bermH: 0.2,
      source: "Data_FirstLevelFrontRoute.FRONT_SORTIE.route（宽/深/坡取 trenchBottomM/trenchDepthM/trenchBankM，爬行净空按它采样）",
      routeBound: true,
    },
    {
      id: "WestEvacuation", preset: "evacuation", role: null,
      // 只取到 index 6 (56,207)：15B 起沟就到头了，接上去的是靠院墙的夹道
      // （2.8 m 净宽的两道墙，见 Data_FirstLevelMissionLayout 的 WallPath*）。
      // 一条 5.2 m 宽的沟塞不进 2.8 m 的巷子，两者必须在这里交班。
      points: MISSION_REAR_ROUTES.evacuation.slice(0, 7),
      source: "Data_FirstLevelMissionTopology.MISSION_REAR_ROUTES.evacuation.slice(0,7)（担架队与人群共用；尾段 15B 是夹道不是沟）",
      routeBound: true,
    },
    {
      id: "EntryCoverLoop", preset: "loop", role: "localLoop",
      points: [{ x: -45, z: 41 }, { x: -52, z: 35 }, { x: -52, z: 27 }, { x: -45, z: 24 }],
      source: "Data_FirstLevelMissionTrenches（自有点；两端接 OPENING.approachRoute 的 (-45,41)/(-45,24)）",
      routeBound: false,
    },
    {
      id: "NorthCoverLoop", preset: "loop", role: "localLoop",
      points: [{ x: -24, z: -44 }, { x: -31, z: -48 }, { x: -31, z: -56 }, { x: -24, z: -60 }],
      source: "Data_FirstLevelMissionTrenches（自有点；两端接 OPENING.supportRoute 的 (-24,-23)→(-24,-60) 段）",
      routeBound: false,
    },
    {
      id: "FlankBreachSap", preset: "sap", role: "enemyEntry",
      points: [{ x: -22, z: 8 }, { x: -28, z: 8 }, { x: -37, z: 8 }],
      source: "Data_FirstLevelMissionTrenches（自有点；(-22,8)=OPENING.breach 尽端，(-37,8) 接 approachRoute 的 (-37,24)→(-37,6) 段）",
      routeBound: false,
    },
  ]),
});

export default MISSION_TRENCH_NETWORK;
