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
import { L0105_PLACES as PL } from "./Data_EditorBlockoutFirstLevel0105Space.mjs";

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
  Eye(t, dur, { x, z, stance = "stand", yaw, pitch = 0, toYaw, toPitch, look, toLook, shake }) {
    const at = { x: x ?? this.player.x, z: z ?? this.player.z };
    const eye = { x: R(at.x), z: R(at.z), stance };
    eye.yawDeg = R(look ? Yaw(at, look) : yaw);
    eye.pitchDeg = R(pitch);
    if (toLook) eye.toYawDeg = Yaw(at, toLook);
    else if (toYaw !== undefined) eye.toYawDeg = R(toYaw);
    if (toPitch !== undefined) eye.toPitchDeg = R(toPitch);
    const c = { t: R(t), dur: R(dur), eye };
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
  s.Key("Donggua", 5.6, { clip: "WoundedReach", faceTo: "player" });
  s.Say("CaveWake.02", "Donggua", 6.0);
  // 绑绷带：开场唯一的交互
  s.Eye(6.5, 6.5, { stance: "crouch", look: { x: 67.0, z: 65.1 }, pitch: -20, toPitch: -34 });
  s.Caption(8.0, 4.0, "（按键给冬瓜重新绑绷带：开场唯一的交互）");
  s.Say("CaveWake.03", "Donggua", 11.8);
  s.Key("Donggua", 13.5, { clip: "WoundedSitRifleIdle" });
  // 炮光一闪一闪照出别人：幺娃数炮
  s.Ev(13.8, "flash", { dur: 0.22, strength: 0.28 }); s.Sfx(13.8, "artilleryFar");
  s.Eye(13.6, 1.4, { stance: "crouch", look: { x: 67.0, z: 65.1 }, pitch: -30, toLook: { x: 64.9, z: 63.1 }, toPitch: -6 });
  s.Key("Yaowa", 14.6, { talking: true });
  s.Say("CaveWake.04", "Yaowa", 15.4);
  s.Key("Yaowa", 17.6, { talking: false });
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
  s.Key("Luo", 3.0, { faceTo: "Runner" });
  const t2 = s.Say("RunnerOrder.02", "Runner", 4.3);
  // 班长下令，转身看着顺子
  s.Eye(4.0, 4.5, { stance: "crouch", look: { x: 61.4, z: 64.8 }, pitch: -2 });
  s.Eye(t2 + 4.4, 1.0, { stance: "crouch", look: { x: 61.4, z: 64.8 }, pitch: -2, toLook: { x: 64.1, z: 65.1 }, toPitch: 4 });
  s.Say("RunnerOrder.03", "Luo");
  s.Key("Luo", s.End("RunnerOrder.03") - 0.6, { faceTo: "player", clip: "InterpreterPoint" });
  const t4 = s.Say("RunnerOrder.04", "Luo");
  // 顺子手上还在给冬瓜打结，慢了半拍
  const slow = s.End("RunnerOrder.04");
  s.Eye(slow, 1.3, { stance: "crouch", look: { x: 64.1, z: 65.1 }, pitch: 4, toLook: { x: 67.1, z: 65.2 }, toPitch: -30 });
  s.Key("Luo", slow, { clip: null });
  // 幺娃一下站起来
  s.Key("Yaowa", slow + 0.6, { stance: "stand", faceTo: "Luo" });
  s.Eye(slow + 1.3, 1.0, { stance: "crouch", look: { x: 67.1, z: 65.2 }, pitch: -30, toLook: { x: 64.4, z: 63.6 }, toPitch: 6 });
  const t5 = s.Say("RunnerOrder.05", "Yaowa", slow + 1.0);
  // 班长看了顺子一眼，没说话，挥手让幺娃跟传令兵走
  const look = t5 + 2.0;
  s.Key("Luo", look, { faceTo: "player" });
  s.Eye(t5 + 1.4, 2.4, { stance: "crouch", look: { x: 64.4, z: 63.6 }, pitch: 6, toLook: { x: 64.1, z: 65.1 }, toPitch: 4 });
  s.Key("Luo", look + 1.6, { faceTo: "Yaowa", clip: "PointBlockade" });
  s.Key("Luo", look + 4.4, { clip: null });
  const go = look + 2.2;
  s.Key("Runner", go - 0.2, { stance: "stand", clip: null });
  s.Go("Yaowa", go, go + 6.5, 30, BZ(30), { move: "run", path: [{ x: 62, z: 64.6 }, mouthOut] });
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
  s.Key("Donggua", 0, { clip: "WoundedReach", faceTo: { x: 66.3, z: 64.6 } });
  s.Eye(0, 3.0, { stance: "crouch", look: DG, pitch: -30 });
  s.Caption(0.3, 2.6, "（冬瓜单手塞背包，塞不进去，顺子帮他捆好）");
  // 班长在洞口回头
  s.Eye(2.6, 1.0, { stance: "crouch", look: DG, pitch: -30, toLook: LUO, toPitch: 2 });
  s.Key("Luo", 2.6, { clip: "InterpreterPoint" });
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
  s.Key("Donggua", grab, { clip: "WoundedReach", faceTo: "player" });
  s.Eye(grab, 1.0, { stance: "crouch", yaw: 160, pitch: -50, toLook: DG, toPitch: -8 });
  s.Key("Donggua", grab + 0.4, { talking: true });
  s.Say("LastTwo.03", "Donggua", grab + 0.5);
  // 顺子先朝洞口看了一眼
  const glance = s.End("LastTwo.03") + 0.15;
  s.Eye(glance, 0.5, { stance: "crouch", look: DG, pitch: -8, toLook: DUG_MOUTH, toPitch: 0 });
  s.Eye(glance + 0.8, 0.5, { stance: "crouch", look: DUG_MOUTH, pitch: 0, toLook: DG, toPitch: -8 });
  s.Say("LastTwo.04", null, glance + 1.4);
  s.Key("Donggua", s.End("LastTwo.04"), { clip: null });
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
  s.Go("Shouter", run0 - 0.6, run0 + 3.0, 57.5, BZ(57.5), { move: "run", yawDeg: -90 });
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
  // 一声不吭，打着手势分开：丁守岔口，甲往前甩手榴弹
  s.Eye(drop + 2.2, 2.0, { stance: "prone", look: { x: 57, z: 62 }, pitch: 9, toLook: { x: 54, z: 65 }, toPitch: 2 });
  s.Go("IjaDing", drop + 3.5, drop + 10.5, 46.07, 66.17, { move: "walk", aim: true });
  s.Go("IjaJia", drop + 3.0, drop + 6.5, 52.98, 64.43, { move: "walk" });
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
  // 机枪响，后沟那边有枪在还（班长他们被压着过不来）
  const fire = stab + 6.0;
  s.Eye(fire, 1.4, { stance: "prone", look: { x: 60.8, z: 63.9 }, pitch: 4, toLook: { x: 56, z: 61.6 }, toPitch: 9 });
  for (const [i, dt] of [0, 3.2, 6.9, 10.4].entries()) {
    Shot(s, fire + 1.2 + dt, "IjaMgGunner", { count: 6 - (i % 2), sfx: "mgBurstNear" });
    Puff(s, fire + 1.5 + dt, { x: 24.4 + (i % 2), z: 66.6 });
  }
  s.Eye(fire + 4.6, 1.6, { stance: "prone", look: { x: 56, z: 61.6 }, pitch: 9, toYaw: 92, toPitch: 1 });
  Shot(s, fire + 5.8, "Luo"); Shot(s, fire + 6.6, "LiuWencai"); Shot(s, fire + 9.4, "Squad1"); Shot(s, fire + 11.8, "Luo");
  // 枪在一臂开外，够不着
  s.Eye(fire + 12.6, 1.2, { stance: "prone", yaw: 92, pitch: 1, toLook: { x: 62.1, z: 63.4 }, toPitch: -20 });
  s.Caption(fire + 13.2, 3.0, "（枪在一臂开外，够不着）");
  void P;
  return s.Done({ durationS: fire + 16.8 });
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
  // 乙举起刺刀，甲抬手拦住
  s.Key("IjaYi", 1.2, { clip: "ButtThreat" });
  s.Key("IjaJia", 1.8, { clip: "InterpreterPoint" });
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
  s.Go("IjaYi", drag + 1.0, drag + 4.5, 56.0, 64.5, { move: "walk", faceTo: "Donggua" });
  s.Go("IjaDing", drag + 1.5, drag + 4.6, 58.7, 66.2, { move: "walk", faceTo: "Donggua" });
  s.Eye(drag, 4.6, { stance: "prone", look: { x: 62.3, z: 65.4 }, pitch: -4, toLook: DGK, toPitch: 3 });
  // 后沟的还击越来越密，甲朝那边看了一眼；翻译蹲到冬瓜面前连珠炮
  s.Go("Interpreter", drag + 1.0, drag + 6.4, 57.43, 64.15, { move: "walk", faceTo: "Donggua" });
  s.Key("Interpreter", drag + 6.5, { stance: "crouch", clip: "InterpreterCrouchAsk" });
  Shot(s, drag + 5.4, "Luo"); Shot(s, drag + 6.6, "LiuWencai");
  s.Key("IjaJia", drag + 6.3, { yawDeg: 90 });
  s.Key("IjaJia", drag + 8.0, { faceTo: "Donggua" });
  s.Say("Interrogation.02", "Interpreter", drag + 7.0);
  // 冬瓜一口唾沫啐过去
  const spit = s.Say("Interrogation.03", "Donggua");
  s.Key("Interpreter", spit, { clip: "InterpreterGrabCollar" });
  s.Key("Donggua", spit, { talking: true });
  Shot(s, spit + 3.0, "Squad1"); Shot(s, spit + 6.5, "Luo");
  // 乙一枪托砸在他脸上
  const butt = s.End("Interrogation.03") + 0.1;
  s.Key("Donggua", butt, { talking: false });
  s.Key("IjaYi", butt - 0.5, { clip: "ButtThreat" });
  s.Sfx(butt + 0.5, "slap", { x: DGK.x, z: DGK.z });
  s.Key("Donggua", butt + 0.5, { clip: "CaptiveHeadPulledBack" });
  s.Key("Donggua", butt + 2.4, { clip: "CaptiveKneelMud" });
  s.Key("Interpreter", butt + 0.3, { clip: "InterpreterCrouchAsk" });
  // 甲扫了一眼沟底，看见顺子的眼睛在动
  const found = butt + 1.6;
  s.Key("IjaJia", found, { faceTo: "player", clip: "IjaFoundLook" });
  s.Eye(found - 0.4, 1.0, { stance: "prone", look: DGK, pitch: 3, toLook: { x: 59.1, z: 64.4 }, toPitch: 7 });
  s.Say("Interrogation.04", "IjaJia", found + 0.5);
  // 乙揪住顺子的头发，把头拽起来；翻译转过来问同样的话
  const hair = s.End("Interrogation.04") + 0.2;
  s.Go("IjaYi", hair - 2.6, hair, 62.4, 63.4, { move: "walk", faceTo: "player" });
  s.Key("IjaYi", hair, { stance: "crouch", clip: "InterrogateCrouch", aim: false });
  s.Cam(hair, 0.6, { from: { actor: "player", offset: [0, 0.34, 0] }, to: { actor: "player", offset: [0, 0.72, 0] }, look: { x: 61.0, z: 64.2, h: 1.0 }, lookTo: { x: 61.2, z: 64.4, h: 1.0 }, shake: 0.2 });
  s.Go("Interpreter", hair - 0.8, hair + 2.4, 61.9, 64.4, { move: "walk", depart: { stance: "stand", clip: null }, stance: "crouch", faceTo: "player" });
  s.Key("Interpreter", hair + 2.5, { clip: "InterpreterCrouchAsk" });
  s.Cam(hair + 0.6, 2.4, { from: { actor: "player", offset: [0, 0.72, 0] }, look: { x: 61.2, z: 64.4, h: 1.0 }, lookTo: { actor: "Interpreter", offset: [0, 0.9, 0] } });
  const ask = s.Say("Interrogation.05", "Interpreter", hair + 2.6);
  s.Cam(hair + 3.0, s.End("Interrogation.05") - hair - 3.0 + 0.5, { from: { actor: "player", offset: [0, 0.72, 0] }, look: { actor: "Interpreter", offset: [0, 0.9, 0] } });
  // 顺子不吭声，挨了两记耳光，画面发晕
  const slap = s.End("Interrogation.05") + 0.6;
  s.Go("IjaJia", slap - 2.2, slap, 62.5, 63.0, { move: "walk", faceTo: "player" });
  s.Key("IjaJia", slap, { clip: "IjaSlapForehand" });
  s.Key("IjaJia", slap + 1.5, { clip: "IjaSlapBackhand" });
  for (const dt of [0.7, 2.2]) { s.Sfx(slap + dt, "slap", { x: P0(s).x, z: P0(s).z }); s.Shake(slap + dt, 0.45, 0.6); }
  s.Cam(slap + 0.5, 0.4, { from: { actor: "player", offset: [0, 0.72, 0] }, look: { actor: "IjaJia", offset: [0, 1.4, 0] }, lookTo: { actor: "IjaJia", offset: [0.9, 0.9, 1.2] }, shake: 0.5, ease: "linear" });
  s.Cam(slap + 0.9, 1.3, { from: { actor: "player", offset: [0, 0.72, 0] }, look: { actor: "IjaJia", offset: [0.9, 0.9, 1.2] }, lookTo: { actor: "IjaJia", offset: [0, 1.3, 0] }, shake: 0.3 });
  s.Cam(slap + 2.2, 0.4, { from: { actor: "player", offset: [0, 0.72, 0] }, look: { actor: "IjaJia", offset: [0, 1.3, 0] }, lookTo: { actor: "IjaJia", offset: [-1.0, 0.8, -1.0] }, shake: 0.6, ease: "linear" });
  s.Cam(slap + 2.6, 2.4, { from: { actor: "player", offset: [0, 0.6, 0] }, look: { actor: "IjaJia", offset: [-1.0, 0.8, -1.0] }, lookTo: { actor: "IjaJia", offset: [0, 1.1, 0] }, shake: 0.35, fov: 66 });
  s.Caption(slap + 2.7, 2.6, "（画面发晕）");
  // 后沟的枪声又近了一点。甲：没时间了。
  s.Sfx(slap + 3.6, "rifleVolley", { x: 30, z: 66, volume: 0.6 });
  const late = s.Say("Interrogation.06", "IjaJia", slap + 4.4);
  s.Key("IjaYi", late + 0.6, { stance: "stand", clip: null, aim: true });
  s.Go("IjaYi", late + 0.8, late + 2.6, 60.4, 65.6, { move: "walk", faceTo: "Donggua" });
  s.Eye(late + 0.8, 1.2, { stance: "prone", look: { x: 61.5, z: 63.6 }, pitch: 8, toLook: DGK, toPitch: 3 });
  s.Go("IjaJia", late + 0.6, late + 3.0, 59.1, 64.4, { move: "walk", faceTo: "IjaDing" });
  s.Go("Interpreter", late + 1.0, late + 3.4, 57.0, 63.8, { move: "walk", depart: { stance: "stand", clip: null }, stance: "crouch", faceTo: "Donggua" });
  // 丁。刺刀。丁不敢上，挨了甲一耳光
  const ding = s.Say("Interrogation.07", "IjaJia", late + 3.0);
  s.Key("IjaDing", ding + 0.8, { faceTo: "IjaJia" });
  const recruit = s.End("Interrogation.07") + 0.9;
  s.Key("IjaJia", recruit - 0.3, { faceTo: "IjaDing" });
  s.Go("IjaJia", recruit - 1.0, recruit - 0.1, 59.0, 65.4, { move: "walk", faceTo: "IjaDing" });
  s.Key("IjaJia", recruit, { clip: "IjaSlapRecruit" });
  s.Key("IjaDing", recruit + 0.1, { clip: "IjaRecruitSlapped" });
  s.Sfx(recruit + 0.6, "slap", { x: 58.7, z: 66.2 });
  // 冲上去一刀扎在冬瓜肩膀，一刀扎进肚子；冬瓜倒在泥里嚎
  const charge = recruit + 2.2;
  s.Key("IjaDing", charge, { clip: "IjaRecruitChargeThrust", faceTo: "Donggua" });
  s.Go("IjaDing", charge, charge + 1.0, 58.2, 65.9, { move: "walk", faceTo: "Donggua" });
  const st1 = charge + 1.4, st2 = charge + 3.0;
  s.Sfx(st1, "stab", DGK); s.Sfx(st2, "stab", DGK);
  s.Key("Donggua", st1, { clip: "CaptiveStabbedCurl", clipHold: true });
  s.Eye(charge - 0.8, 1.0, { stance: "prone", look: DGK, pitch: 3, toLook: { x: 58.0, z: 65.6 }, toPitch: 1 });
  const howl = s.Say("InterrogationHowl.01", "Donggua", st2 + 0.4);
  s.Key("Donggua", st2 + 2.0, { state: "down", clip: null });
  // 甲指了指顺子：下一个，他。然后揪起冬瓜的头发，把刀抵上他的喉咙
  s.Key("IjaJia", howl + 2.2, { faceTo: "player", clip: "InterpreterPoint" });
  const next = s.Say("Interrogation.08", "IjaJia", s.End("InterrogationHowl.01") + 0.3);
  s.Eye(next - 0.6, 0.8, { stance: "prone", look: { x: 58.0, z: 65.6 }, pitch: 1, toLook: { x: 59.0, z: 65.4 }, toPitch: 8 });
  const throat = s.End("Interrogation.08") + 0.4;
  s.Go("IjaJia", throat - 1.0, throat, 57.9, 64.7, { move: "walk", faceTo: "Donggua" });
  s.Key("IjaJia", throat, { stance: "crouch", clip: "IjaCrouchHairHold", clipHold: true });
  s.Key("Donggua", throat + 0.1, { state: "alive", stance: "crouch", clip: "CaptiveCurledPulledUp", clipHold: true });
  s.Eye(throat - 0.6, 1.2, { stance: "prone", look: { x: 59.0, z: 65.4 }, pitch: 8, toLook: { x: 57.7, z: 65.0 }, toPitch: 2 });
  void ask;
  return s.Done({ durationS: throat + 4.6 });
}
function P0(s) { return s.player; }

