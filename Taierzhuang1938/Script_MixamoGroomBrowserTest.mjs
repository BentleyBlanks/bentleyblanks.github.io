// Real Mixamo preview: all configured characters wear their baked hair and beard during animation and after switching.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { LaunchBrowser } from "../PrairieFire1937/Script_BrowserTestKit.mjs";
import { ServeRoot } from "./Script_DevServer.mjs";
import { XBOT_CHARACTERS } from "./Data_XBotCharacters.mjs";

const root = path.resolve(import.meta.dirname, "..");
const server = await ServeRoot(root, 0);
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await LaunchBrowser({ extraArgs: ["--mute-audio"] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
const errors = [], failures = [], observations = [];
const keys = Object.entries(XBOT_CHARACTERS).filter(([, def]) => def.groom).map(([key]) => key);
const output = path.join(root, "tmp", "MixamoGroom");
fs.mkdirSync(output, { recursive: true });
page.on("pageerror", error => errors.push(String(error)));
page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
page.on("response", response => { if (response.status() >= 400) failures.push(`${response.status()} ${response.url()}`); });
try {
  await page.goto(`${base}/Taierzhuang1938/Tool_MixamoAnimationPreview.html?who=${keys[0]}`, { waitUntil: "load", timeout: 180000 });
  await page.waitForFunction(() => window.__preview?.action && window.__preview.hair?.stats.lod !== "none", null, { timeout: 180000 });
  for (const key of [...keys, "xbot", keys[0]]) {
    await page.locator("#who").selectOption(key);
    await page.waitForFunction(expected => window.__preview?.character && document.querySelector("#who")?.value === expected &&
      (expected === "xbot" ? !window.__preview.hair : window.__preview.hair?.root.name === `Hair_${expected}`), key, { timeout: 180000 });
    await page.waitForTimeout(350);
    const observation = await page.evaluate(() => {
      const p = window.__preview, h = p.hair;
      return { key: document.querySelector("#who").value, action: p.action?.getClip().name,
        hair: h?.asset.id || null, lod: h?.stats.lod || null,
        visible: h ? Object.values(h.meshes).filter(mesh => mesh.visible).map(mesh => mesh.name) : [],
        parent: h?.root.parent?.name || null };
    });
    observations.push(observation);
    assert.ok(observation.action, `${key}: animation continues`);
    if (key === "xbot") assert.equal(observation.hair, null);
    else {
      assert.ok(observation.hair?.startsWith("Game_"), `${key}: game groom loaded`);
      assert.equal(observation.parent, "Head", `${key}: groom follows head bone`);
      assert.ok(observation.visible.some(name => /Hair(Strands|Cards|Shell)/.test(name)), `${key}: hair rendered`);
      assert.ok(observation.visible.some(name => /HairBeard/.test(name)), `${key}: beard rendered`);
    }
    if (key === "heYoutian" || key === "ijaYi") {
      await page.evaluate(() => {
        const p = window.__preview;
        p.orbit.target.y = 1.55; p.orbit.dist = 1.5; p.orbit.yaw = 0; p.orbit.pitch = 0.1;
        document.querySelector("#edRoot").style.display = "none";
      });
      await page.waitForTimeout(250);
      await sharp(await page.screenshot()).resize({ width: 640, height: 640, fit: "inside", withoutEnlargement: true })
        .jpeg({ quality: 82 }).toFile(path.join(output, `${key}.jpg`));
      await page.evaluate(() => { document.querySelector("#edRoot").style.display = ""; window.__preview.orbit.dist = 5; window.__preview.orbit.target.y = .95; });
    }
  }
  assert.deepEqual(errors, []);
  assert.deepEqual(failures, []);
  fs.writeFileSync(path.join(output, "Data_MixamoGroomReview.json"), `${JSON.stringify({ observations, errors, failures }, null, 2)}\n`);
  console.log("MixamoGroomBrowserTest ok", observations.map(o => `${o.key}:${o.lod}:${o.visible.join("+")}`).join(" "));
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
