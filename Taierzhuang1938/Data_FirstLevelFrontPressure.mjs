// ===========================================================================
// Data_FirstLevelFrontPressure.mjs —— 第一关 02–05 前沿的「压力表」（纯数据，零 three）
//
// 契约：docs/Data_FirstLevel0105Refactor20260923Contract.md §2 第 3/8/9 条、§3 Ai 包那一行；
// 机制与读法：docs/Data_EnemyAi.md §20。运行时：Script_FirstLevelFrontPressure.mjs。
//
// 病根（09-23 查证）：前沿日军的跃进是一次性脚本 —— 每人 0–3 条跃进线，打两轮、退回三次，
// 大约开战 60–90 s 就全部跑完，之后在最后一线坐满剩下的八分钟；「退一线」「机枪组被打退」
// 的钩子是死代码；阵位守卫与前沿机枪是 hold 炮塔。这张表把「每个阶段每个组该干什么、
// 下一步是什么」写成数据，按任务事实切相位，每一相位都有下一步。
//
// **本表的坐标与名册是临时的**：空间与每组的数据由 Space 包并行重排、第二波 Front 包填最终值。
// 这一份按 2026-09-22 拓扑（f581ac7dd 时的布局）配，只为验证机制。格式是冻结的：
//
//   FRONT_FIRE_POINTS  授权射击点（环境射击只打这些点，**永远不是玩家的实时位置**）
//     { x, z, h, r, gapPath? }   h = 离地高度（地面走共享采样器）；r = 弹着散布半径（米）；
//                                gapPath = 这一点在撤退口路径上：守军过口的窗口里不许打。
//   FRONT_PRESSURE_GROUPS  组 → 成员
//     { ids:[missionId…] } 或 { encounter:"machineGun" }（整组）；officer 可选（该组军官的 missionId）。
//   FRONT_PRESSURE_PHASES  相位（按顺序，取「when 事实已记下、且当前步骤在 stages 里」的最后一个）
//     { id, when:事实|null, stages:[步骤…], yield?:bool, fire:[点名…], groups:{ 组id: 角色配置 } }
//   角色配置（role）：
//     hold       原地守（不改走位，只给环境射击点）；
//     assault    沿自己的跃进线推进（运行时 UpdateAssault 执行冲刺段）：
//                  maxLine    这一相位最多推进到第几条线（负数从末尾数：-1 = 最后一条）；拉回来也是它
//                  regroupLine 最后一线打完 assaultLateralShifts 轮退回哪一条再上（负数同上）
//                  loop       是否无限循环（true = 相位不切就一直「退回再上」，不会坐死）
//                  points     给了就换成这条显式路线（侧翼组去土坎端头）；viaLine 给了的话，
//                             先沿**自己的**跃进线跑到那条线（跃进线是净空检查过的走廊），
//                             再沿那条线横移到 points —— 线本身离掩体排 1.6–2.5 m，横移不穿掩体
//                  fallback   { casualtyFraction, backLines, holdS, repelledFact? }：本组伤亡过这个比例
//                             就全组退 backLines 条线、喊「一旦下がれ」，holdS 秒后照常再上；
//                             repelledFact 给了的话，退完（或全灭）记这个事实（旧 frontAttackRepelled 门）
//                  charge     { afterS, minAlive, playerWithinM, lastLineShare } 这一相位最多一次的
//                             脚本化成组冲锋：相位开始 afterS 秒后、活着 ≥ minAlive、组心离玩家
//                             ≤ playerWithinM、在最后一线守着的人占比 ≥ lastLineShare 时，全组上刺刀冲
//     nestGuard  阵位守卫：只保留固定机枪 hold；步枪手非 hold、局部战区 nestGuardTacticalRadiusM、
//                1 枚手榴弹、玩家 7 m 内自发冲锋（ChargeOpportunity.chargeContactM）；
//                fallback { casualties, to:{x,z} } 伤亡够数后退到后墙锚点（掩体点朝向由 Space 包出）
//   相位级：yield = 守军过口的窗口 —— 本相位里任何 assault 成员只要对撤退口有通视
//          （与 FrontBattle.InfantryBlockade 同一判据），就往回拉一条线，直到断了视线或退到第一条线；
//          bark = 相位切换时每组派一个人喊的那一类（军官优先）。
// ===========================================================================
import { FRONT_SORTIE as S } from "./Data_FirstLevelFrontRoute.mjs";
import { FRONT_MACHINE_GUN_ATTACK } from "./Data_FirstLevelMissionFront.mjs";

