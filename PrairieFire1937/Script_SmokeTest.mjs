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

Test("结局与表现挂钩：差局不得拿到最好的结局", () => {
  const Build = (mutate) => {
    const state = Rules.CreateInitialState({ seed: 1212 });
    state.turn = 32;
    mutate(state);
    return Rules.GetVictoryAssessment(state);
  };

  // 一局什么都没干的烂摊子
  const poor = Build(() => {});
  // 一局建设充分、代价很低的好局
  const strong = Build((state) => {
    for (const key of state.map.order) {
      const hex = state.map.hexes[key];
      hex.massBase = 88;
      hex.control = "Base";
    }
    for (let index = 0; index < 6; index += 1) {
      state.bases.push({
        id: `b${index}`,
        key: state.map.order[index * 7],
        name: "支点",
        tier: 3,
        population: 9000,
        districts: Array.from({ length: 6 }, (item, slot) => ({ type: `d${slot}`, done: true })),
        queue: [],
        garrison: 4,
        unrest: 0,
      });
    }
    state.research.done = Object.keys(DataTech.techDefinitions ?? {}).slice(0, 20);
  });

  assert.ok(poor.ending?.title, "差局缺少结局文本");
  assert.ok(strong.ending?.title, "好局缺少结局文本");
  assert.notEqual(
    poor.ending.key,
    strong.ending.key,
    `好局与差局拿到了同一个结局「${poor.ending.title}」，结局评定没有真正接上局面`,
  );
  assert.notEqual(poor.ending.key, "PrairieFire", "一局没建设的烂摊子拿到了最好的结局「燎原」");
  console.log(`      差局 → ${poor.ending.title}(${poor.grade}) · 好局 → ${strong.ending.title}(${strong.grade})`);
});

Test("工事的每一项效果都被真正消费（不得白建）", () => {
  const works = DataTerrain.workDefinitions ?? {};
  assert.ok(Object.keys(works).length >= 6, "工事定义过少");

  // 收集所有工事声明过的效果 key，逐个验证它在规则层或战斗层确有反应。
  const declared = new Set();
  for (const definition of Object.values(works)) {
    for (const key of Object.keys(definition.effects ?? {})) declared.add(key);
  }

  const state = Rules.CreateInitialState({ seed: 4747 });
  const probeKey = state.startKey;
  const baseHex = Rules.GetHex(state, probeKey);

  const WithWorks = (list) => {
    const next = Rules.CloneState(state);
    const hex = Rules.GetHex(next, probeKey);
    hex.works = list;
    return next;
  };

  const checks = {
    concealmentDelta: (workKey) => {
      const withWork = Rules.GetHex(WithWorks([workKey]), probeKey);
      return Combat.ResolveHexStats(withWork).concealment > Combat.ResolveHexStats(baseHex).concealment;
    },
    defenceBonus: (workKey) => {
      const withWork = Rules.GetHex(WithWorks([workKey]), probeKey);
      return Combat.ResolveHexStats(withWork).defenceBonus > Combat.ResolveHexStats(baseHex).defenceBonus;
    },
    moveCostDelta: (workKey) => {
      const withWork = Rules.GetHex(WithWorks([workKey]), probeKey);
      return Combat.ResolveHexStats(withWork).moveCost !== Combat.ResolveHexStats(baseHex).moveCost;
    },
    warningRange: () => {
      const effects = Rules.GetHexWorkEffects({ works: ["Beacon"] });
      return effects.warningRange > 0;
    },
    grainProtection: () => Rules.GetHexWorkEffects({ works: ["Cache"] }).grainProtection > 0,
    scorchResist: () => Rules.GetHexWorkEffects({ works: ["Tunnel"] }).scorchResist > 0,
    setsTunnel: () => Rules.GetHexWorkEffects({ works: ["Tunnel"] }).setsTunnel === true,
    exposureDelta: () => Rules.GetHexWorkEffects({ works: ["Tunnel"] }).exposureDelta !== 0,
    massBaseDelta: () => Rules.GetHexWorkEffects({ works: ["Terrace"] }).massBaseDelta > 0,
    sabotageBonus: () => Combat.WorkSabotageBonus({ works: ["Roadblock"] }) > 0,
    enemyMoveCostDelta: () => Combat.WorkEnemyMoveCost({ works: ["Roadblock"] }) > 0,
    yields: () => true, // 产出走 GetHexBaseYields，已由经济用例覆盖
  };

  const unconsumed = [];
  for (const key of declared) {
    const check = checks[key];
    if (!check) {
      unconsumed.push(`${key}（无人消费）`);
      continue;
    }
    const owner = Object.entries(works).find(([, definition]) => definition.effects?.[key] !== undefined)?.[0];
    let ok = false;
    try {
      ok = Boolean(check(owner));
    } catch (error) {
      ok = false;
    }
    if (!ok) unconsumed.push(`${key}（${owner} 上无反应）`);
  }
  assert.equal(unconsumed.length, 0, `工事效果未被消费，玩家的工与干部白花：\n      ${unconsumed.join("\n      ")}`);
});

Test("地道确实提升隐蔽与防御，交通壕确实降低移动消耗", () => {
  const state = Rules.CreateInitialState({ seed: 4848 });
  const hex = Rules.GetHex(state, state.startKey);
  const plain = Combat.ResolveHexStats({ ...hex, works: [] });
  const tunnel = Combat.ResolveHexStats({ ...hex, works: ["Tunnel"] });
  const trench = Combat.ResolveHexStats({ ...hex, works: ["Trench"] });
  console.log(
    `      隐蔽 ${plain.concealment.toFixed(2)} → 地道 ${tunnel.concealment.toFixed(2)}` +
      ` · 防御 ${plain.defenceBonus.toFixed(2)} → 地道 ${tunnel.defenceBonus.toFixed(2)}` +
      ` · 移动 ${plain.moveCost.toFixed(2)} → 交通壕 ${trench.moveCost.toFixed(2)}`,
  );
  assert.ok(tunnel.concealment > plain.concealment + 0.05, "地道未提升隐蔽");
  assert.ok(tunnel.defenceBonus > plain.defenceBonus, "地道未提升防御");
  assert.ok(trench.moveCost < plain.moveCost, "交通壕未降低移动消耗");
});

