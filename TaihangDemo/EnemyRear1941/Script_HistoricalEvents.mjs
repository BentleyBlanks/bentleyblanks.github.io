import {
  GetHistoricalTurnNarrative,
} from "./Data_History.mjs";

const maximumMeter = 100;
const maximumResource = 99;

function DeepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) {
    return value;
  }
  for (const child of Object.values(value)) {
    DeepFreeze(child);
  }
  return Object.freeze(value);
}

function Clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, Number(value) || 0));
}

function IsVillage(hex) {
  return Boolean(hex && hex.feature === "Village");
}

function HasAction(actionIds, expectedIds) {
  return expectedIds.some((actionId) => actionIds.has(actionId));
}

function HasInstitution(state, expectedIds) {
  return (state.hexes || []).some((hex) => expectedIds.includes(hex.institution)
    || expectedIds.includes(hex.construction?.institutionId));
}

function CountInstitutions(state) {
  return (state.hexes || []).filter((hex) => IsVillage(hex) && hex.institution).length;
}

function CreateHook(id, label, options = {}) {
  return {
    id,
    label,
    actionsAny: options.actionsAny || [],
    institutionsAny: options.institutionsAny || [],
    meterAtMost: options.meterAtMost || null,
    minimumInstitutions: options.minimumInstitutions || 0,
    requiresWarningTarget: options.requiresWarningTarget === true,
    avoidActions: options.avoidActions || [],
    requireAll: options.requireAll === true,
  };
}

function CreateMechanic(turn, objective, hooks, missedConsequence = null) {
  return {
    turn,
    objective,
    hooks,
    protectedMinimum: 2,
    partialMinimum: 1,
    missedConsequence,
  };
}

/**
 * These are not popup choices. Each hook is satisfied by orders the player
 * already gives on the map, completed village institutions, or disciplined
 * restraint. The record therefore explains what the player actually chose to
 * prioritize during the month.
 */
