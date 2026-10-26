// ===========================================================================
// Script_EditorBlockoutFirstLevel1218Previz.mjs —— 第一关 11–18 白盒（FirstLevel1218，2026-10-26 第三版：北沙河村与铁路桥）的预演数据生成器
//
//   node Taierzhuang1938/Script_EditorBlockoutFirstLevel1218Previz.mjs            → 只校验、打印摘要，不写
//   node Taierzhuang1938/Script_EditorBlockoutFirstLevel1218Previz.mjs --force    → 写 Blockout/FirstLevel1218.previz.json
//   node Taierzhuang1938/Script_EditorBlockoutFirstLevel1218Previz.mjs --report   → 另打印每段一行摘要与用到的片段
//
// 格式：docs/Data_EditorBlockout.md §14（tengxian-blockout-previz/1）。剧本口径：集成负责人 2026-10-26 的白盒第三版契约「一、故事」
// （用户 10-26 认的北沙河村这一版）；空间口径：Data_EditorBlockoutFirstLevel1218Space.mjs（第三版）；
// 布设：Blockout/FirstLevel1218.json（只读，单位 id 与位置以它为准，33 帧一帧一段）。
// 台词：Blockout/FirstLevel1218.voice.json 的句子 id；时长每次从清单读（配音重抽后重跑 --force 就行），同一段里按录音的
// 原始间隔 gapBeforeS 往后排（只会拉长、不会压短）。写法照第二版（切镜为主、飞机 aircraft、慢动作 slowmo、单被 dragSolo）。
//
// 第三版（2026-10-26）要点：
//   · 镜头以定镜为主（播放时缺省切镜，§14.2）：每条镜头只给一个机位 / 一个看点；走着的眼睛按路网拆成几段定镜。
//   · 11–12：炮在庄子里落；车顺土路 → 官道（CartOn 沿 CART_LINE 排车、黑子、牵驴的人）；炮停后「轰」老耿家冒黑烟，眼睛像按了「看」一样转过去；
//     村口沟前哨兵喝问、连长交代；黑子在板桥头不走、妮儿溜下车牵它过板桥；钢盔冒头、七二七团机枪一响缩回去；
//     穿村：一家人钻洞（FamilyHidden）、老汉门口；教堂门口；救护所：医官「排到」、隔壁塌墙那边女娃探头。
//   · 13：两辆九四式顺官道开到沟沿外停下，车上机枪（muzzle 点在车上）扫我们这边的沟沿；田里有人往沟口跑，有的倒、有的爬过板桥；
//     13-3 末对面一颗信号弹（flare SignalRed），东边两架飞机进场，「飞机！趴倒！」。
//   · 14：14-1 飞机顺战壕扫射 + 沟口扔小炸弹、再掉头顺主街扫；14-2「顺儿！去看冬瓜！」顺子顺着路网跑到救护所门前，
//     飞机顺西头的街扫过来，黑子挨一梭，车翻（CartOverturned）——黑子 14 倒地；14-3 院门口黑子蹬腿、刘文财朝天打；
//     14-4 揪被角（妮儿骨骼身体 carryRole front + PvBlanketDragR）；14-5 松手 slowmo（窗口里没台词），被子键 dragSolo: true，弹着点扫过冬瓜；
//     14-6 老耿接另一角（dragSolo 回 false）拖进洞，刘文财捞走妮儿，飞机往东飞走。
//   · 15–17：洞里按毛巾（老耿骨骼身体 CareMedicPress）、抬到厢房门口、画驴（妮儿骨骼身体 PvKneelDig）、过门槛、没了（老耿 PvKneelPullBlanket 盖脸）、
//     门槛上数铜板、班长进院「起来」。
//   · 18：命令、隔壁院的洞口盖席子（GirlHoleCovered）、出村到铁路桥——担架、兵、老耿妮儿踩着枕木走桥面（2026-10-26 standOn 走道：演员站在枕木顶上）、
//     老乡顺滑坡道下河床蹚水；南头等：机枪压住土坎后的班长他们、玩家压机枪、「快过来！」、班长最后一个踏上南岸；「点！」北头两孔炸断（BridgeBlown）；
//     对岸鬼子过不来、村里亮灯；黑场 + 日期字幕 + 北门，then stay。
//   · 身体：百姓程序化身体（放不了片段）——只有关键帧里写了 body:"rig" 的那几帧放片段（14-4…14-6 妮儿、14-6 / 15-1 / 17-1 老耿、15-3 妮儿）。
//     士兵说话照 §14.4 的说话姿态；空手的百姓说话不受那条管。
//
// 确定性：不读时钟、不读 git、没有随机数；同样的输入两次输出逐字相同。
// ===========================================================================

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  L1218_PLACES as PL, L1218_AID as A, L1218_GIRL_YARD as GY, L1218_SIGNALS as SIG, L1218_RAIL_BRIDGE as RB, L1218_RAIL as RL,
  L1218_NORTH_GATE as NG, L1218_FAMILY_HOLE as FH, L1218_CHURCH as CH, L1218_VILLAGE_LIGHTS, L1218_SLOGANS, L1218_SLEEPER_PILES,
  L1218_RIVER as RV, L1218_RAIL_RAMPS, StreetPoint,
} from "./Data_EditorBlockoutFirstLevel1218Space.mjs";
import { StreetRoute, PressPose, NIER_TAIL_RIDE, CartWorld, DOCTOR_PRESS, CART_LINE, CartOn, CART_HITCH_M } from "./Script_EditorBlockoutFirstLevel1218Keyframes.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
export const PREVIZ_FILE = join(HERE, "Blockout", "FirstLevel1218.previz.json");
const CONFIG_FILE = join(HERE, "Blockout", "FirstLevel1218.json");
const VOICE_FILE = join(HERE, "Blockout", "FirstLevel1218.voice.json");

/** 18-8 黑场上的日期字幕（契约：1938年3月14日 夜｜滕县北门）。 */
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
/** 从 a 指向 b 的单位向量与右手边（面朝它时的右边）。 */
function Frame(a, b) { const l = Math.max(1e-6, Dist(a, b)); const f = { x: (b.x - a.x) / l, z: (b.z - a.z) / l }; return { f, r: { x: -f.z, z: f.x }, len: l }; }
const Along = (p, f, d) => Pt(p.x + f.x * d, p.z + f.z * d);
const Lerp = (a, b, k) => Pt(a.x + (b.x - a.x) * k, a.z + (b.z - a.z) * k);
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
const KXZ = (ctx, kfId, id) => { const u = KU(ctx, kfId, id); return Pt(u.x, u.z); };
const KG = (ctx, kfId, group) => ctx.config.keyframes.find(k => k.id === kfId).units.filter(u => u.group === group).map(u => u.id);

// ---------------------------------------------------------------------------
// 驴车沿 CART_LINE 走（车中心、黑子在前 CART_HITCH_M、牵驴的人再前 1.3 m）

const LINE_LEN = (() => { let d = 0; for (let i = 1; i < CART_LINE.length; i++) d += Dist(CART_LINE[i - 1], CART_LINE[i]); return d; })();
/** 离 p 最近的车中心弧长（0.1 m 一格）。 */
function CartD(p) {
  let best = 0, bd = Infinity;
  for (let d = 0; d <= LINE_LEN; d += 0.1) { const dd = Dist(CartOn(d).cart, p); if (dd < bd) { bd = dd; best = d; } }
  return R(best);
}
/** CART_LINE 上弧长 d0…d1 之间的折点（不含两头）。 */
function LinePath(d0, d1) {
  const out = []; let d = 0;
  for (let i = 1; i < CART_LINE.length; i++) { d += Dist(CART_LINE[i - 1], CART_LINE[i]); if (d > d0 + 0.3 && d < d1 - 0.3) out.push(Pt(CART_LINE[i].x, CART_LINE[i].z)); }
  return out;
}
/** 车从 d0 走到 d1（t0…t1）：车、黑子、（可选）牵驴的人都沿线走；车上挂着的人跟着车。 */
function CartMove(s, t0, t1, d0, d1, { lead = null } = {}) {
  const b = CartOn(d1), H = CART_HITCH_M;
  s.Go("GengCart", t0, t1, b.cart.x, b.cart.z, { move: "walk", path: LinePath(d0, d1), yawDeg: b.yaw });
  s.Go("Heizi", t0, t1, b.heizi.x, b.heizi.z, { move: "walk", path: LinePath(d0 + H, d1 + H), yawDeg: b.heiziYaw });
  if (lead) s.Go(lead, t0, t1, b.lead.x, b.lead.z, { move: "walk", path: LinePath(d0 + H + 1.3, d1 + H + 1.3), yawDeg: b.lead.heading });
  return b;
}

// ---------------------------------------------------------------------------
// 序列构造器（同第二版）

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
  /** 直线挪一段（dx, dz）。 */
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
  /** 第一人称定镜：顺子的眼睛。look 给了就换算朝向。 */
  Eye(t, dur, { x, z, stance = "stand", yaw, pitch = 0, look, shake, fov }) {
    const at = { x: x ?? this.player.x, z: z ?? this.player.z };
    const eye = { x: R(at.x), z: R(at.z), stance };
    eye.yawDeg = R(look ? Yaw(at, look) : yaw);
    eye.pitchDeg = R(pitch);
    const c = { t: R(t), dur: R(dur), eye };
    if (fov) c.fov = fov;
    if (shake) c.shake = shake;
    this.out.camera.push(c);
    return this;
  }
  /** 机位：from（点、演员锚或飞机锚 { aircraft }）看 look；to / lookTo 只在真要运镜的那几条写。 */
  Cam(t, dur, { from, to, look, lookTo, fov, ease, shake, keepMove }) {
    const P = p => (p.aircraft ? { aircraft: p.aircraft, offset: (p.offset || [0, 0, 0]).map(R) }
      : p.actor ? { actor: p.actor, offset: (p.offset || [0, 0, 0]).map(R) } : { x: R(p.x), z: R(p.z), ...(p.h !== undefined ? { h: R(p.h) } : {}) });
    const c = { t: R(t), dur: R(dur), from: P(from), look: P(look) };
    if (to) c.to = P(to);
    if (lookTo) c.lookTo = P(lookTo);
    if (fov) c.fov = fov;
    if (ease) c.ease = ease;
    if (shake) c.shake = shake;
    if (keepMove) c.keepMove = true;
    this.out.camera.push(c);
    return this;
  }
  /** 第一人称走一段（镜头从 a 平移到 b，看着 look）：用 Cam 顶替眼睛的位移；切镜模式下就是起幅 / 落幅两个定镜。 */
  WalkEye(t, dur, a, b, look, { h = 1.55, lookH = 1.0, fov, shake, ease = "linear" } = {}) {
    const L = p => (p.actor || p.aircraft ? p : { ...p, h: p.h ?? lookH });
    return this.Cam(t, dur, { from: { ...a, h }, to: { ...b, h }, look: L(look), ease, ...(fov ? { fov } : {}), ...(shake ? { shake } : {}) });
  }
  /** 飞机轨（§14.1 aircraft）：path 是按时间升序的航点 {t, x, z, y}（世界高）；sound.drone 缺省 true。 */
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

/**
 * 顺子沿路网走 a → b（t0…t1 匀速）：shot(ta, tb, look) 发一段走着的眼睛（在路网折点处拆开，不抄近道穿墙）。
 * at(t) = t 时刻眼睛在哪。
 */
function Walker(s, a, b, t0, t1, { via = null, h = 1.55, lookH = 1.0 } = {}) {
  const pts = [Pt(a.x, a.z), ...(via || StreetRoute(a, b))];
  if (Dist(pts[pts.length - 1], b) > 0.05) pts.push(Pt(b.x, b.z));
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Dist(pts[i - 1], pts[i]));
  const total = Math.max(1e-6, cum[cum.length - 1]);
  const DAt = t => total * Math.max(0, Math.min(1, (t - t0) / Math.max(1e-6, t1 - t0)));
  const PAt = d => { for (let i = 1; i < pts.length; i++) if (d <= cum[i] + 1e-9) return Lerp(pts[i - 1], pts[i], (d - cum[i - 1]) / Math.max(1e-6, cum[i] - cum[i - 1])); return pts[pts.length - 1]; };
  const TAt = d => t0 + (t1 - t0) * d / total;
  return {
    pts, total,
    at: t => PAt(DAt(t)),
    shot(ta, tb, look, opts = {}) {
      const da = DAt(ta), db = DAt(tb);
      const cuts = [ta];
      for (let i = 1; i < pts.length - 1; i++) if (cum[i] > da + 0.05 && cum[i] < db - 0.05) cuts.push(TAt(cum[i]));
      cuts.push(tb);
      for (let i = 1; i < cuts.length; i++) if (cuts[i] - cuts[i - 1] > 0.02) s.WalkEye(cuts[i - 1], cuts[i] - cuts[i - 1], PAt(DAt(cuts[i - 1])), PAt(DAt(cuts[i])), look, { h, lookH, ...opts });
    },
  };
}

// ---------------------------------------------------------------------------
// 常用点

const LANE_SHELL = Pt(PL.laneShell.x, PL.laneShell.z);
const VILLAGE_SHELLS = [Pt(100, 520), Pt(90, 506), Pt(108, 531), Pt(96, 514)];   // 庄子里一排排落炮（草顶烧着）
const GENG_SMOKE = Pt(PL.gengSmoke.x, PL.gengSmoke.z);
const FIELD_SHELL = Pt(PL.fieldShell.x, PL.fieldShell.z);
const HELMETS = Pt(PL.helmetsAt.x, PL.helmetsAt.z);
const PLANK_N = Pt(PL.plankNorth.x, PL.plankNorth.z), PLANK_S = Pt(PL.plankSouth.x, PL.plankSouth.z), PLANK_MID = Pt(PL.plankMid.x, PL.plankMid.z);
const DITCH_NORTH = Pt(PL.ditchNorth.x, PL.ditchNorth.z);
const VILLAGE_FAR = Pt(110, 650);
const FLARE = Pt(PL.flareAt.x, PL.flareAt.z);
const PLANES_FROM = Pt(PL.planesFrom.x, PL.planesFrom.z);
const AID_GATE_OUT = Pt(PL.aidGateOut.x, PL.aidGateOut.z), AID_GATE_IN = Pt(PL.aidGateIn.x, PL.aidGateIn.z);
const HOLE_A = A.holes[0];
const HOLE_A_MOUTH = Pt(HOLE_A.mouth.x, HOLE_A.mouth.z);
const HOLE_A_IN = Pt(HOLE_A.mouth.x + HOLE_A.dir.x * (HOLE_A.rampM + HOLE_A.chamber.d / 2), HOLE_A.mouth.z + HOLE_A.dir.z * (HOLE_A.rampM + HOLE_A.chamber.d / 2));
const GIRL_HOLE = Pt(GY.hole.mouth.x, GY.hole.mouth.z);
const XIANG_DOOR = Pt(PL.xiangDoor.x, PL.xiangDoor.z);
const XIANG_OUT = Pt(A.xiang.box.maxX + 1.3, A.xiang.door.z), XIANG_IN = Pt(A.xiang.box.maxX - 1.3, A.xiang.door.z);
const INSIDE = Pt(A.dongguaInside.x, A.dongguaInside.z);
const SEAT = Pt(A.thresholdSeat.x, A.thresholdSeat.z);
const YARD_MID = Pt(76, 684);
const LAMP = Pt(A.lamps[0].x, A.lamps[0].z);
const FAMILY_HOLE = Pt(FH.mouth.x, FH.mouth.z);
const CHURCH_GATE_OUT = (() => { const p = StreetPoint(CH.gate.s, CH.d0 - 1.3); return Pt(p.x, p.z); })();
const CHURCH_GATE_IN = (() => { const p = StreetPoint(CH.gate.s, CH.d0 + 1.3); return Pt(p.x, p.z); })();
const CHURCH_HALL = (() => { const p = StreetPoint((CH.hall.s0 + CH.hall.s1) / 2, CH.hall.d0); return Pt(p.x, p.z); })();
const SLOGAN = Pt(L1218_SLOGANS[0].x, L1218_SLOGANS[0].z);
const SLEEPERS = Pt(L1218_SLEEPER_PILES[0].x, L1218_SLEEPER_PILES[0].z);
const RAIL_N = Pt(RL.x, RB.northZ), RAIL_S = Pt(RL.x, RB.southZ);
const DECK = z => Pt(RL.x, z);
const SPAN_M = (RB.southZ - RB.northZ) / RB.spans;
const PIER = i => DECK(RB.northZ + SPAN_M * (i + 1));
const RAIL_RAMP_N = L1218_RAIL_RAMPS[0].to;
const MG18 = Pt(PL.ijaMg18.x, PL.ijaMg18.z);
const LAST_COVER = Pt(PL.lastGroupCover.x, PL.lastGroupCover.z);
const NORTH_GATE = Pt(PL.northGate.x, PL.northGate.z);
const SUN = Pt(PL.sunWest.x, PL.sunWest.z);
const VILLAGE_LIGHT = Pt(L1218_VILLAGE_LIGHTS[4].x, L1218_VILLAGE_LIGHTS[4].z);

// ---------------------------------------------------------------------------
// 小段落

/** 子弹打在土里（小土点）。 */
function Puff(s, t, p) { return s.Ev(t, "explosion", { x: p.x, z: p.z, kind: "grenade", radius: 0.8 }); }
/** 某人开一枪（枪口火 + 枪声）。 */
function Shot(s, t, actor, { count = 1, interval, sfx = "rifleShot", at, volume } = {}) {
  s.Ev(t, "muzzle", { actor, ...(count > 1 ? { count, interval: interval ?? 0.11 } : {}) });
  const p = at || (actor === "player" ? s.player : s.pos.get(actor));
  if (sfx) s.Sfx(t, sfx, { ...(p ? { x: R(p.x), z: R(p.z) } : {}), ...(volume !== undefined ? { volume } : {}) });
  return s;
}
/** 机枪打一梭（actor 是哪挺、at 它在哪、h 枪口离地高）；puffs：弹着点一串（匀速扫过去）。返回打完的时刻。 */
function MgBurst(s, t, actor, at, { count = 10, volume = 0.8, puffs = [], sweepS = null, h } = {}) {
  s.Ev(t, "muzzle", { actor, count, interval: 0.1, ...(h !== undefined ? { h } : {}) });
  s.Sfx(t, "mgBurstFar", { x: at.x, z: at.z, volume });
  const span = sweepS ?? Math.max(0.3, puffs.length * 0.12);
  puffs.forEach((p, i) => Puff(s, t + 0.3 + (puffs.length > 1 ? span * i / (puffs.length - 1) : 0), p));
  return R(t + count * 0.1);
}
/** 一条线上均匀取 n 个点。 */
function LinePts(a, b, n) { return Array.from({ length: n }, (_, i) => Pt(a.x + (b.x - a.x) * i / (n - 1), a.z + (b.z - a.z) * i / (n - 1))); }
/** 村里一发炮（炮弹落地 + 烟 + 震屏）。 */
function Shell(s, t, p, { radius = 3.5, sfx = "artilleryNear", volume = 0.8, shake = 0.4, smoke = "SmokeDust", smokeDur = 4 } = {}) {
  s.Sfx(t, sfx, { x: p.x, z: p.z, volume });
  s.Ev(t, "explosion", { x: p.x, z: p.z, kind: "shell", radius });
  if (smoke) s.Ev(t + 0.2, "smoke", { x: p.x, z: p.z, kind: smoke, dur: smokeDur });
  if (shake) s.Shake(t, 0.6, shake);
  return s;
}
/** 飞机扔的小炸弹（落地 + 烟 + 震屏）。 */
function Bomb(s, t, p, { radius = 4, shake = 0.6 } = {}) {
  s.Sfx(t, "shellBlast", { x: p.x, z: p.z, volume: 0.9 });
  s.Ev(t, "explosion", { x: p.x, z: p.z, kind: "shell", radius });
  s.Ev(t + 0.2, "smoke", { x: p.x, z: p.z, kind: "SmokeDust", dur: 5 });
  if (shake) s.Shake(t, 0.7, shake);
  return s;
}

