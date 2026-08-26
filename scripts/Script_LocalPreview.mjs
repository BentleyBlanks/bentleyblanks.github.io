// 全仓库本地预览服：把整棵树按「线上同款路径」跑在 127.0.0.1 上，
// 用来先本地验收、再推 master —— 省掉每次都等 Pages 打包上传那几分钟。
//
// 用法：
//   node scripts/Script_LocalPreview.mjs             # 服务本脚本所在的那棵树
//   node scripts/Script_LocalPreview.mjs 8090        # 换端口
//   node scripts/Script_LocalPreview.mjs --lan       # 同时监听局域网（手机上验收）
//   node scripts/Script_LocalPreview.mjs --no-open   # 不自动开浏览器
//
// 为什么不是 `python -m http.server`：
//   1. Windows 注册表把 .js 映射成 text/plain，ES module 一加载就炸；这里带
//      一张显式 MIME 表（含 .wasm/.glb/.pck，Godot 与 three 的产物都要）。
//   2. 它不支持 Range 请求，序章那些 mp4 拖不动进度条、长 BGM 也没法 seek。
//   3. 它会走浏览器缓存，改完刷新看到的还是旧的。这里一律 no-store。
//
// 响应头刻意跟线上保持一致（**不**发 COOP/COEP）：本地能跑而线上跑不了的东西，
// 本地预览就白做了。
//
// 首页 http://127.0.0.1:<port>/__preview/ 是一个索引页：列出这棵树里所有
// 带 index.html 的页面（按改动时间排序），并且能一键把任意 worktree 挂到
// 相邻端口上 —— 同一个进程内多开几个 server，各自服务自己的根，
// 这样每棵树里的绝对路径（/Taierzhuang1938/…）都还是对的。
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFileSync, spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

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
    fs.writeFileSync(file, `#!/bin/sh\ncd "${rootDir}"\nexec node scripts/Script_LocalPreview.mjs "$@"\n`);
    fs.chmodSync(file, 0o755);
    console.log(`快捷方式已创建：${file}`);
    return;
  }

  const file = path.join(desktop, "BlanksLocalPreview.desktop");
  fs.writeFileSync(file, [
    "[Desktop Entry]", "Type=Application", `Name=${label}`,
    `Exec=node ${path.join(rootDir, "scripts", "Script_LocalPreview.mjs")}`,
    `Path=${rootDir}`, `Icon=${path.join(rootDir, "favicon.ico")}`, "Terminal=true", "",
  ].join("\n"));
  fs.chmodSync(file, 0o755);
  console.log(`快捷方式已创建：${file}`);
}

const HELP = `本地预览服 —— 按线上同款路径把整棵树跑在 127.0.0.1 上。零 npm 依赖，只要有 node。

  node scripts/Script_LocalPreview.mjs              服务本脚本所在的那棵树，默认 8080
  node scripts/Script_LocalPreview.mjs 8090         换端口（占用了就自动往上让）
  node scripts/Script_LocalPreview.mjs --shortcut   在桌面放一个双击就起服的快捷方式，然后退出
  node scripts/Script_LocalPreview.mjs --lan        同时监听局域网（手机上验收）
  node scripts/Script_LocalPreview.mjs --no-open    不自动开浏览器（跑测试/给 agent 用）
  node scripts/Script_LocalPreview.mjs --root=<dir> 指定要服务的目录

索引页在 http://127.0.0.1:<port>/__preview/ ：列出所有页面，并能把任意 worktree 挂到相邻端口。`;

async function Main() {
  const args = process.argv.slice(2);
  if (args.includes("--help") || args.includes("-h")) { console.log(HELP); return; }
  const lan = args.includes("--lan");
  const noOpen = args.includes("--no-open");
  const rootArg = args.find((a) => a.startsWith("--root="));
  const rootDir = path.resolve(rootArg ? rootArg.slice("--root=".length) : DEFAULT_ROOT);
  const portArg = args.find((a) => /^\d+$/.test(a));
  const basePort = Number(portArg || process.env.PREVIEW_PORT || 8080);
  const host = lan ? "0.0.0.0" : "127.0.0.1";

  if (args.includes("--shortcut")) { CreateShortcut(rootDir); return; }

  // 端口上已经有一份、而且服的**正是这棵树**，就别再起一份：直接把浏览器
  // 指过去。双击快捷方式两次不该变成两个服抢端口。
  //
  // 「正是这棵树」这个条件不能省：多个 agent 各在自己 worktree 里起预览时，
  // 8080 很可能被别人的树占着，无脑复用等于把浏览器指到别人的代码上，
  // 而且看起来一切正常 —— 这种错最难发现。根不一样就往上让一个端口。
  const existing = await ProbeExisting(basePort);
  if (existing && path.resolve(existing.root) === rootDir) {
    console.log(`已经在跑了：http://127.0.0.1:${basePort}/__preview/   （根：${existing.root}）`);
    if (!noOpen) OpenBrowser(`http://127.0.0.1:${basePort}/__preview/`);
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
  if (!noOpen) OpenBrowser(`http://127.0.0.1:${port}/__preview/`);
}

Main().catch((error) => {
  console.error("本地预览起不来：", error.message);
  process.exitCode = 1;
});
