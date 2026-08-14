import assert from "node:assert/strict";
import {
  AdvanceMonth,
  BuyMarketingCampaign,
  CalculateTensions,
  CreateInitialState,
  CustomizeProject,
  EvaluateProject,
  FireStaff,
  ForecastMonthlyCosts,
  ForecastPivotCost,
  GetMemberMonthlyCost,
  GetAnxietyState,
  HireStaff,
  ReleaseBuild,
  SelectDirective,
  SelectFoodPlan,
  SetStaffInvestmentLevel,
  Speculate,
  StartProject,
  TakeLoan,
  TalkToStaff,
  PivotProject,
  PerformOwnerTask,
  PurchaseWorkstation,
  RepayStartupLoan,
  STARTUP_LOAN_TERMS,
  WORKSTATION_COSTS,
  ValidateState,
} from "./Script_Rules.mjs";
import {
  AI_SUBSCRIPTION_LEVELS,
  FEATURE_CHOICES,
  GAME_TYPES,
  LIVE_REVENUE_EVENTS,
  MARKETING_CAMPAIGNS,
  PIVOT_REASONS,
  PROJECTS,
  SPECULATION_OPTIONS,
  STUDENT_PAY_LEVELS,
} from "./Data_Game.mjs";

function Begin() {
  const result = StartProject(CreateInitialState(), "zeroGStore", "online");
  assert.equal(result.ok, true);
  // Most legacy rule fixtures study staffing output rather than equipment
  // procurement. Give those fixtures four paid-off desks; dedicated tests
  // below lock the real player-facing purchase gate.
  result.state.workstations = 4;
  return result.state;
}

function SumOutput(output) {
  return Object.values(output || {}).reduce((total, value) => total + value, 0);
}

function Member(state, staffId) {
  const member = state.team.find((candidate) => candidate.id === staffId);
  assert(member, `${staffId} must be present in the team fixture`);
  return member;
}

function InvestmentFixture(staffId) {
  let state = Begin();
  state.cash = 1_000_000;
  state.project.modules = { art: 72, design: 72, client: 72, performance: 72 };
  state.project.scopeDebt = 0;
  state.project.technicalDebt = 0;
  state.project.bugs = 0;
  state.project.buildStatus = { level: "stable", label: "稳定", detail: "", score: 72 };
  state = HireStaff(state, staffId).state;
  return state;
}

function MakeLaunchReady(state, moduleValue = 92) {
  state.cash = 1_000_000;
  state.project.age = 3;
  state.project.modules = {
    art: moduleValue,
    design: moduleValue,
    client: moduleValue,
    performance: moduleValue,
  };
  state.project.scopeDebt = 0;
  state.project.technicalDebt = 0;
  state.project.bugs = 0;
  state.project.buildStatus = { level: "stable", label: "稳定", detail: "", score: moduleValue };
  return state;
}

function CampaignCost(campaign) {
  return campaign?.cost ?? campaign?.price ?? campaign?.amount ?? campaign?.budget ?? campaign?.spend ?? 0;
}

function ApplyResult(target, result) {
  assert.equal(result?.ok, true, result?.message || "rule action must succeed");
  Object.assign(target, result.state);
  return result;
}

function HasRecordedId(collection, id) {
  if (Array.isArray(collection)) return collection.some((item) => item === id || item?.id === id || item?.featureId === id);
  return Boolean(collection && typeof collection === "object" && collection[id]);
}

{
  const start = StartProject(CreateInitialState(), "zeroGStore", "premium", {
    studioName: "今晚一定上线",
    projectName: "老板别催",
  });
  assert.equal(start.ok, true);
  assert.equal(start.state.studioName, "今晚一定上线");
  assert.equal(start.state.project.name, "老板别催");
  assert.equal(start.state.cash, STARTUP_LOAN_TERMS.principal, "all starting cash must come from the founding loan");
  assert.equal(start.state.startupLoan.remaining, STARTUP_LOAN_TERMS.totalDue);
  assert.equal(start.state.startupLoan.dueMonth, STARTUP_LOAN_TERMS.dueMonth);
  assert.equal(start.state.workstations, 0, "the owner begins with only their personal computer");
  const blockedHire = HireStaff(start.state, "linMo");
  assert.equal(blockedHire.ok, false, "the first hire must be blocked until equipment is purchased");
  const equipment = PurchaseWorkstation(start.state);
  assert.equal(equipment.ok, true);
  assert.equal(equipment.cost, WORKSTATION_COSTS[0]);
  assert.equal(equipment.state.workstations, 1);
  assert.equal(HireStaff(equipment.state, "linMo").ok, true, "one purchased workstation unlocks one hire");

  const partial = RepayStartupLoan({ ...start.state, cash: 100000 }, 10000);
  assert.equal(partial.ok, true);
  assert.equal(partial.state.startupLoan.remaining, STARTUP_LOAN_TERMS.totalDue - 10000);
  const paid = RepayStartupLoan({ ...partial.state, cash: 100000 }, "full");
  assert.equal(paid.ok, true);
  assert.equal(paid.state.startupLoan.status, "repaid");

  const due = structuredClone(start.state);
  due.cash = 1000000;
  due.month = STARTUP_LOAN_TERMS.dueMonth;
  due.ownerWorkMonth = due.month;
  const defaulted = AdvanceMonth(due);
  assert.equal(defaulted.state.status, "gameover", "an unpaid startup loan must liquidate the studio at its deadline");
  assert.equal(defaulted.state.outcome?.kind, "startupLoanDefault");
}

