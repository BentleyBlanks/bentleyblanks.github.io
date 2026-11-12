// Pages 发布包瘦身：git archive 出来的整站里删掉网页不会加载的源文件、草稿与工具目录，再报体积、超预算就失败。
//
// 为什么：发布流程把整个网站仓库原样打包，源文件（FBX / TGA / Blender）、开发文档、概念图也一起上了线，
// 发布包 2.66 GB，GitHub Pages 规定发布的站点不超过 1 GB（https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits）。
// 删的只是发布包里的副本，仓库里的文件不动。
//
//   node scripts/Script_PublishPrune.mjs <站点目录>                 删掉清单里的路径，打印每一项省了多少
//   node scripts/Script_PublishPrune.mjs --report <站点目录>        报总大小；超过 PUBLISH_BUDGET_MIB 就失败，超过 1 GB 发警告
//   node scripts/Script_PublishPrune.mjs --check                    先跑瘦身回归，再核仓库清单：每一项都还在，运行代码没有去「加载」这些路径
//
// 要从发布包里拿掉一类东西：先确认没有页面加载它（--check 会扫 fetch / import / new URL / loader.load 这类加载写法），
// 再在 PUBLISH_EXCLUDE 加一行写清理由。要用的东西放进这些目录，线上就是 404。
// Taierzhuang1938/docs/ 留着：台儿庄资料馆（TaierzhuangMuseum）的「主要底本」直接链到那里的 Markdown。

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { IsPublishedSource } from "./Script_PublishScope.mjs";

/** 不进发布包的路径（相对仓库根；以 / 结尾的是目录，带 * 的是通配）。 */
export const PUBLISH_EXCLUDE = Object.freeze([
  { path: "Taierzhuang1938/_import/", why: "滕县导入管线工作区：FBX / TGA / 二进制源文件、烘焙脚本与记录，网页不加载" },
  { path: "Taierzhuang1938/_blender/", why: "滕县 Blender 构建脚本与中间文件" },
  { path: "Taierzhuang1938/AdvancedTools/", why: "已拆出游戏的高级工具与本地控制中心：只在本地预览使用；游戏里它们的入口由 Script_DevToolsSplit 的剔除版去掉，index.html 的 import map 条目在下面 StripAdvancedToolsImports 里一并摘掉" },
  { path: "TunnelLight1943/StyleConceptShots/", why: "地道里的光的风格概念图与两个 zip 包，没有页面引用" },
  { path: "Model/StrawSleepingMat/Source/", why: "随身草席的 Blender 源文件" },
  { path: "Taierzhuang1938/Model/TrainReference/Reference/", why: "火车参考图" },
  { path: "Taierzhuang1938/Model/Character/Model_TengxianLuoReference.glb", why: "未接入运行时的旧罗班长参考模型；现用 Model_SquadLeaderLuo.glb 保留" },
  { path: "Taierzhuang1938/Model/Character/Model_TengxianCivilianWomanReference.glb", why: "未接入运行时的独立村妇参考模型，保留在仓库供制作使用" },
  { path: "Model/PatchedTimberBed/Texture_*Source.png", why: "木床制作源图；运行时 GLB 已内嵌成品贴图，不读这些源图" },
  { path: "Taierzhuang1938/Model/SichuanBlanketPack/Texture_Sichuan*.png", why: "背包烘焙源图；运行时 glTF 只读 Texture_ProjectedV13_*.webp 成品" },
  { path: "Taierzhuang1938/Model/Donkey/Texture_*", why: "驴的制作贴图副本；运行时 GLB 已内嵌全部成品贴图，无外链图片" },
  { path: "Taierzhuang1938/Model/DonkeyCart/Texture_*", why: "驴车的制作贴图副本；运行时 GLB 已内嵌全部成品贴图，无外链图片" },
  { path: "**/*.blend", why: "Blender 工程文件，浏览器不读" },
]);

/** 发布包（站点目录原始字节）上限，单位 MiB。只降不升：每做完一步瘦身就把它压到新体积上面一点。 */
export const PUBLISH_BUDGET_MIB = 2000;
/** GitHub Pages 规定的发布站点上限。 */
const PAGES_LIMIT_MIB = 1024;

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
// 通配转正则：** 跨目录、* 不跨目录（逐段替换，免得 ** 换出来的 .* 又被 * 那一步改坏）。
const Esc = (s) => s.replace(/[.+^${}()|[\]\\?]/g, "\\$&");
const Glob = (pattern) => new RegExp(`^${pattern.split("**/").map((a) => a.split("**").map((b) => b.split("*").map(Esc).join("[^/]*")).join(".*")).join("(?:.*/)?")}$`);
const MiB = (bytes) => (bytes / 1048576).toFixed(1);