export const historicalEventMechanics = DeepFreeze([
  CreateMechanic(1, "核对困难户并把秋粮分散保存；生产、救济与走访至少落实两项。", [
    CreateHook("RegisterHouseholds", "核对并照顾困难住户", { actionsAny: ["organize", "relief"] }),
    CreateHook("SecureHarvest", "保存和补充秋粮", { actionsAny: ["selfProduction", "improveTile"] }),
    CreateHook("LimitHarvestExposure", "避免以高暴露军事行动挤占秋收", {
      meterAtMost: { id: "exposure", value: 42 },
      avoidActions: ["ambush", "sabotage", "emergencySupply"],
      requireAll: true,
    }),
  ], {
    applyTurn: 3,
    text: "九月未完成的分仓与困难户登记转为入冬口粮缺口，各村困苦进一步加重。",
    effects: { grain: -2, hardshipAll: 2, people: -1 },
  }),
  CreateMechanic(2, "交叉核验公路与车站消息，并用分段联络保护村庄关系。", [
    CreateHook("CrossCheckPatrols", "用侦察交叉核验巡逻消息", { actionsAny: ["recon"] }),
    CreateHook("SegmentTraffic", "筹建或维持地下交通站", {
      actionsAny: ["buildStation", "constructionDrive"],
      institutionsAny: ["Station"],
    }),
    CreateHook("MaintainTrust", "继续走访而不寻找替罪者", { actionsAny: ["organize", "relief"] }),
  ], {
    applyTurn: 4,
    text: "十月未经核验的巡逻消息污染了冬季交通判断，基层网络受损并提高暴露。",
    effects: { network: -3, exposure: 5, intel: -1 },
  }),
  CreateMechanic(3, "为病户补充照护、拆分药品，并建立可替代的诊疗与交通节点。", [
    CreateHook("TreatIllness", "开展救济与病户照护", { actionsAny: ["relief", "rest"] }),
    CreateHook("DisperseClinic", "筹建或维持救护所", {
      actionsAny: ["buildClinic", "constructionDrive"],
      institutionsAny: ["Clinic"],
    }),
    CreateHook("MedicalRoute", "侦察药品转运路线", {
      actionsAny: ["recon", "buildStation"],
      institutionsAny: ["Station"],
    }),
  ], {
    applyTurn: 5,
    text: "十一月未处置的病情延续到严冬，药品与照护劳力继续承压。",
    effects: { medicine: -1, hardshipAll: 2, people: -2 },
  }),
  CreateMechanic(4, "核验岗哨和列车变化；不得把国际战局扩大误判为本县守备自动撤走。", [
    CreateHook("ObserveStation", "侦察车站和道路变化", { actionsAny: ["recon"] }),
    CreateHook("ProtectRailSource", "用地下交通站保护消息来源", {
      actionsAny: ["buildStation", "constructionDrive"],
      institutionsAny: ["Station"],
    }),
    CreateHook("AvoidFalseOpportunity", "在证据不足时控制高暴露行动", {
      meterAtMost: { id: "exposure", value: 52 },
      avoidActions: ["emergencySupply"],
      requireAll: true,
    }),
  ], {
    applyTurn: 5,
    text: "十二月的错误守备判断使交通线进入严冬时更加暴露，已有情报也失去时效。",
    effects: { exposure: 6, intel: -1, discipline: -2 },
  }),
  CreateMechanic(5, "让寄居家庭参与安置决定，先保障口粮、保暖与诊疗。", [
    CreateHook("FamilyRelief", "保障寄居家庭的口粮与照护", { actionsAny: ["relief", "organize"] }),
    CreateHook("WinterClinic", "维持救护与分散诊疗能力", {
      actionsAny: ["buildClinic", "constructionDrive", "rest"],
      institutionsAny: ["Clinic"],
    }),
    CreateHook("KeepFamilyRouteHidden", "控制严冬交通暴露", {
      meterAtMost: { id: "exposure", value: 58 },
      avoidActions: ["emergencySupply"],
      requireAll: true,
    }),
  ], {
    applyTurn: 7,
    text: "一月未妥善安置的家庭在春荒前仍缺粮、缺医，信任和可用劳力继续下降。",
    effects: { grain: -2, hardshipAll: 2, people: -2, unity: -1 },
  }),
  CreateMechanic(6, "废止失效口令，先试通短段，再恢复必要联络。", [
    CreateHook("VerifyToken", "侦察并用第二来源核验凭据", { actionsAny: ["recon"] }),
    CreateHook("RebuildSegment", "建设或推进分段交通站", {
      actionsAny: ["buildStation", "constructionDrive"],
      institutionsAny: ["Station"],
    }),
    CreateHook("SupportAffectedFamilies", "走访或救济受盘查家庭", { actionsAny: ["organize", "relief"] }),
  ], {
    applyTurn: 8,
    text: "二月未核验的旧凭据削弱了春季预警网络，搜索压力更容易沿联络线传入。",
    effects: { network: -4, exposure: 6, intel: -1 },
  }),
  CreateMechanic(7, "同时安排饮水照护、最低救济和春耕恢复，不能只追求单月产出。", [
    CreateHook("RelieveSpringHardship", "开展救济与恢复", { actionsAny: ["relief"] }),
    CreateHook("ProtectWaterAndHealth", "维持救护所或筹建诊疗点", {
      actionsAny: ["buildClinic", "constructionDrive"],
      institutionsAny: ["Clinic"],
    }),
    CreateHook("RestoreProduction", "组织生产自救或改良地块", {
      actionsAny: ["selfProduction", "improveTile", "organize"],
      institutionsAny: ["Cooperative"],
    }),
  ], {
    applyTurn: 9,
    text: "三月未缓解的春荒和病情拖慢五月疏散，村庄在扫荡前已承担额外困苦。",
    effects: { hardshipAll: 3, medicine: -1, people: -3 },
  }),
  CreateMechanic(8, "把运输、巡逻与征粮征候交叉核验，并把预警转成分仓和疏散准备。", [
    CreateHook("CorroborateSweepSignals", "侦察并提高敌情清晰度", { actionsAny: ["recon"] }),
    CreateHook("ProtectIntelligenceSource", "维持地下交通站", {
      actionsAny: ["buildStation", "constructionDrive"],
      institutionsAny: ["Station"],
    }),
    CreateHook("PrepareHouseholds", "走访、救济或建设隐蔽设施", {
      actionsAny: ["organize", "relief", "buildTunnels"],
      institutionsAny: ["Tunnels", "Clinic"],
    }),
  ], {
    applyTurn: 9,
    text: "四月预警未转成可执行准备，五月扫荡方向虽已发现，冲击强度仍然上升。",
    effects: { warningIntensity: 1, discipline: -2 },
  }),
  CreateMechanic(9, "先完成住户疏散与接应，再用有限武装争取脱离时间。", [
    CreateHook("EvacuateWarnedVillage", "对预警村庄实施保护性疏散", {
      actionsAny: ["evacuate"],
      requiresWarningTarget: true,
    }),
    CreateHook("CoverWithdrawal", "在预警方向实施有限伏击", {
      actionsAny: ["ambush"],
      requiresWarningTarget: true,
    }),
    CreateHook("PreparedShelter", "以地道、救护或群众工作支撑疏散", {
      actionsAny: ["relief", "organize", "buildTunnels"],
      institutionsAny: ["Tunnels", "Clinic"],
    }),
  ], {
    applyTurn: 10,
    text: "五月疏散与接应不足使灾后恢复背负更多失散、伤病和住房压力。",
    effects: { people: -3, livelihoodAll: -2, hardshipAll: 2 },
  }),
  CreateMechanic(10, "逐户清点返村、伤病与住房，优先恢复饮水、诊疗和基本生计。", [
    CreateHook("CountAndRelieve", "开展救济与逐户恢复", { actionsAny: ["relief"] }),
    CreateHook("RebuildTrust", "走访受灾家庭并恢复联系", { actionsAny: ["organize"] }),
    CreateHook("RestoreCivilianInstitution", "恢复救护或互助机构", {
      actionsAny: ["buildClinic", "buildCooperative", "constructionDrive"],
      institutionsAny: ["Clinic", "Cooperative"],
    }),
  ], {
    applyTurn: 12,
    text: "六月未完成的住房、生计与照护责任继续压低恢复能力，并加重秋收前困苦。",
    effects: { livelihoodAll: -3, hardshipAll: 2, unity: -1 },
  }),
  CreateMechanic(11, "在雨季拆小运输、试通短段，并优先保证病户与寄居家庭。", [
    CreateHook("ReconRainRoute", "侦察可通行短段", { actionsAny: ["recon"] }),
    CreateHook("MaintainTrafficStation", "维持分段交通站", {
      actionsAny: ["buildStation", "constructionDrive"],
      institutionsAny: ["Station"],
    }),
    CreateHook("ProtectHealthInRain", "救济、诊疗或整训救护", {
      actionsAny: ["relief", "buildClinic", "rest"],
      institutionsAny: ["Clinic"],
    }),
  ], {
    applyTurn: 12,
    text: "七月运输延误与饮水风险没有得到处置，八月恢复生产时仍缺药且网络承载下降。",
    effects: { medicine: -1, network: -3, hardshipAll: 1 },
  }),
  CreateMechanic(12, "修具、恢复生产并偿还互助劳力，不能用军械库存代替民生修复。", [
    CreateHook("RepairTools", "改良地块或推进合作生产", {
      actionsAny: ["improveTile", "selfProduction", "constructionDrive"],
      institutionsAny: ["Cooperative", "Arsenal"],
    }),
    CreateHook("SupportOverworkedFamilies", "救济或走访透支劳力家庭", { actionsAny: ["relief", "organize"] }),
    CreateHook("CivilianProductionFirst", "避免用连续军事行动挤占恢复", {
      meterAtMost: { id: "exposure", value: 66 },
      avoidActions: ["emergencySupply"],
      requireAll: true,
    }),
  ], {
    applyTurn: 13,
    text: "八月未修工具和透支劳力直接形成秋收缺口，粮食与村庄生计再次承压。",
    effects: { grain: -3, hardshipAll: 2, livelihoodAll: -1 },
  }),
  CreateMechanic(13, "分仓、错峰收割并保障受灾与寄居家庭的基本份额。", [
    CreateHook("HarvestProduction", "组织秋收生产与地块改良", {
      actionsAny: ["selfProduction", "improveTile"],
      institutionsAny: ["Cooperative"],
    }),
    CreateHook("ProtectHarvestHouseholds", "走访或救济困难住户", { actionsAny: ["organize", "relief"] }),
    CreateHook("LimitHarvestDiversion", "控制紧急调运和暴露", {
      meterAtMost: { id: "exposure", value: 68 },
      avoidActions: ["emergencySupply"],
      requireAll: true,
    }),
  ], {
    applyTurn: 15,
    text: "九月秋粮保护不足使冬季机构转移缺少口粮，困难家庭再次承受缺口。",
    effects: { grain: -3, hardshipAll: 2, people: -2 },
  }),
  CreateMechanic(14, "用多方消息核验失踪原因，隔离风险区段，同时保护亲属与同路人。", [
    CreateHook("VerifyMissingCarrier", "侦察并核验交通线索", { actionsAny: ["recon"] }),
    CreateHook("IsolateTrafficSegment", "维持分段交通站", {
      actionsAny: ["buildStation", "constructionDrive"],
      institutionsAny: ["Station"],
    }),
    CreateHook("ProtectRelatives", "走访或救济受牵连家庭", { actionsAny: ["organize", "relief"] }),
  ], {
    applyTurn: 15,
    text: "十月对失踪线索的误判扩大猜疑，冬季搜索更容易沿受损交通网逼近机构。",
    effects: { network: -5, exposure: 7, unity: -2 },
  }),
  CreateMechanic(15, "拆分药箱、记录与照护名单，优先转移重病者和暴露机构。", [
    CreateHook("EvacuateWinterThreat", "对预警方向实施保护性疏散", {
      actionsAny: ["evacuate"],
      requiresWarningTarget: true,
    }),
    CreateHook("DisperseInstitutions", "以救护所或交通站维持分散服务", {
      actionsAny: ["buildClinic", "buildStation", "constructionDrive"],
      institutionsAny: ["Clinic", "Station"],
    }),
    CreateHook("MaintainMinimumCare", "救济或整训救护", { actionsAny: ["relief", "rest", "organize"] }),
  ], {
    applyTurn: 16,
    text: "十一月机构转移和最低照护没有恢复，年末仍有病户、药品和公共服务缺口。",
    effects: { people: -4, medicine: -2, livelihoodAll: -2, hardshipAll: 2 },
  }),
  CreateMechanic(16, "核对人民去向、机构、粮药和交通，把未完成责任带入下一阶段。", [
    CreateHook("YearEndRelief", "继续救济、走访或整训救护", { actionsAny: ["relief", "organize", "rest"] }),
    CreateHook("InstitutionsRemain", "至少保存两个专业机构", { minimumInstitutions: 2 }),
    CreateHook("NetworkRemainsHidden", "控制年末暴露并保存交通", {
      meterAtMost: { id: "exposure", value: 70 },
      institutionsAny: ["Station", "Tunnels"],
      requireAll: true,
    }),
  ]),
]);

