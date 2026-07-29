// 《燎原 · 敌后1937》 —— 冒烟测试。退出码即成败。
//
// 覆盖：坐标契约、地图生成、规则内核、战斗、AI、数据完整性、存档、终局评级闸门、
// 策略排序（会玩 > 消极 > 莽撞）、表现层模块的结构与副作用约束、页面装配完整性。
//
// 运行： node PrairieFire1937/Script_SmokeTest.mjs

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

import {
  HexKey,
  ParseHexKey,
  HexDistance,
  HexDistanceKeys,
  HexNeighborKeys,
  HexesInRange,
  HexRing,
  HexToWorld,
  WorldToHex,
  CreateRng,
  StepRng,
  Clamp,
  FractalNoise2D,
} from "./Script_Hex.mjs";

import * as Rules from "./Script_Rules.mjs";
import * as MapGen from "./Script_MapGen.mjs";
import * as Combat from "./Script_Combat.mjs";
import * as Ai from "./Script_Ai.mjs";
import * as DataTerrain from "./Data_Terrain.mjs";
import * as DataTech from "./Data_Tech.mjs";
import * as DataUnits from "./Data_Units.mjs";
import * as DataHistory from "./Data_History.mjs";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const results = [];
let failures = 0;

/**
 * 同步测试执行器。注意：回调必须是同步函数——异步回调会返回 Promise 而不抛异常，
 * 从而被误判为通过。因此所有需要读文件的用例，一律在下面预读到 sources 里再断言。
 */
function Test(name, callback) {
  try {
    const outcome = callback();
    assert.ok(
      !(outcome && typeof outcome.then === "function"),
      "测试回调不得为 async：异步断言不会被捕获，请改为同步断言预读的内容",
    );
    results.push({ name, passed: true });
    console.log(`  ✓ ${name}`);
  } catch (error) {
    failures += 1;
    results.push({ name, passed: false, error });
    console.error(`  ✗ ${name}`);
    console.error(`      ${error?.message ?? error}`);
  }
}

function Section(title) {
  console.log(`\n${title}`);
}

/** 预读全部需要做文本断言的文件（缺失记为 null，由对应用例报错）。 */
const sourceFiles = [
  "index.html",
  "Style_Game.css",
  "Script_Renderer.mjs",
  "Script_Materials.mjs",
  "Script_Effects.mjs",
  "Script_Models.mjs",
  "Script_Ui.mjs",
  "Script_Audio.mjs",
  "Script_Main.mjs",
  "vendor/three/build/three.module.mjs",
  "vendor/three/examples/jsm/controls/OrbitControls.mjs",
  "vendor/three/examples/jsm/postprocessing/EffectComposer.mjs",
  "vendor/three/examples/jsm/postprocessing/RenderPass.mjs",
  "vendor/three/examples/jsm/postprocessing/ShaderPass.mjs",
  "vendor/three/examples/jsm/postprocessing/OutputPass.mjs",
  "vendor/three/examples/jsm/utils/BufferGeometryUtils.mjs",
  "vendor/three/examples/jsm/csm/CSM.mjs",
];
const sources = {};
for (const name of sourceFiles) {
  sources[name] = await readFile(path.join(scriptDirectory, name), "utf8").catch(() => null);
}
const projectFiles = await (await import("node:fs/promises")).readdir(scriptDirectory, { withFileTypes: true });

function Source(name) {
  assert.ok(sources[name] !== null && sources[name] !== undefined, `缺少文件 ${name}`);
  return sources[name];
}

// ---------------------------------------------------------------------------
Section("一 · 坐标与随机契约");

Test("邻居方向与距离自洽", () => {
  for (const neighborKey of HexNeighborKeys("0,0")) {
    assert.equal(HexDistanceKeys("0,0", neighborKey), 1, `${neighborKey} 应当与原点相邻`);
  }
  assert.equal(HexNeighborKeys("3,-2").length, 6);
  assert.equal(HexDistance({ q: 0, r: 0 }, { q: 3, r: -1 }), 3);
});

Test("世界坐标往返无损", () => {
  for (let q = -6; q <= 6; q += 1) {
    for (let r = -6; r <= 6; r += 1) {
      const world = HexToWorld(q, r);
      const back = WorldToHex(world.x, world.z);
      assert.deepEqual(back, { q, r }, `(${q},${r}) 往返失败`);
    }
  }
});

Test("环与范围的格数符合六边形公式", () => {
  for (let radius = 1; radius <= 4; radius += 1) {
    assert.equal(HexRing({ q: 0, r: 0 }, radius).length, 6 * radius);
    assert.equal(HexesInRange({ q: 0, r: 0 }, radius).length, 3 * radius * (radius + 1) + 1);
  }
});

Test("随机源确定性可复现", () => {
  const first = CreateRng(1234);
  const second = CreateRng(1234);
  for (let index = 0; index < 200; index += 1) assert.equal(first(), second());
  let stateA = 99;
  let stateB = 99;
  for (let index = 0; index < 50; index += 1) {
    const a = StepRng(stateA);
    const b = StepRng(stateB);
    stateA = a.state;
    stateB = b.state;
    assert.equal(a.value, b.value);
    assert.ok(a.value >= 0 && a.value < 1);
  }
});

Test("噪声在 0..1 且平滑", () => {
  let previous = FractalNoise2D(0, 0, { seed: 7 });
  for (let step = 1; step <= 400; step += 1) {
    const value = FractalNoise2D(step * 0.05, step * 0.03, { seed: 7 });
    assert.ok(value >= 0 && value <= 1, `噪声越界 ${value}`);
    assert.ok(Math.abs(value - previous) < 0.5, "噪声跳变过大");
    previous = value;
  }
});