{
  let state = Begin();
  state = HireStaff(state, "linMo").state;
  state = HireStaff(state, "scopeWhale").state;
  const costs = ForecastMonthlyCosts(state);
  assert.equal(costs.studentWages, 6200, "student compensation must be a monthly wage");
  assert.equal(costs.aiRent, 3300, "AI compensation must be a monthly subscription");
  assert.equal(costs.service, 0, "server costs begin only after launch");
  assert.equal(costs.total, costs.living + costs.food + 6200 + 3300);
}

{
  const studentLevel0 = STUDENT_PAY_LEVELS.find((plan) => plan.level === 0);
  const studentLevel2 = STUDENT_PAY_LEVELS.find((plan) => plan.level === 2);
  const aiLevel0 = AI_SUBSCRIPTION_LEVELS.find((plan) => plan.level === 0);
  const aiLevel2 = AI_SUBSCRIPTION_LEVELS.find((plan) => plan.level === 2);
  assert(studentLevel0 && studentLevel2 && aiLevel0 && aiLevel2, "staff investment plans must include levels 0 and 2");

  const studentBaseState = InvestmentFixture("linMo");
  const studentBaseMember = Member(studentBaseState, "linMo");
  const studentBaseCost = GetMemberMonthlyCost(studentBaseMember);
  assert.equal(studentBaseCost, 6200 + studentLevel0.extraCost);
  const studentUpgradeState = InvestmentFixture("linMo");
  const studentUpgrade = SetStaffInvestmentLevel(studentUpgradeState, "linMo", 2);
  assert.equal(studentUpgrade.ok, true, "a hired student can receive a level-2 pay investment");
  Object.assign(studentUpgradeState, studentUpgrade.state);
  const studentUpgradeMember = Member(studentUpgradeState, "linMo");
  const studentUpgradeCost = GetMemberMonthlyCost(studentUpgradeMember);
  assert.equal(studentUpgradeCost, 6200 + studentLevel2.extraCost, "student raises must increase the monthly wage");
  assert(studentUpgradeCost > studentBaseCost);

  const aiBaseState = InvestmentFixture("scopeWhale");
  const aiBaseMember = Member(aiBaseState, "scopeWhale");
  const aiBaseCost = GetMemberMonthlyCost(aiBaseMember);
  assert.equal(aiBaseCost, 3300 * aiLevel0.costMultiplier);
  const aiUpgradeState = InvestmentFixture("scopeWhale");
  const aiUpgrade = SetStaffInvestmentLevel(aiUpgradeState, "scopeWhale", 2);
  assert.equal(aiUpgrade.ok, true, "a hired AI can receive a level-2 subscription");
  Object.assign(aiUpgradeState, aiUpgrade.state);
  const aiUpgradeMember = Member(aiUpgradeState, "scopeWhale");
  const aiUpgradeCost = GetMemberMonthlyCost(aiUpgradeMember);
  assert.equal(aiUpgradeCost, Math.round(3300 * aiLevel2.costMultiplier / 100) * 100, "high-tier AI subscriptions must be substantially more expensive");
  assert(aiUpgradeCost > aiBaseCost * 4 - 100, "the high-tier AI rent should be at least four times the base subscription");
  assert(aiUpgradeCost - aiBaseCost > studentUpgradeCost - studentBaseCost, "AI tier upgrades must cost more than a student raise");

  const studentBaseMonth = AdvanceMonth(studentBaseState);
  const studentUpgradeMonth = AdvanceMonth(studentUpgradeState);
  const aiBaseStartDrift = Member(aiBaseState, "scopeWhale").drift;
  const aiUpgradeStartDrift = Member(aiUpgradeState, "scopeWhale").drift;
  const aiBaseMonth = AdvanceMonth(aiBaseState);
  const aiUpgradeMonth = AdvanceMonth(aiUpgradeState);
  const studentOutputIncrease = SumOutput(studentUpgradeMonth.output) - SumOutput(studentBaseMonth.output);
  const aiOutputIncrease = SumOutput(aiUpgradeMonth.output) - SumOutput(aiBaseMonth.output);
  assert(studentOutputIncrease > 0, "student raises must improve that month's effective output");
  assert(studentOutputIncrease < aiOutputIncrease, "a level-2 student raise must have a smaller output lift than a level-2 AI subscription");

  const studentQualityIncrease = EvaluateProject(studentUpgradeState).investmentBonus - EvaluateProject(InvestmentFixture("linMo")).investmentBonus;
  const aiQualityIncrease = EvaluateProject(aiUpgradeState).investmentBonus - EvaluateProject(InvestmentFixture("scopeWhale")).investmentBonus;
  assert(studentQualityIncrease > 0, "student raises must improve project quality potential");
  assert(studentQualityIncrease < aiQualityIncrease, "a level-2 student raise must have a smaller quality lift than a level-2 AI subscription");
  const aiBaseDrift = Member(aiBaseMonth.state, "scopeWhale").drift - aiBaseStartDrift;
  const aiUpgradeDrift = Member(aiUpgradeMonth.state, "scopeWhale").drift - aiUpgradeStartDrift;
  assert(aiUpgradeDrift < aiBaseDrift, "a high-tier AI subscription must slow hallucination drift growth");

  let fireState = Begin();
  fireState = HireStaff(fireState, "linMo").state;
  fireState = HireStaff(fireState, "scopeWhale").state;
  const firedStudent = FireStaff(fireState, "linMo");
  assert.equal(firedStudent.ok, true, "the player can fire a student after changing pay");
  fireState = firedStudent.state;
  assert(!fireState.team.some((member) => member.id === "linMo"));
  const firedAi = FireStaff(fireState, "scopeWhale");
  assert.equal(firedAi.ok, true, "the player can cancel an AI subscription");
  assert(!firedAi.state.team.some((member) => member.id === "scopeWhale"));
}