function S0202(ctx) {
  const s = new Seq(ctx, "02-2", "反冲");
  const BM = { x: PL.steps.x, z: PL.steps.z };
  // 开场：接 02-1 末（刀抵在冬瓜喉咙上），我方在台阶那头
  s.Place("Donggua", 0, 57.7, 65.1, { state: "alive", stance: "crouch", yawDeg: 0, clip: "CaptiveCurledPulledUp", clipFrom: 3.4, clipHold: true });
  s.Place("IjaJia", 0, 57.9, 64.6, { state: "alive", stance: "crouch", faceTo: "Donggua", clip: "IjaCrouchHairHold", clipFrom: 3.6, clipHold: true });
  s.Place("Interpreter", 0, 57.0, 63.8, { state: "alive", stance: "crouch", faceTo: "Donggua" });
  s.Place("IjaYi", 0, 60.4, 65.6, { state: "alive", stance: "stand", aim: true, yawDeg: 90 });
  s.Place("IjaDing", 0, 59.4, 65.4, { state: "alive", stance: "stand", faceTo: "Donggua" });
  s.Place("IjaMgGunner", 0, 56, 61.6, { state: "alive", stance: "prone", aim: true, yawDeg: 90 });
  s.Place("IjaMgLoader", 0, 57.3, 61.4, { state: "alive", stance: "prone", yawDeg: 90 });
  s.Spawn("CorpseLip1", { x: 55.4, z: 61.8, stance: "prone", state: "down", yawDeg: 0 });
  s.Spawn("CorpseLip2", { x: 56.6, z: 61.9, stance: "prone", state: "down", yawDeg: 20 });
  s.Place("Luo", 0, 25.6, 66.4, { aim: false, stance: "crouch", yawDeg: -90 });
  s.Place("LiuWencai", 0, 25.0, 67.6, { aim: true, stance: "crouch", yawDeg: -90 });
  s.Place("HeYoutian", 0, 24.4, 66.3, { stance: "crouch", yawDeg: -90 });
  s.Place("Squad1", 0, 24.0, 67.8, { aim: true, stance: "crouch", yawDeg: -90 });
  s.Place("Squad2", 0, 23.4, 66.6, { aim: true, stance: "crouch", yawDeg: -90 });
  // 后沟的枪声忽然停了一下，沟里静了半秒
  s.Eye(0, 2.0, { stance: "prone", look: { x: 57.7, z: 65.0 }, pitch: 2, toYaw: 95, toPitch: 1 });
  s.Caption(0.2, 1.6, "（后沟的枪声忽然停了，静了半秒）");
  // 台阶上一声「打！」，一排枪打下来
  const fire = s.Say("Counter.01", "Luo", 1.9);
  for (const id of ["Luo", "LiuWencai", "Squad1", "Squad2"]) s.Key(id, fire - 0.3, { stance: "stand", aim: true });
  const v = fire + 0.35;
  s.Sfx(v, "rifleVolley", { x: BM.x, z: BM.z });
  for (const id of ["LiuWencai", "Squad1", "Squad2", "HeYoutian"]) s.Ev(v, "muzzle", { actor: id });
  // 架机枪的先倒（效果挂落地：40 m，约 0.05 s）
  s.Key("IjaMgGunner", v + 0.1, { clip: "IjaLmgGunnerShotOnGun", clipHold: true });
  s.Key("IjaMgLoader", v + 0.15, { clip: "ShotCollapse" });
  // 中枪后往沟里栽下去（停在支沟北壁脚下，不留在土埂斜坡上）
  s.Go("IjaMgLoader", v + 0.15, v + 1.6, 57.4, 63.7, { move: "walk" });
  s.Go("IjaMgGunner", v + 0.1, v + 2.0, 56.0, 63.6, { move: "walk" });
  s.Key("IjaMgLoader", v + 1.8, { state: "down", clip: null });
  s.Key("IjaMgGunner", v + 2.2, { state: "down", clip: null });
  // 丁胸口中弹，倒在顺子面前
  s.Key("IjaDing", v + 0.3, { clip: "ShotCollapse", clipHold: true });
  s.Go("IjaDing", v + 0.3, v + 1.3, 61.38, 64.2, { move: "walk" });
  s.Key("IjaDing", v + 1.9, { state: "down", clip: null, yawDeg: -90 });
  // 甲胳膊中弹，手一松，冬瓜摔回泥里
  s.Key("IjaJia", v + 0.5, { stance: "stand", clip: "IjaShotStaggerAway" });
  s.Go("IjaJia", v + 0.5, v + 2.6, 59.3, 64.0, { move: "walk", yawDeg: 90 });
  s.Key("Donggua", v + 0.55, { state: "down", clip: null });
  s.Go("Donggua", v + 0.55, v + 1.0, 57.49, 65.15, { move: "cut", yawDeg: 90 });
  s.Eye(v - 0.2, 1.4, { stance: "prone", yaw: 95, pitch: 1, toLook: { x: 60, z: 64.5 }, toPitch: 4, shake: 0.15 });
  // 敌袭！不吹号，「杀——！」一片吼声从台阶上压下来
  s.Say("Counter.02", "IjaYi", v + 1.0);
  s.Key("IjaYi", v + 0.8, { yawDeg: 90 });
  const roar = s.Say("Counter.03", "HeYoutian");
  const charge = roar + 0.2;
  s.Key("Luo", charge - 0.2, { aim: false, clip: "CreepDadao" });
  s.Go("Luo", charge, charge + 8.5, 58.6, 64.4, { move: "run", path: [{ x: 30, z: BZ(30) }] });
  s.Go("LiuWencai", charge + 0.3, charge + 9.0, 52.45, 64.67, { move: "run" });
  s.Go("HeYoutian", charge + 0.5, charge + 9.6, 50.02, 65.92, { move: "run" });
  s.Go("Squad1", charge + 0.6, charge + 9.8, 47.47, 65.08, { move: "run" });
  s.Go("Squad2", charge + 0.8, charge + 10.4, 45.02, 66.04, { move: "run" });
  s.Eye(roar, 3.0, { stance: "prone", look: { x: 60, z: 64.5 }, pitch: 4, toYaw: 94, toPitch: 2 });
  // 翻译想跑，被打倒
  s.Key("Interpreter", v + 1.4, { stance: "stand", clip: "InterpreterFlee" });
  s.Go("Interpreter", v + 1.4, v + 3.0, 56.0, 63.5, { move: "run" });
  s.Key("Interpreter", charge + 3.0, { clip: "InterpreterShotStagger" });
  Shot(s, charge + 2.9, "LiuWencai");
  s.Go("Interpreter", charge + 3.0, charge + 5.4, 55.39, 63.68, { move: "walk" });
  s.Key("Interpreter", charge + 5.6, { state: "down", clip: null, yawDeg: -60 });
  // 班长抡着大刀：砍！（冬瓜的嚎声让他们冲得更急）
  s.Say("Counter.04", "Luo", charge + 6.4);
  // 甲中了枪也不慌，单手去摸手榴弹，班长一刀先劈在他身上
  s.Key("IjaJia", charge + 5.2, { clip: "IjaGrenadeBitePin", faceTo: "Luo" });
  s.Key("Luo", charge + 8.4, { clip: "LuoDadaoChopRear", faceTo: "IjaJia" });
  s.Key("IjaJia", charge + 8.9, { clip: "IjaParriedChoppedFall", clipHold: true });
  s.Go("IjaJia", charge + 8.9, charge + 10.4, 59.79, 63.5, { move: "walk" });
  s.Key("IjaJia", charge + 11.2, { state: "down", clip: null, yawDeg: 90 });
  s.Eye(charge + 6.0, 2.0, { stance: "prone", yaw: 94, pitch: 2, toLook: { x: 59.3, z: 64.0 }, toPitch: 8 });
  // 刘文财看见泥里的顺子
  s.Say("Counter.05", "LiuWencai", charge + 9.4);
  // 乙挺着刺刀迎上来，被刘文财一枪打倒
  const yi = charge + 9.0;
  s.Go("IjaYi", yi, yi + 1.8, 55.4, 65.3, { move: "run", path: [{ x: 59.8, z: 65.4 }] });
  s.Key("IjaYi", yi + 1.6, { clip: "BayonetClearWood" });
  Shot(s, yi + 2.0, "LiuWencai");
  s.Key("IjaYi", yi + 2.05, { clip: "ShotCollapse", clipHold: true });
  s.Go("IjaYi", yi + 2.05, yi + 3.0, 54.62, 65.63, { move: "walk" });
  s.Key("IjaYi", yi + 3.6, { state: "down", clip: null, yawDeg: 90 });
  s.Eye(yi, 2.2, { stance: "prone", look: { x: 59.3, z: 64.0 }, pitch: 8, toLook: { x: 55.4, z: 65.3 }, toPitch: 4 });
  // 收尾：班长转身守着洞口那头，其余人到 02-2 布设
  s.Go("Luo", charge + 11.0, charge + 12.6, 60.65, 64.45, { move: "walk", yawDeg: -86, depart: { clip: null } });
  s.Key("Luo", charge + 12.8, { aim: true });
  for (const id of ["LiuWencai", "Squad1", "Squad2"]) s.Key(id, charge + 13.0, { yawDeg: -86, aim: true });
  s.Key("HeYoutian", charge + 13.0, { yawDeg: -86 });
  s.Eye(charge + 12.0, 2.5, { stance: "prone", look: { x: 55.4, z: 65.3 }, pitch: 4, toLook: { x: 60.65, z: 64.45 }, toPitch: 18 });
  return s.Done({ durationS: charge + 15.5 });
}

