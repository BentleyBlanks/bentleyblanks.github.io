// 士兵组件表的门禁（docs/Data_EnemyAi.md §22，纯 Node，秒级）。
//
//   node Taierzhuang1938/Script_SoldierComponentsTest.mjs          检查
//   node Taierzhuang1938/Script_SoldierComponentsTest.mjs --write  按 Data_SoldierComponents 重新生成 Script_SoldierFields.mjs，
//                                                                  并重写主人以外的直接写入登记 Data_SoldierForeignWrites.json
//
// 守五件事：
//   1. Soldier 构造完身上只有表里的自有字段 + 各组件；每个组件里的字段与表一一对应、顺序一致 ——
//      新加字段不进表就红，Soldier 不会再长回平铺大对象。
//   2. 旧写法 `soldier.ammo` 与 `soldier.arms.ammo` 是同一个值，读写都通；标签字段读写的是 soldier.tags 的位。
//   3. 生成的 Script_SoldierFields.mjs 与表同步。
//   4. 字段主人（owners）以外的文件直接写士兵字段：只许是 Data_SoldierForeignWrites.json 里登记过的旧账，
//      新增一处就红 —— 要么改成调主人的方法，要么想清楚再 --write 登记。按源码扫（接收者叫 s / soldier / ally / x.soldier ……）。
//   5. 兵种原型：表里每一种都能被 AiDirector 认回自己（Data_SoldierArchetypes）。

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SOLDIER_COMPONENTS, SOLDIER_OWN_FIELDS, SOLDIER_TAGS } from "./Data_SoldierComponents.mjs";
import { SOLDIER_ARCHETYPES } from "./Data_SoldierArchetypes.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const fieldsFile = path.join(here, "Script_SoldierFields.mjs");
const foreignFile = path.join(here, "Data_SoldierForeignWrites.json");
const IDENT = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

