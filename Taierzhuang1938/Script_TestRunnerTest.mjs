import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  AssessResult,
  ExtractFailureEntries,
  ExtractFailureNames,
  GetTier1Tests,
  InferDomains,
  ParseArgs,
  ResolveSelection,
  ValidateRegistry,
  domains,
  testDefs,
  tier0,
  tier2,
} from "./Script_TestRunner.mjs";

const dirHere = path.dirname(fileURLToPath(import.meta.url));
let checks = 0;

function Check(condition, message) {
  assert.ok(condition, message);
  checks += 1;
}

ValidateRegistry();
Check(true, "runner 登记表内部一致");

const testFiles = fs.readdirSync(dirHere).filter((name) => /^Script_.*Test\.mjs$/.test(name));
const registeredFiles = new Set(Object.values(testDefs).map((def) => def.file));
const missingFiles = testFiles.filter((name) => !registeredFiles.has(name));
assert.deepEqual(missingFiles, [], `测试文件未登记：${missingFiles.join(", ")}`);
checks += 1;

for (const [name, def] of Object.entries(testDefs)) {
  Check(fs.existsSync(path.join(dirHere, def.file)), `${name} 的文件存在：${def.file}`);
}

const voiceSelection = ResolveSelection(ParseArgs(["--domain=voice"]));
Check(tier0.every((name) => voiceSelection.includes(name)), "--domain 默认叠加 Tier 0");
Check(voiceSelection.includes("VoiceTest"), "--domain 追加领域探针");
Check(ParseArgs(["--dry-run"]).dryRun, "--dry-run 参数可用");

const voiceOnly = ResolveSelection(ParseArgs(["--domain-only=voice"]));
assert.deepEqual(voiceOnly, domains.voice.tests, "--domain-only 只跑领域探针");
checks += 1;

const tier1Selection = ResolveSelection(ParseArgs(["--tier=1"]));
Check(tier0.every((name) => tier1Selection.includes(name)), "--tier=1 包含 Tier 0");
Check(GetTier1Tests().every((name) => tier1Selection.includes(name)), "--tier=1 包含全部自动领域探针");
assert.deepEqual(ResolveSelection(ParseArgs(["--tier=2"])), tier2, "--tier=2 只跑低频人工档");
checks += 1;

assert.throws(
  () => ParseArgs(["--only=VoiceTest", "--domain=voice"]),
  /--only 不能和/,
  "--only 不得悄悄并入其他选择器",
);
checks += 1;
assert.throws(() => ParseArgs(["--domain"]), /需要 =领域名/);
checks += 1;

const inferred = InferDomains([
  "Taierzhuang1938/Script_Combat.mjs",
  "Taierzhuang1938/Data_Weapons.mjs",
  "Taierzhuang1938/Script_Smoke.mjs",
  "Taierzhuang1938/Unknown_NewModule.mjs",
  "README.md",
]);
Check(inferred.domains.includes("combat"), "战斗文件自动映射 combat");
Check(inferred.domains.includes("render") && inferred.domains.includes("perf"), "烟雾文件映射 render/perf");
assert.deepEqual(inferred.unmatchedProjectFiles, ["Taierzhuang1938/Unknown_NewModule.mjs"]);
checks += 1;

const sharedData = InferDomains([
  "Taierzhuang1938/Data_Levels.mjs",
  "Taierzhuang1938/Data_Battle.mjs",
  "Taierzhuang1938/Script_TengxianOutfield.mjs",
  "Taierzhuang1938/Data_Tengxian.mjs",
]);
for (const domain of ["terrain", "physics", "combat", "ai", "editor", "cutscene", "render"]) {
  Check(sharedData.domains.includes(domain), `共享数据映射 ${domain}`);
}
assert.deepEqual(sharedData.unmatchedProjectFiles, []);
checks += 1;

const expectedName = testDefs.PlayTest.expectedFailures[0];
const baselineOutput = `通关冒烟：129/130 过\n没过的：\n  · ${expectedName}  — detail\n`;
assert.deepEqual(ExtractFailureNames(baselineOutput), [expectedName]);
checks += 1;
assert.deepEqual(ExtractFailureEntries(baselineOutput), [{ name: expectedName, detail: "detail" }]);
checks += 1;

const baseline = AssessResult({ code: 1, timedOut: false, text: baselineOutput }, testDefs.PlayTest);
Check(baseline.ok && baseline.baselineOnly, "已知红不阻断默认门禁");
const strictBaseline = AssessResult({ code: 1, timedOut: false, text: baselineOutput }, testDefs.PlayTest, true);
Check(!strictBaseline.ok && strictBaseline.baselineOnly, "strict 模式仍阻断历史红");

