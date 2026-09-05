// Shared daylight and real character visibility; --shot saves local cast views.
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { LaunchBrowser } from "../PrairieFire1937/Script_BrowserTestKit.mjs";
import { ServeRoot } from "./Script_DevServer.mjs";
import { WEAPON_RANGE_PHASE } from "./Data_WeaponRange.mjs";
import { RANGE_PHASE } from "./Data_Range.mjs";
import { EXPLOSION_RANGE_PHASE } from "./Data_ExplosionRange.mjs";
import { MELEE_QTE_PHASE } from "./Data_MeleeQte.mjs";
import { FIRST_LEVEL_P012_WHITEBOX_PHASE } from "./Data_FirstLevelP012Whitebox.mjs";

const phases = [WEAPON_RANGE_PHASE, RANGE_PHASE, EXPLOSION_RANGE_PHASE, MELEE_QTE_PHASE, FIRST_LEVEL_P012_WHITEBOX_PHASE];
for (const phase of phases) assert.equal(phase.sky, "testSceneDay", phase.id);
const projectDir = path.dirname(fileURLToPath(import.meta.url));
const outputDir = path.join(projectDir, "_shots", "TestSceneLighting");
mkdirSync(outputDir, { recursive: true });
const server = await ServeRoot(path.resolve(projectDir, ".."), 0);
let browser;
const errors = [], evidence = {};
try {
  browser = await LaunchBrowser();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on("pageerror", error => errors.push(String(error)));
  await page.goto(`http://127.0.0.1:${server.address().port}/Taierzhuang1938/?weapons=1&shot=1&manual=1&quality=medium&scale=small`);
  await page.waitForFunction(() => window.Taierzhuang?.state?.ready, null, { timeout: 180000 });
  evidence.baseline = await page.evaluate(async () => {
    const g = window.Taierzhuang;
    const { SKY_PRESETS, TEST_SCENE_DAY } = await import("./Script_Sky.mjs");
    g.StepFrames(1);
    const actual = { sky: g.sky.presetName, sun: g.lights.sun.intensity,
      probe: g.lights.globalProbe.intensity, ambient: g.lights.ambient.intensity,
      ambientColor: g.lights.ambient.color.getHex(), exposure: g.post.uniformsComposite.uExposure.value,
      fog: g.post.uniformsComposite.uFogDensity.value };
    g.Debug.ApplySky("night");
    const restoredCampaignColor = g.lights.ambient.color.getHex();
    g.Debug.RestoreSky(); g.StepFrames(1);
    return { actual, restoredCampaignColor, restoredTestColor: g.lights.ambient.color.getHex(),
      aliasesShareBaseline: SKY_PRESETS.weaponRangeDay === TEST_SCENE_DAY && SKY_PRESETS.p012WhiteboxDay === TEST_SCENE_DAY };
  });
  assert.deepEqual(evidence.baseline.actual, { sky: "testSceneDay", sun: 3.2, probe: 0.85,
    ambient: 1, ambientColor: 0xffffff, exposure: 0.62, fog: 0 });
  assert.equal(evidence.baseline.restoredCampaignColor, 0x607085);
  assert.equal(evidence.baseline.restoredTestColor, 0xffffff);
  assert.ok(evidence.baseline.aliasesShareBaseline);

  // Middle-gray diffuse cards face all four compass directions. This catches
  // the original bright floor / black vertical surfaces mismatch.
  evidence.cards = await page.evaluate(async () => {
    const THREE = await import("three");
    const g = window.Taierzhuang;
    const card = new THREE.Mesh(new THREE.PlaneGeometry(1, 1),
      new THREE.MeshStandardMaterial({ color: new THREE.Color().setRGB(.18, .18, .18), roughness: 1, metalness: 0 }));
    card.position.set(2400, 4, 2460); g.scene.add(card);
    const samples = [];
    for (const yaw of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
      card.rotation.y = yaw;
      for (let frame = 0; frame < 12; frame++) {
        const x = 2400 + Math.sin(yaw) * 3, z = 2460 + Math.cos(yaw) * 3;
        const y = 4 - g.player.eyeHeight;
        g.player.position.set(x, y, z); g.player.body.Teleport(x, y, z); g.player.velocity.set(0, 0, 0);
        g.player.yaw = yaw; g.player.pitch = 0; g.player.aimYaw = 0; g.player.aimPitch = 0;
        g.StepFrames(1);
      }
      const pixels = new Uint8Array(9 * 9 * 4);
      g.renderer.readRenderTargetPixels(g.post.targets.ldr, Math.floor(g.post.width / 2) - 4,
        Math.floor(g.post.height / 2) - 4, 9, 9, pixels);
      let sum = 0;
      for (let i = 0; i < pixels.length; i += 4) sum += .2126 * pixels[i] + .7152 * pixels[i + 1] + .0722 * pixels[i + 2];
      samples.push({ yaw, luma: sum / 81 });
    }
    g.scene.remove(card); card.geometry.dispose(); card.material.dispose();
    return samples;
  });
  for (const card of evidence.cards) assert.ok(card.luma > 45 && card.luma < 190, JSON.stringify(card));
  assert.ok(Math.max(...evidence.cards.map(c => c.luma)) / Math.min(...evidence.cards.map(c => c.luma)) < 2.5);

  // Every production soldier and officer, plus civilians, shares one pose,
  // direction and empty outdoor area. No material brightening in the fixture.
  evidence.cast = await page.evaluate(async () => {
    const g = window.Taierzhuang;
    const { Actor } = await import("./Script_Actor.mjs");
    const { GetLugouCharacterVariantEntries } = await import("./Script_CharacterModel.mjs");
    const specs = ["nra", "nraOfficer", "ija", "ijaOfficer"].flatMap(kind =>
      GetLugouCharacterVariantEntries(kind).map(entry => ({ kind, ...entry })));
    specs.push(...["male", "female", "childBoy", "childGirl"].map(variant => ({ kind: "civilian", variant })));
    window.lightingCast = specs.map((spec, index) => {
      const actor = new Actor(g.actorFactory, spec.kind, { seed: 1, modelVariant: spec.modelVariant, variant: spec.variant });
      actor.root.position.set(2396 + index % 5 * 2, 0, 2474 + Math.floor(index / 5) * 5);
      actor.root.rotation.y = Math.PI;
      actor.Update(0, { moveSpeed: 0, aim: 0, elapsed: 0 });
      g.scene.add(actor.root);
      return actor;
    });
    return window.lightingCast.map(a => ({ kind: a.kind, model: a.modelId, variant: a.variant, rigged: a.usingRiggedCharacter }));
  });
  assert.equal(new Set(evidence.cast.slice(0, 10).map(a => a.model)).size, 10);
  assert.ok(evidence.cast.slice(0, 10).every(a => a.rigged));
  if (process.argv.includes("--shot")) {
    for (let row = 0; row < 3; row++) {
      await page.evaluate(row => {
        const g = window.Taierzhuang, z = 2460;
        window.lightingCast.forEach((actor, index) => {
          actor.root.visible = Math.floor(index / 5) === row;
          actor.root.position.set(2397 + index % 5 * 1.5, 0, 2450);
        });
        for (const soldier of g.ai.soldiers) soldier.actor.root.visible = false;
        for (let frame = 0; frame < 12; frame++) {
          g.player.position.set(2400, 0, z); g.player.body.Teleport(2400, 0, z); g.player.velocity.set(0, 0, 0);
          g.player.yaw = 0; g.player.pitch = -.045; g.player.aimYaw = 0; g.player.aimPitch = 0;
          g.StepFrames(1);
        }
      }, row);
      await page.screenshot({ path: path.join(outputDir, `Scene_Cast${row}.png`) });
    }
  }
  await page.evaluate(() => { for (const actor of window.lightingCast) { window.Taierzhuang.scene.remove(actor.root); actor.Dispose(); } });
  if (process.argv.includes("--scenes")) {
    evidence.scenes = [];
    for (const query of ["range=1", "explosions=1", "melee=1", "whitebox=p012"]) {
      await page.goto(`http://127.0.0.1:${server.address().port}/Taierzhuang1938/?${query}&shot=1&manual=1&quality=medium&scale=small`);
      await page.waitForFunction(() => window.Taierzhuang?.state?.ready, null, { timeout: 180000 });
      const result = await page.evaluate(() => {
        const g = window.Taierzhuang;
        g.StepFrames(12);
        return { level: g.Debug.Level().id, sky: g.sky.presetName, sun: g.lights.sun.intensity,
          ambient: g.lights.ambient.intensity, ambientColor: g.lights.ambient.color.getHex(),
          exposure: g.post.uniformsComposite.uExposure.value };
      });
      evidence.scenes.push(result);
      assert.equal(result.sky, "testSceneDay", query);
      assert.equal(result.sun, 3.2, query);
      assert.equal(result.ambient, 1, query);
      assert.equal(result.ambientColor, 0xffffff, query);
      assert.equal(result.exposure, .62, query);
      if (process.argv.includes("--shot")) await page.screenshot({ path: path.join(outputDir, `Scene_${result.level}.png`) });
    }
  }
  assert.deepEqual(errors, []);
  console.log("ok Shared daylight, four-direction gray cards, campaign restore and fourteen character variants", JSON.stringify(evidence));
} finally {
  writeFileSync(path.join(outputDir, "Data_Acceptance.json"), JSON.stringify({ evidence, errors }, null, 2));
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
