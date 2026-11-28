// 本地提交权限检查器（scripts/Script_CommitGuard.mjs）。
// 读取 scripts/Data_ProtectedPaths.json，对暂存区（pre-commit）或待推提交（pre-push）做文件级与语义级拦截。
//
// 常用命令：
//   node scripts/Script_CommitGuard.mjs --staged                  检查暂存区（.githooks/pre-commit 调用）
//   node scripts/Script_CommitGuard.mjs --pre-push                检查待推送提交（.githooks/pre-push 调用）
//   node scripts/Script_CommitGuard.mjs --base=origin/master      手动自检 origin/master..HEAD
//   node scripts/Script_CommitGuard.mjs --range=<from>..<to>      检查指定提交区间
//   node scripts/Script_CommitGuard.mjs --replay-days=14          用最近 14 天真实提交回放验证命中与误报率
//   node scripts/Script_CommitGuard.mjs --install-hooks           启用仓库 .githooks（本机所有 worktree 自动生效）
//   node scripts/Script_CommitGuard.mjs --status                  查看当前 Hook 与生效规则状态
//
// 审批放行（仅在用户明确授权后使用，严禁 Agent 自行放行或使用 --no-verify）：
//   pre-commit：环境变量 COMMIT_GUARD_APPROVED="<ruleId1,ruleId2>" + COMMIT_GUARD_REASON="<审批理由>"
//   pre-push  ：提交信息末尾包含 `Approved-Protected: <ruleId1,ruleId2>`，或同样设置上述环境变量。

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const FILE_HERE = fileURLToPath(import.meta.url);
const DEFAULT_REPO_ROOT = path.resolve(path.dirname(FILE_HERE), "..");
export const POLICY_REL_PATH = "scripts/Data_ProtectedPaths.json";
const ZERO_SHA = "0".repeat(40);
const EMPTY_TREE_SHA = "4b825dc642cb6eb9a060e54bf8d69288fbee4904";
const FORBIDDEN_WILDCARD_APPROVALS = new Set(["*", "all", "any", "true", "yes", "1"]);

// ---------------------------------------------------------------------------
// 路径通配与文本/JSON 辅助
// ---------------------------------------------------------------------------

const EscapeRegex = (str) => str.replace(/[.+^${}()|[\]\\?]/g, "\\$&");

export function CompileGlob(pattern) {
  const norm = pattern.replaceAll("\\", "/");
  const expr = norm
    .split("**/")
    .map((a) =>
      a
        .split("**")
        .map((b) => b.split("*").map(EscapeRegex).join("[^/]*"))
        .join(".*"),
    )
    .join("(?:.*/)?");
  return new RegExp(`^${expr}$`);
}

export function MatchesAnyGlob(relPath, patterns) {
  const norm = relPath.replaceAll("\\", "/");
  return patterns.some((pattern) => (pattern.includes("*") ? CompileGlob(pattern).test(norm) : pattern === norm));
}

function CanonicalStringify(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(CanonicalStringify).join(",")}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${CanonicalStringify(value[k])}`).join(",")}}`;
}

// ---------------------------------------------------------------------------
// Git 读取工具
// ---------------------------------------------------------------------------

function RunGit(repoRoot, args, { allowFail = false, maxBuffer = 64 * 1024 * 1024 } = {}) {
  const result = spawnSync("git", args, {
    cwd: repoRoot,
    encoding: "utf8",
    windowsHide: true,
    maxBuffer,
  });
  if (result.status !== 0 && !allowFail) {
    throw new Error(`git ${args.join(" ")} 失败：${(result.stderr || result.stdout || "").trim()}`);
  }
  return { status: result.status ?? 1, stdout: result.stdout || "", stderr: result.stderr || "" };
}

function HasRef(repoRoot, ref) {
  return RunGit(repoRoot, ["rev-parse", "--verify", "--quiet", `${ref}^{commit}`], { allowFail: true }).status === 0;
}

function ReadGitBlob(repoRoot, spec) {
  const res = RunGit(repoRoot, ["show", spec], { allowFail: true });
  return res.status === 0 ? res.stdout : null;
}

function ParseNameStatusZ(raw) {
  if (!raw) return [];
  const tokens = raw.split("\0");
  const entries = [];
  let i = 0;
  while (i < tokens.length) {
    const statusToken = tokens[i++];
    if (!statusToken) continue;
    const status = statusToken[0];
    if (status === "R" || status === "C") {
      const oldPath = (tokens[i++] || "").replaceAll("\\", "/");
      const newPath = (tokens[i++] || "").replaceAll("\\", "/");
      entries.push({ status, oldPath, path: newPath });
    } else {
      const filePath = (tokens[i++] || "").replaceAll("\\", "/");
      entries.push({ status, oldPath: status === "A" ? null : filePath, path: filePath });
    }
  }
  return entries;
}

