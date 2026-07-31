#!/usr/bin/env node
// 《地下长城 · 冀中1942》 —— node 冒烟测试（AGENTS.md §7.1 清单逐条落地）。
// 退出码即成败；彩色 PASS/FAIL 汇总；目标总时长 <90 秒。

import { readFileSync, existsSync } from "node:fs";
import process from "node:process";
import { HexKey, ParseHexKey, HexNeighborKeys, HexDistanceKeys } from "./Script_Hex.mjs";
import { CFG, unitDefinitions, disguiseDefinitions } from "./Data_Rules.mjs";
import { GetLevel, levelDefinitions, campaignOrder, BuildSchedule, BuildActCard,
  BuildFullCarry, CarryWeight } from "./Data_Levels.mjs";
import {
  CreateGame, CloneState, SerializeState, DeserializeState, HashState, MakeEnemyUnit, ExtractCarry,
  AddLedger, GrainTotal, TunnelGrainTotal, PopTotal, SortedKeys, EdgeKey, AllyUnits, EnemyUnits, UnitDef,
  AllCivs, LiveCivs, CivsInCell, CivsAtVillage, CivSafeCount, CivTotal, ElevOf,
  LargestNetworkSize, EntranceThreshold, ActionUnlocked, StorageCapOf, ShelterCapOf, LiveEntranceCount,
  IsStunned, VentCount, EnemyNearVillage,
} from "./Script_State.mjs";
import { DeriveView, RecordSighting } from "./Script_Visibility.mjs";
import { LegalActions, PerformAction } from "./Script_Actions.mjs";
import { EndTurn, KillsScore, ComputeBreakdown } from "./Script_Turn.mjs";
import { RenderAsciiMap } from "./Script_AsciiMap.mjs";
import { RunBotGame } from "./Script_Bots.mjs";
import { EnemyPath } from "./Script_EnemyAi.mjs";

const startedAt = Date.now();
const results = [];
const green = (text) => `[32m${text}[0m`;
const red = (text) => `[31m${text}[0m`;

function Check(name, fn) {
  try {
    fn();
    results.push({ name, pass: true });
    console.log(`${green("PASS")} ${name}`);
  } catch (error) {
    results.push({ name, pass: false, message: error.message });
    console.log(`${red("FAIL")} ${name} —— ${error.message}`);
  }
}

function Ok(cond, message) {
  if (!cond) throw new Error(message || "断言失败");
}

function Eq(actual, expected, message) {
  if (actual !== expected) throw new Error(`${message || "不相等"}：实际 ${JSON.stringify(actual)}，期望 ${JSON.stringify(expected)}`);
}

function Step(state, action) {
  const outcome = action.type === "EndTurn" ? EndTurn(state) : PerformAction(state, action);
  Ok(!outcome.illegal, `动作被拒：${outcome.illegal}（${JSON.stringify(action)}）`);
  return outcome;
}

const here = new URL(".", import.meta.url).pathname;
const Src = (file) => readFileSync(here + file, "utf8");

const acts = campaignOrder.slice();          // ["A1".."A5"]

/** 测试用敌纵队装配（与 Script_EnemyAi 的列结构同构）。 */
function MakeColumn(state, id, types, pos, opts = {}) {
  const column = { id, unitIds: [], role: opts.role || "march", route: [], routeIndex: 0,
    exit: opts.exit || null, targetVillage: opts.target || null, seizeGoal: 0, seized: 0,
    caution: opts.caution || 0, cautionTurns: 0, regroupTurns: 0, opInProgress: null,
    withdrawing: false, garrison: false, plannedPath: [], respondFresh: false,
    incident: false, casualties: 0, burned: false, done: false, axis: null, burnCount: 0 };
  for (const type of types) column.unitIds.push(MakeEnemyUnit(state, type, pos, id));
  state.enemy.columns.push(column);
  return column;
}

/** 清空脚本波次并推进到扫荡期的外科手术局（留一个远期占位波，防止波次提前收束）。 */
function SurgeryGame(levelId, seed, options) {
  let state = CreateGame(levelId, seed, options || {});
  while (state.wave.status === "quiet") state = EndTurn(state).state;
  state.wave.schedule = [{ id: "zzHold", kind: "march", turn: 99, role: "march", entry: null, exit: null,
    units: [], waypoints: [], target: null, seizeGoal: 0, axisKillsNeed: 0, spawned: false }];
  if (state.wave.revenge) state.wave.revenge.pending = false;
  for (const foe of EnemyUnits(state)) delete state.units[foe.id];
  state.enemy.columns = [];
  return state;
}

/** 让一个单位站到指定地下格，便于做外科手术式断言。 */
function PutUnder(state, unitId, key) {
  state.units[unitId].layer = "under";
  state.units[unitId].pos = key;
  state.units[unitId].acted = false;
  state.units[unitId].mp = UnitDef(state.units[unitId]).mp;
}

/** 把某一批群众直接摆进某个地道格（外科手术用）。 */
function PutCiv(state, civId, key, panic = 0) {
  const civ = state.civs[civId];
  civ.loc = "cell";
  civ.at = key;
  civ.panic = panic;
  return civ;
}

const FirstIdle = (state) => AllyUnits(state).find((unit) => !unit.acted) || null;
const Acts = (state, unit) => LegalActions(state, unit.id);
const Pick = (actions, type, extra) => actions.find((a) => a.type === type && (!extra || extra(a))) || null;

/** 用一段确定的动作序列跑一局（非法即退回 Rest/EndTurn）。 */
function PlayWith(level, seed, chooser, maxSteps = 3000) {
  let state = CreateGame(level, seed);
  for (let step = 0; step < maxSteps && !state.result; step += 1) {
    const action = chooser(state) || { type: "EndTurn" };
    let outcome = action.type === "EndTurn" ? EndTurn(state) : PerformAction(state, action);
    if (outcome.illegal) {
      outcome = action.unit && state.units[action.unit] && !state.units[action.unit].acted && action.type !== "Rest"
        ? PerformAction(state, { type: "Rest", unit: action.unit })
        : EndTurn(state);
      if (outcome.illegal) break;
    }
    state = outcome.state;
  }
  return state;
}

// ===========================================================================
// 一、契约
// ===========================================================================

Check("契约：六角坐标往返与邻接", () => {
  Eq(HexKey(3, -2), "3,-2");
  const parsed = ParseHexKey("3,-2");
  Eq(parsed.q, 3); Eq(parsed.r, -2);
  for (const nb of HexNeighborKeys("0,0")) Eq(HexDistanceKeys("0,0", nb), 1, "邻格距离");
  Eq(EdgeKey("2,2", "1,2"), EdgeKey("1,2", "2,2"), "边键对称");
});

Check("契约：五幕战役注册齐全，幕次卡与解锁声明完整", () => {
  Eq(Object.keys(levelDefinitions).length, 5, "应有五幕");
  Eq(acts.join(","), "A1,A2,A3,A4,A5");
  let previousActions = null;
  for (const id of acts) {
    const level = GetLevel(id);
    Ok(level.unlocks && Array.isArray(level.unlocks.actions), `${id} 缺 unlocks.actions`);
    Ok(Array.isArray(level.lessons) && level.lessons.length === 3, `${id} 的「这一幕你要学会什么」应恰好三行`);
    Ok(level.debrief && level.debrief.cost && level.debrief.learned && level.debrief.unlocked,
      `${id} 缺终局复盘三段`);
    const card = BuildActCard(level);
    Eq(card.act, level.act);
    // 认知递增：后一幕的动作集必须是前一幕的超集
    Ok(level.unlocks.newThisAct.length > 0, `${id} 没有声明本幕新解锁`);
    if (previousActions) {
      for (const type of previousActions) Ok(level.unlocks.actions.includes(type), `${id} 丢掉了上一幕已解锁的 ${type}`);
      // 第五幕不加新动作（它加的是三个村与跨村地道网），其余各幕必须有新动作
      if (id !== "A5") Ok(level.unlocks.actions.length > previousActions.length, `${id} 没有任何新解锁动作`);
    }
    previousActions = level.unlocks.actions;
  }
  Eq(GetLevel("A5").unlocks.newThisAct.length > 0, true);
  Eq(BuildActCard(GetLevel("A4")).nextId, "A5", "A4 的下一幕应是 A5");
  Eq(BuildActCard(GetLevel("A5")).nextId, null, "A5 之后没有下一幕");
});

Check("契约：状态序列化 round-trip", () => {
  for (const levelId of acts) {
    const state = CreateGame(levelId, 7);
    const revived = DeserializeState(SerializeState(state));
    Eq(HashState(revived), HashState(state), `${levelId} 序列化后哈希漂移`);
  }
});

Check("契约：CloneState 隔离", () => {
  const state = CreateGame("A1", 4);
  const hash = HashState(state);
  const clone = CloneState(state);
  clone.meta.turn = 99;
  clone.map.hexes["3,1"].traces = 6;
  clone.units.u1.hp = 0;
  clone.ledger.civDead = 9;
  clone.civs.c1.panic = 3;
  Eq(HashState(state), hash, "改克隆不得影响原状态");
});

Check("契约：纯度扫描（核心模块无 window/document/three/伪随机/时钟）", () => {
  const coreFiles = ["Script_Hex.mjs", "Data_Rules.mjs", "Data_Levels.mjs", "Script_State.mjs",
    "Script_Visibility.mjs", "Script_Actions.mjs", "Script_EnemyAi.mjs", "Script_Turn.mjs",
    "Script_Bots.mjs", "Script_AsciiMap.mjs"];
  const banned = ["window.", "document.", "Math." + "random", "Date." + "now", 'from "three"', "from 'three'"];
  for (const file of coreFiles) {
    const source = Src(file)
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/[^\n]*/g, "");
    for (const pattern of banned) {
      Ok(!source.includes(pattern), `${file} 含违禁引用 ${pattern}`);
    }
  }
});

Check("契约：DeriveView 只读不写（视图不改状态）", () => {
  for (const levelId of ["A1", "A4", "A5"]) {
    let state = CreateGame(levelId, 7);
    for (let i = 0; i < 3; i += 1) state = EndTurn(state).state;
    const hash = HashState(state);
    DeriveView(state);
    RenderAsciiMap(state);
    Eq(HashState(state), hash, `${levelId}：DeriveView/ASCII 改动了状态`);
  }
});

Check("契约：非法动作不改状态且给出理由", () => {
  const state = CreateGame("A3", 3);
  const hash = HashState(state);
  const outcome = PerformAction(state, { type: "Attack", unit: "u1", target: "不存在" });
  Ok(outcome.illegal, "应返回 illegal");
  Eq(HashState(state), hash, "非法动作污染了传入状态");
  Eq(outcome.state, state, "非法动作应原样退回状态引用");
});

// ===========================================================================
// 二、确定性
// ===========================================================================

Check("确定性：同 seed 同 bot 两次跑 → 终局哈希一致", () => {
  for (const [level, seed, bot] of [["A1", 5, "Skilled"], ["A4", 4, "Random"], ["A5", 2, "Skilled"]]) {
    const a = RunBotGame({ level, seed, bot });
    const b = RunBotGame({ level, seed, bot });
    Eq(HashState(a.state), HashState(b.state), `${level} ${bot} 终局哈希`);
  }
});

Check("确定性：动作序列重放 + 存档读档续跑 = 一次跑通", () => {
  const run = RunBotGame({ level: "A3", seed: 5, bot: "Skilled" });
  let replay = CreateGame("A3", 5);
  const half = Math.floor(run.actions.length / 2);
  for (let i = 0; i < half; i += 1) replay = Step(replay, run.actions[i]).state;
  let resumed = DeserializeState(SerializeState(replay));      // 中盘存档
  for (let i = half; i < run.actions.length; i += 1) {
    replay = Step(replay, run.actions[i]).state;
    resumed = Step(resumed, run.actions[i]).state;
  }
  Eq(HashState(replay), HashState(run.state), "重放与原跑不一致");
  Eq(HashState(resumed), HashState(run.state), "读档续跑与一次跑通不一致");
});

// ===========================================================================
// 三、乱打模糊
// ===========================================================================

Check("模糊：乱打 bot 整局零崩溃、资源有界、账本单调", () => {
  const cases = [["A1", 11], ["A2", 12], ["A3", 13], ["A4", 11], ["A5", 12]];
  for (const [level, seed] of cases) {
    let lastLedger = { civCaptured: 0, civDead: 0, housesBurned: 0, grainSeized: 0 };
    const { state } = RunBotGame({ level, seed, bot: "Random", onStep: (st) => {
      Ok(st.resources.ammo >= 0 && st.resources.ammo <= CFG.ammoMax, `弹药越界 ${st.resources.ammo}`);
      for (const key of Object.keys(st.ledger)) {
        Ok(st.ledger[key] >= lastLedger[key], `账本回落：${key}`);
        Ok(st.ledger[key] >= 0, `账本为负：${key}`);
      }
      lastLedger = { ...st.ledger };
      for (const unit of AllyUnits(st).concat(EnemyUnits(st))) {
        Ok(unit.hp > 0 && unit.hp <= UnitDef(unit).hp, `HP 越界 ${unit.id}:${unit.hp}`);
        Ok(unit.mp >= 0, `MP 为负 ${unit.id}`);
        Ok(unit.breath >= 0, `憋闷为负 ${unit.id}`);
      }
      for (const civ of AllCivs(st)) {
        Ok(civ.panic >= 0, `恐慌为负 ${civ.id}`);
        Ok(["village", "cell", "lost"].includes(civ.loc), `群众位置非法 ${civ.loc}`);
      }
      // 群众守恒：保全 + 被抓 + 罹难 = 总批数
      Eq(CivSafeCount(st) + st.ledger.civCaptured + st.ledger.civDead, CivTotal(st), "群众批数不守恒");
      for (const key of SortedKeys(st.map.hexes)) {
        Ok(st.map.hexes[key].traces <= CFG.tracesMax, `痕迹越界 ${key}`);
      }
      Ok(PopTotal(st) >= 0 && GrainTotal(st) >= 0, "资源为负");
    } });
    Ok(state.result, `${level} seed${seed} 乱打未跑到终局`);
  }
});

