// Convert the user's repaired V12 Tripo skin to the shared runtime skeleton.
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";

const project = path.resolve(import.meta.dirname, "..");
const source = path.resolve(process.argv[2] || process.env.AZUMA_SHIRO_SOURCE ||
  "C:/Users/Bentl/OneDrive/Sync/饮河/FPS/角色/Tripo/13_东史郎/AzumaShiro_Merged_V12_Bones.glb");
const sourceBytes = fs.readFileSync(source);
const sourceDoc = JSON.parse(sourceBytes.subarray(20, 20 + sourceBytes.readUInt32LE(12)));
if (sourceDoc.meshes?.length !== 1 || sourceDoc.skins?.length !== 1 || sourceDoc.materials?.length !== 1) {
  throw new Error("Azuma Shiro input requires one complete mesh, skin and material");
}
const conversion = spawnSync(process.execPath, [
  path.join(import.meta.dirname, "Script_BuildXBotRigCharacter.mjs"), source,
  "--crown", "1.840000033378601", "--out", "Model/Character/Model_AzumaShiro.glb",
], { cwd: path.dirname(project), stdio: "inherit", windowsHide: true });
if (conversion.status !== 0) throw new Error(`Azuma Shiro conversion failed (${conversion.status})`);

const reportFile = path.join(project, "Model/Character/Data_AzumaShiro.json");
const report = JSON.parse(fs.readFileSync(reportFile, "utf8"));
report.script = "_import/Script_BuildAzumaShiro.mjs";
report.input = {
  file: path.basename(source), sha256: createHash("sha256").update(sourceBytes).digest("hex"),
  skins: sourceDoc.skins.length, joints: sourceDoc.skins[0].joints.length,
};
report.reconstructionScope = [
  "东史郎角色的脸型、钢盔、下巴带、卡其军服、三颗星的肩章、绑腿、皮靴和身体比例按角色参考图设计，属于本作创作外观。",
  "采用用户修复后的V12绑骨件，保留颈根与背部底色修复；骨架与动作适配属于游戏表现，不主张精确还原历史人物的实际相貌或装备细节。",
];
report.historicalReferences = [];
report.facing = { sourceForward: "+Z", actorForward: "-Z", evidence: "Script_ModelFacingTest.mjs" };
fs.writeFileSync(reportFile, `${JSON.stringify(report, null, 2)}\n`);

const contacts = spawnSync(process.execPath, [path.join(import.meta.dirname, "Script_BakeAzumaShiroContacts.mjs")],
  { cwd: path.dirname(project), stdio: "inherit", windowsHide: true });
if (contacts.status !== 0) throw new Error(`Azuma Shiro contact bake failed (${contacts.status})`);
