// 正式场景的分层地表（docs/Data_Scene.md §8，2026-11-01）：场景的地面涂色（paint）按 id 归到 MissionPlain
// 图层集的几层（Data_Tuning_Terrain.TERRAIN_SETS.MissionPlain），再加上沟（ways.trenches）与陡坡的翻土。
//
// 层的意思同现行第一关（Data_FirstLevelMissionTerrain.SampleMissionGroundSurface）：
//   track 车道 / 踩实的路面（CartTrack）   spoil 翻土 / 裸土（SpoilEarth）   soil 底土（FieldSoil，不长草茬）
//   剩下的是草茬（DryStubble）：田、田埂、河堤、树林地与没涂的地方。
// 读取：Script_EditorBlockoutLevels.BuildSceneGroundSurface。纯数据。

/** 涂色 id → 层（先命中先用；没命中 = 草茬）。数是这一层的权重，加起来不超过 1。 */
export const SCENE_GROUND_CLASSES = Object.freeze([
  Object.freeze({ match: /^(Road_|RoadNorthEnd|PostRoadNorthEnd|NorthRoad|FieldPath|FieldLane_|RailNorth|RailSouth)/, track: 1 }),
  // 01–05 那一大片农田的底色（17 万平方米、白盒里是 0.6 的沙土色罩子）：草茬里夹着一成多裸土，不是路
  Object.freeze({ match: /^FarmPaths/, soil: 0.35 }),
  // 村里的院场、门口空地：踩实了一大半、剩下是底土
  Object.freeze({ match: /^(Village|NorthGateYard)/, track: 0.6, soil: 0.4 }),
  // 旧壕、散兵坑、挖出来的土、沟里的沙、陡坎、坟头、河床
  Object.freeze({ match: /^(SapSpoil|OldTrench_|OldFoxhole_|DitchSoil|DitchSand|AtDitch|ScarpFace|Grave_|FieldGrave_|WoodLiu_Grave|WoodZhao_Grave|SandBed|Stream)/, spoil: 1 }),
  // 阵地前清过的地：底土，不长草茬
  Object.freeze({ match: /^Cleared/, soil: 1 }),
]);

export const SCENE_GROUND_SURFACE = Object.freeze({
  /** 栅格格距（米）与格数上限（超了格距翻倍）。地形格点 0.5 m，1 m 的栅格双线性取样边缘约一米宽。 */
  cellM: 1, maxCells: 1600000,
  /**
   * 路（ways.roads 的折线，村里的街巷、田间小路）：中线两边 halfW 米踩实成车道（权重 track），往外 feather 米过渡掉。
   * 06–10 的村子街巷只有这条折线、没涂路面色，不加这一层街上会长满草茬。
   */
  road: Object.freeze({ halfW: 1.6, feather: 1.4, track: 0.85 }),
  /** 壕沟、交通沟（ways.trenches 的折线）：中线两边 halfW 米是翻土，往外 feather 米过渡掉。 */
  trench: Object.freeze({ halfW: 1.4, feather: 1.6 }),
  /** 陡坡变裸土：坡度（高差 / 水平距离）从 from 起、到 to 满；坡度按 stepM 米的中心差分量。 */
  slope: Object.freeze({ from: 0.55, to: 1.1, stepM: 0.5 }),
});