const mechanicByTurn = new Map(historicalEventMechanics.map((definition) => [definition.turn, definition]));

export function CreateHistoricalEventState() {
  return {
    schemaVersion: 1,
    resolved: [],
    pendingConsequences: [],
    appliedConsequences: [],
  };
}

export function EnsureHistoricalEventState(state) {
  if (!state.eventState || typeof state.eventState !== "object") {
    state.eventState = CreateHistoricalEventState();
  }
  state.eventState.schemaVersion = 1;
  state.eventState.resolved = Array.isArray(state.eventState.resolved)
    ? state.eventState.resolved
    : [];
  state.eventState.pendingConsequences = Array.isArray(state.eventState.pendingConsequences)
    ? state.eventState.pendingConsequences
    : [];
  state.eventState.appliedConsequences = Array.isArray(state.eventState.appliedConsequences)
    ? state.eventState.appliedConsequences
    : [];
  return state.eventState;
}

export function GetHistoricalEventMechanic(turn) {
  return mechanicByTurn.get(Number(turn)) || null;
}

function EvaluateHook(state, hook, actionIds, orders, context) {
  const checks = [];
  const evidence = {
    objectiveAction: false,
    structural: false,
    restraint: false,
  };
  if (hook.actionsAny.length > 0) {
    let actionMatched = HasAction(actionIds, hook.actionsAny);
    if (actionMatched && hook.requiresWarningTarget) {
      const warningTargetIds = new Set(context.warningTargetIds || []);
      actionMatched = orders.some((order) => hook.actionsAny.includes(order.actionId)
        && warningTargetIds.has(order.targetHexId || order.hexId));
    }
    checks.push(actionMatched);
    evidence.objectiveAction = actionMatched;
  }
  if (hook.institutionsAny.length > 0) {
    const institutionMatched = HasInstitution(state, hook.institutionsAny);
    checks.push(institutionMatched);
    evidence.structural ||= institutionMatched;
  }
  if (hook.meterAtMost) {
    const meterMatched = Number(state.meters?.[hook.meterAtMost.id] || 0) <= hook.meterAtMost.value;
    checks.push(meterMatched);
    evidence.structural ||= meterMatched;
  }
  if (hook.minimumInstitutions > 0) {
    const institutionCountMatched = CountInstitutions(state) >= hook.minimumInstitutions;
    checks.push(institutionCountMatched);
    evidence.structural ||= institutionCountMatched;
  }
  if (hook.avoidActions.length > 0) {
    const restraintMatched = !HasAction(actionIds, hook.avoidActions);
    checks.push(restraintMatched);
    evidence.restraint = restraintMatched;
  }
  return {
    met: checks.length > 0 && (hook.requireAll ? checks.every(Boolean) : checks.some(Boolean)),
    evidence,
  };
}

