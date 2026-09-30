// ===========================================================================
// Data_FirstLevelBridgeFarBank.mjs —— 18 北沙河对岸的日军步坦部队（纯数据，零 three）
//
// 用户 2026-09-30 原话：「在最后撤离炸桥的过程中，河对岸还是有比较大量的步坦部队的，只是暂时没有桥过不来
// （参考 COD5 第一关的结尾），然后脱离战场后才黑幕进入下一幕。」口径、时间线与数值出处：
// docs/Data_FirstLevelBridgeFarBank.md。数值在 Data_Tuning_FirstLevelEnd.END_TUNING.farBank，这里只有摆位与名册。
//
// 三层兵力（同屏日军总数 ≤ actorPool 的 ija:48）：
//   real      真战斗 AI 8 个 —— BridgeWithdraw 才放出，会还击、会被打死，**不进** r.enemies（FireWindows 每拍会重置
//             r.enemies 里的开火开关；Threatens / FireBroken / BlastZoneOccupant 也不该看见他们），
//             开火权由运行时按距离分档（missionFireHold / missionFireSuppressOnly）；
//   scripted  脚本兵 —— scriptedNoncombatant，只走位 + 环境射击（ambientFirePoints，命中恒 false、不进 TTK 账）；
//   tanks     3 辆傀儡八九式（Type89Tank 多开）—— 只动、转炮塔、炮击安全落点与机枪曳光，不可摧毁。
// 另有 bridgeNorth 那 4 个（Data_FirstLevelMission.MISSION_ENCOUNTERS）BridgeCover 起就在，本表不动。
//
// 摆位一律写成「离北岸岸沿往北 back 米」，岸沿 z 由 RiverReachAt 取（河拓宽后是 z 90）：
// R1a 若再挪北岸，这里跟着走。x 范围留给对岸的是 −100…−40（R1a 的北岸西侧村子在 x −140…−100）。
// 桥轴 x −77 一带 ±6 m 留空：尾队沿 bridgeCrossing 过来，冲桥组也走这条道。
// 2026-09-30 R3 浮桥取代铁路桥：桥面只有 2.8 m 宽（x ±1.4），冲桥组 / 桥头人堆 / 前锋的两列车道从 ±1.75 收到 ±0.65；
// 桥面在被炸段（z 120.5…147.5，船 3…11）之上：冲桥组冲到它的北半（z 123…129），桥头人堆在被炸段以北的北截上（z 112…119，起爆杀伤圈之外）；
// 浮桥载不了战车，原来开上桥面的那辆改成停在北岸浮桥头西侧、土坎以北的一辆普通车（起爆后仍停在那儿，炮口对着南岸）。
// ===========================================================================
import { MISSION_NORTH_RIVER, MISSION_PONTOON_BRIDGE, MISSION_STAGE_ANCHORS as S, RiverReachAt, RiverWaterAt } from "./Data_FirstLevelMissionTopology.mjs";

const freeze = Object.freeze;

/** 北岸岸沿（自然地面）的 z：河槽由北岸陡坡开始下切的位置。拓宽段外退回原断面的北坡脚。 */
export function FarBankShoreZ(x) {
  const reach = RiverReachAt(x, MISSION_NORTH_RIVER);
  if (reach) return reach.crestZ;
  const river = MISSION_NORTH_RIVER;
  return river.z - river.floorHalfW - river.bankRun;
}
/** 岸沿往北 back 米的点。 */
export const FarBankPoint = (x, back) => freeze({ x, z: FarBankShoreZ(x) - back });

const Unit = (id, x, back, extra = {}) => freeze({ id, ...FarBankPoint(x, back), ...extra });
/** 绝对坐标的单位（北岸坡地的台面是绝对 z，不随岸线起伏）。 */
const UnitAt = (id, x, z, extra = {}) => freeze({ id, x, z, ...extra });

