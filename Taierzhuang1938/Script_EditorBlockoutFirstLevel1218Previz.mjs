// ===========================================================================
// Script_EditorBlockoutFirstLevel1218Previz.mjs —— 第一关 11–18 白盒（FirstLevel1218，2026-11-02 第四版：北沙河村与铁路桥）的预演数据生成器
//
//   node Taierzhuang1938/Script_EditorBlockoutFirstLevel1218Previz.mjs            → 只校验、打印摘要，不写
//   node Taierzhuang1938/Script_EditorBlockoutFirstLevel1218Previz.mjs --force    → 写 Blockout/FirstLevel1218.previz.json
//   node Taierzhuang1938/Script_EditorBlockoutFirstLevel1218Previz.mjs --report   → 另打印每段一行摘要与用到的片段
//
// 格式：docs/Data_EditorBlockout.md §14（tengxian-blockout-previz/1）。剧本口径：集成负责人 2026-11-02 的白盒第四版契约（tmp/Contract1218_v4.md）
// 第三节「故事」逐帧；空间口径：Data_EditorBlockoutFirstLevel1218Space.mjs（第四版锚点，坐标一律从 L1218_PLACES 等取）；
// 布设：Blockout/FirstLevel1218.json（只读，单位 id 与位置以它为准，33 帧一帧一段）。
// 台词：Blockout/FirstLevel1218.voice.json 的句子 id；时长每次从清单读（配音重抽后重跑 --force 就行），同一段里按录音的
// 原始间隔 gapBeforeS 往后排（只会拉长、不会压短）。写法照第二 / 三版（切镜为主、飞机 aircraft、慢动作 slowmo、单被 dragSolo）。
//
// 第四版（2026-11-02）要点：
//   · 镜头以定镜为主（播放时缺省切镜，§14.2）：每条镜头只给一个机位 / 一个看点；走着的眼睛按路网拆成几段定镜。
//   · 11–12：身后落炮、车停村南口；顺子爬上车板凑耳边「冬瓜，撑到」；路上「钱」「舅舅的信」；炮停「看」老耿家黑烟；
//     沟口 DitchGate 七句（哨兵喝问、连长「去，喊工兵把官道桥炸了」、顺子抢上一步、「文财，你跟到他」）；黑子不走、妮儿牵过板桥、钢盔冒头机枪一响缩回去；
//     穿村不说话（二营兵扛门板抱树枝往沟口跑、标语、枕木垛、教堂门口背老人往里进）；南街口望官道桥、RiverIsTown；救护所军医塞纱布勒绷带、女娃探头、水壶拧开又拧上。
//   · 13：沟北是步兵 + 两挺十一年式 + 掷弹筒（没有装甲车）；机枪压沟沿、掷弹筒「嘭」追着战壕找人；有人往沟口跑；打到一半官道桥「轰」（GuandaoBridgeBlown 先关后开）
//     BridgeGone 三句；13-3 信号弹（flare SignalRed，t 0.8 s，FlareEffectsBrowserTest 钉着）+ 第一拨三架飞机进场 +「飞机！趴倒！」。
//   · 14：六架分两拨（A1–A3 顺战壕和沟口扔炸弹扫射，B1–B3 掉头顺着街扫、往院子里扔炸弹）；14-2 顺子不等人喊先跑（「文财！跟到他！」是冲刘文财喊的），
//     沿 官道 → 南街 → 出村小路 跑到救护所门前，路上南街那家院里的洞挨一颗（DugoutBombed 先关后开）；14-3 院门口黑子挨一梭、车翻（CartOverturned 先关后开，
//     立着的车是这一段 Spawn 的）；14-4 揪被角（妮儿 rig carryRole front + PvBlanketDragR）；14-5 松手 slowmo（窗口里没台词）+ dragSolo、弹着点扫过冬瓜；
//     14-6 老耿接角（dragSolo 回 false）拖进洞、刘文财捞走妮儿、飞机往东飞走。
//   · 15–17：洞里红天 + HoleTalk 五句；抬到厢房门口没对白；DoorPush 四句 + ShellCasings 五句（画驴、掂弹壳、老耿把脸转开、「下一副」）；
//     DoorSill 过门槛；Passed「没了」+ 单被盖脸；17-2「舅舅的信」（只亮一个 F、摸出信、塞进钱袋、退到门槛坐下）；StandUp 五句。
//   · 18：Orders3rdBn 六句 → 耳朵里响起冬瓜在防炮洞里那句（DongguaEcho.01，01 的原录音；运行时暂不支持台词音量，这里只在那条台词上写 volume / muffled 字段 + 说明字）
//     → 「……要得。」；隔壁院席子（GirlHoleCovered 先关后开）；出村 → 北岸土路 → 李子行 → 铁路桥（桥面 standOn 走道，老乡顺滑坡道下河床蹚水）；
//     南头等：担架往南走进黑地、顺子回头看那条路「……哪个管得到」、机枪压住土坎后的班长他们、NotYet 四句；玩家压机枪、「快过来！」、班长最后一个（点一下头，不说话）；
//     「点！」BridgeBlown；对岸打不过来、东北边村子那头枪声、「二营的……」「走！」；18-8 黑场 +「1938年3月14日 夜」+ 南岸路上的队伍 + 远处县城的灯，then stay。
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
  L1218_RIVER as RV, L1218_RAIL_RAMPS, L1218_CHURCH as CH, L1218_CART_PARK, L1218_BANK, L1218_ROADS, L1218_TRENCH, L1218_YARD_STRIPS,
  StripFrame, RiverPoint, RiverArcAtX,
} from "./Data_EditorBlockoutFirstLevel1218Space.mjs";
import { StreetRoute, PressPose, NIER_TAIL_RIDE, CartWorld, DOCTOR_PRESS, CART_LINE, CartOn, CART_HITCH_M } from "./Script_EditorBlockoutFirstLevel1218Keyframes.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
export const PREVIZ_FILE = join(HERE, "Blockout", "FirstLevel1218.previz.json");
const CONFIG_FILE = join(HERE, "Blockout", "FirstLevel1218.json");
const VOICE_FILE = join(HERE, "Blockout", "FirstLevel1218.voice.json");

/** 18-8 黑场上的日期字幕（契约第四版：只有日期和「夜」，没有北门）。 */
export const NIGHT_DATE = "1938年3月14日";
export const NIGHT_CAPTION = `${NIGHT_DATE} 夜`;

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
/** 折线在 x 处的 z（线性插值，x 在两端外取端点）。 */
function LineZAtX(line, x) {
  for (let i = 1; i < line.length; i++) { const a = line[i - 1], b = line[i]; if ((x >= a.x && x <= b.x) || (x <= a.x && x >= b.x)) { const k = b.x === a.x ? 0 : (x - a.x) / (b.x - a.x); return a.z + (b.z - a.z) * k; } }
  return x < line[0].x ? line[0].z : line[line.length - 1].z;
}

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
  Line(t, line, actor, extra = {}) {
    const v = this.ctx.voice.get(line);
    if (!v) throw new Error(`台词不存在：${line}`);
    const entry = { t: R(t), line };
    if (actor) entry.actor = actor;
    Object.assign(entry, extra);
    this.out.lines.push(entry);
    this.lastLineEnd = Math.max(this.lastLineEnd, R(t + v.durationS));
    return R(t + v.durationS);
  }
  /** 接着上一句按录音间隔排；at 给了且更晚就用 at。返回这句的开始时刻。extra：挂在台词条目上的额外字段。 */
  Say(line, actor, at = null, minGap = 0.15, extra = {}) {
    const v = this.ctx.voice.get(line);
    if (!v) throw new Error(`台词不存在：${line}`);
    const natural = this.lastLineEnd + Math.max(v.gapBeforeS || 0, minGap);
    const t = R(at === null ? natural : Math.max(at, natural));
    this.Line(t, line, actor, extra);
    return t;
  }
  End(line) { return R(this.out.lines.find(l => l.line === line).t + this.ctx.voice.get(line).durationS); }
  Dur(line) { return this.ctx.voice.get(line).durationS; }
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
 * at(t) = t 时刻眼睛在哪；tAt(p) = 走到离 p 最近的那一点的时刻。
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
    tAt(p) { let best = 0, bd = Infinity; for (let d = 0; d <= total; d += 0.25) { const dd = Dist(PAt(d), p); if (dd < bd) { bd = dd; best = d; } } return R(TAt(best)); },
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
// 常用点（一律从 Space 的锚点算）

const LANE_SHELL = Pt(PL.laneShell.x, PL.laneShell.z);
const VILLAGE_SHELLS = [Pt(100, 520), Pt(90, 506), Pt(108, 531), Pt(96, 514)];   // 庄子里一排排落炮（草顶烧着；z < 545 是 0610 的耿家庄）
const GENG_SMOKE = Pt(PL.gengSmoke.x, PL.gengSmoke.z);
const FIELD_SHELL = Pt(PL.fieldShell.x, PL.fieldShell.z);
const HELMETS = Pt(PL.helmetsAt.x, PL.helmetsAt.z);
const PLANK_N = Pt(PL.plankNorth.x, PL.plankNorth.z), PLANK_S = Pt(PL.plankSouth.x, PL.plankSouth.z), PLANK_MID = Pt(PL.plankMid.x, PL.plankMid.z);
const VILLAGE_FAR = Pt(110, 650);
const FLARE = Pt(PL.flareAt.x, PL.flareAt.z);
const PLANES_FROM = Pt(PL.planesFrom.x, PL.planesFrom.z);
const AID_GATE_OUT = Pt(PL.aidGateOut.x, PL.aidGateOut.z), AID_GATE_IN = Pt(PL.aidGateIn.x, PL.aidGateIn.z);
const GATE_YARD = Pt(PL.gateYard.x, PL.gateYard.z);
const HOLE_A = A.holes[0], HOLE_B = A.holes[1];
const HOLE_A_MOUTH = Pt(HOLE_A.mouth.x, HOLE_A.mouth.z);
const HOLE_A_IN = Pt(HOLE_A.mouth.x + HOLE_A.dir.x * (HOLE_A.rampM + HOLE_A.chamber.d / 2), HOLE_A.mouth.z + HOLE_A.dir.z * (HOLE_A.rampM + HOLE_A.chamber.d / 2));
const HOLE_B_MOUTH = Pt(HOLE_B.mouth.x, HOLE_B.mouth.z);
const HOLE_B_IN = Pt(HOLE_B.mouth.x + HOLE_B.dir.x * (HOLE_B.rampM + 0.6), HOLE_B.mouth.z + HOLE_B.dir.z * (HOLE_B.rampM + 0.6));
const GIRL_HOLE = Pt(GY.hole.mouth.x, GY.hole.mouth.z);
const XIANG_DOOR = Pt(PL.xiangDoor.x, PL.xiangDoor.z);
const XIANG_OUT = Pt(A.xiang.box.maxX + 1.3, A.xiang.door.z), XIANG_IN = Pt(A.xiang.box.maxX - 1.3, A.xiang.door.z);
const INSIDE = Pt(A.dongguaInside.x, A.dongguaInside.z);
const SEAT = Pt(A.thresholdSeat.x, A.thresholdSeat.z);
const YARD_MID = Pt((A.strawBox.minX + A.strawBox.maxX) / 2, (A.strawBox.minZ + A.strawBox.maxZ) / 2);
const LAMP = Pt(A.lamps[0].x, A.lamps[0].z);
const WALL_ROOT = Pt(PL.wallRootDonggua.x, PL.wallRootDonggua.z);
const CART_PARK = L1218_CART_PARK;
const CHF = StripFrame({ ...CH, side: 1 });
const ChurchAt = (sv, d) => { const p = CHF.World(sv, d); return Pt(p.x, p.z); };
const CHURCH_GATE = Pt(PL.churchGate.x, PL.churchGate.z), CHURCH_GATE_OUT = Pt(PL.churchGateOut.x, PL.churchGateOut.z);
const CHURCH_IN = ChurchAt(CH.gate.s, CH.d0 + 1.8);
const CHURCH_HALL = ChurchAt((CH.hall.s0 + CH.hall.s1) / 2, CH.hall.d0);
const STRIP = Object.fromEntries(L1218_YARD_STRIPS.map(st => [st.id, st]));
const StripAt = (id, sv, d) => { const p = StripFrame(STRIP[id]).World(sv, d); return Pt(p.x, p.z); };
const SLOGAN = StripAt("DA", STRIP.DA.s0 + STRIP.DA.widths[0] / 2, STRIP.DA.setback);           // 官道东侧第一家朝街的墙（条带 DA slogan [0]）
const SLEEPERS = StripAt("DA", STRIP.DA.s0 + STRIP.DA.widths[0] * 0.9, STRIP.DA.setback - 0.5);  // 那家门口的枕木垛
const CORNER = Pt(PL.southStreetCorner.x, PL.southStreetCorner.z);
const SOUTH_ST_WEST = Pt(PL.southStreetWest.x, PL.southStreetWest.z);
const BOMBED_HOLE = Pt(PL.bombedHole.x, PL.bombedHole.z);
const GUANDAO_MID = Pt(PL.guandaoBridgeMid.x, PL.guandaoBridgeMid.z), GUANDAO_S = Pt(PL.guandaoBridgeSouth.x, PL.guandaoBridgeSouth.z);
const TRENCH_E = x => Pt(x, LineZAtX(L1218_TRENCH.east, x));
const BERM_E = x => Pt(x, LineZAtX(L1218_TRENCH.east, x) - L1218_TRENCH.bermOffM);   // 东段战壕北沿的堆土（机枪压的「沟沿」）
const RAIL_N = Pt(PL.bridgeNorth.x, PL.bridgeNorth.z), RAIL_S = Pt(PL.bridgeSouth.x, PL.bridgeSouth.z);
const DECK = z => Pt(RL.x, z);
const SPAN_M = (RB.southZ - RB.northZ) / RB.spans;
const PIER = i => DECK(RB.northZ + SPAN_M * (i + 1));
const RAMP_N = L1218_RAIL_RAMPS[0], RAMP_S = L1218_RAIL_RAMPS[1];
const RAMP_N_FOOT = Pt(RAMP_N.from.x, RAMP_N.from.z), RAMP_N_TOP = Pt(RAMP_N.to.x, RAMP_N.to.z);
const RAMP_S_FOOT = Pt(RAMP_S.from.x, RAMP_S.from.z), RAMP_S_TOP = Pt(RAMP_S.to.x, RAMP_S.to.z);
const MG18 = Pt(PL.ijaMg18.x, PL.ijaMg18.z);
const LAST_COVER = Pt(PL.lastGroupCover.x, PL.lastGroupCover.z);
const BANK_TOP = x => Pt(x, L1218_BANK.z);
const LEVEE_PLAYER = Pt(PL.leveePlayer.x, PL.leveePlayer.z);
const SUN = Pt(PL.sunWest.x, PL.sunWest.z);
const CITY_LIGHTS = Pt(PL.cityLights.x, PL.cityLights.z);
const LIZI = Pt(PL.liziHang.x, PL.liziHang.z);
const SOUTH_ROAD = L1218_ROADS.southRoad.line;
const NORTH_BANK_ROAD = L1218_ROADS.northBank.line;
const EXIT_PATH = L1218_ROADS.exitPath.line;
const SOUTH_ROAD_DIR = (() => { const a = SOUTH_ROAD[2], b = SOUTH_ROAD[3]; const l = Dist(a, b); return { x: (b.x - a.x) / l, z: (b.z - a.z) / l }; })();
/** 沙河河床上 x 处、离中线 dOff（+ 往南）的点。 */
const RiverAt = (x, dOff) => { const p = RiverPoint(RiverArcAtX(x), dOff); return Pt(p.x, p.z); };
const SLIDE_N = RV.slides.find(sl => sl.bank === "north"), SLIDE_S = RV.slides.find(sl => sl.bank === "south");
const SLIDE_EXTRA = (SLIDE_N.lenM - RV.cliffM) / 2;
const SlideN = dOff => RiverAt(SLIDE_N.x, -(RV.halfTop + SLIDE_EXTRA) + dOff);   // dOff 从坡顶往河床算（正 = 往下）
const SlideS = dOff => RiverAt(SLIDE_S.x, RV.halfTop + SLIDE_EXTRA - dOff);
const WADE = Pt(PL.wadeAt.x, PL.wadeAt.z);

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
function Bomb(s, t, p, { radius = 4, shake = 0.6, smoke = "SmokeDust", smokeDur = 5 } = {}) {
  s.Sfx(t, "shellBlast", { x: p.x, z: p.z, volume: 0.9 });
  s.Ev(t, "explosion", { x: p.x, z: p.z, kind: "shell", radius });
  s.Ev(t + 0.2, "smoke", { x: p.x, z: p.z, kind: smoke, dur: smokeDur });
  if (shake) s.Shake(t, 0.7, shake);
  return s;
}
/** 掷弹筒一发：「嘭」出膛（筒在 at）→ flightS 秒后落在 p（小爆炸 + 土雾 + 轻震）。返回落地时刻。 */
function Mortar(s, t, actor, at, p, { flightS = 2.0, radius = 1.6, shake = 0.3 } = {}) {
  s.Sfx(t, "mortarPop", { x: at.x, z: at.z, volume: 0.6 });
  s.Ev(t, "smoke", { x: at.x, z: at.z, kind: "SmokeWhite", dur: 0.8 });
  const land = R(t + flightS);
  s.Sfx(land, "mortarImpact", { x: p.x, z: p.z, volume: 0.9 });
  s.Ev(land, "explosion", { x: p.x, z: p.z, kind: "grenade", radius });
  s.Ev(land + 0.1, "smoke", { x: p.x, z: p.z, kind: "SmokeDust", dur: 2.5 });
  if (shake) s.Shake(land, 0.5, shake);
  void actor;
  return land;
}

// ---------------------------------------------------------------------------
// 占位动作（片段名照各库清单）

const VIL = Object.freeze({ duck: "VilDuckProne", panic: "VilPanicRun" });
const TALK_SLUNG = "PvStandTalkSlung", TALK_LOW = "PvStandTalkLowRifle", TALK_CROUCH = "PvCrouchTalkRifle", COUNT_FINGERS = "PvCrouchCountFingers";
const POINT = "PvStandPointL", POINT_CROUCH = "PvCrouchPointL", WAVE_ON = "PvStandWaveOnL", HALT = "PvStandHaltL";
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
// 飞机（§14.1 aircraft）：六架分两拨，A1–A3 第一拨、B1–B3 第二拨（楔形：长机 + 两架僚机错开 dt 秒、左右各偏 dz）

const WAVE_A = Object.freeze(["Ki30A1", "Ki30A2", "Ki30A3"]), WAVE_B = Object.freeze(["Ki30B1", "Ki30B2", "Ki30B3"]);
/**
 * 一拨三架：长机按 pathLead 飞；僚机 k 的轨 = 长机轨平移（t + dt·k、z ± dz、y + dy·k）。
 * strafe 只挂长机；strafeWing 挂二号机；dive[k] 给了就在那一秒放一次俯冲声。
 */
function Wave(s, ids, pathLead, { dt = 1.3, dz = -20, dx = 0, dy = 8, strafe = null, strafeWing = null, dive = [] } = {}) {
  const offs = [[0, 0, 0, 0], [dt, dx, dz, dy], [dt * 2, dx * 2, -dz, dy * 1.5]];
  ids.forEach((id, k) => {
    const [ot, ox, oz, oy] = offs[k];
    const path = pathLead.map(w => ({ t: w.t + ot, x: w.x + ox, y: w.y + oy, z: w.z + oz }));
    const st = k === 0 ? strafe : k === 1 ? strafeWing : null;
    s.Aircraft(id, { path, ...(st && st.length ? { strafe: st } : {}), sound: { drone: true, ...(dive[k] !== undefined && dive[k] !== null ? { diveT: R(dive[k]) } : {}) } });
  });
}
/** 扫射段里弹着经过 k（0…1）的时刻。 */
const StrafeAtK = (st, k) => R(st.t0 + k * (st.t1 - st.t0));
/** 点 p 在扫射线 from→to 上的参数 k（投影）。 */
const StrafeK = (st, p) => { const dx = st.to.x - st.from.x, dz = st.to.z - st.from.z; return ((p.x - st.from.x) * dx + (p.z - st.from.z) * dz) / (dx * dx + dz * dz); };

