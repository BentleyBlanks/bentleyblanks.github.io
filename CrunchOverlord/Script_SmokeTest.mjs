// 《牛马指挥官》纯逻辑冒烟测试：node CrunchOverlord/Script_SmokeTest.mjs
// 退出码即成败。只测 Script_Rules.mjs，不碰 DOM。

import assert from "node:assert/strict";
import {
  WORLD,
  MONTH_SECONDS,
  WORKER_SALARY,
  START_CASH,
  REVENUE_GOAL,
  FOOTBATH_COST,
  FOOTBATH_SOAK_SECONDS,
  BOSS_CODE_PROGRESS,
  CreateState,
  StartGame,
  Tick,
  DrainEvents,
  AssignWorker,
  SlashScope,
  PaintPie,
  BossCode,
  Footbath,
  Release,
  GetSpeedMultiplier,
  ActiveWorkers,
} from "./Script_Rules.mjs";

const failures = [];
function Check(name, fn) {
  try {
    fn();
    console.log(`  ok - ${name}`);
  } catch (error) {
    failures.push(name);
    console.error(`  FAIL - ${name}: ${error.message}`);
  }
}

function Simulate(state, seconds, step = 0.1) {
  for (let t = 0; t < seconds; t += step) Tick(state, step);
}

function NewGame(seed = 42) {
  const state = CreateState(seed);
  StartGame(state);
  DrainEvents(state);
  return state;
}

console.log("CrunchOverlord smoke test");

Check("开局契约：现金/目标/四头牛马/进度归零", () => {
  const state = NewGame();
  assert.equal(state.status, "playing");
  assert.equal(state.cash, START_CASH);
  assert.equal(state.revenueGoal, REVENUE_GOAL);
  assert.equal(ActiveWorkers(state).length, 4);
  assert.equal(state.project.progress, 0);
});

Check("坐在工位就有进度，月薪照扣", () => {
  const state = NewGame();
  Simulate(state, MONTH_SECONDS + 0.5);
  assert.ok(state.project.progress > 5, `进度应增长，实际 ${state.project.progress}`);
  assert.equal(state.month, 2);
  assert.ok(state.cash <= START_CASH - 4 * WORKER_SALARY, `发薪后现金应减少，实际 ${state.cash}`);
});

Check("确定性：同种子同操作逐字节一致", () => {
  const a = NewGame(7);
  const b = NewGame(7);
  Simulate(a, 30);
  Simulate(b, 30);
  DrainEvents(a);
  DrainEvents(b);
  assert.equal(JSON.stringify(a), JSON.stringify(b));
});

Check("需求瘤会长出来并拖慢效率，砍掉后策划掉士气", () => {
  const state = NewGame(3);
  Simulate(state, 40);
  assert.ok(state.tumors.length > 0, "40 秒内应长出至少一个瘤");
  const scope = state.tumors.find((tumor) => tumor.kind === "scope");
  if (!scope) return; // 该种子没长需求瘤就不测砍
  assert.ok(GetSpeedMultiplier(state) < 1, "有需求瘤时效率应低于 100%");
  const designer = state.workers.find((worker) => worker.id === "zhaoDagang");
  const before = designer.morale;
  const result = SlashScope(state, scope.id);
  assert.ok(result.ok);
  assert.ok(!state.tumors.includes(scope));
  assert.ok(designer.morale < before, "策划士气应下降");
  assert.equal(state.stats.slashes, 1);
});

Check("BUG 砍不动，必须派牛马修，修完计入统计", () => {
  const state = NewGame(1);
  // 老板写代码必产 BUG
  state.bossCodeCooldown = 0;
  BossCode(state);
  const bug = state.tumors.find((tumor) => tumor.kind === "bug");
  assert.ok(bug, "老板写代码应产出 BUG");
  const slashResult = SlashScope(state, bug.id);
  assert.equal(slashResult.ok, false, "BUG 不许被老板砍掉");
  const assignResult = AssignWorker(state, "chenChonggou", bug.id);
  assert.ok(assignResult.ok);
  Simulate(state, 12);
  assert.ok(!state.tumors.some((tumor) => tumor.id === bug.id), "客户端应在 12 秒内修完 BUG");
  assert.ok(state.stats.bugsFixed >= 1);
});

Check("老板亲自写代码：进度涨、头发掉、有冷却", () => {
  const state = NewGame(5);
  const result = BossCode(state);
  assert.ok(result.ok);
  assert.equal(state.project.progress, BOSS_CODE_PROGRESS);
  assert.ok(state.hair < 100);
  const again = BossCode(state);
  assert.equal(again.ok, false, "冷却中不许连点");
});

