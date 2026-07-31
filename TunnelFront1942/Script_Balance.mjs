#!/usr/bin/env node
// 《地下长城 · 冀中1942》 —— 数值平衡批量模拟：四 bot × **五幕 A1~A5** × 多 seed。
// 输出三张表：
//   ① 逐幕逐 bot：胜率、评级分布、群众保全、洞存粮、代价账本均值、弹药曲线；
//   ② 胜利线节奏：会玩 bot 的洞粮线首次达标回合（R5 P0-6：不能第三四回合就达标）；
//   ③ 敌方反地道作业触发率：烟/水/爆/攻入/刨口/封堵各在多少个 seed 里真的发生过
//      （R5 P0-5 的验收口径；「只挖不掩土」的常见新手线与会玩线分开统计）。
// 用法：node TunnelFront1942/Script_Balance.mjs [--seeds 8]

import process from "node:process";
import { GetLevel, campaignOrder } from "./Data_Levels.mjs";
import {
  GrainTotal, TunnelGrainTotal, CivSafeCount, CivTotal, CreateGame,
} from "./Script_State.mjs";
import { LegalActions, PerformAction } from "./Script_Actions.mjs";
import { EndTurn } from "./Script_Turn.mjs";
import { RunBotGame, botNames } from "./Script_Bots.mjs";

const seedCount = Math.max(8, Number((process.argv.find((arg) => arg.startsWith("--seeds")) || "").split("=")[1]
  || process.argv[process.argv.indexOf("--seeds") + 1] || 8) || 8);
const seeds = Array.from({ length: seedCount }, (_, index) => index + 1);
const acts = campaignOrder.slice();

function Avg(sum, n, digits = 1) {
  return (sum / (n || 1)).toFixed(digits);
}

// ---------------------------------------------------------------------------
// ① 逐幕逐 bot 汇总
// ---------------------------------------------------------------------------

function RunCell(level, bot) {
  const stats = {
    games: 0, wins: 0, grades: { "甲": 0, "乙": 0, "丙": 0, "丁": 0 },
    sweepTurnsSum: 0, totalSum: 0, grainSum: 0, tunnelGrainSum: 0,
    civSafeSum: 0, civTotal: 0, killsSum: 0, lostSum: 0, poolSum: 0, expelled: 0,
    ledgerSum: { civCaptured: 0, civDead: 0, housesBurned: 0, grainSeized: 0 },
    ammoByTurn: [],
  };
  for (const seed of seeds) {
    const { state } = RunBotGame({ level, seed, bot, onStep: (st, action) => {
      if (action.type !== "EndTurn") return;
      const turn = st.meta.turn;
      stats.ammoByTurn[turn] = stats.ammoByTurn[turn] || { sum: 0, n: 0 };
      stats.ammoByTurn[turn].sum += st.resources.ammo;
      stats.ammoByTurn[turn].n += 1;
    } });
    const result = state.result || { won: false, grade: "丁", breakdown: { total: 0 } };
    stats.games += 1;
    if (result.won) stats.wins += 1;
    if (state.wave.expelled) stats.expelled += 1;
    stats.grades[result.grade] = (stats.grades[result.grade] || 0) + 1;
    const sweepEnd = state.wave.doneTurn ?? state.meta.turn;
    stats.sweepTurnsSum += Math.max(0, sweepEnd - state.wave.sweepStartTurn + 1);
    stats.totalSum += result.breakdown.total;
    stats.grainSum += GrainTotal(state);
    stats.tunnelGrainSum += TunnelGrainTotal(state);
    stats.civSafeSum += CivSafeCount(state);
    stats.civTotal = CivTotal(state);
    stats.poolSum += state.wave.pool;
    const kills = state.score.kills;
    stats.killsSum += kills.inf + kills.puppet + kills.spy + kills.sapper;
    stats.lostSum += state.score.alliesLost;
    for (const key of Object.keys(stats.ledgerSum)) stats.ledgerSum[key] += state.ledger[key];
  }
  return stats;
}

