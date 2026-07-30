function ToFlagSet(flags) {
  if (flags instanceof Set) return flags;
  return new Set(Array.isArray(flags) ? flags : Object.entries(flags || {}).filter(([, enabled]) => Boolean(enabled)).map(([flagId]) => flagId));
}

function NumericCounter(counters, counterId) {
  const value = Number(counters?.[counterId]);
  return Number.isFinite(value) ? value : 0;
}

function RequirementCounterEntries(requirements, key) {
  return Object.entries(requirements?.[key] || {});
}

export function RequirementsMet(requirements = {}, state = {}) {
  const flags = ToFlagSet(state.flags);
  const counters = state.counters || {};
  const stageId = state.stageId || "";
  const equipment = ToFlagSet(state.equipment);
  const requiredFlags = [...(requirements.allFlags || []), ...(requirements.requiredFlags || [])];

  if (requirements.stageId && requirements.stageId !== stageId) return false;
  if (requirements.anyStageIds?.length && !requirements.anyStageIds.includes(stageId)) return false;
  if (requirements.excludedStageIds?.includes(stageId)) return false;
  if (requiredFlags.length && !requiredFlags.every((flagId) => flags.has(flagId))) return false;
  if (requirements.anyFlags?.length && !requirements.anyFlags.some((flagId) => flags.has(flagId))) return false;
  if (requirements.noFlags?.some((flagId) => flags.has(flagId))) return false;
  if (requirements.equippedTool && !equipment.has(requirements.equippedTool)) return false;
  if (requirements.allEquipment?.length && !requirements.allEquipment.every((itemId) => equipment.has(itemId))) return false;
  if (RequirementCounterEntries(requirements, "countersAtMost").some(([counterId, maximum]) => NumericCounter(counters, counterId) > Number(maximum))) return false;
  if (RequirementCounterEntries(requirements, "countersAtLeast").some(([counterId, minimum]) => NumericCounter(counters, counterId) < Number(minimum))) return false;
  if (RequirementCounterEntries(requirements, "countersExactly").some(([counterId, expected]) => NumericCounter(counters, counterId) !== Number(expected))) return false;
  return true;
}

export function RequirementGroupsMet(requirementGroups = [], state = {}) {
  return requirementGroups.filter(Boolean).every((requirements) => RequirementsMet(requirements, state));
}

export function FindRouteOption(routeChoice, requestedId) {
  const normalizedId = String(requestedId || "");
  return (routeChoice?.options || routeChoice?.choices || []).find((option) => (
    [option.choiceId, option.optionId, option.id, option.interactableId].filter(Boolean).includes(normalizedId)
  )) || null;
}

export function EvaluateRouteOption(routeChoice, requestedId, state = {}, context = {}) {
  const option = FindRouteOption(routeChoice, requestedId);
  if (!option) return { available: false, option: null, reason: "没有找到这个路线方案。" };
  const interactable = (context.interactables || []).find((entry) => (
    [entry.interactableId, entry.id].includes(option.interactableId)
      || [entry.optionId, entry.id].includes(option.optionId)
  )) || null;
  const trigger = (context.triggers || []).find((entry) => (
    entry.interactableId === interactable?.interactableId
      || entry.interactableId === option.interactableId
      || [entry.optionId, entry.id].includes(option.optionId)
  )) || null;
  const available = RequirementGroupsMet([
    option.requires,
    option.availableWhen,
    interactable?.requires,
    trigger?.requires,
  ], state);
  return {
    available,
    option,
    interactable,
    trigger,
    reason: available ? "" : (option.unavailableReason || interactable?.unavailableReason || "眼下还不能这样处理交通线。"),
  };
}

export function SystemConditionMet(conditionId, state = {}) {
  const flags = ToFlagSet(state.flags);
  const firstDefenseFlags = ["kilnAshScreenDeployed", "kilnFirstDefenseCompleted", "kilnThreatBrokenOrEvaded"];
  const finalDefenseFlags = ["kilnDefenseComplete", "kilnRockslideReleased", "kilnThirdDefenseCompleted"];

  if (conditionId === "playerDetectedInBlockadePostZone") {
    return Boolean(state.playerDetectedInBlockadePostZone);
  }
  if (conditionId === "firstKilnThreatBrokenOrEvaded") {
    return firstDefenseFlags.some((flagId) => flags.has(flagId))
      || Boolean(state.firstKilnThreatDisengaged);
  }
  if (conditionId === "kilnHoldSecondsAtLeastThirtySixOrThreatsDisengaged") {
    return finalDefenseFlags.some((flagId) => flags.has(flagId))
      || Number(state.kilnHoldSeconds || 0) >= 36
      || Boolean(state.kilnThreatsDisengaged);
  }
  if (conditionId === "routeChoiceResolved") {
    return Boolean(state.routeChoice)
      && (flags.has("endingRouteBroken") || flags.has("endingRoutePreserved"));
  }
  return false;
}

export function SelectQuietPassageMaterial(resources = {}) {
  if (Number(resources.cloth || 0) >= 1) return { itemId: "cloth", amount: 1 };
  if (Number(resources.bandage || 0) >= 1) return { itemId: "bandage", amount: 1 };
  return null;
}

function DialogueDuration(line) {
  const text = Array.isArray(line) ? line[1] : (line?.text || line?.line || "");
  const authored = Array.isArray(line) ? null : Number(line?.durationSeconds ?? line?.duration);
  return Number.isFinite(authored) && authored > 0 ? authored : Math.max(2.4, String(text).length * 0.12);
}

export function BuildDialogueSchedule(lines = [], startTimeMilliseconds = 0) {
  let inferredOffsetSeconds = 0;
  return lines.map((line) => {
    const duration = DialogueDuration(line);
    const rawDelay = Array.isArray(line) ? null : line?.delaySeconds ?? line?.delay;
    const authoredDelay = rawDelay === null || rawDelay === undefined ? NaN : Number(rawDelay);
    const offsetSeconds = Number.isFinite(authoredDelay) ? Math.max(0, authoredDelay) : inferredOffsetSeconds;
    inferredOffsetSeconds = Math.max(inferredOffsetSeconds, offsetSeconds + duration);
    return {
      speaker: Array.isArray(line) ? line[0] : (line?.speaker || line?.displayName || ""),
      text: Array.isArray(line) ? line[1] : (line?.text || line?.line || ""),
      duration,
      delaySeconds: offsetSeconds,
      readyAt: startTimeMilliseconds + offsetSeconds * 1000,
    };
  }).filter((line) => line.text);
}