{
  const original = Begin();
  original.cash = 1_000_000;
  original.anxiety = 20;
  original.project.age = 4;
  original.project.modules = { art: 90, design: 90, client: 90, performance: 90 };
  original.project.scopeDebt = 5;
  original.project.technicalDebt = 5;
  original.project.bugs = 2;
  original.project.marketingSpent = 50_000;
  original.project.wishlists = 12_000;
  original.project.expectation = 20;
  original.project.features = [{ id: FEATURE_CHOICES[0].id }];
  const targetProject = PROJECTS.find((project) => project.id !== original.project.templateId);
  const targetGameType = GAME_TYPES.find((gameType) => gameType.id !== original.project.gameTypeId);
  assert(targetProject && targetGameType, "pivot fixture needs a distinct project and game type");
  const pivotCost = ForecastPivotCost(original);
  assert(pivotCost > 50_000, "pivoting a developed project must have a substantial cost");
  const beforeCash = original.cash;
  const beforeCosts = original.totalCosts;
  const beforeModules = SumOutput(original.project.modules);
  const beforeWishlists = original.project.wishlists;
  const beforeAnxiety = original.anxiety;
  const beforeDebt = original.project.scopeDebt + original.project.technicalDebt;
  const pivot = PivotProject(original, targetProject.id, targetGameType.id);
  assert.equal(pivot.ok, true, "an unreleased project with enough cash can pivot");
  assert.equal(pivot.cost, pivotCost);
  assert.equal(pivot.state.cash, beforeCash - pivotCost, "pivot cost must be paid from cash");
  assert.equal(pivot.state.totalCosts, beforeCosts + pivotCost, "pivot cost must enter cumulative costs");
  assert.equal(pivot.state.project.templateId, targetProject.id);
  assert.equal(pivot.state.project.gameTypeId, targetGameType.id);
  assert(SumOutput(pivot.state.project.modules) < beforeModules * 0.7, "pivoting must discard most module progress");
  assert(pivot.state.project.wishlists < beforeWishlists * 0.5, "pivoting must discard most wishlists");
  assert(pivot.state.anxiety > beforeAnxiety, "pivoting must increase anxiety");
  assert(pivot.state.project.scopeDebt + pivot.state.project.technicalDebt > beforeDebt, "pivoting must add project debt");
  assert.equal(pivot.state.gameRevenue, 0, "an unreleased pivot must not create game revenue");
  assert.equal(pivot.state.project.pivotHistory.length, 1);
  assert(PIVOT_REASONS.includes(pivot.state.project.pivotHistory[0].reason), "pivot history must record a reason");
  assert.equal(pivot.state.project.pivotHistory[0].cost, pivotCost);
  assert.equal(pivot.state.project.pivotHistory[0].toProjectId, targetProject.id);
  assert.equal(pivot.state.project.pivotHistory[0].toGameTypeId, targetGameType.id);

  const same = Begin();
  same.cash = 1_000_000;
  const rejected = PivotProject(same, same.project.templateId, same.project.gameTypeId);
  assert.equal(rejected.ok, false, "pivoting to the same project and game type must be rejected");
}

