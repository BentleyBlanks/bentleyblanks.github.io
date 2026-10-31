// Script_GraphicsProfileTest.mjs —— 画质档规则（2026-10-31 起没有「白盒」画质档）的 node 回归。
// 跑法：node Taierzhuang1938/Script_GraphicsProfileTest.mjs
// 查：
//   · 画质档只有 low / medium / high / ultra，与帧图预设表同一组；
//   · `?quality=` 优先、其次存档、其余（含旧的 "whitebox"、坏数据）一律默认档；白盒编辑器与游戏同一套（跟玩家存的档走）；
//   · 旧的白盒存档键（tengxian1938_whitebox_v1、tengxian1938_blockout_profile_v1）不再被读、也不被动；
//   · Inspect() 没有白盒字段，API 只剩 Inspect / Select；
//   · 源码里没有白盒画质档的残留（换材质渲染器、pass 策略、控件表、存档键…）。

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  GRAPHICS_PROFILES, DEFAULT_GRAPHICS_PROFILE, GRAPHICS_PROFILE_STORAGE_KEY, ResolveGraphicsProfile, POST_QUALITY_KEYS,
} from "./Data_Tuning_Graphics.mjs";

const projectDir = path.dirname(fileURLToPath(import.meta.url));
let checks = 0;
const Check = (ok, what) => { assert.ok(ok, what); checks++; };

// --- 1. 数据 ---
Check(JSON.stringify(GRAPHICS_PROFILES) === JSON.stringify(["low", "medium", "high", "ultra"]), "画质档只有四档：" + GRAPHICS_PROFILES.join(","));
Check(!GRAPHICS_PROFILES.includes("whitebox"), "没有 whitebox 档");
Check([...GRAPHICS_PROFILES].sort().join() === [...POST_QUALITY_KEYS].sort().join(), "与帧图预设表同一组档名");
Check(DEFAULT_GRAPHICS_PROFILE === "high" && GRAPHICS_PROFILES.includes(DEFAULT_GRAPHICS_PROFILE), "默认档是 high");
Check(ResolveGraphicsProfile("ultra", "low") === "ultra", "?quality= 优先于存档");
Check(ResolveGraphicsProfile(null, "low") === "low", "没写 ?quality= 用存档");
Check(ResolveGraphicsProfile("whitebox", "medium") === "medium", "?quality=whitebox 当没写，回存档");
Check(ResolveGraphicsProfile("whitebox", "whitebox") === "high", "存档里残留的 whitebox 回落默认");
Check(ResolveGraphicsProfile(undefined, undefined) === "high" && ResolveGraphicsProfile("", 42) === "high", "什么都没有 / 坏数据 → 默认");

// --- 2. 存档（内存版 localStorage）---
const memory = new Map();
globalThis.localStorage = {
  getItem: (key) => (memory.has(key) ? memory.get(key) : null),
  setItem: (key, value) => { memory.set(key, String(value)); },
  removeItem: (key) => { memory.delete(key); },
};
const { LoadGraphicsProfile, SaveGraphicsProfile, CreateGraphicsProfileApi } = await import("./Script_GraphicsProfile.mjs");
const LEGACY_WHITEBOX_KEY = "tengxian1938_whitebox_v1", LEGACY_EDITOR_KEY = "tengxian1938_blockout_profile_v1";

Check(LoadGraphicsProfile("") === "high", "空存档、没参数 → high");
Check(LoadGraphicsProfile("?editor=blockout&level=FirstLevel0105") === "high", "白盒编辑器没存档 → 默认档（不再是白盒）");
memory.set(GRAPHICS_PROFILE_STORAGE_KEY, JSON.stringify("low"));
Check(LoadGraphicsProfile("") === "low" && LoadGraphicsProfile("?editor=blockout") === "low", "玩家存的档，游戏与白盒编辑器都跟着走");
Check(LoadGraphicsProfile("?quality=ultra&editor=blockout") === "ultra", "地址栏的档优先");
Check(LoadGraphicsProfile("?quality=whitebox") === "low", "?quality=whitebox 不认，按存档");
memory.set(GRAPHICS_PROFILE_STORAGE_KEY, JSON.stringify("whitebox"));
Check(LoadGraphicsProfile("") === "high" && LoadGraphicsProfile("?editor=blockout") === "high", "旧存档里的 whitebox 回落默认档");
memory.set(GRAPHICS_PROFILE_STORAGE_KEY, "corrupt{");
Check(LoadGraphicsProfile("") === "high", "存档损坏 → 默认档");

