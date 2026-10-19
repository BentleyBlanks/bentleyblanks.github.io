// ===========================================================================
// Script_EditorBlockoutFirstLevel0610Previz.mjs —— 第一关 06–10 白盒（FirstLevel0610）的预演数据生成器（第二版 2026-10-19）
//
//   node Taierzhuang1938/Script_EditorBlockoutFirstLevel0610Previz.mjs            → 只校验、打印摘要，不写
//   node Taierzhuang1938/Script_EditorBlockoutFirstLevel0610Previz.mjs --force    → 写 Blockout/FirstLevel0610.previz.json
//   node Taierzhuang1938/Script_EditorBlockoutFirstLevel0610Previz.mjs --report   → 另打印每段一行摘要与用到的片段
//
// 格式：docs/Data_EditorBlockout.md §14（tengxian-blockout-previz/1）。剧本口径：Notion「第一关｜往南的路 · 剧本」06–10
// （10-19 用户拍板的第二版），空间口径：Data_EditorBlockoutFirstLevel0610Space.mjs，布设：Blockout/FirstLevel0610.json（只读，25 帧）。
// 台词：Blockout/FirstLevel0610.voice.json 的句子 id；同一段里按录音的原始间隔 gapBeforeS 往后排（只会拉长、不会压短）。
// 写法完全照 Script_EditorBlockoutFirstLevel0105Previz.mjs 与第一版的 0610 预演（那两份的做法不变）。
//
// 片段按骨架：有 castId 的单位骨架固定，只给它那具骨架烘过的片段；没有 castId 的士兵只用五具骨架都有的通用片段；
// 百姓（老耿 / 妮儿 / 村民 / 窖里一家）和军官 2026-10-19 起是能放片段的骨骼占位身体（§5.6），用预演额外动作库
// （Data_BlockoutPrevizClips：PrevizVillage 的 Vil 片段、PrevizTalk / PrevizCare / PrevizIja / PrevizCombat 的 Pv 片段、
// CollectionCare）——这些库只烘了 TengxianNra02，五具骨架骨名一致，哪具身体都能播，所以算通用片段。
//
// 第二版改了什么：每个关键帧一段、共 25 段。07-1 / 07-2 是边走边说（眼睛跟在车后 5–7 m、停停走走地挤，
// 「我妹今年十二」那句正对车尾的妮儿）；07-4 是三个镜头的短过场（非第一人称）；
// 08 正面打：四个人趴在街口坡道上压窗口，班长四人顺街东边门洞摸到大车后，过道里甩手榴弹（演员键 throw）；
// 08-4 喊人的先往街里跑几步再拐；08-5 妮儿顺沟底往西跑进巷子，顺子追；09 顺子意外进院（巷子 → 狗洞 → 墙缝 → 门缝 →
// 门开了 → 屁股对到老子 → 灶屋门口）；10 背后打掉机枪组，石碾后守东街四步的前三步 + 穿院子 + 后门。
//
// 第三版（2026-10-19，白盒预演补齐 v3 契约 §3）：
//   · 07-4 一架 Ki-30（段里的 aircraft[]，§14.1）由北往南贴麦地低空飞过凹路、不开枪，引擎声跟着飞机走，镜头 ① 中段看着它；
//     人群 VilDuckProne 错峰扑倒，妮儿最后一个（她听不见，看见别人趴了才趴）。
//   · 百姓、军官全用骨骼身体放片段：按 PrevizVillage 清单把 Vil 片段放到对应的拍（妮儿坐车尾 VilSitEdge、慌跑 VilPanicRun、
//     钻狗洞 VilCrawlHole、窖里一家举手爬出 / 被捅 / 被拖 / 跪着爬、磕钢盔扔手榴弹、挑襁褓、撒尿的看守、呜咽 / 拔门闩 / 攥衣角 /
//     咬手腕、肩撞、挥手冲、砸门、翻墙、指着吼、抱腿、挪缸、08-5 老耿伸手被拽回、07 背伤员、各处蹲着的 VilCrouchHold）；
//     成对动作按清单 stages 的相对站位与 offsetS 摆（StagePlace / StageAnchorFrom），带根位移的片段播完把人挪到清单 root.end
//     （RootEndAt，小孩身体按 0.62 缩）；只在清单里标 holdLoop、运行时不循环的片段（撒尿、压刺刀）用 HoldLoop 每 1.9 s 重起一遍。
//   · 09-7 妮儿咬手腕那一下按慢动作放（段里的 slowmo[]：1.5 s、0.3 倍、进出 0.25 s 渐变），窗口里不排台词。
//
// 门缝 / 墙缝那几段（09-3 / 09-4）：镜头一直是顺子的眼睛贴在缝后头看出去（SlitEye：眼睛放在「缝 → 目标」连线上、
// 缝后 0.35 m、视场收窄到 40°），不给特写；缝只有几度宽，看得见什么由缝的几何决定，演员的动作都排在那条缝的扇面里。
//
// 确定性：不读时钟、不读 git；同样的输入两次输出逐字相同。
// ===========================================================================

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  L0610_PLACES as PL, L0610_GENG as G, L0610_NEIGHBOR as NB, L0610_STREETS as ST, L0610_SIGNALS as SIG, L0610_EAST_YARDS as EY,
  L0610_DITCH as DT, LanePointAtZ,
} from "./Data_EditorBlockoutFirstLevel0610Space.mjs";
import { StreetRoute } from "./Script_EditorBlockoutFirstLevel0610Keyframes.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
export const PREVIZ_FILE = join(HERE, "Blockout", "FirstLevel0610.previz.json");
const CONFIG_FILE = join(HERE, "Blockout", "FirstLevel0610.json");
const VOICE_FILE = join(HERE, "Blockout", "FirstLevel0610.voice.json");
/** 村子占位动作库的清单（成对动作的相对站位 stages、根位移 root.end 都从这里取，不另抄数字）。 */
export const VILLAGE_MANIFEST_FILE = join(HERE, "Animation", "PrevizVillage", "Data_PrevizVillageAnimation.json");

// ---------------------------------------------------------------------------
// 小工具

const R = v => Math.round(v * 100) / 100;
const WrapDeg = d => { let x = ((d + 180) % 360 + 360) % 360 - 180; return x <= -180 ? x + 360 : x; };
/** 朝向：0 北（−Z），+90 西，−90 东。 */
export function Yaw(from, to) { return R(Math.atan2(-(to.x - from.x), -(to.z - from.z)) * 180 / Math.PI); }
const Dist = (a, b) => Math.hypot(b.x - a.x, b.z - a.z);
const Pt = (x, z) => ({ x: R(x), z: R(z) });
const Off = (p, dx, dz) => Pt(p.x + dx, p.z + dz);
/** p 往朝向 yaw 的前方 f 米、右边 r 米（yaw 口径同 Yaw()：0 北，+90 西；面朝北时右手是东 +x）。 */
export function Fwd(p, yaw, f, r = 0) {
  const a = yaw * Math.PI / 180;
  return Pt(p.x - Math.sin(a) * f + Math.cos(a) * r, p.z - Math.cos(a) * f - Math.sin(a) * r);
}

const VILLAGE = JSON.parse(readFileSync(VILLAGE_MANIFEST_FILE, "utf8"));
export const VILLAGE_STAGES = VILLAGE.stages;
/** 村子库片段的时长（秒）。 */
export function VilClipS(name) { const c = VILLAGE.clips[name]; if (!c) throw new Error(`PrevizVillage 清单里没有片段 ${name}`); return c.duration; }
/** 带停住段的片段（清单 holdLoop [a, b]）停住段在哪一秒结束；没有停住段 = null。 */
export function VilHoldEnd(name) { const h = VILLAGE.clips[name]?.holdLoop; return Array.isArray(h) && h.length === 2 ? h[1] : null; }
/** 小孩身体的缩放（Script_EditorBlockoutPuppets BLOCKOUT_PUPPETS.childScale）：带根位移的片段在小孩身上位移也按它缩。 */
export const CHILD_SCALE = 0.62;
/**
 * 成对动作：清单 stage 里 role 这个人相对锚点（anchor，面朝 anchorYaw）的站位 → 世界 {x, z, yawDeg, offsetS}。
 * 清单坐标：+x 右、−z 前、yawDeg + = 左转（docs：runtime metres in the anchor actor frame）。
 */
export function StagePlace(stage, role, anchor, anchorYaw) {
  const a = VILLAGE_STAGES[stage]?.actors?.[role];
  if (!a) throw new Error(`PrevizVillage 清单里没有 stage ${stage}.${role}`);
  const p = Fwd(anchor, anchorYaw, -(a.z || 0), a.x || 0);
  return { ...p, yawDeg: R(WrapDeg(anchorYaw + (a.yawDeg || 0))), offsetS: a.offsetS || 0 };
}
/** StagePlace 的反算：已知 role 这个人在 partner（面朝 partnerYaw），锚点该站哪、朝哪。 */
export function StageAnchorFrom(stage, role, partner, partnerYaw) {
  const a = VILLAGE_STAGES[stage]?.actors?.[role];
  if (!a) throw new Error(`PrevizVillage 清单里没有 stage ${stage}.${role}`);
  const anchorYaw = R(WrapDeg(partnerYaw - (a.yawDeg || 0)));
  return { ...Fwd(partner, anchorYaw, a.z || 0, -(a.x || 0)), yawDeg: anchorYaw };
}
/** 带根位移的片段播完骨盆落在哪（清单 models[0].clips[].root.end = [x, z, yawDeg, 高]，人物本地米）：p 面朝 yaw 起播 → 末尾那一点。 */
export function RootEndAt(clip, p, yaw, scale = 1) {
  const rec = VILLAGE.models[0].clips.find(c => c.clip === clip);
  if (!rec) throw new Error(`PrevizVillage 清单里没有片段 ${clip} 的根位移`);
  const [ex, ez] = rec.root.end;
  return Fwd(p, yaw, -ez * scale, ex * scale);
}
/** 凹路上按 z 取中线上的点（lat > 0 = 往南走的左手 = 东）。 */
const LZ = (z, lat = 0) => { const p = LanePointAtZ(z, lat); return Pt(p.x, p.z); };
/** 某点离凹路中线的横向偏移（lat，同 LZ 的口径）。 */
function LaneLat(p) { const c = LZ(p.z, 0), e = LZ(p.z, 1); return R((p.x - c.x) * (e.x - c.x) + (p.z - c.z) * (e.z - c.z)); }
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
const UP = u => Pt(u.x, u.z);

