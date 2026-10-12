// ===========================================================================
// Script_EditorBlockoutFirstLevel.mjs —— 从游戏数据生成第一关白盒配置（Blockout/FirstLevel.json）
//
// 契约：docs/Data_EditorBlockout.md §3（配置格式）、§5.4（场景信号）、§8（关键帧清单与单位来源）。
// 纯模块：node 与浏览器都能 import，零 three、不碰 DOM / 时钟（generatedAt 由调用方给）。
//
// 每个关键帧（Data_EditorBlockoutFirstLevelStations 那 44 行）解析出：
//   player   机位：K* 取 SPACE_KEYFRAMES（camera→look 算 yaw，按 look.h 与共享地面算 pitch），
//            G* / NN_n 取 WHITEBOX_0518_CAMERAS（表里的 yawDeg / pitchDeg），「锚点 xxx」取 MISSION_ANCHORS 看向表里写的点。
//   next     表里的文字 + 本文件 NEXT_TARGETS 解析出的坐标。
//   signals  §5.4：BunkerCollapsed / MissionCourtyardGateOpen / MissionBridgeDestroyed / RailBridgeDestroyed / NightGateShown
//            （名字在生成时对 MISSION_SCENARIO_SIGNALS 与 MISSION_LAYOUT.gates 核对，写错直接抛）。
//   units    敌：PhaseLayout(BuildOrchestrationModel(), n) 里该阶段活着的组（Group() 校验组的状态），逐人回读 MISSION_ENCOUNTERS
//            原始行的 faceTo / role / route / lane，MISSION_TACTICS 给后续折线；03–05 用 FRONT_* 表与 FRONT_TANK_PATH（战车 kind
//            "tank"）；18 对岸取 Data_FirstLevelBridgeFarBank 的真 AI 组与战车（人群不放）。
//            友：各表的哨位（P.bunker、OPENING.frontPosts、FRONT_SORTIE、FRONT_BATTLE_TUNING、P.streetBlock、P.ambushSquadPosts、
//            MID_TUNING、END_TUNING、P.receptionYard、P.bridge、P.night），表里没有的就近摆并标 guess: true。
//            担架队：BuildFirstLevelCheckpoint(n).column.litters 打底，阶段内的推进按担架队路线里程摆。
//   pois     该阶段步骤的位置事实、补给箱、地标烟柱。
// 同一个人在相邻关键帧里 id 不变（花名册 id / luo / Litter5 …），过渡时走过去；有折线的（战术点、路线）写进 path。
//
// 朝向一律换成 yawDeg（0 = 北 −Z，+90 = 西，−90 = 东；前方 = (−sin, −cos)）。三种来源的换算见下面三个函数，
// 由 Script_EditorBlockoutConfigTest 钉住。MISSION_PLACEMENT 的 yaw 各块口径不一（块头注释写「0 朝 +z 南」，但接收院 /
// 浮桥爆破手等几处是按演员口径调的），所以这里凡是能说清「看向谁」的人一律写 faceTo，不直接搬表里的 yaw。
// ===========================================================================

import { BLOCKOUT_SCHEMA, YawDegFromTo, PathLength } from "./Script_EditorBlockoutConfig.mjs";
import { FIRST_LEVEL_BLOCKOUT_STATIONS, FIRST_LEVEL_BLOCKOUT_ZONES, FIRST_LEVEL_BLOCKOUT_TITLE } from "./Data_EditorBlockoutFirstLevelStations.mjs";
import { MISSION_ANCHORS as A, MISSION_PLACEMENT as P, MISSION_ROUTES as Routes, MISSION_LAYOUT, MISSION_SUPPLIES, MISSION_WHITEBOX_VERSION }
  from "./Data_FirstLevelMissionLayout.mjs";
import { MISSION_ENCOUNTERS, MISSION_TACTICS, MISSION_PURSUIT_ROUTE } from "./Data_FirstLevelMission.mjs";
import { FIRST_LEVEL_STAGE_CLEARED_ENEMIES, FIRST_LEVEL_CHECKPOINT_ENEMY_POSTS, FIRST_LEVEL_CHECKPOINT_FRONT_LOST } from "./Data_FirstLevelMissionStages.mjs";
import { MISSION_SCENARIO_SIGNALS } from "./Data_FirstLevelMissionGates.mjs";
import { FRONT_SORTIE as S, FRONT_SPACE as SP, FRONT_TANK_PATH, FrontTankIndex } from "./Data_FirstLevelFrontRoute.mjs";
import { FRONT_GUARD_POSTS, FRONT_GUARD_MG_GROUP, FRONT_DEFENDERS, FRONT_TANK_ESCORT_SLOTS, FRONT_NEST_FRONT_POSTS,
  FRONT_NEST_FRONT_PULLBACK, FrontAssaultLane } from "./Data_FirstLevelMissionFront.mjs";
import { SPACE_KEYFRAMES } from "./Data_FirstLevelSpaceKeyframes.mjs";
import { WHITEBOX_0518_CAMERA_BY_ID } from "./Data_FirstLevelWhitebox0518Cameras.mjs";
import { SampleMissionTerrain } from "./Data_FirstLevelMissionTerrain.mjs";
import { MISSION_RECEPTION_SPACE as Reception } from "./Data_FirstLevelMissionTopology.mjs";
import { OPENING } from "./Data_FirstLevelOpening.mjs";
import { OPENING_STORYBOARDS as SB } from "./Data_OpeningStoryboards.mjs";
import { FRONT_BATTLE_TUNING as FB } from "./Data_Tuning_FirstLevelFront.mjs";
import { MISSION_TUNING as R } from "./Data_Tuning_FirstLevel.mjs";
import { MID_TUNING as MID, MidLitterHoldSlots, MidWalkingWounded } from "./Data_Tuning_FirstLevelMid.mjs";
import { END_TUNING as END } from "./Data_Tuning_FirstLevelEnd.mjs";
import { FAR_BANK_REAL, FAR_BANK_TANKS, FAR_BANK_REAL_SPAWN_BACK_M, FarBankTankPostZ, FarBankTankPushZ } from "./Data_FirstLevelBridgeFarBank.mjs";
import { MISSION_CROWD_AREAS } from "./Data_FirstLevelMissionCrowd.mjs";
import { LANDMARK_COLUMNS } from "./Data_FirstLevelDistantSmoke.mjs";
import { BuildOrchestrationModel, PhaseLayout } from "./Script_MissionOrchestration.mjs";
import { BuildFirstLevelCheckpoint } from "./Script_FirstLevelMissionCheckpoint.mjs";
import { MissionRoutePoint, MissionRouteProjection } from "./Script_FirstLevelMissionColumn.mjs";

export const FIRST_LEVEL_BLOCKOUT_GENERATOR = "Script_EditorBlockoutCli.mjs export FirstLevel";

// ---------------------------------------------------------------------------
// 朝向换算（三种来源，测试钉住）

function WrapDeg(deg) {
  let d = ((deg + 180) % 360 + 360) % 360 - 180;
  if (d === -180) d = 180;
  return d;
}
/** 演员 / 玩家 / 相机口径的弧度（rotation.y；前方 (−sin, −cos)）：END_TUNING、MID_TUNING、开场分镜、阶段出生点的 yaw。 */
export function YawDegFromActorRad(rad) { return WrapDeg(rad * 180 / Math.PI); }
/** MISSION_PLACEMENT 块头注释的口径「0 朝 +z 南」（前方 (sin, cos)）：掩蔽部 P.bunker 那一块按这个写。 */
export function YawDegFromPlacementRad(rad) { return WrapDeg(rad * 180 / Math.PI + 180); }
/** WHITEBOX_0518_CAMERAS 的 yawDeg 已经是 0 = 北、+90 = 西：只做回绕。 */
export function YawDegFromCameraDeg(deg) { return WrapDeg(deg); }

// ---------------------------------------------------------------------------
// 小工具

const R2 = (v) => Math.round(v * 100) / 100;
const R1 = (v) => Math.round(v * 10) / 10;
const Pt = (x, z) => ({ x, z });
const Dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const Ground = (x, z) => SampleMissionTerrain(x, z);
const Lerp = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t });
const Offset = (p, dx, dz) => ({ x: p.x + dx, z: p.z + dz });
const TankWay = (id) => FRONT_TANK_PATH[FrontTankIndex(id)];
const COLUMN_ROUTE = Object.freeze([...Routes.southWalk, ...Routes.village.slice(1)]);
/** 村南门楼（MID_TUNING 注：2026-09-30 起北挪到 76,47.6；锚点表里没有它）。 */
const GATE_TOWER = Object.freeze({ x: 76, z: 47.6 });
const SQUAD_NAMES = Object.freeze({ luo: "罗班长", yaowa: "幺娃", heyoutian: "何有田", liuwencai: "刘文财" });

/** 站姿：眼高 < 0.6 m 卧、< 1.35 m 蹲，其余站。 */
function StanceFromEye(eyeM) { return eyeM < 0.6 ? "prone" : eyeM < 1.35 ? "crouch" : "stand"; }

function PitchDeg(from, eyeM, look, lookH) {
  const eyeY = Ground(from.x, from.z) + eyeM;
  const lookY = Ground(look.x, look.z) + lookH;
  const flat = Dist(from, look);
  return flat < 1e-6 ? 0 : Math.atan2(lookY - eyeY, flat) * 180 / Math.PI;
}

// ---------------------------------------------------------------------------
// 机位

function PoseFromSpaceKeyframe(id) {
  const k = SPACE_KEYFRAMES.find((entry) => entry.id === id);
  if (!k) throw new Error(`blockout: SPACE_KEYFRAMES 里没有 ${id}`);
  return {
    x: k.camera.x, z: k.camera.z,
    yawDeg: YawDegFromTo(k.camera, k.look),
    pitchDeg: PitchDeg(k.camera, k.camera.eyeM, k.look, k.look.h),
    stance: StanceFromEye(k.camera.eyeM),
  };
}

function PoseFromCamera(id, { lookAt = null, lookH = 1.2 } = {}) {
  const shot = WHITEBOX_0518_CAMERA_BY_ID[id];
  if (!shot) throw new Error(`blockout: WHITEBOX_0518_CAMERAS 里没有 ${id}`);
  const h = shot.camera.h ?? 1.6;
  if (lookAt) {
    return { x: shot.camera.x, z: shot.camera.z, yawDeg: YawDegFromTo(shot.camera, lookAt),
      pitchDeg: PitchDeg(shot.camera, h, lookAt, lookH), stance: StanceFromEye(h) };
  }
  return { x: shot.camera.x, z: shot.camera.z, yawDeg: YawDegFromCameraDeg(shot.yawDeg), pitchDeg: shot.pitchDeg ?? 0, stance: StanceFromEye(h) };
}

function PoseFromAnchor(at, look, { eyeM = 1.6, lookH = 1.2 } = {}) {
  return { x: at.x, z: at.z, yawDeg: YawDegFromTo(at, look), pitchDeg: PitchDeg(at, eyeM, look, lookH), stance: StanceFromEye(eyeM) };
}

/** 每个关键帧的机位（表里「机位来源」一栏的解析）；fallbackNote 写进 notes。 */
const POSES = {
  "01-1": () => PoseFromSpaceKeyframe("K1i"),
  "01-2": () => PoseFromSpaceKeyframe("K1"),
  "02-1": () => PoseFromSpaceKeyframe("K2b"),
  "02-2": () => PoseFromCamera("G02_3"),
  "03-1": () => PoseFromCamera("G03_1"),
  "03-2": () => PoseFromSpaceKeyframe("K3"),
  "03-3": () => PoseFromSpaceKeyframe("K4"),
  "04-1": () => PoseFromSpaceKeyframe("K6"),
  "04-2": () => PoseFromSpaceKeyframe("K7"),
  "05-1": () => PoseFromCamera("G05_4"),
  // 看向沟口攻击位与战车之间：两样都在画面里。
  "05-2": () => PoseFromAnchor(A.bundleDrop, Lerp(A.throw, TankWay("Block"), 0.5), { lookH: 1.4 }),
  "05-3": () => PoseFromSpaceKeyframe("K9"),
  "05-4": () => PoseFromSpaceKeyframe("K10"),
  "06-1": () => PoseFromSpaceKeyframe("K11"),
  "06-2": () => PoseFromCamera("G06_3"),
  "07-1": () => PoseFromCamera("07_1"),
  "07-2": () => PoseFromAnchor(A.southMouthHold, A.mouthEmbankment),
  "07-3": () => PoseFromAnchor(A.southMouth, Routes.southWalk.at(-1)),
  "08-1": () => PoseFromCamera("G08_1"),
  "08-2": () => PoseFromCamera("G08_2"),
  "08-3": () => PoseFromCamera("G08_3"),
  "09-1": () => PoseFromCamera("G09_1"),
  "09-2": () => PoseFromAnchor(A.westAlleyNorth, A.westAlleySouth),
  "09-3": () => PoseFromAnchor(A.westAlleySouth, P.sideRoomGunner, { lookH: 1.5 }),
  // 巷尾草垛 LaneHaystack（x 78.4–80.4、z 41.8–43.8，MISSION_TACTICS 注）。
  "10-1": () => PoseFromAnchor(A.laneEast, { x: 79.4, z: 42.8 }),
  "10-2": () => PoseFromCamera("G10_2"),
  "11-1": () => PoseFromCamera("G11_1"),
  "12-1": () => PoseFromCamera("12_3"),
  "12-2": () => PoseFromCamera("12_3", { lookAt: A.cartBoard }),
  "12-3": () => PoseFromCamera("12_4"),
  "13-1": () => PoseFromCamera("13_1"),
  "13-2": () => PoseFromCamera("13_2"),
  "14-1": () => PoseFromCamera("G14_1"),
  "14-2": () => PoseFromCamera("14_1"),
  "15-1": () => PoseFromCamera("14_2"),
  "15-2": () => PoseFromCamera("G15_1"),
  "15-3": () => PoseFromCamera("G15_2"),
  "15-4": () => PoseFromCamera("G15_3"),
  "16-1": () => PoseFromCamera("G16_1"),
  "17-1": () => PoseFromCamera("17_1"),
  "18-1": () => PoseFromCamera("G18_1"),
  "18-2": () => PoseFromCamera("18_2"),
  // 表里首选 G18_4 是站在射位回头看安全区（与 18-2 同一处）；站位名是「爆破安全区」，这里站到锚点 blastSafe 看浮桥被炸段。
  "18-3": () => PoseFromAnchor(A.blastSafe, { x: -77, z: 122 }, { lookH: 0.5 }),
  "18-4": () => PoseFromCamera("18_3"),
};
const POSE_NOTES = {
  "18-3": "机位：表里写 G18_4（或锚点 blastSafe）；G18_4 站在射位回头看，与 18-2 同一处，这里用锚点 blastSafe 看浮桥被炸段。",
};

// ---------------------------------------------------------------------------
// 下一步目标

const NEXT_TARGETS = {
  "01-1": { at: A.bunkerDoor, r: 1.5 },
  "01-2": null,
  "02-1": { at: SB.withdraw.luoCover, r: 1.5 },
  "02-2": { at: A.collection, r: 6 },
  "03-1": { at: S.approach[1], r: 2 },
  "03-2": { at: A.front, r: 4 },
  "03-3": { at: S.gap, r: 3 },
  "04-1": { at: "escorts", r: 6 },
  "04-2": { at: S.rear, r: 2 },
  "05-1": { at: A.bundleDrop, r: 2 },
  "05-2": { at: A.throw, r: 2 },
  "05-3": { at: TankWay("Block"), r: 3 },
  "05-4": { at: A.collection, r: 6 },
  "06-1": { at: Routes.southWalk[1], r: 3 },
  "06-2": { at: Routes.southWalk[2], r: 3 },
  "07-1": { at: A.southMouth, r: 3 },
  "07-2": { at: A.mouthEmbankment, r: 3 },
  "07-3": { at: Routes.southWalk.at(-1), r: 4 },
  // 罗班长带路的 holdTarget（Data_FirstLevelLeaderGuide.Village）。
  "08-1": { at: Pt(76, -24), r: 3 },
  "08-2": { at: Pt(58, -17.8), r: 2 },
  "08-3": { at: Pt(58, -17.8), r: 2 },
  "09-1": { at: A.melee, r: 3 },
  "09-2": { at: A.gengCartYard, r: 3 },
  "09-3": { at: P.sideRoomGunner, r: 3 },
  "10-1": { at: A.gate, r: 3 },
  "10-2": { at: GATE_TOWER, r: 3 },
  "11-1": { at: MID.streetFight.askPoint, r: MID.streetFight.askRangeM },
  "12-1": { at: A.transferWall, r: 1.5 },
  "12-2": { at: A.cartBoard, r: 2 },
  "12-3": { at: A.cartHalt, r: 3 },
  // 西高墙墙脚的路沟 RoadSideDitchWest（x 72.6、z 120.2–129.2，Data_FirstLevelWhiteboxTerrainTransfer）。
  "13-1": { at: Pt(72.6, 123), r: 1.5 },
  "13-2": { at: A.ditchMouth, r: 3 },
  "14-1": { at: A.ditchMouth, r: 3 },
  "14-2": { at: A.ditch, r: 3 },
  "15-1": { at: A.retreatB, r: 4 },
  // G15_1 看的「坡顶路牌指右手的院墙夹道口」。
  "15-2": { at: Pt(52, 210.5), r: 3 },
  "15-3": { at: Routes.wallPath[2], r: 2.5 },
  "15-4": { at: A.receptionGate, r: 2.5 },
  "16-1": { at: A.zhouDrop, r: 1.5 },
  "17-1": null,
  "18-1": { at: A.rearExit, r: 2.5 },
  "18-2": { at: A.bridgeEnemy, r: 6 },
  "18-3": { at: A.marchOut, r: 5 },
  "18-4": { at: A.gateInside, r: 4 },
};

