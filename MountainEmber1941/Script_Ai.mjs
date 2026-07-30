import { GetEnemyRoleDefinition } from "./Data_Characters.mjs";
import { missionDefinition as legacyMissionDefinition } from "./Data_Mission.mjs";
import { GetOperationLayout } from "./Data_Operations.mjs";
import {
  CalculateAwarenessRate,
  CanSee,
  Clamp,
  Distance,
  FindPath2D,
  GetCoverAt,
  GetMissionDefinitionForState,
  GetTacticalDistance,
  HearSound,
  IsNavigationBlocked,
  NormalizeAngle,
  PointInsideBox,
  SetActiveMissionDefinition,
  simulationConfig,
} from "./Script_Rules.mjs";

let activeMissionDefinition = legacyMissionDefinition;

function UseMissionDefinition(state) {
  const definition = GetMissionDefinitionForState(state) ?? legacyMissionDefinition;
  activeMissionDefinition = {
    ...definition,
    obstacles: [
      ...definition.obstacles,
      ...(state?.environment?.dynamicObstacles ?? []),
    ],
  };
  SetActiveMissionDefinition(activeMissionDefinition);
  return activeMissionDefinition;
}

function GetActivePatrol(patrolId) {
  return activeMissionDefinition.patrols.find((patrol) => patrol.id === patrolId) ?? null;
}

function GetObstaclePenetration(position) {
  let penetration = 0;
  for (const obstacle of activeMissionDefinition.obstacles) {
    if (!PointInsideBox(position, obstacle, 0.45)) continue;
    const minimumX = obstacle.x - obstacle.width * 0.5 - 0.45;
    const maximumX = obstacle.x + obstacle.width * 0.5 + 0.45;
    const minimumZ = obstacle.z - obstacle.depth * 0.5 - 0.45;
    const maximumZ = obstacle.z + obstacle.depth * 0.5 + 0.45;
    penetration += Math.min(position.x - minimumX, maximumX - position.x, position.z - minimumZ, maximumZ - position.z);
  }
  return penetration;
}

export function MoveToward(actor, target, speed, deltaTime) {
  const navigation = actor.navigation ?? {
    targetX: Number.NaN,
    targetZ: Number.NaN,
    waypoints: [],
    waypointIndex: 0,
    replanTimer: 0,
    stallTime: 0,
  };
  actor.navigation = navigation;
  navigation.replanTimer -= deltaTime;
  const targetChanged = Math.hypot(target.x - navigation.targetX, target.z - navigation.targetZ) > 0.75;
  if (targetChanged || navigation.waypointIndex >= navigation.waypoints.length || navigation.replanTimer <= 0 || navigation.stallTime > 0.8) {
    navigation.targetX = target.x;
    navigation.targetZ = target.z;
    navigation.waypoints = FindPath2D(actor, target);
    navigation.waypointIndex = 0;
    navigation.replanTimer = 1.5;
    navigation.stallTime = 0;
  }
  if (navigation.waypoints.length === 0) return false;
  const waypoint = navigation.waypoints[navigation.waypointIndex];
  const deltaX = waypoint.x - actor.x;
  const deltaZ = waypoint.z - actor.z;
  const distance = Math.hypot(deltaX, deltaZ);
  if (distance < 0.16) {
    navigation.waypointIndex += 1;
    navigation.stallTime = 0;
    return navigation.waypointIndex >= navigation.waypoints.length;
  }
  const step = Math.min(distance, speed * deltaTime);
  const directionX = deltaX / distance;
  const directionZ = deltaZ / distance;
  const candidate = { x: actor.x + directionX * step, z: actor.z + directionZ * step };
  const currentPenetration = GetObstaclePenetration(actor);
  const candidatePenetration = GetObstaclePenetration(candidate);
  if (!IsNavigationBlocked(candidate) || (currentPenetration > 0 && candidatePenetration < currentPenetration)) {
    actor.x = candidate.x;
    actor.z = candidate.z;
    navigation.stallTime = 0;
  } else {
    navigation.stallTime += deltaTime;
  }
  actor.facing = Math.atan2(deltaX, deltaZ);
  if (distance <= step + 0.16) {
    navigation.waypointIndex += 1;
    return navigation.waypointIndex >= navigation.waypoints.length;
  }
  return false;
}

