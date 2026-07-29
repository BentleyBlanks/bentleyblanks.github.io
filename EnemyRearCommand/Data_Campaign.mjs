// 《烽线 · 敌后指挥》动态战役目标层。
// 纯逻辑、确定性、不可变：不依赖 DOM / three / Math.random。
// 本模块只评估战役态势，不直接发资源、分数或修改代价账本。

import {
  Clamp,
  Clamp01,
  HashString,
  HexDistanceKeys,
  HexKey,
  HexLine,
  HexNeighborKeys,
  ParseHexKey,
} from './Script_Hex.mjs';

export const campaignVersion = 1;
export const campaignLedgerKeys = Object.freeze([
  'civilianDeaths', 'displaced', 'villagesBurned', 'grainSeized', 'cadreLost',
]);

export const campaignEraDefinitions = Object.freeze([
  Object.freeze({ key: 'Opening', name: '开辟期', from: 0, to: 5 }),
  Object.freeze({ key: 'Growth', name: '发展期', from: 6, to: 13 }),
  Object.freeze({ key: 'Hardship', name: '困难期', from: 14, to: 21 }),
  Object.freeze({ key: 'Recovery', name: '恢复期', from: 22, to: 27 }),
  Object.freeze({ key: 'Counter', name: '反攻期', from: 28, to: 31 }),
]);

const safetyStrict = Object.freeze({
  civilianDeaths: 0, displaced: 18, villagesBurned: 0, grainSeized: 24, cadreLost: 0,
});
const safetyEvacuation = Object.freeze({
  civilianDeaths: 0, displaced: 42, villagesBurned: 0, grainSeized: 18, cadreLost: 0,
});

export const objectiveTypeDefinitions = Object.freeze({
  CutRailway: Object.freeze({
    key: 'CutRailway', title: '切断敌铁路', duration: 2,
    summary: '选择敌补给干线的关键一段，破坏后须阻止其立即抢修。',
    failure: '敌列车继续向沿线据点输送兵员，下一阶段封锁压力上升。',
    branchFlag: 'enemyRailFlow',
  }),
  HoldPass: Object.freeze({
    key: 'HoldPass', title: '守住隘口', duration: 2,
    summary: '利用山口与渡口迟滞敌军，不能让守备部队被切断退路。',
    failure: '敌军穿过隘口，前方交通线被迫改道。',
    branchFlag: 'passLost',
  }),
  EstablishSupplyCorridor: Object.freeze({
    key: 'EstablishSupplyCorridor', title: '建立补给走廊', duration: 3,
    summary: '把前沿村庄与后方根据地接成连续的粮药、情报接力线。',
    failure: '前沿部队补给不稳，后续任务优先转为接通交通。',
    branchFlag: 'supplyCrisis',
  }),
  RescueEncircled: Object.freeze({
    key: 'RescueEncircled', title: '接应被围部队', duration: 2,
    summary: '打开一条撤离通路，不以更多部队被围为代价。',
    failure: '被围部队失去整补窗口，战役机动力量受损。',
    branchFlag: 'forceDepleted',
  }),
  RaidThenWithdraw: Object.freeze({
    key: 'RaidThenWithdraw', title: '破袭后转移', duration: 2,
    summary: '先破交通，再立即离开接触点；破袭与转移缺一不可。',
    failure: '敌军循迹追击，下一回合暴露压力上升。',
    branchFlag: 'exposureCrisis',
  }),
  EvacuateAndDeny: Object.freeze({
    key: 'EvacuateAndDeny', title: '疏散与坚壁', duration: 2,
    summary: '先转移群众和粮药，再利用地道、坚壁窖保存基层网络。',
    failure: '群众安全受到威胁，后续必须优先组织疏散。',
    branchFlag: 'civilianEmergency',
  }),
  ExploitWeakness: Object.freeze({
    key: 'ExploitWeakness', title: '敌进我进', duration: 2,
    summary: '敌主力外出时袭扰其薄弱据点和后方交通，迫其回援。',
    failure: '敌守备完成归建，短暂的后方窗口关闭。',
    branchFlag: 'opportunityMissed',
  }),
  StrategicCounteroffensive: Object.freeze({
    key: 'StrategicCounteroffensive', title: '战略反攻', duration: 4,
    summary: '在补给稳固、人民安全有保障时，逐步拔除县城外围据点。',
    failure: '反攻节奏推迟，但 1945 年的历史终点不因此改写。',
    branchFlag: 'counteroffensiveDelayed',
  }),
});

