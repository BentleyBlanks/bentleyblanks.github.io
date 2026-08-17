// 玩法段实拍：跳到指定章节，推进到指定 beat，让它真跑一会儿再截图。
// 用来验烟/水/光这类需要时间演化的东西。
// 运行：node TunnelLight1943/Script_SceneShot.mjs <输出目录> <章节> <beatId> [秒数]
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { LaunchBrowser } from "../PrairieFire1937/Script_BrowserTestKit.mjs";
import { ServeRoot } from "./Script_DevServer.mjs";

const projectDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(projectDir, "..");
const outDir = path.resolve(process.argv[2] || "./shots");
const chapter = parseInt(process.argv[3] || "4", 10);
const beatId = process.argv[4] || "";
const seconds = parseFloat(process.argv[5] || "6");
const forceX = process.argv[6] ? parseFloat(process.argv[6]) : null;
fs.mkdirSync(outDir, { recursive: true });

const server = await ServeRoot(rootDir, 0);
const port = server.address().port;
const browser = await LaunchBrowser();
// 手机横屏的画幅比桌面扁得多（16:9 → 19.5:9），构图问题只在那个比例下才露出来，
// 所以取景可以按 SHOT_W/SHOT_H 换成真机尺寸
const shotW = parseInt(process.env.SHOT_W || "1600", 10);
const shotH = parseInt(process.env.SHOT_H || "900", 10);
const page = await browser.newPage({
  viewport: { width: shotW, height: shotH },
  isMobile: shotW < 1000, hasTouch: shotW < 1000, deviceScaleFactor: shotW < 1000 ? 3 : 1,
});
const errors = [];
page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text().slice(0, 200)); });

await page.goto(`http://127.0.0.1:${port}/TunnelLight1943/?chapter=${chapter}&fast=1`, { waitUntil: "load", timeout: 60000 });
await page.waitForFunction(() => window.TunnelLight !== undefined, { timeout: 60000 });

// 推进到目标 beat（过场用 advance 跳过，玩法段用自动通关目标驱动）
const reached = await page.evaluate(async (target) => {
  const tl = window.TunnelLight;
  const core = await import("./Script_Core.mjs");
  for (let i = 0; i < 40000; i += 1) {
    const st = tl.state;
    if (!st) break;
    const def = core.CurrentBeatDef(st);
    if (target && def && def.id === target) return def.id;
    if (st.phase === "chapterCard" || st.phase === "chapterEnd") {
      tl.StepFrames(1, { advance: true });
      continue;
    }
    if (st.phase === "gameEnd") break;
    if (!def) break;
    if (def.kind === "cinematic" || st.microCine) { tl.StepFrames(1, { advance: true }); continue; }
    if (def.kind === "choice") { core.MakeChoice(st, "tunnel"); continue; }
    const tg = core.GetBeatTarget(st);
    if (!tg) { tl.StepFrames(1, {}); continue; }
    const dx = (tg.x ?? st.player.x) - st.player.x;
    const input = { moveX: Math.abs(dx) > 1.2 ? Math.sign(dx) : 0 };
    if (tg.action === "interactAt" && Math.abs(dx) <= 1.35) input.interact = true;
    // 四动词：做功那一档要按住 E ＋ 方向（GetBeatTarget 报的 stroke），光按住 E 不涨
    if (tg.action === "holdAt" && Math.abs(dx) <= 1.35) {
      input.interactHeld = true; input.moveX = 0;
      if (tg.stroke === "up") input.climb = -1; else if (tg.stroke === "down") input.climb = 1;
      else if (tg.stroke === "left") input.moveX = -1; else if (tg.stroke === "right") input.moveX = 1;
    }
    if (tg.action === "crouchAt" && Math.abs(dx) <= 1.35) input.crouch = true;
    if ((tg.level || "surface") !== st.player.level) input.climb = tg.level === "under" ? 1 : -1;
    tl.StepFrames(1, input);
    if (st.detection.level > 0.9) st.detection.level = 0.9;
  }
  return window.TunnelLight.state ? "(未到达)" : "(无状态)";
}, beatId);

if (forceX !== null) await page.evaluate((x) => { window.TunnelLight.state.player.x = x; }, forceX);
// 让它真跑一段时间（rAF 驱动渲染 + 流体解算）
await page.waitForTimeout(seconds * 1000);
await page.screenshot({ path: path.join(outDir, `c${chapter}_${beatId || "scene"}_${shotW}x${shotH}.png`) });

await browser.close();
server.close();
console.log(`beat=${reached} → ${outDir}`);
if (errors.length) {
  console.error("页面异常：", errors.slice(0, 4).join(" | "));
  process.exit(1);
}
