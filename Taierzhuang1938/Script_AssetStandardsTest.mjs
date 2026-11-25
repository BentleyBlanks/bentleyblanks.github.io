// 资产导出规范（AssetPipeline/Data_AssetStandards.json）、Blender 管线、生成清单与独立配置器的离线一致性测试；
// 另守「规范不进游戏」：游戏运行时与 index.html 不引用 AssetPipeline/，配置器页面不 import 游戏模块。

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { WEAPONS, LOADOUTS } from "./Data_Weapons.mjs";
import { WeaponShelved } from "./Script_Weapons.mjs";
import { MESHES } from "./Data_Meshes.mjs";
import { FPS_ARM_POSES } from "./Data_FpsArmPoses.mjs";
import {
  ASSET_STANDARD_GROUPS, ComplianceFor, ExternalComplianceFor, EXTERNAL_GLB_STANDARDS, MIN_DECIMATION_REDUCTION,
  SCENE_RENDER_LIMITS, SOURCE_ASSET_STANDARDS, SPECIAL_TRIANGLE_TARGETS, TRIANGLE_RULES,
} from "./AssetPipeline/Script_AssetStandardsNode.mjs";

const projectDir = path.dirname(fileURLToPath(import.meta.url));
const type89Contract = JSON.parse(fs.readFileSync(path.join(projectDir, "Model/Type89MediumTank/Data_ReferenceContract.json"), "utf8"));
const index = JSON.parse(fs.readFileSync(path.join(projectDir, "Model", "Data_ModelIndex.json"), "utf8"));
const built = new Map(index.models.map((entry) => [entry.name, entry]));
const pythonRules = fs.readFileSync(path.join(projectDir, "_blender", "AssetBudgets.py"), "utf8");
const toolSource = fs.readFileSync(path.join(projectDir, "AdvancedTools", "Script_AssetStandardsTool.mjs"), "utf8");
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
Check(SCENE_RENDER_LIMITS.drawCalls === 5000 && SCENE_RENDER_LIMITS.triangles === 9000000
  && /SCENE_RENDER_LIMITS/.test(bootTestSource),
// 原来还要求场景关卡编辑器的预算读数引用它；该编辑器 2026-10-31 删除，这条职责随之离开，
// 新的场景编辑器接上预算读数后可把这一项加回来。
"恢复原模后的全场红线由规范与开机门禁共用");
Check(/WEAPON_TRIANGLE_LIMIT\s*=\s*30000/.test(pythonRules)
  && /VEHICLE_TRIANGLE_LIMIT\s*=\s*80000/.test(pythonRules),
"浏览器规范与 Blender 分类阈值一致");