// ---------------------------------------------------------------------------
// 场景信号（§5.4）

const GATE_SIGNALS = new Set(MISSION_LAYOUT.gates.flatMap((g) => [g.signal, g.appearSignal]).filter(Boolean));
const SCENARIO_SIGNALS = new Set(MISSION_LAYOUT.scenario.states.map((s) => s.signal).filter(Boolean));
const KNOWN_SIGNALS = new Set([...GATE_SIGNALS, ...SCENARIO_SIGNALS, ...Object.keys(MISSION_SCENARIO_SIGNALS)]);

/**
 * 关键帧此刻为真的信号。01-2 起掩蔽部是塌方态；10-1 老耿已拔闩开门（StageJump 11 起手动开门，这里按剧情提前到门真开的那一刻）；
 * 13-2 起路桥已被第一轮空袭炸断；18-3 浮桥炸断；18-4 夜景北门。
 */
export function FirstLevelSignalsFor(kfId, stage) {
  const out = [];
  if (kfId !== "01-1") out.push("BunkerCollapsed");
  if (stage >= 11 || kfId.startsWith("10-")) out.push("MissionCourtyardGateOpen");
  if (stage >= 14 || kfId === "13-2") out.push("MissionBridgeDestroyed");
  if (kfId === "18-3" || kfId === "18-4") out.push("RailBridgeDestroyed");
  if (kfId === "18-4") out.push("NightGateShown");
  for (const name of out) if (!KNOWN_SIGNALS.has(name)) throw new Error(`blockout: 信号 ${name} 不在 MISSION_SCENARIO_SIGNALS / 门表里`);
  return out;
}

// ---------------------------------------------------------------------------
// 单位

const META = new WeakMap();
const DEFAULT_WEAPON = { ija: "Type38", nra: "HanYang" };
const NO_WEAPON_KINDS = new Set(["civilian", "child", "tank", "litter", "cart", "animal"]);

/**
 * 造一个单位。o: kind name role group weapon yawDeg faceTo stance aim state arc speedMps path intent guess
 *               track（这个人跟的折线，含起点）trackAt（他此刻在折线上的下标）
 */
function Unit(id, side, at, o = {}) {
  const kind = o.kind || "soldier";
  const u = { id, side };
  if (kind !== "soldier") u.kind = kind;
  if (o.name) u.name = o.name;
  if (o.role) u.role = o.role;
  if (o.group) u.group = o.group;
  if (!NO_WEAPON_KINDS.has(kind) && side !== "civ" && o.weapon && o.weapon !== DEFAULT_WEAPON[side]) u.weapon = o.weapon;
  u.x = R2(at.x); u.z = R2(at.z);
  u.yawDeg = 0;
  if (o.stance && o.stance !== "stand") u.stance = o.stance;
  if (o.aim) u.aim = true;
  if (o.state === "down") u.state = "down";
  if (o.arc) u.arc = o.arc;
  if (o.speedMps) u.speedMps = o.speedMps;
  if (o.path?.length) u.path = o.path.map((p) => ({ x: R2(p.x), z: R2(p.z) }));
  if (o.intent?.length) u.intent = o.intent.map((p) => ({ x: R2(p.x), z: R2(p.z) }));
  if (o.guess) u.guess = true;
  META.set(u, {
    yawDeg: Number.isFinite(o.yawDeg) ? o.yawDeg : null,
    faceTo: o.faceTo || null,
    track: o.track || null,
    trackAt: Number.isFinite(o.trackAt) ? o.trackAt : null,
  });
  return u;
}
/** 事后改朝向（配方里对 Group() 的结果再定向用）。 */
function SetFace(u, target) {
  const meta = META.get(u);
  if (meta) { meta.yawDeg = null; meta.faceTo = target; }
  return u;
}
/** 事后挪位置：同时把它从原来的折线上摘下来（过渡改走路线 / 直线）。 */
function MoveTo(u, at, path = null) {
  u.x = R2(at.x); u.z = R2(at.z);
  const meta = META.get(u);
  if (meta) { meta.track = null; meta.trackAt = null; }
  if (path?.length) u.path = path.map((p) => ({ x: R2(p.x), z: R2(p.z) }));
  return u;
}
const Ija = (id, at, o) => Unit(id, "ija", at, o);
const Nra = (id, at, o) => Unit(id, "nra", at, o);
const Civ = (id, at, o) => Unit(id, "civ", at, { kind: "civilian", ...o });

/** 班里四个人。posts: { luo: {x,z,...o}, … }。 */
function Squad(posts) {
  return Object.entries(posts).filter(([, p]) => p).map(([key, p]) =>
    Nra(key, p, { name: SQUAD_NAMES[key], role: "squad", ...p }));
}
const Zhou = (at, o) => Nra("zhou", at, { name: "老周", role: "wounded", ...o });
const Geng = (at, o) => Civ("geng", at, { name: "老耿", ...o });
const Nier = (at, o) => Civ("nier", at, { kind: "child", name: "妮儿", ...o });
const GengCart = (at, o) => Civ("gengCart", at, { kind: "cart", name: "老耿的驴车", ...o });

// --- 敌军组（PhaseLayout 校验 + MISSION_ENCOUNTERS 原始行 + MISSION_TACTICS） ---

let MODEL = null;
const PHASE_CACHE = new Map();
function Phase(n) {
  if (!MODEL) MODEL = BuildOrchestrationModel();
  if (!PHASE_CACHE.has(n)) PHASE_CACHE.set(n, PhaseLayout(MODEL, n));
  return PHASE_CACHE.get(n);
}

/** 这个人跟的折线（不含起点）：战术点 > 原始行 route > 侧翼 lane > enter。 */
function MemberTrack(row) {
  const tactic = MISSION_TACTICS[row.id];
  if (tactic?.points?.length) return tactic.points.map((p) => Pt(p.x, p.z));
  if (row.route?.length) return row.route.map((p) => Pt(p.x, p.z));
  if (row.lane?.length) return row.lane.map((p) => Pt(p.x, p.z));
  return [];
}

/** 架在窗后 / 屋里的机枪手是蹲着打的，不是趴着。 */
const WINDOW_GUNNERS = new Set(["RearWindow", "VillageGunner"]);

const ENEMY_NAMES = Object.freeze({
  BunkerExecutionerA: "日兵甲", BunkerExecutionerB: "日兵乙", BunkerFollowA: "日兵丙", BunkerFollowB: "日兵丁",
  BunkerGunner: "沟沿机枪", RightNestGunner: "破墙机枪", FrontOfficer: "拔刀军官", FrontGunner: "远处机枪",
  FrontSupportGunner: "远处机枪", MouthGunner: "田埂机枪", RearWindow: "东窗机枪", VillageGunner: "侧屋机枪",
  RoofThrower: "屋顶投弹手", MeleeLead: "过道伏兵", AlleyPop: "侧门伏兵", LaneGunner: "草垛机枪",
  TransferGunner: "翻车后的机枪", TransferAlleyGunner: "巷口机枪", BridgeNorthGunner: "土坎机枪",
});

/**
 * 一个遭遇组在第 n 阶段的成员。
 * o.at:      { [id]: "start" | "end" | 下标 | {x,z} }，o.atAll 同上给全组；缺省 "start"（花名册位置）
 * o.only / o.skip: 只要 / 不要这些 id
 * o.down:    这些 id 画成倒地（含 FIRST_LEVEL_STAGE_CLEARED_ENEMIES 里的，否则清掉的人不出现）
 * o.face:    缺省朝向点（行里有 faceTo 的用行里的）
 * o.intent:  true = 还没走完的折线写成「即将去」
 * o.allowStates: 允许的组状态（缺省 active / standby / pending）
 */
function Group(n, groupId, o = {}) {
  const phase = Phase(o.stage ?? n);
  const enc = phase.encounters.find((e) => e.id === groupId);
  const allowed = o.allowStates || ["active", "standby", "pending"];
  if (!enc) throw new Error(`blockout: 阶段 ${n} 没有遭遇组 ${groupId}`);
  if (!allowed.includes(enc.state)) throw new Error(`blockout: 阶段 ${o.stage ?? n} 的 ${groupId} 是 ${enc.state}（允许 ${allowed.join("/")}）`);
  const cleared = new Set(FIRST_LEVEL_STAGE_CLEARED_ENEMIES[n] || []);
  const down = new Set(o.down || []);
  const out = [];
  for (const row of MISSION_ENCOUNTERS[groupId]) {
    if (o.only && !o.only.includes(row.id)) continue;
    if (o.skip?.includes(row.id)) continue;
    if (cleared.has(row.id) && !down.has(row.id)) continue;
    const track = [Pt(row.x, row.z), ...(o.trackOf?.[row.id] || MemberTrack(row))];
    const spec = o.at?.[row.id] ?? o.atAll ?? "start";
    let at, trackAt = null;
    if (spec === "start") { at = track[0]; trackAt = 0; }
    else if (spec === "end") { trackAt = track.length - 1; at = track[trackAt]; }
    else if (typeof spec === "number") { trackAt = Math.min(spec, track.length - 1); at = track[trackAt]; }
    else at = spec;
    const isDown = down.has(row.id);
    const remaining = trackAt !== null && trackAt < track.length - 1 ? track.slice(trackAt + 1) : [];
    const tactic = MISSION_TACTICS[row.id];
    const mg = ["Type11", "Type92Hmg"].includes(row.weapon);
    out.push(Unit(row.id, row.side || "ija", at, {
      group: groupId, role: row.role, weapon: row.weapon, name: ENEMY_NAMES[row.id],
      faceTo: o.faceOf?.[row.id] || (isDown ? null : (row.faceTo || row.fireAt || (o.intent && remaining[0]) || o.face || null)),
      stance: isDown ? "prone" : (o.stanceOf?.[row.id] || o.stance
        || (mg ? (WINDOW_GUNNERS.has(row.id) ? "crouch" : "prone") : (remaining.length && o.intent ? "stand" : "crouch"))),
      aim: !isDown && !(o.intent && remaining.length) && o.aim !== false,
      state: isDown ? "down" : "alive",
      speedMps: tactic?.mps,
      intent: o.intent && !isDown ? remaining : null,
      track, trackAt,
    }));
  }
  return out;
}

// --- 03–05 前沿 ---

/** 战车（FRONT_TANK_PATH 的路点；facing 按路点的 faceTo 名字）。 */
function Tank(wayId, o = {}) {
  const w = TankWay(wayId);
  const face = w.faceTo ? SP.tankTargets[w.faceTo] : null;
  const idx = FrontTankIndex(wayId);
  const track = FRONT_TANK_PATH.map((p) => Pt(p.x, p.z));
  return Ija("Tank", w, { kind: "tank", name: o.down ? "战车（已炸哑）" : "战车", group: "tank", role: "tank",
    faceTo: o.faceTo || face || (idx + 1 < FRONT_TANK_PATH.length ? FRONT_TANK_PATH[idx + 1] : null),
    state: o.down ? "down" : "alive", intent: o.intent, track, trackAt: idx });
}

/** 跟车步兵：挡口子的槽位（FRONT_TANK_ESCORT_SLOTS，相对 Block）平移到战车所在路点。 */
function TankEscorts(at, o = {}) {
  const block = TankWay("Block");
  return FRONT_TANK_ESCORT_SLOTS.map((slot) => {
    const dx = slot.x - block.x, dz = slot.z - block.z;
    return Ija(slot.id, Offset(at, dx, dz), {
      group: "tank", role: "escort", faceTo: o.face || SP.tankTargets.gap, stance: o.stance || "crouch", aim: o.aim ?? true,
      state: o.down?.includes(slot.id) ? "down" : "alive", intent: o.intent?.(slot),
      // 跟着战车沿路走过来：路点平移到自己的槽位上。
      path: o.pathWays ? o.pathWays.map((id) => Offset(TankWay(id), dx, dz)) : null });
  });
}

/**
 * 推进组（MachineGunAttack*）跃进到最后一道线的落点。FrontAssaultLane 把不同起点推到同一个掩体列边上，
 * 会和跃进组的落点重成一个点（两个人站在一起），这里按组内序号往两边错开 1.2 m、往后 0.8 m。
 */
function MgPushPost(id, last) {
  const m = /^MachineGunAttack(\d+)_(\d+)$/.exec(id);
  const k = m ? Number(m[1]) * 2 + Number(m[2]) : 0;
  return { x: last.x + (k % 2 ? 1.2 : -1.2), z: last.z - 0.8 };
}

/** 背坡刮痕里的守军（FRONT_GUARD_POSTS；6/7 号 03 整段是背坡机枪组）。 */
function Guards({ posts = "scrape", only = null, down = [], atOf = {}, intentOf = {}, pathOf = {} } = {}) {
  const pair = new Map(FRONT_GUARD_MG_GROUP.members.map((m) => [m.guard, m]));
  const out = [];
  FRONT_GUARD_POSTS.forEach((post, i) => {
    if (only && !only.includes(i)) return;
    const id = `Guard${i}`;
    const mg = pair.get(i);
    const at = atOf[i] || (posts === "scrape" && mg ? mg : post);
    const isDown = down.includes(i);
    out.push(Nra(id, at, { role: "guard", group: "guards", weapon: mg ? mg.weapon : "HanYang",
      faceTo: isDown ? null : Pt(at.x + 2, at.z - 30), stance: isDown ? "prone" : (mg ? "prone" : "crouch"),
      aim: !isDown && !intentOf[i], state: isDown ? "down" : "alive", intent: intentOf[i], path: pathOf[i] }));
  });
  return out;
}
/** 守军撤到的安全区落点（MISSION_PLACEMENT.guardWithdrawalRoutes 的末点）。 */
const GuardSafe = (i) => P.guardWithdrawalRoutes[i].at(-1);

/** 火力组 + 跃进组（FRONT_RIFLEMEN）。bound = 跃进组在 FrontAssaultLane 上的下标（-1 = 出发点，"last" = 最后一道线）。 */
function FrontRiflemen(n, { bound = -1, down = [], skip = [] } = {}) {
  const lane = {};
  const at = {};
  for (const row of MISSION_ENCOUNTERS.front) {
    if (row.role !== "bound") continue;
    const points = FrontAssaultLane(row.x, row.z);
    lane[row.id] = points;
    const k = bound === "last" ? points.length - 1 : bound;
    at[row.id] = k < 0 ? "start" : Math.min(k, points.length - 1) + 1;
  }
  return Group(n, "front", { at, down, skip, trackOf: lane, face: S.gap, stanceOf: { FrontGunner: "prone", FrontSupportGunner: "prone" },
    faceOf: Object.fromEntries(["FrontGunner", "FrontSupportGunner", "FrontRifleG", "FrontRifleH"].map((id) => [id, Pt(-4, -156)])) });
}

// --- 担架队 ---

