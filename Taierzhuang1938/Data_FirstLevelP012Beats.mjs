// Data_FirstLevelP012Beats.mjs — 第一关 P0/P1/P2 白盒的**任务编排数据**。
// 纯数据：不 import three、不 import 规则代码、不含函数。口径见 docs/Data_TextAndTuning.md §6。
//
// 这张表回答「摆了什么、什么时候换目标行、导航牌上写谁」；
// `Script_FirstLevelP012Flow.mjs` 是解释器，回答「点完发生什么、目标点在哪儿」。
// 文案一律存**键**不存句子，句子在 Data_Text_P012.mjs。
//
// ── 五张表 ──────────────────────────────────────────────────────────────────
//   P012_BEATS               拍表：id / 目标文本键 / 区 / 目标时刻 / 动作名。
//   P012_WAVES               波次预算：哪一拍、第几秒、几个人、什么压力、走哪条路。
//   P012_INTERACTION_SPECS   交互点规格：id / kind / 标签键 / 手势 / 秒数 / 锚点名 / once。
//   P012_OBJECTIVE_LINES     HUD 当前目标行的谓词表。
//   P012_GUIDANCE_NAMES      屏幕导航牌名字的谓词表（与上一张共用同一台解释器）。
//
// ── 谓词表怎么读（两张表同一套语义）─────────────────────────────────────────
// 解释器 `P012ResolveLine`（在 Flow 里）**按数组顺序走一遍**：
//   · `set`（默认）命中 → 整行替换；
//   · `append: true` 命中 → 追加到当前行尾。
// 后命中的覆盖先命中的 —— 这与它替换掉的那段代码是同一种语义（顺序赋值，最后一次生效），
// 所以表的顺序**就是原来代码的顺序**，逐条对得上。表里每条都写全自己的条件
// （不靠"前面那条没命中"来隐含排他），因此单看一条也读得懂。
// 唯一的例外是源码里那种"先命中的赢"的 if / else-if 链：它在表里**倒着写**，
// 让链里最先命中的那条最后求值。全表只有 B13 一处，就地写了注释。
//
// 谓词字段集合（有限、不再扩；数据写不下的条件一律走 flags 里的具名钩子）：
//   beat        number | number[]   —— 限定拍号；不写 = 任何拍
//   facts       string[]            —— 这些任务事实**全部**已成立
//   notFacts    string[]            —— 这些任务事实**一个都没**成立
//   signals     string[]            —— 这些剧情信号**全部**已推过
//   notSignals  string[]            —— 这些剧情信号**一个都没**推过
//   carry       string              —— 手上搬的正是这一件（"stretcher" / "wounded" / "ammoCrate"）
//   notCarry    string              —— 手上搬的**不是**这一件
//   flags       string[]            —— 这些**具名钩子**全部为真
//   notFlags    string[]            —— 这些具名钩子全部为假
//
// 具名钩子（flags）是「数据写不下、由代码算」的那一半：几何距离、波次账、
// 导航求解结果。名字由 Flow 的 `CurrentObjective` 在原来分支的同一处置位，
// 一处一个名字，不许在表里做算术。当前全集：
//   briefingConfigured  本关配了「班长交代接防」那一段
//   ammoCarrying        手上是弹药箱（B05）
//   atAmmoDrop          已站进机枪收弹处 2.2 m
//   portFar             离目标枪眼 3 m 以上（B08 / B10）
//   mortarDanger        掷弹筒预警正在生效（压过当前拍的标称动作）
//   mortarNearOrigin    还在上一个弹着点 6 m 内，且有安全枪眼可去
//   mortarWaveLocked    已在 B09，但掷弹筒那一波还没放出来
//   mortarResolved      掷弹筒组已清除或已被压制
//   mgStatusShown       当前拍要带机枪状态前缀（B09 起）
//   woundedDelivered    伤员已送到掩蔽部接收处
//   roadWoundedInspect  路上那副担架已停在检查位
//   ambushThreat        残屋侧绕还有活着 / 待生成的火力点
//   ambushThreatFirst   上面那个火力点是第一组（道路机枪）
//   ambushMoveAdvice    还有伏兵活着、且还没贴到射击位 —— 该给移动建议而不是交火提示
//   ambushProneApproach 正踩在「低胸墙接近段」上
//   ambushProneSegment  正踩在「已清组的胸墙段」上
//   ambushEntry         残屋入口路点还没走完
//   ambushResolved      伏兵那一波已全部解决
//   ambushRejoin        被挤到残屋外，需要沿原入口回接
//   airTail             离担架队太远，先去接队尾
//   airRouteChosen      两条护送路已经选定一条
//   airRouteOpen        选的是开放路（否则是沟边路）
//   retreatArrived      担架与最后一副都到阵地入口了
//   retreatGuideAtSmoke 班长已站到施放烟幕的位置
//   retreatBlockade     南路断障（B22 的结论是 blockadeCleared）
//   retreatCoverHold    回撤途中需要在路沟接应
//   retreatRejoining    担架队落在后面
//   retreatLead         需要在担架前方引路
//   southSupplyPhase    南路补给段（还没绕进民房）
//   lateThreat          B20 / B21 当前还有活着的近距离敌组
//   lateThreatFight     上面那一组正把当前动作变成交火
//   movingShooter       敌人正在换射击位
//   southRouteBefore    南路路点还没走完
//   columnAtSouthAssembly 担架队已到南路集合点
//   atBlockadeDecision  站在能看清封锁线的判断位
//   southApproach       需要绕开沟岸、从转角接近
//   hasGrenades         身上还有手榴弹（B21 那句"可以投弹"的条件）
//   scavengeGrenades    缴获段的手榴弹计数 > 0（取整后的枚数，与显示的数字同一个来源）
//   bleedingWithBandage 正在流血且还有绷带
//   resupply            前沿弹药箱补给提示生效
//   scavenge            枪弹打空，可以考虑缴获
//   weaponNearby        附近真有一把够得着的地上枪械
//   frontlineApproach   需要沿中间交通壕绕回枪眼
//   guideAtAmmoDrop     导航牌的目标点就是机枪收弹处（B05 专用）
//   frontlineAmmoPoint  当前交互点是前沿弹药箱
//
// 占位符（{…}）的值由 Flow 一次算好整包传给 T：
//   label 战术提示（火力点自己的 labelKey 取出来的句子）、mortar 掷弹筒组状态、
//   mg 机枪状态、side 东侧 / 西侧、clips 箱内剩余桥夹、grenades 身上手榴弹数。
import { SUPPLY } from "./Data_Tuning_P012.mjs";

