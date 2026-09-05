// 资产面数规范、Blender 管线、生成清单与浏览器编辑器的离线一致性测试。

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { MESHES } from "./Data_Meshes.mjs";
import { FPS_ARM_POSES } from "./Data_FpsArmPoses.mjs";
import {
  ASSET_STANDARD_GROUPS, ComplianceFor, EXTERNAL_GLB_STANDARDS, MIN_DECIMATION_REDUCTION,
  SCENE_RENDER_LIMITS, SOURCE_ASSET_STANDARDS, SPECIAL_TRIANGLE_TARGETS, TRIANGLE_RULES,
} from "./Data_AssetStandards.mjs";

const projectDir = path.dirname(fileURLToPath(import.meta.url));
const index = JSON.parse(fs.readFileSync(path.join(projectDir, "Model", "Index.json"), "utf8"));
const built = new Map(index.models.map((entry) => [entry.name, entry]));
const pythonRules = fs.readFileSync(path.join(projectDir, "_blender", "AssetBudgets.py"), "utf8");
const editorSource = fs.readFileSync(path.join(projectDir, "Script_EditorAssetStandards.mjs"), "utf8");
const suiteSource = fs.readFileSync(path.join(projectDir, "Script_Editor.mjs"), "utf8");
const sceneEditorSource = fs.readFileSync(path.join(projectDir, "Script_EditorScene.mjs"), "utf8");
const bootTestSource = fs.readFileSync(path.join(projectDir, "Script_BootTest.mjs"), "utf8");
const html = fs.readFileSync(path.join(projectDir, "index.html"), "utf8");

let failed = 0;
const Check = (ok, label, detail = "") => {
  if (!ok) failed += 1;
  console.log(`${ok ? "ok  " : "FAIL"} ${label}${detail ? `  ${detail}` : ""}`);
};

Check(TRIANGLE_RULES.weapon.limit === 30000, "枪械仅在选定源几何 > 30,000 时减面");
Check(TRIANGLE_RULES.vehicle.limit === 80000, "战车仅在选定源几何 > 80,000 时减面");
Check(MIN_DECIMATION_REDUCTION === 0.05 && /MIN_DECIMATION_REDUCTION\s*=\s*0\.05/.test(pythonRules),
  "降幅 5% 及以下时浏览器规范与 Blender 都保留原始拓扑");
Check(SCENE_RENDER_LIMITS.drawCalls === 5000 && SCENE_RENDER_LIMITS.triangles === 8100000
  && /SCENE_RENDER_LIMITS/.test(sceneEditorSource) && /SCENE_RENDER_LIMITS/.test(bootTestSource),
"恢复原模后的全场红线由规范、编辑器与开机门禁共用");
Check(/WEAPON_TRIANGLE_LIMIT\s*=\s*30000/.test(pythonRules)
  && /VEHICLE_TRIANGLE_LIMIT\s*=\s*80000/.test(pythonRules),
"浏览器规范与 Blender 分类阈值一致");

for (const [id, target] of Object.entries(SPECIAL_TRIANGLE_TARGETS)) {
  const pythonPair = new RegExp(`"${id}"\\s*:\\s*${target}`).test(pythonRules);
  const actual = MESHES[id]?.triangles;
  Check(pythonPair && actual <= target && actual >= target * 0.97,
    `${id} 指定翻倍目标 ${target.toLocaleString("en-US")}`,
    `实际 ${actual?.toLocaleString("en-US")}`);
}

const missing = [];
const drift = [];
const sourceDrift = [];
const complianceBad = [];
for (const [id, record] of Object.entries(SOURCE_ASSET_STANDARDS)) {
  const mesh = MESHES[id];
  const build = built.get(id);
  if (!mesh || !build) { missing.push(id); continue; }
  if (mesh.triangles !== build.triangles) drift.push(`${id}:${mesh.triangles}/${build.triangles}`);
  if (record.sourceTriangles != null && record.sourceTriangles !== build.sourceTriangles) {
    sourceDrift.push(`${id}:${record.sourceTriangles}/${build.sourceTriangles}`);
  }
  if (ComplianceFor(id, mesh.triangles).tone === "bad") complianceBad.push(id);
  if (record.sourceTriangles != null && !record.repair) {
    const rule = record.group === "vehicle" ? TRIANGLE_RULES.vehicle : TRIANGLE_RULES.weapon;
    if (record.sourceTriangles <= rule.limit && mesh.triangles < record.sourceTriangles * 0.97) {
      complianceBad.push(`${id}(阈值内却明显减面)`);
    }
  }
}
Check(Object.keys(SOURCE_ASSET_STANDARDS).length >= 25 && missing.length === 0,
  "现有源模型均进入资产规范清单", missing.join("、"));
