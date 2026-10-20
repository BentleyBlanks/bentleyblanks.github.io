// ===========================================================================
// Script_EditorBlockoutFirstLevel0105Previz.mjs —— 第一关 01–05 白盒（FirstLevel0105）的预演数据生成器
//
//   node Taierzhuang1938/Script_EditorBlockoutFirstLevel0105Previz.mjs            → 只校验、打印摘要，不写
//   node Taierzhuang1938/Script_EditorBlockoutFirstLevel0105Previz.mjs --force    → 写 Blockout/FirstLevel0105.previz.json
//   node Taierzhuang1938/Script_EditorBlockoutFirstLevel0105Previz.mjs --report   → 另打印每段一行摘要与用到的片段
//
// 格式：docs/Data_EditorBlockout.md §14（tengxian-blockout-previz/1）。剧本口径：Notion「第一关｜往南的路 · 剧本」01–05
// （10-18 定稿），空间口径：Data_EditorBlockoutFirstLevel0105Space.mjs，布设：Blockout/FirstLevel0105.json（只读）。
// 台词：Blockout/FirstLevel0105.voice.json 的句子 id；同一段里按录音的原始间隔 gapBeforeS 往后排（只会拉长、不会压短），
// 句子之间不互相压住。
//
// 演员键的时间语义（§14.1）：带 x/z 的键的 t = 到达时刻；出发时刻 = max(上一个位置键 t, t − 路长/速度)；
// 要控制几点出发就在出发时刻补一个同位置的键（下面的 Go() 就是这么写的）。stance/aim/state/clip 等是阶跃。
//
// 片段按骨架：有 castId 的单位骨架固定（Data_FirstLevelSpeakingCast），只给它那具骨架烘过的片段；
// 没有 castId 的人骨架随机，只用五具骨架都有的 20 个通用片段或原生状态。生成器自检会按骨架核对每个片段。
//
// 确定性：不读时钟、不读 git；同样的输入两次输出逐字相同。
// ===========================================================================

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  L0105_PLACES as PL, L0105_TRENCHES, L0105_ROAD, L0105_BRIDGE, L0105_PROPS, PointBeside, LineLength,
  L0105_GULLY, L0105_GULLY_POCKETS, L0105_SUNKEN_LANE,
  L0105_PIT_NORTH, L0105_RUSH_STATIONS, L0105_RUSH_FALLEN, L0105_DITCH_SQUAD, DitchSquadFallenAt, RushStation, ScarpZ,
} from "./Data_EditorBlockoutFirstLevel0105Space.mjs";
import { PREVIZ_THROW, SamplePrevizActor, NormalizeBlockoutPreviz } from "./Script_EditorBlockoutPrevizPlan.mjs";
import { BLOCKOUT_PREVIZ_CLIP_LIBRARIES } from "./Data_BlockoutPrevizClips.mjs";
import { BRIDGE_EAST_DETOUR, DRAG, OUTFLANK_FIRE_021, OUTFLANK_FIRE_LAT, OUTFLANK_RIM_LAT, FrontAtX, SHELL_032 } from "./Script_EditorBlockoutFirstLevel0105Keyframes.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
export const PREVIZ_FILE = join(HERE, "Blockout", "FirstLevel0105.previz.json");
const CONFIG_FILE = join(HERE, "Blockout", "FirstLevel0105.json");
const VOICE_FILE = join(HERE, "Blockout", "FirstLevel0105.voice.json");

// ---------------------------------------------------------------------------
// 小工具

const R = v => Math.round(v * 100) / 100;
/** 朝向：0 北（−Z），+90 西，−90 东。 */
export function Yaw(from, to) { return R(Math.atan2(-(to.x - from.x), -(to.z - from.z)) * 180 / Math.PI); }
const Dist = (a, b) => Math.hypot(b.x - a.x, b.z - a.z);
/** 支沟中心线（支沟口 (21.9,67.1) → 洞口 (63,64.5)）在 x 处的 z。 */
const BZ = x => R(67.1 - (x - 21.9) * 2.6 / 41.1);

function LoadJson(file) { return JSON.parse(readFileSync(file, "utf8")); }

// ---------------------------------------------------------------------------
// 锚点换算（10-18 返工起，新改的段一律从锚点 / 关键帧布设算，不手抄坐标）

const BR_LINE = L0105_TRENCHES.branch, TR_LINE = L0105_TRENCHES.traffic;
const Pt2 = p => ({ x: R(p.x), z: R(p.z) });
/** 支沟：从支沟口往东量 d，左手（北）偏 lat。 */
const BP = (d, lat = 0) => Pt2(PointBeside(BR_LINE, d, lat));
/** 交通沟：从沟口往南量 d，左手（东）偏 lat。 */
const TP = (d, lat = 0) => Pt2(PointBeside(TR_LINE, d, lat));
/** 拖单被路线：从洞口量 d（支沟里左手 = 南，交通沟里左手 = 东）。 */
const DP = (d, lat = 0) => Pt2(PointBeside(DRAG, d, lat));
function StationOn(line, p) {
  let best = { d: 0, dist: Infinity }, walked = 0;
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1], b = line[i], len = Dist(a, b);
    const t = len > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * (b.x - a.x) + (p.z - a.z) * (b.z - a.z)) / (len * len))) : 0;
    const q = { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t };
    if (Dist(p, q) < best.dist) best = { d: walked + len * t, dist: Dist(p, q) };
    walked += len;
  }
  return best.d;
}
const BRANCH_LEN = LineLength(BR_LINE);
const T_BRANCH = StationOn(TR_LINE, PL.branchMouth), T_CORNER2 = StationOn(TR_LINE, PL.corner2);
const T_CROSSING = StationOn(TR_LINE, PL.crossing), T_CREST = StationOn(TR_LINE, PL.crest), T_END = LineLength(TR_LINE);
const D_BRANCH_MOUTH = StationOn(DRAG, PL.branchMouth), D_CORNER2 = StationOn(DRAG, PL.corner2), D_CREST = StationOn(DRAG, PL.crest);
const DRAG_VERTS = (() => { const out = [0]; for (let i = 1; i < DRAG.length; i++) out.push(out[i - 1] + Dist(DRAG[i - 1], DRAG[i])); return out; })();
const ROAD_X = StationOn(L0105_ROAD, PL.crossing);
/** 路上离路口 m 米（往东北回溯为正），往左偏 lat。 */
const RoadBack = (m, lat = 0) => Pt2(PointBeside(L0105_ROAD, ROAD_X - m, lat));
const PROP = id => L0105_PROPS.find(p => p.id === id);
const BRIDGE = { x: L0105_BRIDGE.x, z: L0105_BRIDGE.z };
/** 其它关键帧里某单位的布设位置。 */
function KU(ctx, kfId, id) {
  const u = ctx.config.keyframes.find(k => k.id === kfId)?.units.find(x => x.id === id);
  if (!u) throw new Error(`关键帧 ${kfId} 里没有 ${id}`);
  return u;
}
const KP = (ctx, kfId) => ctx.config.keyframes.find(k => k.id === kfId).player;
/** 拖行路线 d0→d1 之间每 2.5 m 一个途经点（不含两端），左偏 lat。 */
function DragPath(d0, d1, lat = 0) {
  const out = [];
  const n = Math.floor(Math.abs(d1 - d0) / 2.5);
  for (let i = 1; i <= n; i++) { const d = d0 + (d1 - d0) * i / (n + 1); out.push(DP(d, lat)); }
  return out;
}

/** 台词清单 → Map(id → {durationS, gapBeforeS, who, speaker, subtitle, issues}) */
export function VoiceIndex(voice) {
  const map = new Map();
  for (const scene of voice?.scenes || []) for (const l of scene.lines || []) map.set(l.id, l);
  return map;
}

// ---------------------------------------------------------------------------
// 序列构造器

class Seq {
  constructor(ctx, keyframe, title) {
    this.ctx = ctx;
    this.kf = ctx.config.keyframes.find(k => k.id === keyframe);
    if (!this.kf) throw new Error(`关键帧不存在：${keyframe}`);
    this.out = { keyframe, title, durationS: 0, then: "next", camera: [], actors: [], lines: [], events: [] };
    this.actorMap = new Map();
    this.pos = new Map(); // id → 最后一个位置键的 {x,z,t}
    for (const u of this.kf.units || []) this.pos.set(u.id, { x: u.x, z: u.z, t: 0 });
    this.player = { x: this.kf.player.x, z: this.kf.player.z };
    this.lastLineEnd = 0;
  }
  Actor(id) {
    let a = this.actorMap.get(id);
    if (!a) {
      if (!this.pos.has(id)) throw new Error(`${this.out.keyframe}：单位 ${id} 不在关键帧里（临时加人用 Spawn）`);
      a = { id, keys: [] };
      this.actorMap.set(id, a);
      this.out.actors.push(a);
    }
    return a;
  }
  Spawn(id, spawn, firstKey = {}) {
    if (this.pos.has(id)) throw new Error(`${this.out.keyframe}：spawn ${id} 与布设重名`);
    const a = { id, spawn: { side: "nra", kind: "soldier", ...spawn }, keys: [] };
    this.actorMap.set(id, a);
    this.out.actors.push(a);
    this.pos.set(id, { x: spawn.x, z: spawn.z, t: 0 });
    if (Object.keys(firstKey).length) this.Key(id, 0, firstKey);
    return this;
  }
  /** 只写变了的字段（不带位置时不动位置记录）。 */
  Key(id, t, fields) {
    const a = this.Actor(id);
    const key = { t: R(t), ...fields };
    for (const k of ["x", "z"]) if (key[k] !== undefined) key[k] = R(key[k]);
    if (key.path) key.path = key.path.map(p => ({ x: R(p.x), z: R(p.z) }));
    a.keys.push(key);
    if (key.x !== undefined) this.pos.set(id, { x: key.x, z: key.z, t: key.t });
    return this;
  }
  /** 瞬移到某处（开场摆位用）。 */
  Place(id, t, x, z, fields = {}) { return this.Key(id, t, { x, z, move: "cut", ...fields }); }
  /** tDepart 从当前位置出发，tArrive 到 (x,z)。fields 挂在到达键上；depart 挂在出发键上。 */
  Go(id, tDepart, tArrive, x, z, { move = "walk", path, depart = {}, ...fields } = {}) {
    const cur = this.pos.get(id);
    if (!cur) throw new Error(`${this.out.keyframe}：${id} 没有位置`);
    if (tDepart > cur.t + 0.001 || Object.keys(depart).length) this.Key(id, tDepart, { x: cur.x, z: cur.z, move: "cut", ...depart });
    return this.Key(id, tArrive, { x, z, move, ...(path ? { path } : {}), ...fields });
  }
  Line(t, line, actor) {
    const v = this.ctx.voice.get(line);
    if (!v) throw new Error(`台词不存在：${line}`);
    const entry = { t: R(t), line };
    if (actor) entry.actor = actor;
    this.out.lines.push(entry);
    this.lastLineEnd = Math.max(this.lastLineEnd, R(t + v.durationS));
    return R(t + v.durationS);
  }
  /** 接着上一句按录音间隔排；at 给了且更晚就用 at。返回这句的开始时刻。 */
  Say(line, actor, at = null, minGap = 0.15) {
    const v = this.ctx.voice.get(line);
    if (!v) throw new Error(`台词不存在：${line}`);
    const natural = this.lastLineEnd + Math.max(v.gapBeforeS || 0, minGap);
    const t = R(at === null ? natural : Math.max(at, natural));
    this.Line(t, line, actor);
    return t;
  }
  End(line) { return R(this.out.lines.find(l => l.line === line).t + this.ctx.voice.get(line).durationS); }
  Ev(t, type, fields = {}) { this.out.events.push({ t: R(t), type, ...fields }); return this; }
  Sfx(t, name, fields = {}) { return this.Ev(t, "sfx", { name, ...fields }); }
  Caption(t, dur, text) { return this.Ev(t, "caption", { text, dur }); }
  Shake(t, dur, strength) { return this.Ev(t, "shake", { dur, strength }); }
  /** 第一人称镜头：顺子的眼睛。target 给了就换算朝向。 */
  Eye(t, dur, { x, z, stance = "stand", yaw, pitch = 0, toYaw, toPitch, look, toLook, shake, fov }) {
    const at = { x: x ?? this.player.x, z: z ?? this.player.z };
    const eye = { x: R(at.x), z: R(at.z), stance };
    eye.yawDeg = R(look ? Yaw(at, look) : yaw);
    eye.pitchDeg = R(pitch);
    if (toLook) eye.toYawDeg = Yaw(at, toLook);
    else if (toYaw !== undefined) eye.toYawDeg = R(toYaw);
    if (toPitch !== undefined) eye.toPitchDeg = R(toPitch);
    const c = { t: R(t), dur: R(dur), eye };
    if (fov) c.fov = fov;
    if (shake) c.shake = shake;
    this.out.camera.push(c);
    return this;
  }
  /** 机位：from / to（点或演员锚），look / lookTo。 */
  Cam(t, dur, { from, to, look, lookTo, fov, ease, shake }) {
    const P = p => (p.actor ? { actor: p.actor, offset: (p.offset || [0, 0, 0]).map(R) } : { x: R(p.x), z: R(p.z), ...(p.h !== undefined ? { h: R(p.h) } : {}) });
    const c = { t: R(t), dur: R(dur), from: P(from), look: P(look) };
    if (to) c.to = P(to);
    if (lookTo) c.lookTo = P(lookTo);
    if (fov) c.fov = fov;
    if (ease) c.ease = ease;
    if (shake) c.shake = shake;
    this.out.camera.push(c);
    return this;
  }
  Done({ durationS, then = "next" }) {
    // 收尾时还在走的人（往外走、往下一站走）让段落多留到他们的最后一个键
    const lastKey = Math.max(0, ...this.out.actors.flatMap(a => a.keys.map(k => k.t)));
    const lastEvent = Math.max(0, ...this.out.events.map(e => e.t + (e.dur || 0) * (e.type === "smoke" ? 0 : 1)));
    this.out.durationS = R(Math.max(durationS, lastKey + 0.2, lastEvent, this.lastLineEnd + 0.4));
    this.out.then = then;
    for (const a of this.out.actors) a.keys.sort((p, q) => p.t - q.t);
    this.out.camera.sort((p, q) => p.t - q.t);
    this.out.lines.sort((p, q) => p.t - q.t);
    this.out.events.sort((p, q) => p.t - q.t);
    return this.out;
  }
}

// 常用点
const DUG = { x: 66.5, z: 64.5 };                 // 洞里
const DUG_MOUTH = { x: PL.dugoutMouth.x, z: PL.dugoutMouth.z };
const PIT_GUN = { x: 0, z: -7 };
const MORTAR = { x: PL.mortar.x, z: PL.mortar.z };

/** 掷弹筒一发：嘭（远处冒烟）→ 约 5.5 s 后落地。效果挂落地。 */
function Mortar(s, tPop, hit, { kind = "launcher", radius = 4, shake = 0.45 } = {}) {
  s.Sfx(tPop, "mortarPop", { x: MORTAR.x, z: MORTAR.z });
  s.Ev(tPop, "smoke", { x: MORTAR.x, z: MORTAR.z + 2, kind: "SmokeWhite", dur: 4 });
  const tHit = tPop + 5.5;
  s.Sfx(tHit, "mortarImpact", { x: hit.x, z: hit.z });
  s.Ev(tHit, "explosion", { x: hit.x, z: hit.z, kind, radius });
  if (shake) s.Shake(tHit, 0.5, shake);
  return R(tHit);
}
/** 子弹打在土里（小土点）。 */
function Puff(s, t, p) { return s.Ev(t, "explosion", { x: p.x, z: p.z, kind: "grenade", radius: 0.8 }); }
/** 某人开一枪（枪口火 + 枪声）。 */
function Shot(s, t, actor, { count = 1, interval, sfx = "rifleShot", at } = {}) {
  s.Ev(t, "muzzle", { actor, ...(count > 1 ? { count, interval: interval ?? 0.11 } : {}) });
  const p = at || (actor === "player" ? s.player : s.pos.get(actor));
  if (sfx) s.Sfx(t, sfx, p ? { x: R(p.x), z: R(p.z) } : {});
  return s;
}

// ---------------------------------------------------------------------------
// 2026-10-19 占位动作（Data_BlockoutPrevizClips：PrevizTalk / PrevizCare / PrevizCombat / PrevizIja + CollectionCare）
// 说话姿态（用户 10-19：「讲话还拿着枪的很出戏」）：说话那一刻正在开枪的（前后 1.5 s 内有他的枪口火）可以端枪；其余说话的人
// 一律不端枪 —— 不打仗的地方（01 防炮洞、02末集结处、03-1 交通沟里走）站着 PvStandTalkSlung、跪 / 蹲 PvCrouchTalkRifle、
// 坐着 WoundedSitRifleIdle 这类；打仗的地方站着 PvStandTalkLowRifle，要指 / 挥 / 招 / 拦就用对应的手势片段。
// 0105 PrevizTest 的 TalkPostureChecks 钉住这条。
const TALK_SLUNG = "PvStandTalkSlung", TALK_LOW = "PvStandTalkLowRifle", TALK_CROUCH = "PvCrouchTalkRifle";
/** 拖被子的速度（m/s）：片段 PvBlanketDragL/R 的基准 0.8 m/s；这里 1.2（播放约 1.5 倍，原来 1.4–1.9 m/s 腿倒得飞快）。 */
export const DRAG_MPS = 1.2;
/** p 往朝向 yaw 的前方 f 米、右边 r 米（yaw 口径同 Yaw()：0 北，+90 西）。 */
function Off(p, yaw, f, r = 0) {
  const a = yaw * Math.PI / 180;
  return { x: R(p.x - Math.sin(a) * f + Math.cos(a) * r), z: R(p.z - Math.cos(a) * f - Math.sin(a) * r) };
}
/**
 * 架伤员（PrevizCombat stage supportWalk）：机枪手播 PvSupportedHop，幺娃在他左边 0.5 m、靠前 6 cm 播 PvSupportWalkL；
 * 同一时刻起、同一个时间窗、幺娃的路线 = 机枪手的路线往左平移（运行时两条都按实际速度 / 0.9 推身体时钟）。
 * 到了站住：片段停在那一帧，人还架着。
 */
function SupportGo(s, t0, t1, to, { path = [], faceTo, yawDeg, stance = "stand" } = {}) {
  const g0 = s.pos.get("Gunner");
  const pts = [g0, ...path, to];
  const segYaw = i => Yaw(pts[Math.max(0, i - 1)], pts[Math.max(1, i)]);
  const side = (p, i) => Off(p, segYaw(i), 0.06, -0.5);
  const y0 = side(g0, 0), yPath = path.map((p, k) => side(p, k + 1)), yTo = side(to, pts.length - 1);
  const end = { ...(faceTo ? { faceTo } : {}), ...(yawDeg !== undefined ? { yawDeg } : {}) };
  s.Key("Yaowa", t0, { x: y0.x, z: y0.z, move: "cut", stance, clip: "PvSupportWalkL", yawDeg: segYaw(1) });
  s.Go("Gunner", t0, t1, to.x, to.z, { move: "walk", ...(path.length ? { path } : {}), depart: { clip: "PvSupportedHop", woundedWalk: false, stance, yawDeg: segYaw(1) }, stance, ...end });
  s.Go("Yaowa", t0, t1, yTo.x, yTo.z, { move: "walk", ...(yPath.length ? { path: yPath } : {}), stance, ...end });
}
/** 扑倒（PvStandToProneDive：骨盆往前带 0.8 m）：t 起扑，1.2 s 播完把人挪到片段末尾那一点、趴着、清掉片段（after 并进那个键）。 */
function Dive(s, id, t, yaw, after = {}) {
  const end = Off(s.pos.get(id), yaw, 0.8);
  s.Key(id, t, { clip: "PvStandToProneDive", yawDeg: yaw });
  s.Key(id, t + 1.2, { x: end.x, z: end.z, move: "cut", stance: "prone", clip: null, ...after });
  return end;
}
/**
 * 翻出沟（PvClimbOutTrench：原地动作，运行时按清单 rootPath 把根往前 0.85 m、往上挪到沟沿，往上的量按沟深等比放大）：
 * t 起播（朝向 yaw 先转好），2.5 s 播完把人挪到沟沿上那一点、清掉片段（after 并进那个键）。
 */
function ClimbOut(s, id, t, yaw, after = {}) {
  const end = Off(s.pos.get(id), yaw, 0.85);
  s.Key(id, R(t - 0.45), { yawDeg: yaw });
  s.Key(id, t, { clip: "PvClimbOutTrench", stance: "stand" });
  s.Key(id, t + 2.5, { x: end.x, z: end.z, move: "cut", clip: null, ...after });
  return end;
}
/**
 * 03 远处的掷弹筒组（PrevizIja stage launcherCrew，V2）：射手 PvIjaLauncherFire（2 s 一循环、1.60 s 发射），装填手在射手右前
 * (0.82, 0.86)、左转 107° 播 PvIjaLauncherLoad，同一时刻起播。firstPop = 这一段第一发「嘭」：片段 clipFrom 对齐它，之后每 2 s 一发
 * （这一段 Mortar() 的「嘭」都要落在 firstPop + 2k 上）。
 */
function MortarCrew(s, firstPop) {
  // 关键帧里的 IjaMortar1（射手）/ IjaMortar2（装填手）
  const g = s.pos.get("IjaMortar1"), yaw = Yaw(g, { x: 0, z: -8 });
  const from = R((((1.6 - firstPop) % 2) + 2) % 2);
  // PrevizIja V2（10-19 第二轮，掷弹筒按真实全长 0.61 m 重烘）：装填手在射手右前 (0.82, 0.86)、左转 107°
  const ld = Off(g, yaw, 0.86, 0.82);
  s.Place("IjaMortar1", 0, g.x, g.z, { yawDeg: yaw, stance: "crouch", aim: false, clip: "PvIjaLauncherFire", clipFrom: from });
  s.Place("IjaMortar2", 0, ld.x, ld.z, { yawDeg: R(yaw + 107), stance: "crouch", aim: false, clip: "PvIjaLauncherLoad", clipFrom: from });
}

// ---------------------------------------------------------------------------
// 01 洞里，塌洞

function S0101(ctx) {
  const s = new Seq(ctx, "01-1", "黑场醒来、绑绷带");
  const P = s.player;
  // 黑场里炮声一阵接一阵，有人压着嗓子喊
  s.Ev(0, "black", { dur: 4.6, fade: 0.8 });
  s.Sfx(0.3, "artilleryFar"); s.Sfx(2.4, "artilleryFar", { volume: 0.8 });
  s.Say("CaveWake.01", "Donggua", 1.4);
  s.Key("Donggua", 0, { stance: "crouch", clip: "WoundedSitRifleIdle" });
  s.Key("Yaowa", 0, { faceTo: DUG_MOUTH });
  s.Key("Luo", 0, { yawDeg: 90 }); // 洞口的背影
  // 炮光一闪：挨着坐的是冬瓜，左肩的绷带黑了一大块
  s.Ev(4.5, "flash", { dur: 0.25, strength: 0.3 }); s.Sfx(4.5, "artilleryFar");
  s.Eye(0, 4.5, { stance: "crouch", look: { x: 67.1, z: 65.2 }, pitch: -14 });
  s.Eye(4.5, 2.0, { stance: "crouch", look: { x: 67.1, z: 65.2 }, pitch: -14, toPitch: -20 });
  // 冬瓜把膀子伸过来
  s.Key("Donggua", 5.6, { clip: "PvSitOfferArm", clipHold: true, faceTo: "player" });
  s.Say("CaveWake.02", "Donggua", 6.0);
  // 绑绷带：开场唯一的交互
  s.Eye(6.5, 6.5, { stance: "crouch", look: { x: 67.0, z: 65.1 }, pitch: -20, toPitch: -34 });
  s.Caption(8.0, 4.0, "（按键给冬瓜重新绑绷带：开场唯一的交互）");
  s.Say("CaveWake.03", "Donggua", 11.8);
  s.Key("Donggua", 13.5, { clip: "WoundedSitRifleIdle" });
  // 炮光一闪一闪照出别人：幺娃数炮
  s.Ev(13.8, "flash", { dur: 0.22, strength: 0.28 }); s.Sfx(13.8, "artilleryFar");
  s.Eye(13.6, 1.4, { stance: "crouch", look: { x: 67.0, z: 65.1 }, pitch: -30, toLook: { x: 64.9, z: 63.1 }, toPitch: -6 });
  s.Key("Yaowa", 14.6, { talking: true, clip: "PvCrouchCountFingers" });
  s.Say("CaveWake.04", "Yaowa", 15.4);
  s.Key("Yaowa", 17.6, { talking: false, clip: TALK_CROUCH });
  // 刘文财分子弹
  s.Eye(17.4, 1.2, { stance: "crouch", look: { x: 64.9, z: 63.1 }, pitch: -6, toLook: { x: 68.5, z: 63.2 }, toPitch: -8 });
  s.Key("LiuWencai", 18.2, { clip: "LiuDivideAmmoToss", faceTo: "player" });
  s.Say("CaveWake.05", "LiuWencai", 19.0);
  // 近处落了一发：土从洞顶泼下来，何有田在帽子底下骂
  const near = 24.2;
  s.Sfx(near, "artilleryNear"); s.Ev(near, "flash", { dur: 0.3, strength: 0.45 });
  s.Shake(near, 1.2, 0.55); s.Sfx(near + 0.2, "dirtFall", { x: DUG.x, z: DUG.z });
  s.Ev(near + 0.2, "smoke", { x: 67.4, z: 64.8, kind: "SmokeDust", dur: 4 });
  s.Key("Yaowa", near + 0.1, { clip: "DuckBlast" });
  s.Key("Donggua", near + 0.1, { clip: "DuckBlast" });
  s.Key("Donggua", near + 1.5, { clip: "WoundedSitRifleIdle" });
  s.Key("HeYoutian", near + 0.3, { clip: "HeHelmetSleepSitUp" });
  s.Eye(near + 0.5, 1.2, { stance: "crouch", look: { x: 68.5, z: 63.2 }, pitch: -6, toLook: { x: 69.1, z: 65.7 }, toPitch: -8 });
  s.Say("CaveWake.06", "HeYoutian", near + 2.4);
  // 回头：洞口站着班长的背影
  s.Eye(near + 5.0, 2.5, { stance: "crouch", look: { x: 69.1, z: 65.7 }, pitch: -8, toLook: DUG_MOUTH, toPitch: 0 });
  s.Ev(near + 6.0, "flash", { dur: 0.2, strength: 0.25 }); s.Sfx(near + 6.0, "artilleryFar");
  void P;
  return s.Done({ durationS: near + 9.5 });
}