// ---------------------------------------------------------------------------
// 占位动作（片段名照各库清单）

const VIL = Object.freeze({ duck: "VilDuckProne", panic: "VilPanicRun", carry: "VilNraCarryOnBack", ride: "VilRideOnBack" });
const TALK_SLUNG = "PvStandTalkSlung", TALK_LOW = "PvStandTalkLowRifle", TALK_CROUCH = "PvCrouchTalkRifle", COUNT_FINGERS = "PvCrouchCountFingers";
const POINT = "PvStandPointL", WAVE_ON = "PvStandWaveOnL", BECKON = "PvStandBeckonL", HALT = "PvStandHaltL";
const KNEEL_DIG = "PvKneelDig", KNEEL_BLANKET = "PvKneelPullBlanket", GRIP_LITTER = "PvCrouchGripLitter", LIE_GRAB = "PvLieGrabSleeve";
const MEDIC_PRESS = "CareMedicPress", LIE_TREATED = "CareLieTreated", LIE_WRITHE = "CareLieWrithe";
const DRAG_R = "PvBlanketDragR";
/** 扑倒（VilDuckProne：跪、趴、抱头）。 */
const DUCK = Object.freeze({ clip: VIL.duck, clipHold: true, stance: "prone" });
/** 拖被子的速度（m/s）与站位：拖的人在被子中心前 1.6 m、左右各 0.55 m（0105 的 PULL）。 */
const DRAG_MPS = 1.0;
const PULL = { half: 0.55, toCenter: 1.6 };
const PullL = (c, fr) => Pt(c.x + fr.f.x * PULL.toCenter - fr.r.x * PULL.half, c.z + fr.f.z * PULL.toCenter - fr.r.z * PULL.half);
const PullR = (c, fr) => Pt(c.x + fr.f.x * PULL.toCenter + fr.r.x * PULL.half, c.z + fr.f.z * PULL.toCenter + fr.r.z * PULL.half);
/** 冬瓜躺在被子上跟着走：和被子同一条路、同一个时间窗的 walk 位置键（lie along）。 */
function CarryOnBlanket(s, t0, t1, end, yaw, path) { s.Go("Donggua", t0, t1, end.x, end.z, { move: "walk", yawDeg: yaw, lie: "along", ...(path ? { path } : {}) }); }
/** 被子连人一起拖 / 抬到 end。 */
function DragBlanket(s, t0, t1, end, yaw, path) {
  s.Go("BlanketDonggua", t0, t1, end.x, end.z, { move: "walk", yawDeg: yaw, ...(path ? { path } : {}) });
  CarryOnBlanket(s, t0, t1, end, yaw, path);
}

// ---------------------------------------------------------------------------
// 飞机（§14.1 aircraft）：两架

const KI30 = Object.freeze({ a: "Ki30A", b: "Ki30B" });
function TwoPlanes(s, pathA, { dt = 1.4, dz = -22, dx = 0, dy = 8, strafe = null, diveA = null, diveB = null } = {}) {
  s.Aircraft(KI30.a, { path: pathA, ...(strafe ? { strafe } : {}), sound: { drone: true, ...(diveA !== null ? { diveT: R(diveA) } : {}) } });
  s.Aircraft(KI30.b, { path: pathA.map(w => ({ t: w.t + dt, x: w.x + dx, y: w.y + dy, z: w.z + dz })), sound: { drone: true, ...(diveB !== null ? { diveT: R(diveB) } : {}) } });
}
/** 扫射段里弹着经过 k（0…1）的时刻。 */
const StrafeAtK = (st, k) => R(st.t0 + k * (st.t1 - st.t0));
/** 点 p 在扫射线 from→to 上的参数 k（投影）。 */
const StrafeK = (st, p) => { const dx = st.to.x - st.from.x, dz = st.to.z - st.from.z; return ((p.x - st.from.x) * dx + (p.z - st.from.z) * dz) / (dx * dx + dz * dz); };

// ---------------------------------------------------------------------------
// 11 冒着炮出村南口

function S1101(ctx) {
  const s = new Seq(ctx, "11-1", "出胡同口：身后一发炮，车停在口外");
  const K = id => KXZ(ctx, "11-1", id);
  const cart = K("GengCart"), heizi = K("Heizi"), cartYaw = KU(ctx, "11-1", "GengCart").yawDeg;
  s.Eye(0, 1.4, { stance: "stand", look: LANE_SHELL, pitch: 2 });
  Shell(s, 0.9, LANE_SHELL, { radius: 3.5, volume: 1.0, shake: 0.7 });
  s.Caption(0.3, 3.0, "（顺子最后一个出胡同口，身后一发炮落在胡同里）");
  s.Eye(1.4, 3.4, { stance: "stand", look: VILLAGE_SHELLS[0], pitch: 6 });
  VILLAGE_SHELLS.forEach((p, i) => Shell(s, 1.8 + i * 1.0, p, { radius: 4, sfx: "artilleryFar", volume: 0.7, shake: 0.15, smoke: "SmokeBlack", smokeDur: 30 }));
  s.Caption(2.2, 3.0, "（庄子里一排排落炮，草顶烧着）");
  s.Eye(4.8, 3.0, { stance: "stand", look: heizi, pitch: -6 });
  s.Caption(5.0, 3.2, "（老耿的车停在村南口外，黑子一炸一跳，老耿拽着笼头——牲口受惊没有动作，说明字顶）");
  s.Key("Geng", 0, { faceTo: "Heizi" });
  s.Key("Bearer1", 0, { clip: GRIP_LITTER, faceTo: cart });
  s.Key("Bearer2", 0.4, { clip: GRIP_LITTER, faceTo: cart });
  s.Key("Donggua", 0, { clip: LIE_WRITHE });
  s.Eye(7.8, 3.6, { stance: "stand", look: cart, pitch: -10 });
  s.Caption(8.0, 3.6, "（担架员把冬瓜和另外两个肚子挨了枪的横搁上车板，冬瓜靠车尾）");
  // 妮儿爬上车尾沿坐着（挂回车尾）
  const tail = CartWorld(cart, cartYaw, { x: 0.7, z: NIER_TAIL_RIDE.z });
  s.Go("Nier", 8.6, 10.2, tail.x, tail.z, { move: "walk", faceTo: "GengCart" });
  s.Key("Nier", 10.4, { ride: { ...NIER_TAIL_RIDE } });
  s.Caption(10.4, 2.4, "（妮儿坐车尾沿）");
  // 往南看
  s.Eye(11.4, 5.0, { stance: "stand", look: VILLAGE_FAR, pitch: 1 });
  s.Caption(11.8, 4.6, "（往南看：一条土路穿过麦地接上官道，官道尽头是北沙河村的树和院墙，村口那一带有兵在动）");
  return s.Done({ durationS: 16.6 });
}

function S1102(ctx) {
  const s = new Seq(ctx, "11-2", "车动了：往北沙河撤");
  const P = KP(ctx, "11-2"), P2 = KP(ctx, "12-1");
  const K = id => KXZ(ctx, "11-2", id), K2 = id => KXZ(ctx, "12-1", id);
  const luo = K("Luo");
  s.Key("Donggua", 0, { clip: LIE_WRITHE });
  // 班长：往北沙河撤！七二七团在那！车拉伤员，跟斗走！（挥手）
  s.Eye(0, 0.6, { stance: "stand", look: K("GengCart"), pitch: -6 });
  s.Key("Luo", 0.2, { faceTo: "player", clip: WAVE_ON });
  s.Say("RetreatOrder.01", "Luo", 0.8);
  s.Eye(0.6, s.End("RetreatOrder.01") - 0.6 + 0.3, { stance: "stand", look: luo, pitch: -2 });
  const go = R(s.End("RetreatOrder.01") + 0.3);
  s.Key("Luo", go, { clip: null });
  // 车动了；全班跟车往南跑；担架员往回跑接下一副（出画）
  const d0 = CartD(K("GengCart")), d1 = CartD(K2("GengCart"));
  const T2 = R(go + (d1 - d0) / 1.3);
  CartMove(s, go, T2, d0, d1);
  s.Walk("Geng", go, K2("Geng"), { tArrive: T2 });
  s.Walk("LiuWencai", go + 0.3, K2("LiuWencai"), { tArrive: T2 });
  for (const [id, dt] of [["Luo", 0.2], ["Yaowa", 0.5], ["HeYoutian", 0.7], ["Squad1", 0.9], ["Squad2", 1.1]]) s.Walk(id, go + dt, K2(id), { move: "run", speed: 3.0, aim: false });
  for (const [id, dt] of [["Bearer1", 0], ["Bearer2", 0.5]]) { const t1 = s.Walk(id, go + dt, Pt(117, 540.4), { move: "run", speed: 2.6 }); s.Key(id, t1 + 0.1, { visible: false }); }
  s.Caption(go + 0.2, 3.0, "（全班跟车往南跑；担架员往回跑接下一副）");
  const w = Walker(s, P, P2, go + 0.4, T2);
  s.Eye(go, 0.4, { stance: "stand", look: luo, pitch: -2 });
  w.shot(go + 0.4, T2, { actor: "GengCart", offset: [0, 1.0, 0] });
  return s.Done({ durationS: T2 + 0.4 });
}

// ---------------------------------------------------------------------------
// 12 进北沙河村

function S1201(ctx) {
  const s = new Seq(ctx, "12-1", "路上：到了没得？快了");
  const P = KP(ctx, "12-1"), P2 = KP(ctx, "12-2");
  const K = id => KXZ(ctx, "12-1", id), K2 = id => KXZ(ctx, "12-2", id);
  s.Key("Donggua", 0, { clip: LIE_WRITHE });
  const d0 = CartD(K("GengCart")), d1 = CartD(K2("GengCart"));
  const T1 = 0.4, T2 = R(T1 + (d1 - d0) / 1.3);
  CartMove(s, T1, T2, d0, d1);
  s.Walk("Geng", T1, K2("Geng"), { tArrive: T2 });
  s.Walk("LiuWencai", T1, K2("LiuWencai"), { tArrive: T2 });
  for (const id of ["Luo", "Yaowa", "HeYoutian", "Squad1", "Squad2"]) s.Walk(id, T1 + 0.4, K2(id), { tArrive: T2, aim: false });
  const w = Walker(s, P, P2, T1, T2);
  s.Eye(0, T1, { stance: "stand", look: K("GengCart"), pitch: -4 });
  s.Caption(0.3, 3.0, "（老耿一手笼头一手鞭子；顺子在车尾扶车帮，刘文财在车另一边）");
  // 身后一发炮打偏落在路边麦地，土泼一车
  const mud = 3.0;
  w.shot(T1, mud - 0.2, { actor: "GengCart", offset: [0, 1.0, 0] });
  Shell(s, mud, FIELD_SHELL, { radius: 3.0, volume: 1.0, shake: 0.6, smoke: "SmokeDust", smokeDur: 5 });
  w.shot(mud - 0.2, mud + 1.8, FIELD_SHELL, { lookH: 1.2 });
  s.Caption(mud + 0.1, 3.0, "（身后一发炮打偏落在路边麦地，土泼一车）");
  // 冬瓜睁眼：……到了没得？顺子：快了！
  s.Say("AlmostThere.01", "Donggua", mud + 2.4);
  s.Say("AlmostThere.02", null);
  w.shot(mud + 1.8, s.End("AlmostThere.02") + 0.4, { actor: "Donggua", offset: [0, 0.6, 0] });
  s.Caption(s.End("AlmostThere.02") + 0.3, 2.6, "（任务字：跟车进北沙河村）");
  w.shot(s.End("AlmostThere.02") + 0.4, T2, { actor: "Heizi", offset: [0, 1.0, 0] });
  return s.Done({ durationS: T2 + 0.4 });
}

function S1202(ctx) {
  const s = new Seq(ctx, "12-2", "炮停：「看」——老耿家腾起黑烟");
  const P = KP(ctx, "12-2"), P2 = KP(ctx, "12-3");
  const K = id => KXZ(ctx, "12-2", id), K2 = id => KXZ(ctx, "12-3", id);
  const liu = K("LiuWencai");
  s.Key("Donggua", 0, { clip: LIE_WRITHE });
  // 车刚拐上官道：炮停了，静得出奇
  s.Eye(0, 2.6, { stance: "stand", look: K("Heizi"), pitch: -3 });
  s.Caption(0.3, 2.6, "（车刚拐上官道，身后炮停，静得出奇）");
  // 两三秒后庄子里「轰」一声，跟着「叮」：出「看」的按键；像按了「看」一样，视角转去看老耿家腾起黑烟
  const boom = 2.8;
  s.Sfx(boom, "grenadeBlast", { x: GENG_SMOKE.x, z: GENG_SMOKE.z, volume: 0.8 });
  s.Ev(boom, "explosion", { x: GENG_SMOKE.x, z: GENG_SMOKE.z, kind: "grenade", radius: 3, h: 1.0 });
  s.Ev(boom + 0.2, "smoke", { x: GENG_SMOKE.x, z: GENG_SMOKE.z + 1, kind: "SmokeBlack", dur: 26 });
  s.Shake(boom, 0.4, 0.15);
  s.Caption(boom + 0.2, 2.2, "（「轰」一声，跟着「叮」一声：屏幕出「看」的按键，不按三秒消失）");
  s.Eye(2.6, 4.6, { stance: "stand", look: GENG_SMOKE, pitch: 4 });
  s.Caption(boom + 1.6, 3.0, "（「看」：视角转过去——老耿家腾起黑烟）");
  s.Key("Geng", boom + 0.6, { faceTo: GENG_SMOKE });
  s.Key("LiuWencai", boom + 0.8, { faceTo: GENG_SMOKE });
  // 刘文财：狗日的进了老耿家了！顺子：莫看了！走！
  s.Key("LiuWencai", 7.0, { clip: POINT });
  s.Eye(7.2, 0.01, { stance: "stand", look: liu, pitch: -2 });
  const saw = s.Say("LookBack.01", "LiuWencai", 7.6);
  s.Say("LookBack.02", null);
  s.Eye(7.21, s.End("LookBack.02") - 7.21 + 0.3, { stance: "stand", look: liu, pitch: -2 });
  const back = R(s.End("LookBack.02") + 0.3);
  s.Key("LiuWencai", back, { clip: null });
  s.Key("Geng", back + 0.2, { faceTo: "Heizi" });
  s.Caption(back, 2.6, "（老耿回头看一眼烟，扬鞭）");
  // 车接着往村口走（到 12-3 的位置）
  const d0 = CartD(K("GengCart")), d1 = CartD(K2("GengCart"));
  const T1 = back + 0.6, T2 = R(T1 + (d1 - d0) / 1.3);
  CartMove(s, T1, T2, d0, d1);
  s.Walk("Geng", T1, K2("Geng"), { tArrive: T2 });
  s.Walk("LiuWencai", T1 + 0.2, K2("LiuWencai"), { tArrive: T2 });
  for (const id of ["Luo", "Yaowa", "HeYoutian", "Squad1", "Squad2"]) s.Walk(id, T1, K2(id), { tArrive: T2, aim: false });
  const w = Walker(s, P, P2, T1, T2);
  s.Eye(back, T1 - back, { stance: "stand", look: K("Heizi"), pitch: -3 });
  w.shot(T1, T2, { ...VILLAGE_FAR, h: 2.0 });
  void saw;
  return s.Done({ durationS: T2 + 0.4 });
}

function S1203(ctx) {
  const s = new Seq(ctx, "12-3", "沟口：站到！哪部分的？");
  const K = id => KXZ(ctx, "12-3", id);
  const sentry = K("Sentry"), captain = K("Captain"), luo = K("Luo");
  s.Key("Donggua", 0, { clip: LIE_WRITHE });
  // 官道走到头是一道比人深的沟；沟那边的杂木堆、门板搭的板桥；七二七团的兵还在往杂木堆上添树枝
  s.Eye(0, 4.0, { stance: "stand", look: PLANK_MID, pitch: -8 });
  s.Caption(0.3, 4.2, "（官道走到头是一道比人深的沟，把路齐齐截断；沟那边堆着枣树枝和杂木，只留几块门板搭的板桥，刚够一辆车）");
  for (const id of ["Branch1", "Branch2"]) s.Key(id, 0, { clip: KNEEL_DIG });
  s.Eye(4.0, 3.6, { stance: "stand", look: K("Branch1"), pitch: -2 });
  s.Caption(4.4, 3.4, "（沟沿上七二七团的兵还在往杂木堆上添树枝；沟两边是战壕和铁丝网）");
  // 哨兵端枪：站到！哪部分的？
  s.Key("Sentry", 7.0, { faceTo: "player", clip: HALT });
  s.Eye(7.6, 0.01, { stance: "stand", look: sentry, pitch: 0 });
  s.Say("DitchSentry.01", "Sentry", 7.8);
  // 班长：前头撤下来的！车上是伤兵！
  s.Key("Luo", 8.6, { faceTo: "Sentry", clip: TALK_LOW });
  const answer = s.Say("DitchSentry.02", "Luo");
  s.Eye(7.61, answer - 7.61 - 0.2, { stance: "stand", look: sentry, pitch: 0 });
  s.Eye(answer - 0.2, s.End("DitchSentry.02") - answer + 0.6, { stance: "stand", look: Lerp(luo, sentry, 0.5), pitch: 0 });
  s.Key("Sentry", s.End("DitchSentry.02") + 0.2, { clip: null, aim: false });
  // 七二七团一个连长过来扫了一眼：伤兵往村西头送……你们几个——留到这儿
  const come = Pt(captain.x + 0.2, captain.z - 2.6);
  s.Go("Captain", answer, s.End("DitchSentry.02") + 0.6, come.x, come.z, { move: "walk", faceTo: "GengCart" });
  s.Key("Captain", s.End("DitchSentry.02") + 0.8, { clip: POINT, faceTo: Pt(70, 690) });
  const orders = s.Say("DitchSentry.03", "Captain", s.End("DitchSentry.02") + 1.2);
  s.Key("Captain", orders + 2.4, { clip: TALK_SLUNG, faceTo: "Luo" });
  s.Eye(s.End("DitchSentry.02") + 0.6, s.End("DitchSentry.03") - s.End("DitchSentry.02") + 0.2, { stance: "stand", look: come, pitch: 1 });
  s.Key("Luo", s.End("DitchSentry.03") + 0.3, { clip: null });
  s.Key("Captain", s.End("DitchSentry.03") + 0.6, { clip: null });
  s.Caption(s.End("DitchSentry.03") + 0.4, 2.4, "（连长交代完就走）");
  s.Go("Captain", s.End("DitchSentry.03") + 1.0, s.End("DitchSentry.03") + 4.0, captain.x + 2.0, captain.z + 1.4, { move: "walk", yawDeg: -90 });
  s.Eye(s.End("DitchSentry.03") + 0.8, 3.2, { stance: "stand", look: K("Heizi"), pitch: -6 });
  return s.Done({ durationS: s.End("DitchSentry.03") + 4.2 });
}

