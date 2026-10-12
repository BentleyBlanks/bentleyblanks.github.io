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
// 走位折线按偏好逐条试（配方 path → 指定贴着走的路 lane → 战术折线 → 已知路线 → 两条接力 → 直线），取第一条身体不穿高墙的
// （BLOCKOUT_ROUTE_BODY）；组装完 FirstLevelBlockoutIssues 再按 PlanTransition 复查一遍，连同玩家站位（BLOCKOUT_PLAYER_BODY）
// 与摆位间距（BLOCKOUT_SPACING）一起报给 CLI；Script_EditorBlockoutConfigTest 按同一口径判失败。
//
// 朝向一律换成 yawDeg（0 = 北 −Z，+90 = 西，−90 = 东；前方 = (−sin, −cos)）。三种来源的换算见下面三个函数，
// 由 Script_EditorBlockoutConfigTest 钉住。MISSION_PLACEMENT 的 yaw 各块口径不一（块头注释写「0 朝 +z 南」，但接收院 /
// 浮桥爆破手等几处是按演员口径调的），所以这里凡是能说清「看向谁」的人一律写 faceTo，不直接搬表里的 yaw。
// ===========================================================================

import { BLOCKOUT_SCHEMA, YawDegFromTo, PathLength, PlanTransition, NormalizeBlockout } from "./Script_EditorBlockoutConfig.mjs";
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
import { FarBankSpawnAt, FarBankWalkInVia } from "./Script_FirstLevelBridgeFarBank.mjs";
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
  // 要守的是排队道（追兵机枪扫的那一段），不是玩家自己站的低墙射位（12_3 就在 A.transferWall 上）。
  "12-1": { at: MID.loadingThreatPoint, r: 3 },
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
 * 造一个单位。o: kind name role group weapon yawDeg faceTo stance aim state bearers arc speedMps path intent guess
 *               track（这个人跟的折线，含起点）trackAt（他此刻在折线上的下标）
 *               lane（从上一关键帧走过来时要贴着走的折线：从上一位置在它上面的投影上道，走到与这里平齐再下道）
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
  // §3：担架的 bearers = 抬的人数（缺省 2 不写）；0 = 放在地上 / 床边没人抬，1 = 只有前头一个（后头是玩家）。
  if (kind === "litter" && Number.isInteger(o.bearers) && o.bearers !== 2) u.bearers = o.bearers;
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
    lane: o.lane ? o.lane.map((p) => Pt(p.x, p.z)) : null,
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
/** 事后给一个人指定从上一关键帧走过来要贴着的折线（见 Unit 的 lane）。 */
function WithLane(u, lane) {
  const meta = META.get(u);
  if (meta) meta.lane = lane.map((p) => Pt(p.x, p.z));
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
 * o.pathOf:  { [id]: 折线 }，从上一关键帧走过来的路（绕墙用）
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
      // 花名册 role officer（拔刀军官）→ §3 的 kind officer（编辑器换军官模型）。
      kind: row.role === "officer" ? "officer" : undefined,
      group: groupId, role: row.role, weapon: row.weapon, name: ENEMY_NAMES[row.id],
      faceTo: o.faceOf?.[row.id] || (isDown ? null : (row.faceTo || row.fireAt || (o.intent && remaining[0]) || o.face || null)),
      stance: isDown ? "prone" : (o.stanceOf?.[row.id] || o.stance
        || (mg ? (WINDOW_GUNNERS.has(row.id) ? "crouch" : "prone") : (remaining.length && o.intent ? "stand" : "crouch"))),
      aim: !isDown && !(o.intent && remaining.length) && o.aim !== false,
      state: isDown ? "down" : "alive",
      speedMps: tactic?.mps,
      intent: o.intent && !isDown ? remaining : null,
      path: o.pathOf?.[row.id] || null,
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

/** 战车走的路（FRONT_TANK_PATH 的路点连线）。 */
const TANK_LANE = Object.freeze(FRONT_TANK_PATH.map((p) => Pt(p.x, p.z)));
/** 跟车步兵前后拉开的间距（一路纵队跟在车前后）。 */
const ESCORT_FILE_GAP_M = 2.5;

/**
 * 跟车步兵：挡口子的槽位（FRONT_TANK_ESCORT_SLOTS，相对 Block）平移到战车所在路点。
 * o.fileM：不按槽位，沿战车的路排成一路纵队（A 在 fileM 米处，往后每人隔 ESCORT_FILE_GAP_M）。
 * o.followTank：从上一关键帧走过来时贴着战车的路走（不把路点平移到槽位上：平移过的路点会穿过北边的破屋），
 *              走到与槽位平齐才下路。
 */
function TankEscorts(at, o = {}) {
  const block = TankWay("Block");
  return FRONT_TANK_ESCORT_SLOTS.map((slot, i) => {
    const dx = slot.x - block.x, dz = slot.z - block.z;
    const pos = Number.isFinite(o.fileM) ? MissionRoutePoint(TANK_LANE, o.fileM - i * ESCORT_FILE_GAP_M) : Offset(at, dx, dz);
    return Ija(slot.id, pos, {
      group: "tank", role: "escort", faceTo: o.face || SP.tankTargets.gap, stance: o.stance || "crouch", aim: o.aim ?? true,
      state: o.down?.includes(slot.id) ? "down" : "alive", intent: o.intent?.(slot), lane: o.followTank ? TANK_LANE : null });
  });
}
const TankLaneM = (wayId) => MissionRouteProjection(TANK_LANE, TankWay(wayId)).progress;

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
/**
 * 守军撤到的安全区落点（MISSION_PLACEMENT.guardWithdrawalRoutes 的末点）。表里 8 个末点在沟底排成一行、相邻只隔 0.5 m
 * （游戏里 AI 到了会自己散开），这里单号往北错 0.9 m，两排之间相邻的人相距 1 m 以上。
 */
const GuardSafe = (i) => { const p = P.guardWithdrawalRoutes[i].at(-1); return Pt(p.x, p.z - (i % 2 ? 0.9 : 0)); };

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
function CheckpointLitters(n, { skip = [], atOf = {}, faceOf = {}, bearersOf = {} } = {}) {
  const out = [];
  for (const l of Checkpoint(n).column.litters) {
    if (skip.includes(l.id)) continue;
    if (!atOf[l.id] && (l.loaded || l.evacuated || l.visible === false)) continue;
    const at = atOf[l.id] || l;
    out.push(LitterUnit(l.id, at, { yawDeg: atOf[l.id] ? null : YawDegFromActorRad(l.yaw || 0), faceTo: faceOf[l.id],
      state: !atOf[l.id] && l.state === "fallen" ? "down" : "alive", bearers: bearersOf[l.id] }));
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
/** 右侧阵位北墙外、矮墙段（RightNestNorthLow，x 24–32.5）北面一点：从阵位前半边出去翻这一段。 */
const NEST_LOW_WALL_OUT = Object.freeze(Pt(30.4, -158.2));
/** 妮儿躲在墙后（MID_TUNING.streetFight.nierWallBack 往西 1 m：原位贴着停放的 Litter2 前头抬的人）。 */
const NIER_WALL_BACK = Object.freeze(Offset(MID.streetFight.nierWallBack, -1, 0));
/** 08 墙后停靠处 → 灶屋北门 → 穿灶屋、连屋 → 后院 / 内院（担架队与老耿一家走的那一段 village 路线）。 */
const THROUGH_KITCHEN = Object.freeze([Pt(58, -20), Pt(58, -9), Pt(58, 8), Pt(58, 18)]);
/**
 * 灶屋（x 52–64、z −16.5…−1.5）：北门洞 x 57–59 在 z −16.5，进门是中间过道（x 55.7–59.9）；西间的隔墙在 z −13.9…−11.9 有个口。
 * 09 伏击时班长在西间（P.ambushSquadPosts[0]），进出都走：巷子 → 北门 → 过道 → 隔墙口。
 */
const KITCHEN_WEST_ROOM_IN = Object.freeze([Pt(58, -20), Pt(58, -12.9), Pt(54.8, -12.9)]);
const KITCHEN_WEST_ROOM_OUT = Object.freeze([...KITCHEN_WEST_ROOM_IN].reverse());
/** 厢房门口 → 后门 → toBridge 到南岸射位（18 接令后班组走的路）。 */
const WARD_TO_BRIDGE = Object.freeze([Pt(-26, 247), Pt(-35, 247), Pt(-38, 244), ...Routes.toBridge.map((p) => Pt(p.x, p.z))]);
/** 内院 → 院门合流点（MISSION_CROWD_AREAS.courtyard.merge）→ 门外绕行巷。 */
const OUT_OF_YARD = Object.freeze([Pt(53, 32.2), Pt(53, 39)]);
/** 村口低墙（z 84.05）东段与西段之间的通行口（x 78.1–81.0，MID_TUNING.villageWall.gapX 79.55）。 */
const THROUGH_WALL_GAP = Object.freeze([Pt(MID.villageWall.gapX, 82.5), Pt(MID.villageWall.gapX, 86.5)]);
/** 院门 → 院里 → 厢房南门（END_TUNING.receptionApproach 的后半段）。 */
const YARD_TO_WARD = Object.freeze([Pt(2, 240), Pt(-5, 240), Pt(-13, 240), Pt(-13, 249), Pt(-26, 249), Pt(-26, 241)]);
/** 夹道（wallPath）→ 院门 → 院里 → 厢房南门：15 走在夹道里的担架进院放到厢房里，贴着这条走（夹道出口外的石院墙挡着斜插）。 */
const WALL_PATH_TO_WARD = Object.freeze([...Routes.wallPath.map((p) => Pt(p.x, p.z)), ...YARD_TO_WARD.slice(1)]);
/** 接运点往南的车路口：两道路墙（x 70.75–71.25 / 79.75–80.25）从 z 90.6 起夹着车路，从低墙一线下来先进这个口。 */
const ROAD_MOUTH = Object.freeze({ east: Pt(78.2, 88.6), west: Pt(74.6, 88.6) });
/**
 * 车路西墙（x 70.65–71.35）的南头在 z 129.6，再往南到桥头墩（z 136.95）之间是空的：13 车停下后人从路上绕过墙头去西沟。
 * 车路一侧 → 墙头外一侧。
 */
const ROAD_WALL_SOUTH_END = Object.freeze([Pt(72.4, 131.8), Pt(69.6, 131.8)]);
/** 车路 → 物资箱北面 → 下沟口 → 西沟（MISSION_PURSUIT_ROUTE 那条线，撤离线 evacuation 的头）。 */
const ROAD_TO_DITCH = Object.freeze([Pt(74, 112), Pt(61, 112), Pt(60, 114), Pt(54, 114), Pt(39, 116)]);
/** 先走 via，再沿 route 走到 to 的投影。 */
function ViaThenRoute(via, route, to) { return [...via, ...RouteSlice(route, via.at(-1), to)]; }
/** 炸桥后随队往南（marchOut），黑屏后在夜里北门外的出生点归队（nightMarch 起点）。 */
const NIGHT_MARCH = Object.freeze([...Routes.marchOut.slice(1).map((p) => Pt(p.x, p.z)), Pt(Routes.nightMarch[0].x, Routes.nightMarch[0].z)]);

/** p 离 anchor 不到 minM 时沿两者连线推到 minM（两个人挤在一起时把后摆的那个挪开一点）。 */
function Apart(anchor, p, minM) {
  const d = Dist(anchor, p);
  if (d >= minM) return Pt(p.x, p.z);
  const dx = d > 1e-6 ? (p.x - anchor.x) / d : 1, dz = d > 1e-6 ? (p.z - anchor.z) / d : 0;
  return Pt(anchor.x + dx * minM, anchor.z + dz * minM);
}
/** 担架（中心 at、朝 faceTo）前头（sign 1）/ 后头（sign −1）抬杆处，离中心 1.6 m。 */
function LitterEnd(at, faceTo, sign) {
  const d = Dist(at, faceTo) || 1;
  return Pt(at.x + (faceTo.x - at.x) / d * 1.6 * sign, at.z + (faceTo.z - at.z) / d * 1.6 * sign);
}
/** 14-2 老周的担架：沟口东边一点，前头抬的人离玩家（14_1 机位）1.5 m。 */
const ZHOU_LITTER_1402 = Object.freeze(Offset(A.ditchMouth, 1.2, 0.6));
/** 一组人里挨得太近的（< 0.9 m，倒地的尸首常常落在同一个点上）后摆的那个沿连线挪开到 0.9 m。 */
function Spread(units, minM = 0.9) {
  for (let i = 1; i < units.length; i++) {
    for (let j = 0; j < i; j++) {
      if (Dist(units[i], units[j]) >= minM) continue;
      const p = Apart(units[j], units[i], minM);
      units[i].x = R2(p.x); units[i].z = R2(p.z);
    }
  }
  return units;
}
/** 冬瓜在刺杀处的位置；日兵甲站在他跟前（分镜 0.65 m，这里拉到 0.9 m，两个人的身体不叠）。 */
const COMRADE_AT = Object.freeze(Pt(4.06, -125.9));
const EXECUTIONER_AT = Object.freeze(Apart(COMRADE_AT, Pt(4.4, -125.35), 0.9));
/** 沟沿机枪组的射手：分镜里离副射手 0.7 m，往西拉到 0.9 m（副射手东边 1 m 是倒地的喊话兵）。 */
const BUNKER_GUNNER_AT = Object.freeze(Apart(SB.wall.heave.roots.loader, SB.wall.heave.roots.gunner, 0.9));

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
      Nra("comrade", COMRADE_AT, { name: "冬瓜", role: "comrade", faceTo: ctx.player, stance: "crouch" }),
      ...Group(1, "bunkerAssault", {
        allowStates: ["dormant", "active"],
        at: { BunkerExecutionerA: EXECUTIONER_AT, BunkerExecutionerB: SB.wall.rifleRoot, BunkerGunner: BUNKER_GUNNER_AT,
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
      Nra("comrade", COMRADE_AT, { name: "冬瓜", role: "comrade", stance: "prone", state: "down" }),
      Nra("shouter", BANTER.shouter, { name: "喊话的兵", role: "comrade", stance: "prone", state: "down" }),
      ...Group(2, "bunkerAssault", {
        at: { BunkerExecutionerA: EXECUTIONER_AT, BunkerExecutionerB: SB.wall.rifleRoot, BunkerGunner: BUNKER_GUNNER_AT,
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
        Nra("comrade", COMRADE_AT, { name: "冬瓜", role: "comrade", stance: "prone", state: "down" }),
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
          // 支沟里玩家前面几步（原先 3 m 处离玩家站位不到 0.5 m）。
          yaowa: { ...MissionRoutePoint(Routes.support, 7.5), faceTo: S.approach[1], guess: true },
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
        // 跟车步兵在战车前面沿路排成一路纵队（队首在 Cutting 路点）。
        ...TankEscorts(null, { fileM: TankLaneM("Cutting"), aim: false, stance: "stand", face: TankWay("CrestEast") }),
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
      ...TankEscorts(TankWay("BendExit"), { face: A.front, followTank: true }),
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
      ...TankEscorts(TankWay("Approach"), { followTank: true }),
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
      // 从阵位前半边退出来：翻北墙西段的矮墙（RightNestNorthLow），不穿东段的高墙。
      ...Group(5, "frontOfficer", { at: { FrontOfficer: Offset(FRONT_NEST_FRONT_PULLBACK, 1.6, -1.2) }, face: A.front, stance: "stand",
        pathOf: { FrontOfficer: [NEST_LOW_WALL_OUT] } }),
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
          // 担架队尾巴后面（队里每两副担架之间都站着抬的人，插不进去）。
          heyoutian: { ...ColumnPoint(playerM + 3), faceTo: ColumnPoint(playerM + 6), guess: true },
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
        // 担架停在沟里、玩家身后（队首前头抬的人离玩家约 1 m）。
        ...ColumnLitters(holdM - 2.6),
        ...Squad({
          luo: { x: -9.6, z: -40.6, faceTo: A.mouthEmbankment, stance: "crouch", aim: true, guess: true },
          heyoutian: { x: -11.4, z: -43.2, faceTo: A.mouthEmbankment, stance: "crouch", aim: true, guess: true },
          yaowa: { ...ColumnPoint(holdM + 1.6), faceTo: A.southMouth, stance: "crouch", guess: true },
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
          // 担架队北边一侧（队里两副担架之间站着抬的人）。
          yaowa: { ...RouteSide(COLUMN_ROUTE, playerM - 8, -1.5), faceTo: ctx.player, guess: true },
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
          // 担架队南侧（巷子北边贴着 KitchenLaneHouseBody 的墙，z −21.5）。
          yaowa: { ...Offset(ColumnPoint(litterM - 5), 0, 1.4), faceTo: ctx.player, guess: true },
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
      Nier(NIER_WALL_BACK, { faceTo: MID.streetFight.gengDoorSide, stance: "crouch" }),
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
        luo: { ...P.ambushSquadPosts[0], faceTo: ctx.player, path: [Pt(70, -23), ...KITCHEN_WEST_ROOM_IN] },
        heyoutian: { ...P.ambushSquadPosts[1], faceTo: ctx.player },
        liuwencai: { ...P.ambushSquadPosts[2], faceTo: ctx.player },
        yaowa: { ...P.ambushYaowaPost, faceTo: A.melee, stance: "crouch" },
      }),
      Geng({ x: 61.2, z: -24.2 }, { faceTo: Pt(58, -16.6), guess: true }),
      Nier(NIER_WALL_BACK, { faceTo: Pt(58, -16.6), stance: "crouch" }),
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
        luo: { x: 49.4, z: -19.8, faceTo: A.westAlleySouth, guess: true, path: KITCHEN_WEST_ROOM_OUT },
        heyoutian: { x: 51.8, z: -20.2, faceTo: A.westAlleySouth, guess: true },
        liuwencai: { x: 53.8, z: -19.6, faceTo: A.westAlleySouth, guess: true },
        yaowa: { x: 66.6, z: -25.4, faceTo: ctx.player, guess: true },
      }),
      Geng({ x: 61.2, z: -24.2 }, { faceTo: Pt(58, -16.6), guess: true }),
      Nier(NIER_WALL_BACK, { faceTo: Pt(58, -16.6), stance: "crouch" }),
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
          // 三个人都在西侧夹道（x 49.3–51.7）南口里，等着侧面绕过去。
          luo: { x: 51.2, z: 14.2, faceTo: P.sideRoomGunner, stance: "crouch", guess: true },
          heyoutian: { x: 50.6, z: 13, faceTo: P.sideRoomGunner, guess: true },
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
          // 先出夹道南口（连屋南墙 z 15.2–15.8 以南）再斜插到桌边。
          heyoutian: { ...MID.streetFight.heTable, faceTo: A.gate, path: [Pt(50.5, 17.2)] },
          liuwencai: { x: 56.2, z: 39.6, faceTo: Pt(77, 40), stance: "crouch", aim: true, guess: true },
          yaowa: { x: 52.4, z: 29.6, faceTo: A.gate, guess: true, path: THROUGH_KITCHEN },
        }),
        GengCart(MID.streetFight.cartWallFoot, { faceTo: A.gate }),
        Geng(MID.streetFight.gengUnbar, { faceTo: A.gate }),
        // 车的东边（西南边是 Litter4 的停放位）。
        Nier(Offset(MID.streetFight.cartWallFoot, 1.2, -0.5), { faceTo: A.gate }),
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
      // Litter3（检查点 11 在 x 70.1、朝东）往后挪 0.5 m：原位前头抬的人离 G10_2 机位只有 0.8 m。
      ...CheckpointLitters(11).map((u) => Object.assign(u, u.id === "Litter3" ? { x: R2(u.x - 0.5) } : {}))
        .map((u) => Object.assign(u, { path: ViaThenRoute(OUT_OF_YARD, COLUMN_ROUTE, u) })),
      ...Squad({
        luo: { ...A.streetRejoin, faceTo: GATE_TOWER },
        // 绕行巷（z 37.3–41.1）里担架队排成一行（检查点 11），人站在两副担架之间的空当或巷子两边。
        heyoutian: { x: 67.5, z: 40.4, faceTo: Pt(90, 38), stance: "crouch", aim: true, guess: true, path: OUT_OF_YARD },
        liuwencai: { x: 67.4, z: 38, faceTo: GATE_TOWER, guess: true },
        yaowa: { x: 60.8, z: 39.2, faceTo: Pt(74, 39), guess: true },
      }),
      // 车停在巷子南边加宽处（BypassSouthWall 东头 x 59.9 以东）：出院门后沿巷子中线走过墙头再靠边。
      GengCart({ x: 61.6, z: 41.4 }, { faceTo: Pt(74, 39), guess: true, path: [...OUT_OF_YARD, Pt(60.6, 39.4)] }),
      Geng({ x: 66.2, z: 38.2 }, { faceTo: Pt(74, 39), guess: true, path: OUT_OF_YARD }),
      Nier({ x: 62.6, z: 39.6 }, { faceTo: Pt(74, 39), guess: true, path: OUT_OF_YARD }),
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
        // 担架队靠路东（检查点 12，x 78–79），班里人和妮儿走路西半边。
        luo: { x: 77.2, z: 80.6, faceTo: A.transfer, guess: true },
        heyoutian: { x: 77.2, z: 69.4, faceTo: A.transfer, guess: true },
        liuwencai: { x: 74.8, z: 70.6, faceTo: A.transfer, guess: true },
        yaowa: { x: 76.4, z: 64.6, faceTo: A.transfer, guess: true },
      }),
      GengCart({ x: 79.3, z: 77.8 }, { faceTo: Pt(79.3, 86.5), guess: true }),
      Geng({ x: 80.9, z: 78.6 }, { faceTo: Pt(79.3, 86.5), guess: true }),
      Nier({ x: 76.6, z: 76.2 }, { faceTo: Pt(79.3, 86.5), guess: true }),
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
      // 车头朝南，从车尾（北头）往上抬：担架在车尾北面、朝车，前头抬的人站在车尾外 0.5 m。
      // 从村路下来过低墙路口，在车路东墙外侧（x 80.25 以东）往南走到车尾。
      ...CheckpointLitters(12, { atOf: { Litter5: Offset(A.cartBoard, 0, -3.3) }, faceOf: { Litter5: A.cartBoard } })
        .map((u) => (u.id === "Litter5" ? Object.assign(u, { path: [Pt(78.4, 74), ...THROUGH_WALL_GAP, Pt(82, 89)] }) : u)),
      ...MID.defencePosts.map((post) => Nra(post.cast, post, { name: SQUAD_NAMES[post.cast], role: "squad",
        faceTo: post.cast === "yaowa" ? A.cartBoard : post.face, stance: post.face ? "crouch" : "stand" })),
      Nier({ x: 86.6, z: 114.6 }, { faceTo: A.cartBoard, guess: true }),
      GengCart(A.cartBoard, { yawDeg: 180 }),
      Geng(Offset(A.cartBoard, 1.5, -3.6), { faceTo: A.cartBoard, guess: true }),
      ...P.cartBays.map((b, i) => Civ(`BayCart${i}`, b, { kind: "cart", name: "", faceTo: Offset(b, 0, 4) })),
      ...MID.transferConvoy.carts.filter((c) => !c.from).map((c) => Civ(c.id, c, { kind: "cart", yawDeg: YawDegFromActorRad(c.yaw) })),
      ...Spread(Group(12, "transfer", { atAll: "end", down: MISSION_ENCOUNTERS.transfer.map((m) => m.id) })),
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
          luo: { x: 74.6, z: 111, faceTo: A.cartHalt, guess: true },
          // 从低墙射位下来，先进车路口（两道路墙 x 71 / 80 从 z 90.6 起），再沿车路往南。
          heyoutian: { x: 78.6, z: 104.4, faceTo: Pt(76, 146), guess: true, path: [ROAD_MOUTH.east] },
          liuwencai: { x: 76.2, z: 102.8, faceTo: Pt(76, 146), guess: true, path: [ROAD_MOUTH.west] },
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
        Geng(Offset(unload, 0.5, -1.4), { faceTo: unload }),
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
        // 顺子抬后头：老周的担架只画前头一个抬的人（bearers 1），后头就是玩家。
        ...CheckpointLitters(14, { atOf: { Litter5: ahead }, faceOf: { Litter5: A.ditchMouth }, bearersOf: { Litter5: 1 } }),
        // 老耿跟在担架右手边（不站在前头抬的人身上）。
        Geng(Offset(ahead, 0.4, -1.6), { faceTo: A.ditchMouth, guess: true }),
        // 从车尾绕过棚子的两根柱子（x 62.2，z 126.6 / 130）中间。
        Nier(Offset(ahead, -6.2, -2.4), { faceTo: A.ditchMouth, guess: true, path: [Pt(61, 128)] }),
        GengCart(A.cartHalt, { faceTo: Pt(76, 146) }),
        Civ("drover", END.droverPost, { name: "赶车人", yawDeg: YawDegFromActorRad(END.droverPost.yaw) }),
        Civ("droverCart", END.droverCart, { kind: "cart", name: "丢下的车", yawDeg: YawDegFromActorRad(END.droverCart.yaw) }),
        ...Squad({
          // 三个人从车路绕过西墙南头（ROAD_WALL_SOUTH_END）再去沟口。
          luo: { x: 55.8, z: 116.4, faceTo: A.ditch, guess: true, path: ROAD_WALL_SOUTH_END },
          yaowa: { ...Lerp(ctx.player, A.ditchMouth, 0.45), faceTo: A.ditchMouth, guess: true },
          heyoutian: { ...END.picketPosts[0], faceTo: Pt(80, 116), stance: "crouch", aim: true, guess: true, path: ROAD_WALL_SOUTH_END },
          liuwencai: { ...END.picketPosts[2], faceTo: Pt(80, 116), stance: "crouch", guess: true, path: ROAD_WALL_SOUTH_END },
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
        // 顺子松手扑进沟，老耿抓住后头的抬杆：担架只画前头一个抬的人，老耿站在后头抬杆处。
        ...CheckpointLitters(14, { atOf: { Litter5: ZHOU_LITTER_1402 }, faceOf: { Litter5: A.ditch }, bearersOf: { Litter5: 1 } }),
        Geng(LitterEnd(ZHOU_LITTER_1402, A.ditch, -1), { faceTo: A.ditch }),
        Nier({ x: 47.4, z: 116.8 }, { faceTo: A.ditch, guess: true }),
        Civ("drover", END.droverPost, { name: "赶车人", yawDeg: YawDegFromActorRad(END.droverPost.yaw) }),
        Civ("droverCart", END.droverCart, { kind: "cart", name: "丢下的车", yawDeg: YawDegFromActorRad(END.droverCart.yaw) }),
        GengCart(A.cartHalt, { faceTo: Pt(76, 146) }),
        ...Squad({
          luo: { x: 45.2, z: 115.6, faceTo: A.ditchMouth, guess: true },
          yaowa: { ...Offset(A.ditchMouth, -1, 1.6), faceTo: A.ditchMouth, stance: "crouch", guess: true },
          heyoutian: { ...END.picketPosts[0], faceTo: Pt(80, 116), stance: "crouch", aim: true, guess: true },
          liuwencai: { ...END.picketPosts[1], faceTo: Pt(80, 116), stance: "crouch", aim: true, guess: true },
        }),
        // 追兵沿追击线一个接一个压上来（走在线上：车路西墙的门洞就在这条线的 z 112 上）。
        ...Group(14, "air", { at: Object.fromEntries(pursuers.map((id, i) => [id, pursuit[i]])), face: A.ditchMouth,
          pathOf: Object.fromEntries(pursuers.map((id, i) => [id, pursuit.slice(1, i)])) })
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
        // 沟里点名：老周的担架放在沟底（没人抬），幺娃、老耿守在边上。
        LitterUnit("Litter5", { x: 38.2, z: 118.2 }, { faceTo: ev[2], bearers: 0 }),
        LitterUnit("Litter4", MissionRoutePoint(ev, 26), { faceTo: ev[2], path: ROAD_TO_DITCH }),
        LitterUnit("Litter6", MissionRoutePoint(ev, 30), { faceTo: ev[2], path: ROAD_TO_DITCH }),
        ...Squad({
          heyoutian: { x: 36.4, z: 121.6, faceTo: ctx.player },
          luo: { x: 34.4, z: 124, faceTo: ev[2] },
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
        // 夹道另一侧（掉队的 Straggler0 在南侧），离北墙 WallPathYardWall 0.5 m 以上。
        Geng(At(8.5, 0.6), { faceTo: At(10.5), guess: true }),
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
      ...CheckpointLitters(16, { skip: ["Litter5"] }).map((u) => WithLane(u, WALL_PATH_TO_WARD)),
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
      // 院里、街屋南墙（z 235.7–236.3）往南 1 m。
      Geng({ x: -1.6, z: 237.4 }, { faceTo: ctx.player, guess: true }),
      Nier({ x: 4.6, z: 236.8 }, { faceTo: Pt(4.6, 238.8), stance: "crouch", guess: true }),
    ],
    pois: [Poi("wardDoor", "厢房南门（门槛）", "poi", Reception.wardThreshold, 1)],
  }),
  "17-1": (ctx) => ({
    units: [
      // 老周躺在床位上（担架放下、没人抬：bearers 0；state 不写 down，担架的 down 只表示抬的人倒了，§3）。
      LitterUnit("Litter5", A.zhouDrop, { name: "老周", faceTo: Pt(A.zhouDrop.x, A.zhouDrop.z - 4), bearers: 0 }),
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
      // 老周躺在床位上（担架放下、没人抬：bearers 0；state 不写 down，担架的 down 只表示抬的人倒了，§3）。
      LitterUnit("Litter5", A.zhouDrop, { name: "老周", faceTo: Pt(A.zhouDrop.x, A.zhouDrop.z - 4), bearers: 0 }),
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
        Nra("bridgeOfficer", P.bridge.officer, { kind: "officer", name: "桥头军官", role: "officer", faceTo: A.railBridge }),
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
        Nra("bridgeOfficer", END.officerPullback.at(-1), { kind: "officer", name: "桥头军官", role: "officer", faceTo: ctx.player, path: END.officerPullback.slice(0, -1) }),
        ...P.bridge.demolition.map((d, i) => Nra(`Demolition${i}`, END.demolitionPullback[i].at(-1), { role: "demolition",
          faceTo: { x: -77, z: 122 }, stance: "crouch", path: END.demolitionPullback[i].slice(0, -1) })),
        // 尾队过完桥（bridgeCrossing 共 163.8 m），在南岸往南走（队首在 150 m 处，往后隔 bridgeColumnSpacingM）。
        ...[0, 1, 2, 3, 4, 5].map((i) => Nra(`RearColumn${i}`, MissionRoutePoint(march, 150 - i * R.bridgeColumnSpacingM), { name: i === 0 ? "尾队" : "", role: "rearColumn",
          faceTo: march.at(-1), intent: [march.at(-1)], speedMps: R.bridgeColumnSpeedMps })),
        ...Group(18, "bridgeNorth", { atAll: "end", face: Pt(-77, 150) }),
        // 真 AI 走进来的路照游戏（Script_FirstLevelBridgeFarBank.BeginWithdraw）：第 n 个从桥轴往北 60 + (n % 4)·5 m 出生，
        // 沿桥轴往南走到自己那一排的 z（土坎北面的走廊），再横着走到射位（FarBankWalkInVia）；直着从北面 60 m 走下来会穿过北岸的房子。
        ...FAR_BANK_REAL.map((u, n) => Ija(u.id, u, { kind: u.role === "officer" ? "officer" : undefined, group: "farBank", role: u.role || "farBank",
          weapon: u.weapon, name: u.weapon === "Type11" ? "对岸机枪" : "",
          faceTo: Pt(u.x, 160), stance: u.weapon === "Type11" ? "prone" : "crouch", aim: true,
          path: [FarBankSpawnAt(n, FAR_BANK_REAL_SPAWN_BACK_M + (n % 4) * 5), ...FarBankWalkInVia(u)] })),
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

/** 折线去掉和前一点（含起点 from）挨得太近的点，终点 to 一定保留。 */
function TidyPath(from, points, to) {
  const out = [];
  let last = from;
  for (const p of points) {
    if (Dist(p, last) < 0.3 || Dist(p, to) < 0.3) continue;
    out.push(Pt(p.x, p.z));
    last = p;
  }
  out.push(Pt(to.x, to.z));
  return out;
}

/**
 * 从 from 走到 to 可选的路线折线（不含起点、含终点），按偏好排好：
 *   1. 一条路线：两头都贴着它（起点 ≤ 4 m、终点 ≤ 5 m），先走到起点在路线上的投影，沿路线走到与终点平齐的投影点，再离开路线；
 *   2. 两条路线在某个折点相接（例：后交通壕 → 支沟交汇 → 左翼机枪交通沟），同样从投影点上、投影点下。
 * 太绕（长于直线 2.5 倍 + 5 m）的不要。直线不在这里（调用方最后才试）。
 */
function RouteCandidates(from, to) {
  const straight = Dist(from, to);
  const acceptable = (path) => {
    const length = PathLength([from, ...path]);
    return length <= straight * 2.5 + 5 ? length : null;
  };
  const near = PATH_ROUTES.map((route, i) => ({ route, prog: PATH_ROUTE_PROGRESS[i], a: MissionRouteProjection(route, from), b: MissionRouteProjection(route, to) }));
  const singles = [];
  for (const r of near) {
    if (r.a.distance > START_SNAP_M || r.b.distance > END_SNAP_M || Math.abs(r.b.progress - r.a.progress) < 1) continue;
    const mid = RouteVerticesBetween(r.route, r.prog, r.a.progress, r.b.progress);
    const path = TidyPath(from, [MissionRoutePoint(r.route, r.a.progress), ...mid, MissionRoutePoint(r.route, r.b.progress)], to);
    const length = acceptable(path);
    if (length === null) continue;
    // 路线上没有中间折点的（两头都在同一段上）排在后面：和直线差不多，只在直线走不通时才有用。
    singles.push({ score: r.a.distance + r.b.distance + (mid.length ? 0 : 1000), length, path });
  }
  singles.sort((p, q) => p.score - q.score || p.length - q.length);
  const chains = [];
  for (const r1 of near) {
    if (r1.a.distance > START_SNAP_M) continue;
    for (const r2 of near) {
      if (r2 === r1 || r2.b.distance > END_SNAP_M) continue;
      for (let j = 0; j < r2.route.length; j++) {
        const v = r2.route[j];
        const onR1 = MissionRouteProjection(r1.route, v);
        if (onR1.distance > JUNCTION_M) continue;
        const path = TidyPath(from, [MissionRoutePoint(r1.route, r1.a.progress), ...RouteVerticesBetween(r1.route, r1.prog, r1.a.progress, onR1.progress), v,
          ...RouteVerticesBetween(r2.route, r2.prog, r2.prog[j], r2.b.progress), MissionRoutePoint(r2.route, r2.b.progress)], to);
        const length = acceptable(path);
        if (length === null || length < straight - 1e-6 || path.length < 2) continue;
        chains.push({ length, path });
      }
    }
  }
  chains.sort((p, q) => p.length - q.length);
  return [...singles.filter((c) => c.score < 1000), ...chains, ...singles.filter((c) => c.score >= 1000)].map((c) => c.path);
}

/**
 * 给一个人挑从 from 走到 to 的折线：按顺序试 candidates（配方写的 path、战术折线、路线、两条路线接力、直线），
 * 第一条身体不穿高墙的就用（BLOCKOUT_ROUTE_BODY）。都穿时返回 { path: 第一条, crossings } 让调用方报出来。
 */
function PickClearPath(from, to, candidates, blocks) {
  let first = null;
  for (const path of candidates) {
    const points = [from, ...(path || []), to];
    const crossings = RouteSolidCrossings(blocks, points);
    if (!crossings.length) return { path, crossings };
    if (!first) first = { path, crossings };
  }
  return first || { path: null, crossings: [] };
}

/** 自动找的走法：比直线最多长这么多（直线本身不穿墙时）。 */
const AUTO_PATH_DETOUR = Object.freeze({ ratio: 1.3, extraM: 2 });
/** 折线里有没有走回头路：相邻两段都长于 1 m、夹角余弦 < −0.85。 */
function PathDoublesBack(points) {
  for (let i = 1; i + 1 < points.length; i++) {
    const ax = points[i].x - points[i - 1].x, az = points[i].z - points[i - 1].z;
    const bx = points[i + 1].x - points[i].x, bz = points[i + 1].z - points[i].z;
    const la = Math.hypot(ax, az), lb = Math.hypot(bx, bz);
    if (la > 1 && lb > 1 && (ax * bx + az * bz) / (la * lb) < -0.85) return true;
  }
  return false;
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
  // 目标就在脚下（< 2 m）：只写文字，不让光柱 / 地环落在玩家自己身上（§3「没有移动目标时只写 text」）。
  if (Dist(at, player) < BLOCKOUT_SPACING.nextM) return next;
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
const UNIT_KEY_ORDER = ["id", "side", "kind", "name", "role", "group", "weapon", "x", "z", "yawDeg", "stance", "aim", "state", "bearers", "arc", "speedMps", "path", "intent", "guess"];
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
export function BuildFirstLevelBlockoutConfig({ commit = "", generatedAt = "", issues = null } = {}) {
  const keyframes = [];
  let prevUnits = new Map(), prevSignals = [];
  for (const station of FIRST_LEVEL_BLOCKOUT_STATIONS) {
    const poseFn = POSES[station.id];
    const recipe = RECIPES[station.id];
    if (!poseFn || !recipe) throw new Error(`blockout: 关键帧 ${station.id} 缺机位或配方`);
    const pose = poseFn();
    const signals = FirstLevelSignalsFor(station.id, station.stage);
    const standing = ClearStandingPoint({ x: R2(pose.x), z: R2(pose.z) }, signals);
    const player = { x: standing.at.x, z: standing.at.z, yawDeg: R1(pose.yawDeg), pitchDeg: R1(pose.pitchDeg), stance: pose.stance };
    const { units: rawUnits, pois: recipePois } = recipe({ player, station });
    const seen = new Set();
    for (const u of rawUnits) {
      if (seen.has(u.id)) throw new Error(`blockout: ${station.id} 单位 id 重复：${u.id}`);
      seen.add(u.id);
    }
    const next = NextFor(station, player, rawUnits);
    // 朝向先定（车身脚印要按车头方向算），再把落在车身上的人 / 担架推开，最后挑走位折线。
    FinishFacing(rawUnits, player, Number.isFinite(next.x) ? next : null);
    PushUnitsOffVehicles(rawUnits);
    // 相邻关键帧之间的走位折线，按偏好逐条试，第一条身体不穿高墙的就用（两帧信号并集下的实心块）：
    // 配方写的 path → 指定贴着走的路（lane）→ 同一条战术折线 → 贴着已知路线（含两条接力）→ 直线。
    const blocks = SolidsFor([...prevSignals, ...signals]);
    for (const u of rawUnits) {
      const prev = prevUnits.get(u.id);
      if (!prev) continue;
      // 配方写的 path 与战术折线是游戏 / 设计给的走法，照用；贴路（lane）与贴路线（含接力）是自动找的：
      // 不许走回头路，直线本身不穿墙时也不许比直线长太多（否则短挪动会先走出去再折回来）。
      const straightClear = !RouteSolidCrossings(blocks, [prev, u]).length;
      const autoOk = (path) => {
        const points = [prev, ...path, u];
        // 直线穿墙时什么绕法都可以（战车路本身有折返）；直线走得通时才挑剔回头路与绕远。
        return !straightClear || (!PathDoublesBack(points) && PathLength(points) <= Dist(prev, u) * AUTO_PATH_DETOUR.ratio + AUTO_PATH_DETOUR.extraM);
      };
      const candidates = [];
      if (u.path?.length) candidates.push(u.path.map((p) => Pt(p.x, p.z)));
      const meta = META.get(u), prevMeta = META.get(prev);
      if (meta?.lane) {
        const lane = meta.lane, a = MissionRouteProjection(lane, prev).progress, b = MissionRouteProjection(lane, u).progress;
        const lanePath = Math.abs(b - a) >= 1 ? TidyPath(prev, [MissionRoutePoint(lane, a), ...RouteVerticesBetween(lane, RouteProgresses(lane), a, b), MissionRoutePoint(lane, b)], u) : null;
        if (lanePath && autoOk(lanePath)) candidates.push(lanePath);
      }
      if (meta?.track && prevMeta?.track && meta.track.length === prevMeta.track.length && Dist(meta.track[0], prevMeta.track[0]) < 1e-6) {
        const track = TrackPathBetween(meta.track, prevMeta.trackAt, meta.trackAt);
        if (track?.length) candidates.push(track);
      }
      if (Dist(prev, u) >= 2) candidates.push(...RouteCandidates(prev, u).filter(autoOk));
      candidates.push(null);
      // 都穿的话先用第一条，组装完由 FirstLevelBlockoutIssues 报出来（测试判失败）。
      const { path } = PickClearPath(prev, u, candidates, blocks);
      delete u.path;
      if (path?.length > 1 || (path?.length === 1 && Dist(path[0], u) > 1e-6)) u.path = path.map((p) => ({ x: R2(p.x), z: R2(p.z) }));
    }
    const units = rawUnits.map((u) => OrderUnit(SanitizeUnit(u)));
    const poiIds = new Set();
    const pois = [...recipePois, ...AutoPois(player, station.stage)].filter((p) => !poiIds.has(p.id) && poiIds.add(p.id));
    const notes = [station.notes, POSE_NOTES[station.id] || "", standing.note].filter(Boolean).join(" ");
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
      signals,
      units,
      pois,
    };
    keyframes.push(kf);
    prevUnits = new Map(rawUnits.map((u) => [u.id, u]));
    prevSignals = signals;
  }
  const doc = {
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
  if (issues) issues.push(...FirstLevelBlockoutIssues(doc));
  return doc;
}

/**
 * 一份第一关配置（原样或已归一化都行）的摆位与走位问题，一行一条；空数组 = 没问题。
 * 和 Script_EditorBlockoutConfigTest 判失败的口径相同：玩家站位碰实心块、摆位间距（BLOCKOUT_SPACING）、
 * 相邻关键帧过渡的路线穿高墙（BLOCKOUT_ROUTE_BODY）。
 */
export function FirstLevelBlockoutIssues(doc) {
  const norm = NormalizeBlockout(doc);
  const out = [];
  norm.keyframes.forEach((kf, i) => {
    const hit = FirstLevelPlayerBlock(kf);
    if (hit) out.push(`${kf.id} 玩家站位碰到 ${hit.id}`);
    for (const line of FirstLevelSpacingIssues(kf)) out.push(`${kf.id} ${line}`);
    if (i > 0) {
      const prev = norm.keyframes[i - 1];
      for (const c of FirstLevelTransitionCrossings(prev, kf)) out.push(`${prev.id}→${kf.id} ${c.id} 的走位穿过 ${c.blocks.map((b) => b.id).join("、")}`);
    }
  });
  return out;
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

// ---------------------------------------------------------------------------
// 人的身体 vs 实心块（走位穿墙、玩家站位）

/**
 * 关键帧之间走位的身体：半径 0.3 m、离地 0.5–1.4 m 那一段；只算高过 1.6 m 的块（矮掩体、坎子人能翻能绕，不算穿墙），
 * 身体扎进块里超过 0.12 m 才算穿（贴着墙走、擦过门框不算）。沿折线每 0.1 m 取一点。
 */
export const BLOCKOUT_ROUTE_BODY = Object.freeze({ radiusM: 0.3, toleranceM: 0.12, fromM: 0.5, toM: 1.4, tallM: 1.6, stepM: 0.1 });
/** 玩家站立的胶囊：半径 0.3 m、离地 0.35–1.6 m，碰到任何实心块都不行（运行时会把人挤开）。 */
export const BLOCKOUT_PLAYER_BODY = Object.freeze({ radiusM: 0.3, toleranceM: 0.005, fromM: 0.35, toM: 1.6, tallM: 0 });

/** 半径 r 的圆扎进块脚印（按 ry 转的矩形）多深：> 0 = 碰到了，圆心在块里时 = r + 到最近一条边的距离。 */
function FootprintPenetration(b, x, z, r) {
  const c = Math.cos(b.ry || 0), s = Math.sin(b.ry || 0);
  const dx = x - b.x, dz = z - b.z;
  const lx = dx * c - dz * s, lz = dx * s + dz * c;
  const ex = Math.abs(lx) - b.w / 2, ez = Math.abs(lz) - b.d / 2;
  if (ex <= 0 && ez <= 0) return r + Math.min(-ex, -ez);
  return r - Math.hypot(Math.max(ex, 0), Math.max(ez, 0));
}

const BODY_GRID_M = 8;
const BODY_INDEX = new WeakMap();
/** 块按 8 m 网格分桶（每组块只建一次），取样点只查自己那一格。 */
function BodyIndex(blocks) {
  let index = BODY_INDEX.get(blocks);
  if (index) return index;
  index = new Map();
  for (const b of blocks) {
    const reach = Math.hypot(b.w, b.d) / 2 + 0.5;
    for (let ix = Math.floor((b.x - reach) / BODY_GRID_M); ix <= Math.floor((b.x + reach) / BODY_GRID_M); ix++) {
      for (let iz = Math.floor((b.z - reach) / BODY_GRID_M); iz <= Math.floor((b.z + reach) / BODY_GRID_M); iz++) {
        const key = `${ix},${iz}`;
        if (!index.has(key)) index.set(key, []);
        index.get(key).push(b);
      }
    }
  }
  BODY_INDEX.set(blocks, index);
  return index;
}

/** 站在 (x,z) 的身体碰到的第一个实心块（body 见上面两组常量），没有返回 null。 */
export function BodyBlockAt(blocks, x, z, body = BLOCKOUT_ROUTE_BODY) {
  const cell = BodyIndex(blocks).get(`${Math.floor(x / BODY_GRID_M)},${Math.floor(z / BODY_GRID_M)}`);
  if (!cell) return null;
  let ground = null;
  for (const b of cell) {
    if (b.h <= body.tallM) continue;
    if (FootprintPenetration(b, x, z, body.radiusM) <= body.toleranceM) continue;
    if (ground === null) ground = Ground(x, z);
    if (b.y + b.h / 2 < ground + body.fromM || b.y - b.h / 2 > ground + body.toM) continue;
    return b;
  }
  return null;
}

/**
 * 沿折线 points（含两端）每 stepM 取一点，列出身体穿过的高块：每个块一条 { id, x, z, atM }（第一次碰到的地方）。
 * 空数组 = 走得通。
 */
export function RouteSolidCrossings(blocks, points, body = BLOCKOUT_ROUTE_BODY) {
  const hits = new Map();
  const Probe = (x, z, atM) => {
    const b = BodyBlockAt(blocks, x, z, body);
    if (b && !hits.has(b.id)) hits.set(b.id, { id: b.id, x: R2(x), z: R2(z), atM: R1(atM) });
  };
  if (!points?.length) return [];
  Probe(points[0].x, points[0].z, 0);
  let walked = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i], length = Dist(a, b);
    const steps = Math.max(1, Math.ceil(length / body.stepM));
    for (let k = 1; k <= steps; k++) {
      const t = k / steps;
      Probe(a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t, walked + length * t);
    }
    walked += length;
  }
  return [...hits.values()];
}

const SOLIDS_BY_SIGNALS = new Map();
/** FirstLevelSolidBlocks 按信号组合缓存（顺序无关）。 */
function SolidsFor(signals) {
  const key = [...new Set(signals)].sort().join(",");
  if (!SOLIDS_BY_SIGNALS.has(key)) SOLIDS_BY_SIGNALS.set(key, Object.freeze(FirstLevelSolidBlocks([...new Set(signals)])));
  return SOLIDS_BY_SIGNALS.get(key);
}

/**
 * 相邻两个关键帧（NormalizeBlockout 之后）的过渡里，谁的路线穿了高墙：按 PlanTransition 的每条路线
 * （走过去 / 走进来 / 走出去；原地不动的只有一个点，也取样）对 FirstLevelSolidBlocks(两帧信号的并集) 取样。
 * @returns {Array<{id, mode, blocks: Array<{id,x,z,atM}>}>}
 */
export function FirstLevelTransitionCrossings(prevKf, nextKf) {
  const blocks = SolidsFor([...(prevKf.signals || []), ...(nextKf.signals || [])]);
  const out = [];
  for (const entry of PlanTransition(prevKf, nextKf).units) {
    const hits = RouteSolidCrossings(blocks, entry.route);
    if (hits.length) out.push({ id: entry.id, mode: entry.mode, blocks: hits });
  }
  return out;
}

/** 玩家站位碰到的实心块（站立胶囊，见 BLOCKOUT_PLAYER_BODY），没有返回 null。 */
export function FirstLevelPlayerBlock(kf) {
  return BodyBlockAt(SolidsFor(kf.signals || []), kf.player.x, kf.player.z, BLOCKOUT_PLAYER_BODY);
}

/**
 * 机位的站立胶囊碰到实心块时（运行时会把人挤开，机位就不是表里那个了），往外挪到刚好不碰：
 * 由近到远（每 5 cm、16 个方向）找第一个空位，最多挪 1 m。返回 { at, note }（挪了才有 note，写进关键帧 notes）。
 */
function ClearStandingPoint(at, signals) {
  const blocks = SolidsFor(signals);
  const hit = BodyBlockAt(blocks, at.x, at.z, BLOCKOUT_PLAYER_BODY);
  if (!hit) return { at, note: "" };
  for (let step = 1; step <= 20; step++) {
    const r = step * 0.05;
    for (let k = 0; k < 16; k++) {
      const a = k * Math.PI / 8, p = { x: R2(at.x + Math.cos(a) * r), z: R2(at.z + Math.sin(a) * r) };
      if (!BodyBlockAt(blocks, p.x, p.z, BLOCKOUT_PLAYER_BODY)) return { at: p, note: `机位贴着 ${hit.id}（站着会碰到），往外挪了 ${R2(r)} m。` };
    }
  }
  return { at, note: "" };
}

/** 摆位间距（§3「单位」的约定；测试按这个判失败）。 */
export const BLOCKOUT_SPACING = Object.freeze({
  /** 人到玩家站位；倒地的人可以躺在脚边。 */
  playerM: 1.0, playerDownM: 0.5,
  /** 人到担架中心（担架 2.1 m 长、前后各一个抬的人）。 */
  litterM: 1.3,
  /** 人到抬担架的人站的那一段（担架中心沿朝向前后各 1.6 m，按 bearers：1 = 只有前头一个人，0 = 没人抬）。 */
  carryM: 0.6, carryReachM: 1.6,
  /** 任意两个单位。 */
  unitM: 0.8,
  /** 下一步目标离玩家这么近就只写文字（不画落在自己脚下的光柱）。 */
  nextM: 2,
});

const PEOPLE_KINDS = new Set(["soldier", "officer", "civilian", "child"]);
/** 车身脚印（与 Script_EditorBlockoutPuppets 的车体同尺寸；w 横向、d 沿朝向）与人离车身的最小余量。 */
export const BLOCKOUT_VEHICLE_FOOTPRINT = Object.freeze({ tank: { w: 2.18, d: 5.75 }, cart: { w: 1.5, d: 2.4 }, marginM: 0.35 });
/** 点在车身脚印（外扩 margin）里时，返回推到脚印外 0.05 m 的位置；不在里面返回 null。 */
function PushOutOfFootprint(pt, v, margin) {
  const fp = BLOCKOUT_VEHICLE_FOOTPRINT[v.kind];
  if (!fp) return null;
  const yaw = (v.yawDeg || 0) * Math.PI / 180, fx = -Math.sin(yaw), fz = -Math.cos(yaw), rx = -fz, rz = fx;
  const dx = pt.x - v.x, dz = pt.z - v.z;
  const along = dx * fx + dz * fz, across = dx * rx + dz * rz;
  const hd = fp.d / 2 + margin, hw = fp.w / 2 + margin;
  if (Math.abs(along) >= hd || Math.abs(across) >= hw) return null;
  const outAlong = hd - Math.abs(along), outAcross = hw - Math.abs(across);
  if (outAcross <= outAlong) {
    const s = (across >= 0 ? 1 : -1) * (outAcross + 0.05);
    return { x: pt.x + rx * s, z: pt.z + rz * s };
  }
  const s = (along >= 0 ? 1 : -1) * (outAlong + 0.05);
  return { x: pt.x + fx * s, z: pt.z + fz * s };
}
/** 摆位时把人和担架（连同抬的人）推出车身脚印：配方按锚点摆的人有时正好落在车身上。 */
function PushUnitsOffVehicles(units) {
  const margin = BLOCKOUT_VEHICLE_FOOTPRINT.marginM;
  for (const v of units.filter((u) => BLOCKOUT_VEHICLE_FOOTPRINT[u.kind])) {
    for (const u of units) {
      if (u === v) continue;
      if (PEOPLE_KINDS.has(u.kind || "soldier")) {
        const out = PushOutOfFootprint(u, v, margin);
        if (out) { u.x = out.x; u.z = out.z; }
      } else if (u.kind === "litter") {
        // 推开一个端点后另一个端点可能还在里面：最多推三轮。
        for (let round = 0; round < 3; round++) {
          let moved = false;
          for (const pt of [{ x: u.x, z: u.z }, ...(CarrySegment(u) || [])]) {
            const out = PushOutOfFootprint(pt, v, margin);
            if (out) { u.x += out.x - pt.x; u.z += out.z - pt.z; moved = true; break; }
          }
          if (!moved) break;
        }
      }
    }
  }
}
function SegmentDistance(p, a, b) {
  const dx = b.x - a.x, dz = b.z - a.z, l2 = dx * dx + dz * dz;
  const t = l2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / l2)) : 0;
  return Math.hypot(p.x - a.x - dx * t, p.z - a.z - dz * t);
}
/** 担架上抬的人站的那一段（中心 → 前头，bearers 2 时再到后头）；bearers 0 返回 null。 */
function CarrySegment(litter) {
  const bearers = Number.isInteger(litter.bearers) ? litter.bearers : 2;
  if (bearers <= 0) return null;
  const yaw = (litter.yawDeg || 0) * Math.PI / 180, fx = -Math.sin(yaw), fz = -Math.cos(yaw), r = BLOCKOUT_SPACING.carryReachM;
  const front = { x: litter.x + fx * r, z: litter.z + fz * r };
  const rear = bearers >= 2 ? { x: litter.x - fx * r, z: litter.z - fz * r } : { x: litter.x, z: litter.z };
  return [rear, front];
}

/**
 * 一个关键帧（NormalizeBlockout 之后）的摆位问题：人贴着玩家、人站在担架上 / 抬担架的人身上、两个单位叠在一起、
 * 下一步目标落在玩家脚下。空数组 = 没问题。
 */
export function FirstLevelSpacingIssues(kf) {
  const S = BLOCKOUT_SPACING, out = [];
  const units = kf.units || [];
  const isPerson = (u) => PEOPLE_KINDS.has(u.kind || "soldier");
  const litters = units.filter((u) => u.kind === "litter");
  for (const u of units) {
    if (!isPerson(u)) continue;
    const limit = u.state === "down" ? S.playerDownM : S.playerM;
    const d = Dist(u, kf.player);
    if (d < limit) out.push(`${u.id} 离玩家 ${R2(d)} m（< ${limit}）`);
  }
  for (const l of litters) {
    const d = Dist(l, kf.player);
    if (d < S.playerM) out.push(`担架 ${l.id} 离玩家 ${R2(d)} m（< ${S.playerM}）`);
    const seg = CarrySegment(l);
    // 抬担架的人也是人：离玩家同样要 playerM。
    if (seg && SegmentDistance(kf.player, seg[0], seg[1]) < S.playerM) out.push(`担架 ${l.id} 抬的人离玩家不到 ${S.playerM} m`);
    for (const u of units) {
      if (!isPerson(u)) continue;
      const dl = Dist(u, l);
      if (dl < S.litterM) out.push(`${u.id} 离担架 ${l.id} ${R2(dl)} m（< ${S.litterM}）`);
      else if (seg && SegmentDistance(u, seg[0], seg[1]) < S.carryM) out.push(`${u.id} 站在担架 ${l.id} 抬的人身上`);
    }
  }
  for (let i = 0; i < units.length; i++) {
    for (let j = i + 1; j < units.length; j++) {
      const d = Dist(units[i], units[j]);
      if (d < S.unitM) out.push(`${units[i].id} 和 ${units[j].id} 相距 ${R2(d)} m（< ${S.unitM}）`);
    }
  }
  for (const v of units.filter((u) => BLOCKOUT_VEHICLE_FOOTPRINT[u.kind])) {
    for (const u of units) {
      if (u === v) continue;
      const points = isPerson(u) ? [u] : u.kind === "litter" ? [u, ...(CarrySegment(u) || [])] : [];
      if (points.some((pt) => PushOutOfFootprint(pt, v, BLOCKOUT_VEHICLE_FOOTPRINT.marginM - 0.01))) out.push(`${u.id} 站在车身 ${v.id} 上（离车身不到 ${BLOCKOUT_VEHICLE_FOOTPRINT.marginM} m）`);
    }
  }
  if (Number.isFinite(kf.next?.x) && Dist(kf.next, kf.player) < S.nextM) out.push(`下一步目标离玩家 ${R2(Dist(kf.next, kf.player))} m（< ${S.nextM}，只写文字）`);
  return out;
}