// ---------------------------------------------------------------------------
// 1. 真战斗 AI（8）：BridgeWithdraw 放出，从北面走到射位
//    机枪手（Type11）是 90–100 m 上真正能开火的人：ENGAGE.supportM 95（步枪手 defaultM 74，超了只 WATCH）。
//    两侧各一挺，另六人（三八式）站在土坎后面，玩家走近到 74 m 内才会真打。
// ---------------------------------------------------------------------------
export const FAR_BANK_REAL = freeze([
  Unit("FarBankRealWestGun", -102, 9, { weapon: "Type11", role: "gunner" }),
  // R2c：两名步枪手上了第一级台地顶沿（离射位 ≈ 105 m，超出步枪手的 defaultM 74，只 WATCH；机枪手仍在岸线上 90 m 内）。
  UnitAt("FarBankRealWest0", -101, 71, { weapon: "Type38" }),
  UnitAt("FarBankRealWest1", -113, 70.5, { weapon: "Type38" }),
  Unit("FarBankRealEast0", -68, 12, { weapon: "Type38" }),
  Unit("FarBankRealEast1", -62, 11, { weapon: "Type38" }),
  Unit("FarBankRealEastGun", -57, 10, { weapon: "Type11", role: "gunner" }),
  Unit("FarBankRealEast2", -52, 13, { weapon: "Type38" }),
  Unit("FarBankRealOfficer", -65, 16, { weapon: "Type38", role: "officer" }),
]);
/** 真 AI 走进来的出发点：射位往北 spawnBackM 米（岸沿以北很远，玩家看不见）。 */
export const FAR_BANK_REAL_SPAWN_BACK_M = 60;

// ---------------------------------------------------------------------------
// 2. 脚本兵
// ---------------------------------------------------------------------------
// 岸线射击（第一拨 12）：贴着岸沿一线散开，前后错落（back 2–7）。桥轴两侧各 6 m 留空。
export const FAR_BANK_SHORE_A = freeze([
  Unit("FarBankShoreA0", -108, 5), Unit("FarBankShoreA1", -103, 3), Unit("FarBankShoreA2", -98, 7, { weapon: "Type11" }),
  Unit("FarBankShoreA3", -94, 4), Unit("FarBankShoreA4", -89, 6),
  Unit("FarBankShoreA5", -71, 4), Unit("FarBankShoreA6", -67, 6), Unit("FarBankShoreA7", -63, 3, { weapon: "Type11" }),
  Unit("FarBankShoreA8", -59, 5), Unit("FarBankShoreA9", -55, 4), Unit("FarBankShoreA10", -51, 6, { weapon: "Type11" }),
  Unit("FarBankShoreA11", -47, 3),
]);
// 岸线补拨（第二拨 6）：BridgeWithdraw 起涌到岸边，站在第一拨身后。
export const FAR_BANK_SHORE_B = freeze([
  Unit("FarBankShoreB0", -112, 9), Unit("FarBankShoreB1", -97, 10), Unit("FarBankShoreB2", -92, 2),
  Unit("FarBankShoreB3", -68, 10), Unit("FarBankShoreB4", -47.5, 9), Unit("FarBankShoreB5", -43, 5),
]);
// 待命兵（10）：BridgeCover 起就在岸线后面二三十米的空地上，来回踱两个点（人堆的纵深）。前六个靠桥轴，
// BridgeWithdraw 起就是冲桥组（FAR_BANK_RUSH.assign）；后四个更深，一直踱到黑屏。
export const FAR_BANK_STANDBY = freeze([
  Unit("FarBankStandby0", -92, 26, { to: FarBankPoint(-88, 31) }), Unit("FarBankStandby1", -84, 29, { to: FarBankPoint(-89, 25) }),
  Unit("FarBankStandby2", -82, 25, { to: FarBankPoint(-84, 31) }), Unit("FarBankStandby3", -72, 27, { to: FarBankPoint(-69, 32) }),
  Unit("FarBankStandby4", -68, 30, { to: FarBankPoint(-66, 25) }), Unit("FarBankStandby5", -64, 26, { to: FarBankPoint(-70, 33) }),
  Unit("FarBankStandby6", -98, 46, { to: FarBankPoint(-102, 52) }), Unit("FarBankStandby7", -60, 44, { to: FarBankPoint(-56, 50) }),
  Unit("FarBankStandby8", -104, 56, { to: FarBankPoint(-98, 50) }), Unit("FarBankStandby9", -66, 50, { to: FarBankPoint(-70, 44) }),
]);
// 前锋（2）：bridgeFireBroken 之后（尾队正在过桥）岸线上靠桥轴的两个人（from = 岸线第一拨的 id）冲上桥北段，
// 趴在北桥台后一小段甲板上朝尾队开火；尾队过完桥（rearColumnCrossed）就退回岸边。
export const FAR_BANK_VANGUARD = freeze([
  freeze({ from: "FarBankShoreA4", post: freeze({ x: -77.65, z: 99 }) }),
  freeze({ from: "FarBankShoreA5", post: freeze({ x: -76.35, z: 103.5 }) }),
]);
// 冲桥组（6）：BridgeWithdraw 起，靠桥轴的六个待命兵（assign 是待命兵下标）rushDelayS 后沿桥轴冲到被炸段
// （z 120.5…147.5，中心 134）的北半趴下开火。起爆前必须到位（运行时 ReadyForBlast 拦着起爆器），
// 起爆时被炸死抛起。两列各三人，前后错开；桥面 2.8 m 宽，两列各占一侧（±0.65）。
export const FAR_BANK_RUSH = freeze({
  assign: freeze([0, 1, 2, 3, 4, 5]),
  lanes: freeze([-77.65, -76.35]),
  // 每一对的终点 z（被炸段 z 120.5…147.5，中心 134；北半 120.5…134）：离起爆中心 5.6–9.6 m。
  endZ: freeze([124.4, 126.4, 128.4]),
  // 上桥前的集结点：北栈终点（浮桥北头 z 88.2，岸沿 z 90）以北一点。
  deckStartZ: 86.5,
});
// 桥头人堆（8）：冲桥组上桥之后，第二拨的六个补拨兵与两个深处的待命兵（from = 名册 id）也涌上桥面北截，
// 单膝跪在桥面上朝南开火（离玩家 60–90 m，比岸线上的人近一大截，挤在窄桥面上读得出「一大群」）。z 都在起爆杀伤圈
// （离中心 13 m，z ≤ 121）之外：起爆时趴下，然后退回岸边。列：−77.65 / −76.35（与冲桥组同一对车道），每两人一排。
export const FAR_BANK_CROWD = freeze([
  freeze({ from: "FarBankShoreB0", lane: -77.65, z: 118.8 }), freeze({ from: "FarBankShoreB1", lane: -76.35, z: 118.8 }),
  freeze({ from: "FarBankShoreB2", lane: -77.65, z: 116.6 }), freeze({ from: "FarBankShoreB3", lane: -76.35, z: 116.6 }),
  freeze({ from: "FarBankShoreB4", lane: -77.65, z: 114.4 }), freeze({ from: "FarBankShoreB5", lane: -76.35, z: 114.4 }),
  freeze({ from: "FarBankStandby6", lane: -77.65, z: 112.2 }), freeze({ from: "FarBankStandby7", lane: -76.35, z: 112.2 }),
]);
/** 第 i 个冲桥兵的列与终点 z。 */
export const FarBankRushSlot = (i) => freeze({ lane: FAR_BANK_RUSH.lanes[i % 2], endZ: FAR_BANK_RUSH.endZ[Math.floor(i / 2)] });