{
  let state = Begin();
  state.cash = 1_000_000;
  for (let monthIndex = 0; monthIndex < 3; monthIndex += 1) state = AdvanceMonth(state).state;
  state.project.modules = { art: 30, design: 30, client: 30, performance: 30 };
  state.project.buildStatus = { level: "fragile", label: "偶尔能进主菜单", detail: "", score: 30 };
  const cumulativeCosts = state.totalCosts;
  const launch = ReleaseBuild(state);
  assert.equal(launch.ok, true);
  assert(launch.commercial.netRevenue < cumulativeCosts, "a low-quality first launch can earn less than the campaign's accumulated costs");
}

{
  let eventResult = null;
  let eventLaunchRevenue = 0;
  for (let seed = 0; seed < 3000 && !eventResult; seed += 1) {
    const candidate = MakeLaunchReady(Begin(), 92);
    candidate.seed = seed;
    const launch = ReleaseBuild(candidate);
    assert.equal(launch.ok, true);
    eventLaunchRevenue = launch.state.gameRevenue;
    const month = AdvanceMonth(launch.state);
    if (month.finance?.liveEvent && month.finance.eventLoss > 0) eventResult = month;
  }
  assert(eventResult, "one deterministic released run must encounter a live revenue event");
  assert(LIVE_REVENUE_EVENTS.some((event) => event.id === eventResult.finance.liveEvent.id));
  assert(eventResult.finance.income < eventResult.finance.baseIncome, "a live event must reduce income below its base amount");
  assert(eventResult.finance.eventLoss > 0, "a live event must report the lost income");
  assert.equal(
    eventResult.state.gameRevenue,
    eventLaunchRevenue + eventResult.finance.income,
    "game revenue must increase by net live income rather than the pre-event amount",
  );
  const history = eventResult.state.incomeHistory.at(-1);
  assert.equal(history.source, "live");
  assert.equal(history.baseIncome, eventResult.finance.baseIncome);
  assert.equal(history.income, eventResult.finance.income);
  assert.equal(history.eventLoss, eventResult.finance.eventLoss);
  assert(Array.isArray(eventResult.state.project.activeLiveEvents));

  const unreleased = AdvanceMonth(Begin());
  assert.equal(unreleased.finance.liveEvent, null, "unreleased projects cannot trigger live revenue events");
  assert.equal(unreleased.finance.baseIncome, 0);
  assert.equal(unreleased.finance.eventLoss, 0);
  assert.equal(unreleased.state.incomeHistory.length, 0, "unreleased projects must not write live income history");
}

