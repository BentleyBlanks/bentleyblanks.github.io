import {
  COLLATERAL_OPTIONS,
  DIRECTIVES,
  FindCollateral,
  FindDirective,
  FindGameType,
  FindProject,
  FindStaff,
  GAME_TYPES,
  LIVING_BILLS,
  MODULE_KEYS,
  PROJECTS,
  REVIEW_LINES,
  STAFF_CATALOG,
} from "./Data_Game.mjs";

export const SAVE_KEY = "studio_survival_v1";
export const RULES_VERSION = 2;

function Clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function Clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function RoundMoney(value) {
  return Math.round(value / 100) * 100;
}

function SeededUnit(seed) {
  let value = Math.imul(seed ^ 0x9e3779b9, 0x85ebca6b);
  value ^= value >>> 13;
  value = Math.imul(value, 0xc2b2ae35);
  value ^= value >>> 16;
  return (value >>> 0) / 4294967296;
}

function Average(values) {
  return values.reduce((total, value) => total + value, 0) / Math.max(1, values.length);
}

function PushLog(state, text, tone = "normal") {
  state.log.unshift({ month: state.month, text, tone, id: `${state.month}_${state.logSerial}` });
  state.logSerial += 1;
  state.log = state.log.slice(0, 18);
}

function FreshProject(projectId, gameTypeId) {
  return {
    templateId: projectId,
    gameTypeId,
    modules: { art: 12, design: 12, client: 12, performance: 12 },
    technicalDebt: 0,
    scopeDebt: 0,
    bugs: 3,
    hype: 10,
    age: 0,
    isReleased: false,
    version: 0,
    lastRating: null,
    bestRating: null,
    monthlyRevenue: 0,
    marketScale: 1,
    monthsSinceUpdate: 0,
    lastReleaseMonth: 0,
    releaseHistory: [],
    wastedWork: 0,
    painHistory: [],
    buildStreak: 0,
    buildStatus: {
      level: "broken",
      label: "还没有构建",
      detail: "目前唯一能运行的是商业计划书。",
      score: 0,
    },
  };
}

export function CreateInitialState() {
  return {
    rulesVersion: RULES_VERSION,
    status: "setup",
    outcome: null,
    month: 1,
    revenueGoal: 10000000000,
    gameRevenue: 0,
    cash: 68000,
    arrears: 0,
    hunger: 0,
    reputation: 0,
    fans: 0,
    project: null,
    team: [],
    selectedDirective: "integration",
    talkPoints: 2,
    loans: [],
    assets: Object.fromEntries(COLLATERAL_OPTIONS.map((asset) => [asset.id, "free"])),
    log: [],
    logSerial: 1,
    totalRevenue: 0,
    totalCosts: 0,
    bestRating: null,
    seed: 82417,
    lastSettlement: null,
  };
}

export function StartProject(currentState, projectId, gameTypeId) {
  const state = Clone(currentState);
  if (!FindProject(projectId) || !FindGameType(gameTypeId)) {
    return { state, ok: false, message: "立项参数不存在，像极了第一次需求会。" };
  }
  state.status = "playing";
  state.project = FreshProject(projectId, gameTypeId);
  PushLog(state, `${FindProject(projectId).title} 正式立项：${FindGameType(gameTypeId).name}。`, "good");
  PushLog(state, "你宣布目标是游戏收入 100 亿元。所有人礼貌地没有追问依据。", "normal");
  return { state, ok: true, message: "立项成功" };
}

export function CalculateTensions(project) {
  if (!project) return [];
  const modules = project.modules;
  const tensions = [];
  const artGap = modules.art - modules.performance;
  const scopeGap = modules.design - modules.client;
  const clientGap = modules.client - modules.design;
  const performanceGap = modules.performance - modules.art;

  if (artGap > 10) {
    const severity = artGap > 28 ? "critical" : artGap > 18 ? "warning" : "notice";
    tensions.push({
      id: "artOverload",
      severity,
      from: "art",
      to: "performance",
      gap: artGap,
      title: "美术把显存吃成自助餐",
      description: `美术领先性能 ${Math.round(artGap)} 点，客户端集成变慢，首发掉帧风险上升。`,
    });
  }

  if (scopeGap > 10) {
    const severity = scopeGap > 28 ? "critical" : scopeGap > 18 ? "warning" : "notice";
    tensions.push({
      id: "scopeOverreach",
      severity,
      from: "design",
      to: "client",
      gap: scopeGap,
      title: "策划已经设计到续作",
      description: `策划领先客户端 ${Math.round(scopeGap)} 点，新需求正在把旧需求挤出工期。`,
    });
  }

  if (clientGap > 24) {
    tensions.push({
      id: "featureDesert",
      severity: clientGap > 38 ? "warning" : "notice",
      from: "client",
      to: "design",
      gap: clientGap,
      title: "架构优雅，但游戏呢",
      description: `客户端领先策划 ${Math.round(clientGap)} 点，技术完整度正在制造一款无聊的好程序。`,
    });
  }

  if (performanceGap > 24) {
    tensions.push({
      id: "potatoMode",
      severity: performanceGap > 38 ? "warning" : "notice",
      from: "performance",
      to: "art",
      gap: performanceGap,
      title: "优化到只剩土豆",
      description: `性能领先美术 ${Math.round(performanceGap)} 点，帧率很稳，玩家也很难看清内容。`,
    });
  }

  if (project.scopeDebt > 18) {
    tensions.push({
      id: "scopeDebt",
      severity: project.scopeDebt > 40 ? "critical" : "warning",
      from: "design",
      to: "client",
      gap: project.scopeDebt,
      title: "范围债正在收利息",
      description: `还有 ${Math.round(project.scopeDebt)} 点范围债。客户端产出会先拿去填策划留下的坑。`,
    });
  }

  if (project.technicalDebt > 18) {
    tensions.push({
      id: "technicalDebt",
      severity: project.technicalDebt > 40 ? "critical" : "warning",
      from: "art",
      to: "performance",
      gap: project.technicalDebt,
      title: "技术债学会了繁殖",
      description: `技术债 ${Math.round(project.technicalDebt)} 点，会吞掉性能产出并增加 Bug。`,
    });
  }

  return tensions;
}

