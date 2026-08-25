import assert from "node:assert/strict";
import { EAST_SUBURB } from "./Data_Tengxian.mjs";

const blocks = EAST_SUBURB.mapBlocks;
const lanes = EAST_SUBURB.mapLanes;

assert.equal(blocks.length, 13, "布防图右侧必须完整登记 13 个闭合框");
assert.equal(blocks.filter((b) => b.sourceGroup === "core").length, 6, "核心东关应有 6 框");
assert.equal(blocks.filter((b) => b.sourceGroup === "northEast").length, 5, "东北延伸应有 5 框");
assert.equal(blocks.filter((b) => b.sourceGroup === "southEast").length, 2, "东南延伸应有 2 框");
assert.equal(new Set(blocks.map((b) => b.id)).size, blocks.length, "图框 id 不得重复");
const griddedUnits = blocks.reduce((sum, block) => sum + (block.grid ? block.grid.cols * block.grid.rows : 0), 0);
assert.ok(griddedUnits >= 200, "无名长框必须细分为至少 200 个可见房院/铺仓单元");

const named = blocks.filter((b) => b.kind === "districtOffice" || b.kind === "battalion");
assert.deepEqual(named.map((b) => b.id).sort(), ["Battalion731", "FirstDistrictOffice"]);
for (const feature of EAST_SUBURB.features) {
  const block = blocks.find((b) => b.id === feature.id);
  assert.ok(block, `${feature.id} 必须映射到完整闭合框`);
  const namedBuilding = block.rows?.find((row) => row.id === feature.id);
  assert.ok(namedBuilding, `${feature.id} 的专属建筑必须位于对应整框内`);
  for (const key of ["x", "z", "w", "d"]) assert.equal(feature[key], namedBuilding[key], `${feature.id}.${key} 必须与整框内专属建筑一致`);
}

for (const id of ["EastNorthEastNotchedCompound", "FirstDistrictOffice", "Battalion731"]) {
  assert.ok(blocks.find((b) => b.id === id)?.polygon?.length >= 5, `${id} 必须保留非矩形外轮廓`);
}

function bounds(rect) {
  return { x0: rect.x - rect.w / 2, x1: rect.x + rect.w / 2, z0: rect.z - rect.d / 2, z1: rect.z + rect.d / 2 };
}

function overlap(a, b, clearance = 0) {
  const aa = bounds(a), bb = bounds(b);
  return aa.x0 < bb.x1 + clearance && aa.x1 > bb.x0 - clearance
    && aa.z0 < bb.z1 + clearance && aa.z1 > bb.z0 - clearance;
}

for (let i = 0; i < blocks.length; i += 1) {
  const block = blocks[i];
  assert.ok(block.x - block.w / 2 >= EAST_SUBURB.bounds.minX - 0.01, `${block.id} 越过东区西界`);
  assert.ok(block.x + block.w / 2 <= EAST_SUBURB.bounds.maxX + 0.01, `${block.id} 越过东区东界`);
  assert.ok(block.z - block.d / 2 >= EAST_SUBURB.bounds.minZ - 0.01, `${block.id} 越过东区北界`);
  assert.ok(block.z + block.d / 2 <= EAST_SUBURB.bounds.maxZ + 0.01, `${block.id} 越过东区南界`);
  for (let j = i + 1; j < blocks.length; j += 1) {
    assert.equal(overlap(block, blocks[j]), false, `${block.id} 与 ${blocks[j].id} 的整框不得相叠`);
  }
  if (block.rows?.length) {
    const explicit = block.rows.filter((row) => ["x", "z", "w", "d"].every((key) => Number.isFinite(row[key])));
    const occupiedArea = explicit.reduce((sum, row) => sum + row.w * row.d, 0);
    if (explicit.length === block.rows.length) {
      assert.ok(occupiedArea >= block.w * block.d * 0.84, `${block.id} 的房院覆盖不足整框 84%`);
    }
  }
}

assert.equal(lanes.find((lane) => lane.id === "EastGuangStreet")?.label, "东关大街");
const westCore = blocks.filter((b) => ["FirstDistrictOffice", "EastSouthWestLongCompound"].includes(b.id));
const eastCore = blocks.filter((b) => ["Battalion731", "EastSouthEastLongCompound"].includes(b.id));
const spine = lanes.find((lane) => lane.id === "EastGuangStreet");
for (const block of [...westCore, ...eastCore]) assert.equal(overlap(block, spine), false, `东关大街不得穿过 ${block.id}`);

console.log("Script_EastSuburbBlocksTest: 13 map frames, named footprints, coverage, and lanes passed.");