{
  const lottery = SPECULATION_OPTIONS.find((option) => option.id === "lottery");
  const allIn = SPECULATION_OPTIONS.find((option) => option.stakeMode === "allIn");
  assert(lottery && allIn, "speculation catalog must include lottery and all-in options");
  let lotteryWin = null;
  let lotteryLoss = null;
  for (let seed = 0; seed < 3000 && (!lotteryWin || !lotteryLoss); seed += 1) {
    const state = Begin();
    state.seed = seed;
    state.cash = 100_000;
    const beforeRevenue = state.gameRevenue;
    const result = Speculate(state, lottery.id);
    assert.equal(result.ok, true);
    assert.equal(result.state.gameRevenue, beforeRevenue, "speculation must not count as game revenue");
    if (result.profit > 0 && !lotteryWin) lotteryWin = result;
    if (result.profit < 0 && !lotteryLoss) lotteryLoss = result;
  }
  assert(lotteryWin, "lottery must have a deterministic winning seed");
  assert(lotteryLoss, "lottery must have a deterministic losing seed");

  let allInBankruptcy = null;
  let allInProfit = null;
  for (let seed = 0; seed < 3000 && (!allInBankruptcy || !allInProfit); seed += 1) {
    const state = Begin();
    state.seed = seed;
    state.cash = 100_000;
    const beforeRevenue = state.gameRevenue;
    const result = Speculate(state, allIn.id);
    assert.equal(result.ok, true);
    assert.equal(result.state.gameRevenue, beforeRevenue, "all-in speculation must not count as game revenue");
    if (result.state.outcome?.kind === "speculationBankruptcy") {
      allInBankruptcy = result;
      assert.equal(result.state.cash, 0, "a losing all-in speculation must zero the cash balance");
    } else if (result.profit > 0 && !allInProfit) {
      allInProfit = result;
    }
  }
  assert(allInBankruptcy, "the all-in option must have a deterministic bankruptcy seed");
  assert.equal(allInBankruptcy.state.outcome.kind, "speculationBankruptcy");
  assert(allInProfit, "the all-in option must also have a deterministic profitable seed");

  const once = Begin();
  once.cash = 100_000;
  const first = Speculate(once, lottery.id);
  assert.equal(first.ok, true);
  const second = Speculate(first.state, lottery.id);
  assert.equal(second.ok, false, "speculation must be limited to one action per month");
  assert.equal(second.state.speculationHistory.length, 1);
  assert.equal(second.state.cash, first.state.cash);
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
  const choices = FEATURE_CHOICES.filter((choice) => choice?.id);
  const findChoice = (sourceId) => {
    for (const choice of choices) {
      let state = Begin();
      if (sourceId !== "owner") {
        state = HireStaff(state, sourceId).state;
      }
      try {
        const result = CustomizeProject(state, sourceId, choice.id);
        if (result.ok) return { choice, state, result };
      } catch {
        // Keep looking: choices may be specialty-gated by the rules.
      }
    }
    return null;
  };

  let ownerPick = findChoice("owner");
  let studentPick = findChoice("linMo");
  let commonPick = null;
  for (const choice of choices) {
    const ownerState = Begin();
    const studentState = HireStaff(Begin(), "linMo").state;
    try {
      const ownerResult = CustomizeProject(ownerState, "owner", choice.id);
      const studentResult = CustomizeProject(studentState, "linMo", choice.id);
      if (ownerResult.ok && studentResult.ok) {
        commonPick = {
          owner: { choice, state: ownerState, result: ownerResult },
          student: { choice, state: studentState, result: studentResult },
        };
        break;
      }
    } catch {
      // Keep looking: choices may be specialty-gated by the rules.
    }
  }
  assert(ownerPick && studentPick && commonPick, "owner and hired students must have at least one customization choice");
  ownerPick = commonPick.owner;
  studentPick = commonPick.student;
  const unowned = CustomizeProject(Begin(), "linMo", studentPick.choice.id);
  assert.equal(unowned.ok, false, "an un-hired staff member cannot customize the project");

  const ownerBefore = ownerPick.state;
  const ownerHunger = ownerBefore.hunger;
  const ownerAnxiety = ownerBefore.anxiety;
  const ownerDebtBefore = ownerBefore.project.scopeDebt + ownerBefore.project.technicalDebt;
  const ownerResult = ownerPick.result;
  const studentResult = studentPick.result;
  assert(ownerResult.state.hunger > ownerHunger, "owner customization must consume time and increase hunger");
  assert(ownerResult.state.anxiety > ownerAnxiety, "owner customization must add anxiety");
  const ownerDebt = ownerResult.state.project.scopeDebt + ownerResult.state.project.technicalDebt;
  const studentDebt = studentResult.state.project.scopeDebt + studentResult.state.project.technicalDebt;
  assert(ownerDebt >= ownerDebtBefore, "owner customization must add project debt");
  assert(ownerDebt >= studentDebt, "owner customization should be less efficient than a hired specialist");
  const ownerFeature = ownerResult.state.project.features.find((feature) => feature.id === ownerPick.choice.id);
  const studentFeature = studentResult.state.project.features.find((feature) => feature.id === studentPick.choice.id);
  assert(ownerFeature.sourceQuality < studentFeature.sourceQuality, "owner customization must have lower quality potential than a hired specialist");
  assert(EvaluateProject(ownerResult.state).featureBonus < EvaluateProject(studentResult.state).featureBonus, "specialist customization must deliver more quality than owner improvisation");
  assert(HasRecordedId(ownerResult.state.project.features, ownerPick.choice.id), "owner customization must be recorded on the project");
  assert(HasRecordedId(studentResult.state.project.features, studentPick.choice.id), "student customization must be recorded on the project");

  const aiPick = findChoice("scopeWhale");
  assert(aiPick, "an AI specialist must have at least one customization choice");
  assert(HasRecordedId(aiPick.result.state.project.features, aiPick.choice.id), "AI customization must be recorded on the project");
}