export function LoadPolicy(repoRoot, { baseRef = null } = {}) {
  // 优先读取基准版本（如 HEAD）的策略表，避免同一提交中“先删规则再改禁区文件”绕过拦截。
  let raw = null;
  let source = "worktree";
  if (baseRef && baseRef !== EMPTY_TREE_SHA) {
    raw = ReadGitBlob(repoRoot, `${baseRef}:${POLICY_REL_PATH}`);
    if (raw !== null) source = `${baseRef}:${POLICY_REL_PATH}`;
  }
  if (raw === null) {
    const diskPath = path.join(repoRoot, POLICY_REL_PATH);
    if (!fs.existsSync(diskPath)) {
      throw new Error(`找不到禁区策略文件：${POLICY_REL_PATH}`);
    }
    raw = fs.readFileSync(diskPath, "utf8");
  }
  const policy = JSON.parse(raw);
  if (policy.schema !== "repo.protectedPaths/1") {
    throw new Error(`不支持的策略 schema：${policy.schema}`);
  }
  return { policy, source };
}

// ---------------------------------------------------------------------------
// 语义解析器：Data_AssetStandards.json（7b）
// ---------------------------------------------------------------------------

export function EvaluateAssetStandardsSemantic(rule, oldText, newText) {
  const issues = [];
  if (newText === null) {
    if (rule.forbidDeleteFile) {
      issues.push("禁止删除资产标准文件 Data_AssetStandards.json");
    }
    return issues;
  }
  let oldJson = null;
  let newJson = null;
  try {
    oldJson = oldText ? JSON.parse(oldText) : null;
  } catch (err) {
    issues.push(`旧版 JSON 无法解析：${err.message}`);
    return issues;
  }
  try {
    newJson = JSON.parse(newText);
  } catch (err) {
    issues.push(`新版 JSON 语法损坏：${err.message}`);
    return issues;
  }
  if (!oldJson) return issues;

  // 1. 全局锁定顶层红线键
  for (const key of rule.lockedTopLevelKeys || []) {
    if (CanonicalStringify(oldJson[key]) !== CanonicalStringify(newJson[key])) {
      issues.push(`修改了受保护的全局红线字段 "${key}"`);
    }
  }

  // 2. sourceAssets 禁止删除既有条目
  if (rule.forbidDeleteSourceAssets && oldJson.sourceAssets && typeof oldJson.sourceAssets === "object") {
    const nextSource = newJson.sourceAssets && typeof newJson.sourceAssets === "object" ? newJson.sourceAssets : {};
    for (const id of Object.keys(oldJson.sourceAssets)) {
      if (!Object.hasOwn(nextSource, id)) {
        issues.push(`删除了既有 sourceAssets 条目 "${id}"`);
      }
    }
  }

  // 3. externalGlb 检查：禁删条目、禁调高 targetTriangles、禁 actualTriangles 超过 targetTriangles
  const oldGlbList = Array.isArray(oldJson.externalGlb) ? oldJson.externalGlb : [];
  const newGlbList = Array.isArray(newJson.externalGlb) ? newJson.externalGlb : [];
  const oldById = new Map(oldGlbList.filter((item) => item?.id).map((item) => [item.id, item]));
  const newById = new Map(newGlbList.filter((item) => item?.id).map((item) => [item.id, item]));

  if (rule.forbidDeleteExternalGlb) {
    for (const id of oldById.keys()) {
      if (!newById.has(id)) {
        issues.push(`删除了既有 externalGlb 条目 "${id}"`);
      }
    }
  }

  for (const [id, nextItem] of newById.entries()) {
    const prevItem = oldById.get(id);
    const changed = !prevItem || CanonicalStringify(prevItem) !== CanonicalStringify(nextItem);
    if (!changed) continue;

    if (rule.forbidIncreaseExternalTargetTriangles && prevItem) {
      const prevTarget = prevItem.targetTriangles;
      const nextTarget = nextItem.targetTriangles;
      if (typeof prevTarget === "number") {
        if (typeof nextTarget !== "number") {
          issues.push(`移除了 externalGlb["${id}"].targetTriangles（原值 ${prevTarget}）`);
        } else if (nextTarget > prevTarget) {
          issues.push(`调高了 externalGlb["${id}"].targetTriangles（${prevTarget} → ${nextTarget}）`);
        }
      }
    }

    if (rule.forbidActualExceedTarget) {
      const actual = nextItem.actualTriangles;
      const target = nextItem.targetTriangles;
      if (typeof actual === "number" && typeof target === "number" && actual > target) {
        issues.push(`externalGlb["${id}"].actualTriangles (${actual}) 超过 targetTriangles (${target})`);
      }
    }
  }

  return issues;
}

// ---------------------------------------------------------------------------
// 语义解析器：Script_TestRunner.mjs（7c）
// ---------------------------------------------------------------------------

/**
 * 词法扫描提取 `export const testDefs = { ... }` 的顶层条目名与每个条目内的 expectedFailures 项。
 * 正确跳过字符串字面量与单/多行注释，支持单行多条目写法。
 */