for (const [id, target] of Object.entries(SPECIAL_TRIANGLE_TARGETS)) {
  const pythonPair = new RegExp(`"${id}"\\s*:\\s*${target}`).test(pythonRules);
  const actual = MESHES[id]?.triangles;
  Check(pythonPair && actual <= target && actual >= target * 0.97,
    `${id} 指定面数目标 ${target.toLocaleString("en-US")}`,
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
// 八九式重掷弹筒现在有单独的外观来源和面数上限。
Check(Object.keys(SOURCE_ASSET_STANDARDS).length === 14 && missing.length === 0,
  "现有源模型均进入资产规范清单", missing.join("、"));
Check(!WEAPONS.Mauser96 && Object.values(LOADOUTS).every((loadout) =>
  [loadout.primary, loadout.secondary, loadout.melee].every((id) => !id || WEAPONS[id]))
  && !MESHES.Mauser96 && !SOURCE_ASSET_STANDARDS.Mauser96
  && !FPS_ARM_POSES.Mauser96 && !fs.existsSync(path.join(projectDir, "Model", "Model_Mauser96.tzm.json")),
  "已移除的 C96 不再登记或随游戏发布");
Check(drift.length === 0, "实际面数与 Model/Data_ModelIndex.json 一致", drift.join("、"));
Check(sourceDrift.length === 0, "原始选定面数与 Blender 构建元数据一致", sourceDrift.join("、"));
Check(complianceBad.length === 0, "全部有源资产符合特例或分类阈值", complianceBad.join("、"));

// Measure the shipped geometry, not just its claimed -Z axis or muzzle marker.
// The old export kept correct mount labels while its wood grip was at the front.
// 手枪暂时停用（Data_Weapons.SHELVED_WEAPONS）：模型与握持姿势保留，这组检查先跳过。
function CheckServicePistolGrip() {
  const servicePistol = JSON.parse(fs.readFileSync(path.join(projectDir, "Model", "Model_ServicePistol.tzm.json"), "utf8"));
  const gripTriangles = [];
  const gripVertices = servicePistol.meshes.filter((mesh) => mesh.material === "wood").flatMap((mesh) => {
    const bytes = Buffer.from(mesh.pos, "base64");
    const points = Array.from({ length: mesh.count }, (_, index) => [0, 1, 2].map((axis) =>
      mesh.posMin[axis] + bytes.readUInt16LE((index * 3 + axis) * 2) * mesh.posScale[axis]));
    const indices = Buffer.from(mesh.idx,"base64"), stride=mesh.idxBits===32?4:2;
    const ReadIndex = offset => stride===4?indices.readUInt32LE(offset):indices.readUInt16LE(offset);
    for(let offset=0;offset<indices.length;offset+=3*stride)gripTriangles.push(
      [0,1,2].map(i=>points[ReadIndex(offset+i*stride)]));
    return points;
  });
  const gripMean = [0, 1, 2].map((axis) => gripVertices.reduce((sum, point) => sum + point[axis], 0) / gripVertices.length);
  const muzzle = servicePistol.nodes.find((node) => node.name === "muzzle").t;
  Check(gripMean[2] > (servicePistol.bounds.min[2] + servicePistol.bounds.max[2]) / 2
    && gripMean[1] < muzzle[1] - 0.02, "军用手枪真实木握把在枪口后下方");
  const palm = FPS_ARM_POSES.ServicePistol.contacts.right.position;
  const palmGap = Math.min(...gripTriangles.map(triangle => PointTriangleDistance(palm,triangle)));
  Check(palmGap < 0.012, "军用手枪右掌接触真实握把表面", `${(palmGap * 1000).toFixed(1)} mm`);
  const magazine = servicePistol.nodes.find((node) => node.name === "magazine").t;
  Check(Math.abs(magazine[1] - servicePistol.bounds.min[1]) < 0.012
    && Math.abs(magazine[2] - gripMean[2]) < 0.025, "军用手枪换匣入口位于握把底部");
}
// A palm can touch the middle of a broad triangle several centimetres from
// every vertex. Measure the shipped surface while retaining the 12 mm gate.
function PointTriangleDistance(point,[a,b,c]) {
  const Sub=(p,q)=>p.map((v,i)=>v-q[i]),Dot=(p,q)=>p.reduce((sum,v,i)=>sum+v*q[i],0);
  const ab=Sub(b,a),ac=Sub(c,a),ap=Sub(point,a),aa=Dot(ab,ab),cc=Dot(ac,ac),across=Dot(ab,ac);
  const denominator=aa*cc-across*across;
  if(denominator>1e-20){
    const u=(cc*Dot(ap,ab)-across*Dot(ap,ac))/denominator;
    const v=(aa*Dot(ap,ac)-across*Dot(ap,ab))/denominator;
    if(u>=0&&v>=0&&u+v<=1)return Math.hypot(...ap.map((value,i)=>value-u*ab[i]-v*ac[i]));
  }
  return Math.min(...[[a,b],[b,c],[c,a]].map(([from,to])=>{
    const direction=Sub(to,from),delta=Sub(point,from),length=Dot(direction,direction);
    const t=length?Math.max(0,Math.min(1,Dot(delta,direction)/length)):0;
    return Math.hypot(...delta.map((value,i)=>value-t*direction[i]));
  }));
}
if (WeaponShelved("ServicePistol")) console.log("skip 军用手枪握把与换匣检查（手枪暂时停用）");
else CheckServicePistolGrip();

Check(["Type95HaGo", "Type97ChiHa"].every((id) => !WEAPONS[id] && !MESHES[id] && !SOURCE_ASSET_STANDARDS[id]
  && !built.has(id) && !fs.existsSync(path.join(projectDir, "Model", `Model_${id}.tzm.json`))),
  "退役的九五式和九七式无运行时登记或发布模型");
Check(EXTERNAL_GLB_STANDARDS.length === 64
  && EXTERNAL_GLB_STANDARDS.some(record=>record.id==='Type38_511'&&record.actualTriangles===74412&&record.targetTriangles===80000)
  && EXTERNAL_GLB_STANDARDS.some(record=>record.id==='RifleSlingFlatV3'&&record.actualTriangles===6584&&record.targetTriangles===6584)
  && EXTERNAL_GLB_STANDARDS.some(record=>record.id==='HanYang173R'&&record.actualTriangles===79909&&record.targetTriangles===80000)
  && EXTERNAL_GLB_STANDARDS.some((record) => record.id === "SingleBlanket" && record.actualTriangles === 12880 && record.targetTriangles === 12880)
  && ["DongguaQuilt", "DoorCurtain", "SichuanBanner"].every(id => EXTERNAL_GLB_STANDARDS.some(record => record.id === id
    && record.pack === `ClothLab/Model_${id}.glb` && record.actualTriangles === 13712 && record.sourceTriangles === 13712 && record.targetTriangles === 13712))
  && EXTERNAL_GLB_STANDARDS.some((record) => record.id === "DonkeyCart" && record.actualTriangles === 79500 && record.targetTriangles <= 80000)
  && EXTERNAL_GLB_STANDARDS.some((record) => record.id === "Donkey" && record.actualTriangles === 79888 && record.sourceTriangles === 79888 && record.targetTriangles === record.actualTriangles)
  && EXTERNAL_GLB_STANDARDS.some((record) => record.id === "NakajimaKi4" && record.sourceTriangles === 358399 && record.actualTriangles === 179679 && record.targetTriangles === 180000)
  && EXTERNAL_GLB_STANDARDS.some((record) => record.id === "Type89MediumTank" && record.sourceTriangles === type89Contract.sourceTrianglesBeforeExportCleanup && record.selectedGameSourceTriangles === type89Contract.selectedGameSourceTrianglesBeforeCleanup && record.actualTriangles === type89Contract.runtimeRenderedTriangles && record.targetTriangles === type89Contract.runtimeTriangleTarget)
  && EXTERNAL_GLB_STANDARDS.some((record) => record.id === "KawasakiType88" && record.sourceTriangles === 266946 && record.actualTriangles === 79944 && record.targetTriangles === 80000)
  && EXTERNAL_GLB_STANDARDS.every((record) => record.actualTriangles > 0 && record.targetTriangles > 0),
  "外部 GLB 分类登记既有资产、独立布料测试三件、飞机战车、汉阳造173R、三八式511与扁平背带，共 70 项");

Check(ExternalComplianceFor({actualTriangles:82202,targetTriangles:80000,selectedGameSourceTriangles:82202,policy:"target"}).retained
  && ExternalComplianceFor({actualTriangles:81906,targetTriangles:80000,selectedGameSourceTriangles:82202,exportRemovedZeroAreaTriangles:296,policy:"target"}).retained
  && !ExternalComplianceFor({actualTriangles:81906,targetTriangles:80000,selectedGameSourceTriangles:82202,policy:"target"}).retained
  && !ExternalComplianceFor({actualTriangles:90000,targetTriangles:80000,selectedGameSourceTriangles:90000,policy:"target"}).retained
  && !ExternalComplianceFor({actualTriangles:82202,targetTriangles:80000,policy:"target"}).retained,
  "外部GLB的5%免减面须有选定游戏源登记，且不能放过超阈值源或无登记偏离");

const groupIds = new Set(ASSET_STANDARD_GROUPS.map((entry) => entry.id));
Check(["firearm", "assembly", "melee", "vehicle", "procedural", "external", "texture"]
  .every((id) => groupIds.has(id)), "编辑器包含枪械/炮械/刀剑/战车/程序化/GLB/贴图七类");
Check(/原始面数/.test(toolSource) && /实际面数/.test(toolSource)
  && /面数降幅/.test(toolSource) && /自带贴图/.test(toolSource),
"资产规范配置器展示原始/实际/降幅/贴图列");
Check(/Data_ModelIndex\.json/.test(toolSource) && /Data_AssetStandards\.json/.test(toolSource),
  "配置器读规范 JSON 与构建产物 Model/Data_ModelIndex.json，而不是游戏的 Data_Meshes");
{
  const imports = [...toolSource.matchAll(/^\s*import\s[^;]*?from\s+["']([^"']+)["']/gm)].map((match) => match[1]);
  Check(imports.length > 0 && imports.every((spec) => spec === "../AssetPipeline/Script_AssetStandards.mjs"),
    "配置器页面只 import AssetPipeline 的判定模块，不 import 游戏代码", imports.join(", "));
  const page = fs.readFileSync(path.join(projectDir, "AdvancedTools", "Tool_AssetStandards.html"), "utf8");
  Check(!/Style_(Interface|Editor)\.css|vendor\//.test(page), "配置器页面不加载游戏样式与 vendor");
}
{
  // 游戏运行时（非测试的根目录 Script_ / Data_ 模块）不 import 规范目录，index.html 也不登记；整关驾驶 Kit 是 Node 侧测试驱动。
  const nodeSideDrivers = new Set(["Script_FirstLevelCampaignKit.mjs"]);
  const offenders = fs.readdirSync(projectDir).filter((name) => /^(Script|Data)_.*\.mjs$/.test(name) && !/Test/.test(name) && !nodeSideDrivers.has(name))
    .filter((name) => /(?:from\s*|import\s*\(\s*)["'][^"']*(?:AssetPipeline\/|Data_AssetStandards)/.test(fs.readFileSync(path.join(projectDir, name), "utf8")));
  Check(offenders.length === 0 && !/AssetPipeline|AssetStandards/.test(html), "游戏运行时与 import map 不引用资产规范", offenders.join(", "));
  Check(!fs.existsSync(path.join(projectDir, "Data_AssetStandards.mjs"))
    && !fs.existsSync(path.join(projectDir, "AdvancedTools", "Script_EditorAssetStandards.mjs")), "旧的游戏内规范模块与工具宿主编辑器已删除");
  const { REDRAFT_TRIANGLE_BUDGETS } = await import("./Data_OpeningSet0103.mjs");
  Check(REDRAFT_TRIANGLE_BUDGETS.hanYang === EXTERNAL_GLB_STANDARDS.find((record) => record.id === "HanYang173R").targetTriangles,
    "01–02 布景里汉阳造173R的额度与规范登记目标一致", String(REDRAFT_TRIANGLE_BUDGETS.hanYang));
}

// Compare triangle-corner UV distributions against the downloaded glTF, so a
// future rebuild cannot silently replace the authored atlas with box projection.
const type89 = JSON.parse(fs.readFileSync(path.join(projectDir, "Model/Model_Type89Tank.tzm.json"), "utf8"));
const source89 = JSON.parse(fs.readFileSync(path.join(projectDir, "_import/Source/Model_Type89ChiRo/scene.gltf"), "utf8"));
const source89Bin = fs.readFileSync(path.join(projectDir, "_import/Source/Model_Type89ChiRo/scene.bin"));
function Source89Value(accessorId, index, axis = 0) {
  const accessor = source89.accessors[accessorId], view = source89.bufferViews[accessor.bufferView];
  const components = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[accessor.type];
  const bytes = accessor.componentType === 5126 || accessor.componentType === 5125 ? 4 : 2;
  const offset = (view.byteOffset || 0) + (accessor.byteOffset || 0)
    + index * (view.byteStride || components * bytes) + axis * bytes;
  return accessor.componentType === 5126 ? source89Bin.readFloatLE(offset)
    : bytes === 4 ? source89Bin.readUInt32LE(offset) : source89Bin.readUInt16LE(offset);
}
for (let i = 0; i < type89.meshes.length; i++) {
  const block = type89.meshes[i], primitive = source89.meshes[i].primitives[0];
  const indexBytes = Buffer.from(block.idx, "base64"), uvBytes = Buffer.from(block.uv, "base64");
  for (let axis = 0; axis < 2; axis++) {
    const source = [], runtime = [];
    for (let corner = 0; corner < source89.accessors[primitive.indices].count; corner++) {
      const vertex = Source89Value(primitive.indices, corner);
      const uv = Source89Value(primitive.attributes.TEXCOORD_0, vertex, axis);
      source.push(axis === 1 ? 1 - uv : uv); // Blender/TZM use bottom-left UVs.
    }
    for (let corner = 0; corner < block.idxCount; corner++) {
      const vertex = block.idxBits === 32 ? indexBytes.readUInt32LE(corner * 4) : indexBytes.readUInt16LE(corner * 2);
      runtime.push(block.uvMin[axis] + uvBytes.readUInt16LE((vertex * 2 + axis) * 2) * block.uvScale[axis]);
    }
    source.sort((a, b) => a - b); runtime.sort((a, b) => a - b);
    const error = Math.max(...source.map((value, j) => Math.abs(value - runtime[j])));
    Check(source.length === runtime.length && error < 0.0001,
      `Type89 mesh ${i} authored UV axis ${axis} survives export`, String(error));
  }
}
Check(type89.triangles === 4089 && type89.meshes.map((m) => m.material).join(",")
  === "type89Armor,type89Track,type89Armor,type89Barrel", "八九式保留原拓扑和专用装甲/履带材质");

if (failed) {
  console.error(`\n资产规范失败：${failed} 项。`);
  process.exit(1);
}
console.log("\n资产规范通过。");