function Walk(dir, visit, rel = "") {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const relPath = rel ? `${rel}/${entry.name}` : entry.name;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) { if (visit(relPath, full, true) !== false) Walk(full, visit, relPath); }
    else visit(relPath, full, false);
  }
}
function SizeOf(full) {
  const stat = fs.statSync(full);
  if (!stat.isDirectory()) return stat.size;
  let total = 0;
  Walk(full, (_, f, isDir) => { if (!isDir) total += fs.statSync(f).size; });
  return total;
}

/** 发布副本的 index.html import map 里去掉指向 AdvancedTools/ 的条目（目录已不在发布包里，留着会让盖戳报「找不到文件」）。 */
export function StripAdvancedToolsImports(siteDir) {
  const file = path.join(siteDir, "Taierzhuang1938/index.html");
  if (!fs.existsSync(file)) return 0;
  const html = fs.readFileSync(file, "utf8");
  let removed = 0;
  const next = html.replace(/^[ \t]*"\.\/AdvancedTools\/[^"]+":[ \t]*"[^"]*",?[ \t]*\r?\n/gm, () => { removed += 1; return ""; });
  if (removed) {
    const map = next.match(/<script type="importmap">([\s\S]*?)<\/script>/);
    JSON.parse(map[1]);
    fs.writeFileSync(file, next);
  }
  return removed;
}

/** 在站点目录里删掉清单上的路径，返回 [{ entry, bytes, files }]。 */
export function Prune(siteDir) {
  const results = [];
  for (const entry of PUBLISH_EXCLUDE) {
    let bytes = 0, files = 0;
    if (!entry.path.includes("*")) {
      const target = path.join(siteDir, entry.path);
      if (fs.existsSync(target)) {
        bytes = SizeOf(target);
        if (fs.statSync(target).isDirectory()) Walk(target, (_, f, isDir) => { if (!isDir) files += 1; });
        else files = 1;
        fs.rmSync(target, { recursive: true, force: true });
      }
    } else {
      const re = Glob(entry.path);
      const hits = [];
      Walk(siteDir, (rel, full, isDir) => { if (!isDir && re.test(rel)) hits.push(full); });
      for (const f of hits) { bytes += fs.statSync(f).size; files += 1; fs.rmSync(f, { force: true }); }
    }
    results.push({ entry, bytes, files });
  }
  StripAdvancedToolsImports(siteDir);
  return results;
}

/** 站点目录的总字节数。 */
export function SiteBytes(siteDir) { return SizeOf(siteDir); }

