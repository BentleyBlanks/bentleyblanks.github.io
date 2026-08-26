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
    let hasUv = true;
    for (const primitive of mesh.primitives) {
      const positions = json.accessors[primitive.attributes.POSITION];
      const indexCount = primitive.indices == null
        ? positions.count : json.accessors[primitive.indices].count;
      triangles += indexCount / 3;
      minY = Math.min(minY, positions.min[1]);
      maxSpan = Math.max(maxSpan, ...positions.max.map((value, axis) => value - positions.min[axis]));
      hasUv = hasUv && primitive.attributes.TEXCOORD_0 != null;
    }
    result.set(node.name, { triangles, minY, maxSpan, hasUv });
  }
  return { bytes: bytes.length, json, nodes: result };
}

function ReadJpegSize(bytes, label) {
  assert.deepEqual([...bytes.subarray(0, 3)], [0xff, 0xd8, 0xff], `${label}: JPEG header`);
  const startOfFrame = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);
  for (let offset = 2; offset + 8 < bytes.length;) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = bytes[offset + 1];
    offset += 2;
    if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    const segmentLength = bytes.readUInt16BE(offset);
    assert.ok(segmentLength >= 2 && offset + segmentLength <= bytes.length, `${label}: valid JPEG segment`);
    if (startOfFrame.has(marker)) {
      return { height: bytes.readUInt16BE(offset + 3), width: bytes.readUInt16BE(offset + 5) };
    }
    offset += segmentLength;
  }
  assert.fail(`${label}: JPEG dimensions`);
}

function AssertTextureImage(json, textureInfo, label, glbFileName) {
  const texture = json.textures?.[textureInfo?.index];
  const image = json.images?.[texture?.source];
  assert.ok(image, `${label}: texture image exists`);
  if (image.bufferView != null) {
    assert.match(image.mimeType ?? "", /^image\/(?:jpeg|png)$/, `${label}: embedded image MIME`);
    return;
  }
  assert.match(image.uri ?? "", /^\.\.\/Texture\/Texture_[A-Za-z0-9_]+\.jpg$/, `${label}: local texture URI`);
  const imagePath = path.resolve(root, "Model", image.uri);
  assert.ok(imagePath.startsWith(path.join(root, "Texture") + path.sep), `${label}: texture stays in asset directory`);
  const imageBytes = fs.readFileSync(imagePath);
  assert.ok(imageBytes.length > 250_000 && imageBytes.length < 1_000_000, `${label}: useful compressed size`);
  assert.deepEqual(ReadJpegSize(imageBytes, label), { width: 1024, height: 1024 }, `${label}: runtime dimensions`);
  assert.equal(glbFileName, "Model_ChineseRuralHouse.glb", `${label}: external GLB images are intentionally scoped`);
}

function AssertTexturedMaterialsHaveNormals(json, label, glbFileName) {
  for (const material of json.materials ?? []) {
    if (material.pbrMetallicRoughness?.baseColorTexture == null) continue;
    assert.ok(material.normalTexture, `${label} material ${material.name} keeps a tangent-space normal texture`);
    AssertTextureImage(json, material.pbrMetallicRoughness.baseColorTexture,
      `${label} material ${material.name} BaseColor`, glbFileName);
    AssertTextureImage(json, material.normalTexture,
      `${label} material ${material.name} Normal`, glbFileName);
    const normalScale = material.normalTexture.scale ?? 1;
    assert.ok(normalScale > 0 && normalScale <= 1,
      `${label} material ${material.name} uses restrained normal strength`);
  }
}

