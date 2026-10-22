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
//   · 07-4 三架九七式轻爆（Ki-30，段里的 aircraft[]，§14.1）排成人字，高高地（离地约 400 m）由北往南飞过凹路去炸县城，不下来、不开枪；
//     路过时看见了凹路里的人（右后那架在头顶上斜了斜翅膀），13 那两架低空扫射的是它们炸完回去、再一次出动来的（2026-10-21 用户改）；
//     人群 VilDuckProne 错峰扑倒，妮儿最后一个（她听不见，看见别人趴了才趴）。
//   · 百姓、军官全用骨骼身体放片段：按 PrevizVillage 清单把 Vil 片段放到对应的拍（妮儿坐车尾 VilSitEdge、慌跑 VilPanicRun、
//     钻狗洞 VilCrawlHole、窖里一家举手爬出 / 被捅 / 被拖 / 跪着爬、磕钢盔扔手榴弹、挑襁褓、撒尿的看守、呜咽 / 拔门闩 / 攥衣角 /
//     咬手腕、肩撞、挥手冲、砸门、翻墙、指着吼、抱腿、挪缸、08-5 老耿伸手被拽回、07 背伤员、各处蹲着的 VilCrouchHold）；
//     成对动作按清单 stages 的相对站位与 offsetS 摆（StagePlace / StageAnchorFrom），带根位移的片段播完把人挪到清单 root.end
//     （RootEndAt，小孩身体按 0.62 缩）；只在清单里标 holdLoop、运行时不循环的片段（撒尿、压刺刀）用 HoldLoop 每 1.9 s 重起一遍。
//   · 09-7 妮儿咬手腕那一下按慢动作放（段里的 slowmo[]：1.5 s、0.3 倍、进出 0.25 s 渐变），窗口里不排台词。
//
// 第五版（2026-10-21，用户当天改稿 + 空间第五版）：
//   · 07-4 全程第一人称（不再切第三人称机位）：蹲着跟班长后背跑一段 → 排长「飞机！贴到坎！」→ 顺子半蹲贴东坎根，飞机过头顶那 10 s 是
//     **能转头不能走**的眼睛（eye.free，§14.1，几条紧挨着、同位置的 free 眼睛算一段；默认视线先看人和车尾的妮儿、再抬头跟着领机、
//     滑到斜翅膀的右后那架、落回坎底）→ 班长「起来！走！」蹲姿跑 → 末段班长先直起腰、顺子跟着直起来（眼高 1.62：凹路里蹲着看不见
//     麦地那头，空间负责人实测）望见耿家庄冒烟、左前方东北道上几个鬼子往庄子东头钻 → 到村口路沟班长回头压手「趴倒！」→ 眼睛落到 08-1 的趴姿位置。
//     飞机轨不动。
//   · 08-1 村民走岔路：两个从主街东边 z 432.5 那道院门冲上街被打倒；一个从巷子后门出来顺巷子三截跑到巷子口滚进沟西头倒在顺子脚边；
//     两个从路沟后门下到沟东半截缩进后送队。老耿两句（狗日的占了俺家 / 窖里还藏着街坊）。
//   · 08-2 按新台词排（一人一场）：老耿朝东指「东边是鬼子来的道」时默认视线转向东边，顺着庄子北沿看得见东北道上远远走着的鬼子
//     （道上 x ≥ 274 那一截才看得见，RoadWalk 不让他们走出去）；说「从俺家后门出」视线回到窗口。
//   · 08-5 顺子直接跟进巷子：老耿「老总！俺妮儿」之后约 10 s 第一人称（下沟、猫腰顺沟南沿往西、拐进巷子口、再往里到夹道拐弯前 (80,394)），
//     这一段里刘文财在身后吼、班长在大车后头喊「压到起！哪个龟儿停了？！」、北窗机枪掉过来几梭全打大车；末尾「（交还操作，接 09）」。
//     09-1 的玩家起点随之改到 (80,394.5)，开头先一口气过东西那截到拐角再按「响了才挪」。
//   · 07-1 / 07-2 边走边说里各回头瞅一眼后头两步的刘文财（他听见了「路费」那段）。
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
  L0610_PLACES as PL, L0610_GENG as G, L0610_JIEFANG as JF, L0610_BENJIA as BJ, L0610_STREETS as ST, L0610_SIGNALS as SIG, L0610_EAST_STREET as ES,
  L0610_SOUTH_LANE as SLN, L0610_DITCH as DT, LanePointAtZ, PointBeside, LineLength, Station,
} from "./Data_EditorBlockoutFirstLevel0610Space.mjs";
import { StreetRoute, RoadPointAtX, BIG_LOCUST } from "./Script_EditorBlockoutFirstLevel0610Keyframes.mjs";

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
  /**
   * 第一人称镜头：顺子的眼睛。look / toLook 是平面点就换算成 yawDeg / toYawDeg（俯仰照 pitch / toPitch 写）；
   * 是演员锚 / 飞机锚、或带 h 的点，就原样写进 eye.look / eye.toLook（§14.1，2026-10-21：运行时每次取样重算，视线能跟着飞机走）。
   * free: true = 能转头不能走（§14.1）：眼睛位置钉死，玩家一动鼠标这一段剩下的时间视线归玩家。
   */
  Eye(t, dur, { x, z, stance = "stand", yaw, pitch = 0, toYaw, toPitch, look, toLook, shake, fov, free }) {
    const at = { x: x ?? this.player.x, z: z ?? this.player.z };
    const eye = { x: R(at.x), z: R(at.z), stance };
    const Anchor = p => (p && (p.actor || p.aircraft) ? { ...(p.actor ? { actor: p.actor } : { aircraft: p.aircraft }), offset: (p.offset || [0, 0, 0]).map(R) }
      : p && p.h !== undefined ? { x: R(p.x), z: R(p.z), h: R(p.h) } : null);
    const look0 = Anchor(look), look1 = Anchor(toLook);
    if (look0) eye.look = look0;
    else { eye.yawDeg = R(look ? Yaw(at, look) : yaw); eye.pitchDeg = R(pitch); }
    if (look1) eye.toLook = look1;
    else {
      if (toLook) eye.toYawDeg = Yaw(at, toLook);
      else if (toYaw !== undefined) eye.toYawDeg = R(toYaw);
      if (toPitch !== undefined) eye.toPitchDeg = R(toPitch);
    }
    if (free) eye.free = true;
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
/** 堂屋枪眼（机枪从这里打；第六版起没有北窗了，名字沿用 WINDOW 给 06 / 07 的旧段落） */
const WINDOW = Pt(PL.northWindow.x, PL.northWindow.z);
const LOOPHOLE = WINDOW;
const MG_AT = Pt(G.mgPost.x, G.mgPost.z);
const MG_LOADER_AT = Pt(G.mgLoaderPost.x, G.mgLoaderPost.z);
const CELLAR = Pt(PL.cellar.x, PL.cellar.z);
const MILL = Pt(PL.mill.x, PL.mill.z);
const ROLLER = Pt(PL.roller.x, PL.roller.z);
const EAST_END = Pt(PL.eastEnd.x, PL.eastEnd.z);
const JOG1 = Pt(ST.eastJog1.c, ST.east.c);
const MORTAR = Pt(ES.mortarHide.x, ES.mortarHide.z);
const STRAW = Pt(ES.strawStack.x, ES.strawStack.z);
const SHRINE = Pt(ES.shrine.x, ES.shrine.z);
const MG_HIDE = Pt(ES.mgHide.x, ES.mgHide.z);
const KITCHEN_DOOR = Pt(PL.kitchenDoor.x, PL.kitchenDoor.z);
const KITCHEN_OUT = Pt(G.yard.kitchenDoorOut.x, G.yard.kitchenDoorOut.z);
const TANGWU_DOOR = Pt(PL.tangwuDoor.x, PL.tangwuDoor.z);
const TANGWU_OUT = Pt(G.yard.tangwuDoorOut.x, G.yard.tangwuDoorOut.z);
const GENG_GATE = Pt(PL.gengGate.x, PL.gengGate.z);
const GATE_IN = Pt(G.yard.gateIn.x, G.yard.gateIn.z), GATE_OUT = Pt(ST.southLane1.c, G.gate.z);
const SIDE_GATE = Pt(PL.sideGate.x, PL.sideGate.z), SIDE_IN = Pt(G.yard.sideDoorIn.x, G.yard.sideDoorIn.z), SIDE_OUT = Pt(BJ.sideDoorOut.x, BJ.sideDoorOut.z);
const DOG_HOLE = Pt(PL.dogHole.x, PL.dogHole.z);
const ALLEY_MOUTH = Pt(PL.alleyMouth.x, PL.alleyMouth.z);
const CART_WRECK = Pt(PL.cart.x, PL.cart.z);
const POCKET_GATE = Pt(ES.northChain.pocketGate.x, ES.northChain.pocketGate.z);
const JF_GATE = Pt(JF.gate.x, JF.gate.z), JF_WINDOW = Pt(JF.westWing.box.maxX, JF.westWing.window.z), JF_WING_DOOR = Pt(JF.westWing.box.maxX, JF.westWing.door.z);
const JF_VAT = Pt(JF.westWing.vat.x, JF.westWing.vat.z), JF_BEIWU_DOOR = Pt(JF.beiwu.door.x, JF.beiwu.box.maxZ);
const WALL_X = G.sharedWall.x, WALL_T = 0.5;
const PB = Object.fromEntries(ES.probes.map(p => [p.id, Pt(p.x, p.z)]));
const LANE_X = ST.southLane1.c, LANE3_X = ST.southLane3.c, EXIT = Pt(SLN.exit.x, SLN.exit.z);
const CLIMB_FROM = Pt(SLN.climb.from.x, SLN.climb.from.z), CLIMB_TO = Pt(SLN.climb.to.x, SLN.climb.to.z), PILE = Pt(SLN.climb.pile.x, SLN.climb.pile.z);
const DY_IN = Pt(SLN.detourYard.inside.x, SLN.detourYard.inside.z), DY_GATE_OUT = Pt(SLN.detourYard.gateOut.x, SLN.detourYard.gateOut.z);
export const SLIT_FOV = 40;
/**
 * 爬出窖的根离坑心多远（VilHandsUpClimbOut，清单 stage cellarPit：根在坑口沿外 wallBehindM 0.10 m）：
 * 白盒的坑在 0.5 m 网格里坑口沿在坑心外 1.0 m（Data_…Space cellar 注），所以是 1.0 + 0.10。
 */
export const CELLAR_RIM_M = R(JF.cellar.floorW / 2 + 0.2 + (VILLAGE_STAGES.cellarPit?.wallBehindM ?? 0.1));
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
/**
 * 东北进庄的道上弯着腰往庄子走的鬼子（第五版 10-21）：从关键帧位置顺着道慢慢往庄子挪（弯着腰、停停走走，alongM 米 / 整段）。
 * 从街口趴着看，道中线 x ≥ 274 那一截才看得见（空间负责人实测），所以走得慢、不走出那一截。
 */
function RoadWalk(s, ids, t0, t1, { alongM = 14, lat = 0.5 } = {}) {
  ids.forEach((id, k) => {
    const cur = s.pos.get(id);
    if (!cur) return;
    const sign = k % 2 ? -1 : 1;
    const dx = alongM * 0.36;   // 道的走向：每沿道 1 m，x 约少 0.36
    const mid = RoadPointAtX(cur.x - dx * 0.5, sign * lat), end = RoadPointAtX(cur.x - dx, sign * lat);
    s.Go(id, t0 + k * 0.4, t1 - k * 0.3, end.x, end.z, { move: "walk", path: [mid], stance: "crouch", faceTo: RoadPointAtX(cur.x - dx - 8, 0) });
  });
}
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
  return { tEnd, legs, eyeAtZ, end: Pt(P1.x, P1.z), eyeH, lookAt };
}
/**
 * 边走边说里回头瞅一眼后头的刘文财（10-21：他走在顺子和幺娃后头两步、一声不吭 —— 他听见了「路费」那段，08-5 才会吼「往哪跑」）：
 * 在第 i 段走完的停顿里插一条看他的镜头，再插一条回到车尾的妮儿（镜头轨空档沿用上一条，不插回去就一直看着他）。
 */
function GlanceBack(s, walk, i, offsetS, dur, caption) {
  const L = walk.legs[i], next = walk.legs[i + 1];
  const t0 = R(L.t1 + offsetS), t1 = R(Math.min(t0 + dur, (next ? next.t0 : t0 + dur + 0.5) - 0.1));
  const at = i === walk.legs.length - 1 ? walk.end : walk.eyeAtZ(L.z1);
  s.Cam(t0, t1 - t0, { from: { ...at, h: walk.eyeH }, look: { actor: "LiuWencai", offset: [0, 1.1, 0] }, fov: 58 });
  s.Cam(t1, R((next ? next.t0 : t1 + 0.5) - t1), { from: { ...at, h: walk.eyeH }, look: walk.lookAt, fov: 58 });
  if (caption) s.Caption(t0 + 0.1, dur + 0.6, caption);
  return t0;
}

function S0701(ctx) {
  const s = new Seq(ctx, "07-1", "队尾：边走边数铜板");
  const ids = ["GengCart", "Geng", "Nier", ...SQUAD];
  // 停停走走地往前挤：对白约 56 s，45 m 路分 8 段走
  const walk = CrowdWalk(s, ctx, "07-1", "07-2", { t0: 3.0, legM: 5.6, pauseS: 4.4 });
  const { tEnd } = walk;
  // 「你龟儿要跑？」说过以后，顺子回头瞅了一眼：刘文财在后头两步，低着头走，一声不吭（他听见了）
  GlanceBack(s, walk, 3, 0.6, 1.6, "（顺子回头瞅了一眼：刘文财在后头两步，低着头走，一声不吭）");
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
  // 幺娃不吭声那一下，顺子回头看了一眼后头两步的刘文财（他低着头，像没听见），再转回车尾
  { const g0 = R(s.End("CopperCoins.11") + 0.5), g1 = R(g0 + 1.3);
    s.Cam(g0, g1 - g0, { from: { x: P.x, z: P.z, h: 1.55 }, look: { actor: "LiuWencai", offset: [0, 1.1, 0] }, fov: 58 });
    s.Cam(g1, R(rant + 4.0 - g1), { from: { x: P.x, z: P.z, h: 1.55 }, look: lookNier, fov: 58 }); }
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
  const s = new Seq(ctx, "07-4", "飞机过头顶（能转头不能走），出洼地望见耿家庄");
  const K = id => KU(ctx, "07-4", id), K8 = id => KU(ctx, "08-1", id);
  const laneFolk = Object.keys(Object.fromEntries((ctx.config.keyframes.find(k => k.id === "07-4").units).filter(u => /^(Walker|Helper)\d+$/.test(u.id)).map(u => [u.id, 1])));
  // —— 飞机（2026-10-21 用户改）：三架九七式轻爆（Ki-30，和 13 扫射的是同一种）排成人字，离地约 400 m 由北往南飞过凹路，看方向是去炸县城；
  //    不俯冲、不开枪（没有 diveT / strafe），约 85 m/s，领机 4.6 s 过凹路上空。路过时看见了凹路里的人：右后那架在头顶上
  //    往外偏一下再回来（航线拐个小弯，运行时按转弯给坡度 = 斜了斜翅膀）。13 那两架低空扫射的是它们炸完回去、再一次出动来的。
  //    引擎声（planeDrone）跟着各自的机身走，高处听着是一片沉闷的嗡嗡。
  const PLANE = "Ki30Lead", WING_L = "Ki30Left", WING_R = "Ki30Right";
  const HIGH = 400, OVER = 4.6, Z_OVER = 336, V = 85;
  const Zt = (t, dz = 0) => R(Z_OVER + dz + V * (t - OVER));
  s.Aircraft(PLANE, {
    model: "MitsubishiKi30",
    path: [{ t: 0, x: 98, h: HIGH, z: Zt(0) }, { t: OVER, x: 98, h: HIGH, z: Zt(OVER) }, { t: 11, x: 100, h: HIGH + 5, z: Zt(11) }],
    sound: { drone: true },
  });
  s.Aircraft(WING_L, {
    model: "MitsubishiKi30",
    path: [{ t: 0, x: 53, h: HIGH + 10, z: Zt(0, -35) }, { t: OVER, x: 53, h: HIGH + 10, z: Zt(OVER, -35) }, { t: 11, x: 55, h: HIGH + 15, z: Zt(11, -35) }],
    sound: { drone: true },
  });
  s.Aircraft(WING_R, {
    model: "MitsubishiKi30",
    path: [
      { t: 0, x: 143, h: HIGH - 5, z: Zt(0, -35) }, { t: 3.8, x: 143, h: HIGH - 5, z: Zt(3.8, -35) },
      { t: 5.4, x: 156, h: HIGH - 5, z: Zt(5.4, -35) }, { t: 7.0, x: 143, h: HIGH - 5, z: Zt(7.0, -35) }, { t: 11, x: 145, h: HIGH, z: Zt(11, -35) },
    ],
    sound: { drone: true },
  });
  // —— 全程第一人称（2026-10-21 用户：不要第三人称机位）。
  //    ① 0–2.6 s 蹲着跟班长的后背顺凹路往前跑一段（开场全班先摆到比关键帧位置北边 7 m 处，跑到关键帧位置再贴坎）；
  //    ② 排长「飞机！贴到坎！」，所有人贴坎缩下；顺子半蹲在东坎根（关键帧 07-4 的玩家位置）—— 2.6–12.6 s 这 10 s 是能转头不能走的眼睛
  //      （eye.free，几条紧挨着、同位置的 free 眼睛算一段）：默认视线先看路上的人和车尾的妮儿，再抬头跟着领机，
  //      三架排成人字过头顶，右后那架斜翅膀，再落回坎底的人；
  //    ③ 班长「起来！走！」，接着蹲姿跑；凹路越走越浅，末段班长先直起腰、顺子跟着直起来（眼高 1.62：凹路里蹲着看不见麦地那头，
  //      空间负责人实测），麦地那头是耿家庄（冒烟、响枪），左前方（东北）那条道上几个鬼子往庄子东头钻（默认视线扫过去）；
  //    ④ 到村口路沟，班长回头压手「趴倒！」，眼睛落到 08-1 的趴姿位置。
  const P74 = KP(ctx, "07-4");                                   // 顺子半蹲贴东坎根的位置（关键帧）
  const DUCK = { clip: VIL.duck, clipHold: true, stance: "prone" };
  const LOOK_LUO = { actor: "Luo", offset: [0, 1.0, 0] };
  // ① 开场：大家在比关键帧位置北边 7 m 处蹲着（07-3 的样子），跟着班长往前跑到关键帧位置
  const AHEAD = 7.0;
  const squadStart = new Map();
  for (const id of ["LiuWencai", "Yaowa", "HeYoutian", "Squad1", "Squad2", "Squad3"]) {
    const to = UP(K(id)), from = LZ(to.z - AHEAD, LaneLat(to));
    squadStart.set(id, from);
    s.Place(id, 0, from.x, from.z, { stance: "crouch", yawDeg: 180 });
    s.Go(id, 0.2, 2.4, to.x, to.z, { move: "run", stance: "crouch", yawDeg: 180 });
  }
  { const luoTo = UP(K("Luo")), from = LZ(luoTo.z - AHEAD - 1.0, 0.3); s.Place("Luo", 0, from.x, from.z, { stance: "crouch", yawDeg: 180 }); s.Go("Luo", 0.1, 2.2, luoTo.x, luoTo.z, { move: "run", stance: "crouch", yawDeg: 180 }); }
  { const to = UP(K("Officer")), from = LZ(to.z - AHEAD, -0.3); s.Place("Officer", 0, from.x, from.z, { stance: "crouch", yawDeg: 180 }); s.Go("Officer", 0.3, 2.3, to.x, to.z, { move: "run", stance: "crouch", faceTo: Pt(to.x, to.z - 40) }); }
  const eye0 = LZ(P74.z - AHEAD, LaneLat(P74));
  s.Creep(0, 2.5, eye0, Pt(P74.x, P74.z), LOOK_LUO, { h: 1.05, ease: "linear", fov: 58 });
  s.Caption(0.3, 2.2, "（蹲着跟在班长后背后头顺凹路往前跑。北边传来一阵沉闷的飞机声）");
  // ② 排长先听见，冲全路的人吼；全路的人错峰扑倒（VilDuckProne：跪、趴、抱头，末帧停住）
  const warn = s.Say("PlaneDuck.01", "Officer", 1.5);
  s.Key("Officer", warn - 0.2, { talking: true });
  s.Key("Officer", 2.5, { talking: false, ...DUCK });
  s.Key("Luo", 2.4, DUCK);
  ["LiuWencai", "Yaowa", "HeYoutian", "Squad1", "Squad2", "Squad3"].forEach((id, k) => s.Key(id, 2.65 + k * 0.25, DUCK));
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
  const NIER_OFF = 5.6, NIER_DUCK = 6.0;
  const nierOff = Pt(cartAt.x, cartAt.z - CART_TAIL_Z - 0.5);
  s.Key("Nier", NIER_OFF, { ride: null, x: nierOff.x, z: nierOff.z, move: "cut", yawDeg: 0, stance: "stand", clip: null });
  s.Key("Nier", NIER_DUCK, DUCK);
  // 能转头不能走的 10 s（2.6–12.6）：顺子半蹲在东坎根不动，默认视线分四条写（同位置同姿态 → 运行时算一段，玩家转头不被夺回）
  const FREE0 = 2.6, FREE1 = 12.6;
  const free = { stance: "crouch", x: P74.x, z: P74.z, free: true };
  s.Eye(FREE0, 1.6, { ...free, look: { actor: "Nier", offset: [0, 0.5, 0] }, toLook: { aircraft: PLANE }, fov: 64 });          // 先看车尾的妮儿和缩下去的人，再抬头找飞机
  s.Eye(FREE0 + 1.6, 3.4, { ...free, look: { aircraft: PLANE }, toLook: { aircraft: WING_R }, fov: 70 });                       // 跟着领机过头顶，视线滑到右后那架（它在斜翅膀）
  s.Eye(FREE0 + 5.0, 2.6, { ...free, look: { aircraft: WING_R }, toLook: { x: nierOff.x, z: nierOff.z, h: 0.4 }, fov: 64 });     // 它飞远了，落回车边趴着的妮儿
  s.Eye(FREE0 + 7.6, FREE1 - FREE0 - 7.6, { ...free, look: { x: nierOff.x, z: nierOff.z, h: 0.4 }, toLook: LOOK_LUO, fov: 58 });  // 再看坎底的班长（他要起来了）
  s.Caption(FREE0 + 0.2, 2.4, "（贴在东坎根半蹲下来。能转头看四周，不能走）");
  s.Caption(FREE0 + 2.6, 3.2, "（三架日军飞机排成个人字，高高地从北边过来，往南去，看方向是县城。路上的人全缩在坎底，老耿拽着驴往坎边靠）");
  s.Caption(FREE0 + 5.8, 2.4, "（妮儿是看见别人都趴下了才抬头，这时飞机已经在头顶。她从车尾滑下来，最后一个趴下）");
  s.Caption(FREE0 + 8.3, 2.6, "（飞机没下来，右后那架在头顶上斜了斜翅膀，往南飞远了）");
  // ③ 班长「起来！走！」：第一个爬起来招手，全班跟着起身，蹲着顺凹路往前跑
  const up = s.Say("LuoDriveOn.01", "Luo", FREE1 - 2.2);
  s.Key("Luo", up - 0.2, { clip: null, stance: "stand", faceTo: "player" });
  s.Key("Luo", up + 0.1, { clip: BECKON });
  s.Key("Luo", FREE1 - 0.2, { clip: null, stance: "crouch", yawDeg: 180 });
  ["LiuWencai", "Yaowa", "HeYoutian", "Squad1", "Squad2", "Squad3", "Officer"].forEach((id, k) => s.Key(id, up + 0.6 + k * 0.2, { clip: null, stance: "crouch" }));
  laneFolk.forEach((id, k) => s.Key(id, up + 1.0 + (k % 5) * 0.3, { clip: null, stance: "crouch" }));
  s.Key("Medic", up + 0.8, { clip: null, stance: "crouch" });
  const RUN0 = FREE1, RUN1 = FREE1 + 7.2, STAND = RUN1, RUN2 = STAND + 4.8;
  const runTo = (id, to, t0, t1, extra = {}) => { const r = Route(s.pos.get(id), to); s.Go(id, t0, t1, r.end.x, r.end.z, { move: "run", path: r.path, depart: { stance: "crouch", clip: null }, stance: "crouch", ...extra }); };
  runTo("Luo", LZ(357, 0.3), RUN0, RUN0 + 6.6); runTo("Officer", LZ(356, -0.6), RUN0 + 0.3, RUN0 + 6.9);
  ["LiuWencai", "Yaowa", "HeYoutian", "Squad1", "Squad2", "Squad3"].forEach((id, k) => runTo(id, LZ(351 - k * 1.6, k % 2 ? 0.5 : -0.5), RUN0 + 0.6 + k * 0.2, RUN0 + 7.0 + k * 0.2));
  s.Caption(RUN0 + 0.4, 3.0, "（全班弯腰顺着凹路往前跑，老耿赶着车跟在后头。凹路越走越浅，土坎只剩齐腰高）");
  const eye1 = LZ(354, 0.6);
  s.Creep(RUN0, RUN1 - RUN0, Pt(P74.x, P74.z), eye1, LOOK_LUO, { h: 1.05, ease: "linear", fov: 58 });
  s.Go("GengCart", RUN0 + 1.6, RUN1 + 0.6, LZ(345, 0.3).x, LZ(345, 0.3).z, { move: "walk", speed: 1.6 });
  s.Go("Geng", RUN0 + 1.6, RUN1 + 0.6, LZ(347, -1.3).x, LZ(347, -1.3).z, { move: "walk", depart: { stance: "stand", clip: null } });
  s.Go("Nier", RUN0 + 2.0, RUN1 + 0.8, LZ(343.5, 0.8).x, LZ(343.5, 0.8).z, { move: "walk", depart: { stance: "stand", clip: null } });
  // 末段：班长先直起腰往前看，顺子跟着直起来（眼高 1.62）：麦地那头就是耿家庄，几处房顶冒烟、响枪；左前方东北那条道上几个鬼子往庄子东头钻
  s.Key("Luo", STAND - 0.6, { stance: "stand" });
  s.Caption(STAND - 0.4, 2.6, "（凹路浅了。班长直起腰往前看，顺子跟着直起来）");
  const eye2 = LZ(369, 0.6);
  const ROAD_LOOK = RoadPointAtX(283, 0);
  s.Cam(STAND, RUN2 - STAND, { from: { ...eye1, h: 1.62 }, to: { ...eye2, h: 1.62 }, look: { x: 100, z: 468, h: 2.6 }, lookTo: { x: ROAD_LOOK.x, z: ROAD_LOOK.z, h: 1.0 }, ease: "linear", fov: 60 });
  for (const [x, z] of [[100, 474], [160, 450], [70, 452]]) s.Ev(0, "smoke", { x, z, kind: "SmokeBlack", dur: RUN2 + 6 });
  s.Caption(STAND + 0.3, 3.0, "（麦地那头就是耿家庄：一片土坯院墙和树，几处房顶冒着烟，庄子里一阵一阵响枪）");
  s.Caption(STAND + 3.3, 2.6, "（左前方东北那条道上，几个鬼子弯着腰往庄子东头钻：就是占了老耿家那伙的尾巴）");
  WindowBurst(s, STAND + 0.8, { volume: 0.55, muzzle: false });
  s.Sfx(STAND + 2.6, "rifleShot", { x: 100, z: 430, volume: 0.5 });
  s.Sfx(STAND + 3.8, "rifleShot", { x: 150, z: 465, volume: 0.4 });
  WindowBurst(s, STAND + 4.6, { volume: 0.6, muzzle: false });
  // 东北道上的四个鬼子整段都在弯着腰往庄子走（从关键帧位置顺道挪 14 m，别走出从街口看得见的那一截 x ≥ 274）
  RoadWalk(s, ["RoadIja1", "RoadIja2", "RoadIja3", "RoadIja4"], 0.5, RUN2 + 4.0, { alongM: 12 });
  // ④ 全班继续顺凹路跑到村口路沟（08-1 的位置）；班长先到，回头朝后头压手「趴倒！」；车、老耿、妮儿只跟到凹路尽头
  const luoTo = K8("Luo");
  runTo("Luo", luoTo, STAND + 0.4, RUN2 - 0.6, { yawDeg: luoTo.yawDeg, depart: { stance: "stand", clip: null }, stance: "stand" });
  for (const id of [...SQUAD.filter(id => id !== "Luo"), "Officer"]) { const to = K8(id); runTo(id, to, STAND + 1.0, RUN2 + 2.4, { yawDeg: to.yawDeg, ...(to.aim ? { aim: true } : {}), stance: to.stance || "crouch" }); }
  // 卫生兵从队头（z 324）一路跑到沟东半截的担架边，路远，班长一喊就起跑
  { const to = K8("Medic"); runTo("Medic", to, RUN0 + 0.8, RUN2 + 2.4, { yawDeg: to.yawDeg, stance: to.stance || "crouch" }); }
  // 车、老耿、妮儿跟在后头走到凹路尽头（then 跳到 08-1 时直接到沟东半截的位置）
  { const to = LZ(367, 0.3); s.Go("GengCart", RUN1 + 0.7, RUN2 + 3.6, to.x, to.z, { move: "walk" }); }
  { const to = LZ(369.5, -1.3); s.Go("Geng", RUN1 + 0.7, RUN2 + 3.6, to.x, to.z, { move: "walk" }); }
  { const to = LZ(365, 0.8); s.Go("Nier", RUN1 + 0.9, RUN2 + 3.8, to.x, to.z, { move: "walk", stance: "crouch" }); }
  s.Key("Luo", RUN2 - 0.5, { faceTo: "player", clip: "PvStandHaltL" });
  const down = s.Say("LuoDriveOn.02", "Luo", RUN2 - 0.2);
  s.Caption(down + 0.2, 2.4, "（班长先到村口路沟，回头朝后头压手）");
  s.Key("Luo", s.End("LuoDriveOn.02") + 0.6, { clip: null, stance: "crouch", faceTo: WINDOW });
  s.Cam(RUN2, 1.6, { from: { ...eye2, h: 1.62 }, look: { actor: "Luo", offset: [0, 1.2, 0] }, fov: 58 });
  // 顺子跑进路沟、爬上街口坡道趴下：眼睛从站姿一路压到趴姿，落到 08-1 的位置
  const P8 = KP(ctx, "08-1");
  const T8 = RUN2 + 1.6;
  s.Cam(T8, 2.0, { from: { ...LZ(371, 0.6), h: 1.5 }, to: { x: P8.x, z: P8.z, h: 0.45 }, look: { actor: "Luo", offset: [0, 0.9, 0] }, lookTo: { x: WINDOW.x, z: WINDOW.z, h: 1.4 }, ease: "inOut", fov: 58 });
  s.Eye(T8 + 2.0, 2.4, { stance: "prone", x: P8.x, z: P8.z, yaw: 180, pitch: -1 });
  s.Caption(T8 + 2.2, 2.2, "（趴在村口外的路沟沿后头，顺着主街看过去。接 08）");
  void NIER_DUCK; void squadStart;
  return s.Done({ durationS: T8 + 4.6 });
}

