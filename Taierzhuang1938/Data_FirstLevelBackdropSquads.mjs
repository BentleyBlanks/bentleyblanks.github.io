// ===========================================================================
// Data_FirstLevelBackdropSquads.mjs —— 01 背景兵（纯数据，零 three）
//
// 契约：docs/Data_FirstLevel0105Refactor20260923Contract.md §5.8 的遭遇组 `bunkerBackdrop`；
// 机制与读法：docs/Data_EnemyAi.md §20。运行时：Script_FirstLevelBackdropSquads.mjs。
//
// 需求（docs/Data_FirstLevelOpeningSource20260923.md 01）：玩家压在洞里、只能从洞口往外看的那段，
// 「背景必须一直在推进、一直在交火」—— 日军从洞口外经过、在前方停下朝外开枪，远处有川军还击。
// 改前 01 只有四名行刑兵（bunkerAssault），背景里一个会动、会开枪的人都没有。
//
// 这些人是**剧本兵**（scriptedNoncombatant）：跑授权路线、在授权点停下，开枪只走环境射击
//（朝授权点打，命中恒 false、不进 TTK 账，永远不打玩家）。川军还击者 missionUntargetable，
// 日军不会把枪口转过去。第二波 Opening 包可以把日军这几个人接成 02 的 `bunkerPursuit` 连续进攻：
// handoff 给了 fact 就在那个事实记下时交接（mode "combat" = 放成普通守区 AI；"hold" = 原地继续打）。
//
// **坐标是临时的**（按 f581ac7dd 的 01 布局：掩蔽部 (−40,−126) 门朝北，洞外是 x −70…−34 的平地；
// z = −147 横着一道西侧铁丝网（东头贴着左前枪位的侧墙 LeftGunSide，x −34 一线） WestWire0–6（Data_FirstLevelMissionFortifications），只在 x −51.8…−48.4
// 与 x > −38.4 留口 —— 跑位要么停在网北侧，要么从东头的口子过），
// 01–02 的空间由 Space 包重排后由 Opening 包改这里。格式：
//   BACKDROP_FIRE_POINTS  { 名: { x, z, h, r } }      h = 离地高度，r = 弹着散布半径
//   BACKDROP_SQUADS
//     encounter    遭遇组 id（日军进 runtime.enemies，missionEncounter 取它）
//     spawnFact    这个事实记下才开始（null = 进步骤就开始）
//     steps        在这些步骤里活着；离开这些步骤（含回跳、调试跳关）整组撤场：立刻退出任务敌人表、
//                  交接过的日军变回剧本兵（不再对人开枪），**人等到出了玩家视野再移除**
//     leave        { removeBeyondM, viewMarginDeg, maxS } 撤场时：离玩家超过 removeBeyondM、或不在相机视锥
//                  （半角 + viewMarginDeg）里就移除；maxS 秒后不论在不在视野里都移除（兜底，防漏）
//     handoff      { fact, mode:"combat"|"hold", tacticalRadiusM } 交接给连续进攻
//     members[]    { id, side:"ija"|"nra", weapon, x, z, delayS, speedMps, route:[{ x, z, holdS, fire:[点名…] }] }
//                  route 按顺序跑；每个停点蹲下打 holdS 秒（最后一个停点一直打）；fire 是这个停点的授权点
// ===========================================================================
const P = (x, z, h, r) => Object.freeze({ x, z, h, r });

export const BACKDROP_FIRE_POINTS = Object.freeze({
  // 西侧远处川军的位置（日军朝这儿打）。x −78…−72 那一带从网北侧的日军停点看过去是通的（浏览器实测通视：
  // 更近的 x −66…−55 被 WestRoadTimber 路障、铁丝网与掩蔽部外墙挡掉大半）。
  westNorth: P(-74, -156, 1.0, 2.2),
  westMid: P(-76, -150, 1.0, 2.4),
  westSouth: P(-77, -146, 1.0, 2.2),
  // 日军停下的地方（川军朝这儿还击）。
  ijaEast: P(-38.5, -151, 0.9, 1.8),
  ijaMid: P(-45.5, -150, 0.9, 2.2),
  ijaWest: P(-56, -151, 0.9, 2.4),
});

const Stop = (x, z, holdS, fire) => Object.freeze({ x, z, holdS, fire: Object.freeze(fire) });

export const BACKDROP_SQUADS = Object.freeze({
  encounter: "bunkerBackdrop",
  // 炮弹把洞口埋了（Blast）之后，前沿才被突破 —— 在那之前背景里没有日军。
  spawnFact: "bunkerCollapsed",
  steps: Object.freeze(["Trapped", "BunkerRescue", "RearTrench"]),
  // 临时：玩家拾回步枪（02 还权）时把日军这几个交成普通守区 AI。Opening 包接 bunkerPursuit 时改这里。
  handoff: Object.freeze({ fact: "rifleRecovered", mode: "combat", tacticalRadiusM: 8 }),
  // 2026-09-24 审查：交接后的日军在 02 结束时还活着、离 03 起点不远，进 03 那一帧凭空消失。
  leave: Object.freeze({ removeBeyondM: 70, viewMarginDeg: 12, maxS: 90 }),
  members: Object.freeze([
    Object.freeze({ id: "BackdropIjaA", side: "ija", weapon: "Type38", x: -36, z: -155, delayS: 0, speedMps: 3.2,
      route: Object.freeze([Stop(-44, -150.5, 6, ["westMid", "westNorth"]), Stop(-47, -149.5, 0, ["westMid", "westSouth"])]) }),
    Object.freeze({ id: "BackdropIjaB", side: "ija", weapon: "Type38", x: -40, z: -155.5, delayS: 3, speedMps: 3.0,
      route: Object.freeze([Stop(-38.2, -150.6, 5, ["westNorth", "westMid"]), Stop(-41.5, -152, 0, ["westMid", "westSouth"])]) }),
    Object.freeze({ id: "BackdropIjaC", side: "ija", weapon: "Type11", x: -48, z: -155, delayS: 6, speedMps: 2.8,
      route: Object.freeze([Stop(-56, -151, 0, ["westNorth", "westMid", "westSouth"])]) }),
    Object.freeze({ id: "BackdropIjaD", side: "ija", weapon: "Type38", x: -36, z: -155, delayS: 10, speedMps: 3.2,
      route: Object.freeze([Stop(-36.2, -151.4, 7, ["westNorth"]), Stop(-36.3, -149.3, 0, ["westMid", "westSouth"])]) }),
    Object.freeze({ id: "BackdropNraA", side: "nra", weapon: "HanYang", x: -77, z: -146, delayS: 2, speedMps: 0,
      route: Object.freeze([Stop(-77, -146, 0, ["ijaMid", "ijaEast"])]) }),
    Object.freeze({ id: "BackdropNraB", side: "nra", weapon: "HanYang", x: -76, z: -150, delayS: 4, speedMps: 0,
      route: Object.freeze([Stop(-76, -150, 0, ["ijaMid", "ijaWest", "ijaEast"])]) }),
    Object.freeze({ id: "BackdropNraC", side: "nra", weapon: "Zb26", x: -74, z: -156, delayS: 5, speedMps: 0,
      route: Object.freeze([Stop(-74, -156, 0, ["ijaWest", "ijaMid"])]) }),
  ]),
});