// ===========================================================================
// 四、五幕各自可通关 + 策略排序红线
// ===========================================================================

const rankSeeds = [1, 2, 3, 4, 5, 6, 7, 8];
const rank = {};
for (const level of acts) {
  rank[level] = {};
  for (const bot of ["Skilled", "Turtle", "Rambo"]) {
    rank[level][bot] = rankSeeds.map((seed) => RunBotGame({ level, seed, bot }).state);
  }
}

Check("战役：五幕各自可通关（会玩 bot 在每一幕都有 ≥6/8 个 seed 通关）", () => {
  for (const level of acts) {
    const wins = rank[level].Skilled.filter((state) => state.result.won).length;
    Ok(wins >= 6, `${level}：会玩只通关 ${wins}/8`);
  }
});

Check("排序红线：会玩 > 缩头 且 会玩 > 莽撞（胜负 + 数值分双排序，逐幕）", () => {
  for (const level of acts) {
    const score = (states) => [
      states.filter((state) => state.result.won).length,
      states.reduce((sum, state) => sum + state.result.breakdown.total, 0),
    ];
    const skilled = score(rank[level].Skilled);
    for (const rival of ["Turtle", "Rambo"]) {
      const other = score(rank[level][rival]);
      const better = skilled[0] > other[0] || (skilled[0] === other[0] && skilled[1] > other[1]);
      Ok(better, `${level}：Skilled(胜${skilled[0]},分${skilled[1]}) 未压过 ${rival}(胜${other[0]},分${other[1]})`);
    }
  }
});

Check("排序红线：缩头永远拿不到甲乙；莽撞在第二幕起必败", () => {
  for (const level of acts) {
    for (const state of rank[level].Turtle) {
      Ok(!state.result.won || ["丙", "丁"].includes(state.result.grade),
        `${level}：Turtle 评到 ${state.result.grade}`);
    }
  }
  for (const level of ["A2", "A3", "A4", "A5"]) {
    for (const state of rank[level].Rambo) {
      Ok(!state.result.won, `${level}：Rambo 竟然赢了（${state.result.grade}）`);
    }
  }
});

Check("双时钟：纯躲一次也逼不退（第一至三幕）且永远赢不了；会玩能在半数以上 seed 把敌逼退", () => {
  // 第四幕起敌人自己带烟与水，反地道作业会自耗行动力池（烟 -3 / 水 -3 / 爆 -4 / 攻入 -4）——
  // 那是敌人自己花的钱，不是白送给玩家的；纯躲即使把敌熬走也照样输（排序红线已锁）。
  for (const level of ["A1", "A2", "A3"]) {
    for (const state of rank[level].Turtle) {
      Ok(!state.wave.expelled, `${level}：纯躲不该把敌逼退`);
    }
  }
  for (const level of acts) {
    for (const state of rank[level].Turtle) {
      Ok(!state.result.won || ["丙", "丁"].includes(state.result.grade), `${level}：纯躲评到 ${state.result.grade}`);
    }
  }
  // 纯躲连池都耗不动（扑空衰减要靠「藏干净」换，缩头流留着东西给敌人搜，敌人就有事干）。
  // **只断言第一、二幕**：第三幕起敌自带工兵，爆破/刨口的自耗是敌人自己花的钱，
  // 那笔账不该算作「纯躲把敌人熬走了」——纯躲照样一次也逼不退（上面那条断言管着）。
  for (const level of ["A1", "A2"]) {
    for (const state of rank[level].Turtle) {
      Ok(state.wave.pool > 0, `${level}：纯躲不该把敌行动力池耗到见底（实得 ${state.wave.pool}）`);
    }
  }
  // 会玩要把池打到见底（打到 ≤0 即算；能不能在硬上限之前收到「收队」横幅，取决于还剩几回合）
  for (const level of ["A3", "A4", "A5"]) {
    const drained = rank[level].Skilled.filter((state) => state.wave.expelled || state.wave.pool <= 0).length;
    Ok(drained * 2 >= rankSeeds.length, `${level}：会玩只把池打到见底 ${drained}/${rankSeeds.length}`);
  }
});

// ===========================================================================
// 五、新增承重墙回归（本轮 R3：先红后绿，每条都能单独变红）
// ===========================================================================

Check("R3-1：unlocks 过滤真的生效——第一幕挖不了连通段、开不了口、修不了设施", () => {
  const state = CreateGame("A1", 1);
  PutUnder(state, "u1", "3,0");
  const actions = LegalActions(state, "u1");
  for (const type of ["Dig", "DigEntrance", "DigFacility", "DigDoor", "Disguise", "GuideCivs", "Ambush", "Attack"]) {
    Ok(!actions.some((a) => a.type === type), `第一幕不该出现 ${type}`);
    Ok(!ActionUnlocked(state, type), `第一幕不该解锁 ${type}`);
  }
  // 直接下令也必须被拒，且理由要说清「这一幕还没到」
  const denied = PerformAction(state, { type: "Dig", unit: "u1", target: "4,-1" });
  Ok(denied.illegal && denied.illegal.includes("尚未开放"), `拒绝理由不合格：${denied.illegal}`);
  Eq(HashState(denied.state), HashState(state), "被拒的动作污染了状态");
  // 三个地窖必须互不相连（这就是第一幕的全部困境）
  Eq(Object.keys(state.tunnels.edges).length, 0, "第一幕的地窖不该有任何连通段");
  Eq(LargestNetworkSize(state), 1, "第一幕最大连通块应为 1 格");
  // 第二幕必须真的能挖
  let a2 = CreateGame("A2", 1);
  PutUnder(a2, "u1", "3,0");
  Ok(LegalActions(a2, "u1").some((a) => a.type === "Dig"), "第二幕应能挖连通段");
  a2 = Step(a2, { type: "Dig", unit: "u1", target: "3,1" }).state;    // 挖出一个还没有口的新格
  Ok(a2.tunnels.cells["3,1"], "第二幕应能挖出新地道格");
  PutUnder(a2, "u2", "3,1");
  Ok(LegalActions(a2, "u2").some((a) => a.type === "DigEntrance"), "第二幕应能在新格上开口");
  Ok(LegalActions(a2, "u2").some((a) => a.type === "DigFacility" && a.facility === "storage"), "第二幕应能修储粮洞");
  Ok(!LegalActions(a2, "u2").some((a) => a.type === "DigFacility" && a.facility === "fightpost"),
    "第二幕还不该能修射击孔（那是第三幕的事）");
});

Check("R3-2：地道里的群众没有单位带路就动不了（GuideCivs 必须同格且是主动作）", () => {
  let state = SurgeryGame("A2", 1);
  PutCiv(state, "c1", "4,0");            // 人窖甲里放一批老弱
  PutUnder(state, "u1", "3,0");          // 民兵在另一个窖，隔着没挖通的地
  Ok(!LegalActions(state, "u1").some((a) => a.type === "GuideCivs"), "不同格不该能带路");
  Ok(PerformAction(state, { type: "GuideCivs", unit: "u1", to: "4,0" }).illegal, "不同格带路应被拒");
  // 把民兵挪到群众那一格：先挖通 + 走过去
  state = SurgeryGame("A2", 1);
  PutCiv(state, "c1", "4,0");
  PutUnder(state, "u1", "3,0");
  state = Step(state, { type: "Dig", unit: "u1", target: "4,0" }).state;   // 村庄段 1 进度，一次挖通
  Ok(state.tunnels.edges[EdgeKey("3,0", "4,0")], "村庄段应一次挖通");
  state.units.u1.acted = false;
  state = Step(state, { type: "Move", unit: "u1", path: ["4,0"] }).state;
  const guide = LegalActions(state, "u1").filter((a) => a.type === "GuideCivs");
  Ok(guide.length, "同格之后应能带路");
  Ok(guide.every((a) => a.to !== "4,0"), "带路目的地不该是原地");
  const before = state.civs.c1.at;
  state = Step(state, guide.find((a) => a.to === "3,0")).state;
  Eq(state.civs.c1.at, "3,0", "群众应被带到目的地");
  Ok(state.civs.c1.at !== before);
  Eq(state.units.u1.pos, "3,0", "带路的单位要跟着一起走");
  Eq(state.units.u1.acted, true, "带路是主动作");
  // 速度：老弱一回合只走 1 格（哪怕单位 MP 够）
  Eq(CFG.civ.speed.old, 1);
  Eq(CFG.civ.speed.wounded, 1);
  Ok(CFG.civ.speed.young > CFG.civ.speed.old, "青壮应比老弱快");
});

Check("R3-3：带路批数有上限（联络员 3 / 民兵 2 / 游击 1），牲口槽口 +1", () => {
  Eq(CFG.civ.guideCap.runner, 3);
  Eq(CFG.civ.guideCap.militia, 2);
  Eq(CFG.civ.guideCap.guerrilla, 1);
  // 用「满配继承档」开局：默认继承档只有三格（跳过前两幕的代价），带路断言要在完整的网上做
  let state = SurgeryGame("A3", 1, { carry: BuildFullCarry("A3") });
  for (const id of ["c1", "c2", "c3", "c4", "c5"]) PutCiv(state, id, "4,0");
  PutUnder(state, "u4", "4,0");                        // u4 = 民兵（A3 编成：u1~u3 民兵、u4 游击、u5 联络员）
  const guerrilla = AllyUnits(state).find((u) => u.type === "guerrilla");
  const runner = AllyUnits(state).find((u) => u.type === "runner");
  PutUnder(state, guerrilla.id, "4,0");
  const gAction = LegalActions(state, guerrilla.id).find((a) => a.type === "GuideCivs");
  Ok(gAction, "游击班也该能带路");
  Eq(gAction.count, CFG.civ.guideCap.guerrilla, "游击班一次只带 1 批");
  const after = Step(state, gAction).state;
  Eq(CivsInCell(after, gAction.to).length, 1, "游击班带走的批数超了");
  // 联络员一次 3 批
  let s2 = SurgeryGame("A3", 1, { carry: BuildFullCarry("A3") });
  s2.tunnels.cells["3,1"].facility = "shelter";        // 隔壁修成藏人室，铺位才装得下 3 批
  for (const id of ["c1", "c2", "c3", "c4", "c5"]) PutCiv(s2, id, "4,0");
  PutUnder(s2, runner.id, "4,0");
  const rAction = LegalActions(s2, runner.id).find((a) => a.type === "GuideCivs" && a.to === "3,1");
  Ok(rAction, "联络员应能把群众带进隔壁藏人室");
  Eq(rAction.count, CFG.civ.guideCap.runner, "联络员一次应带 3 批");
  const afterRunner = Step(s2, rAction).state;
  Eq(CivsInCell(afterRunner, "3,1").length, CFG.civ.guideCap.runner, "联络员带走的批数不对");
  Eq(CivsInCell(afterRunner, "4,0").length, 2, "剩下的批应留在原地——一次带不完就得再跑一趟");
  // 走廊（非藏人室）铺位只有 2：带不动 3 批就是带不动
  let s3 = SurgeryGame("A3", 1, { carry: BuildFullCarry("A3") });
  for (const id of ["c1", "c2", "c3"]) PutCiv(s3, id, "4,0");
  PutUnder(s3, runner.id, "4,0");
  Ok(!LegalActions(s3, runner.id).some((a) => a.type === "GuideCivs" && a.to === "3,1"),
    "走廊只有 2 个铺位，3 批带不过去");
});

Check("R3-4：无人带路 → 恐慌积累 → 满 3 冲出地面；地面有敌当场被抓", () => {
  let state = SurgeryGame("A2", 1);
  PutCiv(state, "c1", "4,0");
  Eq(state.civs.c1.panic, 0);
  // 没有单位陪着：扫荡期每回合 +1
  for (let i = 0; i < 2; i += 1) state = EndTurn(state).state;
  Ok(state.civs.c1.panic >= 2, `两回合无人照应后恐慌应 ≥2，实得 ${state.civs.c1.panic}`);
  // 敌人蹲在口上，恐慌满就冲出去撞枪口
  MakeColumn(state, "tCamp", ["inf"], "4,0");
  let out = null;
  for (let i = 0; i < 3 && !out; i += 1) {
    const outcome = EndTurn(state);
    state = outcome.state;
    if (outcome.events.some((event) => event.kind === "ledger" && event.text.includes("被抓"))) out = state.meta.turn;
  }
  Ok(out !== null, "恐慌满了却没有冲出地面");
  Eq(state.civs.c1.loc, "lost", "冲出去撞上敌人应被抓");
  Eq(state.ledger.civCaptured, 1, "被抓应入代价簿");
  // 同格有我方单位 → 恐慌不再涨，还会回落
  let calm = SurgeryGame("A2", 1);
  PutCiv(calm, "c1", "4,0", 2);
  PutUnder(calm, "u1", "4,0");
  calm = EndTurn(calm).state;
  Ok(calm.civs.c1.panic < 2, `有人守着恐慌应回落，实得 ${calm.civs.c1.panic}`);
  // 第一幕不积恐慌（洞不通，人没处去——这一幕的困境不是恐慌，是没有出路）
  let a1 = SurgeryGame("A1", 1);
  PutCiv(a1, "c1", "4,0");
  for (let i = 0; i < 3; i += 1) a1 = EndTurn(a1).state;
  Eq(a1.civs.c1.panic, 0, "第一幕不该积恐慌");
  Eq(a1.civs.c1.loc, "cell", "第一幕的群众不该自己冲出去");
});

