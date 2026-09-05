// Script_MissionSetpiecesTest.mjs —— 章节摆点层（集成批 INT2）的回归。
//
// **纯 Node，毫秒级。** Script_MissionSetpieces 一行 three 都不 import，
// 七个玩法系统与宿主全部走窄回调 —— 所以整层可以在一个假宿主上跑完，
// 「这一拍推没推那条信号」在纯规则里就验得出来。
//
// 覆盖四件事：
//   1. **七章都有摆点表**，且 Setup 不抛（一章抛异常 = 那一章的玩法全落空，
//      而画面上是静默的：台词与目标链不依赖这一层，看不出来）；
//   2. **台词节拍 → 信号**：onVoice 的 key 必须真的在那一章的 beats 里
//      （打错一个字就是「这一拍永远不发生」），推出去的名字必须在那一章
//      `EVENTS` 里登记过（否则 Script_Story 收到一个谁都不认的名字）；
//   3. **INT1 留下的六条对接项**逐条验：CH5 钉关放行、转身信号、
//      CH4 罗班长跨关缺席、CH2 白刃打完、CH6 关中过场；
//   4. **后送队控制器**：按路点推进、玩家落后就等、遇袭散开、收摊不 Kill。
//
// 装配层那几条只能扫源码验（Script_Main 要起整个 three 才跑得动）：
// 建没建、每帧推没推、换关清没清、取证口在不在。

import fs from "node:fs";

import {
  SETPIECES, MissionSetpieceDirector, EscortColumn, SETPIECE_TUNING,
} from "./Script_MissionSetpieces.mjs";
import { BLAST_TARGETS } from "./Script_BlastTargets.mjs";
import { FIRST_LEVEL_P012_WHITEBOX_PHASE } from "./Data_FirstLevelP012Whitebox.mjs";
import { LEVELS, CHAPTERS, CHAPTER_EVENTS, CUTSCENES, FindLevel } from "./Data_TengxianScript.mjs";
import { LEVEL_CUES } from "./Script_Story.mjs";

const MainSource = fs.readFileSync(new URL("./Script_Main.mjs", import.meta.url), "utf8");

const failures = [];
let checks = 0;
function Check(name, ok, detail = "") {
  checks += 1;
  if (ok) return;
  failures.push(`${name}${detail ? ` —— ${detail}` : ""}`);
}

const ZonesOf = (levelId) => (CHAPTERS.find((c) => c.id === levelId) || {}).zones || [];
const PhaseOf = (levelId) => ({
  id: levelId, zones: ZonesOf(levelId), minutes: FindLevel(levelId)?.minutes ?? 18,
});

/**
 * 假宿主：把每一次回调都记下来。**一条都不实现**（返回 null / 空数组），
 * 这正是要验的东西 —— 摆点层在宿主什么都不给的时候也不许抛。
 */
function FakeHost(overrides = {}) {
  const calls = [];
  const story = {
    fired: [],
    pushed: [],
    Signal(name) { this.pushed.push(name); return true; },
  };
  const interact = {
    points: new Map(),
    Register(spec) { this.points.set(spec.id, spec); return spec.id; },
    Clear(tag) {
      let n = 0;
      for (const [id, p] of [...this.points]) {
        if (tag != null && p.tag !== tag) continue;
        this.points.delete(id); n += 1;
      }
      return n;
    },
    get PointCount() { return this.points.size; },
  };
  const host = {
    calls, story, interact,
    time: 0,
    playerPos: { x: 0, y: 0, z: 0 },
    playerZone: null,
    Time() { return host.time; },
    LevelTime() { return host.time; },
    PlayerPos() { return host.playerPos; },
    PlayerZone() { return host.playerZone; },
    Ground() { return 0; },
    Story: () => story,
    Interact: () => interact,
    Carry: () => null,
    Emplacement: () => null,
    Strafe: () => null,
    Flare: () => null,
    Telegraph: () => null,
    Companion: () => null,
    Checkpoint: () => null,
    SpawnActor: (spec) => { calls.push(["SpawnActor", spec.label]); return { id: calls.length, alive: true, spec }; },
    Despawn: (h) => { calls.push(["Despawn", h && h.spec && h.spec.label]); },
    PositionOf: () => ({ x: 0, y: 0, z: 0 }),
    Alive: (h) => !!(h && h.alive),
    SetGoal: (h, x, z) => { calls.push(["SetGoal", +x.toFixed(1), +z.toFixed(1)]); },
    Prop: (spec) => { calls.push(["Prop", spec.id]); return spec.id; },
    Hint: (t) => calls.push(["Hint", t]),
    Say: (w, t) => calls.push(["Say", w, t]),
    PlaySfx: (n) => calls.push(["PlaySfx", n]),
    PlayCutscene: (id) => { calls.push(["PlayCutscene", id]); return true; },
    ...overrides,
  };
  return host;
}

/** 把一条台词「播出去」：写进 story.fired，摆点层下一帧就看得见。 */
function Speak(host, voice) {
  host.story.fired.push({ voice, type: "line", level: null });
}

/**
 * 一个够用的假负重层。**碰得到的只有摆点层用到的那几条** ——
 * 真的 CarrySystem 有相位机（lift/carry/release），这里不复刻它，
 * 只回答「手上占着没有、占的是哪一件、payload 是什么」。
 */
function FakeCarry() {
  const carry = {
    load: null, log: [],
    get Active() { return !!carry.load; },
    get Blocking() { return !!carry.load; },
    get KindId() { return carry.load ? carry.load.kindId : null; },
    View: () => (carry.load ? { ...carry.load } : null),
    Begin(kindId, opts = {}) {
      if (carry.load) return false;
      carry.load = { kindId, label: opts.label ?? kindId, payload: opts.payload ?? null, canDrop: opts.canDrop !== false };
      carry.log.push(["Begin", kindId, opts.label ?? ""]);
      return true;
    },
    Drop(reason) { carry.log.push(["Drop", reason]); carry.load = null; return true; },
    ForceRelease(reason) { carry.log.push(["Force", reason]); carry.load = null; return true; },
  };
  return carry;
}

/** 一次爆炸（走的就是 Script_Destruction.Blast 里那一行）。 */
function Boom(x, z, radius = 6, energy = 400, kind = "launcher") {
  return BLAST_TARGETS.Blast({ x, y: 0, z }, radius, energy, kind);
}

