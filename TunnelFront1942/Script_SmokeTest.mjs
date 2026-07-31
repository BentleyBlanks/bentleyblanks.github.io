#!/usr/bin/env node
// 《地下长城 · 冀中1942》 —— node 冒烟测试（AGENTS.md §7.1 清单逐条落地）。
// 退出码即成败；彩色 PASS/FAIL 汇总；目标总时长 <90 秒。

import { readFileSync, existsSync } from "node:fs";
import process from "node:process";
import { HexKey, ParseHexKey, HexNeighborKeys, HexDistanceKeys } from "./Script_Hex.mjs";
import { CFG, unitDefinitions } from "./Data_Rules.mjs";
import { GetLevel, levelDefinitions } from "./Data_Levels.mjs";
import {
  CreateGame, CloneState, SerializeState, DeserializeState, HashState, MakeEnemyUnit,
  AddLedger, GrainTotal, PopTotal, SortedKeys, EdgeKey, AllyUnits, EnemyUnits, UnitDef,
} from "./Script_State.mjs";
import { DeriveView, RecordSighting } from "./Script_Visibility.mjs";
import { LegalActions, PerformAction } from "./Script_Actions.mjs";
import { EndTurn, KillsScore, ComputeBreakdown } from "./Script_Turn.mjs";
import { RenderAsciiMap } from "./Script_AsciiMap.mjs";
import { RunBotGame } from "./Script_Bots.mjs";

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

Check("双时钟：袭扰 → 撤退比纯躲提前 ≥2 回合", () => {
  for (let i = 0; i < rankSeeds.length; i += 1) {
    const harass = rank.L1.Skilled[i].wave.withdrawTurn ?? (rank.L1.Skilled[i].wave.hardEndTurn + 1);
    const turtle = rank.L1.Turtle[i].wave.withdrawTurn ?? (rank.L1.Turtle[i].wave.hardEndTurn + 1);
    Ok(turtle - harass >= 2, `seed${rankSeeds[i]}：袭扰 T${harass} vs 纯躲 T${turtle}，差 <2`);
  }
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
  state = EndTurn(state).state;
  state = EndTurn(state).state;
  Ok(!state.tunnels.entrances["2,2"], "无驻守攻入应毁口");
  Eq(state.ledger.grainSeized, 3, "洞藏粮应被夺进账本");
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
  const l2MainTurn = GetLevel("L2").waves.find((wave) => wave.id === "w2main").turn;
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
// 十、页面装配
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