// ---------------------------------------------------------------------------
// 08 村口

function S0801(ctx) {
  const s = new Seq(ctx, "08-1", "村口：枪眼里的机枪顺着街扫，活下来的走岔路");
  const K = id => KU(ctx, "08-1", id);
  // 五个村民（第五版 10-21，用户：笔直的主街对着机枪不可能跑掉，活下来的走岔路）：
  //   Villager2 / 3 从主街东边 z 432.5 那道院门冲上主街往北跑，被堂屋枪眼里的机枪打倒；Villager1 从夹道东边那院朝夹道的门出来，顺夹道跑到巷子口，
  //   滚进沟西头倒在顺子脚边；Villager4 / 5 从路沟后门出来，直接下到沟东半截缩进后送队。起点都照关键帧的来路（path[0]）。
  const Start = id => K(id).path[0];
  const RUN = 2.9;   // VilPanicRun 的参考速度 2.89 m/s
  const RunAlong = (id, t0, pts, extra = {}) => { const len = RouteLen(s.pos.get(id), pts); const end = pts[pts.length - 1]; return s.Go(id, t0, R(t0 + len / RUN), end.x, end.z, { move: "run", path: pts.slice(0, -1), ...extra }); };
  for (const id of ["Villager1", "Villager2", "Villager3", "Villager4", "Villager5"]) { const p = Start(id); s.Place(id, 0, p.x, p.z, { state: "alive", stance: "stand", yawDeg: K(id).path.length > 1 ? Yaw(p, K(id).path[1]) : 0, clip: VIL.panic }); }
  s.Eye(0, 2.4, { stance: "prone", yaw: 180, pitch: -1 });
  s.Caption(0.3, 2.6, "（趴在沟沿上顺着主街看到尽头：老耿家北屋后墙上一个小洞——枪眼。街东边一道院门里冲出两个村民，往北跑）");
  const Shot2Down = (id, t, yaw) => { s.Key(id, t, { clip: "ShotCollapse", clipHold: true }); s.Key(id, t + 1.4, { state: "down", clip: null, yawDeg: yaw }); };
  const fall3 = UP(K("Villager3")), fall2 = UP(K("Villager2"));
  RunAlong("Villager3", 0.6, [...K("Villager3").path.slice(1), fall3], { yawDeg: 0 });
  const t3 = s.pos.get("Villager3").t;
  WindowBurst(s, t3 - 0.3, { volume: 0.8, puffAt: Off(fall3, -0.8, -1.2) });
  Shot2Down("Villager3", t3, K("Villager3").yawDeg);
  s.Caption(t3 - 0.2, 2.6, "（街尽头那道墙上的枪眼里，鬼子的机枪打出来，出门两步就倒下一个）");
  RunAlong("Villager2", 1.6, [...K("Villager2").path.slice(1), fall2], { yawDeg: 0 });
  const t2 = s.pos.get("Villager2").t;
  WindowBurst(s, t2 - 0.3, { volume: 0.8, puffAt: Off(fall2, 0.9, -1.5) });
  Shot2Down("Villager2", t2, K("Villager2").yawDeg);
  s.Caption(t2 - 0.2, 2.6, "（另一个跑到半街，也倒了。笔直的街正对着枪眼，跑不掉）");
  for (const [id, t0] of [["Villager4", 3.4], ["Villager5", 4.2]]) {
    const to = UP(K(id));
    RunAlong(id, t0, [...K(id).path.slice(1), to], { yawDeg: K(id).yawDeg });
    s.Key(id, s.pos.get(id).t, { stance: "crouch", clip: VIL.crouch, yawDeg: K(id).yawDeg });
  }
  const v1 = UP(K("Villager1"));
  RunAlong("Villager1", 0.8, [...K("Villager1").path.slice(1), v1]);
  const t1 = s.pos.get("Villager1").t;
  s.Key("Villager1", t1, { stance: "crouch", faceTo: "player", clip: VIL.crouch });
  s.Caption(t1 - 5.0, 3.0, "（左手边夹道里有脚步声：有人顺着巷子跑过来）");
  s.Caption(t1, 2.4, "（从巷子口滚进路沟，趴在顺子脚边）");
  s.Eye(2.4, 1.0, { stance: "prone", yaw: 180, pitch: -1, toLook: fall3, toPitch: -1 });
  s.Eye(t2 - 0.6, 0.8, { stance: "prone", look: fall3, pitch: -1, toLook: fall2, toPitch: -1 });
  const v4 = UP(K("Villager4"));
  s.Eye(t2 + 1.4, 1.0, { stance: "prone", look: fall2, pitch: -1, toLook: v4, toPitch: -6 });
  s.Caption(t2 + 1.6, 3.0, "（右手边：北边院子朝沟的后门里跑出来的两个，已经溜下沟、缩进后送队里）");
  s.Eye(t2 + 4.4, 1.0, { stance: "prone", look: v4, pitch: -6, toLook: LOOPHOLE, toPitch: -1 });
  WindowBurst(s, t2 + 5.2, { volume: 0.8, puffAt: Pt(100.2, 389) });
  s.Eye(t1 - 2.6, 1.0, { stance: "prone", look: LOOPHOLE, pitch: -1, toLook: Pt(ALLEY_MOUTH.x, ALLEY_MOUTH.z + 1), toPitch: -3 });
  s.Eye(t1 - 0.6, 0.8, { stance: "prone", look: Pt(ALLEY_MOUTH.x, ALLEY_MOUTH.z + 1), pitch: -3, toLook: v1, toPitch: -14 });
  s.Say("VillageMouth.01", "Villager1", t1 + 0.8);
  s.Caption(s.End("VillageMouth.01") + 0.2, 2.4, "（他之后跟着后送队一起走）");
  // 老耿盯着那个枪眼，半天才说出来（第四版只有一句）
  const geng = UP(K("Geng"));
  s.Key("Geng", 0, { faceTo: LOOPHOLE });
  s.Eye(s.End("VillageMouth.01") + 0.8, 1.2, { stance: "prone", look: v1, pitch: -14, toLook: geng, toPitch: -4 });
  const home = s.Say("GengHome.01", "Geng", s.End("VillageMouth.01") + 2.2);
  s.Caption(home + 0.2, 2.6, "（老耿盯着那个枪眼。那是他家）");
  s.Eye(s.End("GengHome.01") + 0.4, 1.2, { stance: "prone", look: geng, pitch: -4, toLook: LOOPHOLE, toPitch: -1 });
  WindowBurst(s, s.End("GengHome.01") + 1.0, { volume: 0.8, puffAt: Pt(99.6, 388) });
  RoadWalk(s, ["RoadIja5", "RoadIja6", "RoadIja7"], 1.0, s.End("GengHome.01") + 3.0, { alongM: 12 });
  return s.Done({ durationS: s.End("GengHome.01") + 3.6 });
}

function S0802(ctx) {
  const s = new Seq(ctx, "08-2", "绕不过去：东边走不得、河汊子、东墙外头那条小胡同、等天黑、打");
  const K = id => KU(ctx, "08-2", id);
  const geng = UP(K("Geng")), officer = UP(K("Officer")), luo = UP(K("Luo")), medic = UP(K("Medic"));
  const ROAD_SEEN = RoadPointAtX(286, 0);
  // 班长先朝东看了一眼（东边是狗日的来的路）：眼睛跟着他看，顺着庄子北沿看得见东北道上远远走着的鬼子；再扭头问老耿西边
  s.Key("Luo", 0, { faceTo: ROAD_SEEN, clip: TALK_CROUCH });
  s.Eye(0, 1.4, { stance: "prone", look: luo, pitch: 4 });
  const east = s.Say("NoWayAsk.01", "Luo", 1.2);
  s.Eye(east + 0.3, 1.4, { stance: "crouch", look: luo, pitch: 4, toLook: { x: ROAD_SEEN.x, z: ROAD_SEEN.z, h: 1.0 } });
  s.Caption(east + 0.6, 3.0, "（顺子撑起半个身子，顺着庄子北沿往东看：东北进庄的那条道上，远远还有两三个鬼子在往庄里走）");
  const ask = s.Say("NoWayAsk.02", "Luo", s.End("NoWayAsk.01") + 1.6);
  s.Key("Luo", ask - 0.3, { faceTo: "Geng" });
  s.Key("Geng", ask + 0.6, { faceTo: "Luo" });
  s.Eye(ask - 0.4, 1.0, { stance: "prone", look: { x: ROAD_SEEN.x, z: ROAD_SEEN.z, h: 1.0 }, toLook: luo, toPitch: 4 });
  s.Eye(ask + 1.4, 1.0, { stance: "prone", look: luo, pitch: 4, toLook: geng, toPitch: 4 });
  // 老耿朝西一指：河汊子，坎陡，水齐腰深
  const west = s.Say("NoWayGeng.01", "Geng");
  s.Key("Geng", west + 0.2, { faceTo: Pt(PL.river.x, 400), clip: POINT_STAND });
  s.Eye(west + 0.6, 1.2, { stance: "prone", look: geng, pitch: 4, toLook: Pt(PL.river.x, 400), toPitch: 1 });
  s.Key("Geng", s.End("NoWayGeng.01") + 0.2, { faceTo: "Luo", clip: null });
  // 卫生兵蹲在担架边给人缠绷带，听见「水齐腰深」头也不抬地顶一句
  s.Key("Medic", 0, { stance: "crouch", faceTo: Pt(medic.x + 1.5, medic.z + 0.4), clip: MEDIC_BANDAGE });
  s.Eye(s.End("NoWayGeng.01") + 0.1, 0.8, { stance: "prone", look: Pt(PL.river.x, 400), pitch: 1, toLook: medic, toPitch: 3 });
  s.Say("NoWayMedic.01", "Medic", s.End("NoWayGeng.01") + 0.6);
  // 往南就一条道，俺家东墙外头那条小胡同，胡同口就挨着俺家 —— 指着主街尽头自家的方向，眼睛回到那个枪眼
  const south = s.Say("NoWayGeng.02", "Geng", s.End("NoWayMedic.01") + 0.6);
  s.Key("Geng", south - 0.2, { faceTo: LOOPHOLE, clip: POINT_STAND });
  s.Eye(south - 0.6, 1.2, { stance: "prone", look: medic, pitch: 3, toLook: { x: LOOPHOLE.x, z: LOOPHOLE.z, h: 1.1 } });
  s.Key("Geng", s.End("NoWayGeng.02") + 0.2, { faceTo: "Luo", clip: null });
  s.Caption(s.End("NoWayGeng.02") + 0.2, 3.2, "（往南只有一条路：老耿家东墙外头那条窄胡同，胡同口就挨着老耿家——挨着那个枪眼。墙根有个狗洞，老耿没想起来：那是小孩走的路）");
  // 排长在后头几步接一句；顺子一下子顶回去；卫生兵头也不抬补一句
  s.Eye(s.End("NoWayGeng.02") + 0.6, 1.0, { stance: "prone", look: LOOPHOLE, pitch: -1, toLook: officer, toPitch: 4 });
  s.Key("Officer", 0, { faceTo: "Luo", clip: TALK_CROUCH });
  s.Say("NoWayOfficer.01", "Officer", s.End("NoWayGeng.02") + 1.6);
  s.Say("DecideShunzi.01", null, s.End("NoWayOfficer.01") + 0.4);
  s.Eye(s.End("NoWayOfficer.01") + 0.2, 0.8, { stance: "prone", look: officer, pitch: 4, toLook: medic, toPitch: 3 });
  s.Say("DecideMedic.01", "Medic", s.End("DecideShunzi.01") + 0.5);
  RoadWalk(s, ["RoadIja5", "RoadIja6", "RoadIja7"], 0.5, 40.0, { alongM: 12 });
  // 班长盯着枪眼啐了一口：打！点名时一个一个指
  s.Eye(s.End("DecideMedic.01") + 0.2, 1.0, { stance: "prone", look: medic, pitch: 3, toLook: luo, toPitch: 4 });
  s.Key("Luo", s.End("DecideMedic.01") + 0.3, { faceTo: LOOPHOLE });
  s.Caption(s.End("DecideMedic.01") + 0.6, 2.4, "（班长盯着枪眼，啐了一口）");
  const order = s.Say("DecideLuo.01", "Luo", s.End("DecideMedic.01") + 2.4);
  s.Key("Luo", order + 1.6, { faceTo: "LiuWencai", clip: POINT_CROUCH });
  s.Key("Luo", order + 2.6, { faceTo: "Yaowa", clip: POINT_CROUCH });
  s.Key("Luo", order + 3.4, { faceTo: "player", clip: POINT_CROUCH });
  s.Key("Luo", order + 7.6, { faceTo: "HeYoutian", clip: POINT_CROUCH });
  s.Key("Luo", order + 8.8, { faceTo: "Escort1", clip: POINT_CROUCH });
  s.Key("Luo", s.End("DecideLuo.01") + 0.4, { faceTo: LOOPHOLE, clip: null });
  s.Key("Yaowa", s.End("DecideLuo.01") + 0.3, { faceTo: LOOPHOLE, aim: true });
  for (const id of ["HeYoutian", "Escort1", "Escort2"]) s.Key(id, s.End("DecideLuo.01") + 0.6, { faceTo: "Luo" });
  s.Eye(s.End("DecideLuo.01") + 0.4, 1.4, { stance: "prone", look: luo, pitch: 4, toLook: LOOPHOLE, toPitch: -1 });
  WindowBurst(s, 3.0, { volume: 0.8, puffAt: Pt(100.4, 388) });
  WindowBurst(s, s.End("NoWayGeng.01") + 0.2, { volume: 0.8, puffAt: Pt(100.8, 388.6) });
  WindowBurst(s, s.End("NoWayOfficer.01") + 1.0, { volume: 0.8, puffAt: Pt(99.2, 387) });
  void geng;
  return s.Done({ durationS: s.End("DecideLuo.01") + 2.6 });
}