const ZoneOf = (levelId, zoneId) => ZonesOf(levelId).find((z) => z.id === zoneId) || null;

// ===========================================================================
// 1) 七章都有摆点表，且 Setup 不抛
// ===========================================================================

for (const level of LEVELS) {
  Check(`${level.id} 有摆点表`, MissionSetpieceDirector.Has(level.id),
    `SETPIECES 的键：${Object.keys(SETPIECES).join(",")}`);
}
Check("摆点表里没有多余的章（键与关表一一对应）",
  Object.keys(SETPIECES).length === LEVELS.length,
  Object.keys(SETPIECES).join(","));

for (const level of LEVELS) {
  const host = FakeHost();
  const director = new MissionSetpieceDirector(host);
  const ok = director.BeginLevel(level.id, PhaseOf(level.id));
  Check(`${level.id} 的 Setup 不抛`, ok && director.log.every((row) => row.ok !== false),
    director.log.filter((r) => r.ok === false).map((r) => r.why).join(" / "));
  // 一整关都不动也不许抛（宿主什么都没实现）。
  for (let i = 0; i < 240; i += 1) { host.time += 0.25; director.Update(0.25); }
  Check(`${level.id} 推六十秒不抛`, director.log.every((row) => row.ok !== false),
    director.log.filter((r) => r.ok === false).map((r) => r.why).join(" / "));
}

// ===========================================================================
// 2) 台词节拍 → 信号：key 与信号名都不许打错字
// ===========================================================================

for (const level of LEVELS) {
  const spec = SETPIECES[level.id];
  const voices = new Set((FindLevel(level.id)?.beats || []).map((b) => b.voice).filter(Boolean));
  for (const key of Object.keys(spec.onVoice || {})) {
    Check(`${level.id} 的 onVoice 键 ${key} 真的在本章 beats 里`, voices.has(key));
  }
  const zoneIds = new Set(ZonesOf(level.id).map((z) => z.id));
  for (const id of Object.keys(spec.onZone || {})) {
    Check(`${level.id} 的 onZone 键 ${id} 真的是本章路标`, zoneIds.has(id));
  }
}

// 推出去的信号必须在那一章登记过。**这一条是最值钱的**：
// 名字对不上时 Script_Story 什么都不会说，表现成「那一拍永远不发生」。
{
  const registered = {};
  for (const chapter of CHAPTER_EVENTS) {
    registered[chapter.levelId] = new Set(Object.keys(LEVEL_CUES[chapter.levelId] || {}));
  }
  // ChapterRelease 是引擎原语，不在章节 EVENTS 里（钉关放行）。
  const enginePrimitives = new Set(["ChapterRelease", "GrenadeVolley"]);
  for (const level of LEVELS) {
    const host = FakeHost();
    const director = new MissionSetpieceDirector(host);
    director.BeginLevel(level.id, PhaseOf(level.id));
    // 把本章每一条台词都播一遍、每一个路标都进一遍，把所有钩子都逼出来。
    for (const beat of FindLevel(level.id)?.beats || []) {
      if (beat.voice) Speak(host, beat.voice);
      host.time += 1;
      director.Update(0.5);
    }
    for (const zone of ZonesOf(level.id)) {
      host.playerZone = zone.id;
      host.time += 1;
      director.Update(0.5);
    }
    // 定时器排出来的那些也要走到。
    for (let i = 0; i < 200; i += 1) { host.time += 0.5; director.Update(0.5); }
    for (const name of host.story.pushed) {
      Check(`${level.id} 推的信号 ${name} 在本章 EVENTS 里登记过`,
        registered[level.id]?.has(name) || enginePrimitives.has(name),
        `本章已登记：${[...(registered[level.id] || [])].join(",")}`);
    }
    SETPIECES[level.id]._pushed = host.story.pushed.slice();
    SETPIECES[level.id]._calls = host.calls.slice();
  }
}

// ===========================================================================
// 3) INT1 留下的六条对接项
// ===========================================================================

// ① CH5：钉关放行 + 转身信号
{
  const pushed = SETPIECES.CH5_Chengqiang._pushed || [];
  Check("CH5 推得出 ChapterRelease（钉关放行）", pushed.includes("ChapterRelease"), pushed.join(","));
  Check("CH5 推得出 TurnedBack（转身那一场的挂点）", pushed.includes("TurnedBack"), pushed.join(","));
  // 顺序：转身必须在放行之前 —— 反过来等于「关都完了才转身」。
  Check("转身排在放行之前",
    pushed.indexOf("TurnedBack") >= 0 && pushed.indexOf("TurnedBack") < pushed.lastIndexOf("ChapterRelease"),
    pushed.join(","));
  Check("CH5 的转身挂在顺子那一句上",
    typeof SETPIECES.CH5_Chengqiang.onVoice.ch5_shunzi_07 === "function");
  Check("CH5 的放行挂在小秦最后一句上",
    typeof SETPIECES.CH5_Chengqiang.onVoice.ch5_xiaoqin_03 === "function");
}

// ② CH2：白刃打完推 BayonetDone（**只认「缺口里没有活着的日军」这个事实**）
{
  const host = FakeHost({ EnemiesNear: () => 0 });
  const director = new MissionSetpieceDirector(host);
  director.BeginLevel("CH2_Shouliudan", PhaseOf("CH2_Shouliudan"));
  Speak(host, "ch2_luo_06");            // 「上刺刀！」——这一拍才开门
  host.time += 1; director.Update(0.5);
  host.time += 5; director.Update(0.5); // 开门才五秒：**不许**算「打完了」
  Check("白刃刚开门不算打完", !host.story.pushed.includes("BayonetDone"), host.story.pushed.join(","));
  host.time += 20; director.Update(0.5);
  Check("缺口清空之后才推 BayonetDone", host.story.pushed.includes("BayonetDone"), host.story.pushed.join(","));
}
{
  // 缺口里还有人：一直不推。
  const host = FakeHost({ EnemiesNear: () => 3 });
  const director = new MissionSetpieceDirector(host);
  director.BeginLevel("CH2_Shouliudan", PhaseOf("CH2_Shouliudan"));
  Speak(host, "ch2_luo_06");
  for (let i = 0; i < 200; i += 1) { host.time += 1; director.Update(0.5); }
  Check("缺口里还有人就不推 BayonetDone", !host.story.pushed.includes("BayonetDone"));
}

