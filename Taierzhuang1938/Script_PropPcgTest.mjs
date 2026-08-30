// 工事 / 生活用具 PCG 的纯 Node 回归：确定性、跨切片同户稳定、规则裁决与数据完整性。

import assert from "node:assert/strict";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import {
  PROP_PCG_ASSET_RULES, PROP_PCG_DOCUMENT, PROP_PCG_PROFILES,
} from "./Data_PropPcg.mjs";
import {
  GeneratePropPcg, NormalizePropPcgDocument, ValidatePropPcgDocument,
} from "./Script_PropPcg.mjs";

let checks = 0;
function Check(name, fn) {
  fn();
  checks += 1;
  console.log(`ok  ${name}`);
}

const flatGround = () => 0;
const cells = [
  { x: -20, z: 0, w: 18, d: 16, seed: "HomeA" },
  { x: 20, z: 0, w: 18, d: 16, seed: "HomeB" },
  { x: 60, z: 0, w: 18, d: 16, seed: "HomeC" },
];

const cellDocument = {
  version: 2,
  seed: 417,
  volumes: [{
    id: "TestCells", label: "测试院落", enabled: true,
    profile: "householdLife", shape: "cells",
    bounds: { minX: -40, maxX: 80, minZ: -20, maxZ: 20 },
    chance: 1, maxAnchors: 8, attemptsPerAnchor: 30, inset: 2, minSpacing: 4,
  }],
};

function Generate(document = cellDocument, overrides = {}) {
  return GeneratePropPcg(document, {
    bounds: { minX: -100, maxX: 100, minZ: -50, maxZ: 50 },
    cells, blockers: [], fixedPlacements: [], groundAt: flatGround,
    assetIds: Object.keys(PROP_PCG_ASSET_RULES),
    ...overrides,
  });
}

Check("出厂文档与 profile 的资产引用完整", () => {
  assert.deepEqual(ValidatePropPcgDocument(PROP_PCG_DOCUMENT, {
    assetIds: Object.keys(PROP_PCG_ASSET_RULES),
  }), []);
  assert.ok(Object.keys(PROP_PCG_PROFILES).length >= 4);
});

Check("相同种子与环境逐字段确定", () => {
  const a = Generate();
  const b = Generate();
  assert.deepEqual(a, b);
  assert.ok(a.placements.length >= 6, `placements=${a.placements.length}`);
  assert.equal(a.stats.anchors, 3);
  assert.ok(a.placements.every((entry) => entry.solid === false),
    "自动小物默认不得写入 AI / 玩家物理世界");
});

Check("同一户在不同章节切片里保持同一模板、坐标、朝向与尺度", () => {
  const all = Generate();
  const slice = Generate(cellDocument, {
    bounds: { minX: 10, maxX: 32, minZ: -20, maxZ: 20 },
    cells: [cells[1]],
  });
  const fromAll = all.placements.filter((entry) => entry.x > 10 && entry.x < 32)
    .map(({ asset, x, z, ry, scale }) => ({ asset, x, z, ry, scale }));
  const fromSlice = slice.placements.map(({ asset, x, z, ry, scale }) => ({ asset, x, z, ry, scale }));
  assert.deepEqual(fromSlice, fromAll);
});

Check("院落 volume 的 seedOffset 会改变候选与摆法", () => {
  const shifted = structuredClone(cellDocument);
  shifted.volumes[0].seedOffset = 991;
  assert.notDeepEqual(Generate(shifted).placements, Generate(cellDocument).placements);
});

Check("真实 AABB 能拒绝整组而不是只挪开单件", () => {
  const blocked = Generate(cellDocument, {
    blockers: [{ min: [-100, -10, -100], max: [100, 10, 100] }],
  });
  assert.equal(blocked.placements.length, 0);
  assert.ok(blocked.stats.rejected.collision > 0);
});

Check("固定手摆件参与净空裁决", () => {
  const fixed = Generate(cellDocument, {
    fixedPlacements: cells.map((cell) => ({ asset: "battlefieldCanvasCover01", x: cell.x, z: cell.z, scale: 20 })),
  });
  assert.equal(fixed.placements.length, 0);
  assert.ok(fixed.stats.rejected.fixed > 0);
});

Check("陡坡按 profile 上限整组拒绝", () => {
  const steep = Generate(cellDocument, { groundAt: (x) => x * 0.8 });
  assert.equal(steep.placements.length, 0);
  assert.ok(steep.stats.rejected.slope > 0);
});

Check("矩形区达到目标组数且守最小间距", () => {
  const document = {
    version: 2, seed: 918,
    volumes: [{
      id: "DefenseTest", label: "测试工事", enabled: true,
      profile: "defenseSupport", shape: "rect",
      bounds: { minX: -80, maxX: 80, minZ: -18, maxZ: 18 },
      count: 6, attemptsPerAnchor: 50, inset: 2, minSpacing: 14, axisYaw: 0,
    }],
  };
  const result = Generate(document, { cells: [] });
  assert.equal(result.stats.anchors, 6);
  assert.ok(result.placements.every((entry) => entry.x > -80 && entry.x < 80
    && entry.z > -18 && entry.z < 18));
});