Check(drift.length === 0, "实际面数与 Model/Index.json 一致", drift.join("、"));
Check(sourceDrift.length === 0, "原始选定面数与 Blender 构建元数据一致", sourceDrift.join("、"));
Check(complianceBad.length === 0, "全部有源资产符合特例或分类阈值", complianceBad.join("、"));

// Measure the shipped geometry, not just its claimed -Z axis or muzzle marker.
// The old export kept correct mount labels while its wood grip was at the front.
const servicePistol = JSON.parse(fs.readFileSync(path.join(projectDir, "Model", "ServicePistol.tzm.json"), "utf8"));
const gripVertices = servicePistol.meshes.filter((mesh) => mesh.material === "wood").flatMap((mesh) => {
  const bytes = Buffer.from(mesh.pos, "base64");
  return Array.from({ length: mesh.count }, (_, index) => [0, 1, 2].map((axis) =>
    mesh.posMin[axis] + bytes.readUInt16LE((index * 3 + axis) * 2) * mesh.posScale[axis]));
});
const gripMean = [0, 1, 2].map((axis) => gripVertices.reduce((sum, point) => sum + point[axis], 0) / gripVertices.length);
const muzzle = servicePistol.nodes.find((node) => node.name === "muzzle").t;
Check(gripMean[2] > (servicePistol.bounds.min[2] + servicePistol.bounds.max[2]) / 2
  && gripMean[1] < muzzle[1] - 0.02, "军用手枪真实木握把在枪口后下方");
const palm = FPS_ARM_POSES.ServicePistol.contacts.right.position;
const palmGap = Math.min(...gripVertices.map((point) => Math.hypot(...point.map((value, axis) => value - palm[axis]))));
Check(palmGap < 0.012, "军用手枪右掌接触真实握把表面", `${(palmGap * 1000).toFixed(1)} mm`);
const magazine = servicePistol.nodes.find((node) => node.name === "magazine").t;
Check(Math.abs(magazine[1] - servicePistol.bounds.min[1]) < 0.012
  && Math.abs(magazine[2] - gripMean[2]) < 0.025, "军用手枪换匣入口位于握把底部");

Check(MESHES.WaltherP38.triangles === 30362,
  "P38 到 30k 仅降 3.8%，保留源拓扑并只清理退化面", String(MESHES.WaltherP38.triangles));
Check(MESHES.Type95HaGo.triangles === 82142,
  "九五式到 80k 仅降 2.6%，保留 82,142 原始三角", String(MESHES.Type95HaGo.triangles));
Check(EXTERNAL_GLB_STANDARDS.length === 50
  && EXTERNAL_GLB_STANDARDS.every((record) => record.actualTriangles > 0 && record.targetTriangles > 0),
  "外部 GLB 分类登记既有资产与六件滕县自制构件，共 50 项");

const groupIds = new Set(ASSET_STANDARD_GROUPS.map((entry) => entry.id));
Check(["firearm", "assembly", "melee", "vehicle", "procedural", "external", "texture"]
  .every((id) => groupIds.has(id)), "编辑器包含枪械/炮械/刀剑/战车/程序化/GLB/贴图七类");
Check(/原始面数/.test(editorSource) && /实际面数/.test(editorSource)
  && /面数降幅/.test(editorSource) && /自带贴图/.test(editorSource),
"资产规范表展示原始/实际/降幅/贴图列");
Check(/ExternalRows/.test(editorSource) && /EXTERNAL_GLB_STANDARDS/.test(editorSource),
  "外部 GLB 分类使用逐资产审计表而非仅显示通用卡片");
Check(/AssetStandardsEditor/.test(suiteSource)
  && /Script_EditorAssetStandards\.mjs\?v=2/.test(html)
  && /Data_AssetStandards\.mjs\?v=4/.test(html),
"资产规范编辑器已注册到套件与 import map");

if (failed) {
  console.error(`\n资产规范失败：${failed} 项。`);
  process.exit(1);
}
console.log("\n资产规范通过。");