const eraSequences = Object.freeze({
  Opening: Object.freeze(['HoldPass', 'EstablishSupplyCorridor', 'RaidThenWithdraw', 'EvacuateAndDeny', 'CutRailway']),
  Growth: Object.freeze(['CutRailway', 'EstablishSupplyCorridor', 'RaidThenWithdraw', 'HoldPass', 'ExploitWeakness']),
  Hardship: Object.freeze(['EvacuateAndDeny', 'RescueEncircled', 'RaidThenWithdraw', 'HoldPass', 'ExploitWeakness']),
  Recovery: Object.freeze(['EstablishSupplyCorridor', 'ExploitWeakness', 'CutRailway', 'RaidThenWithdraw', 'HoldPass']),
  Counter: Object.freeze(['StrategicCounteroffensive', 'EstablishSupplyCorridor', 'ExploitWeakness', 'RaidThenWithdraw']),
});

function SafeList(value) {
  return Array.isArray(value) ? value : [];
}

function ClonePlain(value) {
  if (Array.isArray(value)) return value.map(ClonePlain);
  if (!value || typeof value !== 'object') return value;
  const copy = {};
  for (const [key, item] of Object.entries(value)) copy[key] = ClonePlain(item);
  return copy;
}

function MapHexes(state) {
  return state?.map?.hexes || {};
}

function MapOrder(state) {
  const order = SafeList(state?.map?.order);
  return order.length ? order : Object.keys(MapHexes(state));
}

function EraKeyForTurn(turn) {
  const value = Clamp(Number(turn) || 0, 0, 31);
  return campaignEraDefinitions.find((era) => value >= era.from && value <= era.to)?.key || 'Counter';
}

function LedgerSnapshot(state) {
  const ledger = {};
  for (const key of campaignLedgerKeys) ledger[key] = Math.max(0, Number(state?.ledger?.[key]) || 0);
  return ledger;
}

function IsFriendly(hex) {
  return Boolean(hex && (hex.control === 'Base' || hex.control === 'Guerrilla'));
}

function UnitSupply(state, unit) {
  if (!unit) return 0;
  if (unit.isolated || unit.cutOff || unit.outOfSupply) return 0;
  const external = state?.supply?.units?.[unit.id] || state?.supplyState?.units?.[unit.id];
  const raw = external?.readiness ?? external?.level ?? unit.supply;
  if (Number.isFinite(raw)) return Clamp01(raw > 1 ? raw / 100 : raw);
  return 0.72;
}

function NearestUnit(context, key, maximum = Infinity, predicate = () => true) {
  let best = null;
  for (const unit of context.units) {
    if (!predicate(unit)) continue;
    const distance = HexDistanceKeys(unit.key, key);
    if (distance > maximum) continue;
    if (!best || distance < best.distance || (distance === best.distance && String(unit.id) < String(best.unit.id))) {
      best = { unit, distance };
    }
  }
  return best;
}

function Tie(context, salt, key) {
  return HashString(`${context.seed}:${context.turn}:${salt}:${key}`) >>> 0;
}

function PickBest(context, salt, candidates) {
  return candidates
    .filter(Boolean)
    .sort((a, b) => (b.score - a.score) || (Tie(context, salt, a.key) - Tie(context, salt, b.key)) || a.key.localeCompare(b.key))[0] || null;
}

function CampaignSignals(state) {
  return state?.campaignSignals || state?.missionSignals || {};
}

function BuildContext(state, campaignState) {
  const hexes = MapHexes(state);
  const order = MapOrder(state);
  const units = SafeList(state?.units).filter((unit) => unit?.key && (unit.hp ?? 1) > 0 && hexes[unit.key]);
  const enemies = SafeList(state?.enemies).filter((unit) => unit?.key && (unit.hp ?? 1) > 0);
  const strongholds = SafeList(state?.strongholds).filter((item) => item?.key && !item.destroyed && (item.garrison ?? 1) > 0);
  const friendlySourceKeys = [];
  for (const base of SafeList(state?.bases)) if (base?.key && hexes[base.key]) friendlySourceKeys.push(base.key);
  if (state?.startKey && hexes[state.startKey]) friendlySourceKeys.push(state.startKey);
  for (const key of order) {
    const hex = hexes[key];
    if (IsFriendly(hex) && (hex.massBase >= 55 || hex.supplyNodeId)) friendlySourceKeys.push(key);
  }
  return {
    state: state || {},
    campaignState: campaignState || {},
    seed: Number(campaignState?.seed ?? state?.seed) >>> 0,
    turn: Clamp(Number(state?.turn ?? campaignState?.turn) || 0, 0, 31),
    eraKey: state?.eraKey || EraKeyForTurn(state?.turn),
    hexes,
    order,
    units,
    enemies,
    strongholds,
    friendlySourceKeys: [...new Set(friendlySourceKeys)].sort(),
    ledger: LedgerSnapshot(state),
    signals: CampaignSignals(state),
  };
}

function StraightPath(context, fromKey, toKey) {
  if (!fromKey || !toKey) return [];
  return HexLine(ParseHexKey(fromKey), ParseHexKey(toKey))
    .map((cell) => HexKey(cell.q, cell.r))
    .filter((key) => context.hexes[key]);
}

