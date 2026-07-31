#!/usr/bin/env node
// 《地下长城 · 冀中1942》 —— 数值平衡批量模拟：四 bot × L1/L2 × 多 seed。
// 输出：胜率、评级分布、平均扫荡实际回合、弹药曲线、代价账本均值对比表。
// 用法：node TunnelFront1942/Script_Balance.mjs [--seeds 8]

import process from "node:process";
import { GetLevel } from "./Data_Levels.mjs";
import { GrainTotal, PopTotal, WoundedTotal } from "./Script_State.mjs";
import { RunBotGame, botNames } from "./Script_Bots.mjs";

const seedCount = Math.max(8, Number((process.argv.find((arg) => arg.startsWith("--seeds")) || "").split("=")[1]
  || process.argv[process.argv.indexOf("--seeds") + 1] || 8) || 8);
const seeds = Array.from({ length: seedCount }, (_, index) => index + 1);

function RunCell(level, bot) {
  const stats = {
    games: 0, wins: 0, grades: { "甲": 0, "乙": 0, "丙": 0, "丁": 0 },
    sweepTurnsSum: 0, totalSum: 0, grainSum: 0, popSum: 0, woundedSum: 0, killsSum: 0, lostSum: 0,
    ledgerSum: { civCaptured: 0, civDead: 0, housesBurned: 0, grainSeized: 0 },
    ammoByTurn: [],       // ammoByTurn[t] = { sum, n }
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
    stats.grades[result.grade] = (stats.grades[result.grade] || 0) + 1;
    const sweepEnd = state.wave.doneTurn ?? state.meta.turn;
    stats.sweepTurnsSum += Math.max(0, sweepEnd - state.wave.sweepStartTurn + 1);
    stats.totalSum += result.breakdown.total;
    stats.grainSum += GrainTotal(state);
    stats.popSum += PopTotal(state);
    stats.woundedSum += WoundedTotal(state);
    const kills = state.score.kills;
    stats.killsSum += kills.inf + kills.puppet + kills.spy + kills.sapper;
    stats.lostSum += state.score.alliesLost;
    for (const key of Object.keys(stats.ledgerSum)) stats.ledgerSum[key] += state.ledger[key];
  }
  return stats;
}

function Avg(sum, n, digits = 1) {
  return (sum / n).toFixed(digits);
}

function AmmoCurve(stats) {
  const points = [];
  for (let turn = 1; turn < stats.ammoByTurn.length; turn += 1) {
    const cell = stats.ammoByTurn[turn];
    if (cell && cell.n > 0) points.push(`T${turn}:${(cell.sum / cell.n).toFixed(1)}`);
  }
  // 稀释显示：至多 8 个采样点
  const step = Math.max(1, Math.ceil(points.length / 8));
  return points.filter((_, index) => index % step === 0 || index === points.length - 1).join(" ");
}

console.log(`—— TunnelFront1942 平衡批量模拟：${botNames.length} bot × L1/L2 × ${seeds.length} seeds ——`);
const startedAt = Date.now();
for (const level of ["L1", "L2"]) {
  const def = GetLevel(level);
  console.log(`\n【${level}·${def.name}】（${def.maxTurns} 回合，池 ${def.pool}）`);
  console.log("bot      胜率    评级[甲/乙/丙/丁]  均分   扫荡均长  歼敌均  折损均  终局粮均  账本均[抓/亡/焚/夺粮]");
  for (const bot of botNames) {
    const s = RunCell(level, bot);
    const grades = `${s.grades["甲"]}/${s.grades["乙"]}/${s.grades["丙"]}/${s.grades["丁"]}`;
    const ledger = ["civCaptured", "civDead", "housesBurned", "grainSeized"]
      .map((key) => Avg(s.ledgerSum[key], s.games)).join("/");
    console.log(`${bot.padEnd(8)} ${String(Math.round(100 * s.wins / s.games)).padStart(3)}%    ${grades.padEnd(12)}  ${Avg(s.totalSum, s.games, 0).padStart(4)}   ${Avg(s.sweepTurnsSum, s.games).padStart(5)}    ${Avg(s.killsSum, s.games).padStart(4)}   ${Avg(s.lostSum, s.games).padStart(4)}   ${Avg(s.grainSum, s.games).padStart(5)}    ${ledger}`);
    console.log(`         弹药曲线 ${AmmoCurve(s)}`);
  }
}
console.log(`\n（用时 ${((Date.now() - startedAt) / 1000).toFixed(1)}s；胜负与数值全确定，同 seed 结果可复现。）`);
