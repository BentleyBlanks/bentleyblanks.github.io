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
// **坐标是临时的**（按 f581ac7dd 的 01 布局：掩蔽部 (−40,−126) 门朝北，洞外是 x −70…−34 的平地），
// 01–02 的空间由 Space 包重排后由 Opening 包改这里。格式：
//   BACKDROP_FIRE_POINTS  { 名: { x, z, h, r } }      h = 离地高度，r = 弹着散布半径
//   BACKDROP_SQUADS
//     encounter    遭遇组 id（日军进 runtime.enemies，missionEncounter 取它）
//     spawnFact    这个事实记下才开始（null = 进步骤就开始）
//     steps        在这些步骤里活着；离开这些步骤（含回跳、调试跳关）整组撤场
//     handoff      { fact, mode:"combat"|"hold", tacticalRadiusM } 交接给连续进攻
//     members[]    { id, side:"ija"|"nra", weapon, x, z, delayS, speedMps, route:[{ x, z, holdS, fire:[点名…] }] }
//                  route 按顺序跑；每个停点蹲下打 holdS 秒（最后一个停点一直打）；fire 是这个停点的授权点
// ===========================================================================
const P = (x, z, h, r) => Object.freeze({ x, z, h, r });

export const BACKDROP_FIRE_POINTS = Object.freeze({
  // 西侧远处川军的位置（日军朝这儿打）。
  westHedge: P(-66, -124, 1.0, 2.2),
  westField: P(-68, -138, 1.0, 2.4),
  westBank: P(-64, -150, 1.0, 2.2),
  // 日军停下的地方（川军朝这儿还击）。
  ijaNear: P(-47, -137, 0.9, 2.0),
  ijaMid: P(-52, -142, 0.9, 2.2),
  ijaFar: P(-57, -150, 0.9, 2.4),
});

const Stop = (x, z, holdS, fire) => Object.freeze({ x, z, holdS, fire: Object.freeze(fire) });

export const BACKDROP_SQUADS = Object.freeze({
  encounter: "bunkerBackdrop",
  // 炮弹把洞口埋了（Blast）之后，前沿才被突破 —— 在那之前背景里没有日军。
  spawnFact: "bunkerCollapsed",
  steps: Object.freeze(["Trapped", "BunkerRescue", "RearTrench"]),
  // 临时：玩家拾回步枪（02 还权）时把日军这几个交成普通守区 AI。Opening 包接 bunkerPursuit 时改这里。
  handoff: Object.freeze({ fact: "rifleRecovered", mode: "combat", tacticalRadiusM: 8 }),
  members: Object.freeze([
    Object.freeze({ id: "BackdropIjaA", side: "ija", weapon: "Type38", x: -36, z: -155, delayS: 0, speedMps: 3.2,
      route: Object.freeze([Stop(-44, -146, 6, ["westField", "westBank"]), Stop(-52, -140, 0, ["westHedge", "westField"])]) }),
    Object.freeze({ id: "BackdropIjaB", side: "ija", weapon: "Type38", x: -40, z: -155.5, delayS: 3, speedMps: 3.0,
      route: Object.freeze([Stop(-38, -150, 5, ["westBank", "westField"]), Stop(-47, -136, 0, ["westHedge", "westField"])]) }),
    Object.freeze({ id: "BackdropIjaC", side: "ija", weapon: "Type11", x: -48, z: -155, delayS: 6, speedMps: 2.8,
      route: Object.freeze([Stop(-56, -150, 0, ["westBank", "westField", "westHedge"])]) }),
    Object.freeze({ id: "BackdropIjaD", side: "ija", weapon: "Type38", x: -33.5, z: -154.5, delayS: 10, speedMps: 3.2,
      route: Object.freeze([Stop(-37, -150, 7, ["westBank"]), Stop(-44, -142, 0, ["westField", "westHedge"])]) }),
    Object.freeze({ id: "BackdropNraA", side: "nra", weapon: "HanYang", x: -66, z: -124, delayS: 2, speedMps: 0,
      route: Object.freeze([Stop(-66, -124, 0, ["ijaNear", "ijaMid"])]) }),
    Object.freeze({ id: "BackdropNraB", side: "nra", weapon: "HanYang", x: -68, z: -138, delayS: 4, speedMps: 0,
      route: Object.freeze([Stop(-68, -138, 0, ["ijaMid", "ijaNear", "ijaFar"])]) }),
    Object.freeze({ id: "BackdropNraC", side: "nra", weapon: "Zb26", x: -64, z: -150, delayS: 5, speedMps: 0,
      route: Object.freeze([Stop(-64, -150, 0, ["ijaFar", "ijaMid"])]) }),
  ]),
});
