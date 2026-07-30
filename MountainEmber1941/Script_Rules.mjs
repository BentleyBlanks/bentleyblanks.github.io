import { characterDefinitions, GetCharacterDefinition, GetEnemyRoleDefinition } from "./Data_Characters.mjs";
import {
  campaignOperationDefinitions,
  missionDefinition as legacyMissionDefinition,
} from "./Data_Mission.mjs";
import {
  GetOperationLayout,
  GetOperationLayoutByCampaignIndex,
  operationLayoutDefinitions,
} from "./Data_Operations.mjs";
import { CreateOperationRuntime } from "./Script_OperationFlow.mjs";

let activeMissionDefinition = legacyMissionDefinition;

export function SetActiveMissionDefinition(definition = legacyMissionDefinition) {
  activeMissionDefinition = definition ?? legacyMissionDefinition;
  return activeMissionDefinition;
}

export function GetMissionDefinitionForState(state = null) {
  return GetOperationLayout(state?.operationLayoutId) ?? state?.missionDefinition ?? activeMissionDefinition;
}

export const simulationConfig = Object.freeze({
  fixedStep: 1 / 30,
  aiStep: 0.1,
  maximumQueueLength: 4,
  awarenessConfirm: 100,
  awarenessSuspicious: 26,
  awarenessInvestigate: 58,
  awarenessDecay: 7,
  downedBleedSeconds: 55,
  reinforcementSeconds: 72,
  reinforcementCutlineSeconds: 128,
  friendlySight: 20,
  scoutSight: 27,
  lastSeenSeconds: 12,
});

export function Clamp(value, minimum = 0, maximum = 1) {
  return Math.max(minimum, Math.min(maximum, Number(value) || 0));
}

export function DistanceSquared(left, right) {
  const deltaX = left.x - right.x;
  const deltaZ = left.z - right.z;
  return deltaX * deltaX + deltaZ * deltaZ;
}

export function Distance(left, right) {
  return Math.sqrt(DistanceSquared(left, right));
}

export function NormalizeAngle(angle) {
  let value = angle;
  while (value > Math.PI) value -= Math.PI * 2;
  while (value < -Math.PI) value += Math.PI * 2;
  return value;
}

export function PointInsideBox(point, box, padding = 0) {
  return (
    point.x >= box.x - box.width * 0.5 - padding &&
    point.x <= box.x + box.width * 0.5 + padding &&
    point.z >= box.z - box.depth * 0.5 - padding &&
    point.z <= box.z + box.depth * 0.5 + padding
  );
}

function PointInsideTerrainZone(point, zone) {
  if (Number.isFinite(zone.radius)) return DistanceSquared(point, zone) <= zone.radius * zone.radius;
  return Number.isFinite(zone.width) && Number.isFinite(zone.depth) && PointInsideBox(point, zone);
}

export function GetTerrainElevation(position, definition = activeMissionDefinition) {
  const baseElevation = Number(definition?.baseElevation) || 0;
  const candidates = (definition?.zones ?? [])
    .filter((zone) => Number.isFinite(zone.elevation) && PointInsideTerrainZone(position, zone))
    .map((zone) => {
      const normalizedX = Number.isFinite(zone.width) && zone.width > 0
        ? Clamp((position.x - zone.x) / zone.width, -0.5, 0.5)
        : 0;
      const normalizedZ = Number.isFinite(zone.depth) && zone.depth > 0
        ? Clamp((position.z - zone.z) / zone.depth, -0.5, 0.5)
        : 0;
      const slope = zone.elevationSlope ?? {};
      return {
        elevation:
          zone.elevation +
          (Number(slope.x) || 0) * normalizedX +
          (Number(slope.z) || 0) * normalizedZ,
        priority: Number(zone.elevationPriority) || 0,
        area: Number.isFinite(zone.radius)
          ? Math.PI * zone.radius * zone.radius
          : Math.max(1, (zone.width ?? 1) * (zone.depth ?? 1)),
      };
    })
    .sort((left, right) => right.priority - left.priority || left.area - right.area);
  return baseElevation + (candidates[0]?.elevation ?? 0);
}

export function GetTacticalDistance(left, right, definition = activeMissionDefinition) {
  const horizontalDistance = Distance(left, right);
  const elevationDelta = GetTerrainElevation(left, definition) - GetTerrainElevation(right, definition);
  return Math.hypot(horizontalDistance, elevationDelta);
}

function GetSegmentBoxInterval(start, end, box, padding = 0) {
  const minimumX = box.x - box.width * 0.5 - padding;
  const maximumX = box.x + box.width * 0.5 + padding;
  const minimumZ = box.z - box.depth * 0.5 - padding;
  const maximumZ = box.z + box.depth * 0.5 + padding;
  const deltaX = end.x - start.x;
  const deltaZ = end.z - start.z;
  let minimumTime = 0;
  let maximumTime = 1;

  for (const [origin, delta, minimum, maximum] of [
    [start.x, deltaX, minimumX, maximumX],
    [start.z, deltaZ, minimumZ, maximumZ],
  ]) {
    if (Math.abs(delta) < 0.00001) {
      if (origin < minimum || origin > maximum) return null;
      continue;
    }
    const inverse = 1 / delta;
    let enter = (minimum - origin) * inverse;
    let leave = (maximum - origin) * inverse;
    if (enter > leave) [enter, leave] = [leave, enter];
    minimumTime = Math.max(minimumTime, enter);
    maximumTime = Math.min(maximumTime, leave);
    if (minimumTime > maximumTime) return null;
  }
  return { enterTime: minimumTime, leaveTime: maximumTime };
}

export function SegmentIntersectsBox(start, end, box, padding = 0) {
  return GetSegmentBoxInterval(start, end, box, padding) !== null;
}

function GetActorEyeHeight(actor) {
  if (Number.isFinite(actor.eyeHeight)) return actor.eyeHeight;
  if (actor.state === "downed" || actor.stance === "downed") return 0.38;
  if (actor.stance === "crouch") return 1;
  if (actor.stance === "sprint") return 1.42;
  return 1.58;
}

function GetObstacleHeight(obstacle) {
  if (Number.isFinite(obstacle.height)) return obstacle.height;
  return obstacle.kind === "building"
    ? 4.5
    : obstacle.kind === "tower"
      ? 7
      : obstacle.kind === "wall"
        ? 1.8
        : 2.2;
}

export function HasLineOfSight(
  start,
  end,
  obstacles = activeMissionDefinition.obstacles,
  definition = activeMissionDefinition,
) {
  const startHeight = GetTerrainElevation(start, definition) + GetActorEyeHeight(start);
  const endHeight = GetTerrainElevation(end, definition) + GetActorEyeHeight(end);
  for (const obstacle of obstacles) {
    if (obstacle.kind === "tower" && PointInsideBox(start, obstacle, -0.05)) continue;
    const interval = GetSegmentBoxInterval(start, end, obstacle, -0.08);
    if (!interval) continue;
    const obstacleTop = GetTerrainElevation(obstacle, definition) + GetObstacleHeight(obstacle);
    const heightAtEnter = startHeight + (endHeight - startHeight) * interval.enterTime;
    const heightAtLeave = startHeight + (endHeight - startHeight) * interval.leaveTime;
    if (Math.min(heightAtEnter, heightAtLeave) <= obstacleTop + 0.04) return false;
  }

  const horizontalDistance = Distance(start, end);
  const sampleCount = Math.min(96, Math.max(8, Math.ceil(horizontalDistance / 1.25)));
  for (let index = 1; index < sampleCount; index += 1) {
    const time = index / sampleCount;
    const sample = {
      x: start.x + (end.x - start.x) * time,
      z: start.z + (end.z - start.z) * time,
    };
    const rayHeight = startHeight + (endHeight - startHeight) * time;
    if (GetTerrainElevation(sample, definition) + 0.08 >= rayHeight) return false;
  }
  return true;
}