function S0203(ctx) {
  const s = new Seq(ctx, "02-3", "接枪、揪被角");
  const ME = { x: 63.3, z: 63.8 };
  const DG = { x: 57.49, z: 65.15 };
  s.Place("HeYoutian", 0, 62.4, 64.7, { stance: "crouch", faceTo: "player" });
  s.Place("Luo", 0, 60.65, 64.45, { aim: true, yawDeg: -86 });
  s.Key("Blanket", 0, { visible: false });
  s.Eye(0, 2.6, { stance: "prone", x: ME.x, z: ME.z, look: { x: 62.4, z: 64.7 }, pitch: 12 });
  // 何有田扒开土，看见了顺子
  s.Key("HeYoutian", 0.4, { clip: "WoundedReach" });
  s.Say("Release.01", "HeYoutian", 1.0);
  // 抬起木头，顺子撑着地挣出来
  s.Key("HeYoutian", 2.5, { clip: "HeLiftTimber" });
  const out = s.Say("Release.02", null, 4.6);
  s.Cam(out - 0.2, 2.2, { from: { x: ME.x, z: ME.z, h: 0.32 }, to: { x: 62.6, z: 64.2, h: 1.05 }, look: { x: 61.2, z: 64.4, h: 0.6 }, lookTo: { x: 58.2, z: 65.0, h: 0.6 } });
  // 何有田扑到冬瓜身边
  s.Go("HeYoutian", out + 0.8, out + 3.2, 56.2, 65.5, { move: "run", faceTo: "Donggua", depart: { clip: null } });
  const hold = s.Say("Release.03", "HeYoutian", out + 3.0);
  s.Eye(out + 2.0, 3.5, { stance: "crouch", x: 62.6, z: 64.2, look: { x: 58.2, z: 65.0 }, pitch: -6, toLook: { x: 56.6, z: 65.4 }, toPitch: -8 });
  // 扯开冬瓜的背包，抽出那床单被铺在沟底，几个人把冬瓜挪上去
  const blanket = s.End("Release.03") + 0.6;
  s.Key("HeYoutian", blanket - 0.4, { clip: "WoundedReach" });
  s.Key("Blanket", blanket, { visible: true });
  s.Go("Luo", blanket, blanket + 1.4, 58.6, 64.6, { move: "walk", faceTo: "Donggua", depart: { aim: false } });
  s.Key("Luo", blanket + 1.4, { clip: "PullComrade" });
  s.Key("HeYoutian", blanket + 1.4, { clip: "PullComrade" });
  s.Caption(blanket, 3.0, "（何有田抽出单被铺在沟底，几个人把冬瓜挪上去）");
  // 顺子过去；冬瓜一把攥住顺子的袖子
  const near = blanket + 3.4;
  s.Cam(near - 1.6, 1.8, { from: { x: 62.6, z: 64.2, h: 1.05 }, to: { x: 58.6, z: 65.6, h: 1.05 }, look: { x: 57.6, z: 65.2, h: 0.3 } });
  s.Eye(near + 0.2, 3.4, { stance: "crouch", x: 58.6, z: 65.6, look: { x: 57.5, z: 65.2 }, pitch: -38 });
  s.Key("Donggua", near - 0.2, { clip: "WoundedReach", faceTo: "player" });
  s.Say("Release.04", "Donggua", near + 0.3);
  s.Key("Donggua", s.End("Release.04") + 0.2, { clip: null });
  s.Caption(s.End("Release.04"), 2.0, "（然后手松开了）");
  // 班长站到顺子面前：还能打不？把枪塞进顺子手里
  const luo = s.End("Release.04") + 0.2;
  s.Go("Luo", luo - 1.2, luo + 0.6, 60.2, 65.1, { move: "walk", faceTo: "player", depart: { clip: null } });
  s.Eye(luo - 0.2, 1.0, { stance: "crouch", x: 58.6, z: 65.6, look: { x: 57.5, z: 65.2 }, pitch: -38, toLook: { x: 60.2, z: 65.1 }, toPitch: 8 });
  const can = s.Say("Release.05", "Luo", luo + 0.5);
  s.Key("Luo", can + 1.4, { clip: "LuoHandRifle" });
  s.Caption(can + 2.6, 2.4, "（班长把枪塞进顺子手里）");
  s.Eye(can + 2.6, 1.2, { stance: "crouch", x: 58.6, z: 65.6, look: { x: 60.2, z: 65.1 }, pitch: 8, toPitch: -25 });
  const go = s.Say("Release.06", "Luo");
  // 顺子站起来（玩家拿回操作）
  s.Eye(go + 0.2, 1.4, { stance: "stand", x: 59.24, z: 65.04, look: { x: 60.4, z: 65.2 }, pitch: 2 });
  s.Go("Luo", go + 1.6, go + 2.6, 61.12, 65.52, { move: "walk", yawDeg: -86, depart: { clip: null } });
  s.Key("Luo", go + 2.7, { aim: true });
  // 何有田揪起一个被角：顺儿，揪到那头！
  s.Go("HeYoutian", go, go + 0.9, 55.89, 65.25, { move: "walk", yawDeg: 93.6 + 180, depart: { clip: null } });
  s.Key("HeYoutian", go + 1.0, { stance: "crouch", carryRole: "front", faceTo: "Donggua" });
  s.Say("Release.07", "HeYoutian", go + 1.4);
  s.Eye(go + 1.6, 1.2, { stance: "stand", x: 59.24, z: 65.04, look: { x: 60.4, z: 65.2 }, pitch: 2, toLook: { x: 55.9, z: 65.25 }, toPitch: -14 });
  void hold;
  return s.Done({ durationS: s.End("Release.07") + 2.4 });
}

/** 拖单被一段：冬瓜 + 单被 + 何有田（被角）沿 path 走，顺子跟着倒退拖；班长倒退着断后。 */
function DragLeg(s, t0, t1, { blanket, he, path, luo, luoPath }) {
  s.Key("HeYoutian", t0, { carryRole: "front", stance: "crouch" });
  s.Go("Blanket", t0, t1, blanket.x, blanket.z, { move: "drag", ...(path ? { path: path.b } : {}) });
  s.Go("Donggua", t0, t1, blanket.x, blanket.z, { move: "drag", ...(path ? { path: path.b } : {}) });
  s.Go("HeYoutian", t0, t1, he.x, he.z, { move: "drag", ...(path ? { path: path.h } : {}) });
  if (luo) s.Go("Luo", t0 + 0.6, t1 + 0.4, luo.x, luo.z, { move: "drag", aim: true, ...(luoPath ? { path: luoPath } : {}) });
}

function S0204(ctx) {
  const s = new Seq(ctx, "02-4", "支沟里第一次回身打");
  // 开场接 02-3：被子在洞口这头
  s.Place("Blanket", 0, 57.49, 65.15, { yawDeg: 93.6 });
  s.Place("Donggua", 0, 57.49, 65.15, { yawDeg: 93.6 });
  s.Place("HeYoutian", 0, 55.89, 65.25, { carryRole: "front", stance: "crouch" });
  s.Place("Luo", 0, 61.12, 65.52, { aim: true, yawDeg: -86 });
  for (const id of ["Pursuer1", "Pursuer2", "Pursuer3"]) s.Place(id, 0, 63.2, 64.9, { visible: false, aim: false });
  // 拖：顺子和何有田各揪一个被角，顺着支沟往下拖，冬瓜就在脚边；拖的时候手上没枪
  const t1 = 12.5;
  DragLeg(s, 0.6, t1, { blanket: { x: 43.1, z: 66.76 }, he: { x: 41.51, z: 66.86 }, luo: { x: 49.08, z: 66.18 } });
  s.Cam(0, t1 + 0.4, { from: { x: 58.6, z: 64.6, h: 1.5 }, to: { x: 44.3, z: 65.9, h: 1.5 }, look: { actor: "Donggua", offset: [-0.6, 0.1, 0.2] }, ease: "linear" });
  s.Caption(1.0, 3.2, "（揪着被角倒退拖：拖的时候手上没枪）");
  // 追兵从洞口那头露头；班长先开枪：后头！
  const peek = t1 - 0.8;
  s.Key("Pursuer1", peek - 1.6, { visible: true });
  s.Key("Pursuer2", peek - 1.0, { visible: true });
  s.Key("Pursuer3", peek - 0.4, { visible: true });
  s.Go("Pursuer1", peek - 1.6, peek + 1.2, 60.05, 65.39, { move: "run", aim: true, yawDeg: 92.6 });
  s.Go("Pursuer2", peek - 1.0, peek + 1.4, 58.36, 63.99, { move: "run", aim: true, yawDeg: 94.9 });
  s.Go("Pursuer3", peek - 0.4, peek + 1.8, 56.63, 65.2, { move: "run", yawDeg: 93.1 });
  Shot(s, peek + 1.4, "Luo");
  const back = s.Say("DragBack.01", "Luo", peek + 1.6);
  // 子弹打在被子边上的土里，冬瓜疼得叫
  Shot(s, back + 0.6, "Pursuer1"); Puff(s, back + 0.65, { x: 43.9, z: 67.5 });
  Shot(s, back + 1.3, "Pursuer2"); Puff(s, back + 1.35, { x: 42.4, z: 66.1 });
  s.Caption(back + 0.8, 2.0, "（冬瓜疼得叫）");
  // 玩家松手、转身；被子停在原地，何有田一个人拖不动，拽着往沟壁靠
  const turn = back + 1.2;
  s.Eye(turn, 1.0, { stance: "stand", x: 45.5, z: 65.11, yaw: 95, pitch: -12, toYaw: -91.1, toPitch: 0 });
  s.Go("Blanket", turn + 0.4, turn + 3.0, 43.1, 67.2, { move: "drag" });
  s.Go("Donggua", turn + 0.4, turn + 3.0, 43.1, 67.2, { move: "drag" });
  s.Go("HeYoutian", turn + 0.4, turn + 3.0, 41.6, 67.3, { move: "drag" });
  for (const dt of [1.6, 3.4, 5.6]) Shot(s, turn + dt, "player");
  Shot(s, turn + 2.4, "Luo"); Shot(s, turn + 4.6, "Luo");
  // 追兵挨打缩回去
  const retreat = turn + 5.0;
  s.Go("Pursuer1", retreat, retreat + 3.2, 63.0, 64.7, { move: "run" });
  s.Go("Pursuer2", retreat - 0.6, retreat + 2.8, 62.6, 64.2, { move: "run" });
  s.Go("Pursuer3", retreat - 1.2, retreat + 2.0, 62.6, 65.2, { move: "run" });
  for (const id of ["Pursuer1", "Pursuer2", "Pursuer3"]) s.Key(id, retreat + 3.4, { visible: false });
  // 打退了再揪起被角
  s.Eye(retreat + 4.0, 1.0, { stance: "stand", x: 45.5, z: 65.11, yaw: -91.1, pitch: 0, toLook: { x: 43.1, z: 67.2 }, toPitch: -24 });
  s.Caption(retreat + 4.4, 2.0, "（打退了，再揪起被角接着拖）");
  return s.Done({ durationS: retreat + 6.6 });
}

