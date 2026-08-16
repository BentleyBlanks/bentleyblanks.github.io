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
  BossGoOut,
  BossAway,
  BOSS_ACTIVITIES,
  STOCK_STAKE,
  CLUB_INVEST_GAIN,
  MilkTea,
  GiveAward,
  TeamBuild,
  AwardValue,
  MILK_TEA_COST,
  MILK_TEA_MORALE,
  TEAMBUILD_COST,
  AWARD_BASE_MORALE,
  HIRE_COST,
  HIRE_ORDER,
  RegisterCompany,
  HireNext,
  SkipSetup,
  GetSetupCard,
  AdvanceSetup,
  MarkSetupSelect,
  HireExtra,
  ToggleAi,
  BuyUpgrade,
  ExpandStudio,
  GetShipBreakdown,
  GetRoyaltyPerMonth,
  GetAiBurn,
  NextHireCost,
  StaffCount,
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
  SkipSetup(state);
  DrainEvents(state);
  return state;
}

console.log("CrunchOverlord smoke test");

Check("开局契约：现金/目标/四头牛马/进度归零", () => {
  const state = NewGame();
  assert.equal(state.status, "playing");
  assert.equal(state.cash, START_CASH - 4 * HIRE_COST);
  assert.ok(state.companyName);
  assert.equal(state.revenueGoal, REVENUE_GOAL);
  assert.equal(ActiveWorkers(state).length, 4);
  assert.equal(state.project.progress, 0);
});

Check("开业筹备：注册公司后进入招聘", () => {
  const state = CreateState(8);
  StartGame(state);
  assert.equal(state.status, "setup");
  assert.equal(ActiveWorkers(state).length, 0);
  const card = GetSetupCard(state);
  assert.equal(card.action, "register");
  const result = RegisterCompany(state);
  assert.ok(result.ok);
  assert.ok(state.companyName);
  assert.equal(state.setup.step, "hire");
  assert.equal(GetSetupCard(state).action, "hire");
});

Check("开业筹备：招满四人扣预付、人从门口走进来", () => {
  const state = CreateState(8);
  StartGame(state);
  RegisterCompany(state);
  const cashBefore = state.cash;
  HIRE_ORDER.forEach((id, index) => {
    const result = HireNext(state);
    assert.ok(result.ok, `${id} 应能入职`);
    const worker = state.workers.find((item) => item.id === id);
    assert.equal(worker.hired, true);
    assert.equal(worker.state, "moving");
    assert.equal(state.setup.hireIndex, index + 1);
  });
  assert.equal(state.cash, cashBefore - 4 * HIRE_COST);
  assert.equal(state.setup.step, "teachSelect");
  assert.equal(state.setup.allowOrders, true);
});

Check("开业筹备：跳过会坐满工位并开工", () => {
  const state = CreateState(8);
  StartGame(state);
  const result = AdvanceSetup(state, "skip");
  assert.ok(result.ok);
  assert.equal(state.status, "playing");
  assert.equal(ActiveWorkers(state).length, 4);
  state.workers.forEach((worker) => {
    assert.equal(worker.state, "desk");
    assert.equal(worker.hired, true);
  });
});