function SafetyFor(type, baseline) {
  return {
    ledgerBaseline: { ...baseline },
    maxIncrease: { ...(type === 'EvacuateAndDeny' ? safetyEvacuation : safetyStrict) },
    rule: '人民伤亡、流离、焚村、被夺粮与干部损失只记入代价账本，不折算资源、奖励或分数。',
  };
}

function MakeObjective(context, type, slot, target, extra = {}) {
  const definition = objectiveTypeDefinitions[type];
  const duration = extra.duration ?? definition.duration;
  const targetKey = target?.key || null;
  const idHash = HashString(`${context.seed}:${context.turn}:${slot}:${type}:${targetKey || 'none'}`) >>> 0;
  return {
    id: `Objective_${context.turn}_${slot}_${type}_${idHash}`,
    type,
    slot,
    title: definition.title,
    summary: definition.summary,
    eraKey: context.eraKey,
    createdTurn: context.turn,
    deadlineTurn: context.turn + duration,
    targetKey,
    targetKeys: targetKey ? [targetKey] : [],
    assignedUnitId: target?.unit?.id || null,
    status: 'Active',
    priority: Number((extra.priority ?? target?.score ?? 50).toFixed(2)),
    baseline: {
      targetControl: targetKey ? context.hexes[targetKey]?.control ?? null : null,
      railBroken: targetKey ? Number(context.hexes[targetKey]?.railBroken) || 0 : 0,
      sabotageTotal: Number(context.state?.sabotageTotal) || 0,
      garrison: Number(target?.stronghold?.garrison) || 0,
      unitKey: target?.unit?.key || null,
    },
    safety: SafetyFor(type, context.ledger),
    failure: {
      label: definition.failure,
      branchFlag: definition.branchFlag,
      campaignEffects: { momentumDelta: -1, pressureDelta: type === 'EvacuateAndDeny' ? 2 : 1 },
    },
    success: {
      label: '目标达成，保留战役主动权。',
      campaignEffects: { momentumDelta: 1, pressureDelta: type === 'ExploitWeakness' ? -1 : 0 },
    },
    ...ClonePlain(extra),
  };
}

function CutRailwayCandidate(context, slot) {
  const candidates = [];
  for (const key of context.order) {
    const hex = context.hexes[key];
    if (!hex?.railway || (Number(hex.railBroken) || 0) > 0) continue;
    const nearest = NearestUnit(context, key, 14);
    if (!nearest) continue;
    const enemyValue = hex.control === 'Enemy' ? 15 : 0;
    candidates.push({ key, unit: nearest.unit, score: 55 + (hex.strategicValue || 0) * 12 + (hex.chokeValue || 0) * 8 + enemyValue - nearest.distance * 2 });
  }
  const target = PickBest(context, 'CutRailway', candidates);
  return target ? MakeObjective(context, 'CutRailway', slot, target, {
    targetKeys: [target.key],
    instructions: ['抵近铁路关键段', '实施破袭', '留队监视抢修动向'],
    reach: { distance: HexDistanceKeys(target.unit.key, target.key), horizon: 14 },
  }) : null;
}

function HoldPassCandidate(context, slot) {
  const candidates = [];
  for (const key of context.order) {
    const hex = context.hexes[key];
    if (!(hex?.feature === 'Pass' || hex?.feature === 'Ford' || (hex?.chokeValue || 0) >= 0.9)) continue;
    const nearest = NearestUnit(context, key, 12);
    if (!nearest) continue;
    candidates.push({ key, unit: nearest.unit, score: 52 + (hex.chokeValue || 0) * 18 + (hex.frontline ? 16 : 0) - nearest.distance * 2.2 });
  }
  const target = PickBest(context, 'HoldPass', candidates);
  return target ? MakeObjective(context, 'HoldPass', slot, target, {
    holdTurns: 2,
    instructions: ['占据隘口两侧有利地形', '保持一条群众交通退路', '避免在开阔地与敌硬拼'],
    reach: { distance: HexDistanceKeys(target.unit.key, target.key), horizon: 12 },
  }) : null;
}

function CorridorCandidate(context, slot) {
  const sourceKey = context.friendlySourceKeys[0] || context.units[0]?.key;
  if (!sourceKey) return null;
  const candidates = [];
  for (const key of context.order) {
    const hex = context.hexes[key];
    if (!hex || key === sourceKey) continue;
    const sourceDistance = HexDistanceKeys(sourceKey, key);
    if (sourceDistance < 3 || sourceDistance > 12) continue;
    const nearest = NearestUnit(context, key, 11);
    if (!nearest) continue;
    const forward = hex.frontline || hex.control === 'Contested' || hex.feature === 'Village' || hex.feature === 'Town';
    if (!forward) continue;
    const pathKeys = StraightPath(context, sourceKey, key);
    const friendlyRatio = pathKeys.length ? pathKeys.filter((pathKey) => IsFriendly(context.hexes[pathKey])).length / pathKeys.length : 0;
    candidates.push({ key, unit: nearest.unit, pathKeys, friendlyRatio, score: 58 + (hex.frontline ? 18 : 0) + (hex.strategicValue || 0) * 10 - friendlyRatio * 14 - nearest.distance });
  }
  const target = PickBest(context, 'Corridor', candidates);
  return target ? MakeObjective(context, 'EstablishSupplyCorridor', slot, target, {
    sourceKey,
    targetKeys: target.pathKeys,
    requiredFriendlyRatio: 0.68,
    instructions: ['建立前沿补给节点', '沿途组织村庄交通站', '确保受领部队不处于孤立状态'],
    reach: { distance: HexDistanceKeys(target.unit.key, target.key), horizon: 11 },
  }) : null;
}