function IsObjectiveOrder(order, hooks, context) {
  return hooks.some((hook) => {
    if (!hook.actionsAny.includes(order.actionId)) {
      return false;
    }
    if (!hook.requiresWarningTarget) {
      return true;
    }
    const warningTargetIds = new Set(context.warningTargetIds || []);
    return warningTargetIds.has(order.targetHexId || order.hexId);
  });
}

export function GetHistoricalEventPreview(state, turn = state?.turn, orders = state?.orders || [], context = {}) {
  const mechanic = GetHistoricalEventMechanic(turn);
  const narrative = GetHistoricalTurnNarrative(Number(turn));
  if (!mechanic || !narrative) {
    return null;
  }
  const actionIds = new Set(orders.map((order) => order.actionId));
  const hooks = mechanic.hooks.map((hook) => {
    const evaluation = EvaluateHook(state, hook, actionIds, orders, context);
    return {
      id: hook.id,
      label: hook.label,
      met: evaluation.met,
      evidence: evaluation.evidence,
    };
  });
  const relevantOrderCount = orders.filter((order) => IsObjectiveOrder(order, mechanic.hooks, context)).length;
  const objectiveActionCount = hooks.filter((hook) => hook.evidence.objectiveAction).length;
  const structuralEvidenceCount = hooks.filter((hook) => hook.evidence.structural).length;
  const restraintEvidenceCount = hooks.filter((hook) => hook.evidence.restraint).length;
  const hasRelevantDeployment = relevantOrderCount > 0 && objectiveActionCount > 0;
  return {
    turn: mechanic.turn,
    eventId: narrative.event.id,
    title: narrative.event.title,
    synopsis: narrative.event.synopsis,
    objective: mechanic.objective,
    hooks,
    orderCount: orders.length,
    relevantOrderCount,
    irrelevantOrderCount: orders.length - relevantOrderCount,
    objectiveActionCount,
    structuralEvidenceCount,
    restraintEvidenceCount,
    hasRelevantDeployment,
    hasOnlyIrrelevantOrders: orders.length > 0 && !hasRelevantDeployment,
    hasDeployment: hasRelevantDeployment,
    metCount: hooks.filter((hook) => hook.met).length,
    requiredCount: mechanic.protectedMinimum,
  };
}