function DirectiveOutput(directiveId) {
  const output = { art: 0, design: 0, client: 0, performance: 0 };
  switch (directiveId) {
    case "artSprint":
      output.art = 8;
      break;
    case "scopeParty":
      output.design = 9;
      break;
    case "clientCrush":
      output.client = 8;
      output.performance = 1;
      break;
    case "performanceDebt":
      output.performance = 9;
      break;
    case "cutScope":
      output.design = 2;
      output.client = 5;
      output.performance = 2;
      break;
    case "integration":
    default:
      MODULE_KEYS.forEach((moduleKey) => { output[moduleKey] = 2.5; });
      break;
  }
  return output;
}

function ApplyDirectiveDebtEffects(state) {
  const project = state.project;
  switch (state.selectedDirective) {
    case "artSprint":
      project.technicalDebt += 3;
      project.hype += 3;
      break;
    case "scopeParty":
      project.scopeDebt += 7;
      project.hype += 2;
      break;
    case "clientCrush":
      project.scopeDebt = Math.max(0, project.scopeDebt - 5);
      project.bugs += 2;
      break;
    case "performanceDebt":
      project.technicalDebt = Math.max(0, project.technicalDebt - 8);
      break;
    case "cutScope":
      project.scopeDebt = Math.max(0, project.scopeDebt - 14);
      project.technicalDebt = Math.max(0, project.technicalDebt - 3);
      project.hype = Math.max(0, project.hype - 2);
      break;
    case "integration":
    default:
      project.scopeDebt = Math.max(0, project.scopeDebt - 6);
      project.technicalDebt = Math.max(0, project.technicalDebt - 6);
      project.bugs = Math.max(0, project.bugs - 1);
      break;
  }
}

function StaffFactor(member) {
  const staff = FindStaff(member.id);
  if (!staff) return 0;
  if (staff.kind === "student") {
    return Clamp(0.78 + member.morale / 220 - member.stress / 250, 0.38, 1.28);
  }
  return Clamp(1.08 - member.drift / 145, 0.38, 1.12);
}

