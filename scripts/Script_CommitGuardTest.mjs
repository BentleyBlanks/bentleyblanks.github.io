// Script_CommitGuardTest.mjs —— 本地提交权限检查器纯 Node 单元测试与真 Git Hook 端到端回归。
// 跑法：node scripts/Script_CommitGuardTest.mjs

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  POLICY_REL_PATH,
  LoadPolicy,
  EvaluateChanges,
  EvaluateAssetStandardsSemantic,
  ParseTestRunnerDefs,
  CheckApproval,
} from "./Script_CommitGuard.mjs";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let checks = 0;
const Check = (cond, msg) => {
  assert.ok(cond, msg);
  checks += 1;
};

// ===========================================================================
// 1. 策略文件合法性与受控路径真实存在性
// ===========================================================================
const { policy } = LoadPolicy(REPO_ROOT);
{
  Check(policy.schema === "repo.protectedPaths/1", "策略 schema 版本正确");
  Check(policy.pathRules.length === 3, "当前包含 3 条文件级规则（1 / 2 / 7a）");
  Check(policy.semanticRules.length === 2, "当前包含 2 条语义级规则（7b / 7c）");

  const ids = [...policy.pathRules, ...policy.semanticRules].map((r) => r.id);
  Check(new Set(ids).size === ids.length, "全部规则 ID 唯一");

  for (const rule of policy.pathRules) {
    for (const p of rule.paths) {
      if (p.includes("*")) continue;
      Check(fs.existsSync(path.join(REPO_ROOT, p)), `受保护具体路径真实存在：${p}`);
    }
  }
  const assetRule = policy.semanticRules.find((r) => r.id === "asset-standards-ceiling");
  const testRule = policy.semanticRules.find((r) => r.id === "test-gate-integrity");
  Check(fs.existsSync(path.join(REPO_ROOT, assetRule.file)), `资产标准文件存在：${assetRule.file}`);
  Check(fs.existsSync(path.join(REPO_ROOT, testRule.runnerFile)), `测试入口存在：${testRule.runnerFile}`);

  // 真仓库 Script_TestRunner.mjs 能正确解析出大量 testDefs
  const realRunner = fs.readFileSync(path.join(REPO_ROOT, testRule.runnerFile), "utf8");
  const realDefs = ParseTestRunnerDefs(realRunner);
  Check(realDefs && realDefs.size >= 150, `真实 Script_TestRunner.mjs testDefs 解析数量充足（${realDefs?.size}）`);
  Check(realDefs.has("EncounterPlayTest") && realDefs.has("CameraProfileTest"), "解析包含关键测试条目");

  // .githooks 必须为 LF 换行，防止 Windows Git Bash shebang 报错
  for (const hookName of ["pre-commit", "pre-push"]) {
    const raw = fs.readFileSync(path.join(REPO_ROOT, ".githooks", hookName), "utf8");
    Check(!raw.includes("\r\n"), `.githooks/${hookName} 必须为纯 LF 换行`);
    Check(raw.startsWith("#!/bin/sh\n"), `.githooks/${hookName} 以 #!/bin/sh 开头`);
  }
}