function ApplyImmediateProtectedEffect(state) {
  state.meters.people = Clamp((state.meters.people || 0) + 1, 0, maximumMeter);
  state.meters.unity = Clamp((state.meters.unity || 0) + 1, 0, maximumMeter);
  state.meters.discipline = Clamp((state.meters.discipline || 0) + 1, 0, maximumMeter);
}

export function ResolveHistoricalEvent(state, turn, orders = [], context = {}) {
  const eventState = EnsureHistoricalEventState(state);
  const existing = eventState.resolved.find((entry) => entry.turn === Number(turn));
  if (existing) {
    return existing;
  }
  const preview = GetHistoricalEventPreview(state, turn, orders, context);
  const mechanic = GetHistoricalEventMechanic(turn);
  const narrative = GetHistoricalTurnNarrative(Number(turn));
  if (!preview || !mechanic || !narrative) {
    return null;
  }

  const outcomeId = preview.hasOnlyIrrelevantOrders
    ? "Neglected"
    : preview.hasRelevantDeployment
        && preview.structuralEvidenceCount >= 1
        && preview.metCount >= mechanic.protectedMinimum
      ? "Protected"
      : preview.hasRelevantDeployment || preview.structuralEvidenceCount >= 2
        ? "Partial"
        : "Neglected";
  const outcomeLabel = outcomeId === "Protected"
    ? "责任落实"
    : outcomeId === "Partial"
      ? "部分落实"
      : "责任缺口";
  const matchedHooks = preview.hooks.filter((hook) => hook.met);
  const missedHooks = preview.hooks.filter((hook) => !hook.met);
  const consequenceId = outcomeId === "Neglected" && mechanic.missedConsequence
    ? `${narrative.event.id}_DueT${mechanic.missedConsequence.applyTurn}`
    : null;
  const result = {
    turn: Number(turn),
    date: narrative.date,
    eventId: narrative.event.id,
    title: narrative.event.title,
    outcomeId,
    outcomeLabel,
    summary: outcomeId === "Protected"
      ? `本月已落实：${matchedHooks.map((hook) => hook.label).join("；")}。`
      : outcomeId === "Partial"
        ? `本月只落实了“${matchedHooks[0]?.label || "一项准备"}”，仍缺：${missedHooks.map((hook) => hook.label).join("；")}。`
        : `本月没有把档案责任转成有效部署，缺口为：${missedHooks.map((hook) => hook.label).join("；")}。`,
    choice: {
      actionIds: [...new Set(orders.map((order) => order.actionId))],
      targetHexIds: [...new Set(orders.map((order) => order.targetHexId || order.hexId).filter(Boolean))],
      policyIds: [...(state.policies || [])],
    },
    matchedHookIds: matchedHooks.map((hook) => hook.id),
    missedHookIds: missedHooks.map((hook) => hook.id),
    evidence: preview.hooks,
    consequenceIds: consequenceId ? [consequenceId] : [],
  };
  eventState.resolved.push(result);

  if (outcomeId === "Protected") {
    ApplyImmediateProtectedEffect(state);
  } else if (outcomeId === "Neglected" && mechanic.missedConsequence) {
    eventState.pendingConsequences.push({
      id: consequenceId,
      sourceEventId: narrative.event.id,
      sourceTurn: Number(turn),
      sourceDate: narrative.date,
      sourceTitle: narrative.event.title,
      applyTurn: mechanic.missedConsequence.applyTurn,
      text: mechanic.missedConsequence.text,
      effects: { ...mechanic.missedConsequence.effects },
    });
  }

  state.log.push(`${narrative.date}任务事件“${narrative.event.title}”：${outcomeLabel}。${result.summary}`);
  return result;
}