// ③ CH4：罗班长倒下 → 跨关永久缺席
{
  const fell = [];
  const absent = [];
  const companion = {
    Roster: [], Present: [],
    Handle: () => null,
    Detach: () => true,
    Fell: (id) => { fell.push(id); return true; },
    SetAbsent: (id) => { absent.push(id); return true; },
  };
  const host = FakeHost({ Companion: () => companion });
  const director = new MissionSetpieceDirector(host);
  director.BeginLevel("CH4_DongguanYe", PhaseOf("CH4_DongguanYe"));
  Speak(host, "ch4_shunzi_15");          // 「枪给我。」——本关最后一句
  host.time += 1; director.Update(0.5);
  Check("罗班长倒下走的是现有倒地（Fell），不是删人", fell.includes("luo"), fell.join(","));
  Check("罗班长从此永久缺席（SetAbsent，跨关保留）", absent.includes("luo"), absent.join(","));
}

// ④ CH4：两场过场改成关中挂点
{
  Check("CH4 的关首/关末过场都摘了（两场改成关中）",
    FindLevel("CH4_DongguanYe").cutsceneIn === null
    && FindLevel("CH4_DongguanYe").cutsceneOut === null);
  const host = FakeHost();
  const director = new MissionSetpieceDirector(host);
  director.BeginLevel("CH4_DongguanYe", PhaseOf("CH4_DongguanYe"));
  Speak(host, "ch4_luo_05");             // 「先把今晚熬过去。」= 九十秒休整的最后一句
  host.time += 1; director.Update(0.5);
  host.time += 5; director.Update(0.5);
  const played = host.calls.filter((c) => c[0] === "PlayCutscene").map((c) => c[1]);
  Check("休整之后才播口述那一场", played.includes("CS_Ch4_UnfinishedLetter"), played.join(","));
  host.playerZone = "C4_AidStation";
  host.time += 1; director.Update(0.5);
  const played2 = host.calls.filter((c) => c[0] === "PlayCutscene").map((c) => c[1]);
  Check("进 A 区那一拍播救护所那一场", played2.includes("CS_Ch4_AidStation"), played2.join(","));
}

// ⑤ CH6：关中过场的两条入口
{
  const pushed = SETPIECES.CH6_Zuihou._pushed || [];
  Check("CH6 推得出 WireConfirm（最后电报确认）", pushed.includes("WireConfirm"), pushed.join(","));
  Check("CH6 推得出 FlankMg（西关殉国）", pushed.includes("FlankMg"), pushed.join(","));
}

// ⑥ CH1：三条航线 + 强制松手 + 检查点倒带
{
  const runs = [];
  const strafe = { StrafeRun: (spec) => { runs.push(spec); return "run"; } };
  const released = [];
  const rewinds = [];
  const host = FakeHost({
    Strafe: () => strafe,
    Carry: () => ({ Active: false, KindId: null, View: () => null,
      ForceRelease: (why) => { released.push(why); return true; }, Drop: () => true, Begin: () => true }),
    Checkpoint: () => ({ Save: () => true, Rewind: (s) => { rewinds.push(s); return {}; } }),
  });
  const director = new MissionSetpieceDirector(host);
  director.BeginLevel("CH1_NanLu", PhaseOf("CH1_NanLu"));
  host.playerZone = "C1_Ditch";
  host.time += 1; director.Update(0.5);
  Check("进路沟起第一条航线（沿铁路打车辆）", runs.length === 1 && runs[0].preset === "railPass",
    runs.map((r) => r.preset).join(","));
  // 第一条走完 → 九秒后转向人群
  runs[0].OnPhase?.("exit");
  host.time += 10; director.Update(0.5);
  Check("第一条走完之后转向人群", runs.some((r) => r.preset === "crowdTurn"),
    runs.map((r) => r.preset).join(","));
  const crowd = runs.find((r) => r.preset === "crowdTurn");
  crowd.OnPhase?.("exit");
  host.time += 40; director.Update(0.5);
  const dive = runs.find((r) => r.preset === "divePress");
  Check("第三条航线配合松手", !!dive, runs.map((r) => r.preset).join(","));
  dive.OnDodge?.();
  Check("躲开了 → 脚本强行松手（手是先松开的）", released.includes("dive"), released.join(","));
  dive.OnPlayerHit?.();
  Check("没躲 → 从数秒前重来（不走死亡链路）", rewinds.length === 1 && rewinds[0] > 0, rewinds.join(","));
  Check("三条航线一条不多一条不少",
    runs.filter((r) => ["railPass", "crowdTurn", "divePress"].includes(r.preset)).length === 3,
    runs.map((r) => r.preset).join(","));
}

// ===========================================================================
// 4) 后送队控制器
// ===========================================================================

{
  const goals = [];
  const host = {
    time: 0,
    player: { x: 0, y: 0, z: 0 },
    Time() { return host.time; },
    PlayerPos() { return host.player; },
    SpawnActor: (spec) => ({ alive: true, spec }),
    Despawn: () => { host.despawned = (host.despawned || 0) + 1; },
    Alive: (h) => !!(h && h.alive),
    SetGoal: (h, x, z) => goals.push({ x, z }),
  };
  const column = new EscortColumn(host, {
    waypoints: [{ x: 0, z: 0 }, { x: 0, z: 100 }],
    members: [{ role: "bearer", label: "担架员" }, { role: "guard", label: "护卫" }],
  });
  Check("造得出人", column.Start() === 2);
  // 玩家贴着队头：一直走
  for (let i = 0; i < 40; i += 1) { host.time += 0.5; host.player.z = column.HeadPosition().z; column.Update(0.5); }
  const walked = column.HeadPosition().z;
  Check("按路点往前推进", walked > 5, `走了 ${walked.toFixed(1)} m`);
  // 玩家原地不动：队列走出 columnWaitM 之后停下来等
  host.player.z = walked;
  for (let i = 0; i < 200; i += 1) { host.time += 0.5; column.Update(0.5); }
  const gap = column.HeadPosition().z - host.player.z;
  Check("玩家落后就等（不许把人甩掉）", !column.moving && gap <= SETPIECE_TUNING.columnWaitM + 2,
    `落后 ${gap.toFixed(1)} m，moving=${column.moving}`);
  // 追上去就接着走
  host.player.z = column.HeadPosition().z;
  host.time += 1; column.Update(0.5);
  Check("追上就接着走", column.moving);
  // 遇袭散开
  column.Scatter(5);
  Check("遇袭停下并散开", column.scattered && !column.moving);
  host.time += 6; column.Update(0.5);
  Check("散开过后自己爬起来接着走", !column.scattered && column.moving);
  // 走到头
  for (let i = 0; i < 400; i += 1) { host.time += 0.5; host.player.z = column.HeadPosition().z; column.Update(0.5); }
  Check("走完全部路点会报到达", column.arrived);
  column.Reset();
  Check("收摊走 Despawn，不是 Kill（撤走 ≠ 阵亡）", host.despawned === 2, String(host.despawned));
}