const P = (x, z, h, r, extra = {}) => Object.freeze({ x, z, h, r, ...extra });

/** 授权射击点（临时，按 09-22 布局）。前沿土坎顶 z≈−154、x −26…16；左前枪位 (−31,−151)；撤退口 S.gap。 */
export const FRONT_FIRE_POINTS = Object.freeze({
  bankWest: P(-20, -154.2, 0.35, 2.4),
  bankCenter: P(-6, -154.6, 0.35, 2.6),
  bankEast: P(9, -154.2, 0.35, 2.4),
  // 左前机枪的胸墙（老周在里面）：只打胸墙外沿，r 小 —— 这是「那挺枪在挨打」，不是打人。
  leftGunParapet: P(-31, -153.4, 0.7, 1.1),
  // 守军等待的那段壕沿（守军在接应前不可被当目标，打的是壕沿不是人）。
  guardParapet: P(-2, -150.4, 0.45, 3.2),
  // 撤退口两侧：守军过口的窗口里不许打（gapPath）。
  gapWest: P(S.gap.x - 3.2, S.gap.z - 1.6, 0.6, 1.0, { gapPath: true }),
  gapEast: P(S.gap.x + 3.2, S.gap.z - 1.6, 0.6, 1.0, { gapPath: true }),
  // 夺下之后的右侧阵位：正面胸墙与西侧残墙。
  nestFront: P(S.nest.x, S.nest.z - 2.6, 0.9, 1.4),
  nestWest: P(S.nest.x - 3.8, S.nest.z - 0.5, 0.9, 1.2),
  // 04 后撤到阵位后墙那一段、05 攻击支路：玩家要走的沟沿（近失弹压人，不打人）。
  rearLane: P(24, -134, 0.5, 2.0),
  // 右侧阵位那挺机枪（日军占着、枪口朝西北）夺下之前唯一看得见的一段：玩家来路西侧 4–5 m 的沟沿。
  //（09-24 探针：这挺枪在 02–03 对表里其余每一个点都没有通视，整段一发不打 —— 最显眼的「端枪不打」。）
  nestField: P(18, -135, 0.5, 1.6),
  attackLane: P(37.5, -133, 0.5, 2.0),
});

const BANK = Object.freeze(["bankWest", "bankCenter", "bankEast"]);

/** 组（临时名册，按 09-22 的 MISSION_ENCOUNTERS；Space 包重排后由 Front 包改这里）。 */
export const FRONT_PRESSURE_GROUPS = Object.freeze({
  fireBase: Object.freeze({ ids: Object.freeze(["FrontGunner", "FrontSupportGunner"]) }),
  // 临时：借现名册里的 FrontRifleC 代军官（行为：吼叫、带头冲、阵亡效应），
  // Space/Front 包的 frontOfficer 组到位后把 officer 改成那个 missionId。
  center: Object.freeze({ ids: Object.freeze(["FrontRifleA", "FrontRifleB", "FrontRifleC", "FrontRifleG", "FrontRifleH"]),
    officer: "FrontRifleC" }),
  flankWest: Object.freeze({ ids: Object.freeze(["FrontRifleE", "FrontRifleF"]) }),
  eastHold: Object.freeze({ ids: Object.freeze(["FrontRifleD"]) }),
  nest: Object.freeze({ encounter: "approach" }),
  // 军官取第一个步枪手（机枪手上不了刺刀，也带不了冲锋）。临时，frontOfficer 到位后换。
  mgAttack: Object.freeze({ ids: Object.freeze(FRONT_MACHINE_GUN_ATTACK.map((spec) => spec.id)),
    officer: FRONT_MACHINE_GUN_ATTACK.find((spec) => spec.weapon !== "Type11")?.id ?? null }),
});