{
  const campaigns = MARKETING_CAMPAIGNS.filter((campaign) => campaign?.id);
  assert(campaigns.length > 0, "at least one pre-launch marketing campaign must exist");
  const campaign = [...campaigns].sort((a, b) => CampaignCost(b) - CampaignCost(a))[0];
  assert(CampaignCost(campaign) > 0, "a marketing campaign must require an upfront investment");

  const buyCampaign = (state) => {
    state.cash = 100_000_000;
    const result = BuyMarketingCampaign(state, campaign.id);
    ApplyResult(state, result);
    assert(state.cash < 100_000_000, "pre-launch marketing must be paid before release");
    assert(state.totalCosts >= CampaignCost(campaign), "marketing spend must enter project costs");
    assert(state.project.marketingSpent >= CampaignCost(campaign), "marketing spend must be recorded on the project");
    assert(state.project.wishlists > 0, "pre-launch marketing must create wishlists");
    assert(state.project.expectation > 0, "pre-launch marketing must create player expectations");
    assert(HasRecordedId(state.project.campaigns, campaign.id), "the purchased campaign must be recorded");
    return result;
  };

  const lowBaselineState = MakeLaunchReady(Begin(), 30);
  lowBaselineState.reputation = 50;
  lowBaselineState.fans = 1_000;
  const lowBaseline = ReleaseBuild(lowBaselineState);
  assert.equal(lowBaseline.ok, true);

  const lowMarketedState = MakeLaunchReady(Begin(), 30);
  lowMarketedState.reputation = 50;
  lowMarketedState.fans = 1_000;
  buyCampaign(lowMarketedState);
  const lowMarketed = ReleaseBuild(lowMarketedState);
  assert.equal(lowMarketed.ok, true);
  assert(lowMarketed.commercial, "release must report commercial refund/backlash metrics");
  assert(lowMarketed.commercial.refundRate > lowBaseline.commercial?.refundRate || lowMarketed.commercial.refunds > 0, "a heavily advertised low-quality launch must trigger refunds");
  assert(lowMarketed.commercial.netRevenue < lowMarketed.commercial.grossRevenue, "refunds must reduce net revenue");
  assert.equal(lowMarketed.revenue, lowMarketed.commercial.netRevenue, "release revenue must be the net post-refund amount");
  assert(
    lowMarketed.commercial.backlash > 0
      || lowMarketed.commercial.backlash === true
      || lowMarketed.state.fans < lowBaseline.state.fans
      || lowMarketed.state.reputation < lowBaseline.state.reputation,
    "a low-quality launch must produce sales or reputation backlash",
  );

  const highBaselineState = MakeLaunchReady(Begin(), 92);
  const highBaseline = ReleaseBuild(highBaselineState);
  assert.equal(highBaseline.ok, true);
  const highMarketedState = MakeLaunchReady(Begin(), 92);
  const campaignPurchase = buyCampaign(highMarketedState);
  const highMarketed = ReleaseBuild(highMarketedState);
  assert.equal(highMarketed.ok, true);
  assert(highMarketed.commercial.netRevenue > highBaseline.revenue, "high-quality work that fulfills the campaign promise must earn an amplified launch");
  assert(highMarketed.commercial.netRevenue >= campaignPurchase.state.project.marketingSpent, "the amplified launch must at least recoup the campaign spend");
}

{
  const broken = Begin();
  broken.cash = 1_000_000;
  broken.anxiety = 10;
  broken.project.modules = { art: 12, design: 12, client: 12, performance: 12 };
  broken.project.scopeDebt = 10;
  broken.project.technicalDebt = 80;
  broken.project.bugs = 40;
  broken.project.buildStatus = { level: "broken", label: "打不着", detail: "", score: 0 };
  const before = broken.anxiety;
  const result = AdvanceMonth(broken);
  assert.equal(result.ok, true);
  assert.equal(result.buildStatus.level, "broken", "a failed build must remain visibly broken");
  assert(result.state.anxiety > before, "a broken build and wasted work must increase anxiety");
}

