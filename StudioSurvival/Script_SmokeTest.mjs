import assert from "node:assert/strict";
import {
  AdvanceMonth,
  CalculateTensions,
  CreateInitialState,
  EvaluateProject,
  ForecastMonthlyCosts,
  HireStaff,
  ReleaseBuild,
  SelectDirective,
  StartProject,
  TakeLoan,
  TalkToStaff,
} from "./Script_Rules.mjs";

function Begin() {
  const result = StartProject(CreateInitialState(), "zeroGStore", "online");
  assert.equal(result.ok, true);
  return result.state;
}

{
  let state = Begin();
  state = HireStaff(state, "linMo").state;
  state = HireStaff(state, "scopeWhale").state;
  const costs = ForecastMonthlyCosts(state);
  assert.equal(costs.studentWages, 6200, "student compensation must be a monthly wage");
  assert.equal(costs.aiRent, 3300, "AI compensation must be a monthly subscription");
  assert.equal(costs.service, 0, "server costs begin only after launch");
  assert.equal(costs.total, costs.living + 6200 + 3300);
}

{
  const state = Begin();
  state.project.modules = { art: 88, design: 55, client: 54, performance: 35 };
  const tensions = CalculateTensions(state.project);
  assert(tensions.some((tension) => tension.id === "artOverload"), "art overreach must pressure performance");

  state.project.modules = { art: 55, design: 91, client: 37, performance: 55 };
  const scopeTensions = CalculateTensions(state.project);
  assert(scopeTensions.some((tension) => tension.id === "scopeOverreach"), "design overreach must pressure the client module");
}

{
  const balanced = Begin();
  balanced.project.modules = { art: 72, design: 72, client: 72, performance: 72 };
  balanced.project.scopeDebt = 0;
  balanced.project.technicalDebt = 0;
  balanced.project.bugs = 2;

  const lopsided = Begin();
  lopsided.project.modules = { art: 100, design: 100, client: 44, performance: 44 };
  lopsided.project.scopeDebt = 28;
  lopsided.project.technicalDebt = 28;
  lopsided.project.bugs = 18;
  assert(
    EvaluateProject(balanced).rating > EvaluateProject(lopsided).rating,
    "a balanced build must outscore a similarly productive but lopsided build",
  );
}

{
  let state = Begin();
  state.cash = 480000;
  for (const staffId of ["linMo", "zhaoXiaobei", "chenXu", "taoRan"]) state = HireStaff(state, staffId).state;
  state = TalkToStaff(state, "chenXu", "sync").state;
  state = TalkToStaff(state, "linMo", "encourage").state;
  state = SelectDirective(state, "integration").state;
  for (let monthIndex = 0; monthIndex < 3; monthIndex += 1) {
    const result = AdvanceMonth(state);
    assert.equal(result.ok, true);
    state = result.state;
    for (const value of Object.values(state.project.modules)) assert(Number.isFinite(value));
  }
  const launch = ReleaseBuild(state);
  assert.equal(launch.ok, true, "a build older than two months can launch");
  assert(launch.state.project.monthlyRevenue > 0, "a launched online game earns recurring revenue");
  assert.equal(ForecastMonthlyCosts(launch.state).service, 4200, "online games have a monthly server bill after launch");

  state = AdvanceMonth(launch.state).state;
  const update = ReleaseBuild(state);
  assert.equal(update.ok, true, "a launched game can receive later updates");
  assert.equal(update.isUpdate, true);
  assert.equal(update.state.project.version, 2);
  assert(update.state.project.marketScale > 1, "a solid update must grow the game's market scale toward the 10B goal");
}

{
  let state = Begin();
  state = TakeLoan(state, "drawingTablet").state;
  state.cash = 0;
  state = AdvanceMonth(state).state;
  assert.equal(state.assets.drawingTablet, "seized", "an unaffordable collateral loan must seize its asset");
}

{
  let state = Begin();
  const result = TakeLoan(state, "computer");
  assert.equal(result.fatal, true);
  assert.equal(result.state.status, "gameover", "pledging the development computer immediately ends the run");
}

{
  let state = Begin();
  const beforeGameRevenue = state.gameRevenue;
  state = TakeLoan(state, "home").state;
  assert.equal(state.gameRevenue, beforeGameRevenue, "loan principal must not count toward the 10B game-revenue goal");
}

{
  let state = Begin();
  state.cash = 500000;
  state.project.age = 3;
  state.project.modules = { art: 88, design: 88, client: 88, performance: 88 };
  state.project.buildStatus = { level: "stable", label: "稳定", detail: "", score: 88 };
  state.revenueGoal = 1;
  const launch = ReleaseBuild(state);
  assert.equal(launch.state.status, "ended", "reaching the game-revenue goal must end in victory");
  assert.equal(launch.state.outcome.kind, "worldMaker");
}

{
  let state = Begin();
  state.cash = 1000000000;
  state.project.age = 3;
  state.project.modules = { art: 92, design: 92, client: 92, performance: 92 };
  state.project.buildStatus = { level: "stable", label: "稳定", detail: "", score: 92 };
  for (let updateIndex = 0; updateIndex < 32 && state.status === "playing"; updateIndex += 1) {
    const release = ReleaseBuild(state);
    assert.equal(release.ok, true);
    state = release.state;
    if (state.status === "playing") state = AdvanceMonth(state).state;
  }
  assert.equal(state.outcome?.kind, "worldMaker", "a sustained run of excellent balanced updates must be able to reach 10B revenue");
  assert(state.month <= 32, "the 10B target should be reachable in a bounded campaign rather than geological time");
}

console.log("StudioSurvival smoke tests passed: wages, AI rent, module constraints, live updates, collateral, and computer fail state.");