// ===========================================================================
// 2. 文件级硬锁（1: CameraProfile, 2: Graphics/Camera, 7a: Self-lock）
// ===========================================================================
{
  const EvalPaths = (changes) =>
    EvaluateChanges({
      policy,
      changes,
      readOldText: () => null,
      readNewText: () => null,
    });

  // 普通业务文件绿灯
  const green = EvalPaths([
    { status: "M", oldPath: "Taierzhuang1938/docs/Data_DeliveryLog.md", path: "Taierzhuang1938/docs/Data_DeliveryLog.md" },
    { status: "M", oldPath: "Taierzhuang1938/Model/Type38_511/Model_Type38_511.glb", path: "Taierzhuang1938/Model/Type38_511/Model_Type38_511.glb" },
  ]);
  Check(green.length === 0, "普通文档与模型修改绿灯放行");

  // 第 1 类：CameraProfile 三件套任一改动必拦
  for (const p of [
    "Taierzhuang1938/Data_CameraProfile.mjs",
    "Taierzhuang1938/Script_CameraProfile.mjs",
    "Taierzhuang1938/Script_CameraProfileTest.mjs",
  ]) {
    const hits = EvalPaths([{ status: "M", oldPath: p, path: p }]);
    Check(hits.length === 1 && hits[0].ruleId === "camera-profile-lock", `命中 camera-profile-lock：${p}`);
  }

  // 第 2 类：画质四档与曝光红线
  for (const p of ["Taierzhuang1938/Data_Tuning_Graphics.mjs", "Taierzhuang1938/Data_Tuning_Camera.mjs"]) {
    const hits = EvalPaths([{ status: "M", oldPath: p, path: p }]);
    Check(hits.length === 1 && hits[0].ruleId === "graphics-exposure-lock", `命中 graphics-exposure-lock：${p}`);
  }

  // 第 7a 类：自保路径
  for (const p of [
    "scripts/Data_ProtectedPaths.json",
    "scripts/Script_CommitGuard.mjs",
    ".githooks/pre-commit",
    ".github/workflows/pages.yml",
    "AGENTS.md",
  ]) {
    const hits = EvalPaths([{ status: "M", oldPath: p, path: p }]);
    Check(hits.length === 1 && hits[0].ruleId === "commit-guard-self-lock", `命中 commit-guard-self-lock：${p}`);
  }
}

// ===========================================================================
// 3. 语义级规则 7b：Data_AssetStandards.json
// ===========================================================================
{
  const rule = policy.semanticRules.find((r) => r.id === "asset-standards-ceiling");
  const baseObj = {
    triangleRules: { weapon: { limit: 30000 }, vehicle: { limit: 80000 } },
    minDecimationReduction: 0.05,
    sceneRenderLimits: { drawCalls: 5000, triangles: 9000000 },
    proceduralBudgets: { soldier: 1800, prop: 400 },
    specialTriangleTargets: { Type89Launcher: 10000 },
    sourceAssets: { Zb26: { sourceTriangles: 29967 } },
    externalGlb: [
      { id: "Type38_511", actualTriangles: 79894, targetTriangles: 80000, note: "v1" },
    ],
  };
  const oldStr = JSON.stringify(baseObj);

  // 绿灯：仅更新 actualTriangles（<= targetTriangles）与 note，或新增合规条目
  const okObj = structuredClone(baseObj);
  okObj.externalGlb[0].actualTriangles = 79500;
  okObj.externalGlb[0].note = "v2";
  okObj.externalGlb.push({ id: "NewProp", actualTriangles: 1200, targetTriangles: 1500 });
  Check(EvaluateAssetStandardsSemantic(rule, oldStr, JSON.stringify(okObj)).length === 0, "合规更新 actualTriangles 与新增资产绿灯放行");

  // 红灯 1：修改 sceneRenderLimits
  const badLimit = structuredClone(baseObj);
  badLimit.sceneRenderLimits.triangles = 12000000;
  Check(EvaluateAssetStandardsSemantic(rule, oldStr, JSON.stringify(badLimit)).length > 0, "修改 sceneRenderLimits 必拦");

  // 红灯 2：调高已有 targetTriangles
  const badTarget = structuredClone(baseObj);
  badTarget.externalGlb[0].targetTriangles = 90000;
  Check(EvaluateAssetStandardsSemantic(rule, oldStr, JSON.stringify(badTarget)).length > 0, "调高 targetTriangles 必拦");

  // 红灯 3：actualTriangles 超过 targetTriangles
  const badActual = structuredClone(baseObj);
  badActual.externalGlb[0].actualTriangles = 80500;
  Check(EvaluateAssetStandardsSemantic(rule, oldStr, JSON.stringify(badActual)).length > 0, "actualTriangles 超 targetTriangles 必拦");

  // 红灯 4：删除已有 externalGlb 条目
  const badDelete = structuredClone(baseObj);
  badDelete.externalGlb = [];
  Check(EvaluateAssetStandardsSemantic(rule, oldStr, JSON.stringify(badDelete)).length > 0, "删除既有 externalGlb 条目必拦");

  // 红灯 5：删除既有 sourceAssets 条目
  const badDelSrc = structuredClone(baseObj);
  delete badDelSrc.sourceAssets.Zb26;
  Check(EvaluateAssetStandardsSemantic(rule, oldStr, JSON.stringify(badDelSrc)).length > 0, "删除既有 sourceAssets 条目必拦");
}

