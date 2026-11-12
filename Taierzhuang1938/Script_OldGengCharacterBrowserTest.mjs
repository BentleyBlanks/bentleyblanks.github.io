// Verify Old Geng through shared animation playback and his actual first-level role.
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
const output = path.join(root, "tmp", custom?.includes("github.io") ? "OldGengOnline" : "OldGeng");
fs.mkdirSync(output, { recursive: true });
const browser = await LaunchBrowser({ extraArgs: ["--mute-audio"] });
const errors = [], results = [], httpFailures = [];
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
  page.on("requestfailed", request => httpFailures.push({ url: request.url(), error: request.failure()?.errorText }));
  page.on("response", response => {
    if (response.status() < 400) return;
    const failure = { status: response.status(), url: response.url() };
    httpFailures.push(failure);
    console.log("[OldGeng HTTP]", JSON.stringify(failure));
  });
  // Read-only server capabilities are explicit fixtures for the editor shell.
  if (server) for (const endpoint of ["__environment", "__blockout"]) {
    await page.route(`**/${endpoint}/status`, route => route.fulfill({ json: { writable: false } }));
  }
  await page.addInitScript(() => {
    localStorage.setItem("tengxian1938_audio_v1", JSON.stringify({ master: 0 }));
    localStorage.setItem("tengxian1938_tools_volume_v1", JSON.stringify({ volume: 0, muted: true }));
  });
  await page.goto(`${origin}/Taierzhuang1938/AdvancedTools/Tool_MixamoAnimationPreview.html?who=oldGeng`, { waitUntil: "load", timeout: 180000 });
  await page.waitForFunction(() => window.__preview?.action && document.querySelector("#who")?.value === "oldGeng", null, { timeout: 180000 });
  const info = await page.evaluate(() => {
    const P = window.__preview, mesh = P.character.getObjectByProperty("isSkinnedMesh", true);
    const head = mesh.skeleton.getBoneByName("Head"), headIndex = mesh.skeleton.bones.indexOf(head);
    const weights = mesh.geometry.attributes.skinWeight, joints = mesh.geometry.attributes.skinIndex;
    const limbBones = mesh.skeleton.bones.filter(bone => bone.name !== "Hips");
    const limbPositions = limbBones.map(bone => bone.position.clone());
    const rigid = [];
    for (let i = 0; i < weights.count; i++) {
      let value = 0;
      for (let k = 0; k < 4; k++) if (joints.getComponent(i, k) === headIndex) value += weights.getComponent(i, k);
      if (value > .99999) rigid.push(i);
    }
    window.__oldGeng = { mesh, head, rigid, limbBones, limbPositions };
    document.querySelector("#edRoot").style.display = "none";
    document.querySelector("#follow").checked = false;
    return { material: mesh.material.name, bones: mesh.skeleton.bones.length, vertices: weights.count, rigidHeadVertices: rigid.length };
  });
  assert.match(info.material, /OldGeng/);
  assert.equal(info.bones, 65);
  // The native skin blends the lower face into Neck. The shared static test
  // verifies that every upper-head vertex has full Head influence.
  assert.ok(info.rigidHeadVertices > 1000);
  for (const file of clips) {
    const result = await page.evaluate(async file => {
      const P = window.__preview, { mesh, head, rigid, limbBones, limbPositions } = window.__oldGeng;
      const V = P.camera.position.constructor;
      await P.SelectFile(file);
      const action = P.action, mixer = action.getMixer(), duration = action.getClip().duration;
      const Pose = time => { action.paused = false; mixer.setTime(time); action.paused = true; P.Place(); mesh.skeleton.update(); };
      const Point = i => mesh.getVertexPosition(i, new V()).applyMatrix4(mesh.matrixWorld);
      Pose(0);
      const inverse = head.matrixWorld.clone().invert();
      const sample = rigid.filter((_, i) => i % 8 === 0).map(i => [i, Point(i).applyMatrix4(inverse)]);
      const grounded = /IdleCrouchingAiming|ProneFiringRifle|Dying|SittingIdle/.test(file);
      let maxHeadError = 0, maxRadius = 0, maxLimbTranslationError = 0, minY = Infinity;
      for (let frame = 0; frame <= 40; frame++) {
        Pose(Math.min(duration - .00001, duration * frame / 40));
        for (let i = 0; i < limbBones.length; i++) {
          maxLimbTranslationError = Math.max(maxLimbTranslationError, limbBones[i].position.distanceTo(limbPositions[i]));
        }
        for (const [i, rest] of sample) {
          const expected = rest.clone().applyMatrix4(head.matrixWorld);
          maxHeadError = Math.max(maxHeadError, Point(i).distanceTo(expected));
        }
        const hips = P.character.getObjectByName("Hips").getWorldPosition(new V());
        for (let i = 0; i < mesh.geometry.attributes.position.count; i += grounded || frame % 20 === 0 ? 1 : 32) {
          const p = Point(i);
          if (![p.x, p.y, p.z].every(Number.isFinite)) throw Error(`${file}: nonfinite skin`);
          maxRadius = Math.max(maxRadius, p.distanceTo(hips)); minY = Math.min(minY, p.y);
        }
      }
      Pose(duration * .5);
      const hips = P.character.getObjectByName("Hips").getWorldPosition(new V());
      P.orbit.target.copy(hips); P.orbit.target.y = Math.max(.55, hips.y); P.orbit.pan.set(0, 0, 0);
      Object.assign(P.orbit, { yaw: .55, pitch: .12, dist: 3.4 });
      return { file, frames: 41, grounded, maxHeadError, maxRadius, maxLimbTranslationError, minY };
    }, file);
    assert.ok(result.maxHeadError < .00001, `${file}: rigid head/cap`);
    assert.ok(result.maxRadius < 1.8, `${file}: skin stays near skeleton`);
    assert.ok(result.maxLimbTranslationError < .00001, `${file}: bone lengths remain unchanged`);
    if (result.grounded) assert.ok(result.minY > -.003, `${file}: corrected skin stays above the floor`);
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await Capture(page, file.replace(/\.glb$/, ".jpg"));
    results.push(result);
    console.log(`[OldGeng] ${file}: ${result.frames} frames`);
  }
  for (const focus of ["head", "ankles"]) {
    await page.evaluate(async focus => {
      const P = window.__preview, { mesh } = window.__oldGeng, V = P.camera.position.constructor;
      await P.SelectFile(focus === "head" ? "Animation_Mixamo_LookingAround_V2.glb" : "Animation_Mixamo_NeutralIdle_V1.glb");
      P.action.paused = false;
      P.action.getMixer().setTime(P.action.getClip().duration * .35);
      P.action.paused = true;
      P.Place();
      mesh.skeleton.update();
      const target = focus === "head" ? mesh.skeleton.getBoneByName("Head").getWorldPosition(new V())
        : mesh.skeleton.getBoneByName("LeftFoot").getWorldPosition(new V()).lerp(mesh.skeleton.getBoneByName("RightFoot").getWorldPosition(new V()), .5);
      target.y += focus === "head" ? -.03 : .10;
      P.orbit.target.copy(target);
      P.orbit.pan.set(0, 0, 0);
      Object.assign(P.orbit, { yaw: focus === "head" ? .55 : 0, pitch: .08, dist: focus === "head" ? .85 : 1.2 });
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    }, focus);
    await Capture(page, `Detail_${focus}.jpg`);
  }
  const previewSamplers = await Samplers(page);
  assert.ok(previewSamplers.programs.every(program => program.linked && program.count <= previewSamplers.limit));
  assert.equal(previewSamplers.error, 0);
  let sceneFixtureLoaded = false;
  await page.route("**/Blockout/FirstLevel0610.json*", async route => {
    const response = await route.fetch();
    const config = await response.json();
    const frame = config.keyframes[0];
    const geng = frame.units.find(unit => unit.id === "Geng");
    assert.ok(geng, "the actual first-level Geng unit exists");
    frame.units.push({ ...structuredClone(geng), id: "ReviewOldGengCast", castId: "geng", x: geng.x - 8 });
    sceneFixtureLoaded = true;
    await route.fulfill({ response, json: config });
  });
  await page.goto(`${origin}/Taierzhuang1938/?editor=blockout&level=FirstLevel0610&scene=FirstLevel&kf=06-1&scale=small&audio=0&manual=1&quality=high`, { waitUntil: "load", timeout: 300000 });
  await page.waitForFunction(() => window.Tengxian?.Debug?.Blockout?.State?.().ready, null, { timeout: 300000 });
  await page.waitForFunction(() => {
    const T = window.Tengxian;
    T.StepFrames(2, 1 / 60, false);
    let ready = false;
    T.scene.traverse(object => { if (object.userData?.xbotSkin?.shownValid && object.userData.xbotSkin.kit.key === "oldGeng") ready = true; });
    return ready;
  }, null, { timeout: 180000 });
  const game = await page.evaluate(() => {
    const T = window.Tengxian, skins = [];
    T.scene.traverse(object => { const skin = object.userData?.xbotSkin; if (skin?.shownValid && skin.kit.key === "oldGeng") skins.push(skin); });
    const skin = skins[0], V = T.camera.position.constructor;
    const hip = skin.H("Hips").getWorldPosition(new V()), head = skin.H("Head").getWorldPosition(new V());
    const focus = hip.clone().lerp(head, .45), eye = focus.clone().add(new V(-2.2, 1.2, -2.2));
    const direction = focus.clone().sub(eye).normalize();
    T.Debug.Blockout.Fly(true, { x: eye.x, y: eye.y, z: eye.z, yawDeg: Math.atan2(-direction.x, -direction.z) * 180 / Math.PI, pitchDeg: Math.asin(direction.y) * 180 / Math.PI });
    T.StepFrames(8, 1 / 60, true);
    return { count: skins.length, kit: skin.kit.key, clip: skin.current?.file, probe: skin.Probe() };
  });
  assert.ok(sceneFixtureLoaded, "scene config fixture was loaded through the normal entry point");
  assert.equal(game.count, 2, "the real Geng unit and an explicit geng cast both use Old Geng");
  assert.equal(game.kit, "oldGeng");
  const sceneSamplers = await Samplers(page);
  assert.ok(sceneSamplers.programs.every(program => program.linked && program.count <= sceneSamplers.limit));
  assert.equal(sceneSamplers.error, 0);
  await Capture(page, "Scene_OldGeng.jpg");
  await page.evaluate(() => window.Tengxian.Debug.Blockout.Play.Start({
    from: "06-1", to: "06-2", settings: { invincible: true, infiniteAmmo: true, previz: false },
  }));
  await page.waitForFunction(() => {
    const T = window.Tengxian;
    T.StepFrames(4, 1 / 60, false);
    const scene = T.Debug.Blockout.Play.Scene();
    return scene.variant === "play" && scene.style === "formal" && document.body.classList.contains("blockoutPlay");
  }, null, { timeout: 180000 });
  const play = await page.evaluate(() => {
    const T = window.Tengxian, skins = [];
    T.StepFrames(30, 1 / 60, true);
    T.scene.traverse(object => {
      const skin = object.userData?.xbotSkin;
      if (skin?.shownValid && skin.kit.key === "oldGeng") skins.push(skin.Probe());
    });
    return { scene: T.Debug.Blockout.Play.Scene(), skins };
  });
  assert.ok(play.skins.length > 0, "Old Geng remains present during actual formal scene play");
  const playSamplers = await Samplers(page);
  assert.ok(playSamplers.programs.every(program => program.linked && program.count <= playSamplers.limit));
  assert.equal(playSamplers.error, 0);
  await Capture(page, "Play_OldGeng.jpg");
  fs.writeFileSync(path.join(output, "Data_BrowserReview.json"), `${JSON.stringify({ info, results, game, play, previewSamplers, sceneSamplers, playSamplers, errors, httpFailures }, null, 2)}\n`);
  assert.deepEqual(httpFailures, []);
  assert.deepEqual(errors, []);
  console.log("OldGengCharacterBrowserTest ok", JSON.stringify({ info, clips: results.length, game }));
} finally {
  await browser.close();
  if (server) await new Promise(resolve => server.close(resolve));
}