function S0803(ctx) {
  const s = new Seq(ctx, "08-3", "压枪眼：枪眼一梭打沟沿；班长四人蹲在街口等着");
  const K = id => KU(ctx, "08-3", id);
  const P = KP(ctx, "08-3");
  const RIM = Pt(P.x + 0.8, P.z + 1.2);           // 机枪打沟沿时土溅在顺子旁边
  // 班长、何有田、两个兵从沟底街口西边挪到坡道脚下蹲着（关键帧 08-3 的位置），不往前
  for (const id of ["Luo", "HeYoutian", "Escort1", "Escort2"]) { const u = KU(ctx, "08-2", id); s.Place(id, 0, u.x, u.z, { stance: "crouch", yawDeg: 180 }); s.Go(id, 0.6, 2.4, K(id).x, K(id).z, { move: "run", stance: "crouch", yawDeg: K(id).yawDeg }); }
  s.Eye(0, 40, { stance: "prone", yaw: 180, pitch: -1, shake: 0.05 });
  s.Caption(0.3, 3.0, "（趴在沟沿上朝枪眼打。班长带何有田和后送队的两个兵蹲在坡道脚下等着：枪眼压住了他们才往前摸）");
  // 玩家打一阵、停一下（换弹）：这边一打，枪眼就回一梭打沟沿；一停火，机枪就去找街上别的目标
  const fire = [[0.8, 3], [5.6, 3], [12.0, 4], [19.4, 3], [27.0, 4], [34.0, 3]];
  for (const [t, n] of fire) {
    Shot(s, t, "player", { count: n, interval: 0.6 }); MouthFire(s, t + 0.4, { who: ["Yaowa", "LiuWencai", "Squad3"] });
    WindowBurst(s, t + 2.2, { volume: 0.9, puffAt: RIM });
  }
  s.Caption(9.0, 3.4, "（换弹——玩家一停火，机枪就掉头往街上扫。这一段教会玩家：这边一打，枪眼就回一梭；没有台词）");
  WindowBurst(s, 10.2, { volume: 0.9, puffAt: Pt(101.4, 404) });
  WindowBurst(s, 24.0, { volume: 0.9, puffAt: Pt(98.6, 398) });
  s.Caption(16.0, 3.2, "（0.5 m 厚的墙上 0.3 m 的洞：机枪只能朝正面打，射界只罩得住主街和这道坡）");
  s.Caption(30.0, 3.0, "（班长四人蹲在坡道脚下没动，等着）");
  return s.Done({ durationS: 40.0 });
}

function S0804(ctx) {
  const s = new Seq(ctx, "08-4", "妮儿跑·班长定计：追进巷子，班长四人摸到大车后头，墙角一个鬼子往东跑");
  const K = id => KU(ctx, "08-4", id), K3 = id => KU(ctx, "08-3", id);
  const P = KP(ctx, "08-4"), P3 = KP(ctx, "08-3");
  const nier0 = UP(K3("Nier")), geng0 = UP(K3("Geng"));
  // 开场：都还是 08-3 的样子——顺子趴在坡道上；妮儿蹲在车尾；老耿站着；班长四人蹲在坡道脚下；幺娃趴着压枪眼
  s.Place("Nier", 0, nier0.x, nier0.z, { stance: "crouch", yawDeg: 135, clip: VIL.crouch });
  s.Place("Geng", 0, geng0.x, geng0.z, { stance: "stand", faceTo: LOOPHOLE });
  const hurt = Pt(104.6, 380.9);
  s.Place("Walker04", 0, hurt.x, hurt.z, { stance: "crouch", state: "alive", yawDeg: 160 });
  s.Place("Yaowa", 0, K3("Yaowa").x, K3("Yaowa").z, { stance: "prone", aim: true, yawDeg: 178 });
  for (const id of ["Luo", "HeYoutian", "Escort1", "Escort2"]) { const u = K3(id); s.Place(id, 0, u.x, u.z, { stance: "crouch", yawDeg: u.yawDeg }); }
  s.Place("CornerIja2", 0, K("CornerIja2").path[0].x, K("CornerIja2").path[0].z, { stance: "crouch", yawDeg: 0 });
  s.Eye(0, 2.0, { stance: "prone", x: P3.x, z: P3.z, yaw: 180, pitch: -1 });
  Shot(s, 0.4, "player", { count: 3, interval: 0.6 });
  // 机枪一梭扫到沟里：妮儿身边那个伤兵中枪，血溅了她一脸
  const sweep = 2.0;
  WindowBurst(s, sweep, { volume: 1.0, count: 8 });
  Puff(s, sweep + 0.3, Pt(101.8, 383.6)); Puff(s, sweep + 0.5, Pt(103.2, 381.8)); Puff(s, sweep + 0.7, Off(hurt, 0.4, 0.3));
  s.Key("Walker04", sweep + 0.75, { clip: "ShotCollapse", clipHold: true });
  s.Key("Walker04", sweep + 2.1, { state: "down", clip: null, yawDeg: 160 });
  s.Sfx(sweep + 0.8, "bodyFall", hurt);
  s.Caption(sweep + 0.6, 3.0, "（机枪扫到沟里：妮儿身边一个伤兵中枪，血溅了她一脸）");
  s.Eye(2.0, 1.0, { stance: "prone", x: P3.x, z: P3.z, yaw: 180, pitch: -1, toLook: hurt, toPitch: 2 });
  // 她爬起来就跑（VilPanicRun）：顺着路沟往西、横穿街口、爬上南沿钻进巷子（她听不见，子弹追着她的脚后跟打在土里）
  const run0 = sweep + 1.6;
  const nierPath = K("Nier").path.slice(1);                 // 关键帧的来路：沟底往西、巷子口、夹道里
  const alleyIn = nierPath[nierPath.length - 1];
  const len = RouteLen(nier0, nierPath);
  const run1 = R(run0 + len / 2.9);
  s.Go("Nier", run0, run1, alleyIn.x, alleyIn.z, { move: "run", path: nierPath.slice(0, -1), depart: { stance: "stand", clip: VIL.panic } });
  // 进了巷子她慢下来往南走（09-1 顺子在十来米处抓住她）
  const nier91 = UP(KU(ctx, "09-1", "Nier"));
  s.Caption(run0 + 0.2, 3.2, "（她爬起来就跑：顺着路沟往西，横穿街口，钻进巷子——那是她回家的路。她听不见枪声）");
  const AtFrac = f => { const want = len * f; let acc = 0, cur = nier0; for (const p of nierPath) { const d = Dist(cur, p); if (acc + d >= want) { const k = (want - acc) / d; return Pt(cur.x + (p.x - cur.x) * k, cur.z + (p.z - cur.z) * k); } acc += d; cur = p; } return alleyIn; };
  WindowBurst(s, run0 + 1.2, { volume: 1.0, count: 8 });
  for (const f of [0.22, 0.3, 0.38, 0.47, 0.55]) { const p = AtFrac(f); Puff(s, run0 + (run1 - run0) * f + 0.2, Off(p, 0.4, 0.6)); }
  s.Caption(run0 + 3.6, 2.6, "（子弹追着她的脚后跟打在土里）");
  s.Eye(run0, 1.2, { stance: "prone", x: P3.x, z: P3.z, look: hurt, pitch: 2, toLook: Pt(99, 381), toPitch: 2 });
  // 眼睛跟着她往西看；老耿爬出沟喊的那几秒扭头看他被拽回去，再看巷子口
  const GENG_RIM = Pt(99.4, 383.6), T_YANK = run0 + 1.0 + 2.4;
  s.Eye(run0 + 1.2, T_YANK - 0.4 - (run0 + 1.2), { stance: "prone", x: P3.x, z: P3.z, look: Pt(99, 381), pitch: 2, toLook: Pt(90, 381.5), toPitch: 1 });
  s.Eye(T_YANK - 0.4, 3.2, { stance: "prone", x: P3.x, z: P3.z, look: Pt(90, 381.5), pitch: 1, toLook: GENG_RIM, toPitch: 4 });
  s.Eye(T_YANK + 2.8, run1 - (T_YANK + 2.8), { stance: "prone", x: P3.x, z: P3.z, look: GENG_RIM, pitch: 4, toLook: ALLEY_MOUTH, toPitch: 0 });
  // 老耿爬出沟去追，趴在沟沿上往巷子口伸手喊（VilReachPinned）；幺娃从后头揪住他腰带一把拽回来（VilNraYankBack，清单 stage yankBack）
  const chase = run0 + 1.0;
  s.Say("NierRuns.01", "Geng", chase);
  const rimW = GENG_RIM, rimYaw = Yaw(rimW, ALLEY_MOUTH);
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
  s.Caption(s.End("NierRuns.03") + 0.2, 2.4, "（顺子趴的地方离巷子口最近。没人下令——他自己爬起来追进去。约 5 秒不能操作）");
  // 顺子爬起来追进巷子：眼睛从坡道下沟、顺沟南沿往西跑、拐进巷子口、再往里几米到交还操作的地方（关键帧 08-4 的玩家位置）
  const go = s.End("NierRuns.03") + 1.2;
  const eyeA = Pt(P3.x, P3.z), eyeB = Pt(97.2, 381.2), eyeC = Pt(84, 380.6), eyeD = Pt(ALLEY_MOUTH.x, ALLEY_MOUTH.z + 1.5), eyeE = Pt(P.x, P.z);
  s.Eye(go - 0.8, 0.8, { stance: "prone", x: P3.x, z: P3.z, look: ALLEY_MOUTH, pitch: 0, toPitch: -2 });
  s.Creep(go, 1.0, eyeA, eyeB, Pt(90, 381), { h: 1.3, lookH: 1.0 });
  s.Creep(go + 1.0, 3.4, eyeB, eyeC, Pt(ALLEY_MOUTH.x, ALLEY_MOUTH.z + 4), { h: 1.4, lookH: 1.0, ease: "linear" });
  s.Creep(go + 4.4, 1.4, eyeC, eyeD, Pt(ST.alleyNorth.c, 396), { h: 1.5, lookH: 1.0 });
  s.Creep(go + 5.8, 1.2, eyeD, eyeE, { actor: "Nier", offset: [0, 0.6, 0] }, { h: 1.1 });
  s.Caption(go + 0.2, 2.6, "（顺子爬起来，猫着腰顺沟南沿往西跑，拐进巷子）");
  // 刘文财吼半句被班长喝断；班长再冲巷子口吼计划
  const yell = s.Say("LiuWhereTo.01", "LiuWencai", go + 1.4);
  s.Key("LiuWencai", yell - 0.3, { aim: false, faceTo: Pt(90, 381) });
  s.Caption(yell + 0.2, 2.8, "（刘文财趴在东边，只看见顺子扔下射位往西钻——他以为顺子要开小差，吼了半句）");
  const shut = s.Say("LuoSendsShunzi.01", "Luo", s.End("LiuWhereTo.01") - 0.3, 0.0);
  s.Key("Luo", shut - 0.3, { faceTo: "LiuWencai", talking: true });
  s.Key("LiuWencai", shut + 0.8, { aim: true, faceTo: LOOPHOLE });
  s.Key("Yaowa", shut + 0.6, { stance: "prone", aim: true, faceTo: LOOPHOLE });
  s.Go("Yaowa", shut + 0.6, shut + 1.8, K3("Yaowa").x, K3("Yaowa").z, { move: "run", stance: "prone", aim: true, yawDeg: 178 });
  const plan = s.Say("LuoSendsShunzi.02", "Luo", s.End("LuoSendsShunzi.01") + 0.5);
  s.Key("Luo", plan - 0.2, { faceTo: ALLEY_MOUTH, clip: POINT_CROUCH });
  s.Key("Luo", s.End("LuoSendsShunzi.02") + 0.3, { talking: false, clip: null, faceTo: Pt(MAIN_X_AT(), 440) });
  s.Caption(plan + 0.3, 3.4, "（班长冲二十米外的巷子口吼：带到她顺巷子摸过去，摸到那狗日的屁股后头！老子在前头给你吸住火！）");
  // 交还操作：顺子在巷子里能转头不能走（eye.free），身后的事只听得见
  const FREE0 = go + 7.0;
  s.Eye(FREE0, 24.0, { stance: "crouch", x: P.x, z: P.z, look: { actor: "Nier", offset: [0, 0.6, 0] }, toYaw: 180, free: true });
  s.Caption(FREE0 + 0.2, 2.6, "（钻进巷子十来米：交还操作。妮儿在前头拐弯处慢下来了）");
  s.Go("Nier", run1 + 0.4, run1 + 3.4, nier91.x, nier91.z, { move: "walk", depart: { clip: null }, stance: "stand", yawDeg: 180 });
  s.Key("Nier", run1 + 3.6, { stance: "crouch", clip: VIL.cower });
  // 身后：班长带三个人贴主街东边门洞往前摸，三段摸到大车后头；枪眼一梭一梭追着他们打；到了大车后头抬不起头
  const legs = [[Pt(102.3, 392.0), plan + 1.0], [Pt(102.3, 408.5), plan + 6.0], [Pt(102.3, 432.5), plan + 13.0], [UP(K("Luo")), plan + 19.0]];
  const mates = { HeYoutian: [0.2, -1.2], Escort1: [0.1, -2.4], Escort2: [0.2, -3.8] };
  let prevT = 0;
  for (const [to, t0] of legs) {
    const dur = R(Dist(s.pos.get("Luo"), to) / 3.2);
    const isLast = to === legs[legs.length - 1][0];
    s.Go("Luo", t0, t0 + dur, to.x, to.z, { move: "run", stance: "crouch", aim: true, faceTo: LOOPHOLE, ...(t0 === legs[0][1] ? { depart: { clip: null } } : {}) });
    for (const [id, [dx, dz]] of Object.entries(mates)) {
      const tgt = isLast ? UP(K(id)) : Off(to, dx, dz);
      s.Go(id, t0 + 0.4, t0 + 0.4 + dur, tgt.x, tgt.z, { move: "run", stance: "crouch", faceTo: LOOPHOLE });
    }
    WindowBurst(s, t0 + dur + 0.6, { volume: 0.5, puffAt: Off(to, -1.6, -1.2) });
    prevT = t0 + dur;
  }
  s.Caption(plan + 2.0, 3.0, "（身后，班长带何有田和两个兵贴着主街东边的门洞一个一个往前摸。隔着一道院墙，巷子里只听得见）");
  const pinned = R(prevT + 1.6); s.Line(pinned, "PinnedAtCart.01", "Luo");   // 用 Line 不用 Say：幺娃的「跑了一个」在它前头，Say 会把后写的句子排到最后一句之后
  s.Caption(pinned + 0.2, 3.0, "（摸到翻倒的大车后头就压住了：一冒头就是一梭子。他在前头给顺子吸住了火）");
  for (const [dt, dx, dz] of [[2.6, -1.2, -1.4], [5.4, 0.6, -1.6], [8.6, -0.4, -1.1]]) WindowBurst(s, prevT + dt, { volume: 0.5, puffAt: Off(CART_WRECK, dx, dz) });
  // 墙角一个鬼子出路口往东跑：先横过主街的口子（幺娃看得见那 1–2 s）再拐进东街；幺娃喊「跑了一个！」
  const rp = K("CornerIja2").path;
  let tr = plan + 9.0;
  for (let i = 1; i < rp.length; i++) { const d = Dist(s.pos.get("CornerIja2"), rp[i]); s.Go("CornerIja2", tr, tr + d / 4.0, rp[i].x, rp[i].z, { move: "run", yawDeg: Yaw(rp[i - 1], rp[i]) }); tr = R(tr + d / 4.0); }
  const seenT = plan + 9.0 + Dist(rp[0], rp[1]) / 4.0;
  s.Line(R(seenT + 0.6), "RunnerEast.01", "Yaowa");
  s.Key("Yaowa", seenT + 0.3, { aim: false, faceTo: rp[2] });
  s.Key("Yaowa", s.End("RunnerEast.01") + 0.4, { aim: true, faceTo: LOOPHOLE });
  s.Caption(seenT + 0.4, 3.0, "（墙角一个鬼子出路口横过街口、往东街跑了：是去喊人的）");
  s.Go("CornerIja2", tr, tr + 6.0, 140, ST.east.c, { move: "run", yawDeg: -90 });
  s.Key("CornerIja2", tr + 6.2, { visible: false });
  MouthFire(s, plan + 4.0, { volume: 0.6, who: ["LiuWencai", "Squad3"] });
  MouthFire(s, plan + 11.0, { volume: 0.6, who: ["Yaowa", "LiuWencai", "Squad3"] });
  s.Caption(s.End("PinnedAtCart.01") + 2.6, 2.4, "（接 09）");
  return s.Done({ durationS: Math.max(s.End("PinnedAtCart.01") + 5.0, tr + 6.4) });
}
/** 主街中线 x（给 08-4 班长吼完回头看街用）。 */
function MAIN_X_AT() { return ST.main.c; }

// ---------------------------------------------------------------------------
// 09 摸进老耿家（拉着手走唯一的那条路；蹲着慢慢挪）

/**
 * 两人拉着手顺着一串停点蹲着挪：妮儿在前头半步（她知道路，拽着他），顺子的眼睛（蹲姿眼高）跟着她。每段挪完停一停；
 * onStop(i, tArrive) 可以在停点插戏并返回更晚的继续时刻。返回停稳的时刻。
 */
function HandInHand(s, t0, stops, { speed = 1.6, pause = 1.4, lead = 0.8, onStop = null, fov, endAt = null } = {}) {
  let t = t0;
  for (let i = 1; i < stops.length; i++) {
    const a = stops[i - 1], b = stops[i];
    const yaw = Yaw(a, b);
    const nierTo = i === stops.length - 1 && endAt ? endAt : Fwd(b, yaw, lead);
    const dur = R(Dist(a, b) / speed);
    s.Go("Nier", R(t - 0.2), R(t - 0.2 + dur), nierTo.x, nierTo.z, { move: "walk", stance: "crouch", yawDeg: yaw, ...(i === 1 ? { depart: { clip: null } } : {}) });
    s.Creep(t, dur, a, b, { actor: "Nier", offset: [0, 0.5, 0] }, { h: 1.05, ease: "linear", ...(fov ? { fov } : {}) });
    t = R(t + dur + pause);
    if (onStop) { const later = onStop(i, R(t - pause)); if (later != null) t = Math.max(t, later); }
  }
  return t;
}

function S0901(ctx) {
  const s = new Seq(ctx, "09-1", "抓住妮儿：她发抖、脸上是血，攥住他的手往里拽");
  const P = KP(ctx, "09-1");
  const nier = UP(KU(ctx, "09-1", "Nier"));
  // 接 08-4 交还操作的地方：顺子在夹道里，妮儿在前头几步蹲着发抖（08-4 末她在拐弯前慢下来了）
  s.Key("Nier", 0, { stance: "crouch", yawDeg: 0, clip: VIL.cower });
  s.Eye(0, 2.4, { stance: "crouch", look: nier, pitch: -10 });
  s.Caption(0.3, 3.0, "（进巷子十来米，追上她：她蹲在墙根发抖，脸上是血——是那个伤兵的）");
  s.Caption(3.6, 3.0, "（顺子抓住她的手。她听不见，回头看见是他才不挣了）");
  s.Key("Nier", 3.4, { faceTo: "player", clip: null });
  // 顺子朝老耿家那边指（东南，隔着几道院墙）；她攥住他的手往里拽：她知道回家的路
  s.Eye(6.0, 1.4, { stance: "crouch", look: nier, pitch: -10, toLook: Pt(100, 478), toPitch: -2 });
  s.Caption(6.4, 2.8, "（顺子朝老耿家那边指——隔着几道院墙，就在东南角）");
  s.Eye(8.6, 1.0, { stance: "crouch", look: Pt(100, 478), pitch: -2, toLook: nier, toPitch: -8 });
  s.Caption(9.6, 3.2, "（她攥住他的手往里拽：她知道回家的路。领着她的时候顺子手上没枪——枪背到背上，两人一路拉着手走）");
  // 街口那边一直在打：班长在大车后头吸着火
  Exchange(s, 2.0, { volume: 0.5 });
  Exchange(s, 10.0, { volume: 0.5 });
  s.Caption(13.0, 2.6, "（街口那边一直在打：班长在大车后头替他吸着火）");
  // 她拽着往南走两步，拐弯
  s.Go("Nier", 12.6, 14.4, ST.alleyNorth.c - 0.6, ST.alleyA2.c - 0.4, { move: "walk", stance: "crouch", yawDeg: 180, depart: { stance: "stand", clip: null } });
  s.Creep(12.8, 1.8, Pt(P.x, P.z), Pt(P.x, 397.2), { actor: "Nier", offset: [0, 0.5, 0] }, { h: 1.05 });
  return s.Done({ durationS: 15.6 });
}