function RescueCandidate(context, slot) {
  const endangered = context.units
    .filter((unit) => unit.isolated || unit.cutOff || unit.outOfSupply || UnitSupply(context.state, unit) < 0.28)
    .map((unit) => ({ unit, key: unit.key, score: 92 + (1 - UnitSupply(context.state, unit)) * 8 }));
  const target = PickBest(context, 'Rescue', endangered);
  if (!target) return null;
  const safeCandidates = context.friendlySourceKeys
    .map((key) => ({ key, distance: HexDistanceKeys(target.key, key) }))
    .filter((item) => item.distance <= 14)
    .sort((a, b) => a.distance - b.distance || a.key.localeCompare(b.key));
  const safeKey = safeCandidates[0]?.key || HexNeighborKeys(target.key).find((key) => IsFriendly(context.hexes[key])) || target.key;
  return MakeObjective(context, 'RescueEncircled', slot, target, {
    safeKey,
    targetUnitId: target.unit.id,
    targetKeys: [target.key, safeKey],
    instructions: ['从敌薄弱方向打开通路', '接应受困部队向群众网络撤离', '不得再投入低补给部队形成第二个包围圈'],
    reach: { distance: HexDistanceKeys(target.key, safeKey), horizon: 14 },
  });
}

function RaidCandidate(context, slot) {
  const candidates = [];
  for (const key of context.order) {
    const hex = context.hexes[key];
    if (!hex || (!hex.railway && (hex.road || 0) < 2) || (hex.railBroken || 0) > 0) continue;
    const nearest = NearestUnit(context, key, 13, (unit) => UnitSupply(context.state, unit) >= 0.45);
    if (!nearest) continue;
    const escapeKeys = HexNeighborKeys(key).filter((neighborKey) => {
      const neighbor = context.hexes[neighborKey];
      return neighbor && neighbor.control !== 'Enemy' && (neighbor.massBase >= 25 || neighbor.concealment >= 0.5);
    });
    if (!escapeKeys.length) continue;
    candidates.push({ key, unit: nearest.unit, escapeKeys, score: 57 + (hex.railway ? 15 : 5) + (hex.strategicValue || 0) * 8 - nearest.distance * 1.5 });
  }
  const target = PickBest(context, 'Raid', candidates);
  return target ? MakeObjective(context, 'RaidThenWithdraw', slot, target, {
    escapeKeys: target.escapeKeys,
    targetKeys: [target.key, ...target.escapeKeys],
    instructions: ['破坏交通设施', '同回合或下一回合离开破袭点', '在群众掩护下恢复隐蔽'],
    reach: { distance: HexDistanceKeys(target.unit.key, target.key), horizon: 13 },
  }) : null;
}

function EvacuationCandidate(context, slot) {
  const threatKeys = [];
  if (context.state?.sweep?.targetKey) threatKeys.push(context.state.sweep.targetKey);
  for (const enemy of context.enemies) {
    if (!enemy.visibleToPlayer) continue;
    const key = enemy.intentDetail?.targetKey;
    if (key && context.hexes[key]) threatKeys.push(key);
  }
  if (!threatKeys.length) {
    for (const enemy of context.enemies.filter((item) => item.visibleToPlayer)) threatKeys.push(enemy.key);
  }
  const candidates = [];
  for (const key of context.order) {
    const hex = context.hexes[key];
    if (!hex || !['Village', 'Town'].includes(hex.feature)) continue;
    const threatDistance = threatKeys.length ? Math.min(...threatKeys.map((threatKey) => HexDistanceKeys(key, threatKey))) : 99;
    if (threatDistance > 5 && !hex.frontline) continue;
    const nearest = NearestUnit(context, key, 10);
    if (!nearest) continue;
    candidates.push({ key, unit: nearest.unit, score: 70 + (hex.massBase || 0) * 0.3 + (5 - Math.min(5, threatDistance)) * 6 });
  }
  const target = PickBest(context, 'Evacuation', candidates);
  if (!target) return null;
  const protectedKeys = [target.key, ...HexNeighborKeys(target.key)].filter((key) => context.hexes[key]);
  const safeKey = context.friendlySourceKeys
    .filter((key) => HexDistanceKeys(key, target.key) >= 2)
    .sort((a, b) => HexDistanceKeys(a, target.key) - HexDistanceKeys(b, target.key) || a.localeCompare(b))[0] || context.units[0]?.key || target.key;
  return MakeObjective(context, 'EvacuateAndDeny', slot, target, {
    protectedKeys,
    safeKey,
    targetKeys: [...protectedKeys, safeKey],
    instructions: ['登记并分批疏散群众', '转移公粮、药品和干部名册', '利用地道与坚壁窖保存基层网络'],
    reach: { distance: HexDistanceKeys(target.unit.key, target.key), horizon: 10 },
  });
}