const CHECKPOINTS = new Map();
function Checkpoint(n) {
  if (!CHECKPOINTS.has(n)) CHECKPOINTS.set(n, BuildFirstLevelCheckpoint(n));
  return CHECKPOINTS.get(n);
}
function LitterUnit(id, at, o = {}) {
  const zhou = id === "Litter5";
  return Nra(id, at, { kind: "litter", name: zhou ? "老周的担架" : "", role: zhou ? "zhouLitter" : "litter", group: "column", ...o });
}
/** 检查点快照里的担架（装上车走了的不画；fallen = 抬担架的人倒了）。 */
function CheckpointLitters(n, { skip = [], atOf = {}, faceOf = {} } = {}) {
  const out = [];
  for (const l of Checkpoint(n).column.litters) {
    if (skip.includes(l.id)) continue;
    if (!atOf[l.id] && (l.loaded || l.evacuated || l.visible === false)) continue;
    const at = atOf[l.id] || l;
    out.push(LitterUnit(l.id, at, { yawDeg: atOf[l.id] ? null : YawDegFromActorRad(l.yaw || 0), faceTo: faceOf[l.id],
      state: !atOf[l.id] && l.state === "fallen" ? "down" : "alive" }));
  }
  return out;
}
/** 担架队沿后送线（southWalk + village）排开：Litter0 在 frontM 米处，往后每副隔 litterSpacingM。 */
function ColumnLitters(frontM, { gapM = R.litterSpacingM, skip = [] } = {}) {
  const out = [];
  for (let i = 0; i < R.litterCount; i++) {
    const id = `Litter${i}`;
    if (skip.includes(id)) continue;
    const progress = frontM - i * gapM;
    const at = MissionRoutePoint(COLUMN_ROUTE, progress);
    const ahead = MissionRoutePoint(COLUMN_ROUTE, progress + 1);
    out.push(LitterUnit(id, at, { faceTo: ahead }));
  }
  return out;
}
/** 路线上 m 米处、往行进方向右手偏 side 米的点。 */
function RouteSide(route, m, side = 0) {
  const a = MissionRoutePoint(route, m), b = MissionRoutePoint(route, m + 0.5);
  const dx = b.x - a.x, dz = b.z - a.z, len = Math.hypot(dx, dz) || 1;
  // 前方 (dx,dz)，右手（俯视、北朝上）= (−dz, dx)。
  return { x: a.x - dz / len * side, z: a.z + dx / len * side };
}
/** 路线上从 from 的投影走到 to 的投影之间经过的折点（不含两端）。 */
function RouteSlice(route, from, to) {
  const pts = route.map((p) => Pt(p.x, p.z));
  return RouteVerticesBetween(pts, RouteProgresses(pts), MissionRouteProjection(pts, from).progress, MissionRouteProjection(pts, to).progress);
}
const ColumnPoint = (m) => MissionRoutePoint(COLUMN_ROUTE, m);
const ColumnProgress = (p) => MissionRouteProjection(COLUMN_ROUTE, p).progress;

// --- 集结处（02-2、03-1、06-1、06-2） ---

function CollectionScene({ bearers = P.collection.bearers } = {}) {
  return [
    ...P.collection.wounded.map((w, i) => Nra(`CollectionWounded${i}`, w, { role: "wounded", group: "collection",
      yawDeg: YawDegFromActorRad(w.yaw), stance: "prone", state: "down" })),
    ...bearers.map((b, i) => Nra(`CollectionBearer${i}`, b, { role: "bearer", group: "collection", faceTo: A.collection })),
  ];
}

// ---------------------------------------------------------------------------
// POI

/** 地标烟柱（LANDMARK_COLUMNS）只在它起作用的阶段画（Data_FirstLevelDistantSmoke 头注）。 */
const LANDMARK_STAGES = Object.freeze({
  BurningTankSlope: { name: "坡上烧着的战车", stages: [4, 5] },
  VillageMouthFire: { name: "村北口烟柱", stages: [7, 8] },
  StreetBlockFire: { name: "主街烟柱", stages: [8, 9] },
});
const Poi = (id, name, kind, at, radiusM = 2) => ({ id, name, kind, x: R2(at.x), z: R2(at.z), radiusM });

/** 关键帧附近的补给箱（25 m 内）与该阶段的地标烟柱。 */
function AutoPois(player, stage) {
  const out = [];
  for (const s of MISSION_SUPPLIES) {
    if (Dist(player, s) <= 15) out.push(Poi(`supply${s.id}`, "弹药箱", "poi", s, 1));
  }
  for (const c of LANDMARK_COLUMNS) {
    const spec = LANDMARK_STAGES[c.id];
    if (spec && stage >= spec.stages[0] && stage <= spec.stages[1]) out.push(Poi(c.id, spec.name, "landmark", c, 3));
  }
  return out;
}

// ---------------------------------------------------------------------------
// 各关键帧的单位与 POI（§8 表的一行一个配方）

const BANTER = SB.banter;
const BUNKER = P.bunker;
const BLOCK = TankWay("Block");
/** 破墙机枪手：花名册写的是枪的位置（RightNestFrontRest 枪架上），人在枪后的座位上。 */
const NEST_GUNNER = S.seat;
/** 08 墙后停靠处 → 灶屋北门 → 穿灶屋、连屋 → 后院 / 内院（担架队与老耿一家走的那一段 village 路线）。 */
const THROUGH_KITCHEN = Object.freeze([Pt(58, -20), Pt(58, -9), Pt(58, 8), Pt(58, 18)]);
/** 厢房门口 → 后门 → toBridge 到南岸射位（18 接令后班组走的路）。 */
const WARD_TO_BRIDGE = Object.freeze([Pt(-26, 247), Pt(-35, 247), Pt(-38, 244), ...Routes.toBridge.map((p) => Pt(p.x, p.z))]);
/** 内院 → 院门合流点（MISSION_CROWD_AREAS.courtyard.merge）→ 门外绕行巷。 */
const OUT_OF_YARD = Object.freeze([Pt(53, 32.2), Pt(53, 39)]);
/** 村口低墙（z 84.05）东段与西段之间的通行口（x 78.1–81.0，MID_TUNING.villageWall.gapX 79.55）。 */
const THROUGH_WALL_GAP = Object.freeze([Pt(MID.villageWall.gapX, 82.5), Pt(MID.villageWall.gapX, 86.5)]);
/** 院门 → 院里 → 厢房南门（END_TUNING.receptionApproach 的后半段）。 */
const YARD_TO_WARD = Object.freeze([Pt(2, 240), Pt(-5, 240), Pt(-13, 240), Pt(-13, 249), Pt(-26, 249), Pt(-26, 241)]);
/** 车路 → 物资箱北面 → 下沟口 → 西沟（MISSION_PURSUIT_ROUTE 那条线，撤离线 evacuation 的头）。 */
const ROAD_TO_DITCH = Object.freeze([Pt(74, 112), Pt(61, 112), Pt(60, 114), Pt(54, 114), Pt(39, 116)]);
/** 先走 via，再沿 route 走到 to 的投影。 */
function ViaThenRoute(via, route, to) { return [...via, ...RouteSlice(route, via.at(-1), to)]; }
/** 炸桥后随队往南（marchOut），黑屏后在夜里北门外的出生点归队（nightMarch 起点）。 */
const NIGHT_MARCH = Object.freeze([...Routes.marchOut.slice(1).map((p) => Pt(p.x, p.z)), Pt(Routes.nightMarch[0].x, Routes.nightMarch[0].z)]);