/** 阵位守卫的临时后撤锚点：阵位北侧院内（远离玩家来路）。朝向南/西南的掩体点归 Space 包。 */
const NEST_FALLBACK = Object.freeze({ casualties: 2, to: Object.freeze({ x: 31, z: -146 }) });
const NEST = Object.freeze({ role: "nestGuard", fallback: NEST_FALLBACK });
// 西侧两人去土坎西端外：先沿自己的跃进线到 −166 那条线，再沿线横移到西侧农田那一列掩体后面
//（离左前枪位约 20 m：再近就会和老周贴脸，守军过口时也更难让出视线）。
const FLANK_WEST_POINTS = Object.freeze([Object.freeze({ x: -45, z: -166 })]);
const FLANK_WEST = (extra = {}) => Object.freeze({ role: "assault", viaLine: -166, points: FLANK_WEST_POINTS,
  loop: true, regroupLine: -2, ...extra });
const CENTER = (extra = {}) => Object.freeze({ role: "assault", maxLine: -1, regroupLine: 1, loop: true,
  fallback: Object.freeze({ casualtyFraction: 0.5, backLines: 1, holdS: 10 }), ...extra });

export const FRONT_PRESSURE_STAGES = Object.freeze(["BunkerRescue", "RearTrench", "Support", "MachineGun", "Tank"]);