Check("R3-5：射击孔「打一枪换一个地方」——同口连开被锁定（伤害降为 1 且该格被敌记住）", () => {
  let state = SurgeryGame("A3", 1);
  state.tunnels.cells["4,-1"].facility = "fightpost";        // A3 起始网里的一格改成射击孔
  PutUnder(state, "u1", "4,-1");
  MakeColumn(state, "tShoot", ["inf", "inf"], "5,-1");        // 敌在射击孔旁边的农田（无掩护，好算伤害）
  const first = LegalActions(state, "u1").find((a) => a.type === "Attack" && a.fightpost);
  Ok(first, "射击孔应能开火");
  Ok(!first.locked, "第一枪不该被标为锁定");
  let outcome = Step(state, first);
  state = outcome.state;
  const hit1 = outcome.events.find((e) => e.kind === "combat");
  Ok(hit1.text.includes("伤 3"), `第一枪应打满 3 伤：${hit1.text}`);
  // 下一回合同一个孔再打：被咬住
  state.meta.turn += 1;
  state.units.u1.acted = false;
  state.units.u1.mp = UnitDef(state.units.u1).mp;
  const again = LegalActions(state, "u1").find((a) => a.type === "Attack" && a.fightpost);
  Ok(again && again.locked, "同孔连开应被标记 locked");
  outcome = Step(state, again);
  state = outcome.state;
  const hit2 = outcome.events.find((e) => e.kind === "combat");
  Ok(hit2.text.includes(`伤 ${CFG.fightpost.lockedDamage}`), `被锁定的一枪应只伤 1：${hit2.text}`);
  Ok((state.map.hexes["4,-1"].alertedUntil || 0) >= state.meta.turn, "被锁定的射击孔格应获「敌已警戒」");
  Ok(outcome.events.some((e) => e.kind === "fightpost" && e.text.includes("换一个地方")), "应提示换地方");
  // 隔两回合再打就不算连开
  state.meta.turn += 3;
  state.units.u1.acted = false;
  state.units.u1.mp = UnitDef(state.units.u1).mp;
  const cooled = LegalActions(state, "u1").find((a) => a.type === "Attack" && a.fightpost);
  Ok(cooled && !cooled.locked, "隔了两回合应重新算「换过地方」");
  // 换孔计数（勋记「换地方」的判据）
  Eq(state.score.fightpostsUsed.length, 1, "只在一个孔打过");
});

Check("R3-6：水只往同高或更低处漫；隔断门与翻板挡得住", () => {
  // 用「满配继承档」开局：默认继承档没有西岗那一段（跳过前三幕的代价），断言要针对完整的高低差网
  let state = SurgeryGame("A4", 1, { carry: BuildFullCarry("A4") });
  Eq(ElevOf(state, "5,2"), 0, "东洼口应是高程 0");
  Eq(ElevOf(state, "4,2"), 0, "东洼巷应是高程 0");
  Eq(ElevOf(state, "3,2"), 1, "村南应是高程 1");
  Eq(ElevOf(state, "2,2"), 2, "西岗应是高程 2");
  state.tunnels.entrances["5,2"].known = true;
  state.wave.smokeCharges = 0;                                // 逼 AI 选灌水
  state.tunnels.cells["5,2"].grain = 6;                       // 低处的粮：会被泡毁
  MakeColumn(state, "tFlood", ["sapper", "inf"], "4,4");      // 工兵贴着东洼口
  state.units[state.enemy.columns[0].unitIds[0]].pos = "5,2";
  state.units[state.enemy.columns[0].unitIds[1]].pos = "5,2";
  let outcome = EndTurn(state);
  state = outcome.state;
  Ok(state.enemy.pendingOps.some((op) => op.kind === "flood"), "未宣布灌水");
  const seizedBefore = state.ledger.grainSeized;
  outcome = EndTurn(state);
  state = outcome.state;
  Ok(state.tunnels.cells["5,2"].water > 0, "口下格未进水");
  state = EndTurn(state).state;
  state = EndTurn(state).state;
  Ok(state.tunnels.cells["4,2"].water > 0, "同高的相邻格应被淹");
  Eq(state.tunnels.cells["3,2"].water, 0, "水不该爬到高一级的格子上");
  Eq(state.tunnels.cells["2,2"].water, 0, "西岗（高程 2）永远不该进水");
  Ok(state.ledger.grainSeized > seizedBefore, "被淹的储粮洞应把泡毁的粮记进代价簿");
});

Check("R3-7：翻板拦敌一回合、挡烟挡水；用过要重修", () => {
  let state = SurgeryGame("A3", 1);
  state.tunnels.cells["3,0"].facility = "trapdoor";
  state.tunnels.cells["3,0"].trapReady = true;
  state.tunnels.entrances["3,0"].known = true;
  MakeColumn(state, "tTrap", ["sapper", "inf"], "3,0");
  let outcome = EndTurn(state);
  state = outcome.state;
  Ok(state.enemy.pendingOps.length, "敌未宣布任何作业");
  const poolBefore = state.wave.pool;
  outcome = EndTurn(state);
  state = outcome.state;
  Ok(outcome.events.some((e) => e.kind === "op" && e.text.includes("翻板")), "翻板未拦住这次作业");
  Ok(state.tunnels.entrances["3,0"], "被翻板拦下时入口应保住");
  Eq(state.tunnels.cells["3,0"].trapReady, false, "翻板用过应落下");
  Ok(state.wave.pool <= poolBefore, "敌白跑一趟应扣池");
  // 重修：一次 2 进度
  PutUnder(state, "u1", "3,0");
  const rearm = LegalActions(state, "u1").find((a) => a.type === "DigFacility" && a.rearm);
  Ok(rearm, "落下的翻板应能重修");
  state = Step(state, rearm).state;
  Eq(state.tunnels.cells["3,0"].trapReady, true, "重修后翻板应支好");
  // 挡烟：翻板压着的格烟灌不进来
  let smoke = SurgeryGame("A4", 1);
  smoke.tunnels.cells["3,1"].facility = "trapdoor";
  smoke.tunnels.cells["3,1"].trapReady = true;
  smoke.tunnels.smokeOps.push({ origin: "3,0", spreadLeft: 3, lingerLeft: 2, cells: ["3,0"], front: [{ key: "3,0", dir: -1 }], queued: [] });
  for (let i = 0; i < 4; i += 1) smoke = EndTurn(smoke).state;
  Eq(smoke.tunnels.cells["3,1"].smoke, 0, "完好的翻板应挡住烟");
});

Check("R3-8：烟在直巷子一回合一格，拐弯要多花一回合", () => {
  // A4 主干：3,0 → 4,-1 → 4,0 → 3,1（3,0→4,-1 与 4,-1→4,0 不同向 = 一个弯）
  // A4 主干：3,0 →(方向1) 4,-1 →(方向5) 4,0 是一个弯；另接一条 4,-1 →(方向1) 5,-2 的直巷作对照
  let state = SurgeryGame("A4", 1);
  state.tunnels.cells["5,-2"] = { facility: null, grain: 0, smoke: 0, water: 0, trapReady: false,
    fightpostHeat: 0, fightpostLastTurn: 0, fightpostKnown: false };
  state.tunnels.edges[EdgeKey("4,-1", "5,-2")] = { door: null };
  state.tunnels.smokeOps.push({ origin: "3,0", spreadLeft: 6, lingerLeft: 2, cells: ["3,0"],
    front: [{ key: "3,0", dir: -1 }], queued: [] });
  state = EndTurn(state).state;
  Ok(state.tunnels.cells["4,-1"].smoke > 0, "第一步（原点向外）应立刻蔓延");
  Eq(state.tunnels.cells["4,0"].smoke, 0, "拐弯的那一格第一回合不该到");
  state = EndTurn(state).state;
  Ok(state.tunnels.cells["5,-2"].smoke > 0, "直巷子应一回合走一格");
  Eq(state.tunnels.cells["4,0"].smoke, 0, "拐弯那一格第二回合仍不该到（拐弯要多花一回合）");
  state = EndTurn(state).state;
  Ok(state.tunnels.cells["4,0"].smoke > 0, "拐弯的那一格应在多一回合后到达");
});

Check("R3-9：伪装口抬高被搜出的门槛；水井口群众上不去", () => {
  const state = CreateGame("A2", 1);
  const plain = { conceal: 3, expose: 0, known: false, sealed: false, disguise: null };
  Eq(EntranceThreshold(plain), 9, "无伪装的村庄口阈值应是 9");
  Eq(EntranceThreshold({ ...plain, disguise: "stove" }), 12, "灶台口应 +1 隐蔽");
  Eq(EntranceThreshold({ ...plain, disguise: "well" }), 15, "水井口应 +2 隐蔽");
  Eq(EntranceThreshold({ ...plain, disguise: "trough" }), 9, "牲口槽不加隐蔽");
  Eq(disguiseDefinitions.well.civPassable, false, "水井口群众应过不去");
  Eq(disguiseDefinitions.trough.guideBonus, 1, "牲口槽应让带路多带 1 批");
  // 真的做一个伪装口
  let s = CloneState(state);
  s.units.u1.layer = "surface";
  s.units.u1.pos = "3,0";
  const act = LegalActions(s, "u1").find((a) => a.type === "Disguise" && a.disguise === "stove");
  Ok(act, "村庄格的口应能做成灶台");
  s = Step(s, act).state;
  Eq(s.tunnels.entrances["3,0"].disguise, "stove", "伪装未落地");
  Eq(EntranceThreshold(s.tunnels.entrances["3,0"]), 12, "伪装后阈值未抬高");
  // 恐慌冲出地面时，水井口不算出路
  let well = SurgeryGame("A2", 1);
  well.tunnels.entrances["4,0"].disguise = "well";
  well.tunnels.entrances["2,1"].sealed = true;
  well.tunnels.entrances["3,0"].sealed = true;
  PutCiv(well, "c1", "4,0", CFG.civ.panicThreshold);
  const outcome = EndTurn(well);
  Ok(outcome.events.some((e) => e.kind === "forcedOut" || e.kind === "ledger"),
    "恐慌满了应有出洞或被抓事件");
  Ok(outcome.state.map.hexes["4,0"].traces > 0, "水井上不去，只能就地刨土钻出（应留痕迹）");
});

Check("R3-10：第一幕注定要付代价——代价簿结构性不为零", () => {
  const level = GetLevel("A1");
  const grain = level.villages[0].grainOpen + CFG.quietGrainPerVillage * (level.sweepStartTurn - 1);
  const storageRoom = level.storageCap;
  Ok(grain > storageRoom, `第一幕的粮（${grain}）必须装不进唯一的粮窖（${storageRoom}）`);
  const civSlots = level.tunnels.facilities.filter(([, f]) => f === "shelter").length * level.shelterCap;
  const civNeed = level.civBatches.reduce((sum, b) => sum + b.count * CFG.civ.slots[b.kind], 0);
  Ok(civNeed > civSlots, `第一幕的群众铺位（需 ${civNeed}，有 ${civSlots}）必须不够`);
  // 实测：任何打法（含最优 bot）代价簿都不为零
  for (const bot of ["Skilled", "Turtle", "Random"]) {
    for (let seed = 1; seed <= 4; seed += 1) {
      const { state } = RunBotGame({ level: "A1", seed, bot });
      const total = Object.values(state.ledger).reduce((sum, v) => sum + v, 0);
      Ok(total > 0, `A1 seed${seed} ${bot}：代价簿竟然全空`);
      Ok(state.ledger.grainSeized >= grain - storageRoom,
        `A1 seed${seed} ${bot}：被夺的粮少于结构下限 ${grain - storageRoom}`);
    }
  }
  // 终局复盘必须点破「洞不通，人就没处去」
  const { state } = RunBotGame({ level: "A1", seed: 1, bot: "Skilled" });
  Ok(state.result.debrief.learned.includes("洞不通"), "第一幕复盘没有点破「洞不通，人就没处去」");
  Ok(state.result.debrief.unlocked.includes("连通"), "第一幕复盘没有交代下一幕解锁了什么");
});

Check("R3-11：群众保全率进终局评定，且群众损失只进代价簿、绝不产生收益", () => {
  const { state } = RunBotGame({ level: "A3", seed: 2, bot: "Skilled" });
  Ok(state.result.civTotal > 0);
  Eq(state.result.civSafe + state.ledger.civCaptured + state.ledger.civDead, state.result.civTotal, "保全率分母不对");
  Eq(state.result.civRatio, Number((state.result.civSafe / state.result.civTotal).toFixed(3)));
  const inflated = CloneState(state);
  for (const civ of Object.values(inflated.civs)) { civ.loc = "lost"; civ.fate = "captured"; }
  inflated.ledger.civCaptured += 99;
  Ok(ComputeBreakdown(inflated, true).total <= ComputeBreakdown(state, true).total,
    "丢光群众反而抬高了数值分——存在奖励路径");
});

Check("R3-12：敌新增两手——刨口（不用工兵）与灌水（要工兵）；翻板与高程各挡一手", () => {
  // 刨口：第二幕起，任何一队围住已知的口，一回合刨掉它
  let state = SurgeryGame("A2", 1);
  state.tunnels.entrances["3,0"].known = true;
  MakeColumn(state, "tDig", ["inf", "inf"], "3,0");
  state = EndTurn(state).state;
  Ok(state.enemy.pendingOps.some((op) => op.kind === "excavate" || op.kind === "breach"),
    `第二幕应能宣布刨口或攻入，实得 ${JSON.stringify(state.enemy.pendingOps)}`);
  // 第一幕没有刨口这一手
  Ok(!GetLevel("A1").enemyOps.includes("excavate"), "第一幕不该有刨口");
  Ok(!GetLevel("A1").enemyOps.includes("smoke"), "第一幕不该有烟攻");
  Ok(GetLevel("A4").enemyOps.includes("flood"), "第四幕应有灌水");
  Ok(GetLevel("A4").enemyOps.includes("smoke"), "第四幕应有烟攻");
});