function S1204(ctx) {
  const s = new Seq(ctx, "12-4", "黑子不走：妮儿牵它过板桥；送到了就回来");
  const K = id => KXZ(ctx, "12-4", id);
  const cart = K("GengCart"), heizi = K("Heizi"), nierHead = K("Nier"), luo = K("Luo"), cartYaw = KU(ctx, "12-4", "GengCart").yawDeg;
  // 开场妮儿还坐在车尾沿上（预演键 ride 挂回车尾；关键帧里她已在驴头前）
  s.Key("Nier", 0, { ride: { ...NIER_TAIL_RIDE } });
  s.Key("Donggua", 0, { clip: LIE_WRITHE });
  for (const id of ["Helmet1", "Helmet2", "Helmet3"]) s.Key(id, 0, { visible: false });
  s.Key("Geng", 0, { faceTo: "Heizi" });
  // 黑子到板桥头低头看沟，四条腿一撑不走；老耿抽它，它往后坐
  s.Eye(0, 3.4, { stance: "stand", look: heizi, pitch: -8 });
  s.Caption(0.3, 3.2, "（黑子到板桥头低头看沟，四条腿一撑不走）");
  for (const id of ["GengCart", "Heizi"]) s.Shift(id, 1.6, 2.6, 0, -0.6, { yawDeg: cartYaw });
  const whip = s.Say("BalkingMule.01", "Geng", 2.8);
  s.Caption(s.End("BalkingMule.01") + 0.1, 2.4, "（老耿抽它，它往后坐）");
  s.Eye(3.4, s.End("BalkingMule.01") - 3.4 + 0.2, { stance: "stand", look: K("Geng"), pitch: -4 });
  // 妮儿溜下车跑到黑子头前，两手捧它的脸、脑门贴上去
  const offT = R(s.End("BalkingMule.01") + 0.2);
  const tail = CartWorld(Pt(cart.x, cart.z - 0.6), cartYaw, { x: 0.9, z: NIER_TAIL_RIDE.z - 0.3 });
  s.Key("Nier", offT, { ride: null, x: tail.x, z: tail.z, move: "cut", faceTo: "Heizi", stance: "stand" });
  s.Go("Nier", offT + 0.2, offT + 2.4, nierHead.x, nierHead.z - 0.6, { move: "run", path: [Pt(cart.x + 1.4, cart.z), Pt(heizi.x + 1.2, heizi.z)], faceTo: "Heizi" });
  s.Eye(offT, 2.6, { stance: "stand", look: Lerp(cart, heizi, 0.5), pitch: -8 });
  s.Caption(offT + 0.3, 2.4, "（妮儿溜下车跑到黑子头前）");
  s.Eye(offT + 2.6, 3.4, { stance: "stand", look: nierHead, pitch: -10 });
  s.Caption(offT + 2.6, 3.4, "（两手捧它的脸、脑门贴上去——程序化身体没有这动作，说明字顶）");
  // 攥着笼头上了板桥，黑子跟她过去；从这起妮儿牵着黑子走最前头
  const go = R(offT + 6.0), d0 = CartD(Pt(cart.x, cart.z - 0.6)), d1 = d0 + 9.0, T2 = R(go + 9.0 / 1.1);
  CartMove(s, go, T2, d0, d1, { lead: "Nier" });
  s.Go("Geng", go + 0.4, T2, CartOn(d1).cart.x, CartOn(d1).cart.z - 2.6, { move: "walk", path: [Pt(PLANK_N.x, PLANK_N.z - 1.2)], yawDeg: 180 });
  s.Go("LiuWencai", go + 0.6, T2, CartOn(d1).cart.x, CartOn(d1).cart.z - 4.2, { move: "walk", path: [Pt(PLANK_N.x - 0.4, PLANK_N.z - 2.4)], yawDeg: 180 });
  s.Eye(go, 3.4, { stance: "stand", look: PLANK_S, pitch: -6 });
  s.Caption(go + 0.2, 3.4, "（妮儿攥着笼头上了板桥，黑子跟她过去。从这起妮儿牵着黑子走最前头）");
  // 身后耿家庄村南口冒出两三顶钢盔；沟沿上七二七团的机枪一响，钢盔缩回去
  const peek = R(go + 3.6);
  for (const [id, dt] of [["Helmet1", 0], ["Helmet2", 0.3], ["Helmet3", 0.5]]) s.Key(id, peek + dt, { visible: true });
  s.Eye(peek - 0.2, 3.6, { stance: "stand", look: HELMETS, pitch: 1 });
  s.Caption(peek + 0.2, 2.6, "（身后耿家庄村南口冒出两三顶钢盔）");
  const burst = peek + 1.6;
  MgBurst(s, burst, "Mg727", KXZ(ctx, "12-4", "Mg727"), { count: 12, volume: 0.9, puffs: LinePts(Pt(113.6, 549.6), Pt(120.4, 548.4), 5), sweepS: 0.8 });
  for (const [id, dt] of [["Helmet1", 0.9], ["Helmet2", 1.0], ["Helmet3", 1.2]]) s.Key(id, burst + dt, { visible: false });
  s.Caption(burst + 0.4, 2.4, "（沟沿上七二七团的机枪一响，钢盔缩回去）");
  // 班长对顺子：送到了就回来。
  const tell = R(peek + 3.6);
  s.Key("Luo", tell - 0.4, { faceTo: "player", clip: TALK_LOW });
  s.Eye(tell - 0.2, 0.01, { stance: "stand", look: luo, pitch: -2 });
  s.Say("BackSoon.01", "Luo", tell);
  s.Eye(tell - 0.19, s.End("BackSoon.01") - tell + 1.0, { stance: "stand", look: luo, pitch: -2 });
  s.Key("Luo", s.End("BackSoon.01") + 0.4, { clip: null });
  void whip;
  return s.Done({ durationS: Math.max(T2, s.End("BackSoon.01")) + 1.0 });
}

function S1205(ctx) {
  const s = new Seq(ctx, "12-5", "穿村：大字标语、一家人钻洞、老汉不走");
  const P = KP(ctx, "12-5");
  const K = id => KXZ(ctx, "12-5", id);
  const oldMan = K("OldMan"), geng = K("Geng");
  s.Key("Donggua", 0, { clip: LIE_WRITHE });
  // 墙上刷着大字标语
  s.Eye(0, 3.6, { stance: "stand", look: SLOGAN, pitch: 2 });
  s.Caption(0.3, 3.4, "（官道就是村里的主街，斜着往东南穿过去；墙上刷着大字标语「打倒日本帝国主义」）");
  // 一家人往院里的洞里钻，最后一个拿席子盖住洞口（FamilyHidden）
  s.Eye(3.6, 5.0, { stance: "stand", look: FAMILY_HOLE, pitch: -4 });
  s.Caption(3.8, 3.6, "（一家人往院里的洞里钻）");
  const inHole = Pt(FAMILY_HOLE.x + FH.dir.x * 2.2, FAMILY_HOLE.z + FH.dir.z * 2.2);
  ["Fam2", "Fam1", "Fam3"].forEach((id, i) => {
    const t0 = 4.0 + i * 1.2;
    s.Go(id, t0, t0 + 1.4, inHole.x, inHole.z + (i - 1) * 0.4, { move: "walk", path: [FAMILY_HOLE], yawDeg: -90 });
    s.Key(id, t0 + 1.5, { visible: false });
  });
  s.Signal(8.0, SIG.familyHidden, true);
  s.Caption(7.6, 2.4, "（最后一个拿席子盖住洞口）");
  // 老汉坐在自家门口不走。老耿：老哥，咋不走？老汉：走哪去？家在这儿。
  s.Key("Geng", 8.4, { faceTo: "OldMan" });
  s.Eye(8.6, 0.01, { stance: "stand", look: geng, pitch: -2 });
  s.Say("OldMan.01", "Geng", 9.0);
  s.Say("OldMan.02", "OldMan");
  s.Eye(8.61, s.End("OldMan.01") - 8.61 + 0.1, { stance: "stand", look: geng, pitch: -2 });
  s.Eye(s.End("OldMan.01") + 0.1, s.End("OldMan.02") - s.End("OldMan.01") + 0.6, { stance: "stand", look: oldMan, pitch: -6 });
  s.Caption(s.End("OldMan.02") + 0.3, 2.4, "（老汉眼睛不看他）");
  // 车接着顺主街往东南走一段；顺子跟车
  const go = R(s.End("OldMan.02") + 0.8), d0 = CartD(K("GengCart")), d1 = d0 + 12, T2 = R(go + 12 / 1.3);
  s.Key("Geng", go - 0.2, { faceTo: "Heizi" });
  CartMove(s, go, T2, d0, d1, { lead: "Nier" });
  s.Walk("Geng", go, Off(CartOn(d1).heizi, 1.2, -1.0), { tArrive: T2 });
  s.Walk("LiuWencai", go, Off(CartOn(d1).cart, -1.0, 1.2), { tArrive: T2 });
  const w = Walker(s, P, Off(CartOn(d1).cart, -1.6, -1.8), go, T2);
  s.Eye(s.End("OldMan.02") + 0.7, go - s.End("OldMan.02") - 0.7, { stance: "stand", look: oldMan, pitch: -6 });
  w.shot(go, T2, { actor: "GengCart", offset: [0, 1.0, 0] });
  return s.Done({ durationS: T2 + 0.4 });
}

function S1206(ctx) {
  const s = new Seq(ctx, "12-6", "教堂门口：枕木垛、背着老人往里进；车往西拐");
  const P = KP(ctx, "12-6");
  const K = id => KXZ(ctx, "12-6", id);
  s.Key("Donggua", 0, { clip: LIE_WRITHE });
  // 门口码着一垛铁路上拆来的枕木当柴
  s.Eye(0, 3.4, { stance: "stand", look: SLEEPERS, pitch: -6 });
  s.Caption(0.3, 3.2, "（门口码着一垛铁路上拆来的枕木当柴）");
  // 教堂门口：有人提着包袱、背着老人往里进，门边有人张罗着放人；院门开着，看得见院里挤满了老乡
  s.Eye(3.4, 6.0, { stance: "stand", look: CHURCH_GATE_OUT, pitch: 0 });
  s.Caption(3.6, 4.4, "（教堂门口：有人提着包袱、背着老人往里进——背人没有动作，并排走；门边有人张罗着放人）");
  ["ChurchIn1", "ChurchIn2", "ChurchIn3"].forEach((id, i) => {
    const to = Pt(CHURCH_GATE_IN.x + 1.6 + i * 1.1, CHURCH_GATE_IN.z - 1.0 - i * 0.8);
    s.Go(id, 3.8 + i * 1.0, 7.8 + i * 1.0, to.x, to.z, { move: "walk", path: [CHURCH_GATE_OUT, CHURCH_GATE_IN], faceTo: CHURCH_HALL });
  });
  s.Key("ChurchKeeper", 3.6, { faceTo: "player" });
  s.Eye(9.4, 4.0, { stance: "stand", look: CHURCH_HALL, pitch: 3 });
  s.Caption(9.6, 3.6, "（院门开着，看得见院里挤满了老乡）");
  // 车在中间往西拐进一条街去村西头
  const go = 13.0, d0 = CartD(K("GengCart")), d1 = d0 + 10, T2 = R(go + 10 / 1.3);
  CartMove(s, go, T2, d0, d1, { lead: "Nier" });
  s.Walk("Geng", go, Off(CartOn(d1).heizi, 0.4, 1.3), { tArrive: T2 });
  s.Walk("LiuWencai", go, Off(CartOn(d1).cart, 0.4, -1.3), { tArrive: T2 });
  s.Caption(go + 0.2, 3.0, "（车往西拐进一条街，去村西头）");
  const w = Walker(s, P, Off(CartOn(d1).cart, 2.0, 0.8), go, T2);
  w.shot(go, T2, { actor: "Heizi", offset: [0, 1.0, 0] });
  return s.Done({ durationS: T2 + 0.4 });
}

function S1207(ctx) {
  const s = new Seq(ctx, "12-7", "救护所：肚子上的？排到。隔壁洞口探出一个女娃");
  const K = id => KXZ(ctx, "12-7", id);
  const doctor = K("Doctor"), girl = K("Girl"), blanket = K("BlanketDonggua");
  s.Key("Girl", 0, { visible: false });
  s.Key("Donggua", 0, { clip: LIE_WRITHE });
  // 院里地上躺满了
  s.Eye(0, 3.6, { stance: "stand", look: YARD_MID, pitch: -10 });
  s.Caption(0.3, 3.4, "（村西头七二七团借的一个院子，院里地上躺满了）");
  // 医官满手是血，扫一眼冬瓜：肚子上的？排到。
  s.Key("Doctor", 3.0, { faceTo: "Donggua", clip: TALK_SLUNG });
  s.Eye(3.6, 0.01, { stance: "stand", look: doctor, pitch: -6 });
  s.Say("AidArrive.01", "Doctor", 3.9);
  s.Eye(3.61, s.End("AidArrive.01") - 3.61 + 0.4, { stance: "stand", look: doctor, pitch: -6 });
  const turn = R(s.End("AidArrive.01") + 0.4);
  s.Key("Doctor", turn, { clip: null });
  s.Go("Doctor", turn + 0.2, turn + 12.0, DOCTOR_PRESS.x, DOCTOR_PRESS.z, { move: "walk", yawDeg: DOCTOR_PRESS.yawDeg });
  s.Key("Doctor", turn + 12.2, { stance: "crouch", clip: MEDIC_PRESS });
  s.Caption(turn, 3.0, "（医官头也不抬，转身去看别人；冬瓜连单被一起被搁在院里墙根）");
  // 隔壁院墙塌了半截：那家院里的洞口探出一个跟妮儿差不多大的女娃，妮儿看着她
  const peek = turn + 1.6;
  s.Key("Girl", peek, { visible: true });
  s.Key("Nier", peek + 0.6, { faceTo: "Girl" });
  s.Eye(turn, peek - turn + 0.4, { stance: "stand", look: blanket, pitch: -24 });
  s.Eye(peek + 0.4, 4.0, { stance: "stand", look: girl, pitch: -6 });
  s.Caption(peek + 0.6, 3.6, "（隔壁院墙塌了半截，那家院里的洞口探出一个跟妮儿差不多大的女娃，妮儿看着她）");
  // 冬瓜：……到了没得？顺子：到了。
  s.Eye(peek + 4.4, 0.01, { stance: "stand", look: blanket, pitch: -24 });
  s.Say("AidArrive.02", "Donggua", peek + 4.8);
  s.Say("AidArrive.03", null);
  s.Eye(peek + 4.41, s.End("AidArrive.03") - peek - 4.41 + 0.4, { stance: "stand", look: blanket, pitch: -24 });
  // 顺子转身往回跑：任务字：回沟口
  const run = R(s.End("AidArrive.03") + 0.4), T2 = R(run + Dist(KP(ctx, "12-7"), AID_GATE_OUT) / 3.0 + 1.0);
  s.Caption(run + 0.2, 2.6, "（顺子转身往回跑。任务字：回沟口）");
  const w = Walker(s, KP(ctx, "12-7"), Off(AID_GATE_OUT, 2.4, -2.0), run, T2);
  w.shot(run, T2, { x: 97, z: 668, h: 1.4 }, { shake: 0.12 });
  return s.Done({ durationS: T2 + 0.3 });
}

// ---------------------------------------------------------------------------
// 13 沟口

const TK_MG_H = 1.6;   // 九四式车上机枪离地高
function S1301(ctx) {
  const s = new Seq(ctx, "13-1", "回沟口：两辆九四式冲到沟前过不去");
  const K = id => KXZ(ctx, "13-1", id);
  const tk1 = K("Tankette1"), tk2 = K("Tankette2"), luo = K("Luo");
  // 顺子跳回沟边的战壕，挨着班长
  s.Eye(0, 2.4, { stance: "stand", look: luo, pitch: -4 });
  s.Caption(0.3, 2.4, "（顺子跳回沟边的战壕，挨着班长）");
  // 追兵顺官道撵过来了：两辆九四式轻装甲车开在前头，冲到沟前过不去，停在沟沿那边
  s.Place("Tankette1", 0, 106, 602, { yawDeg: Yaw(Pt(106, 602), Pt(100, 614)) });
  s.Place("Tankette2", 0, 132, 592, { yawDeg: Yaw(Pt(132, 592), Pt(106, 602)) });
  s.Go("Tankette1", 0.6, 9.0, tk1.x, tk1.z, { move: "walk", path: [Pt(100, 614)], yawDeg: KU(ctx, "13-1", "Tankette1").yawDeg });
  s.Go("Tankette2", 1.2, 11.0, tk2.x, tk2.z, { move: "walk", path: [Pt(106, 602)], yawDeg: KU(ctx, "13-1", "Tankette2").yawDeg });
  s.Sfx(0.6, "tankTracks", { x: 106, z: 602, volume: 0.6 });
  s.Eye(2.4, 6.6, { stance: "stand", look: Pt(103, 610), pitch: 1 });
  s.Caption(2.6, 4.4, "（追兵顺官道撵过来了，路上会合的两辆九四式轻装甲车开在前头）");
  s.Caption(9.0, 3.4, "（车冲到沟前过不去，停在沟沿那边）");
  // 拿机枪扫我们这边的沟沿：一扫就得缩头（眼睛蹲低）
  const sweep1 = 9.6;
  MgBurst(s, sweep1, "Tankette1", tk1, { count: 14, volume: 0.9, h: TK_MG_H, puffs: LinePts(Pt(112, 641), Pt(130, 641), 8), sweepS: 1.4 });
  s.Eye(9.0, 2.6, { stance: "stand", look: tk1, pitch: 1, shake: 0.3 });
  s.Eye(11.6, 1.6, { stance: "crouch", look: tk1, pitch: -14, shake: 0.2 });
  s.Caption(11.0, 3.0, "（车上的机枪扫我们这边的沟沿：一扫就得缩头）");
  // 步兵在车后、坟头后、田埂后散开
  s.Eye(13.2, 4.0, { stance: "stand", look: K("IjaOfficer"), pitch: 1 });
  s.Caption(13.4, 3.6, "（步兵在车后、坟头后、田埂后散开）");
  // 玩家真打：打车后头露头的步兵
  const fight = 17.2;
  s.Eye(fight, 8.0, { stance: "stand", look: K("IjaInf1"), pitch: 1, shake: 0.12 });
  s.Caption(fight, 4.0, "（玩家这时在真打：打车后头露头的步兵。车打不动，不要求打车）");
  for (const [k, id] of [[0.6, "player"], [1.8, "player"], [3.0, "player"], [1.2, "Luo"], [2.4, "Yaowa"], [3.6, "HeYoutian"], [4.4, "Squad1"], [5.2, "player"]]) Shot(s, fight + k, id, { volume: id === "player" ? 0.9 : 0.6 });
  for (const [k, id] of [[0.9, "IjaInf1"], [2.0, "IjaInf2"], [3.3, "IjaInf3"], [4.6, "IjaInf4"]]) Shot(s, fight + k, id, { volume: 0.45 });
  MgBurst(s, fight + 5.6, "Tankette2", tk2, { count: 12, volume: 0.8, h: TK_MG_H, puffs: LinePts(Pt(100, 640.6), Pt(122, 641), 7), sweepS: 1.0 });
  s.Eye(fight + 8.0, 2.4, { stance: "crouch", look: tk2, pitch: -12, shake: 0.2 });
  return s.Done({ durationS: fight + 10.6 });
}

