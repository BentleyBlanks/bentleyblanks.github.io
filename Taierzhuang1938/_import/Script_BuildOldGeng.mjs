// Convert the user-downloaded Old Geng V10 skin to the shared X Bot runtime rig.
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";

const project = path.resolve(import.meta.dirname, "..");
const source = path.resolve(process.argv[2] || process.env.OLD_GENG_SOURCE ||
  "C:/Users/Bentl/OneDrive/Sync/饮河/FPS/角色/Tripo/07_老耿/Model_OldGeng_Merged_V10_Bones.glb");
const sourceBytes = fs.readFileSync(source);
const sourceDoc = JSON.parse(sourceBytes.subarray(20, 20 + sourceBytes.readUInt32LE(12)));
if (sourceDoc.skins?.length !== 1 || sourceDoc.materials?.length !== 1) {
  throw new Error("Old Geng input requires one complete skin and one material");
}

const result = spawnSync(process.execPath, [
  path.join(import.meta.dirname, "Script_BuildXBotRigCharacter.mjs"), source,
  "--crown", "1.809205174446106", "--out", "Model/Character/Model_OldGeng.glb",
], { cwd: path.dirname(project), stdio: "inherit", windowsHide: true });
if (result.status !== 0) throw new Error(`Old Geng conversion failed (${result.status})`);

const reportFile = path.join(project, "Model/Character/Data_OldGeng.json");
const report = JSON.parse(fs.readFileSync(reportFile, "utf8"));
report.script = "_import/Script_BuildOldGeng.mjs";
report.input = {
  file: path.basename(source), sha256: createHash("sha256").update(sourceBytes).digest("hex"),
  skins: sourceDoc.skins.length, joints: sourceDoc.skins[0].joints.length,
};
report.reconstructionScope = [
  "老耿的脸型、光头、灰色旧中式上衣、腰带、裤装、绑腿和草鞋按角色参考图设计，属于本作创作外观。",
  "手腕、领口与下肢衔接修整，以及骨架、蒙皮和动作适配属于游戏表现。",
];
report.historicalReferences = [];
report.facing = { sourceForward: "+Z", actorForward: "-Z", evidence: "Script_ModelFacingTest.mjs" };
fs.writeFileSync(reportFile, `${JSON.stringify(report, null, 2)}\n`);

const contacts = spawnSync(process.execPath, [path.join(import.meta.dirname, "Script_BakeOldGengContacts.mjs")],
  { cwd: path.dirname(project), stdio: "inherit", windowsHide: true });
if (contacts.status !== 0) throw new Error(`Old Geng contact bake failed (${contacts.status})`);
