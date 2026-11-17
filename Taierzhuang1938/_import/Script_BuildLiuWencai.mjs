// Convert the user-provided Liu Wencai Dirty V1 skin to the shared runtime rig.
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import * as THREE from "../vendor/three/build/three.module.js";
import { LoadGlb, SerializeGlb, ReadAccessor, ReadAccessorInt } from "./Script_LugouGlbPose.mjs";

const project = path.resolve(import.meta.dirname, "..");
const source = path.resolve(process.argv[2] || process.env.LIU_WENCAI_SOURCE ||
  "C:/Users/Bentl/OneDrive/Sync/饮河/FPS/角色/Tripo/06_刘文财/Dirty/Model_LiuWencaiDirty_Merged_V1_Bones.glb");
const sourceBytes = fs.readFileSync(source);
const sourceDoc = JSON.parse(sourceBytes.subarray(20, 20 + sourceBytes.readUInt32LE(12)));
if (sourceDoc.skins?.length !== 1 || sourceDoc.materials?.length !== 1 || sourceDoc.meshes?.length !== 1) {
  throw new Error("Liu Wencai input requires one complete skin, mesh and material");
}

const result = spawnSync(process.execPath, [
  path.join(import.meta.dirname, "Script_BuildXBotRigCharacter.mjs"), source,
  "--crown", "1.83", "--rigid-head-max", "0.075", "--out", "Model/Character/Model_LiuWencai.glb",
], { cwd: path.dirname(project), stdio: "inherit", windowsHide: true });
if (result.status !== 0) throw new Error(`Liu Wencai conversion failed (${result.status})`);

// The new head is a separate closed surface. Repair that component so turning
// Head cannot pull its jaw toward Neck or a shoulder across the garment seam.
const outputFile = path.join(project, "Model/Character/Model_LiuWencai.glb");
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
const faceTarget = new THREE.Vector3().setFromMatrixPosition(World(doc.nodes.findIndex(node => node.name === "Head")))
  .add(new THREE.Vector3(0, .075, .075));
let faceVertex = 0, faceDistance = Infinity;
for (let index = 0; index < count; index++) {
  const value = point.fromArray(positions, index * 3).applyMatrix4(meshWorld).clone();
  shown.push(value);
  const distance = value.distanceToSquared(faceTarget);
  if (distance < faceDistance) { faceDistance = distance; faceVertex = index; }
}
const headComponent = Find(faceVertex);
const componentPoints = shown.filter((_, index) => Find(index) === headComponent);
if (Math.max(...componentPoints.map(point => point.y)) - Math.min(...componentPoints.map(point => point.y)) < .25) {
  throw new Error("Expected the complete separate head-and-neck surface");
}
const headIndex = skin.joints.findIndex(index => doc.nodes[index].name === "Head");
const headPosition = new THREE.Vector3().setFromMatrixPosition(World(skin.joints[headIndex]));
const turn = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 4);
const jointAccessor = doc.accessors[primitive.attributes.JOINTS_0];
const weightAccessor = doc.accessors[primitive.attributes.WEIGHTS_0];
if (jointAccessor.componentType !== 5121 || weightAccessor.componentType !== 5126) throw new Error("Unexpected converted skin storage");
const jointOffset = doc.bufferViews[jointAccessor.bufferView].byteOffset + (jointAccessor.byteOffset || 0);
const weightOffset = doc.bufferViews[weightAccessor.bufferView].byteOffset + (weightAccessor.byteOffset || 0);
const neckBlendStartM = 1.53, rigidFaceStartM = 1.585;
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
fs.writeFileSync(outputFile, SerializeGlb(doc, glb.bin));

const reportFile = path.join(project, "Model/Character/Data_LiuWencai.json");
const report = JSON.parse(fs.readFileSync(reportFile, "utf8"));
report.script = "_import/Script_BuildLiuWencai.mjs";
const outputBytes = fs.readFileSync(outputFile);
report.output.bytes = outputBytes.length;
report.output.sha256 = createHash("sha256").update(outputBytes).digest("hex");
report.headSkinRepair = { headVertices, changedVertices, faceVertices, neckBlendStartM, rigidFaceStartM,
  minFaceHeadWeightBefore, maxFacePullBeforeAt45DegM: maxFacePullBeforeM };
report.input = {
  file: path.basename(source), sha256: createHash("sha256").update(sourceBytes).digest("hex"),
  skins: sourceDoc.skins.length, joints: sourceDoc.skins[0].joints.length,
};
report.appearanceVersion = "Dirty V1";
report.reconstructionScope = [
  "刘文财的脸型、灰色旧军服、软军帽、绑腿和草鞋按角色参考图设计，属于本作创作外观。",
  "干燥烟灰、泥尘、衣物破损、帽沿贴合、身体比例、骨架和动作适配属于本作创作与游戏表现。",
];
report.historicalReferences = [];
report.facing = { sourceForward: "+Z", actorForward: "-Z", evidence: "Script_ModelFacingTest.mjs" };
fs.writeFileSync(reportFile, `${JSON.stringify(report, null, 2)}\n`);
const contacts = spawnSync(process.execPath, [path.join(import.meta.dirname, "Script_BakeLiuWencaiContacts.mjs")], {
  cwd: path.dirname(project), stdio: "inherit", windowsHide: true,
});
if (contacts.status !== 0) throw new Error(`Liu Wencai contact adaptation failed (${contacts.status})`);
const groom = spawnSync(process.execPath, [path.join(import.meta.dirname, "Script_HairGroomBuild.mjs"), "Game_LiuWencai"], {
  cwd: path.dirname(project), stdio: "inherit", windowsHide: true,
});
if (groom.status !== 0) throw new Error(`Liu Wencai hair fitting failed (${groom.status})`);