function GetNearestVisibleUnit(enemy, state) {
  let best = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const unit of state.units) {
    if (["downed", "dead", "evacuated", "unavailable"].includes(unit.state)) continue;
    if (!CanSee(enemy, unit)) continue;
    const distance = GetTacticalDistance(enemy, unit, activeMissionDefinition);
    if (distance < bestDistance) {
      best = unit;
      bestDistance = distance;
    }
  }
  return best;
}

function GetNearestVisibleBody(enemy, state) {
  return state.enemies
    .filter(
      (candidate) =>
        candidate.id !== enemy.id &&
        candidate.disabled &&
        !candidate.bodyHidden &&
        !candidate.bodyDiscovered &&
        CanSee(enemy, candidate),
    )
    .sort(
      (left, right) =>
        GetTacticalDistance(enemy, left, activeMissionDefinition) -
        GetTacticalDistance(enemy, right, activeMissionDefinition),
    )[0] ?? null;
}

function PushMessage(state, kind, text) {
  const previous = state.messages[state.messages.length - 1];
  if (previous?.text === text && state.time - previous.time < 2) return;
  state.messages.push({ time: state.time, kind, text });
  if (state.messages.length > 30) state.messages.shift();
}

function GetCampSuspicionHoldSeconds(state) {
  const signature = Math.max(0, state.environment?.campSignature ?? 0);
  return signature > 0 ? 18 + signature * 6 : 0;
}

function GetAuthoredReinforcementRoute(state) {
  const layout = GetOperationLayout(state.operationLayoutId);
  const runtime = state.operationRuntime;
  if (!layout?.reinforcementRoutes?.length) return null;
  return layout.reinforcementRoutes
    .filter((route) => {
      if (runtime?.disabledReinforcements?.includes(route.id)) return false;
      if (route.disabledByFlag && runtime?.flags?.[route.disabledByFlag]) return false;
      if (
        route.enabledByFlag &&
        !runtime?.flags?.[route.enabledByFlag] &&
        !runtime?.enabledReinforcements?.includes(route.id)
      ) return false;
      return true;
    })
    .sort((left, right) => left.arrivalSeconds - right.arrivalSeconds)[0] ?? null;
}

function RaiseLocalAlarm(enemy, state) {
  if (enemy.radioed) return;
  enemy.radioed = true;
  state.alertLevel = Math.max(state.alertLevel, 2);
  state.alarmState = state.environment.alarmBellDisabled ? "shouted" : "alarm";
  state.ledger.alarmsRaised += 1;
  const communicationsDisrupted =
    state.objectives.relay ||
    state.environment.eastRoadBlocked ||
    (state.environment.disabledReinforcements?.length ?? 0) > 0;
  const authoredDelay = Math.max(0, state.environment.reinforcementDelaySeconds ?? 0);
  const authoredRoute = GetAuthoredReinforcementRoute(state);
  state.activeReinforcementRouteId = authoredRoute?.id ?? null;
  state.reinforcementTimer =
    (authoredRoute?.arrivalSeconds ??
      (communicationsDisrupted
        ? simulationConfig.reinforcementCutlineSeconds
        : simulationConfig.reinforcementSeconds)) + authoredDelay;
  for (const ally of state.enemies) {
    if (ally.disabled || ally.health <= 0 || Distance(enemy, ally) > 18) continue;
    ally.lastKnown = enemy.lastKnown ? { ...enemy.lastKnown } : { x: enemy.x, z: enemy.z };
    ally.state = ally.state === "combat" ? ally.state : "search";
    ally.searchTimer = Math.max(ally.searchTimer, 12);
  }
  PushMessage(state, "alert", state.objectives.relay ? "敌人发现电话已断，正派步行传令。" : "局部警报已发出，增援正在集结。");
}