const RECIPES = {
  // ---------------- 01 ----------------
  "01-1": () => ({
    units: [
      Nra("luo", BANTER.luo, { name: "罗班长", role: "squad", yawDeg: YawDegFromActorRad(BANTER.luo.yaw) }),
      Nra("yaowa", BANTER.yaowa, { name: "幺娃", role: "squad", faceTo: BANTER.comradeSeat, stance: "crouch" }),
      Nra("heyoutian", BANTER.he, { name: "何有田", role: "squad", yawDeg: YawDegFromActorRad(BANTER.he.yaw), stance: "prone" }),
      Nra("liuwencai", BANTER.liu, { name: "刘文财", role: "squad", yawDeg: YawDegFromActorRad(BANTER.liu.yaw), stance: "crouch" }),
      Nra("comrade", BANTER.comradeSeat, { name: "冬瓜", role: "comrade", yawDeg: YawDegFromActorRad(BANTER.comradeSeat.yaw), stance: "crouch" }),
      Nra("runner", BANTER.runnerRoute[2], { name: "传令兵", role: "runner", speedMps: 3.4, intent: BANTER.runnerRoute.slice(3) }),
    ],
    pois: [Poi("rearCorner", "后交通壕折角", "landmark", A.rearCorner, 2)],
  }),
  "01-2": (ctx) => ({
    units: [
      Nra("comrade", { x: 4.06, z: -125.9 }, { name: "冬瓜", role: "comrade", faceTo: ctx.player, stance: "crouch" }),
      ...Group(1, "bunkerAssault", {
        allowStates: ["dormant", "active"],
        at: { BunkerExecutionerA: Pt(4.4, -125.35), BunkerExecutionerB: SB.wall.rifleRoot, BunkerGunner: SB.wall.heave.roots.gunner,
          BunkerLoader: SB.wall.heave.roots.loader },
        faceOf: { BunkerExecutionerA: Pt(4.06, -125.9), BunkerExecutionerB: Pt(9, -128), BunkerFollowA: A.bunkerKilling,
          BunkerFollowB: A.bunkerKilling, BunkerGunner: SB.wall.burstAt[0], BunkerLoader: SB.wall.burstAt[0] },
        stanceOf: { BunkerExecutionerA: "stand", BunkerExecutionerB: "stand", BunkerFollowA: "crouch", BunkerFollowB: "stand", BunkerLoader: "crouch" },
      }),
      ...Group(1, "bunkerBackdrop", { intent: true }),
      Nra("shouter", BANTER.shouter, { name: "喊话的兵", role: "comrade", stance: "prone", state: "down" }),
      // 班里人跟传令兵退进后交通壕（02 罗班长从后交通壕折角上来救人），从洞里看不见。
      ...Squad({
        luo: { ...BUNKER.luoEntry, faceTo: A.bunkerDoor, guess: true },
        heyoutian: { ...SP.rcHold[0], faceTo: A.bunkerJunction, stance: "crouch", guess: true },
        liuwencai: { ...SP.rcHold[1], faceTo: A.bunkerJunction, stance: "crouch", guess: true },
        yaowa: { x: -4.6, z: -111.6, faceTo: A.bunkerDoor, stance: "crouch", guess: true },
      }),
      Nra("runner", { x: -7.2, z: -111.8 }, { name: "传令兵", role: "runner", faceTo: A.bunkerDoor, stance: "crouch", guess: true }),
    ],
    pois: [
      Poi("killSpot", "行刑处", "danger", A.bunkerKilling, 1.5),
      Poi("junctionJ", "交通壕岔口", "landmark", A.bunkerJunction, 1.5),
      Poi("foldF", "交通壕折角", "landmark", A.bunkerFold, 1.5),
      Poi("craterStep", "台阶（02 的枪从这里响）", "poi", A.bunkerCrater, 1.5),
      Poi("rifle", "汉阳造", "poi", BUNKER.rifleMouth, 0.6),
    ],
  }),
  // ---------------- 02 ----------------
  "02-1": (ctx) => ({
    units: [
      ...Squad({
        luo: { ...BUNKER.luoLift, faceTo: ctx.player, stance: "crouch" },
        heyoutian: { ...BUNKER.heyoutianFire, faceTo: A.bunkerJunction, stance: "crouch", aim: true },
        liuwencai: { ...BUNKER.liuwencaiShot, faceTo: A.bunkerJunction, aim: true },
        yaowa: { ...BUNKER.yaowaLift, faceTo: A.bunkerDoor },
      }),
      Nra("comrade", { x: 4.06, z: -125.9 }, { name: "冬瓜", role: "comrade", stance: "prone", state: "down" }),
      Nra("shouter", BANTER.shouter, { name: "喊话的兵", role: "comrade", stance: "prone", state: "down" }),
      ...Group(2, "bunkerAssault", {
        at: { BunkerExecutionerA: Pt(4.4, -125.35), BunkerExecutionerB: SB.wall.rifleRoot, BunkerGunner: SB.wall.heave.roots.gunner,
          BunkerLoader: SB.wall.heave.roots.loader },
        down: ["BunkerExecutionerA", "BunkerExecutionerB", "BunkerFollowB", "BunkerGunner", "BunkerLoader"],
        faceOf: { BunkerFollowA: A.bunkerRear },
      }),
      ...Group(2, "bunkerPursuit", { intent: true, faceOf: { BunkerPursuitFold: A.bunkerRear } }),
    ],
    pois: [
      Poi("junctionJ", "交通壕岔口", "landmark", A.bunkerJunction, 1.5),
      Poi("foldF", "交通壕折角", "landmark", A.bunkerFold, 1.5),
    ],
  }),
  "02-2": () => {
    const lane = Routes.rearTrench;
    return {
      units: [
        ...Squad({
          luo: { ...MissionRoutePoint(lane, 18), faceTo: A.supportJunction },
          yaowa: { ...MissionRoutePoint(lane, 14), faceTo: A.supportJunction, guess: true },
          heyoutian: { ...SB.withdraw.heBound[1], faceTo: A.bunkerJunction, stance: "crouch", aim: true },
          liuwencai: { ...SB.withdraw.liuBound[1], faceTo: A.bunkerJunction, stance: "crouch", aim: true },
        }),
        Nra("comrade", { x: 4.06, z: -125.9 }, { name: "冬瓜", role: "comrade", stance: "prone", state: "down" }),
        ...Group(2, "bunkerAssault", { only: ["BunkerFollowA"], faceOf: { BunkerFollowA: A.bunkerRear } }),
        ...Group(2, "bunkerPursuit", { atAll: "end", faceOf: Object.fromEntries(["BunkerPursuitFold", "BunkerPursuitA", "BunkerPursuitB", "BunkerPursuitC"].map((id) => [id, A.rearCorner])) }),
        ...CollectionScene(),
      ],
      pois: [
        Poi("rcFrame", "折角木框", "landmark", SP.rearCornerFrame, 1.5),
        Poi("supportJunction", "支沟交汇", "landmark", A.supportJunction, 2),
      ],
    };
  },
  // ---------------- 03 ----------------
  "03-1": (ctx) => {
    const lead = MissionRoutePoint(Routes.support, MissionRouteProjection(Routes.support, Routes.support[0]).progress + FB.leaderLead.minM + 1 + 6);
    return {
      units: [
        ...Squad({
          luo: { ...lead, faceTo: S.approach[1] },
          heyoutian: { ...SP.rcHold[0], faceTo: A.bunkerJunction, stance: "crouch", aim: true },
          liuwencai: { x: ctx.player.x + 1.2, z: ctx.player.z - 1.6, faceTo: S.approach[1], guess: true },
          yaowa: { ...MissionRoutePoint(Routes.support, 3), faceTo: S.approach[1], guess: true },
        }),
        ...FRONT_DEFENDERS.map((d) => Nra(d.id, d, { role: "defender", faceTo: Pt(d.x, d.z - 30), stance: "crouch", aim: true })),
        Nra("WalkingWounded0", Pt(-30, -119.5), { role: "wounded", faceTo: A.collection, guess: true }),
        Nra("WalkingWounded1", Pt(-27.2, -124.6), { role: "wounded", faceTo: A.collection, guess: true }),
        Zhou(S.leftSeat, { weapon: "Zb26", faceTo: Pt(-33.6, -190), stance: "crouch", aim: true }),
        ...Guards(),
        ...Group(3, "approach", { face: S.gap, at: { RightNestGunner: NEST_GUNNER } }),
        ...FrontRiflemen(3, { bound: -1 }),
        ...CollectionScene(),
      ],
      pois: [
        Poi("observation", "观察射台", "poi", SP.observation, 1.5),
        Poi("nest", "右侧阵位（破墙机枪）", "danger", A.front, 4),
        Poi("leftGun", "老周的机枪位", "landmark", S.leftGun, 1.5),
      ],
    };
  },
  "03-2": () => ({
    units: [
      ...Squad({
        luo: { x: -21.4, z: -129.8, faceTo: S.gap, guess: true },
        heyoutian: { ...SP.rcHold[0], faceTo: A.bunkerJunction, stance: "crouch", aim: true },
        liuwencai: { ...S.approach[5], faceTo: S.gap, guess: true },
        yaowa: { ...S.approach[4], faceTo: S.gap, guess: true },
      }),
      ...FRONT_DEFENDERS.map((d) => Nra(d.id, d, { role: "defender", faceTo: Pt(d.x, d.z - 30), stance: "crouch", aim: true })),
      Zhou(S.leftSeat, { weapon: "Zb26", faceTo: Pt(-33.6, -190), stance: "crouch", aim: true }),
      ...Guards(),
      ...Group(3, "approach", { face: S.gap, at: { RightNestGunner: NEST_GUNNER } }),
      ...FrontRiflemen(3, { bound: 1 }),
      ...Group(3, "frontFlank", { intent: true }),
      ...Group(3, "frontOfficer", { intent: true }),
    ],
    pois: [
      Poi("gap", "缺口", "poi", S.gap, 3),
      Poi("nest", "右侧阵位（破墙机枪）", "danger", A.front, 4),
      // FRONT_FIRE_STEPS[1]：右侧低沟北壁的射台，站上去看得见破墙里的机枪手。
      Poi("fireStep", "右侧低沟射台", "poi", { x: 14.9, z: -146.4 }, 1.4),
      // 03 去程右侧低沟南壁的弹药箱（MISSION_SUPPLIES.RightTrench，09.24 复盘：冷启动到阵位时没有绷带）。
      Poi("supplyRightTrench", "弹药箱", "poi", MISSION_SUPPLIES.find((s) => s.id === "RightTrench"), 1),
    ],
  }),
  "03-3": (ctx) => {
    const firstBatch = Array.from({ length: FB.firstBatch }, (_, i) => i);
    const guardRoute = S.guardRoute;
    return {
      units: [
        ...Squad({
          luo: { ...S.leaderCover, faceTo: S.gap, stance: "crouch", aim: true },
          heyoutian: { ...S.leftSeat, weapon: "Zb26", faceTo: Pt(-33.6, -190), stance: "crouch", aim: true },
          liuwencai: { x: 27.6, z: -149.2, faceTo: S.gap, stance: "crouch", guess: true },
          yaowa: { x: 28.6, z: -147.6, faceTo: ctx.player, stance: "crouch", guess: true },
        }),
        Zhou(S.zhouExit[1], { faceTo: S.zhouExit[2], intent: S.zhouExit.slice(2) }),
        // 第一批 5 人正沿撤离线（刮痕 → 缺口 → 缺口交汇 → 折角 → 安全区）一个接一个过缺口。
        ...Guards({
          atOf: Object.fromEntries(firstBatch.map((i) => [i, Offset(guardRoute[Math.min(1 + Math.floor(i / 2), guardRoute.length - 1)], (i % 2) * 0.9, 0)])),
          intentOf: Object.fromEntries(firstBatch.map((i) => [i, [...guardRoute.slice(2 + Math.floor(i / 2)), GuardSafe(i)]])),
        }),
        ...Group(3, "approach", { at: { RightNestGunner: Offset(S.seat, 0.6, 1.4) }, face: S.gap }).map((u) => Object.assign(u, { state: "down", stance: "prone", aim: undefined })),
        ...FrontRiflemen(3, { bound: "last", down: FIRST_LEVEL_CHECKPOINT_FRONT_LOST }),
        ...Group(3, "frontFlank", { atAll: "end", face: A.front }),
        ...Group(3, "frontOfficer", { atAll: "end", face: A.front, stance: "stand" }),
        Tank("Start"),
        ...TankEscorts(TankWay("Cutting"), { aim: false, stance: "stand", face: TankWay("CrestEast") }),
      ],
      pois: [
        Poi("safeZone", "撤下来的守军去这里", "poi", SP.safeZone, 3),
        Poi("bend", "路弯（发动机声）", "landmark", TankWay("Bend"), 4),
      ],
    };
  },
  // ---------------- 04 ----------------
  "04-1": () => ({
    units: [
      ...Squad({
        luo: { ...OPENING.frontPosts[0], faceTo: TankWay("BendExit"), stance: "crouch", aim: true },
        // 幺娃跟老周回集结处（OPENING.frontPosts[1]）：沿回集结处的交通壕走到支沟交汇再出来。
        yaowa: { ...OPENING.frontPosts[1], faceTo: A.collection, guess: true, path: [...RouteSlice(Routes.collectionReturn, Pt(28.6, -147.6), A.supportJunction), A.supportJunction] },
        heyoutian: { ...OPENING.frontPosts[2], weapon: "Zb26", faceTo: Pt(-33.6, -190), stance: "crouch", aim: true },
        liuwencai: { ...OPENING.frontPosts[3], faceTo: S.gap, stance: "crouch" },
      }),
      Zhou(OPENING.zhouRest, { faceTo: A.collection, stance: "crouch" }),
      ...Guards({
        atOf: { 0: GuardSafe(0), 1: GuardSafe(1), 2: GuardSafe(2), 3: GuardSafe(3), 4: GuardSafe(4), 5: S.gap,
          6: FRONT_GUARD_MG_GROUP.exit.at(-1), 7: S.lastCover },
        down: [5],
        // 背坡机枪组顺着 exit 爬下来，到最后一处掩护跟第二批会合（FRONT_GUARD_MG_GROUP 注）。
        pathOf: { 6: FRONT_GUARD_MG_GROUP.exit.slice(0, -1), 7: FRONT_GUARD_MG_GROUP.exit },
      }).map((u) => (u.id === "Guard6" || u.id === "Guard7" || u.id === "Guard5") ? u : Object.assign(u, { aim: undefined })),
      Tank("BendExit", { intent: [TankWay("Pressure"), TankWay("Approach"), BLOCK] }),
      ...TankEscorts(TankWay("BendExit"), { face: A.front, pathWays: ["CrestEast", "Shadow", "HullDown", "Descent", "Bend"] }),
      ...Group(4, "machineGun", { intent: true, at: {} }).map((u) => {
        const lane = FrontAssaultLane(u.x, u.z);
        u.intent = lane.map((p) => ({ x: R2(p.x), z: R2(p.z) }));
        return u;
      }),
      ...FrontRiflemen(4, { bound: "last" }),
      ...Group(4, "frontFlank", { atAll: "end", face: A.front }),
      ...Group(4, "frontOfficer", { atAll: "end", face: A.front, stance: "stand" }),
    ],
    pois: [Poi("gap", "缺口（守军倒在这里）", "danger", S.gap, 3)],
  }),
  "04-2": (ctx) => ({
    units: [
      ...Squad({
        luo: { ...S.rear, faceTo: ctx.player },
        yaowa: { ...OPENING.frontPosts[1], faceTo: A.collection, guess: true },
        heyoutian: { ...OPENING.frontPosts[2], weapon: "Zb26", faceTo: Pt(-33.6, -190), stance: "crouch", aim: true },
        liuwencai: { ...OPENING.frontPosts[3], faceTo: S.gap, stance: "crouch" },
      }),
      Nra("RearWallGuard", { x: 31.4, z: -143.6 }, { role: "guard", faceTo: ctx.player, stance: "crouch", guess: true }),
      Zhou(OPENING.zhouRest, { faceTo: A.collection, stance: "crouch" }),
      ...Guards({
        atOf: { 0: GuardSafe(0), 1: GuardSafe(1), 2: GuardSafe(2), 3: GuardSafe(3), 4: GuardSafe(4), 5: S.gap,
          6: FRONT_GUARD_MG_GROUP.exit.at(-1), 7: S.lastCover },
        down: [5],
      }).map((u) => (u.id === "Guard6" || u.id === "Guard7" || u.id === "Guard5") ? u : Object.assign(u, { aim: undefined })),
      Tank("Approach", { intent: [BLOCK] }),
      ...TankEscorts(TankWay("Approach"), { pathWays: ["Pressure"] }),
      // 04 nestFrontContested：侧翼组剩下的人 + 拔刀军官 + 西北台地的两个增援翻进阵位前半边（FrontCounterattack.NestFront）。
      ...Group(4, "frontFlank", { only: ["FrontFlankA"], at: { FrontFlankA: FRONT_NEST_FRONT_POSTS[0] }, face: ctx.player }),
      ...Group(4, "frontOfficer", { at: { FrontOfficer: FRONT_NEST_FRONT_POSTS[1] }, face: ctx.player, stance: "stand" }),
      ...Group(4, "frontReserve", { only: ["FrontReserveNorthWestPlateau0", "FrontReserveNorthWestPlateau1"],
        at: { FrontReserveNorthWestPlateau0: FRONT_NEST_FRONT_POSTS[2], FrontReserveNorthWestPlateau1: FRONT_NEST_FRONT_POSTS[3] }, face: ctx.player }),
      // 推进组（MachineGunAttack*）跃进到最后一道线，趴在土坎北面隔着院子打。
      ...Group(4, "machineGun", { at: {}, face: A.front }).map((u) => {
        const lane = FrontAssaultLane(u.x, u.z);
        return MoveTo(u, MgPushPost(u.id, lane.at(-1) || u), lane);
      }),
      ...FrontRiflemen(4, { bound: "last" }),
      ...Group(4, "sapInfiltrators", {}),
    ],
    pois: [
      Poi("attackSap", "支沟口", "poi", S.attackRoute[1], 1.5),
      Poi("bundleDrop", "抱弹的弟兄", "poi", A.bundleDrop, 1.5),
    ],
  }),
  // ---------------- 05 ----------------
  "05-1": (ctx) => ({
    units: [
      ...Squad({
        luo: { ...S.attackRoute[2], faceTo: S.attackRoute[3] },
        yaowa: { ...OPENING.frontPosts[1], faceTo: A.collection, guess: true },
        heyoutian: { ...OPENING.frontPosts[2], weapon: "Zb26", faceTo: Pt(-33.6, -190), stance: "crouch", aim: true },
        liuwencai: { ...OPENING.frontPosts[3], faceTo: S.gap, stance: "crouch" },
      }),
      Zhou(OPENING.zhouRest, { faceTo: A.collection, stance: "crouch" }),
      ...Guards({
        only: [0, 1, 2, 3, 4, 6, 7],
        atOf: { 0: GuardSafe(0), 1: GuardSafe(1), 2: GuardSafe(2), 3: GuardSafe(3), 4: GuardSafe(4), 6: FRONT_GUARD_MG_GROUP.exit.at(-1), 7: S.lastCover },
      }).map((u) => (u.id === "Guard6" || u.id === "Guard7") ? u : Object.assign(u, { aim: undefined })),
      Tank("Block"),
      ...TankEscorts(BLOCK).map((u) => Object.assign(u, FIRST_LEVEL_CHECKPOINT_ENEMY_POSTS[5][u.id] || {})),
      ...Group(5, "frontFlank", { only: ["FrontFlankA"], at: { FrontFlankA: FRONT_NEST_FRONT_PULLBACK }, face: A.front }),
      ...Group(5, "frontOfficer", { at: { FrontOfficer: Offset(FRONT_NEST_FRONT_PULLBACK, 1.6, -1.2) }, face: A.front, stance: "stand" }),
      ...Group(5, "machineGun", { at: {}, face: A.front }).map((u) => MoveTo(u, MgPushPost(u.id, FrontAssaultLane(u.x, u.z).at(-1) || u))),
      ...FrontRiflemen(5, { bound: "last" }),
      ...Group(5, "sapInfiltrators", { at: { BundleBendA: 2, BundleBendB: 1, SapInfilC: 0, SapInfilD: 0 }, intent: true }),
    ],
    pois: [Poi("roadLink", "日军钻进沟的口子", "danger", SP.roadLink.at(-1), 2)],
  }),
  "05-2": (ctx) => ({
    units: [
      Nra("BundleBearer", S.bundleBody, { name: "抱弹的弟兄", role: "fallen", stance: "prone", state: "down" }),
      ...Squad({
        luo: { ...S.attackRoute[3], faceTo: S.bundleBody },
        yaowa: { ...OPENING.frontPosts[1], faceTo: A.collection, guess: true },
        heyoutian: { ...OPENING.frontPosts[2], weapon: "Zb26", faceTo: Pt(-33.6, -190), stance: "crouch", aim: true },
        liuwencai: { ...OPENING.frontPosts[3], faceTo: S.gap, stance: "crouch" },
      }),
      Zhou(OPENING.zhouRest, { faceTo: A.collection, stance: "crouch" }),
      Tank("Block"),
      ...TankEscorts(BLOCK).map((u) => Object.assign(u, FIRST_LEVEL_CHECKPOINT_ENEMY_POSTS[5][u.id] || {})),
      ...Group(5, "frontFlank", { only: ["FrontFlankA"], at: { FrontFlankA: FRONT_NEST_FRONT_PULLBACK }, face: A.front }),
      ...Group(5, "frontOfficer", { at: { FrontOfficer: Offset(FRONT_NEST_FRONT_PULLBACK, 1.6, -1.2) }, face: A.front, stance: "stand" }),
      ...FrontRiflemen(5, { bound: "last" }),
      ...Group(5, "sapInfiltrators", { at: { BundleBendA: 5, BundleBendB: 4, SapInfilC: 3, SapInfilD: 2 }, intent: true }),
    ],
    pois: [Poi("bundles", "两捆集束弹", "objective", S.bundles[0], 0.8)],
  }),
  "05-3": (ctx) => ({
    units: [
      ...Squad({
        luo: { ...S.leaderAttackSide, faceTo: BLOCK, stance: "crouch", aim: true },
        yaowa: { ...OPENING.frontPosts[1], faceTo: A.collection, guess: true },
        heyoutian: { ...OPENING.frontPosts[2], weapon: "Zb26", faceTo: Pt(-33.6, -190), stance: "crouch", aim: true },
        liuwencai: { ...OPENING.frontPosts[3], faceTo: S.gap, stance: "crouch" },
      }),
      Nra("BundleBearer", S.bundleBody, { name: "抱弹的弟兄", role: "fallen", stance: "prone", state: "down" }),
      Zhou(OPENING.zhouRest, { faceTo: A.collection, stance: "crouch" }),
      Tank("Block", { faceTo: SP.tankTargets.gap }),
      // 靠这边的两名跟车（A、C，z −164 一线）转过来对着攻击位。
      ...TankEscorts(BLOCK).map((u) => SetFace(Object.assign(u, FIRST_LEVEL_CHECKPOINT_ENEMY_POSTS[5][u.id] || {}),
        ["TankEscortA", "TankEscortC"].includes(u.id) ? ctx.player : SP.tankTargets.gap)),
      ...Group(5, "frontFlank", { only: ["FrontFlankA"], at: { FrontFlankA: FRONT_NEST_FRONT_PULLBACK }, face: ctx.player }),
      ...Group(5, "frontOfficer", { at: { FrontOfficer: Offset(FRONT_NEST_FRONT_PULLBACK, 1.6, -1.2) }, face: ctx.player, stance: "stand" }),
      ...FrontRiflemen(5, { bound: "last" }),
      ...Group(5, "sapInfiltrators", { atAll: "end", face: S.rear }),
    ],
    pois: [
      Poi("track", "履带边（第一捆）", "objective", { x: BLOCK.x, z: BLOCK.z + 1.1 }, 1),
      Poi("rearDeck", "车尾后甲板（第二捆）", "objective", { x: BLOCK.x + 2.2, z: BLOCK.z - 0.9 }, 1),
    ],
  }),
  "05-4": (ctx) => {
    const crewTrack = (MISSION_TACTICS.TankCrewA?.points || []).map((p) => Pt(p.x, p.z));
    return {
      units: [
        ...Squad({
          luo: { x: 26.6, z: -149.2, faceTo: S.gap, stance: "crouch", guess: true },
          yaowa: { ...OPENING.frontPosts[1], faceTo: A.collection, guess: true },
          heyoutian: { ...OPENING.frontPosts[2], weapon: "Zb26", faceTo: Pt(-33.6, -190), stance: "crouch", aim: true },
          liuwencai: { ...OPENING.frontPosts[3], faceTo: S.gap, stance: "crouch" },
        }),
        Zhou(OPENING.zhouRest, { faceTo: A.collection, stance: "crouch" }),
        ...Guards({
          only: [0, 1, 2, 3, 4, 6, 7],
          atOf: { 0: GuardSafe(0), 1: GuardSafe(1), 2: GuardSafe(2), 3: GuardSafe(3), 4: GuardSafe(4), 6: S.gap, 7: Offset(S.gap, 0, 4.4) },
          intentOf: { 6: [...S.guardRoute.slice(2), GuardSafe(6)], 7: [...S.guardRoute.slice(3), GuardSafe(7)] },
        }).map((u) => (u.id === "Guard6" || u.id === "Guard7") ? u : Object.assign(u, { aim: undefined })),
        // 接防的人（MISSION_PLACEMENT.reliefPositions）从后交通壕上来。
        Nra("Relief0", P.reliefPositions[1], { role: "relief", faceTo: S.gap, stance: "crouch", aim: true }),
        Nra("Relief1", Offset(P.reliefPositions[1], -1.6, 2.2), { role: "relief", faceTo: S.gap, stance: "crouch", guess: true }),
        Tank("Block", { down: true }),
        ...TankEscorts(TankWay("Pressure"), { aim: false, stance: "stand", face: TankWay("BendExit"),
          intent: () => [TankWay("BendExit"), TankWay("Bend")] }),
        ...Group(5, "tankCrew", { at: { TankCrewA: crewTrack[1] || TankWay("Pressure"), TankCrewB: crewTrack[0] || TankWay("Approach") }, intent: false })
          .map((u) => Object.assign(u, { aim: undefined, stance: undefined, intent: [TankWay("BendExit"), TankWay("Bend")].map((p) => ({ x: p.x, z: p.z })) })),
        ...Group(5, "frontOfficer", { at: { FrontOfficer: Offset(FRONT_NEST_FRONT_PULLBACK, 1.6, -1.2) }, face: S.gap, stance: "stand" }),
        ...FrontRiflemen(5, { bound: "last" }),
        ...Group(5, "sapInfiltrators", { atAll: "end", down: ["BundleBendA", "BundleBendB", "SapInfilC", "SapInfilD"] })
          .map((u) => Object.assign(u, { guess: true })),
      ],
      pois: [Poi("gap", "缺口", "poi", S.gap, 3)],
    };
  },
  // ---------------- 06 ----------------
  "06-1": (ctx) => ({
    units: [
      Zhou(P.collection.zhouRecline, { faceTo: ctx.player, stance: "crouch" }),
      ...CollectionScene({ bearers: [...P.collection.bearerWait, P.collection.bearers[0], P.collection.bearers[3]] }),
      Nra("collectionRunner", P.collection.runner, { name: "传令兵", role: "runner", faceTo: A.collection }),
      ...Squad({
        luo: { ...A.orders, faceTo: ctx.player, guess: true },
        heyoutian: { x: -38.6, z: -101.8, faceTo: A.collection, guess: true },
        liuwencai: { x: -34.6, z: -102.6, faceTo: A.collection, guess: true },
        yaowa: { x: -33.2, z: -100.4, faceTo: P.collection.zhouRecline, guess: true },
      }),
      Nier(R.geng.nierRim, { yawDeg: YawDegFromActorRad(R.geng.nierRim.yaw), stance: "crouch" }),
      Civ("peasant", R.geng.peasantSpot, { name: "庄稼人", yawDeg: YawDegFromActorRad(R.geng.peasantSpot.yaw) }),
    ],
    pois: [
      Poi("collapsedSap", "塌了的交通沟（不走）", "danger", { x: -32, z: -84 }, 2.5),
    ],
  }),
  "06-2": () => ({
    units: [
      // Litter2 的检查点站位正好在 G06_3 机位上（玩家站的地方），往东挪 1 m。
      ...CheckpointLitters(7, { atOf: { Litter2: Offset(Checkpoint(7).column.litters[2], 1.0, -0.6) }, faceOf: { Litter2: Routes.southWalk[2] } }),
      ...Squad({
        luo: { ...MissionRoutePoint(Routes.southWalk, 40), faceTo: Routes.southWalk[3] },
        yaowa: { x: -27.2, z: -94.2, faceTo: Routes.southWalk[2], guess: true },
        heyoutian: { x: -27.6, z: -90.4, faceTo: Routes.southWalk[2], guess: true },
        liuwencai: { x: -29.8, z: -93.2, faceTo: Routes.southWalk[2], guess: true },
      }),
      ...CollectionScene(),
      Nier(R.geng.nierRim, { faceTo: Routes.southWalk[2], stance: "crouch" }),
      Civ("peasant", R.geng.peasantSpot, { name: "庄稼人", faceTo: Routes.southWalk[2] }),
    ],
    pois: [],
  }),
  // ---------------- 07 ----------------
  "07-1": (ctx) => {
    const playerM = ColumnProgress(ctx.player);
    return {
      units: [
        ...ColumnLitters(playerM + 26),
        ...Squad({
          luo: { ...ColumnPoint(playerM + 30), faceTo: ColumnPoint(playerM + 34) },
          yaowa: { ...ColumnPoint(playerM + 1.5), faceTo: ColumnPoint(playerM + 6), guess: true },
          heyoutian: { ...ColumnPoint(playerM + 11), faceTo: ColumnPoint(playerM + 13), guess: true },
          liuwencai: { ...ColumnPoint(playerM - 4), faceTo: ColumnPoint(playerM), guess: true },
        }),
        Nier(Offset(ctx.player, R.geng.rimOffsetM, -2), { faceTo: ColumnPoint(playerM + 6), guess: true }),
      ],
      pois: [],
    };
  },
  "07-2": () => {
    const holdM = ColumnProgress(A.southMouthHold);
    return {
      units: [
        ...ColumnLitters(holdM + 2),
        ...Squad({
          luo: { x: -9.6, z: -40.6, faceTo: A.mouthEmbankment, stance: "crouch", aim: true, guess: true },
          heyoutian: { x: -11.4, z: -43.2, faceTo: A.mouthEmbankment, stance: "crouch", aim: true, guess: true },
          yaowa: { ...ColumnPoint(holdM - 16), faceTo: A.southMouth, stance: "crouch", guess: true },
          liuwencai: { x: -12.8, z: -49.6, faceTo: A.mouthEmbankment, stance: "crouch", guess: true },
        }),
        Nier({ x: -10.6, z: -48.4 }, { faceTo: A.southMouth, stance: "crouch", guess: true }),
        ...Group(7, "southMouth", { atAll: "end", at: { MouthFlankA: 2, MouthFlankB: 2 }, face: A.southMouth }),
      ],
      pois: [Poi("openGround", "沟口外的空地", "danger", { x: 4, z: -31 }, 6)],
    };
  },
  "07-3": () => {
    const mouthM = ColumnProgress(A.southMouth);
    return {
      units: [
        ...ColumnLitters(mouthM + 30),
        ...Squad({
          luo: { ...ColumnPoint(mouthM + 34), faceTo: ColumnPoint(mouthM + 40) },
          heyoutian: { x: -6.6, z: -37.6, faceTo: A.mouthEmbankment, stance: "crouch", aim: true, guess: true },
          yaowa: { ...ColumnPoint(mouthM + 7), faceTo: ColumnPoint(mouthM + 16), guess: true },
          liuwencai: { x: -4.4, z: -34.2, faceTo: Pt(39, -27), stance: "crouch", aim: true, guess: true },
        }),
        Nier(R.geng.villageRefuge, { faceTo: Routes.southWalk.at(-1), path: [R.geng.mouthRimExit] }),
        ...Group(7, "southMouth", { atAll: "end", face: A.southMouth }),
      ],
      pois: [Poi("pole", "电线杆（通向村子）", "landmark", { x: 12, z: -24 }, 1.5)],
    };
  },
  // ---------------- 08 ----------------
  "08-1": (ctx) => {
    const playerM = ColumnProgress(ctx.player);
    return {
      units: [
        ...ColumnLitters(playerM - 3),
        ...Squad({
          luo: { x: 70.5, z: -23.2, faceTo: Pt(76, -24) },
          heyoutian: { x: 56, z: -20.4, faceTo: Pt(76, -24), guess: true },
          liuwencai: { x: 52.6, z: -21.2, faceTo: Pt(76, -24), guess: true },
          yaowa: { ...ColumnPoint(playerM - 8), faceTo: ctx.player, guess: true },
        }),
        Nier(R.geng.villageRefuge, { faceTo: ctx.player }),
        ...Group(8, "village", { face: Pt(76.65, -10) , faceOf: { VillageGunner: A.gate, RearWindow: Pt(70, 5), SideYard: A.gate, VillageCorner: Pt(58, -16.6), KitchenGuard: Pt(58, -16.6) } }),
      ],
      pois: [Poi("kitchenDoor", "灶屋北门", "poi", { x: 58, z: -16.6 }, 1.2)],
    };
  },
  "08-2": (ctx) => {
    const litterM = ColumnProgress(Pt(60, -20));
    return {
      units: [
        ...ColumnLitters(litterM),
        ...Squad({
          luo: { x: 74.4, z: -24.4, faceTo: Pt(76.65, 20) },
          heyoutian: { ...P.streetBlock.frontParty[0], faceTo: P.streetBlock.windowShooter, stance: "crouch", aim: true },
          liuwencai: { ...P.streetBlock.frontParty[1], faceTo: P.streetBlock.windowShooter, stance: "crouch", aim: true },
          yaowa: { ...Offset(ColumnPoint(litterM - 5), 0, -1.4), faceTo: ctx.player, guess: true },
        }),
        ...P.streetBlock.frontPartyWait.map((p, i) => Nra(`FrontParty${i}`, p, { role: "frontParty", faceTo: Pt(76.65, 20) })),
        Nier(R.geng.villageRefuge, { faceTo: ctx.player }),
        ...Group(8, "village", { faceOf: { VillageGunner: A.gate, RearWindow: Pt(70, 5), SideYard: A.gate, VillageCorner: Pt(58, -16.6), KitchenGuard: Pt(58, -16.6) } }),
        ...Group(8, "streetPush", { at: { StreetPushA: 2, StreetPushB: 1, StreetPushC: "start", StreetPushD: "start" }, intent: true }),
      ],
      pois: [
        Poi("streetBlock", "倒墙和翻车（主街堵死）", "landmark", P.streetBlock.gap, 4),
        Poi("kitchenDoor", "灶屋北门", "poi", { x: 58, z: -16.6 }, 1.2),
      ],
    };
  },
  "08-3": (ctx) => ({
    units: [
      ...MidLitterHoldSlots(P.streetBlock.litterWait, R.litterCount).map((slot, i) => LitterUnit(`Litter${i}`, slot, { faceTo: Pt(slot.x, slot.z - 4) })),
      ...Squad({
        luo: { x: 71.4, z: -23.4, faceTo: Pt(58, -16.6) },
        heyoutian: { ...P.streetBlock.frontParty[0], faceTo: Pt(78.6, -6), stance: "crouch", aim: true },
        liuwencai: { ...P.streetBlock.frontParty[1], faceTo: Pt(78.6, -6), stance: "crouch", aim: true },
        yaowa: { x: 66.6, z: -25.4, faceTo: ctx.player, guess: true },
      }),
      ...P.streetBlock.frontPartyWait.map((p, i) => Nra(`FrontParty${i}`, p, { role: "frontParty", faceTo: Pt(76.65, 20) })),
      Geng(MID.streetFight.gengDoorSide, { faceTo: MID.streetFight.gengHouseFace }),
      Nier(MID.streetFight.nierWallBack, { faceTo: MID.streetFight.gengDoorSide, stance: "crouch" }),
      GengCart(A.gengCartYard, { faceTo: A.gate }),
      ...Group(8, "village", { faceOf: { VillageGunner: A.gate, RearWindow: Pt(70, 5), SideYard: A.gate, VillageCorner: Pt(58, -16.6), KitchenGuard: Pt(58, -16.6) } }),
      ...Group(8, "streetPush", { atAll: "end", face: Pt(71, -24) }),
    ],
    pois: [
      Poi("kitchenDoor", "灶屋北门（挂灯笼）", "poi", { x: 58, z: -16.6 }, 1.2),
      Poi("westAlley", "西侧夹道", "poi", A.westAlleyNorth, 1.2),
    ],
  }),
  // ---------------- 09 ----------------
  "09-1": (ctx) => ({
    units: [
      ...MidLitterHoldSlots(P.streetBlock.litterWait, R.litterCount).map((slot, i) => LitterUnit(`Litter${i}`, slot, { faceTo: Pt(slot.x, slot.z - 4) })),
      ...Squad({
        luo: { ...P.ambushSquadPosts[0], faceTo: ctx.player },
        heyoutian: { ...P.ambushSquadPosts[1], faceTo: ctx.player },
        liuwencai: { ...P.ambushSquadPosts[2], faceTo: ctx.player },
        yaowa: { ...P.ambushYaowaPost, faceTo: A.melee, stance: "crouch" },
      }),
      Geng({ x: 61.2, z: -24.2 }, { faceTo: Pt(58, -16.6), guess: true }),
      Nier(MID.streetFight.nierWallBack, { faceTo: Pt(58, -16.6), stance: "crouch" }),
      GengCart(A.gengCartYard, { faceTo: A.gate }),
      ...Group(9, "village", { down: ["VillageCorner", "KitchenGuard"],
        faceOf: { VillageGunner: A.gate, RearWindow: Pt(70, 5), SideYard: A.gate } }),
      ...Group(9, "melee", { at: { MeleeLead: MID.kitchenAmbush.hide, MeleeAlley: MID.streetFight.windowThrowPost },
        faceOf: { MeleeLead: ctx.player, MeleeAlley: MID.streetFight.windowThrowAt }, intent: false,
        stanceOf: { MeleeLead: "stand" } }).map((u) => {
        const tactic = MISSION_TACTICS[u.id];
        if (u.id === "MeleeSecond" || u.id === "MeleeThird") u.intent = tactic.points.map((p) => ({ x: p.x, z: p.z }));
        if (u.id === "MeleeAlley") u.intent = tactic.points.slice(1).map((p) => ({ x: p.x, z: p.z }));
        return u;
      }),
      ...Group(9, "roofThrower", { face: A.gengCartYard }),
    ],
    pois: [
      Poi("passage", "过道（有人扑出来）", "danger", MID.kitchenAmbush.hide, 1.2),
      Poi("windowGrenade", "隔窗扔进来的手榴弹", "danger", MID.streetFight.windowThrowAt, 1.5),
    ],
  }),
  "09-2": (ctx) => ({
    units: [
      ...MidLitterHoldSlots(P.streetBlock.litterWait, R.litterCount).map((slot, i) => LitterUnit(`Litter${i}`, slot, { faceTo: Pt(slot.x, slot.z - 4) })),
      ...Squad({
        // 灶屋北墙外那条巷子（z −21.5…−16.8）里，跟在玩家身后。
        luo: { x: 49.4, z: -19.8, faceTo: A.westAlleySouth, guess: true },
        heyoutian: { x: 51.8, z: -20.2, faceTo: A.westAlleySouth, guess: true },
        liuwencai: { x: 53.8, z: -19.6, faceTo: A.westAlleySouth, guess: true },
        yaowa: { x: 66.6, z: -25.4, faceTo: ctx.player, guess: true },
      }),
      Geng({ x: 61.2, z: -24.2 }, { faceTo: Pt(58, -16.6), guess: true }),
      Nier(MID.streetFight.nierWallBack, { faceTo: Pt(58, -16.6), stance: "crouch" }),
      GengCart(A.gengCartYard, { faceTo: A.gate }),
      ...Group(9, "village", { faceOf: { VillageGunner: A.gate, RearWindow: Pt(70, 5), SideYard: A.gate } }),
      ...Group(9, "melee", { at: { MeleeLead: MID.kitchenAmbush.hide, MeleeAlley: MID.streetFight.windowThrowPost },
        faceOf: { MeleeLead: Pt(58, -1), MeleeAlley: MID.streetFight.windowThrowAt }, stanceOf: { MeleeLead: "stand" } }),
      // 夹道里那个由 westAlleyEntered 放出（08 的延迟组，PhaseLayout 在 09 已记为 cleared，这里按 08 的表核对）。
      ...Group(9, "alleyPop", { stage: 8, at: { AlleyPop: 1 }, intent: true }),
      ...Group(9, "roofThrower", { face: A.gengCartYard }),
    ],
    pois: [Poi("mgHouseDoor", "机枪屋侧门", "danger", { x: 49.1, z: 13.4 }, 1)],
  }),
  "09-3": (ctx) => {
    const cart = A.gengCartYard;
    return {
      units: [
        ...MidLitterHoldSlots(P.streetBlock.litterWait, R.litterCount).map((slot, i) => LitterUnit(`Litter${i}`, slot, { faceTo: Pt(slot.x, slot.z - 4) })),
        ...Squad({
          luo: { x: 51.2, z: 14.2, faceTo: P.sideRoomGunner, stance: "crouch", guess: true },
          heyoutian: { x: 52.8, z: 12.6, faceTo: P.sideRoomGunner, guess: true },
          liuwencai: { x: 50.4, z: 11.8, faceTo: A.roofPost, guess: true },
          yaowa: { x: 66.6, z: -25.4, faceTo: Pt(58, -16.6), guess: true },
        }),
        GengCart(cart, { faceTo: A.gate }),
        Geng(Offset(cart, 1.6, 2.2), { faceTo: A.gate, guess: true, path: [...THROUGH_KITCHEN, Pt(53, 24)] }),
        Nier(Offset(cart, -0.9, -2.2), { faceTo: A.roofPost, path: [...THROUGH_KITCHEN, Pt(53, 24)] }),
        ...Group(9, "village", { only: ["VillageGunner", "RearWindow", "SideYard"],
          faceOf: { VillageGunner: A.gate, RearWindow: Pt(70, 5), SideYard: A.gate }, stanceOf: { VillageGunner: "crouch" } }),
        ...Group(9, "melee", { atAll: "end", at: { MeleeLead: MID.kitchenAmbush.hide },
          down: ["MeleeLead", "MeleeSecond", "MeleeThird", "MeleeAlley"] }),
        ...Group(9, "alleyPop", { stage: 8, atAll: "end", down: ["AlleyPop"] }),
        ...Group(9, "roofThrower", { face: ctx.player, stance: "stand" }),
      ],
      pois: [
        Poi("yardGate", "院门（机枪扫着，现在不能走）", "danger", A.gate, 2),
        Poi("roof", "侧间屋顶", "danger", A.roofPost, 1.5),
      ],
    };
  },
  // ---------------- 10 ----------------
  "10-1": (ctx) => {
    const pockets = MISSION_CROWD_AREAS.find((a) => a.id === "courtyard").pockets;
    return {
      units: [
        // 担架从 08 的墙后停靠处穿灶屋、连屋进内院（village 路线那一段），在院里的停放位等门开。
        ...pockets.slice(0, R.litterCount).map((p, i) => LitterUnit(`Litter${i}`, p, { faceTo: A.gate, path: THROUGH_KITCHEN })),
        ...Squad({
          luo: { x: 54.6, z: 36.2, faceTo: Pt(77, 40), stance: "crouch", aim: true, guess: true },
          heyoutian: { ...MID.streetFight.heTable, faceTo: A.gate },
          liuwencai: { x: 56.2, z: 39.6, faceTo: Pt(77, 40), stance: "crouch", aim: true, guess: true },
          yaowa: { x: 52.4, z: 29.6, faceTo: A.gate, guess: true, path: THROUGH_KITCHEN },
        }),
        GengCart(MID.streetFight.cartWallFoot, { faceTo: A.gate }),
        Geng(MID.streetFight.gengUnbar, { faceTo: A.gate }),
        Nier(Offset(MID.streetFight.cartWallFoot, -0.9, -1.3), { faceTo: A.gate }),
        ...Group(10, "village", { only: ["RearWindow", "SideYard"], faceOf: { RearWindow: Pt(70, 5), SideYard: A.gate } }),
        ...Group(10, "village", { only: ["VillageGunner"], down: ["VillageGunner"] }),
        ...Group(10, "roofThrower", { face: A.gate }),
        ...Group(10, "courtyard", { atAll: "end", face: A.laneEast }),
        // 第二拨：草垛机枪已经架上，另外三个还在主街东侧房后往巷子里来（第一拨之后逐个放出，MID_TUNING.streetFight.laneWaveGapsS）。
        ...Group(10, "laneWave2", { at: { LaneGunner: "end", LaneRifleA: 1, LaneRifleB: 1, LaneRifleC: 1 }, face: A.gate, intent: true }),
      ],
      pois: [Poi("haystack", "巷尾草垛", "landmark", { x: 79.4, z: 42.8 }, 1.5)],
    };
  },
  "10-2": (ctx) => ({
    units: [
      ...CheckpointLitters(11).map((u) => Object.assign(u, { path: ViaThenRoute(OUT_OF_YARD, COLUMN_ROUTE, u) })),
      ...Squad({
        luo: { ...A.streetRejoin, faceTo: GATE_TOWER },
        heyoutian: { x: 70.4, z: 39.4, faceTo: Pt(90, 38), stance: "crouch", aim: true, guess: true, path: OUT_OF_YARD },
        liuwencai: { x: 68.4, z: 38.6, faceTo: GATE_TOWER, guess: true },
        yaowa: { x: 60.8, z: 39.2, faceTo: Pt(74, 39), guess: true },
      }),
      GengCart({ x: 64.2, z: 39.2 }, { faceTo: Pt(74, 39), guess: true, path: OUT_OF_YARD }),
      Geng({ x: 66.2, z: 38.2 }, { faceTo: Pt(74, 39), guess: true, path: OUT_OF_YARD }),
      Nier({ x: 62.2, z: 40.4 }, { faceTo: Pt(74, 39), guess: true, path: OUT_OF_YARD }),
      ...Group(10, "village", { only: ["RearWindow", "SideYard"], faceOf: { RearWindow: Pt(70, 5), SideYard: A.gate } }),
      ...Group(10, "roofThrower", { face: A.gate }),
    ],
    pois: [],
  }),
  // ---------------- 11 ----------------
  "11-1": (ctx) => ({
    units: [
      ...CheckpointLitters(12),
      ...Squad({
        luo: { x: 78.6, z: 80.4, faceTo: A.transfer },
        heyoutian: { x: 77.2, z: 69.4, faceTo: A.transfer, guess: true },
        liuwencai: { x: 74.8, z: 70.6, faceTo: A.transfer, guess: true },
        yaowa: { x: 77.6, z: 64.2, faceTo: A.transfer, guess: true },
      }),
      GengCart({ x: 79.3, z: 77.8 }, { faceTo: Pt(79.3, 86.5), guess: true }),
      Geng({ x: 80.9, z: 78.6 }, { faceTo: Pt(79.3, 86.5), guess: true }),
      Nier({ x: 79.2, z: 74.8 }, { faceTo: Pt(79.3, 86.5), guess: true }),
      ...MidWalkingWounded().map((w) => Nra(w.id, w, { role: "walkingWounded", faceTo: MID.walkingWoundedExit })),
      ...P.cartBays.map((b, i) => Civ(`BayCart${i}`, b, { kind: "cart", name: "", faceTo: Offset(b, 0, 4) })),
      ...MID.transferConvoy.carts.filter((c) => !c.from).map((c) => Civ(c.id, c, { kind: "cart", faceTo: Offset(c, 0, 4), yawDeg: YawDegFromActorRad(c.yaw) })),
      Nra("transferSorter", { x: 74.5, z: 108 }, { name: "接运兵", role: "transfer", faceTo: ctx.player, guess: true }),
    ],
    pois: [
      Poi("transfer", "接运点", "objective", A.transfer, 6),
      Poi("roadBridge", "路桥（x=76）", "landmark", { x: 76, z: 153 }, 4),
    ],
  }),
  // ---------------- 12 ----------------
  "12-1": (ctx) => ({
    units: [
      ...CheckpointLitters(12),
      ...MID.defencePosts.map((post) => Nra(post.cast, post, { name: SQUAD_NAMES[post.cast], role: "squad",
        faceTo: post.face || A.cartBoard, stance: post.face ? "crouch" : "stand", aim: !!post.face, path: post.face ? THROUGH_WALL_GAP : null })),
      Nier({ x: 77.4, z: 86.9 }, { faceTo: Pt(77.4, 84), stance: "crouch", guess: true }),
      GengCart(MID.streetFight.gengCartBay, { yawDeg: YawDegFromActorRad(MID.streetFight.gengCartBay.yaw), path: THROUGH_WALL_GAP }),
      // askPoint (93.9,109.6) 落在木箱堆 TransferCrates 的脚印里：人站到车头西侧。
      Geng({ x: 90.2, z: 110.4 }, { faceTo: MID.streetFight.gengCartBay, guess: true, path: THROUGH_WALL_GAP }),
      ...MidWalkingWounded().map((w) => Nra(w.id, w, { role: "walkingWounded", faceTo: MID.walkingWoundedExit })),
      ...P.cartBays.map((b, i) => Civ(`BayCart${i}`, b, { kind: "cart", name: "", faceTo: Offset(b, 0, 4) })),
      ...MID.transferConvoy.carts.filter((c) => !c.from).map((c) => Civ(c.id, c, { kind: "cart", yawDeg: YawDegFromActorRad(c.yaw) })),
      ...Group(12, "transfer", { at: { TransferGunner: 1, TransferRifleA: 4, TransferRifleB: 3, TransferRifleC: 2, TransferRifleD: 2, TransferRifleE: "start" }, intent: true }),
      ...Group(12, "transferAlley", {}),
    ],
    pois: [
      Poi("queueLane", "排队道（机枪扫这里）", "danger", MID.loadingThreatPoint, 3),
      Poi("gateTower", "村南门楼", "landmark", GATE_TOWER, 3),
    ],
  }),
  "12-2": (ctx) => ({
    units: [
      ...CheckpointLitters(12, { atOf: { Litter5: Offset(A.cartBoard, -1.6, 0.6) }, faceOf: { Litter5: A.cartBoard } }),
      ...MID.defencePosts.map((post) => Nra(post.cast, post, { name: SQUAD_NAMES[post.cast], role: "squad",
        faceTo: post.cast === "yaowa" ? A.cartBoard : post.face, stance: post.face ? "crouch" : "stand" })),
      Nier({ x: 86.6, z: 114.6 }, { faceTo: A.cartBoard, guess: true }),
      GengCart(A.cartBoard, { yawDeg: 180 }),
      Geng(Offset(A.cartBoard, 1.5, -3.6), { faceTo: A.cartBoard, guess: true }),
      ...P.cartBays.map((b, i) => Civ(`BayCart${i}`, b, { kind: "cart", name: "", faceTo: Offset(b, 0, 4) })),
      ...MID.transferConvoy.carts.filter((c) => !c.from).map((c) => Civ(c.id, c, { kind: "cart", yawDeg: YawDegFromActorRad(c.yaw) })),
      ...Group(12, "transfer", { atAll: "end", down: MISSION_ENCOUNTERS.transfer.map((m) => m.id) }),
      ...Group(12, "transferAlley", { atAll: "end", down: MISSION_ENCOUNTERS.transferAlley.map((m) => m.id) }),
    ],
    pois: [Poi("cartBoard", "老耿的驴车（上车处）", "poi", A.cartBoard, 2)],
  }),
  "12-3": () => ({
    units: [
      ...CheckpointLitters(13, { skip: ["Litter5"] }),
      ...MID.defencePosts.filter((p) => p.cast !== "yaowa").map((post) => Nra(post.cast, post, { name: SQUAD_NAMES[post.cast], role: "squad",
        faceTo: post.face, stance: "crouch" })),
      Nra("yaowa", Offset(A.cartBoard, -1.2, 1.6), { name: "幺娃", role: "squad", faceTo: Routes.cartRide[2], guess: true }),
      GengCart(Routes.cartRide[0], { faceTo: Routes.cartRide[1], intent: Routes.cartRide.slice(1), speedMps: 1.3 }),
      Geng(Offset(Routes.cartRide[0], -2.4, -0.8), { faceTo: Routes.cartRide[1], guess: true }),
      Nier(Offset(Routes.cartRide[0], 0.8, 1.8), { faceTo: Routes.cartRide[1], guess: true }),
      ...P.cartBays.map((b, i) => Civ(`BayCart${i}`, b, { kind: "cart", name: "", faceTo: Offset(b, 0, 4) })),
      ...MID.transferConvoy.carts.filter((c) => !c.from).map((c) => Civ(c.id, c, { kind: "cart", yawDeg: YawDegFromActorRad(c.yaw) })),
    ],
    pois: [Poi("lowWall", "村口低墙", "landmark", A.transferWall, 2)],
  }),
  // ---------------- 13 ----------------
  "13-1": (ctx) => {
    const cartAt = Pt(77.6, 121.6);
    return {
      units: [
        ...CheckpointLitters(13, { skip: ["Litter5"] }),
        GengCart(cartAt, { faceTo: Routes.cartRide[4], intent: [Routes.cartRide[3], Routes.cartRide[4]] }),
        Geng(Offset(cartAt, -1.6, 1.2), { faceTo: Pt(76, 146), guess: true }),
        Nier(Offset(cartAt, -0.3, 2.6), { faceTo: cartAt, stance: "crouch", guess: true }),
        Nra("yaowa", Offset(cartAt, 0.6, 1.8), { name: "幺娃", role: "squad", faceTo: Offset(cartAt, -0.3, 2.6), guess: true }),
        ...Squad({
          luo: { x: 76.4, z: 111.2, faceTo: A.cartHalt, guess: true },
          heyoutian: { x: 78.6, z: 104.4, faceTo: Pt(76, 146), guess: true },
          liuwencai: { x: 76.2, z: 102.8, faceTo: Pt(76, 146), guess: true },
        }),
        ...MID.transferConvoy.carts.filter((c) => !c.from).map((c) => Civ(c.id, c, { kind: "cart", yawDeg: YawDegFromActorRad(c.yaw) })),
        ...Group(13, "air", { intent: true }),
      ],
      pois: [Poi("strafe", "扫射的弹着线", "danger", { x: 76, z: 132 }, 4)],
    };
  },
  "13-2": (ctx) => {
    const unload = { x: A.cartHalt.x - 3.4, z: A.cartHalt.z - 0.4 };
    return {
      units: [
        // 第一轮扫过之后（检查点 14 的快照）：Litter6 的人被打倒在车路上，Litter4 卸在路边等人抬。
        ...CheckpointLitters(14, { atOf: { Litter5: unload }, faceOf: { Litter5: A.ditchMouth } }),
        GengCart(A.cartHalt, { faceTo: Pt(76, 146) }),
        Geng(Offset(unload, 0.4, -1.2), { faceTo: unload }),
        Nier(Offset(unload, -1.6, 1.4), { faceTo: A.ditchMouth, guess: true }),
        Nra("transferSorter", { x: 70.2, z: 132.6 }, { name: "接运兵", role: "transfer", faceTo: A.ditchMouth, guess: true }),
        ...Squad({
          luo: { ...Offset(A.cartHalt, -1, -2.2), faceTo: A.ditchMouth },
          yaowa: { ...Offset(unload, -0.8, 1.2), faceTo: A.ditchMouth, guess: true },
          heyoutian: { x: 74.2, z: 128.8, faceTo: Pt(100, 120), stance: "crouch", aim: true, guess: true },
          liuwencai: { x: 72.6, z: 126.6, faceTo: Pt(100, 120), stance: "crouch", guess: true },
        }),
        Civ("ConvoyWreck", MID.transferConvoy.carts.find((c) => c.id === "ConvoyWreck"), { kind: "cart", name: "侧翻的车", state: "down",
          yawDeg: YawDegFromActorRad(MID.transferConvoy.carts.find((c) => c.id === "ConvoyWreck").yaw) }),
        ...Group(13, "air", { atAll: "end", face: A.cartHalt }),
      ],
      pois: [Poi("roadBridge", "炸断的路桥", "danger", { x: 76, z: 153 }, 4)],
    };
  },
  // ---------------- 14 ----------------
  "14-1": (ctx) => {
    const ahead = Lerp(ctx.player, A.ditchMouth, 2.4 / Dist(ctx.player, A.ditchMouth));
    return {
      units: [
        ...CheckpointLitters(14, { atOf: { Litter5: ahead }, faceOf: { Litter5: A.ditchMouth } }),
        Geng(Offset(ahead, -1.2, -1.4), { faceTo: A.ditchMouth, guess: true }),
        Nier(Offset(ahead, -6.2, -2.4), { faceTo: A.ditchMouth, guess: true }),
        GengCart(A.cartHalt, { faceTo: Pt(76, 146) }),
        Civ("drover", END.droverPost, { name: "赶车人", yawDeg: YawDegFromActorRad(END.droverPost.yaw) }),
        Civ("droverCart", END.droverCart, { kind: "cart", name: "丢下的车", yawDeg: YawDegFromActorRad(END.droverCart.yaw) }),
        ...Squad({
          luo: { x: 55.8, z: 116.4, faceTo: A.ditch, guess: true },
          yaowa: { ...Lerp(ctx.player, A.ditchMouth, 0.45), faceTo: A.ditchMouth, guess: true },
          heyoutian: { ...END.picketPosts[0], faceTo: Pt(80, 116), stance: "crouch", aim: true, guess: true },
          liuwencai: { ...END.picketPosts[2], faceTo: Pt(80, 116), stance: "crouch", guess: true },
        }),
        Civ("ConvoyWreck", MID.transferConvoy.carts.find((c) => c.id === "ConvoyWreck"), { kind: "cart", name: "侧翻的车", state: "down",
          yawDeg: YawDegFromActorRad(MID.transferConvoy.carts.find((c) => c.id === "ConvoyWreck").yaw) }),
        ...Group(14, "air", { atAll: "end", face: A.cartHalt }),
      ],
      pois: [Poi("aircraftTurn", "飞机回转的方向", "danger", { x: 100, z: 160 }, 6)],
    };
  },
  "14-2": () => {
    const pursuit = MISSION_PURSUIT_ROUTE;
    const pursuers = ["AirPursuerA", "AirPursuerB", "AirPursuerC", "AirPursuerD"];
    return {
      units: [
        ...CheckpointLitters(14, { atOf: { Litter5: Offset(A.ditchMouth, -0.6, 0.6) }, faceOf: { Litter5: A.ditch } }),
        Geng(Offset(A.ditchMouth, 0.8, -0.8), { faceTo: A.ditchMouth }),
        Nier({ x: 47.4, z: 116.8 }, { faceTo: A.ditch, guess: true }),
        Civ("drover", END.droverPost, { name: "赶车人", yawDeg: YawDegFromActorRad(END.droverPost.yaw) }),
        Civ("droverCart", END.droverCart, { kind: "cart", name: "丢下的车", yawDeg: YawDegFromActorRad(END.droverCart.yaw) }),
        GengCart(A.cartHalt, { faceTo: Pt(76, 146) }),
        ...Squad({
          luo: { x: 45.2, z: 115.6, faceTo: A.ditchMouth, guess: true },
          yaowa: { ...Offset(A.ditchMouth, -1.6, 1.2), faceTo: A.ditchMouth, stance: "crouch", guess: true },
          heyoutian: { ...END.picketPosts[0], faceTo: Pt(80, 116), stance: "crouch", aim: true, guess: true },
          liuwencai: { ...END.picketPosts[1], faceTo: Pt(80, 116), stance: "crouch", aim: true, guess: true },
        }),
        ...Group(14, "air", { at: Object.fromEntries(pursuers.map((id, i) => [id, pursuit[i]])), face: A.ditchMouth })
          .map((u, i) => Object.assign(u, { intent: pursuit.slice(i + 1, 4).map((p) => ({ x: p.x, z: p.z })) })),
      ],
      pois: [Poi("ditch", "西沟", "landmark", A.ditch, 3)],
    };
  },
  // ---------------- 15 ----------------
  "15-1": (ctx) => {
    const ev = Routes.evacuation;
    return {
      units: [
        LitterUnit("Litter5", { x: 38.2, z: 118.2 }, { faceTo: ev[2] }),
        LitterUnit("Litter4", MissionRoutePoint(ev, 26), { faceTo: ev[2], path: ROAD_TO_DITCH }),
        LitterUnit("Litter6", MissionRoutePoint(ev, 30), { faceTo: ev[2], path: ROAD_TO_DITCH }),
        ...Squad({
          heyoutian: { x: 36.4, z: 121.6, faceTo: ctx.player },
          luo: { x: 35, z: 124.8, faceTo: ev[2] },
          liuwencai: { ...MissionRoutePoint(ev, 34), faceTo: ev[2] },
          yaowa: { x: 39.4, z: 117.4, faceTo: { x: 38.2, z: 118.2 }, stance: "crouch" },
        }),
        Geng({ x: 37.6, z: 116.4 }, { faceTo: { x: 38.2, z: 118.2 }, guess: true }),
        Nier({ x: 39.2, z: 120.2 }, { faceTo: ctx.player, guess: true }),
        ...END.picketPosts.map((p, i) => Nra(`Picket${i}`, p, { role: "picket", yawDeg: YawDegFromActorRad(p.yaw), stance: "crouch", aim: true })),
        Civ("drover", END.droverPost, { name: "赶车人", yawDeg: YawDegFromActorRad(END.droverPost.yaw) }),
        Civ("droverCart", END.droverCart, { kind: "cart", name: "丢下的车", yawDeg: YawDegFromActorRad(END.droverCart.yaw) }),
      ],
      pois: [Poi("westDitch", "西沟（往南）", "landmark", ev[2], 3)],
    };
  },
  "15-2": () => {
    // 担架队沿西沟（evacuation）往沟尾坡顶走，队首老周那副快到 wallPathStart。
    const ev = Routes.evacuation, endM = MissionRouteProjection(ev, A.wallPathStart).progress;
    const At = (m, side = 0) => RouteSide(ev, endM - m, side);
    return {
      units: [
        LitterUnit("Litter5", At(3), { faceTo: At(1) }),
        LitterUnit("Litter4", At(11), { faceTo: At(9) }),
        LitterUnit("Litter6", At(15), { faceTo: At(13) }),
        ...Squad({
          luo: { ...RouteSide(Routes.wallPath, 1.5, 0.8), faceTo: Routes.wallPath[1] },
          yaowa: { ...At(5.5, 1.1), faceTo: At(3), guess: true },
          heyoutian: { ...At(18, 0.9), faceTo: At(15), guess: true },
          liuwencai: { ...At(21, -0.9), faceTo: At(18), guess: true },
        }),
        Geng(At(4.5, -1.2), { faceTo: At(2), guess: true }),
        Nier(At(8, 1.2), { faceTo: At(6), guess: true }),
      ],
      pois: [Poi("sign", "路牌", "landmark", { x: 54.6, z: 208.4 }, 1)],
    };
  },
  "15-3": (ctx) => {
    // 夹道里（wallPath）：玩家在西行段，老周的担架在前面快到拐角，后两副在身后；掉队的步行伤员投回夹道中线（END_TUNING 注）。
    const wp = Routes.wallPath, playerM = MissionRouteProjection(wp, ctx.player).progress;
    const At = (m, side = 0) => RouteSide(wp, playerM + m, side);
    return {
      units: [
        LitterUnit("Litter5", At(6.5), { faceTo: At(8.5) }),
        LitterUnit("Litter4", At(-6), { faceTo: At(-4) }),
        LitterUnit("Litter6", At(-10), { faceTo: At(-8) }),
        ...P.wallPath.stragglers.map((s, i) => {
          const m = MissionRouteProjection(wp, s).progress;
          return Nra(`Straggler${i}`, RouteSide(wp, m, i % 2 ? 0.6 : -0.6), { role: "walkingWounded", faceTo: RouteSide(wp, m + 2) });
        }),
        ...Squad({
          luo: { ...At(11.5), faceTo: At(14) },
          yaowa: { ...At(4, 0.8), faceTo: At(6.5), guess: true },
          heyoutian: { ...At(-3, 0.7), faceTo: At(-1), guess: true },
          liuwencai: { ...At(-8, -0.7), faceTo: At(-6), guess: true },
        }),
        Geng(At(8.5, -0.8), { faceTo: At(10.5), guess: true }),
        Nier(At(2, -0.8), { faceTo: At(4), guess: true }),
      ],
      pois: [Poi("lanternPole", "灯笼杆（在这里左拐）", "landmark", { x: 18.45, z: 213.85 }, 1)],
    };
  },
  "15-4": (ctx) => {
    const wp = Routes.wallPath, playerM = MissionRouteProjection(wp, ctx.player).progress;
    const At = (m, side = 0) => RouteSide(wp, playerM + m, side);
    return {
      units: [
        LitterUnit("Litter5", At(9), { faceTo: A.receptionGate }),
        LitterUnit("Litter4", At(-4), { faceTo: At(-2) }),
        LitterUnit("Litter6", At(-8), { faceTo: At(-6) }),
        Nra("GateGuardNorth", END.gateBlock, { name: "院门守军", role: "gateGuard", yawDeg: YawDegFromActorRad(END.gateBlock.yaw) }),
        Nra("GateGuardSouth", P.receptionYard.gateGuard[1], { role: "gateGuard", faceTo: ctx.player }),
        Nra("receiver", END.receiverMeet, { name: "接收人员", role: "receiver", yawDeg: YawDegFromActorRad(END.receiverMeet.yaw) }),
        ...Squad({
          luo: { ...At(13), faceTo: A.receptionGate },
          yaowa: { ...At(6, 0.8), faceTo: A.receptionGate, guess: true },
          heyoutian: { ...At(-2, 0.7), faceTo: At(0), guess: true },
          liuwencai: { ...At(-6, -0.7), faceTo: At(-4), guess: true },
        }),
        Geng(At(11, -0.8), { faceTo: A.receptionGate, guess: true }),
        Nier({ x: 4.6, z: 236.8 }, { faceTo: Pt(4.6, 238.8), stance: "crouch", guess: true }),
      ],
      pois: [],
    };
  },
  // ---------------- 16–17 ----------------
  "16-1": (ctx) => ({
    units: [
      LitterUnit("Litter5", { x: -12.6, z: 243.6 }, { faceTo: Reception.yardJunction }),
      ...CheckpointLitters(16, { skip: ["Litter5"] }).map((u) => Object.assign(u, { path: YARD_TO_WARD })),
      Nra("surgeon", END.surgeonPoint, { name: "军医", role: "surgeon", yawDeg: YawDegFromActorRad(END.surgeonPoint.yaw) }),
      Nra("GateGuardNorth", P.receptionYard.gateGuard[0], { name: "院门守军", role: "gateGuard", faceTo: Pt(16, 230) }),
      Nra("GateGuardSouth", P.receptionYard.gateGuard[1], { role: "gateGuard", faceTo: Pt(16, 230) }),
      Nra("receiver", P.receptionYard.receiver, { name: "接收人员", role: "receiver", faceTo: ctx.player }),
      ...Squad({
        yaowa: { x: -13.4, z: 246.2, faceTo: Reception.yardJunction, guess: true },
        luo: { x: -5.4, z: 239.8, faceTo: Reception.wardEntry, guess: true },
        heyoutian: { x: -4.6, z: 242.6, faceTo: Reception.wardEntry, guess: true },
        liuwencai: { x: -6.8, z: 237.6, faceTo: Reception.wardEntry, guess: true },
      }),
      Geng({ x: -1.6, z: 236.4 }, { faceTo: ctx.player, guess: true }),
      Nier({ x: 4.6, z: 236.8 }, { faceTo: Pt(4.6, 238.8), stance: "crouch", guess: true }),
    ],
    pois: [Poi("wardDoor", "厢房南门（门槛）", "poi", Reception.wardThreshold, 1)],
  }),
  "17-1": (ctx) => ({
    units: [
      LitterUnit("Litter5", A.zhouDrop, { name: "老周", faceTo: Pt(A.zhouDrop.x, A.zhouDrop.z - 4), state: "down" }),
      ...CheckpointLitters(17, { skip: ["Litter5"] }),
      Nra("surgeon", END.surgeonExamine, { name: "军医", role: "surgeon", yawDeg: YawDegFromActorRad(END.surgeonExamine.yaw), stance: "crouch" }),
      Nra("yaowa", P.receptionYard.yaowaBedside, { name: "幺娃", role: "squad", faceTo: A.zhouDrop, stance: "crouch" }),
      LitterUnit("NextLitter", P.receptionYard.nextLitterEntry, { name: "又一副担架", faceTo: END.nextLitterRoute[1],
        intent: END.nextLitterRoute.slice(1), speedMps: END.nextLitterMps }),
      Nra("luo", END.squadAssign.luo.at(-1), { name: "罗班长", role: "squad", faceTo: Pt(-17, 252) }),
      Nra("heyoutian", END.squadAssign.heyoutian.at(-1), { name: "何有田", role: "squad", faceTo: Pt(-18, 252) }),
      Nra("liuwencai", END.squadAssign.liuwencai[1], { name: "刘文财", role: "squad", faceTo: A.receptionGate }),
      Nra("GateGuardNorth", P.receptionYard.gateGuard[0], { name: "院门守军", role: "gateGuard", faceTo: Pt(16, 230) }),
      Nra("GateGuardSouth", P.receptionYard.gateGuard[1], { role: "gateGuard", faceTo: Pt(16, 230) }),
    ],
    pois: [Poi("southGate", "院南门（关着）", "landmark", { x: -24.5, z: 251.5 }, 1.5)],
  }),
  // ---------------- 18 ----------------
  "18-1": (ctx) => ({
    units: [
      LitterUnit("Litter5", A.zhouDrop, { name: "老周", faceTo: Pt(A.zhouDrop.x, A.zhouDrop.z - 4), state: "down" }),
      ...CheckpointLitters(18, { skip: ["Litter5"] }),
      LitterUnit("NextLitter", END.nextLitterRoute.at(-1), { name: "又一副担架", faceTo: Pt(-30, 232) }),
      Nra("surgeon", Offset(END.nextLitterRoute.at(-1), 1.2, 0.8), { name: "军医", role: "surgeon", faceTo: END.nextLitterRoute.at(-1), stance: "crouch" }),
      Nra("runner", END.runnerRoute.at(-1), { name: "传令兵", role: "runner", faceTo: ctx.player }),
      ...Squad({
        yaowa: { ...P.receptionYard.yaowaBedside, faceTo: A.zhouDrop, stance: "crouch" },
        luo: { x: -22.4, z: 247.6, faceTo: END.runnerRoute.at(-1), guess: true },
        heyoutian: { x: -20.6, z: 248.6, faceTo: END.runnerRoute.at(-1), guess: true },
        liuwencai: { x: -21.2, z: 246.4, faceTo: END.runnerRoute.at(-1), guess: true },
      }),
      Nra("GateGuardNorth", P.receptionYard.gateGuard[0], { name: "院门守军", role: "gateGuard", faceTo: Pt(16, 230) }),
      Nra("GateGuardSouth", P.receptionYard.gateGuard[1], { role: "gateGuard", faceTo: Pt(16, 230) }),
    ],
    pois: [
      Poi("southGate", "院南门（关着）", "landmark", { x: -24.5, z: 251.5 }, 1.5),
      Poi("yardGate", "院门", "landmark", A.receptionGate, 2),
    ],
  }),
  "18-2": (ctx) => {
    const crossing = Routes.bridgeCrossing;
    const columnZ = [126.6, 123.2, 119.8, 116.4, 113, 109.6];
    return {
      units: [
        ...Squad({
          luo: { ...P.bridge.luoCover, faceTo: A.bridgeEnemy, stance: "crouch", aim: true, path: WARD_TO_BRIDGE },
          heyoutian: { ...P.bridge.heyoutianCover, faceTo: A.bridgeEnemy, stance: "crouch", aim: true, path: WARD_TO_BRIDGE },
          liuwencai: { x: -82.2, z: 164.4, faceTo: A.bridgeEnemy, stance: "crouch", aim: true, guess: true, path: WARD_TO_BRIDGE },
          yaowa: { x: -86.4, z: 165.6, faceTo: A.bridgeEnemy, stance: "crouch", guess: true, path: WARD_TO_BRIDGE },
        }),
        Nra("bridgeOfficer", P.bridge.officer, { name: "桥头军官", role: "officer", faceTo: A.railBridge }),
        ...P.bridge.demolition.map((d, i) => Nra(`Demolition${i}`, d, { role: "demolition", faceTo: Pt(-77, 159.4), stance: "crouch" })),
        ...columnZ.map((z, i) => Nra(`RearColumn${i}`, { x: -77 + (i % 2 ? 0.5 : -0.5), z }, { name: i === 0 ? "尾队" : "", role: "rearColumn",
          faceTo: crossing[2], intent: [crossing[2], crossing[3]], speedMps: R.bridgeColumnSpeedMps })),
        ...Group(18, "bridgeNorth", { atAll: "end", face: Pt(-77, 150) }),
        ...FAR_BANK_TANKS.map((t) => Ija(t.id, { x: t.x, z: FarBankTankPostZ(t) }, { kind: "tank", group: "farBank", role: "tank", faceTo: Pt(t.x, 160) })),
      ],
      pois: [
        Poi("pontoon", "浮桥（被炸段）", "landmark", { x: -77, z: 122 }, 6),
        Poi("northRidge", "北边土坎", "danger", { x: -84, z: 82.2 }, 5),
      ],
    };
  },
  "18-3": (ctx) => {
    const march = Routes.bridgeCrossing;
    return {
      units: [
        ...Squad({
          luo: { x: -67.6, z: 199.2, faceTo: A.marchOut, path: Routes.bridgeWithdraw.slice(1, -1) },
          heyoutian: { x: -64.4, z: 202.4, faceTo: { x: -77, z: 122 }, guess: true, path: Routes.bridgeWithdraw.slice(1, -1) },
          liuwencai: { x: -68.6, z: 202.6, faceTo: { x: -77, z: 122 }, guess: true, path: Routes.bridgeWithdraw.slice(1, -1) },
          yaowa: { x: -65.2, z: 199.6, faceTo: A.marchOut, guess: true, path: Routes.bridgeWithdraw.slice(1, -1) },
        }),
        Nra("bridgeOfficer", END.officerPullback.at(-1), { name: "桥头军官", role: "officer", faceTo: ctx.player, path: END.officerPullback.slice(0, -1) }),
        ...P.bridge.demolition.map((d, i) => Nra(`Demolition${i}`, END.demolitionPullback[i].at(-1), { role: "demolition",
          faceTo: { x: -77, z: 122 }, stance: "crouch", path: END.demolitionPullback[i].slice(0, -1) })),
        // 尾队过完桥（bridgeCrossing 共 163.8 m），在南岸往南走（队首在 150 m 处，往后隔 bridgeColumnSpacingM）。
        ...[0, 1, 2, 3, 4, 5].map((i) => Nra(`RearColumn${i}`, MissionRoutePoint(march, 150 - i * R.bridgeColumnSpacingM), { name: i === 0 ? "尾队" : "", role: "rearColumn",
          faceTo: march.at(-1), intent: [march.at(-1)], speedMps: R.bridgeColumnSpeedMps })),
        ...Group(18, "bridgeNorth", { atAll: "end", face: Pt(-77, 150) }),
        ...FAR_BANK_REAL.map((u) => Ija(u.id, u, { group: "farBank", role: u.role || "farBank", weapon: u.weapon, name: u.weapon === "Type11" ? "对岸机枪" : "",
          faceTo: Pt(u.x, 160), stance: u.weapon === "Type11" ? "prone" : "crouch", aim: true,
          path: [{ x: u.x, z: u.z - FAR_BANK_REAL_SPAWN_BACK_M }] })),
        ...FAR_BANK_TANKS.map((t) => Ija(t.id, { x: t.x, z: FarBankTankPushZ(t) }, { kind: "tank", group: "farBank", role: "tank", faceTo: Pt(t.x, 160) })),
      ],
      pois: [Poi("pontoon", "浮桥被炸段", "danger", { x: -77, z: 122 }, 8)],
    };
  },
  "18-4": () => {
    const column = P.night.column;
    return {
      units: [
        ...Squad({
          luo: { ...column[1], faceTo: A.northGate, path: NIGHT_MARCH },
          heyoutian: { ...column[3], faceTo: A.northGate, path: NIGHT_MARCH },
          liuwencai: { ...column[4], faceTo: A.northGate, path: NIGHT_MARCH },
          yaowa: { ...column[2], faceTo: A.northGate, path: NIGHT_MARCH },
        }),
        ...[0, 5, 6, 7].map((i) => Nra(`NightColumn${i}`, column[i], { role: "column", faceTo: A.northGate })),
        ...P.night.carriers.map((c, i) => Nra(`NightCarrier${i}`, c, { role: "carrier", faceTo: A.gateInside })),
        ...P.night.sectorAssigners.map((c, i) => Nra(`NightSector${i}`, c, { role: "sectorAssigner", faceTo: A.northGateApproach })),
        Nra("NightUsher", P.night.usher, { name: "带路军人", role: "usher", faceTo: A.northGateApproach }),
      ],
      pois: [Poi("northGate", "北门门洞", "landmark", A.northGate, 2.5)],
    };
  },
};

