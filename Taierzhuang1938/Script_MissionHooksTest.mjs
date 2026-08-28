// Script_MissionHooksTest.mjs —— 任务流程重制 · 集成批 INT1 的引擎钩子回归。
//
// **纯 Node，毫秒级。** 覆盖五件原语：
//   1. 关中过场 beat（`{type:"cutscene"}`）与 `story.Signal→过场` 的等价入口；
//   2. LEVEL_CUES 从七章 EVENTS 自动构建（三种字段名、三种判据字段、缺判据的均匀兜底）；
//   3. 具名同伴（默认名册推导、Locate、缺席/倒下/脱离跟随、预算上限）；
//   4. 脚本检查点（Save / Rewind：回到数秒前，不扣兵员池、不走死亡换人卡）；
//   5. 钉关原语（mechanics.pinFinalZone + story.Signal("ChapterRelease")）。
//
// 装配层那几条只能靠**扫源码**验：Script_Main 要起整个 three 才跑得动，而这几件事
// 恰恰是"有没有接线"而不是"接线对不对"—— 漏接的症状是静默的（换关照常发生、
// 台词照常从玩家脑门上发出来），只有把那几行读出来才看得见。
// 这一手法与 Script_FlareTest 数「裸读发现距离」那一段同源。

import assert from "node:assert/strict";
import fs from "node:fs";

import {
  StoryDirector, LEVEL_CUES, SIGNAL_CUTSCENES, CUE_BUILD_REPORT,
  ParsePredicate, BuildLevelCues, CHAPTER_RELEASE_SIGNAL, MID_CUTSCENE_SIGNAL,
} from "./Script_Story.mjs";
import { LEVELS, CHAPTERS, CUTSCENES, FindLevel } from "./Data_TengxianScript.mjs";
import {
  CompanionDirector, COMPANION_CAST, RosterFromBeats, MAX_COMPANIONS, IsCompanionCast,
  CHAPTER_PLAYER_CAST, DEFAULT_PLAYER_CAST,
} from "./Script_Companion.mjs";
import { CheckpointRecorder, CHECKPOINT_TUNING } from "./Script_Checkpoint.mjs";

const MainSource = fs.readFileSync(new URL("./Script_Main.mjs", import.meta.url), "utf8");
const AssemblySource = fs.readFileSync(new URL("./Data_TengxianScript.mjs", import.meta.url), "utf8");

const failures = [];
let checks = 0;
function Check(name, ok, detail = "") {
  checks += 1;
  if (ok) return;
  failures.push(`${name}${detail ? ` —— ${detail}` : ""}`);
}

/** 路标只在 CHAPTER 里（LEVELS 是史料层，打法字段不带过来 —— 见组装层的分层规则）。 */
const ZonesOf = (levelId) => (CHAPTERS.find((c) => c.id === levelId) || {}).zones || [];

const FakeHud = () => ({
  said: [], titles: [],
  Say(who, text, seconds, variant) { this.said.push({ who, text, seconds, variant }); },
  Title(text, sub) { this.titles.push({ text, sub }); },
  Hint() {},
});

// ===========================================================================
// 1) LEVEL_CUES 从七章 EVENTS 自动构建
// ===========================================================================

// 事件家底（任务书给的口径）：C1 6、C2 1、C3 7、C4 3、C5 14、C6 8。
// C0 是过场承载章，没有事件线 —— 这不是漏，是它整章都在过场里。
const EXPECT_EVENTS = {
  CH0_Chuchuan: 0, CH1_NanLu: 6, CH2_Shouliudan: 1, CH3_Jiuhusuo: 7,
  CH4_DongguanYe: 3, CH5_Chengqiang: 14, CH6_Zuihou: 8,
};
for (const level of LEVELS) {
  Check(`LEVEL_CUES 有 ${level.id} 这一条`, !!LEVEL_CUES[level.id]);
}
for (const [levelId, want] of Object.entries(EXPECT_EVENTS)) {
  // CH5 多出来的那一条是 cutsceneMid 挂的信号（ChapterMidCutscene），不算事件线。
  const names = Object.keys(LEVEL_CUES[levelId] || {}).filter((n) => n !== MID_CUTSCENE_SIGNAL);
  Check(`${levelId} 的事件条数是 ${want}`, names.length === want, `实际 ${names.length}：${names.join(",")}`);
}
// 三种名字字段（name / event / id）都认得出来
Check("C1 的 name 字段认得出来（EscortCall）", !!LEVEL_CUES.CH1_NanLu.EscortCall);
Check("C3 的 event 字段认得出来（ExecutionConfirmed）", !!LEVEL_CUES.CH3_Jiuhusuo.ExecutionConfirmed);
Check("C5 的 id 字段认得出来（TurnedBack）", !!LEVEL_CUES.CH5_Chengqiang.TurnedBack);
Check("C6 的 id 字段认得出来（WireSent）", !!LEVEL_CUES.CH6_Zuihou.WireSent);
// C2 没有 EVENTS 导出，判据由 Script_Story 的补丁表填（照 Data_MissionCh2 头注原文）
Check("C2 的 BayonetDone 由补丁表填上", !!LEVEL_CUES.CH2_Shouliudan.BayonetDone);
Check("C2 的补丁判据照的是章节头注那条",
  LEVEL_CUES.CH2_Shouliudan.BayonetDone({ objectiveIndex: 4, levelTime: 0, levelSeconds: 1080 }) === true
  && LEVEL_CUES.CH2_Shouliudan.BayonetDone({ objectiveIndex: 0, levelTime: 800, levelSeconds: 1080 }) === true
  && LEVEL_CUES.CH2_Shouliudan.BayonetDone({ objectiveIndex: 0, levelTime: 100, levelSeconds: 1080 }) === false);