// ---------------------------------------------------------------------------
Section("二 · 地图生成");

const sampleMaps = [];
Test("地图生成：连通 / 地形齐全 / 高差平滑 / 可复现", () => {
  assert.equal(typeof MapGen.GenerateMap, "function", "缺少 GenerateMap");
  const terrainSeen = new Set();
  for (const seed of [1, 7, 42, 1937, 20260729, 88888]) {
    const map = MapGen.GenerateMap(seed, 26, 20);
    sampleMaps.push(map);
    assert.ok(map.order.length > 400, `地图过小：${map.order.length}`);

    // 连通性
    const start = map.startKey ?? map.order[0];
    const seen = new Set([start]);
    const queue = [start];
    while (queue.length) {
      for (const neighborKey of HexNeighborKeys(queue.shift())) {
        if (map.hexes[neighborKey] && !seen.has(neighborKey)) {
          seen.add(neighborKey);
          queue.push(neighborKey);
        }
      }
    }
    assert.equal(seen.size, map.order.length, `seed ${seed} 地图不连通 ${seen.size}/${map.order.length}`);

    // 高差
    for (const key of map.order) {
      const hex = map.hexes[key];
      terrainSeen.add(hex.terrain);
      for (const neighborKey of HexNeighborKeys(key)) {
        const neighbor = map.hexes[neighborKey];
        if (!neighbor) continue;
        const gap = Math.abs((hex.elevation ?? 0) - (neighbor.elevation ?? 0));
        assert.ok(gap <= 0.285, `seed ${seed} 高差过大 ${gap.toFixed(3)} @${key}`);
      }
    }

    // 起始点周边村庄
    const villages = HexesInRange(ParseHexKey(start), 2)
      .map((coordinate) => map.hexes[HexKey(coordinate.q, coordinate.r)])
      .filter((hex) => hex && hex.feature === "Village").length;
    assert.ok(villages >= 4, `seed ${seed} 起始点附近村庄仅 ${villages} 个`);

    // 可复现
    const repeat = MapGen.GenerateMap(seed, 26, 20);
    assert.equal(JSON.stringify(repeat.order), JSON.stringify(map.order), "同种子地图顺序不一致");
    for (const key of map.order.slice(0, 120)) {
      assert.equal(repeat.hexes[key].terrain, map.hexes[key].terrain, "同种子地形不一致");
    }
  }
  const required = ["Mountain", "Ridge", "Hill", "Forest", "Plain", "Loess", "Marsh", "River", "Gorge"];
  for (const terrain of required) {
    assert.ok(terrainSeen.has(terrain), `缺少地形 ${terrain}`);
  }
});

Test("地图含铁路 / 河流 / 县城 / 敌据点种子", () => {
  const map = sampleMaps[0];
  assert.ok((map.railwayKeys ?? []).length >= 6, "铁路过短");
  assert.ok((map.riverKeys ?? []).length >= 6, "河流过短");
  assert.ok((map.countySeatKeys ?? []).length >= 3, "县城少于 3 座");
  assert.ok((map.strongholdSeeds ?? []).length >= 5, "敌据点种子不足");
});

// ---------------------------------------------------------------------------
Section("三 · 数据完整性");

Test("科技 / 群众树依赖闭合且无环", () => {
  const techs = DataTech.techDefinitions ?? {};
  const doctrines = DataTech.doctrineDefinitions ?? {};
  const all = { ...techs, ...doctrines };
  assert.ok(Object.keys(techs).length >= 20, `军事科技仅 ${Object.keys(techs).length} 项`);
  assert.ok(Object.keys(doctrines).length >= 14, `群众树仅 ${Object.keys(doctrines).length} 项`);
  for (const [id, definition] of Object.entries(all)) {
    for (const requirement of definition.requires ?? []) {
      assert.ok(all[requirement], `${id} 依赖了不存在的 ${requirement}`);
    }
  }
  // 拓扑排序检测环
  const visiting = new Set();
  const done = new Set();
  const Visit = (id, trail) => {
    if (done.has(id)) return;
    assert.ok(!visiting.has(id), `依赖成环：${[...trail, id].join(" → ")}`);
    visiting.add(id);
    for (const requirement of all[id]?.requires ?? []) Visit(requirement, [...trail, id]);
    visiting.delete(id);
    done.add(id);
  };
  for (const id of Object.keys(all)) Visit(id, []);
});

Test("解锁引用的单位 / 区域 / 工事均存在", () => {
  const units = DataUnits.unitDefinitions ?? {};
  const districts = DataUnits.districtDefinitions ?? {};
  const works = DataTerrain.workDefinitions ?? {};
  const policies = DataTech.policyDefinitions ?? {};
  const sources = { ...(DataTech.techDefinitions ?? {}), ...(DataTech.doctrineDefinitions ?? {}), ...policies };
  for (const [id, definition] of Object.entries(sources)) {
    for (const key of definition.effects?.unlockUnits ?? []) assert.ok(units[key], `${id} 解锁了不存在的单位 ${key}`);
    for (const key of definition.effects?.unlockDistricts ?? []) assert.ok(districts[key], `${id} 解锁了不存在的区域 ${key}`);
    for (const key of definition.effects?.unlockWorks ?? []) assert.ok(works[key], `${id} 解锁了不存在的工事 ${key}`);
    for (const key of definition.effects?.unlockPolicies ?? []) assert.ok(policies[key], `${id} 解锁了不存在的政策 ${key}`);
  }
});

