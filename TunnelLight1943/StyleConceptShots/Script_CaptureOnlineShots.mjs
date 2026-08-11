import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { LaunchBrowser } from "../../PrairieFire1937/Script_BrowserTestKit.mjs";

const outputRoot = path.dirname(fileURLToPath(import.meta.url));
const outputDir = path.join(outputRoot, "Original");
fs.mkdirSync(outputDir, { recursive: true });

const shots = [
  { chapter: 1, beat: 3, name: "DoorFrame", x: 34, waitMs: 1500 },
  { chapter: 1, beat: 11, name: "VillageWell", x: 58, waitMs: 1500 },
  { chapter: 1, beat: 20, name: "HouseSearch", advances: 4, waitMs: 450 },
  { chapter: 2, beat: 3, name: "NightEscape", x: 68, crouch: true, waitMs: 1600 },
  { chapter: 3, beat: 2, name: "FortObservation", x: 172, crouch: true, waitMs: 1600 },
  { chapter: 4, beat: 7, name: "LastLamps", x: 144, level: "under", waitMs: 1500 },
  { chapter: 4, beat: 11, name: "FloodRescue", x: 112, level: "under", waitMs: 300 },
  { chapter: 5, beat: 4, name: "WarningBell", x: 142, level: "under", flags: { bellBuilt: true }, waitMs: 1500 },
  { chapter: 7, beat: 5, name: "SisterRescue", advances: 5, waitMs: 500 },
  { chapter: 8, beat: 5, name: "SecondMark", x: 34, waitMs: 1500 },
];

const browser = await LaunchBrowser();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const pageErrors = [];
page.on("pageerror", (error) => pageErrors.push(String(error).slice(0, 240)));
page.on("console", (message) => {
  if (message.type() === "error") pageErrors.push(message.text().slice(0, 240));
});

for (let index = 0; index < shots.length; index += 1) {
  const shot = shots[index];
  const url = `https://bentleyblanks.github.io/TunnelLight1943/?chapter=${shot.chapter}&beat=${shot.beat}&fast=1`;
  await page.goto(url, { waitUntil: "load", timeout: 60000 });
  await page.waitForFunction(() => window.TunnelLight?.state, { timeout: 60000 });
  await page.waitForTimeout(800);

  const info = await page.evaluate((settings) => {
    const game = window.TunnelLight;
    const state = game.state;
    for (let i = 0; i < (settings.advances || 0); i += 1) {
      game.StepFrames(1, { advance: true });
    }
    if (Number.isFinite(settings.x)) state.player.x = settings.x;
    if (settings.level) state.player.level = settings.level;
    if (settings.crouch !== undefined) state.player.crouch = settings.crouch;
    if (settings.flags) Object.assign(state.flags, settings.flags);
    if (settings.ticks) game.Tick(settings.ticks, 1 / 30);
    game.Tick(8, 1 / 30);
    return {
      chapterIndex: state.chapterIndex,
      beatIndex: state.beatIndex,
      lineIndex: state.beat?.lineIndex ?? null,
      playerX: Math.round(state.player.x * 10) / 10,
      playerLevel: state.player.level,
      caption: (state.caption?.stage || state.caption?.say || "").slice(0, 40),
    };
  }, shot);

  await page.waitForTimeout(shot.waitMs);
  const fileName = `Texture_Source${String(index + 1).padStart(2, "0")}_${shot.name}.png`;
  await page.screenshot({ path: path.join(outputDir, fileName) });
  console.log(`${fileName} ${JSON.stringify(info)}`);
}

await browser.close();

if (pageErrors.length) {
  console.warn(`Captured with ${pageErrors.length} page console error(s):`);
  for (const error of pageErrors.slice(0, 8)) console.warn(`- ${error}`);
}