Check("开业教学：点人出缺陷单，派人后出便签，撕掉开工", () => {
  const state = CreateState(11);
  StartGame(state);
  RegisterCompany(state);
  while (state.setup.step === "hire") HireNext(state);
  assert.equal(state.setup.step, "teachSelect");
  const pick = MarkSetupSelect(state);
  assert.ok(pick.ok);
  const bug = state.tumors.find((ticket) => ticket.kind === "bug");
  assert.ok(bug, "点人后应贴出缺陷单");
  const assign = AssignWorker(state, "chenChonggou", bug.id);
  assert.ok(assign.ok);
  const note = state.tumors.find((ticket) => ticket.kind === "scope");
  assert.ok(note, "派人后应贴出加塞便签");
  const slash = SlashScope(state, note.id);
  assert.ok(slash.ok);
  assert.equal(state.status, "playing");
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

Check("加塞便签会长出来并拖慢效率，撕掉后策划掉士气", () => {
  const state = NewGame(3);
  Simulate(state, 40);
  assert.ok(state.tumors.length > 0, "40 秒内应贴出至少一张工单");
  const scope = state.tumors.find((tumor) => tumor.kind === "scope");
  if (!scope) return;
  assert.ok(GetSpeedMultiplier(state) < 1, "有加塞便签时效率应低于 100%");
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

Check("教学序列：前两张工单固定先缺陷单后加塞便签", () => {
  const state = NewGame(59);
  const kinds = [];
  for (let t = 0; t < 45 && kinds.length < 2; t += 0.1) {
    Tick(state, 0.1);
    DrainEvents(state).forEach((event) => {
      if (event.kind === "spawn") kinds.push(event.tumorKind);
    });
  }
  assert.equal(kinds[0], "bug", `第一张应是缺陷单，实际 ${kinds[0]}`);
  assert.equal(kinds[1], "scope", `第二张应是加塞便签，实际 ${kinds[1]}`);
});

Check("老板去足疗：扣钱、离岗期间命令全拒、回来头发+18", () => {
  const state = NewGame(37);
  state.hair = 50;
  const cashBefore = state.cash;
  const result = BossGoOut(state, "spa");
  assert.ok(result.ok);
  assert.equal(state.cash, cashBefore - BOSS_ACTIVITIES.spa.cost);
  assert.ok(BossAway(state), "签发后老板应立即离岗");
  const pie = PaintPie(state);
  assert.equal(pie.ok, false, "老板不在时不许画饼");
  const release = Release(state);
  assert.equal(release.ok, false, "老板不在时不许发售");
  Simulate(state, 20); // 走到门口 ~3.4s + 停留 6s + 走回来 ~3.4s
  assert.equal(state.boss.phase, "office", "老板应已回到工位");
  assert.equal(state.hair, 68, `足疗后头发应 50→68，实际 ${state.hair}`);
  assert.equal(state.stats.spaTrips, 1);
});

Check("老板不在牛马摸鱼：进度变慢、士气回升", () => {
  const slackGame = NewGame(41);
  const controlGame = NewGame(41);
  BossGoOut(slackGame, "spa");
  Simulate(slackGame, 6);
  Simulate(controlGame, 6);
  assert.ok(
    slackGame.project.progress < controlGame.project.progress,
    `摸鱼局进度 ${slackGame.project.progress} 应低于对照局 ${controlGame.project.progress}`,
  );
  assert.ok(
    slackGame.workers[0].morale > controlGame.workers[0].morale,
    "老板不在时士气应回升",
  );
});

Check("炒股：本金即刻划走，净收益落在允许集合内", () => {
  const state = NewGame(43);
  const cashBefore = state.cash;
  const result = BossGoOut(state, "stock");
  assert.ok(result.ok);
  assert.equal(state.cash, cashBefore - STOCK_STAKE);
  Simulate(state, 25);
  assert.equal(state.boss.phase, "office");
  assert.equal(state.stats.stockPlays, 1);
  const allowed = [-STOCK_STAKE, -STOCK_STAKE / 2, Math.round(STOCK_STAKE * 0.8), Math.round(STOCK_STAKE * 2.2)];
  assert.ok(allowed.includes(state.stats.stockNet), `净收益 ${state.stats.stockNet} 不在允许集合 ${allowed}`);
});

Check("高端会所：投资结果二选一，行程计数正确", () => {
  const state = NewGame(47);
  const result = BossGoOut(state, "club");
  assert.ok(result.ok);
  Simulate(state, 26);
  assert.equal(state.boss.phase, "office");
  assert.equal(state.stats.clubTrips, 1);
  assert.ok([0, CLUB_INVEST_GAIN].includes(state.stats.investGained));
});

Check("请奶茶：扣钱、全员士气涨、冷却挡连点", () => {
  const state = NewGame(61);
  const moraleBefore = state.workers.map((worker) => worker.morale);
  const cashBefore = state.cash;
  const result = MilkTea(state);
  assert.ok(result.ok);
  assert.equal(state.cash, cashBefore - MILK_TEA_COST);
  assert.equal(state.stats.milkTeas, 1);
  state.workers.forEach((worker, index) => {
    assert.ok(worker.morale > moraleBefore[index], `${worker.id} 士气应上涨`);
    assert.ok(worker.morale <= moraleBefore[index] + MILK_TEA_MORALE + 0.01);
  });
  const again = MilkTea(state);
  assert.equal(again.ok, false, "冷却中不许连点奶茶");
});

Check("发奖状：第一张涨士气，发多了穿帮变负", () => {
  const state = NewGame(67);
  const worker = state.workers[0];
  worker.morale = 50;
  assert.equal(AwardValue(state), AWARD_BASE_MORALE);
  const first = GiveAward(state, worker.id);
  assert.ok(first.ok);
  assert.ok(worker.morale > 50, `第一张应涨士气，实际 ${worker.morale}`);
  state.awardCooldown = 0;
  GiveAward(state, worker.id);
  state.awardCooldown = 0;
  GiveAward(state, worker.id);
  state.awardCooldown = 0;
  const before = worker.morale;
  const fourth = GiveAward(state, worker.id);
  assert.ok(fourth.ok);
  assert.ok(worker.morale < before, `第四张应穿帮掉士气，${before} → ${worker.morale}`);
  assert.ok(AwardValue(state) < 0);
});

Check("强制团建：扣钱、全员离岗、进度停、回来多数涨一人嫌", () => {
  const state = NewGame(71);
  const control = NewGame(71);
  const cashBefore = state.cash;
  const result = TeamBuild(state);
  assert.ok(result.ok);
  assert.equal(state.cash, cashBefore - TEAMBUILD_COST);
  assert.equal(state.stats.teambuilds, 1);
  Simulate(state, 8);
  const gone = state.workers.filter((worker) => worker.state === "teambuild" || worker.mission?.then === "teambuild");
  assert.ok(gone.length >= 3, `多数人应已出门团建，实际 ${gone.length}`);
  Simulate(control, 8);
  assert.ok(
    state.project.progress < control.project.progress,
    `团建局进度 ${state.project.progress} 应低于对照 ${control.project.progress}`,
  );
  Simulate(state, 20);
  const back = state.workers.filter((worker) => worker.state === "desk" || worker.state === "moving");
  assert.ok(back.length >= 3, "团建结束后多数人应回工位");
  const boosted = state.workers.filter((worker) => worker.morale > 72).length;
  const hurt = state.workers.filter((worker) => worker.morale < 72).length;
  assert.ok(boosted >= 2, `至少两人该真香，实际 ${boosted}`);
  assert.ok(hurt >= 1, "总有一个人讨厌团建");
});

Check("五十万只是里程碑，不是胜利", () => {
  const state = NewGame(101);
  state.revenue = 480000;
  state.project.progress = state.project.need;
  const result = Release(state);
  assert.ok(result.ok);
  assert.ok(state.revenue >= 500000);
  assert.equal(state.status, "playing", "五十万不该通关");
  assert.ok(state.empire.milestoneIndex >= 1, "应记下五十万里程碑");
});

Check("第二款比第一款赚：目录乘数", () => {
  const state = NewGame(103);
  state.project.progress = state.project.need;
  const first = Release(state);
  state.project.progress = state.project.need;
  const second = Release(state);
  assert.ok(second.revenue > first.revenue, `第二款 ${second.revenue} 应高于第一款 ${first.revenue}`);
  assert.ok(state.empire.catalog > 0);
  assert.ok(GetRoyaltyPerMonth(state) > 0);
});

Check("AI 月租：提速、开通扣首月、发薪再扣", () => {
  const state = NewGame(107);
  const before = GetSpeedMultiplier(state);
  const cashBefore = state.cash;
  const buy = ToggleAi(state, "copilot");
  assert.ok(buy.ok);
  assert.equal(state.cash, cashBefore - 2000);
  assert.ok(GetSpeedMultiplier(state) > before, "开通补全后应更快");
  assert.equal(GetAiBurn(state), 2000);
  Simulate(state, MONTH_SECONDS + 0.2);
  assert.ok(state.stats.aiSpend >= 4000, `首月+发薪应记下月租，实际 ${state.stats.aiSpend}`);
});

Check("再招一个：扣递增预付、编制+1", () => {
  const state = NewGame(109);
  state.empire.tier = 1;
  state.cash = 20000;
  const cost = NextHireCost(state);
  const hire = HireExtra(state);
  assert.ok(hire.ok);
  assert.equal(StaffCount(state), 5);
  assert.equal(state.stats.extrasHired, 1);
  assert.ok(state.workers.some((worker) => worker.id === "extra1"));
  assert.equal(state.cash, 20000 - cost);
});

Check("扩张办公室：卡流水和现金", () => {
  const state = NewGame(113);
  const early = ExpandStudio(state);
  assert.equal(early.ok, false, "没流水不该扩");
  state.revenue = 500000;
  state.cash = 1000;
  const poor = ExpandStudio(state);
  assert.equal(poor.ok, false, "没钱不该扩");
  state.cash = 300000;
  const ok = ExpandStudio(state);
  assert.ok(ok.ok);
  assert.equal(state.empire.tier, 1);
  assert.equal(state.stats.expands, 1);
});

Check("基建一次买死", () => {
  const state = NewGame(127);
  state.cash = 20000;
  const buy = BuyUpgrade(state, "chairs");
  assert.ok(buy.ok);
  const again = BuyUpgrade(state, "chairs");
  assert.equal(again.ok, false);
  assert.ok(GetSpeedMultiplier(state) > 1);
});

Check("发售乘数栈写得出来", () => {
  const state = NewGame(131);
  const stack = GetShipBreakdown(state, 1);
  assert.ok(stack.revenue > 0);
  assert.equal(stack.studioMult, 1);
  assert.equal(stack.catalogMult, 1);
});

Check("惊喜事件同种子可复现", () => {
  const a = NewGame(137);
  const b = NewGame(137);
  Simulate(a, 40);
  Simulate(b, 40);
  DrainEvents(a);
  DrainEvents(b);
  assert.equal(a.empire.nextShipMult, b.empire.nextShipMult);
  assert.equal(a.empire.fame, b.empire.fame);
  assert.equal(Math.round(a.cash), Math.round(b.cash));
});

Check("发售弹幕：三条喷子如约而至", () => {
  const state = NewGame(53);
  state.project.progress = state.project.need;
  Release(state);
  const events = DrainEvents(state);
  const release = events.find((event) => event.kind === "release");
  assert.ok(release, "应有 release 事件");
  assert.equal(release.danmaku.length, 3);
  release.danmaku.forEach((line) => assert.ok(typeof line === "string" && line.length > 3));
});

if (failures.length) {
  console.error(`\n${failures.length} 项失败: ${failures.join(", ")}`);
  process.exit(1);
}
console.log("\n全部通过");
