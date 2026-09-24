// ===========================================================================
// Data_FirstLevelFrontPressure.mjs —— 第一关 02–05 前沿的「压力表」（纯数据，零 three）
//
// 契约：docs/Data_FirstLevel0105Refactor20260923Contract.md §2 第 3/8/9 条、§3；
// 机制与读法：docs/Data_EnemyAi.md §20。运行时：Script_FirstLevelFrontPressure.mjs。
// 空间：docs/Data_FirstLevelSpace0106_20260923.md §2、§5（名册、跃进线、侧翼组 lane、增援入口、授权射击点）。
//
// 病根（09-23 查证）：前沿日军的跃进是一次性脚本 —— 每人 0–3 条跃进线，打两轮、退回三次，
// 大约开战 60–90 s 就全部跑完，之后在最后一线坐满剩下的八分钟；「退一线」「机枪组被打退」
// 的钩子是死代码；阵位守卫与前沿机枪是 hold 炮塔。这张表把「每个阶段每个组该干什么、
// 下一步是什么」写成数据，按任务事实切相位，每一相位都有下一步。
//
// 2026-09-24 Front 包按新空间（Space 包 09-23/24 重排）定稿：组员、授权射击点、侧翼组按 lane 跃进、
// 04 推进组、增援入口、05 切入组、阵位守卫后撤锚点都换成新布局的坐标。格式沿用 Ai 包冻结的格式：
//
//   FRONT_FIRE_POINTS  授权射击点（环境射击只打这些点，**永远不是玩家的实时位置**）
//     { x, z, h, r, gapPath? }   h = 离地高度（地面走共享采样器）；r = 弹着散布半径（米）；
//                                gapPath = 这一点在撤退口路径上：守军过口的窗口里不许打。
//   FRONT_PRESSURE_GROUPS  组 → 成员
//     { ids:[missionId…] } 或 { encounter:"machineGun" }（整组）；officer 可选（该组军官的 missionId）。
//   FRONT_PRESSURE_PHASES  相位（按顺序，取「when 事实已记下、且当前步骤在 stages 里」的最后一个）
//     { id, when:事实|null, stages:[步骤…], yield?:bool, reserve?:bool, fire:[点名…], groups:{ 组id: 角色配置 } }
//   角色配置（role）：
//     hold       原地守（不改走位，只给环境射击点）；
//     assault    沿自己的跃进线推进（运行时 UpdateAssault 执行冲刺段）：
//                  lane       这个人还没有跃进线时用哪条（Front 包 09-24 加）："own" = 名册里他自己的 lane
//                             （侧翼组、军官）；"field" = 从出生点按 FrontAssaultLane 现算（北侧增援）；
//                             数组 = 显式路线（路堑增援沿战车路下来）
//                  maxLine    这一相位最多推进到第几条线（负数从末尾数：-1 = 最后一条）；拉回来也是它
//                  regroupLine 最后一线打完 assaultLateralShifts 轮退回哪一条再上（负数同上）
//                  loop       是否无限循环（true = 相位不切就一直「退回再上」，不会坐死）
//                  points     给了就换成这条显式路线；viaLine 给了的话，先沿**自己的**跃进线跑到那条线再横移
//                  fallback   { casualtyFraction|casualties, backLines, holdS, repelledFact? }：本组伤亡过这个比例
//                             就全组退 backLines 条线、喊「一旦下がれ」，holdS 秒后照常再上；
//                             **每组整关只退一次**；repelledFact 给了的话，退完（或全灭）记这个事实
//                  charge     { afterS, minAlive, playerWithinM, lastLineShare } 这一相位最多一次的脚本化成组冲锋
//                  stalemate  { contactS, essentialS, backLines, clearS }（Front 包 09-24 加）：
//                             近距交火（contact）僵在一处太久就往回拉 backLines 条线 —— 对手是打不死的剧情人物
//                             （scriptEssential / missionUntargetable：何有田、老周、待撤守军）时 essentialS 秒、
//                             别的对手 contactS 秒；往回跑的路上不认近距交火，到线为止（最少 clearS 秒）。
//                             病根（Tank 包 campaign_10 实测）：04 推进组打到左机枪何有田身边一直 contact、
//                             压制 0、看得见缺口，FrontBattle.InfantryBlockade 永不解除，lastGuardsWithdrawn 超时。
//     nestGuard  阵位守卫：只保留固定机枪 hold；步枪手非 hold、局部战区、1 枚手榴弹；
//                fallback { casualties, to:{x,z} } 伤亡够数后退到后墙锚点
//   相位级：yield = 守军过口的窗口 —— 本相位里任何 assault 成员只要对撤退口有通视就往回拉；
//          bark = 相位切换时每组派一个人喊的那一类（军官优先）；
//          reserve = 这一相位放增援（FRONT_RESERVE_RELEASE：名册 slotStages 里「当前步骤及以前」的人）。
// ===========================================================================
import { FRONT_SORTIE as S, FRONT_TANK_PATH, FrontTankIndex } from "./Data_FirstLevelFrontRoute.mjs";
import { FRONT_MACHINE_GUN_ATTACK, FRONT_FLANK_GROUP, FRONT_OFFICER, FRONT_RESERVE_ENTRIES } from "./Data_FirstLevelMissionFront.mjs";

