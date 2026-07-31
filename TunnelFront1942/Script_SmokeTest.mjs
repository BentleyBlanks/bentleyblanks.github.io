#!/usr/bin/env node
// 《地下长城 · 冀中1942》 —— node 冒烟测试（AGENTS.md §7.1 清单逐条落地）。
// 退出码即成败；彩色 PASS/FAIL 汇总；目标总时长 <90 秒。

import { readFileSync, existsSync } from "node:fs";
import process from "node:process";
import { HexKey, ParseHexKey, HexNeighborKeys, HexDistanceKeys } from "./Script_Hex.mjs";
import { CFG, unitDefinitions } from "./Data_Rules.mjs";
import { GetLevel, levelDefinitions, BuildSchedule } from "./Data_Levels.mjs";
import {
  CreateGame, CloneState, SerializeState, DeserializeState, HashState, MakeEnemyUnit,
  AddLedger, GrainTotal, TunnelGrainTotal, PopTotal, SortedKeys, EdgeKey, AllyUnits, EnemyUnits, UnitDef,
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

Check("契约：状态序列化 round-trip", () => {
  for (const levelId of Object.keys(levelDefinitions)) {
    const state = CreateGame(levelId, 7);
    const revived = DeserializeState(SerializeState(state));
    Eq(HashState(revived), HashState(state), `${levelId} 序列化后哈希漂移`);
  }
});

Check("契约：CloneState 隔离", () => {
  const state = CreateGame("L1", 4);
  const hash = HashState(state);
  const clone = CloneState(state);
  clone.meta.turn = 99;
  clone.map.hexes["3,1"].traces = 6;
  clone.units.u1.hp = 0;
  clone.ledger.civDead = 9;
  Eq(HashState(state), hash, "改克隆不得影响原状态");
});

Check("契约：纯度扫描（核心模块无 window/document/three/伪随机/时钟）", () => {
  const coreFiles = ["Script_Hex.mjs", "Data_Rules.mjs", "Data_Levels.mjs", "Script_State.mjs",
    "Script_Visibility.mjs", "Script_Actions.mjs", "Script_EnemyAi.mjs", "Script_Turn.mjs",
    "Script_Bots.mjs", "Script_AsciiMap.mjs"];
  const banned = ["window.", "document.", "Math." + "random", "Date." + "now", 'from "three"', "from 'three'"];
  for (const file of coreFiles) {
    const source = Src(file)
      .replace(/\/\*[\s\S]*?\*\//g, "")     // 去块注释
      .replace(/\/\/[^\n]*/g, "");          // 去行注释（禁令只针对可执行代码）
    for (const pattern of banned) {
      Ok(!source.includes(pattern), `${file} 含违禁引用 ${pattern}`);
    }
  }
});

Check("契约：DeriveView 只读不写（视图不改状态）", () => {
  let state = CreateGame("L2", 7);
  for (let i = 0; i < 3; i += 1) state = EndTurn(state).state;
  const hash = HashState(state);
  DeriveView(state);
  RenderAsciiMap(state);
  Eq(HashState(state), hash, "DeriveView/ASCII 改动了状态");
});

Check("契约：非法动作不改状态且给出理由", () => {
  const state = CreateGame("L1", 3);
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
  const a = RunBotGame({ level: "L1", seed: 5, bot: "Skilled" });
  const b = RunBotGame({ level: "L1", seed: 5, bot: "Skilled" });
  Eq(HashState(a.state), HashState(b.state), "L1 Skilled 终局哈希");
  const c = RunBotGame({ level: "L2", seed: 4, bot: "Random" });
  const d = RunBotGame({ level: "L2", seed: 4, bot: "Random" });
  Eq(HashState(c.state), HashState(d.state), "L2 Random 终局哈希");
});

Check("确定性：动作序列重放 + 存档读档续跑 = 一次跑通", () => {
  const run = RunBotGame({ level: "L1", seed: 5, bot: "Skilled" });
  let replay = CreateGame("L1", 5);
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
  const cases = [["L1", 11], ["L1", 12], ["L1", 13], ["L2", 11], ["L2", 12]];
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
      for (const key of SortedKeys(st.map.hexes)) {
        Ok(st.map.hexes[key].traces <= CFG.tracesMax, `痕迹越界 ${key}`);
      }
      Ok(PopTotal(st) >= 0 && GrainTotal(st) >= 0, "资源为负");
    } });
    Ok(state.result, `${level} seed${seed} 乱打未跑到终局`);
  }
});

// ===========================================================================
// 四、策略排序红线 + 双时钟
// ===========================================================================

