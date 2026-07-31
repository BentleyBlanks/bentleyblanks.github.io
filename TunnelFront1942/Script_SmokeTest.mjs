#!/usr/bin/env node
// 《地下长城 · 冀中1942》 —— node 冒烟测试（AGENTS.md §7.1 清单逐条落地）。
// 退出码即成败；彩色 PASS/FAIL 汇总；目标总时长 <90 秒。

import { readFileSync, existsSync } from "node:fs";
import process from "node:process";
import { HexKey, ParseHexKey, HexNeighborKeys, HexDistanceKeys } from "./Script_Hex.mjs";
import { CFG, unitDefinitions, disguiseDefinitions } from "./Data_Rules.mjs";
import { GetLevel, levelDefinitions, campaignOrder, BuildSchedule, BuildActCard } from "./Data_Levels.mjs";
import {
  CreateGame, CloneState, SerializeState, DeserializeState, HashState, MakeEnemyUnit,
  AddLedger, GrainTotal, TunnelGrainTotal, PopTotal, SortedKeys, EdgeKey, AllyUnits, EnemyUnits, UnitDef,
  AllCivs, LiveCivs, CivsInCell, CivsAtVillage, CivSafeCount, CivTotal, ElevOf,
  LargestNetworkSize, EntranceThreshold, ActionUnlocked, StorageCapOf, ShelterCapOf,
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
function SurgeryGame(levelId, seed) {
  let state = CreateGame(levelId, seed);
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
    if (previousActions) {
      for (const type of previousActions) Ok(level.unlocks.actions.includes(type), `${id} 丢掉了上一幕已解锁的 ${type}`);
      Ok(level.unlocks.actions.length > previousActions.length, `${id} 没有任何新解锁`);
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

Check("双时钟：纯躲一次也逼不退；会玩能在半数以上 seed 把敌逼退（第三幕起有枪之后）", () => {
  for (const level of acts) {
    for (const state of rank[level].Turtle) {
      Ok(!state.wave.expelled, `${level}：纯躲不该把敌逼退`);
    }
  }
  for (const level of ["A3", "A4", "A5"]) {
    const expelled = rank[level].Skilled.filter((state) => state.wave.expelled).length;
    Ok(expelled * 2 >= rankSeeds.length, `${level}：会玩只逼退 ${expelled}/${rankSeeds.length}`);
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
  const a2 = CreateGame("A2", 1);
  PutUnder(a2, "u1", "3,0");
  Ok(LegalActions(a2, "u1").some((a) => a.type === "Dig"), "第二幕应能挖连通段");
  Ok(LegalActions(a2, "u1").some((a) => a.type === "DigEntrance"), "第二幕应能开新口");
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
  let state = SurgeryGame("A3", 1);                    // A3 起始网 5 格全连通
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
  let s2 = SurgeryGame("A3", 1);
  for (const id of ["c1", "c2", "c3", "c4", "c5"]) PutCiv(s2, id, "4,0");
  PutUnder(s2, runner.id, "4,0");
  const rAction = LegalActions(s2, runner.id).find((a) => a.type === "GuideCivs");
  Eq(rAction.count, CFG.civ.guideCap.runner, "联络员一次应带 3 批");
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
  MakeColumn(state, "tShoot", ["inf", "inf"], "4,-1");        // 敌就在射击孔正上方
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
  let state = SurgeryGame("A4", 1);
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
  let state = SurgeryGame("A4", 1);
  state.tunnels.smokeOps.push({ origin: "3,0", spreadLeft: 6, lingerLeft: 2, cells: ["3,0"],
    front: [{ key: "3,0", dir: -1 }], queued: [] });
  state = EndTurn(state).state;
  Ok(state.tunnels.cells["4,-1"].smoke > 0, "第一步（原点向外）应立刻蔓延");
  Eq(state.tunnels.cells["4,0"].smoke, 0, "拐弯的那一格第一回合不该到");
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
  state.tunnels.entrances["2,1"].known = true;
  MakeColumn(state, "tDig", ["inf", "inf"], "2,1");
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
  MakeColumn(state, "tStale", ["inf"], "0,2");
  const outcome = EndTurn(state);
  const hit = outcome.events.find((event) => event.kind === "combat" && event.text.includes("伏击"));
  Ok(hit, "伏击未触发");
  Ok(hit.text.includes(`伤 ${CFG.staleAmbushDamage}`), `老地方伏击伤害应降为 ${CFG.staleAmbushDamage}：${hit.text}`);
  // 边界：T1 首次设伏不得被误判为老地方
  const fresh = CreateGame("A3", 1);
  Eq(fresh.meta.turn, 1);
  for (const unit of AllyUnits(fresh)) {
    for (const act of LegalActions(fresh, unit.id).filter((a) => a.type === "Ambush")) Ok(!act.stale, "T1 首次设伏被误判为老地方");
  }
});

Check("R2 P0-6：胜负只认洞存粮与群众保全（第三幕：洞里 7 担判负、8 担判胜）", () => {
  const Finish = (tunnelGrain) => {
    let state = CreateGame("A3", 1);
    state.map.villages.v1.grainOpen = 0;
    state.tunnels.cells["3,0"].grain = tunnelGrain;
    state.meta.turn = GetLevel("A3").maxTurns;
    state.wave.schedule = [];
    state.wave.revenge = null;
    return EndTurn(state).state.result;
  };
  Ok(!Finish(7).won, "洞存粮 7 应判负");
  Ok(Finish(8).won, "洞存粮 8 应判胜");
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
  Ok(state.ledger.civDead >= 2, `爆破塌方未把藏身群众记入代价簿（civDead=${state.ledger.civDead}）`);
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
  Eq(state.ledger.civCaptured, 2, "藏身群众应被捕进账本");
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
// 汇总
// ===========================================================================

const failures = results.filter((entry) => !entry.pass);
const seconds = ((Date.now() - startedAt) / 1000).toFixed(1);
console.log("");
console.log(`—— 冒烟汇总：${results.length - failures.length}/${results.length} 通过，用时 ${seconds}s ——`);
for (const failure of failures) console.log(`${red("✗")} ${failure.name} —— ${failure.message}`);
if (failures.length === 0) console.log(green("全绿。"));
process.exit(failures.length ? 1 : 0);