Test("经济不会超线性膨胀，且粮/药始终是紧的", () => {
  let state = Rules.CreateInitialState({ seed: 11 });
  let tightGrainTurns = 0;
  let peak = {};
  for (const key of Rules.resourceKeys) peak[key] = 0;
  for (let turn = 0; turn < 32 && !state.over; turn += 1) {
    if (state.events.pending) state = Rules.ApplyEventChoice(state, state.events.pending, null);
    const available = Rules.ListAvailableResearch(state, "tech");
    if (!state.research.currentId && available.length) state = Rules.SetResearch(state, available[0], "tech");
    const doctrines = Rules.ListAvailableResearch(state, "doctrine");
    if (!state.research.currentDoctrineId && doctrines.length) state = Rules.SetResearch(state, doctrines[0], "doctrine");
    for (const existing of [...state.units]) {
      const unit = Rules.GetUnit(state, existing.id);
      if (!unit || unit.acted) continue;
      if (!Rules.GetUnitStats(unit.type).abilities.includes("Organize")) continue;
      const found = Rules.CanFoundBase(state, unit.id, unit.key);
      const action = found.ok
        ? { kind: "FoundBase", unitId: unit.id, key: unit.key }
        : { kind: "Mobilize", unitId: unit.id, key: unit.key };
      const outcome = Rules.PerformAction(state, action);
      if (outcome.report.ok) state = outcome.nextState;
    }
    state = Rules.EndTurn(state).nextState;
    if (turn < 12 && state.stock.grain < 12) tightGrainTurns += 1;
    for (const key of Rules.resourceKeys) peak[key] = Math.max(peak[key], state.stock[key]);
  }

  console.log(`      T32 峰值 ${Rules.resourceKeys.map((key) => `${Rules.resourceLabels[key]}${Math.round(peak[key])}`).join(" ")}`);
  for (const key of ["grain", "labor", "ordnance", "medicine", "intel"]) {
    assert.ok(peak[key] < 1600, `${Rules.resourceLabels[key]}峰值 ${Math.round(peak[key])}，经济已超线性膨胀，取舍失去意义`);
  }
  assert.ok(tightGrainTurns >= 3, `前 12 回合只有 ${tightGrainTurns} 个回合粮食吃紧，开局压力不足`);
  assert.ok(peak.medicine < peak.grain + peak.ordnance, "药不再稀缺，与设计意图相悖");
  assert.ok(peak.cadre < 60, `干部峰值 ${Math.round(peak.cadre)}，最贵的资源不该变得富余`);
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

  // 人民安全是五项代价的加权饱和度量：某一项灾难性并不会把总分砸到 0，
  // 但必须相对干净局面显著下滑，且拉低总分、压住评级。
  const clean = Rules.CloneState(state);
  const cleanResult = Rules.GetVictoryAssessment(clean);

  const partial = Rules.CloneState(state);
  partial.ledger.civilianDeaths = 900;
  partial.ledger.villagesBurned = 40;
  const partialResult = Rules.GetVictoryAssessment(partial);
  assert.ok(
    partialResult.metrics.safety < cleanResult.metrics.safety - 30,
    `大量伤亡与焚村未显著拉低人民安全：${cleanResult.metrics.safety.toFixed(1)} → ${partialResult.metrics.safety.toFixed(1)}`,
  );

  const total = Rules.CloneState(state);
  for (const key of Rules.ledgerKeys) total.ledger[key] = 5000;
  const totalResult = Rules.GetVictoryAssessment(total);
  assert.ok(totalResult.metrics.safety < 20, `五项代价全部灾难性时人民安全应逼近 0，实际 ${totalResult.metrics.safety.toFixed(1)}`);
  assert.ok(totalResult.total < cleanResult.total, "代价越大分数反而越高");
  assert.ok(["C", "D"].includes(totalResult.grade), `代价灾难性却评为 ${totalResult.grade}`);
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

/** 会玩的 bot 为「开辟新根据地」保留的干部预算。 */
const ruleReserve = Rules.ruleConstants.foundBaseCadreCost;

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
    if (style === "skilled" || style === "farmer") {
      // 装政策、建区域、扩编工作队——一个真正在经营根据地的玩家会做的事。
      const slots = Rules.GetPolicySlots(state);
      if (state.policy.equipped.length < slots) {
        const usable = Object.keys(DataTech.policyDefinitions ?? {}).filter((id) => {
          const definition = DataTech.policyDefinitions[id];
          return (definition?.requires ?? []).every((requirement) => state.research.done.includes(requirement));
        });
        if (usable.length) state = Rules.SetPolicies(state, usable.slice(0, slots));
      }
      // 干部是最紧的资源，必须给"开辟新根据地"留出预算，不能全砸进区域建设。
      const cadreReserve = ruleReserve;
      for (const base of [...state.bases]) {
        if (state.stock.cadre < cadreReserve + 2) break;
        for (const districtType of Object.keys(DataUnits.districtDefinitions ?? {})) {
          if (Rules.CanQueueDistrict(state, base.id, districtType).ok) {
            state = Rules.QueueDistrict(state, base.id, districtType);
            break;
          }
        }
      }
      // 干部富余时再派一支工作队出去开辟
      const organizers = state.units.filter((unit) => Rules.GetUnitStats(unit.type).abilities.includes("Organize")).length;
      if (organizers < 3 && state.bases.length && state.stock.cadre >= cadreReserve + 5) {
        for (const unitType of Object.keys(DataUnits.unitDefinitions ?? {})) {
          const stats = Rules.GetUnitStats(unitType);
          if (stats.side !== "Player" || !stats.abilities.includes("Organize")) continue;
          if (Rules.CanTrainUnit(state, state.bases[0].id, unitType).ok) {
            state = Rules.TrainUnit(state, state.bases[0].id, unitType);
            break;
          }
        }
      }
    }
    if (style === "skilled") {
      // 会玩的完整含义：经营之外还会打——定反扫荡方针、编成战斗与攻坚部队。
      // 干部纪律：基地不足 4 个时给开辟留足预算，战斗单位只用械和粮养。
      if (state.sweep) state = Rules.SetSweepStance(state, "CounterRaid");
      const cadreFree = state.stock.cadre - (state.bases.length < 4 ? ruleReserve : 0);
      const hasSiegeUnit = state.units.some((unit) => Rules.GetUnitStats(unit.type).abilities.includes("Siege"));
      const tryTrain = (unitType, guard) => {
        if (!guard || !state.bases.length) return false;
        const cost = Rules.GetTrainCost(state, unitType);
        if ((cost.cadre ?? 0) > cadreFree) return false;
        if (!Rules.CanTrainUnit(state, state.bases[0].id, unitType).ok) return false;
        state = Rules.TrainUnit(state, state.bases[0].id, unitType);
        return true;
      };
      if (!hasSiegeUnit) tryTrain("DemolitionTeam", state.stock.ordnance >= 18 && state.stock.grain > 10);
      if (state.units.length < 9) tryTrain("GuerrillaSquad", state.stock.ordnance >= 30 && state.stock.grain > 18);
    }

    // 两轮行动：第一轮多为机动/组织，第二轮让移动到位的部队接上攻击/围困。
    for (let pass = 0; pass < 2; pass += 1) {
      for (const unit of [...state.units]) {
        const live = Rules.GetUnit(state, unit.id);
        if (!live || live.acted) continue;
        const stats = Rules.GetUnitStats(live.type);
        const action = ChooseAction(state, live, stats, style);
        if (!action) continue;
        const outcome = Rules.PerformAction(state, action);
        if (outcome.report.ok) state = outcome.nextState;
      }
    }
    state = Rules.EndTurn(state).nextState;
  }
  if (!state.over) {
    state = Rules.CloneState(state);
    state.turn = 32;
  }
  const assessment = Rules.GetVictoryAssessment(state);
  assessment.finalState = state;
  return assessment;
}