function BuildMonthlyOutput(state) {
  const output = { art: 1.8, design: 1.8, client: 1.8, performance: 1.8 };
  const idealOutput = { art: 1.8, design: 1.8, client: 1.8, performance: 1.8 };
  const wastedOutput = { art: 0, design: 0, client: 0, performance: 0 };
  const painEvents = [];
  const directiveOutput = DirectiveOutput(state.selectedDirective);
  MODULE_KEYS.forEach((moduleKey) => {
    output[moduleKey] += directiveOutput[moduleKey];
    idealOutput[moduleKey] += directiveOutput[moduleKey];
  });

  state.team.forEach((member, memberIndex) => {
    const staff = FindStaff(member.id);
    if (!staff) return;
    let factor = StaffFactor(member);
    if (staff.kind === "student" && member.stress > 82) {
      factor *= 0.54;
      painEvents.push(`${staff.name} 压力爆表，盯着同一个报错看完了整个下午。`);
    }
    if (staff.kind === "ai" && member.drift > 76) {
      factor *= 0.52;
      painEvents.push(`${staff.name} 上下文漂移，把本月任务完成在了一个不存在的分支。`);
    }
    MODULE_KEYS.forEach((moduleKey) => {
      const baseValue = staff.output[moduleKey] || 0;
      const positiveFactor = baseValue >= 0 ? factor : 1;
      output[moduleKey] += baseValue * positiveFactor;
      idealOutput[moduleKey] += baseValue;
    });
    output[staff.specialty] += member.boost || 0;
    idealOutput[staff.specialty] += member.boost || 0;
    member.boost = 0;
    member.months += 1;

    if (staff.kind === "student") {
      member.stress = Clamp(member.stress + 5 + SeededUnit(state.seed + state.month * 31 + memberIndex) * 4, 0, 100);
      member.morale = Clamp(member.morale - 1, 0, 100);
    } else {
      const driftIncrease = 5 + SeededUnit(state.seed + state.month * 47 + memberIndex) * 8;
      member.drift = Clamp(member.drift + driftIncrease, 0, 100);
    }
  });

  MODULE_KEYS.forEach((moduleKey) => {
    wastedOutput[moduleKey] += Math.max(0, idealOutput[moduleKey] - output[moduleKey]);
  });

  const uncovered = MODULE_KEYS.filter((moduleKey) => !state.team.some((member) => FindStaff(member.id)?.specialty === moduleKey));
  uncovered.forEach((moduleKey) => {
    const before = output[moduleKey];
    output[moduleKey] *= 0.7;
    wastedOutput[moduleKey] += Math.max(0, before - output[moduleKey]);
  });
  if (uncovered.length >= 2) {
    painEvents.push(`老板兼任${uncovered.map((moduleKey) => MODULE_META_LABELS[moduleKey]).join("、")}，切软件的时间比做游戏多。`);
  }

  if (state.assets.drawingTablet === "seized") {
    const before = output.art;
    output.art *= 0.8;
    wastedOutput.art += Math.max(0, before - output.art);
    painEvents.push("数位屏没了，美术正在用鼠标画角色的另一只眼。 ");
  }
  if (state.hunger > 65) {
    MODULE_KEYS.forEach((moduleKey) => {
      const before = output[moduleKey];
      output[moduleKey] *= 0.86;
      wastedOutput[moduleKey] += Math.max(0, before - output[moduleKey]);
    });
    painEvents.push("老板太饿，把版本号看成了外卖取餐号。全组产出打折。 ");
  }

  const conditionAverage = state.team.length
    ? Average(state.team.map((member) => FindStaff(member.id).kind === "student" ? member.stress : member.drift))
    : 58;
  const painScore = state.project.scopeDebt + state.project.technicalDebt + state.project.bugs + conditionAverage * 0.35;
  const mishapChance = Clamp(0.2 + painScore * 0.006 + (state.team.length < 2 ? 0.18 : 0), 0.2, 0.82);
  const mishapRoll = SeededUnit(state.seed + state.month * 211 + state.team.length * 17);
  if (mishapRoll < mishapChance) {
    const moduleIndex = Math.floor(SeededUnit(state.seed + state.month * 223) * MODULE_KEYS.length) % MODULE_KEYS.length;
    const moduleKey = MODULE_KEYS[moduleIndex];
    const loss = Math.min(output[moduleKey] * 0.72, 2.4 + painScore * 0.035);
    output[moduleKey] -= loss;
    wastedOutput[moduleKey] += Math.max(0, loss);
    const mishaps = {
      art: ["源文件色彩空间错了，半天导出的都是赛博灰。", "角色改到第九版后，大家一致怀念第一版。"],
      design: ["需求评审开了两小时，结论是下次再评。", "新手教程能解释全部系统，代价是长达四十分钟。"],
      client: ["合并分支后，能跑的版本和最新的版本分成了两个版本。", "一个空指针让全组重新理解了‘空’的哲学含义。"],
      performance: ["性能报告证明问题很严重，但没有证明问题在哪。", "优化后快了 8%，随后新特效让它慢了 23%。"],
    };
    const lineIndex = Math.floor(SeededUnit(state.seed + state.month * 227) * mishaps[moduleKey].length) % mishaps[moduleKey].length;
    painEvents.push(mishaps[moduleKey][lineIndex]);
  }
  return { output, wastedOutput, painEvents };
}

const MODULE_META_LABELS = {
  art: "美术",
  design: "策划",
  client: "客户端",
  performance: "性能",
};

function ApplyCrossModuleConstraints(state, rawOutput) {
  const project = state.project;
  const output = { ...rawOutput };
  const artGap = Math.max(0, project.modules.art - project.modules.performance - 10);
  const scopeGap = Math.max(0, project.modules.design - project.modules.client - 10);
  const featureGap = Math.max(0, project.modules.client - project.modules.design - 24);
  const performanceGap = Math.max(0, project.modules.performance - project.modules.art - 24);

  if (scopeGap > 0) {
    output.client *= Clamp(1 - scopeGap * 0.018, 0.42, 1);
    project.scopeDebt += scopeGap * 0.12 + Math.max(0, output.design - output.client) * 0.16;
  }
  if (artGap > 0) {
    output.client *= Clamp(1 - artGap * 0.009, 0.68, 1);
    output.performance *= Clamp(1 - artGap * 0.008, 0.72, 1);
    project.technicalDebt += artGap * 0.12 + Math.max(0, output.art - output.performance) * 0.12;
  }
  if (featureGap > 0) output.client *= Clamp(1 - featureGap * 0.012, 0.7, 1);
  if (performanceGap > 0) output.art *= Clamp(1 - performanceGap * 0.012, 0.68, 1);

  const clientDebtPayment = Math.min(project.scopeDebt, Math.max(0, output.client) * (state.selectedDirective === "cutScope" ? 0.78 : 0.34));
  project.scopeDebt -= clientDebtPayment;
  output.client -= clientDebtPayment * 0.2;

  const performanceDebtPayment = Math.min(project.technicalDebt, Math.max(0, output.performance) * (state.selectedDirective === "performanceDebt" ? 0.78 : 0.34));
  project.technicalDebt -= performanceDebtPayment;
  output.performance -= performanceDebtPayment * 0.2;

  project.scopeDebt = Clamp(project.scopeDebt, 0, 80);
  project.technicalDebt = Clamp(project.technicalDebt, 0, 80);
  project.bugs = Clamp(
    project.bugs + project.scopeDebt * 0.035 + project.technicalDebt * 0.035 - output.client * 0.09 - output.performance * 0.07,
    0,
    60,
  );
  return output;
}

