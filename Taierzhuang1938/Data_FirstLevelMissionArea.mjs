// 第一关任务走廊（S 包，口径 docs/Data_FirstLevelGuidance20260928.md §3.3）。纯数据、零 three、零 import。
//
// 每个内部步骤（Data_FirstLevelMissionStages 的 27 步）一条走廊：
//   routes   路线胶囊 { key, halfWidthM, from?, to? } —— key 是 MISSION_ROUTES 的键（含 MISSION_STAGE_ROUTES /
//            MISSION_REAR_ROUTES，05 的取弹路 bundle / 攻击支路 attack / 返程 orders 也在里面），from / to 取一段；
//   discs    圆 { anchor | x,z, r } —— anchor 是 MISSION_ANCHORS 的键；
//   polygons 多边形 { id, points } —— 战斗段把整个战场框进去；
//   exempt   整步不判（受控段：受困、坐车、抬担架扑沟、死亡场、夜行军）；
//   exemptUntil 某条事实落下之前不判（02 班长把人拖回洞口、还权之前）。
// 几何解析与判定在 Script_MissionAreaGuard.mjs；计时数值在 Data_Tuning_MissionArea.mjs。
//
// 这是空气墙之外的最后一道兜底：路 / 挡 / 光 / 人做到位时玩家碰不到它。所以一律宁松勿紧 ——
// 现有连续驾驭脚本（Script_FirstLevelCampaign*）走过的每一个点、每一步的契约路线、锚点、摆位都必须在里面
// （Script_MissionAreaGuardTest 逐点核对），走廊只拦「离开战场」，不拦「走错了一条沟」。
//
// 坐标：X 东、Z 南、米。

/**
 * 步行段胶囊半宽 40 m。定法：同一关已有的「返回行动路线」提示在离本步路线 36 m 时亮
 * （Data_Tuning_FirstLevel.MISSION_RETURN.corridorM），这一层必须比它宽，玩家才会先看到方向提示、
 * 走得更远才出倒计时；再加 4 m 给躲雷、绕掩体的横移。工作单给的区间是 25–40 m，取上限。
 */
export const MISSION_AREA_WALK_M = 40;
/** 锚点圆半径：集结处、掩蔽部、接收院门这些「停下来的地方」四周 30 m。 */
export const MISSION_AREA_STOP_M = 30;
const W = MISSION_AREA_WALK_M, R = MISSION_AREA_STOP_M;

const Poly = (id, points) => Object.freeze({ id, points: Object.freeze(points.map(([x, z]) => Object.freeze({ x, z }))) });
/**
 * 战斗段的整个战场。四个框各自的边：
 * - 前沿（03–06）：西 x −62（左枪位 −34 以西 28 m，西面开阔地不算战场）、东 x 80（战车路 Bend/BendExit 60–64
 *   与南路 58.9–63 以东 16 m；再往东是日军的台地公路）、北 z −208（日军最北一道跃进线 −193 以北 15 m，
 *   跃进壕 −222 不算）、南 z −88（集结处 −95…−106 与 southWalk 第一段 −92 以南）。
 * - 村落（08–10）：x 30…100、z −40…48（工作单 B 区的界：村西 x<30、村东 x>100；北接 southWalk 尾、
 *   南到绕回巷 z 41.5 以南）。
 * - 桥头接运（12–14）：x 28…114、z 36…146（西沟 x 28 起；接运场东 x>110 以外是空袭追兵的来处；
 *   北边把 12 追兵出生的绕回短巷 z 38.8–42.6 框进来；南到路桥北半 z 146，河槽本身过不去）。
 * - 接收院（15C–18）：接收院 x −41…1、z 218…252 四面各放 12–15 m，把夹道出口、院门、后门外都框进来。
 */
const FRONT_FIELD = Poly("FrontField", [[-62, -208], [80, -208], [80, -88], [-62, -88]]);
const VILLAGE = Poly("Village", [[30, -40], [100, -40], [100, 48], [30, 48]]);
const TRANSFER_YARD = Poly("TransferYard", [[28, 36], [114, 36], [114, 146], [28, 146]]);
const RECEPTION_YARD = Poly("ReceptionYard", [[-56, 206], [24, 206], [24, 264], [-56, 264]]);

const Area = (spec) => Object.freeze({
  routes: Object.freeze((spec.routes || []).map((route) => Object.freeze({ halfWidthM: W, ...route }))),
  discs: Object.freeze((spec.discs || []).map((disc) => Object.freeze({ r: R, ...disc }))),
  polygons: Object.freeze(spec.polygons || []),
  ...(spec.exempt ? { exempt: true } : {}),
  ...(spec.exemptUntil ? { exemptUntil: spec.exemptUntil } : {}),
  note: spec.note || "",
});
const Exempt = (note) => Area({ exempt: true, note });