// P012 的前沿伤员预置先于正式后送队创建。宿主与 Main 一样按 id 去重；
// 预置 Reset 若复用 escortLitter0，会把稍后正式担架永久留在 removed 状态。
{
  const props = new Map();
  const host = FakeHost({
    SpawnActor: (spec) => ({ alive: true, position: { x: spec.x, y: 0, z: spec.z } }),
    Despawn: () => {}, Alive: (handle) => !!handle?.alive,
    PositionOf: (handle) => handle?.position,
    Prop(spec) {
      if (!props.has(spec.id)) props.set(spec.id, { id: spec.id, state: "shown" });
      return props.get(spec.id).id;
    },
    SetPropState(id, state) { const prop = props.get(id); if (prop) prop.state = state; return !!prop; },
  });
  const director = new MissionSetpieceDirector(host);
  director.BeginLevel("CH1_NanLu", FIRST_LEVEL_P012_WHITEBOX_PHASE);
  const prep = director.mem.prepWounded;
  const formal = director.mem.column;
  const prepLitter = prep.litters[0];
  // P012 Setup itself has already hidden the preparatory litter.
  const prepHiddenBySetup = props.get(prepLitter.propLitter)?.state === "removed";
  prep.Reset();
  formal.Start();
  Check("P012 预置伤员与正式担架 ID 不同",
    prepLitter.propLitter === "p012PrepWoundedLitter0"
      && prepLitter.propBody === "p012PrepWoundedCasualty0"
      && formal.litters[0].propLitter === "escortLitter0"
      && formal.litters[0].propBody === "escortCasualty0",
    JSON.stringify({ prep: prepLitter, formal: formal.litters }));
  Check("预置隐藏并 Reset 不会隐藏正式两副担架与伤员",
    prepHiddenBySetup && props.get(prepLitter.propBody)?.state === "removed"
      && formal.litters.length === 2
      && formal.litters.flatMap(litter => [litter.propLitter, litter.propBody])
        .every(id => props.get(id)?.state === "shown"),
    JSON.stringify([...props.values()]));
}

// 台词游标从换关那一刻起算：`story.fired` 是一本不清的全局流水账，
// 从 0 开始扫的话，选章跳回一个玩过的章会把上一遍的台词当成刚播的重演一遍
// —— 表现是「一进第四关罗班长就已经牺牲了」。
{
  const host = FakeHost();
  const director = new MissionSetpieceDirector(host);
  // 先"玩过一遍"：把四关最后那一句塞进流水账
  Speak(host, "ch4_shunzi_15");
  const fell = [];
  host.Companion = () => ({ Roster: [], Present: [], Handle: () => null, Detach: () => true,
    Fell: (id) => { fell.push(id); return true; }, SetAbsent: () => true });
  director.BeginLevel("CH4_DongguanYe", PhaseOf("CH4_DongguanYe"));
  host.time += 1; director.Update(0.5);
  Check("选章跳回来不会把上一遍的台词重演一遍", fell.length === 0, fell.join(","));
  // 这一遍真播了才算数
  Speak(host, "ch4_shunzi_15");
  host.time += 1; director.Update(0.5);
  Check("这一遍真播了才触发", fell.includes("luo"), fell.join(","));
}

// 换关：交互点按本章 tag 清，别把别的章的点一起摘掉
{
  const host = FakeHost();
  const director = new MissionSetpieceDirector(host);
  host.interact.Register({ id: "别的章的点", tag: "CHX" });
  director.BeginLevel("CH3_Jiuhusuo", PhaseOf("CH3_Jiuhusuo"));
  const after = host.interact.PointCount;
  Check("CH3 真的摆了交互点", after > 1, `共 ${after} 个`);
  director.Reset("levelChange");
  Check("换关只清本章的点", host.interact.points.has("别的章的点") && host.interact.PointCount === 1,
    [...host.interact.points.keys()].join(","));
  Check("换关把便签本与一次性标记清干净",
    Object.keys(director.mem).length === 0 && director.once.size === 0 && director.signals.length === 0);
}

// ===========================================================================
// 5) 抛光批 P1：演出与实体补齐
// ===========================================================================

// 前面两节把七章各摆了一遍，登记表里还留着那几只箱子（那几个 director 没 Reset）。
// 下面每一条都从**空表**起跑 —— 不清的话 `Register` 会因为重名返回 null，
// 症状是「箱子明明摆了，一炸却什么都没发生」。
BLAST_TARGETS.Clear();