// ---------------------------------------------------------------------------
// 3. 环境射击授权点（南岸，全部 ≥ 12 m 远离爆破组、班组射位与撤出线）
//    脚本兵朝这些点打曳光（命中恒 false）；点由「谁打哪几个」的分组引用。h = 离地高度，r = 弹着散布半径。
// ---------------------------------------------------------------------------
const FP = (x, z, h, r) => freeze({ x, z, h, r });
export const FAR_BANK_FIRE_POINTS = freeze({
  // 南岸沙滩与堤前（z 158–170）：曳光打进沙里、溅一蓬土
  beachW0: FP(-104, 162, 0.4, 2.6), beachW1: FP(-94, 160.5, 0.4, 2.2), beachW2: FP(-101, 158.4, 0.4, 2.0),
  beachE0: FP(-66, 164.5, 0.4, 2.0), beachE1: FP(-58, 163, 0.4, 2.2), beachE2: FP(-50, 161.5, 0.4, 2.6),
  // 堤顶与堤后田地（z 168–176），离射位 ≥ 12 m
  dikeW0: FP(-118, 171.5, 0.6, 2.4), dikeW1: FP(-124, 172, 0.6, 2.2),
  dikeE0: FP(-56, 173.5, 0.6, 2.2), dikeE1: FP(-46, 171.5, 0.6, 2.4),
  // 桥面北段与被炸段中心（z 100–134）：打的是过桥的尾队与浮桥的木板 / 船帮（surface 是木，会迸木屑）
  deckN0: FP(-77, 102, -0.3, 1.2), deckN1: FP(-77, 114, -0.3, 1.2), deckN2: FP(-77, 126, -0.3, 1.2),
  pier2: FP(-77, 134, -0.4, 1.2),
  // 桥轴南截（船 0…2 之上，z 147.5…155）：冲桥组趴在被炸段北半，顺桥轴往南打的点（离桥头爆破手 ≥ 12 m）
  axisS: FP(-76, 152, 0.6, 1.6), axisS2: FP(-78, 148.6, 0.6, 1.6),
  // 河对岸的两片田（离玩家 ≥ 30 m 的空地，做「乱打」的远背景）
  fieldW: FP(-124, 184, 0.4, 4.0), fieldE: FP(-36, 186, 0.4, 4.0),
});
/** 每个脚本兵按他站的一侧领一组点（PickAmbientFire 在朝向锥内挑，挑不到再放宽）。 */
export const FAR_BANK_FIRE_LISTS = freeze({
  west: freeze(["beachW0", "beachW1", "beachW2", "dikeW0", "dikeW1", "deckN0", "deckN1", "fieldW"]),
  east: freeze(["beachE0", "beachE1", "beachE2", "dikeE0", "dikeE1", "deckN1", "deckN2", "fieldE"]),
  deck: freeze(["deckN0", "deckN1", "deckN2", "pier2", "beachW2", "beachE0"]),
  // 冲桥组（趴在桥面上）：顺桥轴打南端，加两边的沙滩
  // 桥面上的战车（在桁架里，只有桥轴这条缝看得见南岸）：只朝桥轴南端的点打
  axis: freeze(["axisS", "axisS2"]),
  rush: freeze(["axisS", "beachW2", "beachE0", "beachW1", "beachE1", "dikeW1", "dikeE0"]),
});