Test("工事 / 单位 / 区域引用的科技 id 全部真实存在", () => {
  const research = { ...(DataTech.techDefinitions ?? {}), ...(DataTech.doctrineDefinitions ?? {}) };
  const broken = [];
  const Check = (label, table) => {
    for (const [key, definition] of Object.entries(table ?? {})) {
      const required = definition?.requiresTech;
      if (required && !research[required]) broken.push(`${label} ${key} → ${required}`);
    }
  };
  Check("工事", DataTerrain.workDefinitions);
  Check("单位", DataUnits.unitDefinitions);
  Check("区域", DataUnits.districtDefinitions);
  assert.equal(broken.length, 0, `指向不存在的科技，将永久无法解锁：\n      ${broken.join("\n      ")}`);
});

Test("单位双方齐备且能力词条合法", () => {
  const units = Object.values(DataUnits.unitDefinitions ?? {});
  const ours = units.filter((unit) => unit.side === "Player");
  const theirs = units.filter((unit) => unit.side === "Enemy");
  assert.ok(ours.length >= 8, `我方单位仅 ${ours.length} 种`);
  assert.ok(theirs.length >= 6, `敌方单位仅 ${theirs.length} 种`);
  for (const unit of units) {
    assert.ok(unit.maxHp > 0 && unit.moves > 0, `${unit.key} 数值非法`);
    assert.ok(typeof unit.blurb === "string" && unit.blurb.length > 4, `${unit.key} 缺少说明`);
  }
  assert.ok(ours.some((unit) => (unit.abilities ?? []).includes("Organize")), "缺少能开辟根据地的工作队");
  assert.ok(ours.some((unit) => (unit.abilities ?? []).includes("Sabotage")), "缺少能破袭的单位");
  assert.ok(ours.some((unit) => (unit.abilities ?? []).includes("Siege")), "缺少能攻坚的单位");
  assert.ok(ours.some((unit) => (unit.abilities ?? []).includes("Recon")), "缺少侦察单位");
});

