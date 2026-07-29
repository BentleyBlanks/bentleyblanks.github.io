// 《烽线 · 敌后指挥》——双边补给网络。
//
// 本模块只处理 plain object，不引用渲染层，也不修改传入 state。地图层提供道路、铁路、
// 补给节点和动态战线；这里叠加实时控制、敌军 ZOC、破路以及群众网络，计算本回合真正
// 能送到每个格子的吞吐量。敌我双方走同一套规则，区别只在补给源与群众网络的使用方式。

import { Clamp, HexNeighborKeys } from "./Script_Hex.mjs";

export const supplyStateKeys = Object.freeze(["Sustained", "Strained", "Low", "Isolated"]);

export const supplyStateLabels = Object.freeze({
  Sustained: "补给充足",
  Strained: "补给吃紧",
  Low: "低补给",
  Isolated: "孤立",
});

export const supplyConstants = Object.freeze({
  maximumSupply: 100,
  sustainedThroughput: 3,
  lowThroughput: 0.7,
  traceThroughput: 0.12,
  fullSupplyThreshold: 80,
  lowSupplyThreshold: 25,
  isolatedDrain: 20,
  lowDrain: 9,
  strainedRecovery: 7,
  // Reopening a road restores throughput immediately, not the unit's exhausted local
  // stocks. Refill takes several turns so relief operations have a readable window.
  sustainedRecovery: 6,
  routeAttrition: 0.16,
  maximumIterations: 10000,
});