function S0102(ctx) {
  const s = new Seq(ctx, "01-2", "传令兵报信，幺娃替顺子去");
  const mouthOut = { x: 50, z: BZ(50) };
  // 外面有人边跑边喊；枪炮声一下子近了
  s.Place("Runner", 0, 44, BZ(44), { stance: "stand" });
  s.Eye(0, 4.0, { stance: "crouch", yaw: 94.9, pitch: -3 });
  s.Say("RunnerOrder.01", "Runner", 0.8);
  s.Sfx(1.2, "rifleShot", { x: 30, z: 66 }); s.Sfx(1.6, "mgBurstFar", { x: 37, z: -3 }); s.Sfx(2.4, "artilleryNear", { volume: 0.7 });
  s.Go("Runner", 0.4, 4.0, 61.4, 64.8, { move: "run" });
  s.Key("Runner", 4.0, { stance: "crouch", clip: "MessengerReport", faceTo: "Luo" });
  s.Key("Luo", 3.0, { faceTo: "Runner", clip: TALK_SLUNG });
  const t2 = s.Say("RunnerOrder.02", "Runner", 4.3);
  // 班长下令，转身看着顺子
  s.Eye(4.0, 4.5, { stance: "crouch", look: { x: 61.4, z: 64.8 }, pitch: -2 });
  s.Eye(t2 + 4.4, 1.0, { stance: "crouch", look: { x: 61.4, z: 64.8 }, pitch: -2, toLook: { x: 64.1, z: 65.1 }, toPitch: 4 });
  s.Say("RunnerOrder.03", "Luo");
  s.Key("Luo", s.End("RunnerOrder.03") - 0.6, { faceTo: "player", clip: "PvStandPointL", clipHold: true });
  const t4 = s.Say("RunnerOrder.04", "Luo");
  // 顺子手上还在给冬瓜打结，慢了半拍
  const slow = s.End("RunnerOrder.04");
  s.Eye(slow, 1.3, { stance: "crouch", look: { x: 64.1, z: 65.1 }, pitch: 4, toLook: { x: 67.1, z: 65.2 }, toPitch: -30 });
  s.Key("Luo", slow, { clip: TALK_SLUNG });
  // 幺娃一下站起来
  s.Key("Yaowa", slow + 0.6, { stance: "stand", faceTo: "Luo", clip: TALK_SLUNG });
  s.Eye(slow + 1.3, 1.0, { stance: "crouch", look: { x: 67.1, z: 65.2 }, pitch: -30, toLook: { x: 64.4, z: 63.6 }, toPitch: 6 });
  const t5 = s.Say("RunnerOrder.05", "Yaowa", slow + 1.0);
  // 班长看了顺子一眼，没说话，挥手让幺娃跟传令兵走
  const look = t5 + 2.0;
  s.Key("Luo", look, { faceTo: "player" });
  s.Eye(t5 + 1.4, 2.4, { stance: "crouch", look: { x: 64.4, z: 63.6 }, pitch: 6, toLook: { x: 64.1, z: 65.1 }, toPitch: 4 });
  s.Key("Luo", look + 1.6, { faceTo: "Yaowa", clip: "PvStandWaveOnL" });
  s.Key("Luo", look + 4.4, { clip: null });
  const go = look + 2.2;
  s.Key("Runner", go - 0.2, { stance: "stand", clip: null });
  s.Go("Yaowa", go, go + 6.5, 30, BZ(30), { move: "run", path: [{ x: 62, z: 64.6 }, mouthOut], depart: { clip: null } });
  s.Go("Runner", go + 0.3, go + 6.8, 28.5, BZ(28.5) + 0.6, { move: "run", path: [{ x: 52, z: BZ(52) + 0.5 }] });
  s.Key("Yaowa", go + 6.9, { visible: false });
  s.Key("Runner", go + 7.1, { visible: false });
  s.Eye(go, 5.5, { stance: "crouch", look: { x: 62, z: 64.6 }, pitch: 2, toYaw: 93, toPitch: 0 });
  // 刘文财扛起弹药箱，何有田第一个钻出去，其他人一个跟一个出了洞（停在 01-3 的位置上）
  s.Go("HeYoutian", go + 1.0, go + 9.5, 47.06, 65.91, { move: "walk", path: [{ x: 63, z: 64.6 }], depart: { stance: "stand" } });
  s.Key("LiuWencai", go + 1.2, { clip: "LiuBoxUpGo" });
  s.Go("LiuWencai", go + 3.6, go + 10.5, 52, 64.8, { move: "walk", path: [{ x: 63, z: 64.6 }], depart: { stance: "stand" } });
  s.Go("Squad1", go + 3.0, go + 8.5, 56.04, 65.34, { move: "walk", path: [{ x: 63, z: 64.6 }], depart: { stance: "stand" } });
  s.Go("Squad2", go + 4.5, go + 12.5, 43.51, 65.33, { move: "walk", path: [{ x: 63, z: 64.6 }], depart: { stance: "stand" } });
  s.Go("Luo", go + 6.0, go + 7.5, 62.4, 64.5, { move: "walk", yawDeg: -90 });
  void t4;
  return s.Done({ durationS: go + 10.5 });
}

function S0103(ctx) {
  const s = new Seq(ctx, "01-3", "最后两个人：今天就跑");
  const DG = { x: 65.5, z: 65.6 }; // 布设里离顺子的眼睛只有 1.3 m，挪开到 1.8 m
  const LUO = { x: 62.4, z: 64.5 };
  // 冬瓜单手往背包里塞东西，塞不进去，顺子帮他捆好
  s.Place("Donggua", 0, DG.x, DG.z, { stance: "crouch" });
  s.Key("Donggua", 0, { clip: "PvSitStuffPack", faceTo: { x: 66.3, z: 64.6 } });
  s.Eye(0, 3.0, { stance: "crouch", look: DG, pitch: -30 });
  s.Caption(0.3, 2.6, "（冬瓜单手塞背包，塞不进去，顺子帮他捆好）");
  // 班长在洞口回头
  s.Eye(2.6, 1.0, { stance: "crouch", look: DG, pitch: -30, toLook: LUO, toPitch: 2 });
  s.Key("Luo", 2.6, { clip: "PvStandBeckonL" });
  s.Say("LastTwo.01", "Luo", 3.0);
  s.Say("LastTwo.02"); // 顺子：来了！
  // 班长看了他们俩一会儿，走了
  const luoGo = s.End("LastTwo.02") + 2.0;
  s.Key("Luo", s.End("LastTwo.01"), { clip: null });
  s.Go("Luo", luoGo, luoGo + 7.0, 34, BZ(34) - 0.4, { move: "run" });
  s.Key("Luo", luoGo + 7.2, { visible: false });
  // 顺子拎起自己的背包，包口露出一件老百姓的短褂
  const bag = luoGo + 0.6;
  s.Eye(bag - 0.8, 1.0, { stance: "crouch", look: LUO, pitch: 2, toYaw: 160, toPitch: -50 });
  s.Caption(bag, 2.6, "（包口露出一件老百姓的短褂，顺子往里塞）");
  // 冬瓜一把按住他的手
  const grab = bag + 2.6;
  s.Key("Donggua", grab, { clip: "PvSitGrabHand", clipHold: true, faceTo: "player" });
  s.Eye(grab, 1.0, { stance: "crouch", yaw: 160, pitch: -50, toLook: DG, toPitch: -8 });
  s.Key("Donggua", grab + 0.4, { talking: true });
  s.Say("LastTwo.03", "Donggua", grab + 0.5);
  // 顺子先朝洞口看了一眼
  const glance = s.End("LastTwo.03") + 0.15;
  s.Eye(glance, 0.5, { stance: "crouch", look: DG, pitch: -8, toLook: DUG_MOUTH, toPitch: 0 });
  s.Eye(glance + 0.8, 0.5, { stance: "crouch", look: DUG_MOUTH, pitch: 0, toLook: DG, toPitch: -8 });
  s.Say("LastTwo.04", null, glance + 1.4);
  s.Key("Donggua", s.End("LastTwo.04"), { clip: "WoundedSitRifleIdle" });
  for (const id of ["LastTwo.05", "LastTwo.06", "LastTwo.07", "LastTwo.08", "LastTwo.09", "LastTwo.10"]) {
    s.Say(id, id === "LastTwo.06" || id === "LastTwo.09" ? null : "Donggua");
  }
  s.Key("Donggua", s.End("LastTwo.10"), { talking: false });
  // 顺子没答话，把短褂塞了进去
  const stuff = s.End("LastTwo.10") + 0.3;
  s.Eye(stuff, 0.8, { stance: "crouch", look: DG, pitch: -8, toYaw: 160, toPitch: -50 });
  s.Eye(stuff + 2.2, 0.6, { stance: "crouch", yaw: 160, pitch: -50, toLook: DG, toPitch: -6 });
  const go = s.Say("LastTwo.11", "Donggua", stuff + 3.0);
  // 两个人往洞口跑，冬瓜在前
  const run0 = go + 0.5;
  s.Key("Donggua", run0, { stance: "stand", faceTo: DUG_MOUTH });
  s.Go("Donggua", run0 + 0.2, run0 + 2.4, 63.2, 64.9, { move: "run" });
  s.Cam(run0 + 0.2, 2.6, { from: { x: 66.8, z: 64.2, h: 1.05 }, to: { x: 65.2, z: 64.0, h: 1.3 }, look: { x: 62, z: 64.6, h: 1.4 }, ease: "linear" });
  // 洞外的兵喊：炮！趴下——！
  s.Spawn("Shouter", { side: "nra", x: 50, z: BZ(50), yawDeg: 90, stance: "stand" }, { visible: false });
  s.Key("Shouter", run0 - 0.6, { visible: true });
  // 跑着喊（walk = 整个窗口匀速约 2 m/s 小跑过来；run 会等到最后 2 s 才出发，喊的时候还干站着）
  s.Go("Shouter", run0 - 0.6, run0 + 3.0, 57.5, BZ(57.5), { move: "walk", yawDeg: -90 });
  const shout = s.Say("LastTwo.12", "Shouter", run0 + 0.6);
  // 洞口外一道白光，一声闷响；冬瓜被气浪拍在沟壁上；黑场，耳鸣
  const blast = shout + 1.6;
  s.Ev(blast, "flash", { dur: 0.4, strength: 1 });
  s.Sfx(blast, "shellBlast", { x: 60.5, z: 64.7 });
  s.Ev(blast, "explosion", { x: 60.2, z: 63.9, kind: "shell", radius: 5 });
  s.Shake(blast, 0.8, 1);
  s.Key("Donggua", blast + 0.05, { clip: "BlastSlamBuried", clipHold: true });
  s.Key("Shouter", blast + 0.1, { visible: false });
  s.Ev(blast + 0.2, "signal", { name: "DugoutCollapsed", on: true });
  s.Ev(blast + 0.3, "black", { dur: 5.0, fade: 0.15 });
  s.Sfx(blast + 0.4, "tinnitus");
  s.Caption(blast + 1.2, 3.5, "（耳鸣）");
  return s.Done({ durationS: blast + 5.4 });
}

function S0104(ctx) {
  const s = new Seq(ctx, "01-4", "塌洞后醒来：先头部队清沟");
  const P = s.player;
  // 黑场渐亮，耳鸣里枪炮声慢慢回来；脸贴着泥
  s.Ev(0, "black", { dur: 3.6, fade: 2.6 });
  s.Sfx(0, "tinnitus");
  s.Caption(0.4, 4.0, "（耳鸣里枪炮声慢慢回来。腰以下动不了，全程只能转头）");
  s.Sfx(3.0, "artilleryFar", { volume: 0.6 });
  // 鬼子从路那边的沟沿上跳下来（先摆在北沿上）
  s.Place("IjaJia", 0, 56.8, 60.2, { yawDeg: 180, stance: "crouch" });
  s.Place("IjaYi", 0, 58.8, 60.2, { yawDeg: 180, stance: "crouch", aim: false });
  s.Place("IjaDing", 0, 55.0, 60.3, { yawDeg: 180, stance: "crouch", aim: false });
  s.Place("IjaMgGunner", 0, 54.0, 59.8, { yawDeg: 180, stance: "crouch", aim: false });
  s.Place("IjaMgLoader", 0, 55.3, 59.7, { yawDeg: 180, stance: "crouch" });
  s.Eye(0, 4.5, { stance: "prone", yaw: 88.6, pitch: -2 });
  s.Eye(4.5, 1.4, { stance: "prone", yaw: 88.6, pitch: -2, toLook: { x: 57, z: 62 }, toPitch: 9 });
  const drop = 5.2;
  s.Key("IjaJia", drop, { stance: "stand", clip: "IjaDropInPoint" });
  s.Go("IjaJia", drop, drop + 1.2, 56.6, 64.2, { move: "run", yawDeg: 90 });
  s.Key("IjaYi", drop + 0.4, { stance: "stand", clip: "IjaDropInKneel" });
  s.Go("IjaYi", drop + 0.4, drop + 1.6, 58.6, 64.6, { move: "run", yawDeg: -90 });
  s.Key("IjaDing", drop + 0.8, { stance: "stand", clip: "IjaDropInStand" });
  s.Go("IjaDing", drop + 0.8, drop + 2.2, 54.8, 65.2, { move: "run", yawDeg: 90 });
  s.Key("IjaJia", drop + 1.3, { clip: "PvIjaSignalSplit" });
  // 一声不吭，打着手势分开：丁守岔口，甲往前甩手榴弹
  s.Eye(drop + 2.2, 2.0, { stance: "prone", look: { x: 57, z: 62 }, pitch: 9, toLook: { x: 54, z: 65 }, toPitch: 2 });
  s.Go("IjaDing", drop + 3.5, drop + 10.5, 46.07, 66.17, { move: "walk", aim: true });
  s.Go("IjaJia", drop + 3.3, drop + 6.5, 52.98, 64.43, { move: "walk", depart: { clip: null } });
  s.Key("IjaJia", drop + 6.8, { clip: "IjaGrenadeKnockThrow", yawDeg: 94.9 });
  const gb = drop + 10.4;
  s.Sfx(gb, "grenadeBlast", { x: 36, z: BZ(36) }); s.Ev(gb, "explosion", { x: 36, z: BZ(36), kind: "grenade", radius: 4 });
  s.Eye(drop + 6.0, 4.5, { stance: "prone", look: { x: 54, z: 65 }, pitch: 2, toLook: { x: 40, z: 66 }, toPitch: 1 });
  // 机枪组把两具尸体垫上沟沿，架起机枪朝后沟打
  s.Spawn("CorpseLip1", { x: 55.4, z: 61.8, stance: "prone", state: "down", yawDeg: 0 });
  s.Spawn("CorpseLip2", { x: 56.6, z: 61.9, stance: "prone", state: "down", yawDeg: 20 });
  const mg = drop + 4.0;
  s.Go("IjaMgGunner", mg - 2.0, mg, 56, 61.6, { move: "walk", yawDeg: 90 });
  s.Key("IjaMgGunner", mg, { clip: "IjaHeaveCorpseLip" });
  s.Go("IjaMgLoader", mg - 2.0, mg, 57.3, 61.4, { move: "walk", yawDeg: 90 });
  s.Key("IjaMgGunner", mg + 2.8, { stance: "prone", clip: "IjaProneLmgOnCorpse" });
  s.Key("IjaMgGunner", mg + 4.8, { clip: null, aim: true });
  s.Key("IjaMgLoader", mg + 3.0, { stance: "prone" });
  // 乙顺着沟往这边走，见到趴着的人就往背上扎一刀
  s.Spawn("BodyNra1", { x: 59.6, z: 65.6, stance: "prone", state: "down", yawDeg: -80 });
  s.Spawn("BodyNra2", { x: 60.9, z: 63.8, stance: "prone", state: "down", yawDeg: 100 });
  const stab = drop + 11.5;
  s.Key("IjaYi", stab - 1.6, { aim: true });
  s.Go("IjaYi", stab - 1.6, stab, 59.0, 65.1, { move: "walk", faceTo: "BodyNra1" });
  s.Key("IjaYi", stab, { clip: "IjaWalkStabProne" });
  s.Sfx(stab + 0.9, "stab", { x: 59.6, z: 65.6 });
  s.Go("IjaYi", stab + 2.0, stab + 3.0, 60.2, 64.3, { move: "walk", faceTo: "BodyNra2" });
  s.Key("IjaYi", stab + 3.1, { clip: "IjaStompStabTwist" });
  s.Sfx(stab + 4.2, "stab", { x: 60.9, z: 63.8 });
  s.Go("IjaYi", stab + 5.8, stab + 6.8, 60.19, 64.38, { move: "walk", yawDeg: -86 });
  s.Eye(stab - 1.4, 1.2, { stance: "prone", look: { x: 40, z: 66 }, pitch: 1, toLook: { x: 59.6, z: 65.5 }, toPitch: -3 });
  s.Eye(stab + 2.2, 1.0, { stance: "prone", look: { x: 59.6, z: 65.5 }, pitch: -3, toLook: { x: 60.8, z: 63.9 }, toPitch: 4 });
  // 机枪响；支沟口台阶那头有枪在还（何有田的压制组，顺子顺着笔直的支沟看得见枪口火光）
  const fire = stab + 6.0;
  s.Eye(fire, 1.4, { stance: "prone", look: { x: 60.8, z: 63.9 }, pitch: 4, toLook: { x: 56, z: 61.6 }, toPitch: 9 });
  for (const [i, dt] of [0, 3.2, 6.9, 10.4].entries()) {
    Shot(s, fire + 1.2 + dt, "IjaMgGunner", { count: 6 - (i % 2), sfx: "mgBurstNear" });
    Puff(s, fire + 1.5 + dt, { x: PL.steps.x + (i % 2), z: PL.steps.z - 0.3 });
  }
  StepsFire(s, fire + 2.2, fire + 15.5);
  s.Eye(fire + 4.6, 1.6, { stance: "prone", look: { x: 56, z: 61.6 }, pitch: 9, toLook: PL.steps, toPitch: 1 });
  s.Caption(fire + 6.4, 3.0, "（支沟口台阶那头有枪在还：班长他们被这挺机枪压着，过不来）");
  // 枪在一臂开外，够不着
  s.Eye(fire + 12.6, 1.2, { stance: "prone", look: PL.steps, pitch: 1, toLook: { x: 62.1, z: 63.4 }, toPitch: -20 });
  s.Caption(fire + 13.2, 3.0, "（枪在一臂开外，够不着）");
  // 顺子看不见的另一拨：班长带刘文财和两个弟兄在支沟口往南 10 m 处爬出交通沟，贴南沿土垄外侧往东爬
  OutflankCrawl(s, ctx, { tClimb: 5.0, from: "trench", toD: OUTFLANK_014_END });
  void P;
  return s.Done({ durationS: fire + 16.8 });
}

/** 南沿土垄外侧爬行线（与关键帧生成器 OUTFLANK_CRAWL_LAT 同值）。 */
const CRAWL_LAT = -6.2;
const OUTFLANK = ["Luo", "LiuWencai", "Squad2", "Squad3"];
/** 01-4 预演末尾爬到哪（沿支沟从支沟口量）；02-1 预演从这里接着爬。 */
const OUTFLANK_014_END = { Luo: 21.5, LiuWencai: 19.9, Squad2: 18.3, Squad3: 16.7 };
/** 02-1 预演末尾 = 02-1 / 02-2 关键帧里趴在土垄背后的位置。 */
const OUTFLANK_021_AT = OUTFLANK_FIRE_021, OUTFLANK_021_LAT = OUTFLANK_FIRE_LAT;
/** 压制组在台阶上一直朝北沿机枪打（何有田、一个弟兄轮流开枪）。 */
function StepsFire(s, t0, t1, gap = 1.35) {
  let i = 0;
  for (let t = t0; t < t1; t += gap * (i % 3 === 2 ? 1.6 : 1), i++) {
    const id = i % 2 ? "Squad1" : "HeYoutian";
    Shot(s, t, id, { sfx: i % 4 === 0 ? "rifleShot" : null });
    if (i % 3 === 1) Puff(s, t + 0.12, { x: PL.enemyBranchGun.x - 0.6 + (i % 2), z: PL.enemyBranchGun.z + 0.9 });
  }
}
/**
 * 迂回组：from "trench" = 从交通沟里爬出去（01-4），from "crawl" = 接着上一段的位置爬（02-1）。
 * toD = 每人爬到支沟里程 d（toLat 缺省 = 爬行线）；趴着爬（crawl 0.5 m/s），按到达时刻倒推出发。
 */
function OutflankCrawl(s, ctx, { tClimb = 0, from, toD, toLat = CRAWL_LAT, startD = null }) {
  OUTFLANK.forEach((id, k) => {
    const exit = { x: PL.outflankExit.x + k * 0.35, z: PL.outflankExit.z + k * 0.55 };
    if (from === "trench") {
      s.Place(id, 0, ...Object.values(TP(T_BRANCH + 8.5 + k * 1.3, k % 2 ? -0.2 : 0.9)), { stance: "crouch", aim: false, yawDeg: 160 });
      const tUp = tClimb + k * 1.4;
      // 2026-10-19：翻出交通沟（PvClimbOutTrench，按 rootPath 挪到沟沿），再趴下爬到出口
      const rim = ClimbOut(s, id, tUp, Yaw(s.pos.get(id), exit), { stance: "prone" });
      const tExit = R(tUp + 2.5 + Math.max(0.8, Dist(rim, exit) / 0.5));
      s.Go(id, tUp + 2.5, tExit, exit.x, exit.z, { move: "crawl" });
      const via = BP(9 - k * 0.8, CRAWL_LAT);
      const end = BP(toD[id], toLat);
      const len = Dist(exit, via) + Dist(via, end);
      const t0 = tExit + 0.2;
      s.Go(id, t0, R(t0 + len / 0.5), end.x, end.z, { move: "crawl", path: [via], yawDeg: -88 });
    } else {
      const st = BP(startD[id], CRAWL_LAT);
      s.Place(id, 0, st.x, st.z, { stance: "prone", aim: false, yawDeg: -88 });
      const end = BP(toD[id], toLat);
      const t0 = tClimb + k * 0.8;
      s.Go(id, t0, R(t0 + Dist(st, end) / 0.5), end.x, end.z, { move: "crawl", faceTo: BP(toD[id], 0) });
    }
  });
}

// ---------------------------------------------------------------------------
// 02 枪到手里