export const FRONT_PRESSURE_PHASES = Object.freeze([
  // 02：前沿已在远处交火，推进要等 03 frontBattleStarted（MISSION_ENCOUNTER_ACTIVATION.standbyUntil）。
  Object.freeze({ id: "standby", when: null, stages: Object.freeze(["BunkerRescue", "RearTrench"]),
    fire: Object.freeze([...BANK, "leftGunParapet", "guardParapet", "nestField"]),
    groups: Object.freeze({ nest: NEST }) }),
  // 03 开战：中路跃进、火力基地压土坎与左前枪位、两人去土坎西端外。
  Object.freeze({ id: "assault", when: "frontBattleStarted", stages: Object.freeze(["Support", "MachineGun", "Tank"]),
    bark: "advance",
    fire: Object.freeze([...BANK, "leftGunParapet", "guardParapet", "nestField", "gapWest", "gapEast"]),
    groups: Object.freeze({ fireBase: Object.freeze({ role: "hold" }), center: CENTER(),
      flankWest: FLANK_WEST(), eastHold: Object.freeze({ role: "hold" }), nest: NEST }) }),
  // 右侧阵位丢了：玩家上了那挺机枪。土坎、撤退口之外开始打阵位胸墙。
  Object.freeze({ id: "nestLost", when: "rightNestCaptured", stages: Object.freeze(["Support", "MachineGun", "Tank"]),
    bark: "mg",
    fire: Object.freeze([...BANK, "leftGunParapet", "nestFront", "nestWest", "gapWest", "gapEast"]),
    groups: Object.freeze({ fireBase: Object.freeze({ role: "hold" }), center: CENTER(),
      flankWest: FLANK_WEST(),
      eastHold: Object.freeze({ role: "hold" }) }) }),
  // 第一批守军过口：中路退到第三条线（-166，土坎北侧断视线），侧翼退回第一点；看得见口子的人一条条往回拉。
  Object.freeze({ id: "firstWithdrawal", when: "frontRifleDefense", stages: Object.freeze(["Support", "MachineGun", "Tank"]),
    yield: true, bark: "fallback",
    fire: Object.freeze([...BANK, "leftGunParapet", "nestFront", "nestWest"]),
    groups: Object.freeze({ fireBase: Object.freeze({ role: "hold" }), center: CENTER({ maxLine: 2 }),
      flankWest: FLANK_WEST({ maxLine: -2 }),
      eastHold: Object.freeze({ role: "hold" }) }) }),
  // 第一批撤完：中路重新压上来。
  Object.freeze({ id: "firstDone", when: "rifleWithdrawalResolved", stages: Object.freeze(["Support", "MachineGun", "Tank"]),
    bark: "advance",
    fire: Object.freeze([...BANK, "leftGunParapet", "nestFront", "nestWest", "gapWest", "gapEast"]),
    groups: Object.freeze({ fireBase: Object.freeze({ role: "hold" }), center: CENTER(),
      flankWest: FLANK_WEST(),
      eastHold: Object.freeze({ role: "hold" }) }) }),
  // 04 战车露面：冲机枪位的十二人上来（MISSION_ENCOUNTER_ACTIVATION.machineGun.standbyUntil = tankPreviewed）。
  // 这一相位唯一一次脚本化成组冲锋；伤亡过半就退两条线，退完记 frontAttackRepelled。
  Object.freeze({ id: "tankShown", when: "tankPreviewed", stages: Object.freeze(["Support", "MachineGun", "Tank"]),
    bark: "advance",
    fire: Object.freeze([...BANK, "leftGunParapet", "nestFront", "nestWest", "gapWest", "gapEast"]),
    groups: Object.freeze({ fireBase: Object.freeze({ role: "hold" }), center: CENTER(),
      flankWest: FLANK_WEST(),
      eastHold: Object.freeze({ role: "hold" }),
      mgAttack: Object.freeze({ role: "assault", maxLine: -1, regroupLine: 1, loop: true,
        fallback: Object.freeze({ casualtyFraction: 0.5, backLines: 2, holdS: 15, repelledFact: "frontAttackRepelled" }),
        charge: Object.freeze({ afterS: 30, minAlive: 4, playerWithinM: 60, lastLineShare: 0.5 }) }) }) }),
  // 战车压阵位：玩家往阵位后墙撤，沟沿开始挨环境射击。
  Object.freeze({ id: "tankPressure", when: "tankPositionPressured", stages: Object.freeze(["MachineGun", "Tank"]),
    fire: Object.freeze([...BANK, "leftGunParapet", "nestFront", "nestWest", "rearLane", "gapWest", "gapEast"]),
    groups: Object.freeze({ fireBase: Object.freeze({ role: "hold" }), center: CENTER(),
      flankWest: FLANK_WEST(),
      eastHold: Object.freeze({ role: "hold" }),
      mgAttack: Object.freeze({ role: "assault", maxLine: -1, regroupLine: 1, loop: true,
        fallback: Object.freeze({ casualtyFraction: 0.5, backLines: 2, holdS: 15, repelledFact: "frontAttackRepelled" }) }) }) }),
  // 05 取到集束弹：火力追着攻击支路走。
  Object.freeze({ id: "bundle", when: "bundleTaken", stages: Object.freeze(["Tank"]),
    fire: Object.freeze([...BANK, "leftGunParapet", "nestFront", "attackLane", "gapWest", "gapEast"]),
    groups: Object.freeze({ fireBase: Object.freeze({ role: "hold" }), center: CENTER(),
      flankWest: FLANK_WEST(),
      eastHold: Object.freeze({ role: "hold" }),
      mgAttack: Object.freeze({ role: "assault", maxLine: -1, regroupLine: 1, loop: true,
        fallback: Object.freeze({ casualtyFraction: 0.5, backLines: 2, holdS: 15, repelledFact: "frontAttackRepelled" }) }) }) }),
  // 战车趴窝，第二批守军过口：所有跃进组让出口子（退到第二条线，看得见口子的继续往回拉）。
  Object.freeze({ id: "secondWithdrawal", when: "tankImmobilized", stages: Object.freeze(["Tank"]),
    yield: true, bark: "fallback",
    fire: Object.freeze([...BANK, "leftGunParapet", "nestFront", "attackLane"]),
    groups: Object.freeze({ fireBase: Object.freeze({ role: "hold" }), center: CENTER({ maxLine: 1 }),
      flankWest: FLANK_WEST({ maxLine: -2 }),
      eastHold: Object.freeze({ role: "hold" }),
      mgAttack: Object.freeze({ role: "assault", maxLine: 1, regroupLine: 0, loop: true }) }) }),
  // 守军撤完、玩家离开前沿：零星的土坎火力，跃进停在原地。
  Object.freeze({ id: "disengage", when: "lastGuardsWithdrawn", stages: Object.freeze(["Tank"]),
    fire: Object.freeze([...BANK]),
    groups: Object.freeze({ fireBase: Object.freeze({ role: "hold" }), center: CENTER({ maxLine: 1 }),
      flankWest: Object.freeze({ role: "hold" }), eastHold: Object.freeze({ role: "hold" }),
      mgAttack: Object.freeze({ role: "assault", maxLine: 1, regroupLine: 0, loop: true }) }) }),
]);

