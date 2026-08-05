// 真实浏览器 BGM 冒烟：用户手势起播、章节换曲、cue、音量与总开关。
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { LaunchBrowser } from "../PrairieFire1937/Script_BrowserTestKit.mjs";
import { ServeRoot } from "./Script_DevServer.mjs";
import { CHAPTER_BGM } from "./Data_BgmConfig.mjs";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const server = await ServeRoot(rootDir, 0);
const port = server.address().port;
const browser = await LaunchBrowser();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on("pageerror", (error) => errors.push(String(error)));
page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });

try {
  await page.goto(`http://127.0.0.1:${port}/TunnelLight1943/`, { waitUntil: "load", timeout: 60000 });
  await page.click("#startButton");
  await page.waitForFunction(() => window.TunnelLight?.GetBgmState()?.active === "withTheseHands", null, { timeout: 30000 });
  let state = await page.evaluate(() => window.TunnelLight.GetBgmState());
  assert.equal(state.paused, false, "第一章 BGM 应在用户点击后起播");
  assert.ok(state.currentTime >= CHAPTER_BGM[0].cue - 0.5, "第一章应从指定 cue 起播");

  await page.evaluate(() => window.TunnelLight.JumpToChapter(3));
  await page.waitForFunction(() => window.TunnelLight?.GetBgmState()?.active === "tunnelExploration", null, { timeout: 30000 });
  state = await page.evaluate(() => window.TunnelLight.GetBgmState());
  assert.ok(state.currentTime >= CHAPTER_BGM[3].cue - 0.5, "第四章应从指定 cue 起播");

  await page.click("#btnSettings");
  await page.$eval("#volMusic", (input) => {
    input.value = "35";
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  state = await page.evaluate(() => window.TunnelLight.GetBgmState());
  assert.equal(state.musicLevel, 0.35, "配乐滑块应控制录音 BGM 所在总线");

  await page.click("#btnSound");
  state = await page.evaluate(() => window.TunnelLight.GetBgmState());
  assert.equal(state.paused, true, "关闭声音应暂停 BGM，而不是让它静音空跑");
  await page.click("#btnSound");
  await page.waitForFunction(() => window.TunnelLight?.GetBgmState()?.paused === false, null, { timeout: 10000 });

  assert.deepEqual(errors, [], `页面不应有异常：${errors.join(" | ")}`);
  console.log("✓ BGM 用户手势起播 / 章节换曲 / cue / 音量 / 总开关");
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