/** 32 回合全程模拟不便宜，多个闸门共享同一批局面。 */
const botRunCache = new Map();
function RunBotCached(seed, style) {
  const cacheKey = `${style}:${seed}`;
  if (!botRunCache.has(cacheKey)) botRunCache.set(cacheKey, RunBot(seed, style));
  return botRunCache.get(cacheKey);
}

function BotNearestBaseDistance(state, key) {
  if (!state.bases.length) return HexDistanceKeys(state.startKey, key);
  return Math.min(...state.bases.map((base) => HexDistanceKeys(base.key, key)));
}

/** 会玩 bot 的猎杀优先级：辎重最肥、伪军次之，硬骨头留给伏击条件好的时候。 */
function BotPreferredTarget(state, unit) {
  const targets = Combat.ListAttackTargets?.(state, unit.id) ?? [];
  if (!targets.length) return null;
  const rank = (key) => {
    const enemy = state.enemies.find((item) => item.key === key);
    if (!enemy) return 5;
    if (enemy.type === "SupplyColumn") return 0;
    if (String(enemy.type).includes("Puppet")) return 1;
    return 3;
  };
  return targets.slice().sort((a, b) => rank(a) - rank(b))[0];
}

/** 邻接弱据点（守备≤3 或反攻期）优先围困，反攻期弹药富余时强攻。 */
function BotSiegeAction(state, unit) {
  for (const nearKey of [unit.key, ...HexNeighborKeys(unit.key)]) {
    const stronghold = Rules.GetStrongholdAt(state, nearKey);
    if (!stronghold || stronghold.destroyed || (stronghold.garrison ?? 0) <= 0) continue;
    if ((stronghold.garrison ?? 9) > 3 && state.eraKey !== "Counter") continue;
    const actions = Rules.ListContextActions(state, unit.id, nearKey) ?? [];
    const blockade = actions.find((item) => item.kind === "Siege" && item.mode === "Blockade" && item.enabled !== false);
    if (blockade) return blockade;
    const assault = actions.find((item) => item.kind === "Siege" && item.mode === "Assault" && item.enabled !== false);
    if (assault && state.eraKey === "Counter" && (state.stock.ordnance ?? 0) > 30) return assault;
  }
  return null;
}

/** 依托根据地的纪律性猎杀：高暴露蛰伏、打完必转移、不深远征。 */
function BotHuntAction(state, unit) {
  if (state.exposure > 45 || !unit.hidden) return { kind: "Rest", unitId: unit.id };
  const target = BotPreferredTarget(state, unit);
  if (target) {
    const withdrawKey = Rules.ListWithdrawOptions(state, unit.id, target)[0]?.key;
    return { kind: "Attack", unitId: unit.id, targetKey: target, withdrawKey };
  }
  const reach = state.eraKey === "Counter" ? 8 : 5;
  const goals = [
    ...state.enemies.filter((enemy) => enemy.visibleToPlayer).map((enemy) => enemy.key),
    ...state.strongholds
      .filter((item) => !item.destroyed && (item.garrison ?? 0) > 0 && (item.garrison ?? 9) <= 3 && Rules.GetHex(state, item.key)?.explored)
      .map((item) => item.key),
  ].filter((key) => BotNearestBaseDistance(state, key) <= reach);
  if (!goals.length) return null;
  const reachable = [...Rules.FindReachableHexes(state, unit.id).keys()];
  if (!reachable.length) return null;
  const near = (key) => Math.min(...goals.map((goal) => HexDistanceKeys(key, goal)));
  const best = reachable.sort((a, b) => near(a) - near(b))[0];
  if (best && near(best) < near(unit.key)) return { kind: "Move", unitId: unit.id, toKey: best };
  return null;
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

  // 会玩：工作队负责往外开辟——就地能建就建，建不了就往还没被覆盖的村庄走。
  if (stats.abilities.includes("Organize")) {
    const found = Rules.CanFoundBase(state, unit.id, unit.key);
    if (found.ok) return { kind: "FoundBase", unitId: unit.id, key: unit.key };

    const here = Rules.GetHex(state, unit.key);
    const covered = (key) => Boolean(Rules.GetHex(state, key)?.baseId) || Boolean(Rules.GetWorkingBase(state, key));
    const farEnough = (key) => state.bases.every((base) => HexDistanceKeys(base.key, key) >= 2);

    // 已经在根据地覆盖范围内了，就该出去找下一个落脚点，而不是原地反复开会。
    if (covered(unit.key)) {
      const reachable = [...Rules.FindReachableHexes(state, unit.id).keys()];
      const candidates = reachable
        .filter((key) => !covered(key) && farEnough(key))
        .sort((a, b) => {
          const hexA = Rules.GetHex(state, a);
          const hexB = Rules.GetHex(state, b);
          const score = (hex) => (hex.feature === "Village" ? 60 : 0) + hex.massBase;
          return score(hexB) - score(hexA);
        });
      if (candidates.length) return { kind: "Move", unitId: unit.id, toKey: candidates[0] };
    }

    // 群众发动到位（≥70）且工富余时，先把工事修起来（坚壁窖/交通壕/消息树），
    // 再继续把群众基础做满——工事是反扫荡的另一半准备。
    if (style === "skilled" && here && here.massBase >= 60 && (state.stock.labor ?? 0) >= 30 && !here.workBuild) {
      for (const workType of here.feature === "Village" ? ["Cache", "Trench", "Beacon"] : ["Beacon", "Trench"]) {
        if (Rules.CanBuildWork(state, unit.id, unit.key, workType).ok) {
          return { kind: "BuildWork", unitId: unit.id, key: unit.key, workType };
        }
      }
    }
    if (here && here.massBase < 92) return { kind: "Mobilize", unitId: unit.id, key: unit.key };
    return null;
  }

  // 纯侦察单位（侦察班）全职侦察；游击队的 Recon 只是能力之一，主业是打。
  if (stats.abilities.includes("Recon") && !stats.abilities.includes("Ambush")) {
    return { kind: "Recon", unitId: unit.id, key: unit.key };
  }

  if (style === "farmer") {
    // 纯种田对照组：经营满分，一枪不放。
    return { kind: "Rest", unitId: unit.id };
  }

  // 会玩：攻坚机会 > 纪律性猎杀（高暴露蛰伏、打完必转移、不深远征）。
  if (unit.hp < unit.maxHp * 0.5) return { kind: "Rest", unitId: unit.id };
  return BotSiegeAction(state, unit) ?? BotHuntAction(state, unit);
}