function S1302(ctx) {
  const s = new Seq(ctx, "13-2", "有人往沟口跑：有的倒在半路，有的扑上板桥爬过来");
  const K = id => KXZ(ctx, "13-2", id), K3 = id => KXZ(ctx, "13-3", id);
  const tk1 = K("Tankette1"), tk2 = K("Tankette2");
  // 三五个撤下来的兵和几个百姓从田里往沟口跑
  s.Eye(0, 3.0, { stance: "stand", look: K("Runner3"), pitch: 0 });
  s.Caption(0.3, 3.6, "（三五个撤下来的兵和几个百姓从田里往沟口跑）");
  const runners = ["Runner1", "Runner2", "Runner3", "Runner4", "Runner5", "Runner6"];
  for (const id of runners) { const p = K(id); s.Place(id, 0, p.x - 4, p.z - 4, { state: "alive", stance: "stand", faceTo: PLANK_N }); }
  s.Place("Crawler", 0, PLANK_N.x - 4, PLANK_N.z - 6, { stance: "stand", faceTo: PLANK_N });
  // 有的倒在半路
  s.Go("Runner4", 0.4, 3.6, K("Runner4").x, K("Runner4").z, { move: "run", faceTo: PLANK_N });
  s.Key("Runner4", 3.7, { state: "down" });
  s.Go("Runner3", 0.6, 4.6, K3("Runner3").x, K3("Runner3").z, { move: "run", faceTo: PLANK_N });
  s.Key("Runner3", 4.7, { state: "down" });
  s.Go("Runner5", 0.4, 4.0, K("Runner5").x, K("Runner5").z, { move: "run", faceTo: PLANK_N });
  s.Key("Runner5", 6.2, { state: "down" });
  for (const [t, p] of [[3.4, K("Runner4")], [4.4, K3("Runner3")], [6.0, K("Runner5")]]) Puff(s, t, Off(p, 0.6, 0.4));
  // 有的扑上板桥爬过来
  s.Go("Crawler", 0.3, 3.0, PLANK_N.x, PLANK_N.z - 0.4, { move: "run" });
  s.Go("Crawler", 3.2, 10.4, PLANK_S.x, PLANK_S.z + 0.6, { move: "crawl", stance: "prone", yawDeg: 180 });
  s.Go("Crawler", 10.8, 13.0, PLANK_S.x - 0.6, PLANK_S.z + 5.4, { move: "run", depart: { stance: "stand" }, yawDeg: 180 });
  s.Key("Crawler", 13.2, { visible: false });
  for (const [id, t0, d] of [["Runner1", 0.5, 0], ["Runner2", 0.9, 1], ["Runner6", 0.7, 2]]) {
    s.Go(id, t0, t0 + 8.6, PLANK_N.x + (d - 1) * 0.5, PLANK_N.z - 1.2 - d * 0.8, { move: "run", faceTo: PLANK_S });
    s.Go(id, t0 + 9.4 + d * 1.4, t0 + 12.4 + d * 1.4, PLANK_S.x + (d - 1) * 0.6, PLANK_S.z + 0.6, { move: "run", yawDeg: 180 });
  }
  s.Go("Runner1", 15.4, 17.6, K3("Runner1").x, K3("Runner1").z, { move: "run", stance: "prone", yawDeg: 180 });
  s.Go("Runner2", 17.0, 19.2, K3("Runner2").x, K3("Runner2").z, { move: "run", stance: "prone", yawDeg: 180 });
  s.Go("Runner6", 18.0, 20.4, PLANK_S.x + 0.4, PLANK_S.z + 6.0, { move: "run", yawDeg: 180 });
  s.Key("Runner6", 20.6, { visible: false });
  s.Eye(3.0, 4.4, { stance: "stand", look: PLANK_N, pitch: -6 });
  s.Caption(3.4, 3.6, "（有的倒在半路，有的扑上板桥爬过来）");
  // 鬼子朝跑的人开枪；车上的机枪扫沟沿
  for (const [k, id] of [[1.0, "IjaInf3"], [2.4, "IjaInf5"], [3.2, "IjaInf1"], [4.0, "IjaInf2"], [5.6, "IjaInf4"], [7.0, "IjaInf6"]]) Shot(s, k, id, { volume: 0.45 });
  MgBurst(s, 7.4, "Tankette1", tk1, { count: 12, volume: 0.9, h: TK_MG_H, puffs: LinePts(Pt(110, 641), Pt(126, 641), 7), sweepS: 1.2 });
  // 玩家真打：车的机枪一扫就缩头；步兵冲板桥就打回去
  s.Eye(7.4, 2.0, { stance: "crouch", look: tk1, pitch: -14, shake: 0.25 });
  s.Caption(7.6, 3.6, "（车的机枪一扫就得缩头）");
  s.Spawn("IjaRush1", { side: "ija", x: 95.0, z: 614.0, yawDeg: 170 }, { visible: true });
  s.Spawn("IjaRush2", { side: "ija", x: 99.6, z: 612.0, yawDeg: 180 }, { visible: true });
  s.Go("IjaRush1", 9.6, 13.4, 96.2, 627.4, { move: "run", aim: true, yawDeg: 180 });
  s.Go("IjaRush2", 10.0, 13.8, 98.4, 626.6, { move: "run", aim: true, yawDeg: 180 });
  s.Eye(9.4, 6.6, { stance: "stand", look: PLANK_N, pitch: -2, shake: 0.12 });
  s.Caption(10.0, 3.4, "（步兵冲板桥，就打回去）");
  for (const [k, id] of [[11.6, "player"], [12.4, "Luo"], [12.8, "player"], [13.2, "Yaowa"], [13.6, "Squad1"], [14.0, "player"]]) Shot(s, k, id, { volume: id === "player" ? 0.9 : 0.6 });
  s.Key("IjaRush1", 13.0, { state: "down" });
  s.Key("IjaRush2", 14.2, { state: "down" });
  MgBurst(s, 16.0, "Tankette2", tk2, { count: 10, volume: 0.8, h: TK_MG_H, puffs: LinePts(Pt(100, 640.6), Pt(118, 641), 6), sweepS: 1.0 });
  s.Eye(16.0, 3.4, { stance: "stand", look: tk2, pitch: 1, shake: 0.12 });
  s.Caption(16.6, 2.6, "（一时谁也过不去）");
  return s.Done({ durationS: 19.6 });
}

function S1303(ctx) {
  const s = new Seq(ctx, "13-3", "信号弹：飞机！趴倒！");
  const K = id => KXZ(ctx, "13-3", id);
  const officer = K("IjaOfficer"), shouter = K("S727_E1");
  // 对面一颗信号弹拖着烟打上天（正式弹道特效；颜色与摆点为创作复原）
  s.Eye(0, 1.4, { stance: "stand", look: officer, pitch: 2 });
  s.Ev(0.8, "flare", { x: officer.x, z: officer.z, atX: FLARE.x, atZ: FLARE.z, preset: "SignalRed" });
  s.Eye(1.4, 3.6, { stance: "stand", look: FLARE, pitch: 55 });
  s.Caption(1.4, 3.2, "（对面一颗信号弹拖着烟打上天）");
  // 几秒后东边嗡嗡声：两架飞机从东边远远地压过来
  TwoPlanes(s, [
    { t: 4.0, x: 620, y: 160, z: 600 }, { t: 9.0, x: 420, y: 110, z: 620 }, { t: 13.0, x: 280, y: 80, z: 636 }, { t: 16.0, x: 200, y: 60, z: 642 },
  ], { dt: 1.3, dz: -18, dy: 8 });
  s.Eye(5.0, 2.4, { stance: "stand", look: PLANES_FROM, pitch: 6 });
  s.Caption(5.4, 3.0, "（几秒后东边嗡嗡声）");
  // 有人喊：飞机！趴倒！屏幕出卧倒提示
  s.Key("S727_E1", 7.0, { stance: "stand", aim: false, faceTo: PLANES_FROM, clip: POINT });
  s.Eye(7.4, 0.01, { stance: "stand", look: shouter, pitch: 2 });
  s.Say("PlanesWarning.01", "S727_E1", 7.8);
  s.Eye(7.41, s.End("PlanesWarning.01") - 7.41 + 0.3, { stance: "stand", look: shouter, pitch: 2 });
  const duck = R(s.End("PlanesWarning.01") + 0.3);
  s.Key("S727_E1", duck, { ...DUCK });
  s.Caption(duck, 2.0, "（Z 卧倒；不趴不判失败）");
  // 趴下：看着东边压过来的飞机
  s.Cam(duck, 16.4 - duck + 0.6, { from: { x: KP(ctx, "13-3").x, z: KP(ctx, "13-3").z, h: 0.45 }, look: { aircraft: KI30.a } });
  s.Caption(duck + 2.2, 2.6, "（跑过来的人有的爬过了板桥，有的倒在沟北边）");
  return s.Done({ durationS: 17.0 });
}

// ---------------------------------------------------------------------------
// 14 空袭，救护所院里松手

function S1401(ctx) {
  const s = new Seq(ctx, "14-1", "扫沟口：顺着战壕扫射、沟口扔小炸弹，再掉头顺着街扫");
  const P = KP(ctx, "14-1");
  // 第一趟：顺着村北沿的战壕从东往西扫，沟口扔小炸弹
  const ST1 = { t0: 2.2, t1: 4.6, from: Pt(200, 642.0), to: Pt(56, 642.2), hz: 26 };
  const ST2 = { t0: 15.0, t1: 17.2, from: Pt(176, 718), to: Pt(108, 649), hz: 26 };
  TwoPlanes(s, [
    { t: 0, x: 300, y: 60, z: 642 }, { t: 2.2, x: 214, y: 20, z: 642 }, { t: 4.6, x: 70, y: 18, z: 642 }, { t: 6.6, x: -40, y: 50, z: 650 },
    { t: 9.6, x: -60, y: 90, z: 760 }, { t: 12.4, x: 120, y: 80, z: 820 }, { t: 14.6, x: 196, y: 30, z: 736 }, { t: 17.2, x: 108, y: 20, z: 649 },
    { t: 19.6, x: 30, y: 60, z: 590 }, { t: 23.0, x: -120, y: 120, z: 560 },
  ], { strafe: [ST1, ST2], dt: 1.2, dz: 8, dx: 0, dy: 8, diveA: 1.0, diveB: 13.8 });
  s.Cam(0, 2.2, { from: { x: P.x, z: P.z, h: 0.45 }, look: { aircraft: KI30.a } });
  s.Caption(0.2, 2.6, "（两架飞机先顺着村北沿的战壕和沟口压过来）");
  for (const [id, dt] of [["S727_E2", 0], ["S727_W2", 0]]) { const p = KXZ(ctx, "14-1", id); s.Key(id, 0, { state: "alive", stance: "crouch" }); s.Key(id, StrafeAtK(ST1, StrafeK(ST1, p)) + dt, { state: "down" }); }
  s.Eye(2.2, 2.6, { stance: "prone", look: Pt(160, 642), pitch: 4, shake: 0.6 });
  s.Shake(2.6, 2.0, 0.6);
  Bomb(s, 4.0, Pt(110, 630.6)); Bomb(s, 4.5, Pt(88, 630.8)); Bomb(s, 5.0, Pt(70, 646));
  s.Eye(4.8, 3.0, { stance: "prone", look: PLANK_MID, pitch: -2, shake: 0.4 });
  s.Caption(4.6, 3.4, "（扔小炸弹、扫射；壕里有人挨了，七二七团的兵倒了两个）");
  // 掉头：从南边绕回来，顺着村里的主街从东南往西北扫
  s.Cam(7.8, 7.2, { from: { x: P.x, z: P.z, h: 0.45 }, look: { aircraft: KI30.a } });
  s.Caption(9.0, 3.0, "（飞机掉头，往村子南边兜回来）");
  s.Cam(15.0, 3.0, { from: { x: P.x, z: P.z, h: 0.7 }, look: { x: 128, z: 670, h: 2 }, shake: 0.4 });
  s.Caption(15.2, 3.0, "（再顺着村里的街扫：不趴不判失败）");
  s.Eye(18.0, 3.0, { stance: "prone", look: Pt(110, 652), pitch: 2 });
  return s.Done({ durationS: 21.0 });
}

function S1402(ctx) {
  const s = new Seq(ctx, "14-2", "去看冬瓜：顺着街往村西头跑；院门口黑子挨了一梭");
  const P0 = KP(ctx, "13-3"), K3 = id => KXZ(ctx, "14-3", id);
  const luo = KXZ(ctx, "14-2", "Luo"), heizi = KXZ(ctx, "14-2", "Heizi"), cart = KXZ(ctx, "14-2", "GengCart");
  const trench = Pt(P0.x, P0.z);
  // 飞机往西头扫过去；班长一把推顺子：顺儿！去看冬瓜！
  s.Key("Luo", 0.4, { faceTo: "player", clip: TALK_CROUCH });
  s.Eye(0, 0.01, { stance: "crouch", x: trench.x, z: trench.z, look: luo, pitch: -6 });
  s.Say("GoSeeDonggua.01", "Luo", 0.8);
  s.Eye(0.01, s.End("GoSeeDonggua.01") + 0.2, { stance: "crouch", x: trench.x, z: trench.z, look: luo, pitch: -6, shake: 0.3 });
  s.Caption(0.2, 2.6, "（飞机往西头扫过去。班长一把推顺子）");
  const run = R(s.End("GoSeeDonggua.01") + 0.3);
  s.Key("Luo", run, { clip: null });
  // 顺子顺着街往村西头跑（自己跑）：出壕、过街口、北头小巷、门前空地
  const front = Pt(AID_GATE_OUT.x + 5.4, AID_GATE_OUT.z - 3.2);
  const s10 = StreetPoint(10), s30 = StreetPoint(30);
  const route = [Pt(118.5, 643.6), Pt(106, 644.2), Pt(s10.x, s10.z), Pt(s30.x, s30.z), Pt(97, 662.3), Pt(97, 684), front];
  const len = RouteLen(trench, route), T2 = R(run + len / 3.6);
  const w = Walker(s, trench, front, run, T2, { via: route, h: 1.5 });
  s.Caption(run + 0.2, 3.0, "（顺子顺着街往村西头跑）");
  s.Caption(run + 4.0, 3.0, "（街上有人往院里跑）");
  for (const [id, to] of [["StreetRunner1", Pt(124, 680)], ["StreetRunner2", Pt(112, 662.3)]]) s.Walk(id, run + 0.6, to, { move: "run", speed: 3.0 });
  // 飞机从西边兜回来，顺着西头的街往东扫：院门口拴在车辕里的黑子挨了一梭，连车带驴翻在地上
  const tS = R(T2 - 0.6);
  const ST = { t0: tS, t1: tS + 1.2, from: Pt(72, 688.4), to: Pt(116, 687.6), hz: 28 };
  TwoPlanes(s, [
    { t: 0, x: 110, y: 40, z: 668 }, { t: run + 2, x: -30, y: 60, z: 676 }, { t: tS - 6, x: -160, y: 90, z: 700 }, { t: tS - 3, x: -40, y: 50, z: 694 },
    { t: tS, x: 64, y: 20, z: 688.6 }, { t: tS + 1.2, x: 118, y: 18, z: 687.6 }, { t: tS + 4, x: 240, y: 70, z: 680 },
  ], { strafe: [ST], dt: 1.1, dz: 10, dy: 8, diveA: tS - 2.2, diveB: tS - 1.1 });
  w.shot(run, tS - 2.4, { x: 97, z: 690, h: 1.3 }, { shake: 0.12 });
  w.shot(tS - 2.4, T2, { aircraft: KI30.a }, { shake: 0.2 });
  const hit = StrafeAtK(ST, StrafeK(ST, heizi));
  s.Shake(hit, 1.2, 0.7);
  s.Key("Heizi", hit + 0.05, { state: "down" });
  s.Place("Heizi", hit + 0.1, K3("Heizi").x, K3("Heizi").z, { yawDeg: KU(ctx, "14-3", "Heizi").yawDeg });
  s.Signal(hit + 0.1, SIG.cartOverturned, true);
  s.Key("GengCart", hit + 0.1, { visible: false });
  s.Sfx(hit + 0.2, "bodyFall", { x: cart.x, z: cart.z, volume: 0.9 });
  s.Ev(hit, "explosion", { x: cart.x, z: cart.z, kind: "grenade", radius: 1.2, h: 0.3 });
  s.Eye(T2, 3.6, { stance: "stand", x: front.x, z: front.z, look: K3("Heizi"), pitch: -10, shake: 0.3 });
  s.Caption(hit + 0.3, 3.6, "（救护所院门口，拴在车辕里的黑子挨了一梭，连车带驴翻在地上）");
  return s.Done({ durationS: T2 + 3.6 });
}

function S1403(ctx) {
  const s = new Seq(ctx, "14-3", "院门口的驴：后腿一下一下地蹬；院里乱成一团");
  const P = KP(ctx, "14-3"), P4 = KP(ctx, "14-4");
  const K = id => KXZ(ctx, "14-3", id);
  const heizi = K("Heizi"), liu = K("LiuWencai"), blanket = K("BlanketDonggua");
  // 飞机拉起来往西兜（这一拍不开枪）
  TwoPlanes(s, [
    { t: 0, x: 240, y: 70, z: 680 }, { t: 4, x: 300, y: 120, z: 760 }, { t: 9, x: 160, y: 130, z: 820 }, { t: 14, x: -20, y: 110, z: 780 }, { t: 18, x: -140, y: 100, z: 700 },
  ], { dt: 1.3, dz: -16, dy: 8 });
  s.Eye(0, 4.2, { stance: "stand", look: heizi, pitch: -14 });
  s.Caption(0.3, 4.0, "（黑子连车带驴翻在地上，后腿一下一下地蹬——牲口没有蹬腿动作，说明字顶）");
  // 刘文财在院门口朝天上打
  s.Eye(4.2, 3.0, { stance: "stand", look: liu, pitch: 2 });
  s.Key("LiuWencai", 3.8, { faceTo: Pt(liu.x, liu.z + 10), aim: true });
  for (const t of [4.6, 5.8, 7.0, 9.4]) Shot(s, t, "LiuWencai", { volume: 0.8 });
  s.Caption(4.4, 2.8, "（刘文财在院门口朝天上打）");
  // 院里乱成一团：能动的往院里挖的洞里钻，抬的抬拖的拖；冬瓜一个人躺在墙根露天里
  const enter = Walker(s, P, P4, 7.2, 12.0);
  enter.shot(7.2, 9.4, { x: 76, z: 694, h: 0.6 });
  s.Caption(7.4, 4.0, "（院里乱成一团：能动的往院里挖的洞里钻，抬的抬拖的拖）");
  s.Go("AidHelper", 7.0, 10.0, 71.2, 697.0, { move: "run" });
  s.Go("DoorGuard", 7.4, 10.4, 69.8, 696.8, { move: "run" });
  s.Key("Doctor", 7.2, { faceTo: Pt(70, 697.6) });
  s.Go("Geng", 8.0, 12.6, 82.4, 691.2, { move: "walk", faceTo: HOLE_A_MOUTH });
  s.Go("Wounded1", 8.0, 12.6, 81.6, 690.2, { move: "walk", lie: "along", yawDeg: 90 });
  s.Caption(9.6, 3.0, "（老耿背着另一个伤员往洞口挪——没有背人的动作，伤员躺着跟他一起挪）");
  enter.shot(9.4, 12.0, { ...blanket, h: 0.2 });
  s.Caption(12.2, 2.8, "（冬瓜一个人躺在墙根露天里）");
  s.Eye(12.0, 3.0, { stance: "crouch", x: P4.x, z: P4.z, look: blanket, pitch: -30 });
  s.Go("Nier", 10.0, 13.0, Off(blanket, -0.8, -1.4).x, Off(blanket, -0.8, -1.4).z, { move: "walk", faceTo: "Donggua" });
  return s.Done({ durationS: 15.0 });
}