function S0902(ctx) {
  const s = new Seq(ctx, "09-2", "一眼瞥见：街坊家门口，院里有鬼子在吼，地底下有人哭");
  const P = KP(ctx, "09-2");
  const X3 = ST.alleyA3.c, Z2 = ST.alleyA2.c, Z4 = ST.alleyA4.c, X5 = ST.alleyA5.c, L4Z = ST.l4.c;
  // 开场在夹道拐弯处（09-1 末）；拉着手走巷子的四道弯到街坊家西墙外的窄夹道、到 L4
  const start = Pt(ST.alleyNorth.c, 397.2);
  s.Place("Nier", 0, ST.alleyNorth.c - 0.6, Z2 - 0.4, { stance: "crouch", yawDeg: 180 });
  s.Eye(0, 1.0, { stance: "crouch", x: start.x, z: start.z, look: { actor: "Nier", offset: [0, 0.5, 0] } });
  const stops = [start, Pt(X3 + 0.4, Z2), Pt(X3, Z4 - 0.6), Pt(X5 + 0.4, Z4), Pt(X5, 446), Pt(X5, L4Z - 0.6), Pt(P.x, P.z)];
  s.Caption(0.4, 3.0, "（巷子两边都是院墙，又窄又直，拐来拐去；塌下来的墙把岔路都堵死了——只有这一条路）");
  const t = HandInHand(s, 1.0, stops, {
    speed: 1.6, pause: 1.2,
    onStop: (i, tArr) => {
      if (i === 2) { Exchange(s, tArr + 0.2, { volume: 0.5 }); s.Caption(tArr + 0.4, 2.6, "（机枪一响就贴墙停一停，停了再挪）"); return tArr + 2.6; }
      if (i === 4) { Exchange(s, tArr + 0.2, { volume: 0.5 }); return tArr + 2.2; }
      return null;
    },
  });
  // 到了街坊家西南角半掩的院门外：门缝对着院当中的窖口，一眼瞥见
  s.Key("Nier", t, { stance: "crouch", faceTo: "player" });
  s.Eye(t, 4.6, { stance: "crouch", look: CELLAR, pitch: -2, fov: 56 });
  s.Caption(t + 0.2, 3.0, "（街坊家西南角的院门半掩着。拉着手走过门口，门缝里一眼看见院当中的窖口）");
  s.Key("CellarIja1", t, { faceTo: CELLAR, clip: VIL.shout });
  s.Say("CellarShout.01", "CellarIja1", t + 1.2);
  s.Say("CellarShout.02", "CellarIja1");
  s.Sfx(t + 0.4, "cellarSob", { x: CELLAR.x, z: CELLAR.z, volume: 0.7 });
  s.Sfx(s.End("CellarShout.02") + 0.3, "cellarSob", { x: CELLAR.x, z: CELLAR.z, volume: 0.6 });
  s.Key("CellarIja1", s.End("CellarShout.02") + 0.6, { clip: null });
  s.Caption(s.End("CellarShout.02") + 0.2, 2.8, "（一个鬼子拎着手榴弹冲窖口吼「出来！」，地底下有人在哭。不在门口停）");
  // 两人缩回墙根：眼睛退到门西边的墙根下，妮儿拽他往西边窄夹道去
  const back = s.End("CellarShout.02") + 1.6;
  const wall = Pt(64.6, 468.4);
  s.Creep(back, 1.4, Pt(P.x, P.z), wall, Pt(JF_GATE.x, JF_GATE.z - 2), { h: 1.05 });
  s.Go("Nier", back, back + 1.6, 63.6, 468.2, { move: "walk", stance: "crouch", yawDeg: 90 });
  s.Caption(back + 0.3, 2.8, "（两人缩回墙根。妮儿拽着他绕到西边的窄夹道去）");
  return s.Done({ durationS: back + 3.0 });
}

function S0903(ctx) {
  const s = new Seq(ctx, "09-3", "豁口·窗户纸·捂嘴：汉子刚爬出来就被捅倒");
  const K = id => KU(ctx, "09-3", id);
  const P = KP(ctx, "09-3");
  const EYE = Pt(P.x, P.z), NIER = UP(K("Nier"));
  const X5 = ST.alleyA5.c, L4Z = ST.l4.c;
  // 从墙根起：窄夹道往北到西配房塌掉的西北角，钻进黑屋，缩到窗下
  s.Place("Nier", 0, 63.6, 468.2, { stance: "crouch", yawDeg: 90 });
  const start = Pt(64.6, 468.4);
  const breachIn = Pt(65.2, 450.0);   // 豁口（西墙 z 449.25…450.75 没了）的中心
  const stops = [start, Pt(X5 + 0.2, L4Z - 0.5), Pt(X5 + 0.2, 450.0), breachIn, EYE];
  s.Eye(0, 1.0, { stance: "crouch", x: start.x, z: start.z, look: { actor: "Nier", offset: [0, 0.5, 0] } });
  const t = HandInHand(s, 1.0, stops, { speed: 1.6, pause: 1.0, lead: 0.45, endAt: NIER,
    onStop: (i, tArr) => { if (i === 2) { s.Caption(tArr + 0.2, 2.8, "（西配房的西北角挨过炮，塌了：墙上一个豁口，地上一摊瓦砾）"); return tArr + 1.4; } if (i === 3) { s.Caption(tArr + 0.2, 2.4, "（钻进黑屋）"); return tArr + 0.8; } return null; } });
  // 缩到窗下：隔着破窗户纸看院子（视场收窄）
  s.Key("Nier", t, { x: NIER.x, z: NIER.z, move: "cut", stance: "crouch", faceTo: CELLAR, clip: VIL.crouch });
  const WATCH = t + 0.4;
  s.Caption(WATCH + 0.2, 3.0, "（缩到窗下，隔着破窗户纸看院子：窖口就在十米外）");
  // 院里：拎手榴弹的在窖口晃；窖里的人举着手一个个往外爬
  // 爬出窖（VilHandsUpClimbOut，清单 stage cellarPit）：根在坑口沿外 0.10 m 的地上、背对窖口；汉子从东沿爬，媳妇从北沿、老太太从南沿爬
  const RIM_E = Pt(CELLAR.x + CELLAR_RIM_M, CELLAR.z), manYaw = -90;
  const RIM_N = Pt(CELLAR.x - 0.5, CELLAR.z - CELLAR_RIM_M), RIM_S = Pt(CELLAR.x + 0.5, CELLAR.z + CELLAR_RIM_M);
  const manUp = RootEndAt(VIL.climbOut, RIM_E, manYaw);
  const ija2 = StageAnchorFrom("bayonetVictim", "victim", manUp, manYaw);
  s.Place("CellarMan", 0, RIM_E.x, RIM_E.z, { state: "alive", stance: "stand", yawDeg: manYaw, visible: false });
  s.Place("CellarWife", 0, RIM_N.x, RIM_N.z, { state: "alive", stance: "stand", yawDeg: 0, visible: false });
  s.Place("CellarGranny", 0, RIM_S.x, RIM_S.z, { state: "alive", stance: "stand", yawDeg: 180, visible: false });
  s.Place("CellarIja1", 0, 72.6, 458.0, { faceTo: CELLAR, clip: VIL.shout });
  s.Place("CellarIja2", 0, ija2.x, ija2.z, { yawDeg: ija2.yawDeg, aim: true });
  s.Place("CellarIja3", 0, 72.2, 457.4, { faceTo: CELLAR });
  s.Place("CellarIja4", 0, UP(K("CellarIja4")).x, UP(K("CellarIja4")).z, { faceTo: CELLAR });
  s.Sfx(WATCH + 0.6, "cellarSob", { x: CELLAR.x, z: CELLAR.z, volume: 0.7 });
  s.Caption(WATCH + 3.2, 3.2, "（一个鬼子拎着手榴弹在窖口上晃，窖里的人举着手一个个往外爬：汉子、年轻媳妇、抱襁褓的老太太）");
  const climb = WATCH + 3.6;
  s.Key("CellarMan", climb, { visible: true, clip: VIL.climbOut, clipHold: true });
  s.Key("CellarIja1", climb + 1.0, { clip: null });
  const climbed = climb + VilClipS(VIL.climbOut);
  const stab = climbed + 0.4;
  s.Key("CellarMan", stab, { x: manUp.x, z: manUp.z, move: "cut", yawDeg: manYaw, clip: VIL.stabbed, clipHold: true });
  s.Key("CellarIja2", stab, { clip: VIL.thrust });
  s.Sfx(stab + 0.5, "stab", manUp);
  s.Caption(stab + 0.6, 3.0, "（汉子刚爬出来站直，就被刺刀捅倒）");
  s.Key("CellarIja2", stab + VilClipS(VIL.thrust), { clip: null, faceTo: CELLAR });
  // 媳妇从北沿爬，拖人的抓住她的手腕倒退着往北屋拖（dragByArm：媳妇仰面躺在他前方 1.05 m）；进了北屋只听声音
  const wifeClimb = stab + 0.6;
  s.Key("CellarWife", wifeClimb, { visible: true, clip: VIL.climbOut, clipHold: true });
  const wifeUp = RootEndAt(VIL.climbOut, RIM_N, 0);
  const ija3 = StageAnchorFrom("dragByArm", "victim", wifeUp, 0);
  const grab = wifeClimb + VilClipS(VIL.climbOut) + 0.3;
  s.Go("CellarIja3", wifeClimb + 2.0, grab - 0.2, ija3.x, ija3.z, { move: "walk", yawDeg: ija3.yawDeg });
  s.Key("CellarWife", grab, { x: wifeUp.x, z: wifeUp.z, move: "cut", yawDeg: 0, clip: VIL.dragged });
  s.Key("CellarIja3", grab, { clip: VIL.dragArm });
  const DRAG_M = R(ija3.z - (JF_BEIWU_DOOR.z + 2.5)), DRAG_MPS = 0.9, dragT1 = R(grab + 0.4 + DRAG_M / DRAG_MPS);   // 拖到北屋门前（媳妇的根离门 1.45 m），再切进屋里
  s.Go("CellarIja3", grab + 0.4, dragT1, ija3.x, ija3.z - DRAG_M, { move: "drag", yawDeg: ija3.yawDeg });
  s.Go("CellarWife", grab + 0.4, dragT1, wifeUp.x, wifeUp.z - DRAG_M, { move: "drag", yawDeg: 0 });
  s.Caption(grab + 0.6, 3.0, "（媳妇刚爬出来就被抓住手腕，倒退着往北屋拖）");
  s.Place("CellarIja3", dragT1 + 0.4, JF_BEIWU_DOOR.x, JF_BEIWU_DOOR.z - 1.4, { clip: null, yawDeg: 180 });
  s.Place("CellarWife", dragT1 + 0.4, JF_BEIWU_DOOR.x, JF_BEIWU_DOOR.z - 1.8, { clip: null, state: "down", yawDeg: 90 });
  s.Caption(dragT1 + 0.6, 2.6, "（拖进北屋，只听得见声音）");
  s.Sfx(dragT1 + 1.2, "cellarSob", { x: JF_BEIWU_DOOR.x, z: JF_BEIWU_DOOR.z - 2, volume: 0.5 });
  // 老太太抱着襁褓从南沿爬出来，跪在窖沿；石磨上绑着早死的老汉
  const grannyClimb = wifeClimb + VilClipS(VIL.climbOut) - 1.0;
  s.Key("CellarGranny", grannyClimb, { visible: true, clip: VIL.climbOut, clipHold: true });
  const grannyUp = RootEndAt(VIL.climbOut, RIM_S, 180);
  s.Key("CellarGranny", grannyClimb + VilClipS(VIL.climbOut) + 0.2, { x: grannyUp.x, z: grannyUp.z, move: "cut", yawDeg: 180, stance: "crouch", clip: VIL.crouch });
  s.Caption(grannyClimb + 2.0, 3.0, "（抱襁褓的老太太最后一个爬上来，跪在窖沿上。石磨上绑着一个早死了的老汉）");
  // 妮儿认出街坊，呜咽；屏幕弹按键：捂住她的嘴
  s.Key("Nier", stab + 0.8, { clip: VIL.cower });
  const whimper = s.Say("NierWhimperFirst.01", "Nier", stab + 1.6);
  s.Eye(whimper - 0.3, 1.0, { stance: "crouch", look: CELLAR, pitch: -4, toLook: NIER, toPitch: -26, fov: SLIT_FOV + 8 });
  s.Caption(whimper + 0.8, 3.4, "（妮儿认出了街坊，呜咽起来。屏幕弹出按键：捂住她的嘴——第一人称看得见自己的手指，上面露着她瞪大的眼睛）");
  s.Eye(whimper + 3.0, 1.0, { stance: "crouch", look: NIER, pitch: -26, toLook: CELLAR, toPitch: -4, fov: SLIT_FOV + 8 });
  WindowBurst(s, s.End("NierWhimperFirst.01") - 1.0, { volume: 0.7 });
  s.Caption(s.End("NierWhimperFirst.01") + 0.2, 3.0, "（没按到也不判失败：外头正好响了一梭机枪，盖过去了）");
  Exchange(s, WATCH + 1.0, { volume: 0.5 });
  // 看完：院里一个鬼子朝这边走来了（接 09-4）
  const leave = Math.max(grannyClimb + VilClipS(VIL.climbOut) + 1.0, dragT1 + 2.0, s.End("NierWhimperFirst.01") + 1.0);
  s.Caption(leave, 2.4, "（院里一个鬼子朝这边走来了）");
  s.Eye(WATCH, leave + 2.6 - WATCH, { stance: "crouch", look: CELLAR, pitch: -4, fov: SLIT_FOV + 8 });
  return s.Done({ durationS: leave + 2.6 });
}

function S0904(ctx) {
  const s = new Seq(ctx, "09-4", "大缸·哨子：鬼子探进头，街上枪声密了，院里的赶紧了结");
  const K = id => KU(ctx, "09-4", id), K3 = id => KU(ctx, "09-3", id);
  const P = KP(ctx, "09-4"), P3 = KP(ctx, "09-3");
  const EYE3 = Pt(P3.x, P3.z), HIDE = Pt(P.x, P.z), NIER3 = UP(K3("Nier")), NIER4 = UP(K("Nier"));
  const PEEK = UP(K("CellarIja4"));
  const GRANNY = RootEndAt(VIL.climbOut, Pt(CELLAR.x + 0.5, CELLAR.z + CELLAR_RIM_M), 180);
  // 开场：09-3 末的样子——顺子还在窗下，妮儿在旁边；院里翻东西的那个（CellarIja4）朝西配房走来
  s.Signal(0, SIG.cellarBlast, false);
  s.Place("Nier", 0, NIER3.x, NIER3.z, { stance: "crouch", faceTo: CELLAR, clip: VIL.crouch });
  s.Place("CellarIja4", 0, UP(K3("CellarIja4")).x, UP(K3("CellarIja4")).z, { faceTo: JF_WING_DOOR });
  s.Place("CellarIja1", 0, 72.6, 458.0, { faceTo: CELLAR });
  s.Place("CellarIja2", 0, 75.6, 461.6, { faceTo: GRANNY, aim: true });
  s.Place("CellarIja3", 0, JF_BEIWU_DOOR.x, JF_BEIWU_DOOR.z - 1.4, { yawDeg: 180 });
  s.Place("CellarMan", 0, UP(K3("CellarMan")).x, UP(K3("CellarMan")).z, { state: "down", yawDeg: 100 });
  s.Place("CellarWife", 0, JF_BEIWU_DOOR.x, JF_BEIWU_DOOR.z - 1.8, { state: "down", yawDeg: 90 });
  s.Place("CellarGranny", 0, GRANNY.x, GRANNY.z, { state: "alive", stance: "crouch", yawDeg: 180, clip: VIL.crouch });
  s.Spawn("Bundle", { side: "civ", kind: "child", x: 74.6, z: 461.5, yawDeg: 60, state: "down", name: "襁褓（占位）" }, { visible: false });
  s.Eye(0, 1.6, { stance: "crouch", x: EYE3.x, z: EYE3.z, look: CELLAR, pitch: -4, fov: SLIT_FOV + 8, toLook: PEEK, toPitch: -2 });
  s.Caption(0.3, 2.8, "（一个鬼子朝西配房走来翻东西。两人缩到西北角的大缸后头）");
  s.Go("CellarIja4", 0.4, 4.0, JF_WING_DOOR.x + 1.2, JF_WING_DOOR.z, { move: "walk", yawDeg: 90 });
  s.Creep(1.6, 1.8, EYE3, HIDE, JF_WING_DOOR, { h: 1.05 });
  s.Go("Nier", 1.6, 3.2, NIER4.x, NIER4.z, { move: "walk", stance: "crouch", depart: { clip: null }, yawDeg: Yaw(NIER4, JF_WING_DOOR), clip: VIL.cower });
  s.Eye(3.4, 26, { stance: "crouch", x: HIDE.x, z: HIDE.z, look: JF_WING_DOOR, pitch: -2, fov: 50 });
  // 他推门刚探进头：「ん？」—— 正好街上枪声一下子密了（班长在吸火），丁字路口那边吹哨
  s.Go("CellarIja4", 4.2, 5.6, PEEK.x, PEEK.z, { move: "walk", yawDeg: 90 });
  const peek = s.Say("DoorPeek.01", "CellarIja4", 6.2);
  s.Key("CellarIja4", peek - 0.2, { faceTo: JF_VAT });
  s.Caption(peek + 0.2, 2.6, "（他推开门，把头探进黑屋——嗯？）");
  const dense = peek + 0.8;
  for (let k = 0; k < 4; k++) MouthFire(s, dense + k * 1.1, { volume: 0.75, who: ["Yaowa", "LiuWencai", "Squad3"] });
  WindowBurst(s, dense + 0.6, { volume: 0.7, count: 8 }); WindowBurst(s, dense + 2.6, { volume: 0.7, count: 8 });
  s.Sfx(dense + 1.4, "rifleVolley", { x: 108, z: 462, volume: 0.6 });
  s.Caption(dense + 0.4, 3.0, "（街上枪声一下子密了：班长在吸火。丁字路口那边吹哨）");
  // 搜窖那伙的头儿吼：快了结、去路口！院里的赶紧了结
  const hurry = s.Say("CellarHurry.01", "CellarIja1", dense + 2.4);
  s.Key("CellarIja1", hurry - 0.3, { faceTo: GRANNY, clip: VIL.shout });
  s.Key("CellarIja1", s.End("CellarHurry.01") + 0.3, { clip: null });
  // 探头的扭头走了（听见哨子）
  s.Key("CellarIja4", hurry + 1.0, { yawDeg: -90 });
  s.Go("CellarIja4", hurry + 1.4, hurry + 3.4, 69.0, 461.6, { move: "run", path: [Pt(68.9, 455.0)], yawDeg: 180 });
  s.Caption(hurry + 1.2, 2.6, "（探头的扭头走了）");
  // 眼睛回到窗下看院子：孩子在哭；一个鬼子从老太太怀里扯过襁褓，一刺刀扎穿挑起甩在窖沿；老太太往窖里爬；手榴弹磕钢盔扔进窖
  const back = hurry + 3.4;
  s.Creep(back, 1.4, HIDE, EYE3, CELLAR, { h: 1.05 });
  s.Eye(back + 1.4, 16, { stance: "crouch", x: EYE3.x, z: EYE3.z, look: CELLAR, pitch: -4, fov: SLIT_FOV + 8 });
  s.Caption(back + 0.2, 2.4, "（他们走了。再探到窗下看一眼）");
  const STAB_AT = Pt(GRANNY.x, GRANNY.z), STAB_YAW = 90;
  const flingRoot = Pt(STAB_AT.x + 1.1, STAB_AT.z);
  const FLING = back + 2.4, BABY_STAB = FLING + 0.5;
  const cry = R(BABY_STAB - SFX_FILE.babyCry.seconds);
  s.Sfx(cry, "babyCry", { x: GRANNY.x, z: GRANNY.z, volume: 0.8 });
  s.Caption(cry + 0.2, 2.0, "（孩子在哭）");
  s.Go("CellarIja2", FLING - 1.6, FLING - 0.2, flingRoot.x, flingRoot.z, { move: "walk", yawDeg: STAB_YAW, aim: true });
  s.Key("CellarIja2", FLING, { clip: VIL.fling });
  s.Sfx(BABY_STAB, "stab", STAB_AT);
  s.Key("Bundle", FLING + 1.5, { visible: true });
  s.Caption(FLING + 0.6, 3.6, "（一个鬼子从老太太怀里扯过襁褓，一刺刀扎穿，挑起来甩在窖沿上，哭声断了）");
  s.Key("CellarIja2", FLING + VilClipS(VIL.fling), { clip: null, faceTo: CELLAR });
  const PIT = Pt(CELLAR.x, CELLAR.z + 0.2);
  const crawl0 = FLING + 1.8, crawl1 = R(crawl0 + Dist(GRANNY, PIT) / 0.35);
  s.Key("CellarGranny", crawl0, { clip: VIL.kneelCrawl });
  s.Go("CellarGranny", crawl0, crawl1, PIT.x, PIT.z, { move: "walk", yawDeg: Yaw(GRANNY, PIT) });
  s.Caption(crawl0 + 0.4, 3.0, "（老太太往窖里爬。鬼子把手榴弹往钢盔上一磕，扔了进去）");
  const PIT_N = Pt(CELLAR.x - 0.2, CELLAR.z - 1.6);
  s.Go("CellarIja1", crawl0 - 0.4, crawl0 + 0.8, PIT_N.x, PIT_N.z, { move: "walk", yawDeg: 180 });
  const LOB = crawl0 + 1.6;
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
  // 四个人拎枪出院门，顺 L4 往东跑去丁字路口支援（关键帧 09-5 他们在路口墙角）
  const go = blast + 1.6;
  const GATE_IN_J = Pt(JF_GATE.x, JF_GATE.z - 1.3), L4E = Pt(80, ST.l4.c);
  [["CellarIja1", 0], ["CellarIja2", 0.5], ["CellarIja3", 1.0], ["CellarIja4", 1.4]].forEach(([id, dt]) => {
    const cur = s.pos.get(id);
    const r1 = Route(cur, GATE_IN_J);
    const t1 = R(go + dt + RouteLen(cur, [...r1.path, r1.end]) / 3.4);
    s.Go(id, go + dt, t1, r1.end.x, r1.end.z, { move: "run", path: r1.path, depart: { clip: null, aim: false }, yawDeg: 180 });
    s.Go(id, t1, R(t1 + (Dist(GATE_IN_J, Pt(JF_GATE.x, ST.l4.c)) + Dist(Pt(JF_GATE.x, ST.l4.c), L4E)) / 3.4), L4E.x, L4E.z, { move: "run", path: [Pt(JF_GATE.x, ST.l4.c)], yawDeg: -90 });
    s.Key(id, R(t1 + 6.0), { visible: false });
  });
  s.Caption(go + 0.6, 3.2, "（四个人拎枪出院门、顺着门外那条小胡同往东跑：去丁字路口帮着打街上的班长）");
  return s.Done({ durationS: go + 7.0 });
}