function UpdatePerception(enemy, state, deltaTime) {
  const visible = GetNearestVisibleUnit(enemy, state);
  if (visible) {
    const awarenessRate = CalculateAwarenessRate(enemy, visible);
    enemy.awareness = Clamp(enemy.awareness + awarenessRate * deltaTime, 0, 100);
    enemy.lastKnown = { x: visible.x, z: visible.z, time: state.time };
    enemy.target = visible.id;
    enemy.uncertainty = Math.max(0, 2.5 - enemy.awareness * 0.02);
    if (enemy.awareness >= simulationConfig.awarenessConfirm && enemy.state !== "report") {
      enemy.state = "combat";
      state.alertLevel = Math.max(state.alertLevel, 1);
    } else if (enemy.awareness >= simulationConfig.awarenessInvestigate && enemy.state === "patrol") {
      enemy.state = "investigate";
    } else if (enemy.awareness >= simulationConfig.awarenessSuspicious && enemy.state === "patrol") {
      enemy.state = "suspicious";
    }
    return visible;
  }

  const body = GetNearestVisibleBody(enemy, state);
  if (body && !["combat", "report"].includes(enemy.state)) {
    body.bodyDiscovered = true;
    enemy.awareness = Math.max(enemy.awareness, simulationConfig.awarenessInvestigate);
    enemy.lastKnown = { x: body.x, z: body.z, time: state.time };
    enemy.lastHeard = { x: body.x, z: body.z, time: state.time, kind: "body" };
    enemy.uncertainty = 0.6;
    enemy.state = "investigate";
    PushMessage(state, "alert", "巡逻发现一名失能同伴，正在检查周边。");
    return null;
  }

  const campSuspicionSeconds = GetCampSuspicionHoldSeconds(state);
  const campSuspicionActive = enemy.state === "suspicious" && state.time < campSuspicionSeconds;
  const awarenessFloor = campSuspicionActive ? simulationConfig.awarenessSuspicious : 0;
  enemy.awareness = Clamp(
    Math.max(awarenessFloor, enemy.awareness - simulationConfig.awarenessDecay * deltaTime),
    0,
    100,
  );
  if (enemy.state === "combat" && enemy.lastKnown) {
    enemy.state = "search";
    enemy.searchTimer = 16;
  }
  return null;
}

function UpdateHearing(enemy, state) {
  let loudest = null;
  for (const soundEvent of state.soundEvents) {
    if (state.time - soundEvent.createdAt > 2.4) continue;
    const heard = HearSound(enemy, soundEvent, enemy.seedOffset + Math.round(soundEvent.createdAt * 10));
    if (!heard || (loudest && heard.confidence <= loudest.confidence)) continue;
    loudest = heard;
  }
  if (!loudest) return;
  enemy.lastHeard = { x: loudest.x, z: loudest.z, time: state.time, kind: loudest.kind };
  if (["gunshot", "explosion", "body"].includes(loudest.kind)) {
    enemy.awareness = Math.max(enemy.awareness, loudest.kind === "explosion" ? 100 : 72);
    enemy.lastKnown = { x: loudest.x, z: loudest.z, time: state.time };
    if (enemy.state !== "report") {
      enemy.state = enemy.awareness >= 100 ? "combat" : "investigate";
    }
  } else if (!["combat", "report"].includes(enemy.state)) {
    enemy.awareness = Math.max(enemy.awareness, 34 + loudest.confidence * 30);
    enemy.state = "investigate";
  }
}

function UpdatePatrol(enemy, deltaTime) {
  const patrol = GetActivePatrol(enemy.patrol);
  if (!patrol || patrol.points.length === 0) {
    enemy.facing = NormalizeAngle(enemy.facing + deltaTime * 0.18);
    return;
  }
  const role = GetEnemyRoleDefinition(enemy.role);
  const target = patrol.points[enemy.patrolIndex % patrol.points.length];
  if (MoveToward(enemy, target, role.speed * 0.72, deltaTime)) {
    enemy.patrolIndex = (enemy.patrolIndex + 1) % patrol.points.length;
  }
}