function S0201(ctx) {
  const s = new Seq(ctx, "02-1", "审问冬瓜");
  const DGK = { x: 57.5, z: 65.3 };
  // 开场接 01-4：冬瓜在洞口塌土里；鬼子站在 01-4 末的地方
  s.Place("Donggua", 0, 62.9, 65.6, { state: "down", stance: "prone", yawDeg: 0 });
  s.Place("IjaYi", 0, 61.6, 65.0, { aim: true, faceTo: "Donggua" });
  s.Place("IjaJia", 0, 60.6, 64.3, { faceTo: "Donggua" });
  s.Place("IjaDing", 0, 59.4, 65.8, { faceTo: "Donggua" });
  s.Place("Interpreter", 0, 49.5, BZ(49.5), { stance: "stand", yawDeg: -90 });
  s.Eye(0, 3.0, { stance: "prone", look: { x: 62.6, z: 65.4 }, pitch: -6 });
  s.Caption(0.3, 2.4, "（塌土里有人在咳）");
  // 迂回组接着贴南沿土垄外侧往东爬，爬到审问处正对面趴在土垄背后（顺子看不见）
  OutflankCrawl(s, ctx, { tClimb: 2.0, from: "crawl", startD: OUTFLANK_014_END, toD: OUTFLANK_021_AT, toLat: OUTFLANK_021_LAT });
  { const rim = BP(OUTFLANK_021_AT.Luo, OUTFLANK_RIM_LAT + 0.6); s.Sfx(31.6, "dirtFall", { x: rim.x, z: rim.z, volume: 0.35 }); s.Caption(31.8, 3.0, "（南沿上滚下来几块土，鬼子没往那边看）"); }
  // 乙举起刺刀，甲抬手拦住
  s.Key("IjaYi", 1.2, { clip: "PvIjaBayonetRaiseThreat", clipHold: true });
  s.Key("IjaJia", 1.8, { clip: "PvStandHaltL", clipHold: true });
  s.Say("Interrogation.01", "IjaJia", 2.4);
  s.Key("IjaJia", s.End("Interrogation.01"), { clip: null });
  // 冬瓜被拖出来，按着跪在沟壁下（甲揪领子拖，成对片段）
  const drag = s.End("Interrogation.01") + 0.2;
  s.Go("IjaJia", drag - 0.8, drag, 62.3, 65.5, { move: "walk", faceTo: "Donggua" });
  s.Key("IjaJia", drag, { clip: "IjaDragCollarFromDirt" });
  s.Key("Donggua", drag, { clip: "CaptiveDraggedFromDirt", state: "alive" });
  s.Go("IjaJia", drag + 0.6, drag + 4.4, 58.5, 65.2, { move: "drag" });
  s.Go("Donggua", drag + 0.6, drag + 4.4, DGK.x, DGK.z, { move: "drag" });
  s.Key("Donggua", drag + 4.5, { stance: "crouch", clip: "CaptiveKneelMud", yawDeg: 0 });
  s.Go("IjaJia", drag + 4.6, drag + 6.0, 59.1, 64.4, { move: "walk", faceTo: "Donggua" });
  const buttAt = { x: R(DGK.x - 0.8), z: DGK.z };
  s.Go("IjaYi", drag + 1.0, drag + 4.5, buttAt.x, buttAt.z, { move: "walk", faceTo: "Donggua", depart: { clip: null } });
  s.Go("IjaDing", drag + 1.5, drag + 4.6, 58.7, 66.2, { move: "walk", faceTo: "Donggua" });
  s.Eye(drag, 4.6, { stance: "prone", look: { x: 62.3, z: 65.4 }, pitch: -4, toLook: DGK, toPitch: 3 });
  // 后沟的还击越来越密，甲朝那边看了一眼；翻译蹲到冬瓜面前连珠炮
  s.Go("Interpreter", drag + 1.0, drag + 6.4, 57.43, 64.15, { move: "walk", faceTo: "Donggua" });
  s.Key("Interpreter", drag + 6.5, { stance: "crouch", clip: "InterpreterCrouchAsk" });
  StepsFire(s, 1.0, drag + 30, 1.6);
  for (const dt of [3.0, 9.5, 17.0, 26.0]) Shot(s, drag + dt, "IjaMgGunner", { count: 5, sfx: "mgBurstNear" });
  s.Key("IjaJia", drag + 6.3, { yawDeg: 90 });
  s.Key("IjaJia", drag + 8.0, { faceTo: "Donggua" });
  s.Say("Interrogation.02", "Interpreter", drag + 7.0);
  // 冬瓜一口唾沫啐过去
  const spit = s.Say("Interrogation.03", "Donggua");
  s.Key("Interpreter", spit, { clip: "InterpreterGrabCollar" });
  s.Key("Donggua", spit, { talking: true });
  // 乙一枪托砸在他脸上
  const butt = s.End("Interrogation.03") + 0.1;
  s.Key("Donggua", butt, { talking: false });
  s.Key("Donggua", butt - 0.9, { yawDeg: 90 });
  s.Key("IjaYi", butt - 0.5, { clip: "PvIjaButtStrikeFace", faceTo: "Donggua" });
  s.Sfx(butt - 0.08, "slap", { x: DGK.x, z: DGK.z });
  s.Key("Donggua", butt - 0.12, { clip: "PvCaptiveButtHit", clipHold: true });
  s.Key("Interpreter", butt + 0.3, { clip: "InterpreterCrouchAsk" });
  // 甲扫了一眼沟底，看见顺子的眼睛在动
  const found = butt + 1.6;
  s.Key("IjaJia", found, { faceTo: "player", clip: "IjaFoundLook" });
  s.Eye(found - 0.4, 1.0, { stance: "prone", look: DGK, pitch: 3, toLook: { x: 59.1, z: 64.4 }, toPitch: 7 });
  s.Say("Interrogation.04", "IjaJia", found + 0.5);
  // 乙揪住顺子的头发，把头拽起来；翻译转过来问同样的话
  const hair = s.End("Interrogation.04") + 0.2;
  const pp = s.player, yiFrom = { x: 62.4, z: 63.4 }, yiD = Dist(yiFrom, pp);
  const yiAt = { x: R(pp.x + (yiFrom.x - pp.x) / yiD * 0.70), z: R(pp.z + (yiFrom.z - pp.z) / yiD * 0.70) };
  s.Go("IjaYi", hair - 2.6, hair, yiAt.x, yiAt.z, { move: "walk", faceTo: "player" });
  s.Key("IjaYi", hair, { stance: "crouch", clip: "PvIjaCrouchHairLift", clipHold: true, aim: false });
  s.Cam(hair, 0.95, { from: { actor: "player", offset: [0, 0.30, 0] }, look: { x: 61.0, z: 64.2, h: 1.0 }, shake: 0.1 });
  s.Cam(hair + 0.95, 0.55, { from: { actor: "player", offset: [0, 0.30, 0] }, to: { actor: "player", offset: [0, 0.56, 0] }, look: { x: 61.0, z: 64.2, h: 1.0 }, lookTo: { x: 61.2, z: 64.4, h: 1.0 }, shake: 0.2 });
  s.Go("Interpreter", hair - 0.8, hair + 2.4, 61.9, 64.4, { move: "walk", depart: { stance: "stand", clip: null }, stance: "crouch", faceTo: "player" });
  s.Key("Interpreter", hair + 2.5, { clip: "InterpreterCrouchAsk" });
  s.Cam(hair + 1.5, 1.5, { from: { actor: "player", offset: [0, 0.56, 0] }, look: { x: 61.2, z: 64.4, h: 1.0 }, lookTo: { actor: "Interpreter", offset: [0, 0.9, 0] } });
  const ask = s.Say("Interrogation.05", "Interpreter", hair + 2.6);
  s.Cam(hair + 3.0, s.End("Interrogation.05") - hair - 3.0 + 0.5, { from: { actor: "player", offset: [0, 0.56, 0] }, look: { actor: "Interpreter", offset: [0, 0.9, 0] } });
  // 顺子不吭声，挨了两记耳光，画面发晕
  const slap = s.End("Interrogation.05") + 0.6;
  s.Go("IjaJia", slap - 2.2, slap, 62.5, 63.0, { move: "walk", faceTo: "player" });
  s.Key("IjaJia", slap, { clip: "IjaSlapForehand" });
  s.Key("IjaJia", slap + 1.5, { clip: "IjaSlapBackhand" });
  for (const dt of [0.7, 2.2]) { s.Sfx(slap + dt, "slap", { x: P0(s).x, z: P0(s).z }); s.Shake(slap + dt, 0.45, 0.6); }
  s.Cam(slap + 0.5, 0.4, { from: { actor: "player", offset: [0, 0.56, 0] }, look: { actor: "IjaJia", offset: [0, 1.4, 0] }, lookTo: { actor: "IjaJia", offset: [0.9, 0.9, 1.2] }, shake: 0.5, ease: "linear" });
  s.Cam(slap + 0.9, 1.3, { from: { actor: "player", offset: [0, 0.56, 0] }, look: { actor: "IjaJia", offset: [0.9, 0.9, 1.2] }, lookTo: { actor: "IjaJia", offset: [0, 1.3, 0] }, shake: 0.3 });
  s.Cam(slap + 2.2, 0.4, { from: { actor: "player", offset: [0, 0.56, 0] }, look: { actor: "IjaJia", offset: [0, 1.3, 0] }, lookTo: { actor: "IjaJia", offset: [-1.0, 0.8, -1.0] }, shake: 0.6, ease: "linear" });
  s.Cam(slap + 2.6, 2.4, { from: { actor: "player", offset: [0, 0.48, 0] }, look: { actor: "IjaJia", offset: [-1.0, 0.8, -1.0] }, lookTo: { actor: "IjaJia", offset: [0, 1.1, 0] }, shake: 0.35, fov: 66 });
  s.Caption(slap + 2.7, 2.6, "（画面发晕）");
  // 后沟的枪声又近了一点。甲：没时间了。
  s.Sfx(slap + 3.6, "rifleVolley", { x: 30, z: 66, volume: 0.6 });
  s.Key("IjaJia", slap + 3.8, { clip: TALK_LOW });
  const late = s.Say("Interrogation.06", "IjaJia", slap + 4.4);
  s.Key("IjaYi", late + 0.6, { stance: "stand", clip: null, aim: true });
  s.Go("IjaYi", late + 0.8, late + 2.6, 60.4, 65.6, { move: "walk", faceTo: "Donggua" });
  s.Eye(late + 0.8, 1.2, { stance: "prone", look: { x: 61.5, z: 63.6 }, pitch: 8, toLook: DGK, toPitch: 3 });
  s.Go("IjaJia", late + 0.6, late + 3.0, 59.1, 64.4, { move: "walk", faceTo: "IjaDing", depart: { clip: null }, clip: TALK_LOW });
  s.Go("Interpreter", late + 1.0, late + 3.4, 57.0, 63.8, { move: "walk", depart: { stance: "stand", clip: null }, stance: "crouch", faceTo: "Donggua" });
  // 丁。刺刀。丁不敢上，挨了甲一耳光
  const ding = s.Say("Interrogation.07", "IjaJia", late + 3.0);
  s.Key("IjaDing", ding + 0.8, { faceTo: "IjaJia" });
  const recruit = s.End("Interrogation.07") + 0.9;
  s.Key("IjaJia", recruit - 0.3, { faceTo: "IjaDing" });
  s.Go("IjaJia", recruit - 1.0, recruit - 0.1, 59.0, 65.4, { move: "walk", faceTo: "IjaDing", depart: { clip: null } });
  s.Key("IjaJia", recruit, { clip: "IjaSlapRecruit" });
  s.Key("IjaDing", recruit + 0.1, { clip: "IjaRecruitSlapped" });
  s.Sfx(recruit + 0.6, "slap", { x: 58.7, z: 66.2 });
  // 冲上去一刀扎在冬瓜肩膀，一刀扎进肚子；冬瓜倒在泥里嚎
  const charge = recruit + 2.2;
  s.Key("IjaDing", charge, { clip: "IjaRecruitChargeThrust", faceTo: "Donggua" });
  s.Go("IjaDing", charge, charge + 1.0, 58.2, 65.9, { move: "walk", faceTo: "Donggua" });
  const st1 = charge + 1.4, st2 = charge + 3.0;
  s.Sfx(st1, "stab", DGK); s.Sfx(st2, "stab", DGK);
  s.Key("Donggua", st1, { clip: "CaptiveStabbedCurl", clipHold: true, yawDeg: 0 });
  s.Eye(charge - 0.8, 1.0, { stance: "prone", look: DGK, pitch: 3, toLook: { x: 58.0, z: 65.6 }, toPitch: 1 });
  const howl = s.Say("InterrogationHowl.01", "Donggua", st2 + 0.4);
  s.Key("Donggua", st2 + 2.0, { state: "down", clip: null });
  // 甲指了指顺子：下一个，他。然后揪起冬瓜的头发，把刀抵上他的喉咙
  s.Key("IjaJia", howl + 2.2, { faceTo: "player", clip: "PvStandPointL", clipHold: true });
  const next = s.Say("Interrogation.08", "IjaJia", s.End("InterrogationHowl.01") + 0.3);
  s.Eye(next - 0.6, 0.8, { stance: "prone", look: { x: 58.0, z: 65.6 }, pitch: 1, toLook: { x: 59.0, z: 65.4 }, toPitch: 8 });
  const throat = s.End("Interrogation.08") + 0.4;
  s.Go("IjaJia", throat - 1.0, throat, 57.9, 64.7, { move: "walk", faceTo: "Donggua", depart: { clip: null } });
  s.Key("IjaJia", throat, { stance: "crouch", clip: "IjaCrouchHairHold", clipHold: true });
  s.Key("Donggua", throat + 0.1, { state: "alive", stance: "crouch", clip: "CaptiveCurledPulledUp", clipHold: true });
  s.Eye(throat - 0.6, 1.2, { stance: "prone", look: { x: 59.0, z: 65.4 }, pitch: 8, toLook: { x: 57.7, z: 65.0 }, toPitch: 2 });
  void ask;
  return s.Done({ durationS: throat + 4.6 });
}
function P0(s) { return s.player; }

function S0202(ctx) {
  const s = new Seq(ctx, "02-2", "反冲：南沿上一排枪");
  const K = id => KU(ctx, "02-2", id);
  const K1 = id => KU(ctx, "02-1", id);
  const PIN = KP(ctx, "02-2");
  const STEPS = { x: PL.steps.x, z: PL.steps.z };
  // 开场接 02-1 末：刀抵在冬瓜喉咙上；台阶那头的压制组还在打；迂回组趴在南沿土垄背后
  s.Place("Donggua", 0, 57.7, 65.1, { state: "alive", stance: "crouch", yawDeg: 0, clip: "CaptiveCurledPulledUp", clipFrom: 3.4, clipHold: true });
  s.Place("IjaJia", 0, 57.9, 64.6, { state: "alive", stance: "crouch", faceTo: "Donggua", clip: "IjaCrouchHairHold", clipFrom: 3.6, clipHold: true });
  s.Place("Interpreter", 0, 57.0, 63.8, { state: "alive", stance: "crouch", faceTo: "Donggua" });
  s.Place("IjaYi", 0, 60.4, 65.6, { state: "alive", stance: "stand", aim: true, yawDeg: 90 });
  s.Place("IjaDing", 0, 59.4, 65.4, { state: "alive", stance: "stand", faceTo: "Donggua" });
  s.Place("IjaMgGunner", 0, K1("IjaMgGunner").x, K1("IjaMgGunner").z, { state: "alive", stance: "prone", aim: true, yawDeg: 90 });
  s.Place("IjaMgLoader", 0, K1("IjaMgLoader").x, K1("IjaMgLoader").z, { state: "alive", stance: "prone", yawDeg: 90 });
  s.Spawn("CorpseLip1", { x: 55.4, z: 61.8, stance: "prone", state: "down", yawDeg: 0 });
  s.Spawn("CorpseLip2", { x: 56.6, z: 61.9, stance: "prone", state: "down", yawDeg: 20 });
  for (const id of OUTFLANK) { const p = BP(OUTFLANK_021_AT[id], OUTFLANK_021_LAT); s.Place(id, 0, p.x, p.z, { stance: "prone", aim: false, faceTo: BP(OUTFLANK_021_AT[id], 0) }); }
  for (const id of ["HeYoutian", "Squad1"]) s.Place(id, 0, K1(id).x, K1(id).z, { stance: "crouch", aim: true, faceTo: PL.enemyBranchGun });
  // 台阶那头还在打，机枪回打（顺子趴着顺支沟看得见台阶那头的枪口火光）
  StepsFire(s, 0.2, 2.0, 0.55);
  Shot(s, 0.5, "IjaMgGunner", { count: 5, sfx: "mgBurstNear" }); Puff(s, 0.8, { x: STEPS.x, z: STEPS.z - 0.4 });
  s.Eye(0, 2.0, { stance: "prone", look: STEPS, pitch: 1 });
  // 停火半秒：架机枪的抬起头往西看
  const lull = 2.1;
  s.Caption(lull, 1.8, "（台阶那头的枪声忽然停了，静了半秒）");
  s.Key("IjaMgGunner", lull + 0.3, { stance: "crouch", aim: false, yawDeg: 92 });
  s.Key("IjaMgLoader", lull + 0.5, { stance: "crouch" });
  s.Eye(lull, 0.9, { stance: "prone", look: STEPS, pitch: 1, toLook: PL.enemyBranchGun, toPitch: 10 });
  // 南沿上「打！」：迂回组起身到土垄顶，一排枪从上往下打
  const rise = lull + 1.2;
  OUTFLANK.forEach((id, k) => {
    const p = BP(OUTFLANK_021_AT[id], OUTFLANK_RIM_LAT);
    s.Go(id, rise + k * 0.08, rise + 0.8 + k * 0.08, p.x, p.z, { move: "run", depart: { stance: "crouch", ...(id === "Luo" ? { weapon: "Dadao" } : {}) }, ...(id === "Luo" ? { clip: "CreepDadao" } : { aim: true }), faceTo: BP(OUTFLANK_021_AT[id], 0) });
  });
  const rimLook = BP(OUTFLANK_021_AT.Luo - 1.0, OUTFLANK_RIM_LAT);
  s.Eye(rise - 0.2, 0.8, { stance: "prone", look: PL.enemyBranchGun, pitch: 10, toLook: rimLook, toPitch: 24 });
  const fire = s.Say("Counter.01", "Luo", rise + 0.9);
  const v = R(fire + 0.35);
  s.Sfx(v, "rifleVolley", { x: rimLook.x, z: rimLook.z });
  for (const id of ["LiuWencai", "Squad2", "Squad3"]) s.Ev(v, "muzzle", { actor: id });
  s.Ev(v + 0.9, "muzzle", { actor: "LiuWencai" }); s.Ev(v + 1.1, "muzzle", { actor: "Squad3" });
  // 架机枪的先倒（效果挂落地：十来米，几乎同时），栽进沟里
  s.Key("IjaMgGunner", v + 0.08, { clip: "IjaLmgGunnerShotOnGun", clipHold: true });
  s.Go("IjaMgGunner", v + 0.1, v + 1.9, K("IjaMgGunner").x, K("IjaMgGunner").z, { move: "walk" });
  s.Key("IjaMgGunner", v + 2.1, { state: "down", clip: null });
  // 副射手挨了一枪被掀下沟沿（PvBlastThrownBack：往后掀 0.95 m、枪脱手按 weapon 轨落地；片段一直留着，不再 cut 挪人）
  s.Key("IjaMgLoader", v + 0.15, { stance: "stand", yawDeg: 92 });
  s.Key("IjaMgLoader", v + 0.2, { clip: "PvBlastThrownBack", clipHold: true });
  // 丁胸口中弹，倒在顺子面前
  s.Key("IjaDing", v + 0.3, { clip: "ShotCollapse", clipHold: true });
  s.Go("IjaDing", v + 0.3, v + 1.3, K("IjaDing").x, K("IjaDing").z, { move: "walk" });
  s.Key("IjaDing", v + 1.9, { state: "down", clip: null, yawDeg: -90 });
  // 甲胳膊中弹，手一松，冬瓜摔回泥里
  s.Key("IjaJia", v + 0.5, { stance: "stand", clip: "IjaShotStaggerAway" });
  s.Go("IjaJia", v + 0.5, v + 2.4, 59.3, 64.0, { move: "walk", yawDeg: -60 });
  s.Key("Donggua", v + 0.55, { state: "down", clip: null });
  s.Go("Donggua", v + 0.55, v + 1.0, K("Donggua").x, K("Donggua").z, { move: "cut", yawDeg: 90 });
  s.Eye(v + 0.6, 0.6, { stance: "prone", look: rimLook, pitch: 24, toLook: { x: 59.3, z: 64.0 }, toPitch: 6, shake: 0.15 });
  // 剧本顺序：「打！」→ 日军「敌袭！」→「杀——！」→ 班长抡着大刀跳进沟「砍！」
  Shot(s, v + 1.1, "IjaYi");   // 乙边喊边朝南沿开枪（打仗当下端枪喊）
  s.Say("Counter.02", "IjaYi", v + 1.0);
  s.Key("IjaYi", v + 0.8, { yawDeg: -150 });
  // 机枪一哑，台阶上的压制组起身顺着支沟往前冲；镜头往台阶那头扫一眼
  const surge = R(v + 1.2);
  const heTo = K("HeYoutian"), sq1 = K("Squad1");
  s.Go("HeYoutian", surge, surge + 12.0, heTo.x, heTo.z, { move: "run", path: [BP(12, 0.4), BP(26, 0.4), BP(36.5, 1.2)], depart: { stance: "stand", aim: false }, stance: "crouch", faceTo: "player" });
  s.Go("Squad1", surge + 0.1, surge + 9.0, sq1.x, sq1.z, { move: "run", path: [BP(12, -0.4)], depart: { stance: "stand" }, aim: true, yawDeg: -86 });
  s.Eye(surge, 0.4, { stance: "prone", look: { x: 59.3, z: 64.0 }, pitch: 6, toLook: STEPS, toPitch: 1 });
  // 「杀——！」班长在南沿上撑起身子吼（2026-10-19 用户定：何有田留在台阶上，这一声改给班长，单句补录）；镜头转回南沿
  const rimLuo = BP(OUTFLANK_021_AT.Luo, OUTFLANK_RIM_LAT);
  const roar = s.Say("Counter.03", "Luo", v + 2.3);
  s.Key("Luo", roar - 0.1, { stance: "stand", clip: "PvStandWaveOnL" });
  s.Eye(roar - 0.4, 0.4, { stance: "prone", look: STEPS, pitch: 1, toLook: rimLuo, toPitch: 22 });
  // 班长抡着大刀从南沿上跳进沟里，落地就是一声「砍！」
  const land = BP(OUTFLANK_021_AT.Luo - 1.0, -1.1);
  const chop = s.Say("Counter.04", "Luo", roar + 1.45);
  const jump = R(chop - 0.7);
  // 跳下来就抡起刀（DadaoAmbush：举刀往下劈的那一下，所有骨架都有），落地冲到甲跟前再一刀（LuoDadaoChopRear）
  s.Go("Luo", jump, jump + 0.7, land.x, land.z, { move: "run", depart: { clip: "DadaoAmbush", weapon: "Dadao" }, stance: "stand", faceTo: "IjaJia" });
  s.Eye(jump, 1.2, { stance: "prone", look: BP(OUTFLANK_021_AT.Luo, OUTFLANK_RIM_LAT), pitch: 22, toLook: land, toPitch: 4 });
  // 翻译想跑，被南沿上的刘文财一枪打倒
  s.Key("Interpreter", v + 1.4, { stance: "stand", clip: "InterpreterFlee" });
  s.Go("Interpreter", v + 1.4, v + 3.0, 55.6, 64.0, { move: "run" });
  Shot(s, jump + 1.3, "LiuWencai");
  s.Key("Interpreter", jump + 1.4, { clip: "InterpreterShotStagger" });
  s.Go("Interpreter", jump + 1.4, jump + 3.4, K("Interpreter").x, K("Interpreter").z, { move: "walk" });
  s.Key("Interpreter", jump + 3.6, { state: "down", clip: null, yawDeg: -60 });
  // 甲中了枪也不慌，单手去摸手榴弹；班长一刀先劈在他身上
  s.Key("IjaJia", jump + 0.8, { clip: "IjaGrenadeBitePin", faceTo: "Luo" });
  s.Go("Luo", jump + 1.0, jump + 2.2, 58.6, 64.4, { move: "run", depart: { clip: "CreepDadao" }, faceTo: "IjaJia" });
  s.Key("Luo", jump + 2.3, { clip: "LuoDadaoChopRear", faceTo: "IjaJia" });
  s.Key("IjaJia", jump + 2.8, { clip: "IjaParriedChoppedFall", clipHold: true });
  s.Go("IjaJia", jump + 2.8, jump + 4.0, K("IjaJia").x, K("IjaJia").z, { move: "walk" });
  s.Key("IjaJia", jump + 4.8, { state: "down", clip: null, yawDeg: 90 });
  s.Eye(jump + 1.4, 1.4, { stance: "prone", look: land, pitch: 4, toLook: { x: 59.0, z: 64.2 }, toPitch: 8 });
  // 刘文财在南沿上看见泥里的顺子
  Shot(s, jump + 3.0, "LiuWencai");   // 他在开枪：可以端枪喊
  s.Say("Counter.05", "LiuWencai", jump + 3.4);
  // 乙挺着刺刀从洞口那头冲班长，被南沿上的刘文财一枪打倒
  const yi = R(jump + 4.0);
  s.Go("IjaYi", yi, yi + 1.0, 59.9, 64.9, { move: "run", faceTo: "Luo" });
  s.Key("IjaYi", yi + 0.8, { clip: "BayonetClearWood" });
  Shot(s, yi + 1.2, "LiuWencai");
  s.Key("IjaYi", yi + 1.25, { clip: "ShotCollapse", clipHold: true });
  s.Go("IjaYi", yi + 1.25, yi + 2.2, K("IjaYi").x, K("IjaYi").z, { move: "walk" });
  s.Key("IjaYi", yi + 2.8, { state: "down", clip: null, yawDeg: 90 });
  s.Eye(yi - 0.2, 2.0, { stance: "prone", look: { x: 59.0, z: 64.2 }, pitch: 8, toLook: { x: 60.4, z: 65.0 }, toPitch: 10 });
  // 收尾：班长转身守着洞口那头；刘文财、一个弟兄留在南沿上，另一个跳下来；何有田第一个冲到顺子身边扒土
  const end = R(yi + 3.2);
  s.Go("Luo", end, end + 1.2, K("Luo").x, K("Luo").z, { move: "walk", depart: { clip: null }, yawDeg: -86, aim: true });
  s.Go("LiuWencai", end - 0.6, end + 0.6, K("LiuWencai").x, K("LiuWencai").z, { move: "walk", faceTo: "player" });
  s.Go("Squad2", end - 1.0, end + 1.4, K("Squad2").x, K("Squad2").z, { move: "run", yawDeg: -86 });
  s.Key("HeYoutian", roar + 12.1, { clip: "PvKneelDig" });
  s.Eye(end + 1.0, 2.6, { stance: "prone", look: { x: 60.4, z: 65.0 }, pitch: 10, toLook: { x: heTo.x - 1.2, z: heTo.z }, toPitch: 4 });
  s.Eye(roar + 11.0, 2.0, { stance: "prone", look: { x: heTo.x - 1.2, z: heTo.z }, pitch: 4, toLook: heTo, toPitch: 14 });
  void PIN;
  return s.Done({ durationS: roar + 13.6 });
}

