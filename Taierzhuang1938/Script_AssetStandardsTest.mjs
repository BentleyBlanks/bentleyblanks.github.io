// 资产面数规范、Blender 管线、生成清单与浏览器编辑器的离线一致性测试。

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { MESHES } from "./Data_Meshes.mjs";
import {
  ASSET_STANDARD_GROUPS, ComplianceFor, SCENE_RENDER_LIMITS, SOURCE_ASSET_STANDARDS,
  SPECIAL_TRIANGLE_TARGETS, TRIANGLE_RULES,
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
Check(SCENE_RENDER_LIMITS.drawCalls === 5000 && SCENE_RENDER_LIMITS.triangles === 6500000
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

Check(MESHES.WaltherP38.triangles >= 29100 && MESHES.WaltherP38.triangles <= 30000,
  "P38 超 30k 后落在接近 30k 的 3% 窗内", String(MESHES.WaltherP38.triangles));
Check(MESHES.Type95HaGo.triangles >= 77600 && MESHES.Type95HaGo.triangles <= 80000,
  "九五式超 80k 后落在接近 80k 的 3% 窗内", String(MESHES.Type95HaGo.triangles));

const groupIds = new Set(ASSET_STANDARD_GROUPS.map((entry) => entry.id));
Check(["firearm", "assembly", "melee", "vehicle", "procedural", "external", "texture"]
  .every((id) => groupIds.has(id)), "编辑器包含枪械/炮械/刀剑/战车/程序化/GLB/贴图七类");
Check(/原始面数/.test(editorSource) && /实际面数/.test(editorSource)
  && /面数降幅/.test(editorSource) && /自带贴图/.test(editorSource),
"资产规范表展示原始/实际/降幅/贴图列");
Check(/AssetStandardsEditor/.test(suiteSource)
  && /Script_EditorAssetStandards\.mjs\?v=1/.test(html)
  && /Data_AssetStandards\.mjs\?v=1/.test(html),
"资产规范编辑器已注册到套件与 import map");

if (failed) {
  console.error(`\n资产规范失败：${failed} 项。`);
  process.exit(1);
}
console.log("\n资产规范通过。");