// 章节写了判据的，一条都不许解析失败 —— 解析不动就悄悄退回均匀兜底，节奏全错而不报错。
const unparsed = CUE_BUILD_REPORT.filter((r) => r.kind === "unparsed");
Check("章节写下的判据全部解析得动", unparsed.length === 0,
  unparsed.map((r) => `${r.levelId}.${r.name}：${r.source}`).join(" / "));
const declared = CUE_BUILD_REPORT.filter((r) => r.kind === "declared").length;
Check("有判据的事件共 24 条（C1 6 + C3 7 + C4 3 + C6 8）", declared === 24, `实际 ${declared}`);
const spread = CUE_BUILD_REPORT.filter((r) => r.kind === "spread");
Check("没写判据的只有 C5 那 14 条", spread.length === 14 && spread.every((r) => r.levelId === "CH5_Chengqiang"),
  spread.map((r) => `${r.levelId}.${r.name}`).join(","));
// 均匀兜底：按登记顺序单调铺开，且都落在关内（不是 0 也不是 1）
let prevShare = 0;
for (const row of spread) {
  Check(`${row.name} 的兜底时刻在关内且递增`, row.share > prevShare && row.share < 1, `share=${row.share}`);
  prevShare = row.share;
}

// 判据解析器本身
Check("解析 >= 与 || ", (() => {
  const f = ParsePredicate("(c) => c.objectiveIndex >= 2 || c.levelTime > c.levelSeconds * 0.16");
  return f({ objectiveIndex: 2, levelTime: 0, levelSeconds: 600 }) === true
    && f({ objectiveIndex: 0, levelTime: 100, levelSeconds: 600 }) === true
    && f({ objectiveIndex: 0, levelTime: 90, levelSeconds: 600 }) === false;
})());
Check("解析 === 与字符串（双引号与单引号都认）", (() => {
  const a = ParsePredicate('(c) => c.zone === "C1_Ditch"');
  const b = ParsePredicate("(c) => c.zone === 'C6_PowerPlant' || c.objectiveIndex >= 5");
  return a({ zone: "C1_Ditch" }) === true && a({ zone: "X" }) === false
    && b({ zone: "C6_PowerPlant", objectiveIndex: 0 }) === true
    && b({ zone: "X", objectiveIndex: 5 }) === true
    && b({ zone: "X", objectiveIndex: 0 }) === false;
})());
Check("解析 && 与省略括号的箭头（C4 的 cue 写法）", (() => {
  const f = ParsePredicate('c => c.zone === "C4_NarrowLane" && c.levelTime > c.levelSeconds * 0.58');
  return f({ zone: "C4_NarrowLane", levelTime: 600, levelSeconds: 1000 }) === true
    && f({ zone: "C4_NarrowLane", levelTime: 500, levelSeconds: 1000 }) === false
    && f({ zone: "X", levelTime: 900, levelSeconds: 1000 }) === false;
})());
Check("看不懂的写法一律返回 null，不许瞎猜", ParsePredicate("(c) => Math.random() > 0.5") === null
  && ParsePredicate("(c) => c.nosuchfield > 1") === null
  && ParsePredicate("(c) => (c.a && c.b) || c.c") === null
  && ParsePredicate("") === null && ParsePredicate(null) === null);
Check("已经是函数就原样用（补丁表走这条）", ParsePredicate((c) => c.levelTime > 1)({ levelTime: 2 }) === true);
// 空表也要建得出来（新增一章时不该炸）
Check("空章节表不炸", BuildLevelCues([]).report.length === 0
  && BuildLevelCues([{ levelId: "X", events: [] }]).cues.X !== undefined);

// ===========================================================================
// 2) 关中过场：beat 原语 + Signal 等价入口
// ===========================================================================

