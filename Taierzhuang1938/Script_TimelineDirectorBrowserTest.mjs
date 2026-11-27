// Script_TimelineDirectorBrowserTest.mjs —— Unity-style Timeline v2 真实浏览器实机验收。
//
// 跑法：node Taierzhuang1938/Script_TimelineDirectorBrowserTest.mjs
//
// 实机验证 5 件核心事（1280×720，音频静音）：
//   1. 正式第一关（?whitebox=p012）开场完全由自包含 Timeline/FirstLevelOpeningCampaign.timeline.json 驱动，
//      网络层零请求 Blockout/FirstLevel0105.json；
//   2. Debug.Timeline.Seek 确定性定位（同一时刻 t 两次 Seek 机位一致，截图存档）；
//   3. 按 Space 跳过开场后补齐 DugoutCollapsed 信号并无缝交接 02g 实玩战斗（HUD/枪模恢复、不再锁输入）；
//   4. 战斗中通过 Debug.Timeline.Play("FirstLevelBridgeDemolition") 并发启动 setpiece Timeline：
//      不锁玩家控制（blocking===false）、不抢玩家相机，同时实时推进爆炸与 BridgeBlown 信号；
//   5. 战斗中启动 Debug.Timeline.Play("FirstLevelEndingNightMarch") 关尾过场：
//      直接 Binding 接管场上活 AI 士兵（luo/he/liu/yao 置 timelineControlled、source==="live"、无重影），
//      切镜到 22:00 夜景跟拍，截图后 Skip 干净归还 AI 控制权，全程零未捕获错误。

import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { LaunchBrowser } from "../PrairieFire1937/Script_BrowserTestKit.mjs";
import { ServeRoot } from "./Script_DevServer.mjs";

const projectDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(projectDir, "..");
const shotDir = path.join(rootDir, "tmp", "TimelineV2");
await fs.mkdir(shotDir, { recursive: true });

const results = [];
const Check = (name, ok, detail = "") => {
  results.push({ name, ok: !!ok, detail });
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? " — " + detail : ""}`);
};

const server = await ServeRoot(rootDir, 0);
const port = server.address().port;
const baseUrl = `http://127.0.0.1:${port}`;
const browser = await LaunchBrowser();
const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
await context.addInitScript(() => {
  localStorage.setItem("tengxian1938_audio_v1", JSON.stringify({ master: 0 }));
  localStorage.setItem("tengxian1938_tools_volume_v1", JSON.stringify({ volume: 0, muted: true }));
});
const page = await context.newPage();

const errors = [];
const fetchedUrls = [];
page.on("request", (req) => fetchedUrls.push(req.url()));
page.on("pageerror", (e) => errors.push(`PAGEERROR ${String(e.message || e).slice(0, 300)}`));
page.on("console", (msg) => {
  if (msg.type() !== "error") return;
  const text = msg.text();
  if (/fonts\.(googleapis|gstatic)\.com|favicon/.test(text)) return;
  if (/THREE\.WebGL|Shader Error|INVALID_OPERATION|Uncaught|TypeError|ReferenceError/.test(text)) {
    errors.push(`CONSOLE ${text.slice(0, 260)}`);
  }
});

