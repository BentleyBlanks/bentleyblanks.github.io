// Convert the user-provided Nier V11 skin to the shared runtime skeleton.
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import * as THREE from "../vendor/three/build/three.module.js";
import { LoadGlb, ReadAccessor, ReadAccessorInt, SerializeGlb } from "./Script_LugouGlbPose.mjs";

const project = path.resolve(import.meta.dirname, "..");
const source = path.resolve(process.argv[2] || process.env.NIER_SOURCE ||
  "C:/Users/Bentl/OneDrive/Sync/饮河/FPS/角色/Tripo/08_妮儿/Nier_Merged_V11_Bones.glb");
const bytes = fs.readFileSync(source);
const document = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)));
if (document.skins?.length !== 1 || document.materials?.length !== 1) {
  throw new Error("Nier input requires one complete skin and one material");
}

// Restore the height of the assembled V11 before Tripo normalized its export.
const crownM = 1.2887294292449951;
const result = spawnSync(process.execPath, [
  path.join(import.meta.dirname, "Script_BuildXBotRigCharacter.mjs"), source,
  "--crown", String(crownM), "--out", "Model/Character/Model_Nier.glb",
], { cwd: path.dirname(project), stdio: "inherit", windowsHide: true });
if (result.status !== 0) throw new Error(`Nier conversion failed (${result.status})`);