// 注册表里的每一个 id 都得真的存在 —— 打错字的后果是"关卡中段什么都不播"。
for (const [levelId, table] of Object.entries(SIGNAL_CUTSCENES)) {
  for (const [name, id] of Object.entries(table)) {
    Check(`${levelId}.${name} 指的过场 ${id} 已注册`, !!CUTSCENES[id]);
  }
}
Check("C3 的两条 event 各自带一场关中过场",
  SIGNAL_CUTSCENES.CH3_Jiuhusuo.ExecutionConfirmed === "CS_Ch3_BreakWall"
  && SIGNAL_CUTSCENES.CH3_Jiuhusuo.LeafletBurned === "CS_Ch3_LeafletFire");
Check("C5 的 CHAPTER.cutsceneMid 被组装层接住了（不报错、挂在默认信号上）",
  SIGNAL_CUTSCENES.CH5_Chengqiang[MID_CUTSCENE_SIGNAL] === "CS_Ch5_TurnBack");
Check("cutsceneMid 挂的信号不给时刻兜底（转身必须由事实推）",
  LEVEL_CUES.CH5_Chengqiang[MID_CUTSCENE_SIGNAL]({ levelTime: 1e9, levelSeconds: 1, objectiveIndex: 99 }) === false);
Check("LEVELS 把 cutsceneMid 传下来了",
  FindLevel("CH5_Chengqiang").cutsceneMid === "CS_Ch5_TurnBack");
// 对象写法（INT2 要用它把转身挂到 TurnedBack 上）
Check("cutsceneMid 支持 { id, signal } 写法", (() => {
  const built = BuildLevelCues([{ levelId: "X", events: [],
    cutsceneMid: { id: "CS_Ch5_TurnBack", signal: "TurnedBack" } }]);
  return built.cutscenes.X.TurnedBack === "CS_Ch5_TurnBack";
})());

// 组装层的三道校验必须在源码里（数据错了要在开机就炸，不是玩到一半才发现）
Check("组装层校验 beats 里的 cutscene 类型", /beat\.type !== "cutscene"/.test(AssemblySource));
Check("组装层校验关中过场 id 已注册", /引用了没注册的过场/.test(AssemblySource)
  && /cutsceneMid/.test(AssemblySource));

// --- beat 派发 -------------------------------------------------------------
function MakeStory(levelId, beats) {
  const hud = FakeHud();
  const story = new StoryDirector({ hud });
  story.BeginLevel(levelId);
  story.queue = beats.map((b) => ({ ...b, level: levelId }));
  story.index = 0;
  story.sinceLast = 99;
  return { story, hud };
}
const CTX = { zone: null, objectiveIndex: 0, objectiveCount: 7, levelSeconds: 1200, pool: 40 };

