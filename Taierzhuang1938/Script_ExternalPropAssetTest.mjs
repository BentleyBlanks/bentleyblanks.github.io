import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";


const root = path.dirname(fileURLToPath(import.meta.url));

function ReadGlb(fileName) {
  const bytes = fs.readFileSync(path.join(root, "Model", fileName));
  assert.equal(bytes.readUInt32LE(0), 0x46546c67, `${fileName}: glTF magic`);
  assert.equal(bytes.readUInt32LE(4), 2, `${fileName}: glTF version`);
  assert.equal(bytes.readUInt32LE(8), bytes.length, `${fileName}: declared length`);
  assert.ok(bytes.length < 300_000, `${fileName}: runtime package stays below 300 KB`);
  const jsonLength = bytes.readUInt32LE(12);
  assert.equal(bytes.readUInt32LE(16), 0x4e4f534a, `${fileName}: first chunk is JSON`);
  const json = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString("utf8").trim());
  return { bytes, json };
}

function InspectNodes(fileName) {
  const { bytes, json } = ReadGlb(fileName);
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

const runtime = fs.readFileSync(path.join(root, "Script_ExternalProps.mjs"), "utf8");
for (const id of [
  "militaryCrateClosed", "militaryCrateOpen",
  ...Array.from({ length: 7 }, (_, index) => `stackableStone${String(index + 1).padStart(2, "0")}`),
  "deadTreeTrunk01", "deadTreeTrunk02",
]) assert.match(runtime, new RegExp(`\\b${id}\\b`), `${id} is registered in the component library`);
assert.match(runtime, /cache\.set\(spec\.url, pending\)/, "shared GLBs cache by URL");

console.log(`EXTERNAL_PROP_ASSET_OK crates=${crates.bytes} stones=${stones.bytes} trunks=${trunks.bytes}`);