Check("画大饼：提速后回落士气，冷却生效", () => {
  const state = NewGame(9);
  const moraleBefore = state.workers[0].morale;
  const result = PaintPie(state);
  assert.ok(result.ok);
  assert.ok(GetSpeedMultiplier(state) > 1.3, "饼生效时应提速");
  const again = PaintPie(state);
  assert.equal(again.ok, false);
  Simulate(state, 9);
  assert.ok(state.workers[0].morale < moraleBefore, "饼凉后应掉士气");
});

Check("足浴：扣钱、离场、回来士气变高", () => {
  const state = NewGame(11);
  const worker = state.workers[0];
  worker.morale = 40;
  const cashBefore = state.cash;
  const result = Footbath(state, worker.id);
  assert.ok(result.ok);
  assert.equal(state.cash, cashBefore - FOOTBATH_COST);
  Simulate(state, 11); // 走到门口（工位到大门约一千像素）
  assert.equal(worker.state, "soaking");
  Simulate(state, FOOTBATH_SOAK_SECONDS + 2);
  assert.ok(worker.morale > 40, `泡完士气应提高，实际 ${worker.morale}`);
});

Check("发售：进度不满被拒；满了进账、换下一款", () => {
  const state = NewGame(13);
  const early = Release(state);
  assert.equal(early.ok, false);
  state.project.progress = state.project.need;
  const nameBefore = state.project.name;
  const result = Release(state);
  assert.ok(result.ok);
  assert.ok(result.revenue > 0);
  assert.ok(state.revenue > 0);
  assert.notEqual(state.project.name, nameBefore);
  assert.equal(state.project.progress, 0);
  assert.ok(state.project.need > 100);
});

Check("胜利：流水达标即赢", () => {
  const state = NewGame(17);
  state.revenue = REVENUE_GOAL - 100;
  state.project.progress = state.project.need;
  const result = Release(state);
  assert.ok(result.ok);
  assert.equal(state.status, "won");
});

Check("破产：现金撑不过发薪日即输", () => {
  const state = NewGame(19);
  state.cash = 100;
  Simulate(state, MONTH_SECONDS + 1);
  assert.equal(state.status, "lost");
  assert.ok(state.loseReason.includes("现金"));
});

Check("全员离职即输，代价簿式文案", () => {
  const state = NewGame(23);
  state.workers.forEach((worker) => { worker.morale = 1; });
  PaintPie(state);
  Simulate(state, 10); // 饼凉，全员 -8 士气 → 全部离职
  assert.equal(ActiveWorkers(state).length, 0);
  assert.equal(state.status, "lost");
  assert.equal(state.stats.quits, 4);
});

Check("事件队列：drain 后清空，不重复消费", () => {
  const state = NewGame(29);
  Simulate(state, 5);
  const first = DrainEvents(state);
  assert.ok(Array.isArray(first));
  const second = DrainEvents(state);
  assert.equal(second.length, 0);
});

Check("完整循环压测：机器人打满 90 秒不崩、账目有界", () => {
  const state = NewGame(31);
  for (let t = 0; t < 90; t += 0.1) {
    Tick(state, 0.1);
    if (state.status !== "playing") break;
    // 简单机器人：有 BUG 派人，有需求砍，进度满就发售
    const bug = state.tumors.find((tumor) => tumor.kind === "bug");
    if (bug) {
      const idle = ActiveWorkers(state).find((worker) => worker.state === "desk");
      if (idle) AssignWorker(state, idle.id, bug.id);
    }
    const scope = state.tumors.find((tumor) => tumor.kind === "scope");
    if (scope) SlashScope(state, scope.id);
    if (state.project.progress >= state.project.need) Release(state);
    DrainEvents(state);
  }
  assert.ok(state.stats.releases >= 1, `90 秒内机器人应至少发售一款，实际 ${state.stats.releases}`);
  assert.ok(Number.isFinite(state.cash));
  state.workers.forEach((worker) => {
    assert.ok(worker.morale >= 0 && worker.morale <= 100);
    assert.ok(worker.x >= -50 && worker.x <= WORLD.width + 50);
  });
});

if (failures.length) {
  console.error(`\n${failures.length} 项失败: ${failures.join(", ")}`);
  process.exit(1);
}
console.log("\n全部通过");