function CalculateBuildStatus(project) {
  const integrationScore = project.modules.client * 0.42
    + project.modules.performance * 0.22
    + Math.min(project.modules.design, project.modules.client) * 0.2
    + Math.min(project.modules.art, project.modules.performance) * 0.16
    - project.bugs * 0.72
    - project.scopeDebt * 0.24
    - project.technicalDebt * 0.27;
  const score = Clamp(integrationScore, 0, 100);
  if (project.modules.client < 25) {
    return { level: "broken", label: "打不开", detail: "主场景仍然是一个充满希望的空文件夹。", score };
  }
  if (project.scopeDebt > 46) {
    return { level: "broken", label: "需求把构建憋死了", detail: "入口有七个，能走通的流程是零个。", score };
  }
  if (project.technicalDebt > 46) {
    return { level: "broken", label: "编译通过，运行去世", detail: "启动画面之后是一段很稳定的黑屏。", score };
  }
  if (score < 40 || project.bugs > 32) {
    return { level: "fragile", label: "偶尔能进主菜单", detail: "能做出垃圾之前，先得让垃圾成功启动。", score };
  }
  if (score < 63 || project.bugs > 18) {
    return { level: "playable", label: "能玩，但别乱点", detail: "沿着演示路线走，像一款已经完成的游戏。", score };
  }
  return { level: "stable", label: "终于有稳定构建", detail: "它不一定好玩，但至少可以连续运行十分钟。", score };
}

function ProgressProject(state) {
  const project = state.project;
  const production = BuildMonthlyOutput(state);
  const rawOutput = production.output;
  ApplyDirectiveDebtEffects(state);
  const output = ApplyCrossModuleConstraints(state, rawOutput);
  MODULE_KEYS.forEach((moduleKey) => {
    production.wastedOutput[moduleKey] += Math.max(0, rawOutput[moduleKey] - output[moduleKey]);
  });
  MODULE_KEYS.forEach((moduleKey) => {
    project.modules[moduleKey] = Clamp(project.modules[moduleKey] + output[moduleKey], 0, 100);
  });
  const wastedTotal = Object.values(production.wastedOutput).reduce((total, value) => total + Math.max(0, value), 0);
  project.wastedWork += wastedTotal;
  project.buildStatus = CalculateBuildStatus(project);
  project.buildStreak = ["playable", "stable"].includes(project.buildStatus.level) ? project.buildStreak + 1 : 0;
  project.painHistory.push({
    month: state.month,
    wastedWork: wastedTotal,
    events: production.painEvents.slice(0, 4),
    buildStatus: project.buildStatus,
  });
  project.painHistory = project.painHistory.slice(-12);
  project.age += 1;
  project.monthsSinceUpdate += project.isReleased ? 1 : 0;
  project.hype = Clamp(project.hype + 0.5 + state.reputation * 0.025, 0, 100);
  return { ...production, output, wastedTotal, buildStatus: project.buildStatus };
}

export function ForecastMonthlyCosts(state) {
  const studentWages = state.team
    .map((member) => FindStaff(member.id))
    .filter((staff) => staff?.kind === "student")
    .reduce((total, staff) => total + staff.monthlyCost, 0);
  const aiRent = state.team
    .map((member) => FindStaff(member.id))
    .filter((staff) => staff?.kind === "ai")
    .reduce((total, staff) => total + staff.monthlyCost, 0);
  const living = LIVING_BILLS.reduce((total, bill) => total + bill.amount, 0)
    + (state.assets.home === "seized" ? 2200 : 0)
    + (state.assets.car === "seized" ? 600 : 0);
  const loanPayments = state.loans
    .filter((loan) => loan.status === "active")
    .reduce((total, loan) => total + loan.monthlyPayment, 0);
  const gameType = state.project ? FindGameType(state.project.gameTypeId) : null;
  const service = state.project?.isReleased ? (gameType?.monthlyServiceCost || 0) : 0;
  return {
    studentWages,
    aiRent,
    living,
    loanPayments,
    service,
    total: studentWages + aiRent + living + loanPayments + service,
  };
}