// ===========================================================================
// 六、R2 承重墙回归（不许回退）
// ===========================================================================

Check("R2 P0-1：挖一段/修一设施 → 同气区各口 +1，开新口 +2；掩土 -2 且每人每局限 3 次", () => {
  let state = SurgeryGame("A2", 1);
  Eq(state.wave.status, "sweep", "外科局应在扫荡期");
  const before = state.tunnels.entrances["3,0"].expose;
  PutUnder(state, "u1", "3,0");
  state = Step(state, { type: "Dig", unit: "u1", target: "4,0" }).state;   // 村庄段一次挖通
  Ok(state.tunnels.edges[EdgeKey("3,0", "4,0")], "村庄段应一次挖通");
  Eq(state.tunnels.entrances["3,0"].expose, before + CFG.exposePerWork, "挖通一段未给同气区的口记豆");
  PutUnder(state, "u2", "3,0");
  const beforeFacility = state.tunnels.entrances["3,0"].expose;
  state = Step(state, { type: "Dig", unit: "u2", target: "3,1" }).state;
  Eq(state.tunnels.entrances["3,0"].expose, beforeFacility + CFG.exposePerWork, "第二段也要记豆");
  PutUnder(state, "u1", "3,1");
  state = Step(state, { type: "DigEntrance", unit: "u1", at: "3,1" }).state;
  Eq(state.tunnels.entrances["3,1"].expose, CFG.exposeNewEntrance, "新开口应自带 +2 豆");
  state.tunnels.entrances["3,0"].expose = 20;
  state.units.u1.layer = "surface"; state.units.u1.pos = "3,0";
  for (let i = 0; i < CFG.coverUsesPerUnit; i += 1) {
    const expose = state.tunnels.entrances["3,0"].expose;
    state.units.u1.acted = false;
    state = Step(state, { type: "CoverTraces", unit: "u1" }).state;
    Eq(state.tunnels.entrances["3,0"].expose, expose - CFG.coverTracesAmount, `第 ${i + 1} 次掩土未减豆`);
  }
  state.units.u1.acted = false;
  Ok(!LegalActions(state, "u1").some((a) => a.type === "CoverTraces"), "掩土次数用尽后不该再出现在合法动作里");
  Ok(PerformAction(state, { type: "CoverTraces", unit: "u1" }).illegal, "第 4 次掩土应被拒绝");
});

Check("R2 P0-3：无风分区憋满 3 回合 → 人被推到地面（不是原地掉血致死）", () => {
  let state = SurgeryGame("A3", 1);
  for (const key of SortedKeys(state.tunnels.entrances)) state.tunnels.entrances[key].sealed = true;
  PutUnder(state, "u1", "3,0");
  const hpBefore = state.units.u1.hp;
  let forced = false;
  for (let i = 0; i < 4 && !forced; i += 1) {
    const outcome = EndTurn(state);
    state = outcome.state;
    forced = outcome.events.some((event) => event.kind === "forcedOut");
  }
  Ok(forced, "憋闷满 3 回合必须被迫出洞");
  Eq(state.units.u1.layer, "surface", "单位应被推到地面");
  Eq(state.units.u1.hp, hpBefore, "被迫出洞不该扣血");
});

Check("R2 P0-4：HideGrain 要求本村格正下方有地道且连着储粮洞", () => {
  const state = CreateGame("A2", 1);
  Ok(!state.tunnels.cells["4,-1"], "4,-1（村北田埂）正下方本不该有地道格");
  const unit = AllyUnits(state).find((u) => u.pos === "4,0");
  Ok(unit, "应有单位站在 4,0");
  // 4,0 下面是人窖（shelter），不是储粮洞 → 不能藏粮
  Ok(!LegalActions(state, unit.id).some((a) => a.type === "HideGrain"), "脚下没有储粮洞就不该能藏粮");
  Ok(PerformAction(state, { type: "HideGrain", unit: unit.id }).illegal, "隔空藏粮应被拒绝");
  // 3,0 下面就是粮窖 → 能藏
  const digger = AllyUnits(state).find((u) => u.pos === "3,0");
  Ok(LegalActions(state, digger.id).some((a) => a.type === "HideGrain"), "粮窖正上方应能藏粮");
  Ok(TunnelGrainTotal(Step(state, { type: "HideGrain", unit: digger.id }).state) > 0, "藏粮应真的入洞");
});

Check("R2 P0-5：同格至多 1 人设伏；伏击后转暴露；连设两回合伤害降为 1 且该格获警戒", () => {
  let state = SurgeryGame("A3", 1);
  state.units.u1.pos = "1,2"; state.units.u1.layer = "surface";     // 西南坟地
  state.units.u2.pos = "1,2"; state.units.u2.layer = "surface";
  state = Step(state, { type: "Ambush", unit: "u1" }).state;
  Ok(!LegalActions(state, "u2").some((a) => a.type === "Ambush"), "同格第二个伏击不该合法");
  Ok(PerformAction(state, { type: "Ambush", unit: "u2" }).illegal, "同格第二个伏击应被拒绝");
  state = EndTurn(state).state;
  Eq(state.units.u1.stance, "ambush", "伏击是持续状态");
  // 连设两回合 → stale
  state.units.u1.acted = false;
  state.units.u1.stance = "normal";
  const again = Pick(LegalActions(state, "u1"), "Ambush");
  Ok(again && again.stale, "第二回合同格设伏应被标记为 stale");
  state = Step(state, again).state;
  Ok((state.map.hexes["1,2"].alertedUntil || 0) >= state.meta.turn, "该格应获「敌已警戒」标记");
  MakeColumn(state, "tStale", ["inf"], "0,1", { target: "v1" });   // 让它朝村里走，必经伏点旁（起手不相邻）
  const outcome = EndTurn(state);
  const hit = outcome.events.find((event) => event.kind === "combat" && event.text.includes("伏击"));
  Ok(hit, `伏击未触发：${outcome.events.map((e) => e.text).join(" / ")}`);
  Ok(hit.text.includes(`伤 ${CFG.staleAmbushDamage}`), `老地方伏击伤害应降为 ${CFG.staleAmbushDamage}：${hit.text}`);
  // 边界：T1 首次设伏不得被误判为老地方
  const fresh = CreateGame("A3", 1);
  Eq(fresh.meta.turn, 1);
  for (const unit of AllyUnits(fresh)) {
    for (const act of LegalActions(fresh, unit.id).filter((a) => a.type === "Ambush")) Ok(!act.stale, "T1 首次设伏被误判为老地方");
  }
});

Check("R2 P0-6：胜负只认洞存粮与群众保全（第三幕：洞里 11 担判负、12 担判胜）", () => {
  const Finish = (tunnelGrain) => {
    let state = CreateGame("A3", 1);
    state.map.villages.v1.grainOpen = 0;
    state.map.villages.v1.organize = 0;            // 关掉平静期自动藏粮，锁死判定口径
    state.wave.status = "sweep";
    state.tunnels.cells["3,0"].grain = tunnelGrain;
    state.meta.turn = GetLevel("A3").maxTurns;
    state.wave.schedule = [];
    state.wave.revenge = null;
    return EndTurn(state).state.result;
  };
  Ok(!Finish(11).won, "洞存粮 11 应判负");
  Ok(Finish(12).won, "洞存粮 12 应判胜");
});

Check("R2 P0-6c：seed 是真变量——12 个 seed 不再逐字节相同", () => {
  for (const level of ["A3", "A5"]) {
    const prints = new Set(); const axes = new Set(); const mixes = new Set(); const arrivals = new Set();
    for (let seed = 1; seed <= 12; seed += 1) {
      const { state } = RunBotGame({ level, seed, bot: "Skilled" });
      prints.add([state.result.grade, state.result.medals.join(""), GrainTotal(state), state.meta.turn,
        state.wave.pool, state.resources.ammo, JSON.stringify(state.ledger), state.wave.withdrawTurn].join("/"));
      axes.add(state.wave.plan.axisId); mixes.add(state.wave.plan.mixId); arrivals.add(state.wave.plan.arriveTurn);
    }
    Ok(prints.size >= 4, `${level}：12 个 seed 只跑出 ${prints.size} 种终局`);
    Ok(axes.size >= 2 && mixes.size >= 2 && arrivals.size >= 2,
      `${level} 排班变量太少：轴线 ${axes.size} / 配比 ${mixes.size} / 到达 ${arrivals.size}`);
  }
});

Check("R2 复验：零地道流必输、复读伏击流拿不到甲", () => {
  const NoDig = (state) => {
    const unit = FirstIdle(state);
    if (!unit) return { type: "EndTurn" };
    const actions = Acts(state, unit);
    return Pick(actions, "Ambush") || Pick(actions, "Hide") || Pick(actions, "Rest") || { type: "Rest", unit: unit.id };
  };
  const spot = "1,2";
  const Spam = (state) => {
    const unit = FirstIdle(state);
    if (!unit) return { type: "EndTurn" };
    const actions = Acts(state, unit);
    if (UnitDef(unit).atk > 0) {
      if (unit.pos !== spot) {
        const move = actions.filter((a) => a.type === "Move").sort((a, b) =>
          HexDistanceKeys(a.path[a.path.length - 1], spot) - HexDistanceKeys(b.path[b.path.length - 1], spot))[0];
        if (move) return move;
      }
      const ambush = Pick(actions, "Ambush");
      if (ambush) return ambush;
    }
    return Pick(actions, "Hide") || Pick(actions, "Rest") || { type: "Rest", unit: unit.id };
  };
  for (const seed of [1, 3, 5, 7]) {
    const noDig = PlayWith("A3", seed, NoDig);
    Ok(noDig.result && !noDig.result.won, `seed${seed}：零地道流竟然赢了（${noDig.result && noDig.result.grade}）`);
    const spam = PlayWith("A3", seed, Spam);
    Ok(spam.result && spam.result.grade !== "甲", `seed${seed}：复读伏击流仍评到 ${spam.result && spam.result.grade}`);
  }
});

/** 「只挖不掩土」流：挖网 + 藏粮 + 藏人，但从不掩土——最常见的新手打法。 */
const DiggerLine = (state) => {
  const unit = FirstIdle(state);
  if (!unit) return { type: "EndTurn" };
  const actions = Acts(state, unit);
  const move = actions.filter((a) => a.type === "Move");
  return Pick(actions, "Dig") || Pick(actions, "DigFacility") || Pick(actions, "DigEntrance")
    || Pick(actions, "UseEntrance", (a) => !a.dive) || Pick(actions, "HideGrain") || Pick(actions, "MoveCivs")
    || (unit.layer === "surface" && move.length ? move[0] : null)
    || Pick(actions, "Rest") || { type: "Rest", unit: unit.id };
};

function ScanOps(level, seeds) {
  const kinds = new Set();
  const ledger = { civCaptured: 0, civDead: 0, housesBurned: 0, grainSeized: 0 };
  for (const seed of seeds) {
    let state = CreateGame(level, seed);
    for (let step = 0; step < 3000 && !state.result; step += 1) {
      const action = DiggerLine(state);
      let outcome = action.type === "EndTurn" ? EndTurn(state) : PerformAction(state, action);
      if (outcome.illegal) { outcome = EndTurn(state); if (outcome.illegal) break; }
      for (const event of outcome.events) {
        if (event.kind !== "op") continue;
        for (const [kind, word] of [["smoke", "烟自"], ["blast", "炸毁"], ["breach", "攻入"],
          ["seal", "填死"], ["excavate", "刨塌"], ["flood", "水自"]]) {
          if (event.text.includes(word)) kinds.add(kind);
        }
      }
      state = outcome.state;
    }
    for (const key of Object.keys(ledger)) ledger[key] = Math.max(ledger[key], state.ledger[key]);
  }
  return { kinds, ledger };
}

const diggerA3 = ScanOps("A3", [1, 2, 3, 4, 5, 6]);
const diggerA4 = ScanOps("A4", [1, 2, 3, 4, 5, 6]);
const diggerA5 = ScanOps("A5", [1, 2, 3, 4, 5, 6]);

Check("R2 P0-2：只挖不掩土 → 敌真的会动手（烟/水/爆破/攻入/刨口/封堵多 seed 实际触发）", () => {
  const all = new Set([...diggerA3.kinds, ...diggerA4.kinds, ...diggerA5.kinds]);
  Ok(all.has("smoke"), `多 seed 未触发烟攻（实得 ${[...all].join("/") || "无"}）`);
  Ok(all.has("blast"), "多 seed 未触发爆破");
  Ok(all.has("seal") || all.has("excavate"), "多 seed 未触发封堵/刨口");
  Ok(all.has("breach"), "多 seed 未触发攻入");
  Ok(diggerA4.kinds.has("flood") || diggerA5.kinds.has("flood"), `第四/五幕未触发灌水（实得 ${[...diggerA4.kinds].join("/")}）`);
});

Check("R2 P1：弹药收支严格为负（缴获补不回消耗）", () => {
  const totalLoot = Object.values(CFG.loot).reduce((sum, value) => sum + value, 0);
  Ok(CFG.loot.inf < 2 * CFG.ammoPerAttack, "打死一个日军班要两枪，缴获不该 ≥2");
  Ok(CFG.loot.puppet < CFG.ammoPerAttack, "打死一个伪军队缴获不该抵得回一枪");
  Ok(totalLoot > 0, "缴获仍应是唯一来源，不能归零");
  for (const seed of [1, 2, 3, 4, 5]) {
    const { state } = RunBotGame({ level: "A3", seed, bot: "Skilled" });
    const kills = state.score.kills;
    const totalKills = kills.inf + kills.puppet + kills.spy + kills.sapper;
    if (totalKills > 0) {
      Ok(state.resources.ammo < GetLevel("A3").ammoStart,
        `seed${seed}：打了 ${totalKills} 个还没净消耗弹药（${state.resources.ammo}）`);
    }
  }
});