// ---------------------------------------------------------------------------
// 4. 傀儡战车（3）：从北面沿各自的 x 直线开来（tankStartBackM 米外），停在岸边；BridgeWithdraw 推到 pushBack。
//    路线离实心体块 ≥ 3.5 m、地面起伏 < 1 m（Script_FirstLevelFarBankTest 量）。
// ---------------------------------------------------------------------------
// 2026-09-30 R2b 规模感：战车挪到看得见的地方。
//   · Bridge：沿桥西侧的路堤（x −82.5，桥轴以西 5.5 m）开下来，BridgeCover 起等在桥头以北的空地上（z 68，桥西边 x −82.5 处：从射位看
//     在西土坎上方露出炮塔）—— **不能先上桥面**：我方尾队（bridgeCrossing 沿桥轴 x −77）要从北岸过桥，桥面上的车会把他们堵死（整趟驾驶实测）。
//     尾队过完桥（rearColumnCrossed）、桥头没有己方了，才沿桥轴开上桥中孔的桥面（z 122，SpanMid，离射位 ≈ 55 m），
//     起爆之后等桥面上没有己方 blastAdvanceWaitS 秒再往前开到断口北侧（blastPostZ，SpanMid 靠 2 号墩一端），炮口对着南岸。
//     桥面两侧各留 ≥ 0.4 m 给冲桥组（车道 ±1.75）；桥面高度由 view 的 groundAt 给（桥面 deckTopY，不是河床）。
//   · West / East：岸边空地上一字展开，炮口对着南岸。West 在西土坎（x −92…−82）以西，East 在东土坎（x −72…−60）以东，
//     都在岸沿以北 6 m，不需要穿土坎：三辆都先沿桥轴路堤开下来，在 z≈70 处分头（via 是 [x, 岸沿以北 back 米]）。
//     BridgeNorthRidge 两段土坎（z 81.6…82.8，高 1.6 m）在这两处以外，桥轴缺口 x −82…−72。
// startX：出发点的 x（都从桥轴上的路堤出发，避开 RearFarm 院子 x −72.8…−59.2 与前沿壕沟尾巴 x −58…−30）。
// 2026-09-30 R2c 北岸坡地（docs/Data_FirstLevelBridgeFarBank.md §11）：另两辆车从岸边空地挪上坡地的台面，炮口朝下对着南岸。
//   · FarBankTankTerraceLow：第一级台地（NorthTerrace1，顶面 z≈69.5 以北）顶沿的平台 (−108, 66.8)，BridgeWithdraw 起下压到台沿 (−108, 70.4)；
//   · FarBankTankTerraceHigh：第二级台地（顶面 z≈55）顶沿的平台 (−127, 53.4)，下压到 (−127, 56.6)。
//   这两辆车不按「离岸沿 back 米」摆（台地是绝对坐标，岸沿随 R1a 的岸线起伏）：z / pushZ 是绝对 z，via 的第二个数是绝对 z（viaAbs）。
//   都从桥轴路堤（startX −77）出发，经 via 一个点（−77, 60 / 53.4）再斜 / 横着开到停位：一路只越过坡地东端那道 ≤ 1.6 m 的缓坡，
//   避开 x −86 的电线杆（z 40、68）。
export const FAR_BANK_TANKS = freeze([
  // R3：浮桥载不了战车 —— 这辆不再开上桥面，停在北岸浮桥头东侧、东土坎（x −72…−60，z 82.2）以北的平地上（那一带是 MISSION_TERRAIN 的
  // 场坪 pad (−71,74)，地面平），炮口朝南；起爆之后仍停在那儿。离桥轴 11 m，不挡尾队过桥。和台地上的两辆一样走绝对 z（z / pushZ / viaAbs）。
  freeze({ id: "FarBankTankBridge", kind: "bank", x: -66, z: 73.5, pushZ: 76.5, startX: -77, enter: "BridgeCover", delayKey: 0, viaAbs: true,
    via: freeze([freeze([-77, 62]), freeze([-66, 64.5])]) }),
  freeze({ id: "FarBankTankTerraceLow", kind: "terrace", x: -108, z: 66.8, pushZ: 70.4, startX: -77, enter: "BridgeCover", delayKey: 1, viaAbs: true,
    via: freeze([freeze([-77, 60])]) }),
  freeze({ id: "FarBankTankTerraceHigh", kind: "terrace", x: -127, z: 53.4, pushZ: 56.6, startX: -77, enter: "BridgeCover", delayKey: 2, viaAbs: true,
    via: freeze([freeze([-77, 62]), freeze([-127, 62])]) }),
]);
/** 战车的停位 z / 下压后的 z / 途经点 z：台地上的车用绝对 z，其余仍是「离岸沿往北 back 米」。 */
export const FarBankTankPostZ = (spec) => spec.z ?? FarBankShoreZ(spec.x) - spec.backM;
export const FarBankTankPushZ = (spec) => spec.pushZ ?? FarBankShoreZ(spec.x) - spec.pushBackM;
export const FarBankTankVia = (spec) => (spec.via || []).map(([x, v]) => ({ x, z: spec.viaAbs ? v : FarBankShoreZ(x) - v }));

