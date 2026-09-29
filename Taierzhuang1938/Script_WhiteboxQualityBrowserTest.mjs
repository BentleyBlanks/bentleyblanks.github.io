import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { LaunchBrowser } from "../PrairieFire1937/Script_BrowserTestKit.mjs";
import { ServeRoot } from "./Script_DevServer.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.join(root, "tmp", "WhiteboxQuality"); fs.mkdirSync(output, { recursive: true });
const server = await ServeRoot(root, 0), browser = await LaunchBrowser();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
const progress = setInterval(() => console.log("Whitebox browser verification running"), 60000);
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => { if (m.type() === "error" && !/fonts\.(googleapis|gstatic)/.test(m.location()?.url || "")) errors.push(m.text()); });
const Ready = () => page.waitForFunction(() => window.Tengxian?.state?.ready, null, { timeout: 400000 });
try {
  await page.addInitScript(() => {
    if (!localStorage.getItem("WhiteboxTestInitialized")) {
      localStorage.setItem("tengxian1938_graphics_v1", JSON.stringify({ taa: true, shadows: true, gi: true, ssao: 1 }));
      localStorage.setItem("WhiteboxTestInitialized", "1");
    }
  });
  const base = `http://127.0.0.1:${server.address().port}/Taierzhuang1938/`;
  await page.goto(`${base}?whitebox=p012&missionStage=4&manual=1&scale=small&audio=0`, { waitUntil: "domcontentloaded", timeout: 240000 });
  await Ready();
  console.log("Whitebox default loaded");
  const state = await page.evaluate(async () => {
    const T = window.Tengxian; T.StepFrames(3);
    const info = T.GraphicsProfile.Inspect();
    const { IsWhiteboxTerrain } = await import("./Script_WhiteboxRendering.mjs");
    const restore = T.post.whiteboxScene.Begin(T.scene);
    let texturedAssets = 0, terrainTextured = 0, skinnedWhite = 0;
    T.scene.traverseVisible((o) => {
      if (!o.isMesh || !o.material) return;
      const terrain = IsWhiteboxTerrain(o);
      for (const m of [o.material].flat()) {
        if (terrain && (m.map || m.userData.terrainLayers)) terrainTextured++;
        if (!terrain && Object.values(m).some((value) => value?.isTexture)) texturedAssets++;
        if (o.isSkinnedMesh && m.name.startsWith("Whitebox_")) skinnedWhite++;
      }
    });
    restore();
    // Runtime-spawned meshes and instanced colors obey the same rule; restore
    // leaves original material references intact for simulation and art mode.
    const THREE = await import("three");
    const source = new THREE.MeshStandardMaterial({ map: new THREE.DataTexture(new Uint8Array([255, 0, 0, 255]), 1, 1) });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(), source); T.scene.add(mesh);
    const undo = T.post.whiteboxScene.Begin(T.scene);
    const spawnedWhite = mesh.material !== source && mesh.material.map === null;
    undo(); const restored = mesh.material === source;
    mesh.removeFromParent(); mesh.geometry.dispose(); source.map.dispose(); source.dispose();
    T.StepFrames(2);
    return { info, texturedAssets, terrainTextured, skinnedWhite, spawnedWhite, restored,
      shadows: T.renderer.shadowMap.enabled, taa: T.post.taaEnabled, gl: T.renderer.getContext().getError() };
  });
  assert.equal(state.info.profile, "whitebox");
  assert.deepEqual(state.info.renderedPasses, ["main", "whiteboxOutput"]);
  assert.equal(state.texturedAssets, 0); assert.ok(state.terrainTextured > 0);
  assert.ok(state.skinnedWhite > 0); assert.ok(state.spawnedWhite && state.restored);
  assert.equal(state.shadows, false); assert.equal(state.taa, false); assert.equal(state.gl, 0);
  await page.screenshot({ path: path.join(output, "WhiteboxScene.png") });
  await page.evaluate(() => { window.Tengxian.editor.Open("graphics"); });
  await page.getByRole("button", { name: "编辑白盒画质", exact: true }).click();
  assert.equal(await page.locator('[data-whitebox-option="terrainTextures"]').getAttribute("aria-pressed"), "true");
  assert.equal(await page.locator('[data-whitebox-option="ssao"]').getAttribute("aria-pressed"), "false");
  await page.screenshot({ path: path.join(output, "WhiteboxEditor.png") });
  await page.locator('[data-whitebox-option="taa"]').click();
  await page.getByRole("button", { name: "保存并应用白盒", exact: true }).click();
  await page.waitForURL(/quality=whitebox/, { timeout: 240000 });
  await Ready();
  console.log("Whitebox TAA configuration loaded");
  const configured = await page.evaluate(() => { const T = window.Tengxian; T.StepFrames(3); return T.GraphicsProfile.Inspect(); });
  assert.equal(configured.config.taa, true); assert.ok(configured.renderedPasses.includes("taa"));
  assert.ok(configured.renderedPasses.includes("prepass")); assert.ok(!configured.renderedPasses.includes("gtao"));
  await page.evaluate(() => {
    // The original-settings migration was checked above; do not enable expensive
    // GI accidentally while validating the explicit standard high profile.
    localStorage.removeItem("tengxian1938_graphics_v1");
    window.Tengxian.GraphicsProfile.Select("high");
  });
  await page.waitForURL(/quality=high/, { timeout: 240000 });
  await Ready();
  const art = await page.evaluate(() => { const T = window.Tengxian; T.StepFrames(3); return T.GraphicsProfile.Inspect(); });
  assert.equal(art.profile, "high"); assert.ok(art.renderedPasses.includes("composite"));
  assert.ok(!art.renderedPasses.includes("whiteboxOutput"));
  await page.screenshot({ path: path.join(output, "ArtScene.png") });
  // Exercise the opt-in switches together, including their prepass/depth inputs.
  await page.evaluate(() => {
    const api = window.Tengxian.GraphicsProfile;
    const config = Object.fromEntries(api.Inspect().controls.map(({ key }) => [key, true]));
    config.assetTextures = false;
    api.ConfigureWhitebox(config, { reload: true });
  });
  await page.waitForURL(/quality=whitebox/, { timeout: 240000 });
  await Ready();
  const features = await page.evaluate(() => {
    const T = window.Tengxian; T.StepFrames(4);
    return { info: T.GraphicsProfile.Inspect(), gl: T.renderer.getContext().getError(),
      selfShadow: T.firstPersonSelfShadow.Status().enabled };
  });
  for (const pass of ["prepass", "gtao", "ssr", "taa", "bloom", "composite"]) assert.ok(features.info.renderedPasses.includes(pass), pass);
  assert.equal(features.gl, 0); assert.equal(features.selfShadow, true);
  assert.deepEqual(errors, []);
  fs.writeFileSync(path.join(output, "Data_WhiteboxVerification.json"), JSON.stringify({ state, configured, art, features, errors }, null, 2));
  console.log("PASS whitebox scene, actual passes, textures, dynamic meshes, editor, persistence and art opt-in");
  console.log(`Screenshots: ${output}`);
} finally { clearInterval(progress); await browser.close(); await new Promise((resolve) => server.close(resolve)); }