Test("会玩 > 消极不作为，且会玩 > 莽撞拼消耗", () => {
  const seeds = [11, 22, 33, 44, 55, 66];
  const average = (style) =>
    seeds.reduce((sum, seed) => sum + RunBotCached(seed, style).total, 0) / seeds.length;
  const skilled = average("skilled");
  const passive = average("passive");
  const reckless = average("reckless");
  console.log(`      会玩 ${skilled.toFixed(1)} · 消极 ${passive.toFixed(1)} · 莽撞 ${reckless.toFixed(1)}`);
  assert.ok(skilled > passive, `会玩(${skilled.toFixed(1)}) 未超过 消极(${passive.toFixed(1)})`);
  assert.ok(skilled > reckless, `会玩(${skilled.toFixed(1)}) 未超过 莽撞(${reckless.toFixed(1)})`);
});

Test("游戏是可经营的：像样地打完一局能建成多个根据地并拿到 B 以上", () => {
  const seeds = [11, 22, 33, 44, 55];
  const runs = seeds.map((seed) => RunBotCached(seed, "skilled"));
  const bases = runs.reduce((sum, run) => sum + run.counts.bases, 0) / runs.length;
  const villages = runs.reduce((sum, run) => sum + run.counts.baseVillages, 0) / runs.length;
  const construction = runs.reduce((sum, run) => sum + run.counts.districts + run.counts.works, 0) / runs.length;
  const techs = runs.reduce((sum, run) => sum + run.counts.techs, 0) / runs.length;
  const best = runs.reduce((top, run) => (run.total > top.total ? run : top), runs[0]);
  console.log(
    `      平均 根据地 ${bases.toFixed(1)} 个 · 根据地村 ${villages.toFixed(1)} · 区域+工事 ${construction.toFixed(1)} · 科技 ${techs.toFixed(1)}` +
      ` · 最好一局 ${best.total} 分 ${best.grade} 级「${best.ending?.title}」`,
  );
  assert.ok(bases >= 2, `平均只建起 ${bases.toFixed(1)} 个根据地，扩张循环走不通`);
  assert.ok(villages >= 6, `平均只有 ${villages.toFixed(1)} 个根据地村，连评级闸门都过不去`);
  assert.ok(construction >= 4, `平均区域+工事只有 ${construction.toFixed(1)}，建设循环走不通`);
  assert.ok(techs >= 4, `平均只研究出 ${techs.toFixed(1)} 项科技，科技循环走不通`);
  assert.ok(["S", "A", "B"].includes(best.grade), `最好的一局也只有 ${best.grade} 级，上限过低`);
});