function CurrentLiveIncome(state) {
  if (!state.project?.isReleased) return 0;
  const gameType = FindGameType(state.project.gameTypeId);
  const decay = Math.pow(gameType.liveDecay, state.project.monthsSinceUpdate);
  return RoundMoney(state.project.monthlyRevenue * decay);
}

function RemoveUnpayableTeam(state, availableBudget, baseCosts) {
  const removed = [];
  const ordered = [...state.team].sort((memberA, memberB) => {
    const staffA = FindStaff(memberA.id);
    const staffB = FindStaff(memberB.id);
    if (staffA.kind !== staffB.kind) return staffA.kind === "ai" ? -1 : 1;
    return staffB.monthlyCost - staffA.monthlyCost;
  });
  let teamCost = state.team.reduce((total, member) => total + FindStaff(member.id).monthlyCost, 0);
  for (const member of ordered) {
    if (baseCosts + teamCost <= availableBudget) break;
    const staff = FindStaff(member.id);
    teamCost -= staff.monthlyCost;
    state.team = state.team.filter((candidate) => candidate.id !== member.id);
    removed.push(staff);
  }
  return removed;
}

function ProcessFinances(state) {
  const income = CurrentLiveIncome(state);
  state.cash += income;
  state.totalRevenue += income;
  state.gameRevenue += income;
  const defaults = [];
  const available = state.cash;
  let costs = ForecastMonthlyCosts(state);

  const activeLoans = state.loans
    .filter((loan) => loan.status === "active")
    .sort((loanA, loanB) => loanB.monthlyPayment - loanA.monthlyPayment);
  for (const loan of activeLoans) {
    if (costs.total <= available) break;
    loan.status = "defaulted";
    state.assets[loan.collateralId] = "seized";
    defaults.push(loan);
    PushLog(state, `${FindCollateral(loan.collateralId).name} 因断供被收走。贷款公司比版本更新更准时。`, "danger");
    costs = ForecastMonthlyCosts(state);
  }

  const baseWithoutTeam = costs.total - costs.studentWages - costs.aiRent;
  const removedStaff = RemoveUnpayableTeam(state, available, baseWithoutTeam);
  removedStaff.forEach((staff) => {
    PushLog(
      state,
      staff.kind === "ai"
        ? `${staff.name} 因续租失败停服，并留下一个指向升级页面的链接。`
        : `${staff.name} 因工资未到账离职，并祝你“创业成功”。`,
      "danger",
    );
  });
  costs = ForecastMonthlyCosts(state);

  let skippedFood = false;
  if (costs.total > state.cash) {
    skippedFood = true;
    costs.living -= 1800;
    costs.total -= 1800;
    state.hunger = Clamp(state.hunger + 22, 0, 100);
    PushLog(state, "本月选择：人先饿着，电脑继续通电。饥饿值 +22。", "warning");
  } else {
    state.hunger = Clamp(state.hunger - 10, 0, 100);
  }

  let shortfall = 0;
  if (costs.total > state.cash) {
    shortfall = costs.total - state.cash;
    state.arrears += shortfall;
    state.cash = 0;
    state.reputation = Math.max(0, state.reputation - 2);
    PushLog(state, `仍有 ¥${Math.round(shortfall).toLocaleString("zh-CN")} 欠款滚入下月。房东开始用句号发消息。`, "danger");
  } else {
    state.cash -= costs.total;
  }
  state.totalCosts += costs.total;

  state.loans.forEach((loan) => {
    if (loan.status !== "active") return;
    loan.remaining -= 1;
    if (loan.remaining <= 0) {
      loan.status = "repaid";
      state.assets[loan.collateralId] = "free";
      PushLog(state, `${FindCollateral(loan.collateralId).name} 已赎回。你短暂拥有了信用。`, "good");
    }
  });

  if (state.assets.computer === "seized") {
    state.status = "gameover";
    state.outcome = {
      title: "电脑被抬走了",
      subtitle: "人饿着还能开会，电脑没了只能开空会。",
      kind: "computerLost",
    };
  }

  CheckRevenueGoal(state);

  return { income, costs, defaults, removedStaff, skippedFood, shortfall };
}

