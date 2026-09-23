// 第一关 03–05 可破坏掩体（纯数据，零 three）。2026-09-23 空间重排：docs/Data_FirstLevelSpace0106_20260923.md §2.6。
// 运行时机制归 Tank 包的 Script_FirstLevelFrontBreakables（契约 §3）：它按 hits 数主炮/手榴弹命中，
// 逐段把体块的顶降到 stages[k].topM（离该体块脚下共享地面的高度），或把沟沿抬浅到 stages[k].depthM。
// 这里只说「哪些能坏、坏几级、坏成什么样」，不写伤害数值（Data_Tuning_Tank 管）。
//   block   —— MISSION_LAYOUT.blocks 里的体块 id（Data_FirstLevelMissionLayout）
//   terrain —— 一处沟沿（FRONT_BREACHES 同格式的圆），stages 给出每级之后的沟深
//   cover   —— 坏到最后一级之后是否还登记为掩体点（AiCover 读）
//   visualOnly —— 只换外观、不改遮挡与碰撞（K5/K6 的路弯遮挡不许被炮打穿）
import { FRONT_SORTIE as S } from "./Data_FirstLevelFrontRoute.mjs";

export const FRONT_BREAKABLES = Object.freeze([
  // 阵位正面胸墙三段：04 战车压阵位时先打这里（机枪座前的低墙坏一级，座位就露出来）。
  { id: "NestWestParapet", block: "RightNestWestLow", kind: "parapet", hits: 2,
    stages: [{ topM: 0.9 }, { topM: 0.55 }], cover: true },
  { id: "NestNorthParapet", block: "RightNestNorthLow", kind: "parapet", hits: 2,
    stages: [{ topM: 0.9 }, { topM: 0.55 }], cover: true },
  { id: "NestNorthWall", block: "RightNestNorthHigh", kind: "ruinWall", hits: 3,
    stages: [{ topM: 1.7 }, { topM: 1.2 }, { topM: 0.7 }], cover: true },
  // 北侧残墙两段：侧翼组的田中掩体与火力基地东端，被我方机枪/手榴弹打塌。
  { id: "FieldRuinEast", block: "FieldRuin1", kind: "ruinWall", hits: 2,
    stages: [{ topM: 0.75 }, { topM: 0.45 }], cover: true },
  { id: "FireBaseEast", block: "FireBaseRuinE", kind: "ruinWall", hits: 2,
    stages: [{ topM: 1.0 }, { topM: 0.6 }], cover: true },
  // 受损沟沿：05 第二次近失弹后再塌一截（1.1 m → 0.8 m），站着更露、蹲着仍勉强藏得住（K8 的选择变硬）。
  { id: "DamagedLip", terrain: { x: S.damagedLip.x, z: S.damagedLip.z, radius: 3 }, kind: "trenchLip", hits: 1,
    stages: [{ depthM: 0.8 }], cover: false },
  // 北残院过梁：路弯遮挡物上沿的一段，只掉落外观，不改遮挡（战车在路弯后仍看不见）。
  { id: "NorthRuinLintel", block: "NorthRuinGable", kind: "lintel", hits: 1, stages: [{ topM: 3.3 }], cover: false, visualOnly: true },
]);

/** 永不破坏：04 短撤的后墙、地标山墙、最后遮挡、05 的掩护节拍、支沟与安全区的横墙、旧院与弹药屋。 */
export const FRONT_UNBREAKABLE = Object.freeze([
  "RightNestRearWest", "RightNestRearEast", "RightNestEastGable", "RightNestGablePeak", "RightNestWestHigh",
  "GapLastCover", "AttackRuinA", "RoadsideRuin", "RightApproachTraverse", "ScrapeWestTraverse",
  "OldYardNorthWest", "OldYardNorthEast", "OldYardWest", "OldYardCartScreen", "OldYardEastNorth", "OldYardEastSouth", "OldYardSouth",
  "BundleSupplyHouseWestNorth", "BundleSupplyHouseWestSouth", "BundleSupplyHouseEastNorth", "BundleSupplyHouseEastSouth",
  "BundleSupplyHouseNorth", "BundleSupplyHouseSouth",
]);
