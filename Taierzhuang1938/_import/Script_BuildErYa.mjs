// Convert the user's six-part weathered Er Ya skin to the shared game contract.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import sharp from "sharp";
import * as THREE from "../vendor/three/build/three.module.js";
import { LoadGlb, ReadAccessor, ReadAccessorInt, SerializeGlb, PoseScene } from "./Script_LugouGlbPose.mjs";
import { XBOT_CHARACTERS } from "../Data_XBotCharacters.mjs";

const project = path.resolve(import.meta.dirname, "..");
const sourceFile = process.argv[2] || process.env.ERYA_SOURCE ||
  "C:/Users/Bentl/OneDrive/Sync/饮河/FPS/角色/Tripo/25_二丫/Dirty/Model_ErYa_DirtyAssembled_Bones.glb";
const source = LoadGlb(sourceFile);
const document = structuredClone(source.json);
const work = process.env.ERYA_BUILD_DIR ||
  "C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/ErYaDirtyIntegration_20261115";
fs.mkdirSync(work, { recursive: true });
assert.equal(document.skins.length, 1);
assert.equal(document.meshes.length, 6);
assert.equal(document.materials.length, 4);
const hash = bytes => createHash("sha256").update(bytes).digest("hex");
const chunks = [source.bin];
let byteLength = source.bin.length;
function Append(bytes, target) {
  const padding = (4 - byteLength % 4) % 4;
  chunks.push(Buffer.alloc(padding)); byteLength += padding;
  document.bufferViews.push({ buffer: 0, byteOffset: byteLength, byteLength: bytes.length,
    ...(target ? { target } : {}) });
  chunks.push(bytes); byteLength += bytes.length;
  return document.bufferViews.length - 1;
}
function AddAccessor(values, type, componentType, width, target) {
  const bytes = Buffer.from(values.buffer, values.byteOffset, values.byteLength);
  document.accessors.push({ bufferView: Append(bytes, target), componentType,
    count: values.length / width, type });
  return document.accessors.length - 1;
}
function ImageBytes(textureIndex) {
  const image = source.json.images[source.json.textures[textureIndex].source];
  const view = source.json.bufferViews[image.bufferView];
  return source.bin.subarray(view.byteOffset || 0, (view.byteOffset || 0) + view.byteLength);
}

// Each source material occupies a padded quadrant. Uniform UV rescaling keeps
// tangent-space orientation and the existing island layout within each part.
const atlasSize = 4096, tileSize = atlasSize / 2, gutter = 4;
const tileInterior = tileSize - gutter * 2;
const images = [];
for (const channel of ["baseColor", "metallicRoughness", "normal"]) {
  const tiles = [];
  for (const [index, material] of source.json.materials.entries()) {
    const texture = channel === "normal" ? material.normalTexture.index
      : material.pbrMetallicRoughness[channel + "Texture"].index;
    const raw = await sharp(ImageBytes(texture)).removeAlpha()
      .resize(tileInterior, tileInterior, { kernel: "lanczos3" }).raw().toBuffer();
    if (channel === "normal") {
      for (let offset = 0; offset < raw.length; offset += 3) {
        const x = raw[offset] / 127.5 - 1, y = raw[offset + 1] / 127.5 - 1, z = raw[offset + 2] / 127.5 - 1;
        const length = Math.hypot(x, y, z) || 1;
        raw[offset] = Math.round((x / length + 1) * 127.5);
        raw[offset + 1] = Math.round((y / length + 1) * 127.5);
        raw[offset + 2] = Math.round((z / length + 1) * 127.5);
      }
    }
    const tile = await sharp(raw, { raw: { width: tileInterior, height: tileInterior, channels: 3 } })
      .extend({ top: gutter, bottom: gutter, left: gutter, right: gutter, extendWith: "copy" }).png().toBuffer();
    tiles.push({ input: tile, left: index % 2 * tileSize, top: Math.floor(index / 2) * tileSize });
  }
  const atlas = await sharp({ create: { width: atlasSize, height: atlasSize, channels: 3, background: "black" } })
    .composite(tiles).png().toBuffer();
  images.push({ bufferView: Append(atlas), mimeType: "image/png", name: "ErYa_" + channel });
}

