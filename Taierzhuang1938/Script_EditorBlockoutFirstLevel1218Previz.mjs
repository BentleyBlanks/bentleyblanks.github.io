// ===========================================================================
// Script_EditorBlockoutFirstLevel1218Previz.mjs —— 第一关 11–18 白盒（FirstLevel1218，2026-10-23 第二版）的预演数据生成器
//
//   node Taierzhuang1938/Script_EditorBlockoutFirstLevel1218Previz.mjs            → 只校验、打印摘要，不写
//   node Taierzhuang1938/Script_EditorBlockoutFirstLevel1218Previz.mjs --force    → 写 Blockout/FirstLevel1218.previz.json
//   node Taierzhuang1938/Script_EditorBlockoutFirstLevel1218Previz.mjs --report   → 另打印每段一行摘要与用到的片段
//
// 格式：docs/Data_EditorBlockout.md §14（tengxian-blockout-previz/1）。剧本口径：集成负责人 2026-10-23 的白盒第二版契约「一、故事」
// （用户 10-23 认的 11–14 五步大纲 + 细化稿，还没进 Notion）；空间口径：Data_EditorBlockoutFirstLevel1218Space.mjs（第二版）；
// 布设：Blockout/FirstLevel1218.json（只读，单位 id 与位置以它为准，23 帧一帧一段）。
// 台词：Blockout/FirstLevel1218.voice.json 的句子 id；时长每次从清单读（配音补录后重跑 --force 就行），同一段里按录音的
// 原始间隔 gapBeforeS 往后排（只会拉长、不会压短）。写法照 Script_EditorBlockoutFirstLevel0610Previz.mjs 与 0105 的拖被子（PULL）。
//
// 第二版（2026-10-23）要点：
//   · 11–12：炮在庄子里落（explosion + SmokeBlack + 震屏）；车顺墙根走、冬瓜担架 ride 挂车、妮儿坐车尾（程序化身体：挂着、没有坐姿片段）；
//     黑子在桥头不走、妮儿溜下车牵过去；炮停以后「轰」一声老耿家冒黑烟，镜头像按了「看」键那样转过去（说明字）；钢盔冒头、班长他们开火；渡口人流往浮桥挤。
//   · 13：豁子上的机枪 muzzle + 小半径 explosion 当弹着点一串串扫过人堆（百姓 down、往堤下 prone）；玩家趴车后对射（说明字）；
//     信号弹 = SmokeWhite + 高处一点火光 + 说明字；两架九七式轻爆从东边顺着河压下来，扫射段顺着浮桥、穿过桥头和人堆（桥上的人倒下、藏掉 = 掉进河里）；
//     扫到驴车那一刻 CartOverturned、冬瓜摔到单被上（BlanketDonggua 在 13-2 里 spawn，翻车那一刻出现）；13-3 飞机往西兜圈子。
//   · 14：揪被角照 0105 02 的 PULL（拖的人在被头前 1.6 m、左右各 0.55 m，carryRole front + PvBlanketDragL/R）；14-2 松手 slowmo（窗口里没台词），
//     被子键 dragSolo: true = 玩家那角松开落地、只剩妮儿攥着一个角在拽（§5.6 / §14.1，2026-10-23 加的开关）；弹着点从冬瓜身上扫过（CareLieWrithe 一抽）、
//     洇血用说明字；14-3 老耿跑回来接另一角（dragSolo 回 false）、刘文财把妮儿捞回来、飞机往东飞走、班长甩手榴弹（throw）炸豁子 BreachBlasted。
//   · 15–18：照第一版的戏挪到新空间：15A 河堤底下的低洼（老耿骨骼身体跪着 CareMedicPress）、15B 路短（低洼 → 接收院门口 26 m，没对白）、
//     15C 妮儿骨骼身体蹲着画驴、老耿看着地上的驴把脸转开（删「靠墙抱胳膊冻得发抖」）；17 老耿用冬瓜自己那床单被盖脸（PvKneelPullBlanket）；
//     18 散兵坑朝东北、鬼子从石板桥和河滩压来、最后一拨在河滩北边的土坎后、掷弹筒从庄子西南角打来；删「单褂子」。
//   · 身体：百姓程序化身体（放不了片段、蹲不下）——老耿 / 妮儿 / 百姓的动作用站位 + 说明字；只有关键帧里写了 body:"rig" 的那几帧放片段
//     （14-1…14-3 妮儿、14-3 / 15-1 / 17-1 老耿、15-3 妮儿）。士兵说话照 §14.4 的说话姿态；空手的百姓说话不受那条管。
//
// 镜头大半是顺子的眼睛（eye）；走着说、跟拍用 from/to（运行时锚点按 standAt 取地面）。玩家要按键的时刻（Z 卧倒、按住放、F 数铜板、打机枪）
// 用说明字标出。18-5 开头的日期字幕用 NORTH_GATE_DATE（14 还是 15 日用户没定，先写 14）。
//
// 确定性：不读时钟、不读 git、没有随机数；同样的输入两次输出逐字相同。
// ===========================================================================

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  L1218_PLACES as PL, L1218_BRIDGE as BR, L1218_YARD as Y, L1218_SIGNALS as SIG, L1218_SOUTH as SO, L1218_BREACH as BCH,
  L1218_STONE_BRIDGE as SB, L1218_BEACH, L1218_FERRY as FY,
} from "./Data_EditorBlockoutFirstLevel1218Space.mjs";
import { StreetRoute, PressPose, NIER_TAIL_RIDE, CartWorld, DOCTOR_PRESS } from "./Script_EditorBlockoutFirstLevel1218Keyframes.mjs";

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
/** 朝向的前方单位向量。 */
const Fwd = yaw => { const r = yaw * Math.PI / 180; return { x: -Math.sin(r), z: -Math.cos(r) }; };
/** 从 a 指向 b 的单位向量与右手边（面朝它时的右边）。 */
function Frame(a, b) { const l = Math.max(1e-6, Dist(a, b)); const f = { x: (b.x - a.x) / l, z: (b.z - a.z) / l }; return { f, r: { x: -f.z, z: f.x }, len: l }; }
const Along = (p, f, d) => Pt(p.x + f.x * d, p.z + f.z * d);
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
const KXZ = (ctx, kfId, id) => { const u = KU(ctx, kfId, id); return Pt(u.x, u.z); };

// ---------------------------------------------------------------------------
// 序列构造器（同 0610）

