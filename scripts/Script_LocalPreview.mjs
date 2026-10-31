// 全仓库本地预览服：把整棵树按「线上同款路径」跑在 127.0.0.1 上，
// 用来先本地验收、再推 master —— 省掉每次都等 Pages 打包上传那几分钟。
//
// 用法：
//   node scripts/Script_LocalPreview.mjs             # 服务本脚本所在的那棵树
//   node scripts/Script_LocalPreview.mjs 8090        # 换端口
//   node scripts/Script_LocalPreview.mjs --lan       # 同时监听局域网（手机上验收）
//   node scripts/Script_LocalPreview.mjs --open      # 明确要求打开浏览器（默认不打开）
//   node scripts/Script_LocalPreview.mjs --no-open   # 强制不打开，兼容旧调用
//
// 为什么不是 `python -m http.server`：
//   1. Windows 注册表把 .js 映射成 text/plain，ES module 一加载就炸；这里带
//      一张显式 MIME 表（含 .wasm/.glb/.pck，Godot 与 three 的产物都要）。
//   2. 它不支持 Range 请求，序章那些 mp4 拖不动进度条、长 BGM 也没法 seek。
//   3. 它会走浏览器缓存，改完刷新看到的还是旧的。这里一律 no-store。
//
// 响应头刻意跟线上保持一致（**不**发 COOP/COEP）：本地能跑而线上跑不了的东西，
// 本地预览就白做了。唯一例外是 HTML 带 `Document-Policy: js-profiling`：只打开浏览器的
// JS 采样接口给开发工具用（滕县 Profiler 的「采样」页），不改变游戏本身能做什么。
//
// 只在回环上可写的本地口（线上 Pages 没有，编辑器自动退化）：
//   /__tuning/*   敌军 AI 编辑器把滑杆的数存回 Data_Tuning_*.mjs（docs/Data_EnemyAi.md §14.3）；
//   /__blockout/* 白盒关卡编辑器把配置存回 Taierzhuang1938/Blockout/<Level>.json
//                 （Taierzhuang1938/docs/Data_EditorBlockout.md §7；另查 Host / Origin / Content-Type 与版本号）。
//
// 首页 http://127.0.0.1:<port>/__preview/ 是一个索引页：列出这棵树里所有
// 带 index.html 的页面（按改动时间排序），并且能一键把任意 worktree 挂到
// 相邻端口上 —— 同一个进程内多开几个 server，各自服务自己的根，
// 这样每棵树里的绝对路径（/Taierzhuang1938/…）都还是对的。
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { createHash } from "node:crypto";
import { execFileSync, spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
// 敌军 AI 编辑器的「保存到源码」（docs/Data_EnemyAi.md §14.3）。改写器是纯 Node、
// 不认识 http：这一层只负责回环校验、白名单与原子写回。
import { ApplyTuningChanges, TUNING_FILE_RE } from "../Taierzhuang1938/Script_TuningWriter.mjs";
import { HandleTextureImportRequest } from "../Taierzhuang1938/Script_TextureImportServer.mjs";
// 白盒关卡编辑器的「记下当前机位」。配置模块是纯的（node 与浏览器共用），导入时不抛错：
//   GET  /__blockout/status → { writable, root, revisions: { <Level>: sha1 | null } }
//   POST /__blockout/save   { level, doc, revision } → 写 Taierzhuang1938/Blockout/<Level>.json
import { BLOCKOUT_LEVEL_KEYS, BLOCKOUT_CONFIG_FILE_RE, BlockoutConfigPath, ValidateBlockout } from "../Taierzhuang1938/Script_EditorBlockoutConfig.mjs";
// 场景编辑器的存盘（Taierzhuang1938/docs/Data_Scene.md）。同白盒那套闸，只认 SCENE_IDS 里的场景、只写场景 JSON（高度图 v1 不开放写）：
//   GET  /__scene/status → { writable, root, revisions: { <SceneId>: sha1 | null } }
//   POST /__scene/save   { scene, doc, revision } → 写 Taierzhuang1938/Scenes/<SceneId>/Scene_<SceneId>.json
import { SCENE_IDS, SCENE_FILE_RE, SceneRepoPath, ValidateScene, FormatSceneJson } from "../Taierzhuang1938/Script_SceneDoc.mjs";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT = path.resolve(SCRIPT_DIR, "..");
const APP_ID = "BlanksLocalPreview";

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".htm": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".cjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".csv": "text/csv; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".ico": "image/x-icon",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".ogg": "audio/ogg",
  ".m4a": "audio/mp4",
  ".flac": "audio/flac",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  // Godot / Emscripten 产物：.wasm 的 MIME 送错，streaming 编译会直接拒绝。
  ".wasm": "application/wasm",
  ".pck": "application/octet-stream",
  ".data": "application/octet-stream",
  ".glb": "model/gltf-binary",
  ".gltf": "model/gltf+json",
  ".bin": "application/octet-stream",
};

// 索引页扫描时跳过的目录：博客年份目录、样式/脚本资源目录、以及各项目的
// 下划线私有目录（_dev/_shots/…）。跳过只影响「列不列出来」，直接敲 URL 一样能访问。
const SKIP_DIRS = new Set([
  ".git", ".github", ".claude", "node_modules",
  "css", "js", "img", "images", "assets", "highlight", "fonts",
  "tags", "archives", "page",
  "2014", "2015", "2016", "2017", "2018", "2019",
]);

// ---------------------------------------------------------------- 静态服

