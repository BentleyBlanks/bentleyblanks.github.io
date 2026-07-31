// 《地道战 · 钟声》—— 浏览器测试共用工具。
// 只做两件事：起一个只读静态服，找一个能跑的 Chromium。
// 依赖 playwright-core（npm i -D playwright-core），不下载浏览器。

import http from "node:http";
import fs from "node:fs";
import path from "node:path";

export async function LaunchBrowser() {
  const playwright = await import("playwright-core").catch(() => null);
  if (!playwright) {
    console.error("缺少 playwright-core：请先 npm i -D playwright-core");
    process.exit(2);
  }
  const { chromium } = playwright;
  const commonArgs = ["--no-sandbox", "--disable-dev-shm-usage"];
  const attempts = [];
  if (process.env.TB_BROWSER_PATH) {
    attempts.push({ executablePath: process.env.TB_BROWSER_PATH, args: commonArgs });
  }
  for (const dir of ["/opt/pw-browsers/chromium-1194", "/opt/pw-browsers/chromium"]) {
    const exe = path.join(dir, "chrome-linux", "chrome");
    if (fs.existsSync(exe)) {
      attempts.push({
        executablePath: exe,
        // 云端无 GPU：SwiftShader 软件光栅，慢但能出真实像素
        args: [...commonArgs, "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
      });
    }
  }
  attempts.push({ channel: "msedge", args: commonArgs });
  attempts.push({ channel: "chrome", args: commonArgs });
  attempts.push({ args: commonArgs });
  for (const options of attempts) {
    try {
      return await chromium.launch(options);
    } catch { /* 换下一个候选 */ }
  }
  console.error("找不到可用浏览器：设 TB_BROWSER_PATH 指向 chrome 可执行文件");
  process.exit(2);
}

const mime = {
  ".html": "text/html; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
};

export function ServeProject(projectRoot) {
  const server = http.createServer((request, response) => {
    let route = decodeURIComponent(request.url.split("?")[0]);
    if (route === "/") route = "/index.html";
    const filePath = path.join(projectRoot, route);
    if (!filePath.startsWith(projectRoot)) { response.writeHead(403).end(); return; }
    fs.readFile(filePath, (error, data) => {
      if (error) { response.writeHead(404).end(); return; }
      response.writeHead(200, {
        "Content-Type": mime[path.extname(filePath)] ?? "application/octet-stream",
      });
      response.end(data);
    });
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server)));
}

/** 打开页面并等到 window.TunnelBell 就绪；返回 { page, errors }。 */
export async function OpenGame(browser, port, viewport = { width: 1600, height: 900 }) {
  const page = await browser.newPage({ viewport });
  const errors = [];
  page.on("pageerror", (error) => errors.push(`PAGEERROR ${String(error).slice(0, 300)}`));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text().slice(0, 300));
  });
  await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: "load", timeout: 60000 });
  await page.waitForFunction(() => window.TunnelBell !== undefined, { timeout: 60000 });
  const bootError = await page.evaluate(() => window.TunnelBell.error);
  if (bootError) errors.push(`BOOT ${bootError.slice(0, 400)}`);
  await page.evaluate(() => window.TunnelBell.Muted(true));
  return { page, errors };
}