const P = (x, z, h, r, extra = {}) => Object.freeze({ x, z, h, r, ...extra });

/**
 * 授权射击点（坐标取 Space 包 `Data_FirstLevelMissionFront.FRONT_FIRE_POINTS` 的按步骤表，空间文档 §5 末条）。
 * 土坎顶线 z −160（坎顶高约 2.0 m，h 从坎顶的共享地面算）；老周左枪胸墙外沿；缺口两侧与缺口交汇 GJ（gapPath）；
 * 夺下之后的阵位北墙、西墙、东山墙；05 攻击位残墙顶。h ≤ 2（FrontPressureTest 的量程）。
 */
const Crest = (x) => P(x, -160.3, 0.3, 2.4);
export const FRONT_FIRE_POINTS = Object.freeze({
  crestA: Crest(-26), crestB: Crest(-20), crestC: Crest(-14), crestD: Crest(-2), crestE: Crest(4), crestF: Crest(8),
  // 左前机枪胸墙外沿（老周 / 何有田在里面）：只打胸墙，r 小 —— 这是「那挺枪在挨打」，不是打人。
  leftGunParapet: P(-32.6, -158.7, 0.8, 1.0),
  // 撤退口两侧与缺口交汇：守军过口的窗口里不许打（gapPath）。
  gapWest: P(S.gap.x - 1.6, S.gap.z - 0.3, 0.2, 1.0, { gapPath: true }),
  gapEast: P(S.gap.x + 1.6, S.gap.z - 0.3, 0.2, 1.0, { gapPath: true }),
  gapJunction: P(S.gap.x, -142.3, 0.2, 1.2, { gapPath: true }),
  // 夺下之后的右侧阵位：北墙（正面胸墙）、西墙（机枪座前的低墙）、东山墙（地标，打不塌）。
  nestNorth: P(27.5, -157.1, 1.1, 1.4),
  nestWest: P(24, -154, 1.1, 1.2),
  nestGable: P(37, -151.2, 2.0, 1.2),
  // 05 攻击位的路边残墙顶（玩家蹲在它后面：近失弹压人，不打人）。
  attackRuin: P(45.3, -162.6, 1.3, 1.2),
  // 取弹沟与道路连接支沟的交汇口（05 切入组要切进来的地方）：东头守位的两人 03/04 唯一打得到的点
  //（09-24 探针：他们对土坎、左枪、缺口全不通视，214 s 里一发没打）。环境射击不命中，只是近失弹与曳光。
  eastLink: P(44.6, -125.6, 0.8, 1.2),
});

const CREST = Object.freeze(["crestA", "crestB", "crestC", "crestD", "crestE", "crestF"]);
const CREST_05 = Object.freeze(["crestB", "crestD", "crestE"]);
const GAP = Object.freeze(["gapWest", "gapEast", "gapJunction"]);
const NEST_WALLS = Object.freeze(["nestNorth", "nestWest", "nestGable"]);

/** frontReserve 的 missionId（Data_FirstLevelMission 的拼法：`FrontReserve${entry.id}${i}`），按入口分组。 */
const ReserveIds = (entryId) => Object.freeze(FRONT_RESERVE_ENTRIES.filter((entry) => entry.id === entryId)
  .flatMap((entry) => entry.slots.map((_, i) => `FrontReserve${entry.id}${i}`)));