// The new head is a separate closed surface. Repair that component so turning
// Head cannot pull its jaw toward Neck or a shoulder across the garment seam.
const outputFile = path.join(project, "Model/Character/Model_Nier.glb");
const glb = LoadGlb(outputFile);
const doc = glb.json, skin = doc.skins[0], primitive = doc.meshes[0].primitives[0];
const positions = ReadAccessor(glb, primitive.attributes.POSITION).data;
const indices = ReadAccessorInt(glb, primitive.indices).data;
const joints = ReadAccessorInt(glb, primitive.attributes.JOINTS_0).data;
const weights = ReadAccessor(glb, primitive.attributes.WEIGHTS_0).data;
const count = positions.length / 3;
const parent = doc.nodes.map(() => -1), worlds = [];
doc.nodes.forEach((node, index) => (node.children || []).forEach(child => { parent[child] = index; }));
function World(index) {
  if (worlds[index]) return worlds[index];
  const node = doc.nodes[index];
  const matrix = node.matrix ? new THREE.Matrix4().fromArray(node.matrix)
    : new THREE.Matrix4().compose(new THREE.Vector3(...(node.translation || [0, 0, 0])),
      new THREE.Quaternion(...(node.rotation || [0, 0, 0, 1])), new THREE.Vector3(...(node.scale || [1, 1, 1])));
  return worlds[index] = parent[index] < 0 ? matrix : World(parent[index]).clone().multiply(matrix);
}
const meshWorld = World(doc.nodes.findIndex(node => node.mesh === 0));
const component = Int32Array.from({ length: count }, (_, index) => index);
function Find(index) {
  let root = index;
  while (component[root] !== root) root = component[root];
  while (component[index] !== index) {
    const next = component[index];
    component[index] = root;
    index = next;
  }
  return root;
}
function Join(first, second) { component[Find(first)] = Find(second); }
for (let index = 0; index < indices.length; index += 3) {
  Join(indices[index], indices[index + 1]);
  Join(indices[index], indices[index + 2]);
}
const welded = new Map();
for (let index = 0; index < count; index++) {
  const key = [positions[index * 3], positions[index * 3 + 1], positions[index * 3 + 2]].join(",");
  if (welded.has(key)) Join(index, welded.get(key));
  else welded.set(key, index);
}
const shown = [], point = new THREE.Vector3();
let crownVertex = 0;
for (let index = 0; index < count; index++) {
  const value = point.fromArray(positions, index * 3).applyMatrix4(meshWorld).clone();
  shown.push(value);
  if (value.y > shown[crownVertex].y) crownVertex = index;
}
const headComponent = Find(crownVertex);
const headIndex = skin.joints.findIndex(index => doc.nodes[index].name === "Head");
const headPosition = new THREE.Vector3().setFromMatrixPosition(World(skin.joints[headIndex]));
const turn = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 4);
const jointAccessor = doc.accessors[primitive.attributes.JOINTS_0];
const weightAccessor = doc.accessors[primitive.attributes.WEIGHTS_0];
if (jointAccessor.componentType !== 5121 || weightAccessor.componentType !== 5126) throw new Error("Unexpected converted skin storage");
const jointOffset = doc.bufferViews[jointAccessor.bufferView].byteOffset + (jointAccessor.byteOffset || 0);
const weightOffset = doc.bufferViews[weightAccessor.bufferView].byteOffset + (weightAccessor.byteOffset || 0);
const neckBlendStartM = 1.04, rigidFaceStartM = 1.08;
let headVertices = 0, changedVertices = 0, faceVertices = 0, minFaceHeadWeightBefore = 1, maxFacePullBeforeM = 0;
for (let index = 0; index < count; index++) {
  if (Find(index) !== headComponent) continue;
  headVertices++;
  const offset = index * 4;
  let headWeight = 0;
  for (let slot = 0; slot < 4; slot++) if (joints[offset + slot] === headIndex) headWeight += weights[offset + slot];
  if (shown[index].y >= rigidFaceStartM) {
    faceVertices++;
    minFaceHeadWeightBefore = Math.min(minFaceHeadWeightBefore, headWeight);
    const rigidPoint = shown[index].clone().sub(headPosition).applyQuaternion(turn).add(headPosition);
    maxFacePullBeforeM = Math.max(maxFacePullBeforeM, rigidPoint.distanceTo(shown[index]) * (1 - headWeight));
  }
  const fraction = THREE.MathUtils.clamp((shown[index].y - neckBlendStartM) / (rigidFaceStartM - neckBlendStartM), 0, 1);
  const blend = fraction * fraction * (3 - 2 * fraction);
  if (blend === 0 || headWeight > 1 - 1e-6) continue;
  const influences = new Map();
  for (let slot = 0; slot < 4; slot++) {
    const weight = weights[offset + slot] * (1 - blend);
    if (weight > 0) influences.set(joints[offset + slot], (influences.get(joints[offset + slot]) || 0) + weight);
  }
  influences.set(headIndex, (influences.get(headIndex) || 0) + blend);
  const selected = [...influences].sort((first, second) => second[1] - first[1]).slice(0, 4);
  const total = selected.reduce((sum, influence) => sum + influence[1], 0);
  for (let slot = 0; slot < 4; slot++) {
    glb.bin.writeUInt8(selected[slot]?.[0] || 0, jointOffset + offset + slot);
    glb.bin.writeFloatLE((selected[slot]?.[1] || 0) / total, weightOffset + (offset + slot) * 4);
  }
  changedVertices++;
}
const reportFile = path.join(project, "Model/Character/Data_Nier.json");
const report = JSON.parse(fs.readFileSync(reportFile, "utf8"));
const inverseAccessor = doc.accessors[skin.inverseBindMatrices];
const inverseOffset = doc.bufferViews[inverseAccessor.bufferView].byteOffset + (inverseAccessor.byteOffset || 0);
const endBoneFits = [];
for (const name of report.addedEndBones) {
  const nodeIndex = doc.nodes.findIndex(node => node.name === name);
  const jointIndex = skin.joints.indexOf(nodeIndex);
  const parentIndex = parent[nodeIndex];
  const parentJoint = skin.joints.indexOf(parentIndex);
  const beforePosition = new THREE.Vector3().setFromMatrixPosition(World(nodeIndex));
  const parentPosition = new THREE.Vector3().setFromMatrixPosition(World(parentIndex));
  let targetPosition;
  if (name === "HeadTop_End") {
    const top = shown.filter((value, index) => Find(index) === headComponent && value.y > crownM - .008);
    targetPosition = new THREE.Vector3(parentPosition.x, crownM - .005, top.reduce((sum, value) => sum + value.z, 0) / top.length);
  } else {
    const previousPosition = new THREE.Vector3().setFromMatrixPosition(World(parent[parentIndex]));
    const axis = parentPosition.clone().sub(previousPosition).normalize();
    const distances = [];
    for (let index = 0; index < count; index++) {
      let influence = 0;
      for (let slot = 0; slot < 4; slot++) if (joints[index * 4 + slot] === parentJoint) influence += weights[index * 4 + slot];
      const distance = shown[index].clone().sub(parentPosition).dot(axis);
      if (influence > .15 && distance > 0) distances.push(distance);
    }
    distances.sort((first, second) => first - second);
    const terminalLength = distances.length ? distances[Math.floor((distances.length - 1) * .9)]
      : parentPosition.distanceTo(previousPosition) * .6;
    targetPosition = parentPosition.clone().addScaledVector(axis, terminalLength);
  }
  for (let index = 0; index < joints.length; index++) {
    if (joints[index] === jointIndex && weights[index] > 1e-7) throw new Error(`Terminal bone ${name} unexpectedly has skin weights`);
  }
  doc.nodes[nodeIndex].translation = targetPosition.clone().applyMatrix4(World(parentIndex).clone().invert()).toArray();
  const targetWorld = World(nodeIndex).clone().setPosition(targetPosition);
  const inverse = targetWorld.clone().invert().multiply(meshWorld);
  inverse.elements.forEach((value, index) => glb.bin.writeFloatLE(value, inverseOffset + (jointIndex * 16 + index) * 4));
  worlds[nodeIndex] = targetWorld;
  endBoneFits.push({ name, before: beforePosition.toArray(), after: targetPosition.toArray() });
}
fs.writeFileSync(outputFile, SerializeGlb(doc, glb.bin));
report.script = "_import/Script_BuildNier.mjs";
const outputBytes = fs.readFileSync(outputFile);
report.output.bytes = outputBytes.length;
report.output.sha256 = createHash("sha256").update(outputBytes).digest("hex");
const repairedWeights = ReadAccessor(glb, primitive.attributes.WEIGHTS_0).data;
const repairedJoints = ReadAccessorInt(glb, primitive.attributes.JOINTS_0).data;
let minFaceHeadWeightAfter = 1;
for (let index = 0; index < count; index++) {
  if (Find(index) !== headComponent || shown[index].y < rigidFaceStartM) continue;
  let headWeight = 0;
  for (let slot = 0; slot < 4; slot++) if (repairedJoints[index * 4 + slot] === headIndex) headWeight += repairedWeights[index * 4 + slot];
  minFaceHeadWeightAfter = Math.min(minFaceHeadWeightAfter, headWeight);
}
report.headSkinRepair = { headVertices, changedVertices, faceVertices, neckBlendStartM, rigidFaceStartM,
  minFaceHeadWeightBefore, maxFacePullBeforeAt45DegM: maxFacePullBeforeM, minFaceHeadWeightAfter };
report.endBoneFits = endBoneFits;
report.input = {
  file: path.basename(source), sha256: createHash("sha256").update(bytes).digest("hex"),
  skins: document.skins.length, joints: document.skins[0].joints.length,
};
report.reconstructionScope = [
  "妮儿的脸型、旧棉衣、补丁裤和布鞋来自用户确认的合并件，属于本作创作外观。",
  "人物骨架、蒙皮与动作适配属于游戏表现。",
];
report.historicalReferences = [];
report.facing = { sourceForward: "+Z", actorForward: "-Z", evidence: "Script_ModelFacingTest.mjs" };
fs.writeFileSync(reportFile, `${JSON.stringify(report, null, 2)}\n`);
const contacts = spawnSync(process.execPath, [path.join(import.meta.dirname, "Script_BakeNierContacts.mjs")], {
  cwd: path.dirname(project), stdio: "inherit", windowsHide: true,
});
if (contacts.status !== 0) throw new Error(`Nier contact adaptation failed (${contacts.status})`);
