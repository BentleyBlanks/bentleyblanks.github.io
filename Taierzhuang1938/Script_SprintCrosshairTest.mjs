// Dynamic-crosshair browser regression. Drives the real Shift+W and right-mouse paths.
//
// 这一版守的是**准心画的缝 = Player.SpreadDeg 的屏幕投影**：
// 上一版守的只是"跑起来比站着大 8 px"，而那两个数都是手感常数，
// 跑动时准心比真实散布窄了六成也照样过（2026-08-25 的返工就是从这里开始的）。

import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { LaunchBrowser } from "../PrairieFire1937/Script_BrowserTestKit.mjs";
import { ServeRoot } from "./Script_DevServer.mjs";

const projectDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(projectDir, "..");
const server = await ServeRoot(rootDir, 0);
const port = server.address().port;
const browser = await LaunchBrowser();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on("pageerror", (error) => errors.push(String(error)));
page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });

await page.goto(`http://127.0.0.1:${port}/Taierzhuang1938/?shot=1&phase=2&quality=medium&scale=small`,
  { waitUntil: "load", timeout: 120000 });
await page.waitForFunction(() => window.Taierzhuang?.state?.ready, null, { timeout: 180000 });

const report = await page.evaluate(() => {
  const T = window.Taierzhuang;
  const read = () => {
    const e = document.querySelector(".hudCrosshair");
    const box = e.getBoundingClientRect();
    const reticle = T.Debug.Reticle();
    const armStyle = getComputedStyle(e.querySelector(".arm.left"));
    return {
      on: e.classList.contains("on"),
      sprint: e.classList.contains("sprint"),
      gap: parseFloat(e.style.getPropertyValue("--gap")),
      armPx: parseFloat(armStyle.width),
      centerX: box.left,
      centerY: box.top,
      hidden: e.getAttribute("aria-hidden"),
      label: e.getAttribute("aria-label"),
      arms: e.querySelectorAll(".arm").length,
      // 三个数必须一起读：真实散布、HUD 画出来的缝、按当前视场重算的应画值。
      spreadDeg: reticle.spreadDeg,
      drawn: reticle.gap,
      expected: reticle.expected,
    };
  };
  // 缝要追到稳态再读：SetCrosshair 是指数平滑的（张开 50 ms / 收拢 120 ms）。
  const settle = () => T.StepFrames(45);

  T.player.health = 100;
  T.player.spawnGrace = 99;
  for (const soldier of T.ai.soldiers) if (soldier.side === "ija") soldier.position.x += 500;
  // 出生工位记一笔，末尾那张出图要从这里重新起跑（见下面的截图段）。
  window.__spawn = { x: T.player.position.x, z: T.player.position.z, yaw: T.player.yaw };
  settle();
  const idle = read();

  T.Debug.Key("ShiftLeft", true);
  T.Debug.Key("KeyW", true);
  T.StepFrames(90);
  // planarSpeed 必须和 sprintValue 一起读：sprint 是**按键弹簧**，顶着墙也照样充到 1。
  // 真正撑开散布的是 SpreadDeg 里的速度项，所以走没走动要单独取证 —— 见下方断言。
  const running = {
    ...read(),
    sprintValue: T.player.sprint,
    planarSpeed: Math.hypot(T.player.velocity.x, T.player.velocity.z),
  };

  T.Debug.Key("ShiftLeft", false);
  T.Debug.Key("KeyW", false);
  settle();
  // 蹲下：散布按 STANCE 收到 0.66，准心必须跟着收。
  T.Debug.Key("KeyC");
  settle();
  const crouch = { ...read(), stance: T.player.stance };
  T.Debug.Key("KeyC");
  settle();

  document.dispatchEvent(new MouseEvent("mousedown", { button: 2, bubbles: true }));
  T.StepFrames(45);
  const ads = { ...read(), adsValue: T.player.ads };
  document.dispatchEvent(new MouseEvent("mouseup", { button: 2, bubbles: true }));
  settle();

  const difficulty = T.Debug.Tables().DIFFICULTY;
  difficulty.showCrosshair = false;
  T.StepFrames(2);
  const realistic = read();
  difficulty.showCrosshair = true;

  return { idle, running, crouch, ads, realistic };
});

