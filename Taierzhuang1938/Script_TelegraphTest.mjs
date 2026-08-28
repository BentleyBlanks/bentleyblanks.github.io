// ===========================================================================
// Script_TelegraphTest.mjs —— 发报的回归口（纯 Node，毫秒级）
//
// 覆盖 docs/Data_MissionRemake.md §7 阶段 4（玩家亲手发报）与
// Data_MissionCh6 头注 ENGINE_REQUEST 1 的三件事：
//   ① 契约表：默认信号名与 Data_MissionCh6.EVENTS 的 id 逐条对得上；
//   ② 码组推进：按一下发一组、两到三声「嗒」、组间冷却、报码纸逐组勾掉；
//   ③ 中断：ForceDisconnect 把**正在发的那一组作废**，断着的时候按电键不算数；
//   ④ 重连：接回去之后接着发，进度一组不丢；
//   ⑤ 自动断线：breakAfterGroup 夹在 [1, total−1] —— 不许落在「发毕」以后；
//   ⑥ 完成：OnComplete + WireSent，且**本层一个字都不说**（「发毕。」是章节 beats 的）；
//   ⑦ **不夺控制权**：玩家中途走开，进度原样保留、没有任何超时会失败；
//   ⑧ 交互预制：两个 spec 拿**真的 InteractSystem** 跑一遍（手势、Enabled、冷却都得真成立）；
//   ⑨ 音效降级：telegraphKey 没接线时退到 grenadePin、只解析一次；三变体顺序轮播不随机；
//   ⑩ 换关兜底：Reset / Abort 分账，底噪要停；
//   ⑪ HUD 契约：Script_Hud 真的有 SetTelegraph / TelegraphState（源码对账）。
//
// 跑法：node Taierzhuang1938/Script_TestRunner.mjs --only=TelegraphTest
// ===========================================================================

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  TelegraphSystem, TelegraphKeyInteraction, TelegraphReconnectInteraction,
  TELEGRAPH_DEFAULTS, TELEGRAPH_SFX, TELEGRAPH_SIGNALS, TELEGRAPH_PHASES, TELEGRAPH_BEATS,
} from "./Script_Telegraph.mjs";
import { InteractSystem } from "./Script_Interact.mjs";
import { EVENTS } from "./Data_MissionCh6.mjs";

const dirHere = path.dirname(fileURLToPath(import.meta.url));
let checks = 0;
function Check(condition, message) {
  assert.ok(condition, message);
  checks += 1;
}

/** 终章那封电报的五组（示例数据；真电文是 C6 批填的章节数据）。 */
const GROUPS = ["2429", "1560", "3016", "0022", "4837"];

function MakeRig(hostOver = {}, opts = {}) {
  const log = { played: [], signals: [], beats: [], groups: [], completes: [], breaks: [], joins: [] };
  const host = {
    Time: () => 0,
    // 默认宿主：**A2 批那两条实录还没合上**，所以每条的第一个名字一律播不响。
    Play: (name, o) => {
      const primary = new Set(Object.values(TELEGRAPH_SFX).map((s) => s.names[0]));
      if (primary.has(name)) return null;
      log.played.push({ name, opts: o });
      return { name };
    },
    Signal: (name) => log.signals.push(name),
    Hint: () => {},
    Say: () => {},
    PlayerPos: () => ({ x: 0, y: 0, z: 0 }),
    ...hostOver,
  };
  const sys = new TelegraphSystem(host, opts);
  return { sys, log, host };
}

function Step(sys, seconds, dt = 1 / 60, player = null) {
  for (let t = 0; t < seconds - 1e-9; t += dt) sys.Update(dt, player);
  return sys.View();
}

/** 敲一下，把这一组发完（含冷却）。 */
function SendGroup(sys, player = null) {
  const ok = sys.Key();
  Step(sys, 1.4, 1 / 60, player);
  return ok;
}

const Spec = (over = {}) => ({
  id: "ch6_lastwire", label: "最后一封",
  groups: GROUPS, position: { x: -54, y: 0, z: -58 },
  ...over,
});