function SendFile(request, response, filePath, stat) {
  const headers = {
    "Content-Type": MIME[path.extname(filePath).toLowerCase()] ?? "application/octet-stream",
    // 本地预览的全部意义就是「改完刷新立刻看到」，所以永远不缓存。
    "Cache-Control": "no-store",
    "Accept-Ranges": "bytes",
  };
  // 唯一一处与线上不同的响应头：只开 JS 采样接口（滕县 Profiler 面板「采样」页的
  // `new Profiler()`，见 Taierzhuang1938/Script_ProfilerSampler.mjs）。它不改变页面能做什么，
  // 只是让开发期能在游戏里做函数级采样；Pages 发不了这个头，线上那一页显示「不可用」。
  if (/\.html?$/i.test(filePath)) headers["Document-Policy"] = "js-profiling";
  const range = request.headers.range;
  if (range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (!match || (!match[1] && !match[2])) {
      response.writeHead(416, { ...headers, "Content-Range": `bytes */${stat.size}` }).end();
      return;
    }
    const start = match[1] ? Number(match[1]) : Math.max(0, stat.size - Number(match[2]));
    const end = match[1] ? (match[2] ? Math.min(Number(match[2]), stat.size - 1) : stat.size - 1) : stat.size - 1;
    if (start > end || start >= stat.size) {
      response.writeHead(416, { ...headers, "Content-Range": `bytes */${stat.size}` }).end();
      return;
    }
    response.writeHead(206, {
      ...headers,
      "Content-Range": `bytes ${start}-${end}/${stat.size}`,
      "Content-Length": end - start + 1,
    });
    if (request.method === "HEAD") { response.end(); return; }
    fs.createReadStream(filePath, { start, end }).pipe(response);
    return;
  }
  response.writeHead(200, { ...headers, "Content-Length": stat.size });
  if (request.method === "HEAD") { response.end(); return; }
  fs.createReadStream(filePath).pipe(response);
}

function SendDirectoryIndex(response, rootDir, route, dirPath) {
  let entries = [];
  try { entries = fs.readdirSync(dirPath, { withFileTypes: true }); } catch { /* ignore */ }
  const rows = entries
    .filter((entry) => !entry.name.startsWith("."))
    .sort((a, b) => (Number(b.isDirectory()) - Number(a.isDirectory())) || a.name.localeCompare(b.name))
    .map((entry) => {
      const href = route.replace(/\/$/, "") + "/" + encodeURIComponent(entry.name) + (entry.isDirectory() ? "/" : "");
      return `<li><a href="${href}">${EscapeHtml(entry.name)}${entry.isDirectory() ? "/" : ""}</a></li>`;
    })
    .join("\n");
  response.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
  response.end(PageShell(EscapeHtml(route), `
    <h1>${EscapeHtml(route)}</h1>
    <p class="dim">${EscapeHtml(rootDir)}</p>
    <ul class="plain">${route === "/" ? "" : `<li><a href="../">../</a></li>`}${rows}</ul>
    <p><a href="/__preview/">← 回索引</a></p>`));
}

// ------------------------------------------------------------- 索引页数据

function CollectPages(rootDir) {
  const found = [];
  const Push = (relative, indexFile) => {
    let mtime = 0;
    try { mtime = fs.statSync(indexFile).mtimeMs; } catch { /* ignore */ }
    found.push({ relative, mtime, depth: relative.split("/").length });
  };
  let top = [];
  try { top = fs.readdirSync(rootDir, { withFileTypes: true }); } catch { return found; }
  for (const entry of top) {
    if (!entry.isDirectory()) continue;
    if (entry.name.startsWith(".") || entry.name.startsWith("_") || SKIP_DIRS.has(entry.name)) continue;
    const dir = path.join(rootDir, entry.name);
    if (fs.existsSync(path.join(dir, "index.html"))) Push(entry.name, path.join(dir, "index.html"));
    // 再往下探一层，TaihangDemo/EnemyRear1941 这种子页面才露得出来。
    let sub = [];
    try { sub = fs.readdirSync(dir, { withFileTypes: true }); } catch { continue; }
    for (const child of sub) {
      if (!child.isDirectory()) continue;
      if (child.name.startsWith(".") || child.name.startsWith("_") || SKIP_DIRS.has(child.name)) continue;
      const childIndex = path.join(dir, child.name, "index.html");
      if (fs.existsSync(childIndex)) Push(`${entry.name}/${child.name}`, childIndex);
    }
  }
  found.sort((a, b) => b.mtime - a.mtime);
  return found;
}

function CollectWorktrees(rootDir) {
  let raw = "";
  try {
    raw = execFileSync("git", ["worktree", "list", "--porcelain"], { cwd: rootDir, encoding: "utf8" });
  } catch { return []; }
  const trees = [];
  let current = null;
  for (const line of raw.split(/\r?\n/)) {
    if (line.startsWith("worktree ")) {
      current = { dir: path.resolve(line.slice(9)), branch: "" };
      trees.push(current);
    } else if (current && line.startsWith("branch ")) {
      current.branch = line.slice(7).replace("refs/heads/", "");
    } else if (current && line === "detached") {
      current.branch = "(detached)";
    }
  }
  // `git worktree list` 的第一条永远是主检出 —— 别拿路径去猜：AGENTS.md 规定的
  // 那批外部 worktree（Program\bentleyblanks_Codex_… ）不在 .claude/worktrees/ 底下，
  // 按路径判会把它们也认成主检出，然后一起挤在 `__main` 这个名字上。
  const taken = new Set();
  trees.forEach((tree, index) => {
    tree.isMain = index === 0;
    let name = tree.isMain ? "__main" : path.basename(tree.dir);
    while (taken.has(name)) name += "_";
    taken.add(name);
    tree.name = name;
    try { tree.mtime = fs.statSync(tree.dir).mtimeMs; } catch { tree.mtime = 0; }
  });
  trees.sort((a, b) => (Number(b.isMain) - Number(a.isMain)) || (b.mtime - a.mtime));
  return trees;
}

// ------------------------------------------------------------------- HTML

function EscapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[c]);
}

