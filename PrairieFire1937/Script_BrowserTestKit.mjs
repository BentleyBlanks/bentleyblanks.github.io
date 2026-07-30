// 《燎原 · 敌后1937》 —— 浏览器测试共用工具（被 Script_ClickSmokeTest / Script_RenderHealthTest 引用）。
//
// 职责只有两件：起一个只读的本地静态服，找到一个能跑的 Chromium 系浏览器。
// 依赖 playwright-core（npm i -D playwright-core），本身不下载浏览器，
// 优先使用机器上已有的 Edge / Chrome。

import http from "node:http";
import fs from "node:fs";
import path from "node:path";

/**
 * 浏览器解析顺序：
 *   1. 环境变量 PF_BROWSER_PATH（指向 chrome/msedge 可执行文件，最高优先级）
 *   2. 云端沙箱预装的 Chromium（本机不存在该路径时自动跳过）
 *   3. 系统安装的 Edge → Chrome
 *   4. Playwright 自带 Chromium（若曾 npx playwright install 过）
 */
export async function LaunchBrowser() {
  const playwright = await import("playwright-core").catch(() => null);
  if (!playwright) {
    console.error("缺少 playwright-core：请先 npm i -D playwright-core");
    process.exit(2);
  }
  const { chromium } = playwright;
  const commonArgs = ["--no-sandbox", "--disable-dev-shm-usage"];
  const attempts = [];
  if (process.env.PF_BROWSER_PATH) {
    attempts.push({ executablePath: process.env.PF_BROWSER_PATH, args: commonArgs });
  }
  if (fs.existsSync("/opt/pw-browsers/chromium-1194/chrome-linux/chrome")) {
    attempts.push({
      executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
      args: [...commonArgs, "--use-gl=swiftshader", "--enable-unsafe-swiftshader"],
    });
  }
  attempts.push({ channel: "msedge", args: commonArgs });
  attempts.push({ channel: "chrome", args: commonArgs });
  attempts.push({ args: commonArgs });
  for (const options of attempts) {
    try {
      return await chromium.launch(options);
    } catch (error) {
      // 换下一个候选
    }
  }
  console.error("找不到可用浏览器：设 PF_BROWSER_PATH 指向 chrome/msedge 的可执行文件即可");
  process.exit(2);
}

const mime = {
  ".html": "text/html; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".mp3": "audio/mpeg",
};

/** 起只读静态服，resolve 后从 server.address().port 取端口。 */
export function ServeProject(projectRoot) {
  const server = http.createServer((request, response) => {
    let route = decodeURIComponent(request.url.split("?")[0]);
    if (route === "/") route = "/index.html";
    const filePath = path.join(projectRoot, route);
    if (!filePath.startsWith(projectRoot)) {
      response.writeHead(403).end();
      return;
    }
    fs.readFile(filePath, (error, data) => {
      if (error) {
        response.writeHead(404).end();
        return;
      }
      response.writeHead(200, { "Content-Type": mime[path.extname(filePath)] ?? "application/octet-stream" });
      response.end(data);
    });
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server)));
}
