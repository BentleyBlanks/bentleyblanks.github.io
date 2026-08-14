import {
  ABSTRACT_IDEAS,
  AI_SUBSCRIPTION_LEVELS,
  COLLATERAL_OPTIONS,
  DIRECTIVES,
  FEATURE_CHOICES,
  FindCollateral,
  FindDirective,
  FindFeatureChoice,
  FindFoodPlan,
  FindGameType,
  FindMarketDirection,
  FindMarketingCampaign,
  FindProject,
  FindStaff,
  MARKETING_CAMPAIGNS,
  GAME_TYPES,
  FOOD_PLANS,
  LIVING_BILLS,
  LIVE_REVENUE_EVENTS,
  MARKET_DIRECTIONS,
  MARKET_EVENTS,
  MODULE_KEYS,
  PIVOT_REASONS,
  PROJECTS,
  REVIEW_LINES,
  SPECULATION_OPTIONS,
  STAFF_CATALOG,
  STUDENT_PAY_LEVELS,
} from "./Data_Game.mjs?v=20260815h";

export const SAVE_KEY = "studio_survival_v1";
export const RULES_VERSION = 9;
export const STARTUP_LOAN_TERMS = Object.freeze({
  principal: 68000,
  totalDue: 82000,
  dueMonth: 8,
});
export const WORKSTATION_COSTS = Object.freeze([18000, 26000, 36000, 50000]);
export const MARKET_INDEPENDENT_ID = "independent";
export const OWNER_HAIR_STAGES = Object.freeze({
  full: "full",
  thinning: "thinning",
  bald: "bald",
});

export function GetOwnerHairStage(monthValue) {
  const month = Math.max(1, Math.floor(Number(monthValue) || 1));
  if (month >= 19) return OWNER_HAIR_STAGES.bald;
  if (month >= 13) return OWNER_HAIR_STAGES.thinning;
  return OWNER_HAIR_STAGES.full;
}

function Clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function Clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function RoundMoney(value) {
  return Math.round(value / 100) * 100;
}

