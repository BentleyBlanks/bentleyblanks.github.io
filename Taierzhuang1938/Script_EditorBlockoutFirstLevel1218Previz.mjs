// ===========================================================================
// Script_EditorBlockoutFirstLevel1218Previz.mjs —— 第一关 12–18 白盒（FirstLevel1218）的预演数据生成器
//
//   node Taierzhuang1938/Script_EditorBlockoutFirstLevel1218Previz.mjs            → 只校验、打印摘要，不写
//   node Taierzhuang1938/Script_EditorBlockoutFirstLevel1218Previz.mjs --force    → 写 Blockout/FirstLevel1218.previz.json
//   node Taierzhuang1938/Script_EditorBlockoutFirstLevel1218Previz.mjs --report   → 另打印每段一行摘要与用到的片段
//
// 格式：docs/Data_EditorBlockout.md §14（tengxian-blockout-previz/1）。剧本口径：集成负责人 2026-10-19 的 12–18 扩写稿
// （scratchpad Script_1218_Draft.md，还没进 Notion）；空间口径：Data_EditorBlockoutFirstLevel1218Space.mjs；
// 布设：Blockout/FirstLevel1218.json（只读，单位 id 与位置以它为准）。
// 台词：Blockout/FirstLevel1218.voice.json 的句子 id；时长每次从清单读（配音补录后重跑 --force 就行），同一段里按录音的
// 原始间隔 gapBeforeS 往后排（只会拉长、不会压短）。写法完全照 Script_EditorBlockoutFirstLevel0610Previz.mjs（那份文件不动）。
//
// 片段按骨架：有 castId 的单位骨架固定，只给它那具骨架烘过的片段；没有 castId 的士兵只用五具骨架都有的通用片段；
// 百姓（老耿 / 妮儿 / 百姓 / 舀水的）和军官（桥头军官）是程序化身体，没有动作库 —— 一律不给 clip，用走位 / 姿态 / 说明字顶
// （缺口清单见 docs/Data_EditorBlockout.md §16 末尾与本次报告）。
//
// 镜头大半是顺子的眼睛（eye）；走着说、跟拍、过桥跑用 from/to（运行时锚点按 standAt 取地面：浮桥桥面是 ≤1 m 的块顶，
// 眼睛跟着桥面走，不掉进桥底的浅滩）。玩家要按键的时刻（Z 卧倒、按住放担架、F 数铜板、打机枪）用说明字标出，不出按键。
// 18-5 开头的日期字幕用 NORTH_GATE_DATE（14 还是 15 日用户没定，先写 14）。
//
// 确定性：不读时钟、不读 git、没有随机数；同样的输入两次输出逐字相同。
// ===========================================================================

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  L1218_PLACES as PL, L1218_DITCH as DT, L1218_BRIDGE as BR, L1218_BRIDGEHEAD as BH, L1218_YARD as Y, L1218_SIGNALS as SIG,
  L1218_SOUTH as SO, L1218_ROAD as RD, L1218_FROM_0610 as FROM0610,
} from "./Data_EditorBlockoutFirstLevel1218Space.mjs";
import { StreetRoute, DitchPoint } from "./Script_EditorBlockoutFirstLevel1218Keyframes.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
export const PREVIZ_FILE = join(HERE, "Blockout", "FirstLevel1218.previz.json");
const CONFIG_FILE = join(HERE, "Blockout", "FirstLevel1218.json");
const VOICE_FILE = join(HERE, "Blockout", "FirstLevel1218.voice.json");

/** 18-5 黑场上的日期字幕（14 还是 15 日用户还没定，先写 14；改这里就行）。 */
export const NORTH_GATE_DATE = "1938年3月14日";
export const NORTH_GATE_CAPTION = `${NORTH_GATE_DATE} 夜｜滕县北门`;

// ---------------------------------------------------------------------------
// 小工具

const R = v => Math.round(v * 100) / 100;
/** 朝向：0 北（−Z），+90 西，−90 东。 */
export function Yaw(from, to) { return R(Math.atan2(-(to.x - from.x), -(to.z - from.z)) * 180 / Math.PI); }
const Dist = (a, b) => Math.hypot(b.x - a.x, b.z - a.z);
const Pt = (x, z) => ({ x: R(x), z: R(z) });
const Off = (p, dx, dz) => Pt(p.x + dx, p.z + dz);
const ROAD_Z = RD.line[0].z;
/** 大路上按 x 取点（lat > 0 = 路南）。 */
const RP = (x, lat = 0) => Pt(x, ROAD_Z + lat);
/** 排水沟中线上按 x 取点（lat > 0 = 南）。 */
const DP = (x, lat = 0) => { const p = DitchPoint(x, lat); return Pt(p.x, p.z); };
/** 浮桥 / 南岸路上按 z 取点（lat > 0 = 东）。 */
const BP = (z, lat = 0) => Pt(BR.x + lat, z);
/** 沿路网排的途经点（不含起点，含终点）→ { path, end }。 */
function Route(a, b) { const r = StreetRoute(a, b); return { path: r.slice(0, -1), end: r[r.length - 1] }; }
function RouteLen(a, pts) { let len = 0, cur = a; for (const p of pts) { len += Dist(cur, p); cur = p; } return len; }

function LoadJson(file) { return JSON.parse(readFileSync(file, "utf8")); }

/** 台词清单 → Map(id → {durationS, gapBeforeS, who, speaker, subtitle}) */
export function VoiceIndex(voice) {
  const map = new Map();
  for (const scene of voice?.scenes || []) for (const l of scene.lines || []) map.set(l.id, l);
  return map;
}

/** 其它关键帧里某单位的布设位置。 */
function KU(ctx, kfId, id) {
  const u = ctx.config.keyframes.find(k => k.id === kfId)?.units.find(x => x.id === id);
  if (!u) throw new Error(`关键帧 ${kfId} 里没有 ${id}`);
  return u;
}
const KP = (ctx, kfId) => ctx.config.keyframes.find(k => k.id === kfId).player;
/** 某关键帧里某个 group 的全部单位 id（按布设顺序）。 */
const KG = (ctx, kfId, group) => ctx.config.keyframes.find(k => k.id === kfId).units.filter(u => u.group === group).map(u => u.id);

