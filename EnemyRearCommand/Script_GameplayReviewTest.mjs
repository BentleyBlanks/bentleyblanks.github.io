import assert from "node:assert/strict";
import { HexDistanceKeys, HexLine, ParseHexKey } from "./Script_Hex.mjs";
import * as Ai from "./Script_Ai.mjs";
import * as Combat from "./Script_Combat.mjs";
import * as Rules from "./Script_Rules.mjs";
import * as Supply from "./Script_Supply.mjs";

const seeds = [11, 22, 33, 44, 55, 20260730];

for (const seed of seeds) {
  const state = Rules.CreateInitialState({ seed, difficulty: "Normal" });
  assert.ok(state.enemies.length >= 6 && state.enemies.length <= 8, `seed ${seed}: 机动敌军数量 ${state.enemies.length}`);
  assert.ok(state.enemies.every((enemy) => enemy.homeStrongholdId), `seed ${seed}: 敌军缺少归建据点`);
  const visible = state.enemies.filter((enemy) => enemy.visibleToPlayer);
  assert.ok(visible.length >= 1 && visible.length <= 2, `seed ${seed}: 开局可见敌军 ${visible.length}`);
  const opening = state.enemies.find((enemy) => enemy.openingContact);
  assert.ok(opening, `seed ${seed}: 缺少暴露巡逻队`);
  const attacker = state.units.find((unit) => HexDistanceKeys(unit.key, opening.key) === 1);
  assert.ok(attacker, `seed ${seed}: 暴露巡逻队不可立即接敌`);
  const forecast = Combat.ForecastAttack(state, attacker.id, opening.key);
  assert.equal(forecast.valid, true, `seed ${seed}: 首回合攻击预判无效`);
  assert.ok(
    forecast.trueOdds >= 0.42 && forecast.expectedLoss <= attacker.maxHp * 0.55,
    `seed ${seed}: 首战仍是自杀攻击（odds ${forecast.trueOdds}, loss ${forecast.expectedLoss}/${attacker.maxHp}）`,
  );
  const enemySources = Supply.CollectSupplySources(state, "Enemy");
  assert.ok(enemySources.length >= 1 && enemySources.length <= 2, `seed ${seed}: 敌补给源 ${enemySources.length}`);
  assert.ok(state.map.frontLines.every((edge) => edge.fromKey && edge.toKey && edge.keys?.length === 2));
}

// Front consequence: an unsupported thrust pays exposure and loses throughput;
// organizing a continuous corridor reshapes the front and sustains the same unit.
{
  const state = Rules.CreateInitialState({ seed: 424242, difficulty: "Normal" });
  const target = state.map.order
    .map((key) => ({ key, distance: HexDistanceKeys(state.startKey, key) }))
    .filter((entry) => entry.distance >= 8 && entry.distance <= 20)
    .filter((entry) => !["Base", "Guerrilla"].includes(state.map.hexes[entry.key]?.control))
    .filter((entry) => !state.strongholds.some((item) => item.key === entry.key))
    .map((entry) => ({
      ...entry,
      path: HexLine(ParseHexKey(state.startKey), ParseHexKey(entry.key)).map((cell) => `${cell.q},${cell.r}`),
    }))
    .find((entry) => entry.path.every((key) => state.map.hexes[key]));
  assert.ok(target, "未找到可测试的纵深推进走廊");

  const deep = Rules.CloneState(state);
  const deepExposure = Rules.GetAdvanceExposure(deep, deep.units[0], target.key);
  deep.units[0].key = target.key;
  Rules.RecomputeSupply(deep, false);
  const deepThroughput = deep.units[0].supplyThroughput;

  const steady = Rules.CloneState(state);
  const frontBefore = steady.map.frontLines.map((edge) => edge.id).sort().join("|");
  for (const stronghold of steady.strongholds) {
    if (target.path.includes(stronghold.key)) stronghold.garrison = 0;
  }
  for (const key of target.path) {
    steady.map.hexes[key].massBase = Math.max(40, steady.map.hexes[key].massBase ?? 0);
  }
  Rules.RecomputeMassAndControl(steady);
  const steadyExposure = Rules.GetAdvanceExposure(steady, steady.units[0], target.key);
  steady.units[0].key = target.key;
  Rules.RecomputeSupply(steady, false);
  const steadyThroughput = steady.units[0].supplyThroughput;
  const frontAfter = steady.map.frontLines.map((edge) => edge.id).sort().join("|");
  assert.ok(deepExposure.delta > steadyExposure.delta, "孤军深入与稳步拓展没有暴露度差异");
  assert.ok(
    steadyThroughput > deepThroughput + 0.5 || (deepThroughput < 0.7 && steadyThroughput >= 1.2),
    `控制走廊未改善补给：${deepThroughput} → ${steadyThroughput}`,
  );
  assert.notEqual(frontAfter, frontBefore, "控制权推进后战线形状未改变");

  const gapKey = state.map.order.find((key) => {
    const hex = state.map.hexes[key];
    if (!hex || (!hex.railway && (hex.road ?? 0) < 1) || state.strongholds.some((item) => item.key === key)) return false;
    return state.strongholds.some((item) => HexDistanceKeys(item.key, key) <= 5);
  });
  assert.ok(gapKey, "未找到可测试的敌交通线缺口");
  const gapState = Rules.CloneState(state);
  gapState.map.hexes[gapKey].massBase = 45;
  Rules.RecomputeMassAndControl(gapState);
  assert.ok(Ai.AnalyzeEnemyNetwork(gapState).gaps.some((gap) => gap.key === gapKey), "战线楔入交通线后 AI 未识别缺口");
  console.log(`Front probe ${target.key}: deep ${deepThroughput.toFixed(2)}/${deepExposure.delta} → steady ${steadyThroughput.toFixed(2)}/${steadyExposure.delta}`);
}

