import {
  GetOperationInteraction,
  GetOperationLayout,
  GetOperationLayoutByCampaignIndex,
} from "./Data_Operations.mjs";

function Clone(value) {
  return structuredClone(value);
}

function Unique(values) {
  return [...new Set(values)];
}

function MatchesRequirements(flags, requirements = {}) {
  const allFlags = requirements.allFlags ?? [];
  const anyFlags = requirements.anyFlags ?? [];
  const noneFlags = requirements.noneFlags ?? [];
  return (
    allFlags.every((flag) => flags[flag]) &&
    (anyFlags.length === 0 || anyFlags.some((flag) => flags[flag])) &&
    noneFlags.every((flag) => !flags[flag])
  );
}

function ApplyList(target, values = []) {
  return Unique([...target, ...values]);
}

const emergencyDurationMultiplier = 1.75;
const emergencyNoiseRadius = 18;

function HasDeploymentManifest(runtime) {
  return Array.isArray(runtime?.deployedActorIds);
}

export function IsActorAllowed(runtime, interaction, actorId = null) {
  if (!actorId) return !(interaction?.allowedRoles?.length > 0);

  const deployedActorIds = HasDeploymentManifest(runtime) ? runtime.deployedActorIds : null;
  if (deployedActorIds && !deployedActorIds.includes(actorId)) return false;

  const allowedRoles = interaction?.allowedRoles ?? [];
  if (allowedRoles.length === 0) return true;
  if (allowedRoles.includes(actorId)) return true;

  // Old standalone runtimes have no deployment manifest, so they preserve the strict
  // specialist contract. Live deployments always write the manifest in PrepareMissionFromCamp.
  if (!deployedActorIds) return false;
  const specialistDeployed = allowedRoles.some((roleId) => deployedActorIds.includes(roleId));
  return !specialistDeployed && deployedActorIds.length > 0;
}

function IsEmergencyExecution(runtime, interaction, actorId) {
  return Boolean(
    actorId &&
      interaction?.allowedRoles?.length &&
      !interaction.allowedRoles.includes(actorId) &&
      IsActorAllowed(runtime, interaction, actorId),
  );
}

function GetInteractionForActor(runtime, interaction, actorId) {
  if (!IsEmergencyExecution(runtime, interaction, actorId)) {
    return { ...interaction, emergencyExecution: false };
  }
  return {
    ...interaction,
    duration: interaction.duration * emergencyDurationMultiplier,
    emergencyExecution: true,
    emergencyNoise: {
      kind: "improvisedWork",
      radius: emergencyNoiseRadius,
    },
  };
}

function ApplyEffects(state, effects = {}) {
  for (const flag of effects.setFlags ?? []) state.flags[flag] = true;
  for (const flag of effects.clearFlags ?? []) state.flags[flag] = false;

  state.disabledLighting = ApplyList(state.disabledLighting, effects.disableLighting);
  state.blockedRoutes = ApplyList(state.blockedRoutes, effects.blockRoutes);
  state.soundMasks = ApplyList(state.soundMasks, effects.addSoundMasks);
  state.concealmentZones = ApplyList(state.concealmentZones, effects.addConcealmentZones);
  state.unlockedExtractions = ApplyList(state.unlockedExtractions, effects.unlockExtractions);
  state.revealedIntel = ApplyList(state.revealedIntel, effects.revealIntel);
  state.activeCivilianRoutes = ApplyList(state.activeCivilianRoutes, effects.startCivilianRoutes);
  state.disabledReinforcements = ApplyList(
    state.disabledReinforcements,
    effects.disableReinforcements,
  );
  state.enabledReinforcements = ApplyList(
    state.enabledReinforcements,
    effects.enableReinforcements,
  );
  state.completedObjectives = ApplyList(state.completedObjectives, effects.completeObjectives);

  if (effects.setPatrolRoutes) {
    Object.assign(state.patrolRouteOverrides, effects.setPatrolRoutes);
  }
  if (Number.isFinite(effects.delayReinforcements)) {
    state.reinforcementDelaySeconds += Math.max(0, effects.delayReinforcements);
  }
  if (effects.addCivilianCosts) {
    for (const key of ["risk", "harm", "displacement"]) {
      const cost = Math.max(0, Number(effects.addCivilianCosts[key]) || 0);
      state.civilianCostLedger[key] += cost;
    }
  }
  for (const event of effects.emitEvents ?? []) {
    state.events.push({ atSeconds: state.elapsedSeconds, event });
  }
}