const parts = document.meshes.map(mesh => {
  assert.equal(mesh.primitives.length, 1);
  return mesh.primitives[0];
});
const meshNodes = document.nodes.map((node, index) => node.mesh === undefined ? -1 : index).filter(index => index >= 0);
assert.ok(meshNodes.every(index => document.nodes[index].skin === 0));
assert.ok(meshNodes.every(index => !document.nodes[index].matrix && !document.nodes[index].translation
  && !document.nodes[index].rotation && !document.nodes[index].scale));
const counts = parts.map(part => document.accessors[part.attributes.POSITION].count);
const vertexCount = counts.reduce((sum, count) => sum + count, 0);
const positions = new Float32Array(vertexCount * 3), normals = new Float32Array(vertexCount * 3);
const uvs = new Float32Array(vertexCount * 2), joints = new Uint16Array(vertexCount * 4), weights = new Float32Array(vertexCount * 4);
const indices = new Uint32Array(parts.reduce((sum, part) => sum + document.accessors[part.indices].count, 0));
let vertexOffset = 0, indexOffset = 0;
for (const [index, part] of parts.entries()) {
  const count = counts[index];
  positions.set(ReadAccessor(source, part.attributes.POSITION).data, vertexOffset * 3);
  normals.set(ReadAccessor(source, part.attributes.NORMAL).data, vertexOffset * 3);
  joints.set(ReadAccessorInt(source, part.attributes.JOINTS_0).data, vertexOffset * 4);
  weights.set(ReadAccessor(source, part.attributes.WEIGHTS_0).data, vertexOffset * 4);
  const originalUvs = ReadAccessor(source, part.attributes.TEXCOORD_0).data;
  const material = part.material;
  for (let vertex = 0; vertex < count; vertex++) {
    uvs[(vertexOffset + vertex) * 2] = (material % 2 * tileSize + gutter + originalUvs[vertex * 2] * tileInterior) / atlasSize;
    uvs[(vertexOffset + vertex) * 2 + 1] = (Math.floor(material / 2) * tileSize + gutter + originalUvs[vertex * 2 + 1] * tileInterior) / atlasSize;
  }
  const originalIndices = ReadAccessorInt(source, part.indices).data;
  indices.set(Uint32Array.from(originalIndices, value => value + vertexOffset), indexOffset);
  indexOffset += originalIndices.length; vertexOffset += count;
}
const attributes = {
  POSITION: AddAccessor(positions, "VEC3", 5126, 3, 34962),
  NORMAL: AddAccessor(normals, "VEC3", 5126, 3, 34962),
  TEXCOORD_0: AddAccessor(uvs, "VEC2", 5126, 2, 34962),
  JOINTS_0: AddAccessor(joints, "VEC4", 5123, 4, 34962),
  WEIGHTS_0: AddAccessor(weights, "VEC4", 5126, 4, 34962),
};
document.meshes = [{ name: "ErYa_Atlas", primitives: [{ attributes,
  indices: AddAccessor(indices, "SCALAR", 5125, 1, 34963), material: 0, mode: 4 }] }];
for (const index of meshNodes) { delete document.nodes[index].mesh; delete document.nodes[index].skin; }
Object.assign(document.nodes[meshNodes[0]], { mesh: 0, skin: 0, name: "ErYa_Atlas" });
document.images = images;
document.textures = images.map((_, index) => ({ source: index, sampler: 0 }));
document.materials = [{ name: "M_ErYa_Atlas", doubleSided: true,
  pbrMetallicRoughness: { baseColorTexture: { index: 0 }, metallicRoughnessTexture: { index: 1 } },
  normalTexture: { index: 2 } }];