function S0203(ctx) {
  const s = new Seq(ctx, "02-3", "接枪、揪被角");
  const K2 = id => KU(ctx, "02-2", id), K3 = id => KU(ctx, "02-3", id);
  const ME = KP(ctx, "02-2"), END = KP(ctx, "02-3");
  const DG = K2("Donggua");
  const he0 = K2("HeYoutian");
  s.Place("HeYoutian", 0, he0.x, he0.z, { stance: "crouch", faceTo: "player" });
  // 接 02-2：班长手里还是那把大刀（02-2 跳沟劈甲用的），塞枪给顺子之前才换回步枪
  s.Place("Luo", 0, K2("Luo").x, K2("Luo").z, { aim: true, yawDeg: -86, weapon: "Dadao" });
  s.Key("Blanket", 0, { visible: false });
  s.Eye(0, 2.6, { stance: "prone", x: ME.x, z: ME.z, look: he0, pitch: 12 });
  // 何有田扒开土，看见了顺子
  s.Key("HeYoutian", 0.4, { clip: "PvKneelDig" });
  s.Say("Release.01", "HeYoutian", 1.0);
  // 抬起木头，顺子撑着地挣出来
  s.Key("HeYoutian", 2.5, { clip: "HeLiftTimber" });
  const out = s.Say("Release.02", null, 4.6);
  const up = DP(1.3, 0.2);
  s.Cam(out - 0.2, 2.2, { from: { x: ME.x, z: ME.z, h: 0.32 }, to: { x: up.x, z: up.z, h: 1.05 }, look: { x: DG.x + 3.2, z: DG.z, h: 0.6 }, lookTo: { x: DG.x + 0.6, z: DG.z, h: 0.6 } });
  // 何有田扑到冬瓜身边
  const heAtDG = DP(StationOn(DRAG, DG) + 1.2, -0.6);
  s.Go("HeYoutian", out + 0.8, out + 3.2, heAtDG.x, heAtDG.z, { move: "run", faceTo: "Donggua", depart: { clip: null }, stance: "crouch", clip: TALK_CROUCH });
  const hold = s.Say("Release.03", "HeYoutian", out + 3.0);
  s.Eye(out + 2.0, 3.5, { stance: "crouch", x: up.x, z: up.z, look: { x: DG.x + 0.6, z: DG.z }, pitch: -6, toLook: DG, toPitch: -8 });
  // 扯开冬瓜的背包，抽出那床单被铺在沟底，几个人把冬瓜挪上去
  const blanket = s.End("Release.03") + 0.6;
  s.Key("HeYoutian", blanket - 0.4, { clip: "PvKneelPullBlanket", clipHold: true });
  const spread = R(blanket - 0.4 + 2.55);
  s.Key("Blanket", spread, { visible: true });
  s.Key("Donggua", spread, { weapon: null });
  const luoAtDG = DP(StationOn(DRAG, DG) - 1.0, 0.7);
  s.Go("Luo", blanket, blanket + 1.4, luoAtDG.x, luoAtDG.z, { move: "walk", faceTo: "Donggua", depart: { aim: false } });
  s.Key("Luo", blanket + 2.4, { stance: "crouch", clip: "PvKneelHaulBody" });
  s.Key("HeYoutian", blanket + 2.4, { clip: "PvKneelHaulBody", faceTo: "Donggua" });
  s.Caption(blanket, 3.0, "（何有田抽出单被铺在沟底，几个人把冬瓜挪上去）");
  // 顺子过去，蹲在冬瓜右肩旁（他头朝西仰躺，右手边 = 南）；冬瓜一把攥住顺子的袖子
  const near = blanket + 4.4;
  const nearAt = DP(StationOn(DRAG, DG) + 0.45, 0.55);
  s.Cam(near - 1.6, 1.8, { from: { x: up.x, z: up.z, h: 1.05 }, to: { x: nearAt.x, z: nearAt.z, h: 1.05 }, look: { x: DG.x, z: DG.z, h: 0.3 } });
  // 看他的脸和攥过来的手（头朝西：胸口在被子中心往西约 0.3 m），不看腿
  s.Eye(near + 0.2, 3.4, { stance: "crouch", x: nearAt.x, z: nearAt.z, look: { x: DG.x - 0.3, z: DG.z }, pitch: -52 });
  // 冬瓜躺在被子上（lie:"along"，头朝拖的那头）。2026-10-19：播躺姿片段 PvLieGrabSleeve（仰躺、右手攥住右边蹲着那人的袖子、
  // 头转过去看他；运行时照样按头的方向摆顺）；说完松手 = 清掉片段回到躺姿。
  s.Key("Donggua", near - 0.2, { clip: "PvLieGrabSleeve", clipHold: true });
  s.Say("Release.04", "Donggua", near + 0.3);
  s.Key("Donggua", s.End("Release.04") + 0.3, { clip: null });
  s.Caption(s.End("Release.04"), 2.0, "（然后手松开了）");
  // 班长站到顺子面前：还能打不？把枪塞进顺子手里
  const luo = s.End("Release.04") + 0.2;
  const luoFace = DP(StationOn(DRAG, nearAt) - 1.4, -0.2);
  s.Go("Luo", luo - 1.2, luo + 0.4, luoFace.x, luoFace.z, { move: "walk", faceTo: "player", depart: { clip: null, weapon: "HanYang", stance: "stand" }, clip: TALK_LOW });
  s.Eye(luo - 0.2, 1.0, { stance: "crouch", x: nearAt.x, z: nearAt.z, look: { x: DG.x - 0.3, z: DG.z }, pitch: -52, toLook: luoFace, toPitch: 8 });
  const can = s.Say("Release.05", "Luo", luo + 0.5);
  s.Key("Luo", can + 1.4, { clip: "LuoHandRifle" });
  s.Caption(can + 2.6, 2.4, "（班长把枪塞进顺子手里）");
  s.Eye(can + 2.6, 1.2, { stance: "crouch", x: nearAt.x, z: nearAt.z, look: luoFace, pitch: 8, toPitch: -25 });
  const go = s.Say("Release.06", "Luo");
  s.Key("Luo", go - 0.2, { clip: "PvStandWaveOnL" });
  // 顺子站起来（玩家拿回操作）；班长退到冬瓜后头、面朝洞口断后
  s.Eye(go + 0.2, 1.4, { stance: "stand", x: END.x, z: END.z, look: K3("HeYoutian"), pitch: -4 });
  s.Go("Luo", go + 1.6, go + 3.4, K3("Luo").x, K3("Luo").z, { move: "drag", yawDeg: K3("Luo").yawDeg, depart: { clip: null }, aim: true });
  // 何有田揪起一个被角，站到被子头上：顺儿，揪到那头！
  s.Go("HeYoutian", go, go + 1.2, K3("HeYoutian").x, K3("HeYoutian").z, { move: "walk", yawDeg: K3("HeYoutian").yawDeg, depart: { clip: null, stance: "stand" } });
  s.Key("HeYoutian", go + 1.3, { carryRole: "front", clip: "PvBlanketDragL" });
  s.Say("Release.07", "HeYoutian", go + 1.4);
  s.Eye(go + 1.6, 1.4, { stance: "stand", x: END.x, z: END.z, look: K3("HeYoutian"), pitch: -4, toLook: K3("Blanket"), toPitch: -22 });
  // 前头开路的几个往支沟口那头走（布设里在前头）
  for (const id of ["LiuWencai", "Squad1", "Squad2", "Squad3"]) {
    const to = K3(id);
    s.Go(id, go - 2.0, go + 2.5, to.x, to.z, { move: "walk", yawDeg: to.yawDeg, depart: { stance: "stand", aim: false } });
  }
  void hold;
  return s.Done({ durationS: s.End("Release.07") + 2.4 });
}

/**
 * 拖单被一段：顺子（镜头）和何有田并排站在被子头上往前拖，被子 + 冬瓜在身后，班长倒退着断后。
 * dFrom / dTo = 两人站的拖行里程；所有人走同样的路长、同一个时间窗（walk 1.4 m/s），班长 drag（倒退、面朝后）被压进同一个窗口。
 * 返回到达时刻。镜头：在队伍前头 ahead 米、往回看冬瓜（看得见两人并排在前、被子在后、班长断后）。
 */
const PULL = { half: 0.55, toCenter: 1.6, luoBehind: 4.4 };
function DragLeg2(s, t0, dFrom, dTo, { lat = 0, luoLat = 0.5, ahead = 4.2, camH = 1.6 } = {}) {
  const t1 = R(t0 + (dTo - dFrom) / DRAG_MPS);
  const he = DP(dTo, lat + PULL.half), bl = DP(dTo - PULL.toCenter, lat);
  const luo = DP(dTo - PULL.toCenter - PULL.luoBehind, luoLat);
  s.Go("HeYoutian", t0, t1, he.x, he.z, { move: "walk", path: DragPath(dFrom, dTo, lat + PULL.half), depart: { carryRole: "front", stance: "stand", clip: "PvBlanketDragL" } });
  s.Go("Blanket", t0, t1, bl.x, bl.z, { move: "walk", path: DragPath(dFrom - PULL.toCenter, dTo - PULL.toCenter, lat) });
  CarryOnBlanket(s, t0, t1, [...DragPath(dFrom - PULL.toCenter, dTo - PULL.toCenter, lat), bl]);
  if (s.pos.has("Shunzi")) {
    const me = DP(dTo, lat - PULL.half);
    s.Key("Shunzi", t0, { visible: true });
    s.Go("Shunzi", t0, t1, me.x, me.z, { move: "walk", path: DragPath(dFrom, dTo, lat - PULL.half), depart: { carryRole: "front", stance: "stand", clip: "PvBlanketDragR" } });
  }
  s.Go("Luo", t0, t1, luo.x, luo.z, { move: "drag", path: DragPath(dFrom - PULL.toCenter - PULL.luoBehind, dTo - PULL.toCenter - PULL.luoBehind, luoLat), depart: { aim: true, stance: "stand", clip: null } });
  CamAhead(s, t0, t1, dFrom, dTo, ahead, camH);
  return t1;
}
/** 跟拍：机位在拖行里程 d + ahead、往回看冬瓜；在路线拐点处断开，免得机位直线穿过沟壁。 */
function CamAhead(s, t0, t1, dFrom, dTo, ahead, h) {
  const cuts = [dFrom, ...DRAG_VERTS.map(v => v - ahead).filter(v => v > dFrom + 0.5 && v < dTo - 0.5), dTo];
  for (let i = 1; i < cuts.length; i++) {
    const a = cuts[i - 1], b = cuts[i];
    const ta = t0 + (t1 - t0) * (a - dFrom) / (dTo - dFrom), tb = t0 + (t1 - t0) * (b - dFrom) / (dTo - dFrom);
    const fa = DP(a + ahead, 0), fb = DP(b + ahead, 0);
    s.Cam(ta, tb - ta, { from: { ...fa, h }, to: { ...fb, h }, look: { actor: "Donggua", offset: [0, 0.4, 0] }, ease: "linear" });
  }
}
/** 关键帧布设 → 开场摆位（被子、冬瓜、何有田、班长、玩家机位）。 */
function PlaceFromKf(s, ctx, kfId, ids) {
  // 倒着的人（被子上的冬瓜）只摆位置朝向，不写 stance / aim（10-18 第三轮：不留「站着」的阶跃值）
  for (const id of ids) { const u = KU(ctx, kfId, id); s.Place(id, 0, u.x, u.z, u.state === "down" ? { yawDeg: u.yawDeg } : { yawDeg: u.yawDeg, stance: u.stance || "stand", aim: !!u.aim }); }
}
/** 重新揪起被角：何有田、被子回到拖行线上排好（短挪动）。返回排好的时刻。 */
function ReForm(s, t0, dHead, lat = 0) {
  const he = DP(dHead, lat + PULL.half), bl = DP(dHead - PULL.toCenter, lat);
  s.Go("HeYoutian", t0, t0 + 1.0, he.x, he.z, { move: "walk", depart: { stance: "stand", clip: "PvBlanketDragL" }, carryRole: "front", yawDeg: DragYaw(dHead) });
  s.Go("Blanket", t0 + 0.2, t0 + 1.0, bl.x, bl.z, { move: "walk", yawDeg: DragYaw(dHead) });
  CarryOnBlanket(s, t0 + 0.2, t0 + 1.0, [bl], DragYaw(dHead));
  if (s.pos.has("Shunzi")) {
    const me = DP(dHead, lat - PULL.half);
    // 替身到这一刻才露面（镜头此前在顺子眼里），直接摆到被角上
    s.Key("Shunzi", t0 + 0.9, { x: me.x, z: me.z, move: "cut", stance: "stand", carryRole: "front", yawDeg: DragYaw(dHead), visible: true, clip: "PvBlanketDragR" });
  }
  return R(t0 + 1.1);
}
const DragYaw = d => R(PointBeside(DRAG, d, 0).headingYawDeg);
const Wrap = y => R(((y + 540) % 360) - 180);
/**
 * 冬瓜躺在被子上跟着走（10-18 第二轮）：运行时倒地的人移动只平移、保持躺姿；冬瓜 lie:"along"（关键帧单位里写着），
 * 走动中朝向 = 行进方向 = 头朝拖的人那头。这里就是跟被子同一条路、同一个时间窗的一个 walk 位置键（不再 0.25 s 一步瞬移、
 * 不再比被子转 90°）。route = 途经点…终点；yaw = 到点后的朝向（缺省保持行进方向）。
 */
function CarryOnBlanket(s, t0, t1, route, yaw = null) {
  const end = route[route.length - 1];
  const path = route.slice(0, -1);
  s.Go("Donggua", t0, t1, end.x, end.z, { move: "walk", ...(path.length ? { path } : {}), ...(yaw !== null ? { yawDeg: yaw } : {}) });
}
/** 到了掩体：何有田把被子往掩体后头一拽、蹲下；顺子松手转身蹲下；班长退到掩体后。kfId = 布设（到位后的样子）。 */
function TakeCover(s, ctx, t, kfId) {
  const K = id => KU(ctx, kfId, id);
  s.Key("HeYoutian", t, { carryRole: null, clip: "PvBlanketReleaseTurn", clipHold: true });
  if (s.pos.has("Shunzi")) s.Key("Shunzi", t, { carryRole: null, clip: null });
  s.Go("Blanket", t + 0.1, t + 1.4, K("Blanket").x, K("Blanket").z, { move: "walk", yawDeg: K("Blanket").yawDeg });
  CarryOnBlanket(s, t + 0.1, t + 1.4, [K("Donggua")], K("Blanket").yawDeg);
  s.Go("HeYoutian", t + 2.0, t + 2.8, K("HeYoutian").x, K("HeYoutian").z, { move: "drag", stance: "crouch", faceTo: "Donggua", depart: { clip: null } });
  s.Go("Luo", t + 0.2, t + 1.8, K("Luo").x, K("Luo").z, { move: "drag", stance: "crouch", aim: true, yawDeg: K("Luo").yawDeg });
}

function S0204(ctx) {
  const s = new Seq(ctx, "02-4", "弹药箱垛后头第一次回身打");
  const P3 = KP(ctx, "02-3"), P4 = KP(ctx, "02-4");
  PlaceFromKf(s, ctx, "02-3", ["Blanket", "Donggua", "HeYoutian", "Luo", "LiuWencai", "Squad1", "Squad2", "Squad3"]);
  { const p = KP(ctx, "02-3"); s.Spawn("Shunzi", { side: "nra", x: p.x, z: p.z, yawDeg: p.yawDeg, name: "顺子（替身）" }, { visible: false }); }  // 第三人称跟拍时顺子的替身
  s.Key("Shunzi", 0.6, { visible: true });
  s.Key("HeYoutian", 0, { carryRole: "front" });
  for (const id of ["Pursuer1", "Pursuer2", "Pursuer3"]) s.Place(id, 0, DP(0.2, 0).x, DP(0.2, 0).z, { visible: false, aim: false });
  const dFrom = StationOn(DRAG, P3);
  const crate = PROP("CrateStack_B1");
  const dCrate = BRANCH_LEN - crate.d;
  // 两人并排拖：拖的时候手上没枪；刚拖到那垛弹药箱
  const t1 = DragLeg2(s, 0.6, dFrom, dCrate + 3.3 + PULL.toCenter, { lat: 0.2 });
  s.Caption(1.0, 3.4, "（两人并排揪着被角往前拖，被子在身后贴着脚后跟滑：拖的时候手上没枪）");
  for (const id of ["LiuWencai", "Squad1", "Squad2", "Squad3"]) { const u = KU(ctx, "02-4", id); s.Go(id, 1.0, t1, u.x, u.z, { move: "walk" }); }
  // 追兵从洞口那头露头；班长先开枪：后头！
  const peek = R(t1 - 1.2);
  ["Pursuer1", "Pursuer2", "Pursuer3"].forEach((id, k) => {
    const to = KU(ctx, "02-4", id);
    s.Key(id, peek - 1.6 + k * 0.6, { visible: true });
    s.Go(id, peek - 1.6 + k * 0.6, peek + 1.2 + k * 0.3, to.x, to.z, { move: "run", aim: k < 2, faceTo: { x: P4.x, z: P4.z } });
  });
  Shot(s, peek + 1.3, "Luo");
  const back = s.Say("DragBack.01", "Luo", peek + 1.5);
  // 何有田把被子往箱垛后头一拽；子弹打在被子边上的土里，冬瓜疼得叫
  TakeCover(s, ctx, back + 0.2, "02-4");
  Shot(s, back + 0.6, "Pursuer1"); Puff(s, back + 0.65, DP(dCrate + 2.4, 1.6));
  Shot(s, back + 1.3, "Pursuer2"); Puff(s, back + 1.35, DP(dCrate + 0.8, -0.4));
  s.Caption(back + 0.8, 2.0, "（冬瓜疼得叫）");
  // 玩家松手、转身，蹲到箱垛后头
  const turn = R(back + 1.2);
  s.Key("Shunzi", turn, { visible: false });
  s.Eye(turn, 1.2, { stance: "crouch", x: P4.x, z: P4.z, yaw: DragYaw(dCrate), pitch: -8, toYaw: P4.yawDeg, toPitch: 0 });
  for (const dt of [1.8, 3.6, 5.6]) Shot(s, turn + dt, "player");
  Shot(s, turn + 2.6, "Luo"); Shot(s, turn + 4.7, "Luo");
  // 追兵挨打缩回去
  const retreat = R(turn + 5.2);
  ["Pursuer1", "Pursuer2", "Pursuer3"].forEach((id, k) => {
    const back2 = DP(0.4 + k * 0.4, k % 2 ? 0.5 : -0.5);
    s.Go(id, retreat - k * 0.5, retreat + 2.8 - k * 0.5, back2.x, back2.z, { move: "run" });
    s.Key(id, retreat + 3.2, { visible: false });
  });
  s.Eye(retreat + 3.6, 1.2, { stance: "crouch", x: P4.x, z: P4.z, yaw: P4.yawDeg, pitch: 0, toLook: KU(ctx, "02-4", "Blanket"), toPitch: -20 });
  s.Caption(retreat + 4.0, 2.2, "（打退了，再揪起被角接着拖）");
  return s.Done({ durationS: retreat + 6.4 });
}

function S0205(ctx) {
  const s = new Seq(ctx, "02-5", "台阶拐角第二次打");
  const P5 = KP(ctx, "02-5");
  PlaceFromKf(s, ctx, "02-4", ["Blanket", "Donggua", "HeYoutian", "Luo", "LiuWencai", "Squad1", "Squad2", "Squad3"]);
  { const p = KP(ctx, "02-4"); s.Spawn("Shunzi", { side: "nra", x: p.x, z: p.z, yawDeg: p.yawDeg, name: "顺子（替身）" }, { visible: false }); }  // 第三人称跟拍时顺子的替身
  for (const id of ["Pursuer1", "Pursuer2", "Pursuer3"]) s.Place(id, 0, DP(0.6, 0).x, DP(0.6, 0).z, { visible: false, aim: false });
  const bl4 = KU(ctx, "02-4", "Blanket");
  const dHead = StationOn(DRAG, bl4) + PULL.toCenter;
  const bl5 = KU(ctx, "02-5", "Blanket");
  const dTo = StationOn(DRAG, bl5) + PULL.toCenter;
  const t0 = ReForm(s, 0.3, dHead);
  // 拖上台阶、拐进交通沟往南
  const t1 = DragLeg2(s, t0, dHead, dTo);
  for (const id of ["LiuWencai", "Squad1", "Squad2", "Squad3"]) { const u = KU(ctx, "02-5", id); s.Go(id, 1.0, t1 - 1, u.x, u.z, { move: "walk", path: [PL.branchMouth] }); }
  // 坡上那个坑里的捷克式还在一阵一阵地响
  for (const t of [3.2, 7.8, 11.6, 15.4]) s.Sfx(t, "mgBurstFar", { x: PIT_GUN.x, z: PIT_GUN.z });
  // 追兵顺着笔直的支沟打过来：缩在刚才我们躲过的那垛弹药箱后头
  const peek = R(t1 - 0.8);
  ["Pursuer1", "Pursuer2", "Pursuer3"].forEach((id, k) => {
    const to = KU(ctx, "02-5", id);
    s.Key(id, peek - 5.0 + k * 0.4, { visible: true });
    s.Go(id, peek - 5.0 + k * 0.4, peek + 0.6 + k * 0.3, to.x, to.z, { move: "run", aim: true, stance: to.stance || "stand", faceTo: PL.branchMouth });
  });
  Shot(s, peek + 0.4, "Luo");
  const back = s.Say("DragBack.02", "Luo", peek + 0.6);
  TakeCover(s, ctx, peek + 0.3, "02-5");
  Shot(s, back + 1.0, "Pursuer3"); Puff(s, back + 1.08, BP(1.2, -1.6));
  Shot(s, back + 1.8, "Pursuer1"); Puff(s, back + 1.9, BP(0.6, 1.4));
  const turn = R(back + 1.2);
  s.Key("Shunzi", turn, { visible: false });
  s.Eye(turn, 1.0, { stance: "crouch", x: P5.x, z: P5.z, yaw: DragYaw(dTo), pitch: -10, toYaw: P5.yawDeg, toPitch: 0 });
  for (const dt of [1.6, 3.2, 5.0]) Shot(s, turn + dt, "player");
  Shot(s, turn + 2.4, "Luo"); Shot(s, turn + 4.2, "Luo");
  const retreat = R(turn + 5.6);
  ["Pursuer1", "Pursuer2", "Pursuer3"].forEach((id, k) => {
    const to = BP(BRANCH_LEN - 4 - k * 1.2, k % 2 ? 0.4 : -0.4);
    s.Go(id, retreat - k * 0.4, retreat + 3.6 - k * 0.4, to.x, to.z, { move: "run" });
    s.Key(id, retreat + 4.0, { visible: false });
  });
  // 班长回头看了一眼坡上那个坑，没说话
  s.Key("Luo", retreat + 1.0, { faceTo: PIT_GUN, aim: false });
  s.Sfx(retreat + 1.4, "mgBurstFar", { x: PIT_GUN.x, z: PIT_GUN.z });
  s.Key("Luo", retreat + 3.6, { yawDeg: KU(ctx, "02-5", "Luo").yawDeg, aim: true });
  s.Eye(retreat + 1.0, 2.4, { stance: "crouch", x: P5.x, z: P5.z, yaw: P5.yawDeg, pitch: 0, toLook: KU(ctx, "02-5", "Luo"), toPitch: 2 });
  return s.Done({ durationS: retreat + 5.0 });
}