export function CreateOperationRuntime(operationIdOrIndex = 0, deployedActorIds = null) {
  const operation =
    typeof operationIdOrIndex === "number"
      ? GetOperationLayoutByCampaignIndex(operationIdOrIndex)
      : GetOperationLayout(operationIdOrIndex);
  if (!operation) throw new Error(`Unknown operation: ${operationIdOrIndex}`);

  return {
    operationId: operation.id,
    operationDataVersion: 1,
    deployedActorIds: Array.isArray(deployedActorIds) ? Unique(deployedActorIds) : null,
    elapsedSeconds: 0,
    flags: {},
    completedObjectives: [],
    completedInteractions: [],
    completedInteractableIds: [],
    carriedItems: {},
    droppedItems: [],
    extractedActors: [],
    disabledLighting: [],
    blockedRoutes: [],
    soundMasks: [],
    concealmentZones: [],
    unlockedExtractions: operation.extractionZones
      .filter((zone) => zone.unlocked)
      .map((zone) => zone.id),
    revealedIntel: [],
    activeCivilianRoutes: [],
    completedCivilianRoutes: [],
    emergencyNoiseEvents: [],
    disabledReinforcements: [],
    enabledReinforcements: [],
    reinforcementDelaySeconds: 0,
    patrolRouteOverrides: {},
    civilianCostLedger: { risk: 0, harm: 0, displacement: 0 },
    events: [{ atSeconds: 0, event: "operationStarted" }],
    firedScheduledEventIndexes: [],
  };
}

export function GetAvailableOperationInteractions(runtime, actorId = null) {
  const operation = GetOperationLayout(runtime.operationId);
  if (!operation) return [];
  return operation.environmentInteractions
    .filter((interaction) => {
      if (runtime.completedInteractions.includes(interaction.id)) return false;
      if (runtime.completedInteractableIds?.includes(interaction.interactableId)) return false;
      if (actorId && !IsActorAllowed(runtime, interaction, actorId)) return false;
      return MatchesRequirements(runtime.flags, interaction.requirements);
    })
    .map((interaction) => GetInteractionForActor(runtime, interaction, actorId));
}

export function GetAvailableInteractionForInteractable(
  runtime,
  interactableId,
  actorId = null,
) {
  return (
    GetAvailableOperationInteractions(runtime, actorId).find(
      (interaction) => interaction.interactableId === interactableId,
    ) ?? null
  );
}