function S1404(ctx) {
  const s = new Seq(ctx, "14-4", "揪被角：冬瓜！把他弄过来！妮儿一声不吭揪住另一角");
  const P = KP(ctx, "14-4");
  const K = id => KXZ(ctx, "14-4", id), K5 = id => KXZ(ctx, "14-5", id);
  const blanket0 = K("BlanketDonggua"), geng = K("Geng"), liu = K("LiuWencai");
  const blanketEnd = K5("BlanketDonggua");
  const fr = Frame(blanket0, HOLE_A_MOUTH), yaw = Yaw(blanket0, HOLE_A_MOUTH);
  const blanket1 = Along(blanketEnd, Frame(blanketEnd, HOLE_A_MOUTH).f, -1.3);
  // 飞机在西边掉头，从西边压回来（这一拍不开枪）
  TwoPlanes(s, [{ t: 0, x: -160, y: 100, z: 720 }, { t: 6, x: -150, y: 80, z: 650 }, { t: 12, x: -70, y: 50, z: 690 }, { t: 16, x: -10, y: 34, z: 694 }], { dt: 1.3, dz: 14, dy: 8, diveA: 13.0 });
  // 老耿背着伤员往洞口挪，回头喊：冬瓜！把他弄过来！
  s.Key("Geng", 0.4, { faceTo: "player" });
  s.Eye(0, 0.01, { stance: "crouch", look: geng, pitch: -2 });
  s.Say("BringHim.01", "Geng", 0.8);
  s.Eye(0.01, s.End("BringHim.01") + 0.3, { stance: "crouch", look: geng, pitch: -2 });
  s.Caption(s.End("BringHim.01") + 0.2, 2.6, "（任务字：把冬瓜拖进洞里）");
  const crawl = R(s.End("BringHim.01") + 0.3);
  s.Go("Geng", crawl, crawl + 4.0, HOLE_A_MOUTH.x - 1.2, HOLE_A_MOUTH.z - 1.2, { move: "walk", faceTo: HOLE_A_IN });
  s.Go("Wounded1", crawl, crawl + 4.0, HOLE_A_MOUTH.x - 1.6, HOLE_A_MOUTH.z - 0.6, { move: "walk", lie: "along", yawDeg: 90 });
  // 刘文财在院门口朝天上打
  for (const t of [crawl + 0.8, crawl + 3.6, crawl + 7.2]) Shot(s, t, "LiuWencai", { volume: 0.7 });
  // 玩家揪单被一个角（跟 02 拖被子同键同姿势，手上没枪）
  const eyeL0 = PullL(blanket0, fr), eyeL1 = PullL(blanket1, fr);
  s.Eye(crawl, 2.2, { stance: "crouch", x: eyeL0.x, z: eyeL0.z, look: blanket0, pitch: -40 });
  s.Caption(crawl + 0.2, 3.2, "（揪单被一个角：跟 02 拖被子同键同姿势，手上没枪）");
  // 妮儿一声不吭揪住另一个角（骨骼身体：PvBlanketDragR，她在被子右边）
  const nier0 = PullR(blanket0, fr), nier1 = PullR(blanket1, fr);
  s.Go("Nier", crawl + 0.4, crawl + 2.0, nier0.x, nier0.z, { move: "walk", faceTo: HOLE_A_MOUTH });
  s.Key("Nier", crawl + 2.2, { stance: "stand", carryRole: "front", clip: DRAG_R, yawDeg: yaw });
  s.Eye(crawl + 2.2, 2.4, { stance: "crouch", x: eyeL0.x, z: eyeL0.z, look: nier0, pitch: -14 });
  s.Caption(crawl + 2.4, 3.0, "（妮儿一声不吭揪住另一个角）");
  // 两人往洞口拖，洞口在十几步外；飞机掉头，声音越来越尖（俯冲）
  const go = R(crawl + 4.6), T1 = R(go + Dist(blanket0, blanket1) / DRAG_MPS);
  DragBlanket(s, go, T1, blanket1, yaw);
  s.Go("Nier", go, T1, nier1.x, nier1.z, { move: "walk", yawDeg: yaw });
  const mid = Lerp(eyeL0, eyeL1, 0.5), tm = R((go + T1) / 2);
  s.WalkEye(go, tm - go, eyeL0, mid, { ...HOLE_A_MOUTH, h: 0.2 }, { h: 1.05 });
  s.Cam(tm, T1 - tm, { from: { ...mid, h: 1.05 }, look: { aircraft: KI30.a } });
  s.Caption(go + 0.2, 2.6, "（两人往洞口拖，洞口在十几步外）");
  s.Caption(tm, 2.6, "（飞机掉头，声音越来越尖：俯冲）");
  void liu; void P;
  return s.Done({ durationS: T1 + 0.3 });
}

function S1405(ctx) {
  const s = new Seq(ctx, "14-5", "松手：顺子扑倒，被角脱手；妮儿还攥着另一角在拽");
  const P = KP(ctx, "14-5");
  const K = id => KXZ(ctx, "14-5", id);
  const blanket1 = K("BlanketDonggua");
  const fr = Frame(blanket1, HOLE_A_MOUTH), yaw = Yaw(blanket1, HOLE_A_MOUTH);
  // 开场还在拖：被子从 1.3 m 后头拖到关键帧位置；妮儿在右角、眼睛在左角
  const blanket0 = Along(blanket1, fr.f, -1.3);
  const nier0 = PullR(blanket0, fr), nier1 = PullR(blanket1, fr), eye0 = PullL(blanket0, fr), eye1 = PullL(blanket1, fr);
  s.Place("BlanketDonggua", 0, blanket0.x, blanket0.z, { yawDeg: yaw, dragSolo: false });
  s.Place("Donggua", 0, blanket0.x, blanket0.z, { yawDeg: yaw, lie: "along" });
  s.Place("Nier", 0, nier0.x, nier0.z, { yawDeg: yaw, stance: "stand", carryRole: "front", clip: DRAG_R });
  const T1 = 1.5;
  DragBlanket(s, 0.1, T1, blanket1, yaw);
  s.Go("Nier", 0.1, T1, nier1.x, nier1.z, { move: "walk", yawDeg: yaw });
  s.Cam(0, 0.9, { from: { ...eye0, h: 1.05 }, look: { actor: "Nier", offset: [0, 0.6, 0] } });
  // 两架飞机顺着院子从东边俯冲过来：A 机一串弹着顺地皮追过来，从冬瓜身上扫过、擦着妮儿过去
  const STRAFE = { t0: 1.3, t1: 2.5, from: Pt(104, 699.0), to: Pt(72, 692.4), hz: 30 };
  TwoPlanes(s, [
    { t: 0, x: 170, y: 46, z: 706 }, { t: 1.4, x: 112, y: 20, z: 700 }, { t: 2.6, x: 70, y: 16, z: 692 }, { t: 3.8, x: 30, y: 26, z: 688 },
    { t: 6.0, x: -60, y: 60, z: 676 }, { t: 9.0, x: -190, y: 130, z: 640 },
  ], { strafe: [STRAFE], dt: 1.2, dz: -14, dy: 8, diveA: 0.3, diveB: 1.5 });
  const hit = StrafeAtK(STRAFE, StrafeK(STRAFE, blanket1));
  s.Shake(STRAFE.t0 + 0.3, 1.6, 0.8);
  s.Cam(0.9, 0.7, { from: { ...Along(eye0, fr.f, 0.6), h: 1.05 }, look: { aircraft: KI30.a } });
  // 松手（收走控制两三秒，慢镜头）：顺子本能扑倒，被角从手里脱出去（被子键 dragSolo：玩家那角不攥、落地）
  const drop = 1.6;
  const away = Frame(blanket1, Pt(P.x, P.z));
  const head = Pt(P.x + away.f.x * 1.0, P.z + away.f.z * 1.0);
  s.Slowmo(drop - 0.1, 1.8, 0.3, 0.3);
  s.Cam(drop, 0.6, { from: { ...head, h: 0.35 }, look: { actor: "Nier", offset: [0, 0.5, 0] }, shake: 0.8 });
  s.Caption(drop + 0.05, 2.6, "（俯冲声压到头顶，一串弹着点顺着院子地皮追过来，顺子本能扑倒，被角从手里脱出去）");
  s.Key("BlanketDonggua", drop + 0.15, { dragSolo: true });
  // 妮儿没趴（听不见），还攥着另一角一个人往后拽：冬瓜被拽着挪了一点、挪不动
  const tug0 = drop + 0.3, tug1 = drop + 3.2;
  const blanket2 = Along(blanket1, fr.f, 0.35), nier2 = PullR(blanket2, fr);
  s.Go("Nier", tug0, tug1, nier2.x, nier2.z, { move: "walk", yawDeg: yaw });
  DragBlanket(s, tug0 + 0.2, tug1, blanket2, yaw);
  // 弹着点从冬瓜身上扫过，他一抽；被子上洇开一片血（大腿和腰侧，不当场死）
  s.Key("Donggua", hit, { clip: LIE_WRITHE });
  s.Key("Donggua", hit + 2.4, { clip: null });
  // 抬眼（控制交还）：头抬起来，看得见妮儿攥着的那角、落地的这角和冬瓜
  const up = drop + 0.6;
  s.Cam(up, 2.6, { from: { ...head, h: 0.6 }, look: { actor: "Nier", offset: [0, 0.6, 0] }, shake: 0.4 });
  s.Caption(up + 2.2, 3.2, "（抬眼：自己手边空了；妮儿没趴（听不见），还攥着另一角一个人往后拽，脸朝顺子，不知道他为什么停）");
  s.Key("Nier", up + 2.8, { faceTo: "player" });
  s.Cam(up + 2.6, 3.0, { from: { ...head, h: 0.6 }, look: { actor: "Nier", offset: [0, 0.7, 0] } });
  s.Cam(up + 5.6, 3.8, { from: { ...head, h: 0.6 }, look: { actor: "Donggua", offset: [0, 0.3, 0] } });
  s.Caption(up + 5.6, 3.4, "（冬瓜被拽着挪了一点、挪不动；那串弹着点从他身上扫过，他一抽，被子上洇开一片血——洇血没有表现，说明字顶）");
  s.Caption(up + 9.0, 2.2, "（弹着点擦着妮儿过去，她没挨着）");
  // 院门口刘文财脸正冲这边，全看见了
  s.Key("LiuWencai", up + 9.4, { faceTo: "player", aim: false });
  s.Cam(up + 9.4, 3.6, { from: { ...head, h: 0.6 }, look: { actor: "LiuWencai", offset: [0, 1.0, 0] } });
  s.Caption(up + 9.8, 2.8, "（院门口刘文财脸正冲这边，全看见了）");
  void eye1;
  return s.Done({ durationS: up + 13.0 });
}

function S1406(ctx) {
  const s = new Seq(ctx, "14-6", "拖进洞里：老耿接另一角；刘文财捞走妮儿；飞机往东飞走");
  const P5 = KP(ctx, "14-5");
  const K = id => KXZ(ctx, "14-6", id), K5 = id => KXZ(ctx, "14-5", id);
  const blanket1 = K5("BlanketDonggua"), blanket3 = K("BlanketDonggua");
  const fr = Frame(blanket1, HOLE_A_MOUTH), yaw = Yaw(blanket1, HOLE_A_MOUTH);
  // 开场 = 14-5 末尾：被子往前 0.35 m，妮儿还攥着右角，顺子趴在左角边上
  const blanket0 = Along(blanket1, fr.f, 0.35), nier0 = PullR(blanket0, fr);
  s.Place("BlanketDonggua", 0, blanket0.x, blanket0.z, { yawDeg: yaw, dragSolo: true });
  s.Place("Donggua", 0, blanket0.x, blanket0.z, { yawDeg: yaw, lie: "along" });
  s.Place("Nier", 0, nier0.x, nier0.z, { yawDeg: yaw, stance: "stand", carryRole: "front", clip: DRAG_R });
  s.Key("Nier", 0.2, { faceTo: "player" });
  // 飞机拉起来往东飞走
  TwoPlanes(s, [{ t: 0, x: -150, y: 130, z: 650 }, { t: 5, x: -40, y: 150, z: 600 }, { t: 10, x: 160, y: 170, z: 580 }, { t: 15, x: 420, y: 200, z: 560 }], { dt: 1.2, dz: -16, dy: 8 });
  s.Caption(0.3, 2.6, "（飞机拉起来往东飞走）");
  s.Cam(0, 2.0, { from: { x: P5.x, z: P5.z, h: 0.4 }, look: { aircraft: KI30.a } });
  // 老耿扔下背上的伤员跑回来（骨骼身体），接妮儿那一角；刘文财冲过来把妮儿捞走
  const gengPull0 = PullR(blanket0, fr);
  const geng5 = K5("Geng");
  s.Place("Geng", 0, geng5.x, geng5.z, { stance: "stand", faceTo: blanket0 });
  s.Caption(1.0, 2.8, "（老耿扔下背上的伤员跑回来）");
  s.Place("LiuWencai", 0, K5("LiuWencai").x, K5("LiuWencai").z, { stance: "stand", aim: false, faceTo: "Nier" });
  s.Go("LiuWencai", 0.8, 3.0, nier0.x - fr.r.x * 0.9, nier0.z - fr.r.z * 0.9, { move: "run", faceTo: "Nier" });
  s.Key("Nier", 3.2, { carryRole: null, clip: null, faceTo: "LiuWencai" });
  s.Caption(3.2, 2.8, "（刘文财冲过来把妮儿捞走——没有抱人的动作，并排走）");
  s.Go("Nier", 3.6, 5.8, K("Nier").x, K("Nier").z, { move: "walk", faceTo: "LiuWencai" });
  s.Go("LiuWencai", 3.6, 5.8, K("LiuWencai").x, K("LiuWencai").z, { move: "walk", faceTo: "Nier" });
  s.Go("Geng", 1.2, 4.2, gengPull0.x, gengPull0.z, { move: "run", yawDeg: yaw });
  s.Key("Geng", 4.4, { stance: "stand", carryRole: "front", clip: DRAG_R, yawDeg: yaw });
  // 顺子爬回去揪起自己那一角；被子两角又都有人攥着
  const eyeL0 = PullL(blanket0, fr);
  s.Eye(2.0, 2.4, { stance: "prone", x: P5.x, z: P5.z, look: K5("Geng"), pitch: 2 });
  s.Key("BlanketDonggua", 4.4, { dragSolo: false });
  s.Eye(4.4, 0.6, { stance: "crouch", x: eyeL0.x, z: eyeL0.z, look: blanket0, pitch: -36 });
  s.Caption(4.4, 2.6, "（顺子爬回去揪起自己那一角；老耿攥着另一角）");
  // 一人一角把冬瓜拖进洞里
  const go = 5.0, T1 = R(go + Dist(blanket0, blanket3) / 1.1);
  const gengPull3 = PullR(blanket3, fr), eyeL3 = PullL(blanket3, fr);
  DragBlanket(s, go, T1, blanket3, yaw);
  s.Go("Geng", go, T1, gengPull3.x, gengPull3.z, { move: "walk", yawDeg: yaw });
  const tm = R((go + T1) / 2), eyeMid = Lerp(eyeL0, eyeL3, 0.5);
  s.WalkEye(go, tm - go, eyeL0, eyeMid, { actor: "Geng", offset: [0, 1.0, 0] }, { h: 1.05 });
  s.WalkEye(tm, T1 - tm, eyeMid, eyeL3, { ...HOLE_A_IN, h: -0.6 }, { h: 1.05 });
  s.Caption(go + 0.4, 3.0, "（一人一角把冬瓜拖进洞里）");
  // 院里的人一个个从洞里探出头
  s.Eye(T1, 3.4, { stance: "crouch", x: eyeL3.x, z: eyeL3.z, look: Pt(70, 697.6), pitch: -4 });
  s.Caption(T1 + 0.2, 3.0, "（院里的人一个个从洞里探出头）");
  return s.Done({ durationS: T1 + 3.6 });
}

// ---------------------------------------------------------------------------
// 15 洞里，抬到厢房门口

function S1501(ctx) {
  const s = new Seq(ctx, "15-1", "洞里：你松你妈啥子手！八个……抵了");
  const K = id => KXZ(ctx, "15-1", id);
  const blanket = K("BlanketDonggua"), liu = K("LiuWencai"), bYaw = KU(ctx, "15-1", "BlanketDonggua").yawDeg;
  s.Eye(0, 4.6, { stance: "crouch", look: blanket, pitch: -30 });
  s.Caption(0.4, 3.6, "（洞里：洞顶漏下一条红天）");
  // 老耿跪着把毛巾按回伤口（骨骼身体，CareMedicPress 的站位）；冬瓜躺着弓起来
  const press = PressPose(blanket, bYaw);
  s.Place("Geng", 0, press.x, press.z, { yawDeg: press.yawDeg, stance: "crouch", clip: MEDIC_PRESS });
  s.Key("Donggua", 0, { clip: LIE_TREATED });
  s.Caption(3.0, 4.0, "（老耿跪着，拿手掌把毛巾按回伤口里，按住不放）");
  // 刘文财看看冬瓜，又看看顺子：你松你妈啥子手！（蹲着说）
  s.Key("LiuWencai", 4.6, { stance: "crouch", faceTo: "player", clip: TALK_CROUCH });
  s.Eye(4.6, 0.01, { stance: "crouch", look: liu, pitch: -8 });
  s.Say("InTheHole.01", "LiuWencai", 5.2);
  s.Eye(4.61, s.End("InTheHole.01") - 4.61 + 0.4, { stance: "crouch", look: liu, pitch: -8 });
  s.Caption(s.End("InTheHole.01") + 0.3, 2.0, "（顺子说不出话）");
  s.Key("LiuWencai", s.End("InTheHole.01") + 0.4, { clip: null });
  // 冬瓜睁眼看着顺子，手伸上来攥住他的袖子（PvLieGrabSleeve：说完「抵了」才放开停住段）
  const look = R(s.End("InTheHole.01") + 2.4);
  s.Eye(s.End("InTheHole.01") + 0.4, look - s.End("InTheHole.01") - 0.4 + 0.01, { stance: "crouch", look: blanket, pitch: -30 });
  s.Say("InTheHole.02", "Donggua", look + 0.4);
  s.Say("InTheHole.03", "Donggua");
  s.Key("Donggua", look, { clip: LIE_GRAB, clipRelease: R(s.End("InTheHole.03") - look), clipHold: true });
  s.Caption(s.End("InTheHole.02") + 0.1, 1.6, "（喘了好几口）");
  // 刘文财把妮儿推给老耿：老人家，你牵到她。接过被角
  const give = s.Say("InTheHole.04", "LiuWencai", s.End("InTheHole.03") + 2.0);
  s.Key("LiuWencai", give - 0.4, { faceTo: "Geng", clip: TALK_CROUCH });
  s.Eye(s.End("InTheHole.03") + 1.6, give - s.End("InTheHole.03") - 1.6 + s.ctx.voice.get("InTheHole.04").durationS + 0.3, { stance: "crouch", look: liu, pitch: -8 });
  s.Eye(look + 0.01, s.End("InTheHole.03") + 1.6 - look - 0.01, { stance: "crouch", look: blanket, pitch: -30 });
  const grab = R(s.End("InTheHole.04") + 0.3);
  const fr = Frame(blanket, HOLE_A_MOUTH);
  const liuPull = PullR(blanket, fr);
  s.Go("LiuWencai", grab, grab + 1.6, liuPull.x, liuPull.z, { move: "walk", depart: { clip: null }, yawDeg: Yaw(blanket, HOLE_A_MOUTH) });
  s.Key("LiuWencai", grab + 1.8, { carryRole: "front", clip: DRAG_R });
  s.Caption(grab + 1.8, 2.8, "（老耿等他攥稳了，才把按着毛巾的手松开，去牵妮儿）");
  const nier = K("Nier");
  s.Go("Geng", grab + 3.0, grab + 4.4, nier.x + 0.6, nier.z - 0.4, { move: "walk", depart: { clip: null, stance: "stand" }, faceTo: "Nier" });
  s.Eye(s.End("InTheHole.04") + 0.3, 5.0, { stance: "crouch", look: liuPull, pitch: -16 });
  return s.Done({ durationS: grab + 5.4 });
}