// ---------------------------------------------------------------------------
// 11 冒着炮出村南口

function S1101(ctx) {
  const s = new Seq(ctx, "11-1", "出胡同口：身后一发炮，车停在村南口外");
  const K = id => KXZ(ctx, "11-1", id);
  const cart = K("GengCart"), heizi = K("Heizi"), cartYaw = KU(ctx, "11-1", "GengCart").yawDeg;
  s.Eye(0, 1.4, { stance: "stand", look: LANE_SHELL, pitch: 2 });
  Shell(s, 0.9, LANE_SHELL, { radius: 3.5, volume: 1.0, shake: 0.7 });
  s.Caption(0.3, 3.0, "（全班冒炮冲出窄胡同，顺子最后一个；身后一发炮落在胡同里）");
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
  s.Caption(11.8, 4.6, "（往南看：一条土路穿过麦地接上官道，官道尽头是北沙河村的树和院墙，沟口那一带有兵在动）");
  return s.Done({ durationS: 16.6 });
}

function S1102(ctx) {
  const s = new Seq(ctx, "11-2", "车动了：冬瓜，撑到；往北沙河撤");
  const P = KP(ctx, "11-2"), P2 = KP(ctx, "12-1");
  const K = id => KXZ(ctx, "11-2", id), K2 = id => KXZ(ctx, "12-1", id);
  const luo = K("Luo"), cart = K("GengCart"), cartYaw = KU(ctx, "11-2", "GengCart").yawDeg, donggua = K("Donggua");
  s.Key("Donggua", 0, { clip: LIE_WRITHE });
  // 顺子爬上车板，把冬瓜身下的单被扯平掖好，凑到耳边：冬瓜，撑到。到了就有军医。
  s.Eye(0, 1.4, { stance: "stand", look: cart, pitch: -10 });
  s.Caption(0.2, 2.8, "（顺子爬上车板，把冬瓜身下的单被扯平掖好——爬车板没有动作，眼睛直接到车板上）");
  const onBoard = CartWorld(cart, cartYaw, { x: 0.55, z: 0.1 });
  s.Say("HoldOnDonggua.01", null, 1.9);
  s.Eye(1.4, s.End("HoldOnDonggua.01") - 1.4 + 1.2, { stance: "crouch", x: onBoard.x, z: onBoard.z, look: donggua, pitch: -36 });
  s.Caption(s.End("HoldOnDonggua.01") + 0.1, 1.8, "（冬瓜没应）");
  // 跳下车。班长：往北沙河撤！七二七团在那！车拉伤员，跟斗走！（挥手）
  const down = R(s.End("HoldOnDonggua.01") + 1.2);
  s.Key("Luo", down - 0.2, { faceTo: "player", clip: WAVE_ON });
  s.Say("RetreatOrder.01", "Luo", down + 0.4);
  s.Eye(down, s.End("RetreatOrder.01") - down + 0.3, { stance: "stand", look: luo, pitch: -2 });
  const go = R(s.End("RetreatOrder.01") + 0.3);
  s.Key("Luo", go, { clip: null });
  // 车动了；全班跟车往南跑；担架员往回跑接下一副（出画）
  const d0 = CartD(cart), d1 = CartD(K2("GengCart"));
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
  const s = new Seq(ctx, "12-1", "路上：到了没得？快了；钱揣好没得、我舅的信");
  const P = KP(ctx, "12-1"), P2 = KP(ctx, "12-2");
  const K = id => KXZ(ctx, "12-1", id), K2 = id => KXZ(ctx, "12-2", id);
  s.Key("Donggua", 0, { clip: LIE_WRITHE });
  const d0 = CartD(K("GengCart")), d1 = CartD(K2("GengCart"));
  const T1 = 0.4, T2 = R(T1 + (d1 - d0) / 1.1);
  CartMove(s, T1, T2, d0, d1);
  s.Walk("Geng", T1, K2("Geng"), { tArrive: T2 });
  s.Walk("LiuWencai", T1, K2("LiuWencai"), { tArrive: T2 });
  for (const id of ["Luo", "Yaowa", "HeYoutian", "Squad1", "Squad2"]) s.Walk(id, T1 + 0.4, K2(id), { tArrive: T2, aim: false });
  const w = Walker(s, P, P2, T1, T2);
  s.Eye(0, T1, { stance: "stand", look: K("GengCart"), pitch: -4 });
  s.Caption(0.3, 3.0, "（老耿一手笼头一手鞭子；顺子在车尾扶车帮，刘文财在车另一边）");
  // 一发炮打偏落在路边麦地，土泼一车
  const mud = 3.0;
  w.shot(T1, mud - 0.2, { actor: "GengCart", offset: [0, 1.0, 0] });
  Shell(s, mud, FIELD_SHELL, { radius: 3.0, volume: 1.0, shake: 0.6, smoke: "SmokeDust", smokeDur: 5 });
  w.shot(mud - 0.2, mud + 1.8, FIELD_SHELL, { lookH: 1.2 });
  s.Caption(mud + 0.1, 3.0, "（一发炮打偏落在路边麦地，土泼一车）");
  // 冬瓜睁眼：……到了没得？顺子：快了！
  s.Say("AlmostThere.01", "Donggua", mud + 2.4);
  s.Say("AlmostThere.02", null);
  // 冬瓜（压得很低）：顺儿……钱……揣好没得？顺子（按胸口）：揣到的。冬瓜：我舅的信……也在我这儿。……莫跟别个讲。
  const money = s.Say("UnclesLetter.01", "Donggua", s.End("AlmostThere.02") + 1.2);
  const press = s.Say("UnclesLetter.02", null);
  s.Caption(press, 2.2, "（顺子隔着衣服按了按胸口）");
  const letter = s.Say("UnclesLetter.03", "Donggua");
  s.Caption(letter + 0.2, 2.4, "（冬瓜的手在自己胸口摸了摸）");
  const glance = R(letter + s.Dur("UnclesLetter.03") * 0.6);
  s.Key("LiuWencai", glance, { faceTo: "player" });
  s.Caption(glance, 2.6, "（刘文财抬眼看了顺子一下，没吭声）");
  s.Key("LiuWencai", glance + 2.4, { yawDeg: KU(ctx, "12-2", "LiuWencai").yawDeg });
  w.shot(mud + 1.8, money - 0.2, { actor: "Donggua", offset: [0, 0.6, 0] });
  w.shot(money - 0.2, glance, { actor: "Donggua", offset: [0, 0.6, 0] });
  w.shot(glance, s.End("UnclesLetter.03") + 0.6, { actor: "LiuWencai", offset: [0, 1.4, 0] });
  const task = R(s.End("UnclesLetter.03") + 0.6);
  s.Caption(task, 2.6, "（任务字：跟车进北沙河村）");
  w.shot(task, Math.max(T2, task + 2.0), { actor: "Heizi", offset: [0, 1.0, 0] });
  return s.Done({ durationS: Math.max(T2, task + 2.0) + 0.4 });
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
  s.Say("LookBack.01", "LiuWencai", 7.6);
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
  return s.Done({ durationS: T2 + 0.4 });
}

function S1203(ctx) {
  const s = new Seq(ctx, "12-3", "沟口：站到！哪部分的？——去，喊工兵把官道桥炸了");
  const K = id => KXZ(ctx, "12-3", id);
  const P = KP(ctx, "12-3");
  const sentry = K("Sentry"), captain = K("Captain"), luo = K("Luo"), liu = K("LiuWencai");
  s.Key("Donggua", 0, { clip: LIE_WRITHE });
  // 官道走到头是一道比人深的沟；沟那边的杂木堆、门板搭的板桥；二营的兵还在往杂木堆上添树枝
  s.Eye(0, 3.8, { stance: "stand", look: PLANK_MID, pitch: -8 });
  s.Caption(0.3, 3.8, "（官道走到头是一道比人深的沟，把路齐齐截断；沟那边堆着枣树枝和杂木，只留几块门板搭的板桥，刚够一辆车）");
  for (const id of ["Branch1", "Branch2"]) s.Key(id, 0, { clip: KNEEL_DIG });
  s.Eye(3.8, 3.2, { stance: "stand", look: K("Branch2"), pitch: -2 });
  s.Caption(4.0, 3.2, "（沟沿上二营的兵还在往杂木堆上添树枝；沟后头是战壕和铁丝网）");
  // 哨兵端枪：站到！哪部分的？
  s.Key("Sentry", 6.6, { faceTo: "player", clip: HALT });
  s.Eye(7.0, 0.01, { stance: "stand", look: sentry, pitch: 0 });
  s.Say("DitchGate.01", "Sentry", 7.3);
  // 班长：前头撤下来的！车上是伤兵！后头鬼子撵过来了，还有小铁车！
  s.Key("Luo", s.End("DitchGate.01") - 0.2, { faceTo: "Sentry", clip: TALK_LOW });
  const answer = s.Say("DitchGate.02", "Luo");
  s.Eye(7.01, answer - 7.01 - 0.2, { stance: "stand", look: sentry, pitch: 0 });
  s.Eye(answer - 0.2, s.End("DitchGate.02") - answer + 0.5, { stance: "stand", look: Lerp(luo, sentry, 0.4), pitch: 0 });
  s.Key("Sentry", s.End("DitchGate.02") + 0.2, { clip: null, aim: false });
  // 二营连长过来扫一眼车上：晓得。沟就是挖给铁王八的。
  const come = Pt(captain.x + 0.3, captain.z + 0.6);
  s.Go("Captain", answer, s.End("DitchGate.02") + 0.4, come.x, come.z, { move: "walk", faceTo: "GengCart" });
  s.Key("Captain", s.End("DitchGate.02") + 0.6, { clip: TALK_SLUNG });
  const know = s.Say("DitchGate.03", "Captain", s.End("DitchGate.02") + 0.9);
  s.Eye(s.End("DitchGate.02") + 0.3, s.End("DitchGate.03") - s.End("DitchGate.02") - 0.3 + 0.1, { stance: "stand", look: come, pitch: 1 });
  // （冲身后）去，喊工兵把官道桥炸了！—— 一个兵应声顺主街往村东南跑
  s.Spawn("Messenger", { side: "nra", x: 103.6, z: 647.4, yawDeg: 20 }, { visible: true });
  s.Key("Captain", s.End("DitchGate.03") + 0.1, { faceTo: "Messenger", clip: POINT });
  const order = s.Say("DitchGate.04", "Captain");
  s.Eye(s.End("DitchGate.03") + 0.1, s.End("DitchGate.04") - s.End("DitchGate.03") + 0.3, { stance: "stand", look: Lerp(come, Pt(103.6, 647.4), 0.5), pitch: 0 });
  s.Walk("Messenger", s.End("DitchGate.04"), Pt(160, 756), { move: "run", speed: 3.4, aim: false });
  s.Caption(s.End("DitchGate.04") + 0.1, 2.6, "（一个兵应声，顺主街往村东南跑去）");
  // （冲班长）伤兵往村西南头送，救护所在那。你们几个留到这儿，后头还有人要撤进来。
  s.Key("Captain", s.End("DitchGate.04") + 0.4, { faceTo: Pt(100, 800), clip: POINT });
  const where = s.Say("DitchGate.05", "Captain", s.End("DitchGate.04") + 0.8);
  s.Key("Captain", where + s.Dur("DitchGate.05") * 0.45, { faceTo: "Luo", clip: TALK_SLUNG });
  s.Eye(s.End("DitchGate.04") + 0.4, s.End("DitchGate.05") - s.End("DitchGate.04") - 0.4 + 0.1, { stance: "stand", look: come, pitch: 1 });
  // 顺子（抢上一步）：班长，我送冬瓜过去！
  const step = Along(P, Frame(P, luo).f, 0.7);
  const ask = s.Say("DitchGate.06", null, s.End("DitchGate.05") + 0.3);
  s.Caption(ask - 0.2, 2.2, "（顺子抢上一步）");
  s.Key("Luo", ask - 0.1, { faceTo: "player", clip: null });
  s.Eye(s.End("DitchGate.05") + 0.1, s.End("DitchGate.06") - s.End("DitchGate.05") - 0.1 + 0.2, { stance: "stand", x: step.x, z: step.z, look: luo, pitch: -2 });
  // 班长看他一会儿，又看刘文财。班长：文财，你跟到他。送到了，两个都给老子回来。
  const think = R(s.End("DitchGate.06") + 0.2);
  s.Caption(think, 2.4, "（班长看了他一会儿，又看刘文财）");
  s.Key("Luo", think + 1.2, { faceTo: "LiuWencai" });
  s.Key("Luo", think + 2.2, { faceTo: "LiuWencai", clip: TALK_LOW });
  const tell = s.Say("DitchGate.07", "Luo", think + 2.5);
  s.Key("Luo", tell + s.Dur("DitchGate.07") * 0.5, { faceTo: "player" });
  s.Key("LiuWencai", tell + 0.3, { faceTo: "Luo" });
  s.Eye(think, tell - think + s.Dur("DitchGate.07") + 0.4, { stance: "stand", x: step.x, z: step.z, look: Lerp(luo, liu, 0.35), pitch: -2 });
  const done = R(s.End("DitchGate.07") + 0.4);
  s.Key("Luo", done, { clip: null });
  s.Key("Captain", done - 0.6, { clip: null });
  s.Caption(done, 2.4, "（连长交代完就走）");
  s.Go("Captain", done, done + 3.0, captain.x + 3.6, captain.z + 1.6, { move: "walk", yawDeg: -90 });
  s.Eye(done, 3.2, { stance: "stand", x: step.x, z: step.z, look: K("Heizi"), pitch: -6 });
  void know; void order;
  return s.Done({ durationS: done + 3.4 });
}

function S1204(ctx) {
  const s = new Seq(ctx, "12-4", "黑子不走：妮儿捧住它的脸，牵它过板桥；钢盔冒头");
  const K = id => KXZ(ctx, "12-4", id);
  const cart = K("GengCart"), heizi = K("Heizi"), nierHead = K("Nier"), cartYaw = KU(ctx, "12-4", "GengCart").yawDeg;
  // 开场妮儿还坐在车尾沿上（预演键 ride 挂回车尾；关键帧里她已在驴头前）
  s.Key("Nier", 0, { ride: { ...NIER_TAIL_RIDE } });
  s.Key("Donggua", 0, { clip: LIE_WRITHE });
  for (const id of ["Helmet1", "Helmet2", "Helmet3"]) s.Key(id, 0, { visible: false });
  s.Key("Geng", 0, { faceTo: "Heizi" });
  // 黑子到板桥头低头看沟，四条腿一撑不走；老耿抽它，它往后坐
  s.Eye(0, 3.4, { stance: "stand", look: heizi, pitch: -8 });
  s.Caption(0.3, 3.2, "（黑子到板桥头低头看沟，四条腿一撑不走）");
  for (const id of ["GengCart", "Heizi"]) s.Shift(id, 1.6, 2.6, 0, -0.6, { yawDeg: cartYaw });
  s.Say("BalkingMule.01", "Geng", 2.8);
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
  s.Caption(offT + 2.6, 3.4, "（两手捧住它的脸、脑门贴上去——程序化身体没有这动作，说明字顶）");
  // 攥着笼头上了板桥，黑子跟她过去；从这起妮儿牵着黑子走最前头
  const go = R(offT + 6.0), d0 = CartD(Pt(cart.x, cart.z - 0.6)), d1 = d0 + 10.6, T2 = R(go + 10.6 / 1.1);
  CartMove(s, go, T2, d0, d1, { lead: "Nier" });
  s.Go("Geng", go + 0.4, T2, CartOn(d1).cart.x, CartOn(d1).cart.z - 2.6, { move: "walk", path: [Pt(PLANK_N.x, PLANK_N.z - 1.2)], yawDeg: 180 });
  s.Go("LiuWencai", go + 0.6, T2, CartOn(d1).cart.x, CartOn(d1).cart.z - 4.2, { move: "walk", path: [Pt(PLANK_N.x - 0.4, PLANK_N.z - 2.4)], yawDeg: 180 });
  s.Eye(go, 3.4, { stance: "stand", look: PLANK_S, pitch: -6 });
  s.Caption(go + 0.2, 3.4, "（妮儿攥着笼头上了板桥，黑子跟她过去。从这起妮儿牵着黑子走最前头）");
  // 身后耿家庄村南口冒出两三顶钢盔；沟沿上二营的机枪一响，钢盔缩回去
  const peek = R(go + 3.6);
  for (const [id, dt] of [["Helmet1", 0], ["Helmet2", 0.3], ["Helmet3", 0.5]]) s.Key(id, peek + dt, { visible: true });
  s.Eye(peek - 0.2, 3.6, { stance: "stand", look: HELMETS, pitch: 1 });
  s.Caption(peek + 0.2, 2.6, "（身后耿家庄村南口冒出两三顶钢盔）");
  const burst = peek + 1.6;
  MgBurst(s, burst, "Mg727", KXZ(ctx, "12-4", "Mg727"), { count: 12, volume: 0.9, puffs: LinePts(Pt(113.6, 549.6), Pt(120.4, 548.4), 5), sweepS: 0.8 });
  for (const [id, dt] of [["Helmet1", 0.9], ["Helmet2", 1.0], ["Helmet3", 1.2]]) s.Key(id, burst + dt, { visible: false });
  s.Caption(burst + 0.4, 2.4, "（沟沿上二营的机枪一响，钢盔缩回去）");
  s.Eye(peek + 3.4, 2.0, { stance: "stand", look: PLANK_S, pitch: -4 });
  return s.Done({ durationS: Math.max(T2, peek + 5.4) + 0.4 });
}

function S1205(ctx) {
  const s = new Seq(ctx, "12-5", "穿村：扛门板的兵往沟口跑、大字标语、枕木垛、教堂门口");
  const P = KP(ctx, "12-5");
  const K = id => KXZ(ctx, "12-5", id);
  s.Key("Donggua", 0, { clip: LIE_WRITHE });
  // 二营的兵扛门板、抱树枝顺主街往沟口跑（迎面过去）
  s.Eye(0, 3.2, { stance: "stand", look: K("Board1"), pitch: -2 });
  s.Caption(0.3, 3.2, "（官道就是村里的主街，斜着往东南穿过去；二营的兵扛着门板、抱着树枝迎面往沟口跑——扛东西没有动作，说明字顶）");
  for (const [id, dt] of [["Board1", 0.4], ["Board2", 0.9], ["Branch3", 1.3]]) s.Walk(id, dt, Pt(104 + (id.length % 3) * 0.8, 652.4), { move: "run", speed: 3.2 });
  // 墙上刷着大字标语；门口码着枕木垛
  s.Eye(3.2, 3.0, { stance: "stand", look: SLOGAN, pitch: 3 });
  s.Caption(3.4, 3.0, "（墙上刷着大字标语「打倒日本帝国主义」）");
  s.Eye(6.2, 2.8, { stance: "stand", look: SLEEPERS, pitch: -6 });
  s.Caption(6.4, 2.8, "（门口码着一垛铁路上拆来的枕木当柴）");
  // 路过教堂门口：有人背着老人往里进
  s.Eye(9.0, 5.0, { stance: "stand", look: CHURCH_GATE_OUT, pitch: 0 });
  s.Caption(9.2, 4.6, "（路过教堂门口：有人背着老人往里进——背人没有动作，并排走；门边有人张罗着放人）");
  ["ElderCarrier", "ChurchIn2"].forEach((id, i) => {
    const to = Pt(CHURCH_IN.x - 1.0 - i * 1.1, CHURCH_IN.z + 0.4 + i * 0.9);
    s.Go(id, 9.4 + i * 0.8, 13.6 + i * 0.8, to.x, to.z, { move: "walk", path: [CHURCH_GATE_OUT, CHURCH_GATE], faceTo: CHURCH_HALL });
  });
  s.Key("ChurchKeeper", 9.0, { faceTo: "ElderCarrier" });
  // 车接着顺主街往东南走一段；顺子跟车（不说话）
  const go = 14.0, d0 = CartD(K("GengCart")), d1 = d0 + 14, T2 = R(go + 14 / 1.3);
  CartMove(s, go, T2, d0, d1, { lead: "Nier" });
  s.Walk("Geng", go, Off(CartOn(d1).heizi, 1.0, -0.8), { tArrive: T2 });
  s.Walk("LiuWencai", go, Off(CartOn(d1).cart, -1.0, 0.8), { tArrive: T2 });
  const w = Walker(s, P, Off(CartOn(d1).cart, -1.4, -1.8), go, T2);
  w.shot(go, T2, { actor: "GengCart", offset: [0, 1.0, 0] });
  return s.Done({ durationS: T2 + 0.4 });
}