function ApplyEffects(state, effects) {
  const resourceIds = ["grain", "arms", "medicine", "intel", "cadres"];
  const meterIds = ["people", "exposure", "contribution", "network", "unity", "discipline"];
  for (const resourceId of resourceIds) {
    if (Number.isFinite(Number(effects[resourceId]))) {
      state.resources[resourceId] = Clamp(
        (state.resources[resourceId] || 0) + Number(effects[resourceId]),
        0,
        maximumResource,
      );
    }
  }
  for (const meterId of meterIds) {
    if (Number.isFinite(Number(effects[meterId]))) {
      state.meters[meterId] = Clamp(
        (state.meters[meterId] || 0) + Number(effects[meterId]),
        0,
        meterId === "contribution" ? 999 : maximumMeter,
      );
    }
  }
  for (const village of (state.hexes || []).filter(IsVillage)) {
    if (Number.isFinite(Number(effects.hardshipAll))) {
      village.hardship = Clamp(village.hardship + Number(effects.hardshipAll), 0, maximumMeter);
    }
    if (Number.isFinite(Number(effects.livelihoodAll))) {
      village.livelihood = Clamp(village.livelihood + Number(effects.livelihoodAll), 0, maximumMeter);
    }
    if (Number.isFinite(Number(effects.warningIntensity)) && village.warning?.turn === state.turn) {
      village.warning.intensity = Clamp(
        village.warning.intensity + Number(effects.warningIntensity),
        1,
        4,
      );
    }
  }
}