// ---------------------------------------------------------------------------
// 拍表
// ---------------------------------------------------------------------------
/**
 * 一拍一条：`id` 是审图编号（也是文本键的中段），`objectiveKey` 是这一拍的
 * 标称目标行，`zone` 是它归哪个路标段，`targetStartS` 是节奏校准用的目标时刻
 * （**不是**等待时钟），`action` 是运行时的动作名。
 */
export const P012_BEATS = Object.freeze([
  ["B00", "Z00", 0, "door"],
  ["B01", "Z00", 40, "weapon"],
  ["B02", "Z01", 85, "village"],
  ["B03", "Z02", 140, "depart"],
  ["B04", "Z03", 185, "shelling"],
  ["B05", "Z04", 230, "ammo"],
  ["B06", "Z05", 285, "scouts"],
  ["B07", "Z05", 330, "front"],
  ["B08", "Z05", 380, "machineGun"],
  ["B09", "Z05", 425, "mortar"],
  ["B10", "Z05", 465, "culvert"],
  ["B11", "Z04", 510, "wounded"],
  ["B12", "Z04", 565, "volunteer"],
  ["B13", "Z06", 600, "escort"],
  ["B14", "Z07", 740, "ambush"],
  ["B15", "Z08", 910, "regroup"],
  ["B16", "Z08", 980, "railPass"],
  ["B17", "Z08", 1030, "crowdTurn"],
  ["B18", "Z08", 1100, "stretcher"],
  ["B19", "Z08", 1140, "dive"],
  ["B20", "Z08", 1185, "closeFight"],
  ["B21", "Z09", 1250, "southFight"],
  ["B22", "Z09", 1370, "southCut"],
  ["B23", "Z10", 1395, "retreat"],
  ["B24", "Z04", 1500, "regrip"],
  ["B25", "Z04", 1550, "complete"],
].map(([id, zone, targetStartS, action]) => Object.freeze({
  id, zone, targetStartS, action, objectiveKey: `p012.beat.${id}.objective`,
})));