export function EvaluateProject(state) {
  if (!state.project) return null;
  const project = state.project;
  const gameType = FindGameType(project.gameTypeId);
  const weightedValues = MODULE_KEYS.map((moduleKey) => project.modules[moduleKey] / gameType.requirements[moduleKey]);
  const base = Average(weightedValues) / 10;
  const minimum = Math.min(...weightedValues);
  const artGap = Math.max(0, project.modules.art - project.modules.performance - 10);
  const scopeGap = Math.max(0, project.modules.design - project.modules.client - 10);
  const clientGap = Math.max(0, project.modules.client - project.modules.design - 24);
  const performanceGap = Math.max(0, project.modules.performance - project.modules.art - 24);
  const balanceBonus = minimum > 72 ? 0.55 : minimum > 58 ? 0.34 : minimum > 42 ? 0.16 : 0;
  let penalty = 0;
  penalty += Math.min(1.65, artGap * 0.041);
  penalty += Math.min(1.85, scopeGap * 0.047);
  penalty += Math.min(0.72, clientGap * 0.02);
  penalty += Math.min(0.78, performanceGap * 0.022);
  penalty += Math.min(0.92, project.scopeDebt * 0.018);
  penalty += Math.min(0.92, project.technicalDebt * 0.018);
  penalty += Math.min(0.72, project.bugs * 0.016);

  if (gameType.id === "online" && project.modules.performance < 48) penalty += 0.55;
  if (gameType.id === "online" && project.modules.client < 48) penalty += 0.55;
  if (gameType.id === "mobile" && project.modules.performance < 56) penalty += 0.68;
  if (gameType.id === "premium" && minimum < 35) penalty += 0.4;
  if (project.buildStatus?.level === "broken") penalty += 0.82;
  else if (project.buildStatus?.level === "fragile") penalty += 0.34;

  const stressAverage = state.team.length
    ? Average(state.team.map((member) => FindStaff(member.id).kind === "student" ? member.stress : member.drift))
    : 50;
  penalty += Math.max(0, stressAverage - 76) * 0.012;
  const noise = (SeededUnit(state.seed + state.month * 97 + project.version * 13) - 0.5) * 0.18;
  const rating = Clamp(base + balanceBonus - penalty + noise, 1, 9.8);
  return {
    rating: Math.round(rating * 10) / 10,
    rawRating: rating,
    base,
    balanceBonus,
    penalty,
    effectiveModules: Object.fromEntries(MODULE_KEYS.map((moduleKey, index) => [moduleKey, weightedValues[index]])),
    tensions: CalculateTensions(project),
  };
}

function PickReview(rating, seed) {
  const group = rating >= 8.2 ? REVIEW_LINES.excellent : rating >= 6.7 ? REVIEW_LINES.good : rating >= 4.7 ? REVIEW_LINES.mixed : REVIEW_LINES.bad;
  return group[Math.floor(SeededUnit(seed) * group.length) % group.length];
}

function RevenueForRating(state, rating, isUpdate) {
  const gameType = FindGameType(state.project.gameTypeId);
  const appeal = Math.max(0.3, rating - 3.1);
  const fanLift = 1 + Math.min(0.5, state.fans / 25000);
  const launchBase = appeal * appeal * 5400 * gameType.revenueMultiplier * fanLift;
  if (!isUpdate) return RoundMoney(launchBase + state.project.hype * 520);
  const delta = rating - (state.project.lastRating || rating);
  const updateLift = 0.16 + Math.max(-0.08, delta * 0.18);
  return RoundMoney(Math.max(0, launchBase * updateLift));
}

function MonthlyRevenueForRating(state, rating) {
  const gameType = FindGameType(state.project.gameTypeId);
  const appeal = Math.max(0.15, rating - 3.7);
  const base = appeal * appeal * (gameType.id === "premium" ? 1150 : gameType.id === "online" ? 2350 : 2050);
  return RoundMoney((base * gameType.revenueMultiplier + state.fans * 0.08) * state.project.marketScale);
}

function MarketGrowthForRating(rating, ratingDelta) {
  let growth = rating >= 8.6 ? 2.12
    : rating >= 8 ? 1.92
      : rating >= 7.2 ? 1.68
        : rating >= 6.4 ? 1.43
          : rating >= 5.4 ? 1.19
            : 1.04;
  if (ratingDelta < -0.4) growth *= 0.72;
  else if (ratingDelta > 0.5) growth *= 1.12;
  return Clamp(growth, 0.72, 2.28);
}

function CheckRevenueGoal(state) {
  if (state.status !== "playing" || state.gameRevenue < state.revenueGoal) return false;
  state.status = "ended";
  state.outcome = {
    kind: "worldMaker",
    title: "100 亿元，世界听见了",
    subtitle: "你从做不出一个垃圾开始，最后做成了能影响世界的游戏制作人。电脑也还在。",
  };
  PushLog(state, "累计游戏收入达到 100 亿元。贷款公司第一次主动给你发了祝福。", "good");
  return true;
}