function S0905(ctx) {
  const s = new Seq(ctx, "09-5", "狗洞·便门：穿院子、过夹道到本家院，妮儿钻狗洞拔开便门");
  const K = id => KU(ctx, "09-5", id), K4 = id => KU(ctx, "09-4", id);
  const P4 = KP(ctx, "09-4");
  const start = Pt(P4.x, P4.z), NIER4 = UP(K4("Nier"));
  const L4Z = ST.l4.c, PX = ST.passage.c, PEZ = ST.passageEnd.c;
  s.Place("Nier", 0, NIER4.x, NIER4.z, { stance: "crouch", yawDeg: -90 });
  s.Eye(0, 1.0, { stance: "crouch", x: start.x, z: start.z, look: { actor: "Nier", offset: [0, 0.5, 0] } });
  s.Caption(0.3, 3.0, "（穿过院子出院门：妮儿在窖口僵住了，顺子拽着她走）");
  // 西配房的门 → 院子南半（过窖口西边 5 m）→ 半掩的院门 → L4 往西几步 → 南北夹道往南 → 本家院南墙西南角敞着的院门
  // 院门的门扇斜开在门洞西半边，人从东半边（x≈67）过
  const stops = [start, Pt(66.9, 453.4), Pt(67.0, 455.0), Pt(69.3, 455.0), Pt(69.0, 462.0), Pt(68.9, 463.5), Pt(67.0, 464.6), Pt(67.0, L4Z), Pt(74.8, L4Z + 0.15), Pt(74.8, 480), Pt(PX, PEZ - 0.4), Pt(78.3, PEZ - 0.2), Pt(78.3, BJ.gate.z - 1.4), Pt(79.6, 485.4), Pt(84.5, 484.6), SIDE_OUT];
  const t = HandInHand(s, 1.0, stops, { speed: 1.9, pause: 0.6, lead: 0.25,
    onStop: (i, tArr) => {
      if (i === 4) { s.Caption(tArr + 0.1, 2.8, "（路过窖口：她僵住了，站着不动；顺子拽着她走）"); s.Key("Nier", tArr, { faceTo: CELLAR }); return tArr + 2.2; }
      if (i === 7) { Exchange(s, tArr + 0.2, { volume: 0.55 }); s.Caption(tArr + 0.2, 2.6, "（出半掩的院门，L4 往东几步；街口那边还在打）"); return tArr + 1.6; }
      if (i === 10) { s.Caption(tArr + 0.1, 2.6, "（南北夹道的尽头是死胡同；本家院的院门敞着——人跑的时候没顾上关）"); return tArr + 1.0; }
      if (i === 13) { s.Caption(tArr + 0.1, 2.4, "（本家院空了：老耿的本家。东边那道墙就是老耿家的墙）"); return tArr + 0.8; }
      return null;
    } });
  // 便门从老耿家那边闩着；妮儿去钻狗洞：绕过东厢房北头，到共用墙上的狗洞西口（VilCrawlHole，清单 stage dogHole：根在墙西面外 0.25 m、面朝东）
  s.Eye(t, 5.6, { stance: "crouch", x: SIDE_OUT.x, z: SIDE_OUT.z, look: SIDE_GATE, pitch: -4, toLook: { actor: "Nier", offset: [0, 0.5, 0] } });
  s.Caption(t + 0.2, 3.2, "（便门从老耿家那边闩着。妮儿松开手，往北绕过东厢房：墙根有个狗洞，0.45 m 宽、0.4 m 高，她从小就这么钻）");
  const HOLE_W = Pt(WALL_X - WALL_T / 2 - 0.25, DOG_HOLE.z);
  const nierPath = K("Nier").path;   // 关键帧的来路：…本家院里绕到狗洞西口、钻洞、北屋南墙和灶屋北墙之间的夹缝、院子、便门里
  const toHole = s.Walk("Nier", t + 0.6, HOLE_W, { move: "run", speed: 2.2, path: [Pt(86.6, 484.2), Pt(86.6, 476.0), Pt(90.3, 475.8), Pt(91.0, 473.6)], yawDeg: -90, stance: "crouch" });
  const CRAWL = toHole + 0.3;
  s.Key("Nier", CRAWL, { clip: VIL.crawlHole });
  const crawlEnd = RootEndAt(VIL.crawlHole, HOLE_W, -90, CHILD_SCALE);
  const landed = Pt(crawlEnd.x + 0.5, crawlEnd.z + 0.2);
  s.Key("Nier", CRAWL + VilClipS(VIL.crawlHole), { x: landed.x, z: landed.z, move: "cut", clip: null, stance: "crouch", yawDeg: 180 });
  s.Caption(CRAWL + 0.2, 2.8, "（她趴下，手脚并用一头钻进去：大人钻不过）");
  s.Eye(t + 5.6, CRAWL + 3.4 - (t + 5.6), { stance: "crouch", x: SIDE_OUT.x, z: SIDE_OUT.z, look: { actor: "Nier", offset: [0, 0.4, 0] } });
  // 她落在北屋西边那条窄地上，沿北屋南墙和灶屋北墙之间 1 m 的夹缝到院子，再贴墙到便门里头拔门闩（VilUnboltDoor：门板在她前方 0.45×0.62 m）
  const DOOR_IN = Pt(WALL_X + WALL_T / 2 + 0.45 * CHILD_SCALE, SIDE_GATE.z);
  const tail = [Pt(94.0, 475.5), Pt(96.8, 475.5), Pt(97.0, 480.0), Pt(97.0, 483.2), Pt(93.6, 484.6)];   // 夹缝出来贴灶屋东墙往南，绕过灶屋东南角到便门里
  const toDoor = s.Walk("Nier", CRAWL + VilClipS(VIL.crawlHole) + 0.4, DOOR_IN, { move: "run", speed: 2.2, path: tail, yawDeg: 90, stance: "crouch" });
  s.Caption(CRAWL + 3.4, 3.0, "（钻过去了：顺着老耿家北屋南墙和灶屋北墙之间的夹缝到院子里，贴着墙摸到便门里头）");
  s.Eye(CRAWL + 3.4, toDoor + 4.6 - (CRAWL + 3.4), { stance: "crouch", x: SIDE_OUT.x, z: SIDE_OUT.z, look: SIDE_GATE, pitch: -4 });
  const UNBOLT = toDoor + 0.4;
  s.Signal(0, SIG.sideGateOpen, false);
  s.Key("Nier", UNBOLT, { stance: "stand", clip: VIL.unbolt, yawDeg: 90 });
  const open = R(UNBOLT + 1.75);
  s.Signal(open, SIG.sideGateOpen, true);
  s.Sfx(open, "dirtFall", { x: WALL_X, z: SIDE_GATE.z, volume: 0.25 });
  s.Key("Nier", UNBOLT + VilClipS(VIL.unbolt), { clip: null, stance: "crouch", faceTo: "player" });
  s.Caption(UNBOLT + 0.3, 2.6, "（门闩从那边拔开，便门开了一条缝，露出妮儿的脸）");
  Exchange(s, t + 3.0, { volume: 0.55 });
  s.Caption(open + 1.8, 2.2, "（进便门）");
  return s.Done({ durationS: open + 4.4 });
}

function S0906(ctx) {
  const s = new Seq(ctx, "09-6", "屁股对到老子：堂屋门里是机枪组的后背；贴西墙往堂屋门摸");
  const K = id => KU(ctx, "09-6", id);
  const P = KP(ctx, "09-6"), P5 = KP(ctx, "09-5");
  const SIGHT = Pt(P.x, P.z), NIER6 = UP(K("Nier"));
  const DOOR_IN = Pt(WALL_X + WALL_T / 2 + 0.45 * CHILD_SCALE, SIDE_GATE.z);
  // 开场：顺子在便门外、妮儿在门里；进门往院里看：院子空的，堂屋门朝南敞着，门里就是机枪组的后背
  s.Place("Nier", 0, DOOR_IN.x, DOOR_IN.z, { stance: "crouch", yawDeg: 90 });
  s.Eye(0, 1.2, { stance: "crouch", x: P5.x, z: P5.z, look: SIDE_GATE, pitch: -4 });
  s.Creep(1.2, 1.6, Pt(P5.x, P5.z), SIDE_IN, Pt(101, 480), { h: 1.05 });
  s.Go("Nier", 1.0, 2.4, SIDE_IN.x + 0.6, SIDE_IN.z - 0.9, { move: "walk", stance: "crouch", yawDeg: -90 });
  s.Caption(1.4, 3.0, "（进了便门：老耿家后院没人。堂屋门朝南开着，门里头是机枪组的后背，十几步远，正朝着街上打）");
  // 顺着院子南墙根往东挪几步，才看得进门里（门洞 1.2 m 宽，机枪手正对门后 3.5 m）
  s.Creep(3.4, 2.4, SIDE_IN, SIGHT, TANGWU_DOOR, { h: 1.05 });
  s.Go("Nier", 3.6, 5.8, NIER6.x, NIER6.z, { move: "walk", stance: "crouch", yawDeg: -90 });
  s.Eye(5.8, 5.0, { stance: "crouch", look: MG_AT, pitch: -2 });
  WindowBurst(s, 6.2, { volume: 0.85 });
  const butt = s.Say("ButtToMe.01", null, 8.6);
  s.Caption(butt + 0.2, 2.6, "（……狗日的，屁股对到老子）");
  // 带着她贴西墙往堂屋门摸，得先过灶屋门口：机枪响一梭挪一段，一安静就停
  const t0 = s.End("ButtToMe.01") + 1.6;
  s.Caption(t0 - 0.8, 3.0, "（带着她贴西墙往堂屋门摸，得先过灶屋门口。机枪响一梭挪一段，一安静就停）");
  const stops = [SIGHT, Pt(98.3, 482.6), Pt(98.4, 480.8), Pt(98.2, 479.9)];
  const t = CreepLegs(s, t0, stops, i => (i === 3 ? KITCHEN_DOOR : Pt(KITCHEN_DOOR.x, KITCHEN_DOOR.z + 1.2)), {
    volume: 0.75, pause: 2.8, speed: 1.4,
    onStop: (i, mv0, mv1) => {
      const yaw = Yaw(stops[i - 1], stops[i]);
      const n = Fwd(stops[i], yaw, -0.7, -0.5);   // 她在他身后半步、靠墙那边
      s.Go("Nier", mv0 + 0.2, mv1 + 0.2, n.x, n.z, { move: "walk", stance: "crouch", yawDeg: yaw });
      return null;
    },
  });
  s.Eye(t - 2.6, 2.4, { stance: "crouch", x: stops[3].x, z: stops[3].z, look: KITCHEN_DOOR, pitch: -4 });
  s.Caption(t - 2.2, 2.2, "（快到灶屋门口了）");
  return s.Done({ durationS: t });
}

function S0907(ctx) {
  const s = new Seq(ctx, "09-7", "灶屋：罐子掉地，撞进灶屋，刺刀往下压，妮儿咬手腕，拔刀；北屋过来两个，在屋里打");
  const K = id => KU(ctx, "09-7", id), K6 = id => KU(ctx, "09-6", id);
  const START = Pt(98.2, 479.9);
  const NIER0 = Fwd(START, Yaw(Pt(98.4, 480.8), START), -0.7, -0.5);
  // 压刺刀的地方（清单 stage pinBite）：鬼子骑跪在倒地的顺子身上（关键帧 KitchenIja 的位置、面朝东南 −135），顺子的头在他前方 0.55 m（眼睛趴着仰视他）；
  // 妮儿在他右侧 0.54 m、前 0.38 m，面朝他的中线（左转 90°），小孩身体 0.62；她比他晚 1.5 s 起播：她 0.5 s 咬中 = 他 2.0 s 停住段结束
  const PIN = UP(K("KitchenIja")), PIN_YAW = K("KitchenIja").yawDeg;
  const EYE_DOWN = Fwd(PIN, PIN_YAW, 0.55);
  const NIER_MARK = StagePlace("pinBite", "nier", PIN, PIN_YAW);
  const kij = UP(K6("KitchenIja"));
  s.Place("KitchenIja", 0, kij.x, kij.z, { state: "alive", stance: "stand", yawDeg: -90, aim: false });
  s.Place("Nier", 0, NIER0.x, NIER0.z, { stance: "crouch", yawDeg: Yaw(NIER0, KITCHEN_DOOR), clip: VIL.crouch });
  for (const id of ["Rifle2", "Rifle4"]) { const u = KU(ctx, "09-6", id); s.Place(id, 0, u.x, u.z, { stance: "stand", yawDeg: 0, aim: false }); }
  s.Eye(0, 2.0, { stance: "crouch", x: START.x, z: START.z, look: KITCHEN_DOOR, pitch: -4 });
  // 罐子哗啦一声掉在地上（jarShatter 从妮儿脚下放）
  const drop = 1.4;
  s.Sfx(drop, "jarShatter", { x: NIER0.x, z: NIER0.z, volume: 0.8 });
  s.Caption(drop, 2.4, "（妮儿怀里那罐弹壳掉在地上，哗啦一声）");
  s.Eye(drop + 0.2, 0.6, { stance: "crouch", x: START.x, z: START.z, look: KITCHEN_DOOR, pitch: -4, toLook: NIER0, toPitch: -30 });
  // 灶屋里看后院的鬼子嘴里塞着东西扑出来：到门里、肩膀往前一撞（VilIjaShoulderCharge，根往前 1.2 m），把顺子撞进灶屋
  const lunge = drop + 1.2;
  const DOOR_IN = Pt(G.zaowu.box.maxX - 0.7, G.zaowu.door.z);
  s.Key("KitchenIja", lunge - 0.2, { aim: true, faceTo: KITCHEN_DOOR });
  s.Say("KitchenLunge.01", "KitchenIja", lunge);
  s.Go("KitchenIja", lunge, lunge + 0.8, DOOR_IN.x, DOOR_IN.z, { move: "run", yawDeg: -90 });
  const CHARGE = lunge + 0.8;
  s.Key("KitchenIja", CHARGE, { clip: VIL.charge });
  s.Eye(lunge, 1.4, { stance: "crouch", x: START.x, z: START.z, look: NIER0, pitch: -30, toLook: DOOR_IN, toPitch: -2, shake: 0.3 });
  s.Shake(CHARGE + 0.6, 0.6, 0.9);
  s.Caption(CHARGE + 0.5, 2.6, "（把顺子撞进灶屋，翻倒在灶台边）");
  // 切到灶屋里倒地仰视：鬼子骑跪在身上，用上了刺刀的枪往下压（VilIjaPinBayonet：前 2 s 是用力抖的停住段，每 1.9 s 重起一遍；最后一遍放完就是被咬的出口）
  const pin = CHARGE + VilClipS(VIL.charge);
  s.Place("KitchenIja", pin, PIN.x, PIN.z, { yawDeg: PIN_YAW, aim: true });
  const T_PIN = pin + 4.4;
  s.HoldLoop("KitchenIja", VIL.pin, pin, T_PIN);
  s.Caption(pin + 1.0, 4.0, "（顺子两手死死抵住枪身：玩家连按往外推，推不赢，刀尖一点点往下来）");
  // 妮儿摸进来，往前扑、一口咬在鬼子握枪的手腕上（VilBiteWrist）—— 过场正常速度，不放慢
  const bite = T_PIN + NIER_MARK.offsetS;
  const BITE_AT = bite + 0.5;
  s.Go("Nier", bite - 1.6, bite - 0.2, NIER_MARK.x, NIER_MARK.z, { move: "run", path: [Pt(96.6, 479.3), Pt(95.3, 479.3)], depart: { stance: "stand", clip: null }, yawDeg: NIER_MARK.yawDeg });
  s.Key("Nier", bite, { clip: VIL.bite, clipHold: true });
  s.Caption(bite - 0.4, 2.4, "（妮儿摸进来，一口咬在鬼子握枪的手腕上）");
  s.Eye(pin, bite - 0.4 - pin, { stance: "prone", x: EYE_DOWN.x, z: EYE_DOWN.z, look: PIN, pitch: 38, toPitch: 52, shake: 0.22 });
  s.Eye(bite - 0.4, BITE_AT + 0.9 - (bite - 0.4), { stance: "prone", x: EYE_DOWN.x, z: EYE_DOWN.z, look: PIN, pitch: 52, toLook: NIER_MARK, toPitch: 42, shake: 0.1 });
  const scream = s.Say("KitchenBitten.01", "KitchenIja", BITE_AT + 0.4);
  s.Caption(scream + 0.2, 3.0, "（鬼子惨叫，手一松。屏幕弹一个键：拔刀——顺子从左肩抽出大刀，砍两刀）");
  const back = scream + 0.3;
  s.Eye(back, 1.4, { stance: "prone", x: EYE_DOWN.x, z: EYE_DOWN.z, look: PIN, pitch: 40, toPitch: 20 });
  s.Eye(back + 1.4, 3.0, { stance: "crouch", x: EYE_DOWN.x, z: EYE_DOWN.z, look: PIN, pitch: -14, shake: 0.2 });
  const chop1 = back + 1.8, chop2 = chop1 + 0.8;
  s.Sfx(chop1, "stab", PIN); s.Sfx(chop2, "stab", PIN);
  s.Shake(chop1, 0.3, 0.4); s.Shake(chop2, 0.3, 0.5);
  s.Key("KitchenIja", chop1 + 0.05, { clip: "ShotCollapse", clipHold: true });
  s.Key("KitchenIja", chop2 + 1.3, { state: "down", clip: null, yawDeg: 0 });
  s.Sfx(chop2 + 1.3, "bodyFall", PIN);
  s.Key("Nier", chop1 + 0.4, { clip: VIL.cower, stance: "crouch" });
  s.Caption(chop2 + 1.6, 2.6, "（妮儿嘴边沾着血，蹲在灶台边发抖）");
  s.Eye(chop2 + 1.6, 1.2, { stance: "crouch", x: EYE_DOWN.x, z: EYE_DOWN.z, look: PIN, pitch: -14, toLook: NIER_MARK, toPitch: -22 });
  // 动静传到北屋：机枪组扭头，东西两间递弹的两个拎着枪出堂屋门往灶屋走，前头那个边走边吼「どうした！」——在灶屋门口撞个正着：在屋里打
  for (const id of ["MgGunner", "MgLoader", "MgThird", "Leader"]) s.Key(id, chop2 + 1.0, { yawDeg: 180 });
  const come = chop2 + 2.0;
  const r2 = Route(UP(K6("Rifle2")), UP(K("Rifle2"))), r4 = Route(UP(K6("Rifle4")), UP(K("Rifle4")));
  s.Go("Rifle2", come, come + 1.4, r2.end.x, r2.end.z, { move: "run", path: r2.path, aim: true, faceTo: KITCHEN_DOOR });
  s.Go("Rifle4", come + 0.4, come + 1.8, r4.end.x, r4.end.z, { move: "run", path: r4.path, aim: true, faceTo: KITCHEN_DOOR });
  s.Say("KitchenCheck.01", "Rifle2", come + 1.6);
  s.Caption(come + 0.4, 3.0, "（动静传到北屋：两个鬼子拎着枪过来看，边走边吼）");
  s.Eye(come + 1.2, 1.6, { stance: "crouch", x: EYE_DOWN.x, z: EYE_DOWN.z, look: NIER_MARK, pitch: -22, toLook: KITCHEN_DOOR, toPitch: -2 });
  const fight = s.End("KitchenCheck.01") + 0.4;
  const in2 = UP(KU(ctx, "10-1", "Rifle2")), in4 = UP(KU(ctx, "10-1", "Rifle4"));
  s.Go("Rifle2", fight - 0.2, fight + 0.9, in2.x, in2.z, { move: "run", path: [Pt(96.5, 479.3), Pt(95.5, 479.4)], yawDeg: 90, aim: true });
  s.Go("Rifle4", fight + 0.2, fight + 1.0, in4.x, in4.z, { move: "run", yawDeg: 90, aim: true });
  s.Caption(fight + 0.2, 3.0, "（在灶屋门口撞个正着：在屋里打。黑屋里两三步远，抬枪就打）");
  Shot(s, fight + 1.0, "player", { count: 2, interval: 0.5 });
  s.Key("Rifle2", fight + 1.1, { clip: "ShotCollapse", clipHold: true });
  s.Key("Rifle2", fight + 2.5, { state: "down", clip: null, yawDeg: 60 });
  Shot(s, fight + 2.0, "Rifle4", { volume: 0.9 });
  Puff(s, fight + 2.2, Pt(93.4, 480.6));
  s.Shake(fight + 2.1, 0.3, 0.4);
  Shot(s, fight + 2.6, "player", { count: 2, interval: 0.4 });
  s.Key("Rifle4", fight + 2.7, { clip: "ShotCollapse", clipHold: true });
  s.Key("Rifle4", fight + 4.1, { state: "down", clip: null, yawDeg: -80 });
  s.Sfx(fight + 4.1, "bodyFall", in4);
  s.Eye(fight + 0.6, 4.0, { stance: "crouch", x: EYE_DOWN.x, z: EYE_DOWN.z, look: KITCHEN_DOOR, pitch: -2, shake: 0.15 });
  s.Caption(fight + 4.4, 3.0, "（两个都倒在灶屋门口。北屋里剩六个，全朝北打着。接 10）");
  return s.Done({ durationS: fight + 7.6 });
}

// ---------------------------------------------------------------------------
// 10 背后打掉机枪，守路口，被炮撵出庄子

/** 后送队 10-4 跑进胡同那条线（同关键帧生成器 CONVOY_LINE_104：队头在胡同里车后头，往回排到主街） */
const CONVOY_LINE = [Pt(LANE_X, 474.5), Pt(LANE_X, 470.6), Pt(107.2, 467.4), Pt(103.0, 462.8), Pt(ST.main.c, 457.5), Pt(ST.main.c, 395)];
function ConvoyAt(d, lat = 0) { const p = PointBeside(CONVOY_LINE, Math.max(0, Math.min(LineLength(CONVOY_LINE), d)), lat); return Pt(p.x, p.z); }
/** 从队尾那头（弧长 dFrom，大）往队头（dTo，小）走，途经折线的各个拐点（含横向偏移）。 */
function ConvoyPath(dFrom, dTo, lat = 0) {
  const out = []; let acc = 0;
  for (let i = 1; i < CONVOY_LINE.length; i++) { acc += Dist(CONVOY_LINE[i - 1], CONVOY_LINE[i]); if (acc < dFrom - 0.3 && acc > dTo + 0.3) out.push(ConvoyAt(acc, lat)); }
  return out.reverse();
}
/** 炮弹落地：尖啸（远炮声）→ 爆炸 + 土烟 + 震屏；BarrageHit / LaneWallCollapse 的信号由调用方切。 */
function Shell(s, tHit, at, { radius = 4.5, shake = 0.7, whistleS = 1.6, volume = 1.0 } = {}) {
  s.Sfx(tHit - whistleS, "artilleryFar", { x: at.x + 40, z: at.z - 60, volume: 0.6 * volume });
  s.Sfx(tHit, "shellBlast", { x: at.x, z: at.z, volume });
  s.Ev(tHit, "explosion", { x: at.x, z: at.z, kind: "shell", radius });
  s.Ev(tHit + 0.1, "smoke", { x: at.x, z: at.z, kind: "SmokeDust", dur: 7 });
  s.Shake(tHit, 0.7, shake);
  return R(tHit);
}

