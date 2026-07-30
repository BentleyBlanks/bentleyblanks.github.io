import assert from "node:assert/strict";
import * as Supply from "./Script_Supply.mjs";

function Hex(key, patch = {}) {
  const [q, r] = key.split(",").map(Number);
  return {
    key, q, r, control: "Base", massBase: 70, road: 2, railway: false,
    railBroken: 0, supplyThroughput: 4, transportConnections: [], ...patch,
  };
}

function State() {
  const order = ["0,0", "1,0", "2,0", "3,0", "4,0"];
  const hexes = Object.fromEntries(order.map((key) => [key, Hex(key)]));
  hexes["4,0"].control = "Enemy";
  return {
    turn: 0,
    map: {
      order,
      hexes,
      supplyNodes: [
        { key: "0,0", camp: "Resistance", kind: "FieldHeadquarters", capacity: 8, isSource: true, relayOnly: false },
        { key: "2,0", camp: "Resistance", kind: "Village", capacity: 5, isSource: false, relayOnly: true },
        { key: "4,0", camp: "Enemy", kind: "RailDepot", capacity: 8, isPrimary: true, isSource: true, relayOnly: false },
      ],
      transportEdges: [],
      transportCorridors: [{ id: "Road", keys: order, kind: "Road" }],
      frontLines: [{ a: "3,0", b: "4,0", camps: ["Resistance", "Enemy"] }],
    },
    bases: [{ id: "b1", key: "0,0", tier: 1, name: "西村根据地" }],
    strongholds: [{ id: "s1", key: "4,0", garrison: 4, supply: 100, name: "东端据点" }],
    units: [{ id: "u1", key: "2,0", hp: 10, fatigue: 0, supply: 100 }],
    enemies: [{ id: "e1", key: "4,0", hp: 10, fatigue: 0, supply: 100, side: "Enemy" }],
  };
}

{
  const state = State();
  const snapshot = JSON.stringify(state);
  const ours = Supply.ComputeSupplyNetwork(state, "Resistance");
  const theirs = Supply.ComputeSupplyNetwork(state, "Enemy");
  assert.ok(ours.throughputByKey["2,0"] > 0, "道路未传递我方补给");
  assert.ok(theirs.throughputByKey["4,0"] > 0, "敌据点未成为敌军补给源");
  assert.equal(ours.sourceKeys.length, 1, "接力村庄不应成为独立补给源");
  assert.equal(JSON.stringify(state), snapshot, "纯函数修改了输入");
}

{
  let state = State();
  state.enemies.push({ id: "cut", key: "1,0", hp: 8, side: "Enemy" });
  state.map.hexes["1,0"].control = "Enemy";
  for (let turn = 0; turn < 3; turn += 1) {
    state = Supply.RecalculateSupply(state, { advance: true }).nextState;
  }
  const cut = state.units[0];
  assert.equal(cut.supplyState, "Isolated", "敌控制与 ZOC 未切断补给");
  assert.equal(cut.isolationTurns, 3, "孤立回合未累积");
  assert.ok(cut.supply <= 40 && cut.fatigue >= 30, "孤立未消耗库存并增加疲劳");

  state.enemies = state.enemies.filter((unit) => unit.id !== "cut");
  state.map.hexes["1,0"].control = "Base";
  const firstReconnect = Supply.RecalculateSupply(state, { advance: true }).nextState;
  assert.notEqual(firstReconnect.units[0].supplyState, "Sustained", "重连后一回合瞬间满补给");
  state = firstReconnect;
  for (let turn = 0; turn < 7; turn += 1) {
    state = Supply.RecalculateSupply(state, { advance: true }).nextState;
  }
  assert.equal(state.units[0].supplyState, "Sustained", "重连后未逐步恢复");
  assert.equal(state.units[0].isolationTurns, 0, "重连后孤立计数未消退");
}

{
  const state = State();
  state.map.hexes["1,0"].railway = true;
  state.map.hexes["2,0"].railway = true;
  const clear = Supply.ComputeSupplyNetwork(state, "Resistance").throughputByKey["2,0"];
  state.map.hexes["1,0"].railBroken = 2;
  const broken = Supply.ComputeSupplyNetwork(state, "Resistance").throughputByKey["2,0"];
  assert.ok(broken < clear, "破轨未降低吞吐");
}

console.log("Supply tests passed: bilateral routes, ZOC cut, attrition, progressive reconnection.");