/**
 * 组（名册：Data_FirstLevelMissionFront / Data_FirstLevelMission.MISSION_ENCOUNTERS）。
 *   fireBase   北坡残墙后的定点火力（两挺轻机枪 + 两名步枪），hold，压土坎与左枪、夺点后压阵位；
 *   boundWest  跃进组西队（A/B/C）：老周左枪侧射的那一半；
 *   boundEast  跃进组东队（D/E/F）：夺下的机枪打得到的那一半；两队错一条线循环（交替跃进）；
 *   flank      03 指定进攻组（侧翼四人）+ 军官：按名册 lane 逐坑跃进到阵位东北弹坑群，末线看得见缺口；
 *   nest       右侧阵位四人（机枪手 hold，三名步枪手活的）；
 *   mgAttack   04 推进组（北侧出发壕出来，standbyUntil tankPreviewed）；
 *   reserveWest / reserveRoad  04/05 增援（frontReserve 按入口分两组，FRONT_RESERVE_RELEASE 放出）。
 */
export const FRONT_PRESSURE_GROUPS = Object.freeze({
  fireBase: Object.freeze({ ids: Object.freeze(["FrontGunner", "FrontSupportGunner", "FrontRifleG", "FrontRifleH"]) }),
  boundWest: Object.freeze({ ids: Object.freeze(["FrontRifleA", "FrontRifleB", "FrontRifleC"]) }),
  boundEast: Object.freeze({ ids: Object.freeze(["FrontRifleD", "FrontRifleE", "FrontRifleF"]) }),
  flank: Object.freeze({ ids: Object.freeze([...FRONT_FLANK_GROUP.map((s) => s.id), FRONT_OFFICER.id]), officer: FRONT_OFFICER.id }),
  nest: Object.freeze({ encounter: "approach" }),
  // 军官取第一个步枪手（机枪手上不了刺刀，也带不了冲锋）。
  mgAttack: Object.freeze({ ids: Object.freeze(FRONT_MACHINE_GUN_ATTACK.map((spec) => spec.id)),
    officer: FRONT_MACHINE_GUN_ATTACK.find((spec) => spec.weapon !== "Type11")?.id ?? null }),
  reserveWest: Object.freeze({ ids: ReserveIds("NorthWestPlateau") }),
  reserveRoad: Object.freeze({ ids: ReserveIds("RoadCutting") }),
});

/**
 * 阵位守卫的后撤锚点：阵位后墙东段内侧、后门以东（连接口守卫的岗位旁），离机枪 10.2 m —— 扣掉守区半径 2 m 与
 * 掩体余量 1 m 仍在 7 m 以外（刺刀够不着上枪的人）；
 * 机枪座坐姿 1.5 / 蹲姿 1.0、西门站姿、班长位蹲姿四处眼位看这一点 0.6/1.0/1.4 m 三个高度全部通视
 *（Script_FirstLevelSpaceProbe.Sight 扫院内 0.5 m 网格挑的，FrontPressureTest 复算）——
 * 03 的 rightNestCaptured 要四人都死（FrontBattle.UpdateCapture），退下来的人必须打得着。
 * 旧锚点 (25,−152.5) 是按 09-22 布局挑的，新布局里离机枪只有 1.4 m。
 */
const NEST_FALLBACK = Object.freeze({ casualties: 2, to: Object.freeze({ x: 32.2, z: -146.8 }) });
const NEST = Object.freeze({ role: "nestGuard", fallback: NEST_FALLBACK });

/**
 * 僵持退线（见头注 stalemate）。essentialS：一轮跃进在最后一线要打 assaultFinalHoldS 量级的时间，
 * 打不死的对手顶两轮就该认了；contactS：普通近距交火给足一场小冲突的时间（Tank 包实测的僵持是 170 s 不散）。
 */
const STALEMATE = Object.freeze({ contactS: 40, essentialS: 16, backLines: 1, clearS: 6 });
const BOUND = (extra = {}) => Object.freeze({ role: "assault", maxLine: -1, regroupLine: 1, loop: true,
  fallback: Object.freeze({ casualtyFraction: 0.5, backLines: 1, holdS: 10 }), stalemate: STALEMATE, ...extra });
// 东队错开一条线：西队退回第 2 条线时东队在第 3 条，前沿始终有一半人压着（交替跃进，不同进同退）。
const BOUND_EAST = (extra = {}) => BOUND({ regroupLine: 2, ...extra });
// 侧翼组：自己的 lane（四跳到阵位东北弹坑群），末线打够轮次退回倒数第二跳再上。
// 伤亡两人就全组退两跳（离开缺口视线）——夺下的机枪 15.7–18.3 m 打得到他们，这是 03「压下去了」那一拍。
const FLANK = (extra = {}) => Object.freeze({ role: "assault", lane: "own", maxLine: -1, regroupLine: -2, loop: true,
  fallback: Object.freeze({ casualties: 2, backLines: 2, holdS: 20 }), stalemate: STALEMATE, ...extra });