function S1001(ctx) {
  const s = new Seq(ctx, "10-1", "背后打：顺屋檐摸到堂屋门冲进北屋，先打机枪组；机枪哑了，班长冲");
  const K = id => KU(ctx, "10-1", id), K7 = id => KU(ctx, "09-7", id);
  const P = KP(ctx, "10-1");
  // 开场：北屋六个全活着（刚扭头看过灶屋的动静，又转回去打街上）；灶屋门口倒着三个；妮儿蹲在灶屋门外；枪眼后那挺枪还在
  s.Signal(0, SIG.mgSilenced, false);
  const alive = { MgGunner: [MG_AT, 180, true, "crouch"], MgLoader: [MG_LOADER_AT, 180, false, "crouch"], MgThird: [UP(K7("MgThird")), 180, false, "crouch"], Leader: [UP(K7("Leader")), 180, false, "stand"], Rifle1: [UP(K7("Rifle1")), 0, true, "crouch"], Rifle3: [UP(K7("Rifle3")), 0, true, "crouch"] };
  for (const [id, [p, yaw, aim, stance]] of Object.entries(alive)) s.Place(id, 0, p.x, p.z, { state: "alive", stance, aim, yawDeg: yaw });
  for (const id of ["MgGunner", "MgLoader", "MgThird", "Leader"]) s.Key(id, 0.8, { yawDeg: 0 });
  s.Place("Nier", 0, UP(K("Nier")).x, UP(K("Nier")).z, { stance: "crouch", faceTo: KITCHEN_DOOR, clip: VIL.cower });
  // 从灶屋出来，顺着屋檐摸到堂屋门（灶屋门口 → 北屋南墙根 → 堂屋门外），冲进去
  const eyeA = Pt(97.9, 479.8), eyeB = Pt(98.6, 476.6), eyeC = TANGWU_OUT, eyeD = Pt(P.x, P.z);
  s.Eye(0, 1.2, { stance: "crouch", x: eyeA.x, z: eyeA.z, look: TANGWU_DOOR, pitch: -2 });
  s.Caption(0.3, 3.0, "（从灶屋出来，顺着屋檐摸到堂屋门：门里头六个鬼子全朝北，机枪组三个守着枪眼，分队长和两个兵趴东西两间的枪眼）");
  WindowBurst(s, 0.8, { volume: 1.0 });
  s.Creep(1.2, 2.2, eyeA, eyeB, TANGWU_DOOR, { h: 1.05 });
  s.Creep(3.4, 1.0, eyeB, eyeC, MG_AT, { h: 1.05 });
  s.Creep(4.4, 1.0, eyeC, eyeD, MG_AT, { h: 1.55, ease: "linear" });
  s.Caption(4.6, 2.4, "（冲进北屋：机枪组背对着门，先打机枪组）");
  s.Eye(5.4, 9.0, { stance: "stand", look: MG_AT, pitch: -4, shake: 0.08 });
  // 六枪：架枪的先倒在枪上，副射手、弹药手跟着；分队长回身被打倒；东西两间枪眼的两个
  const kills = [["MgGunner", 6.0, 0], ["MgLoader", 6.9, 20], ["MgThird", 7.8, -30], ["Leader", 9.0, 30], ["Rifle1", 10.2, 10], ["Rifle3", 11.4, -10]];
  for (const [id, t, yaw] of kills) {
    Shot(s, t, "player");
    s.Key(id, t + 0.08, { clip: "ShotCollapse", clipHold: true });
    s.Go(id, t + 0.1, t + 1.1, K(id).x, K(id).z, { move: "walk" });
    s.Key(id, t + 1.5, { state: "down", clip: null, yawDeg: yaw });
  }
  s.Key("Leader", 8.6, { yawDeg: 180, aim: true });
  s.Key("Rifle3", 10.6, { yawDeg: 180 });
  s.Signal(6.9, SIG.mgSilenced, true);
  s.Caption(7.0, 2.6, "（机枪一哑：枪眼后头那挺十一年式没人了）");
  s.Eye(8.4, 1.2, { stance: "stand", look: MG_AT, pitch: -4, toLook: UP(K7("Leader")), toPitch: -3 });
  s.Eye(10.0, 1.6, { stance: "stand", look: UP(K7("Leader")), pitch: -3, toLook: UP(K7("Rifle3")), toPitch: -3 });
  // 机枪一哑，班长从大车后头跳起来、手往前一挥、往前冲（VilNraWaveCharge）：机枪哑了！冲！两面一夹
  const charge = s.Say("MgSilenced.01", "Luo", 7.6);
  const luoFrom = Pt(102.3, 443.4), LUO_YAW = 180;
  s.Place("Luo", 0, luoFrom.x, luoFrom.z, { stance: "crouch", aim: true, yawDeg: LUO_YAW });
  for (const id of ["HeYoutian", "Escort1", "Escort2"]) { const u = KU(ctx, "09-7", id); s.Place(id, 0, u.x, u.z, { stance: "crouch", aim: true, yawDeg: 180 }); }
  s.Key("Luo", charge + 0.2, { clip: VIL.waveCharge });
  const luoUp = RootEndAt(VIL.waveCharge, luoFrom, LUO_YAW);
  s.Key("Luo", charge + 0.2 + VilClipS(VIL.waveCharge), { x: luoUp.x, z: luoUp.z, move: "cut", clip: null, stance: "stand", yawDeg: LUO_YAW });
  for (const id of ["Luo", "HeYoutian", "Escort1", "Escort2"]) {
    const to = K(id);
    const t0 = id === "Luo" ? charge + 0.2 + VilClipS(VIL.waveCharge) : charge + 1.4;
    s.Go(id, t0, t0 + Dist(s.pos.get(id), to) / 3.4, to.x, to.z, { move: "run", depart: { stance: "stand" }, stance: "stand", yawDeg: 180, aim: true });
  }
  for (const id of ["Yaowa", "LiuWencai", "Squad3"]) {
    const u = KU(ctx, "09-7", id), to = K(id);
    s.Place(id, 0, u.x, u.z, { stance: "prone", aim: true, yawDeg: 177 });
    s.Go(id, charge + 1.4, charge + 1.4 + Dist(u, to) / 3.4, to.x, to.z, { move: "run", depart: { stance: "stand" }, stance: "stand", yawDeg: 180 });
  }
  s.Caption(charge + 0.2, 3.0, "（班长从大车后头跳起来往前冲，沟沿上的三个也跟着冲上街）");
  // 路口墙角那几个两面挨打：顺子从东间枪眼（正对着墙角 ±17°）打倒守着的那个，班长他们冲过来打倒拖人的那个，剩下三个往东街跑
  const loop = Pt(G.rifleEastPost.x, G.rifleEastPost.z);
  s.Cam(12.0, 1.6, { from: { x: P.x, z: P.z, h: 1.55 }, to: { ...loop, h: 1.1 }, look: { x: 108.2, z: 460.4, h: 1.0 } });
  s.Eye(13.6, 8.0, { stance: "crouch", x: loop.x, z: loop.z - 0.2, look: Pt(108.2, 460.4), pitch: -2, fov: 50 });
  s.Caption(12.2, 3.0, "（东间的枪眼正对着路口墙角：守在那儿的五个两面挨打）");
  for (const id of ["CellarIja1", "CellarIja2", "CellarIja3", "CellarIja4", "CornerIja1"]) { const u = KU(ctx, "09-7", id); s.Place(id, 0, u.x, u.z, { state: "alive", stance: "crouch", aim: true, yawDeg: 0 }); }
  Shot(s, 14.2, "player");
  s.Key("CornerIja1", 14.3, { clip: "ShotCollapse", clipHold: true });
  s.Go("CornerIja1", 14.3, 15.2, K("CornerIja1").x, K("CornerIja1").z, { move: "walk" });
  s.Key("CornerIja1", 15.7, { state: "down", clip: null, yawDeg: 0 });
  Shot(s, charge + 5.0, "Luo", { volume: 0.8 }); Shot(s, charge + 5.6, "HeYoutian", { volume: 0.8 });
  s.Key("CellarIja3", charge + 5.7, { clip: "ShotCollapse", clipHold: true });
  s.Go("CellarIja3", charge + 5.7, charge + 6.6, K("CellarIja3").x, K("CellarIja3").z, { move: "walk" });
  s.Key("CellarIja3", charge + 7.1, { state: "down", clip: null, yawDeg: 40 });
  for (const [id, dt] of [["CellarIja1", 0], ["CellarIja2", 0.4], ["CellarIja4", 0.8]]) {
    const to = UP(K(id));
    const via = Pt(108.8, 464.8);
    s.Go(id, 15.6 + dt, 15.6 + dt + (Dist(s.pos.get(id), via) + Dist(via, to)) / 3.6, to.x, to.z, { move: "run", path: [via], depart: { stance: "stand", aim: false }, stance: "stand", yawDeg: -90 });
  }
  s.Caption(16.0, 3.0, "（倒两个，剩下三个往东街跑了：东头的枪声近了——喊人那个把大队带回来了）");
  for (const [t, v] of [[17.0, 0.45], [19.6, 0.6]]) s.Sfx(t, "rifleShot", { x: 180, z: 465, volume: v });
  return s.Done({ durationS: 22.6 });
}

function S1002(ctx) {
  const s = new Seq(ctx, "10-2", "守路口·试探：缴来的机枪拖到石碾后朝东；鬼子两三人一组从门洞冲出来扑进下一个门洞");
  const K = id => KU(ctx, "10-2", id), K1 = id => KU(ctx, "10-1", id);
  const P = KP(ctx, "10-2");
  const loop = Pt(G.rifleEastPost.x, G.rifleEastPost.z);
  // 开场：顺子还在北屋东间枪眼后；班长他们到了街上（10-1 的位置）；东街上还看不见人（都在第一道弯那头）
  for (const id of ["Luo", "LiuWencai", "Yaowa", "HeYoutian", "Escort1", "Escort2", "Squad3"]) { const u = K1(id); s.Place(id, 0, u.x, u.z, { stance: "stand", aim: !!u.aim, yawDeg: 180 }); }
  const east0 = { EastIja1: Pt(182.6, 457.6), EastIja2: Pt(184.4, 457.0), EastIja3: Pt(186.0, 458.2), EastIja4: Pt(187.4, 457.0), EastIja5: Pt(189.0, 458.4), EastIja6: Pt(183.4, 458.8), EastIja7: Pt(185.6, 458.4), EastIja8: Pt(190.6, 457.2), EastIja9: Pt(192.2, 458.4) };
  const JOG_PATH = [Pt(180.2, 458.2), Pt(180.0, 463.6)];   // 从东街中段过第一道弯到东街：先到弯里再往南拐（别斜着切拐角的墙）
  for (const [id, p] of Object.entries(east0)) s.Place(id, 0, p.x, p.z, { state: "alive", stance: "crouch", aim: true, yawDeg: 90 });
  for (const id of ["CellarIja1", "CellarIja2", "CellarIja4"]) { const u = K1(id); s.Place(id, 0, u.x, u.z, { state: "alive", stance: "stand", yawDeg: -90 }); }
  s.Eye(0, 2.6, { stance: "crouch", x: loop.x, z: loop.z - 0.2, look: Pt(130, ST.east.c), pitch: -1, fov: 50 });
  for (const [t, v] of [[0.4, 0.6], [1.3, 0.7]]) s.Sfx(t, "rifleShot", { x: 185, z: 458, volume: v });
  // 班长在街上吼：调过来！朝东打！（挥手朝东指）
  s.Key("Luo", 0.6, { faceTo: "player" });
  const turn = s.Say("TurnEast.01", "Luo", 1.2);
  s.Key("Luo", turn + 0.2, { clip: POINT_STAND, faceTo: EAST_END });
  // 全班调到东街口；何有田进北屋拆机枪组身上的子弹袋
  for (const id of ["Luo", "LiuWencai", "Yaowa", "Escort1", "Escort2", "Squad3", "HeYoutian"]) {
    const to = K(id);
    const t0 = turn + 1.2 + (id === "Luo" ? 0 : 0.6);
    const r = Route(s.pos.get(id), to);
    s.Go(id, t0, t0 + RouteLen(s.pos.get(id), [...r.path, r.end]) / 3.2, r.end.x, r.end.z, { move: "run", path: r.path, depart: { clip: null }, stance: "crouch", yawDeg: to.yawDeg, ...(to.aim ? { aim: true } : {}) });
  }
  // 顺子把缴来的十一年式拖出北屋，出堂屋门、院门，顺窄胡同口到路口的石碾后头（约 45 m）
  const legs = [[Pt(P.x, P.z), 0], [TANGWU_OUT, 0], [Pt(102.6, 482.6), 0], [GATE_IN, 0], [GATE_OUT, 0], [Pt(LANE_X, 470.5), 0], [Pt(110.4, 467.6), 0], [Pt(P.x, P.z), 0]];
  let t = turn + 1.0, cur = Pt(loop.x, loop.z - 0.2);
  s.Caption(t, 3.4, "（顺子把缴来的十一年式拖出北屋：出堂屋门、院门，顺着窄胡同口跑到路口，拖到石碾后头朝东）");
  const pts = [TANGWU_OUT, Pt(102.6, 482.6), GATE_IN, GATE_OUT, Pt(LANE_X, 470.5), Pt(110.4, 467.6), Pt(P.x, P.z)];
  for (const p of pts) { const dur = R(Dist(cur, p) / 3.0); s.Creep(t, dur, cur, p, p === pts.at(-1) ? EAST_END : p, { h: 1.3, lookH: 1.0, ease: "linear" }); t = R(t + dur); cur = p; }
  void legs;
  const prone = R(t + 0.6);
  s.Caption(prone + 0.4, 3.6, "（弹斗一次装六个五发桥夹，三十发；子弹只有机枪组身上带的那些。东街又直又长，到第一道弯 67 m，过了弯看不见）");
  // 往东跑的那三个：最后一个被机枪扫倒在街上，前头两个扑进街北第一个院的院门
  const k4 = UP(K("CellarIja4"));
  for (const [id, dt] of [["CellarIja1", 0], ["CellarIja2", 0.6], ["CellarIja4", 1.6]]) {
    const to = id === "CellarIja4" ? k4 : UP(K(id));
    const r = Route(s.pos.get(id), to);
    s.Go(id, 2.0 + dt, 2.0 + dt + RouteLen(s.pos.get(id), [...r.path, r.end]) / 3.6, r.end.x, r.end.z, { move: "run", path: r.path, yawDeg: -90, ...(id !== "CellarIja4" ? { stance: "crouch" } : {}) });
  }
  const kill = (id, tk, yaw) => { Shot(s, tk, "player", { count: 6, interval: 0.11, sfx: "mgBurstNear" }); s.Key(id, tk + 0.3, { clip: "ShotCollapse", clipHold: true }); s.Key(id, tk + 1.8, { state: "down", clip: null, yawDeg: yaw }); Puff(s, tk + 0.5, Off(s.pos.get(id), 2.5, -0.4)); };
  kill("CellarIja4", prone + 1.0, -80);
  s.Caption(prone + 1.6, 2.8, "（跑在最后那个被一梭子扫倒在街上，前头两个扑进了街北第一个院的院门）");
  // 试探：带头的喊「跑到下一个门洞！」，两个从第一道弯那头冲出来沿街北往西跑，机枪一扫就趴；街南后墙的豁子、第一道弯的枪眼打冷枪
  const go = prone + 4.0;
  for (const id of ["EastIja6", "EastIja7"]) { const to = UP(K(id)); const len = RouteLen(s.pos.get(id), [JOG_PATH[0], to]); s.Go(id, go, go + len / 3.6, to.x, to.z, { move: "run", path: [JOG_PATH[0]], stance: "crouch", aim: true, yawDeg: 90 }); }
  for (const id of ["EastIja10", "EastIja11", "EastIja12", "EastIja13"]) { const u = K(id); s.Key(id, 0, { yawDeg: u.yawDeg, aim: true }); }
  s.Caption(go + 0.2, 3.2, "（第一道弯那头冒出两个人头趴在拐角；街南两座后墙对街的北屋，豁子里探出枪来打冷枪）");
  Shot(s, go + 1.0, "EastIja10", { volume: 0.8 }); Puff(s, go + 1.3, Pt(112.2, 466.0));
  Shot(s, go + 2.4, "EastIja12", { volume: 0.7 }); Puff(s, go + 2.7, Pt(113.0, 465.4));
  s.Shake(go + 2.7, 0.3, 0.2);
  // 第一组三个：从第一道弯跑到场院口（跑几步扑进下一个门洞）；带头的喊；机枪扫倒一个（EastIja2 跑到场院口外头）
  const order1 = s.Say("ProbeOrders.01", "EastIja5", go + 3.0);
  s.Key("EastIja5", order1 - 0.3, { clip: VIL.shout, faceTo: ROLLER });
  s.Key("EastIja5", s.End("ProbeOrders.01") + 0.3, { clip: null });
  const dash = s.End("ProbeOrders.01") + 0.4;
  const dashTo = { EastIja3: UP(K("EastIja3")), EastIja4: UP(K("EastIja4")), EastIja5: UP(K("EastIja5")), EastIja2: UP(K("EastIja2")) };
  [["EastIja3", 0], ["EastIja5", 0.5], ["EastIja4", 0.3], ["EastIja2", 0.8]].forEach(([id, dt]) => {
    const to = dashTo[id];
    const path = [...JOG_PATH, Pt(JOG1.x - 1.2, ST.east.c - 1.0)];
    const len = RouteLen(s.pos.get(id), [...path, to]);
    s.Go(id, dash + dt, dash + dt + len / 3.6, to.x, to.z, { move: "run", path, stance: id === "EastIja4" ? "prone" : "crouch", aim: true, yawDeg: 90 });
  });
  s.Caption(dash + 0.6, 3.0, "（三个一组从弯那头冲出来，顺街北跑几步扑进场院的口子）");
  const luoCall1 = s.Say("LuoCallouts.02", "Luo", dash + 1.6);
  s.Key("Luo", luoCall1 - 0.3, { faceTo: PB.ES2Breach, clip: POINT_CROUCH });
  s.Key("Luo", s.End("LuoCallouts.02") + 0.4, { clip: null, faceTo: Pt(190, ST.east.c), aim: true });
  Shot(s, s.End("LuoCallouts.02") + 0.4, "player", { count: 5, interval: 0.11, sfx: "mgBurstNear" }); Puff(s, s.End("LuoCallouts.02") + 0.8, Pt(PB.ES2Breach.x, PB.ES2Breach.z - 0.8));
  const t2 = dash + 0.8 + RouteLen(east0.EastIja2, [...JOG_PATH, Pt(JOG1.x - 1.2, ST.east.c - 1.0), dashTo.EastIja2]) / 3.6;
  kill("EastIja2", t2 - 0.9, 110);
  const down = s.Say("ProbeOrders.02", "EastIja5", t2 - 0.2);
  s.Caption(down + 0.4, 2.8, "（机枪一扫就趴：倒了一个，剩下的扑进了场院口）");
  // 第二拨：从街北第一个院的院门冲出来往西（左手第二道门），被扫倒在半道
  const out1 = s.End("ProbeOrders.02") + 1.6;
  s.Place("EastIja1", out1 - 0.1, PB.EN1Gate.x + 0.6, PB.EN1Gate.z - 1.0, { stance: "crouch", aim: true, yawDeg: 180 });
  const luoCall2 = s.Say("LuoCallouts.01", "Luo", out1 + 0.2);
  s.Key("Luo", luoCall2 - 0.3, { faceTo: PB.EN1Gate, clip: POINT_CROUCH });
  s.Key("Luo", s.End("LuoCallouts.01") + 0.4, { clip: null, faceTo: Pt(190, ST.east.c), aim: true });
  const e1 = UP(K("EastIja1"));
  s.Go("EastIja1", out1 + 0.4, out1 + 0.4 + Dist(Pt(PB.EN1Gate.x + 0.6, PB.EN1Gate.z - 1.0), e1) / 3.6, e1.x, e1.z, { move: "run", path: [Pt(PB.EN1Gate.x, ST.east.c - 0.6)], stance: "crouch", aim: true, yawDeg: 90 });
  kill("EastIja1", out1 + 0.4 + Dist(Pt(PB.EN1Gate.x + 0.6, PB.EN1Gate.z - 1.0), e1) / 3.6 - 0.6, 80);
  s.Caption(out1 + 0.6, 3.2, "（左手第二道门里又冲出一个，跑几步扑向下一个门洞——没扑到）");
  // 两个从弯那头往土地庙跑（10-3 缩在庙后）
  for (const [id, dt] of [["EastIja8", 0], ["EastIja9", 0.5]]) { const to = UP(K(id)); const len = RouteLen(s.pos.get(id), [...JOG_PATH, to]); s.Go(id, out1 + 3.0 + dt, out1 + 3.0 + dt + len / 3.6, to.x, to.z, { move: "run", path: JOG_PATH, stance: "crouch", yawDeg: 90 }); }
  Shot(s, out1 + 4.0, "EastIja11", { volume: 0.7 }); Puff(s, out1 + 4.3, Pt(113.6, 466.4));
  Shot(s, out1 + 5.2, "player", { count: 4, interval: 0.11, sfx: "mgBurstNear" }); Puff(s, out1 + 5.6, Pt(PB.ES3Breach.x, PB.ES3Breach.z - 0.8));
  s.Caption(out1 + 5.8, 3.4, "（他们不往街上硬冲：几个门洞、几个豁子轮着冒头打冷枪。这一步教玩家：这挺枪守得住路口，但子弹只有这些）");
  s.Eye(prone, out1 + 6.0 - prone, { stance: "prone", look: Pt(JOG1.x - 2, JOG1.z), pitch: 1, fov: 50 });
  s.Eye(out1 + 6.0, 2.0, { stance: "prone", look: Pt(JOG1.x - 2, JOG1.z), pitch: 1, toLook: PB.FarmOpen, toPitch: 1, fov: 50 });
  return s.Done({ durationS: out1 + 9.0 });
}