/** 每波只引入一种主压力，数量有限；死亡不返还预算。 */
export const P012_WAVES = Object.freeze([
  { beat: 6, atS: 285, count: 2, kind: "scouts", lane: "scoutSearch" },
  { beat: 7, atS: 330, count: 5, kind: "rifles", lane: "centerEnemy" },
  { beat: 8, atS: 380, count: 2, kind: "machineGun", lane: "machineGunEnemy" },
  { beat: 9, atS: 425, count: 2, kind: "mortar", lane: "eastEnemy" },
  { beat: 10, atS: 465, count: 4, kind: "culvert", lane: "westEnemy" },
  { beat: 13, atS: 600, count: 4, kind: "roadContact", lane: "roadContact" },
  { beat: 14, atS: 740, count: 6, kind: "ambush", lane: "ambush" },
  { beat: 20, atS: 1185, count: 6, kind: "closeFight", lane: "closeFight" },
  { beat: 21, atS: 1250, count: 6, kind: "southFight", lane: "southFight" },
].map(Object.freeze));

// ---------------------------------------------------------------------------
// 交互点规格
// ---------------------------------------------------------------------------
/**
 * 「摆了什么点」是数据，「点完发生什么」是代码：这里只有规格，回调按同一个 id
 * 在 Flow 的 `InteractionBehaviours()` 里接线。数组顺序 = 登记顺序。
 *
 * 字段：
 *   id            交互 id（回调表的键，也是任务事实链上的稳定名字）
 *   preset        null（自己摆）/ "pickUpLoad"（搬起一件）/ "giveSupply"（交付一件）
 *   kind          交互种类（preset 为 null 时才写；预制自己带）
 *   labelKey      标签文案键；带 {…} 的动态标签由回调表的 Label() 出，见 dynamicLabel
 *   dynamicLabel  true = 标签每次由回调表算（箱内剩几个桥夹这种）
 *   gesture/seconds/once  手势、按住秒数、是否只做一次
 *   secondsPath   秒数改由配置读（写在这里的 seconds 是缺省值）
 *   position      锚点在 config 里的路径；anchorFallback / pointFallback 是它的退路
 *   anchor        true = 位置每帧由回调表的 Anchor() 给（跟着人 / 跟着队头走的点）
 *   kindId        preset 用：搬运物种类
 *   loadLabelKey  preset 用：搬在手上时的名字
 *   itemKey       preset 用：交付物名字
 */
