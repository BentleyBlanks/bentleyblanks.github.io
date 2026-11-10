// Real Mixamo preview: every configured character's baked groom follows the animated Head bone across poses.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { LaunchBrowser } from "../PrairieFire1937/Script_BrowserTestKit.mjs";
import { ServeRoot } from "./Script_DevServer.mjs";
import { XBOT_CHARACTERS } from "./Data_XBotCharacters.mjs";

const root = path.resolve(import.meta.dirname, "..");
const server = process.env.HAIR_PREVIEW ? null : await ServeRoot(root, 0);
const base = process.env.HAIR_PREVIEW || `http://127.0.0.1:${server.address().port}`;
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
      if (!["yaowa", "nier"].includes(key))
        assert.ok(observation.visible.some(name => /Hair(Beard|Stubble)/.test(name)), `${key}: beard rendered`);
      if (["yaowa", "nier"].includes(key))
        assert.ok(!observation.visible.some(name => /Hair(Beard|Stubble)/.test(name)), `${key}: clean-shaven character`);
      await page.evaluate(() => window.__preview.SelectFile("Animation_Mixamo_LookingAround_V2.glb"));
      await page.waitForFunction(() => window.__preview.current?.file === "Animation_Mixamo_LookingAround_V2.glb" && window.__preview.action);
      const duration = await page.evaluate(() => window.__preview.action.getClip().duration);
      const poses = [];
      for (const time of [duration * 0.1, duration * 0.6]) {
        poses.push(await page.evaluate(time => {
          const p = window.__preview, scrub = document.querySelector("#scrub");
          scrub.value = time; scrub.dispatchEvent(new Event("input", { bubbles: true }));
          p.character.updateMatrixWorld(true);
          const head = p.character.getObjectByName("Head"), hair = p.hair.root;
          const beard = p.hair.meshes.beardCards || p.hair.meshes.stubble;
          const headQ = head.getWorldQuaternion(head.quaternion.clone());
          const hairQ = hair.getWorldQuaternion(hair.quaternion.clone());
          const result = { headQ: headQ.toArray(), hairQ: hairQ.toArray(),
            headPos: head.getWorldPosition(head.position.clone()).toArray(),
            hairPos: hair.getWorldPosition(hair.position.clone()).toArray(),
            beardPos: beard?.getWorldPosition(beard.position.clone()).toArray() || null };
          return result;
        }, time));
      }
      const angularChange = (a, b) => 2 * Math.acos(Math.min(1, Math.abs(a.reduce((sum, v, i) => sum + v * b[i], 0))));
      assert.ok(angularChange(poses[0].headQ, poses[1].headQ) > 0.03, `${key}: head bone animates`);
      assert.ok(angularChange(poses[0].hairQ, poses[1].hairQ) > 0.03, `${key}: hair rotates with head`);
      assert.ok(Math.abs(angularChange(poses[0].headQ, poses[1].headQ) - angularChange(poses[0].hairQ, poses[1].hairQ)) < 0.001,
        `${key}: hair rotation matches head rotation`);
      if (poses[0].beardPos) assert.ok(Math.hypot(...poses[0].beardPos.map((v, i) => v - poses[1].beardPos[i])) > 0.002,
        `${key}: beard follows animated head`);
      observation.poses = poses;
    }
    if (key !== "xbot" && observations.filter(o => o.key === key).length === 1) {
      await page.evaluate(() => {
        const p = window.__preview;
        const head = p.character.getObjectByName("Head");
        p.orbit.target.copy(head.getWorldPosition(head.position.clone()));
        p.orbit.target.y -= 0.05; p.orbit.dist = 1; p.orbit.yaw = 0; p.orbit.pitch = 0.06;
        document.querySelector("#edRoot").style.display = "none";
      });
      await page.waitForTimeout(250);
      await sharp(await page.screenshot()).resize({ width: 640, height: 640, fit: "inside", withoutEnlargement: true })
        .jpeg({ quality: 82 }).toFile(path.join(output, `${key}.jpg`));
      await page.evaluate(() => { document.querySelector("#edRoot").style.display = ""; window.__preview.orbit.dist = 5; window.__preview.orbit.target.set(0, .95, 0); });
    }
  }
  assert.deepEqual(errors, []);
  assert.deepEqual(failures, []);
  fs.writeFileSync(path.join(output, "Data_MixamoGroomReview.json"), `${JSON.stringify({ observations, errors, failures }, null, 2)}\n`);
  console.log("MixamoGroomBrowserTest ok", observations.map(o => `${o.key}:${o.lod}:${o.visible.join("+")}`).join(" "));
} finally {
  await browser.close();
  if (server) await new Promise(resolve => server.close(resolve));
}