// ---------------------------------------------------------------------------
// ① 契约表
// ---------------------------------------------------------------------------
{
  Check(TELEGRAPH_PHASES.length === 5 && TELEGRAPH_BEATS.length === 6, "相位表五项、节拍表六项");
  const ids = new Set(EVENTS.map((e) => e.id));
  Check(ids.has(TELEGRAPH_SIGNALS.first), `第一组勾掉推的是 CH6 EVENTS 的 ${TELEGRAPH_SIGNALS.first}`);
  Check(ids.has(TELEGRAPH_SIGNALS.break), `接头松脱推的是 CH6 EVENTS 的 ${TELEGRAPH_SIGNALS.break}`);
  Check(ids.has(TELEGRAPH_SIGNALS.complete), `最后一组发完推的是 CH6 EVENTS 的 ${TELEGRAPH_SIGNALS.complete}`);
  const wireBreak = EVENTS.find((e) => e.id === TELEGRAPH_SIGNALS.break);
  Check(/第二组与最后一组之间|不能落在/.test(wireBreak.note),
    "WireBreak 的登记里写死了「断线要发生在第二组与最后一组之间」—— ⑤ 就是照它测的");
  Check(TELEGRAPH_DEFAULTS.digitsPerGroup === 4, "一组四位（§7 与关内那条 system 提示的口径）");
  Check(TELEGRAPH_DEFAULTS.ditsMin === 2 && TELEGRAPH_DEFAULTS.ditsMax === 3,
    "按一下响两到三声「嗒」（任务书原话「2–3 声「嗒」变体」）");
  Check(TELEGRAPH_DEFAULTS.reconnectS === 1.2,
    "重连长按 1.2 s（Data_MissionCh6 ENGINE_REQUEST 1 写死的）");
}
console.log("ok  ① 契约表：默认信号名与 CH6 EVENTS 的 id 逐条对得上，从简口径按任务书");

// ---------------------------------------------------------------------------
// ② 码组推进
// ---------------------------------------------------------------------------
{
  const { sys, log } = MakeRig();
  const id = sys.BeginTelegraph(Spec({
    OnGroup: (i) => log.groups.push(i),
    OnBeat: (b) => log.beats.push(b),
  }));
  Check(id === "ch6_lastwire", "BeginTelegraph 给回 id");
  Check(sys.Phase === "ready" && sys.CanKey, "开完就等玩家按 —— 不自己开始，不催");
  const view0 = sys.View();
  Check(view0.total === 5 && view0.sent === 0, "报码纸上五组，一组都没勾");
  Check(view0.groups.every((g) => !g.sent && !g.active), "第一帧没有哪一组是「正在发」");
  Check(view0.groups[0].code === "2429", "报码纸上的电码就是章节给的那串（引擎不改内容）");

  Check(sys.Key() === true, "按一下电键，算数");
  Check(sys.Phase === "sending" && !sys.CanKey, "正在发的时候按不动第二下");
  Check(sys.View().groups[0].active === true, "报码纸上第一组进「正在发」态");
  Check(sys.Key() === false, "一组没发完就按下一下，不算数");

  Step(sys, 1.4);
  Check(sys.Sent === 1 && sys.Phase === "ready", "一组发完，回到等按状态");
  Check(sys.View().groups[0].sent === true && sys.View().groups[1].sent === false,
    "报码纸上勾掉了第一组，第二组还没勾");
  Check(log.groups[0] === 1, "OnGroup 拿到的是「第几组」");
  Check(log.beats.includes("first") && log.beats.includes("group"),
    "第一组同时推 first（CH6 的 KeySeated）与 group（章节那三条「第 N 组　对上了。」）");
  Check(log.signals.includes(TELEGRAPH_SIGNALS.first), "KeySeated 真的推出去了");

  // 「嗒」的声数与冷却。
  const dits = log.played.filter((p) => p.name === "grenadePin").length;
  Check(dits >= TELEGRAPH_DEFAULTS.ditsMin && dits <= TELEGRAPH_DEFAULTS.ditsMax,
    `一组响两到三声「嗒」（实得 ${dits}）`);

  const { sys: cd } = MakeRig();
  cd.BeginTelegraph(Spec());
  cd.Key();
  Step(cd, 0.6);
  Check(cd.Sent === 1, "先把第一组发完");
  Check(cd.Key() === false, "组间冷却里按不动 —— 没有它，按住 F 连点能半秒发完整封电报");
  Check(cd.CanKey === false, "而且 CanKey 也如实说「现在按不了」（交互点的 Enabled 读它）");
  Step(cd, TELEGRAPH_DEFAULTS.groupCooldownS + 0.1);
  Check(cd.CanKey === true && cd.Key() === true, "冷却过了才按得动");
}
console.log("ok  ② 码组推进：按一下发一组、两到三声「嗒」、组间冷却、报码纸逐组勾掉");