export const P012_INTERACTION_SPECS = Object.freeze([
  { id: "p012_weaponCheck", kind: "supply", labelKey: "p012.point.weaponCheck",
    gesture: "hold", seconds: 2.4, position: "activities.weaponReceiveAnchor", once: false },
  { id: "p012_ammoIssue", kind: "supply", labelKey: "p012.point.ammoIssue",
    gesture: "hold", seconds: 1.8, position: "activities.weaponIssueAnchor", once: false },
  { id: "p012_woundedCheck", kind: "bandage", labelKey: "p012.point.woundedCheck",
    gesture: "hold", seconds: 2.2, position: "activities.woundedDragFrom",
    anchorFallback: "shelter", pointFallback: [-7, -52], once: false },
  { id: "p012_volunteer", kind: "supply", labelKey: "p012.point.volunteer",
    gesture: "hold", seconds: 1.5, anchor: true, once: false },
  { id: "p012_roadContactHold", kind: "supply", labelKey: "p012.point.roadContactHold",
    gesture: "hold", seconds: 1.4, position: "activities.roadContactColumnHold", once: false },
  { id: "p012_roadContactRelease", kind: "supply", labelKey: "p012.point.roadContactRelease",
    gesture: "hold", seconds: 1.4, position: "activities.roadContactTailRelease", once: false },
  { id: "p012_frontlineAmmo", kind: "supply", labelKey: "p012.point.frontlineAmmo", dynamicLabel: true,
    gesture: "hold", secondsPath: "activities.frontlineAmmo.takeSeconds", seconds: SUPPLY.frontlineTakeSeconds,
    position: "anchors.ammoDrop", once: false },
  { id: "p012_roadWounded", kind: "bandage", labelKey: "p012.point.roadWounded",
    gesture: "hold", seconds: 2.2, anchor: true, once: false },
  { id: "p012_airRescue", kind: "carry", labelKey: "p012.point.airRescue",
    gesture: "hold", seconds: 1.2, anchor: true, once: false },
  { id: "p012_airRescueCover", kind: "carry", labelKey: "p012.point.airRescueCover",
    gesture: "hold", seconds: 1, position: "activities.airRescueCover", once: false },
  { id: "p012_airCartClear", kind: "plank", labelKey: "p012.point.airCartClear",
    gesture: "hold", seconds: 2.2, position: "activities.airCartPosition", once: false },
  { id: "p012_southGrenades", kind: "supply", labelKey: "p012.point.southGrenades", dynamicLabel: true,
    gesture: "hold", seconds: 1.8, position: "activities.southGrenadeSupply", once: false },
  { id: "p012_retreatSmoke", kind: "supply", labelKey: "p012.point.retreatSmoke",
    gesture: "hold", seconds: 1.8, position: "activities.retreatSmokeUse", once: false },
  { id: "p012_ammoPickup", preset: "pickUpLoad", kindId: "ammoCrate",
    labelKey: "p012.point.ammoPickup", loadLabelKey: "p012.point.ammoCrateLoad",
    gesture: "hold", seconds: 0.55, anchor: true, once: false },
  { id: "p012_ammoDrop", preset: "giveSupply", itemKey: "p012.point.ammoCrateItem",
    labelKey: "p012.point.ammoDrop", gesture: "hold", seconds: 0.65,
    position: "anchors.ammoDrop", pointFallback: [5, -65], once: false },
].map(Object.freeze));

