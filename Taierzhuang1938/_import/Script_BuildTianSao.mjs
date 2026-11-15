// Build the approved bald Tian Sao appearance with the user's skin and corrected V7 shoes.
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import * as THREE from "../vendor/three/build/three.module.js";
import { PrepareTianSaoRig, NodeWorlds } from "./Script_PrepareTianSaoRig.mjs";
import { LoadGlb, ReadAccessor, ReadAccessorInt, SerializeGlb } from "./Script_LugouGlbPose.mjs";

const project = path.resolve(import.meta.dirname, "..");
const directory = "C:/Users/Bentl/OneDrive/Sync/饮河/FPS/角色/Tripo/24_田嫂";
const source = path.resolve(process.argv[2] || path.join(directory, "Model_TianSao_TripoReady_V6_Bones.glb"));
const original = path.resolve(process.argv[3] || path.join(directory, "Model_TianSao_TripoReady_V6.glb"));
const corrected = path.resolve(process.argv[4] || path.join(directory, "Model_TianSao_TripoReady_V7.glb"));
const temporary = path.resolve(project, "../tmp/TianSaoIntegration");
fs.mkdirSync(temporary, { recursive: true });
const prepared = path.join(temporary, "Model_TianSao_V7_Bones.glb");
const preparation = PrepareTianSaoRig({ source, original, corrected, output: prepared });
const crownM = 1.65;
const result = spawnSync(process.execPath, [path.join(import.meta.dirname, "Script_BuildXBotRigCharacter.mjs"), prepared,
  "--crown", String(crownM), "--out", "Model/Character/Model_TianSao.glb"],
{ cwd: path.dirname(project), stdio: "inherit", windowsHide: true });
if (result.status !== 0) throw new Error(`Tian Sao rig conversion failed (${result.status})`);
const reportFile = path.join(project, "Model/Character/Data_TianSao.json");
const report = JSON.parse(fs.readFileSync(reportFile, "utf8"));
const outputFile = path.join(project, report.output.file);
const converted = LoadGlb(outputFile), doc = converted.json;
const primitive = doc.meshes[0].primitives[0], skin = doc.skins[0];
const positions = ReadAccessor(converted, primitive.attributes.POSITION).data;
const uv = ReadAccessor(converted, primitive.attributes.TEXCOORD_0).data;
const joints = ReadAccessorInt(converted, primitive.attributes.JOINTS_0).data;
const weights = ReadAccessor(converted, primitive.attributes.WEIGHTS_0).data;
const meshWorld = NodeWorlds(doc).world[doc.nodes.findIndex(node => node.mesh === 0)];
const headIndex = skin.joints.findIndex(node => doc.nodes[node].name === "Head");
const jointView = doc.bufferViews[doc.accessors[primitive.attributes.JOINTS_0].bufferView];
const weightView = doc.bufferViews[doc.accessors[primitive.attributes.WEIGHTS_0].bufferView];
const blendStart = crownM * 1.675 / 1.9696608781814575;
const rigidStart = crownM * 1.715 / 1.9696608781814575;
let repaired = 0, faceVertices = 0, minimumFaceHeadWeightBefore = 1;
for (let index = 0; index < positions.length / 3; index++) {
  if (uv[index * 2] <= .5 || uv[index * 2 + 1] <= .5) continue;
  const y = new THREE.Vector3().fromArray(positions, index * 3).applyMatrix4(meshWorld).y;
  const parameter = THREE.MathUtils.clamp((y - blendStart) / (rigidStart - blendStart), 0, 1);
  const blend = parameter * parameter * (3 - 2 * parameter);
  let headWeight = 0;
  for (let slot = 0; slot < 4; slot++) if (joints[index * 4 + slot] === headIndex) headWeight += weights[index * 4 + slot];
  if (y >= rigidStart) { faceVertices++; minimumFaceHeadWeightBefore = Math.min(minimumFaceHeadWeightBefore, headWeight); }
  if (blend === 0 || headWeight > .999999) continue;
  const influences = new Map();
  for (let slot = 0; slot < 4; slot++) {
    const joint = joints[index * 4 + slot], weight = weights[index * 4 + slot] * (1 - blend);
    influences.set(joint, (influences.get(joint) || 0) + weight);
  }
  influences.set(headIndex, (influences.get(headIndex) || 0) + blend);
  const selected = [...influences].sort((first, second) => second[1] - first[1]).slice(0, 4);
  const total = selected.reduce((sum, influence) => sum + influence[1], 0);
  for (let slot = 0; slot < 4; slot++) {
    converted.bin.writeUInt8(selected[slot]?.[0] || 0, (jointView.byteOffset || 0) + index * 4 + slot);
    converted.bin.writeFloatLE((selected[slot]?.[1] || 0) / total, (weightView.byteOffset || 0) + (index * 4 + slot) * 4);
  }
  repaired++;
}
fs.writeFileSync(outputFile, SerializeGlb(doc, converted.bin));
const outputBytes = fs.readFileSync(outputFile);
report.output.bytes = outputBytes.length;
report.output.sha256 = createHash("sha256").update(outputBytes).digest("hex");
report.faceSkin = { blendStartM: blendStart, rigidStartM: rigidStart, repairedVertices: repaired,
  faceVertices, minimumFaceHeadWeightBefore, minimumFaceHeadWeightAfter: 1 };
report.script = "_import/Script_BuildTianSao.mjs";
report.preparation = preparation;
report.stature = { heightM: crownM, basis: "Adult female game-scale default; uniform scaling of the approved assembly" };
report.headAppearance = "Bald";
report.reconstructionScope = [
  "田嫂的光头、脸型、深色棉衣、绑腿和布鞋采用用户确认的模型外观，属于本作创作。",
  "V7 左右鞋修正、衣内连接、蒙皮适配和共用骨架转换属于建模与游戏表现。",
];
report.historicalReferences = [];
report.facing = { sourceForward: "+Z", actorForward: "-Z", evidence: "Script_ModelFacingTest.mjs" };
fs.writeFileSync(reportFile, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ output: report.output, hipsScale: report.hipsScale, crownM, preparation }, null, 2));

const contacts = spawnSync(process.execPath, [path.join(import.meta.dirname, "Script_BakeTianSaoContacts.mjs")], {
  cwd: path.dirname(project), stdio: "inherit", windowsHide: true,
});
if (contacts.status !== 0) throw new Error(`Tian Sao contact conversion failed (${contacts.status})`);
