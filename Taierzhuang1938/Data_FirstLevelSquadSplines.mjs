// 第一关（《往南的路》，含 L1_Original 双村版与 L1_BeishaheMerged 北沙河单村合并版）
// 小队行进 PCG 样条 Profile 分配表：纯 JSON 可序列化数据，零 three、零函数。
//
// 设计原则：
//   1. 每个编排小队按自身 ID 独立解算，绝不合并交叉路线上的两支不同小队；
//   2. 窄战壕 / 村落门洞 / 潜行巷道严格限制 maxOffsetM 与 concealmentHeadM，确保 0 穿墙、0 提前露头；
//   3. 开阔坡地 / 田野包抄 / 翼侧跃进放宽横向展开，自然形成散兵楔形、机枪搭档与拉链微簇；
//   4. 任何新增或自定义遭遇组可经 behaviorFallback 按阵营与行为自动匹配最合适的 Profile。

export const FIRST_LEVEL_SQUAD_SPLINES_SCHEMA = "tengxian-l1-squad-splines/1";

export const FIRST_LEVEL_SQUAD_SPLINE_CONFIG = Object.freeze({
  // 一、节拍级核心编排小队（Script_LevelFlowModel / Script_LevelFlowMerged）
  scriptedSquads: Object.freeze({
    // 01c–02e 川军撤退排 12 人（交通沟内拉链交错 + 拐角/沟沿警戒张望，平滑展开保步速自然与 >1.9m 停步间距）
    OpeningRetreat: Object.freeze({
      profile: "trench_march_cautious",
      maxOffsetM: 0.48,
      featherStartM: 10.5,
      featherEndM: 4.5,
      paceJitterM: 0.08,
      splineBlend: 0.35,
      clusterSizes: Object.freeze([3, 2, 2, 2, 3]),
    }),
    // 01c–02d 幺娃与机枪/传令小组 4 人（快速拉链奔跑转进）
    OpeningGunTeam: Object.freeze({
      profile: "urgent_retreat",
      maxOffsetM: 0.42,
      featherStartM: 6.0,
      featherEndM: 5.5,
      paceJitterM: 0.16,
      splineBlend: 0.45,
    }),
    // 01c–02e 北沿机枪组 2 人（野外静默包抄，机枪主副手双人组）
    OpeningEnemyNorthMg: Object.freeze({
      profile: "tactical_flank_open",
      maxOffsetM: 1.10,
      featherStartM: 7.5,
      featherEndM: 8.5,
      concealmentHeadM: 6.5,
      paceJitterM: 0.18,
      splineBlend: 0.55,
    }),
    // 01c–02e 中路日军 4 人（野外斜坡散兵楔形包抄）
    OpeningEnemyMidFlank: Object.freeze({
      profile: "tactical_flank_open",
      maxOffsetM: 1.30,
      featherStartM: 9.5,
      featherEndM: 14.0,
      concealmentHeadM: 7.5,
      paceJitterM: 0.08,
      splineBlend: 0.25,
    }),
    // 01c–02e 东路日军 3 人（开阔地东翼包抄）
    OpeningEnemyEastFlank: Object.freeze({
      profile: "tactical_flank_open",
      maxOffsetM: 0.92,
      featherStartM: 9.0,
      featherEndM: 13.0,
      concealmentHeadM: 7.0,
      paceJitterM: 0.06,
      splineBlend: 0.15,
    }),
    // 02g–02h 退逃日军 3 人（脱离白刃急撤集结，控制横向斜率以保高速奔跑连续性）
    OpeningSurvivors: Object.freeze({
      profile: "urgent_retreat",
      maxOffsetM: 0.24,
      featherStartM: 3.2,
      featherEndM: 3.2,
      paceJitterM: 0.10,
      splineBlend: 0.30,
    }),
    // 03 阶段轻伤员沿沟先撤 / 弹坑伤员撤回
    WalkingWounded: Object.freeze({
      profile: "civilian_convoy",
      maxOffsetM: 0.42,
      featherStartM: 1.5,
      featherEndM: 2.0,
      paceJitterM: 0.40,
      splineBlend: 0.60,
    }),
    PitSurvivors: Object.freeze({
      profile: "civilian_convoy",
      maxOffsetM: 0.44,
      featherStartM: 1.5,
      featherEndM: 2.0,
      paceJitterM: 0.36,
      splineBlend: 0.60,
    }),
    // 08–13 合并版罗班长/何有田/幺娃街道转移编组（街道安全 0 穿墙）
    VillageEscortCore: Object.freeze({
      profile: "guided_run_combat",
      maxOffsetM: 0.32,
      featherStartM: 1.5,
      featherEndM: 2.0,
      paceJitterM: 0.35,
      splineBlend: 0.25,
    }),
  }),

  // 二、遭遇战群组逐项显式分配（覆盖 L1_Original 全部 41 组与 L1_BeishaheMerged 全部 30 组中的机动小队）
  encounterGroups: Object.freeze({
    // ---- 02g–04a 前沿交通沟与北坡追击 ----
    ForkRelief: Object.freeze({ profile: "trench_march_cautious", maxOffsetM: 0.72, featherStartM: 2.5, featherEndM: 2.5, paceJitterM: 0.42, splineBlend: 0.72 }),
    Fork: Object.freeze({ profile: "trench_march_cautious", maxOffsetM: 0.0, featherStartM: 2.2, featherEndM: 2.0, concealmentHeadM: 3.5, paceJitterM: 0.0, splineBlend: 0.0 }),
    Corner: Object.freeze({ profile: "trench_march_cautious", maxOffsetM: 0.0, featherStartM: 2.2, featherEndM: 2.0, concealmentHeadM: 3.0, paceJitterM: 0.0, splineBlend: 0.0 }),
    Rim: Object.freeze({ profile: "trench_march_cautious", maxOffsetM: 0.62, featherStartM: 2.5, featherEndM: 2.4, paceJitterM: 0.40, splineBlend: 0.65 }),
    RearPursuit: Object.freeze({ profile: "trench_march_cautious", maxOffsetM: 0.28, featherStartM: 2.5, featherEndM: 2.4, paceJitterM: 0.24, splineBlend: 0.22 }),
    TrafficFlank: Object.freeze({ profile: "tactical_flank_open", maxOffsetM: 0.32, featherStartM: 3.0, featherEndM: 2.6, concealmentHeadM: 4.0, paceJitterM: 0.26, splineBlend: 0.25 }),

    // ---- 03f–04a 友军增援前出（门禁严格校验 <= group.speed*0.25+0.001 与掩体净空，时间轴保原路线 + 接入程序化左顾右盼与 3D 实时视野）----
    DragGround: Object.freeze({ profile: "guided_run_combat", maxOffsetM: 0.0, featherStartM: 2.0, featherEndM: 2.5, paceJitterM: 0.0, splineBlend: 0.0 }),
    FieldGround: Object.freeze({ profile: "guided_run_combat", maxOffsetM: 0.0, featherStartM: 2.0, featherEndM: 2.5, paceJitterM: 0.0, splineBlend: 0.0 }),
    CrestWest: Object.freeze({ profile: "guided_run_combat", maxOffsetM: 0.0, featherStartM: 2.0, featherEndM: 2.2, paceJitterM: 0.0, splineBlend: 0.0 }),

    // ---- 03h–06g 凹路两翼掩体跃进与步坦协同（已带手编单兵绕掩体 memberPlans 与 >1.5m 防撞净空，保留精确路线并接入程序化行进左顾右盼）----
    GroundWest: Object.freeze({ profile: "tactical_assault_bounds", maxOffsetM: 0.0, featherStartM: 3.2, featherEndM: 3.0, concealmentHeadM: 4.0, paceJitterM: 0.0, splineBlend: 0.0 }),
    GroundEast: Object.freeze({ profile: "tactical_assault_bounds", maxOffsetM: 0.0, featherStartM: 3.2, featherEndM: 3.0, concealmentHeadM: 4.0, paceJitterM: 0.0, splineBlend: 0.0 }),
    TankEscort: Object.freeze({ profile: "road_march_relaxed", maxOffsetM: 0.0, featherStartM: 3.0, featherEndM: 2.8, paceJitterM: 0.0, splineBlend: 0.0 }),
    TankRearScreen: Object.freeze({ profile: "road_march_relaxed", maxOffsetM: 0.0, featherStartM: 3.0, featherEndM: 2.8, paceJitterM: 0.0, splineBlend: 0.0 }),
    TankReinforce: Object.freeze({ profile: "tactical_assault_bounds", maxOffsetM: 0.0, featherStartM: 2.8, featherEndM: 2.6, paceJitterM: 0.0, splineBlend: 0.0 }),

    // ---- 08c–09d 北沙河单村合并版：沟北麦田、东翼包抄与村内潜行搜屋 ----
    MergedRifles: Object.freeze({ profile: "tactical_assault_bounds", maxOffsetM: 1.35, featherStartM: 3.5, featherEndM: 3.0, concealmentHeadM: 5.0, paceJitterM: 0.48, splineBlend: 0.75 }),
    MergedBoards: Object.freeze({ profile: "tactical_assault_bounds", maxOffsetM: 0.68, featherStartM: 4.5, featherEndM: 2.8, concealmentHeadM: 6.5, paceJitterM: 0.36, splineBlend: 0.52 }),
    MergedMainStFlank: Object.freeze({ profile: "tactical_flank_open", maxOffsetM: 0.55, featherStartM: 3.5, featherEndM: 2.8, concealmentHeadM: 5.0, paceJitterM: 0.42, splineBlend: 0.35 }),
    MergedHouseGun: Object.freeze({ profile: "tactical_flank_open", maxOffsetM: 0.24, featherStartM: 3.0, featherEndM: 2.5, concealmentHeadM: 4.0, paceJitterM: 0.25, splineBlend: 0.0 }),
    MergedKitchenGuard: Object.freeze({ profile: "tactical_flank_open", maxOffsetM: 0.20, featherStartM: 3.0, featherEndM: 2.5, concealmentHeadM: 4.0, paceJitterM: 0.22, splineBlend: 0.0 }),
    MergedWestSearch: Object.freeze({ profile: "stealth_infiltrate", maxOffsetM: 0.16, featherStartM: 2.5, featherEndM: 2.2, concealmentHeadM: 4.0, paceJitterM: 0.18, splineBlend: 0.0 }),
    MergedYardAtrocity: Object.freeze({ profile: "stealth_infiltrate", maxOffsetM: 0.16, featherStartM: 2.5, featherEndM: 2.2, concealmentHeadM: 4.0, paceJitterM: 0.16, splineBlend: 0.0 }),
    MergedYardStraggler: Object.freeze({ profile: "stealth_infiltrate", maxOffsetM: 0.12, featherStartM: 2.5, featherEndM: 2.2, concealmentHeadM: 4.0, paceJitterM: 0.12, splineBlend: 0.0 }),

    // ---- 12a–13d 北沙河单村合并版：铁路截击与抢桥追兵 ----
    MergedRailAmbush: Object.freeze({ profile: "tactical_assault_bounds", maxOffsetM: 0.90, featherStartM: 2.2, featherEndM: 2.0, paceJitterM: 0.35, splineBlend: 0.65 }),
    MergedBridgeGun: Object.freeze({ profile: "trench_march_cautious", maxOffsetM: 0.42, featherStartM: 2.0, featherEndM: 1.8, paceJitterM: 0.25, splineBlend: 0.45 }),
    MergedBridgeRush: Object.freeze({ profile: "urgent_retreat", maxOffsetM: 0.92, featherStartM: 2.8, featherEndM: 2.5, concealmentHeadM: 4.0, paceJitterM: 0.48, splineBlend: 0.68 }),

    // ---- 09a–10e 双村版耿家庄巷战与潜行 ----
    TempleSearch: Object.freeze({ profile: "stealth_infiltrate", maxOffsetM: 0.16, featherStartM: 2.0, featherEndM: 2.0, paceJitterM: 0.16, splineBlend: 0.0 }),
    YardTransfer: Object.freeze({ profile: "urgent_retreat", maxOffsetM: 0.36, featherStartM: 2.0, featherEndM: 2.2, paceJitterM: 0.28, splineBlend: 0.25 }),
    EastStreet: Object.freeze({ profile: "tactical_assault_bounds", maxOffsetM: 0.42, featherStartM: 2.2, featherEndM: 2.2, paceJitterM: 0.32, splineBlend: 0.30 }),
    NorthYard: Object.freeze({ profile: "tactical_flank_open", maxOffsetM: 0.45, featherStartM: 2.5, featherEndM: 2.2, paceJitterM: 0.34, splineBlend: 0.35 }),
    TempleGun: Object.freeze({ profile: "tactical_assault_bounds", maxOffsetM: 0.48, featherStartM: 2.2, featherEndM: 2.0, paceJitterM: 0.30, splineBlend: 0.40 }),

    // ---- 13a–18f 双村版北沙河与炸桥 ----
    BeishaheRifles: Object.freeze({ profile: "tactical_assault_bounds", maxOffsetM: 1.45, featherStartM: 3.0, featherEndM: 2.8, paceJitterM: 0.55, splineBlend: 0.78 }),
    BeishaheBoards: Object.freeze({ profile: "tactical_assault_bounds", maxOffsetM: 0.95, featherStartM: 3.0, featherEndM: 2.6, paceJitterM: 0.42, splineBlend: 0.65 }),
    BeishaheGunWest: Object.freeze({ profile: "tactical_flank_open", maxOffsetM: 0.78, featherStartM: 2.5, featherEndM: 2.4, paceJitterM: 0.36, splineBlend: 0.62 }),
    BeishaheGunEast: Object.freeze({ profile: "tactical_flank_open", maxOffsetM: 0.78, featherStartM: 2.5, featherEndM: 2.4, paceJitterM: 0.36, splineBlend: 0.62 }),
    RailFirst: Object.freeze({ profile: "tactical_assault_bounds", maxOffsetM: 0.85, featherStartM: 2.2, featherEndM: 2.0, paceJitterM: 0.35, splineBlend: 0.62 }),
    RailSecond: Object.freeze({ profile: "tactical_assault_bounds", maxOffsetM: 1.05, featherStartM: 2.2, featherEndM: 2.0, paceJitterM: 0.40, splineBlend: 0.68 }),
    RailBridgeGun: Object.freeze({ profile: "trench_march_cautious", maxOffsetM: 0.45, featherStartM: 2.0, featherEndM: 1.8, paceJitterM: 0.26, splineBlend: 0.45 }),
    RailBridgeRush: Object.freeze({ profile: "urgent_retreat", maxOffsetM: 0.95, featherStartM: 2.8, featherEndM: 2.5, paceJitterM: 0.48, splineBlend: 0.68 }),
  }),

  // 三、新增/自定义遭遇组的行为默认映射（按 side + behavior 自动匹配 Profile）
  behaviorFallback: Object.freeze({
    flank: Object.freeze({ profile: "tactical_flank_open", maxOffsetM: 0.85, featherStartM: 3.0, featherEndM: 2.5, concealmentHeadM: 4.0, paceJitterM: 0.40, splineBlend: 0.65 }),
    bounds: Object.freeze({ profile: "tactical_assault_bounds", maxOffsetM: 0.95, featherStartM: 2.8, featherEndM: 2.5, concealmentHeadM: 3.5, paceJitterM: 0.42, splineBlend: 0.68 }),
    escort: Object.freeze({ profile: "road_march_relaxed", maxOffsetM: 0.85, featherStartM: 2.8, featherEndM: 2.5, paceJitterM: 0.38, splineBlend: 0.62 }),
    withdraw: Object.freeze({ profile: "urgent_retreat", maxOffsetM: 0.48, featherStartM: 2.0, featherEndM: 2.2, paceJitterM: 0.32, splineBlend: 0.45 }),
    advance_friend: Object.freeze({ profile: "guided_run_combat", maxOffsetM: 0.72, featherStartM: 2.0, featherEndM: 2.2, paceJitterM: 0.42, splineBlend: 0.68 }),
    advance_enemy: Object.freeze({ profile: "trench_march_cautious", maxOffsetM: 0.60, featherStartM: 2.5, featherEndM: 2.2, concealmentHeadM: 3.5, paceJitterM: 0.36, splineBlend: 0.58 }),
  }),

  // 定点守卫/压制单位仅启用轻度警戒左顾右盼，绝不改变作者精确站位
  stationaryGazeProfile: "trench_march_cautious",
});