{
  const state = MakeLaunchReady(Begin());
  state.anxiety = 50;
  const before = state.anxiety;
  const launch = ReleaseBuild(state);
  assert.equal(launch.ok, true);
  assert(launch.evaluation.rating >= 8.2, "the high-quality fixture must receive an excellent launch rating");
  assert(launch.state.anxiety < before, "an excellent release must lower anxiety");
  assert.notEqual(GetAnxietyState(launch.state.anxiety).level, "critical", "the fixture should leave the team below critical anxiety");
}

{
  let state = Begin();
  state = HireStaff(state, "linMo").state;
  state.anxiety = 99;
  const result = TalkToStaff(state, "linMo", "pressure");
  assert.equal(result.state.anxiety, 100, "anxiety is clamped at the mental-breakdown threshold");
  assert.equal(result.state.status, "gameover", "anxiety 100 must end the run");
  assert.equal(result.state.outcome?.kind, "mentalBreakdown");
}

{
  let found = null;
  for (let seed = 0; seed < 3000 && !found; seed += 1) {
    const state = Begin();
    state.seed = seed;
    state.cash = 1_000_000;
    state.anxiety = 60;
    state.project.modules = { art: 80, design: 80, client: 80, performance: 80 };
    state.project.scopeDebt = 0;
    state.project.technicalDebt = 0;
    state.project.bugs = 0;
    state.project.buildStatus = { level: "stable", label: "稳定", detail: "", score: 80 };
    const result = AdvanceMonth(state);
    if (result.state.project.abstractIdeas?.length) found = result;
  }
  assert(found, "one of the deterministic seeds must surface an abstract idea at medium anxiety");
  assert(found.state.project.abstractIdeas.length >= 1);
}

{
  const feastState = Begin();
  const sustenanceState = Begin();
  feastState.cash = 1_000_000;
  sustenanceState.cash = 1_000_000;
  const feastPlan = SelectFoodPlan(feastState, "feast");
  const sustenancePlan = SelectFoodPlan(sustenanceState, "sustenance");
  assert.equal(feastPlan.ok, true);
  assert.equal(sustenancePlan.ok, true);
  Object.assign(feastState, feastPlan.state);
  Object.assign(sustenanceState, sustenancePlan.state);
  const feastCosts = ForecastMonthlyCosts(feastState);
  const sustenanceCosts = ForecastMonthlyCosts(sustenanceState);
  assert(feastCosts.food > sustenanceCosts.food, "a feast must cost more than the sustenance plan");
  const feast = AdvanceMonth(feastState);
  const sustenance = AdvanceMonth(sustenanceState);
  assert(SumOutput(feast.output) > SumOutput(sustenance.output), "a feast must produce more effective work than sustenance");
}

{
  let state = Begin();
  state.cash = 0;
  state.anxiety = 0;
  state.hunger = 72;
  state.project.modules = { art: 90, design: 90, client: 90, performance: 90 };
  state.project.scopeDebt = 0;
  state.project.technicalDebt = 0;
  state.project.bugs = 0;
  state.project.buildStatus = { level: "stable", label: "稳定", detail: "", score: 90 };
  for (let monthIndex = 0; monthIndex < 8 && state.status === "playing"; monthIndex += 1) {
    state = AdvanceMonth(state).state;
  }
  assert.equal(state.status, "gameover", "repeatedly skipping unaffordable food must eventually fail");
  assert.equal(state.outcome?.kind, "starvation", "unpaid food must lead to starvation rather than a free meal");
  assert.equal(state.hunger, 100);
}

{
  let state = Begin();
  const beforeGameRevenue = state.gameRevenue;
  const beforeTotalRevenue = state.totalRevenue;
  state = TakeLoan(state, "home").state;
  assert.equal(state.gameRevenue, beforeGameRevenue, "loan principal must not count toward the 10B game-revenue goal");
  assert.equal(state.totalRevenue, beforeTotalRevenue, "loan principal must remain financing rather than reported revenue");
}

{
  let state = Begin();
  state.cash = 0;
  const firstSettlement = AdvanceMonth(state);
  assert(firstSettlement.state.arrears > 0, "unpaid bills must become explicit arrears");
  const arrearsBefore = firstSettlement.state.arrears;
  const nextCosts = ForecastMonthlyCosts(firstSettlement.state);
  assert(nextCosts.arrearsDue > arrearsBefore, "arrears must roll forward with an 8% late charge");
  state = firstSettlement.state;
  state.cash = nextCosts.total;
  const paidSettlement = AdvanceMonth(state);
  assert.equal(paidSettlement.state.arrears, 0, "future cash must automatically clear arrears instead of leaving a permanent ghost balance");
}