// ===========================================================================
// 4. 语义级规则 7c：测试门禁完整性
// ===========================================================================
{
  const oldRunner = `
export const testDefs = {
  AlphaTest: { file: "Script_AlphaTest.mjs", desc: "alpha" },
  BetaTest: { file: "Script_BetaTest.mjs", desc: "beta" },
};
`;

  // 绿灯：新增测试文件 + testDefs 追加新条目
  const addedRunner = `
export const testDefs = {
  AlphaTest: { file: "Script_AlphaTest.mjs", desc: "alpha" },
  BetaTest: { file: "Script_BetaTest.mjs", desc: "beta" },
  GammaTest: { file: "Script_GammaTest.mjs", desc: "gamma" },
};
`;
  const okHits = EvaluateChanges({
    policy,
    changes: [
      { status: "A", oldPath: null, path: "Taierzhuang1938/Script_GammaTest.mjs" },
      { status: "M", oldPath: "Taierzhuang1938/Script_TestRunner.mjs", path: "Taierzhuang1938/Script_TestRunner.mjs" },
    ],
    readOldText: () => oldRunner,
    readNewText: () => addedRunner,
  });
  Check(okHits.length === 0, "新增测试文件与 testDefs 条目绿灯放行");

  // 红灯 1：删除既有测试文件
  const delFileHits = EvaluateChanges({
    policy,
    changes: [{ status: "D", oldPath: "Taierzhuang1938/Script_AlphaTest.mjs", path: "Taierzhuang1938/Script_AlphaTest.mjs" }],
    readOldText: () => null,
    readNewText: () => null,
  });
  Check(delFileHits.length === 1 && delFileHits[0].ruleId === "test-gate-integrity", "删除既有测试文件必拦");

  // 红灯 2：从 testDefs 删除已有条目
  const delDefRunner = `
export const testDefs = {
  AlphaTest: { file: "Script_AlphaTest.mjs", desc: "alpha" },
};
`;
  const delDefHits = EvaluateChanges({
    policy,
    changes: [{ status: "M", oldPath: "Taierzhuang1938/Script_TestRunner.mjs", path: "Taierzhuang1938/Script_TestRunner.mjs" }],
    readOldText: () => oldRunner,
    readNewText: () => delDefRunner,
  });
  Check(delDefHits.length === 1 && delDefHits[0].ruleId === "test-gate-integrity", "删除 testDefs 条目必拦");

  // 红灯 3：新增 expectedFailures 豁免
  const addExpRunner = `
export const testDefs = {
  AlphaTest: { file: "Script_AlphaTest.mjs", desc: "alpha", expectedFailures: ["brokenCheck"] },
  BetaTest: { file: "Script_BetaTest.mjs", desc: "beta" },
};
`;
  const addExpHits = EvaluateChanges({
    policy,
    changes: [{ status: "M", oldPath: "Taierzhuang1938/Script_TestRunner.mjs", path: "Taierzhuang1938/Script_TestRunner.mjs" }],
    readOldText: () => oldRunner,
    readNewText: () => addExpRunner,
  });
  Check(addExpHits.length === 1 && addExpHits[0].ruleId === "test-gate-integrity", "新增 expectedFailures 豁免必拦");
}