function S1003(ctx) {
  const s = new Seq(ctx, "10-3", "掷弹筒·北边抄：土地庙后的轻机枪、麦秸垛后的「嘭」、砸门往西挪；幺娃接过机枪");
  const K = id => KU(ctx, "10-3", id), K2 = id => KU(ctx, "10-2", id);
  const P = KP(ctx, "10-3"), P2 = KP(ctx, "10-2");
  const farmDoor = Pt(ES.northChain.farmyardDoor.x, ES.northChain.farmyardDoor.z), yard1Door = Pt(ES.northChain.yard1Door.x, ES.northChain.yard1Door.z);
  // 开场：顺子趴在石碾后（10-2 的位置）；轻机枪组从第一道弯那头跑到土地庙东北边架枪；缩在庙后的两个、场院口的三个都在
  for (const id of ["Yaowa", "LiuWencai", "Squad1", "HeYoutian"]) { const u = K2(id); s.Place(id, 0, u.x, u.z, { stance: "crouch", aim: !!u.aim, yawDeg: u.yawDeg }); }
  s.Place("EastMg1", 0, 183.0, 457.4, { stance: "crouch", yawDeg: 90, aim: false }); s.Place("EastMg2", 0, 184.6, 457.0, { stance: "crouch", yawDeg: 90 });
  for (const id of ["EastIja3", "EastIja4", "EastIja5"]) { const u = K2(id); s.Place(id, 0, u.x, u.z, { stance: u.stance || "stand", aim: true, yawDeg: 90 }); }
  s.Signal(0, SIG.northYardGatesBroken, false);
  s.Eye(0, 44, { stance: "prone", x: P2.x, z: P2.z, look: SHRINE, pitch: 1, fov: 50 });
  s.Caption(0.3, 3.0, "（土地庙后头一挺轻机枪架起来压过来：子弹打在石碾上，石屑崩脸）");
  const MG_PATH = [Pt(180.2, 458.2), Pt(180.0, 464.0), Pt(JOG1.x - 1.0, ST.east.c + 0.6)];
  for (const [id, dt] of [["EastMg1", 0], ["EastMg2", 0.4]]) { const to = UP(K(id)); const len = RouteLen(s.pos.get(id), [...MG_PATH, to]); s.Go(id, 0.4 + dt, 0.4 + dt + len / 3.6, to.x, to.z, { move: "run", path: MG_PATH, stance: id === "EastMg1" ? "prone" : "crouch", aim: true, yawDeg: 90 }); }
  const mgOn = 0.4 + RouteLen(Pt(183.0, 457.4), [...MG_PATH, UP(K("EastMg1"))]) / 3.6 + 1.0;
  for (const [dt, p] of [[0, Pt(112.0, 466.1)], [2.6, Pt(111.4, 466.5)], [6.0, Pt(112.6, 465.6)]]) { Shot(s, mgOn + dt, "EastMg1", { count: 6, interval: 0.11, sfx: "mgBurstFar", volume: 0.8 }); Puff(s, mgOn + dt + 0.4, p); s.Shake(mgOn + dt + 0.4, 0.3, 0.25); }
  Shot(s, mgOn + 1.4, "player", { count: 5, interval: 0.11, sfx: "mgBurstNear" }); Puff(s, mgOn + 1.8, Pt(MG_HIDE.x - 2.0, MG_HIDE.z - 0.3));
  // 军官（过了弯看不见，只听得见）：退！躲到小庙后头！—— 场院口的三个退进场院；再叫掷弹筒打
  const retreat = s.Say("EastEndOfficer.01", "EastOfficer", mgOn + 3.0);
  for (const [id, dt] of [["EastIja3", 0.4], ["EastIja4", 0.8], ["EastIja5", 0.2]]) { const to = UP(K(id)); s.Go(id, retreat + dt, retreat + dt + 1.6, to.x, to.z, { move: "run", stance: "crouch", yawDeg: 90 }); }
  s.Caption(retreat + 0.2, 2.8, "（军官在弯那头吼：场院口的几个缩回去了）");
  s.Key("EastIja5", retreat + 0.3, { faceTo: STRAW, clip: VIL.shout });
  const order = s.Say("EastEndOfficer.02", "EastOfficer", s.End("EastEndOfficer.01") + 1.0);
  s.Key("EastIja5", s.End("EastEndOfficer.02") + 0.3, { clip: null, faceTo: ROLLER });
  // 掷弹筒三发：嘭 → 5.5 s 后落地，一发比一发近（14 → 8 → 3 m）；掷弹筒组躲在场院里（看不见，只听得见、看得见冒上来的烟）
  {
    const g = UP(K("Mortar1")), gYaw = Yaw(g, ROLLER);
    const ld = Fwd(g, gYaw, 0.30, 0.46);
    const pop1 = s.End("EastEndOfficer.02") + 1.0;
    const from = R((((1.6 - pop1) % 2) + 2) % 2);
    s.Place("Mortar1", 0, g.x, g.z, { yawDeg: gYaw, stance: "crouch", aim: false, clip: "PvIjaLauncherFire", clipFrom: from });
    s.Place("Mortar2", 0, ld.x, ld.z, { yawDeg: R(gYaw + 50), stance: "crouch", aim: false, clip: "PvIjaLauncherLoad", clipFrom: from });
    s.Key("Mortar3", 0, { stance: "crouch", faceTo: ROLLER });
    const h1 = Mortar(s, pop1, Pt(127.0, 463.6), { shake: 0.25 });
    s.Caption(pop1 + 0.3, 3.4, "（场院麦秸垛后头「嘭」一声：掷弹筒开始找石碾。从石碾后看不见垛子，只看得见冒上来的烟）");
    s.Caption(h1 + 0.3, 2.4, "（第一发落在十几米外）");
    const h2 = Mortar(s, h1 + 1.4, Pt(121.0, 464.6), { shake: 0.5 });
    s.Caption(h2 + 0.3, 2.4, "（下一发近一点）");
    // 北边院子「咣、咣」砸门，一个院子一个院子往西挪：军官叫人砸北边的院门穿院子抄后路
    const north = s.Say("EastEndOfficer.03", "EastOfficer", h1 + 0.4);
    const GATE_M = 0.55 + 0.15;
    const n0 = { NorthIja4: [Pt(farmDoor.x + GATE_M, farmDoor.z), 90], NorthIja3: [Pt(yard1Door.x + GATE_M, yard1Door.z), 90], NorthIja2: [Pt(yard1Door.x + 2.2, yard1Door.z + 1.2), 90], NorthIja1: [Pt(POCKET_GATE.x, POCKET_GATE.z - GATE_M), 180] };
    for (const [id, [p, yaw]] of Object.entries(n0)) s.Place(id, 0, p.x, p.z, { stance: "stand", aim: false, yawDeg: yaw });
    const SMASH_SFX_LEAD = R(0.45 - SFX_FILE.gateSmash.hits[0]);
    const smash = (id, tt, p, v) => { s.Key(id, tt, { clip: VIL.smash }); s.Sfx(tt + SMASH_SFX_LEAD, "gateSmash", { x: p.x, z: p.z, volume: v }); s.Key(id, tt + VilClipS(VIL.smash), { clip: null }); return R(tt + 1.6); };
    const sm0 = s.End("EastEndOfficer.03") + 0.6;
    smash("NorthIja4", sm0, farmDoor, 0.4); smash("NorthIja3", sm0 + 3.0, yard1Door, 0.6);
    const broken = smash("NorthIja1", sm0 + 6.4, POCKET_GATE, 0.9);
    s.Caption(sm0 + 0.6, 3.4, "（北边院子里「咣、咣」砸门，一个院子一个院子往西挪，越来越近：有人要从石碾背后西北角的院子钻出来）");
    s.Signal(broken, SIG.northYardGatesBroken, true);
    s.Sfx(broken, "dirtFall", { x: POCKET_GATE.x, z: POCKET_GATE.z, volume: 0.7 });
    s.Ev(broken, "smoke", { x: POCKET_GATE.x, z: POCKET_GATE.z + 0.6, kind: "SmokeDust", dur: 2.5 });
    s.Caption(broken + 0.2, 2.4, "（北角那道院门倒了）");
    for (const id of ["NorthIja4", "NorthIja3", "NorthIja2"]) {
      const to = UP(K(id));
      const k = ["NorthIja4", "NorthIja3", "NorthIja2"].indexOf(id);
      const path = [Pt(farmDoor.x, farmDoor.z), Pt(yard1Door.x, yard1Door.z), Pt(114.5, 450.5)].filter(p => p.x > to.x + 0.5 && p.x < s.pos.get(id).x - 0.5);
      const len = RouteLen(s.pos.get(id), [...path, to]);
      s.Go(id, broken + 0.9 + k * 0.5, broken + 0.9 + k * 0.5 + len / 3.3, to.x, to.z, { move: "run", path, stance: "stand", aim: true, yawDeg: K(id).yawDeg });
    }
    { const to = UP(K("NorthIja1")); s.Go("NorthIja1", broken + 0.9, broken + 2.0, to.x, to.z, { move: "walk", stance: "crouch", aim: true, yawDeg: K("NorthIja1").yawDeg }); }
    // 班长：左手院子！文财、幺娃，给老子堵到！—— 刘文财和 Squad1 蹲到北角口上
    s.Eye(sm0 + 1.0, 1.4, { stance: "prone", x: P2.x, z: P2.z, look: SHRINE, pitch: 1, toLook: POCKET_GATE, toPitch: 0, fov: 50 });
    s.Key("Luo", broken - 0.6, { faceTo: POCKET_GATE });
    const hold = s.Say("HoldEastStreet.01", "Luo", broken + 0.6);
    s.Key("Luo", hold + 1.0, { clip: POINT_CROUCH });
    s.Key("Luo", hold + 3.6, { clip: null, faceTo: EAST_END, aim: true });
    for (const id of ["LiuWencai", "Squad1"]) { const to = K(id); s.Go(id, hold + 1.6 + (id === "Squad1" ? 0.4 : 0), hold + 3.4 + (id === "Squad1" ? 0.4 : 0), to.x, to.z, { move: "run", stance: "crouch", aim: true, yawDeg: to.yawDeg }); }
    s.Caption(hold + 1.2, 3.0, "（文财、Squad1 蹲到北角口上堵。最前头那个已经到了北角院门外）");
    Shot(s, hold + 4.2, "LiuWencai", { volume: 0.9 }); Shot(s, hold + 5.0, "NorthIja1", { volume: 0.9 }); Puff(s, hold + 5.3, Pt(104.6, 461.6));
    s.Eye(hold + 4.0, 1.2, { stance: "prone", x: P2.x, z: P2.z, look: POCKET_GATE, pitch: 0, toLook: SHRINE, toPitch: 1, fov: 50 });
    // 弹斗快空；掷弹筒落到石碾跟前；班长：幺娃，接到！幺娃滚过来接过机枪，顺子退到石碾南边
    const h3 = Mortar(s, Math.max(h2 + 1.8, hold + 3.0), Pt(115.4, 464.2), { shake: 0.8, radius: 3.5 });
    s.Eye(h3 - 0.1, 0.8, { stance: "prone", x: P2.x, z: P2.z, look: SHRINE, pitch: 1, toPitch: -6, fov: 50, shake: 0.6 });
    s.Caption(h3 + 0.3, 3.2, "（再下一发落到石碾跟前。弹斗里还剩几发、落点还差几步：玩家看得见的两个倒计时）");
    const he = UP(K("HeYoutian"));
    s.Walk("HeYoutian", h1 + 0.6, he, { move: "run", speed: 3.2, stance: "crouch", faceTo: "player" });
    s.Caption(h1 + 2.0, 2.6, "（何有田把拆下来的子弹袋递过来：就这些了）");
    const take = s.Say("HoldEastStreet.02", "Luo", h3 + 1.2);
    s.Key("Luo", take - 0.3, { faceTo: "Yaowa" });
    s.Key("Luo", s.End("HoldEastStreet.02") + 0.4, { faceTo: EAST_END, aim: true });
    s.Caption(take + 0.2, 3.0, "（幺娃滚过来接过机枪，顺子退到石碾南边）");
    s.Cam(take + 0.2, 4.4, { from: { x: 108.4, z: 469.0, h: 1.1 }, look: { ...ROLLER, h: 0.6 }, fov: 56 });
    const yw = UP(K("Yaowa"));
    s.Go("Yaowa", take + 0.6, take + 2.2, yw.x, yw.z, { move: "run", stance: "prone", yawDeg: -90 });
    s.Key("Yaowa", take + 2.4, { weapon: "Type11", aim: true });
    Shot(s, take + 3.2, "Yaowa", { count: 6, interval: 0.11, sfx: "mgBurstNear", volume: 0.9 });
    s.Eye(take + 4.6, 3.0, { stance: "crouch", x: P.x, z: P.z, look: ROLLER, pitch: -4, toLook: Pt(LANE_X, 474), toPitch: -4 });
    s.Caption(take + 4.8, 2.8, "（后送队上来了：顺主街跑到路口。接 10-4）");
    void north; void order; void retreat;
    return s.Done({ durationS: take + 8.0 });
  }
}

function S1004(ctx) {
  const s = new Seq(ctx, "10-4", "后送队过胡同：贴着石碾背后一副一副拐进窄胡同；妮儿抱住老耿的腿");
  const K = id => KU(ctx, "10-4", id), K3 = id => KU(ctx, "10-3", id);
  const P = KP(ctx, "10-4");
  // 开场：顺子站在窄胡同口；后送队还在主街上（比关键帧位置往北 26 m），顺主街跑到路口、贴着石碾背后拐进胡同
  const convoy = (ctx.config.keyframes.find(k => k.id === "10-4").units).filter(u => /^(Litter\d\d|LitterDonggua|Walker\d\d|Helper\d\d)$/.test(u.id));
  const BACK = 26;
  for (const u of convoy) {
    if (u.id === "Walker01" || u.id === "Helper01") continue;   // 背着的一对另排
    const d = Station(CONVOY_LINE, Pt(u.x, u.z));
    const lat = /^(Walker|Helper)/.test(u.id) ? (u.id.startsWith("Walker") ? 1.3 : 2.0) : 0;
    const from = ConvoyAt(d + BACK, lat);
    s.Place(u.id, 0, from.x, from.z, { yawDeg: 0, ...(u.id.startsWith("Walker") ? { stance: "crouch" } : {}) });
    const mps = u.kind === "litter" ? 1.9 : 2.0;
    s.Go(u.id, 0.6, R(0.6 + BACK / mps), u.x, u.z, { move: "run", path: ConvoyPath(d + BACK, d, lat), yawDeg: u.yawDeg });
  }
  s.Place("Donggua", 0, ConvoyAt(BACK, 0).x, ConvoyAt(BACK, 0).z, { lie: "along", yawDeg: 0 });
  s.Go("Donggua", 0.6, R(0.6 + BACK / 1.9), K("Donggua").x, K("Donggua").z, { move: "run", path: ConvoyPath(BACK, 0, 0), yawDeg: K("Donggua").yawDeg });
  // Helper01 背着 Walker01（VilNraCarryOnBack + VilRideOnBack 一对）跟在队里
  { const h = UP(K("Helper01")); const d = Station(CONVOY_LINE, h); const from = ConvoyAt(d + BACK, 2.0); CarryPair(s, "Helper01", "Walker01", from, 0); CarryGo(s, "Helper01", "Walker01", 0.6, h, { speed: 1.5, path: ConvoyPath(d + BACK, d, 2.0), yawDeg: K("Helper01").yawDeg }); }
  s.Eye(0, 3.0, { stance: "stand", look: Pt(ST.main.c, 430), pitch: -2 });
  s.Caption(0.3, 3.4, "（后送队顺主街跑到路口，贴着石碾背后一副一副拐进窄胡同往南：担架小跑。幺娃在石碾后的机枪上顶着）");
  s.Eye(3.0, 1.4, { stance: "stand", look: Pt(ST.main.c, 430), pitch: -2, toLook: Pt(107, 467), toPitch: -4 });
  s.Eye(4.4, 6.0, { stance: "stand", look: Pt(107, 467), pitch: -4, toLook: Pt(LANE_X, 480), toPitch: -4 });
  Shot(s, 1.2, "Yaowa", { count: 5, interval: 0.11, sfx: "mgBurstNear", volume: 0.8 });
  Shot(s, 7.8, "Yaowa", { count: 5, interval: 0.11, sfx: "mgBurstNear", volume: 0.8 });
  Mortar(s, 5.0, Pt(118.2, 463.0), { shake: 0.4 });
  // 老耿赶着车过来进胡同；妮儿从老耿家院门跑出来抱住他的腿（VilHugLegs：清单 stage hugLegs，老耿面对着她站在她前方 0.341 m）
  const cart = UP(K("GengCart")), geng = UP(K("Geng")), gengYaw = K("Geng").yawDeg;
  s.Place("GengCart", 0, LANE_X, 462.6, { yawDeg: 180 });
  s.Place("Geng", 0, LANE_X + 0.1, 465.4, { yawDeg: 180 });
  s.Go("GengCart", 2.0, 2.0 + Dist(Pt(LANE_X, 462.6), cart) / 1.8, cart.x, cart.z, { move: "walk", path: [Pt(LANE_X, 470.6)], yawDeg: 180 });
  s.Go("Geng", 2.0, 2.0 + Dist(Pt(LANE_X + 0.1, 465.4), geng) / 1.8, geng.x, geng.z, { move: "walk", path: [Pt(LANE_X + 0.1, 470.6)], yawDeg: 180 });
  const gengArrive = 2.0 + Dist(Pt(LANE_X + 0.1, 465.4), geng) / 1.8;
  s.Caption(gengArrive - 2.0, 2.8, "（老耿赶着驴车进了胡同：窄，挤一点能过）");
  const nier0 = UP(K3("Nier"));
  s.Place("Nier", 0, nier0.x, nier0.z, { stance: "crouch", faceTo: TANGWU_DOOR, clip: VIL.cower });
  const hug = StageAnchorFrom("hugLegs", "geng", geng, gengYaw);
  const nierPath = K("Nier").path;
  const run0 = gengArrive - 1.0;
  s.Walk("Nier", run0, hug, { move: "run", speed: 2.6, path: nierPath.slice(1, -1), depart: { stance: "stand", clip: null }, yawDeg: hug.yawDeg, clip: VIL.hug, clipHold: true });
  const hugT = s.pos.get("Nier").t;
  s.Key("Geng", gengArrive + 0.2, { yawDeg: gengYaw });
  s.Caption(hugT - 0.6, 3.0, "（妮儿从老耿家院门跑出来，扑过去抱住他的腿）");
  s.Eye(hugT - 1.6, 1.2, { stance: "stand", look: Pt(LANE_X, 480), pitch: -4, toLook: { actor: "Geng", offset: [0, 1.3, 0] } });
  s.Eye(hugT - 0.4, 6.0, { stance: "stand", look: { actor: "Geng", offset: [0, 1.3, 0] } });
  s.Caption(hugT + 2.2, 3.6, "（老耿往院里看了一眼地上的人，看了一眼顺子，什么也没说，拽着驴进胡同）");
  s.Key("Geng", hugT + 2.4, { faceTo: GENG_GATE });
  s.Key("Geng", hugT + 4.0, { faceTo: "player" });
  const go = hugT + 5.6;
  s.Key("Geng", go, { yawDeg: 180 });
  s.Key("Nier", go + 0.2, { clip: null, stance: "crouch" });
  s.Go("Geng", go + 0.4, go + 6.4, LANE_X + 0.1, 492.4, { move: "walk", yawDeg: 180 });
  s.Go("Nier", go + 0.6, go + 6.4, LANE_X - 0.3, 491.4, { move: "walk", stance: "crouch", yawDeg: 180 });
  s.Go("GengCart", go + 0.8, go + 6.8, LANE_X, 489.6, { move: "walk", yawDeg: 180 });
  for (const u of convoy.filter(x => /^(Litter0[1-4]|LitterDonggua)$/.test(x.id))) s.Go(u.id, go + 1.2, go + 7.0, LANE_X, u.z + 10.0, { move: "run", yawDeg: 180 });
  s.Go("Donggua", go + 1.2, go + 7.0, LANE_X, K("Donggua").z + 10.0, { move: "run", yawDeg: K("Donggua").yawDeg });
  s.Eye(go, 3.0, { stance: "stand", look: { actor: "Geng", offset: [0, 1.3, 0] }, toLook: { actor: "Luo", offset: [0, 1.2, 0] } });
  s.Caption(go + 0.4, 3.0, "（担架一副接一副跟进胡同。石碾那边：鬼子试了几次攻不上来）");
  Shot(s, go + 1.4, "Yaowa", { count: 5, interval: 0.11, sfx: "mgBurstNear", volume: 0.8 });
  Shot(s, go + 3.6, "EastMg1", { count: 6, interval: 0.11, sfx: "mgBurstFar", volume: 0.7 }); Puff(s, go + 4.0, Pt(112.4, 466.3));
  s.Eye(go + 3.0, 3.0, { stance: "stand", look: { actor: "Luo", offset: [0, 1.2, 0] }, toLook: Pt(LANE_X, 490), toPitch: -4 });
  return s.Done({ durationS: go + 7.6 });
}

