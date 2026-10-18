// ===========================================================================
// Script_EditorBlockoutFirstLevel0610Previz.mjs —— 第一关 06–10 白盒（FirstLevel0610）的预演数据生成器
//
//   node Taierzhuang1938/Script_EditorBlockoutFirstLevel0610Previz.mjs            → 只校验、打印摘要，不写
//   node Taierzhuang1938/Script_EditorBlockoutFirstLevel0610Previz.mjs --force    → 写 Blockout/FirstLevel0610.previz.json
//   node Taierzhuang1938/Script_EditorBlockoutFirstLevel0610Previz.mjs --report   → 另打印每段一行摘要与用到的片段
//
// 格式：docs/Data_EditorBlockout.md §14（tengxian-blockout-previz/1）。剧本口径：Notion「第一关｜往南的路 · 剧本」06–10
// （10-18 晚定稿），空间口径：Data_EditorBlockoutFirstLevel0610Space.mjs，布设：Blockout/FirstLevel0610.json（只读）。
// 台词：Blockout/FirstLevel0610.voice.json 的句子 id；同一段里按录音的原始间隔 gapBeforeS 往后排（只会拉长、不会压短）。
// 写法完全照 Script_EditorBlockoutFirstLevel0105Previz.mjs（那份文件不动）。
//
// 片段按骨架：有 castId 的单位骨架固定，只给它那具骨架烘过的片段；没有 castId 的士兵只用五具骨架都有的通用片段；
// 百姓（老耿 / 妮儿 / 村民 / 窖里一家）和军官是程序化身体，没有动作库 —— 一律不给 clip，用走位 / 姿态 / 说明字顶
// （缺口清单见 docs/Data_EditorBlockout.md §15 末尾）。
//
// 门缝 / 墙缝那几段（09-2 / 09-3）：镜头一直是顺子的眼睛贴在缝后头看出去（SlitEye：眼睛放在「缝 → 目标」连线上、
// 缝后 0.35 m、视场收窄到 40°），不给特写；缝只有几度宽，看得见什么由缝的几何决定，演员的动作都排在那条缝的扇面里。
//
// 确定性：不读时钟、不读 git；同样的输入两次输出逐字相同。
// ===========================================================================

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  L0610_PLACES as PL, L0610_GENG as G, L0610_NEIGHBOR as NB, L0610_STREETS as ST, L0610_SIGNALS as SIG, L0610_EAST_YARDS as EY,
  LanePointAtZ,
} from "./Data_EditorBlockoutFirstLevel0610Space.mjs";
import { StreetRoute } from "./Script_EditorBlockoutFirstLevel0610Keyframes.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
export const PREVIZ_FILE = join(HERE, "Blockout", "FirstLevel0610.previz.json");
const CONFIG_FILE = join(HERE, "Blockout", "FirstLevel0610.json");
const VOICE_FILE = join(HERE, "Blockout", "FirstLevel0610.voice.json");

// ---------------------------------------------------------------------------
// 小工具

const R = v => Math.round(v * 100) / 100;
/** 朝向：0 北（−Z），+90 西，−90 东。 */
export function Yaw(from, to) { return R(Math.atan2(-(to.x - from.x), -(to.z - from.z)) * 180 / Math.PI); }
const Dist = (a, b) => Math.hypot(b.x - a.x, b.z - a.z);
const Pt = (x, z) => ({ x: R(x), z: R(z) });
const Off = (p, dx, dz) => Pt(p.x + dx, p.z + dz);
/** 凹路上按 z 取中线上的点（lat > 0 = 往南走的左手 = 东）。 */
const LZ = (z, lat = 0) => { const p = LanePointAtZ(z, lat); return Pt(p.x, p.z); };
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