export function ResolveOperationInteraction(runtime, interactionId, actorId = null) {
  const operation = GetOperationLayout(runtime.operationId);
  if (!operation) return { ok: false, reason: "unknownOperation", state: Clone(runtime) };

  const authoredInteraction = GetOperationInteraction(operation.id, interactionId);
  if (!authoredInteraction) return { ok: false, reason: "unknownInteraction", state: Clone(runtime) };
  const interaction = GetInteractionForActor(runtime, authoredInteraction, actorId);
  if (runtime.completedInteractions.includes(interactionId)) {
    return { ok: false, reason: "alreadyCompleted", state: Clone(runtime) };
  }
  if (runtime.completedInteractableIds?.includes(interaction.interactableId)) {
    return { ok: false, reason: "interactableAlreadyUsed", state: Clone(runtime) };
  }
  if (!IsActorAllowed(runtime, authoredInteraction, actorId)) {
    return { ok: false, reason: "wrongActor", state: Clone(runtime) };
  }
  if (!MatchesRequirements(runtime.flags, interaction.requirements)) {
    return { ok: false, reason: "requirementsNotMet", state: Clone(runtime) };
  }
  if ((interaction.effects.startCarryItems?.length ?? 0) > 0 && !actorId) {
    return { ok: false, reason: "carrierRequired", state: Clone(runtime) };
  }

  const next = Clone(runtime);
  next.completedInteractions.push(interactionId);
  next.completedInteractableIds ??= [];
  next.completedInteractableIds.push(interaction.interactableId);
  ApplyEffects(next, interaction.effects);
  for (const itemId of interaction.effects.startCarryItems ?? []) {
    next.carriedItems[itemId] = actorId;
  }
  if (interaction.emergencyExecution) {
    next.emergencyNoiseEvents ??= [];
    const noiseEvent = {
      atSeconds: next.elapsedSeconds,
      event: "emergencyWorkNoise",
      interactionId,
      actorId,
      kind: interaction.emergencyNoise.kind,
      radius: interaction.emergencyNoise.radius,
    };
    next.emergencyNoiseEvents.push(noiseEvent);
    next.events.push(noiseEvent);
  }
  next.events.push({
    atSeconds: next.elapsedSeconds,
    event: "interactionCompleted",
    interactionId,
    actorId,
  });
  return { ok: true, reason: null, state: next, interaction };
}

export function ExtractOperationCarrier(runtime, actorId) {
  const next = Clone(runtime);
  next.extractedActors = ApplyList(next.extractedActors, [actorId]);
  for (const [itemId, carrierId] of Object.entries(next.carriedItems)) {
    if (carrierId !== actorId) continue;
    next.completedObjectives = ApplyList(next.completedObjectives, [itemId]);
    next.events.push({
      atSeconds: next.elapsedSeconds,
      event: "carriedObjectiveExtracted",
      itemId,
      actorId,
    });
    delete next.carriedItems[itemId];
  }
  return next;
}

export function DropOperationCarrierItems(runtime, actorId, position) {
  const next = Clone(runtime);
  for (const [itemId, carrierId] of Object.entries(next.carriedItems)) {
    if (carrierId !== actorId) continue;
    next.droppedItems.push({
      itemId,
      x: Number(position?.x) || 0,
      z: Number(position?.z) || 0,
    });
    next.events.push({
      atSeconds: next.elapsedSeconds,
      event: "carriedObjectiveDropped",
      itemId,
      actorId,
    });
    delete next.carriedItems[itemId];
  }
  return next;
}

export function PickUpDroppedOperationItem(runtime, itemId, actorId) {
  const next = Clone(runtime);
  const droppedIndex = next.droppedItems.findIndex((item) => item.itemId === itemId);
  if (droppedIndex < 0 || !actorId) {
    return { ok: false, reason: droppedIndex < 0 ? "itemNotDropped" : "carrierRequired", state: next };
  }
  next.droppedItems.splice(droppedIndex, 1);
  next.carriedItems[itemId] = actorId;
  next.events.push({
    atSeconds: next.elapsedSeconds,
    event: "droppedObjectiveRecovered",
    itemId,
    actorId,
  });
  return { ok: true, reason: null, state: next };
}