function ExploitCandidate(context, slot) {
  const debts = new Set(SafeList((context.state.aiMemory || context.state.map?.aiMemory)?.garrisonDebt).map((item) => item.strongholdId));
  const candidates = context.strongholds.map((stronghold) => {
    const max = Math.max(1, Number(stronghold.maxGarrison) || Number(stronghold.garrison) || 1);
    const weakened = debts.has(stronghold.id) || Number(stronghold.garrison) / max < 0.72 || Boolean(context.state.sweep);
    const nearest = NearestUnit(context, stronghold.key, 15);
    if (!weakened || !nearest) return null;
    return { key: stronghold.key, unit: nearest.unit, stronghold, score: 62 + (1 - Number(stronghold.garrison) / max) * 35 + (debts.has(stronghold.id) ? 18 : 0) - nearest.distance };
  });
  const target = PickBest(context, 'Exploit', candidates);
  return target ? MakeObjective(context, 'ExploitWeakness', slot, target, {
    strongholdId: target.stronghold.id,
    targetKeys: [target.key, ...HexNeighborKeys(target.key).filter((key) => context.hexes[key]?.railway || (context.hexes[key]?.road || 0) > 0)],
    instructions: ['确认敌据点守备确已外调', '优先破交通或围困，不以强攻换伤亡', '敌回援前主动脱离'],
    reach: { distance: HexDistanceKeys(target.unit.key, target.key), horizon: 15 },
  }) : null;
}

function CounteroffensiveCandidate(context, slot) {
  const candidates = context.strongholds.map((stronghold) => {
    const nearest = NearestUnit(context, stronghold.key, 24);
    if (!nearest) return null;
    const typeValue = stronghold.type === 'CountySeat' ? 30 : stronghold.type === 'RailStation' ? 15 : 5;
    return { key: stronghold.key, unit: nearest.unit, stronghold, score: 64 + typeValue + (context.hexes[stronghold.key]?.strategicValue || 0) * 10 - nearest.distance };
  });
  const target = PickBest(context, 'Counteroffensive', candidates);
  return target ? MakeObjective(context, 'StrategicCounteroffensive', slot, target, {
    strongholdId: target.stronghold.id,
    targetKeys: [target.key, ...HexNeighborKeys(target.key).filter((key) => context.hexes[key])],
    instructions: ['先接通粮械与伤员后送线', '切断外围据点联系', '条件不足时停止强攻，保存人民与部队'],
    reach: { distance: HexDistanceKeys(target.unit.key, target.key), horizon: 24 },
    historicalBoundary: '任务只影响敌后力量保存与战略贡献，不改写 1945 年日本投降的历史终点。',
  }) : null;
}

function CandidateFor(context, type, slot) {
  return {
    CutRailway: CutRailwayCandidate,
    HoldPass: HoldPassCandidate,
    EstablishSupplyCorridor: CorridorCandidate,
    RescueEncircled: RescueCandidate,
    RaidThenWithdraw: RaidCandidate,
    EvacuateAndDeny: EvacuationCandidate,
    ExploitWeakness: ExploitCandidate,
    StrategicCounteroffensive: CounteroffensiveCandidate,
  }[type]?.(context, slot) || null;
}

function PreferredTypes(context) {
  const preferred = [];
  const flags = context.campaignState?.branchFlags || {};
  // 失败不是一行扣分文本，而是改变后续任务队列：先处理已经造成的战役缺口。
  if (flags.civilianEmergency) preferred.push('EvacuateAndDeny');
  if (flags.supplyCrisis || flags.passLost) preferred.push('EstablishSupplyCorridor', 'HoldPass');
  if (flags.forceDepleted) preferred.push('RescueEncircled', 'EstablishSupplyCorridor');
  if (flags.enemyRailFlow) preferred.push('CutRailway', 'RaidThenWithdraw');
  if (flags.exposureCrisis) preferred.push('EvacuateAndDeny', 'RaidThenWithdraw');
  if (flags.opportunityMissed) preferred.push('RaidThenWithdraw', 'CutRailway');
  if (flags.counteroffensiveDelayed) preferred.push('EstablishSupplyCorridor', 'StrategicCounteroffensive');
  if (context.units.some((unit) => unit.isolated || unit.cutOff || unit.outOfSupply)) preferred.push('RescueEncircled');
  if (context.state?.sweep && Number(context.state.sweep.turnsUntil) <= 2) preferred.push('EvacuateAndDeny', 'ExploitWeakness');
  if (context.units.some((unit) => UnitSupply(context.state, unit) < 0.4)) preferred.push('EstablishSupplyCorridor');
  if (SafeList((context.state.aiMemory || context.state.map?.aiMemory)?.garrisonDebt).length) preferred.push('ExploitWeakness');
  const sequence = eraSequences[context.eraKey] || eraSequences.Opening;
  for (let offset = 0; offset < sequence.length; offset += 1) {
    preferred.push(sequence[(context.turn + offset) % sequence.length]);
  }
  return [...new Set(preferred)];
}