function S0205(ctx) {
  const s = new Seq(ctx, "02-5", "支沟口第二次打");
  // 开场接 02-4 末
  s.Place("Blanket", 0, 43.1, 67.2); s.Place("Donggua", 0, 43.1, 67.2);
  s.Place("HeYoutian", 0, 41.6, 67.3, { carryRole: "front", stance: "crouch" });
  s.Place("Luo", 0, 49.08, 66.18, { aim: true, yawDeg: -86 });
  for (const id of ["Pursuer1", "Pursuer2", "Pursuer3"]) s.Place(id, 0, 62.8, 64.8, { visible: false, aim: false });
  s.Place("LiuWencai", 0, 24.0, 72.0, { yawDeg: 160 });
  s.Place("Squad1", 0, 24.9, 74.6, { yawDeg: 160 });
  s.Place("Squad2", 0, 25.6, 77.0, { yawDeg: 160 });
  const t1 = 16.0;
  DragLeg(s, 0.5, t1, {
    blanket: { x: 24.23, z: 70.25 }, he: { x: 24.86, z: 71.73 },
    path: { b: [{ x: 30, z: 67.1 }, { x: 25.2, z: 67.6 }], h: [{ x: 28.4, z: 67.4 }, { x: 24.4, z: 68.6 }] },
    luo: { x: 25.16, z: 66.29 }, luoPath: [{ x: 32, z: 66.2 }],
  });
  s.Go("LiuWencai", 3.0, t1, 26.58, 79.04, { move: "walk" });
  s.Go("Squad1", 3.0, t1, 28.59, 81.44, { move: "walk" });
  s.Go("Squad2", 3.0, t1, 28.66, 84.13, { move: "walk" });
  s.Cam(0, 12.5, { from: { x: 44.6, z: 66.2, h: 1.5 }, to: { x: 27.0, z: 66.3, h: 1.5 }, look: { actor: "Donggua", offset: [-0.6, 0.1, 0.2] }, ease: "linear" });
  s.Cam(12.5, 3.9, { from: { x: 27.0, z: 66.3, h: 1.5 }, to: { x: 22.6, z: 68.0, h: 1.6 }, look: { actor: "Donggua", offset: [0, 0.1, -0.3] }, ease: "linear" });
  // 坡上那个坑里的捷克式还在一阵一阵地响；班长回头看了一眼，没说话
  for (const t of [3.2, 7.8, 11.6, 15.4]) s.Sfx(t, "mgBurstFar", { x: PIT_GUN.x, z: PIT_GUN.z });
  s.Key("Luo", t1 + 0.6, { faceTo: PIT_GUN, aim: false });
  s.Eye(t1 + 0.4, 2.6, { stance: "stand", x: 22.6, z: 68.0, look: { x: 24.2, z: 70.2 }, pitch: -20, toLook: { x: 25.16, z: 66.29 }, toPitch: 4 });
  s.Sfx(t1 + 1.0, "mgBurstFar", { x: PIT_GUN.x, z: PIT_GUN.z });
  s.Key("Luo", t1 + 2.8, { yawDeg: -86, aim: true });
  // 追兵顺着笔直的支沟打过来
  const peek = t1 + 3.4;
  s.Key("Pursuer1", peek - 3.6, { visible: true }); s.Key("Pursuer2", peek - 3.2, { visible: true }); s.Key("Pursuer3", peek - 2.8, { visible: true });
  s.Go("Pursuer1", peek - 3.6, peek + 0.6, 49.07, 65.98, { move: "run", aim: true, yawDeg: 92.4 });
  s.Go("Pursuer2", peek - 3.2, peek + 0.6, 45.49, 64.91, { move: "run", aim: true, yawDeg: 95.3 });
  s.Go("Pursuer3", peek - 2.8, peek + 1.2, 42.05, 66.03, { move: "run", aim: true, yawDeg: 93 });
  Shot(s, peek + 0.4, "Luo");
  const back = s.Say("DragBack.02", "Luo", peek + 0.6);
  Shot(s, back + 1.0, "Pursuer3"); Puff(s, back + 1.08, { x: 23.6, z: 69.6 });
  Shot(s, back + 1.8, "Pursuer1"); Puff(s, back + 1.9, { x: 25.0, z: 70.9 });
  const turn = back + 1.2;
  s.Eye(turn, 1.0, { stance: "stand", x: 22.25, z: 67.17, look: { x: 24.2, z: 70.2 }, pitch: -16, toYaw: -87.5, toPitch: 0 });
  for (const dt of [1.6, 3.2, 5.0]) Shot(s, turn + dt, "player");
  Shot(s, turn + 2.4, "Luo"); Shot(s, turn + 4.2, "Luo");
  const retreat = turn + 5.6;
  s.Go("Pursuer3", retreat, retreat + 4.0, 56, BZ(56), { move: "run" });
  s.Go("Pursuer2", retreat - 0.4, retreat + 3.6, 57.5, BZ(57.5) - 0.4, { move: "run" });
  s.Go("Pursuer1", retreat - 0.8, retreat + 2.6, 58.5, BZ(58.5) + 0.4, { move: "run" });
  for (const id of ["Pursuer1", "Pursuer2", "Pursuer3"]) s.Key(id, retreat + 4.2, { visible: false });
  s.Eye(retreat + 3.0, 1.0, { stance: "stand", x: 22.25, z: 67.17, yaw: -87.5, pitch: 0, toLook: { x: 24.23, z: 70.25 }, toPitch: -22 });
  return s.Done({ durationS: retreat + 5.0 });
}

function S0206(ctx) {
  const s = new Seq(ctx, "02-6", "拐角 2 第三次打");
  s.Place("Blanket", 0, 24.23, 70.25); s.Place("Donggua", 0, 24.23, 70.25);
  s.Place("HeYoutian", 0, 24.86, 71.73, { carryRole: "front", stance: "crouch" });
  s.Place("Luo", 0, 25.16, 66.29, { aim: true, yawDeg: -86 });
  for (const id of ["Pursuer1", "Pursuer2", "Pursuer3"]) s.Place(id, 0, 23.0, 66.9, { visible: false, aim: false });
  s.Place("LiuWencai", 0, 26.58, 79.04); s.Place("Squad1", 0, 28.59, 81.44); s.Place("Squad2", 0, 28.66, 84.13);
  const t1 = 15.5;
  DragLeg(s, 0.5, t1, {
    blanket: { x: 31.45, z: 89.21 }, he: { x: 31.71, z: 90.78 },
    path: { b: [{ x: 30.1, z: 85.6 }], h: [{ x: 30.6, z: 86.8 }] },
    luo: { x: 29.54, z: 83.15 }, luoPath: [{ x: 24.0, z: 69.6 }],
  });
  s.Go("LiuWencai", 1.0, t1, 31.74, 98.89, { move: "walk" });
  s.Go("Squad1", 1.0, t1, 33.12, 101.7, { move: "walk" });
  s.Go("Squad2", 1.0, t1, 32.63, 104.82, { move: "walk" });
  s.Cam(0, 12.0, { from: { x: 23.4, z: 69.4, h: 1.5 }, to: { x: 28.9, z: 83.6, h: 1.5 }, look: { actor: "Donggua", offset: [0, 0.1, 0.4] }, ease: "linear" });
  s.Cam(12.0, 3.9, { from: { x: 28.9, z: 83.6, h: 1.5 }, to: { x: 29.77, z: 86.44, h: 1.6 }, look: { actor: "Donggua", offset: [0, 0.1, 0.4] }, ease: "linear" });
  for (const t of [4.0, 10.5]) s.Sfx(t, "mgBurstFar", { x: PIT_GUN.x, z: PIT_GUN.z, volume: 0.8 });
  // 追兵又追上来露头
  const peek = t1 + 1.0;
  s.Key("Pursuer1", peek - 3.4, { visible: true }); s.Key("Pursuer2", peek - 3.0, { visible: true }); s.Key("Pursuer3", peek - 2.4, { visible: true });
  s.Go("Pursuer3", peek - 3.4, peek + 0.6, 27.12, 78.53, { move: "run", aim: true, yawDeg: 203.2 });
  s.Go("Pursuer2", peek - 3.0, peek + 0.6, 25.31, 76.59, { move: "run", aim: true, yawDeg: 203.2 });
  s.Go("Pursuer1", peek - 2.4, peek + 0.6, 25.43, 73.81, { move: "run", aim: true, yawDeg: 203.2 });
  Shot(s, peek + 0.3, "Luo");
  const back = s.Say("DragBack.03", "Luo", peek + 0.5);
  Shot(s, back + 0.9, "Pursuer3"); Puff(s, back + 1.0, { x: 30.6, z: 89.8 });
  const turn = back + 1.0;
  s.Eye(turn, 1.0, { stance: "stand", x: 29.77, z: 86.44, look: { x: 31.45, z: 89.21 }, pitch: -22, toYaw: 18.5, toPitch: 0 });
  for (const dt of [1.6, 3.2, 4.8]) Shot(s, turn + dt, "player");
  Shot(s, turn + 2.2, "Luo"); Shot(s, turn + 4.0, "Luo");
  const retreat = turn + 5.4;
  s.Go("Pursuer3", retreat, retreat + 3.0, 23.0, 67.4, { move: "run" });
  s.Go("Pursuer2", retreat - 0.3, retreat + 2.6, 22.6, 67.2, { move: "run" });
  s.Go("Pursuer1", retreat - 0.6, retreat + 2.0, 22.4, 67.0, { move: "run" });
  for (const id of ["Pursuer1", "Pursuer2", "Pursuer3"]) s.Key(id, retreat + 3.2, { visible: false });
  s.Eye(retreat + 2.6, 1.0, { stance: "stand", x: 29.77, z: 86.44, yaw: 18.5, pitch: 0, toLook: { x: 31.45, z: 89.21 }, toPitch: -22 });
  return s.Done({ durationS: retreat + 4.6 });
}