const MG_ATTACK = (extra = {}) => Object.freeze({ role: "assault", maxLine: -1, regroupLine: 1, loop: true,
  fallback: Object.freeze({ casualtyFraction: 0.5, backLines: 2, holdS: 15, repelledFact: "frontAttackRepelled" }),
  stalemate: STALEMATE, ...extra });
/**
 * 路堑增援沿战车路下来（同一条路：路堑 → 北残院后 → 折返顶 → 路弯出口），到侧翼组第三跳那两个弹坑；
 * 北侧增援从出发壕按跃进线现算（"field"）。
 */
const ROAD = (id) => FRONT_TANK_PATH[FrontTankIndex(id)];
export const FRONT_RESERVE_ROAD_LANE = Object.freeze([ROAD("CrestEast"), ROAD("Shadow"), ROAD("HullDown"), ROAD("Descent"),
  ROAD("Bend"), ROAD("BendExit"), { x: 46.5, z: -176.2 }, { x: 42.6, z: -174.2 }].map((p) => Object.freeze({ x: p.x, z: p.z })));
const RESERVE_WEST = (extra = {}) => Object.freeze({ role: "assault", lane: "field", maxLine: -1, regroupLine: 1, loop: true,
  stalemate: STALEMATE, ...extra });
const RESERVE_ROAD = (extra = {}) => Object.freeze({ role: "assault", lane: FRONT_RESERVE_ROAD_LANE, maxLine: -1, regroupLine: -2,
  loop: true, stalemate: STALEMATE, ...extra });

/**
 * 增援放出（契约 §2 第 8 条、§6；Space 名册 FRONT_RESERVE_ENTRIES.slotStages）：带 reserve 的相位里，
 * 名册中 stage 在当前步骤及以前的 frontReserve 才生成 —— 04 放 2+2，05 放 1。入口都在视线外
 *（北侧出发壕西端 ≥63 m、路堑 ≥93 m，FrontTopologyTest 断言）。
 */
export const FRONT_RESERVE_RELEASE = Object.freeze({ encounter: "frontReserve",
  stageOrder: Object.freeze(["MachineGun", "Tank"]) });

export const FRONT_PRESSURE_STAGES = Object.freeze(["BunkerRescue", "RearTrench", "Support", "MachineGun", "Tank"]);

const FIRE_03 = Object.freeze([...CREST, "leftGunParapet", "eastLink", ...GAP]);
const FIRE_03_NEST = Object.freeze([...CREST, "leftGunParapet", ...NEST_WALLS, "eastLink", ...GAP]);
const FIRE_05 = Object.freeze([...CREST_05, "leftGunParapet", "nestNorth", "attackRuin", ...GAP]);
const NoGap = (list) => Object.freeze(list.filter((id) => !GAP.includes(id)));
const HOLD = Object.freeze({ role: "hold" });
/**
 * 火力基地自己的点名表（组配置的 `fire` 盖过相位表）。北坡残墙后 33–67 m：土坎顶、左枪胸墙、夺下后的阵位北墙与西墙
 * 打得到；缺口两侧、缺口交汇、东头交汇口从那儿一个都不通视（09-24 引擎射线逐点量过）。相位表里混着这些点时，
 * 挑点的射线预算（AMBIENT_FIRE.losRetries）常常耗在它们身上、一轮挑不出点 —— 四个人 410 s 里一半时间端着枪不打。
 */
/**
 * fireStance：不在掩体循环里（FIRE / SUPPRESS / WATCH）的火力基地兵站着隔墙打。残墙 1.1 m 挡得住蹲姿（枪口 0.92 m）
 * 挡不住站姿（1.42 m）—— 09-24 探针里轻机枪手 FrontGunner 不进掩体循环、蹲在墙后「开火」，挑点射线全被墙挡死。
 * 掩体循环（COVER_ENGAGE）自己有探头姿态，不管；压制值到 fireStanceMaxSuppression 就随 AI 趴下，不硬拉起来。
 */