export function CreateCampaignState(state = {}, options = {}) {
  const turn = Clamp(Number(state.turn) || 0, 0, 31);
  return {
    version: campaignVersion,
    seed: Number(options.seed ?? state.seed) >>> 0,
    turn,
    eraKey: state.eraKey || EraKeyForTurn(turn),
    momentum: Clamp(Number(options.momentum) || 0, -6, 6),
    pressure: Math.max(0, Number(options.pressure) || 0),
    branchFlags: { ...(options.branchFlags || {}) },
    activeObjectives: [],
    history: [],
    lastLedger: LedgerSnapshot(state),
  };
}

export function GenerateTurnObjectives(state = {}, campaignState = null, options = {}) {
  const campaign = campaignState || CreateCampaignState(state, options);
  const context = BuildContext(state, campaign);
  const carried = SafeList(campaign.activeObjectives)
    .filter((objective) => objective?.status === 'Active' && objective.deadlineTurn >= context.turn && context.hexes[objective.targetKey])
    .map(ClonePlain);
  const preferred = PreferredTypes(context);
  let primary = carried.find((objective) => objective.slot === 'Primary') || carried[0] || null;
  if (!primary) {
    for (const type of preferred) {
      primary = CandidateFor(context, type, 'Primary');
      if (primary) break;
    }
  }
  let optional = carried.find((objective) => objective.id !== primary?.id) || null;
  if (!optional) {
    const optionalOrder = ['EvacuateAndDeny', 'RaidThenWithdraw', 'HoldPass', 'CutRailway', 'EstablishSupplyCorridor', 'ExploitWeakness'];
    for (const type of optionalOrder) {
      if (type === primary?.type) continue;
      optional = CandidateFor(context, type, 'Optional');
      if (optional) break;
    }
  }
  const objectives = [primary, optional].filter(Boolean);
  return {
    version: campaignVersion,
    turn: context.turn,
    eraKey: context.eraKey,
    primary,
    optional,
    objectives,
    briefing: objectives.length
      ? `${campaignEraDefinitions.find((era) => era.key === context.eraKey)?.name || '战役'}：主任务是“${primary.title}”，另有 ${optional ? `“${optional.title}”` : '无'}可选任务。`
      : '当前态势没有可生成的任务，保持隐蔽并等待情报。',
  };
}

function FindStronghold(state, objective) {
  return SafeList(state?.strongholds).find((item) => item.id === objective.strongholdId || item.key === objective.targetKey) || null;
}

function SignalContains(signals, field, value) {
  const list = SafeList(signals?.[field]);
  return list.includes(value);
}

function SafetyEvaluation(state, objective) {
  const baseline = objective.safety?.ledgerBaseline || {};
  const maximum = objective.safety?.maxIncrease || safetyStrict;
  const current = LedgerSnapshot(state);
  const delta = {};
  const violations = [];
  for (const key of campaignLedgerKeys) {
    delta[key] = Math.max(0, current[key] - (Number(baseline[key]) || 0));
    if (delta[key] > (Number(maximum[key]) || 0)) violations.push(key);
  }
  return { safe: violations.length === 0, delta, violations };
}

