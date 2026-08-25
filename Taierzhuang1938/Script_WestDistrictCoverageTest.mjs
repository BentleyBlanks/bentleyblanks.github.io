// 西关总览覆盖守卫：L4 是城防外轮廓的编辑器验收切片，必须真把津浦铁路与
// 西关整条功能带生成进来；不能只靠 landmark 的宽松半径“蹭进来”几栋孤楼。

import assert from "node:assert/strict";
import { PHASES } from "./Data_Battle.mjs";
import { WEST_SUBURB } from "./Data_Tengxian.mjs";
import { REGION, PLACEMENTS } from "./Data_Dressing_WestSuburb.mjs";
import { TownDressingFor } from "./Script_TownDressing.mjs";

const overview = PHASES.find((phase) => phase.id === "L4_Chengqiang");
assert.ok(overview, "L4_Chengqiang overview phase is required");

const { bounds } = overview;
const contains = (x, z) => x >= bounds.minX && x <= bounds.maxX
  && z >= bounds.minZ && z <= bounds.maxZ;

for (const [id, feature] of Object.entries({
  Station: WEST_SUBURB.station,
  Communications: WEST_SUBURB.communications,
  PowerPlant: WEST_SUBURB.powerPlant,
  Exchange: WEST_SUBURB.exchange,
  Division122: WEST_SUBURB.division122,
})) {
  assert.ok(contains(feature.x, feature.z), `${id} center must be inside the L4 overview slice`);
}

assert.ok(bounds.minX <= WEST_SUBURB.railway.x - 20,
  "L4 overview must include visible ground west of the Jinpu railway, not clip on the rail centerline");
assert.ok(bounds.minX <= Math.min(...PLACEMENTS.map((placement) => placement.x)),
  "L4 overview must include the westernmost authored west-suburb dressing");
assert.ok(bounds.maxX >= REGION.bounds.maxX && bounds.minZ <= REGION.bounds.minZ
  && bounds.maxZ >= REGION.bounds.maxZ,
"L4 overview must contain the west-suburb authored region on its other three sides");

const authoredWest = new Set(PLACEMENTS);
const visibleDressing = TownDressingFor(bounds)
  .filter((placement) => authoredWest.has(placement));
assert.equal(visibleDressing.length, PLACEMENTS.length,
  "L4 overview must generate every authored west-suburb dressing placement");

console.log(`West district overview: PASS (${visibleDressing.length} dressing placements + 5 landmarks)`);