export function ParseTestRunnerDefs(sourceText) {
  if (!sourceText) return null;
  const marker = /export\s+const\s+testDefs\s*=\s*\{/m.exec(sourceText);
  if (!marker) return null;

  const openBraceIndex = marker.index + marker[0].length - 1;
  const len = sourceText.length;

  let i = openBraceIndex + 1;
  let depth = 1; // 1 = testDefs 顶层
  const defs = new Map();

  let currentKey = null;
  let entryBodyStart = -1;

  const SkipNoise = () => {
    while (i < len) {
      const ch = sourceText[i];
      if (ch === " " || ch === "\t" || ch === "\r" || ch === "\n") {
        i += 1;
      } else if (ch === "/" && sourceText[i + 1] === "/") {
        i += 2;
        while (i < len && sourceText[i] !== "\n") i += 1;
      } else if (ch === "/" && sourceText[i + 1] === "*") {
        i += 2;
        while (i < len && !(sourceText[i] === "*" && sourceText[i + 1] === "/")) i += 1;
        i += 2;
      } else {
        break;
      }
    }
  };

  const ReadString = () => {
    const quote = sourceText[i++];
    let out = "";
    while (i < len) {
      const ch = sourceText[i++];
      if (ch === "\\") {
        if (i < len) out += sourceText[i++];
        continue;
      }
      if (ch === quote) break;
      out += ch;
    }
    return out;
  };

  const ExtractExpectedFailures = (bodyText) => {
    // 在条目文本里找 expectedFailures: [ ... ]，提取字符串项与总项数
    const cleaned = bodyText
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/(^|[^:\\])\/\/.*$/gm, "$1");
    const match = /\bexpectedFailures\s*:\s*\[([\s\S]*?)\]/.exec(cleaned);
    if (!match) return [];
    const inner = match[1].trim();
    if (!inner) return [];
    const items = [];
    const strRe = /(["'`])((?:\\.|(?!\1)[^\\])*)\1/g;
    let m;
    while ((m = strRe.exec(inner)) !== null) items.push(m[2]);
    // 兜底：若数组内写了非常量表达式而非字面量，仍记入占位计数
    if (items.length === 0) items.push(inner);
    return items;
  };

  while (i < len && depth > 0) {
    if (depth === 1) {
      SkipNoise();
      if (i >= len) break;
      const ch = sourceText[i];
      if (ch === "}") {
        depth = 0;
        break;
      }
      if (ch === ",") {
        i += 1;
        continue;
      }
      // 读取顶层 key（标识符或字符串）
      let key = null;
      if (ch === '"' || ch === "'" || ch === "`") {
        key = ReadString();
      } else if (/[A-Za-z_$]/.test(ch)) {
        const start = i;
        while (i < len && /[A-Za-z0-9_$]/.test(sourceText[i])) i += 1;
        key = sourceText.slice(start, i);
      } else {
        i += 1;
        continue;
      }
      SkipNoise();
      if (sourceText[i] !== ":") continue;
      i += 1;
      SkipNoise();
      if (sourceText[i] === "{") {
        currentKey = key;
        entryBodyStart = i;
        depth = 2;
        i += 1;
      }
      continue;
    }

    // depth >= 2：扫到对应条目的闭合大括号
    const ch = sourceText[i];
    if (ch === '"' || ch === "'" || ch === "`") {
      ReadString();
    } else if (ch === "/" && sourceText[i + 1] === "/") {
      i += 2;
      while (i < len && sourceText[i] !== "\n") i += 1;
    } else if (ch === "/" && sourceText[i + 1] === "*") {
      i += 2;
      while (i < len && !(sourceText[i] === "*" && sourceText[i + 1] === "/")) i += 1;
      i += 2;
    } else if (ch === "{") {
      depth += 1;
      i += 1;
    } else if (ch === "}") {
      depth -= 1;
      i += 1;
      if (depth === 1 && currentKey) {
        const bodyText = sourceText.slice(entryBodyStart, i);
        defs.set(currentKey, {
          expectedFailures: ExtractExpectedFailures(bodyText),
        });
        currentKey = null;
        entryBodyStart = -1;
      }
    } else {
      i += 1;
    }
  }

  return defs;
}

export function EvaluateTestGateSemantic(rule, changes, ReadOldText, ReadNewText) {
  const issues = [];

  // 1. 禁止删除既有自动化测试文件
  if (rule.forbidDeleteTestFiles && Array.isArray(rule.testFileGlobs)) {
    for (const change of changes) {
      if (change.status === "D" && MatchesAnyGlob(change.path, rule.testFileGlobs)) {
        issues.push(`删除了既有测试文件 ${change.path}`);
      } else if (change.status === "R" && change.oldPath && MatchesAnyGlob(change.oldPath, rule.testFileGlobs)) {
        issues.push(`重命名/移除了既有测试文件 ${change.oldPath} → ${change.path}`);
      }
    }
  }

  // 2. Script_TestRunner.mjs 检查：禁删 testDefs、禁增 expectedFailures
  const runnerChange = changes.find((c) => c.path === rule.runnerFile || c.oldPath === rule.runnerFile);
  if (runnerChange) {
    if (runnerChange.status === "D") {
      issues.push(`删除了测试总入口 ${rule.runnerFile}`);
      return issues;
    }
    const oldText = ReadOldText(rule.runnerFile);
    const newText = ReadNewText(rule.runnerFile);
    const oldDefs = ParseTestRunnerDefs(oldText);
    const newDefs = ParseTestRunnerDefs(newText);

    if (oldDefs && !newDefs) {
      issues.push(`无法在 ${rule.runnerFile} 中解析 export const testDefs`);
      return issues;
    }
    if (oldDefs && newDefs) {
      if (rule.forbidDeleteTestDefs) {
        for (const name of oldDefs.keys()) {
          if (!newDefs.has(name)) {
            issues.push(`从 ${rule.runnerFile} 的 testDefs 删除了既有测试 "${name}"`);
          }
        }
      }
      if (rule.forbidAddExpectedFailures) {
        for (const [name, nextInfo] of newDefs.entries()) {
          const prevList = oldDefs.get(name)?.expectedFailures || [];
          const nextList = nextInfo.expectedFailures || [];
          if (nextList.length > prevList.length) {
            const added = nextList.filter((item) => !prevList.includes(item));
            issues.push(
              `在 ${rule.runnerFile} 的 testDefs.${name} 新增了 expectedFailures 豁免${added.length ? `：${added.join(", ")}` : ""}`,
            );
          } else {
            const added = nextList.filter((item) => !prevList.includes(item));
            if (added.length > 0) {
              issues.push(`在 ${rule.runnerFile} 的 testDefs.${name} 修改/新增了 expectedFailures 豁免：${added.join(", ")}`);
            }
          }
        }
      }
    }
  }

  return issues;
}

// ---------------------------------------------------------------------------
// 核心评估函数（纯逻辑，支持任意 diff 来源与单元测试）
// ---------------------------------------------------------------------------

export function EvaluateChanges({ policy, changes, readOldText, readNewText }) {
  const hitsByRule = new Map();

  const RecordHit = (rule, file, detail) => {
    let entry = hitsByRule.get(rule.id);
    if (!entry) {
      entry = {
        ruleId: rule.id,
        category: rule.category,
        label: rule.label,
        reason: rule.reason,
        details: [],
      };
      hitsByRule.set(rule.id, entry);
    }
    entry.details.push({ file, detail });
  };

  // 1. 文件级硬锁规则
  for (const rule of policy.pathRules || []) {
    for (const change of changes) {
      const matchedPath = MatchesAnyGlob(change.path, rule.paths)
        ? change.path
        : change.oldPath && MatchesAnyGlob(change.oldPath, rule.paths)
          ? change.oldPath
          : null;
      if (matchedPath) {
        const verb =
          change.status === "A"
            ? "新增"
            : change.status === "D"
              ? "删除"
              : change.status === "R"
                ? `重命名(${change.oldPath} → ${change.path})`
                : "修改";
        RecordHit(rule, matchedPath, `${verb}受保护文件 ${matchedPath}`);
      }
    }
  }

  // 2. 语义级精准规则
  for (const rule of policy.semanticRules || []) {
    if (rule.kind === "assetStandardsJson") {
      const targetChange = changes.find((c) => c.path === rule.file || c.oldPath === rule.file);
      if (!targetChange) continue;
      const oldText = targetChange.status === "A" ? null : readOldText(targetChange.oldPath || rule.file);
      const newText = targetChange.status === "D" ? null : readNewText(targetChange.path);
      const issues = EvaluateAssetStandardsSemantic(rule, oldText, newText);
      for (const detail of issues) {
        RecordHit(rule, rule.file, detail);
      }
    } else if (rule.kind === "testGateIntegrity") {
      const issues = EvaluateTestGateSemantic(rule, changes, readOldText, readNewText);
      for (const detail of issues) {
        RecordHit(rule, rule.runnerFile, detail);
      }
    }
  }

  return [...hitsByRule.values()];
}

// ---------------------------------------------------------------------------
// 审批放行校验
// ---------------------------------------------------------------------------

export function ParseApprovedRuleList(raw) {
  if (!raw || typeof raw !== "string") return { valid: true, ids: new Set(), error: null };
  const parts = raw
    .split(/[,\s;]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  for (const part of parts) {
    if (FORBIDDEN_WILDCARD_APPROVALS.has(part.toLowerCase())) {
      return {
        valid: false,
        ids: new Set(),
        error: `禁止使用通配审批值 "${part}"，必须精确列出获批的规则 ID`,
      };
    }
  }
  return { valid: true, ids: new Set(parts), error: null };
}

export function ExtractCommitApprovedRules(commitMessage) {
  const ids = new Set();
  if (!commitMessage) return { valid: true, ids, error: null };
  const lines = commitMessage.split(/\r?\n/);
  for (const line of lines) {
    const match = /^\s*Approved-Protected\s*:\s*(.+)$/i.exec(line);
    if (!match) continue;
    const parsed = ParseApprovedRuleList(match[1]);
    if (!parsed.valid) return parsed;
    for (const id of parsed.ids) ids.add(id);
  }
  return { valid: true, ids, error: null };
}

export function CheckApproval({ hits, env = process.env, commitMessage = null, allowTrailer = false }) {
  if (hits.length === 0) return { approved: true, via: null, missing: [], error: null };

  const requiredIds = hits.map((h) => h.ruleId);

  // 1. pre-push 可接受提交信息里的 Approved-Protected trailer
  if (allowTrailer && commitMessage) {
    const trailer = ExtractCommitApprovedRules(commitMessage);
    if (!trailer.valid) {
      return { approved: false, via: null, missing: requiredIds, error: trailer.error };
    }
    const missingFromTrailer = requiredIds.filter((id) => !trailer.ids.has(id));
    if (missingFromTrailer.length === 0) {
      return { approved: true, via: "commit-trailer", missing: [], error: null };
    }
  }

  // 2. 环境变量显式放行（pre-commit 与 pre-push 均支持）
  const rawApproved = (env.COMMIT_GUARD_APPROVED || "").trim();
  const rawReason = (env.COMMIT_GUARD_REASON || "").trim();
  if (!rawApproved) {
    return { approved: false, via: null, missing: requiredIds, error: null };
  }
  const parsed = ParseApprovedRuleList(rawApproved);
  if (!parsed.valid) {
    return { approved: false, via: null, missing: requiredIds, error: parsed.error };
  }
  const missing = requiredIds.filter((id) => !parsed.ids.has(id));
  if (missing.length > 0) {
    return {
      approved: false,
      via: null,
      missing,
      error: `COMMIT_GUARD_APPROVED 未覆盖全部命中规则，缺少：${missing.join(", ")}`,
    };
  }
  if (rawReason.length < 2) {
    return {
      approved: false,
      via: null,
      missing: [],
      error: "使用 COMMIT_GUARD_APPROVED 放行时必须同时提供非空的 COMMIT_GUARD_REASON（说明用户审批理由）",
    };
  }
  return { approved: true, via: "env", reason: rawReason, missing: [], error: null };
}

// ---------------------------------------------------------------------------
// 各类 Git 模式检查入口
// ---------------------------------------------------------------------------

export function CheckStaged(repoRoot, { env = process.env } = {}) {
  const hasHead = HasRef(repoRoot, "HEAD");
  const baseRef = hasHead ? "HEAD" : EMPTY_TREE_SHA;
  const { policy, source } = LoadPolicy(repoRoot, { baseRef });

  const diffArgs = hasHead
    ? ["diff", "--cached", "--name-status", "-z", "-M", "HEAD"]
    : ["diff", "--cached", "--name-status", "-z", "-M", EMPTY_TREE_SHA];
  const raw = RunGit(repoRoot, diffArgs).stdout;
  const changes = ParseNameStatusZ(raw);

  const hits = EvaluateChanges({
    policy,
    changes,
    readOldText: (rel) => (hasHead ? ReadGitBlob(repoRoot, `HEAD:${rel}`) : null),
    readNewText: (rel) => ReadGitBlob(repoRoot, `:${rel}`),
  });
  const approval = CheckApproval({ hits, env, allowTrailer: false });
  return { mode: "staged", policySource: source, changedCount: changes.length, hits, approval };
}

export function CheckCommit(repoRoot, sha, { env = process.env, allowTrailer = true } = {}) {
  const parentRes = RunGit(repoRoot, ["rev-list", "--parents", "-n", "1", sha]);
  const parents = parentRes.stdout.trim().split(/\s+/).slice(1);
  const parentRef = parents[0] || EMPTY_TREE_SHA;

  const { policy, source } = LoadPolicy(repoRoot, { baseRef: parentRef });
  const raw = RunGit(repoRoot, ["diff-tree", "--no-commit-id", "-r", "--name-status", "-z", "-M", parentRef, sha]).stdout;
  const changes = ParseNameStatusZ(raw);
  const commitMessage = RunGit(repoRoot, ["show", "-s", "--format=%B", sha]).stdout;
  const subject = RunGit(repoRoot, ["show", "-s", "--format=%s", sha]).stdout.trim();

  const hits = EvaluateChanges({
    policy,
    changes,
    readOldText: (rel) => (parentRef === EMPTY_TREE_SHA ? null : ReadGitBlob(repoRoot, `${parentRef}:${rel}`)),
    readNewText: (rel) => ReadGitBlob(repoRoot, `${sha}:${rel}`),
  });
  const approval = CheckApproval({ hits, env, commitMessage, allowTrailer });
  return {
    mode: "commit",
    sha,
    shortSha: sha.slice(0, 9),
    subject,
    policySource: source,
    changedCount: changes.length,
    hits,
    approval,
  };
}

export function CheckRange(repoRoot, fromRef, toRef, { env = process.env, allowTrailer = true } = {}) {
  const revSpec = fromRef === EMPTY_TREE_SHA ? toRef : `${fromRef}..${toRef}`;
  const commitsRaw = RunGit(repoRoot, ["rev-list", "--no-merges", "--reverse", revSpec], { allowFail: true });
  const shas = commitsRaw.status === 0 ? commitsRaw.stdout.split(/\r?\n/).map((s) => s.trim()).filter(Boolean) : [];
  const results = shas.map((sha) => CheckCommit(repoRoot, sha, { env, allowTrailer }));
  return { mode: "range", revSpec, commits: results };
}

export function CheckPrePush(repoRoot, stdinText, { env = process.env } = {}) {
  const lines = (stdinText || "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const checkedShas = new Set();
  const commitResults = [];

  for (const line of lines) {
    const [, localSha, , remoteSha] = line.split(/\s+/);
    if (!localSha || localSha === ZERO_SHA) continue;

    let revArgs;
    if (remoteSha && remoteSha !== ZERO_SHA && HasRef(repoRoot, remoteSha)) {
      revArgs = ["rev-list", "--no-merges", "--reverse", `${remoteSha}..${localSha}`];
    } else if (HasRef(repoRoot, "origin/master")) {
      revArgs = ["rev-list", "--no-merges", "--reverse", `origin/master..${localSha}`];
    } else {
      revArgs = ["rev-list", "--no-merges", "--reverse", localSha, "--not", "--remotes"];
    }
    const listRes = RunGit(repoRoot, revArgs, { allowFail: true });
    const shas = listRes.status === 0 ? listRes.stdout.split(/\r?\n/).map((s) => s.trim()).filter(Boolean) : [];
    for (const sha of shas) {
      if (checkedShas.has(sha)) continue;
      checkedShas.add(sha);
      commitResults.push(CheckCommit(repoRoot, sha, { env, allowTrailer: true }));
    }
  }

  return { mode: "pre-push", commits: commitResults };
}

export function ReplayRecentCommits(repoRoot, days = 14) {
  const { policy } = LoadPolicy(repoRoot, { baseRef: null });
  const logRaw = RunGit(repoRoot, ["log", `--since=${days} days ago`, "--no-merges", "--format=%H"]).stdout;
  const shas = logRaw.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);

  const byRule = new Map();
  let blockedCommits = 0;
  const samples = [];

  for (const sha of shas) {
    const parentRes = RunGit(repoRoot, ["rev-list", "--parents", "-n", "1", sha]);
    const parents = parentRes.stdout.trim().split(/\s+/).slice(1);
    const parentRef = parents[0] || EMPTY_TREE_SHA;
    const raw = RunGit(repoRoot, ["diff-tree", "--no-commit-id", "-r", "--name-status", "-z", "-M", parentRef, sha]).stdout;
    const changes = ParseNameStatusZ(raw);
    const hits = EvaluateChanges({
      policy,
      changes,
      readOldText: (rel) => (parentRef === EMPTY_TREE_SHA ? null : ReadGitBlob(repoRoot, `${parentRef}:${rel}`)),
      readNewText: (rel) => ReadGitBlob(repoRoot, `${sha}:${rel}`),
    });

    if (hits.length > 0) {
      blockedCommits += 1;
      const subject = RunGit(repoRoot, ["show", "-s", "--format=%s", sha]).stdout.trim();
      for (const hit of hits) {
        byRule.set(hit.ruleId, (byRule.get(hit.ruleId) || 0) + 1);
      }
      if (samples.length < 30) {
        samples.push({
          sha: sha.slice(0, 9),
          subject,
          rules: hits.map((h) => h.ruleId),
          details: hits.flatMap((h) => h.details.map((d) => d.detail)),
        });
      }
    }
  }

  const total = shas.length;
  const green = total - blockedCommits;
  const greenRate = total > 0 ? ((green / total) * 100).toFixed(1) : "100.0";
  return { days, total, green, blockedCommits, greenRate, byRule: Object.fromEntries(byRule), samples };
}

// ---------------------------------------------------------------------------
// Hook 安装与状态展示
// ---------------------------------------------------------------------------

export function InstallHooks(repoRoot) {
  const hooksDir = path.join(repoRoot, ".githooks");
  if (!fs.existsSync(hooksDir)) {
    throw new Error("当前仓库缺少 .githooks 目录");
  }
  RunGit(repoRoot, ["config", "core.hooksPath", ".githooks"]);
  const active = RunGit(repoRoot, ["config", "--get", "core.hooksPath"]).stdout.trim();
  return { hooksPath: active };
}

export function UninstallHooks(repoRoot) {
  RunGit(repoRoot, ["config", "--unset", "core.hooksPath"], { allowFail: true });
  return { hooksPath: null };
}

export function GetStatus(repoRoot) {
  const hooksRes = RunGit(repoRoot, ["config", "--get", "core.hooksPath"], { allowFail: true });
  const hooksPath = hooksRes.status === 0 ? hooksRes.stdout.trim() : null;
  const { policy, source } = LoadPolicy(repoRoot, { baseRef: null });
  return {
    repoRoot,
    hooksEnabled: hooksPath === ".githooks",
    hooksPath,
    policySource: source,
    pathRules: policy.pathRules.map((r) => ({ id: r.id, category: r.category, label: r.label, paths: r.paths })),
    semanticRules: policy.semanticRules.map((r) => ({ id: r.id, category: r.category, label: r.label, kind: r.kind })),
  };
}

// ---------------------------------------------------------------------------
// 输出格式化
// ---------------------------------------------------------------------------

function FormatBlockedReport({ title, hits, approval, includeTrailerHint }) {
  const ruleIds = hits.map((h) => h.ruleId).join(",");
  const lines = [
    "",
    `[CommitGuard] 已拦截（${title}）—— 命中 ${hits.length} 条受保护禁区规则：`,
  ];
  for (const hit of hits) {
    lines.push(`  • [${hit.ruleId}] ${hit.label}`);
    lines.push(`    原因：${hit.reason}`);
    for (const item of hit.details) {
      lines.push(`    - ${item.detail}`);
    }
  }
  if (approval?.error) {
    lines.push(`  ! 审批校验失败：${approval.error}`);
  }
  lines.push("");
  lines.push("处理方式：");
  lines.push("  1. 若属顺手误改，请撤销上述受保护文件改动后重新提交（严禁使用 --no-verify 绕过）。");
  lines.push("  2. 若确需修改，必须先向用户展示 diff 并获得明确同意，再按以下方式放行本次操作：");
  lines.push(`     PowerShell: $env:COMMIT_GUARD_APPROVED="${ruleIds}"; $env:COMMIT_GUARD_REASON="用户确认：<原因>"`);
  if (includeTrailerHint) {
    lines.push(`     并在提交信息末尾附一行：Approved-Protected: ${ruleIds}（推送时自动识别放行）`);
  }
  lines.push("");
  return lines.join("\n");
}

function PrintHelp() {
  console.log(`用法：node scripts/Script_CommitGuard.mjs <选项>

选项：
  --staged              检查暂存区（.githooks/pre-commit 使用）
  --pre-push            从 stdin 读待推引用并逐提交检查（.githooks/pre-push 使用）
  --base=<ref>          检查 <ref>..HEAD（默认 origin/master）
  --range=<from>..<to>  检查指定提交区间
  --replay-days=<N>     回放最近 N 天真实提交，统计绿灯率与命中明细
  --install-hooks       为本机仓库设置 core.hooksPath=.githooks（所有 worktree 共享生效）
  --uninstall-hooks     取消 core.hooksPath 设置
  --status              查看 Hook 与生效规则状态
  --json                以 JSON 格式输出结果
  --help                显示本帮助`);
}

// ---------------------------------------------------------------------------
// CLI 入口
// ---------------------------------------------------------------------------

function Main(argv) {
  let mode = null;
  let baseRef = "origin/master";
  let rangeSpec = null;
  let replayDays = 14;
  let asJson = false;
  let repoRoot = DEFAULT_REPO_ROOT;

  for (const arg of argv) {
    if (arg === "--help" || arg === "-h") {
      PrintHelp();
      return 0;
    } else if (arg === "--staged") mode = "staged";
    else if (arg === "--pre-push") mode = "pre-push";
    else if (arg === "--install-hooks") mode = "install-hooks";
    else if (arg === "--uninstall-hooks") mode = "uninstall-hooks";
    else if (arg === "--status") mode = "status";
    else if (arg === "--json") asJson = true;
    else if (arg.startsWith("--base=")) {
      mode = "base";
      baseRef = arg.slice("--base=".length) || "origin/master";
    } else if (arg.startsWith("--range=")) {
      mode = "range";
      rangeSpec = arg.slice("--range=".length);
    } else if (arg.startsWith("--replay-days=")) {
      mode = "replay";
      replayDays = Math.max(1, Number.parseInt(arg.slice("--replay-days=".length), 10) || 14);
    } else if (arg.startsWith("--repo=")) {
      repoRoot = path.resolve(arg.slice("--repo=".length));
    } else {
      throw new Error(`未知参数：${arg}`);
    }
  }

  // 若在 git worktree 下调用，以当前工作目录所属的 git 顶层为准（除非显式 --repo）
  if (!argv.some((a) => a.startsWith("--repo="))) {
    const topRes = spawnSync("git", ["rev-parse", "--show-toplevel"], {
      cwd: process.cwd(),
      encoding: "utf8",
      windowsHide: true,
    });
    if (topRes.status === 0 && topRes.stdout.trim()) {
      repoRoot = path.resolve(topRes.stdout.trim());
    }
  }

  if (!mode) {
    PrintHelp();
    return 0;
  }

  if (mode === "install-hooks") {
    const res = InstallHooks(repoRoot);
    if (asJson) console.log(JSON.stringify(res, null, 2));
    else console.log(`[CommitGuard] 已启用本地 Git Hook：core.hooksPath = ${res.hooksPath}（本机所有 worktree 自动共享生效）`);
    return 0;
  }

  if (mode === "uninstall-hooks") {
    const res = UninstallHooks(repoRoot);
    if (asJson) console.log(JSON.stringify(res, null, 2));
    else console.log("[CommitGuard] 已取消本地 core.hooksPath 配置");
    return 0;
  }

  if (mode === "status") {
    const st = GetStatus(repoRoot);
    if (asJson) {
      console.log(JSON.stringify(st, null, 2));
    } else {
      console.log(`[CommitGuard] 仓库：${st.repoRoot}`);
      console.log(`[CommitGuard] 本地 Hook：${st.hooksEnabled ? "已启用 (.githooks)" : `未启用 (当前=${st.hooksPath || "默认"})`}`);
      console.log(`[CommitGuard] 策略源：${st.policySource}`);
      console.log("  文件级禁区规则：");
      for (const r of st.pathRules) console.log(`    - [${r.id}] ${r.label} (${r.paths.length} 条路径)`);
      console.log("  语义级禁区规则：");
      for (const r of st.semanticRules) console.log(`    - [${r.id}] ${r.label} (${r.kind})`);
    }
    return 0;
  }

  if (mode === "replay") {
    const report = ReplayRecentCommits(repoRoot, replayDays);
    if (asJson) {
      console.log(JSON.stringify(report, null, 2));
    } else {
      console.log(`[CommitGuard] 最近 ${report.days} 天真实提交回放：总计 ${report.total} 个提交`);
      console.log(`  绿灯放行：${report.green}（${report.greenRate}%）`);
      console.log(`  命中禁区：${report.blockedCommits}`);
      for (const [id, count] of Object.entries(report.byRule)) {
        console.log(`    - ${id}: ${count} 次`);
      }
      if (report.samples.length) {
        console.log("  命中明细（最多前 30 条）：");
        for (const s of report.samples) {
          console.log(`    * ${s.sha} [${s.rules.join(",")}] ${s.subject}`);
          for (const d of s.details.slice(0, 4)) console.log(`        - ${d}`);
        }
      }
    }
    return 0;
  }

  if (mode === "staged") {
    const res = CheckStaged(repoRoot);
    if (asJson) {
      console.log(JSON.stringify(res, null, 2));
      return res.approval.approved ? 0 : 1;
    }
    if (res.hits.length === 0) return 0;
    if (res.approval.approved) {
      console.log(`[CommitGuard] 暂存区命中 [${res.hits.map((h) => h.ruleId).join(", ")}]，已按审批放行（理由：${res.approval.reason}）`);
      return 0;
    }
    console.error(FormatBlockedReport({ title: "pre-commit 暂存区", hits: res.hits, approval: res.approval, includeTrailerHint: true }));
    return 1;
  }

  if (mode === "base" || mode === "range") {
    const [fromRef, toRef] = mode === "range" ? rangeSpec.split("..") : [baseRef, "HEAD"];
    if (!fromRef || !toRef) throw new Error(`无效的提交区间：${rangeSpec}`);
    const res = CheckRange(repoRoot, fromRef, toRef);
    const blocked = res.commits.filter((c) => !c.approval.approved);
    if (asJson) {
      console.log(JSON.stringify(res, null, 2));
      return blocked.length === 0 ? 0 : 1;
    }
    if (blocked.length === 0) {
      console.log(`[CommitGuard] PASS：已检 ${res.commits.length} 个提交（${res.revSpec}），无未审批禁区改动`);
      return 0;
    }
    for (const c of blocked) {
      console.error(
        FormatBlockedReport({
          title: `commit ${c.shortSha} (${c.subject})`,
          hits: c.hits,
          approval: c.approval,
          includeTrailerHint: true,
        }),
      );
    }
    return 1;
  }

  if (mode === "pre-push") {
    const stdinText = fs.readFileSync(0, "utf8");
    const res = CheckPrePush(repoRoot, stdinText);
    const blocked = res.commits.filter((c) => !c.approval.approved);
    if (asJson) {
      console.log(JSON.stringify(res, null, 2));
      return blocked.length === 0 ? 0 : 1;
    }
    if (blocked.length === 0) return 0;
    for (const c of blocked) {
      console.error(
        FormatBlockedReport({
          title: `pre-push 提交 ${c.shortSha} (${c.subject})`,
          hits: c.hits,
          approval: c.approval,
          includeTrailerHint: true,
        }),
      );
    }
    return 1;
  }

  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === FILE_HERE) {
  try {
    process.exitCode = Main(process.argv.slice(2));
  } catch (err) {
    console.error(`[CommitGuard] 错误：${err.message}`);
    process.exitCode = 1;
  }
}