function AmmoCurve(stats) {
  const points = [];
  for (let turn = 1; turn < stats.ammoByTurn.length; turn += 1) {
    const cell = stats.ammoByTurn[turn];
    if (cell && cell.n > 0) points.push(`T${turn}:${(cell.sum / cell.n).toFixed(1)}`);
  }
  const step = Math.max(1, Math.ceil(points.length / 8));
  return points.filter((_, index) => index % step === 0 || index === points.length - 1).join(" ");
}

// ---------------------------------------------------------------------------
// ② 胜利线节奏（会玩 bot 首次达到本幕洞粮线的回合）
// ---------------------------------------------------------------------------

function GrainPace(level) {
  const need = (GetLevel(level).victory || {}).tunnelGrainAtLeast || 0;
  if (!need) return null;
  const hits = [];
  for (const seed of seeds) {
    let hit = null;
    RunBotGame({ level, seed, bot: "Skilled", onStep: (st, action) => {
      if (action.type !== "EndTurn" || hit !== null) return;
      if (TunnelGrainTotal(st) >= need) hit = st.meta.turn;
    } });
    hits.push(hit);
  }
  const got = hits.filter((turn) => turn !== null);
  return { need, hits, reached: got.length,
    avg: got.length ? got.reduce((sum, turn) => sum + turn, 0) / got.length : null };
}

// ---------------------------------------------------------------------------
// ③ 反地道作业触发率（R5 P0-5 的验收口径）
// ---------------------------------------------------------------------------

const opWords = [["smoke", "烟自"], ["flood", "水自"], ["blast", "炸毁"],
  ["breach", "无人驻守"], ["excavate", "刨塌"], ["seal", "填死"]];
const opNames = { smoke: "烟", flood: "水", blast: "爆", breach: "攻入", excavate: "刨口", seal: "封堵" };

/** 「只挖不掩土」的常见新手线：挖网 + 藏粮 + 藏人，从不掩土、从不塌口。 */
function DiggerLine(state) {
  for (const id of Object.keys(state.units).sort()) {
    const unit = state.units[id];
    if (unit.side !== "ally" || unit.hp <= 0 || unit.acted) continue;
    const actions = LegalActions(state, unit.id);
    const pick = (type, extra) => actions.find((a) => a.type === type && (!extra || extra(a)));
    const chosen = pick("Dig") || pick("DigFacility") || pick("DigEntrance")
      || pick("UseEntrance", (a) => !a.dive) || pick("HideGrain") || pick("MoveCivs")
      || (unit.layer === "surface" ? actions.find((a) => a.type === "Move") : null) || pick("Rest");
    if (chosen) return chosen;
  }
  return { type: "EndTurn" };
}

function OpRates(level, mode) {
  const count = { smoke: 0, flood: 0, blast: 0, breach: 0, excavate: 0, seal: 0 };
  for (const seed of seeds) {
    const seen = new Set();
    const Collect = (events) => {
      for (const event of events || []) {
        if (event.kind !== "op") continue;
        for (const [kind, word] of opWords) if (event.text.includes(word)) seen.add(kind);
      }
    };
    if (mode === "Skilled") {
      RunBotGame({ level, seed, bot: "Skilled", onStep: (st, action, events) => Collect(events) });
    } else {
      let state = CreateGame(level, seed);
      for (let step = 0; step < 3000 && !state.result; step += 1) {
        const action = DiggerLine(state);
        let outcome = action.type === "EndTurn" ? EndTurn(state) : PerformAction(state, action);
        if (outcome.illegal) { outcome = EndTurn(state); if (outcome.illegal) break; }
        Collect(outcome.events);
        state = outcome.state;
      }
    }
    for (const kind of seen) count[kind] += 1;
  }
  return count;
}

// ---------------------------------------------------------------------------
// 输出
// ---------------------------------------------------------------------------