function Ago(mtime) {
  if (!mtime) return "";
  const minutes = Math.floor((Date.now() - mtime) / 60000);
  if (minutes < 1) return "刚刚";
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} 天前`;
  return `${Math.floor(days / 30)} 个月前`;
}

function PageShell(title, body) {
  return `<!doctype html><html lang="zh"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title><link rel="icon" href="/favicon.ico">
<style>
:root{color-scheme:dark}
body{margin:0;padding:28px 32px 60px;background:#12131a;color:#e6e6ee;
     font:15px/1.6 "Segoe UI","Microsoft YaHei",system-ui,sans-serif}
a{color:#8fd0ff;text-decoration:none}a:hover{text-decoration:underline}
h1{font-size:20px;margin:0 0 4px}
h2{font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:#7d8296;margin:30px 0 12px;font-weight:600}
.dim{color:#7d8296;font-size:13px;margin:0}
.bar{display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin:18px 0 0}
input[type=search]{flex:1;min-width:220px;background:#1c1e29;border:1px solid #2c2f3d;border-radius:8px;
  padding:9px 12px;color:#e6e6ee;font:14px/1 inherit;outline:none}
input[type=search]:focus{border-color:#4a7fa8}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(270px,1fr));gap:8px;margin:0;padding:0;list-style:none}
.grid li a{display:flex;justify-content:space-between;gap:10px;align-items:baseline;
  background:#1a1c26;border:1px solid #262936;border-radius:8px;padding:10px 13px}
.grid li a:hover{background:#222532;border-color:#3d637d;text-decoration:none}
.grid .sub a{background:#161822;border-style:dashed}
.name{font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.when{color:#6f7488;font-size:12px;flex:none}
.here{border-color:#4a7fa8 !important;background:#1d2733 !important}
ul.plain{list-style:none;padding:0;margin:12px 0}ul.plain li{padding:2px 0}
code{background:#1c1e29;border-radius:4px;padding:1px 6px;font-size:13px}
</style></head><body>${body}</body></html>`;
}

function RenderHub(context) {
  const { rootDir, port, mounts, lanUrls } = context;
  const pages = CollectPages(rootDir);
  const trees = CollectWorktrees(rootDir);
  const rootIndex = fs.existsSync(path.join(rootDir, "index.html"))
    ? `<li data-key="/ 首页 index"><a href="/"><span class="name">/ &nbsp;站点首页</span><span class="when">index.html</span></a></li>`
    : "";
  const pageItems = pages.map((page) => `
    <li class="${page.depth > 1 ? "sub" : ""}" data-key="${EscapeHtml(page.relative.toLowerCase())}">
      <a href="/${page.relative}/"><span class="name">${EscapeHtml(page.relative)}</span><span class="when">${Ago(page.mtime)}</span></a>
    </li>`).join("");
  const treeItems = trees.map((tree) => {
    const mounted = mounts.get(tree.dir);
    const here = tree.dir === rootDir;
    const label = tree.isMain ? "主检出 · master" : tree.name;
    const note = here ? "← 当前" : mounted ? `:${mounted.port}` : (tree.branch || "");
    return `<li data-key="${EscapeHtml((label + " " + tree.branch).toLowerCase())}">
      <a class="${here ? "here" : ""}" href="/__preview/tree/${encodeURIComponent(tree.name)}">
        <span class="name">${EscapeHtml(label)}</span><span class="when">${EscapeHtml(note)}</span></a></li>`;
  }).join("");
  const lanLine = lanUrls.length
    ? `<p class="dim">局域网：${lanUrls.map((u) => `<a href="${u}/__preview/">${u}</a>`).join(" · ")}（手机上验收用）</p>`
    : "";
  return PageShell("本地预览", `
<h1>本地预览 · <span class="dim">${EscapeHtml(path.basename(rootDir))}</span></h1>
<p class="dim">${EscapeHtml(rootDir)} → <code>http://127.0.0.1:${port}/</code> · 不缓存，改完刷新即生效 · 关掉黑窗口就停服</p>
${lanLine}
<div class="bar"><input type="search" id="filter" placeholder="筛选…（按项目名）" autofocus></div>
<h2>页面 · 按最近改动排序</h2>
<ul class="grid" id="pages">${rootIndex}${pageItems}</ul>
<h2>Worktree · 点一下挂到相邻端口</h2>
<ul class="grid" id="trees">${treeItems}</ul>
<script>
const filter = document.getElementById("filter");
filter.addEventListener("input", () => {
  const needle = filter.value.trim().toLowerCase();
  for (const li of document.querySelectorAll("li[data-key]"))
    li.style.display = !needle || li.dataset.key.includes(needle) ? "" : "none";
});
</script>`);
}

// ------------------------------------------------------------------ 端口

function ListenFrom(server, startPort, host) {
  return new Promise((resolve, reject) => {
    let port = startPort;
    const Attempt = () => {
      server.once("error", (error) => {
        if (error.code === "EADDRINUSE" && port < startPort + 60) { port += 1; Attempt(); }
        else reject(error);
      });
      server.listen(port, host, () => resolve(port));
    };
    Attempt();
  });
}

async function ProbeExisting(port) {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/__preview/ping`, { signal: AbortSignal.timeout(800) });
    if (!response.ok) return null;
    const info = await response.json();
    return info.app === APP_ID ? info : null;
  } catch { return null; }
}

// ------------------------------------------------------------------ 主体

const mounts = new Map(); // absRoot -> { port, server }

function CreateServer(rootDir, context) {
  return http.createServer(async (request, response) => {
    const [rawRoute, query] = request.url.split("?");
    let route;
    try { route = decodeURIComponent(rawRoute); } catch { route = rawRoute; }

    if (route === "/__preview/ping") {
      response.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
      response.end(JSON.stringify({ app: APP_ID, root: rootDir, port: context.port }));
      return;
    }
    if (route.startsWith("/__textures/")) { await HandleTextureImportRequest(request, response, rootDir); return; }
    if (route === "/__preview" || route === "/__preview/") {
      response.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
      response.end(RenderHub({ ...context, rootDir, mounts }));
      return;
    }
    if (route.startsWith("/__preview/tree/")) {
      const name = route.slice("/__preview/tree/".length).replace(/\/$/, "");
      const tree = CollectWorktrees(rootDir).find((candidate) => candidate.name === name);
      if (!tree) { response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }).end("no such worktree"); return; }
      const to = new URLSearchParams(query || "").get("to") || "/__preview/";
      let mount = mounts.get(tree.dir);
      if (!mount) {
        // 同进程内多开一个 server，根指向那棵树 —— 每棵树独占一个端口，
        // 页面里的绝对路径（/Taierzhuang1938/…）因此还是对的。
        const childContext = { port: 0, basePort: context.basePort, host: context.host, lanUrls: context.lanUrls };
        const server = CreateServer(tree.dir, childContext);
        const port = await ListenFrom(server, context.basePort + 1, context.host);
        childContext.port = port;
        mount = { port, server };
        mounts.set(tree.dir, mount);
        console.log(`  挂载 ${tree.name} → http://127.0.0.1:${port}/`);
      }
      response.writeHead(302, { Location: `http://127.0.0.1:${mount.port}${to}`, "Cache-Control": "no-store" });
      response.end();
      return;
    }

    // 调参表的读写口（敌军 AI 编辑器；只在回环上可写）。必须排在下面那道
    // 「只收 GET/HEAD」之前 —— 排在后面的话 POST 永远被 405 挡掉。
    if (route === "/__tuning/status") {
      SendJson(response, 200, { writable: IsLoopback(request), root: rootDir });
      return;
    }
    if (route === "/__tuning/save") { await HandleTuningSave(request, response, rootDir); return; }

    // 白盒关卡编辑器的配置存档口，同样排在 405 闸之前。读配置不走端点
    // （编辑器直接 fetch ./Blockout/<Level>.json），status 只报能不能写与各关的版本号。
    // 外面再兜一层：这个口收的是任意 JSON，处理里漏掉的异常一律回 500 JSON，不让它冒出回调带倒整个进程。
    if (route === "/__blockout/status" || route === "/__blockout/save") {
      try {
        if (route === "/__blockout/status") SendBlockoutStatus(request, response, rootDir);
        else await HandleBlockoutSave(request, response, rootDir);
      } catch (error) {
        console.error(`  ${route} 出错：${error?.stack || error}`);
        if (!response.headersSent) SendJson(response, 500, { ok: false, error: `存档口内部出错：${String(error?.message || error).slice(0, 200)}` });
        else if (!response.writableEnded) response.end();
      }
      return;
    }

    if (route === "/__scene/status" || route === "/__scene/save") {
      try {
        if (route === "/__scene/status") SendSceneStatus(request, response, rootDir);
        else await HandleSceneSave(request, response, rootDir);
      } catch (error) {
        console.error(`  ${route} 出错：${error?.stack || error}`);
        if (!response.headersSent) SendJson(response, 500, { ok: false, error: `存档口内部出错：${String(error?.message || error).slice(0, 200)}` });
        else if (!response.writableEnded) response.end();
      }
      return;
    }

    if (request.method !== "GET" && request.method !== "HEAD") { response.writeHead(405).end(); return; }
    const filePath = path.join(rootDir, route);
    if (!filePath.startsWith(rootDir)) { response.writeHead(403).end(); return; }
    fs.stat(filePath, (error, stat) => {
      if (error) {
        response.writeHead(404, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
        response.end(PageShell("404", `<h1>404</h1><p class="dim">${EscapeHtml(route)}</p><p><a href="/__preview/">← 回索引</a></p>`));
        return;
      }
      if (stat.isDirectory()) {
        if (!route.endsWith("/")) {
          response.writeHead(302, { Location: rawRoute + "/" + (query ? "?" + query : "") }).end();
          return;
        }
        const indexFile = path.join(filePath, "index.html");
        fs.stat(indexFile, (indexError, indexStat) => {
          if (indexError) SendDirectoryIndex(response, rootDir, route, filePath);
          else SendFile(request, response, indexFile, indexStat);
        });
        return;
      }
      SendFile(request, response, filePath, stat);
    });
  });
}

// -------------------------------------------------- 调参表保存（只在本地）
//
// 敌军 AI 编辑器拖完滑杆要能存回源码（docs/Data_EnemyAi.md §14.3）：
//   GET  /__tuning/status → { writable: true }
//   POST /__tuning/save   { file: "Taierzhuang1938/Data_Tuning_AiCover.mjs",
//                           changes: [{ path: "COVER.standoffM", value: 0.7 }] }
//                        → { ok: true, applied: 1, changes: [{path, from, to}], missing: [] }
//
// 这是一个**能写用户仓库的端点**，所以四道闸一道都不能省：
//   ① 只接回环地址（`--lan` 起服时局域网上的人拿不到写权限，status 直接回 writable:false）；
//   ② 文件名必须匹配 `Taierzhuang1938/Data_Tuning_*.mjs`（正则本身就排除了 `..`）；
//   ③ 解析出来的绝对路径必须落在这次服务的根之下；
//   ④ body ≤ 256 KB。
// 写回走「先写 .tmp 再 rename」：Ctrl+C 落在写一半的那一瞬时，表要么是旧的要么是新的，
// 不会变成半个文件 —— 那会让整个页面白屏，而且看起来像编辑器把表写坏了。
const TUNING_BODY_LIMIT = 256 * 1024;

function IsLoopback(request) {
  const address = request.socket?.remoteAddress || "";
  return address === "127.0.0.1" || address === "::1" || address === "::ffff:127.0.0.1";
}

function SendJson(response, status, payload) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  response.end(JSON.stringify(payload));
}

// 超限之后**继续把流读完再报错**，不 destroy 请求：半路掐断连接，客户端拿到的是
// 一个 socket 错误而不是那句「body 超过 256 KB」，看起来就像本地服务器崩了。
// 只有夸张到 32 倍上限时才真掐（那已经不是「改错了一个数」，是在灌数据）。
function ReadBody(request, limit) {
  const human = limit >= 1024 * 1024 ? `${Math.round(limit / 1024 / 1024)} MB` : `${Math.round(limit / 1024)} KB`;
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let overflow = false;
    request.on("data", (chunk) => {
      size += chunk.length;
      if (size > limit) {
        overflow = true;
        chunks.length = 0;
        if (size > limit * 32) { request.destroy(); reject(new Error("body 太大")); }
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => {
      if (overflow) reject(new Error(`body 超过 ${human}`));
      else resolve(Buffer.concat(chunks).toString("utf8"));
    });
    request.on("error", reject);
  });
}

async function HandleTuningSave(request, response, rootDir) {
  if (request.method !== "POST") { SendJson(response, 405, { ok: false, error: "只收 POST" }); return; }
  if (!IsLoopback(request)) { SendJson(response, 403, { ok: false, error: "只接受回环地址" }); return; }
  let body;
  try { body = await ReadBody(request, TUNING_BODY_LIMIT); } catch (error) {
    SendJson(response, 400, { ok: false, error: error.message });
    return;
  }
  let payload;
  try { payload = JSON.parse(body); } catch { SendJson(response, 400, { ok: false, error: "body 不是 JSON" }); return; }
  const file = payload && typeof payload.file === "string" ? payload.file : "";
  if (!TUNING_FILE_RE.test(file)) {
    SendJson(response, 403, { ok: false, error: "file 必须是 Taierzhuang1938/Data_Tuning_*.mjs" });
    return;
  }
  if (!Array.isArray(payload.changes) || payload.changes.length === 0) {
    SendJson(response, 400, { ok: false, error: "changes 要是非空数组" });
    return;
  }
  const filePath = path.resolve(rootDir, file);
  if (filePath !== path.join(rootDir, file) || !filePath.startsWith(rootDir + path.sep)) {
    SendJson(response, 403, { ok: false, error: "路径不在服务根之下" });
    return;
  }
  let source;
  try { source = fs.readFileSync(filePath, "utf8"); } catch {
    SendJson(response, 400, { ok: false, error: `这棵树里没有 ${file}` });
    return;
  }
  try {
    const result = ApplyTuningChanges(source, payload.changes);
    if (result.source !== source) {
      const temporary = `${filePath}.tmp`;
      fs.writeFileSync(temporary, result.source, "utf8");
      fs.renameSync(temporary, filePath);
    }
    console.log(`  /__tuning/save ${file}：改了 ${result.applied.length} 个`
      + `${result.missing.length ? `，${result.missing.length} 个没对上（${result.missing.join(", ")}）` : ""}`);
    SendJson(response, 200, {
      ok: true, file, applied: result.applied.length, changes: result.applied, missing: result.missing,
    });
  } catch (error) {
    SendJson(response, 500, { ok: false, error: String(error && error.message ? error.message : error) });
  }
}

// 写盘一律 `.tmp` + rename：写到一半出错不留下改了一半的文件（白盒配置与场景存盘共用）。
function WriteAtomic(filePath, data) {
  const temporary = `${filePath}.tmp`;
  fs.writeFileSync(temporary, data);
  fs.renameSync(temporary, filePath);
}

// -------------------------------------------- 白盒关卡配置保存（只在本地）
//
// 白盒关卡编辑器（Taierzhuang1938/docs/Data_EditorBlockout.md §7）只有一个写操作「记下当前机位」，
// 其余改动由人或 AI 直接改 JSON：
//   GET  /__blockout/status → { writable, root, revisions: { FirstLevel: "<sha1>", SecondLevel: null }, reason? }
//   POST /__blockout/save   { level: "FirstLevel", doc: {...}, revision: "<sha1>" | null }
//                        → { ok: true, level, file, revision, warnings }
//
// 比上面两个口多几道闸（照 Taierzhuang1938/Script_TextureImportServer.mjs）：
//   ① 回环 socket **并且** Host 头只认 localhost / 127.0.0.1 —— 挡 DNS rebinding；
//   ② Content-Type 必须是 application/json、Origin 有就必须同源 —— 别的网页发不了跨站 POST
//      （text/plain 的简单请求不走预检，只查 socket 挡不住）；
//   ③ body ≤ 4 MB；
//   ④ level 只认 BLOCKOUT_LEVEL_KEYS，拼出的路径再过 BLOCKOUT_CONFIG_FILE_RE，解析后必须在根之下；
//   ⑤ ValidateBlockout 不过 → 400 + details；配置里的 level 与请求的不一致 → 400；
//      嵌套太深、校验或 JSON.stringify 抛错 → 400 + details（不让异常冒出回调带倒进程）；
//   ⑥ revision = 客户端读配置时那份原始字节的 sha1（不是 status 当下报的那个），与盘上原始字节的
//      sha1 对不上 → 409 + 当前 revision（编辑器开着时文件被人或 AI 改过：先重新读取再存）。
//      null 只在文件还不存在时成立；不带 revision 一律 400，不给「盲写覆盖」留口子。
// 任何拒绝都不落一个字节。读完 body 之后的校验、比版本、写盘全是同步的，同一进程里两次保存不会交错。
// 场景文件（<Level>.scene.json）v1 不开放写。
const BLOCKOUT_BODY_LIMIT = 4 * 1024 * 1024;

function IsLocalPage(request) {
  const host = String(request.headers.host || "").split(":")[0].toLowerCase();
  return IsLoopback(request) && (host === "localhost" || host === "127.0.0.1");
}

function IsSameOrigin(request) {
  const origin = request.headers.origin;
  if (origin === undefined) return true;
  try { return new URL(origin).host === request.headers.host; } catch { return false; }
}

/** 盘上原始字节的 sha1；文件不存在是 null。 */
function BlockoutRevision(filePath) {
  try { return createHash("sha1").update(fs.readFileSync(filePath)).digest("hex"); } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

function SendBlockoutStatus(request, response, rootDir) {
  if (request.method !== "GET" && request.method !== "HEAD") { SendJson(response, 405, { ok: false, error: "只收 GET" }); return; }
  const revisions = {};
  for (const level of BLOCKOUT_LEVEL_KEYS) {
    try { revisions[level] = BlockoutRevision(path.join(rootDir, BlockoutConfigPath(level))); } catch { revisions[level] = null; }
  }
  const writable = IsLocalPage(request);
  SendJson(response, 200, {
    writable, root: rootDir, revisions,
    ...(writable ? {} : { reason: "只有在本机用 localhost / 127.0.0.1 打开时才能存盘" }),
  });
}

async function HandleBlockoutSave(request, response, rootDir) {
  const Reject = (status, error, extra = {}) => SendJson(response, status, { ok: false, error, ...extra });
  if (request.method !== "POST") { Reject(405, "只收 POST"); return; }
  if (!IsLocalPage(request)) { Reject(403, "只接受本机 localhost / 127.0.0.1 的请求"); return; }
  if (!String(request.headers["content-type"] || "").toLowerCase().startsWith("application/json")) {
    Reject(415, "Content-Type 必须是 application/json");
    return;
  }
  if (!IsSameOrigin(request)) { Reject(403, "只接受同源页面的请求"); return; }
  let body;
  try { body = await ReadBody(request, BLOCKOUT_BODY_LIMIT); } catch (error) { Reject(413, error.message); return; }
  let payload;
  try { payload = JSON.parse(body); } catch { Reject(400, "body 不是 JSON"); return; }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) { Reject(400, "body 要是 { level, doc, revision }"); return; }

  const level = typeof payload.level === "string" ? payload.level : "";
  const relative = BlockoutConfigPath(level);
  if (!BLOCKOUT_LEVEL_KEYS.includes(level) || !BLOCKOUT_CONFIG_FILE_RE.test(relative)) {
    Reject(403, `level 只能是 ${BLOCKOUT_LEVEL_KEYS.join(" / ")}`);
    return;
  }
  const filePath = path.resolve(rootDir, relative);
  if (filePath !== path.join(rootDir, relative) || !filePath.startsWith(rootDir + path.sep)) {
    Reject(403, "路径不在服务根之下");
    return;
  }
  const { revision, doc } = payload;
  if (revision !== null && typeof revision !== "string") {
    Reject(400, "revision 要是上次读到的版本号（文件还不存在时写 null）");
    return;
  }
  // 校验 → 比 level → 序列化放在一个 try 里：JSON.parse 收得下几十万层的嵌套，
  // 校验器不认识的字段又不看，到 JSON.stringify 才栈溢出（RangeError）。这里不接住的话，
  // 异常会冒出 http 回调、带倒整个预览服务（它同时在服务所有 worktree）。
  let check;
  let text;
  try {
    check = ValidateBlockout(doc);
    if (!check.ok) { Reject(400, "配置不合规", { details: check.errors, warnings: check.warnings }); return; }
    if (doc.level !== level) { Reject(400, `配置里的 level 是 ${doc.level}，和请求的 ${level} 不是一回事`); return; }
    text = `${JSON.stringify(doc, null, 2)}\n`;
  } catch (error) {
    Reject(400, "配置没法校验或写回（多半是嵌套太深）", {
      details: [`${error?.name || "Error"}：${String(error?.message || error).slice(0, 200)}`],
    });
    return;
  }

  let current;
  try { current = BlockoutRevision(filePath); } catch (error) { Reject(500, String(error?.message || error)); return; }
  if (revision !== current) {
    Reject(409, current === null ? "盘上已经没有这个文件，按新文件保存要带 revision: null"
      : "配置已在别处改过（版本号对不上），先重新读取再保存", { revision: current });
    return;
  }

  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    WriteAtomic(filePath, text);
  } catch (error) {
    try { fs.rmSync(`${filePath}.tmp`, { force: true }); } catch { /* 清不掉就算了，报错里有原因 */ }
    Reject(500, String(error?.message || error));
    return;
  }
  console.log(`  /__blockout/save ${relative}：${doc.keyframes.length} 个关键帧`);
  SendJson(response, 200, {
    ok: true, level, file: relative,
    revision: createHash("sha1").update(text, "utf8").digest("hex"),
    warnings: check.warnings,
  });
}

// -------------------------------------------- 场景保存（只在本地）
//
// 场景编辑器（Taierzhuang1938/docs/Data_Scene.md §6）存场景 JSON。闸与 /__blockout/save 一样（本机 Host、同源、application/json、
// 版本号 = 读场景时那份原始字节的 sha1，对不上 409）；场景 id 只认 SCENE_IDS，拼出的路径再过 SCENE_FILE_RE；
// ValidateScene 不过 → 400；文件按 FormatSceneJson 写（大数组一行一项），与转换脚本、编辑器同一个写法。body ≤ 16 MB。
const SCENE_BODY_LIMIT = 16 * 1024 * 1024;

function SendSceneStatus(request, response, rootDir) {
  if (request.method !== "GET" && request.method !== "HEAD") { SendJson(response, 405, { ok: false, error: "只收 GET" }); return; }
  const revisions = {};
  for (const id of SCENE_IDS) {
    try { revisions[id] = BlockoutRevision(path.join(rootDir, SceneRepoPath(id))); } catch { revisions[id] = null; }
  }
  const writable = IsLocalPage(request);
  SendJson(response, 200, { writable, root: rootDir, revisions, ...(writable ? {} : { reason: "只有在本机用 localhost / 127.0.0.1 打开时才能存盘" }) });
}

async function HandleSceneSave(request, response, rootDir) {
  const Reject = (status, error, extra = {}) => SendJson(response, status, { ok: false, error, ...extra });
  if (request.method !== "POST") { Reject(405, "只收 POST"); return; }
  if (!IsLocalPage(request)) { Reject(403, "只接受本机 localhost / 127.0.0.1 的请求"); return; }
  if (!String(request.headers["content-type"] || "").toLowerCase().startsWith("application/json")) { Reject(415, "Content-Type 必须是 application/json"); return; }
  if (!IsSameOrigin(request)) { Reject(403, "只接受同源页面的请求"); return; }
  let body;
  try { body = await ReadBody(request, SCENE_BODY_LIMIT); } catch (error) { Reject(413, error.message); return; }
  let payload;
  try { payload = JSON.parse(body); } catch { Reject(400, "body 不是 JSON"); return; }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) { Reject(400, "body 要是 { scene, doc, revision }"); return; }
  const sceneId = typeof payload.scene === "string" ? payload.scene : "";
  const relative = SceneRepoPath(sceneId);
  if (!SCENE_IDS.includes(sceneId) || !SCENE_FILE_RE.test(relative)) { Reject(403, `scene 只能是 ${SCENE_IDS.join(" / ")}`); return; }
  const filePath = path.resolve(rootDir, relative);
  if (filePath !== path.join(rootDir, relative) || !filePath.startsWith(rootDir + path.sep)) { Reject(403, "路径不在服务根之下"); return; }
  const { revision, doc } = payload;
  if (revision !== null && typeof revision !== "string") { Reject(400, "revision 要是上次读到的版本号（文件还不存在时写 null）"); return; }
  let check;
  let text;
  try {
    check = ValidateScene(doc);
    if (!check.ok) { Reject(400, "场景不合规", { details: check.errors.slice(0, 50), warnings: check.warnings }); return; }
    if (doc.id !== sceneId) { Reject(400, `场景里的 id 是 ${doc.id}，和请求的 ${sceneId} 不是一回事`); return; }
    text = FormatSceneJson(doc);
  } catch (error) {
    Reject(400, "场景没法校验或写回（多半是嵌套太深）", { details: [`${error?.name || "Error"}：${String(error?.message || error).slice(0, 200)}`] });
    return;
  }
  let current;
  try { current = BlockoutRevision(filePath); } catch (error) { Reject(500, String(error?.message || error)); return; }
  if (revision !== current) {
    Reject(409, current === null ? "盘上已经没有这个文件，按新文件保存要带 revision: null" : "场景已在别处改过（版本号对不上），先重新读取再保存", { revision: current });
    return;
  }
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    WriteAtomic(filePath, text);
  } catch (error) {
    try { fs.rmSync(`${filePath}.tmp`, { force: true }); } catch { /* 清不掉就算了，报错里有原因 */ }
    Reject(500, String(error?.message || error));
    return;
  }
  console.log(`  /__scene/save ${relative}：${doc.objects.length} 个物件`);
  SendJson(response, 200, { ok: true, scene: sceneId, file: relative, revision: createHash("sha1").update(text, "utf8").digest("hex"), warnings: check.warnings });
}

function LanAddresses(port) {
  const urls = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const net of list || []) {
      if (net.family === "IPv4" && !net.internal) urls.push(`http://${net.address}:${port}`);
    }
  }
  return urls;
}

function OpenBrowser(url) {
  try {
    if (process.platform === "win32") spawn("cmd", ["/c", "start", "", url], { detached: true, stdio: "ignore" }).unref();
    else spawn(process.platform === "darwin" ? "open" : "xdg-open", [url], { detached: true, stdio: "ignore" }).unref();
  } catch { /* 开不起来就算了，命令行里有 URL */ }
}

// 在桌面放一个双击就起服的入口。三个平台各自的做法都塞在这里，是为了让
// 「换台机器怎么装」只剩一条命令 —— 别人不该先去搞清楚该跑哪个 .ps1。
function CreateShortcut(rootDir) {
  const home = os.homedir();
  const desktop = [path.join(home, "Desktop"), path.join(home, "桌面")].find((dir) => fs.existsSync(dir)) || home;
  const label = `本地预览 ${path.basename(rootDir)}`;

  if (process.platform === "win32") {
    // Windows 侧交给 PowerShell：.lnk 只能通过 WScript.Shell COM 生成。
    // 那个 .ps1 用 $PSScriptRoot 定位，所以从哪份检出跑就绑哪份检出。
    const script = path.join(rootDir, "scripts", "Script_CreateDesktopShortcut.ps1");
    // 让 PowerShell 只回机器可读的 ASCII 键值，人话在这边打：node 的
    // console.log 在 Windows 上走 WriteConsoleW，不吃控制台代码页那一套，
    // 而 PowerShell 的中文输出转一手就是乱码。
    const out = execFileSync("powershell",
      ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", script, "-Name", label],
      { encoding: "utf8" });
    const link = /^SHORTCUT_PATH=(.*)$/m.exec(out)?.[1]?.trim();
    console.log(`快捷方式已创建：${link || path.join(desktop, label + ".lnk")}`);
    console.log(`  服务的树：${rootDir}`);
    return;
  }

  if (process.platform === "darwin") {
    const file = path.join(desktop, `${label}.command`);
    fs.writeFileSync(file, `#!/bin/sh\ncd "${rootDir}"\nexec node scripts/Script_LocalPreview.mjs --open "$@"\n`);
    fs.chmodSync(file, 0o755);
    console.log(`快捷方式已创建：${file}`);
    return;
  }

  const file = path.join(desktop, "BlanksLocalPreview.desktop");
  fs.writeFileSync(file, [
    "[Desktop Entry]", "Type=Application", `Name=${label}`,
    `Exec=node ${path.join(rootDir, "scripts", "Script_LocalPreview.mjs")} --open`,
    `Path=${rootDir}`, `Icon=${path.join(rootDir, "favicon.ico")}`, "Terminal=true", "",
  ].join("\n"));
  fs.chmodSync(file, 0o755);
  console.log(`快捷方式已创建：${file}`);
}

const HELP = `本地预览服 —— 按线上同款路径把整棵树跑在 127.0.0.1 上。零 npm 依赖，只要有 node。

  node scripts/Script_LocalPreview.mjs              服务本脚本所在的那棵树，默认 8080，不打开浏览器
  node scripts/Script_LocalPreview.mjs 8090         换端口（占用了就自动往上让）
  node scripts/Script_LocalPreview.mjs --shortcut   在桌面放一个双击就起服的快捷方式，然后退出
  node scripts/Script_LocalPreview.mjs --lan        同时监听局域网（手机上验收）
  node scripts/Script_LocalPreview.mjs --open       明确要求打开默认浏览器
  node scripts/Script_LocalPreview.mjs --no-open    强制不打开浏览器，优先于 --open（兼容旧调用）
  node scripts/Script_LocalPreview.mjs --root=<dir> 指定要服务的目录

索引页在 http://127.0.0.1:<port>/__preview/ ：列出所有页面，并能把任意 worktree 挂到相邻端口。
调参表保存口（敌军 AI 编辑器，只在回环上可写）：GET /__tuning/status；POST /__tuning/save
  { file: "Taierzhuang1938/Data_Tuning_AiCover.mjs", changes: [{ path: "COVER.standoffM", value: 0.7 }] }
  只替换那一个数字字面量，注释与格式一个字不动（Taierzhuang1938/Script_TuningWriter.mjs）。
白盒关卡配置保存口（白盒关卡编辑器，只在本机 localhost / 127.0.0.1 上可写）：GET /__blockout/status；POST /__blockout/save
  { level: "FirstLevel", doc: {...}, revision: "<读配置时那份原始字节的 sha1；必填，文件还不存在时写 null>" }
  过 ValidateBlockout 后原子写 Taierzhuang1938/Blockout/<Level>.json（body ≤ 4 MB）；版本号对不上回 409（带当前版本号，
  先重新读取再存），坏 JSON / 校验不过 / 嵌套太深回 400，任何拒绝都不落盘。
场景保存口（场景编辑器，只在本机 localhost / 127.0.0.1 上可写）：GET /__scene/status；POST /__scene/save
  { scene: "FirstLevelWhitebox", doc: {...}, revision: "<读场景时那份原始字节的 sha1>" }
  过 ValidateScene 后按场景文件的写法原子写 Taierzhuang1938/Scenes/<Id>/Scene_<Id>.json（body ≤ 16 MB）；其余同上。`;

async function Main() {
  const args = process.argv.slice(2);
  if (args.includes("--help") || args.includes("-h")) { console.log(HELP); return; }
  const lan = args.includes("--lan");
  const shouldOpen = args.includes("--open") && !args.includes("--no-open");
  const rootArg = args.find((a) => a.startsWith("--root="));
  const rootDir = path.resolve(rootArg ? rootArg.slice("--root=".length) : DEFAULT_ROOT);
  const portArg = args.find((a) => /^\d+$/.test(a));
  const basePort = Number(portArg || process.env.PREVIEW_PORT || 8080);
  const host = lan ? "0.0.0.0" : "127.0.0.1";

  if (args.includes("--shortcut")) { CreateShortcut(rootDir); return; }

  // 端口上已经有一份、而且服的**正是这棵树**，就复用它，不再起第二份服务。
  // 但桌面快捷方式的职责也包括「打开预览页」：已有实例时仍要打开浏览器，
  // 否则双击只会闪一下黑窗口，看起来就像快捷方式坏了。
  //
  // 「正是这棵树」这个条件不能省：多个 agent 各在自己 worktree 里起预览时，
  // 8080 很可能被别人的树占着，无脑复用等于把浏览器指到别人的代码上，
  // 而且看起来一切正常 —— 这种错最难发现。根不一样就往上让一个端口。
  const existing = await ProbeExisting(basePort);
  if (existing && path.resolve(existing.root) === rootDir) {
    console.log(`已经在跑了：http://127.0.0.1:${basePort}/__preview/   （根：${existing.root}）`);
    if (shouldOpen) OpenBrowser(`http://127.0.0.1:${basePort}/__preview/`);
    return;
  }
  if (existing) {
    console.log(`:${basePort} 上是另一棵树（${existing.root}），本次往后让一个端口。`);
  }

  const context = { port: basePort, basePort, host, lanUrls: [] };
  const server = CreateServer(rootDir, context);
  const port = await ListenFrom(server, basePort, host);
  context.port = port;
  context.basePort = port;
  context.lanUrls = lan ? LanAddresses(port) : [];
  mounts.set(rootDir, { port, server });

  // 窗口标题从这里设，不从 .cmd 里设：批处理里的中文会被 chcp 生效前的
  // 代码页拆错，node 写标题是宽字符，稳。
  try { process.title = `本地预览 ${path.basename(rootDir)} :${port} — 关掉本窗口即停服`; } catch { /* ignore */ }

  console.log("");
  console.log(`  本地预览就绪  ->  http://127.0.0.1:${port}/__preview/`);
  console.log(`  根目录        :  ${rootDir}`);
  for (const url of context.lanUrls) console.log(`  局域网        :  ${url}/__preview/`);
  console.log(`  停服          :  关掉这个窗口，或按 Ctrl+C`);
  console.log(`  放桌面快捷方式:  node scripts/Script_LocalPreview.mjs --shortcut`);
  console.log("");
  if (shouldOpen) OpenBrowser(`http://127.0.0.1:${port}/__preview/`);
}

Main().catch((error) => {
  console.error("本地预览起不来：", error.message);
  process.exitCode = 1;
});
