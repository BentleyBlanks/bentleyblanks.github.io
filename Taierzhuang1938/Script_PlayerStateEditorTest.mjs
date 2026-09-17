// 玩家状态浮窗浏览器回归：真实入口、隐藏状态读数跟随玩法、冻结、只读与独立窗口生命周期。
import assert from "node:assert/strict";
import path from "node:path";
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { LaunchBrowser } from "../PrairieFire1937/Script_BrowserTestKit.mjs";
import { ServeRoot } from "./Script_DevServer.mjs";
import { PLAYER_STATE_FIELDS } from "./Script_EditorPlayerState.mjs";

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
    .filter({ has: page.locator('[data-editor="playerState"]') }).locator(":scope > .h").textContent(), "调试");
  // 三个设置 + 六个可叠加（渲染调试/性能剖析/WorldInfo/玩家状态/敌军 AI/关卡编排）+ 十六个编辑器
  // + 一个「全部关掉」。与 Script_EditorTest、Script_WorldInfoEditorTest 同源，加入口时三处一起改。
  assert.equal(await page.locator(".edPanel.launcher [data-editor]").count(), 26);
  const popupEvent = page.waitForEvent("popup");
  await page.click('[data-editor="playerState"]');
  const popup = await popupEvent;
  await popup.waitForSelector('[data-field="health"]');
  assert.equal(await popup.locator("[data-field]").count(), PLAYER_STATE_FIELDS.length);
  console.log(`ok   独立浮窗列出 ${PLAYER_STATE_FIELDS.length} 项状态`);

  const checks = await page.evaluate(() => {
    const T = window.Taierzhuang;
    const tool = T.editor.overlays.get("playerState");
    const player = T.player;
    const results = [];
    const Check = (name, ok) => results.push({ name, ok: !!ok });
    const Field = (id) => tool.ui.rows[id].value.textContent;
    const Keys = () => JSON.stringify({ h: player.health, s: player.stamina, p: player.position.toArray(),
      y: player.yaw, sup: player.suppression, w: player.wounds.length, st: player.stance });

    Check("入口开启独立浮窗且不启用互斥编辑器", !!tool.win && !tool.win.closed && !T.editor.ActiveId);
    const runtime = T.editor.host.game.PlayerRuntime();
    Check("装配层快照给出手上武器", runtime.weapon && runtime.weapon.id === T.editor.host.game.currentWeapon);
    const before = Keys();
    tool.Snapshot();
    tool.Refresh();
    Check("观察读数不会修改角色", Keys() === before);
    Check("没有字段读成异常占位以外的空白", Object.values(tool.ui.rows).every(entry => entry.value.textContent !== ""));
    Check("血量与散布读的是真值", Field("health") === player.health.toFixed(1)
      && Field("spread") === player.SpreadDeg(runtime.weapon).toFixed(2) + "°");

    T.editor.TogglePanel(false);
    Check("关目录后玩法恢复且浮窗保留", !T.editor.Capturing && T.editor.overlays.has("playerState"));

    // 挨一发：隐藏的失血、压制、闪红、晕眩都要跟着动，且变化行会闪。
    player.spawnGrace = 0;
    T.editor.UpdateOverlays(0.1);
    player.TakeHit(20, "leg", null, { bullet: true });
    T.editor.UpdateOverlays(0.1);
    Check("中弹后失血与伤口跟随", player.bleeding > 0 && Field("bleeding") === player.bleeding.toFixed(2)
      && Field("wounds").startsWith("腿"));
    Check("中弹后压制 / 闪红 / 晕眩跟随", player.suppression > 0
      && Field("suppression") === player.suppression.toFixed(3)
      && Field("hitFlash") === player.hitFlash.toFixed(3) && player.HitDisorientation > 0);
    Check("变化的行闪一下", tool.ui.rows.health.row.classList.contains("flash"));
    Check("血条按比例画", Math.abs(parseFloat(tool.ui.rows.health.fill.style.width) - player.health) < 0.2);
    Check("腿伤移速系数跟随", Field("legPenalty") === player.LegPenalty().toFixed(2) && player.LegPenalty() < 1);

    // 真实输入推帧：冲刺掉体力
    const stamina0 = player.stamina;
    T.Debug.Key("KeyW", true);
    T.Debug.Key("ShiftLeft", true);
    T.StepFrames(90, 1 / 60, false);
    T.Debug.Key("ShiftLeft", false);
    T.Debug.Key("KeyW", false);
    T.editor.UpdateOverlays(0.1);
    Check("冲刺后体力读数跟随", player.stamina < stamina0 && Field("stamina") === player.stamina.toFixed(3));

    // 冻结：玩法继续变，读数不动
    tool.SetFrozen(true);
    const frozenHealth = Field("health");
    player.TakeHit(10, "torso", null, { bullet: true });
    T.editor.UpdateOverlays(0.1);
    Check("冻结后读数停住", Field("health") === frozenHealth && player.health.toFixed(1) !== frozenHealth);
    tool.SetFrozen(false);
    Check("继续刷新后追上真值", Field("health") === player.health.toFixed(1));

    player.SetStance("crouch");
    T.StepFrames(30, 1 / 60, false);
    T.editor.UpdateOverlays(0.1);
    Check("姿态跟随", Field("stance") === "蹲伏");

    const oldReady = T.state.ready;
    T.state.ready = false;
    tool.Refresh();
    Check("换场景加载期间清空旧读数", Field("health") === "—" && tool.Snapshot() === null);
    T.state.ready = oldReady;
    tool.Refresh();
    Check("加载完成后恢复读数", Field("health") !== "—");
    return results;
  });
  for (const check of checks) {
    console.log((check.ok ? "ok   " : "FAIL ") + check.name);
    assert.ok(check.ok, check.name);
  }
  await fs.mkdir(path.join(root, "Taierzhuang1938/_shots"), { recursive: true });
  await popup.screenshot({ path: path.join(root, "Taierzhuang1938/_shots/PlayerState.png"), fullPage: true });
  await popup.close();
  await page.waitForFunction(() => !window.Taierzhuang.editor.overlays.has("playerState"));
  assert.equal(await page.evaluate(() => window.Taierzhuang.editor.entries.get("playerState").classList.contains("on")), false);
  console.log("ok   关闭浮窗后开关自动复位");

  const blocked = await page.evaluate(() => {
    const T = window.Taierzhuang;
    const open = window.open;
    const error = console.error;
    window.open = () => null;
    console.error = () => {};
    try {
      T.editor.Toggle("playerState");
      return !T.editor.overlays.has("playerState")
        && !T.editor.entries.get("playerState").classList.contains("on");
    } finally { window.open = open; console.error = error; }
  });
  assert.ok(blocked);
  console.log("ok   浏览器拦截弹窗时开关不残留");
  await page.evaluate(() => {
    const T = window.Taierzhuang;
    T.editor.Toggle("playerState");
    const win = T.editor.overlays.get("playerState").win;
    T.editor.Dispose();
    if (!win.closed || T.editor.overlays.size) throw new Error("Dispose 没有关闭浮窗");
  });
  console.log("ok   销毁套件关闭浮窗");
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