// ---------------------------------------------------------------------------
// HUD 当前目标行
// ---------------------------------------------------------------------------
/** 顺序 = 原 `CurrentObjective` 的赋值顺序；后命中的覆盖，append 的追加。 */
export const P012_OBJECTIVE_LINES = Object.freeze([
  // B01 领枪弹 → 集结
  { beat: 1, when: { facts: ["weapon", "issuedAmmo"] }, textKey: "p012.objective.b01.crossVillage" },
  { beat: 1, when: { facts: ["weapon"], notFacts: ["issuedAmmo"] }, textKey: "p012.objective.b01.takeAmmo" },
  { beat: 1, when: { facts: ["weapon", "issuedAmmo"], flags: ["briefingConfigured"], signals: ["P012BriefingStarted"] },
    textKey: "p012.objective.b01.briefing" },
  { beat: 1, when: { facts: ["weapon", "issuedAmmo"], flags: ["briefingConfigured"], notSignals: ["P012BriefingStarted"] },
    textKey: "p012.objective.b01.assemble" },
  // B03 / B04 北上与炮击
  { beat: 3, textKey: "p012.objective.b03.crossGate" },
  { beat: 4, when: { notFacts: ["northNearMissImpact"] }, textKey: "p012.objective.b04.follow" },
  { beat: 4, when: { facts: ["northNearMissImpact", "northCovered"] }, textKey: "p012.objective.b04.covered" },
  { beat: 4, when: { facts: ["northNearMissImpact"], notFacts: ["northCovered"] }, textKey: "p012.objective.b04.shelling" },
  // B05 送弹药
  { beat: 5, when: { facts: ["ammo"] }, textKey: "p012.objective.b05.delivered" },
  { beat: 5, when: { notFacts: ["ammo"], notFlags: ["ammoCarrying"] }, textKey: "p012.objective.b05.pickup" },
  { beat: 5, when: { notFacts: ["ammo"], flags: ["ammoCarrying", "atAmmoDrop"] }, textKey: "p012.objective.b05.atDrop" },
  { beat: 5, when: { notFacts: ["ammo"], flags: ["ammoCarrying"], notFlags: ["atAmmoDrop"] }, textKey: "p012.objective.b05.carrying" },
  // B08—B10 阵地：机枪、掷弹筒、涵洞
  { beat: 8, textKey: "p012.objective.b08.suppress" },
  { beat: 9, when: { flags: ["mortarResolved"] }, textKey: "p012.objective.b09.mortarResolved" },
  { beat: 9, when: { notFlags: ["mortarResolved"] }, textKey: "p012.objective.b09.mortarActive" },
  { beat: 10, textKey: "p012.objective.b10.culvert" },
  { beat: [8, 10], when: { flags: ["portFar"] }, textKey: "p012.objective.port.traverse" },
  // 掷弹筒实时预警压过标称动作（B07—B09）
  { when: { flags: ["mortarDanger", "mortarNearOrigin", "mgStatusShown"] }, textKey: "p012.objective.mortar.fleeWithStatus" },
  { when: { flags: ["mortarDanger", "mortarNearOrigin"], notFlags: ["mgStatusShown"] }, textKey: "p012.objective.mortar.flee" },
  { when: { flags: ["mortarDanger", "mgStatusShown"], notFlags: ["mortarNearOrigin"] }, textKey: "p012.objective.mortar.movedWithStatus" },
  { when: { flags: ["mortarDanger"], notFlags: ["mortarNearOrigin", "mgStatusShown"] }, textKey: "p012.objective.mortar.moved" },
  { beat: 9, when: { flags: ["mortarWaveLocked"] }, textKey: "p012.objective.b09.centerPort" },
  // B11—B13 伤员、报名、道路遭遇
  { beat: 11, textKey: "p012.objective.b11.find" },
  { beat: 11, when: { facts: ["wounded"], notFlags: ["woundedDelivered"], carry: "wounded" }, textKey: "p012.objective.b11.dragging" },
  { beat: 11, when: { facts: ["wounded"], notFlags: ["woundedDelivered"], notCarry: "wounded" }, textKey: "p012.objective.b11.pickUp" },
  { beat: 11, when: { facts: ["wounded"], flags: ["woundedDelivered"] }, textKey: "p012.objective.b11.delivered" },
  { beat: 12, when: { facts: ["volunteer"] }, textKey: "p012.objective.b12.volunteered" },
  // 这三条在源码里是一条 if / else-if 链（先命中的赢）。表是"后命中的覆盖"，
  // 所以链要**倒着写**：放行 → 清除 → 停下，最后求值的那条正好是链里最先命中的。
  { beat: 13, when: { facts: ["roadContactClear"], notFacts: ["roadContactReleased"] }, textKey: "p012.objective.b13.release" },
  { beat: 13, when: { facts: ["roadContactHeld"], notFacts: ["roadContactClear"] }, textKey: "p012.objective.b13.clear" },
  { beat: 13, when: { facts: ["roadContactSeen"], notFacts: ["roadContactHeld"] }, textKey: "p012.objective.b13.hold" },
  // B15 检查担架伤员 → 墙后收队
  { beat: 15, when: { notFacts: ["roadWounded"], flags: ["roadWoundedInspect"] }, textKey: "p012.objective.b15.inspect" },
  { beat: 15, when: { notFacts: ["roadWounded"], notFlags: ["roadWoundedInspect"] }, textKey: "p012.objective.b15.follow" },
  { beat: 15, when: { facts: ["roadWounded"] }, textKey: "p012.objective.b15.regroup" },
  // B14 残屋侧绕
  { beat: 14, when: { flags: ["ambushThreat"] }, textKey: "p012.objective.threat" },
  { beat: 14, when: { flags: ["ambushMoveAdvice", "ambushProneApproach"] }, textKey: "p012.objective.b14.proneApproach" },
  { beat: 14, when: { flags: ["ambushMoveAdvice", "ambushProneSegment"], notFlags: ["ambushProneApproach"] }, textKey: "p012.objective.b14.covered" },
  { beat: 14, when: { flags: ["ambushMoveAdvice"], notFlags: ["ambushProneApproach", "ambushProneSegment"] }, textKey: "p012.objective.b14.sprintGap" },
  { beat: 14, when: { flags: ["ambushThreat"], notFlags: ["ambushMoveAdvice"] }, textKey: "p012.objective.b14.threatReload" },
  { beat: 14, when: { signals: ["P012RoadGunSilenced", "P012RoadCoverReached"] }, append: true, textKey: "p012.objective.b14.roadCovered" },
  { beat: 14, when: { signals: ["P012RoadGunSilenced"], notSignals: ["P012RoadCoverReached"] }, append: true, textKey: "p012.objective.b14.roadCleared" },
  { beat: 14, when: { flags: ["ambushEntry"] }, textKey: "p012.objective.b14.entry" },
  { beat: 14, when: { flags: ["ambushThreatFirst", "bleedingWithBandage"], notFlags: ["ambushEntry"] }, textKey: "p012.objective.b14.bandage" },
  { beat: 14, when: { flags: ["ambushThreatFirst"], notFlags: ["ambushEntry", "bleedingWithBandage"] }, textKey: "p012.objective.b14.clearBoth" },
  { beat: 14, when: { flags: ["ambushResolved"] }, textKey: "p012.objective.b14.resolved" },
  { beat: 14, when: { flags: ["ambushRejoin"], notFlags: ["ambushResolved"] }, textKey: "p012.objective.b14.rejoin" },
  // B16 观察航迹、选路
  { beat: 16, when: { notSignals: ["P012AircraftRailFire"] }, textKey: "p012.objective.b16.observe" },
  { beat: 16, when: { signals: ["P012AircraftRailFire"], notFlags: ["airRouteChosen"] }, textKey: "p012.objective.b16.choose" },
  { beat: 16, when: { signals: ["P012AircraftRailFire"], flags: ["airRouteChosen", "airRouteOpen"] }, textKey: "p012.objective.b16.open" },
  { beat: 16, when: { signals: ["P012AircraftRailFire"], flags: ["airRouteChosen"], notFlags: ["airRouteOpen"] }, textKey: "p012.objective.b16.ditch" },
  { beat: 16, when: { flags: ["airTail"] }, textKey: "p012.objective.b16.tail" },
  // B17 处理道路阻碍
  { beat: 17, when: { notSignals: ["P012AirObstacleCreated"], signals: ["P012CrowdFire"] }, textKey: "p012.objective.b17.afterFire" },
  { beat: 17, when: { notSignals: ["P012AirObstacleCreated", "P012CrowdFire"] }, textKey: "p012.objective.b17.turning" },
  { beat: 17, when: { signals: ["P012AirObstacleCreated"], carry: "wounded" }, textKey: "p012.objective.b17.carryCivilian" },
  { beat: 17, when: { signals: ["P012AirObstacleCreated"], notCarry: "wounded", notFacts: ["airObstacleResolved"] }, textKey: "p012.objective.b17.choose" },
  { beat: 17, when: { signals: ["P012AirObstacleCreated"], notCarry: "wounded", facts: ["airObstacleResolved", "airRescued"] }, textKey: "p012.objective.b17.rescued" },
  { beat: 17, when: { signals: ["P012AirObstacleCreated"], notCarry: "wounded", facts: ["airObstacleResolved"], notFacts: ["airRescued"] }, textKey: "p012.objective.b17.cartCleared" },
  // B18 / B19 接担架、避扫射
  { beat: 18, when: { carry: "stretcher" }, textKey: "p012.objective.b18.carry" },
  { beat: 19, textKey: "p012.objective.b19.strafe" },
  // B23 撤回
  { beat: 23, when: { flags: ["retreatArrived"] }, textKey: "p012.objective.b23.arrived" },
  { beat: 23, when: { notFlags: ["retreatArrived", "retreatBlockade"], notFacts: ["retreatSmokeDeployed"], flags: ["retreatGuideAtSmoke"] },
    textKey: "p012.objective.b23.smokeCover" },
  { beat: 23, when: { notFlags: ["retreatArrived"], notFacts: ["retreatSmokeDeployed"], flags: ["retreatGuideAtSmoke", "retreatBlockade"] },
    textKey: "p012.objective.b23.blockade" },
  { beat: 23, when: { notFlags: ["retreatArrived", "retreatGuideAtSmoke"], notFacts: ["retreatSmokeDeployed"] },
    textKey: "p012.objective.b23.followWest" },
  { beat: 23, when: { notFlags: ["retreatArrived"], facts: ["retreatSmokeDeployed", "retreatRecoveryRequired"] },
    textKey: "p012.objective.b23.recovery" },
  { beat: 23, when: { notFlags: ["retreatArrived"], facts: ["retreatSmokeDeployed"], notFacts: ["retreatRecoveryRequired"], flags: ["retreatCoverHold"] },
    textKey: "p012.objective.b23.cover" },
  { beat: 23, when: { notFlags: ["retreatArrived", "retreatCoverHold"], facts: ["retreatSmokeDeployed"], notFacts: ["retreatRecoveryRequired"], flags: ["retreatRejoining"] },
    textKey: "p012.objective.b23.rejoin" },
  { beat: 23, when: { notFlags: ["retreatArrived", "retreatCoverHold", "retreatRejoining"], facts: ["retreatSmokeDeployed"], notFacts: ["retreatRecoveryRequired"], flags: ["retreatLead"] },
    textKey: "p012.objective.b23.lead" },
  // B21 南路
  { beat: 21, when: { flags: ["southSupplyPhase"] }, textKey: "p012.objective.b21.advance" },
  { beat: 21, when: { notFlags: ["southSupplyPhase"] }, textKey: "p012.objective.b21.house" },
  { beat: 21, when: { notFlags: ["southSupplyPhase"], flags: ["lateThreat"] }, textKey: "p012.objective.threat" },
  { beat: 21, when: { notFlags: ["southSupplyPhase"], flags: ["lateThreat", "hasGrenades"] }, append: true, textKey: "p012.objective.b21.grenade" },
  // B20 守沟边
  { beat: 20, when: { flags: ["lateThreat"] }, textKey: "p012.objective.threat" },
  { beat: 20, when: { notFlags: ["lateThreat"] }, textKey: "p012.objective.b20.hold" },
  // B22 南侧截断线
  { beat: 22, when: { flags: ["southRouteBefore"] }, textKey: "p012.objective.b22.reenter" },
  { beat: 22, when: { notFlags: ["southRouteBefore", "columnAtSouthAssembly"] }, textKey: "p012.objective.b22.assemble" },
  { beat: 22, when: { notFlags: ["southRouteBefore"], flags: ["columnAtSouthAssembly"] }, textKey: "p012.objective.b22.verify" },
  { beat: 22, when: { flags: ["atBlockadeDecision"] }, textKey: "p012.objective.b22.blockade" },
  // 全局兜底（顺序即优先级：后面的压过前面的）
  { beat: [20, 21], when: { flags: ["lateThreatFight", "movingShooter"] }, append: true, textKey: "p012.objective.movingShooter" },
  { beat: [21, 22], when: { flags: ["southApproach"] }, textKey: "p012.objective.southApproach" },
  { when: { flags: ["resupply"] }, textKey: "p012.objective.resupply" },
  { beat: [14, 20, 21], when: { flags: ["scavenge", "weaponNearby"] }, textKey: "p012.objective.scavenge.weapon" },
  { beat: [14, 20, 21], when: { flags: ["scavenge", "scavengeGrenades"], notFlags: ["weaponNearby"] }, append: true, textKey: "p012.objective.scavenge.grenades" },
  { beat: [14, 20, 21], when: { flags: ["scavenge"], notFlags: ["weaponNearby", "scavengeGrenades"] }, append: true, textKey: "p012.objective.scavenge.none" },
  { when: { flags: ["frontlineApproach"] }, textKey: "p012.objective.frontlineApproach" },
].map(Object.freeze));

