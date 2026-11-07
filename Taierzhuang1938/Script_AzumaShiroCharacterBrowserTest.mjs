// Verify Azuma Shiro through the shared preview and in-memory scene configuration.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { LaunchBrowser } from "../PrairieFire1937/Script_BrowserTestKit.mjs";
import { ServeRoot } from "./Script_DevServer.mjs";
import { XBOT_CHARACTERS } from "./Data_XBotCharacters.mjs";

const root = path.resolve(import.meta.dirname, "..");
const custom = process.argv.find(arg => arg.startsWith("--url="))?.slice(6);
const server = custom ? null : await ServeRoot(root, 0);
const origin = custom || `http://127.0.0.1:${server.address().port}`;
const output = path.join(root, "tmp", custom?.includes("github.io") ? "AzumaShiroOnline" : "AzumaShiro");
fs.mkdirSync(output, { recursive: true });
const browser = await LaunchBrowser({ extraArgs: ["--mute-audio"] });
const errors = [], results = [];
const clips = [
  "Animation_Mixamo_NeutralIdle_V1.glb", "Animation_Mixamo_Talking_V2.glb",
  "Animation_Mixamo_PointingForward_V1.glb", "Animation_Mixamo_LookingAround_V2.glb",
  "Animation_Mixamo_Walking_V21.glb", "Animation_Mixamo_UnarmedRunForward_V1.glb",
  "Animation_Mixamo_RifleAimingIdle_V1.glb", "Animation_Mixamo_WalkWithRifle_V3.glb",
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
  page.on("pageerror", error => errors.push(String(error)));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  if (!custom) {
    for (const route of ["**/__blockout/status", "**/__environment/status"]) {
      await page.route(route, request => request.fulfill({ json: { writable: false } }));
    }
  }
  await page.addInitScript(() => {
    localStorage.setItem("tengxian1938_audio_v1", JSON.stringify({ master: 0 }));
    localStorage.setItem("tengxian1938_tools_volume_v1", JSON.stringify({ volume: 0, muted: true }));
  });
  await page.goto(`${origin}/Taierzhuang1938/Tool_MixamoAnimationPreview.html?who=azumaShiro`, { waitUntil: "load", timeout: 180000 });
  await page.waitForFunction(() => window.__preview?.action && document.querySelector("#who")?.value === "azumaShiro", null, { timeout: 180000 });
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
    window.__azumaShiro = { mesh, head, rigid };
    document.querySelector("#edRoot").style.display = "none";
    document.querySelector("#follow").checked = false;
    return { material: mesh.material.name, bones: mesh.skeleton.bones.length, vertices: weights.count, rigidHeadVertices: rigid.length };
  });
  assert.match(info.material, /AzumaShiro/);
  assert.equal(info.bones, 65);
  // The native skin blends the lower face into Neck. The shared static test
  // verifies that every upper-head vertex has full Head influence.
  assert.ok(info.rigidHeadVertices > 1000);
  for (const file of clips) {
    const result = await page.evaluate(async file => {
      const P = window.__preview, { mesh, head, rigid } = window.__azumaShiro;
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
    if (XBOT_CHARACTERS.azumaShiro.clipOverrides[file]) assert.ok(result.minY >= .0015, `${file}: corrected skinned surface clears the floor`);
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await Capture(page, file.replace(/\.glb$/, ".jpg"));
    if (file === "Animation_Mixamo_NeutralIdle_V1.glb") {
      for (const [view, yaw, targetY, distance] of [["Front", .25, 1.50, 1.35], ["Back", Math.PI + .25, 1.12, 1.75]]) {
        await page.evaluate(({ yaw, targetY, distance }) => {
          const P = window.__preview; P.orbit.target.set(0, targetY, 0); P.orbit.pan.set(0, 0, 0);
          Object.assign(P.orbit, { yaw, pitch: .08, dist: distance });
        }, { yaw, targetY, distance });
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        await Capture(page, `Preview_AzumaShiro_${view}.jpg`);
      }
    }
    results.push(result);
    console.log(`[AzumaShiro] ${file}: ${result.frames} frames`);
  }
  const previewSamplers = await Samplers(page);
  assert.ok(previewSamplers.programs.every(program => program.linked && program.count <= previewSamplers.limit));
  assert.equal(previewSamplers.error, 0);
  let sceneFixtureLoaded = false;
  await page.route("**/Blockout/FirstLevel0105.json*", async route => {
    const response = await route.fetch();
    const config = await response.json();
    const frame = config.keyframes[0], x = frame.player.x + 8, z = frame.player.z;
    frame.units.push(
      { id: "ReviewTaniCast", side: "ija", kind: "officer", name: "东史郎", castId: "azumaShiro", x, z, yawDeg: 180 },
      { id: "AzumaShiro", side: "ija", kind: "officer", name: "东史郎", x: x + 2, z, yawDeg: 180 },
    );
    sceneFixtureLoaded = true;
    await route.fulfill({ response, json: config });
  });
  await page.goto(`${origin}/Taierzhuang1938/?editor=blockout&level=FirstLevel0105&kf=01-1&scale=small&audio=0&manual=1&quality=high`, { waitUntil: "load", timeout: 300000 });
  await page.waitForFunction(() => window.Tengxian?.Debug?.Blockout?.State?.().ready, null, { timeout: 300000 });
  await page.waitForFunction(() => {
    const T = window.Tengxian;
    T.StepFrames(2, 1 / 60, false);
    let ready = false;
    T.scene.traverse(object => { if (object.userData?.xbotSkin?.shownValid && object.userData.xbotSkin.kit.key === "azumaShiro") ready = true; });
    return ready;
  }, null, { timeout: 180000 });
  const game = await page.evaluate(() => {
    const T = window.Tengxian, skins = [];
    T.scene.traverse(object => { const skin = object.userData?.xbotSkin; if (skin?.shownValid && skin.kit.key === "azumaShiro") skins.push(skin); });
    const skin = skins[0], V = T.camera.position.constructor;
    const hip = skin.H("Hips").getWorldPosition(new V()), head = skin.H("Head").getWorldPosition(new V());
    const focus = hip.clone().lerp(head, .45), eye = focus.clone().add(new V(1.6, .8, 1.6));
    const direction = focus.clone().sub(eye).normalize();
    T.Debug.Blockout.Fly(true, { x: eye.x, y: eye.y, z: eye.z, yawDeg: Math.atan2(-direction.x, -direction.z) * 180 / Math.PI, pitchDeg: Math.asin(direction.y) * 180 / Math.PI });
    T.StepFrames(8, 1 / 60, true);
    return { count: skins.length, kit: skin.kit.key, clip: skin.current?.file, probe: skin.Probe() };
  });
  assert.ok(sceneFixtureLoaded, "scene config fixture was loaded through the normal entry point");
  assert.equal(game.count, 2, "castId and unit-id configurations both resolve to Azuma Shiro");
  assert.equal(game.kit, "azumaShiro");
  const sceneSamplers = await Samplers(page);
  assert.ok(sceneSamplers.programs.every(program => program.linked && program.count <= sceneSamplers.limit));
  assert.equal(sceneSamplers.error, 0);
  await Capture(page, "Scene_AzumaShiro.jpg");
  await page.evaluate(() => window.Tengxian.Debug.Blockout.Play.Start({
    from: "01-1", to: "01-2", settings: { invincible: true, infiniteAmmo: true, previz: false },
  }));
  await page.waitForFunction(() => {
    const T = window.Tengxian;
    T.StepFrames(4, 1 / 60, false);
    const scene = T.Debug.Blockout.Play.Scene();
    return scene.variant === "play" && scene.style === "formal" && document.body.classList.contains("blockoutPlay");
  }, null, { timeout: 180000 });
  await page.waitForFunction(() => {
    const T = window.Tengxian; T.StepFrames(4, 1 / 60, false); let count = 0;
    T.scene.traverse(object => { const skin = object.userData?.xbotSkin; if (skin?.shownValid && skin.kit.key === "azumaShiro") count++; });
    return count === 2;
  }, null, { timeout: 180000 });
  const play = await page.evaluate(() => {
    const T = window.Tengxian, skins = [], V = T.camera.position.constructor;
    T.StepFrames(16, 1 / 60, true);
    T.scene.traverse(object => {
      const skin = object.userData?.xbotSkin;
      if (skin?.shownValid && skin.kit.key === "azumaShiro") skins.push({ worldScale: skin.container.getWorldScale(new V()).toArray(), probe: skin.Probe() });
    });
    return { scene: T.Debug.Blockout.Play.Scene(), skins };
  });
  assert.equal(play.skins.length, 2, "both identity paths persist during formal-scene play");
  assert.ok(play.skins.every(skin => skin.worldScale.every(value => Math.abs(value - 1) < .0001)), "authored metre scale persists in game");
  const playSamplers = await Samplers(page);
  assert.ok(playSamplers.programs.every(program => program.linked && program.count <= playSamplers.limit));
  assert.equal(playSamplers.error, 0);
  await Capture(page, "Play_AzumaShiro.jpg");
  assert.deepEqual(errors, []);
  fs.writeFileSync(path.join(output, "Data_BrowserReview.json"), `${JSON.stringify({ info, results, game, play, previewSamplers, sceneSamplers, playSamplers, errors }, null, 2)}\n`);
  console.log("AzumaShiroCharacterBrowserTest ok", JSON.stringify({ info, clips: results.length, game }));
} finally {
  await browser.close();
  if (server) await new Promise(resolve => server.close(resolve));
}
