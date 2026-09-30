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
page.on("pageerror", (e) => { errors.push(String(e)); console.error(String(e)); });
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
    const T = window.Tengxian; T.StepFrames(45);
    const info = T.GraphicsProfile.Inspect();
    const { IsWhiteboxTerrain, IsWhiteboxCharacter } = await import("./Script_WhiteboxRendering.mjs");
    const fpsSources = [];
    for (const root of [T.viewmodel.root, T.viewmodel.body?.root].filter(Boolean)) root.traverse((o) => {
      if (o.isMesh) fpsSources.push([o, o.material]);
    });
    const restore = T.post.whiteboxScene.Begin(T.scene);
    const firstPersonPreserved = fpsSources.length > 0 && fpsSources.every(([o, m]) => o.material === m);
    let texturedAssets = 0, terrainTextured = 0, skinnedTextured = 0, gridMaterials = 0;
    // 2026-09-30：镂空卡片（植被、壕沟草）保留贴图 alpha 与 alphaTest（不再画成不透明白竖片）；水面画蓝灰水色 + 天空反光，不画网格。
    let cutoutMaterials = 0, cutoutBroken = 0, cutoutFlat = 0, cutoutGrid = 0, waterMaterials = 0, waterGrid = 0, waterColors = new Set();
    const stats = { ...T.post.whiteboxScene.stats };
    T.scene.traverseVisible((o) => {
      if (!o.isMesh || !o.material) return;
      const terrain = IsWhiteboxTerrain(o);
      for (const m of [o.material].flat()) {
        if (terrain && (m.map || m.userData.terrainLayers)) terrainTextured++;
        const cutout = !terrain && !IsWhiteboxCharacter(o) && m.name.startsWith("Whitebox_Cutout_");
        if (cutout) {
          cutoutMaterials++; if (!(m.alphaTest > 0 && (m.map || m.alphaMap))) cutoutBroken++;
          // 2026-10-01：卡片保留原贴图色（白底乘贴图 / 暗橄榄），不是统一的亮灰表面色；卡片上不叠米制灰网格。
          if (m.color.getHexString() === T.post.whiteboxScene.config.surfaceColor.slice(1).toLowerCase()) cutoutFlat++;
          if (m.customProgramCacheKey().includes("whiteboxGrid1")) cutoutGrid++;
        }
        if (!terrain && !IsWhiteboxCharacter(o) && !cutout && Object.values(m).some((value) => value?.isTexture)) texturedAssets++;
        if (o.isSkinnedMesh && m.map && IsWhiteboxCharacter(o)) skinnedTextured++;
        if (m.customProgramCacheKey().includes("whiteboxGrid1")) gridMaterials++;
        if (m.name.startsWith("Whitebox_Water_")) {
          waterMaterials++; waterColors.add(m.color.getHexString());
          if (m.customProgramCacheKey().includes("whiteboxGrid1")) waterGrid++;
          if (!m.customProgramCacheKey().includes("whiteboxWater1")) waterGrid++;
        }
      }
    });
    const sceneStats = { ...T.post.whiteboxScene.stats };
    restore();
    // Runtime-spawned meshes and instanced colors obey the same rule; restore
    // leaves original material references intact for simulation and art mode.
    const THREE = await import("three");
    const source = new THREE.MeshStandardMaterial({ map: new THREE.DataTexture(new Uint8Array([255, 0, 0, 255]), 1, 1) });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(), source); T.scene.add(mesh);
    const undo = T.post.whiteboxScene.Begin(T.scene);
    const spawnedWhite = mesh.material !== source && mesh.material.map === null;
    undo(); const restored = mesh.material === source;
    // A late bone attachment inherits the character category; the same source
    // on scenery still uses a grid. The character toggle must work both ways.
    const actor = new THREE.Group(), bone = new THREE.Bone(); actor.userData.whiteboxCharacter = true;
    actor.add(bone); bone.add(mesh); T.scene.add(actor);
    const scenery = new THREE.Mesh(mesh.geometry, source); T.scene.add(scenery);
    let restoreScope = T.post.whiteboxScene.Begin(T.scene, T.camera);
    const inherited = mesh.material === source && scenery.material !== source;
    restoreScope();
    T.post.whiteboxScene.config.characterTextures = false;
    restoreScope = T.post.whiteboxScene.Begin(T.scene, T.camera);
    const charactersCanBeGrey = mesh.material !== source && !mesh.material.map;
    restoreScope(); T.post.whiteboxScene.config.characterTextures = true;
    scenery.removeFromParent(); actor.removeFromParent();
    mesh.removeFromParent(); mesh.geometry.dispose(); source.map.dispose(); source.dispose();
    // Audit what Three actually submits, after LOD selection and draw hooks.
    const originalDraw = T.renderer.renderBufferDirect;
    const draws = { grid: 0, texturedCharacters: 0, firstPerson: 0, texturedScenery: [] };
    T.renderer.renderBufferDirect = function(camera, scene, geometry, material, object) {
      if (scene === T.scene) {
        if (material.customProgramCacheKey().includes("whiteboxGrid1")) draws.grid++;
        if (material.map && IsWhiteboxCharacter(object)) draws.texturedCharacters++;
        for (let node = object; node; node = node.parent) if (node === T.viewmodel.root) {
          draws.firstPerson++; break;
        }
        if (!IsWhiteboxCharacter(object) && !IsWhiteboxTerrain(object) && !material.name.startsWith("Whitebox_Cutout_")
          && Object.values(material).some((v) => v?.isTexture)) draws.texturedScenery.push(object.name);
      }
      return originalDraw.apply(this, arguments);
    };
    try { T.StepFrames(2); } finally { T.renderer.renderBufferDirect = originalDraw; }
    return { info, cutoutMaterials, cutoutBroken, cutoutFlat, cutoutGrid, waterMaterials, waterGrid, waterColors: [...waterColors], sceneStats,
      texturedAssets, terrainTextured, skinnedTextured, gridMaterials, spawnedWhite, restored, inherited, charactersCanBeGrey, firstPersonPreserved, draws,
      shadows: T.renderer.shadowMap.enabled, taa: T.post.taaEnabled, gl: T.renderer.getContext().getError() };
  });
  assert.equal(state.info.profile, "whitebox");
  assert.deepEqual(state.info.renderedPasses, ["main", "whiteboxOutput"]);
  assert.equal(state.texturedAssets, 0); assert.ok(state.terrainTextured > 0);
  // 植被卡片 / 壕沟草保留 alpha 裁切；水面是蓝灰水色不是网格。
  assert.ok(state.cutoutMaterials > 0 && state.sceneStats.cutoutMeshes > 0, "alpha-cut cards keep their cut-out in whitebox");
  assert.equal(state.cutoutBroken, 0, "every whitebox cut-out material keeps alphaTest and its map");
  assert.equal(state.cutoutFlat, 0, "no cut-out card is painted the flat grey surface colour (that reads as white spikes under the neutral light)");
  assert.equal(state.cutoutGrid, 0, "cut-out cards carry no metre grid");
  assert.ok(state.waterMaterials > 0 && state.sceneStats.waterMeshes > 0, "the river surface is drawn with the whitebox water material");
  assert.equal(state.waterGrid, 0, "the water surface has no grid, only the sheen patch");
  assert.deepEqual(state.waterColors, ["4d6f86"], "the whitebox water colour is the agreed blue-grey");
  assert.ok(state.skinnedTextured > 0); assert.ok(state.gridMaterials > 0);
  assert.ok(state.spawnedWhite && state.restored && state.inherited && state.charactersCanBeGrey);
  assert.ok(state.firstPersonPreserved); assert.ok(state.draws.firstPerson > 0);
  assert.ok(state.draws.grid > 0); assert.ok(state.draws.texturedCharacters > 0);
  assert.deepEqual(state.draws.texturedScenery, []);
  assert.equal(state.shadows, false); assert.equal(state.taa, false); assert.equal(state.gl, 0);
  await page.screenshot({ path: path.join(output, "WhiteboxScene.png") });
  // Close-up both factions and held weapons using the real actor editor/render.
  await page.evaluate(() => {
    const T = window.Tengxian; T.editor.Open("actor");
    T.editor.active.showHitbox = false; T.editor.active.Rebuild(); T.StepFrames(3);
  });
  await page.screenshot({ path: path.join(output, "WhiteboxAlly.png") });
  await page.evaluate(() => {
    const T = window.Tengxian, editor = T.editor.active;
    editor.kind = "ija"; editor.modelVariant = null; editor.Rebuild(); T.StepFrames(3);
  });
  await page.screenshot({ path: path.join(output, "WhiteboxEnemy.png") });
  await page.evaluate(() => { window.Tengxian.editor.Open("graphics"); });
  await page.getByRole("button", { name: "编辑白盒画质", exact: true }).click();
  assert.equal(await page.locator('[data-whitebox-option="terrainTextures"]').getAttribute("aria-pressed"), "true");
  assert.equal(await page.locator('[data-whitebox-option="ssao"]').getAttribute("aria-pressed"), "false");
  assert.equal(await page.locator('[data-whitebox-option="characterTextures"]').getAttribute("aria-pressed"), "true");
  assert.equal(await page.locator('[data-whitebox-option="grid"]').getAttribute("aria-pressed"), "true");
  await page.screenshot({ path: path.join(output, "WhiteboxEditor.png") });
  if (process.argv.includes("--presentation-only")) {
    assert.deepEqual(errors, []);
    fs.writeFileSync(path.join(output, "Data_WhiteboxPresentation.json"), JSON.stringify({ state, errors }, null, 2));
    console.log("PASS grey grid, character/weapon textures, first-person draws and editor controls");
  } else {
  await page.locator('[data-whitebox-option="taa"]').click();
  await page.locator('[data-whitebox-option="characterTextures"]').click();
  await page.getByRole("button", { name: "保存并应用白盒", exact: true }).click();
  await page.waitForURL(/quality=whitebox/, { timeout: 240000 });
  await Ready();
  console.log("Whitebox TAA configuration loaded");
  const configured = await page.evaluate(() => { const T = window.Tengxian; T.StepFrames(3); return T.GraphicsProfile.Inspect(); });
  assert.equal(configured.config.taa, true); assert.ok(configured.renderedPasses.includes("taa"));
  assert.equal(configured.config.characterTextures, false);
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
  }
} finally { clearInterval(progress); await browser.close(); await new Promise((resolve) => server.close(resolve)); }
