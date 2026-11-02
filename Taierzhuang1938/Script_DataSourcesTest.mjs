// 数据来源表的门禁（docs/Data_DataSources.md，纯 Node，秒级）。
//
// 守五件事：
//   1. 每一份数据文件（git 跟踪的 + 还没提交的新文件）都被 DATA_SOURCE_RULES 的某一条认出来（先匹配先算）——
//      新加一类数据不登记就红。
//   2. 「生成的」那几条写的生成器（脚本或目录）都在仓库里。
//   3. 单独登记成「生成的」.mjs 数据模块，开头几行写明了由谁生成（免得有人手改）。
//   4. 退役的（DATA_RETIRED）不许还在。
//   5. 每条规则至少认得一份文件（死规则要删）。

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { DATA_SOURCE_RULES, DATA_RETIRED, DATA_SCAN } from "./Data_DataSources.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
let checks = 0;
const failures = [];
const Check = (ok, message) => { checks += 1; if (!ok) failures.push(message); };
// 通配转正则：** 跨目录、* 不跨目录（逐段替换，免得 ** 换出来的 .* 又被 * 那一步改坏）。
const Esc = (s) => s.replace(/[.+^${}()|[\]\\?]/g, "\\$&");
const Glob = (pattern) => new RegExp(`^${pattern.split("**/").map((a) => a.split("**").map((b) => b.split("*").map(Esc).join("[^/]*")).join(".*")).join("(?:.*/)?")}$`);
const include = DATA_SCAN.include.map(Glob), exclude = DATA_SCAN.exclude.map(Glob);

/** 项目里的数据文件：git 跟踪的 + 未跟踪但没被忽略的。 */
export function DataFiles() {
  const list = (args) => execFileSync("git", args, { cwd: here, encoding: "utf8" }).split("\n").filter(Boolean);
  const files = new Set([...list(["ls-files"]), ...list(["ls-files", "--others", "--exclude-standard"])]);
  return [...files].filter((f) => fs.existsSync(path.join(here, f)) && include.some((g) => g.test(f)) && !exclude.some((g) => g.test(f))).sort();
}

const rules = DATA_SOURCE_RULES.map((rule) => ({ ...rule, re: Glob(rule.match), hits: 0 }));
const files = DataFiles();
const byRole = { source: 0, generated: 0 };
for (const file of files) {
  const rule = rules.find((r) => r.re.test(file));
  Check(!!rule, `${file} 不在数据来源表里（Data_DataSources.mjs 加一条规则：源头 / 生成的 / 退役）`);
  if (!rule) continue;
  rule.hits += 1;
  byRole[rule.role] = (byRole[rule.role] || 0) + 1;
}
for (const rule of rules) {
  Check(["source", "generated"].includes(rule.role), `规则 ${rule.match} 的身份只能是 source / generated（退役写进 DATA_RETIRED）`);
  Check(rule.hits > 0, `规则 ${rule.match} 一份文件都认不到（死规则，删掉或改通配）`);
  if (rule.role === "generated") {
    Check(rule.by.length > 0, `规则 ${rule.match} 是生成的，要写生成器`);
    for (const by of rule.by) Check(fs.existsSync(path.join(here, by)), `规则 ${rule.match} 的生成器 ${by} 不在仓库里`);
  }
  for (const by of rule.by) if (rule.role === "source") Check(fs.existsSync(path.join(here, by)), `规则 ${rule.match} 写的编辑入口 ${by} 不在仓库里`);
  if (rule.role === "generated" && /\.mjs$/.test(rule.match) && !rule.match.includes("*")) {
    const head = fs.readFileSync(path.join(here, rule.match), "utf8").split("\n").slice(0, 3).join("\n");
    Check(/生成|[Gg]enerated/.test(head), `${rule.match} 是生成的，开头要写明由谁生成`);
  }
}
for (const retired of DATA_RETIRED) Check(!fs.existsSync(path.join(here, retired.file)), `${retired.file} 已登记退役（${retired.why}），文件不该还在`);

assert.ok(failures.length === 0, `数据来源表：${failures.length} 条不通过\n  ${failures.join("\n  ")}`);
console.log(`[dataSources] 数据来源表：${checks} 条全过（${files.length} 份数据文件：源头 ${byRole.source}、生成的 ${byRole.generated}；${rules.length} 条规则、退役 ${DATA_RETIRED.length}）`);