const FIRE_BASE = (fire) => Object.freeze({ role: "hold", fire: Object.freeze(fire), fireStance: 0, fireStanceMaxSuppression: 0.5 });
const FB_03 = FIRE_BASE([...CREST, "leftGunParapet"]);
const FB_NEST = FIRE_BASE([...CREST, "leftGunParapet", "nestNorth", "nestWest"]);
const FB_05 = FIRE_BASE([...CREST_05, "leftGunParapet", "nestNorth"]);

export const FRONT_PRESSURE_PHASES = Object.freeze([
  // 02：前沿已在远处交火，推进要等 03 frontBattleStarted（MISSION_ENCOUNTER_ACTIVATION.standbyUntil）。
  Object.freeze({ id: "standby", when: null, stages: Object.freeze(["BunkerRescue", "RearTrench"]),
    fire: Object.freeze([...CREST, "leftGunParapet"]),
    groups: Object.freeze({ nest: NEST }) }),
  // 03 开战：两队交替跃进、侧翼组逐坑摸到阵位东北、火力基地压土坎与左枪。
  Object.freeze({ id: "assault", when: "frontBattleStarted", stages: Object.freeze(["Support", "MachineGun", "Tank"]),
    bark: "advance", fire: FIRE_03,
    groups: Object.freeze({ fireBase: FB_03, boundWest: BOUND(), boundEast: BOUND_EAST(), flank: FLANK(), nest: NEST }) }),
  // 右侧阵位丢了：玩家上了那挺机枪。土坎、撤退口之外开始打阵位的墙。
  Object.freeze({ id: "nestLost", when: "rightNestCaptured", stages: Object.freeze(["Support", "MachineGun", "Tank"]),
    bark: "mg", fire: FIRE_03_NEST,
    groups: Object.freeze({ fireBase: FB_NEST, boundWest: BOUND(), boundEast: BOUND_EAST(), flank: FLANK() }) }),
  // 第一批守军过口：跃进组退到第三条线（土坎北侧断视线），侧翼退到倒数第二跳；看得见口子的人一条条往回拉。
  Object.freeze({ id: "firstWithdrawal", when: "frontRifleDefense", stages: Object.freeze(["Support", "MachineGun", "Tank"]),
    yield: true, bark: "fallback", fire: NoGap(FIRE_03_NEST),
    groups: Object.freeze({ fireBase: FB_NEST, boundWest: BOUND({ maxLine: 2 }), boundEast: BOUND_EAST({ maxLine: 2 }),
      flank: FLANK({ maxLine: -2 }) }) }),
  // 第一批撤完：重新压上来。
  Object.freeze({ id: "firstDone", when: "rifleWithdrawalResolved", stages: Object.freeze(["Support", "MachineGun", "Tank"]),
    bark: "advance", fire: FIRE_03_NEST,
    groups: Object.freeze({ fireBase: FB_NEST, boundWest: BOUND(), boundEast: BOUND_EAST(), flank: FLANK() }) }),
  // 04 战车露面：出发壕里的推进组上来（MISSION_ENCOUNTER_ACTIVATION.machineGun.standbyUntil = tankPreviewed）。
  // 这一相位唯一一次脚本化成组冲锋；伤亡过半就退两条线，退完记 frontAttackRepelled。
  Object.freeze({ id: "tankShown", when: "tankPreviewed", stages: Object.freeze(["Support", "MachineGun", "Tank"]),
    bark: "advance", fire: FIRE_03_NEST,
    groups: Object.freeze({ fireBase: FB_NEST, boundWest: BOUND(), boundEast: BOUND_EAST(), flank: FLANK(),
      mgAttack: MG_ATTACK({ charge: Object.freeze({ afterS: 12, minAlive: 3, playerWithinM: 80, lastLineShare: 0.34 }) }) }) }),
  // 战车压阵位：玩家往阵位后墙撤；视线外入口放出第一批增援（04：2+2）。
  Object.freeze({ id: "tankPressure", when: "tankPositionPressured", stages: Object.freeze(["MachineGun", "Tank"]),
    fire: FIRE_03_NEST, reserve: true,
    groups: Object.freeze({ fireBase: FB_NEST, boundWest: BOUND(), boundEast: BOUND_EAST(), flank: FLANK(),
      mgAttack: MG_ATTACK(), reserveWest: RESERVE_WEST(), reserveRoad: RESERVE_ROAD() }) }),
  // 05 取到集束弹：火力追着攻击位走（05 的那一名增援进 05 就放，不等取弹）。
  Object.freeze({ id: "bundle", when: "bundleTaken", stages: Object.freeze(["Tank"]),
    fire: FIRE_05, reserve: true,
    groups: Object.freeze({ fireBase: FB_05, boundWest: BOUND(), boundEast: BOUND_EAST(), flank: FLANK(),
      mgAttack: MG_ATTACK(), reserveWest: RESERVE_WEST(), reserveRoad: RESERVE_ROAD() }) }),
  // 战车趴窝，第二批守军过口：所有跃进组让出口子（退到第二条线，看得见口子的继续往回拉）。
  Object.freeze({ id: "secondWithdrawal", when: "tankImmobilized", stages: Object.freeze(["Tank"]),
    yield: true, bark: "fallback", fire: NoGap(FIRE_05), reserve: true,
    groups: Object.freeze({ fireBase: FB_05, boundWest: BOUND({ maxLine: 1 }), boundEast: BOUND_EAST({ maxLine: 1 }),
      flank: FLANK({ maxLine: 1 }), mgAttack: MG_ATTACK({ maxLine: 1, regroupLine: 0 }),
      reserveWest: RESERVE_WEST({ maxLine: 1, regroupLine: 0 }), reserveRoad: RESERVE_ROAD({ maxLine: 4, regroupLine: 3 }) }) }),
  // 守军撤完、玩家离开前沿：零星的土坎火力，跃进停在原地。
  Object.freeze({ id: "disengage", when: "lastGuardsWithdrawn", stages: Object.freeze(["Tank"]),
    fire: CREST_05,
    groups: Object.freeze({ fireBase: FIRE_BASE(CREST_05), boundWest: HOLD, boundEast: HOLD, flank: HOLD,
      mgAttack: MG_ATTACK({ maxLine: 1, regroupLine: 0 }), reserveWest: HOLD, reserveRoad: HOLD }) }),
]);