Test("莽撞打法的人民安全远差于稳健打法（强度口径）", () => {
  // 绝对代价总量会奖励"没有地盘可失去"的打法（缩到 0 个根据地反而账面干净），
  // 所以这里用与终局评定同一口径的 ComputePeopleSafety（按回合×治下村庄归一）。
  const seeds = [11, 22, 33];
  const safety = (style) =>
    seeds.reduce((sum, seed) => sum + RunBotCached(seed, style).metrics.safety, 0) / seeds.length;
  const skilled = safety("skilled");
  const reckless = safety("reckless");
  console.log(`      稳健安全度 ${skilled.toFixed(1)} · 莽撞安全度 ${reckless.toFixed(1)}`);
  assert.ok(
    reckless < skilled - 15,
    `莽撞安全度(${reckless.toFixed(1)}) 未显著低于稳健(${skilled.toFixed(1)})——乱打没有付出人民代价`,
  );
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

Test("仅支持桌面端：无移动端断点残留，且有 PC 提示门", () => {
  const css = Source("Style_Game.css");
  assert.ok(css.length > 4000, "样式表过于单薄");
  // 产品决策：只支持 PC。移动端/平板断点不允许回潜——
  // 每一条断点都是一条需要单独验证的布局路径，砍掉的路径不许悄悄长回来。
  assert.ok(
    !/@media[^{]*max-width:\s*(1199|900|640|380)px/.test(css),
    "样式表出现了移动端/平板断点，仅支持桌面端的决策被破坏",
  );
  assert.match(css, /prefers-reduced-motion/, "未尊重 prefers-reduced-motion");
  const open = (css.match(/\{/g) ?? []).length;
  const close = (css.match(/\}/g) ?? []).length;
  assert.equal(open, close, `CSS 括号不配平 ${open}/${close}`);

  const html = Source("index.html");
  assert.match(html, /id="pcGate"/, "缺少小窗口提示门");
  assert.match(html, /桌面端/, "提示门未说明桌面端定位");
  assert.match(html, /仍要进入/, "提示门必须提供“仍要进入”出口，防止缩放误伤真实 PC");
});

Test("命名规范：文件名使用类别前缀且无连字符", () => {
  for (const entry of projectFiles) {
    if (!entry.isFile()) continue;
    if (entry.name === "index.html" || entry.name === "AGENTS.md") continue;
    assert.ok(!entry.name.includes("-"), `文件名含连字符：${entry.name}`);
    assert.match(entry.name, /^(Script|Data|Style|Shader|Texture|Icon|Model)_[A-Za-z0-9]+\.[a-z]+$/, `文件名不合规范：${entry.name}`);
  }
});

Section("八 · 活性与协同接线回归");

Test("历史事件账本量纲：单项 ≤ 1000，杜绝史实万斤级常数混入系统账本", () => {
  for (const event of DataHistory.historicalEvents) {
    for (const option of event.options ?? []) {
      for (const [key, value] of Object.entries(option.ledger ?? {})) {
        assert.ok(Number(value) <= 1000, `${event.id}/${option.id} 的 ${key}=${value} 超出系统量级`);
        assert.ok(Number(value) >= 0, `${event.id}/${option.id} 的 ${key}=${value} 为负（账本只进不退）`);
      }
    }
  }
});

Test("暴露度衰减单一来源：第 1 回合结束后不归零，且敌情通报就位", () => {
  let state = Rules.CreateInitialState({ seed: 1937, difficulty: "Normal" });
  state = Rules.EndTurn(state).nextState;
  assert.ok(state.exposure > 0, `第 1 回合后 exposure=${state.exposure}，双重衰减疑似回归`);
  assert.ok(state.enemyReadout && state.enemyReadout.doctrine, "state.enemyReadout.doctrine 缺失");
});

Test("消极局也有治安战：扫荡≥2、机动敌军峰值≥4、辎重队上路、铁壁合围必触发", () => {
  let state = Rules.CreateInitialState({ seed: 1937, difficulty: "Normal" });
  let peak = state.enemies.length;
  let sawConvoy = false;
  for (let i = 0; i < 32; i++) {
    state = Rules.EndTurn(state).nextState;
    peak = Math.max(peak, state.enemies.length);
    sawConvoy = sawConvoy || state.enemies.some((enemy) => enemy.type === "SupplyColumn");
    // 模拟 autoplay 的默认选项路径，让 forceSweep 等事件效果真实生效。
    if (state.events.pending) {
      const event = DataHistory.historicalEvents.find((item) => item.id === state.events.pending);
      if (event) state = Rules.ApplyEventChoice(state, event.id, event.options?.[0]?.id);
    }
  }
  const sweeps = state.aiMemory?.sweepTurns ?? [];
  assert.ok(sweeps.length >= 2, `全程扫荡仅 ${sweeps.length} 次`);
  assert.ok(peak >= 4, `机动敌军峰值仅 ${peak}`);
  assert.ok(sawConvoy, "整局未见 SupplyColumn 辎重队");
  assert.ok(state.events.fired.includes("GreatSweep"), "铁壁合围（GreatSweep）未触发");
});

Test("协同接线：友邻支援提升胜率、对侧合击有旗标、隐蔽出击即夜袭", () => {
  const initial = Rules.CreateInitialState({ seed: 1937, difficulty: "Normal" });
  // 找一个敌人与一对「对侧」空邻格：攻击者与支援者分居目标两侧。
  let placed = null;
  for (const enemy of initial.enemies) {
    const ring = HexNeighborKeys(enemy.key);
    for (let i = 0; i < 3 && !placed; i++) {
      const a = ring[i];
      const b = ring[(i + 3) % 6];
      const ok = (key) =>
        initial.map.hexes[key] && !Rules.GetStrongholdAt(initial, key) && !Rules.GetEnemiesAt(initial, key).length;
      if (ok(a) && ok(b)) placed = { enemy, a, b };
    }
    if (placed) break;
  }
  assert.ok(placed, "找不到可布置合击的敌人邻格组合");

  // 远置点：把无关单位挪出支援半径，保证「孤军」真的孤军。
  const farKey = initial.map.order.find(
    (key) =>
      initial.map.hexes[key] &&
      !Rules.GetStrongholdAt(initial, key) &&
      !Rules.GetEnemiesAt(initial, key).length &&
      HexDistanceKeys(key, placed.a) >= 6 &&
      HexDistanceKeys(key, placed.b) >= 6,
  );
  assert.ok(farKey, "找不到远置格");

  const Arrange = (withSupport) => {
    const state = Rules.CloneState(initial);
    const attacker = state.units[0];
    const supporter = state.units[1];
    for (const unit of state.units) {
      if (unit.id !== attacker.id) unit.key = farKey;
    }
    attacker.key = placed.a;
    attacker.hidden = true;
    attacker.acted = false;
    if (withSupport) {
      supporter.key = placed.b;
      supporter.hidden = true;
    }
    return { state, attacker };
  };

  const solo = Arrange(false);
  const pair = Arrange(true);
  const previewSolo = Rules.GetActionPreview(solo.state, { kind: "Attack", unitId: solo.attacker.id, targetKey: placed.enemy.key });
  const previewPair = Rules.GetActionPreview(pair.state, { kind: "Attack", unitId: pair.attacker.id, targetKey: placed.enemy.key });
  assert.ok(previewSolo?.valid && previewPair?.valid, "攻击预览不可用");
  assert.equal(previewSolo.supportCount, 0, "孤军预览的 supportCount 应为 0");
  assert.ok(previewPair.supportCount >= 1, "合击预览未计入支援者");
  assert.equal(previewPair.flank, true, "对侧支援未触发合击旗标");
  assert.ok(previewPair.odds > previewSolo.odds, `合击胜率 ${previewPair.odds} 未高于孤军 ${previewSolo.odds}`);
  assert.ok(typeof previewPair.supportLabel === "string" && previewPair.supportLabel.length > 0, "supportLabel 缺失");
  assert.equal(previewSolo.night, true, "隐蔽出击应视为夜袭");

  const exposed = Arrange(false);
  exposed.attacker.hidden = false;
  const previewExposed = Rules.GetActionPreview(exposed.state, { kind: "Attack", unitId: exposed.attacker.id, targetKey: placed.enemy.key });
  assert.equal(previewExposed.night, false, "暴露状态不应享受夜袭");
  assert.ok(previewExposed.odds < previewSolo.odds, "失去隐蔽/夜袭后胜率应下降");
});

Test("平毁封锁闭环：动作可列出、执行后 blockade 归零且付出暴露代价", () => {
  const state = Rules.CloneState(Rules.CreateInitialState({ seed: 1937, difficulty: "Normal" }));
  const unit = state.units[0];
  state.map.hexes[unit.key].blockade = 2;
  const actions = Rules.ListContextActions(state, unit.id, unit.key);
  const clear = actions.find((action) => action.kind === "ClearBlockade");
  assert.ok(clear, "封锁格上未列出「平毁封锁」");
  assert.ok(clear.enabled !== false, `平毁封锁不可用：${clear.reason ?? ""}`);
  const outcome = Rules.PerformAction(state, clear);
  assert.equal(outcome.report.ok, true, "平毁封锁执行失败");
  assert.equal(outcome.nextState.map.hexes[unit.key].blockade, 0, "blockade 未清除");
  assert.ok(outcome.nextState.exposure > state.exposure, "平毁封锁应付出暴露度代价");
});

Test("破袭列出即可打：带撤退路线，且执行不被结算条件打回", () => {
  const initial = Rules.CreateInitialState({ seed: 1937, difficulty: "Normal" });
  const state = Rules.CloneState(initial);
  const target = state.map.order.find((key) => {
    const hex = state.map.hexes[key];
    if (!hex || (!hex.railway && !(hex.road >= 1))) return false;
    if (Rules.GetStrongholdAt(state, key)) return false;
    return HexNeighborKeys(key).some(
      (nk) => state.map.hexes[nk] && !Rules.GetStrongholdAt(state, nk) && !Rules.GetEnemiesAt(state, nk).length,
    );
  });
  assert.ok(target, "地图上找不到可测试的铁路/公路格");
  const perch = HexNeighborKeys(target).find(
    (nk) => state.map.hexes[nk] && !Rules.GetStrongholdAt(state, nk) && !Rules.GetEnemiesAt(state, nk).length,
  );
  const unit = state.units.find((item) => {
    const stats = Rules.GetUnitStats(item.type);
    return stats.abilities.includes("Sabotage");
  });
  assert.ok(unit, "初始部队中没有可破袭的单位");
  unit.key = perch;
  unit.acted = false;
  const actions = Rules.ListContextActions(state, unit.id, target);
  const sabotage = actions.find((action) => action.kind === "Sabotage" && action.enabled !== false);
  assert.ok(sabotage, "相邻铁路/公路未列出可用破袭");
  assert.ok(sabotage.withdrawKey || (sabotage.withdrawOptions ?? []).length, "破袭动作缺撤退路线");
  const outcome = Rules.PerformAction(state, sabotage);
  assert.equal(outcome.report.ok, true, `破袭被结算条件打回：${outcome.report.reason ?? ""}`);
});

// ---------------------------------------------------------------------------
Section("九 · 玩法评审整改回归（打仗养根据地 / 残酷有牙 / 假选择变真）");

Test("打游击优于不抵抗的种田（缴获经济反转的总闸门）", () => {
  const seeds = [11, 22, 33];
  const fight = seeds.reduce((sum, seed) => sum + RunBotCached(seed, "skilled").total, 0) / seeds.length;
  const farm = seeds.reduce((sum, seed) => sum + RunBotCached(seed, "farmer").total, 0) / seeds.length;
  console.log(`      会玩(打+建) ${fight.toFixed(1)} · 纯种田 ${farm.toFixed(1)}`);
  assert.ok(fight >= farm + 8, `打仗(${fight.toFixed(1)})未领先纯种田(${farm.toFixed(1)})至少 8 分——游击战核心循环又成装饰了`);
});

Test("结局有多样性，且像样的一局不落失败结局", () => {
  const seeds = [11, 22, 33];
  const runs = [...seeds.map((seed) => RunBotCached(seed, "skilled")), ...seeds.map((seed) => RunBotCached(seed, "farmer"))];
  const titles = new Set(runs.map((run) => run.ending?.title).filter(Boolean));
  const best = runs.reduce((top, run) => (run.total > top.total ? run : top), runs[0]);
  console.log(`      结局分布：${[...titles].join(" / ")}；最好一局 ${best.grade}「${best.ending?.title}」`);
  assert.ok(titles.size >= 2, "全部路线殊途同归到同一结局——结局系统又校准死亡了");
  assert.ok(best.ending?.key !== "DrivenToTheHills", `最好的一局(${best.grade})仍被判「退回山里」`);
});

Test("据点补给与围困经济同一量纲", () => {
  const state = Rules.CreateInitialState({ seed: 7 });
  for (const stronghold of state.strongholds) {
    assert.ok(
      stronghold.supply >= 1 && stronghold.supply <= 20,
      `${stronghold.name} supply=${stronghold.supply}，围困断粮又变成数学上不可能了`,
    );
  }
});

Test("围困孤立炮楼一个时期内可拔除", () => {
  let state = Rules.CreateInitialState({ seed: 7 });
  const stronghold = state.strongholds.find((item) => item.type === "Blockhouse");
  assert.ok(stronghold, "初始地图上没有炮楼");
  const adjacent = HexNeighborKeys(stronghold.key).find((key) => Rules.GetHex(state, key));
  const unit = state.units[0];
  unit.key = adjacent;
  for (const key of [stronghold.key, ...HexNeighborKeys(stronghold.key)]) {
    const hex = Rules.GetHex(state, key);
    if (hex) hex.massBase = 70;
  }
  let cleared = false;
  for (let turn = 0; turn < 10 && !cleared; turn += 1) {
    const { nextState } = Combat.ResolveSiege(state, unit.id, stronghold.id, { mode: "Blockade" });
    state = nextState;
    cleared = Boolean(state.strongholds.find((item) => item.id === stronghold.id)?.destroyed);
  }
  assert.ok(cleared, "围困 10 回合仍未拔除孤立炮楼（补给量纲或投降判定退化）");
});

Test("扫荡造成的减员当回合不能被治疗抵消", () => {
  const state = Rules.CreateInitialState({ seed: 7 });
  const unit = state.units[0];
  state.sweepStance = "Fortify";
  state.sweep = { id: "sw1", targetKey: unit.key, turnsUntil: 0, strength: 60, axisKeys: [], radius: 2 };
  const { nextState } = Combat.ResolveSweepBattle(state, state.sweep);
  const hurt = nextState.units.find((item) => item.id === unit.id);
  assert.ok(hurt.hp < unit.maxHp, "依托工事抗击方针下，强扫荡应造成实际减员");
  const recovered = Combat.TickCombatRecovery(nextState);
  const after = (recovered.units ?? []).find((item) => item.id === unit.id);
  assert.ok(after && after.hp <= hurt.hp + 0.01, `扫荡伤害当回合就被治疗抵消（${hurt.hp} → ${after?.hp}）`);
});

Test("被打散的部队依托群众数季后归队", () => {
  let state = Rules.CreateInitialState({ seed: 7 });
  const unit = state.units[1];
  const hex = Rules.GetHex(state, unit.key);
  hex.massBase = 60;
  unit.hp = 0;
  const total = state.units.length;
  state = Rules.EndTurn(state).nextState;
  assert.equal(state.units.length, total - 1, "hp 归零的部队应先从序列消失");
  assert.equal((state.scattered ?? []).length, 1, "高群众基础地区被打散应进入待归队名单");
  for (let step = 0; step < 3 && (state.scattered ?? []).length; step += 1) {
    if (state.events.pending) state = Rules.ApplyEventChoice(state, state.events.pending, null);
    state = Rules.EndTurn(state).nextState;
  }
  assert.equal((state.scattered ?? []).length, 0, "被打散的部队迟迟未归队");
  assert.equal(state.units.length, total, "归队后的部队没有回到序列");
});

Test("预警信息量由情报网决定：无情报不全知", () => {
  const makeSweepState = () => {
    const state = Rules.CreateInitialState({ seed: 7 });
    const target = state.map.order[Math.floor(state.map.order.length / 2)];
    state.sweep = {
      id: "sw2",
      targetKey: target,
      turnsUntil: 2,
      strength: 40,
      axisKeys: HexNeighborKeys(target).slice(0, 3),
      axes: [{}, {}, {}],
    };
    return state;
  };
  const blind = makeSweepState();
  for (const key of blind.map.order) blind.map.hexes[key].intel = 0;
  blind.stock.intel = 0;
  if (blind.playerEffects) blind.playerEffects.sweepWarning = 0;
  const fog = Rules.ForecastSweep(blind);
  const blindExact = Boolean(fog && fog.targetKey === blind.sweep.targetKey && (fog.confidence ?? 1) >= 0.55);
  assert.ok(!blindExact, "情报清零仍给出高可信度精确预警——情报价值链又断了");
  const informed = makeSweepState();
  for (const key of informed.map.order) informed.map.hexes[key].intel = 100;
  informed.stock.intel = 240;
  const clear = Rules.ForecastSweep(informed);
  assert.ok(
    clear && clear.targetKey === informed.sweep.targetKey && (clear.confidence ?? 0) >= 0.7,
    "情报拉满仍看不清扫荡目标",
  );
});

Test("事件卡效果键全部有消费点（不许虚假发奖）", () => {
  const consumedKeys = new Set([
    "stockDelta", "exposureDelta", "alertDelta", "massDelta", "flags", "duration", "forceSweep",
    "yieldBonus", "flatYield", "massGrowth", "policySlots", "healRate", "exposureDecay",
    "intelRange", "combatAmbush", "combatDefence", "combatAttack", "captureRate",
    "buildSpeed", "moveBonus", "sabotageBonus", "siegeBonus", "garrisonReveal",
    "sweepWarning", "upkeepDiscount", "maintenanceDiscount", "populationGrowth", "unrestDecay", "baseSlots",
    "cadreGrowth", "tunnelMove", "seizureResist", "civilianShelter",
    "ambushBonus", "defenceBonus", "railSabotage", "literacy", "puppetDefection",
    "alertDecay", "researchSpeed", "medicineEfficiency", "concealment", "supplyRange",
    "unlockUnits", "unlockUnit", "unlockDistricts", "unlockDistrict",
    "unlockWorks", "unlockWork", "unlockPolicies", "unlockPolicy",
    "unlockResearch", "unlockTech", "unlockDoctrine",
  ]);
  const idPools = {
    unlockUnit: DataUnits.unitDefinitions ?? {},
    unlockUnits: DataUnits.unitDefinitions ?? {},
    unlockDistrict: DataUnits.districtDefinitions ?? {},
    unlockDistricts: DataUnits.districtDefinitions ?? {},
    unlockWork: DataTerrain.workDefinitions ?? {},
    unlockWorks: DataTerrain.workDefinitions ?? {},
    unlockPolicy: DataTech.policyDefinitions ?? {},
    unlockPolicies: DataTech.policyDefinitions ?? {},
    unlockTech: { ...(DataTech.techDefinitions ?? {}), ...(DataTech.doctrineDefinitions ?? {}) },
    unlockDoctrine: { ...(DataTech.techDefinitions ?? {}), ...(DataTech.doctrineDefinitions ?? {}) },
    unlockResearch: { ...(DataTech.techDefinitions ?? {}), ...(DataTech.doctrineDefinitions ?? {}) },
  };
  for (const event of DataHistory.historicalEvents ?? []) {
    for (const option of event.options ?? []) {
      for (const [key, value] of Object.entries(option.effects ?? {})) {
        assert.ok(consumedKeys.has(key), `事件《${event.title}》选项 ${option.id} 的效果键 ${key} 无消费点`);
        if (idPools[key]) {
          for (const id of Array.isArray(value) ? value : [value]) {
            assert.ok(idPools[key][id], `事件《${event.title}》选项 ${option.id} 引用不存在的 id：${key}=${id}`);
          }
        }
      }
    }
  }
});

Test("扫荡走全链路：战果与代价落在玩家可见处（测装配，不测零件）", () => {
  // 第二轮评审 P0：AI 采纳块只回抄部分字段，扫荡一半战果被静默丢弃、
  // 战报 0/26 可见。此闸门走真实 EndTurn 链路，直到一次扫荡真正执行。
  let state = Rules.CreateInitialState({ seed: 11 });
  let resolution = null;
  for (let step = 0; step < 24 && !resolution; step += 1) {
    if (state.events.pending) state = Rules.ApplyEventChoice(state, state.events.pending, null);
    state.exposure = Math.max(state.exposure, 66); // 高暴露逼扫荡立案
    const hadSweep = Boolean(state.sweep);
    const before = {
      ledger: { ...state.ledger },
      ledgerLogLength: (state.ledgerLog ?? []).length,
    };
    const outcome = Rules.EndTurn(state);
    if (hadSweep && !outcome.nextState.sweep) {
      resolution = { report: outcome.report, before, after: outcome.nextState };
    }
    state = outcome.nextState;
  }
  assert.ok(resolution, "24 回合高暴露仍没有一次扫荡被执行");
  const lines = resolution.report.lines.join("\n");
  assert.ok(/合围|扫荡/.test(lines), "扫荡结算在回合战报里完全不可见");
  const ledgerGrew = Rules.ledgerKeys.some(
    (key) => (resolution.after.ledger[key] ?? 0) > (resolution.before.ledger[key] ?? 0),
  );
  assert.ok(ledgerGrew, "扫荡执行后代价账本没有任何增长——战果又被采纳块丢弃了");
  assert.ok(
    (resolution.after.ledgerLog ?? []).length > resolution.before.ledgerLogLength,
    "扫荡执行后账本逐条记录没有新条目",
  );
  assert.ok(!resolution.after.sweepStance, "方针未在扫荡结束后清空（一次一定契约失效）");
});

Test("缴获入账与战报严格等值（不许双重入账）", () => {
  const state = Rules.CreateInitialState({ seed: 7 });
  const unit = state.units.find((item) => Rules.GetUnitStats(item.type).abilities.includes("Ambush"));
  const enemy = state.enemies[0];
  assert.ok(unit && enemy, "初始局面缺可伏击单位或敌军");
  enemy.key = HexNeighborKeys(unit.key).find((key) => Rules.GetHex(state, key)) ?? enemy.key;
  enemy.visibleToPlayer = true;
  unit.hidden = true;
  const hexUnderEnemy = Rules.GetHex(state, enemy.key);
  if (hexUnderEnemy) hexUnderEnemy.massBase = 60;
  const before = state.stock.ordnance;
  const outcome = Rules.PerformAction(state, { kind: "Attack", unitId: unit.id, targetKey: enemy.key });
  assert.equal(outcome.report.ok, true, `攻击未成立：${outcome.report.reason ?? ""}`);
  const reported = Number(outcome.report.captures?.ordnance) || 0;
  const applied = Math.round(((outcome.nextState.stock.ordnance ?? 0) - before) * 10) / 10;
  assert.ok(
    Math.abs(applied - reported) < 0.11,
    `战报缴获械 ${reported} 但库存实际 +${applied}——入账与战报不等值（翻倍或丢失）`,
  );
});

Test("围一下就走不能冻结据点补给（tap-and-run 走真实回合链路）", () => {
  let state = Rules.CreateInitialState({ seed: 7 });
  const strongholdId = state.strongholds.find((item) => item.type === "Blockhouse").id;
  const strongholdKey = state.strongholds.find((item) => item.id === strongholdId).key;
  const unit = state.units[0];
  unit.key = HexNeighborKeys(strongholdKey).find((key) => Rules.GetHex(state, key));
  const acted = Rules.PerformAction(state, { kind: "Siege", unitId: unit.id, strongholdId, mode: "Blockade" });
  assert.equal(acted.report.ok, true, `围困动作未成立：${acted.report.reason ?? ""}`);
  state = acted.nextState;
  const drained = state.strongholds.find((item) => item.id === strongholdId).supply;
  // 之后两回合不再围（原地歇着也算撤围），走真实 EndTurn——
  // 曾经 EndTurn 只回抄 units/enemies，据点恢复整体死机（第三轮复核 P0）。
  for (let step = 0; step < 2; step += 1) {
    if (state.events.pending) state = Rules.ApplyEventChoice(state, state.events.pending, null);
    state = Rules.EndTurn(state).nextState;
  }
  const target = state.strongholds.find((item) => item.id === strongholdId);
  assert.ok(
    target.destroyed || target.supply > drained,
    `撤围两回合后据点补给未恢复（${drained} → ${target.supply}）——采纳块又丢字段了`,
  );
});

Test("治疗要扣药（真实回合链路）", () => {
  let state = Rules.CreateInitialState({ seed: 7 });
  const unit = state.units[0];
  unit.hp = Math.max(6, unit.maxHp - 24);
  const hex = Rules.GetHex(state, unit.key);
  if (hex) hex.massBase = 60;
  state.stock.medicine = 30;
  const before = { id: unit.id, hp: unit.hp, medicine: state.stock.medicine };
  if (state.events.pending) state = Rules.ApplyEventChoice(state, state.events.pending, null);
  state = Rules.EndTurn(state).nextState;
  const after = state.units.find((item) => item.id === before.id);
  assert.ok(after && after.hp > before.hp, "受伤部队在群众掩护下未恢复");
  assert.ok(
    state.stock.medicine < before.medicine,
    `治疗没有消耗药品（${before.medicine} → ${state.stock.medicine}）——药的消费口又死了`,
  );
});

Test("围困不是零风险：守敌会出击袭扰围困部队", () => {
  let state = Rules.CreateInitialState({ seed: 7 });
  const stronghold = state.strongholds.find((item) => (item.garrison ?? 0) >= 5) ?? state.strongholds[0];
  stronghold.garrison = 6;
  stronghold.supply = 12;
  const adjacent = HexNeighborKeys(stronghold.key).find((key) => Rules.GetHex(state, key));
  const unit = state.units[0];
  unit.key = adjacent;
  let hurt = false;
  for (let step = 0; step < 12 && !hurt; step += 1) {
    state = Combat.ResolveSiege(state, unit.id, stronghold.id, { mode: "Blockade" }).nextState;
    const besieger = state.units.find((item) => item.id === unit.id);
    hurt = (besieger.hp ?? besieger.maxHp) < besieger.maxHp;
    const target = state.strongholds.find((item) => item.id === stronghold.id);
    if (target) target.supply = 12; // 维持补给，聚焦出击判定本身
  }
  assert.ok(hurt, "12 回合围困零伤亡——围困又成了无风险最优解");
});

Test("unrest 高企有真实后果：不安的根据地产出打折", () => {
  const run = RunBotCached(11, "farmer");
  const state = Rules.CloneState(run.finalState);
  assert.ok(state.bases.length, "对照局面里没有根据地");
  for (const base of state.bases) base.unrest = 0;
  Rules.RecomputeEconomy(state);
  const calm = state.income.grain;
  for (const base of state.bases) base.unrest = 80;
  Rules.RecomputeEconomy(state);
  const troubled = state.income.grain;
  assert.ok(troubled < calm, `unrest 80 的粮产(${troubled})未低于 unrest 0(${calm})——unrest 又成死状态`);
});

Test("时期经济修正真实生效：困难期产出低于恢复期", () => {
  const run = RunBotCached(11, "farmer");
  const state = Rules.CloneState(run.finalState);
  state.turn = 16;
  Rules.RecomputeEconomy(state);
  const hardship = state.income.grain;
  state.turn = 24;
  Rules.RecomputeEconomy(state);
  const recovery = state.income.grain;
  assert.ok(
    hardship < recovery,
    `困难期粮产(${hardship})未低于恢复期(${recovery})——era.modifiers 又成死数据`,
  );
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
