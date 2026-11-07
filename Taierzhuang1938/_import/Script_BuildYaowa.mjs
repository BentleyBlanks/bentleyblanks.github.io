// Convert the user-downloaded Yaowa V6 skin while retaining the approved proportions.
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";

const project = path.resolve(import.meta.dirname, "..");
const source = path.resolve(process.argv[2] || process.env.YAOWA_SOURCE ||
  "C:/Users/Bentl/OneDrive/Sync/饮河/FPS/角色/Tripo/04_幺娃/Yaowa_Merged_V6_Bones.glb");
const sourceBytes = fs.readFileSync(source);
const sourceDoc = JSON.parse(sourceBytes.subarray(20, 20 + sourceBytes.readUInt32LE(12)));
if (sourceDoc.skins?.length !== 1 || sourceDoc.materials?.length !== 1) {
  throw new Error("Yaowa input requires one complete skin and one material");
}

const result = spawnSync(process.execPath, [
  path.join(import.meta.dirname, "Script_BuildXBotRigCharacter.mjs"), source,
  "--crown", "1.615", "--out", "Model/Character/Model_Yaowa.glb",
], { cwd: path.dirname(project), stdio: "inherit", windowsHide: true });
if (result.status !== 0) throw new Error(`Yaowa conversion failed (${result.status})`);

const reportFile = path.join(project, "Model/Character/Data_Yaowa.json");
const report = JSON.parse(fs.readFileSync(reportFile, "utf8"));
report.script = "_import/Script_BuildYaowa.mjs";
report.input = {
  file: path.basename(source), sha256: createHash("sha256").update(sourceBytes).digest("hex"),
  skins: sourceDoc.skins.length, joints: sourceDoc.skins[0].joints.length,
};
report.reconstructionScope = [
  "幺娃V6的脸型、无发无须头部、软军帽、灰色旧军服、草鞋和身体比例沿用用户确认的角色外观，属于本作创作设计。",
  "保留V6的完整颈部皮肤、手指长度和脚踝形状，骨架、蒙皮及动作适配属于游戏表现。",
];
report.historicalReferences = [];
report.facing = { sourceForward: "+Z", actorForward: "-Z", evidence: "Script_ModelFacingTest.mjs" };
fs.writeFileSync(reportFile, `${JSON.stringify(report, null, 2)}\n`);
const contacts = spawnSync(process.execPath, [path.join(import.meta.dirname, "Script_BakeYaowaContacts.mjs")], {
  cwd: path.dirname(project), stdio: "inherit", windowsHide: true,
});
if (contacts.status !== 0) throw new Error(`Yaowa contact bake failed (${contacts.status})`);