Check("R2 P1：代价簿四栏在正常游玩中都会动（不再是三栏恒 0）", () => {
  const moved = { civCaptured: 0, civDead: 0, housesBurned: 0, grainSeized: 0 };
  for (const level of acts) {
    for (const bot of ["Skilled", "Turtle", "Random"]) {
      for (const seed of [1, 2, 3, 4]) {
        const { state } = RunBotGame({ level, seed, bot });
        for (const key of Object.keys(moved)) if (state.ledger[key] > 0) moved[key] += 1;
      }
    }
  }
  for (const scan of [diggerA3, diggerA4, diggerA5]) {
    for (const key of Object.keys(moved)) if (scan.ledger[key] > 0) moved[key] += 1;
  }
  for (const key of ["civCaptured", "housesBurned", "grainSeized"]) {
    Ok(moved[key] > 0, `代价簿 ${key} 在全部对局里一次都没动过`);
  }
  // civDead 只该由「爆破塌方 / 彻底无路可出」造成——用确定性场景锁死，不靠概率
  let state = SurgeryGame("A3", 1);
  state.tunnels.entrances["3,0"].known = true;
  state.tunnels.cells["3,0"].facility = "shelter";
  PutCiv(state, "c1", "3,0");
  PutCiv(state, "c2", "3,0");
  MakeColumn(state, "tBlastCiv", ["sapper", "inf"], "3,0");
  state = EndTurn(state).state;
  state = EndTurn(state).state;
  Ok(state.ledger.civDead >= CFG.blastCivDead,
    `爆破塌方未把藏身群众记入代价簿（civDead=${state.ledger.civDead}）`);
  Ok(state.ledger.civDead <= CFG.blastCivDead,
    "一炮不该抹掉整间藏人室——塌方只压住口子底下那一批，其余的被震到隔壁");
});

Check("R2 P1：同格可攻击 · 民兵开阔地可挖散兵坑 · 石桥可破且破后敌绕行", () => {
  let state = SurgeryGame("A3", 1);
  const guerrilla = AllyUnits(state).find((u) => u.type === "guerrilla");
  MakeColumn(state, "tSame", ["puppet"], guerrilla.pos);
  const shot = LegalActions(state, guerrilla.id).find((a) => a.type === "Attack" && a.sameHex);
  Ok(shot && !PerformAction(state, shot).illegal, "同格敌人必须打得着");
  let open = SurgeryGame("A3", 1);
  open.units.u1.pos = "6,-1";                                     // 开阔地（offset 6,2）
  open.units.u1.layer = "surface";
  const foxhole = LegalActions(open, "u1").find((a) => a.type === "Ambush" && a.site === "foxhole");
  Ok(foxhole, "民兵在开阔地应能挖散兵坑设伏");
  open = Step(open, foxhole).state;
  Eq(open.units.u1.stance, "ambush");
  Ok(open.map.hexes["6,-1"].traces > 0, "挖散兵坑应留下痕迹");
  const g2 = SurgeryGame("A3", 1);
  const guer = AllyUnits(g2).find((u) => u.type === "guerrilla");
  guer.pos = "6,-1"; guer.layer = "surface";
  Ok(!LegalActions(g2, guer.id).some((a) => a.type === "Ambush"), "游击班挖不动散兵坑");
  const level = GetLevel("A3");
  Ok(level.bridgeBreakable, "石桥应可破");
  let bridgeGame = SurgeryGame("A3", 1);
  const bridge = SortedKeys(bridgeGame.map.hexes).find((key) => bridgeGame.map.hexes[key].bridge && bridgeGame.map.hexes[key].road);
  bridgeGame.units.u1.pos = bridge;
  bridgeGame.units.u1.layer = "surface";
  Ok(LegalActions(bridgeGame, "u1").some((a) => a.type === "BreakRoad" && a.bridge), "石桥应能 BreakRoad");
  bridgeGame.map.hexes[bridge].roadBroken = true;
  const path = EnemyPath(bridgeGame, level.exitKeys[0], "3,0");
  Ok(path && path.length && !path.includes(bridge), "桥断后仍应能绕到村里，且不再经过断桥");
});

Check("反地道：烟攻先电报后点烟，蔓延被关门阻断", () => {
  let state = SurgeryGame("A4", 1);
  state.tunnels.entrances["3,0"].known = true;
  state.tunnels.edges[EdgeKey("3,0", "4,-1")].door = "closed";      // 关门隔离主干
  MakeColumn(state, "tSmoke", ["sapper", "inf"], "3,0");
  let outcome = EndTurn(state);
  state = outcome.state;
  Ok(state.enemy.pendingOps.some((op) => op.kind === "smoke"), `未宣布烟攻：${JSON.stringify(state.enemy.pendingOps)}`);
  Ok(outcome.events.some((event) => event.kind === "telegraph" && event.visible), "烟攻电报应可见");
  const chargesBefore = state.wave.smokeCharges;
  const poolBefore = state.wave.pool;
  outcome = EndTurn(state);
  state = outcome.state;
  Eq(state.wave.smokeCharges, chargesBefore - 1, "烟具未扣");
  Ok(state.wave.pool <= poolBefore - CFG.pool.smokeSelfCost, "烟攻未自耗行动力池");
  Ok(state.tunnels.cells["3,0"].smoke > 0, "口下格未起烟");
  state = EndTurn(state).state;
  state = EndTurn(state).state;
  Eq(state.tunnels.cells["4,-1"].smoke, 0, "关闭的隔断门没能挡烟");
});

Check("反地道：爆破毁口并波及格内单位", () => {
  let state = SurgeryGame("A4", 1);
  state.wave.smokeCharges = 0;
  state.wave.floodCharges = 0;
  state.tunnels.entrances["3,0"].known = true;
  PutUnder(state, "u1", "3,0");
  MakeColumn(state, "tBlast", ["sapper", "inf"], "3,0");
  state = EndTurn(state).state;
  Ok(state.enemy.pendingOps.some((op) => op.kind === "blast"), `未宣布爆破：${JSON.stringify(state.enemy.pendingOps)}`);
  state = EndTurn(state).state;
  Ok(!state.tunnels.entrances["3,0"], "爆破后入口应被摧毁");
  Eq(state.units.u1.hp, unitDefinitions.militia.hp - CFG.blastDamage, "爆破波及伤害不对");
});

Check("反地道：攻入遇驻守 → 敌折一班且中止；无驻守 → 内容进账本", () => {
  let state = SurgeryGame("A3", 1);
  state.tunnels.entrances["3,0"].known = true;
  PutUnder(state, "u1", "3,0");
  MakeColumn(state, "tBreach", ["inf", "inf"], "3,0");
  state = EndTurn(state).state;
  Ok(state.enemy.pendingOps.some((op) => op.kind === "breach"), `未宣布攻入：${JSON.stringify(state.enemy.pendingOps)}`);
  const enemiesBefore = EnemyUnits(state).length;
  state = EndTurn(state).state;
  Eq(EnemyUnits(state).length, enemiesBefore - 1, "驻守未折敌一班");
  Ok(state.tunnels.entrances["3,0"] && !state.tunnels.entrances["3,0"].sealed, "驻守成功后入口应保住");
  // 无驻守
  state = SurgeryGame("A3", 1);
  state.tunnels.entrances["3,0"].known = true;
  state.tunnels.cells["3,0"].grain = 3;
  PutCiv(state, "c1", "3,0");
  PutCiv(state, "c2", "3,0");
  MakeColumn(state, "tBreach2", ["inf", "inf"], "3,0");
  const seizedBefore = state.ledger.grainSeized;
  state = EndTurn(state).state;
  state = EndTurn(state).state;
  Ok(!state.tunnels.entrances["3,0"], "无驻守攻入应毁口");
  Ok(state.ledger.grainSeized >= seizedBefore + 3, "洞藏粮应被夺进账本");
  Ok(state.ledger.civCaptured >= 2, `藏身群众应被捕进账本：实际 ${state.ledger.civCaptured}`);
});

Check("反地道：封堵（第一幕兜底）先电报后填死", () => {
  let state = SurgeryGame("A1", 1);
  state.tunnels.entrances["2,1"].known = true;
  MakeColumn(state, "tSeal", ["puppet"], "2,1");
  state = EndTurn(state).state;
  Ok(state.enemy.pendingOps.some((op) => op.kind === "seal"), `未宣布封堵：${JSON.stringify(state.enemy.pendingOps)}`);
  state = EndTurn(state).state;
  Ok(state.tunnels.entrances["2,1"].sealed, "封堵未生效");
});

Check("憋闷链：通气孔被烟熏后分区开始积憋闷", () => {
  let state = SurgeryGame("A4", 1);
  for (const key of SortedKeys(state.tunnels.entrances)) state.tunnels.entrances[key].sealed = true;
  state.tunnels.cells["3,0"].facility = "vent";
  state.tunnels.vents["3,0"] = { expose: 0, known: false, smoked: false };
  PutUnder(state, "u1", "3,0");
  state = EndTurn(state).state;
  Eq(state.units.u1.breath, 0, "通气孔完好时不应憋闷");
  state.tunnels.smokeOps.push({ origin: "3,0", spreadLeft: 0, lingerLeft: 99, cells: ["3,0"], front: [], queued: [] });
  state = EndTurn(state).state;
  Ok(state.units.u1.breath > 0, "通气孔被熏后应开始积憋闷");
});

// ===========================================================================
// 七、佯动木偶化 + 预算比率 + 账本红线
// ===========================================================================

Check("佯动木偶化：仅置信 1 噪音 → 敌纵队逐回合路径与基线一致", () => {
  const Trace = (withNoise) => {
    let state = CreateGame("A3", 2);
    const positionsPerTurn = [];
    for (let i = 0; i < 8; i += 1) {
      if (withNoise) RecordSighting(state, "0,8", 1);      // 远角落的动静：只加嫌疑
      state = EndTurn(state).state;
      positionsPerTurn.push(EnemyUnits(state).map((unit) => `${unit.type}@${unit.pos}`).sort().join("|"));
      if (state.result) break;
    }
    return positionsPerTurn.join("\n");
  };
  Eq(Trace(true), Trace(false), "置信 1 噪音改变了纵队路径");
});

Check("预算比率：各幕「理想全功能网 / 平静期可用单位回合」∈ [1.05, 2.2]", () => {
  const digCrew = (allies) => allies.reduce((sum, ally) => sum + (CFG.digPower[ally.type] || 0), 0);
  // 各幕「理想全功能网」的进度点合计（按该幕解锁的设施与胜负线倒推；写死在这里便于逐幕核对）
  const idealNeed = {
    A2: CFG.dig.segmentVillage * 2 + CFG.dig.segment * 2      // 连通三窖 + 向外延一段
      + CFG.dig.facility * 2 + CFG.dig.entrance * 2 + CFG.dig.disguise * 2,
    A3: CFG.dig.segment * 2 + CFG.dig.facility * 4            // 双射击孔 + 翻板 + 第二储粮洞
      + CFG.dig.entrance + CFG.dig.disguise,
    A4: CFG.dig.segment * 3 + CFG.dig.facility * 5            // 双通气孔 + 双射击孔 + 翻板
      + CFG.dig.door * 3 + CFG.dig.entrance,
    A5: CFG.dig.segment * 5 + CFG.dig.segmentVillage * 2      // 跨村两条主干
      + CFG.dig.facility * 6 + CFG.dig.door * 3 + CFG.dig.entrance * 2,
  };
  for (const id of ["A2", "A3", "A4", "A5"]) {
    const level = GetLevel(id);
    const window = (level.sweepStartTurn - 1) * digCrew(level.allies);
    const ratio = idealNeed[id] / window;
    Ok(ratio >= 1.05 - 1e-9 && ratio <= 2.2 + 1e-9, `${id} 预算比率 ${ratio.toFixed(3)} 出界`);
  }
  // 第一幕连挖都不开放：预算比率无从谈起，这本身就是它的设计
  Eq(GetLevel("A1").unlocks.facilities.length, 0, "第一幕不该能修任何设施");
});

Check("账本红线：只增不减、拒绝负数、不进任何加成路径", () => {
  const state = CreateGame("A3", 6);
  AddLedger(state, "civDead", -5);
  Eq(state.ledger.civDead, 0, "负数进账应被拒绝");
  AddLedger(state, "civDead", 2);
  Eq(state.ledger.civDead, 2);
  const final = rank.A3.Skilled[0];
  const inflated = CloneState(final);
  for (const key of Object.keys(inflated.ledger)) inflated.ledger[key] += 5;
  Ok(ComputeBreakdown(inflated, true).total <= ComputeBreakdown(final, true).total,
    "账本膨胀反而抬高了数值分——存在奖励路径");
});

Check("kills 封顶：超封顶后战果项增量为 0", () => {
  Ok(KillsScore(0) === 0, "零战果应为 0");
  let previous = 0;
  for (let kills = 1; kills <= 30; kills += 1) {
    const score = KillsScore(kills);
    Ok(score >= previous, "战果分应单调不减");
    Ok(score <= 8, "战果分超过封顶");
    previous = score;
  }
  Eq(KillsScore(6), 8, "6 歼即应到顶");
  Eq(KillsScore(30) - KillsScore(6), 0, "封顶后增量应为 0");
  const base = CloneState(rank.A3.Skilled[0]);
  base.score.kills = { inf: 6, puppet: 0, spy: 0, sapper: 0 };
  const capped = CloneState(base);
  capped.score.kills = { inf: 20, puppet: 5, spy: 3, sapper: 2 };
  Eq(ComputeBreakdown(capped, true).kills, ComputeBreakdown(base, true).kills, "breakdown 战果项未封顶");
});

