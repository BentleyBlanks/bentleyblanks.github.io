import {
  CivilianGroupTemplates,
  CreateMissionTiles,
  EnemyTemplates,
  MissionConfig,
  ParseTileKey,
  PlayerUnitTemplates,
  SoilCatalog,
  TerrainCatalog,
  TileKey,
} from "./Data_Level.mjs";

export const LayerIds = Object.freeze({
  SURFACE: "Surface",
  TUNNEL: "Tunnel",
});

export const ActionIds = Object.freeze({
  MOVE: "Move",
  ENTER_TUNNEL: "EnterTunnel",
  EXIT_TUNNEL: "ExitTunnel",
  DIG: "Dig",
  BRACE: "Brace",
  RECON: "Recon",
  DECOY: "Decoy",
  AMBUSH: "Ambush",
  TRAP: "Trap",
  ATTACK: "Attack",
  EVACUATE: "Evacuate",
  CLEAR_SEAL: "ClearSeal",
  END_TURN: "EndTurn",
});

export const EnemyIntentIds = Object.freeze({
  PATROL: "Patrol",
  INVESTIGATE: "Investigate",
  ATTACK: "Attack",
  PREPARE_SEAL: "PrepareSeal",
  RESOLVE_SEAL: "ResolveSeal",
  PREPARE_SMOKE: "PrepareSmoke",
  RESOLVE_SMOKE: "ResolveSmoke",
  SEARCH: "Search",
  STALLED: "Stalled",
});

const neighborOffsets = Object.freeze([
  [1, 0],
  [1, -1],
  [0, -1],
  [-1, 0],
  [-1, 1],
  [0, 1],
]);

const evacuationExitKeys = Object.freeze(["2,1", "0,5"]);

function CreateExitWindowRecord(exitKey) {
  return {
    exitKey,
    checkedTurn: 0,
    checkedUntilTurn: 0,
    signalCount: 0,
  };
}

function EnsureExitWindows(state) {
  state.exitWindows ??= {};
  for (const exitKey of evacuationExitKeys) {
    state.exitWindows[exitKey] ??= CreateExitWindowRecord(exitKey);
  }
  return state.exitWindows;
}

function Clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function Clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function AddLog(state, kind, text, relatedWarningId = null) {
  state.eventLedger.push({
    eventId: `Event${state.eventSerial}`,
    turn: state.turn,
    kind,
    text,
    relatedWarningId,
  });
  state.eventSerial += 1;
  state.log = state.eventLedger.slice(-8);
}

function AddWarning(state, kind, text, targetKey, resolvesTurn) {
  const warningId = `Warning${state.warningSerial}`;
  state.warningSerial += 1;
  state.warnings.push({
    warningId,
    kind,
    text,
    targetKey,
    createdTurn: state.turn,
    resolvesTurn,
    resolved: false,
  });
  AddLog(state, "warning", text, warningId);
  return warningId;
}

export function HexDistance(firstKey, secondKey) {
  const first = ParseTileKey(firstKey);
  const second = ParseTileKey(secondKey);
  const firstS = -first.q - first.r;
  const secondS = -second.q - second.r;
  return Math.max(
    Math.abs(first.q - second.q),
    Math.abs(first.r - second.r),
    Math.abs(firstS - secondS),
  );
}

export function NeighborKeys(tileKey) {
  const { q, r } = ParseTileKey(tileKey);
  return neighborOffsets.map(([dq, dr]) => TileKey(q + dq, r + dr));
}

function GetTile(state, tileKey) {
  return state.tiles[tileKey] ?? null;
}

function GetUnit(state, unitId) {
  return state.units.find((unit) => unit.unitId === unitId) ?? null;
}

function GetEnemy(state, enemyId) {
  return state.enemies.find((enemy) => enemy.enemyId === enemyId) ?? null;
}

function IsAlive(actor) {
  return actor && actor.health > 0;
}

function SurveyStepCost(state, tileKey, mode) {
  const tile = state.tiles[tileKey];
  const soil = SoilCatalog[tile.soilId];
  const instabilityPenalty = soil.stability === 1 ? 8 : 0;
  const knownEntrancePenalty = tile.entranceKnownByEnemy ? 24 : 0;
  if (mode === "Quiet") {
    return soil.noise * 10 + soil.digCost * 2 + instabilityPenalty + knownEntrancePenalty;
  }
  return soil.digCost * 10 + soil.noise + instabilityPenalty + knownEntrancePenalty;
}

function FindSurveyPath(state, exitKey, mode) {
  const startKey = "6,2";
  const costs = new Map([[startKey, 0]]);
  const previous = new Map([[startKey, null]]);
  const open = [startKey];
  while (open.length) {
    open.sort((first, second) => (
      costs.get(first) - costs.get(second)
      || first.localeCompare(second)
    ));
    const currentKey = open.shift();
    if (currentKey === exitKey) {
      break;
    }
    for (const neighborKey of NeighborKeys(currentKey)) {
      if (!state.tiles[neighborKey]) {
        continue;
      }
      const nextCost = costs.get(currentKey) + SurveyStepCost(state, neighborKey, mode);
      if (nextCost >= (costs.get(neighborKey) ?? Infinity)) {
        continue;
      }
      costs.set(neighborKey, nextCost);
      previous.set(neighborKey, currentKey);
      open.push(neighborKey);
    }
  }
  if (!previous.has(exitKey)) {
    return [];
  }
  const path = [];
  for (let cursor = exitKey; cursor !== null; cursor = previous.get(cursor)) {
    path.unshift(cursor);
  }
  return path;
}

function SummarizeSurveyPath(state, path) {
  return path.slice(1).reduce((summary, tileKey) => {
    if (state.tunnels[tileKey]) {
      return summary;
    }
    const tile = state.tiles[tileKey];
    const soil = SoilCatalog[tile.soilId];
    summary.tools += soil.digCost;
    summary.noise += soil.noise;
    summary.unstable += soil.stability === 1 ? 1 : 0;
    summary.knownEntrances += tile.entranceKnownByEnemy ? 1 : 0;
    return summary;
  }, {
    segments: Math.max(0, path.length - 1),
    tools: 0,
    noise: 0,
    unstable: 0,
    knownEntrances: 0,
  });
}

export function GetRouteSurvey(state, exitKey) {
  if (!evacuationExitKeys.includes(exitKey) || !state.tiles[exitKey]) {
    return null;
  }
  const fastPath = FindSurveyPath(state, exitKey, "Fast");
  const quietPath = FindSurveyPath(state, exitKey, "Quiet");
  const corridorKeys = new Set([...fastPath, ...quietPath]);
  for (const tileKey of [...corridorKeys]) {
    for (const neighborKey of NeighborKeys(tileKey)) {
      if (state.tiles[neighborKey]) {
        corridorKeys.add(neighborKey);
      }
    }
  }
  const threats = state.enemies
    .filter(IsAlive)
    .map((enemy) => ({
      enemyId: enemy.enemyId,
      name: enemy.name,
      distance: HexDistance(enemy.tileKey, exitKey),
    }))
    .sort((first, second) => (
      first.distance - second.distance
      || first.enemyId.localeCompare(second.enemyId)
    ));
  return {
    exitKey,
    exitName: state.tiles[exitKey].name,
    fastPath,
    quietPath,
    fast: SummarizeSurveyPath(state, fastPath),
    quiet: SummarizeSurveyPath(state, quietPath),
    corridorKeys: [...corridorKeys].sort(),
    nearestThreat: threats[0] ?? null,
  };
}

function CreateTunnelNode(tile, options = {}) {
  return {
    tileKey: tile.tileKey,
    stability: options.stability ?? SoilCatalog[tile.soilId].stability,
    maxStability: options.maxStability ?? SoilCatalog[tile.soilId].stability,
    braced: Boolean(options.braced),
    cracked: Boolean(options.cracked),
    collapsed: false,
    sealed: Boolean(options.sealed),
    smoke: 0,
    trap: false,
    trapWarningId: null,
    trapEnemyId: null,
    dugTurn: options.dugTurn ?? 0,
    isOriginal: Boolean(options.isOriginal),
  };
}

function CreateEvidence(evidenceId, kind, tileKey, strength, turn, source = "") {
  return {
    evidenceId,
    kind,
    tileKey,
    strength,
    source,
    createdTurn: turn,
    expiresTurn: turn + 3,
  };
}

export function CreateInitialState(options = {}) {
  const tiles = Object.fromEntries(CreateMissionTiles().map((tile) => [tile.tileKey, tile]));
  const state = {
    version: 1,
    seed: Number(options.seed ?? 19420501),
    turn: 1,
    phase: "Player",
    maxTurns: MissionConfig.maxTurns,
    sweepTurn: MissionConfig.sweepTurn,
    sweepActive: false,
    selectedLayer: LayerIds.SURFACE,
    selectedUnitId: "Scout",
    actionMode: ActionIds.MOVE,
    tools: MissionConfig.startingTools,
    organization: MissionConfig.startingOrganization,
    intel: MissionConfig.startingIntel,
    exposure: MissionConfig.startingExposure,
    peopleSafety: MissionConfig.startingPeopleSafety,
    units: Clone(PlayerUnitTemplates),
    enemies: Clone(EnemyTemplates).map((enemy) => ({
      ...enemy,
      actionPoints: 1,
      routeIndex: 0,
      stunnedUntilTurn: 0,
      intent: null,
      defeated: false,
    })),
    civilians: Clone(CivilianGroupTemplates).map((group) => ({
      ...group,
      status: "Waiting",
      tileKey: "6,2",
      path: [],
      pathIndex: 0,
      exitKey: null,
      delayed: false,
      waitingForSignal: false,
      launchTurn: null,
      launchOrder: null,
      trafficDelays: 0,
      lastTrafficDelayTileKey: null,
      exitArrivalTurn: null,
    })),
    tiles,
    tunnels: {
      "6,2": CreateTunnelNode(tiles["6,2"], {
        stability: 4,
        maxStability: 4,
        braced: true,
        isOriginal: true,
      }),
      "3,2": CreateTunnelNode(tiles["3,2"], {
        stability: 2,
        maxStability: 2,
        isOriginal: true,
      }),
    },
    tunnelEdges: [],
    evidence: [
      CreateEvidence("EvidenceOldCellar", "KnownEntrance", "3,2", 1, 1, "旧菜窖"),
    ],
    enemyMemory: {
      suspectedEntrances: { "3,2": 1 },
      confirmedEntrances: ["3,2"],
      knownEntranceStates: { "3,2": { sealed: false } },
      processedEvidenceIds: ["EvidenceOldCellar"],
      lastKnownSurfaceUnit: null,
    },
    decoys: [],
    exitWindows: Object.fromEntries(
      evacuationExitKeys.map((exitKey) => [exitKey, CreateExitWindowRecord(exitKey)]),
    ),
    warnings: [],
    eventLedger: [],
    log: [],
    eventSerial: 1,
    warningSerial: 1,
    civiliansSafe: 0,
    enemiesDefeated: 0,
    tunnelsDug: 0,
    ambushesTriggered: 0,
    decoysUsed: 0,
    trapsTriggered: 0,
    reconActions: 0,
    planningReconCompleted: false,
    plannedExitKey: null,
    plannedCorridorKeys: [],
    plannedFastPath: [],
    plannedQuietPath: [],
    lastReconTurn: 0,
    reconVisitedTiles: [],
    reconTileTurns: {},
    exitSignalsIssued: 0,
    decoyDiversions: 0,
    usedDecoyIds: [],
    lastEvacuationLaunchTurn: 0,
    civilianLaunchSerial: 1,
    lastTraceTileKey: "6,2",
    routePath: "undecided",
    outcome: null,
    lastFailureCause: null,
  };
  AddLog(state, "info", "第 4 回合转移信号生效，第 5 回合扫荡开始。先选择北枣窖或西南苇井主勘线，再比较快掘与静掘走廊。");
  PlanEnemyTurn(state);
  return state;
}

export function GetTunnelNeighbors(state, tileKey, includeCollapsed = false) {
  if (!state.tunnels[tileKey]) {
    return [];
  }
  return NeighborKeys(tileKey).filter((neighborKey) => {
    const neighbor = state.tunnels[neighborKey];
    if (!neighbor) {
      return false;
    }
    if (!includeCollapsed && neighbor.collapsed) {
      return false;
    }
    return true;
  });
}

export function FindTunnelPath(state, startKey, endKey) {
  if (!state.tunnels[startKey] || !state.tunnels[endKey]) {
    return [];
  }
  const queue = [startKey];
  const previous = new Map([[startKey, null]]);
  while (queue.length) {
    const currentKey = queue.shift();
    if (currentKey === endKey) {
      const path = [];
      let cursor = currentKey;
      while (cursor !== null) {
        path.unshift(cursor);
        cursor = previous.get(cursor);
      }
      return path;
    }
    for (const neighborKey of GetTunnelNeighbors(state, currentKey)) {
      const node = state.tunnels[neighborKey];
      if (previous.has(neighborKey) || node.collapsed) {
        continue;
      }
      previous.set(neighborKey, currentKey);
      queue.push(neighborKey);
    }
  }
  return [];
}

export function FindEvacuationPaths(state) {
  const output = [];
  for (const exitKey of evacuationExitKeys) {
    const node = state.tunnels[exitKey];
    if (!node || node.collapsed || node.sealed) {
      continue;
    }
    const path = FindTunnelPath(state, "6,2", exitKey);
    if (path.length > 1) {
      output.push({ exitKey, path });
    }
  }
  return output.sort((first, second) => first.path.length - second.path.length);
}

function FindEvacuationPathsFrom(state, startKey) {
  return evacuationExitKeys
    .map((exitKey) => ({
      exitKey,
      path: state.tunnels[exitKey]?.sealed
        ? []
        : FindTunnelPath(state, startKey, exitKey),
    }))
    .filter((entry) => entry.path.length > 1)
    .sort((first, second) => first.path.length - second.path.length);
}

function UnitCanAct(unit) {
  return IsAlive(unit) && unit.actionPoints > 0;
}

function SurfaceOccupied(state, tileKey, excludedUnitId = null) {
  return state.units.some((unit) => (
    unit.unitId !== excludedUnitId
    && IsAlive(unit)
    && unit.layer === LayerIds.SURFACE
    && unit.tileKey === tileKey
  ));
}

function EnemyAt(state, tileKey) {
  return state.enemies.find((enemy) => IsAlive(enemy) && enemy.tileKey === tileKey) ?? null;
}

export function GetMoveTargets(state, unitId) {
  const unit = GetUnit(state, unitId);
  if (!UnitCanAct(unit)) {
    return [];
  }
  if (unit.layer === LayerIds.TUNNEL) {
    return GetTunnelNeighbors(state, unit.tileKey).filter((tileKey) => {
      const node = state.tunnels[tileKey];
      return !node.collapsed;
    });
  }
  return NeighborKeys(unit.tileKey).filter((tileKey) => {
    const tile = GetTile(state, tileKey);
    if (!tile || EnemyAt(state, tileKey) || SurfaceOccupied(state, tileKey, unit.unitId)) {
      return false;
    }
    return TerrainCatalog[tile.terrainId].moveCost <= unit.actionPoints;
  });
}

export function IsSoilKnown(state, tileKey) {
  return Boolean(
    state.tiles[tileKey]?.soilRevealed
    || state.plannedCorridorKeys?.includes(tileKey),
  );
}

export function GetDigTargets(state, unitId) {
  const unit = GetUnit(state, unitId);
  if (!UnitCanAct(unit) || unit.role !== "Digger" || unit.layer !== LayerIds.TUNNEL) {
    return [];
  }
  return NeighborKeys(unit.tileKey).filter((tileKey) => {
    const tile = GetTile(state, tileKey);
    if (!tile) {
      return false;
    }
    const existing = state.tunnels[tileKey];
    if (existing && !existing.collapsed) {
      return false;
    }
    return state.tools >= SoilCatalog[tile.soilId].digCost;
  });
}

