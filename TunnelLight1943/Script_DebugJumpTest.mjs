// 调试面板跳幕自检：八章每一幕都跳一遍，落点必须精确、过程不许抛错。
// 跳幕是白盒期最常用的工具，坏了会一路误导——所以它自己也要有测试。
// 运行：node TunnelLight1943/Script_DebugJumpTest.mjs
import path from "node:path";
import { fileURLToPath } from "node:url";
import { LaunchBrowser } from "../PrairieFire1937/Script_BrowserTestKit.mjs";
import { ServeRoot } from "./Script_DevServer.mjs";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const server = await ServeRoot(rootDir, 0);
const port = server.address().port;
const browser = await LaunchBrowser();
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e).slice(0, 300)));
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text().slice(0, 200)); });

await page.goto(`http://127.0.0.1:${port}/TunnelLight1943/`, { waitUntil: "load", timeout: 60000 });
await page.waitForFunction(() => window.TunnelLight !== undefined, { timeout: 60000 });

// 面板：标题页也能开（还没开局就想直接跳到第五章看一眼，是最常见的用法）
await page.keyboard.press("`");
if (!(await page.isVisible("#debugPanel"))) { console.error("✗ ` 打不开调试面板"); process.exit(1); }
await page.click("#debugChapters button:nth-child(5)");
await page.click("#debugBeats li:nth-child(4) button");
await page.waitForTimeout(400);
const clicked = await page.evaluate(async () => {
  const core = await import("./Script_Core.mjs");
  const st = window.TunnelLight.state;
  return { ch: st.chapterIndex, beat: st.beatIndex, id: core.CurrentBeatDef(st)?.id, phase: st.phase };
});
if (clicked.ch !== 4 || clicked.beat !== 3 || clicked.phase !== "playing") {
  console.error("✗ 点击跳幕落点不对：", JSON.stringify(clicked));
  process.exit(1);
}
console.log(`✓ 面板点击跳幕：第五章第 4 幕 → ${clicked.id}`);

// 全遍历：每一幕都跳过去、再跑几帧，落点错或抛错都算失败
const bad = await page.evaluate(async () => {
  const core = await import("./Script_Core.mjs");
  const out = [];
  for (let c = 0; c < 8; c += 1) {
    const beats = core.ChapterBeatList(c);
    if (!beats.length) { out.push(`c${c + 1} 分幕清单为空`); continue; }
    for (let b = 0; b < beats.length; b += 1) {
      try {
        window.TunnelLight.JumpToBeat(c, b);
        window.TunnelLight.StepFrames(4, {});
        const st = window.TunnelLight.state;
        if (st.chapterIndex !== c || st.beatIndex !== b) {
          out.push(`c${c + 1}/${b + 1} 落点错 → ${st.chapterIndex + 1}/${st.beatIndex + 1}`);
        }
      } catch (e) { out.push(`c${c + 1}/${b + 1} 抛错：${e.message}`); }
    }
  }
  return out;
});

await browser.close();
server.close();
if (bad.length) { console.error("✗ 跳幕失败：", bad.join(" | ")); process.exit(1); }
if (errors.length) { console.error("✗ 页面异常：", errors.slice(0, 5).join(" | ")); process.exit(1); }
console.log("✓ 八章全部分幕跳转落点正确");
