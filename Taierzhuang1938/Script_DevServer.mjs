// 《血战台儿庄》本地静态服：显式 MIME 表（Windows 注册表把 .js 映射成 text/plain，
// 模块加载会直接炸）。用法：node Taierzhuang1938/Script_DevServer.mjs [port]
// 服务的是 worktree 根，路径与线上一致。
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

export function ServeRoot(rootDir, port = 0) {
  const server = http.createServer((request, response) => {
    let route = decodeURIComponent(request.url.split("?")[0]);
    if (route.endsWith("/")) route += "index.html";
    const filePath = path.join(rootDir, route);
    if (!filePath.startsWith(rootDir)) { response.writeHead(403).end(); return; }
    fs.stat(filePath, (error, stat) => {
      if (error || !stat.isFile()) { response.writeHead(404).end(); return; }
      response.writeHead(200, {
        "Content-Type": MIME[path.extname(filePath).toLowerCase()] ?? "application/octet-stream",
        "Cache-Control": "no-store",
        "Content-Length": stat.size,
      });
      fs.createReadStream(filePath).pipe(response);
    });
  });
  return new Promise((resolve) => server.listen(port, "127.0.0.1", () => resolve(server)));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const port = parseInt(process.argv[2] || process.env.PORT || "8171", 10);
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  ServeRoot(root, port).then(() => {
    console.log(`Taierzhuang1938 dev server: http://127.0.0.1:${port}/Taierzhuang1938/`);
  });
}