// ① 没接线：记一笔，剧本照走（少一场过场不许把一关卡死）
{
  const { story } = MakeStory("CH5_Chengqiang", [
    { at: "delay:0.1", type: "cutscene", id: "CS_Ch5_TurnBack" },
    { at: "delay:0.1", type: "objective", text: "返回最后火力点" },
  ]);
  story.Update(0.5, CTX);
  story.Update(2.5, CTX);
  Check("没接线时关中过场只记一笔，不阻塞剧本", story.Remaining === 0
    && story.MidCutscenes.length === 1 && story.MidCutscenes[0].played === false
    && story.ObjectiveText === "返回最后火力点");
}
// ② 接了线：宿主播的期间剧本停摆，播完接着走
{
  const { story } = MakeStory("CH5_Chengqiang", [
    { at: "delay:0.1", type: "cutscene", id: "CS_Ch5_TurnBack" },
    { at: "delay:0.1", type: "objective", text: "返回最后火力点" },
  ]);
  const asked = [];
  let release = null;
  story.AttachCutscene((id) => { asked.push(id); return new Promise((r) => { release = r; }); });
  story.Update(0.5, CTX);
  Check("beat 派发到宿主", asked.length === 1 && asked[0] === "CS_Ch5_TurnBack");
  Check("宿主在播时剧本停摆", story.CutsceneHold === true);
  const timeBefore = story.levelTime;
  story.Update(30, CTX);
  Check("停摆期间关内时钟也不走（否则八秒过场里会攒下一堆到点的台词）",
    story.levelTime === timeBefore && story.ObjectiveText !== "返回最后火力点");
  release({ id: "CS_Ch5_TurnBack", skipped: false });
  await Promise.resolve();
  await Promise.resolve();
  Check("播完解除停摆", story.CutsceneHold === false);
  story.Update(2.5, CTX);
  Check("播完之后剧本接着走", story.ObjectiveText === "返回最后火力点");
}
// ③ Signal 等价入口 + 同一场只播一次
{
  const { story } = MakeStory("CH3_Jiuhusuo", [{ at: "delay:99", type: "objective", text: "x" }]);
  const asked = [];
  story.AttachCutscene((id) => { asked.push(id); return true; });
  story.Signal("ExecutionConfirmed");
  story.Signal("ExecutionConfirmed");
  story.Signal("LeafletBurned");
  Check("Signal 到登记过的事件就请求那一场", asked.join(",") === "CS_Ch3_BreakWall,CS_Ch3_LeafletFire",
    asked.join(","));
  Check("同一场只播一次", story.MidCutscenes.length === 2);
  Check("Signalled 报得出推过的事件", story.Signalled("ExecutionConfirmed") === true
    && story.Signalled("没推过的") === false);
  Check("宿主同步返回时不留停摆（测试桩不会把剧本挂死）", story.CutsceneHold === false);
}
// ④ 宿主说「没这场」时不挂死
{
  const { story } = MakeStory("CH5_Chengqiang", [
    { at: "delay:0.1", type: "cutscene", id: "CS_Ch5_TurnBack" },
    { at: "delay:0.1", type: "objective", text: "下一条" },
  ]);
  story.AttachCutscene(() => null);
  story.Update(0.5, CTX);
  Check("宿主回 null 时不进停摆", story.CutsceneHold === false);
  story.Update(2.5, CTX);
  Check("宿主回 null 时剧本照走", story.ObjectiveText === "下一条");
}
// ⑤ 宿主抛异常也不许把剧本带走
{
  const { story } = MakeStory("CH5_Chengqiang", [
    { at: "delay:0.1", type: "cutscene", id: "CS_Ch5_TurnBack" },
    { at: "delay:0.1", type: "objective", text: "下一条" },
  ]);
  story.AttachCutscene(() => { throw new Error("宿主炸了"); });
  story.Update(0.5, CTX);
  story.Update(2.5, CTX);
  Check("宿主抛异常时留痕并继续演", story.CutsceneHold === false
    && story.MidCutscenes[0].error === "宿主炸了" && story.ObjectiveText === "下一条");
}
// ⑥ 关中过场走的必须是与关首过场同一条 RunCutscene（Esc 跳过与字幕补卡才一致）
Check("装配层的关中过场复用 RunCutscene", /function PlayMidCutscene\(id\)[\s\S]{0,900}?return RunCutscene\(id\);/.test(MainSource));
Check("装配层把关中过场接进了 story", /story\.AttachCutscene\(/.test(MainSource));
Check("装配层导出了 PlayMidCutscene 宿主 API", /\n\s*PlayMidCutscene,/.test(MainSource));
Check("关中过场不许与换关/另一场叠着播",
  /if \(cutscene\.Playing \|\| state\.advancing\) return null;/.test(MainSource));

// --- FlushTail：只倒旁白的既有行为保留，但要留痕且不再无限吞对白 ------------
{
  const tail = [];
  for (let i = 0; i < 40; i += 1) tail.push({ at: "delay:99", type: "line", who: "luo", text: `第${i}句` });
  tail.push({ at: "end", type: "narration", text: "收场" });
  const { story } = MakeStory("CH1_NanLu", tail);
  const n = story.FlushTail();
  Check("FlushTail 不再为凑四条旁白把整条对白链吞光",
    story.flushLog.scanned <= 32 && story.Remaining > 0,
    `扫了 ${story.flushLog.scanned} 条，还剩 ${story.Remaining}`);
  Check("FlushTail 跳过的对白留痕", story.flushLog.dropped.length > 0);
  Check("FlushTail 这一次一条旁白都没倒出来（都被对白挡在前面）", n === 0);
}
{
  const { story } = MakeStory("CH1_NanLu", [
    { at: "delay:99", type: "objective", text: "目标" },
    { at: "end", type: "narration", text: "收场" },
  ]);
  const n = story.FlushTail();
  Check("FlushTail 照旧把 objective/narration 倒出来", n === 2
    && story.flushLog.played.length === 2 && story.ObjectiveText === "目标");
}
{
  const asked = [];
  const { story } = MakeStory("CH5_Chengqiang", [
    { at: "delay:99", type: "cutscene", id: "CS_Ch5_TurnBack" },
    { at: "end", type: "narration", text: "收场" },
  ]);
  story.AttachCutscene((id) => { asked.push(id); return true; });
  story.FlushTail();
  Check("FlushTail 不在关末补播关中过场（镜头这时候归关末过场）", asked.length === 0);
}

// ===========================================================================
// 3) 具名同伴
// ===========================================================================

Check("档案表覆盖契约 §10.2 的每一个 CAST id", [
  "shunzi", "luo", "yaowa", "heyoutian", "liuwencai", "xiaoqin", "zhaodegui",
  "paizhang", "junyi", "s124", "danjiayuan", "shangbing", "junguan", "canmou",
  "wangmingzhang", "ija_gunso",
].every((id) => COMPANION_CAST[id]));
Check("玩家自己、担架上的伤员、画外军官、日方一律不由这一层生成",
  ["shunzi", "shangbing", "junguan", "ija_gunso"].every((id) => !IsCompanionCast(id)));

// 默认名册：该章说过话的战斗员自动在场，按首次开口的顺序
const ch1Roster = RosterFromBeats(FindLevel("CH1_NanLu").beats);
Check("CH1 默认名册按首次开口顺序，罗班长在最前",
  ch1Roster[0] === "luo" && ch1Roster.includes("yaowa") && ch1Roster.includes("heyoutian"),
  ch1Roster.join(","));
Check("默认名册不收玩家/伤员/画外军官",
  !ch1Roster.includes("shunzi") && !ch1Roster.includes("shangbing") && !ch1Roster.includes("junguan"),
  ch1Roster.join(","));
Check("默认名册不超过上限", ch1Roster.length <= MAX_COMPANIONS);
for (const level of LEVELS) {
  const roster = RosterFromBeats(level.beats);
  Check(`${level.id} 的默认名册全部是可生成的战斗员`,
    roster.every((id) => IsCompanionCast(id) && COMPANION_CAST[id].combatant), roster.join(","));
}
// 序章是过场承载章，没有 line/shout beat —— 名册空是对的
Check("序章的默认名册是空的", RosterFromBeats(FindLevel("CH0_Chuchuan").beats).length === 0);
// 玩家自己不许进名册：终章玩家就是小秦（§7「玩家＝小秦」），而小秦在终章话最多 ——
// 不挡住的话场上会有两个小秦，一个是你、一个站你旁边。
Check("默认玩家角色是顺子", DEFAULT_PLAYER_CAST === "shunzi");
Check("终章玩家是小秦", CHAPTER_PLAYER_CAST.CH6_Zuihou === "xiaoqin");
{
  const { host } = MakeCompanionHost();
  const c6 = new CompanionDirector(host);
  c6.BeginLevel("CH6_Zuihou", { beats: FindLevel("CH6_Zuihou").beats, zones: ZonesOf("CH6_Zuihou") });
  Check("终章不会把玩家自己（小秦）也摆出来", !c6.Roster.includes("xiaoqin"), c6.Roster.join(","));
  const c4 = new CompanionDirector(host);
  c4.BeginLevel("CH4_DongguanYe", { beats: FindLevel("CH4_DongguanYe").beats, zones: ZonesOf("CH4_DongguanYe") });
  Check("四关的小秦照常在场（那一章玩家是顺子）", c4.Roster.includes("xiaoqin"), c4.Roster.join(","));
  const explicit = new CompanionDirector(host);
  explicit.BeginLevel("CH1_NanLu", { roster: ["luo", "shunzi", "yaowa"], zones: [] });
  Check("显式名册里混进玩家自己也会被挡掉", !explicit.Roster.includes("shunzi"), explicit.Roster.join(","));
}

// --- 生成 / 定位 / 三条剧本指令 -------------------------------------------
function MakeCompanionHost() {
  const state = { now: 0, player: { x: 0, y: 0, z: 0 }, yaw: 0, spawned: [], removed: [], killed: [], goals: [], holds: [], placed: [], budget: 99 };
  const host = {
    Time: () => state.now,
    PlayerPos: () => ({ ...state.player }),
    PlayerYaw: () => state.yaw,
    Spawn: (spec) => {
      if (state.spawned.filter((s) => s.alive).length >= state.budget) return null;
      const soldier = { ...spec, alive: true, x: spec.x, y: 0, z: spec.z };
      state.spawned.push(soldier);
      return soldier;
    },
    Despawn: (s) => { state.removed.push(s.castId); s.alive = false; },
    PositionOf: (s) => ({ x: s.x, y: s.y, z: s.z }),
    Alive: (s) => s.alive,
    Place: (s, x, z) => { s.x = x; s.z = z; state.placed.push(s.castId); },
    SetGoal: (s, x, z) => { state.goals.push({ castId: s.castId, x, z }); s.goalX = x; s.goalZ = z; },
    SetHold: (s, zone) => { state.holds.push({ castId: s.castId, zone }); s.hold = zone; },
    Fell: (s) => { state.killed.push(s.castId); s.alive = false; },
  };
  return { host, state };
}
{
  const { host, state } = MakeCompanionHost();
  const companion = new CompanionDirector(host);
  const zones = ZonesOf("CH1_NanLu");
  const placed = companion.BeginLevel("CH1_NanLu", { beats: FindLevel("CH1_NanLu").beats, zones });
  Check("按默认名册摆出人来", placed === ch1Roster.length && placed > 0, `placed=${placed}`);
  Check("在场的人 Locate 得到世界坐标", companion.Present.every((id) => {
    const at = companion.Locate(id);
    return at && Number.isFinite(at.x) && Number.isFinite(at.z);
  }));
  // 定位要给到**嘴的高度**：宿主给的是脚下坐标，直接拿去空间化会听成「趴在地上说话」
  Check("Locate 抬到嘴的高度", companion.Present.every((id) => companion.Locate(id).y > 1.4));
  Check("不在这一章的人 Locate 返回 null（退化成非空间化播放，不是错误）",
    companion.Locate("wangmingzhang") === null && companion.Locate("没有这个人") === null);
  // 生成点不许叠在一处（叠了就是一坨人从同一个点长出来）
  const spots = state.spawned.map((s) => `${s.x.toFixed(2)},${s.z.toFixed(2)}`);
  Check("生成点各不相同", new Set(spots).size === spots.length, spots.join(" | "));
  // 跟随：分频写 goal，且每人一条横向车道（不排成一串）
  state.now = 10;
  state.player = { x: 100, y: 0, z: 100 };
  companion.Update(0.1);
  const lanes = state.goals.map((g) => `${g.x.toFixed(2)},${g.z.toFixed(2)}`);
  Check("跟随目标每人一条车道，不排成一串", new Set(lanes).size === lanes.length, lanes.join(" | "));
  Check("跟随目标在玩家身后而不是脚下",
    state.goals.every((g) => Math.hypot(g.x - 100, g.z - 100) > 3));
  const before = state.goals.length;
  companion.Update(0.1);
  Check("跟随目标按 regoalS 分频，不是每帧都写（每帧写等于每帧打断寻路）",
    state.goals.length === before);
  // 临时脱离跟随
  state.now = 20;
  companion.Detach("yaowa", 5);
  companion.Update(0.1);
  Check("脱离跟随期间不再给他写目标",
    !state.goals.slice(before).some((g) => g.castId === "yaowa"));
  state.now = 40;
  companion.Attach("yaowa");
  const mark = state.goals.length;
  companion.Update(0.1);
  Check("Attach 之后重新跟上", state.goals.slice(mark).some((g) => g.castId === "yaowa"));
  // 玩家下的命令优先于跟随：轮盘按了「上刺刀冲锋」之后，这一层不许再把 goal
  // 拽回玩家身后 —— 否则命令按了等于没按（PlayTest 12.8 就是这么红的）。
  state.busy = new Set(["luo", "yaowa"]);
  host.Busy = (s) => state.busy.has(s.castId);
  state.now = 60;
  const busyMark = state.goals.length;
  companion.Update(0.1);
  Check("受了命令的人跟随让开", !state.goals.slice(busyMark).some((g) => state.busy.has(g.castId))
    && state.goals.slice(busyMark).length > 0,
    state.goals.slice(busyMark).map((g) => g.castId).join(","));
  state.busy.clear();
  host.Busy = null;
  // 倒下：走现有倒地，不是把人删掉；倒下的人仍然定位得到（救人那一段要靠它）
  Check("Fell 走的是宿主的倒地回调", companion.Fell("heyoutian") === true
    && state.killed.includes("heyoutian") && !state.removed.includes("heyoutian"));
  Check("倒下的人仍在名册里且 Locate 得到", companion.Roster.includes("heyoutian")
    && companion.Locate("heyoutian") !== null && companion.Has("heyoutian") === false);
  const afterFell = state.goals.length;
  state.now = 60;
  companion.Update(0.1);
  Check("倒下的人不再跟随", !state.goals.slice(afterFell).some((g) => g.castId === "heyoutian"));
  // 缺席：跨关保留（罗班长四关牺牲，五关起不该又站起来）
  companion.SetAbsent("luo");
  Check("宣告缺席时当场撤走（撤走 ≠ 阵亡）", state.removed.includes("luo")
    && !state.killed.includes("luo") && !companion.Present.includes("luo"));
  companion.BeginLevel("CH5_Chengqiang", { beats: FindLevel("CH5_Chengqiang").beats, zones: ZonesOf("CH5_Chengqiang") });
  Check("缺席跨关保留", !companion.Roster.includes("luo") && companion.Absent.includes("luo"));
  companion.ClearAbsent();
  companion.BeginLevel("CH1_NanLu", { beats: FindLevel("CH1_NanLu").beats, zones });
  Check("ClearAbsent 之后他又能在场（选章跳回他还活着的那一章）",
    companion.Roster.includes("luo"));
}
// hold 模式：钉在最近的路标里
{
  const { host, state } = MakeCompanionHost();
  const companion = new CompanionDirector(host);
  const zones = ZonesOf("CH5_Chengqiang");
  companion.BeginLevel("CH5_Chengqiang", { roster: ["paizhang", "yaowa"], zones });
  const holds = Object.fromEntries(state.holds.map((h) => [h.castId, h.zone]));
  Check("hold 档的人钉在路标里", !!holds.paizhang && zones.some((z) => z.id === holds.paizhang.id));
  Check("follow 档的人不钉", holds.yaowa === null);
  const goalsBefore = state.goals.length;
  state.now = 10; state.player = { x: 300, y: 0, z: 300 };
  companion.Update(0.1);
  Check("hold 档的人不跟着玩家跑", !state.goals.slice(goalsBefore).some((g) => g.castId === "paizhang"));
}
// 预算：上限与「宿主造不出来就少一个」都要成立
{
  const { host, state } = MakeCompanionHost();
  state.budget = 2;
  const companion = new CompanionDirector(host);
  const placed = companion.BeginLevel("CH1_NanLu", { beats: FindLevel("CH1_NanLu").beats, zones: [] });
  Check("宿主人口预算满了就少摆几个，不报错", placed === 2 && companion.Present.length === 2);
  Check("没摆上的留痕", companion.log.some((row) => row.ok === false && /人口预算/.test(row.why)));
}
{
  const { host } = MakeCompanionHost();
  const companion = new CompanionDirector(host);
  const many = ["luo", "yaowa", "heyoutian", "liuwencai", "zhaodegui", "xiaoqin", "paizhang", "s124"];
  const placed = companion.BeginLevel("CH1_NanLu", { roster: many, zones: [] });
  Check("同时在场的具名同伴不超过 MAX_COMPANIONS", placed === MAX_COMPANIONS, `placed=${placed}`);
}
// 装配层接线
Check("装配层把「这一章玩家演谁」传给了 Companion",
  /playerCast: phase\.playerCast \|\| phase\.level\?\.playerCast \|\| undefined,/.test(MainSource));
Check("装配层把 Companion 接进了 story 的 locate 参数",
  /locate: \(who\) => \(companion \? companion\.Locate\(who\) : null\)/.test(MainSource));
Check("同伴排在撒兵之前（这样兵力预算是自动扣的，不是额外加人）", (() => {
  const a = MainSource.indexOf("companion.BeginLevel(phase.id");
  const b = MainSource.indexOf("else if (!PREVIEW && !cutsceneOnly) SeedSoldiers(phase);");
  return a > 0 && b > 0 && a < b;
})());
Check("同伴每帧排在 ai.Update 之前（goal 要在这一帧的 Think 之前写进去）", (() => {
  const a = MainSource.indexOf("companion?.Update(dt);");
  const b = MainSource.indexOf("ai.Update(dt, camera);", a);
  return a > 0 && b > 0 && a < b;
})());
Check("换关时把同伴收干净", /companion\?\.Reset\("levelChange"\)/.test(MainSource));
Check("装配层把「玩家下过命令 / 占着战位」报成 Busy（跟随让开）",
  /Busy: \(soldier\) => [\s\S]{0,260}?soldier\.order === "charge"/.test(MainSource)
  && /emplacementId/.test(MainSource));

// ===========================================================================
// 4) 脚本检查点
// ===========================================================================
{
  const world = { now: 0, x: 0, z: 0, health: 100, ammo: 5, applied: [] };
  const recorder = new CheckpointRecorder({
    Time: () => world.now,
    Sample: () => ({ x: world.x, y: 0, z: world.z, yaw: 0, pitch: 0, stance: "stand",
      health: world.health, ammo: world.ammo, clips: 3, grenades: 6, bundles: 0 }),
    Apply: (sample) => {
      world.applied.push(sample);
      world.x = sample.x; world.z = sample.z;
      world.health = sample.health; world.ammo = sample.ammo;
      return true;
    },
  });
  // 走十秒，每 0.1 s 推一帧，位置随时间线性前进
  for (let i = 0; i < 100; i += 1) {
    world.now = i * 0.1;
    world.x = i * 1.0;
    recorder.Update();
  }
  Check("按 sampleS 分频采样，不是每帧都存",
    recorder.Count > 5 && recorder.Count <= Math.ceil(CHECKPOINT_TUNING.windowS / CHECKPOINT_TUNING.sampleS) + 2,
    `count=${recorder.Count}`);
  Check("窗口外的采样会被丢掉",
    recorder.samples.every((s) => s.t >= world.now - CHECKPOINT_TUNING.windowS - 1e-9));
  // 挨了脚本安排的一下：血扣光、位置在 x=99
  world.health = 1;
  world.ammo = 0;
  const back = recorder.Rewind(4);
  Check("倒带回到大约四秒前", back && Math.abs((world.now - back.t) - 4) <= CHECKPOINT_TUNING.sampleS,
    back ? `倒回 ${(world.now - back.t).toFixed(2)} s` : "没倒成");
  Check("位置回到数秒前", Math.abs(world.x - 59) < 6, `x=${world.x}`);
  Check("血与弹一起还回去（不是残血重来）", world.health === 100 && world.ammo === 5);
  Check("倒带留痕", recorder.RewindCount === 1 && recorder.rewinds[0].ok === true);
  Check("倒回去之后更晚的采样作废（那是另一条时间线上的）",
    recorder.samples.every((s) => s.t <= back.t));
  // Save 打的点也在同一个环里
  world.now += 1;
  world.x = 500;
  Check("Save 明确打一个点", recorder.Save() === true && recorder.Latest.mark === true
    && recorder.Latest.x === 500);
  // 环是空的时候不许炸
  const empty = new CheckpointRecorder({ Time: () => 0, Sample: () => null, Apply: () => true });
  Check("采不到样、环是空的时候 Rewind 返回 null 而不是抛",
    empty.Update() === false && empty.Rewind(3) === null);
}
// 「不扣兵员池、不走死亡换人卡」：装配层的还原回调里不许出现那两条
{
  const applyStart = MainSource.indexOf("Apply: (sample) => {");
  const applyEnd = MainSource.indexOf("// 剧情语音接线", applyStart);
  const applySource = applyStart > 0 && applyEnd > applyStart ? MainSource.slice(applyStart, applyEnd) : "";
  Check("检查点还原不动兵员池", applySource.length > 0 && !/nraPool/.test(applySource));
  Check("检查点还原不走死亡换人卡", applySource.length > 0
    && !/OnPlayerDown|RespawnPlayer|pendingRespawn/.test(applySource));
  Check("检查点还原真的把人放回去了", /player\.Spawn\(sample\.x, sample\.z, sample\.yaw\)/.test(applySource));
}
Check("检查点每帧排在死亡判定之后（否则倒带会退回到刚好要死那一刻）", (() => {
  const a = MainSource.indexOf("if (state.playerAliveLast && !player.Alive) OnPlayerDown();");
  const b = MainSource.indexOf("checkpoint?.Update();");
  return a > 0 && b > 0 && a < b;
})());
Check("换关时检查点环清空（上一关的坐标倒到这一关就是穿墙）",
  /checkpoint\?\.Reset\("levelChange"\)/.test(MainSource));

// ===========================================================================
// 5) 钉关原语
// ===========================================================================

Check("放行信号名是 ChapterRelease", CHAPTER_RELEASE_SIGNAL === "ChapterRelease");
{
  const { story } = MakeStory("CH5_Chengqiang", [{ at: "delay:99", type: "objective", text: "x" }]);
  Check("没推过就是没发生", story.Signalled(CHAPTER_RELEASE_SIGNAL) === false);
  story.Signal(CHAPTER_RELEASE_SIGNAL);
  Check("推过之后 Signalled 认得出来", story.Signalled(CHAPTER_RELEASE_SIGNAL) === true);
  story.BeginLevel("CH5_Chengqiang");
  Check("换关后重新开始（不许带着上一次的放行跨关）",
    story.Signalled(CHAPTER_RELEASE_SIGNAL) === false);
}
Check("装配层按 mechanics.pinFinalZone 起钉",
  /state\.pinFinalZone = !!\(phase\.mechanics && phase\.mechanics\.pinFinalZone\);/.test(MainSource));
Check("钉住时不换关", /const levelOver = !state\.pinned && !chapterPinned/.test(MainSource));
Check("放行靠 story.Signalled(CHAPTER_RELEASE_SIGNAL)",
  /story\.Signalled\(CHAPTER_RELEASE_SIGNAL\)/.test(MainSource));
Check("有保险丝：信号一直不来也不许把一关永远打不完",
  /PIN_RELEASE_GRACE_S/.test(MainSource) && /钉关保险丝/.test(MainSource));
Check("钉关状态有取证口", /ChapterPin: \(\) => \(\{/.test(MainSource));
// INT2 之前七章都还没声明这条旗标 —— 声明之后这一条会变成「至少有一章声明了」。
const pinned = LEVELS.filter((l) => l.mechanics && l.mechanics.pinFinalZone).map((l) => l.id);
Check("钉关旗标的名字是 mechanics.pinFinalZone（INT2 按这个名字往章节数据里写）",
  pinned.length === 0 || pinned.includes("CH5_Chengqiang"), `已声明：${pinned.join(",") || "（无，等 INT2）"}`);

// ===========================================================================

if (failures.length) {
  console.log(`任务流程钩子回归：${checks - failures.length}/${checks} 通过，${failures.length} 条红：`);
  for (const line of failures) console.log("  ✗ " + line);
  process.exit(1);
}
console.log(`任务流程钩子回归全过（${checks} 条）：`
  + "关中过场 beat / Signal→过场、LEVEL_CUES 七章自动构建、具名同伴 Locate 与三条剧本指令、"
  + "脚本检查点倒带、钉关原语。");
assert.ok(true);