function TacticalEvaluation(state, objective) {
  const hexes = MapHexes(state);
  const targetHex = hexes[objective.targetKey];
  const signals = CampaignSignals(state);
  let achieved = false;
  let hardFailure = !targetHex;
  let progress = 0;
  const checks = [];

  if (objective.type === 'CutRailway') {
    achieved = Boolean(targetHex && ((targetHex.railBroken || 0) > (objective.baseline.railBroken || 0)
      || SignalContains(signals, 'sabotagedKeys', objective.targetKey)));
    progress = achieved ? 1 : (SafeList(state.units).some((unit) => unit.key === objective.targetKey) ? 0.45 : 0);
    checks.push({ label: '铁路已中断', met: achieved });
  } else if (objective.type === 'HoldPass') {
    const present = SafeList(state.units).some((unit) => unit.key === objective.targetKey || HexDistanceKeys(unit.key, objective.targetKey) <= 1);
    const held = targetHex && targetHex.control !== 'Enemy';
    achieved = Boolean(held && present && Number(state.turn) >= objective.deadlineTurn);
    progress = (held ? 0.55 : 0) + (present ? 0.35 : 0);
    checks.push({ label: '隘口未失', met: Boolean(held) }, { label: '守备仍在', met: present });
  } else if (objective.type === 'EstablishSupplyCorridor') {
    const keys = SafeList(objective.targetKeys).filter((key) => hexes[key]);
    const friendlyRatio = keys.length ? keys.filter((key) => IsFriendly(hexes[key]) || SignalContains(signals, 'suppliedKeys', key)).length / keys.length : 0;
    const assigned = SafeList(state.units).find((unit) => unit.id === objective.assignedUnitId);
    const supplied = assigned ? UnitSupply(state, assigned) >= 0.45 : true;
    achieved = friendlyRatio >= (objective.requiredFriendlyRatio || 0.68) && supplied;
    progress = Clamp01(friendlyRatio / (objective.requiredFriendlyRatio || 0.68)) * (supplied ? 1 : 0.7);
    checks.push({ label: '走廊连续', met: friendlyRatio >= (objective.requiredFriendlyRatio || 0.68) }, { label: '前沿部队有补给', met: supplied });
  } else if (objective.type === 'RescueEncircled') {
    const unit = SafeList(state.units).find((item) => item.id === objective.targetUnitId);
    hardFailure = !unit || (unit.hp ?? 0) <= 0;
    const relieved = Boolean(unit && !unit.isolated && !unit.cutOff && !unit.outOfSupply && UnitSupply(state, unit) >= 0.4);
    const reachedSafety = Boolean(unit && (unit.key === objective.safeKey || IsFriendly(hexes[unit.key])));
    achieved = relieved && reachedSafety;
    progress = (relieved ? 0.55 : 0) + (reachedSafety ? 0.45 : 0);
    checks.push({ label: '解除孤立', met: relieved }, { label: '进入安全交通网', met: reachedSafety });
  } else if (objective.type === 'RaidThenWithdraw') {
    const unit = SafeList(state.units).find((item) => item.id === objective.assignedUnitId);
    hardFailure = !unit || (unit.hp ?? 0) <= 0;
    const disrupted = Boolean(targetHex && ((targetHex.railBroken || 0) > (objective.baseline.railBroken || 0)
      || Number(state.sabotageTotal) > Number(objective.baseline.sabotageTotal)
      || SignalContains(signals, 'sabotagedKeys', objective.targetKey)));
    const withdrew = Boolean(unit && unit.key !== objective.targetKey
      && (unit.hidden || SafeList(objective.escapeKeys).includes(unit.key) || SignalContains(signals, 'withdrawnUnitIds', unit.id)));
    achieved = disrupted && withdrew;
    progress = (disrupted ? 0.55 : 0) + (withdrew ? 0.45 : 0);
    checks.push({ label: '破袭成功', met: disrupted }, { label: '已脱离接触', met: withdrew });
  } else if (objective.type === 'EvacuateAndDeny') {
    const protectedKeys = SafeList(objective.protectedKeys);
    const prepared = protectedKeys.filter((key) => {
      const hex = hexes[key];
      const works = SafeList(hex?.works).join(' ');
      return hex?.evacuated || /Tunnel|Shelter|Granary|Cache|Cellar/.test(works) || SignalContains(signals, 'evacuatedKeys', key);
    }).length;
    const ratio = protectedKeys.length ? prepared / protectedKeys.length : 0;
    achieved = ratio >= 0.5;
    progress = Clamp01(ratio / 0.5);
    checks.push({ label: '至少半数受威胁村庄完成疏散或坚壁', met: achieved });
  } else if (objective.type === 'ExploitWeakness') {
    const stronghold = FindStronghold(state, objective);
    achieved = !stronghold || stronghold.destroyed || (stronghold.garrison ?? 0) <= Math.max(0, (objective.baseline.garrison || 0) * 0.65)
      || SafeList(objective.targetKeys).some((key) => (hexes[key]?.railBroken || 0) > 0);
    progress = achieved ? 1 : Clamp01(1 - (Number(stronghold?.garrison) || 0) / Math.max(1, objective.baseline.garrison || 1));
    checks.push({ label: '薄弱据点或后方交通受到实质打击', met: achieved });
  } else if (objective.type === 'StrategicCounteroffensive') {
    const stronghold = FindStronghold(state, objective);
    achieved = !stronghold || stronghold.destroyed || (stronghold.garrison ?? 0) <= 0 || IsFriendly(targetHex);
    progress = achieved ? 1 : Clamp01(1 - (Number(stronghold?.garrison) || 0) / Math.max(1, objective.baseline.garrison || 1));
    checks.push({ label: '战略据点失去敌军守备', met: achieved });
  }
  return { achieved, hardFailure, progress: Clamp01(progress), checks };
}

