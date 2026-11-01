// 调试口 window.Tengxian 的门禁（docs/Data_DebugApi.md，纯 Node，秒级）。
//
// 守四件事：
//   1. InstallDebugApi 装出来的顶层名字与 Debug 名字和登记的 Data_DebugApiKeys.json 一致（183 个测试脚本靠这些名字；少一个就报）。
//   2. Debug 的三组（Player / World / Mission）名字不重 —— 合并是展开，重名会悄悄覆盖。
//   3. 调试口文件不 import Script_Main；用到的每个 ctx.<名字> 都在 Script_Main 的工具箱里登记过。
//   4. Script_Main 只在 Boot 里调一次 InstallDebugApi(ctx)，不再手写 window.Taierzhuang = {…}。
// 加了新的调试口：node Script_DebugApiTest.mjs --write 重写登记表，并在提交说明里写清加了什么。
// 测试场插件挂的口（Range、MeleeCombat、WeaponRange、ClothRange……）不在这里：插件建好后由装配层按 debugName 挂上，SandboxRangesTest 守名字。

import assert from "node:assert/strict";
import fs from "node:fs";

let checks = 0;
const Check = (ok, message) => { assert.ok(ok, message); checks += 1; };
const Read = (file) => fs.readFileSync(new URL(`./${file}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const SECTION_FILES = { PlayerDebugApi: "Script_DebugApiPlayer.mjs", WorldDebugApi: "Script_DebugApiWorld.mjs", MissionDebugApi: "Script_DebugApiMission.mjs" };

// 假工具箱：任何名字都给一个「什么都接得住」的替身（取属性、调用、new 都返回它自己）。
const stub = new Proxy(function stubFn() {}, {
  get: (_, key) => (key === Symbol.toPrimitive ? () => 0 : key === "then" ? undefined : stub),
  apply: () => stub,
  construct: () => stub,
});
const ctx = new Proxy({}, { get: () => stub, set: () => true });
globalThis.window = {};

const { InstallDebugApi } = await import("./Script_DebugApi.mjs");
InstallDebugApi(ctx);
const api = window.Taierzhuang;
Check(window.Tengxian === api, "window.Tengxian 与 window.Taierzhuang 是同一个对象");
const shape = { top: Object.getOwnPropertyNames(api).sort(), debug: Object.getOwnPropertyNames(api.Debug).sort() };

// 1. 名字登记表
const keysFile = new URL("./Data_DebugApiKeys.json", import.meta.url);
if (process.argv.includes("--write")) {
  fs.writeFileSync(keysFile, JSON.stringify({ format: "tengxian-debug-api-keys/1", note: "window.Tengxian 由 InstallDebugApi 装出来的名字（测试场插件挂的口不在内）；改动要同步测试脚本。重写：node Script_DebugApiTest.mjs --write", ...shape }, null, 1) + "\n");
  console.log(`[debugApi] 登记表已重写：顶层 ${shape.top.length}、Debug ${shape.debug.length}`);
}
const recorded = JSON.parse(fs.readFileSync(keysFile, "utf8"));
for (const part of ["top", "debug"]) {
  const missing = recorded[part].filter((k) => !shape[part].includes(k));
  const added = shape[part].filter((k) => !recorded[part].includes(k));
  Check(missing.length === 0, `调试口${part === "top" ? "顶层" : " Debug"}少了：${missing.join(", ")}（测试脚本靠这些名字）`);
  Check(added.length === 0, `调试口${part === "top" ? "顶层" : " Debug"}多了：${added.join(", ")}（确认后 --write 登记）`);
}

// 2. 三组不重名
const seen = new Map();
for (const [fn, file] of Object.entries(SECTION_FILES)) {
  const mod = await import(`./${file}`);
  Check(typeof mod[fn] === "function", `${file} 导出 ${fn}(ctx)`);
  for (const key of Object.keys(mod[fn](ctx))) {
    Check(!seen.has(key), `Debug.${key} 只在一组里声明（${seen.get(key)} / ${file}）`);
    seen.set(key, file);
  }
}

// 3. 工具箱
const main = Read("Script_Main.mjs");
const ctxBlock = main.match(/^const ctx = \{\n([\s\S]*?)\n\};/m);
Check(!!ctxBlock, "Script_Main 有工具箱 ctx");
const ctxKeys = new Set([...ctxBlock[1].matchAll(/^\s+(?:get |set )?(\w+)(?:\(\))?/gm)].map((m) => m[1]));
for (const file of ["Script_DebugApi.mjs", ...Object.values(SECTION_FILES)]) {
  const text = Read(file);
  Check(!/from "\.\/Script_Main\.mjs"/.test(text), `${file} 不 import Script_Main（从 ctx 拿）`);
  const missing = [...new Set([...text.matchAll(/\bctx\.(\w+)/g)].map((m) => m[1]))].filter((name) => !ctxKeys.has(name));
  Check(missing.length === 0, `${file} 用到的 ctx.<名字> 都在工具箱里登记过：缺 ${missing.join(", ")}`);
}

// 4. 装配点
Check((main.match(/\bInstallDebugApi\(ctx\);/g) || []).length === 1, "Script_Main 只调一次 InstallDebugApi(ctx)");
Check(!/window\.Taierzhuang\s*=\s*\{/.test(main), "Script_Main 不再手写 window.Taierzhuang = {…}");

console.log(`[debugApi] 调试口：${checks} 条全过（顶层 ${shape.top.length}、Debug ${shape.debug.length}，其中三组系统声明 ${seen.size}）`);
