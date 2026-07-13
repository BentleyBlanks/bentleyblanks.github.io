import {
  difficultyDefinitions,
  gameConfig,
  phaseDefinitions,
  GetDifficultyDefinition,
} from "./Data_History.mjs";

export const worldConfig = Object.freeze({
  tileSize: 32,
  mapWidth: 56,
  mapHeight: 36,
  maximumPopulation: 32,
  autosaveSeconds: 30,
  visionCellSize: 32,
  sweepDurationSeconds: 900,
  phaseSafetyDelaySeconds: 2,
});

export const resourceDefinitions = Object.freeze({
  grain: Object.freeze({ id: "grain", name: "粮秣", shortName: "粮", color: "#d5ad62" }),
  timber: Object.freeze({ id: "timber", name: "木料", shortName: "木", color: "#859b6a" }),
  materiel: Object.freeze({ id: "materiel", name: "军需", shortName: "需", color: "#8ea3aa" }),
  intel: Object.freeze({ id: "intel", name: "情报", shortName: "情", color: "#bc8a73" }),
});

export const unitDefinitions = Object.freeze({
  work: Object.freeze({
    id: "work",
    name: "工作队",
    glyph: "工",
    description: "负责生产、转运、建造与修理；不脱产群众与基层人员的复合抽象。",
    maxHealth: 78,
    maxMorale: 100,
    speed: 50,
    sight: 154,
    attack: 4,
    range: 48,
    attackDelay: 1.6,
    population: 2,
    gatherRate: 0.42,
    buildRate: 1,
    cost: Object.freeze({ grain: 62, timber: 18, materiel: 0, intel: 0 }),
    trainSeconds: 38,
  }),
  scout: Object.freeze({
    id: "scout",
    name: "交通组",
    glyph: "联",
    description: "侦察道路、联络村庄并携带名册与情报；适合隐蔽机动。",
    maxHealth: 68,
    maxMorale: 110,
    speed: 78,
    sight: 240,
    attack: 6,
    range: 64,
    attackDelay: 1.5,
    population: 2,
    stealth: 0.58,
    cost: Object.freeze({ grain: 82, timber: 12, materiel: 28, intel: 0 }),
    trainSeconds: 48,
  }),
  militia: Object.freeze({
    id: "militia",
    name: "民兵组",
    glyph: "民",
    description: "警戒、掩护与短促伏击；不适合正面攻坚。",
    maxHealth: 118,
    maxMorale: 120,
    speed: 57,
    sight: 180,
    attack: 13,
    range: 104,
    attackDelay: 1.35,
    population: 4,
    cost: Object.freeze({ grain: 118, timber: 16, materiel: 62, intel: 8 }),
    trainSeconds: 58,
  }),
  guerrilla: Object.freeze({
    id: "guerrilla",
    name: "游击组",
    glyph: "游",
    description: "用于侦察后的破袭与阻援，能对封锁设施实施隐蔽破坏。",
    maxHealth: 142,
    maxMorale: 132,
    speed: 64,
    sight: 196,
    attack: 18,
    range: 122,
    attackDelay: 1.25,
    population: 5,
    stealth: 0.78,
    cost: Object.freeze({ grain: 145, timber: 20, materiel: 96, intel: 28 }),
    trainSeconds: 74,
  }),
  enemyPatrol: Object.freeze({
    id: "enemyPatrol",
    name: "伪军警戒队",
    glyph: "警",
    description: "沿公路和据点外围巡查的警戒力量。",
    maxHealth: 108,
    maxMorale: 100,
    speed: 54,
    sight: 164,
    attack: 10,
    range: 100,
    attackDelay: 1.4,
    population: 0,
  }),
  enemySquad: Object.freeze({
    id: "enemySquad",
    name: "日军搜索队",
    glyph: "搜",
    description: "火力和组织度更高的机动搜索力量。",
    maxHealth: 168,
    maxMorale: 135,
    speed: 59,
    sight: 188,
    attack: 17,
    range: 126,
    attackDelay: 1.25,
    population: 0,
  }),
});

export const buildingDefinitions = Object.freeze({
  headquarters: Object.freeze({
    id: "headquarters",
    name: "工作站",
    glyph: "站",
    description: "分散协调、保存档案与组织生产的核心。",
    maxHealth: 720,
    sight: 210,
    footprint: 1.5,
    buildSeconds: 0,
    population: 10,
    cost: Object.freeze({ grain: 0, timber: 0, materiel: 0, intel: 0 }),
    trains: Object.freeze(["work", "scout"]),
  }),
  granary: Object.freeze({
    id: "granary",
    name: "粮站",
    glyph: "粮",
    description: "分散储备与接收粮秣；附近农田生产效率提高。",
    maxHealth: 390,
    sight: 124,
    footprint: 1.15,
    buildSeconds: 52,
    population: 8,
    cost: Object.freeze({ grain: 35, timber: 95, materiel: 16, intel: 0 }),
    trains: Object.freeze([]),
  }),
  workshop: Object.freeze({
    id: "workshop",
    name: "修械所",
    glyph: "械",
    description: "维修、复装与制作有限破袭器材；并非现代化兵工厂。",
    maxHealth: 430,
    sight: 138,
    footprint: 1.25,
    buildSeconds: 68,
    population: 0,
    cost: Object.freeze({ grain: 45, timber: 118, materiel: 54, intel: 0 }),
    trains: Object.freeze(["militia", "guerrilla"]),
  }),
  shelter: Object.freeze({
    id: "shelter",
    name: "隐蔽点",
    glyph: "隐",
    description: "宜建在联络村附近，用于分散人员、物资与群众；不能抵消大规模搜索风险。",
    maxHealth: 300,
    sight: 104,
    footprint: 1,
    buildSeconds: 46,
    population: 4,
    cost: Object.freeze({ grain: 48, timber: 72, materiel: 22, intel: 0 }),
    trains: Object.freeze([]),
  }),
  clinic: Object.freeze({
    id: "clinic",
    name: "救护所",
    glyph: "护",
    description: "让附近失去行动力的小队恢复健康与士气。",
    maxHealth: 350,
    sight: 122,
    footprint: 1.1,
    buildSeconds: 58,
    population: 2,
    cost: Object.freeze({ grain: 82, timber: 78, materiel: 42, intel: 0 }),
    trains: Object.freeze([]),
  }),
  watchpost: Object.freeze({
    id: "watchpost",
    name: "观察哨",
    glyph: "哨",
    description: "扩大预警范围，并短暂记录巡逻最后位置。",
    maxHealth: 230,
    sight: 288,
    footprint: 0.8,
    buildSeconds: 34,
    population: 0,
    cost: Object.freeze({ grain: 18, timber: 62, materiel: 14, intel: 0 }),
    trains: Object.freeze([]),
  }),
});

export const nodeDefinitions = Object.freeze({
  field: Object.freeze({ id: "field", name: "农田与互助粮", resource: "grain", amount: 1200, glyph: "穗" }),
  grove: Object.freeze({ id: "grove", name: "林地", resource: "timber", amount: 1050, glyph: "木" }),
  salvage: Object.freeze({ id: "salvage", name: "废旧器材", resource: "materiel", amount: 620, glyph: "材" }),
  contact: Object.freeze({ id: "contact", name: "秘密情报点", resource: "intel", amount: 430, glyph: "讯" }),
});

const directionOffsets = Object.freeze([
  Object.freeze([1, 0]),
  Object.freeze([-1, 0]),
  Object.freeze([0, 1]),
  Object.freeze([0, -1]),
  Object.freeze([1, 1]),
  Object.freeze([-1, -1]),
  Object.freeze([1, -1]),
  Object.freeze([-1, 1]),
]);

function Clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function Distance(left, right) {
  return Math.hypot(left.x - right.x, left.y - right.y);
}