function S1005(ctx) {
  const s = new Seq(ctx, "10-5", "炮·撤：吹哨全退，静两三秒；炮！进屋！炮落在石碾和路口；撤！走胡同！");
  const K = id => KU(ctx, "10-5", id), K4 = id => KU(ctx, "10-4", id);
  const P = KP(ctx, "10-5"), P4 = KP(ctx, "10-4");
  s.Signal(0, SIG.barrageHit, false);
  // 开场：都是 10-4 的样子（全班在路口、幺娃在石碾后的机枪上；鬼子还在东街、院子链里）
  for (const id of ["Luo", "Yaowa", "LiuWencai", "Squad1", "HeYoutian", "Squad3", "Escort1", "Escort2", "Squad2"]) { const u = K4(id); s.Place(id, 0, u.x, u.z, { stance: u.stance || "stand", aim: !!u.aim, yawDeg: u.yawDeg, ...(id === "Yaowa" ? { weapon: "Type11" } : {}) }); }
  for (const id of ["EastIja3", "EastIja4", "EastIja5", "EastIja6", "EastIja7", "EastIja8", "EastIja9", "EastMg1", "EastMg2", "NorthIja1", "NorthIja2", "NorthIja3", "NorthIja4"]) { const u = K4(id); s.Place(id, 0, u.x, u.z, { stance: u.stance || "stand", aim: !!u.aim, yawDeg: u.yawDeg }); }
  s.Eye(0, 3.0, { stance: "stand", x: P4.x, z: P4.z, look: Pt(140, ST.east.c), pitch: -1 });
  Shot(s, 0.6, "Yaowa", { count: 4, interval: 0.11, sfx: "mgBurstNear", volume: 0.8 });
  Shot(s, 1.6, "EastMg1", { count: 5, interval: 0.11, sfx: "mgBurstFar", volume: 0.7 }); Puff(s, 2.0, Pt(112.0, 466.2));
  // 东街那头吹哨：全体后退！炮要来了！—— 日军全退（东街的缩到第一道弯那头，抄北边的退回北侧第一个院里）
  const back = s.Say("EastEndOfficer.04", "EastOfficer", 3.2);
  s.Caption(back - 0.6, 2.8, "（试了几次攻不上来。东街那头吹哨）");
  for (const id of ["EastIja3", "EastIja4", "EastIja5", "EastIja6", "EastIja7", "EastIja8", "EastIja9", "EastMg1", "EastMg2"]) {
    const to = UP(K(id));
    const cur0 = s.pos.get(id);
    const path = cur0.x < JOG1.x - 1.2 ? [Pt(JOG1.x - 1.0, ST.east.c - 0.4), Pt(180.0, 458.4)] : cur0.x < 182 ? [Pt(180.0, 458.4)] : [];
    const len = RouteLen(s.pos.get(id), [...path, to]);
    s.Go(id, back + 0.6, back + 0.6 + len / 3.6, to.x, to.z, { move: "run", path, stance: "crouch", yawDeg: -90, depart: { aim: false } });
  }
  for (const id of ["NorthIja1", "NorthIja2", "NorthIja3", "NorthIja4"]) {
    const to = UP(K(id));
    const r = Route(s.pos.get(id), to);
    s.Go(id, back + 0.8, back + 0.8 + RouteLen(s.pos.get(id), [...r.path, r.end]) / 3.6, r.end.x, r.end.z, { move: "run", path: r.path, stance: "crouch", yawDeg: 90, depart: { aim: false } });
  }
  s.Caption(s.End("EastEndOfficer.04") + 0.2, 3.0, "（鬼子全退了：东街上一个人影都没了，北边院子里砸门的也不响了。静了两三秒）");
  // 班长听出来了：炮！进屋！—— 全班往老耿家院子跑（窄胡同口 → 院门）；顺子跟着跑进院
  const warn = s.Say("LuoShellsIn.01", "Luo", s.End("EastEndOfficer.04") + 3.0);
  s.Key("Luo", warn - 0.3, { faceTo: "player", clip: WAVE_ON });
  s.Key("Luo", warn + 1.2, { clip: null });
  const yardOf = { Luo: GATE_IN, Yaowa: Pt(98.6, 482.6), LiuWencai: Pt(104.6, 481.8), Squad1: Pt(102.0, 483.4), Squad2: Pt(100.6, 481.8), Squad3: Pt(105.4, 478.8), HeYoutian: Pt(107.3, 484.5), Escort1: Pt(101.6, 478.4), Escort2: Pt(104.2, 479.6) };
  ["Luo", "HeYoutian", "Squad3", "Escort1", "Escort2", "Squad2", "LiuWencai", "Squad1", "Yaowa"].forEach((id, k) => {
    const to = yardOf[id];
    const r = Route(s.pos.get(id), to);
    s.Go(id, warn + 0.6 + k * 0.25, warn + 0.6 + k * 0.25 + RouteLen(s.pos.get(id), [...r.path, r.end]) / 3.4, r.end.x, r.end.z, { move: "run", path: r.path, depart: { stance: "stand", aim: false, clip: null }, stance: "stand", yawDeg: 90 });
  });
  s.Caption(warn + 0.4, 2.8, "（全班从窄胡同口冲进老耿家院门。幺娃丢下那挺机枪）");
  const eyeIn = warn + 0.8;
  s.Creep(eyeIn, 2.0, Pt(P4.x, P4.z), GATE_OUT, GATE_IN, { h: 1.55, ease: "linear" });
  s.Creep(eyeIn + 2.0, 1.6, GATE_OUT, Pt(P.x, P.z), TANGWU_DOOR, { h: 1.55, ease: "linear" });
  // 第一排炮落在石碾和路口：北屋东间塌一角、石碾旁一堆新瓦砍、草顶着火（烟）；耳鸣
  const T1 = eyeIn + 4.2;
  Shell(s, T1, Pt(112.6, 463.4), { shake: 0.9 });
  Shell(s, T1 + 0.5, Pt(104.4, 471.6), { shake: 1.0, radius: 5 });
  Shell(s, T1 + 1.1, Pt(99.0, 461.0), { shake: 0.8 });
  Shell(s, T1 + 1.8, Pt(116.0, 466.8), { shake: 0.7 });
  s.Signal(T1 + 0.5, SIG.barrageHit, true);
  s.Sfx(T1 + 0.5, "tinnitus", { x: P.x, z: P.z });
  s.Ev(T1 + 0.7, "smoke", { x: 103.5, z: 472.0, kind: "SmokeBlack", dur: 40 });
  s.Ev(T1 + 1.2, "smoke", { x: 94.0, z: 479.0, kind: "SmokeBlack", dur: 40 });
  s.Eye(eyeIn + 3.6, 5.0, { stance: "stand", x: P.x, z: P.z, look: TANGWU_DOOR, pitch: -2, shake: 0.5 });
  s.Caption(T1 + 0.6, 3.6, "（第一排炮落在石碾和路口：北屋东间的后墙和房顶塌下来，石碾旁炸出一堆新瓦砍，草顶着了火。耳朵嗡嗡响）");
  // 撤！走胡同！跟斗老子！—— 幺娃路过灶屋把枪栓扔进水缸；何有田蹲在院门框边往门缝里卡手榴弹：滚！表挡事！
  const go = s.Say("LuoShellsIn.02", "Luo", T1 + 3.4);
  s.Key("Luo", go - 0.2, { faceTo: "player", clip: WAVE_ON });
  s.Key("Luo", s.End("LuoShellsIn.02") + 0.3, { clip: null, faceTo: GATE_OUT });
  s.Caption(go + 0.4, 2.8, "（撤！走胡同！跟斗老子！大家往院门跑）");
  s.Key("Yaowa", go + 0.4, { faceTo: Pt(G.vat.x, G.vat.z) });
  s.Sfx(go + 1.4, "dirtFall", { x: G.vat.x, z: G.vat.z, volume: 0.5 });
  s.Caption(go + 1.2, 2.6, "（幺娃路过灶屋，把那挺机枪的枪栓扔进水缸）");
  s.Key("HeYoutian", go + 0.6, { stance: "crouch", faceTo: GENG_GATE });
  s.Eye(eyeIn + 8.6, 1.4, { stance: "stand", x: P.x, z: P.z, look: TANGWU_DOOR, pitch: -2, toLook: GATE_IN, toPitch: -4, shake: 0.2 });
  const he = s.Say("HeGrenadeGate.01", "HeYoutian", s.End("LuoShellsIn.02") + 1.4);
  s.Caption(he + 0.2, 3.0, "（何有田蹲在院门框边往门缝里卡手榴弹，只有几秒。身后挡路的人：滚！表挡事！）");
  // 全班出院门进胡同往南（10-6 的位置）
  const out = s.End("LuoShellsIn.02") + 0.4;
  const laneOf = { Luo: Pt(LANE_X, 494.4), LiuWencai: Pt(LANE_X, 492.2), Squad1: Pt(LANE_X, 490.6), Squad3: Pt(LANE_X, 489.0), Squad2: Pt(LANE_X, 487.6), Escort1: Pt(LANE_X, 486.4), Escort2: Pt(LANE_X, 485.2), Yaowa: Pt(LANE_X, 485.0) };
  ["Luo", "LiuWencai", "Squad1", "Squad3", "Squad2", "Escort1", "Escort2", "Yaowa"].forEach((id, k) => {
    const to = laneOf[id];
    const r = Route(s.pos.get(id), to);
    s.Go(id, out + k * 0.5, out + k * 0.5 + RouteLen(s.pos.get(id), [...r.path, r.end]) / 3.2, r.end.x, r.end.z, { move: "run", path: r.path, stance: "stand", yawDeg: 180 });
  });
  s.Walk("HeYoutian", he + 3.0, Pt(GATE_OUT.x, GATE_OUT.z + 1.0), { move: "run", speed: 3.2, depart: { stance: "stand" }, stance: "stand", yawDeg: 180 });
  Shell(s, out + 2.6, Pt(110.6, 466.6), { shake: 0.8 });
  Shell(s, out + 4.2, Pt(101.0, 474.0), { shake: 0.9, radius: 5 });
  s.Creep(he + 1.6, 1.8, Pt(P.x, P.z), GATE_IN, GATE_OUT, { h: 1.55, ease: "linear" });
  s.Creep(he + 3.4, 1.0, GATE_IN, GATE_OUT, Pt(LANE_X, 495), { h: 1.55, ease: "linear" });
  s.Caption(he + 3.6, 2.4, "（出院门进窄胡同。接 10-6）");
  return s.Done({ durationS: he + 5.0 });
}

function S1006(ctx) {
  const s = new Seq(ctx, "10-6", "炮里撤：窄胡同拐几道弯，炮追着人跑；塌墙翻墙绕院子；往大槐树跑，出村南口");
  const K = id => KU(ctx, "10-6", id), K5 = id => KU(ctx, "10-5", id);
  const P = KP(ctx, "10-6");
  // 开场：全班刚出院门进了胡同（10-5 末的位置），顺子在院门外；班长跑最前
  const laneOf = { Luo: Pt(LANE_X, 494.4), LiuWencai: Pt(LANE_X, 492.2), Squad1: Pt(LANE_X, 490.6), Squad3: Pt(LANE_X, 489.0), Squad2: Pt(LANE_X, 487.6), Escort1: Pt(LANE_X, 486.4), Escort2: Pt(LANE_X, 485.2), Yaowa: Pt(LANE_X, 485.0), HeYoutian: Pt(GATE_OUT.x, GATE_OUT.z + 1.0) };
  for (const [id, p] of Object.entries(laneOf)) s.Place(id, 0, p.x, p.z, { stance: "stand", yawDeg: 180, aim: false });
  s.Signal(0, SIG.laneWallCollapse, false);
  const EYE0 = Pt(LANE_X - 0.3, GATE_OUT.z - 0.6);
  s.Eye(0, 1.0, { stance: "stand", x: EYE0.x, z: EYE0.z, look: { actor: "Luo", offset: [0, 1.2, 0] } });
  s.Caption(0.3, 3.0, "（窄胡同拐几道弯，炮一排比一排近追着人跑。班长跑最前，每个拐角先到、回身招手。10-6 全程跑）");
  // 第一段：胡同往南到第一道弯（z 495）；炮落在身后院子里；班长：炮！趴倒！（屏幕卧倒提示，趴不趴由玩家）→ 起来！跑！
  const C1 = Pt(LANE_X, 495), C2 = Pt(LANE3_X, 495), PILE_N = Pt(LANE3_X, 499.2);
  s.Go("Luo", 0.4, 1.6, C1.x, C1.z, { move: "run", yawDeg: 180 });
  s.Key("Luo", 1.6, { faceTo: "player", clip: BECKON });
  const down = s.Say("LuoRunCalls.01", "Luo", 2.6);
  s.Key("Luo", down - 0.2, { clip: VIL.duck, clipHold: true, stance: "prone" });
  const S1 = Shell(s, down + 1.0, Pt(LANE_X - 5.0, 489.0), { shake: 1.0 });
  Shell(s, S1 + 0.6, Pt(104.0, 482.0), { shake: 0.9 });
  s.Caption(down + 0.2, 2.8, "（炮！趴倒！屏幕弹卧倒提示：趴不趴由玩家）");
  ["LiuWencai", "Squad1", "Squad3", "Squad2", "Escort1", "Escort2", "Yaowa", "HeYoutian"].forEach((id, k) => s.Key(id, down + 0.2 + k * 0.12, { clip: VIL.duck, clipHold: true, stance: "prone" }));
  s.Eye(1.0, down + 2.2 - 1.0, { stance: "stand", x: EYE0.x, z: EYE0.z, look: { actor: "Luo", offset: [0, 1.0, 0] }, shake: 0.4 });
  const up = s.Say("LuoRunCalls.02", "Luo", S1 + 2.0);
  s.Key("Luo", up - 0.2, { clip: null, stance: "stand", faceTo: "player" });
  ["LiuWencai", "Squad1", "Squad3", "Squad2", "Escort1", "Escort2", "Yaowa", "HeYoutian"].forEach((id, k) => s.Key(id, up + 0.3 + k * 0.1, { clip: null, stance: "stand" }));
  // 后送队的兵挨了弹片：腿一软跪倒（PvLegHitKneelClutch）；两人一边一个架着他跑（PvSupportWalkL / R + PvSupportedHop）
  s.Key("Escort2", S1 + 0.9, { clip: "PvLegHitKneelClutch", clipHold: true, stance: "stand" });
  s.Caption(S1 + 1.0, 2.8, "（后送队两个兵里一个挨了弹片，腿一软）");
  const lift = up + 1.4;
  s.Key("Escort2", lift, { clip: "PvSupportedHop" });
  s.Key("Escort1", lift, { x: LANE_X - 0.42, z: 485.2, move: "cut", yawDeg: 180, clip: "PvSupportWalkR" });
  s.Key("Squad2", lift, { x: LANE_X + 0.42, z: 485.2, move: "cut", yawDeg: 180, clip: "PvSupportWalkL" });
  s.Caption(lift + 0.2, 2.6, "（两人一边一个架着他跑）");
  // 全班顺胡同跑：第一道弯往东、往南到塌墙前（班长先到、回身招手：莫停！莫回头！这边！）
  const RUN0 = up + 0.8;
  const legTo = (id, pts, t0, mps = 3.2, extra = {}) => { let t = t0, cur = s.pos.get(id); for (const p of pts) { const d = Dist(cur, p); s.Go(id, t, t + d / mps, p.x, p.z, { move: "run", yawDeg: Yaw(cur, p), ...extra }); t = R(t + d / mps); cur = p; } return t; };
  const luoAt = legTo("Luo", [C2, PILE_N], RUN0, 3.4, { depart: { clip: null } });
  s.Key("Luo", luoAt, { faceTo: Pt(LANE_X, 495), clip: BECKON });
  const keep = s.Say("LuoRunCalls.03", "Luo", RUN0 + 1.6);
  const here = s.Say("LuoRunCalls.04", "Luo", luoAt + 0.3);
  ["LiuWencai", "Squad1", "Squad3", "Yaowa", "HeYoutian"].forEach((id, k) => legTo(id, [C1, C2, Pt(LANE3_X, 496.6 + k * 0.7)], RUN0 + 0.4 + k * 0.5, 3.2, { depart: { clip: null } }));
  for (const id of ["Escort2", "Escort1", "Squad2"]) { const dx = id === "Escort1" ? -0.42 : id === "Squad2" ? 0.42 : 0; legTo(id, [Pt(C1.x + dx, C1.z), Pt(C2.x + dx * 0.4, C2.z + 0.6), Pt(LANE3_X + dx * 0.6, 499.8)], RUN0 + 3.4, 1.4); }
  Shell(s, RUN0 + 2.4, Pt(LANE_X - 4.6, 497.0), { shake: 0.9 });
  Shell(s, RUN0 + 4.6, Pt(107.0, 503.0), { shake: 0.8 });
  // 顺子的眼睛跟着跑（在队中间）
  const eye1 = Pt(LANE_X, 490.6), eye2 = Pt(LANE_X, 494.6), eye3 = Pt(LANE3_X - 0.2, 495.0), eye4 = Pt(CLIMB_FROM.x, CLIMB_FROM.z);
  s.Creep(RUN0 + 0.8, 1.4, EYE0, eye1, { actor: "Luo", offset: [0, 1.0, 0] }, { h: 1.5, ease: "linear" });
  s.Creep(RUN0 + 2.2, 1.3, eye1, eye2, { actor: "Luo", offset: [0, 1.0, 0] }, { h: 1.5, ease: "linear" });
  s.Creep(RUN0 + 3.5, 1.4, eye2, eye3, { actor: "Luo", offset: [0, 1.0, 0] }, { h: 1.5, ease: "linear" });
  s.Caption(keep + 0.2, 2.6, "（莫停！莫回头！每个拐角他先到，回身招手）");
  // 前头一发砸塌院墙堵死胡同（LaneWallCollapse）：过不去！翻墙！—— 先踩墙根柴垛爬上墙头、翻进旁边院子、回身把人一个个拽上去
  const HIT = Math.max(here + 1.0, RUN0 + 6.0);
  Shell(s, HIT, Pt(SLN.collapse.wallX - 0.6, SLN.collapse.z), { shake: 1.0, radius: 4 });
  s.Signal(HIT + 0.1, SIG.laneWallCollapse, true);
  s.Sfx(HIT + 0.3, "dirtFall", { x: SLN.collapse.x, z: SLN.collapse.z, volume: 0.9 });
  s.Ev(HIT + 0.2, "smoke", { x: SLN.collapse.x, z: SLN.collapse.z, kind: "SmokeDust", dur: 10 });
  s.Caption(HIT + 0.4, 3.0, "（前头一发砸塌了院墙，倒进胡同里，堵死了）");
  const wall = s.Say("LuoRunCalls.05", "Luo", HIT + 1.4);
  s.Key("Luo", wall - 0.2, { clip: null, faceTo: PILE });
  s.Creep(RUN0 + 4.9, HIT + 2.4 - (RUN0 + 4.9), eye3, eye4, { actor: "Luo", offset: [0, 1.0, 0] }, { h: 1.5, ease: "linear" });
  // 翻墙（VilIjaClimbWall：墙面在根前 0.35 m、落在根前 1.05 m）：班长从柴垛西边 (CLIMB_FROM) 面朝东起播，播完切到墙那边 (CLIMB_TO)，回身拽人
  const CLIMB = wall + 0.6;
  s.Go("Luo", wall - 0.2, CLIMB - 0.1, CLIMB_FROM.x, CLIMB_FROM.z, { move: "run", yawDeg: -90 });
  s.Key("Luo", CLIMB, { clip: VIL.climbWall });
  s.Key("Luo", CLIMB + VilClipS(VIL.climbWall), { x: CLIMB_TO.x, z: CLIMB_TO.z, move: "cut", clip: null, stance: "crouch", yawDeg: 90 });
  s.Caption(CLIMB + 0.3, 3.2, "（班长踩着墙根的柴垛爬上墙头，翻进旁边院子，回身把人一个个拽上去）");
  s.Eye(HIT + 2.4, CLIMB + 6.0 - (HIT + 2.4), { stance: "crouch", x: P.x, z: P.z, look: PILE, pitch: 14, toLook: CLIMB_TO, toPitch: 30 });
  // 一个个翻过去（硬切到墙那边、再跑进院子）
  const climbers = ["LiuWencai", "Squad1", "Squad3", "Yaowa", "HeYoutian", "Escort2", "Escort1", "Squad2"];
  climbers.forEach((id, k) => {
    const t0 = CLIMB + VilClipS(VIL.climbWall) + 0.8 + k * 1.3;
    s.Go(id, t0 - 1.0, t0, CLIMB_FROM.x, CLIMB_FROM.z - 0.4 * (k % 2), { move: "run", depart: { clip: null }, yawDeg: -90 });
    s.Key(id, t0 + 1.0, { x: CLIMB_TO.x + 0.6, z: CLIMB_TO.z + 0.8, move: "cut", stance: "crouch", yawDeg: 180, clip: null });
    s.Go(id, t0 + 1.2, t0 + 3.0, DY_IN.x - 1.0 + (k % 3) * 0.9, DY_IN.z - 2.0 + Math.floor(k / 3) * 1.2, { move: "run", yawDeg: 180 });
  });
  Shell(s, CLIMB + 3.0, Pt(LANE3_X - 2.0, 491.0), { shake: 0.8 });
  Shell(s, CLIMB + 6.4, Pt(109.6, 497.0), { shake: 0.7 });
  // 顺子翻过去：眼睛硬切到院里；穿院子从西南角的院门出来接上胡同；班长：往那棵大槐树跑！过了槐树就是村口！
  const OVER = CLIMB + VilClipS(VIL.climbWall) + 0.8 + climbers.length * 1.3 + 1.0;
  s.Eye(OVER, 1.4, { stance: "crouch", x: CLIMB_TO.x + 0.6, z: CLIMB_TO.z + 1.0, look: DY_IN, pitch: -4 });
  s.Caption(OVER + 0.2, 2.6, "（顺子最后一个翻过去：穿院子，从那家西南角的院门出来接上胡同）");
  const gateIn = Pt(DY_GATE_OUT.x + 1.3, DY_GATE_OUT.z), laneBack = Pt(LANE3_X, DY_GATE_OUT.z), C4 = Pt(LANE3_X, 521), C5 = Pt(EXIT.x, 521);
  const luoGo = legTo("Luo", [DY_IN, gateIn, laneBack, C4, C5, Pt(EXIT.x, 536)], OVER - 2.0, 3.4, { depart: { clip: null, stance: "stand" }, stance: "stand" });
  climbers.forEach((id, k) => legTo(id, [gateIn, laneBack, C4, C5, Pt(EXIT.x, 538 + k * 0.8)], OVER + 0.6 + k * 0.5, id === "Escort2" || id === "Escort1" || id === "Squad2" ? 2.0 : 3.2));
  const eyeDY = [Pt(CLIMB_TO.x + 0.6, CLIMB_TO.z + 1.0), DY_IN, gateIn, laneBack, C4, C5, Pt(EXIT.x, 533), EXIT];
  let te = OVER + 1.4;
  for (let i = 1; i < eyeDY.length; i++) { const d = R(Dist(eyeDY[i - 1], eyeDY[i]) / 3.2); s.Creep(te, d, eyeDY[i - 1], eyeDY[i], i === eyeDY.length - 1 ? { x: BIG_LOCUST.x, z: BIG_LOCUST.z, h: 5 } : { actor: "Luo", offset: [0, 1.0, 0] }, { h: 1.5, ease: "linear" }); te = R(te + d); }
  Shell(s, OVER + 4.0, Pt(118.0, 507.0), { shake: 0.8 });
  Shell(s, OVER + 7.6, Pt(111.0, 519.0), { shake: 0.9 });
  Shell(s, OVER + 11.0, Pt(121.0, 526.0), { shake: 0.8 });
  const tree = s.Say("LuoRunCalls.06", "Luo", OVER + 8.0);
  s.Key("Luo", tree - 0.2, { clip: POINT_STAND, faceTo: BIG_LOCUST });
  s.Key("Luo", s.End("LuoRunCalls.06") + 0.3, { clip: null, yawDeg: 180 });
  s.Caption(tree + 0.3, 3.0, "（往那棵大槐树跑！过了槐树就是村口！村南口外东边那棵大槐树老远就看得见）");
  // 出村南口：后送队缩在路沟里等着；老耿的车在前头
  s.Caption(te - 1.0, 3.2, "（出了村南口：后送队缩在村口外的路沟里等着，老耿的车在前头。接 12）");
  void luoGo; void K5;
  return s.Done({ durationS: te + 2.0, then: "stay" });
}

export const SEQUENCE_BUILDERS = Object.freeze([
  S0601, S0602, S0603, S0701, S0702, S0703, S0704, S0801, S0802, S0803, S0804,
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
