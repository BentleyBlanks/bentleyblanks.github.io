// Convert the user's bound V6 interpreter through the shared runtime rig pipeline.
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const project = path.resolve(import.meta.dirname, "..");
const source = path.resolve(process.argv[2] || process.env.INTERPRETER_SOURCE ||
  "C:/Users/Bentl/OneDrive/Sync/饮河/FPS/角色/Tripo/16_翻译/Model_Interpreter_Merged_V6_Bones.glb");
const sourceBytes = fs.readFileSync(source);
const sourceDoc = JSON.parse(sourceBytes.subarray(20, 20 + sourceBytes.readUInt32LE(12)));
if (sourceDoc.skins?.length !== 1 || sourceDoc.materials?.length !== 1 || sourceDoc.meshes?.length !== 1) {
  throw new Error("Interpreter input requires one complete skin, mesh and material");
}

// Tripo normalized the bound download to one metre. Restore the adopted V6
// assembly's measured extent with a single uniform scale.
const crownM = 1.9343339204788208;
const result = spawnSync(process.execPath, [
  path.join(import.meta.dirname, "Script_BuildXBotRigCharacter.mjs"), source,
  "--crown", String(crownM), "--out", "Model/Character/Model_Interpreter.glb",
], { cwd: path.dirname(project), stdio: "inherit", windowsHide: true });
if (result.status !== 0) throw new Error(`Interpreter conversion failed (${result.status})`);

const reportFile = path.join(project, "Model/Character/Data_Interpreter.json");
const report = JSON.parse(fs.readFileSync(reportFile, "utf8"));
report.script = "_import/Script_BuildInterpreter.mjs";
report.input = { file: path.basename(source), joints: sourceDoc.skins[0].joints.length };
report.reconstructionScope = [
  "翻译的光头、脸型、灰黑便服、白色翻袖、裤腿和鞋子按用户采用的角色模型设计，属于本作创作外观。",
  "V6 手腕轮廓、袖内衔接、骨架转换、头部权重与动画适配属于建模和游戏表现。",
];
report.historicalReferences = [];
report.facing = { sourceForward: "+Z", actorForward: "-Z", evidence: "Script_ModelFacingTest.mjs" };
fs.writeFileSync(reportFile, `${JSON.stringify(report, null, 2)}\n`);
const contacts = spawnSync(process.execPath, [path.join(import.meta.dirname, "Script_BakeInterpreterContacts.mjs")], {
  cwd: path.dirname(project), stdio: "inherit", windowsHide: true,
});
if (contacts.status !== 0) throw new Error(`Interpreter contact adaptation failed (${contacts.status})`);