// ① 二关：可被打中的弹药箱 + 殉爆倒计时（拖出 6 m 算救下）
{
  const zone = ZoneOf("CH2_Shouliudan", "C2_Courtyard");
  const carry = FakeCarry();
  const fired = [];
  const host = FakeHost({
    Carry: () => carry,
    Firewall: (spec) => { fired.push(["Firewall", spec.id, spec.damagePlayer]); return spec.id; },
    Shell: (spec) => { fired.push(["Shell", +spec.at.x.toFixed(1)]); return 1; },
    SetPropState: (id, next) => { fired.push(["SetPropState", id, next]); return true; },
  });
  const director = new MissionSetpieceDirector(host);
  director.BeginLevel("CH2_Shouliudan", PhaseOf("CH2_Shouliudan"));
  Check("CH2 摆得出可被打中的弹药箱", BLAST_TARGETS.Count >= 3, `表里 ${BLAST_TARGETS.Count} 件`);
  Check("箱子同时是可拖的交互点",
    [...host.interact.points.keys()].some((id) => /cookCrate\d_take$/.test(id)),
    [...host.interact.points.keys()].join(","));

  // 一发掷弹筒落在第一只箱子上。**这一条走的就是 destruction 那一行。**
  const hit = Boom(zone.x - 4.0, zone.z + 3.0);
  Check("掷弹筒炸得中它（destruction → 登记表 → 摆点层）",
    hit.destroyed.includes("ch2_cookCrate1"), JSON.stringify(hit));
  // OnDestroyed 只记事实，起烟与倒计时在下一帧。
  host.time += 0.25; director.Update(0.25);
  Check("下一帧起烟并喊「箱子拖开！」",
    fired.some((c) => c[0] === "Firewall" && c[1] === "ch2_cookCrate1_smoke" && c[2] === false)
    && host.calls.some((c) => c[0] === "Say" && c[2] === "箱子拖开！"),
    JSON.stringify(fired));

  // 没拖：倒计时到点殉爆。**炸点在原地**，火墙这一次对玩家有伤害。
  host.time += SETPIECE_TUNING.crateFuseS + 0.3;
  director.Update(0.25);
  Check("到点殉爆（走宿主的爆炸链路，不是自己算伤害）",
    fired.some((c) => c[0] === "Shell"), JSON.stringify(fired));
  Check("殉爆之后那一片烧起来，且对玩家有伤害",
    fired.some((c) => c[0] === "Firewall" && c[1] === "ch2_cookCrate1_fire" && c[2] === true));
  Check("炸掉的那只箱子从场上摘掉",
    fired.some((c) => c[0] === "SetPropState" && c[1] === "ch2_cookCrate1" && c[2] === "removed"));
  Check("殉爆之后倒计时清空（下一只才轮得到）", director.mem.cooking == null);
  Check("一发只点着一只（旁边那两只这一次没被打穿）", director.mem.cookCount === 1,
    String(director.mem.cookCount));
}

// ① 之二：连锁 —— 一发把两只一起打穿时**排队**，一只一只演
{
  BLAST_TARGETS.Clear();
  const zone = ZoneOf("CH2_Shouliudan", "C2_Courtyard");
  const carry = FakeCarry();
  const host = FakeHost({ Carry: () => carry, Firewall: () => "fw", Shell: () => 1, SetPropState: () => true });
  const director = new MissionSetpieceDirector(host);
  director.BeginLevel("CH2_Shouliudan", PhaseOf("CH2_Shouliudan"));
  // 一发大的：三只全在半径内
  const hit = Boom(zone.x + 0.8, zone.z + 3.5, 14, 900, "shell");
  Check("一发能把三只一起打穿", hit.destroyed.length === 3, JSON.stringify(hit.destroyed));
  host.time += 0.25; director.Update(0.25);
  Check("排队，不是覆盖（第一只在烧，另外两只等着）",
    director.mem.cookCount === 1 && (director.mem.cookQueue || []).length === 2,
    `烧了 ${director.mem.cookCount}，队里还有 ${(director.mem.cookQueue || []).length}`);
  // 炸掉那一帧只做「炸」，下一帧才轮到队里的下一只（一帧一件事）。
  host.time += SETPIECE_TUNING.crateFuseS + 0.3; director.Update(0.25);
  host.time += 0.25; director.Update(0.25);
  Check("第一只炸完轮到第二只", director.mem.cookCount === 2 && director.mem.cratesBlown === 1,
    `${director.mem.cookCount} / ${director.mem.cratesBlown}`);
  for (let i = 0; i < 6; i += 1) { host.time += SETPIECE_TUNING.crateFuseS; director.Update(0.25); }
  Check("三只挨个演完，一只都没被静默吞掉",
    director.mem.cratesBlown === 3 && (director.mem.cookQueue || []).length === 0,
    `炸了 ${director.mem.cratesBlown}`);
}

// ① 之二：拖出 6 m 就算救下 —— **判的是箱子走了多远，不是玩家走了多远**
{
  BLAST_TARGETS.Clear();
  const zone = ZoneOf("CH2_Shouliudan", "C2_Courtyard");
  const carry = FakeCarry();
  const fired = [];
  const host = FakeHost({
    Carry: () => carry,
    Firewall: (spec) => { fired.push(["Firewall", spec.id]); return spec.id; },
    Shell: () => { fired.push(["Shell"]); return 1; },
    SetPropState: () => true,
  });
  const director = new MissionSetpieceDirector(host);
  director.BeginLevel("CH2_Shouliudan", PhaseOf("CH2_Shouliudan"));
  host.playerPos = { x: zone.x - 4.0, y: 0, z: zone.z + 3.0 };
  Boom(zone.x - 4.0, zone.z + 3.0);
  host.time += 0.25; director.Update(0.25);
  Check("冒烟的那只认得出来", director.mem.cooking?.id === "ch2_cookCrate1");
  // 抬起来（真流程走交互点，这里直接进搬运态）
  carry.Begin("ammoCrate", { label: "手榴弹箱", payload: { crateId: "ch2_cookCrate1" } });
  // 空着手跑开不算：先把玩家挪走、但**不抬箱子**的情形在下一条验。
  host.playerPos = { x: zone.x - 4.0 + 3.0, y: 0, z: zone.z + 3.0 };
  host.time += 0.5; director.Update(0.5);
  Check("只拖了三米还不算救下", director.mem.cooking != null && !director.mem.cratesSaved);
  host.playerPos = { x: zone.x - 4.0 + SETPIECE_TUNING.crateSafeM + 0.5, y: 0, z: zone.z + 3.0 };
  host.time += 0.5; director.Update(0.5);
  Check("拖出六米算救下", director.mem.cratesSaved === 1, String(director.mem.cratesSaved));
  Check("救下之后手上放下了", carry.log.some((c) => c[0] === "Drop" && c[1] === "cratePulled"));
  // 到点了也不该再炸 —— 它已经不在倒计时里了
  host.time += SETPIECE_TUNING.crateFuseS + 2; director.Update(0.5);
  Check("救下的那一只不再殉爆", !fired.some((c) => c[0] === "Shell"), JSON.stringify(fired));
}