Check("样条按弧长排布、朝向跟随切线且显式生成实体工事", () => {
  const document = {
    version: 2, seed: 1203,
    volumes: [{
      id: "WireSpline", label: "测试铁丝网", enabled: true,
      profile: "defenseWireLine", shape: "spline",
      bounds: { minX: -4, maxX: 44, minZ: -8, maxZ: 20 },
      points: [[0, 0], [20, 0], [40, 12]], spacing: 3.1,
      startInset: 0.2, endInset: 0.2, sideOffset: 0, sideJitter: 0,
      alongJitter: 0, minSpacing: 0,
    }],
  };
  const result = Generate(document, {
    bounds: { minX: -10, maxX: 50, minZ: -20, maxZ: 30 }, cells: [],
  });
  assert.equal(result.errors.length, 0);
  assert.ok(result.placements.length >= 12, `placements=${result.placements.length}`);
  assert.ok(result.placements.every((entry) => entry.solid === true));
  const turns = result.placements.map((entry) => entry.ry);
  assert.ok(Math.max(...turns) - Math.min(...turns) > 0.2, "折线后的样条朝向没有随切线转动");
});

Check("样条槽位跨章节切片保持资产、坐标、朝向与尺度", () => {
  const document = {
    version: 2, seed: 772,
    volumes: [{
      id: "StableLine", label: "跨片散兵线", enabled: true,
      profile: "defenseFiringLine", shape: "spline",
      bounds: { minX: -45, maxX: 45, minZ: -5, maxZ: 5 },
      points: [[-40, 0], [40, 0]], spacing: 8,
      startInset: 0, endInset: 0, sideOffset: 0, sideJitter: 0,
      alongJitter: 0, minSpacing: 0,
    }],
  };
  const all = Generate(document, {
    bounds: { minX: -50, maxX: 50, minZ: -10, maxZ: 10 }, cells: [],
  });
  const slice = Generate(document, {
    bounds: { minX: 0, maxX: 50, minZ: -10, maxZ: 10 }, cells: [],
  });
  const fromAll = all.placements.filter((entry) => entry.x >= 0)
    .map(({ asset, x, z, ry, scale }) => ({ asset, x, z, ry, scale }));
  const fromSlice = slice.placements.map(({ asset, x, z, ry, scale }) => ({ asset, x, z, ry, scale }));
  assert.deepEqual(fromSlice, fromAll);
});

Check("样条 exclusion 能切出门洞而不移动两侧模块", () => {
  const document = {
    version: 2, seed: 992,
    volumes: [{
      id: "GateGap", label: "门洞缺口", enabled: true,
      profile: "defenseFiringLine", shape: "spline",
      bounds: { minX: -34, maxX: 34, minZ: -5, maxZ: 5 },
      points: [[-30, 0], [30, 0]], spacing: 6,
      startInset: 0, endInset: 0, sideOffset: 0, sideJitter: 0,
      alongJitter: 0, minSpacing: 0,
      exclusions: [{ shape: "rect", bounds: { minX: -5, maxX: 5, minZ: -3, maxZ: 3 } }],
    }],
  };
  const result = Generate(document, {
    bounds: { minX: -40, maxX: 40, minZ: -10, maxZ: 10 }, cells: [],
  });
  assert.ok(result.placements.length > 0);
  assert.ok(result.placements.every((entry) => Math.abs(entry.x) > 5));
  assert.ok(result.stats.rejected.exclusion > 0);
});

Check("导入规范化会限数量、坐标与数值", () => {
  const normalized = NormalizePropPcgDocument({
    version: 99, seed: "7", volumes: [{
      id: "坏 id!", label: "测试", profile: "missing", shape: "anything",
      bounds: { minX: 9999, maxX: -9999, minZ: 5, maxZ: 5 },
      chance: 7, count: 9999, minSpacing: -4,
    }],
  });
  assert.equal(normalized.version, 2);
  assert.equal(normalized.volumes[0].id, "__id_");
  assert.equal(normalized.volumes[0].profile, "householdLife");
  assert.equal(normalized.volumes[0].chance, 1);
  assert.equal(normalized.volumes[0].count, 256);
  assert.equal(normalized.volumes[0].minSpacing, 0);
  assert.deepEqual(NormalizePropPcgDocument(normalized), normalized);
});

Check("规则层没有 Math.random 且不 import three", () => {
  const source = fs.readFileSync(fileURLToPath(new URL("./Script_PropPcg.mjs", import.meta.url)), "utf8");
  assert.doesNotMatch(source, /Math\.random\s*\(/);
  assert.doesNotMatch(source, /from\s+["']three["']/);
});

console.log(`PROP_PCG_TEST_OK checks=${checks}`);