function UpdateInvestigate(enemy, state, deltaTime) {
  const role = GetEnemyRoleDefinition(enemy.role);
  const target = enemy.lastHeard ?? enemy.lastKnown;
  if (!target) {
    enemy.state = "patrol";
    return;
  }
  if (MoveToward(enemy, target, role.speed * 0.82, deltaTime)) {
    enemy.state = "search";
    enemy.searchTimer = 10 + (enemy.seedOffset % 7);
  }
}

function UpdateSearch(enemy, state, deltaTime) {
  const role = GetEnemyRoleDefinition(enemy.role);
  enemy.searchTimer -= deltaTime;
  enemy.searchPointTimer = (enemy.searchPointTimer ?? 0) - deltaTime;
  if (
    enemy.lastKnown &&
    (!enemy.searchPoint || enemy.searchPointTimer <= 0 || Distance(enemy, enemy.searchPoint) < 1.2)
  ) {
    enemy.searchPhase = (enemy.searchPhase ?? 0) + 1;
    const roleRadius =
      enemy.coordinationRole === "searcherNear"
        ? 0.7
        : enemy.coordinationRole === "searcherWide"
          ? 4.5
          : enemy.coordinationRole === "cordon"
            ? 7
            : 2.2;
    const radius = roleRadius + Math.max(0.8, enemy.uncertainty ?? 1) + (enemy.searchPhase % 4) * 1.45;
    const angle = enemy.seedOffset * 0.173 + enemy.searchPhase * 2.399;
    const candidate = {
      x: Clamp(
        enemy.lastKnown.x + Math.cos(angle) * radius,
        activeMissionDefinition.bounds.minimumX + 1,
        activeMissionDefinition.bounds.maximumX - 1,
      ),
      z: Clamp(
        enemy.lastKnown.z + Math.sin(angle) * radius,
        activeMissionDefinition.bounds.minimumZ + 1,
        activeMissionDefinition.bounds.maximumZ - 1,
      ),
    };
    enemy.searchPoint = IsNavigationBlocked(candidate) ? { ...enemy.lastKnown } : candidate;
    enemy.searchPointTimer = 4.5;
  }
  if (enemy.searchPoint && Distance(enemy, enemy.searchPoint) > 1) {
    MoveToward(enemy, enemy.searchPoint, role.speed * 0.68, deltaTime);
  } else {
    enemy.facing = NormalizeAngle(enemy.facing + deltaTime * 0.72);
  }
  if (enemy.searchTimer <= 0 && enemy.awareness < simulationConfig.awarenessSuspicious) {
    enemy.state = "return";
    enemy.target = null;
  }
}

function ChooseCoverPoint(enemy, target) {
  let best = null;
  for (const obstacle of activeMissionDefinition.obstacles) {
    if (Distance(enemy, obstacle) > 14) continue;
    const candidates = [
      { x: obstacle.x - obstacle.width * 0.5 - 1, z: obstacle.z },
      { x: obstacle.x + obstacle.width * 0.5 + 1, z: obstacle.z },
      { x: obstacle.x, z: obstacle.z - obstacle.depth * 0.5 - 1 },
      { x: obstacle.x, z: obstacle.z + obstacle.depth * 0.5 + 1 },
    ];
    for (const candidate of candidates) {
      if (IsNavigationBlocked(candidate, activeMissionDefinition.obstacles, activeMissionDefinition.bounds, 0.5)) continue;
      const cover = GetCoverAt(candidate, target);
      if (!cover) continue;
      const score = cover.protection * 12 - Distance(enemy, candidate) * 0.75 + Distance(target, candidate) * 0.08;
      if (!best || score > best.score) best = { ...candidate, score };
    }
  }
  return best ? { x: best.x, z: best.z } : null;
}

