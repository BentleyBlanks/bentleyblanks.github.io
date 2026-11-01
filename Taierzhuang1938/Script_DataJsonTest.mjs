// 数据模块能完整导出成 JSON 的门禁（docs/Data_DataSources.md「数据模块只放数据」，纯 Node，秒级）。
//
// 为什么：UE 的 DataTable、表格工具、别的引擎都读不了 JS；数据模块导出的每个值都能原样写成 JSON 再读回来，
// 移植时才能整批转。规矩：
//   1. Data_*.mjs 导出的值只许是 普通对象 / 数组 / 字符串 / 有限数字 / 布尔 / null（Object.freeze 不算事）——
//      函数、类、Set / Map / RegExp、three 对象、NaN / Infinity、数组里的 undefined 都不行（对象里值为 undefined 的键可以）。
//   2. 还导出函数或别的非 JSON 值的旧模块登记在 Data_DataSources.DATA_JSON_DEBT（旧账，只减不增）；
//      它们导出的其余值仍要过第 1 条。函数搬进同名的 Script_ 模块后从旧账里删掉。
//   3. 新数据优先写带版本号的 JSON（照场景文件：schema / format / version 字段之一）。根目录与内容目录新加的
//      Data_*.json 要带版本号字段 —— 已有的不带版本号的登记在 DATA_JSON_UNVERSIONED。
//   node Taierzhuang1938/Script_DataJsonTest.mjs --list   列出现在还不干净的模块与原因

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { DATA_JSON_DEBT, DATA_JSON_UNVERSIONED } from "./Data_DataSources.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const listMode = process.argv.includes("--list");
let checks = 0;
const failures = [];
const Check = (ok, message) => { checks += 1; if (!ok) failures.push(message); };

/** 第一处不能原样写成 JSON 的地方（路径 + 原因），全干净返回 null。 */
export function JsonProblem(value, at = "", seen = new Set()) {
  if (value === null || typeof value === "string" || typeof value === "boolean") return null;
  if (typeof value === "number") return Number.isFinite(value) ? null : `${at} = ${value}`;
  if (typeof value === "undefined") return `${at} 是 undefined`;
  if (typeof value === "function") return `${at} 是函数`;
  if (typeof value !== "object") return `${at} 是 ${typeof value}`;
  if (seen.has(value)) return null; // 共用的子对象（同一份引用两处）照样能写成 JSON
  seen.add(value);
  const proto = Object.getPrototypeOf(value);
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) { const p = JsonProblem(value[i], `${at}[${i}]`, seen); if (p) return p; }
    return null;
  }
  if (proto !== Object.prototype && proto !== null) return `${at} 是 ${value.constructor?.name || "非普通对象"}`;
  // 对象里值为 undefined 的键写成 JSON 会丢掉，读回来还是 undefined，不算问题（数组里的 undefined 会变 null，算）。
  for (const [k, v] of Object.entries(value)) { if (v === undefined) continue; const p = JsonProblem(v, `${at}.${k}`, seen); if (p) return p; }
  return null;
}

const files = fs.readdirSync(here).filter((f) => /^Data_.*\.mjs$/.test(f)).sort();
const dirty = [];
for (const file of files) {
  const mod = await import(pathToFileURL(path.join(here, file)).href);
  const problems = [];
  for (const [name, value] of Object.entries(mod)) {
    if (typeof value === "function") { problems.push(`${name} 是函数`); continue; }
    const p = JsonProblem(value, name);
    if (p) problems.push(p);
  }
  if (problems.length) dirty.push({ file, problems });
  const inDebt = DATA_JSON_DEBT.includes(file);
  if (!inDebt) Check(!problems.length, `${file} 导出的值不能原样写成 JSON：${problems.slice(0, 3).join("；")}（函数搬到 Script_ 模块）`);
}
for (const file of DATA_JSON_DEBT) {
  Check(files.includes(file), `旧账里的 ${file} 已经没了，从 DATA_JSON_DEBT 删掉`);
  if (files.includes(file) && !dirty.some((d) => d.file === file)) Check(false, `${file} 已经干净了，从 DATA_JSON_DEBT 删掉`);
}

// 3. 新加的 Data_*.json 带版本号
const tracked = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "--", "Data_*.json", "Scenes", "Blockout", "Timeline"], { cwd: here, encoding: "utf8" }).split("\n").filter((f) => /\.json$/.test(f));
for (const file of tracked) {
  if (DATA_JSON_UNVERSIONED.includes(file) || !fs.existsSync(path.join(here, file))) continue;
  let doc = null;
  try { doc = JSON.parse(fs.readFileSync(path.join(here, file), "utf8")); } catch { Check(false, `${file} 不是合法 JSON`); continue; }
  Check(doc && typeof doc === "object" && !Array.isArray(doc) && ["schema", "format", "version", "schemaVersion"].some((k) => k in doc),
    `${file} 要带版本号字段（schema / format / version 之一，照场景文件）`);
}
for (const file of DATA_JSON_UNVERSIONED) Check(fs.existsSync(path.join(here, file)), `DATA_JSON_UNVERSIONED 里的 ${file} 已经没了，删掉这一行`);

if (listMode) for (const d of dirty) console.log(`${d.file}: ${d.problems.slice(0, 4).join("；")}`);
assert.ok(failures.length === 0, `数据模块 JSON 门禁：${failures.length} 条不通过\n  ${failures.slice(0, 30).join("\n  ")}`);
console.log(`[dataJson] 数据模块 JSON：${checks} 条全过（${files.length} 个数据模块，${files.length - dirty.length} 个干净；旧账 ${DATA_JSON_DEBT.length} 个）`);
