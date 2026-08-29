// 仓库级按改动选测入口。
// 默认比较 origin/master；只运行命中的游戏项目，不再把互不相关的项目串成一次长测。
// `--all` 是明确的全仓冒烟入口，`--dry-run` 只展示命令。

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const fileHere = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(fileHere), "..");

const projectCommands = {
  AshenRoute1942: [["AshenRoute1942/Script_SystemsSmokeTest.mjs"]],
  Beiyue1941: [["Beiyue1941/Script_StrategySmokeTest.mjs"]],
  BorderRealm: [["BorderRealm/SmokeTest.mjs"]],
  CivilianFront1942: [["CivilianFront1942/Script_SmokeTest.mjs"]],
  CrunchOverlord: [["CrunchOverlord/Script_SmokeTest.mjs"]],
  EarthVeins1942: [["EarthVeins1942/Script_SmokeTest.mjs"]],
  EarthVeins1942Whitebox: [["EarthVeins1942Whitebox/Script_SmokeTest.mjs"]],
  EnemyRearCommand: [["EnemyRearCommand/Script_SmokeTest.mjs"]],
  FrontierDrop: [["FrontierDrop/Script_SmokeTest.mjs"]],
  FrontierDrop3D: [["FrontierDrop3D/Script_SmokeTest3D.mjs"]],
  HiddenFront1942: [["HiddenFront1942/Script_SmokeTest.mjs"]],
  LastSurvivor1942: [["LastSurvivor1942/Script_SmokeTest.mjs"]],
  MountainEmber1941: [["MountainEmber1941/Script_SmokeTest.mjs"]],
  PrairieFire1937: [["PrairieFire1937/Script_SmokeTest.mjs"]],
  qinyuan: [["qinyuan/smoke-test.mjs"]],
  ReedSignal1942: [["ReedSignal1942/Script_SmokeTest.mjs"]],
  ResistanceNetwork: [["ResistanceNetwork/SmokeTest.mjs"]],
  StudioSurvival: [["StudioSurvival/Script_SmokeTest.mjs"]],
  TaierzhuangMuseum: [["TaierzhuangMuseum/Script_SmokeTest.mjs"]],
  TaihangLetters1942: [["TaihangLetters1942/Script_SmokeTest.mjs"]],
  TaihangSignal1942: [["TaihangSignal1942/Script_SmokeTest.mjs"]],
  TunnelBell1942: [["TunnelBell1942/Script_SmokeTest.mjs"]],
  TunnelFront1942: [["TunnelFront1942/Script_SmokeTest.mjs"]],
  TunnelHeart1942: [["TunnelHeart1942/Script_SmokeTest.mjs"]],
  TunnelLight1943: [
    ["TunnelLight1943/Script_SmokeTest.mjs"],
    ["TunnelLight1943/Script_SceneAudit.mjs", "--quiet"],
  ],
  ValiantFarm1914: [["ValiantFarm1914/Script_SmokeTest.mjs"]],
  "TaihangDemo/Dihou1939": [["TaihangDemo/Dihou1939/Script_SmokeTest.mjs"]],
  "TaihangDemo/EnemyRear1941": [
    ["TaihangDemo/EnemyRear1941/Script_SmokeTest.mjs"],
    ["TaihangDemo/EnemyRear1941/Script_HistorySmokeTest.mjs"],
    ["TaihangDemo/EnemyRear1941/Script_ModelSmokeTest.mjs"],
    ["TaihangDemo/EnemyRear1941/Script_World3DSmokeTest.mjs"],
    ["TaihangDemo/EnemyRear1941/Script_DesktopSmokeTest.mjs"],
  ],
  "TaihangDemo/PeopleWar": [
    ["TaihangDemo/PeopleWar/Script_RuleSmokeTest.mjs"],
    ["TaihangDemo/PeopleWar/Script_UiSmokeTest.mjs"],
  ],
  "TaihangDemo/ResistanceCommand1937": [["TaihangDemo/ResistanceCommand1937/Script_SmokeTest.mjs"]],
};