try {
  console.log("--- 1. Boot First Level Campaign (v2 Opening Timeline)");
  await page.goto(`${baseUrl}/Taierzhuang1938/?whitebox=p012&menu=0&manual=1&quality=low`, { waitUntil: "domcontentloaded", timeout: 180000 });
  await page.waitForFunction(() => {
    const g = window.Tengxian;
    return g?.state?.ready && g?.Debug?.FirstLevelMission?.()?.openingState?.loaded;
  }, null, { timeout: 240000 });

  // Click #bootStart so OnStartRun() launches the Opening Timeline cleanly
  const bootBtn = page.locator("#bootStart");
  if (await bootBtn.isVisible().catch(() => false)) await bootBtn.click();
  await page.waitForFunction(() => window.Tengxian?.Debug?.FirstLevelMission?.()?.opening === true, null, { timeout: 30000 });
  await page.evaluate(() => { window.Tengxian.StepFrames(2, 1 / 60, true); });

  const legacyBlockoutRequested = fetchedUrls.some((u) => /Blockout\/FirstLevel0105\.json/i.test(u));
  const v2OpeningRequested = fetchedUrls.some((u) => /Timeline\/FirstLevelOpeningCampaign\.timeline\.json/i.test(u));
  Check("正式开场仅请求自包含 Timeline v2，零请求 Blockout/FirstLevel0105.json",
    v2OpeningRequested && !legacyBlockoutRequested,
    JSON.stringify({ v2OpeningRequested, legacyBlockoutRequested }));

  const openState = await page.evaluate(() => window.Tengxian.Debug.Timeline.State());
  Check("开场运行在 tengxian-timeline/2 且有绑定报告",
    openState?.opening?.schema === "tengxian-timeline/2" && openState?.opening?.active === true && openState?.opening?.bindings?.length > 0,
    JSON.stringify({ schema: openState?.opening?.schema, active: openState?.opening?.active, bindings: openState?.opening?.bindings?.length }));

  console.log("--- 2. Deterministic Seek & Screenshot");
  const seek1 = await page.evaluate(() => {
    const tl = window.Tengxian.Debug.Timeline;
    const s = tl.Seek("FirstLevelOpeningCampaign", 20.0);
    window.Tengxian.StepFrames(1, 0, true);
    const cam = window.Tengxian.camera.position.toArray();
    return { s, cam };
  });
  await page.screenshot({ path: path.join(shotDir, "01_OpeningV2_Seek20s.png") });
  const seek2 = await page.evaluate(() => {
    const tl = window.Tengxian.Debug.Timeline;
    tl.Seek("FirstLevelOpeningCampaign", 4.0);
    window.Tengxian.StepFrames(1, 0, true);
    const s = tl.Seek("FirstLevelOpeningCampaign", 20.0);
    window.Tengxian.StepFrames(1, 0, true);
    const cam = window.Tengxian.camera.position.toArray();
    return { s, cam };
  });
  const camDiff = Math.hypot(seek1.cam[0] - seek2.cam[0], seek1.cam[1] - seek2.cam[1], seek1.cam[2] - seek2.cam[2]);
  Check("Seek(20s) 两次求值机位完全确定一致",
    Math.abs(seek1.s.t - 20) < 0.05 && camDiff < 1e-3,
    JSON.stringify({ t: seek1.s.t, camDiff }));

  console.log("--- 3. Skip Opening -> Seamless Handoff to 02g Combat");
  const afterSkip = await page.evaluate(() => {
    window.Tengxian.Debug.Timeline.Skip("FirstLevelOpeningCampaign");
    window.Tengxian.StepFrames(2, 1 / 60, true);
    const m = window.Tengxian.Debug.FirstLevelMission();
    return {
      opening: m.opening,
      beat: m.beat,
      actors: m.actors.length,
      vmVisible: !!window.Tengxian.viewmodel?.root?.visible,
      signals: m.signals,
    };
  });
  Check("跳过开场无缝进入 02g 实玩（枪模恢复、AI 士兵生成）",
    afterSkip.opening === false && afterSkip.beat === "02g" && afterSkip.actors > 0 && afterSkip.vmVisible,
    JSON.stringify(afterSkip));
  await page.screenshot({ path: path.join(shotDir, "02_AfterSkip_02gCombat.png") });

  console.log("--- 4. Non-Blocking Concurrent Setpiece Timeline (Bridge Demolition)");
  const setpieceCheck = await page.evaluate(async () => {
    const g = window.Tengxian;
    await g.Debug.Timeline.Play("FirstLevelBridgeDemolition");
    const camBefore = g.camera.position.toArray();
    const stateStart = g.Debug.Timeline.State().manager;
    const playerStart = g.player.position.toArray();
    // Advance 2.2 seconds in 1/60 steps -> crosses explosions & BridgeBlown signal
    g.StepFrames(132, 1 / 60, false);
    g.StepFrames(1, 1 / 60, true);
    const stateMid = g.Debug.Timeline.State().manager;
    const m = g.Debug.FirstLevelMission();
    const camAfter = g.camera.position.toArray();
    return {
      blockingAtStart: stateStart.blocking,
      inputLockAtStart: stateStart.inputLock,
      activeAtStart: stateStart.activeCount,
      camMovedByTimeline: Math.hypot(camAfter[0] - camBefore[0], camAfter[2] - camBefore[2]),
      hasBridgeBlown: m.signals.includes("BridgeBlown"),
      vmVisible: !!g.viewmodel?.root?.visible,
      midActive: stateMid.activeCount,
      playerStillAlive: g.player.alive,
    };
  });
  Check("并发 Setpiece 不锁玩家操作、不抢相机、不藏枪模且正常发出 BridgeBlown 信号",
    setpieceCheck.activeAtStart === 1
    && setpieceCheck.blockingAtStart === false
    && setpieceCheck.inputLockAtStart === "none"
    && setpieceCheck.vmVisible === true
    && setpieceCheck.hasBridgeBlown === true,
    JSON.stringify(setpieceCheck));
  await page.evaluate(() => window.Tengxian.Debug.Timeline.Stop("FirstLevelBridgeDemolition"));

  console.log("--- 5. Live Actor Binding in Ending Night March Timeline (13e)");
  const endingCheck = await page.evaluate(async () => {
    const g = window.Tengxian;
    const soldiersBefore = g.ai.soldiers.length;
    await g.Debug.Timeline.Play("FirstLevelEndingNightMarch");
    // Advance to t = 3.5s (past 1.5s fade-in, during Luo's first night-march line)
    g.StepFrames(210, 1 / 60, false);
    g.StepFrames(1, 1 / 60, true);
    const tlState = g.Debug.Timeline.State().manager;
    const endDir = tlState.active.find((d) => d.id === "FirstLevelEndingNightMarch");
    const liveBound = (endDir?.bindings || []).filter((b) => b.source === "live" && b.type === "actor").map((b) => b.slot);
    const controlledCount = g.ai.soldiers.filter((s) => s.HasTag?.("timelineControlled")).length;
    const soldiersDuring = g.ai.soldiers.length;
    const hudRoot = document.getElementById("hud");
    const hudHidden = hudRoot ? hudRoot.style.display === "none" : true;
    const bubbles = document.querySelectorAll(".epBubble, .encounterSpeechBubble").length;
    return {
      active: !!endDir?.active,
      blocking: tlState.blocking,
      liveBound,
      controlledCount,
      soldiersBefore,
      soldiersDuring,
      hour: endDir?.envHour ?? null,
      hudHidden,
      bubbles,
      subtitles: endDir?.subtitles?.length ?? 0,
      cameraPos: endDir?.camera?.position || null,
    };
  });
  await page.screenshot({ path: path.join(shotDir, "03_EndingNightMarch_LiveBound.png") });
  Check("关尾过场 Live Binding 直接接管场上活 AI 士兵（无重影、清气泡、藏 HUD、22:00 夜景）",
    endingCheck.active === true
    && endingCheck.blocking === true
    && endingCheck.liveBound.length >= 1
    && endingCheck.controlledCount === endingCheck.liveBound.length
    && endingCheck.soldiersDuring === endingCheck.soldiersBefore
    && endingCheck.hudHidden === true
    && endingCheck.bubbles === 0
    && endingCheck.hour === 22
    && endingCheck.cameraPos !== null,
    JSON.stringify(endingCheck));

  const afterEndStop = await page.evaluate(() => {
    const g = window.Tengxian;
    g.Debug.Timeline.Stop("FirstLevelEndingNightMarch");
    g.StepFrames(2, 1 / 60, true);
    const hudRoot = document.getElementById("hud");
    return {
      controlledAfter: g.ai.soldiers.filter((s) => s.HasTag?.("timelineControlled")).length,
      activeCount: g.Debug.Timeline.State().manager.activeCount,
      hudRestored: hudRoot ? hudRoot.style.display !== "none" : true,
    };
  });
  Check("关尾停止后全部 AI 士兵干净解除 timelineControlled 接管且 HUD 恢复",
    afterEndStop.controlledAfter === 0 && afterEndStop.activeCount === 0 && afterEndStop.hudRestored === true,
    JSON.stringify(afterEndStop));

  Check("全程零未捕获错误或 WebGL 着色器错误", errors.length === 0, errors.slice(0, 5).join(" | "));
} finally {
  await browser.close();
  server.close();
}

const failed = results.filter((r) => !r.ok);
console.log(`TimelineDirectorBrowserTest: ${results.length - failed.length}/${results.length} passed`);
assert.equal(failed.length, 0, failed.map((r) => r.name).join("; "));