document.buffers[0].byteLength = byteLength;
const atlasFile = path.join(work, "Model_ErYa_Atlas_Bones.glb");
fs.writeFileSync(atlasFile, SerializeGlb(document, Buffer.concat(chunks, byteLength)));
const converted = spawnSync(process.execPath, [path.join(import.meta.dirname, "Script_BuildXBotRigCharacter.mjs"),
  atlasFile, "--crown", "1.30", "--rigid-head-max", ".065", "--out", "Model/Character/Model_ErYa.glb"],
{ cwd: path.dirname(project), stdio: "inherit", windowsHide: true });
assert.equal(converted.status, 0, "Shared skeleton conversion");

const outputFile = path.join(project, "Model/Character/Model_ErYa.glb");
const output = LoadGlb(outputFile), doc = output.json;
const primitive = doc.meshes[0].primitives[0], skin = doc.skins[0];
const pose = new PoseScene(output);
// The imported shared skeleton has no clips. Apply its rest transforms directly.
for (const index of pose.order) {
  const node = doc.nodes[index];
  const local = new THREE.Matrix4().compose(new THREE.Vector3(...(node.translation || [0, 0, 0])),
    new THREE.Quaternion(...(node.rotation || [0, 0, 0, 1])), new THREE.Vector3(...(node.scale || [1, 1, 1])));
  const world = pose.parent[index] < 0 ? local : new THREE.Matrix4().fromArray(pose.world[pose.parent[index]]).multiply(local);
  pose.world[index].set(world.elements);
}
const World = index => new THREE.Matrix4().fromArray(pose.world[index]);
const meshNode = doc.nodes.findIndex(node => node.mesh === 0), meshWorld = World(meshNode);
const outPositions = ReadAccessor(output, primitive.attributes.POSITION).data;
const outUvs = ReadAccessor(output, primitive.attributes.TEXCOORD_0).data;
const outJoints = ReadAccessorInt(output, primitive.attributes.JOINTS_0).data;
const outWeights = ReadAccessor(output, primitive.attributes.WEIGHTS_0).data;
const names = skin.joints.map(index => doc.nodes[index].name), headIndex = names.indexOf("Head");
const shown = Array.from({ length: outPositions.length / 3 }, (_, index) =>
  new THREE.Vector3().fromArray(outPositions, index * 3).applyMatrix4(meshWorld));