function GitLines(args) {
  const result = spawnSync("git", args, { cwd: repoRoot, encoding: "utf8", windowsHide: true });
  if (result.status !== 0) throw new Error((result.stderr || result.stdout || "git 失败").trim());
  return result.stdout.split(/\r?\n/).map((line) => line.trim().replaceAll("\\", "/")).filter(Boolean);
}

export function CollectChangedFiles(base = "origin/master") {
  return [...new Set([
    ...GitLines(["diff", "--name-only", `${base}...HEAD`]),
    ...GitLines(["diff", "--name-only", "HEAD"]),
    ...GitLines(["ls-files", "--others", "--exclude-standard"]),
  ])].sort();
}

export function SelectProjects(files) {
  const keys = Object.keys(projectCommands).sort((left, right) => right.length - left.length);
  const selected = new Set();
  for (const rawFile of files) {
    const file = rawFile.replaceAll("\\", "/");
    const key = keys.find((candidate) => file === candidate || file.startsWith(`${candidate}/`));
    if (key) selected.add(key);
  }
  return keys.filter((key) => selected.has(key));
}

function ParseArgs(argv) {
  const opts = { base: "origin/master", all: false, dryRun: false };
  for (const raw of argv) {
    if (raw === "--all") opts.all = true;
    else if (raw === "--dry-run") opts.dryRun = true;
    else if (raw.startsWith("--changed=")) opts.base = raw.slice("--changed=".length) || "origin/master";
    else throw new Error(`未知参数：${raw}`);
  }
  return opts;
}

function RunNode(args, dryRun) {
  console.log(`[projects] ${dryRun ? "计划" : "运行"}：node ${args.join(" ")}`);
  if (dryRun) return 0;
  const result = spawnSync(process.execPath, args, { cwd: repoRoot, stdio: "inherit", windowsHide: true });
  return result.status ?? 1;
}

function ValidateCommands() {
  for (const [project, commands] of Object.entries(projectCommands)) {
    if (!commands.length) throw new Error(`${project} 没有测试命令`);
    for (const [file] of commands) {
      if (!fs.existsSync(path.join(repoRoot, file))) throw new Error(`${project} 测试文件不存在：${file}`);
    }
  }
}

export function Main(argv = process.argv.slice(2)) {
  ValidateCommands();
  const opts = ParseArgs(argv);
  const changedFiles = opts.all ? [] : CollectChangedFiles(opts.base);
  const selectedProjects = opts.all ? Object.keys(projectCommands) : SelectProjects(changedFiles);
  const taierzhuangChanged = opts.all || changedFiles.some((file) => file.replaceAll("\\", "/").startsWith("Taierzhuang1938/"));

  console.log(`[projects] ${opts.all ? "全仓冒烟" : `Git 改动 ${changedFiles.length} 个`}；命中项目 ${selectedProjects.length + (taierzhuangChanged ? 1 : 0)} 个`);
  if (!selectedProjects.length && !taierzhuangChanged) {
    console.log("[projects] 没有命中带测试的游戏项目");
    return 0;
  }

  if (taierzhuangChanged) {
    const args = ["Taierzhuang1938/Script_TestRunner.mjs"];
    if (opts.all) args.push("--profile=full");
    else args.push(`--changed=${opts.base}`, "--profile=quick", "--fail-fast");
    const code = RunNode(args, opts.dryRun);
    if (code !== 0) return code;
  }

  for (const project of selectedProjects) {
    for (const command of projectCommands[project]) {
      const code = RunNode(command, opts.dryRun);
      if (code !== 0) return code;
    }
  }
  return 0;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileHere;
if (isMain) {
  try {
    process.exitCode = Main();
  } catch (error) {
    console.error(`[projects] ${error.message}`);
    process.exitCode = 2;
  }
}
