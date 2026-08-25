import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";


const root = path.dirname(fileURLToPath(import.meta.url));

function ReadGlb(fileName, maxBytes = 300_000) {
  const bytes = fs.readFileSync(path.join(root, "Model", fileName));
  assert.equal(bytes.readUInt32LE(0), 0x46546c67, `${fileName}: glTF magic`);
  assert.equal(bytes.readUInt32LE(4), 2, `${fileName}: glTF version`);
  assert.equal(bytes.readUInt32LE(8), bytes.length, `${fileName}: declared length`);
  assert.ok(bytes.length < maxBytes, `${fileName}: runtime package stays below ${maxBytes} bytes`);
  const jsonLength = bytes.readUInt32LE(12);
  assert.equal(bytes.readUInt32LE(16), 0x4e4f534a, `${fileName}: first chunk is JSON`);
  const json = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString("utf8").trim());
  return { bytes, json };
}

function InspectNodes(fileName, maxBytes) {
  const { bytes, json } = ReadGlb(fileName, maxBytes);
  const result = new Map();
  for (const node of json.nodes ?? []) {
    if (node.mesh == null) continue;
    const mesh = json.meshes[node.mesh];
    let triangles = 0;
    let minY = Infinity;
    let maxSpan = 0;
    for (const primitive of mesh.primitives) {
      const positions = json.accessors[primitive.attributes.POSITION];
      const indexCount = primitive.indices == null
        ? positions.count : json.accessors[primitive.indices].count;
      triangles += indexCount / 3;
      minY = Math.min(minY, positions.min[1]);
      maxSpan = Math.max(maxSpan, ...positions.max.map((value, axis) => value - positions.min[axis]));
    }
    result.set(node.name, { triangles, minY, maxSpan });
  }
  return { bytes: bytes.length, nodes: result };
}

const crates = InspectNodes("Model_MilitaryCrateSet.glb");
assert.deepEqual([...crates.nodes.keys()].sort(), ["MilitaryCrateClosed", "MilitaryCrateOpen"]);
for (const spec of crates.nodes.values()) {
  assert.ok(spec.triangles <= 2400, "crate triangle budget");
  assert.equal(spec.minY, 0, "crate is ground-ready");
  assert.ok(spec.maxSpan > 0.7 && spec.maxSpan < 1.1, "crate scale is plausible");
}

const stones = InspectNodes("Model_StackableStoneSet.glb");
assert.equal(stones.nodes.size, 7, "seven independently selectable stones");
for (let index = 1; index <= 7; index += 1) {
  const spec = stones.nodes.get(`StackableStone${String(index).padStart(2, "0")}`);
  assert.ok(spec, `stone ${index} node exists`);
  assert.ok(spec.triangles <= 1000, `stone ${index} triangle budget`);
  assert.equal(spec.minY, 0, `stone ${index} is ground-ready`);
  assert.ok(spec.maxSpan >= 0.39 && spec.maxSpan <= 0.76, `stone ${index} is stackable prop scale`);
}

const trunks = InspectNodes("Model_DeadTreeTrunkSet.glb");
assert.deepEqual([...trunks.nodes.keys()].sort(), ["DeadTreeTrunk01", "DeadTreeTrunk02"]);
for (const spec of trunks.nodes.values()) {
  assert.ok(spec.triangles <= 2400, "trunk triangle budget");
  assert.equal(spec.minY, 0, "trunk is ground-ready");
  assert.ok(spec.maxSpan >= 3 && spec.maxSpan <= 4.1, "trunk keeps real-world length");
}

const courtyard = InspectNodes("Model_AncientChineseCourtyardHouse.glb", 400_000);
assert.deepEqual([...courtyard.nodes.keys()], ["AncientChineseCourtyardHouse"]);
const courtyardSpec = courtyard.nodes.get("AncientChineseCourtyardHouse");
assert.ok(courtyardSpec.triangles <= 5500, "courtyard triangle budget");
assert.equal(courtyardSpec.minY, 0, "courtyard is ground-ready");
assert.ok(courtyardSpec.maxSpan > 11 && courtyardSpec.maxSpan < 12, "courtyard scale is plausible");

const battlefield = InspectNodes("Model_BattlefieldPack.glb", 3_200_000);
assert.equal(battlefield.nodes.size, 24, "all 24 battlefield components are independent nodes");
for (const [name, spec] of battlefield.nodes) {
  assert.ok(spec.triangles <= 3500, `${name} triangle budget`);
  assert.equal(spec.minY, 0, `${name} is ground-ready`);
}

const handcart = InspectNodes("Model_Handcart.glb");
assert.deepEqual([...handcart.nodes.keys()], ["MarketHandcart"]);
const handcartSpec = handcart.nodes.get("MarketHandcart");
assert.ok(handcartSpec.triangles <= 4200, "replacement handcart triangle budget");
assert.equal(handcartSpec.minY, 0, "replacement handcart is ground-ready");
assert.ok(handcartSpec.maxSpan >= 2.44 && handcartSpec.maxSpan <= 2.46, "replacement handcart keeps game scale");

const market = InspectNodes("Model_MarketStorageSet.glb");
assert.equal(market.nodes.size, 9, "two rice sacks and seven box variants are independent nodes");
for (const [name, spec] of market.nodes) {
  assert.ok(spec.triangles <= 900, `${name} triangle budget`);
  assert.equal(spec.minY, 0, `${name} is ground-ready`);
  assert.ok(spec.maxSpan >= 0.5 && spec.maxSpan <= 0.96, `${name} has hand-placeable scale`);
}

const runtime = fs.readFileSync(path.join(root, "Script_ExternalProps.mjs"), "utf8");
for (const id of [
  "militaryCrateClosed", "militaryCrateOpen",
  ...Array.from({ length: 7 }, (_, index) => `stackableStone${String(index + 1).padStart(2, "0")}`),
  "deadTreeTrunk01", "deadTreeTrunk02",
  "courtyardHouse", "marketRiceSack01", "marketRiceSack02",
  ...Array.from({ length: 3 }, (_, index) => `marketBox${String(index + 1).padStart(2, "0")}`),
  ...Array.from({ length: 4 }, (_, index) => `marketCrate${String(index + 1).padStart(2, "0")}`),
  ...Array.from(battlefield.nodes.keys(), (name) => name[0].toLowerCase() + name.slice(1)),
]) assert.match(runtime, new RegExp(`\\b${id}\\b`), `${id} is registered in the component library`);
assert.match(runtime, /cache\.set\(spec\.url, pending\)/, "shared GLBs cache by URL");
assert.match(runtime, /if \(spec\.materialMap\)/, "multi-material packs rebind game recipes");

console.log(`EXTERNAL_PROP_ASSET_OK courtyard=${courtyard.bytes} battlefield=${battlefield.bytes}`
  + ` handcart=${handcart.bytes} market=${market.bytes}`);