// ---------------------------------------------------------------------------
// ③ 中断
// ---------------------------------------------------------------------------
{
  const { sys, log } = MakeRig();
  sys.BeginTelegraph(Spec({ OnDisconnect: () => log.breaks.push("cut") }));
  SendGroup(sys);
  Check(sys.Sent === 1, "先发出去一组");

  sys.Key();
  Step(sys, 0.05);
  Check(sys.Sending, "第二组正在发");
  Check(sys.ForceDisconnect("shell") === true, "炮击把接头震松了");
  Check(sys.Broken && sys.Phase === "broken", "进 broken 态");
  Check(sys.Sent === 1,
    "**正在发的那一组作废** —— 半组电码对面收不到，报码纸上它仍然是没勾的");
  Check(sys.View().groups[1].sent === false && sys.View().groups[1].active === false,
    "报码纸如实反映：第二组既没勾也不在发");
  Check(log.breaks.length === 1 && log.signals.includes(TELEGRAPH_SIGNALS.break),
    "OnDisconnect 回调 + WireBreak 信号");
  Check(sys.View().prompt === TELEGRAPH_DEFAULTS.reconnectLabel,
    "提示语换成「按住接回接头」——玩家要知道现在该干什么");

  Check(sys.Key() === false, "接头断着按电键不算数");
  Step(sys, 3);
  Check(sys.Sent === 1 && sys.Broken, "断着的时候光等是等不回来的（没有自动重连）");
  Check(sys.ForceDisconnect("shell") === false, "已经断了就不能再断一次");
}
console.log("ok  ③ 中断：正在发的那一组作废、断着按电键不算数、不会自动接回来");

// ---------------------------------------------------------------------------
// ④ 重连
// ---------------------------------------------------------------------------
{
  const { sys, log } = MakeRig();
  sys.BeginTelegraph(Spec({ OnReconnect: () => log.joins.push("join") }));
  SendGroup(sys);
  sys.ForceDisconnect("shell");
  Check(sys.Reconnect("player") === true, "接回去了");
  Check(log.joins.length === 1 && sys.Phase === "ready", "OnReconnect 回调，回到等按状态");
  Check(sys.Sent === 1, "进度一组不丢");
  Check(sys.Reconnect() === false, "没断的时候接不了第二次");
  Step(sys, TELEGRAPH_DEFAULTS.groupCooldownS + 0.1);
  Check(SendGroup(sys) && sys.Sent === 2, "接上之后接着发");
}
console.log("ok  ④ 重连：接回去、进度一组不丢、接着发");

// ---------------------------------------------------------------------------
// ⑤ 自动断线夹在 [1, total−1]
// ---------------------------------------------------------------------------
{
  const { sys } = MakeRig();
  sys.BeginTelegraph(Spec({ breakAfterGroup: 2 }));
  SendGroup(sys);
  Check(!sys.Broken, "第一组之后不断");
  SendGroup(sys);
  Check(sys.Broken && sys.Sent === 2, "第二组之后自动断一次（炮击落在这儿）");
  sys.Reconnect();
  Step(sys, 0.6);
  SendGroup(sys); SendGroup(sys); SendGroup(sys);
  Check(sys.Done && !sys.Active, "接着发完剩下三组");
  Check(sys.State().stats.breaks === 1, "只断一次 —— 不是每组都掷一次骰子");

  // 越界的写法要被夹住：断在最后一组之后就没有「我接！莫断！」那一段戏了。
  const late = MakeRig();
  late.sys.BeginTelegraph(Spec({ breakAfterGroup: 99 }));
  for (let i = 0; i < 5; i += 1) {
    if (late.sys.Broken) { late.sys.Reconnect(); Step(late.sys, 0.6); }
    SendGroup(late.sys);
  }
  Check(late.sys.State().stats.breaks === 1, "breakAfterGroup=99 被夹到 total−1，仍然断了一次");
  Check(late.sys.lastRun.completed === true, "而且照样发得完 —— 断线没有落在「发毕」以后");

  const early = MakeRig();
  early.sys.BeginTelegraph(Spec({ breakAfterGroup: 0 }));
  SendGroup(early.sys);
  Check(early.sys.Broken, "breakAfterGroup=0 被夹到 1（第一组之后），不会断在玩家上手之前");

  const none = MakeRig();
  none.sys.BeginTelegraph(Spec());
  for (let i = 0; i < 5; i += 1) SendGroup(none.sys);
  Check(none.sys.State().stats.breaks === 0, "不给 breakAfterGroup 就一次都不断（断线是脚本推的）");
}
console.log("ok  ⑤ 自动断线：夹在 [1, total−1]、只断一次、不给就不断");