const unexpectedOutput = "通关冒烟：129/130 过\n没过的：\n  · 新增回归  — detail\n";
const unexpected = AssessResult({ code: 1, timedOut: false, text: unexpectedOutput }, testDefs.PlayTest);
Check(!unexpected.ok && !unexpected.baselineOnly, "新增红必须阻断门禁");

const crash = AssessResult({ code: 1, timedOut: false, text: "PAGEERROR boom" }, testDefs.PlayTest);
Check(!crash.ok, "没有正常完成摘要的崩溃不得误判为历史红");

// playwright 的签名是 waitForFunction(pageFunction, arg?, options?)：第二个参数是
// **传给页面函数的实参**，不是 options。少写一格的话那个对象会被当实参丢进页面
// （页面函数不读它，静悄悄地无害），真正的超时落回 playwright 默认的 30 秒。
// 2026-08-26 一次性修了 55 处：这台机器上开机全在 30 秒内跑完，所以从来没红过；
// 换台慢机器或 quality=high 的大关就会随机炸成「Timeout 30000ms exceeded」，
// 而且症状看起来像被测功能坏了，不像测试写错。正确写法是补一个 null 占位。
//
// 扫源码的两步：先把注释涂成空格（长度不变，行号仍对得上，也免得头注里的反例
// 把自己举报了），再按顶层逗号切实参。字符串按引号跳过，不然 "http://…" 里的
// 斜杠会被当成注释开头。
function BlankComments(src) {
  const out = src.split("");
  for (let i = 0; i < src.length; i += 1) {
    const c = src[i];
    const n = src[i + 1];
    if (c === '"' || c === "'" || c === "`") {
      const quote = c;
      for (i += 1; i < src.length; i += 1) {
        if (src[i] === "\\") { i += 1; continue; }
        if (src[i] === quote) break;
      }
      continue;
    }
    if (c === "/" && n === "/") {
      for (; i < src.length && src[i] !== "\n"; i += 1) out[i] = " ";
      continue;
    }
    if (c === "/" && n === "*") {
      const end = src.indexOf("*/", i + 2);
      const stop = end < 0 ? src.length : end + 2;
      for (; i < stop; i += 1) if (src[i] !== "\n") out[i] = " ";
      i -= 1;
    }
  }
  return out.join("");
}

// 从 open 这个左括号起按顶层逗号切实参；括号不配平（跨行截断等）时返回 null。
function SplitCallArgs(src, open) {
  const args = [];
  let depth = 0;
  let start = open + 1;
  for (let i = open + 1; i < src.length; i += 1) {
    const c = src[i];
    if (c === '"' || c === "'" || c === "`") {
      const quote = c;
      for (i += 1; i < src.length; i += 1) {
        if (src[i] === "\\") { i += 1; continue; }
        if (src[i] === quote) break;
      }
      continue;
    }
    if (c === "(" || c === "{" || c === "[") { depth += 1; continue; }
    if (c === ")" || c === "}" || c === "]") {
      if (depth === 0 && c === ")") { args.push(src.slice(start, i)); return args; }
      depth -= 1;
      continue;
    }
    if (c === "," && depth === 0) { args.push(src.slice(start, i)); start = i + 1; }
  }
  return null;
}

const misplacedTimeouts = [];
for (const name of fs.readdirSync(dirHere).filter((f) => /^Script_.*\.mjs$/.test(f))) {
  const text = BlankComments(fs.readFileSync(path.join(dirHere, name), "utf8"));
  const call = /waitForFunction\s*\(/g;
  let hit;
  while ((hit = call.exec(text))) {
    const args = SplitCallArgs(text, hit.index + hit[0].length - 1);
    if (!args) continue;
    const real = args.map((a) => a.trim()).filter((a) => a !== "");
    if (real.length !== 2) continue;                      // 1 个实参没超时可漏，3 个已经补过占位
    if (!real[1].startsWith("{")) continue;               // 第二格是真实参（如 group.globalName）
    if (!/\b(?:timeout|polling)\b/.test(real[1])) continue;
    misplacedTimeouts.push(`${name}:${text.slice(0, hit.index).split("\n").length}`);
  }
}
assert.deepEqual(
  misplacedTimeouts,
  [],
  `waitForFunction 的 options 落在了实参位，超时会悄悄退回默认 30 秒；补 null 占位：${misplacedTimeouts.join(", ")}`,
);
checks += 1;

console.log(`测试 runner 自测：${checks} 条全过；登记 ${testFiles.length}/${testFiles.length} 个测试文件。`);