export function ApplyDueHistoricalConsequences(state, turn = state?.turn) {
  const eventState = EnsureHistoricalEventState(state);
  const due = eventState.pendingConsequences.filter((entry) => entry.applyTurn === Number(turn));
  if (due.length === 0) {
    return [];
  }
  const dueIds = new Set(due.map((entry) => entry.id));
  eventState.pendingConsequences = eventState.pendingConsequences.filter((entry) => !dueIds.has(entry.id));
  if (!state.ledger.historicalConsequences) {
    state.ledger.historicalConsequences = [];
  }
  const appliedEntries = [];
  for (const consequence of due) {
    ApplyEffects(state, consequence.effects || {});
    const narrative = GetHistoricalTurnNarrative(Number(turn));
    const applied = {
      ...consequence,
      turn: Number(turn),
      date: narrative?.date || `第${turn}回合`,
      type: "HistoricalConsequence",
      responsibilityNote: "遗漏会增加风险，但侵略、封锁与破坏的责任仍属于实施者；本记录不把受害归咎于群众。",
    };
    eventState.appliedConsequences.push(applied);
    state.ledger.historicalConsequences.push(applied);
    state.log.push(`${applied.date}延迟后果：${applied.text}`);
    appliedEntries.push(applied);
  }
  return appliedEntries;
}

export function GetResolvedHistoricalEvent(state, turn) {
  return EnsureHistoricalEventState(state).resolved.find((entry) => entry.turn === Number(turn)) || null;
}

export function GetHistoricalEventOutcomeCounts(state) {
  const counts = { Protected: 0, Partial: 0, Neglected: 0 };
  for (const entry of EnsureHistoricalEventState(state).resolved) {
    if (Object.hasOwn(counts, entry.outcomeId)) {
      counts[entry.outcomeId] += 1;
    }
  }
  return counts;
}