function S0207(ctx) {
  const s = new Seq(ctx, "02-7", "翻坡顶：快过来！");
  s.Place("Blanket", 0, 31.45, 89.21); s.Place("Donggua", 0, 31.45, 89.21);
  s.Place("HeYoutian", 0, 31.71, 90.78, { carryRole: "front", stance: "crouch" });
  s.Place("Luo", 0, 29.54, 83.15, { aim: true, yawDeg: 23.2 });
  s.Place("LiuWencai", 0, 31.74, 98.89); s.Place("Squad1", 0, 33.12, 101.7); s.Place("Squad2", 0, 32.63, 104.82);
  for (const id of ["Pursuer1", "Pursuer2", "Pursuer3"]) s.Place(id, 0, 22.8, 67.2, { visible: false, aim: false });
  // 拖：拐角 2 → 路口 → 坡顶（45 m；示意里拖得比实际快）
  const t1 = 24.0;
  DragLeg(s, 0.4, t1, {
    blanket: { x: 35, z: 134.2 }, he: { x: 35, z: 135.8 },
    path: { b: [{ x: 34.6, z: 110 }, { x: 35, z: 120 }, { x: 35, z: 131 }], h: [{ x: 34.7, z: 111.5 }, { x: 35, z: 121.5 }, { x: 35, z: 132.5 }] },
    luo: { x: 35.7, z: 128.4 }, luoPath: [{ x: 34.2, z: 106 }, { x: 35.6, z: 116 }],
  });
  s.Go("LiuWencai", 0.4, t1 - 2, 34.6, 141, { move: "walk", path: [{ x: 35, z: 131 }] });
  s.Go("Squad1", 0.4, t1 - 1, 35.5, 143.5, { move: "walk", path: [{ x: 35, z: 131 }] });
  s.Go("Squad2", 0.4, t1, 34.5, 146, { move: "walk", path: [{ x: 35, z: 131 }] });
  s.Cam(0, 10.5, { from: { x: 30.2, z: 87.2, h: 1.5 }, to: { x: 33.7, z: 108.0, h: 1.5 }, look: { actor: "Donggua", offset: [0, 0.1, 0.5] }, ease: "linear" });
  s.Cam(10.5, 4.7, { from: { x: 33.7, z: 108.0, h: 1.5 }, to: { x: 34.3, z: 115.6, h: 1.5 }, look: { actor: "Donggua", offset: [0, 0.1, 0.5] }, ease: "linear" });
  s.Cam(19.0, 5.2, { from: { x: 34.4, z: 122.6, h: 1.5 }, to: { x: 34.5, z: 130.5, h: 1.62 }, look: { actor: "Donggua", offset: [0, 0.1, 0.5] }, ease: "linear" });
  s.Sfx(3.0, "mgBurstFar", { x: PIT_GUN.x, z: PIT_GUN.z, volume: 0.7 });
  // 坡沿上趴着别的班的几个兵：快过来！
  s.Cam(15.2, 3.8, { from: { x: 34.3, z: 115.6, h: 1.5 }, to: { x: 34.4, z: 122.6, h: 1.5 }, look: { actor: "CrestNra1", offset: [0, 0.4, 0] }, ease: "linear" });
  s.Key("CrestNra1", 15.4, { faceTo: "player" });
  s.Say("DragBack.04", "CrestNra1", 15.8);
  s.Key("CrestNra1", 18.0, { yawDeg: 15.4 });
  // 一翻过去，这几个兵就朝拐角 2 开枪；追兵一露头就挨枪，缩回去了
  const peek = t1 - 2.4;
  s.Key("Pursuer1", peek - 3.4, { visible: true }); s.Key("Pursuer2", peek - 3.0, { visible: true }); s.Key("Pursuer3", peek - 2.6, { visible: true });
  s.Go("Pursuer1", peek - 3.4, peek + 0.6, 29.29, 82.82, { move: "run", aim: true, yawDeg: 203.2 });
  s.Go("Pursuer2", peek - 3.0, peek + 0.6, 27.48, 81.64, { move: "run", yawDeg: 203.2 });
  s.Go("Pursuer3", peek - 2.6, peek + 0.6, 27.6, 79.63, { move: "run", yawDeg: 203.2 });
  const volley = t1 + 0.6;
  s.Sfx(volley, "rifleVolley", { x: 50, z: 129.5 });
  for (const id of ["CrestNra1", "CrestNra2", "CrestNra3", "CrestNra4"]) s.Ev(volley + (id.at(-1) - 1) * 0.15, "muzzle", { actor: id });
  Puff(s, volley + 0.25, { x: 29.8, z: 83.6 }); Puff(s, volley + 0.4, { x: 28.2, z: 82.0 });
  s.Eye(t1 + 0.2, 1.0, { stance: "stand", x: 34.5, z: 130.5, look: { x: 35, z: 134.2 }, pitch: -20, toYaw: 5.8, toPitch: -3 });
  s.Go("Pursuer1", volley + 0.5, volley + 2.4, 24.0, 69.5, { move: "run" });
  s.Go("Pursuer2", volley + 0.3, volley + 2.4, 23.6, 69.0, { move: "run" });
  s.Go("Pursuer3", volley + 0.2, volley + 2.2, 23.2, 68.5, { move: "run" });
  for (const id of ["Pursuer1", "Pursuer2", "Pursuer3"]) s.Key(id, volley + 2.6, { visible: false });
  s.Sfx(volley + 2.0, "rifleVolley", { x: 50, z: 129.5, volume: 0.7 });
  return s.Done({ durationS: volley + 4.6 });
}

// ---------------------------------------------------------------------------
// 02末 集结处

function S02E1(ctx) {
  const s = new Seq(ctx, "02E-1", "集结处：幺娃回来没得？");
  // 背坡洼地满地伤员；卫生兵背对着顺子蹲在冬瓜身边处理伤口
  s.Key("Medic", 0, { clip: "ClipLoad" });
  s.Eye(0, 4.0, { stance: "stand", yaw: -146.3, pitch: -12, toPitch: -16 });
  // 坡顶那边有一挺机枪一直在响
  for (const t of [2.0, 9.5, 17.0, 24.5, 31.0]) s.Sfx(t, "mgBurstFar", { x: 50, z: 126 });
  // 担架员抬走一副，又空着手跑回来抬下一副
  s.Go("Stretcher1", 1.0, 12.5, 35, 141, { move: "walk", path: [{ x: 37, z: 156 }, { x: 35, z: 146 }] });
  s.Key("Stretcher1", 12.8, { visible: false });
  s.Eye(4.0, 2.0, { stance: "stand", yaw: -146.3, pitch: -16, toLook: { x: 38, z: 154 }, toPitch: -6 });
  s.Eye(6.0, 6.0, { stance: "stand", look: { x: 38, z: 154 }, pitch: -6, toLook: { x: 35, z: 143 }, toPitch: -2 });
  s.Spawn("Bearer1", { x: 35.2, z: 141.5, yawDeg: 180 }, { visible: false });
  s.Spawn("Bearer2", { x: 34.6, z: 140.5, yawDeg: 180 }, { visible: false });
  s.Key("Bearer1", 13.6, { visible: true }); s.Key("Bearer2", 14.0, { visible: true });
  s.Go("Bearer1", 13.6, 18.6, 35.6, 159.6, { move: "run", faceTo: "Donggua", path: [{ x: 35, z: 146 }, { x: 37.4, z: 156.4 }] });
  s.Go("Bearer2", 14.0, 19.0, 33.0, 159.4, { move: "run", faceTo: "Donggua", path: [{ x: 35, z: 146 }, { x: 32.6, z: 156.8 }] });
  s.Eye(13.2, 5.4, { stance: "stand", look: { x: 35, z: 143 }, pitch: -2, toLook: { x: 35.2, z: 158.6 }, toPitch: -12 });
  // 担架员：下一趟就抬拉（冬瓜还躺在单被上）
  s.Key("Bearer1", 19.2, { stance: "crouch", clip: "WoundedReach" });
  s.Key("Bearer2", 19.4, { stance: "crouch" });
  s.Say("Gathering.01", "Bearer1", 19.6);
  // 班长扫了一眼周围的人：幺娃回来没得？
  s.Key("Luo", 19.8, { faceTo: { x: 35, z: 152 } });
  s.Eye(20.6, 1.0, { stance: "stand", look: { x: 35.2, z: 158.6 }, pitch: -12, toLook: { x: 28.5, z: 155.3 }, toPitch: 2 });
  s.Key("Luo", 21.0, { faceTo: "LiuWencai" });
  const ask = s.Say("Gathering.02", "Luo");
  // 没人吭声。刘文财摇了摇头（转头停一拍）
  s.Key("Luo", ask + 1.5, { faceTo: "player" });
  s.Eye(ask + 1.6, 1.0, { stance: "stand", look: { x: 28.5, z: 155.3 }, pitch: 2, toLook: { x: 27.6, z: 153.8 }, toPitch: 2 });
  s.Key("LiuWencai", ask + 2.2, { faceTo: "Luo" });
  s.Key("LiuWencai", ask + 3.4, { yawDeg: -100 });
  s.Key("LiuWencai", ask + 4.0, { yawDeg: -170 });
  s.Key("LiuWencai", ask + 4.6, { faceTo: { x: 35, z: 131 } });
  s.Caption(ask + 1.4, 4.0, "（没人吭声。刘文财摇了摇头）");
  return s.Done({ durationS: ask + 7.0 });
}

function S02E2(ctx) {
  const s = new Seq(ctx, "02E-2", "传令兵报坑，班长带人上去");
  // 传令兵逆着人流挤下来，满身是泥
  s.Place("Runner", 0, 35.0, 137.0, { yawDeg: 180 });
  s.Spawn("DownWounded", { x: 35.2, z: 135.0, yawDeg: 180, woundedWalk: true });
  s.Go("DownWounded", 0, 9.0, 31.4, 147.6, { move: "walk", path: [{ x: 35, z: 145 }], woundedWalk: true });
  s.Go("Runner", 0.4, 3.6, 34.6, 149, { move: "run", faceTo: "Luo", path: [{ x: 34.6, z: 145 }] });
  s.Key("Runner", 3.6, { clip: "MessengerReport" });
  s.Eye(0, 3.6, { stance: "stand", look: { x: 35, z: 140 }, pitch: 2, toLook: { x: 34.6, z: 148.6 }, toPitch: 0 });
  s.Say("Gathering.03", "Runner", 4.0);
  s.Key("Luo", 3.8, { faceTo: "Runner" });
  // 班长看了一眼满地的伤员
  const look = s.End("Gathering.03") + 0.2;
  s.Key("Luo", look, { faceTo: { x: 40, z: 162 } });
  s.Eye(look, 1.2, { stance: "stand", look: { x: 34.6, z: 148.6 }, pitch: 0, toLook: { x: 29.1, z: 154.3 }, toPitch: 2 });
  s.Say("Gathering.04", "Luo", look + 0.9);
  // 他留下何有田看着冬瓜，带顺子、刘文财往上走
  const go = s.End("Gathering.04") + 0.3;
  s.Key("Luo", go, { faceTo: "HeYoutian", clip: "InterpreterPoint" });
  s.Key("HeYoutian", go + 0.4, { faceTo: "Luo" });
  s.Go("Luo", go + 2.0, go + 7.5, 35, 145, { move: "walk", depart: { clip: null } });
  s.Go("LiuWencai", go + 2.6, go + 8.0, 34.4, 146.4, { move: "walk" });
  s.Eye(go + 2.0, 3.0, { stance: "stand", look: { x: 29.1, z: 154.3 }, pitch: 2, toLook: { x: 35, z: 145 }, toPitch: 0 });
  s.Caption(go + 4.6, 3.4, "（顺子一句话也没说，跟上了。上去的人本来该是他）");
  return s.Done({ durationS: go + 8.6 });
}

// ---------------------------------------------------------------------------
// 03 逆着人流上去，守坑

