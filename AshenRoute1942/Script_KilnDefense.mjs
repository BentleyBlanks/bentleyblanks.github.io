export const KilnDefenseFlagIds = Object.freeze({
  FIRST_ACTION: "kilnAshScreenDeployed",
  SECOND_ACTION: "kilnReedCurtainDropped",
  THIRD_ACTION: "kilnRockslideReleased",
  COMPLETE: "kilnDefenseComplete",
});

export const KilnDefenseActions = Object.freeze([
  Object.freeze({
    actionId: "deployAshScreen",
    flagId: KilnDefenseFlagIds.FIRST_ACTION,
    position: Object.freeze({ x: -24.6, z: -76.8 }),
    radius: 3.1,
    prompt: "踢翻灰筛，遮住左侧射界",
    objective: "到灰筛后压低身子，踢起石灰遮住追兵",
    completionText: "石灰扬起，左侧的枪口失去目标。",
    misdirectPosition: Object.freeze({ x: -15.0, z: -73.0 }),
    safetySeconds: 5.5,
  }),
  Object.freeze({
    actionId: "dropReedCurtain",
    flagId: KilnDefenseFlagIds.SECOND_ACTION,
    position: Object.freeze({ x: -31.6, z: -82.2 }),
    radius: 3.1,
    prompt: "转到灰墙，拉落苇帘",
    objective: "沿灰墙换掩体，拉下旧苇帘断开视线",
    completionText: "湿苇帘贴住窑墙，追兵只能朝旧位置试探。",
    misdirectPosition: Object.freeze({ x: -23.0, z: -77.0 }),
    safetySeconds: 6.0,
  }),
  Object.freeze({
    actionId: "releaseRockslide",
    flagId: KilnDefenseFlagIds.THIRD_ACTION,
    position: Object.freeze({ x: -36.6, z: -88.0 }),
    radius: 3.2,
    prompt: "推下松石，封住追路",
    objective: "退到西侧碎石坡，推下松石争取最后几步",
    completionText: "碎石滚进窄口，追兵被迫停下清路。",
    misdirectPosition: Object.freeze({ x: -29.0, z: -82.0 }),
    safetySeconds: 8.0,
  }),
]);

const defaultConfig = Object.freeze({
  initialSafetySeconds: 3.5,
  coverRadius: 4.2,
  coverDamageMultiplier: 0.16,
  exposedDamageMultiplier: 0.82,
  maximumCoverDamage: 18,
  minimumActionIntervalSeconds: 0.35,
});

function FiniteOr(value, fallback) {
  return Number.isFinite(Number(value)) ? Number(value) : fallback;
}

function Clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, FiniteOr(value, minimum)));
}

function ClonePosition(position) {
  return {
    x: FiniteOr(position?.x, 0),
    z: FiniteOr(position?.z, 0),
  };
}

function Distance(a, b) {
  return Math.hypot(FiniteOr(a?.x, 0) - FiniteOr(b?.x, 0), FiniteOr(a?.z, 0) - FiniteOr(b?.z, 0));
}

function ResolveConfig(config = {}) {
  return {
    ...defaultConfig,
    ...config,
  };
}

export function CreateKilnDefenseState(options = {}) {
  return {
    active: Boolean(options.active),
    completed: Boolean(options.completed),
    elapsedSeconds: Math.max(0, FiniteOr(options.elapsedSeconds, 0)),
    safeSecondsRemaining: Math.max(0, FiniteOr(options.safeSecondsRemaining, 0)),
    actionCooldownSeconds: Math.max(0, FiniteOr(options.actionCooldownSeconds, 0)),
    completedActionIds: Array.isArray(options.completedActionIds) ? [...new Set(options.completedActionIds)] : [],
    coverDamageTaken: Math.max(0, FiniteOr(options.coverDamageTaken, 0)),
    totalDamageTaken: Math.max(0, FiniteOr(options.totalDamageTaken, 0)),
    lastActionId: options.lastActionId || null,
    lastPlayerPosition: ClonePosition(options.lastPlayerPosition),
  };
}

export function StartKilnDefense(state, config = {}) {
  const nextState = CreateKilnDefenseState(state);
  const resolvedConfig = ResolveConfig(config);
  nextState.active = true;
  nextState.safeSecondsRemaining = Math.max(nextState.safeSecondsRemaining, resolvedConfig.initialSafetySeconds);
  return nextState;
}

export function GetKilnDefenseObjective(state) {
  const nextIndex = CreateKilnDefenseState(state).completedActionIds.length;
  return KilnDefenseActions[nextIndex] || null;
}

export function IsInKilnCover(position, config = {}) {
  const resolvedConfig = ResolveConfig(config);
  return KilnDefenseActions.some((action) => Distance(position, action.position) <= resolvedConfig.coverRadius);
}

