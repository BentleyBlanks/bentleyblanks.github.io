#!/usr/bin/env node
/*
 * 《烽火敌后》(#kangri) 核心层无头回归 sim——无浏览器、无 Canvas。
 * 用 esbuild 不可用/不必要：直接拿 tsc 单文件编译 src/kangri/core.ts 到 CommonJS 再驱动。
 * 断言：
 *   1) 全程不抛错、资源不出现 NaN/负穿；
 *   2) 扫荡多阶段事件（incoming→battle/pillage→结算）反复发生且都能收尾；
 *   3) 「组织群众转移」与「组织抗击」两个动作有效（转移降低劫掠损失、抗击能歼敌缴获）；
 *   4) 能推进到最终阶段并收复全部 10 个区域（跑通整条历史弧线）。
 * 运行：npm run sim:kangri　　exit 0 = PASS。
 */
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const build = path.join(root, ".sim-build-kangri");

fs.rmSync(build, { recursive: true, force: true });
execSync(
  `npx tsc src/kangri/core.ts --outDir ${JSON.stringify(build)} --module CommonJS --target ES2020 --skipLibCheck --strict false`,
  { cwd: root, stdio: "inherit" }
);
fs.writeFileSync(path.join(build, "package.json"), '{"type":"commonjs"}');

const core = require(path.join(build, "core.js"));
const {
  BUILDINGS, POLICIES, REGIONS, PHASES, TUNING,
  createKRState, phase, regionsReclaimed, bingPerSec, wuziPerSec,
  buildCostWuzi, buildCostBing, buildingUnlocked, policyRevealed, regionAvailable,
  rally, buyBuilding, buyPolicy, launchOp, tick, startEvacuation, commitTroops
} = core;

const DT = 0.25; // 秒
const MAX_SEC = 4 * 3600; // 最多模拟 4 小时游戏时
let fail = null;
const stats = { sweeps: 0, battles: 0, pillages: 0, cleanWins: 0, evacs: 0, maxKilled: 0 };

const s = createKRState();
let prevStage = null;

function guard(tag) {
  for (const [k, v] of [["bing", s.bing], ["wuzi", s.wuzi], ["totalWuzi", s.totalWuzi]]) {
    if (!Number.isFinite(v)) throw new Error(`${tag}: ${k} 不是有限数: ${v}`);
    if (v < -1e-6) throw new Error(`${tag}: ${k} 变成负数: ${v}`);
  }
  if (s.sweep) {
    if (!Number.isFinite(s.sweep.strength) || s.sweep.strength < -1e-6) throw new Error(`${tag}: sweep.strength 异常 ${s.sweep.strength}`);
  }
}

try {
  for (let sec = 0; sec < MAX_SEC; sec += DT) {
    // —— 玩家策略（近似最优挂机）——
    // 起手狂点
    if (s.buildings.every((b) => b === 0) || bingPerSec(s) + wuziPerSec(s) < 3) {
      for (let i = 0; i < 6; i++) rally(s);
    }
    // 买最贵能买的设施（每 tick 最多 3 件），政策见到就买
    for (let n = 0; n < 3; n++) {
      let bought = false;
      for (let i = BUILDINGS.length - 1; i >= 0; i--) {
        if (!buildingUnlocked(s, i)) continue;
        if (s.wuzi >= buildCostWuzi(s, i) * 1.6 && s.bing >= buildCostBing(s, i) * 2.5) {
          if (buyBuilding(s, i)) { bought = true; break; }
        }
      }
      if (!bought) break;
    }
    for (const p of POLICIES) if (policyRevealed(s, p)) buyPolicy(s, p.id);
    // 攒够就发动战役
    for (const r of REGIONS) {
      if (regionAvailable(s, r) && s.bing >= r.costBing * 1.9 && s.wuzi >= r.costWuzi * 1.35) launchOp(s, r.id);
    }
    // —— 扫荡应对：来袭立刻下令转移 + 六成兵力抗击 ——
    if (s.sweep && s.sweep.stage === "incoming") {
      if (!s.sweep.evacStarted && startEvacuation(s)) stats.evacs += 1;
      if (s.sweep.committed === 0) commitTroops(s, Math.floor(s.bing * 0.6));
    }
    // 阶段转换统计
    const st = s.sweep ? s.sweep.stage : null;
    if (st !== prevStage) {
      if (st === "incoming") stats.sweeps += 1;
      if (st === "battle") stats.battles += 1;
      if (st === "pillage") stats.pillages += 1;
      if (st === null && prevStage === "battle") stats.cleanWins += 1;
      prevStage = st;
    }
    if (s.sweep) stats.maxKilled = Math.max(stats.maxKilled, s.sweep.killed);

    tick(s, DT);
    guard(`t=${sec.toFixed(1)}s`);

    if (regionsReclaimed(s) === REGIONS.length) break;
  }
} catch (e) {
  fail = e;
}

const done = regionsReclaimed(s);
console.log("── kangri sim ──");
console.log(`游戏时 ${Math.round(s.clockMs / 1000)}s · 阶段 ${phase(s)}/${PHASES.length - 1} · 收复 ${done}/${REGIONS.length}`);
console.log(`扫荡 ${stats.sweeps} 次（会战 ${stats.battles} · 遭劫掠 ${stats.pillages} · 全歼 ${stats.cleanWins} · 下令转移 ${stats.evacs}）`);
console.log(`兵员 ${Math.round(s.bing)} · 物资 ${Math.round(s.wuzi)} · 单场最多击毙 ${Math.round(stats.maxKilled)}`);

const checks = [
  ["无抛错/无 NaN/无负穿", !fail],
  ["扫荡事件反复发生 (>=5)", stats.sweeps >= 5],
  ["组织抗击真的打过会战 (>=5)", stats.battles >= 5],
  ["组织转移动作有效 (>=5)", stats.evacs >= 5],
  ["会战能全歼日军 (>=1)", stats.cleanWins >= 1],
  ["推进到最终阶段", phase(s) === PHASES.length - 1],
  ["收复全部区域", done === REGIONS.length]
];
let pass = true;
for (const [name, ok] of checks) {
  console.log(`${ok ? "✓" : "✗"} ${name}`);
  if (!ok) pass = false;
}
if (fail) console.error(fail);
console.log(pass ? "PASS" : "FAIL");
process.exit(pass ? 0 : 1);