export function GetAttackTargets(state, unitId) {
  const unit = GetUnit(state, unitId);
  if (
    !UnitCanAct(unit)
    || unit.layer !== LayerIds.SURFACE
    || unit.attack <= 0
    || (unit.ammo ?? 0) <= 0
  ) {
    return [];
  }
  return state.enemies
    .filter((enemy) => IsAlive(enemy) && HexDistance(unit.tileKey, enemy.tileKey) === 1)
    .map((enemy) => enemy.tileKey);
}

export function GetDecoyTargets(state, unitId) {
  const unit = GetUnit(state, unitId);
  if (
    !UnitCanAct(unit)
    || !["Militia", "Guerrilla"].includes(unit.role)
    || unit.layer !== LayerIds.SURFACE
    || state.organization < 1
  ) {
    return [];
  }
  return Object.keys(state.tiles).filter((tileKey) => (
    HexDistance(unit.tileKey, tileKey) <= 2
    && !EnemyAt(state, tileKey)
  ));
}

function StableSeedRank(seed, targetKey, enemyId) {
  const text = `${seed}|${targetKey}|${enemyId}`;
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function EnemyHasPriorityCommitment(state, enemy) {
  if (
    (enemy.inactiveUntilTurn ?? 0) > state.turn
    || (enemy.stunnedUntilTurn ?? 0) >= state.turn
  ) {
    return true;
  }
  if (state.warnings.some((warning) => (
    !warning.resolved && warning.enemyId === enemy.enemyId
  ))) {
    return true;
  }
  return state.units.some((unit) => (
    IsAlive(unit)
    && unit.layer === LayerIds.SURFACE
    && HexDistance(unit.tileKey, enemy.tileKey) === 1
  ));
}

export function GetDecoyResponder(state, targetKey) {
  if (!state.tiles[targetKey]) {
    return null;
  }
  const candidates = state.enemies
    .filter(IsAlive)
    .filter((enemy) => !EnemyHasPriorityCommitment(state, enemy))
    .map((enemy) => ({
      enemy,
      distance: HexDistance(enemy.tileKey, targetKey),
    }))
    .filter(({ distance }) => distance <= 5)
    .sort((first, second) => (
      first.distance - second.distance
      || (first.enemy.role === "Patrol" ? 0 : 1) - (second.enemy.role === "Patrol" ? 0 : 1)
      || StableSeedRank(state.seed, targetKey, first.enemy.enemyId)
        - StableSeedRank(state.seed, targetKey, second.enemy.enemyId)
      || first.enemy.enemyId.localeCompare(second.enemy.enemyId)
    ));
  if (!candidates.length) {
    return null;
  }
  return {
    enemyId: candidates[0].enemy.enemyId,
    name: candidates[0].enemy.name,
    distance: candidates[0].distance,
  };
}

export function GetEvacuationTargets(state, unitId) {
  const unit = GetUnit(state, unitId);
  if (
    !UnitCanAct(unit)
    || unit.layer !== LayerIds.TUNNEL
    || unit.tileKey !== "6,2"
    || state.turn < MissionConfig.evacuationTurn
    || state.organization < 1
    || state.lastEvacuationLaunchTurn === state.turn
    || !state.civilians.some((group) => group.status === "Waiting")
  ) {
    return [];
  }
  const paths = FindEvacuationPaths(state);
  if (
    state.plannedExitKey
    && !paths.some((entry) => entry.exitKey === state.plannedExitKey)
  ) {
    return [];
  }
  return paths.map((entry) => entry.exitKey);
}

function CompareCivilianLaunchOrder(first, second) {
  return (
    (first.launchOrder ?? Number.MAX_SAFE_INTEGER)
      - (second.launchOrder ?? Number.MAX_SAFE_INTEGER)
    || (first.launchTurn ?? Number.MAX_SAFE_INTEGER)
      - (second.launchTurn ?? Number.MAX_SAFE_INTEGER)
    || first.groupId.localeCompare(second.groupId)
  );
}

function RunCivilianTransitProjection(
  state,
  candidateGroup,
  candidateRoute,
  bracedOverrideKey = null,
) {
  const projectionState = Clone(state);
  if (bracedOverrideKey && projectionState.tunnels[bracedOverrideKey]) {
    projectionState.tunnels[bracedOverrideKey].braced = true;
  }
  projectionState.civilians = projectionState.civilians
    .filter((group) => group.status === "Moving");
  projectionState.civilians.push({
    ...Clone(candidateGroup),
    status: "Moving",
    path: [...candidateRoute.path],
    pathIndex: 0,
    tileKey: candidateRoute.path[0],
    exitKey: candidateRoute.exitKey,
    launchTurn: state.turn,
    launchOrder: state.civilianLaunchSerial
      ?? (Math.max(
        0,
        ...projectionState.civilians.map((group) => group.launchOrder ?? 0),
      ) + 1),
    trafficDelays: 0,
    lastTrafficDelayTileKey: null,
    delayed: false,
    waitingForSignal: false,
    exitArrivalTurn: null,
  });
  const candidateTrace = {
    queueDelayTurns: 0,
    smokeDelayTurns: 0,
    firstBottleneckKey: null,
    firstBottleneckCapacity: null,
    firstBottleneckUsedLoad: null,
    conflictingGroupIds: [],
    blockedKey: null,
    exitBlocked: false,
  };
  const transitTraces = new Map([[candidateGroup.groupId, candidateTrace]]);
  const maxProjectionTurns = Math.max(
    24,
    Object.keys(projectionState.tunnels).length * 3
      + projectionState.civilians.length * 4,
  );
  let readyTurn = null;
  let windowSnapshotAtReady = null;
  for (
    let phaseTurn = state.turn;
    phaseTurn < state.turn + maxProjectionTurns;
    phaseTurn += 1
  ) {
    projectionState.turn = phaseTurn;
    ResolveCracksAndSmoke(projectionState);
    AdvanceCivilians(projectionState, transitTraces);
    const candidate = projectionState.civilians
      .find((group) => group.groupId === candidateGroup.groupId);
    if (candidate.status === "Safe" || candidate.exitArrivalTurn !== null) {
      readyTurn = phaseTurn;
      windowSnapshotAtReady = BuildExitWindowSnapshot(
        projectionState,
        candidate.exitKey,
        projectionState.exitWindows?.[candidate.exitKey]
          ?? CreateExitWindowRecord(candidate.exitKey),
      );
      break;
    }
    if (candidate.status === "Trapped" || candidateTrace.exitBlocked) {
      break;
    }
  }
  const candidate = projectionState.civilians
    .find((group) => group.groupId === candidateGroup.groupId);
  return {
    readyTurn,
    arrivalPhaseTurn: readyTurn,
    projectedExitKey: candidate.exitKey,
    rerouted: candidate.exitKey !== candidateRoute.exitKey,
    windowSnapshotAtReady,
    queueDelayTurns: candidateTrace.queueDelayTurns,
    smokeDelayTurns: candidateTrace.smokeDelayTurns,
    bottleneckKey: candidateTrace.firstBottleneckKey,
    bottleneckCapacity: candidateTrace.firstBottleneckCapacity,
    bottleneckUsedLoad: candidateTrace.firstBottleneckUsedLoad,
    conflictingGroupIds: candidateTrace.conflictingGroupIds,
    blockedKey: candidateTrace.blockedKey,
    exitBlocked: candidateTrace.exitBlocked,
  };
}

function BuildOptimisticRemainingSchedule(state, candidateGroupId) {
  const routes = FindEvacuationPaths(state);
  if (!routes.length) {
    return [];
  }
  const candidates = state.civilians
    .map((group, sourceIndex) => ({ group, sourceIndex }))
    .filter(({ group }) => (
      group.status === "Waiting"
      && group.groupId !== candidateGroupId
    ))
    .map(({ group, sourceIndex }) => {
      const moveSteps = Math.max(1, group.moveSteps ?? 2);
      const bestRoute = routes
        .map((route) => ({
          exitKey: route.exitKey,
          routeSegments: Math.max(0, route.path.length - 1),
        }))
        .sort((first, second) => (
          first.routeSegments - second.routeSegments
          || first.exitKey.localeCompare(second.exitKey)
        ))[0];
      const transitTurns = Math.floor(bestRoute.routeSegments / moveSteps);
      return {
        groupId: group.groupId,
        exitKey: bestRoute.exitKey,
        routeSegments: bestRoute.routeSegments,
        moveSteps,
        latestLaunchTurn: state.maxTurns - transitTurns,
        sourceIndex,
      };
    })
    .sort((first, second) => (
      first.latestLaunchTurn - second.latestLaunchTurn
      || first.sourceIndex - second.sourceIndex
      || first.groupId.localeCompare(second.groupId)
    ));
  return candidates.map((entry, index) => {
    const earliestLaunchTurn = state.turn + 1 + index;
    const earliestReadyTurn = earliestLaunchTurn
      + Math.floor(entry.routeSegments / entry.moveSteps);
    return {
      groupId: entry.groupId,
      exitKey: entry.exitKey,
      routeSegments: entry.routeSegments,
      moveSteps: entry.moveSteps,
      earliestLaunchTurn,
      earliestReadyTurn,
      deadlineSlack: state.maxTurns - earliestReadyTurn,
    };
  });
}

export function GetCivilianTransitEstimate(state, groupId, exitKey) {
  const group = state.civilians.find((entry) => entry.groupId === groupId);
  const route = FindEvacuationPaths(state).find((entry) => entry.exitKey === exitKey);
  if (!group || group.status !== "Waiting" || !route) {
    return null;
  }
  const routeSegments = Math.max(0, route.path.length - 1);
  const moveSteps = Math.max(1, group.moveSteps ?? 2);
  const soloReadyTurn = state.turn + Math.floor(routeSegments / moveSteps);
  const projection = RunCivilianTransitProjection(state, group, route);
  const projectedExitKey = projection.projectedExitKey ?? exitKey;
  const windowState = projection.windowSnapshotAtReady
    ?? BuildExitWindowSnapshot(
      state,
      projectedExitKey,
      state.exitWindows?.[projectedExitKey] ?? CreateExitWindowRecord(projectedExitKey),
    );
  const signalCovered = (
    projection.arrivalPhaseTurn !== null
    && windowState.status === "Clear"
    && windowState.checkedUntilTurn >= projection.arrivalPhaseTurn
  );
  const signalBlocked = ["Watched", "Sealing", "Smoking"].includes(windowState.status);
  const signalCoverage = signalCovered
    ? "Covered"
    : signalBlocked
      ? "MissingOrBlocked"
      : windowState.signalCount > 0
      && projection.arrivalPhaseTurn !== null
      && windowState.checkedUntilTurn < projection.arrivalPhaseTurn
        ? "ExpiresBefore"
        : "MissingOrBlocked";
  const queueOrder = state.civilianLaunchSerial
    ?? (Math.max(
      0,
      ...state.civilians.map((entry) => entry.launchOrder ?? 0),
    ) + 1);
  const readyTurn = projection.readyTurn;
  const deadlineSlack = readyTurn === null ? null : state.maxTurns - readyTurn;
  const bracedProjection = projection.bottleneckKey === null
    ? null
    : RunCivilianTransitProjection(state, group, route, projection.bottleneckKey);
  const firstBottleneckBraceRelief = !bracedProjection
    ? "None"
    : (
      (
        readyTurn !== null
        && bracedProjection.readyTurn !== null
        && bracedProjection.readyTurn < readyTurn
      )
      || bracedProjection.queueDelayTurns < projection.queueDelayTurns
    )
      ? "Helps"
      : "Insufficient";
  const remainingSchedule = BuildOptimisticRemainingSchedule(state, groupId);
  const strandedGroupIds = remainingSchedule
    .filter((entry) => entry.deadlineSlack < 0)
    .map((entry) => entry.groupId);
  return {
    groupId,
    exitKey,
    projectedExitKey,
    rerouted: projection.rerouted,
    queueOrder,
    routeSegments,
    moveSteps,
    trafficLoad: group.trafficLoad ?? 1,
    soloReadyTurn,
    readyTurn,
    congestionTurns: projection.queueDelayTurns,
    etaDelayTurns: readyTurn === null
      ? null
      : Math.max(0, readyTurn - soloReadyTurn),
    queueDelayTurns: projection.queueDelayTurns,
    smokeDelayTurns: projection.smokeDelayTurns,
    bottleneckKey: projection.bottleneckKey,
    bottleneckCapacity: projection.bottleneckCapacity,
    bottleneckUsedLoad: projection.bottleneckUsedLoad,
    conflictingGroupIds: projection.conflictingGroupIds,
    firstBottleneckBraceRelief,
    signalCovered,
    signalCoverage,
    signalRefreshTurn: projection.arrivalPhaseTurn,
    signalStatusAtReady: windowState.status,
    signalDetailAtReady: windowState.detail,
    deadlineSlack,
    deadlineRisk: (
      readyTurn === null
      || readyTurn > state.maxTurns
    ),
    remainingSchedule,
    remainingScheduleRisk: strandedGroupIds.length > 0,
    strandedGroupIds,
    remainingScheduleAssumption: "按当前已通路线；假设下一批发车前不再开路或抢通，且不计敌军、拥堵与其他新风险",
    blockedKey: projection.blockedKey,
    exitBlocked: projection.exitBlocked,
    assumptions: "已计当前烟流、封口与已知反制；未计后续新增敌情、烟流、封口、塌方或玩家改道",
  };
}

export function GetReconTargets(state, unitId) {
  const unit = GetUnit(state, unitId);
  if (
    !UnitCanAct(unit)
    || unit.role !== "Scout"
    || unit.layer !== LayerIds.SURFACE
    || state.lastReconTurn === state.turn
  ) {
    return [];
  }
  const repeatRecon = state.reconActions > 0;
  if (repeatRecon && state.organization < 1) {
    return [];
  }
  if (
    repeatRecon
    && (state.reconTileTurns?.[unit.tileKey] ?? -Infinity) >= state.turn - 1
  ) {
    return [];
  }
  if (state.tunnelsDug === 0 && !state.planningReconCompleted) {
    return [...evacuationExitKeys];
  }
  return [unit.tileKey];
}

export function GetActionTargets(state, unitId, actionId) {
  switch (actionId) {
    case ActionIds.MOVE:
      return GetMoveTargets(state, unitId);
    case ActionIds.DIG:
      return GetDigTargets(state, unitId);
    case ActionIds.ATTACK:
      return GetAttackTargets(state, unitId);
    case ActionIds.DECOY:
      return GetDecoyTargets(state, unitId);
    case ActionIds.EVACUATE:
      return GetEvacuationTargets(state, unitId);
    case ActionIds.RECON:
      return GetReconTargets(state, unitId);
    default:
      return [];
  }
}

export function GetAvailableActions(state, unitId) {
  const unit = GetUnit(state, unitId);
  if (!UnitCanAct(unit) || state.phase !== "Player" || state.outcome) {
    return [];
  }
  const actions = [];
  if (GetMoveTargets(state, unitId).length) {
    actions.push(ActionIds.MOVE);
  }
  const tile = GetTile(state, unit.tileKey);
  const tunnel = state.tunnels[unit.tileKey];
  if (unit.layer === LayerIds.SURFACE && tile?.hasEntrance && tunnel && !tunnel.sealed) {
    actions.push(ActionIds.ENTER_TUNNEL);
  }
  if (unit.layer === LayerIds.TUNNEL && tile?.hasEntrance && tunnel && !tunnel.sealed) {
    actions.push(ActionIds.EXIT_TUNNEL);
  }
  if (GetDigTargets(state, unitId).length) {
    actions.push(ActionIds.DIG);
  }
  if (
    unit.role === "Digger"
    && unit.layer === LayerIds.TUNNEL
    && tunnel
    && !tunnel.braced
    && state.tools >= 1
  ) {
    actions.push(ActionIds.BRACE);
  }
  if (GetReconTargets(state, unitId).length) {
    actions.push(ActionIds.RECON);
  }
  if (GetDecoyTargets(state, unitId).length) {
    actions.push(ActionIds.DECOY);
  }
  if (
    ["Militia", "Guerrilla"].includes(unit.role)
    && unit.layer === LayerIds.TUNNEL
    && tile?.hasEntrance
    && !unit.ambushPrepared
    && !tunnel?.trap
    && (unit.ammo ?? 0) > 0
  ) {
    actions.push(ActionIds.AMBUSH);
  }
  if (
    unit.role === "Militia"
    && unit.layer === LayerIds.TUNNEL
    && tile?.hasEntrance
    && !tunnel.trap
    && !unit.ambushPrepared
    && state.tools >= 1
  ) {
    actions.push(ActionIds.TRAP);
  }
  if (GetAttackTargets(state, unitId).length) {
    actions.push(ActionIds.ATTACK);
  }
  if (GetEvacuationTargets(state, unitId).length) {
    actions.push(ActionIds.EVACUATE);
  }
  if (
    unit.role === "Digger"
    && unit.layer === LayerIds.TUNNEL
    && tunnel?.sealed
    && state.tools >= 2
  ) {
    actions.push(ActionIds.CLEAR_SEAL);
  }
  return actions;
}

function SpendAction(unit, amount = 1) {
  unit.actionPoints = Math.max(0, unit.actionPoints - amount);
}

function RevealAround(state, centerKey, radius) {
  let newlyRevealed = 0;
  for (const tile of Object.values(state.tiles)) {
    if (HexDistance(centerKey, tile.tileKey) <= radius && !tile.soilRevealed) {
      tile.soilRevealed = true;
      newlyRevealed += 1;
    }
  }
  return newlyRevealed;
}

function AddEvidence(state, kind, tileKey, strength, source) {
  const evidence = CreateEvidence(
    `Evidence${state.eventSerial}`,
    kind,
    tileKey,
    strength,
    state.turn,
    source,
  );
  state.evidence.push(evidence);
  return evidence;
}

function CancelEnemyWarnings(state, enemyId, reasonText) {
  for (const warning of state.warnings) {
    if (!warning.resolved && warning.enemyId === enemyId) {
      warning.resolved = true;
      warning.cancelled = true;
      ReleaseEntranceDefenseReservation(state, warning.warningId);
      AddLog(state, "good", `${reasonText}；“${warning.text}”已取消。`, warning.warningId);
    }
  }
}

function ApplyMove(state, unit, targetKey) {
  if (!GetMoveTargets(state, unit.unitId).includes(targetKey)) {
    return { ok: false, reason: "目标不可达" };
  }
  const cost = unit.layer === LayerIds.SURFACE
    ? TerrainCatalog[state.tiles[targetKey].terrainId].moveCost
    : 1;
  if (unit.ambushPrepared) {
    unit.ambushPrepared = false;
    unit.ambushTileKey = null;
    unit.ambushWarningId = null;
    unit.ambushEnemyId = null;
    AddLog(state, "info", `${unit.shortName}离开预设洞口，伏击取消；已预留弹药不返还。`);
  }
  unit.tileKey = targetKey;
  SpendAction(unit, cost);
  if (unit.layer === LayerIds.TUNNEL) {
    state.exposure = Clamp(state.exposure + 1, 0, 100);
    const node = state.tunnels[targetKey];
    if (node.smoke > 0) {
      unit.health = Math.max(1, unit.health - 1);
      AddLog(state, "danger", `${unit.shortName}穿过烟段，行动受损。`);
    }
  } else {
    const tile = state.tiles[targetKey];
    const nearbyEnemy = state.enemies.some((enemy) => (
      IsAlive(enemy)
      && enemy.stunnedUntilTurn < state.turn
      && HexDistance(enemy.tileKey, targetKey) <= enemy.vision - TerrainCatalog[tile.terrainId].cover
    ));
    if (nearbyEnemy) {
      state.exposure = Clamp(state.exposure + 6, 0, 100);
      state.enemyMemory.lastKnownSurfaceUnit = targetKey;
      AddEvidence(state, "SurfaceSighting", targetKey, 0.7, unit.shortName);
      state.lastTraceTileKey = targetKey;
      AddLog(state, "warning", `${unit.shortName}进入敌军视线，暴露上升。`);
    }
  }
  return { ok: true };
}

function ApplyEnterTunnel(state, unit) {
  const tile = GetTile(state, unit.tileKey);
  const node = state.tunnels[unit.tileKey];
  if (unit.layer !== LayerIds.SURFACE || !tile?.hasEntrance || !node || node.sealed) {
    return { ok: false, reason: "这里没有可用洞口" };
  }
  unit.layer = LayerIds.TUNNEL;
  unit.emergedTurn = null;
  SpendAction(unit);
  state.exposure = Clamp(state.exposure + 2, 0, 100);
  state.lastTraceTileKey = unit.tileKey;
  AddLog(state, "info", `${unit.shortName}转入地下。`);
  return { ok: true };
}

function ApplyExitTunnel(state, unit) {
  const tile = GetTile(state, unit.tileKey);
  const node = state.tunnels[unit.tileKey];
  if (
    unit.layer !== LayerIds.TUNNEL
    || !tile?.hasEntrance
    || !node
    || node.sealed
    || SurfaceOccupied(state, unit.tileKey, unit.unitId)
    || EnemyAt(state, unit.tileKey)
  ) {
    return { ok: false, reason: "洞口被封锁或地面被占据" };
  }
  unit.layer = LayerIds.SURFACE;
  unit.ambushPrepared = false;
  unit.ambushTileKey = null;
  unit.ambushWarningId = null;
  unit.ambushEnemyId = null;
  unit.emergedTurn = state.turn;
  SpendAction(unit);
  state.exposure = Clamp(state.exposure + (tile.entranceKnownByEnemy ? 5 : 2), 0, 100);
  AddEvidence(state, "FreshTracks", unit.tileKey, 0.45, `${unit.shortName}出洞`);
  state.lastTraceTileKey = unit.tileKey;
  AddLog(state, "info", `${unit.shortName}从${tile.name}出洞。`);
  return { ok: true };
}

function ApplyDig(state, unit, targetKey) {
  if (!GetDigTargets(state, unit.unitId).includes(targetKey)) {
    return { ok: false, reason: "该处不能开挖" };
  }
  const tile = state.tiles[targetKey];
  const soil = SoilCatalog[tile.soilId];
  const knownSoil = tile.soilRevealed;
  state.tools -= soil.digCost;
  SpendAction(unit);
  const node = CreateTunnelNode(tile, {
    cracked: soil.stability === 1,
    dugTurn: state.turn,
  });
  state.tunnels[targetKey] = node;
  const edgeId = [unit.tileKey, targetKey].sort().join("|");
  if (!state.tunnelEdges.includes(edgeId)) {
    state.tunnelEdges.push(edgeId);
  }
  unit.tileKey = targetKey;
  state.lastTraceTileKey = targetKey;
  state.tunnelsDug += 1;
  state.exposure = Clamp(
    state.exposure + soil.noise + (knownSoil ? 0 : 3),
    0,
    100,
  );
  AddEvidence(
    state,
    "DigNoise",
    targetKey,
    Clamp((soil.noise + (knownSoil ? 0 : 3)) / 12, 0.25, 1),
    tile.name,
  );
  if (tile.hasEntrance) {
    AddLog(state, "good", `地道队接通${tile.name}。新出口可用于疏散，也可能被敌军发现。`);
  } else if (node.cracked) {
    AddWarning(
      state,
      "Collapse",
      `${tile.name}下方返沙层已经开裂；下回合前支护，否则占用时会塌。`,
      targetKey,
      state.turn + 1,
    );
  } else {
    AddLog(state, "good", `挖通${tile.name}下方${soil.label}。`);
  }
  for (const group of state.civilians.filter((entry) => (
    entry.status === "Trapped"
    && entry.tileKey === targetKey
  ))) {
    const reroute = FindEvacuationPathsFrom(state, targetKey)[0];
    if (reroute) {
      group.status = "Moving";
      group.path = reroute.path;
      group.pathIndex = 0;
      group.exitKey = reroute.exitKey;
      group.delayed = false;
      group.exitArrivalTurn = null;
      AddLog(state, "good", `${group.name}所在塌方段已抢通，改向${state.tiles[reroute.exitKey].name}。`);
    }
  }
  return { ok: true };
}

function ApplyBrace(state, unit) {
  const node = state.tunnels[unit.tileKey];
  if (
    unit.role !== "Digger"
    || unit.layer !== LayerIds.TUNNEL
    || !node
    || node.braced
    || state.tools < 1
  ) {
    return { ok: false, reason: "当前地段无需或无法支护" };
  }
  state.tools -= 1;
  SpendAction(unit);
  node.braced = true;
  node.cracked = false;
  node.stability = Math.max(node.stability, 3);
  node.maxStability = Math.max(node.maxStability, 3);
  const warning = state.warnings.find((entry) => (
    !entry.resolved
    && entry.kind === "Collapse"
    && entry.targetKey === unit.tileKey
  ));
  if (warning) {
    warning.resolved = true;
    warning.cancelled = true;
  }
  AddLog(
    state,
    "good",
    `${state.tiles[unit.tileKey].name}地下已支护，塌方预警解除。`,
    warning?.warningId ?? null,
  );
  return { ok: true };
}

function ApplyRecon(state, unit, targetKey) {
  const repeatRecon = state.reconActions > 0;
  const planningRecon = state.tunnelsDug === 0 && !state.planningReconCompleted;
  state.reconVisitedTiles ??= [];
  state.reconTileTurns ??= {};
  if (!GetReconTargets(state, unit.unitId).includes(targetKey)) {
    return {
      ok: false,
      reason: planningRecon
        ? "首次侦察必须选择北枣窖或西南苇井作为主勘线出口"
        : "复查只能针对交通员当前所在格；同一格需间隔一回合",
    };
  }
  let revealed = 0;
  let survey = null;
  if (planningRecon) {
    survey = GetRouteSurvey(state, targetKey);
    state.plannedExitKey = targetKey;
    state.plannedCorridorKeys = [...survey.corridorKeys];
    state.plannedFastPath = [...survey.fastPath];
    state.plannedQuietPath = [...survey.quietPath];
    state.planningReconCompleted = true;
    revealed = survey.corridorKeys.length;
  } else {
    revealed = RevealAround(state, unit.tileKey, 2);
  }
  state.intel = Clamp(state.intel + 2, 0, 9);
  if (repeatRecon) {
    state.organization -= 1;
  }
  state.reconActions += 1;
  state.lastReconTurn = state.turn;
  if (!state.reconVisitedTiles.includes(targetKey)) {
    state.reconVisitedTiles.push(targetKey);
  }
  state.reconTileTurns[targetKey] = state.turn;
  state.exposure = Clamp(state.exposure + (repeatRecon ? -5 : 1), 0, 100);
  SpendAction(unit);
  for (const enemy of state.enemies) {
    const coveredByRecon = planningRecon
      ? survey.corridorKeys.includes(enemy.tileKey)
      : HexDistance(unit.tileKey, enemy.tileKey) <= 3;
    if (IsAlive(enemy) && coveredByRecon) {
      enemy.intentRevealed = true;
      enemy.scoutedUntilTurn = state.turn + 1;
    }
  }
  const tile = state.tiles[targetKey];
  let exitWindowLog = null;
  if (!planningRecon && targetKey === unit.tileKey && tile?.kind === "safeExit") {
    const windows = EnsureExitWindows(state);
    const windowRecord = windows[targetKey];
    windowRecord.checkedTurn = state.turn;
    windowRecord.checkedUntilTurn = state.turn + 1;
    windowRecord.signalCount += 1;
    state.exitSignalsIssued = (state.exitSignalsIssued ?? 0) + 1;
    state.intel = Math.max(0, state.intel - 1);
    const windowState = GetExitWindow(state, targetKey);
    exitWindowLog = {
      kind: windowState.status === "Clear" ? "good" : "warning",
      text: windowState.status === "Clear"
        ? `交通员在${tile.name}发出安全信号，有效至 T${windowRecord.checkedUntilTurn}；群众可趁窗口出洞。`
        : `交通员复查${tile.name}：${windowState.detail}。情报有效至 T${windowRecord.checkedUntilTurn}，须先解除占压。`,
    };
  }
  AddLog(
    state,
    "good",
    planningRecon
      ? `交通员完成${survey.exitName}主勘线并标明 ${revealed} 格土层：快掘 ${survey.fast.segments} 段/工具 ${survey.fast.tools}/噪音 ${survey.fast.noise}，静掘 ${survey.quiet.segments} 段/工具 ${survey.quiet.tools}/噪音 ${survey.quiet.noise}；最近威胁为${survey.nearestThreat?.name ?? "无"}（距出口 ${survey.nearestThreat?.distance ?? "-"} 格）。主出口接通前不能改用另一出口发车。`
      : repeatRecon
      ? `交通员消耗 1 点组织复查地表，排除旧痕并标出敌军下一步意图；暴露下降 5。`
      : `交通员查清附近 ${revealed} 格土层，并标出可见敌军下一步意图。`,
  );
  if (exitWindowLog) {
    AddLog(state, exitWindowLog.kind, exitWindowLog.text);
  }
  if (!planningRecon && !state.planningReconCompleted && state.tunnelsDug > 0) {
    AddLog(
      state,
      "warning",
      "本次侦察发生在首次开挖之后，只能提供当前敌情与出口信号，不能补回规划侦察目标。",
    );
  }
  return { ok: true };
}

function ApplyDecoy(state, unit, targetKey) {
  if (!GetDecoyTargets(state, unit.unitId).includes(targetKey)) {
    return { ok: false, reason: "假迹目标超出范围" };
  }
  SpendAction(unit);
  state.organization -= 1;
  const responder = GetDecoyResponder(state, targetKey);
  const decoyId = `Decoy${state.eventSerial}`;
  state.decoys.push({
    decoyId,
    tileKey: targetKey,
    strength: 0.95,
    createdTurn: state.turn,
    expiresTurn: state.turn + 4,
    claimedEnemyId: responder?.enemyId ?? null,
  });
  const evidence = AddEvidence(state, "Decoy", targetKey, 0.95, unit.shortName);
  state.decoys.at(-1).evidenceId = evidence.evidenceId;
  evidence.expiresTurn = state.turn + 4;
  evidence.claimedEnemyId = responder?.enemyId ?? null;
  state.exposure = Clamp(state.exposure - 8, 0, 100);
  state.decoysUsed += 1;
  state.lastTraceTileKey = targetKey;
  AddLog(
    state,
    "good",
    responder
      ? `${unit.shortName}在${state.tiles[targetKey].name}布下假脚印；预计${responder.name}（距 ${responder.distance} 格）会在下次规划时响应。`
      : `${unit.shortName}在${state.tiles[targetKey].name}布下假脚印，但五格内没有可响应敌军，假迹可能自然落空。`,
  );
  return { ok: true };
}

function ApplyAmbush(state, unit) {
  const tile = GetTile(state, unit.tileKey);
  if (
    !["Militia", "Guerrilla"].includes(unit.role)
    || unit.layer !== LayerIds.TUNNEL
    || !tile?.hasEntrance
    || unit.ambushPrepared
    || state.tunnels[unit.tileKey]?.trap
    || (unit.ammo ?? 0) <= 0
  ) {
    return { ok: false, reason: "只能在洞口地下准备伏击" };
  }
  unit.ambushPrepared = true;
  unit.ambushTileKey = unit.tileKey;
  const counterWarning = FindActiveEntranceWarning(state, unit.tileKey);
  unit.ambushWarningId = counterWarning?.warningId ?? null;
  unit.ambushEnemyId = counterWarning?.enemyId ?? null;
  unit.ambushPreparedUntilTurn = state.turn + 2;
  unit.ammo = Math.max(0, (unit.ammo ?? 0) - 1);
  SpendAction(unit);
  AddLog(
    state,
    "good",
    `${unit.shortName}在${tile.name}洞口准备伏击，已预留 1 发弹药；有效至 T${unit.ambushPreparedUntilTurn}，离开洞口会取消${counterWarning ? `；已锁定${GetEnemy(state, counterWarning.enemyId)?.name ?? "预警工兵"}，不会被其他敌军抢先消耗` : ""}。`,
    counterWarning?.warningId ?? null,
  );
  return { ok: true };
}

function ApplyTrap(state, unit) {
  const node = state.tunnels[unit.tileKey];
  const tile = GetTile(state, unit.tileKey);
  if (
    unit.role !== "Militia"
    || unit.layer !== LayerIds.TUNNEL
    || !tile?.hasEntrance
    || !node
    || node.trap
    || unit.ambushPrepared
    || state.tools < 1
  ) {
    return { ok: false, reason: "无法在这里布置洞口陷阱" };
  }
  state.tools -= 1;
  node.trap = true;
  const counterWarning = FindActiveEntranceWarning(state, unit.tileKey);
  node.trapWarningId = counterWarning?.warningId ?? null;
  node.trapEnemyId = counterWarning?.enemyId ?? null;
  SpendAction(unit);
  AddLog(
    state,
    "good",
    `${unit.shortName}在${tile.name}布下一次性洞口陷阱${counterWarning ? `；已锁定${GetEnemy(state, counterWarning.enemyId)?.name ?? "预警工兵"}，不会被其他敌军抢先消耗` : ""}。`,
    counterWarning?.warningId ?? null,
  );
  return { ok: true };
}

function ApplyAttack(state, unit, targetKey) {
  if (!GetAttackTargets(state, unit.unitId).includes(targetKey)) {
    return { ok: false, reason: "没有相邻攻击目标" };
  }
  const enemy = EnemyAt(state, targetKey);
  const emergedBonus = unit.emergedTurn === state.turn ? 1 : 0;
  const damage = Math.max(1, unit.attack + emergedBonus);
  enemy.health = Math.max(0, enemy.health - damage);
  SpendAction(unit);
  unit.ammo = Math.max(0, (unit.ammo ?? 0) - 1);
  state.exposure = Clamp(state.exposure + 14, 0, 100);
  AddEvidence(state, "Gunfire", unit.tileKey, 1, unit.shortName);
  state.lastTraceTileKey = unit.tileKey;
  if (!IsAlive(enemy)) {
    enemy.defeated = true;
    state.enemiesDefeated += 1;
    CancelEnemyWarnings(state, enemy.enemyId, `${enemy.name}已被压制`);
    AddLog(state, "good", `${unit.shortName}压制${enemy.name}，为撤离争取到窗口。`);
  } else {
    unit.health = Math.max(1, unit.health - 1);
    AddLog(
      state,
      "danger",
      `${unit.shortName}打击${enemy.name}造成 ${damage} 点压制，但遭到还击。`,
    );
  }
  return { ok: true };
}

function ApplyEvacuate(state, unit, exitKey, groupId = null) {
  const paths = FindEvacuationPaths(state);
  const route = paths.find((entry) => entry.exitKey === exitKey);
  const group = state.civilians.find((entry) => (
    entry.status === "Waiting"
    && (!groupId || entry.groupId === groupId)
  ));
  if (!group) {
    return { ok: false, reason: "没有待转移群众，或所选群众已经发车" };
  }
  if (!route) {
    return { ok: false, reason: "该出口的地道尚未接通" };
  }
  if (!GetEvacuationTargets(state, unit.unitId).includes(exitKey)) {
    const plannedRouteConnected = !state.plannedExitKey
      || paths.some((entry) => entry.exitKey === state.plannedExitKey);
    if (!plannedRouteConnected) {
      return {
        ok: false,
        reason: `主勘线出口${state.tiles[state.plannedExitKey].name}尚未接通；接通前不能从其他出口发车`,
      };
    }
    return { ok: false, reason: "当前单位、回合或组织条件不允许发车" };
  }
  group.status = "Moving";
  group.path = [...route.path];
  group.pathIndex = 0;
  group.tileKey = route.path[0];
  group.exitKey = exitKey;
  group.launchTurn = state.turn;
  group.launchOrder = state.civilianLaunchSerial ?? 1;
  group.trafficDelays = 0;
  group.lastTrafficDelayTileKey = null;
  group.exitArrivalTurn = null;
  state.civilianLaunchSerial = (state.civilianLaunchSerial ?? 1) + 1;
  state.lastEvacuationLaunchTurn = state.turn;
  state.organization -= 1;
  SpendAction(unit);
  AddLog(
    state,
    "good",
    `${group.name}第 ${group.launchOrder} 批沿${state.tiles[exitKey].name}路线转移：每回合 ${group.moveSteps ?? 2} 段，通行负载 ${group.trafficLoad ?? 1}。`,
  );
  return { ok: true };
}

function ApplyClearSeal(state, unit) {
  const node = state.tunnels[unit.tileKey];
  if (
    unit.role !== "Digger"
    || unit.layer !== LayerIds.TUNNEL
    || !node?.sealed
    || state.tools < 2
  ) {
    return { ok: false, reason: "没有足够工具抢通封口" };
  }
  state.tools -= 2;
  node.sealed = false;
  node.smoke = Math.max(0, node.smoke - 1);
  SpendAction(unit);
  state.exposure = Clamp(state.exposure + 10, 0, 100);
  AddEvidence(state, "BreakSeal", unit.tileKey, 1, unit.shortName);
  state.lastTraceTileKey = unit.tileKey;
  AddLog(state, "warning", `${unit.shortName}从地下抢通${state.tiles[unit.tileKey].name}，但动静会引来再次搜索。`);
  return { ok: true };
}

export function ApplyPlayerAction(inputState, action = {}) {
  const state = Clone(inputState);
  if (state.phase !== "Player" || state.outcome) {
    return { ok: false, state: inputState, reason: "当前不是玩家行动阶段" };
  }
  const actionId = String(action.actionId ?? action.type ?? "");
  const unit = GetUnit(state, action.unitId);
  if (actionId === ActionIds.END_TURN) {
    return { ok: true, state: AdvanceTurn(state) };
  }
  if (!UnitCanAct(unit)) {
    return { ok: false, state: inputState, reason: "单位没有行动点" };
  }
  let result = { ok: false, reason: "未知行动" };
  switch (actionId) {
    case ActionIds.MOVE:
      result = ApplyMove(state, unit, action.targetKey);
      break;
    case ActionIds.ENTER_TUNNEL:
      result = ApplyEnterTunnel(state, unit);
      break;
    case ActionIds.EXIT_TUNNEL:
      result = ApplyExitTunnel(state, unit);
      break;
    case ActionIds.DIG:
      result = ApplyDig(state, unit, action.targetKey);
      break;
    case ActionIds.BRACE:
      result = ApplyBrace(state, unit);
      break;
    case ActionIds.RECON:
      result = ApplyRecon(state, unit, action.targetKey);
      break;
    case ActionIds.DECOY:
      result = ApplyDecoy(state, unit, action.targetKey);
      break;
    case ActionIds.AMBUSH:
      result = ApplyAmbush(state, unit);
      break;
    case ActionIds.TRAP:
      result = ApplyTrap(state, unit);
      break;
    case ActionIds.ATTACK:
      result = ApplyAttack(state, unit, action.targetKey);
      break;
    case ActionIds.EVACUATE:
      result = ApplyEvacuate(state, unit, action.targetKey, action.groupId);
      break;
    case ActionIds.CLEAR_SEAL:
      result = ApplyClearSeal(state, unit);
      break;
    default:
      break;
  }
  if (!result.ok) {
    return { ...result, state: inputState };
  }
  state.outcome = EvaluateMission(state);
  return { ok: true, state, events: state.log };
}

const PathActionIds = new Set([
  ActionIds.MOVE,
  ActionIds.DIG,
]);

function GetPathDecisionStop(beforeState, afterState, unitId, actionId, targetKey) {
  const beforeUnit = GetUnit(beforeState, unitId);
  const afterUnit = GetUnit(afterState, unitId);
  if (actionId === ActionIds.DIG) {
    const tile = beforeState.tiles[targetKey];
    if (!IsSoilKnown(beforeState, targetKey)) {
      return "土层尚未侦明，先停下核对实际消耗与风险";
    }
    const newCollapseWarning = afterState.warnings
      .slice(beforeState.warnings.length)
      .some((warning) => warning.kind === "Collapse" && warning.targetKey === targetKey);
    if (afterState.tunnels[targetKey]?.cracked || newCollapseWarning) {
      return "新挖这一段下回合将开裂，先决定立即支护还是继续冒险";
    }
    if (tile.hasEntrance) {
      return "新段接通地表出口，先核对洞口风险与下一步分工";
    }
  }
  if (actionId === ActionIds.MOVE) {
    if (beforeUnit?.ambushPrepared && !afterUnit?.ambushPrepared) {
      return "离开预设洞口会取消伏击，先重新确认后续调动";
    }
    if (
      beforeUnit?.layer === LayerIds.TUNNEL
      && beforeState.tunnels[targetKey]?.smoke > 0
    ) {
      return "进入烟段并承受烟害，先重新判断后续路线";
    }
    const enteredEnemySight = afterState.evidence
      .slice(beforeState.evidence.length)
      .some((evidence) => evidence.kind === "SurfaceSighting");
    if (enteredEnemySight) {
      return "进入敌军视线并留下新目击证据，先查看暴露与追踪变化";
    }
  }
  return null;
}

function SummarizeActionPath(
  inputState,
  outputState,
  unitId,
  actionId,
  targetKeys,
  decisionStop,
) {
  const inputUnit = GetUnit(inputState, unitId);
  const outputUnit = GetUnit(outputState, unitId);
  return {
    actionId,
    unitId,
    startKey: inputUnit.tileKey,
    targetKey: targetKeys.at(-1),
    targetKeys: [...targetKeys],
    steps: targetKeys.length,
    apCost: inputUnit.actionPoints - outputUnit.actionPoints,
    toolsCost: inputState.tools - outputState.tools,
    exposureDelta: outputState.exposure - inputState.exposure,
    healthLoss: inputUnit.health - outputUnit.health,
    evidenceAdded: outputState.evidence.slice(inputState.evidence.length).map((evidence) => ({
      evidenceId: evidence.evidenceId,
      kind: evidence.kind,
      tileKey: evidence.tileKey,
      strength: evidence.strength,
    })),
    warningsAdded: outputState.warnings.slice(inputState.warnings.length).map((warning) => ({
      warningId: warning.warningId,
      kind: warning.kind,
      targetKey: warning.targetKey,
      resolvesTurn: warning.resolvesTurn,
    })),
    decisionStop,
  };
}

function SimulatePlayerActionPath(inputState, action = {}) {
  const actionId = String(action.actionId ?? action.type ?? "");
  const targetKeys = Array.isArray(action.targetKeys)
    ? action.targetKeys.map(String)
    : [];
  if (!PathActionIds.has(actionId)) {
    return {
      ok: false,
      state: inputState,
      reason: "连续路径只支持同回合移动或开挖",
    };
  }
  if (!targetKeys.length) {
    return { ok: false, state: inputState, reason: "连续路径至少需要一个目标格" };
  }
  const inputUnit = GetUnit(inputState, action.unitId);
  if (!UnitCanAct(inputUnit)) {
    return { ok: false, state: inputState, reason: "单位没有行动点" };
  }
  const visited = new Set([inputUnit.tileKey]);
  let nextState = inputState;
  let decisionStop = null;
  for (let index = 0; index < targetKeys.length; index += 1) {
    const targetKey = targetKeys[index];
    if (visited.has(targetKey)) {
      return { ok: false, state: inputState, reason: "连续路径不能折返或重复经过同一格" };
    }
    const beforeState = nextState;
    const result = ApplyPlayerAction(beforeState, {
      unitId: action.unitId,
      actionId,
      targetKey,
    });
    if (!result.ok) {
      return {
        ok: false,
        state: inputState,
        reason: `第 ${index + 1} 步无法执行：${result.reason ?? "路径失效"}`,
      };
    }
    nextState = result.state;
    visited.add(targetKey);
    decisionStop = GetPathDecisionStop(
      beforeState,
      nextState,
      action.unitId,
      actionId,
      targetKey,
    );
    if (decisionStop && index < targetKeys.length - 1) {
      return {
        ok: false,
        state: inputState,
        reason: `第 ${index + 1} 步必须停下：${decisionStop}`,
      };
    }
  }
  return {
    ok: true,
    state: nextState,
    events: nextState.log,
    plan: SummarizeActionPath(
      inputState,
      nextState,
      action.unitId,
      actionId,
      targetKeys,
      decisionStop,
    ),
  };
}

export function ApplyPlayerActionPath(inputState, action = {}) {
  return SimulatePlayerActionPath(inputState, action);
}

export function GetActionPathPlans(inputState, unitId, actionId, options = {}) {
  if (!PathActionIds.has(actionId)) {
    return [];
  }
  const unit = GetUnit(inputState, unitId);
  if (!UnitCanAct(unit) || inputState.phase !== "Player" || inputState.outcome) {
    return [];
  }
  const candidatesByTarget = new Map();
  const frontier = [{ state: inputState, targetKeys: [], visited: new Set([unit.tileKey]) }];
  while (frontier.length) {
    const current = frontier.shift();
    const targets = GetActionTargets(current.state, unitId, actionId)
      .filter((targetKey) => !current.visited.has(targetKey))
      .sort();
    for (const targetKey of targets) {
      const targetKeys = [...current.targetKeys, targetKey];
      const simulation = SimulatePlayerActionPath(inputState, {
        unitId,
        actionId,
        targetKeys,
      });
      if (!simulation.ok) {
        continue;
      }
      const targetIsPublicForMultiStep = (
        actionId !== ActionIds.DIG
        || targetKeys.length === 1
        || IsSoilKnown(inputState, targetKey)
      );
      if (targetIsPublicForMultiStep) {
        const plans = candidatesByTarget.get(targetKey) ?? [];
        plans.push(simulation.plan);
        candidatesByTarget.set(targetKey, plans);
      }
      const outputUnit = GetUnit(simulation.state, unitId);
      if (
        outputUnit.actionPoints > 0
        && !simulation.state.outcome
        && !simulation.plan.decisionStop
      ) {
        frontier.push({
          state: simulation.state,
          targetKeys,
          visited: new Set([...current.visited, targetKey]),
        });
      }
    }
  }
  const includeAmbiguous = Boolean(options.includeAmbiguous);
  const plans = [];
  for (const candidates of candidatesByTarget.values()) {
    candidates.sort((first, second) => (
      first.steps - second.steps
      || first.targetKeys.join("|").localeCompare(second.targetKeys.join("|"))
    ));
    if (includeAmbiguous) {
      plans.push(...candidates);
      continue;
    }
    const shortest = candidates.filter((candidate) => candidate.steps === candidates[0].steps);
    if (shortest.length === 1) {
      plans.push(shortest[0]);
    }
  }
  return plans.sort((first, second) => (
    first.steps - second.steps
    || first.targetKey.localeCompare(second.targetKey)
    || first.targetKeys.join("|").localeCompare(second.targetKeys.join("|"))
  ));
}

export function CollectEnemyObservations(state) {
  return state.evidence
    .filter((evidence) => evidence.expiresTurn >= state.turn)
    .map((evidence) => ({
      evidenceId: evidence.evidenceId,
      kind: evidence.kind,
      tileKey: evidence.tileKey,
      strength: evidence.strength,
      createdTurn: evidence.createdTurn,
      expiresTurn: evidence.expiresTurn,
      source: evidence.source,
      ...(Object.hasOwn(evidence, "claimedEnemyId")
        ? { claimedEnemyId: evidence.claimedEnemyId }
        : {}),
    }));
}

export function UpdateEnemyBeliefs(memory, observations, turn) {
  const nextMemory = Clone(memory);
  nextMemory.processedEvidenceIds ??= [];
  nextMemory.knownEntranceStates ??= {};
  for (const observation of observations) {
    if (
      observation.expiresTurn < turn
      || nextMemory.processedEvidenceIds.includes(observation.evidenceId)
    ) {
      continue;
    }
    nextMemory.processedEvidenceIds.push(observation.evidenceId);
    if (observation.kind === "KnownEntrance") {
      if (!nextMemory.confirmedEntrances.includes(observation.tileKey)) {
        nextMemory.confirmedEntrances.push(observation.tileKey);
      }
      nextMemory.suspectedEntrances[observation.tileKey] = 1;
      nextMemory.knownEntranceStates[observation.tileKey] ??= { sealed: false };
    } else if (["DigNoise", "FreshTracks", "BreakSeal", "AccumulatedTrace"].includes(observation.kind)) {
      const current = nextMemory.suspectedEntrances[observation.tileKey] ?? 0;
      nextMemory.suspectedEntrances[observation.tileKey] = Clamp(
        current + observation.strength * 0.55,
        0,
        1,
      );
      if (
        observation.kind === "BreakSeal"
        && nextMemory.confirmedEntrances.includes(observation.tileKey)
      ) {
        nextMemory.knownEntranceStates[observation.tileKey] = { sealed: false };
      }
    } else if (observation.kind === "SurfaceSighting") {
      nextMemory.lastKnownSurfaceUnit = observation.tileKey;
    }
  }
  for (const tileKey of Object.keys(nextMemory.suspectedEntrances)) {
    const hasFreshEvidence = observations.some((entry) => entry.tileKey === tileKey);
    if (!hasFreshEvidence && !nextMemory.confirmedEntrances.includes(tileKey)) {
      nextMemory.suspectedEntrances[tileKey] = Math.max(
        0,
        nextMemory.suspectedEntrances[tileKey] - 0.15,
      );
    }
  }
  return nextMemory;
}

function CanEnemyClaimEvidence(state, evidence, enemy) {
  if (evidence.kind !== "Decoy") {
    return true;
  }
  if (state.usedDecoyIds.includes(evidence.evidenceId)) {
    return false;
  }
  return !Object.hasOwn(evidence, "claimedEnemyId")
    || evidence.claimedEnemyId === enemy.enemyId;
}

function ChooseEvidenceTarget(state, enemy, claimedEvidenceIds = new Set()) {
  const activeEvidence = CollectEnemyObservations(state)
    .filter((entry) => entry.kind !== "KnownEntrance")
    .filter((entry) => !claimedEvidenceIds.has(entry.evidenceId))
    .filter((entry) => CanEnemyClaimEvidence(state, entry, enemy))
    .filter((entry) => (
      enemy.role !== "Patrol"
      || [
        "Decoy",
        "FreshTracks",
        "SurfaceSighting",
        "Gunfire",
        ...(Number.isFinite(enemy.digNoiseRange) ? ["DigNoise"] : []),
      ].includes(entry.kind)
    ))
    .filter((entry) => (
      entry.kind !== "DigNoise"
      || ParseTileKey(entry.tileKey).r >= (enemy.digNoiseMinRow ?? -Infinity)
    ))
    .filter((entry) => {
      const hearingRange = entry.kind === "Decoy"
        ? 5
        : entry.kind === "DigNoise" && Number.isFinite(enemy.digNoiseRange)
          ? enemy.digNoiseRange
          : Math.ceil(2 + entry.strength * 3);
      return HexDistance(enemy.tileKey, entry.tileKey) <= hearingRange;
    })
    .sort((first, second) => (
      second.strength - first.strength
      || HexDistance(enemy.tileKey, first.tileKey) - HexDistance(enemy.tileKey, second.tileKey)
      || (state.seed % 2 === 0
        ? first.tileKey.localeCompare(second.tileKey)
        : second.tileKey.localeCompare(first.tileKey))
    ));
  return activeEvidence[0] ?? null;
}

function StepToward(startKey, targetKey, state, occupiedKeys = new Set()) {
  const candidates = NeighborKeys(startKey)
    .filter((tileKey) => state.tiles[tileKey] && !occupiedKeys.has(tileKey))
    .sort((first, second) => (
      HexDistance(first, targetKey) - HexDistance(second, targetKey)
      || first.localeCompare(second)
    ));
  return candidates[0] ?? startKey;
}

function StepTowardRange(startKey, targetKey, state, occupiedKeys, distance = 1) {
  let currentKey = startKey;
  const blockedKeys = new Set(occupiedKeys);
  blockedKeys.delete(startKey);
  for (let step = 0; step < distance; step += 1) {
    const nextKey = StepToward(currentKey, targetKey, state, blockedKeys);
    if (nextKey === currentKey) {
      break;
    }
    currentKey = nextKey;
    if (currentKey === targetKey) {
      break;
    }
  }
  return currentKey;
}

function FindConfirmedEntrancePriority(state, enemy, claimedEvidenceIds = new Set()) {
  const priorityEvidenceByTile = new Map();
  const eligibleEvidence = state.evidence
    .filter((evidence) => evidence.kind !== "KnownEntrance")
    .filter((evidence) => evidence.expiresTurn >= state.turn)
    .filter((evidence) => !claimedEvidenceIds.has(evidence.evidenceId))
    .filter((evidence) => CanEnemyClaimEvidence(state, evidence, enemy))
    .sort((first, second) => (
      Number(second.strength ?? 0) - Number(first.strength ?? 0)
      || Number(first.kind === "Decoy") - Number(second.kind === "Decoy")
      || Number(second.createdTurn ?? 0) - Number(first.createdTurn ?? 0)
      || first.evidenceId.localeCompare(second.evidenceId)
    ));
  for (const evidence of eligibleEvidence) {
    if (!priorityEvidenceByTile.has(evidence.tileKey)) {
      priorityEvidenceByTile.set(evidence.tileKey, evidence);
    }
  }
  return state.enemyMemory.confirmedEntrances
    .filter((tileKey) => state.tiles[tileKey]?.hasEntrance)
    .filter((tileKey) => (
      state.tiles[tileKey].kind !== "emergencyExit"
      || priorityEvidenceByTile.has(tileKey)
    ))
    .map((tileKey) => ({
      tileKey,
      evidence: priorityEvidenceByTile.get(tileKey) ?? null,
    }))
    .sort((first, second) => (
      Number(second.evidence?.strength ?? 0) - Number(first.evidence?.strength ?? 0)
      || HexDistance(enemy.tileKey, first.tileKey)
        - HexDistance(enemy.tileKey, second.tileKey)
      || first.tileKey.localeCompare(second.tileKey)
    ))[0] ?? null;
}

function ConfirmEntrance(state, enemy, tileKey) {
  const tile = state.tiles[tileKey];
  if (!tile?.hasEntrance || HexDistance(enemy.tileKey, tileKey) > enemy.vision) {
    return false;
  }
  const firstConfirmation = !state.enemyMemory.confirmedEntrances.includes(tileKey);
  if (firstConfirmation) {
    state.enemyMemory.confirmedEntrances.push(tileKey);
  }
  state.enemyMemory.knownEntranceStates[tileKey] = {
    sealed: Boolean(state.enemyMemory.knownEntranceStates[tileKey]?.sealed),
  };
  tile.entranceKnownByEnemy = true;
  if (firstConfirmation) {
    AddLog(state, "warning", `${enemy.name}在近距离搜索中确认了${tile.name}洞口。`);
  }
  return firstConfirmation;
}

export function PlanEnemyTurn(state) {
  const observations = CollectEnemyObservations(state);
  state.enemyMemory = UpdateEnemyBeliefs(state.enemyMemory, observations, state.turn);
  const occupiedKeys = new Set(
    state.enemies.filter(IsAlive).map((enemy) => enemy.tileKey),
  );
  const claimedEvidenceIds = new Set();
  for (const enemy of state.enemies) {
    const coveredByRouteIntel = Boolean(
      state.plannedCorridorKeys?.includes(enemy.tileKey)
      && state.intel > 0
    );
    enemy.intentRevealed = (enemy.scoutedUntilTurn ?? 0) >= state.turn
      || HexDistance("6,2", enemy.tileKey) <= 2
      || coveredByRouteIntel;
    if (!IsAlive(enemy)) {
      enemy.intent = null;
      continue;
    }
    if ((enemy.inactiveUntilTurn ?? 0) > state.turn) {
      enemy.intent = {
        intentId: EnemyIntentIds.STALLED,
        label: `第 ${enemy.inactiveUntilTurn} 回合随扫荡入场`,
        targetKey: enemy.tileKey,
      };
      continue;
    }
    if (enemy.stunnedUntilTurn >= state.turn) {
      enemy.intent = {
        intentId: EnemyIntentIds.STALLED,
        label: "受压制，本回合停滞",
        targetKey: enemy.tileKey,
      };
      continue;
    }
    const adjacentUnit = state.units.find((unit) => (
      IsAlive(unit)
      && unit.layer === LayerIds.SURFACE
      && HexDistance(unit.tileKey, enemy.tileKey) === 1
    ));
    if (adjacentUnit) {
      enemy.intent = {
        intentId: EnemyIntentIds.ATTACK,
        label: `攻击${adjacentUnit.shortName}`,
        targetKey: adjacentUnit.tileKey,
        unitId: adjacentUnit.unitId,
      };
      continue;
    }
    const existingWarning = state.warnings.find((warning) => (
      !warning.resolved
      && warning.enemyId === enemy.enemyId
      && warning.resolvesTurn <= state.turn
    ));
    if (existingWarning?.kind === "Seal") {
      enemy.intent = {
        intentId: EnemyIntentIds.RESOLVE_SEAL,
        label: `封堵${state.tiles[existingWarning.targetKey].name}`,
        targetKey: existingWarning.targetKey,
        warningId: existingWarning.warningId,
      };
      continue;
    }
    if (existingWarning?.kind === "Smoke") {
      enemy.intent = {
        intentId: EnemyIntentIds.RESOLVE_SMOKE,
        label: `向${state.tiles[existingWarning.targetKey].name}灌烟`,
        targetKey: existingWarning.targetKey,
        warningId: existingWarning.warningId,
      };
      continue;
    }
    const confirmedPriority = FindConfirmedEntrancePriority(
      state,
      enemy,
      claimedEvidenceIds,
    );
    const confirmedTarget = confirmedPriority?.tileKey ?? null;
    const confirmedEvidence = confirmedPriority?.evidence ?? null;
    if (
      enemy.role === "Sapper"
      && confirmedTarget
      && confirmedEvidence?.kind === "Decoy"
    ) {
      claimedEvidenceIds.add(confirmedEvidence.evidenceId);
      enemy.intent = {
        intentId: EnemyIntentIds.INVESTIGATE,
        label: `调查${state.tiles[confirmedTarget].name}的假迹`,
        targetKey: enemy.tileKey === confirmedTarget
          ? confirmedTarget
          : StepTowardRange(
            enemy.tileKey,
            confirmedTarget,
            state,
            occupiedKeys,
            state.sweepActive ? (enemy.sweepMove ?? 1) : 1,
          ),
        evidenceTarget: confirmedTarget,
        evidenceId: confirmedEvidence.evidenceId,
        evidenceKind: confirmedEvidence.kind,
      };
      continue;
    }
    if (
      enemy.role === "Sapper"
      && confirmedTarget
      && HexDistance(enemy.tileKey, confirmedTarget) <= 1
    ) {
      const knownState = state.enemyMemory.knownEntranceStates[confirmedTarget] ?? {
        sealed: false,
      };
      enemy.intent = {
        intentId: knownState.sealed
          ? EnemyIntentIds.PREPARE_SMOKE
          : EnemyIntentIds.PREPARE_SEAL,
        label: knownState.sealed
          ? `预备灌烟：${state.tiles[confirmedTarget].name}`
          : `预备封洞：${state.tiles[confirmedTarget].name}`,
        targetKey: confirmedTarget,
      };
      continue;
    }
    if (enemy.role === "Sapper" && confirmedTarget && state.sweepActive) {
      enemy.intent = {
        intentId: EnemyIntentIds.INVESTIGATE,
        label: `赶往${state.tiles[confirmedTarget].name}实施封锁`,
        targetKey: StepTowardRange(
          enemy.tileKey,
          confirmedTarget,
          state,
          occupiedKeys,
          enemy.sweepMove ?? 1,
        ),
        evidenceTarget: confirmedTarget,
        evidenceKind: "ConfirmedEntrance",
      };
      continue;
    }
    const evidenceTarget = ChooseEvidenceTarget(state, enemy, claimedEvidenceIds);
    if (evidenceTarget) {
      claimedEvidenceIds.add(evidenceTarget.evidenceId);
      enemy.intent = {
        intentId: EnemyIntentIds.INVESTIGATE,
        label: `调查${state.tiles[evidenceTarget.tileKey].name}的痕迹`,
        targetKey: StepTowardRange(
          enemy.tileKey,
          evidenceTarget.tileKey,
          state,
          occupiedKeys,
          enemy.role === "Sapper" && state.sweepActive ? (enemy.sweepMove ?? 1) : 1,
        ),
        evidenceTarget: evidenceTarget.tileKey,
        evidenceId: evidenceTarget.evidenceId,
        evidenceKind: evidenceTarget.kind,
      };
      continue;
    }
    if (state.sweepActive) {
      const sweepTarget = enemy.role === "Sapper" ? "6,2" : "5,2";
      enemy.intent = {
        intentId: EnemyIntentIds.SEARCH,
        label: "沿赵庄外围收紧搜索",
        targetKey: StepTowardRange(
          enemy.tileKey,
          sweepTarget,
          state,
          occupiedKeys,
          enemy.role === "Sapper" ? (enemy.sweepMove ?? 1) : 1,
        ),
      };
      continue;
    }
    const route = enemy.route ?? [enemy.tileKey];
    const nextRouteIndex = (enemy.routeIndex + 1) % route.length;
    enemy.intent = {
      intentId: EnemyIntentIds.PATROL,
      label: "按公开巡逻线移动",
      targetKey: route[nextRouteIndex],
      nextRouteIndex,
    };
  }
  return state.enemies.map((enemy) => Clone(enemy.intent));
}

function FindActiveEntranceWarning(state, targetKey) {
  return state.warnings.find((warning) => (
    !warning.resolved
    && ["Seal", "Smoke"].includes(warning.kind)
    && warning.targetKey === targetKey
    && warning.enemyId
  )) ?? null;
}

function ReleaseEntranceDefenseReservation(state, warningId) {
  for (const node of Object.values(state.tunnels)) {
    if (node.trapWarningId === warningId) {
      node.trapWarningId = null;
      node.trapEnemyId = null;
    }
  }
  for (const unit of state.units) {
    if (unit.ambushWarningId === warningId) {
      unit.ambushWarningId = null;
      unit.ambushEnemyId = null;
    }
  }
}

function BindEntranceDefenseToWarning(state, warning) {
  const node = state.tunnels[warning.targetKey];
  let defenseLabel = null;
  if (node?.trap && !node.trapWarningId) {
    node.trapWarningId = warning.warningId;
    node.trapEnemyId = warning.enemyId;
    defenseLabel = "洞口陷阱";
  }
  const ambusher = state.units.find((unit) => (
    IsAlive(unit)
    && unit.layer === LayerIds.TUNNEL
    && unit.tileKey === warning.targetKey
    && unit.ambushPrepared
    && unit.ambushTileKey === warning.targetKey
  ));
  if (ambusher && !ambusher.ambushWarningId) {
    ambusher.ambushWarningId = warning.warningId;
    ambusher.ambushEnemyId = warning.enemyId;
    defenseLabel = `${ambusher.shortName}的洞口伏击`;
  }
  if (defenseLabel) {
    AddLog(
      state,
      "info",
      `${state.tiles[warning.targetKey].name}的${defenseLabel}已转为预警专用反制，其他敌军不会先行消耗。`,
      warning.warningId,
    );
  }
}

function DefenseAnswersIntent(defenseWarningId, defenseEnemyId, enemy, warningId) {
  if (!defenseWarningId && !defenseEnemyId) {
    return true;
  }
  if (defenseEnemyId !== enemy.enemyId) {
    return false;
  }
  return defenseWarningId === warningId || warningId === null;
}

function TriggerEntranceDefense(state, enemy, targetKey, warningId, actionContext = "entry") {
  const node = state.tunnels[targetKey];
  if (!node) {
    return false;
  }
  if (
    node.trap
    && DefenseAnswersIntent(node.trapWarningId, node.trapEnemyId, enemy, warningId)
  ) {
    const reservedWarningId = node.trapWarningId;
    node.trap = false;
    node.trapWarningId = null;
    node.trapEnemyId = null;
    enemy.health = Math.max(0, enemy.health - 2);
    enemy.stunnedUntilTurn = state.turn + 1;
    state.trapsTriggered += 1;
    if (!IsAlive(enemy)) {
      enemy.defeated = true;
      state.enemiesDefeated += 1;
      CancelEnemyWarnings(state, enemy.enemyId, `${enemy.name}被洞口陷阱压制`);
    }
    AddLog(
      state,
      "good",
      reservedWarningId && actionContext === "attack" && IsAlive(enemy)
        ? `${state.tiles[targetKey].name}洞口陷阱截断了${enemy.name}的本次攻击；原封洞/灌烟预警仍待处理。`
        : `${state.tiles[targetKey].name}洞口陷阱中断了${enemy.name}的行动。`,
      warningId ?? reservedWarningId,
    );
    return true;
  }
  const ambusher = state.units.find((unit) => (
    IsAlive(unit)
    && unit.layer === LayerIds.TUNNEL
    && unit.tileKey === targetKey
    && unit.ambushPrepared
    && unit.ambushTileKey === targetKey
  ));
  if (ambusher) {
    if (!DefenseAnswersIntent(
      ambusher.ambushWarningId,
      ambusher.ambushEnemyId,
      enemy,
      warningId,
    )) {
      return false;
    }
    ambusher.ambushPrepared = false;
    ambusher.ambushTileKey = null;
    ambusher.ambushWarningId = null;
    ambusher.ambushEnemyId = null;
    enemy.health = Math.max(0, enemy.health - Math.max(2, ambusher.attack + 1));
    enemy.stunnedUntilTurn = state.turn + 1;
    state.ambushesTriggered += 1;
    state.exposure = Clamp(state.exposure + 18, 0, 100);
    state.lastTraceTileKey = targetKey;
    AddEvidence(state, "Gunfire", targetKey, 1, `${ambusher.shortName}洞口伏击`);
    const tile = state.tiles[targetKey];
    tile.entranceKnownByEnemy = true;
    if (!state.enemyMemory.confirmedEntrances.includes(targetKey)) {
      state.enemyMemory.confirmedEntrances.push(targetKey);
    }
    state.enemyMemory.knownEntranceStates[targetKey] ??= { sealed: false };
    if (!IsAlive(enemy)) {
      enemy.defeated = true;
      state.enemiesDefeated += 1;
      CancelEnemyWarnings(state, enemy.enemyId, `${enemy.name}被洞口伏击压制`);
    }
    AddLog(
      state,
      "good",
      `${ambusher.shortName}从${state.tiles[targetKey].name}伏击${enemy.name}，预备行动被取消。`,
      warningId,
    );
    return true;
  }
  return false;
}

function ResolveSeal(state, enemy, intent) {
  const node = state.tunnels[intent.targetKey];
  const warning = state.warnings.find((entry) => entry.warningId === intent.warningId);
  if (!node || !warning) {
    return;
  }
  warning.resolved = true;
  if (TriggerEntranceDefense(state, enemy, intent.targetKey, warning.warningId)) {
    return;
  }
  node.sealed = true;
  state.enemyMemory.knownEntranceStates[intent.targetKey] = { sealed: true };
  AddLog(
    state,
    "danger",
    `${state.tiles[intent.targetKey].name}被封堵。地道仍可通行，但不能从这里出地面或通风。`,
    warning.warningId,
  );
}

function ConnectedTunnelComponent(state, startKey) {
  if (!state.tunnels[startKey]) {
    return [];
  }
  const output = [];
  const queue = [startKey];
  const seen = new Set(queue);
  while (queue.length) {
    const currentKey = queue.shift();
    output.push(currentKey);
    for (const neighborKey of GetTunnelNeighbors(state, currentKey)) {
      if (!seen.has(neighborKey)) {
        seen.add(neighborKey);
        queue.push(neighborKey);
      }
    }
  }
  return output;
}

function ResolveSmoke(state, enemy, intent) {
  const node = state.tunnels[intent.targetKey];
  const warning = state.warnings.find((entry) => entry.warningId === intent.warningId);
  if (!node || !warning) {
    return;
  }
  warning.resolved = true;
  if (TriggerEntranceDefense(state, enemy, intent.targetKey, warning.warningId)) {
    return;
  }
  state.enemyMemory.knownEntranceStates[intent.targetKey] = { sealed: true };
  const component = ConnectedTunnelComponent(state, intent.targetKey);
  const openVentCount = component.filter((tileKey) => (
    state.tiles[tileKey]?.hasEntrance
    && !state.tunnels[tileKey].sealed
  )).length;
  const smokeBudget = openVentCount >= 2 ? 1.5 : 3.5;
  const smokeCost = new Map([[intent.targetKey, 0]]);
  const queue = [intent.targetKey];
  while (queue.length) {
    queue.sort((first, second) => smokeCost.get(first) - smokeCost.get(second));
    const currentKey = queue.shift();
    for (const neighborKey of GetTunnelNeighbors(state, currentKey)) {
      const node = state.tunnels[neighborKey];
      const soil = SoilCatalog[state.tiles[neighborKey].soilId];
      const traversalCost = (soil === SoilCatalog.clay ? 2 : 1) + (node.braced ? 1 : 0);
      const nextCost = smokeCost.get(currentKey) + traversalCost;
      if (nextCost <= smokeBudget && nextCost < (smokeCost.get(neighborKey) ?? Infinity)) {
        smokeCost.set(neighborKey, nextCost);
        queue.push(neighborKey);
      }
    }
  }
  const affected = [...smokeCost.keys()];
  for (const tileKey of affected) {
    state.tunnels[tileKey].smoke = Math.max(state.tunnels[tileKey].smoke, 2);
  }
  AddLog(
    state,
    "danger",
    openVentCount >= 2
      ? `敌军向${state.tiles[intent.targetKey].name}灌烟，但第二出口形成通风，只影响近端。`
      : affected.length <= 1
        ? `敌军向${state.tiles[intent.targetKey].name}灌烟，但洞口未接入主网，烟只滞留在入口近端。`
        : `敌军向${state.tiles[intent.targetKey].name}灌烟，单出口网络让烟深入地道。`,
    warning.warningId,
  );
}

function ResolveEnemyIntent(state, enemy) {
  const intent = enemy.intent;
  if (!intent || !IsAlive(enemy)) {
    return;
  }
  switch (intent.intentId) {
    case EnemyIntentIds.ATTACK: {
      const unit = GetUnit(state, intent.unitId);
      if (
        IsAlive(unit)
        && unit.layer === LayerIds.SURFACE
        && HexDistance(enemy.tileKey, unit.tileKey) === 1
      ) {
        if (
          state.tiles[unit.tileKey]?.hasEntrance
          && TriggerEntranceDefense(state, enemy, unit.tileKey, null, "attack")
        ) {
          break;
        }
        unit.health = Math.max(0, unit.health - enemy.attack);
        state.peopleSafety = Math.max(0, state.peopleSafety - 2);
        AddLog(state, "danger", `${enemy.name}攻击${unit.shortName}；地表缠斗正在挤压撤离窗口。`);
      }
      break;
    }
    case EnemyIntentIds.PREPARE_SEAL: {
      const warningId = AddWarning(
        state,
        "Seal",
        `${enemy.name}已确认${state.tiles[intent.targetKey].name}；下回合将封洞。可伏击、设陷或转移。`,
        intent.targetKey,
        state.turn + 1,
      );
      const warning = state.warnings.find((entry) => entry.warningId === warningId);
      warning.enemyId = enemy.enemyId;
      BindEntranceDefenseToWarning(state, warning);
      break;
    }
    case EnemyIntentIds.RESOLVE_SEAL:
      ResolveSeal(state, enemy, intent);
      break;
    case EnemyIntentIds.PREPARE_SMOKE: {
      const warningId = AddWarning(
        state,
        "Smoke",
        `${enemy.name}在${state.tiles[intent.targetKey].name}架设烟炉；下回合灌烟。第二出口、伏击或陷阱可以反制。`,
        intent.targetKey,
        state.turn + 1,
      );
      const warning = state.warnings.find((entry) => entry.warningId === warningId);
      warning.enemyId = enemy.enemyId;
      BindEntranceDefenseToWarning(state, warning);
      break;
    }
    case EnemyIntentIds.RESOLVE_SMOKE:
      ResolveSmoke(state, enemy, intent);
      break;
    case EnemyIntentIds.PATROL:
    case EnemyIntentIds.INVESTIGATE:
    case EnemyIntentIds.SEARCH: {
      const previousTileKey = enemy.tileKey;
      if (
        (!EnemyAt(state, intent.targetKey) || enemy.tileKey === intent.targetKey)
        && !SurfaceOccupied(state, intent.targetKey)
      ) {
        enemy.tileKey = intent.targetKey;
      }
      if (intent.nextRouteIndex !== undefined) {
        enemy.routeIndex = intent.nextRouteIndex;
      }
      if (
        intent.intentId === EnemyIntentIds.SEARCH
        && HexDistance(enemy.tileKey, "6,2") <= enemy.vision
      ) {
        ConfirmEntrance(state, enemy, "6,2");
      }
      if (
        intent.intentId === EnemyIntentIds.INVESTIGATE
        && intent.evidenceKind === "Decoy"
        && intent.evidenceId
        && !state.usedDecoyIds.includes(intent.evidenceId)
      ) {
        state.usedDecoyIds.push(intent.evidenceId);
        state.decoys = state.decoys.filter((decoy) => {
          const decoyEvidenceId = decoy.evidenceId
            ?? decoy.decoyId?.replace(/^Decoy/, "Evidence");
          return decoyEvidenceId !== intent.evidenceId;
        });
        state.decoyDiversions += 1;
        AddLog(
          state,
          "good",
          `${enemy.name}被假迹带离原搜索轴线；搜索组已浪费本回合调查错误方向，但不会继续原地停摆。`,
        );
      }
      if (intent.intentId === EnemyIntentIds.INVESTIGATE && intent.evidenceTarget) {
        const tile = state.tiles[intent.evidenceTarget];
        if (
          tile?.hasEntrance
          && HexDistance(enemy.tileKey, intent.evidenceTarget) <= enemy.vision
        ) {
          ConfirmEntrance(state, enemy, intent.evidenceTarget);
        }
      }
      if (
        enemy.tileKey !== previousTileKey
        && state.tiles[enemy.tileKey]?.hasEntrance
        && TriggerEntranceDefense(state, enemy, enemy.tileKey, null)
      ) {
        enemy.tileKey = previousTileKey;
      }
      break;
    }
    default:
      break;
  }
}

function CollapseTunnelNode(state, tileKey, occupiedByGroup = false) {
  const node = state.tunnels[tileKey];
  if (!node || node.collapsed) {
    return;
  }
  node.collapsed = true;
  const warning = state.warnings.find((entry) => (
    !entry.resolved
    && entry.kind === "Collapse"
    && entry.targetKey === tileKey
  ));
  if (warning) {
    warning.resolved = true;
  }
  state.peopleSafety = Math.max(0, state.peopleSafety - (occupiedByGroup ? 12 : 4));
  state.lastFailureCause = {
    failureId: "UnbracedCollapse",
    warningId: warning?.warningId ?? null,
    text: `${state.tiles[tileKey].name}返沙层未支护，人员经过时塌方。`,
    tip: "侦察土层后绕开返沙层，或让地道队在下回合前支护。",
  };
  for (const group of state.civilians) {
    if (group.status === "Moving" && group.tileKey === tileKey) {
      group.status = "Trapped";
      group.delayed = true;
    }
  }
  AddLog(state, "danger", state.lastFailureCause.text, state.lastFailureCause.warningId);
}

function ResolveCracksAndSmoke(state) {
  for (const [tileKey, node] of Object.entries(state.tunnels)) {
    if (node.collapsed) {
      continue;
    }
    if (node.smoke > 0) {
      node.smoke -= 1;
    }
    if (!node.cracked || node.braced || node.dugTurn >= state.turn) {
      continue;
    }
    const occupiedByUnit = state.units.some((unit) => (
      IsAlive(unit)
      && unit.layer === LayerIds.TUNNEL
      && unit.tileKey === tileKey
    ));
    const occupiedByGroup = state.civilians.some((group) => (
      group.status === "Moving"
      && group.tileKey === tileKey
    ));
    if (occupiedByUnit || occupiedByGroup) {
      CollapseTunnelNode(state, tileKey, occupiedByGroup);
    }
  }
}

function AdvanceCivilians(state, transitTraces = null) {
  const trafficByTile = new Map();
  const trafficGroupsByTile = new Map();
  const movingGroups = state.civilians
    .filter((group) => group.status === "Moving")
    .sort(CompareCivilianLaunchOrder);
  for (const group of movingGroups) {
    const transitTrace = transitTraces?.get(group.groupId) ?? null;
    let steps = Math.max(1, group.moveSteps ?? 2);
    group.delayed = false;
    group.waitingForSignal = false;
    const plannedWindow = GetExitWindow(state, group.exitKey);
    if (["Sealing", "Smoking"].includes(plannedWindow.status)) {
      const alternate = FindEvacuationPathsFrom(state, group.tileKey)
        .find((entry) => entry.exitKey !== group.exitKey);
      if (alternate) {
        const previousExit = group.exitKey;
        group.path = alternate.path;
        group.pathIndex = 0;
        group.exitKey = alternate.exitKey;
        group.delayed = true;
        group.exitArrivalTurn = null;
        AddLog(
          state,
          "good",
          `${group.name}收到${state.tiles[previousExit].name}反制预警，途中立即改走${state.tiles[alternate.exitKey].name}备用支线。`,
        );
      }
    }
    while (steps > 0 && group.status === "Moving") {
      const nextIndex = group.pathIndex + 1;
      if (nextIndex >= group.path.length) {
        const exitNode = state.tunnels[group.exitKey];
        if (!exitNode || exitNode.sealed || exitNode.collapsed) {
          const alternate = FindEvacuationPathsFrom(state, group.tileKey)
            .find((entry) => entry.exitKey !== group.exitKey);
          if (alternate) {
            const previousExit = group.exitKey;
            group.path = alternate.path;
            group.pathIndex = 0;
            group.exitKey = alternate.exitKey;
            group.delayed = true;
            group.exitArrivalTurn = null;
            AddLog(
              state,
              "warning",
              `${group.name}在${state.tiles[previousExit].name}下方遇封口，转向${state.tiles[alternate.exitKey].name}备用支线。`,
            );
            break;
          }
          group.delayed = true;
          if (transitTrace) {
            transitTrace.exitBlocked = true;
            transitTrace.blockedKey ??= group.exitKey;
          }
          AddLog(state, "warning", `${group.name}已到出口下方，但洞口不可用，只能等待改道或抢通。`);
          break;
        }
        const windowState = GetExitWindow(state, group.exitKey);
        if (windowState.status !== "Clear") {
          group.delayed = true;
          group.waitingForSignal = true;
          group.exitArrivalTurn ??= state.turn;
          if (group.lastWindowWaitTurn !== state.turn) {
            group.lastWindowWaitTurn = state.turn;
            AddLog(
              state,
              "warning",
              `${group.name}已到${state.tiles[group.exitKey].name}下方，等待地面安全信号：${windowState.detail}。`,
            );
          }
          break;
        }
        group.status = "Safe";
        group.tileKey = group.exitKey;
        state.civiliansSafe += group.people;
        AddLog(state, "good", `${group.name}从${state.tiles[group.exitKey].name}安全撤出。`);
        break;
      }
      const nextKey = group.path[nextIndex];
      const node = state.tunnels[nextKey];
      if (!node || node.collapsed) {
        const reroute = FindEvacuationPathsFrom(state, group.tileKey)[0];
        if (reroute) {
          group.path = reroute.path;
          group.pathIndex = 0;
          group.exitKey = reroute.exitKey;
          group.exitArrivalTurn = null;
          AddLog(state, "warning", `${group.name}因塌方改走${state.tiles[reroute.exitKey].name}支线。`);
          continue;
        }
        group.status = "Trapped";
        group.delayed = true;
        if (transitTrace) {
          transitTrace.blockedKey ??= nextKey;
        }
        state.peopleSafety = Math.max(0, state.peopleSafety - 8);
        AddLog(state, "danger", `${group.name}前方地道中断，被困在地下。`);
        break;
      }
      const capacity = node.braced ? 3 : 2;
      const trafficLoad = group.trafficLoad ?? 1;
      const usedCapacity = trafficByTile.get(nextKey) ?? 0;
      if (usedCapacity + trafficLoad > capacity) {
        group.delayed = true;
        group.trafficDelays = (group.trafficDelays ?? 0) + 1;
        group.lastTrafficDelayTileKey = nextKey;
        if (transitTrace) {
          transitTrace.queueDelayTurns += 1;
          transitTrace.firstBottleneckKey ??= nextKey;
          transitTrace.firstBottleneckCapacity ??= capacity;
          transitTrace.firstBottleneckUsedLoad ??= usedCapacity;
          if (!transitTrace.conflictingGroupIds.length) {
            transitTrace.conflictingGroupIds = [
              ...(trafficGroupsByTile.get(nextKey) ?? []),
            ];
          }
        }
        AddLog(
          state,
          "warning",
          `${group.name}在${state.tiles[group.tileKey].name}等待：前方容量 ${capacity}，已占 ${usedCapacity}，本批还需 ${trafficLoad}。先发批次优先通行。`,
        );
        break;
      }
      trafficByTile.set(nextKey, usedCapacity + trafficLoad);
      const trafficGroups = trafficGroupsByTile.get(nextKey) ?? [];
      trafficGroups.push(group.groupId);
      trafficGroupsByTile.set(nextKey, trafficGroups);
      group.pathIndex = nextIndex;
      group.tileKey = nextKey;
      if (node.cracked && !node.braced && node.dugTurn < state.turn) {
        CollapseTunnelNode(state, nextKey, true);
        if (transitTrace) {
          transitTrace.blockedKey ??= nextKey;
        }
        break;
      }
      if (node.smoke > 0) {
        group.delayed = true;
        if (transitTrace) {
          transitTrace.smokeDelayTurns += 1;
        }
        state.peopleSafety = Math.max(0, state.peopleSafety - 5);
        AddLog(state, "danger", `${group.name}遇到烟段，本回合停止前进。`);
        break;
      }
      steps -= 1;
    }
  }
}

function ApplyVillagePressure(state) {
  const nearbyEnemies = state.enemies.filter((enemy) => (
    IsAlive(enemy)
    && HexDistance(enemy.tileKey, "6,2") <= 1
  )).length;
  const waitingPeople = state.civilians
    .filter((group) => group.status === "Waiting")
    .reduce((sum, group) => sum + group.people, 0);
  const waitingPressure = state.civilians
    .filter((group) => group.status === "Waiting")
    .reduce((sum, group) => sum + (group.pressureWeight ?? 1), 0);
  if (state.sweepActive && nearbyEnemies > 0 && waitingPeople > 0) {
    const harm = Math.min(8, nearbyEnemies * 2 + Math.ceil(waitingPressure / 2));
    state.peopleSafety = Math.max(0, state.peopleSafety - harm);
    state.lastFailureCause = {
      failureId: "VillageEncircled",
      warningId: null,
      text: `扫荡队逼近赵庄，仍在等待的 ${waitingPeople} 名群众承受封锁压力；家属组的照护负担会放大留村风险。`,
      tip: "最迟在第 4 回合发出首批；可优先转移家属降低留村风险，或由民兵布置假迹把搜索组拉离赵庄。",
    };
    AddLog(state, "danger", state.lastFailureCause.text);
  }
}

function ClassifyRoute(state) {
  if (state.ambushesTriggered > 0) {
    return "ambush";
  }
  if (state.decoyDiversions > 0) {
    return "deception";
  }
  if (state.trapsTriggered > 0) {
    return "ambush";
  }
  if (state.enemiesDefeated > 0) {
    return "interdiction";
  }
  if (state.tunnelsDug > 0 || state.civiliansSafe > 0) {
    return "stealth";
  }
  return "none";
}

function CountSafeCivilians(state) {
  return state.civilians
    .filter((group) => group.status === "Safe")
    .reduce((sum, group) => sum + group.people, 0);
}

function FindAliveUnitByRoles(state, roles) {
  return state.units.find((unit) => IsAlive(unit) && roles.includes(unit.role)) ?? null;
}

function BuildReconMissingTip(state) {
  const scout = GetUnit(state, "Scout");
  if (!IsAlive(scout)) {
    return "交通员已阵亡，本局无法补回开挖前的规划侦察；下一局第 1 回合先保住交通员，并在首次开挖前选择北枣窖或西南苇井完成走廊勘线。";
  }
  return "下一局第 1 回合让交通员执行【侦察】，选择北枣窖或西南苇井比较快掘/静掘走廊，再开始首次开挖。";
}

function DescribeCivilianBatch(group) {
  const order = Number.isInteger(group?.launchOrder)
    ? `第 ${group.launchOrder} 批`
    : "该批";
  const launch = Number.isInteger(group?.launchTurn)
    ? `，T${group.launchTurn} 发车`
    : "";
  return `${order}（${group?.name ?? "群众"}${launch}，${group?.moveSteps ?? 2} 段/回合）`;
}

function BuildExitWindowTip(state, missedWindowGroup) {
  const exitKey = missedWindowGroup.exitKey;
  const scout = GetUnit(state, "Scout");
  const defender = FindAliveUnitByRoles(state, ["Militia", "Guerrilla"]);
  const connectedPaths = FindEvacuationPaths(state);
  const exitName = state.tiles[exitKey]?.name ?? "目标出口";
  const batch = DescribeCivilianBatch(missedWindowGroup);
  const arrivalTurn = missedWindowGroup.exitArrivalTurn ?? Math.max(1, state.turn - 1);
  const alternate = connectedPaths.find((entry) => entry.exitKey !== exitKey);
  const actionActor = defender?.shortName ?? "幸存行动组";
  const decoyStatus = state.decoyDiversions > 0
    ? "假迹已经消耗；"
    : `可先让${actionActor}布置假迹；`;
  const response = alternate
    ? `若窗口受压，让${actionActor}压制、设陷阱或伏击，也可改走已接通的${state.tiles[alternate.exitKey].name}`
    : connectedPaths.length === 1
      ? `当前仅接通${state.tiles[connectedPaths[0].exitKey].name}，不存在可立即改走的备用出口；让${actionActor}在批次到达前一回合压制、设陷阱或伏击`
      : `当前没有从赵庄连通的出口；下一局最迟第 4 回合先接通主线，再让${actionActor}保护窗口`;
  if (!IsAlive(scout)) {
    return `${batch}已于 T${arrivalTurn} 到达${exitName}下方，但交通员已阵亡，本局无法补发安全信号；下一局须保住交通员，并在该批预计到达前一回合完成出口复查。${decoyStatus}${response}。`;
  }
  return `${batch}已于 T${arrivalTurn} 到达${exitName}下方；下一局让交通员在该批预计到达前一回合从${exitName}上浮并复查。${decoyStatus}${response}。`;
}

function BuildIncompleteEvacuationTip(state, waitingGroups, missingPeople) {
  const connectedPaths = FindEvacuationPaths(state);
  const route = connectedPaths[0] ?? null;
  const nextGroup = waitingGroups
    .map((group) => ({
      group,
      latestLaunchTurn: route
        ? state.maxTurns - Math.floor(
          Math.max(0, route.path.length - 1) / Math.max(1, group.moveSteps ?? 2),
        )
        : MissionConfig.evacuationTurn,
    }))
    .sort((first, second) => first.latestLaunchTurn - second.latestLaunchTurn)[0];
  const actor = state.units.find((unit) => (
    IsAlive(unit) && unit.layer === LayerIds.TUNNEL && unit.tileKey === "6,2"
  )) ?? FindAliveUnitByRoles(state, ["Militia", "Guerrilla", "Digger", "Scout"]);
  const timing = nextGroup
    ? `下一局最迟 T${nextGroup.latestLaunchTurn} 由${actor?.shortName ?? "一名地下单位"}在赵庄发出${nextGroup.group.name}`
    : `下一局最迟 T${MissionConfig.evacuationTurn} 由${actor?.shortName ?? "一名地下单位"}在赵庄继续发车`;
  return `还差 ${missingPeople} 人；三批必须全部发车，不能把待命群众留作资源余量。${timing}，并在其到达前复查出口。`;
}

function BuildEvacuationLateTip(state) {
  const waitingGroups = state.civilians.filter((group) => group.status === "Waiting");
  if (waitingGroups.length) {
    const missingPeople = MissionConfig.requiredEvacuees - CountSafeCivilians(state);
    return BuildIncompleteEvacuationTip(state, waitingGroups, missingPeople);
  }
  const lateGroups = state.civilians
    .filter((group) => ["Moving", "Trapped"].includes(group.status))
    .sort((first, second) => (
      (second.launchOrder ?? 0) - (first.launchOrder ?? 0)
      || (first.moveSteps ?? 2) - (second.moveSteps ?? 2)
    ));
  const group = lateGroups[0];
  if (!group) {
    return "三批都必须在 T11 结束前进入安全状态；复盘最后一批的出口信号、封口与拥堵日志。";
  }
  const batch = DescribeCivilianBatch(group);
  const exitName = state.tiles[group.exitKey]?.name ?? "目标出口";
  const exitNode = state.tunnels[group.exitKey];
  const collapsedKey = group.path
    ?.slice(group.pathIndex ?? 0)
    .find((tileKey) => state.tunnels[tileKey]?.collapsed) ?? null;
  if (collapsedKey) {
    return `${batch}被${state.tiles[collapsedKey]?.name ?? collapsedKey}塌方截住；下一局在该批进入前让地道队支护返沙段，或提前接通可改走的备用出口。`;
  }
  if (!exitNode || exitNode.sealed) {
    return `${batch}到达${exitName}时洞口已封闭；下一局在该批抵达前由地道队抢通，或提前接通并保护备用出口。`;
  }
  if ((group.trafficDelays ?? 0) > 0) {
    const delayTileName = state.tiles[group.lastTrafficDelayTileKey]?.name ?? "共用咽喉";
    return `${batch}曾在${delayTileName}因拥堵等待 ${group.trafficDelays} 回合；下一局拉开发车间隔。重载 2 与轻载 1 可支护到容量 3 后并行；两支重载 2+2 仍须错开发车。`;
  }
  const remainingSegments = Math.max(0, (group.path?.length ?? 1) - 1 - (group.pathIndex ?? 0));
  if ((group.moveSteps ?? 2) === 1 && (group.launchOrder ?? 1) > 1) {
    return `${batch}到天亮仍距${exitName} ${remainingSegments} 段；伤员每回合只能走 1 段，末发留不出封锁余量。下一局优先发出伤员，并支护出口咽喉让轻队并行。`;
  }
  return `${batch}到天亮仍距${exitName} ${remainingSegments} 段；下一局按速度倒排发车时点，把慢批提前，并在其到达前一回合复查出口。`;
}

export function EvaluateMission(state) {
  const survivingUnits = state.units.filter(IsAlive).length;
  const safePeople = CountSafeCivilians(state);
  const allGroupsSafe = state.civilians.every((group) => group.status === "Safe");
  const hasUnresolvedLaunchedGroup = state.civilians.some((group) => (
    ["Moving", "Trapped"].includes(group.status)
  ));
  if (state.peopleSafety <= 45) {
    const cause = state.lastFailureCause ?? {
      failureId: "PeopleSafetyCollapsed",
      warningId: null,
      text: "群众安全降到无法继续组织转移的程度。",
      tip: "把敌军预警当作下一回合必须回答的问题，避免让单出口承担全部风险。",
    };
    return {
      status: "Defeat",
      path: ClassifyRoute(state),
      title: "封锁压垮了转移秩序",
      summary: cause.text,
      failureId: cause.failureId,
      tip: cause.tip,
      causeChain: state.eventLedger.slice(-6),
      warningId: cause.warningId,
      peopleSafety: state.peopleSafety,
      survivingUnits,
    };
  }
  if (survivingUnits < 2) {
    return {
      status: "Defeat",
      path: ClassifyRoute(state),
      title: "没有足够的人继续引路",
      summary: "地表硬拼使行动骨干失去行动能力，群众仍被困在封锁圈内。",
      failureId: "CadresLost",
      tip: "战斗只用来打断工兵或争取窗口；利用地形、假迹和洞口伏击减少正面交换。",
      causeChain: state.eventLedger.slice(-6),
      peopleSafety: state.peopleSafety,
      survivingUnits,
    };
  }
  if (
    safePeople === MissionConfig.requiredEvacuees
    && allGroupsSafe
    && state.civiliansSafe === safePeople
    && !hasUnresolvedLaunchedGroup
    && state.tunnelsDug >= 1
    && state.planningReconCompleted
    && state.sweepActive
    && state.turn >= 6
  ) {
    return {
      status: "Victory",
      path: ClassifyRoute(state),
      title: "地道把人送到了天亮以前",
      summary: `已安全转移 ${safePeople}/${MissionConfig.totalEvacuees} 人。`,
      causeChain: state.eventLedger.slice(-6),
      peopleSafety: state.peopleSafety,
      survivingUnits,
    };
  }
  if (state.turn > state.maxTurns) {
    const movingPeople = state.civilians
      .filter((group) => group.status === "Moving")
      .reduce((sum, group) => sum + group.people, 0);
    if (!state.planningReconCompleted && safePeople >= MissionConfig.requiredEvacuees) {
      return {
        status: "Defeat",
        path: ClassifyRoute(state),
        title: "路线通了，敌情却没有查清",
        summary: `虽已转移 ${safePeople}/${MissionConfig.totalEvacuees} 人，但首次开挖前没有选择主出口完成走廊勘线，无法证明路线基于当局敌情。`,
        failureId: "ReconMissing",
        tip: BuildReconMissingTip(state),
        causeChain: state.eventLedger.slice(-6),
        peopleSafety: state.peopleSafety,
        survivingUnits,
      };
    }
    const missedWindowGroup = state.civilians.find((group) => (
      group.status === "Moving" && group.waitingForSignal
    ));
    if (missedWindowGroup) {
      const windowState = GetExitWindow(state, missedWindowGroup.exitKey);
      return {
        status: "Defeat",
        path: ClassifyRoute(state),
        title: "群众到了洞口，地面信号却没接上",
        summary: `${missedWindowGroup.name}停在${state.tiles[missedWindowGroup.exitKey].name}下方；${windowState.detail}。`,
        failureId: "ExitWindowMissed",
        tip: BuildExitWindowTip(state, missedWindowGroup),
        causeChain: state.eventLedger.slice(-6),
        peopleSafety: state.peopleSafety,
        survivingUnits,
        exitKey: missedWindowGroup.exitKey,
        groupId: missedWindowGroup.groupId,
        threatEnemyId: windowState.threatEnemyId,
      };
    }
    const trappedGroup = state.civilians.find((group) => group.status === "Trapped");
    if (trappedGroup && state.lastFailureCause?.failureId === "UnbracedCollapse") {
      return {
        status: "Defeat",
        path: ClassifyRoute(state),
        title: "返沙层切断了撤离纵线",
        summary: state.lastFailureCause.text,
        failureId: state.lastFailureCause.failureId,
        tip: state.lastFailureCause.tip,
        causeChain: state.eventLedger.slice(-6),
        warningId: state.lastFailureCause.warningId,
        peopleSafety: state.peopleSafety,
        survivingUnits,
        groupId: trappedGroup.groupId,
      };
    }
    const waitingGroups = state.civilians.filter((group) => group.status === "Waiting");
    if (!hasUnresolvedLaunchedGroup && safePeople < MissionConfig.requiredEvacuees && waitingGroups.length) {
      const missingPeople = MissionConfig.requiredEvacuees - safePeople;
      return {
        status: "Defeat",
        path: ClassifyRoute(state),
        title: "还有一批没有发车",
        summary: `仅安全转移 ${safePeople}/${MissionConfig.totalEvacuees} 人，还差 ${missingPeople} 人；${waitingGroups.map((group) => group.name).join("、")}仍在赵庄待命。`,
        failureId: "EvacuationIncomplete",
        tip: BuildIncompleteEvacuationTip(state, waitingGroups, missingPeople),
        causeChain: state.eventLedger.slice(-6),
        peopleSafety: state.peopleSafety,
        survivingUnits,
        missingPeople,
        waitingGroupIds: waitingGroups.map((group) => group.groupId),
      };
    }
    return {
      status: "Defeat",
      path: ClassifyRoute(state),
      title: "天亮时封锁仍未穿过",
      summary: `仅转移 ${state.civiliansSafe}/${MissionConfig.totalEvacuees} 人，另有 ${movingPeople} 人仍在地下。`,
      failureId: "EvacuationLate",
      tip: BuildEvacuationLateTip(state),
      causeChain: state.eventLedger.slice(-6),
      peopleSafety: state.peopleSafety,
      survivingUnits,
    };
  }
  return null;
}

export function RunEnemyPhase(inputState) {
  const state = Clone(inputState);
  state.phase = "Enemy";
  ResolveCracksAndSmoke(state);
  for (const enemy of state.enemies) {
    ResolveEnemyIntent(state, enemy);
  }
  AdvanceCivilians(state);
  state.civiliansSafe = CountSafeCivilians(state);
  ApplyVillagePressure(state);
  if (state.exposure >= 35 && state.lastTraceTileKey) {
    AddEvidence(
      state,
      "AccumulatedTrace",
      state.lastTraceTileKey,
      Clamp(state.exposure / 100, 0.35, 1),
      "连续行动留下的痕迹",
    );
    AddLog(
      state,
      "warning",
      `暴露达到 ${state.exposure}，敌军获得${state.tiles[state.lastTraceTileKey].name}方向的搜索线索。`,
    );
  }
  state.exposure = Clamp(state.exposure - 3, 0, 100);
  state.intel = Math.max(0, state.intel - 1);
  state.evidence = state.evidence.filter((entry) => entry.expiresTurn >= state.turn);
  state.decoys = state.decoys.filter((entry) => entry.expiresTurn >= state.turn);
  for (const unit of state.units) {
    if (unit.health > 0) {
      unit.actionPoints = unit.maxActionPoints;
    }
  }
  state.turn += 1;
  if (!state.sweepActive && state.turn >= state.sweepTurn) {
    state.sweepActive = true;
    AddLog(state, "warning", "扫荡开始：工兵封锁组入场，已确认洞口会先预告封堵，再尝试灌烟。");
  }
  for (const unit of state.units) {
    if (unit.ambushPrepared && state.turn > (unit.ambushPreparedUntilTurn ?? 0)) {
      unit.ambushPrepared = false;
      unit.ambushTileKey = null;
      unit.ambushWarningId = null;
      unit.ambushEnemyId = null;
      AddLog(state, "info", `${unit.shortName}的洞口伏击窗口已过，需重新判断敌情后再准备。`);
    }
  }
  state.phase = "Player";
  PlanEnemyTurn(state);
  state.routePath = ClassifyRoute(state);
  state.outcome = EvaluateMission(state);
  if (state.outcome?.status === "Victory") {
    const pendingWarnings = state.warnings.filter((warning) => !warning.resolved);
    if (pendingWarnings.length) {
      for (const warning of pendingWarnings) {
        warning.resolved = true;
        warning.cancelled = true;
        warning.expiredByMissionEnd = true;
      }
      AddLog(
        state,
        "good",
        `群众已在 ${pendingWarnings.length} 项敌军反制结算前撤清；未执行预警随任务结束取消。`,
      );
      state.outcome.causeChain = state.eventLedger.slice(-6);
    }
  }
  return state;
}

export function AdvanceTurn(inputState) {
  if (inputState.outcome) {
    return Clone(inputState);
  }
  return RunEnemyPhase(inputState);
}

export function GetCombatPreview(state, unitId, targetKey) {
  const unit = GetUnit(state, unitId);
  const enemy = EnemyAt(state, targetKey);
  if (!unit || !enemy) {
    return null;
  }
  const emergedBonus = unit.emergedTurn === state.turn ? 1 : 0;
  const damage = Math.max(1, unit.attack + emergedBonus);
  return {
    attacker: unit.shortName,
    defender: enemy.name,
    damage,
    retaliation: enemy.health > damage ? enemy.attack : 0,
    exposureGain: 14,
    note: emergedBonus
      ? "本回合从地道出击：伏击伤害 +1"
      : "正面攻击会大幅提高暴露；杀敌不计入任务目标",
  };
}

export function GetObjectiveSummary(state) {
  const turnsToSweep = Math.max(0, state.sweepTurn - state.turn);
  const movingPeople = state.civilians
    .filter((group) => group.status === "Moving")
    .reduce((sum, group) => sum + group.people, 0);
  return {
    primary: `安全转移 ${state.civiliansSafe}/${MissionConfig.requiredEvacuees} 人`,
    secondary: state.tunnelsDug > 0 ? "已新挖地道" : "至少新挖 1 段地道",
    sweep: state.sweepActive ? "扫荡进行中" : `${turnsToSweep} 回合后扫荡`,
    movingPeople,
    waitingPeople: MissionConfig.totalEvacuees - state.civiliansSafe - movingPeople,
    exitSignalsIssued: state.exitSignalsIssued ?? 0,
    planningReconCompleted: Boolean(state.planningReconCompleted),
    plannedExitKey: state.plannedExitKey ?? null,
    plannedExitName: state.plannedExitKey ? state.tiles[state.plannedExitKey]?.name ?? null : null,
  };
}

function BuildExitWindowSnapshot(state, exitKey, record) {
  const node = state.tunnels[exitKey] ?? null;
  const warning = state.warnings.find((entry) => (
    !entry.resolved && entry.targetKey === exitKey && ["Seal", "Smoke"].includes(entry.kind)
  ));
  const activeThreats = state.enemies
    .filter(IsAlive)
    .filter((enemy) => (enemy.stunnedUntilTurn ?? 0) < state.turn)
    .map((enemy) => ({
      enemy,
      distance: HexDistance(enemy.tileKey, exitKey),
    }))
    .sort((first, second) => first.distance - second.distance);
  const nearest = activeThreats[0] ?? null;
  const blockingThreat = activeThreats.find(({ distance }) => distance <= 1) ?? null;
  const incomingThreat = activeThreats.find(({ enemy }) => (
    enemy.intentRevealed
    && enemy.intent?.targetKey === exitKey
    && [EnemyIntentIds.PATROL, EnemyIntentIds.INVESTIGATE, EnemyIntentIds.SEARCH]
      .includes(enemy.intent.intentId)
  )) ?? null;
  const threatSpeed = nearest?.enemy.role === "Sapper" && state.sweepActive
    ? (nearest.enemy.sweepMove ?? 1)
    : 1;
  const threatEta = nearest
    ? Math.max(0, Math.ceil((nearest.distance - 1) / threatSpeed))
    : null;
  let status = "Unknown";
  let detail = node ? "尚未复查地面" : "地道尚未接通";
  if (node?.smoke > 0 || warning?.kind === "Smoke") {
    status = "Smoking";
    detail = warning ? "灌烟预告待处理" : "洞口烟流未散";
  } else if (node?.sealed || warning?.kind === "Seal") {
    status = "Sealing";
    detail = warning ? "封洞预告待处理" : "洞口已经封堵";
  } else if (blockingThreat || incomingThreat) {
    status = "Watched";
    detail = `${(incomingThreat ?? blockingThreat).enemy.name}${incomingThreat ? "正向洞口推进" : "正在控制洞口近旁"}`;
  } else if (node && record.checkedUntilTurn >= state.turn) {
    status = "Clear";
    detail = `安全信号有效至 T${record.checkedUntilTurn}`;
  }
  return {
    ...Clone(record),
    status,
    detail,
    connected: Boolean(node),
    threatEnemyId: nearest?.enemy.enemyId ?? null,
    threatName: nearest?.enemy.name ?? null,
    threatDistance: nearest?.distance ?? null,
    threatEta,
  };
}

export function GetExitWindow(state, exitKey) {
  const windows = EnsureExitWindows(state);
  windows[exitKey] ??= CreateExitWindowRecord(exitKey);
  return BuildExitWindowSnapshot(state, exitKey, windows[exitKey]);
}

export function SerializeState(state) {
  return JSON.stringify(state);
}

export function DeserializeState(serialized) {
  const parsed = JSON.parse(serialized);
  if (!parsed || parsed.version !== 1) {
    throw new Error("Unsupported TunnelFront1942 save version");
  }
  let legacyLaunchOrder = 1;
  for (const group of parsed.civilians ?? []) {
    const template = CivilianGroupTemplates.find((entry) => entry.groupId === group.groupId);
    group.moveSteps ??= template?.moveSteps ?? 2;
    group.trafficLoad ??= template?.trafficLoad ?? 1;
    group.pressureWeight ??= template?.pressureWeight ?? 1;
    group.logisticsNote ??= template?.logisticsNote ?? "标准转移批次";
    group.trafficDelays ??= 0;
    group.lastTrafficDelayTileKey ??= null;
    if (group.status !== "Waiting" && group.launchOrder == null) {
      group.launchOrder = legacyLaunchOrder;
      legacyLaunchOrder += 1;
    }
    group.launchTurn ??= group.status === "Waiting" ? null : MissionConfig.evacuationTurn;
    group.exitArrivalTurn ??= group.waitingForSignal
      ? Math.max(group.launchTurn ?? MissionConfig.evacuationTurn, (parsed.turn ?? 1) - 1)
      : null;
  }
  parsed.civilianLaunchSerial ??= Math.max(
    1,
    ...(parsed.civilians ?? []).map((group) => (group.launchOrder ?? 0) + 1),
  );
  parsed.planningReconCompleted ??= parsed.reconActions > 0 && parsed.tunnelsDug === 0;
  if (parsed.planningReconCompleted && !parsed.plannedExitKey) {
    const connectedExit = FindEvacuationPaths(parsed)[0]?.exitKey ?? null;
    const dugKeys = Object.keys(parsed.tunnels ?? {}).filter((tileKey) => (
      !parsed.tunnels[tileKey].isOriginal
    ));
    parsed.plannedExitKey = connectedExit ?? [...evacuationExitKeys].sort((first, second) => {
      const firstDistance = dugKeys.length
        ? Math.min(...dugKeys.map((tileKey) => HexDistance(tileKey, first)))
        : evacuationExitKeys.indexOf(first);
      const secondDistance = dugKeys.length
        ? Math.min(...dugKeys.map((tileKey) => HexDistance(tileKey, second)))
        : evacuationExitKeys.indexOf(second);
      return firstDistance - secondDistance;
    })[0];
  }
  if (parsed.plannedExitKey) {
    const survey = GetRouteSurvey(parsed, parsed.plannedExitKey);
    parsed.plannedCorridorKeys ??= [...survey.corridorKeys];
    parsed.plannedFastPath ??= [...survey.fastPath];
    parsed.plannedQuietPath ??= [...survey.quietPath];
  } else {
    parsed.plannedCorridorKeys ??= [];
    parsed.plannedFastPath ??= [];
    parsed.plannedQuietPath ??= [];
  }
  return parsed;
}

export function CreateSurfaceSnapshot(state) {
  return {
    turn: state.turn,
    sweepActive: state.sweepActive,
    exposure: state.exposure,
    units: state.units
      .filter((unit) => unit.layer === LayerIds.SURFACE)
      .map((unit) => ({
        unitId: unit.unitId,
        tileKey: unit.tileKey,
        health: unit.health,
      })),
    enemies: state.enemies.map((enemy) => ({
      enemyId: enemy.enemyId,
      role: enemy.role,
      tileKey: enemy.tileKey,
      health: enemy.health,
    })),
    observations: CollectEnemyObservations(state),
    memory: Clone(state.enemyMemory),
  };
}

export function CreateRulesApi() {
  return Object.freeze({
    ActionIds,
    LayerIds,
    CreateInitialState,
    ApplyPlayerAction,
    ApplyPlayerActionPath,
    AdvanceTurn,
    GetAvailableActions,
    GetActionTargets,
    GetActionPathPlans,
    GetMoveTargets,
    GetDigTargets,
    IsSoilKnown,
    GetAttackTargets,
    GetEvacuationTargets,
    GetCivilianTransitEstimate,
    GetReconTargets,
    GetRouteSurvey,
    FindTunnelPath,
    FindEvacuationPaths,
    GetCombatPreview,
    GetObjectiveSummary,
    GetExitWindow,
    GetDecoyResponder,
    CollectEnemyObservations,
    UpdateEnemyBeliefs,
    PlanEnemyTurn,
    EvaluateMission,
    SerializeState,
    DeserializeState,
    CreateSurfaceSnapshot,
  });
}
