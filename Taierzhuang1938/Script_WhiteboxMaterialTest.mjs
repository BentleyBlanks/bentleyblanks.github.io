// Script_WhiteboxMaterialTest.mjs —— 白盒材质（Script_WhiteboxMaterial，2026-10-31）的 node 回归。
// 跑法：node Taierzhuang1938/Script_WhiteboxMaterialTest.mjs
// 查：数据文件是纯数据（零 three）；白盒表面材质 = 灰色 + 米格线补丁；DressAsWhitebox 原地把语义材质改成灰 + 网格、
// keepColor 保留语义色、水材质是蓝灰 + 反光补丁且没有网格；重复装不叠补丁；补丁都走 Script_MaterialPatches 的注册表（契约 11）。
// 真正编出来、采样器不超预算由 SamplerBudgetTest 的「blockout」装载守着。

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as THREE from "three";
import { WHITEBOX_MATERIAL, WHITEBOX_WATER, BLOCKOUT_EDITOR_FILL, BLOCKOUT_CREEK_LOOK } from "./Data_Tuning_WhiteboxMaterial.mjs";
import { MakeWhiteboxMaterial, MakeWhiteboxWaterMaterial, DressAsWhitebox } from "./Script_WhiteboxMaterial.mjs";
import { PatchKeysOf } from "./Script_MaterialPatches.mjs";

const projectDir = path.dirname(fileURLToPath(import.meta.url));
let checks = 0;
const Check = (ok, what) => { assert.ok(ok, what); checks++; };

// --- 数据 ---
const dataSource = fs.readFileSync(path.join(projectDir, "Data_Tuning_WhiteboxMaterial.mjs"), "utf8");
Check(!/\bimport\b/.test(dataSource), "Data_Tuning_WhiteboxMaterial 是纯数据（没有 import，契约 2）");
Check(WHITEBOX_MATERIAL.surfaceColor === "#909397" && WHITEBOX_MATERIAL.gridColor === "#55585d" && WHITEBOX_MATERIAL.gridSize === 1 && WHITEBOX_MATERIAL.gridLineWidth === 0.012,
  "灰表面 #909397 + 1 m 米格线（线宽 1.2 cm、线色 #55585d）");
Check(WHITEBOX_WATER.color === "#4d6f86" && WHITEBOX_WATER.roughness < 0.2, "蓝灰水色、低粗糙度");
Check(BLOCKOUT_EDITOR_FILL.probe === 1.4 && BLOCKOUT_EDITOR_FILL.ambient === 2.1, "白盒编辑器补光倍率不变");
Check(BLOCKOUT_CREEK_LOOK.reachM > BLOCKOUT_CREEK_LOOK.reachInnerM, "河沟示意参数还在");
Check(Object.isFrozen(WHITEBOX_MATERIAL) && Object.isFrozen(WHITEBOX_WATER), "数据冻结");

// --- 表面材质 ---
const surface = MakeWhiteboxMaterial({ name: "T" });
Check(surface.color.getHexString() === "909397" && surface.roughness === 1 && surface.metalness === 0, "表面材质是中性灰、全粗糙");
Check(PatchKeysOf(surface).join() === "whiteboxGrid1", "表面材质只挂米格线补丁：" + PatchKeysOf(surface).join());
Check(surface.userData.whiteboxMaterial === "surface", "标记 surface");
const semantic = MakeWhiteboxMaterial({ color: "#6e5c45" });
Check(semantic.color.getHexString() === "6e5c45" && PatchKeysOf(semantic).join() === "whiteboxGrid1" && semantic.userData.whiteboxMaterial === "semantic", "语义色块：保留色 + 网格");

// --- DressAsWhitebox（原地改语义材质）---
const earth = new THREE.MeshStandardMaterial({ color: 0x8a6a3a, roughness: 0.82 });
const sameRef = DressAsWhitebox(earth);
Check(sameRef === earth && earth.color.getHexString() === "909397" && earth.roughness === 1 && PatchKeysOf(earth).join() === "whiteboxGrid1", "语义材质原地改成灰 + 网格");
DressAsWhitebox(earth);
Check(PatchKeysOf(earth).join() === "whiteboxGrid1", "重复装不叠补丁");
const timber = new THREE.MeshStandardMaterial({ color: new THREE.Color("#6e5c45") });
DressAsWhitebox(timber, { keepColor: true });
Check(timber.color.getHexString() === "6e5c45" && PatchKeysOf(timber).join() === "whiteboxGrid1" && timber.userData.whiteboxMaterial === "semantic", "keepColor：保留语义色再加网格");
const river = new THREE.MeshStandardMaterial({ color: 0xffffff });
DressAsWhitebox(river, { kind: "water" });
Check(river.color.getHexString() === "4d6f86" && PatchKeysOf(river).join() === "whiteboxWater1" && river.roughness === WHITEBOX_WATER.roughness, "水：蓝灰 + 反光补丁，没有网格");
const plain = DressAsWhitebox({ name: "noColor" });
Check(plain.name === "noColor", "没有 color 的东西原样返回");

const water = MakeWhiteboxWaterMaterial();
Check(water.color.getHexString() === "4d6f86" && water.side === THREE.DoubleSide && PatchKeysOf(water).join() === "whiteboxWater1", "白盒水面材质");

// --- 契约 11：GLSL 只经注册表 ---
const moduleSource = fs.readFileSync(path.join(projectDir, "Script_WhiteboxMaterial.mjs"), "utf8");
Check(!/onBeforeCompile\s*=/.test(moduleSource), "不直接写 onBeforeCompile");
Check(/MakePatch\(/.test(moduleSource) && /ApplyPatches\(/.test(moduleSource), "补丁走 MakePatch / ApplyPatches");

console.log(`WhiteboxMaterialTest: ${checks} checks passed`);