function S0206(ctx) {
  const s = new Seq(ctx, "02-6", "拐角 2 第三次打");
  const P6 = KP(ctx, "02-6");
  PlaceFromKf(s, ctx, "02-5", ["Blanket", "Donggua", "HeYoutian", "Luo", "LiuWencai", "Squad1", "Squad2", "Squad3"]);
  { const p = KP(ctx, "02-5"); s.Spawn("Shunzi", { side: "nra", x: p.x, z: p.z, yawDeg: p.yawDeg, name: "顺子（替身）" }, { visible: false }); }  // 第三人称跟拍时顺子的替身
  for (const id of ["Pursuer1", "Pursuer2", "Pursuer3"]) s.Place(id, 0, BP(2.5, 0).x, BP(2.5, 0).z, { visible: false, aim: false });
  const dHead = StationOn(DRAG, KU(ctx, "02-5", "Blanket")) + PULL.toCenter;
  const dTo = StationOn(DRAG, KU(ctx, "02-6", "Blanket")) + PULL.toCenter;
  const t0 = ReForm(s, 0.3, dHead);
  const t1 = DragLeg2(s, t0, dHead, dTo);
  for (const id of ["LiuWencai", "Squad1", "Squad2", "Squad3"]) { const u = KU(ctx, "02-6", id); s.Go(id, 1.0, t1 - 1, u.x, u.z, { move: "walk" }); }
  for (const t of [4.0, 10.5]) s.Sfx(t, "mgBurstFar", { x: PIT_GUN.x, z: PIT_GUN.z, volume: 0.8 });
  // 追兵又追上来露头
  const peek = R(t1 - 0.6);
  ["Pursuer1", "Pursuer2", "Pursuer3"].forEach((id, k) => {
    const to = KU(ctx, "02-6", id);
    s.Key(id, peek - 3.4 + k * 0.4, { visible: true });
    s.Go(id, peek - 3.4 + k * 0.4, peek + 0.6, to.x, to.z, { move: "run", aim: true, yawDeg: to.yawDeg });
  });
  Shot(s, peek + 0.3, "Luo");
  const back = s.Say("DragBack.03", "Luo", peek + 0.5);
  TakeCover(s, ctx, peek + 0.4, "02-6");
  Shot(s, back + 0.9, "Pursuer1"); Puff(s, back + 1.0, KU(ctx, "02-6", "Blanket"));
  const turn = R(back + 1.0);
  s.Key("Shunzi", turn, { visible: false });
  s.Eye(turn, 1.0, { stance: "crouch", x: P6.x, z: P6.z, yaw: DragYaw(dTo), pitch: -16, toYaw: P6.yawDeg, toPitch: 0 });
  for (const dt of [1.6, 3.2, 4.8]) Shot(s, turn + dt, "player");
  Shot(s, turn + 2.2, "Luo"); Shot(s, turn + 4.0, "Luo");
  const retreat = R(turn + 5.4);
  ["Pursuer1", "Pursuer2", "Pursuer3"].forEach((id, k) => {
    const to = TP(T_BRANCH - 1 + k * 0.6, k % 2 ? 0.5 : -0.5);
    s.Go(id, retreat - k * 0.3, retreat + 3.0 - k * 0.3, to.x, to.z, { move: "run" });
    s.Key(id, retreat + 3.2, { visible: false });
  });
  s.Eye(retreat + 2.6, 1.0, { stance: "crouch", x: P6.x, z: P6.z, yaw: P6.yawDeg, pitch: 0, toLook: KU(ctx, "02-6", "Blanket"), toPitch: -18 });
  return s.Done({ durationS: retreat + 4.6 });
}

function S0207(ctx) {
  const s = new Seq(ctx, "02-7", "翻坡顶：快过来！");
  const P7 = KP(ctx, "02-7");
  PlaceFromKf(s, ctx, "02-6", ["Blanket", "Donggua", "HeYoutian", "Luo", "LiuWencai", "Squad1", "Squad2", "Squad3"]);
  { const p = KP(ctx, "02-6"); s.Spawn("Shunzi", { side: "nra", x: p.x, z: p.z, yawDeg: p.yawDeg, name: "顺子（替身）" }, { visible: false }); }  // 第三人称跟拍时顺子的替身
  for (const id of ["Pursuer1", "Pursuer2", "Pursuer3"]) s.Place(id, 0, TP(T_BRANCH - 1).x, TP(T_BRANCH - 1).z, { visible: false, aim: false });
  const dHead = StationOn(DRAG, KU(ctx, "02-6", "Blanket")) + PULL.toCenter;
  const dTo = StationOn(DRAG, KU(ctx, "02-7", "Blanket")) + PULL.toCenter;
  const t0 = ReForm(s, 0.3, dHead);
  // 拐角 2 → 板桥底下 → 坡顶（示意里拖得比实际快）；板桥底下镜头压低
  const t1 = DragLeg2(s, t0, dHead, dTo, { camH: 1.35 });
  for (const id of ["LiuWencai", "Squad1", "Squad2", "Squad3"]) { const u = KU(ctx, "02-7", id); s.Go(id, 1.0, t1 - 2, u.x, u.z, { move: "walk", path: [TP(T_CROSSING), TP(T_CREST)] }); }
  s.Sfx(3.0, "mgBurstFar", { x: PIT_GUN.x, z: PIT_GUN.z, volume: 0.7 });
  // 坡沿上趴着别的班的几个兵：快过来！
  const callT = R(t1 - 8.0);
  s.Key("CrestNra1", callT - 0.4, { faceTo: "player", aim: false, clip: "PvProneBeckonL" });
  s.Say("DragBack.04", "CrestNra1", callT);
  s.Key("CrestNra1", callT + 2.2, { yawDeg: KU(ctx, "02-7", "CrestNra1").yawDeg, clip: null, aim: true });
  // 一翻过去，这几个兵就朝拐角 2 开枪；追兵一露头就挨枪，缩回去了
  const peek = R(t1 - 2.4);
  ["Pursuer1", "Pursuer2", "Pursuer3"].forEach((id, k) => {
    const to = KU(ctx, "02-7", id);
    s.Key(id, peek - 3.4 + k * 0.4, { visible: true });
    s.Go(id, peek - 3.4 + k * 0.4, peek + 0.6, to.x, to.z, { move: "run", aim: k === 0, yawDeg: to.yawDeg });
  });
  const volley = R(t1 + 0.6);
  s.Sfx(volley, "rifleVolley", { x: 50, z: 129.5 });
  for (const id of ["CrestNra1", "CrestNra2", "CrestNra3", "CrestNra4"]) s.Ev(volley + (id.at(-1) - 1) * 0.15, "muzzle", { actor: id });
  Puff(s, volley + 0.25, TP(T_CORNER2 - 2, 0.6)); Puff(s, volley + 0.4, TP(T_CORNER2 - 4, -0.5));
  s.Key("Shunzi", t1 + 0.2, { visible: false });
  s.Eye(t1 + 0.2, 1.0, { stance: "stand", x: P7.x, z: P7.z, look: KU(ctx, "02-7", "Donggua"), pitch: -20, toYaw: P7.yawDeg, toPitch: -3 });
  ["Pursuer1", "Pursuer2", "Pursuer3"].forEach((id, k) => {
    const to = TP(T_BRANCH + 2 - k * 0.5, k % 2 ? 0.5 : -0.5);
    s.Go(id, volley + 0.5 - k * 0.1, volley + 5.0, to.x, to.z, { move: "run" });
    s.Key(id, volley + 5.2, { visible: false });
  });
  s.Sfx(volley + 2.0, "rifleVolley", { x: 50, z: 129.5, volume: 0.7 });
  return s.Done({ durationS: volley + 4.6 });
}

// ---------------------------------------------------------------------------
// 02末 集结处（坡后干沟）

function S02E1(ctx) {
  const s = new Seq(ctx, "02E-1", "集结处：幺娃回来没得？");
  const K = id => KU(ctx, "02E-1", id);
  const P = KP(ctx, "02E-1");
  const rest = K("Donggua"), luo = K("Luo"), liu = K("LiuWencai");
  const lane = { x: PL.laneHead.x, z: PL.laneHead.z };
  const laneOut = PointBeside(L0105_SUNKEN_LANE.line, 14, 0);   // 凹路口往东 14 m（凹路在台地里往东走）
  // 干沟里满地伤员；卫生兵背对着顺子蹲在冬瓜身边处理伤口
  // 卫生兵跪在冬瓜胸口旁边、双手按住伤口（CollectionCare 的 CareMedicPress，stage press：伤员胸口在他前方约 0.3 m）；
  // 跪在靠顺子这一侧，背对着顺子
  MedicPress(s, rest, P);
  s.Eye(0, 4.0, { stance: "stand", look: rest, pitch: -12, toPitch: -16 });
  // 坡顶那边有一挺机枪一直在响
  for (const t of [2.0, 9.5, 17.0, 24.5, 31.0]) s.Sfx(t, "mgBurstFar", { x: 50, z: 126 });
  // 担架员抬走一副（顺着东南头的凹路往后送），又空着手跑回来抬下一副
  const st = K("Stretcher1");
  const stOut = R(1.0 + (Dist(st, lane) + Dist(lane, laneOut)) / 1.4);
  s.Go("Stretcher1", 1.0, stOut, laneOut.x, laneOut.z, { move: "walk", path: [lane] });
  s.Key("Stretcher1", stOut + 0.2, { visible: false });
  s.Eye(4.0, 2.0, { stance: "stand", look: rest, pitch: -16, toLook: st, toPitch: -6 });
  s.Eye(6.0, 6.0, { stance: "stand", look: st, pitch: -6, toLook: lane, toPitch: -2 });
  s.Spawn("Bearer1", { x: laneOut.x - 1, z: laneOut.z - 0.4, yawDeg: 90 }, { visible: false });
  s.Spawn("Bearer2", { x: laneOut.x, z: laneOut.z + 0.5, yawDeg: 90 }, { visible: false });
  const b1 = { x: rest.x + 1.0, z: rest.z + 1.1 }, b2 = { x: rest.x - 1.1, z: rest.z + 1.0 };
  s.Key("Bearer1", 14.6, { visible: true }); s.Key("Bearer2", 15.0, { visible: true });
  s.Go("Bearer1", 14.6, 22.6, b1.x, b1.z, { move: "run", faceTo: "Donggua", path: [lane] });
  s.Go("Bearer2", 15.0, 23.0, b2.x, b2.z, { move: "run", faceTo: "Donggua", path: [lane] });
  s.Eye(14.0, 7.4, { stance: "stand", look: lane, pitch: -2, toLook: rest, toPitch: -12 });
  // 担架员：下一趟就抬拉（冬瓜还躺在单被上）
  s.Key("Bearer1", 23.2, { stance: "crouch", clip: "PvCrouchGripLitter", clipHold: true });
  s.Key("Bearer2", 23.4, { stance: "crouch", clip: "PvCrouchGripLitter", clipHold: true });
  s.Say("Gathering.01", "Bearer1", 23.6);
  // 班长扫了一眼周围的人：幺娃回来没得？
  s.Key("Luo", 23.8, { faceTo: { x: luo.x + 4, z: luo.z - 3 }, clip: TALK_SLUNG });
  s.Eye(24.6, 1.0, { stance: "stand", look: rest, pitch: -12, toLook: luo, toPitch: 2 });
  s.Key("Luo", 25.0, { faceTo: "LiuWencai" });
  const ask = s.Say("Gathering.02", "Luo");
  // 没人吭声。刘文财摇了摇头（转头停一拍）
  s.Key("Luo", ask + 1.5, { faceTo: "player" });
  s.Eye(ask + 1.6, 1.0, { stance: "stand", look: luo, pitch: 2, toLook: liu, toPitch: 2 });
  s.Key("LiuWencai", ask + 2.2, { faceTo: "Luo" });
  s.Key("LiuWencai", ask + 3.0, { clip: "PvStandShakeHead" });
  s.Key("LiuWencai", ask + 4.8, { faceTo: PL.crest, clip: null });
  s.Caption(ask + 1.4, 4.0, "（没人吭声。刘文财摇了摇头）");
  void P;
  return s.Done({ durationS: ask + 7.0 });
}

/** 02末：卫生兵跪在冬瓜胸口旁边、靠顺子（P）那一侧，播 CareMedicPress。 */
function MedicPress(s, rest, P) {
  const chest = Off(rest, rest.yawDeg, 0.35), sides = [Off(chest, rest.yawDeg, 0, 0.45), Off(chest, rest.yawDeg, 0, -0.45)];
  const m = Dist(sides[0], P) < Dist(sides[1], P) ? sides[0] : sides[1];
  s.Place("Medic", 0, m.x, m.z, { stance: "crouch", faceTo: chest, clip: "CareMedicPress" });
}

function S02E2(ctx) {
  const s = new Seq(ctx, "02E-2", "传令兵报坑，班长带人上去");
  const K = id => KU(ctx, "02E-2", id);
  MedicPress(s, K("Donggua"), KP(ctx, "02E-1"));
  const runner = K("Runner"), luo = K("Luo"), he = K("HeYoutian");
  const ramp = { x: PL.assemblyEntry.x, z: PL.assemblyEntry.z };
  // 传令兵逆着人流从坡道挤下来，满身是泥
  const top = TP(T_CREST + 5);
  s.Place("Runner", 0, top.x, top.z, { yawDeg: 180 });
  s.Spawn("DownWounded", { x: TP(T_CREST + 7).x, z: TP(T_CREST + 7).z, yawDeg: 180, woundedWalk: true });
  s.Go("DownWounded", 0, 9.0, L0105_GULLY_POCKETS.a.x - 2.5, L0105_GULLY_POCKETS.a.z + 2.0, { move: "walk", path: [ramp], woundedWalk: true });
  s.Go("Runner", 0.4, 4.2, runner.x, runner.z, { move: "run", faceTo: "Luo", path: [ramp] });
  s.Key("Runner", 4.2, { clip: "MessengerReport" });
  s.Eye(0, 4.2, { stance: "stand", look: ramp, pitch: 6, toLook: runner, toPitch: 0 });
  s.Say("Gathering.03", "Runner", 4.4);
  s.Key("Luo", 4.2, { faceTo: "Runner" });
  // 班长看了一眼满地的伤员
  const look = s.End("Gathering.03") + 0.2;
  s.Key("Luo", look, { faceTo: PL.assembly, clip: TALK_SLUNG });
  s.Eye(look, 1.2, { stance: "stand", look: runner, pitch: 0, toLook: luo, toPitch: 2 });
  s.Say("Gathering.04", "Luo", look + 0.9);
  // 他留下何有田看着冬瓜，带顺子、刘文财从坡道往上走
  const go = s.End("Gathering.04") + 0.3;
  s.Key("Luo", go, { faceTo: "HeYoutian", clip: "PvStandPointL", clipHold: true });
  s.Key("HeYoutian", go + 0.4, { faceTo: "Luo" });
  // 10-20 弯沟：从中弯顺沟底走回坡道约 18 m（沿中心线，不翻坎）
  const back = [PointBeside(L0105_GULLY.line, 12, 0.4)];
  s.Go("Luo", go + 2.0, go + 15.0, ramp.x, ramp.z, { move: "walk", depart: { clip: null }, path: back });
  s.Go("LiuWencai", go + 2.6, go + 15.6, ramp.x - 0.6, ramp.z + 1.4, { move: "walk", path: back });
  s.Eye(go + 2.0, 4.0, { stance: "stand", look: luo, pitch: 2, toLook: ramp, toPitch: 4 });
  s.Caption(go + 9.0, 3.4, "（顺子一句话也没说，跟上了。上去的人本来该是他）");
  void he;
  return s.Done({ durationS: go + 16.2 });
}

// ---------------------------------------------------------------------------
// 03 逆着人流上去，守坑

function S0301(ctx) {
  const s = new Seq(ctx, "03-1", "逆着人流");
  // 三个人从干沟上坡道、翻坡顶往北挤（东半边），人流往南下到干沟里（西半边）
  const luoTo = TP(T_CROSSING - 3, 0.8), liuTo = TP(T_CROSSING + 3.5, 0.6);
  s.Go("Luo", 0.3, 23.0, luoTo.x, luoTo.z, { move: "walk", path: [TP(T_CREST, 0.8), TP(T_CROSSING + 4, 0.9)] });
  s.Go("LiuWencai", 1.0, 24.0, liuTo.x, liuTo.z, { move: "walk", path: [TP(T_CREST + 4, 0.5), TP(T_CREST - 6, 0.6)] });
  const camFrom = KP(ctx, "03-1");
  s.Cam(0, 12, { from: { x: camFrom.x, z: camFrom.z, h: 1.6 }, to: { ...TP(T_CREST + 1, 0.2), h: 1.6 }, look: { actor: "Luo", offset: [0, 1.4, -3.0] }, ease: "linear" });
  s.Cam(12, 12, { from: { ...TP(T_CREST + 1, 0.2), h: 1.6 }, to: { ...TP(T_CROSSING + 6, 0.3), h: 1.55 }, look: { actor: "Luo", offset: [0, 1.3, -3.0] }, ease: "linear" });
  const ramp = { x: PL.assemblyEntry.x, z: PL.assemblyEntry.z };
  // 10-20 弯沟：下到沟底以后顺沟往东散开（坑窝 A 到中弯之间），两两一堆贴着坎，不排方阵
  const south = (id, t0, t1, extra = {}) => {
    const k = ["RetreatNra1", "RetreatNra2", "RetreatNra3", "RetreatNra4", "RetreatNra5", "WalkWounded1", "RetreatHelper1", "Stretcher2"].indexOf(id);
    const to = PointBeside(L0105_GULLY.line, 9 + k * 2.2, k % 2 ? 1.4 : -1.2);
    s.Go(id, t0, t1, to.x, to.z, { move: "walk", path: [ramp], ...extra });
  };
  south("RetreatNra2", 0, 9); south("RetreatNra1", 0, 13); south("RetreatNra5", 0, 6);
  south("WalkWounded1", 0, 24, { woundedWalk: true }); s.Key("WalkWounded1", 0, { woundedWalk: true });
  south("RetreatHelper1", 0, 24);
  south("RetreatNra3", 0, 22); south("RetreatNra4", 0, 25);
  south("Stretcher2", 0, 25);
  // 后面还有人一个接一个从板桥底下钻过来
  const stream = [["Flow1", 3.0], ["Flow2", 6.5], ["Flow3", 10.0], ["Flow4", 13.5], ["Flow5", 17.0]];
  const flowFrom = TP(T_CROSSING - 4, -0.5);
  for (const [id, t] of stream) {
    s.Spawn(id, { x: flowFrom.x, z: flowFrom.z, yawDeg: 180, ...(id === "Flow3" ? { woundedWalk: true } : {}) }, { visible: false });
    s.Key(id, t, { visible: true });
    const to = TP(T_CREST + 6, -0.6);
    s.Go(id, t, t + 16, to.x, to.z, { move: "walk", path: [TP(T_CROSSING + 2, -0.6)] });
  }
  // 挨撞挨骂：往哪走！
  const shoverAt = TP(T_CREST + 2, -0.5);
  s.Spawn("Shover", { x: shoverAt.x, z: shoverAt.z, yawDeg: 180 });
  s.Go("Shover", 0, 7.0, ramp.x - 0.6, ramp.z + 1.5, { move: "walk", path: [TP(T_END - 3, -0.6)] });
  s.Key("Shover", 4.98, { clip: "PvShoulderShove" });
  s.Key("Shover", 6.2, { clip: null });
  s.Say("PitHold.01", "Shover", 5.4);
  s.Shake(5.6, 0.3, 0.25);
  // 越往上枪声越近
  for (const [t, v] of [[2.0, 0.35], [8.5, 0.5], [14.0, 0.65], [19.5, 0.8], [23.0, 0.9]]) s.Sfx(t, "mgBurstFar", { x: 0, z: -40, volume: v });
  s.Sfx(11.0, "artilleryFar", { volume: 0.6 });
  s.Caption(9.0, 4.0, "（整条线在撤，只有我们在往回走）");
  return s.Done({ durationS: 25.0 });
}

/**
 * 03-2 的掷弹筒（2026-10-21 用户：「进坑就挨一发掷弹筒」预演里看不到这一下）：顺子站上射击台往北看 → 坎后冒烟、嘭 →
 * 跳下台蹲在坑底 → 约 5.5 s 后落在坑东沿 → 台上东头那个弟兄被掀翻 →「丢弹筒！挪起走！」→ 幺娃愣一下。
 * 被掀的人站在射击台东头朝东（护着丢掉的东段前沿沟），弹落在他正前方的坑东沿：PvBlastThrownBack 顺着台子往西掀 0.95 m，
 * 落下来还在台面上（台面南沿 z −8.45，人躺在 z −8.9 上下），不会掀出台子悬在坑底上空。
 * 镜头不跨台子边（预演机位高度 = 那一点的地面 + h，跨过台边会跳 0.7 m）：「站上台」是在台子南边 0.15 m 的坑底上把眼抬到台上站着的高度。
 */
const PIT_STEP_TOP = 0.7;                      // 射击台比坑底高（Script_EditorBlockoutFirstLevel0105Scene PitFireStep）