/** 在仓库里核清单：每一项都还在；运行代码（网页、JS 模块，不含测试 / 工具 / 被拿掉的目录本身）没有去加载这些路径。 */
export function CheckRepo({ root = repoRoot, tracked = null, runtimeFilter = () => true } = {}) {
  const problems = [];
  tracked ??= execFileSync("git", ["ls-files"], { cwd: root, encoding: "utf8" }).split("\n").filter(Boolean);
  const excluded = PUBLISH_EXCLUDE.map((e) => (e.path.includes("*") ? Glob(e.path) : null));
  const IsExcluded = (file) => PUBLISH_EXCLUDE.some((e, i) => (excluded[i] ? excluded[i].test(file)
    : e.path.endsWith("/") ? file.startsWith(e.path) : file === e.path));
  for (const [i, e] of PUBLISH_EXCLUDE.entries()) {
    const hit = excluded[i] ? tracked.some((f) => excluded[i].test(f))
      : tracked.some((f) => e.path.endsWith("/") ? f.startsWith(e.path) : f === e.path);
    if (!hit) problems.push(`清单里的 ${e.path} 在仓库里已经没有了，删掉这一行`);
  }
  const prefixes = PUBLISH_EXCLUDE.filter((e) => !e.path.includes("*")).map((e) => e.path);
  const tails = prefixes.map((p) => p.split("/").filter(Boolean).slice(1).join("/")).filter(Boolean);
  // 文件规则（含通配）也要拦：文件名常先写进常量，再由 loader 加载；glTF 的 uri 同样会被浏览器读取。
  const fileNames = [...new Set(tracked.filter((f) => IsExcluded(f) && PUBLISH_EXCLUDE.some((e, i) =>
    !e.path.endsWith("/") && (excluded[i] ? excluded[i].test(f) : f === e.path))).map((f) => path.posix.basename(f)))];
  const fileReference = fileNames.length ? new RegExp(fileNames.map(Esc).join("|")) : null;
  const LOAD = /(fetch\(|import\(|new URL\(|\.load(?:Async)?\(|src\s*=|href\s*=|<script[^>]*src=|<link[^>]*href=)/;
  const runtime = tracked.filter((f) => runtimeFilter(f) && /\.(html|mjs|js|css|gltf)$/.test(f) && !IsExcluded(f)
    && !/(Test|Probe|Shot|Cli|Bake|Audit|Bench|Build|Export|Author|Verify|Migrate)[A-Za-z0-9_]*\.(mjs|js)$/.test(f) && !f.startsWith("scripts/") && !f.includes("/_shots/"));
  for (const file of runtime) {
    const lines = fs.readFileSync(path.join(root, file), "utf8").split(/\r?\n/);
    lines.forEach((line, index) => {
      const code = line.replace(/\/\/.*$/, "").trim();
      if (!code || code.startsWith("*")) return;
      const reference = fileReference && code.match(fileReference);
      if (reference) problems.push(`${file}:${index + 1} 引用了不进发布包的 ${reference[0]}：${code.slice(0, 120)}`);
      if (!LOAD.test(code)) return;
      for (const tail of tails) if (code.includes(`${tail}/`)) problems.push(`${file}:${index + 1} 看起来在加载 ${tail}/ 里的文件，而它不进发布包：${code.slice(0, 120)}`);
    });
  }
  return problems;
}

function Main(argv) {
  if (argv[0] === "--check") {
    // CI 已在裁剪前调用 --check；把回归放在同一入口，手工运行也不会漏掉。
    execFileSync(process.execPath, [path.join(repoRoot, "scripts/Script_PublishPruneTest.mjs")], { stdio: "inherit" });
    const problems = CheckRepo({ runtimeFilter: IsPublishedSource });
    if (problems.length) { console.error(`[publish] 发布包清单：${problems.length} 处要看\n  ${problems.join("\n  ")}`); process.exit(1); }
    console.log(`[publish] 发布包清单：${PUBLISH_EXCLUDE.length} 项都还在，运行代码没有加载它们`);
    return;
  }
  if (argv[0] === "--report") {
    const siteDir = path.resolve(argv[1] || "");
    const bytes = SiteBytes(siteDir);
    const mib = bytes / 1048576;
    console.log(`[publish] 发布包 ${MiB(bytes)} MiB（预算 ${PUBLISH_BUDGET_MIB} MiB，GitHub Pages 上限 ${PAGES_LIMIT_MIB} MiB）`);
    if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### Publication size\n\n${MiB(bytes)} MiB (budget ${PUBLISH_BUDGET_MIB} MiB, Pages limit ${PAGES_LIMIT_MIB} MiB)\n`);
    if (mib > PAGES_LIMIT_MIB) console.log(`::warning title=Publication over the Pages limit::${MiB(bytes)} MiB > ${PAGES_LIMIT_MIB} MiB (see scripts/Script_PublishPrune.mjs)`);
    if (mib > PUBLISH_BUDGET_MIB) { console.error(`::error title=Publication over budget::${MiB(bytes)} MiB > ${PUBLISH_BUDGET_MIB} MiB. 有人把大文件放进了发布包：放进 PUBLISH_EXCLUDE 的目录或压小，别抬预算。`); process.exit(1); }
    return;
  }
  const siteDir = path.resolve(argv[0] || "");
  if (!argv[0] || !fs.existsSync(siteDir)) { console.error("用法：node scripts/Script_PublishPrune.mjs <站点目录> | --report <站点目录> | --check"); process.exit(2); }
  if (path.resolve(siteDir) === repoRoot) { console.error("[publish] 拒绝在仓库本身上删文件：只对 git archive 出来的发布目录用"); process.exit(2); }
  let total = 0;
  for (const { entry, bytes, files } of Prune(siteDir)) {
    total += bytes;
    console.log(`[publish] -${MiB(bytes).padStart(7)} MiB  ${String(files).padStart(5)} 个文件  ${entry.path}（${entry.why}）`);
  }
  console.log(`[publish] 共省 ${MiB(total)} MiB`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) Main(process.argv.slice(2));