export function UpdateKilnDefense(state, frame = {}, config = {}) {
  const nextState = CreateKilnDefenseState(state);
  if (!nextState.active && !nextState.completed) {
    return {
      state: nextState,
      objective: GetKilnDefenseObjective(nextState),
      inCover: IsInKilnCover(frame.playerPosition, config),
    };
  }
  const delta = Clamp(frame.delta ?? frame.deltaSeconds, 0, 0.25);
  nextState.elapsedSeconds += delta;
  nextState.safeSecondsRemaining = Math.max(0, nextState.safeSecondsRemaining - delta);
  nextState.actionCooldownSeconds = Math.max(0, nextState.actionCooldownSeconds - delta);
  nextState.lastPlayerPosition = ClonePosition(frame.playerPosition);
  return {
    state: nextState,
    objective: GetKilnDefenseObjective(nextState),
    inCover: IsInKilnCover(frame.playerPosition, config),
  };
}

export function PerformKilnDefenseAction(state, actionId, config = {}) {
  const nextState = CreateKilnDefenseState(state);
  const resolvedConfig = ResolveConfig(config);
  const objective = GetKilnDefenseObjective(nextState);
  if (!nextState.active) {
    return { ok: false, reasonId: "defenseNotStarted", state: nextState, action: objective, flags: [] };
  }
  if (!objective || nextState.completed) {
    return { ok: false, reasonId: "defenseAlreadyComplete", state: nextState, action: null, flags: [] };
  }
  if (nextState.actionCooldownSeconds > 0) {
    return { ok: false, reasonId: "actionCooldown", state: nextState, action: objective, flags: [] };
  }
  if (objective.actionId !== actionId) {
    return { ok: false, reasonId: "wrongDefenseStep", state: nextState, action: objective, flags: [] };
  }
  nextState.completedActionIds.push(objective.actionId);
  nextState.lastActionId = objective.actionId;
  nextState.safeSecondsRemaining = Math.max(nextState.safeSecondsRemaining, objective.safetySeconds);
  nextState.actionCooldownSeconds = resolvedConfig.minimumActionIntervalSeconds;
  nextState.completed = nextState.completedActionIds.length >= KilnDefenseActions.length;
  nextState.active = !nextState.completed;
  const flags = [objective.flagId];
  if (nextState.completed) flags.push(KilnDefenseFlagIds.COMPLETE);
  return {
    ok: true,
    reasonId: nextState.completed ? "defenseComplete" : "defenseStepComplete",
    state: nextState,
    action: objective,
    nextObjective: GetKilnDefenseObjective(nextState),
    flags,
  };
}

export function ResolveKilnIncomingDamage(state, incomingDamage, frame = {}, config = {}) {
  const nextState = CreateKilnDefenseState(state);
  const resolvedConfig = ResolveConfig(config);
  const rawDamage = Math.max(0, FiniteOr(incomingDamage, 0));
  const inCover = frame.inCover ?? IsInKilnCover(frame.playerPosition, resolvedConfig);
  if (!nextState.active && !nextState.completed) {
    return { state: nextState, appliedDamage: rawDamage, inCover, protectedByAction: false };
  }
  const protectedByAction = nextState.safeSecondsRemaining > 0;
  let appliedDamage = protectedByAction
    ? 0
    : rawDamage * (inCover ? resolvedConfig.coverDamageMultiplier : resolvedConfig.exposedDamageMultiplier);
  if (inCover) {
    const remainingCoverBudget = Math.max(0, resolvedConfig.maximumCoverDamage - nextState.coverDamageTaken);
    appliedDamage = Math.min(appliedDamage, remainingCoverBudget);
    nextState.coverDamageTaken += appliedDamage;
  }
  nextState.totalDamageTaken += appliedDamage;
  return {
    state: nextState,
    appliedDamage,
    inCover,
    protectedByAction,
  };
}

export function ValidateKilnSurvival(startingHealth, events = [], config = {}) {
  let health = Math.max(0, FiniteOr(startingHealth, 0));
  let state = StartKilnDefense(CreateKilnDefenseState(), config);
  const flags = new Set();
  events.forEach((event) => {
    if (event.type === "tick") {
      state = UpdateKilnDefense(state, {
        delta: event.delta,
        playerPosition: event.playerPosition,
      }, config).state;
    } else if (event.type === "action") {
      const result = PerformKilnDefenseAction(state, event.actionId, config);
      state = result.state;
      result.flags.forEach((flagId) => flags.add(flagId));
    } else if (event.type === "damage") {
      const result = ResolveKilnIncomingDamage(state, event.amount, {
        playerPosition: event.playerPosition,
        inCover: event.inCover,
      }, config);
      state = result.state;
      health = Math.max(0, health - result.appliedDamage);
    }
  });
  return {
    survived: health > 0,
    health,
    state,
    flags: [...flags],
  };
}
