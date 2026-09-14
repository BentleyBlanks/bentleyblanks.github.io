import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { LaunchBrowser } from "../PrairieFire1937/Script_BrowserTestKit.mjs";
import { ServeRoot } from "./Script_DevServer.mjs";

// 玩家白刃击杀日军的屏幕飞溅：走真实大刀输入与统一伤害链，不直接调用 HUD 伪造成功。
const project = path.dirname(fileURLToPath(import.meta.url));
const shots = path.join(project, "_shots", "MeleeKillBloodFx");
const server = await ServeRoot(path.resolve(project, ".."), 0);
const browser = await LaunchBrowser();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on("pageerror", (error) => errors.push(String(error)));
page.on("console", (message) => {
  if (message.type() === "error" && !/fonts|ERR_BLOCKED_BY_CLIENT/.test(message.text())) errors.push(message.text());
});

try {
  await page.route(/^https:\/\/fonts\.(googleapis|gstatic)\.com\//, (route) => route.abort("blockedbyclient"));
  await page.goto(`http://127.0.0.1:${server.address().port}/Taierzhuang1938/?shot=1&manual=1&melee=1&quality=medium&scale=small`,
    { waitUntil: "load", timeout: 120000 });
  await page.waitForFunction(() => window.Taierzhuang?.state?.ready
    && window.Taierzhuang?.state?.running && window.Taierzhuang?.Debug?.MeleeCombat,
  null, { timeout: 120000 });

  const before = await page.evaluate(async () => {
    const T = Taierzhuang;
    const image = new Image();
    image.src = "./Texture/Hud/Texture_HudMeleeKillBlood.webp?v=20260914c";
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    context.drawImage(image, 0, 0);
    // 准星周围必须是真透明 Alpha，不再依赖白底 multiply 伪透明。
    const x = Math.floor(canvas.width * .38), y = Math.floor(canvas.height * .30);
    const w = Math.floor(canvas.width * .24), h = Math.floor(canvas.height * .32);
    const pixels = context.getImageData(x, y, w, h).data;
    let stained = 0;
    for (let i = 0; i < pixels.length; i += 16) {
      if (pixels[i + 3] > 4) stained += 1;
    }
    const allPixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let visible = 0, leftVisible = 0, rightVisible = 0, samples = 0;
    for (let py = 0; py < canvas.height; py += 4) {
      for (let px = 0; px < canvas.width; px += 4) {
        samples += 1;
        const alpha = allPixels[(py * canvas.width + px) * 4 + 3];
        if (alpha <= 20) continue;
        visible += 1;
        if (px < canvas.width * .5) leftVisible += 1;
        else rightVisible += 1;
      }
    }
    return {
      image: [image.naturalWidth, image.naturalHeight],
      centerStainRatio: stained / (pixels.length / 16),
      visibleCoverage: visible / samples,
      directionalBias: leftVisible / Math.max(1, rightVisible),
      blood: T.hud.MeleeKillBloodState(),
    };
  });
  assert.deepEqual(before.image, [1920, 1080]);
  assert(before.centerStainRatio < .002, `准星留白被血点侵入：${before.centerStainRatio}`);
  assert(before.visibleCoverage > .02 && before.visibleCoverage < .10,
    `溅血应是少量局部泼溅，不是全屏 mask：${before.visibleCoverage}`);
  assert(before.directionalBias > 4, `溅血缺少单向泼溅感：${before.directionalBias}`);
  assert.equal(before.blood.active, false);

  const killed = await page.evaluate(() => {
    const T = Taierzhuang, lab = T.Debug.MeleeCombat;
    const Step = (seconds, render = false) => T.StepFrames(Math.round(seconds * 60), 1 / 60, render);
    lab.Select("DadaoOne"); lab.Pause(true); Step(.08);
    const enemy = T.ai.soldiers.find((soldier) => soldier.side === "ija");
    enemy.health = 40;
    enemy.position.set(T.player.position.x, T.player.position.y, T.player.position.z - 1.35);
    enemy.yaw = Math.PI;
    enemy.body?.Teleport(enemy.position.x, enemy.position.y, enemy.position.z);
    const playerHealth = T.player.health;
    T.Debug.Mouse(0, true); Step(.05); T.Debug.Mouse(0, false); Step(.28, true);
    return {
      enemyAlive: enemy.alive,
      playerHealthBefore: playerHealth,
      playerHealthAfter: T.player.health,
      blood: T.hud.MeleeKillBloodState(),
      damageOpacity: Number.parseFloat(getComputedStyle(T.hud.el.damage).opacity) || 0,
      confirms: T.hud.confirms.slice(-2),
    };
  });
  assert.equal(killed.enemyAlive, false, "真实大刀伤害必须先杀死目标");
  assert.equal(killed.playerHealthAfter, killed.playerHealthBefore, "砍杀飞溅不能伪装成玩家掉血");
  assert(killed.blood.active && killed.blood.opacity > .35, JSON.stringify(killed.blood));
  assert.match(killed.blood.backgroundImage, /Texture_HudMeleeKillBlood\.webp/);
  assert.equal(killed.blood.blendMode, "normal");
  assert.equal(killed.damageOpacity, 0, "击杀飞溅不得点亮受伤暗角");
  assert.equal(killed.confirms.at(-1), "kill");

  await page.evaluate(() => document.querySelector(".meleeLab")?.setAttribute("hidden", ""));
  fs.mkdirSync(shots, { recursive: true });
  await page.screenshot({ path: path.join(shots, "Scene_MeleeKillBlood_1280x720.png") });

  const lifecycle = await page.evaluate(() => {
    const T = Taierzhuang;
    T.StepFrames(60, 1 / 60, true);
    const faded = T.hud.MeleeKillBloodState();
    const health = T.player.health;
    T.player.TakeHit(5, "torso", { x: 1, y: 0, z: 0 }, { from: T.player.position.clone().add({ x: 1, y: 0, z: 0 }) });
    T.StepFrames(2, 1 / 60, true);
    return { faded, afterHurt: T.hud.MeleeKillBloodState(), healthBefore: health, healthAfter: T.player.health };
  });
  assert(!lifecycle.faded.active && lifecycle.faded.opacity === 0, JSON.stringify(lifecycle.faded));
  assert(lifecycle.healthAfter < lifecycle.healthBefore, "受伤夹具必须实际扣血");
  assert.equal(lifecycle.afterHurt.active, false, "玩家受伤不能触发砍杀飞溅");
  assert.deepEqual(errors, []);
  console.log("PASS melee kill blood: real Dadao kill, clean aim centre, independent injury state and timed fade");
} finally {
  await page.close().catch(() => {});
  await browser.close().catch(() => {});
  await server.close();
}