const rankSeeds = [1, 2, 3, 4, 5];
const rank = {};
for (const level of ["L1", "L2"]) {
  rank[level] = {};
  for (const bot of ["Skilled", "Turtle", "Rambo"]) {
    rank[level][bot] = rankSeeds.map((seed) => RunBotGame({ level, seed, bot }).state);
  }
}

Check("排序红线：莽撞 L1 必败", () => {
  for (const state of rank.L1.Rambo) Ok(!state.result.won, `Rambo seed 应败，实得 ${state.result.grade}`);
});

Check("排序红线：缩头 L1 必不得甲乙", () => {
  for (const state of rank.L1.Turtle) {
    Ok(!state.result.won || ["丙", "丁"].includes(state.result.grade), `Turtle 评到 ${state.result.grade}`);
  }
});

Check("排序红线：会玩 L1 必胜且 ≥乙", () => {
  for (const state of rank.L1.Skilled) {
    Ok(state.result.won, "Skilled L1 未胜");
    Ok(["甲", "乙"].includes(state.result.grade), `Skilled 评到 ${state.result.grade}`);
  }
});

Check("排序红线：会玩 > 缩头 且 会玩 > 莽撞（胜负 + 数值分双排序）", () => {
  for (const level of ["L1", "L2"]) {
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

Check("双时钟：纯躲 → 敌满时长离场且明存粮被征 ≥6", () => {
  for (const state of rank.L1.Turtle) {
    Ok(state.ledger.grainSeized >= 6, `纯躲被征 ${state.ledger.grainSeized} < 6`);
    const effectiveWithdraw = state.wave.withdrawTurn ?? (state.wave.hardEndTurn + 1);
    Ok(effectiveWithdraw >= state.wave.hardEndTurn, "纯躲不应逼退敌军");
  }
});

// R2：L1 取消了「每回合白送 -1」，收队时点不再是平滑函数，双时钟改按**池**与**逼退率**断言
// （池才是双时钟本体；扑空衰减 + 我方袭扰共同耗池，纯躲两样都拿不到）。
Check("双时钟：袭扰把敌逼退、纯躲一次也逼不退；逼退落在 T9-T10（不再 T7-T8 提前收工留空转）", () => {
  let expelled = 0;
  for (let i = 0; i < rankSeeds.length; i += 1) {
    const harass = rank.L1.Skilled[i];
    Ok(!rank.L1.Turtle[i].wave.expelled, `seed${rankSeeds[i]}：纯躲不该把敌逼退`);
    if (!harass.wave.expelled) continue;
    expelled += 1;
    Ok(harass.wave.withdrawTurn >= 9, `seed${rankSeeds[i]}：逼退过早 T${harass.wave.withdrawTurn}`);
    Ok(harass.wave.withdrawTurn <= harass.wave.hardEndTurn, "逼退回合越界");
  }
  Ok(expelled * 2 >= rankSeeds.length, `袭扰逼退 ${expelled}/${rankSeeds.length}，不足半数`);
});

// ===========================================================================
// 五、佯动木偶化（置信 1 噪音绝不拉动纵队）
// ===========================================================================

Check("佯动木偶化：仅置信 1 噪音 → 敌纵队逐回合路径与基线一致", () => {
  const Trace = (withNoise) => {
    let state = CreateGame("L1", 2);
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

// ===========================================================================
// 六、反地道四选一（烟/爆/攻入/封堵各至少可达一次，全部先电报后执行）
// ===========================================================================

Check("反地道：烟攻先电报后点烟，蔓延被关门阻断", () => {
  let state = SurgeryGame("L2", 1);
  state.tunnels.entrances["2,2"].known = true;
  state.tunnels.edges[EdgeKey("2,2", "2,3")].door = "closed";      // 关门隔离 2,3
  MakeColumn(state, "tSmoke", ["sapper", "inf"], "3,1");
  let outcome = EndTurn(state);
  state = outcome.state;
  Ok(state.enemy.pendingOps.some((op) => op.kind === "smoke"), "未宣布烟攻");
  Ok(outcome.events.some((event) => event.kind === "telegraph" && event.visible), "烟攻电报应可见");
  const chargesBefore = state.wave.smokeCharges;
  const poolBefore = state.wave.pool;
  outcome = EndTurn(state);
  state = outcome.state;
  Eq(state.wave.smokeCharges, chargesBefore - 1, "烟具未扣");
  Ok(state.wave.pool <= poolBefore - CFG.pool.smokeSelfCost, "烟攻未自耗行动力池");
  Ok(state.tunnels.cells["2,2"].smoke > 0, "口下格未起烟");
  state = EndTurn(state).state;
  state = EndTurn(state).state;
  Ok(state.tunnels.cells["3,2"].smoke > 0, "开放边未蔓延");
  Eq(state.tunnels.cells["2,3"].smoke, 0, "关闭的隔断门没能挡烟");
});

Check("反地道：爆破毁口并波及格内单位", () => {
  let state = SurgeryGame("L2", 1);
  state.wave.smokeCharges = 0;                                     // 逼 AI 选爆破
  state.tunnels.entrances["2,2"].known = true;
  const defender = state.units.u1;                                  // 民兵下地站在口下
  defender.layer = "under";
  defender.pos = "2,2";
  MakeColumn(state, "tBlast", ["sapper", "inf"], "3,1");
  state = EndTurn(state).state;
  Ok(state.enemy.pendingOps.some((op) => op.kind === "blast"), "未宣布爆破");
  state = EndTurn(state).state;
  Ok(!state.tunnels.entrances["2,2"], "爆破后入口应被摧毁");
  Eq(state.units.u1.hp, unitDefinitions.militia.hp - CFG.blastDamage, "爆破波及伤害不对");
});

Check("反地道：攻入遇驻守 → 敌折一班且中止；无驻守 → 内容进账本", () => {
  // 有驻守
  let state = SurgeryGame("L2", 1);
  state.wave.smokeCharges = 0;
  state.tunnels.entrances["2,2"].known = true;
  state.units.u1.layer = "under";
  state.units.u1.pos = "2,2";
  MakeColumn(state, "tBreach", ["inf", "inf"], "3,1");
  state = EndTurn(state).state;
  Ok(state.enemy.pendingOps.some((op) => op.kind === "breach"), "未宣布攻入");
  const enemiesBefore = EnemyUnits(state).length;
  state = EndTurn(state).state;
  Eq(EnemyUnits(state).length, enemiesBefore - 1, "驻守未折敌一班");
  Ok(state.tunnels.entrances["2,2"] && !state.tunnels.entrances["2,2"].sealed, "驻守成功后入口应保住");
  // 无驻守
  state = SurgeryGame("L2", 1);
  state.wave.smokeCharges = 0;
  state.tunnels.entrances["2,2"].known = true;
  state.tunnels.cells["2,2"].grain = 3;
  state.tunnels.cells["2,2"].civs = 2;
  MakeColumn(state, "tBreach2", ["inf", "inf"], "3,1");
  const seizedBefore = state.ledger.grainSeized;
  state = EndTurn(state).state;
  state = EndTurn(state).state;
  Ok(!state.tunnels.entrances["2,2"], "无驻守攻入应毁口");
  Ok(state.ledger.grainSeized >= seizedBefore + 3, "洞藏粮应被夺进账本");
  Eq(state.tunnels.cells["2,2"].grain, 0, "储粮洞应被搬空");
  Eq(state.ledger.civCaptured, 2, "藏身群众应被捕进账本");
});

Check("反地道：封堵（L1 兜底）先电报后填死", () => {
  let state = SurgeryGame("L1", 1);
  state.tunnels.entrances["3,1"].known = true;
  MakeColumn(state, "tSeal", ["puppet"], "4,1");
  state = EndTurn(state).state;
  Ok(state.enemy.pendingOps.some((op) => op.kind === "seal"), "未宣布封堵");
  state = EndTurn(state).state;
  Ok(state.tunnels.entrances["3,1"].sealed, "封堵未生效");
});

// ===========================================================================
// 七、憋闷链
// ===========================================================================

Check("憋闷链：无风分区累计 3 → 被迫出洞先于敌利用；同格有敌则群众被捕", () => {
  let state = SurgeryGame("L1", 1);
  state.units.u1.layer = "under"; state.units.u1.pos = "3,1";
  state.tunnels.cells["3,1"].civs = 2;
  state.tunnels.smokeOps.push({ origin: "3,1", spreadLeft: 0, lingerLeft: 99, cells: ["3,1"] });
  MakeColumn(state, "tCamp", ["inf"], "3,1");            // 敌就蹲在口上
  let forcedTurn = null;
  for (let i = 0; i < 4 && !forcedTurn; i += 1) {
    const outcome = EndTurn(state);
    state = outcome.state;
    if (outcome.events.some((event) => event.kind === "forcedOut" || (event.kind === "ledger" && event.text.includes("被抓")))) {
      forcedTurn = state.meta.turn;
    }
  }
  Ok(forcedTurn !== null, "憋闷未逼人出洞");
  Eq(state.units.u1.layer, "surface", "单位应被憋出地面");
  Eq(state.ledger.civCaptured, 2, "口上有敌：出洞群众应被捕入账本");
  Eq(state.tunnels.cells["3,1"].civs, 0, "群众批应已离洞");
});

Check("憋闷链：通风口被烟熏后分区开始积憋闷", () => {
  let state = SurgeryGame("L1", 1);
  state.tunnels.entrances["3,1"].sealed = true;          // 只剩通风口
  state.tunnels.cells["3,1"].facility = "vent";
  state.tunnels.vents["3,1"] = { expose: 0, known: false, smoked: false };
  state.units.u1.layer = "under"; state.units.u1.pos = "3,1";
  state = EndTurn(state).state;
  Eq(state.units.u1.breath, 0, "通风口完好时不应憋闷");
  state.tunnels.smokeOps.push({ origin: "3,1", spreadLeft: 0, lingerLeft: 99, cells: ["3,1"] });
  state = EndTurn(state).state;
  Ok(state.units.u1.breath > 0, "通风口被熏后应开始积憋闷");
});

// ===========================================================================
// 八、预算比率（理想全功能网单位回合 / 备战窗口单位回合 ∈ [1.05, 1.5]）
// ===========================================================================

Check("预算比率：L1 与 L2 均落在 [1.05, 1.5]", () => {
  const digCrew = (types) => types.reduce((sum, type) => sum + (CFG.digPower[type] || 0), 0);
  // L1：储粮+藏人+通风+枪眼 + 村内两段 + 坟地一段 + 坟地备用口
  const l1Need = CFG.dig.facility * 4 + CFG.dig.segmentVillage * 2 + CFG.dig.segment + CFG.dig.entrance;
  const l1Window = (GetLevel("L1").sweepStartTurn - 1) * digCrew(["militia", "militia", "guerrilla"]);
  const l1Ratio = l1Need / l1Window;
  // L2：双储粮/双藏人/双通风/双枪眼 + 主干三段 + 两备用口 + 两门 + 柳条峪延伸七段
  const l2Need = CFG.dig.facility * 8 + CFG.dig.segment * 3 + CFG.dig.entrance * 2 + CFG.dig.door * 2 + CFG.dig.segment * 7;
  const l2MainTurn = BuildSchedule(GetLevel("L2"), {}).find((wave) => wave.id === "w2main").turn;
  const l2Window = (l2MainTurn - 1) * digCrew(["militia", "militia", "militia", "guerrilla", "guerrilla"]);
  const l2Ratio = l2Need / l2Window;
  for (const [name, ratio] of [["L1", l1Ratio], ["L2", l2Ratio]]) {
    Ok(ratio >= 1.05 - 1e-9 && ratio <= 1.5 + 1e-9, `${name} 预算比率 ${ratio.toFixed(3)} 出界`);
  }
});

// ===========================================================================
// 九、账本红线 + kills 封顶
// ===========================================================================

Check("账本红线：只增不减、拒绝负数、不进任何加成路径", () => {
  const state = CreateGame("L1", 6);
  AddLedger(state, "civDead", -5);
  Eq(state.ledger.civDead, 0, "负数进账应被拒绝");
  AddLedger(state, "civDead", 2);
  Eq(state.ledger.civDead, 2);
  const final = rank.L1.Skilled[0];
  const inflated = CloneState(final);
  for (const key of Object.keys(inflated.ledger)) inflated.ledger[key] += 5;
  const a = ComputeBreakdown(final, true).total;
  const b = ComputeBreakdown(inflated, true).total;
  Ok(b <= a, "账本膨胀反而抬高了数值分——存在奖励路径");
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
  const base = CloneState(rank.L1.Skilled[0]);
  base.score.kills = { inf: 6, puppet: 0, spy: 0, sapper: 0 };
  const capped = CloneState(base);
  capped.score.kills = { inf: 20, puppet: 5, spy: 3, sapper: 2 };
  Eq(ComputeBreakdown(capped, true).kills, ComputeBreakdown(base, true).kills, "breakdown 战果项未封顶");
});

// ===========================================================================
// 十、R2 承重墙回归（盲审五项 FAIL 的逐条锁死；每条都能单独变红）
// ===========================================================================

/** 让一个单位站到指定地下格，便于做外科手术式断言。 */
function PutUnder(state, unitId, key) {
  state.units[unitId].layer = "under";
  state.units[unitId].pos = key;
  state.units[unitId].acted = false;
  state.units[unitId].mp = UnitDef(state.units[unitId]).mp;
}

/** 用一段确定的动作序列跑一局（非法即抛），用于复验盲审的原始反例。 */
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

const FirstIdle = (state) => AllyUnits(state).find((unit) => !unit.acted) || null;
const Acts = (state, unit) => LegalActions(state, unit.id);
const Pick = (actions, type, extra) => actions.find((a) => a.type === type && (!extra || extra(a))) || null;

Check("R2 P0-1：挖一段/修一设施 → 同气区各口 +1，开新口 +2；掩土 -2 且每人每局限 3 次", () => {
  let state = SurgeryGame("L1", 1);                       // 已进入扫荡期：证明「全程结算」不是只在扫荡开始那一瞬
  Eq(state.wave.status, "sweep", "外科局应在扫荡期");
  const before = state.tunnels.entrances["3,1"].expose;
  PutUnder(state, "u1", "3,1");
  state = Step(state, { type: "Dig", unit: "u1", target: "3,2" }).state;   // 民兵挖掘力 2 = 村庄段一次挖通
  Ok(state.tunnels.cells["3,2"], "村庄段应一次挖通");
  Eq(state.tunnels.entrances["3,1"].expose, before + CFG.exposePerWork, "挖通一段未给同气区的口记豆");
  PutUnder(state, "u2", "3,2");
  const beforeFacility = state.tunnels.entrances["3,1"].expose;
  state = Step(state, { type: "DigFacility", unit: "u2", cell: "3,2", facility: "storage" }).state;
  Eq(state.tunnels.entrances["3,1"].expose, beforeFacility + CFG.exposePerWork, "修成设施未记豆");
  PutUnder(state, "u1", "3,2");
  state = Step(state, { type: "DigEntrance", unit: "u1", at: "3,2" }).state;
  Eq(state.tunnels.entrances["3,2"].expose, CFG.exposeNewEntrance, "新开口应自带 +2 豆");
  // 掩土：唯一的减法，每人每局 3 次
  state.tunnels.entrances["3,1"].expose = 20;
  state.units.u1.layer = "surface"; state.units.u1.pos = "3,1";
  for (let i = 0; i < CFG.coverUsesPerUnit; i += 1) {
    const expose = state.tunnels.entrances["3,1"].expose;
    state.units.u1.acted = false;
    state = Step(state, { type: "CoverTraces", unit: "u1" }).state;
    Eq(state.tunnels.entrances["3,1"].expose, expose - CFG.coverTracesAmount, `第 ${i + 1} 次掩土未减豆`);
  }
  state.units.u1.acted = false;
  Ok(!LegalActions(state, "u1").some((a) => a.type === "CoverTraces"), "掩土次数用尽后不该再出现在合法动作里");
  Ok(PerformAction(state, { type: "CoverTraces", unit: "u1" }).illegal, "第 4 次掩土应被拒绝");
});

Check("R2 P0-3：无风分区憋满 3 回合 → 人与群众被推到地面（不是原地掉血致死）", () => {
  let state = SurgeryGame("L1", 1);
  state.tunnels.entrances["3,1"].sealed = true;           // 封死唯一的口：无风、且没有常规出口
  PutUnder(state, "u1", "3,1");
  state.tunnels.cells["3,1"].civs = 2;
  const hpBefore = state.units.u1.hp;
  let forced = false;
  for (let i = 0; i < 4 && !forced; i += 1) {
    const outcome = EndTurn(state);
    state = outcome.state;
    forced = outcome.events.some((event) => event.kind === "forcedOut");
  }
  Ok(forced, "憋闷满 3 回合必须被迫出洞");
  Eq(state.units.u1.layer, "surface", "单位应被推到地面");
  Eq(state.units.u1.hp, hpBefore, "被迫出洞不该扣血（掉血只是无处可出时的退化分支）");
  Eq(state.tunnels.cells["3,1"].civs, 0, "群众批应被一并推出地道");
  Eq(state.ledger.civDead, 0, "不该出现「群众原地闷死」");
});

Check("R2 P0-4：HideGrain 要求本村格正下方有地道且连着储粮洞", () => {
  let state = CreateGame("L1", 1);
  PutUnder(state, "u1", "3,1");
  state = Step(state, { type: "DigFacility", unit: "u1", cell: "3,1", facility: "storage" }).state;
  Eq(state.units.u2.pos, "4,0");                           // u2 站在村格 4,0，但头顶一格地道也没有
  Ok(!state.tunnels.cells["4,0"], "4,0 正下方本不该有地道格");
  Ok(!LegalActions(state, "u2").some((a) => a.type === "HideGrain"), "隔空藏粮不该是合法动作");
  Ok(PerformAction(state, { type: "HideGrain", unit: "u2" }).illegal, "隔空藏粮应被拒绝");
  state.units.u1.acted = false;
  PutUnder(state, "u1", "3,1");
  state = Step(state, { type: "Dig", unit: "u1", target: "4,0" }).state;    // 把地道挖到粮囤脚底下
  state.units.u2.acted = false;
  Ok(state.tunnels.cells["4,0"] && LegalActions(state, "u2").some((a) => a.type === "HideGrain"), "挖通之后才该能藏粮");
  Ok(TunnelGrainTotal(Step(state, { type: "HideGrain", unit: "u2" }).state) > 0, "藏粮应真的入洞");
});

Check("R2 P0-5：同格至多 1 人设伏；伏击后转暴露可被还击", () => {
  let state = SurgeryGame("L1", 1);
  state.units.u1.pos = "2,2"; state.units.u1.layer = "surface";
  state.units.u3.pos = "2,2"; state.units.u3.layer = "surface";
  state = Step(state, { type: "Ambush", unit: "u1" }).state;
  Ok(!LegalActions(state, "u3").some((a) => a.type === "Ambush"), "同格第二个伏击不该合法");
  Ok(PerformAction(state, { type: "Ambush", unit: "u3" }).illegal, "同格第二个伏击应被拒绝");
  // 敌一部走进相邻格：伏击触发 → 伏击手转「暴露」并吃一次还击
  MakeColumn(state, "tAmb", ["inf"], "0,3");
  const outcome = EndTurn(state);
  state = outcome.state;
  Ok(outcome.events.some((event) => event.kind === "combat" && event.text.includes("伏击")), "伏击未触发");
  const ambusher = state.units.u1;
  Ok(!ambusher || ambusher.stance !== "ambush", "伏击后不该还留在伏击态");
  Ok(outcome.events.some((event) => event.kind === "ambush" && event.text.includes("暴露"))
    || !ambusher, "伏击后应转入暴露");
});

Check("R2 P0-5：连两回合同格设伏 → 伤害 3→1，且该格获「敌已警戒」标记", () => {
  let state = SurgeryGame("L1", 1);
  state.units.u1.pos = "2,2";
  state = Step(state, { type: "Ambush", unit: "u1" }).state;
  state.meta.turn += 1;                                    // 跨一回合，伏击态持续
  state.units.u1.acted = false;
  state.units.u1.stance = "normal";
  const again = Pick(LegalActions(state, "u1"), "Ambush");
  Ok(again && again.stale, "第二回合同格设伏应被标记为 stale");
  state = Step(state, again).state;
  Ok((state.map.hexes["2,2"].alertedUntil || 0) >= state.meta.turn, "该格应获「敌已警戒」标记");
  Ok(state.units.u1.ambushStale, "该伏击应被记为老地方");
  MakeColumn(state, "tStale", ["inf"], "0,3");
  const outcome = EndTurn(state);
  const hit = outcome.events.find((event) => event.kind === "combat" && event.text.includes("伏击"));
  Ok(hit, "伏击未触发");
  Ok(hit.text.includes(`伤 ${CFG.staleAmbushDamage}`), `老地方伏击伤害应降为 ${CFG.staleAmbushDamage}：${hit.text}`);
  // 边界：ambushSetTurn 缺省 0，T1 的 `0 === turn-1` 会把全新格误判成老地方
  const fresh = CreateGame("L1", 1);
  Eq(fresh.meta.turn, 1);
  for (const unitId of ["u1", "u2", "u3"]) {
    for (const act of LegalActions(fresh, unitId).filter((a) => a.type === "Ambush")) Ok(!act.stale, "T1 首次设伏被误判为老地方");
  }
  const first = LegalActions(fresh, "u1").find((a) => a.type === "Ambush");
  if (first) Eq(Step(fresh, first).state.map.hexes[fresh.units.u1.pos].alertedUntil || 0, 0, "T1 首次设伏不该挂警戒");
});

Check("R2 P0-5：伏击改为持续状态——不移动不换动作就一直守着", () => {
  let state = SurgeryGame("L1", 1);
  state.units.u1.pos = "2,2";
  state = Step(state, { type: "Ambush", unit: "u1" }).state;
  state = EndTurn(state).state;
  Eq(state.units.u1.stance, "ambush", "跨回合后伏击态应保留（不必每回合重按）");
  Ok(!LegalActions(state, "u1").some((a) => a.type === "Ambush"), "已在伏击态不该再出现 Ambush");
  const moved = Step(state, { type: "Move", unit: "u1", path: ["2,3"] }).state;
  Eq(moved.units.u1.stance, "normal", "移动应解除伏击");
});

Check("R2 P0-6a：L1 胜负只认洞存粮——洞里 9 担判负、10 担判胜", () => {
  const Finish = (tunnelGrain) => {
    let state = CreateGame("L1", 1);
    state.map.villages.v1.grainOpen = 0;
    state.tunnels.cells["3,1"].facility = "storage";
    state.tunnels.cells["3,1"].grain = tunnelGrain;
    state.meta.turn = GetLevel("L1").maxTurns;
    state.wave.schedule = [];
    state.wave.revenge = null;
    return EndTurn(state).state.result;
  };
  Ok(!Finish(9).won, "洞存粮 9 应判负");
  Ok(Finish(10).won, "洞存粮 10 应判胜");
});

Check("R2 P0-6c：L1 的 seed 是真变量——12 个 seed 不再逐字节相同", () => {
  const prints = new Set(); const axes = new Set(); const mixes = new Set(); const arrivals = new Set();
  for (let seed = 1; seed <= 12; seed += 1) {
    const { state } = RunBotGame({ level: "L1", seed, bot: "Skilled" });
    prints.add([state.result.grade, state.result.medals.join(""), GrainTotal(state), state.meta.turn,
      state.wave.pool, state.resources.ammo, JSON.stringify(state.ledger), state.wave.withdrawTurn].join("/"));
    axes.add(state.wave.plan.axisId); mixes.add(state.wave.plan.mixId); arrivals.add(state.wave.plan.arriveTurn);
  }
  Ok(prints.size >= 4, `12 个 seed 只跑出 ${prints.size} 种终局`);
  Ok(axes.size >= 2 && mixes.size >= 2 && arrivals.size >= 3,
    `排班变量太少：轴线 ${axes.size} 种 / 配比 ${mixes.size} 种 / 到达回合 ${arrivals.size} 种`);
});

Check("R2 复验盲审两大反例：零地道流必输、复读伏击流拿不到满勋记", () => {
  const NoDig = (state) => {
    const unit = FirstIdle(state);
    if (!unit) return { type: "EndTurn" };
    const actions = Acts(state, unit);
    return Pick(actions, "Ambush") || Pick(actions, "Hide") || Pick(actions, "Rest") || { type: "Rest", unit: unit.id };
  };
  const spot = "4,0";                                   // 盲审局 3 用的就是这一格（村庄 + 大车路）
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
    const noDig = PlayWith("L1", seed, NoDig);
    Ok(noDig.result && !noDig.result.won, `seed${seed}：零地道流竟然赢了（${noDig.result && noDig.result.grade}）`);
    Eq(TunnelGrainTotal(noDig), 0, "零地道流不该有洞存粮");
    const spam = PlayWith("L1", seed, Spam);
    Ok(spam.result && spam.result.grade !== "甲", `seed${seed}：复读伏击流仍评到 ${spam.result && spam.result.grade}`);
  }
});

/** 「只挖不掩土」流：挖网 + 藏粮 + 藏人，但从不掩土——最常见的新手打法。
 *  暴露豆全程结算之后，这一流必然把敌人引到自己的口上来（P0-1 与 P0-2 的联合验收）。 */
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
        for (const [kind, word] of [["smoke", "烟自"], ["blast", "炸毁"], ["breach", "攻入"], ["seal", "填死"]]) {
          if (event.text.includes(word)) kinds.add(kind);
        }
      }
      state = outcome.state;
    }
    for (const key of Object.keys(ledger)) ledger[key] = Math.max(ledger[key], state.ledger[key]);
  }
  return { kinds, ledger };
}

const diggerL1 = ScanOps("L1", [1, 2, 3, 4, 5, 6]);
const diggerL2 = ScanOps("L2", [1, 2, 3, 4, 5, 6]);

Check("R2 P0-2：只挖不掩土 → 敌真的会烟攻/爆破/攻入/封堵（多 seed 实际触发）", () => {
  Ok(diggerL1.kinds.has("smoke"), `L1 多 seed 未触发烟攻（实得 ${[...diggerL1.kinds].join("/") || "无"}）`);
  Ok(diggerL1.kinds.has("seal"), "L1 多 seed 未触发封堵");
  Ok(diggerL2.kinds.has("smoke"), `L2 多 seed 未触发烟攻（实得 ${[...diggerL2.kinds].join("/") || "无"}）`);
  Ok(diggerL1.kinds.has("blast") || diggerL2.kinds.has("blast"), "多 seed 未触发爆破");
  Ok(diggerL2.kinds.has("breach"), "L2 多 seed 未触发攻入");
});

Check("R2 P1：弹药收支严格为负（缴获补不回消耗）", () => {
  const totalLoot = Object.values(CFG.loot).reduce((sum, value) => sum + value, 0);
  Ok(CFG.loot.inf < 2 * CFG.ammoPerAttack, "打死一个日军班要两枪，缴获不该 ≥2");
  Ok(CFG.loot.puppet < CFG.ammoPerAttack, "打死一个伪军队缴获不该抵得回一枪");
  Ok(totalLoot > 0, "缴获仍应是唯一来源，不能归零");
  for (const seed of [1, 2, 3, 4, 5]) {
    const { state } = RunBotGame({ level: "L1", seed, bot: "Skilled" });
    const kills = state.score.kills;
    const totalKills = kills.inf + kills.puppet + kills.spy + kills.sapper;
    if (totalKills > 0) {
      Ok(state.resources.ammo < GetLevel("L1").ammoStart,
        `seed${seed}：打了 ${totalKills} 个还没净消耗弹药（${state.resources.ammo}）`);
    }
  }
});

Check("R2 P1：代价簿四栏在正常游玩中都会动（不再是三栏恒 0）", () => {
  const moved = { civCaptured: 0, civDead: 0, housesBurned: 0, grainSeized: 0 };
  for (const level of ["L1", "L2"]) {
    for (const bot of ["Skilled", "Turtle", "Random"]) {
      for (const seed of [1, 2, 3, 4]) {
        const { state } = RunBotGame({ level, seed, bot });
        for (const key of Object.keys(moved)) if (state.ledger[key] > 0) moved[key] += 1;
      }
    }
  }
  for (const key of Object.keys(moved)) {
    if (diggerL1.ledger[key] > 0) moved[key] += 1;
    if (diggerL2.ledger[key] > 0) moved[key] += 1;
  }
  for (const key of ["civCaptured", "housesBurned", "grainSeized"]) {
    Ok(moved[key] > 0, `代价簿 ${key} 在 26 局里一次都没动过`);
  }
  // civDead 按 §2.8 只该由「爆破塌方 / 彻底无路可出」造成（烟只逼人出洞，不直接杀伤）——
  // 这一栏用确定性场景锁死，不靠概率。
  let state = SurgeryGame("L2", 1);
  state.wave.smokeCharges = 0;
  state.tunnels.entrances["2,2"].known = true;
  state.tunnels.cells["2,2"].facility = "shelter";
  state.tunnels.cells["2,2"].civs = 2;
  MakeColumn(state, "tBlastCiv", ["sapper", "inf"], "3,1");
  state = EndTurn(state).state;
  state = EndTurn(state).state;
  Ok(state.ledger.civDead >= 2, `爆破塌方未把藏身群众记入代价簿（civDead=${state.ledger.civDead}）`);
});

Check("R2 P1：同格可攻击 · 民兵开阔地可挖散兵坑 · L1 石桥可破且破后敌绕行", () => {
  let state = SurgeryGame("L1", 1);
  MakeColumn(state, "tSame", ["puppet"], state.units.u3.pos);          // 敌与游击班同格
  const shot = LegalActions(state, "u3").find((a) => a.type === "Attack" && a.sameHex);
  Ok(shot && !PerformAction(state, shot).illegal, "同格敌人必须打得着");
  let open = SurgeryGame("L1", 1);
  open.units.u1.pos = "5,0";                                           // 开阔地：无隐蔽、无入口
  const foxhole = LegalActions(open, "u1").find((a) => a.type === "Ambush" && a.site === "foxhole");
  Ok(foxhole, "民兵在开阔地应能挖散兵坑设伏");
  open = Step(open, foxhole).state;
  Eq(open.units.u1.stance, "ambush");
  Ok(open.map.hexes["5,0"].traces > 0, "挖散兵坑应留下痕迹");
  const guerrilla = SurgeryGame("L1", 1);
  guerrilla.units.u3.pos = "5,0";
  Ok(!LegalActions(guerrilla, "u3").some((a) => a.type === "Ambush"), "游击班挖不动散兵坑");
  const level = GetLevel("L1");
  Ok(level.bridgeBreakable, "L1 石桥应可破");
  let bridgeGame = SurgeryGame("L1", 1);
  const bridge = SortedKeys(bridgeGame.map.hexes).find((key) => bridgeGame.map.hexes[key].bridge && bridgeGame.map.hexes[key].road);
  bridgeGame.units.u1.pos = bridge;
  Ok(LegalActions(bridgeGame, "u1").some((a) => a.type === "BreakRoad" && a.bridge), "石桥应能 BreakRoad");
  bridgeGame.map.hexes[bridge].roadBroken = true;
  const path = EnemyPath(bridgeGame, level.exitKeys[0], "3,1");
  Ok(path && path.length && !path.includes(bridge), "桥断后仍应能绕到村里（浅滩/南土路），且不再经过断桥");
});

// ===========================================================================
// 十一、页面装配
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
  const fixture = Src("Data_FixtureState.mjs");
  Ok(fixture.includes("export const fixtureState"), "夹具导出名被改动");
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