// Real-map corridor interdiction: find the strongest one-hex cut against an actual
// deployed enemy formation. The cut must matter immediately, then recover gradually.
{
  const state = Rules.CreateInitialState({ seed: 20260730, difficulty: "Normal" });
  const before = Supply.ComputeSupplyNetwork(state, "Enemy");
  let best = null;
  for (const enemy of state.enemies) {
    const baseThroughput = before.throughputByKey[enemy.key] ?? 0;
    if (baseThroughput < 0.7) continue;
    const route = [];
    const seen = new Set();
    let cursor = enemy.key;
    while (cursor && !seen.has(cursor) && route.length < 128) {
      route.push(cursor);
      seen.add(cursor);
      cursor = before.predecessorByKey[cursor] ?? null;
    }
    for (const cutKey of route.slice(1, -1)) {
      if (state.units.some((unit) => unit.key === cutKey)) continue;
      const cutState = Rules.CloneState(state);
      cutState.map.hexes[cutKey].control = "Base";
      cutState.map.hexes[cutKey].railBroken = Math.max(3, cutState.map.hexes[cutKey].railBroken ?? 0);
      cutState.map.hexes[cutKey].roadBroken = Math.max(3, cutState.map.hexes[cutKey].roadBroken ?? 0);
      cutState.units.push({ id: "u_corridor_cut", key: cutKey, hp: 60, maxHp: 60, type: "GuerrillaSquad", moves: 0 });
      const after = Supply.ComputeSupplyNetwork(cutState, "Enemy");
      const cutThroughput = after.throughputByKey[enemy.key] ?? 0;
      const loss = baseThroughput - cutThroughput;
      if (!best || loss > best.loss) best = { enemy, cutKey, baseThroughput, cutThroughput, loss, cutState };
    }
  }
  assert.ok(best, "实地图未找到可测试的敌军补给路线");
  assert.ok(
    best.cutThroughput < 0.7 || best.cutThroughput <= best.baseThroughput * 0.45,
    `单点破交不具实质影响：${best.baseThroughput.toFixed(2)} → ${best.cutThroughput.toFixed(2)}`,
  );

  let cutState = best.cutState;
  for (let turn = 0; turn < 3; turn += 1) cutState = Supply.RecalculateSupply(cutState, { advance: true }).nextState;
  const cutUnit = cutState.enemies.find((enemy) => enemy.id === best.enemy.id);
  assert.ok(["Low", "Isolated"].includes(cutUnit.supplyState), `破交三回合后仍为 ${cutUnit.supplyState}`);

  cutState.units = cutState.units.filter((unit) => unit.id !== "u_corridor_cut");
  const originalHex = state.map.hexes[best.cutKey];
  cutState.map.hexes[best.cutKey].control = originalHex.control;
  cutState.map.hexes[best.cutKey].railBroken = originalHex.railBroken ?? 0;
  cutState.map.hexes[best.cutKey].roadBroken = originalHex.roadBroken ?? 0;
  let restored = Supply.RecalculateSupply(cutState, { advance: true }).nextState;
  const firstReconnect = restored.enemies.find((enemy) => enemy.id === best.enemy.id);
  console.log(`Reconnect probe ${best.enemy.id}: cut ${cutUnit.supplyState}/${cutUnit.supply} -> first ${firstReconnect.supplyState}/${firstReconnect.supply}`);
  assert.notEqual(firstReconnect.supplyState, "Sustained", "交通恢复后一回合瞬间满补给");
  for (let turn = 0; turn < 4; turn += 1) restored = Supply.RecalculateSupply(restored, { advance: true }).nextState;
  const recovered = restored.enemies.find((enemy) => enemy.id === best.enemy.id);
  assert.equal(recovered.supplyState, "Sustained", "交通恢复后未逐步恢复补给");
  console.log(
    `Real-map cut ${best.cutKey}: ${best.baseThroughput.toFixed(2)} → ${best.cutThroughput.toFixed(2)} → restored ${recovered.supplyThroughput.toFixed(2)}`,
  );
}

console.log(`Gameplay review tests passed across ${seeds.length} opening seeds.`);