export function ReleaseBuild(currentState) {
  const state = Clone(currentState);
  if (state.status !== "playing" || !state.project) return { state, ok: false, message: "目前没有能发布的项目。" };
  if (state.project.age < 2) return { state, ok: false, message: "至少做满两个月再上线，不然商店截图只能放办公室。" };
  if (state.project.lastReleaseMonth === state.month) return { state, ok: false, message: "这个月已经发过版本。给玩家一点下载补丁的时间。" };

  const evaluation = EvaluateProject(state);
  const isUpdate = state.project.isReleased;
  const revenue = RevenueForRating(state, evaluation.rating, isUpdate);
  const oldRating = state.project.lastRating;
  state.project.isReleased = true;
  state.project.version += 1;
  state.project.lastRating = evaluation.rating;
  state.project.bestRating = Math.max(state.project.bestRating || 0, evaluation.rating);
  const ratingDelta = oldRating == null ? 0 : evaluation.rating - oldRating;
  state.project.marketScale = isUpdate
    ? Clamp(state.project.marketScale * MarketGrowthForRating(evaluation.rating, ratingDelta), 0.5, 100000000)
    : 1;
  state.project.monthlyRevenue = MonthlyRevenueForRating(state, evaluation.rating);
  state.project.monthsSinceUpdate = 0;
  state.project.lastReleaseMonth = state.month;
  state.project.releaseHistory.push({ month: state.month, version: state.project.version, rating: evaluation.rating, revenue });
  state.cash += revenue;
  state.totalRevenue += revenue;
  state.gameRevenue += revenue;
  state.bestRating = Math.max(state.bestRating || 0, evaluation.rating);
  state.fans = Math.round(state.fans + Math.max(0, evaluation.rating - 4) * (isUpdate ? 310 : 820));
  state.reputation = Clamp(state.reputation + (evaluation.rating - 5) * 1.4, 0, 100);

  const review = PickReview(evaluation.rating, state.seed + state.month * 113 + state.project.version);
  const verb = isUpdate ? `v${state.project.version}.0 更新` : "首发上线";
  PushLog(state, `${verb}：${evaluation.rating.toFixed(1)} 分，到账 ¥${revenue.toLocaleString("zh-CN")}。${review}`, evaluation.rating >= 6.7 ? "good" : "warning");
  CheckRevenueGoal(state);
  return {
    state,
    ok: true,
    isUpdate,
    evaluation,
    revenue,
    oldRating,
    review,
    message: isUpdate ? "版本更新已发布" : "游戏已上线",
  };
}

export function AdvanceMonth(currentState) {
  const state = Clone(currentState);
  if (state.status !== "playing" || !state.project) return { state, ok: false, message: "当前不能推进月份。" };
  const production = ProgressProject(state);
  const output = production.output;
  const finance = ProcessFinances(state);
  const tensions = CalculateTensions(state.project);
  const directive = FindDirective(state.selectedDirective);
  if (state.status === "playing") {
    const tensionText = tensions[0]?.title || "四组暂时没有互相拉黑";
    PushLog(state, `${directive.name}结算：${tensionText}。`, tensions.some((item) => item.severity === "critical") ? "warning" : "normal");
  }
  state.lastSettlement = {
    month: state.month,
    output,
    wastedOutput: production.wastedOutput,
    wastedTotal: production.wastedTotal,
    painEvents: production.painEvents,
    buildStatus: production.buildStatus,
    finance,
    tensions,
    directiveId: state.selectedDirective,
  };
  state.talkPoints = 2;
  state.selectedDirective = "integration";
  if (state.status === "playing") state.month += 1;
  return {
    state,
    ok: true,
    output,
    wastedOutput: production.wastedOutput,
    wastedTotal: production.wastedTotal,
    painEvents: production.painEvents,
    buildStatus: production.buildStatus,
    finance,
    tensions,
    message: "月报已结算",
  };
}

export function HireStaff(currentState, staffId) {
  const state = Clone(currentState);
  const staff = FindStaff(staffId);
  if (!staff) return { state, ok: false, message: "人才不存在，可能已被别的创业者画饼带走。" };
  if (state.status !== "playing") return { state, ok: false, message: "请先立项。" };
  if (state.team.some((member) => member.id === staffId)) return { state, ok: false, message: `${staff.name} 已经在工位上了。` };
  if (state.team.length >= 4) return { state, ok: false, message: "办公室只有四张外包工位。先结束一段缘分。" };
  state.team.push({ id: staffId, morale: 70, stress: 18, drift: 12, boost: 0, months: 0 });
  PushLog(
    state,
    staff.kind === "ai"
      ? `租用 ${staff.name}，每月 ¥${staff.monthlyCost.toLocaleString("zh-CN")}，取消订阅时不保证代码还能看懂。`
      : `雇用 ${staff.name}，月薪 ¥${staff.monthlyCost.toLocaleString("zh-CN")}。对方礼貌地接受了创业风险。`,
    "good",
  );
  return { state, ok: true, message: staff.kind === "ai" ? "AI 已开始计费" : "大学生已入职" };
}

export function FireStaff(currentState, staffId) {
  const state = Clone(currentState);
  const staff = FindStaff(staffId);
  if (!staff || !state.team.some((member) => member.id === staffId)) return { state, ok: false, message: "对方并不在团队里。" };
  state.team = state.team.filter((member) => member.id !== staffId);
  PushLog(state, staff.kind === "ai" ? `已取消 ${staff.name} 的月租。它最后生成了一张续费二维码。` : `${staff.name} 离开了团队，并带走了自己写得最好的那段代码。`, "warning");
  return { state, ok: true, message: staff.kind === "ai" ? "订阅已取消" : "员工已离职" };
}