function S0302(ctx) {
  const s = new Seq(ctx, "03-2", "进坑就挨一发掷弹筒");
  // 刚挤进去（刘文财跟在顺子后头，不让镜头穿过他）
  s.Place("Luo", 0, 0.6, 3.0, { stance: "stand" });
  s.Place("LiuWencai", 0, 0.3, 8.4, { stance: "stand" });
  s.Go("Luo", 0, 4.4, -1.6, -4.7, { move: "walk", stance: "crouch", yawDeg: -28.1 });
  s.Go("LiuWencai", 0.4, 6.4, -2.8, -4.6, { move: "walk", stance: "crouch", yawDeg: -38 });
  // 台上东头这个弟兄护着丢掉的东段前沿沟（朝东偏北）；另一个（PitNra1）在机枪西边，不挡爆点
  const man = SHELL_032.man, SHELL_HIT_032 = SHELL_032.hit;
  s.Place("PitNra2", 0, man.x, man.z, { state: "alive", stance: "stand", aim: true, yawDeg: SHELL_032.yawDeg });
  s.Key("Yaowa", 0, { clip: "YaowaSitLoad", faceTo: "Gunner" });
  const pop = 5.6;
  MortarCrew(s, pop);
  for (const t of [0.6, 3.6, 6.6]) { Shot(s, t, "Gunner", { count: 5, sfx: "mgBurstNear" }); }
  s.Sfx(1.0, "mgBurstFar", { x: -30, z: -118 });
  // ① 进坑（0–4.2 s），站上射击台往北看（4.2–7.6 s）：坎后冒一股烟、嘭（掷弹筒组在坎下，看不见人，只看得见烟）
  const floor = { x: 0.2, z: -7.7 }, up = { x: 0.1, z: -8.3 }, D = { x: 0.6, z: -6.9 };
  const scarp0 = { x: 22, z: -207, h: 2.6 }, scarp1 = { x: 28, z: -211, h: 3.6 };
  s.Cam(0, 4.2, { from: { x: 0.6, z: 6.5, h: 1.6 }, to: { ...floor, h: 1.6 }, look: { x: 0.3, z: -14, h: 1.6 }, ease: "linear" });
  s.Cam(4.2, 0.5, { from: { ...floor, h: 1.6 }, to: { ...up, h: PIT_STEP_TOP + 1.62 }, look: { x: 0.3, z: -14, h: 1.6 }, lookTo: scarp0 });
  // 盯着坎看（视野收到 18°：200 m 外的一股烟在 60° 里只有十来个像素）
  s.Cam(4.7, 2.9, { from: { ...up, h: PIT_STEP_TOP + 1.62 }, look: scarp0, lookTo: scarp1, fov: 18 });
  const hit = Mortar(s, pop, SHELL_HIT_032, { radius: 4, shake: 0.6 });
  s.Caption(pop + 0.3, 2.4, "（坎后头冒起一股烟——嘭）");
  // ② 跳下台蹲在坑底（7.6 s），等它落下来：台上东头那个弟兄还端着枪朝东
  const manChest = { x: man.x, z: man.z, h: 1.0 };
  s.Cam(7.6, 0.45, { from: { ...up, h: PIT_STEP_TOP + 1.62 }, to: { ...D, h: 1.05 }, look: scarp1, lookTo: manChest });
  s.Shake(8.0, 0.3, 0.15);
  s.Cam(8.05, R(hit - 8.05 + 0.6), { from: { ...D, h: 1.05 }, look: manChest, lookTo: { x: R((man.x + SHELL_HIT_032.x) / 2), z: R((man.z + SHELL_HIT_032.z) / 2), h: 0.9 } });
  // ③ 落在坑东沿：他被掀翻（PvBlastThrownBack：面朝爆点，片段自己往后掀 0.95 m、枪脱手按 weapon 轨落地；片段一直留着，不再 cut 挪人）
  s.Key("PitNra2", hit + 0.02, { clip: "PvBlastThrownBack", clipHold: true, aim: false });
  s.Key("Luo", hit + 0.1, { clip: "DuckBlast" });
  // 看着他摔在台上（1.0 s）
  const landed = { x: R(man.x - 1.2), z: R(man.z + 0.2), h: 0.55 };
  s.Cam(R(hit + 0.6), 1.0, { from: { ...D, h: 1.05 }, look: { x: R((man.x + SHELL_HIT_032.x) / 2), z: R((man.z + SHELL_HIT_032.z) / 2), h: 0.9 }, lookTo: landed });
  // ④ 有人喊：丢弹筒！挪起走！（机枪手边打边喊）
  Shot(s, hit + 1.4, "Gunner", { count: 5, sfx: "mgBurstNear" });
  s.Say("PitHold.02", "Gunner", hit + 1.0);
  s.Eye(hit + 1.6, 1.0, { stance: "crouch", x: D.x, z: D.z, look: landed, pitch: -4, toLook: { x: -1.2, z: -9.2 }, toPitch: 6 });
  Shot(s, hit + 3.8, "Gunner", { count: 6, sfx: "mgBurstNear" });
  // ⑤ 幺娃在给机枪手压弹匣，看见顺子，愣了一下
  const see = s.End("PitHold.02") + 0.6;
  s.Eye(see - 0.4, 1.0, { stance: "crouch", x: D.x, z: D.z, look: { x: -1.2, z: -9.2 }, pitch: 6, toLook: { x: -2.4, z: -8.4 }, toPitch: -4 });
  s.Key("Yaowa", see, { clip: null, faceTo: "player" });
  s.Caption(see + 0.4, 2.4, "（幺娃看见顺子，愣了一下）");
  s.Key("Yaowa", see + 3.0, { clip: "YaowaSitLoad", faceTo: "Gunner" });
  // 轻机枪压着坑沿
  s.Sfx(see + 1.2, "mgBurstFar", { x: 40, z: -140 });
  Puff(s, see + 1.4, { x: -2.2, z: -11.2 }); Puff(s, see + 1.7, { x: 2.0, z: -11.4 });
  return s.Done({ durationS: see + 4.4 });
}

// ---------------------------------------------------------------------------
// 03 坑北（2026-10-20 第四轮，用户问「日军真是在大平面上直直冲过来的？没遮挡不就是活靶子？」→ 拍板四拍）：
//   来路：人从地坎后那片看不见的低地翻上来 → 压制：两挺轻机枪一扫坑沿、坑里缩头，正面趁这几秒一组跳一段（短跃进）→
//   侧面才是主攻：西边干水沟里一个班，班长探头被看见、出沟、轻机枪架在沟尽头打丙位 → 东头沟里的一个弯一个弯清过来。
// 依据：日军进攻先用火力压住守军、散开一段段往前、偏爱包抄（美军 TM-E 30-480，1944）；具体人数、路线、时刻是创作。

const RUSH_TARGET = { x: 0, z: -8 };
/** 短跑速度（带枪带装具冲一段，m/s）：一跃 12–18 m ≈ 2.5–3.8 s。 */
const RUSH_RUN_MPS = 4.8;
/**
 * 03-3 的跃进：[t, 跳到第几格（L0105_RUSH_STATIONS 下标）, 谁]。组 2、组 4 开场翻坎（第 1 格 = F3 后）；
 * 之后四组轮着，一组跳、其余趴着打。第一、二轮跟着轻机枪扫坑沿起跳（坑里缩头那两秒）。IjaRush4 第二跃里中弹（L0105_RUSH_FALLEN）。
 */
const RUSH_BOUNDS_033 = Object.freeze([
  [0.6, 1, ["IjaRush3", "IjaRush4"]], [1.0, 1, ["IjaRush7", "IjaRush8"]],
  [6.6, 1, ["IjaRush1", "IjaRush2"]], [9.8, 1, ["IjaRush5", "IjaRush6"]],
  [12.2, 2, ["IjaRush3", "IjaRush4"]], [15.8, 2, ["IjaRush7", "IjaRush8"]],
  [25.0, 2, ["IjaRush1", "IjaRush2"]], [28.4, 2, ["IjaRush5", "IjaRush6"]],
  [33.0, 3, ["IjaRush3"]], [36.4, 3, ["IjaRush7", "IjaRush8"]],
  [44.0, 3, ["IjaRush1", "IjaRush2"]], [48.0, 3, ["IjaRush5", "IjaRush6"]],
]);
/** 03-4 的那一跃（第 3 格 → 第 4 格 = 03-5 的站位）。 */
const RUSH_BOUNDS_034 = Object.freeze([
  [3.0, 4, ["IjaRush1", "IjaRush2"]], [7.0, 4, ["IjaRush5", "IjaRush6"]], [11.0, 4, ["IjaRush3"]], [15.0, 4, ["IjaRush7", "IjaRush8"]],
]);
/**
 * 一跃：t 起身跑到站位前 0.8 m，朝 faceTo 扑倒（PvStandToProneDive 往前带 0.8 m）落在站位上；从坎下翻上来的路过坎顶。
 * fall：跑到 fall 那一点就中弹倒下（ShotCollapse），不扑。minS：最短跑多久。返回落地 / 倒下的时刻。
 */
function Bound(s, id, t, to, { faceTo = RUSH_TARGET, fall = null, minS = 2.4 } = {}) {
  const p = s.pos.get(id);
  const end = fall || to;
  const yaw = Yaw(end, faceTo);
  const overScarp = p.z < ScarpZ(p.x) - 1;
  const path = overScarp ? [{ x: R(p.x + (end.x - p.x) * 0.3), z: R(ScarpZ(p.x) + 1.2) }] : undefined;
  const stop = fall ? fall : Off(to, yaw, -0.8);
  const runS = Math.max(minS, (Dist(p, stop) + (overScarp ? 1.5 : 0)) / RUSH_RUN_MPS);
  const tEnd = R(t + runS);
  s.Go(id, t, tEnd, stop.x, stop.z, { move: "run", ...(path ? { path } : {}), depart: { stance: "stand", aim: false } });
  if (fall) {
    s.Key(id, tEnd, { clip: "ShotCollapse", clipHold: true });
    s.Key(id, R(tEnd + 1.6), { state: "down", clip: null });
  } else Dive(s, id, tEnd, yaw, { aim: true });
  return tEnd;
}
/** 按表跳：中弹的那个（L0105_RUSH_FALLEN）跑到倒下的地方。 */
function RushBounds(s, schedule) {
  for (const [t, k, ids] of schedule) for (const id of ids) {
    const fell = L0105_RUSH_FALLEN[id];
    if (fell && k >= fell.bound) Bound(s, id, t, null, { fall: fell.at, minS: 1.2 });
    else Bound(s, id, t, RushStation(L0105_RUSH_STATIONS[id][k]));
  }
}
/** 轻机枪一梭子扫过坑沿：土点从 x0 一路溅到 x1（胸墙北边），枪声 + 一串打土声。 */
function SweepParapet(s, t, gun, x0, x1, n = 6) {
  Shot(s, t, gun, { count: 8, sfx: "mgBurstFar" });
  for (let i = 0; i < n; i++) Puff(s, t + 0.3 + i * 0.12, { x: R(x0 + (x1 - x0) * i / (n - 1)), z: i % 2 ? -11.4 : -11.0 });
  s.Sfx(t + 0.3, "strafeDirt", { x: R((x0 + x1) / 2), z: -11.2, volume: 0.5 });
}
/** 缩头：0.3 s 从站姿眼高降到蹲（盯着眼前胸墙的土）、停着，t1 前 0.3 s 抬回来看 lookUp。 */
function Duck(s, t0, t1, at, lookUp) {
  const low = { x: at.x, z: R(at.z + 0.35), h: 1.0 }, wall = { x: R(at.x - 0.4), z: R(at.z - 1.6), h: 0.9 };
  s.Cam(t0, 0.3, { from: { x: at.x, z: at.z, h: 1.62 }, to: low, look: { x: at.x, z: R(at.z - 8), h: 1.4 }, lookTo: wall });
  s.Cam(R(t1 - 0.3), 0.3, { from: low, to: { x: at.x, z: at.z, h: 1.62 }, look: wall, lookTo: lookUp });
  s.Shake(t0 + 0.05, 0.5, 0.2);
}

/** 干水沟上按弧长取点（d 从东北头量）。 */
const DITCH_LINE = L0105_PIT_NORTH.ditch.line, DITCH_LEN = LineLength(DITCH_LINE);
const DitchAt = (d, lat = 0) => { const p = PointBeside(DITCH_LINE, d, lat); return { x: R(p.x), z: R(p.z) }; };
/** 沟里的一段途经点（从 d0 到 d1，每 stepM 一个，不含两端）。 */
function DitchPath(d0, d1, stepM = 6) {
  const out = [], n = Math.max(1, Math.round(Math.abs(d1 - d0) / stepM));
  for (let k = 1; k < n; k++) out.push(DitchAt(d0 + (d1 - d0) * k / n));
  return out;
}
/** 出沟点（渐浅段起点，从这里起人就露头了）。 */
const DITCH_EMERGE_D = DITCH_LEN - L0105_PIT_NORTH.ditch.endTaperM;
const SQUAD = L0105_DITCH_SQUAD;
/** 那个班（03-3）：12.3 s 前一个跟一个猫腰走到 peekD 停下；14.6–15.6 s 班长站起来探头；15.8 s 起猫腰快走（SQUAD_FAST_MPS）到出沟点。 */
const SQUAD_STOP_T = 12.3, SQUAD_PEEK_T = 14.6, SQUAD_GO_T = 15.8, SQUAD_FAST_MPS = 1.8;
const SquadStopD = i => SQUAD.peekD - i * SQUAD.spacingM;
/**
 * 03-3「左边沟里头有人！」：那个班顺干水沟弯着腰摸到坑西北（沟深 1.2 m + 沟沿翻土，坑里看不见头），班长探头被刘文财看见；
 * 出沟：轻机枪组趴进渐浅段（枪口出沟沿）打丙位；步兵一个个出沟扑到 N2 后，fallen 那两个半路被丙位打倒。
 * 返回 { peek 探头那一点, out: {id → 到出沟点 / 机枪位的时刻}, fallT: {id → 倒下的时刻} }。
 */
function DitchSquad033(s, C) {
  const out = {}, fallT = {};
  SQUAD.ids.forEach((id, i) => {
    const d0 = SQUAD.startD - i * SQUAD.spacingM, dStop = SquadStopD(i);
    const stop = DitchAt(dStop);
    s.Go(id, 0, SQUAD_STOP_T, stop.x, stop.z, { move: "walk", path: DitchPath(d0, dStop), stance: "crouch" });
    const crew = id === SQUAD.lmg || id === SQUAD.loader;
    const dTo = crew ? (id === SQUAD.lmg ? SQUAD.lmgD : SQUAD.loaderD) : DITCH_EMERGE_D;
    const tTo = R(SQUAD_GO_T + (dTo - dStop) / SQUAD_FAST_MPS);
    const to = DitchAt(dTo);
    // 猫腰快走：walk 的默认速度比 SQUAD_FAST_MPS 慢，出发键钉住出发时刻，运行时按窗口算出 1.8 m/s
    s.Go(id, SQUAD_GO_T, tTo, to.x, to.z, { move: "walk", path: DitchPath(dStop, dTo), depart: { stance: "crouch", aim: false }, stance: "crouch" });
    out[id] = tTo;
    if (crew) {
      s.Key(id, R(tTo + 0.2), { stance: "prone", aim: id === SQUAD.lmg, faceTo: C });
      return;
    }
    const fall = SQUAD.fallen.includes(id) ? DitchSquadFallenAt(id) : null;
    const tEnd = Bound(s, id, R(tTo + 0.2), RushStation({ bund: "N2", x: SQUAD.n2X[id] }), { faceTo: C, fall, minS: 1.2 });
    if (fall) fallT[id] = tEnd;
  });
  // 班长探头：在沟里站起来看一眼坑那边
  s.Key(SQUAD.leader, SQUAD_PEEK_T, { stance: "stand", faceTo: C });
  s.Key(SQUAD.leader, R(SQUAD_PEEK_T + 1.0), { stance: "crouch" });
  return { peek: DitchAt(SquadStopD(0)), out, fallT };
}

/** 东头沿前沿沟往西清过来的：跑到前沿沟上 x 那一点（经过中间的折点）。 */
function TrenchClear(s, id, t, x, lat, mps = 3.6) {
  const p = s.pos.get(id), to = FrontAtX(x, lat);
  const path = L0105_TRENCHES.front.filter(v => (v.x - p.x) * (v.x - to.x) < 0).sort((a, b) => b.x - a.x).map(v => ({ x: v.x, z: v.z }));
  const len = [p, ...path, to].reduce((acc, q, i, arr) => acc + (i ? Dist(arr[i - 1], q) : 0), 0);
  s.Go(id, t, R(t + len / mps), to.x, to.z, { move: "run", ...(path.length ? { path } : {}), aim: true });
  return R(t + len / mps);
}

function S0303(ctx) {
  const s = new Seq(ctx, "03-3", "三个射位轮换");
  const A = { x: 0.8, z: -9.2 }, B = { x: 3.6, z: 1.0 }, C = { x: -9, z: -15 };
  // 甲位这一段按举枪瞄着看的视野（ADS_FOV）：190 m 外的人在 60° 里只有几个像素；缩头那两秒放下枪（默认 60°）
  const ADS_FOV = 32;
  // ① 来路（0–5.9 s）：站上坑沿往北看 —— 地坎上冒出钢盔，两组人翻坎上来、扑到最远那道田埂后；坎后冒掷弹筒的烟（盯着坎看，镜头再收窄）
  s.Eye(0, 5.9, { stance: "stand", x: A.x, z: A.z, look: { x: 8, z: -205 }, toLook: { x: 24, z: -203 }, pitch: 0.3, fov: 26 });
  s.Eye(5.9, 0.6, { stance: "stand", x: A.x, z: A.z, look: { x: 24, z: -203 }, pitch: 0.3, toLook: { x: -43, z: -186 }, toPitch: 0.3, fov: ADS_FOV });
  RushBounds(s, RUSH_BOUNDS_033);
  Shot(s, 2.2, "IjaRush1"); Puff(s, 2.3, { x: -1.4, z: -11.3 });
  Shot(s, 3.6, "IjaRush6"); Puff(s, 3.7, { x: 2.4, z: -11.1 });
  Shot(s, 3.0, "Gunner", { count: 5, sfx: "mgBurstNear" });
  for (const t of [2.6, 4.8]) Shot(s, t, "player");
  // ② 压制（6–15 s）：轻机枪一扫坑沿 → 缩头 → 正面趁这两秒跳一段 → 抬头只来得及打一两枪 → 又一梭子
  SweepParapet(s, 6.2, "IjaLmgWest", -3.4, 3.0);
  Duck(s, 6.5, 8.4, A, { x: -43, z: -176, h: 1.0 });
  s.Eye(8.4, 3.4, { stance: "stand", x: A.x, z: A.z, look: { x: -43, z: -176 }, pitch: 0.3, toLook: { x: 21, z: -183 }, toPitch: 0.3, fov: ADS_FOV });
  for (const t of [8.9, 10.5]) Shot(s, t, "player");
  Shot(s, 9.4, "Gunner", { count: 5, sfx: "mgBurstNear" });
  Shot(s, 10.9, "IjaRush2"); Puff(s, 10.95, { x: 0.2, z: -11.2 });
  SweepParapet(s, 11.6, "IjaLmgEast", 3.4, -3.0);
  Duck(s, 11.9, 13.8, A, { x: -10, z: -182, h: 1.0 });
  s.Eye(13.8, 1.2, { stance: "stand", x: A.x, z: A.z, look: { x: -10, z: -182 }, pitch: 0.3, fov: ADS_FOV });
  Shot(s, 12.8, "IjaRush1"); Puff(s, 12.85, { x: -0.8, z: -11.0 });
  for (const [id, t0, t1] of [["PitNra1", 6.5, 8.4], ["PitNra1", 11.9, 13.8]]) {
    s.Key(id, t0, { stance: "crouch", aim: false });
    s.Key(id, t1, { stance: "stand", aim: true });
  }
  // 跑得最久的那个（IjaRush4）抬头那一下被打倒
  const rush4Fall = s.actorMap.get("IjaRush4").keys.find(k => k.clip === "ShotCollapse").t;
  Shot(s, R(rush4Fall - 0.15), "player");
  // 掷弹筒：一发比一发近（远处的掷弹筒组 2 s 一循环，「嘭」都落在 4 + 2k 上）
  MortarCrew(s, 4.0);
  Mortar(s, 4.0, { x: 7, z: -17.5 }, { shake: 0.25 });
  Mortar(s, 10.0, { x: 2.6, z: -12.9 }, { shake: 0.55 });
  // ③ 侧面（14.6 s 起）：西边干水沟里那个班 —— 班长探头，「左边沟里头有人！」
  const squad = DitchSquad033(s, C);
  s.Eye(15.0, 1.2, { stance: "stand", x: A.x, z: A.z, look: { x: -10, z: -182 }, pitch: 0.3, toLook: squad.peek, toPitch: 0, fov: ADS_FOV });
  const shout = s.Say("PitHold.03", "LiuWencai", 16.4);
  s.Key("LiuWencai", shout - 0.3, { faceTo: squad.peek, clip: "PvCrouchPointL", clipHold: true });
  s.Key("LiuWencai", shout + 2.6, { clip: null });
  // 换到丙位（散兵坑，朝西北）：沿爬沟过去，原来守丙位的兵让到坑里
  s.Cam(18.4, 2.6, { from: { x: A.x, z: A.z, h: 1.62 }, to: { x: -2.0, z: -8.0, h: 1.05 }, look: { x: -4.0, z: -9.6, h: 0.9 }, lookTo: { x: -6.0, z: -12.0, h: 0.9 } });
  s.Cam(21.0, 3.2, { from: { x: -2.0, z: -8.0, h: 1.05 }, to: { x: -8.6, z: -14.6, h: 0.95 }, look: { x: -6.0, z: -12.0, h: 0.9 }, lookTo: { x: -40, z: -60, h: 0.6 }, ease: "linear" });
  s.Go("PitNra3", 18.6, 23.6, -3.0, -6.6, { move: "walk", path: [{ x: -8, z: -14 }, { x: -3.5, z: -9 }], stance: "crouch", depart: { aim: false } });
  // 丙位：那个班一个个出沟；轻机枪趴进沟尽头打丙位；丙位打倒出沟的两个
  s.Eye(24.2, 15.6, { stance: "stand", x: C.x, z: C.z, look: { x: -63, z: -75 }, pitch: 0, toLook: { x: -58, z: -69 }, fov: 45 });
  const [fallA, fallB] = SQUAD.fallen.map(id => squad.fallT[id]);
  for (const t of [27.4, R(fallA - 0.15), 32.6, R(fallB - 0.15), 39.0]) Shot(s, t, "player");
  const lmgOn = R(squad.out[SQUAD.lmg] + 1.2);
  for (const [t, pts] of [[lmgOn, [{ x: -10.6, z: -16.6 }, { x: -8.4, z: -16.9 }]], [R(lmgOn + 4.2), [{ x: -9.8, z: -16.0 }, { x: -10.9, z: -14.8 }]]]) {
    Shot(s, t, SQUAD.lmg, { count: 6, sfx: "mgBurstFar" });
    pts.forEach((p, i) => Puff(s, R(t + 0.3 + i * 0.25), p));
  }
  Shot(s, 31.4, SQUAD.leader); Puff(s, 31.5, { x: -8.4, z: -16.6 });
  Mortar(s, 24.0, { x: -15, z: -24 }, { shake: 0.25 });
  Mortar(s, 32.0, { x: -11.4, z: -18.6 }, { shake: 0.6 });
  // ④ 换到乙位（沟口，朝东）：东头的鬼子沿丢掉的那段沟一个弯一个弯清过来（约 40 m → 约 15 m）
  s.Cam(39.8, 3.4, { from: { x: -8.6, z: -14.6, h: 0.95 }, to: { x: -2.0, z: -8.0, h: 1.05 }, look: { x: -6.0, z: -12.0, h: 0.9 }, lookTo: { x: 0.4, z: -4.0, h: 1.0 }, ease: "linear" });
  s.Cam(43.2, 2.8, { from: { x: -2.0, z: -8.0, h: 1.05 }, to: { x: B.x, z: B.z, h: 1.62 }, look: { x: 0.4, z: -4.0, h: 1.0 }, lookTo: { x: 14, z: -2.4, h: 1.4 } });
  s.Go("PitNra3", 40.0, 45.0, -9, -15, { move: "walk", path: [{ x: -3.5, z: -9 }, { x: -8, z: -14 }], depart: { stance: "crouch" }, stance: "stand", aim: true, yawDeg: 45 });
  s.Go("Luo", 43.0, 44.6, 4.6, -0.8, { move: "walk", yawDeg: -90 });
  s.Eye(46.0, 14, { stance: "stand", x: B.x, z: B.z, yaw: -90, pitch: 1, toYaw: -80 });
  TrenchClear(s, "IjaTrench1", 44.6, 28.5, -0.6); TrenchClear(s, "IjaTrench2", 45.4, 34, 0.6); TrenchClear(s, "IjaTrench3", 46.2, 40, -0.6);
  Shot(s, 49.6, "IjaTrench1"); Puff(s, 49.65, { x: 5.4, z: 0.9 });
  TrenchClear(s, "IjaTrench1", 51.0, 15, -0.6); TrenchClear(s, "IjaTrench2", 52.2, 20, 0.6); TrenchClear(s, "IjaTrench3", 53.4, 26, -0.6);
  Shot(s, 56.6, "IjaTrench1"); Puff(s, 56.65, { x: 5.0, z: 0.2 });
  Shot(s, 57.8, "IjaTrench2");
  for (const t of [48.6, 51.4, 54.2, 57.6]) Shot(s, t, "player");
  Shot(s, 49.2, "Luo"); Shot(s, 53.0, "Luo");
  Mortar(s, 46.0, { x: 9.0, z: -6.5 }, { shake: 0.3 });
  Mortar(s, 54.0, { x: 5.4, z: -2.6 }, { shake: 0.7 });
  // 正面的两挺轻机枪一直压着（土点跟着玩家在的射位）
  for (const [t, gun, p] of [[20.2, "IjaLmgEast", { x: -4.6, z: -11.6 }], [27.0, "IjaLmgWest", { x: -10.4, z: -16.4 }], [46.0, "IjaLmgEast", { x: 5.6, z: -1.8 }], [54.6, "IjaLmgWest", { x: 5.2, z: -2.2 }]]) {
    Shot(s, t, gun, { count: 6, sfx: "mgBurstFar" });
    Puff(s, t + 0.35, p);
  }
  // 身后：撤下来的人一个个从沟口过去，越来越稀
  for (const [id, t] of [["RetreatPass1", 6.0], ["RetreatPass2", 30.0]]) {
    s.Spawn(id, { x: -20, z: -1.4, yawDeg: -80 }, { visible: false });
    s.Key(id, t, { visible: true });
    s.Go(id, t, t + 12, 0.6, 12, { move: "run", path: [{ x: -5, z: 0 }, { x: 0, z: 0.5 }] });
    s.Key(id, t + 12.2, { visible: false });
  }
  return s.Done({ durationS: 60.0 });
}