export function IsNavigationBlocked(
  position,
  obstacles = activeMissionDefinition.obstacles,
  bounds = activeMissionDefinition.bounds,
  clearance = 0.45,
) {
  if (
    position.x < bounds.minimumX + clearance ||
    position.x > bounds.maximumX - clearance ||
    position.z < bounds.minimumZ + clearance ||
    position.z > bounds.maximumZ - clearance
  ) return true;
  return obstacles.some((obstacle) => PointInsideBox(position, obstacle, clearance));
}

function HasNavigationLine(start, end, obstacles, bounds, clearance) {
  if (IsNavigationBlocked(end, obstacles, bounds, clearance)) return false;
  return !obstacles.some((obstacle) => SegmentIntersectsBox(start, end, obstacle, clearance));
}

function FindNearestPassableGridCell(point, grid, obstacles, bounds, clearance) {
  const baseColumn = Math.round((point.x - bounds.minimumX) / grid.cellSize);
  const baseRow = Math.round((point.z - bounds.minimumZ) / grid.cellSize);
  for (let radius = 0; radius <= Math.max(grid.columns, grid.rows); radius += 1) {
    for (let rowOffset = -radius; rowOffset <= radius; rowOffset += 1) {
      for (let columnOffset = -radius; columnOffset <= radius; columnOffset += 1) {
        if (radius > 0 && Math.abs(columnOffset) !== radius && Math.abs(rowOffset) !== radius) continue;
        const column = baseColumn + columnOffset;
        const row = baseRow + rowOffset;
        if (column < 0 || row < 0 || column >= grid.columns || row >= grid.rows) continue;
        const candidate = {
          x: bounds.minimumX + column * grid.cellSize,
          z: bounds.minimumZ + row * grid.cellSize,
        };
        if (!IsNavigationBlocked(candidate, obstacles, bounds, clearance)) return { column, row, ...candidate };
      }
    }
  }
  return null;
}

/** Deterministic eight-neighbour A* for the ground plane. Returns waypoints, excluding start. */
export function FindPath2D(start, destination, options = {}) {
  const obstacles = options.obstacles ?? activeMissionDefinition.obstacles;
  const bounds = options.bounds ?? activeMissionDefinition.bounds;
  const clearance = options.clearance ?? 0.45;
  const cellSize = options.cellSize ?? 2;
  if (!IsNavigationBlocked(start, obstacles, bounds, clearance) && HasNavigationLine(start, destination, obstacles, bounds, clearance)) {
    return [{ x: destination.x, z: destination.z }];
  }
  const grid = {
    cellSize,
    columns: Math.floor((bounds.maximumX - bounds.minimumX) / cellSize) + 1,
    rows: Math.floor((bounds.maximumZ - bounds.minimumZ) / cellSize) + 1,
  };
  const origin = FindNearestPassableGridCell(start, grid, obstacles, bounds, clearance);
  const goal = FindNearestPassableGridCell(destination, grid, obstacles, bounds, clearance);
  if (!origin || !goal) return [];
  const NodeKey = (column, row) => row * grid.columns + column;
  const nodes = new Map();
  const open = [];
  const originKey = NodeKey(origin.column, origin.row);
  const goalKey = NodeKey(goal.column, goal.row);
  const heuristic = (column, row) => Math.hypot(goal.column - column, goal.row - row);
  const originNode = { ...origin, key: originKey, g: 0, h: heuristic(origin.column, origin.row), parent: null };
  nodes.set(originKey, originNode);
  open.push(originNode);
  const closed = new Set();
  const directions = [
    [0, -1], [1, 0], [0, 1], [-1, 0],
    [1, -1], [1, 1], [-1, 1], [-1, -1],
  ];
  let found = null;
  while (open.length > 0) {
    open.sort((left, right) => (left.g + left.h) - (right.g + right.h) || left.h - right.h || left.key - right.key);
    const current = open.shift();
    if (closed.has(current.key)) continue;
    if (current.key === goalKey) {
      found = current;
      break;
    }
    closed.add(current.key);
    for (const [columnStep, rowStep] of directions) {
      const column = current.column + columnStep;
      const row = current.row + rowStep;
      if (column < 0 || row < 0 || column >= grid.columns || row >= grid.rows) continue;
      const key = NodeKey(column, row);
      if (closed.has(key)) continue;
      const candidate = { x: bounds.minimumX + column * cellSize, z: bounds.minimumZ + row * cellSize };
      if (IsNavigationBlocked(candidate, obstacles, bounds, clearance)) continue;
      if (columnStep !== 0 && rowStep !== 0) {
        const horizontal = { x: bounds.minimumX + column * cellSize, z: current.z };
        const vertical = { x: current.x, z: bounds.minimumZ + row * cellSize };
        if (
          IsNavigationBlocked(horizontal, obstacles, bounds, clearance) ||
          IsNavigationBlocked(vertical, obstacles, bounds, clearance)
        ) continue;
      }
      const tentativeG = current.g + (columnStep !== 0 && rowStep !== 0 ? Math.SQRT2 : 1);
      const existing = nodes.get(key);
      if (existing && tentativeG >= existing.g) continue;
      const node = existing ?? { column, row, ...candidate, key, g: tentativeG, h: heuristic(column, row), parent: current };
      node.g = tentativeG;
      node.parent = current;
      if (!existing) nodes.set(key, node);
      open.push(node);
    }
  }
  if (!found) return [];
  const reversed = [];
  for (let node = found; node && node.key !== originKey; node = node.parent) reversed.push({ x: node.x, z: node.z });
  const rawPath = reversed.reverse();
  if (rawPath.length === 0) return [{ x: goal.x, z: goal.z }];
  const simplified = [];
  let anchor = IsNavigationBlocked(start, obstacles, bounds, clearance) ? origin : start;
  for (let index = 0; index < rawPath.length;) {
    let furthest = index;
    for (let candidateIndex = rawPath.length - 1; candidateIndex > index; candidateIndex -= 1) {
      if (HasNavigationLine(anchor, rawPath[candidateIndex], obstacles, bounds, clearance)) {
        furthest = candidateIndex;
        break;
      }
    }
    simplified.push(rawPath[furthest]);
    anchor = rawPath[furthest];
    index = furthest + 1;
  }
  if (!IsNavigationBlocked(destination, obstacles, bounds, clearance) && HasNavigationLine(anchor, destination, obstacles, bounds, clearance)) {
    simplified[simplified.length - 1] = { x: destination.x, z: destination.z };
  }
  if (IsNavigationBlocked(start, obstacles, bounds, clearance)) {
    simplified.unshift({ x: origin.x, z: origin.z });
  }
  return simplified;
}

export function GetCoverAt(position, threatPosition = null, obstacles = activeMissionDefinition.obstacles) {
  const protectionByKind = { building: 0.62, wall: 0.52, tower: 0.58, crate: 0.4, wagon: 0.46 };
  let best = null;
  for (const obstacle of obstacles) {
    const protection = protectionByKind[obstacle.kind];
    if (!protection) continue;
    const deltaX = Math.max(Math.abs(position.x - obstacle.x) - obstacle.width * 0.5, 0);
    const deltaZ = Math.max(Math.abs(position.z - obstacle.z) - obstacle.depth * 0.5, 0);
    const distance = Math.hypot(deltaX, deltaZ);
    if (distance > 2.1 || PointInsideBox(position, obstacle)) continue;
    if (threatPosition && !SegmentIntersectsBox(threatPosition, position, obstacle, 0.05)) continue;
    const candidate = { obstacleId: obstacle.id, kind: obstacle.kind, protection, distance };
    if (!best || candidate.protection > best.protection || (candidate.protection === best.protection && distance < best.distance)) best = candidate;
  }
  return best;
}

export function GetCoverDamageMultiplier(cover, attackKind = "gunfire") {
  if (!cover || attackKind === "melee") return 1;
  const effectiveness = attackKind === "explosion" ? cover.protection * 0.45 : cover.protection;
  return Clamp(1 - effectiveness, 0.25, 1);
}

