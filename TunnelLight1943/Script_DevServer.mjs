// 本地静态服：显式 MIME 表（Windows 注册表会把 .js 映射成 text/plain，模块加载直接炸）。
// 用法：node TunnelLight1943/Script_DevServer.mjs [port]   （服务 worktree 根，路径与线上一致）
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
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".mp3": "audio/mpeg",
};

export function ServeRoot(rootDir, port = 0) {
  const server = http.createServer((request, response) => {
    let route = decodeURIComponent(request.url.split("?")[0]);
    // 只在本机开发时用的截图回写口：页面把 canvas 抓帧 POST 过来落成文件，
    // 审查工具再去读——比把几十 KB 的 base64 在别处倒手干净得多。
    // 只允许写进 _shots/ 目录，文件名只收 [A-Za-z0-9_-]。
    if (request.method === "POST" && route === "/__shot") {
      const name = (new URLSearchParams(request.url.split("?")[1] || "").get("name") || "shot")
        .replace(/[^A-Za-z0-9_-]/g, "");
      const chunks = [];
      request.on("data", (c) => chunks.push(c));
      request.on("end", () => {
        const body = Buffer.concat(chunks).toString("utf8");
        const b64 = body.replace(/^data:image\/\w+;base64,/, "");
        const dir = path.join(rootDir, "TunnelLight1943", "_shots");
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, name + ".jpg"), Buffer.from(b64, "base64"));
        response.writeHead(200, { "Content-Type": "text/plain" }).end("ok");
      });
      return;
    }
    if (route.endsWith("/")) route += "index.html";
    const filePath = path.join(rootDir, route);
    if (!filePath.startsWith(rootDir)) { response.writeHead(403).end(); return; }
    fs.readFile(filePath, (error, data) => {
      if (error) { response.writeHead(404).end(); return; }
      response.writeHead(200, {
        "Content-Type": MIME[path.extname(filePath).toLowerCase()] ?? "application/octet-stream",
        "Cache-Control": "no-store",
      });
      response.end(data);
    });
  });
  return new Promise((resolve) => server.listen(port, "127.0.0.1", () => resolve(server)));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const port = parseInt(process.argv[2] || "8146", 10);
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  ServeRoot(root, port).then(() => {
    console.log(`TunnelLight1943 dev server: http://127.0.0.1:${port}/TunnelLight1943/`);
  });
}