// ---------------------------------------------------------------------------
// 序列构造器（同 0105）

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
    for (const k of ["x", "z", "clipFrom"]) if (key[k] !== undefined) key[k] = R(key[k]);
    if (key.path) key.path = key.path.map(p => ({ x: R(p.x), z: R(p.z) }));
    if (key.throw) key.throw = { ...key.throw, x: R(key.throw.x), z: R(key.throw.z) };
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
  /** 第一人称蹲着 / 走着挪一段（镜头从 a 平移到 b，一直看着 look）：用 Cam 顶替眼睛的位移。 */
  Creep(t, dur, a, b, look, { h = 1.05, lookH = 1.0, fov, shake, ease = "inOut" } = {}) {
    const L = look.actor ? look : { ...look, h: lookH };
    return this.Cam(t, dur, { from: { ...a, h }, to: { ...b, h }, look: L, ease, ...(fov ? { fov } : {}), ...(shake ? { shake } : {}) });
  }
  /**
   * 飞机轨（§14.1 aircraft）：path 是按时间升序的航点 {t, x, z, y | h}；sound.drone 缺省 true（引擎声跟着机身走）。
   * 不开枪的就不写 strafe。
   */
  Aircraft(id, { model = "MitsubishiKi30", path, strafe, sound }) {
    const entry = { id, model, path: path.map(w => ({ t: R(w.t), x: R(w.x), ...(w.y !== undefined ? { y: R(w.y) } : { h: R(w.h) }), z: R(w.z) })) };
    if (strafe && strafe.length) entry.strafe = strafe;
    if (sound) entry.sound = sound;
    this.aircraft.push(entry);
    return this;
  }
  /** 慢动作窗口（§14.1 slowmo）：[t, t + dur) 里预演时钟按 rate 走，进出各 fade 秒渐变。窗口里别排台词（校验报警告）。 */
  Slowmo(t, dur, rate, fade = 0.25) { this.slowmo.push({ t: R(t), dur: R(dur), rate, fade }); return this; }
  /**
   * 只在清单里标了 holdLoop、运行时不循环的片段（VilIjaPissStand 撒尿、VilIjaPinBayonet 压刺刀：前 2 s 是停住段、之后是出口）：
   * 从 t0 起每 period 秒重新起一遍（看起来就是一直在做），tLast 那一遍到停住段末尾放开（clipRelease = 停住段结束那一秒，
   * 开场动作层的 pose.holdUntil），接着放出口（系裤子回头 / 被咬甩手后仰），放完停在末帧（clipHold）。返回出口播完的时刻。
   */
  HoldLoop(id, clip, t0, tLast, period = 1.9, fields = {}) {
    for (let t = t0; t < tLast - 0.3; t = R(t + period)) this.Key(id, t, { clip, ...fields });
    const release = VilHoldEnd(clip);
    this.Key(id, tLast, { clip, clipHold: true, ...(release !== null ? { clipRelease: release } : {}), ...fields });
    return R(tLast + VilClipS(clip));
  }
  Done({ durationS, then = "next" }) {
    const lastKey = Math.max(0, ...this.out.actors.flatMap(a => a.keys.map(k => k.t + (k.throw ? 4.2 : 0))));
    const lastEvent = Math.max(0, ...this.out.events.map(e => e.t + (e.dur || 0) * (e.type === "smoke" ? 0 : 1)));
    const lastSlow = Math.max(0, ...this.slowmo.map(s => s.t + s.dur + 0.3));
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

const CART = Pt(PL.cartStop.x, PL.cartStop.z);
const NIER_RIM = Pt(PL.nierRim.x, PL.nierRim.z);
const WINDOW = Pt(PL.northWindow.x, PL.northWindow.z);
const MG_AT = Pt(G.mgPost.x, G.mgPost.z);
const MG_LOADER_AT = Pt(G.mgLoaderPost.x, G.mgLoaderPost.z);
const GATE_POST = Pt(G.gatePost.x, G.gatePost.z);
const CELLAR = Pt(PL.cellar.x, PL.cellar.z);
const MILL = Pt(PL.mill.x, PL.mill.z);
const ROLLER = Pt(PL.roller.x, PL.roller.z);
const EAST_END = Pt(PL.eastEnd.x, PL.eastEnd.z);
const MORTAR = Pt(EY.mortarHide.x, EY.mortarHide.z);
const STRAW = Pt(EY.strawStack.x, EY.strawStack.z);
const SHRINE = Pt(EY.shrine.x, EY.shrine.z);
const SIDE_ROOM_DOOR = Pt(PL.sideRoomDoor.x, PL.sideRoomDoor.z);
const KITCHEN_DOOR = Pt(PL.kitchenDoor.x, PL.kitchenDoor.z);
const ROOM_YARD_DOOR = Pt(PL.roomYardDoor.x, PL.roomYardDoor.z);
const ALLEY_MOUTH = Pt(PL.alleyMouth.x, PL.alleyMouth.z);
const CART_WRECK = Pt(PL.cart.x, PL.cart.z);
const POCKET_GATE = Pt(EY.northChain.pocketGate.x, EY.northChain.pocketGate.z);
const GATE_X = (G.carriageGate.minX + G.carriageGate.maxX) / 2;
const WALL_X = G.sharedWall.x, WALL_T = 0.5;
/** 墙缝中心。 */
const CRACK = Pt(WALL_X, G.crack.z);
export const SLIT_FOV = 40;
export const SLIT_BACK_M = 0.35;
/**
 * 贴着缝看：0.5 m 厚的墙上一道竖缝（缝中心 slit、半宽 hw），斜着看目标时视线要同时穿过墙的近面和远面两个口子，
 * 两个口子错开 T·tanθ ——缝越斜能看的扇面越窄（墙缝 z 496.5 看窖口斜 18°，0.2 m 的缝只剩约 2° 宽；
 * 侧门缝只有薄门扇挡南边，约 15° 宽）。这里把视线固定成「从远面口子的北沿往里 1.7 cm」穿过去，
 * 眼睛放在这条线上、墙面后 back 米；要给人看的东西就排在这条线附近。
 */
export function SlitEye(slit, target, { hw = 0.1, back = SLIT_BACK_M, margin = 0.017 } = {}) {
  const zFar = R(slit.z + hw - margin), xFar = slit.x + WALL_T / 2;
  const far = { x: xFar, z: zFar };
  const d = Dist(far, target);
  const ux = (target.x - far.x) / d, uz = (target.z - far.z) / d;
  const k = WALL_T + back;
  return Pt(far.x - ux * k, far.z - uz * k);
}
/**
 * 侧门门缝后的眼睛：门缝北边是 0.5 m 厚的墙垛（z ≤ 499.5）、南边只有 0.1 m 厚的门扇（x 81.3…81.4，z ≥ 499.655）。
 * 眼睛离墙面 0.35 m、z 499.56：往东能看的扇面约 −4°…+11°（窖口 −0.4°、挑襁褓的地方 +5°、窖沿 +7°、门里贴墙的妮儿 +8°）。
 */
const GATE_EYE = Pt(WALL_X - WALL_T / 2 - SLIT_BACK_M, 499.56);
/**
 * 爬出窖的根离坑心多远（VilHandsUpClimbOut，清单 stage cellarPit：根在坑口沿外 wallBehindM 0.10 m）：
 * 白盒的坑在 0.5 m 网格里坑口沿在坑心外 1.0 m（Data_…Space cellar 注），所以是 1.0 + 0.10。
 */
export const CELLAR_RIM_M = R(G.cellar.floorW / 2 + 0.2 + (VILLAGE_STAGES.cellarPit?.wallBehindM ?? 0.1));
/** 眼睛 → 目标这条线上、过了目标再往前 m 米的点（把要看的东西排在视线上）。 */
function Along(eye, target, m) {
  const d = Dist(eye, target);
  return Pt(target.x + (target.x - eye.x) / d * m, target.z + (target.z - eye.z) / d * m);
}

/** 掷弹筒一发：嘭（麦秸垛后冒烟）→ 约 5.5 s 后落地。效果挂落地。 */
function Mortar(s, tPop, hit, { kind = "launcher", radius = 4, shake = 0.45, smokeDur = 5 } = {}) {
  s.Sfx(tPop, "mortarPop", { x: MORTAR.x, z: MORTAR.z });
  s.Ev(tPop, "smoke", { x: MORTAR.x, z: MORTAR.z + 1.2, kind: "SmokeWhite", dur: 4 });
  const tHit = tPop + 5.5;
  s.Sfx(tHit, "mortarImpact", { x: hit.x, z: hit.z });
  s.Ev(tHit, "explosion", { x: hit.x, z: hit.z, kind, radius });
  if (smokeDur) s.Ev(tHit + 0.1, "smoke", { x: hit.x, z: hit.z, kind: "SmokeDust", dur: smokeDur });
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
/** 北窗机枪打一梭（朝主街北口）。volume 按听者远近给；puffAt 给了就在那儿溅两下土。 */
function WindowBurst(s, t, { volume = 1, puffAt = null, count = 6, muzzle = true } = {}) {
  if (muzzle) s.Ev(t, "muzzle", { actor: "MgGunner", count, interval: 0.11 });
  s.Sfx(t, "mgBurstFar", { x: MG_AT.x, z: MG_AT.z, volume });
  if (puffAt) { Puff(s, t + 0.25, puffAt); Puff(s, t + 0.55, Off(puffAt, 0.9, 1.4)); }
  return R(t + count * 0.11);
}
/** 街口（坡道上）那几个人朝窗口打几枪（08-3 起一直在打；09 里是背景）。 */
function MouthFire(s, t, { volume = 1, who = ["Yaowa", "LiuWencai", "Squad3"] } = {}) {
  who.forEach((id, k) => Shot(s, t + k * 0.35, id, { volume }));
  return R(t + who.length * 0.35);
}
/** 09 的节奏：街口一打，窗口回一梭；返回这一组结束时刻。 */
function Exchange(s, t, { volume = 0.6, puffAt = null } = {}) {
  MouthFire(s, t, { volume: volume * 0.7 });
  return WindowBurst(s, t + 1.2, { volume, puffAt });
}
/** 顺子的眼睛（蹲着）按「机枪响一梭挪一段、一停就贴墙」挪过几个停点；每段挪动都紧跟一梭机枪。返回最后停稳的时刻。 */
function CreepLegs(s, t0, stops, look, { volume = 0.6, pause = 2.6, speed = 1.6, h = 1.05, onStop = null } = {}) {
  let t = t0;
  for (let i = 1; i < stops.length; i++) {
    Exchange(s, t, { volume });
    const mv0 = t + 1.2, mv1 = R(mv0 + Dist(stops[i - 1], stops[i]) / speed);
    s.Creep(mv0, mv1 - mv0, stops[i - 1], stops[i], typeof look === "function" ? look(i) : look, { h });
    t = R(mv1 + pause);
    if (onStop) t = Math.max(t, onStop(i, mv0, mv1) ?? t);
  }
  return t;
}

const SQUAD = ["Luo", "LiuWencai", "Yaowa", "HeYoutian", "Squad1", "Squad2", "Squad3"];

/** 村子库里常用的几段（名字照清单）。 */
const VIL = Object.freeze({
  crouch: "VilCrouchHold", duck: "VilDuckProne", sit: "VilSitEdge", panic: "VilPanicRun", crawlHole: "VilCrawlHole",
  climbOut: "VilHandsUpClimbOut", stabbed: "VilStabbedFall", dragged: "VilDraggedByArm", kneelCrawl: "VilKneelCrawlToPit",
  cower: "VilCowerWhimper", unbolt: "VilUnboltDoor", cling: "VilClingHem", bite: "VilBiteWrist", hug: "VilHugLegs", pushVat: "VilPushVat",
  reach: "VilReachPinned", yank: "VilNraYankBack", carry: "VilNraCarryOnBack", ride: "VilRideOnBack", waveCharge: "VilNraWaveCharge",
  thrust: "VilIjaBayonetThrust", dragArm: "VilIjaDragByArm", lob: "VilIjaHelmetGrenadeLob", fling: "VilIjaBayonetLiftFling",
  piss: "VilIjaPissStand", pin: "VilIjaPinBayonet", charge: "VilIjaShoulderCharge", smash: "VilIjaGateSmash", climbWall: "VilIjaClimbWall",
  shout: "VilIjaShoutPoint",
});
/** 说话 / 手势 / 救护（PrevizTalk / PrevizCare / CollectionCare）：同 0105 的口径，说话的人不端枪。 */
const TALK_SLUNG = "PvStandTalkSlung", TALK_LOW = "PvStandTalkLowRifle", TALK_CROUCH = "PvCrouchTalkRifle";
const POINT_STAND = "PvStandPointL", POINT_CROUCH = "PvCrouchPointL", WAVE_ON = "PvStandWaveOnL", BECKON = "PvStandBeckonL";
const MEDIC_BANDAGE = "CareMedicBandage", SIT_STUFF_PACK = "PvSitStuffPack";
/**
 * 妮儿坐车尾（第四版 10-20）：关键帧单位 Nier 在 07 四帧里都带 §3 ride（Script_EditorBlockoutFirstLevel0610Keyframes NIER_RIDE：挂在 GengCart 车尾沿、
 * 根离车底下地面 0.467、背对车头），预演只给她 VilSitEdge 这个片段，**不写位置键**（挂着时位置键不管用，校验会报警告）；车动她跟着走。
 * 要下车先写 { ride: null } 再写位置键（07-4 扑倒那一下）。车尾沿在车本地 z +1.2（Puppets BLOCKOUT_CART_SEATS.tail）。
 */
const CART_TAIL_Z = 1.2;
/** 四条新音效文件的时长与里头响点（ffprobe 实测 Audio/BlockoutPreviz/*.mp3，10-20）：排时刻用。 */
const SFX_FILE = Object.freeze({
  babyCry: { seconds: 3.53 },                                  // 0–1.0 s 一阵、2.4–3.5 s 又一阵
  cellarSob: { seconds: 4.0 },
  gateSmash: { seconds: 2.33, hits: [0.07, 0.84, 1.66] },      // 枪托两下 + 一脚踹
  jarShatter: { seconds: 1.53 },
});
/** 背伤员的一对（stage carryOnBack：同根同向同相位）。 */
function CarryPair(s, carrier, rider, p, yaw, t = 0) {
  s.Place(carrier, t, p.x, p.z, { yawDeg: yaw, stance: "stand", clip: VIL.carry });
  s.Place(rider, t, p.x, p.z, { yawDeg: yaw, stance: "stand", clip: VIL.ride });
}
/** 背着走到 to（0.9 m/s 是清单基准；两人同一条路同一个时间窗）。返回到达时刻。 */
function CarryGo(s, carrier, rider, t0, to, { speed = 0.9, path = [], yawDeg } = {}) {
  const cur = s.pos.get(carrier);
  const len = RouteLen(cur, [...path, to]);
  const t1 = R(t0 + len / speed);
  for (const id of [carrier, rider]) s.Go(id, t0, t1, to.x, to.z, { move: "walk", ...(path.length ? { path } : {}), ...(yawDeg !== undefined ? { yawDeg } : {}) });
  return t1;
}

// ---------------------------------------------------------------------------
// 06 回到集结处

function S0601(ctx) {
  const s = new Seq(ctx, "06-1", "干沟空了：冬瓜喃");
  const REST = Pt(PL.gullyRest.x, PL.gullyRest.z);
  const he = UP(KU(ctx, "06-1", "HeYoutian"));
  // 顺子站在空了的沟里，看冬瓜躺过的地方：只剩血迹和扔下的绷带
  s.Eye(0, 3.6, { stance: "stand", look: REST, pitch: -16 });
  s.Caption(0.6, 3.2, "（冬瓜躺过的地方只剩一片血、扔下的绷带和几个空水壶）");
  s.Key("Yaowa", 0, { faceTo: REST });
  // 远处沟沿上的妮儿蹲着捡弹壳（蹲着抱膝的占位）
  s.Key("Nier", 0, { stance: "crouch", clip: VIL.crouch });
  const q = s.Say("GullyEmptyAsk.01", null, 2.2);
  // 回头问身后收拾东西的何有田；他答话时没回头（坐在沟里往包里塞东西）
  s.Eye(3.6, 1.0, { stance: "stand", look: REST, pitch: -16, toLook: he, toPitch: -4 });
  s.Key("HeYoutian", 0, { yawDeg: -80, clip: SIT_STUFF_PACK });
  s.Say("GullyEmptyAnswer.01", "HeYoutian", q + 2.3);
  s.Caption(s.End("GullyEmptyAnswer.01") + 0.2, 2.2, "（他手上还在收拾东西，没回头）");
  // 最后两副担架正往支沟南头的凹路口抬（10-20 弯沟）；南岸树底下停着一辆驴车
  s.Go("Litter01", 0.5, 8.5, 58.6, 154.0, { move: "walk", path: [Pt(55, 152.6)] });
  s.Go("Litter02", 1.5, 9.5, 55.6, 151.4, { move: "walk", path: [Pt(50, 149.2)] });
  const lookLitter = s.End("GullyEmptyAnswer.01") + 1.2;
  s.Eye(lookLitter, 1.2, { stance: "stand", look: he, pitch: -4, toLook: Pt(52, 152), toPitch: -2 });
  s.Eye(lookLitter + 3.6, 1.4, { stance: "stand", look: Pt(52, 152), pitch: -2, toLook: CART, toPitch: -1 });
  s.Caption(lookLitter + 4.2, 3.0, "（南岸那排树底下停着一辆驴车，停在树底下是为了躲飞机）");
  // 班长带头往凹路口走；其余人跟上（走到 06-2 的位置；10-20 弯沟：顺沟底走，不直着往东撞北岸）
  ["Luo", "LiuWencai", "Yaowa", "Squad1", "Squad2", "Squad3"].forEach((id) => {
    const to = UP(KU(ctx, "06-2", id)), t0 = lookLitter + 1.0 + (id === "Luo" ? 0 : 1.2);
    s.Go(id, t0, t0 + 8.5, to.x, to.z, { move: "walk", yawDeg: -90 });
  });
  return s.Done({ durationS: lookLitter + 10.5 });
}

function S0602(ctx) {
  const s = new Seq(ctx, "06-2", "树底下的驴车：喊妮儿让路");
  const K = id => KU(ctx, "06-2", id);
  const he = UP(K("HeYoutian"));
  // 老耿在车边收拾绳子；妮儿蹲在凹路口边上的沟沿上捡弹壳，正挡着往凹路走的路
  const gengAtCart = Pt(53.6, 154.4);
  s.Place("Geng", 0, gengAtCart.x, gengAtCart.z, { faceTo: CART });
  s.Key("Nier", 0, { stance: "crouch", yawDeg: 20, clip: VIL.crouch });
  s.Eye(0, 2.6, { stance: "stand", look: CART, pitch: -2 });
  s.Caption(0.4, 2.6, "（车被征来给前沿拉弹药，撤的时候车上还剩几箱）");
  // 何有田喊（挥手赶她让路）；顺子转头看他，再顺着他看的方向看沟沿上的妮儿
  const shout = s.Say("CartAndNier.01", "HeYoutian", 2.8);
  s.Key("HeYoutian", shout - 0.3, { faceTo: NIER_RIM, talking: true, clip: WAVE_ON });
  s.Key("HeYoutian", s.End("CartAndNier.01") + 0.4, { talking: false, clip: null });
  s.Eye(2.6, 1.0, { stance: "stand", look: CART, pitch: -2, toLook: he, toPitch: -3 });
  s.Eye(shout + 1.4, 1.2, { stance: "stand", look: he, pitch: -3, toLook: NIER_RIM, toPitch: 2 });
  s.Caption(s.End("CartAndNier.01") + 0.3, 2.4, "（她没反应，还在一个一个把弹壳捡进小罐里）");
  // 老耿从车边过去，拍拍她的肩膀，她才抬头
  const go = s.End("CartAndNier.01") + 0.2;
  const beside = Pt(NIER_RIM.x - 0.9, NIER_RIM.z - 0.6);
  s.Go("Geng", go, go + Dist(gengAtCart, beside) / 1.2, beside.x, beside.z, { move: "walk", faceTo: "Nier" });
  const up = s.pos.get("Geng").t;
  s.Caption(up + 0.2, 3.0, "（老耿过去拍拍她的肩膀，她才抬头）");
  s.Key("Geng", up, { clip: TALK_SLUNG });
  s.Key("Geng", up + 2.4, { clip: null });
  s.Key("Nier", up + 1.4, { faceTo: "Geng" });
  // 挪开：沿沟沿往东挪两步，再蹲下
  const aside = Pt(NIER_RIM.x + 1.8, NIER_RIM.z + 0.3);
  s.Go("Nier", up + 2.6, up + 4.2, aside.x, aside.z, { move: "walk", depart: { stance: "stand", clip: null }, stance: "crouch", faceTo: Pt(aside.x, aside.z + 4), clip: VIL.crouch });
  s.Caption(up + 2.8, 2.4, "（挪开了。这里不交代她为什么听不见）");
  s.Eye(up + 4.6, 1.6, { stance: "stand", look: NIER_RIM, pitch: 2, toLook: CART, toPitch: -2 });
  // 远处村子里零星的枪声
  s.Sfx(1.6, "rifleShot", { x: 100, z: 420, volume: 0.25 });
  s.Sfx(up + 2.4, "rifleShot", { x: 100, z: 420, volume: 0.25 });
  return s.Done({ durationS: up + 7.0 });
}

function S0603(ctx) {
  const s = new Seq(ctx, "06-3", "传令兵报信，老耿第一个赶车走");
  const K = id => KU(ctx, "06-3", id);
  const runnerAt = UP(K("Runner"));
  // 开场：车还停在树底下（箱子还在车上），老耿、妮儿在车边；传令兵从凹路那头跑来
  s.Signal(0, SIG.cartDeparted, false);
  s.Place("GengCart", 0, CART.x, CART.z, { yawDeg: -90 });
  s.Place("Geng", 0, 56.4, 153.6, { faceTo: CART });
  s.Place("Nier", 0, NIER_RIM.x, NIER_RIM.z, { stance: "crouch", faceTo: CART, clip: VIL.crouch });
  const r0 = LZ(178);
  s.Place("Runner", 0, r0.x, r0.z, { stance: "stand" });
  const arrive = s.Walk("Runner", 0, runnerAt, { move: "run", faceTo: "Luo" });
  s.Eye(0, 2.0, { stance: "stand", look: Pt(83, 160), pitch: -1 });
  s.Caption(0.5, 2.6, "（有人从凹路那头一路跑回来）");
  // 边跑边喊（跑到车边才停住）
  const call = s.Say("RunnerSouth.01", "Runner", Math.max(2.6, arrive - 4.6));
  s.Key("Runner", arrive, { clip: "MessengerReport", faceTo: "Luo" });
  s.Key("Runner", arrive + 3.0, { clip: null });
  s.Eye(2.0, 1.0, { stance: "stand", look: Pt(83, 160), pitch: -1, toLook: Pt(80, 158.6), toPitch: -1 });
  s.Eye(arrive - 1.4, 1.6, { stance: "stand", look: Pt(80, 158.6), pitch: -1, toLook: runnerAt, toPitch: -3 });
  s.Key("Luo", call, { faceTo: "Runner" });
  s.Key("Yaowa", call + 0.4, { faceTo: "Runner" });
  s.Key("LiuWencai", call + 0.2, { faceTo: "Runner" });
  // 老耿手上的活停了，朝南看了好一会儿
  const look = s.End("RunnerSouth.01") + 0.3;
  s.Key("Geng", look, { faceTo: Pt(84, 230) });
  s.Eye(look, 1.0, { stance: "stand", look: runnerAt, pitch: -3, toLook: Pt(56.4, 153.6), toPitch: -4 });
  s.Caption(look + 0.4, 4.0, "（老耿手上的活停了，朝南看了好一会儿）");
  // 第一个赶着车往南走：车上的箱子跟着车走（CartDeparted）
  const go = look + 4.6;
  const head = Pt(57.6, 155.0);
  s.Go("Geng", go - 2.0, go, head.x, head.z, { move: "walk", yawDeg: -90 });
  s.Signal(go, SIG.cartDeparted, true);
  const cartEnd = LZ(163, 0.2);
  const cartRoute = Route(CART, cartEnd);
  const cartLen = RouteLen(CART, [...cartRoute.path, cartRoute.end]);
  const cartT1 = R(go + cartLen / 1.4);
  s.Go("GengCart", go, cartT1, cartRoute.end.x, cartRoute.end.z, { move: "walk", path: cartRoute.path });
  const gengRoute = Route(head, LZ(162.5, -1.6));
  s.Go("Geng", go, cartT1, gengRoute.end.x, gengRoute.end.z, { move: "walk", path: gengRoute.path });
  const nierRoute = Route(NIER_RIM, LZ(165.5, 1.3));
  s.Go("Nier", go + 0.8, cartT1 + 0.6, nierRoute.end.x, nierRoute.end.z, { move: "walk", path: nierRoute.path, depart: { stance: "stand", clip: null } });
  s.Caption(go + 0.6, 3.2, "（第一个赶着车往南走；车上那几箱弹药跟着车走了）");
  s.Eye(go - 0.2, 1.4, { stance: "stand", look: Pt(56.4, 153.6), pitch: -4, toLook: Pt(66, 157.7), toPitch: -2 });
  s.Eye(go + 4.0, 3.0, { stance: "stand", look: Pt(66, 157.7), pitch: -2, toLook: Pt(83, 164), toPitch: -1 });
  // 班长：都跟斗走！（朝南一挥手）全班跟着最后两副担架和车往南赶
  const order = s.Say("RunnerSouth.02", "Luo", go + 1.6);
  s.Key("Luo", order - 0.3, { faceTo: "player", clip: WAVE_ON });
  for (const id of ["Litter02", "Litter01"]) s.Walk(id, go + 1.0, LZ(id === "Litter01" ? 181 : 176, id === "Litter01" ? 0.6 : -0.6), { speed: 1.2, tArrive: cartT1 + 0.5 });
  s.Key("Runner", go + 1.0, { yawDeg: 180 });
  s.Walk("Runner", go + 1.4, LZ(170, -0.4), { move: "run" });
  SQUAD.forEach((id, k) => s.Walk(id, order + 0.4 + k * 0.5, LZ(159 + k * 1.2, k % 2 ? 0.4 : -0.4), { speed: 1.5, ...(id === "Luo" ? { depart: { clip: null } } : {}) }));
  s.Caption(cartT1 - 1.5, 2.6, "（全班跟着最后这几副担架和老耿的车往南赶）");
  return s.Done({ durationS: cartT1 + 1.0 });
}

// ---------------------------------------------------------------------------
// 07 沿着后送队往前走

/**
 * 07-1 / 07-2 共用：顺着凹路停停走走地往前挤。所有人（车、老耿、妮儿、小队）从 fromKf 的位置挪到 toKf 的位置，
 * 走的时候各自保持离中线的横向偏移；按 legs 给的「走 / 停」节拍走（挤着走：走几步停一下，自然步速）。
 * 顺子的眼睛（Cam from/to，眼高 1.55）跟着走、一直看着车尾的妮儿（look 演员锚）。
 * 返回 { tEnd, legs: [[tMove0, tMove1], …], eyeAt(t) }。
 */
function CrowdWalk(s, ctx, fromKf, toKf, { t0 = 1.0, legM = 5.5, pauseS = 2.6, speed = 1.4, ids = ["GengCart", "Geng", "Nier", ...SQUAD], lookAt = { actor: "Nier", offset: [0, 1.0, 0] }, eyeH = 1.55 } = {}) {
  const P0 = KP(ctx, fromKf), P1 = KP(ctx, toKf);
  const total = P1.z - P0.z;
  const nLegs = Math.max(1, Math.round(total / legM));
  const legs = [];
  let t = t0;
  for (let i = 0; i < nLegs; i++) {
    const z0 = P0.z + total * i / nLegs, z1 = P0.z + total * (i + 1) / nLegs;
    const dur = R((z1 - z0) / speed);
    legs.push({ z0, z1, t0: R(t), t1: R(t + dur) });
    t = R(t + dur + pauseS);
  }
  const tEnd = legs[legs.length - 1].t1;
  // 每个人：按自己的 lat 走到对应 z（最后一段落到 toKf 里的位置）。
  // 妮儿坐在车尾（VilSitEdge）：关键帧单位带 ride（挂在车尾沿上），车动她跟着走 —— 这里只给片段，不写位置键（10-20 起）。
  for (const id of ids) {
    const a = KU(ctx, fromKf, id), b = KU(ctx, toKf, id);
    const lat = LaneLat(a), dz = a.z - P0.z;
    if (id === "Nier") {
      if (a.ride?.on !== "GengCart") throw new Error(`${fromKf}：妮儿要挂在 GengCart 上（关键帧 ride）`);
      s.Key("Nier", 0, { clip: VIL.sit });
      continue;
    }
    for (let i = 0; i < legs.length; i++) {
      const L = legs[i];
      const to = i === legs.length - 1 ? Pt(b.x, b.z) : LZ(L.z1 + dz, lat);
      s.Go(id, L.t0, L.t1, to.x, to.z, { move: "walk", yawDeg: 180 });
    }
  }
  // 眼睛：每段走动一条 Cam（from→to），每次停一条静止 Cam；一直看着车尾的妮儿
  const lat = LaneLat(P0);
  const eyeAtZ = z => LZ(z, lat);
  s.Cam(0, legs[0].t0, { from: { ...eyeAtZ(P0.z), h: eyeH }, look: lookAt, fov: 58 });
  for (let i = 0; i < legs.length; i++) {
    const L = legs[i];
    const a = eyeAtZ(L.z0), b = i === legs.length - 1 ? Pt(P1.x, P1.z) : eyeAtZ(L.z1);
    s.Cam(L.t0, L.t1 - L.t0, { from: { ...a, h: eyeH }, to: { ...b, h: eyeH }, look: lookAt, ease: "linear", fov: 58 });
    const next = legs[i + 1];
    if (next) s.Cam(L.t1, next.t0 - L.t1, { from: { ...b, h: eyeH }, look: lookAt, fov: 58 });
  }
  return { tEnd, legs, eyeAtZ };
}

function S0701(ctx) {
  const s = new Seq(ctx, "07-1", "队尾：边走边数铜板");
  const ids = ["GengCart", "Geng", "Nier", ...SQUAD];
  // 停停走走地往前挤：对白约 56 s，45 m 路分 8 段走
  const { tEnd } = CrowdWalk(s, ctx, "07-1", "07-2", { t0: 3.0, legM: 5.6, pauseS: 4.4 });
  s.Caption(0.4, 3.0, "（后送队贴着西边土坎停成一长溜：担架一副挨一副搁在地上，抬担架的蹲在杠子边喘气）");
  s.Caption(3.6, 2.6, "（路窄，只能侧着身子从担架和土坎中间往前挤，边挤边挨骂）");
  // 路上零零星星：被踩到的伤兵、讨水的、问前头的
  s.Say("RoadMutters.01", "Walker03", 3.0);
  s.Key("Walker03", 2.7, { faceTo: "player" });
  s.Say("RoadMutters.02", "Walker04", s.End("RoadMutters.01") + 1.3);
  const ask = s.Say("RoadMutters.03", "Helper02", s.End("RoadMutters.02") + 0.8);
  s.Key("Helper02", ask - 0.2, { clip: TALK_LOW });
  s.Key("Helper02", s.End("RoadMutters.03") + 0.6, { clip: null });
  s.Caption(s.End("RoadMutters.03") + 0.2, 1.6, "（没人答）");
  // 「有人两个人架一个」里的一对：Helper03 背着 Walker08（VilNraCarryOnBack + VilRideOnBack），在队头那边挪两步
  { const h = UP(KU(ctx, "07-1", "Helper03")); CarryPair(s, "Helper03", "Walker08", h, 180); CarryGo(s, "Helper03", "Walker08", 30.0, Pt(h.x, h.z + 2.5), { yawDeg: 180 }); }
  // 老耿的车走在前头几步：轮子在车辙里颠，弹药箱哐哐响；妮儿坐在车尾晃腿（VilSitEdge）
  s.Caption(6.4, 3.4, "（老耿的车走在前头几步，轮子在车辙里颠，弹药箱哐哐响。妮儿坐在车尾，两条腿悬在外头晃，抱着弹壳罐）");
  // 顺子边走边摸出钱袋数铜板；幺娃凑过来，并排在左手边略后，边走边说
  s.Caption(10.2, 2.8, "（顺子边走边摸出钱袋，一个一个数铜板。幺娃凑过来）");
  s.Key("Yaowa", 10.0, { faceTo: "player", clip: TALK_LOW });
  s.Say("CopperCoins.01", "Yaowa", 12.4);
  s.Say("CopperCoins.02");
  s.Say("CopperCoins.03", "Yaowa");
  s.Caption(s.End("CopperCoins.03") + 0.1, 1.6, "（顺子不答）");
  s.Say("CopperCoins.04", "Yaowa", s.End("CopperCoins.03") + 1.6);
  s.Say("CopperCoins.05");
  s.Say("CopperCoins.06", "Yaowa");
  s.Say("CopperCoins.07");
  s.Say("CopperCoins.08", "Yaowa");
  s.Say("CopperCoins.09");
  s.Caption(s.End("CopperCoins.09") + 0.2, 2.2, "（走了几步，压不住）");
  const last = s.Say("CopperCoins.10", null, s.End("CopperCoins.09") + 2.4);
  // 前头村子的枪声时有时无
  for (const t of [7.0, 24.0, 41.0, 55.0]) s.Sfx(t, t === 41.0 ? "rifleShot" : "mgBurstFar", { x: MG_AT.x, z: MG_AT.z, volume: 0.35 });
  return s.Done({ durationS: Math.max(tEnd + 1.0, s.End("CopperCoins.10") + 1.2) });
}

function S0702(ctx) {
  const s = new Seq(ctx, "07-2", "我妹今年十二");
  const P = KP(ctx, "07-2");
  // 开场站着没动：眼前就是车尾晃腿的妮儿（不给特写、不点破），那句话很低地补出来
  const nier = UP(KU(ctx, "07-2", "Nier"));
  const lookNier = { actor: "Nier", offset: [0, 0.7, 0] };
  s.Cam(0, 1.0, { from: { x: P.x, z: P.z, h: 1.55 }, look: lookNier, fov: 58 });
  const sis = s.Say("CopperCoins.11", null, 1.2);
  s.Caption(sis + 0.2, 3.2, "（眼前就是车尾晃腿的妮儿。不给特写，也不点破）");
  s.Caption(s.End("CopperCoins.11") + 0.4, 1.8, "（幺娃不吭声）");
  const rant = s.Say("CopperCoins.12", null, s.End("CopperCoins.11") + 2.4);
  s.Key("Yaowa", 0, { faceTo: "player", clip: TALK_LOW });
  // 背着伤员的那一对（07-1 末挪到的地方）跟着往前挪几步
  { const h = UP(KU(ctx, "07-2", "Helper03")); const at = Pt(h.x, h.z + 2.5); CarryPair(s, "Helper03", "Walker08", at, 180); CarryGo(s, "Helper03", "Walker08", R(rant + 4.0), Pt(at.x, at.z + 3.0), { yawDeg: 180 }); }
  // 说到一半又开始往前挤（走到 07-3 的位置：队头、冬瓜那副担架）
  const walk = CrowdWalk(s, ctx, "07-2", "07-3", { t0: R(rant + 4.0), legM: 12.5, pauseS: 1.4, lookAt: lookNier });
  s.Caption(rant + 4.4, 3.0, "（又开始往前挤。两边还是担架、靠坎坐着的人，没人抬头）");
  // 幺娃过了好一会儿才开口
  s.Caption(s.End("CopperCoins.12") + 0.3, 3.2, "（幺娃过了好一会儿才开口）");
  const last = s.Say("CopperCoins.13", "Yaowa", s.End("CopperCoins.12") + 3.6);
  s.Key("Yaowa", last - 0.3, { faceTo: "player" });
  // 越往前伤越重；太阳偏西
  s.Caption(walk.tEnd - 6.0, 3.4, "（越往前伤越重，队头这几副是最早从前沿抬下来的。太阳已经偏西）");
  for (const t of [5.0, 19.0, 31.0]) s.Sfx(t, t === 19.0 ? "rifleShot" : "mgBurstFar", { x: MG_AT.x, z: MG_AT.z, volume: 0.4 });
  void nier;
  return s.Done({ durationS: Math.max(walk.tEnd + 1.0, last + 2.0) });
}

function S0703(ctx) {
  const s = new Seq(ctx, "07-3", "冬瓜：就塞个毛巾；坎上的班长和排长");
  const K = id => KU(ctx, "07-3", id);
  const DG = UP(K("Donggua")), medic = UP(K("Medic")), luo = UP(K("Luo")), officer = UP(K("Officer"));
  // 妮儿还坐在车尾（车停在队头前几步；她挂在车尾沿上，只给坐姿片段）
  s.Key("Nier", 0, { clip: VIL.sit });
  // 蹲到担架边：裹着那床单被的冬瓜一直在抖
  s.Eye(0, 2.6, { stance: "stand", look: DG, pitch: -24, toPitch: -30 });
  s.Caption(0.5, 2.8, "（担架里找到冬瓜：身上裹着那床单被，人一直在抖。卫生兵蹲在旁边给别人缠绷带，满手是血）");
  s.Eye(2.6, 4.0, { stance: "crouch", look: DG, pitch: -34 });
  s.Caption(3.6, 3.0, "（按键：掀开被角）");
  s.Caption(6.8, 3.0, "（肚子上塞着一条毛巾，已经吸透了血，黑红发硬）");
  s.Key("Donggua", 0, { talking: false });
  const q = s.Say("StretcherDonggua.01", null, 9.6);
  // 抬头问卫生兵；他头也不抬（一直在给旁边的人缠绷带：CareMedicBandage）
  s.Eye(q - 0.4, 0.9, { stance: "crouch", look: DG, pitch: -34, toLook: medic, toPitch: -14 });
  s.Key("Medic", 0, { stance: "crouch", faceTo: Pt(medic.x - 0.4, medic.z + 1.6), clip: MEDIC_BANDAGE });
  s.Say("StretcherDonggua.02", "Medic");
  // 冬瓜伸手去拽被角：表掀……冷得很
  const cold = s.Say("StretcherDonggua.03", "Donggua");
  s.Key("Donggua", cold - 0.2, { talking: true });
  s.Key("Donggua", s.End("StretcherDonggua.03"), { talking: false });
  s.Eye(cold - 0.5, 0.8, { stance: "crouch", look: medic, pitch: -14, toLook: DG, toPitch: -34 });
  s.Caption(cold + 0.3, 2.8, "（他伸手去拽被角，牙齿打颤。顺子把被角掖回去）");
  // 队头上，班长跟后送队带队的排长蹲在坎上往南看
  const bank = s.End("StretcherDonggua.03") + 1.0;
  s.Eye(bank, 1.4, { stance: "crouch", look: DG, pitch: -34, toLook: luo, toPitch: 6 });
  s.Caption(bank + 0.4, 3.0, "（队头上，班长跟后送队带队的排长蹲在东坎上往南看）");
  s.Key("Officer", 0, { stance: "crouch", faceTo: Pt(100, 400), clip: POINT_CROUCH });   // 蹲在坎上指着南边的庄子
  s.Key("Luo", 0, { stance: "crouch", faceTo: Pt(100, 400), clip: TALK_CROUCH });
  s.Key("Officer", bank + 1.0, { faceTo: "Luo", clip: POINT_CROUCH });
  s.Say("BankLookoutOfficer.01", "Officer", bank + 1.6);
  s.Key("Officer", s.End("BankLookoutOfficer.01") + 0.4, { clip: TALK_CROUCH });
  // 班长回头冲底下凹路里的小队吼，边吼边起身（站起来招手：都跟斗来）
  const yell = s.Say("BankLookoutLuo.01", "Luo", s.End("BankLookoutOfficer.01") + 0.6);
  s.Key("Luo", yell - 0.3, { faceTo: "player" });
  s.Key("Luo", yell + 0.4, { stance: "stand", clip: BECKON });
  s.Eye(yell + 0.6, 1.0, { stance: "crouch", look: luo, pitch: 6, toPitch: 4 });
  s.Eye(yell + 1.6, 1.4, { stance: "crouch", look: luo, pitch: 4, toLook: luo, toPitch: 2 });
  // 班长从坎上下来往前走几步；小队起身跟上（07-4 短过场接着演）
  const go = s.End("BankLookoutLuo.01") + 0.4;
  s.Go("Luo", go, go + 3.2, 98.6, 318.0, { move: "walk", yawDeg: 180, depart: { clip: null } });
  s.Caption(go + 0.2, 2.6, "（班长从坎上下来，带着往前走。都跟斗来）");
  for (const id of ["LiuWencai", "Yaowa", "HeYoutian", "Squad1", "Squad2", "Squad3"]) {
    const cur = s.pos.get(id);
    s.Go(id, go + 1.0, go + 3.4, cur.x, cur.z + 2.4, { move: "walk", yawDeg: 180 });
  }
  s.Sfx(5.0, "mgBurstFar", { x: MG_AT.x, z: MG_AT.z, volume: 0.4 });
  s.Sfx(bank + 0.5, "rifleShot", { x: 100, z: 430, volume: 0.45 });
  void officer;
  return s.Done({ durationS: go + 4.0 });
}

function S0704(ctx) {
  const s = new Seq(ctx, "07-4", "短过场：飞机贴麦地飞过，出洼地望见耿家庄");
  const K = id => KU(ctx, "07-4", id), K8 = id => KU(ctx, "08-1", id);
  const laneFolk = Object.keys(Object.fromEntries((ctx.config.keyframes.find(k => k.id === "07-4").units).filter(u => /^(Walker|Helper)\d+$/.test(u.id)).map(u => [u.id, 1])));
  // —— 飞机：一架九七式轻爆（Ki-30）由北往南贴着麦地低空飞过凹路，不开枪，往南飞过庄子去了。航点按时间升序，
  //    约 70 m/s；凹路上空 20 多米。引擎声（planeDrone）从出现起跟着机身走，4.2 s 放一次通场声（planeDive）。
  const PLANE = "Ki30";
  s.Aircraft(PLANE, {
    model: "MitsubishiKi30",
    path: [{ t: 0.4, x: 92, y: 85, z: 20 }, { t: 3.6, x: 94.5, y: 30, z: 250 }, { t: 4.9, x: 96, y: 22, z: 335 }, { t: 6.6, x: 98, y: 34, z: 455 }, { t: 9.6, x: 104, y: 105, z: 670 }],
    sound: { drone: true, diveT: 4.2 },
  });
  // —— 镜头 ①（约 9 s）：机位在凹路东坎上往南俯看一长溜担架；北边飞机声来了，镜头抬起来看着它掠过头顶，再落回坎底缩着的人
  const BANK = Pt(101.6, 330);
  s.Cam(0, 3.2, { from: { ...BANK, h: 1.7 }, to: { x: 101.8, z: 331.5, h: 1.65 }, look: { x: 96.5, z: 345, h: 0.4 }, lookTo: { x: 96.0, z: 338, h: 0.5 }, ease: "linear", fov: 58 });
  s.Cam(3.2, 3.2, { from: { x: 101.8, z: 331.5, h: 1.65 }, look: { aircraft: PLANE }, ease: "linear", fov: 62 });
  s.Cam(6.4, 2.6, { from: { x: 101.8, z: 331.5, h: 1.65 }, to: { x: 101.9, z: 333, h: 1.6 }, look: { x: 97.5, z: 338, h: 0.4 }, lookTo: { actor: "Nier", offset: [0, 0.5, 0] }, ease: "inOut", fov: 58 });
  s.Caption(0.3, 3.0, "（从坎上往下看：凹路里一长溜担架。北边传来飞机声）");
  s.Shake(4.4, 1.4, 0.08);
  s.Caption(3.4, 3.0, "（一架日机贴着麦地飞过来。路上的人全往土坎底下缩，老耿拽着驴往坎边靠）");
  // 开场大家还站着 / 蹲着（07-3 的样子），听见飞机就扑倒（VilDuckProne：跪、趴、抱头，末帧停住）：小队与后送队错峰
  const DUCK = { clip: VIL.duck, clipHold: true, stance: "prone" };
  for (const id of SQUAD) s.Key(id, 0, { stance: "crouch" });
  SQUAD.forEach((id, k) => s.Key(id, 2.2 + k * 0.25, DUCK));
  s.Key("Officer", 0, { stance: "crouch" }); s.Key("Officer", 2.5, DUCK);
  // 卫生兵这会儿已经跟到队头（07-3 他在冬瓜那副担架边，离队头 25 m）
  { const m = LZ(324, -0.7); s.Place("Medic", 0, m.x, m.z, { stance: "crouch", yawDeg: 180 }); } s.Key("Medic", 3.0, DUCK);
  laneFolk.forEach((id, k) => { s.Key(id, 0, { stance: "crouch" }); s.Key(id, 2.7 + (k % 7) * 0.22, DUCK); });
  // 老耿拽着驴往坎边靠（车跟着挪半步），然后也扑倒
  const gengAt = UP(K("Geng")), cartAt = UP(K("GengCart"));
  s.Place("Geng", 0, gengAt.x - 0.8, gengAt.z - 0.3, { faceTo: Pt(98, 300) });
  s.Go("Geng", 2.4, 4.0, gengAt.x, gengAt.z, { move: "walk", faceTo: Pt(gengAt.x + 2, gengAt.z) });
  s.Key("Geng", 4.5, DUCK);
  s.Place("GengCart", 0, cartAt.x - 0.5, cartAt.z, { yawDeg: 180 });
  s.Go("GengCart", 2.6, 4.2, cartAt.x, cartAt.z, { move: "walk" });
  // 妮儿坐在车尾（VilSitEdge，挂在车尾沿上跟着车挪），听不见飞机；看见别人都趴下了才抬头，这时飞机已经在头顶；她最后一个扑倒。
  // 扑倒前先下车（ride: null）：从车尾沿滑下来站在车尾外头半步、朝北（看着一路趴下的人），再 VilDuckProne 在车边扑倒 ——
  // VilDuckProne 的根在脚下的地上（跪、趴都带贴地修正），挂在车尾沿（根离地 0.467）上播它人会悬在半空；爬上车板缩成一团没有现成片段，
  // 而且她是「看见别人都趴了才学着趴」，跳下来跟大家一样趴在地上更像。
  s.Key("Nier", 0, { clip: VIL.sit });
  s.Caption(5.0, 2.4, "（妮儿是看见别人都趴下了才抬头，这时飞机已经在头顶）");
  const NIER_OFF = 5.6, NIER_DUCK = 6.0;
  const nierOff = Pt(cartAt.x, cartAt.z - CART_TAIL_Z - 0.5);
  s.Key("Nier", NIER_OFF, { ride: null, x: nierOff.x, z: nierOff.z, move: "cut", yawDeg: 0, stance: "stand", clip: null });
  s.Key("Nier", NIER_DUCK, DUCK);
  s.Caption(7.4, 2.4, "（她从车尾滑下来，最后一个趴下。飞机没开枪，往南飞过庄子去了）");
  // —— 镜头 ②（约 7 s）：班长、排长带着全班弯腰顺凹路往前跑，老耿赶着车跟在后头；机位在前头的路中线上往回看，跟着退
  const RUN0 = 9.0, RUN1 = 16.0;
  s.Cam(RUN0, RUN1 - RUN0, { from: { ...LZ(352, 0.2), h: 1.4 }, to: { ...LZ(366, 0.2), h: 1.4 }, look: { actor: "Luo", offset: [0, 1.1, 0] }, ease: "linear", fov: 55 });
  s.Caption(RUN0 + 0.3, 3.2, "（班长、排长带着全班弯腰顺着凹路往前跑，老耿赶着车跟在后头。凹路越走越浅，土坎只剩齐腰高）");
  const runTo = (id, to, t0, t1, extra = {}) => { const r = Route(s.pos.get(id), to); s.Go(id, t0, t1, r.end.x, r.end.z, { move: "run", path: r.path, depart: { stance: "crouch", clip: null }, stance: "crouch", ...extra }); };
  runTo("Luo", LZ(360, 0.3), RUN0, RUN0 + 4.6); runTo("Officer", LZ(359, -0.6), RUN0 + 0.3, RUN0 + 4.9);
  ["LiuWencai", "Yaowa", "HeYoutian", "Squad1", "Squad2", "Squad3"].forEach((id, k) => runTo(id, LZ(354 - k * 1.6, k % 2 ? 0.5 : -0.5), RUN0 + 0.6 + k * 0.2, RUN0 + 5.4 + k * 0.2));
  // 后送队的人飞机过了才慢慢起来，还是缩在坎底（蹲着）
  laneFolk.forEach((id, k) => s.Key(id, RUN0 + 1.0 + (k % 5) * 0.3, { clip: null, stance: "crouch" }));
  s.Key("Medic", RUN0 + 0.8, { clip: null, stance: "crouch" });
  s.Go("GengCart", RUN0 + 1.6, RUN1 + 0.6, LZ(348, 0.3).x, LZ(348, 0.3).z, { move: "walk", speed: 1.6 });
  s.Go("Geng", RUN0 + 1.6, RUN1 + 0.6, LZ(350, -1.3).x, LZ(350, -1.3).z, { move: "walk", depart: { stance: "stand", clip: null } });
  s.Go("Nier", RUN0 + 2.0, RUN1 + 0.8, LZ(346.5, 0.8).x, LZ(346.5, 0.8).z, { move: "walk", depart: { stance: "stand", clip: null } });
  // —— 镜头 ③（约 6 s）：路爬出洼地，麦地那头就是耿家庄：土坯院墙和树，几处房顶冒烟，庄子里一阵一阵响枪
  const V0 = RUN1, V1 = RUN1 + 6.0;
  s.Cam(V0, V1 - V0, { from: { x: 103.6, z: 364.5, h: 1.6 }, to: { x: 103.0, z: 368.5, h: 1.6 }, look: { x: 100, z: 468, h: 2.6 }, ease: "linear", fov: 56 });
  for (const [x, z] of [[100, 474], [160, 450], [70, 452]]) s.Ev(0, "smoke", { x, z, kind: "SmokeBlack", dur: V1 + 4 });
  s.Caption(V0 + 0.3, 3.2, "（路爬出洼地，麦地那头就是耿家庄：一片土坯院墙和树，几处房顶冒着烟，庄子里一阵一阵响枪）");
  WindowBurst(s, V0 + 0.8, { volume: 0.55, muzzle: false });
  s.Sfx(V0 + 2.6, "rifleShot", { x: 100, z: 430, volume: 0.5 });
  s.Sfx(V0 + 3.8, "rifleShot", { x: 150, z: 465, volume: 0.4 });
  WindowBurst(s, V0 + 4.6, { volume: 0.6, muzzle: false });
  // 全班继续顺凹路跑到村口路沟（08-1 的位置）；车跟到沟东半截
  for (const id of [...SQUAD, "Officer", "Medic"]) { const to = K8(id); runTo(id, to, V0 + 0.4, V1 + 1.0, { yawDeg: to.yawDeg, ...(to.aim ? { aim: true } : {}), stance: to.stance || "crouch" }); }
  void NIER_DUCK;
  // 车、老耿、妮儿只跟到凹路尽头（then 跳到 08-1 时直接到沟东半截的位置）
  { const to = LZ(368, 0.3); s.Go("GengCart", V0 + 1.0, V1 + 1.6, to.x, to.z, { move: "walk" }); }
  { const to = LZ(370, -1.3); s.Go("Geng", V0 + 1.0, V1 + 1.6, to.x, to.z, { move: "walk" }); }
  { const to = LZ(366, 0.8); s.Go("Nier", V0 + 1.4, V1 + 1.8, to.x, to.z, { move: "walk", stance: "crouch" }); }
  // —— 切回第一人称：顺子趴在村口路沟的沟沿（街口坡道上半截）上，顺着主街看过去，接 08
  const P8 = KP(ctx, "08-1");
  s.Eye(V1 + 0.2, 2.6, { stance: "prone", x: P8.x, z: P8.z, yaw: 180, pitch: -1 });
  s.Caption(V1 + 0.5, 2.4, "（切回第一人称：顺子趴在村口外的路沟沿后头。接 08）");
  return s.Done({ durationS: V1 + 2.8 });
}

// ---------------------------------------------------------------------------
// 08 村口

function S0801(ctx) {
  const s = new Seq(ctx, "08-1", "村口：窗口的机枪顺着街扫");
  const K = id => KU(ctx, "08-1", id);
  // 五个村民从主街上往村外跑（都先摆在大车北边的街上）
  const start = { Villager1: Pt(99.2, 434), Villager2: Pt(100.6, 438), Villager3: Pt(99.4, 442), Villager4: Pt(101.4, 436), Villager5: Pt(98.6, 440) };
  // 都弓着身子慌跑（VilPanicRun：原地循环，身体时钟按实际速度推）
  for (const [id, p] of Object.entries(start)) s.Place(id, 0, p.x, p.z, { state: "alive", stance: "stand", yawDeg: 0, clip: VIL.panic });
  s.Eye(0, 2.4, { stance: "prone", yaw: 180, pitch: -1 });
  s.Caption(0.3, 2.6, "（趴在沟沿上顺着主街看到尽头：几个村民从主街上往村外跑）");
  const RUN = 2.6;
  const RunTo = (id, to, t0 = 0.4, extra = {}) => s.Go(id, t0, R(t0 + Dist(s.pos.get(id), to) / RUN), to.x, to.z, { move: "run", yawDeg: 0, ...extra });
  // 街尽头前屋窗口里机枪打出来：先倒一个（远的那个），再倒一个（中枪倒下 ShotCollapse，倒定了再记 down）
  const Shot2Down = (id, t, yaw) => { s.Key(id, t, { clip: "ShotCollapse", clipHold: true }); s.Key(id, t + 1.4, { state: "down", clip: null, yawDeg: yaw }); };
  const fall3 = UP(K("Villager3")), fall2 = UP(K("Villager2"));
  RunTo("Villager3", fall3);
  const t3 = s.pos.get("Villager3").t;
  WindowBurst(s, t3 - 0.3, { volume: 0.8, puffAt: Off(fall3, -0.8, -1.2) });
  Shot2Down("Villager3", t3, K("Villager3").yawDeg);
  s.Caption(t3 - 0.2, 2.6, "（街尽头那间前屋的窗口里，鬼子的机枪打出来，倒下一个）");
  RunTo("Villager2", fall2);
  const t2 = s.pos.get("Villager2").t;
  WindowBurst(s, t2 - 0.3, { volume: 0.8, puffAt: Off(fall2, 0.9, -1.5) });
  Shot2Down("Villager2", t2, K("Villager2").yawDeg);
  // 剩下的跑出街口：两个顺着坡道下沟、缩到后送队那边不见了；一个滚进小队这边的沟里
  for (const id of ["Villager4", "Villager5"]) {
    const out = id === "Villager4" ? Pt(105.6, 381.6) : Pt(104.2, 382.4);
    RunTo(id, out, 0.4, { path: [Pt(101.6, 388), Pt(102.2, 384.6)] });
    s.Key(id, s.pos.get(id).t + 0.2, { visible: false, clip: null });
  }
  const v1 = UP(K("Villager1"));
  RunTo("Villager1", v1, 0.4, { path: [Pt(97.6, 388), Pt(96.9, 382.2)] });
  const t1 = s.pos.get("Villager1").t;
  s.Key("Villager1", t1, { stance: "crouch", faceTo: "player", clip: VIL.crouch });
  s.Caption(t1, 2.4, "（剩下的一个滚进路沟，趴在顺子脚边）");
  // 眼睛：顺着街看倒下的人，再回头看脚边滚进来的
  s.Eye(2.4, 1.0, { stance: "prone", yaw: 180, pitch: -1, toLook: fall3, toPitch: -1 });
  s.Eye(t2 - 0.6, 0.8, { stance: "prone", look: fall3, pitch: -1, toLook: fall2, toPitch: -1 });
  s.Eye(t1 - 1.0, 1.0, { stance: "prone", look: fall2, pitch: -1, toLook: v1, toPitch: -14 });
  s.Say("VillageMouth.01", "Villager1", t1 + 0.8);
  s.Caption(s.End("VillageMouth.01") + 0.2, 2.4, "（他之后跟着后送队一起走）");
  // 老耿盯着那扇窗口，半天才说出来
  const geng = UP(K("Geng"));
  s.Key("Geng", 0, { faceTo: WINDOW });
  s.Eye(s.End("VillageMouth.01") + 0.8, 1.2, { stance: "prone", look: v1, pitch: -14, toLook: geng, toPitch: -4 });
  const home = s.Say("GengHome.01", "Geng", s.End("VillageMouth.01") + 2.2);
  s.Caption(home + 0.2, 2.6, "（老耿盯着那扇窗口。那是他家）");
  s.Eye(s.End("GengHome.01") + 0.4, 1.2, { stance: "prone", look: geng, pitch: -4, toLook: WINDOW, toPitch: -1 });
  WindowBurst(s, s.End("GengHome.01") + 1.0, { volume: 0.8, puffAt: Pt(99.6, 388) });
  return s.Done({ durationS: s.End("GengHome.01") + 3.6 });
}

function S0802(ctx) {
  const s = new Seq(ctx, "08-2", "绕不过去：闩死了、等天黑、打");
  const K = id => KU(ctx, "08-2", id);
  const geng = UP(K("Geng")), officer = UP(K("Officer")), luo = UP(K("Luo")), medic = UP(K("Medic"));
  // 回头看沟底：班长（蹲着，枪立在手边）扭头问趴在旁边的老耿
  s.Key("Luo", 0, { faceTo: "Geng", clip: TALK_CROUCH });
  s.Eye(0, 1.6, { stance: "prone", look: luo, pitch: 4 });
  const ask = s.Say("NoWayAround.01", "Luo", 1.0);
  s.Key("Geng", ask + 0.6, { faceTo: "Luo" });
  s.Eye(ask + 1.4, 1.0, { stance: "prone", look: luo, pitch: 4, toLook: geng, toPitch: 4 });
  // 老耿一边说一边用手朝西、朝东、朝两边院子比（站着指：PvStandPointL，每指一处重起一遍）
  const west = s.Say("NoWayAround.02", "Geng");
  s.Key("Geng", west + 0.2, { faceTo: Pt(PL.river.x, 400), clip: POINT_STAND });
  s.Key("Geng", west + 3.0, { faceTo: Pt(160, 465), clip: POINT_STAND });
  s.Key("Geng", west + 5.4, { faceTo: Pt(104, 420), clip: POINT_STAND });
  s.Key("Geng", s.End("NoWayAround.02"), { faceTo: "Luo", clip: null });
  s.Caption(s.End("NoWayAround.02") + 0.2, 3.2, "（墙根有个狗洞，老耿没想起来：那是小孩走的路，大人眼里没有）");
  // 排长在后头几步接一句；顺子一下子顶回去；卫生兵头也不抬补一句（一直在缠绷带）
  s.Eye(s.End("NoWayAround.02") + 0.6, 1.0, { stance: "prone", look: geng, pitch: 4, toLook: officer, toPitch: 4 });
  s.Key("Officer", 0, { faceTo: "Luo", clip: TALK_CROUCH });
  s.Say("NoWayAround.03", "Officer", s.End("NoWayAround.02") + 1.6);
  s.Say("DecideShunzi.01", null, s.End("NoWayAround.03") + 0.4);
  s.Eye(s.End("NoWayAround.03") + 0.2, 0.8, { stance: "prone", look: officer, pitch: 4, toLook: medic, toPitch: 3 });
  s.Key("Medic", 0, { stance: "crouch", faceTo: Pt(medic.x + 1.5, medic.z + 0.4), clip: MEDIC_BANDAGE });
  s.Say("DecideMedic.01", "Medic", s.End("DecideShunzi.01") + 0.5);
  // 班长盯着窗口啐了一口：打！点名时一个一个指（蹲着指：PvCrouchPointL，每点一个重起一遍）
  s.Eye(s.End("DecideMedic.01") + 0.2, 1.0, { stance: "prone", look: medic, pitch: 3, toLook: luo, toPitch: 4 });
  s.Key("Luo", s.End("DecideMedic.01") + 0.3, { faceTo: WINDOW });
  s.Caption(s.End("DecideMedic.01") + 0.6, 2.4, "（班长盯着窗口，啐了一口）");
  const order = s.Say("DecideLuo.01", "Luo", s.End("DecideMedic.01") + 2.4);
  s.Key("Luo", order + 1.6, { faceTo: "LiuWencai", clip: POINT_CROUCH });
  s.Key("Luo", order + 2.6, { faceTo: "Yaowa", clip: POINT_CROUCH });
  s.Key("Luo", order + 3.4, { faceTo: "player", clip: POINT_CROUCH });
  s.Key("Luo", order + 7.6, { faceTo: "HeYoutian", clip: POINT_CROUCH });
  s.Key("Luo", order + 8.8, { faceTo: "Escort1", clip: POINT_CROUCH });
  s.Key("Luo", s.End("DecideLuo.01") + 0.4, { faceTo: WINDOW, clip: null });
  // 幺娃掉头趴回去瞄窗口；班长、何有田、两个兵起身准备往前摸
  s.Key("Yaowa", s.End("DecideLuo.01") + 0.3, { faceTo: WINDOW, aim: true });
  for (const id of ["HeYoutian", "Escort1", "Escort2"]) s.Key(id, s.End("DecideLuo.01") + 0.6, { faceTo: "Luo" });
  s.Eye(s.End("DecideLuo.01") + 0.4, 1.4, { stance: "prone", look: luo, pitch: 4, toLook: WINDOW, toPitch: -1 });
  WindowBurst(s, 3.0, { volume: 0.8, puffAt: Pt(100.4, 388) });
  WindowBurst(s, s.End("NoWayAround.03") + 1.0, { volume: 0.8, puffAt: Pt(99.2, 387) });
  return s.Done({ durationS: s.End("DecideLuo.01") + 2.6 });
}

function S0803(ctx) {
  const s = new Seq(ctx, "08-3", "压窗口：班长四人顺街东边摸到大车后头");
  const K = id => KU(ctx, "08-3", id), K2 = id => KU(ctx, "08-2", id);
  const P = KP(ctx, "08-3");
  const RIM = Pt(P.x + 0.8, P.z + 1.2);           // 机枪打沟沿时土溅在顺子旁边
  // 开场：班长四人还在沟底街口（08-2 的位置）；过道里的两杆枪还在前屋
  for (const id of ["Luo", "HeYoutian", "Escort1", "Escort2"]) { const u = K2(id); s.Place(id, 0, u.x, u.z, { stance: "crouch", state: "alive", yawDeg: 180 }); }
  for (const id of ["Rifle1", "Rifle2"]) { const u = K2(id); s.Place(id, 0, u.x, u.z, { yawDeg: 0, aim: true }); }
  s.Eye(0, 44, { stance: "prone", yaw: 180, pitch: -1, shake: 0.05 });
  s.Caption(0.3, 3.0, "（趴在沟沿上朝窗口打。班长带何有田和后送队的两个兵，顺着街东边一个门洞一个门洞往前摸）");
  // 玩家打一阵、停一下（换弹）：这边一打，窗口就回一梭打沟沿；一停火，机枪就掉头追着班长打
  const fire = [[0.8, 3], [5.6, 3], [12.0, 4], [19.4, 3], [27.0, 4], [36.0, 3]];
  for (const [t, n] of fire) { Shot(s, t, "player", { count: n, interval: 0.6 }); MouthFire(s, t + 0.4, { who: ["Yaowa", "LiuWencai", "Squad3"] }); }
  const legs = [[Pt(102.3, 392.0), 3.0], [Pt(102.3, 408.5), 9.4], [Pt(102.3, 432.5), 21.6], [UP(K("Luo")), 29.6]];
  const mates = { HeYoutian: [-0.2, -1.8], Escort1: [-0.4, -3.4], Escort2: [-0.6, -5.0] };
  let prevT = 0;
  for (const [to, t0] of legs) {
    const dur = R(Dist(s.pos.get("Luo"), to) / 3.2);
    const isLast = to === legs[legs.length - 1][0];
    s.Go("Luo", t0, t0 + dur, to.x, to.z, { move: "run", stance: "crouch", aim: true, faceTo: WINDOW });
    for (const [id, [dx, dz]] of Object.entries(mates)) {
      const tgt = isLast ? UP(K(id)) : Off(to, dx, dz);
      s.Go(id, t0 + 0.4, t0 + 0.4 + dur, tgt.x, tgt.z, { move: "run", stance: "crouch", faceTo: WINDOW });
    }
    // 窗口：先回一梭打沟沿（玩家在打），玩家停火那一刻掉头打班长
    WindowBurst(s, t0 - 1.6, { volume: 0.9, puffAt: RIM });
    WindowBurst(s, t0 + dur + 0.6, { volume: 0.9, puffAt: Off(to, -1.6, -1.2) });
    prevT = t0 + dur;
  }
  s.Caption(9.0, 3.4, "（换弹——玩家一停火，机枪就掉头追着班长打。这一段教会玩家：这边一打，窗口就回一梭）");
  const press = s.Say("PressWindow.01", "Luo", 11.0);
  s.Key("Luo", press - 0.3, { faceTo: "player" });
  s.Key("Luo", s.End("PressWindow.01") + 0.2, { faceTo: WINDOW });
  // 前屋里的两杆枪挪到大门过道（穿后院走，不从前门露头）
  for (const id of ["Rifle1", "Rifle2"]) {
    const to = UP(K(id));
    s.Go(id, 16.0, 24.0, to.x, to.z, { move: "run", path: [Pt(ROOM_YARD_DOOR.x, 476.7), Pt(ROOM_YARD_DOOR.x, 479.4), Pt(GATE_X, 480.8)], yawDeg: 0, aim: true });
  }
  s.Caption(24.4, 3.0, "（大门过道里又添了几杆枪）");
  // 班长摸到大车后头；一颗手榴弹从门楼后头甩出来，炸在大车边上，一个兵倒了
  const atCart = prevT;
  s.Caption(atCart + 0.4, 2.6, "（班长摸到街当中翻倒的那辆大车后头）");
  const toss = atCart + 2.4;
  const land = Off(CART_WRECK, 1.9, 1.3);
  s.Key("GateIja1", toss, { throw: { x: land.x, z: land.z, flightS: 1.6 } });
  const boom = R(toss + 2.15 + 1.6);
  s.Sfx(boom, "grenadeBlast", { x: land.x, z: land.z, volume: 0.9 });
  s.Ev(boom, "explosion", { x: land.x, z: land.z, kind: "grenade", radius: 2.4 });
  s.Ev(boom + 0.1, "smoke", { x: land.x, z: land.z, kind: "SmokeDust", dur: 4 });
  s.Shake(boom, 0.5, 0.35);
  s.Key("Escort2", boom + 0.1, { clip: "ShotCollapse", clipHold: true });
  s.Key("Escort2", boom + 1.6, { state: "down", clip: null, yawDeg: K("Escort2").yawDeg });
  s.Caption(boom + 0.3, 3.2, "（一颗手榴弹从门楼后头甩出来，炸在大车边上，一个兵倒了）");
  // 卡在大车后头，进不得也退不得
  const stuck = s.Say("PressWindow.02", "Luo", boom + 2.0);
  s.Key("Luo", stuck - 0.2, { faceTo: "player" });
  s.Caption(s.End("PressWindow.02") + 0.2, 3.0, "（班长卡在大车后头，进不得也退不得。玩家一直压着窗口）");
  WindowBurst(s, s.End("PressWindow.02") + 0.6, { volume: 0.9, puffAt: Off(CART_WRECK, -1.4, -1.6) });
  Shot(s, s.End("PressWindow.02") + 1.8, "player", { count: 3, interval: 0.6 });
  return s.Done({ durationS: s.End("PressWindow.02") + 4.0 });
}

function S0804(ctx) {
  const s = new Seq(ctx, "08-4", "跑了一个：往东边喊人去了");
  const K = id => KU(ctx, "08-4", id), K3 = id => KU(ctx, "08-3", id);
  const seen = UP(K("GateIja2"));                 // 大车西边、街口能看见他的那几步
  const g0 = UP(K3("GateIja2"));
  s.Place("GateIja2", 0, g0.x, g0.z, { yawDeg: 0, aim: false });
  s.Eye(0, 3.0, { stance: "prone", yaw: 180, pitch: -1 });
  Shot(s, 0.6, "player", { count: 3, interval: 0.6 }); MouthFire(s, 1.0);
  WindowBurst(s, 2.4, { volume: 0.9, puffAt: Pt(98.4, 385.6) });
  // 他从大门出来横过小空地、贴西墙往街里跑几步（这几步从沟沿看得见），再掉头从北角拐去东街
  const out = Pt(GATE_X, 467.6), westWall = Pt(97.8, 460.5);
  s.Go("GateIja2", 3.0, 4.6, out.x, out.z, { move: "run" });
  s.Go("GateIja2", 4.6, 7.4, westWall.x, westWall.z, { move: "run" });
  s.Go("GateIja2", 7.4, 10.0, seen.x, seen.z, { move: "run", yawDeg: 0 });
  s.Caption(5.0, 3.0, "（一个鬼子从老耿家大门跑出来，贴着街西墙往街里跑了几步）");
  s.Eye(3.0, 1.0, { stance: "prone", yaw: 180, pitch: -1, toLook: westWall, toPitch: -1 });
  s.Eye(7.4, 2.6, { stance: "prone", look: westWall, pitch: -1, toLook: seen, toPitch: -1 });
  s.Say("RunnerEast.01", "Yaowa", 8.6);
  s.Key("Yaowa", 8.3, { aim: false, faceTo: seen });
  // 掉头：穿北角、过东街口往东跑
  s.Go("GateIja2", 10.0, 12.0, 107.4, 456.0, { move: "run" });
  s.Go("GateIja2", 12.0, 13.4, 112.6, 461.4, { move: "run" });
  s.Go("GateIja2", 13.4, 15.0, ST.east.fromX + 1.5, ST.east.z, { move: "run" });
  s.Go("GateIja2", 15.0, 18.6, 132, ST.east.z, { move: "run" });
  s.Key("GateIja2", 18.8, { visible: false });
  s.Caption(10.4, 2.6, "（掉头横穿路口往东街跑了）");
  s.Say("RunnerEast.02", "LiuWencai", s.End("RunnerEast.01") + 0.5);
  s.Key("Yaowa", s.End("RunnerEast.02") + 0.4, { aim: true, faceTo: WINDOW });
  s.Eye(10.0, 1.4, { stance: "prone", look: seen, pitch: -1, toLook: Pt(104, 456), toPitch: -1 });
  s.Eye(12.4, 1.2, { stance: "prone", look: Pt(104, 456), pitch: -1, toLook: WINDOW, toPitch: -1 });
  s.Caption(s.End("RunnerEast.02") + 0.4, 2.6, "（他是去喊大队的。压窗口的节奏不变）");
  Shot(s, 13.6, "player", { count: 3, interval: 0.6 }); MouthFire(s, 14.0);
  WindowBurst(s, 15.4, { volume: 0.9, puffAt: Off(CART_WRECK, -1.2, -1.4) });
  return s.Done({ durationS: 19.0 });
}

function S0805(ctx) {
  const s = new Seq(ctx, "08-5", "妮儿跑：顺路沟往西，钻进巷子");
  const K = id => KU(ctx, "08-5", id), K4 = id => KU(ctx, "08-4", id);
  const P = KP(ctx, "08-5");
  const nier0 = UP(K4("Nier")), geng0 = UP(K4("Geng"));
  // 开场：妮儿还蹲在车尾（蹲着抱膝）；她身边靠坎坐着一个伤兵（布设里他在 x 114，这里挪到她身边两步，倒在哪算哪）
  s.Place("Nier", 0, nier0.x, nier0.z, { stance: "crouch", yawDeg: 135, clip: VIL.crouch });
  s.Place("Geng", 0, geng0.x, geng0.z, { stance: "stand", faceTo: WINDOW });
  const hurt = Pt(104.6, 380.9);
  s.Place("Walker04", 0, hurt.x, hurt.z, { stance: "crouch", state: "alive", yawDeg: 160 });
  s.Place("Yaowa", 0, K4("Yaowa").x, K4("Yaowa").z, { stance: "prone", aim: true, yawDeg: 178 });
  s.Eye(0, 2.0, { stance: "prone", yaw: 180, pitch: -1 });
  Shot(s, 0.4, "player", { count: 3, interval: 0.6 });
  // 机枪一梭扫到沟里：妮儿身边那个伤兵中枪，血溅了她一脸
  const sweep = 2.0;
  WindowBurst(s, sweep, { volume: 1.0, count: 8 });
  Puff(s, sweep + 0.3, Pt(101.8, 383.6)); Puff(s, sweep + 0.5, Pt(103.2, 381.8)); Puff(s, sweep + 0.7, Off(hurt, 0.4, 0.3));
  s.Key("Walker04", sweep + 0.75, { clip: "ShotCollapse", clipHold: true });
  s.Key("Walker04", sweep + 2.1, { state: "down", clip: null, yawDeg: 160 });
  s.Sfx(sweep + 0.8, "bodyFall", hurt);
  s.Caption(sweep + 0.6, 3.0, "（机枪扫到沟里：妮儿身边一个伤兵中枪，血溅了她一脸）");
  s.Eye(2.0, 1.0, { stance: "prone", yaw: 180, pitch: -1, toLook: hurt, toPitch: 2 });
  // 她爬起来就跑（VilPanicRun 弓着身子慌跑）：顺着路沟往西、横穿街口、爬上南沿钻进巷子（她听不见，子弹追着她的脚后跟打在土里）
  const run0 = sweep + 1.6;
  const alleyIn = Pt(ST.alleyNorth.x, ST.alleyNorth.fromZ + 6);
  const r = Route(nier0, alleyIn);
  const len = RouteLen(nier0, [...r.path, r.end]);
  const run1 = R(run0 + len / 2.9);
  s.Go("Nier", run0, run1, r.end.x, r.end.z, { move: "run", path: r.path, depart: { stance: "stand", clip: VIL.panic } });
  s.Key("Nier", run1 + 0.3, { visible: false, clip: null });
  s.Caption(run0 + 0.2, 3.2, "（她爬起来就跑：顺着路沟往西，横穿街口，钻进巷子——那是她回家的路。她听不见枪声）");
  const pts = [...r.path, r.end];
  const AtFrac = f => { const want = len * f; let acc = 0, cur = nier0; for (const p of pts) { const d = Dist(cur, p); if (acc + d >= want) { const k = (want - acc) / d; return Pt(cur.x + (p.x - cur.x) * k, cur.z + (p.z - cur.z) * k); } acc += d; cur = p; } return r.end; };
  WindowBurst(s, run0 + 1.2, { volume: 1.0, count: 8 });
  for (const f of [0.25, 0.33, 0.42, 0.52, 0.6]) { const p = AtFrac(f); Puff(s, run0 + (run1 - run0) * f + 0.2, Off(p, 0.4, 0.6)); }
  s.Caption(run0 + 3.6, 2.6, "（子弹追着她的脚后跟打在土里）");
  s.Eye(run0, 1.2, { stance: "prone", look: hurt, pitch: 2, toLook: Pt(99, 381), toPitch: 2 });
  // 眼睛跟着她往西看；老耿爬出沟喊的那几秒扭头看他被拽回去，再看巷子口
  const GENG_RIM = Pt(99.4, 383.6), T_YANK = run0 + 1.0 + 2.4;
  s.Eye(run0 + 1.2, T_YANK - 0.4 - (run0 + 1.2), { stance: "prone", look: Pt(99, 381), pitch: 2, toLook: Pt(90, 381.5), toPitch: 1 });
  s.Eye(T_YANK - 0.4, 3.2, { stance: "prone", look: Pt(90, 381.5), pitch: 1, toLook: GENG_RIM, toPitch: 4 });
  s.Eye(T_YANK + 2.8, run1 - (T_YANK + 2.8), { stance: "prone", look: GENG_RIM, pitch: 4, toLook: ALLEY_MOUTH, toPitch: 0 });
  // 老耿爬出沟去追，趴在沟沿上往巷子口伸手喊（VilReachPinned），一梭子打在他跟前；幺娃从后头揪住他腰带一把拽回来（VilNraYankBack）
  // —— 成对动作按清单 stage yankBack：幺娃在他身后 0.75 m、同向，两段同时起播，1.40 s 揪住拽，播完两人都落在清单 root.end（往后 0.66 / 0.58 m）
  const chase = run0 + 1.0;
  s.Say("NierRuns.01", "Geng", chase);
  const rimW = Pt(99.4, 383.6), rimYaw = Yaw(rimW, ALLEY_MOUTH);
  s.Go("Geng", chase + 0.4, chase + 2.0, rimW.x, rimW.z, { move: "run", yawDeg: rimYaw });
  const yk = StagePlace("yankBack", "yanker", rimW, rimYaw);
  s.Go("Yaowa", chase + 0.8, chase + 2.2, yk.x, yk.z, { move: "run", depart: { stance: "crouch", aim: false }, stance: "crouch", yawDeg: yk.yawDeg });
  const T = chase + 2.4;
  s.Key("Geng", T, { clip: VIL.reach });
  s.Key("Yaowa", T, { clip: VIL.yank });
  WindowBurst(s, T + 0.5, { volume: 1.0, puffAt: Fwd(rimW, rimYaw, 1.6, -0.4) });
  s.Say("NierRuns.02", "Yaowa", T + 1.5);
  const gEnd = RootEndAt(VIL.reach, rimW, rimYaw), yEnd = RootEndAt(VIL.yank, yk, yk.yawDeg);
  s.Key("Geng", T + VilClipS(VIL.reach), { x: gEnd.x, z: gEnd.z, move: "cut", clip: null, stance: "crouch", yawDeg: rimYaw });
  s.Key("Yaowa", T + VilClipS(VIL.yank), { x: yEnd.x, z: yEnd.z, move: "cut", clip: null, stance: "crouch", faceTo: "Geng" });
  s.Caption(T + 1.4, 2.6, "（幺娃一把把他拽回沟里）");
  s.Go("Geng", T + 3.0, T + 4.2, UP(K("Geng")).x, UP(K("Geng")).z, { move: "walk", stance: "crouch", faceTo: "player" });
  // 老总！俺妮儿——！（蹲着朝巷子口指）顺子趴的地方离巷子口最近；没人下令
  const plead = s.Say("NierRuns.03", "Geng", T + 4.6);
  s.Key("Geng", plead - 0.2, { clip: POINT_CROUCH });
  s.Key("Geng", s.End("NierRuns.03") + 0.4, { clip: null });
  s.Caption(s.End("NierRuns.03") + 0.2, 2.8, "（顺子趴的地方离巷子口最近。没人下令；玩家不动，老耿就再喊一遍）");
  // 顺子爬起来往巷子里冲：眼睛从坡道下沟、顺沟底往西、到巷子口
  const go = s.End("NierRuns.03") + 2.6;
  const eyeA = Pt(P.x, P.z), eyeB = Pt(97.2, 381.2), eyeC = Pt(84, 380.6), eyeD = Pt(ALLEY_MOUTH.x, ALLEY_MOUTH.z + 1.5);
  s.Eye(go - 0.8, 0.8, { stance: "prone", look: ALLEY_MOUTH, pitch: 0, toPitch: -2 });
  s.Creep(go, 1.4, eyeA, eyeB, Pt(90, 381), { h: 1.3, lookH: 1.0 });
  s.Creep(go + 1.4, 4.2, eyeB, eyeC, Pt(ALLEY_MOUTH.x, ALLEY_MOUTH.z + 4), { h: 1.5, lookH: 1.0, ease: "linear" });
  s.Creep(go + 5.6, 2.0, eyeC, eyeD, Pt(ST.alleyNorth.x, 398), { h: 1.55, lookH: 1.0 });
  s.Caption(go + 0.2, 2.6, "（顺子爬起来往巷子里冲）");
  const yell = s.Say("NierRuns.04", "LiuWencai", go + 1.6);
  s.Key("LiuWencai", yell - 0.3, { aim: false, faceTo: Pt(90, 381) });
  s.Caption(s.End("NierRuns.04") + 0.2, 2.8, "（他以为顺子要开小差）");
  WindowBurst(s, go + 3.0, { volume: 0.9, puffAt: Pt(99.0, 385.2) });
  void plead;
  return s.Done({ durationS: go + 8.6 });
}

// ---------------------------------------------------------------------------
// 09 摸进老耿家

function S0901(ctx) {
  const s = new Seq(ctx, "09-1", "巷子：追妮儿；机枪响就挪，一停就贴墙");
  const X = ST.alleySouth.x;
  const NIER_DOOR = UP(KU(ctx, "09-1", "Nier"));
  const LOOK = z => Pt(X, z);
  // 开场：顺子刚拐进南北那截巷子；妮儿在前头十几米慌跑着（VilPanicRun），往邻院敞着的小门去
  s.Place("Nier", 0, X + 0.3, 446, { stance: "stand", yawDeg: 180, clip: VIL.panic });
  const doorOut = Pt(PL.neighborDoor.x - 0.9, NB.westDoor.z);
  const toDoor = s.Walk("Nier", 0.4, doorOut, { move: "run", speed: 2.9 });
  s.Walk("Nier", toDoor, NIER_DOOR, { move: "run", speed: 2.6, yawDeg: NIER_DOOR.yawDeg ?? -140, clip: null, stance: "crouch" });
  const start = Pt(X, 432);
  s.Eye(0, 2.2, { stance: "crouch", x: start.x, z: start.z, look: Pt(X, 470), pitch: 0 });
  s.Caption(0.3, 3.2, "（巷子两边都是院墙，又窄又直。妮儿跑在前头，往南去了）");
  s.Caption(3.8, 3.0, "（街口那边一直在打：机枪回一梭就挪一段，一停就贴墙不动。这个节奏 08 自己在沟沿上打出来过）");
  // 四段：每段「街口打 → 机枪回一梭」时挪一段，停下贴墙
  const stops = [start, LOOK(446), LOOK(460), LOOK(474), LOOK(487)];
  const t = CreepLegs(s, 2.2, stops, i => (i < 4 ? LOOK(stops[i].z + 24) : Pt(PL.neighborDoor.x + 1.5, NB.westDoor.z)), {
    volume: 0.55, pause: 2.6, speed: 2.4,
    onStop: (i, mv0, mv1) => {
      if (i === 2) {
        // 第二段停下时：院子那头有鬼子指着窖口在吼「出来！」（VilIjaShoutPoint），地底下有人在哭
        s.Say("CellarShout.01", "CellarIja1", mv1 + 0.6);
        s.Say("CellarShout.02", "CellarIja1");
        s.Caption(s.End("CellarShout.02") + 0.2, 2.8, "（老耿家后院那头。地底下有人在哭。只听得见，看不见：这是三下里的第一下）");
        s.Key("CellarIja1", mv1, { faceTo: CELLAR, clip: VIL.shout });
        s.Key("CellarIja1", s.End("CellarShout.02") + 0.8, { clip: null });
        // 地底下有人在哭：cellarSob（Sfx_CellarSob.mp3，4 s）从窖口放（窖底 −1.7，声源在地面下 0.7 m），吼完接着哭一遍
        s.Sfx(mv1 + 0.3, "cellarSob", { x: CELLAR.x, z: CELLAR.z, volume: 0.7 });
        s.Sfx(s.End("CellarShout.02") + 0.3, "cellarSob", { x: CELLAR.x, z: CELLAR.z, volume: 0.6 });
        return s.End("CellarShout.02") + 3.2;
      }
      if (i === 3) s.Caption(mv1 + 0.4, 2.6, "（妮儿拐进了邻院敞着的小门：邻院的人跑的时候没顾上关）");
      return null;
    },
  });
  s.Eye(t - 2.0, 2.0, { stance: "crouch", x: stops[4].x, z: stops[4].z, look: Pt(PL.neighborDoor.x + 1.5, NB.westDoor.z), pitch: 0, toLook: Pt(PL.neighborDoor.x + 6, 489), toPitch: -4 });
  s.Caption(t - 1.6, 2.4, "（跟进邻院）");
  return s.Done({ durationS: t + 0.6 });
}

function S0902(ctx) {
  const s = new Seq(ctx, "09-2", "狗洞：她一头钻进去，大人钻不过");
  const K = id => KU(ctx, "09-2", id);
  const P = KP(ctx, "09-2");
  const HOLE = Pt(PL.dogHole.x, PL.dogHole.z);
  const haystack = UP(KU(ctx, "09-3", "Nier"));
  // 妮儿在狗洞西口蹲着，趴下手脚并用钻过去（VilCrawlHole：清单 stage dogHole——洞在起点前 0.4…1.0 m，往前爬 1.5 m 蹲起；
  // 小孩身体缩到 0.62，位移也缩成 0.93 m：根放在墙西面外 0.25 m，爬完骨盆在墙东面外 0.18 m，再切到墙边站得开的地方）
  const HOLE_W = Pt(WALL_X - WALL_T / 2 - 0.25, HOLE.z);
  s.Place("Nier", 0, HOLE.x - 1.6, HOLE.z + 0.4, { stance: "crouch", faceTo: HOLE, clip: VIL.crouch });
  s.Eye(0, 3.0, { stance: "crouch", look: HOLE, pitch: -30 });
  s.Caption(0.3, 3.0, "（墙根有个狗洞，0.45 m 宽、0.4 m 高。她从小就这么钻）");
  s.Go("Nier", 1.0, 1.9, HOLE_W.x, HOLE_W.z, { move: "walk", stance: "crouch", yawDeg: -90, depart: { clip: null } });
  const CRAWL = 2.0;
  s.Key("Nier", CRAWL, { clip: VIL.crawlHole });
  const crawlEnd = RootEndAt(VIL.crawlHole, HOLE_W, -90, CHILD_SCALE);
  const landed = Pt(crawlEnd.x + 0.45, crawlEnd.z + 0.3);
  s.Key("Nier", CRAWL + VilClipS(VIL.crawlHole), { x: landed.x, z: landed.z, move: "cut", clip: null, stance: "crouch", faceTo: haystack });
  s.Caption(2.4, 2.6, "（她趴下，手脚并用一头钻进去，回了自己家后院）");
  const toStack = CRAWL + VilClipS(VIL.crawlHole) + 0.6;
  s.Go("Nier", toStack, toStack + Dist(landed, haystack) / 1.4, haystack.x, haystack.z, { move: "walk", path: [Pt(83.4, 504.6)], stance: "crouch", faceTo: CELLAR, clip: VIL.crouch });
  // 顺子追到洞口：大人钻不过去；也不能喊，她听不见、院里有鬼子
  s.Eye(3.0, 2.6, { stance: "crouch", look: HOLE, pitch: -30, toPitch: -22 });
  s.Caption(5.0, 3.2, "（顺子追到洞口：大人钻不过去。也不能喊——她听不见，院里有鬼子）");
  s.Eye(5.6, 1.4, { stance: "crouch", look: HOLE, pitch: -22, toLook: Pt(WALL_X, 496), toPitch: 0 });
  // 街口那边还在打；顺着这道墙从缝里找她：贴墙往南挪到墙缝外
  Exchange(s, 6.2, { volume: 0.5 });
  s.Caption(7.4, 2.6, "（顺着这道墙，从缝里找她）");
  s.Creep(8.4, 4.4, Pt(P.x, P.z), Pt(P.x + 0.3, G.crack.z - 0.5), Pt(WALL_X, G.crack.z), { h: 1.05 });
  s.Caption(12.8, 2.2, "（墙上有一道缝）");
  return s.Done({ durationS: 15.2 });
}

function S0903(ctx) {
  const s = new Seq(ctx, "09-3", "墙缝：汉子刚爬出来就被捅倒");
  const K = id => KU(ctx, "09-3", id);
  // 眼贴着墙缝：缝只有一指宽，斜着看窖口只剩两度宽的一条——能看见的东西全排在「眼睛 → 窖口」这条线上
  const eyeA = SlitEye(CRACK, CELLAR);
  // 爬出窖（PrevizVillage V2 的 VilHandsUpClimbOut，清单 stage cellarPit）：根放在坑口沿外 0.10 m 的地上、背对窖口，起步时骨盆在根后 0.55 m、
  // 下 1.18 m（站在 2 m 深的坑底），蹬壁上的脚窝、扒窖沿撑上来，站在根前 0.38 m 举手。白盒的坑在 0.5 m 网格里是：坑心 ±0.5 m 坑底、
  // 0.5…1.0 m 斜壁、1.0 m 外整高（Data_…Space cellar 注），所以「坑口沿」按网格算在坑心外 1.0 m，根放 1.0 + 0.10 = 1.1 m（CELLAR_RIM_M）：
  // 根踩在院子地面上、起步的骨盆在坑心外 0.55 m 的坑底上。汉子的根在视线上（缝里只看得见这一条）。
  // 坑是正方形：沿视线（偏离 x 轴约 17°）走到 x 方向离坑心正好 CELLAR_RIM_M 的那一点（他爬的是东壁），不是径向 1.1 m
  const RIM_E = (() => { const d = Dist(eyeA, CELLAR), ux = (CELLAR.x - eyeA.x) / d, uz = (CELLAR.z - eyeA.z) / d; return Along(eyeA, CELLAR, CELLAR_RIM_M / Math.max(Math.abs(ux), Math.abs(uz))); })();
  const manYaw = Yaw(CELLAR, RIM_E);          // 背对窖口、面朝东边拿刺刀的
  // 拿刺刀的按清单 stage bayonetVictim 站：汉子在他前方 1.92 m、右 0.12 m、面对他 —— 汉子站直后在根前 0.38 m（root.end），刺刀对着那儿
  const manUp = RootEndAt(VIL.climbOut, RIM_E, manYaw);
  const ija2 = StageAnchorFrom("bayonetVictim", "victim", manUp, manYaw);
  // 窖里的人先在窖底（看不见：藏着，爬上来那一刻才露面）；媳妇、老太太从南沿爬（并排、隔 1 m，背对窖口朝南）；三个鬼子围着窖口；妮儿缩在柴垛后头
  const wife0 = Pt(CELLAR.x - 0.5, CELLAR.z + CELLAR_RIM_M), granny0 = Pt(CELLAR.x + 0.5, CELLAR.z + CELLAR_RIM_M);
  s.Place("CellarMan", 0, RIM_E.x, RIM_E.z, { state: "alive", stance: "stand", yawDeg: manYaw, visible: false });
  s.Place("CellarWife", 0, wife0.x, wife0.z, { state: "alive", stance: "stand", yawDeg: 180, visible: false });
  s.Place("CellarGranny", 0, granny0.x, granny0.z, { state: "alive", stance: "stand", yawDeg: 180, visible: false });
  s.Place("CellarIja1", 0, 89.5, 497.1, { faceTo: CELLAR, clip: VIL.shout });   // 拎着手榴弹在窖口上晃、指着窖里吼
  s.Place("CellarIja2", 0, ija2.x, ija2.z, { yawDeg: ija2.yawDeg, aim: true });
  s.Place("CellarIja3", 0, 88.4, 501.6, { faceTo: CELLAR });
  s.Key("Nier", 0, { stance: "crouch", faceTo: CELLAR, clip: VIL.crouch });
  s.Eye(0, 22.0, { stance: "stand", x: eyeA.x, z: eyeA.z, look: CELLAR, pitch: -4, fov: SLIT_FOV });
  s.Caption(0.3, 3.0, "（隔墙的缝：缝只有一指宽，眼要贴上去，只看得见窖口那一小片）");
  s.Caption(3.6, 3.2, "（一个鬼子拎着手榴弹在窖口上晃，窖里的人举着手一个个往外爬）");
  // 地底下压着嗓子的哭（cellarSob，4 s）：人还在窖里的时候从窖口放两遍（汉子爬的时候女人还在底下）
  s.Sfx(0.5, "cellarSob", { x: CELLAR.x, z: CELLAR.z, volume: 0.7 });
  s.Sfx(4.6, "cellarSob", { x: CELLAR.x, z: CELLAR.z, volume: 0.55 });
  // 汉子举着双手从 2 m 的直壁爬上来，站直举手（VilHandsUpClimbOut 5.0 s：4.0 s 站起、4.2 s 举手、4.2–5.0 举着手喘气的停住段；末帧停住）
  const climb = 4.2;
  s.Key("CellarMan", climb, { visible: true, clip: VIL.climbOut, clipHold: true });
  // 拿刺刀的端枪往前一捅（VilIjaBayonetThrust），汉子弯腰、跪倒、侧倒（VilStabbedFall，末帧是尸体）：清单两段同时起播，0.50 s 捅中。
  // 爬完（5.0 s）先切到 root.end（清单：根前 0.38 m），再接被捅：VilStabbedFall 没有根位移，从那儿倒
  const climbed = climb + VilClipS(VIL.climbOut);
  const stab = climbed + 0.4;
  s.Key("CellarMan", stab, { x: manUp.x, z: manUp.z, move: "cut", yawDeg: manYaw, clip: VIL.stabbed, clipHold: true });
  s.Key("CellarIja2", stab, { clip: VIL.thrust });
  s.Sfx(stab + 0.5, "stab", manUp);
  s.Caption(stab + 0.6, 3.0, "（汉子刚爬出来就被刺刀捅倒）");
  s.Key("CellarIja2", stab + VilClipS(VIL.thrust), { clip: null, faceTo: CELLAR });
  // 年轻媳妇、抱襁褓的老太太跟着从南沿举着手往外爬（也是 VilHandsUpClimbOut 5 s，一个爬到顶另一个才上）
  const wifeClimb = stab + 0.4, grannyClimb = R(wifeClimb + VilClipS(VIL.climbOut) - 1.0);
  s.Key("CellarWife", wifeClimb, { visible: true, clip: VIL.climbOut, clipHold: true });
  s.Key("CellarGranny", grannyClimb, { visible: true, clip: VIL.climbOut, clipHold: true });
  s.Key("CellarIja3", wifeClimb + 3.2, { faceTo: "CellarWife" });
  // 前屋那头有人在吼（分队长指着后院调人：VilIjaShoutPoint），这伙鬼子手上加快了
  const call = s.Say("LeaderCallsMen.01", "Leader", grannyClimb + 1.0);
  s.Key("Leader", call - 0.3, { faceTo: CELLAR, clip: VIL.shout });
  s.Key("Leader", s.End("LeaderCallsMen.01") + 0.3, { faceTo: WINDOW, clip: null });
  s.Key("CellarIja1", s.End("LeaderCallsMen.01") + 0.3, { clip: null });
  s.Caption(s.End("LeaderCallsMen.01") + 0.2, 3.0, "（前屋那头有人在吼：分队长在调人。这伙鬼子手上加快了）");
  // 街口那边还在打
  Exchange(s, 1.6, { volume: 0.5 });
  Exchange(s, 12.0, { volume: 0.5 });
  // 顺子还得往侧门挪，视线断了：眼睛离开缝，贴着墙往南挪到侧门外（老太太爬到顶了才走）
  const leave = Math.max(grannyClimb + VilClipS(VIL.climbOut) + 0.4, s.End("LeaderCallsMen.01") + 1.0);
  s.Caption(leave, 3.0, "（顺子还得往侧门挪，视线断了。妮儿缩在柴垛后头发抖）");
  const gateOut = Pt(80.7, 499.4);
  s.Creep(leave, 3.4, Pt(eyeA.x - 0.2, eyeA.z), gateOut, Pt(WALL_X, 499.0), { h: 1.3, lookH: 1.4 });
  s.Caption(leave + 3.6, 2.0, "（这是三下里的第二下）");
  return s.Done({ durationS: leave + 6.0 });
}

function S0904(ctx) {
  const s = new Seq(ctx, "09-4", "侧门门缝：三下里的第三下");
  const K = id => KU(ctx, "09-4", id), K3 = id => KU(ctx, "09-3", id);
  const MAN = UP(K3("CellarMan"));
  const GRANNY0 = Pt(91.9, 500.9), GRANNY_PIT = Pt(CELLAR.x, CELLAR.z + 0.2);
  // 眼贴着门缝（门缝在门洞北侧，0.15 m）：往东能看的扇面约 −4°…+11°，演的东西都排在这个扇面里
  const eye = GATE_EYE;
  // 拖媳妇的一对（清单 stage dragByArm：鬼子倒退着拽，媳妇仰面躺在他前方 1.05 m、左 0.15 m、同向，两人朝鬼子的背后走）：
  // 鬼子面朝西（朝向 +90）、往东拖；媳妇的根就在她 09-3 爬出来站的地方附近
  const ija3 = Pt(90.65, 502.0), IJA3_YAW = 90;
  const wife = StagePlace("dragByArm", "victim", ija3, IJA3_YAW);
  // 挑襁褓的鬼子：面朝西对着老太太，襁褓（她怀里）在他前方 1.1 m（清单 VilIjaBayonetLiftFling）；甩到他左手边（南）窖沿的盖板边上。
  // 两处都在门缝的扇面里（老太太 +6.9°、甩到的地方 +9.9°）
  const STAB_AT = Pt(GRANNY0.x + 1.1, GRANNY0.z + 0.15), STAB_YAW = 90;
  const BABY_RIM = Pt(92.5, 501.5);
  // 开场：窖里一家三口刚爬出来的样子（老太太跪着抱着怀里的包袱）；汉子的尸体；窖还没炸；妮儿缩在柴垛后头
  s.Signal(0, SIG.cellarBlast, false);
  s.Place("CellarMan", 0, MAN.x, MAN.z, { state: "down", yawDeg: 100 });
  s.Place("CellarGranny", 0, GRANNY0.x, GRANNY0.z, { state: "alive", stance: "crouch", yawDeg: Yaw(GRANNY0, STAB_AT), clip: VIL.kneelCrawl });
  s.Place("CellarWife", 0, wife.x, wife.z, { state: "alive", stance: "stand", yawDeg: wife.yawDeg, clip: VIL.dragged });
  s.Place("CellarIja3", 0, ija3.x, ija3.z, { yawDeg: IJA3_YAW, aim: false, clip: VIL.dragArm });
  s.Place("CellarIja2", 0, 93.6, 499.4, { faceTo: CELLAR, aim: true });
  s.Place("CellarIja1", 0, 89.8, 496.9, { faceTo: CELLAR });
  const nier0 = UP(K3("Nier"));
  s.Place("Nier", 0, nier0.x, nier0.z, { stance: "crouch", faceTo: CELLAR, clip: VIL.crouch });
  // 襁褓：剧本里只是老太太怀里的一个包袱，不建人；这里用一个按比例缩小的倒地替身占位（先藏着，甩到窖沿上才露面）
  s.Spawn("Bundle", { side: "civ", kind: "child", x: BABY_RIM.x, z: BABY_RIM.z, yawDeg: 60, state: "down", name: "襁褓（占位）" }, { visible: false });
  s.Caption(0.3, 3.2, "（侧门外，只等十几秒。门缝在北侧，贴着看；顺子扶在门上的手一直在抖）");
  // 媳妇被拖进偏屋：先拖 6 m（0.9 m/s，清单基准 0.7），出了扇面就只听得见声音；之后切到偏屋里
  const DRAG_M = 6.0, DRAG_MPS = 0.9, dragT0 = 1.0, dragT1 = R(dragT0 + DRAG_M / DRAG_MPS);
  s.Go("CellarIja3", dragT0, dragT1, ija3.x + DRAG_M, ija3.z, { move: "drag", yawDeg: IJA3_YAW });
  s.Go("CellarWife", dragT0, dragT1, wife.x + DRAG_M, wife.z, { move: "drag", yawDeg: wife.yawDeg });
  s.Caption(3.8, 3.0, "（媳妇被拖进偏屋，只听得见声音）");
  s.Place("CellarIja3", dragT1 + 0.4, 112.0, 486.6, { clip: null, faceTo: SIDE_ROOM_DOOR });
  { const w5 = UP(KU(ctx, "09-5", "CellarWife")); s.Place("CellarWife", dragT1 + 0.4, w5.x, w5.z, { clip: null, state: "down", yawDeg: 90 }); }
  // 孩子在哭；一个鬼子从老太太怀里扯过襁褓，往下一扎、挑起来、往旁边一甩（VilIjaBayonetLiftFling：扎 0.5 s、挑 1.1 s、甩 1.5 s），哭声断了。
  // 婴儿哭 babyCry（Sfx_BabyCry.mp3 3.53 s，0–1 s 一阵、2.4–3.5 s 又一阵）：倒着排，文件放完正好是刺刀扎下去那一刻（预演音效没有「掐断」，靶在文件尾）
  const FLING = 9.6, BABY_STAB = FLING + 0.5;
  const cry = R(BABY_STAB - SFX_FILE.babyCry.seconds);
  s.Sfx(cry, "babyCry", { x: GRANNY0.x, z: GRANNY0.z, volume: 0.8 });
  s.Caption(cry + 0.2, 2.6, "（孩子在哭）");
  s.Go("CellarIja2", 7.6, 9.2, STAB_AT.x, STAB_AT.z, { move: "walk", yawDeg: STAB_YAW, aim: true });
  s.Key("CellarIja2", FLING, { clip: VIL.fling });
  s.Sfx(BABY_STAB, "stab", STAB_AT);
  s.Key("Bundle", FLING + 1.5, { visible: true });
  s.Caption(10.2, 4.0, "（一个鬼子从老太太怀里扯过襁褓，一刺刀扎穿，挑起来甩在窖沿上，哭声断了）");
  s.Key("CellarIja2", FLING + VilClipS(VIL.fling), { clip: null, faceTo: CELLAR });
  // 老太太跪着往窖里爬（VilKneelCrawlToPit 原地循环，基准 0.35 m/s）；拎手榴弹的走到窖沿，往钢盔上一磕、往脚下坑里丢
  //（VilIjaHelmetGrenadeLob：磕 0.55 s、脱手 1.2 s、弹飞到前方 1.5 m / 下 1.5 m）：窖里闷响一声
  const crawl0 = FLING + 1.8, crawl1 = R(crawl0 + Dist(GRANNY0, GRANNY_PIT) / 0.35);
  s.Go("CellarGranny", crawl0, crawl1, GRANNY_PIT.x, GRANNY_PIT.z, { move: "walk", yawDeg: Yaw(GRANNY0, GRANNY_PIT) });
  s.Caption(14.4, 3.0, "（老太太往窖里爬。鬼子把手榴弹往钢盔上一磕，扔了进去）");
  const PIT_N = Pt(CELLAR.x - 0.2, 497.9);        // 窖口北沿外一步，面朝南（朝窖里）
  s.Go("CellarIja1", 13.6, 14.6, PIT_N.x, PIT_N.z, { move: "walk", yawDeg: 180 });
  const LOB = 15.4;
  s.Key("CellarIja1", LOB, { clip: VIL.lob });
  const blast = R(LOB + 1.9);
  s.Key("CellarIja2", blast - 1.0, { clip: "DuckBlast" });
  s.Sfx(blast, "grenadeBlast", { x: CELLAR.x, z: CELLAR.z, volume: 0.7 });
  s.Ev(blast, "explosion", { x: CELLAR.x, z: CELLAR.z, kind: "grenade", radius: 1.6 });
  s.Ev(blast + 0.1, "smoke", { x: CELLAR.x, z: CELLAR.z, kind: "SmokeDust", dur: 6 });
  s.Shake(blast, 0.6, 0.3);
  s.Signal(blast + 0.15, SIG.cellarBlast, true);
  s.Key("CellarGranny", blast + 0.1, { state: "down", clip: null, yawDeg: 0 });
  s.Key("CellarIja1", LOB + VilClipS(VIL.lob) + 0.1, { clip: null });
  s.Caption(blast + 0.4, 2.6, "（窖里闷响一声）");
  // 完事他们拎起枪往前屋跑，去帮着打街上的班长，只留下一个（留下的走到尸体边，背对院子站着撒尿）
  const back = blast + 3.0;
  const r1 = Route(PIT_N, UP(K("CellarIja1")));
  s.Go("CellarIja1", back, back + RouteLen(PIT_N, [...r1.path, r1.end]) / 2.6, r1.end.x, r1.end.z, { move: "run", path: r1.path, faceTo: ROOM_YARD_DOOR });
  const pisser = UP(KU(ctx, "09-5", "CellarIja2"));
  const pissAt = s.Go("CellarIja2", back + 1.6, back + 3.6, pisser.x, pisser.z, { move: "walk", depart: { clip: null, aim: false }, yawDeg: -150 }) && back + 3.6;
  s.HoldLoop("CellarIja2", VIL.piss, pissAt, back + 9.0);
  s.Caption(back + 2.0, 3.0, "（完事他们拎起枪往前屋跑，去帮着打街上的班长，只留下一个）");
  // 同一个门缝里：妮儿从柴垛后头贴着墙根往门这边挪，离侧门几步，蹲着捂着嘴发抖（VilCowerWhimper）；鬼子都在窖口，没人看她
  s.Go("Nier", back + 0.6, back + 6.0, 82.3, 499.75, { move: "walk", path: [Pt(82.3, 503.0)], depart: { clip: null }, stance: "crouch", faceTo: Pt(82.3, 500.4), clip: VIL.cower });
  s.Caption(back + 3.2, 3.2, "（同一个门缝里，妮儿从柴垛后头贴着墙根挪到门边，离侧门几步，浑身发抖。顺子扶在门上的手一直在抖）");
  s.Eye(0, back + 8.0, { stance: "stand", x: eye.x, z: eye.z, look: CELLAR, pitch: -3, fov: SLIT_FOV, shake: 0.06 });
  return s.Done({ durationS: back + 8.0 });
}

function S0905(ctx) {
  const s = new Seq(ctx, "09-5", "门开了：撒尿的看守、妮儿呜咽、捂嘴");
  const K = id => KU(ctx, "09-5", id);
  const pisser = UP(K("CellarIja2"));
  // 开场：门还闩着；眼睛在门缝后；顺子把手伸进门缝晃了晃，轻轻推门。
  // 妮儿在门里，面朝门（朝西）：清单 stage door——门板在她前方 0.45 m（小孩身体 0.62 → 0.28 m），门闩 1.25 m 高
  s.Signal(0, SIG.sideGateOpen, false);
  const eye = GATE_EYE;
  const NIER_DOOR = Pt(WALL_X + WALL_T / 2 + 0.45 * CHILD_SCALE, 499.75);
  s.Place("Nier", 0, NIER_DOOR.x, NIER_DOOR.z, { stance: "crouch", yawDeg: 90, clip: VIL.crouch });
  // 留下的看守背对院子在汉子的尸体边撒尿（VilIjaPissStand：前 2 s 是停住段，每 1.9 s 重起一遍）
  s.Key("CellarIja2", 0, { yawDeg: -150, aim: false });
  s.Eye(0, 5.0, { stance: "stand", x: eye.x, z: eye.z, yaw: -90, pitch: -6, fov: 50 });
  s.Caption(0.4, 3.6, "（顺子把手伸进门缝晃了晃，轻轻推门。妮儿看见门在动、门缝里是顺子的手，爬过来拔门闩：门口是认得的人，她就开）");
  // 妮儿站起来够门闩、往旁边拉开、推门（VilUnboltDoor：够 0.6 s、拉开 1.3 s、推门 1.7 s）；门开了：触发
  const UNBOLT = 1.6;
  s.Key("Nier", UNBOLT, { stance: "stand", clip: VIL.unbolt });
  const open = R(UNBOLT + 1.75);
  s.Signal(open, SIG.sideGateOpen, true);
  s.Sfx(open, "dirtFall", { x: WALL_X, z: 500, volume: 0.25 });
  s.Key("Nier", UNBOLT + VilClipS(VIL.unbolt), { clip: null, stance: "crouch", faceTo: "player" });
  s.Caption(open + 0.2, 2.6, "（门闩拉开，门开了一条缝，露出妮儿的脸）");
  s.Eye(open + 0.4, 1.2, { stance: "stand", x: eye.x, z: eye.z, yaw: -90, pitch: -6, toLook: NIER_DOOR, toPitch: -22, fov: 50 });
  // 门正对着地瓜窖，留下的那个鬼子在八九米外侧着背撒尿；玩家得蹲着不动
  const inDoor = open + 1.8;
  s.Eye(inDoor, 4.0, { stance: "crouch", look: pisser, pitch: 0 });
  s.Caption(inDoor + 0.2, 4.0, "（门正对着地瓜窖：留下的那个鬼子站在八九米外，侧着背在汉子的尸体边撒尿。玩家得蹲着不动）");
  // 妮儿一回头看见了院子里的人，僵住了，蹲着捂着嘴发抖、开始呜咽（VilCowerWhimper）；她听不见自己有多大声
  const turn = inDoor + 2.6;
  s.Key("Nier", turn, { faceTo: pisser });
  s.Key("Nier", turn + 1.0, { clip: VIL.cower });
  s.Caption(turn + 1.4, 2.6, "（妮儿一回头看见了院里的人，都是她认得的街坊，一下子僵住了）");
  const whimper = s.Say("NierWhimperFirst.01", "Nier", turn + 3.0);
  s.Eye(whimper - 0.4, 1.0, { stance: "crouch", look: pisser, pitch: 0, toLook: NIER_DOOR, toPitch: -26 });
  s.Caption(whimper + 1.2, 3.4, "（屏幕弹出按键：按下去，顺子捂住她的嘴。第一人称看得见自己的手指，上面露着她瞪大的眼睛）");
  // 这里演「按到了」那一支：鬼子系好裤子（撒尿片段的出口：系裤子、半转头），往偏屋去了（没按到那支只写一句，不演）
  const done = s.End("NierWhimperFirst.01") + 0.4;
  const pissEnd = s.HoldLoop("CellarIja2", VIL.piss, 0, done);
  s.Eye(done - 0.6, 0.8, { stance: "crouch", look: NIER_DOOR, pitch: -26, toLook: pisser, toPitch: 0 });
  s.Caption(done + 0.2, 3.2, "（按到了：鬼子系好裤子，往偏屋去了）");
  const go = pissEnd + 0.4;
  const r = Route(pisser, Pt(108.6, 489.0));
  s.Go("CellarIja2", go, go + RouteLen(pisser, [...r.path, r.end]) / 1.3, r.end.x, r.end.z, { move: "walk", path: r.path, depart: { clip: null }, faceTo: SIDE_ROOM_DOOR });
  s.Eye(go, 6.0, { stance: "crouch", look: pisser, pitch: 0, toLook: SIDE_ROOM_DOOR, toPitch: 0 });
  s.Caption(go + 3.6, 3.6, "（没按到那一支：他停下来半转过身「嗯？」，正好机枪响了一梭，他骂了一句，也往偏屋去了。不判失败）");
  Exchange(s, go + 2.0, { volume: 0.7 });
  return s.Done({ durationS: go + 7.6 });
}

function S0906(ctx) {
  const s = new Seq(ctx, "09-6", "屁股对到老子：攥着衣角，贴西墙往前屋摸");
  const K = id => KU(ctx, "09-6", id);
  const P = KP(ctx, "09-6"), P5 = KP(ctx, "09-5");
  const MILL_MAN = UP(K("MillOldMan"));
  const SIGHT = Pt(P.x, P.z);
  // 妮儿死死攥住顺子的衣角往后坠（VilClingHem：清单 stage clingHem——前面的人在她前方 0.45 m、同向；小孩身体 0.62 → 0.28 m）。
  // 前面的人是顺子（眼睛）：她的根 = 眼睛位置往后 0.28 m，朝向同顺子走的方向。
  const CLING_M = 0.45 * CHILD_SCALE;
  const Behind = (p, yaw) => Fwd(p, yaw, -CLING_M);
  const yaw0 = -90;                                 // 顺子蹲在门里面朝院子（东）
  const n0 = Behind(Pt(P5.x, P5.z), yaw0);
  // 开场：顺子蹲在门里，要把她往门外拽；她死死攥住衣角往后坠。先回头看她，再抬头往院里看
  s.Place("Nier", 0, n0.x, n0.z, { stance: "stand", yawDeg: yaw0, clip: VIL.cling });
  s.Eye(0, 3.0, { stance: "crouch", x: P5.x, z: P5.z, yaw: 90, pitch: -30, toYaw: yaw0, toPitch: -4 });
  s.Caption(0.3, 3.6, "（顺子要把她往门外拽，她死死攥住他的衣角往后坠，一步也不肯挪；硬拽就得出声）");
  // 他抬头往院里看：前屋朝后院的门敞着，门里头就是机枪组的后背，十几步远，正朝着街上的班长打
  s.Creep(3.0, 2.6, Pt(P5.x, P5.z), SIGHT, ROOM_YARD_DOOR, { h: 1.05, lookH: 1.0 });
  s.Eye(5.6, 5.0, { stance: "crouch", look: MG_LOADER_AT, pitch: -1 });
  WindowBurst(s, 5.8, { volume: 0.85 });
  s.Caption(5.8, 3.6, "（抬头往院里看：前屋朝后院的门敞着，门里头就是机枪组的后背，十几步远，正朝着街上的班长打）");
  const butt = s.Say("ButtToMe.01", null, 9.0);
  { const y = Yaw(Pt(P5.x, P5.z), SIGHT), n = Behind(SIGHT, y); s.Go("Nier", 3.2, 5.8, n.x, n.z, { move: "walk", yawDeg: y }); }
  // 院里还有一个早就死了的老汉，反绑在石磨上
  const mill = s.End("ButtToMe.01") + 0.6;
  s.Eye(mill, 1.4, { stance: "crouch", look: MG_LOADER_AT, pitch: -1, toLook: MILL_MAN, toPitch: -10 });
  s.Caption(mill + 0.4, 4.2, "（院里还有一个早就死了的老汉，被他自己的裤腰带反绑在石磨上，身上好几个刺刀窟窿：是被拿来练刺刀的，跟 02 冬瓜挨的是同一套）");
  // 带着她贴着西墙往前屋后门摸，得先过灶屋门口：机枪响一梭挪一段，一安静就停
  const t0 = mill + 5.0;
  s.Eye(mill + 1.4, t0 - mill - 1.4, { stance: "crouch", look: MILL_MAN, pitch: -10, toLook: KITCHEN_DOOR, toPitch: -4 });
  s.Caption(t0 - 2.4, 2.4, "（贴着西墙往前屋后门摸，得先过灶屋门口。机枪响一梭挪一段，一安静就停）");
  const DOOR_OUT = Pt(G.kitchen.box.maxX + 1.6, G.kitchen.door.z + 0.9);
  const stops = [SIGHT, Pt(86.2, 491.6), Pt(88.6, 487.6), Pt(DOOR_OUT.x, DOOR_OUT.z + 1.8)];
  // 妮儿每段都攥着衣角跟在顺子身后 0.28 m（朝向 = 这一段走的方向）
  const legYaw = i => Yaw(stops[i - 1], stops[i]);
  const nierStops = stops.map((p, i) => (i === 0 ? null : Behind(p, legYaw(i))));
  const t = CreepLegs(s, t0, stops, i => (i === 3 ? KITCHEN_DOOR : Pt(KITCHEN_DOOR.x, KITCHEN_DOOR.z + 1.5)), {
    volume: 0.75, pause: 3.0, speed: 1.6,
    onStop: (i, mv0, mv1) => {
      s.Go("Nier", mv0 + 0.3, mv1 + 0.3, nierStops[i].x, nierStops[i].z, { move: "walk", yawDeg: legYaw(i) });
      if (i === 2) {
        // 中途她再呜咽一次（松开衣角蹲下捂嘴发抖：VilCowerWhimper）：再弹一次捂嘴；完了又攥上衣角
        s.Eye(mv1 + 0.2, 0.8, { stance: "crouch", x: stops[i].x, z: stops[i].z, look: Pt(KITCHEN_DOOR.x, KITCHEN_DOOR.z + 1.5), pitch: -4, toLook: nierStops[i], toPitch: -28 });
        const w = s.Say("NierWhimperAgain.01", "Nier", mv1 + 1.2);
        s.Key("Nier", mv1 + 0.6, { clip: VIL.cower, stance: "crouch" });
        s.Caption(w + 0.6, 2.6, "（她再呜咽一次：再弹一次捂嘴，按键）");
        s.Eye(s.End("NierWhimperAgain.01") + 0.6, 1.0, { stance: "crouch", x: stops[i].x, z: stops[i].z, look: nierStops[i], pitch: -28, toLook: KITCHEN_DOOR, toPitch: -4 });
        s.Key("Nier", s.End("NierWhimperAgain.01") + 1.6, { clip: VIL.cling, stance: "stand" });
        return s.End("NierWhimperAgain.01") + 2.4;
      }
      return null;
    },
  });
  s.Eye(t - 2.6, 2.4, { stance: "crouch", x: stops[3].x, z: stops[3].z, look: KITCHEN_DOOR, pitch: -4 });
  s.Caption(t - 2.2, 2.2, "（快到灶屋门口了）");
  void butt;
  return s.Done({ durationS: t });
}

function S0907(ctx) {
  const s = new Seq(ctx, "09-7", "灶屋门口：罐子掉地，刺刀往下压，妮儿咬手腕");
  const K = id => KU(ctx, "09-7", id), K6 = id => KU(ctx, "09-6", id);
  const DOOR_OUT = Pt(G.kitchen.box.maxX + 1.6, G.kitchen.door.z + 0.9);
  const THRESH = Pt(G.kitchen.box.maxX + 0.5, G.kitchen.door.z);
  const NIER0 = Pt(DOOR_OUT.x + 1.6, DOOR_OUT.z + 1.8);
  // 压刺刀的地方（清单 stage pinBite）：鬼子骑跪在倒地的顺子身上、面朝东南（−135），顺子的头在他前方约 0.55 m（眼睛趴着仰视他）；
  // 妮儿站在他右侧 0.54 m、前 0.38 m，面朝他的中线（左转 90°），小孩身体 0.62；她比他晚 1.5 s 起播：她 0.5 s 咬中 = 他 2.0 s 停住段结束
  const PIN = Pt(91.3, 483.9), PIN_YAW = -135;
  const EYE_DOWN = Fwd(PIN, PIN_YAW, 0.55);
  const NIER_MARK = StagePlace("pinBite", "nier", PIN, PIN_YAW);
  // 开场：顺子在灶屋门外一步，妮儿身边（蹲着抱膝）；鬼子在灶屋里翻东西（09-6 的位置）
  const kij = UP(K6("KitchenIja"));
  s.Place("KitchenIja", 0, kij.x, kij.z, { state: "alive", stance: "crouch", yawDeg: 120, aim: false });
  s.Place("Nier", 0, NIER0.x, NIER0.z, { stance: "crouch", faceTo: THRESH, clip: VIL.crouch });
  s.Eye(0, 2.2, { stance: "crouch", x: DOOR_OUT.x, z: DOOR_OUT.z, look: KITCHEN_DOOR, pitch: -4 });
  // 罐子哗啦一声掉在地上：jarShatter（Sfx_JarShatter.mp3 1.5 s，陶罐摔碎 + 弹壳撒一地；罐子还是没有体块）
  const drop = 1.4;
  s.Sfx(drop, "jarShatter", { x: NIER0.x, z: NIER0.z, volume: 0.8 });
  s.Caption(drop, 2.4, "（妮儿怀里那罐弹壳掉在地上，哗啦一声）");
  s.Eye(drop + 0.2, 0.6, { stance: "crouch", x: DOOR_OUT.x, z: DOOR_OUT.z, look: KITCHEN_DOOR, pitch: -4, toLook: NIER0, toPitch: -30 });
  // 灶屋里的鬼子嘴里塞着东西就扑出来：跑到门里，从门里冲出来肩膀往前撞（VilIjaShoulderCharge，根往前 1.2 m），撞翻顺子
  const lunge = drop + 1.2;
  const DOOR_IN = Pt(G.kitchen.box.maxX - 0.7, G.kitchen.door.z);
  s.Key("KitchenIja", lunge - 0.2, { stance: "stand", aim: true, faceTo: KITCHEN_DOOR });
  s.Say("KitchenLunge.01", "KitchenIja", lunge);
  s.Go("KitchenIja", lunge, lunge + 1.0, DOOR_IN.x, DOOR_IN.z, { move: "run", yawDeg: -90 });
  const CHARGE = lunge + 1.0;
  s.Key("KitchenIja", CHARGE, { clip: VIL.charge });
  s.Eye(lunge, 1.6, { stance: "crouch", x: DOOR_OUT.x, z: DOOR_OUT.z, look: NIER0, pitch: -30, toLook: Pt(DOOR_IN.x, DOOR_IN.z), toPitch: -2, shake: 0.3 });
  s.Shake(CHARGE + 0.6, 0.6, 0.9);
  s.Caption(CHARGE + 0.5, 2.6, "（把顺子撞翻在灶台边）");
  // 切到倒地仰视：鬼子骑跪在身上，用上了刺刀的枪往下压（VilIjaPinBayonet：前 2 s 是用力抖的停住段，每 1.9 s 重起一遍；
  // 最后一遍放完就是被咬的出口：右腕被咬、惨叫甩手后仰）
  const pin = CHARGE + VilClipS(VIL.charge);
  s.Place("KitchenIja", pin, PIN.x, PIN.z, { yawDeg: PIN_YAW, aim: true });
  const T_PIN = pin + 4.4;                           // 最后一遍起播：2.0 s 处被咬
  s.HoldLoop("KitchenIja", VIL.pin, pin, T_PIN);
  s.Caption(pin + 1.4, 4.4, "（顺子两手死死抵住枪身：玩家连按往外推，推不赢，刀尖一点点往下来）");
  // 妮儿扑上去（清单 offsetS 1.5：比他最后一遍晚 1.5 s 起播），往前扑、低头一口咬在鬼子握枪的手腕上（VilBiteWrist 0.5 s 咬中，甩头，咬住不放）
  const bite = T_PIN + NIER_MARK.offsetS;           // 妮儿起播
  const BITE_AT = bite + 0.5;                       // 咬中 = 鬼子 2.0 s
  s.Go("Nier", bite - 1.4, bite - 0.2, NIER_MARK.x, NIER_MARK.z, { move: "run", depart: { stance: "stand", clip: null }, yawDeg: NIER_MARK.yawDeg });
  s.Key("Nier", bite, { clip: VIL.bite, clipHold: true });
  s.Caption(bite - 0.2, 2.2, "（妮儿扑上去，一口咬在鬼子握枪的手腕上）");
  // 咬那一下按慢动作放：1.5 s、0.3 倍、进出 0.25 s 渐变；窗口里不排台词（惨叫在窗口过了才响）
  s.Slowmo(BITE_AT - 0.3, 1.5, 0.3, 0.25);
  // 倒地仰视：先盯着压下来的鬼子，妮儿扑上来那一刻眼睛转向他右腕边的她（慢动作里看着她咬）
  s.Eye(pin, bite - 0.4 - pin, { stance: "prone", x: EYE_DOWN.x, z: EYE_DOWN.z, look: PIN, pitch: 38, toPitch: 52, shake: 0.22 });
  s.Eye(bite - 0.4, BITE_AT + 1.2 - (bite - 0.4), { stance: "prone", x: EYE_DOWN.x, z: EYE_DOWN.z, look: PIN, pitch: 52, toLook: NIER_MARK, toPitch: 42, shake: 0.1 });
  const scream = s.Say("KitchenBitten.01", "KitchenIja", BITE_AT + 1.25);
  s.Caption(scream + 0.2, 3.0, "（鬼子惨叫，手一松。控制交还，屏幕不出提示：玩家用平常的键从左肩抽出大刀，砍两刀，砍得乱七八糟）");
  // 顺子爬起来拔大刀砍两刀
  const back = scream + 0.3;
  s.Eye(back, 1.4, { stance: "prone", x: EYE_DOWN.x, z: EYE_DOWN.z, look: PIN, pitch: 40, toPitch: 20 });
  s.Eye(back + 1.4, 3.0, { stance: "crouch", x: EYE_DOWN.x, z: EYE_DOWN.z, look: PIN, pitch: -14, shake: 0.2 });
  const chop1 = back + 1.8, chop2 = chop1 + 0.8;
  s.Sfx(chop1, "stab", PIN); s.Sfx(chop2, "stab", PIN);
  s.Shake(chop1, 0.3, 0.4); s.Shake(chop2, 0.3, 0.5);
  s.Key("KitchenIja", chop1 + 0.05, { clip: "ShotCollapse", clipHold: true });
  s.Key("KitchenIja", chop2 + 1.3, { state: "down", clip: null, yawDeg: 0 });
  s.Sfx(chop2 + 1.3, "bodyFall", PIN);
  // 妮儿嘴边沾着血，蹲在地上发抖（VilCowerWhimper）；前屋有人听见灶屋的动静，扭头往后看
  s.Key("Nier", chop1 + 0.4, { clip: VIL.cower, stance: "crouch" });
  s.Caption(chop2 + 1.6, 3.0, "（妮儿嘴边沾着血，蹲在地上发抖）");
  const NIER = NIER_MARK;
  s.Eye(chop2 + 1.6, 1.2, { stance: "crouch", x: EYE_DOWN.x, z: EYE_DOWN.z, look: PIN, pitch: -14, toLook: NIER, toPitch: -22 });
  for (const id of ["MgGunner", "MgLoader", "Leader"]) s.Key(id, chop2 + 2.0, { yawDeg: 180 });
  s.Caption(chop2 + 4.8, 3.0, "（前屋有人听见灶屋的动静，扭头往后看）");
  s.Eye(chop2 + 4.4, 1.6, { stance: "crouch", x: EYE_DOWN.x, z: EYE_DOWN.z, look: NIER, pitch: -22, toLook: ROOM_YARD_DOOR, toPitch: 0 });
  return s.Done({ durationS: chop2 + 8.2 });
}

// ---------------------------------------------------------------------------
// 10 背后打掉机枪，守东街

function S1001(ctx) {
  const s = new Seq(ctx, "10-1", "背后打：从前屋南门冲进去");
  const K = id => KU(ctx, "10-1", id), K7 = id => KU(ctx, "09-7", id), K5 = id => KU(ctx, "08-5", id);
  const P = KP(ctx, "10-1");
  // 开场：屋里的鬼子全活着、全朝北；机枪组刚扭头又转回去打街上；窗台上那挺枪还在
  s.Signal(0, SIG.mgSilenced, false);
  const alive = { MgGunner: [MG_AT, 150, true], MgLoader: [MG_LOADER_AT, 160, false], Leader: [UP(K7("Leader")), 0, true], CellarIja1: [UP(K7("CellarIja1")), 0, true], Rifle1: [UP(K7("Rifle1")), 0, true], GateIja1: [UP(K7("GateIja1")), 0, false], Rifle2: [UP(K7("Rifle2")), 0, true] };
  for (const [id, [p, yaw, aim]] of Object.entries(alive)) s.Place(id, 0, p.x, p.z, { state: "alive", stance: id.startsWith("Mg") ? "crouch" : "stand", aim, yawDeg: yaw });
  s.Place("Nier", 0, 92.6, 485.2, { stance: "crouch", faceTo: ROOM_YARD_DOOR });
  // 从前屋南门冲进去：机枪组背对着玩家
  const doorIn = Pt(ROOM_YARD_DOOR.x, ROOM_YARD_DOOR.z + 0.9);
  s.Creep(0, 1.6, doorIn, Pt(P.x, P.z), MG_AT, { h: 1.55, lookH: 0.9, ease: "linear" });
  s.Caption(0.3, 3.0, "（从前屋南门冲进去：屋里挤着七八个鬼子，机枪组和过道里的全朝北打街上的班长。先打机枪组）");
  s.Eye(1.6, 7.0, { stance: "stand", look: MG_AT, pitch: -4, shake: 0.08 });
  WindowBurst(s, 0.4, { volume: 1.0 });
  // 四枪：架枪的先倒在枪上，副射手跟着，分队长、从后院跑来的那个
  const kills = [["MgGunner", 2.2, 0], ["MgLoader", 3.2, 20], ["Leader", 4.6, 30], ["CellarIja1", 5.8, -20]];
  for (const [id, t, yaw] of kills) {
    Shot(s, t, "player");
    s.Key(id, t + 0.08, { clip: "ShotCollapse", clipHold: true });
    s.Go(id, t + 0.1, t + 1.1, K(id).x, K(id).z, { move: "walk" });
    s.Key(id, t + 1.5, { state: "down", clip: null, yawDeg: yaw });
  }
  s.Signal(3.2, SIG.mgSilenced, true);
  s.Eye(4.0, 1.0, { stance: "stand", look: MG_AT, pitch: -4, toLook: UP(K7("Leader")), toPitch: -3 });
  s.Caption(3.6, 2.6, "（机枪一哑：窗台上那挺十一年式没了）");
  // 机枪一哑，班长从大车后头跳起来、手往前一挥、往前冲（VilNraWaveCharge：根往前 0.8 m，播完接着跑）：冲！两面一夹
  const charge = s.Say("MgSilenced.01", "Luo", 4.2);
  // 班长蹲在大车西北角后头（往前两步是车西边那 2.5 m 的空当，冲出去不撞车）
  const luoFrom = Pt(99.1, 444.2), LUO_YAW = 150;
  s.Place("Luo", 0, luoFrom.x, luoFrom.z, { stance: "crouch", aim: true, yawDeg: LUO_YAW });
  for (const id of ["HeYoutian", "Escort1"]) { const u = K5(id); s.Place(id, 0, u.x, u.z, { stance: "crouch", aim: true, yawDeg: 173 }); }
  s.Key("Luo", charge + 0.2, { clip: VIL.waveCharge });
  const luoUp = RootEndAt(VIL.waveCharge, luoFrom, LUO_YAW);
  s.Key("Luo", charge + 0.2 + VilClipS(VIL.waveCharge), { x: luoUp.x, z: luoUp.z, move: "cut", clip: null, stance: "stand", yawDeg: LUO_YAW });
  for (const id of ["Luo", "HeYoutian", "Escort1"]) {
    const to = K(id);
    const t0 = id === "Luo" ? charge + 0.2 + VilClipS(VIL.waveCharge) : charge + 1.4;
    s.Go(id, t0, t0 + Dist(s.pos.get(id), to) / 3.4, to.x, to.z, { move: "run", depart: { stance: "stand" }, stance: "stand", yawDeg: 180, aim: true });
  }
  for (const id of ["Yaowa", "LiuWencai", "Squad3"]) {
    const u = K5(id), to = K(id);
    s.Place(id, 0, u.x, u.z, { stance: "prone", aim: true, yawDeg: 177 });
    s.Go(id, charge + 1.4, charge + 1.4 + Dist(u, to) / 3.4, to.x, to.z, { move: "run", depart: { stance: "stand" }, stance: "stand", yawDeg: 180 });
  }
  Shot(s, charge + 1.6, "Luo", { volume: 0.8 }); Shot(s, charge + 2.3, "HeYoutian", { volume: 0.8 });
  // 过道里的：一个被班长他们从街上打倒、一个被顺子打倒，剩下一个从大门往东街跑
  Shot(s, charge + 2.8, "Luo", { volume: 0.8 });
  s.Key("GateIja1", charge + 2.9, { clip: "ShotCollapse", clipHold: true });
  s.Key("GateIja1", charge + 4.3, { state: "down", clip: null, yawDeg: 0 });
  s.Eye(charge + 1.4, 1.0, { stance: "stand", look: UP(K7("Leader")), pitch: -3, toLook: GATE_POST, toPitch: -2 });
  Shot(s, charge + 3.6, "player");
  s.Key("Rifle1", charge + 3.7, { clip: "ShotCollapse", clipHold: true });
  s.Key("Rifle1", charge + 5.2, { state: "down", clip: null, yawDeg: 10 });
  const flee = Route(UP(K7("Rifle2")), UP(K("Rifle2")));
  s.Go("Rifle2", charge + 2.4, charge + 2.4 + RouteLen(UP(K7("Rifle2")), [...flee.path, flee.end]) / 3.4, flee.end.x, flee.end.z, { move: "run", path: flee.path, yawDeg: -100 });
  s.Caption(charge + 3.0, 3.0, "（两面一夹，剩下一两个从大门往东街跑了）");
  // 走到北窗边往街上看：班长他们顺着主街冲过来
  const win = charge + 5.0;
  s.Cam(win, 2.0, { from: { x: P.x, z: P.z, h: 1.62 }, to: { x: 96.4, z: 473.0, h: 1.5 }, look: { ...GATE_POST, h: 1.0 }, lookTo: { x: 100, z: 452, h: 1.3 } });
  s.Cam(win + 2.0, 5.0, { from: { x: 96.4, z: 473.0, h: 1.5 }, look: { x: 100, z: 452, h: 1.3 }, lookTo: { actor: "Luo", offset: [0, 1.2, 0] } });
  s.Caption(win + 0.4, 3.0, "（北窗边往街上看：班长从大车后头冲上来了）");
  for (const [t, v] of [[win + 1.0, 0.45], [win + 3.6, 0.6]]) s.Sfx(t, "rifleShot", { x: 180, z: 465, volume: v });
  s.Caption(win + 4.0, 3.0, "（东头的枪声近了：喊人那个鬼子把大队带回来了）");
  void luoFrom;
  return s.Done({ durationS: win + 7.4 });
}

function S1002(ctx) {
  const s = new Seq(ctx, "10-2", "石碾后头：调过来！先头五六个顺东街冲");
  const K = id => KU(ctx, "10-2", id), K1 = id => KU(ctx, "10-1", id);
  const P = KP(ctx, "10-2");
  const FRONT_DOOR_OUT = Pt(PL.frontDoor.x, PL.frontDoor.z - 1.6);
  // 开场：顺子刚从前门出来站在门口；班长他们在街上（10-1 的位置）；东头的鬼子都还在东街东头
  for (const id of ["Luo", "LiuWencai", "Yaowa", "HeYoutian", "Escort1", "Squad3"]) { const u = K1(id); s.Place(id, 0, u.x, u.z, { stance: "stand", aim: !!u.aim, yawDeg: 180 }); }
  const east0 = { EastIja1: Pt(206, 465.0), EastIja2: Pt(208.5, 464.0), EastIja3: Pt(211, 465.0), EastIja4: Pt(214, 464.2), EastIja5: Pt(216, 465.1), GateIja2: Pt(218, 464.4), EastIja6: Pt(220, 465.0) };
  for (const [id, p] of Object.entries(east0)) s.Place(id, 0, p.x, p.z, { state: "alive", stance: "crouch", aim: true, yawDeg: 90 });
  const luo0 = UP(K1("Luo"));
  s.Eye(0, 3.0, { stance: "stand", x: FRONT_DOOR_OUT.x, z: FRONT_DOOR_OUT.z, look: luo0, pitch: -2 });
  for (const [t, v] of [[0.4, 0.6], [1.3, 0.7]]) s.Sfx(t, "rifleShot", { x: 205, z: 465, volume: v });
  // 班长在街上吼：调过来！朝东打！（挥手朝东指）
  s.Key("Luo", 0.6, { faceTo: "player" });
  const turn = s.Say("TurnEast.01", "Luo", 1.2);
  s.Key("Luo", turn + 0.2, { clip: POINT_STAND, faceTo: EAST_END });
  // 全班调到东街口；何有田进前屋拆机枪组身上的子弹袋
  for (const id of ["Luo", "LiuWencai", "Yaowa", "Escort1", "Squad3", "HeYoutian"]) {
    const to = K(id);
    const t0 = turn + 1.2 + (id === "Luo" ? 0 : 0.6);
    const r = Route(s.pos.get(id), to);
    s.Go(id, t0, t0 + RouteLen(s.pos.get(id), [...r.path, r.end]) / 3.0, r.end.x, r.end.z, { move: "run", path: r.path, depart: { clip: null }, stance: "crouch", yawDeg: to.yawDeg, ...(to.aim ? { aim: true } : {}) });
  }
  s.Caption(turn + 1.6, 3.6, "（顺子把缴来的十一年式拖到门口石碾后头，朝东压住东街。何有田去拆机枪组身上的子弹袋）");
  s.Eye(3.0, 2.0, { stance: "stand", x: FRONT_DOOR_OUT.x, z: FRONT_DOOR_OUT.z, look: luo0, pitch: -2, toLook: ROLLER, toPitch: -8 });
  // 切到石碾后头趴着朝东：东街又直又长，两边院墙夹着
  const prone = turn + 5.4;
  s.Eye(prone, 24, { stance: "prone", look: Pt(EAST_END.x, EAST_END.z), pitch: 1, fov: 50 });
  s.Caption(prone + 0.4, 3.6, "（弹斗一次装六个五发桥夹，三十发；子弹只有机枪组身上带的那些，打完就没了）");
  // 大队先头五六个顺着东街冲，两个两个贴着门洞往前跳
  const go = prone + 1.6;
  s.Say("EastEndCharge.01", "EastIja1", go);
  s.Caption(go + 1.0, 3.2, "（大队先头五六个顺着东街冲，两个两个贴着门洞往前跳）");
  // 每人几段跳：门洞 x（北侧 196 / 140，南侧 212 / 186 / 158 / 132）之间
  const bound = (id, pts, t0, dwell = 1.0, speed = 3.4) => {
    let t = t0;
    for (const p of pts) { const d = Dist(s.pos.get(id), p); s.Go(id, t, t + d / speed, p.x, p.z, { move: "run", stance: "crouch", aim: true, yawDeg: 90 }); t = R(t + d / speed + dwell); }
    return t;
  };
  const tA = bound("EastIja1", [Pt(186.6, 465.0), Pt(166, 465.0), UP(K("EastIja1"))], go + 0.6);
  const tB = bound("EastIja2", [Pt(196.4, 464.0), Pt(178, 463.9), UP(K("EastIja2"))], go + 1.2);
  const tC = bound("EastIja3", [Pt(199, 465.0), Pt(186, 465.0), UP(K("EastIja3"))], go + 2.0);
  bound("EastIja4", [Pt(205, 464.0), Pt(196.4, 464.1)], go + 2.6);
  bound("EastIja5", [Pt(207, 465.1), Pt(201, 465.0)], go + 3.0);
  bound("GateIja2", [Pt(209, 464.4), Pt(203, 464.6)], go + 3.4);
  s.Go("EastIja6", go + 3.0, go + 5.4, K("EastIja6").x, K("EastIja6").z, { move: "run", path: [Pt(212, 465.0)], stance: "crouch", aim: true, yawDeg: 90 });
  // 机枪一扫就趴：倒了三个（37 / 50 / 59 m），剩下的缩到土地庙后头
  Shot(s, go + 3.0, "EastIja2", { count: 3, interval: 0.16, volume: 0.8 }); Puff(s, go + 3.3, Pt(114.4, 465.0));
  const kill = (id, t, yaw) => { Shot(s, t, "player", { count: 6, interval: 0.11, sfx: "mgBurstNear" }); s.Key(id, t + 0.3, { clip: "ShotCollapse", clipHold: true }); s.Key(id, t + 1.8, { state: "down", clip: null, yawDeg: yaw }); Puff(s, t + 0.5, Off(s.pos.get(id), 2.5, -0.4)); };
  kill("EastIja1", tA - 0.9, 80); kill("EastIja2", tB - 0.9, 110); kill("EastIja3", tC - 0.9, 70);
  s.Caption(tC + 0.2, 3.0, "（机枪一扫就趴，倒了两三个）");
  // 军官（指着前头吼：VilIjaShoutPoint）：退！躲到小庙后头！
  const retreat = s.Say("EastEndOfficer.01", "EastIja5", tC + 1.0);
  s.Key("EastIja5", retreat - 0.3, { clip: VIL.shout, faceTo: SHRINE });
  for (const [id, k] of [["EastIja4", 0], ["EastIja5", 1], ["GateIja2", 2]]) { const to = K(id); s.Go(id, retreat + 0.6 + k * 0.4, retreat + 2.4 + k * 0.4, to.x, to.z, { move: "run", stance: "crouch", aim: true, yawDeg: to.yawDeg, ...(id === "EastIja5" ? { depart: { clip: null } } : {}) }); }
  Shot(s, retreat + 1.4, "player", { count: 5, interval: 0.11, sfx: "mgBurstNear" }); Puff(s, retreat + 1.8, Pt(190.4, 465.2)); Puff(s, retreat + 2.1, Pt(193.0, 465.0));
  s.Caption(retreat + 2.8, 3.2, "（剩下的缩到土地庙后头。这一步教玩家：这挺枪守得住巷子。喊人那个鬼子就在庙后头）");
  Shot(s, retreat + 5.0, "EastIja4", { count: 2, interval: 0.3, volume: 0.8 }); Puff(s, retreat + 5.3, Pt(113.0, 466.4));
  s.Shake(retreat + 5.3, 0.3, 0.15);
  s.Eye(retreat + 5.0, 2.0, { stance: "prone", look: Pt(EAST_END.x, EAST_END.z), pitch: 1, toLook: SHRINE, toPitch: 1, fov: 50 });
  void P;
  return s.Done({ durationS: retreat + 7.6 });
}

function S1003(ctx) {
  const s = new Seq(ctx, "10-3", "掷弹筒：麦秸垛后头「嘭」，落点一发比一发近");
  const K = id => KU(ctx, "10-3", id);
  s.Eye(0, 30, { stance: "prone", look: SHRINE, pitch: 1, fov: 50 });
  s.Caption(0.3, 3.0, "（他们不往巷子里硬挤了。土地庙后的人不动）");
  { const u = KU(ctx, "10-2", "HeYoutian"); s.Place("HeYoutian", 0, u.x, u.z, { stance: "crouch", yawDeg: u.yawDeg }); }
  // 军官回头朝场院里的掷弹筒手交代（指着垛子吼）
  s.Key("EastIja5", 0.4, { faceTo: STRAW, clip: VIL.shout });
  const order = s.Say("EastEndOfficer.02", "EastIja5", 1.6);
  s.Key("EastIja5", s.End("EastEndOfficer.02") + 0.3, { faceTo: ROLLER, aim: true, clip: null });
  // 三发：嘭 → 5.5 s 后落地，一发比一发近（15 → 8 → 4 m）
  const pop1 = s.End("EastEndOfficer.02") + 1.0;
  // 掷弹筒组（PrevizIja stage launcherCrew，从石碾后看不见、只听得见）：射手 PvIjaLauncherFire（2 s 一循环、1.60 s 发射）、
  // 装填手在他右前 (0.46, 0.30)、左转 50° 播 PvIjaLauncherLoad，同时起播；clipFrom 让第一发「嘭」落在循环的 1.60 s 上
  {
    const g = UP(K("Mortar1")), gYaw = Yaw(g, ROLLER);
    const ld = Fwd(g, gYaw, 0.30, 0.46);
    const from = R((((1.6 - pop1) % 2) + 2) % 2);
    s.Place("Mortar1", 0, g.x, g.z, { yawDeg: gYaw, stance: "crouch", aim: false, clip: "PvIjaLauncherFire", clipFrom: from });
    s.Place("Mortar2", 0, ld.x, ld.z, { yawDeg: R(gYaw + 50), stance: "crouch", aim: false, clip: "PvIjaLauncherLoad", clipFrom: from });
    s.Key("Mortar3", 0, { stance: "crouch", faceTo: ROLLER });
  }
  const h1 = Mortar(s, pop1, Pt(128.0, 463.4), { shake: 0.25 });
  s.Caption(pop1 + 0.3, 3.4, "（场院麦秸垛后头「嘭」一声：掷弹筒开始找石碾。从石碾后看不见垛子，只看得见冒上来的烟）");
  s.Caption(h1 + 0.3, 2.6, "（第一发落在十几米外）");
  Shot(s, h1 + 1.2, "player", { count: 5, interval: 0.11, sfx: "mgBurstNear" }); Puff(s, h1 + 1.6, Pt(192.6, 465.4));
  const h2 = Mortar(s, h1 + 1.6, Pt(121.0, 464.6), { shake: 0.5 });
  s.Caption(h2 + 0.3, 2.6, "（下一发近一点）");
  Shot(s, h2 + 1.0, "EastIja6", { count: 2, interval: 0.3, volume: 0.7 }); Puff(s, h2 + 1.3, Pt(114.6, 466.6));
  Shot(s, h2 + 2.2, "player", { count: 4, interval: 0.11, sfx: "mgBurstNear" }); Puff(s, h2 + 2.6, Pt(211.0, 466.0));
  const h3 = Mortar(s, h2 + 1.8, Pt(116.6, 463.9), { shake: 0.75 });
  s.Eye(h3 - 0.1, 0.8, { stance: "prone", look: SHRINE, pitch: 1, toPitch: -6, fov: 50, shake: 0.5 });
  s.Eye(h3 + 0.7, 4.0, { stance: "prone", look: SHRINE, pitch: -6, toPitch: 1, fov: 50 });
  s.Caption(h3 + 0.3, 3.6, "（再下一发更近。弹斗里还剩几发、落点还差几步：玩家看得见的两个倒计时）");
  // 何有田拆完子弹袋从前门出来，蹲到石碾边
  const he = UP(K("HeYoutian"));
  s.Go("HeYoutian", h1 + 0.4, h1 + 3.6, he.x, he.z, { move: "run", path: [Pt(PL.frontDoor.x, 472.6), Pt(PL.frontDoor.x, 468.4)], stance: "crouch", faceTo: "player" });
  s.Caption(h3 + 4.2, 2.6, "（何有田把拆下来的子弹袋递过来：弹斗见底）");
  Shot(s, h3 + 5.0, "player", { count: 6, interval: 0.11, sfx: "mgBurstNear" }); Puff(s, h3 + 5.4, Pt(194.0, 465.6));
  void order;
  return s.Done({ durationS: h3 + 7.0 });
}

function S1004(ctx) {
  const s = new Seq(ctx, "10-4", "砸门抄北边：左手院子！文财、幺娃堵到");
  const K = id => KU(ctx, "10-4", id), K3 = id => KU(ctx, "10-3", id);
  const farmDoor = Pt(EY.northChain.farmyardDoor.x, EY.northChain.farmyardDoor.z), yard1Door = Pt(EY.northChain.yard1Door.x, EY.northChain.yard1Door.z);
  // 开场：三道门都还好好的（三扇门随 NorthYardGatesBroken 一起倒）；北边那伙人分在三个院子里，各自站在一道门前：
  // 砸门的站在门板前 0.55 m（清单 stage gate），枪托连砸两下、踹门（VilIjaGateSmash：砸 0.45 / 0.95 s、踹 1.6 s），一个院子一个院子往西
  s.Signal(0, SIG.northYardGatesBroken, false);
  const GATE_M = 0.55 + 0.15;                        // 门板前 0.55 m + 院墙半厚
  const n0 = {
    NorthIja4: [Pt(farmDoor.x + GATE_M, farmDoor.z), 90],          // 场院西隔墙的门（他在场院里，面朝西）
    NorthIja3: [Pt(yard1Door.x + GATE_M, yard1Door.z), 90],        // 北侧第一个院西墙的门
    NorthIja2: [Pt(yard1Door.x + 2.2, yard1Door.z + 1.2), 90],
    NorthIja1: [Pt(POCKET_GATE.x, POCKET_GATE.z - GATE_M), 180],   // 北角北墙上的院门（他在院里，面朝南）
  };
  for (const [id, [p, yaw]] of Object.entries(n0)) s.Place(id, 0, p.x, p.z, { stance: "stand", aim: false, yawDeg: yaw });
  for (const id of ["LiuWencai", "Yaowa"]) { const u = K3(id); s.Place(id, 0, u.x, u.z, { stance: "crouch", aim: !!u.aim, yawDeg: u.yawDeg }); }
  s.Eye(0, 3.0, { stance: "prone", look: SHRINE, pitch: 1, fov: 50 });
  // 军官：砸开北边的院门，穿院子，从后头绕
  s.Say("EastEndOfficer.03", "EastIja5", 0.8);
  // 北边院子里「咣、咣」砸门，一个院子一个院子往西挪：gateSmash（Sfx_GateSmash.mp3 2.33 s：枪托两下 0.07 / 0.84 s、一脚踹 1.66 s）
  // 一道门放一遍，文件里第一下对齐片段第一下砸（0.45 s）→ 文件从 t + 0.38 起；后两下比片段的 0.95 / 1.6 晚 0.27 / 0.44 s（文件里的间隔比片段宽，认了）
  const SMASH_SFX_LEAD = R(0.45 - SFX_FILE.gateSmash.hits[0]);
  const smash = (id, t, p, v) => {
    s.Key(id, t, { clip: VIL.smash });
    s.Sfx(t + SMASH_SFX_LEAD, "gateSmash", { x: p.x, z: p.z, volume: v });
    s.Key(id, t + VilClipS(VIL.smash), { clip: null });
    return R(t + 1.6);
  };
  smash("NorthIja4", 3.6, farmDoor, 0.4); smash("NorthIja3", 6.6, yard1Door, 0.6);
  const broken = smash("NorthIja1", 10.0, POCKET_GATE, 0.9);   // 最后那一踹（11.6 s）门就倒了
  s.Caption(4.2, 3.4, "（北边院子里「咣、咣」砸门，一个院子一个院子往西挪，越来越近：有人要从路口北边的院子钻出来抄石碾的后路）");
  s.Signal(broken, SIG.northYardGatesBroken, true);
  s.Sfx(broken, "dirtFall", { x: POCKET_GATE.x, z: POCKET_GATE.z, volume: 0.7 });
  s.Ev(broken, "smoke", { x: POCKET_GATE.x, z: POCKET_GATE.z + 0.6, kind: "SmokeDust", dur: 2.5 });
  s.Caption(broken + 0.2, 2.6, "（北角那道院门倒了）");
  // 门一倒他们就往西钻：穿场院的门 → 北侧第一个院 → 主街东侧最南那院 → 北角院门外；砸北角院门的那个已经在门外，蹲下端枪
  for (const id of ["NorthIja4", "NorthIja3", "NorthIja2"]) {
    const to = UP(K(id));
    const k = ["NorthIja4", "NorthIja3", "NorthIja2"].indexOf(id);
    const path = [Pt(farmDoor.x, farmDoor.z), Pt(yard1Door.x, yard1Door.z), Pt(114.5, 450.5)].filter(p => p.x > to.x + 0.5 && p.x < s.pos.get(id).x - 0.5);
    const len = RouteLen(s.pos.get(id), [...path, to]);
    s.Go(id, broken + 0.9 + k * 0.5, broken + 0.9 + k * 0.5 + len / 3.3, to.x, to.z, { move: "run", path, stance: "stand", aim: true, yawDeg: K(id).yawDeg });
  }
  { const to = UP(K("NorthIja1")); s.Go("NorthIja1", broken + 0.9, broken + 2.0, to.x, to.z, { move: "walk", stance: "crouch", aim: true, yawDeg: K("NorthIja1").yawDeg }); }
  // 班长：左手院子！文财、幺娃，给老子堵到！
  s.Eye(3.0, 1.4, { stance: "prone", look: SHRINE, pitch: 1, toLook: POCKET_GATE, toPitch: 0, fov: 50 });
  s.Key("Luo", broken - 0.6, { faceTo: POCKET_GATE });
  const hold = s.Say("HoldEastStreet.01", "Luo", broken + 0.8);
  s.Key("Luo", hold + 1.0, { clip: POINT_CROUCH });
  s.Key("Luo", hold + 4.0, { clip: null, faceTo: EAST_END, aim: true });
  for (const id of ["LiuWencai", "Yaowa"]) { const to = K(id); s.Go(id, hold + 1.6 + (id === "Yaowa" ? 0.4 : 0), hold + 4.0 + (id === "Yaowa" ? 0.4 : 0), to.x, to.z, { move: "run", stance: "crouch", aim: true, yawDeg: to.yawDeg }); }
  s.Caption(hold + 1.2, 3.0, "（文财、幺娃蹲到北角口上堵。最前头那个已经到了北角院门外）");
  Shot(s, hold + 4.6, "LiuWencai", { volume: 0.9 }); Shot(s, hold + 5.2, "Yaowa", { volume: 0.9 });
  Shot(s, hold + 5.6, "NorthIja1", { volume: 0.9 }); Puff(s, hold + 5.9, Pt(110.2, 461.2));
  s.Caption(hold + 5.0, 2.8, "（东街上土地庙后的人、掷弹筒都还在）");
  Mortar(s, hold + 2.0, Pt(118.4, 462.6), { shake: 0.6 });
  Shot(s, hold + 3.0, "player", { count: 4, interval: 0.11, sfx: "mgBurstNear" }); Puff(s, hold + 3.4, Pt(193.4, 465.2));
  s.Eye(hold + 6.0, 1.4, { stance: "prone", look: POCKET_GATE, pitch: 0, toLook: SHRINE, toPitch: 1, fov: 50 });
  return s.Done({ durationS: hold + 9.0 });
}

function S1005(ctx) {
  const s = new Seq(ctx, "10-5", "穿院子：南边摸后门，有田去守；妮儿抱住老耿的腿");
  const K = id => KU(ctx, "10-5", id), K4 = id => KU(ctx, "10-4", id);
  const P = KP(ctx, "10-5");
  const MILL_MAN = UP(K("MillOldMan"));
  const GATE_IN = Pt(GATE_X, G.compound.minZ + 1.3);
  const climb = Pt(EY.southClimb.x, EY.southClimb.z);
  // 开场：顺子退到后院里，看着大门过道：后送队顺着主街进了老耿家（东街的枪打不进院子，往南的路正好从老耿家后头出去）
  s.Eye(0, 4.0, { stance: "stand", look: Pt(GATE_X, 478), pitch: -2 });
  s.Caption(0.3, 3.6, "（东街的枪打不进院子，往南的路又正好从老耿家后头出去：后送队顺着主街进了老耿家。石碾后头由别人先顶着）");
  // 队伍：担架走大门过道、走着的伤员走前门穿前屋；都从街上（z 440…465）出发走到 10-5 的位置。
  // Helper01 背着 Walker01（VilNraCarryOnBack + VilRideOnBack，同根同向），走到 Helper01 的落点
  const conv = [["LitterDonggua", Pt(108.2, 460.0), 1.2], ["Litter01", Pt(104.6, 456.0), 1.2], ["Litter02", Pt(100.6, 451.0), 1.2], ["Litter03", Pt(99.0, 446.0), 1.1], ["Litter04", Pt(98.6, 441.0), 1.1],
    ["Walker02", Pt(101.4, 459.0), 1.1], ["Walker03", Pt(101.0, 455.4), 1.1], ["Walker04", Pt(100.4, 452.0), 1.1], ["Walker05", Pt(102.0, 448.2), 1.1], ["Walker06", Pt(98.4, 449.6), 1.1], ["Walker07", Pt(98.6, 444.0), 1.1],
    ["Medic", Pt(106.6, 458.4), 1.4], ["Officer", Pt(101.8, 450.6), 1.4], ["Geng", Pt(101.0, 462.0), 1.5], ["GengCart", Pt(108.0, 450.0), 1.3]];
  const T0 = 0.8;
  let gengArrive = 0;
  for (const [id, from, mps] of conv) {
    const to = K(id);
    s.Place(id, 0, from.x, from.z, { yawDeg: 180, ...(id.startsWith("Walker") ? { stance: "crouch" } : {}) });
    const r = Route(from, to);
    const t1 = R(T0 + RouteLen(from, [...r.path, r.end]) / mps);
    s.Go(id, T0, t1, r.end.x, r.end.z, { move: "walk", path: r.path, yawDeg: to.yawDeg });
    if (id === "Geng") gengArrive = t1;
  }
  { const from = Pt(101.8, 462.4), to = UP(K("Helper01")), r = Route(from, to); CarryPair(s, "Helper01", "Walker01", from, 180); CarryGo(s, "Helper01", "Walker01", T0, r.end, { speed: 1.1, path: r.path, yawDeg: K("Helper01").yawDeg }); }
  { const from = Pt(108.2, 460.0), to = K("LitterDonggua"), r = Route(from, to); s.Place("Donggua", 0, from.x, from.z, { lie: "along", yawDeg: 180 }); s.Go("Donggua", T0, R(T0 + RouteLen(from, [...r.path, r.end]) / 1.2), r.end.x, r.end.z, { move: "walk", path: r.path, yawDeg: K("Donggua").yawDeg }); }
  s.Caption(4.2, 3.0, "（担架一副一副从大门过道抬进来，走着的伤员从前门穿前屋）");
  // 南边有人翻墙往后门摸：班长：有田！滚去后门守到！
  // （南侧第一个院 x 118…146、z 467…490：从院子北半截跑到南墙根；翻过墙那一下用硬切顶）
  // 院里那座房子 x 124…142、z 483…489 几乎贴着南墙：人从房子西头绕到南墙根
  s.Place("SouthIja1", 0, 121.0, 477.0, { stance: "stand", yawDeg: 180 });
  s.Place("SouthIja2", 0, 122.6, 475.0, { stance: "stand", yawDeg: 180 });
  s.Place("SouthIja3", 0, 141.0, 477.0, { stance: "stand", yawDeg: 180 });
  s.Say("EastEndOfficer.04", "EastIja5", 2.0);
  s.Go("SouthIja3", 3.0, 6.0, K("SouthIja3").x, K("SouthIja3").z, { move: "run", stance: "crouch", yawDeg: K("SouthIja3").yawDeg });
  // 翻 2.2 m 的南院墙（VilIjaClimbWall：清单 stage villageWall——墙面在根前 0.35 m、墙厚 0.3，攀、引体、跨腿、跳下，落在根前 1.05 m）
  const WALL_HALF = 0.15;
  const climbRoot = Pt(climb.x, climb.z - WALL_HALF - 0.35);
  s.Go("SouthIja1", 3.4, 7.4, climbRoot.x, climbRoot.z, { move: "run", path: [Pt(121.5, 489.4)], yawDeg: 180 });
  const CLIMB = 7.6;
  s.Key("SouthIja1", CLIMB, { clip: VIL.climbWall });
  const landed = RootEndAt(VIL.climbWall, climbRoot, 180);
  s.Key("SouthIja1", CLIMB + VilClipS(VIL.climbWall), { x: landed.x, z: landed.z, move: "cut", clip: null, stance: "crouch", faceTo: Pt(PL.backDoor.x, PL.backDoor.z) });
  s.Go("SouthIja2", 4.0, 7.4, 121.2, 489.3, { move: "run", yawDeg: 180 });
  s.Place("SouthIja2", CLIMB + VilClipS(VIL.climbWall) + 0.4, K("SouthIja2").x, K("SouthIja2").z, { stance: "crouch", yawDeg: K("SouthIja2").yawDeg });
  s.Caption(7.0, 3.0, "（南边也有人翻墙，往老耿家后门摸：看不见，只听得见院墙那头的动静）");
  s.Sfx(CLIMB + 3.2, "dirtFall", { x: climb.x, z: climb.z + 1, volume: 0.4 });
  const he0 = UP(K4("HeYoutian"));
  s.Place("HeYoutian", 0, he0.x, he0.z, { stance: "crouch", yawDeg: -70 });
  const guard = s.Say("HoldEastStreet.02", "Luo", 8.6);
  s.Key("Luo", guard - 0.3, { faceTo: "HeYoutian" });
  s.Key("Luo", s.End("HoldEastStreet.02") + 0.3, { faceTo: EAST_END, aim: true });
  { const to = K("HeYoutian"), r = Route(he0, to); s.Go("HeYoutian", guard + 0.6, guard + 0.6 + RouteLen(he0, [...r.path, r.end]) / 3.0, r.end.x, r.end.z, { move: "run", path: r.path, stance: "crouch", aim: true, yawDeg: to.yawDeg }); }
  s.Caption(guard + 1.0, 2.8, "（何有田穿过院子，端着枪守到后门边）");
  // 石碾后由 Squad3 顶着
  { const u = K4("Squad3"), to = K("Squad3"); s.Place("Squad3", 0, u.x, u.z, { stance: "crouch", aim: true, yawDeg: u.yawDeg }); s.Go("Squad3", 0.6, 3.6, to.x, to.z, { move: "walk", stance: "prone", aim: true, yawDeg: -90 }); }
  Shot(s, 3.4, "Squad3", { count: 5, interval: 0.11, sfx: "mgBurstNear", volume: 0.7 });
  Shot(s, guard + 3.0, "Squad3", { count: 5, interval: 0.11, sfx: "mgBurstNear", volume: 0.7 });
  // 眼睛：看着大门过道进来的担架，再看老耿进院；妮儿扑过去一把抱住他的腿（VilHugLegs：清单 stage hugLegs——老耿面对着她
  // 站在她前方 0.341 m（小孩身体 0.62），1.0 s 抱住，之后抽泣着抱着不放；老耿这几秒不转身，看人只在说明字里）
  const geng = UP(K("Geng")), gengYaw = K("Geng").yawDeg;
  const hug = StageAnchorFrom("hugLegs", "geng", geng, gengYaw);
  s.Place("Nier", 0, 92.4, 485.6, { stance: "crouch", faceTo: Pt(GATE_X, 481), clip: VIL.crouch });
  const look = Math.max(gengArrive + 0.2, 12.0);
  s.Eye(4.0, look - 4.0 - 1.0, { stance: "stand", look: Pt(GATE_X, 478), pitch: -2, toLook: GATE_IN, toPitch: -2 });
  s.Eye(look - 1.0, 1.2, { stance: "stand", look: GATE_IN, pitch: -2, toLook: geng, toPitch: -4 });
  s.Go("Nier", look - 1.8, look + 0.4, hug.x, hug.z, { move: "run", depart: { stance: "stand", clip: null }, yawDeg: hug.yawDeg, clip: VIL.hug, clipHold: true });
  s.Caption(look + 0.2, 3.0, "（老耿进了院子，妮儿扑过去抱住他的腿）");
  s.Eye(look + 1.4, 1.4, { stance: "stand", look: geng, pitch: -4, toLook: MILL_MAN, toPitch: -12 });
  s.Caption(look + 3.4, 3.4, "（老耿看了一眼地上的人，又看了一眼顺子，什么也没说）");
  s.Eye(look + 3.0, 1.4, { stance: "stand", look: MILL_MAN, pitch: -12, toLook: geng, toPitch: -4 });
  s.Key("Geng", look + 6.4, { faceTo: Pt(PL.backDoor.x, PL.backDoor.z) });
  s.Caption(look + 7.0, 2.6, "（他朝后门走去）");
  s.Go("Geng", look + 7.0, look + 12.0, 100.4, 502.0, { move: "walk", faceTo: Pt(PL.backDoor.x, PL.backDoor.z) });
  s.Go("Nier", look + 7.4, look + 12.4, 101.2, 501.0, { move: "walk", depart: { clip: null, stance: "crouch" }, stance: "crouch", faceTo: "Geng", clip: VIL.crouch });
  s.Eye(look + 6.6, 1.6, { stance: "stand", look: geng, pitch: -4, toLook: Pt(PL.backDoor.x, PL.backDoor.z), toPitch: -4 });
  Mortar(s, 6.0, Pt(119.6, 462.2), { shake: 0.3 });
  void P;
  return s.Done({ durationS: look + 13.0 });
}

function S1006(ctx) {
  const s = new Seq(ctx, "10-6", "后门：挪开水缸，担架往外抬；幺娃接过机枪");
  const K = id => KU(ctx, "10-6", id), K5 = id => KU(ctx, "10-5", id);
  const P = KP(ctx, "10-6");
  const BACK = Pt(PL.backDoor.x, PL.backDoor.z);
  const VAT = Pt(G.backVat.x, G.backVat.z);
  // 开场：门还关着、水缸堵在门里头；老耿站在缸西边（PrevizVillage V2 的 VilPushVat，清单 stage vatDoor：根在缸中心西 1.05 m、面朝东，
  // 把缸顺着 z 504 往东推 1.7 m 到 (99.7,504)，转身往南走到门前拔门闩、把门板拉进院里），妮儿蹲在他西北边；顺子站在院里看着
  s.Signal(0, SIG.backVatMoved, false);
  s.Signal(0, SIG.backDoorOpen, false);
  const VD = VILLAGE_STAGES.vatDoor;
  const VAT_ROOT = Pt(VAT.x + VD.vatStart.z, VAT.z - VD.vatStart.x), VAT_YAW = -90;     // 缸在根前方 1.05 m（清单 vatStart.z = −1.05）；朝东 = −90
  s.Place("Geng", 0, VAT_ROOT.x, VAT_ROOT.z, { yawDeg: VAT_YAW });
  s.Place("Nier", 0, 96.6, 502.9, { stance: "crouch", faceTo: "Geng", clip: VIL.crouch });
  // 冬瓜的担架这会儿已经抬进了院子，停在后门前几米等门开；下一副在大门过道里
  const DG0 = Pt(105.4, 492.0);
  s.Place("LitterDonggua", 0, DG0.x, DG0.z, { yawDeg: 180 });
  s.Place("Donggua", 0, DG0.x, DG0.z, { lie: "along", yawDeg: 180 });
  s.Place("Medic", 0, 107.0, 491.2, { stance: "crouch", faceTo: "Donggua" });
  s.Place("Litter01", 0, GATE_X, 484.0, { yawDeg: 180 });
  const he = UP(K("HeYoutian"));
  s.Place("HeYoutian", 0, UP(K5("HeYoutian")).x, UP(K5("HeYoutian")).z, { stance: "crouch", aim: true, yawDeg: 180 });
  const inYard = Pt(98.6, 500.4);
  const VAT_MOVED = Pt(G.backVatMoved.x, G.backVatMoved.z);
  // 挪缸开门（VilPushVat V2，6.8 s）：两手上缸 0.4 s → 弯着腰把缸往正前方（东）推 1.7 m，2.8 s 推到位（信号 BackVatMoved：缸换到 (99.7,504)）→
  // 直起来右转朝南走到门前 → 5.15 s 手上门闩、5.55 s 拔开 → 5.75 s 两手扒住门板往院里拉，6.3 s 松手、6.6 s 门板摆到 90°；
  // 门板摆开的信号 BackDoorOpen 切在拉门的半道 6.1 s（关着的门板消失、开到西墙边的门板出现）。播完人在门东边、面朝门口（root.end 右 0.55 / 前 0.90、右转 90°）
  const PUSH = 0.8;
  const EV = Object.fromEntries((VILLAGE.clips[VIL.pushVat].events || []).map(e => [e.kind, e.t]));
  const vatMoved = R(PUSH + EV.vatMoved), open = R(PUSH + (EV.doorGrab + EV.handsOff) / 2);
  s.Eye(0, vatMoved + 0.6, { stance: "stand", x: inYard.x, z: inYard.z, look: VAT, pitch: -10, toLook: VAT_MOVED, toPitch: -10 });
  s.Caption(0.4, 3.4, "（老耿站在缸西边，弓着腰把堵门的水缸往东推开，再绕到门前拔开朝南的后门，把门板拉进院里）");
  s.Key("Geng", PUSH, { clip: VIL.pushVat });
  s.Sfx(PUSH + EV.handsOnVat + 0.6, "dirtFall", { x: (VAT.x + VAT_MOVED.x) / 2, z: VAT.z, volume: 0.5 });   // 缸底在地上蹭
  s.Signal(vatMoved, SIG.backVatMoved, true);
  s.Caption(vatMoved + 0.2, 2.6, "（缸推到门东边，门口让开了）");
  s.Eye(vatMoved + 0.6, open - vatMoved - 0.6, { stance: "stand", x: inYard.x, z: inYard.z, look: VAT_MOVED, pitch: -10, toLook: BACK, toPitch: -6 });
  s.Signal(open, SIG.backDoorOpen, true);
  const pushed = R(PUSH + VilClipS(VIL.pushVat));
  // 播完切到清单 root.end（门东边、面朝门口），再往东挪到关键帧的位置让担架过
  const gengEnd = RootEndAt(VIL.pushVat, VAT_ROOT, VAT_YAW), gengEndYaw = R(WrapDeg(VAT_YAW + VILLAGE.models[0].clips.find(c => c.clip === VIL.pushVat).root.end[2]));
  s.Key("Geng", pushed, { x: gengEnd.x, z: gengEnd.z, move: "cut", yawDeg: gengEndYaw, clip: null });
  s.Go("Geng", pushed + 0.6, pushed + 2.4, K("Geng").x, K("Geng").z, { move: "walk", path: [Pt(99.0, 503.0)], yawDeg: K("Geng").yawDeg });
  s.Go("Nier", pushed + 0.8, pushed + 2.6, K("Nier").x, K("Nier").z, { move: "walk", path: [Pt(98.2, 501.6)], depart: { clip: null }, stance: "crouch", faceTo: "Geng", clip: VIL.crouch });
  s.Go("HeYoutian", open + 0.2, open + 1.4, he.x, he.z, { move: "walk", stance: "crouch", aim: true, yawDeg: 180 });
  s.Caption(open + 0.4, 3.0, "（门板拉开了，贴在西墙边。何有田端着枪守在门边。后门外是一条往南出村的小路）");
  // 担架一副接一副往外抬：冬瓜的担架先出门
  const litterOut = Pt(BACK.x, G.compound.maxZ + 9.0);
  const lRoute = Route(DG0, litterOut);
  const lLen = RouteLen(DG0, [...lRoute.path, lRoute.end]);
  const t0 = open + 1.0, t1 = R(t0 + lLen / 1.2);
  s.Go("LitterDonggua", t0, t1, lRoute.end.x, lRoute.end.z, { move: "walk", path: lRoute.path, yawDeg: 180 });
  s.Go("Donggua", t0, t1, lRoute.end.x, lRoute.end.z, { move: "walk", path: lRoute.path, yawDeg: -90 });
  s.Go("Medic", t0 + 1.4, t1 + 1.0, BACK.x - 1.0, G.compound.maxZ + 7.6, { move: "walk", path: [Pt(BACK.x, G.compound.maxZ - 2.6), Pt(BACK.x, G.compound.maxZ + 1.2)], depart: { stance: "stand" }, stance: "crouch", faceTo: "Donggua" });
  { const r = Route(Pt(GATE_X, 484.0), Pt(BACK.x, G.compound.maxZ - 4.6)); s.Go("Litter01", t0 + 4.0, t0 + 4.0 + RouteLen(Pt(GATE_X, 484.0), [...r.path, r.end]) / 1.2, r.end.x, r.end.z, { move: "walk", path: r.path, yawDeg: 180 }); }
  // 眼睛：先在院里看门开、担架出门，再切到门外路上、回头看门、再顺着小路往南看
  s.Eye(open, t0 + 2.6 - open, { stance: "stand", x: inYard.x, z: inYard.z, look: BACK, pitch: -6, toPitch: -4 });
  const outside = t0 + 2.6;
  const outEye = Pt(P.x - 0.6, P.z + 0.6);
  s.Eye(outside, 3.0, { stance: "stand", x: outEye.x, z: outEye.z, look: BACK, pitch: -4 });
  s.Caption(outside + 0.4, 2.6, "（担架一副接一副往外抬）");
  s.Eye(outside + 3.0, 2.0, { stance: "stand", x: outEye.x, z: outEye.z, look: BACK, pitch: -4, toLook: Pt(PL.villageSouth.x, PL.villageSouth.z), toPitch: -2 });
  // 弹斗快空了，掷弹筒落到石碾跟前。班长：幺娃，接到！幺娃滚过来接过机枪（小空地上一个宽镜头）
  const near = Mortar(s, outside + 1.0, Pt(112.0, 464.2), { radius: 3.5, shake: 0.6 });
  const take = s.Say("HoldEastStreet.03", "Luo", near + 0.6);
  s.Place("Yaowa", 0, K5("Yaowa").x, K5("Yaowa").z, { stance: "crouch", aim: true, yawDeg: K5("Yaowa").yawDeg });
  s.Place("Squad3", 0, K5("Squad3").x, K5("Squad3").z, { stance: "prone", aim: true, yawDeg: -90 });
  s.Cam(take - 0.4, 6.4, { from: { x: 105.8, z: 462.4, h: 1.6 }, look: { ...ROLLER, h: 0.6 }, fov: 56 });
  s.Caption(take + 0.2, 3.0, "（弹斗快空了，掷弹筒落到石碾跟前。幺娃滚过来接过机枪）");
  s.Go("Squad3", take + 0.4, take + 1.6, K("Squad3").x, K("Squad3").z, { move: "walk", stance: "crouch", aim: true, yawDeg: K("Squad3").yawDeg });
  s.Go("Yaowa", take + 0.6, take + 2.4, K("Yaowa").x, K("Yaowa").z, { move: "run", stance: "prone", yawDeg: -90 });
  s.Key("Yaowa", take + 2.6, { weapon: "Type11", aim: true });
  Shot(s, take + 3.4, "Yaowa", { count: 6, interval: 0.11, sfx: "mgBurstNear", volume: 0.9 });
  // 切回后门外：顺着小路往南看
  s.Eye(take + 6.0, 2.6, { stance: "stand", x: outEye.x, z: outEye.z, look: Pt(PL.villageSouth.x, PL.villageSouth.z), pitch: -2 });
  s.Caption(take + 6.2, 3.6, "（接 11：车先走；文财跟着去；幺娃卸下枪栓扔进水缸、何有田最后出门拴上绳子）");
  Shot(s, 2.2, "Squad3", { count: 5, interval: 0.11, sfx: "mgBurstNear", volume: 0.5 });
  Shot(s, 9.6, "Luo", { volume: 0.5 });
  return s.Done({ durationS: take + 9.8, then: "stay" });
}

export const SEQUENCE_BUILDERS = Object.freeze([
  S0601, S0602, S0603, S0701, S0702, S0703, S0704, S0801, S0802, S0803, S0804, S0805,
  S0901, S0902, S0903, S0904, S0905, S0906, S0907, S1001, S1002, S1003, S1004, S1005, S1006,
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
    title: "第一关 06–10 预演（第二版：占位动作 + 占位配音）",
    source: { generator: "node Taierzhuang1938/Script_EditorBlockoutFirstLevel0610Previz.mjs --force", note: "剧本 Notion 06–10（10-19 第二版）；手改前先想好：重跑生成器会覆盖" },
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