export function AssignEnemyCoordinationRoles(state) {
  const active = state.enemies
    .filter((enemy) => !enemy.disabled && enemy.health > 0)
    .sort((left, right) => left.id.localeCompare(right.id));
  const contactSources = active
    .filter((enemy) => enemy.lastKnown)
    .sort((left, right) => (right.lastKnown.time ?? 0) - (left.lastKnown.time ?? 0));
  for (const enemy of active) {
    const nearbySource = contactSources.find(
      (source) => source.id !== enemy.id && Distance(source, enemy) <= 18,
    );
    if (nearbySource && (!enemy.lastKnown || (nearbySource.lastKnown.time ?? 0) > (enemy.lastKnown.time ?? 0))) {
      enemy.sharedContact = { ...nearbySource.lastKnown, sourceId: nearbySource.id };
      if (!enemy.lastKnown && !["combat", "report"].includes(enemy.state)) {
        enemy.lastKnown = { ...enemy.sharedContact, relayed: true };
        enemy.uncertainty = Math.max(2.5, (nearbySource.uncertainty ?? 1) + 1.5);
        enemy.searchTimer = Math.max(enemy.searchTimer ?? 0, 8);
        enemy.state = "search";
      }
    }
    if ((enemy.isolatedUntil ?? 0) > state.time) {
      enemy.coordinationRole = "isolated";
      continue;
    }
    if (enemy.state === "sweep") {
      if (!["searcherNear", "cordon"].includes(enemy.coordinationRole)) enemy.coordinationRole = "cordon";
      continue;
    }
    if (enemy.role === "operator" && !enemy.radioed) enemy.coordinationRole = "reporter";
    else if (enemy.role === "leader") enemy.coordinationRole = "coordinator";
    else enemy.coordinationRole = "reserve";
  }
  const contactGroup = active.filter(
    (enemy) =>
      !["isolated", "reporter"].includes(enemy.coordinationRole) &&
      enemy.state !== "sweep" &&
      (["combat", "search", "investigate"].includes(enemy.state) || enemy.lastKnown || enemy.sharedContact),
  );
  const fieldRoles = ["anchor", "suppressor", "flankerLeft", "flankerRight", "searcherNear", "searcherWide", "cordon"];
  contactGroup
    .filter((enemy) => enemy.role !== "leader")
    .forEach((enemy, index) => {
      enemy.coordinationRole = fieldRoles[index % fieldRoles.length];
      enemy.coordinationSlot = index;
    });
  return active.map((enemy) => ({ id: enemy.id, role: enemy.coordinationRole }));
}

function GetStrategicSweepPoints() {
  return activeMissionDefinition.patrols.flatMap((patrol) => patrol.points);
}

export function UpdateTacticalDirector(state, deltaTime) {
  UseMissionDefinition(state);
  state.tacticalDirector ??= {
    pressure: 0,
    lastProgress: 0,
    lastProgressTime: state.time,
    idleTime: 0,
    sweepCount: 0,
    sweepCooldown: 0,
  };
  const director = state.tacticalDirector;
  const objectiveProgress = Object.entries(state.objectives ?? {}).filter(
    ([objectiveId, complete]) => objectiveId !== "allExtracted" && complete,
  ).length;
  const interactionProgress = Object.values(state.interactables ?? {}).filter((runtime) => runtime.completed).length;
  const progress = objectiveProgress + interactionProgress;
  if (progress > (director.lastProgress ?? 0)) {
    director.lastProgress = progress;
    director.lastProgressTime = state.time;
    director.idleTime = 0;
    director.pressure = Math.max(0, director.pressure - 38);
  } else {
    director.idleTime = (director.idleTime ?? 0) + deltaTime;
    if (director.idleTime > 30) {
      director.pressure = Clamp(
        director.pressure + deltaTime * (0.58 + (state.alertLevel ?? 0) * 0.16),
        0,
        100,
      );
    }
  }
  director.sweepCooldown = Math.max(0, (director.sweepCooldown ?? 0) - deltaTime);
  if (director.pressure < 55 || director.sweepCooldown > 0) return director;
  const sweepPoints = GetStrategicSweepPoints();
  const candidates = state.enemies
    .filter(
      (enemy) =>
        !enemy.disabled &&
        enemy.health > 0 &&
        !["combat", "report", "routed"].includes(enemy.state) &&
        (enemy.isolatedUntil ?? 0) <= state.time,
    )
    .sort((left, right) => left.id.localeCompare(right.id))
    .slice(0, 2);
  candidates.forEach((enemy, index) => {
    const pointIndex = ((director.sweepCount ?? 0) * 3 + index * 7 + enemy.seedOffset) % sweepPoints.length;
    enemy.sweepTarget = { ...sweepPoints[pointIndex] };
    enemy.state = "sweep";
    enemy.searchTimer = 18;
    enemy.coordinationRole = index === 0 ? "searcherNear" : "cordon";
  });
  if (candidates.length > 0) {
    director.sweepCount = (director.sweepCount ?? 0) + 1;
    director.sweepCooldown = 42;
    director.pressure = Math.max(28, director.pressure - 26);
  }
  return director;
}