/**
 * 05 切入组（bundleApproach，道路连接支沟东段守位的两人）的切沟战术，覆盖 APPROACH_TACTICS 里的同名条目
 *（`Data_FirstLevelMission.MISSION_TACTICS` 按这个顺序展开，后写的赢）。
 * 事实门 `bundleTaken`：取到集束弹之前他们是守位的活人（hold，看不到缺口与背坡 —— FrontTopologyTest），
 * 取到之后顺道路连接支沟西行、在取弹沟交汇口切进沟，正好迎上回程的玩家（05「前头岔口！有人下沟了！」）。
 * 路线：RoadLinkSap (55,−126.8) → (48.5,−125.8) → 交汇口 (44.6,−125.6)，A 再往受损沟沿那段走一截。
 */
export const FRONT_PRESSURE_TACTICS = Object.freeze({
  BundleBendA: Object.freeze({ fact: "bundleTaken", delay: 0,
    points: Object.freeze([{ x: 55, z: -126.8 }, { x: 48.5, z: -125.8 }, { x: 44.6, z: -125.6 }, { x: 42.8, z: -128.4 }]) }),
  BundleBendB: Object.freeze({ fact: "bundleTaken", delay: 2.5,
    points: Object.freeze([{ x: 55, z: -126.8 }, { x: 48.5, z: -125.8 }, { x: 44.6, z: -125.6 }]) }),
});

/** 哪些遭遇组的日军拿相位的环境射击点（不在任何组里的也拿：前沿不许有人端枪不打）。 */
export const FRONT_PRESSURE_FIRE_ENCOUNTERS = Object.freeze(["front", "frontFlank", "frontOfficer", "frontReserve", "machineGun",
  "approach", "tank", "bundleApproach"]);

/** 运行时节拍（秒）：组规则（伤亡、冲锋、让口子、僵持）按这个间隔评一次，不逐帧。 */
export const FRONT_PRESSURE_TICK = Object.freeze({
  groupEveryS: 0.25,
  yieldEveryS: 0.5,
  /** 让口子时，一个人被往回拉一条线之后多久才再查他一次（让他先跑到位）。 */
  yieldRecheckS: 3,
  /**
   * 被往回拉的人至少这么久不认近距交火（UpdateAssault 的 contact），先跑回去；实际取它和「到那条线的距离 /
   * assaultRushMps + 1 s」里大的那个（Front 包 09-24：固定 4 s 跑不完二十多米，半路又和何有田对上，拉线等于白拉）。
   */
  yieldMoveS: 4,
});
