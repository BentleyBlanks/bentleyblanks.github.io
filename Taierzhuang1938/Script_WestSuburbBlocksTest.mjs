// 西关街区覆盖验收：数据占地、地标关系、净空与生成器输出必须一起成立。
//
// 这是 Node 级测试；不启动 renderer。生成器以 BeginBlock/EndBlock 将 sink 输出归属
// 到街区，避免"全场有几栋房"掩盖某一地块没有生成院落的回归。

import assert from "node:assert/strict";
import { PHASES } from "./Data_Battle.mjs";
import {
  WEST_SUBURB_BLOCKS,
  WEST_SUBURB_NAMED_BLOCKS,
  WEST_SUBURB_ALL_BLOCKS,
  WEST_SUBURB_CLEARANCES,
} from "./Data_WestSuburbBlocks.mjs";
import { BuildWestSuburbBlocks } from "./Script_WestSuburbBlocks.mjs";

const overview = PHASES.find((phase) => phase.id === "L4_Chengqiang");
assert.ok(overview, "L4_Chengqiang overview phase is required");
const { bounds } = overview;

const REQUIRED_LANDMARKS = ["station", "communications", "powerPlant", "exchange"];
const REQUIRED_CLEARANCES = ["railway", "westStreet", "moat", "wall"];
const MIN_BLOCKS = 14;
const EPSILON = 1e-6;

function NumberField(value, label) {
  assert.equal(typeof value, "number", `${label} must be a number`);
  assert.ok(Number.isFinite(value), `${label} must be finite`);
  return value;
}

function BlockRect(block) {
  const x = NumberField(block.x, `${block.id}.x`);
  const z = NumberField(block.z, `${block.id}.z`);
  const w = NumberField(block.w, `${block.id}.w`);
  const d = NumberField(block.d, `${block.id}.d`);
  assert.ok(w > 0 && d > 0, `${block.id} must have a positive rectangular footprint`);
  return { minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 };
}

function IsInside(rect, outer) {
  return rect.minX >= outer.minX - EPSILON && rect.maxX <= outer.maxX + EPSILON
    && rect.minZ >= outer.minZ - EPSILON && rect.maxZ <= outer.maxZ + EPSILON;
}

function Overlaps(a, b) {
  return a.minX < b.maxX - EPSILON && a.maxX > b.minX + EPSILON
    && a.minZ < b.maxZ - EPSILON && a.maxZ > b.minZ + EPSILON;
}

function RectFromClearance(value, label) {
  assert.ok(value && typeof value === "object", `${label} clearance is required`);
  if (Array.isArray(value.rects)) return value.rects.flatMap((entry, index) => RectFromClearance(entry, `${label}[${index}]`));
  if (Array.isArray(value)) return value.flatMap((entry, index) => RectFromClearance(entry, `${label}[${index}]`));
  if (value.rect) return RectFromClearance(value.rect, label);

  if ([value.minX, value.maxX, value.minZ, value.maxZ].every(Number.isFinite)) {
    assert.ok(value.minX < value.maxX && value.minZ < value.maxZ, `${label} rectangle must have area`);
    return [{ minX: value.minX, maxX: value.maxX, minZ: value.minZ, maxZ: value.maxZ }];
  }

  const half = value.halfWidth ?? value.half ?? (Number.isFinite(value.width) ? value.width / 2 : null);
  assert.ok(Number.isFinite(half) && half > 0, `${label} needs halfWidth (or width)`);
  if (Number.isFinite(value.x) && Number.isFinite(value.fromZ) && Number.isFinite(value.toZ)) {
    return [{
      minX: value.x - half, maxX: value.x + half,
      minZ: Math.min(value.fromZ, value.toZ), maxZ: Math.max(value.fromZ, value.toZ),
    }];
  }
  if (Number.isFinite(value.z) && Number.isFinite(value.fromX) && Number.isFinite(value.toX)) {
    return [{
      minX: Math.min(value.fromX, value.toX), maxX: Math.max(value.fromX, value.toX),
      minZ: value.z - half, maxZ: value.z + half,
    }];
  }
  if ([value.x, value.z, value.w, value.d].every(Number.isFinite)) {
    return [{
      minX: value.x - value.w / 2, maxX: value.x + value.w / 2,
      minZ: value.z - value.d / 2, maxZ: value.z + value.d / 2,
    }];
  }
  assert.fail(`${label} must be an axis-aligned rect, an x/z strip, or contain rects`);
}