function S0304(ctx) {
  const s = new Seq(ctx, "03-4", "变坏：机枪手中弹、战车露头");
  // 开场：机枪手还在坑沿打，抱手榴弹的弟兄在坑里
  s.Place("Gunner", 0, -1.2, -9.2, { state: "alive", stance: "crouch", aim: true, yawDeg: 0 });
  s.Place("Yaowa", 0, -2.4, -8.4, { clip: "YaowaSitLoad", faceTo: "Gunner" });
  s.Place("PitNra4", 0, -0.6, -6.4, { state: "alive", stance: "crouch", yawDeg: -8 });
  s.Place("PitNra1", 0, -2.6, -8.95, { aim: true, yawDeg: 0 }); // 让开顺子的视线（布设里他在顺子右手 0.9 m）；站在射击台平处，别贴着坑壁
  s.Place("Tank", 0, 175, -40, { visible: false });
  MortarCrew(s, 0.8);
  s.Eye(0, 5, { stance: "stand", look: { x: 0, z: -40 }, pitch: 1, toYaw: 20 }); // 站在射击台上才看得出胸墙
  Shot(s, 0.4, "Gunner", { count: 6, sfx: "mgBurstNear" }); Shot(s, 3.4, "Gunner", { count: 6, sfx: "mgBurstNear" });
  Shot(s, 1.6, "player"); Shot(s, 4.2, "player");
  // 一发掷弹筒弹落在捷克式旁边，机枪手腿上中弹
  const hit = Mortar(s, 0.8, { x: -1.8, z: -10.9 }, { shake: 0.6 });
  // 腿上中弹，跪坐抱腿（PvLegHitKneelClutch，枪脱手按 weapon 轨落在右前）；幺娃来拖的时候才放倒
  s.Key("Gunner", hit + 0.02, { clip: "PvLegHitKneelClutch", clipHold: true, aim: false });
  s.Key("Gunner", hit + 2.0, { state: "down", lie: "along", clip: null, weapon: null });
  s.Eye(hit - 0.4, 1.0, { stance: "crouch", yaw: 20, pitch: 3, toLook: { x: -1.2, z: -9.2 }, toPitch: -6 });
  // 幺娃把他往后拖
  const pull = hit + 1.6;
  s.Key("Yaowa", pull, { clip: "PullComrade", faceTo: "Gunner" });
  s.Go("Yaowa", pull + 0.6, pull + 3.4, -1.6, -6.3, { move: "drag" });
  // 倒地的人被拖：只平移、顺着躺，头朝拖他的幺娃（行进方向）；用 crawl 的慢速，整个窗口匀速滑过去
  s.Go("Gunner", pull + 0.6, pull + 3.4, -1.0, -7.6, { move: "crawl", yawDeg: Yaw({ x: -1.0, z: -7.6 }, { x: -1.6, z: -6.3 }) });
  s.Key("Yaowa", pull + 3.6, { clip: null, yawDeg: -7.9 });
  // 路那头战车露了头
  const tank = pull + 4.0;
  s.Key("Tank", tank, { visible: true });
  s.Go("Tank", tank, tank + 7.4, 159, -20, { move: "run", yawDeg: 142 });
  s.Sfx(tank, "tankTracks", { x: 168, z: -30 }); s.Sfx(tank + 4, "tankTracks", { x: 162, z: -24 });
  s.Eye(tank + 1.0, 2.2, { stance: "stand", look: { x: -1.2, z: -8.4 }, pitch: -6, toYaw: -61, toPitch: 1 });
  // 一炮打在坑沿（150 m，弹着约 0.25 s 后）
  const gun = tank + 8.0;
  s.Ev(gun, "muzzle", { x: 157.2, z: -18.6, h: 2.0 });
  s.Sfx(gun, "tankGun", { x: 159, z: -20 });
  s.Ev(gun + 0.25, "explosion", { x: 0.3, z: -10.6, kind: "tank", radius: 6 });
  s.Sfx(gun + 0.25, "shellBlast", { x: 0.3, z: -10.6 });
  s.Ev(gun + 0.3, "signal", { name: "PitShelled", on: true });
  s.Shake(gun + 0.25, 0.9, 1);
  s.Ev(gun + 0.3, "smoke", { x: 0.3, z: -10.8, kind: "SmokeDust", dur: 5 });
  // 一个弟兄抱着一捆手榴弹爬出去，死在坑沿外，那捆手榴弹落在沟沿上
  // 2026-10-19：猫腰到坑沿 → 扑出去（PvStandToProneDive）→ 抱着那捆爬（PvCrawlCarryBundle，右臂夹着手榴弹捆，枪背着）
  const crawl = gun + 2.6;
  const lip = { x: 0.4, z: -10.2 }, out = { x: 0.6, z: -13.6 };
  s.Go("PitNra4", crawl - 3.4, crawl - 0.5, lip.x, lip.z, { move: "walk", depart: { stance: "crouch" }, stance: "crouch" });
  Dive(s, "PitNra4", crawl - 0.4, Yaw(lip, out), { clip: "PvCrawlCarryBundle" });
  s.Go("PitNra4", crawl + 0.8, crawl + 5.4, out.x, out.z, { move: "crawl" });
  s.Eye(crawl - 0.4, 1.4, { stance: "stand", yaw: -61, pitch: 1, toLook: { x: 0.4, z: -12 }, toPitch: -14 });
  Shot(s, crawl + 5.6, "IjaLmgWest", { count: 5, sfx: "mgBurstFar" });
  Puff(s, crawl + 5.9, { x: 0.9, z: -14.2 });
  s.Key("PitNra4", crawl + 6.0, { state: "down", clip: null });
  s.Caption(crawl + 6.6, 3.0, "（那捆手榴弹落在坑沿外）");
  // 坑外（2026-10-20 第四轮）：正面再跳一段（还在 130 m 开外）；西边那个班打头的两个先扑进麦地、再跳到 N1 后（离坑约 45 m），
  // 沟尽头的轻机枪接着打丙位
  const C = { x: PL.fireC.x, z: PL.fireC.z };
  RushBounds(s, RUSH_BOUNDS_034);
  for (const [id, t] of [["IjaFlank1", 4.0], ["IjaFlank3", 5.2]]) {
    const n1 = L0105_DITCH_SQUAD.toN1[id];
    Bound(s, id, t, n1.mid, { faceTo: C });
    Bound(s, id, t + 8.0, RushStation({ bund: "N1", x: n1.x }), { faceTo: C });
  }
  for (const [t, p] of [[6.4, { x: -9.6, z: -16.4 }], [16.6, { x: -10.2, z: -15.2 }]]) {
    Shot(s, t, L0105_DITCH_SQUAD.lmg, { count: 6, sfx: "mgBurstFar" });
    Puff(s, t + 0.35, p);
  }
  Shot(s, 9.4, "IjaFlank5"); Shot(s, 18.2, "IjaFlank6");
  return s.Done({ durationS: crawl + 10.0 });
}

function S0305(ctx) {
  const s = new Seq(ctx, "03-5", "撤：把那捆捡起");
  // 开场接 03-4：人还在坑里
  s.Place("Luo", 0, 2.8, -3.0, { aim: true, yawDeg: -90 });
  s.Place("LiuWencai", 0, 2.0, -5.3, { stance: "crouch" });
  s.Place("Gunner", 0, -1.0, -7.6, { state: "down" });
  s.Place("Yaowa", 0, -1.6, -6.3, { stance: "crouch" });
  s.Place("PitNra1", 0, 2.7, -8.7, { aim: true });
  s.Place("PitNra3", 0, -3.0, -6.6, { stance: "crouch" });
  s.Place("RearguardNra", 0, -26, 2.4, { yawDeg: -85 });
  // 殿后的兵跑过沟口：后头没得人了！
  s.Go("RearguardNra", 0, 6.4, -2.0, -0.2, { move: "run", path: [{ x: -14, z: -3.5 }, { x: -5, z: 0 }] });
  s.Eye(0, 4, { stance: "crouch", look: { x: -5, z: 0 }, pitch: 2 });
  s.Say("PitLeave.01", "RearguardNra", 4.8);
  s.Go("RearguardNra", 7.0, 11.0, 0.8, 12.0, { move: "run", path: [{ x: 0.2, z: 1.0 }] });
  // 班长：走了！把那捆捡起！
  s.Go("Luo", 3.2, 6.8, 0.67, 1.47, { move: "walk", faceTo: "player", depart: { aim: false }, clip: "PvStandWaveOnL" });
  s.Eye(6.6, 1.0, { stance: "crouch", look: { x: -2, z: -0.2 }, pitch: 2, toLook: { x: 0.67, z: 1.47 }, toPitch: 4 });
  const go = s.Say("PitLeave.02", "Luo", 7.0);
  s.Key("Luo", s.End("PitLeave.02") + 0.3, { yawDeg: 4.5, clip: null });
  // 幺娃架着机枪手，其他人顺交通沟往下走
  const leave = go + 1.0;
  s.Key("Gunner", leave - 0.5, { state: "alive", stance: "stand" });
  SupportGo(s, leave, leave + 7.5, { x: -0.31, z: 3.02 }, { yawDeg: -177.4 });
  s.Go("LiuWencai", leave - 0.6, leave + 6.6, -0.15, 5.51, { move: "walk", stance: "stand" });
  s.Go("PitNra1", leave + 0.2, leave + 7.0, 0.86, 7.97, { move: "walk", aim: false });
  s.Go("PitNra3", leave + 0.4, leave + 7.0, -0.05, 10.01, { move: "walk", stance: "stand" });
  // 顺子捡起那捆手榴弹
  s.Eye(leave + 0.4, 1.2, { stance: "crouch", look: { x: 0.67, z: 1.47 }, pitch: 4, toLook: { x: 1.6, z: -11.9 }, toPitch: -32 });
  s.Caption(leave + 2.0, 2.6, "（伸手把坑沿外那捆手榴弹捡起来）");
  return s.Done({ durationS: leave + 5.2 });
}

// ---------------------------------------------------------------------------
// 04 一段一段往后退

function S0401(ctx) {
  const s = new Seq(ctx, "04-1", "退到拐角 1 回身顶");
  s.Place("Gunner", 0, 0.0, 3.4, { woundedWalk: true });
  s.Place("Yaowa", 0, 0.8, 3.2);
  s.Place("LiuWencai", 0, 0.4, 6.4);
  s.Place("Luo", 0, 0.9, 9.0);
  for (const id of ["IjaTrench1", "IjaTrench2", "IjaTrench3"]) s.Key(id, 0, { visible: false });
  // 坑丢了，往拐角 1 跑
  s.Cam(0, 3.6, { from: { x: 2.2, z: -5.2, h: 1.3 }, to: { x: 1.62, z: 12.16, h: 1.4 }, look: { actor: "Yaowa", offset: [0, 1.2, 0] }, ease: "linear" });
  SupportGo(s, 0, 9.0, { x: 5.29, z: 15.41 }, { path: [{ x: 0.5, z: 11 }] });
  s.Go("LiuWencai", 0, 6.0, 8.85, 18.19, { move: "walk", path: [{ x: 0.8, z: 11.6 }] });
  s.Go("Luo", 0, 4.0, 13.57, 21.63, { move: "run", path: [{ x: 1.0, z: 11.4 }], faceTo: "player" });
  // 回身顶：鬼子在坑里顺第一段沟往下打
  s.Eye(3.6, 1.0, { stance: "crouch", yaw: -160, pitch: 0, toYaw: 4.8, toPitch: 2 });
  // 2026-10-20 第四轮：坑里的是东头沿前沿沟清过来的那几个（离坑最近，先进的坑）
  s.Key("IjaTrench3", 4.0, { visible: true }); s.Key("IjaTrench1", 4.6, { visible: true }); s.Key("IjaTrench2", 5.0, { visible: true });
  s.Eye(4.6, 14, { stance: "crouch", yaw: 4.8, pitch: 2, toYaw: 0 });
  for (const t of [6.0, 8.6, 11.2, 14.4]) Shot(s, t, "player");
  Shot(s, 5.4, "IjaTrench3"); Puff(s, 5.45, { x: 2.4, z: 10.6 });
  Shot(s, 7.4, "IjaTrench1"); Shot(s, 10.0, "IjaTrench2"); Puff(s, 10.05, { x: 0.6, z: 9.8 });
  Shot(s, 13.0, "IjaTrench3"); Puff(s, 13.05, { x: 2.8, z: 11.4 });
  // 前头两个人走得慢，一直在顺子眼前；班长先到下一个拐角回身喊人
  s.Key("Luo", 6.0, { clip: "PvStandBeckonL" });
  s.Caption(12.0, 3.0, "（班长在下个拐角回身招呼：走！）");
  SupportGo(s, 9.0, 18.0, { x: 12.6, z: 22.4 });
  // 手榴弹扔进来要躲
  const g = 16.0;
  s.Eye(g - 0.6, 0.6, { stance: "crouch", yaw: 0, pitch: 2, toYaw: 150, toPitch: -6 });
  s.Sfx(g + 1.6, "grenadeBlast", { x: 1.2, z: 8.4 }); s.Ev(g + 1.6, "explosion", { x: 1.2, z: 8.4, kind: "grenade", radius: 4 });
  s.Shake(g + 1.6, 0.6, 0.7); s.Ev(g + 1.7, "smoke", { x: 1.2, z: 8.4, kind: "SmokeDust", dur: 4 });
  s.Caption(g, 1.6, "（手榴弹扔进来，躲开）");
  // 跑到下一个拐角
  s.Cam(g + 2.6, 4.2, { from: { x: 1.62, z: 12.16, h: 1.05 }, to: { x: 11.8, z: 20.4, h: 1.4 }, look: { actor: "Yaowa", offset: [0, 1.2, 0] }, ease: "linear" });
  s.Go("Luo", g + 1.0, g + 9.0, 12.5, 40.0, { move: "run", depart: { clip: null } });
  s.Go("LiuWencai", g + 2.0, g + 8.5, 12.3, 30.0, { move: "walk" });
  return s.Done({ durationS: g + 7.4 });
}

function S0402(ctx) {
  const s = new Seq(ctx, "04-2", "第二次回身：拐角近战");
  s.Place("Gunner", 0, 12.6, 40.5, { woundedWalk: true }); s.Place("Yaowa", 0, 13.3, 40.2);
  s.Place("LiuWencai", 0, 12.4, 44.6); s.Place("Luo", 0, 13.6, 47.0);
  s.Place("IjaTrench1", 0, 13.0, 27.0, { aim: false }); s.Place("IjaTrench2", 0, 12.7, 22.5); s.Place("IjaTrench3", 0, 13.0, 21.0);
  s.Cam(0, 3.0, { from: { x: 12.9, z: 37.6, h: 1.4 }, to: { x: 12.66, z: 45.02, h: 1.5 }, look: { actor: "Yaowa", offset: [0, 1.2, 0] }, ease: "linear" });
  SupportGo(s, 0, 10.0, { x: 14.34, z: 50.61 });
  s.Go("LiuWencai", 0, 6.0, 16.75, 56.11, { move: "walk" });
  s.Go("Luo", 0, 6.0, 21.66, 65.03, { move: "run", yawDeg: 23.2 });
  // 回身：鬼子跳进沟里追上来
  s.Eye(3.0, 1.0, { stance: "stand", yaw: 175, pitch: 0, toYaw: -0.8, toPitch: 0 });
  s.Go("IjaTrench1", 0, 4.2, 12.76, 38.03, { move: "run", aim: true, yawDeg: 177.5 });
  s.Go("IjaTrench2", 0, 4.6, 12.04, 31.49, { move: "run", yawDeg: 177.5 });
  s.Go("IjaTrench3", 0, 5.0, 13.08, 26.03, { move: "run", yawDeg: 177.5 });
  Shot(s, 4.4, "player"); Shot(s, 4.8, "IjaTrench1"); Puff(s, 4.85, { x: 11.6, z: 46.0 });
  // 手榴弹扔进来要躲
  s.Caption(5.6, 1.6, "（手榴弹扔进来，躲到拐角后面）");
  s.Cam(5.8, 0.8, { from: { x: 12.66, z: 45.02, h: 1.62 }, to: { x: 14.2, z: 47.6, h: 1.05 }, look: { x: 12.2, z: 41.0, h: 1.0 }, lookTo: { x: 16.0, z: 52.0, h: 1.0 } });
  s.Sfx(7.4, "grenadeBlast", { x: 11.37, z: 42.47 }); s.Ev(7.4, "explosion", { x: 11.37, z: 42.47, kind: "grenade", radius: 4 });
  s.Shake(7.4, 0.6, 0.7); s.Ev(7.5, "smoke", { x: 11.37, z: 42.47, kind: "SmokeDust", dur: 4 });
  // 拼刺刀：鬼子冲过拐角
  s.Cam(8.6, 0.8, { from: { x: 14.2, z: 47.6, h: 1.05 }, to: { x: 12.66, z: 45.02, h: 1.62 }, look: { x: 16.0, z: 52.0, h: 1.0 }, lookTo: { x: 12.8, z: 40.0, h: 1.4 } });
  s.Go("IjaTrench1", 8.4, 10.2, 12.74, 42.6, { move: "run", aim: false });
  // 拼刺刀：一条到底（PvIjaLungeParriedFall：突刺 → 0.42 s 被格开 → 0.86 s 胸口中刺 → 枪脱手按 weapon 轨落地 → 仰面倒，末帧是尸体）
  s.Key("IjaTrench1", 10.2, { clip: "PvIjaLungeParriedFall", clipHold: true });
  s.Shake(10.8, 0.3, 0.4);
  s.Cam(10.8, 0.5, { from: { x: 12.66, z: 45.02, h: 1.62 }, to: { x: 12.68, z: 44.0, h: 1.55 }, look: { actor: "IjaTrench1", offset: [0, 1.2, 0] }, ease: "linear" });
  s.Sfx(11.06, "stab", { x: 12.74, z: 42.6 });
  s.Caption(10.4, 2.4, "（拼刺刀：格开、捅回去）");
  s.Eye(11.4, 2.4, { stance: "stand", x: 12.68, z: 44.0, look: { x: 12.74, z: 42.6 }, pitch: -20, toLook: { x: 12.4, z: 31 }, toPitch: 0 });
  Shot(s, 13.2, "player"); Shot(s, 13.6, "IjaTrench2"); Puff(s, 13.7, { x: 13.6, z: 44.6 });
  s.Go("IjaTrench2", 14.0, 15.0, 12.0, 30.4, { move: "walk", stance: "crouch" });
  // 跟班长退到拐角 2
  s.Cam(15.4, 4.6, { from: { x: 12.68, z: 44.0, h: 1.4 }, to: { x: 16.6, z: 53.4, h: 1.4 }, look: { actor: "Yaowa", offset: [0, 1.2, 0] }, ease: "linear" });
  SupportGo(s, 14.0, 22.0, { x: 19.6, z: 60.2 });
  return s.Done({ durationS: 21.0 });
}

function S0403(ctx) {
  const s = new Seq(ctx, "04-3", "退到拐角 2：履带声");
  s.Place("Gunner", 0, 28.0, 80.6, { woundedWalk: true }); s.Place("Yaowa", 0, 28.8, 80.2);
  s.Place("Luo", 0, 31.6, 95.0); s.Place("LiuWencai", 0, 30.8, 88.0);
  s.Place("IjaTrench2", 0, 18.0, 56.0, { aim: false }); s.Place("IjaTrench3", 0, 16.6, 52.6);
  s.Place("Tank", 0, 86.4, 67.0); s.Place("TankInf1", 0, 90.0, 61.8); s.Place("TankInf2", 0, 95.0, 61.4); s.Place("TankInf3", 0, 95.6, 56.2);
  s.Cam(0, 4.4, { from: { x: 24.6, z: 72.4, h: 1.4 }, to: { x: 30.36, z: 86.95, h: 1.4 }, look: { actor: "Yaowa", offset: [0, 1.2, 0] }, ease: "linear" });
  SupportGo(s, 0, 8.0, { x: 30.54, z: 91.99 }, { path: [{ x: 29.6, z: 85.6 }] });
  { const l = KU(ctx, "04-3", "Luo"); s.Go("Luo", 0, 6.0, l.x, l.z, { move: "run", yawDeg: l.yawDeg }); }  // 板桥北沿外一步（10-18 第三轮挪出桥底）
  // 10-18 第三轮：跑到板桥北沿外，猫腰钻过桥底（桥下横木底离沟底只有 1.76 m），在桥南几步蹲下
  { const l = KU(ctx, "04-3", "LiuWencai"), n = TP(T_CROSSING - 3.6, -0.3);
    s.Go("LiuWencai", 0, 7.4, n.x, n.z, { move: "run" });
    s.Go("LiuWencai", 7.6, 14.6, l.x, l.z, { move: "walk", stance: "crouch", depart: { stance: "crouch" }, yawDeg: l.yawDeg }); }
  // 回身看追兵
  s.Eye(4.4, 1.0, { stance: "crouch", yaw: 170, pitch: 0, toLook: { x: 23.02, z: 70.97 }, toPitch: 2 });
  s.Go("IjaTrench2", 0, 5.4, 23.02, 70.97, { move: "run", aim: true, yawDeg: -156.8 });
  s.Go("IjaTrench3", 0, 6.0, 21.87, 66.02, { move: "run", yawDeg: -156.8 });
  for (const t of [6.2, 8.4]) Shot(s, t, "player");
  Shot(s, 7.0, "IjaTrench2"); Puff(s, 7.05, { x: 29.4, z: 85.2 });
  s.Key("IjaTrench2", 9.0, { stance: "crouch" });
  // 路上传来履带声
  s.Sfx(9.6, "tankTracks", { x: 80, z: 74, volume: 0.6 });
  s.Sfx(13.6, "tankTracks", { x: 74, z: 80, volume: 0.8 });
  s.Sfx(17.6, "tankTracks", { x: 68, z: 85, volume: 1.0 });
  s.Caption(10.2, 3.2, "（路上传来履带声）");
  s.Go("Tank", 9.0, 20.0, 64.1, 88.56, { move: "walk", yawDeg: 133.3 });
  s.Go("TankInf1", 9.0, 20.0, 67.37, 83.28, { move: "walk" });
  s.Go("TankInf2", 9.0, 20.0, 72.48, 82.86, { move: "walk" });
  s.Go("TankInf3", 9.0, 20.0, 73.19, 77.79, { move: "walk" });
  s.Eye(11.0, 2.4, { stance: "crouch", look: { x: 23.02, z: 70.97 }, pitch: 2, toYaw: -92.7, toPitch: 4 });
  s.Eye(19.0, 1.6, { stance: "crouch", yaw: -92.7, pitch: 4, toLook: KU(ctx, "04-3", "Luo"), toPitch: 1 });
  s.Key("Luo", 19.0, { faceTo: "player", clip: "PvStandBeckonL" });
  return s.Done({ durationS: 22.4 });
}

// ---------------------------------------------------------------------------
// 05 沟里伏击战车

