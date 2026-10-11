// Shipped-geometry and integration checks for the M15/M16 ward pack.
import assert from "node:assert/strict";
import fs from "node:fs";
import { createHash } from "node:crypto";
import * as THREE from "three";
import { PACK, ASSETS } from "./Data_ExternalAssets_WardProps.mjs";
import { WARD_PROP_DRESSING, PlanPropDressing } from "./Data_FirstLevelPropDressing.mjs";
import { MISSION_LAYOUT } from "./Data_FirstLevelMissionLayout.mjs";
import { SampleMissionTerrain } from "./Data_FirstLevelMissionTerrain.mjs";

const root = new URL("./", import.meta.url);
const bytes = fs.readFileSync(new URL(PACK.url.split("?")[0], root));
const audit = JSON.parse(fs.readFileSync(new URL("Model/Data_WardProps.json", root)));
assert.equal(bytes.readUInt32LE(0), 0x46546c67);
assert.equal(bytes.readUInt32LE(8), bytes.length);
assert.equal(createHash("sha256").update(bytes).digest("hex"), audit.sha256);
assert.ok(bytes.length < 3 * 1024 * 1024, "ward pack stays below 3 MiB");
const jsonLength = bytes.readUInt32LE(12);
const doc = JSON.parse(bytes.subarray(20, 20 + jsonLength));
const binaryStart = 28 + jsonLength;
function Read(index) {
  const accessor = doc.accessors[index], view = doc.bufferViews[accessor.bufferView];
  const width = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[accessor.type];
  const size = { 5126: 4, 5125: 4, 5123: 2, 5121: 1 }[accessor.componentType];
  assert.ok(width && size);
  const offset = binaryStart + (view.byteOffset || 0) + (accessor.byteOffset || 0);
  const read = accessor.componentType === 5126 ? "readFloatLE" : accessor.componentType === 5125 ? "readUInt32LE" : accessor.componentType === 5123 ? "readUInt16LE" : "readUInt8";
  return Array.from({ length: accessor.count * width }, (_, i) => bytes[read](offset + Math.floor(i / width) * (view.byteStride || width * size) + (i % width) * size));
}
const meshes = new Map(), sizes = new Map();
let totalTriangles = 0;
for (const [id, spec] of Object.entries(ASSETS)) {
  assert.equal(spec.material, null, `${id}: preserve ceramic/glass/enamel materials`);
  assert.equal(spec.projectUvs, false, `${id}: preserve authored UVs`);
  const node = doc.nodes.find(n => n.name === spec.node);
  assert.ok(node?.mesh != null, `${id}: GLB node`);
  assert.deepEqual(node.translation || [0, 0, 0], [0, 0, 0], `${id}: no presentation offset`);
  const group = new THREE.Group();
  let triangles = 0;
  for (const primitive of doc.meshes[node.mesh].primitives) {
    for (const channel of ["POSITION", "NORMAL", "TEXCOORD_0"]) assert.ok(primitive.attributes[channel] != null, `${id}: ${channel}`);
    const position = Read(primitive.attributes.POSITION), normal = Read(primitive.attributes.NORMAL), uv = Read(primitive.attributes.TEXCOORD_0), indices = Read(primitive.indices);
    assert.ok([...position, ...normal, ...uv].every(Number.isFinite));
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(position, 3));
    geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normal, 3));
    geometry.setIndex(indices);
    group.add(new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide })));
    triangles += indices.length / 3;
  }
  group.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(group), size = box.getSize(new THREE.Vector3()).toArray();
  const record = audit.assets.find(a => a.id === spec.node);
  assert.equal(triangles, record.triangles, `${id}: shipped triangle audit`);
  size.forEach((v, axis) => assert.ok(Math.abs(v - record.dimensions[axis]) < 1e-5));
  assert.ok(Math.abs(box.min.y) < .001, `${id}: foot at ground`);
  meshes.set(id, group); sizes.set(id, size); totalTriangles += triangles;
}
assert.equal(Object.keys(ASSETS).length, 11);
assert.ok(totalTriangles < 50000);
const timber = doc.materials.find(m => m.name === "WardTimber");
assert.deepEqual(timber.pbrMetallicRoughness.baseColorFactor, [.48, .39, .28, 1], "Blender wood tint survives export");
assert.ok(timber.normalTexture && timber.pbrMetallicRoughness.baseColorTexture && timber.pbrMetallicRoughness.metallicRoughnessTexture);
for (const name of ["WardAmberGlass", "WardGreenGlass", "WardCeramic", "WardEnamel"])
  assert.equal(doc.materials.find(m => m.name === name).pbrMetallicRoughness.metallicFactor, 0, `${name}: dielectric`);

function Hits(id, origin, direction) {
  return new THREE.Raycaster(new THREE.Vector3(...origin), new THREE.Vector3(...direction)).intersectObject(meshes.get(id), true);
}
const basin = Hits("wardEnamelBasin", [0, 1, 0], [0, -1, 0]);
assert.ok(basin.length && basin[0].point.y < .03, "basin has a real open bowl, no filled top");
assert.equal(Hits("wardTreatmentTable", [0, .35, -2], [0, 0, 1]).length, 0, "table has open leg space");
assert.equal(Hits("wardWoodStool", [0, .3, -2], [0, 0, 1]).length, 0, "stool has separate legs");
const shelf = Hits("wardStockedShelf", [0, .87, -2], [0, 0, 1]);
assert.ok(shelf.length && shelf[0].point.z > .24, "shelf openings extend to recessed backboards");
const before = JSON.stringify(MISSION_LAYOUT.blocks);
const plan = PlanPropDressing(MISSION_LAYOUT.blocks, SampleMissionTerrain, sizes, WARD_PROP_DRESSING);
assert.deepEqual(plan.missing, []);
assert.equal(plan.placements.length, 17);
assert.equal(plan.replaced.size, 42, "old boards, jar strips and duplicate legacy north-wall counters disappear");
for (const x of [-28, -25, -22]) for (const prefix of ["WardShelf", "WardMedicalRoll"])
  assert.ok(plan.replaced.has(`${prefix}${x}`), "old counters cannot occlude the new shelf");
const withoutOverlaps = PlanPropDressing(MISSION_LAYOUT.blocks, SampleMissionTerrain, sizes, WARD_PROP_DRESSING.map(({ hideOverlaps, ...entry }) => entry));
assert.deepEqual(plan.placements, withoutOverlaps.placements, "hiding duplicate legacy scenery cannot resize/reposition furniture");
assert.equal(JSON.stringify(MISSION_LAYOUT.blocks), before, "visual replacements leave collision and routes intact");
for (const [id, expected] of [["ReceptionWardShelf", 1], ["ReceptionWardShelfN", 1], ["ReceptionWardNorthCabinet", 1], ["ReceptionWardShelfB", -1], ["ReceptionWardMedicineTable", 1], ["ReceptionWardMedicineJar0", 1], ["ReceptionWardLanternTable", -1]]) {
  const item = plan.placements.find(p => p.block === id);
  assert.ok(-Math.cos(item.yaw) * expected > .99, `${id}: front faces the ward, not the wall`);
}
for (const group of meshes.values()) group.traverse(o => { o.geometry?.dispose(); o.material?.dispose(); });
console.log(`WardPropsTest PASS: 11 assets, ${totalTriangles} triangles, 17 placements, 42 placeholders removed; open geometry and facing verified`);
