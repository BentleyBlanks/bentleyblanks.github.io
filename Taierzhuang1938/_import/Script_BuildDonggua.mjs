// Convert the user-provided Donggua skin to the shared X Bot runtime rig.
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";

const project = path.resolve(import.meta.dirname, "..");
const repository = path.dirname(project);
const source = path.resolve(process.argv[2] || process.env.DONGGUA_SOURCE ||
  "C:/Users/Bentl/OneDrive/Sync/饮河/FPS/角色/Tripo/03_冬瓜/Donggua_Merged_V3_Local_Bones.glb");
const sourceBytes = fs.readFileSync(source);
const sourceDoc = JSON.parse(sourceBytes.subarray(20, 20 + sourceBytes.readUInt32LE(12)));
const sourceSkins = sourceDoc.skins?.length || 0;

function RunNode(args) {
  const result = spawnSync(process.execPath, args, {
    cwd: repository, stdio: "inherit", windowsHide: true,
  });
  if (result.status !== 0) throw new Error(`Build stage failed: ${args[0]} (${result.status})`);
}

if (sourceSkins !== 1) throw new Error("冬瓜输入需要一套完整骨架与蒙皮");
RunNode([
  path.join(import.meta.dirname, "Script_BuildXBotRigCharacter.mjs"), source,
  "--crown", "1.8350000381469727", "--out", "Model/Character/Model_Donggua.glb",
]);

const reportFile = path.join(project, "Model/Character/Data_Donggua.json");
const report = JSON.parse(fs.readFileSync(reportFile, "utf8"));
report.script = "_import/Script_BuildDonggua.mjs";
report.input = {
  file: path.basename(source), sha256: createHash("sha256").update(sourceBytes).digest("hex"), skins: sourceSkins,
};
report.reconstructionScope = [
  "冬瓜的脸型、灰色旧军服、补丁、软军帽、绑腿和草鞋按参考图设计，属于本作创作外观。",
  "人物骨架、蒙皮与动作适配属于游戏表现。",
];
report.historicalReferences = [];
fs.writeFileSync(reportFile, `${JSON.stringify(report, null, 2)}\n`);