/** 内部步骤 → 走廊。键必须正好是 MISSION_STAGES 的 27 个可玩步骤（不含终止哨兵 Complete）。 */
export const MISSION_AREA_STEPS = Object.freeze({
  // --- A 前沿 01–07 -----------------------------------------------------------------
  Trapped: Exempt("01 受困：压在塌木下，受控接管 trapped"),
  BunkerRescue: Area({ exemptUntil: "luoRescueComplete",
    routes: [{ key: "rearTrench" }], discs: [{ anchor: "bunker" }],
    note: "02 班长把人拖回洞口塌土后（luoRescueComplete）才判；之后在洞口一带捡枪" }),
  RearTrench: Area({ routes: [{ key: "rearTrench" }], discs: [{ anchor: "bunker" }, { anchor: "collection" }],
    note: "02 洞口 → 折角 → 后交通壕 → 背坡集结处" }),
  Support: Area({ polygons: [FRONT_FIELD], routes: [{ key: "support" }], discs: [{ anchor: "collection" }],
    note: "03 夺取右侧阵位：整个前沿战场" }),
  MachineGun: Area({ polygons: [FRONT_FIELD], routes: [{ key: "rightRear" }],
    note: "04 阵位与后墙岔口：整个前沿战场" }),
  Tank: Area({ polygons: [FRONT_FIELD], routes: [{ key: "bundle" }, { key: "attack" }, { key: "orders" }],
    note: "05 取弹去程 / 返程、攻击支路、退回集结处：整个前沿战场" }),
  Orders: Area({ polygons: [FRONT_FIELD], routes: [{ key: "ordersRejoin" }, { key: "collectionReturn" }], discs: [{ anchor: "collection" }],
    note: "06 回集结处接令：整个前沿战场（车刚停时人可能还在北头的侧沟里）" }),
  South: Area({ routes: [{ key: "southWalk" }], discs: [{ anchor: "collection" }, { anchor: "village" }],
    note: "07 沿沟南行到村北口" }),
  // --- B 村落 08–10 -----------------------------------------------------------------
  Village: Area({ polygons: [VILLAGE], routes: [{ key: "southWalk", from: 5 }],
    note: "08 主街受阻、担架停进遮挡、右手灶屋：村子北半与 southWalk 末段" }),
  Melee: Area({ polygons: [VILLAGE], note: "09 灶屋—过道—连屋—侧间" }),
  Courtyard: Area({ polygons: [VILLAGE], routes: [{ key: "courtyardBypass" }],
    note: "10 窗口机枪、院门、绕回巷、院门外追兵" }),
  // --- C 桥头接运 11–14 -------------------------------------------------------------
  // village 的末点是装载区排队口 (74,111)；胶囊只取到村口 (76,85)，再往南由接运场那个圆接住 ——
  // 整条取到 111 的话 40 m 半宽会把路桥北半也框进来。
  TransferApproach: Area({ routes: [{ key: "village", from: 4, to: 13 }], discs: [{ anchor: "gate" }, { anchor: "transfer" }],
    note: "11 院门外 → 绕回巷 → 主街南段 → 门楼 → 接运场" }),
  Transfer: Area({ polygons: [TRANSFER_YARD], note: "12 村口低墙守线、东巷口机枪、装载区" }),
  CartRide: Exempt("12 坐车：受控接管 cartRide"),
  AirFirst: Area({ polygons: [TRANSFER_YARD], note: "13 空袭：下车找掩体（车路两侧、装载区、下沟口）" }),
  Carry: Exempt("14 抬担架往西沟口：双手占着担架（抬担架一律不判）"),
  Dive: Exempt("14 扑沟：受控接管 dive"),
  Rescue: Area({ polygons: [TRANSFER_YARD], discs: [{ anchor: "ditch" }], note: "14 沟里断后，掩护幺娃拖回老周" }),
  // --- D 桥南 15–18 -----------------------------------------------------------------
  Regroup: Area({ routes: [{ key: "evacuation", to: 6 }], discs: [{ anchor: "ditch" }, { anchor: "retreatA" }],
    note: "15A 西沟收拢：沟口、车边问赶车人、收拢点" }),
  WallPath: Area({ routes: [{ key: "evacuation", from: 1 }, { key: "wallPath" }],
    note: "15B 沟尾爬上来 → 靠院墙夹道（接过担架之后不判）" }),
  ReceptionGate: Area({ polygons: [RECEPTION_YARD], routes: [{ key: "wallPath", from: 3 }], discs: [{ anchor: "receptionGate" }],
    note: "15C 夹道出口 → 院门盘问 → 入院" }),
  Handover: Area({ polygons: [RECEPTION_YARD], discs: [{ anchor: "receptionGate" }],
    note: "16 抬进厢房、放到军医旁（抬着的时候不判）" }),
  Death: Exempt("17 确认老周死亡：受控接管 death"),
  BridgeOrders: Area({ polygons: [RECEPTION_YARD], routes: [{ key: "toBridge" }],
    note: "18 接令：人在院里 / 厢房，令一下就沿 toBridge 出后门" }),
  BridgeCover: Area({ polygons: [RECEPTION_YARD], routes: [{ key: "toBridge" }],
    discs: [{ anchor: "bridgeCover", r: 35 }, { anchor: "railBridge", r: 22 }],
    note: "18 南岸射位与铁路桥桥面（北岸土坎 z≈80 是敌人的，不在里面；railBridge 盘是被炸那一孔的桥面）" }),
  BridgeWithdraw: Area({ routes: [{ key: "bridgeWithdraw" }, { key: "marchOut" }], discs: [{ anchor: "bridgeCover" }, { anchor: "blastSafe" }],
    note: "18 撤出爆破区到安全区，再随队往南" }),
  NightMarch: Exempt("18 夜行军：先随队走完 marchOut、黑屏里换到夜景、随队进北门"),
});
