// Check Nier's authored stature, facial skin and representative motions in game.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { LaunchBrowser } from "../PrairieFire1937/Script_BrowserTestKit.mjs";
import { ServeRoot } from "./Script_DevServer.mjs";
import { XBOT_CHARACTERS } from "./Data_XBotCharacters.mjs";

const root = path.resolve(import.meta.dirname, "..");
const custom = process.argv.find(argument => argument.startsWith("--url="))?.slice(6);
const server = custom ? null : await ServeRoot(root, 0);
const origin = custom || `http://127.0.0.1:${server.address().port}`;
const output = path.join(root, "tmp", "Nier");
fs.mkdirSync(output, { recursive: true });
const browser = await LaunchBrowser({ extraArgs: ["--mute-audio"] });
const errors = [], results = [], resourceFailures = [];
const clips = [
  "Animation_Mixamo_NeutralIdle_V1.glb", "Animation_Mixamo_LookingAround_V2.glb",
  "Animation_Mixamo_Walking_V21.glb", "Animation_Mixamo_UnarmedRunForward_V1.glb",
  "Animation_Mixamo_KneelingIdle_V1.glb", "Animation_Mixamo_CrouchWalking_V1.glb",
  "Animation_Mixamo_KneelingInspecting_V1.glb", "Animation_Mixamo_SittingIdle_V2.glb",
];
async function Capture(page, name) {
  await sharp(await page.screenshot()).resize({ width: 640, height: 640, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 83 }).toFile(path.join(output, name));
}
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  page.on("pageerror", error => errors.push(String(error)));
  page.on("console", message => { if (message.type() === "error") errors.push(`${message.text()} @ ${message.location().url}`); });
  page.on("response", response => {
    if (response.status() >= 400) {
      resourceFailures.push({ url: response.url(), status: response.status() });
      console.log("[Nier] resource failure", response.status(), response.url());
    }
  });
  // The static test server has no editor write backend. Supply its read-only status.
  if (!custom) {
    for (const route of ["**/__blockout/status", "**/__environment/status"]) {
      await page.route(route, request => request.fulfill({ json: { writable: false } }));
    }
  }
  await page.addInitScript(() => {
    localStorage.setItem("tengxian1938_audio_v1", JSON.stringify({ master: 0 }));
    localStorage.setItem("tengxian1938_tools_volume_v1", JSON.stringify({ volume: 0, muted: true }));
  });
  await page.goto(`${origin}/Taierzhuang1938/Tool_MixamoAnimationPreview.html?who=nier`, { waitUntil: "load", timeout: 180000 });
  await page.waitForFunction(() => window.__preview?.action && document.querySelector("#who")?.value === "nier", null, { timeout: 180000 });
  const info = await page.evaluate(async () => {
    const P = window.__preview, THREE = await import("three");
    const mesh = P.character.getObjectByProperty("isSkinnedMesh", true);
    const head = mesh.skeleton.getBoneByName("Head");
    P.character.updateMatrixWorld(true);
    const face = [], vertex = new THREE.Vector3(), bounds = new THREE.Box3();
    for (let index = 0; index < mesh.geometry.attributes.position.count; index++) {
      vertex.fromBufferAttribute(mesh.geometry.attributes.position, index).applyMatrix4(mesh.matrixWorld);
      bounds.expandByPoint(vertex);
      if (vertex.y > 1.11 || (vertex.y > 1.08 && vertex.z > .06 && Math.abs(vertex.x) < .06)) face.push(index);
    }
    window.__nierReview = { mesh, head, face, THREE };
    document.querySelector("#edRoot").style.display = "none";
    document.querySelector("#follow").checked = false;
    return { material: mesh.material.name, bones: mesh.skeleton.bones.length, faceVertices: face.length,
      restHeightM: bounds.max.y - bounds.min.y, bounds: { min: bounds.min.toArray(), max: bounds.max.toArray() } };
  });
  assert.match(info.material, /Nier/);
  assert.equal(info.bones, 65);
  assert.ok(info.faceVertices > 3000);
  assert.ok(Math.abs(info.restHeightM - XBOT_CHARACTERS.nier.heightM) < .0002);
  for (const file of clips) {
    const result = await page.evaluate(async file => {
      const P = window.__preview, { mesh, head, face, THREE } = window.__nierReview;
      await P.SelectFile(file);
      const action = P.action, mixer = action.getMixer(), duration = action.getClip().duration;
      const Pose = time => { action.paused = false; mixer.setTime(time); action.paused = true; P.Place(); mesh.skeleton.update(); };
      const Point = index => mesh.getVertexPosition(index, new THREE.Vector3()).applyMatrix4(mesh.matrixWorld);
      Pose(0);
      const inverse = head.matrixWorld.clone().invert();
      const samples = face.filter((_, index) => index % 8 === 0).map(index => [index, Point(index).applyMatrix4(inverse)]);
      let maxFaceErrorM = 0, maxRadiusM = 0, minY = Infinity;
      for (let frame = 0; frame <= 32; frame++) {
        Pose(Math.min(duration - .00001, duration * frame / 32));
        for (const [index, rest] of samples) maxFaceErrorM = Math.max(maxFaceErrorM, Point(index).distanceTo(rest.clone().applyMatrix4(head.matrixWorld)));
        const hips = P.character.getObjectByName("Hips").getWorldPosition(new THREE.Vector3());
        for (let index = 0; index < mesh.geometry.attributes.position.count; index += frame % 16 === 0 ? 1 : 32) {
          const point = Point(index);
          if (![point.x, point.y, point.z].every(Number.isFinite)) throw Error(`${file}: nonfinite skin`);
          maxRadiusM = Math.max(maxRadiusM, point.distanceTo(hips));
          minY = Math.min(minY, point.y);
        }
      }
      Pose(duration * .5);
      const hips = P.character.getObjectByName("Hips").getWorldPosition(new THREE.Vector3());
      P.orbit.target.copy(hips); P.orbit.target.y = Math.max(.4, hips.y);
      P.orbit.pan.set(0, 0, 0);
      Object.assign(P.orbit, { yaw: .55, pitch: .12, dist: 2.5 });
      return { file, frames: 33, maxFaceErrorM, maxRadiusM, minY };
    }, file);
    assert.ok(result.maxFaceErrorM < .0001, `${file}: facial skin follows the skull`);
    assert.ok(result.maxRadiusM < 1.35, `${file}: skin stays near its skeleton`);
    assert.ok(result.minY > -.01, `${file}: skin stays above the floor within one centimetre`);
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await Capture(page, file.replace(/\.glb$/, ".jpg"));
    results.push(result);
    console.log(`[Nier] ${file}: ${result.frames} frames`);
  }
  const headTurn = await page.evaluate(async () => {
    const P = window.__preview, { mesh, head, face, THREE } = window.__nierReview;
    await P.SelectFile("Animation_Mixamo_NeutralIdle_V1.glb");
    const action = P.action, mixer = action.getMixer();
    action.paused = false; mixer.setTime(0); action.paused = true; P.Place(); mesh.skeleton.update();
    const inverse = head.matrixWorld.clone().invert(), original = head.quaternion.clone();
    const Point = index => mesh.getVertexPosition(index, new THREE.Vector3()).applyMatrix4(mesh.matrixWorld);
    const samples = face.filter((_, index) => index % 5 === 0).map(index => [index, Point(index).applyMatrix4(inverse)]);
    let maxFaceErrorM = 0;
    for (const angle of [-45, -25, 25, 45]) {
      head.quaternion.copy(original).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), angle * Math.PI / 180));
      P.character.updateMatrixWorld(true); mesh.skeleton.update();
      for (const [index, rest] of samples) maxFaceErrorM = Math.max(maxFaceErrorM, Point(index).distanceTo(rest.clone().applyMatrix4(head.matrixWorld)));
    }
    head.quaternion.copy(original); P.Place(); mesh.skeleton.update();
    const helper = new THREE.SkeletonHelper(P.character);
    helper.material.depthTest = false; helper.material.transparent = true; helper.material.opacity = .8;
    P.scene.add(helper);
    P.orbit.target.set(0, .72, 0); P.orbit.pan.set(0, 0, 0);
    Object.assign(P.orbit, { yaw: .25, pitch: .08, dist: 2.6 });
    return { maxFaceErrorM, sampleVertices: samples.length };
  });
  assert.ok(headTurn.maxFaceErrorM < .0001, "Independent head turns keep the lower jaw attached");
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await Capture(page, "Preview_NierSkeleton.jpg");
  console.log("[Nier] preview and head turns passed");

  await page.goto(`${origin}/Taierzhuang1938/?editor=blockout&level=FirstLevel0610&kf=06-2&scale=small&audio=0&manual=1&quality=high`, { waitUntil: "load", timeout: 300000 });
  await page.waitForFunction(() => window.Tengxian?.Debug?.Blockout?.State?.().ready, null, { timeout: 300000 });
  await page.waitForFunction(() => {
    const T = window.Tengxian;
    T.StepFrames(2, 1 / 60, false);
    let ready = false;
    T.scene.traverse(object => { if (object.userData?.xbotSkin?.shownValid && object.userData.xbotSkin.kit.key === "nier") ready = true; });
    return ready;
  }, null, { timeout: 180000 });
  const game = await page.evaluate(async () => {
    const T = window.Tengxian, skins = [];
    T.scene.traverse(object => { if (object.userData?.xbotSkin?.shownValid && object.userData.xbotSkin.kit.key === "nier") skins.push(object.userData.xbotSkin); });
    const skin = skins[0], V = T.camera.position.constructor;
    const walkFile = "Animation_Mixamo_Walking_V21.glb";
    await skin.skins.Clip(walkFile);
    const moving = { mps: 1.3, stance: "stand", aim: false, down: false };
    skin.Sync(moving, 1 / 60);
    const beforeClock = skin.current.clock;
    for (let frame = 0; frame < 60; frame++) skin.Sync(moving, 1 / 60);
    const movementRate = skin.current.clock - beforeClock;
    if (skin.current.file !== walkFile) throw new Error(`Expected unarmed walk, got ${skin.current.file}`);
    const speed = skin.pick.speedMps || skin.pick.travel;
    const expectedRate = Math.max(.4, Math.min(2.2, moving.mps / (speed * skin.container.getWorldScale(new V()).x * skin.kit.def.hipsScale)));
    T.StepFrames(36, 1 / 60, true);
    T.scene.updateMatrixWorld(true);
    const head = skin.H("Head").getWorldPosition(new V()), hips = skin.H("Hips").getWorldPosition(new V());
    const forward = new V(0, 0, 1).applyQuaternion(skin.container.getWorldQuaternion(T.camera.quaternion.clone())).setY(0).normalize();
    const right = new V().crossVectors(forward, new V(0, 1, 0)).normalize();
    const focus = hips.clone().lerp(head, .55);
    const eye = focus.clone().addScaledVector(forward, 1.15).addScaledVector(right, .25).add(new V(0, .45, 0));
    const direction = focus.clone().sub(eye).normalize();
    T.Debug.Blockout.Fly(true, { x: eye.x, y: eye.y, z: eye.z, yawDeg: Math.atan2(-direction.x, -direction.z) * 180 / Math.PI, pitchDeg: Math.asin(direction.y) * 180 / Math.PI });
    T.StepFrames(8, 1 / 60, true);
    return { count: skins.length, kit: skin.kit.key, actorHeightM: skin.actor.height,
      worldScale: skin.container.getWorldScale(new V()).toArray(), movementRate, expectedMovementRate: expectedRate,
      clip: skin.current?.file, probe: skin.Probe(), state: T.Debug.Blockout.State() };
  });
  assert.equal(game.kit, "nier");
  assert.ok(Math.abs(game.actorHeightM - XBOT_CHARACTERS.nier.heightM) < .00001, "Scene actor uses Nier's authored stature");
  assert.ok(game.worldScale.every(value => Math.abs(value - 1) < .0001), "Scene visual preserves the model's metre scale");
  assert.ok(Number.isFinite(game.movementRate) && Math.abs(game.movementRate - game.expectedMovementRate) < .0001,
    "Child locomotion timing uses world scale and its own skeleton length");
  await Capture(page, "Scene_Nier.jpg");
  await page.evaluate(() => window.Tengxian.Debug.Blockout.Play.Start({
    from: "06-2", to: "06-3", settings: { invincible: true, infiniteAmmo: true, previz: false },
  }));
  await page.waitForFunction(() => {
    const T = window.Tengxian;
    T.StepFrames(4, 1 / 60, false);
    const scene = T.Debug.Blockout.Play.Scene();
    return scene.variant === "play" && scene.style === "formal" && document.body.classList.contains("blockoutPlay");
  }, null, { timeout: 180000 });
  const play = await page.evaluate(() => {
    const T = window.Tengxian, skins = [], V = T.camera.position.constructor;
    T.StepFrames(30, 1 / 60, true);
    T.scene.traverse(object => {
      const skin = object.userData?.xbotSkin;
      if (skin?.shownValid && skin.kit.key === "nier") {
        skins.push({ actorHeightM: skin.actor.height, worldScale: skin.container.getWorldScale(new V()).toArray(), probe: skin.Probe() });
      }
    });
    return { scene: T.Debug.Blockout.Play.Scene(), skins };
  });
  assert.ok(play.skins.length > 0, "Nier remains present during actual formal-scene play");
  for (const skin of play.skins) {
    assert.ok(Math.abs(skin.actorHeightM - XBOT_CHARACTERS.nier.heightM) < .00001);
    assert.ok(skin.worldScale.every(value => Math.abs(value - 1) < .0001));
  }
  await Capture(page, "Play_Nier.jpg");
  const contactObservations = results.filter(result => result.minY < -.02).map(result => ({ file: result.file, minimumYBelowPreviewFloorM: result.minY }));
  fs.writeFileSync(path.join(output, "Data_BrowserReview.json"), `${JSON.stringify({ info, results, headTurn, game, play, contactObservations, errors, resourceFailures }, null, 2)}\n`);
  assert.deepEqual(errors, []);
  assert.deepEqual(resourceFailures, []);
  console.log("NierCharacterBrowserTest ok", JSON.stringify({ info, clips: results.length, headTurn, game }));
} finally {
  await browser.close();
  if (server) await new Promise(resolve => server.close(resolve));
}