// ===========================================================================
// 八、HUD 数据契约（渲染层按此对接）
// ===========================================================================

Check("HUD 数据：DeriveView 透出幕次/目标进度/新解锁/群众各批状态/终局复盘", () => {
  let state = CreateGame("A4", 3);
  let view = DeriveView(state);
  // 幕次与幕名
  Eq(view.act.id, "A4");
  Eq(view.act.act, 4);
  Eq(view.act.name, "毒烟与水");
  Eq(view.act.lessons.length, 3, "「这一幕你要学会什么」应是三行");
  Ok(view.act.unlocked.length >= 3, "本幕新解锁条目不足");
  Ok(view.newUnlocks === view.act.unlocked || view.newUnlocks.length === view.act.unlocked.length);
  Eq(view.act.nextId, "A5");
  // 幕目标与进度
  Ok(view.objectiveProgress.length >= 3, "幕目标进度行不足");
  for (const row of view.objectiveProgress) {
    Ok(typeof row.have === "number" && typeof row.need === "number" && typeof row.ok === "boolean",
      `目标行字段不全：${JSON.stringify(row)}`);
  }
  // 群众各批状态
  Eq(view.civs.length, CivTotal(state));
  for (const civ of view.civs) {
    Ok(["old", "young", "wounded"].includes(civ.kind));
    Ok(typeof civ.panic === "number" && typeof civ.escorted === "boolean");
    Ok(civ.kindName && civ.panicMax === CFG.civ.panicThreshold);
  }
  Eq(view.civSummary.total, CivTotal(state));
  Eq(view.civSummary.safe, CivSafeCount(state));
  Ok(typeof view.civSummary.unescorted === "number");
  Ok(typeof view.civSummary.forcedOut === "number");
  // 解锁清单与网络摘要
  Ok(view.unlockedActions.includes("DigDoor"), "第四幕应解锁隔断门");
  Ok(view.unlockedFacilities.includes("vent"), "第四幕应解锁通气孔");
  Ok(view.civGuidance === true);
  Ok(typeof view.network.largest === "number" && typeof view.network.villagesLinked === "number");
  Eq(view.debrief, null, "未结算时不该有复盘");
  // 终局复盘三段
  const done = RunBotGame({ level: "A4", seed: 3, bot: "Skilled" }).state;
  view = DeriveView(done);
  Ok(view.debrief && view.debrief.cost && view.debrief.learned && view.debrief.unlocked, "终局复盘三段缺项");
  Ok(view.debrief.ledger && typeof view.debrief.ledger.civCaptured === "number", "复盘应带代价簿快照");
  Ok(view.result.civSafe >= 0 && view.result.civTotal > 0 && view.result.civRatio >= 0, "终局应带群众保全率");
  // 第一幕：不解锁的东西必须在视图里也看得出来
  const a1 = DeriveView(CreateGame("A1", 1));
  Ok(!a1.unlockedActions.includes("Dig"), "第一幕视图不该声称能挖");
  Eq(a1.civGuidance, false, "第一幕不该声称能带路");
});

// ===========================================================================
// 九、页面装配
// ===========================================================================

Check("R5 玩家侧文本：逐幕规则卡 / 名词表 / 战术手册 / 收尾清单 / 续承说明齐全且经 DeriveView 透出", () => {
  for (const act of acts) {
    const level = GetLevel(act);
    Ok((level.ruleCard || []).length >= 20, `${act} 的规则卡太薄（${(level.ruleCard || []).length} 行）`);
    Ok((level.glossary || []).length >= 8, `${act} 的名词表太薄`);
    Ok((level.endgameChecklist || []).length >= 5, `${act} 缺收尾清单——后段空转的意见就是冲它来的`);
    Ok((level.debriefNotes || []).length >= 5, `${act} 缺复盘要点`);
    Ok((level.carryNotes || []).length >= 3, `${act} 缺战役续承说明`);
    Ok((level.exposeNotes || []).length >= 4, `${act} 缺暴露豆速查`);
    Ok((level.actionNotes || []).length >= 18, `${act} 缺完整动作表`);
    Ok((level.enemyUnitNotes || []).length >= 8, `${act} 缺敌军单位速查`);
    Ok((level.medalNotes || []).length >= 4, `${act} 缺勋记说明`);
    Ok((level.campaignNotes || []).length >= 10, `${act} 缺战役全景说明`);
    const book = level.playbook || {};
    for (const key of ["enemy", "civ", "victory", "guard", "beans", "turnByTurn", "map", "units"]) {
      Ok((book[key] || []).length >= 4, `${act} 的战术手册缺「${key}」`);
    }
    // 规则卡必须把本轮三条贯穿规则写清楚（玩家不该只能从源码里知道它们）
    const card = (level.ruleCard || []).join("");
    Ok(card.includes("踩"), `${act} 的规则卡没写「敌踩在格上加暴露」`);
    Ok(card.includes("抓丁"), `${act} 的规则卡没写抓丁的触发源`);
    Ok(card.includes("就地结算"), `${act} 的规则卡没写终局就地结算`);
  }
  const view = DeriveView(CreateGame("A4", 1));
  for (const key of ["ruleCard", "glossary", "endgameChecklist", "debriefNotes", "exposeNotes",
    "campaignNotes", "carryNotes", "actionNotes", "enemyUnitNotes", "disguiseNotes", "medalNotes"]) {
    Ok(Array.isArray(view[key]) && view[key].length > 0, `DeriveView 没透出 ${key}`);
  }
  Ok(view.playbook && Object.keys(view.playbook).length >= 8, "DeriveView 没透出战术手册");
  Ok(view.carry && view.carry.label.includes("继承档"), "DeriveView 没透出本局的续承来源");
  Ok(view.carry.isDefault === true, "未接前作时应标明用的是默认继承档");
});

Check("页面装配：引用存在、importmap 正确、?v= 一致、核心不引表现层", () => {
  const html = Src("index.html");
  Ok(existsSync(here + "Style_Game.css"), "缺 Style_Game.css");
  Ok(existsSync(here + "Script_Main.mjs"), "缺 Script_Main.mjs");
  const versions = [...html.matchAll(/\?v=(\d+)/g)].map((match) => match[1]);
  Ok(versions.length >= 2, "index.html 应带 ?v= 版本号");
  Ok(new Set(versions).size === 1, `?v= 不一致：${versions.join(",")}`);
  const importmap = html.match(/"three":\s*"([^"]+)"/);
  Ok(importmap, "importmap 缺 three 映射");
  Ok(existsSync(here + importmap[1].replace("./", "")), `three 模块不存在：${importmap[1]}`);
  const addons = html.match(/"three\/addons\/":\s*"([^"]+)"/);
  Ok(addons && existsSync(here + addons[1].replace("./", "")), "three/addons/ 路径不存在");
  const coreFiles = ["Script_State.mjs", "Script_Visibility.mjs", "Script_Actions.mjs",
    "Script_EnemyAi.mjs", "Script_Turn.mjs", "Script_Bots.mjs", "Script_AsciiMap.mjs",
    "Data_Rules.mjs", "Data_Levels.mjs"];
  const surfaces = ["Script_Renderer", "Script_Ui", "Script_Main", "Data_Theme", "Data_Keymap"];
  for (const file of coreFiles) {
    const source = Src(file);
    for (const surface of surfaces) {
      Ok(!source.includes(`./${surface}`), `${file} 引用了表现层 ${surface}`);
    }
  }
});

// ===========================================================================
// 五之二、R5 承重墙回归（本轮：先红后绿，每条都能单独变红）
// ===========================================================================

/** 「认真打的新手」：老老实实藏粮 + 转移群众（先伤员老弱），不破路、不掩土、不调度、不带路。 */
function NewbieLine(state) {
  const unit = FirstIdle(state);
  if (!unit) return { type: "EndTurn" };
  const actions = Acts(state, unit);
  return Pick(actions, "MoveCivs", (a) => a.kind === "wounded")
    || Pick(actions, "MoveCivs", (a) => a.kind === "old")
    || Pick(actions, "MoveCivs")
    || Pick(actions, "HideGrain")
    || Pick(actions, "Rest") || { type: "Rest", unit: unit.id };
}

Check("R5 P0-1：第一幕真的把你打疼——窖口阈值、敌占格加压、第六日必然的撬窖", () => {
  const level = GetLevel("A1");
  // ① 逐口阈值覆写（原来村里 9 豆、青纱帐 6 豆，8 回合内数学上到不了）
  const state0 = CreateGame("A1", 1);
  Eq(EntranceThreshold(state0.tunnels.entrances["3,0"]), 4, "村北窖口阈值应为 4");
  Eq(EntranceThreshold(state0.tunnels.entrances["4,0"]), 4, "村南窖口阈值应为 4");
  Eq(EntranceThreshold(state0.tunnels.entrances["2,1"]), 3, "青纱帐窖口阈值应为 3");
  // ② 敌纵队踩在口上 → 该口每回合 +2（不靠翻检，光是踩就踩出来）
  let state = SurgeryGame("A1", 1);
  const before = state.tunnels.entrances["3,0"].expose;
  const stand = MakeColumn(state, "tStand", ["puppet"], "3,0");   // 伪军搜索力 0，只能靠「踩」
  stand.regroupTurns = 3;                                        // 原地不动，排除「搜索加豆」的干扰
  state = EndTurn(state).state;
  Eq(CFG.occupiedExposePerTurn, 2, "敌占格加压是 R5 P0-1 的承重条：每回合 +2，不许改小");
  Ok(state.tunnels.entrances["3,0"].expose - before >= 2,
    `敌踩在口上未加压：${before} → ${state.tunnels.entrances["3,0"].expose}`);
  // 8 回合内够得着：本幕窖口阈值 4，敌踩两回合就翻出来
  Ok(state.tunnels.entrances["3,0"].expose * 2 >= EntranceThreshold(state.tunnels.entrances["3,0"]),
    "踩一回合应至少攒到阈值的一半——招牌失败必须在八回合内够得着");
  // ③ 第六日的硬脚本撬窖（R6 P0-1 改判）：只够得着口子跟前的**一批**，而且**有人驻守就被打回去**。
  //    原来是「一锅端」，于是 A/B 实测出「不用地窖比用地窖评级更高」——教什么就罚什么。
  Ok(level.scriptedBreach && level.scriptedBreach.turn === 6, "第一幕应声明第六回合的撬窖脚本");
  Eq(level.scriptedBreachHaul, 1, "撬窖一次至多带走 1 批（R6 P0-1 的承重条，不许改回一锅端）");
  let scripted = CreateGame("A1", 1);
  while (scripted.meta.turn < level.scriptedBreach.turn - 1) scripted = EndTurn(scripted).state;
  PutCiv(scripted, "c1", "4,0");
  PutCiv(scripted, "c2", "4,0");
  PutCiv(scripted, "c3", "2,1");
  const capturedBefore = scripted.ledger.civCaptured;
  const warn = EndTurn(scripted);                       // 提前一回合电报
  scripted = warn.state;
  Ok(warn.events.some((e) => e.kind === "telegraph" && e.text.includes("挖")),
    "撬窖前一回合应有电报");
  const done = EndTurn(scripted);
  scripted = done.state;
  Eq(scripted.ledger.civCaptured - capturedBefore, 1, "撬窖只该带走 1 批（不是整窖）");
  Eq(CivsInCell(scripted, "4,0").length, 1, "被撬的窖里应还剩人——「一锅端」已作废");
  Ok(CivsInCell(scripted, "2,1").length === 1, "只撬人最多的那一个窖——分开放的人还在");
  // ③' 留守：窖口正下方有我方单位 → 与「攻入」同一套结算（弹药 -1 + 压制 1 回合 + 口永久已知），
  //     而且**一批也带不走**。这才是「分窖 + 留守」值得做的理由。
  let guarded = CreateGame("A1", 1);
  while (guarded.meta.turn < level.scriptedBreach.turn - 1) guarded = EndTurn(guarded).state;
  PutCiv(guarded, "c1", "4,0");
  PutCiv(guarded, "c2", "4,0");
  const guard = AllyUnits(guarded).find((unit) => unit.type === "militia");
  guard.pos = "4,0";
  guard.layer = "under";
  const ammoBefore = guarded.resources.ammo;
  guarded = EndTurn(guarded).state;                     // 电报
  const guardedDone = EndTurn(guarded);
  guarded = guardedDone.state;
  Eq(CivsInCell(guarded, "4,0").length, 2, "窖里有人驻守时撬窖应被打退，窖里一批也少不了");
  Ok(guardedDone.events.some((e) => e.text.includes("打了回去")), "打退撬窖的战报缺失");
  Eq(ammoBefore - guarded.resources.ammo, CFG.guardAmmoCost, "打退撬窖要花 1 发弹药（与攻入同价）");
  Ok(IsStunned(guarded, guarded.units[guard.id]), "守窖的人应被压制一回合");
  Ok(guarded.tunnels.entrances["4,0"].known, "打退之后这个口应转为已知（永久）");
  // ④ 手感：认真打的新手保全 ≤3/6、评定丙；且第一幕不再是全作最容易的一幕
  let safeSum = 0;
  const grades = { jia: 0, bing: 0 };
  for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
    const finished = PlayWith("A1", seed, NewbieLine);
    safeSum += CivSafeCount(finished);
    if (finished.result.grade === "甲") grades.jia += 1;
    if (finished.result.grade === "丙" || finished.result.grade === "丁") grades.bing += 1;
  }
  // R6 P0-1 之后这条线的口径变了：撬窖只带走 1 批（而不是整窖），所以新手线会多留住一批人。
  // 本幕的「注定要付代价」由 R3-10 的代价簿断言与「新手拿不到甲」两条锁着，不靠这一个数字。
  Ok(safeSum / 8 <= 4.5, `认真打的新手在第一幕应只保住 ≤4.5 批（实得 ${(safeSum / 8).toFixed(2)}）`);
  Ok(safeSum / 8 < CivTotal(CreateGame("A1", 1)), "第一幕不该出现「一批也不赔」的新手线");
  Eq(grades.jia, 0, "新手线不该在第一幕拿甲");
  const a1Jia = rank.A1.Skilled.filter((st) => st.result.grade === "甲").length;
  const laterJia = ["A2", "A3", "A4", "A5"]
    .reduce((sum, act) => sum + rank[act].Skilled.filter((st) => st.result.grade === "甲").length, 0);
  Ok(a1Jia <= laterJia, `第一幕仍是最容易的一幕：会玩拿甲 A1=${a1Jia}，后四幕合计 ${laterJia}`);
});

