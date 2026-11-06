// Convert the user-provided Tani Hisao V4 skin to the shared X Bot runtime rig.
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";

const project = path.resolve(import.meta.dirname, "..");
const source = path.resolve(process.argv[2] || process.env.TANI_HISAO_SOURCE ||
  "C:/Users/Bentl/OneDrive/Sync/饮河/FPS/角色/Tripo/09_谷寿夫/TaniHisao_Merged_V4_Bones.glb.glb");
const sourceBytes = fs.readFileSync(source);
const sourceDoc = JSON.parse(sourceBytes.subarray(20, 20 + sourceBytes.readUInt32LE(12)));
if (sourceDoc.skins?.length !== 1 || sourceDoc.materials?.length !== 1) {
  throw new Error("Tani Hisao input requires one complete skin and one material");
}

const result = spawnSync(process.execPath, [
  path.join(import.meta.dirname, "Script_BuildXBotRigCharacter.mjs"), source,
  "--crown", "1.8305917978286743", "--out", "Model/Character/Model_TaniHisao.glb",
], { cwd: path.dirname(project), stdio: "inherit", windowsHide: true });
if (result.status !== 0) throw new Error(`Tani Hisao conversion failed (${result.status})`);

const reportFile = path.join(project, "Model/Character/Data_TaniHisao.json");
const report = JSON.parse(fs.readFileSync(reportFile, "utf8"));
report.script = "_import/Script_BuildTaniHisao.mjs";
report.input = {
  file: path.basename(source), sha256: createHash("sha256").update(sourceBytes).digest("hex"),
  skins: sourceDoc.skins.length, joints: sourceDoc.skins[0].joints.length,
};
report.reconstructionScope = [
  "谷寿夫角色的脸型、军官帽、卡其军服、马裤、长筒皮靴与肩章按角色参考图设计，属于本作创作外观。",
  "无发无须头部、肩章细节和身体比例是建模取舍，骨架及动作适配属于游戏表现。",
];
report.historicalReferences = [];
report.facing = { sourceForward: "+Z", actorForward: "-Z", evidence: "Script_ModelFacingTest.mjs" };
fs.writeFileSync(reportFile, `${JSON.stringify(report, null, 2)}\n`);
