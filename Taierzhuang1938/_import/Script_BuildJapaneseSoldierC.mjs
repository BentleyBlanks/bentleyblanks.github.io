// Build the supplied soldier C appearance, using the existing canonical rig pipeline.
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";

const project = path.resolve(import.meta.dirname, "..");
const repository = path.dirname(project);
const source = path.resolve(process.argv[2] || process.env.JPC_SOURCE ||
  "C:/Users/Bentl/OneDrive/Sync/饮河/FPS/角色/Tripo/12_日军士兵C/JapaneseSoldierC_Merged_V4_Bones.glb");
const assets = path.dirname(source);
const work = process.env.JPC_WORK ||
  "C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/JapaneseSoldierCIntegration_20261106";
const sourceBytes = fs.readFileSync(source);
const sourceDoc = JSON.parse(sourceBytes.subarray(20, 20 + sourceBytes.readUInt32LE(12)));
const sourceSkins = sourceDoc.skins?.length || 0;

function RunNode(args, env = {}) {
  const result = spawnSync(process.execPath, args, {
    cwd: repository,
    env: { ...process.env, ...env },
    stdio: "inherit",
    windowsHide: true,
  });
  if (result.status !== 0) throw new Error(`Build stage failed: ${args[0]} (${result.status})`);
}

let boundSource = source;
let preparation = null;
let binding = null;
if (sourceSkins === 0) {
  RunNode([
    path.join(repository, "scripts/Script_BlenderMcp.mjs"), "start", "--batch",
    path.join(import.meta.dirname, "Script_BindJapaneseSoldierC.py"),
    "--task", "JapaneseSoldierCIntegration_20261106", "--json",
  ], { JPC_SOURCE: source, JPC_ASSETS: assets, JPC_WORK: work });
  preparation = JSON.parse(fs.readFileSync(path.join(work, "Data_SourcePreparation.json"), "utf8"));
  binding = JSON.parse(fs.readFileSync(path.join(work, "Data_JapaneseSoldierCV4Binding.json"), "utf8"));
  boundSource = binding.output;
}
RunNode([
  path.join(import.meta.dirname, "Script_BuildXBotRigCharacter.mjs"), boundSource,
  "--crown", "1.8367732763290405", "--out", "Model/Character/Model_JapaneseSoldierC.glb",
]);

const reportFile = path.join(project, "Model/Character/Data_JapaneseSoldierC.json");
const report = JSON.parse(fs.readFileSync(reportFile, "utf8"));
report.input = {
  file: path.basename(source),
  sha256: createHash("sha256").update(sourceBytes).digest("hex"),
  skins: sourceSkins,
};
if (binding) {
  report.localBinding = {
    script: "_import/Script_BindJapaneseSoldierC.py",
    method: binding.method,
    donorFile: binding.donorFile,
    donorSha256: binding.donorSha256,
    bones: binding.bones,
    maximumInfluences: binding.maximumInfluences,
    unweightedVertices: binding.unweightedVertices,
    bodyTransferDistanceM: binding.bodyTransferDistanceM,
    normalizationScale: preparation.normalizationScale,
    normalizationMatrix: preparation.normalizationMatrix,
    maximumSourceAlignmentErrorM: preparation.maximumSourceAlignmentErrorM,
  };
}
report.reconstructionScope = [
  "日军士兵C的脸型、军服配色与旧化、军帽、绑腿和皮靴按参考图设计，属于本作创作外观。",
  "骨架拟合、蒙皮、持枪和动作适配属于游戏表现。",
];
report.historicalReferences = [];
fs.writeFileSync(reportFile, `${JSON.stringify(report, null, 2)}\n`);
RunNode([path.join(import.meta.dirname, "Script_BakeJapaneseSoldierCContacts.mjs")]);