Check("R5 P0-2：抓丁改挂群众暴露——站在敌脚底下才被抓，粮空不再等于抓人", () => {
  // ① 敌踩住的村格上：老弱必抓，青壮头一回走脱
  let state = SurgeryGame("A3", 1);
  const villageHex = GetLevel("A3").villages[0].hexKeys[0];
  const old1 = AllCivs(state).find((civ) => civ.kind === "old");
  const young1 = AllCivs(state).find((civ) => civ.kind === "young");
  for (const civ of AllCivs(state)) { civ.loc = "lost"; civ.at = null; civ.hex = null; civ.fate = "captured"; }
  state.ledger.civCaptured = 0;
  for (const civ of [old1, young1]) { civ.loc = "village"; civ.at = "v1"; civ.hex = villageHex; civ.fate = null; civ.levyMisses = 0; }
  MakeColumn(state, "tLevy", ["inf"], villageHex);
  state.map.villages.v1.grainOpen = 9;                   // 村里有粮可征：旧规则下「有粮就不抓丁」
  state = EndTurn(state).state;
  Eq(state.civs[old1.id].loc, "lost", "老弱站在敌脚底下必被抓");
  Eq(state.civs[young1.id].loc, "village", "青壮头一回应能走脱");
  state = EndTurn(state).state;
  Eq(state.civs[young1.id].loc, "lost", "青壮第二回就没跑掉");
  // ② 「村中无粮可征」不再触发抓丁：人在地道里，粮空也抓不着
  let safe = SurgeryGame("A3", 1);
  safe.map.villages.v1.grainOpen = 0;
  for (const civ of AllCivs(safe)) PutCiv(safe, civ.id, "3,0");
  safe.tunnels.cells["3,0"].facility = "shelter";
  MakeColumn(safe, "tDry", ["inf"], GetLevel("A3").villages[0].hexKeys[0]);
  const beforeDry = safe.ledger.civCaptured;
  safe = EndTurn(safe).state;
  Eq(safe.ledger.civCaptured, beforeDry, "粮空不该再凭空抓走地道里的群众");
  // ③ 终局不把幸存群众传回地面：就地结算
  let ending = CreateGame("A3", 1);
  ending.map.villages.v1.grainOpen = 0;
  ending.map.villages.v1.organize = 0;
  ending.wave.status = "sweep";
  ending.wave.schedule = [];
  ending.wave.revenge = null;
  const holding = MakeColumn(ending, "tEnd", ["puppet"], "9,-2");   // 场上还有敌：走「到时终局」那条路
  holding.regroupTurns = 5;                                        // 原地整队，别自己退场把波次收束了
  PutCiv(ending, "c1", "3,0");
  ending.meta.turn = GetLevel("A3").maxTurns;
  ending = EndTurn(ending).state;
  Ok(ending.result, "应已结算");
  Eq(ending.civs.c1.loc, "cell", "终局不该把地道里的群众传回地面");
  // ④ 三组对照：什么都不做 / 全塞地道后不管 / 疯狂藏粮 —— 结果必须不再相同
  const Idle = () => ({ type: "EndTurn" });
  // 「全塞进地道，之后完全不管」：只要村里还有人就往地道里送，送完就再也不动
  const StuffOnce = (st) => {
    for (const unit of AllyUnits(st).filter((u) => !u.acted)) {
      const move = Pick(Acts(st, unit), "MoveCivs");
      if (move) return move;
    }
    return { type: "EndTurn" };
  };
  const GrainOnly = (st) => {
    const unit = FirstIdle(st);
    if (!unit) return { type: "EndTurn" };
    return Pick(Acts(st, unit), "HideGrain") || { type: "EndTurn" };
  };
  const Sig = (st) => `${CivSafeCount(st)}/${st.ledger.civCaptured}/${TunnelGrainTotal(st)}`;
  let differ = 0;
  let noReverse = 0;
  let escortWins = 0;
  const seeds = [3, 5, 7, 21];
  for (const seed of seeds) {
    const idle = PlayWith("A3", seed, Idle);
    const stuffed = PlayWith("A3", seed, StuffOnce);
    const grained = PlayWith("A3", seed, GrainOnly);
    const escorted = RunBotGame({ level: "A3", seed, bot: "Skilled" }).state;
    // ①「什么都不做」与「全塞进地道后不管」不能再给出一模一样的终局
    if (Sig(idle) !== Sig(stuffed)) differ += 1;
    // ②「疯狂藏粮」不该比「什么都不做」死更多人——反向激励必须消失
    if (grained.ledger.civCaptured <= idle.ledger.civCaptured) noReverse += 1;
    // ③「有人陪着带路」必须明显强过「塞进去不管」——「谁去带路」是真取舍
    if (CivSafeCount(escorted) > CivSafeCount(stuffed)) escortWins += 1;
    Ok(TunnelGrainTotal(grained) > TunnelGrainTotal(idle), `seed${seed}：藏粮线的洞存粮必须更高`);
  }
  Ok(differ >= 3, `「什么都不做」与「全塞进地道后不管」仍在给同样的结果（${differ}/${seeds.length} 个 seed 有区别）`);
  Eq(noReverse, seeds.length, "「藏粮越快死人越多」的反向激励仍然存在");
  Ok(escortWins >= 3, `「有人陪着」没有明显强过「塞进去不管」（${escortWins}/${seeds.length}）`);
});

Check("R5 P0-3：战役续承——上一幕的战果真的传得下去，跳过前作有可感知代价", () => {
  // ① 引擎侧接口：ExtractCarry → CreateGame(level, seed, { carry })
  let played = RunBotGame({ level: "A2", seed: 1, bot: "Skilled" }).state;
  const carry = ExtractCarry(played);
  Ok(carry.cells.length >= 3, "续承档应带走地道格");
  const carried = CreateGame("A3", 1, { carry });
  Eq(Object.keys(carried.tunnels.cells).length, carry.cells.filter((key) => carried.map.hexes[key]).length,
    "续承的地道格未落地");
  Ok(carried.meta.carry && !carried.meta.carry.isDefault, "续承元信息应标明来源");
  // ② 默认继承档：明确标注，且**每一幕都比满配档差**（这就是跳过前作的账）
  for (const act of ["A2", "A3", "A4", "A5"]) {
    const level = GetLevel(act);
    Ok(level.carryDefault && level.carryDefault.isDefault, `${act} 应声明默认继承档`);
    Ok((level.carryDefault.label || "").includes("默认继承档"), `${act} 的默认继承档必须明确标注`);
    Ok((level.carryDefault.notes || []).length > 0, `${act} 的默认继承档应说明差在哪儿`);
    const weak = CarryWeight(level.carryDefault);
    const full = CarryWeight(BuildFullCarry(act));
    const worse = weak.cells < full.cells || weak.entrances < full.entrances || weak.disguises < full.disguises;
    Ok(worse, `${act} 的默认继承档并不比满配档差：${JSON.stringify(weak)} vs ${JSON.stringify(full)}`);
    Ok(weak.ammo < level.ammoStart, `${act} 的默认继承档应少配发弹药（实得 ${weak.ammo}/${level.ammoStart}）`);
  }
  // ③ 可感知代价（实测口径）：续承档直接给的是「网、口、伪装」，所以用**终局还没被搜出的口**
  //    与**代价簿总额**来量它。会玩 bot 会把缺的东西自己挖回来（挖得动就补得上），
  //    所以这里用挖不动的两条线（缩头 / 乱打）跨四幕聚合比较——差额就是跳过前作欠下的账。
  let weakLive = 0;
  let fullLive = 0;
  let weakCost = 0;
  let fullCost = 0;
  for (const act of ["A2", "A3", "A4", "A5"]) {
    for (const bot of ["Turtle", "Random"]) {
      for (const seed of [1, 2, 3, 4]) {
        const weak = RunBotGame({ level: act, seed, bot }).state;
        const full = RunBotGame({ level: act, seed, bot, carry: BuildFullCarry(act) }).state;
        weakLive += LiveEntranceCount(weak);
        fullLive += LiveEntranceCount(full);
        // 第二把尺子量的是**网本身**：跳过前作接手的是一张更小的网，终局也还是更小。
        // （原来量的是代价簿总额，但那一栏被「敌占了村子多久」主导——R6 P0-4 的久占加压
        //   让房屋被焚跟着占领时长走，与你上一幕挖了多少格无关，量不出继承的差别。）
        weakCost += LargestNetworkSize(weak);
        fullCost += LargestNetworkSize(full);
      }
    }
  }
  Ok(fullLive > weakLive,
    `跳过前作没有可感知代价：终局活口 默认档 ${weakLive} vs 满配档 ${fullLive}`);
  Ok(fullCost > weakCost,
    `跳过前作没有可感知代价：终局最大连通块合计 默认档 ${weakCost} vs 满配档 ${fullCost}`);
});

Check("R5 P0-4：守洞不再免费——打退攻入要花子弹、人被压制一回合、口从此明摆着", () => {
  let state = SurgeryGame("A3", 1);
  state.tunnels.entrances["3,0"].known = true;
  PutUnder(state, "u1", "3,0");
  state.resources.ammo = 4;
  MakeColumn(state, "tGuard", ["inf", "inf"], "3,0");
  state = EndTurn(state).state;
  Ok(state.enemy.pendingOps.some((op) => op.kind === "breach"), "未宣布攻入");
  const ammoBefore = state.resources.ammo;
  const enemiesBefore = EnemyUnits(state).length;
  const outcome = EndTurn(state);
  state = outcome.state;
  Eq(EnemyUnits(state).length, enemiesBefore - 1, "守洞仍应折敌一班（它必须仍是一手好棋）");
  Eq(state.resources.ammo, ammoBefore - CFG.guardAmmoCost, "守洞打退攻入应消耗弹药");
  Ok(outcome.events.some((e) => e.text.includes("守洞火力当头")), "守洞战报文本必须保住");
  Ok(state.tunnels.entrances["3,0"].known, "守洞开火后该口应转为已知");
  const guard = state.units.u1;
  Ok(guard && guard.acted && guard.mp === 0 && guard.stance === "stunned", "守洞单位下一回合应被压制");
  Eq(LegalActions(state, "u1").length, 0, "被压制的单位这一回合不该有任何合法动作");
  Ok(state.score.kills.inf >= 1, "守洞折敌应计入战果（原来这一刀连账都不记）");
  // 弹药池见底 → 洞口只剩人，堵不住枪
  let dry = SurgeryGame("A3", 2);
  dry.tunnels.entrances["3,0"].known = true;
  PutUnder(dry, "u1", "3,0");
  dry.resources.ammo = 0;
  MakeColumn(dry, "tDryGuard", ["inf", "inf"], "3,0");
  dry = EndTurn(dry).state;
  const dryOutcome = EndTurn(dry);
  dry = dryOutcome.state;
  Ok(dryOutcome.events.some((e) => e.text.includes("堵不住枪")), "弹药见底应明说守不住");
  Ok(!dry.tunnels.entrances["3,0"], "弹药见底时攻入应得手");
});