export function CompleteCivilianRoute(runtime, routeId) {
  const operation = GetOperationLayout(runtime.operationId);
  const route = operation?.civilianRoutes.find((candidate) => candidate.id === routeId);
  if (!route || !runtime.activeCivilianRoutes.includes(routeId)) {
    return { ok: false, reason: "routeNotActive", state: Clone(runtime) };
  }
  if (runtime.completedCivilianRoutes.includes(routeId)) {
    return { ok: false, reason: "alreadyCompleted", state: Clone(runtime) };
  }

  const next = Clone(runtime);
  next.completedCivilianRoutes.push(routeId);
  next.events.push({ atSeconds: next.elapsedSeconds, event: "civilianRouteCompleted", routeId });
  for (const interaction of operation.environmentInteractions) {
    const deferred = interaction.deferredEffects;
    if (
      deferred?.whenRouteComplete === routeId &&
      next.completedInteractions.includes(interaction.id)
    ) {
      ApplyEffects(next, deferred);
    }
  }
  for (const routeObjective of operation.civilianRouteObjectives ?? []) {
    if (
      !next.completedObjectives.includes(routeObjective.objectiveId) &&
      routeObjective.routeIds.every((id) => next.completedCivilianRoutes.includes(id))
    ) {
      next.completedObjectives = ApplyList(next.completedObjectives, [routeObjective.objectiveId]);
      next.events.push({
        atSeconds: next.elapsedSeconds,
        event: "civilianRouteObjectiveCompleted",
        objectiveId: routeObjective.objectiveId,
      });
    }
  }
  return { ok: true, reason: null, state: next };
}

export function AdvanceOperationClock(runtime, deltaSeconds) {
  const operation = GetOperationLayout(runtime.operationId);
  if (!operation) return Clone(runtime);

  const next = Clone(runtime);
  next.elapsedSeconds += Math.max(0, Number(deltaSeconds) || 0);
  operation.scheduledEvents.forEach((scheduledEvent, index) => {
    if (next.firedScheduledEventIndexes.includes(index)) return;
    if (next.elapsedSeconds < scheduledEvent.atSeconds) return;
    if (scheduledEvent.unlessFlag && next.flags[scheduledEvent.unlessFlag]) {
      next.firedScheduledEventIndexes.push(index);
      return;
    }
    if (scheduledEvent.requiresFlag && !next.flags[scheduledEvent.requiresFlag]) return;
    for (const flag of scheduledEvent.setFlags ?? []) next.flags[flag] = true;
    next.events.push({ atSeconds: scheduledEvent.atSeconds, event: scheduledEvent.event });
    next.firedScheduledEventIndexes.push(index);
  });
  return next;
}

export function GetOperationIntegrationSnapshot(runtime) {
  const operation = GetOperationLayout(runtime.operationId);
  if (!operation) return null;
  return {
    missionDefinition: {
      id: operation.id,
      title: "山火 · 一九四一",
      operation: operation.name,
      date: `${operation.date} · ${operation.timeOfDay}`,
      location: operation.location,
      summary: operation.summary,
      historicalBoundary: operation.historicalBoundary,
      bounds: operation.bounds,
      playerSpawns: operation.playerSpawns,
      camera: operation.camera,
      extractionZones: operation.extractionZones.map((zone) => ({
        ...zone,
        unlocked: runtime.unlockedExtractions.includes(zone.id),
      })),
      zones: operation.zones,
      lightingZones: operation.lightingZones,
      obstacles: operation.obstacles,
      interactables: operation.interactables,
      patrols: operation.patrols,
      enemies: operation.enemies,
    },
    environment: {
      disabledLighting: [...runtime.disabledLighting],
      blockedRoutes: [...runtime.blockedRoutes],
      soundMasks: [...runtime.soundMasks],
      concealmentZones: [...runtime.concealmentZones],
      patrolRouteOverrides: { ...runtime.patrolRouteOverrides },
      disabledReinforcements: [...runtime.disabledReinforcements],
      enabledReinforcements: [...runtime.enabledReinforcements],
      reinforcementDelaySeconds: runtime.reinforcementDelaySeconds,
    },
    objectives: {
      definitions: operation.objectives,
      completed: [...runtime.completedObjectives],
      carriedItems: { ...runtime.carriedItems },
      droppedItems: runtime.droppedItems.map((item) => ({ ...item })),
    },
    civilians: {
      routes: operation.civilianRoutes,
      activeRoutes: [...runtime.activeCivilianRoutes],
      completedRoutes: [...runtime.completedCivilianRoutes],
      costLedger: { ...runtime.civilianCostLedger },
    },
  };
}