function S1206(ctx) {
  const s = new Seq(ctx, "12-6", "南街口：过了河就是县城嗦？车往西拐进南街");
  const P = KP(ctx, "12-6");
  const K = id => KXZ(ctx, "12-6", id);
  const donggua = K("Donggua");
  s.Key("Donggua", 0, { clip: LIE_WRITHE });
  // 顺官道往东南望得见河、官道桥，几个兵抱着东西往桥上跑
  s.Eye(0, 4.2, { stance: "stand", look: GUANDAO_MID, pitch: 0 });
  s.Caption(0.3, 4.0, "（南街口。顺官道往东南望得见河和官道桥，几个兵抱着东西往桥上跑）");
  const runnerTo = { BridgeRunner4: Pt(250.4, 852.2), BridgeRunner1: Pt(261.4, 875.6), BridgeRunner2: Pt(264.2, 882.8), BridgeRunner3: Pt(266.8, 889.6) };
  for (const [id, to] of Object.entries(runnerTo)) s.Go(id, 0.4 + (id.length % 2) * 0.3, 7.6 + (id.length % 2) * 0.3, to.x, to.z, { move: "run", yawDeg: Yaw(K(id), to) });
  // 冬瓜：……过了河……就是县城嗦？顺子（顺着他的眼看了一眼桥）：嗯。过了河就是。
  s.Eye(4.2, 0.01, { stance: "stand", look: donggua, pitch: -20 });
  const ask = s.Say("RiverIsTown.01", "Donggua", 4.6);
  s.Eye(4.21, s.End("RiverIsTown.01") - 4.21 + 0.1, { stance: "stand", look: donggua, pitch: -20 });
  const yes = s.Say("RiverIsTown.02", null);
  s.Eye(s.End("RiverIsTown.01") + 0.1, s.End("RiverIsTown.02") - s.End("RiverIsTown.01") + 0.5, { stance: "stand", look: GUANDAO_MID, pitch: 0 });
  // 车往西拐进南街
  const go = R(s.End("RiverIsTown.02") + 0.6), d0 = CartD(K("GengCart")), d1 = d0 + 12, T2 = R(go + 12 / 1.3);
  CartMove(s, go, T2, d0, d1, { lead: "Nier" });
  s.Walk("Geng", go, Off(CartOn(d1).heizi, 0.4, 1.3), { tArrive: T2 });
  s.Walk("LiuWencai", go, Off(CartOn(d1).cart, 0.4, -1.3), { tArrive: T2 });
  s.Caption(go + 0.2, 3.0, "（车往西拐进南街，去村西南头的救护所）");
  const w = Walker(s, P, Off(CartOn(d1).cart, 2.0, 0.8), go, T2);
  w.shot(go, T2, { actor: "Heizi", offset: [0, 1.0, 0] });
  void ask; void yes;
  return s.Done({ durationS: T2 + 0.4 });
}

function S1207(ctx) {
  const s = new Seq(ctx, "12-7", "救护所：肚子上的，莫给他喝水；水……先生说的，莫喝");
  const K = id => KXZ(ctx, "12-7", id);
  const P = KP(ctx, "12-7");
  const doctor = K("Doctor"), girl = K("Girl"), blanket = K("BlanketDonggua"), liu = K("LiuWencai");
  s.Key("Girl", 0, { visible: false });
  s.Key("Donggua", 0, { clip: LIE_WRITHE });
  s.Key("Bearer1", 0, { faceTo: "Doctor" });
  s.Key("Bearer2", 0, { faceTo: "Doctor" });
  // 院里地上躺满了
  s.Eye(0, 3.2, { stance: "stand", look: YARD_MID, pitch: -8 });
  s.Caption(0.3, 3.0, "（村西南头二营借的大院，院里铺着麦秸，躺满了人）");
  // 军医满手是血，蹲下掀开冬瓜被角、撕开衣襟，抓一把纱布往伤口里塞（冬瓜疼得一挺），拿绷带一圈圈勒紧
  s.Key("Doctor", 0, { stance: "crouch", clip: MEDIC_PRESS, faceTo: "Donggua" });
  s.Eye(3.2, 4.6, { stance: "stand", look: blanket, pitch: -26 });
  s.Caption(3.4, 4.4, "（军医满手是血，蹲下掀开冬瓜被角、撕开衣襟，抓一把纱布往伤口里塞——冬瓜疼得一挺——拿绷带一圈圈勒紧）");
  s.Key("Donggua", 5.0, { clip: LIE_WRITHE });
  // 军医：肚子上的，莫给他喝水。（冲担架员）搁墙根。天黑了跟车送城里，城里才开得了刀。
  s.Say("AidDoctor.01", "Doctor", 7.9);
  s.Eye(7.8, s.End("AidDoctor.01") - 7.8 + 0.2, { stance: "stand", look: doctor, pitch: -22 });
  s.Key("Doctor", s.End("AidDoctor.01") + 0.1, { stance: "stand", clip: null, faceTo: "Bearer1" });
  const put = s.Say("AidDoctor.02", "Doctor");
  s.Eye(s.End("AidDoctor.01") + 0.2, s.End("AidDoctor.02") - s.End("AidDoctor.01") - 0.2 + 0.1, { stance: "stand", look: doctor, pitch: -6 });
  // 顺子：天黑哪个送？军医（已经去看下一个）：哪个闲到哪个送。顺子：我送！（刘文财看了他一眼）
  const who = s.Say("AidDoctor.03", null, s.End("AidDoctor.02") + 0.2);
  s.Go("Doctor", who - 0.2, who + 7.0, DOCTOR_PRESS.x, DOCTOR_PRESS.z, { move: "walk", yawDeg: DOCTOR_PRESS.yawDeg });
  s.Key("Doctor", who + 7.2, { stance: "crouch", clip: MEDIC_PRESS });
  const idle = s.Say("AidDoctor.04", "Doctor");
  s.Caption(idle - 0.2, 2.4, "（军医已经去看下一个了，头也不回）");
  const me = s.Say("AidDoctor.05", null);
  s.Cam(who, s.End("AidDoctor.05") - who + 0.3, { from: { x: P.x, z: P.z, h: 1.6 }, look: { actor: "Doctor", offset: [0, 1.4, 0] } });
  s.Key("LiuWencai", me + 0.4, { faceTo: "player" });
  s.Caption(me + 0.3, 2.2, "（刘文财看了他一眼）");
  // 冬瓜连单被搁在墙根；隔壁塌了半截的墙那边，女娃家洞口探出一个跟妮儿差不多大的女娃，妮儿看着她
  const peek = R(s.End("AidDoctor.05") + 0.8);
  s.Caption(peek - 0.4, 2.4, "（冬瓜连单被搁在东墙根）");
  s.Key("Girl", peek, { visible: true });
  s.Key("Nier", peek + 0.6, { faceTo: "Girl" });
  s.Eye(s.End("AidDoctor.05") + 0.3, peek - s.End("AidDoctor.05") - 0.3 + 0.4, { stance: "stand", look: blanket, pitch: -26 });
  s.Eye(peek + 0.4, 4.0, { stance: "stand", look: girl, pitch: -6 });
  s.Caption(peek + 0.6, 3.8, "（隔壁塌了半截的墙那边，女娃家洞口探出一个跟妮儿差不多大的女娃；妮儿看着她）");
  // 冬瓜（嘴唇起壳）：……水……（顺子摘下水壶拧开，停住，又拧上）顺子：先生说的，莫喝。
  const sit = Pt(P.x - 0.6, P.z + 1.2);
  s.Eye(peek + 4.4, 0.01, { stance: "crouch", x: sit.x, z: sit.z, look: blanket, pitch: -30 });
  const water = s.Say("AidWater.01", "Donggua", peek + 4.8);
  s.Caption(s.End("AidWater.01") + 0.1, 2.8, "（顺子摘下水壶拧开，停住，又拧上）");
  const no = s.Say("AidWater.02", null, s.End("AidWater.01") + 2.6);
  // 冬瓜（扯了一下嘴角）：……这下好……你跟斗伤兵走……哪个管得到。
  const joke = s.Say("AidWater.03", "Donggua");
  s.Caption(joke - 0.1, 2.0, "（冬瓜扯了一下嘴角）");
  s.Eye(peek + 4.41, s.End("AidWater.03") - peek - 4.41 + 0.2, { stance: "crouch", x: sit.x, z: sit.z, look: blanket, pitch: -30 });
  // 刘文财：走了。班长等到的。（顺子蹲着不动）刘文财（揪住他胳膊）：顺儿。
  s.Key("LiuWencai", s.End("AidWater.03"), { faceTo: "player", clip: TALK_SLUNG });
  const leave = s.Say("AidWater.04", "LiuWencai", s.End("AidWater.03") + 0.4);
  s.Caption(s.End("AidWater.04") + 0.1, 1.8, "（顺子蹲着不动）");
  const grab = s.Say("AidWater.05", "LiuWencai", s.End("AidWater.04") + 1.6);
  s.Caption(grab - 0.3, 2.0, "（刘文财揪住他胳膊）");
  s.Eye(s.End("AidWater.03") + 0.2, s.End("AidWater.05") - s.End("AidWater.03") - 0.2 + 0.1, { stance: "crouch", x: sit.x, z: sit.z, look: liu, pitch: 4 });
  s.Key("LiuWencai", s.End("AidWater.05") + 0.2, { clip: null });
  // 顺子（冲冬瓜）：天黑我就来。天黑我送你进城。—— 被刘文财拽出院门
  const promise = s.Say("AidWater.06", null, s.End("AidWater.05") + 0.3);
  s.Eye(s.End("AidWater.05") + 0.1, s.End("AidWater.06") - s.End("AidWater.05") - 0.1 + 0.2, { stance: "stand", x: sit.x, z: sit.z, look: blanket, pitch: -30 });
  const out = R(s.End("AidWater.06") + 0.2), T2 = R(out + 4.0);
  s.Caption(out, 2.6, "（被刘文财拽出院门）");
  s.Walk("LiuWencai", out, Off(AID_GATE_OUT, 1.6, -0.8), { tArrive: T2 - 0.4 });
  const w = Walker(s, sit, Off(AID_GATE_OUT, 2.6, 0.6), out, T2, { h: 1.5 });
  w.shot(out, T2, { actor: "LiuWencai", offset: [0, 1.4, 0] });
  s.Caption(T2, 2.6, "（任务字：回沟口）");
  s.Eye(T2, 2.6, { stance: "stand", x: AID_GATE_OUT.x + 2.6, z: AID_GATE_OUT.z + 0.6, look: Pt(121, 790), pitch: 0 });
  void put; void water; void no; void leave; void promise;
  return s.Done({ durationS: T2 + 2.8 });
}

// ---------------------------------------------------------------------------
// 13 沟口

function S1301(ctx) {
  const s = new Seq(ctx, "13-1", "回沟口：步兵散在坟头后，两挺机枪压沟沿，掷弹筒追着战壕找人");
  const K = id => KXZ(ctx, "13-1", id);
  const mg1 = K("IjaMg1"), mg2 = K("IjaMg2"), gren = K("IjaGrenadier"), luo = K("Luo");
  // 顺子、刘文财跳回沟口东段战壕挨着班长
  s.Eye(0, 2.4, { stance: "stand", look: luo, pitch: -4 });
  s.Caption(0.3, 2.4, "（顺子、刘文财跳回沟口东段战壕，挨着班长）");
  // 追兵顺官道撵过来：就是耿家庄撵出来那伙步兵，散在坟头后、田埂后
  s.Eye(2.4, 4.0, { stance: "stand", look: K("IjaOfficer"), pitch: 1 });
  s.Caption(2.6, 3.8, "（追兵顺官道撵过来了：就是耿家庄撵出来那伙步兵，两挺轻机枪、一具掷弹筒，散在坟头后、田埂后）");
  for (const [k, id] of [[2.8, "IjaInf1"], [3.6, "IjaInf3"], [4.4, "IjaInf6"], [5.4, "IjaInf2"]]) Shot(s, k, id, { volume: 0.45 });
  // 机枪压沟沿：一扫就得缩头（眼睛蹲低）
  const sweep1 = 6.4;
  MgBurst(s, sweep1, "IjaMg1", mg1, { count: 14, volume: 0.9, puffs: LinePts(BERM_E(112), BERM_E(134), 9), sweepS: 1.6 });
  s.Eye(6.4, 2.0, { stance: "stand", look: mg1, pitch: 1, shake: 0.3 });
  s.Eye(8.4, 2.0, { stance: "crouch", look: mg1, pitch: -14, shake: 0.2 });
  s.Caption(6.8, 3.4, "（机枪压沟沿：一扫就得缩头）");
  // 掷弹筒「嘭」追着战壕找人
  const pop1 = 10.4;
  Mortar(s, pop1, "IjaGrenadier", gren, Off(BERM_E(128), 0, -0.6));
  s.Eye(10.4, 3.0, { stance: "crouch", look: gren, pitch: 2, shake: 0.2 });
  s.Caption(10.6, 3.4, "（掷弹筒「嘭」一声，追着战壕找人）");
  Mortar(s, pop1 + 4.2, "IjaGrenadier", gren, Off(TRENCH_E(116), 0, 2.2));
  s.Eye(13.4, 2.2, { stance: "crouch", look: TRENCH_E(116), pitch: -10, shake: 0.4 });
  // 玩家真打：打坟头后露头的步兵
  const fight = 15.6;
  s.Eye(fight, 8.0, { stance: "stand", look: K("IjaInf3"), pitch: 1, shake: 0.12 });
  s.Caption(fight, 3.6, "（玩家这时在真打：打坟头后、田埂后露头的步兵）");
  for (const [k, id] of [[0.6, "player"], [1.8, "player"], [3.0, "player"], [1.2, "Luo"], [2.4, "Yaowa"], [3.6, "HeYoutian"], [4.4, "Squad1"], [5.2, "player"]]) Shot(s, fight + k, id, { volume: id === "player" ? 0.9 : 0.6 });
  for (const [k, id] of [[0.9, "IjaInf1"], [2.0, "IjaInf4"], [3.3, "IjaInf5"], [4.6, "IjaInf7"]]) Shot(s, fight + k, id, { volume: 0.45 });
  MgBurst(s, fight + 5.6, "IjaMg2", mg2, { count: 12, volume: 0.8, puffs: LinePts(BERM_E(108), BERM_E(126), 7), sweepS: 1.2 });
  Mortar(s, fight + 6.2, "IjaGrenadier", gren, Off(BERM_E(136), 0.4, 0.4));
  s.Eye(fight + 8.0, 2.6, { stance: "crouch", look: mg2, pitch: -12, shake: 0.2 });
  return s.Done({ durationS: fight + 10.8 });
}

function S1302(ctx) {
  const s = new Seq(ctx, "13-2", "有人往沟口跑；打到一半村子东南「轰」——官道桥炸了");
  const K = id => KXZ(ctx, "13-2", id), K3 = id => KXZ(ctx, "13-3", id);
  const mg1 = K("IjaMg1"), mg2 = K("IjaMg2"), shouter = K("S727_E1"), liu = K("LiuWencai");
  // 开场官道桥还在（关键帧 13-2 本来就炸了）
  s.Signal(0, SIG.guandaoBridgeBlown, false);
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
  s.Eye(3.0, 3.6, { stance: "stand", look: PLANK_N, pitch: -6 });
  s.Caption(3.4, 3.4, "（有的倒在半路，有的扑上板桥爬过来）");
  // 鬼子朝跑的人开枪；机枪扫沟沿
  for (const [k, id] of [[1.0, "IjaInf3"], [2.4, "IjaInf5"], [3.2, "IjaInf1"], [4.0, "IjaInf2"], [5.6, "IjaInf4"], [7.0, "IjaInf6"]]) Shot(s, k, id, { volume: 0.45 });
  MgBurst(s, 6.6, "IjaMg1", mg1, { count: 12, volume: 0.9, puffs: LinePts(BERM_E(110), BERM_E(126), 7), sweepS: 1.2 });
  s.Eye(6.6, 2.4, { stance: "crouch", look: mg1, pitch: -14, shake: 0.25 });
  for (const [k, id] of [[7.2, "player"], [7.9, "Luo"], [8.6, "player"]]) Shot(s, k, id, { volume: id === "player" ? 0.9 : 0.6 });
  // 打到一半：村子东南「轰」一声，房顶后头冲起一柱土烟（官道桥炸了）
  const boom = 9.4;
  s.Sfx(boom, "shellBlast", { x: GUANDAO_MID.x, z: GUANDAO_MID.z, volume: 0.75 });
  s.Ev(boom, "explosion", { x: GUANDAO_MID.x, z: GUANDAO_MID.z, kind: "shell", radius: 9, h: 1.5 });
  // 桥在 260 m 外、隔着整个村子（北街房顶在沟里看是仰角 7° 左右，要冒过 31 m 才露头）：烟放大 6 倍、冒到四十米；
  // 炸药掀起的土柱一出来就是整根（prewarm），黑烟跟着慢慢往上冒
  s.Ev(boom + 0.1, "smoke", { x: GUANDAO_MID.x, z: GUANDAO_MID.z, kind: "SmokeDust", dur: 14, scale: 6, prewarm: true });
  s.Ev(boom + 0.6, "smoke", { x: GUANDAO_MID.x + 1.5, z: GUANDAO_MID.z - 1, kind: "SmokeBlack", dur: 40, scale: 6 });
  s.Shake(boom, 0.8, 0.35);
  s.Signal(boom + 0.1, SIG.guandaoBridgeBlown, true);
  s.Eye(boom, 0.01, { stance: "crouch", look: GUANDAO_MID, pitch: 10 });
  s.Caption(boom + 0.2, 3.0, "（村子东南「轰」一声，房顶后头冲起一柱土烟）");
  // 二营的兵：官道桥炸了！顺子（扭头看那股烟，低声）：……桥。刘文财：看你妈啥子！打！
  s.Key("S727_E1", boom + 0.8, { aim: false, faceTo: GUANDAO_MID, clip: POINT });
  const gone = s.Say("BridgeGone.01", "S727_E1", boom + 1.2);
  s.Eye(boom + 0.01, gone - boom - 0.01, { stance: "stand", look: GUANDAO_MID, pitch: 8 });
  s.Eye(gone, s.Dur("BridgeGone.01") + 0.2, { stance: "stand", look: shouter, pitch: 0 });
  const bridge = s.Say("BridgeGone.02", null, s.End("BridgeGone.01") + 0.5);
  s.Caption(bridge - 0.3, 2.4, "（顺子扭头看那股烟）");
  s.Eye(s.End("BridgeGone.01") + 0.2, s.End("BridgeGone.02") - s.End("BridgeGone.01") - 0.2 + 0.2, { stance: "stand", look: GUANDAO_MID, pitch: 8 });
  Shot(s, s.End("BridgeGone.02") - 0.1, "LiuWencai", { volume: 0.7 });
  const hit = s.Say("BridgeGone.03", "LiuWencai", s.End("BridgeGone.02") + 0.3);
  s.Key("LiuWencai", hit, { faceTo: "player" });
  s.Eye(s.End("BridgeGone.02") + 0.2, s.End("BridgeGone.03") - s.End("BridgeGone.02") - 0.2 + 0.3, { stance: "stand", look: liu, pitch: -2, shake: 0.1 });
  s.Key("S727_E1", s.End("BridgeGone.01") + 0.4, { clip: null, aim: true, faceTo: mg2 });
  s.Key("LiuWencai", hit + 1.2, { faceTo: mg2 });
  // 接着打：机枪又扫一梭，一时谁也过不去
  const back = R(s.End("BridgeGone.03") + 0.3);
  for (const [k, id] of [[0.4, "player"], [1.0, "Yaowa"], [1.6, "player"], [2.2, "Squad1"]]) Shot(s, back + k, id, { volume: id === "player" ? 0.9 : 0.6 });
  s.Eye(back, 2.6, { stance: "stand", look: mg2, pitch: 1, shake: 0.12 });
  MgBurst(s, back + 2.4, "IjaMg2", mg2, { count: 10, volume: 0.8, puffs: LinePts(BERM_E(106), BERM_E(124), 6), sweepS: 1.0 });
  s.Eye(back + 2.6, 2.6, { stance: "crouch", look: mg2, pitch: -14, shake: 0.2 });
  s.Caption(back + 2.8, 2.4, "（一时谁也过不去）");
  return s.Done({ durationS: Math.max(back + 5.4, 21.0) });
}

