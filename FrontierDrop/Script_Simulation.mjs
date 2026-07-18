/**
 * Frontier Drop deterministic battle-royale simulation.
 *
 * The module deliberately has no browser, rendering, network, or timer
 * dependencies.  A host can serialize the returned state, broadcast it on a
 * LAN, and replay a match by submitting the same inputs with the same dt.
 */

export const WORLD_SIZE = 1000;
export const ACTOR_MIN = 24;
export const ACTOR_MAX = 32;
export const MATCH_PHASES = Object.freeze([
  "lobby",
  "flight",
  "drop",
  "combat",
  "results",
]);

export const WEAPON_DATA = Object.freeze({
  PulseCarbine: Object.freeze({
    id: "PulseCarbine",
    displayName: "Pulse Carbine",
    damage: 22,
    range: 178,
    fireInterval: 0.16,
    magazineSize: 28,
    reloadDuration: 1.7,
    spread: 0.011,
    preferredRange: 82,
    rank: 2,
  }),
  RivetSmg: Object.freeze({
    id: "RivetSmg",
    displayName: "Rivet SMG",
    damage: 16,
    range: 116,
    fireInterval: 0.095,
    magazineSize: 36,
    reloadDuration: 1.45,
    spread: 0.021,
    preferredRange: 48,
    rank: 1,
  }),
  ScoutRifle: Object.freeze({
    id: "ScoutRifle",
    displayName: "Scout Rifle",
    damage: 36,
    range: 248,
    fireInterval: 0.42,
    magazineSize: 12,
    reloadDuration: 2.05,
    spread: 0.006,
    preferredRange: 138,
    rank: 3,
  }),
});

export const SAFE_ZONE_PHASES = Object.freeze([
  Object.freeze({ waitDuration: 18, shrinkDuration: 12, radius: 370, damagePerSecond: 1.2 }),
  Object.freeze({ waitDuration: 14, shrinkDuration: 11, radius: 255, damagePerSecond: 2.4 }),
  Object.freeze({ waitDuration: 12, shrinkDuration: 10, radius: 165, damagePerSecond: 4.5 }),
  Object.freeze({ waitDuration: 10, shrinkDuration: 9, radius: 92, damagePerSecond: 7.5 }),
  Object.freeze({ waitDuration: 7, shrinkDuration: 8, radius: 38, damagePerSecond: 13 }),
  Object.freeze({ waitDuration: 4, shrinkDuration: 7, radius: 2, damagePerSecond: 34 }),
]);

export const DEFAULT_MATCH_CONFIG = Object.freeze({
  actorCount: 28,
  difficulty: "veteran",
  lobbyDuration: 1.5,
  planeSpeed: 96,
  dropAltitude: 260,
  freefallSpeed: 42,
  parachuteSpeed: 11,
  groundSpeed: 21,
  sprintSpeed: 27,
  maxCombatDuration: 205,
  zoneDurationScale: 1,
});

const AI_DIFFICULTY_PROFILES = Object.freeze({
  rookie: Object.freeze({ decisionMinimum: 0.3, decisionRange: 0.24, awarenessRange: 200, spreadMultiplier: 3 }),
  veteran: Object.freeze({ decisionMinimum: 0.18, decisionRange: 0.16, awarenessRange: 265, spreadMultiplier: 1 }),
  elite: Object.freeze({ decisionMinimum: 0.1, decisionRange: 0.1, awarenessRange: 310, spreadMultiplier: 0.55 }),
});

const maximumSimulationStep = 0.25;
const maximumCallDuration = 10;
const actorRadius = 1.45;
const initialSafeRadius = 520;
const weaponIds = Object.freeze(Object.keys(WEAPON_DATA));

function Clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function Lerp(start, end, amount) {
  return start + (end - start) * amount;
}

function DistanceSquared(firstX, firstY, secondX, secondY) {
  const deltaX = firstX - secondX;
  const deltaY = firstY - secondY;
  return deltaX * deltaX + deltaY * deltaY;
}

function Distance(firstX, firstY, secondX, secondY) {
  return Math.sqrt(DistanceSquared(firstX, firstY, secondX, secondY));
}

function NormalizeVector(vectorX, vectorY) {
  const length = Math.hypot(vectorX, vectorY);
  if (length < 0.000001) {
    return { x: 0, y: 0, length: 0 };
  }
  return { x: vectorX / length, y: vectorY / length, length };
}