export function SelectDirective(currentState, directiveId) {
  const state = Clone(currentState);
  const directive = FindDirective(directiveId);
  if (!directive) return { state, ok: false, message: "策略不存在。" };
  state.selectedDirective = directiveId;
  return { state, ok: true, message: `本月策略：${directive.name}` };
}

function SelectLine(staff, tone, seed) {
  const key = tone === "pressure" ? "pressureLines" : tone === "encourage" ? "encourageLines" : tone === "roast" ? "roastLines" : tone === "sync" ? "syncLines" : "idleLines";
  const lines = staff[key] || staff.idleLines;
  return lines[Math.floor(SeededUnit(seed) * lines.length) % lines.length];
}

export function GetIdleLine(state, staffId) {
  const staff = FindStaff(staffId);
  if (!staff) return "这个工位只剩下一杯不知道谁的咖啡。";
  return SelectLine(staff, "idle", state.seed + state.month * 17 + staffId.length * 19);
}

export function TalkToStaff(currentState, staffId, tone) {
  const state = Clone(currentState);
  const staff = FindStaff(staffId);
  const member = state.team.find((candidate) => candidate.id === staffId);
  if (!staff || !member) return { state, ok: false, message: "先把人雇来，不能隔着人才市场鞭策。" };
  if (state.talkPoints <= 0) return { state, ok: false, message: "本月嗓子用完了。进入下月后再继续画饼。" };
  if (!["pressure", "encourage", "roast", "sync"].includes(tone)) return { state, ok: false, message: "对话方式无效。" };
  state.talkPoints -= 1;
  const isStudent = staff.kind === "student";
  if (tone === "pressure") {
    member.boost += 6;
    if (isStudent) {
      member.stress = Clamp(member.stress + 18, 0, 100);
      member.morale = Clamp(member.morale - 8, 0, 100);
    } else member.drift = Clamp(member.drift + 14, 0, 100);
  } else if (tone === "encourage") {
    member.boost += 2;
    if (isStudent) {
      member.stress = Clamp(member.stress - 8, 0, 100);
      member.morale = Clamp(member.morale + 13, 0, 100);
    } else member.drift = Clamp(member.drift - 11, 0, 100);
  } else if (tone === "roast") {
    member.boost += 3;
    if (isStudent) {
      member.stress = Clamp(member.stress + 9, 0, 100);
      member.morale = Clamp(member.morale - 11, 0, 100);
    } else member.drift = Clamp(member.drift + 4, 0, 100);
  } else if (tone === "sync") {
    member.boost += 3;
    state.project.scopeDebt = Math.max(0, state.project.scopeDebt - 4);
    state.project.technicalDebt = Math.max(0, state.project.technicalDebt - 4);
    if (isStudent) member.stress = Clamp(member.stress + 2, 0, 100);
    else member.drift = Clamp(member.drift - 6, 0, 100);
  }
  const line = SelectLine(staff, tone, state.seed + state.month * 29 + state.talkPoints * 7 + staffId.length);
  PushLog(state, `${staff.name}：${line}`, tone === "roast" ? "warning" : "normal");
  return { state, ok: true, message: "对话完成", line };
}

export function TakeLoan(currentState, collateralId) {
  const state = Clone(currentState);
  const collateral = FindCollateral(collateralId);
  if (!collateral) return { state, ok: false, message: "抵押物不存在。" };
  if (state.assets[collateralId] !== "free") return { state, ok: false, message: `${collateral.name} 已经不完全属于你了。` };
  state.assets[collateralId] = "pledged";
  state.cash += collateral.principal;
  state.totalRevenue += collateral.principal;
  state.loans.push({
    collateralId,
    principal: collateral.principal,
    monthlyPayment: collateral.monthlyPayment,
    remaining: collateral.term,
    status: "active",
    startMonth: state.month,
  });
  PushLog(state, `抵押 ${collateral.name}，到账 ¥${collateral.principal.toLocaleString("zh-CN")}。未来的你已读不回。`, collateral.fatal ? "danger" : "warning");
  if (collateral.fatal) {
    state.assets.computer = "seized";
    state.status = "gameover";
    state.outcome = {
      kind: "computerPledged",
      title: "你抵押了开发电脑",
      subtitle: "钱到账了，但项目文件和尊严一起离线。人能饿，电脑不能没。",
    };
  }
  return { state, ok: true, fatal: Boolean(collateral.fatal), message: collateral.fatal ? "开发电脑已被抬走" : "贷款已到账" };
}

export function GetPublicCatalog() {
  return {
    staff: STAFF_CATALOG,
    directives: DIRECTIVES,
    projects: PROJECTS,
    gameTypes: GAME_TYPES,
    bills: LIVING_BILLS,
    collateral: COLLATERAL_OPTIONS,
  };
}

export function ValidateState(candidate) {
  return Boolean(
    candidate
    && candidate.rulesVersion === RULES_VERSION
    && ["setup", "playing", "gameover", "ended"].includes(candidate.status)
    && Number.isFinite(candidate.cash)
    && Array.isArray(candidate.team)
    && Array.isArray(candidate.loans)
  );
}
