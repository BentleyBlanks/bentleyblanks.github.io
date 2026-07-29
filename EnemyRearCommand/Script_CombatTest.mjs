import assert from "node:assert/strict";
import { HexNeighborKeys } from "./Script_Hex.mjs";
import {
  AnalyzeBattlefield,
  ComputeStrength,
  ForecastAttack,
  ResolveAttack,
  ResolveUnitStats,
  TickCombatRecovery,
} from "./Script_Combat.mjs";

function MakeHex(key) {
  return {
    key,
    terrain: "Plain",
    control: "Neutral",
    massBase: 45,
    intel: 100,
    road: 0,
    railway: false,
    feature: null,
    works: [],
  };
}

function MakeState(withSupport = true) {
  const targetKey = "0,0";
  const neighbours = HexNeighborKeys(targetKey);
  const allKeys = new Set([targetKey, ...neighbours]);
  for (const key of neighbours) {
    for (const adjacent of HexNeighborKeys(key)) allKeys.add(adjacent);
  }
  const hexes = Object.fromEntries([...allKeys].map((key) => [key, MakeHex(key)]));
  hexes[targetKey] = { ...hexes[targetKey], control: "Enemy", road: 1 };
  const attacker = {
    id: "u_attack",
    key: neighbours[0],
    type: "MainForceCompany",
    hp: 132,
    maxHp: 132,
    moves: 3,
    maxMoves: 3,
    hidden: false,
    fatigue: 12,
    suppression: 0,
    level: 1,
    xp: 0,
  };
  const support = {
    id: "u_support",
    key: neighbours[3],
    type: "DistrictSquad",
    hp: 86,
    maxHp: 86,
    moves: 3,
    maxMoves: 3,
    hidden: true,
    fatigue: 5,
    suppression: 0,
    level: 1,
    xp: 0,
  };
  return {
    seed: 20260730,
    rngState: 0x13579bdf,
    turn: 7,
    phaseKey: "Day",
    alert: 25,
    exposure: 10,
    stock: { grain: 80, ordnance: 80, medicine: 20, intel: 50, labor: 0, cadre: 0 },
    ledger: { civilianDeaths: 0, displaced: 0, villagesBurned: 0, cadreLost: 0, grainSeized: 0 },
    map: { hexes },
    units: withSupport ? [attacker, support] : [attacker],
    enemies: [{
      id: "e_target",
      key: targetKey,
      type: "PuppetGarrison",
      hp: 92,
      maxHp: 92,
      moves: 2,
      maxMoves: 2,
      visibleToPlayer: true,
      suppression: 0,
    }],
    strongholds: [],
    log: [],
  };
}

const singleState = MakeState(false);
const coordinatedState = MakeState(true);
const singleForecast = ForecastAttack(singleState, "u_attack", "0,0");
const coordinatedForecast = ForecastAttack(coordinatedState, "u_attack", "0,0");

assert.equal(singleForecast.valid, true);
assert.equal(coordinatedForecast.valid, true);
assert.equal(coordinatedForecast.forecast.phases.length, 3, "预览必须明确火力、突击、追击/脱离三阶段");
assert.equal(coordinatedForecast.forecast.coordination.flanked, true, "对向攻击轴线应形成夹击");
assert.equal(coordinatedForecast.forecast.containment.encircled, false, "两支单位不应凭普通 ZOC 自动封死六条退路");
assert.equal(coordinatedForecast.forecast.containment.partiallyEncircled, true, "两轴夹击应形成半包围与争夺退路");
assert.ok(
  coordinatedForecast.trueOdds > singleForecast.trueOdds,
  `协同夹击胜率 ${coordinatedForecast.trueOdds} 未高于单路 ${singleForecast.trueOdds}`,
);

const fordState = MakeState(true);
fordState.map.hexes["0,0"] = {
  ...fordState.map.hexes["0,0"], terrain: "River", feature: "Ford",
  crossingPenalty: 0, attackModifier: 0.55, artilleryModifier: 0.8, frontage: 1, chokeValue: 1,
};
const riverState = JSON.parse(JSON.stringify(fordState));
riverState.map.hexes["0,0"].feature = null;
riverState.map.hexes["0,0"].crossingPenalty = 2;
const fordForecast = ForecastAttack(fordState, "u_attack", "0,0");
const riverForecast = ForecastAttack(riverState, "u_attack", "0,0");
assert.ok(riverForecast.trueOdds < fordForecast.trueOdds - 0.04, `无渡口过河未显著变难：${riverForecast.trueOdds} vs ${fordForecast.trueOdds}`);
assert.ok(riverForecast.risks.some((risk) => risk.key === "Crossing"), "渡河风险未进入预判");