function S1502(ctx) {
  const s = new Seq(ctx, "15-2", "抬到厢房门口：没有对白，天一点点黑");
  const K1 = id => KXZ(ctx, "15-1", id), K3 = id => KXZ(ctx, "15-3", id);
  const start = K1("BlanketDonggua"), end = K3("BlanketDonggua");
  // 出洞：洞里 → 坡道 → 洞口 → 院里 → 厢房门口；顺子左角、刘文财右角，老耿牵着妮儿跟在后头
  const ramp = Pt(HOLE_A_MOUTH.x - 1.2, HOLE_A_MOUTH.z), out = Pt(HOLE_A_MOUTH.x + 1.6, HOLE_A_MOUTH.z - 1.2), yardTurn = Pt(78.6, 689.8);
  const via = [ramp, out, yardTurn];
  const pts = [start, ...via, end];
  const segs = []; let total = 0;
  for (let i = 1; i < pts.length; i++) { const l = Dist(pts[i - 1], pts[i]); segs.push(l); total += l; }
  const T0 = 0.6, T1 = R(T0 + total / DRAG_MPS);
  const yawEnd = Yaw(yardTurn, end);
  s.Place("BlanketDonggua", 0, start.x, start.z, { yawDeg: Yaw(start, HOLE_A_MOUTH) });
  s.Place("Donggua", 0, start.x, start.z, { yawDeg: Yaw(start, HOLE_A_MOUTH), lie: "along" });
  DragBlanket(s, T0, T1, end, yawEnd, via);
  // 拖的人走在被子前头 1.6 m（按最后一段的方向摆到终点）
  const frEnd = Frame(yardTurn, end);
  const liuEnd = PullR(end, frEnd), eyeEnd = PullL(end, frEnd);
  const liu0 = PullR(start, Frame(start, HOLE_A_MOUTH));
  s.Place("LiuWencai", 0, liu0.x, liu0.z, { yawDeg: Yaw(start, HOLE_A_MOUTH), stance: "stand", carryRole: "front", clip: DRAG_R });
  s.Go("LiuWencai", T0, T1, liuEnd.x, liuEnd.z, { move: "walk", path: [Pt(out.x + 1.0, out.z + 0.4), Pt(yardTurn.x - 1.0, yardTurn.z - 0.2)], yawDeg: yawEnd });
  s.Walk("Geng", T0 + 1.2, K3("Geng"), { tArrive: T1 + 1.0 });
  s.Walk("Nier", T0 + 1.4, Off(K3("Nier"), 0.8, 0.8), { tArrive: T1 + 1.0 });
  const eye0 = PullL(start, Frame(start, HOLE_A_MOUTH));
  const w = Walker(s, eye0, eyeEnd, T0, T1, { via: [Pt(ramp.x + 1.6, ramp.z + 0.5), Pt(out.x + 1.6, out.z), Pt(yardTurn.x - 1.4, yardTurn.z - 0.6)], h: 1.5 });
  s.Eye(0, T0, { stance: "crouch", x: eye0.x, z: eye0.z, look: HOLE_A_MOUTH, pitch: 10 });
  const tMid = R(T0 + (T1 - T0) * 0.45);
  w.shot(T0, tMid, { actor: "LiuWencai", offset: [0, 1.2, 0] });
  w.shot(tMid, T1, { ...XIANG_DOOR, h: 1.2 });
  s.Caption(T0 + 0.4, 3.6, "（顺子、刘文财把冬瓜连被子抬出洞；没有对白，只有喘气声和被子蹭地的声音）");
  s.Caption(tMid, 3.6, "（天一点点黑，红褪成灰蓝；老耿牵着妮儿跟在后头）");
  s.Eye(T1, 2.4, { stance: "stand", x: eyeEnd.x, z: eyeEnd.z, look: XIANG_DOOR, pitch: -4 });
  return s.Done({ durationS: T1 + 2.6 });
}

function S1503(ctx) {
  const s = new Seq(ctx, "15-3", "厢房门口等着进：画的黑子嗦？……犟");
  const K = id => KXZ(ctx, "15-3", id);
  const guard = K("DoorGuard"), blanket = K("BlanketDonggua"), nier = K("Nier"), liu = K("LiuWencai"), geng = K("Geng");
  const draw = Pt(nier.x - 0.2, nier.z + 0.9);
  // 守门的兵：等到！里头满起了！挤你妈啥子！
  s.Key("DoorGuard", 0, { faceTo: "player" });
  s.Key("DoorGuard", 0.6, { clip: HALT });
  s.Eye(0, 0.01, { stance: "crouch", look: guard, pitch: 2 });
  s.Say("XiangDoorQueue.01", "DoorGuard", 1.0);
  s.Eye(0.01, s.End("XiangDoorQueue.01") + 0.6, { stance: "crouch", look: guard, pitch: 2 });
  s.Caption(0.3, 3.4, "（厢房门口，被子一床挨一床摆着等；守门的兵把人往外推）");
  s.Key("DoorGuard", s.End("XiangDoorQueue.01") + 0.6, { clip: null });
  // 妮儿捡根树枝在土里画驴、后头拖辆车，掏出弹壳在驴旁边摆一排（骨骼身体，PvKneelDig 顶着）
  const t1 = R(s.End("XiangDoorQueue.01") + 0.6);
  s.Key("Nier", 0, { stance: "crouch", clip: KNEEL_DIG });
  s.Eye(t1, 8.0, { stance: "crouch", look: draw, pitch: -30 });
  s.Caption(t1 + 0.2, 4.4, "（妮儿捡根树枝在土里画驴：长脸，两只长耳朵，四条腿，后头拖一辆车）");
  s.Caption(t1 + 4.6, 3.4, "（掏出弹壳，一个挨一个，在驴旁边摆一排）");
  // 刘文财蹲下来看：画的黑子嗦？……算驴腿的账
  s.Key("LiuWencai", 0, { stance: "crouch", faceTo: draw, clip: TALK_CROUCH });
  const t2 = t1 + 8.0;
  s.Eye(t2, 0.01, { stance: "crouch", look: liu, pitch: -16 });
  s.Say("XiangDoorQueue.02", "LiuWencai", t2 + 0.3);
  const count = s.Say("XiangDoorQueue.03", "LiuWencai");
  s.Key("LiuWencai", count - 0.2, { clip: COUNT_FINGERS });
  s.Key("LiuWencai", s.End("XiangDoorQueue.03") + 0.3, { clip: TALK_CROUCH });
  s.Caption(count + 0.2, 3.0, "（刘文财拈起一个弹壳，在手心里掂了掂）");
  s.Eye(t2 + 0.01, s.End("XiangDoorQueue.03") - t2 + 0.4, { stance: "crouch", look: liu, pitch: -16 });
  const back = R(s.End("XiangDoorQueue.03") + 0.4);
  s.Eye(back, 3.4, { stance: "crouch", look: draw, pitch: -30 });
  s.Caption(back + 0.2, 3.0, "（妮儿把他手心里那个弹壳拿回去，摆回原来的地方）");
  s.Eye(back + 3.4, 0.01, { stance: "crouch", look: liu, pitch: -16 });
  const stubborn = s.Say("XiangDoorQueue.04", "LiuWencai", back + 3.6);
  s.Eye(back + 3.41, s.End("XiangDoorQueue.04") - back - 3.41 + 0.6, { stance: "crouch", look: liu, pitch: -16 });
  s.Key("LiuWencai", s.End("XiangDoorQueue.04") + 0.4, { clip: null });
  // 老耿看着地上那头驴，把脸转开
  const turn = R(s.End("XiangDoorQueue.04") + 0.6);
  s.Key("Geng", 0, { faceTo: draw });
  s.Eye(turn, 4.0, { stance: "crouch", look: geng, pitch: -4 });
  s.Caption(turn + 0.2, 3.0, "（老耿看着地上那头驴，看了一会儿，把脸转开了）");
  s.Key("Geng", turn + 1.8, { faceTo: Pt(geng.x + 6, geng.z + 4) });
  // 门里：下一副！
  s.Say("XiangDoorQueue.05", null, turn + 4.0);
  s.Eye(turn + 4.0, s.End("XiangDoorQueue.05") - turn - 4.0 + 1.6, { stance: "crouch", look: XIANG_DOOR, pitch: 0 });
  void stubborn; void blanket;
  return s.Done({ durationS: s.End("XiangDoorQueue.05") + 1.8 });
}

// ---------------------------------------------------------------------------
// 16 过门槛

function S1601(ctx) {
  const s = new Seq(ctx, "16-1", "过门槛：脚……慢点");
  const P = KP(ctx, "16-1");
  const K = id => KXZ(ctx, "16-1", id), K3 = id => KXZ(ctx, "15-3", id);
  const doctor = K("Doctor");
  // 开场：被子在厢房门口外（15-3 的位置），顺子在被头、刘文财在被尾
  const blanket0 = K3("BlanketDonggua"), blanketEnd = K("BlanketDonggua");
  const heading = Yaw(blanket0, blanketEnd);
  const fr = Frame(blanket0, blanketEnd);
  s.Place("BlanketDonggua", 0, blanket0.x, blanket0.z, { yawDeg: heading });
  s.Place("Donggua", 0, blanket0.x, blanket0.z, { yawDeg: heading, lie: "along" });
  const liu0 = Along(blanket0, fr.f, -1.3);
  s.Place("LiuWencai", 0, liu0.x, liu0.z, { yawDeg: heading, carryRole: "rear" });
  // 医官：肚子上的？抬进去！表堵到门口！（指着厢房）
  s.Key("Doctor", 0.4, { faceTo: "Donggua", clip: POINT });
  s.Eye(0, 0.01, { stance: "stand", x: Along(blanket0, fr.f, 1.3).x, z: Along(blanket0, fr.f, 1.3).z, look: doctor, pitch: -2 });
  s.Say("Threshold.01", "Doctor", 0.8);
  s.Eye(0.01, s.End("Threshold.01") + 0.3, { stance: "stand", x: Along(blanket0, fr.f, 1.3).x, z: Along(blanket0, fr.f, 1.3).z, look: doctor, pitch: -2 });
  s.Caption(0.2, 3.0, "（院里点着马灯；医官满手是血，扫了一眼冬瓜）");
  const T1 = R(s.End("Threshold.01") + 0.3), T2 = R(T1 + fr.len / 0.9);
  s.Key("Doctor", T1, { clip: null });
  // 抬到门口
  DragBlanket(s, T1, T2, blanketEnd, heading);
  s.Go("LiuWencai", T1, T2, K("LiuWencai").x, K("LiuWencai").z, { move: "walk", yawDeg: heading });
  s.WalkEye(T1, T2 - T1, Along(blanket0, fr.f, 1.3), Pt(P.x, P.z), { ...INSIDE, h: 0.6 }, { h: 1.6 });
  // 过门槛：眼睛一低一抬，被子往一边歪了一下
  const th = R(T2 + 0.4);
  s.Eye(T2, 0.4, { stance: "stand", look: INSIDE, pitch: -22 });
  s.Caption(th - 0.2, 3.0, "（厢房门口有道门槛：抬着往里迈，被子往一边歪了一下）");
  s.Cam(th, 0.9, { from: { x: P.x, z: P.z, h: 1.3 }, look: { ...INSIDE, h: 0.2 }, shake: 0.15 });
  s.Cam(th + 0.9, 0.9, { from: { x: XIANG_IN.x + 0.4, z: XIANG_IN.z, h: 1.68 }, look: { ...INSIDE, h: 0.2 }, shake: 0.25 });
  s.Say("Threshold.02", "Donggua", th + 0.8);
  s.Say("Threshold.03", null);
  // 抬进屋里靠墙的空地：放下要按住键慢慢放
  const eyeIn = Pt(INSIDE.x + 1.3, INSIDE.z - 0.8), liuIn = Pt(INSIDE.x + 1.0, INSIDE.z + 1.6);
  const T3 = R(Math.max(th + 1.8, s.End("Threshold.03") - 1.0)), T4 = R(T3 + 4.0);
  DragBlanket(s, T3, T4, INSIDE, 180, [XIANG_OUT, XIANG_IN]);
  s.Go("LiuWencai", T3, T4, liuIn.x, liuIn.z, { move: "walk", path: [XIANG_OUT, XIANG_IN], yawDeg: 180 });
  s.Cam(th + 1.8, T3 - th - 1.8 + 0.01, { from: { x: XIANG_IN.x + 0.4, z: XIANG_IN.z, h: 1.62 }, look: { actor: "Donggua", offset: [0, 0.3, 0] } });
  s.WalkEye(T3 + 0.01, T4 - T3 - 0.01, Pt(XIANG_IN.x + 0.4, XIANG_IN.z), eyeIn, { ...INSIDE, h: 0.2 }, { h: 1.62 });
  s.Caption(T4 + 0.2, 4.0, "（屋里靠墙有块空地。按住键，把被子慢慢放下；一松手就砸下去）");
  s.Eye(T4, 5.0, { stance: "stand", x: eyeIn.x, z: eyeIn.z, look: INSIDE, pitch: -45 });
  s.Key("LiuWencai", T4 + 3.8, { carryRole: null });
  s.Caption(T4 + 4.4, 1.8, "（这是冬瓜最后一句话）");
  s.Key("Geng", 0, { faceTo: XIANG_DOOR });
  s.Key("Nier", 0, { faceTo: XIANG_DOOR });
  return s.Done({ durationS: T4 + 6.4 });
}

// ---------------------------------------------------------------------------
// 17 坐在门槛上

function S1701(ctx) {
  const s = new Seq(ctx, "17-1", "没了：老耿用单被盖住他的脸");
  const K = id => KXZ(ctx, "17-1", id);
  const geng = K("Geng"), nier = K("Nier"), liu = K("LiuWencai"), doctor = K("Doctor"), blanket = K("BlanketDonggua");
  // 医官蹲下看了一眼伤口，又摸摸脖子，停了一会儿（关键帧站位就是 CareMedicPress）
  s.Key("Doctor", 0, { stance: "crouch", clip: MEDIC_PRESS });
  s.Eye(0, 5.0, { stance: "stand", look: doctor, pitch: -26 });
  s.Caption(0.4, 4.4, "（医官蹲下看了一眼伤口，又摸摸脖子，停了一会儿）");
  s.Say("NoMore.01", "Doctor", 5.2);
  // 他站起来冲门口喊，转身去看别人了
  s.Key("Doctor", s.End("NoMore.01") + 0.3, { stance: "stand", clip: POINT, faceTo: XIANG_DOOR });
  const shout = s.Say("NoMore.02", "Doctor");
  s.Eye(5.0, s.End("NoMore.02") - 5.0 + 0.4, { stance: "stand", look: doctor, pitch: -12 });
  const leave = R(s.End("NoMore.02") + 0.4);
  s.Go("Doctor", leave, leave + 4.0, XIANG_OUT.x + 1.4, XIANG_OUT.z - 1.4, { move: "walk", path: [XIANG_IN, XIANG_OUT], depart: { clip: null } });
  s.Caption(leave, 3.0, "（他转身去看别人了。院子里没人停下来）");
  // 刘文财：刚才过门槛，还在说话……
  s.Key("LiuWencai", leave + 0.6, { faceTo: "Donggua", clip: TALK_SLUNG });
  s.Eye(leave, 0.01, { stance: "stand", look: liu, pitch: -8 });
  const liuLine = s.Say("NoMore.03", "LiuWencai", leave + 1.2);
  s.Eye(leave + 0.01, s.End("NoMore.03") - leave + 1.4, { stance: "stand", look: liu, pitch: -8 });
  s.Caption(s.End("NoMore.03") + 0.3, 1.6, "（没人答他）");
  s.Key("LiuWencai", s.End("NoMore.03") + 1.0, { clip: null });
  // 老耿用冬瓜自己那床单被盖住他的脸（PvKneelPullBlanket，停在末帧）
  const cover = R(s.End("NoMore.03") + 1.4);
  s.Key("Geng", cover - 0.4, { faceTo: "Donggua", stance: "crouch", clip: KNEEL_BLANKET, clipHold: true });
  s.Eye(cover, 5.4, { stance: "stand", look: Lerp(geng, blanket, 0.5), pitch: -30 });
  s.Caption(cover + 0.4, 5.0, "（老耿用冬瓜自己那床单被盖住了他的脸）");
  // 妮儿看看这个大人的脸，又看看那个
  const look = R(cover + 5.4);
  s.Key("Nier", look - 0.6, { faceTo: "Geng" });
  s.Key("Nier", look + 1.4, { faceTo: "LiuWencai" });
  s.Key("Nier", look + 2.8, { faceTo: "player" });
  s.Eye(look, 4.6, { stance: "stand", look: nier, pitch: -14 });
  s.Caption(look + 0.4, 3.6, "（妮儿看看这个大人的脸，又看看那个）");
  void shout; void liuLine;
  return s.Done({ durationS: look + 4.8 });
}

function S1702(ctx) {
  const s = new Seq(ctx, "17-2", "铜板：院子里照常忙");
  const P = KP(ctx, "17-2");
  // 退到门口，在门槛上坐下（自动两秒）
  s.Cam(0, 2.2, { from: { x: SEAT.x, z: SEAT.z, h: 1.05 }, look: { ...YARD_MID, h: 1.0 } });
  s.Caption(0.2, 2.2, "（顺子退到门口，在门槛上坐下）");
  // 低头：钱袋、铜板；按 F 挪一个
  s.Eye(2.2, 6.0, { stance: "crouch", yaw: P.yawDeg, pitch: -32 });
  s.Caption(2.8, 3.0, "（他摸出钱袋，把铜板倒在手心里）");
  s.Caption(6.0, 4.0, "（屏幕上只亮一个 F，不写字；按一下往另一只手挪一个）");
  // 院子里有人往里抬、往外抬、烧水；天黑下来了，院里点上马灯
  s.Spawn("LitterIn", { side: "nra", kind: "litter", x: AID_GATE_OUT.x + 1.0, z: AID_GATE_OUT.z - 0.4, yawDeg: 90 }, { visible: true });
  s.Go("LitterIn", 8.0, 18.0, 78.4, 686.6, { move: "walk", path: [AID_GATE_IN, Pt(84, 689)], yawDeg: 90 });
  s.Spawn("LitterOut", { side: "nra", kind: "litter", x: 74.4, z: 688.6, yawDeg: -90 }, { visible: true });
  s.Go("LitterOut", 9.0, 21.0, AID_GATE_OUT.x + 1.0, AID_GATE_OUT.z + 0.4, { move: "walk", path: [Pt(84, 690.2), AID_GATE_IN], yawDeg: -90 });
  s.Go("AidHelper", 3.0, 8.0, 83.0, 681.8, { move: "walk", faceTo: Pt(86, 677) });
  s.Eye(8.2, 6.0, { stance: "crouch", yaw: P.yawDeg, pitch: -6 });
  s.Caption(10.4, 4.0, "（院子里有人往里抬、往外抬、烧水）");
  s.Eye(14.2, 6.0, { stance: "crouch", look: LAMP, pitch: 2 });
  s.Caption(15.0, 4.0, "（天黑下来了，院里点上马灯）");
  s.Eye(20.2, 6.0, { stance: "crouch", yaw: P.yawDeg, pitch: -32 });
  return s.Done({ durationS: 26.4 });
}