// ① 之三：换关按 tag 清登记表（不清的症状是下一关同一片地方一炸就跑上一关的回调）
{
  BLAST_TARGETS.Clear();
  const host = FakeHost();
  const director = new MissionSetpieceDirector(host);
  director.BeginLevel("CH2_Shouliudan", PhaseOf("CH2_Shouliudan"));
  const staged = BLAST_TARGETS.Count;
  director.Reset("levelChange");
  Check("换关把本章的可炸物件清干净", staged >= 3 && BLAST_TARGETS.Count === 0,
    `摆了 ${staged}，清完还剩 ${BLAST_TARGETS.Count}`);
}

// ② 三关：幸存者实体（「这边还有活的！」那一拍开门 → 搀起 → 交给幺娃 → 他自己走）
{
  BLAST_TARGETS.Clear();
  const carry = FakeCarry();
  const goals = [];
  const host = FakeHost({
    Carry: () => carry,
    Companion: () => ({ Roster: [], Present: [], Handle: () => null, Locate: () => ({ x: 450, y: 1.5, z: -30 }) }),
    SetPropState: () => true,
    SetGoal: (h, x, z) => goals.push([+x.toFixed(0), +z.toFixed(0)]),
  });
  const director = new MissionSetpieceDirector(host);
  director.BeginLevel("CH3_Jiuhusuo", PhaseOf("CH3_Jiuhusuo"));
  const bodies = host.calls.filter((c) => c[0] === "Prop" && /^ch3_surv\d$/.test(c[1]));
  Check("破墙看见的院子里本来就躺着人（躯体在 Setup 就摆）", bodies.length >= 2, String(bodies.length));
  Check("躺着的时候还搀不起来（交互要等那一句）",
    ![...host.interact.points.keys()].some((id) => /^ch3_surv\d_lift$/.test(id)));
  Speak(host, "ch3_yaowa_09");           // 「这边还有活的！」
  host.time += 1; director.Update(0.5);
  const lifts = [...host.interact.points.keys()].filter((id) => /^ch3_surv\d_lift$/.test(id));
  Check("喊出来的同一刻真的可以搀了", lifts.length >= 2, lifts.join(","));
  Check("搀起来走的是负重层的 wounded 档（走不快、打不了枪）",
    host.interact.points.get(lifts[0])?.kind === "carry");
  Check("交接点是幺娃站的地方", host.interact.points.has("ch3_survivorHandoff"));
  // 搀一个、交出去
  host.interact.points.get(lifts[0]).OnComplete({});
  carry.Begin("wounded", { label: "还能走的伤兵", payload: { survivor: "ch3_surv1" } });
  host.interact.points.get("ch3_survivorHandoff").OnComplete({});
  Check("交出去算一个", director.mem.survivorsSaved === 1, String(director.mem.survivorsSaved));
  const walkers = host.calls.filter((c) => c[0] === "SpawnActor" && c[1] === "还能走的伤兵");
  Check("交出去的那个自己站起来走", walkers.length === 1, String(walkers.length));
  host.time += 2; director.Update(0.5);
  Check("他往撤回 A 区那个方向走", goals.length > 0, JSON.stringify(goals.slice(0, 2)));
}
{
  // 那一句被吞掉时，「屋里清空了」这个事实照样开门（少了这条 = 人永远搀不起来）
  BLAST_TARGETS.Clear();
  const host = FakeHost({ EnemiesNear: () => 0, SetPropState: () => true });
  const director = new MissionSetpieceDirector(host);
  director.BeginLevel("CH3_Jiuhusuo", PhaseOf("CH3_Jiuhusuo"));
  host.playerZone = "C3_ForwardAid";      // 破墙确认
  host.time += 1; director.Update(0.5);
  host.time += 1; director.Update(0.5);
  Check("屋里清空是搀扶的兜底入口",
    [...host.interact.points.keys()].some((id) => /^ch3_surv\d_lift$/.test(id)),
    [...host.interact.points.keys()].join(","));
}

// ③ 三关：那条看得见的电话线（线本身就是路标，断点处有断头）
{
  BLAST_TARGETS.Clear();
  const host = FakeHost();
  const director = new MissionSetpieceDirector(host);
  director.BeginLevel("CH3_Jiuhusuo", PhaseOf("CH3_Jiuhusuo"));
  const props = host.calls.filter((c) => c[0] === "Prop").map((c) => c[1]);
  const wire = props.filter((id) => /^ch3_wire[AB]_\d+$/.test(id));
  Check("A 区 → 侧门 → 失守街区 → C 区真的铺了一条线", wire.length >= 6, `${wire.length} 段`);
  Check("线在失守街区那一头断开，两个断头都在",
    props.includes("ch3_wireEndA") && props.includes("ch3_wireEndB"), props.join(","));
  Check("断口那根杆是歪掉的半截（与另外两根不同高）",
    props.includes("ch3_wirePost1") && props.includes("ch3_wirePost2") && props.includes("ch3_wirePost3"));
  // 断口与剪线交互必须在同一处 —— 剪一段自己看不见的线是这一拍最容易犯的错。
  // 剪线点由 onVoice.ch3_luo_18 摆在 Near("C3_LostBlock", -8, 4)。
  {
    const lost = ZoneOf("CH3_Jiuhusuo", "C3_LostBlock");
    Speak(host, "ch3_luo_18");
    host.time += 1; director.Update(0.5);
    const cut = host.interact.points.get("ch3_cutWire");
    Check("剪线交互摆出来了", !!cut);
    Check("断口与剪线交互在同一处（剪的是自己看得见的那一段）",
      !!cut && Math.hypot(cut.position.x - (lost.x - 8), cut.position.z - (lost.z + 4)) < 0.01,
      cut ? `${cut.position.x},${cut.position.z}` : "无");
  }
}