export function BuildSoldierFieldsSource() {
  const lines = [
    "// 生成，勿改。来源 Data_SoldierComponents.mjs；重新生成：node Taierzhuang1938/Script_SoldierComponentsTest.mjs --write",
    "//",
    "// Soldier 的旧字段名 → 组件里的同名字段（docs/Data_EnemyAi.md §22）。写成字面量存取器而不是循环 defineProperty：",
    "// V8 能把它内联进调用处，热路径上的读写只多一次取址；循环里用变量当键会慢五倍。",
    "",
    "/** 标签 → soldier.tags 里的位（Data_SoldierComponents.SOLDIER_TAGS 的顺序）。 */",
    `export const SOLDIER_TAG_BITS = Object.freeze({ ${SOLDIER_TAGS.map((t, i) => `${t.tag}: ${1 << i}`).join(", ")} });`,
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
  lines.push("  // 标签：旧字段名 → soldier.tags 的位（读出来是真 / 假）");
  SOLDIER_TAGS.forEach((t, i) => {
    const bit = 1 << i;
    lines.push(`  get ${t.field}() { return (this.tags & ${bit}) !== 0; }`);
    lines.push(`  set ${t.field}(value) { this.tags = value ? this.tags | ${bit} : this.tags & ~${bit}; }`);
  });
  lines.push(
    "  /** 有没有这个标签（名字见 Data_SoldierComponents.SOLDIER_TAGS）。 */",
    "  HasTag(tag) { return (this.tags & SOLDIER_TAG_BITS[tag]) !== 0; }",
    "  SetTag(tag, on) {",
    "    const bit = SOLDIER_TAG_BITS[tag];",
    "    if (!bit) throw new Error(`Soldier: unknown tag ${tag}`);",
    "    this.tags = on ? this.tags | bit : this.tags & ~bit;",
    "  }",
    "  TagList() { return Object.keys(SOLDIER_TAG_BITS).filter((tag) => this.HasTag(tag)); }",
  );
  lines.push("}", "");
  return lines.join("\n");
}

// --- 4. 主人以外的直接写入 ---------------------------------------------------------------------------------
const WRITER_RECEIVER = String.raw`(?:\b(?:s|soldier|ally|enemy|mate|officer|victim|shooter|unit|guard|leader)|\.soldier)`;
const WRITE_OP = String.raw`\s*(?:=(?!=)|\+=|-=|\*=|\/=|\|\|=|&&=|\?\?=|\+\+|--)`;
const Glob = (pattern) => new RegExp(`^${pattern.replace(/[.]/g, "\\.").replace(/\*/g, ".*")}$`);
/** 字段 → 它的主人文件（组件的 owners）；标签字段算 scripted 的主人。 */
function FieldOwners() {
  const owners = new Map();
  for (const spec of Object.values(SOLDIER_COMPONENTS)) for (const field of spec.fields) owners.set(field, (spec.owners || []).map(Glob));
  for (const t of SOLDIER_TAGS) owners.set(t.field, (SOLDIER_COMPONENTS.scripted.owners || []).map(Glob));
  return owners;
}
/** 扫一遍运行代码：{ 字段: [主人以外写它的文件…] }（按字段、文件名排序）。 */
export function ScanForeignWrites() {
  const owners = FieldOwners();
  const fields = [...owners.keys()].sort((a, b) => b.length - a.length);
  const re = new RegExp(`${WRITER_RECEIVER}\\.(${fields.join("|")})${WRITE_OP}`, "g");
  const found = {};
  const files = fs.readdirSync(here).filter((f) => /^Script_.*\.mjs$/.test(f) && !/Test|Probe|Check|Audit|Bench|Shot/.test(f) && f !== "Script_SoldierFields.mjs");
  for (const file of files.sort()) {
    const text = fs.readFileSync(path.join(here, file), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
    for (const m of text.matchAll(re)) {
      const field = m[1];
      if (owners.get(field).some((g) => g.test(file))) continue;
      (found[field] ||= new Set()).add(file);
    }
  }
  return Object.fromEntries(Object.keys(found).sort().map((field) => [field, [...found[field]].sort()]));
}
function CheckForeignWrites(write) {
  const now = ScanForeignWrites();
  if (write) {
    const note = "士兵字段被主人（Data_SoldierComponents 的 owners）以外的文件直接写的旧账，SoldierComponentsTest 拦新增；"
      + "能改成调主人方法的改掉后从这里删。重写：node Taierzhuang1938/Script_SoldierComponentsTest.mjs --write";
    fs.writeFileSync(foreignFile, JSON.stringify({ note, writes: now }, null, 1) + "\n");
    console.log(`[soldier] 已重写 ${path.basename(foreignFile)}：${Object.values(now).flat().length} 处旧账`);
    return;
  }
  const recorded = fs.existsSync(foreignFile) ? JSON.parse(fs.readFileSync(foreignFile, "utf8")).writes : {};
  for (const [field, files] of Object.entries(now)) for (const file of files)
    Check((recorded[field] || []).includes(file), `${file} 直接写了士兵的 ${field}，而它不是这个字段的主人（改成调主人的方法，或确认后 --write 登记）`);
  const stale = Object.entries(recorded).flatMap(([field, files]) => files.filter((file) => !(now[field] || []).includes(file)).map((file) => `${field}@${file}`));
  if (stale.length) console.log(`[soldier] 旧账已还清、可从登记里删：${stale.join(", ")}（--write 重写）`);
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
  const tags = new Set();
  for (const t of SOLDIER_TAGS) {
    Check(IDENT.test(t.tag) && !tags.has(t.tag), `标签名 ${t.tag} 不合法或重复`);
    Check(!seen.has(t.field), `标签字段 ${t.field} 同时出现在 ${seen.get(t.field)}`);
    tags.add(t.tag); seen.set(t.field, "(标签)");
  }
  Check(SOLDIER_TAGS.length <= 30, "标签最多 30 个（存在一个 32 位整数里）");
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
    Check(s.tags === 0 && s.archetype === null, "新兵没有标签、原型待 AiDirector.Spawn 填");
    for (const t of SOLDIER_TAGS) {
      Check(s[t.field] === false && !s.HasTag(t.tag), `${t.field} 初始为假`);
      s[t.field] = true;
      Check(s.HasTag(t.tag) && s[t.field] === true, `${t.field} 写真后 HasTag("${t.tag}") 为真`);
      s.SetTag(t.tag, false);
      Check(s[t.field] === false, `SetTag("${t.tag}", false) 后 ${t.field} 为假`);
    }
    s.dummy = true; s.wounded = true;
    Check(s.TagList().join() === "dummy,wounded", `TagList 列出开着的标签（${s.TagList().join()}）`);
  }
  // 5. 兵种原型：每一种的撒兵参数都能被认回它自己
  const { SoldierArchetypeOf, ArchetypeSpawnOptions } = await import("./Script_Ai.mjs");
  for (const [id, spec] of Object.entries(SOLDIER_ARCHETYPES)) {
    // 去掉原型编号再认：撒兵参数本身（阵营 + 武器 + 开关）就要能认回这一种
    const { archetype: _, ...options } = ArchetypeSpawnOptions({ archetype: id });
    const s = new Soldier(spec.side, options);
    const got = SoldierArchetypeOf(spec.side, options, s.weaponId);
    Check(got === id, `原型 ${id} 认回自己（实际 ${got}）`);
    if (spec.weapon) Check(s.weaponId === spec.weapon, `原型 ${id} 的默认武器 ${spec.weapon}（实际 ${s.weaponId}）`);
  }
  Check(SoldierArchetypeOf("ija", {}, "Type38") === "ijaRifleman" && SoldierArchetypeOf("nra", { towel: true }, "HanYang") === "nraDare"
    && SoldierArchetypeOf("nra", { actorKind: "civilian" }, "HanYang") === "civilian", "老写法（阵营 + 武器 + 开关）按规则认原型");
  Check(ArchetypeSpawnOptions({ archetype: "ijaLmg", weapon: "Type38" }).weapon === "Type38", "个体写的参数盖过原型默认值");
}

const write = process.argv.includes("--write");
CheckTable();
CheckGenerated(write);
CheckForeignWrites(write);
if (!write) await CheckRuntime();
if (!write) {
  if (failed) {
    console.error(`[soldier] 士兵组件表：${failed} 条失败，${passed} 条通过`);
    process.exitCode = 1;
  } else {
    console.log(`[soldier] 士兵组件表：${passed} 条全过（${Object.keys(SOLDIER_COMPONENTS).length} 个组件）`);
  }
}