/**
 * 05 侧沟那两人（bundleApproach 组）的切沟战术，覆盖 APPROACH_TACTICS 里的同名条目
 *（`Data_FirstLevelMission.MISSION_TACTICS` 按这个顺序展开，后写的赢）。
 *
 * 两处改动：
 *   · 原条目 BundleBendB 从 (44,−120) 正西直穿 SupplyRoadScreen（x=41、z −121…−107 的路侧挡墙）——
 *     当年它被 MISSION_TACTICS 的过滤整条滤掉，这条穿墙路线也就从没被净空检查量到过。这里绕过挡墙南端。
 *   · 放行从「玩家到阵位后墙岔口 20 m 内」（near，放行前是装睡的剧本兵）改成**事实门** `fact:"bundleTaken"`
 *    （运行时 UpdateTactics 认 plan.fact）：03 的接近路线离那个岔口只有 5 m，near 会让这两人在 03 夺点时
 *     就从侧后切进沟；而放行前装睡又会让他们在路上当两根木桩。事实门之前他们是普通的守路活人，
 *     玩家取到集束弹之后才切进取弹沟 —— 玩家回程正好撞上（05「切进沟里」那一拍）。
 * 临时坐标，归 Front 包定稿。
 */
export const FRONT_PRESSURE_TACTICS = Object.freeze({
  BundleBendA: Object.freeze({ fact: "bundleTaken", delay: 0,
    points: Object.freeze([{ x: 40, z: -125 }, { x: 35, z: -123 }, { x: 29, z: -120 }]) }),
  BundleBendB: Object.freeze({ fact: "bundleTaken", delay: 2,
    points: Object.freeze([{ x: 43, z: -123.2 }, { x: 40, z: -124.5 }, { x: 35, z: -123 }, { x: 29, z: -120 }]) }),
});

/** 哪些遭遇组的日军拿相位的环境射击点（不在任何组里的也拿：前沿不许有人端枪不打）。 */
export const FRONT_PRESSURE_FIRE_ENCOUNTERS = Object.freeze(["front", "machineGun", "approach", "tank", "bundleApproach"]);

/** 运行时节拍（秒）：组规则（伤亡、冲锋、让口子）按这个间隔评一次，不逐帧。 */
export const FRONT_PRESSURE_TICK = Object.freeze({
  groupEveryS: 0.25,
  yieldEveryS: 0.5,
  /** 让口子时，一个人被往回拉一条线之后多久才再查他一次（让他先跑到位）。 */
  yieldRecheckS: 3,
});
