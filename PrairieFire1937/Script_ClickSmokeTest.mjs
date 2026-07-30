// 《燎原 · 敌后1937》 —— 真实鼠标交互测试（8 项，一票否决级）。
//
// 全程只用合成的真实 pointer 事件，禁止程序化设置任何选中状态。
// 这个测试的由来：曾有一次 CSS 优先级事故让五个全屏 UI 层拦截了全部点击，
// 玩家什么都点不了，而所有"程序化设置选中再截图"的验证全部照常通过。
// 结论：交互必须用真实事件验证，截图验证不了可点性。
//
// 依赖：playwright-core（npm i -D playwright-core）+ 一个本机浏览器。
// 浏览器解析顺序见 Script_BrowserTestKit.mjs（PF_BROWSER_PATH → Edge/Chrome → 自带 Chromium）。
// 运行：node PrairieFire1937/Script_ClickSmokeTest.mjs

import path from "node:path";
import { fileURLToPath } from "node:url";
import { LaunchBrowser, ServeProject } from "./Script_BrowserTestKit.mjs";

const projectRoot = path.dirname(fileURLToPath(import.meta.url));

const server = await ServeProject(projectRoot);
const port = server.address().port;
const browser = await LaunchBrowser();
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
const errors = [];
page.on("pageerror", (error) => errors.push(String(error).slice(0, 160)));

await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: "load", timeout: 60000 });
await page.waitForFunction(() => window.PrairieFire !== undefined, { timeout: 120000 });
await page.evaluate(() => window.PrairieFire.SetAutoPlay(true));
await page.waitForTimeout(2500);

let failed = 0;
function Check(name, ok, detail) {
  if (!ok) failed += 1;
  console.log(`${ok ? "✓" : "✗"} ${name}${detail ? `  ${detail}` : ""}`);
}

// 1. 无遮挡守卫
const topAtCenter = await page.evaluate(() => {
  const element = document.elementFromPoint(window.innerWidth / 2, window.innerHeight * 0.42);
  return element ? element.tagName : "null";
});
Check("地图中央无遮挡（elementFromPoint 是 canvas）", topAtCenter === "CANVAS", `实际: ${topAtCenter}`);

// 2. 真点空地块 → 选中
const target = await page.evaluate(() => {
  const api = window.PrairieFire;
  const state = api.GetState();
  const candidates = state.map.order.filter((key) => {
    const hex = state.map.hexes[key];
    if (!hex || !hex.explored || key === state.startKey) return false;
    if (state.units.some((unit) => unit.key === key)) return false;
    const spot = api.handle.ProjectHexToScreen(key, 0.2);
    return spot && spot.x > 240 && spot.x < window.innerWidth - 260 && spot.y > 140 && spot.y < window.innerHeight - 220;
  });
  const key = candidates[Math.floor(candidates.length / 2)];
  const spot = api.handle.ProjectHexToScreen(key, 0.2);
  return { key, x: spot.x, y: spot.y };
});
await page.mouse.click(target.x, target.y);
await page.waitForTimeout(700);
const afterHexClick = await page.evaluate(() => window.PrairieFire.view.selectedKey);
Check("真实点击地块后选中该格", afterHexClick === target.key, `点击 ${target.key} → ${afterHexClick}`);

// 3. 真点部队 → 选中部队
const unitSpot = await page.evaluate(() => {
  const api = window.PrairieFire;
  const unit = api.GetState().units[0];
  const spot = api.handle.ProjectHexToScreen(unit.key, 0.2);
  return { key: unit.key, x: spot.x, y: spot.y };
});
await page.mouse.click(unitSpot.x, unitSpot.y);
await page.waitForTimeout(700);
const unitSelected = await page.evaluate(() => Boolean(window.PrairieFire.view.selectedUnitId));
Check("真实点击部队后选中部队", unitSelected, `key=${unitSpot.key}`);

// 4. 悬停反馈
const hoverSpot = await page.evaluate(() => {
  const api = window.PrairieFire;
  const state = api.GetState();
  const key = state.map.order.find((candidate) => {
    const hex = state.map.hexes[candidate];
    if (!hex || !hex.explored) return false;
    const spot = api.handle.ProjectHexToScreen(candidate, 0.2);
    return spot && Math.abs(spot.x - window.innerWidth * 0.62) < 120 && Math.abs(spot.y - window.innerHeight * 0.35) < 120;
  });
  const spot = api.handle.ProjectHexToScreen(key, 0.2);
  return { key, x: spot.x, y: spot.y };
});
await page.mouse.move(hoverSpot.x, hoverSpot.y, { steps: 4 });
await page.waitForTimeout(400);
const hoverKey = await page.evaluate(() => window.PrairieFire.view.hoverKey);
Check("悬停地块有 hover 反馈", hoverKey === hoverSpot.key, `期望 ${hoverSpot.key} 实际 ${hoverKey}`);

// 5-6. 页签开面板 / Esc 关闭
const tabRect = await page.evaluate(() => {
  const tab = document.querySelector(".pf-tab");
  const rect = tab.getBoundingClientRect();
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
});
await page.mouse.click(tabRect.x, tabRect.y);
await page.waitForTimeout(600);
Check("真实点击页签打开面板", await page.evaluate(() => Boolean(document.querySelector(".pf-panel-layer.is-open"))));
await page.keyboard.press("Escape");
await page.waitForTimeout(400);
Check("Esc 关闭面板", await page.evaluate(() => !document.querySelector(".pf-panel-layer.is-open")));

// 7. 结束回合推进
const endRect = await page.evaluate(() => {
  const button = document.querySelector(".pf-endturn");
  const rect = button.getBoundingClientRect();
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2, turnBefore: window.PrairieFire.GetState().turn };
});
await page.mouse.click(endRect.x, endRect.y);
await page
  .waitForFunction((before) => window.PrairieFire.GetState().turn > before, endRect.turnBefore, { timeout: 60000 })
  .catch(() => {});
const turnAfter = await page.evaluate(() => window.PrairieFire.GetState().turn);
Check("真实点击结束回合后回合推进", turnAfter > endRect.turnBefore, `turn ${endRect.turnBefore} → ${turnAfter}`);

Check("全程无页面错误", errors.length === 0, errors[0] || "");

await browser.close();
server.close();
console.log(failed ? `\n失败 ${failed} 项` : "\n交互测试全部通过：真实鼠标点击链路完整可用");
process.exit(failed ? 1 : 0);
