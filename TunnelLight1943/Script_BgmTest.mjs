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
// BGM 用的是 new Audio()（不在 DOM 上），测试要把播放头推到绕圈点，
// 得在页面脚本跑起来之前把构造器钩住
// 声音默认是**关**的（2026-08-14 用户定：进来先静着）。这一支测的是
// "开了声音之后 BGM 怎么走"，所以在页面脚本跑起来之前先把那面本地开关拨开——
// 与玩家按右上角那枚按钮是同一条路（按钮在游戏里才出现，测试点不着）
await page.addInitScript(() => {
  localStorage.setItem("tunnelLight1943.sound", "on");
  window.__bgmEls = [];
  const OrigAudio = window.Audio;
  window.Audio = function PatchedAudio(...args) {
    const el = new OrigAudio(...args);
    window.__bgmEls.push(el);
    return el;
  };
  window.Audio.prototype = OrigAudio.prototype;
});
const errors = [];
page.on("pageerror", (error) => errors.push(String(error)));
page.on("console", (message) => {
  if (message.type() !== "error") return;
  // 外部字体源拉不下来不算页面事故（同 Script_RenderHealthTest 的豁免）
  if (/^https:\/\/fonts\.(googleapis|gstatic)\.com\//.test(message.location()?.url || "")) return;
  errors.push(message.text());
});

try {
  await page.goto(`http://127.0.0.1:${port}/TunnelLight1943/`, { waitUntil: "load", timeout: 60000 });
  await page.click("#startButton");
  // —— 序 · 那天必须是**静的**（2026-08-14）——
  //
  // 剧本第一句就是〔音〕「没有音乐。」，吵的都在墙外。可 BGM 一直是按
  // `CHAPTER_BGM[chapterIndex]` 无条件铺的，第一章那首从开机就在响——这个设计
  // 在实机里一秒都没成立过。现在序的三拍声明 `bgm: null`，这条断言守着它。
  // 进来先是章节卡（phase="chapterCard"），序的第一拍已经在跑
  await page.waitForFunction(() => !!window.TunnelLight?.state, null, { timeout: 30000 });
  await page.waitForTimeout(2500);
  let state = await page.evaluate(() => window.TunnelLight.GetBgmState());
  assert.ok(!state?.active, `序 · 那天不许有配乐（剧本首句：没有音乐），实际 active=${state?.active}`);

  // 跳过序（c1_forage 是第一章正片的头一拍）之后，章 BGM 才该接上
  await page.evaluate(() => window.TunnelLight.JumpToBeat(0, 4));
  await page.waitForFunction(() => window.TunnelLight?.GetBgmState()?.active === "withTheseHands", null, { timeout: 30000 });
  state = await page.evaluate(() => window.TunnelLight.GetBgmState());
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

  // —— 绕圈不许放进尾奏（2026-08-10 用户报「隔一段时间就停下来然后重新播放」）——
  //
  // 这几首是完整成品曲，末尾渐弱到静音：第一章那首最后 20 秒从 −27dB 淡到 −71dB。
  // 老做法一路放到 ended 再 seek 回 cue，技术上只断 0.01 秒，可耳朵听见的是
  // "音乐没了 → 静十几秒 → 又从头响"。所以这里量的不是"断没断"，是
  // **有没有走进尾奏**、以及**接缝处音乐有没有掉下去**。
  // 回第一章要**跳过序**（序那三拍是静的），否则等的是一首本来就不该响的曲子
  await page.evaluate(() => { window.TunnelLight.JumpToChapter(0); });
  await page.waitForFunction(() => !!window.TunnelLight?.state, null, { timeout: 10000 });
  await page.evaluate(() => window.TunnelLight.JumpToBeat(0, 4));
  await page.waitForFunction(() => window.TunnelLight?.GetBgmState()?.active === "withTheseHands", null, { timeout: 30000 });
  await page.waitForFunction(() => window.TunnelLight?.GetBgmState()?.paused === false, null, { timeout: 30000 });
  const loopEnd = CHAPTER_BGM[0].loopEnd;
  assert.ok(loopEnd > 0 && loopEnd < 305, "第一章必须声明 loopEnd（放到这儿就绕回去，别进尾奏）");

  // 把正在响的那个播放头推到绕圈点前 5 秒
  const jumped = await page.evaluate((end) => {
    const el = window.__bgmEls.find((e) => !e.paused);
    if (!el) return false;
    el.currentTime = Math.max(0, end - 5);
    return true;
  }, loopEnd);
  assert.ok(jumped, "得能拿到正在放的那个 <audio>");

  // 过接缝：每 200ms 采一次，记最低的"总音乐量"和最远走到过哪儿
  const seam = await page.evaluate(async (end) => {
    const out = { minTotal: Infinity, maxTime: 0, swapped: false, first: null, samples: 0 };
    const started = window.TunnelLight.GetBgmState().currentTime;
    out.first = started;
    for (let i = 0; i < 60; i += 1) {
      const st = window.TunnelLight.GetBgmState();
      out.samples += 1;
      out.maxTime = Math.max(out.maxTime, st.currentTime);
      // 起播头两秒本来就在爬升，不算进最低值
      if (i > 6) out.minTotal = Math.min(out.minTotal, st.totalGain);
      if (st.currentTime < end - 10) out.swapped = true;      // 已经绕回 cue 那一带
      await new Promise((r) => setTimeout(r, 200));
    }
    return out;
  }, loopEnd);

  assert.ok(seam.swapped, `放到 loopEnd 必须绕回 cue（最远只走到 ${seam.maxTime.toFixed(1)}s）`);
  // 容差 2.8s：换圈是 loopEnd−3.2s 起第二路交叉淡化，旧的那路在淡出尾巴里
  // 还会往前走一小段；慢机器（无头 CI/沙箱）上泵的节拍再晚半拍，实测会到
  // +2.0~2.3s。第一章那首的尾奏渐弱有 20s，+2.8 仍远在听得出掉音量之前——
  // 这条守的是"别把渐弱端上来给玩家听"，不是守某台机器的调度精度
  assert.ok(seam.maxTime <= loopEnd + 2.8,
    `绝不许走进尾奏：loopEnd=${loopEnd}s，实际放到了 ${seam.maxTime.toFixed(1)}s`);
  assert.ok(seam.minTotal >= CHAPTER_BGM[0].gain * 0.55,
    `接缝处音乐不许掉下去（目标 ${CHAPTER_BGM[0].gain}，最低只剩 ${seam.minTotal}）`);
  const after = await page.evaluate(() => window.TunnelLight.GetBgmState());
  assert.equal(after.paused, false, "绕完圈还得在响");
  assert.ok(after.currentTime >= CHAPTER_BGM[0].cue - 1, "绕回去的落点应是 cue，不是片头");

  assert.deepEqual(errors, [], `页面不应有异常：${errors.join(" | ")}`);
  console.log("✓ BGM 用户手势起播 / 章节换曲 / cue / 音量 / 总开关");
  console.log(`✓ BGM 绕圈不进尾奏（最远 ${seam.maxTime.toFixed(1)}s ≤ loopEnd ${loopEnd}s，接缝最低 ${seam.minTotal}）`);
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
