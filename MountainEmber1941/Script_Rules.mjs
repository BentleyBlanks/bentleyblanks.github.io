import { characterDefinitions, GetCharacterDefinition, GetEnemyRoleDefinition } from "./Data_Characters.mjs";
import { campaignOperationDefinitions, missionDefinition } from "./Data_Mission.mjs";

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

export function SegmentIntersectsBox(start, end, box, padding = 0) {
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
      if (origin < minimum || origin > maximum) return false;
      continue;
    }
    const inverse = 1 / delta;
    let enter = (minimum - origin) * inverse;
    let leave = (maximum - origin) * inverse;
    if (enter > leave) [enter, leave] = [leave, enter];
    minimumTime = Math.max(minimumTime, enter);
    maximumTime = Math.min(maximumTime, leave);
    if (minimumTime > maximumTime) return false;
  }
  return true;
}

export function HasLineOfSight(start, end, obstacles = missionDefinition.obstacles) {
  return !obstacles.some((obstacle) => {
    if (obstacle.kind === "tower" && PointInsideBox(start, obstacle, -0.05)) return false;
    return SegmentIntersectsBox(start, end, obstacle, -0.08);
  });
}

export function IsNavigationBlocked(
  position,
  obstacles = missionDefinition.obstacles,
  bounds = missionDefinition.bounds,
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
  const obstacles = options.obstacles ?? missionDefinition.obstacles;
  const bounds = options.bounds ?? missionDefinition.bounds;
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

export function GetCoverAt(position, threatPosition = null, obstacles = missionDefinition.obstacles) {
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

export function GetBallisticImpact(start, end, obstacles = missionDefinition.obstacles) {
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

export function IsPositionLit(position, environment = {}, lightingZones = missionDefinition.lightingZones ?? []) {
  return lightingZones.some((zone) => {
    if (zone.generatorDependent && environment.generatorDisabled) return false;
    if (zone.kind === "circle") return DistanceSquared(position, zone) <= zone.radius * zone.radius;
    if (zone.kind === "box") return PointInsideBox(position, zone);
    return false;
  });
}

export function CanFriendlySeeEnemy(observer, enemy, obstacles = missionDefinition.obstacles) {
  if (["downed", "dead", "evacuated", "unavailable"].includes(observer.state)) return false;
  if (enemy.bodyHidden) return false;
  const sight = observer.id === "qinSuqiu" ? simulationConfig.scoutSight : simulationConfig.friendlySight;
  const lightBonus = IsPositionLit(enemy) ? 1.18 : 1;
  if (Distance(observer, enemy) > sight * lightBonus) return false;
  return HasLineOfSight(observer, enemy, obstacles);
}

/** Updates only the squad's intelligence record; AI truth remains on the enemy object. */
export function UpdateEnemyIntel(state, deltaTime = 0, obstacles = missionDefinition.obstacles) {
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
    const currentlyVisible = state.units.some((unit) => CanFriendlySeeEnemy(unit, enemy, obstacles));
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

export function GetZoneAt(position) {
  return missionDefinition.zones.find((zone) => PointInsideBox(position, zone)) ?? null;
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

export function CanSee(observer, target, obstacles = missionDefinition.obstacles) {
  const role = GetEnemyRoleDefinition(observer.role);
  const distance = Distance(observer, target);
  if (distance > role.sight) return false;
  const targetAngle = Math.atan2(target.x - observer.x, target.z - observer.z);
  const angleDelta = Math.abs(NormalizeAngle(targetAngle - observer.facing));
  const insideCentral = angleDelta <= role.fov * 0.5;
  const insidePeripheral = distance <= role.peripheralSight && angleDelta <= Math.PI * 0.72;
  if (!insideCentral && !insidePeripheral) return false;
  return HasLineOfSight(observer, target, obstacles);
}

export function CalculateAwarenessRate(observer, target) {
  const role = GetEnemyRoleDefinition(observer.role);
  const distanceFactor = Clamp(1 - Distance(observer, target) / role.sight, 0.08, 1);
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

export function CreateInitialMissionState(seed = 19411018) {
  const operation = campaignOperationDefinitions[0];
  const units = characterDefinitions.map((definition, index) => {
    const spawn = missionDefinition.playerSpawns[index];
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
    };
  });

  const enemies = missionDefinition.enemies.map((definition, index) => {
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
    };
  });

  const interactables = Object.fromEntries(
    missionDefinition.interactables.map((definition) => [
      definition.id,
      {
        id: definition.id,
        completed: false,
        progress: 0,
        droppedAt: null,
        discovered: definition.kind === "objective" || definition.id === "alarmBell",
      },
    ]),
  );

  return {
    version: 1,
    seed,
    operation: { ...operation, mainObjectiveIds: [...operation.mainObjectiveIds] },
    mainObjectiveIds: [...operation.mainObjectiveIds, "allExtracted"],
    time: 0,
    phase: "recon",
    paused: true,
    planning: true,
    alertLevel: 0,
    alarmState: "quiet",
    reinforcementTimer: null,
    selectedUnitIds: [units[0].id],
    units,
    enemies,
    interactables,
    soundEvents: [],
    effects: [],
    objectives: {
      ledger: false,
      relay: false,
      allExtracted: false,
      detainee: false,
      medicines: false,
      radioParts: false,
      tools: false,
      seedGrain: false,
      generator: false,
      alarmBell: false,
      rockfall: false,
    },
    environment: {
      generatorDisabled: false,
      alarmBellDisabled: false,
      eastRoadBlocked: false,
      dustCloud: null,
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
    extractionZones: missionDefinition.extractionZones.map((zone) => ({ ...zone })),
    outcome: null,
    messages: [
      { time: 0, kind: "brief", text: "秦素秋：电话桅杆、桥、岗楼都在眼前。先把路看明白。" },
      { time: 0, kind: "objective", text: "目标：取得换防传令簿与线路图，剪断据点有线联络，全员撤离。" },
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
    enemy.awareness = Math.max(enemy.awareness, 4);
    result.targetId = enemy.id;
  } else if (command.kind === "stone") {
    if (Distance(unit, command) > 16) return fail("outOfRange");
    state.soundEvents.push(CreateSoundEvent(command, 14, "stone", unit.id, state.time));
    result.position = { x: command.x, z: command.z };
  } else if (command.kind === "aid") {
    const patient = state.units.find((candidate) => candidate.id === command.targetId);
    if (!patient || patient.state !== "downed" || Distance(unit, patient) > 6) return fail("targetLost");
    patient.stabilized = true;
    patient.downedTimer = null;
    patient.state = "wounded";
    patient.health = Math.max(18, patient.health);
    patient.stance = "crouch";
    result.targetId = patient.id;
  } else if (command.kind === "steady") {
    result.allyIds = [];
    for (const ally of state.units) {
      if (Distance(unit, ally) > 8) continue;
      ally.suppression = Math.max(0, ally.suppression - 70);
      result.allyIds.push(ally.id);
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
      enemy.suppression = Clamp(enemy.suppression + 68, 0, 100);
      enemy.morale = Clamp(enemy.morale - 18, 0, 100);
      result.affectedEnemyIds.push(enemy.id);
    }
    state.soundEvents.push(CreateSoundEvent(unit, 58, "gunshot", unit.id, state.time));
    result.position = { x: command.x, z: command.z };
  } else if (command.kind === "overwatch") {
    const ally = state.units.find((candidate) => candidate.id === command.targetId);
    if (!ally || ally.state !== "ready" || Distance(unit, ally) > 9) return fail("targetLost");
    unit.overwatchTimer = 10;
    ally.overwatchTimer = 10;
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
  const civilians = Clamp(35 - state.ledger.civilianHarm * 20 - state.ledger.civilianRisk * 4, 0, 35);
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
  let grade = score >= 90 && complete && state.ledger.civilianHarm === 0 ? "S" : score >= 78 && complete ? "A" : score >= 62 ? "B" : score >= 45 ? "C" : "D";
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
  const next = structuredClone(missionState);
  const operation = campaignOperationDefinitions[campState.completedMissions % campaignOperationDefinitions.length];
  next.operation = { ...operation, mainObjectiveIds: [...operation.mainObjectiveIds] };
  next.mainObjectiveIds = [...operation.mainObjectiveIds, "allExtracted"];
  next.messages = [
    { time: 0, kind: "brief", text: `秦素秋：下一项行动是“${operation.name}”，先确认巡逻与撤路。` },
    { time: 0, kind: "objective", text: operation.summary },
  ];
  const rosterById = new Map(campState.roster.map((operative) => [operative.id, operative]));
  next.units = next.units.filter((unit) => {
    const operative = rosterById.get(unit.id);
    return !operative || (!operative.lost && operative.available && operative.wounds < 2);
  });
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
  patrols.slice(0, intelligenceLevel * 2).forEach((enemy) => { enemy.discovered = true; });
  next.preparation = {
    clinicLevel: campState.facilities.clinic ?? 1,
    workshopLevel,
    intelligenceLevel,
    trainingLevel: campState.facilities.training ?? 0,
    knownPatrolIds: patrols.filter((enemy) => enemy.discovered).map((enemy) => enemy.id),
  };
  return next;
}

export function CreateInitialCampState() {
  return {
    day: 1,
    resources: { medicine: 1, tools: 1, radioParts: 0, food: 4, trust: 50 },
    facilities: { clinic: 1, workshop: 1, intelligence: 0, training: 0 },
    roster: characterDefinitions.map((character) => ({ id: character.id, wounds: 0, fatigue: 0, available: true, lost: false })),
    civilianCostLedger: { harm: 0, risk: 0 },
    completedMissions: 0,
  };
}

export function ApplyMissionToCamp(campState, missionState) {
  const next = structuredClone(campState);
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
      missionState.ledger.civilianHarm * 12,
    0,
    100,
  );
  next.civilianCostLedger.harm += missionState.ledger.civilianHarm;
  next.civilianCostLedger.risk += missionState.ledger.civilianRisk;
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

export function ApplyCampAction(campState, actionId) {
  const next = structuredClone(campState);
  if (actionId === "treat") {
    const patient = next.roster.find((operative) => !operative.lost && operative.wounds > 0);
    if (!patient || next.resources.medicine < 1) return { state: campState, success: false, message: "没有可用药品或没有需要处理的伤员。" };
    next.resources.medicine -= 1;
    patient.wounds -= 1;
    patient.available = patient.wounds < 2;
    next.facilities.clinic = Math.min(3, (next.facilities.clinic ?? 1) + 1);
    return { state: next, success: true, message: "救护所处理了一名伤员并完善流程；等级提高会改善带伤出动与救护携行量。" };
  }
  if (actionId === "repair") {
    if (next.resources.tools < 1) return { state: campState, success: false, message: "工具不足。" };
    next.resources.tools -= 1;
    next.facilities.workshop = Math.min(3, next.facilities.workshop + 1);
    return { state: next, success: true, message: "工坊完成了一次修整，下次任务可多带一件破袭器材。" };
  }
  if (actionId === "decode") {
    if (next.resources.radioParts < 1) return { state: campState, success: false, message: "缺少收报机零件。" };
    next.resources.radioParts -= 1;
    next.facilities.intelligence = Math.min(3, next.facilities.intelligence + 1);
    return { state: next, success: true, message: "情报角恢复收报，下次任务会提前揭示一段巡逻。" };
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
      return {
        state: next,
        success: true,
        message: "行动组停留四日疗养并消耗 2 份口粮；一名重伤队员恢复到可带伤行动。",
      };
    }
    next.day += 1;
    next.facilities.training = Math.min(3, (next.facilities.training ?? 0) + 1);
    return { state: next, success: true, message: "全队休整并复盘一日；训练等级提高会改善士气、移速与压制恢复。" };
  }
  return { state: campState, success: false, message: "未知营地行动。" };
}
