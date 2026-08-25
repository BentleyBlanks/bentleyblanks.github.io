import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const modelPath = path.join(root, "Model", "Model_ChineseRuralHouse.glb");

const bytes = fs.readFileSync(modelPath);
if (bytes.readUInt32LE(0) !== 0x46546c67 || bytes.readUInt32LE(4) !== 2) {
  throw new Error("Model_ChineseRuralHouse.glb is not a glTF 2.0 binary");
}

const jsonLength = bytes.readUInt32LE(12);
if (bytes.readUInt32LE(16) !== 0x4e4f534a) throw new Error("GLB JSON chunk missing");
const oldJsonEnd = 20 + jsonLength;
const json = JSON.parse(bytes.subarray(20, oldJsonEnd).toString("utf8").trim());

json.images ??= [];
json.textures ??= [];
json.samplers ??= [{ magFilter: 9729, minFilter: 9987 }];

const materialSets = [
  {
    stem: "RoofTile",
    materials: [2],
    normalScale: 0.82,
    roughness: 0.88,
  },
  {
    stem: "EarthPlaster",
    materials: [5, 7],
    normalScale: 0.52,
    roughness: 0.94,
  },
  {
    stem: "LimePlaster",
    materials: [0, 8],
    normalScale: 0.42,
    roughness: 0.92,
  },
  {
    stem: "Timber",
    materials: [1],
    normalScale: 0.68,
    roughness: 0.86,
  },
];

function AddExternalTexture(stem, channel) {
  const imageName = `RuralHouse${stem}${channel}`;
  const uri = `../Texture/Texture_RuralHouse${stem}${channel}.jpg`;
  let imageIndex = json.images.findIndex((image) => image.name === imageName || image.uri === uri);
  if (imageIndex < 0) {
    imageIndex = json.images.length;
    json.images.push({ name: imageName, uri });
  } else {
    json.images[imageIndex] = { name: imageName, uri };
  }

  let textureIndex = json.textures.findIndex((texture) => texture.name === imageName);
  if (textureIndex < 0) {
    textureIndex = json.textures.length;
    json.textures.push({ name: imageName, sampler: 0, source: imageIndex });
  } else {
    json.textures[textureIndex] = { name: imageName, sampler: 0, source: imageIndex };
  }
  return textureIndex;
}

for (const spec of materialSets) {
  const baseTexture = AddExternalTexture(spec.stem, "Base");
  const normalTexture = AddExternalTexture(spec.stem, "Normal");
  for (const materialIndex of spec.materials) {
    const material = json.materials?.[materialIndex];
    if (!material) throw new Error(`Missing rural house material ${materialIndex}`);
    material.pbrMetallicRoughness ??= {};
    material.pbrMetallicRoughness.baseColorFactor = [1, 1, 1, 1];
    material.pbrMetallicRoughness.baseColorTexture = { index: baseTexture };
    material.pbrMetallicRoughness.metallicFactor = 0;
    material.pbrMetallicRoughness.roughnessFactor = spec.roughness;
    material.normalTexture = { index: normalTexture, scale: spec.normalScale };
  }
}

const jsonPayload = Buffer.from(JSON.stringify(json));
const paddedJsonLength = (jsonPayload.length + 3) & ~3;
const paddedJson = Buffer.alloc(paddedJsonLength, 0x20);
jsonPayload.copy(paddedJson);
const tail = bytes.subarray(oldJsonEnd);
const output = Buffer.alloc(20 + paddedJsonLength + tail.length);
output.writeUInt32LE(0x46546c67, 0);
output.writeUInt32LE(2, 4);
output.writeUInt32LE(output.length, 8);
output.writeUInt32LE(paddedJsonLength, 12);
output.writeUInt32LE(0x4e4f534a, 16);
paddedJson.copy(output, 20);
tail.copy(output, 20 + paddedJsonLength);
fs.writeFileSync(modelPath, output);

console.log(`RURAL_HOUSE_PBR_OK materials=${json.materials.length} images=${json.images.length}`);