function CleanName(value, fallback, maximumLength = 18) {
  const cleaned = String(value ?? "").replace(/[<>\r\n\t]/g, "").replace(/\s+/g, " ").trim();
  return (cleaned || fallback).slice(0, maximumLength);
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

function MarketTrendForMonth(state, requestedMonth) {
  const month = Math.max(1, Math.floor(Number(requestedMonth) || 1));
  const trendPeriod = Math.floor((month - 1) / 2);
  const trendIndex = Math.floor(SeededUnit((state?.seed || 82417) + trendPeriod * 733 + 17) * MARKET_DIRECTIONS.length) % MARKET_DIRECTIONS.length;
  return MARKET_DIRECTIONS[trendIndex];
}

function MarketEventForMonth(state, requestedMonth) {
  const month = Math.max(1, Math.floor(Number(requestedMonth) || 1));
  const eventIndex = Math.floor(SeededUnit((state?.seed || 82417) + month * 787 + 29) * MARKET_EVENTS.length) % MARKET_EVENTS.length;
  return MARKET_EVENTS[eventIndex];
}

export function GetMarketSnapshot(state, requestedMonth = state?.month || 1) {
  const month = Math.max(1, Math.floor(Number(requestedMonth) || 1));
  const trend = MarketTrendForMonth(state, month);
  const marketEvent = MarketEventForMonth(state, month);
  const effectiveDirection = FindMarketDirection(marketEvent?.directionId) || trend;
  const nextTrend = MarketTrendForMonth(state, month + 1);
  const confidence = 62 + Math.floor(SeededUnit((state?.seed || 82417) + month * 809 + 41) * 24);
  return {
    month,
    trend,
    event: marketEvent,
    effectiveDirection,
    heatMultiplier: marketEvent?.heatMultiplier || 1,
    trendEndsMonth: (Math.floor((month - 1) / 2) + 1) * 2,
    nextRumor: {
      direction: nextTrend,
      confidence,
    },
  };
}

function MarketFocusFor(state, requestedFocusId) {
  if (!state?.project) return null;
  const focusId = requestedFocusId || "concept";
  if (focusId === "concept") {
    const project = FindProject(state.project.templateId);
    return project ? {
      id: "concept",
      title: "立项特色 · " + project.trend,
      marketDirections: project.marketDirections || [],
    } : null;
  }
  if (!state.project.features.some((feature) => feature.id === focusId)) return null;
  const feature = FindFeatureChoice(focusId);
  return feature ? {
    id: feature.id,
    title: feature.title,
    marketDirections: feature.marketDirections || [],
  } : null;
}

export function EvaluateMarketFit(state, overrides = {}) {
  if (!state?.project) return null;
  const savedStrategy = state.project.marketStrategy || {};
  const hasFocusOverride = Object.prototype.hasOwnProperty.call(overrides, "focusId");
  const hasDirectionOverride = Object.prototype.hasOwnProperty.call(overrides, "directionId");
  const focusId = hasFocusOverride ? overrides.focusId : (savedStrategy.focusId || "concept");
  let directionId = hasDirectionOverride ? overrides.directionId : (savedStrategy.directionId || null);
  if (directionId === MARKET_INDEPENDENT_ID) directionId = null;
  const focus = MarketFocusFor(state, focusId) || MarketFocusFor(state, "concept");
  const snapshot = GetMarketSnapshot(state);
  const effectiveDirection = snapshot.effectiveDirection;
  const focusMatch = Boolean(focus?.marketDirections.includes(effectiveDirection.id));
  const directionMatch = directionId === effectiveDirection.id;
  const taboo = Boolean(directionId && snapshot.event?.tabooDirectionId === directionId);
  const setMonth = Number(savedStrategy.setMonth) || 0;
  const stale = setMonth > 0 && setMonth < state.month;
  let result;

  if (!directionId) {
    result = {
      tier: "independent",
      label: "不追风，靠自然口碑",
      description: focusMatch
        ? "特色碰巧和风口沾边，但你没有主动迎合；只能吃到自然流量，也不会因蹭错热点挨骂。"
        : "没有迎合承诺，市场只给自然流量。安全，但不调整就会少拿收入。",
      revenueMultiplier: 0.82,
      refundRateDelta: 0,
      reputationDelta: 0,
      fanMultiplier: 1,
      backlash: false,
      perfect: false,
      tone: "neutral",
    };
  } else if (taboo) {
    result = {
      tier: "taboo",
      label: "踩中雷区 · 人人喊打",
      description: "突发事件刚把这套说法变成全网靶子，你却在最糟的时机把它写进宣传头条。",
      revenueMultiplier: 0.28,
      refundRateDelta: 0.32,
      reputationDelta: -11,
      fanMultiplier: 0.2,
      backlash: true,
      perfect: false,
      tone: "danger",
    };
  } else if (directionMatch && focusMatch) {
    result = {
      tier: "perfect",
      label: "特色 × 风向 · 正中风口",
      description: "主打特色真的兑现了当月需求，迎合话术也恰好说中了玩家正在找的东西。",
      revenueMultiplier: Clamp(effectiveDirection.perfectMultiplier * snapshot.heatMultiplier, 1.45, 2.25),
      refundRateDelta: -0.035,
      reputationDelta: 4,
      fanMultiplier: 1.28,
      backlash: false,
      perfect: true,
      tone: "good",
    };
  } else if (directionMatch) {
    result = {
      tier: "hollow",
      label: "只改话术 · 硬蹭风口",
      description: "宣传方向对了，主打特色却拿不出对应内容。玩家把这叫关键词诈骗。",
      revenueMultiplier: 0.72,
      refundRateDelta: 0.18,
      reputationDelta: -5,
      fanMultiplier: 0.55,
      backlash: true,
      perfect: false,
      tone: "danger",
    };
  } else if (focusMatch) {
    result = {
      tier: "mixed",
      label: "内容对了，时机说错了",
      description: "游戏里明明有玩家想要的特色，你却沿用旧热点的话术，评论区开始质疑团队到底懂不懂自己的游戏。",
      revenueMultiplier: 0.68,
      refundRateDelta: 0.14,
      reputationDelta: -4,
      fanMultiplier: 0.7,
      backlash: true,
      perfect: false,
      tone: "warning",
    };
  } else {
    result = {
      tier: "miss",
      label: "方向过期 · 人人喊打",
      description: "特色和迎合方向都没对上本月市场，宣传截图成了玩家群嘲新素材。",
      revenueMultiplier: 0.42,
      refundRateDelta: 0.25,
      reputationDelta: -8,
      fanMultiplier: 0.35,
      backlash: true,
      perfect: false,
      tone: "danger",
    };
  }

  return {
    ...result,
    snapshot,
    focus,
    direction: directionId ? FindMarketDirection(directionId) : null,
    focusMatch,
    directionMatch,
    taboo,
    stale,
    setMonth,
  };
}

function PushLog(state, text, tone = "normal") {
  state.log.unshift({ month: state.month, text, tone, id: `${state.month}_${state.logSerial}` });
  state.logSerial += 1;
  state.log = state.log.slice(0, 18);
}

function InvestmentPlanForMember(member) {
  const staff = member ? FindStaff(member.id) : null;
  if (!staff) return null;
  const levels = staff.kind === "ai" ? AI_SUBSCRIPTION_LEVELS : STUDENT_PAY_LEVELS;
  return levels.find((plan) => plan.level === (member.investmentLevel || 0)) || levels[0];
}

export function GetMemberMonthlyCost(member) {
  const staff = member ? FindStaff(member.id) : null;
  const plan = InvestmentPlanForMember(member);
  if (!staff || !plan) return 0;
  if (staff.kind === "ai") return RoundMoney(staff.monthlyCost * plan.costMultiplier);
  return staff.monthlyCost + plan.extraCost;
}

export function GetAnxietyState(anxietyValue) {
  const value = Clamp(anxietyValue || 0, 0, 100);
  if (value >= 88) return { level: "critical", label: "现实正在解体", description: "对话与画面严重错乱，再受刺激就会彻底崩溃。" };
  if (value >= 68) return { level: "high", label: "思绪开始错乱", description: "语言、画面和判断都在失真，也更容易迸发怪异创意。" };
  if (value >= 42) return { level: "medium", label: "焦虑发作", description: "工作室开始晃，但抽象灵感也可能从裂缝里钻出来。" };
  return { level: "normal", label: "勉强正常", description: "仍能区分 Bug、需求和催款短信。" };
}

function CheckAnxietyFailure(state) {
  if (state.status !== "playing" || state.anxiety < 100) return false;
  state.anxiety = 100;
  state.status = "gameover";
  state.outcome = {
    kind: "mentalBreakdown",
    title: "现实彻底失去版本号",
    subtitle: "焦虑到达 100。你已经分不清项目、催款短信和墙上的插座，本局失败。",
  };
  PushLog(state, "老板精神状态彻底失控。工作室停止开发，电脑还亮着，但已经没人能操作它。", "danger");
  return true;
}

function CheckHungerFailure(state) {
  if (state.status !== "playing" || state.hunger < 100) return false;
  state.hunger = 100;
  state.status = "gameover";
  state.outcome = {
    kind: "starvation",
    title: "人真的不能一直饿着",
    subtitle: "饥饿到达 100。电脑保住了，操作电脑的人没保住，本局失败。",
  };
  PushLog(state, "老板因长期断食倒下。事实证明，人比电脑更难用充电器续命。", "danger");
  return true;
}

function CheckStartupLoanDeadline(state) {
  const loan = state.startupLoan;
  if (state.status !== "playing" || !loan || loan.status !== "active" || state.month < loan.dueMonth) return false;
  if (loan.remaining <= 0) {
    loan.remaining = 0;
    loan.status = "repaid";
    return false;
  }
  loan.status = "defaulted";
  state.status = "gameover";
  state.outcome = {
    kind: "startupLoanDefault",
    title: "成立合同变成了清算通知",
    subtitle: `M${String(loan.dueMonth).padStart(2, "0")} 到期仍欠 ¥${Math.round(loan.remaining).toLocaleString("zh-CN")}。你押上的全部身家被处置，工作室就地倒闭。`,
  };
  PushLog(state, `创业启动贷到期未清：尚欠 ¥${Math.round(loan.remaining).toLocaleString("zh-CN")}。${state.studioName || "工作室"} 被强制清算。`, "danger");
  return true;
}

function TryAbstractBreakthrough(state) {
  if (state.status !== "playing" || state.anxiety < 42 || state.anxiety > 88) return null;
  const usedIds = new Set(state.project.abstractIdeas.map((idea) => idea.id));
  const availableIdeas = ABSTRACT_IDEAS.filter((idea) => !usedIds.has(idea.id));
  if (!availableIdeas.length) return null;
  const chance = Clamp(0.11 + (state.anxiety - 42) * 0.0055, 0.11, 0.34);
  const roll = SeededUnit(state.seed + state.month * 389 + state.project.abstractIdeas.length * 43);
  if (roll >= chance) return null;
  const ideaIndex = Math.floor(SeededUnit(state.seed + state.month * 397) * availableIdeas.length) % availableIdeas.length;
  const idea = availableIdeas[ideaIndex];
  state.project.abstractIdeas.push({ id: idea.id, title: idea.title, pitch: idea.pitch, month: state.month });
  MODULE_KEYS.forEach((moduleKey) => {
    state.project.modules[moduleKey] = Clamp(state.project.modules[moduleKey] + (idea.modules[moduleKey] || 0), 0, 100);
  });
  state.project.hype = Clamp(state.project.hype + idea.hype, 0, 100);
  state.project.scopeDebt = Clamp(state.project.scopeDebt + idea.scopeDebt, 0, 80);
  state.anxiety = Math.max(0, state.anxiety - 3);
  PushLog(state, `焦虑裂缝里蹦出抽象创意 ${idea.title}：${idea.pitch}`, "good");
  return idea;
}

function FreshProject(projectId, gameTypeId, projectName = "") {
  const templateName = FindProject(projectId)?.title?.replace(/[《》]/g, "") || "还没想好名字的游戏";
  return {
    templateId: projectId,
    gameTypeId,
    name: CleanName(projectName, templateName, 20),
    modules: { art: 12, design: 12, client: 12, performance: 12 },
    technicalDebt: 0,
    scopeDebt: 0,
    bugs: 3,
    hype: 10,
    marketingSpent: 0,
    wishlists: 0,
    expectation: 0,
    campaigns: [],
    features: [],
    featureLoad: { art: 0, design: 0, client: 0, performance: 0 },
    lastCommercial: null,
    marketStrategy: { focusId: "concept", directionId: null, setMonth: 0 },
    marketStrategyHistory: [],
    pivotCount: 0,
    pivotHistory: [],
    activeLiveEvents: [],
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
    abstractIdeas: [],
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
    ownerWorkMonth: 1,
    ownerWorkCount: 0,
    revenueGoal: 10000000000,
    gameRevenue: 0,
    cash: STARTUP_LOAN_TERMS.principal,
    studioName: "",
    startupLoan: {
      principal: STARTUP_LOAN_TERMS.principal,
      totalDue: STARTUP_LOAN_TERMS.totalDue,
      remaining: STARTUP_LOAN_TERMS.totalDue,
      dueMonth: STARTUP_LOAN_TERMS.dueMonth,
      status: "pending",
      payments: [],
    },
    arrears: 0,
    hunger: 0,
    foodPlan: "leftovers",
    anxiety: 18,
    reputation: 0,
    fans: 0,
    project: null,
    team: [],
    workstations: 0,
    equipmentSpent: 0,
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
    incomeHistory: [],
    lastSpeculationMonth: 0,
    speculationProfit: 0,
    speculationHistory: [],
  };
}

export function StartProject(currentState, projectId, gameTypeId, identity = {}) {
  const state = Clone(currentState);
  if (!FindProject(projectId) || !FindGameType(gameTypeId)) {
    return { state, ok: false, message: "立项参数不存在，像极了第一次需求会。" };
  }
  const studioName = CleanName(identity.studioName || state.studioName, "没想好工作室");
  const projectName = CleanName(identity.projectName, FindProject(projectId).title.replace(/[《》]/g, ""), 20);
  state.status = "playing";
  state.studioName = studioName;
  state.startupLoan ||= {
    principal: STARTUP_LOAN_TERMS.principal,
    totalDue: STARTUP_LOAN_TERMS.totalDue,
    remaining: STARTUP_LOAN_TERMS.totalDue,
    dueMonth: STARTUP_LOAN_TERMS.dueMonth,
    status: "pending",
    payments: [],
  };
  state.startupLoan.status = "active";
  state.project = FreshProject(projectId, gameTypeId, projectName);
  PushLog(state, `${studioName} 签下《${projectName}》开发合同：${FindProject(projectId).genre} · ${FindGameType(gameTypeId).name}。`, "good");
  PushLog(state, `创业启动贷到账 ¥${STARTUP_LOAN_TERMS.principal.toLocaleString("zh-CN")}，M${String(state.startupLoan.dueMonth).padStart(2, "0")} 前须还 ¥${state.startupLoan.remaining.toLocaleString("zh-CN")}，逾期整家公司清算。`, "danger");
  PushLog(state, "你宣布目标是游戏收入 100 亿元。所有人礼貌地没有追问依据。", "normal");
  return { state, ok: true, message: "立项成功" };
}

export function ForecastPivotCost(state) {
  if (!state?.project) return 0;
  return RoundMoney(
    52000
    + state.project.age * 12000
    + (state.project.features?.length || 0) * 5000
    + (state.project.marketingSpent || 0) * 0.35,
  );
}

export function PivotProject(currentState, newProjectId, newGameTypeId) {
  const state = Clone(currentState);
  const nextProject = FindProject(newProjectId);
  const nextGameType = FindGameType(newGameTypeId);
  if (state.status !== "playing" || !state.project) return { state, ok: false, message: "当前没有能换赛道的开发项目。" };
  if (state.project.isReleased) return { state, ok: false, message: "游戏已经上线。现在改品类叫停服重做，不在本次融资范围内。" };
  if (!nextProject || !nextGameType) return { state, ok: false, message: "目标赛道不存在，可能已经被政策先改掉了。" };
  if (state.project.templateId === newProjectId && state.project.gameTypeId === newGameTypeId) {
    return { state, ok: false, message: "这不是换赛道，只是把原计划重新念了一遍。" };
  }
  const cost = ForecastPivotCost(state);
  if (state.cash < cost) return { state, ok: false, message: `转向要烧 ${cost.toLocaleString("zh-CN")} 元，现金不够。旧代码正在幸灾乐祸。` };

  const project = state.project;
  const previous = FindProject(project.templateId);
  const previousType = FindGameType(project.gameTypeId);
  const oldModules = { ...project.modules };
  const oldWishlists = project.wishlists;
  const oldFeatures = project.features.length;
  const reasonIndex = Math.floor(SeededUnit(state.seed + state.month * 541 + project.pivotCount * 73) * PIVOT_REASONS.length) % PIVOT_REASONS.length;
  const reason = PIVOT_REASONS[reasonIndex];

  state.cash -= cost;
  state.totalCosts += cost;
  state.anxiety = Clamp(state.anxiety + 14, 0, 100);
  state.hunger = Clamp(state.hunger + 4, 0, 100);
  project.templateId = newProjectId;
  project.gameTypeId = newGameTypeId;
  project.modules = {
    art: Math.max(12, oldModules.art * 0.38),
    design: Math.max(12, oldModules.design * 0.28),
    client: Math.max(12, oldModules.client * 0.52),
    performance: Math.max(12, oldModules.performance * 0.6),
  };
  project.scopeDebt = Clamp(project.scopeDebt + 12 + oldFeatures * 2, 0, 80);
  project.technicalDebt = Clamp(project.technicalDebt + 10, 0, 80);
  project.bugs = Clamp(project.bugs + 6, 0, 80);
  project.hype = Clamp(project.hype * 0.42, 0, 100);
  project.wishlists = Math.round(project.wishlists * 0.18);
  project.expectation = Clamp(project.expectation * 0.75, 0, 60);
  project.campaigns = [];
  project.features = [];
  project.featureLoad = { art: 0, design: 0, client: 0, performance: 0 };
  project.marketStrategy = { focusId: "concept", directionId: null, setMonth: 0 };
  project.marketStrategyHistory = [];
  project.abstractIdeas = [];
  project.activeLiveEvents = [];
  project.age = 0;
  project.buildStreak = 0;
  project.buildStatus = {
    level: "broken",
    label: "转向后重新建工程",
    detail: "旧项目能复用的只有启动图标和债务。",
    score: 0,
  };
  project.pivotCount += 1;
  project.pivotHistory.push({
    month: state.month,
    fromProjectId: previous.id,
    fromGameTypeId: previousType.id,
    toProjectId: newProjectId,
    toGameTypeId: newGameTypeId,
    reason,
    cost,
    lostWishlists: oldWishlists - project.wishlists,
    discardedFeatures: oldFeatures,
  });
  project.pivotHistory = project.pivotHistory.slice(-6);
  state.selectedDirective = "integration";
  PushLog(state, `不可抗力转向：${reason}。${previous.title} / ${previousType.name} 改成 ${nextProject.title} / ${nextGameType.name}，烧掉 ¥${cost.toLocaleString("zh-CN")}。`, "danger");
  CheckHungerFailure(state);
  CheckAnxietyFailure(state);
  return {
    state,
    ok: true,
    cost,
    reason,
    lostWishlists: oldWishlists - project.wishlists,
    discardedFeatures: oldFeatures,
    message: `已被迫换赛道：${reason}`,
  };
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
  const investmentMultiplier = InvestmentPlanForMember(member)?.outputMultiplier || 1;
  if (staff.kind === "student") {
    return Clamp((0.78 + member.morale / 220 - member.stress / 250) * investmentMultiplier, 0.38, 1.48);
  }
  return Clamp((1.08 - member.drift / 145) * investmentMultiplier, 0.38, 1.9);
}

function BuildMonthlyOutput(state, foodMultiplier = 1, foodPlanName = "本月吃法") {
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
      const driftMultiplier = InvestmentPlanForMember(member)?.driftMultiplier || 1;
      const driftIncrease = (5 + SeededUnit(state.seed + state.month * 47 + memberIndex) * 8) * driftMultiplier;
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
  MODULE_KEYS.forEach((moduleKey) => {
    const before = output[moduleKey];
    output[moduleKey] *= foodMultiplier;
    if (foodMultiplier < 1) wastedOutput[moduleKey] += Math.max(0, before - output[moduleKey]);
  });
  if (foodMultiplier < 0.9) painEvents.push(`${foodPlanName}让老板眼前发黑，四组产出一起缩水。`);
  if (state.hunger > 65) {
    MODULE_KEYS.forEach((moduleKey) => {
      const before = output[moduleKey];
      output[moduleKey] *= state.hunger > 86 ? 0.67 : 0.86;
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

function ProgressProject(state, foodMultiplier = 1, foodPlanName = "本月吃法") {
  const project = state.project;
  const production = BuildMonthlyOutput(state, foodMultiplier, foodPlanName);
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
    .filter((member) => FindStaff(member.id)?.kind === "student")
    .reduce((total, member) => total + GetMemberMonthlyCost(member), 0);
  const aiRent = state.team
    .filter((member) => FindStaff(member.id)?.kind === "ai")
    .reduce((total, member) => total + GetMemberMonthlyCost(member), 0);
  const food = FindFoodPlan(state.foodPlan)?.monthlyCost || 0;
  const living = LIVING_BILLS.reduce((total, bill) => total + bill.amount, 0)
    + (state.assets.home === "seized" ? 2200 : 0)
    + (state.assets.car === "seized" ? 600 : 0);
  const loanPayments = state.loans
    .filter((loan) => loan.status === "active")
    .reduce((total, loan) => total + loan.monthlyPayment, 0);
  const gameType = state.project ? FindGameType(state.project.gameTypeId) : null;
  const service = state.project?.isReleased ? (gameType?.monthlyServiceCost || 0) : 0;
  const arrearsDue = state.arrears > 0 ? RoundMoney(state.arrears * 1.08) : 0;
  return {
    studentWages,
    aiRent,
    living,
    food,
    loanPayments,
    service,
    arrearsDue,
    total: studentWages + aiRent + living + food + loanPayments + service + arrearsDue,
  };
}

function BaseLiveIncome(state) {
  if (!state.project?.isReleased) return 0;
  const gameType = FindGameType(state.project.gameTypeId);
  const decay = Math.pow(gameType.liveDecay, state.project.monthsSinceUpdate);
  return RoundMoney(state.project.monthlyRevenue * decay);
}

function ResolveLiveIncome(state) {
  if (!state.project?.isReleased) {
    return {
      income: 0,
      baseIncome: 0,
      marketBaseIncome: 0,
      marketDelta: 0,
      eventLoss: 0,
      eventMultiplier: 1,
      liveEvent: null,
      appliedEvents: [],
      marketFit: EvaluateMarketFit(state),
    };
  }
  const project = state.project;
  project.activeLiveEvents ||= [];
  let liveEvent = null;
  const eventRoll = SeededUnit(state.seed + state.month * 613 + project.version * 47 + project.releaseHistory.length * 23);
  if (eventRoll < 0.28 && project.activeLiveEvents.length < 2) {
    const available = LIVE_REVENUE_EVENTS.filter((event) => !project.activeLiveEvents.some((active) => active.id === event.id));
    if (available.length) {
      const eventIndex = Math.floor(SeededUnit(state.seed + state.month * 619 + project.pivotCount * 31) * available.length) % available.length;
      liveEvent = available[eventIndex];
      project.activeLiveEvents.push({ id: liveEvent.id, remaining: liveEvent.duration });
      state.anxiety = Clamp(state.anxiety + liveEvent.anxiety, 0, 100);
      PushLog(state, `${liveEvent.title}：${liveEvent.description} 本月流水遭到打击。`, "danger");
    }
  }
  const appliedEvents = project.activeLiveEvents.map((active) => {
    const event = LIVE_REVENUE_EVENTS.find((candidate) => candidate.id === active.id);
    return event ? { ...event, remaining: active.remaining } : null;
  }).filter(Boolean);
  const eventMultiplier = Clamp(appliedEvents.reduce((value, event) => value * event.multiplier, 1), 0.16, 1);
  const marketFit = EvaluateMarketFit(state);
  const marketBaseIncome = BaseLiveIncome(state);
  const baseIncome = RoundMoney(marketBaseIncome * (marketFit?.revenueMultiplier || 1));
  const marketDelta = baseIncome - marketBaseIncome;
  const income = RoundMoney(baseIncome * eventMultiplier);
  const eventLoss = Math.max(0, baseIncome - income);
  if (marketFit?.backlash) {
    const lostFans = Math.max(20, Math.round(state.fans * (1 - marketFit.fanMultiplier) * 0.08));
    state.fans = Math.max(0, state.fans - lostFans);
    state.reputation = Clamp(state.reputation + marketFit.reputationDelta * 0.35, 0, 100);
    state.anxiety = Clamp(state.anxiety + (marketFit.tier === "taboo" ? 5 : 3), 0, 100);
    PushLog(state, marketFit.label + "：" + marketFit.description + " 本月常态流水被市场反噬。", "danger");
  } else if (marketFit?.perfect) {
    state.reputation = Clamp(state.reputation + 1, 0, 100);
    PushLog(state, marketFit.label + "：本月常态流水乘数 ×" + marketFit.revenueMultiplier.toFixed(2) + "。", "good");
  }
  project.activeLiveEvents.forEach((active) => { active.remaining -= 1; });
  project.activeLiveEvents = project.activeLiveEvents.filter((active) => active.remaining > 0);
  state.incomeHistory.push({
    month: state.month,
    source: "live",
    baseIncome,
    marketBaseIncome,
    marketDelta,
    marketTier: marketFit?.tier || "independent",
    income,
    eventLoss,
    eventMultiplier,
    events: [
      ...(marketFit?.backlash ? [marketFit.label] : marketFit?.perfect ? [marketFit.label] : []),
      ...appliedEvents.map((event) => event.title),
    ],
  });
  state.incomeHistory = state.incomeHistory.slice(-36);
  return {
    income,
    baseIncome,
    marketBaseIncome,
    marketDelta,
    eventLoss,
    eventMultiplier,
    liveEvent,
    appliedEvents,
    marketFit,
  };
}

function RemoveUnpayableTeam(state, availableBudget, baseCosts) {
  const removed = [];
  const ordered = [...state.team].sort((memberA, memberB) => {
    const staffA = FindStaff(memberA.id);
    const staffB = FindStaff(memberB.id);
    if (staffA.kind !== staffB.kind) return staffA.kind === "ai" ? -1 : 1;
    return GetMemberMonthlyCost(memberB) - GetMemberMonthlyCost(memberA);
  });
  let teamCost = state.team.reduce((total, member) => total + GetMemberMonthlyCost(member), 0);
  for (const member of ordered) {
    if (baseCosts + teamCost <= availableBudget) break;
    const staff = FindStaff(member.id);
    teamCost -= GetMemberMonthlyCost(member);
    state.team = state.team.filter((candidate) => candidate.id !== member.id);
    removed.push(staff);
  }
  return removed;
}

function ProcessFinances(state) {
  const liveRevenue = ResolveLiveIncome(state);
  const income = liveRevenue.income;
  state.cash += income;
  state.totalRevenue += income;
  state.gameRevenue += income;
  const priorArrears = state.arrears || 0;
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

  const selectedFoodPlan = FindFoodPlan(state.foodPlan) || FOOD_PLANS[1];
  let effectiveFoodPlan = selectedFoodPlan;
  let skippedFood = selectedFoodPlan.id === "skip";
  if (costs.total > state.cash && costs.food > 0) {
    skippedFood = true;
    costs.total -= costs.food;
    costs.food = 0;
    effectiveFoodPlan = FindFoodPlan("skip");
    PushLog(state, "本月连充饥钱也没付出来：人先饿着，电脑继续通电。", "warning");
  }
  state.hunger = Clamp(state.hunger + effectiveFoodPlan.hungerDelta, 0, 100);
  state.anxiety = Clamp(state.anxiety + effectiveFoodPlan.anxietyDelta, 0, 100);
  if (effectiveFoodPlan.id === "feast") PushLog(state, "老板吃了一顿大餐，短暂想起身体也是生产资料。", "good");
  else if (effectiveFoodPlan.id === "skip") PushLog(state, `老板硬扛不吃：饥饿 +${effectiveFoodPlan.hungerDelta}，开始把鼠标垫看成烤紫菜。`, "warning");

  let shortfall = 0;
  if (costs.total > state.cash) {
    shortfall = costs.total - state.cash;
    state.arrears = shortfall;
    state.cash = 0;
    state.reputation = Math.max(0, state.reputation - 2);
    PushLog(state, `仍有 ¥${Math.round(shortfall).toLocaleString("zh-CN")} 欠款滚入下月，并按月加收 8% 滞纳。房东开始用句号发消息。`, "danger");
  } else {
    state.cash -= costs.total;
    state.arrears = 0;
    if (priorArrears > 0) PushLog(state, "历史欠款和滞纳金终于结清。房东恢复使用感叹号。", "good");
  }
  state.totalCosts += Math.max(0, costs.total - priorArrears);

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

  const startupDefault = CheckStartupLoanDeadline(state);
  CheckHungerFailure(state);
  CheckAnxietyFailure(state);
  CheckRevenueGoal(state);

  return {
    income,
    baseIncome: liveRevenue.baseIncome,
    marketBaseIncome: liveRevenue.marketBaseIncome,
    marketDelta: liveRevenue.marketDelta,
    marketFit: liveRevenue.marketFit,
    eventLoss: liveRevenue.eventLoss,
    eventMultiplier: liveRevenue.eventMultiplier,
    liveEvent: liveRevenue.liveEvent,
    appliedEvents: liveRevenue.appliedEvents,
    costs,
    defaults,
    removedStaff,
    startupDefault,
    skippedFood,
    shortfall,
    selectedFoodPlanId: selectedFoodPlan.id,
    effectiveFoodPlanId: effectiveFoodPlan.id,
    foodMultiplier: effectiveFoodPlan.outputMultiplier,
  };
}

function ResolveMonthlyAnxiety(state, production, finance, tensions) {
  const before = state.anxiety;
  if (state.status !== "playing") return { before, after: before, delta: 0, idea: null };
  let delta = production.wastedTotal * 0.32;
  if (production.buildStatus.level === "broken") delta += 9;
  else if (production.buildStatus.level === "fragile") delta += 4;
  else if (production.buildStatus.level === "stable") delta -= 4;
  delta += tensions.filter((tension) => tension.severity === "critical").length * 3;
  delta += tensions.filter((tension) => tension.severity === "warning").length * 1.2;
  delta += finance.defaults.length * 10;
  delta += finance.removedStaff.length * 6;
  delta += finance.shortfall > 0 ? 12 : 0;
  delta += finance.skippedFood ? 4 : 0;
  if (state.cash < finance.costs.total) delta += 3;
  if (state.selectedDirective === "integration") delta -= 3;
  if (state.selectedDirective === "cutScope") delta -= 2;
  if (state.project.isReleased && finance.income > finance.costs.total) delta -= 4;
  delta = Clamp(delta, -9, 28);
  state.anxiety = Clamp(state.anxiety + delta, 0, 100);
  const idea = TryAbstractBreakthrough(state);
  CheckAnxietyFailure(state);
  const after = state.anxiety;
  if (Math.abs(after - before) >= 5) {
    PushLog(state, `老板焦虑 ${after > before ? "+" : ""}${Math.round(after - before)}，当前 ${Math.round(after)} / 100：${GetAnxietyState(after).label}。`, after > before ? "warning" : "good");
  }
  return { before, after, delta: after - before, idea };
}

function EvaluateFeatureDelivery(project) {
  let bonus = 0;
  let penalty = 0;
  const details = (project.features || []).map((record) => {
    const feature = FindFeatureChoice(record.id);
    if (!feature) return null;
    const delivery = Average(MODULE_KEYS.map((moduleKey) => {
      const demand = feature.modules[moduleKey] || 0;
      const target = 34 + demand * 5.1;
      return Clamp(project.modules[moduleKey] / Math.max(1, target), 0, 1);
    }));
    const sourceQuality = Clamp(record.sourceQuality ?? 0.75, 0.45, 1.05);
    const effectiveDelivery = delivery * (0.64 + sourceQuality * 0.36);
    bonus += feature.qualityPotential * effectiveDelivery;
    penalty += feature.qualityPotential * Math.max(0, 1 - effectiveDelivery) * 1.7;
    return { id: feature.id, title: feature.title, delivery: effectiveDelivery, sourceLabel: record.sourceLabel };
  }).filter(Boolean);
  const totalLoad = Object.values(project.featureLoad || {}).reduce((total, value) => total + value, 0);
  penalty += Math.max(0, totalLoad - 62) * 0.006;
  return { bonus: Math.min(1.15, bonus), penalty: Math.min(1.45, penalty), details };
}

function InvestmentQualityBonus(state) {
  const total = state.team.reduce((sum, member) => {
    const plan = InvestmentPlanForMember(member);
    const staff = FindStaff(member.id);
    if (!plan || !staff) return sum;
    const condition = staff.kind === "ai"
      ? Clamp(1 - member.drift / 180, 0.45, 1)
      : Clamp(0.72 + member.morale / 360 - member.stress / 500, 0.45, 1);
    return sum + plan.qualityBonus * condition;
  }, 0);
  return Math.min(1.05, total);
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
  const abstractBonus = Math.min(0.72, (project.abstractIdeas?.length || 0) * 0.22);
  const featureDelivery = EvaluateFeatureDelivery(project);
  const investmentBonus = InvestmentQualityBonus(state);
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
  penalty += featureDelivery.penalty;
  const noise = (SeededUnit(state.seed + state.month * 97 + project.version * 13) - 0.5) * 0.18;
  const rating = Clamp(base + balanceBonus + abstractBonus + featureDelivery.bonus + investmentBonus - penalty + noise, 1, 9.8);
  return {
    rating: Math.round(rating * 10) / 10,
    rawRating: rating,
    base,
    balanceBonus,
    abstractBonus,
    featureBonus: featureDelivery.bonus,
    featurePenalty: featureDelivery.penalty,
    featureDetails: featureDelivery.details,
    investmentBonus,
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

function ResolveCommercialOutcome(state, rating, isUpdate, baseRevenue, marketFit) {
  const marketMultiplier = marketFit?.revenueMultiplier || 1;
  const marketRefundDelta = marketFit?.refundRateDelta || 0;
  if (isUpdate) {
    const marketBaseRevenue = baseRevenue;
    const grossRevenue = RoundMoney(marketBaseRevenue * marketMultiplier);
    const refundRate = marketFit?.backlash ? Clamp(0.06 + marketRefundDelta, 0.08, 0.72) : 0;
    const refunds = RoundMoney(grossRevenue * refundRate);
    return {
      marketBaseRevenue,
      marketMultiplier,
      grossRevenue,
      refunds,
      refundRate,
      netRevenue: Math.max(0, grossRevenue - refunds),
      backlash: Boolean(marketFit?.backlash),
      marketBacklash: Boolean(marketFit?.backlash),
      delivered: rating >= 7.6,
      promisedRating: state.project.lastCommercial?.promisedRating || 0,
      expectationGap: 0,
      wishlistSales: 0,
      marketLabel: marketFit?.label || "",
    };
  }
  const gameType = FindGameType(state.project.gameTypeId);
  const saleValue = gameType.id === "premium" ? 88 : gameType.id === "online" ? 62 : 46;
  const purchaseRate = Clamp(0.06 + rating * 0.045, 0.08, 0.48);
  const wishlistSales = Math.round(state.project.wishlists * purchaseRate);
  const wishlistGross = wishlistSales * saleValue;
  const marketBaseRevenue = RoundMoney(baseRevenue + wishlistGross);
  const grossRevenue = RoundMoney(marketBaseRevenue * marketMultiplier);
  const marketingPressure = Clamp(state.project.expectation / 45, 0, 1.35);
  const promisedRating = state.project.expectation > 0 ? 4.6 + state.project.expectation * 0.087 : 0;
  const expectationGap = promisedRating > 0 ? promisedRating - rating : 0;
  const qualityRefund = rating < 2.5 ? 0.48
    : rating < 3.5 ? 0.34
      : rating < 4.5 ? 0.22
        : rating < 5.5 ? 0.12
          : rating < 6.5 ? 0.06
            : 0.025;
  const expectationRefund = Math.max(0, expectationGap) * (0.045 + marketingPressure * 0.08);
  const refundRate = Clamp(qualityRefund + expectationRefund + marketRefundDelta, 0.02, 0.96);
  const refunds = RoundMoney(grossRevenue * refundRate);
  const netRevenue = Math.max(0, grossRevenue - refunds);
  const marketingBacklash = state.project.marketingSpent > 0 && (refundRate >= 0.24 || expectationGap >= 1.25);
  const marketBacklash = Boolean(marketFit?.backlash);
  const backlash = marketingBacklash || marketBacklash;
  const delivered = state.project.marketingSpent > 0 && rating >= promisedRating - 0.35 && !marketBacklash;
  return {
    marketBaseRevenue,
    marketMultiplier,
    grossRevenue,
    refunds,
    refundRate,
    netRevenue,
    backlash,
    marketBacklash,
    delivered,
    promisedRating,
    expectationGap,
    wishlistSales,
    marketLabel: marketFit?.label || "",
  };
}

function MonthlyRevenueForRating(state, rating) {
  const gameType = FindGameType(state.project.gameTypeId);
  const appeal = Math.max(0.15, rating - 3.7);
  const base = appeal * appeal * (gameType.id === "premium" ? 1150 : gameType.id === "online" ? 2350 : 2050);
  return RoundMoney((base * gameType.revenueMultiplier + state.fans * 0.08) * state.project.marketScale);
}

function ResolveReleaseAnxiety(state, rating, isUpdate, oldRating, commercial) {
  const before = state.anxiety;
  let delta = rating < 3.5 ? 24
    : rating < 4.8 ? 16
      : rating < 6 ? 9
        : rating < 7 ? 3
          : rating >= 8.4 ? -13
            : rating >= 7.6 ? -7
              : -2;
  if (isUpdate && oldRating != null && rating < oldRating) delta += 4;
  if (commercial?.backlash) delta += Math.round(6 + commercial.refundRate * 18);
  else if (commercial?.delivered) delta -= 4;
  state.anxiety = Clamp(state.anxiety + delta, 0, 100);
  if (commercial?.marketBacklash) PushLog(state, `市场时机踩空，玩家退款率 ${Math.round(commercial.refundRate * 100)}%，评论区开团，老板焦虑 +${delta}。`, "danger");
  else if (commercial?.backlash) PushLog(state, `宣发吹得太响，玩家退款率 ${Math.round(commercial.refundRate * 100)}%，老板焦虑 +${delta}。`, "danger");
  else if (delta >= 8) PushLog(state, `玩家把烂版本骂上热评，老板焦虑 +${delta}。`, "danger");
  else if (delta < 0) PushLog(state, `版本口碑让老板短暂相信自己，焦虑 ${delta}。`, "good");
  CheckAnxietyFailure(state);
  return { before, after: state.anxiety, delta: state.anxiety - before };
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
  if (state.project.age < 2) return { state, ok: false, message: "至少做满两个月再上线，不然商店截图只能放你家客厅。" };
  if (state.project.lastReleaseMonth === state.month) return { state, ok: false, message: "这个月已经发过版本。给玩家一点下载补丁的时间。" };

  const evaluation = EvaluateProject(state);
  const isUpdate = state.project.isReleased;
  const marketFit = EvaluateMarketFit(state);
  const baseRevenue = RevenueForRating(state, evaluation.rating, isUpdate);
  const commercial = ResolveCommercialOutcome(state, evaluation.rating, isUpdate, baseRevenue, marketFit);
  const revenue = commercial.netRevenue;
  const oldRating = state.project.lastRating;
  state.project.isReleased = true;
  state.project.version += 1;
  state.project.lastRating = evaluation.rating;
  state.project.bestRating = Math.max(state.project.bestRating || 0, evaluation.rating);
  const ratingDelta = oldRating == null ? 0 : evaluation.rating - oldRating;
  const earnedFans = Math.max(0, evaluation.rating - 4) * (isUpdate ? 310 : 820) * (marketFit?.fanMultiplier || 1);
  const marketBacklashFans = marketFit?.backlash
    ? Math.round(350 + state.fans * (1 - marketFit.fanMultiplier) * 0.18 + commercial.grossRevenue / 900)
    : 0;
  const backlashFans = commercial.backlash
    ? Math.round(state.project.wishlists * commercial.refundRate * 0.22) + marketBacklashFans
    : 0;
  state.fans = Math.max(0, Math.round(state.fans + earnedFans - backlashFans));
  const backlashMarketPenalty = commercial.backlash
    ? Clamp(1 - commercial.refundRate * 0.8 - Math.max(0, commercial.expectationGap) * 0.06, 0.35, 1)
    : 1;
  const launchMarketScale = (1 + Math.min(3.2, state.project.wishlists / 25000)
    * Clamp((evaluation.rating - 2.5) / 6.5, 0.05, 1))
    * backlashMarketPenalty
    * (marketFit?.perfect ? 1.16 : 1);
  state.project.marketScale = isUpdate
    ? Clamp(
      state.project.marketScale
        * MarketGrowthForRating(evaluation.rating, ratingDelta)
        * backlashMarketPenalty
        * (marketFit?.perfect ? 1.08 : 1),
      0.5,
      100000000,
    )
    : Clamp(launchMarketScale, 0.5, 4.2);
  state.project.monthlyRevenue = MonthlyRevenueForRating(state, evaluation.rating)
    * (commercial.backlash ? Clamp(1 - commercial.refundRate * 0.72, 0.32, 1) : 1);
  state.project.monthlyRevenue = RoundMoney(state.project.monthlyRevenue);
  state.project.monthsSinceUpdate = 0;
  state.project.lastReleaseMonth = state.month;
  state.project.lastCommercial = commercial;
  state.project.releaseHistory.push({
    month: state.month,
    version: state.project.version,
    rating: evaluation.rating,
    revenue,
    grossRevenue: commercial.grossRevenue,
    marketBaseRevenue: commercial.marketBaseRevenue,
    marketMultiplier: commercial.marketMultiplier,
    marketTier: marketFit?.tier || "independent",
    refunds: commercial.refunds,
    refundRate: commercial.refundRate,
  });
  state.cash += revenue;
  state.totalRevenue += revenue;
  state.gameRevenue += revenue;
  state.incomeHistory.push({
    month: state.month,
    source: isUpdate ? "update" : "launch",
    baseIncome: commercial.grossRevenue,
    marketBaseIncome: commercial.marketBaseRevenue,
    marketDelta: commercial.grossRevenue - commercial.marketBaseRevenue,
    marketTier: marketFit?.tier || "independent",
    income: revenue,
    refunds: commercial.refunds,
    eventLoss: 0,
    events: [
      ...(marketFit?.perfect || marketFit?.backlash ? [marketFit.label] : []),
      ...(commercial.backlash ? ["集中退款与口碑反噬"] : []),
    ],
  });
  state.incomeHistory = state.incomeHistory.slice(-36);
  state.bestRating = Math.max(state.bestRating || 0, evaluation.rating);
  const backlashReputation = commercial.backlash ? 5 + commercial.refundRate * 16 + Math.max(0, commercial.expectationGap) * 1.8 : 0;
  state.reputation = Clamp(
    state.reputation + (evaluation.rating - 5) * 1.4 - backlashReputation + (marketFit?.reputationDelta || 0),
    0,
    100,
  );
  const anxiety = ResolveReleaseAnxiety(state, evaluation.rating, isUpdate, oldRating, commercial);

  const review = PickReview(evaluation.rating, state.seed + state.month * 113 + state.project.version);
  const verb = isUpdate ? `v${state.project.version}.0 更新` : "首发上线";
  const refundText = commercial.refunds > 0 ? `，退款 ¥${commercial.refunds.toLocaleString("zh-CN")}` : "";
  PushLog(state, `《${state.project.name}》${verb}：${evaluation.rating.toFixed(1)} 分，净到账 ¥${revenue.toLocaleString("zh-CN")}${refundText}。${review}`, commercial.backlash ? "danger" : evaluation.rating >= 6.7 ? "good" : "warning");
  CheckRevenueGoal(state);
  return {
    state,
    ok: true,
    isUpdate,
    evaluation,
    revenue,
    commercial,
    marketFit,
    oldRating,
    anxiety,
    review,
    message: isUpdate ? "版本更新已发布" : "游戏已上线",
  };
}

export function AdvanceMonth(currentState) {
  const state = Clone(currentState);
  if (state.status !== "playing" || !state.project) return { state, ok: false, message: "当前不能推进月份。" };
  const finance = ProcessFinances(state);
  const production = state.status === "playing"
    ? ProgressProject(
      state,
      finance.foodMultiplier,
      FindFoodPlan(finance.effectiveFoodPlanId)?.name || "硬扛不吃",
    )
    : {
      output: Object.fromEntries(MODULE_KEYS.map((moduleKey) => [moduleKey, 0])),
      wastedOutput: Object.fromEntries(MODULE_KEYS.map((moduleKey) => [moduleKey, 0])),
      wastedTotal: 0,
      painEvents: ["这个月没有产出：老板先倒下了。"],
      buildStatus: state.project.buildStatus,
    };
  const output = production.output;
  const tensions = CalculateTensions(state.project);
  const anxiety = ResolveMonthlyAnxiety(state, production, finance, tensions);
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
    anxiety,
    directiveId: state.selectedDirective,
  };
  state.talkPoints = 2;
  state.selectedDirective = "integration";
  if (state.status === "playing") {
    const previousHairStage = GetOwnerHairStage(state.month);
    state.month += 1;
    state.ownerWorkMonth = state.month;
    state.ownerWorkCount = 0;
    const currentHairStage = GetOwnerHairStage(state.month);
    if (currentHairStage !== previousHairStage) {
      PushLog(
        state,
        currentHairStage === OWNER_HAIR_STAGES.thinning
          ? "连续做游戏满一年，老板的发际线正式进入抢先体验。"
          : "又做了半年，老板彻底秃了；游戏还在继续长头发。",
        "warning",
      );
    }
  }
  return {
    state,
    ok: true,
    output,
    wastedOutput: production.wastedOutput,
    wastedTotal: production.wastedTotal,
    painEvents: production.painEvents,
    buildStatus: production.buildStatus,
    anxiety,
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
  if (state.team.length >= WORKSTATION_COSTS.length) return { state, ok: false, message: "家里已经塞满四张额外工位。再来一个人只能坐冰箱。" };
  if (state.team.length >= (state.workstations || 0)) {
    return { state, ok: false, message: state.workstations > 0 ? "没有空工位。先去人才市场设备柜台再买一套电脑桌椅。" : "家里只有老板自己的电脑。第一次招聘前，先在人才市场买第一套工位。" };
  }
  state.team.push({ id: staffId, morale: 70, stress: 18, drift: 12, boost: 0, months: 0, investmentLevel: 0 });
  PushLog(
    state,
    staff.kind === "ai"
      ? `租用 ${staff.name}，每月 ¥${staff.monthlyCost.toLocaleString("zh-CN")}，取消订阅时不保证代码还能看懂。`
      : `雇用 ${staff.name}，月薪 ¥${staff.monthlyCost.toLocaleString("zh-CN")}。对方礼貌地接受了创业风险。`,
    "good",
  );
  return { state, ok: true, message: staff.kind === "ai" ? "AI 已开始计费" : "大学生已入职" };
}

export function PurchaseWorkstation(currentState) {
  const state = Clone(currentState);
  if (state.status !== "playing") return { state, ok: false, message: "公司还没成立，设备发票暂时没有抬头。" };
  const currentCount = Math.max(0, Math.floor(state.workstations || 0));
  if (currentCount >= WORKSTATION_COSTS.length) return { state, ok: false, message: "四套额外工位已经把家塞满了。" };
  const cost = WORKSTATION_COSTS[currentCount];
  if (state.cash < cost) return { state, ok: false, message: `第 ${currentCount + 1} 套工位要 ¥${cost.toLocaleString("zh-CN")}，现金不够。` };
  state.cash -= cost;
  state.totalCosts += cost;
  state.workstations = currentCount + 1;
  state.equipmentSpent = (state.equipmentSpent || 0) + cost;
  state.anxiety = Clamp(state.anxiety + 1, 0, 100);
  PushLog(state, `购入第 ${state.workstations} 套员工工位：电脑、显示器、桌椅共 ¥${cost.toLocaleString("zh-CN")}。家又小了一点。`, "warning");
  return { state, ok: true, cost, workstations: state.workstations, message: `第 ${state.workstations} 套工位已搬回家` };
}

export function FireStaff(currentState, staffId) {
  const state = Clone(currentState);
  const staff = FindStaff(staffId);
  if (!staff || !state.team.some((member) => member.id === staffId)) return { state, ok: false, message: "对方并不在团队里。" };
  state.team = state.team.filter((member) => member.id !== staffId);
  PushLog(state, staff.kind === "ai" ? `已取消 ${staff.name} 的月租。它最后生成了一张续费二维码。` : `${staff.name} 离开了团队，并带走了自己写得最好的那段代码。`, "warning");
  return { state, ok: true, message: staff.kind === "ai" ? "订阅已取消" : "员工已离职" };
}

export function SetStaffInvestmentLevel(currentState, staffId, requestedLevel) {
  const state = Clone(currentState);
  const member = state.team.find((candidate) => candidate.id === staffId);
  const staff = member ? FindStaff(member.id) : null;
  if (state.status !== "playing" || !member || !staff) return { state, ok: false, message: "这位成员不在团队里，无法调整待遇。" };
  const level = Number(requestedLevel);
  const levels = staff.kind === "ai" ? AI_SUBSCRIPTION_LEVELS : STUDENT_PAY_LEVELS;
  const plan = levels.find((candidate) => candidate.level === level);
  if (!plan) return { state, ok: false, message: "这个投入档位不存在。" };
  const oldLevel = member.investmentLevel || 0;
  if (oldLevel === level) return { state, ok: false, message: "当前已经是这个档位。" };
  const increasing = level > oldLevel;
  member.investmentLevel = level;
  if (staff.kind === "student") {
    member.morale = Clamp(member.morale + (increasing ? 8 + (level - oldLevel) * 3 : -13), 0, 100);
    member.stress = Clamp(member.stress + (increasing ? -6 : 9), 0, 100);
    state.anxiety = Clamp(state.anxiety + (increasing ? 1 : 3), 0, 100);
    PushLog(state, `${staff.name} 的工资调整为「${plan.name}」：${increasing ? "开始认真考虑把项目写进简历" : "已把招聘软件重新装回手机"}。`, increasing ? "good" : "warning");
  } else {
    member.drift = Clamp(member.drift + (increasing ? -10 : 13), 0, 100);
    state.anxiety = Clamp(state.anxiety + (increasing ? 2 : 4), 0, 100);
    PushLog(state, `${staff.name} 切换到「${plan.name}」：月租 ${increasing ? "上涨，幻觉密度下降" : "下降，上下文开始省电"}。`, increasing ? "good" : "warning");
  }
  CheckAnxietyFailure(state);
  return {
    state,
    ok: true,
    plan,
    monthlyCost: GetMemberMonthlyCost(member),
    message: staff.kind === "ai" ? `AI 已切换到 ${plan.name}` : `${staff.name} 的工资档位已调整`,
  };
}

export function SetMarketStrategy(currentState, requestedFocusId, requestedDirectionId) {
  const state = Clone(currentState);
  if (state.status !== "playing" || !state.project) return { state, ok: false, message: "现在没有项目可供市场部糟蹋。" };
  const previousStrategy = state.project.marketStrategy || { focusId: "concept", directionId: null, setMonth: 0 };
  if (previousStrategy.setMonth === state.month) {
    return { state, ok: false, message: "本月市场口径已经发出去了。再改就会同时留下两套互相打脸的截图。" };
  }
  if (state.talkPoints <= 0) return { state, ok: false, message: "本月有效拍板次数用完了。市场部的消息只能先标成未读。" };
  const focusId = requestedFocusId || "concept";
  const focus = MarketFocusFor(state, focusId);
  if (!focus) return { state, ok: false, message: "这个主打特色还没做进游戏，不能先把它写进热搜。" };
  const directionId = requestedDirectionId === MARKET_INDEPENDENT_ID ? null : requestedDirectionId;
  if (directionId && !FindMarketDirection(directionId)) return { state, ok: false, message: "这个迎合方向不存在，可能是市场部刚编的词。" };

  const switchedDirection = Boolean(previousStrategy.directionId && previousStrategy.directionId !== directionId);
  state.talkPoints -= 1;
  state.project.marketStrategy = {
    focusId: focus.id,
    directionId,
    setMonth: state.month,
  };
  state.project.marketStrategyHistory ||= [];
  state.project.marketStrategyHistory.push({
    month: state.month,
    focusId: focus.id,
    directionId,
  });
  state.project.marketStrategyHistory = state.project.marketStrategyHistory.slice(-24);
  if (directionId) {
    state.project.hype = Clamp(state.project.hype + 3, 0, 100);
    state.project.scopeDebt = Clamp(state.project.scopeDebt + (switchedDirection ? 2 : 1), 0, 80);
  }
  const marketFit = EvaluateMarketFit(state);
  const directionName = marketFit.direction?.name || "不主动追风";
  PushLog(
    state,
    "手机市场口径拍板：主打「" + focus.title + "」，方向「" + directionName + "」。预判：" + marketFit.label + "。",
    marketFit.backlash ? "warning" : marketFit.perfect ? "good" : "normal",
  );
  return {
    state,
    ok: true,
    marketFit,
    message: marketFit.perfect ? "本月特色与风口正好对上" : marketFit.backlash ? "口径已发出，但评论区可能开团" : "本月市场口径已锁定",
  };
}

export function SelectDirective(currentState, directiveId) {
  const state = Clone(currentState);
  const directive = FindDirective(directiveId);
  if (!directive) return { state, ok: false, message: "策略不存在。" };
  state.selectedDirective = directiveId;
  return { state, ok: true, message: `本月策略：${directive.name}` };
}

export function SelectFoodPlan(currentState, foodPlanId) {
  const state = Clone(currentState);
  const foodPlan = FindFoodPlan(foodPlanId);
  if (!foodPlan) return { state, ok: false, message: "这份饭不存在，可能已被实习生吃了。" };
  state.foodPlan = foodPlanId;
  return { state, ok: true, message: `本月吃法：${foodPlan.name}` };
}

export function Speculate(currentState, optionId) {
  const state = Clone(currentState);
  const option = SPECULATION_OPTIONS.find((candidate) => candidate.id === optionId);
  if (state.status !== "playing") return { state, ok: false, message: "本局已经结束，券商拒绝为精神状态开户。" };
  if (!option) return { state, ok: false, message: "这项投机不存在，已经算今天最好的财务消息。" };
  if (state.lastSpeculationMonth === state.month) return { state, ok: false, message: "本月已经赌过一次。先把手从刷新按钮上拿开。" };
  const stake = option.stakeMode === "allIn" ? state.cash : option.stake;
  if (stake <= 0 || state.cash < stake) return { state, ok: false, message: `连 ${option.name} 的本金都没有，暂时保住了破产资格。` };

  const roll = SeededUnit(state.seed + state.month * 733 + option.id.length * 97 + state.speculationHistory.length * 31);
  const outcome = option.outcomes.find((candidate) => roll < candidate.ceiling) || option.outcomes.at(-1);
  const payout = RoundMoney(stake * outcome.payoutMultiplier);
  const profit = payout - stake;
  state.cash = Math.max(0, state.cash - stake + payout);
  state.totalCosts += stake;
  state.speculationProfit += profit;
  state.lastSpeculationMonth = state.month;
  state.speculationHistory.push({ month: state.month, optionId, stake, payout, profit, label: outcome.label });
  state.speculationHistory = state.speculationHistory.slice(-12);

  if (option.stakeMode === "allIn" && payout === 0) {
    state.status = "gameover";
    state.outcome = {
      kind: "speculationBankruptcy",
      title: "妖股替你发布了最终版本",
      subtitle: "全仓归零，创业现金当场清空。它没有算作游戏收入，甚至没有留下崩溃日志。",
    };
    PushLog(state, `${option.name}：${outcome.label}。现金归零，工作室直接破产。`, "danger");
  } else {
    state.anxiety = Clamp(state.anxiety + outcome.anxiety, 0, 100);
    PushLog(state, `${option.name}：${outcome.label}，${profit >= 0 ? "赚" : "亏"} ¥${Math.abs(profit).toLocaleString("zh-CN")}。投机收益不算游戏收入。`, profit > 0 ? "good" : "danger");
    CheckAnxietyFailure(state);
  }
  return {
    state,
    ok: true,
    option,
    outcome,
    stake,
    payout,
    profit,
    message: `${option.name}：${outcome.label}`,
  };
}

export function BuyMarketingCampaign(currentState, campaignId) {
  const state = Clone(currentState);
  const campaign = FindMarketingCampaign(campaignId);
  if (state.status !== "playing" || !state.project) return { state, ok: false, message: "没有正在开发的项目可以宣发。" };
  if (!campaign) return { state, ok: false, message: "宣发方案不存在，钱暂时保住了。" };
  if (state.project.isReleased) return { state, ok: false, message: "首发宣发窗口已经关了。现在只能靠更新赎罪。" };
  if (state.project.campaigns.includes(campaign.id)) return { state, ok: false, message: "这套广告已经买过一次，再投只会让同一批人拉黑你。" };
  if (state.cash < campaign.cost) return { state, ok: false, message: `现金不够。还差 ¥${Math.ceil(campaign.cost - state.cash).toLocaleString("zh-CN")}，可以先去抵押点什么。` };
  state.cash -= campaign.cost;
  state.totalCosts += campaign.cost;
  state.project.marketingSpent += campaign.cost;
  state.project.wishlists += campaign.wishlists;
  state.project.expectation = Clamp(state.project.expectation + campaign.expectation, 0, 60);
  state.project.hype = Clamp(state.project.hype + campaign.hype, 0, 100);
  state.project.campaigns.push(campaign.id);
  state.anxiety = Clamp(state.anxiety + campaign.anxiety, 0, 100);
  PushLog(state, `${campaign.name}花掉 ¥${campaign.cost.toLocaleString("zh-CN")}：愿望单 +${campaign.wishlists.toLocaleString("zh-CN")}，玩家开始等你兑现。`, "warning");
  CheckAnxietyFailure(state);
  return { state, ok: true, campaign, message: `${campaign.name}已投放。现在不只是你知道游戏可能做不完。` };
}

export function CustomizeProject(currentState, sourceId, featureId) {
  const state = Clone(currentState);
  const feature = FindFeatureChoice(featureId);
  if (state.status !== "playing" || !state.project) return { state, ok: false, message: "当前没有可定制的项目。" };
  if (!feature) return { state, ok: false, message: "这个玩法只存在于会议纪要的另一个版本。" };
  if (state.talkPoints <= 0) return { state, ok: false, message: "本月已经聊到语言失效。进入下月再画饼。" };
  if (state.project.features.some((item) => item.id === feature.id)) return { state, ok: false, message: "这个玩法已经写进项目，再讲一遍不会自动完工。" };
  if (state.project.features.length >= 6) return { state, ok: false, message: "项目已经塞了 6 个核心玩法。再定制下去只能改名叫需求坟场。" };

  const isOwner = sourceId === "owner";
  const member = isOwner ? null : state.team.find((candidate) => candidate.id === sourceId);
  const staff = member ? FindStaff(member.id) : null;
  if (!isOwner && !staff) return { state, ok: false, message: "这位提案人尚未入职，不能隔空替你做需求。" };

  let sourceQuality = 0.58;
  let debtMultiplier = 1.35;
  let sourceLabel = "老板脑内群聊";
  if (staff?.kind === "student") {
    sourceQuality = Clamp(0.82 + member.morale / 500 - member.stress / 520 + (InvestmentPlanForMember(member)?.qualityBonus || 0), 0.62, 1.05);
    debtMultiplier = 0.88;
    member.stress = Clamp(member.stress + 8, 0, 100);
    member.morale = Clamp(member.morale - 2, 0, 100);
    sourceLabel = `${staff.name} · 大学生`;
    state.anxiety = Clamp(state.anxiety + 1, 0, 100);
  } else if (staff?.kind === "ai") {
    sourceQuality = Clamp(0.94 - member.drift / 260 + (InvestmentPlanForMember(member)?.qualityBonus || 0), 0.62, 1.12);
    debtMultiplier = 0.96;
    member.drift = Clamp(member.drift + 9, 0, 100);
    sourceLabel = `${staff.name} · AI`;
    state.anxiety = Clamp(state.anxiety + 1.5, 0, 100);
  } else {
    state.hunger = Clamp(state.hunger + 10, 0, 100);
    state.anxiety = Clamp(state.anxiety + 7, 0, 100);
  }

  MODULE_KEYS.forEach((moduleKey) => {
    const demand = feature.modules[moduleKey] || 0;
    state.project.featureLoad[moduleKey] += demand;
    const directProgress = isOwner ? 0.35 + demand * 0.08 : 0.7 + demand * sourceQuality * 0.18;
    state.project.modules[moduleKey] = Clamp(state.project.modules[moduleKey] + directProgress, 0, 100);
  });
  state.project.scopeDebt = Clamp(state.project.scopeDebt + Math.max(0, feature.scopeDebt) * debtMultiplier, 0, 80);
  state.project.technicalDebt = Clamp(state.project.technicalDebt + Math.max(0, feature.technicalDebt) * debtMultiplier, 0, 80);
  state.project.bugs = Clamp(state.project.bugs + Math.max(-1, feature.bugs) * (isOwner ? 1.6 : 1), 0, 80);
  state.project.hype = Clamp(state.project.hype + feature.hype, 0, 100);
  state.project.features.push({
    id: feature.id,
    title: feature.title,
    sourceId,
    sourceLabel,
    sourceQuality,
    month: state.month,
  });
  state.talkPoints -= 1;
  PushLog(state, `${sourceLabel}拍板定制「${feature.title}」：${feature.pitch}`, isOwner ? "warning" : "normal");
  CheckHungerFailure(state);
  CheckAnxietyFailure(state);
  const consequence = isOwner
    ? "你亲自开工：不花工资，但饥饿 +10、焦虑 +7，而且实现质量很像教程看了一半。"
    : staff.kind === "ai"
      ? `${staff.name} 已生成第一版，并顺手把上下文漂移提高了 9。`
      : `${staff.name} 接下提案，压力 +8；这次至少有人知道需求在说什么。`;
  return { state, ok: true, feature, sourceId, consequence, message: `玩法「${feature.title}」已写进项目。` };
}

const OWNER_TASK_EFFECTS = {
  art: {
    bugs: 1.1,
    scopeDebt: 0.7,
    technicalDebt: 1.8,
    line: "老板亲自画美术：鼠标突然获得了艺术指导资格。",
  },
  design: {
    bugs: 1.4,
    scopeDebt: 2.2,
    technicalDebt: 0.9,
    line: "老板亲自做策划：需求文档长出了第四个结局。",
  },
  client: {
    bugs: 1.6,
    scopeDebt: 2.4,
    technicalDebt: 0.8,
    line: "老板亲自接客户端：按钮被说服了，Bug 也决定留下。",
  },
  performance: {
    bugs: 1.3,
    scopeDebt: 0.8,
    technicalDebt: 2.5,
    line: "老板亲自做性能：帧率和自尊一起开始优化。",
  },
};

export function PerformOwnerTask(currentState, moduleKey) {
  const state = Clone(currentState);
  if (state.status !== "playing" || !state.project) {
    return { state, ok: false, message: "当前没有可亲自开工的项目。" };
  }
  if (!MODULE_KEYS.includes(moduleKey)) {
    return { state, ok: false, message: "这个工位不存在，老板只能在四个真实模块上干活。" };
  }

  // Keep the action usable even when a caller advances the month by restoring a save
  // directly instead of going through AdvanceMonth.
  if (state.ownerWorkMonth !== state.month) {
    state.ownerWorkMonth = state.month;
    state.ownerWorkCount = 0;
  }
  if (state.ownerWorkCount >= 3) {
    return { state, ok: false, message: "本月老板已经亲自干满三次了，继续敲键盘只会制造新的传说。" };
  }

  const effect = OWNER_TASK_EFFECTS[moduleKey];
  const before = state.project.modules[moduleKey];
  const requestedGain = 2 + Math.floor(SeededUnit(
    state.seed + state.month * 137 + state.ownerWorkCount * 17 + moduleKey.length * 31,
  ) * 3);
  const after = Clamp(before + requestedGain, 0, 100);
  const gain = after - before;
  state.project.modules[moduleKey] = after;
  state.project.bugs = Clamp(state.project.bugs + effect.bugs, 0, 80);
  state.project.scopeDebt = Clamp(state.project.scopeDebt + effect.scopeDebt, 0, 80);
  state.project.technicalDebt = Clamp(state.project.technicalDebt + effect.technicalDebt, 0, 80);
  state.ownerWorkCount += 1;
  state.ownerWorkMonth = state.month;
  state.hunger = Clamp(state.hunger + 7, 0, 100);
  state.anxiety = Clamp(state.anxiety + 5, 0, 100);
  PushLog(state, `${effect.line} ${moduleKey} 模块进度 +${gain.toFixed(1)}，Bug 也顺手学会了复制。`, "warning");
  CheckHungerFailure(state);
  CheckAnxietyFailure(state);
  return {
    state,
    ok: true,
    moduleKey,
    gain,
    message: `老板亲自完成 ${moduleKey} 工位：低质量进度 +${gain.toFixed(1)}。`,
  };
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
  const anxietyDelta = tone === "pressure" ? 2.5 : tone === "roast" ? 1.5 : tone === "encourage" ? -2.5 : -1.5;
  state.anxiety = Clamp(state.anxiety + anxietyDelta, 0, 100);
  CheckAnxietyFailure(state);
  const line = SelectLine(staff, tone, state.seed + state.month * 29 + state.talkPoints * 7 + staffId.length);
  PushLog(state, `${staff.name}：${line}`, tone === "roast" ? "warning" : "normal");
  return { state, ok: true, message: "对话完成", line };
}

export function RepayStartupLoan(currentState, requestedAmount) {
  const state = Clone(currentState);
  const loan = state.startupLoan;
  if (state.status !== "playing" || !loan || loan.status !== "active") {
    return { state, ok: false, message: loan?.status === "repaid" ? "创业启动贷已经结清。" : "当前没有可偿还的创业启动贷。" };
  }
  const numericAmount = requestedAmount === "full" ? loan.remaining : Number(requestedAmount);
  if (!Number.isFinite(numericAmount) || numericAmount <= 0) return { state, ok: false, message: "还款金额无效。银行暂时拒绝收下空气。" };
  const payment = Math.min(loan.remaining, Math.round(numericAmount));
  if (state.cash < payment) return { state, ok: false, message: `现金不够，还差 ¥${Math.ceil(payment - state.cash).toLocaleString("zh-CN")}。` };
  state.cash -= payment;
  loan.remaining = Math.max(0, loan.remaining - payment);
  loan.payments ||= [];
  loan.payments.push({ month: state.month, amount: payment });
  state.totalCosts += payment;
  if (loan.remaining <= 0) {
    loan.remaining = 0;
    loan.status = "repaid";
    state.anxiety = Math.max(0, state.anxiety - 8);
    PushLog(state, `创业启动贷全部结清。${state.studioName || "工作室"} 暂时重新属于你。`, "good");
    return { state, ok: true, payment, repaid: true, message: "启动贷已结清，全部身家暂时保住了" };
  }
  PushLog(state, `偿还创业启动贷 ¥${payment.toLocaleString("zh-CN")}，仍欠 ¥${loan.remaining.toLocaleString("zh-CN")}。`, "normal");
  return { state, ok: true, payment, repaid: false, message: `已还 ¥${payment.toLocaleString("zh-CN")}` };
}

export function TakeLoan(currentState, collateralId) {
  const state = Clone(currentState);
  const collateral = FindCollateral(collateralId);
  if (!collateral) return { state, ok: false, message: "抵押物不存在。" };
  if (state.assets[collateralId] !== "free") return { state, ok: false, message: `${collateral.name} 已经不完全属于你了。` };
  state.assets[collateralId] = "pledged";
  state.cash += collateral.principal;
  state.loans.push({
    collateralId,
    principal: collateral.principal,
    monthlyPayment: collateral.monthlyPayment,
    remaining: collateral.term,
    status: "active",
    startMonth: state.month,
  });
  state.anxiety = Clamp(state.anxiety + (collateral.fatal ? 0 : 6), 0, 100);
  PushLog(state, `抵押 ${collateral.name}，到账 ¥${collateral.principal.toLocaleString("zh-CN")}。未来的你已读不回。`, collateral.fatal ? "danger" : "warning");
  if (collateral.fatal) {
    state.assets.computer = "seized";
    state.status = "gameover";
    state.outcome = {
      kind: "computerPledged",
      title: "你抵押了开发电脑",
      subtitle: "钱到账了，但项目文件和尊严一起离线。人能饿，电脑不能没。",
    };
  } else CheckAnxietyFailure(state);
  return { state, ok: true, fatal: Boolean(collateral.fatal), message: collateral.fatal ? "开发电脑已被抬走" : "贷款已到账" };
}

export function GetPublicCatalog() {
  return {
    staff: STAFF_CATALOG,
    directives: DIRECTIVES,
    projects: PROJECTS,
    gameTypes: GAME_TYPES,
    bills: LIVING_BILLS,
    foodPlans: FOOD_PLANS,
    marketingCampaigns: MARKETING_CAMPAIGNS,
    featureChoices: FEATURE_CHOICES,
    marketDirections: MARKET_DIRECTIONS,
    marketEvents: MARKET_EVENTS,
    studentPayLevels: STUDENT_PAY_LEVELS,
    aiSubscriptionLevels: AI_SUBSCRIPTION_LEVELS,
    pivotReasons: PIVOT_REASONS,
    speculationOptions: SPECULATION_OPTIONS,
    collateral: COLLATERAL_OPTIONS,
  };
}

export function ValidateState(candidate) {
  if (!candidate || candidate.rulesVersion !== RULES_VERSION) return false;
  if (!["setup", "playing", "gameover", "ended"].includes(candidate.status)) return false;
  if (typeof candidate.studioName !== "string" || candidate.studioName.length > 18) return false;
  if (!Number.isInteger(candidate.month) || candidate.month < 1) return false;
  if (!Number.isInteger(candidate.ownerWorkMonth) || candidate.ownerWorkMonth < 1
    || candidate.ownerWorkMonth > candidate.month
    || !Number.isInteger(candidate.ownerWorkCount) || candidate.ownerWorkCount < 0
    || candidate.ownerWorkCount > 3) return false;
  if (![candidate.cash, candidate.gameRevenue, candidate.arrears, candidate.totalRevenue, candidate.totalCosts,
    candidate.anxiety, candidate.hunger, candidate.reputation, candidate.fans, candidate.speculationProfit]
    .every(Number.isFinite)) return false;
  if (candidate.cash < 0 || candidate.gameRevenue < 0 || candidate.arrears < 0
    || candidate.anxiety < 0 || candidate.anxiety > 100 || candidate.hunger < 0 || candidate.hunger > 100) return false;
  if (!FindFoodPlan(candidate.foodPlan) || !FindDirective(candidate.selectedDirective)) return false;
  if (!candidate.assets || COLLATERAL_OPTIONS.some((asset) => !["free", "pledged", "seized"].includes(candidate.assets[asset.id]))) return false;
  if (!Array.isArray(candidate.log) || !Array.isArray(candidate.loans)
    || !Array.isArray(candidate.incomeHistory) || !Array.isArray(candidate.speculationHistory)) return false;
  if (!Number.isInteger(candidate.workstations) || candidate.workstations < 0 || candidate.workstations > WORKSTATION_COSTS.length
    || !Number.isFinite(candidate.equipmentSpent) || candidate.equipmentSpent < 0) return false;
  const startupLoan = candidate.startupLoan;
  if (!startupLoan || !["pending", "active", "repaid", "defaulted"].includes(startupLoan.status)
    || ![startupLoan.principal, startupLoan.totalDue, startupLoan.remaining, startupLoan.dueMonth].every(Number.isFinite)
    || startupLoan.principal <= 0 || startupLoan.totalDue < startupLoan.principal || startupLoan.remaining < 0
    || !Array.isArray(startupLoan.payments)) return false;

  if (!Array.isArray(candidate.team) || candidate.team.length > 4) return false;
  const teamIds = new Set();
  for (const member of candidate.team) {
    if (!FindStaff(member?.id) || teamIds.has(member.id)) return false;
    teamIds.add(member.id);
    if (!Number.isInteger(member.investmentLevel) || member.investmentLevel < 0 || member.investmentLevel > 2) return false;
    if (![member.morale, member.stress, member.drift, member.boost, member.months].every(Number.isFinite)) return false;
  }
  for (const loan of candidate.loans) {
    if (!FindCollateral(loan?.collateralId) || !["active", "defaulted", "repaid"].includes(loan.status)) return false;
    if (![loan.principal, loan.monthlyPayment, loan.remaining, loan.startMonth].every(Number.isFinite)) return false;
  }

  const project = candidate.project;
  if (!project) return candidate.status === "setup";
  if (!FindProject(project.templateId) || !FindGameType(project.gameTypeId)) return false;
  if (!candidate.studioName || typeof project.name !== "string" || !project.name || project.name.length > 20) return false;
  if (!project.modules || !project.featureLoad
    || MODULE_KEYS.some((moduleKey) => !Number.isFinite(project.modules[moduleKey])
      || project.modules[moduleKey] < 0 || project.modules[moduleKey] > 100
      || !Number.isFinite(project.featureLoad[moduleKey]) || project.featureLoad[moduleKey] < 0)) return false;
  if (!Array.isArray(project.features) || project.features.some((feature) => !FindFeatureChoice(feature?.id))) return false;
  if (!Array.isArray(project.campaigns) || project.campaigns.some((campaignId) => !FindMarketingCampaign(campaignId))) return false;
  if (project.marketStrategy) {
    const strategy = project.marketStrategy;
    if (!MarketFocusFor(candidate, strategy.focusId)
      || (strategy.directionId !== null && !FindMarketDirection(strategy.directionId))
      || !Number.isInteger(strategy.setMonth) || strategy.setMonth < 0 || strategy.setMonth > candidate.month) return false;
  }
  if (project.marketStrategyHistory !== undefined) {
    if (!Array.isArray(project.marketStrategyHistory) || project.marketStrategyHistory.some((entry) => (
      !Number.isInteger(entry?.month) || entry.month < 1 || entry.month > candidate.month
      || !MarketFocusFor(candidate, entry.focusId)
      || (entry.directionId !== null && !FindMarketDirection(entry.directionId))
    ))) return false;
  }
  if (!Array.isArray(project.abstractIdeas) || project.abstractIdeas.some((idea) => !ABSTRACT_IDEAS.some((candidateIdea) => candidateIdea.id === idea?.id))) return false;
  if (!Array.isArray(project.pivotHistory) || !Array.isArray(project.releaseHistory)
    || !Array.isArray(project.activeLiveEvents) || !Array.isArray(project.painHistory)) return false;
  if (project.activeLiveEvents.some((active) => !LIVE_REVENUE_EVENTS.some((event) => event.id === active?.id))) return false;
  if (![project.technicalDebt, project.scopeDebt, project.bugs, project.hype, project.marketingSpent,
    project.wishlists, project.expectation, project.pivotCount, project.age, project.version,
    project.monthlyRevenue, project.marketScale, project.monthsSinceUpdate, project.lastReleaseMonth,
    project.wastedWork, project.buildStreak].every(Number.isFinite)) return false;
  if (!project.buildStatus || !["broken", "fragile", "playable", "stable"].includes(project.buildStatus.level)
    || !Number.isFinite(project.buildStatus.score)) return false;
  return true;
}
