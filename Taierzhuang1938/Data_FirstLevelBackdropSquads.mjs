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
// 2026-09-24 Front 包：名册与路线改由 Space 包的 MISSION_ENCOUNTERS.bunkerBackdrop 单一来源派生（下方 members），
// 授权点取 Space 的 FRONT_FIRE_POINTS.Trapped（后交通壕折角 RC 胸墙、支沟唇、岔口 J、折角 F）。01–02 新布局里
// 这些人都在沟里：日军沿连接支沟下来、过 J 转进纵深支沟，看不见我方后沟 —— 开枪靠 Ai 的抬高重试（高弹越沟沿，
// 背景里听得见一直在打）；川军在 RC 与支沟朝 J/F 还击。rifleRecovered 照旧交成守区 AI（那时人已在
// 纵深支沟尽头、视线外），02 结束随 leave 收走（Space 的 retire 口径）。Opening 包要改 01 编排时改这里。
// 以下是旧说明（09-22 布局）：
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
import { MISSION_ENCOUNTERS } from "./Data_FirstLevelMission.mjs";
import { FRONT_SPACE as SP } from "./Data_FirstLevelFrontRoute.mjs";

const P = (x, z, h, r) => Object.freeze({ x, z, h, r });

/** Space FRONT_FIRE_POINTS.Trapped：前两个日军打（我方后沟），后两个川军打（敌方来路）。h 从沟底 / 地面算。 */
export const BACKDROP_FIRE_POINTS = Object.freeze({
  rcParapet: P(-4, -111.8, 0.4, 1.6),
  supportLip: P(-26.5, -124.2, 0.4, 1.8),
  rcTurn: P(-1, -118.5, 0.6, 1.4),
  junction: P(SP.bunkerJunction.x, -126.6, 0.6, 1.6),
  fold: P(18.4, -127.3, 0.6, 1.6),
});

const Stop = (x, z, holdS, fire) => Object.freeze({ x, z, holdS, fire: Object.freeze(fire) });
const Same = (a, b) => Math.hypot(a.x - b.x, a.z - b.z) < 0.05;
/**
 * 日军路线上的开火停点：一进连接支沟先停 2.5 s 打一阵（我方后沟方向，高弹越沟沿）、折角 F 停 4 s、岔口 J 停 3 s，
 * 纵深支沟尽头一直打（视线外，只闻其声）。
 */
function IjaRoute(route) {
  return Object.freeze(route.map((p, i) => {
    if (i === route.length - 1) return Stop(p.x, p.z, 0, ["rcParapet", "supportLip"]);
    if (i === 0) return Stop(p.x, p.z, 2.5, ["rcParapet", "supportLip"]);
    if (Same(p, SP.bunkerFold)) return Stop(p.x, p.z, 4, ["rcTurn", "rcParapet"]);
    if (Same(p, SP.bunkerJunction)) return Stop(p.x, p.z, 3, ["rcTurn"]);
    return Stop(p.x, p.z, 0, []);
  }));
}
const NRA_FIRE = (at) => Same(at, SP.bunkerJunction) ? ["junction", "fold"] : ["fold", "junction"];
const ROSTER = MISSION_ENCOUNTERS.bunkerBackdrop;

export const BACKDROP_SQUADS = Object.freeze({
  encounter: "bunkerBackdrop",
  // 炮弹把洞口埋了（Blast）之后，前沿才被突破 —— 在那之前背景里没有日军。
  spawnFact: "bunkerCollapsed",
  steps: Object.freeze(["Trapped", "BunkerRescue", "RearTrench"]),
  // 玩家拾回步枪（02 还权）时把日军这几个交成普通守区 AI。新布局里那时他们已在纵深支沟尽头、玩家视线外，
  // 02 结束随 leave 收走（Space 的 retire 口径）。
  handoff: Object.freeze({ fact: "rifleRecovered", mode: "combat", tacticalRadiusM: 8 }),
  // 2026-09-24 审查：交接后的日军在 02 结束时还活着、离 03 起点不远，进 03 那一帧凭空消失。
  leave: Object.freeze({ removeBeyondM: 70, viewMarginDeg: 12, maxS: 90 }),
  members: Object.freeze(ROSTER.map((spec) => spec.side === "nra"
    ? Object.freeze({ id: spec.id, side: "nra", weapon: spec.weapon, x: spec.x, z: spec.z, delayS: 2 + ROSTER.indexOf(spec) % 3 * 1.5,
      speedMps: 0, route: Object.freeze([Stop(spec.x, spec.z, 0, NRA_FIRE(spec.fireAt))]) })
    : Object.freeze({ id: spec.id, side: "ija", weapon: spec.weapon, x: spec.x, z: spec.z, delayS: spec.delayS ?? 0,
      speedMps: spec.weapon === "Type11" ? 2.8 : 3.1, route: IjaRoute(spec.route) }))),
});