function CreateRandom(seed) {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let mixed = value;
    mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

function TileIndex(tileX, tileY) {
  return tileY * worldConfig.mapWidth + tileX;
}

function WorldPoint(tileX, tileY) {
  return {
    x: (tileX + 0.5) * worldConfig.tileSize,
    y: (tileY + 0.5) * worldConfig.tileSize,
  };
}

function IsInsideMap(tileX, tileY) {
  return tileX >= 0 && tileY >= 0 && tileX < worldConfig.mapWidth && tileY < worldConfig.mapHeight;
}

function CreateTiles(seed) {
  const random = CreateRandom(seed);
  const tiles = [];
  for (let tileY = 0; tileY < worldConfig.mapHeight; tileY += 1) {
    for (let tileX = 0; tileX < worldConfig.mapWidth; tileX += 1) {
      const riverCenter = 27 + Math.round(Math.sin(tileY * 0.35) * 1.5);
      const riverDistance = Math.abs(tileX - riverCenter);
      const bridge = riverDistance <= 1 && ([9, 22, 31].some((bridgeY) => Math.abs(tileY - bridgeY) <= 1));
      const roadCenter = 18 + Math.round(Math.sin(tileX * 0.24) * 2);
      const road = Math.abs(tileY - roadCenter) <= 1 || (tileX >= 8 && tileX <= 49 && Math.abs(tileY - (29 - Math.floor(tileX * 0.1))) <= 0);
      const railCenter = 5 + Math.round(tileX * 0.42);
      const rail = tileX >= 22 && Math.abs(tileY - railCenter) <= 0;
      let terrain = "plain";
      if (riverDistance <= 1 && !bridge) {
        terrain = "water";
      } else if (bridge) {
        terrain = "bridge";
      } else if (road) {
        terrain = "road";
      } else if (rail) {
        terrain = "rail";
      } else {
        const noise = random() + Math.sin(tileX * 0.41) * 0.14 + Math.cos(tileY * 0.29) * 0.12;
        if (noise > 0.79) terrain = "grove";
        else if (noise < 0.19) terrain = "field";
        else if (tileX < 11 && tileY < 13) terrain = "rough";
      }
      tiles.push({ tileX, tileY, terrain, road, rail, bridge, passable: terrain !== "water" });
    }
  }
  return tiles;
}

function CreateResourceNode(id, type, tileX, tileY, amountScale = 1) {
  const definition = nodeDefinitions[type];
  return {
    id,
    type,
    ...WorldPoint(tileX, tileY),
    tileX,
    tileY,
    amount: Math.round(definition.amount * amountScale),
    maximumAmount: Math.round(definition.amount * amountScale),
    discovered: false,
  };
}

function CreateVillage(id, name, tileX, tileY, population) {
  return {
    id,
    name,
    ...WorldPoint(tileX, tileY),
    tileX,
    tileY,
    population,
    contacted: false,
    safety: 100,
    pressure: 0,
    protectedCivilians: 0,
    lastThreatTime: -999,
  };
}

function CreateSite(id, type, name, tileX, tileY) {
  return {
    id,
    type,
    name,
    ...WorldPoint(tileX, tileY),
    tileX,
    tileY,
    health: type === "garrison" ? 680 : 360,
    maxHealth: type === "garrison" ? 680 : 360,
    sight: type === "garrison" ? 220 : 176,
    sabotaged: false,
    sabotageProgress: 0,
    discovered: false,
    disabled: false,
    spawnTimer: 75,
  };
}

function CreateBuilding(state, type, tileX, tileY, completed = true) {
  const definition = buildingDefinitions[type];
  const point = WorldPoint(tileX, tileY);
  const building = {
    id: `building${state.nextId}`,
    side: "player",
    type,
    ...point,
    tileX,
    tileY,
    health: completed ? definition.maxHealth : Math.max(1, definition.maxHealth * 0.12),
    maxHealth: definition.maxHealth,
    progress: completed ? 1 : 0,
    completed,
    queue: [],
    rallyPoint: { ...point },
    active: true,
    discoveredByEnemy: false,
  };
  state.nextId += 1;
  state.buildings.push(building);
  return building;
}

function CreateUnit(state, type, side, tileX, tileY, options = {}) {
  const definition = unitDefinitions[type];
  const difficulty = GetDifficultyDefinition(state.difficultyId);
  const point = WorldPoint(tileX, tileY);
  const healthScale = side === "enemy" ? difficulty.enemyHealth : 1;
  const unit = {
    id: `unit${state.nextId}`,
    side,
    type,
    ...point,
    health: definition.maxHealth * healthScale,
    maxHealth: definition.maxHealth * healthScale,
    morale: definition.maxMorale,
    maxMorale: definition.maxMorale,
    path: [],
    order: { type: "idle" },
    stance: side === "player" ? "defensive" : "aggressive",
    attackTimer: 0,
    actionProgress: 0,
    hitFlash: 0,
    suppressed: 0,
    alive: true,
    visibleToPlayer: side === "player",
    lastKnownX: point.x,
    lastKnownY: point.y,
    patrolRoute: options.patrolRoute || [],
    patrolIndex: options.patrolIndex || 0,
    alert: 0,
    lastSeenPlayer: null,
    carriesArchive: Boolean(options.carriesArchive),
    populationExempt: Boolean(options.populationExempt),
    retreatingForMorale: false,
    queue: [],
  };
  state.nextId += 1;
  state.units.push(unit);
  return unit;
}

function CreateInitialState(seed, difficultyId) {
  const selectedDifficulty = difficultyDefinitions[difficultyId] ? difficultyId : "standard";
  const state = {
    gameId: gameConfig.id,
    saveVersion: gameConfig.saveVersion,
    seed,
    randomState: seed >>> 0,
    difficultyId: selectedDifficulty,
    elapsedSeconds: 0,
    phaseIndex: 0,
    phaseSeconds: 0,
    sweepSeconds: 0,
    phaseCompletionDelay: 0,
    transitionSerial: 0,
    status: "playing",
    paused: false,
    speed: 1,
    nextId: 1,
    resources: {
      grain: 112,
      timber: 84,
      materiel: 46,
      intel: 12,
      support: GetDifficultyDefinition(selectedDifficulty).startingSupport,
      concealment: 82,
    },
    statistics: {
      grainGathered: 0,
      timberGathered: 0,
      materielGathered: 0,
      intelGathered: 0,
      sitesSabotaged: 0,
      villagesContacted: 0,
      protectedCivilians: 0,
      squadsLost: 0,
      enemiesRepelled: 0,
      alertsTriggered: 0,
      buildingsCompleted: 0,
      commandsIssued: 0,
      supportPeak: GetDifficultyDefinition(selectedDifficulty).startingSupport,
      supportLow: GetDifficultyDefinition(selectedDifficulty).startingSupport,
    },
    alert: 7,
    alertFloor: 0,
    alertDecayTimer: 0,
    lastCombatTime: -999,
    lastAutosaveTime: 0,
    archiveStored: false,
    archiveReplacementUsed: false,
    emergencyWorkRecruited: false,
    lastEvent: null,
    eventLog: [],
    messageSerial: 0,
    tiles: CreateTiles(seed),
    explored: Array(worldConfig.mapWidth * worldConfig.mapHeight).fill(false),
    visible: Array(worldConfig.mapWidth * worldConfig.mapHeight).fill(false),
    units: [],
    buildings: [],
    nodes: [],
    villages: [],
    sites: [],
    exitZone: { ...WorldPoint(52, 32), tileX: 52, tileY: 32, radius: 64, discovered: false },
    projectiles: [],
    effects: [],
  };

  CreateBuilding(state, "headquarters", 8, 28, true);
  CreateUnit(state, "work", "player", 7, 27);
  CreateUnit(state, "work", "player", 8, 30);
  CreateUnit(state, "work", "player", 10, 28);
  CreateUnit(state, "work", "player", 9, 26);

  state.nodes.push(
    CreateResourceNode("fieldWest", "field", 5, 24, 1.2),
    CreateResourceNode("fieldNorth", "field", 15, 18, 1),
    CreateResourceNode("fieldEast", "field", 37, 27, 1.1),
    CreateResourceNode("groveBase", "grove", 12, 31, 1.25),
    CreateResourceNode("groveNorth", "grove", 17, 11, 1.1),
    CreateResourceNode("groveEast", "grove", 42, 14, 0.9),
    CreateResourceNode("salvageWest", "salvage", 13, 25, 0.9),
    CreateResourceNode("salvageBridge", "salvage", 31, 23, 1.15),
    CreateResourceNode("salvageRail", "salvage", 45, 25, 1.05),
    CreateResourceNode("contactNorth", "contact", 18, 8, 0.8),
    CreateResourceNode("contactEast", "contact", 41, 18, 1.1),
    CreateResourceNode("contactSouth", "contact", 48, 30, 0.9),
  );

  state.villages.push(
    CreateVillage("willowVillage", "柳湾村", 16, 20, 38),
    CreateVillage("reedVillage", "白苇村", 35, 28, 34),
    CreateVillage("locustVillage", "槐树庄", 41, 11, 31),
  );

  state.sites.push(
    CreateSite("northBlockade", "checkpoint", "北沟封锁卡", 25, 10),
    CreateSite("centralBlockade", "checkpoint", "东桥检问所", 34, 20),
    CreateSite("railRelay", "relay", "铁路通信点", 45, 24),
    CreateSite("northGarrison", "garrison", "北部据点", 50, 6),
    CreateSite("eastGarrison", "garrison", "东部据点", 50, 25),
  );

  CreateUnit(state, "enemyPatrol", "enemy", 31, 18, {
    patrolRoute: [WorldPoint(22, 18), WorldPoint(34, 20), WorldPoint(43, 17), WorldPoint(31, 18)],
  });
  CreateUnit(state, "enemyPatrol", "enemy", 43, 10, {
    patrolRoute: [WorldPoint(39, 11), WorldPoint(48, 7), WorldPoint(50, 15), WorldPoint(43, 10)],
  });
  CreateUnit(state, "enemySquad", "enemy", 49, 24, {
    patrolRoute: [WorldPoint(49, 24), WorldPoint(42, 22), WorldPoint(47, 29)],
  });

  AddEvent(state, "战役开始", "先组织生产与隐蔽，不要暴露工作站。", "system");
  UpdateVision(state);
  return state;
}

export function CreateGameState(options = {}) {
  const seed = Number.isInteger(options.seed) ? options.seed : 19420501;
  return CreateInitialState(seed, options.difficultyId || "standard");
}

function AddEvent(state, title, text, tone = "info") {
  state.messageSerial += 1;
  const event = {
    id: `event${state.messageSerial}`,
    time: state.elapsedSeconds,
    title,
    text,
    tone,
  };
  state.lastEvent = event;
  state.eventLog.unshift(event);
  state.eventLog = state.eventLog.slice(0, 40);
  return event;
}

function NextRandom(state) {
  let value = state.randomState >>> 0;
  value += 0x6d2b79f5;
  let mixed = value;
  mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
  mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
  state.randomState = value >>> 0;
  return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
}

export function GetTile(state, tileX, tileY) {
  if (!IsInsideMap(tileX, tileY)) return null;
  return state.tiles[TileIndex(tileX, tileY)];
}

export function GetTileAtWorld(state, worldX, worldY) {
  return GetTile(
    state,
    Math.floor(worldX / worldConfig.tileSize),
    Math.floor(worldY / worldConfig.tileSize),
  );
}

export function IsWorldPointPassable(state, worldX, worldY) {
  const tile = GetTileAtWorld(state, worldX, worldY);
  return Boolean(tile?.passable);
}

function GetTerrainMoveCost(tile) {
  if (!tile?.passable) return Number.POSITIVE_INFINITY;
  if (tile.terrain === "road" || tile.terrain === "bridge") return 0.78;
  if (tile.terrain === "rough") return 1.32;
  if (tile.terrain === "grove") return 1.12;
  return 1;
}

function ReconstructPath(cameFrom, currentKey) {
  const path = [];
  let key = currentKey;
  while (cameFrom.has(key)) {
    const [tileX, tileY] = key.split(",").map(Number);
    path.unshift(WorldPoint(tileX, tileY));
    key = cameFrom.get(key);
  }
  return path;
}

export function FindPath(state, fromX, fromY, toX, toY, maximumIterations = 5000) {
  const startX = Clamp(Math.floor(fromX / worldConfig.tileSize), 0, worldConfig.mapWidth - 1);
  const startY = Clamp(Math.floor(fromY / worldConfig.tileSize), 0, worldConfig.mapHeight - 1);
  let goalX = Clamp(Math.floor(toX / worldConfig.tileSize), 0, worldConfig.mapWidth - 1);
  let goalY = Clamp(Math.floor(toY / worldConfig.tileSize), 0, worldConfig.mapHeight - 1);
  let destination = { x: toX, y: toY };
  if (!GetTile(state, goalX, goalY)?.passable) {
    const nearby = directionOffsets
      .map(([offsetX, offsetY]) => [goalX + offsetX, goalY + offsetY])
      .find(([tileX, tileY]) => GetTile(state, tileX, tileY)?.passable);
    if (!nearby) return [];
    [goalX, goalY] = nearby;
    destination = WorldPoint(goalX, goalY);
  }
  const startKey = `${startX},${startY}`;
  const goalKey = `${goalX},${goalY}`;
  if (startKey === goalKey) return [destination];

  const open = new Set([startKey]);
  const cameFrom = new Map();
  const gScore = new Map([[startKey, 0]]);
  const fScore = new Map([[startKey, Math.hypot(goalX - startX, goalY - startY)]]);
  let iterations = 0;
  while (open.size && iterations < maximumIterations) {
    iterations += 1;
    let currentKey = null;
    let currentScore = Number.POSITIVE_INFINITY;
    for (const key of open) {
      const score = fScore.get(key) ?? Number.POSITIVE_INFINITY;
      if (score < currentScore) {
        currentScore = score;
        currentKey = key;
      }
    }
    if (currentKey === goalKey) {
      const result = ReconstructPath(cameFrom, currentKey);
      result[result.length - 1] = destination;
      return result;
    }
    open.delete(currentKey);
    const [currentX, currentY] = currentKey.split(",").map(Number);
    for (const [offsetX, offsetY] of directionOffsets) {
      const nextX = currentX + offsetX;
      const nextY = currentY + offsetY;
      const tile = GetTile(state, nextX, nextY);
      if (!tile?.passable) continue;
      const diagonal = offsetX !== 0 && offsetY !== 0;
      const tentative = (gScore.get(currentKey) ?? Number.POSITIVE_INFINITY)
        + GetTerrainMoveCost(tile) * (diagonal ? 1.414 : 1);
      const nextKey = `${nextX},${nextY}`;
      if (tentative < (gScore.get(nextKey) ?? Number.POSITIVE_INFINITY)) {
        cameFrom.set(nextKey, currentKey);
        gScore.set(nextKey, tentative);
        fScore.set(nextKey, tentative + Math.hypot(goalX - nextX, goalY - nextY));
        open.add(nextKey);
      }
    }
  }
  return [];
}

function GetLivingUnits(state, side = null) {
  return state.units.filter((unit) => unit.alive && (!side || unit.side === side));
}

function GetCompletedBuildings(state, type = null) {
  return state.buildings.filter((building) => building.active && building.completed && (!type || building.type === type));
}

export function GetPopulation(state) {
  const used = GetLivingUnits(state, "player")
    .reduce((sum, unit) => sum + (unit.populationExempt ? 0 : unitDefinitions[unit.type]?.population || 0), 0);
  const capacity = Math.min(
    worldConfig.maximumPopulation,
    GetCompletedBuildings(state)
      .reduce((sum, building) => sum + (buildingDefinitions[building.type]?.population || 0), 0),
  );
  return { used, capacity };
}

export function CanAfford(state, cost) {
  return Object.entries(cost).every(([resourceId, amount]) => (state.resources[resourceId] || 0) >= amount);
}

function SpendResources(state, cost) {
  if (!CanAfford(state, cost)) return false;
  for (const [resourceId, amount] of Object.entries(cost)) {
    state.resources[resourceId] -= amount;
  }
  return true;
}

function AddAlert(state, amount, reason) {
  const previous = state.alert;
  state.alert = Clamp(state.alert + amount, state.alertFloor, 100);
  if (previous < 50 && state.alert >= 50) {
    state.statistics.alertsTriggered += 1;
    AddEvent(state, "敌方扩大搜索", reason || "行动迹象引来了更多巡逻。", "warning");
  } else if (previous < 75 && state.alert >= 75) {
    state.statistics.alertsTriggered += 1;
    AddEvent(state, "封锁进入高压", reason || "据点之间开始协同搜索。", "danger");
  }
}

function ResolveFormationOffsets(count) {
  const offsets = [];
  const spacing = 24;
  const columnCount = Math.min(4, count);
  const rowCount = Math.ceil(count / columnCount);
  for (let index = 0; index < count; index += 1) {
    const row = Math.floor(index / columnCount);
    const column = index % columnCount;
    const itemsInRow = Math.min(columnCount, count - row * columnCount);
    offsets.push({
      x: (column - (itemsInRow - 1) * 0.5) * spacing,
      y: (row - (rowCount - 1) * 0.5) * spacing,
    });
  }
  return offsets;
}

export function IssueMoveCommand(state, unitIds, worldX, worldY, options = {}) {
  const units = unitIds
    .map((unitId) => state.units.find((candidate) => candidate.id === unitId))
    .filter((unit) => unit?.alive && unit.side === "player");
  if (!units.length) return { valid: false, reason: "没有可行动的小队。" };
  const offsets = ResolveFormationOffsets(units.length);
  units.forEach((unit, index) => {
    const targetX = Clamp(worldX + offsets[index].x, 16, worldConfig.mapWidth * worldConfig.tileSize - 16);
    const targetY = Clamp(worldY + offsets[index].y, 16, worldConfig.mapHeight * worldConfig.tileSize - 16);
    const path = FindPath(state, unit.x, unit.y, targetX, targetY);
    if (!options.queue) unit.queue = [];
    const shouldQueue = options.queue && unit.order.type !== "idle";
    const order = { type: options.attackMove ? "attackMove" : "move", x: targetX, y: targetY, path: shouldQueue ? [] : path };
    if (shouldQueue) unit.queue.push(order);
    else {
      unit.order = order;
      unit.path = order.path;
      unit.actionProgress = 0;
    }
  });
  state.statistics.commandsIssued += 1;
  return { valid: true };
}

export function IssueStopCommand(state, unitIds) {
  for (const unitId of unitIds) {
    const unit = state.units.find((candidate) => candidate.id === unitId && candidate.alive && candidate.side === "player");
    if (!unit) continue;
    unit.path = [];
    unit.queue = [];
    unit.order = { type: "idle" };
    unit.actionProgress = 0;
  }
  return { valid: true };
}

export function IssueGatherCommand(state, unitIds, nodeId) {
  const node = state.nodes.find((candidate) => candidate.id === nodeId && candidate.amount > 0);
  if (!node) return { valid: false, reason: "这个生产点已经无法继续使用。" };
  const workers = unitIds
    .map((unitId) => state.units.find((candidate) => candidate.id === unitId))
    .filter((unit) => unit?.alive && unit.side === "player" && unit.type === "work");
  if (!workers.length) return { valid: false, reason: "只有工作队能够组织生产与转运。" };
  workers.forEach((unit, index) => {
    const angle = (index / Math.max(1, workers.length)) * Math.PI * 2;
    const targetX = node.x + Math.cos(angle) * 30;
    const targetY = node.y + Math.sin(angle) * 30;
    unit.path = FindPath(state, unit.x, unit.y, targetX, targetY);
    unit.order = { type: "gather", nodeId, x: targetX, y: targetY };
    unit.queue = [];
    unit.actionProgress = 0;
  });
  state.statistics.commandsIssued += 1;
  return { valid: true };
}

function IsBuildLocationValid(state, tileX, tileY) {
  const tile = GetTile(state, tileX, tileY);
  if (!tile?.passable || tile.terrain === "rail" || tile.terrain === "bridge") return false;
  const point = WorldPoint(tileX, tileY);
  if (state.buildings.some((building) => building.active && Distance(building, point) < 62)) return false;
  if (state.sites.some((site) => !site.sabotaged && Distance(site, point) < 90)) return false;
  if (state.villages.some((village) => Distance(village, point) < 72)) return false;
  return true;
}

export function GetBuildPreview(state, buildingType, worldX, worldY) {
  const definition = buildingDefinitions[buildingType];
  if (!definition || buildingType === "headquarters") return { valid: false, reason: "未知建筑。" };
  const tileX = Math.floor(worldX / worldConfig.tileSize);
  const tileY = Math.floor(worldY / worldConfig.tileSize);
  if (!IsBuildLocationValid(state, tileX, tileY)) return { valid: false, reason: "这里不适合修建。", tileX, tileY };
  if (!CanAfford(state, definition.cost)) return { valid: false, reason: "资源不足。", tileX, tileY };
  return { valid: true, tileX, tileY, ...WorldPoint(tileX, tileY), definition };
}

export function PlaceBuilding(state, buildingType, worldX, worldY, workerIds) {
  const preview = GetBuildPreview(state, buildingType, worldX, worldY);
  if (!preview.valid) return preview;
  const workers = workerIds
    .map((unitId) => state.units.find((candidate) => candidate.id === unitId))
    .filter((unit) => unit?.alive && unit.side === "player" && unit.type === "work");
  if (!workers.length) return { valid: false, reason: "需要工作队修建。" };
  if (!SpendResources(state, preview.definition.cost)) return { valid: false, reason: "资源不足。" };
  const building = CreateBuilding(state, buildingType, preview.tileX, preview.tileY, false);
  AssignWorkersToBuilding(state, building, workers);
  AddAlert(state, 3, "修建活动留下了可观察的迹象。 ");
  AddEvent(state, "开始修建", `${preview.definition.name}已选址，工作队正在分散施工。`, "info");
  state.statistics.commandsIssued += 1;
  return { valid: true, building };
}

function AssignWorkersToBuilding(state, building, workers) {
  workers.forEach((worker, index) => {
    const angle = (index / Math.max(1, workers.length)) * Math.PI * 2;
    const targetX = building.x + Math.cos(angle) * 42;
    const targetY = building.y + Math.sin(angle) * 42;
    worker.path = FindPath(state, worker.x, worker.y, targetX, targetY);
    worker.order = { type: "build", buildingId: building.id, x: targetX, y: targetY };
    worker.queue = [];
  });
}

export function IssueBuildCommand(state, unitIds, buildingId) {
  const building = state.buildings.find((candidate) => candidate.id === buildingId && candidate.active && !candidate.completed);
  if (!building) return { valid: false, reason: "这处设施已经完成或无法继续施工。" };
  const workers = unitIds
    .map((unitId) => state.units.find((candidate) => candidate.id === unitId))
    .filter((unit) => unit?.alive && unit.side === "player" && unit.type === "work");
  if (!workers.length) return { valid: false, reason: "需要工作队继续施工。" };
  AssignWorkersToBuilding(state, building, workers);
  AddEvent(state, "恢复施工", `${buildingDefinitions[building.type].name}已重新分派工作队。`, "info");
  state.statistics.commandsIssued += 1;
  return { valid: true };
}

export function QueueTraining(state, buildingId, unitType) {
  const building = state.buildings.find((candidate) => candidate.id === buildingId && candidate.active && candidate.completed);
  const definition = unitDefinitions[unitType];
  if (!building || !definition || definition.population <= 0) return { valid: false, reason: "无法在这里组织该小队。" };
  if (!buildingDefinitions[building.type].trains.includes(unitType)) return { valid: false, reason: "该建筑不能组织这个小队。" };
  if (unitType === "guerrilla" && state.phaseIndex < 2) return { valid: false, reason: "完成联村阶段后才能组织游击组。" };
  if (building.queue.length >= 3) return { valid: false, reason: "组织队列已满。" };
  const population = GetPopulation(state);
  const queuedPopulation = state.buildings.reduce(
    (sum, candidate) => sum + (candidate.active && candidate.completed
      ? candidate.queue.reduce((queueSum, item) => queueSum + (unitDefinitions[item.unitType]?.population || 0), 0)
      : 0),
    0,
  );
  if (population.used + queuedPopulation + definition.population > population.capacity) return { valid: false, reason: "人员容纳不足，请修建粮站或隐蔽点。" };
  if (!SpendResources(state, definition.cost)) return { valid: false, reason: "资源不足。" };
  building.queue.push({ unitType, remaining: definition.trainSeconds, total: definition.trainSeconds });
  AddEvent(state, "开始组织", `${definition.name}正在分散集结。`, "info");
  return { valid: true };
}

export function IssueAttackCommand(state, unitIds, targetId) {
  const targetUnit = state.units.find((candidate) => candidate.id === targetId && candidate.alive && candidate.side === "enemy");
  const targetSite = state.sites.find((candidate) => candidate.id === targetId && !candidate.sabotaged && candidate.health > 0);
  const target = targetUnit || targetSite;
  if (!target) return { valid: false, reason: "目标已经离开。" };
  const attackers = unitIds
    .map((unitId) => state.units.find((candidate) => candidate.id === unitId))
    .filter((unit) => unit?.alive && unit.side === "player" && !["work", "scout"].includes(unit.type));
  if (!attackers.length) return { valid: false, reason: "当前选择没有适合交火的小队。" };
  attackers.forEach((unit) => {
    unit.order = { type: "attack", targetId };
    unit.path = [];
    unit.queue = [];
  });
  AddAlert(state, 8, "交火会迅速提高敌方警戒。 ");
  state.statistics.commandsIssued += 1;
  return { valid: true };
}

export function IssueSabotageCommand(state, unitIds, siteId) {
  const site = state.sites.find((candidate) => candidate.id === siteId && !candidate.sabotaged && !candidate.disabled && candidate.health > 0 && candidate.type !== "garrison");
  if (!site) return { valid: false, reason: "这个目标无法实施破袭。" };
  const unit = unitIds
    .map((unitId) => state.units.find((candidate) => candidate.id === unitId))
    .find((candidate) => candidate?.alive && candidate.side === "player" && candidate.type === "guerrilla");
  if (!unit) return { valid: false, reason: "需要游击组实施破袭。" };
  const cost = { grain: 0, timber: 0, materiel: site.type === "relay" ? 26 : 38, intel: site.type === "relay" ? 14 : 20 };
  if (!SpendResources(state, cost)) return { valid: false, reason: "破袭器材或情报不足。" };
  unit.path = FindPath(state, unit.x, unit.y, site.x, site.y);
  unit.order = { type: "sabotage", targetId: site.id, committedCost: cost };
  unit.queue = [];
  unit.actionProgress = 0;
  AddEvent(state, "破袭准备", `${unitDefinitions[unit.type].name}正接近${site.name}。`, "warning");
  return { valid: true };
}

export function SetUnitStance(state, unitIds, stance) {
  if (!["hold", "defensive", "aggressive"].includes(stance)) return { valid: false, reason: "未知姿态。" };
  unitIds.forEach((unitId) => {
    const unit = state.units.find((candidate) => candidate.id === unitId && candidate.alive && candidate.side === "player");
    if (unit) unit.stance = stance;
  });
  return { valid: true };
}

function AdvanceQueuedOrder(state, unit) {
  if (!unit.queue.length) {
    unit.order = { type: "idle" };
    unit.path = [];
    return;
  }
  const order = unit.queue.shift();
  unit.order = order;
  unit.path = ["move", "attackMove"].includes(order.type)
    ? FindPath(state, unit.x, unit.y, order.x, order.y)
    : order.path || [];
}

function MoveUnitAlongPath(state, unit, deltaSeconds) {
  if (!unit.path.length) return true;
  const definition = unitDefinitions[unit.type];
  const target = unit.path[0];
  const currentTile = GetTileAtWorld(state, unit.x, unit.y);
  const tile = currentTile?.passable ? currentTile : GetTileAtWorld(state, target.x, target.y);
  const terrainFactor = 1 / GetTerrainMoveCost(tile);
  const moraleFactor = unit.morale < 30 ? 0.82 : 1;
  const suppressionFactor = unit.suppressed > 0 ? 0.78 : 1;
  const distanceRemaining = Math.hypot(target.x - unit.x, target.y - unit.y);
  const step = definition.speed * terrainFactor * moraleFactor * suppressionFactor * deltaSeconds;
  if (distanceRemaining <= step + 0.5) {
    unit.x = target.x;
    unit.y = target.y;
    unit.path.shift();
  } else {
    unit.x += ((target.x - unit.x) / distanceRemaining) * step;
    unit.y += ((target.y - unit.y) / distanceRemaining) * step;
  }
  return unit.path.length === 0;
}

function UpdateGathering(state, unit, deltaSeconds) {
  const node = state.nodes.find((candidate) => candidate.id === unit.order.nodeId);
  if (!node || node.amount <= 0) {
    AddEvent(state, "生产点暂时枯竭", node ? `${nodeDefinitions[node.type].name}需要另寻来源。` : "生产命令已中止。", "muted");
    AdvanceQueuedOrder(state, unit);
    return;
  }
  if (Distance(unit, node) > 48) {
    if (!unit.path.length) unit.path = FindPath(state, unit.x, unit.y, node.x, node.y);
    MoveUnitAlongPath(state, unit, deltaSeconds);
    return;
  }
  const definition = unitDefinitions[unit.type];
  const difficulty = GetDifficultyDefinition(state.difficultyId);
  let rate = definition.gatherRate * difficulty.economyRate;
  if (node.type === "field" && state.buildings.some((building) => building.completed && building.type === "granary" && Distance(building, node) < 240)) {
    rate *= 1.18;
  }
  const amount = Math.min(node.amount, rate * deltaSeconds);
  node.amount -= amount;
  const resourceId = nodeDefinitions[node.type].resource;
  state.resources[resourceId] += amount;
  const statisticKey = `${resourceId}Gathered`;
  if (statisticKey in state.statistics) state.statistics[statisticKey] += amount;
  unit.actionProgress = (unit.actionProgress + deltaSeconds * 0.9) % 1;
}

function UpdateBuildingWork(state, unit, deltaSeconds) {
  const building = state.buildings.find((candidate) => candidate.id === unit.order.buildingId && candidate.active);
  if (!building || building.completed) {
    AdvanceQueuedOrder(state, unit);
    return;
  }
  if (Distance(unit, building) > 52) {
    if (!unit.path.length) unit.path = FindPath(state, unit.x, unit.y, building.x, building.y);
    MoveUnitAlongPath(state, unit, deltaSeconds);
    return;
  }
  const definition = buildingDefinitions[building.type];
  const workerCount = state.units.filter((candidate) => candidate.alive && candidate.order.type === "build" && candidate.order.buildingId === building.id && Distance(candidate, building) <= 58).length;
  const collaborationFactor = 1 / Math.max(1, workerCount);
  building.progress = Clamp(building.progress + (deltaSeconds * unitDefinitions[unit.type].buildRate * collaborationFactor) / definition.buildSeconds, 0, 1);
  building.health = Math.max(building.health, building.maxHealth * Math.max(0.12, building.progress));
  unit.actionProgress = (unit.actionProgress + deltaSeconds) % 1;
  if (building.progress >= 1) {
    building.completed = true;
    building.health = building.maxHealth;
    state.statistics.buildingsCompleted += 1;
    AddEvent(state, `${definition.name}建成`, "设施已投入使用，并已进行分散伪装。", "success");
    state.units
      .filter((candidate) => candidate.alive && candidate.order.type === "build" && candidate.order.buildingId === building.id)
      .forEach((candidate) => AdvanceQueuedOrder(state, candidate));
  }
}

function UpdateSabotage(state, unit, deltaSeconds) {
  const site = state.sites.find((candidate) => candidate.id === unit.order.targetId && !candidate.sabotaged && !candidate.disabled && candidate.health > 0);
  if (!site) {
    AdvanceQueuedOrder(state, unit);
    return;
  }
  if (Distance(unit, site) > 54) {
    if (!unit.path.length) unit.path = FindPath(state, unit.x, unit.y, site.x, site.y);
    MoveUnitAlongPath(state, unit, deltaSeconds);
    return;
  }
  const nearbyEnemy = GetLivingUnits(state, "enemy").some((enemy) => Distance(enemy, unit) < 145);
  if (nearbyEnemy) {
    unit.actionProgress = Math.max(0, unit.actionProgress - deltaSeconds * 0.3);
    return;
  }
  const requiredSeconds = site.type === "relay" ? 22 : 36;
  unit.actionProgress += deltaSeconds;
  site.sabotageProgress = Clamp(unit.actionProgress / requiredSeconds, 0, 1);
  if (unit.actionProgress >= requiredSeconds) {
    site.sabotaged = true;
    site.health = 0;
    state.statistics.sitesSabotaged += 1;
    const alertAmount = site.type === "relay" ? 12 : 20;
    AddAlert(state, alertAmount, "封锁设施被破坏后，附近据点开始搜索。 ");
    state.effects.push({ type: "sabotage", x: site.x, y: site.y, life: 1.8, maximumLife: 1.8 });
    AddEvent(state, "通道已经撕开", `${site.name}失去作用；立即离开，不要停留。`, "success");
    unit.actionProgress = 0;
    AdvanceQueuedOrder(state, unit);
  }
}

function GetTargetById(state, targetId) {
  return state.units.find((candidate) => candidate.id === targetId && candidate.alive)
    || state.buildings.find((candidate) => candidate.id === targetId && candidate.active)
    || state.sites.find((candidate) => candidate.id === targetId && !candidate.sabotaged && !candidate.disabled && candidate.health > 0)
    || null;
}

function GetAttackTarget(state, unit, maximumDistance) {
  const targetSide = unit.side === "player" ? "enemy" : "player";
  const units = GetLivingUnits(state, targetSide)
    .filter((candidate) => Distance(candidate, unit) <= maximumDistance)
    .sort((left, right) => Distance(left, unit) - Distance(right, unit));
  if (units.length) return units[0];
  if (unit.side === "enemy") {
    return state.buildings
      .filter((building) => building.active && building.completed && Distance(building, unit) <= maximumDistance)
      .sort((left, right) => Distance(left, unit) - Distance(right, unit))[0] || null;
  }
  return null;
}

function DealDamage(state, attacker, target) {
  const attackerDefinition = unitDefinitions[attacker.type];
  const difficulty = GetDifficultyDefinition(state.difficultyId);
  const damageScale = attacker.side === "enemy" ? difficulty.enemyDamage : 1;
  const terrain = GetTileAtWorld(state, target.x, target.y);
  const cover = terrain?.terrain === "grove" ? 0.82 : terrain?.terrain === "rough" ? 0.9 : 1;
  const moraleScale = attacker.morale < 30 ? 0.74 : 1;
  const variance = 0.86 + NextRandom(state) * 0.28;
  const damage = attackerDefinition.attack * damageScale * cover * moraleScale * variance;
  target.health -= damage;
  if ("morale" in target) target.morale = Math.max(0, target.morale - damage * 0.46);
  target.hitFlash = 0.16;
  attacker.attackTimer = attackerDefinition.attackDelay;
  state.lastCombatTime = state.elapsedSeconds;
  state.projectiles.push({
    x: attacker.x,
    y: attacker.y,
    targetX: target.x,
    targetY: target.y,
    side: attacker.side,
    life: 0.16,
    maximumLife: 0.16,
  });
  AddAlert(state, attacker.side === "player" ? 0.7 : 0.25, "持续交火正在暴露行动位置。 ");
}

function ResolveDefeat(state, target, attacker) {
  if (target.health > 0) return;
  if ("alive" in target) {
    target.alive = false;
    target.health = 0;
    target.path = [];
    if (target.side === "player") {
      state.statistics.squadsLost += 1;
      state.resources.support = Clamp(state.resources.support - (target.type === "work" ? 5 : 3), 0, 100);
      AddEvent(state, "一支小队失去行动力", "伤员已被分散转移；不要在同一地点继续消耗。", "danger");
      if (target.carriesArchive) {
        const scout = GetLivingUnits(state, "player").find((unit) => unit.type === "scout");
        target.carriesArchive = false;
        if (scout) {
          scout.carriesArchive = true;
          AddEvent(state, "档案已完成转交", "另一支交通组接过密封档案，转移任务仍可继续。", "warning");
        } else {
          state.archiveStored = true;
          AddEvent(state, "档案已送回工作站", "重新组织交通组后即可继续转移，不必重开战役。", "warning");
        }
      }
    } else {
      state.statistics.enemiesRepelled += 1;
      AddEvent(state, "敌方小队退出接触", "行动窗口很短，应继续执行任务而非追击。", "muted");
    }
    state.effects.push({ type: "withdraw", x: target.x, y: target.y, life: 1.1, maximumLife: 1.1, side: target.side });
  } else if ("active" in target) {
    target.active = false;
    target.health = 0;
    target.queue = [];
    if (target.type === "headquarters") {
      state.status = "lost";
      AddEvent(state, "工作站失去运转能力", "档案和联络未能及时转移。", "danger");
    }
  } else if (attacker?.side === "player") {
    target.health = 0;
    if (target.type === "garrison") {
      target.disabled = true;
      AddEvent(state, "据点暂时失去响应", "正面攻坚代价很高；应立即脱离，不要继续停留。", "warning");
    } else {
      target.sabotaged = true;
      state.statistics.sitesSabotaged += 1;
      AddEvent(state, "封锁设施失去作用", "强行破坏留下了明显迹象，转移窗口会很短。", "warning");
    }
    state.effects.push({ type: "sabotage", x: target.x, y: target.y, life: 1.8, maximumLife: 1.8 });
    AddAlert(state, 14, "对固定设施的正面攻击造成了明显暴露。 ");
  }
}

function UpdateAttack(state, unit, deltaSeconds) {
  let target = unit.order.targetId ? GetTargetById(state, unit.order.targetId) : null;
  const definition = unitDefinitions[unit.type];
  const engagementRange = definition.range;
  if (!target) {
    if (unit.order.type === "attack") {
      AdvanceQueuedOrder(state, unit);
      return;
    }
    target = GetAttackTarget(state, unit, unit.stance === "aggressive" ? 230 : engagementRange + 36);
  }
  if (!target) return;
  const distance = Distance(unit, target);
  if (distance > engagementRange) {
    if (unit.stance === "hold" && unit.order.type !== "attack") return;
    if (!unit.path.length || Distance(unit.path[unit.path.length - 1], target) > 24) {
      unit.path = FindPath(state, unit.x, unit.y, target.x, target.y);
    }
    MoveUnitAlongPath(state, unit, deltaSeconds);
    return;
  }
  unit.path = [];
  if (unit.attackTimer <= 0) {
    DealDamage(state, unit, target);
    ResolveDefeat(state, target, unit);
  }
}

function UpdatePlayerUnit(state, unit, deltaSeconds) {
  unit.attackTimer = Math.max(0, unit.attackTimer - deltaSeconds);
  unit.hitFlash = Math.max(0, unit.hitFlash - deltaSeconds);
  unit.suppressed = Math.max(0, unit.suppressed - deltaSeconds);
  if (unit.health <= 0 || !unit.alive) return;

  if (unit.morale < 18 && unit.type !== "work") {
    const headquarters = GetCompletedBuildings(state, "headquarters")[0];
    if (headquarters && !["retreat", "recover"].includes(unit.order.type)) {
      unit.order = { type: "retreat", x: headquarters.x, y: headquarters.y };
      unit.path = FindPath(state, unit.x, unit.y, headquarters.x, headquarters.y);
      if (!unit.retreatingForMorale) AddEvent(state, `${unitDefinitions[unit.type].name}正在脱离`, "士气过低，小队自行向工作站方向撤回。", "warning");
      unit.retreatingForMorale = true;
    }
  } else if (unit.retreatingForMorale && unit.morale >= 30) {
    unit.retreatingForMorale = false;
    if (["retreat", "recover"].includes(unit.order.type)) unit.order = { type: "idle" };
    AddEvent(state, `${unitDefinitions[unit.type].name}恢复行动`, "小队已完成休整，可以重新部署。", "muted");
  }

  switch (unit.order.type) {
    case "move":
      if (MoveUnitAlongPath(state, unit, deltaSeconds)) AdvanceQueuedOrder(state, unit);
      break;
    case "retreat":
      if (MoveUnitAlongPath(state, unit, deltaSeconds)) {
        unit.path = [];
        unit.queue = [];
        unit.order = unit.retreatingForMorale ? { type: "recover" } : { type: "idle" };
      }
      break;
    case "recover":
      unit.path = [];
      break;
    case "attackMove": {
      const target = GetAttackTarget(state, unit, unitDefinitions[unit.type].range + 80);
      if (target) UpdateAttack(state, unit, deltaSeconds);
      else {
        const destination = { x: unit.order.x, y: unit.order.y };
        if (!unit.path.length || Distance(unit.path.at(-1), destination) > worldConfig.tileSize * 1.6) {
          unit.path = FindPath(state, unit.x, unit.y, destination.x, destination.y);
        }
        if (MoveUnitAlongPath(state, unit, deltaSeconds)) AdvanceQueuedOrder(state, unit);
      }
      break;
    }
    case "gather":
      UpdateGathering(state, unit, deltaSeconds);
      break;
    case "build":
      UpdateBuildingWork(state, unit, deltaSeconds);
      break;
    case "attack":
      UpdateAttack(state, unit, deltaSeconds);
      break;
    case "sabotage":
      UpdateSabotage(state, unit, deltaSeconds);
      break;
    default: {
      if (!["work", "scout"].includes(unit.type) && unit.stance !== "hold") {
        const target = GetAttackTarget(state, unit, unitDefinitions[unit.type].range + (unit.stance === "aggressive" ? 92 : 28));
        if (target) UpdateAttack(state, unit, deltaSeconds);
      }
      break;
    }
  }

  const clinic = GetCompletedBuildings(state, "clinic").find((building) => Distance(building, unit) < 150);
  if (clinic && state.elapsedSeconds - state.lastCombatTime > 5) {
    unit.health = Math.min(unit.maxHealth, unit.health + deltaSeconds * 2.1);
    unit.morale = Math.min(unit.maxMorale, unit.morale + deltaSeconds * 3.2);
  } else if (state.elapsedSeconds - state.lastCombatTime > 9) {
    unit.morale = Math.min(unit.maxMorale, unit.morale + deltaSeconds * 0.55);
  }
}

function ChooseEnemySearchPoint(state, enemy) {
  if (enemy.lastSeenPlayer) return enemy.lastSeenPlayer;
  const contactedVillages = state.villages.filter((village) => village.contacted);
  if (state.phaseIndex === 3 && contactedVillages.length && NextRandom(state) < 0.38) {
    return contactedVillages[Math.floor(NextRandom(state) * contactedVillages.length)];
  }
  const headquarters = GetCompletedBuildings(state, "headquarters")[0];
  if (headquarters?.discoveredByEnemy && state.alert > 82 && NextRandom(state) < 0.38) return headquarters;
  if (enemy.patrolRoute.length) {
    const point = enemy.patrolRoute[enemy.patrolIndex % enemy.patrolRoute.length];
    enemy.patrolIndex = (enemy.patrolIndex + 1) % enemy.patrolRoute.length;
    return point;
  }
  return WorldPoint(28 + Math.floor(NextRandom(state) * 20), 8 + Math.floor(NextRandom(state) * 22));
}

function UpdateEnemyUnit(state, unit, deltaSeconds) {
  unit.attackTimer = Math.max(0, unit.attackTimer - deltaSeconds);
  unit.hitFlash = Math.max(0, unit.hitFlash - deltaSeconds);
  if (!unit.alive) return;
  const definition = unitDefinitions[unit.type];
  const detectionRange = definition.sight * (unit.alert > 0 ? 1.12 : 1);
  const visibleTarget = GetLivingUnits(state, "player")
    .filter((candidate) => {
      const stealth = unitDefinitions[candidate.type]?.stealth || 0;
      const candidateTile = GetTileAtWorld(state, candidate.x, candidate.y);
      const terrainStealth = candidateTile?.terrain === "grove" ? 0.68 : 1;
      return Distance(candidate, unit) <= detectionRange * (1 - stealth * 0.42) * terrainStealth;
    })
    .sort((left, right) => Distance(left, unit) - Distance(right, unit))[0];
  const buildingTarget = state.buildings
    .filter((building) => building.active && building.completed && Distance(building, unit) <= detectionRange * 0.78)
    .sort((left, right) => Distance(left, unit) - Distance(right, unit))[0];
  const target = visibleTarget || buildingTarget;
  if (target) {
    if (buildingTarget && target === buildingTarget) buildingTarget.discoveredByEnemy = true;
    unit.lastSeenPlayer = { x: target.x, y: target.y };
    unit.alert = 12;
    unit.order = { type: "attack", targetId: target.id };
    unit.path = [];
    UpdateAttack(state, unit, deltaSeconds);
  } else if (unit.order.type === "attack") {
    const lostPoint = unit.lastSeenPlayer;
    unit.order = lostPoint ? { type: "search", x: lostPoint.x, y: lostPoint.y } : { type: "idle" };
    unit.path = lostPoint ? FindPath(state, unit.x, unit.y, lostPoint.x, lostPoint.y) : [];
  } else if (["search", "patrol"].includes(unit.order.type)) {
    if (MoveUnitAlongPath(state, unit, deltaSeconds)) {
      unit.lastSeenPlayer = null;
      unit.order = { type: "idle" };
      unit.alert = Math.max(0, unit.alert - 2);
    }
  } else {
    const point = ChooseEnemySearchPoint(state, unit);
    unit.order = { type: state.alert >= 50 ? "search" : "patrol", x: point.x, y: point.y };
    unit.path = FindPath(state, unit.x, unit.y, point.x, point.y);
  }
  unit.alert = Math.max(0, unit.alert - deltaSeconds * 0.18);
}

function SpawnEnemyPatrol(state, site) {
  const difficulty = GetDifficultyDefinition(state.difficultyId);
  const activeEnemyCount = GetLivingUnits(state, "enemy").length;
  const difficultyOffset = state.difficultyId === "story" ? -2 : state.difficultyId === "pressure" ? 2 : 0;
  const baseMaximum = state.phaseIndex === 4 ? 8 : state.phaseIndex === 3 ? 10 : state.phaseIndex === 2 ? 9 : 7;
  const maximumEnemies = Math.max(4, baseMaximum + difficultyOffset);
  if (activeEnemyCount >= maximumEnemies) {
    site.spawnTimer = (24 + NextRandom(state) * 12) / difficulty.enemySpawnRate;
    return;
  }
  const spawnType = state.phaseIndex >= 2 && NextRandom(state) < 0.62 ? "enemySquad" : "enemyPatrol";
  const tileX = Clamp(site.tileX + (NextRandom(state) < 0.5 ? -1 : 1), 0, worldConfig.mapWidth - 1);
  const tileY = Clamp(site.tileY + 1, 0, worldConfig.mapHeight - 1);
  const unit = CreateUnit(state, spawnType, "enemy", tileX, tileY, {
    patrolRoute: [WorldPoint(39, 18), WorldPoint(31, 22), WorldPoint(20, 18)],
  });
  unit.alert = state.alert >= 75 ? 15 : 4;
  site.spawnTimer = (state.phaseIndex === 4 ? 110 : state.phaseIndex === 3 ? 78 : state.alert >= 50 ? 92 : 132)
    / difficulty.enemySpawnRate
    * (0.86 + NextRandom(state) * 0.28);
  AddEvent(state, "据点增派巡逻", "观察哨记录到道路上的新动向。", state.alert >= 75 ? "danger" : "warning");
}

function UpdateEnemySites(state, deltaSeconds) {
  for (const site of state.sites) {
    if (site.sabotaged || site.disabled || site.health <= 0 || site.type !== "garrison") continue;
    site.spawnTimer -= deltaSeconds;
    if (site.spawnTimer <= 0) SpawnEnemyPatrol(state, site);
  }
}

function GetTrainingSpawnTile(state, building) {
  const candidates = [
    [1, 1], [1, 0], [0, 1], [-1, 1], [1, -1], [-1, 0], [0, -1], [-1, -1], [0, 0],
  ];
  const available = candidates
    .map(([offsetX, offsetY]) => ({
      tileX: Clamp(building.tileX + offsetX, 0, worldConfig.mapWidth - 1),
      tileY: Clamp(building.tileY + offsetY, 0, worldConfig.mapHeight - 1),
    }))
    .filter(({ tileX, tileY }) => GetTile(state, tileX, tileY)?.passable);
  if (!available.length) return { tileX: building.tileX, tileY: building.tileY };
  const rallyPoint = building.rallyPoint || building;
  return available.sort((left, right) => (
    Distance(WorldPoint(left.tileX, left.tileY), rallyPoint) - Distance(WorldPoint(right.tileX, right.tileY), rallyPoint)
  ))[0];
}

function UpdateTraining(state, deltaSeconds) {
  for (const building of state.buildings) {
    if (!building.active || !building.completed || !building.queue.length) continue;
    const item = building.queue[0];
    item.remaining -= deltaSeconds;
    if (item.remaining > 0) continue;
    const spawnTile = GetTrainingSpawnTile(state, building);
    const unit = CreateUnit(state, item.unitType, "player", spawnTile.tileX, spawnTile.tileY);
    if (unit.type === "scout" && state.archiveStored) {
      unit.carriesArchive = true;
      state.archiveStored = false;
      AddEvent(state, "交通组接领档案", "密封档案已从工作站取出，可以继续向东南转移。", "success");
    }
    building.queue.shift();
    if (building.rallyPoint) {
      unit.path = FindPath(state, unit.x, unit.y, building.rallyPoint.x, building.rallyPoint.y);
      unit.order = unit.path.length ? { type: "move", ...building.rallyPoint } : { type: "idle" };
    }
    AddEvent(state, `${unitDefinitions[item.unitType].name}完成集结`, "小队已等待新的任务。", "success");
  }
}

function UpdateVillages(state, deltaSeconds) {
  let supportRecoveryRate = 0;
  for (const village of state.villages) {
    const nearbyScout = GetLivingUnits(state, "player").find((unit) => unit.type === "scout" && Distance(unit, village) < 72);
    if (!village.contacted && nearbyScout) {
      village.contacted = true;
      village.protectedCivilians = Math.round(village.population * 0.45);
      state.statistics.villagesContacted += 1;
      state.resources.intel += 16;
      state.resources.support = Clamp(state.resources.support + 4, 0, 100);
      AddEvent(state, `联络${village.name}`, "村哨、交通路线与分散储藏点开始协同。", "success");
    }

    const nearbyEnemies = GetLivingUnits(state, "enemy").filter((enemy) => Distance(enemy, village) < 122);
    if (nearbyEnemies.length) {
      village.lastThreatTime = state.elapsedSeconds;
      village.pressure = Clamp(village.pressure + deltaSeconds * nearbyEnemies.length * 1.4, 0, 100);
      village.safety = Clamp(village.safety - deltaSeconds * nearbyEnemies.length * 0.34, 0, 100);
      if (village.contacted) state.resources.support = Clamp(state.resources.support - deltaSeconds * nearbyEnemies.length * 0.012, 0, 100);
    } else {
      village.pressure = Math.max(0, village.pressure - deltaSeconds * 0.8);
      if (village.contacted && state.buildings.some((building) => building.active && building.completed && building.type === "shelter" && Distance(building, village) < 270)) {
        village.safety = Clamp(village.safety + deltaSeconds * 0.11, 0, 100);
      }
    }
    const shelterCount = state.buildings.filter((building) => building.active && building.completed && building.type === "shelter" && Distance(building, village) < 300).length;
    if (village.contacted) {
      const protectionRatio = Clamp(0.42 + shelterCount * 0.23 + village.safety / 400, 0, 1);
      village.protectedCivilians = Math.round(village.population * protectionRatio);
      if (!nearbyEnemies.length && village.pressure < 18 && village.safety >= 55) {
        supportRecoveryRate += shelterCount > 0 ? 0.012 : 0.006;
      }
    }
  }
  if (supportRecoveryRate > 0 && state.resources.support < 85) {
    state.resources.support = Math.min(85, state.resources.support + deltaSeconds * supportRecoveryRate);
  }
  state.statistics.protectedCivilians = state.villages.reduce((sum, village) => sum + village.protectedCivilians, 0);
}

function UpdateAlert(state, deltaSeconds) {
  state.alertFloor = state.phaseIndex === 3 ? 52 : state.phaseIndex === 4 ? 32 : state.phaseIndex >= 2 ? 22 : state.phaseIndex >= 1 ? 8 : 0;
  if (state.elapsedSeconds - state.lastCombatTime > 8) {
    state.alertDecayTimer += deltaSeconds;
    const decayInterval = state.phaseIndex >= 3 ? 12 : 8;
    if (state.alertDecayTimer >= decayInterval) {
      state.alert = Math.max(state.alertFloor, state.alert - 1);
      state.alertDecayTimer -= decayInterval;
    }
  } else {
    state.alertDecayTimer = 0;
  }
  const completedShelters = GetCompletedBuildings(state, "shelter").length;
  state.resources.concealment = Clamp(88 - state.alert * 0.55 + completedShelters * 6, 0, 100);
}

function UpdateVision(state) {
  state.visible.fill(false);
  const revealers = [
    ...GetLivingUnits(state, "player").map((unit) => ({ x: unit.x, y: unit.y, sight: unitDefinitions[unit.type].sight })),
    ...GetCompletedBuildings(state).map((building) => ({ x: building.x, y: building.y, sight: buildingDefinitions[building.type].sight })),
  ];
  for (const revealer of revealers) {
    const centerX = Math.floor(revealer.x / worldConfig.tileSize);
    const centerY = Math.floor(revealer.y / worldConfig.tileSize);
    const radius = Math.ceil(revealer.sight / worldConfig.tileSize);
    for (let offsetY = -radius; offsetY <= radius; offsetY += 1) {
      for (let offsetX = -radius; offsetX <= radius; offsetX += 1) {
        const tileX = centerX + offsetX;
        const tileY = centerY + offsetY;
        if (!IsInsideMap(tileX, tileY)) continue;
        const point = WorldPoint(tileX, tileY);
        if (Math.hypot(point.x - revealer.x, point.y - revealer.y) <= revealer.sight) {
          const index = TileIndex(tileX, tileY);
          state.visible[index] = true;
          state.explored[index] = true;
        }
      }
    }
  }
  for (const node of state.nodes) {
    const index = TileIndex(node.tileX, node.tileY);
    if (state.visible[index]) node.discovered = true;
  }
  for (const site of state.sites) {
    const index = TileIndex(site.tileX, site.tileY);
    if (state.visible[index]) site.discovered = true;
  }
  const exitIndex = TileIndex(state.exitZone.tileX, state.exitZone.tileY);
  if (state.visible[exitIndex]) state.exitZone.discovered = true;
  for (const enemy of GetLivingUnits(state, "enemy")) {
    const tileX = Clamp(Math.floor(enemy.x / worldConfig.tileSize), 0, worldConfig.mapWidth - 1);
    const tileY = Clamp(Math.floor(enemy.y / worldConfig.tileSize), 0, worldConfig.mapHeight - 1);
    enemy.visibleToPlayer = state.visible[TileIndex(tileX, tileY)];
    if (enemy.visibleToPlayer) {
      enemy.lastKnownX = enemy.x;
      enemy.lastKnownY = enemy.y;
    }
  }
}

export function GetMetric(state, metric) {
  if (metric.startsWith("building:")) {
    const type = metric.split(":")[1];
    return GetCompletedBuildings(state, type).length;
  }
  if (metric.startsWith("unit:")) {
    const type = metric.split(":")[1];
    return GetLivingUnits(state, "player").filter((unit) => unit.type === type).length;
  }
  if (metric === "grain") return Math.round(state.statistics.grainGathered + 112);
  if (metric === "timber") return Math.round(state.statistics.timberGathered + 84);
  if (metric === "materiel") return Math.round(state.resources.materiel);
  if (metric === "intel") return Math.round(state.resources.intel);
  if (metric === "support") return Math.round(state.resources.support);
  if (metric === "villagesContacted") return state.statistics.villagesContacted;
  if (metric === "shelteredVillages") {
    return state.villages.filter((village) => village.contacted && state.buildings.some((building) => (
      building.active && building.completed && building.type === "shelter" && Distance(building, village) < 300
    ))).length;
  }
  if (metric === "sitesSabotaged") return state.statistics.sitesSabotaged;
  if (metric === "safeVillages") return state.villages.filter((village) => village.contacted && village.safety >= 42).length;
  if (metric === "fieldUnits") return GetLivingUnits(state, "player").filter((unit) => ["militia", "guerrilla"].includes(unit.type)).length;
  if (metric === "sweepSeconds") return Math.round(state.sweepSeconds);
  if (metric === "protectedCivilians") return state.statistics.protectedCivilians;
  if (metric === "headquartersAlive") return GetCompletedBuildings(state, "headquarters").length;
  if (metric === "courierReady") return GetLivingUnits(state, "player").some((unit) => unit.type === "scout" && unit.carriesArchive) ? 1 : 0;
  if (metric === "courierEscaped") {
    return GetLivingUnits(state, "player").some((unit) => unit.type === "scout" && unit.carriesArchive && Distance(unit, state.exitZone) <= state.exitZone.radius) ? 1 : 0;
  }
  return 0;
}

export function GetObjectiveStatuses(state) {
  const phase = phaseDefinitions[state.phaseIndex];
  if (!phase) return [];
  return phase.objectives.map((objective) => {
    const value = GetMetric(state, objective.metric);
    const complete = objective.minimum ? value >= objective.target : value >= objective.target;
    return { ...objective, value, complete, ratio: Clamp(value / objective.target, 0, 1) };
  });
}

function PrepareCourier(state) {
  let scout = GetLivingUnits(state, "player").find((unit) => unit.type === "scout");
  if (!scout) {
    const headquarters = GetCompletedBuildings(state, "headquarters")[0];
    if (headquarters) {
      const spawnTile = GetTrainingSpawnTile(state, headquarters);
      scout = CreateUnit(state, "scout", "player", spawnTile.tileX, spawnTile.tileY, { populationExempt: true });
    }
  }
  if (scout) {
    scout.carriesArchive = true;
    state.archiveStored = false;
  }
}

function AdvancePhase(state) {
  if (state.phaseIndex >= phaseDefinitions.length - 1) {
    state.status = "won";
    AddEvent(state, "联络火种得以保存", "局部任务完成；历史进程仍按真实历史发展。", "success");
    return;
  }
  state.phaseIndex += 1;
  state.phaseSeconds = 0;
  state.phaseCompletionDelay = 0;
  state.transitionSerial += 1;
  const phase = phaseDefinitions[state.phaseIndex];
  if (phase.id === "counterSweep") {
    state.alert = Math.max(state.alert, 58);
    state.alertFloor = 52;
    state.sweepSeconds = 0;
  }
  if (phase.id === "withdrawal") {
    PrepareCourier(state);
    state.exitZone.discovered = true;
    state.alert = Clamp(state.alert, 48, 58);
  }
  AddEvent(state, phase.name, phase.briefing, "system");
}

function CheckCampaignProgress(state, deltaSeconds) {
  if (state.status !== "playing") return;
  const statuses = GetObjectiveStatuses(state);
  if (statuses.length && statuses.every((status) => status.complete)) {
    state.phaseCompletionDelay += deltaSeconds;
    if (state.phaseCompletionDelay >= worldConfig.phaseSafetyDelaySeconds) AdvancePhase(state);
  } else {
    state.phaseCompletionDelay = 0;
  }
  if (state.resources.support <= 0 && state.status === "playing") {
    state.status = "lost";
    AddEvent(state, "群众网络无法继续维系", "保护、纪律与公平负担同样是敌后坚持的基础。", "danger");
  }
  if (!GetCompletedBuildings(state, "headquarters").length && state.status === "playing") {
    state.status = "lost";
  }
}

function UpdateTransientObjects(state, deltaSeconds) {
  for (const projectile of state.projectiles) projectile.life -= deltaSeconds;
  for (const effect of state.effects) effect.life -= deltaSeconds;
  state.projectiles = state.projectiles.filter((projectile) => projectile.life > 0);
  state.effects = state.effects.filter((effect) => effect.life > 0);
  for (const building of state.buildings) building.hitFlash = Math.max(0, (building.hitFlash || 0) - deltaSeconds);
}

function EnsureWorkerContinuity(state) {
  if (GetLivingUnits(state, "player").some((unit) => unit.type === "work")) return;
  const workQueued = state.buildings.some((building) => (
    building.active && building.completed && building.queue.some((item) => item.unitType === "work")
  ));
  if (workQueued) return;
  const headquarters = GetCompletedBuildings(state, "headquarters")[0];
  if (!headquarters) return;
  if (state.emergencyWorkRecruited) {
    state.status = "lost";
    AddEvent(state, "基层组织失去行动能力", "应急工作队也已失去联系，本局无法继续组织生产。", "danger");
    return;
  }
  const spawnTile = GetTrainingSpawnTile(state, headquarters);
  CreateUnit(state, "work", "player", spawnTile.tileX, spawnTile.tileY, { populationExempt: true });
  state.emergencyWorkRecruited = true;
  state.resources.support = Clamp(state.resources.support - 6, 0, 100);
  AddEvent(state, "应急工作队接替任务", "工作站只可进行一次紧急补员；请立即转移并恢复生产。", "warning");
}

function EnsureArchiveContinuity(state) {
  if (state.phaseIndex < 4 || !state.archiveStored || state.status !== "playing") return;
  const livingScout = GetLivingUnits(state, "player").find((unit) => unit.type === "scout");
  if (livingScout) {
    livingScout.carriesArchive = true;
    state.archiveStored = false;
    AddEvent(state, "交通组接领档案", "密封档案已完成转交，可以继续向东南转移。", "success");
    return;
  }
  const scoutQueued = state.buildings.some((building) => (
    building.active && building.completed && building.queue.some((item) => item.unitType === "scout")
  ));
  if (scoutQueued) return;
  const headquarters = GetCompletedBuildings(state, "headquarters")[0];
  if (!headquarters) return;
  if (state.archiveReplacementUsed) {
    state.status = "lost";
    AddEvent(state, "档案转移任务中断", "最后的应急交通组失去联系，密封档案无法继续送出。", "danger");
    return;
  }
  const spawnTile = GetTrainingSpawnTile(state, headquarters);
  CreateUnit(state, "scout", "player", spawnTile.tileX, spawnTile.tileY, {
    carriesArchive: true,
    populationExempt: true,
  });
  state.archiveStored = false;
  state.archiveReplacementUsed = true;
  AddEvent(state, "应急交通组接领档案", "工作站完成最后一次紧急接替；请避免正面接触并尽快转移。", "warning");
}

export function AdvanceGame(state, deltaSeconds) {
  if (state.status !== "playing" || state.paused) return state;
  const safeDelta = Clamp(deltaSeconds, 0, 0.12) * Clamp(state.speed, 0.5, 2);
  state.elapsedSeconds += safeDelta;
  state.phaseSeconds += safeDelta;
  if (state.phaseIndex === 3) state.sweepSeconds += safeDelta;

  UpdateTraining(state, safeDelta);
  EnsureWorkerContinuity(state);
  for (const unit of GetLivingUnits(state, "player")) UpdatePlayerUnit(state, unit, safeDelta);
  for (const unit of GetLivingUnits(state, "enemy")) UpdateEnemyUnit(state, unit, safeDelta);
  EnsureArchiveContinuity(state);
  UpdateEnemySites(state, safeDelta);
  UpdateVillages(state, safeDelta);
  UpdateAlert(state, safeDelta);
  UpdateVision(state);
  UpdateTransientObjects(state, safeDelta);
  CheckCampaignProgress(state, safeDelta);

  state.resources.support = Clamp(state.resources.support, 0, 100);
  state.resources.concealment = Clamp(state.resources.concealment, 0, 100);
  state.statistics.supportPeak = Math.max(state.statistics.supportPeak, state.resources.support);
  state.statistics.supportLow = Math.min(state.statistics.supportLow, state.resources.support);
  return state;
}

export function SetRallyPoint(state, buildingId, worldX, worldY) {
  const building = state.buildings.find((candidate) => candidate.id === buildingId && candidate.active);
  if (!building) return { valid: false, reason: "建筑不存在。" };
  if (!IsWorldPointPassable(state, worldX, worldY)) return { valid: false, reason: "集结点不可到达。" };
  building.rallyPoint = { x: worldX, y: worldY };
  return { valid: true };
}

export function GetCampaignScore(state) {
  const safeVillages = state.villages.filter((village) => village.contacted && village.safety >= 42).length;
  const civilianRatio = Clamp(state.statistics.protectedCivilians / state.villages.reduce((sum, village) => sum + village.population, 0), 0, 1);
  const forcePreservation = Clamp(1 - state.statistics.squadsLost / Math.max(4, GetLivingUnits(state, "player").length + state.statistics.squadsLost), 0, 1);
  const networkRatio = Clamp((state.statistics.villagesContacted + safeVillages) / 6, 0, 1);
  const restraint = Clamp(1 - state.statistics.alertsTriggered / 6, 0, 1);
  const components = {
    civilians: { label: "群众安全", value: Math.round(civilianRatio * 100), weight: 0.38 },
    network: { label: "联络保存", value: Math.round(networkRatio * 100), weight: 0.24 },
    forces: { label: "队伍保全", value: Math.round(forcePreservation * 100), weight: 0.22 },
    restraint: { label: "隐蔽纪律", value: Math.round(restraint * 100), weight: 0.16 },
  };
  const total = Math.round(Object.values(components).reduce((sum, component) => sum + component.value * component.weight, 0));
  return {
    total,
    components,
    elapsedSeconds: state.elapsedSeconds,
    status: state.status,
    summary: total >= 85 ? "火种长明" : total >= 68 ? "网络得存" : total >= 50 ? "艰难转移" : "代价沉重",
    nationalOutcomeFixed: true,
    nationalOutcome: "全国抗战的真实进程不因本局改变，中国人民抗日战争于1945年取得最终胜利。",
  };
}

export function SerializeGame(state) {
  return JSON.stringify(state);
}

export function DeserializeGame(serialized) {
  let state;
  try {
    state = JSON.parse(serialized);
  } catch {
    throw new Error("存档无法解析。");
  }
  const check = CheckInvariants(state);
  if (!check.valid) throw new Error(`存档校验失败：${check.errors.join("；")}`);
  return state;
}

export function CheckInvariants(state) {
  const errors = [];
  if (!state || typeof state !== "object") return { valid: false, errors: ["状态不存在"] };
  if (state.gameId !== gameConfig.id) errors.push("游戏标识不匹配");
  if (state.saveVersion !== gameConfig.saveVersion) errors.push("存档版本不匹配");
  if (!Number.isInteger(state.phaseIndex) || state.phaseIndex < 0 || state.phaseIndex >= phaseDefinitions.length) errors.push("章节索引无效");
  if (!difficultyDefinitions[state.difficultyId]) errors.push("难度无效");
  if (!Array.isArray(state.tiles) || state.tiles.length !== worldConfig.mapWidth * worldConfig.mapHeight) errors.push("地图尺寸无效");
  if (!Array.isArray(state.explored) || state.explored.length !== state.tiles.length) errors.push("探索数据无效");
  if (!Array.isArray(state.visible) || state.visible.length !== state.tiles.length) errors.push("视野数据无效");
  for (const key of ["grain", "timber", "materiel", "intel", "support", "concealment"]) {
    if (!Number.isFinite(state.resources?.[key]) || state.resources[key] < 0) errors.push(`资源${key}无效`);
  }
  if (!Number.isFinite(state.alert) || state.alert < 0 || state.alert > 100) errors.push("警戒值无效");
  if (!Array.isArray(state.units) || !Array.isArray(state.buildings) || !Array.isArray(state.nodes) || !Array.isArray(state.villages) || !Array.isArray(state.sites)) errors.push("实体集合无效");
  const ids = [
    ...(state.units || []).map((item) => item.id),
    ...(state.buildings || []).map((item) => item.id),
    ...(state.nodes || []).map((item) => item.id),
    ...(state.villages || []).map((item) => item.id),
    ...(state.sites || []).map((item) => item.id),
  ];
  if (new Set(ids).size !== ids.length) errors.push("实体标识重复");
  return { valid: errors.length === 0, errors };
}

export function FormatGameTime(seconds) {
  const minutes = Math.floor(seconds / 60);
  const remaining = Math.floor(seconds % 60);
  return `${String(minutes).padStart(2, "0")}:${String(remaining).padStart(2, "0")}`;
}

export const rulesInternals = Object.freeze({
  Clamp,
  Distance,
  TileIndex,
  WorldPoint,
  IsInsideMap,
});
