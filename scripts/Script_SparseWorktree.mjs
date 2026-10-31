// worktree 稀疏检出：只检出本任务要动的项目，加上它引用到的兄弟目录。
// 整库检出约 2.8 GB（滕县一家 1.7 GB），只做小项目时几十 MB 就够；每个会话 / 子代理一棵 worktree，省下的是 C 盘。
//
//   node scripts/Script_SparseWorktree.mjs plan <项目目录...>    只看会带上哪些目录、为什么、多大，不动文件
//   node scripts/Script_SparseWorktree.mjs set <项目目录...>     把当前 worktree 裁成这些项目
//   node scripts/Script_SparseWorktree.mjs add <目录...>         在现有稀疏检出上再加目录
//   node scripts/Script_SparseWorktree.mjs off                   恢复整库检出
//   node scripts/Script_SparseWorktree.mjs status                看现在检出了什么
//   node scripts/Script_SparseWorktree.mjs new <路径> <分支> <项目目录...> [--base=origin/master]
//                                                                新建一棵一开始就是稀疏的 worktree（不先写满整库再删）
//   node scripts/Script_SparseWorktree.mjs hook                  SessionStart 钩子：稀疏时提醒一句，否则不出声
//
// 总是带上：仓库根目录的文件（git 锥形模式自带）、.claude（钩子与技能）、.github、scripts、docs。
// 依赖按源码里的 `../<目录>/` 相对引用自动补（滕县 → PrairieFire1937 的浏览器测试工具、根 Model/ 里的随身草席），
// 补到没有新目录为止。漏了就 add，拿不准就 off。主检出多个会话共用，不在那里裁。

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const fileHere = fileURLToPath(import.meta.url);
const ALWAYS_DIRS = [".claude", ".github", "scripts", "docs"];
const REF_GLOBS = ["*.mjs", "*.js", "*.html", "*.py", "*.json"];
const REF_PATTERN = "(\\.\\./)+[A-Za-z0-9_.-]+/";
const USAGE = "用法：plan|set|add <目录...>、off、status、new <路径> <分支> <项目目录...> [--base=origin/master]、hook";

function Git(args, { cwd, allowFail = false } = {}) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8", windowsHide: true, maxBuffer: 256 * 1024 * 1024 });
  if (result.status !== 0 && !allowFail) {
    throw new Error(`git ${args.join(" ")} 失败：${(result.stderr || result.stdout || "").trim()}`);
  }
  return result;
}

function GitText(args, opts) {
  return Git(args, opts).stdout.trim();
}