function LandmarkTokens(block) {
  const values = [block.id, block.kind, block.landmark, ...(block.landmarks || []),
    ...(block.features || []), ...(block.related || []), ...(block.anchors || [])];
  return values.filter((value) => typeof value === "string")
    .map((value) => value.replace(/[^a-z0-9]/gi, "").toLowerCase());
}

function HasLandmark(block, landmark) {
  const needle = landmark.replace(/[^a-z0-9]/gi, "").toLowerCase();
  return LandmarkTokens(block).some((token) => token.includes(needle));
}

assert.ok(Array.isArray(WEST_SUBURB_BLOCKS), "WEST_SUBURB_BLOCKS must be an array");
assert.ok(Array.isArray(WEST_SUBURB_NAMED_BLOCKS), "WEST_SUBURB_NAMED_BLOCKS must be an array");
assert.ok(Array.isArray(WEST_SUBURB_ALL_BLOCKS), "WEST_SUBURB_ALL_BLOCKS must be an array");
assert.ok(WEST_SUBURB_BLOCKS.length >= MIN_BLOCKS,
  `west suburb needs at least ${MIN_BLOCKS} unnamed authored rectangular blocks`);
assert.equal(WEST_SUBURB_ALL_BLOCKS.length,
  WEST_SUBURB_BLOCKS.length + WEST_SUBURB_NAMED_BLOCKS.length,
  "all-block registry must include named and unnamed diagram rectangles exactly once");

const blockIds = new Set();
for (const block of WEST_SUBURB_ALL_BLOCKS) {
  assert.ok(block && typeof block === "object", "every west-suburb block must be an object");
  assert.equal(typeof block.id, "string", "every west-suburb block needs a string id");
  assert.ok(block.id.length > 0, "west-suburb block ids cannot be empty");
  assert.ok(!blockIds.has(block.id), `duplicate west-suburb block id: ${block.id}`);
  blockIds.add(block.id);
  assert.equal(typeof block.kind, "string", `${block.id} needs a string kind`);
  assert.ok(block.kind.length > 0, `${block.id} kind cannot be empty`);

  const rect = BlockRect(block);
  assert.ok(IsInside(rect, bounds), `${block.id} footprint must sit wholly inside L4_Chengqiang`);
}

for (let i = 0; i < WEST_SUBURB_ALL_BLOCKS.length; i += 1) {
  for (let j = i + 1; j < WEST_SUBURB_ALL_BLOCKS.length; j += 1) {
    const a = WEST_SUBURB_ALL_BLOCKS[i], b = WEST_SUBURB_ALL_BLOCKS[j];
    assert.ok(!Overlaps(BlockRect(a), BlockRect(b)),
      `${a.id} and ${b.id} must remain separate diagram rectangles with an alley between them`);
  }
}

for (const landmark of REQUIRED_LANDMARKS) {
  assert.ok(WEST_SUBURB_NAMED_BLOCKS.some((block) => HasLandmark(block, landmark)),
    `${landmark} needs a corresponding or explicitly associated west-suburb block`);
}

// 具名长框不能再退回“小地标摆在大空框中央”。车站因站台有意贴轨是例外；其余
// 专用 builder 的数据 footprint 必须落在框内，且至少覆盖框面积的 40%。
for (const block of WEST_SUBURB_NAMED_BLOCKS) {
  if (block.landmark === "station") continue;
  assert.ok(block.source, `${block.id} needs its dedicated landmark source footprint`);
  const sourceRect = BlockRect({ id: `${block.id}.source`, ...block.source });
  assert.ok(IsInside(sourceRect, BlockRect(block)), `${block.id} source must sit inside its full diagram block`);
  const ratio = (block.source.w * block.source.d) / (block.w * block.d);
  assert.ok(ratio >= 0.40, `${block.id} dedicated model footprint must cover at least 40% of its diagram block`);
}