function S1303(ctx) {
  const s = new Seq(ctx, "13-3", "信号弹：飞机！趴倒！");
  const K = id => KXZ(ctx, "13-3", id);
  const officer = K("IjaOfficer"), shouter = K("S727_E1");
  // 对面一颗信号弹拖着烟打上天（正式弹道特效；FlareEffectsBrowserTest 查 t 0.8 s）
  s.Eye(0, 1.4, { stance: "stand", look: officer, pitch: 2 });
  s.Ev(0.8, "flare", { x: officer.x, z: officer.z, atX: FLARE.x, atZ: FLARE.z, preset: "SignalRed" });
  s.Eye(1.4, 3.6, { stance: "stand", look: FLARE, pitch: 55 });
  s.Caption(1.4, 3.2, "（对面一颗信号弹拖着烟打上天）");
  // 几秒后东边嗡嗡声：第一拨三架从东边远远地压过来（第二拨 14-1 进场）
  Wave(s, WAVE_A, [
    { t: 4.0, x: 620, y: 160, z: 600 }, { t: 9.0, x: 420, y: 110, z: 620 }, { t: 13.0, x: 280, y: 80, z: 636 }, { t: 16.4, x: 200, y: 60, z: 644 },
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
  s.Cam(duck, 16.4 - duck + 0.6, { from: { x: KP(ctx, "13-3").x, z: KP(ctx, "13-3").z, h: 0.45 }, look: { aircraft: WAVE_A[0] } });
  s.Caption(duck + 2.2, 2.6, "（跑过来的人有的爬过了板桥，有的倒在沟北边）");
  return s.Done({ durationS: 17.0 });
}

// ---------------------------------------------------------------------------
// 14 空袭，救护所院里松手

/** 两拨飞机的几条扫射线（世界坐标，顺着第四版的战壕 / 沟 / 街）。 */
const STRAFE_TRENCH = Object.freeze({ from: Pt(205, LineZAtX(L1218_TRENCH.east, 205)), to: Pt(50, LineZAtX(L1218_TRENCH.west, 50)) });   // 顺村北沿战壕从东往西
const STRAFE_DITCH = Object.freeze({ from: Pt(180, 643.0), to: Pt(60, 647.0) });                                                            // 沟南沿杂木、沟口
const STRAFE_STREET = Object.freeze({ from: Pt(192, 810), to: Pt(96, 662) });                                                              // 顺主街（官道）从东南往西北

function S1401(ctx) {
  const s = new Seq(ctx, "14-1", "两拨飞机：第一拨顺战壕和沟口扔炸弹扫射，第二拨掉头顺着村里的街扫");
  const P = KP(ctx, "14-1");
  // 第一拨三架：顺着村北沿的战壕从东往西扫，沟口扔小炸弹
  const ST1 = { t0: 2.2, t1: 4.8, ...STRAFE_TRENCH, hz: 26 };
  const ST1W = { t0: 3.6, t1: 5.8, ...STRAFE_DITCH, hz: 22 };
  Wave(s, WAVE_A, [
    { t: 0, x: 300, y: 60, z: 648 }, { t: 2.2, x: 210, y: 22, z: 650 }, { t: 4.8, x: 50, y: 20, z: 656 }, { t: 6.8, x: -50, y: 50, z: 660 },
    { t: 11.0, x: -120, y: 110, z: 720 }, { t: 16.0, x: -60, y: 140, z: 820 }, { t: 21.0, x: 80, y: 150, z: 860 },
  ], { strafe: [ST1], strafeWing: [ST1W], dt: 1.3, dz: 8, dy: 8, dive: [1.0, 2.3] });
  // 第二拨三架：从东南兜回来，顺着村里的主街从东南往西北扫、往院子里扔炸弹
  const ST2 = { t0: 14.2, t1: 17.0, ...STRAFE_STREET, hz: 26 };
  Wave(s, WAVE_B, [
    { t: 0, x: 330, y: 120, z: 700 }, { t: 6, x: 300, y: 90, z: 800 }, { t: 10, x: 240, y: 60, z: 850 }, { t: 14.2, x: 192, y: 26, z: 810 },
    { t: 17.0, x: 96, y: 22, z: 662 }, { t: 20, x: 40, y: 60, z: 600 }, { t: 23, x: -80, y: 120, z: 560 },
  ], { strafe: [ST2], dt: 1.3, dz: -16, dy: 8, dive: [13.2] });
  s.Cam(0, 2.2, { from: { x: P.x, z: P.z, h: 0.45 }, look: { aircraft: WAVE_A[0] } });
  s.Caption(0.2, 2.6, "（六架分两拨。第一拨三架先顺着村北沿的战壕和沟口压过来）");
  for (const id of ["S727_E2", "S727_W2"]) { const p = KXZ(ctx, "14-1", id); s.Key(id, 0, { state: "alive", stance: "crouch" }); s.Key(id, StrafeAtK(ST1, StrafeK(ST1, p)), { state: "down" }); }
  s.Eye(2.2, 2.6, { stance: "prone", look: Pt(160, 648), pitch: 4, shake: 0.6 });
  s.Shake(2.6, 2.0, 0.6);
  // 沟口扔小炸弹；添树枝的被掀翻，杂木着火
  s.Spawn("Brancher", { side: "nra", x: 112.4, z: 645.6, yawDeg: 0, weapon: null }, { clip: KNEEL_DIG, stance: "crouch" });
  Bomb(s, 4.0, Pt(110, 630.6)); Bomb(s, 4.5, Pt(96, 648.2)); Bomb(s, 5.0, Pt(118, 639.4));
  s.Key("Brancher", 5.05, { state: "down", clip: null });
  s.Ev(5.3, "smoke", { x: 126.3, z: 642.0, kind: "SmokeBlack", dur: 40 });
  s.Ev(5.6, "smoke", { x: 93.3, z: 644.9, kind: "SmokeBlack", dur: 40 });
  s.Eye(4.8, 3.0, { stance: "prone", look: PLANK_MID, pitch: -2, shake: 0.4 });
  s.Caption(4.6, 3.6, "（扔小炸弹、扫射：二营的兵一片片倒，添树枝的被掀翻，杂木着火）");
  // 第二拨掉头顺着村里的街扫、往院子里扔炸弹，几处房顶着火
  s.Cam(7.8, 6.4, { from: { x: P.x, z: P.z, h: 0.45 }, look: { aircraft: WAVE_B[0] } });
  s.Caption(9.0, 3.0, "（第二拨三架从村子东南掉头，压着房顶过来）");
  s.Cam(14.2, 3.2, { from: { x: P.x, z: P.z, h: 0.7 }, look: { x: 128, z: 672, h: 2 }, shake: 0.4 });
  s.Caption(14.4, 3.4, "（顺着村里的街扫、往院子里扔炸弹，几处房顶着火；不趴不判失败）");
  Bomb(s, 15.2, Pt(176, 752), { smoke: "SmokeBlack", smokeDur: 60 }); Bomb(s, 16.0, Pt(150, 702), { smoke: "SmokeBlack", smokeDur: 60 }); Bomb(s, 16.8, Pt(122, 668), { smoke: "SmokeBlack", smokeDur: 60 });
  s.Eye(17.4, 3.6, { stance: "prone", look: Pt(128, 672), pitch: 4 });
  return s.Done({ durationS: 21.0 });
}

function S1402(ctx) {
  const s = new Seq(ctx, "14-2", "往回跑：顺着着火的官道、南街往救护所跑；南街那家院里的洞挨了一颗");
  const P0 = KP(ctx, "14-1");
  const luo = KXZ(ctx, "14-2", "Luo"), woman = KXZ(ctx, "14-2", "StreetWoman"), child = KXZ(ctx, "14-2", "StreetChild");
  const trench = Pt(P0.x, P0.z);
  const liu0 = KXZ(ctx, "14-1", "LiuWencai");
  // 顺子不等人喊就爬起来往村里跑；班长一把没拽住，冲刘文财吼：文财！跟到他！
  s.Signal(0, SIG.dugoutBombed, false);
  s.Place("LiuWencai", 0, liu0.x, liu0.z, { stance: "crouch", aim: false });
  s.Eye(0, 0.4, { stance: "crouch", x: trench.x, z: trench.z, look: luo, pitch: -6, shake: 0.3 });
  s.Caption(0.1, 3.0, "（第二拨飞机往村里扫，顺子不等人喊就爬起来往村里跑；班长一把没拽住）");
  const run = 0.4;
  const FRONT = Pt(GATE_YARD.x - 1.6, GATE_YARD.z - 1.4);
  const route = StreetRoute(trench, FRONT);
  const len = RouteLen(trench, route), T2 = R(run + len / 3.8);
  const w = Walker(s, trench, FRONT, run, T2, { h: 1.5 });
  s.Key("Luo", 0.6, { faceTo: "LiuWencai", clip: POINT_CROUCH });
  s.Say("FollowHim.01", "Luo", 1.0);
  s.Key("Luo", s.End("FollowHim.01") + 0.4, { clip: null });
  s.Walk("LiuWencai", s.End("FollowHim.01") + 0.2, Pt(GATE_YARD.x + 0.4, GATE_YARD.z - 8.6), { move: "run", speed: 3.7, aim: false, depart: { stance: "stand" } });
  // 眼睛：出壕回头看一眼班长，顺着主街跑
  w.shot(run, 2.6, { actor: "Luo", offset: [0, 1.2, 0] }, { shake: 0.15 });
  const tStreet = w.tAt(Pt(114, 690)), tCorner = w.tAt(CORNER), tWest = w.tAt(SOUTH_ST_WEST), tExit = w.tAt(Pt(121, 783));
  w.shot(2.6, tStreet, { x: 140, z: 730, h: 1.2 }, { shake: 0.12 });
  s.Caption(run + 2.6, 3.0, "（顺着着火的官道往东南跑）");
  // 第二拨飞机顺着街扫（弹着点在前头追着街面跑）；街两边房顶着火
  const ST = { t0: R(tStreet + 1.0), t1: R(tStreet + 3.4), from: Pt(118, 696), to: Pt(162, 760), hz: 24 };
  Wave(s, WAVE_B, [
    { t: 0, x: 40, y: 60, z: 600 }, { t: 6, x: -60, y: 100, z: 640 }, { t: 12, x: -20, y: 90, z: 720 }, { t: ST.t0 - 4, x: 60, y: 50, z: 640 },
    { t: ST.t0, x: 116, y: 22, z: 694 }, { t: ST.t1, x: 164, y: 20, z: 762 }, { t: ST.t1 + 4, x: 250, y: 60, z: 860 }, { t: ST.t1 + 12, x: 60, y: 120, z: 960 }, { t: ST.t1 + 20, x: -60, y: 90, z: 860 },
  ], { strafe: [ST], dt: 1.2, dz: -14, dy: 8, dive: [ST.t0 - 1.6] });
  for (const [t, p] of [[1.0, Pt(150, 702)], [1.4, Pt(176, 752)], [1.8, Pt(122, 668)]]) s.Ev(t, "smoke", { x: p.x, z: p.z, kind: "SmokeBlack", dur: 70 });
  w.shot(tStreet, ST.t0 - 1.2, { x: 160, z: 760, h: 1.2 }, { shake: 0.12 });
  w.shot(ST.t0 - 1.2, ST.t0 + 1.0, { aircraft: WAVE_B[0] }, { shake: 0.2 });
  s.Caption(ST.t0, 3.0, "（飞机顺着街扫过去，弹着点在前头追着街面跑）");
  w.shot(ST.t0 + 1.0, tCorner, { x: 192, z: 796, h: 1.2 }, { shake: 0.15 });   // 看点放在南街口再往东南的官道上（落幅别踩在看点上）
  // 南街：街上躺着人，一个女人拖着一个孩子往墙根爬；南街边那家院里的洞挨了一颗
  s.Caption(tCorner, 3.0, "（拐进南街：街上躺着人，一个女人拖着一个孩子往墙根爬——拖人没有动作，并排挪）");
  s.Go("StreetWoman", tCorner - 2.0, tCorner + 4.0, woman.x + 0.6, woman.z + 1.8, { move: "walk", stance: "crouch", faceTo: Pt(woman.x + 0.6, woman.z + 6) });
  s.Go("StreetChild", tCorner - 2.0, tCorner + 4.0, child.x + 0.6, child.z + 1.2, { move: "walk", lie: "along", yawDeg: 180 });
  const bombT = R(tCorner + 1.2);
  Bomb(s, bombT, BOMBED_HOLE, { radius: 4.5, shake: 0.7, smoke: "SmokeDust", smokeDur: 8 });
  s.Signal(bombT + 0.1, SIG.dugoutBombed, true);
  s.Caption(bombT + 0.2, 3.2, "（南街边那家院里的洞挨了一颗，炸成一个坑）");
  w.shot(tCorner, bombT - 0.3, { ...woman, h: 0.8 }, { shake: 0.15 });
  w.shot(bombT - 0.3, tWest + 0.4, { ...BOMBED_HOLE, h: 0.4 }, { shake: 0.3 });
  w.shot(tWest + 0.4, tExit, { x: 121, z: 802, h: 1.2 }, { shake: 0.12 });   // 看点放在出村小路上、南街口以南（落幅别踩在看点上）
  // 出村小路：跑到救护所门前
  w.shot(tExit, T2, { actor: "Heizi", offset: [0, 1.0, 0] }, { shake: 0.12 });
  s.Caption(tExit + 0.2, 2.6, "（顺着出村小路往村西南头跑）");
  s.Eye(T2, 2.4, { stance: "stand", x: FRONT.x, z: FRONT.z, look: KXZ(ctx, "14-2", "Heizi"), pitch: -8, shake: 0.2 });
  s.Caption(T2, 2.4, "（跑到救护所门前）");
  return s.Done({ durationS: T2 + 2.6 });
}

function S1403(ctx) {
  const s = new Seq(ctx, "14-3", "院门口的驴：黑子挨了一梭，连车带驴翻在地上；刘文财朝天上打");
  const P = KP(ctx, "14-3"), P4 = KP(ctx, "14-4");
  const K = id => KXZ(ctx, "14-3", id);
  const heizi = K("Heizi"), liu = K("LiuWencai"), blanket = K("BlanketDonggua");
  const cart = Pt(CART_PARK.cart.x, CART_PARK.cart.z), heizi0 = Pt(CART_PARK.heizi.x, CART_PARK.heizi.z);
  // 开场车还立着（这一段 Spawn 的）、黑子还拴在车辕里；翻车的块先藏起来（关键帧 14-3 本来就开）
  s.Signal(0, SIG.cartOverturned, false);
  s.Spawn("GengCartUp", { side: "civ", kind: "cart", x: cart.x, z: cart.z, yawDeg: CART_PARK.yawDeg }, { visible: true });
  s.Place("Heizi", 0, heizi0.x, heizi0.z, { state: "alive", yawDeg: CART_PARK.yawDeg });
  s.Eye(0, 2.6, { stance: "stand", look: heizi0, pitch: -8 });
  s.Caption(0.3, 2.4, "（顺子在车边停了一步）");
  // 第二拨一架顺着出村小路俯冲下来，一串弹着扫过门前空地：拴在车辕里的黑子挨了一梭，连车带驴翻在地上
  const ST = { t0: 2.8, t1: 4.0, from: Pt(121.4, 792), to: Pt(121.8, 832), hz: 28 };
  Wave(s, WAVE_B, [
    { t: 0, x: 124, y: 80, z: 700 }, { t: 2.6, x: 121.6, y: 24, z: 788 }, { t: 4.0, x: 121.8, y: 18, z: 834 }, { t: 6.4, x: 112, y: 40, z: 910 },
    { t: 10, x: 50, y: 90, z: 960 }, { t: 14, x: -50, y: 120, z: 900 }, { t: 18, x: -120, y: 100, z: 800 },
  ], { strafe: [ST], dt: 1.2, dz: 0, dx: 16, dy: 8, dive: [1.2] });
  s.Cam(1.0, 1.9, { from: { x: P.x, z: P.z, h: 1.5 }, look: { aircraft: WAVE_B[0] } });
  const hit = StrafeAtK(ST, StrafeK(ST, heizi0));
  s.Shake(hit, 1.2, 0.7);
  s.Key("Heizi", hit + 0.05, { state: "down" });
  s.Place("Heizi", hit + 0.1, heizi.x, heizi.z, { yawDeg: KU(ctx, "14-3", "Heizi").yawDeg });
  s.Key("GengCartUp", hit + 0.1, { visible: false });
  s.Signal(hit + 0.1, SIG.cartOverturned, true);
  s.Sfx(hit + 0.2, "bodyFall", { x: cart.x, z: cart.z, volume: 0.9 });
  s.Ev(hit, "explosion", { x: cart.x, z: cart.z, kind: "grenade", radius: 1.2, h: 0.3 });
  s.Eye(hit - 0.1, 4.2, { stance: "stand", look: heizi, pitch: -14, shake: 0.3 });
  s.Caption(hit + 0.3, 4.0, "（拴在车辕里的黑子挨了一梭，连车带驴翻在地上，后腿一下一下地蹬——牲口没有蹬腿动作，说明字顶）");
  // 刘文财在院门口朝天上打
  const fire = R(hit + 4.1);
  s.Key("LiuWencai", fire - 0.4, { faceTo: Pt(liu.x, liu.z + 10), aim: true });
  for (const t of [fire + 0.3, fire + 1.5, fire + 2.7, fire + 5.0]) Shot(s, t, "LiuWencai", { volume: 0.8 });
  s.Eye(fire, 3.0, { stance: "stand", look: liu, pitch: 2 });
  s.Caption(fire + 0.1, 2.8, "（刘文财在院门口朝天上打）");
  // 院里乱成一团：能动的往洞里钻，抬的抬拖的拖；老耿背着另一个伤员往洞口挪；冬瓜一个人躺在墙根露天里
  const into = R(fire + 3.0), T4 = R(into + 5.0);
  const enter = Walker(s, P, P4, into, T4);
  enter.shot(into, into + 2.4, { ...HOLE_B_MOUTH, h: 0.6 });
  s.Caption(into + 0.2, 3.6, "（院里乱成一团：能动的往院里挖的洞里钻，抬的抬拖的拖）");
  s.Go("AidHelper", into - 0.4, into + 2.6, HOLE_B_IN.x, HOLE_B_IN.z, { move: "run", path: [HOLE_B_MOUTH] });
  s.Key("AidHelper", into + 2.7, { visible: false });
  s.Key("DoorGuard", into, { faceTo: HOLE_B_MOUTH, stance: "crouch" });
  s.Key("Doctor", into, { faceTo: HOLE_B_MOUTH, stance: "crouch" });
  s.Go("Geng", into + 0.4, T4 + 0.6, 106.4, 815.4, { move: "walk", faceTo: HOLE_A_MOUTH });
  s.Go("Wounded1", into + 0.4, T4 + 0.6, 105.8, 814.4, { move: "walk", lie: "along", yawDeg: 90 });
  s.Caption(into + 2.6, 3.0, "（老耿背着另一个伤员往洞口挪——没有背人的动作，伤员躺着跟他一起挪）");
  enter.shot(into + 2.4, T4, { ...blanket, h: 0.2 });
  s.Caption(T4 + 0.2, 2.8, "（冬瓜一个人躺在墙根露天里）");
  s.Eye(T4, 3.0, { stance: "crouch", x: P4.x, z: P4.z, look: blanket, pitch: -30 });
  s.Go("Nier", into + 1.0, T4 + 0.4, KXZ(ctx, "14-4", "Nier").x, KXZ(ctx, "14-4", "Nier").z, { move: "walk", faceTo: "Donggua" });
  return s.Done({ durationS: T4 + 3.2 });
}

function S1404(ctx) {
  const s = new Seq(ctx, "14-4", "揪被角：冬瓜！把他弄过来！妮儿一声不吭揪住另一角");
  const P = KP(ctx, "14-4");
  const K = id => KXZ(ctx, "14-4", id), K5 = id => KXZ(ctx, "14-5", id);
  const blanket0 = K("BlanketDonggua"), geng = K("Geng"), liu = K("LiuWencai");
  const blanketEnd = K5("BlanketDonggua");
  const fr = Frame(blanket0, HOLE_A_MOUTH), yaw = Yaw(blanket0, HOLE_A_MOUTH);
  const blanket1 = Along(blanketEnd, Frame(blanketEnd, HOLE_A_MOUTH).f, -1.3);
  // 第二拨在西边掉头，兜到东边压回来（这一拍不开枪）
  Wave(s, WAVE_B, [{ t: 0, x: -120, y: 100, z: 800 }, { t: 5, x: -20, y: 110, z: 900 }, { t: 10, x: 120, y: 100, z: 940 }, { t: 14, x: 200, y: 70, z: 870 }, { t: 18, x: 180, y: 50, z: 836 }], { dt: 1.3, dz: 14, dy: 8, dive: [15.0] });
  // 老耿背着伤员往洞口挪，回头喊：冬瓜！把他弄过来！
  s.Key("Geng", 0.4, { faceTo: "player" });
  s.Eye(0, 0.01, { stance: "crouch", look: geng, pitch: -2 });
  s.Say("BringHim.01", "Geng", 0.8);
  s.Eye(0.01, s.End("BringHim.01") + 0.3, { stance: "crouch", look: geng, pitch: -2 });
  s.Caption(s.End("BringHim.01") + 0.2, 2.6, "（任务字：把冬瓜拖进洞里）");
  const crawl = R(s.End("BringHim.01") + 0.3);
  s.Go("Geng", crawl, crawl + 4.0, HOLE_A_MOUTH.x + 1.4, HOLE_A_MOUTH.z - 1.2, { move: "walk", faceTo: HOLE_A_IN });
  s.Go("Wounded1", crawl, crawl + 4.0, HOLE_A_MOUTH.x + 1.8, HOLE_A_MOUTH.z - 0.4, { move: "walk", lie: "along", yawDeg: 90 });
  // 刘文财在院门口朝天上打
  s.Key("LiuWencai", 0, { faceTo: Pt(liu.x, liu.z - 10), aim: true });
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
  s.Cam(tm, T1 - tm, { from: { ...mid, h: 1.05 }, look: { aircraft: WAVE_B[0] } });
  s.Caption(go + 0.2, 2.6, "（两人往洞口拖，洞口在十几步外）");
  s.Caption(tm, 2.6, "（飞机掉头，声音越来越尖：俯冲）");
  void P;
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
  // 第二拨顺着院子从东边俯冲过来：长机一串弹着顺地皮追过来，从冬瓜身上扫过、擦着妮儿过去
  const STRAFE = { t0: 1.3, t1: 2.5, from: Pt(122, 820.6), to: Pt(96, 813.8), hz: 30 };
  Wave(s, WAVE_B, [
    { t: 0, x: 180, y: 50, z: 836 }, { t: 1.4, x: 124, y: 20, z: 821 }, { t: 2.6, x: 92, y: 16, z: 813 }, { t: 4.0, x: 50, y: 30, z: 800 },
    { t: 7.0, x: -40, y: 70, z: 780 }, { t: 11.0, x: -160, y: 130, z: 740 },
  ], { strafe: [STRAFE], dt: 1.2, dz: -14, dy: 8, dive: [0.3, 1.5] });
  const hit = StrafeAtK(STRAFE, StrafeK(STRAFE, blanket1));
  s.Shake(STRAFE.t0 + 0.3, 1.6, 0.8);
  s.Cam(0.9, 0.7, { from: { ...Along(eye0, fr.f, 0.6), h: 1.05 }, look: { aircraft: WAVE_B[0] } });
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
  // 院门口刘文财脸正冲着这边，全看见了
  s.Key("LiuWencai", up + 9.4, { faceTo: "player", aim: false });
  s.Cam(up + 9.4, 3.6, { from: { ...head, h: 0.6 }, look: { actor: "LiuWencai", offset: [0, 1.0, 0] } });
  s.Caption(up + 9.8, 2.8, "（院门口刘文财脸正冲着这边，全看见了）");
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
  Wave(s, WAVE_B, [{ t: 0, x: -150, y: 130, z: 760 }, { t: 5, x: -20, y: 150, z: 700 }, { t: 10, x: 180, y: 170, z: 660 }, { t: 15, x: 420, y: 200, z: 620 }], { dt: 1.2, dz: -16, dy: 8 });
  s.Caption(0.3, 2.6, "（飞机拉起来往东飞走）");
  s.Cam(0, 2.0, { from: { x: P5.x, z: P5.z, h: 0.4 }, look: { aircraft: WAVE_B[0] } });
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
  s.Go("Geng", go, T1, K("Geng").x, K("Geng").z, { move: "walk", yawDeg: yaw });   // 终点取关键帧 14-6 的老耿（坡道上）
  const tm = R((go + T1) / 2), eyeMid = Lerp(eyeL0, eyeL3, 0.5);
  s.WalkEye(go, tm - go, eyeL0, eyeMid, { actor: "Geng", offset: [0, 1.0, 0] }, { h: 1.05 });
  s.WalkEye(tm, T1 - tm, eyeMid, eyeL3, { ...HOLE_A_IN, h: -0.6 }, { h: 1.05 });
  s.Caption(go + 0.4, 3.0, "（一人一角把冬瓜拖进洞里）");
  // 院里的人一个个从洞里探出头
  s.Eye(T1, 3.4, { stance: "crouch", x: eyeL3.x, z: eyeL3.z, look: HOLE_B_MOUTH, pitch: -4 });
  s.Caption(T1 + 0.2, 3.0, "（院里的人一个个从洞里探出头）");
  return s.Done({ durationS: T1 + 3.6 });
}

// ---------------------------------------------------------------------------
// 15 洞里，抬到厢房门口

function S1501(ctx) {
  const s = new Seq(ctx, "15-1", "洞里：你松你妈啥子手！八个……抵了。抵个锤子");
  const K = id => KXZ(ctx, "15-1", id);
  const blanket = K("BlanketDonggua"), liu = K("LiuWencai"), bYaw = KU(ctx, "15-1", "BlanketDonggua").yawDeg;
  s.Eye(0, 4.6, { stance: "crouch", look: blanket, pitch: -30 });
  s.Caption(0.4, 3.6, "（洞里：洞顶漏下一条红天）");
  // 老耿跪着把毛巾按回伤口（骨骼身体，CareMedicPress 的站位）；冬瓜躺着弓起来
  const press = PressPose(blanket, bYaw);
  s.Place("Geng", 0, press.x, press.z, { yawDeg: press.yawDeg, stance: "crouch", clip: MEDIC_PRESS });
  s.Key("Donggua", 0, { clip: LIE_TREATED });
  s.Caption(3.0, 4.0, "（老耿跪着捡起毛巾，拿手掌把它按回伤口里，按住不放）");
  // 刘文财：你松你妈啥子手！（蹲着说）（顺子说不出话）
  s.Key("LiuWencai", 4.6, { stance: "crouch", faceTo: "player", clip: TALK_CROUCH });
  s.Eye(4.6, 0.01, { stance: "crouch", look: liu, pitch: -8 });
  s.Say("HoleTalk.01", "LiuWencai", 5.2);
  s.Eye(4.61, s.End("HoleTalk.01") - 4.61 + 0.4, { stance: "crouch", look: liu, pitch: -8 });
  s.Caption(s.End("HoleTalk.01") + 0.3, 2.0, "（顺子说不出话）");
  s.Key("LiuWencai", s.End("HoleTalk.01") + 0.4, { clip: null });
  // 冬瓜（睁眼看着顺子）：龟儿子……手恁个滑……（喘了好几口）……八个……抵了。
  const look = R(s.End("HoleTalk.01") + 2.4);
  s.Eye(s.End("HoleTalk.01") + 0.4, look - s.End("HoleTalk.01") - 0.4 + 0.01, { stance: "crouch", look: blanket, pitch: -30 });
  s.Say("HoleTalk.02", "Donggua", look + 0.4);
  s.Say("HoleTalk.03", "Donggua");
  s.Key("Donggua", look, { clip: LIE_GRAB, clipRelease: R(s.End("HoleTalk.03") - look), clipHold: true });
  s.Caption(s.End("HoleTalk.02") + 0.1, 1.6, "（喘了好几口）");
  // 顺子（看着冬瓜）：抵个锤子……到了汉口，你拿钱还老子。
  const retort = s.Say("HoleTalk.04", null, s.End("HoleTalk.03") + 0.6);
  s.Eye(look + 0.01, s.End("HoleTalk.04") - look - 0.01 + 0.6, { stance: "crouch", look: blanket, pitch: -30 });
  // 刘文财把妮儿推到老耿身边：老人家，你牵到她。我来。接过被角
  const give = s.Say("HoleTalk.05", "LiuWencai", s.End("HoleTalk.04") + 1.2);
  s.Key("LiuWencai", give - 0.4, { faceTo: "Geng", clip: TALK_CROUCH });
  s.Eye(s.End("HoleTalk.04") + 0.6, give - s.End("HoleTalk.04") - 0.6 + s.Dur("HoleTalk.05") + 0.3, { stance: "crouch", look: liu, pitch: -8 });
  s.Caption(give, 2.4, "（刘文财把妮儿推到老耿身边）");
  const grab = R(s.End("HoleTalk.05") + 0.3);
  const fr = Frame(blanket, HOLE_A_MOUTH);
  const liuPull = PullR(blanket, fr);
  s.Go("LiuWencai", grab, grab + 1.6, liuPull.x, liuPull.z, { move: "walk", depart: { clip: null }, yawDeg: Yaw(blanket, HOLE_A_MOUTH) });
  s.Key("LiuWencai", grab + 1.8, { carryRole: "front", clip: DRAG_R });
  s.Caption(grab + 1.8, 2.8, "（老耿等他攥稳了，才把按着毛巾的手松开，去牵妮儿）");
  const nier = K("Nier");
  s.Go("Geng", grab + 3.0, grab + 4.4, nier.x + 0.6, nier.z - 0.4, { move: "walk", depart: { clip: null, stance: "stand" }, faceTo: "Nier" });
  s.Eye(s.End("HoleTalk.05") + 0.3, 5.0, { stance: "crouch", look: liuPull, pitch: -16 });
  void retort;
  return s.Done({ durationS: grab + 5.4 });
}

function S1502(ctx) {
  const s = new Seq(ctx, "15-2", "抬到厢房门口：没有对白，天一点点黑");
  const K1 = id => KXZ(ctx, "15-1", id), K3 = id => KXZ(ctx, "15-3", id);
  const start = K1("BlanketDonggua"), end = K3("BlanketDonggua");
  // 出洞：洞里 → 坡道 → 洞口 → 院里 → 厢房门口；顺子左角、刘文财右角，老耿牵着妮儿跟在后头
  const ramp = Pt(HOLE_A_MOUTH.x - 1.2, HOLE_A_MOUTH.z), out = Pt(HOLE_A_MOUTH.x + 1.4, HOLE_A_MOUTH.z - 1.4), yardTurn = Pt(100.6, 812.2);
  const via = [ramp, out, yardTurn];
  const pts = [start, ...via, end];
  let total = 0;
  for (let i = 1; i < pts.length; i++) total += Dist(pts[i - 1], pts[i]);
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
  s.Go("LiuWencai", T0, T1, liuEnd.x, liuEnd.z, { move: "walk", path: [Pt(out.x + 1.0, out.z - 0.4), Pt(yardTurn.x - 1.0, yardTurn.z - 0.6)], yawDeg: yawEnd });
  s.Walk("Geng", T0 + 1.2, K3("Geng"), { tArrive: T1 + 1.0 });
  s.Walk("Nier", T0 + 1.4, Off(K3("Nier"), 0.8, 0.8), { tArrive: T1 + 1.0 });
  const eye0 = PullL(start, Frame(start, HOLE_A_MOUTH));
  const w = Walker(s, eye0, eyeEnd, T0, T1, { via: [Pt(ramp.x + 1.6, ramp.z + 0.5), Pt(out.x + 1.6, out.z + 0.2), Pt(yardTurn.x - 1.4, yardTurn.z + 0.4)], h: 1.5 });
  s.Eye(0, T0, { stance: "crouch", x: eye0.x, z: eye0.z, look: HOLE_A_MOUTH, pitch: 10 });
  const tMid = R(T0 + (T1 - T0) * 0.45);
  w.shot(T0, tMid, { actor: "LiuWencai", offset: [0, 1.2, 0] });
  w.shot(tMid, T1, { ...XIANG_DOOR, h: 1.2 });
  s.Caption(T0 + 0.4, 3.6, "（顺子、刘文财一人一头把冬瓜连被子抬出洞；没有对白，只有喘气声和被子蹭地的声音）");
  s.Caption(tMid, 3.6, "（天一点点黑，红褪成灰蓝；老耿牵着妮儿跟在后头）");
  s.Eye(T1, 2.4, { stance: "stand", x: eyeEnd.x, z: eyeEnd.z, look: XIANG_DOOR, pitch: -4 });
  return s.Done({ durationS: T1 + 2.6 });
}

function S1503(ctx) {
  const s = new Seq(ctx, "15-3", "厢房门口等着进：等到！里头满起了；画的黑子嗦？……犟");
  const K = id => KXZ(ctx, "15-3", id);
  const P = KP(ctx, "15-3");
  const guard = K("DoorGuard"), nier = K("Nier"), liu = K("LiuWencai"), geng = K("Geng"), blanket = K("BlanketDonggua");
  const draw = Pt(nier.x, nier.z + 0.9);
  // 门口一副挨一副摆着等的：有兵，也有拿门板抬来的老乡，一个孩子胳膊烧黑了，他娘抱着他不出声
  s.Key("DoorGuard", 0, { faceTo: "player" });
  s.Eye(0, 3.0, { stance: "crouch", look: K("BurnedMother"), pitch: 0 });
  s.Caption(0.3, 3.2, "（厢房门口一副挨一副摆着等的：有兵，也有拿门板抬来的老乡；一个孩子胳膊烧黑了，他娘抱着他不出声）");
  // 守门的兵：等到！里头满起了！挤你妈啥子！
  s.Key("DoorGuard", 2.8, { clip: HALT });
  s.Eye(3.0, 0.01, { stance: "crouch", look: guard, pitch: 2 });
  s.Say("DoorPush.01", "DoorGuard", 3.3);
  s.Eye(3.01, s.End("DoorPush.01") - 3.01 + 0.4, { stance: "crouch", look: guard, pitch: 2 });
  s.Key("DoorGuard", s.End("DoorPush.01") + 0.4, { clip: null });
  // 顺子放下冬瓜就去找守门的：兄弟，让一哈，他等不得了……
  const squeeze = Pt(guard.x - 0.3, guard.z - 1.3);
  const beg = s.Say("DoorPush.02", null, s.End("DoorPush.01") + 1.0);
  s.Caption(beg - 0.4, 2.2, "（顺子放下冬瓜，起身去挤门）");
  s.Eye(s.End("DoorPush.01") + 0.4, s.End("DoorPush.02") - s.End("DoorPush.01") - 0.4, { stance: "stand", x: squeeze.x, z: squeeze.z, look: guard, pitch: -2 });
  // 守门的（一把推回来）：哪个等得？等到！
  s.Key("DoorGuard", s.End("DoorPush.02") - 0.2, { clip: HALT });
  const shove = s.Say("DoorPush.03", "DoorGuard", s.End("DoorPush.02") + 0.2);
  s.Caption(shove, 2.0, "（一把推回来）");
  s.Eye(s.End("DoorPush.02"), s.End("DoorPush.03") - s.End("DoorPush.02") + 0.3, { stance: "stand", look: guard, pitch: 0, shake: 0.15 });
  s.Key("DoorGuard", s.End("DoorPush.03") + 0.4, { clip: null });
  // 顺子还要挤，刘文财从后头揪住他领子：你挤进去他就活了？
  s.Go("LiuWencai", s.End("DoorPush.03") - 0.4, s.End("DoorPush.03") + 0.8, P.x + 0.9, P.z + 0.6, { move: "walk", depart: { stance: "stand" }, faceTo: "player", clip: TALK_LOW });
  const collar = s.Say("DoorPush.04", "LiuWencai", s.End("DoorPush.03") + 1.1);
  s.Caption(collar - 0.3, 2.2, "（顺子还要挤，刘文财从后头揪住他领子）");
  s.Eye(s.End("DoorPush.03") + 0.3, s.End("DoorPush.04") - s.End("DoorPush.03") - 0.3 + 0.4, { stance: "stand", look: Pt(P.x + 0.9, P.z + 0.6), pitch: -2 });
  // 顺子蹲回冬瓜头边，把他的手塞回被子里
  const back = R(s.End("DoorPush.04") + 0.4);
  s.Go("LiuWencai", back, back + 1.4, liu.x, liu.z, { move: "walk", depart: { clip: null }, stance: "crouch", faceTo: draw });
  s.Eye(back, 3.2, { stance: "crouch", look: blanket, pitch: -34 });
  s.Caption(back + 0.2, 3.0, "（顺子蹲回冬瓜头边，把他的手塞回被子里）");
  // 妮儿蹲着用树枝在土里画驴、拖着车，从衣兜掏出弹壳在驴旁边摆成一排（骨骼身体，PvKneelDig 顶着）
  const t1 = R(back + 3.2);
  s.Key("Nier", 0, { stance: "crouch", clip: KNEEL_DIG });
  s.Eye(t1, 7.0, { stance: "crouch", look: draw, pitch: -30 });
  s.Caption(t1 + 0.2, 4.0, "（妮儿蹲着用树枝在土里画驴：长脸，两只长耳朵，四条腿，后头拖一辆车）");
  s.Caption(t1 + 4.2, 3.0, "（从衣兜掏出弹壳，一个挨一个，在驴旁边摆成一排）");
  // 刘文财蹲下来看：画的黑子嗦？（她听不见，接着摆）拈起一个弹壳掂了掂……
  s.Key("LiuWencai", t1 + 6.6, { clip: TALK_CROUCH, faceTo: draw });
  const t2 = t1 + 7.0;
  s.Eye(t2, 0.01, { stance: "crouch", look: liu, pitch: -16 });
  s.Say("ShellCasings.01", "LiuWencai", t2 + 0.3);
  s.Caption(s.End("ShellCasings.01") + 0.1, 1.8, "（她听不见，接着摆）");
  const count = s.Say("ShellCasings.02", "LiuWencai", s.End("ShellCasings.01") + 1.6);
  s.Key("LiuWencai", count - 0.2, { clip: COUNT_FINGERS });
  s.Caption(count + 0.2, 3.0, "（刘文财拈起一个弹壳，在手心里掂了掂）");
  const leg = s.Say("ShellCasings.03", "LiuWencai");
  s.Key("LiuWencai", leg - 0.1, { clip: TALK_CROUCH });
  s.Caption(leg - 0.1, 2.4, "（看着地上那头驴）");
  s.Eye(t2 + 0.01, s.End("ShellCasings.03") - t2 + 0.4, { stance: "crouch", look: liu, pitch: -16 });
  // 妮儿把弹壳拿回来摆回原处。刘文财：……犟。
  const takeBack = R(s.End("ShellCasings.03") + 0.4);
  s.Eye(takeBack, 3.2, { stance: "crouch", look: draw, pitch: -30 });
  s.Caption(takeBack + 0.2, 3.0, "（妮儿把他手心里那个弹壳拿回去，摆回原来的地方）");
  s.Eye(takeBack + 3.2, 0.01, { stance: "crouch", look: liu, pitch: -16 });
  s.Say("ShellCasings.04", "LiuWencai", takeBack + 3.4);
  s.Eye(takeBack + 3.21, s.End("ShellCasings.04") - takeBack - 3.21 + 0.6, { stance: "crouch", look: liu, pitch: -16 });
  s.Key("LiuWencai", s.End("ShellCasings.04") + 0.4, { clip: null });
  // 老耿看着地上那头驴，把脸转开
  const turn = R(s.End("ShellCasings.04") + 0.6);
  s.Key("Geng", 0, { faceTo: draw });
  s.Eye(turn, 4.0, { stance: "crouch", look: geng, pitch: -4 });
  s.Caption(turn + 0.2, 3.0, "（老耿看着地上那头驴，看了一会儿，把脸转开了）");
  s.Key("Geng", turn + 1.8, { faceTo: Pt(geng.x + 6, geng.z + 4) });
  // 门里有人：下一副！
  s.Say("ShellCasings.05", null, turn + 4.0);
  s.Eye(turn + 4.0, s.End("ShellCasings.05") - turn - 4.0 + 1.6, { stance: "crouch", look: XIANG_DOOR, pitch: 0 });
  return s.Done({ durationS: s.End("ShellCasings.05") + 1.8 });
}

// ---------------------------------------------------------------------------
// 16 过门槛

function S1601(ctx) {
  const s = new Seq(ctx, "16-1", "过门槛：又挨了？抬进来！脚……慢点");
  const P = KP(ctx, "16-1");
  const K = id => KXZ(ctx, "16-1", id), K3 = id => KXZ(ctx, "15-3", id);
  const doctor = K("Doctor");
  const insideYaw = KU(ctx, "17-1", "BlanketDonggua").yawDeg;
  // 开场：被子在厢房门口外（15-3 的位置），顺子在被头、刘文财在被尾
  const blanket0 = K3("BlanketDonggua"), blanketEnd = K("BlanketDonggua");
  const heading = Yaw(blanket0, blanketEnd);
  const fr = Frame(blanket0, blanketEnd);
  s.Place("BlanketDonggua", 0, blanket0.x, blanket0.z, { yawDeg: heading });
  s.Place("Donggua", 0, blanket0.x, blanket0.z, { yawDeg: heading, lie: "along" });
  const liu0 = Along(blanket0, fr.f, -1.3);
  s.Place("LiuWencai", 0, liu0.x, liu0.z, { yawDeg: heading, carryRole: "rear" });
  // 院里点起马灯。军医从一副担架边站起来，看见被子上新洇的血：又挨了？抬进来！表堵到门口！
  s.Key("Doctor", 0.4, { faceTo: "Donggua", clip: POINT });
  const eyeA = Along(blanket0, fr.f, 1.3);
  s.Eye(0, 0.01, { stance: "stand", x: eyeA.x, z: eyeA.z, look: doctor, pitch: -2 });
  s.Say("DoorSill.01", "Doctor", 0.8);
  s.Eye(0.01, s.End("DoorSill.01") + 0.3, { stance: "stand", x: eyeA.x, z: eyeA.z, look: doctor, pitch: -2 });
  s.Caption(0.2, 3.0, "（院里点起马灯；军医从一副担架边站起来，看见冬瓜被子上新洇的血）");
  const T1 = R(s.End("DoorSill.01") + 0.3), T2 = R(T1 + fr.len / 0.9);
  s.Key("Doctor", T1, { clip: null });
  // 抬到门口
  DragBlanket(s, T1, T2, blanketEnd, heading);
  s.Go("LiuWencai", T1, T2, K("LiuWencai").x, K("LiuWencai").z, { move: "walk", yawDeg: heading });
  s.WalkEye(T1, T2 - T1, eyeA, Pt(P.x, P.z), { ...INSIDE, h: 0.6 }, { h: 1.6 });
  // 过门槛：眼睛一低一抬，被子往一边歪了一下
  const th = R(T2 + 0.4);
  s.Eye(T2, 0.4, { stance: "stand", look: INSIDE, pitch: -22 });
  s.Caption(th - 0.2, 3.0, "（厢房门口有道门槛：抬着往里迈，镜头一低一抬，被子往一边歪了一下）");
  s.Cam(th, 0.9, { from: { x: P.x, z: P.z, h: 1.3 }, look: { ...INSIDE, h: 0.2 }, shake: 0.15 });
  s.Cam(th + 0.9, 0.9, { from: { x: XIANG_IN.x + 0.4, z: XIANG_IN.z, h: 1.68 }, look: { ...INSIDE, h: 0.2 }, shake: 0.25 });
  s.Say("DoorSill.02", "Donggua", th + 0.8);
  s.Say("DoorSill.03", null);
  // 抬进屋里靠墙的空地：放下要按住键慢慢放
  const eyeIn = Pt(INSIDE.x + 1.3, INSIDE.z - 0.8), liuIn = Pt(INSIDE.x + 1.0, INSIDE.z + 1.6);
  const T3 = R(Math.max(th + 1.8, s.End("DoorSill.03") - 1.0)), T4 = R(T3 + 4.0);
  DragBlanket(s, T3, T4, INSIDE, insideYaw, [XIANG_OUT, XIANG_IN]);
  s.Go("LiuWencai", T3, T4, liuIn.x, liuIn.z, { move: "walk", path: [XIANG_OUT, XIANG_IN], yawDeg: insideYaw });
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
  const s = new Seq(ctx, "17-1", "没了：下一副！表堵到门！老耿用单被盖住他的脸");
  const K = id => KXZ(ctx, "17-1", id);
  const geng = K("Geng"), nier = K("Nier"), liu = K("LiuWencai"), doctor = K("Doctor"), blanket = K("BlanketDonggua");
  // 军医蹲下看了一眼伤口，又摸摸脖子，停了一会儿（关键帧站位就是 CareMedicPress）
  s.Key("Doctor", 0, { stance: "crouch", clip: MEDIC_PRESS });
  s.Eye(0, 5.0, { stance: "stand", look: doctor, pitch: -26 });
  s.Caption(0.4, 4.4, "（军医蹲下看伤口，又摸摸脖子，停了一会儿）");
  s.Say("Passed.01", "Doctor", 5.2);
  // 站起来冲门口吼：下一副！表堵到门！转身去看别人了
  s.Key("Doctor", s.End("Passed.01") + 0.3, { stance: "stand", clip: POINT, faceTo: XIANG_DOOR });
  s.Say("Passed.02", "Doctor");
  s.Eye(5.0, s.End("Passed.02") - 5.0 + 0.4, { stance: "stand", look: doctor, pitch: -12 });
  const leave = R(s.End("Passed.02") + 0.4);
  s.Go("Doctor", leave, leave + 4.0, XIANG_OUT.x + 1.4, XIANG_OUT.z - 1.4, { move: "walk", path: [XIANG_IN, XIANG_OUT], depart: { clip: null } });
  s.Caption(leave, 3.0, "（他转身去看别人了。院子里没人停下来）");
  // 刘文财：刚才过门槛，还在说话……
  s.Key("LiuWencai", leave + 0.6, { faceTo: "Donggua", clip: TALK_SLUNG });
  s.Eye(leave, 0.01, { stance: "stand", look: liu, pitch: -8 });
  s.Say("Passed.03", "LiuWencai", leave + 1.2);
  s.Eye(leave + 0.01, s.End("Passed.03") - leave + 1.4, { stance: "stand", look: liu, pitch: -8 });
  s.Caption(s.End("Passed.03") + 0.3, 1.6, "（没人答他）");
  s.Key("LiuWencai", s.End("Passed.03") + 1.0, { clip: null });
  // 老耿把冬瓜身底下那床单被扯上来盖住他的脸（PvKneelPullBlanket，停在末帧）
  const cover = R(s.End("Passed.03") + 1.4);
  s.Key("Geng", cover - 0.4, { faceTo: "Donggua", stance: "crouch", clip: KNEEL_BLANKET, clipHold: true });
  s.Eye(cover, 5.4, { stance: "stand", look: Lerp(geng, blanket, 0.5), pitch: -30 });
  s.Caption(cover + 0.4, 5.0, "（老耿把冬瓜身底下那床单被扯上来，盖住了他的脸）");
  // 妮儿站在门边看看这个大人的脸、又看看那个
  const look = R(cover + 5.4);
  s.Key("Nier", look - 0.6, { faceTo: "Geng" });
  s.Key("Nier", look + 1.4, { faceTo: "LiuWencai" });
  s.Key("Nier", look + 2.8, { faceTo: "player" });
  s.Eye(look, 4.6, { stance: "stand", look: nier, pitch: -14 });
  s.Caption(look + 0.4, 3.6, "（妮儿站在门边，看看这个大人的脸，又看看那个）");
  return s.Done({ durationS: look + 4.8 });
}

function S1702(ctx) {
  const s = new Seq(ctx, "17-2", "舅舅的信：屏幕只亮一个 F；退到门槛上坐下");
  const P = KP(ctx, "17-2");
  const K = id => KXZ(ctx, "17-2", id);
  const blanket = K("BlanketDonggua");
  // 顺子蹲在冬瓜身边，屏幕只亮一个 F
  const beside = Pt(INSIDE.x + 1.2, INSIDE.z - 0.6);
  s.Eye(0, 4.0, { stance: "crouch", x: beside.x, z: beside.z, look: blanket, pitch: -40 });
  s.Caption(0.3, 3.6, "（顺子蹲在冬瓜身边。屏幕上只亮一个 F，不写字）");
  // 按下去：手伸进冬瓜贴身衣兜，摸出一封折成小方块、汗湿了的信；塞进自己的钱袋
  s.Eye(4.0, 6.4, { stance: "crouch", x: beside.x, z: beside.z, look: blanket, pitch: -48 });
  s.Caption(4.2, 4.0, "（按下去：手伸进冬瓜贴身衣兜，摸出一封折成小方块、汗湿了的信——冬瓜他舅从汉口寄来的）");
  s.Caption(8.4, 2.6, "（顺子把信塞进自己的钱袋）");
  // 退到门口，在门槛上坐下（自动）；能转头不能走
  s.Cam(10.4, 2.4, { from: { x: SEAT.x, z: SEAT.z, h: 1.05 }, look: { ...YARD_MID, h: 1.0 } });
  s.Caption(10.6, 2.4, "（退到门口，在门槛上坐下——自动；之后能转头不能走）");
  // 院子照常忙：有人往里抬、往外抬；院门外二营的兵一拨拨跑过
  s.Spawn("LitterIn", { side: "nra", kind: "litter", x: AID_GATE_OUT.x + 1.0, z: AID_GATE_OUT.z - 0.4, yawDeg: 90 }, { visible: true });
  s.Go("LitterIn", 11.0, 20.0, 104.2, 808.4, { move: "walk", path: [AID_GATE_IN, Pt(108, 810)], yawDeg: 90 });
  s.Go("AidHelper", 12.0, 17.0, 100.4, 801.6, { move: "walk", faceTo: Pt(98, 799) });
  s.Eye(12.8, 5.0, { stance: "crouch", yaw: P.yawDeg, pitch: -4 });
  s.Caption(13.0, 3.6, "（院子照常忙：有人往里抬、往外抬）");
  const pass = 15.6;
  ["Passing1", "Passing2", "Passing3"].forEach((id, i) => { const p = K(id); s.Go(id, pass + i * 0.5, pass + 4.6 + i * 0.5, p.x, p.z + 14, { move: "run", aim: false }); });
  s.Eye(17.8, 4.4, { stance: "crouch", look: Pt(121.4, 820), pitch: -2 });
  s.Caption(18.0, 3.6, "（院门外二营的兵一拨拨跑过）");
  s.Eye(22.2, 4.0, { stance: "crouch", yaw: P.yawDeg, pitch: -30 });
  s.Caption(22.6, 3.0, "（顺子低头攥着钱袋）");
  return s.Done({ durationS: 26.4 });
}

function S1703(ctx) {
  const s = new Seq(ctx, "17-3", "班长进院：咋个搞的？……飞机。……起来，跟斗走");
  const K = id => KXZ(ctx, "17-3", id);
  const luoAt = K("Luo"), yaowaAt = K("Yaowa"), heAt = K("HeYoutian"), liu = K("LiuWencai");
  // 班长带幺娃、何有田和剩下几个人进院，满身土和烟
  const starts = { Luo: Off(AID_GATE_OUT, 0.6, 0), Yaowa: Off(AID_GATE_OUT, 1.8, -0.7), HeYoutian: Off(AID_GATE_OUT, 2.6, 0.7), Squad1: Off(AID_GATE_OUT, 3.6, -0.5), Squad2: Off(AID_GATE_OUT, 4.4, 0.6) };
  for (const [id, p] of Object.entries(starts)) s.Place(id, 0, p.x, p.z, { yawDeg: 90 });
  s.Caption(0.5, 4.0, "（罗班长带幺娃、何有田和剩下几个人进院，满身土和烟）");
  const arriveLuo = s.Walk("Luo", 1.0, luoAt, { speed: 2.6, faceTo: "player" });
  s.Walk("Yaowa", 1.6, yaowaAt, { speed: 2.6, faceTo: "player" });
  s.Walk("HeYoutian", 2.0, heAt, { speed: 2.6, faceTo: "player" });
  s.Walk("Squad1", 2.6, K("Squad1"), { speed: 1.6, faceTo: "player" });
  s.Walk("Squad2", 3.0, K("Squad2"), { speed: 1.6, yawDeg: 90 });
  s.Eye(0, arriveLuo, { stance: "crouch", look: AID_GATE_IN, pitch: -2 });
  s.Eye(arriveLuo, 3.0, { stance: "crouch", look: luoAt, pitch: 4 });
  s.Caption(arriveLuo, 3.0, "（班长看见门槛上的顺子，又看见屋里盖着脸的那个）");
  // 班长走过去在被子边蹲下，掀开被角看了看，又盖回去（LuoKneelCheck）
  const kneel = Pt(INSIDE.x + 1.3, INSIDE.z - 0.2);
  const go = R(arriveLuo + 2.4);
  s.Go("Luo", go, go + 3.2, kneel.x, kneel.z, { move: "walk", path: [XIANG_OUT, XIANG_IN], faceTo: "Donggua" });
  s.Key("Luo", go + 3.4, { stance: "crouch", clip: "LuoKneelCheck" });
  s.Eye(go - 0.4, 0.01, { stance: "crouch", look: luoAt, pitch: 4 });
  s.Eye(go, 4.4, { stance: "crouch", look: kneel, pitch: -16 });
  s.Caption(go + 3.4, 3.4, "（他在被子边蹲下，掀开被角看了看，又盖回去）");
  const why = s.Say("StandUp.01", "Luo", go + 6.8);
  s.Key("Luo", why - 0.2, { clip: TALK_CROUCH });
  s.Eye(go + 4.4, s.End("StandUp.01") - go - 4.4, { stance: "crouch", look: kneel, pitch: -16 });
  s.Key("LiuWencai", why + 0.2, { faceTo: "player", clip: TALK_SLUNG });
  const plane = s.Say("StandUp.02", "LiuWencai");
  s.Eye(s.End("StandUp.01"), plane - s.End("StandUp.01") + s.Dur("StandUp.02") + 0.2, { stance: "crouch", look: liu, pitch: -6 });
  s.Caption(plane - 0.3, 1.6, "（刘文财看了顺子一眼）");
  const damn = s.Say("StandUp.03", "Luo");
  s.Caption(damn - 0.2, 1.4, "（班长没再问）");
  s.Eye(s.End("StandUp.02") + 0.2, s.End("StandUp.03") - s.End("StandUp.02") + 0.2, { stance: "crouch", look: kneel, pitch: -16 });
  s.Key("LiuWencai", s.End("StandUp.02") + 0.6, { clip: null });
  // 幺娃看见顺子攥着的钱袋和露出一角的信，把眼睛挪开
  const glance = R(s.End("StandUp.03") + 0.4);
  s.Eye(glance, 3.8, { stance: "crouch", look: yaowaAt, pitch: 4 });
  s.Caption(glance + 0.2, 3.4, "（幺娃看见顺子攥着的钱袋和露出一角的信，把眼睛挪开）");
  s.Key("Yaowa", glance + 1.4, { faceTo: Pt(yaowaAt.x + 6, yaowaAt.z - 4) });
  // 班长站起来：顺儿。（停一下）……起来，跟斗走。
  s.Key("Luo", glance + 2.6, { stance: "stand", faceTo: "player", clip: TALK_SLUNG });
  s.Go("Luo", glance + 2.8, glance + 4.6, XIANG_IN.x - 0.6, XIANG_IN.z - 0.6, { move: "walk", faceTo: "player" });
  const call = s.Say("StandUp.04", "Luo", glance + 5.0);
  s.Caption(s.End("StandUp.04") + 0.1, 1.6, "（顺子没抬头）");
  s.Say("StandUp.05", "Luo", s.End("StandUp.04") + 1.4);
  s.Eye(glance + 3.8, s.End("StandUp.05") - glance - 3.8 + 0.4, { stance: "crouch", look: Pt(XIANG_IN.x - 0.6, XIANG_IN.z - 0.6), pitch: 12 });
  s.Caption(s.End("StandUp.05") + 0.4, 3.0, "（顺子把钱袋塞回怀里，站起来，拿回全部操作）");
  s.Cam(s.End("StandUp.05") + 0.4, 2.0, { from: { x: SEAT.x, z: SEAT.z, h: 1.62 }, look: { actor: "Luo", offset: [0, 1.4, 0] } });
  void heAt; void call;
  return s.Done({ durationS: s.End("StandUp.05") + 3.4 });
}

// ---------------------------------------------------------------------------
// 18 撤过铁路桥

function S1801(ctx) {
  const s = new Seq(ctx, "18-1", "命令：三营今晚回城；耳朵里响起冬瓜那句；……要得");
  const K = id => KXZ(ctx, "18-1", id);
  const captain = K("Captain"), luo = K("Luo"), he = K("HeYoutian");
  // 二营连长进院
  s.Place("Captain", 0, AID_GATE_IN.x, AID_GATE_IN.z, { yawDeg: 90 });
  const arrive = s.Walk("Captain", 0.4, captain, { speed: 1.8, faceTo: "Luo" });
  s.Eye(0, arrive, { stance: "stand", look: AID_GATE_IN, pitch: -2 });
  s.Caption(0.3, 3.0, "（二营连长进院）");
  // 命令下来了：三营今晚回城，伤兵跟三营走，过了铁路桥就炸。城里说汤军团在路上了。
  s.Key("Captain", arrive + 0.2, { clip: TALK_SLUNG });
  s.Eye(arrive, 0.01, { stance: "stand", look: captain, pitch: -2 });
  s.Say("Orders3rdBn.01", "Captain", arrive + 0.5);
  // 何有田：在路上？日他妈，老子也在路上。
  s.Key("HeYoutian", s.End("Orders3rdBn.01"), { faceTo: "Captain", clip: TALK_LOW });
  const onWay = s.Say("Orders3rdBn.02", "HeYoutian");
  s.Eye(arrive + 0.01, onWay - arrive - 0.2, { stance: "stand", look: captain, pitch: -2 });
  s.Eye(onWay - 0.2, s.End("Orders3rdBn.02") - onWay + 0.4, { stance: "stand", look: he, pitch: -2 });
  s.Key("HeYoutian", s.End("Orders3rdBn.02") + 0.4, { clip: null });
  // 班长：你们二营喃？连长：守到这儿。（停一下）你们跟三营走，把伤兵给我送进城。
  s.Key("Luo", s.End("Orders3rdBn.02") + 0.1, { faceTo: "Captain", clip: TALK_LOW });
  const askBn = s.Say("Orders3rdBn.03", "Luo", s.End("Orders3rdBn.02") + 0.4);
  s.Eye(s.End("Orders3rdBn.02") + 0.2, s.End("Orders3rdBn.03") - s.End("Orders3rdBn.02") - 0.2 + 0.1, { stance: "stand", look: luo, pitch: -2 });
  s.Key("Captain", s.End("Orders3rdBn.03"), { faceTo: "Luo", clip: TALK_SLUNG });
  const hold = s.Say("Orders3rdBn.04", "Captain", s.End("Orders3rdBn.03") + 0.3);
  s.Caption(s.End("Orders3rdBn.04") + 0.1, 1.4, "（停一下）");
  const send = s.Say("Orders3rdBn.05", "Captain", s.End("Orders3rdBn.04") + 1.4);
  s.Eye(s.End("Orders3rdBn.03") + 0.1, s.End("Orders3rdBn.05") - s.End("Orders3rdBn.03") - 0.1 + 0.2, { stance: "stand", look: captain, pitch: -2 });
  s.Key("Luo", s.End("Orders3rdBn.03") + 0.2, { clip: null });
  // 班长：顺儿，你跟担架走。我们殿后，到桥南头等到老子。
  s.Key("Luo", s.End("Orders3rdBn.05") + 0.1, { faceTo: "player", clip: TALK_LOW });
  s.Say("Orders3rdBn.06", "Luo", s.End("Orders3rdBn.05") + 0.4);
  s.Eye(s.End("Orders3rdBn.05") + 0.2, s.End("Orders3rdBn.06") - s.End("Orders3rdBn.05") - 0.2 + 0.4, { stance: "stand", look: luo, pitch: -2 });
  for (const id of ["Luo", "Captain"]) s.Key(id, s.End("Orders3rdBn.06") + 0.4, { clip: null });
  // 顺子愣了一下，耳朵里响起冬瓜在防炮洞里那句（01 的原录音，压低发闷：运行时暂不支持台词音量，这条上写 volume / muffled 字段备用）
  const stun = R(s.End("Orders3rdBn.06") + 0.4);
  s.Caption(stun, 2.2, "（顺子愣了一下）");
  s.Eye(stun, 0.01, { stance: "stand", look: XIANG_DOOR, pitch: -4 });
  const echo = s.Say("DongguaEcho.01", null, stun + 1.4, 0.15, { volume: 0.45, muffled: true });
  s.Caption(echo, s.Dur("DongguaEcho.01") + 0.4, "（耳朵里响起冬瓜在防炮洞里那句——01 的原录音，压低发闷）");
  s.Eye(stun + 0.01, s.End("DongguaEcho.01") - stun - 0.01 + 0.6, { stance: "stand", look: XIANG_DOOR, pitch: -4 });
  // 顺子隔着衣服按了按胸口：……要得。
  const yes = s.Say("Yaode.01", null, s.End("DongguaEcho.01") + 0.8);
  s.Caption(yes - 0.4, 2.4, "（顺子隔着衣服按了按胸口）");
  s.Eye(s.End("DongguaEcho.01") + 0.6, s.End("Yaode.01") - s.End("DongguaEcho.01") - 0.6 + 0.4, { stance: "stand", look: luo, pitch: -2 });
  // 院里的担架一副副抬出去，军医跟最后一副出院门；屋里只剩盖着脸的那几个
  const out = R(s.End("Yaode.01") + 0.6);
  ["AidLitter1", "AidLitter2", "AidLitter3"].forEach((id, i) => s.Walk(id, out + i * 2.0, Pt(121, 823 + i * 3.4), { tArrive: out + 16 + i * 2.0 }));
  s.Walk("Doctor", out + 6.2, Pt(119.6, 820.6), { tArrive: out + 21.0 });
  s.Eye(out, 7.0, { stance: "stand", look: AID_GATE_IN, pitch: -2 });
  s.Caption(out + 0.2, 4.0, "（院里的担架一副副抬出去，军医跟最后一副出院门）");
  s.Eye(out + 7.0, 4.0, { stance: "stand", look: Pt(XIANG_DOOR.x, XIANG_DOOR.z), pitch: -4 });
  s.Caption(out + 7.2, 3.6, "（屋里只剩盖着脸的那几个——冬瓜在里头）");
  void askBn; void hold; void send;
  return s.Done({ durationS: out + 11.4 });
}

function S1802(ctx) {
  const s = new Seq(ctx, "18-2", "隔壁院：走了。走啊！鬼子要来了！席子拉上盖住洞口");
  const P = KP(ctx, "18-2");
  const K = id => KXZ(ctx, "18-2", id);
  const geng = K("Geng"), mother = K("GirlMother"), he = K("HeYoutian");
  // 开场洞口还没盖（关键帧里已经盖上）：女人在洞口探出身
  s.Signal(0, SIG.girlHoleCovered, false);
  s.Key("GirlMother", 0, { faceTo: "Geng" });
  // 顺子在厢房门口停了一下，何有田在后头推他：走了。
  s.Eye(0, 2.0, { stance: "stand", look: XIANG_DOOR, pitch: -6 });
  s.Caption(0.2, 2.4, "（顺子在厢房门口停了一下）");
  s.Key("HeYoutian", 1.6, { faceTo: "player", clip: TALK_LOW });
  const push = s.Say("LetsGo.01", "HeYoutian", 2.2);
  s.Caption(push - 0.3, 2.2, "（何有田在后头推他一把）");
  s.Eye(2.0, s.End("LetsGo.01") - 2.0 + 0.4, { stance: "stand", look: he, pitch: -2 });
  s.Key("HeYoutian", s.End("LetsGo.01") + 0.4, { clip: null });
  // 走到塌墙边：老耿隔着塌墙冲女娃家洞口喊
  const walk = R(s.End("LetsGo.01") + 0.4), by = Pt(99.4, 818.6), T1 = R(walk + Dist(P, by) / 1.3);
  const w = Walker(s, P, by, walk, T1, { via: [Pt(97.5, 814), by] });
  w.shot(walk, T1, { ...geng, h: 1.4 });
  s.Eye(T1, 1.4, { stance: "stand", x: by.x, z: by.z, look: mother, pitch: -8 });
  s.Caption(T1, 2.6, "（救护所南墙塌了的那截墙根边，隔壁院里地上一个洞口，洞口探出一个女人）");
  s.Key("Geng", T1 + 0.6, { faceTo: "GirlMother" });
  s.Eye(T1 + 1.4, 0.01, { stance: "stand", x: by.x, z: by.z, look: Lerp(geng, mother, 0.4), pitch: -6 });
  s.Say("GoNow.01", "Geng", T1 + 1.6);
  s.Eye(T1 + 1.41, s.End("GoNow.01") - T1 - 1.41 + 0.4, { stance: "stand", x: by.x, z: by.z, look: Lerp(geng, mother, 0.4), pitch: -6 });
  // 洞口那个女人摇摇头，把席子拉上，盖住洞口；妮儿看着那张席子
  const no = R(s.End("GoNow.01") + 0.6);
  s.Eye(s.End("GoNow.01") + 0.4, 5.4, { stance: "stand", x: by.x, z: by.z, look: mother, pitch: -10 });
  s.Caption(no, 3.0, "（洞口那个女人摇摇头——程序化身体摇不了头，说明字顶）");
  s.Key("GirlMother", no + 2.4, { faceTo: GIRL_HOLE });
  s.Key("GirlMother", no + 3.5, { visible: false });
  s.Signal(no + 3.6, SIG.girlHoleCovered, true);
  s.Caption(no + 3.0, 3.0, "（把席子拉上，盖住洞口）");
  s.Key("Nier", no + 1.0, { faceTo: GIRL_HOLE });
  s.Caption(no + 6.0, 3.0, "（妮儿站在老耿身边，看着那张席子）");
  s.Eye(no + 5.4, 3.6, { stance: "stand", x: by.x, z: by.z, look: K("Nier"), pitch: -14 });
  // 担架接着一副副出院门往村南头去
  ["AidLitter3", "AidLitter2", "AidLitter1"].forEach((id, i) => s.Walk(id, 0.5 + i * 2.0, Pt(121, 828 + i * 4), { tArrive: 12 + i * 2.4 }));
  s.Walk("Doctor", 5.0, Pt(119.6, 825.4), { tArrive: 19.0 });
  return s.Done({ durationS: no + 9.2 });
}

function S1803(ctx) {
  const s = new Seq(ctx, "18-3", "出村、铁路桥：担架踩着枕木一格一格过；老乡顺陡岸滑下河床蹚水");
  const P = KP(ctx, "18-3");
  const K = id => KXZ(ctx, "18-3", id);
  const deckEnd = DECK(RB.southZ + 1.5);
  // 路上几个定镜：路边挨了炸的院子墙塌了一半、房梁冒烟；墙根一排盖着席子露着脚的人；路过李子行，村里空了；太阳落到铁路那头
  const raidWall = Pt(130.1, 789.2);
  s.Ev(0, "smoke", { x: raidWall.x + 0.8, z: raidWall.z + 0.6, kind: "SmokeBlack", dur: 60 });
  s.Cam(0, 3.0, { from: { x: 121.6, z: 799.0, h: 1.6 }, look: { ...raidWall, h: 1.0 } });
  s.Caption(0.2, 3.0, "（出村小路：路边挨了炸的院子墙塌了一半，房梁冒烟）");
  s.Cam(3.0, 3.0, { from: { x: 121.6, z: 823.0, h: 1.5 }, look: { x: 123.4, z: 833, h: 0.2 } });
  s.Caption(3.2, 3.0, "（墙根一排人躺着，盖着席子、露着脚）");
  s.Cam(6.0, 3.0, { from: { x: -12, z: 895.6, h: 1.6 }, look: { ...LIZI, h: 1.2 } });
  s.Caption(6.2, 3.0, "（北岸土路往西南；路过李子行，村里空了）");
  s.Cam(9.0, 3.0, { from: { x: -58, z: 905.6, h: 1.6 }, look: { ...SUN, h: 30 } });
  s.Caption(9.2, 3.0, "（太阳落到铁路那头）");
  s.Cam(12.0, 3.6, { from: { x: RAMP_N_FOOT.x - 2.0, z: RAMP_N_FOOT.z - 0.5, h: 1.7 }, look: { ...DECK(942), h: 2.8 } });
  s.Caption(12.2, 3.6, "（铁路桥北边只剩光路基；桥是几孔钢梁架在石墩上，桥面只有枕木；三营的兵守桥头）");
  // 两个工兵在北头两墩上绑炸药，引线拉到南岸河堤后（ChargesSet 关键帧 18-3 起就开，预演不动它）
  for (const id of ["Sapper1", "Sapper2"]) s.Key(id, 0, { clip: KNEEL_DIG });
  s.Cam(15.6, 3.4, { from: { x: RL.x + 3.0, z: RB.northZ - 1.0, h: 1.7 }, look: { actor: "Sapper1", offset: [0, 0.8, 0] } });
  s.Caption(15.8, 3.4, "（两个工兵在北头两座桥墩上绑炸药，引线拉到南岸河堤后）");
  // 担架和兵踩着枕木一格一格过（standOn 走道：演员站在枕木顶上）
  s.Walk("AidLitter3", 0.4, DECK(RB.northZ + 30), { speed: 1.2 });
  s.Walk("Doctor", 1.2, DECK(RB.northZ + 26), { speed: 1.2 });
  s.Walk("AidLitter2", 0.2, Pt(RAMP_S_FOOT.x + 1.0, RAMP_S_FOOT.z + 1.0), { speed: 1.2 });
  s.Walk("AidLitter4", 0.2, Pt(RAMP_S_FOOT.x + 2.4, RAMP_S_FOOT.z + 4.6), { speed: 1.2 });
  s.Walk("AidLitter1", 0.2, Pt(-64, 990), { speed: 1.2 });
  s.Walk("B3Escort", 0.6, DECK(RB.southZ - 2), { speed: 1.2, aim: false });
  s.Walk("Geng", 0.8, Off(deckEnd, -0.4, -4.0), { speed: 1.0 });
  s.Walk("Nier", 0.8, Off(deckEnd, 0.5, -3.6), { speed: 1.0 });
  s.Walk("LiuWencai", 4.0, DECK(RB.northZ + 8), { speed: 1.1, aim: false });
  s.Cam(19.0, 4.0, { from: { x: RL.x + 4.0, z: RB.northZ - 0.6, h: 1.7 }, look: { actor: "AidLitter3", offset: [0, 1.0, 0] } });
  s.Caption(19.2, 3.8, "（担架踩着枕木一格一格过；老耿牵着妮儿走桥面）");
  // 有老乡顺着陡岸滑下河床，蹚水过去
  s.Go("Wader1", 0.6, 6.0, SlideN(SLIDE_N.lenM - 0.5).x, SlideN(SLIDE_N.lenM - 0.5).z, { move: "walk", yawDeg: 180 });
  s.Go("Wader1", 6.2, 14.0, WADE.x, WADE.z, { move: "walk", yawDeg: 180 });
  s.Go("Wader1", 14.2, 24.0, SlideS(SLIDE_S.lenM - 0.5).x, SlideS(SLIDE_S.lenM - 0.5).z, { move: "walk", yawDeg: 180 });
  s.Go("Wader2", 2.0, 10.0, SlideS(SLIDE_S.lenM - 1.0).x - 1.0, SlideS(SLIDE_S.lenM - 1.0).z, { move: "walk", yawDeg: 180 });
  s.Go("Wader3", 2.6, 10.8, SlideS(SLIDE_S.lenM - 0.4).x + 0.4, SlideS(SLIDE_S.lenM - 0.4).z, { move: "walk", yawDeg: 180 });
  s.Cam(23.0, 4.0, { from: { x: SLIDE_N.x + 4.0, z: RB.northZ - 1.0, h: 1.8 }, look: { actor: "Wader1", offset: [0, 0.6, 0] } });
  s.Caption(23.2, 3.6, "（有老乡顺着陡岸滑下河床，蹚水过去）");
  // 顺子跟上桥：缝里看得见底下的沙和一股水
  const deck0 = Pt(P.x, P.z), deck1 = DECK(RB.northZ + 13);
  const walk = R(27.0), T2 = R(walk + RouteLen(deck0, StreetRoute(deck0, deck1)) / 1.2);
  const w = Walker(s, deck0, deck1, walk, T2);
  w.shot(walk, T2, { actor: "AidLitter3", offset: [0, 1.0, 0] });
  s.Caption(walk + 0.2, 3.0, "（顺子跟着担架走上桥面）");
  s.Eye(T2, 4.6, { stance: "stand", x: deck1.x, z: deck1.z, yaw: 180, pitch: -62 });
  s.Caption(T2 + 0.2, 4.0, "（枕木缝里看得见底下的沙和一股水）");
  return s.Done({ durationS: T2 + 4.8 });
}

function S1804(ctx) {
  const s = new Seq(ctx, "18-4", "南头等：……哪个管得到。炸！不等了！……顺儿！那挺机枪！");
  const K = id => KXZ(ctx, "18-4", id);
  const officer = K("Officer18"), liu = K("LiuWencai");
  const squad = ["Luo", "Yaowa", "HeYoutian", "Squad1", "Squad2"];
  // 顺子、刘文财趴在南岸河堤上；担架一副副从身边过去，往南走进黑地里，老耿牵着妮儿跟在后头
  s.Eye(0, 3.0, { stance: "prone", look: DECK(940), pitch: 2 });
  s.Caption(0.3, 3.0, "（顺子、刘文财趴在南岸河堤上。任务字：等班长他们过桥）");
  const south = (p, m) => Pt(p.x + SOUTH_ROAD_DIR.x * m, p.z + SOUTH_ROAD_DIR.z * m);
  for (const [id, m, dt] of [["AidLitter2", 32, 0.2], ["Geng", 30, 0.4], ["Nier", 30, 0.4], ["AidLitter1", 30, 0.6], ["Doctor", 30, 0.8]]) s.Go(id, dt, dt + m / 1.2, south(K(id), m).x, south(K(id), m).z, { move: "walk", yawDeg: KU(ctx, "18-4", id).yawDeg });
  const far = south(K("AidLitter1"), 26);
  s.Eye(3.0, 4.6, { stance: "prone", look: far, pitch: 0 });
  s.Caption(3.2, 4.4, "（担架一副副从身边过去，往南走进黑地里，老耿牵着妮儿跟在后头；顺子回头看着那条路，手按在胸口）");
  // 顺子（低声）：……哪个管得到。刘文财看了他一眼，没吭声
  s.Say("WhoCares.01", null, 6.6);
  s.Eye(7.6, s.End("WhoCares.01") - 7.6 + 2.0, { stance: "prone", look: far, pitch: 0 });
  s.Key("LiuWencai", s.End("WhoCares.01") + 0.4, { faceTo: "player" });
  s.Caption(s.End("WhoCares.01") + 0.4, 2.4, "（刘文财看了他一眼，没吭声）");
  s.Key("LiuWencai", s.End("WhoCares.01") + 2.4, { faceTo: MG18 });
  // 北边枪响：一小股鬼子顺铁路路基摸下来，一挺机枪架在路基脚扫；班长他们被压在桥北土坎后头
  const shots = R(s.End("WhoCares.01") + 2.2);
  for (const [i, id] of squad.entries()) { const p = K(id); s.Place(id, 0, p.x + 2.6, p.z + (i % 2) * 0.3, { stance: "crouch", aim: false, faceTo: MG18 }); }
  s.Place("LastWounded", 0, K("LastWounded").x + 2.6, K("LastWounded").z, { lie: "along" });
  for (const [k, id] of [[0.0, "IjaField1"], [0.9, "IjaField3"], [1.7, "IjaField2"], [2.6, "IjaField5"]]) Shot(s, shots + k, id, { volume: 0.4 });
  s.Eye(shots, 3.0, { stance: "prone", look: MG18, pitch: 0 });
  s.Caption(shots + 0.2, 4.4, "（北边枪响：一小股鬼子绕开村口的沟，顺铁路路基从北边摸下来，一挺机枪架在路基脚扫）");
  const burst = R(shots + 2.4);
  MgBurst(s, burst, "IjaMg18", MG18, { count: 14, volume: 0.8, puffs: LinePts(BANK_TOP(-64), BANK_TOP(-44), 8), sweepS: 1.6 });
  for (const [i, id] of squad.entries()) s.Go(id, burst + 0.3 + (i % 3) * 0.3, burst + 1.5 + (i % 3) * 0.3, K(id).x, K(id).z, { move: "walk", stance: "crouch", aim: false, faceTo: MG18 });
  s.Go("LastWounded", burst + 0.6, burst + 1.9, K("LastWounded").x, K("LastWounded").z, { move: "walk", lie: "along", yawDeg: 90 });
  s.Eye(shots + 3.0, 4.4, { stance: "prone", look: LAST_COVER, pitch: 1 });
  s.Caption(shots + 3.2, 4.2, "（殿后的班长他们被压在桥北土坎后头，一离开土坎就是靶子）");
  // 军官：炸！不等了！刘文财：班长他们还在后头！军官：鬼子都摸到路基上了！刘文财：再等一哈！……顺儿！那挺机枪！
  const talk = R(shots + 7.6);
  s.Key("Officer18", talk - 0.4, { faceTo: "Sapper1", clip: POINT });
  s.Eye(talk - 0.2, 0.01, { stance: "prone", look: officer, pitch: 4 });
  s.Say("NotYet.01", "Officer18", talk);
  Shot(s, s.End("NotYet.01") - 0.2, "LiuWencai", { volume: 0.7 });
  const still = s.Say("NotYet.02", "LiuWencai");
  s.Eye(talk - 0.19, still - talk + 0.19 - 0.1, { stance: "prone", look: officer, pitch: 4 });
  s.Eye(still - 0.1, s.End("NotYet.02") - still + 0.2, { stance: "prone", look: liu, pitch: -4 });
  s.Key("Officer18", s.End("NotYet.02"), { faceTo: "LiuWencai", clip: TALK_SLUNG });
  const up = s.Say("NotYet.03", "Officer18");
  s.Eye(s.End("NotYet.02") + 0.1, up - s.End("NotYet.02") - 0.1 + s.Dur("NotYet.03") + 0.1, { stance: "prone", look: officer, pitch: 4 });
  Shot(s, s.End("NotYet.03") - 0.1, "LiuWencai", { volume: 0.7 });
  const wait = s.Say("NotYet.04", "LiuWencai");
  s.Key("LiuWencai", wait + 1.0, { faceTo: "player" });
  s.Eye(s.End("NotYet.03") + 0.2, s.End("NotYet.04") - s.End("NotYet.03") + 0.2, { stance: "prone", look: liu, pitch: -4 });
  s.Key("Officer18", s.End("NotYet.04"), { clip: null });
  s.Caption(s.End("NotYet.04") + 0.2, 3.0, "（顺子把脸从南边转回来，趴到堤上。任务字：压住那挺机枪）");
  s.Eye(s.End("NotYet.04") + 0.4, 2.6, { stance: "prone", look: MG18, pitch: 0 });
  return s.Done({ durationS: s.End("NotYet.04") + 3.0 });
}

function S1805(ctx) {
  const s = new Seq(ctx, "18-5", "快过来！快过来！班长他们跑过桥，班长最后一个");
  const K4 = id => KXZ(ctx, "18-4", id), K5 = id => KXZ(ctx, "18-5", id), K6 = id => KXZ(ctx, "18-6", id);
  const P = KP(ctx, "18-5");
  const squad = ["Yaowa", "HeYoutian", "Squad1", "Squad2"];
  // 开场：班长他们还在土坎后头（18-4 的位置），机枪还在打
  for (const id of ["Luo", ...squad]) s.Place(id, 0, K4(id).x, K4(id).z, { stance: "crouch", aim: false, faceTo: MG18 });
  s.Place("LastWounded", 0, K4("LastWounded").x, K4("LastWounded").z, { lie: "along" });
  for (const id of ["IjaMg18", "IjaMg18Loader"]) s.Key(id, 0, { state: "alive" });
  for (const id of KG(ctx, "18-5", "field18")) s.Key(id, 0, { faceTo: LAST_COVER });
  for (const id of ["Sapper1", "Sapper2"]) s.Key(id, 0, { clip: GRIP_LITTER });
  // 玩家压机枪
  s.Eye(0, 6.4, { stance: "prone", x: KP(ctx, "18-4").x, z: KP(ctx, "18-4").z, look: MG18, pitch: 0, shake: 0.1 });
  s.Caption(0.3, 3.0, "（玩家压机枪）");
  MgBurst(s, 0.6, "IjaMg18", MG18, { count: 10, volume: 0.8, puffs: LinePts(BANK_TOP(-62), BANK_TOP(-48), 6), sweepS: 1.0 });
  for (const t of [1.6, 2.8, 4.0]) Shot(s, t, "player", { volume: 0.9 });
  s.Key("IjaMg18", 4.2, { state: "down" });
  s.Key("IjaMg18Loader", 4.6, { x: MG18.x + 0.3, z: MG18.z + 0.4, move: "crawl", stance: "prone" });
  Shot(s, 5.4, "player", { volume: 0.9 });
  s.Key("IjaMg18Loader", 5.6, { state: "down" });
  // 机枪一哑，顺子站起来冲他们挥手：快过来！快过来！
  const wave = 6.4;
  s.Caption(wave, 2.4, "（机枪一哑，顺子站起来冲他们挥手）");
  s.Say("ComeOver.01", null, wave + 0.3);
  s.Eye(wave, s.End("ComeOver.01") - wave + 0.4, { stance: "stand", look: LAST_COVER, pitch: 2 });
  // 班长他们爬起来往桥上跑（踩着枕木）：土坎 → 土坡 → 桥面 → 桥南头 → 河堤后；幺娃、何有田，班长最后一个
  const run = R(s.End("ComeOver.01") + 0.2);
  const deckVia = [RAMP_N_FOOT, RAMP_N_TOP, DECK(RB.northZ - 1.0), DECK(RB.southZ + 1.5), DECK(RB.southZ + 10), Pt(-72, 971.5)];
  const RunOver = (id, t0, to, speed = 3.2) => { const cur = s.pos.get(id); const len = RouteLen(cur, [...deckVia, to]); const t1 = R(t0 + len / speed); s.Go(id, t0, t1, to.x, to.z, { move: "run", path: deckVia, depart: { stance: "stand" }, stance: "crouch", aim: false }); return { t1, len }; };
  const arrive = {};
  squad.forEach((id, i) => { arrive[id] = RunOver(id, run + i * 0.7, Off(K6(id), 0, 0.5)).t1; });   // 比 18-6 的站位再往堤后退半米（堤背坡上不报斜坡）
  const luoTo = K6("Luo"), luoLen = RouteLen(s.pos.get("Luo"), [...deckVia, luoTo]);
  const luoStart = R(Math.max(run + 3.0, Math.max(...Object.values(arrive)) + 0.6 - luoLen / 3.2));
  arrive.Luo = RunOver("Luo", luoStart, luoTo).t1;
  s.Go("LastWounded", run + 1.4, arrive.Squad1 + 0.4, K6("LastWounded").x, K6("LastWounded").z, { move: "run", path: deckVia, lie: "along" });
  s.Cam(run, 5.0, { from: { x: RL.x + 4.0, z: RB.northZ - 0.6, h: 1.8 }, look: { actor: "Luo", offset: [0, 1.2, 0] } });
  s.Caption(run + 0.4, 3.6, "（班长他们爬起来往桥上跑，踩着枕木一格一格跑：幺娃、何有田，班长最后一个）");
  const onDeck = R(run + 5.0);
  s.Cam(onDeck, arrive.Luo - onDeck - 0.4, { from: { x: RL.x + 0.4, z: RB.southZ + 0.8, h: 1.6 }, look: { actor: "Luo", offset: [0, 1.3, 0] } });
  // 鬼子步兵在路基东边的田里往桥头压
  for (const id of KG(ctx, "18-5", "field18")) s.Key(id, run, { faceTo: RAIL_S });
  for (let k = 0; k < 10; k++) { const id = `IjaField${(k % 6) + 1}`; Shot(s, run + 1.0 + k * 1.1, id, { volume: 0.4 }); }
  // 班长扑到河堤后头，喘着，冲军官点一下头，不说话
  s.Caption(arrive.Luo - 0.4, 3.4, "（班长最后一个扑到河堤后头，喘着，冲军官点一下头，不说话）");
  s.Eye(arrive.Luo - 0.4, 3.6, { stance: "crouch", look: luoTo, pitch: -6 });
  void P;
  return s.Done({ durationS: arrive.Luo + 3.4 });
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
  for (const id of ["Luo", "Yaowa", "HeYoutian", "Squad1", "Squad2", "LiuWencai", "Sapper1", "Sapper2", "Officer18", "B3Guard1", "B3Guard2"]) s.Key(id, fuse + 0.4 + (id.length % 3) * 0.15, { stance: "prone", clip: null });
  // 「轰」一声：北头两孔钢梁断开砸进河床
  const boom = R(fuse + 2.6);
  s.Eye(fuse + 1.8, boom - fuse - 1.8, { stance: "prone", look: PIER(0), pitch: 3 });
  s.Ev(boom, "flash", { dur: 0.3, strength: 0.6 });
  [PIER(0), DECK(RB.northZ + SPAN_M * 0.5), PIER(1), DECK(RB.northZ + SPAN_M * 1.5)].forEach((p, i) => s.Ev(boom + i * 0.15, "explosion", { x: p.x, z: p.z, kind: "shell", radius: 6, h: 2.5 }));
  s.Sfx(boom, "shellBlast", { x: RL.x, z: RB.northZ + SPAN_M, volume: 1.0 });
  s.Ev(boom + 0.1, "smoke", { x: RL.x, z: RB.northZ + SPAN_M, kind: "SmokeWhite", dur: 6 });
  s.Ev(boom + 0.3, "smoke", { x: RL.x + 1, z: RB.northZ + SPAN_M * 0.6, kind: "SmokeDust", dur: 8 });
  s.Ev(boom + 1.2, "smoke", { x: RL.x, z: RB.northZ + SPAN_M * 1.2, kind: "SmokeBlack", dur: 20 });
  s.Shake(boom, 1.6, 0.9);
  s.Signal(boom + 0.2, SIG.bridgeBlown, true);
  s.Cam(boom, 3.4, { from: { x: RL.x + 10, z: LEVEE_PLAYER.z + 3.0, h: 2.2 }, look: { x: RL.x, z: RB.northZ + SPAN_M, h: 1.0 }, shake: 0.6 });
  s.Caption(boom + 0.6, 4.4, "（「轰」一声，北头两孔钢梁断开砸进河床）");
  s.Eye(boom + 3.4, 3.4, { stance: "crouch", look: DECK(RB.northZ + SPAN_M), pitch: 2 });
  return s.Done({ durationS: boom + 7.0 });
}

function S1807(ctx) {
  const s = new Seq(ctx, "18-7", "对岸：鬼子过不来；东北边北沙河村那头枪声；二营的……走！");
  const K = id => KXZ(ctx, "18-7", id);
  const P = KP(ctx, "18-7");
  const luo = K("Luo"), yaowa = K("Yaowa");
  const bank = KG(ctx, "18-7", "northBank");
  const VILLAGE_NE = Pt(120, 700);
  // 鬼子涌到北岸路基上朝这边打，过不来（半过场，能转头）
  s.Eye(0, 6.0, { stance: "stand", look: RAIL_N, pitch: 1 });
  s.Caption(0.4, 4.6, "（鬼子涌到北岸路基上朝这边开枪，过不来——半过场，能转头）");
  for (let k = 0; k < 14; k++) { const id = bank[(k * 5) % bank.length]; Shot(s, 0.8 + k * 0.9 + ((k * 3) % 3) * 0.11, id, { volume: 0.4 }); }
  for (const [t, p] of [[3.0, Pt(-72, 967.2)], [6.4, Pt(-78, 967.4)], [10.6, Pt(-66, 967.0)]]) Puff(s, t, p);
  for (const [id, t] of [["Luo", 2.0], ["HeYoutian", 3.6], ["LiuWencai", 5.0]]) Shot(s, t, id, { volume: 0.7 });
  // 东北边北沙河村那头枪声还在响（二营）
  s.Eye(6.0, 4.2, { stance: "stand", look: VILLAGE_NE, pitch: 1 });
  s.Caption(6.4, 3.8, "（东北边北沙河村那头枪声还在响——二营）");
  for (const [t, p, v] of [[6.6, Pt(118, 690), 0.22], [7.5, Pt(126, 702), 0.18], [8.7, Pt(112, 684), 0.2]]) s.Sfx(t, "rifleShot", { x: p.x, z: p.z, volume: v });
  s.Sfx(8.0, "mgBurstFar", { x: 110, z: 652, volume: 0.18 });
  // 幺娃：二营的……班长：走！
  s.Key("Yaowa", 9.0, { faceTo: VILLAGE_NE, clip: TALK_CROUCH });
  s.Eye(10.2, 0.01, { stance: "stand", look: yaowa, pitch: -8 });
  s.Say("SecondBattalion.01", "Yaowa", 10.6);
  s.Eye(10.21, s.End("SecondBattalion.01") - 10.21 + 0.4, { stance: "stand", look: yaowa, pitch: -8 });
  s.Key("Yaowa", s.End("SecondBattalion.01") + 0.4, { clip: null });
  s.Key("Luo", s.End("SecondBattalion.01") + 0.3, { faceTo: "player", aim: false, stance: "stand", clip: WAVE_ON });
  s.Eye(s.End("SecondBattalion.01") + 0.4, 0.01, { stance: "stand", look: luo, pitch: -4 });
  s.Say("SecondBattalion.02", "Luo", s.End("SecondBattalion.01") + 0.8);
  s.Eye(s.End("SecondBattalion.01") + 0.41, s.End("SecondBattalion.02") - s.End("SecondBattalion.01") - 0.41 + 0.4, { stance: "stand", look: luo, pitch: -4 });
  const run = R(s.End("SecondBattalion.02") + 0.4);
  s.Key("Luo", run, { clip: null });
  s.Caption(run, 3.6, "（往南走进黑里，身后的枪声慢慢远了）");
  ["Luo", "Yaowa", "HeYoutian", "LiuWencai", "Squad1", "Squad2", "Sapper1", "Sapper2", "Officer18", "B3Guard1", "B3Guard2"].forEach((id, i) => {
    s.Walk(id, run + 0.2 + i * 0.25, Pt(-66 + ((i % 3) - 1) * 1.0, 984 + (i % 4) * 1.6), { speed: 2.4, aim: false, depart: { stance: "stand" } });
  });
  const w = Walker(s, Pt(P.x, P.z), Pt(-67.4, 983), run + 0.6, run + 6.0);
  w.shot(run + 0.6, run + 6.0, { x: -55, z: 1030, h: 1.2 });
  s.Sfx(run + 2.4, "rifleShot", { x: -100, z: 905, volume: 0.2 });
  s.Sfx(run + 4.0, "rifleShot", { x: -96, z: 908, volume: 0.15 });
  return s.Done({ durationS: run + 6.4 });
}

function S1808(ctx) {
  const s = new Seq(ctx, "18-8", "夜里：顺南岸路往南走；进了城再说");
  const P = KP(ctx, "18-8");
  const K = id => KXZ(ctx, "18-8", id);
  const geng = K("Geng"), he = K("HeYoutian");
  const column = ["Officer18", "AidLitter1", "Refugee3", "RefugeeChild", "Luo", "Geng", "Nier", "HeYoutian", "Refugee2", "Refugee1", "Yaowa", "LiuWencai", "AidLitter2", "Doctor", "Squad1", "Squad2"];
  const along = (p, m) => Pt(p.x + SOUTH_ROAD_DIR.x * m, p.z + SOUTH_ROAD_DIR.z * m);
  const yawS = Yaw(SOUTH_ROAD[2], SOUTH_ROAD[3]);
  // 黑场，只有脚步声；日期字幕
  s.Ev(0, "black", { dur: 6.0, fade: 0.6 });
  s.Caption(0.8, 4.4, NIGHT_CAPTION);
  s.Caption(0.3, 1.2, "（黑场，只有脚步声——没有脚步声的音效别名，说明字顶）");
  // 淡入：一长溜队伍在夜里顺南岸路往南走（镜头在队伍后头走，看着前头）
  const T1 = 6.0, T2 = 13.0, D1 = 9.0, D2 = 7.0;
  for (const id of column) { const p = K(id); const a = along(p, -D1), b = along(p, D2); s.Place(id, T1 - 0.4, a.x, a.z, { yawDeg: yawS, aim: false }); s.Go(id, T1 - 0.2, T2, b.x, b.z, { move: "walk", yawDeg: yawS, aim: false }); }
  s.WalkEye(T1 - 0.6, T2 - T1 + 0.6, along(P, -D1), along(P, D2), { ...CITY_LIGHTS, h: 1.0 });
  s.Caption(T1 + 0.5, 4.0, "（一长溜队伍顺南岸路往南走，有兵，有担架，有老百姓；老耿牵着妮儿在百姓堆里）");
  // 队伍接着走；何有田：老人家，跟到我们进城做啥子？老耿：……城里有城墙，比庄上牢靠。（没人接话）
  const D3 = 22.0, T3 = R(T2 + (D3 - D2) / 1.4);   // 第二截按自然步速走满，台词时人还在走
  for (const id of column) { const p = K(id); const b = along(p, D3); s.Go(id, T2, T3, b.x, b.z, { move: "walk", yawDeg: yawS, aim: false }); }
  const eyeMid = along(P, D2), eyeEnd = along(P, D3);
  s.Say("NightRoad.01", "HeYoutian", T2 + 0.6);
  const answer = s.Say("NightRoad.02", "Geng");
  s.Caption(s.End("NightRoad.02") + 0.3, 1.8, "（没人接话）");
  s.WalkEye(T2, T3 - T2, eyeMid, eyeEnd, { actor: "Geng", offset: [0, 1.4, 0] });
  // 顺子走在队伍后头，手伸进怀里攥着钱袋和信（低声）：……进了城再说。黑地里远远有几点灯，是县城
  const mine = s.Say("NightRoad.03", null, s.End("NightRoad.02") + 2.2);
  s.Caption(mine - 0.4, 3.0, "（顺子走在队伍后头，手伸进怀里攥着钱袋和信）");
  const T4 = R(Math.max(T3, s.End("NightRoad.03") + 0.4));
  s.Eye(T4, 4.6, { stance: "stand", x: eyeEnd.x, z: eyeEnd.z, look: CITY_LIGHTS, pitch: 0 });
  s.Caption(T4 + 0.2, 4.0, "（黑地里远远有几点灯，是县城——南岸路尽头那几盏小灯）");
  // 黑场，第一关结束
  s.Ev(T4 + 4.6, "black", { dur: 5.0, fade: 1.2 });
  s.Caption(T4 + 6.6, 3.0, "（第一关结束）");
  void geng; void he; void answer;
  return s.Done({ durationS: T4 + 9.6, then: "stay" });
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
    title: "第一关 11–18 预演（占位动作 + 占位配音，2026-11-02 第四版：北沙河村与铁路桥）",
    source: { generator: "node Taierzhuang1938/Script_EditorBlockoutFirstLevel1218Previz.mjs --force", note: "剧本：白盒第四版契约（2026-11-02，tmp/Contract1218_v4.md 第三节）；手改前先想好：重跑生成器会覆盖" },
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