// ---------------------------------------------------------------------------
// 折线：同一个人在相邻关键帧之间沿哪条路走

/** 村里几条没有单独路线键的巷子（玩家与班组实际走的线）。 */
const VILLAGE_LANES = Object.freeze({
  // 村北口巷子 → 主街北口 → 主街北半段（障碍在 z 20）。
  street: Object.freeze([Pt(30, -23), Pt(48, -20), Pt(58, -20), Pt(70, -23), Pt(76, -24), Pt(76.6, 12)]),
  // 主街北口回到灶屋北门、穿灶屋进连屋（village 路线的那一段）。
  kitchen: Object.freeze([Pt(76, -24), Pt(70, -23), Pt(58, -20), Pt(58, -9), Pt(58, 8), Pt(58, 18)]),
  // 西侧夹道 x 49.3–51.7（灶屋北墙外 → 后院）。
  westAlley: Object.freeze([Pt(50.5, -20), A.westAlleyNorth, A.westAlleySouth, Pt(48, 20)]),
});

const PATH_ROUTES = Object.freeze([
  ...Object.values(Routes).filter((r) => Array.isArray(r) && r.length > 1 && Number.isFinite(r[0]?.x)),
  COLUMN_ROUTE, S.approach, S.rearRoute, S.route, S.attackRoute, S.leftRoute, S.zhouExit, S.guardRoute,
  BUNKER.exitLane, BUNKER.rescueRoute, BANTER.runnerRoute, SB.withdraw.lane, END.receptionApproach, END.runnerRoute,
  END.nextLitterRoute, MISSION_PURSUIT_ROUTE, FRONT_TANK_PATH, Routes.cartRide, FRONT_GUARD_MG_GROUP.exit,
  ...Object.values(VILLAGE_LANES),
].map((route) => Object.freeze(route.map((p) => Pt(p.x, p.z)))));