function S0501(ctx) {
  const s = new Seq(ctx, "05-1", "板桥底下：缩在沟底");
  const K = id => KU(ctx, "05-1", id);
  const ME = KP(ctx, "05-1");
  const luo = K("Luo");
  // 开场：战车还在路上往这边来；班长站在板桥北边几步的沟里，看了一眼路
  const tank0 = RoadBack(30), inf0 = [RoadBack(36, -1.6), RoadBack(40, 1.6), RoadBack(44, -1.6)];
  s.Place("Tank", 0, tank0.x, tank0.z, { yawDeg: 133.3 });
  ["TankInf1", "TankInf2", "TankInf3"].forEach((id, k) => s.Place(id, 0, inf0[k].x, inf0[k].z));
  const luo0 = TP(T_CROSSING - 4.5, 0.6), me0 = TP(T_CROSSING - 6.5, -0.2);
  s.Place("Luo", 0, luo0.x, luo0.z, { stance: "stand", faceTo: RoadBack(25) });
  const gy0 = TP(T_CROSSING - 9, -0.45), yw0 = TP(T_CROSSING - 9, 0.45);
  s.Place("Gunner", 0, gy0.x, gy0.z, { stance: "stand", woundedWalk: true });
  s.Place("Yaowa", 0, yw0.x, yw0.z, { stance: "stand" });
  s.Cam(0, 4.6, { from: { ...me0, h: 1.3 }, to: { ...TP(T_CROSSING - 5.6, -0.2), h: 1.2 }, look: { actor: "Luo", offset: [0, 1.3, 0] }, lookTo: { ...RoadBack(18), h: 1.4 } });
  for (const [t, v] of [[0.6, 0.55], [4.6, 0.7], [8.6, 0.85], [12.6, 1.0]]) s.Sfx(t, "tankTracks", { x: RoadBack(24).x, z: RoadBack(24).z, volume: v });
  // 班长的判断（不新增配音，用说明字）
  s.Key("Luo", 1.4, { clip: "PvStandPointL", clipHold: true, faceTo: BRIDGE });
  s.Caption(1.6, 3.6, "（班长看了一眼路上的战车：它要过来，只有走那座板桥——沟太宽，车跨不过去）");
  s.Key("Luo", 4.0, { clip: null });
  // 他拽着顺子钻到桥下的沟底趴着；幺娃架着机枪手从桥下钻过去，缩在桥南几步
  // 10-18 第三轮：桥下横木底离沟底只有 1.76 m，钻进桥底之前就猫下腰（出发那一刻就蹲，走的是蹲姿），头顶离横木底 ≥ 0.1 m
  // 猫腰拽着顺子钻进桥底（PvCrouchRunPullBehind：左手往身后拽，右手低提枪；按实际速度 / 1.4 推）
  s.Go("Luo", 4.4, 6.4, luo.x, luo.z, { move: "walk", stance: "crouch", faceTo: RoadBack(15), depart: { stance: "crouch", clip: "PvCrouchRunPullBehind" }, clip: null });
  s.Go("Gunner", 4.0, 12.5, K("Gunner").x, K("Gunner").z, { move: "walk", woundedWalk: true, stance: "crouch", faceTo: BRIDGE, depart: { stance: "crouch" } });
  s.Go("Yaowa", 4.0, 12.5, K("Yaowa").x, K("Yaowa").z, { move: "walk", stance: "crouch", faceTo: BRIDGE, depart: { stance: "crouch" } });
  s.Cam(4.6, 2.2, { from: { ...TP(T_CROSSING - 5.6, -0.2), h: 1.2 }, to: { x: ME.x, z: ME.z, h: 0.45 }, look: { ...RoadBack(18), h: 1.4 }, lookTo: { ...BRIDGE, h: 2.4 } });
  s.Caption(5.2, 2.4, "（班长拽着顺子钻到桥下的沟底趴着）");
  s.Eye(6.8, 3.4, { stance: "prone", look: { ...BRIDGE, x: BRIDGE.x + 0.4 }, pitch: 60, toLook: RoadBack(15), toPitch: 16 });
  // 战车顺着路逼近，要从桥上过
  s.Go("Tank", 2.0, 16.0, K("Tank").x, K("Tank").z, { move: "walk", yawDeg: 133.3 });
  for (const id of ["TankInf1", "TankInf2", "TankInf3"]) s.Go(id, 2.0, 16.0, K(id).x, K(id).z, { move: "walk" });
  s.Shake(10.0, 6.0, 0.12);
  s.Sfx(11.0, "dirtFall", { x: BRIDGE.x, z: BRIDGE.z, volume: 0.4 });
  // 回头看一眼：幺娃架着机枪手缩在桥南几步
  s.Eye(10.4, 1.2, { stance: "prone", look: RoadBack(15), pitch: 16, toLook: K("Yaowa"), toPitch: 4 });
  s.Eye(13.0, 1.2, { stance: "prone", look: K("Yaowa"), pitch: 4, toLook: RoadBack(12), toPitch: 16 });
  return s.Done({ durationS: 16.4 });
}

function S0502(ctx) {
  const s = new Seq(ctx, "05-2", "战车压上板桥");
  const K = id => KU(ctx, "05-2", id);
  const ME = KP(ctx, "05-2");
  const bridgeYaw = L0105_BRIDGE.yawDeg;
  const start = RoadBack(14), past = RoadBack(-5.5, 0);
  s.Place("Tank", 0, start.x, start.z, { yawDeg: 133.3 });
  const inf0 = [RoadBack(21, -1.6), RoadBack(25, 1.6), RoadBack(29, -1.6)];
  ["TankInf1", "TankInf2", "TankInf3"].forEach((id, k) => s.Place(id, 0, inf0[k].x, inf0[k].z));
  // 桥下仰看：战车从东北顺路压过来
  s.Eye(0, 3.0, { stance: "prone", look: start, pitch: 14, toLook: RoadBack(8), toPitch: 22 });
  for (const [t, v] of [[0.4, 1.0], [3.4, 1.1], [6.0, 1.2], [8.6, 1.0]]) s.Sfx(t, "tankTracks", { x: BRIDGE.x, z: BRIDGE.z, volume: v });
  s.Go("Tank", 0.3, 6.6, BRIDGE.x, BRIDGE.z, { move: "walk", yawDeg: bridgeYaw });
  for (const id of ["TankInf1", "TankInf2", "TankInf3"]) s.Go(id, 0.3, 10.0, K(id).x, K(id).z, { move: "walk" });
  // 换到沟里桥南几步看：战车压上板桥
  const side = TP(T_CROSSING + 11.5, -0.9);   // 幺娃他们身后几步，越过他们看板桥
  s.Cam(3.0, 3.4, { from: { ...side, h: 1.5 }, to: { ...TP(T_CROSSING + 10.5, -1.0), h: 1.45 }, look: { ...RoadBack(5), h: 2.2 }, lookTo: { ...BRIDGE, h: 2.0 } });
  // 板子嘎吱响，土从板缝往下漏（效果挂车压上桥那一刻）
  const on = 5.6;
  s.Caption(on, 3.2, "（门板嘎吱响、往下弯，土从板缝往下漏）");
  s.Shake(on, 4.2, 0.7);
  s.Sfx(on + 0.1, "dirtFall", { x: BRIDGE.x, z: BRIDGE.z });
  s.Sfx(on + 1.6, "dirtFall", { x: BRIDGE.x - 0.6, z: BRIDGE.z + 0.6 });
  s.Sfx(on + 3.0, "dirtFall", { x: BRIDGE.x + 0.5, z: BRIDGE.z - 0.5, volume: 0.8 });
  for (const [dt, dx, dz, dur] of [[0.2, 0.2, 0.3, 4], [1.0, -0.8, 0.9, 3.5], [1.8, 0.9, -0.7, 3.5], [2.6, -0.2, -0.4, 3]]) {
    s.Ev(on + dt, "smoke", { x: R(BRIDGE.x + dx), z: R(BRIDGE.z + dz), kind: "SmokeDust", dur });
  }
  // 班长蹲着缩在桥下不动（10-18 第三轮：原来车压上桥时趴下、过后再蹲起来，从趴到蹲那一下动作库先站起来再跪，头顶贴着横木）
  s.Key("Luo", on - 0.2, { stance: "crouch", aim: false });
  // 桥下仰看（10-18 第二轮）：机位挪到桥面南沿下（沟底，南沿往南约 0.8 m），往上往北看。画面从下往上：
  // 门板底面（板缝 9 cm，透出车底和天光）→ 桥面南沿 → 压在桥上的车身 / 履带 → 一块天空；土从板缝往下漏（落土烟 + 说明字）。
  const r = bridgeYaw * Math.PI / 180, acrossZ = Math.sin(r);       // 横着桥面的方向（往东南）每往南 1 m 走多少
  const under = TP(T_CROSSING + (L0105_BRIDGE.deckW / 2 + 2.0) / acrossZ, 0);   // 离南沿约 2 m：沿下的车身露得出来
  // 朝西北（正对桥面南沿，沿一下成一条横线）、仰 28°：下半是门板底面，中间是桥沿，上面是车身，再往上是天
  s.Eye(6.4, 3.0, { stance: "crouch", x: under.x, z: under.z, yaw: 38, pitch: 26, toPitch: 30, fov: 76, shake: 0.4 });
  s.Ev(6.6, "smoke", { x: R(under.x - 1.0), z: R(under.z - 2.2), kind: "SmokeDust", dur: 3.5 });
  s.Go("Tank", 7.6, 10.4, past.x, past.z, { move: "walk", yawDeg: 128 });
  s.Eye(9.4, 1.6, { stance: "crouch", x: under.x, z: under.z, yaw: 38, pitch: 30, toLook: past, toPitch: 14, fov: 76 });
  return s.Done({ durationS: 11.2 });
}

function S0503(ctx) {
  const s = new Seq(ctx, "05-3", "甩手榴弹炸车尾");
  const K = id => KU(ctx, "05-3", id);
  const ME = KP(ctx, "05-3");
  const stop = K("Tank");
  const r = stop.yawDeg * Math.PI / 180;
  const rear = { x: R(stop.x + Math.sin(r) * 2.9), z: R(stop.z + Math.cos(r) * 2.9) };
  // 车刚过桥：车屁股还对着桥头
  const past = RoadBack(-5.5, 0);
  s.Place("Tank", 0, past.x, past.z, { yawDeg: 128 });
  s.Go("Tank", 0, 2.4, stop.x, stop.z, { move: "walk", yawDeg: stop.yawDeg });
  s.Ev(0, "signal", { name: "TankDisabled", on: false });
  const under = KP(ctx, "05-2");
  s.Cam(0, 1.6, { from: { x: under.x, z: under.z, h: 0.4 }, to: { x: ME.x, z: ME.z, h: 1.62 }, look: { ...BRIDGE, h: 2.6 }, lookTo: { ...rear, h: 2.6 } });
  // 甩手榴弹（10-18 第二轮：原来第一人称贴着车尾，满屏车屁股）：换成顺子身后斜上方的宽镜头，
  // 一个画面里看得出「顺子从沟沿探身 → 车尾 → 那捆手榴弹落在车尾铁板上」。
  // 10-18 第三轮：顺子替身播步兵投弹片段（throw 键 → GrenadeThrow「背枪投弹」，游戏里 BeginGrenadeThrow 同一个片段；
  // 原来没有投弹片段，拿 PointBlockade 顶着）：抡 2.15 s 脱手，那捆手榴弹顺抛物线飞 0.9 s 落在车尾铁板上（离地 1.5 m）再炸。
  s.Spawn("Shunzi", { side: "nra", x: ME.x, z: ME.z, faceTo: rear, name: "顺子（替身）" }, { visible: false });
  s.Key("Shunzi", 1.2, { visible: true, faceTo: rear, stance: "crouch" });
  const lob = 1.5, flightS = 0.9;
  s.Key("Shunzi", lob, { throw: { x: rear.x, z: rear.z, h: 1.5, flightS } });
  const land = R(lob + PREVIZ_THROW.releaseS + flightS);
  s.Key("Shunzi", R(lob + PREVIZ_THROW.clipS), { stance: "crouch" });
  // 机位在顺子身后（东南）沟上方约 3 m、往西北压下来看：前景是沟里探身的顺子，越过沟沿是车尾和那块铁板（手榴弹落点）
  const away = { x: ME.x - rear.x, z: ME.z - rear.z }, awayL = Math.hypot(away.x, away.z);
  const back = { x: R(ME.x + away.x / awayL * 3.6 + away.z / awayL * 1.2), z: R(ME.z + away.z / awayL * 3.6 - away.x / awayL * 1.2) };
  const mid = { x: R(rear.x * 0.45 + ME.x * 0.55), z: R(rear.z * 0.45 + ME.z * 0.55) };
  s.Cam(1.2, R(land + 0.7 - 1.2), { from: { ...back, h: 4.6 }, to: { ...back, h: 4.8 }, look: { ...mid, h: 0.4 }, lookTo: { ...mid, h: 0.6 }, fov: 72 });
  s.Caption(1.6, 2.4, "（顺子从桥边探身，把那捆手榴弹甩到车屁股后头那块铁板上）");
  const boom = R(land + 0.05);
  s.Sfx(boom, "grenadeBlast", rear); s.Ev(boom, "explosion", { x: rear.x, z: rear.z, h: 1.5, kind: "grenade", radius: 5 });
  s.Shake(boom, 0.8, 0.8);
  s.Ev(boom + 0.1, "smoke", { x: rear.x, z: rear.z, kind: "SmokeBlack", dur: 20 });
  s.Ev(boom + 0.1, "signal", { name: "TankDisabled", on: true });
  s.Caption(boom + 0.6, 2.6, "（车瘫在桥头，斜着把路堵死；桥面压断了两块门板）");
  // 后面的鬼子一时跟不上来
  s.Key("TankInf1", boom + 0.6, { stance: "crouch" }); s.Key("TankInf2", boom + 0.4, { stance: "crouch" });
  Shot(s, boom + 2.0, "Luo"); Shot(s, boom + 3.6, "Luo");
  const across = RoadBack(11);
  s.Key("Shunzi", boom + 0.8, { visible: false });
  s.Eye(boom + 0.8, 2.6, { stance: "stand", look: rear, pitch: 14, toLook: across, toPitch: 8, fov: 70 });
  // 幺娃：顺儿哥，搭把手！
  const ask = s.Say("TankAmbush.01", "Yaowa", boom + 4.2);
  s.Key("Yaowa", ask - 0.6, { faceTo: "player", clip: "PvStandBeckonL" });
  s.Eye(ask - 0.6, 1.0, { stance: "stand", look: across, pitch: 8, toLook: K("Yaowa"), toPitch: -6 });
  s.Cam(s.End("TankAmbush.01") + 0.4, 2.4, { from: { x: ME.x, z: ME.z, h: 1.62 }, to: { ...TP(T_CROSSING + 5.5, -0.2), h: 1.4 }, look: { actor: "Gunner", offset: [0, 0.9, 0] } });
  return s.Done({ durationS: s.End("TankAmbush.01") + 3.2 });
}

function S0504(ctx) {
  const s = new Seq(ctx, "05-4", "翻过坡顶下到干沟，回头：不撵了？");
  const K = id => KU(ctx, "05-4", id), K3 = id => KU(ctx, "05-3", id);
  const ME = KP(ctx, "05-4");
  const ramp = { x: PL.assemblyEntry.x, z: PL.assemblyEntry.z };
  // 两个人架着机枪手翻过坡顶、顺坡道下到干沟里，最后一个回来
  s.Place("Gunner", 0, K3("Gunner").x, K3("Gunner").z, { stance: "stand", woundedWalk: true });
  s.Place("Yaowa", 0, K3("Yaowa").x, K3("Yaowa").z, { stance: "stand" });
  const luo0 = TP(T_END - 3, 0.5), liu0 = TP(T_END - 1, -0.5);
  s.Place("Luo", 0, luo0.x, luo0.z, { yawDeg: 0 }); s.Place("LiuWencai", 0, liu0.x, liu0.z, { yawDeg: 0 });
  const enemies0 = [["TankInf1", RoadBack(9, -1.6)], ["TankInf2", RoadBack(12, 1.6)], ["TankInf3", RoadBack(15, -1.6)], ["IjaTrench2", TP(T_CROSSING - 13, -0.5)]];
  for (const [id, p] of enemies0) s.Place(id, 0, p.x, p.z, { stance: "stand", aim: false });
  const gEnd = K("Gunner"), yEnd = K("Yaowa");
  SupportGo(s, 0, 13.0, gEnd, { path: [TP(T_CREST, -0.45), ramp], faceTo: PL.assembly });
  void yEnd;
  s.Cam(0, 6.0, { from: { ...TP(T_CROSSING + 4, 0), h: 1.5 }, to: { ...TP(T_CREST, 0), h: 1.6 }, look: { actor: "Gunner", offset: [0, 1.0, 1.6] }, ease: "linear" });
  s.Cam(6.0, 6.8, { from: { ...TP(T_CREST, 0), h: 1.6 }, to: { x: ME.x, z: ME.z, h: 1.62 }, look: { actor: "Gunner", offset: [0, 1.0, 1.6] }, ease: "linear" });
  s.Caption(0.4, 3.0, "（顺子和幺娃一边一个架着机枪手翻坡顶，顺坡道下到干沟里）");
  // 鬼子绕过战车残骸、从桥东头绕过沟爬上坡顶，停在坡顶上架枪，没有追下来
  for (const [id] of enemies0) {
    const to = K(id);
    // 10-18 第三轮：桥面压断了，绕桥东头过沟（不从桥底、不穿横木端头），同 05-4 关键帧的 path
    s.Go(id, 3.0, 14.0, to.x, to.z, { move: "run", stance: "prone", aim: true, faceTo: PL.assembly, path: [...(id === "IjaTrench2" ? [TP(T_CROSSING - 11.4, 0), TP(T_CROSSING - 10.6, 5)] : []), ...BRIDGE_EAST_DETOUR] });
  }
  // 回头
  s.Eye(12.8, 1.4, { stance: "stand", yaw: 175, pitch: 0, toLook: PL.crest, toPitch: 14 });
  s.Eye(14.2, 4.0, { stance: "stand", look: PL.crest, pitch: 14 });
  s.Go("Luo", 3.0, 11.0, K("Luo").x, K("Luo").z, { move: "walk", yawDeg: 0 });
  s.Go("LiuWencai", 6.0, 11.0, K("LiuWencai").x, K("LiuWencai").z, { move: "walk", faceTo: PL.crest, clip: TALK_LOW });
  const q = s.Say("TankAmbush.02", "LiuWencai", 16.4);
  s.Eye(q + 1.6, 1.2, { stance: "stand", look: PL.crest, pitch: 14, toLook: K("Luo"), toPitch: 0 });
  s.Key("Luo", s.End("TankAmbush.02") + 0.1, { clip: "PvStandWaveOnL" });
  s.Say("TankAmbush.03", "Luo");
  s.Key("Luo", s.End("TankAmbush.03") + 0.4, { faceTo: PL.laneHead });
  // 10-20 弯沟：顺沟底往东（沿中心线到坑窝 A 东边那一弯），不抄直线翻坎
  const east1 = PointBeside(L0105_GULLY.line, 16, 0.6), east2 = PointBeside(L0105_GULLY.line, 14.5, -0.8);
  s.Go("Luo", s.End("TankAmbush.03") + 0.8, s.End("TankAmbush.03") + 6.0, east1.x, east1.z, { move: "walk", depart: { clip: null } });
  s.Go("LiuWencai", s.End("TankAmbush.03") + 1.2, s.End("TankAmbush.03") + 6.4, east2.x, east2.z, { move: "walk", depart: { clip: null } });
  return s.Done({ durationS: s.End("TankAmbush.03") + 5.4, then: "stay" });
}

// ---------------------------------------------------------------------------
// 2026-10-19 第二轮：不打仗的拍子里不说话的人歇着（用户：洞里、集结处不说话的人还平端着枪对着空气）

/**
 * 不打仗的拍子：01 防炮洞、02末集结处、03-1 交通沟里往回走。这些拍子里没人据枪（aim 一律 false），蹲着 / 跪着没在播片段的人
 * 播 PvCrouchRestRifle，sit 名单里的人（背后有洞壁）播 PvSitRestRifle。exempt：坡顶上守着的兵（CrestNra*，他们在打）、日军。
 * 0105 PrevizTest 的 RestBeatChecks 按同一张表查。
 */
export const PREVIZ_REST_BEATS = Object.freeze({
  "01-1": { sit: ["HeYoutian"] }, "01-2": { sit: ["HeYoutian"], clip: { Donggua: "WoundedSitRifleIdle" } }, "01-3": {},
  "02E-1": {}, "02E-2": {}, "03-1": {},
});
/** 干待着不到这么久（两个片段之间的空档）就不插歇着的片段（插进去只闪一下）。 */
const REST_MIN_S = 0.6;
export const RestExempt = (id, base) => /^Crest/.test(id) || base?.side === "ija";
const REST_CROUCH = "PvCrouchRestRifle", REST_SIT = "PvSitRestRifle";
let clipMetaCache = null;
/** 片段清单（开场库 + 预演额外库）：名字 → { duration, loop }，按运行时的口径算片段什么时候清掉。 */
export function PrevizClipMeta() {
  if (clipMetaCache) return clipMetaCache;
  const meta = new Map(Object.entries(LoadJson(join(HERE, "Animation/OpeningStoryboards/Data_OpeningStoryboardsAnimation.json")).clips));
  for (const lib of BLOCKOUT_PREVIZ_CLIP_LIBRARIES) {
    const file = join(HERE, lib.base, lib.manifest);
    if (existsSync(file)) for (const [name, m] of Object.entries(LoadJson(file).clips || {})) if (!meta.has(name)) meta.set(name, m);
  }
  return (clipMetaCache = meta);
}
export const PrevizClipDuration = clip => { const m = PrevizClipMeta().get(clip); return !m || m.loop === true ? null : m.duration ?? null; };
/** 这一刻是不是「蹲着、没在播片段、干待着」（会落到原生的端枪戒备）。 */
export function IdleCrouching(st) {
  return st.visible !== false && st.state !== "down" && !st.clip && !st.throw && !st.moving && st.stance === "crouch";
}
function RestPass(ctx, seq) {
  const rule = PREVIZ_REST_BEATS[seq.keyframe];
  if (!rule) return;
  const kf = ctx.config.keyframes.find(k => k.id === seq.keyframe);
  const humans = (kf.units || []).filter(u => !u.kind || u.kind === "soldier");
  for (const u of humans) if (!seq.actors.some(a => a.id === u.id)) seq.actors.push({ id: u.id, keys: [] });
  const norm = NormalizeBlockoutPreviz({ schema: "tengxian-blockout-previz/1", level: "FirstLevel0105", sequences: [seq] }).sequences[0];
  for (const a of seq.actors) {
    const base = a.spawn || humans.find(u => u.id === a.id);
    if (!base || RestExempt(a.id, base) || base.state === "down") continue;
    // 不据枪
    for (const k of a.keys) if (k.aim === true) k.aim = false;
    if (base.aim) a.keys.unshift({ t: 0, aim: false });
    const na = norm.actors.find(x => x.id === a.id);
    const rest = rule.clip?.[a.id] || ((rule.sit || []).includes(a.id) ? REST_SIT : REST_CROUCH);
    const add = [];
    let from = null;
    const step = 0.1, n = Math.ceil(seq.durationS / step);
    for (let i = 0; i <= n; i++) {
      const t = R(Math.min(seq.durationS, i * step));
      const idle = IdleCrouching(SamplePrevizActor(na, t, base, { clipDuration: PrevizClipDuration }));
      if (idle && from === null) from = t;
      if ((!idle || i === n) && from !== null) {
        if (t - from >= REST_MIN_S || i === n || from === 0) {
          add.push({ t: from, clip: rest });
          if (!idle && !a.keys.some(k => k.t > t - step - 1e-6 && k.t <= t + 1e-6 && k.clip !== undefined)) add.push({ t, clip: null });
        }
        from = null;
      }
    }
    a.keys.push(...add);
    a.keys.sort((p, q) => p.t - q.t);
  }
  seq.actors = seq.actors.filter(a => a.keys.length || a.spawn);
}

export const SEQUENCE_BUILDERS = Object.freeze([
  S0101, S0102, S0103, S0104, S0201, S0202, S0203, S0204, S0205, S0206, S0207, S02E1, S02E2,
  S0301, S0302, S0303, S0304, S0305, S0401, S0402, S0403, S0501, S0502, S0503, S0504,
]);

/** 生成整份预演文档（纯函数：只依赖传入的配置与台词清单）。 */
export function BuildPreviz({ config, voice }) {
  const ctx = { config, voice: VoiceIndex(voice) };
  const sequences = SEQUENCE_BUILDERS.map(build => build(ctx));
  for (const seq of sequences) RestPass(ctx, seq);
  const order = config.keyframes.map(k => k.id);
  sequences.sort((a, b) => order.indexOf(a.keyframe) - order.indexOf(b.keyframe));
  return {
    schema: "tengxian-blockout-previz/1",
    level: "FirstLevel0105",
    title: "第一关 01–05 预演（占位动作 + 占位配音）",
    source: { generator: "node Taierzhuang1938/Script_EditorBlockoutFirstLevel0105Previz.mjs --force", note: "剧本 Notion 01–05（10-18 定稿）；手改前先想好：重跑生成器会覆盖" },
    voice: "./Blockout/FirstLevel0105.voice.json",
    faceTracks: "./Audio/Blockout0105/Data_Blockout0105FaceTracks.json",
    sequences,
  };
}

// ---------------------------------------------------------------------------
// 命令行

async function Main(argv) {
  const config = LoadJson(CONFIG_FILE), voice = LoadJson(VOICE_FILE);
  const doc = BuildPreviz({ config, voice });
  const { CheckPreviz } = await import("./Script_EditorBlockoutFirstLevel0105PrevizTest.mjs");
  const report = await CheckPreviz(doc, { config, voice });
  for (const w of report.warnings) console.log("警告：" + w);
  for (const e of report.errors) console.log("错误：" + e);
  if (argv.includes("--report")) for (const row of report.rows) console.log(row);
  console.log(`预演 ${doc.sequences.length} 段，总长 ${R(doc.sequences.reduce((a, s) => a + s.durationS, 0))} s；错误 ${report.errors.length}，警告 ${report.warnings.length}`);
  if (report.errors.length) { process.exitCode = 1; return; }
  if (argv.includes("--force")) {
    const text = JSON.stringify(doc, null, 1) + "\n";
    writeFileSync(PREVIZ_FILE, text);
    console.log(`已写 ${PREVIZ_FILE}（${text.length} 字节）`);
  } else if (existsSync(PREVIZ_FILE)) console.log("已有预演文件；加 --force 才覆盖");
  else console.log("加 --force 写出");
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) Main(process.argv.slice(2));