function S0301(ctx) {
  const s = new Seq(ctx, "03-1", "逆着人流");
  // 三个人侧着身子往北挤（东半边），人流往南（西半边）
  s.Go("Luo", 0.3, 22.0, 13.6, 22.6, { move: "walk" });
  s.Go("LiuWencai", 1.0, 23.5, 13.4, 28.4, { move: "walk" });
  s.Cam(0, 23.5, { from: { x: 13.0, z: 34.48, h: 1.6 }, to: { x: 13.5, z: 25.4, h: 1.6 }, look: { actor: "Luo", offset: [0, 1.4, -3.0] }, ease: "linear" });
  const south = (id, t0, t1, x, z, extra = {}) => s.Go(id, t0, t1, x, z, { move: "walk", path: [{ x: 12.1, z: 43.5 }], ...extra });
  south("RetreatNra1", 0, 16, 18.6, 58.0);
  south("WalkWounded1", 0, 24, 17.4, 56.0, { woundedWalk: true });
  south("RetreatHelper1", 0, 24, 18.3, 55.8);
  s.Key("WalkWounded1", 0, { woundedWalk: true });
  s.Go("RetreatNra2", 0, 12, 16.4, 54.0, { move: "walk" });
  s.Go("Stretcher2", 0, 24, 12.0, 43.6, { move: "walk", path: [{ x: 11.7, z: 24.5 }] });
  s.Go("RetreatNra3", 0, 20, 14.8, 50.0, { move: "walk", path: [{ x: 11.8, z: 24 }, { x: 11.9, z: 43.5 }] });
  s.Go("RetreatNra4", 0, 22, 12.4, 44.0, { move: "walk", path: [{ x: 11.8, z: 24 }] });
  s.Go("RetreatNra5", 0, 6, 16.6, 54.4, { move: "walk" });
  // 后面还有人一个接一个下来
  const stream = [["Flow1", 3.0], ["Flow2", 6.5], ["Flow3", 10.0], ["Flow4", 13.5], ["Flow5", 17.0]];
  for (const [id, t] of stream) {
    s.Spawn(id, { x: 12.4, z: 14.0, yawDeg: 180, ...(id === "Flow3" ? { woundedWalk: true } : {}) }, { visible: false });
    s.Key(id, t, { visible: true });
    s.Go(id, t, t + 16, 11.7, 38.0, { move: "walk", path: [{ x: 12.0, z: 21.8 }] });
  }
  // 挨撞挨骂：往哪走！
  s.Spawn("Shover", { x: 11.8, z: 22.0, yawDeg: 180 });
  s.Go("Shover", 0, 7.0, 12.4, 34.0, { move: "walk" });
  s.Say("PitHold.01", "Shover", 5.4);
  s.Shake(5.6, 0.3, 0.25);
  // 越往上枪声越近
  for (const [t, v] of [[2.0, 0.4], [8.5, 0.55], [14.0, 0.7], [19.5, 0.9], [23.0, 1.0]]) s.Sfx(t, "mgBurstFar", { x: 0, z: -40, volume: v });
  s.Sfx(11.0, "artilleryFar", { volume: 0.6 });
  s.Caption(9.0, 4.0, "（整条线在撤，只有我们在往回走）");
  return s.Done({ durationS: 25.0 });
}

function S0302(ctx) {
  const s = new Seq(ctx, "03-2", "进坑就挨一发掷弹筒");
  // 刚挤进去
  s.Place("Luo", 0, 0.6, 3.0, { stance: "stand" });
  s.Place("LiuWencai", 0, 0.4, 6.2, { stance: "stand" });
  s.Go("Luo", 0, 4.4, -1.6, -4.7, { move: "walk", stance: "crouch", yawDeg: -28.1 });
  s.Go("LiuWencai", 0.4, 5.2, -2.8, -4.6, { move: "walk", stance: "crouch", yawDeg: -38 });
  s.Place("PitNra2", 0, 3.0, -9.2, { state: "alive", stance: "stand", aim: true, yawDeg: 0 });
  s.Key("Yaowa", 0, { clip: "YaowaSitLoad", faceTo: "Gunner" });
  s.Cam(0, 4.4, { from: { x: 0.6, z: 6.5, h: 1.6 }, to: { x: 0.9, z: -5, h: 1.05 }, look: { x: 0.6, z: -12, h: 1.2 }, ease: "linear" });
  for (const t of [0.6, 4.2]) { Shot(s, t, "Gunner", { count: 5, sfx: "mgBurstNear" }); }
  s.Sfx(1.0, "mgBurstFar", { x: -30, z: -118 });
  // 掷弹筒：远处冒烟、嘭——约 5.5 s 后落在坑沿，把一个弟兄掀翻
  const hit = Mortar(s, 1.4, { x: 3.2, z: -10.4 }, { radius: 4, shake: 0.6 });
  s.Key("PitNra2", hit + 0.02, { clip: "ShotCollapse", clipHold: true });
  s.Go("PitNra2", hit + 0.02, hit + 0.9, 2.8, -5.6, { move: "cut" });
  s.Key("PitNra2", hit + 1.2, { state: "down", clip: null, yawDeg: -150 });
  s.Key("Luo", hit + 0.1, { clip: "DuckBlast" });
  s.Eye(4.4, hit - 4.4 + 0.2, { stance: "crouch", look: { x: 0.6, z: -12 }, pitch: 2, toLook: { x: 3.0, z: -9.6 }, toPitch: 2 });
  // 有人喊：丢弹筒！挪起走！
  s.Say("PitHold.02", "Gunner", hit + 0.8);
  s.Eye(hit + 0.6, 1.0, { stance: "crouch", look: { x: 3.0, z: -9.6 }, pitch: 2, toLook: { x: -1.2, z: -9.2 }, toPitch: 4 });
  Shot(s, hit + 3.6, "Gunner", { count: 6, sfx: "mgBurstNear" });
  // 幺娃在给机枪手压弹匣，看见顺子，愣了一下
  const see = s.End("PitHold.02") + 0.6;
  s.Eye(see - 0.4, 1.0, { stance: "crouch", look: { x: -1.2, z: -9.2 }, pitch: 4, toLook: { x: -2.4, z: -8.4 }, toPitch: -6 });
  s.Key("Yaowa", see, { clip: null, faceTo: "player" });
  s.Caption(see + 0.4, 2.4, "（幺娃看见顺子，愣了一下）");
  s.Key("Yaowa", see + 3.0, { clip: "YaowaSitLoad", faceTo: "Gunner" });
  // 轻机枪压着坑沿
  s.Sfx(see + 1.2, "mgBurstFar", { x: 40, z: -140 });
  Puff(s, see + 1.4, { x: -2.2, z: -11.2 }); Puff(s, see + 1.7, { x: 2.0, z: -11.4 });
  return s.Done({ durationS: see + 4.4 });
}