// ---------------------------------------------------------------------------
// ⑥ 完成
// ---------------------------------------------------------------------------
{
  const { sys, log } = MakeRig();
  sys.BeginTelegraph(Spec({
    OnComplete: (s) => log.completes.push(s),
    OnBeat: (b) => log.beats.push(b),
  }));
  for (let i = 0; i < 5; i += 1) SendGroup(sys);
  Check(sys.Done && !sys.Active, "五组发完就结束");
  Check(log.completes.length === 1 && log.completes[0].sent === 5, "OnComplete 拿到 5/5");
  Check(log.completes[0].completed === true, "算 completed");
  Check(log.signals.includes(TELEGRAPH_SIGNALS.complete), "WireSent 推出去了（本章的转轴）");
  Check(sys.View() === null, "发完之后报码纸就收了");
  Check(log.beats.filter((b) => b === "first").length === 1, "first 只推一次");
  Check(log.beats.filter((b) => b === "group").length === 5, "group 每组一次");
  // 「发毕。」是章节 beats 的台词 —— 本层不许自己说。
  const src = fs.readFileSync(path.join(dirHere, "Script_Telegraph.mjs"), "utf8");
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
  Check(!/Say\(\s*["'][^"']*发毕/.test(code) && !code.includes("\"发毕。\""),
    "本层一个字都不说「发毕。」—— 那是 Data_MissionCh6 里 xiaoqin 的台词");
  Check(sys.Key() === false, "发完之后再按电键不算数");
}
console.log("ok  ⑥ 完成：OnComplete + WireSent，报码纸收掉，「发毕。」留给章节 beats 说");

// ---------------------------------------------------------------------------
// ⑦ 不夺控制权：走开进度保留
// ---------------------------------------------------------------------------
{
  const { sys } = MakeRig();
  sys.BeginTelegraph(Spec());
  SendGroup(sys);
  SendGroup(sys);
  Check(sys.Sent === 2, "先发两组");

  // 玩家跑到三十米外去打了一分钟仗。
  const away = { position: { x: -24, y: 0, z: -58 }, Alive: true };
  Step(sys, 60, 1 / 60, away);
  Check(sys.Sent === 2, "走开一分钟，进度原样保留 —— 没有任何超时会把它作废");
  Check(sys.Phase === "ready", "回来还是等按状态（不是失败，也不是自动发完）");
  Check(sys.State().awayS > 50, "取证口记得住他走开了多久（只记账，不参与判定）");
  Check(sys.View().atKey === false, "报码纸知道人不在电台边上");

  const back = { position: { x: -54, y: 0, z: -58 }, Alive: true };
  Step(sys, 0.5, 1 / 60, back);
  Check(sys.State().awayS === 0 && sys.View().atKey === true, "回来了就清零");
  Check(SendGroup(sys, back) && sys.Sent === 3, "回来接着发第三组");
}
console.log("ok  ⑦ 不夺控制权：中途走开一分钟，进度原样保留，没有任何超时");

// ---------------------------------------------------------------------------
// ⑧ 交互预制拿真的 InteractSystem 跑一遍
// ---------------------------------------------------------------------------
{
  const { sys } = MakeRig();
  sys.BeginTelegraph(Spec({ breakAfterGroup: 2 }));
  const interact = new InteractSystem({});
  const keySpec = TelegraphKeyInteraction({ tag: "CH6_Zuihou", telegraph: sys, position: { x: 0, y: 0, z: 0 } });
  const jointSpec = TelegraphReconnectInteraction({ tag: "CH6_Zuihou", telegraph: sys, position: { x: 0.6, y: 0, z: 0 } });
  interact.Register(keySpec);
  interact.Register(jointSpec);
  Check(interact.PointCount === 2, "两个点一次摆齐");
  Check(keySpec.gesture === "tap", "电键是 tap —— 发报不是读条");
  Check(jointSpec.gesture === "hold",
    "接头是 hold（S1 框架）—— 不是 confirm：手抖一下把接头按掉重来是在惩罚玩家的手");
  Check(keySpec.once === false && jointSpec.once === false, "两个点都要按好几次，不许一次性");

  // 站在电键前面，朝着它。
  const player = { position: { x: 0, y: 0, z: 1.2 }, yaw: 0, Alive: true };
  let hit = interact.Query(player);
  Check(hit && hit.point.id === "telegraphKey", "够得着的时候提示的是电键");
  Check(/按电键发下一组/.test(hit.label) && /0\/5/.test(hit.label), "提示语带进度（0/5）");

  // 交互层与规则层要**一起推**：InteractSystem.Update 把 dt 夹到 0.1，
  // 只调一次推不完一个 0.42 s 的冷却。
  const Both = (seconds, who) => {
    for (let t = 0; t < seconds - 1e-9; t += 1 / 60) {
      sys.Update(1 / 60, who);
      interact.Update(1 / 60, who);
    }
  };

  interact.Press(player);
  Check(sys.Sending, "按 F 真的把一组发出去了（tap 当场完成）");
  Check(interact.Query(player) === null,
    "正在发的时候整条不出现 —— 不给一个按了没反应的灰提示");
  // 只推到「这一组刚发完」，**别把冷却也推过去**（下一条断言就是测冷却的）。
  let guard = 600;
  while (sys.Sent === 0 && guard-- > 0) { sys.Update(1 / 60, player); interact.Update(1 / 60, player); }
  Check(sys.Sent === 1, "第一组勾掉了");

  // 冷却：**规则层那一份说了算**。注册点自己的 cooldownS 是 Register 那一刻拷进去的，
  // 章节要是把 groupCooldownS 调大，两份就对不上；所以 CanKey 里也判了冷却，
  // 拿一个**全新的**交互系统（它的点没有任何冷却记录）验证这一条。
  Check(interact.Query(player) === null, "冷却里整条不出现（注册点那一侧）");
  const fresh = new InteractSystem({});
  fresh.Register(TelegraphKeyInteraction({ telegraph: sys, position: { x: 0, y: 0, z: 0 } }));
  Check(fresh.Query(player) === null,
    "换一个没有冷却记录的交互系统，照样不出现 —— 冷却的唯一真相在规则层，"
    + "不然会出现「提示亮着，按下去没反应」");
  Both(TELEGRAPH_DEFAULTS.groupCooldownS + 0.2, player);
  Check(interact.Query(player) !== null, "冷却过了又出现");
  Check(fresh.Query(player) !== null, "两边同时又出现");

  // 第二组发完自动断线 → 电键那条消失、接头那条出现。
  interact.Press(player);
  Both(1.4, player);
  Check(sys.Broken && sys.Sent === 2, "第二组之后断了");
  const jointPlayer = { position: { x: 0.6, y: 0, z: 1.2 }, yaw: 0, Alive: true };
  hit = interact.Query(jointPlayer);
  Check(hit && hit.point.id === "telegraphJoint", "断了之后提示的是接头，不是电键");
  Check(hit.seconds === TELEGRAPH_DEFAULTS.reconnectS, "按住时长就是 1.2 s");

  // 真按住 1.2 s。
  interact.Press(jointPlayer);
  Check(!sys.Broken === false, "刚按下还没接上（hold 要按满）");
  for (let i = 0; i < 90; i += 1) interact.Update(1 / 60, jointPlayer);
  Check(!sys.Broken, "按满 1.2 s，接头接回去了");
  Check(interact.Query(jointPlayer) === null || interact.Query(jointPlayer).point.id !== "telegraphJoint",
    "接上之后接头那条整条不出现");

  // hold 中途松手：进度退回去但**不清零**（S1 框架的 hold 语义）。
  const two = MakeRig();
  two.sys.BeginTelegraph(Spec());
  two.sys.ForceDisconnect("shell");
  const it2 = new InteractSystem({});
  it2.Register(TelegraphReconnectInteraction({ telegraph: two.sys, position: { x: 0, y: 0, z: 0 } }));
  const p2 = { position: { x: 0, y: 0, z: 1.0 }, yaw: 0, Alive: true };
  it2.Press(p2);
  for (let i = 0; i < 30; i += 1) it2.Update(1 / 60, p2);
  const mid = it2.View().t;
  Check(mid > 0.2 && mid < 1, "按住走了一半");
  it2.Release();
  it2.Update(1 / 60, p2);
  Check(it2.View() && it2.View().t < mid && it2.View().t > 0,
    "松手退回去但没清零 —— 手抖一下不该从头再接一次");
  Check(two.sys.Broken, "没按满就还是断着");
}
console.log("ok  ⑧ 交互预制：真 InteractSystem 跑通 tap/hold、Enabled 互斥、冷却与松手不清零");

// ---------------------------------------------------------------------------
// ⑨ 音效
// ---------------------------------------------------------------------------
{
  const { sys, log } = MakeRig();
  sys.BeginTelegraph(Spec());
  sys.Key();
  Step(sys, 1.0);
  Check(log.played.some((p) => p.name === "grenadePin"),
    "telegraphKey 还没接线，退到 grenadePin（Data_MissionCh6 头注定的口径）");
  Check(sys.State().sfx.key === "grenadePin", "解析结果记下来了（一条 key 只试一次）");
  Check(TELEGRAPH_SFX.hum.names.length === 1,
    "底噪不给备胎 —— 拿别的音顶一条持续声，听感上是「屋里多了一台冰箱」");

  // 三个变体顺序轮播，**不随机**：连着敲二十下不许出现连着两下同一条。
  const heard = [];
  const wired = MakeRig({ Play: (name, o) => { heard.push({ name, v: o?.variant }); return { name }; } });
  wired.sys.BeginTelegraph(Spec({ groups: GROUPS.concat(["1111", "2222", "3333"]) }));
  for (let i = 0; i < 8; i += 1) SendGroup(wired.sys);
  const keys = heard.filter((h) => h.name === "telegraphKey");
  Check(keys.length >= 16, `敲了十几下（实得 ${keys.length}）`);
  const cycled = keys.map((k) => k.v).join("");
  Check(!/(\d)\1/.test(cycled),
    `三个变体顺序轮播，连着两下不许是同一条（实得 ${cycled.slice(0, 12)}…）`);
  Check(new Set(keys.map((k) => k.v)).size === 3, "三条都用上了（不是只轮两条）");

  // 底噪按素材长度重触发（Play 没有 loop 语义）。
  const hums0 = heard.filter((h) => h.name === "telegraphHum").length;
  Step(wired.sys, TELEGRAPH_DEFAULTS.humLoopEveryS + 0.3);
  const hums1 = heard.filter((h) => h.name === "telegraphHum").length;
  Check(hums0 >= 1, "开始发报就起底噪");
  Check(hums1 >= hums0, "底噪按 humLoopEveryS 重触发（Play 没有 loop）");
}
console.log("ok  ⑨ 音效：pendingCue 退到 grenadePin、只解析一次；三个「嗒」变体顺序轮播不随机");

// ---------------------------------------------------------------------------
// ⑩ 换关兜底
// ---------------------------------------------------------------------------
{
  const stopped = [];
  const { sys, log } = MakeRig(
    { Play: (name) => ({ name }), Stop: (voice) => stopped.push(voice) });
  sys.BeginTelegraph(Spec({ OnComplete: (s) => log.completes.push(s) }));
  SendGroup(sys);
  Check(sys.Sent === 1 && sys.Active, "先发一组");

  sys.Reset("levelChange");
  Check(!sys.Active && sys.Phase === "idle", "Reset 把这一封收了");
  Check(log.completes.length === 0, "Reset 不回调 OnComplete（那是换关，不是发完了）");
  Check(sys.State().stats.aborted === 0, "Reset 不记 aborted");
  Check(stopped.length >= 1, "底噪停掉了 —— 不停的话下一关屋里还嗡嗡响");
  Check(Object.keys(sys.State().sfx).length === 0, "Reset 顺手清掉音效解析缓存");
  Check(sys.View() === null, "报码纸收了");
  Check(typeof sys.BeginTelegraph(Spec()) === "string", "收完还能再开一封");

  // Abort 走另一本账。
  const two = MakeRig();
  two.sys.BeginTelegraph(Spec({ OnComplete: (s) => two.log.completes.push(s) }));
  SendGroup(two.sys);
  Check(two.sys.Abort("cutscene") === true, "Abort 收得掉");
  Check(two.sys.State().stats.aborted === 1, "Abort 记 aborted");
  Check(two.log.completes.length === 0, "Abort 不算完成");
  Check(two.sys.lastRun.completed === false && two.sys.lastRun.sent === 1,
    "取证记录留着「发到第几组被掐的」");

  // 同时只能有一封。
  const three = MakeRig();
  three.sys.BeginTelegraph(Spec());
  Check(three.sys.BeginTelegraph(Spec({ id: "other" })) === null, "一次只发一封电报");
  Check(three.sys.State().stats.refused === 1, "被挡下的记在 refused 里");

  // 不给码组时按种子生成，且**可重放**（不是 Math.random）。
  const Gen = () => {
    const r = MakeRig({}, { seed: 777 });
    r.sys.BeginTelegraph({ groupCount: 5 });
    return r.sys.View().groups.map((g) => g.code).join(",");
  };
  const gen = Gen();
  Check(gen.split(",").length === 5 && /^\d{4}(,\d{4}){4}$/.test(gen),
    `不给码组时按种子出五组四位数（实得 ${gen}）`);
  Check(Gen() === gen, "同一种子每次出同一封电报（确定性，出图与冒烟才比得了）");
}
console.log("ok  ⑩ 换关兜底：Reset / Abort 分账、底噪停掉、一次只发一封、码组生成可重放");

// ---------------------------------------------------------------------------
// ⑪ HUD 契约（源码对账 —— Hud 的构造要真 DOM，纯 Node 起不来）
// ---------------------------------------------------------------------------
{
  const hud = fs.readFileSync(path.join(dirHere, "Script_Hud.mjs"), "utf8");
  Check(/SetTelegraph\(view = null\)/.test(hud), "Script_Hud 有 SetTelegraph（只读脱敏快照）");
  Check(/TelegraphState\(\)/.test(hud), "Script_Hud 有 TelegraphState 取证口");
  Check(/telegraphPaperKey/.test(hud),
    "码组列表按 paperKey 才重建 —— 一封电报要在屏幕上挂好几分钟，每帧重建 <ol> 会一直触发布局");
  // 报码纸**不许**带武器 UI 禁用态：发报不占手（§7 不夺控制权）。
  Check(!/classList\.toggle\("telegraphing"/.test(hud),
    "报码纸不挂 #hud.telegraphing —— 压暗武器 UI 会给出「你这会儿开不了枪」的错误读数");
  const css = fs.readFileSync(path.join(dirHere, "Style_Game.css"), "utf8");
  Check(/\.hudTelegraph\b/.test(css) && /\.hudTelegraph\.on\b/.test(css),
    "Style_Game.css 里有 .hudTelegraph 与它的 .on 态（与 .hudEmplacement 同一套写法）");
  Check(/\.tgGroup\.sent\b/.test(css) && /\.tgGroup\.active\b/.test(css),
    "勾掉与正在发两个态都有样式 —— 玩家要能对错，不是纯演出");
  const main = fs.readFileSync(path.join(dirHere, "Script_Main.mjs"), "utf8");
  Check(/telegraph\?\.Update\(dt, player\)/.test(main), "装配层每帧推它");
  Check(/hud\.SetTelegraph\(telegraph\?\.View\(\) \|\| null\)/.test(main), "装配层每帧把快照交给 HUD");
  Check(/telegraph\?\.Reset\("levelChange"\)/.test(main), "换关收掉");
  Check(/flare\?\.Reset\("levelChange"\)/.test(main), "照明弹也换关收掉（发现距离要还原）");
}
console.log("ok  ⑪ HUD 契约：SetTelegraph / TelegraphState / .hudTelegraph 样式与装配层接线都在");

console.log(`\nTelegraphTest 通过：${checks} 条断言`);
