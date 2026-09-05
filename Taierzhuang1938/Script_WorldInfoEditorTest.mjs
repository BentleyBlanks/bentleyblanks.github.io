// WorldInfo 浏览器回归：真实入口、角色读数与独立浮窗生命周期。
import assert from "node:assert/strict";
import path from "node:path";
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { LaunchBrowser } from "../PrairieFire1937/Script_BrowserTestKit.mjs";
import { ServeRoot } from "./Script_DevServer.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const server = await ServeRoot(root, 0);
const browser = await LaunchBrowser();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on("pageerror", (error) => errors.push(String(error)));
try {
  await page.goto((process.argv[2] || "http://127.0.0.1:" + server.address().port)
    + "/Taierzhuang1938/?range=1&quality=low&scale=small&menu=0&audio=0",
  { waitUntil: "load", timeout: 180000 });
  await page.waitForFunction(() => window.Taierzhuang?.state.ready && window.Taierzhuang?.editor,
    null, { timeout: 300000 });
  await page.click("#bootStart");
  await page.click(".edGear");
  assert.equal(await page.locator(".edPanel.launcher .edSection")
    .filter({ has: page.locator('[data-editor="worldInfo"]') }).locator(":scope > .h").textContent(), "调试");
  assert.equal(await page.locator(".edPanel.launcher [data-editor]").count(), 22);
  const popupEvent = page.waitForEvent("popup");
  await page.click('[data-editor="worldInfo"]');
  const popup = await popupEvent;
  await popup.waitForSelector('[data-field="x"]');
  const checks = await page.evaluate(() => {
    const T = window.Taierzhuang;
    const tool = T.editor.overlays.get("worldInfo");
    const results = [];
    const Check = (name, ok) => results.push({ name, ok: !!ok });
    const Near = (a, b) => Math.abs(a - b) < 1e-6;
    const player = T.player;
    const before = { position: player.position.clone(), yaw: player.yaw, pitch: player.pitch };
    Check("入口开启独立浮窗且不启用互斥编辑器", !!tool.win && !tool.win.closed && !T.editor.ActiveId);
    const first = tool.Snapshot();
    Check("脚底世界坐标与共享地形高度一致", Near(first.y, player.position.y)
      && Near(first.ground, player.world.GroundHeight(first.x, first.z)));
    Check("偏航俯仰以度显示", Near(first.yaw, player.yaw * 180 / Math.PI)
      && Near(first.pitch, player.pitch * 180 / Math.PI));
    Check("观察读数不会修改角色", player.position.equals(before.position)
      && player.yaw === before.yaw && player.pitch === before.pitch);
    T.editor.Open("controls");
    Check("设置与浮窗可同时打开", T.editor.ActiveId === "controls" && T.editor.overlays.has("worldInfo"));
    T.editor.TogglePanel(false);
    Check("关目录后玩法恢复且浮窗保留", !T.editor.Capturing && T.editor.overlays.has("worldInfo"));

    // 用真实输入与帧循环推进，不拿修改 DOM 冒充实时读数。
    T.Debug.Key("KeyW", true);
    T.StepFrames(30, 1 / 60, false);
    T.Debug.Key("KeyW", false);
    T.editor.UpdateOverlays(0.1);
    const moved = tool.Snapshot();
    Check("移动后实时读数跟随角色", Math.hypot(moved.x - first.x, moved.z - first.z) > 0.1
      && tool.ui.x.textContent === moved.x.toFixed(3) + " m"
      && tool.ui.z.textContent === moved.z.toFixed(3) + " m");
    T.StepFrames(30, 1 / 60, false);
    T.Debug.Key("Space", true);
    T.StepFrames(8, 1 / 60, false);
    T.Debug.Key("Space", false);
    T.editor.UpdateOverlays(0.1);
    const jump = tool.Snapshot();
    Check("跳跃显示距地形高度与离地状态", jump.clearance > 0.1 && jump.grounded === "否"
      && tool.ui.clearance.textContent === jump.clearance.toFixed(3) + " m");
    T.StepFrames(120, 1 / 60, false);
    player.SetStance("crouch");
    T.StepFrames(45, 1 / 60, false);
    T.editor.UpdateOverlays(0.1);
    const crouch = tool.Snapshot();
    Check("蹲伏更新眼高与姿态", crouch.eyeHeight < first.eyeHeight && crouch.stance === "蹲伏"
      && Near(crouch.eyeY, crouch.y + crouch.eyeHeight) && tool.ui.stance.textContent === "蹲伏");

    T.editor.TogglePanel(true);
    const savedCamera = T.camera.position.clone();
    T.camera.position.set(900, 800, 700);
    tool.Refresh();
    Check("编辑器相机移动不会污染角色位置", Near(tool.Snapshot().x, player.position.x)
      && tool.ui.y.textContent === player.position.y.toFixed(3) + " m");
    T.camera.position.copy(savedCamera);
    const oldReady = T.state.ready;
    T.state.ready = false;
    tool.Refresh();
    Check("换场景加载期间清空旧读数", tool.ui.x.textContent === "—" && tool.Snapshot() === null);
    T.state.ready = oldReady;
    tool.Refresh();
    Check("加载完成后恢复读数", tool.ui.x.textContent !== "—");
    return results;
  });
  for (const check of checks) {
    console.log((check.ok ? "ok   " : "FAIL ") + check.name);
    assert.ok(check.ok, check.name);
  }
  await fs.mkdir(path.join(root, "Taierzhuang1938/_shots"), { recursive: true });
  await popup.screenshot({ path: path.join(root, "Taierzhuang1938/_shots/WorldInfo.png"), fullPage: true });
  await page.screenshot({ path: path.join(root, "Taierzhuang1938/_shots/WorldInfoMenu.png") });
  await popup.close();
  await page.waitForFunction(() => !window.Taierzhuang.editor.overlays.has("worldInfo"));
  assert.equal(await page.locator('[data-editor="worldInfo"]').evaluate(node => node.classList.contains("on")), false);
  console.log("ok   关闭浮窗后开关自动复位");
  const nextPopupEvent = page.waitForEvent("popup");
  await page.click('[data-editor="worldInfo"]');
  const nextPopup = await nextPopupEvent;
  await page.click('[data-editor=""]');
  if (!nextPopup.isClosed()) await nextPopup.waitForEvent("close");
  assert.ok(nextPopup.isClosed());
  console.log("ok   全部关掉关闭独立窗口");

  const blocked = await page.evaluate(() => {
    const T = window.Taierzhuang;
    const open = window.open;
    const error = console.error;
    window.open = () => null;
    console.error = () => {};
    try {
      T.editor.Toggle("worldInfo");
      return !T.editor.overlays.has("worldInfo")
        && !T.editor.entries.get("worldInfo").classList.contains("on");
    } finally { window.open = open; console.error = error; }
  });
  assert.ok(blocked);
  console.log("ok   浏览器拦截弹窗时开关不残留");
  await page.evaluate(() => {
    const T = window.Taierzhuang;
    T.editor.Toggle("worldInfo");
    const win = T.editor.overlays.get("worldInfo").win;
    T.editor.Dispose();
    if (!win.closed || T.editor.overlays.size) throw new Error("Dispose 没有关闭浮窗");
  });
  console.log("ok   销毁套件关闭浮窗");
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