const screenshotPath = path.join(os.tmpdir(), "TaierzhuangSprintCrosshair.png");
// 出图要**回到被断言的那一刻**，不能在原地接着再跑 90 帧：上面读 running 的时候
// 人已经从出生工位往前推了七米，再跑一段就贴到街对面的院墙上了，
// 拍出来是一面砖 —— 看图的人分不清"准心红了"和"人撞墙了"，
// 2026-08-27 那次误判就有这张图一份功劳。
await page.evaluate(() => {
  const T = window.Taierzhuang;
  const at = window.__spawn;
  if (at) T.player.Spawn(at.x, at.z, at.yaw);
  T.Debug.Key("ShiftLeft", true);
  T.Debug.Key("KeyW", true);
  T.StepFrames(90);
});
await page.screenshot({ path: screenshotPath });

console.log(JSON.stringify({ ...report, screenshotPath, errors }, null, 2));
// 站着不动的缝就是当时那支枪的腰射散布：汉阳造 3.0° 在 720p / 55° 上是 18.1 px。
// 上一版这里是 5.0 px —— 那才是"跑起来还这么准"的来源。
const tracks = (row) => Math.abs(row.gap - row.expected) < 0.6 && row.spreadDeg > 0;
const centered = (row) => Math.abs(row.centerX - 640) < 0.1 && Math.abs(row.centerY - 360) < 0.1;

// 【2026-08-27 返工】原来这里是一个大 && 串成的 passed，红了只打印一行
// "准心缝 = 真实散布" —— 十几个子条件哪个断的一概不知，只能自己写探针去猜。
// 那一轮真正断的是**出生点**：城防图东侧重建把院区铺到了 L2 出生点上，
// 人贴着院墙，按 W 一米都走不出去，于是散布里的速度项根本没吃进去，
// 红出来的却是"缝没撑开"。所以这一版做两件事：拆成具名条目，
// 并且把"真的跑起来了"单独立成一条 —— sprint 是**按键弹簧**，
// 人顶在墙上它照样充到 1，光看它永远发现不了走没走动。
//
// 冲刺倍率 2.5 保持不变，它没有过期：满速时缝是站姿的
// SpreadDeg 走动项（×1.85，见 Script_Player 的【2026-08-25 调走动那一项】）
// 乘以 CROSSHAIR.sprintBloom（×1.5）≈ 2.78 倍。注意这条断言**同时压着两个常数**，
// 余量只有一成上下：再收一次走动散布就得连它一起重算。
const checks = [
  ["站着：准心亮着、四臂、非冲刺态", report.idle.on && !report.idle.sprint && report.idle.arms === 4],
  ["站着：缝 = 真实散布锥", tracks(report.idle) && report.idle.gap > 14 && report.idle.armPx >= 9],
  ["冲刺：准心仍亮着并挂上 sprint 态", report.running.on && report.running.sprint],
  ["冲刺：弹簧充满", report.running.sprintValue > 0.95],
  // 顶着墙的"冲刺"不算冲刺：走不动就没有速度项，撑开量无从谈起。
  ["冲刺：人真的跑起来了（出生点前方是空地）", report.running.planarSpeed > 4.5],
  ["冲刺：缝 = 真实散布锥", tracks(report.running)],
  ["冲刺：缝比站着明显撑开", report.running.gap > report.idle.gap * 2.5],
  ["冲刺：读屏标签是冲刺态", report.running.label === "冲刺扩散准心"],
  ["蹲下：姿态收窄，缝跟着收", report.crouch.stance === "crouch" && report.crouch.gap < report.idle.gap * 0.8],
  ["准心恒在屏幕正中（站/跑）", centered(report.idle) && centered(report.running)],
  ["开镜：准心隐藏", !report.ads.on && report.ads.adsValue > 0.9],
  ["写实档：准心隐藏", !report.realistic.on],
  ["无控制台报错", errors.length === 0],
];

let passed = true;
for (const [label, ok] of checks) {
  if (!ok) passed = false;
  console.log(`${ok ? "ok  " : "FAIL"} ${label}`);
}
console.log(`${passed ? "ok  " : "FAIL"} 准心缝 = 真实散布：跑动撑开、蹲下收窄、开镜与写实档隐藏`);

await browser.close();
server.close();
process.exit(passed ? 0 : 1);