function RouteProgresses(route) {
  const out = [0];
  for (let i = 1; i < route.length; i++) out.push(out[i - 1] + Dist(route[i - 1], route[i]));
  return out;
}
const PATH_ROUTE_PROGRESS = PATH_ROUTES.map(RouteProgresses);

/** 路线上里程 a → b 之间（不含两端）的折点，按行进顺序。 */
function RouteVerticesBetween(route, prog, a, b) {
  const mid = [];
  if (b > a) { for (let i = 0; i < route.length; i++) if (prog[i] > a + 0.3 && prog[i] < b - 0.3) mid.push(route[i]); }
  else { for (let i = route.length - 1; i >= 0; i--) if (prog[i] < a - 0.3 && prog[i] > b + 0.3) mid.push(route[i]); }
  return mid;
}

const START_SNAP_M = 4, END_SNAP_M = 5, JUNCTION_M = 1.2;

/**
 * 从 from 走到 to：两头都贴着某条路线就沿那条路线走；贴不上一条的，试两条在某个折点相接的路线（例：后交通壕 → 支沟交汇 → 左翼机枪交通沟）。
 * 返回 path（不含起点、含终点）或 null（直线）。
 */
function RoutePathBetween(from, to) {
  const straight = Dist(from, to);
  const accept = (path) => {
    const length = PathLength([from, ...path]);
    return length <= straight * 2.5 + 5 ? length : null;
  };
  const near = PATH_ROUTES.map((route, i) => ({ route, prog: PATH_ROUTE_PROGRESS[i], a: MissionRouteProjection(route, from), b: MissionRouteProjection(route, to) }));
  let best = null;
  for (const r of near) {
    if (r.a.distance > START_SNAP_M || r.b.distance > END_SNAP_M || Math.abs(r.b.progress - r.a.progress) < 1) continue;
    const mid = RouteVerticesBetween(r.route, r.prog, r.a.progress, r.b.progress);
    if (!mid.length) continue;
    const path = [...mid, to];
    const length = accept(path);
    if (length === null) continue;
    const score = r.a.distance + r.b.distance;
    if (!best || score < best.score) best = { score, path };
  }
  if (best) return best.path;
  // 两条路线接力。
  let chain = null;
  for (const r1 of near) {
    if (r1.a.distance > START_SNAP_M) continue;
    for (const r2 of near) {
      if (r2 === r1 || r2.b.distance > END_SNAP_M) continue;
      for (let j = 0; j < r2.route.length; j++) {
        const v = r2.route[j];
        const onR1 = MissionRouteProjection(r1.route, v);
        if (onR1.distance > JUNCTION_M) continue;
        const path = [...RouteVerticesBetween(r1.route, r1.prog, r1.a.progress, onR1.progress), v,
          ...RouteVerticesBetween(r2.route, r2.prog, r2.prog[j], r2.b.progress), to];
        const length = accept(path);
        if (length === null || length < straight - 1e-6) continue;
        if (!chain || length < chain.length) chain = { length, path };
      }
    }
  }
  return chain && chain.path.length > 1 ? chain.path : null;
}