function UpdateSweep(enemy, deltaTime) {
  if (!enemy.sweepTarget) {
    enemy.state = "return";
    return;
  }
  const role = GetEnemyRoleDefinition(enemy.role);
  enemy.searchTimer = Math.max(0, (enemy.searchTimer ?? 0) - deltaTime);
  if (MoveToward(enemy, enemy.sweepTarget, role.speed * 0.78, deltaTime) || enemy.searchTimer <= 0) {
    enemy.sweepTarget = null;
    enemy.state = "search";
    enemy.searchTimer = 10;
    enemy.lastKnown ??= { x: enemy.x, z: enemy.z };
  }
}

function UpdateCombat(enemy, state, visible, deltaTime, hooks) {
  const role = GetEnemyRoleDefinition(enemy.role);
  const target = visible ?? state.units.find((unit) => unit.id === enemy.target);
  if (!target) {
    enemy.state = "search";
    enemy.searchTimer = 15;
    return;
  }
  const distance = GetTacticalDistance(enemy, target, activeMissionDefinition);
  if (!visible) return;
  if (!enemy.radioed && (enemy.role === "operator" || state.alertLevel < 2)) {
    enemy.state = "report";
    enemy.reportTimer = enemy.role === "operator" ? 4.8 : 2.8;
    return;
  }
  if (enemy.suppression > 72 || enemy.morale < 25) {
    enemy.state = "routed";
    enemy.target = null;
    PushMessage(state, "combat", `${GetEnemyRoleDefinition(enemy.role).name}在压制下退却。`);
    return;
  }
  const contact = enemy.lastKnown ?? enemy.sharedContact ?? target;
  if (enemy.coordinationRole === "flankerLeft" || enemy.coordinationRole === "flankerRight") {
    const side = enemy.coordinationRole === "flankerLeft" ? -1 : 1;
    const approachX = enemy.x - contact.x;
    const approachZ = enemy.z - contact.z;
    const approachLength = Math.max(1, Math.hypot(approachX, approachZ));
    const flank = {
      x: contact.x + (approachX / approachLength) * 7 + (-approachZ / approachLength) * 8 * side,
      z: contact.z + (approachZ / approachLength) * 7 + (approachX / approachLength) * 8 * side,
    };
    if (!IsNavigationBlocked(flank) && Distance(enemy, flank) > 1.4) {
      MoveToward(enemy, flank, role.speed * 0.78, deltaTime);
      enemy.fireIntent = "flank";
      return;
    }
  }
  enemy.coverTimer = (enemy.coverTimer ?? 0) - deltaTime;
  if (enemy.suppression > 36) {
    if (!enemy.coverPoint || enemy.coverTimer <= 0) {
      enemy.coverPoint = ChooseCoverPoint(enemy, target);
      enemy.coverTimer = 3.5;
    }
    if (enemy.coverPoint && Distance(enemy, enemy.coverPoint) > 0.9) {
      MoveToward(enemy, enemy.coverPoint, role.speed * 0.82, deltaTime);
      return;
    }
  }
  if (distance > 12) {
    const flankSign = enemy.seedOffset % 2 === 0 ? 1 : -1;
    const flank = {
      x: target.x + Math.cos(enemy.facing) * 6 * flankSign,
      z: target.z - Math.sin(enemy.facing) * 6 * flankSign,
    };
    MoveToward(enemy, flank, role.speed * 0.62, deltaTime);
  }
  enemy.shotCooldown -= deltaTime;
  if (distance < 20 && enemy.shotCooldown <= 0) {
    enemy.fireIntent = enemy.coordinationRole === "suppressor" ? "suppress" : "aimed";
    const cadence = enemy.coordinationRole === "suppressor" ? 1.35 : enemy.coordinationRole === "anchor" ? 1.65 : 1.8;
    enemy.shotCooldown = cadence + (enemy.seedOffset % 5) * 0.12;
    hooks.OnEnemyShot?.(enemy, target);
  }
}

