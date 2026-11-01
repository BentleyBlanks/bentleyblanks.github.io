// 士兵组件表的门禁（docs/Data_EnemyAi.md §22，纯 Node，秒级）。
//
//   node Taierzhuang1938/Script_SoldierComponentsTest.mjs          检查
//   node Taierzhuang1938/Script_SoldierComponentsTest.mjs --write  按 Data_SoldierComponents 重新生成 Script_SoldierFields.mjs
//
// 守三件事：
//   1. Soldier 构造完身上只有表里的自有字段 + 各组件；每个组件里的字段与表一一对应、顺序一致 ——
//      新加字段不进表就红，Soldier 不会再长回平铺大对象。
//   2. 旧写法 `soldier.ammo` 与 `soldier.arms.ammo` 是同一个值，读写都通。
//   3. 生成的 Script_SoldierFields.mjs 与表同步。

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SOLDIER_COMPONENTS, SOLDIER_OWN_FIELDS } from "./Data_SoldierComponents.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const fieldsFile = path.join(here, "Script_SoldierFields.mjs");
const IDENT = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

export function BuildSoldierFieldsSource() {
  const lines = [
    "// 生成，勿改。来源 Data_SoldierComponents.mjs；重新生成：node Taierzhuang1938/Script_SoldierComponentsTest.mjs --write",
    "//",
    "// Soldier 的旧字段名 → 组件里的同名字段（docs/Data_EnemyAi.md §22）。写成字面量存取器而不是循环 defineProperty：",
    "// V8 能把它内联进调用处，热路径上的读写只多一次取址；循环里用变量当键会慢五倍。",
    "",
    "export class SoldierFieldAccessors {",
  ];
  for (const [component, spec] of Object.entries(SOLDIER_COMPONENTS)) {
    lines.push(`  // ${component}：${spec.label}`);
    for (const field of spec.fields) {
      lines.push(`  get ${field}() { return this.${component}.${field}; }`);
      lines.push(`  set ${field}(value) { this.${component}.${field} = value; }`);
    }
  }
  lines.push("}", "");
  return lines.join("\n");
}

let failed = 0;
let passed = 0;
function Check(ok, message) {
  if (ok) passed += 1;
  else { failed += 1; console.error(`  ✗ ${message}`); }
}

function CheckTable() {
  const seen = new Map();
  for (const field of SOLDIER_OWN_FIELDS) seen.set(field, "(自有)");
  for (const [component, spec] of Object.entries(SOLDIER_COMPONENTS)) {
    Check(IDENT.test(component), `组件名 ${component} 不是合法标识符`);
    Check(!seen.has(component), `组件名 ${component} 与字段重名`);
    seen.set(component, "(组件)");
    for (const field of spec.fields) {
      Check(IDENT.test(field), `${component}.${field} 不是合法标识符`);
      Check(!seen.has(field), `字段 ${field} 同时出现在 ${seen.get(field)} 与 ${component}`);
      seen.set(field, component);
    }
  }
}

function CheckGenerated(write) {
  const source = BuildSoldierFieldsSource();
  if (write) {
    fs.writeFileSync(fieldsFile, source);
    console.log(`[soldier] 已重新生成 ${path.basename(fieldsFile)}`);
    return;
  }
  const current = fs.existsSync(fieldsFile) ? fs.readFileSync(fieldsFile, "utf8").replace(/\r\n/g, "\n") : "";
  Check(current === source, "Script_SoldierFields.mjs 与 Data_SoldierComponents 不同步（跑一次 --write）");
}

async function CheckRuntime() {
  const { Soldier } = await import("./Script_Ai.mjs");
  const variants = [["nra", {}], ["ija", {}], ["nra", { x: 3, z: -7, ry: 1.2 }], ["ija", { weapon: "Type11" }]];
  const components = Object.keys(SOLDIER_COMPONENTS);
  const expectedOwn = new Set([...SOLDIER_OWN_FIELDS, ...components]);
  for (const [side, options] of variants) {
    const s = new Soldier(side, options);
    const own = Object.keys(s);
    const stray = own.filter((key) => !expectedOwn.has(key));
    const missing = [...expectedOwn].filter((key) => !own.includes(key));
    Check(!stray.length, `构造完身上多了没进组件表的字段：${stray.join(", ")}`);
    Check(!missing.length, `构造完缺了：${missing.join(", ")}`);
    for (const [component, spec] of Object.entries(SOLDIER_COMPONENTS)) {
      const keys = Object.keys(s[component] ?? {});
      Check(keys.join() === spec.fields.join(), `${component} 的字段与表不一致：\n    实际 ${keys.join(", ")}\n    表里 ${spec.fields.join(", ")}`);
      for (const field of spec.fields) {
        Check(Object.is(s[field], s[component][field]), `${field} 旧写法读到的不是 ${component}.${field}`);
        const before = s[component][field];
        const probe = { probe: field };
        s[field] = probe;
        Check(s[component][field] === probe, `${field} 旧写法写不进 ${component}.${field}`);
        s[component][field] = before;
        Check(Object.is(s[field], before), `${component}.${field} 写回后旧写法没跟上`);
      }
    }
    Check(s.alive === true, "新兵 alive 应为 true");
    Check(s.ammo === s.weapon.magazine || (s.weapon.magazine == null && s.ammo === 5), "初始弹量按武器弹匣");
  }
}

const write = process.argv.includes("--write");
CheckTable();
CheckGenerated(write);
if (!write) await CheckRuntime();
if (!write) {
  if (failed) {
    console.error(`[soldier] 士兵组件表：${failed} 条失败，${passed} 条通过`);
    process.exitCode = 1;
  } else {
    console.log(`[soldier] 士兵组件表：${passed} 条全过（${Object.keys(SOLDIER_COMPONENTS).length} 个组件）`);
  }
}