Check("R5 P0-5：水与烟必须真的出现——多 seed 逐种作业触发率", () => {
  const seeds = [1, 2, 3, 4, 5, 6, 7, 8];
  const rate = {};
  for (const act of ["A2", "A3", "A4", "A5"]) {
    rate[act] = { smoke: 0, flood: 0, blast: 0, breach: 0, excavate: 0, seal: 0 };
    for (const seed of seeds) {
      const seen = new Set();
      let state = CreateGame(act, seed);
      for (let step = 0; step < 3000 && !state.result; step += 1) {
        const action = DiggerLine(state);
        let outcome = action.type === "EndTurn" ? EndTurn(state) : PerformAction(state, action);
        if (outcome.illegal) { outcome = EndTurn(state); if (outcome.illegal) break; }
        for (const event of outcome.events) {
          if (event.kind !== "op") continue;
          for (const [kind, word] of [["smoke", "烟自"], ["flood", "水自"], ["blast", "炸毁"],
            ["breach", "攻入"], ["excavate", "刨塌"], ["seal", "填死"]]) {
            if (event.text.includes(word)) seen.add(kind);
          }
        }
        state = outcome.state;
      }
      for (const kind of seen) rate[act][kind] += 1;
    }
  }
  // ① 作业轮换：可做的几手里先挑本役用得最少的那一手（「烟永远压着水」就是水成为死内容的原因）
  Ok(CFG.opRotate, "作业轮换是 R5 P0-5 的承重条");
  let rot = SurgeryGame("A4", 1, { carry: BuildFullCarry("A4") });
  rot.tunnels.entrances["5,2"].known = true;                  // 东洼最低处的口：烟与水都做得了
  rot.wave.opsUsed.smoke = 9;                                 // 烟已经用滥了 → 这次该换水
  MakeColumn(rot, "tRot", ["sapper", "inf"], "5,2");
  rot = EndTurn(rot).state;
  Ok(rot.enemy.pendingOps.some((op) => op.kind === "flood"),
    `烟用滥了敌应改用水，实得 ${JSON.stringify(rot.enemy.pendingOps.map((op) => op.kind))}`);
  let rot2 = SurgeryGame("A4", 1, { carry: BuildFullCarry("A4") });
  rot2.tunnels.entrances["5,2"].known = true;
  rot2.wave.opsUsed.flood = 9;
  MakeColumn(rot2, "tRot2", ["sapper", "inf"], "5,2");
  rot2 = EndTurn(rot2).state;
  Ok(rot2.enemy.pendingOps.some((op) => op.kind === "smoke"), "水用滥了敌应改用烟");
  // ② 工兵闻着新土走：还没够动手门槛的口也会被工兵专程摸过去（踩上去再自己踩出豆来）
  let sniff = SurgeryGame("A4", 1, { carry: BuildFullCarry("A4") });
  sniff.tunnels.entrances["5,2"].expose = CFG.sapperSniffExpose;   // 有动静，但还不够动手门槛
  const sniffColumn = MakeColumn(sniff, "tSniff", ["sapper", "inf"], "8,0", { role: "sapper" });
  const farBefore = HexDistanceKeys("8,0", "5,2");
  sniff = EndTurn(sniff).state;
  const sniffPos = sniff.units[sniffColumn.unitIds[0]].pos;
  Ok(HexDistanceKeys(sniffPos, "5,2") < farBefore,
    `工兵没有朝有动静的口摸过去：${sniffPos}（原 8,0）`);
  // ③ 驻剿队也做反地道作业（第五幕 T12 转入驻剿之后，原来一切作业全部停摆）
  let garri = SurgeryGame("A5", 1);
  garri.tunnels.entrances["2,0"].known = true;
  const garrisonColumn = MakeColumn(garri, "tGarri", ["inf", "inf"], "2,0", { target: "v1" });
  garrisonColumn.garrison = true;
  garri = EndTurn(garri).state;
  Ok(garri.enemy.pendingOps.length > 0, "驻剿队应照样对地道口动手");
  Ok(rate.A4.flood * 2 >= seeds.length, `第四幕的水仍是死内容：${rate.A4.flood}/${seeds.length}`);
  Ok(rate.A5.flood * 2 >= seeds.length, `第五幕的水仍是死内容：${rate.A5.flood}/${seeds.length}`);
  Ok(rate.A4.smoke * 2 >= seeds.length, `第四幕的烟触发率过低：${rate.A4.smoke}/${seeds.length}`);
  Ok(rate.A5.smoke * 2 >= seeds.length, `第五幕的烟触发率过低：${rate.A5.smoke}/${seeds.length}`);
  Ok(rate.A4.breach >= 1, `第四幕的攻入一次也没发生：${rate.A4.breach}/${seeds.length}`);
  Ok(rate.A3.blast * 2 >= seeds.length, `第三幕的爆破触发率过低：${rate.A3.blast}/${seeds.length}`);
  Ok(rate.A2.excavate >= 1, "第二幕的刨口一次也没发生");
  // 保住「通气孔比例的涌现」：通风口修够（≥ 地道格数/3）敌就不烧这份柴
  Ok(CFG.ventPerCellsForSmoke === 3, "通气孔比例（地道格数/3）是第四幕的涌现点，不许改数");
  let vented = SurgeryGame("A4", 1, { carry: BuildFullCarry("A4") });
  vented.tunnels.entrances["3,0"].known = true;
  for (const key of SortedKeys(vented.tunnels.cells)) {
    if (vented.tunnels.cells[key].facility === null) {
      vented.tunnels.cells[key].facility = "vent";
      vented.tunnels.vents[key] = { expose: 0, known: false, smoked: false };
    }
  }
  MakeColumn(vented, "tVent", ["sapper", "inf"], "3,0");
  vented = EndTurn(vented).state;
  Ok(!vented.enemy.pendingOps.some((op) => op.kind === "smoke"),
    "通风口修够了敌就不该再选烟攻（第四幕的涌现点）");
});

Check("R5 P0-6：胜利线不能第三四回合就达标，且洞存粮真的会被敌夺走", () => {
  // ① 逐幕：洞粮线必须高于**单个储粮洞的容量**——一个洞装不下，就必须再挖一个
  for (const act of ["A2", "A3", "A4", "A5"]) {
    const level = GetLevel(act);
    const need = level.victory.tunnelGrainAtLeast;
    Ok(need > level.storageCap,
      `${act}：洞粮线 ${need} 不高于单洞容量 ${level.storageCap}，一个洞就能达标`);
  }
  // ② 爆破埋粮（只埋一部分：它教的是「粮分几个洞放」）
  let state = SurgeryGame("A3", 1);
  state.map.villages.v1.grainOpen = 0;                     // 排除「明存粮被搜走」对账本的干扰
  state.tunnels.entrances["3,0"].known = true;
  state.tunnels.cells["3,0"].facility = "storage";
  state.tunnels.cells["3,0"].grain = 8;
  MakeColumn(state, "tBlastGrain", ["sapper", "inf"], "3,0");
  state = EndTurn(state).state;
  const buriedBefore = state.ledger.grainSeized;
  state = EndTurn(state).state;
  Eq(CFG.blastGrainLoss, 4, "爆破埋粮是 R5 P0-6 的承重条：洞存粮不再是存进去就永远安全");
  Eq(state.ledger.grainSeized - buriedBefore, 4, "爆破应把一部分洞存粮埋进代价簿");
  Eq(state.tunnels.cells["3,0"].grain, 4, "爆破只该埋掉一部分（教的是「粮分几个洞放」）");
  // ③ 攻入得手：口下那格的粮全丢，敌还顺着巷子再搬走一些
  let haul = SurgeryGame("A3", 3);
  haul.map.villages.v1.grainOpen = 0;
  haul.tunnels.entrances["3,0"].known = true;
  haul.tunnels.cells["3,0"].facility = "storage";
  haul.tunnels.cells["3,0"].grain = 2;
  haul.tunnels.cells["4,-1"].facility = "storage";
  haul.tunnels.cells["4,-1"].grain = 8;
  MakeColumn(haul, "tHaul", ["inf", "inf"], "3,0");
  haul = EndTurn(haul).state;
  haul = EndTurn(haul).state;
  Eq(CFG.breachStorageHaul, 4, "攻入顺着地道搬粮是 R5 P0-6 的承重条");
  Ok(haul.tunnels.cells["4,-1"].grain <= 8 - CFG.breachStorageHaul,
    `攻入得手后敌应顺着地道再搬走 ${CFG.breachStorageHaul} 担（实剩 ${haul.tunnels.cells["4,-1"].grain}）`);
  // ④ 实测：会玩 bot 的达标回合被推到**过半**（原来 A2 T4 / A3 T4 / A4 T4 / A5 T3）
  //    并且最后三分之一的回合仍然有事发生（敌方作业或代价簿在动），不是空按 end。
  const seeds = [1, 2, 3, 4, 5, 6, 7, 8];
  for (const act of ["A2", "A3", "A4", "A5"]) {
    const level = GetLevel(act);
    const need = level.victory.tunnelGrainAtLeast;
    let sum = 0;
    let hits = 0;
    let lateBusy = 0;
    for (const seed of seeds) {
      let hit = null;
      let busy = false;
      const run = RunBotGame({ level: act, seed, bot: "Skilled", onStep: (st, action, events) => {
        if (st.meta.turn > (level.maxTurns * 2) / 3) {
          for (const event of events || []) {
            if (event.kind === "op" || event.kind === "ledger" || event.kind === "telegraph") busy = true;
          }
        }
        if (action.type !== "EndTurn" || hit !== null) return;
        if (TunnelGrainTotal(st) >= need) hit = st.meta.turn;
      } });
      if (hit !== null) { sum += hit; hits += 1; }
      // 「后段不空转」= 后三分之一里确实有事发生；**或者你干脆把敌人提前赶走了**
      //（提前收束的局根本没有「后段」可空转，那是玩家挣来的安静，不是设计的空白）。
      const ended = run.state.result ? run.state.result.endTurn : level.maxTurns;
      if (busy || run.state.wave.expelled || ended < level.maxTurns) lateBusy += 1;
    }
    Ok(hits === 0 || sum / hits >= level.maxTurns * 0.4,
      `${act}：洞粮线平均第 ${(sum / hits).toFixed(1)} 回合就达标（本幕 ${level.maxTurns} 回合，至少要到第 ${(level.maxTurns * 0.4).toFixed(1)} 回合）`);
    Ok(lateBusy * 2 >= seeds.length,
      `${act}：最后三分之一的回合只有 ${lateBusy}/${seeds.length} 个 seed 还有事发生`);
  }
});

Check("R5 bug：平静期产出与自动藏粮必须播报，且第一幕的算术对得上", () => {
  const state = CreateGame("A4", 9);
  const grainBefore = state.map.villages.v1.grainOpen + TunnelGrainTotal(state);
  const outcome = EndTurn(state);
  const grainAfter = outcome.state.map.villages.v1.grainOpen + TunnelGrainTotal(outcome.state);
  Ok(grainAfter > grainBefore, "平静期确实在产粮（这一条只是锚定口径）");
  const shown = outcome.events.filter((e) => e.visible && e.kind === "grain");
  Ok(shown.some((e) => e.text.includes("秋粮")), "平静期明存粮产出必须播报");
  Ok(shown.some((e) => e.text.includes("进窖")), "组织度自动藏粮必须播报");
  // 第一幕的账：七担 + 平静期一担 = 八担，粮窖只装得下四担（复盘文案与数值对得上）
  const a1 = GetLevel("A1");
  const total = a1.villages[0].grainOpen + CFG.quietGrainPerVillage * (a1.sweepStartTurn - 1);
  Eq(total, 8, "第一幕开打时应正好八担粮");
  Ok(a1.debrief.cost.includes("八担"), "第一幕复盘应写「八担」");
  Ok(a1.debrief.cost.includes("四担"), "第一幕复盘应写粮窖只装得下四担");
});

Check("R5 bug：BreakRoad 不能刨村庄格；缴获真的会兑现；非法动作不夹带无关提示", () => {
  // ① 村庄格不许破路（原来能在区队部脚下把地形改成断路）
  let state = CreateGame("A1", 3);
  for (const action of LegalActions(state)) {
    if (action.type !== "BreakRoad") continue;
    const unit = state.units[action.unit];
    Ok(!state.map.hexes[unit.pos].villageId, `村庄格 ${unit.pos} 竟然可以 BreakRoad`);
  }
  const villageRoad = GetLevel("A1").villages[0].hexKeys.find((key) => state.map.hexes[key].road);
  Ok(villageRoad, "第一幕村里应当有路格（否则这条断言没意义）");
  const militia = AllyUnits(state).find((unit) => (CFG.digPower[unit.type] || 0) > 0);
  militia.pos = villageRoad;
  militia.layer = "surface";
  const refused = PerformAction(state, { type: "BreakRoad", unit: militia.id });
  Ok(refused.illegal && refused.illegal.includes("村里的街"), `村庄格破路应被拒：${refused.illegal}`);
  // ② 缴获：日军班与工兵班打死了要能捡到子弹（README 承诺的那 +1）
  Ok(CFG.loot.inf > 0 && CFG.loot.sapper > 0, "日军班与工兵班应可缴获");
  let loot = SurgeryGame("A3", 1);
  loot.resources.ammo = 6;
  MakeColumn(loot, "tLoot", ["sapper"], "3,1");
  const sapper = EnemyUnits(loot).find((unit) => unit.type === "sapper");
  sapper.hp = 1;
  const guerrilla = AllyUnits(loot).find((unit) => unit.type === "guerrilla");
  guerrilla.pos = "3,0";
  guerrilla.layer = "surface";
  guerrilla.acted = false;
  const shot = LegalActions(loot, guerrilla.id).find((a) => a.type === "Attack" && a.target === sapper.id);
  Ok(shot, "应能打这个工兵班");
  const hit = Step(loot, shot);
  Ok(hit.events.some((e) => e.kind === "loot" && e.visible && e.text.includes("缴获")),
    "打死工兵班应播报缴获（原来一次也没兑现过）");
  Eq(hit.state.resources.ammo, 6 - CFG.ammoPerAttack + CFG.loot.sapper, "缴获数目不对");
  // ③ 非法动作：只回这一个动作的理由，不夹带别的动作类型
  const refusal = PerformAction(CreateGame("A2", 1), { type: "DigEntrance", unit: "u1", at: "3,0" });
  Ok(refusal.illegal, "地面上开口应被拒");
  Eq(refusal.illegalAction, "DigEntrance", "拒绝回执应标明是哪一个动作被拒");
  Ok(Array.isArray(refusal.hints) && refusal.hints.length > 0, "拒绝回执应带补救提示");
  for (const hint of refusal.hints) {
    Ok(!/^(Ambush|Attack|Hide|CoverTraces|BreakRoad|Collapse|Dig|DigFacility|DigDoor|HideGrain|MoveCivs|GuideCivs|Disguise)[ ：:]/.test(hint)
       || hint.startsWith("DigEntrance"), `拒绝回执夹带了无关动作的提示：${hint}`);
  }
});

// ===========================================================================
// 汇总
// ===========================================================================

const failures = results.filter((entry) => !entry.pass);
const seconds = ((Date.now() - startedAt) / 1000).toFixed(1);
console.log("");
console.log(`—— 冒烟汇总：${results.length - failures.length}/${results.length} 通过，用时 ${seconds}s ——`);
for (const failure of failures) console.log(`${red("✗")} ${failure.name} —— ${failure.message}`);
if (failures.length === 0) console.log(green("全绿。"));
process.exit(failures.length ? 1 : 0);
