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
// 2026-09-24（Opening 包）：坐标按 01–06 空间重排（docs/Data_FirstLevelSpace0106_20260923.md §2.1/§5）：
// 人与路线直接取 Space 包的名册 MISSION_ENCOUNTERS.bunkerBackdrop（唯一来源）——日军沿连接支沟下到岔口 J、
// 转入纵深支沟南下出视野，走到尽头即收走（retire）；三名川军在后交通壕折角与支沟口朝 J / 折角 F 还击。
// 格式：
//   BACKDROP_FIRE_POINTS  { 名: { x, z, h, r } }      h = 离地高度，r = 弹着散布半径
//   BACKDROP_SQUADS
//     encounter    遭遇组 id（日军进 runtime.enemies，missionEncounter 取它）
//     spawnFact    这个事实记下才开始（null = 进步骤就开始）
//     steps        在这些步骤里活着；离开这些步骤（含回跳、调试跳关）整组撤场：立刻退出任务敌人表、
//                  交接过的日军变回剧本兵（不再对人开枪），**人等到出了玩家视野再移除**
//     leave        { removeBeyondM, viewMarginDeg, maxS } 撤场时：离玩家超过 removeBeyondM、或不在相机视锥
//                  （半角 + viewMarginDeg）里就移除；maxS 秒后不论在不在视野里都移除（兜底，防漏）
//     handoff      { fact, mode:"combat"|"hold", tacticalRadiusM } 交接给连续进攻
//     members[]    { id, side:"ija"|"nra", weapon, x, z, delayS, speedMps, retire?, route:[{ x, z, holdS, fire:[点名…] }] }
//                  route 按顺序跑；每个停点蹲下打 holdS 秒（最后一个停点一直打）；fire 是这个停点的授权点；
//                  retire：走到最后一个停点、又不在玩家视野里（或到点 retireMaxS 秒）就移除（Space 包的 retire.atRouteEnd）
// ===========================================================================
import { MISSION_ENCOUNTERS } from "./Data_FirstLevelMission.mjs";

const P = (x, z, h, r) => Object.freeze({ x, z, h, r });

export const BACKDROP_FIRE_POINTS = Object.freeze({
  // 日军朝这儿打：后交通壕折角 RC 的胸墙与更西边后交通壕里的还击者（FRONT_FIRE_POINTS.Trapped 同一批点）。
  rcParapet: P(-4, -111.8, 0.6, 1.4),
  rearTrench: P(-9.4, -111.4, 0.6, 1.8),
  supportLip: P(-26.5, -124.2, 0.6, 2.2),
  // 川军朝这儿还击：岔口 J、折角 F 的射击台阶、连接支沟第二折。
  junction: P(14, -124.6, 1.2, 1.4),
  fold: P(18.2, -125.6, 1.2, 1.4),
  linkSap: P(23.5, -130, 1.0, 1.8),
});

const Stop = (x, z, holdS, fire) => Object.freeze({ x, z, holdS, fire: Object.freeze(fire) });
const Roster = MISSION_ENCOUNTERS.bunkerBackdrop;
// Where the Japanese pause on the way down: the link sap's second fold (fire at RC over the field)
// and the junction J; everything else on the Space route is a walking point.
const PAUSES = Object.freeze({ "23.5,-130": [3.2, ["rcParapet", "rearTrench"]], "14,-124.6": [1.6, ["rcParapet"]] });
// A walking point is a stop with holdS 0: the man passes it without kneeling (his fire list is only
// live for that frame). The last stop is the depth sap's end, where he is retired out of sight.
const IjaRoute = (spec) => Object.freeze(spec.route.map((p) => {
  const pause = PAUSES[`${p.x},${p.z}`];
  return pause ? Stop(p.x, p.z, pause[0], pause[1]) : Stop(p.x, p.z, 0, ["rcParapet"]);
}));
// Runtime ids keep the Ai package's lettering (BackdropIjaA… / BackdropNraA…); rosterId is the Space id.
const Letter = (id) => String.fromCharCode(65 + Number(id.match(/(\d+)$/)?.[1] || 0));
const NRA_FIRE = Object.freeze({ BunkerBackdropNra0: ["junction", "fold"], BunkerBackdropNra1: ["fold", "linkSap"], BunkerBackdropNra2: ["fold", "junction"] });

export const BACKDROP_SQUADS = Object.freeze({
  encounter: "bunkerBackdrop",
  // 炮弹把洞口埋了（Blast）之后，前沿才被突破 —— 在那之前背景里没有日军。
  spawnFact: "bunkerCollapsed",
  steps: Object.freeze(["Trapped", "BunkerRescue", "RearTrench"]),
  // 仍保留交接口：走到纵深支沟尽头的日军早已收走（retire），02 的连续进攻是 Opening 包生成的
  // bunkerPursuit；这里只兜住万一还没走完的人（拾枪那一刻变成普通守区 AI）。
  handoff: Object.freeze({ fact: "rifleRecovered", mode: "combat", tacticalRadiusM: 8 }),
  // 2026-09-24 审查：交接后的日军在 02 结束时还活着、离 03 起点不远，进 03 那一帧凭空消失。
  leave: Object.freeze({ removeBeyondM: 70, viewMarginDeg: 12, maxS: 90 }),
  // 走完路线的日军：离开视野再收，最迟这么多秒后收。
  retireMaxS: 25,
  members: Object.freeze(Roster.map((spec) => spec.side === "nra"
    ? Object.freeze({ id: `BackdropNra${Letter(spec.id)}`, rosterId: spec.id, side: "nra", weapon: spec.weapon, x: spec.x, z: spec.z,
      delayS: 2, speedMps: 0, route: Object.freeze([Stop(spec.x, spec.z, 0, NRA_FIRE[spec.id] || ["junction"])]) })
    : Object.freeze({ id: `BackdropIja${Letter(spec.id)}`, rosterId: spec.id, side: "ija", weapon: spec.weapon, x: spec.x, z: spec.z,
      delayS: spec.delayS || 0, speedMps: 3.0, retire: true, route: IjaRoute(spec) }))),
});
