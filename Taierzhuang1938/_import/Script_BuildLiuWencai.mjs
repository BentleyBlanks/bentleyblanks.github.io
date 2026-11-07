// Convert the user-provided Liu Wencai V9 skin to the shared X Bot runtime rig.
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";

const project = path.resolve(import.meta.dirname, "..");
const source = path.resolve(process.argv[2] || process.env.LIU_WENCAI_SOURCE ||
  "C:/Users/Bentl/OneDrive/Sync/饮河/FPS/角色/Tripo/06_刘文财/LiuWencai_Merged_V9_Bones.glb");
const sourceBytes = fs.readFileSync(source);
const sourceDoc = JSON.parse(sourceBytes.subarray(20, 20 + sourceBytes.readUInt32LE(12)));
if (sourceDoc.skins?.length !== 1 || sourceDoc.materials?.length !== 1 || sourceDoc.meshes?.length !== 1) {
  throw new Error("Liu Wencai input requires one complete skin, mesh and material");
}

const result = spawnSync(process.execPath, [
  path.join(import.meta.dirname, "Script_BuildXBotRigCharacter.mjs"), source,
  "--crown", "1.8300752639770508", "--rigid-head-max", "0.075", "--out", "Model/Character/Model_LiuWencai.glb",
], { cwd: path.dirname(project), stdio: "inherit", windowsHide: true });
if (result.status !== 0) throw new Error(`Liu Wencai conversion failed (${result.status})`);

const reportFile = path.join(project, "Model/Character/Data_LiuWencai.json");
const report = JSON.parse(fs.readFileSync(reportFile, "utf8"));
report.script = "_import/Script_BuildLiuWencai.mjs";
report.input = {
  file: path.basename(source), sha256: createHash("sha256").update(sourceBytes).digest("hex"),
  skins: sourceDoc.skins.length, joints: sourceDoc.skins[0].joints.length,
};
report.reconstructionScope = [
  "刘文财的脸型、灰色旧军服、软军帽、绑腿和草鞋按角色参考图设计，属于本作创作外观。",
  "V9 帽沿贴合修复、原始小臂轮廓恢复、骨架转换与动作适配属于建模及游戏表现。",
];
report.historicalReferences = [];
report.facing = { sourceForward: "+Z", actorForward: "-Z", evidence: "Script_ModelFacingTest.mjs" };
fs.writeFileSync(reportFile, `${JSON.stringify(report, null, 2)}\n`);
const contacts = spawnSync(process.execPath, [path.join(import.meta.dirname, "Script_BakeLiuWencaiContacts.mjs")], {
  cwd: path.dirname(project), stdio: "inherit", windowsHide: true,
});
if (contacts.status !== 0) throw new Error(`Liu Wencai contact adaptation failed (${contacts.status})`);