// ---------------------------------------------------------------------------
// 序列构造器（同 0105）

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
  /** 第一人称蹲着挪一段（镜头从 a 平移到 b，一直看着 look）：用 Cam 顶替眼睛的位移。 */
  Creep(t, dur, a, b, look, { h = 1.05, lookH = 1.0, fov, shake } = {}) {
    return this.Cam(t, dur, { from: { ...a, h }, to: { ...b, h }, look: { ...look, h: lookH }, ease: "inOut", ...(fov ? { fov } : {}), ...(shake ? { shake } : {}) });
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

const CART = Pt(PL.cartStop.x, PL.cartStop.z);
const NIER_RIM = Pt(PL.nierRim.x, PL.nierRim.z);
const WINDOW = Pt(PL.northWindow.x, PL.northWindow.z);
const MG_AT = Pt(G.mgPost.x, G.mgPost.z);
const ROOF_AT = Pt(G.roofPost.x, G.roofPost.z);
const CELLAR = Pt(PL.cellar.x, PL.cellar.z);
const MILL = Pt(PL.mill.x, PL.mill.z);
const ROLLER = Pt(PL.roller.x, PL.roller.z);
const EAST_END = Pt(PL.eastEnd.x, PL.eastEnd.z);
const MORTAR = Pt(EY.mortarHide.x, EY.mortarHide.z);
const SIDE_ROOM_DOOR = Pt(PL.sideRoomDoor.x, PL.sideRoomDoor.z);
const KITCHEN_DOOR = Pt(PL.kitchenDoor.x, PL.kitchenDoor.z);
const ROOM_YARD_DOOR = Pt(PL.roomYardDoor.x, PL.roomYardDoor.z);
const GATE_X = (G.carriageGate.minX + G.carriageGate.maxX) / 2;
const WALL_X = G.sharedWall.x, WALL_T = 0.5;
/** 墙缝中心、侧门门缝中心（门扇在南、缝在北侧 0.15 m）。 */
const CRACK = Pt(WALL_X, G.crack.z);
const GATE_CRACK = Pt(WALL_X, G.sideGate.z - G.sideGate.w / 2 + (G.sideGate.w - G.sideGate.leafW) / 2);
export const SLIT_FOV = 40;
export const SLIT_BACK_M = 0.35;
/**
 * 贴着缝看：0.5 m 厚的墙上一道竖缝（缝中心 slit、半宽 hw），斜着看目标时视线要同时穿过墙的近面和远面两个口子，
 * 两个口子错开 T·tanθ ——缝越斜能看的扇面越窄（墙缝 z 496.5 看窖口斜 18°，0.2 m 的缝只剩约 2° 宽；
 * 侧门缝只有薄门扇挡南边，约 15° 宽）。这里把视线固定成「从远面口子的北沿往里 1.7 cm」穿过去，
 * 眼睛放在这条线上、墙面后 back 米；要给人看的东西就排在这条线附近。
 */
export function SlitEye(slit, target, { hw = 0.1, back = SLIT_BACK_M, margin = 0.017 } = {}) {
  const tan = (target.z - slit.z) / (target.x - slit.x);
  const zFar = R(slit.z + hw - margin), xFar = slit.x + WALL_T / 2;
  const far = { x: xFar, z: zFar };
  const d = Dist(far, target);
  const ux = (target.x - far.x) / d, uz = (target.z - far.z) / d;
  const k = WALL_T + back;
  void tan;
  return Pt(far.x - ux * k, far.z - uz * k);
}
/**
 * 侧门门缝后的眼睛：门缝北边是 0.5 m 厚的墙垛（z ≤ 499.5）、南边只有 0.1 m 厚的门扇（x 81.3…81.4，z ≥ 499.655）。
 * 眼睛离墙面 0.35 m、z 499.56：往东能看的扇面约 −4°…+11°（窖口 −0.4°、挑襁褓的地方 +5°、窖沿 +7°、门里贴墙的妮儿 +8°）。
 */
const GATE_EYE = Pt(WALL_X - WALL_T / 2 - SLIT_BACK_M, 499.56);
/** 眼睛 → 目标这条线上、过了目标再往前 m 米的点（把要看的东西排在视线上）。 */
function Along(eye, target, m) {
  const d = Dist(eye, target);
  return Pt(target.x + (target.x - eye.x) / d * m, target.z + (target.z - eye.z) / d * m);
}

/** 掷弹筒一发：嘭（远处冒烟）→ 约 5.5 s 后落地。效果挂落地。 */
function Mortar(s, tPop, hit, { kind = "launcher", radius = 4, shake = 0.45 } = {}) {
  s.Sfx(tPop, "mortarPop", { x: MORTAR.x, z: MORTAR.z });
  s.Ev(tPop, "smoke", { x: MORTAR.x, z: MORTAR.z + 1.5, kind: "SmokeWhite", dur: 4 });
  const tHit = tPop + 5.5;
  s.Sfx(tHit, "mortarImpact", { x: hit.x, z: hit.z });
  s.Ev(tHit, "explosion", { x: hit.x, z: hit.z, kind, radius });
  if (shake) s.Shake(tHit, 0.5, shake);
  return R(tHit);
}
/** 子弹打在土里 / 墙上（小土点）。 */
function Puff(s, t, p) { return s.Ev(t, "explosion", { x: p.x, z: p.z, kind: "grenade", radius: 0.8 }); }
/** 某人开一枪（枪口火 + 枪声）。 */
function Shot(s, t, actor, { count = 1, interval, sfx = "rifleShot", at, volume } = {}) {
  s.Ev(t, "muzzle", { actor, ...(count > 1 ? { count, interval: interval ?? 0.11 } : {}) });
  const p = at || (actor === "player" ? s.player : s.pos.get(actor));
  if (sfx) s.Sfx(t, sfx, { ...(p ? { x: R(p.x), z: R(p.z) } : {}), ...(volume !== undefined ? { volume } : {}) });
  return s;
}
/** 北窗机枪打一梭（朝主街北口）。volume 按听者远近给。 */
function WindowBurst(s, t, { volume = 1, puffAt = null, count = 6, muzzle = true } = {}) {
  if (muzzle) s.Ev(t, "muzzle", { actor: "MgGunner", count, interval: 0.11 });
  s.Sfx(t, "mgBurstFar", { x: MG_AT.x, z: MG_AT.z, volume });
  if (puffAt) { Puff(s, t + 0.25, puffAt); Puff(s, t + 0.55, Off(puffAt, 0.9, 1.4)); }
  return R(t + count * 0.11);
}
/** 街口班长他们朝窗口打几枪（08-3 起一直在打）。 */
function CornerFire(s, t, { volume = 1, who = ["Luo", "LiuWencai", "Squad1"] } = {}) {
  who.forEach((id, k) => Shot(s, t + k * 0.35, id, { volume }));
  return R(t + who.length * 0.35);
}
/** 09 的节奏：街口一打，窗口回一梭；返回这一组结束时刻。 */
function Exchange(s, t, { volume = 0.6, puffAt = null } = {}) {
  CornerFire(s, t, { volume: volume * 0.7 });
  return WindowBurst(s, t + 1.2, { volume, puffAt });
}

// ---------------------------------------------------------------------------
// 06 回到集结处

function S0601(ctx) {
  const s = new Seq(ctx, "06-1", "干沟空了：冬瓜喃");
  const REST = Pt(PL.gullyRest.x, PL.gullyRest.z);
  const he = KU(ctx, "06-1", "HeYoutian");
  // 顺子站在空了的沟里，看冬瓜躺过的地方：只剩血迹和扔下的绷带
  s.Eye(0, 3.6, { stance: "stand", look: REST, pitch: -16 });
  s.Caption(0.6, 3.2, "（冬瓜躺过的地方只剩血迹和扔下的绷带）");
  s.Key("Yaowa", 0, { faceTo: REST });
  const q = s.Say("GullyEmpty.01", null, 2.2);
  // 回头问身后收拾东西的何有田；他答话时没回头
  s.Eye(3.6, 1.0, { stance: "stand", look: REST, pitch: -16, toLook: he, toPitch: -4 });
  s.Key("HeYoutian", 0, { yawDeg: -80 });
  s.Say("GullyEmpty.02", "HeYoutian", q + 2.3);
  s.Caption(s.End("GullyEmpty.02") + 0.2, 2.2, "（他手上还在收拾东西，没回头）");
  // 最后两副担架正往东南头的凹路抬；凹路口停着一辆驴车
  // （这一段只演开头几米：then 跳到 06-2 时他们直接到位）
  s.Go("Litter01", 0.5, 8.5, 58.6, 154.0, { move: "walk", path: [Pt(55, 152.6)] });
  s.Go("Litter02", 1.5, 9.5, 52.4, 153.6, { move: "walk" });
  const lookLitter = s.End("GullyEmpty.02") + 1.2;
  s.Eye(lookLitter, 1.2, { stance: "stand", look: he, pitch: -4, toLook: Pt(52, 152), toPitch: -2 });
  s.Eye(lookLitter + 3.6, 1.4, { stance: "stand", look: Pt(52, 152), pitch: -2, toLook: CART, toPitch: -1 });
  s.Caption(lookLitter + 4.2, 3.0, "（凹路口停着一辆驴车，车上还剩几箱弹药）");
  // 班长带头往凹路口走；其余人跟上（走到 06-2 的位置）
  ["Luo", "LiuWencai", "Yaowa", "Squad1", "Squad2", "Squad3"].forEach((id, k) => {
    const cur = s.pos.get(id), t0 = lookLitter + 1.0 + (id === "Luo" ? 0 : 1.2);
    s.Go(id, t0, t0 + 6.0, cur.x + 8.0, cur.z + (k % 2 ? 0.6 : -0.4), { move: "walk", yawDeg: -90 });
  });
  return s.Done({ durationS: lookLitter + 8.0 });
}

function S0602(ctx) {
  const s = new Seq(ctx, "06-2", "凹路口：喊妮儿让路");
  const K = id => KU(ctx, "06-2", id);
  const he = K("HeYoutian");
  // 老耿已经从车边往坎下走了几步，何有田在坎下冲坎顶喊
  s.Place("Geng", 0, 58.5, 150.6, { faceTo: NIER_RIM });
  s.Key("Nier", 0, { stance: "crouch", yawDeg: 170 });
  s.Place("Squad1", 0, 55.0, 155.6, { faceTo: NIER_RIM });   // 布设里他正好挡在顺子看坎顶的视线上，挪开一步
  s.Eye(0, 2.6, { stance: "stand", look: CART, pitch: -2 });
  s.Caption(0.4, 2.6, "（车被征来给前沿拉弹药，撤的时候车上还剩几箱）");
  // 何有田喊；顺子转头看他，再顺着他看的方向看坎顶上的妮儿
  const shout = s.Say("CartAndNier.01", "HeYoutian", 2.8);
  s.Key("HeYoutian", shout - 0.3, { faceTo: NIER_RIM, talking: true });
  s.Key("HeYoutian", s.End("CartAndNier.01"), { talking: false });
  s.Eye(2.6, 1.0, { stance: "stand", look: CART, pitch: -2, toLook: he, toPitch: -3 });
  s.Eye(shout + 1.4, 1.2, { stance: "stand", look: he, pitch: -3, toLook: NIER_RIM, toPitch: 12 });
  s.Caption(s.End("CartAndNier.01") + 0.3, 2.4, "（她没反应，还在一个一个捡弹壳）");
  // 老耿从车边过去，从坎下爬上坎顶，拍拍她的肩膀，她才抬头
  const go = s.End("CartAndNier.01") + 0.2;
  const foot = Pt(51.6, 141.6);
  const climbEnd = Pt(K("Geng").x, K("Geng").z);
  s.Go("Geng", go, go + Dist(Pt(58.5, 150.6), foot) / 1.4, foot.x, foot.z, { move: "walk" });
  const up = s.pos.get("Geng").t;
  s.Go("Geng", up, up + 3.0, climbEnd.x, climbEnd.z, { move: "walk", stance: "crouch", faceTo: "Nier" });
  s.Caption(up + 3.2, 3.0, "（老耿爬上坎顶，拍拍她的肩膀，她才抬头）");
  s.Key("Nier", up + 4.4, { faceTo: "Geng" });
  // 挪开：沿坎顶往东挪两步
  const aside = Pt(NIER_RIM.x + 1.6, NIER_RIM.z - 0.1);
  s.Go("Nier", up + 5.6, up + 7.2, aside.x, aside.z, { move: "walk", depart: { stance: "stand" }, stance: "crouch", faceTo: Pt(aside.x, aside.z + 4) });
  s.Caption(up + 5.8, 2.4, "（挪开了。这里不交代她为什么听不见）");
  s.Eye(up + 7.6, 1.6, { stance: "stand", look: NIER_RIM, pitch: 12, toLook: CART, toPitch: -2 });
  // 远处村子里零星的枪声
  s.Sfx(1.6, "rifleShot", { x: 100, z: 420, volume: 0.25 });
  s.Sfx(up + 2.4, "rifleShot", { x: 100, z: 420, volume: 0.25 });
  return s.Done({ durationS: up + 10.0 });
}

function S0603(ctx) {
  const s = new Seq(ctx, "06-3", "传令兵报信，老耿第一个赶车走");
  const K = id => KU(ctx, "06-3", id);
  const runnerAt = Pt(K("Runner").x, K("Runner").z);
  // 开场：车还停在凹路口（箱子还在车上），老耿、妮儿在坎顶 / 车边；传令兵从凹路那头跑来
  s.Signal(0, SIG.cartDeparted, false);
  s.Place("GengCart", 0, CART.x, CART.z, { yawDeg: -90 });
  s.Place("Geng", 0, 64.6, 154.2, { faceTo: CART });
  s.Place("Nier", 0, 62.6, 156.6, { stance: "crouch", faceTo: CART });
  const r0 = LZ(178);
  s.Place("Runner", 0, r0.x, r0.z, { stance: "stand" });
  const arrive = s.Walk("Runner", 0, runnerAt, { move: "run", faceTo: "Luo" });
  s.Eye(0, 2.0, { stance: "stand", look: Pt(83, 160), pitch: -1 });
  s.Caption(0.5, 2.6, "（有人从凹路那头一路跑回来）");
  // 边跑边喊（跑到车边才停住）
  const call = s.Say("RunnerSouth.01", "Runner", Math.max(2.6, arrive - 4.6));
  s.Key("Runner", arrive, { clip: "MessengerReport", faceTo: "Luo" });
  s.Key("Runner", arrive + 3.0, { clip: null });
  s.Eye(2.0, 1.0, { stance: "stand", look: Pt(83, 160), pitch: -1, toLook: Pt(80, 156), toPitch: -1 });
  s.Eye(arrive - 1.4, 1.6, { stance: "stand", look: Pt(80, 156), pitch: -1, toLook: runnerAt, toPitch: -3 });
  s.Key("Luo", call, { faceTo: "Runner" });
  s.Key("Yaowa", call + 0.4, { faceTo: "Runner" });
  s.Key("LiuWencai", call + 0.2, { faceTo: "Runner" });
  // 老耿手上的活停了，朝南看了好一会儿
  const look = s.End("RunnerSouth.01") + 0.3;
  s.Key("Geng", look, { faceTo: Pt(84, 230) });
  s.Eye(look, 1.0, { stance: "stand", look: runnerAt, pitch: -3, toLook: Pt(64.6, 154.2), toPitch: -4 });
  s.Caption(look + 0.4, 4.0, "（老耿手上的活停了，朝南看了好一会儿）");
  // 第一个赶着车往南走：车上的箱子跟着车走（CartDeparted）
  const go = look + 4.6;
  const head = Pt(69.2, 154.6);
  s.Go("Geng", go - 3.4, go, head.x, head.z, { move: "walk", yawDeg: -90 });
  s.Signal(go, SIG.cartDeparted, true);
  const cartEnd = LZ(163, 0.2);
  const cartRoute = Route(CART, cartEnd);
  const cartLen = RouteLen(CART, [...cartRoute.path, cartRoute.end]);
  const cartT1 = R(go + cartLen / 1.4);
  s.Go("GengCart", go, cartT1, cartRoute.end.x, cartRoute.end.z, { move: "walk", path: cartRoute.path });
  const gengRoute = Route(head, LZ(162.5, -1.6));
  s.Go("Geng", go, cartT1, gengRoute.end.x, gengRoute.end.z, { move: "walk", path: gengRoute.path });
  const nierRoute = Route(Pt(62.6, 156.6), LZ(165.5, 1.3));
  s.Go("Nier", go + 0.8, cartT1 + 0.6, nierRoute.end.x, nierRoute.end.z, { move: "walk", path: nierRoute.path, depart: { stance: "stand" } });
  s.Caption(go + 0.6, 3.2, "（第一个赶着车往南走；车上那几箱弹药跟着车走了）");
  s.Eye(go - 0.2, 1.4, { stance: "stand", look: Pt(64.6, 154.2), pitch: -4, toLook: Pt(74, 155.2), toPitch: -2 });
  s.Eye(go + 4.0, 3.0, { stance: "stand", look: Pt(74, 155.2), pitch: -2, toLook: Pt(83, 164), toPitch: -1 });
  // 全班跟着最后两副担架和车往南赶
  for (const id of ["Litter02", "Litter01"]) s.Walk(id, go + 1.0, LZ(id === "Litter01" ? 181 : 176, id === "Litter01" ? 0.6 : -0.6), { speed: 1.2, tArrive: cartT1 + 0.5 });
  s.Key("Runner", go + 1.0, { yawDeg: 180 });
  s.Walk("Runner", go + 1.4, LZ(170, -0.4), { move: "run" });
  ["Luo", "LiuWencai", "Yaowa", "HeYoutian", "Squad1", "Squad2", "Squad3"].forEach((id, k) => s.Walk(id, go + 2.0 + k * 0.5, LZ(159 + k * 1.2, k % 2 ? 0.4 : -0.4), { speed: 1.5 }));
  s.Caption(cartT1 - 1.5, 2.6, "（全班跟着最后这几副担架和老耿的车往南赶）");
  return s.Done({ durationS: cartT1 + 1.0 });
}

// ---------------------------------------------------------------------------
// 07 沿着后送队往前走

function S0701(ctx) {
  const s = new Seq(ctx, "07-1", "队尾：后送队停成一长溜");
  const K = id => KU(ctx, "07-1", id);
  // 顺子站在队尾往南望：整条路都是人
  s.Eye(0, 3.0, { stance: "stand", yaw: 180, pitch: -3 });
  s.Caption(0.4, 3.4, "（后送队在凹路里停成一长溜：躺担架的、被人背着的、互相架着走的）");
  s.Eye(3.0, 2.0, { stance: "stand", yaw: 180, pitch: -3, toYaw: 150, toPitch: -8 });
  s.Eye(5.0, 2.0, { stance: "stand", yaw: 150, pitch: -8, toYaw: -150, toPitch: -8 });
  s.Eye(7.0, 1.2, { stance: "stand", yaw: -150, pitch: -8, toYaw: 177, toPitch: -3 });
  s.Caption(4.2, 3.6, "（打仗时这些人全藏在沟里不动，只有不打仗时让玩家看清有多少人）");
  // 传令兵先跑到前头去了
  s.Walk("Runner", 0.6, LZ(300, 0), { move: "run" });
  // 小队从队尾往队头挤：镜头顺着路中线往前推（顺子的眼睛在走），人跟着往前
  const a = LZ(197, -0.3), b = LZ(226, -0.3);
  s.Cam(8.2, 20.0, { from: { ...a, h: 1.55 }, to: { ...b, h: 1.55 }, look: { ...LZ(207, 0), h: 1.1 }, lookTo: { ...LZ(236, 0), h: 1.1 }, ease: "linear" });
  s.Caption(9.0, 3.0, "（小队从队尾往队头挤）");
  for (const id of ["Luo", "LiuWencai", "Yaowa", "HeYoutian", "Squad1", "Squad2", "Squad3"]) {
    const to = KU(ctx, "07-2", id);
    const t0 = 8.2 + (id === "Luo" || id === "LiuWencai" ? 0 : 0.8);
    s.Go(id, t0, R(t0 + Dist(K(id), to) / 1.45), to.x, to.z, { move: "walk", yawDeg: 180 });
  }
  // 老耿的车挤不过去，停在队尾
  s.Caption(14.0, 3.0, "（老耿的车挤不过去，停在队尾）");
  // 前头村子的枪声时有时无；天上飞机过去
  s.Sfx(6.0, "mgBurstFar", { x: MG_AT.x, z: MG_AT.z, volume: 0.35 });
  s.Sfx(17.5, "rifleShot", { x: 100, z: 440, volume: 0.3 });
  s.Sfx(24.0, "mgBurstFar", { x: MG_AT.x, z: MG_AT.z, volume: 0.35 });
  s.Caption(20.0, 3.0, "（天上一架飞机飞过去）");
  return s.Done({ durationS: 28.4 });
}

function S0702(ctx) {
  const s = new Seq(ctx, "07-2", "担架上的冬瓜：就塞个毛巾");
  const K = id => KU(ctx, "07-2", id);
  const DG = Pt(K("Donggua").x, K("Donggua").z);
  const medic = Pt(K("Medic").x, K("Medic").z);
  // 蹲到担架边：裹着那床单被的冬瓜一直在抖
  s.Eye(0, 2.6, { stance: "stand", look: DG, pitch: -24, toPitch: -30 });
  s.Caption(0.5, 2.8, "（担架里找到冬瓜：身上裹着那床单被，人一直在抖）");
  s.Eye(2.6, 4.0, { stance: "crouch", look: DG, pitch: -34 });
  s.Caption(3.4, 3.0, "（按键：掀开被角）");
  s.Caption(6.6, 3.0, "（肚子上塞着一条浸透血的毛巾）");
  s.Key("Donggua", 0, { talking: false });
  const q = s.Say("StretcherDonggua.01", null, 9.4);
  // 抬头问卫生兵；他头也不抬
  s.Eye(q - 0.4, 0.9, { stance: "crouch", look: DG, pitch: -34, toLook: medic, toPitch: -14 });
  s.Key("Medic", 0, { stance: "crouch", faceTo: DG });
  s.Say("StretcherDonggua.02", "Medic");
  // 冬瓜伸手去拽被角：表掀……冷得很
  const cold = s.Say("StretcherDonggua.03", "Donggua");
  s.Key("Donggua", cold - 0.2, { talking: true });
  s.Key("Donggua", s.End("StretcherDonggua.03"), { talking: false });
  s.Eye(cold - 0.5, 0.8, { stance: "crouch", look: medic, pitch: -14, toLook: DG, toPitch: -34 });
  s.Caption(cold + 0.3, 2.8, "（他伸手去拽被角，牙齿打颤）");
  // 卫生兵说完就去看下一个（往南 12 m 的那副担架）
  const next = s.End("StretcherDonggua.03") + 0.6;
  const medicTo = KU(ctx, "07-3", "Medic");
  s.Go("Medic", next, R(next + Dist(medic, medicTo) / 1.4), medicTo.x, medicTo.z, { move: "walk", depart: { stance: "stand" }, stance: "crouch", yawDeg: 180 });
  s.Caption(next + 0.2, 2.6, "（卫生兵说完就去看下一个）");
  s.Eye(next + 0.6, 1.4, { stance: "crouch", look: DG, pitch: -34, toLook: medicTo, toPitch: -6 });
  // 小队在身后等着，然后接着往前挤
  for (const id of ["Luo", "LiuWencai", "Yaowa", "HeYoutian", "Squad1", "Squad2", "Squad3"]) {
    const to = LZ(KU(ctx, "07-2", id).z + 8, id === "Yaowa" || id === "Luo" || id === "Squad1" ? 0.3 : -0.3);
    s.Go(id, next + 2.0, R(next + 2.0 + Dist(K(id), to) / 1.4), to.x, to.z, { move: "walk", yawDeg: 180 });
  }
  s.Eye(next + 3.4, 1.6, { stance: "crouch", look: medicTo, pitch: -6, toYaw: 178, toPitch: -3 });
  s.Sfx(5.0, "mgBurstFar", { x: MG_AT.x, z: MG_AT.z, volume: 0.35 });
  return s.Done({ durationS: next + 6.0 });
}

function S0703(ctx) {
  const s = new Seq(ctx, "07-3", "边走边数铜板：路费、我妹");
  const K = id => KU(ctx, "07-3", id), K4 = id => KU(ctx, "07-4", id);
  const P = KP(ctx, "07-3");
  // 顺子用替身走（第三人称跟拍，镜头在前头几米往回看），幺娃并排在他东边略后
  s.Spawn("Shunzi", { side: "nra", x: P.x, z: P.z, yawDeg: 180, name: "顺子（替身）" }, { visible: true });
  const Z0 = P.z, Z_PAUSE = 318, Z1 = 364;
  const SPEED = 1.45;              // 挤着走：比自然步速略快一点，运行时就匀速走完整段、不在途经点上等
  const tGo = 1.0;
  const tPause = R(tGo + (Z_PAUSE - Z0) / SPEED);
  const tGo2 = tPause + 3.0;
  const tEnd = R(tGo2 + (Z1 - Z_PAUSE) / SPEED);
  const WalkLeg = (id, lat, z0, z1, t0, t1, extra = {}) => s.Go(id, t0, t1, LZ(z1, lat).x, LZ(z1, lat).z, { move: "walk", path: z1 - z0 > 20 ? [LZ((z0 + z1) / 2, lat)] : undefined, ...extra });
  const Walker = (id, lat, dz, extra = {}) => {
    WalkLeg(id, lat, Z0 + dz, Z_PAUSE + dz, tGo, tPause, extra);
    WalkLeg(id, lat, Z_PAUSE + dz, Z1 + dz, tGo2, tEnd, extra);
  };
  Walker("Shunzi", -0.3, 0, { yawDeg: 180 });
  Walker("Yaowa", 0.35, -1.0, { yawDeg: 180 });
  // 其余人同样往前挤，排在前后
  for (const id of ["Luo", "LiuWencai", "HeYoutian", "Squad1", "Squad2", "Squad3"]) {
    const dz = K(id).z - Z0, lat = id === "Luo" || id === "Squad1" ? 0.3 : -0.3;
    Walker(id, lat, dz, { yawDeg: 180 });
  }
  // 跟拍：机位在顺子前头 3.4 m 的路中线上、往回看他的脸；在路的拐点 (96,320) 断一段，免得机位切进沟壁
  const AHEAD = 3.4, H = 1.5;
  const camSeg = (z0, z1, t0, t1) => {
    const bend = 320 - AHEAD;
    const cuts = [z0, ...(z0 < bend && z1 > bend ? [bend] : []), z1];
    for (let i = 1; i < cuts.length; i++) {
      const za = cuts[i - 1], zb = cuts[i];
      const ta = t0 + (t1 - t0) * (za - z0) / (z1 - z0), tb = t0 + (t1 - t0) * (zb - z0) / (z1 - z0);
      s.Cam(ta, tb - ta, { from: { ...LZ(za + AHEAD, 0.1), h: H }, to: { ...LZ(zb + AHEAD, 0.1), h: H }, look: { actor: "Shunzi", offset: [0, 1.35, 0] }, ease: "linear", fov: 52 });
    }
  };
  s.Cam(0, tGo, { from: { ...LZ(Z0 + AHEAD, 0.1), h: H }, look: { actor: "Shunzi", offset: [0, 1.35, 0] }, fov: 52 });
  camSeg(Z0, Z_PAUSE, tGo, tPause);
  s.Cam(tPause, tGo2 - tPause, { from: { ...LZ(Z_PAUSE + AHEAD, 0.1), h: H }, look: { actor: "Shunzi", offset: [0, 1.35, 0] }, fov: 52 });
  camSeg(Z_PAUSE, Z1, tGo2, tEnd);
  // 边走边摸出钱袋数铜板（没有数钱的片段：说明字）
  s.Caption(0.6, 3.4, "（往前挤的路上，顺子边走边摸出钱袋，一个一个数铜板）");
  s.Key("Yaowa", 0, { faceTo: "Shunzi" });
  // 对话按录音间隔排，几处按剧本的停顿多留一点
  s.Say("CopperCoins.01", "Yaowa", 3.2);
  s.Say("CopperCoins.02");
  s.Say("CopperCoins.03", "Yaowa");
  s.Caption(s.End("CopperCoins.03") + 0.1, 1.6, "（顺子不答）");
  s.Say("CopperCoins.04", "Yaowa", s.End("CopperCoins.03") + 1.6);
  s.Say("CopperCoins.05");
  s.Say("CopperCoins.06", "Yaowa");
  s.Say("CopperCoins.07");
  s.Say("CopperCoins.08", "Yaowa");
  s.Say("CopperCoins.09");
  // 走了几步，压不住：这一句在停步那一刻说（tGo2 前后）
  s.Caption(s.End("CopperCoins.09") + 0.2, 2.2, "（走了几步，压不住）");
  s.Say("CopperCoins.10", null, Math.max(s.End("CopperCoins.09") + 2.4, tPause + 0.4));
  s.Say("CopperCoins.11", null, s.End("CopperCoins.10") + 1.0);
  s.Say("CopperCoins.12", null, s.End("CopperCoins.11") + 0.8);
  s.Caption(s.End("CopperCoins.12") + 0.3, 3.2, "（幺娃过了好一会儿才开口）");
  const last = s.Say("CopperCoins.13", "Yaowa", s.End("CopperCoins.12") + 3.6);
  s.Key("Yaowa", last - 0.3, { faceTo: "Shunzi" });
  s.Cam(tEnd, last + 2.4 - tEnd, { from: { ...LZ(Z1 + AHEAD, 0.1), h: H }, look: { actor: "Shunzi", offset: [0, 1.35, 0] }, fov: 52 });
  // 一直有威胁：前头村子的枪声时有时无，天上有飞机飞过去
  for (const t of [6.5, 19.0, 33.0, 47.0, 58.0]) s.Sfx(t, t === 33.0 ? "rifleShot" : "mgBurstFar", { x: MG_AT.x, z: MG_AT.z, volume: 0.4 });
  s.Caption(26.0, 2.6, "（天上一架飞机飞过去）");
  return s.Done({ durationS: last + 2.4 });
}

function S0704(ctx) {
  const s = new Seq(ctx, "07-4", "队头：前头就是耿家庄");
  const K = id => KU(ctx, "07-4", id);
  const MOUTH = Pt(PL.villageMouth.x, PL.villageMouth.z);
  const officer = Pt(K("Officer").x, K("Officer").z);
  s.Eye(0, 3.0, { stance: "stand", look: MOUTH, pitch: 0 });
  s.Caption(0.5, 3.0, "（挤到队头：前头就是耿家庄，一阵一阵响枪）");
  WindowBurst(s, 1.4, { volume: 0.6, muzzle: false });
  s.Sfx(4.2, "rifleShot", { x: 100, z: 430, volume: 0.5 });
  // 带队的蹲在队头不敢往前
  s.Key("Officer", 2.0, { faceTo: "player" });
  s.Eye(3.0, 1.0, { stance: "stand", look: MOUTH, pitch: 0, toLook: officer, toPitch: -10 });
  s.Caption(3.6, 3.0, "（带队的蹲在队头不敢往前。往南的路要穿过村里那条主街）");
  s.Key("Officer", 6.4, { faceTo: MOUTH });
  // 班长先蹲着摸到凹路尽头的坡道里看，其余人跟上（08-1 的位置）
  WindowBurst(s, 7.6, { volume: 0.6, muzzle: false });
  s.Eye(6.6, 1.2, { stance: "stand", look: officer, pitch: -10, toLook: MOUTH, toPitch: -2 });
  for (const id of ["Luo", "LiuWencai", "Yaowa", "HeYoutian", "Squad1", "Squad2", "Squad3"]) {
    const to = KU(ctx, "08-1", id);
    const t0 = 7.0 + (id === "Luo" ? 0 : 1.6);
    s.Go(id, t0, R(t0 + Dist(K(id), to) / 1.2), to.x, to.z, { move: "walk", depart: { stance: "crouch" }, stance: "crouch", yawDeg: to.yawDeg, ...(to.aim ? { aim: true } : {}) });
  }
  s.Caption(8.4, 2.6, "（班长蹲着摸到凹路尽头的坡道里）");
  return s.Done({ durationS: 17.0 });
}

// ---------------------------------------------------------------------------
// 08 村口

function S0801(ctx) {
  const s = new Seq(ctx, "08-1", "村口：窗口的机枪顺着街扫");
  const K = id => KU(ctx, "08-1", id);
  // 五个村民从主街上往村外跑（都先摆在街南头）
  const start = { Villager1: Pt(99.2, 430), Villager2: Pt(100.6, 436), Villager3: Pt(99.4, 447), Villager4: Pt(101.4, 433), Villager5: Pt(98.6, 441) };
  for (const [id, p] of Object.entries(start)) s.Place(id, 0, p.x, p.z, { state: "alive", stance: "stand", yawDeg: 0 });
  s.Eye(0, 2.4, { stance: "crouch", yaw: 180, pitch: 0 });
  s.Caption(0.3, 2.6, "（几个村民从主街上往村外跑）");
  const RUN = 2.6;
  const RunTo = (id, to, t0 = 0.4) => s.Go(id, t0, R(t0 + Dist(start[id], to) / RUN), to.x, to.z, { move: "run", yawDeg: 0 });
  // 街那头一扇窗口里机枪打出来：先倒一个（远的那个），再倒一个
  const fall3 = Pt(K("Villager3").x, K("Villager3").z), fall2 = Pt(K("Villager2").x, K("Villager2").z);
  RunTo("Villager3", fall3);
  const t3 = s.pos.get("Villager3").t;
  WindowBurst(s, t3 - 0.3, { volume: 0.8, puffAt: Off(fall3, -0.8, -1.2) });
  s.Key("Villager3", t3, { state: "down", yawDeg: K("Villager3").yawDeg });
  s.Caption(t3 - 0.2, 2.6, "（街那头一扇窗口里，鬼子的机枪打出来，倒下一个）");
  RunTo("Villager2", fall2);
  const t2 = s.pos.get("Villager2").t;
  WindowBurst(s, t2 - 0.3, { volume: 0.8, puffAt: Off(fall2, 0.9, -1.5) });
  s.Key("Villager2", t2, { state: "down", yawDeg: K("Villager2").yawDeg });
  // 剩下的跑出村口：两个顺着路跑过小队身边、不见了；一个滚进小队藏身的沟里
  for (const id of ["Villager4", "Villager5"]) {
    const out = id === "Villager4" ? Pt(102.6, 372) : Pt(97.4, 373);
    RunTo(id, out);
    s.Key(id, s.pos.get(id).t + 0.2, { visible: false });
  }
  const v1 = Pt(K("Villager1").x, K("Villager1").z);
  RunTo("Villager1", v1);
  const t1 = s.pos.get("Villager1").t;
  s.Key("Villager1", t1, { stance: "crouch", faceTo: "player" });
  s.Caption(t1, 2.4, "（剩下的一个滚进小队藏身的沟里）");
  // 眼睛：顺着街看倒下的人，再低头看脚边滚进来的
  s.Eye(2.4, 1.0, { stance: "crouch", yaw: 180, pitch: 0, toLook: fall3, toPitch: -1 });
  s.Eye(t2 - 0.6, 0.8, { stance: "crouch", look: fall3, pitch: -1, toLook: fall2, toPitch: -1 });
  s.Eye(t1 - 1.0, 1.0, { stance: "crouch", look: fall2, pitch: -1, toLook: v1, toPitch: -28 });
  const talk = s.Say("VillageMouth.01", "Villager1", t1 + 0.8);
  s.Caption(s.End("VillageMouth.01") + 0.2, 2.6, "（他之后跟着后送队一起走）");
  s.Eye(s.End("VillageMouth.01") + 1.0, 1.2, { stance: "crouch", look: v1, pitch: -28, toLook: WINDOW, toPitch: 0 });
  WindowBurst(s, s.End("VillageMouth.01") + 1.6, { volume: 0.8, puffAt: Pt(99.6, 392) });
  void talk;
  return s.Done({ durationS: s.End("VillageMouth.01") + 4.4 });
}

function S0802(ctx) {
  const s = new Seq(ctx, "08-2", "绕不过去：那是俺家、等天黑");
  const K = id => KU(ctx, "08-2", id);
  const geng = Pt(K("Geng").x, K("Geng").z), officer = Pt(K("Officer").x, K("Officer").z), luo = Pt(K("Luo").x, K("Luo").z);
  const RIVER = Pt(PL.river.x, 390);
  // 老耿盯着那扇窗口，半天才说出来
  s.Key("Geng", 0, { faceTo: WINDOW });
  s.Eye(0, 2.0, { stance: "crouch", look: geng, pitch: -6 });
  s.Eye(2.0, 1.2, { stance: "crouch", look: geng, pitch: -6, toLook: WINDOW, toPitch: 0 });
  const mine = s.Say("NoWayAround.01", "Geng", 2.6);
  WindowBurst(s, 1.0, { volume: 0.8, puffAt: Pt(100.4, 390) });
  // 带队的想往西绕；老耿立刻接过去
  s.Caption(s.End("NoWayAround.01") + 0.4, 2.6, "（后送队带队的想往西绕）");
  s.Key("Officer", s.End("NoWayAround.01") + 0.4, { faceTo: RIVER });
  s.Eye(s.End("NoWayAround.01") + 0.3, 1.0, { stance: "crouch", look: WINDOW, pitch: 0, toLook: officer, toPitch: -8 });
  s.Key("Geng", s.End("NoWayAround.01") + 2.0, { faceTo: "Officer" });
  const west = s.Say("NoWayAround.02", "Geng", s.End("NoWayAround.01") + 2.6);
  s.Eye(west - 0.3, 0.8, { stance: "crouch", look: officer, pitch: -8, toLook: geng, toPitch: -6 });
  s.Caption(s.End("NoWayAround.02") + 0.2, 3.4, "（担架倒是能一副一副往沟里顺，可这么多副，天黑都过不完。只能从这条街打过去）");
  // 班长看了看窗口和房顶，压着嗓子
  s.Key("Luo", s.End("NoWayAround.02") + 0.4, { faceTo: WINDOW });
  s.Key("Luo", s.End("NoWayAround.02") + 1.8, { faceTo: ROOF_AT });
  s.Eye(s.End("NoWayAround.02") + 1.0, 1.0, { stance: "crouch", look: geng, pitch: -6, toLook: luo, toPitch: -6 });
  const dark = s.Say("NoWayAround.03", "Luo", s.End("NoWayAround.02") + 3.8);
  s.Key("Luo", dark - 0.2, { faceTo: "player" });
  // 顺子一下子顶回去
  s.Say("NoWayAround.04", null, s.End("NoWayAround.03") + 0.4);
  s.Caption(s.End("NoWayAround.04") + 0.3, 3.0, "（07 卫生兵刚说过：天黑前送不到军医手里，就表想了）");
  WindowBurst(s, s.End("NoWayAround.03") + 1.2, { volume: 0.8, puffAt: Pt(99.2, 388) });
  s.Key("Luo", s.End("NoWayAround.04") + 1.5, { faceTo: WINDOW, aim: true });
  void mine;
  return s.Done({ durationS: s.End("NoWayAround.04") + 3.8 });
}

function S0803(ctx) {
  const s = new Seq(ctx, "08-3", "狗洞：老耿比划，顺子一个人去");
  const K = id => KU(ctx, "08-3", id);
  const geng = Pt(K("Geng").x, K("Geng").z), nier = Pt(K("Nier").x, K("Nier").z), luo = Pt(K("Luo").x, K("Luo").z);
  const yaowa = Pt(K("Yaowa").x, K("Yaowa").z);
  const ALLEY_MOUTH = Pt(ST.alleyWest.toX - 1.0, ST.alleyWest.z);
  // 街口班长他们一直朝窗口打，把机枪和房顶的鬼子吸住；窗口回打
  let tf = 0.8;
  while (tf < 44) { Exchange(s, tf, { volume: 0.9, puffAt: Pt(99.4 + (tf % 3), 387 + (tf % 5)) }); tf += 6.5; }
  // 老耿站着说别的路，边说边用手比着位置
  s.Key("Geng", 0, { stance: "stand", faceTo: "player" });
  s.Key("Nier", 0, { stance: "crouch", faceTo: "Geng" });
  s.Eye(0, 2.0, { stance: "crouch", look: geng, pitch: -4 });
  const a = s.Say("DogHole.01", "Geng", 1.0);
  s.Key("Geng", a + 1.4, { faceTo: ROOF_AT });
  s.Eye(a + 1.2, 1.2, { stance: "crouch", look: geng, pitch: -4, toLook: ROOF_AT, toPitch: 2 });
  s.Key("Geng", a + 4.6, { faceTo: Pt(81.5, 490) });
  s.Eye(a + 4.4, 1.2, { stance: "crouch", look: ROOF_AT, pitch: 2, toLook: geng, toPitch: -4 });
  s.Caption(a + 5.0, 3.6, "（翻后墙会被房顶上扔手榴弹的鬼子看见；邻院在他的视线死角里）");
  // 看看后送队，看看窗口，又看看妮儿
  const b = s.Say("DogHole.02", "Geng", s.End("DogHole.01") + 1.0);
  s.Key("Geng", b - 0.9, { faceTo: Pt(100, 360) });
  s.Key("Geng", b + 1.6, { faceTo: WINDOW });
  s.Key("Geng", b + 3.6, { faceTo: "Nier" });
  // 蹲下来给她比划：钻洞、拔门闩、马上出来；比划的手在抖
  const show = s.End("DogHole.02") + 0.3;
  s.Key("Geng", show, { stance: "crouch", faceTo: "Nier" });
  s.Eye(show - 0.4, 1.0, { stance: "crouch", look: geng, pitch: -4, toLook: Pt(nier.x + 0.3, nier.z - 0.2), toPitch: -18 });
  s.Caption(show + 0.2, 4.6, "（蹲下来给她比划：钻洞，拔门闩，马上出来。比划的手在抖）");
  s.Caption(show + 5.0, 2.6, "（妮儿盯着他的手，点点头）");
  // 钻进巷子：过村口上街，往西拐进巷子口，不见了
  const run = show + 7.6;
  const r = Route(nier, Pt(ALLEY_MOUTH.x - 10, ALLEY_MOUTH.z));
  const runT1 = R(run + RouteLen(nier, [...r.path, r.end]) / 2.6);
  s.Go("Nier", run, runT1, r.end.x, r.end.z, { move: "run", path: r.path, depart: { stance: "stand" } });
  s.Key("Nier", runT1 + 0.2, { visible: false });
  s.Key("Geng", run + 0.6, { faceTo: ALLEY_MOUTH });
  s.Eye(run, 1.4, { stance: "crouch", look: Pt(nier.x + 0.3, nier.z - 0.2), pitch: -18, toLook: Pt(99, 392), toPitch: -2 });
  s.Eye(run + 1.6, runT1 - run - 1.0, { stance: "crouch", look: Pt(99, 392), pitch: -2, toLook: ALLEY_MOUTH, toPitch: -1 });
  s.Caption(run + 0.4, 2.6, "（她钻进了巷子）");
  // 顺子起身：老子去门口等到；班长盯着窗口没回头
  const go = s.Say("DogHole.03", null, runT1 + 0.4);
  s.Eye(go - 0.2, 1.0, { stance: "crouch", look: ALLEY_MOUTH, pitch: -1, toLook: luo, toPitch: -8 });
  const one = s.Say("DogHole.04", "Luo");
  s.Key("Luo", one - 0.2, { faceTo: WINDOW, aim: true });
  s.Caption(s.End("DogHole.04") + 0.2, 3.2, "（班长、刘文财、幺娃和几个守军在街口一直朝窗口打；他们一停火，机枪就会掉头去扫后送队）");
  // 幺娃一把拽住顺子
  const grab = s.End("DogHole.04") + 0.6;
  s.Go("Yaowa", grab - 1.0, grab, yaowa.x, yaowa.z, { move: "walk", faceTo: "player", depart: { stance: "stand" } });
  s.Eye(grab - 0.4, 0.8, { stance: "crouch", look: luo, pitch: -8, toLook: yaowa, toPitch: -6 });
  s.Say("DogHole.05", "Yaowa", grab + 0.3);
  s.Caption(grab + 0.1, 2.0, "（一把拽住顺子的胳膊）");
  const back = s.Say("DogHole.06", null, s.End("DogHole.05") + 0.5);
  s.Caption(s.End("DogHole.06") + 0.2, 2.6, "（他甩开幺娃，追进了巷子）");
  s.Eye(s.End("DogHole.06") + 0.3, 1.4, { stance: "crouch", look: yaowa, pitch: -6, toLook: ALLEY_MOUTH, toPitch: 0 });
  s.Key("Yaowa", s.End("DogHole.06") + 0.6, { faceTo: ALLEY_MOUTH });
  void back;
  return s.Done({ durationS: s.End("DogHole.06") + 3.0 });
}

// ---------------------------------------------------------------------------
// 09 摸进老耿家

function S0901(ctx) {
  const s = new Seq(ctx, "09-1", "巷子：机枪响就挪，一停就贴墙");
  const X = ST.alleySouth.x;
  const P = KP(ctx, "09-1");
  const NIER_DOOR = Pt(KU(ctx, "09-1", "Nier").x, KU(ctx, "09-1", "Nier").z);
  const LOOK = z => Pt(X, z);
  // 一个人顺着巷子往邻院摸：两边都是院墙，又窄又直
  s.Eye(0, 2.2, { stance: "crouch", yaw: 180, pitch: 0 });
  s.Caption(0.3, 3.2, "（一个人顺着巷子往邻院摸。街口班长他们一打，窗口的机枪就回一梭子）");
  s.Caption(3.8, 3.0, "（机枪响就挪一段，一停就贴墙不动）");
  // 四段：每段「街口打 → 机枪回一梭」时挪 10 m，停下贴墙
  const legs = [[440, 450], [450, 460], [460, 470], [470, 481]];
  let t = 2.2, cur = Pt(P.x, P.z);
  for (const [z0, z1] of legs) {
    const end = Exchange(s, t, { volume: 0.55, puffAt: Pt(99.2, 386) });
    const mv0 = t + 1.2, mv1 = mv0 + (z1 - z0) / 2.4;
    s.Creep(mv0, mv1 - mv0, cur, LOOK(z1), LOOK(z1 + 22), { h: 1.05 });
    cur = LOOK(z1);
    t = mv1 + 2.6 + (z0 === 460 ? 2.0 : 0);
    void end;
    // 第二段停下时：院子那头有鬼子在吼「出来！」
    if (z0 === 450) {
      s.Say("CellarShout.01", "CellarIja1", mv1 + 0.6);
      s.Say("CellarShout.02", "CellarIja1");
      s.Caption(s.End("CellarShout.02") + 0.2, 2.8, "（老耿家后院那头。地底下有人在哭）");
      s.Key("CellarIja1", mv1, { faceTo: CELLAR });
    }
  }
  // 停在邻院小门口几米外：妮儿蹲在门边等着
  s.Key("Nier", 0, { stance: "crouch", faceTo: Pt(PL.neighborDoor.x, NB.westDoor.z) });
  s.Eye(t - 3.2, 2.0, { stance: "crouch", x: cur.x, z: cur.z, look: LOOK(503), pitch: 0, toLook: NIER_DOOR, toPitch: -10 });
  s.Caption(t - 2.6, 2.6, "（妮儿先到了邻院小门口，蹲着等机枪响）");
  s.Eye(t - 1.2, 1.4, { stance: "crouch", x: cur.x, z: cur.z, look: NIER_DOOR, pitch: -10, toLook: Pt(X + 1.2, 490), toPitch: -4 });
  s.Caption(t - 0.2, 2.0, "（只听得见，看不见：这是三下里的第一下）");
  return s.Done({ durationS: t + 2.0 });
}

function S0902(ctx) {
  const s = new Seq(ctx, "09-2", "墙缝：汉子刚爬出来就被捅倒");
  const K = id => KU(ctx, "09-2", id);
  // 眼贴着墙缝：缝只有一指宽，斜着看窖口只剩两度宽的一条——能看见的东西全排在「眼睛 → 窖口」这条线上
  const eyeA = SlitEye(CRACK, CELLAR);
  const IN = { Man: Pt(90, 499), Wife: Pt(91, 499.1), Granny: Pt(90.5, 499.9) };
  const RIM_E = Along(eyeA, CELLAR, 1.6);     // 窖口东沿外（视线上）：汉子从这里爬出来站住
  const OUT_MAN = Along(eyeA, CELLAR, 2.9);   // 再往前两步被捅倒（离窖沿 1.7 m，倒地的人不会滑进坑、也不被窖沿挡住）
  const IJA2_AT = Along(eyeA, CELLAR, 4.3);   // 拿刺刀的站在视线更远处，正对着爬出来的人
  // 窖里的人先在窖底（看不见）；三个鬼子围着窖口
  for (const [id, p] of Object.entries(IN)) s.Place(`Cellar${id}`, 0, p.x, p.z, { state: "alive", stance: "crouch", yawDeg: 0 });
  s.Key("CellarIja1", 0, { faceTo: CELLAR });
  s.Place("CellarIja2", 0, IJA2_AT.x, IJA2_AT.z, { faceTo: RIM_E, aim: true });
  s.Key("CellarIja3", 0, { faceTo: CELLAR });
  s.Key("Nier", 0, { stance: "crouch", faceTo: Pt(PL.dogHole.x, PL.dogHole.z) });
  s.Eye(0, 16.0, { stance: "stand", x: eyeA.x, z: eyeA.z, look: CELLAR, pitch: -4, fov: SLIT_FOV });
  s.Caption(0.3, 3.0, "（隔墙的缝：缝只有一指宽，眼要贴上去，只看得见窖口那一小片）");
  s.Caption(3.6, 3.2, "（一个鬼子拎着手榴弹在窖口上晃，窖里的人举着手一个个往外爬）");
  // 汉子爬出东沿（举着手：没有百姓的动作片段，只能站着）
  const climb = 4.2;
  s.Go("CellarMan", climb, climb + 2.6, RIM_E.x, RIM_E.z, { move: "walk", stance: "stand", faceTo: IJA2_AT });
  s.Go("CellarMan", climb + 3.0, climb + 4.0, OUT_MAN.x, OUT_MAN.z, { move: "walk", faceTo: IJA2_AT });
  // 拿刺刀的上前一步，一刀捅倒
  const stab = climb + 4.4;
  const lunge = Along(eyeA, CELLAR, 3.75);
  s.Go("CellarIja2", stab - 1.0, stab - 0.2, lunge.x, lunge.z, { move: "walk", faceTo: "CellarMan", aim: true });
  s.Key("CellarIja2", stab, { clip: "BayonetClearWood" });
  s.Sfx(stab + 0.7, "stab", OUT_MAN);
  s.Key("CellarMan", stab + 0.75, { state: "down", yawDeg: Yaw(OUT_MAN, eyeA) });
  s.Caption(stab + 0.6, 3.0, "（汉子刚爬出来就被刺刀捅倒）");
  s.Key("CellarIja2", stab + 2.0, { clip: null, faceTo: CELLAR });
  // 年轻媳妇、抱襁褓的老太太跟着往外爬
  s.Go("CellarWife", stab + 0.4, stab + 3.4, 89.6, 501.8, { move: "walk", stance: "stand", faceTo: "CellarIja3" });
  s.Go("CellarGranny", stab + 2.0, stab + 5.0, 91.9, 500.9, { move: "walk", stance: "crouch", faceTo: Pt(94, 500) });
  s.Key("CellarIja3", stab + 3.6, { faceTo: "CellarWife" });
  // 街口那边还在打
  Exchange(s, 1.6, { volume: 0.5 });
  Exchange(s, 11.0, { volume: 0.5 });
  // 顺子还得往侧门挪，视线断了：眼睛离开缝，贴着墙往南挪到侧门外
  const leave = stab + 5.4;
  s.Caption(leave, 3.0, "（顺子还得往侧门挪，视线断了）");
  const gateOut = Pt(80.7, 499.4);
  s.Creep(leave, 3.4, Pt(eyeA.x - 0.2, eyeA.z), gateOut, Pt(WALL_X, 499.0), { h: 1.3, lookH: 1.4 });
  // 妮儿蹲在狗洞边等机枪响
  s.Caption(leave + 3.6, 2.0, "（这是三下里的第二下）");
  return s.Done({ durationS: leave + 6.0 });
}

function S0903(ctx) {
  const s = new Seq(ctx, "09-3", "侧门外，门缝里：三下里的第三下");
  const K = id => KU(ctx, "09-3", id);
  const MAN = Pt(K("CellarMan").x, K("CellarMan").z);
  const GRANNY0 = Pt(91.9, 500.9), GRANNY_PIT = Pt(CELLAR.x, CELLAR.z + 0.2);
  const WIFE0 = Pt(89.6, 501.8), IJA3_0 = Pt(88.9, 502.2);
  const BABY_RIM = Pt(92.3, 500.9);                // 甩在窖沿上（掀开的盖板边）
  const STAB_AT = Pt(91.7, 500.55);                // 挑襁褓的鬼子站的地方（在门缝的扇面里）
  // 开场：窖里一家三口刚爬出来的样子；汉子的尸体；窖还没炸
  s.Signal(0, SIG.cellarBlast, false);
  s.Place("CellarMan", 0, MAN.x, MAN.z, { state: "down", yawDeg: 100 });
  s.Place("CellarGranny", 0, GRANNY0.x, GRANNY0.z, { state: "alive", stance: "crouch", faceTo: STAB_AT });
  s.Place("CellarWife", 0, WIFE0.x, WIFE0.z, { state: "alive", stance: "stand", faceTo: IJA3_0 });
  s.Place("CellarIja3", 0, IJA3_0.x, IJA3_0.z, { faceTo: "CellarWife" });
  s.Place("CellarIja2", 0, 93.6, 499.4, { faceTo: CELLAR, aim: true });
  s.Place("CellarIja1", 0, 89.8, 496.9, { faceTo: CELLAR });
  // 襁褓：剧本里只是老太太怀里的一个包袱，不建人；这里用一个按比例缩小的倒地替身占位（先藏着，甩到窖沿上才露面）
  s.Spawn("Bundle", { side: "civ", kind: "child", x: BABY_RIM.x, z: BABY_RIM.z, yawDeg: 60, state: "down", name: "襁褓（占位）" }, { visible: false });
  // 眼贴着门缝（门缝在门洞北侧，0.15 m）
  const eye = GATE_EYE;
  s.Eye(0, 34, { stance: "stand", x: eye.x, z: eye.z, look: CELLAR, pitch: -3, fov: SLIT_FOV, shake: 0.06 });
  s.Caption(0.3, 3.2, "（侧门外，只等十几秒。门缝在北侧，贴着看；顺子扶在门上的手一直在抖）");
  // 媳妇被拖进偏屋：只听得见声音（拖出扇面就看不见了）
  s.Key("CellarIja3", 1.0, { clip: "CollarDrag" });
  const drag = Route(IJA3_0, Pt(112.0, 486.6));
  s.Go("CellarIja3", 1.8, 1.8 + RouteLen(IJA3_0, [...drag.path, drag.end]) / 1.4, drag.end.x, drag.end.z, { move: "walk", path: drag.path, depart: { clip: null }, faceTo: SIDE_ROOM_DOOR });
  const wife = Route(WIFE0, Pt(114.2, 486.2));
  s.Go("CellarWife", 1.8, 1.8 + RouteLen(WIFE0, [...wife.path, wife.end]) / 1.4, wife.end.x, wife.end.z, { move: "walk", path: wife.path, faceTo: Pt(116, 484) });
  s.Caption(3.8, 3.0, "（媳妇被拖进偏屋，只听得见声音）");
  // 孩子在哭；一个鬼子从老太太怀里扯过襁褓，一刺刀扎穿，挑起来甩在窖沿上，哭声断了
  s.Caption(7.4, 2.6, "（孩子在哭）");
  s.Go("CellarIja2", 7.6, 9.2, STAB_AT.x, STAB_AT.z, { move: "walk", faceTo: "CellarGranny", aim: true });
  s.Key("CellarIja2", 9.6, { clip: "BayonetClearWood" });
  s.Sfx(10.3, "stab", STAB_AT);
  s.Key("Bundle", 11.2, { visible: true });
  s.Caption(10.2, 4.0, "（一个鬼子从老太太怀里扯过襁褓，一刺刀扎穿，挑起来甩在窖沿上，哭声断了）");
  s.Key("CellarIja2", 11.6, { clip: null, faceTo: CELLAR });
  // 老太太往窖里爬；拎手榴弹的往钢盔上一磕，扔了进去：窖里闷响一声
  s.Go("CellarGranny", 11.4, 13.6, GRANNY_PIT.x, GRANNY_PIT.z, { move: "crawl", faceTo: Pt(90.5, 498) });
  s.Caption(14.4, 3.0, "（老太太往窖里爬。鬼子把手榴弹往钢盔上一磕，扔了进去）");
  const blast = 18.6;
  s.Key("CellarIja1", 15.4, { faceTo: CELLAR });
  s.Key("CellarIja1", 17.0, { clip: "DuckBlast" });
  s.Key("CellarIja2", 17.4, { clip: "DuckBlast" });
  s.Sfx(blast, "grenadeBlast", { x: CELLAR.x, z: CELLAR.z, volume: 0.7 });
  s.Ev(blast, "explosion", { x: CELLAR.x, z: CELLAR.z, kind: "grenade", radius: 1.6 });
  s.Ev(blast + 0.1, "smoke", { x: CELLAR.x, z: CELLAR.z, kind: "SmokeDust", dur: 6 });
  s.Shake(blast, 0.6, 0.3);
  s.Signal(blast + 0.15, SIG.cellarBlast, true);
  s.Key("CellarGranny", blast + 0.1, { state: "down", yawDeg: 0 });
  s.Caption(blast + 0.4, 2.6, "（窖里闷响一声）");
  // 同一个门缝里：妮儿正贴着墙根往门这边挪，鬼子都在窖口，没人看她
  const nier0 = Pt(K("Nier").x, K("Nier").z);
  s.Key("Nier", 0, { stance: "crouch", yawDeg: 180 });
  s.Go("Nier", 6.0, 20.0, 82.3, 499.75, { move: "walk", path: [Pt(82.3, 495.5)], stance: "crouch", faceTo: Pt(82.3, 500.4) });
  s.Caption(blast + 3.2, 3.2, "（同一个门缝里，妮儿正贴着墙根往门这边挪；鬼子都在窖口，没人看她）");
  // 鬼子回屋，留下一个：拎手榴弹的进偏屋，拿刺刀的留在汉子尸体边
  const back = blast + 3.0;
  // （只演到偏屋门口那块院子：then 跳到 09-4 时他直接进屋）
  const r1 = Route(Pt(89.8, 496.9), Pt(107.0, 490.4));
  s.Go("CellarIja1", back, back + RouteLen(Pt(89.8, 496.9), [...r1.path, r1.end]) / 1.4, r1.end.x, r1.end.z, { move: "walk", path: r1.path, depart: { clip: null }, faceTo: SIDE_ROOM_DOOR });
  const pisser = Pt(KU(ctx, "09-4", "CellarIja2").x, KU(ctx, "09-4", "CellarIja2").z);
  s.Go("CellarIja2", back + 1.6, back + 3.6, pisser.x, pisser.z, { move: "walk", depart: { clip: null, aim: false }, yawDeg: -150 });
  s.Caption(back + 2.0, 3.0, "（鬼子回屋，留下一个）");
  void nier0;
  return s.Done({ durationS: back + 7.0 });
}

function S0904(ctx) {
  const s = new Seq(ctx, "09-4", "门开了：撒尿的鬼子、妮儿呜咽、捂嘴");
  const K = id => KU(ctx, "09-4", id);
  const P = KP(ctx, "09-4");
  const pisser = Pt(K("CellarIja2").x, K("CellarIja2").z);
  const nier = Pt(K("Nier").x, K("Nier").z);
  // 开场：门还闩着；眼睛在门缝后
  s.Signal(0, SIG.sideGateOpen, false);
  const eye = GATE_EYE;
  s.Place("Nier", 0, 82.3, 499.75, { stance: "crouch", faceTo: Pt(82.3, 500.4) });
  s.Key("CellarIja2", 0, { yawDeg: -150, aim: false });
  s.Eye(0, 5.0, { stance: "stand", x: eye.x, z: eye.z, yaw: -90, pitch: -6, fov: 50 });
  s.Caption(0.4, 3.6, "（门闩一点一点拉开）");
  // 门开了一条缝，露出妮儿的脸
  const open = 4.6;
  s.Signal(open, SIG.sideGateOpen, true);
  s.Key("Nier", open, { faceTo: "player" });
  s.Caption(open + 0.2, 2.6, "（门开了一条缝，露出妮儿的脸）");
  s.Eye(open + 0.4, 1.2, { stance: "stand", x: eye.x, z: eye.z, yaw: -90, pitch: -6, toLook: nier, toPitch: -22, fov: 50 });
  // 侧门一开就是触发：门正对着地瓜窖，留下的那个鬼子在八九米外侧着背撒尿；玩家得蹲着不动
  const inDoor = open + 1.8;
  s.Eye(inDoor, 4.0, { stance: "crouch", look: pisser, pitch: 0 });
  s.Caption(inDoor + 0.2, 4.0, "（门正对着地瓜窖：留下的那个鬼子站在八九米外，侧着背在汉子的尸体边撒尿。玩家得蹲着不动）");
  // 妮儿一回头看见了院子里的人，僵住了，开始呜咽
  const turn = inDoor + 2.6;
  s.Key("Nier", turn, { faceTo: pisser });
  s.Caption(turn + 1.4, 2.6, "（妮儿一回头看见了院里的人，都是她认得的街坊，一下子僵住了）");
  const whimper = s.Say("NierWhimperFirst.01", "Nier", turn + 3.0);
  s.Eye(whimper - 0.4, 1.0, { stance: "crouch", look: pisser, pitch: 0, toLook: nier, toPitch: -26 });
  s.Caption(whimper + 1.2, 3.4, "（屏幕弹出按键：按下去，顺子捂住她的嘴。第一人称看得见自己的手指，上面露着她瞪大的眼睛）");
  // 这里演「没按到」那一支：鬼子停下来半转过身「嗯？」，正好机枪响了一梭，他骂了一句也回屋。不判失败
  const hm = whimper + 3.6;
  s.Eye(hm - 0.6, 0.8, { stance: "crouch", look: nier, pitch: -26, toLook: pisser, toPitch: 0 });
  s.Key("CellarIja2", hm - 0.2, { clip: "GuardTurn", yawDeg: -100 });
  s.Say("PisserGrunt.01", "CellarIja2", hm);
  s.Caption(hm + 0.3, 2.6, "（没按到：他停下来半转过身）");
  const mg = s.End("PisserGrunt.01") + 0.4;
  Exchange(s, mg - 1.2, { volume: 0.75 });
  s.Key("CellarIja2", mg + 0.6, { clip: null, faceTo: WINDOW });
  s.Say("PisserGrunt.02", "CellarIja2", mg + 1.4);
  const go = s.End("PisserGrunt.02") + 0.3;
  const r = Route(pisser, Pt(108.6, 489.0));
  s.Go("CellarIja2", go, go + RouteLen(pisser, [...r.path, r.end]) / 1.4, r.end.x, r.end.z, { move: "walk", path: r.path, faceTo: SIDE_ROOM_DOOR });
  s.Caption(go + 0.4, 3.0, "（骂了一句，也回屋了。按到了就只是：尿完回屋。不判失败）");
  s.Eye(go, 6.0, { stance: "crouch", look: pisser, pitch: 0, toLook: SIDE_ROOM_DOOR, toPitch: 0 });
  // 院里还有一个早就死了的老汉，反绑在石磨上
  const mill = go + 6.4;
  s.Eye(mill, 1.4, { stance: "crouch", look: SIDE_ROOM_DOOR, pitch: 0, toLook: MILL, toPitch: -8 });
  s.Caption(mill + 0.4, 4.0, "（院里还有一个早就死了的老汉，被他自己的裤腰带反绑在石磨上，身上好几个刺刀窟窿：是被拿来练刺刀的，跟 02 冬瓜挨的是同一套）");
  s.Caption(mill + 4.6, 2.6, "（妮儿再也不肯往狗洞那边回，顺子只能带着她）");
  void P;
  return s.Done({ durationS: mill + 7.6 });
}

function S0905(ctx) {
  const s = new Seq(ctx, "09-5", "带着妮儿往灶屋摸；石磨上绑着老汉");
  const K = id => KU(ctx, "09-5", id);
  const P = KP(ctx, "09-5");
  const MILL_MAN = Pt(K("MillOldMan").x, K("MillOldMan").z);
  const DOOR_OUT = Pt(G.kitchen.box.maxX + 1.3, G.kitchen.door.z);
  // 妮儿跟在顺子身后一步
  const stops = [Pt(P.x, P.z), Pt(90.2, 491.2), Pt(92.6, 487.4), Pt(DOOR_OUT.x + 0.3, DOOR_OUT.z + 0.9)];
  const nierStops = [Pt(K("Nier").x, K("Nier").z), Pt(89.4, 492.2), Pt(91.9, 488.6), Pt(93.4, 485.3)];
  s.Eye(0, 2.6, { stance: "crouch", look: KITCHEN_DOOR, pitch: -4 });
  s.Caption(0.3, 3.0, "（机枪响一梭往灶屋挪一段，一安静就停）");
  s.Key("Nier", 0, { stance: "crouch", faceTo: "player" });
  let t = 2.6;
  for (let i = 1; i < stops.length; i++) {
    Exchange(s, t, { volume: 0.7 });
    const mv0 = t + 1.2, mv1 = mv0 + Dist(stops[i - 1], stops[i]) / 1.6;
    s.Creep(mv0, mv1 - mv0, stops[i - 1], stops[i], i === stops.length - 1 ? KITCHEN_DOOR : Pt(KITCHEN_DOOR.x, KITCHEN_DOOR.z + 1), { h: 1.05 });
    s.Go("Nier", mv0 + 0.3, mv1 + 0.3, nierStops[i].x, nierStops[i].z, { move: "walk", stance: "crouch", faceTo: "player" });
    t = mv1 + 3.4;
    if (i === 2) {
      // 走到石磨边她又看见绑在磨上的老汉，再一次呜咽；再弹一次捂嘴
      s.Eye(mv1, 1.2, { stance: "crouch", x: stops[i].x, z: stops[i].z, look: Pt(KITCHEN_DOOR.x, KITCHEN_DOOR.z + 1), pitch: -4, toLook: MILL_MAN, toPitch: -14 });
      s.Caption(mv1 + 0.3, 3.4, "（石磨上反绑着一个早就死了的老汉，身上好几个刺刀窟窿）");
      s.Key("Nier", mv1 + 0.6, { faceTo: MILL_MAN });
      const w = s.Say("NierWhimperAgain.01", "Nier", mv1 + 2.0);
      s.Eye(w - 0.3, 0.8, { stance: "crouch", x: stops[i].x, z: stops[i].z, look: MILL_MAN, pitch: -14, toLook: nierStops[i], toPitch: -28 });
      s.Caption(w + 0.8, 2.6, "（再弹一次捂嘴：按键）");
      s.Eye(s.End("NierWhimperAgain.01") + 0.6, 1.0, { stance: "crouch", x: stops[i].x, z: stops[i].z, look: nierStops[i], pitch: -28, toLook: KITCHEN_DOOR, toPitch: -4 });
      t = Math.max(t, s.End("NierWhimperAgain.01") + 2.2);
    }
  }
  s.Eye(t - 3.0, 2.8, { stance: "crouch", x: stops[3].x, z: stops[3].z, look: KITCHEN_DOOR, pitch: -4 });
  s.Caption(t - 2.6, 2.4, "（快到灶屋门口了）");
  return s.Done({ durationS: t });
}

function S0906(ctx) {
  const s = new Seq(ctx, "09-6", "灶台边：罐子掉地，刺刀往下压，妮儿咬手腕");
  const K = id => KU(ctx, "09-6", id);
  const P = KP(ctx, "09-6");
  const IJA = Pt(K("KitchenIja").x, K("KitchenIja").z), NIER = Pt(K("Nier").x, K("Nier").z);
  const DOOR_OUT = Pt(G.kitchen.box.maxX + 1.6, G.kitchen.door.z + 0.9);
  const THRESH = Pt(G.kitchen.box.maxX + 0.5, G.kitchen.door.z);
  // 开场：顺子在灶屋门外一步，妮儿身边；鬼子在灶屋里翻东西
  s.Place("KitchenIja", 0, 85.4, 483.8, { state: "alive", stance: "crouch", yawDeg: 120, aim: false });
  s.Place("Nier", 0, 93.4, 485.3, { stance: "crouch", faceTo: THRESH });
  s.Eye(0, 2.2, { stance: "crouch", x: DOOR_OUT.x, z: DOOR_OUT.z, look: KITCHEN_DOOR, pitch: -4 });
  // 罐子哗啦一声掉在地上
  const drop = 1.4;
  s.Sfx(drop, "dirtFall", { x: 93.4, z: 485.3, volume: 0.6 });
  s.Caption(drop, 2.4, "（妮儿怀里那罐弹壳掉在地上，哗啦一声）");
  s.Eye(drop + 0.2, 0.6, { stance: "crouch", x: DOOR_OUT.x, z: DOOR_OUT.z, look: KITCHEN_DOOR, pitch: -4, toLook: Pt(93.4, 485.3), toPitch: -30 });
  // 灶屋里的鬼子扑出来，撞翻顺子
  const lunge = drop + 1.2;
  s.Key("KitchenIja", lunge - 0.2, { stance: "stand", aim: true, faceTo: KITCHEN_DOOR });
  s.Say("KitchenLunge.01", "KitchenIja", lunge);
  s.Go("KitchenIja", lunge, lunge + 1.3, 89.0, 483.7, { move: "run", faceTo: THRESH });
  s.Eye(lunge, 1.2, { stance: "crouch", x: DOOR_OUT.x, z: DOOR_OUT.z, look: Pt(93.4, 485.3), pitch: -30, toLook: Pt(88.5, 483.6), toPitch: -2, shake: 0.3 });
  s.Shake(lunge + 1.2, 0.6, 0.9);
  s.Caption(lunge + 1.0, 2.6, "（把顺子撞翻在灶台边）");
  // 切到倒地仰视：鬼子站在身上方，用上了刺刀的枪往下压
  const pin = lunge + 1.6;
  s.Go("KitchenIja", pin, pin + 0.9, IJA.x, IJA.z, { move: "run", faceTo: "player", aim: true });
  s.Key("KitchenIja", pin + 1.0, { clip: "ButtThreat" });
  s.Eye(pin, 7.6, { stance: "prone", look: IJA, pitch: 38, toPitch: 52, shake: 0.22 });
  s.Caption(pin + 1.4, 4.4, "（顺子两手死死抵住枪身：玩家连按往外推，推不赢，刀尖一点点往下来）");
  s.Key("KitchenIja", pin + 2.4, { clip: null, aim: true });
  // 妮儿扑上去，一口咬在鬼子握枪的手腕上；鬼子惨叫，手一松
  const bite = pin + 6.0;
  s.Go("Nier", bite - 2.0, bite, NIER.x, NIER.z, { move: "run", path: [Pt(91.9, 483.6), Pt(89.6, 483.7)], depart: { stance: "stand" }, stance: "crouch", faceTo: "KitchenIja" });
  s.Caption(bite - 0.2, 2.4, "（妮儿扑上去，一口咬在鬼子握枪的手腕上）");
  s.Key("KitchenIja", bite + 0.2, { clip: "RifleDeflect" });
  s.Say("KitchenBitten.01", "KitchenIja", bite + 0.3);
  s.Key("KitchenIja", bite + 1.2, { clip: null, aim: false, faceTo: "Nier" });
  // 慢动作一秒半，控制交还，屏幕不出提示：玩家用平常的键从左肩抽出大刀，砍两刀
  const back = bite + 1.8;
  s.Caption(back, 3.6, "（慢动作一秒半，控制交还，屏幕不出提示：玩家用平常的键从左肩抽出大刀，砍两刀，砍得乱七八糟）");
  s.Eye(back, 1.4, { stance: "prone", look: IJA, pitch: 52, toPitch: 20 });
  s.Eye(back + 1.4, 3.0, { stance: "crouch", look: IJA, pitch: -12, shake: 0.2 });
  const chop1 = back + 1.8, chop2 = chop1 + 0.8;
  s.Sfx(chop1, "stab", IJA); s.Sfx(chop2, "stab", IJA);
  s.Shake(chop1, 0.3, 0.4); s.Shake(chop2, 0.3, 0.5);
  s.Key("KitchenIja", chop1 + 0.05, { clip: "ShotCollapse", clipHold: true });
  s.Key("KitchenIja", chop2 + 1.3, { state: "down", clip: null, yawDeg: 0 });
  s.Sfx(chop2 + 1.3, "bodyFall", IJA);
  // 妮儿嘴边沾着血，蹲在地上发抖；前屋的机枪组听见动静扭头往后看
  s.Caption(chop2 + 1.6, 3.0, "（妮儿嘴边沾着血，蹲在地上发抖）");
  s.Eye(chop2 + 1.6, 1.2, { stance: "crouch", look: IJA, pitch: -12, toLook: NIER, toPitch: -16 });
  for (const id of ["MgGunner", "MgLoader", "RoofIja"]) s.Key(id, chop2 + 2.0, { yawDeg: 180 });
  s.Caption(chop2 + 4.8, 3.0, "（前屋的机枪组听见灶屋的动静，扭头往后看）");
  s.Eye(chop2 + 4.4, 1.6, { stance: "crouch", look: NIER, pitch: -16, toLook: ROOM_YARD_DOOR, toPitch: 0 });
  void P;
  return s.Done({ durationS: chop2 + 8.2 });
}

// ---------------------------------------------------------------------------
// 10 两面夹住机枪

function S1001(ctx) {
  const s = new Seq(ctx, "10-1", "打进前屋：从背后打掉机枪组");
  const K = id => KU(ctx, "10-1", id), K96 = id => KU(ctx, "09-6", id);
  const P = KP(ctx, "10-1");
  const MG_LOADER_AT = Pt(K96("MgLoader").x, K96("MgLoader").z);
  // 开场：机枪组还活着、正扭头往后看；窗台上那挺枪还在
  s.Signal(0, SIG.mgSilenced, false);
  s.Place("MgGunner", 0, MG_AT.x, MG_AT.z, { state: "alive", stance: "crouch", aim: true, yawDeg: 150 });
  s.Place("MgLoader", 0, MG_LOADER_AT.x, MG_LOADER_AT.z, { state: "alive", stance: "crouch", yawDeg: 160 });
  s.Place("RoofIja", 0, ROOF_AT.x, ROOF_AT.z, { state: "alive", stance: "stand", yawDeg: 180 });
  s.Place("Nier", 0, 92.6, 485.2, { stance: "crouch", faceTo: ROOM_YARD_DOOR });
  // 从前屋南门进来：机枪组背对着玩家
  const doorIn = Pt(ROOM_YARD_DOOR.x, ROOM_YARD_DOOR.z - 1.4);
  s.Eye(0, 2.0, { stance: "crouch", x: doorIn.x, z: doorIn.z, look: MG_AT, pitch: -2 });
  s.Caption(0.3, 2.8, "（从灶屋打进前屋：机枪组背对着玩家，正扭头；抢在他们掉转枪口之前）");
  s.Caption(3.2, 2.4, "（房顶那个也一起清掉。白盒里他先站在屋里地面上）");
  s.Eye(2.0, 6.0, { stance: "stand", look: MG_AT, pitch: -4, shake: 0.08 });
  // 两枪：架枪的先倒在枪上，副射手跟着
  const f1 = 2.6, f2 = 3.6, f3 = 5.2;
  Shot(s, f1, "player");
  s.Key("MgGunner", f1 + 0.08, { clip: "ShotCollapse", clipHold: true });
  s.Go("MgGunner", f1 + 0.1, f1 + 1.2, K("MgGunner").x, K("MgGunner").z, { move: "walk" });
  s.Key("MgGunner", f1 + 1.5, { state: "down", clip: null, yawDeg: 0 });
  s.Signal(f1 + 1.0, SIG.mgSilenced, true);
  Shot(s, f2, "player");
  s.Key("MgLoader", f2 + 0.08, { clip: "ShotCollapse", clipHold: true });
  s.Go("MgLoader", f2 + 0.1, f2 + 1.1, K("MgLoader").x, K("MgLoader").z, { move: "walk" });
  s.Key("MgLoader", f2 + 1.5, { state: "down", clip: null, yawDeg: 20 });
  s.Eye(f2 + 0.6, 1.0, { stance: "stand", look: MG_AT, pitch: -4, toLook: ROOF_AT, toPitch: -2 });
  Shot(s, f3, "player");
  s.Key("RoofIja", f3 + 0.08, { clip: "ShotCollapse", clipHold: true });
  s.Go("RoofIja", f3 + 0.1, f3 + 1.1, K("RoofIja").x, K("RoofIja").z, { move: "walk" });
  s.Key("RoofIja", f3 + 1.5, { state: "down", clip: null, yawDeg: 0 });
  s.Caption(f3 + 1.4, 3.0, "（两面一夹，机枪哑了：窗台上那挺十一年式没了）");
  // 班长他们顺着主街冲过来（从街口到老耿家门前的街上）
  for (const id of ["Luo", "LiuWencai", "Yaowa", "HeYoutian", "Squad1", "Squad2", "Squad3"]) {
    const from = KU(ctx, "09-6", id), to = K(id);
    s.Place(id, 0, from.x, from.z, { stance: "crouch", aim: !!from.aim, yawDeg: from.yawDeg });
    const r = Route(from, to);
    const t0 = 1.6 + (id === "Luo" ? 0 : id === "LiuWencai" ? 0.6 : 1.4 + (id.startsWith("Squad") ? 0.8 : 0));
    s.Go(id, t0, t0 + RouteLen(from, [...r.path, r.end]) / 3.5, r.end.x, r.end.z, { move: "run", path: r.path, depart: { stance: "stand" }, yawDeg: 180, ...(to.aim ? { aim: true } : {}) });
  }
  // 走到北窗边往街上看：班长他们顺着街冲过来；东头的枪声近了
  const win = f3 + 2.4;
  s.Cam(win, 2.4, { from: { x: P.x, z: P.z, h: 1.62 }, to: { x: 96.4, z: 473.0, h: 1.5 }, look: { ...MG_AT, h: 1.0 }, lookTo: { x: 100, z: 440, h: 1.3 } });
  s.Cam(win + 2.4, 9.0, { from: { x: 96.4, z: 473.0, h: 1.5 }, look: { x: 100, z: 440, h: 1.3 }, lookTo: { actor: "Luo", offset: [0, 1.2, 0] } });
  s.Caption(win + 0.6, 3.0, "（北窗边往街上看：班长在街口正面压，这会儿顺着主街冲过来）");
  for (const [t, v] of [[win + 1.0, 0.45], [win + 4.6, 0.55], [win + 8.4, 0.7]]) s.Sfx(t, "rifleShot", { x: 200, z: 465, volume: v });
  s.Caption(win + 6.0, 3.0, "（东头的枪声近了：东头的鬼子听见枪声撵过来了）");
  return s.Done({ durationS: win + 12.4 });
}

function S1002(ctx) {
  const s = new Seq(ctx, "10-2", "石碾后头：调过来！朝东打！");
  const K = id => KU(ctx, "10-2", id), K1 = id => KU(ctx, "10-1", id);
  const P = KP(ctx, "10-2");
  const FRONT_DOOR_OUT = Pt(PL.frontDoor.x, PL.frontDoor.z - 1.6);
  // 开场：顺子刚从前门出来站在门口；班长他们在街上
  for (const id of ["Luo", "LiuWencai", "Yaowa", "HeYoutian", "Squad1", "Squad2", "Squad3"]) {
    const from = K1(id);
    s.Place(id, 0, from.x, from.z, { stance: "stand", aim: !!from.aim, yawDeg: 180 });
  }
  const luo0 = Pt(K1("Luo").x, K1("Luo").z);
  s.Eye(0, 3.0, { stance: "stand", x: FRONT_DOOR_OUT.x, z: FRONT_DOOR_OUT.z, look: luo0, pitch: -2 });
  for (const [t, v] of [[0.4, 0.7], [1.3, 0.8]]) s.Sfx(t, "rifleShot", { x: 200, z: 465, volume: v });
  // 班长在街上吼：调过来！朝东打！（挥手朝东指）
  s.Key("Luo", 0.6, { faceTo: "player" });
  const turn = s.Say("TurnEast.01", "Luo", 1.2);
  s.Key("Luo", turn + 0.2, { clip: "PointBlockade", faceTo: EAST_END });
  // 全班调到东街口
  for (const id of ["Luo", "LiuWencai", "Yaowa", "Squad1", "Squad2", "Squad3"]) {
    const to = K(id);
    const t0 = turn + 1.2 + (id === "Luo" ? 0 : 0.6);
    const r = Route(s.pos.get(id), to);
    s.Go(id, t0, t0 + RouteLen(s.pos.get(id), [...r.path, r.end]) / 3.0, r.end.x, r.end.z, { move: "run", path: r.path, depart: { clip: null }, stance: "crouch", yawDeg: to.yawDeg, ...(to.aim ? { aim: true } : {}) });
  }
  // 何有田进前屋拆机枪组身上的子弹袋（10-2 布设的位置）
  { const to = K("HeYoutian"); const r = Route(s.pos.get("HeYoutian"), to); s.Go("HeYoutian", turn + 2.0, turn + 2.0 + RouteLen(s.pos.get("HeYoutian"), [...r.path, r.end]) / 2.6, r.end.x, r.end.z, { move: "run", path: r.path, stance: "crouch", yawDeg: to.yawDeg }); }
  s.Caption(turn + 1.6, 3.4, "（顺子把缴来的十一年式拖到门口石碾后头，朝东压住又直又长的窄巷。何有田去拆机枪组身上的子弹袋）");
  s.Eye(3.0, 2.0, { stance: "stand", x: FRONT_DOOR_OUT.x, z: FRONT_DOOR_OUT.z, look: luo0, pitch: -2, toLook: ROLLER, toPitch: -8 });
  // 切到石碾后头趴着朝东：东街又直又长，东头的鬼子在 60–120 m 外
  const prone = turn + 5.4;
  s.Eye(prone, 1.0, { stance: "prone", look: Pt(EAST_END.x, EAST_END.z), pitch: 1, fov: 50 });
  s.Caption(prone + 0.4, 3.6, "（弹斗一次装六个五发桥夹，三十发；子弹只有机枪组身上带的那些，打完就没了）");
  // 东头：趴着的那个先打过来，石碾上溅起土
  const e1 = prone + 1.4;
  Shot(s, e1, "EastIja1", { count: 4, interval: 0.14, sfx: "rifleShot", volume: 0.8 });
  Puff(s, e1 + 0.3, Pt(114.2, 465.2)); Puff(s, e1 + 0.6, Pt(112.6, 464.4));
  s.Shake(e1 + 0.3, 0.3, 0.2);
  // 顺子回一梭（缴来的机枪，没有现成的十一年式近声：用捷克式顶）
  const b1 = e1 + 1.6;
  Shot(s, b1, "player", { count: 6, interval: 0.11, sfx: "mgBurstNear" });
  Puff(s, b1 + 0.4, Pt(188.6, 464.2)); Puff(s, b1 + 0.7, Pt(191.0, 465.6));
  // 东头分队长躲在院墙后给人下令（看不见人，只听声）
  s.Say("EastEndOrders.01", "EastIja5", b1 + 1.4);
  s.Caption(s.End("EastEndOrders.01") + 0.1, 2.8, "（鬼子不硬冲：翻院墙、走房顶往这边绕）");
  s.Say("EastEndOrders.02", "EastIja5");
  // 绕的人：从北边院门窜过街钻进南边院子（顺子看得见人影从街上横着过去），再在院墙后往西挪
  const cross = s.End("EastEndOrders.02");
  // 开着的院门：北侧 x 140 / 196，南侧 x 158 / 212（168 / 222 / 132 / 186 关着）；门洞 1.5 m，从正中穿
  // 南院 2 的那个：从南门 158 窜到街上、顺街往西跑一截、钻进北门 140（离顺子 30–50 m，看得清）
  s.Go("EastIja4", cross, cross + 3.2, 158.0, 468.2, { move: "run", depart: { stance: "stand" } });
  s.Go("EastIja4", cross + 3.2, cross + 4.2, 158.0, 465.0, { move: "run" });
  s.Go("EastIja4", cross + 4.2, cross + 9.6, 140.0, 462.6, { move: "run", path: [Pt(141.0, 464.8)] });
  s.Go("EastIja4", cross + 9.6, cross + 11.4, 136.0, 460.8, { move: "run", stance: "crouch", faceTo: ROLLER });
  // 东头南院 4 的那个：从南门 212 窜过街钻进北门 196
  s.Go("EastIja6", cross + 1.0, cross + 4.2, 212.0, 468.4, { move: "run", depart: { stance: "stand" } });
  s.Go("EastIja6", cross + 4.2, cross + 5.2, 212.0, 465.0, { move: "run" });
  s.Go("EastIja6", cross + 5.2, cross + 10.0, 196.0, 462.6, { move: "run", path: [Pt(197.0, 464.8)] });
  s.Go("EastIja6", cross + 10.0, cross + 11.8, 190.0, 460.6, { move: "run", stance: "crouch", faceTo: ROLLER });
  // 北院 2 的那个院门关着：在院墙后往西挪（看不见）
  s.Go("EastIja3", cross + 2.0, cross + 8.0, 154.0, 460.8, { move: "run", stance: "crouch", faceTo: ROLLER });
  s.Caption(cross + 0.4, 3.0, "（人影从街上横着窜过去，钻进两边的院子）");
  s.Go("EastIja5", cross + 1.0, cross + 5.0, 200, 458.6, { move: "run", stance: "crouch" });
  // 掷弹筒：嘭 → 5.5 s 后落地，一发比一发近
  s.Say("EastEndOrders.03", "EastIja5");
  const pop1 = s.End("EastEndOrders.03") + 0.6;
  const h1 = Mortar(s, pop1, Pt(150, 464.2), { shake: 0.25 });
  s.Caption(pop1 + 0.2, 3.0, "（掷弹筒「嘭」一声，开始往石碾附近落）");
  // 弹药！趴着的那个回头喊；第二梭
  s.Say("EastEndOrders.04", "EastIja1", pop1 + 2.0);
  Shot(s, pop1 + 3.2, "EastIja2", { count: 3, interval: 0.16, volume: 0.8 });
  Puff(s, pop1 + 3.5, Pt(113.0, 466.6));
  const b2 = h1 + 0.8;
  Shot(s, b2, "player", { count: 6, interval: 0.11, sfx: "mgBurstNear" });
  Puff(s, b2 + 0.4, Pt(204.2, 465.2));
  // 东头有一个想顺着巷子冲，冲到半截被打倒
  const charge = b2 + 1.6;
  s.Go("EastIja7", charge, charge + 7.0, 206.0, 465.0, { move: "run", aim: true });
  const b3 = charge + 6.4;
  Shot(s, b3, "player", { count: 5, interval: 0.11, sfx: "mgBurstNear" });
  s.Key("EastIja7", b3 + 0.2, { clip: "ShotCollapse", clipHold: true });
  s.Key("EastIja7", b3 + 1.8, { state: "down", clip: null, yawDeg: 90 });
  // 第二、第三发越来越近
  const h2 = Mortar(s, b2 + 2.4, Pt(133, 466.4), { shake: 0.5 });
  s.Ev(h2 + 0.1, "smoke", { x: 133, z: 466.4, kind: "SmokeDust", dur: 5 });
  s.Caption(h2 + 0.2, 3.0, "（落点越来越近。子弹和掷弹筒是玩家看得见的两个倒计时）");
  const h3 = Mortar(s, h2 + 2.0, Pt(121.4, 463.6), { shake: 0.75 });
  s.Ev(h3 + 0.1, "smoke", { x: 121.4, z: 463.6, kind: "SmokeDust", dur: 6 });
  s.Eye(h3 - 0.1, 0.8, { stance: "prone", look: Pt(EAST_END.x, EAST_END.z), pitch: 1, toPitch: -6, fov: 50, shake: 0.5 });
  s.Eye(h3 + 0.7, 4.0, { stance: "prone", look: Pt(EAST_END.x, EAST_END.z), pitch: -6, toPitch: 1, fov: 50 });
  Shot(s, h3 + 1.6, "EastIja1", { count: 4, interval: 0.14, volume: 0.8 });
  Puff(s, h3 + 1.9, Pt(114.6, 466.8));
  // 班长带人顶到拐角（布设里已在拐角）；何有田从前屋出来往石碾这边
  s.Go("HeYoutian", h3 + 0.4, h3 + 3.4, 106.6, 468.2, { move: "run", path: [Pt(PL.frontDoor.x, 472.6), Pt(PL.frontDoor.x, 468.4)], stance: "crouch", faceTo: "player" });
  s.Caption(h3 + 2.0, 2.6, "（班长带人顶到拐角；何有田过来接机枪）");
  void P;
  return s.Done({ durationS: h3 + 5.0 });
}

function S1003(ctx) {
  const s = new Seq(ctx, "10-3", "穿院子：何有田接机枪，后送队进院");
  const K = id => KU(ctx, "10-3", id), K2 = id => KU(ctx, "10-2", id);
  const P = KP(ctx, "10-3");
  const PRONE = Pt(K("HeYoutian").x, K("HeYoutian").z);
  const MILL_MAN = Pt(K("MillOldMan").x, K("MillOldMan").z);
  const GATE_OUT = Pt(GATE_X, G.compound.minZ - 1.3), GATE_IN = Pt(GATE_X, G.compound.minZ + 1.3);
  // 开场（小空地的宽镜头）：顺子的替身趴在石碾后，何有田蹲到他身边接过机枪
  s.Spawn("Shunzi", { side: "nra", x: PRONE.x, z: PRONE.z, yawDeg: -90, stance: "prone", aim: true, name: "顺子（替身）" }, { visible: true });
  s.Place("HeYoutian", 0, 106.6, 468.2, { stance: "crouch", faceTo: "Shunzi", weapon: "HanYang" });
  s.Cam(0, 6.0, { from: { x: 103.0, z: 461.6, h: 1.7 }, to: { x: 104.6, z: 462.4, h: 1.6 }, look: { x: PRONE.x, z: PRONE.z, h: 0.6 }, fov: 58 });
  s.Caption(0.3, 3.0, "（何有田接过机枪；顺子退到院子里）");
  Shot(s, 0.6, "Shunzi", { count: 5, interval: 0.11, sfx: "mgBurstNear" });
  s.Go("HeYoutian", 1.8, 4.6, PRONE.x - 0.3, PRONE.z + 1.0, { move: "walk", stance: "prone", faceTo: EAST_END });
  s.Key("Shunzi", 4.4, { stance: "crouch", aim: false });
  s.Go("Shunzi", 4.6, 6.2, 108.6, 468.8, { move: "walk", path: [Pt(109.6, 467.8)], stance: "crouch" });
  s.Key("Shunzi", 6.4, { visible: false });
  s.Key("HeYoutian", 4.8, { weapon: "Type11", aim: true });
  s.Go("HeYoutian", 5.0, 5.6, PRONE.x, PRONE.z, { move: "crawl", stance: "prone", aim: true, yawDeg: -90 });
  Shot(s, 6.6, "HeYoutian", { count: 6, interval: 0.11, sfx: "mgBurstNear" });
  Shot(s, 2.4, "Luo", { volume: 0.9 }); Shot(s, 3.3, "LiuWencai", { volume: 0.9 });
  s.Sfx(1.2, "rifleShot", { x: 180, z: 465, volume: 0.6 });
  Mortar(s, 2.0, Pt(126, 462.6), { shake: 0.3 });
  // 后送队顺着街进老耿家：担架走大门过道，走着的伤员走前门穿前屋；驴车跟到门口
  // 起点都在主街（x 97…103）里，一溜排到街北边；路线按路网排（担架走大门过道、走着的伤员走前门穿前屋）
  const DG0 = Pt(101.4, 449.0);
  const conv = [
    ["Litter12", Pt(101.0, 459.5), 1.2], ["Litter11", Pt(101.0, 452.5), 1.2],
    ["Walker24", Pt(99.0, 457.4), 1.1], ["Walker23", Pt(98.8, 454.0), 1.1], ["Helper06", Pt(99.6, 453.4), 1.1], ["Walker22", Pt(99.2, 450.0), 1.1], ["Walker21", Pt(98.8, 446), 1.1],
    ["LitterDonggua", DG0, 1.2], ["GengCart", Pt(101.0, 441), 1.4], ["Officer", Pt(99.2, 448.6), 1.4], ["Medic", Pt(101.8, 447.6), 1.5], ["Geng", Pt(100.2, 456.2), 1.5],
  ];
  const T0 = 1.0;
  let gengArrive = 0;
  for (const [id, from, mps] of conv) {
    const to = K(id);
    s.Place(id, 0, from.x, from.z, { yawDeg: 180, ...(id === "Donggua" ? {} : {}) });
    const r = Route(from, to);
    const t1 = T0 + RouteLen(from, [...r.path, r.end]) / mps;
    s.Go(id, T0, t1, r.end.x, r.end.z, { move: "walk", path: r.path, yawDeg: to.yawDeg, ...(id === "Walker24" || id === "Walker23" || id === "Walker22" || id === "Walker21" ? { stance: "crouch" } : {}) });
    if (id === "Geng") gengArrive = t1;
  }
  // 冬瓜躺在担架上跟着走（lie:"along"：顺着担架躺、跟担架同一条路）
  { const to = K("LitterDonggua"); const r = Route(DG0, to); s.Place("Donggua", 0, DG0.x, DG0.z, { lie: "along", yawDeg: 180 }); s.Go("Donggua", T0, T0 + RouteLen(DG0, [...r.path, r.end]) / 1.2, r.end.x, r.end.z, { move: "walk", path: r.path, yawDeg: K("Donggua").yawDeg }); }
  // 镜头跟第一副担架穿过大门过道进后院，再换回顺子的眼睛（站在后院里看大门过道）
  s.Cam(6.0, 7.5, { from: { x: GATE_OUT.x + 0.9, z: GATE_OUT.z - 1.6, h: 1.6 }, to: { x: GATE_IN.x + 0.9, z: GATE_IN.z + 2.6, h: 1.6 }, look: { actor: "Litter12", offset: [0, 0.9, 0] }, ease: "linear", fov: 62 });
  s.Caption(6.4, 3.4, "（东头的枪打不进院子，往南的路又正好从老耿家后头出去：后送队顺着街进老耿家）");
  s.Caption(10.0, 2.8, "（担架一副一副从大门过道抬进来，走着的伤员从前门穿前屋）");
  s.Eye(13.5, 5.0, { stance: "stand", look: Pt(GATE_X, 478), pitch: -2 });
  // 老耿进了院子，看了一眼地上的人，什么也没说
  const look = Math.max(gengArrive + 0.2, 16.0);
  s.Key("Geng", look, { faceTo: MILL_MAN });
  s.Eye(look - 1.0, 1.2, { stance: "stand", look: Pt(GATE_X, 478), pitch: -2, toLook: Pt(K("Geng").x, K("Geng").z), toPitch: -4 });
  s.Caption(look + 0.4, 3.4, "（老耿进了院子，看了一眼地上的人，什么也没说）");
  s.Eye(look + 2.0, 1.4, { stance: "stand", look: Pt(K("Geng").x, K("Geng").z), pitch: -4, toLook: MILL_MAN, toPitch: -14 });
  s.Key("Geng", look + 3.6, { faceTo: Pt(PL.backDoor.x, PL.backDoor.z) });
  s.Eye(look + 4.4, 1.6, { stance: "stand", look: MILL_MAN, pitch: -14, toLook: Pt(PL.backDoor.x, PL.backDoor.z), toPitch: -4 });
  s.Caption(look + 4.8, 2.6, "（他朝后门走去）");
  s.Go("Geng", look + 4.0, look + 14.0, 98.9, 502.4, { move: "walk", faceTo: Pt(PL.backDoor.x, PL.backDoor.z) });
  s.Eye(look + 6.0, 7.0, { stance: "stand", look: Pt(PL.backDoor.x, PL.backDoor.z), pitch: -4 });
  // 妮儿还蹲在灶屋门口
  s.Key("Nier", 0, { stance: "crouch", faceTo: Pt(GATE_X, 481) });
  Shot(s, 12.0, "HeYoutian", { count: 6, interval: 0.11, sfx: "mgBurstNear", volume: 0.8 });
  Shot(s, look + 2.0, "HeYoutian", { count: 5, interval: 0.11, sfx: "mgBurstNear", volume: 0.7 });
  Shot(s, look + 9.0, "HeYoutian", { count: 6, interval: 0.11, sfx: "mgBurstNear", volume: 0.7 });
  void P; void K2;
  return s.Done({ durationS: look + 14.6 });
}

function S1004(ctx) {
  const s = new Seq(ctx, "10-4", "后门：挪开水缸，拔开后门");
  const K = id => KU(ctx, "10-4", id), K3 = id => KU(ctx, "10-3", id);
  const P = KP(ctx, "10-4");
  const BACK = Pt(PL.backDoor.x, PL.backDoor.z);
  const VAT = Pt(G.backVat.x, G.backVat.z);
  // 开场：门还关着、水缸堵在门里头；顺子站在院里看着老耿
  s.Signal(0, SIG.backDoorOpen, false);
  s.Place("Geng", 0, 98.9, 502.4, { faceTo: VAT });
  // 冬瓜的担架这会儿已经抬进了院子，停在后门前几米等门开；下一副在大门过道里
  const DG0 = Pt(105.4, 492.0);
  s.Place("LitterDonggua", 0, DG0.x, DG0.z, { yawDeg: 180 });
  s.Place("Donggua", 0, DG0.x, DG0.z, { lie: "along", yawDeg: 180 });
  s.Place("Medic", 0, 107.0, 491.2, { stance: "crouch", faceTo: "Donggua" });
  s.Place("Litter12", 0, GATE_X, 484.0, { yawDeg: 180 });
  const inYard = Pt(98.2, 500.6);
  s.Eye(0, 6.4, { stance: "stand", x: inYard.x, z: inYard.z, look: VAT, pitch: -10 });
  s.Caption(0.4, 3.4, "（老耿挪开堵门的水缸，拔开朝南的后门）");
  s.Go("Geng", 0.6, 1.6, 98.9, 503.2, { move: "walk", faceTo: VAT });
  const open = 3.6;
  s.Signal(open, SIG.backDoorOpen, true);
  s.Sfx(open, "dirtFall", { x: VAT.x, z: VAT.z, volume: 0.5 });
  s.Go("Geng", open + 0.4, open + 1.4, K("Geng").x, K("Geng").z, { move: "walk", yawDeg: 180 });
  s.Caption(open + 0.4, 3.0, "（水缸挪到门边，门扇开了。后门外是一条往南出村的小路，一直通到村南口）");
  // 担架一副接一副往外抬：冬瓜的担架先出门
  const litterOut = Pt(BACK.x, G.compound.maxZ + 9.0);
  const lRoute = Route(DG0, litterOut);
  const lLen = RouteLen(DG0, [...lRoute.path, lRoute.end]);
  const t0 = open + 1.0, t1 = R(t0 + lLen / 1.2);
  s.Go("LitterDonggua", t0, t1, lRoute.end.x, lRoute.end.z, { move: "walk", path: lRoute.path, yawDeg: 180 });
  s.Go("Donggua", t0, t1, lRoute.end.x, lRoute.end.z, { move: "walk", path: lRoute.path, yawDeg: -90 });
  s.Go("Medic", t0 + 1.4, t1 + 1.0, BACK.x - 1.0, G.compound.maxZ + 7.6, { move: "walk", path: [Pt(BACK.x, G.compound.maxZ - 2.6), Pt(BACK.x, G.compound.maxZ + 1.2)], depart: { stance: "stand" }, stance: "crouch", faceTo: "Donggua" });
  { const r = Route(Pt(GATE_X, 484.0), Pt(BACK.x, G.compound.maxZ - 4.6)); s.Go("Litter12", t0 + 4.0, t0 + 4.0 + RouteLen(Pt(GATE_X, 484.0), [...r.path, r.end]) / 1.2, r.end.x, r.end.z, { move: "walk", path: r.path, yawDeg: 180 }); }
  // 眼睛：先在院里看担架出门，再切到门外路上、回头看门、再顺着小路往南看
  s.Eye(6.4, 1.4, { stance: "stand", x: inYard.x, z: inYard.z, look: VAT, pitch: -10, toLook: BACK, toPitch: -4 });
  const outside = t0 + 2.6;
  const outEye = Pt(P.x - 0.6, P.z + 0.6);
  s.Eye(outside, 3.0, { stance: "stand", x: outEye.x, z: outEye.z, look: BACK, pitch: -4 });
  s.Caption(outside + 0.4, 2.6, "（担架一副接一副往外抬）");
  s.Eye(outside + 3.0, 2.0, { stance: "stand", x: outEye.x, z: outEye.z, look: BACK, pitch: -4, toLook: Pt(PL.villageSouth.x, PL.villageSouth.z), toPitch: -2 });
  s.Caption(t1 - 1.0, 4.0, "（接 11：车上剩的几箱弹药卸下来留给班长他们，空出来的车装上冬瓜和另外两个肚子受伤的。「我跟车。」）");
  // 东街那头还在打
  Shot(s, 2.2, "HeYoutian", { count: 6, interval: 0.11, sfx: "mgBurstNear", volume: 0.5 });
  Shot(s, 9.6, "Luo", { volume: 0.5 });
  Mortar(s, 5.0, Pt(118.6, 462.8), { shake: 0.2 });
  return s.Done({ durationS: t1 + 3.4, then: "stay" });
}

export const SEQUENCE_BUILDERS = Object.freeze([
  S0601, S0602, S0603, S0701, S0702, S0703, S0704, S0801, S0802, S0803,
  S0901, S0902, S0903, S0904, S0905, S0906, S1001, S1002, S1003, S1004,
]);

/** 生成整份预演文档（纯函数：只依赖传入的配置与台词清单）。 */
export function BuildPreviz({ config, voice }) {
  const ctx = { config, voice: VoiceIndex(voice) };
  const sequences = SEQUENCE_BUILDERS.map(build => build(ctx));
  const order = config.keyframes.map(k => k.id);
  sequences.sort((a, b) => order.indexOf(a.keyframe) - order.indexOf(b.keyframe));
  return {
    schema: "tengxian-blockout-previz/1",
    level: "FirstLevel0610",
    title: "第一关 06–10 预演（占位动作 + 占位配音）",
    source: { generator: "node Taierzhuang1938/Script_EditorBlockoutFirstLevel0610Previz.mjs --force", note: "剧本 Notion 06–10（10-18 晚定稿）；手改前先想好：重跑生成器会覆盖" },
    voice: "./Blockout/FirstLevel0610.voice.json",
    faceTracks: "./Audio/Blockout0610/Data_Blockout0610FaceTracks.json",
    sequences,
  };
}

// ---------------------------------------------------------------------------
// 命令行

async function Main(argv) {
  const config = LoadJson(CONFIG_FILE), voice = LoadJson(VOICE_FILE);
  const doc = BuildPreviz({ config, voice });
  const { CheckPreviz } = await import("./Script_EditorBlockoutFirstLevel0610PrevizTest.mjs");
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