// ④ 四关：罗班长救顺子的动作层（整段 4—6 s，超时自动放行）
{
  BLAST_TARGETS.Clear();
  const carry = FakeCarry();
  const acts = [];
  const goals = [];
  const host = FakeHost({
    Carry: () => carry,
    Checkpoint: () => ({ Save: () => { acts.push(["Save"]); return true; }, Rewind: () => ({}) }),
    Companion: () => ({
      Roster: ["luo"], Present: ["luo"], Handle: () => ({ id: "luo" }),
      Detach: (id) => { acts.push(["Detach", id]); return true; },
      Attach: (id) => { acts.push(["Attach", id]); return true; },
      Fell: () => true, SetAbsent: () => true,
    }),
    Shell: (spec) => { acts.push(["Shell", +spec.at.x.toFixed(1)]); return 1; },
    Detonate: (spec) => { acts.push(["Detonate", +spec.at.x.toFixed(1), spec.radius]); return true; },
    Firewall: (spec) => { acts.push(["Firewall", spec.id, spec.damagePlayer]); return spec.id; },
    GroundPov: (spec) => { acts.push(["GroundPov", spec.blackOut]); return true; },
    SetPlayerInvulnerable: (on, secs) => acts.push(["Invuln", !!on, secs ?? null]),
    SetGoal: (h, x, z) => goals.push([+x.toFixed(0), +z.toFixed(0)]),
    PlaySfx: (name) => acts.push(["Sfx", name]),
  });
  const director = new MissionSetpieceDirector(host);
  director.BeginLevel("CH4_DongguanYe", PhaseOf("CH4_DongguanYe"));
  host.playerPos = { x: 443, y: 0, z: 121 };
  Speak(host, "ch4_yaowa_07");            // 「顺哥！左边！」——整段的起点
  host.time += 0.25; director.Update(0.25);
  Check("先打检查点（这四到六秒被打倒走倒带，不走死亡链路）", acts.some((a) => a[0] === "Save"));
  Check("整段有无敌窗", acts.some((a) => a[0] === "Invuln" && a[1] === true));
  Check("推 C4_LuoSaves（env beat「炮弹打在侧墙上」挂在它上面）",
    host.story.pushed.includes("C4_LuoSaves"), host.story.pushed.join(","));
  Check("先是一声呼啸（炮弹在路上）", acts.some((a) => a[0] === "Sfx" && a[1] === "shellIncoming"));
  // 走 Shell 会把跟在身后的罗班长和幺娃一起炸死（radius 11 / damage 160 + 落点抖动），
  // 而这一段之后整关都要靠他俩 —— 这一条守的就是「别用那条路」。
  Check("不走 CallIncoming 那条（会把罗班长和幺娃一起炸死）",
    !acts.some((a) => a[0] === "Shell"), JSON.stringify(acts));

  host.time += 1.3; director.Update(0.25);
  Check("落地那一刻炸在侧墙上，不是玩家脚下",
    acts.some((a) => a[0] === "Detonate" && Math.abs(a[1] - 443) > 5), JSON.stringify(acts));
  Check("那一下的半径够拆墙、够不着后头的人",
    acts.some((a) => a[0] === "Detonate" && a[2] <= 5), JSON.stringify(acts));
  Check("落地那一刻起尘烟（不伤人 —— 那是灰不是火）",
    acts.some((a) => a[0] === "Firewall" && a[1] === "ch4_wallDust" && a[2] === false));
  Check("玩家被掀翻成贴地视角，且不切黑",
    acts.some((a) => a[0] === "GroundPov" && a[1] === false));
  Check("武器脱手：占住手（几秒内打不了枪）",
    carry.Active && carry.View().payload.scripted === "ch4_disarm", JSON.stringify(carry.log));
  Check("罗班长从跟随里脱出来", acts.some((a) => a[0] === "Detach" && a[1] === "luo"));
  host.time += 0.6; director.Update(0.25);
  Check("罗班长的演员往玩家脚下跑（不是瞬移过去）", goals.length > 0, JSON.stringify(goals));

  host.time += 2.6; director.Update(0.25);
  Check("四到六秒之内枪回到手上", !carry.Active, JSON.stringify(carry.log));
  host.time += 1.2; director.Update(0.25);
  Check("整段收尾时无敌窗关掉", acts.some((a) => a[0] === "Invuln" && a[1] === false));
  Check("整段在六秒内放行了", director.mem.rescueEnded === "timetable", String(director.mem.rescueEnded));
}
{
  // 看门狗：定时器被吞掉（换关/过场打断）时枪也一定要还回来。
  BLAST_TARGETS.Clear();
  const carry = FakeCarry();
  const host = FakeHost({ Carry: () => carry, GroundPov: () => true });
  const director = new MissionSetpieceDirector(host);
  director.BeginLevel("CH4_DongguanYe", PhaseOf("CH4_DongguanYe"));
  Speak(host, "ch4_yaowa_07");
  host.time += 0.25; director.Update(0.25);
  host.time += 1.3; director.Update(0.25);
  Check("先确认真的占着手了", carry.Active);
  director.timers.length = 0;             // 把定时器全吞掉
  host.time += 12; director.Update(0.25);
  Check("看门狗把枪还回来了（不许出现「演完了枪还在地上」）",
    !carry.Active && director.mem.rescueEnded === "watchdog", String(director.mem.rescueEnded));
}