function GetShotProfile(shooter) {
  const characterProfile = GetCharacterDefinition(shooter.id)?.tacticalProfile;
  if (characterProfile) return characterProfile;
  const enemyProfile = GetEnemyRoleDefinition(shooter.role);
  return {
    firearmAccuracy: enemyProfile.firearmAccuracy ?? 0.55,
    effectiveRange: enemyProfile.effectiveRange ?? enemyProfile.sight ?? 18,
    shotDamage: enemyProfile.shotDamage ?? 8,
    suppressionPower: enemyProfile.suppressionPower ?? 0.9,
  };
}

function GetDeterministicShotRoll(shooter, target, options) {
  const signature = [
    options.seed ?? 1941,
    options.shotIndex ?? 0,
    shooter.id ?? shooter.role ?? "shooter",
    target.id ?? target.role ?? "target",
    Math.round(shooter.x * 10),
    Math.round(shooter.z * 10),
    Math.round(target.x * 10),
    Math.round(target.z * 10),
    options.mode ?? "aimed",
  ].join("|");
  let hash = 2166136261;
  for (let index = 0; index < signature.length; index += 1) {
    hash ^= signature.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967296;
}

/**
 * Pure deterministic shot resolution. Callers apply the returned damage and suppression.
 * Cover is explicit so the same inputs always produce the same result in tests and replays.
 */
export function ResolveDeterministicShot(shooter, target, options = {}) {
  const time = options.time ?? 0;
  const mode = options.mode === "suppress" ? "suppress" : "aimed";
  const profile = GetShotProfile(shooter);
  const definition = options.definition ?? activeMissionDefinition;
  const shooterElevation = GetTerrainElevation(shooter, definition);
  const targetElevation = GetTerrainElevation(target, definition);
  const elevationDelta = shooterElevation - targetElevation;
  const distance = GetTacticalDistance(shooter, target, definition);
  const cover = options.cover ?? (
    Array.isArray(options.obstacles) ? GetCoverAt(target, shooter, options.obstacles) : null
  );
  const steadyActive = (shooter.steadyUntil ?? 0) > time;
  const maneuverActive = (shooter.maneuverWindowUntil ?? 0) > time;
  const shooterRescueCoverActive = (shooter.rescueCoverUntil ?? 0) > time;
  const targetRescueCoverActive = (target.rescueCoverUntil ?? 0) > time;
  const coordinationActive = Boolean(
    shooter.coordinationLink?.partnerId && (shooter.coordinationLink.expiresAt ?? 0) > time,
  );
  const effectiveRange = Math.max(1, profile.effectiveRange ?? 18);
  const distanceMultiplier = Clamp(
    1 - Math.max(0, distance - effectiveRange * 0.2) / (effectiveRange * 1.15),
    0.28,
    1,
  );
  const shooterStanceMultiplier =
    shooter.stance === "crouch" ? 1.08 : shooter.stance === "sprint" ? 0.62 : 1;
  const targetStanceMultiplier =
    target.stance === "crouch" ? 0.82 : target.stance === "sprint" ? 1.12 : 1;
  const suppressionPenalty = Clamp(1 - (shooter.suppression ?? 0) / (steadyActive ? 190 : 125), 0.26, 1);
  const effectiveCoverProtection = Clamp(
    (cover?.protection ?? 0) * (maneuverActive ? 0.62 : 1),
    0,
    0.8,
  );
  const coverMultiplier = Clamp(1 - effectiveCoverProtection * 0.82, 0.34, 1);
  const coordinationBonus =
    (steadyActive ? 0.1 : 0) +
    (maneuverActive ? 0.08 : 0) +
    (shooterRescueCoverActive ? 0.07 : 0) +
    (coordinationActive ? 0.07 : 0);
  const targetProtectionPenalty = targetRescueCoverActive ? 0.1 : 0;
  const modeMultiplier = mode === "suppress" ? 0.52 : 1;
  const elevationAccuracyBonus = Clamp(elevationDelta / 45, -0.1, 0.12);
  const rawHitChance =
    (profile.firearmAccuracy ?? 0.55) *
      distanceMultiplier *
      shooterStanceMultiplier *
      targetStanceMultiplier *
      suppressionPenalty *
      coverMultiplier *
      modeMultiplier +
    coordinationBonus -
    targetProtectionPenalty +
    elevationAccuracyBonus;
  const hitChance = Clamp(rawHitChance, 0.04, 0.95);
  const roll = GetDeterministicShotRoll(shooter, target, { ...options, mode });
  const hit = roll < hitChance;
  const effectiveCover = cover
    ? Object.freeze({ ...cover, protection: effectiveCoverProtection })
    : null;
  const coverDamageMultiplier = GetCoverDamageMultiplier(effectiveCover, "gunfire");
  const rescueDamageMultiplier = targetRescueCoverActive ? 0.72 : 1;
  const baseDamage = profile.shotDamage ?? 8;
  const damage = hit
    ? Math.max(
        1,
        Math.round(
          baseDamage *
            (mode === "suppress" ? 0.18 : 1) *
            coverDamageMultiplier *
            rescueDamageMultiplier,
        ),
      )
    : 0;
  const suppressionPower = profile.suppressionPower ?? 1;
  const targetSuppressionResistance =
    ((target.steadyUntil ?? 0) > time ? 0.68 : 1) *
    (targetRescueCoverActive ? 0.72 : 1);
  const coordinationSuppressionMultiplier = coordinationActive ? 1.12 : 1;
  const suppression = Math.round(
    (mode === "suppress" ? (hit ? 38 : 29) : hit ? 20 : 6) *
      suppressionPower *
      targetSuppressionResistance *
      coordinationSuppressionMultiplier,
  );

  return Object.freeze({
    mode,
    hit,
    hitChance,
    roll,
    damage,
    suppression,
    distance,
    cover: effectiveCover,
    modifiers: Object.freeze({
      firearmAccuracy: profile.firearmAccuracy ?? 0.55,
      distanceMultiplier,
      shooterStanceMultiplier,
      targetStanceMultiplier,
      suppressionPenalty,
      coverMultiplier,
      steadyActive,
      maneuverActive,
      shooterRescueCoverActive,
      targetRescueCoverActive,
      coordinationActive,
      shooterElevation,
      targetElevation,
      elevationDelta,
      elevationAccuracyBonus,
    }),
  });
}

export function GetBallisticImpact(start, end, obstacles = activeMissionDefinition.obstacles) {
  let nearest = null;
  for (const obstacle of obstacles) {
    const minimumX = obstacle.x - obstacle.width * 0.5;
    const maximumX = obstacle.x + obstacle.width * 0.5;
    const minimumZ = obstacle.z - obstacle.depth * 0.5;
    const maximumZ = obstacle.z + obstacle.depth * 0.5;
    const deltaX = end.x - start.x;
    const deltaZ = end.z - start.z;
    let enterTime = 0;
    let leaveTime = 1;
    let intersects = true;
    for (const [origin, delta, minimum, maximum] of [
      [start.x, deltaX, minimumX, maximumX],
      [start.z, deltaZ, minimumZ, maximumZ],
    ]) {
      if (Math.abs(delta) < 0.00001) {
        if (origin < minimum || origin > maximum) intersects = false;
        continue;
      }
      let enter = (minimum - origin) / delta;
      let leave = (maximum - origin) / delta;
      if (enter > leave) [enter, leave] = [leave, enter];
      enterTime = Math.max(enterTime, enter);
      leaveTime = Math.min(leaveTime, leave);
      if (enterTime > leaveTime) intersects = false;
    }
    if (!intersects || enterTime < 0.001 || enterTime > 1 || (nearest && enterTime >= nearest.time)) continue;
    nearest = {
      obstacleId: obstacle.id,
      material: obstacle.impactMaterial ?? (obstacle.kind === "crate" || obstacle.kind === "wagon" ? "wood" : "earth"),
      x: start.x + deltaX * enterTime,
      z: start.z + deltaZ * enterTime,
      time: enterTime,
    };
  }
  return nearest;
}

export function IsPositionLit(position, environment = {}, lightingZones = activeMissionDefinition.lightingZones ?? []) {
  return lightingZones.some((zone) => {
    if (environment.disabledLighting?.includes(zone.id)) return false;
    if (zone.generatorDependent && environment.generatorDisabled) return false;
    if (zone.kind === "circle") return DistanceSquared(position, zone) <= zone.radius * zone.radius;
    if (zone.kind === "box") return PointInsideBox(position, zone);
    return false;
  });
}

function GetElevationSightMultiplier(observer, target, definition = activeMissionDefinition) {
  const elevationDelta = GetTerrainElevation(observer, definition) - GetTerrainElevation(target, definition);
  const highGroundBonus = Clamp(elevationDelta * 0.035, 0, 0.3);
  const lowGroundPenalty = Clamp(-elevationDelta * 0.025, 0, 0.2);
  return 1 + highGroundBonus - lowGroundPenalty;
}

export function CanFriendlySeeEnemy(
  observer,
  enemy,
  obstacles = activeMissionDefinition.obstacles,
  definition = activeMissionDefinition,
) {
  if (["downed", "dead", "evacuated", "unavailable"].includes(observer.state)) return false;
  if (enemy.bodyHidden) return false;
  const sight = observer.id === "qinSuqiu" ? simulationConfig.scoutSight : simulationConfig.friendlySight;
  const lightBonus = IsPositionLit(enemy) ? 1.18 : 1;
  const elevationSightMultiplier = GetElevationSightMultiplier(observer, enemy, definition);
  if (GetTacticalDistance(observer, enemy, definition) > sight * lightBonus * elevationSightMultiplier) return false;
  return HasLineOfSight(observer, enemy, obstacles, definition);
}

/** Updates only the squad's intelligence record; AI truth remains on the enemy object. */
export function UpdateEnemyIntel(state, deltaTime = 0, obstacles = GetMissionDefinitionForState(state).obstacles) {
  const definition = GetMissionDefinitionForState(state);
  const RememberEnemy = (enemy) => ({
    x: enemy.x,
    z: enemy.z,
    facing: enemy.facing,
    stance: enemy.stance,
    state: enemy.state,
    suppression: enemy.suppression,
    health: enemy.health,
    disabled: enemy.disabled,
    elevated: enemy.elevated,
    time: state.time,
  });
  for (const enemy of state.enemies) {
    const currentlyVisible = state.units.some((unit) => CanFriendlySeeEnemy(unit, enemy, obstacles, definition));
    enemy.currentVisible = currentlyVisible;
    if (currentlyVisible) {
      enemy.intelState = "current";
      enemy.lastSeenTimer = simulationConfig.lastSeenSeconds;
      enemy.lastSeenPosition = RememberEnemy(enemy);
      continue;
    }
    if ((enemy.revealedTimer ?? 0) > 0) {
      enemy.intelState = "tracked";
      enemy.lastSeenTimer = simulationConfig.lastSeenSeconds;
      enemy.lastSeenPosition = RememberEnemy(enemy);
      continue;
    }
    enemy.lastSeenTimer = Math.max(0, (enemy.lastSeenTimer ?? 0) - deltaTime);
    if (enemy.lastSeenPosition && enemy.lastSeenTimer > 0) enemy.intelState = "lastKnown";
    else enemy.intelState = enemy.discovered ? "discovered" : "unknown";
  }
  return state;
}

export function GetEnemyIntelRenderState(enemy) {
  const mode = enemy.intelState ?? (enemy.currentVisible ? "current" : enemy.discovered ? "discovered" : "unknown");
  if (mode === "current" || mode === "tracked") {
    return {
      mode,
      showModel: !enemy.bodyHidden,
      showAwareness: mode === "current",
      showVision: !enemy.disabled && enemy.health > 0,
      showPatrol: mode === "tracked" || Boolean(enemy.discovered),
      canTarget: !enemy.bodyHidden,
      position: { x: enemy.x, z: enemy.z, facing: enemy.facing },
    };
  }
  if (mode === "lastKnown" && enemy.lastSeenPosition) {
    return {
      mode,
      showModel: true,
      showAwareness: false,
      showVision: false,
      showPatrol: Boolean(enemy.discovered),
      canTarget: false,
      position: { ...enemy.lastSeenPosition },
    };
  }
  return {
    mode,
    showModel: false,
    showAwareness: false,
    showVision: false,
    showPatrol: Boolean(enemy.discovered),
    canTarget: false,
    position: null,
  };
}

export function GetZoneAt(position, definition = activeMissionDefinition) {
  return definition.zones.find((zone) => PointInsideBox(position, zone)) ?? null;
}

export function IsConcealmentZone(position) {
  const zoneKind = GetZoneAt(position)?.kind;
  return zoneKind === "foliage" || zoneKind === "ditch";
}

export function GetVisibilityMultiplier(unit) {
  let multiplier = unit.stance === "crouch" ? 0.58 : unit.stance === "sprint" ? 1.34 : 1;
  const zone = GetZoneAt(unit);
  if (zone) multiplier *= zone.visibility;
  if (unit.hidden) multiplier *= 0.7;
  if (unit.inDust) multiplier *= 0.42;
  if (unit.carrying === "medicines") multiplier *= 1.18;
  return multiplier;
}

export function GetSoundRadius(unit, movementMode = unit.stance) {
  const base = movementMode === "crouch" ? 2.5 : movementMode === "sprint" ? 11 : 5.2;
  const zone = GetZoneAt(unit);
  const characterQuietBonus = unit.id === "qinSuqiu" && zone?.kind === "foliage" ? 0.78 : 1;
  return base * (zone?.sound ?? 1) * characterQuietBonus;
}

export function CanSee(
  observer,
  target,
  obstacles = activeMissionDefinition.obstacles,
  definition = activeMissionDefinition,
) {
  const role = GetEnemyRoleDefinition(observer.role);
  const distance = GetTacticalDistance(observer, target, definition);
  if (distance > role.sight * GetElevationSightMultiplier(observer, target, definition)) return false;
  const targetAngle = Math.atan2(target.x - observer.x, target.z - observer.z);
  const angleDelta = Math.abs(NormalizeAngle(targetAngle - observer.facing));
  const insideCentral = angleDelta <= role.fov * 0.5;
  const insidePeripheral = distance <= role.peripheralSight && angleDelta <= Math.PI * 0.72;
  if (!insideCentral && !insidePeripheral) return false;
  return HasLineOfSight(observer, target, obstacles, definition);
}

export function CalculateAwarenessRate(observer, target) {
  const role = GetEnemyRoleDefinition(observer.role);
  const distanceFactor = Clamp(1 - GetTacticalDistance(observer, target) / role.sight, 0.08, 1);
  const motionFactor = target.command?.kind === "move" ? (target.stance === "sprint" ? 1.55 : 1.08) : 0.72;
  const lightFactor = target.inLight ? 1.4 : 0.82;
  return 44 * distanceFactor * motionFactor * lightFactor * GetVisibilityMultiplier(target);
}

export function CreateSoundEvent(position, radius, kind, sourceId, time) {
  return Object.freeze({
    id: `${kind}_${sourceId}_${Math.round(time * 1000)}`,
    x: position.x,
    z: position.z,
    radius,
    kind,
    sourceId,
    createdAt: time,
  });
}

export function HearSound(enemy, soundEvent, seed = 1) {
  const distance = Distance(enemy, soundEvent);
  if (distance > soundEvent.radius) return null;
  const attenuation = Clamp(1 - distance / Math.max(1, soundEvent.radius), 0.12, 1);
  const hash = Math.sin(seed * 12.9898 + enemy.x * 78.233 + soundEvent.z * 37.719) * 43758.5453;
  const noise = hash - Math.floor(hash);
  const error = 0.8 + distance * 0.14;
  const angle = noise * Math.PI * 2;
  return {
    x: soundEvent.x + Math.cos(angle) * error,
    z: soundEvent.z + Math.sin(angle) * error,
    confidence: attenuation,
    kind: soundEvent.kind,
  };
}

function BuildOperationMetadata(definition, campaignIndex = 0) {
  const authoredLayout = GetOperationLayout(definition?.id);
  const fallback = campaignOperationDefinitions[campaignIndex % campaignOperationDefinitions.length];
  if (!authoredLayout) return { ...fallback, mainObjectiveIds: [...fallback.mainObjectiveIds] };
  const legacyMetadata = campaignOperationDefinitions.find(
    (candidate) => candidate.id === authoredLayout.operationId,
  );
  return {
    ...(legacyMetadata ?? {}),
    id: authoredLayout.operationId,
    layoutId: authoredLayout.id,
    name: authoredLayout.name,
    date: authoredLayout.date,
    timeOfDay: authoredLayout.timeOfDay,
    location: authoredLayout.location,
    summary: authoredLayout.summary,
    mainObjectiveIds: authoredLayout.objectives.mandatory
      .map((objective) => objective.id)
      .filter((objectiveId) => objectiveId !== "allExtracted"),
    resultTitle: `${authoredLayout.name}完成，小队撤出`,
    resultSummary: `${authoredLayout.summary} 行动组已按预定撤路脱离。`,
    campOutcomeTitle: `${authoredLayout.name}行动归营`,
  };
}

export function CreateInitialMissionState(seed = 19411018, definition = legacyMissionDefinition, campaignIndex = 0) {
  const mission = definition ?? activeMissionDefinition;
  SetActiveMissionDefinition(mission);
  const authoredLayout = GetOperationLayout(mission.id);
  const operation = BuildOperationMetadata(mission, campaignIndex);
  const units = characterDefinitions.map((definition, index) => {
    const spawn = mission.playerSpawns[index];
    return {
      id: definition.id,
      name: definition.name,
      role: definition.role,
      x: spawn.x,
      z: spawn.z,
      facing: 0.7,
      health: definition.health,
      maximumHealth: definition.health,
      suppression: 0,
      morale: 100,
      ammo: definition.ammo,
      stance: "crouch",
      state: "ready",
      queue: [],
      command: null,
      cooldowns: {},
      charges: { charge: definition.id === "hanShilei" ? 1 : 0, aid: definition.id === "luLanzhi" ? 2 : 0 },
      carrying: null,
      carriedItems: [],
      selected: index === 0,
      downedTimer: null,
      stabilized: false,
      shotCooldown: 0,
      hidden: true,
      inLight: false,
      steadyUntil: 0,
      maneuverWindowUntil: 0,
      rescueCoverUntil: 0,
      coordinationLink: null,
    };
  });

  const enemies = mission.enemies.map((definition, index) => {
    const role = GetEnemyRoleDefinition(definition.role);
    return {
      ...definition,
      facing: definition.facing ?? 0,
      health: role.health,
      maximumHealth: role.health,
      morale: role.morale,
      suppression: 0,
      awareness: 0,
      state: "patrol",
      patrolIndex: definition.patrolOffset ?? 0,
      target: null,
      lastKnown: null,
      lastHeard: null,
      searchTimer: 0,
      reportTimer: 0,
      shotCooldown: 0,
      disabled: false,
      bodyHidden: false,
      radioed: false,
      discovered: false,
      currentVisible: false,
      intelState: "unknown",
      lastSeenPosition: null,
      lastSeenTimer: 0,
      uncertainty: 0,
      seedOffset: seed + index * 97,
      markedUntil: 0,
      pinnedUntil: 0,
      isolatedUntil: 0,
      coordinationRole: "patrol",
    };
  });

  const interactables = Object.fromEntries(
    mission.interactables.map((definition) => [
      definition.id,
      {
        id: definition.id,
        completed: false,
        progress: 0,
        droppedAt: null,
        discovered:
          definition.kind === "objective" ||
          definition.id === "alarmBell" ||
          definition.id === "warningGong",
      },
    ]),
  );

  const objectiveIds = new Set([
    "allExtracted",
    ...mission.interactables.map((definition) => definition.id),
    ...(authoredLayout?.objectives.mandatory ?? []).map((objective) => objective.id),
    ...(authoredLayout?.objectives.optional ?? []).map((objective) => objective.id),
  ]);
  if (!authoredLayout) {
    for (const objectiveId of [
      "ledger",
      "relay",
      "detainee",
      "medicines",
      "radioParts",
      "tools",
      "seedGrain",
      "generator",
      "alarmBell",
      "rockfall",
    ]) objectiveIds.add(objectiveId);
  }

  return {
    version: 1,
    seed,
    operationLayoutId: authoredLayout?.id ?? null,
    operation: { ...operation, mainObjectiveIds: [...operation.mainObjectiveIds] },
    mainObjectiveIds: [...operation.mainObjectiveIds, "allExtracted"],
    time: 0,
    phase: "recon",
    paused: true,
    planning: true,
    alertLevel: 0,
    alarmState: "quiet",
    reinforcementTimer: null,
    shotIndex: 0,
    selectedUnitIds: [units[0].id],
    units,
    enemies,
    interactables,
    soundEvents: [],
    effects: [],
    objectives: Object.fromEntries([...objectiveIds].map((objectiveId) => [objectiveId, false])),
    operationRuntime: authoredLayout ? CreateOperationRuntime(authoredLayout.id) : null,
    civilians: [],
    civilianRoutes: Object.fromEntries(
      (authoredLayout?.civilianRoutes ?? []).map((route) => [
        route.id,
        { id: route.id, active: false, completed: false, pointIndex: 0, progress: 0 },
      ]),
    ),
    environment: {
      generatorDisabled: false,
      alarmBellDisabled: false,
      eastRoadBlocked: false,
      dustCloud: null,
      flags: {},
      disabledLighting: [],
      blockedRoutes: [],
      soundMasks: [],
      concealmentZones: [],
      patrolRouteOverrides: {},
      disabledReinforcements: [],
      enabledReinforcements: [],
      reinforcementDelaySeconds: 0,
    },
    ledger: {
      civilianHarm: 0,
      civilianRisk: 0,
      shotsFired: 0,
      alarmsRaised: 0,
      enemiesKilled: 0,
      enemiesDisabled: 0,
      woundedOperatives: 0,
    },
    supplies: {
      medicine: 0,
      tools: 0,
      radioParts: 0,
      ammunition: 0,
    },
    extractionZones: mission.extractionZones.map((zone) => ({ ...zone })),
    outcome: null,
    coordination: {
      comboCount: 0,
      lastCombo: null,
      diversion: null,
    },
    tacticalDirector: {
      pressure: 0,
      lastProgress: 0,
      lastProgressTime: 0,
      sweepCount: 0,
      sweepCooldown: 0,
    },
    messages: [
      {
        time: 0,
        kind: "brief",
        text: authoredLayout
          ? `秦素秋：${authoredLayout.gameplayIdentity}`
          : "秦素秋：先把道路、岗楼和撤路看明白。",
      },
      { time: 0, kind: "objective", text: operation.summary },
    ],
  };
}

export function QueueCommand(state, unitId, command, append = false) {
  const unit = state.units.find((candidate) => candidate.id === unitId);
  if (!unit || unit.state === "downed" || unit.state === "evacuated") return false;
  if (!append) {
    unit.queue = [];
    unit.command = null;
  }
  const plannedActionCount = unit.queue.length + (unit.command ? 1 : 0);
  if (plannedActionCount >= simulationConfig.maximumQueueLength) return false;
  unit.queue.push({ ...command, id: `${unitId}_${state.time}_${unit.queue.length}` });
  return true;
}

function RecordCoordinationCombo(state, comboId, participants, targetIds = []) {
  state.coordination ??= { comboCount: 0, lastCombo: null, diversion: null };
  state.coordination.comboCount += 1;
  state.coordination.lastCombo = {
    id: comboId,
    participants: [...participants],
    targetIds: [...targetIds],
    time: state.time,
  };
  return comboId;
}

export function CanBuddyRescue(state, rescuerId, patientId) {
  const rescuer = state.units.find((unit) => unit.id === rescuerId);
  const patient = state.units.find((unit) => unit.id === patientId);
  if (!rescuer || !patient || rescuer.id === patient.id) return false;
  if (rescuer.state !== "ready" || patient.state !== "downed" || rescuer.suppression >= 85) return false;
  return Distance(rescuer, patient) <= 3.2;
}

/** Any teammate can buy bleeding time; only the medic's aid restores withdrawal capability. */
export function ApplyBuddyRescue(state, rescuerId, patientId) {
  if (!CanBuddyRescue(state, rescuerId, patientId)) return { success: false, reason: "unavailable" };
  const rescuer = state.units.find((unit) => unit.id === rescuerId);
  const patient = state.units.find((unit) => unit.id === patientId);
  const profile = GetCharacterDefinition(rescuer.id)?.tacticalProfile;
  const skill = profile?.rescueSkill ?? 1;
  patient.downedTimer = Math.max(patient.downedTimer ?? 0, 12 + skill * 4);
  patient.buddyRescuedBy = rescuer.id;
  rescuer.rescueCommitmentUntil = state.time + 5;
  rescuer.suppression = Clamp(rescuer.suppression + 8, 0, 100);
  return {
    success: true,
    patientId,
    rescuerId,
    bleedingSeconds: patient.downedTimer,
    fullStabilization: false,
  };
}

export function ApplyAbilityCommand(state, unitId, command) {
  const unit = state.units.find((candidate) => candidate.id === unitId);
  if (!unit || !command || command.resolved) return { success: false, reason: "alreadyResolved" };
  const ability = GetCharacterDefinition(unit.id)?.abilities.find((candidate) => candidate.id === command.kind);
  const fail = (reason) => {
    command.resolved = true;
    return { success: false, reason };
  };
  if (!ability || unit.state === "downed" || unit.state === "wounded") return fail("unavailable");
  if ((unit.cooldowns[command.kind] ?? 0) > 0) return fail("cooldown");
  if (ability.charges && (unit.charges[command.kind] ?? 0) <= 0) return fail("charges");

  const result = { success: true, action: command.kind, affectedEnemyIds: [] };
  if (command.kind === "observe") {
    const enemy = state.enemies.find((candidate) => candidate.id === command.targetId);
    if (!enemy || enemy.disabled || Distance(unit, enemy) > 26 || !HasLineOfSight(unit, enemy)) return fail("targetLost");
    enemy.revealedTimer = 18;
    enemy.markedUntil = state.time + 18;
    enemy.markedBy = unit.id;
    enemy.awareness = Math.max(enemy.awareness, 4);
    result.targetId = enemy.id;
    if ((enemy.pinnedUntil ?? 0) > state.time) {
      enemy.morale = Clamp(enemy.morale - 14, 0, 100);
      enemy.isolatedUntil = state.time + 9;
      result.combo = RecordCoordinationCombo(state, "markAndPin", [unit.id, enemy.pinnedBy], [enemy.id]);
    }
  } else if (command.kind === "stone") {
    if (Distance(unit, command) > 16) return fail("outOfRange");
    state.soundEvents.push(CreateSoundEvent(command, 14, "stone", unit.id, state.time));
    state.coordination ??= { comboCount: 0, lastCombo: null, diversion: null };
    state.coordination.diversion = { x: command.x, z: command.z, expiresAt: state.time + 8, sourceId: unit.id };
    result.position = { x: command.x, z: command.z };
    const coveringUnit = state.units.find(
      (ally) => ally.id !== unit.id && (ally.overwatchTimer ?? 0) > 0 && Distance(ally, command) <= 18,
    );
    if (coveringUnit) {
      coveringUnit.overwatchTimer += 4;
      result.combo = RecordCoordinationCombo(state, "baitedCrossfire", [unit.id, coveringUnit.id]);
    }
  } else if (command.kind === "aid") {
    const patient = state.units.find((candidate) => candidate.id === command.targetId);
    if (!patient || patient.state !== "downed" || Distance(unit, patient) > 6) return fail("targetLost");
    patient.stabilized = true;
    patient.downedTimer = null;
    patient.state = "wounded";
    const assistant = state.units
      .filter(
        (ally) =>
          ally.id !== unit.id &&
          ally.id !== patient.id &&
          ally.state === "ready" &&
          ally.suppression < 75 &&
          Distance(ally, patient) <= 4,
      )
      .sort((left, right) => Distance(left, patient) - Distance(right, patient))[0];
    patient.health = Math.max(assistant ? 28 : 18, patient.health);
    patient.stance = "crouch";
    result.targetId = patient.id;
    if (assistant) {
      patient.escortGuardId = assistant.id;
      patient.rescueCoverUntil = state.time + 12;
      assistant.rescueCoverUntil = state.time + 12;
      assistant.suppression = Math.max(0, assistant.suppression - 18);
      result.assistantId = assistant.id;
      result.combo = RecordCoordinationCombo(state, "buddyEvacuation", [unit.id, assistant.id], [patient.id]);
    }
  } else if (command.kind === "steady") {
    result.allyIds = [];
    for (const ally of state.units) {
      if (Distance(unit, ally) > 8) continue;
      ally.suppression = Math.max(0, ally.suppression - 70);
      ally.steadyUntil = state.time + 12;
      if ((ally.overwatchTimer ?? 0) > 0) ally.overwatchTimer += 4;
      result.allyIds.push(ally.id);
    }
    if (result.allyIds.some((allyId) => state.units.find((ally) => ally.id === allyId)?.overwatchTimer > 10)) {
      result.combo = RecordCoordinationCombo(state, "holdTheLine", [unit.id, ...result.allyIds]);
    }
  } else if (command.kind === "suppress") {
    if (unit.ammo < 6 || Distance(unit, command) > 20) return fail("outOfRange");
    const direction = Math.atan2(command.x - unit.x, command.z - unit.z);
    unit.facing = direction;
    unit.ammo -= 6;
    state.ledger.shotsFired += 6;
    for (const enemy of state.enemies) {
      const distance = Distance(unit, enemy);
      const enemyDirection = Math.atan2(enemy.x - unit.x, enemy.z - unit.z);
      const difference = Math.abs(NormalizeAngle(enemyDirection - direction));
      if (enemy.disabled || distance > 18 || difference > 0.52 || !HasLineOfSight(unit, enemy)) continue;
      const marked = (enemy.markedUntil ?? 0) > state.time;
      enemy.suppression = Clamp(enemy.suppression + (marked ? 86 : 68), 0, 100);
      enemy.morale = Clamp(enemy.morale - (marked ? 30 : 18), 0, 100);
      enemy.pinnedBy = unit.id;
      enemy.pinnedUntil = state.time + 8;
      if (marked) enemy.isolatedUntil = state.time + 9;
      result.affectedEnemyIds.push(enemy.id);
    }
    const maneuveringAllies = state.units.filter(
      (ally) => ally.id !== unit.id && ally.state === "ready" && Distance(unit, ally) <= 11,
    );
    for (const ally of maneuveringAllies) ally.maneuverWindowUntil = state.time + 8;
    result.maneuveringAllyIds = maneuveringAllies.map((ally) => ally.id);
    const markedTargets = result.affectedEnemyIds.filter(
      (enemyId) => (state.enemies.find((enemy) => enemy.id === enemyId)?.markedUntil ?? 0) > state.time,
    );
    if (markedTargets.length > 0) {
      const spotterId = state.enemies.find((enemy) => enemy.id === markedTargets[0])?.markedBy ?? "qinSuqiu";
      result.combo = RecordCoordinationCombo(state, "markAndPin", [spotterId, unit.id], markedTargets);
    }
    state.soundEvents.push(CreateSoundEvent(unit, 58, "gunshot", unit.id, state.time));
    result.position = { x: command.x, z: command.z };
  } else if (command.kind === "overwatch") {
    const ally = state.units.find((candidate) => candidate.id === command.targetId);
    if (!ally || ally.state !== "ready" || Distance(unit, ally) > 9) return fail("targetLost");
    unit.overwatchTimer = 10;
    ally.overwatchTimer = 10;
    const linkKind =
      ally.id === "qinSuqiu"
        ? "reconnaissanceCover"
        : ally.id === "hanShilei"
          ? "breachCover"
          : ally.id === "luLanzhi"
            ? "rescueCover"
            : "crossWatch";
    unit.coordinationLink = { partnerId: ally.id, kind: linkKind, expiresAt: state.time + 10 };
    ally.coordinationLink = { partnerId: unit.id, kind: linkKind, expiresAt: state.time + 10 };
    if (linkKind === "rescueCover") ally.rescueCoverUntil = state.time + 10;
    result.combo = RecordCoordinationCombo(state, linkKind, [unit.id, ally.id]);
    result.targetId = ally.id;
  } else {
    return fail("unsupported");
  }

  if (state.soundEvents.length > 64) state.soundEvents.splice(0, state.soundEvents.length - 64);
  if (ability.charges) unit.charges[command.kind] -= 1;
  unit.cooldowns[command.kind] = ability.cooldown;
  command.resolved = true;
  return result;
}

export function GetMissionEvaluation(state) {
  const deployedUnits = state.units;
  const deadCount = deployedUnits.filter((unit) => unit.state === "dead").length;
  const evacuated = deployedUnits.filter((unit) => unit.state === "evacuated").length;
  const objectives = state.objectives;
  const requiredObjectiveIds = (state.mainObjectiveIds ?? ["ledger", "relay", "allExtracted"]).filter(
    (objectiveId) => objectiveId !== "allExtracted",
  );
  const completedRequired = requiredObjectiveIds.filter((objectiveId) => objectives[objectiveId]).length;
  const civilians = Clamp(
    35 -
      state.ledger.civilianHarm * 20 -
      state.ledger.civilianRisk * 4 -
      (state.ledger.civilianDisplacement ?? 0) * 3,
    0,
    35,
  );
  const completeness = (completedRequired / Math.max(1, requiredObjectiveIds.length)) * 25;
  const discipline = Clamp(
    25 - state.ledger.alarmsRaised * 6 - Math.max(0, state.ledger.shotsFired - 8) * 0.35,
    0,
    25,
  );
  const preservation = Clamp(
    (evacuated / Math.max(1, deployedUnits.length)) * 15 - deadCount * 8 - state.ledger.woundedOperatives * 2,
    0,
    15,
  );
  const score = Math.round(Clamp(civilians + Math.min(25, completeness) + discipline + preservation, 0, 100));
  const complete =
    completedRequired === requiredObjectiveIds.length &&
    deadCount === 0 &&
    evacuated === deployedUnits.length &&
    deployedUnits.length > 0;
  const noCivilianCost =
    state.ledger.civilianHarm === 0 &&
    state.ledger.civilianRisk === 0 &&
    (state.ledger.civilianDisplacement ?? 0) === 0;
  let grade = score >= 90 && complete && noCivilianCost ? "S" : score >= 78 && complete ? "A" : score >= 62 ? "B" : score >= 45 ? "C" : "D";
  if (!complete && (grade === "S" || grade === "A")) grade = "B";
  return {
    score,
    grade,
    complete,
    sections: { civilians: Math.round(civilians), completeness: Math.min(25, completeness), discipline: Math.round(discipline), preservation: Math.round(preservation) },
    summary: complete
      ? `${state.operation?.name ?? "行动"}完成，小队带着人员与物资离开封锁区。`
      : "行动留下缺口，但仍有人与物资被带了回来。",
  };
}

export function PrepareMissionFromCamp(missionState, campState) {
  const campaignIndex = campState.completedMissions % operationLayoutDefinitions.length;
  const layout = GetOperationLayoutByCampaignIndex(campaignIndex);
  const next = CreateInitialMissionState(missionState?.seed ?? 19411018, layout, campaignIndex);
  const operation = next.operation;
  next.messages = [
    { time: 0, kind: "brief", text: `秦素秋：下一项行动是“${operation.name}”，先确认巡逻、群众路线与撤路。` },
    { time: 0, kind: "objective", text: operation.summary },
  ];
  const rosterById = new Map(campState.roster.map((operative) => [operative.id, operative]));
  next.units = next.units.filter((unit) => {
    const operative = rosterById.get(unit.id);
    return !operative || (!operative.lost && operative.available && operative.wounds < 2);
  });
  if (next.operationRuntime) {
    next.operationRuntime.deployedActorIds = next.units.map((unit) => unit.id);
  }
  for (const unit of next.units) {
    const operative = rosterById.get(unit.id) ?? { wounds: 0, fatigue: 0 };
    const clinicLevel = campState.facilities.clinic ?? 1;
    const trainingLevel = campState.facilities.training ?? 0;
    const woundMultiplier = operative.wounds > 0 ? Math.min(0.92, 0.72 + clinicLevel * 0.06) : 1;
    unit.maximumHealth = Math.max(1, Math.round(unit.maximumHealth * woundMultiplier));
    unit.health = Math.min(unit.health, unit.maximumHealth);
    unit.morale = Math.max(55, 100 - operative.fatigue * 10 + trainingLevel * 4);
    unit.speedMultiplier = Math.max(0.7, 1 - operative.fatigue * 0.08 + trainingLevel * 0.025);
    unit.suppressionRecoveryMultiplier = 1 + trainingLevel * 0.12;
    unit.campWounds = operative.wounds;
    unit.campFatigue = operative.fatigue;
  }
  const medic = next.units.find((unit) => unit.id === "luLanzhi");
  if (medic && (campState.facilities.clinic ?? 1) >= 2) medic.charges.aid += 1;
  next.selectedUnitIds = next.units.length > 0 ? [next.units[0].id] : [];
  next.units.forEach((unit, index) => { unit.selected = index === 0; });
  const workshopLevel = campState.facilities.workshop ?? 0;
  const sapper = next.units.find((unit) => unit.id === "hanShilei");
  if (sapper && workshopLevel >= 2) sapper.charges.charge += Math.floor(workshopLevel / 2);
  const intelligenceLevel = campState.facilities.intelligence ?? 0;
  const patrols = next.enemies.filter((enemy) => enemy.patrol);
  const intelFreshness = campState.readiness?.intelFreshness ?? 0;
  patrols.slice(0, intelligenceLevel * 2 + intelFreshness).forEach((enemy) => { enemy.discovered = true; });
  const workshopNoise = campState.readiness?.workshopNoise ?? 0;
  if (workshopNoise > 0 && campState.lastDecisionId === "repair") {
    next.environment.campSignature = workshopNoise;
    next.enemies.slice(0, workshopNoise).forEach((enemy) => {
      enemy.awareness = Math.max(enemy.awareness, 12);
      enemy.state = "suspicious";
    });
  }
  next.preparation = {
    clinicLevel: campState.facilities.clinic ?? 1,
    workshopLevel,
    intelligenceLevel,
    trainingLevel: campState.facilities.training ?? 0,
    lastDecisionId: campState.lastDecisionId ?? null,
    intelFreshness,
    workshopNoise,
    knownPatrolIds: patrols.filter((enemy) => enemy.discovered).map((enemy) => enemy.id),
  };
  return next;
}

export function CreateInitialCampState() {
  return {
    day: 1,
    sorties: 0,
    lastDecisionSortie: -1,
    lastDecisionId: null,
    decisionHistory: [],
    resources: { medicine: 1, tools: 1, radioParts: 0, food: 4, trust: 50 },
    facilities: { clinic: 1, workshop: 1, intelligence: 0, training: 0 },
    readiness: { intelFreshness: 0, workshopNoise: 0, villageSupport: 0 },
    roster: characterDefinitions.map((character) => ({ id: character.id, wounds: 0, fatigue: 0, available: true, lost: false })),
    civilianCostLedger: { harm: 0, risk: 0, displacement: 0 },
    completedMissions: 0,
  };
}

export function ApplyMissionToCamp(campState, missionState) {
  const next = structuredClone(campState);
  next.sorties = (next.sorties ?? 0) + 1;
  next.readiness ??= { intelFreshness: 0, workshopNoise: 0, villageSupport: 0 };
  next.readiness.intelFreshness = Math.max(0, (next.readiness.intelFreshness ?? 0) - 1);
  next.readiness.workshopNoise = Math.max(0, (next.readiness.workshopNoise ?? 0) - 1);
  if (GetMissionEvaluation(missionState).complete) next.completedMissions += 1;
  next.day += 2;
  next.resources.medicine += missionState.supplies.medicine;
  next.resources.tools += missionState.supplies.tools;
  next.resources.radioParts += missionState.supplies.radioParts;
  next.resources.trust = Clamp(
    next.resources.trust +
      (missionState.objectives.detainee ? 5 : 0) +
      (missionState.objectives.seedGrain ? 7 : 0) -
      missionState.ledger.civilianRisk * 3 -
      missionState.ledger.civilianHarm * 12 -
      (missionState.ledger.civilianDisplacement ?? 0) * 2,
    0,
    100,
  );
  next.civilianCostLedger ??= { harm: 0, risk: 0, displacement: 0 };
  next.civilianCostLedger.displacement ??= 0;
  next.civilianCostLedger.harm += missionState.ledger.civilianHarm;
  next.civilianCostLedger.risk += missionState.ledger.civilianRisk;
  next.civilianCostLedger.displacement += missionState.ledger.civilianDisplacement ?? 0;
  for (const operative of next.roster) {
    const unit = missionState.units.find((candidate) => candidate.id === operative.id);
    if (!unit) continue;
    if (unit.state === "dead") {
      operative.wounds = 3;
      operative.available = false;
      operative.lost = true;
      continue;
    }
    operative.wounds = unit.state === "downed" || unit.health < unit.maximumHealth * 0.5 ? 2 : unit.health < unit.maximumHealth ? 1 : 0;
    operative.fatigue = Clamp(operative.fatigue + 1, 0, 3);
    operative.available = !operative.lost && operative.wounds < 2;
  }
  return next;
}

export function GetCampDecisionOptions(campState) {
  const clinicLevel = campState.facilities.clinic ?? 1;
  const workshopLevel = campState.facilities.workshop ?? 1;
  const intelligenceLevel = campState.facilities.intelligence ?? 0;
  const decisionSpent = campState.lastDecisionSortie === (campState.sorties ?? 0);
  return [
    {
      id: "treat",
      available:
        !decisionSpent &&
        campState.resources.medicine >= (clinicLevel >= 3 ? 2 : 1) &&
        campState.roster.some((operative) => !operative.lost && operative.wounds > 0),
      costs: { medicine: clinicLevel >= 3 ? 2 : 1, opportunity: "workshopSignalsTraining" },
      payoff: "recoverWoundedAndClinicCapacity",
    },
    {
      id: "repair",
      available: !decisionSpent && campState.resources.tools >= (workshopLevel >= 2 ? 2 : 1),
      costs: { tools: workshopLevel >= 2 ? 2 : 1, fatigue: 1, opportunity: "medicalSignalsTraining" },
      payoff: "demolitionCapacity",
    },
    {
      id: "decode",
      available: !decisionSpent && campState.resources.radioParts >= (intelligenceLevel >= 2 ? 2 : 1),
      costs: { radioParts: intelligenceLevel >= 2 ? 2 : 1, scoutFatigue: 1, opportunity: "medicalWorkshopTraining" },
      payoff: "freshPatrolIntel",
    },
    {
      id: "rest",
      available: !decisionSpent && campState.resources.food >= 1,
      costs: { food: 1, intelFreshness: 1, opportunity: "medicalWorkshopSignals" },
      payoff: "fatigueRecoveryAndTraining",
    },
  ];
}

export function ApplyCampAction(campState, actionId) {
  const next = structuredClone(campState);
  next.readiness ??= { intelFreshness: 0, workshopNoise: 0, villageSupport: 0 };
  next.decisionHistory ??= [];
  const currentSortie = next.sorties ?? 0;
  if (next.lastDecisionSortie === currentSortie) {
    return { state: campState, success: false, message: "本次出击后的整备窗口已经用于另一项工作。" };
  }
  const CommitDecision = (message) => {
    next.lastDecisionSortie = currentSortie;
    next.lastDecisionId = actionId;
    next.decisionHistory.push({ sortie: currentSortie, day: next.day, actionId });
    if (next.decisionHistory.length > 12) next.decisionHistory.shift();
    return { state: next, success: true, message };
  };
  if (actionId === "treat") {
    const patient = next.roster.find((operative) => !operative.lost && operative.wounds > 0);
    const medicineCost = (next.facilities.clinic ?? 1) >= 3 ? 2 : 1;
    if (next.resources.medicine < medicineCost) {
      return { state: campState, success: false, message: "药品不足，无法维持当前救护等级的轮值。" };
    }
    if (!patient || next.resources.medicine < 1) return { state: campState, success: false, message: "没有可用药品或没有需要处理的伤员。" };
    next.resources.medicine -= medicineCost;
    patient.wounds -= 1;
    patient.fatigue = Math.max(0, patient.fatigue - 1);
    patient.available = patient.wounds < 2;
    next.facilities.clinic = Math.min(3, (next.facilities.clinic ?? 1) + 1);
    next.day += 1;
    return CommitDecision("救护轮值处理一名伤员；本轮无法同时升级工坊、情报或训练。");
  }
  if (actionId === "repair") {
    const toolCost = (next.facilities.workshop ?? 1) >= 2 ? 2 : 1;
    if (next.resources.tools < toolCost) return { state: campState, success: false, message: "工具不足。" };
    next.resources.tools -= toolCost;
    next.facilities.workshop = Math.min(3, next.facilities.workshop + 1);
    const engineer = next.roster.find((operative) => operative.id === "hanShilei" && !operative.lost);
    if (engineer) engineer.fatigue = Clamp(engineer.fatigue + 1, 0, 3);
    next.readiness.workshopNoise = Math.min(3, (next.readiness.workshopNoise ?? 0) + 1);
    return CommitDecision("工坊赶制破袭器材；工程员承担额外疲劳，且本轮放弃其他整备。");
  }
  if (actionId === "decode") {
    const partsCost = (next.facilities.intelligence ?? 0) >= 2 ? 2 : 1;
    if (next.resources.radioParts < partsCost) return { state: campState, success: false, message: "收报机零件不足。" };
    next.resources.radioParts -= partsCost;
    next.facilities.intelligence = Math.min(3, next.facilities.intelligence + 1);
    const scout = next.roster.find((operative) => operative.id === "qinSuqiu" && !operative.lost);
    if (scout) scout.fatigue = Clamp(scout.fatigue + 1, 0, 3);
    next.readiness.intelFreshness = 3;
    return CommitDecision("情报角通宵守听，换来下一次行动的鲜活巡逻情报；联络员承担疲劳。");
  }
  if (actionId === "rest") {
    for (const operative of next.roster) {
      if (!operative.lost) operative.fatigue = Math.max(0, operative.fatigue - 1);
    }
    const deployable = next.roster.some((operative) => !operative.lost && operative.available && operative.wounds < 2);
    if (!deployable) {
      const recovering = next.roster.find((operative) => !operative.lost && operative.wounds >= 2);
      if (!recovering) {
        return { state: campState, success: false, message: "行动组已全部失联；只能结束本档并重建行动组。" };
      }
      if (recovering) {
        recovering.wounds = 1;
        recovering.available = true;
      }
      next.resources.food = Math.max(0, next.resources.food - 2);
      next.day += 4;
      return CommitDecision("行动组停留四日疗养并消耗两份口粮；一名重伤队员恢复到可带伤行动。");
    }
    if (next.resources.food < 1) return { state: campState, success: false, message: "口粮不足，无法组织完整休整。" };
    next.resources.food -= 1;
    next.day += 1;
    next.facilities.training = Math.min(3, (next.facilities.training ?? 0) + 1);
    next.readiness.intelFreshness = Math.max(0, (next.readiness.intelFreshness ?? 0) - 1);
    return CommitDecision("全队消耗一份口粮休整复盘；恢复疲劳并训练，但旧敌情进一步失效。");
  }
  return { state: campState, success: false, message: "未知营地行动。" };
}