function Clone(value) {
  if (typeof structuredClone === "function") return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

function Round(value, digits = 2) {
  const scale = 10 ** digits;
  return Math.round((Number(value) || 0) * scale) / scale;
}

function NormalizeCamp(camp) {
  return camp === "Enemy" ? "Enemy" : "Resistance";
}

function HexCamp(hex) {
  const control = hex?.control;
  if (control === "Enemy") return "Enemy";
  if (control === "Base" || control === "Guerrilla" || control === "Resistance") return "Resistance";
  return "Contested";
}

function UnitCamp(unit, state) {
  if ((state?.enemies ?? []).some((candidate) => candidate?.id === unit?.id)) return "Enemy";
  return unit?.side === "Enemy" ? "Enemy" : "Resistance";
}

function UnitAlive(unit) {
  return unit && (Number(unit.hp) || 0) > 0 && unit.key;
}

function EdgeKey(a, b) {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

function BuildTransportLookup(state) {
  const lookup = new Map();
  for (const edge of state.map.transportEdges ?? []) {
    const a = edge?.a ?? edge?.fromKey;
    const b = edge?.b ?? edge?.toKey;
    if (a && b) lookup.set(EdgeKey(a, b), edge);
  }
  for (const key of state.map.order ?? []) {
    for (const connection of state.map.hexes[key]?.transportConnections ?? []) {
      if (connection?.toKey) lookup.set(EdgeKey(key, connection.toKey), connection);
    }
  }
  return lookup;
}

function BuildFrontLookup(state) {
  const lookup = new Map();
  for (const edge of state.map.frontLines ?? []) {
    const a = edge?.a ?? edge?.fromKey;
    const b = edge?.b ?? edge?.toKey;
    if (a && b) lookup.set(EdgeKey(a, b), edge);
  }
  return lookup;
}

function HostileSets(state, camp) {
  const hostileUnits = camp === "Enemy" ? state.units ?? [] : state.enemies ?? [];
  const hostileSources = camp === "Enemy" ? state.bases ?? [] : state.strongholds ?? [];
  const occupied = new Set();
  const zoc = new Set();
  for (const item of [...hostileUnits, ...hostileSources]) {
    if (!item?.key || (item.hp !== undefined && item.hp <= 0) || (item.garrison !== undefined && item.garrison <= 0)) continue;
    occupied.add(item.key);
    zoc.add(item.key);
    for (const key of HexNeighborKeys(item.key)) {
      if (state.map.hexes[key]) zoc.add(key);
    }
  }
  return { occupied, zoc };
}

function NodeCanServe(state, node, camp) {
  const hex = state.map.hexes[node?.key];
  if (!hex) return false;
  const control = HexCamp(hex);
  if (control === (camp === "Enemy" ? "Resistance" : "Enemy")) return false;
  if (node.camp === camp) return true;
  if (camp === "Resistance") {
    return control === "Resistance" && (hex.massBase ?? 0) >= 34;
  }
  return control === "Enemy";
}

/** 返回当前局面的真正补给源。聚落、车站与据点默认只是接力点。 */
export function CollectSupplySources(state, camp = "Resistance") {
  const side = NormalizeCamp(camp);
  if (!state?.map?.hexes) return [];
  const sources = [];
  const Add = (source) => {
    if (!source?.key || !state.map.hexes[source.key]) return;
    const existing = sources.find((candidate) => candidate.key === source.key);
    if (existing) {
      existing.capacity = Math.max(existing.capacity, source.capacity);
      existing.kinds = Array.from(new Set([...existing.kinds, ...source.kinds]));
      return;
    }
    sources.push({ ...source, capacity: Round(Math.max(0.5, source.capacity)), kinds: source.kinds.slice() });
  };

  if (side === "Resistance") {
    for (const base of state.bases ?? []) {
      Add({
        key: base.key,
        capacity: 8 + Math.max(1, Number(base.tier) || 1) * 5,
        kinds: ["Base"],
        name: base.name ?? "根据地",
      });
    }
  }

  for (const node of state.map.supplyNodes ?? []) {
    if (!NodeCanServe(state, node, side)) continue;
    // New maps are explicit. For old saves, only historically source-like node kinds
    // are inferred as sources; villages, towns and ordinary garrisons remain relays.
    const inferredSource = side === "Resistance"
      ? node.kind === "FieldHeadquarters"
      : node.kind === "RailDepot" && node.isPrimary === true;
    if (node.relayOnly === true || !(node.isSource === true || inferredSource)) continue;
    const hex = state.map.hexes[node.key];
    let capacity = Number(node.capacity) || 3;
    if (side === "Resistance") capacity *= 0.55 + Clamp((hex.massBase ?? 0) / 100, 0, 1) * 0.65;
    Add({
      key: node.key,
      capacity,
      kinds: [node.kind ?? "Node"],
      name: node.name ?? node.kind ?? "补给节点",
    });
  }
  return sources.sort((a, b) => a.key.localeCompare(b.key));
}

function BuildRelayLookup(state, camp) {
  const relays = new Map();
  for (const node of state.map.supplyNodes ?? []) {
    if (!NodeCanServe(state, node, camp)) continue;
    if (node.relayOnly !== true && node.isSource === true) continue;
    const current = relays.get(node.key) ?? 0;
    relays.set(node.key, Math.max(current, Number(node.capacity) || 0));
  }
  return relays;
}

function EdgeCapacity(state, fromKey, toKey, camp, threats, transportLookup, relayLookup, frontLookup) {
  const fromHex = state.map.hexes[fromKey];
  const toHex = state.map.hexes[toKey];
  if (!fromHex || !toHex) return { capacity: 0, reasons: ["地图边界"] };
  const connection = transportLookup.get(EdgeKey(fromKey, toKey)) ?? null;
  const reasons = [];
  let capacity = Math.max(0.22, Number(connection?.throughput) || Number(toHex.supplyThroughput) || 0.45);
  const rail = Boolean(connection?.kind === "Railway" || fromHex.railway && toHex.railway);
  const road = Math.min(Number(fromHex.road) || 0, Number(toHex.road) || 0);
  if (rail) {
    capacity = Math.max(capacity, camp === "Enemy" ? 10 : 5.5);
    reasons.push("铁路");
  } else if (road >= 2) {
    capacity = Math.max(capacity, 6.5);
    reasons.push("公路");
  } else if (road >= 1) {
    capacity = Math.max(capacity, 3.8);
    reasons.push("道路");
  } else if (camp === "Resistance" && (toHex.massBase ?? 0) >= 34 && HexCamp(toHex) !== "Enemy") {
    capacity = Math.max(capacity, 1.2 + (toHex.massBase ?? 0) * 0.035);
    reasons.push("群众网络");
  } else {
    reasons.push("小路");
  }

  // A relay can preserve the capacity of an existing route, but it never seeds an
  // independent network. This makes local mass work and depots valuable without
  // making a rail cut meaningless.
  const relayCapacity = Math.max(relayLookup.get(fromKey) ?? 0, relayLookup.get(toKey) ?? 0);
  if (relayCapacity > 0) {
    capacity = Math.max(capacity, Math.min(relayCapacity * 0.72, camp === "Enemy" ? 7.5 : 5.5));
    reasons.push("接力节点");
  }
  const frontEdge = frontLookup.get(EdgeKey(fromKey, toKey));
  if (frontEdge) {
    capacity *= frontEdge.type === "MainFront" ? 0.54 : 0.72;
    reasons.push(frontEdge.type === "MainFront" ? "跨越主战线" : "穿越接触线");
  }

  const opposingCamp = camp === "Enemy" ? "Resistance" : "Enemy";
  if (HexCamp(toHex) === opposingCamp) {
    capacity *= 0.16;
    reasons.push("敌控制区");
  } else if (HexCamp(toHex) === "Contested") {
    capacity *= 0.68;
    reasons.push("争夺区");
  }
  if (threats.occupied.has(toKey)) {
    capacity *= 0.12;
    reasons.push("敌军占据");
  } else if (threats.zoc.has(toKey)) {
    capacity *= 0.32;
    reasons.push("敌军威胁");
  }

  const brokenRail = Boolean(fromHex.railBroken || toHex.railBroken);
  const brokenRoad = Boolean(fromHex.roadBroken || toHex.roadBroken);
  const disrupted =
    Number(fromHex.sabotagedTurns ?? fromHex.transportDamage ?? 0) > 0 ||
    Number(toHex.sabotagedTurns ?? toHex.transportDamage ?? 0) > 0;
  if (rail && brokenRail) {
    capacity *= 0.18;
    reasons.push("铁路破坏");
  }
  if (brokenRoad) {
    capacity *= 0.38;
    reasons.push("道路破坏");
  }
  if (disrupted) {
    capacity *= 0.35;
    reasons.push("持续破袭");
  }
  return { capacity: Round(Math.max(0, capacity)), reasons };
}

/**
 * 计算一方的实际补给传播。算法采用最大瓶颈路：路径每前进一步产生少量损耗，
 * ZOC/控制/破路改变边吞吐，因此切断枢纽会立即改变后方整片区域，而非只改一个标签。
 */
export function ComputeSupplyNetwork(state, camp = "Resistance", options = {}) {
  const side = NormalizeCamp(camp);
  const empty = {
    camp: side,
    sourceKeys: [],
    sources: [],
    throughputByKey: {},
    predecessorByKey: {},
    sourceByKey: {},
    routeReasonsByKey: {},
    suppliedKeys: [],
    isolatedKeys: state?.map?.order?.slice?.() ?? [],
    threatenedKeys: [],
  };
  if (!state?.map?.hexes || !Array.isArray(state.map.order)) return empty;
  const sources = Array.isArray(options.sources) ? options.sources : CollectSupplySources(state, side);
  const threats = HostileSets(state, side);
  const transportLookup = BuildTransportLookup(state);
  const relayLookup = BuildRelayLookup(state, side);
  const frontLookup = BuildFrontLookup(state);
  const throughputByKey = Object.create(null);
  const predecessorByKey = Object.create(null);
  const sourceByKey = Object.create(null);
  const routeReasonsByKey = Object.create(null);
  const open = [];
  for (const source of sources) {
    if (!state.map.hexes[source.key]) continue;
    const capacity = Math.max(0.5, Number(source.capacity) || 1);
    if (capacity <= (throughputByKey[source.key] ?? -1)) continue;
    throughputByKey[source.key] = capacity;
    predecessorByKey[source.key] = null;
    sourceByKey[source.key] = source.key;
    routeReasonsByKey[source.key] = ["补给源"];
    open.push({ key: source.key, throughput: capacity });
  }

  let iterations = 0;
  while (open.length && iterations < supplyConstants.maximumIterations) {
    iterations += 1;
    open.sort((a, b) => b.throughput - a.throughput || a.key.localeCompare(b.key));
    const current = open.shift();
    if (current.throughput + 1e-9 < (throughputByKey[current.key] ?? 0)) continue;
    for (const neighborKey of HexNeighborKeys(current.key)) {
      if (!state.map.hexes[neighborKey]) continue;
      const edge = EdgeCapacity(state, current.key, neighborKey, side, threats, transportLookup, relayLookup, frontLookup);
      const nextThroughput = Math.max(
        0,
        Math.min(current.throughput, edge.capacity) - supplyConstants.routeAttrition,
      );
      if (nextThroughput <= (throughputByKey[neighborKey] ?? 0) + 1e-9) continue;
      throughputByKey[neighborKey] = Round(nextThroughput);
      predecessorByKey[neighborKey] = current.key;
      sourceByKey[neighborKey] = sourceByKey[current.key];
      routeReasonsByKey[neighborKey] = edge.reasons;
      open.push({ key: neighborKey, throughput: nextThroughput });
    }
  }

  const suppliedKeys = state.map.order.filter(
    (key) => (throughputByKey[key] ?? 0) >= supplyConstants.traceThroughput,
  );
  const supplied = new Set(suppliedKeys);
  return {
    camp: side,
    sourceKeys: sources.map((source) => source.key),
    sources,
    throughputByKey: { ...throughputByKey },
    predecessorByKey: { ...predecessorByKey },
    sourceByKey: { ...sourceByKey },
    routeReasonsByKey: { ...routeReasonsByKey },
    suppliedKeys,
    isolatedKeys: state.map.order.filter((key) => !supplied.has(key)),
    threatenedKeys: Array.from(threats.zoc).filter((key) => state.map.hexes[key]).sort(),
  };
}

export function GetSupplyState(supply, throughput) {
  const stock = Clamp(Number(supply) || 0, 0, supplyConstants.maximumSupply);
  const delivery = Math.max(0, Number(throughput) || 0);
  if (delivery < supplyConstants.traceThroughput) return "Isolated";
  if (delivery < supplyConstants.lowThroughput || stock < supplyConstants.lowSupplyThreshold) return "Low";
  if (delivery < supplyConstants.sustainedThroughput || stock < supplyConstants.fullSupplyThreshold) return "Strained";
  return "Sustained";
}

export function GetSupplyModifiers(unitOrState) {
  const state = typeof unitOrState === "string" ? unitOrState : unitOrState?.supplyState ?? "Sustained";
  if (state === "Isolated") {
    return { movement: 0.45, combat: 0.68, recovery: 0.2, retreat: 0.55, fatiguePerTurn: 10 };
  }
  if (state === "Low") {
    return { movement: 0.65, combat: 0.8, recovery: 0.45, retreat: 0.72, fatiguePerTurn: 5 };
  }
  if (state === "Strained") {
    return { movement: 0.82, combat: 0.91, recovery: 0.72, retreat: 0.88, fatiguePerTurn: 1 };
  }
  return { movement: 1, combat: 1, recovery: 1, retreat: 1, fatiguePerTurn: -4 };
}

function AdvanceUnit(unit, network, advance) {
  const next = { ...unit };
  const currentSupply = Clamp(
    Number.isFinite(Number(unit.supply)) ? Number(unit.supply) : supplyConstants.maximumSupply,
    0,
    supplyConstants.maximumSupply,
  );
  const throughput = Math.max(0, Number(network.throughputByKey[unit.key]) || 0);
  let supply = currentSupply;
  let isolationTurns = Math.max(0, Math.round(Number(unit.isolationTurns) || 0));
  if (advance) {
    if (throughput < supplyConstants.traceThroughput) {
      supply -= supplyConstants.isolatedDrain;
      isolationTurns += 1;
    } else if (throughput < supplyConstants.lowThroughput) {
      supply -= supplyConstants.lowDrain;
      isolationTurns = Math.max(0, isolationTurns - 1);
    } else if (throughput < supplyConstants.sustainedThroughput) {
      supply += supplyConstants.strainedRecovery;
      isolationTurns = Math.max(0, isolationTurns - 1);
    } else {
      supply += supplyConstants.sustainedRecovery;
      isolationTurns = Math.max(0, isolationTurns - 1);
    }
  }
  supply = Clamp(supply, 0, supplyConstants.maximumSupply);
  const supplyState = GetSupplyState(supply, throughput);
  const modifiers = GetSupplyModifiers(supplyState);
  next.supply = Round(supply, 1);
  next.supplyState = supplyState;
  next.supplyThroughput = Round(throughput);
  next.supplySourceKey = network.sourceByKey[unit.key] ?? null;
  next.supplyPredecessorKey = network.predecessorByKey[unit.key] ?? null;
  next.isolationTurns = isolationTurns;
  next.fatigue = Clamp((Number(unit.fatigue) || 0) + (advance ? modifiers.fatiguePerTurn : 0), 0, 100);
  return next;
}

/**
 * 回合重算入口。返回克隆后的 state 与可直接给 HUD/行动预览读取的摘要。
 * advance=false 只补齐/刷新派生字段；advance=true 才消耗库存、累积孤立与疲劳。
 */
export function RecalculateSupply(state, options = {}) {
  // Public callers keep immutable semantics by default. Rules.RecomputeSupply already
  // owns a fresh state clone, so it can opt out of a second whole-map structuredClone.
  // This removes the dominant cost from Bot action loops without changing network math.
  const nextState = options.copyState === false ? state : Clone(state);
  if (!nextState?.map?.hexes) return { nextState, summary: { units: {}, camps: {} } };
  const advance = options.advance === true;
  const resistance = ComputeSupplyNetwork(nextState, "Resistance", options.resistance ?? {});
  const enemy = ComputeSupplyNetwork(nextState, "Enemy", options.enemy ?? {});
  nextState.units = (nextState.units ?? []).map((unit) => AdvanceUnit(unit, resistance, advance));
  nextState.enemies = (nextState.enemies ?? []).map((unit) => AdvanceUnit(unit, enemy, advance));
  const units = {};
  for (const unit of [...nextState.units, ...nextState.enemies]) {
    units[unit.id] = GetUnitSupplySummary(nextState, unit);
  }
  const CountStates = (items) => Object.fromEntries(
    supplyStateKeys.map((key) => [key, items.filter((unit) => unit.supplyState === key).length]),
  );
  const summary = {
    turn: nextState.turn ?? 0,
    advanced: advance,
    units,
    camps: {
      Resistance: {
        sources: resistance.sources.length,
        suppliedHexes: resistance.suppliedKeys.length,
        states: CountStates(nextState.units),
      },
      Enemy: {
        sources: enemy.sources.length,
        suppliedHexes: enemy.suppliedKeys.length,
        states: CountStates(nextState.enemies),
      },
    },
  };
  nextState.supply = {
    turn: nextState.turn ?? 0,
    resistance,
    enemy,
    summary,
  };
  return { nextState, summary };
}

export function GetUnitSupplySummary(state, unitOrId) {
  const unit = typeof unitOrId === "string"
    ? [...(state?.units ?? []), ...(state?.enemies ?? [])].find((candidate) => candidate.id === unitOrId)
    : unitOrId;
  if (!unit) {
    return {
      state: "Isolated",
      label: supplyStateLabels.Isolated,
      supply: 0,
      throughput: 0,
      isolationTurns: 0,
      sourceKey: null,
      route: [],
      modifiers: GetSupplyModifiers("Isolated"),
    };
  }
  const camp = UnitCamp(unit, state);
  const network = camp === "Enemy" ? state?.supply?.enemy : state?.supply?.resistance;
  const route = [];
  const seen = new Set();
  let cursor = unit.key;
  while (cursor && !seen.has(cursor) && route.length < 128) {
    route.push(cursor);
    seen.add(cursor);
    cursor = network?.predecessorByKey?.[cursor] ?? null;
  }
  const supplyState = supplyStateKeys.includes(unit.supplyState) ? unit.supplyState : "Sustained";
  return {
    state: supplyState,
    label: supplyStateLabels[supplyState],
    supply: Round(unit.supply ?? supplyConstants.maximumSupply, 1),
    throughput: Round(unit.supplyThroughput ?? 0),
    isolationTurns: Math.max(0, Number(unit.isolationTurns) || 0),
    sourceKey: unit.supplySourceKey ?? network?.sourceByKey?.[unit.key] ?? null,
    route,
    modifiers: GetSupplyModifiers(supplyState),
  };
}