{
  let state = Begin();
  state.cash = 1_000_000;
  state.project.age = 3;
  state.project.modules = { art: 25, design: 25, client: 25, performance: 25 };
  state.project.buildStatus = { level: "fragile", label: "勉强启动", detail: "", score: 30 };
  for (const campaign of MARKETING_CAMPAIGNS) state = BuyMarketingCampaign(state, campaign.id).state;
  const launch = ReleaseBuild(state);
  assert.equal(launch.commercial.backlash, true, "a low-quality overmarketed launch must trigger backlash");
  assert(launch.state.project.marketScale < 1, "refund backlash must persistently damage market scale rather than only the launch-day payout");
}

{
  const validState = Begin();
  assert.equal(ValidateState(validState), true, "a fresh run must be a valid save");
  const badProject = structuredClone(validState);
  badProject.project.templateId = "missingProject";
  assert.equal(ValidateState(badProject), false, "unknown project IDs must invalidate a damaged save");
  const badMember = structuredClone(validState);
  badMember.team.push({ id: "imaginaryIntern", morale: 70, stress: 18, drift: 12, boost: 0, months: 0, investmentLevel: 0 });
  assert.equal(ValidateState(badMember), false, "unknown team members must invalidate a damaged save");
  const badModules = structuredClone(validState);
  delete badModules.project.modules.client;
  assert.equal(ValidateState(badModules), false, "missing module data must invalidate a damaged save before rendering");
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
  state = RepayStartupLoan(state, "full").state;
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

{
  const modules = ["art", "design", "client", "performance"];
  for (const moduleKey of modules) {
    const state = Begin();
    const before = {
      module: state.project.modules[moduleKey],
      bugs: state.project.bugs,
      scopeDebt: state.project.scopeDebt,
      technicalDebt: state.project.technicalDebt,
    };
    const result = PerformOwnerTask(state, moduleKey);
    assert.equal(result.ok, true, `${moduleKey} owner work must be accepted`);
    assert(result.gain >= 2 && result.gain <= 4, "owner work must add about 2-4 points");
    assert.equal(result.state.project.modules[moduleKey], before.module + result.gain);
    assert(result.state.project.bugs > before.bugs, "owner work must add bugs");
    assert(result.state.project.scopeDebt > before.scopeDebt, "owner work must add scope debt");
    assert(result.state.project.technicalDebt > before.technicalDebt, "owner work must add technical debt");
    assert(result.state.hunger >= 7 && result.state.anxiety >= 5, "owner work must consume the owner's energy");
  }

  const invalidState = Begin();
  const invalid = PerformOwnerTask(invalidState, "audio");
  assert.equal(invalid.ok, false, "an unknown owner workstation must be rejected");
  assert.equal(invalid.state.ownerWorkCount, 0);

  let limitedState = Begin();
  for (let workIndex = 0; workIndex < 3; workIndex += 1) {
    const result = PerformOwnerTask(limitedState, "design");
    assert.equal(result.ok, true, "the first three owner tasks in a month must work");
    limitedState = result.state;
  }
  assert.equal(limitedState.ownerWorkCount, 3);
  const fourth = PerformOwnerTask(limitedState, "design");
  assert.equal(fourth.ok, false, "a fourth owner task in one month must be rejected");
  assert.equal(fourth.state.ownerWorkCount, 3);

  const nextMonth = AdvanceMonth(limitedState);
  assert.equal(nextMonth.ok, true);
  assert.equal(nextMonth.state.ownerWorkCount, 0, "advancing the month must reset owner work count");
  assert.equal(nextMonth.state.ownerWorkMonth, nextMonth.state.month);
  const refreshed = PerformOwnerTask(nextMonth.state, "performance");
  assert.equal(refreshed.ok, true, "owner work must be available again next month");

  const hungry = Begin();
  hungry.hunger = 95;
  const starvation = PerformOwnerTask(hungry, "art");
  assert.equal(starvation.ok, true);
  assert.equal(starvation.state.status, "gameover", "owner work can trigger starvation");
  assert.equal(starvation.state.outcome?.kind, "starvation");

  const anxious = Begin();
  anxious.anxiety = 95;
  const breakdown = PerformOwnerTask(anxious, "client");
  assert.equal(breakdown.ok, true);
  assert.equal(breakdown.state.status, "gameover", "owner work can trigger a mental breakdown");
  assert.equal(breakdown.state.outcome?.kind, "mentalBreakdown");
}

console.log("StudioSurvival smoke tests passed: wages, investment tiers, pivots, speculation, live events, customization, owner work, marketing commerce, anxiety, food, updates, collateral, and fail states.");