/** 同一条 track（遭遇组成员的战术折线）上从下标 i 走到 j。 */
function TrackPathBetween(track, i, j) {
  if (i === null || j === null || j <= i) return null;
  return track.slice(i + 1, j + 1);
}

// ---------------------------------------------------------------------------
// 组装

function NextFor(station, player, units) {
  const spec = NEXT_TARGETS[station.id];
  const next = { text: station.nextText };
  if (!spec) return next;
  let at = spec.at;
  if (at === "escorts") {
    const escorts = units.filter((u) => u.role === "escort" && u.state !== "down");
    at = { x: escorts.reduce((s, u) => s + u.x, 0) / escorts.length, z: escorts.reduce((s, u) => s + u.z, 0) / escorts.length };
  }
  return { ...next, x: R2(at.x), z: R2(at.z), radiusM: spec.r };
}

function FinishFacing(units, player, nextAt) {
  for (const u of units) {
    const meta = META.get(u) || {};
    let yaw = meta.yawDeg;
    if (yaw === null || yaw === undefined) {
      const target = meta.faceTo
        || (u.intent?.length ? u.intent[0] : null)
        || (u.side === "ija" ? player : (u.side === "civ" ? player : nextAt || player));
      yaw = Dist(u, target) > 1e-3 ? YawDegFromTo(u, target) : 0;
    }
    u.yawDeg = R1(WrapDeg(yaw));
  }
}

