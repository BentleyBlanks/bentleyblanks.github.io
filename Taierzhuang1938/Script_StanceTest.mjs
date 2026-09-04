// 三姿态回归：真实键盘/DOM → 输入路由 → 玩家/相机/碰撞体，兼验暂停隔离。
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { LaunchBrowser } from "../PrairieFire1937/Script_BrowserTestKit.mjs";
import { ServeRoot } from "./Script_DevServer.mjs";

const projectDir = path.dirname(fileURLToPath(import.meta.url));
const server = await ServeRoot(path.resolve(projectDir, ".."), 0);
const browser = await LaunchBrowser();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on("pageerror", (error) => errors.push(String(error)));
try {
  await page.goto(`http://127.0.0.1:${server.address().port}/Taierzhuang1938/?range=1&shot=1&quality=low&menu=0`,
    { waitUntil: "load", timeout: 120000 });
  await page.waitForFunction(() => window.Taierzhuang?.state?.ready, null, { timeout: 240000 });
  await page.evaluate(() => window.Taierzhuang.StepFrames(40));
  const Snapshot = () => page.evaluate(() => {
    const p = window.Taierzhuang.player;
    return { stance: p.stance, eye: p.eyeHeight, body: p.body.height, jump: p.jump.count,
      selected: document.querySelector('[data-player-stance][aria-pressed="true"]')?.dataset.playerStance };
  });
  const Press = async (key) => {
    await page.keyboard.press(key);
    await page.evaluate(() => window.Taierzhuang.StepFrames(50));
    return Snapshot();
  };
  const stand = await Snapshot();
  const crouch = await Press("c");
  const prone = await Press("z");
  const upright = await Press("Space");
  assert.deepEqual([stand.stance, crouch.stance, prone.stance, upright.stance], ["stand", "crouch", "prone", "stand"]);
  assert.equal(upright.jump, prone.jump, "Space 站起不能顺手跳跃");
  for (const row of [stand, crouch, prone, upright]) assert.equal(row.selected, row.stance, "HUD 与真实姿态一致");
  assert.ok(stand.eye > crouch.eye + 0.5 && crouch.eye > prone.eye + 0.5, "视线随姿态真实降低");
  assert.ok(stand.body > crouch.body + 0.4 && crouch.body > prone.body + 0.25, "碰撞体随姿态真实缩小");
  assert.equal((await Press("c")).stance, "crouch");
  assert.equal((await Press("c")).stance, "stand");
  assert.equal((await Press("z")).stance, "prone");
  assert.equal((await Press("c")).stance, "crouch", "卧姿可以直接切蹲姿");
  assert.equal((await Press("Space")).stance, "stand");
  await page.keyboard.down("c");
  await page.evaluate(() => window.Taierzhuang.StepFrames(15));
  await page.keyboard.down("c");
  await page.evaluate(() => window.Taierzhuang.StepFrames(15));
  assert.equal((await Snapshot()).stance, "crouch", "长按重复事件不能反复切姿态");
  await page.keyboard.up("c");
  for (const stance of ["prone", "crouch", "stand", "stand"]) {
    await page.locator(`[data-player-stance="${stance}"]`).click();
    await page.evaluate(() => window.Taierzhuang.StepFrames(50));
    assert.equal((await Snapshot()).stance, stance, "按钮是直接选择而非翻转");
  }
  const speeds = await page.evaluate(() => {
    const T = window.Taierzhuang;
    return ["stand", "crouch", "prone"].map((stance) => {
      T.player.Spawn(1400, 1466, 0); T.player.SetStance(stance); T.StepFrames(40);
      T.Debug.Key("KeyW", true); T.StepFrames(35);
      const speed = Math.hypot(T.player.velocity.x, T.player.velocity.z);
      T.Debug.Key("KeyW", false); T.StepFrames(20);
      return speed;
    });
  });
  assert.ok(speeds[0] > speeds[1] * 1.5 && speeds[1] > speeds[2] * 1.5, `姿态改变实际移速: ${speeds}`);
  const guarded = await page.evaluate(() => {
    const T = window.Taierzhuang;
    T.player.SetStance("crouch"); T.player.bipod = true;
    T.player.SetStance("stand"); const bipodReleased = !T.player.bipod;
    T.state.menu = true; T.Debug.Key("KeyZ");
    document.querySelector('[data-player-stance="prone"]').click();
    T.state.menu = false; T.StepFrames(30);
    return { bipodReleased, stance: T.player.stance, invalid: T.player.SetStance("unknown") };
  });
  assert.deepEqual(guarded, { bipodReleased: true, stance: "stand", invalid: false });
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 720 });
    const layout = await page.locator(".combatStanceChoices").evaluate((element) => {
      const r = element.getBoundingClientRect();
      const combat = document.querySelector(".hudCombat").getBoundingClientRect();
      const state = document.querySelector(".hudState").getBoundingClientRect();
      return { left: r.left, right: r.right, bottom: r.bottom, width: window.innerWidth,
        statusClear: state.bottom <= combat.top };
    });
    assert.ok(layout.left >= 0 && layout.right <= layout.width && layout.bottom <= 720, "姿态按钮不能出屏");
    assert.ok(layout.statusClear, "伤情/绷带文字不能压到武器和姿态面板");
    const outDir = path.join(projectDir, "_shots", "stance"); fs.mkdirSync(outDir, { recursive: true });
    await page.screenshot({ path: path.join(outDir, `StanceHud${width}.png`) });
  }
  assert.deepEqual(errors, []);
  console.log(`StanceTest PASS: 六向切换、站起不跳、长按、按钮、视线/碰撞/移速、暂停隔离、桌面/窄屏；速度 ${speeds.map((v) => v.toFixed(2)).join(" / ")}`);
} finally {
  await page.close(); await browser.close(); await new Promise((resolve) => server.close(resolve));
}