function Lines(text) {
  return text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

function NormalizeDir(raw) {
  return raw.replaceAll("\\", "/").replace(/^\.\//, "").replace(/\/+$/, "");
}

function WorktreeRoot(cwd) {
  return path.resolve(GitText(["rev-parse", "--show-toplevel"], { cwd }));
}

function IsMainWorktree(root) {
  const gitDir = path.resolve(root, GitText(["rev-parse", "--git-dir"], { cwd: root }));
  const commonDir = path.resolve(root, GitText(["rev-parse", "--git-common-dir"], { cwd: root }));
  return gitDir === commonDir;
}

function IsSparse(root) {
  return GitText(["config", "--bool", "core.sparseCheckout"], { cwd: root, allowFail: true }) === "true";
}

function SparseDirs(root) {
  return Lines(GitText(["sparse-checkout", "list"], { cwd: root }));
}

function TopDirs(root, rev) {
  return new Set(Lines(GitText(["ls-tree", "-d", "--name-only", rev], { cwd: root })));
}

/** 从 wanted 出发，按 `../<目录>/` 相对引用补上兄弟目录，直到闭包。返回目录表与每个自动补进来的理由。 */
export function ResolveDirs(root, rev, wanted) {
  const top = TopDirs(root, rev);
  const dirs = new Set(ALWAYS_DIRS.filter((dir) => top.has(dir)));
  const reasons = new Map();
  for (const raw of wanted) {
    const dir = NormalizeDir(raw);
    if (!dir || dir.startsWith("..")) throw new Error(`目录写法不对：${raw}`);
    if (Git(["cat-file", "-e", `${rev}:${dir}`], { cwd: root, allowFail: true }).status !== 0) {
      throw new Error(`${rev} 里没有目录 ${dir}`);
    }
    dirs.add(dir);
  }
  const covered = (target) => [...dirs].some((dir) => target === dir || target.startsWith(`${dir}/`));
  let queue = [...dirs].filter((dir) => !ALWAYS_DIRS.includes(dir));
  while (queue.length) {
    const specs = queue.flatMap((dir) => REF_GLOBS.map((glob) => `${dir}/${glob}`));
    const grep = Git(["grep", "-o", "-I", "-E", REF_PATTERN, rev, "--", ...specs], { cwd: root, allowFail: true });
    if (grep.status > 1) throw new Error(`git grep 失败：${grep.stderr.trim()}`);
    const next = [];
    for (const line of Lines(grep.stdout)) {
      // 形如 HEAD:Taierzhuang1938/Data_StrawSleepingMat.mjs:../Model/
      const match = /^[^:]+:(.+):((?:\.\.\/)+[^/]+\/)$/.exec(line);
      if (!match) continue;
      const [, file, ref] = match;
      const target = path.posix.normalize(path.posix.join(path.posix.dirname(file), ref)).replace(/\/$/, "");
      if (target.startsWith("..") || covered(target)) continue;
      const dir = target.split("/")[0];
      if (!top.has(dir) || dirs.has(dir)) continue;
      dirs.add(dir);
      reasons.set(dir, `${file} → ${ref}`);
      next.push(dir);
    }
    queue = next;
  }
  return { dirs: [...dirs].sort(), reasons };
}

/** 锥形模式会带上的路径：根目录文件、各目录本身，以及这些目录的上级目录里直接放着的文件。 */
function InCone(file, dirs) {
  if (!file.includes("/")) return true;
  if (dirs.some((dir) => file.startsWith(`${dir}/`))) return true;
  const parent = path.posix.dirname(file);
  return dirs.some((dir) => dir.startsWith(`${parent}/`));
}

function TreeBytes(root, rev, dirs) {
  const out = GitText(["ls-tree", "-r", "-l", rev], { cwd: root });
  let bytes = 0;
  for (const line of Lines(out)) {
    const match = /^\d+ blob [0-9a-f]+\s+(\d+)\t(.+)$/.exec(line);
    if (match && (!dirs || InCone(match[2], dirs))) bytes += Number(match[1]);
  }
  return bytes;
}

function CheckedOutBytes(root) {
  const files = GitText(["ls-files", "-z"], { cwd: root }).split("\0").filter(Boolean);
  let bytes = 0;
  for (const file of files) {
    try { bytes += fs.statSync(path.join(root, file)).size; } catch { /* 稀疏检出之外的文件不在盘上 */ }
  }
  return bytes;
}

function Gb(bytes) {
  return bytes >= 1e9 ? `${(bytes / 1e9).toFixed(2)} GB` : `${(bytes / 1e6).toFixed(1)} MB`;
}

function PrintPlan(dirs, reasons) {
  console.log(`[sparse] 检出目录：${dirs.join("  ")}（加仓库根目录的文件）`);
  for (const [dir, why] of reasons) console.log(`[sparse]   自动补 ${dir}：${why}`);
}

function GuardMain(root, force) {
  if (IsMainWorktree(root) && !force) {
    throw new Error("这是主检出，多个会话共用，不在这里裁剪；在本任务自己的 worktree 里跑（确需强制加 --force）。");
  }
}

function GuardDirtyOutside(root, dirs) {
  // 不 trim：每条开头的状态位可能是空格，裁掉就错位。
  const status = Git(["status", "--porcelain=v1", "-z", "--untracked-files=no", "--no-renames"], { cwd: root }).stdout;
  const outside = status.split("\0").filter(Boolean)
    .map((entry) => entry.slice(3).replaceAll("\\", "/"))
    .filter((file) => file && !InCone(file, dirs));
  if (outside.length) {
    throw new Error(`这些改动在要裁掉的目录里，先提交或撤销再裁：\n  ${outside.slice(0, 20).join("\n  ")}`);
  }
}

function ApplyDirs(root, dirs, reasons) {
  GuardDirtyOutside(root, dirs);
  const before = CheckedOutBytes(root);
  PrintPlan(dirs, reasons);
  Git(["sparse-checkout", "set", "--cone", ...dirs], { cwd: root });
  console.log(`[sparse] 盘上的跟踪文件：${Gb(before)} → ${Gb(CheckedOutBytes(root))}`);
}

function CommandPlan(root, wanted) {
  if (!wanted.length) throw new Error(USAGE);
  const { dirs, reasons } = ResolveDirs(root, "HEAD", wanted);
  PrintPlan(dirs, reasons);
  console.log(`[sparse] 预计检出 ${Gb(TreeBytes(root, "HEAD", dirs))}（整库 ${Gb(TreeBytes(root, "HEAD", null))}）`);
}

function CommandSet(root, wanted, force) {
  if (!wanted.length) throw new Error(USAGE);
  GuardMain(root, force);
  const { dirs, reasons } = ResolveDirs(root, "HEAD", wanted);
  ApplyDirs(root, dirs, reasons);
}

function CommandAdd(root, wanted, force) {
  if (!wanted.length) throw new Error(USAGE);
  GuardMain(root, force);
  if (!IsSparse(root)) throw new Error("当前是整库检出，不用 add；要裁剪用 set。");
  const { dirs, reasons } = ResolveDirs(root, "HEAD", [...SparseDirs(root), ...wanted]);
  ApplyDirs(root, dirs, reasons);
}

function CommandOff(root) {
  if (!IsSparse(root)) {
    console.log("[sparse] 已经是整库检出");
    return;
  }
  Git(["sparse-checkout", "disable"], { cwd: root });
  console.log(`[sparse] 已恢复整库检出：${Gb(CheckedOutBytes(root))}`);
}

function CommandStatus(root) {
  if (!IsSparse(root)) {
    console.log(`[sparse] 整库检出：${Gb(CheckedOutBytes(root))}`);
    return;
  }
  console.log(`[sparse] 稀疏检出：${SparseDirs(root).join("  ")}（加仓库根目录的文件）`);
  console.log(`[sparse] 盘上的跟踪文件：${Gb(CheckedOutBytes(root))}`);
}

function CommandNew(root, args, base) {
  const [target, branch, ...wanted] = args;
  if (!target || !branch || !wanted.length) throw new Error(USAGE);
  const targetPath = path.resolve(target);
  if (fs.existsSync(targetPath) && fs.readdirSync(targetPath).length) throw new Error(`目录已存在且不空：${targetPath}`);
  const remoteBranch = /^origin\/(.+)$/.exec(base)?.[1];
  if (remoteBranch) Git(["fetch", "origin", remoteBranch], { cwd: root });
  const { dirs, reasons } = ResolveDirs(root, base, wanted);
  PrintPlan(dirs, reasons);
  // 先只建 worktree 不写文件，定好检出范围再从 HEAD 读进索引并写盘，整库从头到尾不落地。
  Git(["worktree", "add", "--no-checkout", "-b", branch, targetPath, base], { cwd: root });
  Git(["sparse-checkout", "set", "--cone", ...dirs], { cwd: targetPath });
  Git(["read-tree", "-mu", "HEAD"], { cwd: targetPath });
  console.log(`[sparse] 已建 ${targetPath}（分支 ${branch}，基于 ${base}）：${Gb(CheckedOutBytes(targetPath))}`);
}

function CommandHook(root) {
  if (!IsSparse(root)) return;
  console.log(`本 worktree 是稀疏检出，只有 ${SparseDirs(root).join("、")} 和仓库根目录的文件。`
    + "要动别的目录先 `node scripts/Script_SparseWorktree.mjs add <目录>`，要整库用 `off`；别把没检出的目录当成被删了。");
}

export function Main(argv = process.argv.slice(2)) {
  const force = argv.includes("--force");
  const base = argv.find((arg) => arg.startsWith("--base="))?.slice("--base=".length) || "origin/master";
  const [command, ...rest] = argv.filter((arg) => !arg.startsWith("--"));
  if (command === "hook") {
    // 钩子不许把会话启动拦下来：查不到就不出声。
    try { CommandHook(WorktreeRoot(process.cwd())); } catch { /* 不在 git 里或 git 不可用 */ }
    return 0;
  }
  const root = WorktreeRoot(process.cwd());
  if (command === "plan") CommandPlan(root, rest);
  else if (command === "set") CommandSet(root, rest, force);
  else if (command === "add") CommandAdd(root, rest, force);
  else if (command === "off") CommandOff(root);
  else if (command === "status") CommandStatus(root);
  else if (command === "new") CommandNew(root, rest, base);
  else throw new Error(USAGE);
  return 0;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileHere;
if (isMain) {
  try {
    process.exitCode = Main();
  } catch (error) {
    console.error(`[sparse] ${error.message}`);
    process.exitCode = 2;
  }
}
