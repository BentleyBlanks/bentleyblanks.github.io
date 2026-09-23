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
import { FRONT_SORTIE as Sortie, FRONT_SPACE as Space } from "./Data_FirstLevelFrontRoute.mjs";
import { MISSION_REAR_ROUTES, MISSION_BUNKER_TRENCH, MISSION_BUNKER_FRONT_SAP, MISSION_BUNKER_DEPTH_SAP } from "./Data_FirstLevelMissionTopology.mjs";

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
    // ---- 2026-09-23 proposal A: 01-06 front (docs/Data_FirstLevelLayoutProposalA.md) ----
    // 01-02 forward communication trench: SJ -> rear corner -> SSW leg -> bend M (dugout) -> J.
    {id:"BunkerTrench",preset:"communication",role:null,points:MISSION_BUNKER_TRENCH,
      source:"Data_FirstLevelMissionTopology.MISSION_BUNKER_TRENCH",routeBound:true},
    // The dugout's single mouth: a 2.6 m passage from the pit to the bend (the only opening).
    {id:"BunkerMouth",preset:"communication",role:null,points:[{x:-0.8,z:-126.0},{x:2.6,z:-124.9}],floorW:2.6,bankW:.8,bermH:0,
      source:"Data_FirstLevelMissionTrenches（自有点；洞口）",routeBound:false},
    // The link sap the 01 vanguard came down from the lost east end; its first fold F is where
    // ijaC stops (K1), its upper end is the nest's rear junction.
    {id:"BunkerFrontSap",preset:"communication",role:"enemyEntry",points:MISSION_BUNKER_FRONT_SAP,
      source:"Data_FirstLevelMissionTopology.MISSION_BUNKER_FRONT_SAP",routeBound:true},
    // Where the forward elements went on south into depth (never walked by the player).
    {id:"BunkerDepthSap",preset:"sap",role:"enemyEntry",points:MISSION_BUNKER_DEPTH_SAP,
      source:"Data_FirstLevelMissionTopology.MISSION_BUNKER_DEPTH_SAP",routeBound:false},
    // 03 support sap: SJ -> observation step -> fold (guard safe zone behind it) -> gap junction.
    {id:"SupportSap",preset:"communication",role:null,points:Sortie.approach.slice(0,8),
      source:"Data_FirstLevelFrontRoute.FRONT_SORTIE.approach[0..7]",routeBound:true},
    // K3 observation bay: a 0.95 m spur off the support sap (eye ~0.65 m above the field).
    {id:"ObservationSpur",preset:"communication",role:null,points:Space.observationSpur,depth:.95,floorW:2.6,bankW:.9,bermH:.1,bermSide:"minus",
      source:"Data_FirstLevelFrontRoute.FRONT_SPACE.observationSpur",routeBound:false},
    // 03 right low trench: gap junction -> nest west door. 1.35 m: crouched is covered, standing shows.
    {id:"RightApproach",preset:"communication",role:null,points:Sortie.approach.slice(7,13),
      depth:1.35,bermH:.2,bermSide:"minus",
      source:"Data_FirstLevelFrontRoute.FRONT_SORTIE.approach[7..12]",routeBound:true},
    // He / Zhou / relief: observation -> left gun at the berm's west end.
    {id:"LeftGunAccess",preset:"communication",role:null,points:Sortie.leftRoute.slice(2),depth:1.85,
      source:"Data_FirstLevelFrontRoute.FRONT_SORTIE.leftRoute[2..]",routeBound:true},
    // Backslope scrapes at the foot of the berm's south slope: visible from our side, hidden from the north.
    {id:"GuardBackslope",preset:"communication",role:null,points:[{x:-28.5,z:-156.4},{x:4.5,z:-156.2}],
      depth:.55,floorW:2.6,bankW:.8,bermH:.12,bermSide:"plus",
      source:"Data_FirstLevelMissionTrenches（自有点；FRONT_GUARD_POSTS 站在这条浅刮沟里）",routeBound:false},
    // The gap sap: last cover -> the one gap (shallowed by FRONT_BREACHES) -> gap junction.
    {id:"GuardWithdrawal",preset:"communication",role:null,points:Sortie.guardRoute.slice(0,4),depth:1.1,
      source:"Data_FirstLevelFrontRoute.FRONT_SORTIE.guardRoute[0..3]",routeBound:true},
    // 05 ammo sap: rear junction -> damaged lip -> yard gate (the last leg to the back door is inside the walled yard).
    {id:"BundleApproach",preset:"communication",role:null,points:Sortie.route.slice(0,-1),
      depth:Sortie.trenchDepthM,floorW:Sortie.trenchBottomM,bankW:Sortie.trenchBankM,bermH:.2,
      source:"Data_FirstLevelFrontRoute.FRONT_SORTIE.route（宽/深/坡取 trenchBottomM/trenchDepthM/trenchBankM）",routeBound:true},
    // 05 attack branch (upper link sap): rear junction -> road-side ruin; its last 4 m are shallowed.
    {id:"RoadAttack",preset:"communication",role:null,points:Sortie.attackRoute,depth:1.6,
      source:"Data_FirstLevelFrontRoute.FRONT_SORTIE.attackRoute",routeBound:true},
    // Road link: the blocked south road -> ammo sap (05 cut-in pair; seen from the damaged lip).
    {id:"RoadLinkSap",preset:"sap",role:"enemyEntry",points:Space.roadLink,depth:1.5,
      source:"Data_FirstLevelFrontRoute.FRONT_SPACE.roadLink",routeBound:false},
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