console.log(`—— TunnelFront1942 平衡批量模拟：${botNames.length} bot × 五幕 A1~A5 × ${seeds.length} seeds ——`);
const startedAt = Date.now();

for (const level of acts) {
  const def = GetLevel(level);
  const need = (def.victory || {}).tunnelGrainAtLeast || 0;
  console.log(`\n【${level}·${def.name}】${def.maxTurns} 回合，池 ${def.pool}，洞粮线 ${need || "—"}，仓容 ${def.storageCap}/洞`);
  console.log("bot      胜率  评级[甲/乙/丙/丁] 均分  扫荡均长 保全均 洞粮均 歼敌 折损 终池 逼退  账本均[抓/亡/焚/夺粮]");
  for (const bot of botNames) {
    const s = RunCell(level, bot);
    const grades = `${s.grades["甲"]}/${s.grades["乙"]}/${s.grades["丙"]}/${s.grades["丁"]}`;
    const ledger = ["civCaptured", "civDead", "housesBurned", "grainSeized"]
      .map((key) => Avg(s.ledgerSum[key], s.games)).join("/");
    console.log(`${bot.padEnd(8)} ${String(Math.round(100 * s.wins / s.games)).padStart(3)}%  ${grades.padEnd(11)} `
      + `${Avg(s.totalSum, s.games, 0).padStart(4)}  ${Avg(s.sweepTurnsSum, s.games).padStart(6)}  `
      + `${Avg(s.civSafeSum, s.games).padStart(4)}/${s.civTotal} ${Avg(s.tunnelGrainSum, s.games).padStart(5)} `
      + `${Avg(s.killsSum, s.games).padStart(4)} ${Avg(s.lostSum, s.games).padStart(4)} `
      + `${Avg(s.poolSum, s.games).padStart(5)} ${String(s.expelled).padStart(3)}  ${ledger}`);
    console.log(`         弹药曲线 ${AmmoCurve(s)}`);
  }
}

console.log("\n—— ② 胜利线节奏（会玩 bot 首次达到洞粮线的回合；R5 P0-6：不能第三四回合就达标）——");
console.log("幕   洞粮线  幕长  达标 seed  首次达标回合（均 / 明细）");
for (const level of acts) {
  const pace = GrainPace(level);
  if (!pace) { console.log(`${level}   —      ${String(GetLevel(level).maxTurns).padStart(2)}    —         本幕不以洞存粮定胜负`); continue; }
  console.log(`${level}   ${String(pace.need).padStart(3)}    ${String(GetLevel(level).maxTurns).padStart(2)}    ${pace.reached}/${seeds.length}       `
    + `${pace.avg === null ? "—" : pace.avg.toFixed(1)}  [${pace.hits.map((turn) => turn ?? "-").join(",")}]`);
}

console.log("\n—— ③ 反地道作业触发率（每种作业「至少发生一次」的 seed 数；R5 P0-5 验收口径）——");
for (const mode of ["Digger", "Skilled"]) {
  console.log(`\n  ${mode === "Digger" ? "只挖不掩土（常见新手线）" : "会玩线（会塌口、会掩土，压得住动静）"}`);
  console.log("  幕    烟    水    爆   攻入  刨口  封堵   | 本幕开放");
  for (const level of acts) {
    const open = new Set(GetLevel(level).enemyOps || []);
    const rates = OpRates(level, mode);
    const cell = (kind) => (open.has(kind) ? String(rates[kind]) : "—").padStart(4);
    console.log(`  ${level} ${cell("smoke")} ${cell("flood")} ${cell("blast")} ${cell("breach")} `
      + `${cell("excavate")} ${cell("seal")}   | ${[...open].map((kind) => opNames[kind]).join("")}`);
  }
}

console.log(`\n（用时 ${((Date.now() - startedAt) / 1000).toFixed(1)}s；胜负与数值全确定，同 seed 结果可复现。）`);