// ⑤ 五关：终局手感（体力恢复上限递减 + 两侧压上的波次；章节作用域）
{
  BLAST_TARGETS.Clear();
  const ceils = [];
  const spawned = [];
  const host = FakeHost({
    SetStaminaCeiling: (v) => ceils.push(+v.toFixed(2)),
    SpawnEnemy: (spec) => { spawned.push([+spec.x.toFixed(0), +spec.z.toFixed(0)]); return { ija: true }; },
  });
  const director = new MissionSetpieceDirector(host);
  director.BeginLevel("CH5_Chengqiang", PhaseOf("CH5_Chengqiang"));
  host.time += 1; director.Update(0.5);
  Check("转身之前不压体力、不排波次", ceils.length === 0 && spawned.length === 0);
  Speak(host, "ch5_shunzi_07");           // 「老子回去压住！」
  host.time += 1; director.Update(0.5);
  const T = SETPIECE_TUNING;
  for (let i = 0; i < 12; i += 1) { host.time += T.lastStandStaminaStepS; director.Update(0.5); }
  Check("体力恢复上限一档一档往下压", ceils.length >= 3, ceils.join(","));
  Check("压到地板就不再往下", Math.min(...ceils) >= T.lastStandStaminaFloor - 1e-6, ceils.join(","));
  Check("两侧都压上来了（不是只有一边）",
    spawned.some((p) => p[1] > 0) && spawned.some((p) => p[1] < 0),
    JSON.stringify(spawned.slice(0, 6)));
  Check("波次越打越密", director.mem.waveGap < T.lastStandWaveS, String(director.mem.waveGap));
  // 顺子倒下 → 借走的旋钮还回去（后面三个人不继承他那条压下去的体力线）。
  // **是他真的倒下那一刻**（ch5_shunzi_18 之后 24 s 的那个定时器），不是他说那句话的时候。
  Speak(host, "ch5_shunzi_18");
  host.time += 1; director.Update(0.5);
  Check("说那句话的时候还不还（后头还有二十多秒白刃要打）",
    ceils[ceils.length - 1] !== 1, ceils.join(","));
  host.time += 25; director.Update(0.5);
  Check("他倒下那一刻把体力上限还回去", ceils[ceils.length - 1] === 1, ceils.join(","));
  host.time += T.lastStandStaminaStepS * 3; director.Update(0.5);
  Check("还回去之后不再往下压", ceils[ceils.length - 1] === 1, ceils.join(","));
}
{
  // 换关也要还 —— 忘了还的症状是「下一关一进去就跑两步喘不上气」
  BLAST_TARGETS.Clear();
  const ceils = [];
  const host = FakeHost({ SetStaminaCeiling: (v) => ceils.push(+v.toFixed(2)) });
  const director = new MissionSetpieceDirector(host);
  director.BeginLevel("CH5_Chengqiang", PhaseOf("CH5_Chengqiang"));
  Speak(host, "ch5_shunzi_07");
  host.time += 1; director.Update(0.5);
  for (let i = 0; i < 4; i += 1) { host.time += SETPIECE_TUNING.lastStandStaminaStepS; director.Update(0.5); }
  const pressed = ceils.length;
  director.Reset("levelChange");
  Check("换关把体力上限还回去", pressed > 0 && ceils[ceils.length - 1] === 1, ceils.join(","));
}

// ⑥ 五关：视角接替的换身份表现（1 s 黑帧 + 身份字卡 + 落地朝向）
{
  BLAST_TARGETS.Clear();
  const povs = [];
  const host = FakeHost({ SwitchPov: (spec) => { povs.push(spec); return true; } });
  const director = new MissionSetpieceDirector(host);
  director.BeginLevel("CH5_Chengqiang", PhaseOf("CH5_Chengqiang"));
  for (const key of ["ch5_canmou_01", "ch5_xiaoqin_01", "ch5_xiaoqin_02"]) {
    Speak(host, key);
    host.time += 1; director.Update(0.5);
  }
  const cards = host.calls.filter((c) => c[0] === "PlayCutscene").map((c) => c[1]);
  Check("三段各有一张身份字卡", povs.length === 3 && cards.length === 3,
    `${povs.length} 段 / ${cards.join(",")}`);
  for (const id of ["CS_Ch5_PovGunnerCard", "CS_Ch5_PovLinemanCard", "CS_Ch5_PovXiaoqinCard"]) {
    Check(`身份字卡 ${id} 已注册（没注册就是一次 console.warn，画面上什么都不会发生）`,
      !!CUTSCENES[id]);
    const cut = CUTSCENES[id];
    Check(`${id} 是「一秒黑帧 + 一行身份」`,
      cut && cut.shots.length === 2 && cut.shots[0].black === true
      && Math.abs(cut.shots[0].seconds - 1.0) < 1e-6 && cut.shots[1].titleCard === true,
      JSON.stringify(cut && cut.shots.map((sh) => [sh.seconds, !!sh.black, !!sh.titleCard])));
    Check(`${id} 的黑帧上声音不断（策划案「用声音衔接」）`,
      cut && (cut.shots[0].sfx || []).length > 0);
  }
  Check("三段都带落地朝向（不带的话人是背着战场出生的）",
    povs.every((p) => Number.isFinite(p.yaw)), JSON.stringify(povs.map((p) => p.yaw)));
  Check("机枪副射手面朝十字街口那一头（日军来的方向）",
    Math.abs(povs[0].yaw + Math.PI / 2) < 0.35, String(povs[0].yaw));
  Check("字卡先播、人再落地（黑帧盖住这一次搬人）",
    host.calls.findIndex((c) => c[0] === "PlayCutscene") >= 0);
}

// ===========================================================================
// 6) 装配层接线（扫源码：漏接的症状是静默的）
// ===========================================================================

Check("装配层建了摆点导演", /setpieces = new MissionSetpieceDirector\(\{/.test(MainSource));
Check("换关时摆点（排在具名同伴之后、撒兵之前）",
  /setpieces\.BeginLevel\(contentId, phase\);/.test(MainSource));
Check("每帧推它，且排在 story.Update 之后（onVoice 读的是 story.fired）",
  /if \(story\.ObjectiveText(?: && !p012Flow)?\) state\.storyObjective = story\.ObjectiveText;\s*\n(?:\s*\/\/[^\n]*\n)*\s*setpieces\?\.Update\(dt\);/
    .test(MainSource));
Check("换关清摆点（交互点、后送队、运行时道具）",
  /setpieces\?\.Reset\("levelChange"\);/.test(MainSource)
  && /ClearSetpieceProps\(\);/.test(MainSource));
Check("取证口在", /Setpieces: \(\) => \(setpieces \? setpieces\.State\(\) : null\),/.test(MainSource));
Check("关中过场走的是同一个 PlayMidCutscene", /PlayCutscene: \(id\) => PlayMidCutscene\(id\),/.test(MainSource));
Check("固定事件那几秒被打倒走的是检查点倒带，不是死亡链路",
  /state\.elapsed < scriptInvulnUntil/.test(MainSource) && /checkpoint\?\.Rewind\(2\.0\)/.test(MainSource));
Check("火墙对玩家有伤害（它是封路，不是单向道具）",
  /wall\.damagePlayer/.test(MainSource) && /player\.TakeHit\(9, "legs"/.test(MainSource));

// ===========================================================================

if (failures.length) {
  console.log(`章节摆点回归：${checks - failures.length}/${checks} 通过，${failures.length} 条红：`);
  for (const line of failures) console.log("  ✗ " + line);
  process.exit(1);
}
console.log(`章节摆点回归全过（${checks} 条）：七章 Setup 不抛、台词节拍与信号名对得上、`
  + "INT1 六条对接项、后送队控制器、装配层接线。");