function SanitizeUnit(u) {
  // Object.assign 覆盖时可能留下 undefined：JSON 里不留空键。
  for (const key of Object.keys(u)) if (u[key] === undefined || u[key] === null || u[key] === "") delete u[key];
  if (u.state === "alive") delete u.state;
  if (u.stance === "stand") delete u.stance;
  if (u.aim === false) delete u.aim;
  u.x = R2(u.x); u.z = R2(u.z);
  for (const key of ["path", "intent"]) {
    if (!Array.isArray(u[key])) continue;
    u[key] = u[key].map((p) => ({ x: R2(p.x), z: R2(p.z) }));
    // 终点就是自己的位置时不重复写。
    if (key === "path" && u.path.length && Dist(u.path.at(-1), u) < 0.05) u.path.pop();
    if (!u[key].length) delete u[key];
  }
  return u;
}

/** 单位的键顺序（读起来顺手：身份 → 位置 → 姿态 → 走位）。 */
const UNIT_KEY_ORDER = ["id", "side", "kind", "name", "role", "group", "weapon", "x", "z", "yawDeg", "stance", "aim", "state", "arc", "speedMps", "path", "intent", "guess"];
function OrderUnit(u) {
  const out = {};
  for (const key of UNIT_KEY_ORDER) if (u[key] !== undefined) out[key] = u[key];
  for (const key of Object.keys(u)) if (!(key in out)) out[key] = u[key];
  return out;
}

function ZoneBoxes(keyframes) {
  return FIRST_LEVEL_BLOCKOUT_ZONES.map((zone) => {
    const pts = [];
    for (const kf of keyframes) {
      if (kf.stage < zone.stages[0] || kf.stage > zone.stages[1]) continue;
      pts.push(kf.player);
      if (Number.isFinite(kf.next?.x)) pts.push(kf.next);
      for (const poi of kf.pois) pts.push(poi);
    }
    const pad = 15, b = MISSION_LAYOUT.bounds;
    const box = {
      minX: Math.max(b.minX, Math.floor(Math.min(...pts.map((p) => p.x)) - pad)),
      maxX: Math.min(b.maxX, Math.ceil(Math.max(...pts.map((p) => p.x)) + pad)),
      minZ: Math.max(b.minZ, Math.floor(Math.min(...pts.map((p) => p.z)) - pad)),
      maxZ: Math.min(b.maxZ, Math.ceil(Math.max(...pts.map((p) => p.z)) + pad)),
    };
    return { id: zone.id, name: zone.name, stages: [...zone.stages], box };
  });
}

/**
 * 生成第一关白盒配置。
 * @param {{commit?: string, generatedAt?: string}} [options] 时钟与 git 由调用方给（CLI），这里不读。
 * @returns {object} tengxian-blockout/1 文档
 */
export function BuildFirstLevelBlockoutConfig({ commit = "", generatedAt = "" } = {}) {
  const keyframes = [];
  let prevUnits = new Map();
  for (const station of FIRST_LEVEL_BLOCKOUT_STATIONS) {
    const poseFn = POSES[station.id];
    const recipe = RECIPES[station.id];
    if (!poseFn || !recipe) throw new Error(`blockout: 关键帧 ${station.id} 缺机位或配方`);
    const pose = poseFn();
    const player = { x: R2(pose.x), z: R2(pose.z), yawDeg: R1(pose.yawDeg), pitchDeg: R1(pose.pitchDeg), stance: pose.stance };
    const { units: rawUnits, pois: recipePois } = recipe({ player, station });
    const seen = new Set();
    for (const u of rawUnits) {
      if (seen.has(u.id)) throw new Error(`blockout: ${station.id} 单位 id 重复：${u.id}`);
      seen.add(u.id);
    }
    const next = NextFor(station, player, rawUnits);
    // 相邻关键帧之间的走位折线：同一条战术折线优先，其次贴着已知路线。
    for (const u of rawUnits) {
      if (u.path?.length) continue;
      const prev = prevUnits.get(u.id);
      if (!prev || Dist(prev, u) < 2) continue;
      const meta = META.get(u), prevMeta = META.get(prev);
      let path = null;
      if (meta?.track && prevMeta?.track && meta.track.length === prevMeta.track.length && Dist(meta.track[0], prevMeta.track[0]) < 1e-6)
        path = TrackPathBetween(meta.track, prevMeta.trackAt, meta.trackAt);
      if (!path) path = RoutePathBetween(prev, u);
      if (path?.length > 1 || (path?.length === 1 && Dist(path[0], u) > 1e-6)) u.path = path.map((p) => ({ x: R2(p.x), z: R2(p.z) }));
    }
    FinishFacing(rawUnits, player, Number.isFinite(next.x) ? next : null);
    const units = rawUnits.map((u) => OrderUnit(SanitizeUnit(u)));
    const poiIds = new Set();
    const pois = [...recipePois, ...AutoPois(player, station.stage)].filter((p) => !poiIds.has(p.id) && poiIds.add(p.id));
    const notes = [station.notes, POSE_NOTES[station.id] || ""].filter(Boolean).join(" ");
    const kf = {
      id: station.id,
      stage: station.stage,
      stageTitle: station.stageTitle,
      name: station.name,
      player,
      what: station.what,
      next,
      how: [...station.how],
      notes,
      signals: FirstLevelSignalsFor(station.id, station.stage),
      units,
      pois,
    };
    keyframes.push(kf);
    prevUnits = new Map(rawUnits.map((u) => [u.id, u]));
  }
  return {
    schema: BLOCKOUT_SCHEMA,
    level: "FirstLevel",
    title: FIRST_LEVEL_BLOCKOUT_TITLE,
    source: {
      generator: FIRST_LEVEL_BLOCKOUT_GENERATOR,
      gameVersion: MISSION_WHITEBOX_VERSION,
      commit,
      generatedAt,
    },
    zones: ZoneBoxes(keyframes),
    keyframes,
  };
}

// ---------------------------------------------------------------------------
// 第一关白盒的实心体块（给校验与测试用：玩家点不该落在实心块里）

/**
 * 某组信号下第一关白盒的实心体块（MISSION_LAYOUT 的块 + 当前场景态的块 + 当前关着的门）。
 * 与 §2.1 的派生布局同口径：树模型块按树干（0.5 × 0.5）算，dynamic 块与 solid:false 的不算。
 * @returns {Array<{id,x,y,z,w,h,d,ry}>}
 */
export function FirstLevelSolidBlocks(signals = []) {
  const on = new Set(signals);
  const signalled = (name) => !!name && on.has(name);
  const out = [];
  const Push = (b) => {
    if (b.dynamic || b.solid === false) return;
    if (b.treeModel) out.push({ id: b.id, x: b.x, y: b.y, z: b.z, w: 0.5, h: b.h, d: 0.5, ry: 0 });
    else out.push({ id: b.id, x: b.x, y: b.y, z: b.z, w: b.w, h: b.h, d: b.d, ry: b.ry || 0 });
  };
  for (const b of MISSION_LAYOUT.blocks) Push(b);
  const states = MISSION_LAYOUT.scenario.states;
  const state = [...states].reverse().find((s) => !s.signal || signalled(s.signal));
  for (const b of state?.blocks || []) Push(b);
  for (const g of MISSION_LAYOUT.gates) {
    const absent = !!g.appearSignal && !signalled(g.appearSignal);
    const open = absent || signalled(g.signal);
    if (!open) Push(g);
  }
  return out;
}

/** 点 (x,z) 在不在某个实心块的脚印里（按 ry 转的矩形），且块的竖向跨度盖住离地 fromM–toM 那一段。 */
export function SolidBlockAt(blocks, x, z, { fromM = 0.35, toM = 1.6, marginM = 0 } = {}) {
  const ground = Ground(x, z);
  for (const b of blocks) {
    const c = Math.cos(b.ry || 0), s = Math.sin(b.ry || 0);
    const dx = x - b.x, dz = z - b.z;
    // three 的 rotation.y：局部 → 世界 x = lx·c + lz·s，z = −lx·s + lz·c；反过来取局部坐标。
    const lx = dx * c - dz * s, lz = dx * s + dz * c;
    if (Math.abs(lx) > b.w / 2 + marginM || Math.abs(lz) > b.d / 2 + marginM) continue;
    const bottom = b.y - b.h / 2, top = b.y + b.h / 2;
    if (top < ground + fromM || bottom > ground + toM) continue;
    return b;
  }
  return null;
}