// ---------------------------------------------------------------------------
// 序列构造器（同 0610）

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
    return this.Key(id, tArrive, { x, z, move, ...(path && path.length ? { path } : {}), ...fields });
  }
  /** 直线挪一段（dx, dz）：成群往前走用。 */
  Shift(id, tDepart, tArrive, dx, dz, fields = {}) {
    const cur = this.pos.get(id);
    return this.Go(id, tDepart, tArrive, cur.x + dx, cur.z + dz, fields);
  }
  /** 沿路网走到 (x,z)：按自然速度算到达时刻（给了 tArrive 就用它）。返回到达时刻。 */
  Walk(id, tDepart, to, { move = "walk", speed = null, tArrive = null, ...rest } = {}) {
    const cur = this.pos.get(id);
    const { path, end } = Route(cur, to);
    const len = RouteLen(cur, [...path, end]);
    const mps = speed ?? ({ walk: 1.4, run: 3.5, crawl: 0.5, drag: 0.9 }[move] || 1.4);
    const t1 = R(tArrive ?? (tDepart + len / mps));
    this.Go(id, tDepart, t1, end.x, end.z, { move, path, ...rest });
    return t1;
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
  Signal(t, name, on) { return this.Ev(t, "signal", { name, on }); }
  /** 第一人称镜头：顺子的眼睛。look / toLook 给了就换算朝向。 */
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
  /** 第一人称走一段（镜头从 a 平移到 b，看着 look，可换到 lookTo）：用 Cam 顶替眼睛的位移。 */
  WalkEye(t, dur, a, b, look, { lookTo, h = 1.55, lookH = 1.0, fov, shake, ease = "linear" } = {}) {
    const L = p => (p.actor ? p : { ...p, h: p.h ?? lookH });
    return this.Cam(t, dur, { from: { ...a, h }, to: { ...b, h }, look: L(look), ...(lookTo ? { lookTo: L(lookTo) } : {}), ease, ...(fov ? { fov } : {}), ...(shake ? { shake } : {}) });
  }
  Done({ durationS, then = "next" }) {
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

// ---------------------------------------------------------------------------
// 常用点与小段落

const GENG_SMOKE = Pt(PL.gengSmoke.x, PL.gengSmoke.z);
const MG_POST_0610 = Pt(FROM0610.geng.mgPost.x, FROM0610.geng.mgPost.z);   // 12-1 身后村里还在打的那挺机枪（老耿家北窗）
const MOUTH = Pt(PL.ditchMouth.x, PL.ditchMouth.z);
const OUTLET = Pt(PL.ditchOutlet.x, PL.ditchOutlet.z);
const YARD_GATE = Pt(PL.yardGate.x, PL.yardGate.z);
const XIANG_DOOR = Pt(PL.xiangDoor.x, PL.xiangDoor.z);
const INSIDE = Pt(Y.dongguaInside.x, Y.dongguaInside.z);
const SEAT = Pt(Y.thresholdSeat.x, Y.thresholdSeat.z);
const GATE_LAMP = Pt(Y.gateLamp.x, Y.gateLamp.z);
const RAIL_BLAST = Pt(PL.railBlast.x, PL.railBlast.z);
const MG = Pt(PL.ijaMg.x, PL.ijaMg.z);
const MORTAR = Pt(PL.ijaMortar.x, PL.ijaMortar.z);
const LAST_COVER = Pt(PL.lastGroupCover.x, PL.lastGroupCover.z);
const BRIDGE_MID = BP((BR.northFootZ + BR.southFootZ) / 2);
const NORTH_GATE = Pt(PL.northGate.x, PL.northGate.z);
const SUN = Pt(PL.sunWest.x, PL.sunWest.z);
const SKY_EAST = { x: 40, z: 596, h: 30 };     // 「往天上看」：东边天上

/** 子弹打在土里（小土点）。 */
function Puff(s, t, p) { return s.Ev(t, "explosion", { x: p.x, z: p.z, kind: "grenade", radius: 0.8 }); }
/** 某人开一枪（枪口火 + 枪声）。 */
function Shot(s, t, actor, { count = 1, interval, sfx = "rifleShot", at, volume } = {}) {
  s.Ev(t, "muzzle", { actor, ...(count > 1 ? { count, interval: interval ?? 0.11 } : {}) });
  const p = at || (actor === "player" ? s.player : s.pos.get(actor));
  if (sfx) s.Sfx(t, sfx, { ...(p ? { x: R(p.x), z: R(p.z) } : {}), ...(volume !== undefined ? { volume } : {}) });
  return s;
}
/**
 * 一串弹着从 xFrom 犁到 xTo（沿大路、z 固定、略有左右）：每 2.6 m 一团小土，40 m/s。
 * 返回函数 At(x) → 弹着经过 x 的时刻。
 */
function Strafe(s, t0, xFrom, xTo, z, { step = 2.6, mps = 40 } = {}) {
  const dir = xTo > xFrom ? 1 : -1;
  const n = Math.floor(Math.abs(xTo - xFrom) / step);
  for (let i = 0; i <= n; i++) {
    const x = xFrom + dir * step * i;
    const lat = (((i * 7) % 5) - 2) * 0.22;
    Puff(s, t0 + Math.abs(x - xFrom) / mps, Pt(x, z + lat));
  }
  return x => R(t0 + Math.abs(x - xFrom) / mps);
}
/** 掷弹筒一发：嘭（远处冒烟）→ 5.5 s 后落地。效果挂落地。返回落地时刻。 */
function Mortar(s, tPop, hit, { kind = "launcher", radius = 3.5, shake = 0.4 } = {}) {
  s.Sfx(tPop, "mortarPop", { x: MORTAR.x, z: MORTAR.z, volume: 0.7 });
  s.Ev(tPop, "smoke", { x: MORTAR.x, z: MORTAR.z + 1.2, kind: "SmokeWhite", dur: 4 });
  const tHit = tPop + 5.5;
  s.Sfx(tHit, "mortarImpact", { x: hit.x, z: hit.z });
  s.Ev(tHit, "explosion", { x: hit.x, z: hit.z, kind, radius });
  if (shake) s.Shake(tHit, 0.5, shake);
  return R(tHit);
}
/** 大路东边那挺鬼子机枪打一梭（朝桥头）；puffs：弹着点。 */
function MgBurst(s, t, { count = 8, volume = 0.8, puffs = [] } = {}) {
  s.Ev(t, "muzzle", { actor: "IjaMg", count, interval: 0.1 });
  s.Sfx(t, "mgBurstFar", { x: MG.x, z: MG.z, volume });
  puffs.forEach((p, i) => Puff(s, t + 0.3 + i * 0.12, p));
  return R(t + count * 0.1);
}
/** 飞机的声音：从哪个方向、多响。 */
function Plane(s, t, name, at, volume) { return s.Sfx(t, name, { x: R(at.x), z: R(at.z), volume }); }

// ---------------------------------------------------------------------------
// 12 车边

function S1201(ctx) {
  const s = new Seq(ctx, "12-1", "出村：机枪停了、「轰」一声");
  const P = KP(ctx, "12-1");
  const group = ["GengCart", "Heizi", "LitterDonggua", "Donggua", "Nier", "LiuWencai", ...KG(ctx, "12-1", "convoy").filter(id => id !== "LitterDonggua")];
  // 第一段：顺着出村小路往南走 17 m（t 1 → 13.2）；老耿在「轰」那一下顿住、回头，再追上去
  const T1 = 1.0, T2 = 13.2, D1 = 17.0;
  for (const id of group) s.Shift(id, T1, T2, 0, D1);
  const gengStop = 10.4;
  const gengWalked = D1 * (gengStop - T1) / (T2 - T1);
  s.Shift("Geng", T1, gengStop, 0, gengWalked);
  s.Caption(0.3, 3.6, "（出了老耿家后门，是一条顺着北沙河往西的土路；太阳压在西边桥头那几间房上）");
  // 身后村里机枪一梭一梭，然后停了
  for (const t of [1.2, 3.4, 5.9]) s.Sfx(t, "mgBurstFar", { x: MG_POST_0610.x, z: MG_POST_0610.z, volume: 0.45 });
  s.Caption(7.6, 2.4, "（身后村子里的机枪声停了）");
  // 又走一段，「轰」一声闷响：老耿家那个方向冒烟
  const boom = 10.0;
  s.Sfx(boom, "grenadeBlast", { x: GENG_SMOKE.x, z: GENG_SMOKE.z, volume: 0.7 });
  s.Ev(boom, "explosion", { x: GENG_SMOKE.x, z: GENG_SMOKE.z, kind: "grenade", radius: 3, h: 1.0 });
  s.Ev(boom + 0.2, "smoke", { x: GENG_SMOKE.x, z: GENG_SMOKE.z + 1, kind: "SmokeBlack", dur: 22 });
  s.Shake(boom, 0.5, 0.15);
  s.Caption(boom + 0.3, 3.4, "（又走一段，「轰」一声闷响：老耿家那个方向冒起一股烟）");
  s.Key("Geng", gengStop + 0.2, { faceTo: GENG_SMOKE });
  s.Caption(12.4, 3.0, "（老耿没吭声，拿鞭杆在黑子屁股上搭了一下，接着走）");
  // 眼睛：跟着车走；「轰」时回头看村子，再看老耿，再顺着大路往西看
  const eye0 = Pt(P.x, P.z);
  const zAt = t => eye0.z + D1 * (t - T1) / (T2 - T1);
  s.Eye(0, T1, { stance: "stand", look: Pt(98, 612), pitch: -2 });
  s.WalkEye(T1, gengStop - T1, eye0, Pt(eye0.x, zAt(gengStop)), { actor: "GengCart", offset: [0, 0.9, 0] });
  s.WalkEye(gengStop, 1.6, Pt(eye0.x, zAt(gengStop)), Pt(eye0.x, zAt(12.0)), { actor: "GengCart", offset: [0, 0.9, 0] }, { lookTo: { ...GENG_SMOKE, h: 4 }, ease: "inOut" });
  s.WalkEye(12.0, T2 - 12.0, Pt(eye0.x, zAt(12.0)), Pt(eye0.x, zAt(T2)), { ...GENG_SMOKE, h: 4 });
  // 第二段：到路口往西拐（t 13.2 → 22）；后送队继续顺小路往南
  const T3 = 22.0;
  const west = [["GengCart", RP(88.5)], ["Heizi", RP(86.0)], ["LitterDonggua", RP(91.0, -0.6)], ["Donggua", RP(91.0, -0.6)], ["Nier", RP(90.9, 0.6)], ["LiuWencai", Pt(93.4, 614.8)]];
  for (const [id, to] of west) s.Walk(id, T2, to, { tArrive: T3, ...(id === "LiuWencai" || id === "Nier" ? {} : { yawDeg: 90 }) });
  s.Walk("Geng", T2, Pt(86.6, 610.6), { tArrive: T3, yawDeg: 90 });
  for (const id of KG(ctx, "12-1", "convoy").filter(id => id !== "LitterDonggua")) s.Shift(id, T2, T3 - 0.4, 0, 12.0);
  s.WalkEye(T2, 2.0, Pt(eye0.x, zAt(T2)), Pt(99.4, 611.6), { ...GENG_SMOKE, h: 4 }, { lookTo: { actor: "Geng", offset: [0, 1.3, 0] }, ease: "inOut" });
  s.WalkEye(T2 + 2.0, T3 - T2 - 2.0, Pt(99.4, 611.6), Pt(93.6, 613.8), { actor: "Geng", offset: [0, 1.3, 0] }, { lookTo: { x: 40, z: 612, h: 1.2 }, ease: "inOut" });
  // 刘文财问一句、老耿答一句（边走边说）；「推门了」那句 10-19 删了（RoadWest.01 留在台词表里只为切句对齐）
  s.Say("RoadWest.02", "LiuWencai", 17.0);
  s.Say("RoadWest.03", "Geng");
  s.Eye(T3, 3.0, { stance: "stand", x: 93.6, z: 613.8, look: Pt(40, 612), pitch: -1 });
  return s.Done({ durationS: T3 + 3.0 });
}

function S1202(ctx) {
  const s = new Seq(ctx, "12-2", "短褂：妮儿拽袖子，老耿脱棉袄");
  const P = KP(ctx, "12-2");
  const group = ["GengCart", "Heizi", "Geng", "LitterDonggua", "Donggua", "Nier", "LiuWencai", ...KG(ctx, "12-2", "convoy").filter(id => id !== "LitterDonggua")];
  // 走着：往西 5.6 m
  const D1 = 5.6, T1 = 0.4, T2 = 4.4;
  for (const id of group) s.Shift(id, T1, T2, -D1, 0);
  const eye0 = Pt(P.x, P.z), eye1 = Pt(P.x - D1, P.z);
  s.WalkEye(0, T2, eye0, eye1, { x: 0, z: 613, h: 1.2 });
  s.Caption(0.3, 3.8, "（冬瓜在车上抖得牙齿咯咯响，被角滑下去一半；妮儿四下找东西给他盖）");
  // 背后被扯了一下：说明字 + 轻微震屏，回头是妮儿攥着那截蓝布袖子
  const tug = T2;
  s.Caption(tug, 1.8, "（背后被扯了一下）");
  s.Shake(tug, 0.4, 0.25);
  const nier = Pt(KU(ctx, "12-2", "Nier").x - D1, KU(ctx, "12-2", "Nier").z);
  const dong = Pt(KU(ctx, "12-2", "Donggua").x - D1, KU(ctx, "12-2", "Donggua").z);
  s.Eye(tug, 2.0, { stance: "stand", x: eye1.x, z: eye1.z, look: Pt(0, 613), pitch: 0, toLook: nier, toPitch: -14 });
  s.Caption(tug + 1.8, 2.2, "（妮儿两只手攥着那截蓝布袖子往外拽，短褂已经出来一半）");
  // 短过场：侧拍车尾——顺子替身攥她手腕夺回来，她跌坐在车板上
  const cut = tug + 2.0, cutEnd = cut + 5.5;
  s.Spawn("ShunziDouble", { side: "nra", x: eye1.x, z: eye1.z, yawDeg: Yaw(eye1, nier), name: "顺子（替身）" }, { visible: false });
  s.Key("ShunziDouble", cut, { visible: true });
  s.Cam(cut, cutEnd - cut, { from: { x: eye1.x + 3.4, z: eye1.z + 2.0, h: 1.45 }, to: { x: eye1.x + 2.6, z: eye1.z + 1.6, h: 1.4 }, look: { actor: "Nier", offset: [0, 0.9, 0] }, fov: 48, ease: "inOut" });
  s.Go("ShunziDouble", cut + 0.2, cut + 0.8, nier.x + 0.3, nier.z + 0.9, { move: "walk", faceTo: "Nier", clip: "CollarControl" });
  s.Say("ShortJacket.01", null, cut + 0.9);
  s.Caption(cut + 0.6, 2.2, "（顺子一把攥住她的手腕；她听不见，眼睛盯着冬瓜，还在拽）");
  s.Key("ShunziDouble", cut + 3.4, { clip: null });
  s.Go("Nier", cut + 3.4, cut + 4.0, nier.x - 0.4, nier.z - 0.3, { move: "walk", faceTo: "Donggua" });
  s.Caption(cut + 3.2, 2.2, "（顺子硬把短褂夺回来，她攥不住，往后跌坐在车板上）");
  s.Key("Geng", cut + 0.6, { faceTo: "Nier" });
  s.Key("Geng", cut + 3.6, { faceTo: "Donggua" });
  s.Caption(cut + 5.4, 3.0, "（顺子把短褂团成一团塞回包底，勒紧包口。伸进画面的还是 09 捂她嘴的那只手）");
  // 切回眼睛：老耿把鞭子往车辕上一插，脱棉袄扔到冬瓜身上
  s.Key("ShunziDouble", cutEnd, { visible: false });
  s.Eye(cutEnd, 4.0, { stance: "stand", x: eye1.x, z: eye1.z, look: nier, pitch: -14, toLook: dong, toPitch: -16 });
  s.Caption(cutEnd + 3.0, 4.4, "（老耿把鞭子往车辕上一插，解开棉袄脱下来，往冬瓜身上一扔，盖严了。他身上只剩一件单褂子）");
  s.Eye(cutEnd + 4.0, 10.0, { stance: "stand", x: eye1.x, z: eye1.z, look: dong, pitch: -16 });
  const thanks = s.Say("PaddedCoat.01", "Donggua", cutEnd + 7.8);
  const noThanks = s.Say("PaddedCoat.02", "Geng");
  // 老耿没回头，边说边走回车头
  const headAt = Pt(KU(ctx, "12-2", "Heizi").x - D1 + 1.1, 610.6);
  s.Go("Geng", noThanks - 0.2, noThanks + 1.6, headAt.x, headAt.z, { move: "walk", yawDeg: 90 });
  // 冬瓜的眼睛又挪到顺子的背包上：临城再换……查得紧……
  const look = s.End("PaddedCoat.02") + 0.4;
  s.Caption(look, 3.4, "（冬瓜的眼睛又挪到顺子的背包上，就是短褂刚塞进去的地方）");
  const lincheng = s.Say("Lincheng.01", "Donggua", look + 1.0);
  const ask = s.Say("Lincheng.02", "LiuWencai");
  const liu = Pt(KU(ctx, "12-2", "LiuWencai").x - D1, KU(ctx, "12-2", "LiuWencai").z);
  s.Key("LiuWencai", ask - 0.3, { faceTo: "player" });
  s.Eye(ask - 0.4, 0.8, { stance: "stand", x: eye1.x, z: eye1.z, look: dong, pitch: -16, toLook: liu, toPitch: -2 });
  s.Say("Lincheng.03", null);
  s.Eye(ask + 0.4, s.End("Lincheng.03") - ask - 0.4 + 1.2, { stance: "stand", x: eye1.x, z: eye1.z, look: liu, pitch: -2, toLook: Pt(0, 613), toPitch: 0 });
  s.Caption(s.End("Lincheng.03") + 0.3, 2.0, "（刘文财没再问）");
  // 接着走
  const go = s.End("Lincheng.03") + 1.2, D2 = 8.0, T4 = go + D2 / 1.4;
  s.Key("LiuWencai", go - 0.2, { yawDeg: 90 });
  for (const id of group) s.Shift(id, go, T4, -D2, 0, { yawDeg: 90 });
  s.WalkEye(go, T4 - go, eye1, Pt(eye1.x - D2, eye1.z), { x: 0, z: 613, h: 1.2 });
  void thanks; void lincheng;
  return s.Done({ durationS: T4 + 0.4 });
}

function S1203(ctx) {
  const s = new Seq(ctx, "12-3", "犟种：妮儿牵驴走在最前头；桥窄");
  const P = KP(ctx, "12-3");
  const K = id => KU(ctx, "12-3", id);
  const nierHead = Pt(K("Nier").x, K("Nier").z);
  const cart = Pt(K("GengCart").x, K("GengCart").z);
  // 开场妮儿还在车尾；从车尾溜下去，绕过车南边跑到驴头前抢缰绳
  const tail = Pt(cart.x + 2.0, cart.z + 0.9);
  s.Place("Nier", 0, tail.x, tail.z, { faceTo: nierHead });
  s.Go("Nier", 1.0, 2.9, nierHead.x, nierHead.z, { move: "run", path: [Pt(cart.x, cart.z + 1.7), Pt(cart.x - 2.6, cart.z + 1.5)], faceTo: "Heizi" });
  s.Key("Geng", 2.9, { faceTo: "Nier" });
  s.Eye(0, 3.0, { stance: "stand", yaw: 90, pitch: -2, toLook: nierHead, toPitch: -4 });
  s.Caption(0.6, 3.2, "（妮儿从车尾溜下去不坐车了，跑到前头去抢老耿手里的缰绳）");
  s.Eye(3.0, 10.0, { stance: "stand", look: nierHead, pitch: -4 });
  s.Caption(4.0, 4.0, "（老耿不给，她就两只手攥着笼头不撒，脚在土里蹬）");
  s.Caption(8.2, 2.6, "（老耿掰了两下没掰开，松了手）");
  s.Say("StubbornMule.01", "Geng", 9.4);
  s.Say("StubbornMule.02", null);
  s.Caption(s.End("StubbornMule.02") + 0.2, 2.2, "（她牵着黑子走在最前头，个子还没驴头高）");
  // 越往西人越多：车走一阵停一阵（两段挪动，中间停一会儿）
  const go = Math.max(13.0, s.End("StubbornMule.02") + 1.6);
  const group = ["Nier", "Heizi", "GengCart", "Geng", "LitterDonggua", "Donggua", "LiuWencai", ...KG(ctx, "12-3", "convoy").filter(id => id !== "LitterDonggua")];
  const D1 = 8.4, T1 = go, T2 = go + D1 / 1.4, T3 = T2 + 4.0, D2 = 7.0, T4 = T3 + D2 / 1.4;
  for (const id of group) { s.Shift(id, T1, T2, -D1, 0, { yawDeg: 90 }); s.Shift(id, T3, T4, -D2, 0, { yawDeg: 90 }); }
  const eye0 = Pt(P.x, P.z), eye1 = Pt(P.x - D1, P.z), eye2 = Pt(P.x - D1 - D2, P.z);
  s.WalkEye(T1, T2 - T1, eye0, eye1, { x: -60, z: 612, h: 1.2 });
  s.Eye(T2, T3 - T2, { stance: "stand", x: eye1.x, z: eye1.z, yaw: 90, pitch: 0 });
  s.WalkEye(T3, T4 - T3, eye1, eye2, { x: -60, z: 612, h: 1.2 });
  s.Caption(T1 + 0.5, 5.0, "（越往西路上人越多：别处撤下来的担架、牛车、背着伤员的兵、挑着铺盖的老百姓，都往桥头挤）");
  s.Caption(T2 + 0.2, 3.0, "（车走一阵停一阵）");
  s.Say("BridgeJam.01", "QWalker01", T2 + 0.4);
  s.Say("BridgeJam.02", "QWalker02");
  // 太阳落到桥那头去了；东边天上嗡嗡响
  const dusk = T4;
  s.Eye(dusk, 3.0, { stance: "stand", x: eye2.x, z: eye2.z, yaw: 90, pitch: 0, toLook: SUN, toPitch: 6 });
  s.Caption(dusk + 0.4, 5.0, "（太阳落到桥那头去了，天边一片红，路上的人都成了黑影子。冬瓜在棉袄底下越抖越凶）");
  s.Eye(dusk + 3.0, 3.0, { stance: "stand", x: eye2.x, z: eye2.z, look: SUN, pitch: 6 });
  Plane(s, dusk + 5.0, "planeDrone", Pt(150, 590), 0.35);
  s.Eye(dusk + 6.0, 4.0, { stance: "stand", x: eye2.x, z: eye2.z, look: SUN, pitch: 6, toYaw: -84, toPitch: 14 });
  s.Caption(dusk + 6.2, 4.0, "（东边天上，嗡嗡声由小变大）");
  Plane(s, dusk + 8.6, "planeDrone", Pt(110, 596), 0.55);
  s.Eye(dusk + 10.0, 2.0, { stance: "stand", x: eye2.x, z: eye2.z, yaw: -84, pitch: 14 });
  return s.Done({ durationS: dusk + 12.0 });
}

// ---------------------------------------------------------------------------
// 13 空袭

function S1301(ctx) {
  const s = new Seq(ctx, "13-1", "第一轮：飞机！趴倒！");
  const P = KP(ctx, "13-1");
  const K = id => KU(ctx, "13-1", id);
  const K2 = id => KU(ctx, "13-2", id);
  const nier = Pt(K("Nier").x, K("Nier").z), cart = Pt(K("GengCart").x, K("GengCart").z);
  // 开场大家还站着（关键帧里已经趴下，这里从「声音先到」演起）：刘文财、老耿、离玩家最近的那个担架员
  s.Key("LiuWencai", 0, { stance: "stand", faceTo: nier });
  s.Key("Geng", 0, { stance: "stand", faceTo: nier });
  s.Key("Walker01", 0, { stance: "stand", yawDeg: -90 });
  Plane(s, 0, "planeDrone", Pt(60, 598), 0.7);
  s.Eye(0, 2.6, { stance: "stand", x: P.x, z: P.z - 0.6, look: cart, pitch: 0 });
  s.Caption(0.4, 2.6, "（声音先到，路上的人一个接一个抬头）");
  Plane(s, 2.4, "planeDive", Pt(40, 600), 0.9);
  // 回头往东北的天上看（北边浅沟里那个担架员正抬头喊）
  s.Eye(2.6, 0.9, { stance: "stand", x: P.x, z: P.z - 0.6, look: cart, pitch: 0, toYaw: -40, toPitch: 18 });
  s.Eye(3.5, 1.5, { stance: "stand", x: P.x, z: P.z - 0.6, yaw: -40, pitch: 18 });
  s.Say("AirRaidWarning.01", "Walker01", 3.4);
  s.Caption(4.4, 1.4, "（Z 卧倒）");
  // 眼睛压低到趴
  s.Cam(5.0, 0.8, { from: { x: P.x, z: P.z - 0.4, h: 1.5 }, to: { x: P.x, z: P.z, h: 0.36 }, look: { actor: "Nier", offset: [0, 0.8, 0] }, ease: "inOut", shake: 0.2 });
  for (const id of ["LiuWencai", "Geng", "Walker01"]) s.Key(id, 5.2, { stance: "prone" });
  s.Caption(5.8, 1.8, "（人往路两边的浅沟里扑；担架来不及抬下路，搁在路上。妮儿还站在路当中攥着黑子的笼头）");
  // 两架日机从身后顺着大路压下来：一串弹着从路那头犁过来，从白布担架中间穿过去，经过妮儿刚才站的地方、扫过黑子
  const t0 = 7.4;
  Plane(s, t0 - 0.6, "strafeFar", Pt(20, 612), 0.7);
  const At = Strafe(s, t0, 24, -40, ROAD_Z);
  s.Caption(7.6, 1.8, "（两架日机从身后顺着大路压下来，一串弹着点从路那头一路犁过来）");
  Plane(s, At(-6), "strafeNear", Pt(-8, 612), 1.0);
  Plane(s, At(-14), "strafeDirt", Pt(-14, 613), 0.9);
  s.Shake(At(-4), 1.2, 0.45);
  // 刘文财从北边浅沟跳出去拦腰抱住她，两个人一起滚进路沟（弹着紧跟着从她刚才站的地方扫过去）
  const liuAt = Pt(nier.x + 0.7, nier.z - 0.3);
  s.Go("LiuWencai", 5.6, 8.0, liuAt.x, liuAt.z, { move: "run", depart: { stance: "stand" }, clip: "PullComrade", faceTo: "Nier" });
  s.Key("LiuWencai", 8.1, { clip: null });
  const liuDown = Pt(K2("LiuWencai").x, K2("LiuWencai").z), nierDown = Pt(K2("Nier").x, K2("Nier").z);
  s.Go("LiuWencai", 8.1, 9.1, liuDown.x, liuDown.z, { move: "run", stance: "prone", faceTo: "Nier" });
  s.Go("Nier", 8.1, 9.2, nierDown.x, nierDown.z, { move: "run", stance: "prone", faceTo: "Heizi" });
  // 扫过黑子、扫过车：车翻进路边，担架连人甩出去，冬瓜摔在车旁的土里
  const hit = At(cart.x);
  s.Ev(hit, "explosion", { x: cart.x, z: cart.z + 0.4, kind: "grenade", radius: 1.2, h: 0.3 });
  s.Key("Heizi", hit + 0.05, { state: "down" });
  s.Place("Heizi", hit + 0.1, K2("Heizi").x, K2("Heizi").z, { yawDeg: K2("Heizi").yawDeg });
  s.Signal(hit + 0.1, SIG.cartOverturned, true);
  s.Key("GengCart", hit + 0.1, { visible: false });
  s.Place("Donggua", hit + 0.2, K2("Donggua").x, K2("Donggua").z, { yawDeg: K2("Donggua").yawDeg, lie: "along" });
  s.Place("LitterDonggua", hit + 0.2, K2("LitterDonggua").x, K2("LitterDonggua").z, { yawDeg: K2("LitterDonggua").yawDeg });
  s.Sfx(hit + 0.2, "bodyFall", { x: cart.x + 1.5, z: cart.z, volume: 0.8 });
  s.Caption(hit + 0.3, 3.2, "（黑子惨叫着往旁边一挣，车翻进路边，车板上的担架连人一起甩出去，冬瓜摔在车旁的土里）");
  // 眼睛趴着：先看妮儿，弹着过来时顺着看向车
  s.Eye(5.8, 2.2, { stance: "prone", look: nier, pitch: 4 });
  s.Eye(8.0, 1.6, { stance: "prone", look: nier, pitch: 4, toLook: cart, toPitch: 3, shake: 0.3 });
  s.Eye(9.6, 5.4, { stance: "prone", look: cart, pitch: 3 });
  Plane(s, 9.8, "planeDive", Pt(-60, 600), 0.6);
  Plane(s, 12.2, "planeDrone", Pt(-110, 598), 0.4);
  s.Caption(hit + 3.6, 2.2, "（飞机拉起来，往西去了）");
  return s.Done({ durationS: 15.0 });
}

function S1302(ctx) {
  const s = new Seq(ctx, "13-2", "飞机兜回来：黑子蹬腿，老耿奔冬瓜");
  const K = id => KU(ctx, "13-2", id);
  const K1 = id => KU(ctx, "13-1", id);
  const heizi = Pt(K("Heizi").x, K("Heizi").z), geng = Pt(K("Geng").x, K("Geng").z);
  const litter = Pt(K("LitterDonggua").x, K("LitterDonggua").z), body = Pt(K("Donggua").x, K("Donggua").z);
  const planesWest = Pt(-120, 600);
  // 飞机在西边红天底下拐大弯，没走
  Plane(s, 0, "planeDrone", planesWest, 0.7);
  s.Eye(0, 3.0, { stance: "stand", look: planesWest, pitch: 10 });
  s.Caption(0.5, 3.4, "（飞机拉起来，在西边的红天底下拐了个大弯。它没走，在兜圈子）");
  s.Eye(3.0, 2.0, { stance: "stand", look: planesWest, pitch: 10, toLook: heizi, toPitch: -10 });
  s.Eye(5.0, 4.0, { stance: "stand", look: heizi, pitch: -10 });
  s.Caption(4.4, 2.6, "（黑子侧躺着，后腿一下一下地蹬）");
  // 妮儿在刘文财怀里往黑子那边挣
  s.Key("LiuWencai", 4.6, { faceTo: "Nier" });
  s.Say("NierScream.01", "Nier", 6.0);
  const nier = Pt(K("Nier").x, K("Nier").z);
  s.Go("Nier", 6.2, 6.9, nier.x + 0.5, nier.z + 0.5, { move: "walk", stance: "crouch", faceTo: "Heizi" });
  s.Go("Nier", 7.3, 8.0, nier.x, nier.z, { move: "walk", stance: "crouch", faceTo: "Heizi" });
  s.Caption(6.6, 3.4, "（妮儿在刘文财怀里拼命往黑子那边挣，嘴张着，喉咙里「啊——啊——」地响；刘文财两条胳膊箍住她不放）");
  // 后头的担架员跑上来，把车上另外两个伤员滚上担架抬着跑了（另两副担架往西）
  s.Go("Litter01", 4.0, 20.0, -30, 610.4, { move: "walk", path: [RP(-6, -1.6)], yawDeg: 90 });
  s.Go("Litter02", 5.0, 22.0, -28, 611.2, { move: "walk", yawDeg: 90 });
  s.Caption(10.2, 3.4, "（后头的担架员跑上来，把车上另外两个伤员滚上担架，抬着往前跑了）");
  // 老耿从沟里爬起来，看黑子一眼就一眼，转身奔冬瓜
  const geng0 = Pt(K1("Geng").x, K1("Geng").z);
  s.Place("Geng", 0, geng0.x, geng0.z, { stance: "prone", faceTo: heizi });
  s.Key("Geng", 2.8, { stance: "stand" });
  s.Key("Geng", 3.0, { faceTo: "Heizi" });
  s.Caption(3.2, 1.2, "（老耿从沟里爬起来，看了黑子一眼，就一眼）");
  s.Go("Geng", 4.6, 9.4, geng.x, geng.z, { move: "walk", faceTo: "Donggua" });
  s.Eye(9.0, 2.0, { stance: "stand", look: heizi, pitch: -10, toLook: geng, toPitch: -6 });
  s.Eye(11.0, 3.0, { stance: "stand", look: geng, pitch: -6, toLook: body, toPitch: -16 });
  // 老耿和顺子把冬瓜翻回担架上（自动）
  s.Caption(11.4, 3.0, "（老耿和顺子把冬瓜翻回担架上）");
  s.Go("Donggua", 11.6, 13.4, litter.x, litter.z, { move: "walk", yawDeg: K("LitterDonggua").yawDeg, lie: "along" });
  // 老耿指着路边前头一道黑口子：顺着沟走！这沟通河边！……抬！（眼睛先看着他说，再顺着他指的看沟口）
  s.Eye(14.0, 1.0, { stance: "stand", look: body, pitch: -16, toLook: geng, toPitch: -6 });
  s.Key("Geng", 14.4, { faceTo: MOUTH });
  const point = s.Say("IntoTheGully.01", "Geng", 14.8);
  s.Caption(point + 0.4, 2.4, "（老耿指着路边前头一道黑口子）");
  const rear = Pt(litter.x + 1.3, litter.z);
  s.Key("Geng", point + 2.0, { faceTo: "Donggua" });
  s.Go("Geng", point + 2.2, point + 3.6, rear.x, rear.z, { move: "walk", yawDeg: 90 });
  const lift = s.Say("IntoTheGully.02", "Geng", point + 3.4);
  s.Key("Geng", lift + 0.5, { carryRole: "rear" });
  s.Eye(15.0, point + 2.2 - 15.0, { stance: "stand", look: geng, pitch: -6 });
  s.Eye(point + 2.2, 1.2, { stance: "stand", look: geng, pitch: -6, toLook: rear, toPitch: -8 });
  s.Eye(point + 3.4, 2.0, { stance: "stand", look: rear, pitch: -8 });
  s.Caption(lift + 0.6, 3.2, "（刘文财怀里抱着人，腾不出手。老耿弯腰抓起担架后头的两根杠子；顺子抓起前头）");
  s.Eye(point + 5.4, 1.6, { stance: "stand", look: rear, pitch: -8, toLook: MOUTH, toPitch: -2 });
  s.Eye(point + 7.0, 3.0, { stance: "stand", look: MOUTH, pitch: -2 });
  s.Caption(point + 7.2, 2.6, "（把冬瓜抬进沟里）");
  Plane(s, 16.0, "planeDrone", Pt(-140, 580), 0.5);
  return s.Done({ durationS: point + 10.0 });
}

// ---------------------------------------------------------------------------
// 14 松手

function S1401(ctx) {
  const s = new Seq(ctx, "14-1", "抬着走：沟口眼看就到了");
  const P = KP(ctx, "14-1");
  const K = id => KU(ctx, "14-1", id);
  const litter = Pt(K("LitterDonggua").x, K("LitterDonggua").z), geng = Pt(K("Geng").x, K("Geng").z);
  // 慢走：担架在玩家与老耿之间，老耿抬后头；一起往沟口挪 7 m（0.7 m/s）
  const T1 = 2.0, T2 = 12.0, D = 7.0;
  s.Key("Geng", 0, { carryRole: "rear", yawDeg: 90 });
  const dir = { x: (MOUTH.x - P.x), z: (MOUTH.z - P.z) };
  const len = Math.hypot(dir.x, dir.z);
  const u = { x: dir.x / len, z: dir.z / len };
  const step = (p, d) => Pt(p.x + u.x * d, p.z + u.z * d);
  s.Go("LitterDonggua", T1, T2, step(litter, D).x, step(litter, D).z, { move: "walk", yawDeg: 90 });
  s.Go("Donggua", T1, T2, step(litter, D).x, step(litter, D).z, { move: "walk", yawDeg: 90, lie: "along" });
  s.Go("Geng", T1, T2, step(geng, D).x, step(geng, D).z, { move: "walk", yawDeg: 90 });
  const eye0 = Pt(P.x, P.z);
  s.Eye(0, T1, { stance: "stand", look: MOUTH, pitch: -4 });
  s.Caption(0.3, 3.0, "（两只手攥着杠子，枪背在背上，只能慢走，能转头）");
  // 往前看沟口（刘文财抱着妮儿趴在沟沿上）→ 回头看担架和老耿 → 抬头看飞机 → 再看沟口
  const e1 = step(eye0, D * 0.3), e2 = step(eye0, D * 0.6), e3 = step(eye0, D);
  s.WalkEye(T1, 3.0, eye0, e1, { ...MOUTH, h: 1.0 }, { lookTo: { actor: "Geng", offset: [0, 1.3, 0] }, ease: "inOut" });
  s.Caption(T1 + 0.4, 2.8, "（往前看：沟口就在前头，刘文财抱着妮儿先到了，趴在沟沿上）");
  s.WalkEye(T1 + 3.0, 3.0, e1, e2, { actor: "Geng", offset: [0, 1.3, 0] }, { lookTo: SKY_EAST, ease: "inOut" });
  s.Caption(T1 + 3.4, 2.8, "（往后看：冬瓜躺在担架上，老耿在后头抬着，喘得厉害）");
  s.Say("Faster.01", "Geng", T1 + 5.0);
  s.WalkEye(T1 + 6.0, 4.0, e2, e3, SKY_EAST, { lookTo: { ...MOUTH, h: 1.0 }, ease: "inOut" });
  s.Caption(T1 + 6.4, 3.0, "（往天上看：两架飞机兜完了弯，正冲这边来）");
  Plane(s, 0, "planeDrone", Pt(-100, 600), 0.45);
  Plane(s, 4.0, "planeDrone", Pt(-40, 575), 0.6);
  Plane(s, 8.0, "planeDrone", Pt(10, 594), 0.8);
  Plane(s, 11.0, "planeDive", Pt(30, 604), 0.9);
  s.Caption(T1 + 9.6, 2.0, "（飞机声越来越响，沟口眼看就到了）");
  s.Eye(T2, 1.6, { stance: "stand", x: e3.x, z: e3.z, look: MOUTH, pitch: -4 });
  return s.Done({ durationS: T2 + 1.6 });
}

function S1402(ctx) {
  const s = new Seq(ctx, "14-2", "第二轮：顺子先松的手");
  const P = KP(ctx, "14-2");
  const K = id => KU(ctx, "14-2", id);
  const K1 = id => KU(ctx, "14-1", id);
  const litterDown = Pt(K("LitterDonggua").x, K("LitterDonggua").z);   // 前头着地的担架
  const body = Pt(K("Donggua").x, K("Donggua").z);                       // 冬瓜滑到路当中
  const gengHold = Pt(K("Geng").x, K("Geng").z);                         // 后头还举在老耿手里
  const liu = Pt(K("LiuWencai").x, K("LiuWencai").z);
  const bullets = Pt(-30.4, 614.3);                                       // 弹孔一串：离担架一步远、离冬瓜一步远，谁都没打着
  const pole = Pt(litterDown.x - 1.9, litterDown.z + 0.5);               // 自己这头的杠子，手边
  // 开场还抬着：担架在玩家与老耿之间，正往沟口挪最后一小段
  const litter0 = Pt(litterDown.x + 0.6, litterDown.z + 0.7), geng0 = Pt(litter0.x + 1.3, litter0.z);
  s.Place("LitterDonggua", 0, litter0.x, litter0.z, { yawDeg: 90 });
  s.Place("Donggua", 0, litter0.x, litter0.z, { yawDeg: 90, lie: "along" });
  s.Place("Geng", 0, geng0.x, geng0.z, { yawDeg: 90, carryRole: "rear" });
  const eyeWalk0 = Pt(litter0.x - 1.3, litter0.z), eyeWalk1 = Pt(litter0.x - 1.8, litter0.z + 0.2);
  s.WalkEye(0, 1.8, eyeWalk0, eyeWalk1, { ...MOUTH, h: 1.0 });
  for (const id of ["LitterDonggua", "Donggua", "Geng"]) s.Shift(id, 0, 1.8, -0.5, 0.2, { yawDeg: 90 });
  // 轰鸣压到头顶，一串弹着从身后追上来
  Plane(s, 0.6, "planeDive", Pt(-6, 604), 1.0);
  Plane(s, 1.5, "strafeNear", Pt(-20, 613), 1.0);
  const At = Strafe(s, 1.5, -8, -46, bullets.z);
  s.Shake(At(-24), 1.6, 0.8);
  // 控制被收走：眼睛砸到趴，杠子脱手
  const drop = 1.8;
  s.Cam(drop, 0.5, { from: { x: eyeWalk1.x, z: eyeWalk1.z, h: 1.55 }, to: { x: P.x, z: P.z, h: 0.3 }, look: { x: P.x - 2.4, z: P.z + 0.6, h: 0 }, ease: "inOut", shake: 0.8 });
  s.Caption(drop + 0.1, 2.4, "（顺子自己扑倒，杠子从手里脱出去，「咚」一声砸在地上）");
  s.Sfx(drop + 0.4, "bodyFall", { x: pole.x, z: pole.z, volume: 1.0 });
  s.Place("LitterDonggua", drop + 0.4, litterDown.x, litterDown.z, { yawDeg: 90 });
  s.Place("Geng", drop + 0.4, gengHold.x, gengHold.z, { yawDeg: 90, carryRole: "rear" });
  // 冬瓜顺着担架滑下去，滚在路当中
  s.Go("Donggua", drop + 0.6, drop + 2.6, body.x, body.z, { move: "walk", yawDeg: K("Donggua").yawDeg, lie: "along" });
  // 子弹打在旁边，溅了一脸土
  Plane(s, drop + 0.5, "strafeDirt", Pt(P.x - 1.5, P.z + 1), 1.0);
  for (const [k, p] of [[0.5, Pt(P.x - 1.8, P.z + 1.1)], [0.53, Pt(P.x - 3.0, P.z + 1.4)], [0.56, Pt(P.x - 4.3, P.z + 1.8)]]) Puff(s, drop + k, p);
  s.Eye(drop + 0.5, 1.9, { stance: "prone", look: Pt(P.x - 2.4, P.z + 0.6), pitch: 12, shake: 0.5 });
  s.Caption(drop + 2.6, 1.6, "（头顶一片轰鸣，子弹打在旁边，溅了一脸土）");
  // 抬眼依次看到四样东西：杠子、斜着的担架、滑到路当中的冬瓜、这时才松手扑上去的老耿
  const t1 = drop + 2.4;
  s.Eye(t1, 2.0, { stance: "prone", look: Pt(P.x - 2.4, P.z + 0.6), pitch: 12, toLook: pole, toPitch: -14 });
  s.Caption(t1 + 0.4, 2.0, "（自己这头的杠子砸在地上，就在手边）");
  s.Eye(t1 + 2.0, 2.4, { stance: "prone", look: pole, pitch: -14, toLook: litterDown, toPitch: -8 });
  s.Caption(t1 + 2.4, 2.4, "（担架斜着：前头着地，后头还举在老耿手里）");
  s.Eye(t1 + 4.4, 2.4, { stance: "prone", look: litterDown, pitch: -8, toLook: body, toPitch: -4 });
  s.Caption(t1 + 4.8, 2.6, "（冬瓜顺着担架滑下去，滚在路当中，肚子上的毛巾掉了，伤口崩开了）");
  const gengDrop = t1 + 6.6;
  s.Key("Geng", gengDrop, { carryRole: null });
  const gengOn = Pt(body.x + 0.6, body.z + 0.6);
  s.Go("Geng", gengDrop + 0.2, gengDrop + 1.2, gengOn.x, gengOn.z, { move: "walk", faceTo: body });
  s.Key("Geng", gengDrop + 1.3, { stance: "prone" });
  s.Eye(t1 + 6.8, 3.2, { stance: "prone", look: body, pitch: -4, toLook: gengOn, toPitch: -4 });
  s.Caption(t1 + 7.2, 3.0, "（老耿这时才松开杠子，扑上去趴在冬瓜身上，用背挡着）");
  s.Eye(t1 + 10.0, 3.0, { stance: "prone", look: gengOn, pitch: -4, toLook: bullets, toPitch: -3 });
  s.Caption(t1 + 10.4, 2.8, "（地上那串弹孔离担架只有一步远，谁都没打着）");
  s.Eye(t1 + 13.0, 3.0, { stance: "prone", look: bullets, pitch: -3, toLook: liu, toPitch: 0 });
  s.Key("LiuWencai", t1 + 13.0, { faceTo: "player" });
  s.Key("Nier", t1 + 13.2, { faceTo: "player" });
  s.Caption(t1 + 13.4, 2.8, "（沟沿上，刘文财抱着妮儿，脸正冲着这边）");
  s.Eye(t1 + 16.0, 2.6, { stance: "prone", look: liu, pitch: 0 });
  Plane(s, t1 + 15.4, "planeDrone", Pt(-100, 560), 0.35);
  // 飞机过去了：爬回去，和老耿把冬瓜抬进沟里（自动）
  const up = t1 + 16.6;
  s.Caption(up - 0.2, 4.0, "（飞机过去了。顺子爬回去，和老耿把冬瓜抬进沟里）");
  const eyeUp = Pt(litterDown.x - 1.3, litterDown.z);
  s.Cam(up, 2.0, { from: { x: P.x, z: P.z, h: 0.32 }, to: { x: eyeUp.x, z: eyeUp.z, h: 1.5 }, look: { ...body, h: 0.3 }, ease: "inOut" });
  s.Key("Geng", up + 0.4, { stance: "stand" });
  s.Place("Donggua", up + 2.2, litterDown.x, litterDown.z, { yawDeg: 90, lie: "along" });
  const rear = Pt(litterDown.x + 1.3, litterDown.z);
  s.Go("Geng", up + 1.2, up + 2.4, rear.x, rear.z, { move: "walk", yawDeg: 90 });
  s.Key("Geng", up + 2.5, { carryRole: "rear" });
  s.Eye(up + 2.0, 1.4, { stance: "stand", x: eyeUp.x, z: eyeUp.z, look: rear, pitch: -8 });
  const carry = up + 3.4, mouthStop = Pt(MOUTH.x + 2.6, MOUTH.z - 1.1);
  const dir = { x: mouthStop.x - litterDown.x, z: mouthStop.z - litterDown.z }, len = Math.hypot(dir.x, dir.z), u = { x: dir.x / len, z: dir.z / len };
  const carryT = carry + len / 1.1;
  s.Go("LitterDonggua", carry, carryT, mouthStop.x, mouthStop.z, { move: "walk", yawDeg: Yaw(litterDown, mouthStop) });
  s.Go("Donggua", carry, carryT, mouthStop.x, mouthStop.z, { move: "walk", yawDeg: Yaw(litterDown, mouthStop), lie: "along" });
  s.Go("Geng", carry, carryT, mouthStop.x - u.x * 1.3, mouthStop.z - u.z * 1.3, { move: "walk" });
  s.WalkEye(carry, carryT - carry, eyeUp, Pt(mouthStop.x + u.x * 1.3, mouthStop.z + u.z * 1.3), { ...MOUTH, h: 0 });
  void K1;
  return s.Done({ durationS: carryT + 0.4 });
}

// ---------------------------------------------------------------------------
// 15 沟里，抬到桥头

function S1501(ctx) {
  const s = new Seq(ctx, "15-1", "沟底：你松啥子手？八个……抵了");
  const K = id => KU(ctx, "15-1", id);
  const litter = Pt(K("LitterDonggua").x, K("LitterDonggua").z), geng = Pt(K("Geng").x, K("Geng").z);
  const liu = Pt(K("LiuWencai").x, K("LiuWencai").z);
  Plane(s, 0, "planeDrone", Pt(-60, 700), 0.3);
  Plane(s, 6.0, "planeDrone", Pt(-70, 790), 0.15);
  s.Eye(0, 6.0, { stance: "crouch", look: litter, pitch: -14 });
  s.Caption(0.4, 3.6, "（沟比人深，头顶只剩一条红天。飞机声往南去了，越来越小）");
  s.Key("Geng", 0, { faceTo: "Donggua" });
  s.Caption(4.2, 4.6, "（老耿跪在旁边捡起那条毛巾，拿手掌把它按回伤口里，按住不放。冬瓜整个人弓起来，叫都没叫出来）");
  // 刘文财把妮儿放下，看看冬瓜，又看看顺子
  s.Key("LiuWencai", 6.0, { faceTo: "Donggua" });
  s.Key("LiuWencai", 8.2, { faceTo: "player" });
  s.Eye(6.0, 2.0, { stance: "crouch", look: litter, pitch: -14, toLook: liu, toPitch: -4 });
  s.Eye(8.0, 3.6, { stance: "crouch", look: liu, pitch: -4 });
  s.Say("GullyBottom.01", "LiuWencai", 8.6);
  s.Caption(s.End("GullyBottom.01") + 0.3, 2.0, "（顺子说不出话）");
  // 冬瓜睁开眼，看着顺子
  s.Eye(11.6, 1.6, { stance: "crouch", look: liu, pitch: -4, toLook: litter, toPitch: -14 });
  s.Say("GullyBottom.02", "Donggua", 13.4);
  s.Say("GullyBottom.03", "Donggua");
  s.Eye(13.2, s.End("GullyBottom.03") - 13.2 + 2.4, { stance: "crouch", look: litter, pitch: -14 });
  s.Caption(s.End("GullyBottom.03") + 0.4, 1.8, "（没人接话）");
  // 刘文财把妮儿推到老耿身边；弯腰攥住后头的杠子；老耿等他攥稳了才松手，去牵妮儿
  const give = s.Say("GullyBottom.04", "LiuWencai", s.End("GullyBottom.03") + 2.6);
  s.Key("LiuWencai", give - 0.4, { faceTo: "Nier" });
  s.Eye(give - 0.6, 1.2, { stance: "crouch", look: litter, pitch: -14, toLook: liu, toPitch: -4 });
  const nierTo = DP(-44.9, 0.5);
  s.Go("Nier", give + 0.4, give + 7.0, nierTo.x, nierTo.z, { move: "walk", path: [DP(-52.4, 0.55), DP(-47.6, 0.55), DP(-45.8, 0.5)], faceTo: "Geng" });
  const rear = DP(litter.x + 1.3);
  const grab = s.End("GullyBottom.04") + 0.3, grabbed = grab + 4.4;
  s.Go("LiuWencai", grab, grabbed, rear.x, rear.z, { move: "walk", path: [DP(-51.0, -0.55), DP(-47.4, -0.55)], yawDeg: 90 });
  s.Eye(give + 0.6, grabbed - give - 0.6, { stance: "crouch", look: liu, pitch: -4, toLook: rear, toPitch: -10 });
  s.Key("LiuWencai", grabbed + 0.3, { carryRole: "rear" });
  s.Caption(grabbed + 0.2, 3.0, "（老耿等他攥稳了，才把按着毛巾的手松开）");
  const gengTo = DP(-43.6);
  s.Go("Geng", grabbed + 2.4, grabbed + 3.8, gengTo.x, gengTo.z, { move: "walk", faceTo: "Nier" });
  s.Caption(grabbed + 3.4, 2.0, "（老耿去牵妮儿）");
  s.Eye(grabbed, 2.4, { stance: "crouch", look: rear, pitch: -10, toLook: gengTo, toPitch: -6 });
  s.Eye(grabbed + 2.4, 3.6, { stance: "crouch", look: gengTo, pitch: -6 });
  void geng;
  return s.Done({ durationS: grabbed + 6.0 });
}

function S1502(ctx) {
  const s = new Seq(ctx, "15-2", "沿沟抬：一路没话，走到头眼前开阔");
  const P = KP(ctx, "15-2");
  // 眼睛沿沟中线往西走：按排水沟折线的各段走（1.6 m/s，30–40 s 压缩）
  const E = [Pt(P.x, P.z), Pt(DT.line[3].x, DT.line[3].z), Pt(DT.line[4].x, DT.line[4].z), Pt(DT.line[5].x, DT.line[5].z), Pt(DT.line[6].x, DT.line[6].z)];
  const MPS = 1.6, T0 = 1.0, H = 1.55;
  const legT = [];
  let t = T0;
  for (let i = 1; i < E.length; i++) { const dur = Dist(E[i - 1], E[i]) / MPS; legT.push({ t0: R(t), dur: R(dur) }); t += dur; }
  const tOut = R(t);
  const Lk = p => ({ ...p, h: 1.0 });
  // 第一段：看着前头的沟
  s.Eye(0, T0, { stance: "stand", yaw: 90, pitch: -3 });
  s.WalkEye(legT[0].t0, legT[0].dur, E[0], E[1], Lk(E[1]), { lookTo: Lk(E[2]), h: H });
  // 第二段：途中回头一次看刘文财低头走路，再看前头
  {
    const { t0, dur } = legT[1];
    const a = 2.0 / dur, b = 5.0 / dur;
    const lerp = k => Pt(E[1].x + (E[2].x - E[1].x) * k, E[1].z + (E[2].z - E[1].z) * k);
    s.WalkEye(t0, 2.0, E[1], lerp(a), Lk(E[2]), { lookTo: { actor: "LiuWencai", offset: [0, 1.25, 0] }, h: H, ease: "inOut" });
    s.WalkEye(t0 + 2.0, 3.0, lerp(a), lerp(b), { actor: "LiuWencai", offset: [0, 1.25, 0] }, { lookTo: Lk(E[2]), h: H, ease: "inOut" });
    s.WalkEye(t0 + 5.0, dur - 5.0, lerp(b), E[2], Lk(E[2]), { lookTo: Lk(E[3]), h: H });
  }
  s.WalkEye(legT[2].t0, legT[2].dur, E[2], E[3], Lk(E[3]), { lookTo: Lk(E[4]), h: H });
  // 最后一段：沟到头，眼前开阔——看到浮桥、马灯、过桥的担架
  s.WalkEye(legT[3].t0, legT[3].dur, E[3], E[4], Lk(E[4]), { lookTo: { ...BRIDGE_MID, h: 0 }, h: H, ease: "inOut" });
  // 人跟着走：担架 1.3 m 后、刘文财 2.6、老耿 5.6、妮儿 7.0（沿最后一段的方向往回量）
  const last = { x: E[4].x - E[3].x, z: E[4].z - E[3].z }, ll = Math.hypot(last.x, last.z), u = { x: last.x / ll, z: last.z / ll };
  const back = d => Pt(E[4].x - u.x * d, E[4].z - u.z * d);
  s.Key("LiuWencai", 0, { carryRole: "rear" });
  for (const [id, d, extra] of [["LitterDonggua", 1.3, { yawDeg: 180 }], ["Donggua", 1.3, { yawDeg: 180, lie: "along" }], ["LiuWencai", 2.6, {}], ["Geng", 5.6, {}], ["Nier", 7.0, {}]]) {
    s.Walk(id, T0, back(d), { speed: MPS, ...extra });
  }
  // 桥上过担架（临时加两副，一回只过一副）
  s.Spawn("CrossLitterA", { side: "nra", kind: "litter", x: BR.x, z: 652, yawDeg: 180 }, { visible: true });
  s.Go("CrossLitterA", 18.0, tOut + 10.0, BR.x, 652 + (tOut + 10.0 - 18.0) * 1.2, { move: "walk", yawDeg: 180 });
  s.Spawn("CrossLitterB", { side: "nra", kind: "litter", x: BR.x, z: 640, yawDeg: 180 }, { visible: false });
  s.Key("CrossLitterB", 30.0, { visible: true });
  s.Go("CrossLitterB", 30.2, tOut + 10.0, BR.x, 640 + (tOut + 10.0 - 30.2) * 1.2, { move: "walk", yawDeg: 180 });
  // 说明字与声音
  s.Caption(1.0, 4.4, "（一路上只有喘气声、踩烂泥的声音、杠子吱呀响，冬瓜在身后一下一下地哼）");
  s.Caption(legT[1].t0 + 0.6, 4.4, "（刘文财低着头看路，不看顺子；老耿牵着妮儿走在最后，身上只有那件单褂子）");
  s.Caption(legT[2].t0 + 0.6, 4.0, "（天一点点黑下来，红色褪成了灰蓝）");
  s.Caption(legT[3].t0 + 0.6, 4.0, "（沟越走越浅，走到头，眼前一下子开阔了）");
  Plane(s, 0, "planeDrone", Pt(-60, 720), 0.3);
  Plane(s, 12.0, "planeDrone", Pt(-40, 800), 0.15);
  // 停在沟出口：看浮桥、马灯、过桥的担架，再看桥头那边
  const lamp = { x: -151.3, z: BR.lanternsAtZ[1], h: 1.5 };
  s.WalkEye(tOut, 3.0, E[4], Pt(E[4].x - 0.5, E[4].z + 1.0), { ...BRIDGE_MID, h: 0 }, { lookTo: lamp, h: H, ease: "inOut" });
  s.Caption(tOut + 0.2, 5.0, "（北沙河上一溜木船用绳子连着，船上铺着木板，这就是浮桥。桥上挂着几盏马灯，担架一副接一副，一回只过一副，桥板跟着人一沉一沉）");
  const stop = Pt(E[4].x - 0.5, E[4].z + 1.0);
  s.Eye(tOut + 3.0, 3.0, { stance: "stand", x: stop.x, z: stop.z, look: lamp, pitch: 2, toLook: BP(690), toPitch: -2 });
  s.Eye(tOut + 6.0, 3.0, { stance: "stand", x: stop.x, z: stop.z, look: BP(690), pitch: -2, toLook: Pt(-150, 626), toPitch: 2 });
  s.Caption(tOut + 5.4, 3.2, "（桥头这边有几间院子，门口挤满了人）");
  s.Eye(tOut + 9.0, 1.6, { stance: "stand", x: stop.x, z: stop.z, look: Pt(-150, 626), pitch: 2 });
  return s.Done({ durationS: tOut + 10.6 });
}

function S1503(ctx) {
  const s = new Seq(ctx, "15-3", "接收院门口：画的黑子嗦？");
  const K = id => KU(ctx, "15-3", id);
  const guard = Pt(K("GateGuard").x, K("GateGuard").z), litter = Pt(K("LitterDonggua").x, K("LitterDonggua").z);
  const nier = Pt(K("Nier").x, K("Nier").z), draw = Pt(nier.x, nier.z + 1.0), liu = Pt(K("LiuWencai").x, K("LiuWencai").z), geng = Pt(K("Geng").x, K("Geng").z);
  // 守门的兵把人往外推
  s.Eye(0, 4.0, { stance: "crouch", look: guard, pitch: -2 });
  s.Caption(0.3, 3.4, "（院门口的墙根下，担架一副挨一副摆着等；守门的兵把人往外推）");
  s.Key("GateGuard", 0, { faceTo: "player" });
  s.Say("GateQueue.01", "GateGuard", 1.2);
  // 冬瓜搁在墙根排在别人后头；顺子在担架头上蹲下，老耿靠墙坐下
  s.Eye(4.0, 2.0, { stance: "crouch", look: guard, pitch: -2, toLook: litter, toPitch: -20 });
  s.Caption(4.4, 4.4, "（冬瓜被搁在墙根，排在别人后头。顺子在担架头上蹲下；老耿靠墙坐下抱着胳膊，冻得发抖）");
  s.Eye(6.0, 2.0, { stance: "crouch", look: litter, pitch: -20 });
  // 妮儿画驴、摆弹壳
  s.Eye(8.0, 1.6, { stance: "crouch", look: litter, pitch: -20, toLook: draw, toPitch: -18 });
  s.Eye(9.6, 8.0, { stance: "crouch", look: draw, pitch: -18 });
  s.Caption(9.0, 4.6, "（妮儿蹲在地上，捡根树枝在土里画：长脸，两只长耳朵，四条腿，后头拖一辆车）");
  s.Caption(13.8, 3.6, "（画完从衣兜里掏出几个弹壳，一个挨一个，在驴旁边摆成一排）");
  // 刘文财蹲下来看：画的黑子嗦？算驴腿的账
  s.Key("LiuWencai", 0, { stance: "crouch", faceTo: draw });
  s.Key("Geng", 0, { faceTo: draw });
  s.Eye(17.6, 1.2, { stance: "crouch", look: draw, pitch: -18, toLook: liu, toPitch: -14 });
  const ask = s.Say("GateQueue.02", "LiuWencai", 18.0);
  const count = s.Say("GateQueue.03", "LiuWencai");
  s.Caption(count + 0.2, 3.0, "（刘文财拈起一个弹壳，在手心里掂了掂）");
  s.Eye(18.8, count - 18.8 + 3.0, { stance: "crouch", look: liu, pitch: -14 });
  s.Eye(count + 3.0, 1.4, { stance: "crouch", look: liu, pitch: -14, toLook: draw, toPitch: -18 });
  s.Say("GateQueue.04", "LiuWencai");
  s.Eye(count + 4.4, s.End("GateQueue.04") - count - 4.4 + 0.6, { stance: "crouch", look: draw, pitch: -18 });
  s.Caption(s.End("GateQueue.04") + 0.3, 3.0, "（妮儿看着他嘴动，伸手把他手心里那个弹壳拿回来，摆回原来的地方）");
  const stubborn = s.Say("GateQueue.05", "LiuWencai", s.End("GateQueue.04") + 3.2);
  s.Eye(s.End("GateQueue.04") + 0.6, stubborn - s.End("GateQueue.04") - 0.6 + 1.0, { stance: "crouch", look: draw, pitch: -18, toLook: liu, toPitch: -14 });
  // 老耿看着地上那头驴，看了一会儿，把脸转开了
  const turn = s.End("GateQueue.05") + 0.3;
  s.Eye(stubborn + 1.0, turn - stubborn - 1.0 + 1.6, { stance: "crouch", look: liu, pitch: -14, toLook: geng, toPitch: -6 });
  s.Caption(turn, 3.0, "（老耿看着地上那头驴，看了一会儿，把脸转开了）");
  s.Key("Geng", turn + 1.6, { faceTo: Pt(geng.x - 2, geng.z + 12) });
  s.Eye(turn + 1.6, 2.6, { stance: "crouch", look: geng, pitch: -6 });
  // 门里有人喊：下一副！
  const next = s.Say("GateQueue.06", null, turn + 4.0);
  s.Eye(turn + 4.2, 1.2, { stance: "crouch", look: geng, pitch: -6, toLook: YARD_GATE, toPitch: 0 });
  s.Eye(turn + 5.4, 2.6, { stance: "crouch", look: YARD_GATE, pitch: 0 });
  void ask; void next;
  return s.Done({ durationS: turn + 8.0 });
}

// ---------------------------------------------------------------------------
// 16 过门槛

function S1601(ctx) {
  const s = new Seq(ctx, "16-1", "过门槛：脚……慢点");
  const P = KP(ctx, "16-1");
  const K = id => KU(ctx, "16-1", id);
  const K7 = id => KU(ctx, "17-1", id);
  const doctor = Pt(K("Doctor").x, K("Doctor").z);
  // 开场在院门里侧：顺子抬前头、刘文财抬后头，担架在两人之间
  const gateIn = Pt(Y.box.maxX - 1.3, Y.gate.z);
  const doorOut = Pt(P.x, P.z);
  const litterEnd = Pt(K("LitterDonggua").x, K("LitterDonggua").z), liuEnd = Pt(K("LiuWencai").x, K("LiuWencai").z);
  const dir = { x: litterEnd.x - gateIn.x, z: litterEnd.z - gateIn.z }, len = Math.hypot(dir.x, dir.z), u = { x: dir.x / len, z: dir.z / len };
  const litter0 = gateIn, liu0 = Pt(gateIn.x - u.x * 1.3, gateIn.z - u.z * 1.3), eye0 = Pt(gateIn.x + u.x * 1.3, gateIn.z + u.z * 1.3);
  const heading = Yaw(gateIn, litterEnd);
  s.Place("LitterDonggua", 0, litter0.x, litter0.z, { yawDeg: heading });
  s.Place("Donggua", 0, litter0.x, litter0.z, { yawDeg: heading, lie: "along" });
  s.Place("LiuWencai", 0, liu0.x, liu0.z, { yawDeg: heading, carryRole: "rear" });
  s.Key("Doctor", 0, { stance: "crouch", faceTo: Pt(-170.4, 609.2) });
  s.Caption(0.3, 4.5, "（院里点着马灯，地上铺着麦秸，躺满了人。院里的老百姓在灶屋烧水，有人抱着门板往外走）");
  // 军医满手是血站起来扫一眼冬瓜：肚子上的？抬进去！
  s.Key("Doctor", 3.4, { stance: "stand", faceTo: "Donggua" });
  s.Caption(3.0, 2.6, "（军医满手是血，从一副担架边上站起来，扫了一眼冬瓜）");
  s.Say("Threshold.01", "Doctor", 4.2);
  s.Go("Doctor", s.End("Threshold.01") + 0.4, s.End("Threshold.01") + 4.4, -176.4, 616.6, { move: "walk", faceTo: Pt(-170.4, 609.2) });
  s.Key("Doctor", s.End("Threshold.01") + 4.6, { stance: "crouch" });
  // 穿过院子走到厢房门口（1.35 m/s）
  const T1 = 2.0, T2 = R(T1 + len / 1.35);
  s.Eye(0, T1, { stance: "stand", x: eye0.x, z: eye0.z, look: doctor, pitch: -6 });
  s.WalkEye(T1, 5.0, eye0, Pt(eye0.x + u.x * 5.0 * 1.35, eye0.z + u.z * 5.0 * 1.35), { actor: "Doctor", offset: [0, 1.3, 0] });
  s.WalkEye(T1 + 5.0, T2 - T1 - 5.0, Pt(eye0.x + u.x * 5.0 * 1.35, eye0.z + u.z * 5.0 * 1.35), doorOut, { actor: "Doctor", offset: [0, 1.3, 0] }, { lookTo: { ...XIANG_DOOR, h: 1.0 }, ease: "inOut" });
  s.Go("LitterDonggua", T1, T2, litterEnd.x, litterEnd.z, { move: "walk", yawDeg: 180 });
  s.Go("Donggua", T1, T2, litterEnd.x, litterEnd.z, { move: "walk", yawDeg: 180, lie: "along" });
  s.Go("LiuWencai", T1, T2, liuEnd.x, liuEnd.z, { move: "walk", yawDeg: 180 });
  // 老耿和妮儿跟进院子，在厢房门口外等
  s.Go("Geng", 8.0, 20.0, -179.6, 625.2, { move: "walk", faceTo: XIANG_DOOR });
  s.Go("Nier", 8.6, 20.6, -178.4, 624.4, { move: "walk", faceTo: XIANG_DOOR });
  // 过门槛：眼睛一低一抬，担架往一边歪了一下
  const th = T2 + 0.6;
  s.Eye(T2, 0.6, { stance: "stand", look: XIANG_DOOR, pitch: -22 });
  s.Caption(th - 0.2, 3.0, "（厢房门口有道门槛：抬着往里迈，担架往一边歪了一下）");
  s.Cam(th, 0.9, { from: { x: P.x, z: P.z, h: 1.62 }, to: { x: P.x, z: P.z + 0.7, h: 1.3 }, look: { ...INSIDE, h: 0.2 }, ease: "inOut", shake: 0.15 });
  s.Cam(th + 0.9, 0.9, { from: { x: P.x, z: P.z + 0.7, h: 1.3 }, to: { x: P.x, z: P.z + 1.5, h: 1.68 }, look: { ...INSIDE, h: 0.2 }, ease: "inOut", shake: 0.25 });
  s.Say("Threshold.02", "Donggua", th + 0.8);
  s.Say("Threshold.03", null);
  // 抬进屋里靠墙的空地
  const inEnd = Pt(INSIDE.x, INSIDE.z), eyeIn = Pt(INSIDE.x, INSIDE.z + 1.3), liuIn = Pt(INSIDE.x, INSIDE.z - 1.3);
  const T3 = th + 1.8, T4 = R(T3 + Dist(Pt(P.x, P.z + 1.5), eyeIn) / 0.9);
  s.WalkEye(T3, T4 - T3, Pt(P.x, P.z + 1.5), eyeIn, { ...INSIDE, h: 0.2 }, { h: 1.62 });
  // 从门洞正中进去（厢房门 1.2 m 宽，斜着进会蹭到北墙）
  const door = [Pt(XIANG_DOOR.x, XIANG_DOOR.z + 1.4)];
  s.Go("LitterDonggua", T3, T4, inEnd.x, inEnd.z, { move: "walk", path: door, yawDeg: 180 });
  s.Go("Donggua", T3, T4, inEnd.x, inEnd.z, { move: "walk", path: door, yawDeg: 180, lie: "along" });
  s.Go("LiuWencai", T3, T4, liuIn.x, liuIn.z, { move: "walk", path: [Pt(XIANG_DOOR.x, XIANG_DOOR.z + 1.0)], yawDeg: 180 });
  s.Caption(T4 + 0.2, 4.0, "（屋里靠墙有块空地。按住键，把担架慢慢放下；一松手担架就砸下去）");
  s.Eye(T4, 5.0, { stance: "stand", x: eyeIn.x, z: eyeIn.z, look: INSIDE, pitch: -40, toPitch: -50 });
  s.Key("LiuWencai", T4 + 3.8, { carryRole: null });
  s.Caption(T4 + 4.4, 1.8, "（这是冬瓜最后一句话）");
  void K7;
  return s.Done({ durationS: T4 + 6.4 });
}

// ---------------------------------------------------------------------------
// 17 坐在门槛上

function S1701(ctx) {
  const s = new Seq(ctx, "17-1", "没了");
  const K = id => KU(ctx, "17-1", id);
  const doctorAt = Pt(K("Doctor").x, K("Doctor").z), geng = Pt(K("Geng").x, K("Geng").z), nier = Pt(K("Nier").x, K("Nier").z), liu = Pt(K("LiuWencai").x, K("LiuWencai").z);
  // 军医从院里过来，在担架边蹲下，掀开棉袄看一眼伤口，又摸摸脖子
  s.Place("Doctor", 0, XIANG_DOOR.x - 0.2, XIANG_DOOR.z - 1.4, { stance: "stand", faceTo: INSIDE });
  s.Go("Doctor", 0.4, 3.2, doctorAt.x, doctorAt.z, { move: "walk", path: [Pt(XIANG_DOOR.x - 0.2, XIANG_DOOR.z + 1.0)], faceTo: "Donggua" });
  s.Key("Doctor", 3.4, { stance: "crouch", clip: "InterrogateCrouch" });
  s.Eye(0, 3.4, { stance: "stand", look: INSIDE, pitch: -26 });
  s.Eye(3.4, 5.6, { stance: "stand", look: doctorAt, pitch: -22 });
  s.Caption(3.6, 4.6, "（军医蹲下，掀开棉袄看了一眼伤口，又摸摸脖子，停了一会儿）");
  const gone = s.Say("Gone.01", "Doctor", 8.8);
  s.Key("Doctor", gone + 0.5, { clip: null });
  // 他站起来冲门口吼，转身去看别人了；院子里没人停下来
  s.Key("Doctor", gone + 0.9, { stance: "stand", faceTo: XIANG_DOOR });
  const shout = s.Say("Gone.02", "Doctor");
  s.Eye(9.0, shout - 9.0 + 1.0, { stance: "stand", look: doctorAt, pitch: -22, toLook: doctorAt, toPitch: -6 });
  s.Eye(shout + 1.0, 4.0, { stance: "stand", look: doctorAt, pitch: -6 });
  const leave = s.End("Gone.02") + 0.3;
  s.Go("Doctor", leave, leave + 5.0, -176.4, 616.6, { move: "walk", path: [Pt(XIANG_DOOR.x + 0.2, XIANG_DOOR.z + 0.8), Pt(XIANG_DOOR.x + 0.2, XIANG_DOOR.z - 1.4)], faceTo: Pt(-170.4, 609.2) });
  s.Key("Doctor", leave + 5.2, { stance: "crouch" });
  s.Caption(leave + 0.2, 3.0, "（他转身去看别人了。院子里没人停下来）");
  // 刘文财：刚才过门槛，还在说话……
  s.Key("LiuWencai", leave + 1.0, { faceTo: "Donggua" });
  const liuLine = s.Say("Gone.03", "LiuWencai", leave + 1.6);
  s.Eye(liuLine - 0.6, 1.0, { stance: "stand", look: doctorAt, pitch: -6, toLook: liu, toPitch: -8 });
  s.Eye(liuLine + 0.4, s.End("Gone.03") - liuLine - 0.4 + 1.6, { stance: "stand", look: liu, pitch: -8 });
  s.Caption(s.End("Gone.03") + 0.3, 1.6, "（没人答他）");
  // 老耿把棉袄往上拉，盖住了他的脸
  const cover = s.End("Gone.03") + 2.0;
  s.Key("Geng", cover - 0.4, { faceTo: "Donggua" });
  s.Eye(cover, 1.4, { stance: "stand", look: liu, pitch: -8, toLook: geng, toPitch: -22 });
  s.Caption(cover + 0.4, 5.0, "（老耿把盖在冬瓜身上的棉袄往上拉，盖住了他的脸。那是老耿自己的棉袄，他没拿回去）");
  s.Eye(cover + 1.4, 4.4, { stance: "stand", look: geng, pitch: -22, toLook: INSIDE, toPitch: -30 });
  // 妮儿站在门边，看看这个大人的脸，又看看那个大人的脸
  const look = cover + 5.8;
  s.Key("Nier", look - 1.0, { faceTo: "Geng" });
  s.Key("Nier", look + 1.2, { faceTo: "LiuWencai" });
  s.Key("Nier", look + 2.6, { faceTo: "player" });
  s.Eye(look, 1.2, { stance: "stand", look: INSIDE, pitch: -30, toLook: nier, toPitch: -14 });
  s.Caption(look + 0.4, 3.6, "（妮儿站在门边，看看这个大人的脸，又看看那个大人的脸）");
  s.Eye(look + 1.2, 3.6, { stance: "stand", look: nier, pitch: -14 });
  return s.Done({ durationS: look + 5.0 });
}

function S1702(ctx) {
  const s = new Seq(ctx, "17-2", "铜板");
  const yardMid = Pt(-176, 616);
  // 退到门口，在门槛上坐下（自动两秒）
  s.Cam(0, 2.2, { from: { x: SEAT.x - 0.4, z: SEAT.z + 2.2, h: 1.5 }, to: { x: SEAT.x, z: SEAT.z, h: 1.05 }, look: { ...yardMid, h: 1.0 }, ease: "inOut" });
  s.Caption(0.2, 2.2, "（顺子退到门口，在门槛上坐下）");
  // 低头：钱袋、铜板；按 F 挪一个
  s.Eye(2.2, 6.0, { stance: "crouch", yaw: 0, pitch: -6, toPitch: -30 });
  s.Caption(2.8, 3.0, "（他从怀里摸出钱袋，把铜板倒在手心里）");
  s.Caption(6.0, 4.0, "（按 F：一个铜板挪到另一只手里，手指头有点抖。不按也行，他就那么捧着）");
  // 院子里照常忙：有人往里抬、往外抬、烧水；门外桥头上担架一副一副往桥上走
  s.Spawn("LitterIn", { side: "nra", kind: "litter", x: Y.box.maxX + 2.6, z: Y.gate.z - 0.3, yawDeg: 90 }, { visible: true });
  s.Go("LitterIn", 8.0, 18.0, -173.0, 611.6, { move: "walk", path: [Pt(Y.box.maxX - 1.3, Y.gate.z), Pt(-168, 613.4)], yawDeg: 90 });
  s.Spawn("LitterOut", { side: "nra", kind: "litter", x: -187.0, z: 620.0, yawDeg: -90 }, { visible: true });
  s.Go("LitterOut", 9.0, 23.0, Y.box.maxX + 2.6, Y.gate.z + 0.3, { move: "walk", path: [Pt(-172, 617.6), Pt(Y.box.maxX - 1.3, Y.gate.z + 0.2)], yawDeg: -90 });
  s.Go("Civ2", 3.0, 8.0, -165.2, 617.2, { move: "walk", faceTo: Pt(-165.2, 606.4) });
  s.Go("Civ2", 12.0, 17.0, -170.6, 616.4, { move: "walk", yawDeg: -90 });
  s.Eye(8.2, 6.0, { stance: "crouch", yaw: 0, pitch: -30, toYaw: 14, toPitch: -6 });
  s.Caption(10.4, 4.0, "（院子里照常忙：有人往里抬，有人往外抬，有人在烧水）");
  s.Eye(14.2, 6.0, { stance: "crouch", yaw: 14, pitch: -6, toLook: YARD_GATE, toPitch: -2 });
  s.Caption(15.0, 4.0, "（门外桥头上，担架一副一副往桥上走）");
  s.Eye(20.2, 6.0, { stance: "crouch", look: YARD_GATE, pitch: -2, toYaw: 0, toPitch: -30 });
  return s.Done({ durationS: 26.4 });
}

function S1703(ctx) {
  const s = new Seq(ctx, "17-3", "跟斗走");
  const K = id => KU(ctx, "17-3", id);
  const luoAt = Pt(K("Luo").x, K("Luo").z), yaowaAt = Pt(K("Yaowa").x, K("Yaowa").z), heAt = Pt(K("HeYoutian").x, K("HeYoutian").z);
  const nier = Pt(K("Nier").x, K("Nier").z);
  // 院门口一阵乱：班长带着幺娃、何有田和剩下的人从院门进来
  const gateE = Pt(Y.box.maxX + 1.6, Y.gate.z);
  const starts = { Luo: Off(gateE, 0.6, 0), Yaowa: Off(gateE, 1.8, -0.7), HeYoutian: Off(gateE, 2.6, 0.7), Squad1: Off(gateE, 3.6, -0.5), Squad2: Off(gateE, 4.4, 0.6) };
  for (const [id, p] of Object.entries(starts)) s.Place(id, 0, p.x, p.z, { yawDeg: 90 });
  s.Caption(0.5, 4.0, "（院门口一阵乱：罗班长带着幺娃、何有田和剩下几个人进来，满身是土和烟）");
  const arriveLuo = s.Walk("Luo", 1.0, luoAt, { speed: 1.8, faceTo: "player" });
  s.Walk("Yaowa", 1.6, yaowaAt, { speed: 1.8, faceTo: "player" });
  s.Walk("HeYoutian", 2.0, heAt, { speed: 1.8, faceTo: "player" });
  s.Walk("Squad1", 2.6, Pt(K("Squad1").x, K("Squad1").z), { speed: 1.6, faceTo: "player" });
  s.Walk("Squad2", 3.0, Pt(K("Squad2").x, K("Squad2").z), { speed: 1.6, yawDeg: 90 });
  s.Eye(0, arriveLuo - 1.6, { stance: "crouch", look: YARD_GATE, pitch: -2 });
  s.Eye(arriveLuo - 1.6, 1.6, { stance: "crouch", look: YARD_GATE, pitch: -2, toLook: luoAt, toPitch: 4 });
  s.Caption(arriveLuo, 3.0, "（班长看见门槛上的顺子，又看见屋里盖着脸的那个）");
  s.Eye(arriveLuo, 3.0, { stance: "crouch", look: luoAt, pitch: 4 });
  // 班长走过去在担架边蹲下，掀开棉袄一角看了看，又盖回去（LuoKneelCheck）
  const inDoor = Pt(XIANG_DOOR.x + 0.3, XIANG_DOOR.z + 0.9), kneel = Pt(INSIDE.x + 1.3, INSIDE.z - 0.2);
  s.Key("Nier", arriveLuo + 0.6, { x: INSIDE.x - 1.4, z: XIANG_DOOR.z + 1.1, move: "walk", faceTo: "Luo" });
  const go = arriveLuo + 2.4;
  s.Go("Luo", go, go + 2.6, kneel.x, kneel.z, { move: "walk", path: [inDoor], faceTo: "Donggua" });
  s.Key("Luo", go + 2.8, { stance: "crouch", clip: "LuoKneelCheck" });
  s.Eye(go, 2.6, { stance: "crouch", look: luoAt, pitch: 4, toLook: kneel, toPitch: -18 });
  s.Caption(go + 2.8, 3.6, "（他在担架边蹲下，掀开棉袄一角看了看，又盖回去）");
  s.Eye(go + 2.6, 4.0, { stance: "crouch", look: kneel, pitch: -18 });
  const why = s.Say("GetUp.01", "Luo", go + 6.6);
  s.Key("Luo", why - 0.2, { clip: null });
  s.Key("LiuWencai", why + 0.2, { faceTo: "player" });
  const liu = Pt(K("LiuWencai").x, K("LiuWencai").z);
  s.Eye(go + 6.6, s.End("GetUp.01") - go - 6.6, { stance: "crouch", look: kneel, pitch: -18 });
  const plane = s.Say("GetUp.02", "LiuWencai");
  s.Eye(plane - 0.3, 0.6, { stance: "crouch", look: kneel, pitch: -18, toLook: liu, toPitch: -6 });
  s.Caption(plane - 0.2, 1.4, "（刘文财看了顺子一眼）");
  s.Eye(plane + 0.3, 1.6, { stance: "crouch", look: liu, pitch: -6, toLook: kneel, toPitch: -18 });
  const damn = s.Say("GetUp.03", "Luo");
  s.Caption(damn - 0.3, 1.0, "（班长没再问，蹲了一会儿）");
  // 幺娃站在顺子旁边，看见他手心里那一把铜板，把眼睛挪开了
  const glance = s.End("GetUp.03") + 0.4;
  s.Eye(glance, 1.2, { stance: "crouch", look: kneel, pitch: -18, toLook: yaowaAt, toPitch: 2 });
  s.Caption(glance + 0.2, 3.4, "（幺娃站在顺子旁边，看见他手心里那一把铜板，把眼睛挪开了）");
  s.Key("Yaowa", glance + 1.4, { faceTo: Pt(-172, 612) });
  s.Eye(glance + 1.2, 2.6, { stance: "crouch", look: yaowaAt, pitch: 2 });
  // 班长站起来：顺儿。……起来，跟斗走。
  s.Key("Luo", glance + 3.0, { stance: "stand", faceTo: "player" });
  s.Eye(glance + 3.8, 1.0, { stance: "crouch", look: yaowaAt, pitch: 2, toLook: kneel, toPitch: -8 });
  const call = s.Say("GetUp.04", "Luo", glance + 5.0);
  s.Caption(s.End("GetUp.04") + 0.1, 1.2, "（顺子没抬头）");
  const up = s.Say("GetUp.05", "Luo");
  s.Eye(glance + 4.8, s.End("GetUp.05") - glance - 4.8 + 0.4, { stance: "crouch", look: kneel, pitch: -8 });
  s.Caption(s.End("GetUp.05") + 0.4, 3.0, "（顺子把铜板一把攥住塞回怀里，站起来，拿回全部操作）");
  s.Cam(s.End("GetUp.05") + 0.4, 2.0, { from: { x: SEAT.x, z: SEAT.z, h: 1.05 }, to: { x: SEAT.x, z: SEAT.z, h: 1.62 }, look: { actor: "Luo", offset: [0, 1.4, 0] }, ease: "inOut" });
  void call; void up; void nier;
  return s.Done({ durationS: s.End("GetUp.05") + 3.4 });
}

// ---------------------------------------------------------------------------
// 18 回头向北

function S1801(ctx) {
  const s = new Seq(ctx, "18-1", "桥头的命令：铁路桥炸了");
  const K = id => KU(ctx, "18-1", id);
  const officer = Pt(K("BridgeOfficer").x, K("BridgeOfficer").z), sapper = Pt(K("Sapper1").x, K("Sapper1").z);
  const luo = Pt(K("Luo").x, K("Luo").z), he = Pt(K("HeYoutian").x, K("HeYoutian").z);
  const trenchFor = id => Pt(KU(ctx, "18-2", id).x, KU(ctx, "18-2", id).z);
  // 出了院子就是桥头：散兵坑、工兵绑炸药、引线
  s.Eye(0, 4.5, { stance: "stand", look: Pt(-132, 616.5), pitch: -3, toLook: sapper, toPitch: -4 });
  s.Caption(0.3, 4.2, "（出了院子就是桥头。东边沿着路挖了一道浅浅的散兵坑，一个军官带着几个兵守着）");
  s.Eye(4.5, 4.4, { stance: "stand", look: sapper, pitch: -4 });
  s.Caption(4.6, 4.4, "（浮桥头上，两个工兵跪在第一条船上往船底绑炸药，引线顺着桥板一直拉到南岸）");
  // 撤下来的人陆续过桥头；桥上的担架往南
  s.Walk("LitterCross", 0.5, BP(700), { speed: 1.2, yawDeg: 180 });
  for (const [id, t0] of [["Straggler1", 1.0], ["Straggler2", 1.6], ["Refugee1", 2.2]]) s.Walk(id, t0, Pt(-149, 619.6), { speed: 1.6 });
  // 顺着河往远处「轰——」一声：铁路桥炸了
  const boom = 9.0;
  s.Sfx(boom, "shellBlast", { x: RAIL_BLAST.x, z: RAIL_BLAST.z, volume: 1.0 });
  s.Sfx(boom + 0.4, "artilleryFar", { x: RAIL_BLAST.x, z: RAIL_BLAST.z, volume: 0.6 });
  s.Ev(boom, "explosion", { x: RAIL_BLAST.x, z: RAIL_BLAST.z, kind: "shell", radius: 9, h: 5 });
  s.Ev(boom + 0.3, "smoke", { x: RAIL_BLAST.x, z: RAIL_BLAST.z, kind: "SmokeBlack", dur: 30 });
  s.Shake(boom + 0.2, 1.0, 0.35);
  s.Eye(boom - 0.1, 1.2, { stance: "stand", look: sapper, pitch: -4, toLook: RAIL_BLAST, toPitch: 6 });
  s.Caption(boom + 0.6, 4.0, "（顺着河往远处「轰——」一声，比之前听到的哪一声都响，天边腾起一大团火光）");
  for (const id of ["BridgeOfficer", "Luo", "Yaowa", "HeYoutian", "LiuWencai", "Squad1", "Squad2", "BridgeGuard1", "BridgeGuard2", "BridgeGuard3", "Geng", "Nier", "GateGuard", "Sapper1", "Sapper2"]) s.Key(id, boom + 0.3 + (id.length % 3) * 0.15, { faceTo: RAIL_BLAST });
  s.Caption(boom + 4.8, 2.0, "（桥头的兵全都扭头去看）");
  s.Eye(boom + 1.1, 3.4, { stance: "stand", look: RAIL_BLAST, pitch: 6 });
  s.Eye(boom + 4.5, 1.2, { stance: "stand", look: RAIL_BLAST, pitch: 6, toLook: officer, toPitch: -2 });
  // 军官：铁路桥炸了。……哪部分的？正好，给老子顶到这儿！
  const first = s.Say("BridgeOrders.01", "BridgeOfficer", boom + 5.0);
  const orders = s.Say("BridgeOrders.02", "BridgeOfficer");
  s.Key("BridgeOfficer", orders - 0.4, { faceTo: "Luo" });
  s.Key("Luo", orders, { faceTo: "BridgeOfficer" });
  s.Key("HeYoutian", orders + 0.4, { faceTo: "BridgeOfficer" });
  s.Key("Yaowa", orders + 0.6, { faceTo: "BridgeOfficer" });
  s.Key("LiuWencai", orders + 0.5, { faceTo: "BridgeOfficer" });
  s.Eye(boom + 5.7, orders - boom - 5.7 + 2.0, { stance: "stand", look: officer, pitch: -2 });
  const howMany = s.Say("BridgeOrders.03", "Luo");
  s.Eye(howMany - 0.4, 0.8, { stance: "stand", look: officer, pitch: -2, toLook: luo, toPitch: -2 });
  const dunno = s.Say("BridgeOrders.04", "BridgeOfficer");
  s.Eye(dunno - 0.3, 0.8, { stance: "stand", look: luo, pitch: -2, toLook: officer, toPitch: -2 });
  const until = s.Say("BridgeOrders.05", "HeYoutian");
  s.Eye(until - 0.4, 0.8, { stance: "stand", look: officer, pitch: -2, toLook: he, toPitch: -2 });
  const lastOne = s.Say("BridgeOrders.06", "BridgeOfficer");
  s.Eye(lastOne - 0.3, 0.8, { stance: "stand", look: he, pitch: -2, toLook: officer, toPitch: -2 });
  const onWay = s.Say("BridgeOrders.07", "HeYoutian");
  s.Eye(onWay - 0.4, 0.8, { stance: "stand", look: officer, pitch: -2, toLook: he, toPitch: -2 });
  s.Eye(onWay + 0.4, s.End("BridgeOrders.07") - onWay - 0.4 + 0.6, { stance: "stand", look: he, pitch: -2 });
  // 班长把人一个个塞进散兵坑；顺子的位置正对东边来的那条路
  const go = s.End("BridgeOrders.07") + 0.6;
  s.Caption(go, 4.0, "（班长把人一个个塞进散兵坑。顺子的位置正对东边来的那条路）");
  ["Luo", "HeYoutian", "LiuWencai", "Yaowa", "Squad1", "Squad2"].forEach((id, i) => s.Walk(id, go + 0.2 + i * 0.5, trenchFor(id), { speed: 1.6, yawDeg: -90, aim: true }));
  s.Eye(go, 1.6, { stance: "stand", look: he, pitch: -2, toLook: Pt(-132, 616.5), toPitch: -3 });
  s.Eye(go + 1.6, 6.0, { stance: "stand", look: Pt(-132, 616.5), pitch: -3, toYaw: -90, toPitch: 0 });
  s.Caption(go + 4.4, 2.6, "（等后头的人过桥）");
  void first;
  return s.Done({ durationS: go + 8.0 });
}

function S1802(ctx) {
  const s = new Seq(ctx, "18-2", "等：最后一个人上桥");
  const P = KP(ctx, "18-2");
  const K = id => KU(ctx, "18-2", id);
  const officer = Pt(K("BridgeOfficer").x, K("BridgeOfficer").z), luo = Pt(K("Luo").x, K("Luo").z), yaowa = Pt(K("Yaowa").x, K("Yaowa").z);
  const bridgeLook = BP(665);
  const ijaIds = Array.from({ length: 10 }, (_, i) => `Ija${i + 1}`);
  const down = new Set();
  // 撤下来的人一个个过桥；老耿牵着妮儿在桥上往南
  s.Eye(0, 6.0, { stance: "stand", yaw: -90, pitch: 0 });
  s.Caption(0.4, 5.0, "（天快黑透了，东边那条路上还有人往这边来：三三两两的伤兵、一副担架、几个扛着机枪的兵、拖儿带女的老百姓。他们一到桥头就挤上浮桥）");
  for (const [id, t0, mps] of [["Straggler1", 1.0, 1.8], ["Straggler2", 1.4, 2.2], ["Refugee1", 1.8, 2.0], ["Straggler3", 2.2, 2.4], ["Refugee2", 2.6, 2.0]]) s.Walk(id, t0, BP(641, id.endsWith("2") ? 0.5 : -0.4), { speed: mps });
  s.Go("Geng", 0, 34.0, BR.x - 0.3, 704, { move: "walk", yawDeg: 180 });
  s.Go("Nier", 0, 34.0, BR.x + 0.5, 705.2, { move: "walk", yawDeg: 180 });
  s.Go("Geng", 34.0, 64.0, BR.x - 0.3, 740, { move: "walk", yawDeg: 180 });
  s.Go("Nier", 34.0, 64.0, BR.x + 0.5, 741, { move: "walk", yawDeg: 180 });
  s.Go("LitterCross", 0, 42.0, BR.x, 740, { move: "walk", yawDeg: 180 });
  s.Eye(6.0, 1.6, { stance: "stand", yaw: -90, pitch: 0, toLook: bridgeLook, toPitch: -2 });
  s.Caption(6.4, 4.0, "（桥上一个接一个地过，老耿牵着妮儿也在里头，踩着一沉一沉的桥板往南走）");
  s.Eye(7.6, 2.4, { stance: "stand", look: bridgeLook, pitch: -2 });
  s.Eye(10.0, 1.4, { stance: "stand", look: bridgeLook, pitch: -2, toYaw: -90, toPitch: 0 });
  // 鬼子跟上来了：麦地里枪口火一闪一闪，先零星后连成一片；散开往前跃进
  s.Caption(11.0, 5.0, "（鬼子跟上来了：路两边麦地里的枪口火一闪一闪，先是零星几枪，后来连成一片；鬼子散开往前跃进）");
  const IjaShot = (t, i, volume = 0.45) => { const id = ijaIds[i]; if (down.has(id)) return; s.Ev(t, "muzzle", { actor: id }); const p = s.pos.get(id); s.Sfx(t, "rifleShot", { x: R(p.x), z: R(p.z), volume }); };
  for (let k = 0; k < 44; k++) IjaShot(10.0 + k * 1.15 + ((k * 3) % 4) * 0.12, (k * 7) % 10);
  for (const t of [18.0, 33.0, 52.0]) s.Sfx(t, "rifleVolley", { x: -10, z: 606, volume: 0.6 });
  // 路南麦地里的（Ija7–10）跃进时贴着路南浅沟外沿走（z 617），别跳进排水沟
  const boundZ = (id, z) => (z > ROAD_Z ? 617.0 : z);
  ijaIds.forEach((id, i) => { const p = s.pos.get(id); const st = K(id).stance; s.Go(id, 12.0 + i * 0.7, 16.0 + i * 0.7, p.x - 14, boundZ(id, p.z), { move: "run", yawDeg: 90, ...(st ? { stance: st } : {}), aim: true }); });
  ijaIds.forEach((id, i) => { const p = s.pos.get(id); s.Go(id, 48.0 + i * 0.8, 53.0 + i * 0.8, p.x - 16, boundZ(id, p.z), { move: "run", yawDeg: 90, aim: true }); });
  // 玩家打冲在前头、朝撤下来的人开枪的鬼子
  s.Caption(16.8, 3.0, "（打那些冲在前头、朝撤下来的人开枪的鬼子）");
  for (const t of [17.5, 19.0, 21.0]) Shot(s, t, "player", { volume: 0.9 });
  s.Key("Ija2", 19.3, { state: "down" }); down.add("Ija2");
  s.Key("Ija4", 21.3, { state: "down" }); down.add("Ija4");
  for (const [id, t] of [["Luo", 14.0], ["HeYoutian", 15.2], ["LiuWencai", 16.1], ["BridgeGuard1", 18.4], ["Squad1", 20.2], ["Luo", 23.5], ["HeYoutian", 27.0], ["BridgeGuard3", 31.0], ["LiuWencai", 44.0], ["Luo", 50.0]]) Shot(s, t, id, { volume: 0.7 });
  s.Caption(22.0, 3.4, "（撤下来的人一个个从顺子身边跑过去，越来越稀，跟 03 那个坑一样）");
  // 越来越糟 ①：路边架起一挺机枪往桥头扫，桥板上有人中枪掉进河里
  s.Spawn("BridgeHit", { side: "nra", x: BR.x + 0.4, z: 656, yawDeg: 180, role: "walkingWounded" }, { visible: true });
  s.Go("BridgeHit", 12.0, 26.4, BR.x + 0.4, 672, { move: "walk", yawDeg: 180 });
  MgBurst(s, 25.0, { puffs: [Pt(-149.2, 641), Pt(-150.6, 643.5), Pt(-148.8, 646.2)] });
  s.Key("BridgeHit", 26.4, { state: "down" });
  s.Key("BridgeHit", 28.0, { visible: false });
  s.Caption(25.5, 4.0, "（鬼子在路边架起一挺机枪往桥头扫，桥板上有人中枪掉进河里）");
  s.Eye(25.4, 1.2, { stance: "stand", yaw: -90, pitch: 0, toLook: BP(668), toPitch: -2 });
  s.Eye(26.6, 2.4, { stance: "stand", look: BP(668), pitch: -2 });
  s.Eye(29.0, 1.4, { stance: "stand", look: BP(668), pitch: -2, toYaw: -90, toPitch: 0 });
  MgBurst(s, 30.6, { volume: 0.7, puffs: [Pt(-146, 626), Pt(-147.5, 628)] });
  // ②：掷弹筒「嘭」一声，过几秒落在散兵坑前头（越落越近）
  Mortar(s, 30.0, Pt(-118.0, 614.2), { shake: 0.25 });
  Mortar(s, 38.0, Pt(-124.0, 615.6), { shake: 0.35 });
  Mortar(s, 46.0, Pt(-128.6, 617.4), { shake: 0.5 });
  s.Caption(35.2, 3.0, "（掷弹筒「嘭」一声，过几秒落在散兵坑前头）");
  // ③：军官冲工兵喊「准备点火！」
  s.Caption(36.0, 2.4, "（桥头军官看着越来越近的枪口火，冲工兵喊）");
  s.Eye(36.0, 1.4, { stance: "stand", yaw: -90, pitch: 0, toLook: officer, toPitch: -2 });
  s.Key("BridgeOfficer", 37.0, { faceTo: "Sapper1" });
  const ready = s.Say("HoldTheBridge.01", "BridgeOfficer", 37.4);
  s.Eye(37.4, 2.2, { stance: "stand", look: officer, pitch: -2 });
  s.Eye(39.6, 1.4, { stance: "stand", look: officer, pitch: -2, toYaw: -90, toPitch: 0 });
  // 最后一拨人：被机枪压在土坎后头
  s.Caption(41.0, 6.0, "（路那头出现了最后一拨人：三四个兵拖着一个伤的，是 02 坡顶上冲顺子他们喊「快过来！」的那个班剩下的人。他们被机枪压在路边土坎后头，过不来）");
  s.Eye(41.0, 1.4, { stance: "stand", yaw: -90, pitch: 0, toLook: LAST_COVER, toPitch: 0 });
  s.Eye(42.4, 4.6, { stance: "stand", look: LAST_COVER, pitch: 0 });
  MgBurst(s, 42.0, { puffs: [Pt(-74.6, 603.4), Pt(-73.8, 605.2), Pt(-73.0, 606.9)] });
  s.Eye(47.0, 1.0, { stance: "stand", look: LAST_COVER, pitch: 0, toLook: officer, toPitch: -2 });
  // 炸！不等了！／还有人！／鬼子都上来了！／再等一哈！……顺儿！那挺机枪！
  const now = s.Say("HoldTheBridge.02", "BridgeOfficer", 48.0);
  s.Key("BridgeOfficer", now - 0.3, { faceTo: "Luo" });
  s.Eye(48.0, s.End("HoldTheBridge.02") - 48.0 + 0.2, { stance: "stand", look: officer, pitch: -2 });
  const still = s.Say("HoldTheBridge.03", "Luo");
  s.Key("Luo", still - 0.3, { faceTo: "BridgeOfficer" });
  s.Eye(still - 0.2, 0.7, { stance: "stand", look: officer, pitch: -2, toLook: luo, toPitch: -12 });
  s.Eye(still + 0.5, s.End("HoldTheBridge.03") - still - 0.5 + 0.2, { stance: "stand", look: luo, pitch: -12 });
  const up = s.Say("HoldTheBridge.04", "BridgeOfficer");
  s.Eye(up - 0.2, 0.7, { stance: "stand", look: luo, pitch: -12, toLook: officer, toPitch: -2 });
  s.Eye(up + 0.5, s.End("HoldTheBridge.04") - up - 0.5 + 0.1, { stance: "stand", look: officer, pitch: -2 });
  const wait = s.Say("HoldTheBridge.05", "Luo");
  s.Eye(wait - 0.2, 0.7, { stance: "stand", look: officer, pitch: -2, toLook: luo, toPitch: -12 });
  s.Key("Luo", wait + 1.3, { faceTo: "player" });
  s.Key("Luo", wait + 2.2, { faceTo: MG });
  s.Eye(wait + 0.5, s.End("HoldTheBridge.05") - wait - 0.5, { stance: "stand", look: luo, pitch: -12 });
  const hit = s.End("HoldTheBridge.05");
  s.Eye(hit, 1.2, { stance: "stand", look: luo, pitch: -12, toLook: MG, toPitch: 0 });
  s.Caption(hit + 0.3, 2.6, "（打掉那挺机枪）");
  MgBurst(s, hit + 0.2, { count: 6, puffs: [Pt(-133.4, 614.6), Pt(-134.2, 616.2)] });
  s.Eye(hit + 1.2, 8.0, { stance: "stand", look: MG, pitch: 0 });
  for (const t of [hit + 1.0, hit + 2.2, hit + 3.4]) Shot(s, t, "player", { volume: 0.9 });
  s.Key("IjaMg", hit + 2.4, { state: "down" });
  s.Key("IjaMgLoader", hit + 3.6, { state: "down" });
  s.Key("IjaMgLoader", hit + 3.0, { x: MG.x + 0.4, z: MG.z + 0.4, move: "crawl", stance: "prone" });
  // 机枪一哑，幺娃从坑里站起来冲他们挥手：快过来！快过来！
  const wave = hit + 4.4;
  s.Key("Yaowa", wave - 0.2, { stance: "stand", aim: false, faceTo: LAST_COVER });
  s.Key("Yaowa", wave, { clip: "PointBlockade" });
  s.Caption(wave - 0.2, 2.4, "（机枪哑了。幺娃从坑里站起来冲他们挥手）");
  s.Eye(wave - 0.4, 1.0, { stance: "stand", look: MG, pitch: 0, toLook: yaowa, toPitch: -8 });
  const come = s.Say("LastOnes.01", "Yaowa", wave + 0.2);
  s.Key("Yaowa", s.End("LastOnes.01") + 1.0, { clip: null, aim: true, faceTo: LAST_COVER });
  s.Eye(wave + 0.6, s.End("LastOnes.01") - wave - 0.6 + 0.4, { stance: "stand", look: yaowa, pitch: -8 });
  // 那几个人爬起来往这边跑；领头的跑过顺子身边：后头没得人了！
  const run = s.End("LastOnes.01") + 0.4;
  s.Eye(run, 1.2, { stance: "stand", look: yaowa, pitch: -8, toLook: LAST_COVER, toPitch: 0 });
  s.Caption(run + 0.2, 3.0, "（那几个人爬起来往这边跑）");
  for (const id of ["LastGroup1", "LastGroup2", "LastGroup3"]) s.Key(id, run, { stance: "stand", aim: false });
  const lead = s.Walk("LastGroup1", run + 0.3, Pt(-140.6, 612.4), { move: "run", speed: 3.5, yawDeg: 90 });
  s.Walk("LastGroup2", run + 0.6, Pt(-141.4, 611.2), { move: "run", speed: 3.4, yawDeg: 90 });
  s.Walk("LastGroup3", run + 0.9, Pt(-142.2, 613.0), { move: "run", speed: 2.2, yawDeg: 90 });
  s.Walk("LastWounded", run + 0.9, Pt(-142.8, 612.2), { move: "walk", speed: 2.2, yawDeg: 90, lie: "along" });
  s.Caption(run + 3.4, 3.0, "（三个兵拖着那个伤的，被子一样拖在路上）");
  // 领头那个跑过玩家身边（x 到 −128 左右）时喊
  const cur = s.pos.get("LastGroup1");
  const passT = R(lead - Dist(Pt(-128, 612), cur) / 3.5);
  s.Eye(run + 1.2, passT - run - 2.2, { stance: "stand", look: LAST_COVER, pitch: 0, toYaw: -90, toPitch: 0 });
  // 眼睛跟着领头那个从身边跑过去（眼睛不动，只转头）
  s.Cam(passT - 1.0, lead - passT + 2.0, { from: { x: P.x, z: P.z, h: 1.62 }, look: { actor: "LastGroup1", offset: [0, 1.3, 0] }, ease: "linear" });
  s.Say("LastOnes.02", "LastGroup1", passT);
  s.Caption(lead + 0.2, 2.0, "（后头没得人了）");
  void ready; void come; void P;
  return s.Done({ durationS: lead + 2.4 });
}

function S1803(ctx) {
  const s = new Seq(ctx, "18-3", "过桥：点！");
  const K = id => KU(ctx, "18-3", id);
  const K2 = id => KU(ctx, "18-2", id), K4 = id => KU(ctx, "18-4", id);
  const trench = Pt(K2("Luo").x, K2("Luo").z);
  const officerS = Pt(K("BridgeOfficer").x, K("BridgeOfficer").z), sapperS = Pt(K("Sapper1").x, K("Sapper1").z);
  const squad = ["Yaowa", "HeYoutian", "LiuWencai", "Squad1", "Squad2", "BridgeGuard1", "BridgeGuard2", "BridgeGuard3"];
  // 开场大家还在坑里（从 18-2 的坑位起）
  for (const id of ["Luo", ...squad]) s.Place(id, 0, K2(id).x, K2(id).z, { yawDeg: -90, aim: true });
  s.Key("Luo", 0.2, { faceTo: "player" });
  const eyeTrench = Pt(K2("Luo").x + 0.4, K2("Luo").z - 2.1);   // 顺子的坑位（18-2 的机位）
  s.Eye(0, 2.4, { stance: "stand", x: eyeTrench.x, z: eyeTrench.z, look: trench, pitch: -6 });
  s.Say("CrossNow.01", "Luo", 0.6);
  s.Caption(2.0, 3.4, "（全班从坑里爬出来往桥上跑；班长走在最后，倒退着边打边撤）");
  // 全班跑过桥，扑到南岸河堤后头（18-4 的位置）
  squad.forEach((id, i) => s.Walk(id, 2.0 + i * 0.5, Pt(K4(id).x, K4(id).z), { move: "run", speed: 3.4, yawDeg: 0 }));
  // 班长：一截一截倒退着撤（跑一截、停下朝北打一枪）
  const hops = [Pt(-138, 612.6), Pt(-150, 628), BP(648, -0.4), BP(666, -0.4), BP(684, -0.4), BP(706, -0.3)];
  let t = 3.0;
  for (const h of hops) {
    const cur = s.pos.get("Luo");
    const t1 = R(t + Dist(cur, h) / 3.5);
    s.Go("Luo", t, t1, h.x, h.z, { move: "run", yawDeg: 0, aim: true });
    Shot(s, t1 + 0.4, "Luo", { volume: 0.8 });
    t = R(t1 + 1.0);
  }
  const luoSouth = t;
  s.Walk("Luo", luoSouth + 2.0, Pt(K4("Luo").x, K4("Luo").z), { move: "run", speed: 3.4, yawDeg: 0, aim: true });
  // 眼睛：从坑里跑出来，过空场、引道、桥面、南引道；桥面上一沉一晃，回头看一眼班长
  const route = [eyeTrench, Pt(-134.2, 612.4), Pt(-142, 614), Pt(-150, 626), Pt(-150, 638), BP(646), BP(704), Pt(-150.5, 709)];
  const MPS = 3.2, H = 1.55;
  let tt = 2.4;
  const legs = [];
  for (let i = 1; i < route.length; i++) { const dur = R(Dist(route[i - 1], route[i]) / MPS); legs.push({ i, t0: tt, dur }); tt = R(tt + dur); }
  const Lk = p => ({ ...p, h: 1.0 });
  for (const { i, t0, dur } of legs) {
    const a = route[i - 1], b = route[i], next = route[i + 1] || Pt(b.x, b.z + 6);
    if (b.z === BP(704).z && a.z === BP(646).z) {
      // 桥面这一段：先看南头，回头看班长一眼，再看南头
      const lerp = k => Pt(a.x + (b.x - a.x) * k, a.z + (b.z - a.z) * k);
      const k1 = 6.0 / dur, k2 = 9.0 / dur;
      s.WalkEye(t0, 6.0, a, lerp(k1), Lk(b), { lookTo: { actor: "Luo", offset: [0, 1.3, 0] }, h: H, shake: 0.12, ease: "inOut" });
      s.WalkEye(t0 + 6.0, 3.0, lerp(k1), lerp(k2), { actor: "Luo", offset: [0, 1.3, 0] }, { lookTo: Lk(b), h: H, shake: 0.12, ease: "inOut" });
      s.WalkEye(t0 + 9.0, dur - 9.0, lerp(k2), b, Lk(b), { lookTo: Lk(next), h: H, shake: 0.12 });
    } else s.WalkEye(t0, dur, a, b, Lk(b), { lookTo: Lk(next), h: H });
  }
  const atSouth = tt;
  s.Caption(legs[5].t0 + 1.0, 4.0, "（浮桥在脚底下一沉一晃，板缝里是黑水，子弹打进水里噗噗地响）");
  for (const [k, p] of [[2.0, Pt(-152.4, 662)], [3.6, Pt(-147.4, 668)], [6.2, Pt(-152.6, 676)], [9.0, Pt(-147.6, 684)], [12.5, Pt(-152.2, 693)]]) s.Ev(legs[5].t0 + k, "explosion", { x: p.x, z: p.z, kind: "grenade", radius: 0.6, h: 0 });
  // 鬼子追到桥头空场东边，朝桥上打；机枪远远地扫
  const ijaE = Array.from({ length: 8 }, (_, i) => `Ija${i + 1}`);
  for (let k = 0; k < 30; k++) { const id = ijaE[(k * 5) % 8]; const t0 = 3.0 + k * 1.3 + ((k * 3) % 3) * 0.17; s.Ev(t0, "muzzle", { actor: id }); const p = s.pos.get(id); s.Sfx(t0, "rifleShot", { x: R(p.x), z: R(p.z), volume: 0.5 }); }
  for (const t0 of [8.0, 20.0, 32.0]) s.Sfx(t0, "mgBurstFar", { x: MG.x, z: MG.z, volume: 0.45 });
  // 南岸桥头：工兵蹲着捏着引线等；班长最后一个踏上南岸；军官：点！
  s.Eye(atSouth, luoSouth - atSouth + 0.6, { stance: "stand", x: -150.5, z: 709, look: BP(690), pitch: -1 });
  s.Caption(atSouth + 0.4, 3.0, "（南岸桥头上，工兵蹲着，手里捏着引线等）");
  s.Caption(luoSouth + 0.2, 2.0, "（班长最后一个踏上南岸）");
  s.Eye(luoSouth + 0.6, 1.0, { stance: "stand", x: -150.5, z: 709, look: BP(690), pitch: -1, toLook: officerS, toPitch: -4 });
  s.Say("CrossNow.02", "BridgeOfficer", luoSouth + 1.4);
  s.Key("BridgeOfficer", luoSouth + 1.0, { faceTo: "Sapper1" });
  s.Eye(luoSouth + 1.6, 1.6, { stance: "stand", x: -150.5, z: 709, look: officerS, pitch: -4, toLook: sapperS, toPitch: -14 });
  const fuse = s.End("CrossNow.02") + 0.2;
  s.Caption(fuse, 2.6, "（引线嗤嗤地烧过桥板）");
  s.Caption(fuse + 2.6, 2.0, "（大家扑到南岸河堤后头）");
  const cover = Pt(KP(ctx, "18-4").x, KP(ctx, "18-4").z);
  s.WalkEye(fuse + 0.6, 2.6, Pt(-150.5, 709), cover, Lk(BP(652)), { h: H, ease: "inOut" });
  s.Go("Sapper1", fuse + 0.8, fuse + 3.2, K4("Sapper1").x, K4("Sapper1").z, { move: "run", stance: "stand", yawDeg: 0 });
  s.Go("Sapper2", fuse + 0.8, fuse + 3.0, K4("Sapper2").x, K4("Sapper2").z, { move: "run", yawDeg: 0 });
  s.Go("BridgeOfficer", fuse + 1.0, fuse + 3.4, K4("BridgeOfficer").x, K4("BridgeOfficer").z, { move: "run", yawDeg: 0 });
  // 「轰」：北头那几条船炸开，木板和水一起掀上天；浮桥从中间断开，断的半截着了火往下游打转
  const boom = fuse + 3.6;
  s.Ev(boom, "flash", { dur: 0.3, strength: 0.6 });
  [BP(648), BP(652.2), BP(656.4), BP(660.5)].forEach((p, i) => s.Ev(boom + i * 0.15, "explosion", { x: p.x, z: p.z, kind: "shell", radius: 6, h: 0.5 }));
  s.Sfx(boom, "shellBlast", { x: BR.x, z: 652, volume: 1.0 });
  s.Ev(boom + 0.1, "smoke", { x: BR.x, z: 650, kind: "SmokeWhite", dur: 6 });
  s.Ev(boom + 0.2, "smoke", { x: BR.x + 0.5, z: 656, kind: "SmokeDust", dur: 5 });
  BR.debris.forEach((p, i) => s.Ev(boom + 1.0 + i * 0.3, "smoke", { x: p.x, z: p.z, kind: "SmokeBlack", dur: 20 }));
  s.Shake(boom, 1.6, 0.9);
  s.Signal(boom + 0.2, SIG.bridgeBlown, true);
  s.Caption(boom + 0.8, 5.0, "（「轰」的一声，北头那几条船炸开，木板和水一起掀上天。浮桥从中间断开，断了的半截被水冲着往下游打转，着了火）");
  s.Eye(fuse + 3.2, 7.0, { stance: "stand", x: cover.x, z: cover.z, look: BP(652), pitch: 2, shake: 0.5 });
  return s.Done({ durationS: boom + 6.6 });
}

function S1804(ctx) {
  const s = new Seq(ctx, "18-4", "对岸：马灯还亮着");
  const K = id => KU(ctx, "18-4", id);
  const luo = Pt(K("Luo").x, K("Luo").z);
  const leveeIja = Array.from({ length: 16 }, (_, i) => `LeveeIja${i + 1}`);
  // 着火的船把北岸照亮了：鬼子涌到对岸堤上朝这边开枪，过不来
  BR.debris.forEach((p, i) => s.Ev(0 + i * 0.2, "smoke", { x: p.x, z: p.z, kind: "SmokeBlack", dur: 22 }));
  s.Eye(0, 8.0, { stance: "stand", yaw: 0, pitch: 2 });
  s.Caption(0.4, 5.0, "（着火的船把北岸照亮了：鬼子一排排涌到对岸河堤上，后头路上还有战车的影子。他们朝这边开枪，可是过不来）");
  for (let k = 0; k < 14; k++) { const id = leveeIja[(k * 5) % 16]; const t = 0.8 + k * 0.95 + ((k * 3) % 3) * 0.11; s.Ev(t, "muzzle", { actor: id }); const p = s.pos.get(id); s.Sfx(t, "rifleShot", { x: R(p.x), z: R(p.z), volume: 0.4 }); }
  for (const [t, p] of [[3.4, Pt(-144.2, 715.4)], [7.1, Pt(-148.6, 715.1)], [11.8, Pt(-141.0, 715.6)]]) Puff(s, t, p);
  for (const [id, t] of [["Luo", 2.0], ["HeYoutian", 4.2], ["LiuWencai", 5.6], ["Luo", 9.4]]) Shot(s, t, id, { volume: 0.7 });
  s.Sfx(6.0, "tankTracks", { x: -118, z: 612, volume: 0.3 });
  // 北岸那几间院子里，马灯还亮着
  s.Eye(8.0, 1.6, { stance: "stand", yaw: 0, pitch: 2, toLook: GATE_LAMP, toPitch: 3 });
  s.Caption(9.0, 3.6, "（北岸那几间院子里，马灯还亮着）");
  s.Eye(9.6, 3.6, { stance: "stand", look: GATE_LAMP, pitch: 3 });
  // 班长：走！看你妈啥子，走！
  s.Key("Luo", 12.6, { faceTo: "player" });
  s.Eye(13.2, 1.0, { stance: "stand", look: GATE_LAMP, pitch: 3, toLook: luo, toPitch: -4 });
  const go = s.Say("KeepMoving.01", "Luo", 13.8);
  s.Eye(14.2, s.End("KeepMoving.01") - 14.2 + 0.4, { stance: "stand", look: luo, pitch: -4 });
  const run = s.End("KeepMoving.01") + 0.4;
  s.Caption(run, 3.6, "（往南跑进黑里，身后的枪声慢慢远了）");
  const P = KP(ctx, "18-4");
  ["Luo", "Yaowa", "HeYoutian", "LiuWencai", "Squad1", "Squad2", "BridgeGuard1", "BridgeGuard2", "BridgeGuard3", "Sapper1", "Sapper2", "BridgeOfficer"].forEach((id, i) => {
    const p = s.pos.get(id);
    s.Go(id, run + 0.2 + i * 0.25, run + 4.0 + i * 0.25, BR.x + ((i % 5) - 2) * 0.9, 730 + (i % 3) * 1.4, { move: "run", yawDeg: 180, aim: false, path: [Pt(p.x + (BR.x - p.x) * 0.4, 722)] });
  });
  s.WalkEye(run + 0.6, 4.4, Pt(P.x, P.z), Pt(-149.4, 727), { x: BR.x, z: 760, h: 1.0 }, { ease: "inOut" });
  s.Sfx(run + 2.4, "rifleShot", { x: -160, z: 634, volume: 0.2 });
  s.Sfx(run + 3.8, "rifleShot", { x: -140, z: 634, volume: 0.15 });
  void go;
  return s.Done({ durationS: run + 5.4 });
}

function S1805(ctx) {
  const s = new Seq(ctx, "18-5", "夜里，北门");
  const P = KP(ctx, "18-5");
  const K = id => KU(ctx, "18-5", id);
  const geng = Pt(K("Geng").x, K("Geng").z), guide = Pt(K("Guide").x, K("Guide").z), water = Pt(K("WaterMan").x, K("WaterMan").z);
  const column = ["Luo", "Geng", "Nier", "Refugee1", "Refugee2", "Refugee3", "HeYoutian", "LiuWencai", "Squad1", "Squad2", "LitterCross", "BridgeGuard1", "BridgeGuard2"];
  // 黑场，只有脚步声；日期字幕
  s.Ev(0, "black", { dur: 6.0, fade: 0.6 });
  s.Caption(0.8, 4.4, NORTH_GATE_CAPTION);
  // 淡入：一长溜队伍在夜里往南走（镜头在队伍里走，看着前头的城门）
  const T1 = 6.0, T2 = 12.0, D1 = 8.0;
  const eye0 = Pt(P.x, P.z - D1), eye1 = Pt(P.x, P.z);
  for (const id of column) s.Shift(id, T1 - 0.2, T2, 0, D1, { yawDeg: 180 });
  s.Place("Yaowa", T1 - 0.3, geng.x + 2.4, geng.z - 0.6, { yawDeg: 180 });
  s.Shift("Yaowa", T1 - 0.2, T2, 0, D1, { faceTo: "Geng" });
  s.WalkEye(T1 - 0.6, T2 - T1 + 0.6, eye0, eye1, { ...NORTH_GATE, h: 3 });
  s.Caption(T1 + 0.5, 4.0, "（一长溜队伍在夜里往南走，有兵，有担架，有老百姓）");
  s.Caption(T1 + 4.6, 3.6, "（老耿牵着妮儿走在百姓堆里，身上还是那件单褂子）");
  // 幺娃问，老耿答；没人接
  const gengNow = Pt(geng.x, geng.z + D1);
  s.Eye(T2, 1.2, { stance: "stand", look: NORTH_GATE, pitch: 2, toLook: gengNow, toPitch: -4 });
  const ask = s.Say("NorthGate.01", "Yaowa", T2 + 1.2);
  const answer = s.Say("NorthGate.02", "Geng");
  s.Eye(T2 + 1.2, s.End("NorthGate.02") - T2 - 1.2 + 0.6, { stance: "stand", look: gengNow, pitch: -4 });
  s.Caption(s.End("NorthGate.02") + 0.3, 2.0, "（没人接这句话）");
  // 接着走到门口：城墙、火把、运沙土的小车、舀水的
  const T3 = s.End("NorthGate.02") + 1.0, D2 = 8.5, T4 = R(T3 + D2 / 1.4);
  // 走到门口的人往门洞（x −152…−148）收拢，沿路网从门洞正中进去；后头的照直往前挪
  for (const id of [...column, "Yaowa"]) {
    const cur = s.pos.get(id), z = cur.z + D2;
    if (z > SO.wall.z - SO.wall.t / 2 - 1.5) s.Walk(id, T3, Pt(Math.max(-151.2, Math.min(-148.8, cur.x)), z), { tArrive: T4, yawDeg: 180 });
    else s.Shift(id, T3, T4, 0, D2, { yawDeg: 180 });
  }
  s.WalkEye(T3, T4 - T3, eye1, Pt(P.x, P.z + D2), gengNow, { lookTo: { ...NORTH_GATE, h: 3 }, ease: "inOut" });
  s.Caption(T3 + 0.4, 6.0, "（前头是黑压压的城墙，北门洞里点着火把。门口没人在欢迎谁：兵和老百姓推着小车往城墙上运沙土、扛木料，在连夜修工事）");
  s.Go("SandCart1", T3, T3 + 3.0, SO.sandCarts[0].x, 855.6, { move: "walk", yawDeg: 180 });
  s.Go("SandCart2", T3 + 1.0, T3 + 4.0, SO.sandCarts[1].x, 855.6, { move: "walk", yawDeg: 180 });
  s.Go("SandCart1", T3 + 5.0, T3 + 8.0, SO.sandCarts[0].x, SO.sandCarts[0].z - 1.3, { move: "walk", yawDeg: 0 });
  s.Key("WaterMan", T3 + 2.0, { faceTo: "player" });
  s.Caption(T4 - 0.4, 3.0, "（门洞边有人提着一桶水，给进城的人一人舀一瓢）");
  s.Eye(T4, 1.4, { stance: "stand", x: P.x, z: P.z + D2, look: NORTH_GATE, pitch: 3, toLook: water, toPitch: -6 });
  s.Eye(T4 + 1.4, 1.6, { stance: "stand", x: P.x, z: P.z + D2, look: water, pitch: -6, toLook: guide, toPitch: -2 });
  s.Key("Guide", T4 + 1.4, { faceTo: "player" });
  const follow = s.Say("NorthGate.03", "Guide", T4 + 3.0);
  s.Eye(T4 + 3.0, s.End("NorthGate.03") - T4 - 3.0 + 0.4, { stance: "stand", x: P.x, z: P.z + D2, look: guide, pitch: -2 });
  // 进门洞；城里的街往南伸进黑里，看一眼；黑场，第一关结束
  const T5 = s.End("NorthGate.03") + 0.4, inGate = Pt(NORTH_GATE.x, NORTH_GATE.z + 4.5), T6 = R(T5 + Dist(Pt(P.x, P.z + D2), inGate) / 1.4);
  s.WalkEye(T5, T6 - T5, Pt(P.x, P.z + D2), inGate, { x: SO.street.x, z: SO.street.toZ, h: 1.0 });
  s.Caption(T5 + 0.4, 2.4, "（顺子进了门洞）");
  for (const id of ["Luo", "Geng", "Nier", "Yaowa", "Refugee1", "Refugee2", "Refugee3"]) s.Walk(id, T5, Pt(NORTH_GATE.x + ((id.length % 3) - 1) * 1.0, NORTH_GATE.z + 8 + (id.length % 4) * 1.2), { speed: 1.4, yawDeg: 180 });
  s.Eye(T6, 3.4, { stance: "stand", x: inGate.x, z: inGate.z, look: Pt(SO.street.x, SO.street.toZ), pitch: -2 });
  s.Caption(T6 + 0.2, 3.0, "（城里的街往南伸进黑里，他看了一眼）");
  s.Ev(T6 + 3.0, "black", { dur: 5.0, fade: 1.2 });
  s.Caption(T6 + 5.0, 3.0, "（第一关结束）");
  void ask; void answer; void follow;
  return s.Done({ durationS: T6 + 8.0, then: "stay" });
}

export const SEQUENCE_BUILDERS = Object.freeze([
  S1201, S1202, S1203, S1301, S1302, S1401, S1402, S1501, S1502, S1503,
  S1601, S1701, S1702, S1703, S1801, S1802, S1803, S1804, S1805,
]);

/** 生成整份预演文档（纯函数：只依赖传入的配置与台词清单）。 */
export function BuildPreviz({ config, voice }) {
  const ctx = { config, voice: VoiceIndex(voice) };
  const sequences = SEQUENCE_BUILDERS.map(build => build(ctx));
  const order = config.keyframes.map(k => k.id);
  sequences.sort((a, b) => order.indexOf(a.keyframe) - order.indexOf(b.keyframe));
  return {
    schema: "tengxian-blockout-previz/1",
    level: "FirstLevel1218",
    title: "第一关 12–18 预演（占位动作 + 占位配音）",
    source: { generator: "node Taierzhuang1938/Script_EditorBlockoutFirstLevel1218Previz.mjs --force", note: "剧本：12–18 扩写稿（2026-10-19，还没进 Notion）；手改前先想好：重跑生成器会覆盖" },
    voice: "./Blockout/FirstLevel1218.voice.json",
    faceTracks: "./Audio/Blockout1218/Data_Blockout1218FaceTracks.json",
    sequences,
  };
}

// ---------------------------------------------------------------------------
// 命令行

async function Main(argv) {
  const config = LoadJson(CONFIG_FILE), voice = LoadJson(VOICE_FILE);
  const doc = BuildPreviz({ config, voice });
  const { CheckPreviz } = await import("./Script_EditorBlockoutFirstLevel1218PrevizTest.mjs");
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