function HashSeed(seed) {
  const textSeed = String(seed ?? "FrontierDrop");
  let hash = 2166136261;
  for (let index = 0; index < textSeed.length; index += 1) {
    hash ^= textSeed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  hash >>>= 0;
  return hash || 0x9e3779b9;
}

function CreateRandomSource(seed) {
  return { value: HashSeed(seed) };
}

function NextRandom(source) {
  let value = source.value >>> 0;
  value ^= value << 13;
  value ^= value >>> 17;
  value ^= value << 5;
  source.value = value >>> 0 || 0x6d2b79f5;
  return source.value / 4294967296;
}

function RandomBetween(source, minimum, maximum) {
  return minimum + (maximum - minimum) * NextRandom(source);
}

function NextStateRandom(state) {
  const source = { value: state.randomState };
  const value = NextRandom(source);
  state.randomState = source.value;
  return value;
}

function IsNearRoad(roads, pointX, pointY, clearance) {
  for (const road of roads) {
    const segmentX = road.x2 - road.x1;
    const segmentY = road.y2 - road.y1;
    const lengthSquared = segmentX * segmentX + segmentY * segmentY;
    const projection = Clamp(
      ((pointX - road.x1) * segmentX + (pointY - road.y1) * segmentY) / lengthSquared,
      0,
      1,
    );
    const nearestX = road.x1 + segmentX * projection;
    const nearestY = road.y1 + segmentY * projection;
    if (DistanceSquared(pointX, pointY, nearestX, nearestY) < (road.width * 0.5 + clearance) ** 2) {
      return true;
    }
  }
  return false;
}

function DoBuildingsOverlap(first, second, padding = 4) {
  return (
    Math.abs(first.x - second.x) < first.width * 0.5 + second.width * 0.5 + padding
    && Math.abs(first.y - second.y) < first.height * 0.5 + second.height * 0.5 + padding
  );
}

function IsPointInBuildings(buildings, pointX, pointY, padding = 0) {
  return buildings.some((building) => (
    pointX >= building.x - building.width * 0.5 - padding
    && pointX <= building.x + building.width * 0.5 + padding
    && pointY >= building.y - building.height * 0.5 - padding
    && pointY <= building.y + building.height * 0.5 + padding
  ));
}

function CreateLootObject(idNumber, pointX, pointY, type, extra = {}) {
  return {
    id: `Loot_${String(idNumber).padStart(3, "0")}`,
    x: Number(pointX.toFixed(3)),
    y: Number(pointY.toFixed(3)),
    type,
    available: true,
    pickedBy: null,
    ...extra,
  };
}

function FindLootPoint(building, sideOffset, buildings) {
  const candidates = [
    { x: building.x + building.width * 0.5 + sideOffset, y: building.y },
    { x: building.x - building.width * 0.5 - sideOffset, y: building.y },
    { x: building.x, y: building.y + building.height * 0.5 + sideOffset },
    { x: building.x, y: building.y - building.height * 0.5 - sideOffset },
  ];
  for (const candidate of candidates) {
    if (
      candidate.x > 5
      && candidate.x < WORLD_SIZE - 5
      && candidate.y > 5
      && candidate.y < WORLD_SIZE - 5
      && !IsPointInBuildings(buildings, candidate.x, candidate.y, 1)
    ) {
      return candidate;
    }
  }
  return { x: building.x, y: building.y + building.height * 0.5 + sideOffset };
}

function GenerateMapWithSource(seed, source) {
  const roads = [];
  const mainRoadCoordinates = [168, 500, 832];
  for (let index = 0; index < mainRoadCoordinates.length; index += 1) {
    const verticalX = mainRoadCoordinates[index] + RandomBetween(source, -9, 9);
    const horizontalY = mainRoadCoordinates[index] + RandomBetween(source, -9, 9);
    roads.push({
      id: `Road_Vertical_${index + 1}`,
      x1: Number(verticalX.toFixed(3)),
      y1: 0,
      x2: Number(verticalX.toFixed(3)),
      y2: WORLD_SIZE,
      width: index === 1 ? 15 : 11,
    });
    roads.push({
      id: `Road_Horizontal_${index + 1}`,
      x1: 0,
      y1: Number(horizontalY.toFixed(3)),
      x2: WORLD_SIZE,
      y2: Number(horizontalY.toFixed(3)),
      width: index === 1 ? 15 : 11,
    });
  }

  const buildings = [];
  let buildingAttempts = 0;
  while (buildings.length < 50 && buildingAttempts < 1600) {
    buildingAttempts += 1;
    const width = RandomBetween(source, 22, 49);
    const height = RandomBetween(source, 20, 45);
    const candidate = {
      id: `Building_${String(buildings.length + 1).padStart(2, "0")}`,
      x: RandomBetween(source, 38 + width * 0.5, WORLD_SIZE - 38 - width * 0.5),
      y: RandomBetween(source, 38 + height * 0.5, WORLD_SIZE - 38 - height * 0.5),
      width,
      height,
      roofTone: Math.floor(RandomBetween(source, 0, 4)),
    };
    if (IsNearRoad(roads, candidate.x, candidate.y, Math.max(width, height) * 0.56)) {
      continue;
    }
    if (buildings.some((building) => DoBuildingsOverlap(building, candidate, 7))) {
      continue;
    }
    candidate.x = Number(candidate.x.toFixed(3));
    candidate.y = Number(candidate.y.toFixed(3));
    candidate.width = Number(candidate.width.toFixed(3));
    candidate.height = Number(candidate.height.toFixed(3));
    buildings.push(candidate);
  }

  const trees = [];
  let treeAttempts = 0;
  while (trees.length < 135 && treeAttempts < 2400) {
    treeAttempts += 1;
    const pointX = RandomBetween(source, 12, WORLD_SIZE - 12);
    const pointY = RandomBetween(source, 12, WORLD_SIZE - 12);
    const radius = RandomBetween(source, 1.7, 3.5);
    if (IsPointInBuildings(buildings, pointX, pointY, radius + 3)) {
      continue;
    }
    if (IsNearRoad(roads, pointX, pointY, radius + 1)) {
      continue;
    }
    trees.push({
      id: `Tree_${String(trees.length + 1).padStart(3, "0")}`,
      x: Number(pointX.toFixed(3)),
      y: Number(pointY.toFixed(3)),
      radius: Number(radius.toFixed(3)),
      crownTone: Math.floor(RandomBetween(source, 0, 4)),
    });
  }

  const rocks = [];
  let rockAttempts = 0;
  while (rocks.length < 52 && rockAttempts < 1600) {
    rockAttempts += 1;
    const pointX = RandomBetween(source, 10, WORLD_SIZE - 10);
    const pointY = RandomBetween(source, 10, WORLD_SIZE - 10);
    const radius = RandomBetween(source, 2.2, 5.2);
    if (IsPointInBuildings(buildings, pointX, pointY, radius + 2)) {
      continue;
    }
    if (IsNearRoad(roads, pointX, pointY, radius)) {
      continue;
    }
    if (rocks.some((rock) => DistanceSquared(pointX, pointY, rock.x, rock.y) < (radius + rock.radius + 3) ** 2)) {
      continue;
    }
    rocks.push({
      id: `Rock_${String(rocks.length + 1).padStart(2, "0")}`,
      x: Number(pointX.toFixed(3)),
      y: Number(pointY.toFixed(3)),
      radius: Number(radius.toFixed(3)),
      rotation: Number(RandomBetween(source, 0, Math.PI * 2).toFixed(4)),
    });
  }

  const loot = [];
  let lootNumber = 1;
  for (let index = 0; index < buildings.length; index += 1) {
    const building = buildings[index];
    const primaryPoint = FindLootPoint(building, 4.2, buildings);
    const primaryWeapon = weaponIds[index % weaponIds.length];
    loot.push(CreateLootObject(lootNumber, primaryPoint.x, primaryPoint.y, "weapon", {
      weaponId: primaryWeapon,
      magazineAmmo: WEAPON_DATA[primaryWeapon].magazineSize,
      reserveAmmo: WEAPON_DATA[primaryWeapon].magazineSize,
    }));
    lootNumber += 1;

    const secondaryPoint = FindLootPoint(building, 7.5, buildings);
    const supplyRoll = NextRandom(source);
    if (supplyRoll < 0.42) {
      loot.push(CreateLootObject(lootNumber, secondaryPoint.x + 1.8, secondaryPoint.y - 1.4, "ammo", {
        amount: Math.floor(RandomBetween(source, 20, 48)),
      }));
    } else if (supplyRoll < 0.7) {
      loot.push(CreateLootObject(lootNumber, secondaryPoint.x + 1.8, secondaryPoint.y - 1.4, "armor", {
        amount: Math.floor(RandomBetween(source, 35, 76)),
      }));
    } else {
      loot.push(CreateLootObject(lootNumber, secondaryPoint.x + 1.8, secondaryPoint.y - 1.4, "medkit", {
        amount: 1,
      }));
    }
    lootNumber += 1;
  }

  for (let index = 0; index < 26; index += 1) {
    let pointX = RandomBetween(source, 18, WORLD_SIZE - 18);
    let pointY = RandomBetween(source, 18, WORLD_SIZE - 18);
    let guard = 0;
    while (IsPointInBuildings(buildings, pointX, pointY, 4) && guard < 30) {
      pointX = RandomBetween(source, 18, WORLD_SIZE - 18);
      pointY = RandomBetween(source, 18, WORLD_SIZE - 18);
      guard += 1;
    }
    const typeRoll = NextRandom(source);
    if (typeRoll < 0.5) {
      loot.push(CreateLootObject(lootNumber, pointX, pointY, "ammo", {
        amount: Math.floor(RandomBetween(source, 18, 42)),
      }));
    } else if (typeRoll < 0.76) {
      loot.push(CreateLootObject(lootNumber, pointX, pointY, "armor", {
        amount: Math.floor(RandomBetween(source, 28, 65)),
      }));
    } else {
      loot.push(CreateLootObject(lootNumber, pointX, pointY, "medkit", { amount: 1 }));
    }
    lootNumber += 1;
  }

  return {
    seed: String(seed),
    size: WORLD_SIZE,
    width: WORLD_SIZE,
    height: WORLD_SIZE,
    bounds: { minimumX: 0, minimumY: 0, maximumX: WORLD_SIZE, maximumY: WORLD_SIZE },
    roads,
    buildings,
    trees,
    rocks,
    loot,
  };
}

export function GenerateMap(seed = "FrontierDrop") {
  const source = CreateRandomSource(seed);
  return GenerateMapWithSource(seed, source);
}

function GeneratePlane(source, planeSpeed) {
  const angle = RandomBetween(source, 0, Math.PI * 2);
  const directionX = Math.cos(angle);
  const directionY = Math.sin(angle);
  const centerX = RandomBetween(source, 430, 570);
  const centerY = RandomBetween(source, 430, 570);
  const halfLength = 775;
  const startX = centerX - directionX * halfLength;
  const startY = centerY - directionY * halfLength;
  const endX = centerX + directionX * halfLength;
  const endY = centerY + directionY * halfLength;
  return {
    start: { x: Number(startX.toFixed(4)), y: Number(startY.toFixed(4)) },
    end: { x: Number(endX.toFixed(4)), y: Number(endY.toFixed(4)) },
    direction: { x: Number(directionX.toFixed(8)), y: Number(directionY.toFixed(8)) },
    routeLength: 1550,
    progress: 0,
    x: Number(startX.toFixed(4)),
    y: Number(startY.toFixed(4)),
    altitude: 310,
    speed: planeSpeed,
  };
}

function CreateInventory() {
  return {
    weaponId: null,
    magazineAmmo: 0,
    reserveAmmo: 0,
    medkits: 0,
  };
}

function CreateActors(actorCount, humanPlayerIds, plane, map, source) {
  const humanIds = [...new Set(humanPlayerIds.map((id) => String(id).trim()).filter(Boolean))];
  if (humanIds.length > actorCount) {
    throw new RangeError("humanPlayerIds cannot exceed actorCount");
  }
  const usedIds = new Set(humanIds);
  let botNumber = 1;
  const weaponLoot = map.loot.filter((item) => item.type === "weapon");
  const actors = [];
  for (let index = 0; index < actorCount; index += 1) {
    const isHuman = index < humanIds.length;
    let id = isHuman ? humanIds[index] : "";
    if (!isHuman) {
      do {
        id = `Bot_${String(botNumber).padStart(2, "0")}`;
        botNumber += 1;
      } while (usedIds.has(id));
      usedIds.add(id);
    }
    const targetLoot = weaponLoot[(index * 7 + Math.floor(NextRandom(source) * weaponLoot.length)) % weaponLoot.length];
    const targetX = Clamp(targetLoot.x + RandomBetween(source, -4, 4), 6, WORLD_SIZE - 6);
    const targetY = Clamp(targetLoot.y + RandomBetween(source, -4, 4), 6, WORLD_SIZE - 6);
    const projection = (
      (targetX - plane.start.x) * plane.direction.x
      + (targetY - plane.start.y) * plane.direction.y
    ) / plane.routeLength;
    const dropProgress = Clamp(projection + RandomBetween(source, -0.025, 0.025), 0.08, 0.92);
    const seatSide = index % 2 === 0 ? -1 : 1;
    const seatRow = Math.floor(index / 2) - actorCount * 0.25;
    actors.push({
      id,
      name: isHuman ? id : `Ranger ${String(index - humanIds.length + 1).padStart(2, "0")}`,
      isHuman,
      alive: true,
      status: "lobby",
      x: 500 + (index % 8) * 3 - 10,
      y: 500 + Math.floor(index / 8) * 3 - 5,
      z: 0,
      velocityX: 0,
      velocityY: 0,
      angle: RandomBetween(source, 0, Math.PI * 2),
      radius: actorRadius,
      health: 100,
      maximumHealth: 100,
      armor: 0,
      inventory: CreateInventory(),
      kills: 0,
      damageDealt: 0,
      fireCooldown: 0,
      reloadTimer: 0,
      healingTimer: 0,
      healingDuration: 0,
      lastDamagedBy: null,
      lastDamageTime: -999,
      deathTime: null,
      deathCause: null,
      landingTarget: { x: Number(targetX.toFixed(3)), y: Number(targetY.toFixed(3)) },
      dropProgress: Number(dropProgress.toFixed(5)),
      planeOffset: { side: seatSide * 2.2, forward: seatRow * 0.32 },
      ai: {
        decisionTimer: RandomBetween(source, 0, 0.25),
        targetActorId: null,
        targetLootId: targetLoot.id,
        strafeDirection: NextRandom(source) < 0.5 ? -1 : 1,
        wanderTarget: { x: targetX, y: targetY },
        cachedInput: CreateInput(),
      },
    });
  }
  return actors;
}

function ReadFiniteOption(value, fallback, minimum, maximum) {
  return Number.isFinite(value) ? Clamp(value, minimum, maximum) : fallback;
}

function ReadDifficultyOption(value) {
  return Object.hasOwn(AI_DIFFICULTY_PROFILES, value) ? value : DEFAULT_MATCH_CONFIG.difficulty;
}

function CreateConfig(options) {
  const timing = options.timing && typeof options.timing === "object" ? options.timing : {};
  const requestedActorCount = Number.isFinite(options.actorCount)
    ? Math.round(options.actorCount)
    : DEFAULT_MATCH_CONFIG.actorCount;
  return {
    actorCount: Clamp(requestedActorCount, ACTOR_MIN, ACTOR_MAX),
    difficulty: ReadDifficultyOption(options.difficulty ?? timing.difficulty),
    lobbyDuration: ReadFiniteOption(timing.lobbyDuration, DEFAULT_MATCH_CONFIG.lobbyDuration, 0, 60),
    planeSpeed: ReadFiniteOption(timing.planeSpeed, DEFAULT_MATCH_CONFIG.planeSpeed, 20, 600),
    dropAltitude: ReadFiniteOption(timing.dropAltitude, DEFAULT_MATCH_CONFIG.dropAltitude, 80, 500),
    freefallSpeed: ReadFiniteOption(timing.freefallSpeed, DEFAULT_MATCH_CONFIG.freefallSpeed, 15, 100),
    parachuteSpeed: ReadFiniteOption(timing.parachuteSpeed, DEFAULT_MATCH_CONFIG.parachuteSpeed, 5, 30),
    groundSpeed: ReadFiniteOption(timing.groundSpeed, DEFAULT_MATCH_CONFIG.groundSpeed, 5, 50),
    sprintSpeed: ReadFiniteOption(timing.sprintSpeed, DEFAULT_MATCH_CONFIG.sprintSpeed, 5, 65),
    maxCombatDuration: ReadFiniteOption(timing.maxCombatDuration, DEFAULT_MATCH_CONFIG.maxCombatDuration, 30, 600),
    zoneDurationScale: ReadFiniteOption(timing.zoneDurationScale, DEFAULT_MATCH_CONFIG.zoneDurationScale, 0.08, 3),
  };
}

export function CreateInput(overrides = {}) {
  const moveX = Number.isFinite(overrides.moveX) ? Clamp(overrides.moveX, -1, 1) : 0;
  const moveY = Number.isFinite(overrides.moveY) ? Clamp(overrides.moveY, -1, 1) : 0;
  const aimX = Number.isFinite(overrides.aimX) ? Clamp(overrides.aimX, -1, 1) : 0;
  const aimY = Number.isFinite(overrides.aimY) ? Clamp(overrides.aimY, -1, 1) : 0;
  return {
    moveX,
    moveY,
    aimX,
    aimY,
    shoot: Boolean(overrides.shoot),
    jump: Boolean(overrides.jump),
    parachute: Boolean(overrides.parachute),
    reload: Boolean(overrides.reload),
    heal: Boolean(overrides.heal),
    pickup: Boolean(overrides.pickup),
    sprint: Boolean(overrides.sprint),
  };
}

export function CreateMatch(options = {}) {
  const seed = options.seed ?? "FrontierDrop";
  const config = CreateConfig(options);
  const humanPlayerIds = Array.isArray(options.humanPlayerIds) ? options.humanPlayerIds : [];
  const source = CreateRandomSource(seed);
  const map = GenerateMapWithSource(seed, source);
  const plane = GeneratePlane(source, config.planeSpeed);
  const actors = CreateActors(config.actorCount, humanPlayerIds, plane, map, source);
  const state = {
    schemaVersion: 1,
    seed: String(seed),
    randomState: source.value,
    config,
    time: 0,
    phase: "lobby",
    phaseTime: 0,
    phaseHistory: ["lobby"],
    map,
    plane,
    actors,
    safeZone: {
      phaseIndex: -1,
      completedPhases: 0,
      stage: "inactive",
      stageTime: 0,
      center: { x: 500, y: 500 },
      radius: initialSafeRadius,
      startCenter: { x: 500, y: 500 },
      startRadius: initialSafeRadius,
      targetCenter: { x: 500, y: 500 },
      targetRadius: initialSafeRadius,
      damagePerSecond: 0,
    },
    killFeed: [],
    events: [],
    eventSerial: 0,
    nextLootId: map.loot.length + 1,
    aliveCount: actors.length,
    winnerId: null,
    result: null,
    restartReady: false,
    restartOptions: {
      seed: `${String(seed)}_Rematch_1`,
      actorCount: config.actorCount,
      difficulty: config.difficulty,
      humanPlayerIds: actors.filter((actor) => actor.isHuman).map((actor) => actor.id),
      timing: { ...config },
    },
  };
  AddEvent(state, "matchCreated", { actorCount: actors.length, worldSize: WORLD_SIZE });
  return state;
}

function AddEvent(state, type, details = {}) {
  state.eventSerial += 1;
  state.events.push({ id: state.eventSerial, time: Number(state.time.toFixed(4)), type, ...details });
  if (state.events.length > 160) {
    state.events.splice(0, state.events.length - 160);
  }
}

function TransitionPhase(state, nextPhase) {
  if (state.phase === nextPhase) {
    return;
  }
  state.phase = nextPhase;
  state.phaseTime = 0;
  state.phaseHistory.push(nextPhase);
  AddEvent(state, "phaseChanged", { phase: nextPhase });
}

function GetInput(inputByPlayer, actorId) {
  if (!inputByPlayer || typeof inputByPlayer !== "object") {
    return CreateInput();
  }
  return CreateInput(inputByPlayer[actorId] ?? {});
}

function BeginFlight(state) {
  TransitionPhase(state, "flight");
  for (const actor of state.actors) {
    if (!actor.alive) {
      continue;
    }
    actor.status = "plane";
    actor.z = state.plane.altitude;
    actor.x = state.plane.x;
    actor.y = state.plane.y;
  }
}

function UpdatePlanePosition(state) {
  const plane = state.plane;
  plane.x = Lerp(plane.start.x, plane.end.x, plane.progress);
  plane.y = Lerp(plane.start.y, plane.end.y, plane.progress);
  const perpendicularX = -plane.direction.y;
  const perpendicularY = plane.direction.x;
  for (const actor of state.actors) {
    if (!actor.alive || actor.status !== "plane") {
      continue;
    }
    actor.x = plane.x + perpendicularX * actor.planeOffset.side + plane.direction.x * actor.planeOffset.forward;
    actor.y = plane.y + perpendicularY * actor.planeOffset.side + plane.direction.y * actor.planeOffset.forward;
    actor.z = plane.altitude;
  }
}

function JumpActor(state, actor) {
  if (!actor.alive || actor.status !== "plane") {
    return;
  }
  actor.status = "freefall";
  actor.z = state.config.dropAltitude;
  actor.velocityX = state.plane.direction.x * 18;
  actor.velocityY = state.plane.direction.y * 18;
  AddEvent(state, "actorJumped", { actorId: actor.id, x: Number(actor.x.toFixed(2)), y: Number(actor.y.toFixed(2)) });
}

function FindOpenPosition(map, desiredX, desiredY, radius) {
  const clampedX = Clamp(desiredX, radius + 1, WORLD_SIZE - radius - 1);
  const clampedY = Clamp(desiredY, radius + 1, WORLD_SIZE - radius - 1);
  if (!IsPositionBlocked(map, clampedX, clampedY, radius)) {
    return { x: clampedX, y: clampedY };
  }
  for (let ring = 1; ring <= 18; ring += 1) {
    const searchRadius = ring * 3.5;
    const sampleCount = 8 + ring * 2;
    for (let sample = 0; sample < sampleCount; sample += 1) {
      const angle = (sample / sampleCount) * Math.PI * 2 + ring * 0.37;
      const pointX = Clamp(clampedX + Math.cos(angle) * searchRadius, radius + 1, WORLD_SIZE - radius - 1);
      const pointY = Clamp(clampedY + Math.sin(angle) * searchRadius, radius + 1, WORLD_SIZE - radius - 1);
      if (!IsPositionBlocked(map, pointX, pointY, radius)) {
        return { x: pointX, y: pointY };
      }
    }
  }
  return { x: 500, y: 500 };
}

function LandActor(state, actor) {
  const position = FindOpenPosition(state.map, actor.x, actor.y, actor.radius);
  actor.x = position.x;
  actor.y = position.y;
  actor.z = 0;
  actor.velocityX = 0;
  actor.velocityY = 0;
  actor.status = "ground";
  AddEvent(state, "actorLanded", { actorId: actor.id, x: Number(actor.x.toFixed(2)), y: Number(actor.y.toFixed(2)) });
}

function UpdateFallingActor(state, actor, input, deltaTime) {
  if (actor.status !== "freefall" && actor.status !== "parachute") {
    return;
  }
  let moveX = input.moveX;
  let moveY = input.moveY;
  if (!actor.isHuman) {
    moveX = actor.landingTarget.x - actor.x;
    moveY = actor.landingTarget.y - actor.y;
  }
  const direction = NormalizeVector(moveX, moveY);
  if (actor.status === "freefall") {
    actor.velocityX = Lerp(actor.velocityX, direction.x * 35, Clamp(deltaTime * 2.6, 0, 1));
    actor.velocityY = Lerp(actor.velocityY, direction.y * 35, Clamp(deltaTime * 2.6, 0, 1));
    actor.x += actor.velocityX * deltaTime;
    actor.y += actor.velocityY * deltaTime;
    actor.z -= state.config.freefallSpeed * deltaTime;
    const automaticHeight = actor.isHuman ? 48 : 94;
    if (input.parachute || actor.z <= automaticHeight) {
      actor.status = "parachute";
      actor.velocityX *= 0.48;
      actor.velocityY *= 0.48;
      AddEvent(state, "parachuteOpened", { actorId: actor.id });
    }
  } else {
    actor.velocityX = Lerp(actor.velocityX, direction.x * 18, Clamp(deltaTime * 3.2, 0, 1));
    actor.velocityY = Lerp(actor.velocityY, direction.y * 18, Clamp(deltaTime * 3.2, 0, 1));
    actor.x += actor.velocityX * deltaTime;
    actor.y += actor.velocityY * deltaTime;
    actor.z -= state.config.parachuteSpeed * deltaTime;
  }
  actor.x = Clamp(actor.x, actor.radius + 1, WORLD_SIZE - actor.radius - 1);
  actor.y = Clamp(actor.y, actor.radius + 1, WORLD_SIZE - actor.radius - 1);
  if (actor.z <= 0) {
    LandActor(state, actor);
  }
}

function UpdateFlight(state, inputByPlayer, deltaTime) {
  const plane = state.plane;
  plane.progress = Clamp(plane.progress + (plane.speed / plane.routeLength) * deltaTime, 0, 1);
  UpdatePlanePosition(state);
  for (const actor of state.actors) {
    if (!actor.alive) {
      continue;
    }
    const input = actor.isHuman ? GetInput(inputByPlayer, actor.id) : CreateInput();
    if (actor.status === "plane") {
      const shouldJump = actor.isHuman
        ? input.jump || plane.progress >= 0.965
        : plane.progress >= actor.dropProgress;
      if (shouldJump) {
        JumpActor(state, actor);
      }
    }
    UpdateFallingActor(state, actor, input, deltaTime);
  }
  if (plane.progress >= 1) {
    for (const actor of state.actors) {
      JumpActor(state, actor);
    }
  }
  if (!state.actors.some((actor) => actor.alive && actor.status === "plane")) {
    TransitionPhase(state, "drop");
  }
}

function PrepareSafeZonePhase(state, phaseIndex) {
  const definition = SAFE_ZONE_PHASES[phaseIndex];
  const safeZone = state.safeZone;
  const availableOffset = Math.max(0, safeZone.radius - definition.radius);
  const angle = NextStateRandom(state) * Math.PI * 2;
  const offset = Math.sqrt(NextStateRandom(state)) * availableOffset * 0.72;
  const targetX = Clamp(safeZone.center.x + Math.cos(angle) * offset, definition.radius, WORLD_SIZE - definition.radius);
  const targetY = Clamp(safeZone.center.y + Math.sin(angle) * offset, definition.radius, WORLD_SIZE - definition.radius);
  safeZone.phaseIndex = phaseIndex;
  safeZone.stage = "waiting";
  safeZone.stageTime = 0;
  safeZone.startCenter = { ...safeZone.center };
  safeZone.startRadius = safeZone.radius;
  safeZone.targetCenter = { x: targetX, y: targetY };
  safeZone.targetRadius = definition.radius;
  safeZone.damagePerSecond = definition.damagePerSecond;
  AddEvent(state, "safeZonePhaseStarted", {
    phaseIndex,
    targetX: Number(targetX.toFixed(2)),
    targetY: Number(targetY.toFixed(2)),
    targetRadius: definition.radius,
  });
}

function BeginCombat(state) {
  TransitionPhase(state, "combat");
  PrepareSafeZonePhase(state, 0);
  for (const actor of state.actors) {
    if (actor.alive && actor.status !== "ground") {
      LandActor(state, actor);
    }
  }
}

function UpdateDrop(state, inputByPlayer, deltaTime) {
  for (const actor of state.actors) {
    if (!actor.alive) {
      continue;
    }
    const input = actor.isHuman ? GetInput(inputByPlayer, actor.id) : CreateInput();
    UpdateFallingActor(state, actor, input, deltaTime);
  }
  const everyoneLanded = state.actors.every((actor) => !actor.alive || actor.status === "ground");
  if (everyoneLanded || state.phaseTime >= 24) {
    BeginCombat(state);
  }
}

function IsPositionBlocked(map, pointX, pointY, radius) {
  if (
    pointX - radius < 0
    || pointY - radius < 0
    || pointX + radius > WORLD_SIZE
    || pointY + radius > WORLD_SIZE
  ) {
    return true;
  }
  for (const building of map.buildings) {
    const nearestX = Clamp(pointX, building.x - building.width * 0.5, building.x + building.width * 0.5);
    const nearestY = Clamp(pointY, building.y - building.height * 0.5, building.y + building.height * 0.5);
    if (DistanceSquared(pointX, pointY, nearestX, nearestY) < radius * radius) {
      return true;
    }
  }
  for (const rock of map.rocks) {
    if (DistanceSquared(pointX, pointY, rock.x, rock.y) < (radius + rock.radius) ** 2) {
      return true;
    }
  }
  return false;
}

function MoveActor(state, actor, moveX, moveY, speed, deltaTime) {
  const direction = NormalizeVector(moveX, moveY);
  if (direction.length === 0) {
    return;
  }
  const distance = speed * deltaTime;
  const nextX = Clamp(actor.x + direction.x * distance, actor.radius, WORLD_SIZE - actor.radius);
  const nextY = Clamp(actor.y + direction.y * distance, actor.radius, WORLD_SIZE - actor.radius);
  if (!IsPositionBlocked(state.map, nextX, actor.y, actor.radius)) {
    actor.x = nextX;
  }
  if (!IsPositionBlocked(state.map, actor.x, nextY, actor.radius)) {
    actor.y = nextY;
  }
  actor.angle = Math.atan2(direction.y, direction.x);
}

function RayAabbDistance(originX, originY, directionX, directionY, building, maximumDistance) {
  const minimumX = building.x - building.width * 0.5;
  const maximumX = building.x + building.width * 0.5;
  const minimumY = building.y - building.height * 0.5;
  const maximumY = building.y + building.height * 0.5;
  let nearDistance = 0;
  let farDistance = maximumDistance;
  for (const axis of [
    { origin: originX, direction: directionX, minimum: minimumX, maximum: maximumX },
    { origin: originY, direction: directionY, minimum: minimumY, maximum: maximumY },
  ]) {
    if (Math.abs(axis.direction) < 0.0000001) {
      if (axis.origin < axis.minimum || axis.origin > axis.maximum) {
        return Infinity;
      }
      continue;
    }
    const inverse = 1 / axis.direction;
    let first = (axis.minimum - axis.origin) * inverse;
    let second = (axis.maximum - axis.origin) * inverse;
    if (first > second) {
      [first, second] = [second, first];
    }
    nearDistance = Math.max(nearDistance, first);
    farDistance = Math.min(farDistance, second);
    if (nearDistance > farDistance) {
      return Infinity;
    }
  }
  return nearDistance >= 0 ? nearDistance : Infinity;
}

function RayCircleDistance(originX, originY, directionX, directionY, circleX, circleY, radius, maximumDistance) {
  const toCircleX = circleX - originX;
  const toCircleY = circleY - originY;
  const projection = toCircleX * directionX + toCircleY * directionY;
  if (projection < 0 || projection > maximumDistance) {
    return Infinity;
  }
  const perpendicularSquared = toCircleX * toCircleX + toCircleY * toCircleY - projection * projection;
  if (perpendicularSquared > radius * radius) {
    return Infinity;
  }
  return Math.max(0, projection - Math.sqrt(Math.max(0, radius * radius - perpendicularSquared)));
}

function GetCoverDistance(map, originX, originY, directionX, directionY, maximumDistance) {
  let coverDistance = maximumDistance + 1;
  for (const building of map.buildings) {
    coverDistance = Math.min(
      coverDistance,
      RayAabbDistance(originX, originY, directionX, directionY, building, maximumDistance),
    );
  }
  for (const rock of map.rocks) {
    coverDistance = Math.min(
      coverDistance,
      RayCircleDistance(originX, originY, directionX, directionY, rock.x, rock.y, rock.radius, maximumDistance),
    );
  }
  return coverDistance;
}

function HasLineOfSight(state, first, second) {
  const direction = NormalizeVector(second.x - first.x, second.y - first.y);
  if (direction.length <= 0.001) {
    return true;
  }
  const coverDistance = GetCoverDistance(state.map, first.x, first.y, direction.x, direction.y, direction.length);
  return coverDistance >= direction.length - second.radius;
}

function FindNearestEnemy(state, actor, maximumDistance) {
  let nearestActor = null;
  let nearestDistanceSquared = maximumDistance * maximumDistance;
  for (const candidate of state.actors) {
    if (!candidate.alive || candidate.status !== "ground" || candidate.id === actor.id) {
      continue;
    }
    const candidateDistanceSquared = DistanceSquared(actor.x, actor.y, candidate.x, candidate.y);
    if (candidateDistanceSquared < nearestDistanceSquared) {
      nearestActor = candidate;
      nearestDistanceSquared = candidateDistanceSquared;
    }
  }
  return nearestActor
    ? { actor: nearestActor, distance: Math.sqrt(nearestDistanceSquared) }
    : null;
}

function ScoreLootForActor(actor, item, distance) {
  if (!item.available) {
    return -Infinity;
  }
  if (item.type === "weapon") {
    if (!actor.inventory.weaponId) {
      return 1100 - distance;
    }
    const currentRank = WEAPON_DATA[actor.inventory.weaponId].rank;
    const offeredRank = WEAPON_DATA[item.weaponId].rank;
    return offeredRank > currentRank ? 360 + (offeredRank - currentRank) * 80 - distance : -100 - distance;
  }
  if (item.type === "ammo") {
    return actor.inventory.weaponId && actor.inventory.reserveAmmo < 85 ? 330 - distance : 20 - distance;
  }
  if (item.type === "armor") {
    return actor.armor < 65 ? 310 - distance : 25 - distance;
  }
  if (item.type === "medkit") {
    return actor.inventory.medkits < 2 ? 280 - distance : 20 - distance;
  }
  return -Infinity;
}

function FindDesiredLoot(state, actor) {
  let bestItem = null;
  let bestScore = -Infinity;
  for (const item of state.map.loot) {
    if (!item.available) {
      continue;
    }
    const distance = Distance(actor.x, actor.y, item.x, item.y);
    const searchLimit = actor.inventory.weaponId ? 230 : 900;
    if (distance > searchLimit) {
      continue;
    }
    const score = ScoreLootForActor(actor, item, distance);
    if (score > bestScore) {
      bestScore = score;
      bestItem = item;
    }
  }
  return bestItem;
}

function BlendDirections(firstX, firstY, secondX, secondY, secondWeight) {
  return NormalizeVector(
    firstX * (1 - secondWeight) + secondX * secondWeight,
    firstY * (1 - secondWeight) + secondY * secondWeight,
  );
}

function ComputeAiInput(state, actor, deltaTime) {
  const difficultyProfile = AI_DIFFICULTY_PROFILES[state.config.difficulty];
  actor.ai.decisionTimer -= deltaTime;
  if (actor.ai.decisionTimer > 0) {
    return actor.ai.cachedInput;
  }
  actor.ai.decisionTimer = difficultyProfile.decisionMinimum + NextStateRandom(state) * difficultyProfile.decisionRange;
  const input = CreateInput({ pickup: true, sprint: true });
  const nearest = FindNearestEnemy(state, actor, difficultyProfile.awarenessRange);
  const safeZone = state.safeZone;
  const distanceToZoneCenter = Distance(actor.x, actor.y, safeZone.center.x, safeZone.center.y);
  const outsideZone = distanceToZoneCenter > safeZone.radius - 7;
  const nextCenter = safeZone.stage === "waiting" ? safeZone.targetCenter : safeZone.center;
  const zoneDirection = NormalizeVector(nextCenter.x - actor.x, nextCenter.y - actor.y);
  const urgentRotation = outsideZone
    || (safeZone.stage === "waiting" && safeZone.stageTime > SAFE_ZONE_PHASES[safeZone.phaseIndex].waitDuration * state.config.zoneDurationScale * 0.68);

  if (
    actor.health < 58
    && actor.inventory.medkits > 0
    && (!nearest || nearest.distance > 76 || !HasLineOfSight(state, actor, nearest.actor))
  ) {
    input.heal = true;
    input.pickup = true;
    actor.ai.cachedInput = input;
    return input;
  }

  if (actor.inventory.weaponId && actor.inventory.magazineAmmo === 0 && actor.inventory.reserveAmmo > 0) {
    input.reload = true;
  }

  if (nearest && actor.inventory.weaponId) {
    const enemy = nearest.actor;
    const weapon = WEAPON_DATA[actor.inventory.weaponId];
    const aim = NormalizeVector(enemy.x - actor.x, enemy.y - actor.y);
    input.aimX = aim.x;
    input.aimY = aim.y;
    input.shoot = nearest.distance <= weapon.range && HasLineOfSight(state, actor, enemy);
    actor.ai.targetActorId = enemy.id;
    let combatMoveX = 0;
    let combatMoveY = 0;
    if (nearest.distance > weapon.preferredRange * 1.14) {
      combatMoveX = aim.x;
      combatMoveY = aim.y;
    } else if (nearest.distance < weapon.preferredRange * 0.52) {
      combatMoveX = -aim.x;
      combatMoveY = -aim.y;
    } else {
      combatMoveX = -aim.y * actor.ai.strafeDirection;
      combatMoveY = aim.x * actor.ai.strafeDirection;
    }
    if (urgentRotation) {
      const blended = BlendDirections(combatMoveX, combatMoveY, zoneDirection.x, zoneDirection.y, 0.72);
      input.moveX = blended.x;
      input.moveY = blended.y;
    } else {
      input.moveX = combatMoveX;
      input.moveY = combatMoveY;
    }
  } else {
    actor.ai.targetActorId = null;
    const desiredLoot = FindDesiredLoot(state, actor);
    if (!urgentRotation && desiredLoot) {
      actor.ai.targetLootId = desiredLoot.id;
      const lootDirection = NormalizeVector(desiredLoot.x - actor.x, desiredLoot.y - actor.y);
      input.moveX = lootDirection.x;
      input.moveY = lootDirection.y;
      input.sprint = true;
    } else if (zoneDirection.length > 2) {
      input.moveX = zoneDirection.x;
      input.moveY = zoneDirection.y;
    } else {
      const wanderDistance = Distance(actor.x, actor.y, actor.ai.wanderTarget.x, actor.ai.wanderTarget.y);
      if (wanderDistance < 8) {
        const wanderAngle = NextStateRandom(state) * Math.PI * 2;
        actor.ai.wanderTarget = {
          x: Clamp(actor.x + Math.cos(wanderAngle) * 90, 8, WORLD_SIZE - 8),
          y: Clamp(actor.y + Math.sin(wanderAngle) * 90, 8, WORLD_SIZE - 8),
        };
      }
      const wanderDirection = NormalizeVector(
        actor.ai.wanderTarget.x - actor.x,
        actor.ai.wanderTarget.y - actor.y,
      );
      input.moveX = wanderDirection.x;
      input.moveY = wanderDirection.y;
    }
  }
  actor.ai.cachedInput = input;
  return input;
}

function PickupLoot(state, actor) {
  let nearestItem = null;
  let nearestDistanceSquared = 6.2 ** 2;
  for (const item of state.map.loot) {
    if (!item.available) {
      continue;
    }
    const itemDistanceSquared = DistanceSquared(actor.x, actor.y, item.x, item.y);
    if (itemDistanceSquared < nearestDistanceSquared) {
      nearestItem = item;
      nearestDistanceSquared = itemDistanceSquared;
    }
  }
  if (!nearestItem) {
    return false;
  }
  let consumed = true;
  if (nearestItem.type === "weapon") {
    const offeredWeapon = WEAPON_DATA[nearestItem.weaponId];
    const currentWeapon = actor.inventory.weaponId ? WEAPON_DATA[actor.inventory.weaponId] : null;
    if (currentWeapon && currentWeapon.rank > offeredWeapon.rank) {
      consumed = false;
    } else {
      actor.inventory.weaponId = nearestItem.weaponId;
      actor.inventory.magazineAmmo = nearestItem.magazineAmmo ?? offeredWeapon.magazineSize;
      actor.inventory.reserveAmmo += nearestItem.reserveAmmo ?? offeredWeapon.magazineSize;
    }
  } else if (nearestItem.type === "ammo") {
    actor.inventory.reserveAmmo = Math.min(180, actor.inventory.reserveAmmo + (nearestItem.amount ?? 24));
  } else if (nearestItem.type === "armor") {
    actor.armor = Math.min(100, actor.armor + (nearestItem.amount ?? 45));
  } else if (nearestItem.type === "medkit") {
    if (actor.inventory.medkits >= 4) {
      consumed = false;
    } else {
      actor.inventory.medkits += nearestItem.amount ?? 1;
    }
  }
  if (!consumed) {
    return false;
  }
  nearestItem.available = false;
  nearestItem.pickedBy = actor.id;
  AddEvent(state, "lootPickedUp", { actorId: actor.id, lootId: nearestItem.id, lootType: nearestItem.type });
  return true;
}

function CompleteReload(actor) {
  const weapon = actor.inventory.weaponId ? WEAPON_DATA[actor.inventory.weaponId] : null;
  if (!weapon || actor.inventory.reserveAmmo <= 0) {
    return;
  }
  const missingAmmo = weapon.magazineSize - actor.inventory.magazineAmmo;
  const loadedAmmo = Math.min(missingAmmo, actor.inventory.reserveAmmo);
  actor.inventory.magazineAmmo += loadedAmmo;
  actor.inventory.reserveAmmo -= loadedAmmo;
}

function StartReload(actor) {
  const weapon = actor.inventory.weaponId ? WEAPON_DATA[actor.inventory.weaponId] : null;
  if (
    !weapon
    || actor.reloadTimer > 0
    || actor.healingTimer > 0
    || actor.inventory.magazineAmmo >= weapon.magazineSize
    || actor.inventory.reserveAmmo <= 0
  ) {
    return;
  }
  actor.reloadTimer = weapon.reloadDuration;
}

function StartHealing(actor) {
  if (
    actor.healingTimer > 0
    || actor.reloadTimer > 0
    || actor.health >= 95
    || actor.inventory.medkits <= 0
  ) {
    return;
  }
  actor.inventory.medkits -= 1;
  actor.healingDuration = 2.25;
  actor.healingTimer = actor.healingDuration;
}

function AddDynamicLoot(state, actor, type, extra) {
  const loot = {
    id: `Loot_Dynamic_${String(state.nextLootId).padStart(4, "0")}`,
    x: Number((actor.x + (NextStateRandom(state) - 0.5) * 3).toFixed(3)),
    y: Number((actor.y + (NextStateRandom(state) - 0.5) * 3).toFixed(3)),
    type,
    available: true,
    pickedBy: null,
    ...extra,
  };
  state.nextLootId += 1;
  state.map.loot.push(loot);
}

function DropActorLoot(state, actor) {
  if (actor.inventory.weaponId) {
    AddDynamicLoot(state, actor, "weapon", {
      weaponId: actor.inventory.weaponId,
      magazineAmmo: actor.inventory.magazineAmmo,
      reserveAmmo: Math.floor(actor.inventory.reserveAmmo * 0.5),
    });
  }
  if (actor.inventory.reserveAmmo > 0) {
    AddDynamicLoot(state, actor, "ammo", { amount: Math.max(8, Math.ceil(actor.inventory.reserveAmmo * 0.5)) });
  }
  if (actor.armor > 8) {
    AddDynamicLoot(state, actor, "armor", { amount: Math.ceil(actor.armor * 0.55) });
  }
  if (actor.inventory.medkits > 0) {
    AddDynamicLoot(state, actor, "medkit", { amount: Math.min(2, actor.inventory.medkits) });
  }
}

function CountAliveActors(state) {
  let count = 0;
  for (const actor of state.actors) {
    if (actor.alive) {
      count += 1;
    }
  }
  return count;
}

function FinishMatch(state, winner, reason) {
  if (state.phase === "results") {
    return;
  }
  state.aliveCount = winner ? 1 : 0;
  state.winnerId = winner?.id ?? null;
  TransitionPhase(state, "results");
  if (winner) {
    winner.status = "winner";
  }
  const ranking = [...state.actors]
    .sort((first, second) => {
      if (first.id === winner?.id) return -1;
      if (second.id === winner?.id) return 1;
      return (second.deathTime ?? Infinity) - (first.deathTime ?? Infinity) || second.kills - first.kills;
    })
    .map((actor, index) => ({
      rank: index + 1,
      actorId: actor.id,
      kills: actor.kills,
      damageDealt: Number(actor.damageDealt.toFixed(2)),
    }));
  state.result = {
    winnerId: state.winnerId,
    reason,
    duration: Number(state.time.toFixed(3)),
    ranking,
    restartReady: true,
  };
  state.restartReady = true;
  AddEvent(state, "matchFinished", { winnerId: state.winnerId, reason });
}

function CheckForWinner(state) {
  if (state.phase !== "combat") {
    return false;
  }
  const survivors = state.actors.filter((actor) => actor.alive);
  state.aliveCount = survivors.length;
  if (survivors.length === 1) {
    FinishMatch(state, survivors[0], "lastActorStanding");
    return true;
  }
  if (survivors.length === 0) {
    const fallback = [...state.actors].sort((first, second) => (
      (second.deathTime ?? -Infinity) - (first.deathTime ?? -Infinity)
      || second.kills - first.kills
      || first.id.localeCompare(second.id)
    ))[0];
    FinishMatch(state, fallback, "simultaneousEliminationTiebreak");
    return true;
  }
  return false;
}

function EliminateActor(state, actor, sourceId, cause, weaponId) {
  if (!actor.alive) {
    return;
  }
  actor.alive = false;
  actor.status = "dead";
  actor.health = 0;
  actor.deathTime = state.time;
  actor.deathCause = cause;
  actor.reloadTimer = 0;
  actor.healingTimer = 0;
  let killer = sourceId ? state.actors.find((candidate) => candidate.id === sourceId) : null;
  if (!killer && cause === "zone" && state.time - actor.lastDamageTime <= 10) {
    killer = state.actors.find((candidate) => candidate.id === actor.lastDamagedBy) ?? null;
  }
  if (killer && killer.id !== actor.id) {
    killer.kills += 1;
  }
  DropActorLoot(state, actor);
  state.aliveCount = CountAliveActors(state);
  const feedEntry = {
    id: state.eventSerial + 1,
    time: Number(state.time.toFixed(3)),
    killerId: killer?.id ?? null,
    victimId: actor.id,
    weaponId: weaponId ?? null,
    cause,
    remaining: state.aliveCount,
  };
  state.killFeed.push(feedEntry);
  if (state.killFeed.length > 18) {
    state.killFeed.shift();
  }
  AddEvent(state, "actorEliminated", feedEntry);
  CheckForWinner(state);
}

function ApplyDamage(state, actor, amount, sourceId, cause, weaponId, bypassArmor = false) {
  if (!actor.alive || amount <= 0 || state.phase === "results") {
    return 0;
  }
  if (state.phase === "combat" && CountAliveActors(state) <= 1) {
    CheckForWinner(state);
    return 0;
  }
  let healthDamage = amount;
  if (!bypassArmor && actor.armor > 0) {
    const absorbedDamage = Math.min(actor.armor, amount * 0.62);
    actor.armor -= absorbedDamage;
    healthDamage -= absorbedDamage;
  }
  actor.health -= healthDamage;
  actor.healingTimer = 0;
  actor.healingDuration = 0;
  if (sourceId && sourceId !== actor.id) {
    actor.lastDamagedBy = sourceId;
    actor.lastDamageTime = state.time;
    const source = state.actors.find((candidate) => candidate.id === sourceId);
    if (source) {
      source.damageDealt += healthDamage;
    }
  }
  if (actor.health <= 0.0001) {
    EliminateActor(state, actor, sourceId, cause, weaponId);
  }
  return healthDamage;
}

function FireWeapon(state, actor, input) {
  const weapon = actor.inventory.weaponId ? WEAPON_DATA[actor.inventory.weaponId] : null;
  if (
    !weapon
    || actor.fireCooldown > 0
    || actor.reloadTimer > 0
    || actor.healingTimer > 0
    || actor.inventory.magazineAmmo <= 0
  ) {
    if (weapon && actor.inventory.magazineAmmo <= 0) {
      StartReload(actor);
    }
    return;
  }
  let aimX = input.aimX;
  let aimY = input.aimY;
  let aim = NormalizeVector(aimX, aimY);
  if (aim.length === 0) {
    aimX = Math.cos(actor.angle);
    aimY = Math.sin(actor.angle);
    aim = NormalizeVector(aimX, aimY);
  }
  const spreadMultiplier = actor.isHuman ? 1 : AI_DIFFICULTY_PROFILES[state.config.difficulty].spreadMultiplier;
  const spreadAngle = (NextStateRandom(state) * 2 - 1) * weapon.spread * spreadMultiplier;
  const cosine = Math.cos(spreadAngle);
  const sine = Math.sin(spreadAngle);
  const directionX = aim.x * cosine - aim.y * sine;
  const directionY = aim.x * sine + aim.y * cosine;
  actor.angle = Math.atan2(directionY, directionX);
  actor.inventory.magazineAmmo -= 1;
  actor.fireCooldown = weapon.fireInterval;
  const coverDistance = GetCoverDistance(state.map, actor.x, actor.y, directionX, directionY, weapon.range);
  let target = null;
  let targetDistance = Math.min(weapon.range, coverDistance);
  for (const candidate of state.actors) {
    if (!candidate.alive || candidate.status !== "ground" || candidate.id === actor.id) {
      continue;
    }
    const hitDistance = RayCircleDistance(
      actor.x,
      actor.y,
      directionX,
      directionY,
      candidate.x,
      candidate.y,
      candidate.radius,
      weapon.range,
    );
    if (hitDistance < targetDistance) {
      target = candidate;
      targetDistance = hitDistance;
    }
  }
  if (target) {
    const rangeFalloff = 1 - Clamp(targetDistance / weapon.range, 0, 1) * 0.18;
    const dealtDamage = ApplyDamage(state, target, weapon.damage * rangeFalloff, actor.id, "weapon", weapon.id);
    AddEvent(state, "shotHit", {
      actorId: actor.id,
      targetId: target.id,
      weaponId: weapon.id,
      damage: Number(dealtDamage.toFixed(2)),
    });
  }
}

function UpdateActorTimers(state, actor, deltaTime) {
  actor.fireCooldown = Math.max(0, actor.fireCooldown - deltaTime);
  if (actor.reloadTimer > 0) {
    const previousTimer = actor.reloadTimer;
    actor.reloadTimer = Math.max(0, actor.reloadTimer - deltaTime);
    if (previousTimer > 0 && actor.reloadTimer === 0) {
      CompleteReload(actor);
      AddEvent(state, "reloadCompleted", { actorId: actor.id });
    }
  }
  if (actor.healingTimer > 0) {
    const previousTimer = actor.healingTimer;
    actor.healingTimer = Math.max(0, actor.healingTimer - deltaTime);
    if (previousTimer > 0 && actor.healingTimer === 0) {
      actor.health = Math.min(actor.maximumHealth, actor.health + 47);
      actor.healingDuration = 0;
      AddEvent(state, "healingCompleted", { actorId: actor.id, health: Number(actor.health.toFixed(2)) });
    }
  }
}

function UpdateCombatActors(state, inputByPlayer, deltaTime) {
  const actorInputs = new Map();
  for (const actor of state.actors) {
    if (!actor.alive || actor.status !== "ground") {
      continue;
    }
    UpdateActorTimers(state, actor, deltaTime);
    const input = actor.isHuman
      ? GetInput(inputByPlayer, actor.id)
      : ComputeAiInput(state, actor, deltaTime);
    actorInputs.set(actor.id, input);
  }

  for (const actor of state.actors) {
    if (!actor.alive || actor.status !== "ground" || state.phase === "results") {
      continue;
    }
    const input = actorInputs.get(actor.id) ?? CreateInput();
    if (input.pickup) {
      PickupLoot(state, actor);
    }
    if (input.heal) {
      StartHealing(actor);
    }
    if (input.reload) {
      StartReload(actor);
    }
    const actionSpeedMultiplier = actor.healingTimer > 0 ? 0.28 : actor.reloadTimer > 0 ? 0.72 : 1;
    const speed = (input.sprint ? state.config.sprintSpeed : state.config.groundSpeed) * actionSpeedMultiplier;
    MoveActor(state, actor, input.moveX, input.moveY, speed, deltaTime);
  }

  for (const actor of state.actors) {
    if (!actor.alive || actor.status !== "ground" || state.phase === "results") {
      continue;
    }
    const input = actorInputs.get(actor.id) ?? CreateInput();
    if (input.shoot) {
      FireWeapon(state, actor, input);
    }
  }
}

function UpdateSafeZoneGeometry(state, deltaTime) {
  const safeZone = state.safeZone;
  if (safeZone.phaseIndex < 0 || safeZone.stage === "inactive") {
    return;
  }
  safeZone.stageTime += deltaTime;
  const definition = SAFE_ZONE_PHASES[safeZone.phaseIndex];
  const durationScale = state.config.zoneDurationScale;
  if (safeZone.stage === "waiting") {
    const waitDuration = definition.waitDuration * durationScale;
    if (safeZone.stageTime >= waitDuration) {
      safeZone.stage = "shrinking";
      safeZone.stageTime -= waitDuration;
      safeZone.startCenter = { ...safeZone.center };
      safeZone.startRadius = safeZone.radius;
      AddEvent(state, "safeZoneShrinking", { phaseIndex: safeZone.phaseIndex });
    }
  }
  if (safeZone.stage === "shrinking") {
    const shrinkDuration = definition.shrinkDuration * durationScale;
    const progress = Clamp(safeZone.stageTime / shrinkDuration, 0, 1);
    safeZone.center.x = Lerp(safeZone.startCenter.x, safeZone.targetCenter.x, progress);
    safeZone.center.y = Lerp(safeZone.startCenter.y, safeZone.targetCenter.y, progress);
    safeZone.radius = Lerp(safeZone.startRadius, safeZone.targetRadius, progress);
    if (progress >= 1) {
      safeZone.center = { ...safeZone.targetCenter };
      safeZone.radius = safeZone.targetRadius;
      safeZone.completedPhases = safeZone.phaseIndex + 1;
      const leftoverTime = Math.max(0, safeZone.stageTime - shrinkDuration);
      if (safeZone.phaseIndex + 1 < SAFE_ZONE_PHASES.length) {
        PrepareSafeZonePhase(state, safeZone.phaseIndex + 1);
        safeZone.stageTime = leftoverTime;
      } else {
        safeZone.stage = "final";
        safeZone.stageTime = leftoverTime;
        AddEvent(state, "safeZoneFinal", { radius: safeZone.radius });
      }
    }
  }
}

function ApplySafeZoneDamage(state, deltaTime) {
  const safeZone = state.safeZone;
  if (safeZone.phaseIndex < 0 || state.phase !== "combat") {
    return;
  }
  const finalPressure = safeZone.stage === "final" && safeZone.stageTime > 8
    ? 5 + (safeZone.stageTime - 8) * 3
    : 0;
  for (const actor of state.actors) {
    if (!actor.alive || actor.status !== "ground" || state.phase === "results") {
      continue;
    }
    const outside = DistanceSquared(actor.x, actor.y, safeZone.center.x, safeZone.center.y) > safeZone.radius ** 2;
    if (outside || finalPressure > 0) {
      const damagePerSecond = safeZone.damagePerSecond + finalPressure;
      ApplyDamage(state, actor, damagePerSecond * deltaTime, null, "zone", null, true);
    }
  }
}

function ResolveCombatTimeout(state) {
  const survivors = state.actors.filter((actor) => actor.alive);
  if (survivors.length <= 1) {
    CheckForWinner(state);
    return;
  }
  survivors.sort((first, second) => {
    const firstScore = first.health + first.armor * 0.35 + first.kills * 120 + first.damageDealt * 0.05;
    const secondScore = second.health + second.armor * 0.35 + second.kills * 120 + second.damageDealt * 0.05;
    return secondScore - firstScore || first.id.localeCompare(second.id);
  });
  const winner = survivors[0];
  for (let index = 1; index < survivors.length; index += 1) {
    const actor = survivors[index];
    actor.alive = false;
    actor.status = "dead";
    actor.health = 0;
    actor.deathTime = state.time + index * 0.000001;
    actor.deathCause = "timeout";
  }
  FinishMatch(state, winner, "combatTimeoutTiebreak");
}

function UpdateCombat(state, inputByPlayer, deltaTime) {
  UpdateSafeZoneGeometry(state, deltaTime);
  UpdateCombatActors(state, inputByPlayer, deltaTime);
  ApplySafeZoneDamage(state, deltaTime);
  if (state.phase === "combat" && state.phaseTime >= state.config.maxCombatDuration) {
    ResolveCombatTimeout(state);
  }
}

function StepSimulation(state, inputByPlayer, deltaTime) {
  state.time += deltaTime;
  state.phaseTime += deltaTime;
  if (state.phase === "lobby") {
    if (state.phaseTime >= state.config.lobbyDuration) {
      BeginFlight(state);
    }
  } else if (state.phase === "flight") {
    UpdateFlight(state, inputByPlayer, deltaTime);
  } else if (state.phase === "drop") {
    UpdateDrop(state, inputByPlayer, deltaTime);
  } else if (state.phase === "combat") {
    UpdateCombat(state, inputByPlayer, deltaTime);
  }
}

export function StepMatch(state, inputByPlayer = {}, deltaTime = 1 / 60) {
  if (!state || typeof state !== "object" || !MATCH_PHASES.includes(state.phase)) {
    throw new TypeError("StepMatch requires a state returned by CreateMatch");
  }
  if (!Number.isFinite(deltaTime) || deltaTime < 0 || deltaTime > maximumCallDuration) {
    throw new RangeError(`dt must be a finite value between 0 and ${maximumCallDuration} seconds`);
  }
  if (state.phase === "results" || deltaTime === 0) {
    return state;
  }
  let remainingTime = deltaTime;
  while (remainingTime > 0.0000001 && state.phase !== "results") {
    const simulationStep = Math.min(maximumSimulationStep, remainingTime);
    StepSimulation(state, inputByPlayer, simulationStep);
    remainingTime -= simulationStep;
  }
  state.aliveCount = CountAliveActors(state);
  return state;
}

function CreateActorView(actor) {
  return {
    id: actor.id,
    name: actor.name,
    isHuman: actor.isHuman,
    alive: actor.alive,
    status: actor.status,
    x: actor.x,
    y: actor.y,
    z: actor.z,
    angle: actor.angle,
    health: actor.health,
    maximumHealth: actor.maximumHealth,
    armor: actor.armor,
    inventory: { ...actor.inventory },
    kills: actor.kills,
    reloadTimer: actor.reloadTimer,
    healingTimer: actor.healingTimer,
  };
}

export function GetLocalView(state, playerId = null) {
  if (!state || typeof state !== "object") {
    throw new TypeError("GetLocalView requires a match state");
  }
  const player = playerId === null
    ? null
    : state.actors.find((actor) => actor.id === String(playerId)) ?? null;
  return {
    schemaVersion: state.schemaVersion,
    seed: state.seed,
    worldSize: WORLD_SIZE,
    time: state.time,
    phase: state.phase,
    phaseTime: state.phaseTime,
    aliveCount: state.aliveCount,
    map: state.map,
    plane: { ...state.plane, start: { ...state.plane.start }, end: { ...state.plane.end }, direction: { ...state.plane.direction } },
    safeZone: {
      ...state.safeZone,
      center: { ...state.safeZone.center },
      targetCenter: { ...state.safeZone.targetCenter },
    },
    player: player ? CreateActorView(player) : null,
    actors: state.actors.map(CreateActorView),
    killFeed: state.killFeed.map((entry) => ({ ...entry })),
    recentEvents: state.events.slice(-24).map((event) => ({ ...event })),
    winnerId: state.winnerId,
    result: state.result,
    restartReady: state.restartReady,
  };
}

export function RestartMatch(state, overrides = {}) {
  if (!state?.restartReady || state.phase !== "results") {
    throw new Error("RestartMatch is available only after the results phase");
  }
  const options = {
    ...state.restartOptions,
    ...overrides,
    timing: {
      ...state.restartOptions.timing,
      ...(overrides.timing ?? {}),
    },
  };
  return CreateMatch(options);
}