memory.set(LEGACY_WHITEBOX_KEY, JSON.stringify({ schema: 2, grid: true, surfaceColor: "#123456" }));
memory.set(LEGACY_EDITOR_KEY, JSON.stringify("whitebox"));
memory.delete(GRAPHICS_PROFILE_STORAGE_KEY);
Check(LoadGraphicsProfile("?editor=blockout") === "high", "旧的白盒编辑器档存档键不再被读");
Check(SaveGraphicsProfile("medium") === true && JSON.parse(memory.get(GRAPHICS_PROFILE_STORAGE_KEY)) === "medium", "存档写在唯一的画质档键里");
Check(memory.get(LEGACY_WHITEBOX_KEY) === JSON.stringify({ schema: 2, grid: true, surfaceColor: "#123456" }) && memory.get(LEGACY_EDITOR_KEY) === JSON.stringify("whitebox"),
  "旧键原样留着，不迁移也不改");
assert.throws(() => SaveGraphicsProfile("whitebox"), /Unknown graphics profile/);
checks++;

// --- 3. API ---
const api = CreateGraphicsProfileApi({ profile: "high", post: { quality: "high", passes: [{ name: "main" }, { name: "composite" }], lastRenderedPasses: ["main"] } });
const info = api.Inspect();
Check(JSON.stringify(Object.keys(api).sort()) === JSON.stringify(["Inspect", "Select"]), "API 只剩 Inspect / Select：" + Object.keys(api).join(","));
Check(JSON.stringify(Object.keys(info).sort()) === JSON.stringify(["allowedPasses", "defaultProfile", "profile", "renderedPasses", "tier"]), "Inspect() 字段：" + Object.keys(info).join(","));
Check(info.profile === "high" && info.defaultProfile === "high" && info.tier === "high" && info.allowedPasses.join() === "main,composite" && info.renderedPasses.join() === "main",
  "Inspect() 的值");

// --- 4. 源码里没有白盒画质档的残留 ---
const LEFTOVERS = /WhiteboxSceneRenderer|WhiteboxOutputPass|InstallWhiteboxPassPolicy|WhiteboxPassPlan|WHITEBOX_CONTROLS|WHITEBOX_DEFAULTS|WHITEBOX_STORAGE_KEY|WHITEBOX_CONFIG|WhiteboxGraphicsOverrides|WhiteboxPostOptions|MakeWhiteboxQualityPreset|LoadWhiteboxConfig|SaveWhiteboxConfig|ConfigureWhitebox|ResetWhitebox|ExportWhitebox|BLOCKOUT_PROFILE_STORAGE_KEY|whiteboxScene|whiteboxConfig|whiteboxPasses|whiteboxEffects|whiteboxBulletHole|whiteboxWeaponReflection|userData\.whiteboxCharacter|userData\.whiteboxTerrain|Data_Tuning_Whitebox\.mjs|Script_WhiteboxRendering|Script_EditorWhiteboxQuality|quality=whitebox/;
const SELF = path.basename(fileURLToPath(import.meta.url));
const hits = [];
for (const file of fs.readdirSync(projectDir)) {
  if (!/\.(mjs|html)$/.test(file) || file === SELF || file === "Script_ClothRangeBrowserTest.mjs") continue;   // 布料测试场故意拿 quality=whitebox 当「未知值」用
  const lines = fs.readFileSync(path.join(projectDir, file), "utf8").split("\n");
  lines.forEach((line, i) => { if (LEFTOVERS.test(line) && !/用户|旧的|2026-10-31|已删|不再|不认|当没写|legacy|Legacy|回落|unknown value/.test(line)) hits.push(`${file}:${i + 1}`); });
}
Check(hits.length === 0, "白盒画质档的残留：" + hits.slice(0, 8).join("，"));

console.log(`GraphicsProfileTest: ${checks} checks passed`);