const hillState = MakeState(true);
hillState.enemies[0] = {
  ...hillState.enemies[0], type: "JapaneseInfantryCompany", hp: 150, maxHp: 150,
};
hillState.map.hexes["0,0"] = {
  ...hillState.map.hexes["0,0"], terrain: "Hill", feature: null,
  crossingPenalty: 0, attackModifier: 0.84, artilleryModifier: 0.82, frontage: 2, chokeValue: 0,
};
const passState = JSON.parse(JSON.stringify(hillState));
passState.map.hexes["0,0"].feature = "Pass";
passState.map.hexes["0,0"].frontage = 1;
passState.map.hexes["0,0"].chokeValue = 1;
const hillForecast = ForecastAttack(hillState, "u_attack", "0,0");
const passForecast = ForecastAttack(passState, "u_attack", "0,0");
assert.ok(passForecast.trueOdds < hillForecast.trueOdds - 0.04, `关隘未显著限制进攻：${passForecast.trueOdds} vs ${hillForecast.trueOdds}`);
assert.ok(passForecast.forecast.phases[1].attacker < hillForecast.forecast.phases[1].attacker, "狭窄正面未降低协同突击值");
assert.ok(passForecast.risks.some((risk) => risk.key === "Choke"), "关隘风险未进入预判");

const analysis = AnalyzeBattlefield(
  coordinatedState,
  coordinatedState.units[0],
  coordinatedState.enemies[0],
);
assert.equal(analysis.axisCount, 2);
assert.equal(analysis.escapeRoutes.length, 0);
assert.ok(analysis.contestedRoutes.length > 0, "单层 ZOC 应留下可争夺退路");

const fullPocketState = MakeState(false);
const pocketNeighbours = HexNeighborKeys("0,0");
const supportTemplate = MakeState(true).units[1];
fullPocketState.units.push(
  { ...supportTemplate, id: "u_axis_2", key: pocketNeighbours[2] },
  { ...supportTemplate, id: "u_axis_3", key: pocketNeighbours[4] },
);
fullPocketState.enemies[0] = {
  ...fullPocketState.enemies[0], type: "JapaneseInfantryCompany", hp: 150, maxHp: 150,
};
const fullPocket = AnalyzeBattlefield(fullPocketState, fullPocketState.units[0], fullPocketState.enemies[0]);
assert.equal(fullPocket.axisCount, 3, "完整包围必须至少形成三条真实轴线");
assert.equal(fullPocket.encircled, true, "三轴交替占位与重叠 ZOC 未闭合包围圈");
assert.equal(fullPocket.escapeRoutes.length, 0);
assert.equal(fullPocket.contestedRoutes.length, 0);
assert.ok(fullPocket.breachRoutes.length > 0, "完整包围仍应标出可尝试突围的争夺缺口");
const fullPocketForecast = ForecastAttack(fullPocketState, "u_attack", "0,0");
assert.ok(fullPocketForecast.forecast.containment.breakoutChance > 0, "被围方没有可解释的突围概率");

const relievedPocketState = JSON.parse(JSON.stringify(fullPocketState));
relievedPocketState.units = relievedPocketState.units.filter((unit) => unit.id !== "u_axis_3");
const relievedPocket = AnalyzeBattlefield(relievedPocketState, relievedPocketState.units[0], relievedPocketState.enemies[0]);
assert.equal(relievedPocket.encircled, false, "救援移开一条轴线后包围仍未解除");
assert.ok(relievedPocket.escapeRoutes.length + relievedPocket.contestedRoutes.length > 0, "救援未重开安全或争夺退路");

let breakoutObserved = false;
for (let index = 0; index < 180 && !breakoutObserved; index += 1) {
  const sample = JSON.parse(JSON.stringify(fullPocketState));
  sample.rngState = (0x2468ace1 + Math.imul(index + 1, 0x9e3779b1)) >>> 0;
  breakoutObserved = ResolveAttack(sample, "u_attack", "0,0").report.containment.brokeOut === true;
}
assert.equal(breakoutObserved, true, "确定性样本中从未出现过争夺缺口突围");

