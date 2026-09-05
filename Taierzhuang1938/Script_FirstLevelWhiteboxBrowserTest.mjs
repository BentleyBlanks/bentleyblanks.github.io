// 已移除的旧策划白盒：旧链接回到正式菜单，保留 P012 入口。

import path from "node:path";
import { fileURLToPath } from "node:url";
import { LaunchBrowser } from "../PrairieFire1937/Script_BrowserTestKit.mjs";
import { ServeRoot } from "./Script_DevServer.mjs";

const projectDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(projectDir, "..");
const server = await ServeRoot(rootDir, 0);
const port = server.address().port;
const browser = await LaunchBrowser();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on("pageerror", (error) => errors.push(`PAGEERROR ${String(error).slice(0, 260)}`));
page.on("console", (message) => {
  if (message.type() !== "error") return;
  if (/fonts\.(googleapis|gstatic)\.com/.test(message.location()?.url || "")) return;
  errors.push(`CONSOLE ${message.text().slice(0, 260)} ${message.location()?.url || ""}`);
});

function Check(condition, message, detail = "") {
  if (!condition) throw new Error(`${message}${detail ? `：${detail}` : ""}`);
  console.log(`ok  ${message}${detail ? ` — ${detail}` : ""}`);
}

try {
  await page.goto(`http://127.0.0.1:${port}/Taierzhuang1938/?whitebox=1&quality=low&scale=small`, { waitUntil: "load", timeout: 120000 });
  await page.waitForFunction(() => window.Taierzhuang?.menu, null, { timeout: 240000 });
  const result = await page.evaluate(() => {
    const menu = window.Taierzhuang.menu;
    return { sandboxMode: menu.sandboxMode, phases: menu.phases.length,
      keys: menu.sandboxes.map(entry => entry.sandboxKey) };
  });
  Check(!result.sandboxMode && result.phases === 7, "旧链接回到正式战役菜单", JSON.stringify(result));
  Check(!result.keys.includes("firstLevelWhitebox"), "已移除旧策划白盒入口");
  Check(result.keys.includes("firstLevelP012Whitebox"), "保留 P012 白盒入口");
  Check(errors.length === 0, "浏览器无脚本或控制台错误", errors.join(" | "));
  console.log("FirstLevelWhiteboxBrowserTest PASS");
} finally {
  await browser.close();
  server.close();
}
