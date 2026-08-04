// 镜头语法实拍：把每一章的过场逐镜头走一遍，抓关键构图（正反打/插入特写/全景）。
// 运行：node TunnelLight1943/Script_ShotTest.mjs <输出目录> [章节号]
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { LaunchBrowser } from "../PrairieFire1937/Script_BrowserTestKit.mjs";
import { ServeRoot } from "./Script_DevServer.mjs";

const projectDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(projectDir, "..");
const outDir = path.resolve(process.argv[2] || "./shots");
const onlyChapter = process.argv[3] ? parseInt(process.argv[3], 10) : null;
fs.mkdirSync(outDir, { recursive: true });

const server = await ServeRoot(rootDir, 0);
const port = server.address().port;
const browser = await LaunchBrowser();
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e).slice(0, 160)));

const chapters = onlyChapter ? [onlyChapter] : [1, 2, 3, 4, 5, 6, 7, 8];
for (const ch of chapters) {
  await page.goto(`http://127.0.0.1:${port}/TunnelLight1943/?chapter=${ch}`, { waitUntil: "load", timeout: 60000 });
  await page.waitForFunction(() => window.TunnelLight !== undefined, { timeout: 60000 });
  // 只按到章节卡消失为止，别把过场也一起按掉
  await page.evaluate(() => {
    for (let i = 0; i < 200; i += 1) {
      if (window.TunnelLight.state?.phase === "playing") break;
      window.TunnelLight.StepFrames(1, { advance: true });
    }
  });

  // 逐行推进开场过场，每一行抓一张（构图在行内推进一段时间后再抓）
  for (let line = 0; line < 14; line += 1) {
    const info = await page.evaluate(() => {
      const s = window.TunnelLight.state;
      const def = s && s.beatLines;
      return {
        phase: s?.phase,
        isCine: !!(def && s.beat && s.camHint),
        camKind: s?.camHint?.kind,
        ots: s?.camHint?.subject ? `${s.camHint.subject}-${s.camHint.other}` : "",
        caption: (s?.caption?.stage || s?.caption?.say || "").slice(0, 14),
      };
    });
    if (info.phase !== "playing" || !info.isCine) break;
    // 让行内慢推走一点再抓
    await page.evaluate(() => window.TunnelLight.StepFrames(24, {}));
    await page.waitForTimeout(420);
    const tag = `${info.camKind || "none"}${info.ots ? "_" + info.ots : ""}`;
    await page.screenshot({ path: path.join(outDir, `c${ch}_l${String(line).padStart(2, "0")}_${tag}.png`) });
    await page.evaluate(() => window.TunnelLight.StepFrames(1, { advance: true }));
    await page.waitForTimeout(150);
  }
  console.log(`✓ 第${ch}章镜头已抓拍`);
}

await browser.close();
server.close();
if (errors.length) {
  console.error("页面异常：", errors.slice(0, 5).join(" | "));
  process.exit(1);
}
console.log(`镜头实拍完成 → ${outDir}`);