// ===========================================================================
// 5. 审批放行校验（精确 ID、禁通配、必填理由、Trailer 识别）
// ===========================================================================
{
  const hits = [
    { ruleId: "camera-profile-lock", label: "相机", details: [] },
    { ruleId: "graphics-exposure-lock", label: "画质", details: [] },
  ];

  Check(!CheckApproval({ hits, env: {} }).approved, "无审批信息拒绝");
  Check(!CheckApproval({ hits, env: { COMMIT_GUARD_APPROVED: "all", COMMIT_GUARD_REASON: "ok" } }).approved, "通配符 all 拒绝");
  Check(!CheckApproval({ hits, env: { COMMIT_GUARD_APPROVED: "*", COMMIT_GUARD_REASON: "ok" } }).approved, "通配符 * 拒绝");
  Check(!CheckApproval({ hits, env: { COMMIT_GUARD_APPROVED: "camera-profile-lock", COMMIT_GUARD_REASON: "ok" } }).approved, "只覆盖部分命中规则拒绝");
  Check(!CheckApproval({ hits, env: { COMMIT_GUARD_APPROVED: "camera-profile-lock,graphics-exposure-lock", COMMIT_GUARD_REASON: "" } }).approved, "缺少审批理由拒绝");
  Check(
    CheckApproval({
      hits,
      env: { COMMIT_GUARD_APPROVED: "camera-profile-lock,graphics-exposure-lock", COMMIT_GUARD_REASON: "用户同意微调" },
    }).approved,
    "精确覆盖全部命中规则 + 非空理由放行",
  );
  Check(
    CheckApproval({
      hits,
      env: {},
      commitMessage: "Antigravity Taierzhuang1938: tune baseline\n\nApproved-Protected: camera-profile-lock, graphics-exposure-lock\n",
      allowTrailer: true,
    }).approved,
    "pre-push 模式识别 commit message Approved-Protected trailer 放行",
  );
  Check(
    !CheckApproval({
      hits,
      env: {},
      commitMessage: "Antigravity Taierzhuang1938: tune baseline\n\nApproved-Protected: camera-profile-lock\n",
      allowTrailer: true,
    }).approved,
    "trailer 漏写规则 ID 拒绝",
  );
}

