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

console.log(`测试 runner 自测：${checks} 条全过；登记 ${testFiles.length}/${testFiles.length} 个测试文件。`);