export function EvaluateObjectives(state = {}, objectivesOrPlan = [], options = {}) {
  const objectives = Array.isArray(objectivesOrPlan)
    ? objectivesOrPlan
    : SafeList(objectivesOrPlan?.objectives || objectivesOrPlan?.activeObjectives);
  const turn = Number(state.turn) || 0;
  const evaluations = objectives.map((objective) => {
    const safety = SafetyEvaluation(state, objective);
    const tactical = TacticalEvaluation(state, objective);
    const expired = turn >= objective.deadlineTurn;
    let status = 'Active';
    if (tactical.achieved && safety.safe) status = 'Success';
    else if (tactical.hardFailure || expired) status = 'Failed';
    else if (tactical.achieved && !safety.safe) status = 'Compromised';
    return {
      objectiveId: objective.id,
      type: objective.type,
      slot: objective.slot,
      status,
      progress: Number(tactical.progress.toFixed(3)),
      checks: tactical.checks,
      safety,
      outcome: status === 'Success' ? ClonePlain(objective.success)
        : (status === 'Failed' ? ClonePlain(objective.failure) : null),
      // 明确留空：任务层永不直接发资源/分数，也不回减 ledger。
      stockDelta: null,
      scoreDelta: null,
      ledgerDelta: null,
    };
  });
  return {
    turn,
    evaluations,
    allTerminal: evaluations.every((item) => item.status === 'Success' || item.status === 'Failed'),
    primary: evaluations.find((item) => item.slot === 'Primary') || evaluations[0] || null,
    options: { ...options },
  };
}

export function AdvanceCampaign(state = {}, campaignState = null, objectivesOrEvaluation = null, options = {}) {
  const campaign = ClonePlain(campaignState || CreateCampaignState(state, options));
  const sourceObjectives = Array.isArray(objectivesOrEvaluation)
    ? objectivesOrEvaluation
    : SafeList(objectivesOrEvaluation?.objectives || campaign.activeObjectives);
  const evaluated = objectivesOrEvaluation?.evaluations
    ? ClonePlain(objectivesOrEvaluation)
    : EvaluateObjectives(state, sourceObjectives, options);
  const byId = new Map(sourceObjectives.map((objective) => [objective.id, objective]));
  const activeObjectives = [];
  for (const result of evaluated.evaluations) {
    const objective = byId.get(result.objectiveId);
    if (result.status === 'Active' || result.status === 'Compromised') {
      if (objective) activeObjectives.push({ ...ClonePlain(objective), status: 'Active' });
      continue;
    }
    const effects = result.outcome?.campaignEffects || {};
    campaign.momentum = Clamp((Number(campaign.momentum) || 0) + (Number(effects.momentumDelta) || 0), -6, 6);
    campaign.pressure = Math.max(0, (Number(campaign.pressure) || 0) + (Number(effects.pressureDelta) || 0));
    if (result.status === 'Failed' && objective?.failure?.branchFlag) {
      campaign.branchFlags[objective.failure.branchFlag] = {
        sinceTurn: Number(state.turn) || 0,
        sourceObjectiveId: objective.id,
      };
    }
    campaign.history.push({
      turn: Number(state.turn) || 0,
      objective: ClonePlain(objective),
      result: ClonePlain(result),
    });
  }
  campaign.history = campaign.history.slice(-64);
  campaign.activeObjectives = activeObjectives;
  campaign.turn = Clamp(Number(state.turn) || 0, 0, 31);
  campaign.eraKey = state.eraKey || EraKeyForTurn(campaign.turn);
  campaign.lastLedger = LedgerSnapshot(state);
  return campaign;
}

export function GetObjectivePreview(state = {}, objective = null, campaignState = null) {
  if (!objective) return null;
  const evaluation = EvaluateObjectives(state, [objective]).evaluations[0];
  const hex = MapHexes(state)[objective.targetKey];
  const remaining = Math.max(0, objective.deadlineTurn - (Number(state.turn) || 0));
  return {
    id: objective.id,
    type: objective.type,
    slot: objective.slot,
    title: objective.title,
    summary: objective.summary,
    targetKey: objective.targetKey,
    targetLabel: hex?.siteName || hex?.feature || hex?.terrain || '待定地域',
    status: evaluation.status,
    progress: evaluation.progress,
    progressLabel: `${Math.round(evaluation.progress * 100)}%`,
    deadlineLabel: remaining > 0 ? `剩余 ${remaining} 回合` : '本回合结算',
    checks: evaluation.checks,
    instructions: SafeList(objective.instructions),
    safetyLabel: evaluation.safety.safe
      ? '人民安全约束尚未触发'
      : `人民安全约束受损：${evaluation.safety.violations.join('、')}`,
    failureLabel: objective.failure?.label || '',
    historicalBoundary: objective.historicalBoundary || null,
    momentum: Number(campaignState?.momentum) || 0,
  };
}

export const campaignModuleInfo = Object.freeze({
  name: 'Data_Campaign',
  version: campaignVersion,
  deterministic: true,
  mutatesGameState: false,
});
