/** Run a local preview first, then: node GravityTank/Script_LaunchSmokeTest.mjs [game URL].
 * Requires playwright-core and an installed Edge/Chrome. Test hooks are injected only into
 * the intercepted module response; the shipped game does not expose mutable test state.
 */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdir } from "node:fs/promises";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright-core");
const url = process.argv[2] || "http://127.0.0.1:8080/GravityTank/";
const output = new URL("../tmp/GravityTankQa/", import.meta.url);
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: process.env.GRAVITY_TANK_BROWSER || "msedge", headless: true });
const errors = [];

async function OpenPage(options = {}, setup = async () => {}) {
  const page = await browser.newPage(options);
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/Script_Game.mjs?*", async (route) => {
    const response = await route.fetch();
    await route.fulfill({ response, body: `${await response.text()}\nglobalThis.gravityTankTest = game;` });
  });
  await setup(page);
  await page.goto(url, { waitUntil: "domcontentloaded" });
  return page;
}

async function Ready(page) {
  await page.waitForFunction(() => window.gravityTankTest?.state === "ready" && document.getElementById("bootOverlay").hidden);
}

async function Screenshot(page, name) {
  await page.screenshot({ path: new URL(name, output).pathname.replace(/^\/(\w:)/, "$1"), fullPage: false });
}

