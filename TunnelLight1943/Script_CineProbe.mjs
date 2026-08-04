// 过场动作探针：开到指定过场的指定行，在行内按真实时间连拍若干张。
// 验证的是"动作的过程"——轨道动画只看起点截图等于没看。
// 运行：node Script_CineProbe.mjs <输出目录> <章节> <beatId> <行号> [张数] [间隔秒]
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { LaunchBrowser } from "../PrairieFire1937/Script_BrowserTestKit.mjs";
import { ServeRoot } from "./Script_DevServer.mjs";

const projectDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(projectDir, "..");
const outDir = path.resolve(process.argv[2] || "./probe");
const chapter = parseInt(process.argv[3] || "1", 10);
const beatId = process.argv[4];
const lineIndex = parseInt(process.argv[5] || "0", 10);
const shots = parseInt(process.argv[6] || "5", 10);
const interval = parseFloat(process.argv[7] || "0.55");
if (!beatId) { console.error("用法：Script_CineProbe.mjs <出目录> <章> <beatId> <行号> [张数] [间隔]"); process.exit(1); }
fs.mkdirSync(outDir, { recursive: true });

const server = await ServeRoot(rootDir, 0);
const port = server.address().port;
const browser = await LaunchBrowser();
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));

await page.goto(`http://127.0.0.1:${port}/TunnelLight1943/?chapter=${chapter}&fast=1`, { waitUntil: "load", timeout: 60000 });
await page.waitForFunction(() => window.TunnelLight !== undefined, { timeout: 60000 });

const reached = await page.evaluate(async ({ beatId, lineIndex }) => {
  const tl = window.TunnelLight;
  const core = await import("./Script_Core.mjs");
  for (let i = 0; i < 40000; i += 1) {
    const st = tl.state;
    if (!st) return "(无状态)";
    const def = core.CurrentBeatDef(st);
    if (def && def.id === beatId && st.beat.lineIndex >= lineIndex) return def.id + ":" + st.beat.lineIndex;
    if (st.phase === "chapterCard" || st.phase === "chapterEnd") { tl.StepFrames(1, { advance: true }); continue; }
    if (st.phase === "gameEnd" || !def) return "(没到就结束了)";
    if (def.kind === "cinematic" || st.microCine) {
      // 目标过场里逐行走到指定行，其余过场整行跳
      if (def.id === beatId) tl.StepFrames(1, { advance: st.beat.lineIndex < lineIndex });
      else tl.StepFrames(1, { advance: true });
      continue;
    }
    if (def.kind === "choice") { core.MakeChoice(st, "tunnel"); continue; }
    const tg = core.GetBeatTarget(st);
    if (!tg) { tl.StepFrames(1, {}); continue; }
    const dx = (tg.x ?? st.player.x) - st.player.x;
    const input = { moveX: Math.abs(dx) > 1.2 ? Math.sign(dx) : 0 };
    if (tg.action === "interactAt" && Math.abs(dx) <= 1.35) input.interact = true;
    if (tg.action === "holdAt" && Math.abs(dx) <= 1.35) input.interactHeld = true;
    if (tg.action === "scribeAt" && Math.abs(dx) <= 1.6) { input.interactHeld = true; input.moveX = 1; }
    if (tg.action === "crouchAt" && Math.abs(dx) <= 1.35) input.crouch = true;
    if ((tg.level || "surface") !== st.player.level) input.climb = tg.level === "under" ? 1 : -1;
    tl.StepFrames(1, input);
    if (st.detection.level > 0.9) st.detection.level = 0.9;
  }
  return "(超时)";
}, { beatId, lineIndex });

console.log("到达：" + reached);
for (let i = 0; i < shots; i += 1) {
  await page.waitForTimeout(interval * 1000);
  await page.screenshot({ path: path.join(outDir, `${beatId}_l${lineIndex}_t${String(i).padStart(2, "0")}.png`) });
}
await browser.close();
server.close();
if (errors.length) { console.error("页面异常：", errors.slice(0, 4).join(" | ")); process.exit(1); }
console.log(`拍了 ${shots} 张 → ${outDir}`);