assert.ok(WEST_SUBURB_CLEARANCES && typeof WEST_SUBURB_CLEARANCES === "object",
  "WEST_SUBURB_CLEARANCES is required to protect the west-suburb circulation and defenses");
for (const clearanceName of REQUIRED_CLEARANCES) {
  const clearanceRects = RectFromClearance(WEST_SUBURB_CLEARANCES[clearanceName], clearanceName);
  for (const block of WEST_SUBURB_ALL_BLOCKS) {
    const footprint = BlockRect(block);
    assert.ok(!clearanceRects.some((clearance) => Overlaps(footprint, clearance)),
      `${block.id} footprint must not enter ${clearanceName} clearance`);
  }
}

function MakeHost() {
  const byBlock = new Map(WEST_SUBURB_BLOCKS.map((block) => [block.id, {
    adds: [], solids: [], covers: [], began: 0, ended: 0,
  }]));
  let active = null;
  const requireActive = (operation) => {
    assert.ok(active, `${operation} must be emitted inside host.BeginBlock/EndBlock`);
    return byBlock.get(active.id);
  };
  const sink = {
    Add(material, geometry) { requireActive("geometry").adds.push({ material, geometry }); },
    Solid(x, y, z, hx, hy, hz, tag, ry = 0) {
      requireActive("solid").solids.push({ x, y, z, hx, hy, hz, tag, ry });
    },
    Cover(x, z, height, nx, nz) { requireActive("cover").covers.push({ x, z, height, nx, nz }); },
    SetSector() {},
  };
  const westStreet = RectFromClearance(WEST_SUBURB_CLEARANCES.westStreet, "westStreet");
  return {
    sink,
    BeginBlock(block) {
      assert.equal(active, null, "BeginBlock calls cannot nest");
      assert.ok(byBlock.has(block.id), `generator began unknown block ${block.id}`);
      active = block;
      byBlock.get(block.id).began += 1;
    },
    EndBlock(block) {
      assert.equal(active?.id, block.id, `EndBlock must match active block ${block.id}`);
      byBlock.get(block.id).ended += 1;
      active = null;
    },
    OnStreet(x, z, hx = 0, hz = 0) {
      const footprint = { minX: x - hx, maxX: x + hx, minZ: z - hz, maxZ: z + hz };
      return westStreet.some((street) => Overlaps(footprint, street));
    },
    OuterHeight: () => 0,
    GroundHeight: () => 0,
    metrics: byBlock,
    AssertClosed() { assert.equal(active, null, "generator must close its last active block"); },
  };
}

function MaterialName(material) {
  return typeof material === "string" ? material.toLowerCase() : "";
}

function IsRoof(material) {
  const name = MaterialName(material);
  return name.includes("roof") || name.includes("tile");
}

function IsWall(material) {
  const name = MaterialName(material);
  return name.includes("wall") || name.includes("brick") || name.includes("adobe");
}

const host = MakeHost();
BuildWestSuburbBlocks(host, WEST_SUBURB_BLOCKS, {
  groundAt: () => 0,
  damage: 0,
  phase: "L4_Chengqiang",
});
host.AssertClosed();

for (const block of WEST_SUBURB_BLOCKS) {
  const metric = host.metrics.get(block.id);
  const roofs = metric.adds.filter((entry) => IsRoof(entry.material));
  const walls = metric.adds.filter((entry) => IsWall(entry.material));
  assert.equal(metric.began, 1, `${block.id} must start exactly one attributed build`);
  assert.equal(metric.ended, 1, `${block.id} must finish exactly one attributed build`);
  assert.ok(metric.adds.length >= 10, `${block.id} needs an authored geometry set, not a marker`);
  assert.ok(metric.solids.length >= 4, `${block.id} needs multiple solid collision volumes`);
  assert.ok(roofs.length >= 2, `${block.id} needs multiple roof geometry pieces for a full compound`);
  assert.ok(walls.length >= 4, `${block.id} needs multiple wall geometry pieces for a full compound`);
}

for (const metric of host.metrics.values()) {
  for (const { geometry } of metric.adds) geometry?.dispose?.();
}

console.log(`West suburb blocks: PASS (${WEST_SUBURB_BLOCKS.length} blocks, full-compound geometry and clearances)`);