function S0303(ctx) {
  const s = new Seq(ctx, "03-3", "三个射位轮换");
  const A = { x: 0.8, z: -9.2 }, B = { x: 3.6, z: 1.0 }, C = { x: -9, z: -15 };
  // 甲位（坑沿，朝北）
  s.Eye(0, 4, { stance: "stand", x: A.x, z: A.z, yaw: 0, pitch: 1, toYaw: 8 });
  s.Eye(4, 11, { stance: "stand", x: A.x, z: A.z, yaw: 8, pitch: 1, toYaw: -14 });
  for (const t of [2.6, 5.8, 9.2, 12.8]) Shot(s, t, "player");
  Shot(s, 1.4, "Gunner", { count: 6, sfx: "mgBurstNear" }); Shot(s, 7.6, "Gunner", { count: 6, sfx: "mgBurstNear" });
  // 正面的步兵一段一段往前冲（跃进 → 卧倒）
  const bound = (ids, t, d) => {
    for (const id of ids) {
      const p = s.pos.get(id);
      s.Go(id, t, t + 3.2, p.x, p.z + d, { move: "run", depart: { stance: "stand", aim: false }, stance: "prone", aim: true });
    }
  };
  bound(["IjaRush1", "IjaRush2", "IjaRush5", "IjaRush6"], 2.0, 9);
  bound(["IjaRush3", "IjaRush4", "IjaRush7", "IjaRush8"], 10.0, 9);
  bound(["IjaRush1", "IjaRush2", "IjaRush5", "IjaRush6"], 30.0, 9);
  bound(["IjaRush3", "IjaRush7", "IjaRush8"], 44.0, 9);
  // 倒下一个马上有人补上
  s.Key("IjaRush4", 13.4, { clip: "ShotCollapse", clipHold: true });
  s.Key("IjaRush4", 15.0, { state: "down", clip: null });
  s.Spawn("IjaRushR1", { side: "ija", x: -1, z: -112, yawDeg: 180, stance: "stand" }, { visible: false });
  s.Key("IjaRushR1", 15.0, { visible: true });
  s.Go("IjaRushR1", 15.0, 21.0, -1.5, -84, { move: "run", stance: "prone", aim: true });
  // 两挺轻机枪压着坑沿（只负责压人），土点跟着玩家在的射位
  for (const t of [3.4, 10.6, 16.6, 27.0, 36.0, 46.0, 54.0]) {
    const id = Math.round(t) % 2 ? "IjaLmgWest" : "IjaLmgEast";
    Shot(s, t, id, { count: 6, sfx: "mgBurstFar" });
    Puff(s, t + 0.35, t < 19 ? { x: 0.2 + (t % 3) - 1, z: -11.0 } : t < 41 ? { x: -10.4, z: -16.4 } : { x: 5.6, z: -1.8 });
  }
  // 掷弹筒：一发比一发近
  Mortar(s, 4.0, { x: 7, z: -17.5 }, { shake: 0.25 });
  Mortar(s, 10.6, { x: 2.6, z: -12.9 }, { shake: 0.55 });
  // 坑西边开阔地上，日军侧翼兵从西北摸过来（丙位散兵坑外）
  const flank = [["IjaFlank1", -34, -36, -19.5, -25.5], ["IjaFlank2", -38, -31, -22.5, -21.5], ["IjaFlank3", -31, -41, -17.0, -29.0]];
  for (const [id, x0, z0] of flank) s.Spawn(id, { side: "ija", x: x0, z: z0, yawDeg: -130, stance: "prone" }, { visible: false });
  flank.forEach(([id, , , x1, z1], i) => {
    s.Key(id, 12.5 + i * 0.6, { visible: true });
    s.Go(id, 12.5 + i * 0.6, 17.0 + i * 0.6, x1, z1, { move: "run", depart: { stance: "crouch" }, stance: "prone", aim: true, faceTo: C });
  });
  // 他们一露头：左边沟里头有人！
  const shout = s.Say("PitHold.03", "LiuWencai", 16.4);
  s.Key("LiuWencai", shout - 0.3, { faceTo: { x: -20, z: -25 } });
  s.Eye(15.0, 1.2, { stance: "stand", x: A.x, z: A.z, yaw: -14, pitch: 1, toLook: { x: -20, z: -25 }, toPitch: 0 });
  Shot(s, 17.6, "IjaFlank1"); Puff(s, 17.7, { x: -1.6, z: -10.8 });
  // 换到丙位（散兵坑，朝西北）：沿爬沟过去，原来守丙位的兵让到坑里
  s.Cam(18.4, 2.6, { from: { x: A.x, z: A.z, h: 1.62 }, to: { x: -2.0, z: -8.0, h: 1.05 }, look: { x: -4.0, z: -9.6, h: 0.9 }, lookTo: { x: -6.0, z: -12.0, h: 0.9 } });
  s.Cam(21.0, 3.2, { from: { x: -2.0, z: -8.0, h: 1.05 }, to: { x: -8.6, z: -14.6, h: 0.95 }, look: { x: -6.0, z: -12.0, h: 0.9 }, lookTo: { x: -20, z: -25, h: 0.6 }, ease: "linear" });
  s.Go("PitNra3", 18.6, 23.6, -3.0, -6.6, { move: "walk", path: [{ x: -8, z: -14 }, { x: -3.5, z: -9 }], stance: "crouch", depart: { aim: false } });
  s.Eye(24.2, 15.6, { stance: "stand", x: C.x, z: C.z, look: { x: -20, z: -25 }, pitch: 0, toYaw: 30 });
  for (const t of [25.2, 27.8, 30.6, 33.8, 37.0]) Shot(s, t, "player");
  Shot(s, 26.4, "IjaFlank2"); Puff(s, 26.5, { x: -9.8, z: -16.2 });
  s.Key("IjaFlank1", 28.0, { clip: "ShotCollapse", clipHold: true });
  s.Key("IjaFlank1", 29.6, { state: "down", clip: null });
  s.Key("IjaFlank3", 34.0, { clip: "ShotCollapse", clipHold: true });
  s.Key("IjaFlank3", 35.6, { state: "down", clip: null });
  s.Go("IjaFlank2", 36.0, 39.0, -30, -30, { move: "run", stance: "prone" }); // 剩下的退回去
  Mortar(s, 24.0, { x: -15, z: -24 }, { shake: 0.25 });
  Mortar(s, 32.0, { x: -11.4, z: -18.6 }, { shake: 0.6 });
  // 换到乙位（沟口，朝东）：东头的鬼子沿丢掉的那段沟一段一段清过来（另一件事）
  s.Cam(39.8, 3.4, { from: { x: -8.6, z: -14.6, h: 0.95 }, to: { x: -2.0, z: -8.0, h: 1.05 }, look: { x: -6.0, z: -12.0, h: 0.9 }, lookTo: { x: 0.4, z: -4.0, h: 1.0 }, ease: "linear" });
  s.Cam(43.2, 2.8, { from: { x: -2.0, z: -8.0, h: 1.05 }, to: { x: B.x, z: B.z, h: 1.62 }, look: { x: 0.4, z: -4.0, h: 1.0 }, lookTo: { x: 14, z: -2.4, h: 1.4 } });
  s.Go("PitNra3", 40.0, 45.0, -9, -15, { move: "walk", path: [{ x: -3.5, z: -9 }, { x: -8, z: -14 }], depart: { stance: "crouch" }, stance: "stand", aim: true, yawDeg: 45 });
  s.Go("Luo", 43.0, 44.6, 4.6, -0.8, { move: "walk", yawDeg: -90 });
  s.Eye(46.0, 14, { stance: "stand", x: B.x, z: B.z, yaw: -90, pitch: 1, toYaw: -80 });
  s.Go("IjaTrench1", 45.0, 48.0, 13.8, -2.6, { move: "run", stance: "crouch", aim: true });
  s.Go("IjaTrench2", 46.0, 50.0, 18.6, -1.2, { move: "run" });
  s.Go("IjaTrench3", 47.0, 51.5, 24.0, 1.6, { move: "run" });
  for (const t of [48.6, 51.4, 54.2, 57.6]) Shot(s, t, "player");
  Shot(s, 49.2, "Luo"); Shot(s, 53.0, "Luo"); Shot(s, 50.0, "IjaTrench1"); Puff(s, 50.05, { x: 5.4, z: 0.9 });
  s.Go("IjaTrench1", 54.0, 55.0, 14.7, -2.4, { move: "walk", stance: "crouch" });
  Mortar(s, 46.0, { x: 9.0, z: -6.5 }, { shake: 0.3 });
  Mortar(s, 53.0, { x: 5.4, z: -2.6 }, { shake: 0.7 });
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
  s.Place("PitNra1", 0, -3.2, -9.4, { aim: true, yawDeg: 0 }); // 让开顺子的视线（布设里他在顺子右手 0.9 m）
  s.Place("Tank", 0, 175, -40, { visible: false });
  s.Eye(0, 5, { stance: "stand", look: { x: 0, z: -40 }, pitch: 1, toYaw: 20 }); // 站在射击台上才看得出胸墙
  Shot(s, 0.4, "Gunner", { count: 6, sfx: "mgBurstNear" }); Shot(s, 3.4, "Gunner", { count: 6, sfx: "mgBurstNear" });
  Shot(s, 1.6, "player"); Shot(s, 4.2, "player");
  // 一发掷弹筒弹落在捷克式旁边，机枪手腿上中弹
  const hit = Mortar(s, 0.8, { x: -1.8, z: -10.9 }, { shake: 0.6 });
  s.Key("Gunner", hit + 0.02, { clip: "ShotCollapse", clipHold: true, aim: false });
  s.Key("Gunner", hit + 1.4, { state: "down", clip: null });
  s.Eye(hit - 0.4, 1.0, { stance: "crouch", yaw: 20, pitch: 3, toLook: { x: -1.2, z: -9.2 }, toPitch: -6 });
  // 幺娃把他往后拖
  const pull = hit + 1.6;
  s.Key("Yaowa", pull, { clip: "PullComrade", faceTo: "Gunner" });
  s.Go("Yaowa", pull + 0.6, pull + 3.4, -1.6, -6.3, { move: "drag" });
  s.Go("Gunner", pull + 0.6, pull + 3.4, -1.0, -7.6, { move: "drag" });
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
  const crawl = gun + 2.6;
  s.Key("PitNra4", crawl - 0.2, { stance: "prone" });
  s.Go("PitNra4", crawl, crawl + 5.4, 0.6, -13.6, { move: "crawl" });
  s.Eye(crawl - 0.4, 1.4, { stance: "stand", yaw: -61, pitch: 1, toLook: { x: 0.4, z: -12 }, toPitch: -14 });
  Shot(s, crawl + 5.6, "IjaLmgWest", { count: 5, sfx: "mgBurstFar" });
  Puff(s, crawl + 5.9, { x: 0.9, z: -14.2 });
  s.Key("PitNra4", crawl + 6.0, { state: "down" });
  s.Caption(crawl + 6.6, 3.0, "（那捆手榴弹落在坑沿外）");
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
  s.Go("Luo", 3.2, 6.8, 0.67, 1.47, { move: "walk", faceTo: "player" });
  s.Eye(6.6, 1.0, { stance: "crouch", look: { x: -2, z: -0.2 }, pitch: 2, toLook: { x: 0.67, z: 1.47 }, toPitch: 4 });
  const go = s.Say("PitLeave.02", "Luo", 7.0);
  s.Key("Luo", s.End("PitLeave.02") + 0.3, { yawDeg: 4.5 });
  // 幺娃架着机枪手，其他人顺交通沟往下走
  const leave = go + 1.0;
  s.Key("Gunner", leave - 0.5, { state: "alive", stance: "stand", woundedWalk: true });
  s.Go("Gunner", leave, leave + 7.5, -0.31, 3.02, { move: "walk", woundedWalk: true, yawDeg: -177.4 });
  s.Go("Yaowa", leave, leave + 7.5, 0.59, 2.98, { move: "walk", stance: "stand", yawDeg: -177.4 });
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
  for (const id of ["IjaRush1", "IjaRush2", "IjaTrench1"]) s.Key(id, 0, { visible: false });
  // 坑丢了，往拐角 1 跑
  s.Cam(0, 3.6, { from: { x: 2.2, z: -5.2, h: 1.3 }, to: { x: 1.62, z: 12.16, h: 1.4 }, look: { actor: "Yaowa", offset: [0, 1.2, 0] }, ease: "linear" });
  s.Go("Gunner", 0, 9.0, 5.29, 15.41, { move: "walk", woundedWalk: true, path: [{ x: 0.5, z: 11 }] });
  s.Go("Yaowa", 0, 9.0, 5.86, 14.71, { move: "walk", path: [{ x: 1.3, z: 10.6 }] });
  s.Go("LiuWencai", 0, 6.0, 8.85, 18.19, { move: "walk", path: [{ x: 0.8, z: 11.6 }] });
  s.Go("Luo", 0, 4.0, 13.57, 21.63, { move: "run", path: [{ x: 1.0, z: 11.4 }], faceTo: "player" });
  // 回身顶：鬼子在坑里顺第一段沟往下打
  s.Eye(3.6, 1.0, { stance: "crouch", yaw: -160, pitch: 0, toYaw: 4.8, toPitch: 2 });
  s.Key("IjaTrench1", 4.0, { visible: true }); s.Key("IjaRush1", 4.6, { visible: true }); s.Key("IjaRush2", 5.0, { visible: true });
  s.Eye(4.6, 14, { stance: "crouch", yaw: 4.8, pitch: 2, toYaw: 0 });
  for (const t of [6.0, 8.6, 11.2, 14.4]) Shot(s, t, "player");
  Shot(s, 5.4, "IjaTrench1"); Puff(s, 5.45, { x: 2.4, z: 10.6 });
  Shot(s, 7.4, "IjaRush1"); Shot(s, 10.0, "IjaRush2"); Puff(s, 10.05, { x: 0.6, z: 9.8 });
  Shot(s, 13.0, "IjaTrench1"); Puff(s, 13.05, { x: 2.8, z: 11.4 });
  // 前头两个人走得慢，一直在顺子眼前；班长先到下一个拐角回身喊人
  s.Key("Luo", 6.0, { clip: "PointBlockade" });
  s.Caption(12.0, 3.0, "（班长在下个拐角回身招呼：走！）");
  s.Go("Gunner", 9.0, 18.0, 12.6, 22.4, { move: "walk", woundedWalk: true });
  s.Go("Yaowa", 9.0, 18.0, 13.2, 21.8, { move: "walk" });
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
  s.Go("Gunner", 0, 10.0, 14.34, 50.61, { move: "walk", woundedWalk: true });
  s.Go("Yaowa", 0, 10.0, 15.17, 50.26, { move: "walk" });
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
  s.Go("IjaTrench1", 8.4, 10.4, 12.74, 42.6, { move: "run", aim: false });
  s.Key("IjaTrench1", 10.2, { clip: "BayonetClearWood" });
  s.Shake(10.8, 0.3, 0.4);
  s.Cam(10.8, 0.5, { from: { x: 12.66, z: 45.02, h: 1.62 }, to: { x: 12.68, z: 44.0, h: 1.55 }, look: { actor: "IjaTrench1", offset: [0, 1.2, 0] }, ease: "linear" });
  s.Sfx(11.3, "stab", { x: 12.74, z: 42.6 });
  s.Key("IjaTrench1", 11.35, { clip: "ShotCollapse", clipHold: true });
  s.Key("IjaTrench1", 13.0, { state: "down", clip: null });
  s.Caption(10.4, 2.4, "（拼刺刀：格开、捅回去）");
  s.Eye(11.4, 2.4, { stance: "stand", x: 12.68, z: 44.0, look: { x: 12.74, z: 42.6 }, pitch: -20, toLook: { x: 12.4, z: 31 }, toPitch: 0 });
  Shot(s, 13.2, "player"); Shot(s, 13.6, "IjaTrench2"); Puff(s, 13.7, { x: 13.6, z: 44.6 });
  s.Go("IjaTrench2", 14.0, 15.0, 12.0, 30.4, { move: "walk", stance: "crouch" });
  // 跟班长退到拐角 2
  s.Cam(15.4, 4.6, { from: { x: 12.68, z: 44.0, h: 1.4 }, to: { x: 16.6, z: 53.4, h: 1.4 }, look: { actor: "Yaowa", offset: [0, 1.2, 0] }, ease: "linear" });
  s.Go("Gunner", 14.0, 22.0, 19.6, 60.2, { move: "walk", woundedWalk: true });
  s.Go("Yaowa", 14.0, 22.0, 20.4, 59.8, { move: "walk" });
  return s.Done({ durationS: 21.0 });
}

function S0403(ctx) {
  const s = new Seq(ctx, "04-3", "退到拐角 2：履带声");
  s.Place("Gunner", 0, 28.0, 80.6, { woundedWalk: true }); s.Place("Yaowa", 0, 28.8, 80.2);
  s.Place("Luo", 0, 31.6, 95.0); s.Place("LiuWencai", 0, 30.8, 88.0);
  s.Place("IjaTrench2", 0, 18.0, 56.0, { aim: false }); s.Place("IjaTrench3", 0, 16.6, 52.6);
  s.Place("Tank", 0, 86.4, 67.0); s.Place("TankInf1", 0, 90.0, 61.8); s.Place("TankInf2", 0, 95.0, 61.4); s.Place("TankInf3", 0, 95.6, 56.2);
  s.Cam(0, 4.4, { from: { x: 24.6, z: 72.4, h: 1.4 }, to: { x: 30.36, z: 86.95, h: 1.4 }, look: { actor: "Yaowa", offset: [0, 1.2, 0] }, ease: "linear" });
  s.Go("Gunner", 0, 8.0, 30.54, 91.99, { move: "walk", woundedWalk: true, path: [{ x: 29.6, z: 85.6 }] });
  s.Go("Yaowa", 0, 8.0, 31.43, 91.84, { move: "walk", path: [{ x: 30.4, z: 85.4 }] });
  s.Go("Luo", 0, 6.0, 35.26, 113.93, { move: "run", yawDeg: 9.5 });
  s.Go("LiuWencai", 0, 10.0, 34.6, 122, { move: "run" });
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
  s.Eye(19.0, 1.6, { stance: "crouch", yaw: -92.7, pitch: 4, toLook: { x: 35.26, z: 113.93 }, toPitch: 1 });
  s.Key("Luo", 19.0, { faceTo: "player", clip: "PointBlockade" });
  return s.Done({ durationS: 22.4 });
}