try {
  // Slow optional art/fonts and audio must not gate the start menu or an actual campaign.
  const mobile = await OpenPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 }, async (page) => {
    await page.addInitScript(() => {
      window.bootSamples = [];
      document.addEventListener("DOMContentLoaded", () => {
        const bar = document.getElementById("bootProgress");
        new MutationObserver(() => window.bootSamples.push(Number(bar.getAttribute("aria-valuenow"))))
          .observe(bar, { attributes: true, attributeFilter: ["aria-valuenow"] });
      });
    });
    await page.route(/Font_|Audio|Texture_RouletteArcadeRim/, (route) => route.abort());
    await page.route("**/Texture_ClassicSheet.png", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 400));
      await route.continue();
    });
  });
  await mobile.locator("#bootOverlay").waitFor({ state: "visible" });
  assert.equal(await mobile.locator("#startButton").isDisabled(), true);
  await Screenshot(mobile, "Loading.png");
  await Ready(mobile);
  const progress = await mobile.evaluate(() => window.bootSamples);
  assert(progress.some((value) => value > 0 && value < 100), "actual intermediate progress is visible");
  assert.equal(progress.at(-1), 100);
  assert(progress.every((value, i) => i === 0 || value >= progress[i - 1]));
  assert.equal(await mobile.locator("[data-paint]").count(), 6);
  // Verify the actual barrel rendering in every paint/direction, not just hull pixels.
  const barrels = await mobile.evaluate(() => {
    const game = window.gravityTankTest;
    const failures = [];
    for (const button of document.querySelectorAll("[data-paint]")) {
      button.click();
      const expected = getComputedStyle(button.firstElementChild).backgroundColor.match(/\d+/g).slice(0, 3).map(Number);
      const sprite = game.PickBarrelImage({}, true);
      const source = document.createElement("canvas");
      source.width = 10; source.height = 18;
      const sourceCtx = source.getContext("2d");
      sourceCtx.drawImage(game.images.barrelPlayer, 0, 0);
      const original = sourceCtx.getImageData(0, 0, 10, 18).data;
      sourceCtx.clearRect(0, 0, 10, 18);
      sourceCtx.drawImage(sprite, 0, 0);
      const painted = sourceCtx.getImageData(0, 0, 10, 18).data;
      for (let i = 0; i < painted.length; i += 4) {
        if (painted[i + 3] !== original[i + 3]) failures.push("barrel alpha changed");
        if (original[i] === 20 && original[i + 3] === 255 && painted[i] !== 20) failures.push("muzzle black changed");
      }
      for (const dir of ["up", "down", "left", "right", "upRight", "downRight", "upLeft", "downLeft"]) {
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = 80;
        const ctx = canvas.getContext("2d");
        game.DrawTankBarrel(ctx, { x: 16, y: 16, w: 48, h: 48, dir }, true);
        const pixels = ctx.getImageData(0, 0, 80, 80).data;
        let matching = 0;
        for (let i = 0; i < pixels.length; i += 4) {
          if (pixels[i + 3] === 255 && expected.every((channel, c) => pixels[i + c] === channel)) matching++;
        }
        if (matching < 30) failures.push(`${button.dataset.paint}/${dir} barrel not painted`);
      }
      if (game.PickBarrelImage({}, false) !== game.images.barrelEnemy) failures.push("enemy barrel changed");
    }
    return failures;
  });
  assert.deepEqual(barrels, [], "all six paints must reach the separate barrel at all eight angles");
  await mobile.getByRole("button", { name: "樱花粉", exact: true }).click();
  assert.equal(await mobile.locator("[data-paint=pink]").getAttribute("aria-pressed"), "true");
  await mobile.getByRole("button", { name: "冰川蓝", exact: true }).focus();
  await mobile.keyboard.press("Space");
  assert.equal(await mobile.locator("[data-paint=blue]").getAttribute("aria-pressed"), "true", "Space on a color must select it, not start the game");
  assert.equal(await mobile.evaluate(() => window.gravityTankTest.state), "ready");
  await mobile.getByRole("button", { name: "樱花粉", exact: true }).click();
  await mobile.reload({ waitUntil: "domcontentloaded" });
  await Ready(mobile);
  assert.equal(await mobile.locator("[data-paint=pink]").getAttribute("aria-pressed"), "true", "paint persists across reload");
  await Screenshot(mobile, "MobilePaint.png");
  await mobile.locator("#startButton").click();
  await mobile.evaluate(() => window.gravityTankTest.FinishStageIntro());
  const paints = await mobile.evaluate(() => {
    const game = window.gravityTankTest;
    const results = [];
    for (const power of [1, 2, 3, 4]) {
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 32;
      const ctx = canvas.getContext("2d");
      game.BlitPlayerTinted(ctx, 0, (power - 1) * 2, 0, 0, 32, 32);
      const pixels = ctx.getImageData(0, 0, 32, 32).data;
      let pink = 0;
      for (let i = 0; i < pixels.length; i += 4) {
        if (pixels[i + 3] > 200 && pixels[i] > pixels[i + 1] * 1.3 && pixels[i + 2] > pixels[i + 1] * 1.2) pink++;
      }
      results.push(pink);
    }
    game.RestoreStageCheckpoint();
    return { pixels: results, selected: game.playerPaint, state: game.state };
  });
  assert(paints.pixels.every((count) => count > 40), "the rendered tank stays pink at every power tier");
  assert.equal(paints.selected, "pink", "checkpoint restoration preserves paint");
  assert.equal(paints.state, "stageIntro");
  await mobile.close();

  const desktop = await OpenPage({ viewport: { width: 1440, height: 1000 } }, async (page) => page.addInitScript(() => {
    Object.defineProperty(navigator, "maxTouchPoints", { get: () => 10 });
  }));
  await Ready(desktop);
  for (const [width, height] of [[1920, 1080], [1440, 1000], [1366, 768], [1280, 720], [1024, 768], [800, 600], [640, 480], [1280, 500]]) {
    await desktop.setViewportSize({ width, height });
    await desktop.waitForTimeout(80);
    const layout = await desktop.evaluate(() => {
      const canvas = document.getElementById("gameCanvas").getBoundingClientRect();
      const stage = document.querySelector(".stage-shell").getBoundingClientRect();
      const side = document.querySelector(".side").getBoundingClientRect();
      return {
        touch: document.body.classList.contains("is-touch"),
        square: Math.abs(canvas.width - canvas.height) < 0.1,
        fits: stage.top >= 0 && stage.left >= 0 && stage.bottom <= innerHeight && stage.right <= innerWidth,
        sideFits: side.top >= 0 && side.bottom <= innerHeight,
        pageFits: document.documentElement.scrollWidth <= innerWidth && document.documentElement.scrollHeight <= innerHeight,
      };
    });
    assert.deepEqual(layout, { touch: false, square: true, fits: true, sideFits: true, pageFits: true }, `PC layout ${width}x${height}, even with 10 reported touch points`);
  }
  await desktop.setViewportSize({ width: 1366, height: 768 });
  await desktop.getByRole("button", { name: "樱花粉", exact: true }).click();
  await Screenshot(desktop, "DesktopPaint.png");
  await desktop.locator("#startButton").click();
  await desktop.evaluate(() => {
    const game = window.gravityTankTest;
    game.FinishStageIntro();
    game.RunDebugAction("god");
    game.OpenRoulette();
  });
  await desktop.waitForFunction(() => window.gravityTankTest.roulette.phase === "spin" && window.gravityTankTest.images.rouletteWheel);
  await Screenshot(desktop, "DesktopRoulette.png");
  const tiers = await desktop.evaluate(() => window.gravityTankTest.RouletteSegments().map((segment) => segment.tier));
  assert.equal(tiers.filter((tier) => tier === "good").length, 4);
  assert.equal(tiers.filter((tier) => tier === "ultra").length, 2);
  assert.equal(tiers.filter((tier) => tier === "bad").length, 1);
  // Real pointer drag mapped from the in-game plunger to its CSS canvas rectangle.
  const points = await desktop.evaluate(() => {
    const game = window.gravityTankTest;
    const rect = game.canvas.getBoundingClientRect();
    return [0, 1].map((pull) => {
      const g = game.RoulettePlungerGeom({ ...game.roulette, pull });
      return { x: rect.left + g.knobX * rect.width / 416, y: rect.top + g.knobY * rect.height / 416 };
    });
  });
  await desktop.mouse.move(points[0].x, points[0].y);
  await desktop.mouse.down();
  await desktop.mouse.move(points[1].x, points[1].y, { steps: 12 });
  assert(await desktop.evaluate(() => window.gravityTankTest.roulette.pull > 0.8), "pointer drag charges the actual wheel");
  await desktop.mouse.up();
  assert(await desktop.evaluate(() => window.gravityTankTest.roulette.hasSpun));
  await desktop.waitForFunction(() => window.gravityTankTest.state !== "roulette", null, { timeout: 30000 });
  await desktop.close();

  const lateAudio = await OpenPage({}, async (page) => {
    await page.route("**/AudioBgm_Battle.ogg", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      await route.continue();
    });
  });
  await Ready(lateAudio);
  await lateAudio.locator("#startButton").click();
  await lateAudio.evaluate(() => { const g = window.gravityTankTest; g.FinishStageIntro(); g.SetPaused(true); });
  await lateAudio.waitForFunction(() => !!window.gravityTankTest.audio.buffers.bgm);
  assert.equal(await lateAudio.evaluate(() => window.gravityTankTest.audio.bgmNode), null, "late BGM must not restart while paused");
  await lateAudio.evaluate(() => window.gravityTankTest.SetPaused(false));
  assert(await lateAudio.evaluate(() => !!window.gravityTankTest.audio.bgmNode), "resume starts the downloaded BGM");
  await lateAudio.close();

  const noStorage = await OpenPage({}, async (page) => page.addInitScript(() => {
    Object.defineProperty(window, "localStorage", { get() { throw new DOMException("Unavailable", "SecurityError"); } });
  }));
  await Ready(noStorage);
  await noStorage.getByRole("button", { name: "樱花粉", exact: true }).click();
  assert.equal(await noStorage.locator("[data-paint=pink]").getAttribute("aria-pressed"), "true");
  await noStorage.close();

  // Portrait/landscape touch layouts and mobile plunger interaction.
  for (const viewport of [{ width: 320, height: 568 }, { width: 390, height: 844 }, { width: 844, height: 390 }]) {
    const page = await OpenPage({ viewport, isMobile: true, hasTouch: true });
    await Ready(page);
    if (viewport.width === 320) {
      const scroll = await page.evaluate(() => {
        const panel = document.getElementById("startOverlay");
        return { overflow: panel.scrollHeight > panel.clientHeight, pan: getComputedStyle(panel.parentElement).touchAction };
      });
      if (scroll.overflow) assert.equal(scroll.pan, "pan-y", "small-phone title can be scrolled by touch");
    }
    await page.getByRole("button", { name: "樱花粉", exact: true }).tap();
    await page.locator("#startButton").tap();
    await page.evaluate(() => { const g = window.gravityTankTest; g.FinishStageIntro(); g.OpenRoulette(); });
    await page.waitForFunction(() => window.gravityTankTest.roulette.phase === "spin" && window.gravityTankTest.images.rouletteWheel);
    await Screenshot(page, `MobileRoulette${viewport.width}.png`);
    const positions = await page.evaluate(() => {
      const g = window.gravityTankTest;
      const rect = g.canvas.getBoundingClientRect();
      return [0, 1].map((pull) => {
        const p = g.RoulettePlungerGeom({ ...g.roulette, pull });
        return { x: rect.left + p.knobX * rect.width / 416, y: rect.top + p.knobY * rect.height / 416 };
      });
    });
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [positions[0]] });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [positions[1]] });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    assert(await page.evaluate(() => window.gravityTankTest.roulette.hasSpun), `touch plunger works at ${viewport.width}x${viewport.height}`);
    await page.close();
  }

  for (const failedResource of ["Texture_ClassicSheet.png", "Script_Game.mjs?*"]) {
    const failed = await OpenPage({}, async (page) => page.route(`**/${failedResource}`, (route) => route.abort()));
    await failed.locator("#bootRetry").waitFor({ state: "visible" });
    assert.equal(await failed.locator("#bootStatus").textContent(), "准备未完成");
    assert.equal(await failed.locator("#startButton").isDisabled(), true);
    await failed.close();
  }
  assert.deepEqual(errors, [], "no uncaught browser errors");
  console.log("PASS: actual progress, missing resources, six paints, persistence, power-tier rendering, checkpoint, keyboard, late audio, storage failure, roulette tiers, real mouse/touch spins, portrait and landscape");
} finally { await browser.close(); }
