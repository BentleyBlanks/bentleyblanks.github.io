// 首关白盒真浏览器验收：数据正确之外，还要证明 HUD、首敌节拍与空气墙真的接上线。

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
page.on("pageerror", (error) => errors.push(`PAGEERROR ${String(error).slice(0, 260)}`));
page.on("console", (message) => {
  if (message.type() !== "error") return;
  if (/fonts\.(googleapis|gstatic)\.com/.test(message.location()?.url || "")) return;
  errors.push(`CONSOLE ${message.text().slice(0, 260)}`);
});

function Check(condition, message, detail = "") {
  if (!condition) throw new Error(`${message}${detail ? `：${detail}` : ""}`);
  console.log(`ok  ${message}${detail ? ` — ${detail}` : ""}`);
}

try {
  await page.goto(`http://127.0.0.1:${port}/Taierzhuang1938/?shot=1&phase=1&quality=low&scale=small`,
    { waitUntil: "load", timeout: 120000 });
  await page.waitForFunction(() => window.Tengxian?.state?.ready, null, { timeout: 180000 });
  const initial = await page.evaluate(() => {
    const T = window.Tengxian;
    T.player.debug.invincible = true;
    T.StepFrames(3);
    return {
      state: T.Debug.Whitebox(),
      visibleMarkers: [...document.querySelectorAll(".hudMarker")]
        .filter((el) => el.style.display !== "none").length,
    };
  });
  Check(initial.state.annotations === 7, "七个阶段说明已装载");
  Check(initial.state.enemyCount === 0, "取得控制时没有日军提前开火");
  Check(initial.state.hud.annotations.length >= 1, "出生镜头能读到场景说明");
  Check(initial.visibleMarkers === 1, "屏幕只显示当前任务路标");

  const scout = await page.evaluate(() => {
    const T = window.Tengxian;
    T.StepFrames(1500, 1 / 60, false);
    T.StepFrames(1);
    return T.Debug.Whitebox();
  });
  Check(scout.phaseTime >= 24 && scout.phaseTime < 27, "首敌在 20—30 秒窗口出现",
    `t=${scout.phaseTime.toFixed(1)}s`);
  Check(scout.enemyCount === 1, "首轮只暴露一名田坎侦察兵", `enemy=${scout.enemyCount}`);

  const wave = await page.evaluate(() => {
    const T = window.Tengxian;
    T.StepFrames(390, 1 / 60, false);
    T.StepFrames(1);
    return T.Debug.Whitebox();
  });
  Check(wave.phaseTime > 30 && wave.enemyCount > 1, "一分钟内展开完整交火",
    `t=${wave.phaseTime.toFixed(1)}s enemy=${wave.enemyCount}`);

  const moved = await page.evaluate(() => {
    const T = window.Tengxian;
    const point = T.battlefield.objectives.find((o) => o.id === "C1_Culvert");
    T.player.position.set(point.x, T.battlefield.GroundHeight(point.x, point.z), point.z);
    T.player.velocity.set(0, 0, 0);
    T.player.yaw = 0;
    T.StepFrames(2);
    const from = T.player.position.clone();
    for (let i = 0; i < 90; i += 1) {
      T.player.Update(1 / 60, {
        forward: 1, strafe: 0, sprint: false, ads: false, lean: 0,
        lookX: 0, lookY: 0, crouchPressed: false, pronePressed: false,
        breathHold: false, sensitivity: 1,
      }, null);
    }
    return T.player.position.distanceTo(from);
  });
  Check(moved > 1.5, "走廊中心的正常移动不被空气墙误拦", `distance=${moved.toFixed(2)}m`);

  const boundary = await page.evaluate(() => {
    const T = window.Tengxian;
    const y = T.battlefield.GroundHeight(-610, -205);
    T.player.position.set(-610, y, -205);
    T.player.velocity.set(0, 0, 0);
    T.StepFrames(2);
    return { x: T.player.position.x, z: T.player.position.z, view: T.Debug.Whitebox() };
  });
  Check(boundary.x > -610, "空气墙把越界玩家裁回可玩走廊",
    `position=(${boundary.x.toFixed(1)}, ${boundary.z.toFixed(1)})`);
  Check(boundary.view.hud.boundary.on && boundary.view.hud.boundary.hard,
    "越界后 HUD 明确显示返回战场提示");
  Check(errors.length === 0, "浏览器无脚本或控制台错误", errors.join(" | "));
  console.log("WhiteboxGuideBrowserTest PASS");
} finally {
  await browser.close();
  server.close();
}