/** 炮击安全落点候选（南岸空地与沙滩，离桥头 12 m 以外）。运行时再按当下的玩家 / 己方位置过滤。 */
export const FAR_BANK_SHELL_SPOTS = freeze([
  // 西侧田地
  FP(-104, 176), FP(-112, 186), FP(-118, 168), FP(-108, 200), FP(-98, 214), FP(-120, 196), FP(-126, 178),
  // 东侧田地
  FP(-56, 182), FP(-48, 190), FP(-42, 172), FP(-52, 206), FP(-40, 200), FP(-36, 182), FP(-32, 192),
  // 沙滩与河边
  FP(-100, 163.5), FP(-56, 163.5), FP(-116, 164), FP(-38, 164),
].map((p) => freeze({ x: p.x, z: p.z })));

// ---------------------------------------------------------------------------
// 5. 补员出生带：北面很远（岸沿以北 100–130 m，离桥头 150 m 外），玩家看不见；补员走进来补岸线的缺口。
// ---------------------------------------------------------------------------
export const FAR_BANK_REINFORCE = freeze({
  xs: freeze([-104, -96, -88, -64, -58, -52, -46]),
  backM: freeze([104, 112, 120, 108, 116, 124, 130]),
});

/** 撤离走廊：黑屏条件与炮击落点的「路线」都用这一串（玩家要走的路：toBridge / bridgeWithdraw / marchOut）。 */
export const FAR_BANK_PLAYER_ROUTE_KEYS = freeze(["toBridge", "bridgeWithdraw", "marchOut"]);

/** 浮桥被炸段的中心与冲桥终点的几何（起爆杀伤按这个算）。 */
export const FAR_BANK_BLAST = freeze({
  centre: freeze({ x: MISSION_PONTOON_BRIDGE.x, z: MISSION_PONTOON_BRIDGE.blast.centerZ }),
  spanZ: freeze([MISSION_PONTOON_BRIDGE.spans[1].z1, MISSION_PONTOON_BRIDGE.spans[1].z0]),   // 120.5…147.5
  bridgeAxisX: MISSION_PONTOON_BRIDGE.x,
  /** 桥断了之后对岸单位允许停的最南 z：岸沿以南 0.5 m 以内（站在岸边隔河射击）。 */
  bankStopSouthM: 0.5,
  /** 桥轴 x 上的南水线 z（RiverWaterAt.z1；活着的日军越过它 = 过了河）。 */
  waterSouthZ: RiverWaterAt(MISSION_PONTOON_BRIDGE.x, MISSION_NORTH_RIVER).z1,
  coverAnchor: freeze({ x: S.bridgeCover.x, z: S.bridgeCover.z }),
});
