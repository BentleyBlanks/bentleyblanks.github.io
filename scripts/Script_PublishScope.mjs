// Pages 只发布当前滕县工程；其他项目和完整历史继续留在 Git 与本地预览。
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export const PUBLISH_SOURCE_PATHS = Object.freeze([
  "Taierzhuang1938",
  "Model/StrawSleepingMat/Model_StrawSleepingMatFlat.glb",
  "Model/StrawSleepingMat/Model_StrawSleepingMatRolled.glb",
]);
const rootFiles = new Set(["index.html", "404.html", ".nojekyll", "Data_Publication.json"]);
export function IsPublishedSource(file) {
  return file.startsWith("Taierzhuang1938/") || PUBLISH_SOURCE_PATHS.slice(1).includes(file);
}
export function IsPublishedPath(file) {
  return rootFiles.has(file) || IsPublishedSource(file) || /^Model\/StrawSleepingMat\/Model_StrawSleepingMat(?:Flat|Rolled)_Publish[a-f0-9]{24}\.glb$/.test(file);
}
export function PublicationHome() {
  return `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>台儿庄：血战滕县</title><meta http-equiv="refresh" content="0;url=/Taierzhuang1938/">
<script>location.replace('/Taierzhuang1938/' + location.search + location.hash);</script>
</head><body><a href="/Taierzhuang1938/">进入《台儿庄：血战滕县》</a></body></html>\n`;
}
function Files(dir, relative = "") {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const file = relative ? `${relative}/${entry.name}` : entry.name;
    if (entry.isSymbolicLink()) throw Error(`发布目录不允许符号链接：${file}`);
    return entry.isDirectory() ? Files(path.join(dir, entry.name), file) : [file];
  });
}
export function CheckPublication(siteDir) {
  const problems = Files(siteDir).filter(file => !IsPublishedPath(file)).map(file => `不应发布：${file}`);
  const mapFile=path.join(siteDir,'Taierzhuang1938/Data_AssetPublishRuntime.mjs');
  const models=fs.existsSync(mapFile)?JSON.parse(fs.readFileSync(mapFile,'utf8').match(/=\s*([\s\S]*);\s*$/)[1]):{};
  for (const file of ["Taierzhuang1938/index.html", ...PUBLISH_SOURCE_PATHS.slice(1).map(file=>models[file]||file), ...rootFiles]) {
    if (!fs.existsSync(path.join(siteDir, file))) problems.push(`发布文件缺失：${file}`);
  }
  if (fs.existsSync(path.join(siteDir, "index.html")) && fs.readFileSync(path.join(siteDir, "index.html"), "utf8") !== PublicationHome())
    problems.push("线上首页必须直接进入滕县，不能发布本地项目索引");
  return problems;
}
export function ScopePublication(siteDir, { revision = "local" } = {}) {
  siteDir = path.resolve(siteDir);
  const repoRoot = path.resolve(import.meta.dirname, "..");
  const relative = path.relative(siteDir, repoRoot);
  if (!relative || (!relative.startsWith(".." + path.sep) && relative !== ".." && !path.isAbsolute(relative)) || fs.existsSync(path.join(siteDir, ".git")))
    throw Error("只允许裁剪独立的发布副本，拒绝仓库、worktree 或其上级目录");
  if (!fs.existsSync(path.join(siteDir, "Taierzhuang1938/index.html"))) throw Error("不是滕县发布副本");
  let removedBytes = 0;
  for (const file of Files(siteDir)) {
    if (IsPublishedPath(file)) continue;
    const target = path.resolve(siteDir, file);
    if (!target.startsWith(siteDir + path.sep)) throw Error("发布路径越界");
    removedBytes += fs.statSync(target).size;
    fs.unlinkSync(target);
  }
  const RemoveEmpty = dir => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const target = path.join(dir, entry.name);
      RemoveEmpty(target);
      if (!fs.readdirSync(target).length) fs.rmdirSync(target);
    }
  };
  RemoveEmpty(siteDir);
  fs.writeFileSync(path.join(siteDir, "index.html"), PublicationHome());
  fs.writeFileSync(path.join(siteDir, ".nojekyll"), "");
  fs.writeFileSync(path.join(siteDir, "404.html"), '<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>页面未发布</title><p>此站点仅发布《台儿庄：血战滕县》。</p><a href="/Taierzhuang1938/">进入游戏</a></html>\n');
  fs.writeFileSync(path.join(siteDir, "Data_Publication.json"), JSON.stringify({ project: "Taierzhuang1938", revision, sourcePaths: PUBLISH_SOURCE_PATHS }, null, 2) + "\n");
  const problems = CheckPublication(siteDir);
  if (problems.length) throw Error(problems.join("\n"));
  return { removedBytes };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const check = process.argv[2] === "--check", siteDir = process.argv[check ? 3 : 2];
  if (!siteDir) throw Error("用法：node scripts/Script_PublishScope.mjs [--check] <发布副本>");
  if (check) {
    const problems = CheckPublication(path.resolve(siteDir));
    if (problems.length) throw Error(problems.join("\n"));
    console.log("[publish] 发布范围通过：仅滕县、两件共用草席模型与站点入口");
  } else {
    const revision = execFileSync("git", ["rev-parse", "HEAD"], { cwd: path.resolve(import.meta.dirname, ".."), encoding: "utf8" }).trim();
    console.log("[publish]", ScopePublication(siteDir, { revision }));
  }
}
