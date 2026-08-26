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
  // 人声采样。不写这一条会以 application/octet-stream 送出去 ——
  // decodeAudioData 其实不看 Content-Type，但 Range 请求与缓存策略会变，
  // 而且浏览器控制台会刷一片 "Resource interpreted as Document" 的噪音。
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".ogg": "audio/ogg",
};

/**
 * Chromium 拒连的端口（net/base/port_util.cc 的 kRestrictedPorts）。
 *
 * 【2026-08-26 为什么需要这张表】所有浏览器测试都是 `ServeRoot(rootDir, 0)`
 * 让内核随便挑一个空闲端口。这台机器的临时端口范围压得很低，某次 TargetInfoTest
 * 抽到 6669（IRC），Chromium 直接 `net::ERR_UNSAFE_PORT` —— 页面根本没打开，
 * 测试以「导航失败」退出。**这类红与被测代码毫无关系，而且随机复现**，
 * 上一个人多半会当成偶发重跑一次就过去了。抽到就重抽，别让它再冒出来。
 */
const UNSAFE_PORTS = new Set([
  1, 7, 9, 11, 13, 15, 17, 19, 20, 21, 22, 23, 25, 37, 42, 43, 53, 69, 77, 79,
  87, 95, 101, 102, 103, 104, 109, 110, 111, 113, 115, 117, 119, 123, 135, 137,
  139, 143, 161, 179, 389, 427, 465, 512, 513, 514, 515, 526, 530, 531, 532,
  540, 548, 554, 556, 563, 587, 601, 636, 989, 990, 993, 995, 1719, 1720, 1723,
  2049, 3659, 4045, 4190, 5060, 5061, 6000, 6566, 6665, 6666, 6667, 6668, 6669,
  6679, 6697, 10080,
]);

/** 让内核挑端口时最多重抽这么多次；抽到安全端口就返回。 */
const PORT_RETRIES = 24;

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
  return new Promise((resolve, reject) => {
    let tries = 0;
    const Listen = () => server.listen(port, "127.0.0.1", () => {
      // 显式指定端口时照办（开发服务就该听 8171）；只有 port=0 才重抽。
      if (port !== 0 || !UNSAFE_PORTS.has(server.address().port)) { resolve(server); return; }
      tries += 1;
      if (tries > PORT_RETRIES) { resolve(server); return; }   // 抽不到就认了，别把测试卡死
      server.close(Listen);
    });
    server.on("error", reject);
    Listen();
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const port = parseInt(process.argv[2] || process.env.PORT || "8171", 10);
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  ServeRoot(root, port).then(() => {
    console.log(`Taierzhuang1938 dev server: http://127.0.0.1:${port}/Taierzhuang1938/`);
  });
}