function AccessorOffset(index) {
  const accessor = doc.accessors[index];
  return (doc.bufferViews[accessor.bufferView].byteOffset || 0) + (accessor.byteOffset || 0);
}
const jointOffset = AccessorOffset(primitive.attributes.JOINTS_0), weightOffset = AccessorOffset(primitive.attributes.WEIGHTS_0);
let repairedHeadVertices = 0;
for (let index = 0; index < shown.length; index++) {
  if (outUvs[index * 2] < .5 || outUvs[index * 2 + 1] < .5) continue;
  const amount = THREE.MathUtils.smoothstep(shown[index].y, 1.045, 1.095);
  if (amount <= 0) continue;
  const influences = new Map();
  for (let slot = 0; slot < 4; slot++) {
    const weight = outWeights[index * 4 + slot] * (1 - amount);
    if (weight > 0) influences.set(outJoints[index * 4 + slot], (influences.get(outJoints[index * 4 + slot]) || 0) + weight);
  }
  influences.set(headIndex, (influences.get(headIndex) || 0) + amount);
  const selected = [...influences].sort((first, second) => second[1] - first[1]).slice(0, 4);
  const total = selected.reduce((sum, item) => sum + item[1], 0);
  for (let slot = 0; slot < 4; slot++) {
    const joint = selected[slot]?.[0] || 0, weight = (selected[slot]?.[1] || 0) / total;
    output.bin.writeUInt8(joint, jointOffset + index * 4 + slot);
    output.bin.writeFloatLE(weight, weightOffset + (index * 4 + slot) * 4);
    outJoints[index * 4 + slot] = joint; outWeights[index * 4 + slot] = weight;
  }
  repairedHeadVertices++;
}
const reportFile = path.join(project, "Model/Character/Data_ErYa.json");
const report = JSON.parse(fs.readFileSync(reportFile, "utf8"));
const inverseOffset = AccessorOffset(skin.inverseBindMatrices), terminalFits = [];
for (const name of report.addedEndBones) {
  const node = doc.nodes.findIndex(value => value.name === name), parent = pose.parent[node];
  const joint = skin.joints.indexOf(node), parentJoint = skin.joints.indexOf(parent);
  const parentPosition = new THREE.Vector3().setFromMatrixPosition(World(parent));
  let target;
  if (name === "HeadTop_End") {
    target = new THREE.Vector3(parentPosition.x, 1.295, parentPosition.z);
  } else {
    const previous = new THREE.Vector3().setFromMatrixPosition(World(pose.parent[parent]));
    const axis = parentPosition.clone().sub(previous).normalize(), distances = [];
    for (let vertex = 0; vertex < shown.length; vertex++) {
      let influence = 0;
      for (let slot = 0; slot < 4; slot++) if (outJoints[vertex * 4 + slot] === parentJoint) influence += outWeights[vertex * 4 + slot];
      const distance = shown[vertex].clone().sub(parentPosition).dot(axis);
      if (influence > .15 && distance > 0) distances.push(distance);
    }
    distances.sort((first, second) => first - second);
    const length = distances.length ? distances[Math.floor((distances.length - 1) * .9)] : parentPosition.distanceTo(previous) * .6;
    target = parentPosition.clone().addScaledVector(axis, length);
  }
  assert.ok(!outJoints.some((value, index) => value === joint && outWeights[index] > 1e-7));
  doc.nodes[node].translation = target.clone().applyMatrix4(World(parent).invert()).toArray();
  const targetWorld = World(node).setPosition(target);
  targetWorld.clone().invert().multiply(meshWorld).elements.forEach((value, index) =>
    output.bin.writeFloatLE(value, inverseOffset + (joint * 16 + index) * 4));
  terminalFits.push({ name, position: target.toArray() });
}
fs.writeFileSync(outputFile, SerializeGlb(doc, output.bin));
report.script = "_import/Script_BuildErYa.mjs";
report.input = { file: path.basename(sourceFile), sha256: hash(source.buffer), meshes: source.json.meshes.length,
  joints: source.json.skins[0].joints.length, materials: source.json.materials.length };
report.atlas = { size: atlasSize, gutter, materialOrder: source.json.materials.map(material => material.name), originalGeometryPreserved: true };
report.headSkinRepair = { neckBlendStartM: 1.045, rigidFaceStartM: 1.095, vertices: repairedHeadVertices };
report.endBoneFits = terminalFits;
report.output.bytes = fs.statSync(outputFile).size;
report.output.sha256 = hash(fs.readFileSync(outputFile));
report.facing = { sourceForward: "+Z", actorForward: "-Z", evidence: "Script_ModelFacingTest.mjs" };
report.integration = { castId: "erya", unitIds: ["ErYa", "Girl"], level: "FirstLevel1218", keyframe: "12-7" };
report.reconstructionScope = ["二丫的光头、脏旧棉衣、补丁裤与布鞋采用用户提供的 Dirty 绑骨版，属于角色创作外观。", "图集、骨架转换、局部权重和动作接触适配属于游戏表现。"];
report.historicalReferences = [];
fs.writeFileSync(reportFile, JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify({ hipsScale: report.hipsScale, vertices: report.vertices, triangles: report.triangles,
  bones: report.bones, headRepair: report.headSkinRepair, atlas: report.atlas }, null, 2));
const contactClips = Object.keys(XBOT_CHARACTERS.erya.clipOverrides).map(file => file.replace(/^Animation_Mixamo_|\.glb$/g, ""));
const contacts = spawnSync(process.execPath, [path.join(import.meta.dirname, "Script_BakeNierContacts.mjs"), "erya", "ErYa", ...contactClips],
  { cwd: path.dirname(project), stdio: "inherit", windowsHide: true });
assert.equal(contacts.status, 0, "Child contact adaptation");
