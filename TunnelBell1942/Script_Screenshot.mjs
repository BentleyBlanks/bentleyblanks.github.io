// 《地道战 · 钟声》—— 截图脚本。
// 用法：node TunnelBell1942/Script_Screenshot.mjs [输出目录]
// 逐幕沿 X 采样若干机位，外加标题页与剧情气泡，产出 PNG 供人工审查。

import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { LaunchBrowser, OpenGame, ServeProject } from "./Script_BrowserTestKit.mjs";

const projectRoot = path.dirname(fileURLToPath(import.meta.url));
const outDir = process.argv[2] || path.join(projectRoot, "..", "Screens_TunnelBell");
fs.mkdirSync(outDir, { recursive: true });

const server = await ServeProject(projectRoot);
const port = server.address().port;
const browser = await LaunchBrowser();
const { page, errors } = await OpenGame(browser, port, { width: 1600, height: 900 });

const shots = [];
async function Shot(name) {
  const file = path.join(outDir, `${name}.png`);
  await page.screenshot({ path: file });
  shots.push(file);
  console.log("shot:", path.basename(file));
}

// 标题页
await page.waitForTimeout(700);
await Shot("00_title");

for (let levelIndex = 0; levelIndex < 3; levelIndex += 1) {
  await page.evaluate((i) => {
    window.TunnelBell.Begin(i);
  }, levelIndex);
  await page.waitForTimeout(500);

  // 幕间卡
  if (levelIndex === 0) await Shot("01_chapterCard");

  await page.evaluate(() => {
    const go = document.getElementById("ChapterGoButton");
    if (go && !document.getElementById("ChapterScreen").hidden) go.click();
  });
  await page.waitForTimeout(400);

  // 开场气泡
  const hasPanel = await page.evaluate(() => !document.getElementById("PanelScreen").hidden);
  if (hasPanel) await Shot(`${10 + levelIndex * 10}_act${levelIndex + 1}_panel`);
  await page.evaluate(() => window.TunnelBell.SkipPanels());
  await page.waitForTimeout(300);

  // 沿关卡采样机位
  const samples = await page.evaluate(() => {
    const s = window.TunnelBell.state;
    const level = s.level;
    const out = [];
    // 优先取有内容的地方：出生点、每个 hatch、每个敌人、出口
    out.push({ tag: "start", x: level.startX, y: level.startY });
    (level.hatches || []).slice(0, 2).forEach((h, i) => out.push({ tag: `hatch${i}`, x: h.x, y: 0 }));
    (level.enemies || []).slice(0, 2).forEach((e, i) => out.push({ tag: `enemy${i}`, x: e.x - 6, y: e.y }));
    const tunnelFloors = (level.floors || []).filter((f) => f.kind === "tunnel");
    tunnelFloors.slice(0, 2).forEach((f, i) => out.push({ tag: `tunnel${i}`, x: (f.x0 + f.x1) / 2, y: f.y }));
    // 出口只靠近、不踏进：踩上去会判胜利，弹幕终卡把后面所有机位全糊住
    out.push({ tag: "nearExit", x: level.exit.x - (level.exit.radius + 10), y: level.exit.y });
    return out;
  });

  let n = 0;
  for (const sample of samples) {
    n += 1;
    await page.evaluate((s) => {
      window.TunnelBell.SkipPanels();
      window.TunnelBell.Teleport(s.x, s.y);
      // 让摄像机瞬间跟上，再跑一小段让动画/光照稳定
      window.TunnelBell.Advance(0.9, { moveX: 0 });
      window.TunnelBell.SkipPanels();
    }, sample);
    await page.waitForTimeout(260);
    await Shot(`${11 + levelIndex * 10}_act${levelIndex + 1}_${String(n).padStart(2, "0")}_${sample.tag}`);
  }
}

const stats = await page.evaluate(() => {
  const r = window.TunnelBell.render;
  const cam = r && r.camera;
  return {
    ...(r && r.stats ? r.stats : {}),
    lens: cam ? `${cam.isPerspectiveCamera ? "perspective" : "ortho"} fov=${cam.fov ?? "-"}` : "-",
  };
});

console.log("\n渲染统计:", JSON.stringify(stats));
if (errors.length) {
  console.log("\n页面错误:");
  for (const e of errors.slice(0, 12)) console.log("  -", e);
}
console.log(`\n共 ${shots.length} 张，输出目录 ${outDir}`);

await browser.close();
server.close();
process.exit(errors.length ? 1 : 0);
