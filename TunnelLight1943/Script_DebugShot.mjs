// 调试实拍：用调试面板的跳幕接口直接落到 <章>-<幕>，跑一会儿再截图。
// 运行：node TunnelLight1943/Script_DebugShot.mjs <输出目录> <章号> <幕号> [秒数] [标签]
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { LaunchBrowser } from "../PrairieFire1937/Script_BrowserTestKit.mjs";
import { ServeRoot } from "./Script_DevServer.mjs";

const projectDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(projectDir, "..");
const outDir = path.resolve(process.argv[2] || "./shots");
const chapter = parseInt(process.argv[3] || "2", 10);
const beat = parseInt(process.argv[4] || "1", 10);
const seconds = parseFloat(process.argv[5] || "2.5");
const tag = process.argv[6] || "";
const lineIndex = process.env.LINE ? parseInt(process.env.LINE, 10) : null;
fs.mkdirSync(outDir, { recursive: true });

const server = await ServeRoot(rootDir, 0);
const port = server.address().port;
const browser = await LaunchBrowser();
const shotW = parseInt(process.env.SHOT_W || "1600", 10);
const shotH = parseInt(process.env.SHOT_H || "900", 10);
const page = await browser.newPage({ viewport: { width: shotW, height: shotH } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text().slice(0, 200)); });

await page.goto(`http://127.0.0.1:${port}/TunnelLight1943/?chapter=${chapter}&beat=${beat}${process.env.PANEL ? "&debug=1" : ""}`,
  { waitUntil: "load", timeout: 60000 });
await page.waitForFunction(() => window.TunnelLight !== undefined, { timeout: 60000 });
await page.waitForTimeout(600);
// 过场：跳到指定行
if (lineIndex !== null) {
  await page.evaluate((n) => {
    const st = window.TunnelLight.state;
    for (let i = 0; i < n; i += 1) window.TunnelLight.StepFrames(1, { advance: true });
    return st.beat.lineIndex;
  }, lineIndex);
}
if (process.env.PX) {
  await page.evaluate((x) => { window.TunnelLight.state.player.x = x; }, parseFloat(process.env.PX));
}
await page.waitForTimeout(seconds * 1000);
const info = await page.evaluate(async () => {
  const core = await import("./Script_Core.mjs");
  const st = window.TunnelLight.state;
  return {
    beat: core.CurrentBeatDef(st)?.id, line: st.beat?.lineIndex,
    caption: (st.caption?.stage || st.caption?.say || st.caption?.act || "").slice(0, 24),
    px: Math.round(st.player.x * 10) / 10,
    enemies: st.actors.filter((a) => a.kind === "soldier" || a.kind === "puppet").length,
  };
});
const name = `c${chapter}_b${String(beat).padStart(2, "0")}${lineIndex !== null ? `_l${lineIndex}` : ""}${tag ? "_" + tag : ""}.png`;
await page.screenshot({ path: path.join(outDir, name) });
console.log(name, JSON.stringify(info));

await browser.close();
server.close();
if (errors.length) {
  console.error("页面异常：", errors.slice(0, 4).join(" | "));
  process.exit(1);
}
