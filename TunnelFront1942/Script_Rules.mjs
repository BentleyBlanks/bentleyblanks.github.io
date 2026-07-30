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
    lastReconTurn: 0,
    reconVisitedTiles: [],
    decoyDiversions: 0,
    usedDecoyIds: [],
    lastEvacuationLaunchTurn: 0,
    lastTraceTileKey: "6,2",
    routePath: "undecided",
    outcome: null,
    lastFailureCause: null,
  };
  AddLog(state, "info", "第 4 回合转移信号生效，第 5 回合扫荡开始。先侦察土层与敌军意图，再决定地道走向。");
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
  for (const exitKey of ["2,1", "0,5"]) {
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
  return ["2,1", "0,5"]
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
  return FindEvacuationPaths(state).map((entry) => entry.exitKey);
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
  if (
    unit.role === "Scout"
    && unit.layer === LayerIds.SURFACE
    && state.lastReconTurn !== state.turn
    && (state.reconActions < 1 || state.organization >= 1)
    && (
      state.reconActions < 1
      || !(state.reconVisitedTiles ?? []).includes(unit.tileKey)
    )
  ) {
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
    && (unit.ammo ?? 0) > 0
  ) {
    actions.push(ActionIds.AMBUSH);
  }
  if (
    unit.role === "Militia"
    && unit.layer === LayerIds.TUNNEL
    && tile?.hasEntrance
    && !tunnel.trap
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

function ApplyRecon(state, unit) {
  const repeatRecon = state.reconActions > 0;
  state.reconVisitedTiles ??= [];
  if (
    unit.role !== "Scout"
    || unit.layer !== LayerIds.SURFACE
    || state.lastReconTurn === state.turn
    || (repeatRecon && state.organization < 1)
    || (repeatRecon && state.reconVisitedTiles.includes(unit.tileKey))
  ) {
    return { ok: false, reason: "侦察每回合限一次；复查需移动到未侦察地块并消耗 1 点组织" };
  }
  const revealed = RevealAround(state, unit.tileKey, 2);
  state.intel = Clamp(state.intel + 2, 0, 9);
  if (repeatRecon) {
    state.organization -= 1;
  }
  state.reconActions += 1;
  state.lastReconTurn = state.turn;
  state.reconVisitedTiles.push(unit.tileKey);
  state.exposure = Clamp(state.exposure + (repeatRecon ? -5 : 1), 0, 100);
  SpendAction(unit);
  for (const enemy of state.enemies) {
    if (IsAlive(enemy) && HexDistance(unit.tileKey, enemy.tileKey) <= 3) {
      enemy.intentRevealed = true;
      enemy.scoutedUntilTurn = state.turn + 2;
    }
  }
  AddLog(
    state,
    "good",
    repeatRecon
      ? `交通员在新地块消耗 1 点组织复查地表窗口，排除旧痕并标出敌军下一步意图；暴露下降 5。`
      : `交通员查清附近 ${revealed} 格土层，并标出可见敌军下一步意图。`,
  );
  return { ok: true };
}

function ApplyDecoy(state, unit, targetKey) {
  if (!GetDecoyTargets(state, unit.unitId).includes(targetKey)) {
    return { ok: false, reason: "假迹目标超出范围" };
  }
  SpendAction(unit);
  state.organization -= 1;
  const decoyId = `Decoy${state.eventSerial}`;
  state.decoys.push({
    decoyId,
    tileKey: targetKey,
    strength: 0.95,
    createdTurn: state.turn,
    expiresTurn: state.turn + 4,
  });
  const evidence = AddEvidence(state, "Decoy", targetKey, 0.95, unit.shortName);
  evidence.expiresTurn = state.turn + 4;
  state.exposure = Clamp(state.exposure - 8, 0, 100);
  state.decoysUsed += 1;
  state.lastTraceTileKey = targetKey;
  AddLog(
    state,
    "good",
    `${unit.shortName}在${state.tiles[targetKey].name}布下假脚印，掩去真实行迹并把搜索引向这里。`,
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
    || (unit.ammo ?? 0) <= 0
  ) {
    return { ok: false, reason: "只能在洞口地下准备伏击" };
  }
  unit.ambushPrepared = true;
  unit.ambushTileKey = unit.tileKey;
  unit.ammo = Math.max(0, (unit.ammo ?? 0) - 1);
  SpendAction(unit);
  AddLog(state, "good", `${unit.shortName}在${tile.name}洞口准备伏击，已预留 1 发弹药；离开洞口会取消伏击。`);
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
    || state.tools < 1
  ) {
    return { ok: false, reason: "无法在这里布置洞口陷阱" };
  }
  state.tools -= 1;
  node.trap = true;
  SpendAction(unit);
  AddLog(state, "good", `${unit.shortName}在${tile.name}布下一次性封洞陷阱。`);
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
  if (
    !route
    || !group
    || !GetEvacuationTargets(state, unit.unitId).includes(exitKey)
  ) {
    return { ok: false, reason: "该出口尚未接通，或没有待转移群众" };
  }
  group.status = "Moving";
  group.path = [...route.path];
  group.pathIndex = 0;
  group.tileKey = route.path[0];
  group.exitKey = exitKey;
  state.lastEvacuationLaunchTurn = state.turn;
  state.organization -= 1;
  SpendAction(unit);
  AddLog(
    state,
    "good",
    `${group.name}开始沿${state.tiles[exitKey].name}路线转移。群众每回合前进两段。`,
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
      result = ApplyRecon(state, unit);
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

function ChooseEvidenceTarget(state, enemy) {
  const activeEvidence = CollectEnemyObservations(state)
    .filter((entry) => entry.kind !== "KnownEntrance")
    .filter((entry) => {
      const hearingRange = entry.kind === "Decoy"
        ? 5
        : Math.ceil(2 + entry.strength * 3);
      return HexDistance(enemy.tileKey, entry.tileKey) <= hearingRange;
    })
    .sort((first, second) => (
      second.strength - first.strength
      || HexDistance(enemy.tileKey, first.tileKey) - HexDistance(enemy.tileKey, second.tileKey)
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

function FindNearestConfirmedEntrance(state, enemy) {
  return state.enemyMemory.confirmedEntrances
    .filter((tileKey) => state.tiles[tileKey]?.hasEntrance)
    .filter((tileKey) => (
      state.tiles[tileKey].kind !== "emergencyExit"
      || state.evidence.some((entry) => (
        entry.tileKey === tileKey
        && entry.kind !== "KnownEntrance"
        && entry.expiresTurn >= state.turn
      ))
    ))
    .sort((first, second) => (
      HexDistance(enemy.tileKey, first) - HexDistance(enemy.tileKey, second)
      || first.localeCompare(second)
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
  for (const enemy of state.enemies) {
    enemy.intentRevealed = (enemy.scoutedUntilTurn ?? 0) >= state.turn
      || HexDistance("6,2", enemy.tileKey) <= 2;
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
    const confirmedTarget = FindNearestConfirmedEntrance(state, enemy);
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
    const evidenceTarget = ChooseEvidenceTarget(state, enemy);
    if (evidenceTarget) {
      enemy.intent = {
        intentId: EnemyIntentIds.INVESTIGATE,
        label: `调查${state.tiles[evidenceTarget.tileKey].name}的痕迹`,
        targetKey: StepToward(enemy.tileKey, evidenceTarget.tileKey, state, occupiedKeys),
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
        targetKey: StepToward(enemy.tileKey, sweepTarget, state, occupiedKeys),
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

function TriggerEntranceDefense(state, enemy, targetKey, warningId) {
  const node = state.tunnels[targetKey];
  if (!node) {
    return false;
  }
  if (node.trap) {
    node.trap = false;
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
      `${state.tiles[targetKey].name}洞口陷阱中断了${enemy.name}的行动。`,
      warningId,
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
    ambusher.ambushPrepared = false;
    ambusher.ambushTileKey = null;
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
      break;
    }
    case EnemyIntentIds.RESOLVE_SMOKE:
      ResolveSmoke(state, enemy, intent);
      break;
    case EnemyIntentIds.PATROL:
    case EnemyIntentIds.INVESTIGATE:
    case EnemyIntentIds.SEARCH:
      if (!EnemyAt(state, intent.targetKey) || enemy.tileKey === intent.targetKey) {
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
        state.decoyDiversions += 1;
        enemy.stunnedUntilTurn = Math.max(enemy.stunnedUntilTurn ?? 0, state.turn + 1);
        AddLog(
          state,
          "good",
          `${enemy.name}被假迹带离原搜索轴线；真实行动热度下降，搜索组下回合停滞。`,
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
      break;
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

function AdvanceCivilians(state) {
  const trafficByTile = new Map();
  for (const group of state.civilians) {
    if (group.status !== "Moving") {
      continue;
    }
    let steps = 2;
    group.delayed = false;
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
            AddLog(
              state,
              "warning",
              `${group.name}在${state.tiles[previousExit].name}下方遇封口，转向${state.tiles[alternate.exitKey].name}备用支线。`,
            );
            break;
          }
          group.delayed = true;
          AddLog(state, "warning", `${group.name}已到出口下方，但洞口不可用，只能等待改道或抢通。`);
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
          AddLog(state, "warning", `${group.name}因塌方改走${state.tiles[reroute.exitKey].name}支线。`);
          continue;
        }
        group.status = "Trapped";
        group.delayed = true;
        state.peopleSafety = Math.max(0, state.peopleSafety - 8);
        AddLog(state, "danger", `${group.name}前方地道中断，被困在地下。`);
        break;
      }
      const capacity = node.braced ? 2 : 1;
      const usedCapacity = trafficByTile.get(nextKey) ?? 0;
      if (usedCapacity >= capacity) {
        group.delayed = true;
        AddLog(
          state,
          "warning",
          `${group.name}在${state.tiles[group.tileKey].name}等待：前方生土地道本回合通行量已满。`,
        );
        break;
      }
      trafficByTile.set(nextKey, usedCapacity + 1);
      group.pathIndex = nextIndex;
      group.tileKey = nextKey;
      if (node.cracked && !node.braced && node.dugTurn < state.turn) {
        CollapseTunnelNode(state, nextKey, true);
        break;
      }
      if (node.smoke > 0) {
        group.delayed = true;
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
  if (state.sweepActive && nearbyEnemies > 0 && waitingPeople > 0) {
    const harm = Math.min(8, nearbyEnemies * 2 + Math.ceil(waitingPeople / 3));
    state.peopleSafety = Math.max(0, state.peopleSafety - harm);
    state.lastFailureCause = {
      failureId: "VillageEncircled",
      warningId: null,
      text: `扫荡队逼近赵庄，仍在等待的 ${waitingPeople} 名群众承受封锁压力。`,
      tip: "尽早接通出口并分批疏散，或用假迹把搜索组拉离赵庄。",
    };
    AddLog(state, "danger", state.lastFailureCause.text);
  }
}

function ClassifyRoute(state) {
  if (state.ambushesTriggered + state.trapsTriggered > 0) {
    return "ambush";
  }
  if (state.decoyDiversions > 0) {
    return "deception";
  }
  if (state.tunnelsDug > 0 || state.civiliansSafe > 0) {
    return "stealth";
  }
  return "none";
}

export function EvaluateMission(state) {
  const survivingUnits = state.units.filter(IsAlive).length;
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
    state.civiliansSafe >= MissionConfig.requiredEvacuees
    && state.tunnelsDug >= 1
    && state.reconActions >= 1
    && state.sweepActive
    && state.turn >= 6
  ) {
    return {
      status: "Victory",
      path: ClassifyRoute(state),
      title: "地道把人送到了天亮以前",
      summary: `已安全转移 ${state.civiliansSafe}/${MissionConfig.totalEvacuees} 人。`,
      causeChain: state.eventLedger.slice(-6),
      peopleSafety: state.peopleSafety,
      survivingUnits,
    };
  }
  if (state.turn > state.maxTurns) {
    const movingPeople = state.civilians
      .filter((group) => group.status === "Moving")
      .reduce((sum, group) => sum + group.people, 0);
    if (state.reconActions < 1 && state.civiliansSafe >= MissionConfig.requiredEvacuees) {
      return {
        status: "Defeat",
        path: ClassifyRoute(state),
        title: "路线通了，敌情却没有查清",
        summary: `虽已转移 ${state.civiliansSafe}/${MissionConfig.totalEvacuees} 人，但整局没有完成地面侦察，无法确认后续封锁风险。`,
        failureId: "ReconMissing",
        tip: "第一回合让交通员在地面执行一次【侦察】，再决定北线或南线。",
        causeChain: state.eventLedger.slice(-6),
        peopleSafety: state.peopleSafety,
        survivingUnits,
      };
    }
    return {
      status: "Defeat",
      path: ClassifyRoute(state),
      title: "天亮时封锁仍未穿过",
      summary: `仅转移 ${state.civiliansSafe}/${MissionConfig.totalEvacuees} 人，另有 ${movingPeople} 人仍在地下。`,
      failureId: "EvacuationLate",
      tip: state.lastFailureCause?.tip
        ?? "在第 3—4 回合接通第一出口，并用另一名地下单位立即组织第一批疏散。",
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
  };
}

export function SerializeState(state) {
  return JSON.stringify(state);
}

export function DeserializeState(serialized) {
  const parsed = JSON.parse(serialized);
  if (!parsed || parsed.version !== 1) {
    throw new Error("Unsupported TunnelFront1942 save version");
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
    AdvanceTurn,
    GetAvailableActions,
    GetActionTargets,
    GetMoveTargets,
    GetDigTargets,
    GetAttackTargets,
    GetEvacuationTargets,
    FindTunnelPath,
    FindEvacuationPaths,
    GetCombatPreview,
    GetObjectiveSummary,
    CollectEnemyObservations,
    UpdateEnemyBeliefs,
    PlanEnemyTurn,
    EvaluateMission,
    SerializeState,
    DeserializeState,
    CreateSurfaceSnapshot,
  });
}