class Seq {
  constructor(ctx, keyframe, title) {
    this.ctx = ctx;
    this.kf = ctx.config.keyframes.find(k => k.id === keyframe);
    if (!this.kf) throw new Error(`关键帧不存在：${keyframe}`);
    this.out = { keyframe, title, durationS: 0, then: "next", camera: [], actors: [], lines: [], events: [] };
    this.aircraft = [];
    this.slowmo = [];
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
  /** 机位：from / to（点、演员锚或飞机锚 { aircraft }），look / lookTo。 */
  Cam(t, dur, { from, to, look, lookTo, fov, ease, shake }) {
    const P = p => (p.aircraft ? { aircraft: p.aircraft, offset: (p.offset || [0, 0, 0]).map(R) }
      : p.actor ? { actor: p.actor, offset: (p.offset || [0, 0, 0]).map(R) } : { x: R(p.x), z: R(p.z), ...(p.h !== undefined ? { h: R(p.h) } : {}) });
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
    const L = p => (p.actor || p.aircraft ? p : { ...p, h: p.h ?? lookH });
    return this.Cam(t, dur, { from: { ...a, h }, to: { ...b, h }, look: L(look), ...(lookTo ? { lookTo: L(lookTo) } : {}), ease, ...(fov ? { fov } : {}), ...(shake ? { shake } : {}) });
  }
  /** 飞机轨（§14.1 aircraft）：path 是按时间升序的航点 {t, x, z, y}（世界高）；sound.drone 缺省 true（引擎声跟着机身走）。 */
  Aircraft(id, { model = "MitsubishiKi30", path, strafe, sound }) {
    const entry = { id, model, path: path.map(w => ({ t: R(w.t), x: R(w.x), y: R(w.y), z: R(w.z) })) };
    if (strafe && strafe.length) entry.strafe = strafe.map(st => ({ t0: R(st.t0), t1: R(st.t1), from: Pt(st.from.x, st.from.z), to: Pt(st.to.x, st.to.z), ...(st.hz ? { hz: st.hz } : {}) }));
    if (sound) entry.sound = sound;
    this.aircraft.push(entry);
    return this;
  }
  /** 慢动作窗口（§14.1 slowmo）：[t, t + dur) 里预演时钟按 rate 走，进出各 fade 秒渐变。窗口里别排台词。 */
  Slowmo(t, dur, rate, fade = 0.25) { this.slowmo.push({ t: R(t), dur: R(dur), rate, fade }); return this; }
  Done({ durationS, then = "next" }) {
    const lastKey = Math.max(0, ...this.out.actors.flatMap(a => a.keys.map(k => k.t)));
    const lastEvent = Math.max(0, ...this.out.events.map(e => e.t + (e.dur || 0) * (e.type === "smoke" ? 0 : 1)));
    const lastSlow = Math.max(0, ...this.slowmo.map(w => w.t + w.dur + 0.3));
    this.out.durationS = R(Math.max(durationS, lastKey + 0.2, lastEvent, this.lastLineEnd + 0.4, lastSlow));
    this.out.then = then;
    for (const a of this.out.actors) a.keys.sort((p, q) => p.t - q.t);
    this.out.camera.sort((p, q) => p.t - q.t);
    this.out.lines.sort((p, q) => p.t - q.t);
    this.out.events.sort((p, q) => p.t - q.t);
    if (this.aircraft.length) this.out.aircraft = this.aircraft;
    if (this.slowmo.length) this.out.slowmo = this.slowmo.sort((p, q) => p.t - q.t);
    return this.out;
  }
}

// ---------------------------------------------------------------------------
// 常用点与小段落

const LANE_SHELL = Pt(PL.laneShell.x, PL.laneShell.z);
const VILLAGE_SHELLS = [Pt(100, 520), Pt(90, 506), Pt(108, 531), Pt(96, 514)];   // 庄子里一排排落炮（草顶烧着）
const GENG_SMOKE = Pt(PL.gengSmoke.x, PL.gengSmoke.z);
const FIELD_SHELL = Pt(PL.fieldShell.x, PL.fieldShell.z);
const HELMETS = Pt(PL.helmetsAt.x, PL.helmetsAt.z);
const BRIDGE_MID = Pt(SB.mid.x, SB.mid.z), BRIDGE_W = Pt(SB.westHead.x, SB.westHead.z);
const FERRY_SQ = Pt(PL.ferrySquare.x, PL.ferrySquare.z), FERRY_HEAD = Pt(FY.head.x, FY.head.z);
const MG = Pt(BCH.mgPost.x, BCH.mgPost.z);
const FLARE = Pt(PL.flareAt.x, PL.flareAt.z);
const TROUGH = Pt(PL.troughAt.x, PL.troughAt.z);
const YARD_GATE = Pt(PL.yardGate.x, PL.yardGate.z);
const XIANG_DOOR = Pt(PL.xiangDoor.x, PL.xiangDoor.z);
const INSIDE = Pt(Y.dongguaInside.x, Y.dongguaInside.z);
const SEAT = Pt(Y.thresholdSeat.x, Y.thresholdSeat.z);
const GATE_LAMP = Pt(Y.gateLamp.x, Y.gateLamp.z);
const RAIL_BLAST = Pt(PL.railBlast.x, PL.railBlast.z);
const MG18 = Pt(PL.ijaMg18.x, PL.ijaMg18.z);
const MORTAR = Pt(46, 540);    // 掷弹筒在庄子西南角豁子后头
const LAST_COVER = Pt(PL.lastGroupCover.x, PL.lastGroupCover.z);
const PONTOON_MID = BP((BR.northFootZ + BR.southFootZ) / 2);
const NORTH_GATE = Pt(PL.northGate.x, PL.northGate.z);
const SUN = Pt(PL.sunWest.x, PL.sunWest.z);
const TRACK_END = Pt(L1218_BEACH.track.line[4].x, L1218_BEACH.track.line[4].z);

/** 子弹打在土里（小土点）。 */
function Puff(s, t, p) { return s.Ev(t, "explosion", { x: p.x, z: p.z, kind: "grenade", radius: 0.8 }); }
/** 某人开一枪（枪口火 + 枪声）。 */
function Shot(s, t, actor, { count = 1, interval, sfx = "rifleShot", at, volume } = {}) {
  s.Ev(t, "muzzle", { actor, ...(count > 1 ? { count, interval: interval ?? 0.11 } : {}) });
  const p = at || (actor === "player" ? s.player : s.pos.get(actor));
  if (sfx) s.Sfx(t, sfx, { ...(p ? { x: R(p.x), z: R(p.z) } : {}), ...(volume !== undefined ? { volume } : {}) });
  return s;
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
/** 机枪打一梭（actor 是哪挺、at 它在哪）；puffs：弹着点一串（匀速扫过去）。返回打完的时刻。 */
function MgBurst(s, t, actor, at, { count = 10, volume = 0.8, puffs = [], sweepS = null } = {}) {
  s.Ev(t, "muzzle", { actor, count, interval: 0.1 });
  s.Sfx(t, "mgBurstFar", { x: at.x, z: at.z, volume });
  const span = sweepS ?? Math.max(0.3, puffs.length * 0.12);
  puffs.forEach((p, i) => Puff(s, t + 0.3 + (puffs.length > 1 ? span * i / (puffs.length - 1) : 0), p));
  return R(t + count * 0.1);
}
/** 一条线上均匀取 n 个点。 */
function LinePts(a, b, n) { return Array.from({ length: n }, (_, i) => Pt(a.x + (b.x - a.x) * i / (n - 1), a.z + (b.z - a.z) * i / (n - 1))); }
/** 飞机的声音（没有飞机轨的拍子：15 往南越来越小）。 */
function Plane(s, t, name, at, volume) { return s.Sfx(t, name, { x: R(at.x), z: R(at.z), volume }); }
/** 村里一发炮（炮弹落地 + 烟 + 震屏）。 */
function Shell(s, t, p, { radius = 3.5, sfx = "artilleryNear", volume = 0.8, shake = 0.4, smoke = "SmokeDust", smokeDur = 4 } = {}) {
  s.Sfx(t, sfx, { x: p.x, z: p.z, volume });
  s.Ev(t, "explosion", { x: p.x, z: p.z, kind: "shell", radius });
  if (smoke) s.Ev(t + 0.2, "smoke", { x: p.x, z: p.z, kind: smoke, dur: smokeDur });
  if (shake) s.Shake(t, 0.6, shake);
  return s;
}

// ---------------------------------------------------------------------------
// 占位动作（片段名照各库清单）

const VIL = Object.freeze({ duck: "VilDuckProne", panic: "VilPanicRun", carry: "VilNraCarryOnBack", ride: "VilRideOnBack" });
const TALK_SLUNG = "PvStandTalkSlung", TALK_LOW = "PvStandTalkLowRifle", TALK_CROUCH = "PvCrouchTalkRifle", COUNT_FINGERS = "PvCrouchCountFingers";
const POINT = "PvStandPointL", WAVE_ON = "PvStandWaveOnL", BECKON = "PvStandBeckonL", HALT = "PvStandHaltL", PRONE_BECKON = "PvProneBeckonL";
const KNEEL_DIG = "PvKneelDig", KNEEL_BLANKET = "PvKneelPullBlanket", GRIP_LITTER = "PvCrouchGripLitter", LIE_GRAB = "PvLieGrabSleeve";
const MEDIC_PRESS = "CareMedicPress", LIE_TREATED = "CareLieTreated", LIE_WRITHE = "CareLieWrithe";
const DRAG_L = "PvBlanketDragL", DRAG_R = "PvBlanketDragR", RELEASE_TURN = "PvBlanketReleaseTurn";
/** 扑倒（VilDuckProne：跪、趴、抱头）；DUCKED = 一开场就已经趴着抱头。 */
const DUCK = Object.freeze({ clip: VIL.duck, clipHold: true, stance: "prone" });
const DUCKED = Object.freeze({ clip: VIL.duck, clipFrom: 1.3, clipHold: true, stance: "prone" });
/** 拖被子的速度（m/s）与站位：拖的人在被子中心前 1.6 m、左右各 0.55 m（0105 的 PULL）。 */
const DRAG_MPS = 1.0;
const PULL = { half: 0.55, toCenter: 1.6 };
/** 被子中心 c 朝 f 方向时，左 / 右拖的人的站位。 */
const PullL = (c, fr) => Pt(c.x + fr.f.x * PULL.toCenter - fr.r.x * PULL.half, c.z + fr.f.z * PULL.toCenter - fr.r.z * PULL.half);
const PullR = (c, fr) => Pt(c.x + fr.f.x * PULL.toCenter + fr.r.x * PULL.half, c.z + fr.f.z * PULL.toCenter + fr.r.z * PULL.half);
/** 冬瓜躺在被子上跟着走：和被子同一条路、同一个时间窗的 walk 位置键（lie along，头朝拖的人那头）。 */
function CarryOnBlanket(s, t0, t1, end, yaw) { s.Go("Donggua", t0, t1, end.x, end.z, { move: "walk", yawDeg: yaw, lie: "along" }); }

// ---------------------------------------------------------------------------
// 飞机（§14.1 aircraft）：两架九七式轻爆

const KI30 = Object.freeze({ a: "Ki30A", b: "Ki30B" });
/** 两架 Ki-30 一前一后：A 机的航点错开给 B（晚 dt 秒、横向 dz / dx 米、高 dy 米）；只有 A 机扫射。 */
function TwoPlanes(s, pathA, { dt = 1.4, dz = -22, dx = 0, dy = 8, strafe = null, diveA = null, diveB = null } = {}) {
  s.Aircraft(KI30.a, { path: pathA, ...(strafe ? { strafe } : {}), sound: { drone: true, ...(diveA !== null ? { diveT: R(diveA) } : {}) } });
  s.Aircraft(KI30.b, { path: pathA.map(w => ({ t: w.t + dt, x: w.x + dx, y: w.y + dy, z: w.z + dz })), sound: { drone: true, ...(diveB !== null ? { diveT: R(diveB) } : {}) } });
}
/** 兜大弯：圆心 (cx, cz)、半径 r，从 phi0 转到 phi1（度，0 = 圆心正南、角度增大 = 往西 → 北 → 东），t0 → t1 匀速，高度从 y[0] 到 y[1]。 */
function Circle(t0, t1, cx, cz, r, phi0, phi1, y, n = 8) {
  const out = [];
  for (let i = 0; i <= n; i++) {
    const k = i / n, phi = (phi0 + (phi1 - phi0) * k) * Math.PI / 180;
    out.push({ t: R(t0 + (t1 - t0) * k), x: R(cx - r * Math.sin(phi)), y: R(y[0] + (y[1] - y[0]) * k), z: R(cz + r * Math.cos(phi)) });
  }
  return out;
}
/** 扫射段里弹着经过 k（0…1）的时刻。 */
const StrafeAtK = (st, k) => R(st.t0 + k * (st.t1 - st.t0));
/** 点 p 在扫射线 from→to 上的参数 k（投影）。 */
const StrafeK = (st, p) => { const dx = st.to.x - st.from.x, dz = st.to.z - st.from.z; return ((p.x - st.from.x) * dx + (p.z - st.from.z) * dz) / (dx * dx + dz * dz); };

// ---------------------------------------------------------------------------
// 11 冒着炮出村南口

function S1101(ctx) {
  const s = new Seq(ctx, "11-1", "出胡同口：身后一发炮");
  const P = KP(ctx, "11-1");
  const K = id => KXZ(ctx, "11-1", id), K2 = id => KXZ(ctx, "11-2", id);
  const cart = K("GengCart"), heizi = K("Heizi"), luo = K("Luo");
  // 身后一发炮落在胡同里（回头看那一下）
  s.Eye(0, 1.3, { stance: "stand", yaw: P.yawDeg, pitch: -2, toLook: LANE_SHELL, toPitch: 2 });
  Shell(s, 0.9, LANE_SHELL, { radius: 3.5, volume: 1.0, shake: 0.7 });
  s.Caption(0.3, 3.0, "（顺子最后一个出胡同口，身后一发炮落在胡同里）");
  // 庄子里一排排落炮，草顶烧着
  s.Eye(1.3, 3.2, { stance: "stand", look: LANE_SHELL, pitch: 2, toLook: VILLAGE_SHELLS[0], toPitch: 5 });
  VILLAGE_SHELLS.forEach((p, i) => Shell(s, 1.7 + i * 1.1, p, { radius: 4, sfx: "artilleryFar", volume: 0.7, shake: 0.15, smoke: "SmokeBlack", smokeDur: 30 }));
  s.Caption(3.6, 3.0, "（庄子里一排排落炮，草顶烧着）");
  // 车停在村南口外，黑子一炸一跳，老耿拽着笼头；担架员把冬瓜横搁上车板
  s.Eye(4.5, 2.4, { stance: "stand", look: VILLAGE_SHELLS[0], pitch: 5, toLook: heizi, toPitch: -6 });
  s.Caption(4.8, 3.2, "（老耿的车停在村南口外，黑子一炸一跳，老耿拽着笼头；牲口受惊没有动作，说明字顶）");
  s.Key("Geng", 0, { faceTo: "Heizi" });
  s.Key("Bearer1", 0, { clip: GRIP_LITTER, faceTo: cart });
  s.Key("Bearer2", 0.4, { clip: GRIP_LITTER, faceTo: cart });
  s.Eye(6.9, 3.0, { stance: "stand", look: heizi, pitch: -6, toLook: cart, toPitch: -9 });
  s.Caption(8.0, 3.4, "（担架员把冬瓜和另外两个肚子挨了枪的横搁上车板，冬瓜靠车尾）");
  s.Key("Donggua", 0, { clip: LIE_WRITHE });
  // 班长边跑边喊：炮一停，狗日的就要钻出来……（先停下来冲大家挥手喊，再带人往西跑）
  s.Eye(9.9, 1.0, { stance: "stand", look: cart, pitch: -9, toLook: luo, toPitch: -2 });
  s.Key("Luo", 9.6, { faceTo: "player", clip: WAVE_ON });
  const call = s.Say("SquadOrders.01", "Luo", 10.4);
  s.Cam(10.9, s.End("SquadOrders.01") - 10.9 + 0.4, { from: { x: P.x, z: P.z, h: 1.62 }, look: { actor: "Luo", offset: [0, 1.4, 0] }, ease: "linear" });
  // 往西看：墙根小路、石板桥、桥那头的渡口
  const west = s.End("SquadOrders.01") + 0.4;
  s.Eye(west, 1.4, { stance: "stand", look: luo, pitch: -2, toLook: BRIDGE_MID, toPitch: 0 });
  s.Caption(west + 0.2, 4.2, "（往西看：顺着庄子南墙根一条小路，尽头是河汊子上的石板桥；桥那头的河滩上，人流往北沙河边的渡口涌）");
  s.Eye(west + 1.4, 4.0, { stance: "stand", look: BRIDGE_MID, pitch: 0, toLook: FERRY_SQ, toPitch: 1 });
  // 班长带人顺南墙根往西先跑（跑到 11-2 的位置）；幺娃、何有田各扛一箱子弹（没有扛箱子的姿态）
  s.Key("Luo", west, { clip: null, yawDeg: 90 });
  for (const [id, t0] of [["Luo", west + 0.2], ["Yaowa", west + 0.5], ["HeYoutian", west + 0.7], ["Squad1", west + 0.9], ["Squad2", west + 1.1]]) {
    const to = K2(id);
    s.Walk(id, t0, to, { move: "run", speed: 3.0, yawDeg: 90 });
  }
  s.Caption(west + 4.6, 3.0, "（幺娃、何有田各扛一箱子弹跑；班长带人顺南墙根往西先跑）");
  void call;
  return s.Done({ durationS: west + 8.0 });
}

function S1102(ctx) {
  const s = new Seq(ctx, "11-2", "我跟车：文财，你也去");
  const P = KP(ctx, "11-2");
  const K = id => KXZ(ctx, "11-2", id), K3 = id => KXZ(ctx, "12-1", id);
  const luo = K("Luo"), cart = K("GengCart");
  // 车动了：车、黑子、老耿往西走（车上的担架、冬瓜、车尾的妮儿都挂在车上，不写位置键）
  const D = 5.6, T1 = 1.0, T2 = T1 + D / 1.4;
  for (const id of ["GengCart", "Heizi", "Geng"]) s.Shift(id, T1, T2, -D, 0, { yawDeg: 90 });
  s.Key("Donggua", 0, { clip: LIE_WRITHE });
  s.Caption(0.3, 3.0, "（车动了；妮儿坐车尾沿，两条腿悬在外头——程序化身体没有坐姿，按车尾的挂点挂着）");
  // 顺子：我跟车！（眼睛看着跑远的班长）
  s.Eye(0, 2.6, { stance: "stand", look: luo, pitch: -2 });
  s.Say("FollowCart.01", null, 0.8);
  // 班长回头看他一眼：……文财，你也去！（指着刘文财说）
  s.Key("Luo", 2.0, { faceTo: "player", clip: POINT });
  const you = s.Say("FollowCart.02", "Luo", 2.8);
  s.Eye(2.6, s.End("FollowCart.02") - 2.6, { stance: "stand", look: luo, pitch: -2 });
  s.Eye(s.End("FollowCart.02"), 0.6, { stance: "stand", look: luo, pitch: -2, toLook: K("LiuWencai"), toPitch: -3 });
  s.Caption(s.End("FollowCart.02") + 0.2, 2.4, "（任务字：跟车到渡口）");
  // 刘文财走到车另一边；班长他们接着往西跑到桥西头坎沿
  const go = s.End("FollowCart.02") + 0.4;
  s.Key("Luo", go, { clip: null, yawDeg: 90 });
  for (const [id, t0] of [["Luo", go + 0.2], ["Yaowa", go + 0.4], ["HeYoutian", go + 0.6], ["Squad1", go + 0.8], ["Squad2", go + 1.0]]) s.Walk(id, t0, K3(id), { move: "run", speed: 3.0, stance: "prone", aim: false, faceTo: BRIDGE_W });
  const liuTo = Pt(K3("LiuWencai").x + 5.6 - 0, K3("LiuWencai").z);   // 12-1 里车又往西走了，这里只跟到车边
  s.Go("LiuWencai", go, go + 3.0, cart.x - D + 1.9, cart.z - 1.1, { move: "run", yawDeg: 90 });
  s.Eye(go + 0.6, 3.0, { stance: "stand", look: K("LiuWencai"), pitch: -3, toLook: Pt(cart.x - D, cart.z), toPitch: -6 });
  // 跟上车：眼睛走到车尾
  const eye1 = Pt(cart.x - D + 1.9, cart.z + 1.0);
  s.WalkEye(go + 3.6, 2.4, Pt(P.x, P.z), eye1, { x: cart.x - D, z: cart.z, h: 1.0 }, { lookTo: { ...BRIDGE_MID, h: 1.0 }, ease: "inOut" });
  // 担架员往回跑接下一副
  s.Walk("Bearer1", 1.0, Pt(117, 540), { speed: 2.4 });
  s.Walk("Bearer2", 1.4, Pt(117, 541.5), { speed: 2.4 });
  void you; void liuTo;
  return s.Done({ durationS: go + 6.4 });
}

// ---------------------------------------------------------------------------
// 12 过石板桥，往渡口赶

function S1201(ctx) {
  const s = new Seq(ctx, "12-1", "墙根：到了没得？快了");
  const P = KP(ctx, "12-1");
  const cart = KXZ(ctx, "12-1", "GengCart");
  // 车顺墙根小路往西：车、黑子、老耿、刘文财与眼睛一起走 9 m
  const D = 9.0, T1 = 0.5, T2 = R(T1 + D / 1.4);
  for (const id of ["GengCart", "Heizi", "Geng", "LiuWencai"]) s.Shift(id, T1, T2, -D, 0, { yawDeg: 90 });
  s.Key("Donggua", 0, { clip: LIE_WRITHE });
  const eye0 = Pt(P.x, P.z), eye1 = Pt(P.x - D, P.z);
  s.WalkEye(T1, T2 - T1, eye0, eye1, { x: cart.x - D, z: cart.z, h: 1.0 }, { lookTo: { ...BRIDGE_MID, h: 1.0 }, ease: "inOut" });
  s.Eye(0, T1, { stance: "stand", look: cart, pitch: -4 });
  s.Caption(0.3, 3.0, "（老耿一手笼头一手鞭子；顺子在车尾扶车帮，刘文财在车另一边）");
  // 墙那头落炮；一发打偏落在小路南边麦地，土泼一车
  Shell(s, 1.6, Pt(92, 538), { radius: 3.5, sfx: "artilleryFar", volume: 0.6, shake: 0.15 });
  const mud = 3.2;
  Shell(s, mud, FIELD_SHELL, { radius: 3.0, volume: 1.0, shake: 0.6, smoke: "SmokeDust", smokeDur: 5 });
  s.Caption(mud + 0.1, 3.0, "（墙那头落炮，一发打偏落在小路南边麦地，土泼一车）");
  // 冬瓜睁眼：到了没得？快了！
  const ask = s.Say("AlmostThere.01", "Donggua", mud + 2.6);
  s.Say("AlmostThere.02", null);
  s.Caption(s.End("AlmostThere.02") + 0.3, 2.4, "（任务字：跟车到渡口）");
  // 接着走到桥东头跟前
  const T3 = R(s.End("AlmostThere.02") + 1.0), D2 = 7.0, T4 = R(T3 + D2 / 1.4);
  for (const id of ["GengCart", "Heizi", "Geng", "LiuWencai"]) s.Shift(id, T3, T4, -D2, 0, { yawDeg: 90 });
  s.WalkEye(T2, T3 - T2, eye1, eye1, { ...BRIDGE_MID, h: 1.0 }, { lookTo: { x: cart.x - D, z: cart.z, h: 1.0 }, ease: "inOut" });
  s.WalkEye(T3, T4 - T3, eye1, Pt(eye1.x - D2, eye1.z), { x: cart.x - D - D2, z: cart.z, h: 1.0 });
  void ask;
  return s.Done({ durationS: T4 + 0.4 });
}

function S1202(ctx) {
  const s = new Seq(ctx, "12-2", "石板桥：黑子不走，妮儿牵它上桥");
  const P = KP(ctx, "12-2");
  const K = id => KXZ(ctx, "12-2", id);
  const cart = K("GengCart"), heizi = K("Heizi"), nierHead = K("Nier"), geng = K("Geng");
  // 开场妮儿还坐在车尾沿上（预演键 ride 挂回车尾；关键帧里她已在驴头前）
  s.Key("Nier", 0, { ride: { ...NIER_TAIL_RIDE } });
  s.Key("Donggua", 0, { clip: LIE_WRITHE });
  s.Eye(0, 3.0, { stance: "stand", look: heizi, pitch: -6 });
  s.Caption(0.3, 4.0, "（河汊子贴庄子西墙往南流，坎比人高，沟底一汪浑水齐腰深；桥是几块条石搭两个石墩，刚够一辆车，没栏杆）");
  s.Caption(4.4, 3.0, "（班长他们已趴在桥西头坎沿，撬开弹药箱）");
  s.Eye(3.0, 2.2, { stance: "stand", look: heizi, pitch: -6, toLook: BRIDGE_W, toPitch: -2 });
  // 身后又一排炮更近
  Shell(s, 5.2, Pt(84, 541), { radius: 3.5, volume: 0.8, shake: 0.4 });
  Shell(s, 6.3, Pt(70, 539), { radius: 3.5, volume: 0.9, shake: 0.5 });
  s.Caption(7.4, 2.4, "（身后又一排炮更近）");
  s.Eye(5.2, 2.2, { stance: "stand", look: BRIDGE_W, pitch: -2, toLook: heizi, toPitch: -6 });
  // 黑子到桥头低头看水不走；老耿抽它，它往后坐、车往后溜
  s.Key("Geng", 0, { faceTo: "Heizi" });
  s.Caption(7.6, 3.2, "（黑子到桥头低头看水，四条腿一撑不走；老耿抽它，它往后坐、车往后溜）");
  for (const id of ["GengCart", "Heizi", "Geng"]) s.Shift(id, 8.0, 9.2, 0.6, 0, { yawDeg: id === "Geng" ? Yaw(geng, heizi) : 90 });
  s.Eye(7.4, 6.0, { stance: "stand", look: heizi, pitch: -6 });
  const whip = s.Say("BalkingMule.01", "Geng", 9.6);
  // 妮儿溜下车：ride null + 切到车尾外半步，绕过车南边跑到黑子头前
  const tail = CartWorld(Pt(cart.x + 0.6, cart.z), 90, { x: 0, z: 1.2 });
  const offT = R(s.End("BalkingMule.01") + 0.2);
  s.Key("Nier", offT, { ride: null, x: tail.x + 0.5, z: tail.z + 0.6, move: "cut", yawDeg: 90, stance: "stand" });
  s.Go("Nier", offT + 0.2, offT + 2.2, nierHead.x, nierHead.z, { move: "run", path: [Pt(cart.x + 0.6, cart.z + 1.5), Pt(cart.x - 2.0, cart.z + 1.3)], faceTo: "Heizi" });
  s.Eye(offT, 2.4, { stance: "stand", look: heizi, pitch: -6, toLook: nierHead, toPitch: -8 });
  s.Caption(offT + 0.3, 2.4, "（妮儿溜下车跑到黑子头前）");
  s.Caption(offT + 2.6, 3.4, "（两手捧它的脸、脑门贴上去——程序化身体没有这动作，说明字顶；攥笼头往桥上走）");
  s.Eye(offT + 2.4, 3.6, { stance: "stand", look: nierHead, pitch: -8 });
  // 黑子跟她上了桥：妮儿、黑子、车、老耿、刘文财顺桥面往西；眼睛跟上
  const go = offT + 5.6, D = 5.0, T2 = R(go + D / 1.0);
  s.Go("Nier", go, T2, nierHead.x - D, nierHead.z, { move: "walk", yawDeg: 90 });
  s.Go("Heizi", go + 0.3, T2, heizi.x + 0.6 - D, heizi.z, { move: "walk", yawDeg: 90 });
  s.Go("GengCart", go + 0.3, T2, cart.x + 0.6 - D, cart.z, { move: "walk", yawDeg: 90 });
  s.Go("Geng", go + 0.3, T2, 41.8 - D, 567.6, { move: "walk", yawDeg: 90 });
  s.Go("LiuWencai", go + 0.6, T2, K("LiuWencai").x - D, K("LiuWencai").z, { move: "walk", yawDeg: 90 });
  s.WalkEye(go, T2 - go, Pt(P.x, P.z), Pt(P.x - D, P.z), { x: nierHead.x, z: nierHead.z, h: 0.9 }, { lookTo: { x: nierHead.x - D, z: nierHead.z, h: 0.9 }, ease: "linear" });
  s.Caption(go + 0.4, 3.6, "（黑子跟她上了桥。从这起妮儿牵着黑子走最前头——班长不对顺子说话）");
  void whip;
  return s.Done({ durationS: T2 + 0.4 });
}

function S1203(ctx) {
  const s = new Seq(ctx, "12-3", "炮停：「看」老耿家冒烟；钢盔冒头；渡口人流");
  const P = KP(ctx, "12-3");
  const K = id => KXZ(ctx, "12-3", id);
  const cart = K("GengCart"), liu = K("LiuWencai"), geng = K("Geng");
  const fwd = Fwd(KU(ctx, "12-3", "GengCart").yawDeg);
  // 车下桥刚上河滩：炮停了，静得出奇
  s.Eye(0, 2.6, { stance: "stand", look: Along(cart, fwd, 8), pitch: -2 });
  s.Caption(0.3, 2.6, "（车下桥刚上河滩，身后炮停，静得出奇）");
  // 两三秒后庄子里「轰」一声，跟着「叮」：出「看」的按键
  const boom = 2.8;
  s.Sfx(boom, "grenadeBlast", { x: GENG_SMOKE.x, z: GENG_SMOKE.z, volume: 0.8 });
  s.Ev(boom, "explosion", { x: GENG_SMOKE.x, z: GENG_SMOKE.z, kind: "grenade", radius: 3, h: 1.0 });
  s.Ev(boom + 0.2, "smoke", { x: GENG_SMOKE.x, z: GENG_SMOKE.z + 1, kind: "SmokeBlack", dur: 26 });
  s.Shake(boom, 0.4, 0.15);
  s.Caption(boom + 0.2, 2.2, "（「轰」一声，跟着「叮」一声：屏幕出「看」的按键，不按三秒消失）");
  // 像按了「看」一样：视角转去看老耿家腾起黑烟
  s.Eye(2.6, 1.2, { stance: "stand", look: Along(cart, fwd, 8), pitch: -2, toLook: GENG_SMOKE, toPitch: 6 });
  s.Eye(3.8, 3.4, { stance: "stand", look: GENG_SMOKE, pitch: 6 });
  s.Caption(boom + 1.6, 3.0, "（「看」：视角转过去——老耿家腾起黑烟）");
  s.Key("Geng", boom + 0.6, { faceTo: GENG_SMOKE });
  s.Key("LiuWencai", boom + 0.8, { faceTo: GENG_SMOKE });
  // 刘文财指着烟：狗日的进了老耿家了！（眼睛先转到他身上）；顺子：莫看了！走！
  s.Key("LiuWencai", 7.4, { clip: POINT });
  s.Eye(7.2, 0.8, { stance: "stand", look: GENG_SMOKE, pitch: 6, toLook: liu, toPitch: -2 });
  const saw = s.Say("LookBack.01", "LiuWencai", 8.0);
  s.Say("LookBack.02", null);
  const back = s.End("LookBack.02") + 0.3;
  s.Key("LiuWencai", back, { clip: null, yawDeg: KU(ctx, "12-3", "GengCart").yawDeg });
  s.Key("Geng", back + 0.2, { faceTo: "Heizi" });
  s.Caption(back, 2.4, "（老耿回头看一眼烟，扬鞭）");
  s.Eye(8.0, back - 8.0 + 0.4, { stance: "stand", look: liu, pitch: -2 });
  // 墙根小路尽头、村南口冒出两三顶钢盔；桥西头班长他们一齐开火，钢盔缩回去
  for (const id of ["Helmet1", "Helmet2", "Helmet3"]) s.Key(id, 0, { visible: false });
  const peek = back + 0.6;
  for (const [id, dt] of [["Helmet1", 0], ["Helmet2", 0.3], ["Helmet3", 0.5]]) s.Key(id, peek + dt, { visible: true });
  s.Caption(peek + 0.2, 2.6, "（墙根小路尽头、村南口冒出两三顶钢盔）");
  s.Eye(back + 0.4, 1.2, { stance: "stand", look: liu, pitch: -2, toLook: HELMETS, toPitch: 1 });
  s.Eye(back + 1.6, 3.4, { stance: "stand", look: HELMETS, pitch: 1 });
  const volley = peek + 1.4;
  s.Sfx(volley, "rifleVolley", { x: BRIDGE_W.x, z: BRIDGE_W.z, volume: 0.9 });
  ["Luo", "Yaowa", "HeYoutian", "Squad1", "Squad2"].forEach((id, i) => s.Ev(volley + i * 0.12, "muzzle", { actor: id }));
  LinePts(Pt(115.4, 548.0), Pt(119.6, 549.6), 4).forEach((p, i) => Puff(s, volley + 0.4 + i * 0.1, p));
  for (const [id, dt] of [["Helmet1", 0.6], ["Helmet2", 0.8], ["Helmet3", 0.9]]) s.Key(id, volley + dt, { visible: false });
  s.Caption(volley + 0.2, 2.6, "（桥西头班长他们一齐开火，钢盔缩回去）");
  s.Eye(back + 5.0, 1.4, { stance: "stand", look: HELMETS, pitch: 1, toLook: BRIDGE_W, toPitch: -1 });
  // 河滩：一眼望到河边；渡口前人一股股往浮桥上挤；渡口的兵站土台子上喊
  const ferry = back + 6.4;
  s.Eye(ferry, 1.6, { stance: "stand", look: BRIDGE_W, pitch: -1, toLook: FERRY_SQ, toPitch: 0 });
  s.Caption(ferry + 0.2, 4.4, "（河滩：麦苗只有脚面高，一眼望到河边。渡口前人一股股往浮桥上挤；桥窄，一回只过一副担架。不挂红十字）");
  s.Eye(ferry + 1.6, 7.0, { stance: "stand", look: FERRY_SQ, pitch: 0 });
  s.Key("FerrySoldier", ferry + 1.2, { faceTo: FERRY_SQ, clip: HALT });
  const call = s.Say("FerryCall.01", "FerrySoldier", ferry + 2.0);
  s.Key("FerrySoldier", s.End("FerryCall.01") + 0.6, { clip: null });
  // 人流往浮桥头挪（各顺着自己的朝向走 2.5 m）；车挤进人流边上，一点点往接收院门口挪
  for (const id of KG(ctx, "12-3", "crowd")) { const u = KU(ctx, "12-3", id); const f = Fwd(u.yawDeg); s.Shift(id, ferry, ferry + 2.5 / 0.9, f.x * 2.5, f.z * 2.5); }
  for (const id of ["Nier", "Heizi", "GengCart", "Geng", "LiuWencai"]) s.Shift(id, ferry + 0.4, ferry + 6.4, fwd.x * 6, fwd.z * 6, { yawDeg: KU(ctx, "12-3", "GengCart").yawDeg });
  s.Caption(ferry + 5.0, 3.0, "（车挤进人流边上，一点点往接收院门口挪）");
  void saw; void call; void geng; void P;
  return s.Done({ durationS: ferry + 8.8 });
}

// ---------------------------------------------------------------------------
// 13 机枪压渡口，飞机来

/** 人堆炸开：百姓每五个倒一个（state down）、其余往堤下趴（stance prone）；兵趴下。 */
function CrowdHit(s, ctx, kfId, t, { downIds, proneIds }) {
  for (const id of downIds) s.Key(id, t + (id.length % 3) * 0.1, { state: "down" });
  for (const id of proneIds) s.Key(id, t + 0.2 + (id.length % 4) * 0.15, { stance: "prone" });
  void ctx; void kfId;
}

function S1301(ctx) {
  const s = new Seq(ctx, "13-1", "机枪压渡口：对岸！墙角那挺机枪！");
  const P = KP(ctx, "13-1");
  const K = id => KU(ctx, "13-1", id);
  const cart = KXZ(ctx, "13-1", "GengCart"), liuAt = KXZ(ctx, "13-1", "LiuWencai"), cartYaw = K("GengCart").yawDeg;
  const crowd = KG(ctx, "13-1", "crowd");
  // 开场人堆还站着（关键帧里已经炸开）：倒下的站起来、趴着的站起来
  for (const id of crowd) { const u = K(id); if (u.state === "down") s.Key(id, 0, { state: "alive", stance: "stand" }); else if (u.stance === "prone") s.Key(id, 0, { stance: "stand" }); }
  s.Key("Donggua", 0, { clip: LIE_WRITHE });
  s.Eye(0, 2.4, { stance: "crouch", look: FERRY_SQ, pitch: -2 });
  s.Caption(0.3, 3.6, "（桥头枪声停一阵，鬼子没再从胡同口硬冲；庄子西南角那个院子挨过炮的院墙塌个豁子，几个鬼子把一挺机枪架上豁子）");
  // 机枪顺人流扫过来：弹着点一串串从桥头那边扫到人堆，人堆炸开
  const sweep1 = 2.6;
  s.Eye(2.4, 1.0, { stance: "crouch", look: FERRY_SQ, pitch: -2, toLook: MG, toPitch: 2, shake: 0.2 });
  MgBurst(s, sweep1, "BreachMg", MG, { count: 14, volume: 0.9, puffs: LinePts(Pt(10, 597), Pt(-8, 632), 12), sweepS: 1.6 });
  CrowdHit(s, ctx, "13-1", sweep1 + 0.6, { downIds: ["CCiv05", "CCiv10", "CCiv15"], proneIds: ["CCiv02", "CCiv07", "CCiv12", "CCiv16", "CWalker01", "CWalker03", "CSoldier01", "CLitter02"] });
  s.Caption(sweep1 + 0.2, 3.6, "（隔着河汊子，石板桥和整片河滩都在它眼皮底下。机枪顺人流扫过来，人堆炸开：往桥上冲、往河堤底下趴）");
  s.Caption(sweep1 + 3.8, 2.4, "（有人跳进河里——跳河没有表现，说明字顶）");
  s.Eye(3.4, 2.4, { stance: "crouch", look: MG, pitch: 2, toLook: Pt(-2, 620), toPitch: -3, shake: 0.2 });
  // 刘文财扑到车后：对岸！墙角那挺机枪！
  const liu0 = CartWorld(cart, cartYaw, { x: 1.7, z: -1.2 });
  s.Place("LiuWencai", 0, liu0.x, liu0.z, { stance: "stand", aim: false, faceTo: FERRY_SQ });
  s.Go("LiuWencai", 3.0, 4.6, liuAt.x, liuAt.z, { move: "run", stance: "crouch", faceTo: MG });
  s.Key("LiuWencai", 4.8, { clip: POINT, faceTo: MG });
  s.Eye(5.8, 1.0, { stance: "crouch", look: Pt(-2, 620), pitch: -3, toLook: liuAt, toPitch: -4 });
  const shout = s.Say("AcrossTheCreek.01", "LiuWencai", 6.0);
  s.Caption(s.End("AcrossTheCreek.01") + 0.2, 2.6, "（车后头是河滩上唯一的掩体）");
  s.Key("LiuWencai", s.End("AcrossTheCreek.01") + 0.3, { clip: null, aim: true, faceTo: MG });
  Shot(s, s.End("AcrossTheCreek.01") + 0.6, "LiuWencai", { volume: 0.8 });
  // 玩家真打：趴车后隔河对射；步枪兵打一个倒一个；压机枪照 08：一打它就缩、一停它就扫人堆
  const fight = s.End("AcrossTheCreek.01") + 1.2;
  s.Eye(fight - 0.4, 1.0, { stance: "crouch", look: liuAt, pitch: -4, toLook: MG, toPitch: 2 });
  s.Eye(fight + 0.6, 16.0, { stance: "crouch", look: MG, pitch: 2, shake: 0.15 });
  s.Caption(fight, 4.0, "（玩家这时在真打：趴车后隔河对射。步枪兵打一个倒一个；机枪手打得倒，倒了副射手爬上来接着打）");
  for (const [k, id] of [[0.6, "player"], [1.8, "player"], [3.0, "player"], [2.4, "LiuWencai"], [4.1, "LiuWencai"], [1.2, "FerrySoldier"], [3.4, "FerryGuard1"], [2.0, "Luo"], [3.6, "Yaowa"], [5.0, "HeYoutian"]]) Shot(s, fight + k, id, { volume: id === "player" ? 0.9 : 0.6 });
  s.Key("BreachRifle1", fight + 1.9, { state: "down" });
  s.Key("BreachMg", fight + 3.2, { aim: false });    // 一打它就缩
  s.Caption(fight + 4.2, 3.0, "（压机枪照 08：一打它就缩，一停它就扫人堆。刘文财、渡口那几个兵一起打，桥头班长他们也打豁子）");
  s.Key("BreachMg", fight + 6.0, { aim: true });
  MgBurst(s, fight + 6.2, "BreachMg", MG, { count: 12, volume: 0.9, puffs: LinePts(Pt(2, 606), Pt(-9, 630), 9), sweepS: 1.2 });
  CrowdHit(s, ctx, "13-1", fight + 6.8, { downIds: ["CWalker02"], proneIds: ["CCiv04", "CCiv09", "CCiv13"] });
  for (const [k, id] of [[7.2, "player"], [8.4, "player"], [7.8, "LiuWencai"], [8.0, "FerryGuard2"], [8.8, "Luo"]]) Shot(s, fight + k, id, { volume: id === "player" ? 0.9 : 0.6 });
  s.Key("BreachMg", fight + 8.6, { state: "down" });
  s.Caption(fight + 8.8, 2.6, "（机枪手倒了，副射手爬上来接着打）");
  s.Key("BreachLoader", fight + 9.0, { x: MG.x + 0.1, z: MG.z + 0.3, move: "crawl", stance: "prone", yawDeg: K("BreachMg").yawDeg, aim: true });
  MgBurst(s, fight + 11.2, "BreachLoader", MG, { count: 10, volume: 0.9, puffs: LinePts(Pt(-6, 618), Pt(-10, 634), 7), sweepS: 1.0 });
  for (const [k, id] of [[11.6, "player"], [12.8, "player"], [12.2, "LiuWencai"], [13.0, "Squad1"]]) Shot(s, fight + k, id, { volume: id === "player" ? 0.9 : 0.6 });
  s.Key("BreachRifle3", fight + 12.9, { state: "down" });
  s.Caption(fight + 13.4, 2.6, "（一时谁也过不去）");
  void shout; void P;
  return s.Done({ durationS: fight + 16.6 });
}

function S1302(ctx) {
  const s = new Seq(ctx, "13-2", "信号弹、飞机来：扫过桥头、人堆、驴车");
  const P = KP(ctx, "13-2");
  const K = id => KU(ctx, "13-2", id), K3 = id => KU(ctx, "13-3", id);
  const cart = KXZ(ctx, "13-2", "GengCart"), heizi = KXZ(ctx, "13-2", "Heizi");
  const crowd = KG(ctx, "13-2", "crowd");
  // 开场：人堆趴着（关键帧），兵趴着；喊飞机的那个（浮桥头拦人的兵）还站着
  s.Key("FerryGuard2", 0, { stance: "stand", aim: false, faceTo: FERRY_SQ });
  s.Key("Donggua", 0, { clip: LIE_WRITHE });
  // 对岸信号弹：正式弹道、短燃烧红星与烟迹；颜色与摆点为创作复原。
  s.Eye(0, 2.0, { stance: "prone", look: MG, pitch: 4 });
  s.Ev(0.8, "flare", { x: MG.x, z: MG.z, atX: FLARE.x, atZ: FLARE.z, preset: "SignalRed" });
  s.Eye(2.0, 3.4, { stance: "prone", look: MG, pitch: 4, toLook: FLARE, toPitch: 78 });
  s.Eye(5.4, 0.6, { stance: "prone", look: FLARE, pitch: 78, toLook: Pt(200, 672), toPitch: 6 });
  // 几秒后东边顺着河传来嗡嗡声：两架飞机贴着河面压下来，顺着浮桥从桥头一路扫到人堆、扫到驴车
  const STRAFE = { t0: 9.6, t1: 11.2, from: Pt(-5, 664), to: Pt(-1, 604), hz: 24 };
  TwoPlanes(s, [
    { t: 1.0, x: 340, y: 100, z: 672 }, { t: 4.4, x: 170, y: 52, z: 678 }, { t: 7.2, x: 60, y: 26, z: 690 }, { t: 9.2, x: -2, y: 20, z: 690 },
    { t: 10.8, x: -8, y: 16, z: 650 }, { t: 12.0, x: -12, y: 17, z: 612 }, { t: 13.6, x: -28, y: 40, z: 560 }, { t: 16.6, x: -90, y: 110, z: 470 },
  ], { strafe: [STRAFE], dt: 1.3, dz: 0, dx: 20, dy: 8, diveA: 8.6, diveB: 9.9 });
  s.Caption(5.4, 3.0, "（几秒后东边顺着河传来嗡嗡声）");
  // 有人喊：飞机！趴倒！（浮桥头拦人的兵指着天喊，喊完自己扑倒）；屏幕出卧倒提示；再抬眼盯着压下来的飞机
  const guard2 = KXZ(ctx, "13-2", "FerryGuard2");
  s.Eye(6.0, 0.8, { stance: "prone", look: Pt(200, 672), pitch: 6, toLook: guard2, toPitch: 2 });
  s.Key("FerryGuard2", 6.2, { clip: POINT, faceTo: Pt(200, 672) });
  const warn = s.Say("PlanesWarning.01", "FerryGuard2", 6.6);
  s.Eye(6.8, s.End("PlanesWarning.01") - 6.8 + 0.3, { stance: "prone", look: guard2, pitch: 2 });
  s.Caption(s.End("PlanesWarning.01") + 0.1, 1.6, "（Z 卧倒；不趴不判失败）");
  s.Key("FerryGuard2", s.End("PlanesWarning.01") + 0.4, { ...DUCK });
  // 趴在车后头看飞机：眼睛贴地会被车身挡住，机位从车东沿探出去一点（h 0.9）
  const peek = Pt(P.x + 2.8, P.z - 0.4);
  s.Cam(s.End("PlanesWarning.01") + 0.3, 9.6 - s.End("PlanesWarning.01") - 0.3, { from: { ...peek, h: 0.9 }, look: { aircraft: KI30.a }, ease: "linear" });
  s.Caption(8.2, 3.2, "（两架飞机贴着河面压下来，顺着浮桥从桥头一路扫到人堆：机枪同时在扫）");
  MgBurst(s, 8.0, "BreachLoader", MG, { count: 10, volume: 0.8, puffs: LinePts(Pt(4, 608), Pt(-6, 628), 7), sweepS: 1.0 });
  // 桥上的人一个接一个掉进河里（桥板上两个走着的：弹着经过时倒下、藏掉）
  for (const [id, z] of [["BridgeWalk1", 653], ["BridgeWalk2", 660]]) {
    s.Spawn(id, { side: "nra", x: BR.x + (id.endsWith("1") ? 0.4 : -0.4), z, yawDeg: 180, role: "walkingWounded" }, { visible: true });
    s.Go(id, 0.5, 14.0, BR.x + (id.endsWith("1") ? 0.4 : -0.4), z + 13.5, { move: "walk", yawDeg: 180 });
    const hit = StrafeAtK(STRAFE, StrafeK(STRAFE, Pt(BR.x, z + 6)));
    s.Key(id, hit, { state: "down" });
    s.Key(id, hit + 0.7, { visible: false });
    Puff(s, hit - 0.05, Pt(BR.x + 1.0, z + 6));
  }
  s.Caption(10.0, 2.6, "（桥上的人一个接一个掉进河里——倒下后藏掉，说明字顶）");
  // 岸上百姓、白布担架都挨打
  const nearLine = crowd.filter(id => { const u = K(id); const k = StrafeK(STRAFE, u); if (k < 0 || k > 1) return false; const p = Pt(STRAFE.from.x + (STRAFE.to.x - STRAFE.from.x) * k, STRAFE.from.z + (STRAFE.to.z - STRAFE.from.z) * k); return Dist(p, u) < 2.2; });
  for (const id of nearLine) s.Key(id, StrafeAtK(STRAFE, StrafeK(STRAFE, K(id))), { state: "down" });
  s.Caption(10.9, 2.4, "（岸上百姓、白布担架都挨打）");
  // 眼睛：趴着看飞机压下来、看它扫过桥头人堆，再看向车
  s.Cam(9.6, 1.4, { from: { ...peek, h: 0.9 }, look: { aircraft: KI30.a }, lookTo: { ...FERRY_HEAD, h: 0.5 }, ease: "inOut", shake: 0.3 });
  s.Cam(11.0, 1.0, { from: { ...peek, h: 0.9 }, look: { ...FERRY_HEAD, h: 0.5 }, lookTo: { ...heizi, h: 0.5 }, ease: "inOut", shake: 0.5 });
  // 扫到驴车：黑子挨一梭惨叫一挣，车翻了，车板上的担架连人甩出去，冬瓜摔在车旁空地上（身底下还是那床单被）
  const hit = StrafeAtK(STRAFE, StrafeK(STRAFE, heizi));
  s.Ev(hit, "explosion", { x: cart.x, z: cart.z + 0.4, kind: "grenade", radius: 1.2, h: 0.3 });
  s.Shake(hit, 1.2, 0.6);
  s.Key("Heizi", hit + 0.05, { state: "down" });
  s.Place("Heizi", hit + 0.1, K3("Heizi").x, K3("Heizi").z, { yawDeg: K3("Heizi").yawDeg });
  s.Signal(hit + 0.1, SIG.cartOverturned, true);
  s.Key("GengCart", hit + 0.1, { visible: false });
  s.Spawn("BlanketDonggua", { side: "nra", kind: "litter", name: "冬瓜的单被", bearers: 0, x: K3("BlanketDonggua").x, z: K3("BlanketDonggua").z, yawDeg: K3("BlanketDonggua").yawDeg }, { visible: false });
  s.Key("BlanketDonggua", hit + 0.15, { visible: true });
  s.Key("LitterDonggua", hit + 0.15, { ride: null, x: K3("BlanketDonggua").x + 2.4, z: K3("BlanketDonggua").z - 1.6, move: "cut", visible: false });
  s.Key("Donggua", hit + 0.15, { ride: null, x: K3("Donggua").x, z: K3("Donggua").z, move: "cut", yawDeg: K3("Donggua").yawDeg, lie: "along", clip: null });
  for (const [id, lit] of [["Wounded1", "CartLitter1"], ["Wounded2", "CartLitter2"]]) {
    s.Key(id, hit + 0.15, { ride: null, x: K3(id).x, z: K3(id).z, move: "cut", yawDeg: K3(id).yawDeg, lie: "along" });
    s.Key(lit, hit + 0.15, { ride: null, x: K3(id).x + 1.5, z: K3(id).z + 0.8, move: "cut", visible: false });
  }
  s.Sfx(hit + 0.2, "bodyFall", { x: cart.x + 1.5, z: cart.z, volume: 0.9 });
  s.Caption(hit + 0.3, 3.6, "（黑子挨一梭惨叫一挣，车翻了，车板上的担架连人甩出去；冬瓜摔在车旁空地上，身底下还是那床单被）");
  s.Cam(hit + 0.9, 3.0, { from: { ...peek, h: 0.9 }, look: { ...heizi, h: 0.5 }, lookTo: { ...K3("BlanketDonggua"), h: 0.2 }, ease: "inOut" });
  s.Cam(hit + 3.9, 2.0, { from: { ...peek, h: 0.9 }, look: { ...K3("BlanketDonggua"), h: 0.2 }, ease: "linear" });
  void warn;
  return s.Done({ durationS: hit + 6.0 });
}

function S1303(ctx) {
  const s = new Seq(ctx, "13-3", "车翻了：妮儿扑到黑子身上；飞机往西兜圈子");
  const P = KP(ctx, "13-3");
  const K = id => KXZ(ctx, "13-3", id), K2 = id => KXZ(ctx, "13-2", id);
  const heizi = K("Heizi"), blanket = K("BlanketDonggua"), nier = K("Nier"), geng = K("Geng");
  // 飞机拉起来往西兜（圆心在河西南的野地上空）
  TwoPlanes(s, Circle(0, 24, -140, 540, 180, 160, 420, [100, 120]), { dt: 1.5, dz: 0, dx: -26, dy: 10 });
  s.Caption(0.4, 3.0, "（飞机拉起来往西兜）");
  s.Cam(0, 2.6, { from: { x: P.x, z: P.z, h: 1.05 }, look: { aircraft: KI30.a }, lookTo: { ...heizi, h: 0.4 }, ease: "inOut" });
  // 妮儿从车旁爬过来扑到黑子身上（程序化身体：跑到驴身边站着，说明字）
  s.Place("Nier", 0, K2("Nier").x, K2("Nier").z, { stance: "stand", faceTo: "Heizi" });
  s.Go("Nier", 0.6, 2.4, nier.x, nier.z, { move: "run", faceTo: "Heizi" });
  s.Caption(2.4, 3.0, "（黑子侧躺着后腿一下一下地蹬；妮儿扑到黑子身上——程序化身体扑不下去，站在它头边）");
  s.Say("NierScream.01", "Nier", 3.0);
  s.Eye(2.6, 3.4, { stance: "crouch", look: heizi, pitch: -8 });
  // 老耿奔冬瓜（跪不下，站在被子边）
  s.Place("Geng", 0, K2("Geng").x, K2("Geng").z, { stance: "stand", faceTo: "Heizi" });
  s.Go("Geng", 1.4, 4.0, geng.x, geng.z, { move: "run", faceTo: "Donggua" });
  s.Eye(6.0, 1.4, { stance: "crouch", look: heizi, pitch: -8, toLook: blanket, toPitch: -10 });
  s.Caption(6.2, 3.2, "（冬瓜摔在车旁露在空地上，身底下还是那床单被；老耿看了黑子一眼，就一眼，奔冬瓜去了）");
  // 兜圈时玩家接着压机枪，也可以朝飞机开枪（打不下来）
  s.Eye(7.4, 1.0, { stance: "crouch", look: blanket, pitch: -10, toLook: MG, toPitch: 2 });
  s.Caption(7.8, 3.0, "（兜圈时接着压机枪；也可以朝飞机开枪，打不下来）");
  MgBurst(s, 8.0, "BreachLoader", MG, { count: 10, volume: 0.8, puffs: LinePts(Pt(0, 612), Pt(-8, 630), 7), sweepS: 1.0 });
  for (const [k, id] of [[8.8, "player"], [10.0, "player"], [9.4, "LiuWencai"], [10.6, "Luo"]]) Shot(s, k, id, { volume: id === "player" ? 0.9 : 0.6 });
  s.Eye(8.4, 3.6, { stance: "crouch", look: MG, pitch: 2, shake: 0.15 });
  s.Cam(12.0, 2.6, { from: { x: P.x, z: P.z, h: 1.05 }, look: { aircraft: KI30.a }, ease: "linear" });
  s.Ev(12.6, "muzzle", { actor: "player" });
  s.Sfx(12.6, "rifleShot", { x: P.x, z: P.z, volume: 0.9 });
  s.Caption(12.6, 2.4, "（朝飞机开了一枪）");
  s.Eye(14.6, 2.0, { stance: "crouch", look: MG, pitch: 2 });
  return s.Done({ durationS: 16.6 });
}

// ---------------------------------------------------------------------------
// 14 拖被子，松手

function S1401(ctx) {
  const s = new Seq(ctx, "14-1", "揪被角：妮儿一声不吭揪住另一角");
  const P = KP(ctx, "14-1");
  const K = id => KXZ(ctx, "14-1", id), K3 = id => KXZ(ctx, "13-3", id), K2 = id => KXZ(ctx, "14-2", id);
  const blanket0 = K("BlanketDonggua"), blanket1 = K2("BlanketDonggua"), geng = K("Geng");
  const fr = Frame(blanket0, TROUGH), yaw = Yaw(blanket0, TROUGH);
  // 飞机在西边拐弯，掉头声听得见：从西边绕回来（这一拍不开枪）
  TwoPlanes(s, [{ t: 1.0, x: -340, y: 120, z: 540 }, { t: 7.0, x: -210, y: 72, z: 598 }, { t: 12.0, x: -120, y: 40, z: 614 }, { t: 16.0, x: -62, y: 28, z: 616 }], { dt: 1.3, dz: -16, dy: 8, diveA: 14.2 });
  s.Caption(0.3, 3.0, "（飞机在西边拐弯，掉头声听得见。冬瓜一个人躺在翻倒的车旁、露在空地上）");
  // 老耿背着另一个甩出来的伤员往河堤底下爬（没有背人的姿态：伤员在他身边一起挪），回头喊：冬瓜！把他弄过来！
  const geng0 = Pt(3.4, 614.6), w0 = Pt(4.1, 615.1);
  s.Place("Geng", 0, geng0.x, geng0.z, { faceTo: TROUGH });
  s.Place("Wounded1", 0, w0.x, w0.z, { yawDeg: 20 });
  s.Key("Geng", 1.0, { faceTo: "player" });
  const call = s.Say("BringHim.01", "Geng", 1.4);
  s.Eye(0, 1.6, { stance: "crouch", look: blanket0, pitch: -12, toLook: geng0, toPitch: -4 });
  s.Eye(1.6, s.End("BringHim.01") - 1.6 + 0.4, { stance: "crouch", look: geng0, pitch: -4 });
  s.Caption(s.End("BringHim.01") + 0.2, 2.4, "（任务字：把冬瓜拖到河堤底下）");
  const crawl = s.End("BringHim.01") + 0.3;
  s.Go("Geng", crawl, crawl + 8.0, geng.x, geng.z, { move: "walk", faceTo: TROUGH });
  s.Go("Wounded1", crawl, crawl + 8.0, K("Wounded1").x, K("Wounded1").z, { move: "walk", yawDeg: 20, lie: "along" });
  s.Caption(crawl + 0.4, 3.0, "（老耿背着伤员往河堤底下爬——没有背人的姿态，伤员躺着跟他一起挪）");
  // 拖人就得停火：玩家一离开车后，机枪不缩了，刘文财一个人压不住
  s.Caption(crawl + 3.4, 3.0, "（拖人就得停火：玩家一离开车后，机枪不缩了，刘文财一个人压不住）");
  MgBurst(s, crawl + 3.0, "BreachLoader", MG, { count: 12, volume: 0.8, puffs: LinePts(Pt(-2, 616), Pt(-9, 632), 7), sweepS: 1.0 });
  MgBurst(s, crawl + 9.0, "BreachLoader", MG, { count: 10, volume: 0.8, puffs: LinePts(Pt(2, 608), Pt(-6, 626), 7), sweepS: 1.0 });
  for (const t of [crawl + 1.4, crawl + 5.6, crawl + 10.4]) Shot(s, t, "LiuWencai", { volume: 0.6 });
  // 玩家揪单被一个角（跟 02 拖被子同键同姿势，手上没枪）：眼睛蹲到被头右角上
  const eyeL0 = PullL(blanket0, fr), eyeL1 = PullL(blanket1, fr);
  s.Eye(s.End("BringHim.01") + 0.4, 2.2, { stance: "crouch", look: geng0, pitch: -4, toLook: blanket0, toPitch: -24 });
  s.Caption(crawl + 2.2, 3.2, "（揪单被一个角：跟 02 拖被子同键同姿势，手上没枪）");
  s.Cam(crawl + 2.0, 1.6, { from: { x: P.x, z: P.z, h: 1.05 }, to: { ...eyeL0, h: 1.05 }, look: { ...blanket0, h: 0.2 }, ease: "inOut" });
  // 妮儿从黑子身边爬过来，一声不吭揪住另一个角（骨骼身体：PvBlanketDragR，她在被子右边）
  const nier0 = K3("Nier"), nierPull0 = PullR(blanket0, fr), nierPull1 = PullR(blanket1, fr);
  s.Place("Nier", 0, nier0.x, nier0.z, { stance: "stand", faceTo: "Heizi" });
  s.Go("Nier", crawl + 0.6, crawl + 4.4, nierPull0.x, nierPull0.z, { move: "crawl", faceTo: TROUGH });
  s.Key("Nier", crawl + 4.6, { stance: "stand", carryRole: "front", clip: DRAG_R, yawDeg: yaw });
  s.Caption(crawl + 4.6, 3.0, "（妮儿从黑子身边爬过来，一声不吭揪住另一个角）");
  s.Eye(crawl + 3.6, 2.0, { stance: "crouch", x: eyeL0.x, z: eyeL0.z, look: blanket0, pitch: -24, toLook: nierPull0, toPitch: -16 });
  // 两人往河堤底下拖，河堤在前头十几步；飞机声越来越尖（俯冲）
  const go = crawl + 5.6, T1 = R(go + Dist(blanket0, blanket1) / DRAG_MPS);
  s.Go("BlanketDonggua", go, T1, blanket1.x, blanket1.z, { move: "walk", yawDeg: yaw });
  CarryOnBlanket(s, go, T1, blanket1, yaw);
  s.Go("Nier", go, T1, nierPull1.x, nierPull1.z, { move: "walk", yawDeg: yaw });
  const mid = k => Pt(eyeL0.x + (eyeL1.x - eyeL0.x) * k, eyeL0.z + (eyeL1.z - eyeL0.z) * k);
  const k1 = 2.4 / (T1 - go), k2 = 3.8 / (T1 - go);
  s.WalkEye(go, 2.4, eyeL0, mid(k1), { ...TROUGH, h: 0.6 }, { h: 1.05, lookTo: { actor: "Nier", offset: [0, 0.9, 0] }, ease: "inOut" });
  // 抬头看一眼从西边压下来的飞机，再看回低洼
  s.Cam(go + 2.4, 1.4, { from: { ...mid(k1), h: 1.05 }, to: { ...mid(k2), h: 1.05 }, look: { aircraft: KI30.a }, ease: "linear" });
  s.WalkEye(go + 3.8, T1 - go - 3.8, mid(k2), eyeL1, { aircraft: KI30.a }, { h: 1.05, lookTo: { ...TROUGH, h: 0.6 }, ease: "inOut" });
  s.Caption(go + 0.4, 2.0, "（两人往河堤底下拖，河堤在前头十几步）");
  s.Caption(go + 2.6, 2.8, "（飞机声越来越尖：俯冲）");
  void call;
  return s.Done({ durationS: T1 + 0.4 });
}

function S1402(ctx) {
  const s = new Seq(ctx, "14-2", "松手：顺子扑倒，被角脱手；妮儿还攥着另一角在拽");
  const P = KP(ctx, "14-2");
  const K = id => KXZ(ctx, "14-2", id), K1 = id => KXZ(ctx, "14-1", id);
  const blanket1 = K("BlanketDonggua"), liu = K("LiuWencai");
  const fr = Frame(K1("BlanketDonggua"), TROUGH), yaw = Yaw(K1("BlanketDonggua"), TROUGH);
  // 开场还在拖：被子从 1.3 m 后头拖到关键帧位置；妮儿在右角、眼睛在左角（蹲着拖，手上没枪）
  const blanket0 = Along(blanket1, fr.f, -1.3);
  const nier0 = PullR(blanket0, fr), nier1 = PullR(blanket1, fr), eye0 = PullL(blanket0, fr), eye1 = PullL(blanket1, fr);
  s.Place("BlanketDonggua", 0, blanket0.x, blanket0.z, { yawDeg: yaw });
  s.Place("Donggua", 0, blanket0.x, blanket0.z, { yawDeg: yaw, lie: "along" });
  s.Place("Nier", 0, nier0.x, nier0.z, { yawDeg: yaw, stance: "stand", carryRole: "front", clip: DRAG_R });
  const T1 = 1.5;
  s.Go("BlanketDonggua", 0.1, T1, blanket1.x, blanket1.z, { move: "walk", yawDeg: yaw });
  CarryOnBlanket(s, 0.1, T1, blanket1, yaw);
  s.Go("Nier", 0.1, T1, nier1.x, nier1.z, { move: "walk", yawDeg: yaw });
  // 拖着走：先回头看一眼被子上的冬瓜和攥着另一角的妮儿（两角都攥着），再抬头看压下来的飞机
  s.Cam(0, 0.9, { from: { ...eye0, h: 1.05 }, to: { ...Along(eye0, fr.f, 0.6), h: 1.05 }, look: { actor: "Nier", offset: [0, 0.6, 0] }, ease: "linear" });
  // 两架飞机顺着河滩从西边俯冲过来往东去：A 机一串弹着顺地皮追过来，从冬瓜身上扫过、擦着妮儿过去
  const STRAFE = { t0: 1.3, t1: 2.5, from: Pt(-18, 612), to: Pt(14, 615), hz: 30 };
  TwoPlanes(s, [
    { t: 0, x: -74, y: 30, z: 616 }, { t: 1.4, x: -30, y: 18, z: 614 }, { t: 2.6, x: 10, y: 15, z: 613 }, { t: 3.8, x: 60, y: 22, z: 608 },
    { t: 6.0, x: 150, y: 60, z: 590 }, { t: 9.0, x: 300, y: 130, z: 540 },
  ], { strafe: [STRAFE], dt: 1.2, dz: -16, dy: 8, diveA: 0.3, diveB: 1.5 });
  const hit = StrafeAtK(STRAFE, StrafeK(STRAFE, blanket1));
  s.Shake(STRAFE.t0 + 0.3, 1.6, 0.8);
  // 俯冲声压到头顶：抬头看一眼从西边压下来的 A 机
  s.Cam(0.9, 0.7, { from: { ...Along(eye0, fr.f, 0.6), h: 1.05 }, to: { ...Along(eye0, fr.f, 1.1), h: 1.05 }, look: { aircraft: KI30.a }, ease: "linear" });
  // 松手（收走控制两三秒，慢镜头）：俯冲声压到头顶，顺子本能扑倒，被角从手里脱出去（被子键 dragSolo：玩家那角不攥、落地）。
  // 趴下去的机位落在被头后退一步的地方（贴着布什么都看不见），砸到 0.35 m
  const drop = 1.6;
  const away = Frame(blanket1, Pt(P.x, P.z));
  const head = Pt(P.x + away.f.x * 1.3, P.z + away.f.z * 1.3);
  s.Slowmo(drop - 0.1, 1.8, 0.3, 0.3);
  s.Cam(drop, 0.6, { from: { ...eye1, h: 1.05 }, to: { ...head, h: 0.35 }, look: { actor: "Nier", offset: [0, 0.5, 0] }, ease: "inOut", shake: 0.8 });
  s.Caption(drop + 0.05, 2.6, "（俯冲声压到头顶，一串弹着点顺地皮追过来，顺子本能扑倒，被角从手里脱出去）");
  s.Key("BlanketDonggua", drop + 0.15, { dragSolo: true });
  // 妮儿没趴（听不见），还攥着另一角一个人往后拽：冬瓜被拽着挪了一点、挪不动
  const tug0 = drop + 0.3, tug1 = drop + 3.2;
  const blanket2 = Along(blanket1, fr.f, 0.35), nier2 = PullR(blanket2, fr);
  s.Go("Nier", tug0, tug1, nier2.x, nier2.z, { move: "walk", yawDeg: yaw });
  s.Go("BlanketDonggua", tug0 + 0.2, tug1, blanket2.x, blanket2.z, { move: "walk", yawDeg: yaw });
  CarryOnBlanket(s, tug0 + 0.2, tug1, blanket2, yaw);
  // 弹着点从冬瓜身上扫过，他一抽；被子上洇开一片血（没有洇血表现，说明字顶）
  s.Key("Donggua", hit, { clip: LIE_WRITHE });
  s.Key("Donggua", hit + 2.4, { clip: null });
  // 抬眼（控制交还）：自己手边空了；妮儿脸朝顺子，不知道他为什么停。趴着的眼睛离被子只有一步，贴着布什么都看不见：
  // 抬眼那几条机位从趴的地方往后退一步、抬到 0.6 m（头抬起来），看得见妮儿攥着的那角、落地的这角和冬瓜
  const up = drop + 0.6;
  s.Cam(up, 2.6, { from: { ...head, h: 0.35 }, to: { ...head, h: 0.6 }, look: { actor: "Nier", offset: [0, 0.5, 0] }, lookTo: { actor: "Nier", offset: [0, 0.7, 0] }, ease: "inOut", shake: 0.4 });
  s.Caption(up + 2.2, 3.2, "（抬眼：自己手边空了；妮儿没趴（听不见），还攥着另一角一个人往后拽，脸朝顺子，不知道他为什么停）");
  s.Key("Nier", up + 2.8, { faceTo: "player" });
  s.Cam(up + 2.6, 3.0, { from: { ...head, h: 0.6 }, look: { actor: "Nier", offset: [0, 0.7, 0] }, ease: "linear" });
  s.Cam(up + 5.6, 3.8, { from: { ...head, h: 0.6 }, look: { actor: "Nier", offset: [0, 0.7, 0] }, lookTo: { actor: "Donggua", offset: [0, 0.3, 0] }, ease: "inOut" });
  s.Caption(up + 5.6, 3.4, "（冬瓜被拽着挪了一点、挪不动；那串弹着点从他身上扫过，他一抽，被子上洇开一片血——洇血没有表现，说明字顶）");
  s.Caption(up + 9.0, 2.2, "（弹着点擦着妮儿过去，她没挨着）");
  // 车后头刘文财脸正冲这边，全看见了
  s.Key("LiuWencai", up + 9.4, { faceTo: "player", aim: false });
  s.Cam(up + 9.4, 1.2, { from: { ...head, h: 0.6 }, look: { actor: "Donggua", offset: [0, 0.3, 0] }, lookTo: { actor: "LiuWencai", offset: [0, 1.0, 0] }, ease: "inOut" });
  s.Caption(up + 9.8, 2.8, "（车后头刘文财脸正冲这边，全看见了）");
  s.Cam(up + 10.6, 2.4, { from: { ...head, h: 0.6 }, look: { actor: "LiuWencai", offset: [0, 1.0, 0] }, ease: "linear" });
  return s.Done({ durationS: up + 13.0 });
}

function S1403(ctx) {
  const s = new Seq(ctx, "14-3", "老耿跑回来接另一角；刘文财捞妮儿；豁子炸了");
  const P = KP(ctx, "14-2");
  const K = id => KXZ(ctx, "14-3", id), K2 = id => KXZ(ctx, "14-2", id);
  const blanket1 = K2("BlanketDonggua"), blanket3 = K("BlanketDonggua");
  const fr = Frame(K2("BlanketDonggua"), TROUGH), yaw = Yaw(K2("BlanketDonggua"), TROUGH);
  // 开场 = 14-2 末尾：被子在关键帧位置往前 0.35 m，妮儿还攥着右角，顺子趴在左角边上；飞机拉起来往东飞走
  const blanket0 = Along(blanket1, fr.f, 0.35), nier0 = PullR(blanket0, fr);
  s.Place("BlanketDonggua", 0, blanket0.x, blanket0.z, { yawDeg: yaw });
  s.Place("Donggua", 0, blanket0.x, blanket0.z, { yawDeg: yaw, lie: "along" });
  s.Place("Nier", 0, nier0.x, nier0.z, { yawDeg: yaw, stance: "stand", carryRole: "front", clip: DRAG_R });
  s.Key("Nier", 0.2, { faceTo: "player" });
  TwoPlanes(s, [{ t: 0, x: 90, y: 40, z: 600 }, { t: 4.0, x: 240, y: 90, z: 570 }, { t: 9.0, x: 480, y: 190, z: 540 }], { dt: 1.2, dz: -16, dy: 8 });
  s.Caption(0.3, 2.6, "（飞机拉起来往东飞走）");
  // 老耿扔下背上的伤员跑回来（骨骼身体），接妮儿那一角；刘文财冲出去把妮儿捞回来
  const gengPull0 = PullR(blanket0, fr);
  s.Place("Geng", 0, K2("Geng").x, K2("Geng").z, { stance: "stand", faceTo: blanket0 });
  s.Eye(0, 2.0, { stance: "prone", x: P.x, z: P.z, look: K2("LiuWencai"), pitch: 2, toLook: K2("Geng"), toPitch: 2 });
  s.Caption(1.0, 2.8, "（老耿扔下背上的伤员跑回来）");
  s.Go("LiuWencai", 0.8, 3.2, nier0.x + fr.r.x * 0.9, nier0.z + fr.r.z * 0.9, { move: "run", depart: { aim: false }, faceTo: "Nier" });
  s.Key("Nier", 3.4, { carryRole: null, clip: null, faceTo: "LiuWencai" });
  s.Caption(3.4, 2.8, "（刘文财冲出去把妮儿捞回来——没有抱人的姿态，并排走）");
  s.Go("Nier", 3.8, 6.0, K("Nier").x, K("Nier").z, { move: "walk", faceTo: "LiuWencai" });
  s.Go("LiuWencai", 3.8, 6.0, K("LiuWencai").x, K("LiuWencai").z, { move: "walk", faceTo: "Nier" });
  s.Go("Geng", 1.4, 4.4, gengPull0.x, gengPull0.z, { move: "run", yawDeg: yaw });
  s.Key("Geng", 4.6, { carryRole: "front", clip: DRAG_R, yawDeg: yaw });
  // 顺子爬回去揪起自己那一角（眼睛起到左角上）；被子两角又都有人攥着
  const eyeL0 = PullL(blanket0, fr), eyeL3 = PullL(blanket3, fr);
  s.Cam(2.0, 2.6, { from: { x: P.x, z: P.z, h: 0.32 }, to: { ...eyeL0, h: 1.05 }, look: { ...blanket0, h: 0.2 }, ease: "inOut" });
  s.Key("BlanketDonggua", 4.6, { dragSolo: false });
  s.Caption(4.6, 2.6, "（顺子爬回去揪起自己那一角；老耿攥着另一角）");
  // 一人一角把冬瓜拖进河堤底下
  const go = 5.0, T1 = R(go + Dist(blanket0, blanket3) / 1.1);
  const gengPull3 = PullR(blanket3, fr);
  s.Go("BlanketDonggua", go, T1, blanket3.x, blanket3.z, { move: "walk", yawDeg: yaw });
  CarryOnBlanket(s, go, T1, blanket3, yaw);
  s.Go("Geng", go, T1, gengPull3.x, gengPull3.z, { move: "walk", yawDeg: yaw });
  s.Eye(4.6, 0.4, { stance: "crouch", x: eyeL0.x, z: eyeL0.z, look: blanket0, pitch: -24 });
  // 拖的时候先看身边攥着另一角的老耿，再看前头的低洼，最后看向豁子那边
  const eyeMid = Pt(eyeL0.x + (eyeL3.x - eyeL0.x) * 0.3, eyeL0.z + (eyeL3.z - eyeL0.z) * 0.3);
  s.WalkEye(go, (T1 - go) * 0.3, eyeL0, eyeMid, { actor: "Geng", offset: [0, 1.1, 0] }, { h: 1.05, lookTo: { ...TROUGH, h: 0.4 }, ease: "inOut" });
  s.WalkEye(go + (T1 - go) * 0.3, (T1 - go) * 0.7, eyeMid, eyeL3, { ...TROUGH, h: 0.4 }, { h: 1.05, lookTo: { ...MG, h: 1.5 }, ease: "inOut" });
  s.Caption(go + 0.6, 3.0, "（一人一角把冬瓜拖进河堤底下）");
  // 班长他们顺着河汊子西坎摸到豁子对面，一捆手榴弹甩进豁子：「轰」一声，机枪哑了；桥头零零星星还在打
  const KB = id => KXZ(ctx, "13-3", id);
  for (const [id, dt] of [["Luo", 0], ["Yaowa", 0.4], ["HeYoutian", 0.8]]) {
    s.Place(id, 0, KB(id).x, KB(id).z, { stance: "prone", aim: true, faceTo: MG });
    s.Walk(id, 1.0 + dt, K(id), { move: "run", speed: 2.6, stance: "crouch", aim: id !== "Luo", faceTo: MG, depart: { stance: "crouch" } });
  }
  s.Caption(9.0, 3.2, "（班长他们顺着河汊子西坎摸到豁子对面）");
  const throwT = 12.6;
  s.Key("Luo", throwT, { throw: { x: MG.x, z: MG.z, h: 0.8 } });
  const land = R(throwT + 2.15 + Math.min(1.8, Math.max(0.6, 0.55 + 0.06 * Dist(K("Luo"), MG))));
  s.Sfx(land, "grenadeBlast", { x: MG.x, z: MG.z, volume: 1.0 });
  s.Ev(land, "explosion", { x: MG.x, z: MG.z, kind: "grenade", radius: 3.2, h: 0.6 });
  s.Ev(land + 0.2, "smoke", { x: MG.x, z: MG.z + 0.5, kind: "SmokeDust", dur: 5 });
  s.Shake(land, 0.6, 0.3);
  s.Signal(land + 0.1, SIG.breachBlasted, true);
  s.Key("BreachLoader", land + 0.1, { state: "down" });
  s.Caption(land + 0.2, 3.0, "（庄子西南角「轰」一声，机枪哑了：一捆手榴弹甩进了豁子）");
  s.Caption(land + 3.4, 2.4, "（桥头零零星星还在打）");
  for (const [t, id] of [[land + 3.6, "Squad1"], [land + 4.8, "Squad2"]]) Shot(s, t, id, { volume: 0.5 });
  s.Eye(T1, Math.max(0.5, land + 6.0 - T1), { stance: "crouch", x: eyeL3.x, z: eyeL3.z, look: MG, pitch: 2 });
  return s.Done({ durationS: Math.max(T1, land) + 6.2 });
}

// ---------------------------------------------------------------------------
// 15 河堤底下，抬到接收院门口

function S1501(ctx) {
  const s = new Seq(ctx, "15-1", "河堤底下：你松你妈啥子手！八个……抵了");
  const K = id => KXZ(ctx, "15-1", id);
  const blanket = K("BlanketDonggua"), liu = K("LiuWencai"), bYaw = KU(ctx, "15-1", "BlanketDonggua").yawDeg;
  Plane(s, 0, "planeDrone", Pt(140, 600), 0.3);
  Plane(s, 7.0, "planeDrone", Pt(260, 560), 0.15);
  s.Eye(0, 6.0, { stance: "crouch", look: blanket, pitch: -16 });
  s.Caption(0.4, 3.6, "（河堤底下：头顶只剩一条红天。飞机声往东去了，越来越小）");
  // 老耿跪在冬瓜右边把毛巾按回伤口里（骨骼身体，CareMedicPress 的站位）；冬瓜躺着弓起来
  const press = PressPose(blanket, bYaw);
  s.Place("Geng", 0, press.x, press.z, { yawDeg: press.yawDeg, stance: "crouch", clip: MEDIC_PRESS });
  s.Key("Donggua", 0, { clip: LIE_TREATED });
  s.Caption(4.2, 4.4, "（老耿跪着捡起那条毛巾，拿手掌把它按回伤口里，按住不放。冬瓜整个人弓起来，叫都没叫出来）");
  // 刘文财把妮儿放下，看看冬瓜，又看看顺子：你松你妈啥子手！（站着吼，枪背着）
  s.Key("LiuWencai", 6.0, { stance: "stand", faceTo: "Donggua" });
  s.Key("LiuWencai", 8.0, { faceTo: "player", clip: TALK_SLUNG });
  s.Eye(6.0, 2.0, { stance: "crouch", look: blanket, pitch: -16, toLook: liu, toPitch: -4 });
  s.Eye(8.0, 3.6, { stance: "crouch", look: liu, pitch: -4 });
  s.Say("GullyBottom.01", "LiuWencai", 8.6);
  s.Caption(s.End("GullyBottom.01") + 0.3, 2.0, "（顺子说不出话）");
  // 冬瓜睁开眼，看着顺子，手伸上来攥住他的袖子（PvLieGrabSleeve：说完「抵了」才放开停住段、停在末帧）
  s.Eye(11.6, 1.6, { stance: "crouch", look: liu, pitch: -4, toLook: blanket, toPitch: -16 });
  s.Say("GullyBottom.02", "Donggua", 13.4);
  s.Say("GullyBottom.03", "Donggua");
  const grabT = 13.0;
  s.Key("Donggua", grabT, { clip: LIE_GRAB, clipRelease: R(s.End("GullyBottom.03") - grabT), clipHold: true });
  s.Eye(13.2, s.End("GullyBottom.03") - 13.2 + 2.4, { stance: "crouch", look: blanket, pitch: -16 });
  s.Caption(s.End("GullyBottom.03") + 0.4, 1.8, "（没人接话）");
  // 刘文财把妮儿推到老耿身边，弯腰去攥被角；老耿等他攥稳了才松手，去牵妮儿
  const give = s.Say("GullyBottom.04", "LiuWencai", s.End("GullyBottom.03") + 2.6);
  s.Key("LiuWencai", give - 0.4, { faceTo: "Nier" });
  s.Eye(give - 0.6, 1.2, { stance: "crouch", look: blanket, pitch: -16, toLook: liu, toPitch: -4 });
  const fr = Frame(blanket, Pt(blanket.x - 1, blanket.z));   // 被子头朝西（yaw 90）
  const liuPull = PullR(blanket, fr);
  const grab = s.End("GullyBottom.04") + 0.3, grabbed = grab + 2.6;
  s.Go("LiuWencai", grab, grabbed, liuPull.x, liuPull.z, { move: "walk", depart: { clip: null }, yawDeg: 90 });
  s.Key("LiuWencai", grabbed + 0.2, { carryRole: "front", clip: DRAG_R });
  s.Eye(give + 0.6, grabbed - give - 0.6, { stance: "crouch", look: liu, pitch: -4, toLook: liuPull, toPitch: -10 });
  s.Caption(grabbed + 0.2, 3.0, "（老耿等他攥稳了，才把按着毛巾的手松开）");
  const nier = K("Nier"), gengTo = Pt(nier.x - 1.0, nier.z + 0.2);
  s.Go("Geng", grabbed + 2.4, grabbed + 3.8, gengTo.x, gengTo.z, { move: "walk", depart: { clip: null, stance: "stand" }, faceTo: "Nier" });
  s.Caption(grabbed + 3.4, 2.0, "（老耿去牵妮儿）");
  s.Eye(grabbed, 2.4, { stance: "crouch", look: liuPull, pitch: -10, toLook: gengTo, toPitch: -6 });
  s.Eye(grabbed + 2.4, 3.6, { stance: "crouch", look: gengTo, pitch: -6 });
  return s.Done({ durationS: grabbed + 6.0 });
}

function S1502(ctx) {
  const s = new Seq(ctx, "15-2", "抬到门口：几十米，没有对白，天一点点黑");
  const K = id => KXZ(ctx, "15-2", id), K1 = id => KXZ(ctx, "15-1", id);
  const blanket1 = K("BlanketDonggua");
  const start = K1("BlanketDonggua");
  const fr = Frame(start, blanket1), yaw = Yaw(start, blanket1);
  // 开场在低洼里：顺子左角、刘文财右角，老耿牵着妮儿跟在后头
  const liu0 = PullR(start, fr), liu1 = PullR(blanket1, fr), eye0 = PullL(start, fr), eye1 = PullL(blanket1, fr);
  s.Place("BlanketDonggua", 0, start.x, start.z, { yawDeg: yaw });
  s.Place("Donggua", 0, start.x, start.z, { yawDeg: yaw, lie: "along" });
  s.Place("LiuWencai", 0, liu0.x, liu0.z, { yawDeg: yaw, stance: "stand", carryRole: "front", clip: DRAG_R });
  s.Place("Geng", 0, start.x + 2.2, start.z + 1.4, { yawDeg: yaw });
  s.Place("Nier", 0, start.x + 3.2, start.z + 1.2, { yawDeg: yaw });
  const T0 = 0.6, T1 = R(T0 + fr.len / DRAG_MPS);
  s.Go("BlanketDonggua", T0, T1, blanket1.x, blanket1.z, { move: "walk", yawDeg: yaw });
  CarryOnBlanket(s, T0, T1, blanket1, yaw);
  s.Go("LiuWencai", T0, T1, liu1.x, liu1.z, { move: "walk", yawDeg: yaw });
  s.Go("Geng", T0 + 0.6, T1 + 0.6, blanket1.x + 2.2, blanket1.z + 1.4, { move: "walk", yawDeg: yaw });
  s.Go("Nier", T0 + 0.8, T1 + 0.8, blanket1.x + 3.2, blanket1.z + 1.2, { move: "walk", yawDeg: yaw });
  // 眼睛：看着前头的接收院门，途中回头看一眼刘文财、看一眼渡口人堆与浮桥
  const H = 1.55;
  const lerp = k => Pt(eye0.x + (eye1.x - eye0.x) * k, eye0.z + (eye1.z - eye0.z) * k);
  const t = k => R(T0 + (T1 - T0) * k);
  s.Eye(0, T0, { stance: "stand", x: eye0.x, z: eye0.z, look: YARD_GATE, pitch: -3 });
  s.WalkEye(t(0), t(0.3) - t(0), eye0, lerp(0.3), { ...YARD_GATE, h: 1.0 }, { h: H });
  s.WalkEye(t(0.3), t(0.45) - t(0.3), lerp(0.3), lerp(0.45), { ...YARD_GATE, h: 1.0 }, { lookTo: { actor: "LiuWencai", offset: [0, 1.25, 0] }, h: H, ease: "inOut" });
  s.WalkEye(t(0.45), t(0.6) - t(0.45), lerp(0.45), lerp(0.6), { actor: "LiuWencai", offset: [0, 1.25, 0] }, { lookTo: { ...PONTOON_MID, h: 0 }, h: H, ease: "inOut" });
  s.WalkEye(t(0.6), t(0.8) - t(0.6), lerp(0.6), lerp(0.8), { ...PONTOON_MID, h: 0 }, { lookTo: { ...YARD_GATE, h: 1.0 }, h: H, ease: "inOut" });
  s.WalkEye(t(0.8), T1 - t(0.8), lerp(0.8), eye1, { ...YARD_GATE, h: 1.0 }, { h: H });
  s.Caption(T0 + 0.4, 4.0, "（顺子和刘文财一人一角拽着被子穿过渡口空场；没有对白，只有喘气声和被子蹭地的声音）");
  s.Caption(t(0.3) + 0.4, 3.6, "（刘文财低着头看路，不看顺子；老耿牵着妮儿跟在后头）");
  s.Caption(t(0.5) + 0.4, 4.0, "（渡口的人堆照旧挤浮桥头，一回只过一副；桥板跟着人一沉一沉）");
  s.Caption(t(0.7) + 0.4, 3.6, "（天一点点黑下来，红褪成灰蓝）");
  s.Caption(t(0.88), 3.4, "（接收院门口墙根下躺一排伤兵，军医在里头；门里有人喊）");
  // 桥上过担架（临时加两副，一回只过一副）
  s.Spawn("CrossLitterA", { side: "nra", kind: "litter", x: BR.x, z: 652, yawDeg: 180 }, { visible: true });
  s.Go("CrossLitterA", 2.0, T1 + 2.0, BR.x, 652 + T1 * 1.2, { move: "walk", yawDeg: 180 });
  s.Spawn("CrossLitterB", { side: "nra", kind: "litter", x: BR.x, z: 640, yawDeg: 180 }, { visible: false });
  s.Key("CrossLitterB", 12.0, { visible: true });
  s.Go("CrossLitterB", 12.2, T1 + 2.0, BR.x, 640 + (T1 - 10.2) * 1.2, { move: "walk", yawDeg: 180 });
  s.Eye(T1, 2.0, { stance: "stand", x: eye1.x, z: eye1.z, look: YARD_GATE, pitch: -3 });
  return s.Done({ durationS: T1 + 2.4 });
}

function S1503(ctx) {
  const s = new Seq(ctx, "15-3", "接收院门口：画的黑子嗦？");
  const K = id => KXZ(ctx, "15-3", id);
  const guard = K("GateGuard"), blanket = K("BlanketDonggua"), heizi = K("Heizi");
  const nier = K("Nier"), draw = Pt(nier.x, nier.z + 1.0), liu = K("LiuWencai"), geng = K("Geng");
  // 守门的兵把人往外推（抬手「站住」PvStandHaltL）：等到！里头满起了！挤你妈啥子！
  s.Eye(0, 4.0, { stance: "crouch", look: guard, pitch: -2 });
  s.Caption(0.3, 3.4, "（院门口的墙根下，担架一副挨一副摆着等；守门的兵把人往外推）");
  s.Key("GateGuard", 0, { faceTo: "player" });
  s.Key("GateGuard", 0.8, { clip: HALT });
  s.Say("GateQueue.01", "GateGuard", 1.2);
  s.Key("GateGuard", 5.0, { clip: null });
  // 冬瓜搁在墙根排在别人后头；顺子在被头蹲下
  s.Eye(4.0, 2.0, { stance: "crouch", look: guard, pitch: -2, toLook: blanket, toPitch: -20 });
  s.Caption(4.4, 3.6, "（冬瓜被搁在墙根，排在别人后头。顺子在被头蹲下（自动））");
  s.Eye(6.0, 2.0, { stance: "crouch", look: blanket, pitch: -20 });
  // 妮儿蹲在地上画驴、摆弹壳（骨骼身体，跪着两手在地上刨的 PvKneelDig 顶着：没有画画 / 摆东西的片段）
  s.Key("Nier", 0, { stance: "crouch", clip: KNEEL_DIG });
  s.Eye(8.0, 1.6, { stance: "crouch", look: blanket, pitch: -20, toLook: draw, toPitch: -18 });
  s.Eye(9.6, 8.0, { stance: "crouch", look: draw, pitch: -18 });
  s.Caption(9.0, 4.6, "（妮儿蹲在地上，捡根树枝在土里画：长脸，两只长耳朵，四条腿，后头拖一辆车）");
  s.Caption(13.8, 3.6, "（画完从衣兜里掏出几个弹壳，一个挨一个，在驴旁边摆成一排）");
  // 刘文财蹲下来看（跪着说话）：画的黑子嗦？算驴腿的账（掰手指头数）
  s.Key("LiuWencai", 0, { stance: "crouch", faceTo: draw, clip: TALK_CROUCH });
  s.Eye(17.6, 1.2, { stance: "crouch", look: draw, pitch: -18, toLook: liu, toPitch: -14 });
  const ask = s.Say("GateQueue.02", "LiuWencai", 18.0);
  const count = s.Say("GateQueue.03", "LiuWencai");
  s.Key("LiuWencai", count - 0.2, { clip: COUNT_FINGERS });
  s.Key("LiuWencai", s.End("GateQueue.03") + 0.3, { clip: TALK_CROUCH });
  s.Caption(count + 0.2, 3.0, "（刘文财拈起一个弹壳，在手心里掂了掂）");
  s.Eye(18.8, count - 18.8 + 3.0, { stance: "crouch", look: liu, pitch: -14 });
  s.Eye(count + 3.0, 1.4, { stance: "crouch", look: liu, pitch: -14, toLook: draw, toPitch: -18 });
  s.Say("GateQueue.04", "LiuWencai");
  s.Eye(count + 4.4, s.End("GateQueue.04") - count - 4.4 + 0.6, { stance: "crouch", look: draw, pitch: -18 });
  s.Caption(s.End("GateQueue.04") + 0.3, 3.0, "（妮儿看着他嘴动，伸手把他手心里那个弹壳拿回来，摆回原来的地方）");
  const stubborn = s.Say("GateQueue.05", "LiuWencai", s.End("GateQueue.04") + 3.2);
  s.Eye(s.End("GateQueue.04") + 0.6, stubborn - s.End("GateQueue.04") - 0.6 + 1.0, { stance: "crouch", look: draw, pitch: -18, toLook: liu, toPitch: -14 });
  // 老耿看着地上的驴（翻车旁倒着的黑子），看了一会儿，把脸转开了
  const turn = s.End("GateQueue.05") + 0.3;
  s.Key("Geng", 0, { faceTo: heizi });
  s.Eye(stubborn + 1.0, turn - stubborn - 1.0 + 1.6, { stance: "crouch", look: liu, pitch: -14, toLook: geng, toPitch: -6 });
  s.Caption(turn, 3.0, "（老耿看着地上的驴，看了一会儿，把脸转开了）");
  s.Key("Geng", turn + 1.6, { faceTo: Pt(-24, 612) });
  s.Key("Doctor", 0, { clip: MEDIC_PRESS });
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
  const K = id => KXZ(ctx, "16-1", id);
  const doctor = K("Doctor");
  // 开场在院门里侧：顺子在被头、刘文财在被尾，被子在两人之间（白盒里被子贴地拖进去）
  const gateIn = Pt(Y.box.maxX - 1.3, Y.gate.z);
  const doorOut = Pt(P.x, P.z);
  const blanketEnd = K("BlanketDonggua"), liuEnd = K("LiuWencai");
  const fr = Frame(gateIn, blanketEnd);
  const blanket0 = gateIn, liu0 = Along(gateIn, fr.f, -1.3), eye0 = Along(gateIn, fr.f, 1.3);
  const heading = Yaw(gateIn, blanketEnd);
  s.Place("BlanketDonggua", 0, blanket0.x, blanket0.z, { yawDeg: heading });
  s.Place("Donggua", 0, blanket0.x, blanket0.z, { yawDeg: heading, lie: "along" });
  s.Place("LiuWencai", 0, liu0.x, liu0.z, { yawDeg: heading, carryRole: "rear" });
  // 老耿和妮儿从院门外跟进来，在厢房门口外等
  s.Place("Geng", 0, Y.box.maxX + 2.0, Y.gate.z + 0.4, { faceTo: XIANG_DOOR });
  s.Place("Nier", 0, Y.box.maxX + 3.0, Y.gate.z - 0.4, { faceTo: XIANG_DOOR });
  s.Walk("Geng", 6.0, K("Geng"), { speed: 1.0, faceTo: XIANG_DOOR });
  s.Walk("Nier", 6.6, K("Nier"), { speed: 1.0, faceTo: XIANG_DOOR });
  // 军医跪在麦秸上一个伤员身边按伤口（关键帧站位就是 CareMedicPress 的站位）
  s.Key("Doctor", 0, { stance: "crouch", yawDeg: DOCTOR_PRESS.yawDeg, clip: MEDIC_PRESS });
  s.Caption(0.3, 4.5, "（院里点着马灯，地上铺着麦秸，躺满了人。院里的老百姓在灶屋烧水，有人抱着门板往外走；白盒里被子贴地拖着进院）");
  // 军医满手是血站起来扫一眼冬瓜，指厢房：肚子上的？抬进去！说完又跪回去
  s.Key("Doctor", 3.4, { stance: "stand", clip: null, faceTo: "Donggua" });
  s.Caption(3.0, 2.6, "（军医满手是血，从一副担架边上站起来，扫了一眼冬瓜）");
  s.Key("Doctor", 4.0, { clip: POINT, faceTo: XIANG_DOOR });
  s.Say("Threshold.01", "Doctor", 4.2);
  s.Key("Doctor", s.End("Threshold.01") + 0.6, { clip: null, stance: "crouch", yawDeg: DOCTOR_PRESS.yawDeg });
  s.Key("Doctor", s.End("Threshold.01") + 1.0, { clip: MEDIC_PRESS });
  // 穿过院子走到厢房门口（1.0 m/s）
  const T1 = 2.0, T2 = R(T1 + fr.len / 1.0);
  s.Eye(0, T1, { stance: "stand", x: eye0.x, z: eye0.z, look: doctor, pitch: -6 });
  s.WalkEye(T1, 5.0, eye0, Along(eye0, fr.f, 5.0), { actor: "Doctor", offset: [0, 1.3, 0] });
  s.WalkEye(T1 + 5.0, T2 - T1 - 5.0, Along(eye0, fr.f, 5.0), doorOut, { actor: "Doctor", offset: [0, 1.3, 0] }, { lookTo: { ...XIANG_DOOR, h: 1.0 }, ease: "inOut" });
  s.Go("BlanketDonggua", T1, T2, blanketEnd.x, blanketEnd.z, { move: "walk", yawDeg: 180 });
  CarryOnBlanket(s, T1, T2, blanketEnd, 180);
  s.Go("LiuWencai", T1, T2, liuEnd.x, liuEnd.z, { move: "walk", yawDeg: 180 });
  // 过门槛：眼睛一低一抬，被子往一边歪了一下
  const th = T2 + 0.6;
  s.Eye(T2, 0.6, { stance: "stand", look: XIANG_DOOR, pitch: -22 });
  s.Caption(th - 0.2, 3.0, "（厢房门口有道门槛：抬着往里迈，被子往一边歪了一下）");
  s.Cam(th, 0.9, { from: { x: P.x, z: P.z, h: 1.62 }, to: { x: P.x, z: P.z + 0.7, h: 1.3 }, look: { ...INSIDE, h: 0.2 }, ease: "inOut", shake: 0.15 });
  s.Cam(th + 0.9, 0.9, { from: { x: P.x, z: P.z + 0.7, h: 1.3 }, to: { x: P.x, z: P.z + 1.5, h: 1.68 }, look: { ...INSIDE, h: 0.2 }, ease: "inOut", shake: 0.25 });
  s.Say("Threshold.02", "Donggua", th + 0.8);
  s.Say("Threshold.03", null);
  // 抬进屋里靠墙的空地：按住键慢慢放
  const inEnd = Pt(INSIDE.x, INSIDE.z), eyeIn = Pt(INSIDE.x, INSIDE.z - 1.3), liuIn = Pt(INSIDE.x, INSIDE.z - 2.6);
  const T3 = th + 1.8, T4 = R(T3 + Dist(Pt(P.x, P.z + 1.5), eyeIn) / 0.9);
  s.WalkEye(T3, T4 - T3, Pt(P.x, P.z + 1.5), eyeIn, { ...INSIDE, h: 0.2 }, { h: 1.62 });
  const door = [Pt(XIANG_DOOR.x, XIANG_DOOR.z + 1.4)];
  s.Go("BlanketDonggua", T3, T4, inEnd.x, inEnd.z, { move: "walk", path: door, yawDeg: 180 });
  s.Go("Donggua", T3, T4, inEnd.x, inEnd.z, { move: "walk", path: door, yawDeg: 180, lie: "along" });
  s.Go("LiuWencai", T3, T4, liuIn.x, liuIn.z, { move: "walk", path: [Pt(XIANG_DOOR.x, XIANG_DOOR.z + 1.0)], yawDeg: 180 });
  s.Caption(T4 + 0.2, 4.0, "（屋里靠墙有块空地。按住键，把被子慢慢放下；一松手就砸下去）");
  s.Eye(T4, 5.0, { stance: "stand", x: eyeIn.x, z: eyeIn.z, look: INSIDE, pitch: -40, toPitch: -50 });
  s.Key("LiuWencai", T4 + 3.8, { carryRole: null });
  s.Caption(T4 + 4.4, 1.8, "（这是冬瓜最后一句话）");
  return s.Done({ durationS: T4 + 6.4 });
}

// ---------------------------------------------------------------------------
// 17 坐在门槛上

function S1701(ctx) {
  const s = new Seq(ctx, "17-1", "没了：老耿用单被盖住他的脸");
  const K = id => KXZ(ctx, "17-1", id);
  const geng = K("Geng"), nier = K("Nier"), liu = K("LiuWencai");
  // 军医从院里过来，在被子西边（冬瓜右手边）跪下，看一眼伤口，又摸摸脖子（CareMedicPress：两手按在胸口）
  const press = PressPose(INSIDE, KU(ctx, "17-1", "BlanketDonggua").yawDeg);
  s.Place("Doctor", 0, XIANG_DOOR.x - 0.2, XIANG_DOOR.z - 1.4, { stance: "stand", faceTo: INSIDE, clip: null });
  s.Go("Doctor", 0.4, 3.2, press.x, press.z, { move: "walk", path: [Pt(XIANG_DOOR.x - 0.2, XIANG_DOOR.z + 1.0)], yawDeg: press.yawDeg });
  s.Key("Doctor", 3.4, { stance: "crouch", clip: MEDIC_PRESS });
  s.Eye(0, 3.4, { stance: "stand", look: INSIDE, pitch: -26 });
  s.Eye(3.4, 5.6, { stance: "stand", look: press, pitch: -22 });
  s.Caption(3.6, 4.6, "（军医蹲下看了一眼伤口，又摸摸脖子，停了一会儿）");
  s.Say("Gone.01", "Doctor", 8.8);
  // 他站起来冲门口吼（指着门口），转身去看别人了；院子里没人停下来
  s.Key("Doctor", s.End("Gone.01") + 0.3, { stance: "stand", clip: POINT, faceTo: XIANG_DOOR });
  const shout = s.Say("Gone.02", "Doctor");
  s.Eye(9.0, shout - 9.0 + 1.0, { stance: "stand", look: press, pitch: -22, toLook: press, toPitch: -6 });
  s.Eye(shout + 1.0, 4.0, { stance: "stand", look: press, pitch: -6 });
  const leave = s.End("Gone.02") + 0.3;
  s.Go("Doctor", leave, leave + 5.0, DOCTOR_PRESS.x, DOCTOR_PRESS.z, { move: "walk", path: [Pt(XIANG_DOOR.x + 0.2, XIANG_DOOR.z + 0.8), Pt(XIANG_DOOR.x + 0.2, XIANG_DOOR.z - 1.4)], depart: { clip: null }, yawDeg: DOCTOR_PRESS.yawDeg });
  s.Key("Doctor", leave + 5.2, { stance: "crouch", clip: MEDIC_PRESS });
  s.Caption(leave + 0.2, 3.0, "（他转身去看别人了。院子里没人停下来）");
  // 刘文财：刚才过门槛，还在说话……（站着说，枪背着）
  s.Key("LiuWencai", leave + 1.0, { faceTo: "Donggua", clip: TALK_SLUNG });
  const liuLine = s.Say("Gone.03", "LiuWencai", leave + 1.6);
  s.Eye(liuLine - 0.6, 1.0, { stance: "stand", look: press, pitch: -6, toLook: liu, toPitch: -8 });
  s.Eye(liuLine + 0.4, s.End("Gone.03") - liuLine - 0.4 + 1.6, { stance: "stand", look: liu, pitch: -8 });
  s.Caption(s.End("Gone.03") + 0.3, 1.6, "（没人答他）");
  s.Key("LiuWencai", s.End("Gone.03") + 1.0, { clip: null });
  // 老耿跪着把冬瓜自己那床单被拉上来，盖住了他的脸（PvKneelPullBlanket：跪着抖开一条被子往前铺，停在末帧）
  const cover = s.End("Gone.03") + 2.0;
  s.Key("Geng", cover - 0.4, { faceTo: "Donggua", stance: "crouch", clip: KNEEL_BLANKET, clipHold: true });
  s.Eye(cover, 1.4, { stance: "stand", look: liu, pitch: -8, toLook: geng, toPitch: -22 });
  s.Caption(cover + 0.4, 5.0, "（老耿用冬瓜自己那床单被盖住了他的脸）");
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
  const yardMid = Pt(-40, 613);
  // 退到门口，在门槛上坐下（自动两秒）
  s.Cam(0, 2.2, { from: { x: SEAT.x - 0.4, z: SEAT.z + 2.2, h: 1.5 }, to: { x: SEAT.x, z: SEAT.z, h: 1.05 }, look: { ...yardMid, h: 1.0 }, ease: "inOut" });
  s.Caption(0.2, 2.2, "（顺子退到门口，在门槛上坐下）");
  // 低头：钱袋、铜板；按 F 挪一个
  s.Eye(2.2, 6.0, { stance: "crouch", yaw: 0, pitch: -6, toPitch: -30 });
  s.Caption(2.8, 3.0, "（他从怀里摸出钱袋，把铜板倒在手心里）");
  s.Caption(6.0, 4.0, "（按 F：一个铜板挪到另一只手里，手指头有点抖。不按也行，他就那么捧着）");
  // 院子里照常忙：有人往里抬、往外抬、烧水；门外渡口上担架一副一副往桥上走
  s.Spawn("LitterIn", { side: "nra", kind: "litter", x: Y.box.maxX + 2.6, z: Y.gate.z - 0.3, yawDeg: 90 }, { visible: true });
  s.Go("LitterIn", 8.0, 18.0, -37.0, 611.6, { move: "walk", path: [Pt(Y.box.maxX - 1.3, Y.gate.z), Pt(-32, 613.4)], yawDeg: 90 });
  s.Spawn("LitterOut", { side: "nra", kind: "litter", x: -51.0, z: 620.0, yawDeg: -90 }, { visible: true });
  s.Go("LitterOut", 9.0, 23.0, Y.box.maxX + 2.6, Y.gate.z + 0.3, { move: "walk", path: [Pt(-36, 617.6), Pt(Y.box.maxX - 1.3, Y.gate.z + 0.2)], yawDeg: -90 });
  s.Go("Civ2", 3.0, 8.0, -29.2, 617.2, { move: "walk", faceTo: Pt(-29.2, 606.4) });
  s.Go("Civ2", 12.0, 17.0, -34.6, 616.4, { move: "walk", yawDeg: -90 });
  s.Key("Doctor", 0, { clip: MEDIC_PRESS });
  s.Eye(8.2, 6.0, { stance: "crouch", yaw: 0, pitch: -30, toYaw: 14, toPitch: -6 });
  s.Caption(10.4, 4.0, "（院子里照常忙：有人往里抬，有人往外抬，有人在烧水）");
  s.Eye(14.2, 6.0, { stance: "crouch", yaw: 14, pitch: -6, toLook: YARD_GATE, toPitch: -2 });
  s.Caption(15.0, 4.0, "（门外渡口上，担架一副一副往桥上走）");
  s.Eye(20.2, 6.0, { stance: "crouch", look: YARD_GATE, pitch: -2, toYaw: 0, toPitch: -30 });
  return s.Done({ durationS: 26.4 });
}

function S1703(ctx) {
  const s = new Seq(ctx, "17-3", "跟斗走");
  const K = id => KXZ(ctx, "17-3", id);
  const luoAt = K("Luo"), yaowaAt = K("Yaowa"), heAt = K("HeYoutian");
  // 院门口一阵乱：班长带着幺娃、何有田和剩下的人从院门进来
  const gateE = Pt(Y.box.maxX + 1.6, Y.gate.z);
  const starts = { Luo: Off(gateE, 0.6, 0), Yaowa: Off(gateE, 1.8, -0.7), HeYoutian: Off(gateE, 2.6, 0.7), Squad1: Off(gateE, 3.6, -0.5), Squad2: Off(gateE, 4.4, 0.6) };
  for (const [id, p] of Object.entries(starts)) s.Place(id, 0, p.x, p.z, { yawDeg: 90 });
  s.Key("Doctor", 0, { clip: MEDIC_PRESS });
  s.Caption(0.5, 4.0, "（院门口一阵乱：罗班长带着幺娃、何有田和剩下几个人从石板桥撤回来进院，满身是土和烟）");
  const arriveLuo = s.Walk("Luo", 1.0, luoAt, { speed: 1.8, faceTo: "player" });
  s.Walk("Yaowa", 1.6, yaowaAt, { speed: 1.8, faceTo: "player" });
  s.Walk("HeYoutian", 2.0, heAt, { speed: 1.8, faceTo: "player" });
  s.Walk("Squad1", 2.6, K("Squad1"), { speed: 1.6, faceTo: "player" });
  s.Walk("Squad2", 3.0, K("Squad2"), { speed: 1.6, yawDeg: 90 });
  s.Eye(0, arriveLuo - 1.6, { stance: "crouch", look: YARD_GATE, pitch: -2 });
  s.Eye(arriveLuo - 1.6, 1.6, { stance: "crouch", look: YARD_GATE, pitch: -2, toLook: luoAt, toPitch: 4 });
  s.Caption(arriveLuo, 3.0, "（班长看见门槛上的顺子，又看见屋里盖着脸的那个）");
  s.Eye(arriveLuo, 3.0, { stance: "crouch", look: luoAt, pitch: 4 });
  // 班长走过去在被子边蹲下，掀开被角看了看，又盖回去（LuoKneelCheck）
  const inDoor = Pt(XIANG_DOOR.x + 0.3, XIANG_DOOR.z + 0.9), kneel = Pt(INSIDE.x + 1.3, INSIDE.z - 0.2);
  s.Key("Nier", arriveLuo + 0.6, { x: INSIDE.x - 1.4, z: XIANG_DOOR.z + 1.1, move: "walk", faceTo: "Luo" });
  const go = arriveLuo + 2.4;
  s.Go("Luo", go, go + 2.6, kneel.x, kneel.z, { move: "walk", path: [inDoor], faceTo: "Donggua" });
  s.Key("Luo", go + 2.8, { stance: "crouch", clip: "LuoKneelCheck" });
  s.Eye(go, 2.6, { stance: "crouch", look: luoAt, pitch: 4, toLook: kneel, toPitch: -18 });
  s.Caption(go + 2.8, 3.6, "（他在被子边蹲下，掀开被角看了看，又盖回去）");
  s.Eye(go + 2.6, 4.0, { stance: "crouch", look: kneel, pitch: -18 });
  const why = s.Say("GetUp.01", "Luo", go + 6.6);
  s.Key("Luo", why - 0.2, { clip: TALK_CROUCH });
  s.Key("LiuWencai", why + 0.2, { faceTo: "player", clip: TALK_SLUNG });
  const liu = K("LiuWencai");
  s.Eye(go + 6.6, s.End("GetUp.01") - go - 6.6, { stance: "crouch", look: kneel, pitch: -18 });
  const plane = s.Say("GetUp.02", "LiuWencai");
  s.Eye(plane - 0.3, 0.6, { stance: "crouch", look: kneel, pitch: -18, toLook: liu, toPitch: -6 });
  s.Caption(plane - 0.2, 1.4, "（刘文财看了顺子一眼）");
  s.Eye(plane + 0.3, 1.6, { stance: "crouch", look: liu, pitch: -6, toLook: kneel, toPitch: -18 });
  const damn = s.Say("GetUp.03", "Luo");
  s.Key("LiuWencai", s.End("GetUp.02") + 0.6, { clip: null });
  s.Caption(damn - 0.3, 1.0, "（班长没再问，蹲了一会儿）");
  // 幺娃站在顺子旁边，看见他手心里那一把铜板，把眼睛挪开了
  const glance = s.End("GetUp.03") + 0.4;
  s.Eye(glance, 1.2, { stance: "crouch", look: kneel, pitch: -18, toLook: yaowaAt, toPitch: 2 });
  s.Caption(glance + 0.2, 3.4, "（幺娃站在顺子旁边，看见他手心里那一把铜板，把眼睛挪开了）");
  s.Key("Yaowa", glance + 1.4, { faceTo: Pt(-30, 612) });
  s.Eye(glance + 1.2, 2.6, { stance: "crouch", look: yaowaAt, pitch: 2 });
  // 班长站起来：顺儿。……起来，跟斗走。
  s.Key("Luo", glance + 3.0, { stance: "stand", faceTo: "player", clip: TALK_SLUNG });
  s.Eye(glance + 3.8, 1.0, { stance: "crouch", look: yaowaAt, pitch: 2, toLook: kneel, toPitch: -8 });
  s.Say("GetUp.04", "Luo", glance + 5.0);
  s.Caption(s.End("GetUp.04") + 0.1, 1.2, "（顺子没抬头）");
  s.Say("GetUp.05", "Luo");
  s.Eye(glance + 4.8, s.End("GetUp.05") - glance - 4.8 + 0.4, { stance: "crouch", look: kneel, pitch: -8 });
  s.Caption(s.End("GetUp.05") + 0.4, 3.0, "（顺子把铜板一把攥住塞回怀里，站起来，拿回全部操作）");
  s.Cam(s.End("GetUp.05") + 0.4, 2.0, { from: { x: SEAT.x, z: SEAT.z, h: 1.05 }, to: { x: SEAT.x, z: SEAT.z, h: 1.62 }, look: { actor: "Luo", offset: [0, 1.4, 0] }, ease: "inOut" });
  return s.Done({ durationS: s.End("GetUp.05") + 3.4 });
}

// ---------------------------------------------------------------------------
// 18 守渡口

function S1801(ctx) {
  const s = new Seq(ctx, "18-1", "桥头的命令：铁路桥炸了");
  const K = id => KXZ(ctx, "18-1", id);
  const officer = K("BridgeOfficer"), sapper = K("Sapper1"), luo = K("Luo"), he = K("HeYoutian"), trench = Pt(PL.trench.x, PL.trench.z);
  const trenchFor = id => KXZ(ctx, "18-2", id);
  // 出了院子就是渡口：空场东侧一道朝东北的散兵坑、工兵跪在第一条船上绑炸药（PvKneelDig）、引线
  for (const id of ["Sapper1", "Sapper2"]) s.Key(id, 0, { clip: KNEEL_DIG });
  s.Key("Doctor", 0, { clip: MEDIC_PRESS });
  s.Eye(0, 4.5, { stance: "stand", look: trench, pitch: -3, toLook: sapper, toPitch: -4 });
  s.Caption(0.3, 4.2, "（出了院子就是渡口：空场东侧一道朝东北的散兵坑，对着石板桥和河滩；一个军官带着几个兵守着）");
  s.Eye(4.5, 4.4, { stance: "stand", look: sapper, pitch: -4 });
  s.Caption(4.6, 4.4, "（浮桥头上，两个工兵跪在第一条船上往船底绑炸药，引线顺着桥板一直拉到南岸）");
  // 桥上的担架往南
  s.Walk("LitterCross", 0.5, BP(700), { speed: 1.2, yawDeg: 180 });
  // 顺着河往东边远处「轰——」一声：铁路桥炸了
  const boom = 9.0;
  s.Sfx(boom, "shellBlast", { x: RAIL_BLAST.x, z: RAIL_BLAST.z, volume: 1.0 });
  s.Sfx(boom + 0.4, "artilleryFar", { x: RAIL_BLAST.x, z: RAIL_BLAST.z, volume: 0.6 });
  s.Ev(boom, "explosion", { x: RAIL_BLAST.x, z: RAIL_BLAST.z, kind: "shell", radius: 9, h: 5 });
  s.Ev(boom + 0.3, "smoke", { x: RAIL_BLAST.x, z: RAIL_BLAST.z, kind: "SmokeBlack", dur: 30 });
  s.Shake(boom + 0.2, 1.0, 0.35);
  s.Eye(boom - 0.1, 1.2, { stance: "stand", look: sapper, pitch: -4, toLook: RAIL_BLAST, toPitch: 6 });
  s.Caption(boom + 0.6, 4.0, "（顺着河往东边远处「轰——」一声，比之前听到的哪一声都响，天边腾起一大团火光）");
  for (const id of ["BridgeOfficer", "Luo", "Yaowa", "HeYoutian", "LiuWencai", "Squad1", "Squad2", "FerrySoldier", "FerryGuard1", "FerryGuard2", "Geng", "Nier", "GateGuard", "Sapper1", "Sapper2"]) s.Key(id, boom + 0.3 + (id.length % 3) * 0.15, { faceTo: RAIL_BLAST });
  s.Caption(boom + 4.8, 2.0, "（桥头的兵全都扭头去看）");
  s.Eye(boom + 1.1, 3.4, { stance: "stand", look: RAIL_BLAST, pitch: 6 });
  s.Eye(boom + 4.5, 1.2, { stance: "stand", look: RAIL_BLAST, pitch: 6, toLook: officer, toPitch: -2 });
  // 军官：铁路桥炸了。……哪部分的？正好，给老子顶到这儿！（军官背着枪说、指着散兵坑下令，§14.4；班长、何有田枪垂着说）
  s.Key("BridgeOfficer", boom + 4.6, { clip: TALK_SLUNG });
  s.Say("BridgeOrders.01", "BridgeOfficer", boom + 5.0);
  const orders = s.Say("BridgeOrders.02", "BridgeOfficer");
  s.Key("BridgeOfficer", orders - 0.4, { faceTo: trench, clip: POINT });
  s.Key("Luo", orders, { faceTo: "BridgeOfficer" });
  s.Key("HeYoutian", orders + 0.4, { faceTo: "BridgeOfficer" });
  s.Key("Yaowa", orders + 0.6, { faceTo: "BridgeOfficer" });
  s.Key("LiuWencai", orders + 0.5, { faceTo: "BridgeOfficer" });
  s.Eye(boom + 5.7, orders - boom - 5.7 + 2.0, { stance: "stand", look: officer, pitch: -2 });
  const howMany = s.Say("BridgeOrders.03", "Luo");
  s.Key("Luo", howMany - 0.3, { clip: TALK_LOW });
  s.Eye(howMany - 0.4, 0.8, { stance: "stand", look: officer, pitch: -2, toLook: luo, toPitch: -2 });
  const dunno = s.Say("BridgeOrders.04", "BridgeOfficer");
  s.Key("BridgeOfficer", dunno - 0.3, { faceTo: "Luo", clip: TALK_SLUNG });
  s.Eye(dunno - 0.3, 0.8, { stance: "stand", look: luo, pitch: -2, toLook: officer, toPitch: -2 });
  const until = s.Say("BridgeOrders.05", "HeYoutian");
  s.Key("HeYoutian", until - 0.3, { clip: TALK_LOW });
  s.Eye(until - 0.4, 0.8, { stance: "stand", look: officer, pitch: -2, toLook: he, toPitch: -2 });
  const lastOne = s.Say("BridgeOrders.06", "BridgeOfficer");
  s.Key("BridgeOfficer", lastOne - 0.3, { faceTo: BP(680), clip: POINT });
  s.Eye(lastOne - 0.3, 0.8, { stance: "stand", look: he, pitch: -2, toLook: officer, toPitch: -2 });
  const onWay = s.Say("BridgeOrders.07", "HeYoutian");
  s.Eye(onWay - 0.4, 0.8, { stance: "stand", look: officer, pitch: -2, toLook: he, toPitch: -2 });
  s.Eye(onWay + 0.4, s.End("BridgeOrders.07") - onWay - 0.4 + 0.6, { stance: "stand", look: he, pitch: -2 });
  // 班长把人一个个塞进散兵坑；渡口的三个兵也进坑；顺子的位置正对东北
  const go = s.End("BridgeOrders.07") + 0.6;
  for (const id of ["Luo", "HeYoutian"]) s.Key(id, go, { clip: null });
  s.Key("BridgeOfficer", go + 1.0, { clip: null, faceTo: "Sapper1" });
  s.Caption(go, 4.0, "（班长把人一个个塞进散兵坑。顺子的位置正对东北：石板桥和河滩）");
  ["Luo", "HeYoutian", "LiuWencai", "Yaowa", "Squad1", "Squad2", "FerrySoldier", "FerryGuard1", "FerryGuard2"].forEach((id, i) => s.Walk(id, go + 0.2 + i * 0.4, trenchFor(id), { speed: 1.6, faceTo: BRIDGE_W, aim: true }));
  s.Eye(go, 1.6, { stance: "stand", look: he, pitch: -2, toLook: trench, toPitch: -3 });
  s.Eye(go + 1.6, 6.0, { stance: "stand", look: trench, pitch: -3, toLook: BRIDGE_W, toPitch: 0 });
  s.Caption(go + 4.4, 2.6, "（任务字：等后头的人过桥）");
  return s.Done({ durationS: go + 8.0 });
}

function S1802(ctx) {
  const s = new Seq(ctx, "18-2", "等：最后一拨人上桥");
  const P = KP(ctx, "18-2");
  const K = id => KU(ctx, "18-2", id), KX = id => KXZ(ctx, "18-2", id);
  const officer = KX("BridgeOfficer"), luo = KX("Luo"), yaowa = KX("Yaowa");
  const ijaIds = Array.from({ length: 10 }, (_, i) => `Ija${i + 1}`);
  const down = new Set();
  // 撤下来的人一个个过桥：伤兵背着伤兵（VilNraCarryOnBack + VilRideOnBack 一对，0.9 m/s）、老百姓慌跑；老耿牵着妮儿在桥上往南
  s.Eye(0, 6.0, { stance: "stand", look: BRIDGE_W, pitch: 0 });
  s.Caption(0.4, 5.0, "（天快黑透了，河滩上还有人往渡口来：三三两两的伤兵、拖儿带女的老百姓。他们一到桥头就挤上浮桥）");
  { const c = KX("Straggler1");
    s.Place("Straggler1", 0, c.x, c.z, { yawDeg: 200, stance: "stand", clip: VIL.carry });
    s.Place("Straggler2", 0, c.x, c.z, { yawDeg: 200, stance: "stand", clip: VIL.ride });
    for (const id of ["Straggler1", "Straggler2"]) s.Walk(id, 1.0, BP(641, -0.4), { speed: 0.9, yawDeg: 180 }); }
  s.Walk("Refugee1", 1.8, BP(641, 0.5), { move: "run", speed: 2.6 });
  s.Go("Geng", 0, 34.0, BR.x - 0.3, 704, { move: "walk", yawDeg: 180 });
  s.Go("Nier", 0, 34.0, BR.x + 0.5, 705.2, { move: "walk", yawDeg: 180 });
  s.Go("Geng", 34.0, 64.0, BR.x - 0.3, 740, { move: "walk", yawDeg: 180 });
  s.Go("Nier", 34.0, 64.0, BR.x + 0.5, 741, { move: "walk", yawDeg: 180 });
  s.Go("LitterCross", 0, 42.0, BR.x, 740, { move: "walk", yawDeg: 180 });
  for (const id of ["Sapper1", "Sapper2"]) s.Key(id, 0, { clip: KNEEL_DIG });
  s.Eye(6.0, 1.6, { stance: "stand", look: BRIDGE_W, pitch: 0, toLook: BP(665), toPitch: -2 });
  s.Caption(6.4, 4.0, "（桥上一个接一个地过，老耿牵着妮儿也在里头，踩着一沉一沉的桥板往南走）");
  s.Eye(7.6, 2.4, { stance: "stand", look: BP(665), pitch: -2 });
  // 接收院里的担架一副一副抬出院门，插进队里上桥；军医跟着最后一副出了院门，没回头
  const gateIn = Pt(Y.box.maxX - 4.0, Y.gate.z + 0.2);
  s.Place("YardLitter3", 0, gateIn.x, gateIn.z, { yawDeg: -90 });
  s.Place("Doctor", 0, gateIn.x - 2.4, gateIn.z - 0.6, { yawDeg: -90, stance: "stand", clip: null });
  s.Walk("YardLitter1", 0.5, BP(740), { speed: 1.2, yawDeg: 180 });
  s.Walk("YardLitter2", 2.0, BP(724), { speed: 1.3, yawDeg: 180 });
  s.Walk("YardLitter3", 8.0, BP(710), { speed: 1.3, yawDeg: 180 });
  s.Walk("Doctor", 9.6, BP(709, 1.0), { speed: 1.4, yawDeg: 180 });
  s.Eye(10.0, 1.2, { stance: "stand", look: BP(665), pitch: -2, toLook: YARD_GATE, toPitch: -1 });
  s.Eye(11.2, 3.4, { stance: "stand", look: YARD_GATE, pitch: -1 });
  s.Caption(10.6, 5.0, "（接收院里的担架也一副一副抬出来，插进队里上桥；军医跟着最后一副出了院门，没回头。院里只剩盖着脸的，冬瓜在里头）");
  s.Eye(14.6, 1.4, { stance: "stand", look: YARD_GATE, pitch: -1, toLook: BRIDGE_W, toPitch: 0 });
  // 鬼子从石板桥和庄子西南角那边压过来：河滩上枪口火一闪一闪，散开往前跃进
  s.Caption(16.0, 4.0, "（鬼子从石板桥和庄子西南角那边压过来：河滩上的枪口火一闪一闪，先是零星几枪，后来连成一片；鬼子散开往前跃进）");
  const IjaShot = (t, i, volume = 0.45) => { const id = ijaIds[i]; if (down.has(id)) return; s.Ev(t, "muzzle", { actor: id }); const p = s.pos.get(id); s.Sfx(t, "rifleShot", { x: R(p.x), z: R(p.z), volume }); };
  for (let k = 0; k < 44; k++) IjaShot(10.0 + k * 1.15 + ((k * 3) % 4) * 0.12, (k * 7) % 10);
  for (const t of [18.0, 33.0, 52.0]) s.Sfx(t, "rifleVolley", { x: 16, z: 586, volume: 0.6 });
  // 桥面上的两个先顺桥下到西头的桥台，再往西南跃进（别跳进河汊子）
  ijaIds.forEach((id, i) => {
    const p = s.pos.get(id); const st = K(id).stance;
    if (p.z < 570 && p.x > 27) s.Go(id, 12.0 + i * 0.7, 16.0 + i * 0.7, 23.5, 572 + (i % 2) * 1.2, { move: "run", path: [BRIDGE_W], faceTo: FERRY_SQ, aim: true });
    else s.Go(id, 12.0 + i * 0.7, 16.0 + i * 0.7, p.x - 3, p.z + 6, { move: "run", faceTo: FERRY_SQ, ...(st ? { stance: st } : {}), aim: true });
  });
  ijaIds.forEach((id, i) => { const p = s.pos.get(id); s.Go(id, 48.0 + i * 0.8, 53.0 + i * 0.8, p.x - 3, p.z + 6, { move: "run", faceTo: FERRY_SQ, aim: true }); });
  // 玩家打冲在前头、朝撤下来的人开枪的鬼子
  s.Caption(20.2, 3.0, "（打那些冲在前头、朝撤下来的人开枪的鬼子）");
  for (const t of [21.0, 22.5, 24.0]) Shot(s, t, "player", { volume: 0.9 });
  s.Key("Ija2", 22.8, { state: "down" }); down.add("Ija2");
  s.Key("Ija4", 24.3, { state: "down" }); down.add("Ija4");
  for (const [id, t] of [["Luo", 14.0], ["HeYoutian", 15.2], ["LiuWencai", 16.1], ["FerryGuard1", 18.4], ["Squad1", 20.2], ["Luo", 23.5], ["HeYoutian", 27.0], ["FerrySoldier", 31.0], ["LiuWencai", 44.0], ["Luo", 46.0]]) Shot(s, t, id, { volume: 0.7 });
  s.Caption(23.6, 3.4, "（撤下来的人一个个从散兵坑边跑过去，越来越稀，跟 03 那个坑一样）");
  // 越来越糟 ①：石板桥头架起一挺机枪往渡口扫，桥板上有人中枪掉进河里
  s.Spawn("BridgeHit", { side: "nra", x: BR.x + 0.4, z: 656, yawDeg: 180, role: "walkingWounded" }, { visible: true });
  s.Go("BridgeHit", 12.0, 26.4, BR.x + 0.4, 672, { move: "walk", yawDeg: 180 });
  MgBurst(s, 25.0, "IjaMg", MG18, { puffs: [Pt(-7.2, 641), Pt(-8.6, 643.5), Pt(-6.8, 646.2)] });
  s.Key("BridgeHit", 26.4, { state: "down" });
  s.Key("BridgeHit", 28.0, { visible: false });
  s.Caption(25.5, 4.0, "（石板桥头架起一挺机枪往渡口扫，桥板上有人中枪掉进河里）");
  s.Eye(25.4, 1.2, { stance: "stand", look: BRIDGE_W, pitch: 0, toLook: BP(668), toPitch: -2 });
  s.Eye(26.6, 2.4, { stance: "stand", look: BP(668), pitch: -2 });
  s.Eye(29.0, 1.4, { stance: "stand", look: BP(668), pitch: -2, toLook: BRIDGE_W, toPitch: 0 });
  MgBurst(s, 30.6, "IjaMg", MG18, { volume: 0.7, puffs: [Pt(-4, 626), Pt(-5.5, 628)] });
  // ②：掷弹筒「嘭」一声，过几秒落在散兵坑前头（越落越近）
  Mortar(s, 30.0, Pt(26.0, 604.0), { shake: 0.25 });
  Mortar(s, 38.0, Pt(22.0, 609.0), { shake: 0.35 });
  Mortar(s, 46.0, Pt(19.0, 612.4), { shake: 0.5 });
  s.Caption(35.2, 3.0, "（掷弹筒「嘭」一声，过几秒落在散兵坑前头）");
  // ③：军官冲工兵喊「准备点火！」
  s.Caption(36.0, 2.4, "（桥头军官看着越来越近的枪口火，冲工兵喊）");
  s.Eye(36.0, 1.4, { stance: "stand", look: BRIDGE_W, pitch: 0, toLook: officer, toPitch: -2 });
  s.Key("BridgeOfficer", 37.0, { faceTo: "Sapper1", clip: POINT });
  const ready = s.Say("HoldTheBridge.01", "BridgeOfficer", 37.4);
  for (const id of ["Sapper1", "Sapper2"]) s.Key(id, ready + 0.8, { clip: null });
  s.Key("BridgeOfficer", s.End("HoldTheBridge.01") + 0.6, { clip: null });
  s.Eye(37.4, 2.2, { stance: "stand", look: officer, pitch: -2 });
  s.Eye(39.6, 1.4, { stance: "stand", look: officer, pitch: -2, toLook: BRIDGE_W, toPitch: 0 });
  // 最后一拨人：被机枪压在河滩北边的土坎后头
  s.Caption(41.0, 6.0, "（河滩北边出现了最后一拨人：三四个兵拖着一个伤的，是 02 坡顶上冲顺子他们喊「快过来！」的那个班剩下的人。他们被石板桥头的机枪压在一道土坎后头，过不来）");
  s.Eye(41.0, 1.4, { stance: "stand", look: BRIDGE_W, pitch: 0, toLook: LAST_COVER, toPitch: 0 });
  s.Eye(42.4, 4.6, { stance: "stand", look: LAST_COVER, pitch: 0 });
  MgBurst(s, 42.0, "IjaMg", MG18, { puffs: [Pt(-1.0, 582.0), Pt(-1.4, 585.0), Pt(-0.4, 588.0)] });
  s.Eye(47.0, 1.0, { stance: "stand", look: LAST_COVER, pitch: 0, toLook: officer, toPitch: -2 });
  // 炸！不等了！／还有人！／鬼子都上来了！／再等一哈！……顺儿！那挺机枪！
  s.Say("HoldTheBridge.02", "BridgeOfficer", 48.0);
  s.Key("BridgeOfficer", 47.7, { faceTo: "Luo", clip: TALK_SLUNG });
  s.Eye(48.0, s.End("HoldTheBridge.02") - 48.0 + 0.2, { stance: "stand", look: officer, pitch: -2 });
  const still = s.Say("HoldTheBridge.03", "Luo");
  s.Key("Luo", still - 0.3, { faceTo: LAST_COVER, aim: false, clip: POINT });
  s.Eye(still - 0.2, 0.7, { stance: "stand", look: officer, pitch: -2, toLook: luo, toPitch: -8 });
  s.Eye(still + 0.5, s.End("HoldTheBridge.03") - still - 0.5 + 0.2, { stance: "stand", look: luo, pitch: -8 });
  const up = s.Say("HoldTheBridge.04", "BridgeOfficer");
  s.Key("BridgeOfficer", up - 0.3, { faceTo: Pt(20, 590), clip: POINT });
  s.Eye(up - 0.2, 0.7, { stance: "stand", look: luo, pitch: -8, toLook: officer, toPitch: -2 });
  s.Eye(up + 0.5, s.End("HoldTheBridge.04") - up - 0.5 + 0.1, { stance: "stand", look: officer, pitch: -2 });
  s.Key("BridgeOfficer", s.End("HoldTheBridge.04") + 0.5, { clip: null, faceTo: "Sapper1" });
  const wait = s.Say("HoldTheBridge.05", "Luo");
  s.Key("Luo", wait - 0.2, { faceTo: "BridgeOfficer", clip: TALK_LOW });
  s.Eye(wait - 0.2, 0.7, { stance: "stand", look: officer, pitch: -2, toLook: luo, toPitch: -8 });
  s.Key("Luo", wait + 1.3, { faceTo: "player" });
  s.Key("Luo", wait + 2.2, { faceTo: MG18, clip: POINT });
  s.Eye(wait + 0.5, s.End("HoldTheBridge.05") - wait - 0.5, { stance: "stand", look: luo, pitch: -8 });
  const hit = s.End("HoldTheBridge.05");
  s.Key("Luo", hit + 1.2, { clip: null, aim: true });
  s.Eye(hit, 1.2, { stance: "stand", look: luo, pitch: -8, toLook: MG18, toPitch: 0 });
  s.Caption(hit + 0.3, 2.6, "（打掉那挺机枪）");
  MgBurst(s, hit + 0.2, "IjaMg", MG18, { count: 6, puffs: [Pt(18.4, 613.6), Pt(17.2, 615.2)] });
  s.Eye(hit + 1.2, 8.0, { stance: "stand", look: MG18, pitch: 0 });
  for (const t of [hit + 1.0, hit + 2.2, hit + 3.4]) Shot(s, t, "player", { volume: 0.9 });
  s.Key("IjaMg", hit + 2.4, { state: "down" });
  s.Key("IjaMgLoader", hit + 3.0, { x: MG18.x + 0.4, z: MG18.z + 0.4, move: "crawl", stance: "prone" });
  s.Key("IjaMgLoader", hit + 3.6, { state: "down" });
  // 机枪一哑，幺娃从坑里站起来冲他们挥手：快过来！快过来！
  const wave = hit + 4.4;
  s.Key("Yaowa", wave - 0.2, { stance: "stand", aim: false, faceTo: LAST_COVER });
  s.Key("Yaowa", wave, { clip: BECKON });
  s.Caption(wave - 0.2, 2.4, "（机枪哑了。幺娃从坑里站起来冲他们挥手）");
  s.Eye(wave - 0.4, 1.0, { stance: "stand", look: MG18, pitch: 0, toLook: yaowa, toPitch: -6 });
  s.Say("LastOnes.01", "Yaowa", wave + 0.2);
  s.Key("Yaowa", s.End("LastOnes.01") + 1.0, { clip: null, aim: true, faceTo: LAST_COVER });
  s.Eye(wave + 0.6, s.End("LastOnes.01") - wave - 0.6 + 0.4, { stance: "stand", look: yaowa, pitch: -6 });
  // 那几个人爬起来往渡口跑，从散兵坑西北头擦过去；领头的跑过散兵坑边时喊：后头没得人了！
  const run = s.End("LastOnes.01") + 0.4;
  s.Eye(run, 1.2, { stance: "stand", look: yaowa, pitch: -6, toLook: LAST_COVER, toPitch: 0 });
  s.Caption(run + 0.2, 3.0, "（那几个人爬起来往这边跑）");
  for (const id of ["LastGroup1", "LastGroup2", "LastGroup3"]) s.Key(id, run, { stance: "stand", aim: false });
  const via = [Pt(2.0, 598), Pt(5.0, 606)], pass = Pt(5.0, 606);
  const lead = R(run + 0.3 + (Dist(LAST_COVER, via[0]) + Dist(via[0], via[1]) + Dist(via[1], Pt(-4, 626))) / 3.5);
  s.Go("LastGroup1", run + 0.3, lead, -4, 626, { move: "run", path: via, yawDeg: 180 });
  s.Go("LastGroup2", run + 0.6, lead + 0.4, -5.2, 625, { move: "run", path: [Pt(1.2, 598.6), Pt(4.2, 606.4)], yawDeg: 180 });
  s.Go("LastGroup3", run + 0.9, lead + 1.6, -3.0, 627.2, { move: "run", path: [Pt(2.6, 597.6), Pt(5.8, 605.6)], yawDeg: 180 });
  s.Go("LastWounded", run + 0.9, lead + 1.6, -3.6, 626.6, { move: "run", path: [Pt(2.0, 597.0), Pt(5.2, 605.0)], yawDeg: 180, lie: "along" });
  s.Caption(run + 3.4, 3.0, "（三个兵拖着那个伤的，被子一样拖在河滩上）");
  const passT = R(run + 0.3 + (Dist(LAST_COVER, via[0]) + Dist(via[0], pass)) / 3.5);
  s.Eye(run + 1.2, passT - run - 2.2, { stance: "stand", look: LAST_COVER, pitch: 0, toLook: pass, toPitch: -2 });
  s.Cam(passT - 1.0, lead - passT + 2.0, { from: { x: P.x, z: P.z, h: 1.62 }, look: { actor: "LastGroup1", offset: [0, 1.3, 0] }, ease: "linear" });
  s.Say("LastOnes.02", "LastGroup1", passT);
  s.Caption(lead + 0.2, 2.0, "（后头没得人了）");
  void ready;
  return s.Done({ durationS: lead + 2.4 });
}

function S1803(ctx) {
  const s = new Seq(ctx, "18-3", "过桥：点！");
  const K = id => KXZ(ctx, "18-3", id), K2 = id => KXZ(ctx, "18-2", id), K4 = id => KXZ(ctx, "18-4", id);
  const P2 = KP(ctx, "18-2");
  const officerS = K("BridgeOfficer"), sapperS = K("Sapper1");
  const squad = ["Yaowa", "HeYoutian", "LiuWencai", "Squad1", "Squad2", "FerryGuard1", "FerryGuard2", "FerrySoldier"];
  // 开场大家还在坑里（从 18-2 的坑位起）
  for (const id of ["Luo", ...squad]) s.Place(id, 0, K2(id).x, K2(id).z, { faceTo: BRIDGE_W, aim: true });
  s.Key("Luo", 0.2, { faceTo: "player", aim: false, clip: WAVE_ON });
  s.Key("Luo", 2.4, { clip: null, aim: true });
  s.Key("Sapper1", 0, { clip: GRIP_LITTER });
  const eyeTrench = Pt(P2.x, P2.z);
  s.Eye(0, 2.4, { stance: "stand", x: eyeTrench.x, z: eyeTrench.z, look: K2("Luo"), pitch: -6 });
  s.Say("CrossNow.01", "Luo", 0.6);
  s.Caption(2.0, 3.4, "（全班从坑里爬出来往桥上跑；班长走在最后，倒退着边打边撤）");
  // 全班跑过桥，扑到南岸河堤后头（18-4 的位置）
  squad.forEach((id, i) => s.Walk(id, 1.6 + i * 0.35, K4(id), { move: "run", speed: 3.6, yawDeg: 0 }));
  // 班长：一截一截倒退着撤（跑一截、停下朝北打一枪）
  const hops = [Pt(8, 619), Pt(-4, 628), BP(648, -0.4), BP(666, -0.4), BP(684, -0.4), BP(706, -0.3)];
  let t = 3.0;
  for (const h of hops) {
    const cur = s.pos.get("Luo");
    const t1 = R(t + Dist(cur, h) / 3.5);
    s.Go("Luo", t, t1, h.x, h.z, { move: "run", yawDeg: 0, aim: true });
    Shot(s, t1 + 0.4, "Luo", { volume: 0.8 });
    t = R(t1 + 1.0);
  }
  const luoSouth = t;
  s.Walk("Luo", luoSouth + 2.0, K4("Luo"), { move: "run", speed: 3.4, yawDeg: 0, aim: true });
  // 眼睛：从坑里跑出来，过空场、引道、桥面、南引道；桥面上一沉一晃，回头看一眼班长
  const south = Pt(BR.x - 0.5, 709);
  const route = [eyeTrench, Pt(10, 620), Pt(-2, 628), Pt(BR.x, 634), BP(BR.northFootZ), BP(BR.southFootZ), south];
  const MPS = 3.2, H = 1.55;
  let tt = 2.4;
  const legs = [];
  for (let i = 1; i < route.length; i++) { const dur = R(Dist(route[i - 1], route[i]) / MPS); legs.push({ i, t0: tt, dur }); tt = R(tt + dur); }
  const Lk = p => ({ ...p, h: 1.0 });
  for (const { i, t0, dur } of legs) {
    const a = route[i - 1], b = route[i], next = route[i + 1] || Pt(b.x, b.z + 6);
    if (b.z === BR.southFootZ && a.z === BR.northFootZ) {
      const lerp = k => Pt(a.x + (b.x - a.x) * k, a.z + (b.z - a.z) * k);
      const k1 = 6.0 / dur, k2 = 9.0 / dur;
      s.WalkEye(t0, 6.0, a, lerp(k1), Lk(b), { lookTo: { actor: "Luo", offset: [0, 1.3, 0] }, h: H, shake: 0.12, ease: "inOut" });
      s.WalkEye(t0 + 6.0, 3.0, lerp(k1), lerp(k2), { actor: "Luo", offset: [0, 1.3, 0] }, { lookTo: Lk(b), h: H, shake: 0.12, ease: "inOut" });
      s.WalkEye(t0 + 9.0, dur - 9.0, lerp(k2), b, Lk(b), { lookTo: Lk(next), h: H, shake: 0.12 });
    } else s.WalkEye(t0, dur, a, b, Lk(b), { lookTo: Lk(next), h: H });
  }
  const atSouth = tt, deckLeg = legs[4];
  s.Caption(deckLeg.t0 + 1.0, 4.0, "（浮桥在脚底下一沉一晃，板缝里是黑水，子弹打进水里噗噗地响）");
  for (const [k, p] of [[2.0, Pt(BR.x - 2.4, 662)], [3.6, Pt(BR.x + 2.6, 668)], [6.2, Pt(BR.x - 2.6, 676)], [9.0, Pt(BR.x + 2.4, 684)], [12.5, Pt(BR.x - 2.2, 693)]]) s.Ev(deckLeg.t0 + k, "explosion", { x: p.x, z: p.z, kind: "grenade", radius: 0.6, h: 0 });
  // 鬼子压到渡口空场东沿，朝桥上打；桥头机枪远远地扫
  const ijaE = Array.from({ length: 8 }, (_, i) => `Ija${i + 1}`);
  for (let k = 0; k < 30; k++) { const id = ijaE[(k * 5) % 8]; const t0 = 3.0 + k * 1.3 + ((k * 3) % 3) * 0.17; s.Ev(t0, "muzzle", { actor: id }); const p = s.pos.get(id); s.Sfx(t0, "rifleShot", { x: R(p.x), z: R(p.z), volume: 0.5 }); }
  for (const t0 of [8.0, 20.0, 32.0]) s.Sfx(t0, "mgBurstFar", { x: MG18.x, z: MG18.z, volume: 0.45 });
  // 南岸桥头：工兵蹲着捏着引线等；班长最后一个踏上南岸；军官：点！
  s.Eye(atSouth, luoSouth - atSouth + 0.6, { stance: "stand", x: south.x, z: south.z, look: BP(690), pitch: -1 });
  s.Caption(atSouth + 0.4, 3.0, "（南岸桥头上，工兵蹲着，手里捏着引线等）");
  s.Caption(luoSouth + 0.2, 2.0, "（班长最后一个踏上南岸）");
  s.Eye(luoSouth + 0.6, 1.0, { stance: "stand", x: south.x, z: south.z, look: BP(690), pitch: -1, toLook: officerS, toPitch: -4 });
  s.Say("CrossNow.02", "BridgeOfficer", luoSouth + 1.4);
  s.Key("BridgeOfficer", luoSouth + 1.0, { faceTo: "Sapper1", clip: POINT });
  s.Eye(luoSouth + 1.6, 1.6, { stance: "stand", x: south.x, z: south.z, look: officerS, pitch: -4, toLook: sapperS, toPitch: -14 });
  const fuse = s.End("CrossNow.02") + 0.2;
  s.Caption(fuse, 2.6, "（引线嗤嗤地烧过桥板）");
  s.Caption(fuse + 2.6, 2.0, "（大家扑到南岸河堤后头）");
  const cover = Pt(KP(ctx, "18-4").x, KP(ctx, "18-4").z);
  s.WalkEye(fuse + 0.6, 2.6, south, cover, Lk(BP(652)), { h: H, ease: "inOut" });
  s.Go("Sapper1", fuse + 0.8, fuse + 3.2, K4("Sapper1").x, K4("Sapper1").z, { move: "run", depart: { clip: null, stance: "stand" }, stance: "stand", yawDeg: 0 });
  s.Go("Sapper2", fuse + 0.8, fuse + 3.0, K4("Sapper2").x, K4("Sapper2").z, { move: "run", yawDeg: 0 });
  s.Go("BridgeOfficer", fuse + 1.0, fuse + 3.4, K4("BridgeOfficer").x, K4("BridgeOfficer").z, { move: "run", depart: { clip: null }, yawDeg: 0 });
  // 「轰」：北头那几条船炸开；浮桥从中间断开，断的半截着了火往下游打转
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
  const K = id => KXZ(ctx, "18-4", id);
  const luo = K("Luo");
  const leveeIja = KG(ctx, "18-4", "levee").filter(id => id.startsWith("LeveeIja"));
  BR.debris.forEach((p, i) => s.Ev(0 + i * 0.2, "smoke", { x: p.x, z: p.z, kind: "SmokeBlack", dur: 22 }));
  s.Eye(0, 8.0, { stance: "stand", yaw: 0, pitch: 2 });
  s.Caption(0.4, 5.0, "（着火的船把北岸照亮了：鬼子一排排涌到对岸河堤上，后头石板桥上还有战车的影子。他们朝这边开枪，可是过不来）");
  for (let k = 0; k < 14; k++) { const id = leveeIja[(k * 5) % leveeIja.length]; const t = 0.8 + k * 0.95 + ((k * 3) % 3) * 0.11; s.Ev(t, "muzzle", { actor: id }); const p = s.pos.get(id); s.Sfx(t, "rifleShot", { x: R(p.x), z: R(p.z), volume: 0.4 }); }
  for (const [t, p] of [[3.4, Pt(-2.2, 715.4)], [7.1, Pt(-6.6, 715.1)], [11.8, Pt(1.0, 715.6)]]) Puff(s, t, p);
  for (const [id, t] of [["Luo", 2.0], ["HeYoutian", 4.2], ["LiuWencai", 5.6], ["Luo", 9.4]]) Shot(s, t, id, { volume: 0.7 });
  s.Sfx(6.0, "tankTracks", { x: 22, z: 570, volume: 0.3 });
  // 北岸院子里，马灯还亮着
  s.Eye(8.0, 1.6, { stance: "stand", yaw: 0, pitch: 2, toLook: GATE_LAMP, toPitch: 3 });
  s.Caption(9.0, 3.6, "（北岸院子里，马灯还亮着）");
  s.Eye(9.6, 3.6, { stance: "stand", look: GATE_LAMP, pitch: 3 });
  // 班长：走！看你妈啥子，走！
  s.Key("Luo", 12.6, { faceTo: "player", aim: false, clip: WAVE_ON });
  s.Eye(13.2, 1.0, { stance: "stand", look: GATE_LAMP, pitch: 3, toLook: luo, toPitch: -4 });
  s.Say("KeepMoving.01", "Luo", 13.8);
  s.Eye(14.2, s.End("KeepMoving.01") - 14.2 + 0.4, { stance: "stand", look: luo, pitch: -4 });
  const run = s.End("KeepMoving.01") + 0.4;
  s.Key("Luo", run, { clip: null });
  s.Caption(run, 3.6, "（往南跑进黑里，身后的枪声慢慢远了）");
  const P = KP(ctx, "18-4");
  ["Luo", "Yaowa", "HeYoutian", "LiuWencai", "Squad1", "Squad2", "FerryGuard1", "FerryGuard2", "FerrySoldier", "Sapper1", "Sapper2", "BridgeOfficer"].forEach((id, i) => {
    const p = s.pos.get(id);
    s.Go(id, run + 0.2 + i * 0.25, run + 4.0 + i * 0.25, BR.x + ((i % 5) - 2) * 0.9, 730 + (i % 3) * 1.4, { move: "run", yawDeg: 180, aim: false, path: [Pt(p.x + (BR.x - p.x) * 0.4, 722)] });
  });
  s.WalkEye(run + 0.6, 4.4, Pt(P.x, P.z), Pt(BR.x - 1.4, 727), { x: BR.x, z: 760, h: 1.0 }, { ease: "inOut" });
  s.Sfx(run + 2.4, "rifleShot", { x: -20, z: 634, volume: 0.2 });
  s.Sfx(run + 3.8, "rifleShot", { x: 10, z: 634, volume: 0.15 });
  return s.Done({ durationS: run + 5.4 });
}

function S1805(ctx) {
  const s = new Seq(ctx, "18-5", "夜里，北门");
  const P = KP(ctx, "18-5");
  const K = id => KXZ(ctx, "18-5", id);
  const geng = K("Geng"), guide = K("Guide"), water = K("WaterMan");
  const column = ["Luo", "Geng", "Nier", "Refugee1", "Refugee2", "Refugee3", "HeYoutian", "LiuWencai", "Squad1", "Squad2", "LitterCross", "FerryGuard1", "FerryGuard2"];
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
  s.Caption(T1 + 4.6, 3.6, "（老耿牵着妮儿走在百姓堆里）");
  // 幺娃问，老耿答；没人接
  const gengNow = Pt(geng.x, geng.z + D1);
  s.Eye(T2, 1.2, { stance: "stand", look: NORTH_GATE, pitch: 2, toLook: gengNow, toPitch: -4 });
  s.Key("Yaowa", T2 + 0.8, { clip: TALK_SLUNG });
  s.Say("NorthGate.01", "Yaowa", T2 + 1.2);
  const answer = s.Say("NorthGate.02", "Geng");
  s.Key("Geng", answer - 0.3, { faceTo: "Yaowa" });
  s.Eye(T2 + 1.2, s.End("NorthGate.02") - T2 - 1.2 + 0.6, { stance: "stand", look: gengNow, pitch: -4 });
  s.Caption(s.End("NorthGate.02") + 0.3, 2.0, "（没人接这句话）");
  // 接着走到门口：城墙、火把、运沙土的小车、舀水的（推小车 / 舀水没有片段，站位 + 说明字）
  const T3 = s.End("NorthGate.02") + 1.0, D2 = 8.5, T4 = R(T3 + D2 / 1.4);
  s.Key("Yaowa", T3 - 0.2, { clip: null });
  for (const id of [...column, "Yaowa"]) {
    const cur = s.pos.get(id), z = cur.z + D2;
    if (z > SO.wall.z - SO.wall.t / 2 - 1.5) s.Walk(id, T3, Pt(Math.max(SO.gate.x - 1.2, Math.min(SO.gate.x + 1.2, cur.x)), z), { tArrive: T4, yawDeg: 180 });
    else s.Shift(id, T3, T4, 0, D2, { yawDeg: 180 });
  }
  s.WalkEye(T3, T4 - T3, eye1, Pt(P.x, P.z + D2), gengNow, { lookTo: { ...NORTH_GATE, h: 3 }, ease: "inOut" });
  s.Caption(T3 + 0.4, 6.0, "（前头是黑压压的城墙，北门洞里点着火把。门口没人在欢迎谁：兵和老百姓推着小车往城墙上运沙土，在连夜修工事）");
  s.Go("SandCart1", T3, T3 + 3.0, SO.sandCarts[0].x, 855.6, { move: "walk", yawDeg: 180 });
  s.Go("SandCart2", T3 + 1.0, T3 + 4.0, SO.sandCarts[1].x, 855.6, { move: "walk", yawDeg: 180 });
  s.Go("SandCart1", T3 + 5.0, T3 + 8.0, SO.sandCarts[0].x, SO.sandCarts[0].z - 1.3, { move: "walk", yawDeg: 0 });
  s.Key("WaterMan", T3 + 2.0, { faceTo: "player" });
  s.Caption(T4 - 0.4, 3.0, "（门洞边有人提着一桶水，给进城的人一人舀一瓢）");
  s.Eye(T4, 1.4, { stance: "stand", x: P.x, z: P.z + D2, look: NORTH_GATE, pitch: 3, toLook: water, toPitch: -6 });
  s.Eye(T4 + 1.4, 1.6, { stance: "stand", x: P.x, z: P.z + D2, look: water, pitch: -6, toLook: guide, toPitch: -2 });
  s.Key("Guide", T4 + 1.4, { faceTo: "player", clip: BECKON });
  s.Say("NorthGate.03", "Guide", T4 + 3.0);
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
  return s.Done({ durationS: T6 + 8.0, then: "stay" });
}

export const SEQUENCE_BUILDERS = Object.freeze([
  S1101, S1102, S1201, S1202, S1203, S1301, S1302, S1303, S1401, S1402, S1403,
  S1501, S1502, S1503, S1601, S1701, S1702, S1703, S1801, S1802, S1803, S1804, S1805,
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
    title: "第一关 11–18 预演（占位动作 + 占位配音，2026-10-23 第二版）",
    source: { generator: "node Taierzhuang1938/Script_EditorBlockoutFirstLevel1218Previz.mjs --force", note: "剧本：白盒第二版契约（2026-10-23，还没进 Notion）；手改前先想好：重跑生成器会覆盖" },
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