// ---------------------------------------------------------------------------
// 屏幕导航牌
// ---------------------------------------------------------------------------
/**
 * 同一台解释器、同一套谓词。第一条是兜底（没有 when 就恒真），后面按拍覆盖。
 * `goal.targetLabel` 那一层留在 Guidance 代码里 —— 它不是「按情形选一句」，
 * 而是「目标点自己带了名字就用它」。
 */
export const P012_GUIDANCE_NAMES = Object.freeze([
  { textKey: "p012.guide.luoNorth" },
  // B05 搬弹药那一段自己一套
  { beat: 5, when: { facts: ["ammo"] }, textKey: "p012.guide.observePost" },
  { beat: 5, when: { notFacts: ["ammo"], notCarry: "ammoCrate" }, textKey: "p012.guide.ammoBox" },
  { beat: 5, when: { notFacts: ["ammo"], carry: "ammoCrate", flags: ["guideAtAmmoDrop"] }, textKey: "p012.guide.ammoDrop" },
  { beat: 5, when: { notFacts: ["ammo"], carry: "ammoCrate", notFlags: ["guideAtAmmoDrop"] }, textKey: "p012.guide.ammoDropTurn" },
  // 其余各拍
  { beat: 1, when: { facts: ["issuedAmmo"] }, textKey: "p012.guide.luoAssemble" },
  { beat: 1, when: { facts: ["weapon"], notFacts: ["issuedAmmo"] }, textKey: "p012.guide.ammoIssue" },
  { beat: 1, when: { notFacts: ["weapon", "issuedAmmo"] }, textKey: "p012.guide.weaponIssue" },
  { beat: 6, textKey: "p012.guide.b06" },
  { beat: 7, textKey: "p012.guide.b07" },
  { beat: 8, textKey: "p012.guide.b08" },
  { beat: 9, textKey: "p012.guide.b09" },
  { beat: 10, textKey: "p012.guide.b10" },
  { beat: 12, textKey: "p012.guide.b12" },
  { beat: 13, when: { facts: ["roadContactClear"] }, textKey: "p012.guide.b13.escort" },
  { beat: 13, when: { notFacts: ["roadContactClear"] }, textKey: "p012.guide.b13.contact" },
  { beat: 14, when: { flags: ["ambushResolved"] }, textKey: "p012.guide.columnRejoin" },
  { beat: 14, when: { notFlags: ["ambushResolved"] }, textKey: "p012.guide.b14.ambush" },
  { beat: 15, when: { facts: ["roadWounded"] }, textKey: "p012.guide.b15.regroup" },
  { beat: 15, when: { notFacts: ["roadWounded"] }, textKey: "p012.guide.b15.wounded" },
  { beat: 16, when: { notFlags: ["airRouteChosen"] }, textKey: "p012.guide.b16.choose" },
  { beat: 16, when: { flags: ["airRouteChosen"] }, textKey: "p012.guide.b16.follow" },
  { beat: 17, when: { facts: ["airObstacleResolved"] }, textKey: "p012.guide.columnRejoin" },
  { beat: 17, when: { notFacts: ["airObstacleResolved"], carry: "wounded" }, textKey: "p012.guide.b17.cover" },
  { beat: 17, when: { notFacts: ["airObstacleResolved"], notCarry: "wounded" }, textKey: "p012.guide.b17.obstacle" },
  { beat: 18, when: { carry: "stretcher" }, textKey: "p012.guide.b18.carry" },
  { beat: 18, when: { notCarry: "stretcher" }, textKey: "p012.guide.b18.grab" },
  { beat: 19, textKey: "p012.guide.b19" },
  { beat: 20, textKey: "p012.guide.b20" },
  { beat: 21, textKey: "p012.guide.b21" },
  { beat: 22, textKey: "p012.guide.b22" },
  { beat: 23, textKey: "p012.guide.b23" },
  { beat: 24, when: { carry: "stretcher" }, textKey: "p012.guide.b24.shelter" },
  { beat: 24, when: { notCarry: "stretcher" }, textKey: "p012.guide.b24.grab" },
  // 前沿弹药箱压过按拍选的名字；伤员那一段又压过它（与原来的判断顺序一致）
  { when: { flags: ["frontlineAmmoPoint"] }, textKey: "p012.guide.frontlineAmmo" },
  { beat: 11, when: { flags: ["woundedDelivered"] }, textKey: "p012.guide.b11.delivered" },
  { beat: 11, when: { notFlags: ["woundedDelivered"], carry: "wounded" }, textKey: "p012.guide.b11.carrying" },
  { beat: 11, when: { notFlags: ["woundedDelivered"], notCarry: "wounded" }, textKey: "p012.guide.b11.wounded" },
].map(Object.freeze));