// ===========================================================================
// 6. 真 Git 仓库端到端测试（.githooks/pre-commit + .githooks/pre-push）
// ===========================================================================
{
  const tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), "commit-guard-e2e-"));
  const remoteDir = path.join(tmpBase, "remote.git");
  const workDir = path.join(tmpBase, "work");
  try {
    const Run = (cwd, cmd, args, extraEnv = {}) =>
      spawnSync(cmd, args, {
        cwd,
        encoding: "utf8",
        windowsHide: true,
        env: { ...process.env, ...extraEnv },
      });

    fs.mkdirSync(remoteDir, { recursive: true });
    fs.mkdirSync(workDir, { recursive: true });
    assert.equal(Run(remoteDir, "git", ["init", "--bare"]).status, 0);
    assert.equal(Run(workDir, "git", ["init"]).status, 0);
    assert.equal(Run(workDir, "git", ["config", "user.name", "TestBot"]).status, 0);
    assert.equal(Run(workDir, "git", ["config", "user.email", "test@example.com"]).status, 0);
    assert.equal(Run(workDir, "git", ["remote", "add", "origin", remoteDir]).status, 0);

    // 拷贝检查器、策略表、hooks 与一个受保护文件 + 一个普通文件
    const CopyInto = (rel) => {
      const dst = path.join(workDir, rel);
      fs.mkdirSync(path.dirname(dst), { recursive: true });
      fs.copyFileSync(path.join(REPO_ROOT, rel), dst);
    };
    CopyInto(POLICY_REL_PATH);
    CopyInto("scripts/Script_CommitGuard.mjs");
    CopyInto(".githooks/pre-commit");
    CopyInto(".githooks/pre-push");
    fs.mkdirSync(path.join(workDir, "Taierzhuang1938"), { recursive: true });
    fs.writeFileSync(path.join(workDir, "Taierzhuang1938/Data_CameraProfile.mjs"), "export const V = 1;\n");
    fs.writeFileSync(path.join(workDir, "Taierzhuang1938/Normal.mjs"), "export const N = 1;\n");

    // 初始提交并推到裸仓库（此时尚未启用 hooks）
    assert.equal(Run(workDir, "git", ["add", "."]).status, 0);
    assert.equal(Run(workDir, "git", ["commit", "-m", "Init"]).status, 0);
    assert.equal(Run(workDir, "git", ["push", "-u", "origin", "HEAD:master"]).status, 0);

    // 通过 --install-hooks 启用 .githooks
    const installRes = Run(workDir, process.execPath, ["scripts/Script_CommitGuard.mjs", "--install-hooks"]);
    Check(installRes.status === 0, "临时仓 --install-hooks 成功");

    // 场景 A：修改普通文件 → commit 与 push 全部绿灯放行
    fs.writeFileSync(path.join(workDir, "Taierzhuang1938/Normal.mjs"), "export const N = 2;\n");
    assert.equal(Run(workDir, "git", ["add", "Taierzhuang1938/Normal.mjs"]).status, 0);
    const greenCommit = Run(workDir, "git", ["commit", "-m", "Normal update"]);
    Check(greenCommit.status === 0, "普通文件改动 pre-commit 静默通过");
    const greenPush = Run(workDir, "git", ["push", "origin", "HEAD:master"]);
    Check(greenPush.status === 0, "普通文件改动 pre-push 静默通过");

    // 场景 B：未授权修改 Data_CameraProfile.mjs → pre-commit 当场拦截
    fs.writeFileSync(path.join(workDir, "Taierzhuang1938/Data_CameraProfile.mjs"), "export const V = 2;\n");
    assert.equal(Run(workDir, "git", ["add", "Taierzhuang1938/Data_CameraProfile.mjs"]).status, 0);
    const blockedCommit = Run(workDir, "git", ["commit", "-m", "Sneaky profile edit"]);
    Check(blockedCommit.status !== 0 && /camera-profile-lock/.test(blockedCommit.stderr), "未授权改 CameraProfile 被 pre-commit 拦截");

    // 场景 C：即使同时删空暂存区里的 Data_ProtectedPaths.json 也无法绕过（读取 HEAD 基准策略）
    fs.writeFileSync(path.join(workDir, POLICY_REL_PATH), JSON.stringify({ schema: "repo.protectedPaths/1", version: 1, pathRules: [], semanticRules: [] }));
    assert.equal(Run(workDir, "git", ["add", POLICY_REL_PATH]).status, 0);
    const sneakyTamper = Run(workDir, "git", ["commit", "-m", "Tamper policy and profile"]);
    Check(
      sneakyTamper.status !== 0 && /camera-profile-lock/.test(sneakyTamper.stderr) && /commit-guard-self-lock/.test(sneakyTamper.stderr),
      "同时篡改暂存区策略表与受保护文件仍被 HEAD 基准策略双拦",
    );
    // 还原策略表暂存区
    assert.equal(Run(workDir, "git", ["checkout", "HEAD", "--", POLICY_REL_PATH]).status, 0);

    // 场景 D：假定某处用 --no-verify 绕过了 pre-commit 且没写 Approved-Protected → pre-push 照样拦死
    const bypassedCommit = Run(workDir, "git", ["commit", "--no-verify", "-m", "Bypassed pre-commit"]);
    Check(bypassedCommit.status === 0, "构造 --no-verify 提交");
    const blockedPush = Run(workDir, "git", ["push", "origin", "HEAD:master"]);
    Check(blockedPush.status !== 0 && /camera-profile-lock/.test(blockedPush.stderr), "无审批标记的绕过提交被 pre-push 拦截");

    // 场景 E：回退并用规范审批环境变量 + Approved-Protected trailer 提交 → commit 与 push 全部放行
    assert.equal(Run(workDir, "git", ["reset", "--soft", "HEAD~1"]).status, 0);
    const approvedCommit = Run(
      workDir,
      "git",
      ["commit", "-m", "Owner approved profile update\n\nApproved-Protected: camera-profile-lock"],
      { COMMIT_GUARD_APPROVED: "camera-profile-lock", COMMIT_GUARD_REASON: "用户确认调参" },
    );
    Check(approvedCommit.status === 0, "带合法审批环境变量的提交 pre-commit 放行");
    const approvedPush = Run(workDir, "git", ["push", "origin", "HEAD:master"]);
    Check(approvedPush.status === 0, "带 Approved-Protected trailer 的提交 pre-push 自动放行");
  } finally {
    fs.rmSync(tmpBase, { recursive: true, force: true });
  }
}

console.log(`PASS Script_CommitGuardTest: ${checks} checks passed`);