function AssertAllUsedMaterialsHavePbrMaps(json, label, expectedCount, glbFileName) {
  const usedMaterials = new Set();
  for (const mesh of json.meshes ?? []) {
    for (const primitive of mesh.primitives ?? []) {
      if (primitive.material != null) usedMaterials.add(primitive.material);
    }
  }
  assert.equal(usedMaterials.size, expectedCount, `${label} used material count`);
  for (const materialIndex of usedMaterials) {
    const material = json.materials?.[materialIndex];
    assert.ok(material?.pbrMetallicRoughness?.baseColorTexture,
      `${label} used material ${materialIndex} ${material?.name} has BaseColor`);
    assert.ok(material?.normalTexture,
      `${label} used material ${materialIndex} ${material?.name} has Normal`);
  }
  AssertTexturedMaterialsHaveNormals(json, label, glbFileName);
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

const battlefield = InspectNodes("Model_BattlefieldPack.glb", 4_100_000);
assert.equal(battlefield.nodes.size, 24, "all 24 battlefield components are independent nodes");
AssertTexturedMaterialsHaveNormals(battlefield.json, "battlefield pack", "Model_BattlefieldPack.glb");
for (const [name, spec] of battlefield.nodes) {
  assert.ok(spec.triangles <= 3500, `${name} triangle budget`);
  assert.equal(spec.minY, 0, `${name} is ground-ready`);
}

const ruralHouse = ReadGlb("Model_ChineseRuralHouse.glb", 5_500_000);
AssertAllUsedMaterialsHavePbrMaps(ruralHouse.json, "Chinese rural house", 11, "Model_ChineseRuralHouse.glb");

for (const [fileName, label, materialCount, maxBytes] of [
  ["Model_AsianHouseRow.glb", "Asian house row", 6, 4_800_000],
  ["Model_AsianHousePair.glb", "Asian house pair", 4, 4_600_000],
  ["Model_Sandbag.glb", "sandbag", 1, 4_400_000],
]) {
  const originalMaterialModel = ReadGlb(fileName, maxBytes);
  AssertAllUsedMaterialsHavePbrMaps(originalMaterialModel.json, label, materialCount, fileName);
}

const breach = InspectNodes("Model_CityWallBreachPack.glb", 900_000);
for (const name of ["CityWallBreachShoulderLeft", "CityWallBreachShoulderRight"]) {
  const spec = breach.nodes.get(name);
  assert.ok(spec, `${name} node exists`);
  assert.ok(spec.triangles <= 1400, `${name} triangle budget`);
  assert.equal(spec.minY, 0, `${name} is ground-ready`);
  assert.ok(spec.maxSpan > 10.7 && spec.maxSpan < 11.1, `${name} matches the 11.5 m wall scale`);
  assert.ok(spec.hasUv, `${name} exposes UVs for authored wall PBR`);
}
const breachFan = breach.nodes.get("CityWallBreachDebrisFan");
assert.ok(breachFan && breachFan.triangles <= 5700, "breach rubble fan triangle budget");
assert.equal(breachFan.minY, 0, "breach rubble fan is ground-ready");
assert.ok(breachFan.maxSpan > 17 && breachFan.maxSpan < 18.5,
  "breach rubble fan spans both wall faces without becoming a whole battlefield");
for (const name of ["CityWallBreachBrickCluster01", "CityWallBreachBrickCluster02"]) {
  const spec = breach.nodes.get(name);
  assert.ok(spec && spec.triangles <= 1400, `${name} triangle budget`);
  assert.equal(spec.minY, 0, `${name} is ground-ready`);
  assert.ok(spec.hasUv, `${name} exposes UVs for authored wall PBR`);
}

const wallDetail = InspectNodes("Model_CityWallDetailPack.glb", 525_000);
const wallDetailNames = [
  "CityWallRepairPatchLarge", "CityWallRepairPatchSmall", "CityWallDrainSpout",
  "CityWallRootSpall", "CityWallCopingBrokenRun", "CityWallShellScar",
  "CityWallCoreExposurePatch",
];
assert.deepEqual([...wallDetail.nodes.keys()], wallDetailNames,
  "seven independently placeable intact-wall detail modules");
for (const name of wallDetailNames) {
  const spec = wallDetail.nodes.get(name);
  assert.ok(spec.triangles <= 2800, `${name} triangle budget`);
  assert.equal(spec.minY, 0, `${name} is offset-ready from wall base`);
  assert.ok(spec.hasUv, `${name} exposes UVs for authored wall PBR`);
}

for (const material of ["Brick", "Core", "Stone"]) {
  for (const channel of ["Base", "Normal", "Orm"]) {
    const fileName = `Texture_CityWall${material}${channel}.webp`;
    const bytes = fs.readFileSync(path.join(root, "Texture", fileName));
    assert.equal(bytes.subarray(0, 4).toString("ascii"), "RIFF", `${fileName}: RIFF header`);
    assert.equal(bytes.subarray(8, 12).toString("ascii"), "WEBP", `${fileName}: WebP payload`);
    assert.ok(bytes.length > 50_000 && bytes.length < 550_000, `${fileName}: useful compressed size`);
  }
}
for (const name of ["CityWallBreachCoping01", "CityWallBreachCoping02"]) {
  const spec = breach.nodes.get(name);
  assert.ok(spec && spec.triangles <= 60, `${name} triangle budget`);
  assert.equal(spec.minY, 0, `${name} is ground-ready`);
}

const handcart = InspectNodes("Model_Handcart.glb");
assert.deepEqual([...handcart.nodes.keys()], ["MarketHandcart"]);
const handcartSpec = handcart.nodes.get("MarketHandcart");
assert.ok(handcartSpec.triangles <= 4200, "replacement handcart triangle budget");
assert.equal(handcartSpec.minY, 0, "replacement handcart is ground-ready");
assert.ok(handcartSpec.maxSpan >= 2.44 && handcartSpec.maxSpan <= 2.46, "replacement handcart keeps game scale");
for (const material of ["HandcartWood", "WoodCrate"]) {
  for (const channel of ["Base", "Normal"]) {
    const fileName = `Texture_${material}${channel}.webp`;
    const bytes = fs.readFileSync(path.join(root, "Texture", fileName));
    assert.equal(bytes.subarray(0, 4).toString("ascii"), "RIFF", `${fileName}: RIFF header`);
    assert.equal(bytes.subarray(8, 12).toString("ascii"), "WEBP", `${fileName}: WebP payload`);
    assert.ok(bytes.length > 100_000 && bytes.length < 500_000, `${fileName}: useful compressed size`);
  }
}

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
  "cityWallBreachShoulderLeft", "cityWallBreachShoulderRight", "cityWallBreachDebrisFan",
  "cityWallBreachBrickCluster01", "cityWallBreachBrickCluster02",
  "cityWallBreachCoping01", "cityWallBreachCoping02",
  ...wallDetailNames.map((name) => name[0].toLowerCase() + name.slice(1)),
]) assert.match(runtime, new RegExp(`\\b${id}\\b`), `${id} is registered in the component library`);
assert.match(runtime, /cache\.set\(spec\.url, pending\)/, "shared GLBs cache by URL");
assert.match(runtime, /if \(spec\.materialMap\)/, "multi-material packs rebind game recipes");
assert.match(runtime, /materialMap: \{ WoodBeam: "HandcartWood" \}/,
  "handcart wood no longer reuses the generic structural-beam texture");
assert.match(runtime, /material: "WoodCrate"/, "wooden boxes use the dedicated crate texture");
assert.match(runtime, /placement\.yOffset \|\| 0/, "wall-mounted props preserve vertical offsets");

const main = fs.readFileSync(path.join(root, "Script_Main.mjs"), "utf8");
for (const material of ["Brick", "Core", "Stone"]) {
  for (const channel of ["Base", "Normal", "Orm"]) {
    assert.match(main, new RegExp(`Texture_CityWall${material}${channel}\\.webp`),
      `runtime loads CityWall ${material} ${channel}`);
  }
}
for (const material of ["HandcartWood", "WoodCrate"]) {
  for (const channel of ["Base", "Normal"]) {
    assert.match(main, new RegExp(`Texture_${material}${channel}\\.webp`),
      `runtime loads ${material} ${channel}`);
  }
}

console.log(`EXTERNAL_PROP_ASSET_OK courtyard=${courtyard.bytes} battlefield=${battlefield.bytes}`
  + ` ruralHouse=${ruralHouse.bytes.length}`
  + ` breach=${breach.bytes}`
  + ` wallDetail=${wallDetail.bytes}`
  + ` handcart=${handcart.bytes} market=${market.bytes}`);