// ---------------------------------------------------------------------------
// 05 沟里伏击战车

function S0501(ctx) {
  const s = new Seq(ctx, "05-1", "路口：缩在沟底");
  s.Place("Tank", 0, 56.2, 95.0); s.Place("TankInf1", 0, 59.5, 89.7); s.Place("TankInf2", 0, 64.6, 89.3); s.Place("TankInf3", 0, 65.3, 84.2);
  s.Place("Gunner", 0, 33.4, 113.0, { woundedWalk: true, stance: "stand" }); s.Place("Yaowa", 0, 34.2, 112.8, { stance: "stand" });
  s.Place("Luo", 0, 35.6, 118.4, { faceTo: "player" });
  s.Cam(0, 3.2, { from: { x: 34.2, z: 112.0, h: 1.4 }, to: { x: 34.7, z: 117.8, h: 0.9 }, look: { actor: "Luo", offset: [0, 1.0, 0] }, ease: "linear" });
  s.Go("Gunner", 0, 5.0, 34.55, 124.5, { move: "walk", woundedWalk: true, stance: "crouch", yawDeg: -31.2 });
  s.Go("Yaowa", 0, 5.0, 35.45, 124.5, { move: "walk", stance: "crouch", yawDeg: -29.1 });
  // 班长带顺子缩在沟底
  s.Go("Luo", 2.0, 3.0, 35.9, 119.6, { move: "walk", stance: "crouch", yawDeg: -35.8 });
  s.Caption(3.0, 2.6, "（班长拽着顺子缩在沟底）");
  s.Eye(3.2, 3.0, { stance: "prone", yaw: -20, pitch: 6, toYaw: -41.5, toPitch: 18 });
  // 战车顺着路逼近，要从头顶这段沟上过
  s.Go("Tank", 2.0, 16.0, 45.91, 105.71, { move: "walk", yawDeg: 133.3 });
  for (const id of ["TankInf1", "TankInf2", "TankInf3"]) { const k = ctx.config.keyframes.find(k => k.id === "05-1").units.find(u => u.id === id); s.Go(id, 2.0, 16.0, k.x, k.z, { move: "walk" }); }
  for (const [t, v] of [[1.0, 0.6], [5.0, 0.75], [9.0, 0.9], [13.0, 1.0]]) s.Sfx(t, "tankTracks", { x: 50, z: 101, volume: v });
  s.Shake(10.0, 6.0, 0.12);
  // 回头看一眼：幺娃架着机枪手缩在后面几步
  s.Eye(8.0, 1.2, { stance: "prone", yaw: -41.5, pitch: 18, toYaw: 172, toPitch: 4 });
  s.Eye(11.6, 1.2, { stance: "prone", yaw: 172, pitch: 4, toYaw: -41.5, toPitch: 18 });
  return s.Done({ durationS: 16.4 });
}

function S0502(ctx) {
  const s = new Seq(ctx, "05-2", "战车从头顶碾过去");
  s.Place("Tank", 0, 45.91, 105.71, { yawDeg: 133.3 });
  s.Place("Luo", 0, 36.3, 120.9, { stance: "crouch", yawDeg: 14 }); // 让开顺子仰看的画面（布设里他在 1.2 m 外，枪横在前景）
  for (const [id, x, z] of [["TankInf1", 49.18, 100.43], ["TankInf2", 54.29, 100.01], ["TankInf3", 55, 94.94]]) s.Place(id, 0, x, z);
  s.Eye(0, 8, { stance: "prone", yaw: -30, pitch: 18, toYaw: -4.8, toPitch: 30 });
  for (const [t, v] of [[0.4, 1.0], [3.4, 1.0], [6.0, 1.2]]) s.Sfx(t, "tankTracks", { x: 40, z: 111, volume: v });
  s.Go("Tank", 0, 7.4, 35.4, 115.9, { move: "walk", yawDeg: 133.3 });
  s.Go("TankInf1", 0, 7.4, 39, 110.03, { move: "walk" });
  s.Go("TankInf2", 0, 7.4, 44.1, 109.62, { move: "walk" });
  s.Go("TankInf3", 0, 7.4, 44.82, 104.55, { move: "walk" });
  // 履带从头顶沟沿上碾过去，土往下掉
  s.Shake(5.4, 3.4, 0.7);
  s.Sfx(5.8, "dirtFall", { x: 34.8, z: 117 }); s.Sfx(7.6, "dirtFall", { x: 34.8, z: 117.6 });
  s.Ev(5.9, "smoke", { x: 34.8, z: 117.4, kind: "SmokeDust", dur: 4 });
  s.Ev(7.4, "smoke", { x: 35.0, z: 118.6, kind: "SmokeDust", dur: 3 });
  s.Key("Luo", 5.6, { stance: "prone" });
  s.Key("Luo", 9.4, { stance: "crouch" });
  s.Go("Tank", 7.4, 9.6, 34.8, 116.3, { move: "walk", yawDeg: 133.3 });
  s.Eye(8.0, 2.2, { stance: "prone", yaw: -4.8, pitch: 30, toYaw: 20, toPitch: 14 });
  return s.Done({ durationS: 10.6 });
}

function S0503(ctx) {
  const s = new Seq(ctx, "05-3", "甩手榴弹炸车尾");
  // 车刚过去：车尾在东北边那块铁板
  s.Place("Tank", 0, 35.6, 115.9, { yawDeg: 133.3 });
  s.Go("Tank", 0, 2.2, 35.0, 116.5, { move: "walk", yawDeg: 136 });
  const rear = { x: 36.6, z: 114.9 };
  s.Ev(0, "signal", { name: "TankDisabled", on: false });
  s.Cam(0, 1.6, { from: { x: 34.8, z: 119, h: 0.4 }, to: { x: 34.8, z: 119, h: 1.5 }, look: { x: 35.5, z: 116.5, h: 2.6 }, lookTo: { x: rear.x, z: rear.z, h: 1.6 } });
  s.Caption(1.6, 2.0, "（探身把那捆手榴弹甩到车屁股后头那块铁板上）");
  s.Shake(1.8, 0.3, 0.15);
  s.Eye(2.4, 1.2, { stance: "crouch", look: rear, pitch: 12, toPitch: 4 });
  const boom = 3.6;
  s.Sfx(boom, "grenadeBlast", rear); s.Ev(boom, "explosion", { x: rear.x, z: rear.z, kind: "grenade", radius: 5 });
  s.Shake(boom, 0.8, 0.8);
  s.Ev(boom + 0.1, "smoke", { x: rear.x, z: rear.z, kind: "SmokeBlack", dur: 20 });
  s.Ev(boom + 0.1, "signal", { name: "TankDisabled", on: true });
  // 战车瘫在路口，横着把路堵死，后面的鬼子一时跟不上来
  s.Key("TankInf1", boom + 0.6, { stance: "crouch" }); s.Key("TankInf2", boom + 0.4, { stance: "crouch" });
  Shot(s, boom + 2.0, "Luo"); Shot(s, boom + 3.6, "Luo");
  s.Eye(boom + 0.8, 2.6, { stance: "crouch", look: rear, pitch: 8, toLook: { x: 42, z: 108 }, toPitch: 5 });
  // 幺娃：顺儿哥，搭把手！
  const ask = s.Say("TankAmbush.01", "Yaowa", boom + 4.2);
  s.Key("Yaowa", ask - 0.3, { faceTo: "player" });
  s.Eye(ask - 0.6, 1.0, { stance: "crouch", look: { x: 42, z: 108 }, pitch: 5, toLook: { x: 35.45, z: 124.5 }, toPitch: -2 });
  s.Cam(s.End("TankAmbush.01") + 0.4, 2.4, { from: { x: 34.8, z: 119, h: 1.05 }, to: { x: 34.2, z: 123.6, h: 1.4 }, look: { actor: "Gunner", offset: [0, 0.9, 0] } });
  return s.Done({ durationS: s.End("TankAmbush.01") + 3.2 });
}

function S0504(ctx) {
  const s = new Seq(ctx, "05-4", "翻过坡顶回头：不撵了？");
  // 两个人架着机枪手翻过坡顶，最后一个回来
  s.Place("Gunner", 0, 34.55, 124.5, { stance: "stand", woundedWalk: true });
  s.Place("Yaowa", 0, 35.45, 124.5);
  s.Place("Luo", 0, 35.4, 140.0, { yawDeg: 0 }); s.Place("LiuWencai", 0, 34.2, 142.0, { yawDeg: 0 });
  for (const [id, x, z] of [["TankInf1", 40.45, 108.66], ["TankInf2", 44.83, 108.93], ["TankInf3", 44.82, 104.55], ["IjaTrench2", 32.4, 103.3]]) s.Place(id, 0, x, z, { stance: "stand", aim: false });
  s.Go("Gunner", 0, 11.0, 36.7, 146.4, { move: "walk", woundedWalk: true, path: [{ x: 35, z: 131 }], stance: "crouch", yawDeg: 171.7 });
  s.Go("Yaowa", 0, 11.0, 37.6, 145.8, { move: "walk", path: [{ x: 35.9, z: 131 }], yawDeg: 10 });
  s.Cam(0, 5.0, { from: { x: 33.8, z: 124.2, h: 1.5 }, to: { x: 34.2, z: 131.2, h: 1.6 }, look: { actor: "Gunner", offset: [0, 1.0, 1.6] }, ease: "linear" });
  s.Cam(5.0, 6.4, { from: { x: 34.2, z: 131.2, h: 1.6 }, to: { x: 35.8, z: 147, h: 1.62 }, look: { actor: "Gunner", offset: [0, 1.0, 1.6] }, ease: "linear" });
  s.Caption(0.4, 3.0, "（顺子和幺娃一边一个架着机枪手翻坡顶）");
  // 鬼子停在坡顶上架枪，没有追下来
  for (const [id, x, z, yaw] of [["TankInf1", 29, 128.5, -168.5], ["TankInf2", 38, 128, 174.3], ["TankInf3", 44, 129.5, 162.5], ["IjaTrench2", 23, 130, -156.8]]) {
    s.Go(id, 3.0, 13.0, x, z, { move: "run", stance: "prone", aim: true, yawDeg: yaw });
  }
  // 回头
  s.Eye(11.4, 1.4, { stance: "stand", x: 35.8, z: 147, yaw: 175, pitch: 0, toYaw: 2.9, toPitch: 9 });
  s.Eye(12.8, 4.0, { stance: "stand", x: 35.8, z: 147, yaw: 2.9, pitch: 9 });
  s.Go("Luo", 3.0, 11.0, 34.4, 149.6, { move: "walk", yawDeg: 0 });
  s.Go("LiuWencai", 6.0, 11.0, 33.2, 147.8, { move: "walk", yawDeg: -6.1 });
  const q = s.Say("TankAmbush.02", "LiuWencai", 15.4);
  s.Eye(q + 1.6, 1.2, { stance: "stand", x: 35.8, z: 147, yaw: 2.9, pitch: 9, toLook: { x: 34.4, z: 149.6 }, toPitch: 0 });
  s.Say("TankAmbush.03", "Luo");
  s.Key("Luo", s.End("TankAmbush.03") + 0.4, { yawDeg: 180 });
  s.Go("Luo", s.End("TankAmbush.03") + 0.8, s.End("TankAmbush.03") + 6.0, 35, 157, { move: "walk" });
  s.Go("LiuWencai", s.End("TankAmbush.03") + 1.2, s.End("TankAmbush.03") + 6.4, 33.8, 156, { move: "walk" });
  return s.Done({ durationS: s.End("TankAmbush.03") + 5.4, then: "stay" });
}

export const SEQUENCE_BUILDERS = Object.freeze([
  S0101, S0102, S0103, S0104, S0201, S0202, S0203, S0204, S0205, S0206, S0207, S02E1, S02E2,
  S0301, S0302, S0303, S0304, S0305, S0401, S0402, S0403, S0501, S0502, S0503, S0504,
]);

/** 生成整份预演文档（纯函数：只依赖传入的配置与台词清单）。 */
export function BuildPreviz({ config, voice }) {
  const ctx = { config, voice: VoiceIndex(voice) };
  const sequences = SEQUENCE_BUILDERS.map(build => build(ctx));
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