const suppliedUnit = { ...singleState.units[0], supply: 100 };
const cutOffUnit = { ...singleState.units[0], supply: 0, cutOff: true };
const unitStats = ResolveUnitStats(suppliedUnit.type);
const suppliedStrength = ComputeStrength(singleState, suppliedUnit, singleState.map.hexes[suppliedUnit.key], { role: "Attack" });
const cutOffStrength = ComputeStrength(singleState, cutOffUnit, singleState.map.hexes[cutOffUnit.key], { role: "Attack" });
assert.ok(cutOffStrength < suppliedStrength * 0.7, "断补给必须显著削弱战力");

const immutableBefore = JSON.stringify(coordinatedState);
const outcomeA = ResolveAttack(coordinatedState, "u_attack", "0,0");
assert.equal(JSON.stringify(coordinatedState), immutableBefore, "ResolveAttack 不得修改传入 state");
const outcomeB = ResolveAttack(JSON.parse(immutableBefore), "u_attack", "0,0");
assert.deepEqual(outcomeA, outcomeB, "同一 state / rngState 的结算必须完全确定");
assert.ok(outcomeA.report.suppression.theirs > 0, "交火必须产生可读的压制反馈");
assert.equal(outcomeA.report.coordination.flanked, true);
assert.equal(outcomeA.report.containment.encircled, false);
const committedSupport = outcomeA.nextState.units.find((unit) => unit.id === "u_support");
assert.equal(committedSupport.combat.lastSupportTurn, coordinatedState.turn, "支援单位未记入本回合协同承诺");
assert.equal(committedSupport.moves, coordinatedState.units[1].moves - 1, "支援单位未消耗机动点");
const secondAnalysis = AnalyzeBattlefield(
  outcomeA.nextState,
  outcomeA.nextState.units.find((unit) => unit.id === "u_attack"),
  outcomeA.nextState.enemies[0] ?? coordinatedState.enemies[0],
);
assert.equal(secondAnalysis.supportUnits.some((unit) => unit.id === "u_support"), false, "同一支援单位一回合内重复提供加成");
assert.deepEqual(outcomeA.report.ledgerDelta, {
  civilianDeaths: 0,
  displaced: 0,
  villagesBurned: 0,
  cadreLost: 0,
  grainSeized: 0,
}, "无村庄交火不得制造人民代价，代价更不得转化成奖励");

const calibrationState = MakeState(false);
const calibrationForecast = ForecastAttack(calibrationState, "u_attack", "0,0");
let damageCovered = 0;
let lossCovered = 0;
const samples = 120;
for (let index = 0; index < samples; index += 1) {
  const sample = JSON.parse(JSON.stringify(calibrationState));
  sample.rngState = (0x13579bdf + Math.imul(index + 1, 0x9e3779b1)) >>> 0;
  const outcome = ResolveAttack(sample, "u_attack", "0,0");
  const damage = outcome.report.casualties.theirs;
  const loss = outcome.report.casualties.ours;
  const damageRange = calibrationForecast.forecast.outcome.damageRange;
  const lossRange = calibrationForecast.forecast.outcome.lossRange;
  if (damage >= damageRange.min - 0.11 && damage <= damageRange.max + 0.11) damageCovered += 1;
  if (loss >= lossRange.min - 0.11 && loss <= lossRange.max + 0.11) lossCovered += 1;
}
assert.ok(damageCovered / samples >= 0.7, `敌伤预判覆盖仅 ${(damageCovered / samples * 100).toFixed(1)}%`);
assert.ok(lossCovered / samples >= 0.7, `己损预判覆盖仅 ${(lossCovered / samples * 100).toFixed(1)}%`);

const recovered = TickCombatRecovery(outcomeA.nextState);
const foughtUnit = outcomeA.nextState.units.find((unit) => unit.id === "u_attack");
const recoveredUnit = recovered.units.find((unit) => unit.id === "u_attack");
assert.ok((recoveredUnit.suppression || 0) < (foughtUnit.suppression || 0), "休整必须降低压制");

console.log(
  `Combat test passed · single ${singleForecast.trueOdds.toFixed(2)} → coordinated ${coordinatedForecast.trueOdds.toFixed(2)}` +
    ` · river ${riverForecast.trueOdds.toFixed(2)} / ford ${fordForecast.trueOdds.toFixed(2)}` +
    ` · pass ${passForecast.trueOdds.toFixed(2)} / hill ${hillForecast.trueOdds.toFixed(2)}` +
    ` · forecast coverage damage ${damageCovered}/${samples}, loss ${lossCovered}/${samples}` +
    ` · supply strength ${suppliedStrength.toFixed(1)} → cut off ${cutOffStrength.toFixed(1)}`,
);
