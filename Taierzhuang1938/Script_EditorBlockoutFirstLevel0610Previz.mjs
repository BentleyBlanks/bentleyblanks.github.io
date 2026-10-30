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
// 第九版（2026-10-24，Notion 07–10 新稿）：
//   · 07-4 末直起腰先看庄子（冒烟的都在东头 x > 110，枪声和听不清的日本话也从东头来：ijaShoutFar 用现成的日语录音），再切一个定镜朝东北角看离了大路斜穿麦地的那几个鬼子（≤ 120 m）；
//   · 08-1 村民从东头顺路沟北沿跑来，东北角土炮楼墙后一梭子追着他脚后跟（落点都在沟北沿以北），他扑进沟东半截爬到坡道边说「东头……」边说边往东指；
//     两个村民从后门溜进沟时班长看了那道后门一眼；巷子那边不再有人跑出来；
//   · 08-2 班长先扭头朝东看一眼（视线到东北角刚才开枪的墙角再落回来）；最后一句改短「……日他妈。打！给老子把那个枪眼压到！」；
//   · 08-3 末机枪扫到沟里、妮儿身边的伤兵中枪（原来在 08-4 开头）；班长四人不往大车摸；
//   · 08-4 班长瞄一眼后门一句话定计（有田穿院子、顺儿走巷子、哪个先到哪个先打）→ 班长带何有田、Escort1 爬上南沿钻路沟后门进 EM1，Escort2 补顺子的射击位 →
//     顺子顺沟南沿爬进巷子（刘文财「让他一个人走？……」→「闭嘴！压到枪眼！」）→ 交还操作 → 身后妮儿趁乱溜出沟跟进巷子（老耿喊、被幺娃拽回；只听得见）→ 跑了一个；
//   · 09-1 顺子直着拐进往西那条死胡同被瓦砾堵死，妮儿从后头追上来拽衣角（VilClingHem）、摇头、攥住他的手往南带；
//   · 班长那一路改走：后门 → EM1 → EM1 / EM2 豁口 → EM2 西边空地 → 柴垛人梯 → EM3 → 南门后（09-2 起照旧）；10-1 坡道上四个（含 Escort2）冲上来，大车后头没人。
//
// 第十版（2026-10-30，用户当天定的剧本）：
//   · 07-4 末东北角定镜之后再给一条定镜看更远：东北道尽头一长溜人马往这边来（ColumnIja1…10 + 驮炮的骡马 PackMule1…3，扬着土）——大队；
//   · 08-3 死第一个人：坡道上 Squad3 冒头久了被枪眼一梭打死；拍末机枪扫进沟打倒担架员 Bearer01 和妮儿身边的伤兵 Walker04，沟里「又打着一个！」；
//     墙角一个鬼子横过路口往东跑（「跑了一个」从 08-4 挪到这儿），班长「喊人去了。要赶在他们的人来之前，把那个枪眼端了！」；
//   · 08-4 班长招手叫拢、一口气定计（枪眼只朝前打，屁股后头是空的；有田穿院子；文财跟顺儿走巷子；摸到屁股后头之前哪个都不准放枪）→ 冲坡道「幺娃，你们打一阵歇一阵……」
//     → 刘文财「……晓得」；刘文财跟顺子一起顺沟南沿爬进巷子；坡道上只剩幺娃和 Escort2 两个换窝；「让他一个人走」「闭嘴」删了；
//   · 09 / 10 见各段头上的注（刘文财一路在顺子身边；09-4 门房一刀；09-7 北屋端枪眼 + 墙角同时；10 死 Escort2 / 担架员、顺子被炮掀翻）。
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
  L0610_SOUTH_LANE as SLN, L0610_DITCH as DT, L0610_EAST_YARD_ROUTE as EYR, L0610_MOUTH_SHOOTERS, LanePointAtZ, PointBeside, LineLength, Station,
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
  /**
   * 第一人称蹲着 / 走着挪一段（镜头从 a 平移到 b，一直看着 look）：用 Cam 顶替眼睛的位移。
   * look 落在终点 b 上（「走到哪看哪」）时改看 b 再往前 8 m：不然切镜一切到落幅，机位就悬在看的那个点正上方，画面直直朝下（10-23 用户：不明所以的俯视镜头）。
   */
  Creep(t, dur, a, b, look, { h = 1.05, lookH = 1.0, fov, shake, ease = "inOut" } = {}) {
    let L = look.actor ? look : { ...look, h: lookH };
    if (!look.actor && Math.hypot(look.x - b.x, look.z - b.z) < 1.5) {
      const dx = b.x - a.x, dz = b.z - a.z, n = Math.hypot(dx, dz) || 1;
      L = { x: b.x + (dx / n) * 8, z: b.z + (dz / n) * 8, h: lookH };
    }
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
function MouthFire(s, t, { volume = 1, who = ["Yaowa", "Escort2"] } = {}) {   // 第十版（10-30）缺省：08-4 起坡道上只剩幺娃和 Escort2（Squad3 死了、刘文财跟顺子走巷子）；08-3 自己传 who
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
  const RUN0 = FREE1, RUN1 = FREE1 + 7.2, STAND = RUN1, FAR0 = STAND + 4.8, RUN2 = FAR0 + 2.8;   // 第十版：东北角定镜之后再看 2.8 s 更远的那一长溜
  const runTo = (id, to, t0, t1, extra = {}) => { const r = Route(s.pos.get(id), to); s.Go(id, t0, t1, r.end.x, r.end.z, { move: "run", path: r.path, depart: { stance: "crouch", clip: null }, stance: "crouch", ...extra }); };
  runTo("Luo", LZ(357, 0.3), RUN0, RUN0 + 6.6); runTo("Officer", LZ(356, -0.6), RUN0 + 0.3, RUN0 + 6.9);
  ["LiuWencai", "Yaowa", "HeYoutian", "Squad1", "Squad2", "Squad3"].forEach((id, k) => runTo(id, LZ(351 - k * 1.6, k % 2 ? 0.5 : -0.5), RUN0 + 0.6 + k * 0.2, RUN0 + 7.0 + k * 0.2));
  s.Caption(RUN0 + 0.4, 3.0, "（全班弯腰顺着凹路往前跑，老耿赶着车跟在后头。凹路越走越浅，土坎只剩齐腰高）");
  const eye1 = LZ(354, 0.6);
  s.Creep(RUN0, RUN1 - RUN0, Pt(P74.x, P74.z), eye1, LOOK_LUO, { h: 1.05, ease: "linear", fov: 58 });
  s.Go("GengCart", RUN0 + 1.6, RUN1 + 0.6, LZ(345, 0.3).x, LZ(345, 0.3).z, { move: "walk", speed: 1.6 });
  s.Go("Geng", RUN0 + 1.6, RUN1 + 0.6, LZ(347, -1.3).x, LZ(347, -1.3).z, { move: "walk", depart: { stance: "stand", clip: null } });
  s.Go("Nier", RUN0 + 2.0, RUN1 + 0.8, LZ(343.5, 0.8).x, LZ(343.5, 0.8).z, { move: "walk", depart: { stance: "stand", clip: null } });
  // 末段（第九版 10-24）：班长先直起腰往前看，顺子跟着直起来（眼高 1.62）：先看庄子——冒烟的都在东头（东边几座塌了角的房、一两处草顶着火），枪声也从东头一阵一阵传来，
  // 夹着听不清的日本话；再切一个定镜朝东北角：道上最后几个鬼子离了大路，弯着腰斜穿麦地往土炮楼那边钻（≤ 120 m，画面里认得出是人）
  s.Key("Luo", STAND - 0.6, { stance: "stand" });
  s.Caption(STAND - 0.4, 2.6, "（凹路浅了。班长直起腰往前看，顺子跟着直起来）");
  const eye2 = LZ(369, 0.6);
  const EAST_SMOKE = [[186, 443], [170, 424.5], [224, 443], [205, 447]];   // 东头塌了角的房（EN3a / NE6a / EN4）和一处着火的草顶：都在主街以东
  const GROUP = Pt(216.0, 367.0);                                           // 东北角那伙鬼子的中心（RoadIja1…4 的关键帧位置）
  const LOOK_EAST = { x: 186, z: 440, h: 4.0 };
  s.Cam(STAND, 2.6, { from: { ...eye1, h: 1.62 }, to: { ...eye2, h: 1.62 }, look: { x: 100, z: 468, h: 2.6 }, lookTo: LOOK_EAST, ease: "linear", fov: 60 });
  s.Cam(STAND + 2.6, FAR0 - STAND - 2.6, { from: { ...eye2, h: 1.62 }, look: { x: GROUP.x, z: GROUP.z, h: 1.0 }, fov: 50 });   // 定镜：朝东北角看他们（fov 50，切镜模式下就是这一幅）
  // 第十版（10-30）：再往远看——东北道尽头 (300,320) 再往东北那一长溜人马（关键帧 ColumnIja1…10 + PackMule1…3），扬着土，有骡马驮着炮：大队。
  // 定镜 fov 42 看 (305,310)（离眼睛二百多米；说明里的五六百米在场景边界内摆不下）。整段他们顺着道往西南慢慢挪（1.4 m/s）
  const FAR_LOOK = { x: 305, z: 310, h: 1.5 };
  s.Cam(FAR0, RUN2 - FAR0, { from: { ...eye2, h: 1.62 }, look: FAR_LOOK, fov: 42 });
  s.Caption(FAR0 + 0.2, 2.6, "（再往远看：东北那条道尽头一长溜人马往这边来，扬着土，有骡马驮着炮——大队）");
  { const col = ctx.config.keyframes.find(k => k.id === "07-4").units.filter(u => /^(ColumnIja\d+|PackMule\d)$/.test(u.id));
    const dir = { x: -0.394, z: 0.919 };   // 道的走向（往西南、往庄子）
    col.forEach((u, k) => { const d = 12; s.Go(u.id, 0.4 + (k % 4) * 0.3, RUN2 + 2.4, u.x + dir.x * d, u.z + dir.z * d, { move: "walk", yawDeg: Yaw(u, { x: u.x + dir.x, z: u.z + dir.z }) }); });   // 整段挪 12 m（停停走走的大队，不走进 08 那三个远远走着的那一截）
    s.Ev(0, "smoke", { x: 304.5, z: 311, kind: "SmokeDust", dur: RUN2 + 6, scale: 2 });   // 脚下扬的土
  }
  for (const [x, z] of EAST_SMOKE) s.Ev(0, "smoke", { x, z, kind: "SmokeBlack", dur: RUN2 + 6, scale: 3 });   // 白盒简易烟放大 3 倍：冒到十六七米，从凹路口隔着村墙和东头的房子也看得见
  s.Caption(STAND + 0.3, 2.4, "（麦地那头就是耿家庄。冒烟的都在东头：东边几座塌了角的房，一两处草顶着了火；枪声也从东头一阵一阵传来，夹着听不清的日本话）");
  s.Caption(STAND + 2.8, 3.0, "（东北角：道上最后几个鬼子离了大路，弯着腰斜穿麦地往土炮楼那边钻——占了老耿家那伙的尾巴，一百多米）");
  WindowBurst(s, STAND + 0.8, { volume: 0.5, muzzle: false });
  s.Sfx(STAND + 0.4, "rifleShot", { x: 186, z: 455, volume: 0.45 });
  s.Sfx(STAND + 1.2, "ijaShoutFar", { x: 192, z: 452, volume: 0.35 });
  s.Sfx(STAND + 2.3, "rifleVolley", { x: 170, z: 440, volume: 0.4 });
  s.Sfx(STAND + 3.6, "ijaShoutFar", { x: 176, z: 462, volume: 0.3 });
  s.Sfx(STAND + 4.4, "rifleShot", { x: 200, z: 448, volume: 0.4 });
  // 东北角那四个整段都在弯着腰往土炮楼挪（每人往东南挪 5–6 m，仍在 ≤ 120 m 那一片里）
  ["RoadIja1", "RoadIja2", "RoadIja3", "RoadIja4"].forEach((id, k) => { const cur = s.pos.get(id); const to = Pt(cur.x + 3.6, cur.z + 4.4); s.Go(id, 0.6 + k * 0.5, RUN2 + 3.6 - k * 0.3, to.x, to.z, { move: "walk", stance: "crouch", faceTo: Pt(226.5, 386) }); });
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
  void RoadPointAtX;
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
  const s = new Seq(ctx, "08-1", "村口：枪眼里的机枪顺着街扫，东头跑来的村民挨了一梭子扑进沟");
  const K = id => KU(ctx, "08-1", id);
  // 五个村民（第五版 10-21，用户：笔直的主街对着机枪不可能跑掉，活下来的走岔路；第九版 10-24：巷子那边不再有人，Villager1 改从东头来）：
  //   Villager2 / 3 从主街东边 z 432.5 那道院门冲上主街往北跑，被堂屋枪眼里的机枪打倒；
  //   Villager1 从庄子东北角跑出来（北墙根外的麦地），顺北墙、路沟北沿往西跑，东北角土炮楼墙后冒出一个鬼子（NeCornerIja）打来一梭子——土在他脚后跟溅起一串、不往沟里打——
  //   他扑进路沟东半截、手脚并用爬到坡道边，冲班长喘着说「东头……」、边说边往东指；Villager4 / 5 从路沟后门出来，直接下到沟东半截缩进后送队，班长看了那道后门一眼。
  //   起点都照关键帧的来路（path[0]）。
  const Start = id => K(id).path[0];
  const RUN = 2.9;   // VilPanicRun 的参考速度 2.89 m/s
  const RunAlong = (id, t0, pts, extra = {}) => { const len = RouteLen(s.pos.get(id), pts); const end = pts[pts.length - 1]; return s.Go(id, t0, R(t0 + len / RUN), end.x, end.z, { move: "run", path: pts.slice(0, -1), ...extra }); };
  for (const id of ["Villager1", "Villager2", "Villager3", "Villager4", "Villager5"]) { const p = Start(id); s.Place(id, 0, p.x, p.z, { state: "alive", stance: "stand", yawDeg: K(id).path.length > 1 ? Yaw(p, K(id).path[1]) : 0, clip: VIL.panic }); }
  const corner = UP(K("NeCornerIja"));
  s.Place("NeCornerIja", 0, corner.x + 1.6, corner.z + 1.6, { stance: "crouch", aim: false, yawDeg: 90, visible: false });   // 先缩在土炮楼西北角的墙后头
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
  s.Eye(2.4, 1.0, { stance: "prone", yaw: 180, pitch: -1, toLook: fall3, toPitch: -1 });
  s.Eye(t2 - 0.6, 0.8, { stance: "prone", look: fall3, pitch: -1, toLook: fall2, toPitch: -1 });
  const v4 = UP(K("Villager4"));
  s.Eye(t2 + 1.4, 1.0, { stance: "prone", look: fall2, pitch: -1, toLook: v4, toPitch: -6 });
  s.Caption(t2 + 1.6, 3.0, "（右手边：北边院子朝沟的后门里钻出来的两个，已经溜下沟、缩进后送队里。班长看了那道后门一眼——记住了）");
  s.Key("Luo", t2 + 1.6, { faceTo: Pt(EYR.backGate.x, EYR.backGate.z) });
  s.Key("Luo", t2 + 4.2, { faceTo: LOOPHOLE });
  // 东头：一个村民从庄子东北角跑出来（六七十米外），顺北墙根、路沟北沿往西跑；东北角土炮楼墙后冒出一个鬼子打来一梭子，土在他脚后跟溅起一串（都在沟北沿以北）
  const v1 = UP(K("Villager1")), v1Path = K("Villager1").path;
  const RUN1_T0 = t2 + 4.4;
  s.Eye(t2 + 4.4, 1.0, { stance: "prone", look: v4, pitch: -6, toLook: { x: v1Path[0].x, z: v1Path[0].z, h: 0.8 }, toPitch: 0 });
  s.Caption(RUN1_T0 + 0.2, 3.0, "（东头：一个村民从庄子东北角跑出来，六七十米外，顺着北墙根、路沟北沿往西跑）");
  RunAlong("Villager1", RUN1_T0, [...v1Path.slice(1, -1), v1Path.at(-1)], { yawDeg: Yaw(v1Path[v1Path.length - 2], v1Path.at(-1)) });
  const t1 = s.pos.get("Villager1").t;
  const len1 = RouteLen(v1Path[0], v1Path.slice(1));
  const AtFrac = f => { const want = len1 * f; let acc = 0, cur = v1Path[0]; for (const p of v1Path.slice(1)) { const d = Dist(cur, p); if (acc + d >= want) { const k = (want - acc) / d; return Pt(cur.x + (p.x - cur.x) * k, cur.z + (p.z - cur.z) * k); } acc += d; cur = p; } return v1Path.at(-1); };
  const BURST = RUN1_T0 + 1.6;
  s.Key("NeCornerIja", BURST - 1.0, { x: corner.x, z: corner.z, move: "cut", visible: true, stance: "crouch", aim: true, yawDeg: K("NeCornerIja").yawDeg });
  s.Ev(BURST, "muzzle", { actor: "NeCornerIja", count: 6, interval: 0.11 });
  s.Sfx(BURST, "mgBurstFar", { x: corner.x, z: corner.z, volume: 0.55 });
  for (const [k, f] of [0.26, 0.3, 0.34, 0.39].entries()) { const p = AtFrac(f); Puff(s, BURST + 0.25 + k * 0.14, Pt(p.x + 1.2, Math.min(p.z + 0.5, 377.6))); }   // 落点都在沟北沿以北、他身后一两步
  s.Caption(BURST + 0.1, 3.0, "（东北角土炮楼的墙后冒出一两个鬼子，打来一梭子：土在他脚后跟溅起一串。不往沟里打）");
  s.Key("NeCornerIja", BURST + 1.2, { x: corner.x + 1.6, z: corner.z + 1.6, move: "cut", visible: false });
  s.Caption(BURST + 2.4, 2.2, "（那人露一下就缩回墙后头，不再出来）");
  s.Eye(RUN1_T0 + 1.0, BURST + 0.4 - (RUN1_T0 + 1.0), { stance: "prone", look: { x: v1Path[0].x, z: v1Path[0].z, h: 0.8 }, toLook: { x: corner.x, z: corner.z, h: 1.0 } });
  s.Eye(BURST + 0.4, 1.0, { stance: "prone", look: { x: corner.x, z: corner.z, h: 1.0 }, toLook: { actor: "Villager1", offset: [0, 0.9, 0] } });
  s.Eye(BURST + 1.4, t1 + 0.6 - (BURST + 1.4), { stance: "prone", look: { actor: "Villager1", offset: [0, 0.9, 0] } });
  // 扑进路沟东半截，手脚并用爬到坡道边（关键帧的位置）；冲班长说，边说边往东指
  const dive = v1Path[v1Path.length - 2];
  const tDive = R(RUN1_T0 + RouteLen(v1Path[0], [...v1Path.slice(1, -1)]) / RUN);
  s.Key("Villager1", tDive - 0.2, { clip: VIL.duck, clipHold: true, stance: "prone" });
  s.Caption(tDive, 2.4, "（他扑进路沟东半截）");
  s.Key("Villager1", t1 + 0.4, { stance: "crouch", faceTo: "Luo", clip: null });
  s.Caption(t1 + 0.6, 2.6, "（手脚并用爬到坡道边，冲班长喘着说）");
  s.Key("Villager1", t1 + 1.6, { clip: POINT_CROUCH, faceTo: Pt(180, 384) });
  s.Key("Villager1", t1 + 1.9, { faceTo: "Luo" });
  s.Say("VillageMouth.01", "Villager1", t1 + 2.0);
  s.Key("Villager1", s.End("VillageMouth.01") + 0.6, { clip: VIL.crouch, faceTo: Pt(v1.x, v1.z - 3) });
  s.Caption(s.End("VillageMouth.01") + 0.2, 2.4, "（边说边往东指。他之后跟着后送队一起走）");
  s.Eye(t1 + 0.6, 1.0, { stance: "prone", look: { actor: "Villager1", offset: [0, 0.9, 0] }, toLook: v1, toPitch: -10 });
  void dive;
  // 老耿盯着那个枪眼，半天才说出来（第四版只有一句）
  const geng = UP(K("Geng"));
  s.Key("Geng", 0, { faceTo: LOOPHOLE });
  s.Eye(s.End("VillageMouth.01") + 0.8, 1.2, { stance: "prone", look: v1, pitch: -10, toLook: geng, toPitch: -4 });
  const home = s.Say("GengHome.01", "Geng", s.End("VillageMouth.01") + 2.2);
  s.Caption(home + 0.2, 2.6, "（老耿盯着那个枪眼。那是他家）");
  s.Eye(s.End("GengHome.01") + 0.4, 1.2, { stance: "prone", look: geng, pitch: -4, toLook: LOOPHOLE, toPitch: -1 });
  WindowBurst(s, s.End("GengHome.01") + 1.0, { volume: 0.8, puffAt: Pt(99.6, 388) });
  WindowBurst(s, t2 + 5.2, { volume: 0.8, puffAt: Pt(100.2, 389) });
  RoadWalk(s, ["RoadIja5", "RoadIja6", "RoadIja7"], 1.0, s.End("GengHome.01") + 3.0, { alongM: 12 });
  return s.Done({ durationS: s.End("GengHome.01") + 3.6 });
}

function S0802(ctx) {
  const s = new Seq(ctx, "08-2", "绕不过去：东边走不得、河汊子、东墙外头那条小胡同、等天黑、打");
  const K = id => KU(ctx, "08-2", id);
  const geng = UP(K("Geng")), officer = UP(K("Officer")), luo = UP(K("Luo")), medic = UP(K("Medic"));
  const NE_CORNER = { x: 226.6, z: 386.5, h: 1.0 };   // 08-1 东北角打那一梭子的墙角（土炮楼西北角外）
  // 第九版（10-24）：班长先扭头朝东看一眼，默认视线跟着他看到东北角刚才开枪的墙角、再落回来，然后才说「东边是狗日的来的路」；再扭头问老耿西边
  s.Key("Luo", 0, { faceTo: Pt(NE_CORNER.x, NE_CORNER.z), clip: TALK_CROUCH });
  s.Eye(0, 0.8, { stance: "prone", look: luo, pitch: 4 });
  s.Eye(0.8, 1.6, { stance: "prone", look: luo, pitch: 4, toLook: NE_CORNER });
  s.Caption(1.0, 3.0, "（班长扭头朝东看了一眼。顺子跟着看：东北角刚才打枪的那个墙角，现在没人；道上远远还有两三个鬼子在往庄里走）");
  s.Eye(2.4, 1.4, { stance: "prone", look: NE_CORNER, toLook: luo, toPitch: 4 });
  const east = s.Say("NoWayAsk.01", "Luo", 3.6);
  const ask = s.Say("NoWayAsk.02", "Luo", s.End("NoWayAsk.01") + 1.6);
  s.Key("Luo", ask - 0.3, { faceTo: "Geng" });
  s.Key("Geng", ask + 0.6, { faceTo: "Luo" });
  void east;
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
  // 班长盯着枪眼啐了一口：打！给老子把那个枪眼压到！（第九版改短：不点名、不分人）
  s.Eye(s.End("DecideMedic.01") + 0.2, 1.0, { stance: "prone", look: medic, pitch: 3, toLook: luo, toPitch: 4 });
  s.Key("Luo", s.End("DecideMedic.01") + 0.3, { faceTo: LOOPHOLE });
  s.Caption(s.End("DecideMedic.01") + 0.6, 2.4, "（班长盯着枪眼，啐了一口）");
  const order = s.Say("DecideLuo.01", "Luo", s.End("DecideMedic.01") + 2.4);
  s.Key("Luo", order + 1.2, { faceTo: LOOPHOLE, clip: POINT_CROUCH });
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
  const s = new Seq(ctx, "08-3", "压枪眼：死了第一个人；机枪扫进沟；跑了一个、喊人去了");
  const K = id => KU(ctx, "08-3", id);
  const P = KP(ctx, "08-3");
  const RIM = Pt(P.x + 0.8, P.z + 1.2);           // 机枪打沟沿时土溅在顺子旁边
  // 班长、何有田、两个兵从沟底街口西边挪到坡道脚下蹲着（关键帧 08-3 的位置），不往前
  for (const id of ["Luo", "HeYoutian", "Escort1", "Escort2"]) { const u = KU(ctx, "08-2", id); s.Place(id, 0, u.x, u.z, { stance: "crouch", yawDeg: 180 }); s.Go(id, 0.6, 2.4, K(id).x, K(id).z, { move: "run", stance: "crouch", yawDeg: K(id).yawDeg }); }
  // 开场三个都活着趴在射击位上（关键帧 08-3 里 Squad3 已经倒了：这一段演他怎么倒的）
  const squad3 = UP(K("Squad3"));
  s.Place("Squad3", 0, squad3.x, squad3.z, { stance: "prone", aim: true, state: "alive", yawDeg: 180 });
  const bearer1 = UP(K("Bearer01")), hurt = UP(K("Walker04")), nier = UP(K("Nier"));
  s.Place("Bearer01", 0, bearer1.x, bearer1.z, { stance: "crouch", state: "alive", yawDeg: -60 });
  s.Place("Walker04", 0, hurt.x, hurt.z, { stance: "crouch", state: "alive", yawDeg: 160 });
  s.Key("Nier", 0, { stance: "crouch", yawDeg: 135, clip: VIL.crouch });
  s.Place("CornerIja2", 0, K("CornerIja2").path[0].x, K("CornerIja2").path[0].z, { stance: "crouch", yawDeg: 0 });
  s.Eye(0, 19.0, { stance: "prone", yaw: 180, pitch: -1, shake: 0.05 });
  s.Caption(0.3, 3.0, "（趴在沟沿上朝枪眼打。班长带何有田和后送队的两个兵蹲在坡道脚下等着：枪眼压住了他们才往前摸）");
  // 玩家打一阵、停一下（换弹）：这边一打，枪眼就回一梭打沟沿；一停火，机枪就去找街上别的目标
  const fire = [[0.8, 3], [5.6, 3], [12.0, 4], [19.4, 3], [27.0, 4], [34.0, 3]];
  for (const [t, n] of fire) {
    Shot(s, t, "player", { count: n, interval: 0.6 }); MouthFire(s, t + 0.4, { who: t < 20 ? ["Yaowa", "LiuWencai", "Squad3"] : ["Yaowa", "LiuWencai"] });
    WindowBurst(s, t + 2.2, { volume: 0.9, puffAt: RIM });
  }
  s.Caption(9.0, 3.4, "（换弹——玩家一停火，机枪就掉头往街上扫。这一段教会玩家：这边一打，枪眼就回一梭）");
  WindowBurst(s, 10.2, { volume: 0.9, puffAt: Pt(101.4, 404) });
  s.Caption(14.0, 3.2, "（0.5 m 厚的墙上 0.3 m 的洞：机枪只能朝正面打，射界只罩得住主街和这道坡）");
  // ① 第十版（10-30）约 20 s：Squad3 冒头冒得久了——抬起身子连打两枪没趴回去，枪眼一梭打在他身上，脸朝下栽回沟里，没再动。我们死的第一个人
  const UP3 = 19.6;
  s.Key("Squad3", UP3, { stance: "crouch", aim: true, faceTo: LOOPHOLE });
  Shot(s, UP3 + 0.5, "Squad3", { count: 2, interval: 0.7 });
  s.Eye(UP3 + 0.4, 1.0, { stance: "prone", yaw: 180, pitch: -1, toLook: squad3, toPitch: 1 });
  const HIT3 = R(UP3 + 2.4);
  WindowBurst(s, HIT3, { volume: 1.0, count: 7 });
  Puff(s, HIT3 + 0.3, Off(squad3, -0.5, 0.4)); Puff(s, HIT3 + 0.45, Off(squad3, 0.4, -0.3));
  s.Key("Squad3", HIT3 + 0.5, { clip: "ShotCollapse", clipHold: true, aim: false });
  s.Sfx(HIT3 + 0.9, "bodyFall", squad3);
  s.Key("Squad3", HIT3 + 1.9, { state: "down", clip: null, stance: "prone", yawDeg: 180 });
  s.Eye(UP3 + 1.4, HIT3 + 2.4 - (UP3 + 1.4), { stance: "prone", look: squad3, pitch: 1 });
  s.Caption(HIT3 + 0.6, 3.6, "（坡道上那个兵冒头冒得久了，一梭子过来，脸朝下栽回沟里，没再动——这一段我们死的第一个人）");
  s.Eye(HIT3 + 2.4, 1.0, { stance: "prone", look: squad3, pitch: 1, toYaw: 180, toPitch: -1 });
  s.Eye(HIT3 + 3.4, 40 - (HIT3 + 3.4), { stance: "prone", yaw: 180, pitch: -1, shake: 0.05 });
  WindowBurst(s, 29.0, { volume: 0.9, puffAt: Pt(98.6, 398) });
  s.Caption(30.6, 2.6, "（班长四人蹲在坡道脚下没动，等着）");
  // ② 拍末：机枪回过来一梭扫进路沟东半截——一个抬担架的倒在杠子边，妮儿身边的伤兵中枪，血溅了她一脸；沟里有人喊「又打着一个！」
  const sweep = 36.6;
  WindowBurst(s, sweep, { volume: 1.0, count: 9 });
  Puff(s, sweep + 0.3, Pt(101.8, 383.6)); Puff(s, sweep + 0.5, Off(hurt, 0.4, 0.3)); Puff(s, sweep + 0.8, Off(bearer1, 0.5, -0.3));
  s.Key("Walker04", sweep + 0.6, { clip: "ShotCollapse", clipHold: true });
  s.Key("Walker04", sweep + 2.0, { state: "down", clip: null, yawDeg: 160 });
  s.Sfx(sweep + 0.7, "bodyFall", hurt);
  s.Key("Bearer01", sweep + 0.9, { stance: "stand", clip: "ShotCollapse", clipHold: true });
  s.Key("Bearer01", sweep + 2.3, { state: "down", clip: null, yawDeg: -60 });
  s.Sfx(sweep + 1.0, "bodyFall", bearer1);
  s.Key("Nier", sweep + 1.2, { clip: VIL.cower, faceTo: hurt });
  s.Eye(sweep - 0.2, 1.0, { stance: "prone", yaw: 180, pitch: -1, toLook: hurt, toPitch: 2 });
  s.Eye(sweep + 0.8, 1.6, { stance: "prone", look: hurt, pitch: 2, toLook: bearer1, toPitch: 2 });
  s.Eye(sweep + 2.4, 2.4, { stance: "prone", look: bearer1, pitch: 2, toLook: nier, toPitch: 2 });
  s.Caption(sweep + 0.6, 3.6, "（机枪回过来一梭扫进沟东半截：一个抬担架的倒在杠子边；妮儿身边一个伤兵中枪，血溅了她一脸。她缩在沟底不动了）");
  const cry = s.Say("DitchHit.01", "Walker06", sweep + 2.6);
  s.Key("Walker06", cry - 0.2, { faceTo: bearer1 });
  // ③ 墙角一个鬼子猫着腰横过路口往东跑（先横过主街的口子，幺娃看得见那 1–2 s）：幺娃「跑了一个！」→ 班长「喊人去了……」（第十版：从 08-4 挪过来）
  const rp = K("CornerIja2").path;
  const tr0 = R(s.End("DitchHit.01") + 1.0);
  let tr = tr0;
  for (let i = 1; i < rp.length; i++) { const d = Dist(s.pos.get("CornerIja2"), rp[i]); s.Go("CornerIja2", tr, tr + d / 4.0, rp[i].x, rp[i].z, { move: "run", yawDeg: Yaw(rp[i - 1], rp[i]) }); tr = R(tr + d / 4.0); }
  const seenT = R(tr0 + Dist(rp[0], rp[1]) / 4.0);
  s.Eye(seenT - 0.4, 0.8, { stance: "prone", look: nier, pitch: 2, toYaw: 180, toPitch: -1 });
  s.Eye(seenT + 0.4, 3.0, { stance: "prone", yaw: 180, pitch: -1 });
  const ran = s.Say("RunnerEast.01", "Yaowa", seenT + 0.6);
  s.Key("Yaowa", seenT + 0.3, { aim: false, faceTo: rp[2] });
  s.Key("Yaowa", s.End("RunnerEast.01") + 0.4, { aim: true, faceTo: LOOPHOLE });
  s.Caption(seenT + 0.4, 3.0, "（墙角一个鬼子猫着腰横过街口、往东街跑了）");
  s.Go("CornerIja2", tr, tr + 6.0, 140, ST.east.c, { move: "run", yawDeg: -90 });
  s.Key("CornerIja2", tr + 6.2, { visible: false });
  const luo = UP(K("Luo"));
  const help = s.Say("LuoBeforeHelp.01", "Luo", s.End("RunnerEast.01") + 0.5);
  s.Key("Luo", help - 0.3, { faceTo: Pt(MG_AT.x, 440), clip: TALK_CROUCH, talking: true });
  s.Key("Luo", s.End("LuoBeforeHelp.01") + 0.3, { talking: false, clip: null, faceTo: LOOPHOLE });
  s.Eye(help - 0.4, 0.8, { stance: "prone", yaw: 180, pitch: -1, toLook: luo, toPitch: 3 });
  s.Eye(help + 0.4, s.End("LuoBeforeHelp.01") + 0.6 - (help + 0.4), { stance: "prone", look: luo, pitch: 3 });
  s.Caption(help + 0.2, 3.6, "（班长：喊人去了。要赶在他们的人来之前，把那个枪眼端了！）");
  s.Eye(s.End("LuoBeforeHelp.01") + 0.6, 1.4, { stance: "prone", look: luo, pitch: 3, toYaw: 180, toPitch: -1 });
  void ran;
  return s.Done({ durationS: s.End("LuoBeforeHelp.01") + 2.2 });
}

function S0804(ctx) {
  const s = new Seq(ctx, "08-4", "班长定计·分三拨：有田穿院子、文财跟顺儿走巷子、坡道上压枪眼；妮儿趁乱跟进巷子");
  const K = id => KU(ctx, "08-4", id), K3 = id => KU(ctx, "08-3", id);
  const P = KP(ctx, "08-4"), P3 = KP(ctx, "08-3");
  const nier0 = UP(K3("Nier")), geng0 = UP(K3("Geng"));
  const BACK_GATE = Pt(EYR.backGate.x, EYR.backGate.z);
  // 开场：都还是 08-3 末的样子——顺子趴在坡道上；妮儿缩在车尾一动不动（身边的伤兵刚中枪）；老耿站着；班长四人蹲在坡道脚下；幺娃、刘文财趴着压枪眼；
  // Squad3 的尸体趴在他的射击位上、沟里倒着担架员和伤兵（第十版 10-30）
  s.Place("Nier", 0, nier0.x, nier0.z, { stance: "crouch", yawDeg: 135, clip: VIL.cower });
  s.Place("Geng", 0, geng0.x, geng0.z, { stance: "stand", faceTo: LOOPHOLE });
  for (const id of ["Walker04", "Bearer01", "Squad3"]) { const u = K(id); s.Place(id, 0, u.x, u.z, { state: "down", yawDeg: u.yawDeg, ...(id === "Squad3" ? { stance: "prone" } : {}) }); }
  for (const id of ["Yaowa", "LiuWencai"]) { const u = K3(id); s.Place(id, 0, u.x, u.z, { stance: "prone", aim: true, yawDeg: u.yawDeg }); }
  for (const id of ["Luo", "HeYoutian", "Escort1", "Escort2"]) { const u = K3(id); s.Place(id, 0, u.x, u.z, { stance: "crouch", aim: false, yawDeg: u.yawDeg }); }
  s.Eye(0, 1.2, { stance: "prone", x: P3.x, z: P3.z, yaw: 180, pitch: -1 });
  Shot(s, 0.4, "player", { count: 2, interval: 0.6 });
  // ① 班长瞄了一眼那道后门，招手把人叫拢，压着嗓子一口气说完：枪眼只朝前打，屁股后头是空的；有田穿院子；文财跟顺儿走巷子；摸到屁股后头之前哪个都不准放枪
  const luo0 = UP(K3("Luo"));
  s.Key("Luo", 0.8, { faceTo: BACK_GATE });
  s.Caption(0.9, 2.2, "（班长瞄了一眼东边那道后门，招手把人叫拢）");
  s.Eye(1.2, 1.0, { stance: "prone", x: P3.x, z: P3.z, yaw: 180, pitch: -1, toLook: luo0, toPitch: 3 });
  s.Key("Luo", 1.6, { faceTo: "player", clip: BECKON });
  const plan = s.Say("LuoSplitsUp.01", "Luo", 2.8);
  s.Key("Luo", plan - 0.3, { faceTo: "player", clip: TALK_CROUCH, talking: true });
  s.Key("Luo", plan + 3.0, { faceTo: "HeYoutian", clip: POINT_CROUCH });        // 有田，跟老子穿院子
  s.Key("Luo", plan + 4.8, { faceTo: "LiuWencai", clip: POINT_CROUCH });        // 文财，你跟到顺儿走巷子
  s.Key("Luo", plan + 6.4, { faceTo: "player", clip: POINT_CROUCH });
  s.Key("Luo", plan + 7.6, { faceTo: "player", clip: TALK_CROUCH });            // 摸到他屁股后头之前，哪个都不准放枪
  s.Caption(plan + 0.3, 4.2, "（枪眼只朝前打，屁股后头是空的。有田，跟老子穿院子；文财，你跟到顺儿走巷子。摸到他屁股后头之前，哪个都不准放枪——一口气分三拨）");
  s.Eye(2.2, s.End("LuoSplitsUp.01") + 0.4 - 2.2, { stance: "prone", x: P3.x, z: P3.z, look: luo0, pitch: 3 });
  // 转向坡道：幺娃，你们打一阵歇一阵，把他们的人往前头拉！
  const yaowaAt = UP(K3("Yaowa"));
  const ramp = s.Say("LuoToRamp.01", "Luo");
  s.Key("Luo", ramp - 0.2, { faceTo: yaowaAt, clip: POINT_CROUCH, talking: true });
  s.Key("Yaowa", ramp + 0.6, { aim: false, faceTo: luo0 });
  s.Caption(ramp + 0.2, 3.2, "（转向坡道：幺娃，你们打一阵歇一阵，把他们的人往前头拉！）");
  s.Eye(ramp - 0.2, 1.0, { stance: "prone", x: P3.x, z: P3.z, look: luo0, pitch: 3, toLook: yaowaAt, toPitch: 0 });
  s.Eye(ramp + 0.8, s.End("LuoToRamp.01") - ramp, { stance: "prone", x: P3.x, z: P3.z, look: yaowaAt, pitch: 0 });
  s.Key("Luo", s.End("LuoToRamp.01") + 0.3, { talking: false, clip: null, faceTo: BACK_GATE });
  s.Key("Yaowa", s.End("LuoToRamp.01") + 0.6, { aim: true, faceTo: LOOPHOLE });
  // 刘文财看了顺子一眼：……晓得
  const liuAt = UP(K3("LiuWencai"));
  const know = s.Say("LiuKnows.01", "LiuWencai");
  s.Key("LiuWencai", know - 0.5, { aim: false, faceTo: "player", talking: true });
  s.Key("LiuWencai", s.End("LiuKnows.01") + 0.2, { talking: false, faceTo: luo0 });
  s.Eye(know - 0.5, 1.0, { stance: "prone", x: P3.x, z: P3.z, look: yaowaAt, pitch: 0, toLook: liuAt, toPitch: 0 });
  s.Eye(know + 0.5, s.End("LiuKnows.01") + 0.6 - (know + 0.5), { stance: "prone", x: P3.x, z: P3.z, look: liuAt, pitch: 0 });
  s.Caption(know + 0.1, 2.6, "（刘文财看了顺子一眼：……晓得）");
  // ② 分头：Escort2 爬上坡道补顺子那个射击位；班长带何有田、Escort1 顺沟底往东、爬上南沿钻进后门（EM1）；坡道上只剩幺娃和 Escort2 压枪眼
  const GO = R(s.End("LiuKnows.01") + 0.8);
  const e2slot = SHOOTER_SLOT.player;
  s.Go("Escort2", GO, GO + 2.2, e2slot.x, e2slot.z, { move: "run", stance: "prone", aim: true, faceTo: LOOPHOLE, depart: { stance: "crouch" } });
  const K91 = id => UP(KU(ctx, "09-1", id));
  const PARTY = { Luo: UP(K("Luo")), HeYoutian: UP(K("HeYoutian")), Escort1: UP(K("Escort1")) };
  TRIO.forEach((id, k) => {
    const to = PARTY[id], t0 = GO + 0.3 + k * 0.6;
    s.Go(id, t0, t0 + 3.0, to.x, to.z, { move: "run", stance: "crouch", aim: false, path: [Pt(103.6, 382.4), Pt(107.6, 382.5)], yawDeg: Yaw(to, BACK_GATE), depart: { clip: null } });
    const t1 = t0 + 3.4 + k * 0.4;
    const inYard = K91(id);
    s.Go(id, t1, t1 + 2.2, inYard.x, inYard.z, { move: "run", stance: "crouch", aim: false, path: [Pt(BACK_GATE.x, EYR.backGateOut.z), EYR.backGateIn], yawDeg: KU(ctx, "09-1", id).yawDeg });
  });
  s.Caption(GO + 0.4, 3.2, "（班长带何有田和一个后送队的兵顺沟底往东，爬上南沿猫腰钻进后门——进了主街东边那院；另一个兵爬上坡道补顺子的射击位）");
  s.Caption(GO + 4.0, 2.6, "（三个人一个跟一个钻进后门，蹲在门里听了听）");
  WindowBurst(s, GO + 1.6, { volume: 0.8, puffAt: Pt(101.0, 384.0) });
  // ③ 顺子和刘文财顺沟南沿往西爬到巷子口、拐进巷子（约 5 s 不能操作）：刘文财从他的射击位滑下坡道，跟在顺子眼睛后头一两米
  const go = GO + 0.6;
  const eyeA = Pt(P3.x, P3.z), eyeB = Pt(97.2, 381.2), eyeC = Pt(84, 380.6), eyeD = Pt(ALLEY_MOUTH.x, ALLEY_MOUTH.z + 1.5), eyeE = Pt(P.x, P.z);
  s.Caption(go + 0.2, 2.6, "（顺子和刘文财顺沟南沿往西爬，拐进巷子。约 5 秒不能操作）");
  s.Creep(go, 1.0, eyeA, eyeB, Pt(90, 381), { h: 1.3, lookH: 1.0 });
  s.Creep(go + 1.0, 3.4, eyeB, eyeC, Pt(ALLEY_MOUTH.x, ALLEY_MOUTH.z + 4), { h: 1.4, lookH: 1.0, ease: "linear" });
  s.Creep(go + 4.4, 1.4, eyeC, eyeD, Pt(ST.alleyNorth.c, 396), { h: 1.5, lookH: 1.0 });
  s.Creep(go + 5.8, 1.2, eyeD, eyeE, Pt(ST.alleyNorth.c, 400), { h: 1.1, lookH: 1.0 });
  const liuTo = UP(K("LiuWencai"));
  s.Go("LiuWencai", go + 0.4, go + 1.6, 97.0, 381.4, { move: "run", stance: "crouch", aim: false, depart: { stance: "crouch", aim: false, clip: null } });
  s.Go("LiuWencai", go + 1.6, go + 5.2, 84, 380.6, { move: "run", stance: "crouch" });
  s.Go("LiuWencai", go + 5.2, go + 6.6, ALLEY_MOUTH.x + 0.5, DT.z, { move: "run", stance: "crouch" });
  s.Go("LiuWencai", go + 6.6, go + 8.4, liuTo.x, liuTo.z, { move: "run", stance: "crouch", yawDeg: 180 });
  MouthFire(s, go + 2.0, { volume: 0.7, who: ["Yaowa"] });
  WindowBurst(s, go + 3.2, { volume: 0.8, puffAt: Pt(101.8, 384.4) });
  // ④ 进巷子十来米交还操作：能转头不能走（eye.free），身后的事只听得见
  const FREE0 = go + 7.0, FREE_S = 26.0;
  s.Eye(FREE0, FREE_S, { stance: "crouch", x: P.x, z: P.z, yaw: 180, pitch: -2, free: true });
  s.Caption(FREE0 + 0.2, 2.6, "（钻进巷子十来米：交还操作。能转头，不能走。刘文财蹲在身后两步）");
  // 身后：妮儿趁乱溜出沟，顺沟底往西、爬上南沿，跟着钻进了巷子（看不见，只听得见）；老耿喊、爬出沟去追，被幺娃一把拽回
  const run0 = FREE0 + 1.2;
  const nierPath = K("Nier").path.slice(1);                 // 关键帧的来路：沟底往西、巷子口、巷子口里
  const alleyIn = nierPath[nierPath.length - 1];
  const len = RouteLen(nier0, nierPath);
  const run1 = R(run0 + len / 2.9);
  s.Go("Nier", run0, run1, alleyIn.x, alleyIn.z, { move: "run", path: nierPath.slice(0, -1), depart: { stance: "stand", clip: VIL.panic } });
  s.Key("Nier", run1 + 0.2, { stance: "crouch", clip: VIL.crouch, yawDeg: 180 });
  s.Caption(run0 + 0.4, 3.2, "（身后：妮儿趁乱溜出沟，顺沟底往西、爬上南沿，跟着钻进了巷子。顺子看不见她，只听得见）");
  const chase = run0 + 0.8;
  s.Say("NierRuns.01", "Geng", chase);
  const GENG_RIM = Pt(99.4, 383.6), rimYaw = Yaw(GENG_RIM, ALLEY_MOUTH);
  s.Go("Geng", chase + 0.4, chase + 2.0, GENG_RIM.x, GENG_RIM.z, { move: "run", yawDeg: rimYaw });
  const yk = StagePlace("yankBack", "yanker", GENG_RIM, rimYaw);
  s.Go("Yaowa", chase + 0.8, chase + 2.2, yk.x, yk.z, { move: "run", depart: { stance: "crouch", aim: false }, stance: "crouch", yawDeg: yk.yawDeg });
  const T = chase + 2.4;
  s.Key("Geng", T, { clip: VIL.reach });
  s.Key("Yaowa", T, { clip: VIL.yank });
  WindowBurst(s, T + 0.5, { volume: 0.9, puffAt: Fwd(GENG_RIM, rimYaw, 1.6, -0.4) });
  s.Say("NierRuns.02", "Yaowa", T + 1.5);
  const gEnd = RootEndAt(VIL.reach, GENG_RIM, rimYaw), yEnd = RootEndAt(VIL.yank, yk, yk.yawDeg);
  s.Key("Geng", T + VilClipS(VIL.reach), { x: gEnd.x, z: gEnd.z, move: "cut", clip: null, stance: "crouch", yawDeg: rimYaw });
  s.Key("Yaowa", T + VilClipS(VIL.yank), { x: yEnd.x, z: yEnd.z, move: "cut", clip: null, stance: "crouch", faceTo: "Geng" });
  s.Caption(T + 1.4, 2.6, "（老耿爬出沟去追，幺娃一把把他拽回沟里：一梭子刚打在他跟前）");
  s.Go("Geng", T + 3.0, T + 4.2, UP(K("Geng")).x, UP(K("Geng")).z, { move: "walk", stance: "crouch", faceTo: ALLEY_MOUTH });
  const yslot = SHOOTER_SLOT[SHOOTER_SLOTS_08_4.Yaowa];
  s.Go("Yaowa", T + 3.4, T + 5.0, yslot.x, yslot.z, { move: "run", stance: "prone", aim: true, faceTo: LOOPHOLE });
  // 坡道上两个照办：打一枪换个窝（09-1 的窝）
  const shuffle0 = T + 6.0;
  const shuffled = ShooterShuffle(s, ctx, "09-1", shuffle0, { volume: 0.7 });
  s.Caption(shuffle0 + 0.6, 2.6, "（坡道上只剩两个：打一枪，爬到旁边的射击位再打——打一阵歇一阵，把他们的人往前头拉）");
  MouthFire(s, run1 + 2.0, { volume: 0.6, who: ["Escort2"] });
  WindowBurst(s, run1 + 3.4, { volume: 0.6, puffAt: Pt(100.6, 384.2) });
  s.Caption(FREE0 + FREE_S - 3.0, 2.6, "（接 09：三拨——顺子和刘文财走巷子，班长穿院子，坡道上压枪眼）");
  void geng0;
  return s.Done({ durationS: Math.max(FREE0 + FREE_S, shuffled + 1.0) });
}
/** 08-4 坡道上两个的射击位（谁趴哪儿；Escort2 补顺子空出来的那个；第十版：Squad3 死了、刘文财走巷子了）。 */
const SHOOTER_SLOTS_08_4 = Object.freeze({ Yaowa: "Yaowa", Escort2: "player" });
// ---------------------------------------------------------------------------
// 两路（2026-10-24，用户「班长和顺子应该分两路穿插巷口，而不是傻傻的等着」；同日第九版：班长不上主街）：顺子那一路（09 全部）照旧；班长那一路是 09 各段的背景戏——
// 班长、何有田、Escort1 从 08-4 末钻进路沟后门（EM1）起，每一段从本帧的站位挪到下一帧的站位（关键帧 EAST_ROUTE），全程蹲着、不开枪、不出声；
// 正面吸火的是坡道上四个（每段换一次窝：打一枪、爬到旁边的射击位再打）；大车后头没有人了。

const TRIO = ["Luo", "HeYoutian", "Escort1"];
const SHOOTERS = ["Yaowa", "Escort2"];   // 第十版（10-30）：Squad3 08-3 死在坡道上、刘文财跟顺子走巷子，坡道上只剩两个
const POCKET_GATE_AT = Pt(EYR.pocketGate.x, EYR.pocketGate.z);
const SHOOTER_SLOT = Object.fromEntries(L0610_MOUTH_SHOOTERS.map(p => [p.who, Pt(p.x, p.z)]));
/** 班长那一路：这一段里从本帧站位蹲着挪到下一帧（nextKf）的站位；stagger 错开起步。返回最后一个人到位的时刻。 */
function EastRouteMove(s, ctx, nextKf, t0, { speed = 1.1, stagger = 0.6, ids = TRIO } = {}) {
  let last = t0;
  ids.forEach((id, k) => {
    const to = KU(ctx, nextKf, id), cur = s.pos.get(id);
    if (!to || !cur || Dist(cur, to) < 0.25) { if (to) s.Key(id, t0 + k * stagger, { yawDeg: to.yawDeg, stance: "crouch", aim: false }); return; }
    last = Math.max(last, s.Walk(id, t0 + k * stagger, UP(to), { move: "walk", speed, stance: "crouch", aim: false, yawDeg: to.yawDeg }));
  });
  return R(last);
}
/** 坡道上打一枪换个窝：谁换到哪个射击位（下一帧的窝），趴着爬过去；先各打一枪。返回换完的时刻。 */
function ShooterShuffle(s, ctx, nextKf, t0, { volume = 0.6 } = {}) {
  let last = t0;
  SHOOTERS.forEach((id, k) => {
    const to = KU(ctx, nextKf, id), cur = s.pos.get(id);
    if (!to || !cur || Dist(cur, to) < 0.5) return;
    Shot(s, t0 + k * 0.3, id, { volume });
    const t1 = R(t0 + 0.8 + k * 0.3 + Dist(cur, to) / 1.6);
    s.Go(id, t0 + 0.8 + k * 0.3, t1, to.x, to.z, { move: "run", stance: "prone", aim: true, faceTo: LOOPHOLE });
    last = Math.max(last, t1);
  });
  return R(last);
}
/** 坡道上一个人冒头打一枪，枪眼回一梭打沟沿（09 的背景节奏；第九版：Escort2 也在坡道上，大车后头没人了）。 */
function RampPotShot(s, t, { volume = 0.5, who = "Escort2" } = {}) {
  Shot(s, t, who, { volume });
  WindowBurst(s, t + 1.3, { volume, puffAt: Pt(100.8, 384.6) });
  return R(t + 2.0);
}

// ---------------------------------------------------------------------------
// 09 摸进老耿家（拉着手走唯一的那条路；蹲着慢慢挪）

/**
 * 两人拉着手顺着一串停点蹲着挪：妮儿在前头半步（她知道路，拽着他），顺子的眼睛（蹲姿眼高）跟着她。每段挪完停一停；
 * onStop(i, tArrive) 可以在停点插戏并返回更晚的继续时刻。返回停稳的时刻。
 */
function HandInHand(s, t0, stops, { speed = 1.6, pause = 1.4, lead = 0.8, onStop = null, fov, endAt = null, follow = null } = {}) {
  let t = t0;
  for (let i = 1; i < stops.length; i++) {
    const a = stops[i - 1], b = stops[i];
    const yaw = Yaw(a, b);
    const nierTo = i === stops.length - 1 && endAt ? endAt : Fwd(b, yaw, lead);
    const dur = R(Dist(a, b) / speed);
    s.Go("Nier", R(t - 0.2), R(t - 0.2 + dur), nierTo.x, nierTo.z, { move: "walk", stance: "crouch", yawDeg: yaw, ...(i === 1 ? { depart: { clip: null } } : {}) });
    // 第十版（10-30）：刘文财跟在顺子身后 lag 米（follow = { id, lag }），蹲着、端着枪，走同一条线
    if (follow) {   // 停在这一段终点往回 lag 米的地方（还在 a→b 这条线上，拐角不出墙）；一段短于 lag 就停在 a
      const lag = follow.lag ?? 1.3, len = Dist(a, b);
      const f = len > lag + 0.3 ? Fwd(a, yaw, len - lag) : a;
      s.Go(follow.id, R(t + 0.15), R(t + 0.15 + dur), f.x, f.z, { move: "walk", stance: "crouch", yawDeg: yaw, aim: true, path: [a] });   // 先到这一段的起点（上一个拐角）再走，不切内角
    }
    s.Creep(t, dur, a, b, { actor: "Nier", offset: [0, 0.5, 0] }, { h: 1.05, ease: "linear", ...(fov ? { fov } : {}) });
    t = R(t + dur + pause);
    if (onStop) { const later = onStop(i, R(t - pause)); if (later != null) t = Math.max(t, later); }
  }
  return t;
}

/** 第十版（10-30）09 的几个小工具（K9 前缀）：坡道上只剩幺娃和 Escort2，街口的「一打一回」不再点 Squad3 / 刘文财。 */
const K9_RAMP = ["Yaowa", "Escort2"];
function K9Exchange(s, t, { volume = 0.6, puffAt = null } = {}) {
  MouthFire(s, t, { volume: volume * 0.7, who: K9_RAMP });
  return WindowBurst(s, t + 1.2, { volume, puffAt });
}
/** 丁字路口那边吹哨：音效表里没有哨子，借远处的日语吼声顶（见报告）。 */
function K9Whistle(s, t, { volume = 0.6 } = {}) { s.Sfx(t, "ijaShoutFar", { x: 108.5, z: 462, volume }); return R(t + 1.6); }
/** 隔壁院 WA1（街坊家北边那院，x 64…72.25、z 424.25…444）里踹门的地方和院门 */
const K9_WA1 = Object.freeze({ door: Pt(68.2, 429.5), gateIn: Pt(64.8, 441.5), gateOut: Pt(62.9, 441.5), l4Mouth: Pt(ST.alleyA5.c - 0.1, ST.l4.c - 2.4) });

function S0901(ctx) {
  const s = new Seq(ctx, "09-1", "死胡同：走到头被瓦砾堵死，妮儿追上来往南带；刘文财：跟到个女娃子走？顺子：她屋就在那头");
  const P = KP(ctx, "09-1"), P84 = KP(ctx, "08-4");
  const K = id => KU(ctx, "09-1", id);
  const nier84 = UP(KU(ctx, "08-4", "Nier")), liu84 = UP(KU(ctx, "08-4", "LiuWencai"));
  const Z2 = ST.alleyA2.c, X3 = ST.alleyA3.c;
  // 开场：顺子在 08-4 交还操作的地方（夹道里），刘文财在他身后两步，妮儿蹲在更后头巷子口里（他们没回头）
  s.Place("Nier", 0, nier84.x, nier84.z, { stance: "crouch", yawDeg: 180, clip: VIL.crouch });
  s.Place("LiuWencai", 0, liu84.x, liu84.z, { stance: "crouch", yawDeg: 180, aim: true });
  s.Eye(0, 1.2, { stance: "crouch", x: P84.x, z: P84.z, yaw: 180, pitch: -4 });
  s.Caption(0.3, 3.0, "（顺子在前、刘文财在后往里摸。身后的枪声一阵一阵，没回头）");
  // 蹲着顺夹道往南到第一道弯，没拐南，直着拐进往西那条巷子，两步就走到头；刘文财跟在后头两步
  const start = Pt(P84.x, P84.z), bend = Pt(P84.x, Z2 - 0.2), stubIn = Pt(73.0, Z2 + 0.1), END = Pt(P.x, P.z);
  s.Creep(1.2, 5.2, start, bend, Pt(P84.x, Z2 + 6), { h: 1.05, ease: "linear" });
  s.Go("LiuWencai", 1.4, 6.6, P84.x + 0.3, Z2 - 1.8, { move: "walk", stance: "crouch", yawDeg: 180, aim: true });
  s.Creep(6.4, 3.6, bend, stubIn, Pt(60, Z2), { h: 1.05, ease: "linear" });
  s.Caption(6.6, 2.8, "（第一道弯：往南是一条，往西也是一条。直着拐进了往西那条）");
  s.Go("LiuWencai", 7.0, 11.6, 74.6, Z2 - 0.3, { move: "walk", stance: "crouch", yawDeg: 90, aim: true, path: [Pt(P84.x + 0.2, Z2 + 0.1)] });
  s.Creep(10.0, 2.0, stubIn, END, Pt(60, Z2), { h: 1.05, ease: "linear" });
  const T_END = 12.0;
  s.Eye(T_END, 2.6, { stance: "crouch", x: END.x, z: END.z, yaw: 90, pitch: -6 });
  s.Caption(T_END + 0.2, 2.8, "（走到头：塌下来的墙把路堵死了，一堆土坯高过人头）");
  // 妮儿在后头跟着（他们没回头）：到拐弯处停一停，再追上来，挤过刘文财身边攥住顺子的衣角（VilClingHem：根在眼睛正后方 0.28 m）
  s.Go("Nier", 2.4, 7.6, P84.x + 0.2, Z2 - 1.0, { move: "walk", stance: "crouch", yawDeg: 180, depart: { clip: null } });
  const CLING_AT = Fwd(END, 90, -0.28);
  s.Go("Nier", 7.8, 14.6, CLING_AT.x, CLING_AT.z, { move: "walk", stance: "crouch", yawDeg: 90, path: [Pt(73.0, Z2 + 0.45)] });   // 他到头（12 s）两秒多以后她才追到
  const CLING = 14.8;
  s.Key("Nier", CLING, { clip: VIL.cling, stance: "stand" });
  s.Caption(CLING, 2.6, "（身后有人拽他衣角）");
  s.Key("LiuWencai", CLING + 0.2, { faceTo: "Nier", aim: false });
  // 他回过身，她松开衣角往后退半步（贴着拽衣角那 0.28 m 看下去只看得见头顶，看不见脸上的血），镜头平着看她的脸
  s.Eye(T_END + 2.6, 1.0, { stance: "crouch", x: END.x, z: END.z, yaw: 90, pitch: -6, toYaw: -90, toPitch: -6 });
  const FACE_AT = Fwd(END, 90, -0.85);
  s.Go("Nier", CLING + 0.9, CLING + 1.6, FACE_AT.x, FACE_AT.z, { move: "walk", stance: "stand", yawDeg: 90 });
  s.Caption(T_END + 3.8, 3.2, "（是妮儿。脸上还糊着那个伤兵的血，整个人在抖——她是自己追上来的）");
  s.Key("Nier", CLING + 2.2, { clip: "PvStandShakeHead", faceTo: "player" });
  s.Caption(CLING + 2.4, 2.4, "（她朝他摇头：不是这边）");
  s.Key("Nier", CLING + 4.0, { clip: null, stance: "crouch" });
  s.Caption(CLING + 4.2, 3.4, "（顺子抓住她的手。她攥住他的手往回拽、往南带：她知道回家的路）");
  s.Eye(T_END + 3.6, CLING + 4.6 - (T_END + 3.6), { stance: "crouch", x: END.x, z: END.z, look: { actor: "Nier", offset: [0, 1.0, 0] } });
  // 刘文财蹲在妮儿后头，压着嗓子：跟到个女娃子走？—— 顺子回他一句：她屋就在那头
  const LIU = UP(K("LiuWencai"));
  s.Go("LiuWencai", CLING + 1.0, CLING + 2.4, LIU.x, LIU.z, { move: "walk", stance: "crouch", yawDeg: K("LiuWencai").yawDeg, aim: false });
  const ask = s.Say("LiuGirlLeads.01", "LiuWencai", CLING + 4.8);
  s.Key("LiuWencai", ask - 0.3, { clip: TALK_CROUCH, faceTo: "player", talking: true });
  s.Eye(ask - 0.4, 1.0, { stance: "crouch", x: END.x, z: END.z, look: { actor: "Nier", offset: [0, 1.0, 0] }, toLook: LIU, toPitch: -4 });
  s.Eye(ask + 0.6, s.End("LiuGirlLeads.01") - ask + 0.6, { stance: "crouch", x: END.x, z: END.z, look: { actor: "LiuWencai", offset: [0, 1.1, 0] } });
  s.Caption(ask + 0.2, 2.4, "（刘文财压着嗓子：跟到个女娃子走？）");
  s.Key("LiuWencai", s.End("LiuGirlLeads.01") + 0.3, { clip: null, talking: false });
  const ans = s.Say("ShunziHerHome.01", null, s.End("LiuGirlLeads.01") + 0.5);
  s.Caption(ans + 0.2, 2.6, "（她屋就在那头。——顺子说完就跟着她走。领着她的时候顺子手上没枪：枪背到背上，两人一路拉着手走；刘文财端着枪跟在后头两步）");
  s.Eye(ans - 0.2, 1.0, { stance: "crouch", x: END.x, z: END.z, look: { actor: "LiuWencai", offset: [0, 1.1, 0] }, toLook: { actor: "Nier", offset: [0, 1.0, 0] } });
  // 拉着往回走到第一道弯、拐南（09-2 从那儿起）；刘文财跟着
  const back = R(s.End("ShunziHerHome.01") + 0.8);
  const southStart = Pt(X3 + 0.2, Z2 + 2.5);
  s.Eye(ans + 0.8, back - (ans + 0.8), { stance: "crouch", x: END.x, z: END.z, look: { actor: "Nier", offset: [0, 1.0, 0] } });
  s.Go("Nier", back - 0.2, back + 2.8, X3 + 0.2, Z2 + 3.3, { move: "walk", stance: "crouch", yawDeg: 180, path: [Pt(X3 - 0.3, Z2 + 0.3)] });
  s.Creep(back, 3.0, END, southStart, { actor: "Nier", offset: [0, 0.5, 0] }, { h: 1.05 });
  s.Go("LiuWencai", back + 0.6, back + 3.2, X3 - 0.3, Z2 + 1.2, { move: "walk", stance: "crouch", yawDeg: 180, aim: true, path: [Pt(X3 - 0.4, Z2 - 0.2)] });
  // 背景：街口一直在打（坡道上两个打一枪换个窝，替两路吸着火）；班长三人从后门里摸到 EM1 / EM2 之间那道墙的豁口（09-2 的站位）
  K9Exchange(s, 3.0, { volume: 0.5 });
  ShooterShuffle(s, ctx, "09-2", 8.0, { volume: 0.5 });
  K9Exchange(s, 14.0, { volume: 0.5 });
  s.Caption(15.2, 2.6, "（街口那边一直在打：坡道上两个打一枪换个窝，替两路吸着火）");
  EastRouteMove(s, ctx, "09-2", 2.0, { speed: 1.4 });
  s.Caption(2.2, 3.4, "（班长三人这时刚钻进后门：蹲在门里听了听，贴着杂货铺的后墙往院子南头摸——南头那道墙挨过炮，塌了一角）");
  return s.Done({ durationS: back + 3.6 });
}
function S0902(ctx) {
  const s = new Seq(ctx, "09-2", "一眼瞥见：街坊家门口，院里有鬼子在吼，地底下有人哭；隔壁院也在踹门、响了一枪");
  const P = KP(ctx, "09-2");
  const X3 = ST.alleyA3.c, Z2 = ST.alleyA2.c, Z4 = ST.alleyA4.c, X5 = ST.alleyA5.c, L4Z = ST.l4.c;
  // 开场在第一道弯南边（09-1 末妮儿把他拽回来往南带，刘文财在后头）；拉着手走巷子往南那截、第二道弯到街坊家西墙外的窄夹道、到 L4
  const start = Pt(X3 + 0.2, Z2 + 2.5);
  s.Place("Nier", 0, X3 + 0.2, Z2 + 3.3, { stance: "crouch", yawDeg: 180 });
  s.Place("LiuWencai", 0, X3 - 0.3, Z2 + 1.2, { stance: "crouch", yawDeg: 180, aim: true });
  s.Eye(0, 1.0, { stance: "crouch", x: start.x, z: start.z, look: { actor: "Nier", offset: [0, 0.5, 0] } });
  const stops = [start, Pt(X3, Z4 - 0.6), Pt(X5 + 0.4, Z4), Pt(X5, 446), Pt(X5, L4Z - 0.6), Pt(P.x, P.z)];
  s.Caption(0.4, 3.0, "（巷子两边都是院墙，又窄又直，拐来拐去；塌下来的墙把岔路都堵死了——只有这一条路。刘文财跟在后头）");
  // 隔壁院（WA1）里两个搜人的：一个踹屋门、一个端着枪
  s.Key("NextDoorIja1", 0, { faceTo: K9_WA1.door });
  s.Key("NextDoorIja2", 0, { faceTo: K9_WA1.door, aim: true });
  const t = HandInHand(s, 1.0, stops, {
    speed: 1.6, pause: 1.2, follow: { id: "LiuWencai", lag: 1.4 },
    onStop: (i, tArr) => {
      if (i === 1) { K9Exchange(s, tArr + 0.2, { volume: 0.5 }); s.Caption(tArr + 0.4, 2.6, "（机枪一响就贴墙停一停，停了再挪）"); ShooterShuffle(s, ctx, "09-3", tArr + 2.8, { volume: 0.5 }); return tArr + 2.6; }
      if (i === 3) { K9Exchange(s, tArr + 0.2, { volume: 0.5 }); EastRouteMove(s, ctx, "09-3", tArr + 1.0); s.Caption(tArr + 1.2, 3.0, "（班长三人这时一个一个钻过那道塌墙的豁口，顺主街东墙里头那条空地往南头的柴垛摸：墙那边就是路口墙角那伙鬼子的院子）"); return tArr + 2.2; }
      return null;
    },
  });
  RampPotShot(s, 4.0, { volume: 0.45 });
  // 到了街坊家西南角半掩的院门外：门缝对着院当中的窖口，一眼瞥见
  s.Key("Nier", t, { stance: "crouch", faceTo: "player" });
  s.Key("LiuWencai", t + 0.2, { faceTo: JF_GATE, aim: true });
  s.Eye(t, 4.6, { stance: "crouch", look: CELLAR, pitch: -2, fov: 56 });
  s.Caption(t + 0.2, 3.0, "（街坊家西南角的院门半掩着。拉着手走过门口，门缝里一眼看见院当中的窖口）");
  s.Key("CellarIja1", t, { faceTo: CELLAR, clip: VIL.shout });
  s.Say("CellarShout.01", "CellarIja1", t + 1.2);
  s.Say("CellarShout.02", "CellarIja1");
  s.Sfx(t + 0.4, "cellarSob", { x: CELLAR.x, z: CELLAR.z, volume: 0.7 });
  s.Sfx(s.End("CellarShout.02") + 0.3, "cellarSob", { x: CELLAR.x, z: CELLAR.z, volume: 0.6 });
  s.Key("CellarIja1", s.End("CellarShout.02") + 0.6, { clip: null });
  s.Caption(s.End("CellarShout.02") + 0.2, 2.8, "（一个鬼子拎着手榴弹冲窖口吼「出来！」，地底下有人在哭。不在门口停）");
  // 同时隔壁院（街坊家北边那院）也在踹门、有人喊，响了一枪：隔着墙听得见、看不见
  const nd = R(s.End("CellarShout.02") + 0.5);
  s.Key("NextDoorIja1", nd - 0.4, { clip: VIL.smash });
  s.Sfx(nd, "gateSmash", { x: K9_WA1.door.x, z: K9_WA1.door.z, volume: 0.6 });
  s.Line(R(nd + 0.6), "NextDoorShout.01", "NextDoorIja1");
  s.Key("NextDoorIja1", nd + VilClipS(VIL.smash), { clip: null });
  Shot(s, R(nd + 3.4), "NextDoorIja2", { volume: 0.7 });
  s.Caption(nd + 0.3, 3.2, "（隔壁院子也在踹门、有人喊，响了一枪：那边还有搜人的）");
  // 三个人缩回墙根：眼睛退到门西边的墙根下，妮儿拽他往西边窄夹道去，刘文财跟着
  const back = R(Math.max(s.End("CellarShout.02") + 1.6, nd + 3.8));
  const wall = Pt(64.6, 468.4);
  s.Creep(back, 1.4, Pt(P.x, P.z), wall, Pt(JF_GATE.x, JF_GATE.z - 2), { h: 1.05 });
  s.Go("Nier", back, back + 1.6, 63.6, 468.2, { move: "walk", stance: "crouch", yawDeg: 90 });
  s.Go("LiuWencai", back + 0.2, back + 1.8, 66.2, 469.2, { move: "walk", stance: "crouch", yawDeg: 90, aim: true });
  s.Caption(back + 0.3, 2.8, "（三个人缩回墙根。妮儿拽着他绕到西边的窄夹道去）");
  return s.Done({ durationS: back + 3.0 });
}

function S0903(ctx) {
  const s = new Seq(ctx, "09-3", "豁口·窗户纸·捂嘴：汉子刚爬出来就被捅倒；刘文财：隔壁还有");
  const K = id => KU(ctx, "09-3", id);
  const P = KP(ctx, "09-3");
  const EYE = Pt(P.x, P.z), NIER = UP(K("Nier")), LIU = UP(K("LiuWencai"));
  const X5 = ST.alleyA5.c, L4Z = ST.l4.c;
  // 从墙根起：窄夹道往北到西配房塌掉的西北角，钻进黑屋，缩到窗下；刘文财跟着，蹲在豁口里边往夹道看
  s.Place("Nier", 0, 63.6, 468.2, { stance: "crouch", yawDeg: 90 });
  s.Place("LiuWencai", 0, 66.2, 469.2, { stance: "crouch", yawDeg: 90, aim: true });
  // 隔壁那两个这一段开场已经扛着东西出了 WA1 的院门、在窄夹道里（院门是关着的门扇，白盒不开，人不穿它）
  s.Place("NextDoorIja1", 0, K9_WA1.gateOut.x, 441.4, { yawDeg: 180, aim: false });
  s.Place("NextDoorIja2", 0, K9_WA1.gateOut.x - 0.3, 439.2, { yawDeg: 180, aim: false });
  const start = Pt(64.6, 468.4);
  const breachIn = Pt(65.2, 450.0);   // 豁口（西墙 z 449.25…450.75 没了）的中心
  const stops = [start, Pt(X5 + 0.2, L4Z - 0.5), Pt(X5 + 0.2, 450.0), breachIn, EYE];
  s.Eye(0, 1.0, { stance: "crouch", x: start.x, z: start.z, look: { actor: "Nier", offset: [0, 0.5, 0] } });
  const t = HandInHand(s, 1.0, stops, { speed: 1.6, pause: 1.0, lead: 0.45, endAt: NIER, follow: { id: "LiuWencai", lag: 1.3 },
    onStop: (i, tArr) => { if (i === 2) { s.Caption(tArr + 0.2, 2.8, "（西配房的西北角挨过炮，塌了：墙上一个豁口，地上一摊瓦砾）"); return tArr + 1.4; } if (i === 3) { s.Caption(tArr + 0.2, 2.4, "（钻进黑屋）"); return tArr + 0.8; } return null; } });
  // 缩到窗下：隔着破窗户纸看院子（视场收窄）；刘文财蹲在豁口里边、盯着外头的窄夹道
  s.Key("Nier", t, { x: NIER.x, z: NIER.z, move: "cut", stance: "crouch", faceTo: CELLAR, clip: VIL.crouch });
  s.Key("LiuWencai", t, { x: LIU.x, z: LIU.z, move: "cut", stance: "crouch", yawDeg: K("LiuWencai").yawDeg, aim: true });
  const WATCH = t + 0.4;
  s.Caption(WATCH + 0.2, 3.0, "（缩到窗下，隔着破窗户纸看院子：窖口就在十米外。刘文财蹲在豁口里边，盯着外头的窄夹道）");
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
  // 隔壁那两个：扛着抢来的东西从 WA1 的院门出来，顺窄夹道往南小跑过豁口外头到 L4 口，又跑回去（第二趟）；刘文财从豁口看见，冲顺子指那面墙：隔壁还有
  {
    const run0 = WATCH + 1.6, MPS = 3.6;
    const legs = (id, k) => {
      const cur = s.pos.get(id), t1 = run0 + k * 0.7;
      const mouth = Pt(K9_WA1.l4Mouth.x - k * 0.3, K9_WA1.l4Mouth.z);
      const t2 = R(t1 + Dist(cur, mouth) / MPS);
      s.Go(id, t1, t2, mouth.x, mouth.z, { move: "run", yawDeg: 180 });
      const back = UP(K(id));
      const t3 = R(t2 + 1.4 + Dist(mouth, back) / MPS);
      s.Go(id, t2 + 1.4, t3, back.x - k * 0.3, back.z, { move: "run", yawDeg: 0 });
      s.Key(id, R(t3 + 0.1), { yawDeg: K(id).yawDeg });
      return t1;
    };
    const pass1 = legs("NextDoorIja1", 0);
    legs("NextDoorIja2", 1);
    s.Caption(pass1 + 0.6, 3.2, "（豁口外窄夹道里两个鬼子扛着抢来的东西小跑过去——隔壁那两个，往外搬东西又回去）");
    s.Key("LiuWencai", pass1 + 0.4, { aim: false, faceTo: Pt(X5, 456) });
    s.Key("LiuWencai", pass1 + 2.6, { clip: POINT_CROUCH, faceTo: "player" });
    const nx = s.Say("LiuNextDoor.01", "LiuWencai", pass1 + 3.4);
    s.Caption(nx + 0.2, 2.6, "（刘文财冲顺子指那面墙，压着嗓子：隔壁还有）");
    const nxEnd = s.End("LiuNextDoor.01");
    s.Key("LiuWencai", nxEnd + 0.6, { clip: null, aim: true, faceTo: Pt(X5, 452) });
    // 眼睛：窗后一直看窖口（SlitEye）；他开口前 0.3 s 转过去看豁口里边的刘文财（顺带看见他身后的豁口和窄夹道），说完 +0.6 s 再转回窗后看窖口
    const LOOK_LIU = { actor: "LiuWencai", offset: [0, 1.0, 0] };
    s.Eye(WATCH, nx - 0.3 - WATCH, { stance: "crouch", look: CELLAR, pitch: -4, fov: SLIT_FOV + 8 });
    s.Eye(nx - 0.3, 0.7, { stance: "crouch", look: CELLAR, pitch: -4, toLook: LOOK_LIU, fov: 58 });
    s.Eye(nx + 0.4, nxEnd + 0.6 - (nx + 0.4), { stance: "crouch", look: LOOK_LIU, fov: 58 });
    s.Eye(nxEnd + 0.6, 0.8, { stance: "crouch", look: LOOK_LIU, toLook: CELLAR, toPitch: -4, fov: SLIT_FOV + 8 });
    s.Eye(nxEnd + 1.4, Math.max(0.5, stab + 1.3 - (nxEnd + 1.4)), { stance: "crouch", look: CELLAR, pitch: -4, fov: SLIT_FOV + 8 });
  }
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
  // 妮儿认出街坊，呜咽；屏幕弹按键：按住捂她的嘴——手占着，院里的事拦不住
  s.Key("Nier", stab + 0.8, { clip: VIL.cower });
  const whimper = s.Say("NierWhimperFirst.01", "Nier", stab + 1.6);
  s.Eye(whimper - 0.3, 1.0, { stance: "crouch", look: CELLAR, pitch: -4, toLook: NIER, toPitch: -26, fov: SLIT_FOV + 8 });
  s.Caption(whimper + 0.8, 3.4, "（妮儿认出了街坊，呜咽起来。屏幕弹出按键：按住，捂住她的嘴——第一人称看得见自己的手指，上面露着她瞪大的眼睛。手占着，院里的事拦不住）");
  s.Eye(whimper + 3.0, 1.0, { stance: "crouch", look: NIER, pitch: -26, toLook: CELLAR, toPitch: -4, fov: SLIT_FOV + 8 });
  WindowBurst(s, s.End("NierWhimperFirst.01") - 1.0, { volume: 0.7 });
  // 松手她就哭出声：院里一个鬼子扭头朝西配房看一眼，再捂紧（不判失败）
  const loose = R(Math.max(s.End("NierWhimperFirst.01") + 2.6, grannyClimb + VilClipS(VIL.climbOut) + 1.4));
  s.Caption(loose - 0.4, 2.2, "（一松手——）");
  s.Line(loose, "NierWhimperFirst.01", "Nier");
  s.Key("CellarIja2", loose + 0.9, { faceTo: JF_WINDOW });
  s.Eye(loose + 0.6, 1.0, { stance: "crouch", look: CELLAR, pitch: -4, toLook: Pt(75.6, 461.6), toPitch: -3, fov: SLIT_FOV + 8 });
  s.Caption(loose + 1.0, 3.2, "（她哭出声来。院里一个鬼子扭头朝西配房看了一眼。再捂紧——没按到也不判失败）");
  s.Key("CellarIja2", loose + 3.0, { faceTo: CELLAR });
  s.Key("Nier", loose + 2.4, { clip: VIL.cower });
  K9Exchange(s, WATCH + 1.0, { volume: 0.5 });
  // 两路背景：坡道上换个窝、冒头一枪；班长三人在柴垛跟前摆开人梯（09-4 的站位：何有田蹲到柴垛北边当垫脚、班长在他身后、一个兵盯着院门）
  ShooterShuffle(s, ctx, "09-4", WATCH + 3.0, { volume: 0.45 });
  RampPotShot(s, climb + 1.0, { volume: 0.4 });
  EastRouteMove(s, ctx, "09-4", stab + 2.0, { speed: 0.9 });
  s.Caption(stab + 4.2, 3.0, "（班长三人这时在 EM2 南墙根的柴垛跟前摆开人梯：何有田蹲下当垫脚，班长在他身后，一个兵盯着院门）");
  // 看完：街上的枪声密起来了（接 09-4）
  const leave = Math.max(loose + 4.4, dragT1 + 2.0);
  s.Caption(leave, 2.4, "（前头街上的枪声一下子密了：坡道上照班长说的打紧了。接 09-4）");
  s.Eye(loose + 1.6, leave + 2.6 - (loose + 1.6), { stance: "crouch", look: CELLAR, pitch: -4, fov: SLIT_FOV + 8 });
  return s.Done({ durationS: leave + 2.6 });
}

function S0904(ctx) {
  const s = new Seq(ctx, "09-4", "哨子·一刀：街上枪声密了、路口吹哨，院里了结；五个去路口，剩一个在门房——顺子一刀砍偏，刘文财补刺刀");
  const K = id => KU(ctx, "09-4", id), K3 = id => KU(ctx, "09-3", id);
  const P = KP(ctx, "09-4"), P3 = KP(ctx, "09-3");
  const EYE3 = Pt(P3.x, P3.z), P94 = Pt(P.x, P.z), NIER3 = UP(K3("Nier")), NIER4 = UP(K("Nier")), LIU3 = UP(K3("LiuWencai")), LIU4 = UP(K("LiuWencai"));
  const GATEHOUSE = UP(K("CellarIja4"));
  const GRANNY = RootEndAt(VIL.climbOut, Pt(CELLAR.x + 0.5, CELLAR.z + CELLAR_RIM_M), 180);
  const DOOR_IN = Pt(JF_WING_DOOR.x - 1.3, JF_WING_DOOR.z), DOOR_OUT = Pt(JF_WING_DOOR.x + 1.3, JF_WING_DOOR.z);
  // 开场：09-3 末的样子——顺子还在窗下，妮儿在旁边，刘文财在豁口里边；院里四个、隔壁那两个在窄夹道口
  s.Signal(0, SIG.cellarBlast, false);
  s.Place("Nier", 0, NIER3.x, NIER3.z, { stance: "crouch", faceTo: CELLAR, clip: VIL.cower });
  s.Place("LiuWencai", 0, LIU3.x, LIU3.z, { stance: "crouch", yawDeg: K3("LiuWencai").yawDeg, aim: true });
  s.Place("CellarIja4", 0, UP(K3("CellarIja4")).x, UP(K3("CellarIja4")).z, { faceTo: CELLAR });
  s.Place("CellarIja1", 0, 72.6, 458.0, { faceTo: CELLAR });
  s.Place("CellarIja2", 0, 75.6, 461.6, { faceTo: GRANNY, aim: true });
  s.Place("CellarIja3", 0, JF_BEIWU_DOOR.x, JF_BEIWU_DOOR.z - 1.4, { yawDeg: 180 });
  for (const id of ["NextDoorIja1", "NextDoorIja2"]) { const u = K3(id); s.Place(id, 0, u.x, u.z, { yawDeg: u.yawDeg }); }
  s.Place("CellarMan", 0, UP(K3("CellarMan")).x, UP(K3("CellarMan")).z, { state: "down", yawDeg: 100 });
  s.Place("CellarWife", 0, JF_BEIWU_DOOR.x, JF_BEIWU_DOOR.z - 1.8, { state: "down", yawDeg: 90 });
  s.Place("CellarGranny", 0, GRANNY.x, GRANNY.z, { state: "alive", stance: "crouch", yawDeg: 180, clip: VIL.crouch });
  s.Spawn("Bundle", { side: "civ", kind: "child", x: 74.6, z: 461.5, yawDeg: 60, state: "down", name: "襁褓（占位）" }, { visible: false });
  // 街上枪声一下子密了（坡道上照班长说的打紧了），丁字路口那边吹哨
  const dense = 0.6;
  for (let k = 0; k < 4; k++) MouthFire(s, dense + k * 1.1, { volume: 0.75, who: K9_RAMP });
  WindowBurst(s, dense + 0.6, { volume: 0.7, count: 8 }); WindowBurst(s, dense + 2.6, { volume: 0.7, count: 8 });
  s.Sfx(dense + 1.4, "rifleVolley", { x: 108, z: 462, volume: 0.6 });
  RampPotShot(s, dense + 3.2, { volume: 0.5 });
  K9Whistle(s, dense + 1.0, { volume: 0.6 });
  s.Caption(dense + 0.4, 3.0, "（前头街上枪声一下子密了：坡道上照班长说的打紧了。丁字路口那边吹哨）");
  // 两路（10-24）：街上一密，班长那一路趁着响动翻墙——人梯：何有田蹲在柴垛北边压着嗓子一句，班长踩柴垛、踩肩膀翻过 z 435 那道墙（VilIjaClimbWall，
  // 根在柴垛北边的起跳点、面朝南，播完切到墙那边）；Escort1 跟着翻；最后何有田自己翻、墙那边的人把他拉上去（说明字）。落在 EM3 北屋西边的空地上（09-5 的站位）
  {
    const FROM = Pt(EYR.climb.from.x, EYR.climb.from.z), TO = Pt(EYR.climb.to.x, EYR.climb.to.z), CLIMB_S = VilClipS(VIL.climbWall);
    const K5 = id => UP(KU(ctx, "09-5", id));
    const whisper = s.Say("LadderWhisper.01", "HeYoutian", dense + 1.6);
    s.Key("HeYoutian", whisper - 0.3, { faceTo: "Luo", stance: "crouch", aim: false });
    s.Caption(whisper + 0.2, 3.0, "（班长三人这时在翻墙：何有田蹲在柴垛跟前当垫脚，压着嗓子——班长，踩到老子肩膀上来）");
    const T1 = s.End("LadderWhisper.01") + 0.4;
    s.Go("HeYoutian", T1 - 0.2, T1 + 0.4, FROM.x - 0.7, FROM.z - 0.1, { move: "walk", stance: "crouch", aim: false, yawDeg: 180 });
    s.Go("Luo", T1, T1 + 0.8, FROM.x, FROM.z, { move: "walk", stance: "stand", aim: false, yawDeg: 180 });
    s.Key("Luo", T1 + 0.9, { clip: VIL.climbWall });
    s.Key("Luo", T1 + 0.9 + CLIMB_S, { x: TO.x, z: TO.z, move: "cut", clip: null, stance: "crouch", yawDeg: 180 });
    s.Caption(T1 + 1.0, 3.2, "（班长踩柴垛、踩何有田的肩膀，翻过墙头，落在墙那边北屋西边的空地上）");
    const T2 = T1 + 0.9 + CLIMB_S + 0.4;
    s.Go("Luo", T2, T2 + 1.6, K5("Luo").x, K5("Luo").z, { move: "walk", stance: "crouch", aim: false, yawDeg: 180 });
    s.Go("Escort1", T2 - 0.6, T2 + 0.4, FROM.x, FROM.z, { move: "walk", stance: "stand", aim: false, yawDeg: 180 });
    s.Key("Escort1", T2 + 0.5, { clip: VIL.climbWall });
    s.Key("Escort1", T2 + 0.5 + CLIMB_S, { x: TO.x, z: TO.z, move: "cut", clip: null, stance: "crouch", yawDeg: 180 });
    const T3 = T2 + 0.5 + CLIMB_S + 0.4;
    s.Go("Escort1", T3, T3 + 1.0, K5("Escort1").x, K5("Escort1").z, { move: "walk", stance: "crouch", aim: false, yawDeg: 180 });
    s.Go("HeYoutian", T3 - 0.6, T3 + 0.4, FROM.x, FROM.z, { move: "walk", stance: "stand", aim: false, yawDeg: 180 });
    s.Key("HeYoutian", T3 + 0.5, { clip: VIL.climbWall });
    s.Key("HeYoutian", T3 + 0.5 + CLIMB_S, { x: K5("HeYoutian").x, z: K5("HeYoutian").z, move: "cut", clip: null, stance: "crouch", yawDeg: 180 });
    s.Caption(T3 + 0.6, 3.0, "（最后一个没人垫脚：墙那边的班长回身把何有田拉上去。三个人都翻进了路口东北角那院的后头）");
    ShooterShuffle(s, ctx, "09-5", T2 + 2.0, { volume: 0.45 });
  }
  // 搜窖那伙的头儿吼：快了结、去路口！院里的赶紧了结：孩子在哭；一个鬼子从老太太怀里扯过襁褓，一刺刀扎穿挑起甩在窖沿；老太太往窖里爬；手榴弹磕钢盔扔进窖
  const hurry = s.Say("CellarHurry.01", "CellarIja1", dense + 2.6);
  s.Key("CellarIja1", hurry - 0.3, { faceTo: GRANNY, clip: VIL.shout });
  s.Key("CellarIja1", s.End("CellarHurry.01") + 0.3, { clip: null });
  const back = R(s.End("CellarHurry.01") + 0.4);
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
  s.Caption(FLING + 0.6, 3.6, "（一个鬼子从老太太怀里扯过襁褓，一刺刀扎穿，挑起来甩在窖沿上，哭声断了。捂着妮儿的手不能松）");
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
  // 三个拎枪出院门顺 L4 往东跑去丁字路口（按关键帧的来路：院子西南角 → 院门 → L4 → 路口 → 墙角）；隔壁那两个从窄夹道口跟着跑
  const go = blast + 1.6;
  const Run = (id, dt, pathFrom = 0) => {
    const path = K(id).path.slice(pathFrom), end = UP(K(id)), cur = s.pos.get(id);
    const len = RouteLen(cur, [...path.slice(0, -1), end]);
    s.Go(id, go + dt, R(go + dt + len / 3.4), end.x, end.z, { move: "run", path: path.slice(0, -1), depart: { clip: null, aim: false }, stance: "crouch", yawDeg: K(id).yawDeg, aim: !!K(id).aim });
    return R(go + dt + len / 3.4);
  };
  const arrive = Math.max(Run("CellarIja1", 0, 1), Run("CellarIja2", 0.5, 1), Run("CellarIja3", 1.0, 1), Run("NextDoorIja1", 1.8, 1), Run("NextDoorIja2", 2.3, 1));
  s.Caption(go + 0.6, 3.2, "（三个拎枪出院门、顺着门外那条小胡同往东跑去丁字路口；隔壁那两个也从窄夹道口跟着跑了）");
  // 院里只剩一个：钻进院门边的门房（南屋西头）翻东西，背朝院子
  const gh = go + 1.4;
  s.Go("CellarIja4", gh, gh + 2.6, GATEHOUSE.x, GATEHOUSE.z, { move: "run", path: [Pt(71.2, 464.4)], depart: { clip: null, aim: false }, yawDeg: 180 });
  s.Key("CellarIja4", gh + 2.7, { stance: "crouch", clip: VIL.crouch, yawDeg: 180 });
  s.Caption(gh + 2.8, 3.0, "（院里只剩一个：钻进院门边的门房翻东西，背朝院子）");
  // 刘文财抽刺刀、看顺子一眼、朝门房偏头，先猫腰过去；顺子松开妮儿跟上（妮儿留在西配房门外墙根）
  const TL = gh + 5.0;
  s.Caption(TL, 3.0, "（刘文财抽出刺刀，看了顺子一眼，朝门房偏偏头：先猫腰过去）");
  s.Key("LiuWencai", TL - 0.4, { faceTo: "player" });
  s.Go("LiuWencai", TL + 0.6, TL + 5.4, LIU4.x, LIU4.z, { move: "run", stance: "crouch", aim: true, path: [DOOR_IN, DOOR_OUT, Pt(69.6, 462.8)], yawDeg: Yaw(LIU4, GATEHOUSE) });
  s.Eye(0, TL - 0.2, { stance: "crouch", x: EYE3.x, z: EYE3.z, look: CELLAR, pitch: -4, fov: SLIT_FOV + 8 });   // 眼睛一直在窗后看院子（第十版：不再去大缸）
  s.Eye(TL - 0.2, 1.0, { stance: "crouch", x: EYE3.x, z: EYE3.z, look: CELLAR, pitch: -4, toLook: { actor: "LiuWencai", offset: [0, 1.0, 0] } });
  s.Eye(TL + 0.8, 1.6, { stance: "crouch", x: EYE3.x, z: EYE3.z, look: { actor: "LiuWencai", offset: [0, 1.0, 0] } });
  const T_GO = TL + 2.4;
  s.Caption(T_GO, 2.6, "（顺子松开妮儿跟上：她留在西配房门外的墙根）");
  s.Creep(T_GO, 1.6, EYE3, DOOR_IN, { actor: "LiuWencai", offset: [0, 1.0, 0] }, { h: 1.05 });
  s.Creep(T_GO + 1.6, 1.2, DOOR_IN, DOOR_OUT, { actor: "LiuWencai", offset: [0, 1.0, 0] }, { h: 1.05 });
  s.Go("Nier", T_GO + 0.4, T_GO + 2.8, NIER4.x, NIER4.z, { move: "walk", stance: "crouch", depart: { clip: null }, path: [DOOR_IN, DOOR_OUT], yawDeg: K("Nier").yawDeg, clip: VIL.cower });
  const T_K = T_GO + 2.8 + R(Dist(DOOR_OUT, P94) / 1.8);
  s.Creep(T_GO + 2.8, T_K - (T_GO + 2.8), DOOR_OUT, P94, GATEHOUSE, { h: 1.0, lookH: 0.9 });
  // 这一刀不干净：顺子从背后抡大刀砍偏在肩上，鬼子嚎一声扭过身，两人扭在一起，刘文财扑上来补一刺刀
  const CHOP = R(T_K + 0.8);
  s.Eye(T_K, 0.8, { stance: "crouch", x: P94.x, z: P94.z, look: GATEHOUSE, pitch: 4, fov: 58 });
  s.Caption(T_K + 0.1, 2.2, "（顺子从左肩抽出大刀，从背后抡过去——）");
  s.Sfx(CHOP, "stab", GATEHOUSE);
  s.Shake(CHOP, 0.4, 0.35);
  const howl = s.Say("GatehouseHowl.01", "CellarIja4", CHOP + 0.2);
  s.Key("CellarIja4", howl, { stance: "stand", clip: null, faceTo: "player" });
  s.Caption(howl + 0.2, 2.6, "（砍偏了，砍在肩上。鬼子嚎一声扭过身来）");
  const grapple = howl + 0.9;
  s.Key("CellarIja4", grapple, { clip: VIL.charge, faceTo: "player" });
  s.Eye(grapple + 0.3, 2.4, { stance: "crouch", x: P94.x, z: P94.z, look: { actor: "CellarIja4", offset: [0, 1.3, 0] }, shake: 0.35 });
  s.Shake(grapple + 0.6, 1.2, 0.45);
  s.Caption(grapple + 0.6, 2.4, "（两人扭在一起：他攥住顺子的刀腕，顺子抓着他的枪）");
  s.Go("LiuWencai", grapple + 0.2, grapple + 0.9, GATEHOUSE.x - 1.0, GATEHOUSE.z + 0.9, { move: "run", stance: "stand", aim: true, yawDeg: Yaw(Pt(GATEHOUSE.x - 1.0, GATEHOUSE.z + 0.9), GATEHOUSE) });
  const thrust = grapple + 1.1;
  s.Key("LiuWencai", thrust, { clip: VIL.thrust, faceTo: "CellarIja4" });
  s.Sfx(thrust + 0.5, "stab", GATEHOUSE);
  s.Key("CellarIja4", thrust + 0.6, { clip: "ShotCollapse", clipHold: true, faceTo: Pt(GATEHOUSE.x, GATEHOUSE.z - 3) });
  s.Key("CellarIja4", thrust + 2.0, { state: "down", clip: null, yawDeg: 60 });
  s.Sfx(thrust + 2.0, "bodyFall", GATEHOUSE);
  s.Key("LiuWencai", thrust + VilClipS(VIL.thrust) + 0.2, { clip: null, stance: "crouch", aim: false, faceTo: "player" });
  s.Eye(grapple + 2.7, 1.0, { stance: "crouch", x: P94.x, z: P94.z, look: { actor: "CellarIja4", offset: [0, 1.0, 0] }, toLook: { actor: "CellarIja4", offset: [0, 0.3, 0] }, shake: 0.2 });
  s.Caption(thrust + 0.6, 3.4, "（刘文财扑上来补一刺刀。这一刀不干净——两人蹲着喘，顺子的手在抖）");
  s.Eye(grapple + 3.7, 4.0, { stance: "crouch", x: P94.x, z: P94.z, look: { actor: "CellarIja4", offset: [0, 0.3, 0] }, shake: 0.15 });
  s.Caption(thrust + 4.2, 3.0, "（玩家若开枪：五个招回来、院里院外围着打，多半死，从进西配房前重来——硬打支线不演）");
  void arrive;
  return s.Done({ durationS: grapple + 8.4 });
}

function S0905(ctx) {
  const s = new Seq(ctx, "09-5", "狗洞·便门：穿院子、过夹道到本家院；刘文财钻狗洞卡住，妮儿自己钻过去拔开便门");
  const K = id => KU(ctx, "09-5", id), K4 = id => KU(ctx, "09-4", id);
  const P4 = KP(ctx, "09-4");
  const start = Pt(P4.x, P4.z), NIER4 = UP(K4("Nier")), LIU4 = UP(K4("LiuWencai")), LIU5 = UP(K("LiuWencai"));
  const L4Z = ST.l4.c, PX = ST.passage.c, PEZ = ST.passageEnd.c;
  s.Place("Nier", 0, NIER4.x, NIER4.z, { stance: "crouch", yawDeg: 180, clip: VIL.cower });
  s.Place("LiuWencai", 0, LIU4.x, LIU4.z, { stance: "crouch", yawDeg: 90, aim: false });
  s.Place("CellarIja4", 0, UP(K("CellarIja4")).x, UP(K("CellarIja4")).z, { state: "down", yawDeg: 60 });
  s.Eye(0, 1.0, { stance: "crouch", x: start.x, z: start.z, look: { actor: "Nier", offset: [0, 0.5, 0] } });
  s.Caption(0.3, 3.0, "（妮儿从西配房门外跑过来，看见窖口僵住了；顺子拽着她出院门）");
  // 妮儿先从西配房门外过来到顺子身边（路过窖口西边 5 m 她僵住，顺子拽着）
  const meet = Fwd(start, Yaw(start, Pt(67.0, 464.6)), 0.8);
  s.Go("Nier", 0.4, 4.6, meet.x, meet.z, { move: "run", stance: "crouch", depart: { clip: null }, path: [Pt(69.0, 462.0)], faceTo: CELLAR });
  s.Eye(1.0, 3.6, { stance: "crouch", x: start.x, z: start.z, look: { actor: "Nier", offset: [0, 0.5, 0] } });
  // 院门 → L4 往西几步 → 南北夹道往南 → 本家院南墙西南角敞着的院门（门扇斜开在门洞西半边，人从东半边 x≈67 过）；刘文财跟着
  const stops = [start, Pt(67.0, 464.6), Pt(67.0, L4Z), Pt(74.8, L4Z + 0.15), Pt(74.8, 480), Pt(PX, PEZ - 0.4), Pt(78.3, PEZ - 0.2), Pt(78.3, BJ.gate.z - 1.4), Pt(79.6, 485.4), Pt(84.5, 484.6), SIDE_OUT];
  const t = HandInHand(s, 5.0, stops, { speed: 1.9, pause: 0.6, lead: 0.25, follow: { id: "LiuWencai", lag: 1.4 },
    onStop: (i, tArr) => {
      if (i === 2) { K9Exchange(s, tArr + 0.2, { volume: 0.55 }); s.Caption(tArr + 0.2, 2.6, "（出半掩的院门，L4 往东几步；街口那边还在打）"); return tArr + 1.6; }
      if (i === 5) { s.Caption(tArr + 0.1, 2.6, "（南北夹道的尽头是死胡同；本家院的院门敞着——人跑的时候没顾上关）"); return tArr + 1.0; }
      if (i === 8) { s.Caption(tArr + 0.1, 2.4, "（本家院空了：老耿的本家。东边那道墙就是老耿家的墙）"); return tArr + 0.8; }
      return null;
    } });
  // 便门从老耿家那边闩死；刘文财先去钻狗洞（绕过东厢房北头，到共用墙上的狗洞西口），肩膀卡住，退出来骂一句；妮儿推开他自己钻（VilCrawlHole，清单 stage dogHole：根在墙西面外 0.25 m、面朝东）
  s.Eye(t, 4.0, { stance: "crouch", x: SIDE_OUT.x, z: SIDE_OUT.z, look: SIDE_GATE, pitch: -4, toLook: { actor: "LiuWencai", offset: [0, 0.8, 0] } });
  s.Caption(t + 0.2, 3.2, "（便门从老耿家那边闩死了。墙根有个狗洞，0.45 m 宽、0.4 m 高——刘文财先趴下去钻）");
  const HOLE_W = Pt(WALL_X - WALL_T / 2 - 0.25, DOG_HOLE.z);
  const holePath = [Pt(86.6, 484.2), Pt(86.6, 476.0), Pt(90.3, 475.8)];
  const liuHole = s.Walk("LiuWencai", t + 0.4, HOLE_W, { move: "run", speed: 2.4, path: holePath, yawDeg: -90, stance: "crouch", aim: false });
  const TRY = liuHole + 0.3;
  s.Key("LiuWencai", TRY, { stance: "prone", clip: VIL.crawlHole });
  s.Key("LiuWencai", TRY + 1.5, { clip: null, stance: "crouch", x: LIU5.x - 0.8, z: LIU5.z + 0.9, move: "cut", yawDeg: -90 });
  s.Caption(TRY + 0.4, 2.8, "（肩膀卡住了，退出来骂了一句：大人钻不过）");
  s.Eye(t + 4.0, TRY + 3.0 - (t + 4.0), { stance: "crouch", x: SIDE_OUT.x, z: SIDE_OUT.z, look: { actor: "LiuWencai", offset: [0, 0.6, 0] } });
  const toHole = s.Walk("Nier", TRY + 0.8, HOLE_W, { move: "run", speed: 2.2, path: holePath, yawDeg: -90, stance: "crouch", depart: { clip: null } });
  s.Caption(TRY + 2.2, 2.6, "（妮儿推开他，自己趴下，手脚并用一头钻进去：她从小就这么钻）");
  const CRAWL = toHole + 0.3;
  s.Key("Nier", CRAWL, { clip: VIL.crawlHole });
  const crawlEnd = RootEndAt(VIL.crawlHole, HOLE_W, -90, CHILD_SCALE);
  const landed = Pt(crawlEnd.x + 0.5, crawlEnd.z + 0.2);
  s.Key("Nier", CRAWL + VilClipS(VIL.crawlHole), { x: landed.x, z: landed.z, move: "cut", clip: null, stance: "crouch", yawDeg: 180 });
  s.Key("LiuWencai", CRAWL + VilClipS(VIL.crawlHole) + 0.4, { x: LIU5.x, z: LIU5.z, move: "cut", stance: "crouch", yawDeg: K("LiuWencai").yawDeg, aim: false });
  s.Eye(TRY + 3.0, CRAWL + 3.4 - (TRY + 3.0), { stance: "crouch", x: SIDE_OUT.x, z: SIDE_OUT.z, look: { actor: "Nier", offset: [0, 0.4, 0] } });
  // 她落在北屋西边那条窄地上，沿北屋南墙和灶屋北墙之间 1 m 的夹缝到院子，再贴墙到便门里头拔门闩（VilUnboltDoor：门板在她前方 0.45×0.62 m）
  const DOOR_IN = Pt(WALL_X + WALL_T / 2 + 0.45 * CHILD_SCALE, SIDE_GATE.z);
  const tail = [Pt(94.0, 475.5), Pt(96.8, 475.5), Pt(97.0, 480.0), Pt(97.0, 483.2), Pt(93.6, 484.6)];   // 夹缝出来贴灶屋东墙往南，绕过灶屋东南角到便门里
  const toDoor = s.Walk("Nier", CRAWL + VilClipS(VIL.crawlHole) + 0.4, DOOR_IN, { move: "run", speed: 2.2, path: tail, yawDeg: 90, stance: "crouch" });
  s.Caption(CRAWL + 3.4, 3.0, "（钻过去了：顺着老耿家北屋南墙和灶屋北墙之间的夹缝到院子里，贴着墙摸到便门里头）");
  s.Eye(CRAWL + 3.4, toDoor + 4.6 - (CRAWL + 3.4), { stance: "crouch", x: SIDE_OUT.x, z: SIDE_OUT.z, look: SIDE_GATE, pitch: -4 });
  // 她拔门闩时墙外胡同里有人跑过、脚步停一下又跑远：三人贴墙不动；东头哨子声、喊声一阵比一阵近
  const steps = R(toDoor - 1.4);
  for (const [dt, x, z] of [[0, 112.6, 478], [0.4, 112.6, 481], [0.8, 112.6, 484], [2.2, 112.6, 487], [2.6, 112.6, 490]]) s.Sfx(steps + dt, "dirtFall", { x, z, volume: 0.22 });
  s.Caption(steps + 0.2, 3.0, "（墙外胡同里有人跑过，脚步在墙外停一下又跑远：三人贴墙不动）");
  s.Sfx(t + 6.0, "ijaShoutFar", { x: 150, z: 464, volume: 0.25 });
  s.Sfx(toHole + 1.0, "ijaShoutFar", { x: 130, z: 464, volume: 0.35 });
  s.Sfx(toDoor + 0.2, "ijaShoutFar", { x: 118, z: 463, volume: 0.45 });
  s.Caption(toHole + 1.2, 2.8, "（东头哨子声和喊声一阵比一阵近：喊人的快回来了）");
  const UNBOLT = toDoor + 0.4;
  s.Signal(0, SIG.sideGateOpen, false);
  s.Key("Nier", UNBOLT, { stance: "stand", clip: VIL.unbolt, yawDeg: 90 });
  const open = R(UNBOLT + 1.75);
  s.Signal(open, SIG.sideGateOpen, true);
  s.Sfx(open, "dirtFall", { x: WALL_X, z: SIDE_GATE.z, volume: 0.25 });
  s.Key("Nier", UNBOLT + VilClipS(VIL.unbolt), { clip: null, stance: "crouch", faceTo: "player" });
  s.Caption(UNBOLT + 0.3, 2.6, "（门闩从那边拔开，便门开了一条缝，露出妮儿的脸）");
  K9Exchange(s, t + 3.0, { volume: 0.55 });
  // 两路背景：班长三人从 EM3 北屋西边的空地蹲着摸到南墙的院门后头（09-6 的站位）；坡道上换个窝、冒头一枪
  const arrived = EastRouteMove(s, ctx, "09-6", 3.0, { speed: 1.0, stagger: 1.2 });
  s.Caption(arrived - 1.0, 3.2, "（班长三人这时穿过路口东北角那院，蹲到它南墙的院门后头：门外就是墙角那伙鬼子，隔一道门）");
  ShooterShuffle(s, ctx, "09-6", t + 6.0, { volume: 0.45 });
  RampPotShot(s, CRAWL + 1.5, { volume: 0.4 });
  s.Caption(open + 1.8, 2.2, "（进便门）");
  return s.Done({ durationS: open + 4.4 });
}

function S0906(ctx) {
  const s = new Seq(ctx, "09-6", "屁股对到老子：堂屋门里是机枪组的后背；灶屋那个背对门蹲着，从背后一刀");
  const K = id => KU(ctx, "09-6", id);
  const P = KP(ctx, "09-6"), P5 = KP(ctx, "09-5");
  const SIGHT = Pt(P.x, P.z), NIER6 = UP(K("Nier")), LIU6 = UP(K("LiuWencai")), KIJ = UP(K("KitchenIja"));
  const LIU5 = UP(KU(ctx, "09-5", "LiuWencai"));
  const DOOR_IN = Pt(WALL_X + WALL_T / 2 + 0.45 * CHILD_SCALE, SIDE_GATE.z);
  // 开场：顺子在便门外、妮儿在门里、刘文财还在狗洞那边；灶屋那个背对门蹲在灶台边往嘴里塞东西
  s.Place("Nier", 0, DOOR_IN.x, DOOR_IN.z, { stance: "crouch", yawDeg: 90 });
  s.Place("LiuWencai", 0, LIU5.x, LIU5.z, { stance: "crouch", yawDeg: -90, aim: false });
  s.Key("KitchenIja", 0, { stance: "crouch", yawDeg: K("KitchenIja").yawDeg, aim: false, clip: VIL.crouch });
  s.Eye(0, 1.2, { stance: "crouch", x: P5.x, z: P5.z, look: SIDE_GATE, pitch: -4 });
  s.Creep(1.2, 1.6, Pt(P5.x, P5.z), SIDE_IN, Pt(101, 480), { h: 1.05 });
  s.Go("Nier", 1.0, 2.4, SIDE_IN.x + 0.6, SIDE_IN.z - 0.9, { move: "walk", stance: "crouch", yawDeg: -90 });
  s.Caption(1.4, 3.0, "（进了便门：老耿家后院没人。堂屋门朝南开着，门里头是机枪组的后背，十几步远，正朝着街上打）");
  // 刘文财从狗洞那边绕回来跟进便门（绕本家院的北屋、东厢房那一圈，二十多米，跑着）
  const liuBack = s.Walk("LiuWencai", 1.0, Pt(SIDE_OUT.x - 0.6, SIDE_OUT.z + 0.2), { move: "run", speed: 2.6, path: [Pt(90.3, 475.8), Pt(86.6, 476.0), Pt(86.6, 484.2)], stance: "crouch", yawDeg: -90, aim: true });
  // 顺着院子南墙根往东挪几步，才看得进门里（门洞 1.2 m 宽，机枪手正对门后 3.5 m）
  s.Creep(3.4, 2.4, SIDE_IN, SIGHT, TANGWU_DOOR, { h: 1.05 });
  s.Go("Nier", 3.6, 5.8, NIER6.x, NIER6.z, { move: "walk", stance: "crouch", yawDeg: -90 });
  s.Go("LiuWencai", liuBack + 0.3, liuBack + 3.4, LIU6.x, LIU6.z, { move: "run", stance: "crouch", path: [SIDE_OUT, SIDE_IN], yawDeg: K("LiuWencai").yawDeg, aim: true });
  s.Eye(5.8, 5.0, { stance: "crouch", look: MG_AT, pitch: -2 });
  WindowBurst(s, 6.2, { volume: 0.85 });
  const butt = s.Say("ButtToMe.01", null, 8.6);
  s.Caption(butt + 0.2, 2.6, "（……狗日的，屁股对到老子）");
  // 灶屋门敞着：那个背对门蹲在灶台边往嘴里塞东西。贴西墙往灶屋门摸：机枪响一梭挪一段，一安静就停
  const t0 = s.End("ButtToMe.01") + 1.6;
  s.Caption(t0 - 0.8, 3.4, "（灶屋门敞着，里头一个背对着门蹲在灶台边，往嘴里塞东西。贴西墙往灶屋门摸：机枪响一梭挪一段，一安静就停）");
  s.Eye(t0 - 0.9, 0.9, { stance: "crouch", look: MG_AT, pitch: -2, toLook: KIJ, toPitch: -6 });
  const stops = [SIGHT, Pt(98.3, 482.6), Pt(98.4, 480.8), Pt(98.2, 479.9)];
  const t = CreepLegs(s, t0, stops, i => (i === 3 ? KIJ : Pt(KITCHEN_DOOR.x, KITCHEN_DOOR.z + 1.2)), {
    volume: 0.75, pause: 2.8, speed: 1.4,
    onStop: (i, mv0, mv1) => {
      const yaw = Yaw(stops[i - 1], stops[i]);
      const n = Fwd(stops[i], yaw, -0.7, -0.5);   // 她在他身后半步、靠墙那边
      s.Go("Nier", mv0 + 0.2, mv1 + 0.2, n.x, n.z, { move: "walk", stance: "crouch", yawDeg: yaw });
      return null;
    },
  });
  // 从背后一刀：悄悄解决。眼睛从灶屋门外挪进门里、到他背后一步
  const BEHIND = Pt(KIJ.x + 1.1, KIJ.z + 0.3);
  s.Eye(t - 2.6, 2.4, { stance: "crouch", x: stops[3].x, z: stops[3].z, look: KIJ, pitch: -6 });
  s.Caption(t - 2.2, 2.2, "（到灶屋门口了。他没回头）");
  WindowBurst(s, t - 1.3, { volume: 0.75 });   // 响了才挪（09-6 的节奏）
  s.Creep(t, 1.0, stops[3], KITCHEN_OUT, KIJ, { h: 1.0, lookH: 0.7 });
  s.Creep(t + 1.0, 1.6, KITCHEN_OUT, BEHIND, KIJ, { h: 1.0, lookH: 0.7 });
  const KILL = R(t + 3.2);
  s.Eye(t + 2.6, 6.0, { stance: "crouch", x: BEHIND.x, z: BEHIND.z, look: KIJ, pitch: -16, shake: 0.08 });
  s.Caption(KILL - 0.4, 2.4, "（从背后一刀：悄悄解决。预演演这一支）");
  s.Sfx(KILL, "stab", KIJ);
  s.Shake(KILL, 0.3, 0.3);
  s.Key("KitchenIja", KILL + 0.05, { clip: "ShotCollapse", clipHold: true, stance: "stand" });
  s.Key("KitchenIja", KILL + 1.4, { state: "down", clip: null, yawDeg: 90 });
  s.Sfx(KILL + 1.4, "bodyFall", KIJ);
  s.Caption(KILL + 1.6, 3.4, "（被发现那一支：他扑倒顺子、连按往外推、妮儿咬手腕——动静传到北屋就得在屋里打。关键帧说明里写）");
  s.Go("Nier", KILL + 0.6, KILL + 1.8, 97.0, 480.6, { move: "walk", stance: "crouch", yawDeg: 90 });
  s.Key("LiuWencai", KILL - 1.0, { faceTo: TANGWU_OUT, aim: true });
  s.Caption(KILL + 4.0, 2.6, "（刘文财在灶屋门外盯着堂屋：门里六个，没一个回头）");
  // 两路背景：班长三人蹲在 EM3 南门后头不动，班长贴门缝听外头（09-7 他们才动手）；坡道上换个窝、冒头一枪
  for (const id of TRIO) s.Key(id, 0, { stance: "crouch", aim: false, faceTo: POCKET_GATE_AT });
  s.Caption(butt + 3.2, 3.0, "（班长三人这时蹲在路口东北角那院的南门后头，贴着门缝听外头：等顺子这头一响）");
  ShooterShuffle(s, ctx, "09-7", t0 + 2.0, { volume: 0.45 });
  RampPotShot(s, 3.0, { volume: 0.4 });
  return s.Done({ durationS: KILL + 6.8 });
}

function S0907(ctx) {
  const s = new Seq(ctx, "09-7", "端枪眼：从背后开打，分队长扔手榴弹满院土，一间间打；被扑倒、妮儿咬手腕；同时班长撞门抡大刀冲进墙角，Escort1 被炸死");
  const K = id => KU(ctx, "09-7", id), K6 = id => KU(ctx, "09-6", id);
  const P = KP(ctx, "09-7");
  const EYE_DOWN = Pt(P.x, P.z), PIN = UP(K("Rifle1")), PIN_YAW = K("Rifle1").yawDeg;   // 第十版人数 15：北屋西间只有 Rifle1，扑倒顺子的就是他
  const NIER_MARK = StagePlace("pinBite", "nier", PIN, PIN_YAW);
  const KIJ = UP(K6("KitchenIja")), LIU7 = UP(K("LiuWencai"));
  const RIFLE_E = UP(K6("Rifle3"));
  const DOOR_W = Pt(TANGWU_OUT.x - 0.9, TANGWU_OUT.z + 0.2), DOOR_E = Pt(TANGWU_OUT.x + 0.9, TANGWU_OUT.z + 0.2), TANGWU_IN = Pt(TANGWU_OUT.x, 474.2);
  const YARD_HIT = Pt(100.5, 479.0);
  // 开场：09-6 末的样子——顺子在灶屋里灶屋那个的尸体后头，妮儿在灶屋门外，刘文财在灶屋门外盯着堂屋；北屋六个都活着、全朝北打；班长三人在 EM3 南门后头；墙角六个
  s.Place("KitchenIja", 0, KIJ.x, KIJ.z, { state: "down", yawDeg: 90 });
  s.Place("Nier", 0, 97.0, 480.6, { stance: "crouch", yawDeg: 90, clip: VIL.crouch });
  s.Place("LiuWencai", 0, UP(K6("LiuWencai")).x, UP(K6("LiuWencai")).z, { stance: "crouch", yawDeg: K6("LiuWencai").yawDeg, aim: true });
  for (const id of ["MgGunner", "MgLoader", "MgThird", "Rifle1", "Leader", "Rifle3"]) { const u = K6(id); s.Place(id, 0, u.x, u.z, { state: "alive", stance: u.stance || "stand", yawDeg: u.yawDeg, aim: !!u.aim }); }
  for (const id of TRIO) { const u = K6(id); s.Place(id, 0, u.x, u.z, { state: "alive", stance: "crouch", aim: false, faceTo: POCKET_GATE_AT }); }
  for (const id of ["CornerIja1", "CellarIja1", "CellarIja2", "CellarIja3", "NextDoorIja1", "NextDoorIja2"]) { const u = K6(id); s.Place(id, 0, u.x, u.z, { state: "alive", stance: "crouch", aim: !!u.aim, yawDeg: u.yawDeg }); }
  s.Signal(0, SIG.eastGateBurst, false);
  const BEHIND = Pt(KIJ.x + 1.1, KIJ.z + 0.3);
  // 顺子、刘文财贴堂屋门两边（妮儿留在灶屋门外）
  s.Eye(0, 1.0, { stance: "crouch", x: BEHIND.x, z: BEHIND.z, look: KIJ, pitch: -16 });
  s.Caption(0.3, 3.0, "（出灶屋，顺屋檐摸到堂屋门：顺子贴门西边，刘文财贴门东边。门里六个，全朝北打）");
  s.Creep(1.0, 1.4, BEHIND, KITCHEN_OUT, TANGWU_OUT, { h: 1.0 });
  s.Creep(2.4, 2.6, KITCHEN_OUT, DOOR_W, Pt(MG_AT.x, MG_AT.z), { h: 1.0, lookH: 0.9 });
  s.Go("LiuWencai", 1.4, 4.6, DOOR_E.x, DOOR_E.z, { move: "walk", stance: "crouch", aim: true, path: [Pt(99.4, 479.0)], faceTo: Pt(MG_AT.x, MG_AT.z) });
  WindowBurst(s, 2.0, { volume: 0.9 }); WindowBurst(s, 5.6, { volume: 0.9, count: 8 });
  s.Eye(5.0, 3.0, { stance: "crouch", x: DOOR_W.x, z: DOOR_W.z, look: Pt(MG_AT.x, MG_AT.z), pitch: -2 });
  s.Caption(5.4, 2.4, "（机枪还在往街上扫。就这两三秒）");
  // ① 从背后开打：先撂倒机枪手和压弹的
  const T0 = 8.0;
  Shot(s, T0, "player", { count: 3, interval: 0.3 });
  Shot(s, T0 + 0.4, "LiuWencai", { count: 2, interval: 0.5 });
  s.Key("MgGunner", T0 + 0.2, { clip: "ShotCollapse", clipHold: true });
  s.Key("MgGunner", T0 + 1.6, { state: "down", clip: null, yawDeg: 0 });
  s.Key("MgLoader", T0 + 0.7, { clip: "ShotCollapse", clipHold: true });
  s.Key("MgLoader", T0 + 2.1, { state: "down", clip: null, yawDeg: 20 });
  s.Sfx(T0 + 1.6, "bodyFall", Pt(MG_AT.x, MG_AT.z));
  s.Caption(T0 + 0.3, 3.0, "（从背后开打：机枪手和压弹的先倒。机枪哑了）");
  s.Eye(T0, 3.2, { stance: "crouch", x: DOOR_W.x, z: DOOR_W.z, look: Pt(MG_AT.x, MG_AT.z), pitch: -2, shake: 0.25 });
  for (const id of ["MgThird", "Rifle1", "Leader", "Rifle3"]) s.Key(id, T0 + 1.0, { yawDeg: 180, aim: true });
  s.Line(T0 + 1.3, "LeaderBehind.01", "Leader");
  s.Caption(T0 + 1.6, 2.6, "（东西两间扭过身：分队长吼——后头！）");
  Shot(s, T0 + 2.2, "Rifle1", { volume: 0.9 }); Puff(s, T0 + 2.3, Pt(99.3, 475.4));
  Shot(s, T0 + 2.8, "MgThird", { volume: 0.9 }); Puff(s, T0 + 2.9, Pt(100.7, 475.5));
  s.Shake(T0 + 2.3, 0.3, 0.3);
  // ② 分队长往院里甩手榴弹：院墙塌一截、满院土
  const FlightS = (from, to) => Math.max(0.6, Math.min(1.8, 0.55 + 0.06 * Dist(from, to)));
  const LEADER0 = UP(K6("Leader"));
  const tThrow = T0 + 2.6, yardBlast = R(tThrow + 2.15 + FlightS(LEADER0, YARD_HIT));
  s.Key("Leader", tThrow, { throw: { x: YARD_HIT.x, z: YARD_HIT.z } });
  s.Caption(tThrow + 1.0, 2.6, "（分队长一颗手榴弹从门里甩出来，落在院子里——）");
  s.Eye(T0 + 3.2, yardBlast - 0.3 - (T0 + 3.2), { stance: "crouch", x: DOOR_W.x, z: DOOR_W.z, look: Pt(MG_AT.x, MG_AT.z), pitch: -2, toLook: YARD_HIT, toPitch: -14, shake: 0.2 });
  s.Sfx(yardBlast, "grenadeBlast", { x: YARD_HIT.x, z: YARD_HIT.z, volume: 1.0 });
  s.Ev(yardBlast, "explosion", { x: YARD_HIT.x, z: YARD_HIT.z, kind: "grenade", radius: 3.0 });
  s.Ev(yardBlast + 0.1, "smoke", { x: YARD_HIT.x, z: YARD_HIT.z, kind: "SmokeDust", dur: 14, scale: 2.5 });
  s.Ev(yardBlast + 0.3, "smoke", { x: 100.0, z: 475.6, kind: "SmokeDust", dur: 12, scale: 1.8 });
  s.Ev(yardBlast + 0.4, "smoke", { x: 97.6, z: 473.0, kind: "SmokeDust", dur: 10, scale: 1.5 });
  s.Shake(yardBlast, 1.0, 0.55);
  s.Ev(yardBlast, "flash", { dur: 0.5, strength: 0.5 });
  s.Sfx(yardBlast + 0.6, "dirtFall", { x: 101, z: 477, volume: 0.8 });
  s.Caption(yardBlast + 0.3, 3.2, "（院墙塌了一截，满院是土，屋里也灌满了烟）");
  s.Key("Nier", yardBlast - 0.3, { clip: VIL.duck, stance: "stand" });
  s.Key("Nier", yardBlast + VilClipS(VIL.duck) + 0.2, { clip: VIL.cower, stance: "crouch" });
  // ③ 屋里一间间打（门框、炕沿、水缸）：眼睛进堂屋
  const R0 = yardBlast + 1.6;
  s.Caption(R0 + 0.2, 3.0, "（烟里一间间打：堂屋、西间、东间。门框、炕沿、水缸都在崩土）");
  s.Creep(R0, 1.2, DOOR_W, TANGWU_IN, Pt(96.6, 472.6), { h: 1.0, lookH: 0.9, shake: 0.2 });
  s.Go("LiuWencai", R0 + 0.4, R0 + 1.6, 101.6, 474.0, { move: "run", stance: "crouch", aim: true, path: [TANGWU_IN], faceTo: RIFLE_E });
  Shot(s, R0 + 1.4, "player", { count: 2, interval: 0.4 });
  s.Key("MgThird", R0 + 1.5, { clip: "ShotCollapse", clipHold: true });
  s.Key("MgThird", R0 + 2.9, { state: "down", clip: null, yawDeg: -30 });
  Shot(s, R0 + 2.0, "Rifle3", { volume: 0.9 }); Puff(s, R0 + 2.1, Pt(100.6, 474.6)); s.Shake(R0 + 2.05, 0.3, 0.35);
  Shot(s, R0 + 2.6, "LiuWencai", { volume: 0.9 }); Puff(s, R0 + 2.7, Pt(103.0, 471.0));
  s.Eye(R0 + 1.2, 2.4, { stance: "crouch", x: TANGWU_IN.x, z: TANGWU_IN.z, look: Pt(96.6, 472.6), pitch: -2, shake: 0.3 });
  Shot(s, R0 + 3.2, "Rifle1", { volume: 0.9 }); Puff(s, R0 + 3.3, Pt(99.0, 474.3)); s.Shake(R0 + 3.25, 0.3, 0.35);
  s.Caption(R0 + 3.4, 2.4, "（西间那个从炕沿后头打过来，土崩在脸上）");
  Shot(s, R0 + 4.4, "player", { count: 2, interval: 0.4 }); Puff(s, R0 + 4.5, Pt(97.6, 471.4));
  s.Eye(R0 + 3.6, 2.6, { stance: "crouch", x: TANGWU_IN.x, z: TANGWU_IN.z, look: Pt(97.0, 472.0), pitch: -2, shake: 0.3 });
  Shot(s, R0 + 5.6, "Rifle1", { volume: 0.9 }); Puff(s, R0 + 5.7, Pt(99.8, 473.0));
  Shot(s, R0 + 6.4, "player", { count: 3, interval: 0.3 }); Puff(s, R0 + 6.5, Pt(96.9, 471.2));
  s.Caption(R0 + 6.8, 2.6, "（西间那个缩到炕沿后头不见了。换弹——东间还在打）");
  Shot(s, R0 + 7.4, "Rifle3", { volume: 0.9 }); Puff(s, R0 + 7.5, Pt(101.9, 474.7)); s.Shake(R0 + 7.45, 0.3, 0.3);
  Shot(s, R0 + 8.2, "LiuWencai", { volume: 0.9 }); Puff(s, R0 + 8.3, Pt(103.3, 472.2));
  s.Eye(R0 + 6.2, 4.4, { stance: "crouch", x: TANGWU_IN.x, z: TANGWU_IN.z, look: Pt(97.0, 472.0), pitch: -2, toLook: RIFLE_E, toPitch: -2, shake: 0.25 });
  // 东间那两个顶着打：顺子换弹（汉阳造五发），刘文财在堂屋门里对着东间打；枪眼那头又飞进来一颗手榴弹，炸在院墙根（又一阵土）
  const X0 = R0 + 10.6;
  s.Caption(X0, 3.0, "（东间两个顶着打，子弹打在门框上崩木屑。顺子换弹：汉阳造一次五发）");
  Shot(s, X0 + 0.6, "Rifle3", { volume: 0.9 }); Puff(s, X0 + 0.7, Pt(100.4, 474.5)); s.Shake(X0 + 0.65, 0.3, 0.3);
  Shot(s, X0 + 1.5, "Rifle3", { volume: 0.9 }); Puff(s, X0 + 1.6, Pt(99.6, 474.8));
  Shot(s, X0 + 2.3, "LiuWencai", { volume: 0.9 }); Puff(s, X0 + 2.4, Pt(103.0, 471.4));
  s.Eye(X0 + 0.4, 3.6, { stance: "crouch", x: TANGWU_IN.x - 0.6, z: TANGWU_IN.z, look: RIFLE_E, pitch: -2, shake: 0.3 });
  const LEADER_OUT = Pt(RIFLE_E.x - 0.6, RIFLE_E.z + 1.6), YARD_HIT2 = Pt(103.6, 477.2);
  s.Go("Leader", X0 + 1.0, X0 + 2.0, LEADER_OUT.x, LEADER_OUT.z, { move: "walk", yawDeg: 180, aim: false });
  const tThrow2 = X0 + 2.4, yardBlast2 = R(tThrow2 + 2.15 + FlightS(LEADER_OUT, YARD_HIT2));
  s.Key("Leader", tThrow2, { throw: { x: YARD_HIT2.x, z: YARD_HIT2.z } });
  s.Caption(tThrow2 + 1.2, 2.6, "（分队长又甩出一颗，这回落在东间窗下的院墙根）");
  s.Sfx(yardBlast2, "grenadeBlast", { x: YARD_HIT2.x, z: YARD_HIT2.z, volume: 0.9 });
  s.Ev(yardBlast2, "explosion", { x: YARD_HIT2.x, z: YARD_HIT2.z, kind: "grenade", radius: 2.6 });
  s.Ev(yardBlast2 + 0.1, "smoke", { x: YARD_HIT2.x, z: YARD_HIT2.z, kind: "SmokeDust", dur: 10, scale: 2 });
  s.Shake(yardBlast2, 0.8, 0.45);
  s.Caption(yardBlast2 + 0.3, 2.6, "（又一阵土从门外灌进来，屋里黑得睁不开眼）");
  s.Eye(X0 + 4.0, yardBlast2 + 1.2 - (X0 + 4.0), { stance: "crouch", x: TANGWU_IN.x - 0.6, z: TANGWU_IN.z, look: RIFLE_E, pitch: -2, toLook: TANGWU_OUT, toPitch: -6, shake: 0.3 });
  const X1 = yardBlast2 + 1.4;
  Shot(s, X1, "player", { count: 2, interval: 0.4 }); Puff(s, X1 + 0.1, Pt(103.2, 472.0));
  Shot(s, X1 + 1.0, "Rifle3", { volume: 0.9 }); Puff(s, X1 + 1.1, Pt(99.2, 474.2)); s.Shake(X1 + 1.05, 0.3, 0.3);
  Shot(s, X1 + 1.8, "LiuWencai", { count: 2, interval: 0.5, volume: 0.9 }); Puff(s, X1 + 1.9, Pt(103.4, 470.8));
  s.Caption(X1 + 0.3, 3.0, "（烟里一间间打：谁也看不清谁，照着枪口火打）");
  s.Eye(X1, 4.0, { stance: "crouch", x: TANGWU_IN.x - 0.6, z: TANGWU_IN.z, look: RIFLE_E, pitch: -2, toLook: Pt(97.0, 472.0), toPitch: -2, shake: 0.3 });
  // ④ 西间递弹的那个从烟里扑出来撞翻顺子，刺刀往下压；妮儿从门外摸进来咬手腕；拔刀砍倒
  const LUNGE = R(X1 + 4.6);
  s.Line(LUNGE, "BeiwuLunge.01", "Rifle1");
  s.Go("Rifle1", LUNGE - 1.0, LUNGE, TANGWU_IN.x - 1.5, 473.4, { move: "run", yawDeg: -90, aim: true });
  s.Key("Rifle1", LUNGE, { clip: VIL.charge, faceTo: TANGWU_IN });
  s.Eye(LUNGE, 1.4, { stance: "crouch", x: TANGWU_IN.x - 0.6, z: TANGWU_IN.z, look: Pt(97.0, 472.0), pitch: -2, toLook: Pt(97.0, 473.4), toPitch: -4, shake: 0.4 });
  s.Shake(LUNGE + 0.6, 0.6, 0.9);
  s.Caption(LUNGE + 0.5, 2.6, "（一个鬼子从烟里扑出来，一肩把顺子撞翻在西间炕沿下）");
  const pin = LUNGE + VilClipS(VIL.charge);
  s.Place("Rifle1", pin, PIN.x, PIN.z, { yawDeg: PIN_YAW, aim: true });
  const T_PIN = pin + 6.3;
  s.HoldLoop("Rifle1", VIL.pin, pin, T_PIN);
  s.Caption(pin + 1.0, 4.0, "（他骑在身上把上了刺刀的枪往下压。顺子两手死死抵住枪身：玩家连按往外推，推不赢，刀尖一点点往下来）");
  s.Caption(pin + 5.0, 2.4, "（刘文财在东间顾不上这边）");
  s.Key("LiuWencai", pin + 0.6, { faceTo: RIFLE_E, aim: true });
  Shot(s, pin + 1.2, "Rifle3", { volume: 0.8 }); Shot(s, pin + 2.0, "LiuWencai", { volume: 0.8 });
  const bite = T_PIN + NIER_MARK.offsetS;
  const BITE_AT = bite + 0.5;
  s.Go("Nier", bite - 3.2, bite - 0.2, NIER_MARK.x, NIER_MARK.z, { move: "run", path: [Pt(97.6, 476.4), TANGWU_OUT, TANGWU_IN], depart: { stance: "stand", clip: null }, yawDeg: NIER_MARK.yawDeg });
  s.Key("Nier", bite, { clip: VIL.bite, clipHold: true });
  s.Caption(bite - 0.4, 2.4, "（妮儿从门外摸进来，一口咬在鬼子握枪的手腕上）");
  s.Eye(pin, bite - 0.4 - pin, { stance: "prone", x: EYE_DOWN.x, z: EYE_DOWN.z, look: PIN, pitch: 38, toPitch: 52, shake: 0.22 });
  s.Eye(bite - 0.4, BITE_AT + 0.9 - (bite - 0.4), { stance: "prone", x: EYE_DOWN.x, z: EYE_DOWN.z, look: PIN, pitch: 52, toLook: NIER_MARK, toPitch: 42, shake: 0.1 });
  const scream = R(BITE_AT + 0.4);
  s.Line(scream, "BeiwuBitten.01", "Rifle1");
  s.Caption(scream + 0.2, 3.0, "（鬼子惨叫，手一松。屏幕弹一个键：拔刀——顺子翻身从左肩抽出大刀砍）");
  const back = scream + 0.3;
  s.Eye(back, 1.4, { stance: "prone", x: EYE_DOWN.x, z: EYE_DOWN.z, look: PIN, pitch: 40, toPitch: 20 });
  s.Eye(back + 1.4, 3.0, { stance: "crouch", x: EYE_DOWN.x, z: EYE_DOWN.z, look: PIN, pitch: -14, shake: 0.2 });
  const chop1 = back + 1.8, chop2 = chop1 + 0.8;
  s.Sfx(chop1, "stab", PIN); s.Sfx(chop2, "stab", PIN);
  s.Shake(chop1, 0.3, 0.4); s.Shake(chop2, 0.3, 0.5);
  s.Key("Rifle1", chop1 + 0.05, { clip: "ShotCollapse", clipHold: true });
  s.Key("Rifle1", chop2 + 1.3, { state: "down", clip: null, yawDeg: 0 });
  s.Sfx(chop2 + 1.3, "bodyFall", PIN);
  s.Key("Nier", chop1 + 0.4, { clip: VIL.cower, stance: "crouch" });
  s.Caption(chop2 + 1.6, 2.6, "（妮儿嘴边沾着血，蹲在炕沿下发抖）");
  s.Eye(chop2 + 1.6, 1.2, { stance: "crouch", x: EYE_DOWN.x, z: EYE_DOWN.z, look: PIN, pitch: -14, toLook: NIER_MARK, toPitch: -22 });
  // ⑤ 分队长带东间剩下的两个从东间窗洞翻出去往东街跑（VilIjaClimbWall 在东间枪眼跟前面朝北，播完切到墙外跑到关键帧位置）
  const CLIMB_S = VilClipS(VIL.climbWall), OUT_N = Pt(RIFLE_E.x, 469.4);
  const flee = (id, t) => {
    const to = UP(K(id));
    s.Go(id, t - 0.8, t, RIFLE_E.x, RIFLE_E.z, { move: "run", stance: "stand", aim: false, yawDeg: 0 });
    s.Key(id, t + 0.05, { clip: VIL.climbWall });
    s.Key(id, t + 0.05 + CLIMB_S, { x: OUT_N.x, z: OUT_N.z, move: "cut", clip: null, stance: "stand", yawDeg: -90 });
    s.Go(id, t + 0.2 + CLIMB_S, R(t + 0.2 + CLIMB_S + Dist(OUT_N, to) / 3.6), to.x, to.z, { move: "run", yawDeg: K(id).yawDeg });
    return R(t + 0.2 + CLIMB_S + Dist(OUT_N, to) / 3.6);
  };
  const F0 = R(chop2 + 2.4);
  s.Caption(F0 - 0.6, 3.0, "（东间：分队长和剩下那个不打了，一个接一个从东间窗洞翻出去——往东街跑）");
  const f1 = flee("Rifle3", F0), f2 = flee("Leader", f1 - 1.6), f3 = f2;
  s.Key("LiuWencai", F0 + 0.4, { faceTo: RIFLE_E, aim: true });
  Shot(s, F0 + 1.2, "LiuWencai", { volume: 0.8 }); Puff(s, F0 + 1.3, Pt(103.6, 470.4));
  s.Caption(f2 - 1.0, 2.6, "（刘文财朝窗洞打了一枪，没打着。北屋空了）");
  s.Eye(chop2 + 2.8, f3 - (chop2 + 2.8), { stance: "crouch", x: EYE_DOWN.x, z: EYE_DOWN.z, look: RIFLE_E, pitch: -2, shake: 0.1 });
  s.Go("LiuWencai", f3 - 0.4, f3 + 1.0, LIU7.x, LIU7.z, { move: "walk", stance: "stand", aim: true, yawDeg: K("LiuWencai").yawDeg });
  // ⑥ 同一时刻墙外路口（院里第一枪之后几秒）：班长 / 何有田隔墙两颗手榴弹甩进墙角 → 撞开门（EastGateBurst）抡大刀冲进去「杀——！」→ 砍倒一个 →
  //    墙角一个挨了手榴弹的鬼子临死甩出一颗，落在门口：Escort1 扑倒死了；一个鬼子刺了何有田一刀，剩下三个往东街跑
  {
    const BG = EYR.behindGate, IP = EYR.inPocket, HITS = EYR.grenadeHits;
    const blast1 = R(T0 + 7.6), blast2 = R(blast1 + 0.9);
    const t1 = R(blast1 - 2.15 - FlightS(BG.Luo, HITS[0])), t2 = R(blast2 - 2.15 - FlightS(BG.HeYoutian, HITS[1]));
    s.Key("Luo", t1, { throw: { x: HITS[0].x, z: HITS[0].z } });
    s.Key("HeYoutian", t2, { throw: { x: HITS[1].x, z: HITS[1].z } });
    s.Caption(t1 + 0.3, 3.0, "（北屋这头一响：班长那一路动手了——门后头两颗手榴弹隔着墙甩进墙角）");
    s.Line(R(blast1 - 0.5), "PocketGrenade.01", "CellarIja2");
    s.Key("CellarIja2", blast1 - 0.4, { clip: "DuckBlast" }); s.Key("NextDoorIja2", blast1 - 0.2, { clip: "DuckBlast" });
    for (const [tb, p] of [[blast1, HITS[0]], [blast2, HITS[1]]]) {
      s.Sfx(tb, "grenadeBlast", { x: p.x, z: p.z, volume: 0.9 });
      s.Ev(tb, "explosion", { x: p.x, z: p.z, kind: "grenade", radius: 2.0 });
      s.Ev(tb + 0.1, "smoke", { x: p.x, z: p.z, kind: "SmokeDust", dur: 3 });
      s.Shake(tb, 0.4, 0.25);
    }
    s.Caption(blast1 + 0.2, 3.2, "（墙外路口「轰、轰」两声、鬼子喊叫：隔着两道墙，北屋里听得见、看不见）");
    // 守着的那个挨了第一颗（还没死，趴着）；隔壁院那个挨了第二颗
    s.Key("CornerIja1", blast1 + 0.05, { clip: "DuckBlast", stance: "crouch", aim: false });
    s.Key("NextDoorIja1", blast2 + 0.05, { clip: "ShotCollapse", clipHold: true });
    s.Go("NextDoorIja1", blast2 + 0.1, blast2 + 1.0, UP(K("NextDoorIja1")).x, UP(K("NextDoorIja1")).z, { move: "walk" });
    s.Key("NextDoorIja1", blast2 + 1.4, { state: "down", clip: null, yawDeg: 30 });
    // 撞开门：门扇倒进 pocket（EastGateBurst），班长换大刀冲出去「杀——！」，何有田、Escort1 端枪跟上
    const burst = R(blast2 + 1.4);
    s.Key("Luo", burst - 0.5, { stance: "stand", weapon: "Dadao", aim: false });
    s.Signal(burst, SIG.eastGateBurst, true);
    s.Sfx(burst, "gateSmash", { x: POCKET_GATE_AT.x, z: POCKET_GATE_AT.z, volume: 0.9 });
    s.Ev(burst + 0.05, "smoke", { x: POCKET_GATE_AT.x, z: POCKET_GATE_AT.z + 0.6, kind: "SmokeDust", dur: 2 });
    const GATE_N = Pt(POCKET_GATE_AT.x, POCKET_GATE_AT.z - 1.0), GATE_S = Pt(POCKET_GATE_AT.x, POCKET_GATE_AT.z + 1.0);
    s.Line(R(burst + 0.1), "LuoKillShout.01", "Luo");
    s.Key("Luo", burst, { clip: "DadaoAmbush" });
    s.Go("Luo", burst + 0.6, burst + 1.5, IP.Luo.x, IP.Luo.z, { move: "run", path: [GATE_N, GATE_S], depart: { clip: "CreepDadao" }, stance: "stand", faceTo: "CellarIja3" });
    s.Caption(burst + 0.2, 3.0, "（班长一肩撞开院门，抡着大刀冲进墙角那伙鬼子里：杀——！贴身砍，不开枪）");
    const chop = R(burst + 1.6);
    s.Key("Luo", chop, { clip: "LuoDadaoChopRear", faceTo: "CellarIja3" });
    s.Sfx(chop + 0.4, "stab", { x: IP.Luo.x, z: IP.Luo.z, volume: 0.8 });
    s.Key("CellarIja3", chop + 0.5, { stance: "stand", clip: "ShotCollapse", clipHold: true });   // 随机骨架只许通用片段：被砍倒用 ShotCollapse 顶
    s.Go("CellarIja3", chop + 0.5, chop + 1.7, UP(K("CellarIja3")).x, UP(K("CellarIja3")).z, { move: "walk" });
    s.Key("CellarIja3", chop + 2.5, { state: "down", clip: null, yawDeg: 40 });
    s.Caption(chop + 0.6, 2.8, "（拖人的那个被一刀砍倒）");
    s.Go("HeYoutian", burst + 0.5, burst + 1.6, IP.HeYoutian.x, IP.HeYoutian.z, { move: "run", path: [GATE_N, GATE_S], depart: { stance: "stand", aim: true }, stance: "stand", aim: true, faceTo: Pt(109, 463) });
    const E1 = UP(K("Escort1"));
    s.Go("Escort1", burst + 0.9, burst + 1.8, E1.x, E1.z, { move: "run", path: [GATE_N], depart: { stance: "stand", aim: true }, stance: "stand", aim: true, faceTo: Pt(109, 463) });
    Shot(s, burst + 2.0, "HeYoutian", { volume: 0.8 });
    // 墙角守着的那个（挨了第一颗，趴着）临死甩出一颗，落在门口：Escort1 扑倒，死了
    const dying = R(burst + 0.8), lastBlast = R(dying + 2.15 + FlightS(UP(K6("CornerIja1")), E1));
    s.Key("CornerIja1", dying, { throw: { x: E1.x, z: E1.z }, stance: "crouch" });
    s.Caption(dying + 1.2, 2.6, "（墙角那个挨了手榴弹的鬼子，临死甩出了一颗——）");
    s.Sfx(lastBlast, "grenadeBlast", { x: E1.x, z: E1.z, volume: 0.9 });
    s.Ev(lastBlast, "explosion", { x: E1.x, z: E1.z, kind: "grenade", radius: 2.0 });
    s.Ev(lastBlast + 0.1, "smoke", { x: E1.x, z: E1.z, kind: "SmokeDust", dur: 4 });
    s.Shake(lastBlast, 0.4, 0.3);
    s.Key("Escort1", lastBlast + 0.05, { clip: "ShotCollapse", clipHold: true });
    s.Key("Escort1", lastBlast + 1.4, { state: "down", clip: null, yawDeg: 20 });
    s.Sfx(lastBlast + 1.4, "bodyFall", E1);
    s.Caption(lastBlast + 0.3, 3.2, "（落在门口。后送队那个兵扑倒在门口，死了）");
    s.Key("CornerIja1", R(dying + 4.3), { state: "down", clip: null, yawDeg: 0 });
    // 一个鬼子刺了何有田一刀（胳膊），然后三个往东街跑
    const stabHe = R(Math.max(chop + 1.2, lastBlast + 0.6));
    s.Key("CellarIja2", stabHe - 0.6, { stance: "stand", clip: null, aim: true, faceTo: "HeYoutian" });
    s.Key("CellarIja2", stabHe, { clip: VIL.thrust, faceTo: "HeYoutian" });
    s.Sfx(stabHe + 0.5, "stab", { x: IP.HeYoutian.x, z: IP.HeYoutian.z, volume: 0.7 });
    s.Key("HeYoutian", stabHe + 0.6, { stance: "crouch", aim: false, clip: null });
    s.Caption(stabHe + 0.6, 2.8, "（挑襁褓的那个一刺刀捅过来：何有田胳膊挨了一刀，枪掉了）");
    s.Key("CellarIja2", stabHe + VilClipS(VIL.thrust), { clip: null });
    for (const [id, dt] of [["CellarIja1", 0.2], ["NextDoorIja2", 0.6], ["CellarIja2", VilClipS(VIL.thrust) + 0.2]]) {
      const to = UP(K(id)), via = Pt(108.8, 464.8), cur = s.pos.get(id);
      s.Go(id, stabHe + dt, R(stabHe + dt + (Dist(cur, via) + Dist(via, to)) / 3.6), to.x, to.z, { move: "run", path: [via], depart: { stance: "stand", aim: false, clip: null }, stance: "stand", yawDeg: K(id).yawDeg });
    }
    s.Caption(stabHe + 3.0, 3.0, "（剩下三个往东街跑了。班长和何有田占住了路口墙角；门口倒着那个兵）");
    s.Key("HeYoutian", stabHe + 3.4, { faceTo: Pt(IP.HeYoutian.x + 3, IP.HeYoutian.z + 1) });
    s.Key("Luo", R(chop + 3.0), { clip: null, faceTo: Pt(109, 464), weapon: "Dadao" });
  }
  RampPotShot(s, 3.0, { volume: 0.4 });
  // 收：机枪哑了、北屋空了（10-1 会合）
  const END = Math.max(f3 + 1.4, chop2 + 6.0);
  s.Caption(END, 3.0, "（约一分半：机枪哑了。北屋里倒着五个、灶屋一个；墙角倒三个，跑了六个；门口倒着后送队那个兵。接 10：会合）");
  s.Eye(f3, END + 3.4 - f3, { stance: "stand", x: EYE_DOWN.x + 0.6, z: EYE_DOWN.z, look: TANGWU_IN, pitch: -2 });
  return s.Done({ durationS: END + 3.4 });
}

// ---------------------------------------------------------------------------
// 10 会合，守路口，挨炮，被炮撵出庄子（第十版 2026-10-30：Escort1 09-7 已死、Squad3 08-3 已死；10-3 掷弹筒打死一个担架员、一组冲路口被扫倒；
// 10-4 Escort2 脖子中枪、排长胳膊中枪；10-5 顺子被第一发炮掀翻、枪脱手、班长拽起来；10-6 幺娃和刘文财架着排长；出村南口「你两个帮到车」）

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
/** 石碾后趴着的射击位（关键帧 10-2…10-4 的玩家位置）与顺子退到石碾南边站着的位置。 */
const K10_ROLLER_PRONE = Pt(111.0, 466.45), K10_ROLLER_SIDE = Pt(110.2, 466.0), K10_ROLLER_CORNER = Pt(110.3, 465.8), K10_YAOWA_BESIDE = Pt(108.6, 466.9);   // 从路口到石碾后要先绕过东街口南墙角（x 110 / z 467）
/** 10-5 顺子被第一发炮掀到的地方、班长蹲到跟前的地方、枪掉的地方（同关键帧 10-5）。 */
const K10_THROWN = Pt(105.6, 467.6), K10_LUO_KNEEL = Pt(104.9, 466.6), K10_LOOSE_GUN = Pt(106.4, 467.9);
/** 10-x 一直趴在原处的死人（Squad3 坡道、Bearer01 / Walker04 沟里、Escort1 pocket 门口……）：关键帧里已是 down，预演不用管。 */
/**
 * 「担架过去了 n / 12」：后送队一副副拐进窄胡同的屏幕说明字（10-2 到 3、10-3 到 6、10-4 到 12）。
 * 这几副担架关键帧 10-2 / 10-3 里还缩在沟东半截（ConvoyInDitch），预演把它们硬切到主街上、顺 CONVOY_LINE 小跑进胡同；每一副拐进胡同口（弧长 ≤ 7.6）那一刻计数。
 */
function K10LitterPass(s, ids, t0, from = 1, { gap = 3.2, speed = 1.9 } = {}) {
  let n = from, t = t0, last = t0;
  for (const id of ids) {
    const d0 = 22.0, d1 = 3.0;
    const a = ConvoyAt(d0, 0), b = ConvoyAt(d1, 0);
    s.Place(id, t, a.x, a.z, { yawDeg: Yaw(a, ConvoyAt(d0 - 2, 0)) });
    const dur = R((d0 - d1) / speed);
    s.Go(id, t + 0.2, t + 0.2 + dur, b.x, b.z, { move: "run", path: ConvoyPath(d0, d1, 0), yawDeg: 180 });
    const pass = R(t + 0.2 + (d0 - 7.6) / speed);
    s.Caption(pass, 2.6, `担架过去了 ${n} / 12`);
    last = Math.max(last, t + 0.2 + dur);
    n++; t = R(t + gap);
  }
  return { next: n, end: R(last) };
}
/** 一个鬼子被机枪扫倒：玩家一梭（mgBurstNear）→ ShotCollapse → 走到倒地点 → down。 */
function K10MgKill(s, id, t, to, yaw, { count = 6 } = {}) {
  Shot(s, t, "player", { count, interval: 0.11, sfx: "mgBurstNear" });
  s.Key(id, t + 0.3, { clip: "ShotCollapse", clipHold: true });
  if (to) s.Go(id, t + 0.35, t + 1.3, to.x, to.z, { move: "walk" });
  s.Key(id, t + 1.8, { state: "down", clip: null, yawDeg: yaw });
  return R(t + 1.8);
}

function S1001(ctx) {
  const s = new Seq(ctx, "10-1", "会合：机枪哑了，班长在墙角冲坡道吼；坡道上两个冲上来；门口倒着 Escort1");
  const K = id => KU(ctx, "10-1", id), K2 = id => KU(ctx, "10-2", id);
  const P = KP(ctx, "10-1");
  const IP = EYR.inPocket;
  // 开场：09-7 刚打完——北屋里倒着五个 + 扑倒顺子的那个，灶屋里一个；机枪哑了（MgSilenced 从这一帧起）；班长、何有田在 pocket 里，门口倒着 Escort1
  s.Signal(0, SIG.mgSilenced, true);
  s.Key("Luo", 0, { stance: "stand", weapon: "Dadao", aim: false, faceTo: Pt(112, 464.5) });
  s.Key("HeYoutian", 0, { stance: "crouch", aim: false, faceTo: Pt(112, 464.5), clip: "PvLegHitKneelClutch", clipHold: true });   // 胳膊挨了一刺刀：先捂着（没有专门的手臂片段，借蹲捂那一下）
  s.Key("HeYoutian", 3.0, { clip: null, aim: true });
  s.Key("LiuWencai", 0, { stance: "stand", aim: true, faceTo: Pt(G.rifleEastPost.x, G.rifleEastPost.z - 6) });
  s.Key("Nier", 0, { stance: "crouch", faceTo: "player", clip: VIL.cower });
  s.Eye(0, 2.6, { stance: "stand", look: MG_AT, pitch: -8 });
  s.Caption(0.3, 3.0, "（枪眼后头那挺十一年式哑了。北屋里倒着四个——机枪组三个和扑倒顺子的那个，灶屋里一个；妮儿蹲在墙根发抖）");
  // 跑掉的五个：分队长带一个翻窗跑了、墙角跑了三个——这时在东街上往街北第一个院跑（10-1 的站位 → 继续往东）
  for (const id of ["Leader", "Rifle3", "CellarIja1", "CellarIja2", "NextDoorIja2"]) {
    const u = K(id);
    s.Key(id, 0, { stance: "stand", aim: false, yawDeg: -90 });
    s.Go(id, 0.4, 4.4, u.x + 11.0, u.z - 0.2 * (id.length % 3), { move: "run", yawDeg: -90 });
  }
  s.Caption(2.8, 2.8, "（分队长带一个从东间窗洞翻出去，墙角又跑了三个：五个顺东街往东跑了）");
  // 机枪一哑，班长在墙角里扭头冲八十米外的坡道吼：机枪哑了！冲！—— 坡道上的幺娃和后送队的兵顺主街冲上来
  const charge = s.Say("MgSilenced.01", "Luo", 3.4);
  s.Key("Luo", charge - 0.3, { faceTo: Pt(ST.main.c, 392), clip: WAVE_ON });
  s.Key("Luo", s.End("MgSilenced.01") + 0.4, { clip: null, faceTo: Pt(112, 464.5) });
  for (const id of ["Yaowa", "Escort2"]) {
    const u = KU(ctx, "09-7", id), mid = K(id), to = K2(id);
    s.Place(id, 0, u.x, u.z, { stance: "prone", aim: true, yawDeg: 177 });
    s.Go(id, charge + 1.2, charge + 1.2 + Dist(u, mid) / 3.4, mid.x, mid.z, { move: "run", depart: { stance: "stand" }, stance: "stand", yawDeg: 180, aim: id === "Escort2" });
    const r = Route(mid, to);
    s.Go(id, charge + 1.4 + Dist(u, mid) / 3.4, charge + 1.4 + (Dist(u, mid) + RouteLen(mid, [...r.path, r.end])) / 3.4, r.end.x, r.end.z, { move: "run", path: r.path, stance: "crouch", yawDeg: to.yawDeg });
  }
  s.Caption(charge + 0.2, 3.0, "（班长在墙角里扭头冲八十米外的坡道吼；坡道上剩下的两个——幺娃和后送队的兵——爬起来顺主街冲上来）");
  // 眼睛切到东间枪眼（正对着墙角 ±17°）：墙角里的班长、何有田，门口倒着 Escort1
  const loop = Pt(G.rifleEastPost.x, G.rifleEastPost.z);
  const look1 = R(s.End("MgSilenced.01") + 0.6);
  s.Cam(look1, 1.4, { from: { x: P.x, z: P.z, h: 1.55 }, to: { ...loop, h: 1.1 }, look: { x: IP.Luo.x, z: IP.Luo.z, h: 1.0 } });
  s.Eye(look1 + 1.4, 9.0, { stance: "crouch", x: loop.x, z: loop.z - 0.2, look: Pt(IP.Luo.x, IP.Luo.z), pitch: -2, fov: 50 });
  s.Caption(look1 + 0.4, 3.2, "（东间的枪眼正对着路口墙角：班长和何有田站在墙角里，脚下倒着三个鬼子，门口倒着一个自己人——后送队那个兵）");
  const glance = R(look1 + 3.2);
  s.Key("Luo", glance, { faceTo: "Escort1" });
  s.Caption(glance + 0.2, 2.8, "（班长看一眼门口倒着的那个兵，不说话）");
  s.Key("Luo", glance + 1.6, { weapon: "HanYang", aim: true, faceTo: Pt(146, ST.east.c) });
  s.Caption(glance + 2.0, 2.6, "（他把大刀插回背上，端起枪朝东。两路在丁字路口会合）");
  s.Key("HeYoutian", glance + 1.8, { faceTo: Pt(146, ST.east.c) });
  s.Caption(glance + 4.6, 3.0, "（东头的枪声近了——喊人那个把后头的人带回来了）");
  for (const [t, v] of [[glance + 4.6, 0.45], [glance + 6.4, 0.6]]) s.Sfx(t, "rifleShot", { x: 180, z: 465, volume: v });
  return s.Done({ durationS: glance + 8.2 });
}

function S1002(ctx) {
  const s = new Seq(ctx, "10-2", "守路口·试探：缴来的机枪拖到石碾后朝东；一换弹斗他们就跳一个门洞；担架开始过胡同");
  const K = id => KU(ctx, "10-2", id), K1 = id => KU(ctx, "10-1", id);
  const P = KP(ctx, "10-2");
  const loop = Pt(G.rifleEastPost.x, G.rifleEastPost.z);
  // 开场：顺子还在北屋东间枪眼后；班长、何有田在 pocket，刘文财在东间，幺娃、Escort2 刚到路口（10-2 的位置）；排长、Squad1 / 2 还在沟底
  for (const id of ["Luo", "HeYoutian", "LiuWencai"]) { const u = K1(id); s.Place(id, 0, u.x, u.z, { stance: id === "Luo" ? "stand" : "crouch", aim: true, yawDeg: -90 }); }
  const east0 = { EastIja1: Pt(182.6, 457.6), EastIja2: Pt(184.4, 457.0), EastIja3: Pt(186.0, 458.2), EastIja4: Pt(187.4, 457.0), EastIja5: Pt(189.0, 458.4), EastIja6: Pt(183.4, 458.8), EastIja7: Pt(185.6, 458.4), EastIja8: Pt(190.6, 457.2), EastIja9: Pt(192.2, 458.4) };
  const JOG_PATH = [Pt(180.2, 458.2), Pt(180.0, 463.6)];   // 从东街中段过第一道弯到东街：先到弯里再往南拐（别斜着切拐角的墙）
  for (const [id, p] of Object.entries(east0)) s.Place(id, 0, p.x, p.z, { state: "alive", stance: "crouch", aim: true, yawDeg: 90 });
  for (const id of ["Leader", "Rifle3", "CellarIja1", "CellarIja2", "NextDoorIja2"]) { const u = K1(id); s.Place(id, 0, u.x + 11.0, u.z, { state: "alive", stance: "stand", yawDeg: -90 }); }
  s.Eye(0, 2.6, { stance: "crouch", x: loop.x, z: loop.z - 0.2, look: Pt(130, ST.east.c), pitch: -1, fov: 50 });
  for (const [t, v] of [[0.4, 0.6], [1.3, 0.7]]) s.Sfx(t, "rifleShot", { x: 185, z: 458, volume: v });
  // 班长在墙角吼：调过来！朝东打！（挥手朝东指）
  s.Key("Luo", 0.6, { faceTo: "player" });
  const turn = s.Say("TurnEast.01", "Luo", 1.2);
  s.Key("Luo", turn + 0.2, { clip: POINT_STAND, faceTo: EAST_END });
  s.Key("Luo", turn + 2.0, { clip: null });
  // 全班调到东街口；何有田进北屋拆机枪组的子弹袋；排长、Squad1 / 2 从沟底顺主街跑上来
  for (const id of ["Luo", "LiuWencai", "Yaowa", "Escort2", "HeYoutian"]) {
    const to = K(id);
    const t0 = turn + 1.2 + (id === "Luo" ? 0 : 0.6);
    const r = Route(s.pos.get(id), to);
    s.Go(id, t0, t0 + Math.max(0.8, RouteLen(s.pos.get(id), [...r.path, r.end]) / 3.2), r.end.x, r.end.z, { move: "run", path: r.path, depart: { clip: null }, stance: "crouch", yawDeg: to.yawDeg, ...(to.aim ? { aim: true } : {}) });
  }
  for (const [id, dt] of [["Officer", 0], ["Squad1", 0.8], ["Squad2", 1.4]]) { const to = K(id); s.Walk(id, turn + 1.6 + dt, UP(to), { move: "run", speed: 3.2, stance: to.stance || "stand", yawDeg: to.yawDeg, aim: !!to.aim }); }
  // 顺子把缴来的十一年式拖出北屋，出堂屋门、院门，顺窄胡同口到路口的石碾后头（约 45 m）
  let t = turn + 1.0, cur = Pt(loop.x, loop.z - 0.2);
  s.Caption(t, 3.4, "（顺子把缴来的十一年式拖出北屋：出堂屋门、院门，顺着窄胡同口跑到路口，拖到石碾后头朝东）");
  const pts = [TANGWU_OUT, Pt(102.6, 482.6), GATE_IN, GATE_OUT, Pt(LANE_X, 470.5), Pt(110.4, 467.6), Pt(P.x, P.z)];
  for (const p of pts) { const dur = R(Dist(cur, p) / 3.0); s.Creep(t, dur, cur, p, p === pts.at(-1) ? EAST_END : p, { h: 1.3, lookH: 1.0, ease: "linear" }); t = R(t + dur); cur = p; }
  const prone = R(t + 0.6);
  s.Caption(prone + 0.4, 3.6, "（弹斗一次装六个五发桥夹，三十发；子弹只有机枪组身上带的那些。东街又直又长，到第一道弯 67 m，过了弯看不见）");
  // 跑掉的五个：四个扑进街北第一个院的院门，跑在最后的 Rifle3 被机枪扫倒在街上
  for (const [id, dt] of [["Leader", 0], ["CellarIja1", 0.4], ["CellarIja2", 0.8], ["NextDoorIja2", 1.2], ["Rifle3", 1.8]]) {
    const to = UP(K(id));
    const r = Route(s.pos.get(id), to);
    s.Go(id, 2.0 + dt, 2.0 + dt + RouteLen(s.pos.get(id), [...r.path, r.end]) / 3.6, r.end.x, r.end.z, { move: "run", path: r.path, yawDeg: -90, ...(id !== "Rifle3" ? { stance: "crouch" } : {}) });
  }
  K10MgKill(s, "Rifle3", prone + 1.0, null, -80);
  Puff(s, prone + 1.5, Pt(124.0, 465.0));
  s.Caption(prone + 1.6, 2.8, "（跑在最后那个被一梭子扫倒在街上，前头四个扑进了街北第一个院的院门）");
  // 换弹斗：一停火，他们就跳一个门洞
  const reload = R(prone + 3.0);
  s.Caption(reload, 4.0, "（一换弹斗：压六个五发桥夹，好几秒。一停火，他们就跳一个门洞）");
  const go = R(reload + 0.6);
  for (const id of ["EastIja6", "EastIja7"]) { const to = UP(K(id)); const len = RouteLen(s.pos.get(id), [JOG_PATH[0], to]); s.Go(id, go, go + len / 3.6, to.x, to.z, { move: "run", path: [JOG_PATH[0]], stance: "crouch", aim: true, yawDeg: 90 }); }
  for (const id of ["EastIja10", "EastIja11", "EastIja12", "EastIja13"]) { const u = K(id); s.Key(id, 0, { yawDeg: u.yawDeg, aim: true }); }
  s.Caption(go + 0.4, 3.2, "（第一道弯那头冒出两个人头趴在拐角；街南两座后墙对街的北屋，豁子里探出枪来打冷枪）");
  Shot(s, go + 1.0, "EastIja10", { volume: 0.8 }); Puff(s, go + 1.3, Pt(112.2, 466.0));
  Shot(s, go + 2.4, "EastIja12", { volume: 0.7 }); Puff(s, go + 2.7, Pt(113.0, 465.4));
  s.Shake(go + 2.7, 0.3, 0.2);
  // 第一组三个趁换弹斗从第一道弯跳到场院口（带头的喊）；装好了一梭扫倒一个（EastIja2 跑到场院口外头）
  const order1 = s.Say("ProbeOrders.01", "EastIja5", go + 1.6);
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
  s.Caption(dash + 0.6, 3.0, "（三个一组趁换弹斗从弯那头冲出来，顺街北跑几步扑进场院的口子）");
  const luoCall1 = s.Say("LuoCallouts.02", "Luo", dash + 1.6);
  s.Key("Luo", luoCall1 - 0.3, { faceTo: PB.ES2Breach, clip: POINT_CROUCH });
  s.Key("Luo", s.End("LuoCallouts.02") + 0.4, { clip: null, faceTo: Pt(190, ST.east.c), aim: true });
  Shot(s, s.End("LuoCallouts.02") + 0.4, "player", { count: 5, interval: 0.11, sfx: "mgBurstNear" }); Puff(s, s.End("LuoCallouts.02") + 0.8, Pt(PB.ES2Breach.x, PB.ES2Breach.z - 0.8));
  const t2 = dash + 0.8 + RouteLen(east0.EastIja2, [...JOG_PATH, Pt(JOG1.x - 1.2, ST.east.c - 1.0), dashTo.EastIja2]) / 3.6;
  K10MgKill(s, "EastIja2", Math.max(t2 - 0.9, s.End("LuoCallouts.02") + 1.4), null, 110);
  const down = s.Say("ProbeOrders.02", "EastIja5", t2 - 0.2);
  s.Caption(down + 0.4, 2.8, "（机枪一扫就趴：倒了一个，剩下的扑进了场院口）");
  // 第二拨：从街北第一个院的院门冲出来往西（左手第二道门），被扫倒在半道
  const out1 = s.End("ProbeOrders.02") + 1.6;
  s.Place("EastIja1", out1 - 0.1, PB.EN1Gate.x + 0.6, PB.EN1Gate.z - 1.0, { stance: "crouch", aim: true, yawDeg: 180 });
  const luoCall2 = s.Say("LuoCallouts.01", "Luo", out1 + 0.2);
  s.Key("Luo", luoCall2 - 0.3, { faceTo: PB.EN1Gate, clip: POINT_CROUCH });
  s.Key("Luo", s.End("LuoCallouts.01") + 0.4, { clip: null, faceTo: Pt(190, ST.east.c), aim: true });
  const e1 = UP(K("EastIja1"));
  const e1run = Dist(Pt(PB.EN1Gate.x + 0.6, PB.EN1Gate.z - 1.0), e1) / 3.6;
  s.Go("EastIja1", out1 + 0.4, out1 + 0.4 + e1run, e1.x, e1.z, { move: "run", path: [Pt(PB.EN1Gate.x, ST.east.c - 0.6)], stance: "crouch", aim: true, yawDeg: 90 });
  K10MgKill(s, "EastIja1", out1 + 0.4 + e1run - 0.6, null, 80);
  s.Caption(out1 + 0.6, 3.2, "（左手第二道门里又冲出一个，跑几步扑向下一个门洞——没扑到）");
  // 两个从弯那头往土地庙跑（10-3 缩在庙后）；东头大路上陆续还有人来（远远地往西挪）
  for (const [id, dt] of [["EastIja8", 0], ["EastIja9", 0.5]]) { const to = UP(K(id)); const len = RouteLen(s.pos.get(id), [...JOG_PATH, to]); s.Go(id, out1 + 3.0 + dt, out1 + 3.0 + dt + len / 3.6, to.x, to.z, { move: "run", path: JOG_PATH, stance: "crouch", yawDeg: 90 }); }
  for (const [id, k] of [["FarIja1", 0], ["FarIja2", 1], ["FarIja3", 2]]) { const u = K(id); s.Go(id, 4.0 + k * 1.2, out1 + 5.0 + k * 0.6, u.x - 3.0, u.z, { move: "walk", stance: "crouch", yawDeg: 90 }); }
  s.Caption(out1 + 3.2, 3.0, "（再往东，大路上还有人陆续进庄：东街东头一个两个弯着腰往西挪）");
  Shot(s, out1 + 4.0, "EastIja11", { volume: 0.7 }); Puff(s, out1 + 4.3, Pt(113.6, 466.4));
  Shot(s, out1 + 5.2, "player", { count: 4, interval: 0.11, sfx: "mgBurstNear" }); Puff(s, out1 + 5.6, Pt(PB.ES3Breach.x, PB.ES3Breach.z - 0.8));
  s.Caption(out1 + 5.8, 3.4, "（他们不往街上硬冲：几个门洞、几个豁子轮着冒头打冷枪。这挺枪守得住路口，但子弹只有这些）");
  // 后送队开始过胡同：前三副贴着石碾背后拐进窄胡同（屏幕说明字「担架过去了 n / 12」）
  const pass = K10LitterPass(s, ["Litter01", "Litter02", "Litter03"], prone + 2.0, 1, { gap: 4.6 });
  s.Caption(prone + 2.2, 3.0, "（后送队开始上来了：贴着石碾背后一副副拐进窄胡同。班长：担架过胡同！）");
  s.Eye(prone, out1 + 6.0 - prone, { stance: "prone", look: Pt(JOG1.x - 2, JOG1.z), pitch: 1, fov: 50 });
  s.Eye(out1 + 6.0, 2.0, { stance: "prone", look: Pt(JOG1.x - 2, JOG1.z), pitch: 1, toLook: PB.FarmOpen, toPitch: 1, fov: 50 });
  return s.Done({ durationS: Math.max(out1 + 9.0, pass.end + 0.5) });
}

function S1003(ctx) {
  const s = new Seq(ctx, "10-3", "掷弹筒·机枪掉头：土地庙后的轻机枪、麦秸垛后的「嘭」、一发落在胡同口；冲路口的一组被扫倒；砸门越来越近，机枪掉头对准院门");
  const K = id => KU(ctx, "10-3", id), K2 = id => KU(ctx, "10-2", id);
  const P = KP(ctx, "10-3");
  const farmDoor = Pt(ES.northChain.farmyardDoor.x, ES.northChain.farmyardDoor.z), yard1Door = Pt(ES.northChain.yard1Door.x, ES.northChain.yard1Door.z);
  // 开场：顺子趴在石碾后（10-2 的位置朝东）；轻机枪组从第一道弯那头跑到土地庙东北边架枪；缩在庙后的两个、场院口的三个都在；担架员 Bearer02 活着在胡同口抬担架
  for (const id of ["Yaowa", "LiuWencai", "Squad1", "HeYoutian", "Escort2", "Officer"]) { const u = K2(id); s.Place(id, 0, u.x, u.z, { stance: u.stance || "stand", aim: !!u.aim, yawDeg: u.yawDeg }); }
  s.Place("EastMg1", 0, 183.0, 457.4, { stance: "crouch", yawDeg: 90, aim: false }); s.Place("EastMg2", 0, 184.6, 457.0, { stance: "crouch", yawDeg: 90 });
  for (const id of ["EastIja3", "EastIja4", "EastIja5"]) { const u = K2(id); s.Place(id, 0, u.x, u.z, { stance: u.stance || "stand", aim: true, yawDeg: 90 }); }
  s.Place("Bearer02", 0, 107.4, 468.4, { state: "alive", stance: "stand", yawDeg: 170 });
  for (const [id, x] of [["ChargeIja1", 128.6], ["ChargeIja2", 131.4], ["ChargeIja3", 134.0]]) s.Place(id, 0, x, 464.2 + (x % 2), { state: "alive", stance: "crouch", aim: false, yawDeg: 90 });
  s.Signal(0, SIG.northYardGatesBroken, false);
  s.Eye(0, 20, { stance: "prone", x: P.x, z: P.z, look: SHRINE, pitch: 1, fov: 50 });
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
  // 一组冲路口空地：三个从东街上一口气往路口冲，被机枪扫倒在东街口
  const charge = R(mgOn + 4.0);
  const chargeTo = { ChargeIja1: UP(K("ChargeIja1")), ChargeIja2: UP(K("ChargeIja2")), ChargeIja3: UP(K("ChargeIja3")) };
  let chargeIn = charge;
  for (const [id, dt] of [["ChargeIja1", 0], ["ChargeIja2", 0.3], ["ChargeIja3", 0.6]]) { const to = chargeTo[id]; const t1 = R(charge + dt + (Dist(s.pos.get(id), to) - 1.5) / 4.2); chargeIn = Math.max(chargeIn, t1); s.Go(id, charge + dt, t1, to.x + 1.5, to.z, { move: "run", stance: "stand", aim: true, yawDeg: 90 }); }
  s.Caption(charge + 0.3, 2.6, "（一组三个从东街上一口气往路口空地冲）");
  const sweep = R(chargeIn + 0.3);
  Shot(s, sweep, "player", { count: 8, interval: 0.11, sfx: "mgBurstNear" });
  for (const [id, dt, yaw] of [["ChargeIja1", 0.2, 70], ["ChargeIja2", 0.5, 100], ["ChargeIja3", 0.8, 60]]) { s.Key(id, sweep + dt, { clip: "ShotCollapse", clipHold: true }); s.Go(id, sweep + dt + 0.05, sweep + dt + 1.1, chargeTo[id].x, chargeTo[id].z, { move: "walk" }); s.Key(id, sweep + dt + 1.6, { state: "down", clip: null, yawDeg: yaw }); }
  s.Caption(sweep + 0.6, 2.8, "（一梭子扫倒在东街口，三个都没爬起来）");
  // 掷弹筒三发：嘭 → 5.5 s 后落地，一发比一发近（十几米 → 胡同口 → 石碾跟前）；掷弹筒组躲在场院里（看不见，只听得见、看得见冒上来的烟）
  {
    const g = UP(K("Mortar1")), gYaw = Yaw(g, ROLLER);
    const ld = Fwd(g, gYaw, 0.30, 0.46);
    const pop1 = Math.max(s.End("EastEndOfficer.02") + 1.0, sweep + 2.0);
    const from = R((((1.6 - pop1) % 2) + 2) % 2);
    s.Place("Mortar1", 0, g.x, g.z, { yawDeg: gYaw, stance: "crouch", aim: false, clip: "PvIjaLauncherFire", clipFrom: from });
    s.Place("Mortar2", 0, ld.x, ld.z, { yawDeg: R(gYaw + 50), stance: "crouch", aim: false, clip: "PvIjaLauncherLoad", clipFrom: from });
    s.Key("Mortar3", 0, { stance: "crouch", faceTo: ROLLER });
    const h1 = Mortar(s, pop1, Pt(127.0, 463.6), { shake: 0.25 });
    s.Caption(pop1 + 0.3, 3.4, "（场院麦秸垛后头「嘭」一声：掷弹筒开始找石碾。从石碾后看不见垛子，只看得见冒上来的烟）");
    s.Caption(h1 + 0.3, 2.4, "（第一发落在十几米外）");
    // 第二发落在胡同口：打死一个抬担架的（Bearer02）
    const b2 = UP(K("Bearer02"));
    const h2 = Mortar(s, h1 + 1.4, Pt(107.9, 470.4), { shake: 0.6, radius: 3.5 });
    s.Key("Bearer02", h2 + 0.05, { clip: "ShotCollapse", clipHold: true });
    s.Go("Bearer02", h2 + 0.1, h2 + 0.9, b2.x, b2.z, { move: "walk" });
    s.Key("Bearer02", h2 + 1.4, { state: "down", clip: null, yawDeg: 120 });
    s.Eye(h2 - 0.2, 1.0, { stance: "prone", x: P.x, z: P.z, look: SHRINE, pitch: 1, toLook: b2, toPitch: -4, fov: 50, shake: 0.5 });
    s.Eye(h2 + 0.8, 2.4, { stance: "prone", x: P.x, z: P.z, look: b2, pitch: -4, toLook: SHRINE, toPitch: 1, fov: 50 });
    s.Caption(h2 + 0.4, 3.0, "（一发落在胡同口，打死一个抬担架的）");
    // 担架接着过（4 / 12 → 6 / 12）
    const pass = K10LitterPass(s, ["Litter04", "Litter05", "Litter06"], h2 + 2.4, 4, { gap: 4.0 });
    // 北边院子「咣、咣」砸门，一个院子一个院子往西挪：军官叫人砸北边的院门穿院子抄后路
    const north = s.Say("EastEndOfficer.03", "EastOfficer", h1 + 0.4);
    const GATE_M = 0.55 + 0.15;
    // 两路（10-24）：北角那道院门（pocket 北门）09-7 已被班长撞开、敞着，院子链上只剩两道门要砸（场院西隔墙、北侧第一个院西墙）
    const n0 = { NorthIja4: [Pt(farmDoor.x + GATE_M, farmDoor.z), 90], NorthIja3: [Pt(yard1Door.x + GATE_M, yard1Door.z), 90], NorthIja2: [Pt(yard1Door.x + 2.2, yard1Door.z + 1.2), 90], NorthIja1: [Pt(yard1Door.x + 2.0, yard1Door.z + 1.6), 90] };
    for (const [id, [p, yaw]] of Object.entries(n0)) s.Place(id, 0, p.x, p.z, { stance: "stand", aim: false, yawDeg: yaw });
    const SMASH_SFX_LEAD = R(0.45 - SFX_FILE.gateSmash.hits[0]);
    const smash = (id, tt, p, v) => { s.Key(id, tt, { clip: VIL.smash }); s.Sfx(tt + SMASH_SFX_LEAD, "gateSmash", { x: p.x, z: p.z, volume: v }); s.Ev(tt + 0.5, "smoke", { x: p.x - 0.6, z: p.z, kind: "SmokeDust", dur: 2.0 }); s.Key(id, tt + VilClipS(VIL.smash), { clip: null }); return R(tt + 1.6); };
    const sm0 = Math.max(s.End("EastEndOfficer.03") + 0.6, h2 + 3.0);
    smash("NorthIja4", sm0, farmDoor, 0.4);
    const broken = smash("NorthIja3", sm0 + 3.4, yard1Door, 0.7);
    s.Caption(sm0 + 0.6, 3.4, "（北边院子里「咣、咣」砸门，一个院子一个院子往西挪，越来越近，门洞冒土：场院的门、北侧第一个院的门——再往西那道北角院门是班长撞开的，敞着）");
    s.Signal(broken, SIG.northYardGatesBroken, true);
    s.Sfx(broken, "dirtFall", { x: yard1Door.x, z: yard1Door.z, volume: 0.6 });
    s.Ev(broken, "smoke", { x: yard1Door.x - 0.6, z: yard1Door.z, kind: "SmokeDust", dur: 2.5 });
    s.Caption(broken + 0.2, 2.8, "（第二道门倒了：有人要从石碾背后西北角那道敞着的院门钻出来）");
    for (const id of ["NorthIja4", "NorthIja3", "NorthIja2"]) {
      const to = UP(K(id));
      const k = ["NorthIja4", "NorthIja3", "NorthIja2"].indexOf(id);
      const path = [Pt(farmDoor.x, farmDoor.z), Pt(yard1Door.x, yard1Door.z), Pt(114.5, 450.5)].filter(p => p.x > to.x + 0.5 && p.x < s.pos.get(id).x - 0.5);
      const len = RouteLen(s.pos.get(id), [...path, to]);
      s.Go(id, broken + 0.9 + k * 0.5, broken + 0.9 + k * 0.5 + len / 3.3, to.x, to.z, { move: "run", path, stance: "stand", aim: true, yawDeg: K(id).yawDeg });
    }
    const n1 = UP(K("NorthIja1"));
    { const path = [Pt(yard1Door.x, yard1Door.z), Pt(114.5, 452.0)]; const len = RouteLen(s.pos.get("NorthIja1"), [...path, n1]); s.Go("NorthIja1", broken + 0.5, broken + 0.5 + len / 3.3, n1.x, n1.z, { move: "run", path, stance: "crouch", aim: true, yawDeg: K("NorthIja1").yawDeg }); }
    // 班长：左手院子！文财、幺娃，给老子堵到！—— 刘文财和 Squad1 蹲到北角口上；顺子把机枪掉头对准石碾西北角那道院门
    s.Key("Luo", broken - 0.6, { faceTo: POCKET_GATE });
    const hold = s.Say("HoldEastStreet.01", "Luo", broken + 0.6);
    s.Key("Luo", hold + 1.0, { clip: POINT_CROUCH });
    s.Key("Luo", hold + 3.6, { clip: null, faceTo: EAST_END, aim: true });
    for (const id of ["LiuWencai", "Squad1"]) { const to = K(id); s.Go(id, hold + 1.6 + (id === "Squad1" ? 0.4 : 0), hold + 3.4 + (id === "Squad1" ? 0.4 : 0), to.x, to.z, { move: "run", stance: "crouch", aim: true, yawDeg: to.yawDeg }); }
    s.Caption(hold + 1.2, 3.0, "（文财、Squad1 蹲到北角口上堵。最前头那个已经到了北角院门外）");
    const turn = R(hold + 2.4);
    // 幺娃蹲在 (107.2,466.4) 正挡在石碾后的眼睛和北角院门的连线上：机枪掉头前他先挪到北角口刘文财旁边，段末再回到关键帧 10-3 的窝（10-4 从那儿起步）
    const K10_YAOWA_ASIDE = Pt(106.0, 462.6), yaowa0 = UP(K("Yaowa"));
    s.Go("Yaowa", hold + 0.6, hold + 1.8, K10_YAOWA_ASIDE.x, K10_YAOWA_ASIDE.z, { move: "run", stance: "crouch", aim: true, faceTo: POCKET_GATE });
    s.Eye(turn, 1.4, { stance: "prone", x: P.x, z: P.z, look: SHRINE, pitch: 1, toLook: POCKET_GATE, toPitch: 0, fov: 50 });
    s.Eye(turn + 1.4, 9.0, { stance: "prone", x: P.x, z: P.z, look: POCKET_GATE, pitch: 0, fov: 50 });
    s.Caption(turn + 0.2, 3.4, "（顺子把机枪掉头对准石碾西北角那道院门：门一破就扫进去）");
    // 门里冒头：扫进门洞，他缩回去（不杀——10-4 他还在门外）
    const peek = R(Math.max(turn + 2.0, broken + 0.5 + RouteLen(Pt(yard1Door.x + 2.0, yard1Door.z + 1.6), [Pt(yard1Door.x, yard1Door.z), Pt(114.5, 452.0), n1]) / 3.3 + 0.4));
    Shot(s, peek, "NorthIja1", { volume: 0.9 }); Puff(s, peek + 0.3, Pt(110.2, 466.0));
    Shot(s, peek + 0.6, "player", { count: 10, interval: 0.11, sfx: "mgBurstNear" });
    Puff(s, peek + 0.9, Pt(POCKET_GATE.x - 0.4, POCKET_GATE.z + 0.6)); Puff(s, peek + 1.2, Pt(POCKET_GATE.x + 0.5, POCKET_GATE.z - 0.3));
    s.Ev(peek + 0.9, "smoke", { x: POCKET_GATE.x, z: POCKET_GATE.z, kind: "SmokeDust", dur: 2.5 });
    s.Go("NorthIja1", peek + 0.8, peek + 1.6, n1.x + 0.4, n1.z - 1.6, { move: "run", stance: "crouch", yawDeg: 180 });
    s.Go("NorthIja1", peek + 3.4, peek + 4.2, n1.x, n1.z, { move: "walk", stance: "crouch", aim: true, yawDeg: K("NorthIja1").yawDeg });
    s.Caption(peek + 0.8, 2.8, "（门洞里一冒头，一梭子扫进门洞：缩回去了）");
    // 第三发落到石碾跟前；何有田把拆下来的子弹袋递过来
    const h3 = Mortar(s, Math.max(h2 + 6.0, hold + 3.0), Pt(115.4, 464.2), { shake: 0.8, radius: 3.5 });
    s.Eye(h3 - 0.1, 0.8, { stance: "prone", x: P.x, z: P.z, look: POCKET_GATE, pitch: 0, toPitch: -6, fov: 50, shake: 0.6 });
    s.Caption(h3 + 0.3, 3.2, "（再下一发落到石碾跟前。弹斗里还剩几发、落点还差几步：玩家看得见的两个倒计时）");
    const he = UP(K("HeYoutian"));
    s.Walk("HeYoutian", h1 + 0.6, he, { move: "run", speed: 3.2, stance: "crouch", faceTo: "player" });
    s.Caption(h1 + 2.0, 2.6, "（何有田把拆下来的子弹袋递过来：就这些了）");
    s.Eye(h3 + 0.7, 3.0, { stance: "prone", x: P.x, z: P.z, look: POCKET_GATE, pitch: 0, fov: 50 });
    s.Caption(Math.max(h3 + 1.2, pass.end - 2.0), 2.8, "（后送队一副副往胡同里拐。接 10-4）");
    const endT = R(Math.max(h3 + 4.0, pass.end + 0.6, peek + 4.6));
    s.Go("Yaowa", endT - 2.4, endT - 1.0, yaowa0.x, yaowa0.z, { move: "run", stance: "crouch", aim: false, faceTo: K10_ROLLER_PRONE });
    void north; void order; void retreat;
    return s.Done({ durationS: endT });
  }
}

function S1004(ctx) {
  const s = new Seq(ctx, "10-4", "后送队过胡同：贴着石碾背后一副一副拐进窄胡同；妮儿抱住老耿的腿；Escort2 脖子中枪；幺娃接到");
  const K = id => KU(ctx, "10-4", id), K3 = id => KU(ctx, "10-3", id);
  const P = KP(ctx, "10-4");
  // 开场：顺子趴在石碾后（朝东）；班长、幺娃、Escort2、何有田、刘文财、Squad1 在 10-3 的位置；后送队还在主街上（比关键帧位置往北 26 m），顺主街跑到路口、贴着石碾背后拐进胡同
  for (const id of ["Luo", "Yaowa", "Escort2", "HeYoutian", "LiuWencai", "Squad1", "Officer"]) { const u = K3(id); s.Place(id, 0, u.x, u.z, { state: "alive", stance: u.stance || "stand", aim: !!u.aim, yawDeg: u.yawDeg }); }
  const convoy = (ctx.config.keyframes.find(k => k.id === "10-4").units).filter(u => /^(Litter\d\d|LitterDonggua|Walker\d\d|Helper\d\d)$/.test(u.id) && u.state !== "down");   // 沟里死了的 Walker04 不在队里
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
  // 「担架过去了 n / 12」：7 → 12（每 2.6 s 一副拐进胡同口）
  for (let n = 7; n <= 12; n++) s.Caption(2.0 + (n - 7) * 2.6, 2.4, `担架过去了 ${n} / 12`);
  s.Eye(0, 3.0, { stance: "prone", look: Pt(JOG1.x - 2, JOG1.z), pitch: 1, fov: 50 });
  s.Caption(0.3, 3.4, "（后送队顺主街跑到路口，贴着石碾背后一副一副拐进窄胡同往南：担架小跑，抬的人少了、伤轻的自己架着走。顺子在石碾后的机枪上顶着）");
  s.Eye(3.0, 1.4, { stance: "prone", look: Pt(JOG1.x - 2, JOG1.z), pitch: 1, toLook: Pt(107, 467), toPitch: -4 });
  s.Eye(4.4, 6.0, { stance: "prone", look: Pt(107, 467), pitch: -4, toLook: Pt(LANE_X, 480), toPitch: -4 });
  Shot(s, 1.2, "player", { count: 5, interval: 0.11, sfx: "mgBurstNear" });
  Shot(s, 7.8, "player", { count: 5, interval: 0.11, sfx: "mgBurstNear" });
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
  s.Eye(hugT - 1.6, 1.2, { stance: "prone", look: Pt(LANE_X, 480), pitch: -4, toLook: { actor: "Geng", offset: [0, 1.3, 0] } });
  s.Eye(hugT - 0.4, 5.0, { stance: "prone", look: { actor: "Geng", offset: [0, 1.3, 0] } });
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
  // 东街冷枪：顺子旁边的后送队兵脖子中枪，倒在石碾上；排长胳膊中枪
  const hit = R(hugT + 4.6);
  const e2 = UP(K("Escort2"));
  Shot(s, hit, "EastIja12", { volume: 0.9 }); Puff(s, hit + 0.2, Pt(109.0, 467.6));
  s.Key("Escort2", hit + 0.25, { clip: "ShotCollapse", clipHold: true, aim: false });
  s.Go("Escort2", hit + 0.3, hit + 1.6, e2.x, e2.z, { move: "run", path: [K10_ROLLER_CORNER] });   // 绕过东街口南墙角（x 110 / z 467）
  s.Key("Escort2", hit + 1.9, { state: "down", clip: null, yawDeg: -100 });
  s.Sfx(hit + 1.4, "bodyFall", { x: e2.x, z: e2.z });
  s.Eye(hit - 0.1, 0.6, { stance: "prone", look: { actor: "Geng", offset: [0, 1.3, 0] }, toLook: e2, toPitch: -6 });
  s.Eye(hit + 0.5, 2.2, { stance: "prone", look: e2, pitch: -6 });
  s.Caption(hit + 0.4, 3.0, "（旁边的后送队兵脖子中枪，倒在石碾上，没再动）");
  const off = UP(K("Officer"));
  Shot(s, hit + 2.6, "EastIja10", { volume: 0.8 }); Puff(s, hit + 2.8, Pt(off.x + 0.6, off.z - 0.4));
  s.Key("Officer", hit + 2.9, { clip: "PvLegHitKneelClutch", clipHold: true });
  s.Key("Officer", hit + 5.0, { clip: null, stance: "crouch", yawDeg: K("Officer").yawDeg });
  s.Caption(hit + 3.0, 2.6, "（排长胳膊中枪，蹲下去捂着）");
  s.Eye(hit + 2.7, 1.0, { stance: "prone", look: e2, pitch: -6, toLook: off, toPitch: -2 });
  s.Eye(hit + 3.7, 3.0, { stance: "prone", look: off, pitch: -2, toLook: Pt(JOG1.x - 2, JOG1.z), toPitch: 1 });
  Shot(s, hit + 4.6, "player", { count: 6, interval: 0.11, sfx: "mgBurstNear" });
  // 弹斗快空：班长「幺娃，接到！」幺娃爬到石碾后接过机枪；顺子退到石碾南边拿回自己的枪
  s.Caption(go + 0.4, 3.0, "（担架一副接一副跟进胡同。石碾那边：鬼子试了几次攻不上来）");
  Shot(s, go + 3.6, "EastMg1", { count: 6, interval: 0.11, sfx: "mgBurstFar", volume: 0.7 }); Puff(s, go + 4.0, Pt(112.4, 466.3));
  const take = s.Say("HoldEastStreet.02", "Luo", Math.max(hit + 7.0, go + 2.0));
  s.Key("Luo", take - 0.3, { faceTo: "Yaowa" });
  s.Key("Luo", s.End("HoldEastStreet.02") + 0.4, { faceTo: EAST_END, aim: true });
  s.Caption(take + 0.2, 3.0, "（弹斗快空了。幺娃滚过来接过机枪，顺子退到石碾南边拿回自己的枪）");
  s.Cam(take + 0.2, 4.0, { from: { x: 108.4, z: 469.0, h: 1.1 }, look: { ...ROLLER, h: 0.6 }, fov: 56 });
  const yw = K10_YAOWA_BESIDE;   // 接枪前先滚到顺子旁边（关键帧 10-4 的幺娃已经趴在机枪上了，别拿它当「接枪前」）
  s.Go("Yaowa", take + 0.6, take + 1.4, yw.x, yw.z, { move: "run", stance: "crouch", faceTo: K10_ROLLER_PRONE });
  s.Go("Yaowa", take + 1.6, take + 2.8, K10_ROLLER_PRONE.x, K10_ROLLER_PRONE.z, { move: "run", path: [K10_ROLLER_CORNER], stance: "prone", yawDeg: -90 });
  s.Key("Yaowa", take + 2.8, { weapon: "Type11", aim: true });
  Shot(s, take + 3.6, "Yaowa", { count: 6, interval: 0.11, sfx: "mgBurstNear", volume: 0.9 });
  s.Eye(take + 4.2, 3.0, { stance: "stand", x: K10_ROLLER_SIDE.x, z: K10_ROLLER_SIDE.z, look: ROLLER, pitch: -8, toLook: Pt(140, ST.east.c), toPitch: 0 });
  s.Caption(take + 4.4, 2.6, "（顺子端着自己的汉阳造站在石碾南边。接 10-5）");
  return s.Done({ durationS: Math.max(take + 7.4, go + 7.6) });
}

function S1005(ctx) {
  const s = new Seq(ctx, "10-5", "挨炮：吹哨全退，静两三秒；第一发落在石碾边，顺子被掀翻、枪脱手；班长拽起来：撤——走胡同");
  const K = id => KU(ctx, "10-5", id), K4 = id => KU(ctx, "10-4", id);
  const P = KP(ctx, "10-5");
  s.Signal(0, SIG.barrageHit, false);
  // 开场：都是 10-4 末的样子——幺娃在石碾后的机枪上、顺子站在石碾南边；班长、刘文财、Squad1 / 2、何有田在路口；排长（胳膊中枪）蹲在路口西边；鬼子还在东街、院子链里
  s.Place("Yaowa", 0, K10_ROLLER_PRONE.x, K10_ROLLER_PRONE.z, { stance: "prone", aim: true, yawDeg: -90, weapon: "Type11" });
  for (const id of ["Luo", "LiuWencai", "Squad1", "HeYoutian", "Squad2", "Officer"]) { const u = K4(id); s.Place(id, 0, u.x, u.z, { stance: u.stance || "stand", aim: !!u.aim, yawDeg: u.yawDeg }); }
  for (const id of ["EastIja3", "EastIja4", "EastIja5", "EastIja6", "EastIja7", "EastIja8", "EastIja9", "EastMg1", "EastMg2", "NorthIja1", "NorthIja2", "NorthIja3", "NorthIja4", "FarIja1", "FarIja2", "FarIja3"]) { const u = K4(id); s.Place(id, 0, u.x, u.z, { stance: u.stance || "stand", aim: !!u.aim, yawDeg: u.yawDeg }); }
  const EYE0 = K10_ROLLER_SIDE;
  s.Eye(0, 3.0, { stance: "stand", x: EYE0.x, z: EYE0.z, look: Pt(140, ST.east.c), pitch: -1 });
  Shot(s, 0.6, "Yaowa", { count: 4, interval: 0.11, sfx: "mgBurstNear", volume: 0.8 });
  Shot(s, 1.6, "EastMg1", { count: 5, interval: 0.11, sfx: "mgBurstFar", volume: 0.7 }); Puff(s, 2.0, Pt(112.0, 466.2));
  // 东街那头吹哨：全体后退！炮要来了！—— 门洞里的枪口火全停，日军往东缩（东街的缩到第一道弯那头，抄北边的退回北侧第一个院里）
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
  for (const id of ["FarIja1", "FarIja2", "FarIja3"]) { const to = UP(K(id)); s.Go(id, back + 0.6, back + 3.0, to.x, to.z, { move: "walk", stance: "crouch", yawDeg: -90 }); }
  const quiet0 = R(s.End("EastEndOfficer.04") + 0.2);
  s.Caption(quiet0, 2.6, "（门洞里的枪口火全停了，鬼子往东缩：东街上一个人影都没了，北边砸门的也不响了）");
  s.Caption(quiet0 + 2.8, 2.4, "（静了。两三秒）");
  s.Eye(3.0, quiet0 + 4.0 - 3.0, { stance: "stand", x: EYE0.x, z: EYE0.z, look: Pt(140, ST.east.c), pitch: -1, toLook: Pt(180, ST.east.c), toPitch: 0 });
  // 第一发炮落在石碾边：顺子被气浪掀出去好几步——镜头猛地往后抛、翻滚落地、震屏、闪白、耳鸣、黑一阵白一阵；枪脱手
  const T1 = R(quiet0 + 4.2);
  const HIT1 = Pt(114.5, 465.5);
  s.Sfx(T1, "artilleryNear", { x: HIT1.x, z: HIT1.z, volume: 1.0 });
  s.Ev(T1, "explosion", { x: HIT1.x, z: HIT1.z, kind: "shell", radius: 6 });
  s.Ev(T1 + 0.1, "smoke", { x: HIT1.x, z: HIT1.z, kind: "SmokeDust", dur: 8 });
  s.Ev(T1, "flash", { dur: 0.4, strength: 0.9 });
  s.Shake(T1, 0.8, 1.0);
  s.Sfx(T1 + 0.05, "tinnitus", { x: K10_THROWN.x, z: K10_THROWN.z });
  s.Cam(T1, 0.6, { from: { ...EYE0, h: 1.5 }, to: { ...K10_THROWN, h: 0.4 }, look: { x: HIT1.x, z: HIT1.z, h: 1.2 }, lookTo: { x: K10_THROWN.x - 4, z: K10_THROWN.z - 2, h: 6 }, ease: "linear", shake: 0.8 });
  s.Eye(T1 + 0.6, 1.8, { stance: "prone", x: K10_THROWN.x, z: K10_THROWN.z, look: Pt(K10_THROWN.x - 3, K10_THROWN.z - 3), pitch: 42, toLook: K10_LUO_KNEEL, toPitch: 30, shake: 0.6 });
  s.Ev(T1 + 0.7, "black", { dur: 0.6, fade: 0.2 });
  s.Ev(T1 + 1.5, "flash", { dur: 0.3, strength: 0.6 });
  s.Ev(T1 + 1.9, "black", { dur: 0.6, fade: 0.2 });
  s.Caption(T1 + 0.3, 2.6, "（第一发落在石碾边：气浪把顺子掀出去好几步，翻滚落地。耳朵里只剩嗡嗡声，眼前黑一阵白一阵）");
  s.Caption(T1 + 1.2, 2.6, "（枪脱手，掉在脚边）");
  // 幺娃在石碾后的机枪上趴着没被掀；班长从墙角跑过来蹲到跟前，隔着耳鸣喊、一把拽起来
  s.Key("Yaowa", T1 + 0.3, { clip: VIL.duck, clipHold: true, stance: "prone" });
  s.Key("Yaowa", T1 + 3.0, { clip: null, stance: "prone", aim: true });
  for (const id of ["LiuWencai", "Squad1", "Squad2", "HeYoutian"]) s.Key(id, T1 + 0.2, { clip: VIL.duck, clipHold: true, stance: "prone" });
  s.Go("Luo", T1 + 0.8, T1 + 2.0, K10_LUO_KNEEL.x, K10_LUO_KNEEL.z, { move: "run", depart: { aim: false, clip: null }, stance: "crouch", aim: false, faceTo: "player" });
  const pull = s.Say("LuoPullsUp.01", "Luo", T1 + 2.4);
  s.Key("Luo", pull - 0.2, { clip: TALK_CROUCH, talking: true, faceTo: "player" });
  s.Caption(pull + 0.2, 3.0, "（班长的脸凑到跟前，隔着耳鸣喊：顺儿！……还能动不？起来！撤——走胡同！）");
  s.Eye(T1 + 2.4, s.End("LuoPullsUp.01") - T1 - 2.4, { stance: "prone", x: K10_THROWN.x, z: K10_THROWN.z, look: { actor: "Luo", offset: [0, 1.0, 0] }, shake: 0.25 });
  const up = R(s.End("LuoPullsUp.01") + 0.2);
  s.Key("Luo", up - 0.1, { talking: false, clip: BECKON, stance: "stand" });
  s.Eye(up, 1.0, { stance: "crouch", x: K10_THROWN.x, z: K10_THROWN.z, look: { actor: "Luo", offset: [0, 1.4, 0] }, toPitch: 0, shake: 0.15 });
  s.Eye(up + 1.0, 2.6, { stance: "stand", x: K10_THROWN.x, z: K10_THROWN.z, look: { actor: "Luo", offset: [0, 1.4, 0] } });
  s.Caption(up + 0.2, 2.4, "（一把拽起来）");
  s.Caption(up + 1.0, 3.0, "枪就在脚边：按 F 弯腰捡回来");
  s.Key("Luo", up + 1.2, { clip: null, faceTo: Pt(LANE_X, 472) });
  // 第二、三发落下来：北屋塌一角、草顶着火（BarrageHit）
  const T2 = R(up + 1.6);
  Shell(s, T2, Pt(101.0, 471.0), { shake: 0.9, radius: 5, whistleS: 1.2 });
  s.Signal(T2, SIG.barrageHit, true);
  s.Ev(T2 + 0.4, "smoke", { x: 103.5, z: 472.0, kind: "SmokeBlack", dur: 40, scale: 2 });
  Shell(s, T2 + 0.9, Pt(112.6, 463.4), { shake: 0.8, whistleS: 1.0 });
  s.Ev(T2 + 1.2, "smoke", { x: 97.0, z: 471.5, kind: "SmokeBlack", dur: 40, scale: 2 });
  s.Caption(T2 + 0.4, 3.4, "（第二、三发落下来：北屋东间的后墙和房顶塌下来一角，草顶着了火；石碾旁炸出一堆新瓦砾）");
  for (const id of ["LiuWencai", "Squad1", "Squad2", "HeYoutian"]) s.Key(id, T2 + 1.4, { clip: null, stance: "stand" });
  // 刘文财架着挨了弹片的排长进胡同（PvSupportWalkR + PvSupportedHop），Squad1 / 2 跟上；幺娃带着机枪跑进院子到水缸边卸枪栓；何有田在院门里卡手榴弹
  const liu = UP(K("LiuWencai")), off = UP(K("Officer")), off0 = UP(K4("Officer"));
  s.Caption(T2 + 2.0, 2.8, "（排长挨了弹片。刘文财跑过去架着他往胡同走）");
  s.Go("LiuWencai", T2 + 1.6, T2 + 2.8, off0.x - 0.42, off0.z, { move: "run", yawDeg: 180 });
  s.Key("Officer", T2 + 2.8, { clip: "PvSupportedHop", stance: "stand" });
  s.Key("LiuWencai", T2 + 2.8, { clip: "PvSupportWalkR" });
  const pairPath = [Pt(108.4, 468.2), Pt(LANE_X, 470.6)];
  const pairLen = RouteLen(off0, [...pairPath, off]);
  s.Go("Officer", T2 + 3.2, T2 + 3.2 + pairLen / 1.4, off.x, off.z, { move: "walk", path: pairPath, yawDeg: 180 });
  s.Go("LiuWencai", T2 + 3.2, T2 + 3.2 + pairLen / 1.4, liu.x, liu.z, { move: "walk", path: pairPath.map(p => Pt(p.x - 0.28, p.z)), yawDeg: 180 });   // 胡同只有 1.5 m 宽：架人的贴着排长左手，别蹭到老耿家东墙
  for (const [id, dt] of [["Squad1", 0.4], ["Squad2", 1.0]]) { const to = UP(K(id)); const r = Route(s.pos.get(id), to); s.Go(id, T2 + 3.0 + dt, T2 + 3.0 + dt + RouteLen(s.pos.get(id), [...r.path, r.end]) / 3.2, r.end.x, r.end.z, { move: "run", path: r.path, stance: "stand", yawDeg: 180 }); }
  const yw = UP(K("Yaowa"));
  { const r = Route(K10_ROLLER_PRONE, yw); const t0 = T2 + 1.6, t1 = R(t0 + RouteLen(K10_ROLLER_PRONE, [...r.path, r.end]) / 3.2); s.Go("Yaowa", t0, t1, r.end.x, r.end.z, { move: "run", path: r.path, depart: { stance: "stand", aim: false }, stance: "stand", faceTo: Pt(G.vat.x, G.vat.z) });
    s.Caption(t1 - 0.4, 2.8, "（幺娃拎着那挺机枪跑进院子，到水缸边把枪栓卸下来扔进缸里）");
    s.Sfx(t1 + 1.0, "slap", { x: G.vat.x, z: G.vat.z, volume: 0.6 });
    s.Key("Yaowa", t1 + 1.4, { weapon: null, faceTo: GATE_IN }); }
  const he = UP(K("HeYoutian"));
  { const r = Route(s.pos.get("HeYoutian"), he); const t0 = T2 + 1.8, t1 = R(t0 + RouteLen(s.pos.get("HeYoutian"), [...r.path, r.end]) / 3.2);
    s.Go("HeYoutian", t0, t1, r.end.x, r.end.z, { move: "run", path: r.path, stance: "crouch", faceTo: GENG_GATE });
    const grenade = s.Say("HeGrenadeGate.01", "HeYoutian", Math.max(t1 + 1.0, s.End("LuoPullsUp.01") + 6.0));
    s.Caption(grenade + 0.2, 3.0, "（何有田蹲在院门框边往门缝里卡手榴弹，只有几秒。身后挡路的人：滚！表挡事！）"); }
  // 顺子捡起枪、跟班长进胡同口（眼睛）
  const walk0 = R(up + 3.6);
  s.Go("Luo", walk0 - 0.2, walk0 + 1.6, LANE_X, 471.6, { move: "run", path: [Pt(108.6, 468.4)], stance: "stand", yawDeg: 180 });
  s.Go("Luo", walk0 + 1.8, walk0 + 4.0, LANE_X, 480.0, { move: "run", yawDeg: 180 });
  s.Creep(walk0, 1.6, K10_THROWN, Pt(108.6, 468.6), { actor: "Luo", offset: [0, 1.2, 0] }, { h: 1.5, ease: "linear" });
  s.Creep(walk0 + 1.6, 2.0, Pt(108.6, 468.6), Pt(LANE_X, 476.0), GATE_OUT, { h: 1.55, ease: "linear" });
  s.Eye(walk0 + 3.6, 3.0, { stance: "stand", x: LANE_X, z: 476.0, look: GATE_OUT, pitch: -2, toLook: Pt(LANE_X, 495), toPitch: -1 });
  s.Caption(walk0 + 0.2, 2.6, "（捡起枪，跟着班长进窄胡同口。接 10-6）");
  Shell(s, walk0 + 2.4, Pt(110.6, 466.6), { shake: 0.8 });
  return s.Done({ durationS: Math.max(walk0 + 7.0, s.lastLineEnd + 1.0) });
}

function S1006(ctx) {
  const s = new Seq(ctx, "10-6", "炮里撤：窄胡同拐几道弯，炮追着人跑；幺娃和刘文财架着排长；塌墙翻墙绕院子；往大槐树跑，出村南口：你两个帮到车");
  const K = id => KU(ctx, "10-6", id);
  const P = KP(ctx, "10-6");
  // 开场：全班刚出院门进了胡同（10-5 末的位置），顺子在院门外；班长跑最前；幺娃和刘文财一边一个架着排长
  const laneOf = { Luo: Pt(LANE_X, 494.4), Squad1: Pt(LANE_X, 491.8), Squad2: Pt(LANE_X, 489.4), Officer: Pt(LANE_X, 486.4), Yaowa: Pt(LANE_X - 0.42, 486.4), LiuWencai: Pt(LANE_X + 0.42, 486.4), HeYoutian: Pt(GATE_OUT.x, GATE_OUT.z + 1.0) };
  for (const [id, p] of Object.entries(laneOf)) s.Place(id, 0, p.x, p.z, { stance: "stand", yawDeg: 180, aim: false });
  s.Key("Officer", 0, { clip: "PvSupportedHop" }); s.Key("Yaowa", 0, { clip: "PvSupportWalkR" }); s.Key("LiuWencai", 0, { clip: "PvSupportWalkL" });
  s.Signal(0, SIG.laneWallCollapse, false);
  const EYE0 = Pt(LANE_X - 0.3, GATE_OUT.z - 0.6);
  s.Eye(0, 1.0, { stance: "stand", x: EYE0.x, z: EYE0.z, look: { actor: "Luo", offset: [0, 1.2, 0] } });
  s.Caption(0.3, 3.0, "（窄胡同拐几道弯，炮一排比一排近追着人跑。班长跑最前，每个拐角先到、回身招手。幺娃和刘文财一边一个架着挨了弹片的排长。全程跑）");
  // 第一段：胡同往南到第一道弯（z 495）；炮落在身后院子里；班长：炮！趴倒！（屏幕卧倒提示，趴不趴由玩家）→ 起来！跑！
  const C1 = Pt(LANE_X, 495), C2 = Pt(LANE3_X, 495), PILE_N = Pt(LANE3_X, 499.2);
  s.Go("Luo", 0.4, 1.6, C1.x, C1.z, { move: "run", yawDeg: 180 });
  s.Key("Luo", 1.6, { faceTo: "player", clip: BECKON });
  const down = s.Say("LuoRunCalls.01", "Luo", 2.6);
  s.Key("Luo", down - 0.2, { clip: VIL.duck, clipHold: true, stance: "prone" });
  const S1 = Shell(s, down + 1.0, Pt(LANE_X - 5.0, 489.0), { shake: 1.0 });
  Shell(s, S1 + 0.6, Pt(104.0, 482.0), { shake: 0.9 });
  s.Caption(down + 0.2, 2.8, "（炮！趴倒！屏幕弹卧倒提示：趴不趴由玩家）");
  ["Squad1", "Squad2", "HeYoutian"].forEach((id, k) => s.Key(id, down + 0.2 + k * 0.12, { clip: VIL.duck, clipHold: true, stance: "prone" }));
  ["Officer", "Yaowa", "LiuWencai"].forEach((id, k) => s.Key(id, down + 0.5 + k * 0.1, { clip: null, stance: "crouch" }));   // 架着人的蹲下躲，趴不下去
  s.Eye(1.0, down + 2.2 - 1.0, { stance: "stand", x: EYE0.x, z: EYE0.z, look: { actor: "Luo", offset: [0, 1.0, 0] }, shake: 0.4 });
  const up = s.Say("LuoRunCalls.02", "Luo", S1 + 2.0);
  s.Key("Luo", up - 0.2, { clip: null, stance: "stand", faceTo: "player" });
  ["Squad1", "Squad2", "HeYoutian"].forEach((id, k) => s.Key(id, up + 0.3 + k * 0.1, { clip: null, stance: "stand" }));
  const lift = up + 0.6;
  s.Key("Officer", lift, { clip: "PvSupportedHop", stance: "stand" });
  s.Key("Yaowa", lift, { x: LANE_X - 0.42, z: 486.4, move: "cut", yawDeg: 180, stance: "stand", clip: "PvSupportWalkR" });
  s.Key("LiuWencai", lift, { x: LANE_X + 0.42, z: 486.4, move: "cut", yawDeg: 180, stance: "stand", clip: "PvSupportWalkL" });
  s.Caption(lift + 0.2, 2.6, "（幺娃和刘文财把排长架起来接着跑）");
  // 全班顺胡同跑：第一道弯往东、往南到塌墙前（班长先到、回身招手：莫停！莫回头！这边！）
  const RUN0 = up + 0.8;
  const legTo = (id, pts, t0, mps = 3.2, extra = {}) => { let t = t0, cur = s.pos.get(id); for (const p of pts) { const d = Dist(cur, p); s.Go(id, t, t + d / mps, p.x, p.z, { move: "run", yawDeg: Yaw(cur, p), ...extra }); t = R(t + d / mps); cur = p; } return t; };
  const luoAt = legTo("Luo", [C2, PILE_N], RUN0, 3.4, { depart: { clip: null } });
  s.Key("Luo", luoAt, { faceTo: Pt(LANE_X, 495), clip: BECKON });
  const keep = s.Say("LuoRunCalls.03", "Luo", RUN0 + 1.6);
  const here = s.Say("LuoRunCalls.04", "Luo", luoAt + 0.3);
  ["Squad1", "HeYoutian", "Squad2"].forEach((id, k) => legTo(id, [C1, C2, Pt(LANE3_X, 496.6 + k * 0.7)], RUN0 + 0.4 + k * 0.5, 3.2, { depart: { clip: null } }));
  for (const id of ["Officer", "Yaowa", "LiuWencai"]) { const dx = id === "Yaowa" ? -0.42 : id === "LiuWencai" ? 0.42 : 0; legTo(id, [Pt(C1.x + dx, C1.z), Pt(C2.x + dx * 0.4, C2.z + 0.6), Pt(LANE3_X + dx * 0.6, 499.8)], RUN0 + 3.4, 1.4); }
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
  s.Caption(CLIMB + 0.3, 3.2, "（班长踩着墙根的柴垛爬上墙头，翻进旁边院子，回身把人一个个拽上去；排长是两个人托着递上去的）");
  s.Eye(HIT + 2.4, CLIMB + 6.0 - (HIT + 2.4), { stance: "crouch", x: P.x, z: P.z, look: PILE, pitch: 14, toLook: CLIMB_TO, toPitch: 30 });
  // 一个个翻过去（硬切到墙那边、再跑进院子）；排长最后被托上去
  const climbers = ["Squad1", "HeYoutian", "Squad2", "Yaowa", "Officer", "LiuWencai"];
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
  climbers.forEach((id, k) => legTo(id, [gateIn, laneBack, C4, C5, Pt(EXIT.x, 538 + k * 0.9)], OVER + 0.6 + k * 0.5, id === "Officer" || id === "Yaowa" || id === "LiuWencai" ? 2.0 : 3.2));
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
  // 出村南口：后送队缩在路沟里等着——抬担架的死了好几个，担架上的人比抬的人多；老耿的车在前头。班长：顺儿、文财，你两个帮到车！
  s.Caption(te - 1.0, 3.4, "（出了村南口：后送队缩在村口外的路沟里等着。抬担架的死了好几个——担架上的人比抬的人多；老耿的车在前头）");
  const cartAt = UP(K("GengCart"));
  s.Key("Luo", te + 0.2, { faceTo: "player" });
  const help = s.Say("LuoHelpCart.01", "Luo", te + 0.6);
  s.Key("Luo", help - 0.1, { clip: POINT_STAND, faceTo: cartAt });
  s.Key("Luo", s.End("LuoHelpCart.01") + 0.4, { clip: null, faceTo: cartAt });
  s.Eye(te, s.End("LuoHelpCart.01") + 2.2 - te, { stance: "stand", x: EXIT.x, z: EXIT.z, look: { actor: "Luo", offset: [0, 1.4, 0] }, toLook: { x: cartAt.x, z: cartAt.z, h: 1.0 } });
  s.Caption(help + 0.3, 3.0, "（顺儿、文财，你两个帮到车！——接 11）");
  void luoGo;
  return s.Done({ durationS: s.End("LuoHelpCart.01") + 2.6, then: "stay" });
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
    title: "第一关 06–10 预演（第九版：两路不上主街 + 占位动作 + 占位配音）",
    source: { generator: "node Taierzhuang1938/Script_EditorBlockoutFirstLevel0610Previz.mjs --force", note: "剧本 Notion 06–10（10-24 第九版：07–10 新稿）；手改前先想好：重跑生成器会覆盖" },
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