function S1703(ctx) {
  const s = new Seq(ctx, "17-3", "班长进院：咋个搞的？……飞机。……起来");
  const K = id => KXZ(ctx, "17-3", id);
  const luoAt = K("Luo"), yaowaAt = K("Yaowa"), heAt = K("HeYoutian"), liu = K("LiuWencai");
  // 班长带幺娃、何有田进院（沟口那边鬼子缩回去了，交给七二七团守）
  const starts = { Luo: Off(AID_GATE_OUT, 0.6, 0), Yaowa: Off(AID_GATE_OUT, 1.8, -0.7), HeYoutian: Off(AID_GATE_OUT, 2.6, 0.7), Squad1: Off(AID_GATE_OUT, 3.6, -0.5), Squad2: Off(AID_GATE_OUT, 4.4, 0.6) };
  for (const [id, p] of Object.entries(starts)) s.Place(id, 0, p.x, p.z, { yawDeg: 90 });
  s.Caption(0.5, 4.0, "（院门口一阵乱：罗班长带着幺娃、何有田从沟口撤回来进院，满身是土和烟——沟口那边鬼子缩回去了，交给七二七团守）");
  const arriveLuo = s.Walk("Luo", 1.0, luoAt, { speed: 2.6, faceTo: "player" });
  s.Walk("Yaowa", 1.6, yaowaAt, { speed: 2.6, faceTo: "player" });
  s.Walk("HeYoutian", 2.0, heAt, { speed: 2.6, faceTo: "player" });
  s.Walk("Squad1", 2.6, K("Squad1"), { speed: 1.6, faceTo: "player" });
  s.Walk("Squad2", 3.0, K("Squad2"), { speed: 1.6, yawDeg: 90 });
  s.Eye(0, arriveLuo, { stance: "crouch", look: AID_GATE_IN, pitch: -2 });
  s.Eye(arriveLuo, 3.0, { stance: "crouch", look: luoAt, pitch: 4 });
  s.Caption(arriveLuo, 3.0, "（班长看见门槛上的顺子，又看见屋里盖着脸的那个）");
  // 班长走过去在被子边蹲下，掀开被角看了一眼（LuoKneelCheck）
  const kneel = Pt(INSIDE.x + 1.3, INSIDE.z - 0.2);
  const go = R(arriveLuo + 2.4);
  s.Go("Luo", go, go + 3.2, kneel.x, kneel.z, { move: "walk", path: [XIANG_OUT, XIANG_IN], faceTo: "Donggua" });
  s.Key("Luo", go + 3.4, { stance: "crouch", clip: "LuoKneelCheck" });
  s.Eye(go - 0.4, 0.01, { stance: "crouch", look: luoAt, pitch: 4 });
  s.Eye(go, 4.4, { stance: "crouch", look: kneel, pitch: -16 });
  s.Caption(go + 3.4, 3.4, "（他在被子边蹲下，掀开被角看了一眼）");
  const why = s.Say("WhatHappened.01", "Luo", go + 6.8);
  s.Key("Luo", why - 0.2, { clip: TALK_CROUCH });
  s.Eye(go + 4.4, s.End("WhatHappened.01") - go - 4.4, { stance: "crouch", look: kneel, pitch: -16 });
  s.Key("LiuWencai", why + 0.2, { faceTo: "player", clip: TALK_SLUNG });
  const plane = s.Say("WhatHappened.02", "LiuWencai");
  s.Eye(s.End("WhatHappened.01"), plane - s.End("WhatHappened.01") + s.ctx.voice.get("WhatHappened.02").durationS + 0.2, { stance: "crouch", look: liu, pitch: -6 });
  s.Caption(plane - 0.3, 1.6, "（刘文财看了顺子一眼）");
  const damn = s.Say("WhatHappened.03", "Luo");
  s.Eye(s.End("WhatHappened.02") + 0.2, s.End("WhatHappened.03") - s.End("WhatHappened.02") + 0.2, { stance: "crouch", look: kneel, pitch: -16 });
  s.Key("LiuWencai", s.End("WhatHappened.02") + 0.6, { clip: null });
  // 幺娃看见顺子手心的铜板，把眼睛挪开
  const glance = R(s.End("WhatHappened.03") + 0.4);
  s.Eye(glance, 3.8, { stance: "crouch", look: yaowaAt, pitch: 4 });
  s.Caption(glance + 0.2, 3.4, "（幺娃看见顺子手心里那一把铜板，把眼睛挪开了）");
  s.Key("Yaowa", glance + 1.4, { faceTo: Pt(yaowaAt.x + 6, yaowaAt.z - 4) });
  // 班长站起来：顺儿。……起来。
  s.Key("Luo", glance + 2.6, { stance: "stand", faceTo: "player", clip: TALK_SLUNG });
  s.Go("Luo", glance + 2.8, glance + 4.6, XIANG_IN.x - 0.6, XIANG_IN.z - 0.6, { move: "walk", faceTo: "player" });
  s.Say("WhatHappened.04", "Luo", glance + 5.0);
  s.Eye(glance + 3.8, s.End("WhatHappened.04") - glance - 3.8 + 0.4, { stance: "crouch", look: Pt(XIANG_IN.x - 0.6, XIANG_IN.z - 0.6), pitch: 12 });
  s.Caption(s.End("WhatHappened.04") + 0.4, 3.0, "（顺子把铜板一把攥住塞回怀里，站起来，拿回全部操作）");
  s.Cam(s.End("WhatHappened.04") + 0.4, 2.0, { from: { x: SEAT.x, z: SEAT.z, h: 1.62 }, look: { actor: "Luo", offset: [0, 1.4, 0] } });
  void heAt; void damn;
  return s.Done({ durationS: s.End("WhatHappened.04") + 3.4 });
}

// ---------------------------------------------------------------------------
// 18 撤过铁路桥

function S1801(ctx) {
  const s = new Seq(ctx, "18-1", "命令：撤回县城，铁路桥天黑前炸；担架先走");
  const K = id => KXZ(ctx, "18-1", id);
  const captain = K("Captain"), luo = K("Luo"), he = K("HeYoutian");
  // 七二七团连长进院
  s.Place("Captain", 0, AID_GATE_IN.x, AID_GATE_IN.z, { yawDeg: 90 });
  const arrive = s.Walk("Captain", 0.4, captain, { speed: 1.8, faceTo: "Luo" });
  s.Eye(0, arrive, { stance: "stand", look: AID_GATE_IN, pitch: -2 });
  s.Caption(0.3, 3.0, "（七二七团连长进院）");
  // 命令下来了：撤回县城，铁路桥天黑前炸。城里说援兵在路上了。
  s.Key("Captain", arrive + 0.2, { clip: TALK_SLUNG });
  s.Eye(arrive, 0.01, { stance: "stand", look: captain, pitch: -2 });
  const order = s.Say("Orders727.01", "Captain", arrive + 0.5);
  // 何有田：在路上？日他妈，老子也在路上。
  s.Key("HeYoutian", s.End("Orders727.01"), { faceTo: "Captain", clip: TALK_LOW });
  const onWay = s.Say("Orders727.02", "HeYoutian");
  s.Eye(arrive + 0.01, onWay - arrive - 0.2, { stance: "stand", look: captain, pitch: -2 });
  s.Eye(onWay - 0.2, s.End("Orders727.02") - onWay + 0.4, { stance: "stand", look: he, pitch: -2 });
  s.Key("HeYoutian", s.End("Orders727.02") + 0.4, { clip: null });
  // 连长：担架先走！对班长：你们跟我殿后。
  s.Key("Captain", s.End("Orders727.02") + 0.1, { faceTo: K("AidLitter2"), clip: POINT });
  const first = s.Say("Orders727.03", "Captain");
  s.Eye(s.End("Orders727.02") + 0.2, first - s.End("Orders727.02") - 0.2 + s.ctx.voice.get("Orders727.03").durationS + 0.2, { stance: "stand", look: captain, pitch: -2 });
  s.Key("Captain", s.End("Orders727.03") + 0.2, { faceTo: "Luo", clip: TALK_SLUNG });
  const rear = s.Say("Orders727.04", "Captain");
  s.Eye(s.End("Orders727.03") + 0.2, s.End("Orders727.04") - s.End("Orders727.03") + 0.2, { stance: "stand", look: Lerp(captain, luo, 0.5), pitch: -2 });
  // 班长：顺儿，你跟担架走。到桥南头等到老子。
  s.Key("Luo", s.End("Orders727.04") + 0.1, { faceTo: "player", clip: TALK_LOW });
  const tell = s.Say("Orders727.05", "Luo");
  s.Eye(s.End("Orders727.04") + 0.4, s.End("Orders727.05") - s.End("Orders727.04") + 0.2, { stance: "stand", look: luo, pitch: -2 });
  // 院里的担架一副副抬出去，医官跟着最后一副走；院门敞着，屋里只剩盖着脸的（冬瓜在里头）
  const out = R(s.End("Orders727.05") + 0.6);
  for (const id of ["Luo", "Captain"]) s.Key(id, out, { clip: null });
  const lane = Pt(94, 700);
  ["AidLitter1", "AidLitter2", "AidLitter3"].forEach((id, i) => s.Walk(id, out + i * 2.0, Off(lane, 0, 2.4 * (2 - i)), { tArrive: out + 14 + i * 1.4 }));
  s.Walk("Doctor", out + 5.0, Off(lane, 0.8, -1.6), { tArrive: out + 18.0 });
  s.Eye(out, 6.0, { stance: "stand", look: AID_GATE_IN, pitch: -2 });
  s.Caption(out + 0.2, 4.0, "（院里的担架一副副抬出去，医官跟着最后一副走）");
  s.Eye(out + 6.0, 4.0, { stance: "stand", look: Pt(XIANG_DOOR.x, XIANG_DOOR.z), pitch: -4 });
  s.Caption(out + 6.2, 3.6, "（院门敞着，屋里只剩盖着脸的——冬瓜在里头）");
  void order; void rear; void tell;
  return s.Done({ durationS: out + 10.4 });
}

function S1802(ctx) {
  const s = new Seq(ctx, "18-2", "隔壁院：走啊！鬼子要来了！");
  const K = id => KXZ(ctx, "18-2", id);
  const geng = K("Geng"), mother = K("GirlMother");
  // 开场洞口还没盖（关键帧里已经盖上）：女人在洞口探出身
  s.Signal(0, SIG.girlHoleCovered, false);
  s.Key("GirlMother", 0, { faceTo: "Geng" });
  s.Eye(0, 2.6, { stance: "stand", look: mother, pitch: -8 });
  s.Caption(0.3, 2.6, "（救护所南墙塌了的那截墙根边，隔壁院里地上一个洞口，洞口探出一个女人）");
  // 老耿冲那家洞口喊
  s.Key("Geng", 2.0, { faceTo: "GirlMother" });
  s.Eye(2.6, 0.01, { stance: "stand", look: Lerp(geng, mother, 0.4), pitch: -6 });
  s.Say("GoNow.01", "Geng", 2.8);
  s.Eye(2.61, s.End("GoNow.01") - 2.61 + 0.4, { stance: "stand", look: Lerp(geng, mother, 0.4), pitch: -6 });
  // 洞口那个女人摇摇头，把席子拉上，盖住洞口
  const no = R(s.End("GoNow.01") + 0.6);
  s.Eye(s.End("GoNow.01") + 0.4, 5.4, { stance: "stand", look: mother, pitch: -10 });
  s.Caption(no, 3.0, "（洞口那个女人摇摇头——程序化身体摇不了头，说明字顶）");
  s.Go("GirlMother", no + 2.4, no + 3.4, GIRL_HOLE.x, GIRL_HOLE.z + 1.6, { move: "walk", yawDeg: 180 });
  s.Key("GirlMother", no + 3.5, { visible: false });
  s.Signal(no + 3.6, SIG.girlHoleCovered, true);
  s.Caption(no + 3.0, 3.0, "（把席子拉上，盖住洞口）");
  s.Key("Nier", no + 1.0, { faceTo: GIRL_HOLE });
  s.Caption(no + 6.0, 3.0, "（妮儿站在老耿身边看着那个洞口）");
  s.Eye(no + 5.2, 3.6, { stance: "stand", look: K("Nier"), pitch: -14 });
  // 担架一副副从院门抬出去
  const lane = Pt(94, 712);
  ["AidLitter1", "AidLitter2", "AidLitter3"].forEach((id, i) => s.Walk(id, 0.5 + i * 2.4, Off(lane, 0, 2.6 * (2 - i)), { tArrive: 14 + i * 2.4 }));
  s.Walk("Doctor", 6.0, Off(lane, 0.9, -1.8), { tArrive: 21.0 });
  return s.Done({ durationS: no + 8.8 });
}

function S1803(ctx) {
  const s = new Seq(ctx, "18-3", "铁路桥：担架和兵踩着枕木一格一格过；老乡顺陡岸滑下河床蹚水");
  const P = KP(ctx, "18-3");
  const K = id => KXZ(ctx, "18-3", id);
  const deckEnd = Pt(RL.x, RB.southZ + 1.5);
  // 太阳落到铁路那头；路基比人高，北边铁轨拆了，只剩光路基
  s.Eye(0, 3.6, { stance: "stand", look: SUN, pitch: 1 });
  s.Caption(0.3, 3.4, "（出村往西，一公里麦地——白盒压短；太阳落到铁路那头）");
  s.Eye(3.6, 3.4, { stance: "stand", look: Pt(RL.x, 730), pitch: -8 });
  s.Caption(3.8, 3.2, "（铁路路基比人高，北边铁轨拆了，只剩光路基）");
  // 担架和兵走桥面，踩着枕木一格一格过（standOn 走道：演员站在枕木顶上）
  s.Walk("AidLitter3", 0.4, Off(deckEnd, 0, 3.5), { tArrive: 38.0 });
  s.Walk("Doctor", 1.4, Off(deckEnd, 0, 1.1), { tArrive: 39.0 });
  s.Walk("AidLitter2", 0.2, Pt(-101.2, 822), { tArrive: 30.0 });
  s.Walk("AidLitter1", 0.2, Pt(-92, 822), { tArrive: 20.0 });
  s.Walk("Rear727_5", 0.6, Off(deckEnd, 0, -5.0), { speed: 1.2 });
  s.Walk("Geng", 0.8, Off(deckEnd, -0.4, -9.0), { speed: 1.0 });
  s.Walk("Nier", 0.8, Off(deckEnd, 0.5, -8.6), { speed: 1.0 });
  s.Walk("LiuWencai", 6.0, DECK(RB.northZ + 6), { speed: 1.1 });
  // 机位：北岸坡上侧看桥面；河床里仰看枕木
  s.Cam(7.0, 5.0, { from: { x: -90.0, z: 758.4, h: 1.7 }, look: { x: RL.x, z: 772, h: 1.2 } });
  s.Caption(7.2, 4.6, "（铁路桥是几孔钢梁架在石墩上，桥面只有枕木；担架和兵走桥面，踩着枕木一格一格过）");
  s.Cam(12.0, 5.0, { from: { x: -88.0, z: 776.0, h: 1.6 }, look: { actor: "Geng", offset: [0, 0.8, 0] } });
  s.Caption(12.2, 3.4, "（老耿牵着妮儿走桥面）");
  // 有老乡顺着陡岸滑下河床，蹚水过去
  const slideN = RV.slides[0], slideS = RV.slides[1];
  s.Go("Wader1", 0.6, 7.0, slideN.x, 766.6, { move: "walk", yawDeg: 180 });
  s.Go("Wader1", 7.2, 16.0, slideN.x + 0.4, 784.0, { move: "walk", yawDeg: 180 });
  s.Go("Wader2", 2.0, 14.0, slideS.x - 1.2, 798.0, { move: "walk", yawDeg: 180 });
  s.Go("Wader3", 2.6, 15.0, slideS.x + 0.2, 801.6, { move: "walk", yawDeg: 180 });
  s.Cam(17.0, 4.4, { from: { x: -92.0, z: 760.8, h: 1.8 }, look: { actor: "Wader2", offset: [0, 0.6, 0] } });
  s.Caption(17.2, 3.6, "（有老乡顺着陡岸滑下河床，蹚水过去）");
  // 七二七团的兵一拨守着一拨往后撤
  for (const [id, i] of [["Rear727_1", 0], ["Rear727_2", 1], ["Rear727_3", 2], ["Rear727_4", 3]]) s.Walk(id, 1.0 + i * 1.6, Pt(-60 + i * 4, 736 - i * 0.6), { tArrive: 24 + i * 1.6, aim: false });
  // 顺子跟着担架走上桥面：缝里看得见底下的沙和一股水
  const deck0 = Pt(P.x, P.z), deck1 = DECK(RB.northZ + 14);
  const walk = R(21.4), T2 = R(walk + RouteLen(deck0, StreetRoute(deck0, deck1)) / 1.2);
  const w = Walker(s, deck0, deck1, walk, T2);
  w.shot(walk, T2, { actor: "AidLitter2", offset: [0, 1.0, 0] });
  s.Caption(walk + 0.2, 3.0, "（顺子跟着担架走上桥面）");
  s.Eye(T2, 4.6, { stance: "stand", x: deck1.x, z: deck1.z, yaw: 180, pitch: -62 });
  s.Caption(T2 + 0.2, 4.0, "（枕木缝里看得见底下的沙和一股水）");
  return s.Done({ durationS: T2 + 4.8 });
}

function S1804(ctx) {
  const s = new Seq(ctx, "18-4", "南头等：炸！不等了！……顺儿！那挺机枪！");
  const K = id => KXZ(ctx, "18-4", id);
  const officer = K("Officer18"), liu = K("LiuWencai");
  const squad = ["Luo", "Yaowa", "HeYoutian", "Squad1", "Squad2"];
  // 南头桥头河堤后：七二七团军官带几个兵守着；两个工兵在桥墩上绑炸药，引线拉到河堤后
  for (const id of ["Sapper1", "Sapper2"]) s.Key(id, 0, { clip: KNEEL_DIG });
  s.Eye(0, 4.0, { stance: "prone", look: PIER(0), pitch: 2 });
  s.Caption(0.3, 4.0, "（南头桥头河堤后，七二七团军官带几个兵守着；两个工兵在桥墩上绑炸药，引线拉到河堤后）");
  // 七二七团最后几拨过桥
  s.Walk("Rear727_1", 0.4, Pt(-99.4, 818.2), { move: "run", tArrive: 22.0, aim: false });
  s.Walk("Rear727_2", 0.2, Pt(-100.6, 820.0), { move: "run", tArrive: 9.0, aim: false });
  s.Eye(4.0, 3.4, { stance: "prone", look: DECK(782), pitch: 1 });
  s.Caption(4.2, 3.0, "（七二七团最后几拨过桥）");
  // 天快黑透：北边田里，班长他们一拨一拨往回跳；被一挺机枪压在桥北头土坎后头
  for (const [i, id] of squad.entries()) { const p = K(id); s.Place(id, 0, p.x + 2, p.z - 14 + (i % 2) * 1.2, { stance: "crouch", aim: false, faceTo: MG18 }); }
  s.Place("LastWounded", 0, K("LastWounded").x + 2, K("LastWounded").z - 14, { lie: "along" });
  for (const [i, id] of squad.entries()) s.Go(id, 7.6 + (i % 3) * 0.6, 11.0 + (i % 3) * 0.6, K(id).x, K(id).z, { move: "run", stance: "crouch", aim: false, yawDeg: 180 });
  s.Go("LastWounded", 8.2, 11.6, K("LastWounded").x, K("LastWounded").z, { move: "run", lie: "along", yawDeg: 180 });
  s.Eye(7.4, 4.6, { stance: "prone", look: LAST_COVER, pitch: 1 });
  s.Caption(7.6, 4.2, "（天快黑透，北边田里，班长他们一拨一拨往回跳）");
  MgBurst(s, 11.6, "IjaMg18", MG18, { count: 14, volume: 0.8, puffs: LinePts(Pt(-90, 729.2), Pt(-70, 729.4), 8), sweepS: 1.4 });
  s.Eye(12.0, 4.4, { stance: "prone", look: MG18, pitch: 0 });
  s.Caption(12.2, 4.0, "（鬼子步兵徒手过了村口的沟追上来，在田里一挺机枪顺着路基扫；班长他们被压在桥北头土坎后头，离开土坎就是靶子）");
  for (const [k, id] of [[0.8, "IjaField1"], [2.0, "IjaField3"], [3.2, "IjaField2"], [4.0, "IjaField5"]]) Shot(s, 12.0 + k, id, { volume: 0.4 });
  // 军官：炸！不等了！刘文财：班长他们还在后头！军官：鬼子都上来了！刘文财：再等一哈！……顺儿！那挺机枪！
  const talk = 16.6;
  s.Key("Officer18", talk - 0.4, { faceTo: "Sapper1", clip: POINT });
  s.Eye(talk - 0.2, 0.01, { stance: "prone", look: officer, pitch: 4 });
  s.Say("HoldOn.01", "Officer18", talk);
  Shot(s, s.End("HoldOn.01") - 0.2, "LiuWencai", { volume: 0.7 });
  const still = s.Say("HoldOn.02", "LiuWencai");
  s.Eye(talk - 0.19, still - talk + 0.19 - 0.1, { stance: "prone", look: officer, pitch: 4 });
  s.Eye(still - 0.1, s.End("HoldOn.02") - still + 0.2, { stance: "prone", look: liu, pitch: -4 });
  s.Key("Officer18", s.End("HoldOn.02"), { faceTo: "LiuWencai", clip: TALK_SLUNG });
  const up = s.Say("HoldOn.03", "Officer18");
  s.Eye(s.End("HoldOn.02") + 0.1, up - s.End("HoldOn.02") - 0.1 + s.ctx.voice.get("HoldOn.03").durationS + 0.1, { stance: "prone", look: officer, pitch: 4 });
  Shot(s, s.End("HoldOn.03") - 0.1, "LiuWencai", { volume: 0.7 });
  const wait = s.Say("HoldOn.04", "LiuWencai");
  s.Key("LiuWencai", wait + 1.0, { faceTo: "player" });
  s.Eye(s.End("HoldOn.03") + 0.2, s.End("HoldOn.04") - s.End("HoldOn.03") + 0.2, { stance: "prone", look: liu, pitch: -4 });
  s.Key("Officer18", s.End("HoldOn.04"), { clip: null });
  s.Caption(s.End("HoldOn.04") + 0.2, 2.6, "（任务字：压住那挺机枪）");
  s.Eye(s.End("HoldOn.04") + 0.4, 2.4, { stance: "prone", look: MG18, pitch: 0 });
  return s.Done({ durationS: s.End("HoldOn.04") + 2.8 });
}