export function UpdateEnemy(enemy, state, deltaTime, hooks = {}) {
  UseMissionDefinition(state);
  if (enemy.disabled || enemy.health <= 0) return;
  enemy.suppression = Math.max(0, enemy.suppression - deltaTime * 8);
  UpdateHearing(enemy, state);
  const visible = UpdatePerception(enemy, state, deltaTime);

  switch (enemy.state) {
    case "patrol":
    case "return":
      UpdatePatrol(enemy, deltaTime);
      if (enemy.state === "return" && enemy.awareness < 5) enemy.state = "patrol";
      break;
    case "suspicious":
      enemy.facing = enemy.lastKnown
        ? Math.atan2(enemy.lastKnown.x - enemy.x, enemy.lastKnown.z - enemy.z)
        : enemy.facing + deltaTime * 0.35;
      if (
        state.time >= GetCampSuspicionHoldSeconds(state) &&
        enemy.awareness < simulationConfig.awarenessSuspicious * 0.5
      ) enemy.state = "patrol";
      break;
    case "investigate":
      UpdateInvestigate(enemy, state, deltaTime);
      break;
    case "search":
      UpdateSearch(enemy, state, deltaTime);
      break;
    case "sweep":
      UpdateSweep(enemy, deltaTime);
      break;
    case "report":
      enemy.reportTimer -= deltaTime;
      if (enemy.reportTimer <= 0) {
        RaiseLocalAlarm(enemy, state);
        enemy.state = "combat";
      }
      break;
    case "combat":
      UpdateCombat(enemy, state, visible, deltaTime, hooks);
      break;
    case "routed": {
      const away = enemy.lastKnown ?? { x: 0, z: 0 };
      const vectorX = enemy.x - away.x;
      const vectorZ = enemy.z - away.z;
      const length = Math.max(1, Math.hypot(vectorX, vectorZ));
      MoveToward(enemy, { x: enemy.x + (vectorX / length) * 12, z: enemy.z + (vectorZ / length) * 12 }, 3.8, deltaTime);
      break;
    }
    default:
      enemy.state = "patrol";
  }
}

export function UpdateEnemySquad(state, deltaTime, hooks = {}) {
  UseMissionDefinition(state);
  UpdateTacticalDirector(state, deltaTime);
  state.enemyCoordinationTimer = (state.enemyCoordinationTimer ?? 0) - deltaTime;
  if (state.enemyCoordinationTimer <= 0) {
    AssignEnemyCoordinationRoles(state);
    state.enemyCoordinationTimer = 1;
  }
  for (const enemy of state.enemies) UpdateEnemy(enemy, state, deltaTime, hooks);
  if (state.reinforcementTimer !== null) {
    state.reinforcementTimer -= deltaTime;
    if (state.reinforcementTimer <= 0) {
      state.reinforcementTimer = null;
      hooks.OnReinforcement?.(state);
      PushMessage(state, "alert", state.environment.eastRoadBlocked ? "东路被封，增援改为步行搜索。" : "东公路传来车辆声，必须断接撤离。");
    }
  }
}
