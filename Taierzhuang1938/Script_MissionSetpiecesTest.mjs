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
import { LEVELS, CHAPTERS, CHAPTER_EVENTS, FindLevel } from "./Data_TengxianScript.mjs";
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
// 5) 装配层接线（扫源码：漏接的症状是静默的）
// ===========================================================================

Check("装配层建了摆点导演", /setpieces = new MissionSetpieceDirector\(\{/.test(MainSource));
Check("换关时摆点（排在具名同伴之后、撒兵之前）",
  /setpieces\.BeginLevel\(phase\.id, phase\);/.test(MainSource));
Check("每帧推它，且排在 story.Update 之后（onVoice 读的是 story.fired）",
  /if \(story\.ObjectiveText\) state\.storyObjective = story\.ObjectiveText;\s*\n(?:\s*\/\/[^\n]*\n)*\s*setpieces\?\.Update\(dt\);/
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