function S1805(ctx) {
  const s = new Seq(ctx, "18-5", "快过来！快过来！班长他们跑过桥，班长最后一个");
  const K = id => KXZ(ctx, "18-5", id), K4 = id => KXZ(ctx, "18-4", id), K6 = id => KXZ(ctx, "18-6", id);
  const P = KP(ctx, "18-5");
  const squad = ["Yaowa", "HeYoutian", "Squad1", "Squad2"];
  // 开场：班长他们还在土坎后头（18-4 的位置），机枪还在打
  for (const id of ["Luo", ...squad]) s.Place(id, 0, K4(id).x, K4(id).z, { stance: "crouch", aim: false, faceTo: MG18 });
  s.Place("LastWounded", 0, K4("LastWounded").x, K4("LastWounded").z, { lie: "along" });
  for (const id of ["IjaMg18", "IjaMg18Loader"]) s.Key(id, 0, { state: "alive" });
  for (const id of ["Sapper1", "Sapper2"]) s.Key(id, 0, { clip: GRIP_LITTER });
  // 玩家压机枪
  s.Eye(0, 6.4, { stance: "prone", x: KP(ctx, "18-4").x, z: KP(ctx, "18-4").z, look: MG18, pitch: 0, shake: 0.1 });
  s.Caption(0.3, 3.0, "（玩家压机枪）");
  MgBurst(s, 0.6, "IjaMg18", MG18, { count: 10, volume: 0.8, puffs: LinePts(Pt(-88, 729.2), Pt(-74, 729.4), 6), sweepS: 1.0 });
  for (const t of [1.6, 2.8, 4.0]) Shot(s, t, "player", { volume: 0.9 });
  s.Key("IjaMg18", 4.2, { state: "down" });
  s.Key("IjaMg18Loader", 4.6, { x: MG18.x + 0.3, z: MG18.z + 0.4, move: "crawl", stance: "prone" });
  Shot(s, 5.4, "player", { volume: 0.9 });
  s.Key("IjaMg18Loader", 5.6, { state: "down" });
  // 机枪一哑，顺子站起来冲他们挥手：快过来！快过来！
  const wave = 6.4;
  s.Caption(wave, 2.4, "（机枪一哑，顺子站起来冲他们挥手——02 坡顶别人冲他喊的那句，这回是他喊）");
  s.Say("ComeOver.01", null, wave + 0.3);
  s.Eye(wave, s.End("ComeOver.01") - wave + 0.4, { stance: "stand", look: LAST_COVER, pitch: 2 });
  // 班长他们跑过桥（踩着枕木）：土坎 → 田间小路尽头 → 上路基的土坡 → 桥面 → 桥南头 → 斜着下到河堤后；班长最后一个
  const run = R(s.End("ComeOver.01") + 0.2);
  const deckVia = [Pt(-91, 744), Pt(-92, 755), Pt(RAIL_RAMP_N.x, RAIL_RAMP_N.z), Pt(RL.x, RB.northZ - 1.5), Pt(RL.x, RB.southZ + 1.5), Pt(-101.8, 811.0)];
  const RunOver = (id, t0, to, speed = 3.2) => { const cur = s.pos.get(id); const len = RouteLen(cur, [...deckVia, to]); const t1 = R(t0 + len / speed); s.Go(id, t0, t1, to.x, to.z, { move: "run", path: deckVia, depart: { stance: "stand" }, stance: "stand", aim: false }); return { t1, len }; };
  const arrive = {};
  squad.forEach((id, i) => { arrive[id] = RunOver(id, run + i * 0.7, K6(id)).t1; });
  const luoTo = Pt(-98.4, 815.0), luoLen = RouteLen(s.pos.get("Luo"), [...deckVia, luoTo]);
  const luoStart = R(Math.max(run + 3.0, Math.max(...Object.values(arrive)) + 0.6 - luoLen / 3.2));
  arrive.Luo = RunOver("Luo", luoStart, luoTo).t1;
  s.Go("LastWounded", run + 1.4, arrive.Squad1 + 0.4, K6("Squad1").x + 0.6, K6("Squad1").z + 1.4, { move: "run", path: deckVia, lie: "along" });
  const southFoot = Pt(RL.x, RB.southZ + 1.5);
  s.Cam(run, 5.0, { from: { x: -92.0, z: 760.8, h: 1.8 }, look: { actor: "Luo", offset: [0, 1.2, 0] } });
  s.Caption(run + 0.4, 3.6, "（班长他们跑过桥，踩着枕木一格一格跑；班长最后一个）");
  const onDeck = R(run + 5.0);
  s.Cam(onDeck, arrive.Luo - onDeck - 0.4, { from: { x: RL.x + 0.4, z: RB.southZ + 0.8, h: 1.6 }, look: { actor: "Luo", offset: [0, 1.3, 0] } });
  // 鬼子步兵在田里往桥头压
  for (const id of KG(ctx, "18-5", "field18")) { const p = s.pos.get(id); s.Go(id, run, run + 6.0, p.x - 4, p.z + 3, { move: "run", aim: true, faceTo: southFoot }); }
  for (let k = 0; k < 10; k++) { const id = `IjaField${(k % 6) + 1}`; Shot(s, run + 1.0 + k * 1.1, id, { volume: 0.4 }); }
  // 班长踏上南岸：后头没得人了！
  s.Say("ComeOver.02", "Luo", arrive.Luo - 0.4);
  s.Eye(arrive.Luo - 0.4, s.End("ComeOver.02") - arrive.Luo + 1.2, { stance: "stand", look: southFoot, pitch: 0 });
  void P;
  return s.Done({ durationS: s.End("ComeOver.02") + 1.0 });
}

function S1806(ctx) {
  const s = new Seq(ctx, "18-6", "炸桥：点！北头两孔钢梁断开砸进河床");
  const K = id => KXZ(ctx, "18-6", id);
  const officer = K("Officer18"), sapper = K("Sapper1");
  // 开场：班长刚踏上南岸扑到堤后；大家都在河堤后头
  s.Signal(0, SIG.bridgeBlown, false);
  s.Key("Sapper1", 0, { clip: GRIP_LITTER });
  s.Key("Officer18", 0.2, { faceTo: "Sapper1", clip: POINT });
  s.Eye(0, 0.01, { stance: "crouch", look: officer, pitch: -2 });
  s.Say("LightIt.01", "Officer18", 0.5);
  s.Eye(0.01, s.End("LightIt.01") + 0.2, { stance: "crouch", look: officer, pitch: -2 });
  const fuse = R(s.End("LightIt.01") + 0.2);
  s.Eye(fuse, 1.8, { stance: "crouch", look: sapper, pitch: -20 });
  s.Caption(fuse, 2.4, "（引线嗤嗤地烧向桥墩；大家扑到河堤后头）");
  for (const id of ["Luo", "Yaowa", "HeYoutian", "Squad1", "Squad2", "LiuWencai", "Sapper1", "Sapper2", "Officer18"]) s.Key(id, fuse + 0.4 + (id.length % 3) * 0.15, { stance: "prone", clip: null });
  // 「轰」一声：北头两孔钢梁断开砸进河床
  const boom = R(fuse + 2.6);
  s.Eye(fuse + 1.8, boom - fuse - 1.8, { stance: "prone", look: DECK(774), pitch: 3 });
  s.Ev(boom, "flash", { dur: 0.3, strength: 0.6 });
  [PIER(0), DECK(RB.northZ + SPAN_M * 0.5), PIER(1), DECK(RB.northZ + SPAN_M * 1.5)].forEach((p, i) => s.Ev(boom + i * 0.15, "explosion", { x: p.x, z: p.z, kind: "shell", radius: 6, h: 2.5 }));
  s.Sfx(boom, "shellBlast", { x: RL.x, z: RB.northZ + SPAN_M, volume: 1.0 });
  s.Ev(boom + 0.1, "smoke", { x: RL.x, z: RB.northZ + SPAN_M, kind: "SmokeWhite", dur: 6 });
  s.Ev(boom + 0.3, "smoke", { x: RL.x + 1, z: RB.northZ + SPAN_M * 0.6, kind: "SmokeDust", dur: 8 });
  s.Ev(boom + 1.2, "smoke", { x: RL.x, z: RB.northZ + SPAN_M * 1.2, kind: "SmokeBlack", dur: 20 });
  s.Shake(boom, 1.6, 0.9);
  s.Signal(boom + 0.2, SIG.bridgeBlown, true);
  s.Cam(boom, 3.4, { from: { x: -80.0, z: 815.6, h: 2.2 }, look: { x: RL.x, z: RB.northZ + SPAN_M, h: 1.0 }, shake: 0.6 });
  s.Caption(boom + 0.6, 4.4, "（「轰」一声，北头两孔钢梁断开砸进河床）");
  s.Eye(boom + 3.4, 3.4, { stance: "crouch", look: DECK(RB.northZ + SPAN_M), pitch: 2 });
  return s.Done({ durationS: boom + 7.0 });
}

function S1807(ctx) {
  const s = new Seq(ctx, "18-7", "对岸：鬼子过不来；北沙河村里几户人家亮着灯");
  const K = id => KXZ(ctx, "18-7", id);
  const luo = K("Luo");
  const bank = KG(ctx, "18-7", "northBank");
  // 鬼子涌到北岸路基上朝这边打，过不来（半过场，能转头）
  s.Eye(0, 6.0, { stance: "stand", look: RAIL_N, pitch: 1 });
  s.Caption(0.4, 4.6, "（鬼子涌到北岸路基上朝这边打，过不来——半过场，能转头）");
  for (let k = 0; k < 14; k++) { const id = bank[(k * 5) % bank.length]; Shot(s, 0.8 + k * 0.9 + ((k * 3) % 3) * 0.11, id, { volume: 0.4 }); }
  for (const [t, p] of [[3.0, Pt(-92, 811.6)], [6.4, Pt(-98, 811.8)], [10.6, Pt(-86, 811.4)]]) Puff(s, t, p);
  for (const [id, t] of [["Luo", 2.0], ["HeYoutian", 3.6], ["LiuWencai", 5.0]]) Shot(s, t, id, { volume: 0.7 });
  // 北沙河村里几户人家亮着灯
  s.Eye(6.0, 4.6, { stance: "stand", look: VILLAGE_LIGHT, pitch: 1 });
  s.Caption(6.4, 3.8, "（北沙河村里几户人家亮着灯）");
  // 班长：走！看你妈啥子，走！
  s.Key("Luo", 10.0, { faceTo: "player", aim: false, clip: WAVE_ON });
  s.Eye(10.6, 0.01, { stance: "stand", look: luo, pitch: -4 });
  s.Say("KeepMoving.01", "Luo", 11.0);
  s.Eye(10.61, s.End("KeepMoving.01") - 10.61 + 0.4, { stance: "stand", look: luo, pitch: -4 });
  const run = R(s.End("KeepMoving.01") + 0.4);
  s.Key("Luo", run, { clip: null });
  s.Caption(run, 3.6, "（往南走进黑里，身后的枪声慢慢远了）");
  ["Luo", "Yaowa", "HeYoutian", "LiuWencai", "Squad1", "Squad2", "Sapper1", "Sapper2", "Officer18", "Geng", "Nier"].forEach((id, i) => {
    s.Walk(id, run + 0.2 + i * 0.25, Pt(-88 + ((i % 3) - 1) * 0.9, 834 + (i % 4) * 1.4), { speed: 2.4, aim: false });
  });
  const P = KP(ctx, "18-7");
  const w = Walker(s, Pt(P.x, P.z), Pt(-88.4, 836), run + 0.6, run + 6.0);
  w.shot(run + 0.6, run + 6.0, { x: -88, z: 880, h: 1.2 });
  s.Sfx(run + 2.4, "rifleShot", { x: -100, z: 752, volume: 0.2 });
  s.Sfx(run + 4.0, "rifleShot", { x: -96, z: 752, volume: 0.15 });
  return s.Done({ durationS: run + 6.4 });
}

function S1808(ctx) {
  const s = new Seq(ctx, "18-8", "夜里，北门");
  const P = KP(ctx, "18-8");
  const K = id => KXZ(ctx, "18-8", id);
  const geng = K("Geng"), water = K("WaterMan");
  const column = ["Luo", "Geng", "Nier", "Yaowa", "Refugee1", "Refugee2", "HeYoutian", "LiuWencai", "Squad1", "Squad2", "AidLitter1", "Doctor"];
  // 黑场，只有脚步声；日期字幕
  s.Ev(0, "black", { dur: 6.0, fade: 0.6 });
  s.Caption(0.8, 4.4, NORTH_GATE_CAPTION);
  // 淡入：一长溜队伍在夜里往南走（镜头在队伍里走，看着前头的城门）
  const T1 = 6.0, T2 = 12.0, D1 = 8.0;
  for (const id of column) { const p = K(id); s.Place(id, T1 - 0.4, p.x, p.z - D1, { yawDeg: 180 }); s.Go(id, T1 - 0.2, T2, p.x, p.z, { move: "walk", yawDeg: 180 }); }
  s.WalkEye(T1 - 0.6, T2 - T1 + 0.6, Pt(P.x, P.z - D1), Pt(P.x, P.z), { ...NORTH_GATE, h: 3 });
  s.Caption(T1 + 0.5, 4.0, "（一长溜队伍往南走，有兵，有担架，有老百姓；老耿牵着妮儿走在里头）");
  // 幺娃：老人家，你嗯往哪儿走？老耿：进城。城里有城墙，比庄上牢靠。
  s.Key("Yaowa", T2 + 0.6, { faceTo: "Geng", clip: TALK_SLUNG });
  s.Eye(T2, 0.01, { stance: "stand", look: Lerp(geng, K("Yaowa"), 0.5), pitch: -4 });
  s.Say("NorthGate.01", "Yaowa", T2 + 1.0);
  const answer = s.Say("NorthGate.02", "Geng");
  s.Key("Geng", answer - 0.3, { faceTo: "Yaowa" });
  s.Eye(T2 + 0.01, s.End("NorthGate.02") - T2 + 0.6, { stance: "stand", look: Lerp(geng, K("Yaowa"), 0.5), pitch: -4 });
  s.Key("Yaowa", s.End("NorthGate.01") + 0.3, { clip: null });
  // 北门洞火把，连夜修工事，有人给进城的人舀水（推小车 / 舀水没有片段，站位 + 说明字）
  const T3 = R(s.End("NorthGate.02") + 0.6);
  s.Eye(T3, 4.4, { stance: "stand", look: NORTH_GATE, pitch: 4 });
  s.Caption(T3 + 0.2, 4.2, "（北门洞里点着火把；兵和老百姓推着小车往城墙上运沙土，在连夜修工事）");
  s.Go("SandCart1", T3, T3 + 3.0, NG.sandCarts[0].x, NG.sandCarts[0].z + 3.0, { move: "walk", yawDeg: 180 });
  s.Go("SandCart2", T3 + 1.0, T3 + 4.0, NG.sandCarts[1].x, NG.sandCarts[1].z + 3.0, { move: "walk", yawDeg: 180 });
  s.Key("WaterMan", T3 + 2.0, { faceTo: "player" });
  s.Eye(T3 + 4.4, 3.2, { stance: "stand", look: water, pitch: -6 });
  s.Caption(T3 + 4.6, 3.0, "（门洞边有人提着一桶水，给进城的人一人舀一瓢）");
  // 顺子进门洞，黑场
  const T5 = R(T3 + 7.6), inGate = Pt(NORTH_GATE.x, NORTH_GATE.z + 4.5), T6 = R(T5 + Dist(Pt(P.x, P.z), inGate) / 2.0);
  const w = Walker(s, Pt(P.x, P.z), inGate, T5, T6);
  w.shot(T5, T6, { x: NG.street.x, z: NG.street.toZ, h: 1.0 });
  s.Caption(T5 + 0.4, 2.4, "（顺子进了门洞）");
  for (const id of ["Luo", "Geng", "Nier", "Yaowa", "Refugee1", "Refugee2"]) s.Walk(id, T5, Pt(NORTH_GATE.x + ((id.length % 3) - 1) * 1.0, NORTH_GATE.z + 6 + (id.length % 4) * 1.2), { tArrive: T6 + 3.0, yawDeg: 180 });
  s.Ev(T6 + 0.4, "black", { dur: 5.0, fade: 1.2 });
  s.Eye(T6, 2.0, { stance: "stand", x: inGate.x, z: inGate.z, look: Pt(NG.street.x, NG.street.toZ), pitch: -2 });
  s.Caption(T6 + 2.4, 3.0, "（第一关结束）");
  return s.Done({ durationS: T6 + 6.0, then: "stay" });
}

export const SEQUENCE_BUILDERS = Object.freeze([
  S1101, S1102, S1201, S1202, S1203, S1204, S1205, S1206, S1207, S1301, S1302, S1303,
  S1401, S1402, S1403, S1404, S1405, S1406, S1501, S1502, S1503, S1601, S1701, S1702, S1703,
  S1801, S1802, S1803, S1804, S1805, S1806, S1807, S1808,
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
    title: "第一关 11–18 预演（占位动作 + 占位配音，2026-10-26 第三版：北沙河村与铁路桥）",
    source: { generator: "node Taierzhuang1938/Script_EditorBlockoutFirstLevel1218Previz.mjs --force", note: "剧本：白盒第三版契约（2026-10-26）；手改前先想好：重跑生成器会覆盖" },
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
