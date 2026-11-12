// Verify Liu Wencai through the shared preview and the existing scene unit.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { LaunchBrowser } from "../PrairieFire1937/Script_BrowserTestKit.mjs";
import { ServeRoot } from "./Script_DevServer.mjs";

const root = path.resolve(import.meta.dirname, "..");
const custom = process.argv.find(arg => arg.startsWith("--url="))?.slice(6);
const server = custom ? null : await ServeRoot(root, 0);
const origin = custom || `http://127.0.0.1:${server.address().port}`;
const sceneTimeout = custom ? 600000 : 300000;
const output = path.join(root, "tmp", custom?.includes("github.io") ? "LiuWencaiOnline" : "LiuWencai");
fs.mkdirSync(output, { recursive: true });
const browser = await LaunchBrowser({ extraArgs: ["--mute-audio"] });
const errors = [], results = [], capabilityProbes = [];
const capabilityPaths = new Set(["/__environment/status", "/__blockout/status"]);
const clips = [
  "Animation_Mixamo_NeutralIdle_V1.glb", "Animation_Mixamo_Talking_V2.glb",
  "Animation_Mixamo_PointingForward_V1.glb", "Animation_Mixamo_LookingAround_V2.glb",
  "Animation_Mixamo_Walking_V21.glb", "Animation_Mixamo_UnarmedRunForward_V1.glb",
  "Animation_Mixamo_RifleAimingIdle_V1.glb", "Animation_Mixamo_Crawling_V1.glb", "Animation_Mixamo_WalkWithRifle_V3.glb",
  "Animation_Mixamo_IdleCrouchingAiming_V1.glb", "Animation_Mixamo_ProneFiringRifle_V2.glb",
  "Animation_Mixamo_Dying_V3.glb", "Animation_Mixamo_SittingIdle_V2.glb",
];
async function Capture(page, name) {
  await sharp(await page.screenshot()).resize({ width: 640, height: 640, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 83 }).toFile(path.join(output, name));
}
async function Samplers(page) {
  return page.evaluate(() => {
    const renderer = window.__preview?.renderer || window.Tengxian.renderer;
    const gl = renderer.getContext();
    const types = new Set([
      gl.SAMPLER_2D, gl.SAMPLER_3D, gl.SAMPLER_CUBE, gl.SAMPLER_2D_SHADOW,
      gl.SAMPLER_2D_ARRAY, gl.SAMPLER_2D_ARRAY_SHADOW, gl.SAMPLER_CUBE_SHADOW, gl.INT_SAMPLER_2D,
      gl.INT_SAMPLER_3D, gl.INT_SAMPLER_CUBE, gl.INT_SAMPLER_2D_ARRAY,
      gl.UNSIGNED_INT_SAMPLER_2D, gl.UNSIGNED_INT_SAMPLER_3D,
      gl.UNSIGNED_INT_SAMPLER_CUBE, gl.UNSIGNED_INT_SAMPLER_2D_ARRAY,
    ]);
    const programs = renderer.info.programs.map(({ program }) => {
      let count = 0;
      for (let i = 0; i < gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS); i++) {
        const uniform = gl.getActiveUniform(program, i);
        if (types.has(uniform.type)) count += uniform.size;
      }
      return { linked: gl.getProgramParameter(program, gl.LINK_STATUS), count };
    });
    return { programs, limit: gl.getParameter(gl.MAX_TEXTURE_IMAGE_UNITS), error: gl.getError() };
  });
}
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  let publishedNormalRequests = 0;
  if (!custom) {
    // Exercise the dynamic prop filename after publication removes its source.
    await page.route("**/Data_TextureImportRuntime.mjs*", route => route.fulfill({
      contentType: "text/javascript",
      body: `export const TEXTURE_IMPORT_RUNTIME = ${JSON.stringify({
        "Texture_DadaoNormal.webp": { format: "webp", output: "Texture_DadaoNormal_ImportFixture.webp", colorSpace: "linear", mipmaps: true },
      })};`,
    }));
    await page.route("**/Texture/Texture_DadaoNormal.webp*", route => route.abort("failed"));
    await page.route("**/Texture/Texture_DadaoNormal_ImportFixture.webp*", route => {
      publishedNormalRequests++;
      return route.fulfill({ contentType: "image/webp", body: fs.readFileSync(path.join(root, "Taierzhuang1938/Texture/Texture_DadaoNormal.webp")) });
    });
  }
  page.on("pageerror", error => errors.push(String(error)));
  page.on("console", message => {
    if (message.type() !== "error") return;
    const url = message.location()?.url || "";
    // Static ServeRoot has Pages semantics. These optional editor-write probes
    // deliberately return 404 and disable saving. Asset and script errors fail.
    if (/404/.test(message.text()) && url && capabilityPaths.has(new URL(url).pathname)) {
      capabilityProbes.push(url);
      return;
    }
    errors.push(`${message.text()} @ ${url}`);
  });
  page.on("response", response => { if (response.status() >= 400) console.log(`[HTTP ${response.status()}] ${response.url()}`); });
  await page.addInitScript(() => {
    localStorage.setItem("tengxian1938_audio_v1", JSON.stringify({ master: 0 }));
    localStorage.setItem("tengxian1938_tools_volume_v1", JSON.stringify({ volume: 0, muted: true }));
  });
  await page.goto(`${origin}/Taierzhuang1938/AdvancedTools/Tool_MixamoAnimationPreview.html?who=liuWencai`, { waitUntil: "load", timeout: 180000 });
  await page.waitForFunction(() => window.__preview?.action && document.querySelector("#who")?.value === "liuWencai", null, { timeout: 180000 });
  await page.waitForFunction(() => {
    let loaded = false;
    window.__preview.dadao?.traverse(object => { if (object.material?.normalMap?.image?.width > 0) loaded = true; });
    return loaded;
  }, null, { timeout: 180000 });
  if (!custom) assert.ok(publishedNormalRequests > 0, "preview props resolve published texture paths");
  const info = await page.evaluate(() => {
    const P = window.__preview, mesh = P.character.getObjectByProperty("isSkinnedMesh", true);
    const head = mesh.skeleton.getBoneByName("Head"), headIndex = mesh.skeleton.bones.indexOf(head);
    const weights = mesh.geometry.attributes.skinWeight, joints = mesh.geometry.attributes.skinIndex;
    const rigid = [];
    for (let i = 0; i < weights.count; i++) {
      let value = 0;
      for (let k = 0; k < 4; k++) if (joints.getComponent(i, k) === headIndex) value += weights.getComponent(i, k);
      if (value > .99999) rigid.push(i);
    }
    window.__liuWencai = { mesh, head, rigid };
    document.querySelector("#edRoot").style.display = "none";
    document.querySelector("#follow").checked = false;
    return { material: mesh.material.name, bones: mesh.skeleton.bones.length, vertices: weights.count, rigidHeadVertices: rigid.length };
  });
  assert.match(info.material, /LiuWencai/);
  assert.equal(info.bones, 65);
  // The native skin blends the lower face into Neck. The shared static test
  // verifies that every upper-head vertex has full Head influence.
  assert.ok(info.rigidHeadVertices > 1000);
  for (const file of clips) {
    const result = await page.evaluate(async file => {
      const P = window.__preview, { mesh, head, rigid } = window.__liuWencai;
      const V = P.camera.position.constructor;
      await P.SelectFile(file);
      const action = P.action, mixer = action.getMixer(), duration = action.getClip().duration;
      const Pose = time => { action.paused = false; mixer.setTime(time); action.paused = true; P.Place(); mesh.skeleton.update(); };
      const Point = i => mesh.getVertexPosition(i, new V()).applyMatrix4(mesh.matrixWorld);
      Pose(0);
      const inverse = head.matrixWorld.clone().invert();
      const sample = rigid.filter((_, i) => i % 8 === 0).map(i => [i, Point(i).applyMatrix4(inverse)]);
      let maxHeadError = 0, maxRadius = 0, minY = Infinity;
      for (let frame = 0; frame <= 40; frame++) {
        Pose(Math.min(duration - .00001, duration * frame / 40));
        for (const [i, rest] of sample) {
          const expected = rest.clone().applyMatrix4(head.matrixWorld);
          maxHeadError = Math.max(maxHeadError, Point(i).distanceTo(expected));
        }
        const hips = P.character.getObjectByName("Hips").getWorldPosition(new V());
        for (let i = 0; i < mesh.geometry.attributes.position.count; i += frame % 20 === 0 ? 1 : 32) {
          const p = Point(i);
          if (![p.x, p.y, p.z].every(Number.isFinite)) throw Error(`${file}: nonfinite skin`);
          maxRadius = Math.max(maxRadius, p.distanceTo(hips)); minY = Math.min(minY, p.y);
        }
      }
      Pose(duration * .5);
      const hips = P.character.getObjectByName("Hips").getWorldPosition(new V());
      P.orbit.target.copy(hips); P.orbit.target.y = Math.max(.55, hips.y); P.orbit.pan.set(0, 0, 0);
      Object.assign(P.orbit, { yaw: .55, pitch: .12, dist: 3.4 });
      return { file, frames: 41, maxHeadError, maxRadius, minY };
    }, file);
    assert.ok(result.maxHeadError < .00001, `${file}: rigid head/cap`);
    assert.ok(result.maxRadius < 1.8, `${file}: skin stays near skeleton`);
    if (["Animation_Mixamo_Crawling_V1.glb", "Animation_Mixamo_ProneFiringRifle_V2.glb", "Animation_Mixamo_SittingIdle_V2.glb", "Animation_Mixamo_Dying_V3.glb", "Animation_Mixamo_IdleCrouchingAiming_V1.glb"].includes(file)) {
      assert.ok(result.minY > -.02, `${file}: contact-corrected skin stays above the floor`);
    }
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await Capture(page, file.replace(/\.glb$/, ".jpg"));
    results.push(result);
    console.log(`[LiuWencai] ${file}: ${result.frames} frames`);
  }
  const previewSamplers = await Samplers(page);
  assert.ok(previewSamplers.programs.every(program => program.linked && program.count <= previewSamplers.limit));
  assert.equal(previewSamplers.error, 0);
  await page.goto(`${origin}/Taierzhuang1938/?editor=blockout&level=FirstLevel0105&kf=01-1&scale=small&audio=0&manual=1&quality=high`, { waitUntil: "load", timeout: sceneTimeout });
  await page.waitForFunction(() => window.Tengxian?.Debug?.Blockout?.State?.().ready, null, { timeout: sceneTimeout });
  await page.waitForFunction(() => {
    const T = window.Tengxian;
    T.StepFrames(2, 1 / 60, false);
    let ready = false;
    T.scene.traverse(object => { if (object.userData?.xbotSkin?.shownValid && object.userData.xbotSkin.kit.key === "liuWencai") ready = true; });
    return ready;
  }, null, { timeout: 180000 });
  const game = await page.evaluate(() => {
    const T = window.Tengxian, skins = [];
    T.scene.traverse(object => { const skin = object.userData?.xbotSkin; if (skin?.shownValid && skin.kit.key === "liuWencai") skins.push(skin); });
    const skin = skins[0], V = T.camera.position.constructor;
    const hip = skin.H("Hips").getWorldPosition(new V()), head = skin.H("Head").getWorldPosition(new V());
    const focus = hip.clone().lerp(head, .65), eye = focus.clone().add(new V(.8, .2, .8));
    const direction = focus.clone().sub(eye).normalize();
    T.Debug.Blockout.Fly(true, { x: eye.x, y: eye.y, z: eye.z, yawDeg: Math.atan2(-direction.x, -direction.z) * 180 / Math.PI, pitchDeg: Math.asin(direction.y) * 180 / Math.PI });
    T.StepFrames(8, 1 / 60, true);
    return { count: skins.length, kit: skin.kit.key, clip: skin.current?.file, probe: skin.Probe() };
  });
  assert.ok(game.count > 0, "the existing Liu Wencai scene unit uses the registered model");
  assert.equal(game.kit, "liuWencai");
  const sceneSamplers = await Samplers(page);
  assert.ok(sceneSamplers.programs.every(program => program.linked && program.count <= sceneSamplers.limit));
  assert.equal(sceneSamplers.error, 0);
  await Capture(page, "Scene_LiuWencai.jpg");
  await page.evaluate(() => window.Tengxian.Debug.Blockout.Play.Start({
    from: "02-4", to: "02-4", settings: { invincible: true, infiniteAmmo: false, previz: false },
  }));
  await page.waitForFunction(() => {
    const T = window.Tengxian;
    T.StepFrames(2, 1 / 60, false);
    return T.Debug.Blockout.Play.State().run?.step === "02-4";
  }, null, { timeout: sceneTimeout });
  const play = await page.evaluate(() => {
    const T = window.Tengxian, skins = [];
    T.scene.traverse(object => { const skin = object.userData?.xbotSkin; if (skin?.shownValid && skin.kit.key === "liuWencai") skins.push(skin); });
    T.StepFrames(30, 1 / 60, false);
    return { state: T.Debug.Blockout.Play.State(), scene: T.Debug.Blockout.Play.Scene(), characters: skins.length };
  });
  assert.ok(play.characters > 0, "Liu Wencai is rendered during actual scene play");
  assert.equal(play.scene.variant, "play");
  await Capture(page, "Play_LiuWencai.jpg");
  fs.writeFileSync(path.join(output, "Data_BrowserReview.json"), `${JSON.stringify({ info, results, game, play, previewSamplers, sceneSamplers, capabilityProbes, errors }, null, 2)}\n`);
  assert.deepEqual(errors, []);
  console.log("LiuWencaiCharacterBrowserTest ok", JSON.stringify({ info, clips: results.length, game }));
} finally {
  await browser.close();
  if (server) await new Promise(resolve => server.close(resolve));
}
