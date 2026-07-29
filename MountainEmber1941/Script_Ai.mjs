import { GetEnemyRoleDefinition } from "./Data_Characters.mjs";
import { GetPatrol, missionDefinition } from "./Data_Mission.mjs";
import {
  CalculateAwarenessRate,
  CanSee,
  Clamp,
  Distance,
  FindPath2D,
  GetCoverAt,
  HearSound,
  IsNavigationBlocked,
  NormalizeAngle,
  PointInsideBox,
  simulationConfig,
} from "./Script_Rules.mjs";

function GetObstaclePenetration(position) {
  let penetration = 0;
  for (const obstacle of missionDefinition.obstacles) {
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
    const distance = Distance(enemy, unit);
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
    .sort((left, right) => Distance(enemy, left) - Distance(enemy, right))[0] ?? null;
}

function PushMessage(state, kind, text) {
  const previous = state.messages[state.messages.length - 1];
  if (previous?.text === text && state.time - previous.time < 2) return;
  state.messages.push({ time: state.time, kind, text });
  if (state.messages.length > 30) state.messages.shift();
}

function RaiseLocalAlarm(enemy, state) {
  if (enemy.radioed) return;
  enemy.radioed = true;
  state.alertLevel = Math.max(state.alertLevel, 2);
  state.alarmState = state.environment.alarmBellDisabled ? "shouted" : "alarm";
  state.ledger.alarmsRaised += 1;
  state.reinforcementTimer =
    state.objectives.relay || state.environment.eastRoadBlocked
      ? simulationConfig.reinforcementCutlineSeconds
      : simulationConfig.reinforcementSeconds;
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

  enemy.awareness = Clamp(enemy.awareness - simulationConfig.awarenessDecay * deltaTime, 0, 100);
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
  const patrol = GetPatrol(enemy.patrol);
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
    const radius = 2.2 + Math.max(0.8, enemy.uncertainty ?? 1) + (enemy.searchPhase % 4) * 1.45;
    const angle = enemy.seedOffset * 0.173 + enemy.searchPhase * 2.399;
    const candidate = {
      x: Clamp(
        enemy.lastKnown.x + Math.cos(angle) * radius,
        missionDefinition.bounds.minimumX + 1,
        missionDefinition.bounds.maximumX - 1,
      ),
      z: Clamp(
        enemy.lastKnown.z + Math.sin(angle) * radius,
        missionDefinition.bounds.minimumZ + 1,
        missionDefinition.bounds.maximumZ - 1,
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
  for (const obstacle of missionDefinition.obstacles) {
    if (Distance(enemy, obstacle) > 14) continue;
    const candidates = [
      { x: obstacle.x - obstacle.width * 0.5 - 1, z: obstacle.z },
      { x: obstacle.x + obstacle.width * 0.5 + 1, z: obstacle.z },
      { x: obstacle.x, z: obstacle.z - obstacle.depth * 0.5 - 1 },
      { x: obstacle.x, z: obstacle.z + obstacle.depth * 0.5 + 1 },
    ];
    for (const candidate of candidates) {
      if (IsNavigationBlocked(candidate, missionDefinition.obstacles, missionDefinition.bounds, 0.5)) continue;
      const cover = GetCoverAt(candidate, target);
      if (!cover) continue;
      const score = cover.protection * 12 - Distance(enemy, candidate) * 0.75 + Distance(target, candidate) * 0.08;
      if (!best || score > best.score) best = { ...candidate, score };
    }
  }
  return best ? { x: best.x, z: best.z } : null;
}

function UpdateCombat(enemy, state, visible, deltaTime, hooks) {
  const role = GetEnemyRoleDefinition(enemy.role);
  const target = visible ?? state.units.find((unit) => unit.id === enemy.target);
  if (!target) {
    enemy.state = "search";
    enemy.searchTimer = 15;
    return;
  }
  const distance = Distance(enemy, target);
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
    enemy.shotCooldown = 1.8 + (enemy.seedOffset % 5) * 0.12;
    hooks.OnEnemyShot?.(enemy, target);
  }
}

export function UpdateEnemy(enemy, state, deltaTime, hooks = {}) {
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
      if (enemy.awareness < simulationConfig.awarenessSuspicious * 0.5) enemy.state = "patrol";
      break;
    case "investigate":
      UpdateInvestigate(enemy, state, deltaTime);
      break;
    case "search":
      UpdateSearch(enemy, state, deltaTime);
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