Test("地形 / 特性 / 工事定义完整", () => {
  const terrains = DataTerrain.terrainDefinitions ?? {};
  for (const key of ["Mountain", "Ridge", "Hill", "Forest", "Plain", "Loess", "Marsh", "River", "Gorge"]) {
    const definition = terrains[key];
    assert.ok(definition, `缺少地形定义 ${key}`);
    assert.ok(definition.moveCost > 0, `${key} 移动消耗非法`);
    assert.ok(Array.isArray(definition.elevationBand), `${key} 缺少高程带`);
    assert.match(String(definition.colorLow ?? ""), /^#[0-9a-fA-F]{6}$/, `${key} colorLow 非法`);
  }
  assert.ok(Object.keys(DataTerrain.featureDefinitions ?? {}).length >= 8, "地块特性不足");
  assert.ok(Object.keys(DataTerrain.workDefinitions ?? {}).length >= 6, "可建工事不足");
});

Test("历史内容齐备且时期覆盖 0-31 回合", () => {
  const eras = Object.values(DataHistory.eraDefinitions ?? {}).sort((a, b) => a.turnRange[0] - b.turnRange[0]);
  assert.equal(eras.length, 5, `时期数应为 5，实际 ${eras.length}`);
  let cursor = 0;
  for (const era of eras) {
    assert.equal(era.turnRange[0], cursor, `时期 ${era.key} 起点应为 ${cursor}`);
    cursor = era.turnRange[1] + 1;
  }
  assert.equal(cursor, 32, "时期未覆盖满 32 回合");
  assert.ok((DataHistory.historicalEvents ?? []).length >= 24, "历史事件不足");
  assert.ok((DataHistory.fieldNotes ?? []).length >= 32, "风味短句不足");
  assert.ok((DataHistory.quotes ?? []).length >= 10, "文献引语不足");
  assert.ok(Object.keys(DataHistory.endingDefinitions ?? {}).length >= 5, "结局不足");
});

Test("代价账本只记代价，不产生任何收益（红线）", () => {
  const allowed = new Set(["civilianDeaths", "displaced", "villagesBurned", "cadreLost", "grainSeized"]);
  for (const event of DataHistory.historicalEvents ?? []) {
    for (const option of event.options ?? []) {
      for (const key of Object.keys(option.ledger ?? {})) {
        assert.ok(allowed.has(key), `${event.id}/${option.id} 使用了非法账本键 ${key}`);
        assert.ok((option.ledger[key] ?? 0) >= 0, `${event.id}/${option.id} 账本项为负，等同奖励`);
      }
    }
  }
});

// ---------------------------------------------------------------------------
Section("四 · 规则内核");

let baseState = null;
Test("建局：结构完整、资源就位、起始部队到位", () => {
  baseState = Rules.CreateInitialState({ seed: 20260729, difficulty: "Normal" });
  assert.equal(baseState.turn, 0);
  assert.equal(baseState.maxTurns, 32);
  assert.ok(baseState.map.order.length > 400);
  assert.ok(baseState.units.length >= 3, "起始部队不足");
  assert.ok(baseState.strongholds.length >= 5, "敌据点不足");
  for (const key of Rules.resourceKeys) {
    assert.ok(typeof baseState.stock[key] === "number", `资源 ${key} 缺失`);
  }
  const startHex = Rules.GetHex(baseState, baseState.startKey);
  assert.ok(startHex.elevation > 0.42, "起始点应在山区或丘陵");
});

Test("建局可复现（同种子同局面）", () => {
  const a = Rules.CreateInitialState({ seed: 4321, difficulty: "Normal" });
  const b = Rules.CreateInitialState({ seed: 4321, difficulty: "Normal" });
  assert.equal(Rules.SerializeState(a), Rules.SerializeState(b));
});

Test("红线：第 1 回合就看得见敌军且够得着目标", () => {
  for (const seed of [1, 99, 1937, 20260729]) {
    const state = Rules.CreateInitialState({ seed, difficulty: "Normal" });
    const visibleEnemies = state.enemies.filter((enemy) => enemy.visibleToPlayer).length;
    const visibleStrongholds = state.strongholds.filter((item) => {
      const hex = Rules.GetHex(state, item.key);
      return hex && hex.explored;
    }).length;
    assert.ok(visibleEnemies + visibleStrongholds >= 2, `seed ${seed} 第 1 回合可见敌方目标不足`);

    // 至少一个目标在某支部队的行动半径 + 攻击距离内
    let reachableTarget = false;
    for (const unit of state.units) {
      const reachable = Rules.FindReachableHexes(state, unit.id);
      const candidates = [unit.key, ...reachable.keys()];
      for (const key of candidates) {
        const nearEnemy = state.enemies.some((enemy) => HexDistanceKeys(enemy.key, key) <= 1);
        const nearStronghold = state.strongholds.some((item) => HexDistanceKeys(item.key, key) <= 1);
        if (nearEnemy || nearStronghold) {
          reachableTarget = true;
          break;
        }
      }
      if (reachableTarget) break;
    }
    assert.ok(reachableTarget, `seed ${seed} 第 1 回合够不着任何目标`);
  }
});

Test("行动不修改传入状态（不可变性）", () => {
  const state = Rules.CreateInitialState({ seed: 555 });
  const before = Rules.SerializeState(state);
  const unit = state.units[0];
  const reachable = Rules.FindReachableHexes(state, unit.id);
  const target = reachable.keys().next().value;
  Rules.PerformAction(state, { kind: "Move", unitId: unit.id, toKey: target });
  Rules.EndTurn(state);
  assert.equal(Rules.SerializeState(state), before, "传入的 state 被就地修改了");
});

Test("发动群众提升群众基础并改变控制归属", () => {
  let state = Rules.CreateInitialState({ seed: 606 });
  const worker = state.units.find((unit) => Rules.GetUnitStats(unit.type).abilities.includes("Organize"));
  assert.ok(worker, "缺少工作队");
  const before = Rules.GetHex(state, worker.key).massBase;
  const outcome = Rules.PerformAction(state, { kind: "Mobilize", unitId: worker.id, key: worker.key });
  assert.ok(outcome.report.ok, outcome.report.reason);
  const after = Rules.GetHex(outcome.nextState, worker.key).massBase;
  assert.ok(after > before + 6, `群众基础增长不足 ${before} → ${after}`);
});

Test("整局 32 回合可完整跑通并出结果", () => {
  let state = Rules.CreateInitialState({ seed: 777 });
  let guard = 0;
  while (!state.over && guard < 60) {
    state = Rules.EndTurn(state).nextState;
    if (state.events.pending) state = Rules.ApplyEventChoice(state, state.events.pending, null);
    guard += 1;
  }
  assert.ok(state.over, "32 回合后未终局");
  assert.equal(state.turn, 32);
  assert.ok(state.result, "缺少终局评定");
  assert.ok(["S", "A", "B", "C", "D"].includes(state.result.grade));
  assert.ok(state.result.ending?.title, "缺少结局文本");
});

Test("存档往返一致", () => {
  let state = Rules.CreateInitialState({ seed: 888 });
  for (let index = 0; index < 5; index += 1) state = Rules.EndTurn(state).nextState;
  const restored = Rules.DeserializeState(Rules.SerializeState(state));
  assert.ok(restored, "读档失败");
  assert.equal(restored.turn, state.turn);
  assert.equal(restored.map.order.length, state.map.order.length);
  assert.deepEqual(restored.ledger, state.ledger);
  assert.equal(Rules.DeserializeState("{bad json"), null);
  assert.equal(Rules.DeserializeState(JSON.stringify({ version: 999, state: {} })), null);
});

Test("评级闸门：根据地过小封顶 C，人民代价过大压档", () => {
  let state = Rules.CreateInitialState({ seed: 909 });
  state.turn = 32;
  const weak = Rules.GetVictoryAssessment(state);
  assert.ok(["C", "D"].includes(weak.grade), `无根据地却评为 ${weak.grade}`);

  const costly = Rules.CloneState(state);
  costly.ledger.civilianDeaths = 900;
  costly.ledger.villagesBurned = 40;
  const costlyResult = Rules.GetVictoryAssessment(costly);
  assert.ok(costlyResult.metrics.safety < 30, "巨大代价未反映为人民安全下降");
  assert.ok(costlyResult.total <= weak.total, "代价越大分数反而越高");
});

Test("破袭计分有收益递减上限", () => {
  const state = Rules.CreateInitialState({ seed: 111 });
  state.turn = 32;
  const scoreAt = (count) => {
    const probe = Rules.CloneState(state);
    probe.sabotageTotal = count;
    return Rules.GetVictoryAssessment(probe).metrics.disruption;
  };
  const early = scoreAt(6) - scoreAt(3);
  const late = scoreAt(60) - scoreAt(57);
  assert.ok(late < early * 0.5, `破袭收益未递减：早期 +${early.toFixed(2)} 晚期 +${late.toFixed(2)}`);
  assert.ok(scoreAt(500) <= 60, "破袭得分未封顶");
});

// ---------------------------------------------------------------------------
Section("五 · 战斗与 AI");

Test("战斗模块导出齐备且纯函数", () => {
  for (const name of ["ResolveAttack", "PreviewAttack", "ComputeStrength", "ResolveSweepBattle", "ListAttackTargets"]) {
    assert.equal(typeof Combat[name], "function", `Script_Combat 缺少 ${name}`);
  }
});

Test("AI 模块导出齐备", () => {
  for (const name of ["PlanEnemyTurn", "ApplyEnemyTurn", "EvaluateThreat"]) {
    assert.equal(typeof Ai[name], "function", `Script_Ai 缺少 ${name}`);
  }
});

Test("AI 不修改传入状态且可复现", () => {
  const state = Rules.CreateInitialState({ seed: 2024 });
  const before = JSON.stringify(state);
  const planA = Ai.PlanEnemyTurn(state, { difficulty: "Normal" });
  Ai.ApplyEnemyTurn(state, planA);
  assert.equal(JSON.stringify(state), before, "AI 就地修改了传入 state");
  const planB = Ai.PlanEnemyTurn(Rules.DeserializeState(Rules.SerializeState(state)), { difficulty: "Normal" });
  assert.equal(JSON.stringify(planA.orders?.length ?? 0), JSON.stringify(planB.orders?.length ?? 0), "AI 规划不可复现");
});

Test("战斗与规则的接缝不重复记账（暴露度 / 账本 / 缴获）", () => {
  const state = Rules.CreateInitialState({ seed: 20260729 });
  const unit = state.units[0];
  // 先贴近敌方再打，构造一次真实攻击。
  const reachable = [...Rules.FindReachableHexes(state, unit.id).keys()];
  const approach = reachable
    .slice()
    .sort((a, b) => {
      const near = (key) => Math.min(...state.enemies.map((enemy) => HexDistanceKeys(key, enemy.key)));
      return near(a) - near(b);
    })[0];
  const moved = Rules.PerformAction(state, { kind: "Move", unitId: unit.id, toKey: approach }).nextState;
  const targets = Combat.ListAttackTargets(moved, unit.id);
  assert.ok(targets.length, "贴近后仍无可攻击目标");

  const rawOutcome = Combat.ResolveAttack(moved, unit.id, targets[0], {});
  const rulesOutcome = Rules.PerformAction(moved, { kind: "Attack", unitId: unit.id, targetKey: targets[0] });
  assert.ok(rulesOutcome.report.ok, rulesOutcome.report.reason);

  const rawExposure = rawOutcome.nextState.exposure - moved.exposure;
  const rulesExposure = rulesOutcome.nextState.exposure - moved.exposure;
  assert.ok(
    Math.abs(rulesExposure - rawExposure) < 0.6,
    `暴露度被重复记账：战斗模块 +${rawExposure.toFixed(1)}，经规则层后 +${rulesExposure.toFixed(1)}`,
  );

  const rawLedger = Rules.ledgerKeys.reduce((sum, key) => sum + (rawOutcome.nextState.ledger[key] - moved.ledger[key]), 0);
  const rulesLedger = Rules.ledgerKeys.reduce((sum, key) => sum + (rulesOutcome.nextState.ledger[key] - moved.ledger[key]), 0);
  assert.ok(rulesLedger <= rawLedger + 0.001, `代价账本被重复记账：${rawLedger} → ${rulesLedger}`);

  // 缴获必须真正进入库存（械是玩家扩军的主路径）。
  const captures = rawOutcome.report.captures ?? {};
  const capturedOrdnance = Number(captures.ordnance) || 0;
  if (capturedOrdnance > 0) {
    const gained = rulesOutcome.nextState.stock.ordnance - moved.stock.ordnance;
    assert.ok(gained > 0, `缴获了 ${capturedOrdnance} 械却没有进入库存`);
  }
});

/** 构造一次贴近敌方的交火机会，返回 { state, unitId, targetKey }。 */
function SetUpEngagement(seed) {
  const state = Rules.CreateInitialState({ seed });
  for (const unit of state.units) {
    if (!Rules.GetUnitStats(unit.type).abilities.includes("Ambush")) continue;
    const reachable = [...Rules.FindReachableHexes(state, unit.id).keys()];
    const near = (key) => Math.min(99, ...state.enemies.map((enemy) => HexDistanceKeys(key, enemy.key)));
    const approach = reachable.sort((a, b) => near(a) - near(b))[0];
    if (!approach || near(approach) > 1) continue;
    const moved = Rules.PerformAction(state, { kind: "Move", unitId: unit.id, toKey: approach });
    if (!moved.report.ok) continue;
    const next = moved.nextState;
    const targets = Combat.ListAttackTargets(next, unit.id) ?? [];
    if (targets.length) return { state: next, unitId: unit.id, targetKey: targets[0] };
  }
  return null;
}

Test("伏击优于正面强攻：更高缴获、更低己方损失（游击战核心）", () => {
  let ambushCaptures = 0;
  let openCaptures = 0;
  let ambushLoss = 0;
  let openLoss = 0;
  let samples = 0;

  for (let seed = 0; seed < 40 && samples < 10; seed += 1) {
    const setup = SetUpEngagement(7000 + seed);
    if (!setup) continue;
    samples += 1;

    // 同一局面下只改变「是否隐蔽」这一个变量。
    const hidden = Rules.CloneState(setup.state);
    Rules.GetUnit(hidden, setup.unitId).hidden = true;
    const exposed = Rules.CloneState(setup.state);
    Rules.GetUnit(exposed, setup.unitId).hidden = false;

    const ambush = Combat.ResolveAttack(hidden, setup.unitId, setup.targetKey, {});
    const open = Combat.ResolveAttack(exposed, setup.unitId, setup.targetKey, {});

    ambushCaptures += ambush.report?.captures?.ordnance ?? 0;
    openCaptures += open.report?.captures?.ordnance ?? 0;
    ambushLoss += ambush.report?.casualties?.ours ?? 0;
    openLoss += open.report?.casualties?.ours ?? 0;
  }

  assert.ok(samples >= 5, `只构造出 ${samples} 次交火样本，不足以判定`);
  console.log(
    `      伏击缴获 ${ambushCaptures.toFixed(1)} 械 / 己方减员 ${ambushLoss.toFixed(1)}` +
      ` · 强攻缴获 ${openCaptures.toFixed(1)} 械 / 己方减员 ${openLoss.toFixed(1)}`,
  );
  assert.ok(ambushCaptures > 0, "隐蔽伏击也拿不到缴获，械的主来源断了");
  assert.ok(ambushCaptures > openCaptures, `伏击缴获(${ambushCaptures.toFixed(1)}) 未超过强攻(${openCaptures.toFixed(1)})`);
  assert.ok(ambushLoss < openLoss, `伏击减员(${ambushLoss.toFixed(1)}) 未低于强攻(${openLoss.toFixed(1)})`);
});

Test("打完不转移的暴露度代价远高于打完转移", () => {
  let stayTotal = 0;
  let withdrawTotal = 0;
  let samples = 0;
  for (let seed = 0; seed < 40 && samples < 8; seed += 1) {
    const setup = SetUpEngagement(8000 + seed);
    if (!setup) continue;
    // 转移落脚点必须与本单位相邻，规则层的 ListWithdrawOptions 已经按隐蔽条件排好序。
    const options = Rules.ListWithdrawOptions(setup.state, setup.unitId, setup.targetKey);
    if (!options.length) continue;
    const withdrawKey = options[0].key;
    samples += 1;
    const stay = Combat.ResolveAttack(Rules.CloneState(setup.state), setup.unitId, setup.targetKey, {});
    const away = Combat.ResolveAttack(Rules.CloneState(setup.state), setup.unitId, setup.targetKey, { withdrawKey });
    stayTotal += stay.report?.exposureDelta ?? 0;
    withdrawTotal += away.report?.exposureDelta ?? 0;
  }
  assert.ok(samples >= 4, `样本不足 ${samples}`);
  console.log(`      滞留暴露度 +${stayTotal.toFixed(1)} · 转移暴露度 +${withdrawTotal.toFixed(1)}`);
  assert.ok(stayTotal > withdrawTotal * 3, `滞留(${stayTotal.toFixed(1)}) 未达到转移(${withdrawTotal.toFixed(1)}) 的三倍以上`);
});

Test("玩家能在行动列表里选到「打完转移」，且它确实带上落脚点", () => {
  let offered = 0;
  for (let seed = 0; seed < 30 && offered < 5; seed += 1) {
    const setup = SetUpEngagement(9000 + seed);
    if (!setup) continue;
    const actions = Rules.ListContextActions(setup.state, setup.unitId, setup.targetKey);
    const attacks = actions.filter((action) => action.kind === "Attack");
    assert.ok(attacks.length, "贴近敌方后行动列表里没有攻击选项");
    const withdrawing = attacks.find((action) => action.withdrawKey);
    if (!withdrawing) continue;
    offered += 1;
    assert.equal(
      HexDistanceKeys(withdrawing.withdrawKey, Rules.GetUnit(setup.state, setup.unitId).key),
      1,
      "转移落脚点必须与本单位相邻，否则战斗模块会忽略它",
    );
    assert.ok(
      attacks.some((action) => !action.withdrawKey && action.danger),
      "缺少「滞留原地」的高风险选项，玩家看不到这个权衡",
    );
    // 该选项走完整规则链路必须真的把部队挪走。
    const outcome = Rules.PerformAction(setup.state, withdrawing);
    if (outcome.report.ok) {
      const unit = Rules.GetUnit(outcome.nextState, setup.unitId);
      if (unit) assert.notEqual(unit.key, Rules.GetUnit(setup.state, setup.unitId).key, "选了转移却没挪窝");
    }
  }
  assert.ok(offered >= 3, `只有 ${offered} 次给出了转移选项，核心节奏没暴露给玩家`);
});

Test("暴露度高 → 扫荡频率显著上升", () => {
  const CountSweeps = (exposure) => {
    let sweeps = 0;
    for (let seed = 0; seed < 30; seed += 1) {
      let state = Rules.CreateInitialState({ seed: 3000 + seed });
      for (let turn = 0; turn < 10; turn += 1) {
        state.exposure = exposure;
        state.alert = exposure;
        state = Rules.EndTurn(state).nextState;
        if (state.sweep) {
          sweeps += 1;
          break;
        }
      }
    }
    return sweeps;
  };
  const quiet = CountSweeps(8);
  const loud = CountSweeps(92);
  assert.ok(loud > quiet, `暴露度未驱动扫荡：低 ${quiet} 次 / 高 ${loud} 次`);
});

Test("平民代价永不转化为资源或分数（红线）", () => {
  let state = Rules.CreateInitialState({ seed: 4040 });
  let previousLedger = { ...state.ledger };
  for (let turn = 0; turn < 32; turn += 1) {
    const before = { ...state.stock };
    const beforeLedger = { ...state.ledger };
    state = Rules.EndTurn(state).nextState;
    if (state.events.pending) state = Rules.ApplyEventChoice(state, state.events.pending, null);
    const ledgerGrew = Rules.ledgerKeys.some((key) => (state.ledger[key] ?? 0) > (beforeLedger[key] ?? 0));
    if (ledgerGrew) {
      // 账本增长的那一回合，不得出现资源的异常暴涨（>50% 且 >20 点）
      for (const key of Rules.resourceKeys) {
        const gain = (state.stock[key] ?? 0) - (before[key] ?? 0);
        assert.ok(
          gain <= Math.max(20, (before[key] ?? 0) * 0.5),
          `账本增长的回合 ${key} 暴涨 ${gain.toFixed(1)}，疑似把代价换成了收益`,
        );
      }
    }
    for (const key of Rules.ledgerKeys) {
      assert.ok((state.ledger[key] ?? 0) >= (previousLedger[key] ?? 0), `账本项 ${key} 减少了，代价不可撤销`);
    }
    previousLedger = { ...state.ledger };
    if (state.over) break;
  }
});

// ---------------------------------------------------------------------------
Section("六 · 策略排序（防缩头最优解与莽撞最优解）");

/** 三种 bot：会玩 / 消极 / 莽撞。 */
function RunBot(seed, style) {
  let state = Rules.CreateInitialState({ seed, difficulty: "Normal" });
  let guard = 0;
  while (!state.over && guard < 40) {
    guard += 1;
    if (state.events.pending) {
      state = Rules.ApplyEventChoice(state, state.events.pending, null);
    }
    if (style !== "passive") {
      // 选研究
      if (!state.research.currentId) {
        const available = Rules.ListAvailableResearch(state, "tech");
        if (available.length) state = Rules.SetResearch(state, available[0], "tech");
      }
      if (!state.research.currentDoctrineId) {
        const available = Rules.ListAvailableResearch(state, "doctrine");
        if (available.length) state = Rules.SetResearch(state, available[0], "doctrine");
      }
    }

    for (const unit of [...state.units]) {
      const live = Rules.GetUnit(state, unit.id);
      if (!live || live.acted) continue;
      const stats = Rules.GetUnitStats(live.type);
      const action = ChooseAction(state, live, stats, style);
      if (!action) continue;
      const outcome = Rules.PerformAction(state, action);
      if (outcome.report.ok) state = outcome.nextState;
    }
    state = Rules.EndTurn(state).nextState;
  }
  if (!state.over) {
    state = Rules.CloneState(state);
    state.turn = 32;
  }
  return Rules.GetVictoryAssessment(state);
}

function ChooseAction(state, unit, stats, style) {
  if (style === "passive") return null;

  if (style === "reckless") {
    // 莽撞：见敌就打，打完不转移
    const targets = Combat.ListAttackTargets?.(state, unit.id) ?? [];
    if (targets.length) return { kind: "Attack", unitId: unit.id, targetKey: targets[0] };
    const reachable = [...Rules.FindReachableHexes(state, unit.id).keys()];
    const towardEnemy = reachable.find((key) => state.strongholds.some((item) => HexDistanceKeys(item.key, key) <= 2));
    if (towardEnemy) return { kind: "Move", unitId: unit.id, toKey: towardEnemy };
    return null;
  }

  // 会玩：先建根据地与发动群众，再有选择地伏击，打完就转移
  if (stats.abilities.includes("Organize")) {
    const found = Rules.CanFoundBase(state, unit.id, unit.key);
    if (found.ok) return { kind: "FoundBase", unitId: unit.id, key: unit.key };
    const hex = Rules.GetHex(state, unit.key);
    if (hex && hex.massBase < 88) return { kind: "Mobilize", unitId: unit.id, key: unit.key };
    const reachable = [...Rules.FindReachableHexes(state, unit.id).keys()];
    const village = reachable.find((key) => {
      const candidate = Rules.GetHex(state, key);
      return candidate?.feature === "Village" && candidate.massBase < 55;
    });
    if (village) return { kind: "Move", unitId: unit.id, toKey: village };
    return null;
  }

  if (stats.abilities.includes("Recon")) return { kind: "Recon", unitId: unit.id, key: unit.key };

  const targets = Combat.ListAttackTargets?.(state, unit.id) ?? [];
  if (targets.length && unit.hidden && state.exposure < 55) {
    // 打完就转移：落脚点必须相邻，交给规则层按隐蔽条件挑。
    const withdrawKey = Rules.ListWithdrawOptions(state, unit.id, targets[0])[0]?.key;
    return { kind: "Attack", unitId: unit.id, targetKey: targets[0], withdrawKey };
  }
  if (unit.hp < unit.maxHp * 0.6 || !unit.hidden) return { kind: "Rest", unitId: unit.id };
  return null;
}

Test("会玩 > 消极不作为，且会玩 > 莽撞拼消耗", () => {
  const seeds = [11, 22, 33, 44, 55, 66];
  const average = (style) =>
    seeds.reduce((sum, seed) => sum + RunBot(seed, style).total, 0) / seeds.length;
  const skilled = average("skilled");
  const passive = average("passive");
  const reckless = average("reckless");
  console.log(`      会玩 ${skilled.toFixed(1)} · 消极 ${passive.toFixed(1)} · 莽撞 ${reckless.toFixed(1)}`);
  assert.ok(skilled > passive, `会玩(${skilled.toFixed(1)}) 未超过 消极(${passive.toFixed(1)})`);
  assert.ok(skilled > reckless, `会玩(${skilled.toFixed(1)}) 未超过 莽撞(${reckless.toFixed(1)})`);
});

Test("莽撞打法的人民代价高于稳健打法", () => {
  const seeds = [11, 22, 33];
  const cost = (style) =>
    seeds.reduce((sum, seed) => {
      const ledger = RunBot(seed, style).ledger;
      return sum + ledger.civilianDeaths + ledger.villagesBurned * 10 + ledger.displaced * 0.2;
    }, 0) / seeds.length;
  const skilled = cost("skilled");
  const reckless = cost("reckless");
  console.log(`      稳健代价 ${skilled.toFixed(1)} · 莽撞代价 ${reckless.toFixed(1)}`);
  assert.ok(reckless >= skilled, `莽撞代价(${reckless.toFixed(1)}) 未高于稳健(${skilled.toFixed(1)})`);
});

// ---------------------------------------------------------------------------
Section("七 · 表现层结构与副作用约束");

const presentationFiles = [
  "Script_Renderer.mjs",
  "Script_Materials.mjs",
  "Script_Effects.mjs",
  "Script_Models.mjs",
  "Script_Ui.mjs",
  "Script_Audio.mjs",
];

Test("渲染 / 特效 / UI / 音频模块存在且导出契约符号", () => {
  const expectations = {
    "Script_Renderer.mjs": ["CreateRenderer"],
    "Script_Materials.mjs": ["CreateTerrainMaterial", "CreateSkyDome", "CreateSeasonPalette"],
    "Script_Effects.mjs": ["CreateEffects"],
    "Script_Models.mjs": ["CreateUnitModel", "CreateVillageModel", "CreateBlockhouseModel"],
    "Script_Ui.mjs": ["CreateUi"],
    "Script_Audio.mjs": ["CreateAudio"],
  };
  for (const [file, symbols] of Object.entries(expectations)) {
    const source = Source(file);
    for (const symbol of symbols) {
      assert.match(source, new RegExp(`export\\s+(async\\s+)?function\\s+${symbol}\\b`), `${file} 缺少导出 ${symbol}`);
    }
  }
});

Test("表现层模块顶层无 DOM / WebGL 副作用", () => {
  for (const file of presentationFiles) {
    const lines = Source(file).split("\n");
    let depth = 0;
    lines.forEach((line, index) => {
      const stripped = line.replace(/\/\/.*$/, "");
      if (depth === 0) {
        const offender = /^\s*(const|let|var)?\s*[\w.]*\s*=?\s*(document\.|new AudioContext|new \(window\.AudioContext|window\.addEventListener)/.exec(stripped);
        assert.ok(!offender, `${file}:${index + 1} 模块顶层存在副作用：${line.trim().slice(0, 60)}`);
      }
      depth += (stripped.match(/[{(]/g) ?? []).length - (stripped.match(/[})]/g) ?? []).length;
      depth = Math.max(0, depth);
    });
  }
});

Test("全项目零外部运行时依赖（无 CDN / 无外部资产）", () => {
  const forbidden = /(https?:)?\/\/(cdn|unpkg|jsdelivr|fonts\.googleapis|ajax\.googleapis)/i;
  assert.ok(!forbidden.test(Source("index.html")), "index.html 引用了外部 CDN");
  for (const file of [...presentationFiles, "Script_Main.mjs", "Style_Game.css"]) {
    const source = Source(file);
    assert.ok(!forbidden.test(source), `${file} 引用了外部 CDN`);
    assert.ok(
      !/(TextureLoader|GLTFLoader|FileLoader|AudioLoader)\s*\(\s*\)\s*\.load\s*\(\s*["'](?!data:)/.test(source),
      `${file} 加载了外部资产文件`,
    );
  }
});

Test("页面装配完整：importmap、样式、启动脚本、无障碍", () => {
  const html = Source("index.html");
  assert.match(html, /<script type="importmap">/);
  assert.match(html, /"three":\s*"\.\/vendor\/three\/build\/three\.module\.mjs"/);
  assert.match(html, /"three\/addons\/":\s*"\.\/vendor\/three\/examples\/jsm\/"/);
  assert.match(html, /Style_Game\.css/);
  assert.match(html, /Script_Main\.mjs/);
  assert.match(html, /<html lang="zh-CN">/);
  assert.match(html, /viewport/);
  assert.match(html, /<noscript>/);
  assert.match(html, /1945/, "缺少史实终点声明");
});

Test("vendor 中的 three.js 与 addons 齐备", () => {
  assert.match(Source("vendor/three/build/three.module.mjs"), /REVISION\s*=\s*'160'/, "three.js 版本非 r160");
  for (const addon of [
    "vendor/three/examples/jsm/controls/OrbitControls.mjs",
    "vendor/three/examples/jsm/postprocessing/EffectComposer.mjs",
    "vendor/three/examples/jsm/postprocessing/RenderPass.mjs",
    "vendor/three/examples/jsm/postprocessing/ShaderPass.mjs",
    "vendor/three/examples/jsm/postprocessing/OutputPass.mjs",
    "vendor/three/examples/jsm/utils/BufferGeometryUtils.mjs",
    "vendor/three/examples/jsm/csm/CSM.mjs",
  ]) {
    assert.ok(Source(addon).length > 200, `${addon} 内容异常`);
  }
});

Test("样式表存在且含响应式断点与减少动效支持", () => {
  const css = Source("Style_Game.css");
  assert.ok(css.length > 4000, "样式表过于单薄");
  assert.match(css, /@media[^{]*max-width:\s*640px/, "缺少移动端断点");
  assert.match(css, /prefers-reduced-motion/, "未尊重 prefers-reduced-motion");
  const open = (css.match(/\{/g) ?? []).length;
  const close = (css.match(/\}/g) ?? []).length;
  assert.equal(open, close, `CSS 括号不配平 ${open}/${close}`);
});

Test("命名规范：文件名使用类别前缀且无连字符", () => {
  for (const entry of projectFiles) {
    if (!entry.isFile()) continue;
    if (entry.name === "index.html" || entry.name === "AGENTS.md") continue;
    assert.ok(!entry.name.includes("-"), `文件名含连字符：${entry.name}`);
    assert.match(entry.name, /^(Script|Data|Style|Shader|Texture|Icon|Model)_[A-Za-z0-9]+\.[a-z]+$/, `文件名不合规范：${entry.name}`);
  }
});

// ---------------------------------------------------------------------------
console.log(`\n${"─".repeat(56)}`);
const passed = results.filter((item) => item.passed).length;
console.log(`燎原 · 敌后1937 冒烟测试：${passed}/${results.length} 通过`);
if (failures) {
  console.error(`失败 ${failures} 项`);
  process.exit(1);
}
console.log("全部通过。");
