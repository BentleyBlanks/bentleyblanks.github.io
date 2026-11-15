// Verify the actual Er Ya asset, lower-face skin, child contacts and game entry.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { LaunchBrowser } from "../PrairieFire1937/Script_BrowserTestKit.mjs";
import { ServeRoot } from "./Script_DevServer.mjs";
import { XBOT_CHARACTERS } from "./Data_XBotCharacters.mjs";

const root = path.resolve(import.meta.dirname, "..");
const output = path.join(root, "tmp", "ErYa");
fs.mkdirSync(output, { recursive: true });
const server = await ServeRoot(root, 0), origin = `http://127.0.0.1:${server.address().port}`;
const browser = await LaunchBrowser({ extraArgs: ["--mute-audio"] });
const failures = [], results = [], resourceFailures = [], optionalResources = [];
const optionalPlay = "/Blockout/FirstLevel1218.play.json";
async function Capture(page, name) {
  await sharp(await page.screenshot()).resize({ width: 640, height: 640, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 85 }).toFile(path.join(output, name));
}
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  page.on("pageerror", error => failures.push(String(error)));
  page.on("console", message => {
    if (message.type() !== "error") return;
    if (message.text().includes("404") && message.location().url.includes(optionalPlay)) return;
    failures.push(message.text() + " @ " + message.location().url);
  });
  page.on("response", response => {
    if (response.status() >= 400) {
      if (response.status() === 404 && response.url().includes(optionalPlay)) {
        optionalResources.push({ url: response.url(), status: 404 });
        return;
      }
      resourceFailures.push({ url: response.url(), status: response.status() });
      console.log("[ErYa] resource failure", response.status(), response.url());
    }
  });
  await page.addInitScript(() => {
    localStorage.setItem("tengxian1938_audio_v1", JSON.stringify({ master: 0 }));
    localStorage.setItem("tengxian1938_tools_volume_v1", JSON.stringify({ volume: 0, muted: true }));
  });
  await page.goto(`${origin}/Taierzhuang1938/AdvancedTools/Tool_MixamoAnimationPreview.html?who=erya`, { waitUntil: "load", timeout: 180000 });
  await page.waitForFunction(() => window.__preview?.action && document.querySelector("#who")?.value === "erya", null, { timeout: 180000 });
  const info = await page.evaluate(async () => {
    const P = window.__preview, THREE = await import("three");
    const mesh = P.character.getObjectByProperty("isSkinnedMesh", true), head = mesh.skeleton.getBoneByName("Head");
    const face = [], bounds = new THREE.Box3(), point = new THREE.Vector3();
    P.character.updateMatrixWorld(true);
    const uv = mesh.geometry.attributes.uv;
    for (let index = 0; index < mesh.geometry.attributes.position.count; index++) {
      point.fromBufferAttribute(mesh.geometry.attributes.position, index).applyMatrix4(mesh.matrixWorld);
      bounds.expandByPoint(point);
      if (uv.getX(index) > .5 && uv.getY(index) > .5 && point.y > 1.095) face.push(index);
    }
    window.__erYaReview = { mesh, head, face, THREE };
    document.querySelector("#edRoot").style.display = "none";
    document.querySelector("#follow").checked = false;
    return { heightM: bounds.max.y - bounds.min.y, bones: mesh.skeleton.bones.length,
      material: mesh.material.name, textureSize: [mesh.material.map.image.width, mesh.material.map.image.height], faceVertices: face.length };
  });
  assert.equal(info.bones, 65);
  assert.match(info.material, /ErYa/);
  assert.deepEqual(info.textureSize, [4096, 4096]);
  assert.ok(Math.abs(info.heightM - XBOT_CHARACTERS.erya.heightM) < .0002);
  assert.ok(info.faceVertices > 3000);
  for (const file of ["NeutralIdle_V1", "LookingAround_V2", "Walking_V21", "UnarmedRunForward_V1",
    "KneelingIdle_V1", "CrouchWalking_V1", "KneelingInspecting_V1", "SittingIdle_V2"]) {
    const result = await page.evaluate(async name => {
      const P = window.__preview, { mesh, head, face, THREE } = window.__erYaReview;
      await P.SelectFile(`Animation_Mixamo_${name}.glb`);
      const action = P.action, mixer = action.getMixer(), duration = action.getClip().duration;
      const Pose = time => { action.paused = false; mixer.setTime(time); action.paused = true; P.Place(); mesh.skeleton.update(); };
      const Point = index => mesh.getVertexPosition(index, new THREE.Vector3()).applyMatrix4(mesh.matrixWorld);
      Pose(0);
      const inverse = head.matrixWorld.clone().invert();
      const samples = face.filter((_, index) => index % 8 === 0).map(index => [index, Point(index).applyMatrix4(inverse)]);
      let faceErrorM = 0, minY = Infinity, radiusM = 0;
      for (let frame = 0; frame <= 32; frame++) {
        Pose(Math.min(duration - .00001, duration * frame / 32));
        for (const [index, rest] of samples) faceErrorM = Math.max(faceErrorM, Point(index).distanceTo(rest.clone().applyMatrix4(head.matrixWorld)));
        const hips = P.character.getObjectByName("Hips").getWorldPosition(new THREE.Vector3());
        for (let index = 0; index < mesh.geometry.attributes.position.count; index += frame % 16 === 0 ? 1 : 32) {
          const point = Point(index);
          if (![point.x, point.y, point.z].every(Number.isFinite)) throw new Error("Nonfinite skin");
          minY = Math.min(minY, point.y); radiusM = Math.max(radiusM, point.distanceTo(hips));
        }
      }
      Pose(duration * .5);
      const hips = P.character.getObjectByName("Hips").getWorldPosition(new THREE.Vector3());
      P.orbit.target.copy(hips); P.orbit.target.y = Math.max(.4, hips.y);
      P.orbit.pan.set(0, 0, 0); Object.assign(P.orbit, { yaw: .55, pitch: .12, dist: 2.5 });
      return { file: name, frames: 33, faceErrorM, minY, radiusM };
    }, file);
    assert.ok(result.faceErrorM < .0001, `${file} keeps the lower face attached to Head`);
    assert.ok(result.minY > -.01, `${file} ground contact ${result.minY}`);
    assert.ok(result.radiusM < 1.35, `${file} stays within the character's proportions`);
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await Capture(page, `Preview_ErYa_${file}.jpg`);
    results.push(result); console.log(`[ErYa] ${file} passed`);
  }
  const headTurns = await page.evaluate(async () => {
    const P = window.__preview, { mesh, head, face, THREE } = window.__erYaReview;
    await P.SelectFile("Animation_Mixamo_NeutralIdle_V1.glb");
    const action = P.action; action.paused = false; action.getMixer().setTime(0); action.paused = true;
    P.Place(); mesh.skeleton.update();
    const inverse = head.matrixWorld.clone().invert(), rotation = head.quaternion.clone();
    const Point = index => mesh.getVertexPosition(index, new THREE.Vector3()).applyMatrix4(mesh.matrixWorld);
    const samples = face.filter((_, index) => index % 7 === 0).map(index => [index, Point(index).applyMatrix4(inverse)]);
    let errorM = 0;
    for (const angle of [-45, -25, 25, 45]) {
      head.quaternion.copy(rotation).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), angle * Math.PI / 180));
      P.character.updateMatrixWorld(true); mesh.skeleton.update();
      for (const [index, rest] of samples) errorM = Math.max(errorM, Point(index).distanceTo(rest.clone().applyMatrix4(head.matrixWorld)));
    }
    head.quaternion.copy(rotation); P.Place(); mesh.skeleton.update();
    return { errorM, samples: samples.length };
  });
  assert.ok(headTurns.errorM < .0001);
  await page.evaluate(() => {
    const P = window.__preview, { head, THREE } = window.__erYaReview;
    P.orbit.target.copy(head.getWorldPosition(new THREE.Vector3())); P.orbit.target.y += .035;
    P.orbit.pan.set(0, 0, 0); Object.assign(P.orbit, { yaw: .4, pitch: .03, dist: .75 });
  });
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await Capture(page, "Preview_ErYa_Face.jpg");

  await page.goto(`${origin}/Taierzhuang1938/?editor=blockout&level=FirstLevel1218&kf=12-7&scale=small&audio=0&manual=1&quality=high`,
    { waitUntil: "load", timeout: 300000 });
  await page.waitForFunction(() => window.Tengxian?.Debug?.Blockout?.State?.().ready, null, { timeout: 300000 });
  await page.waitForFunction(() => {
    const T = window.Tengxian; T.StepFrames(2, 1 / 60, false);
    let ready = false;
    T.scene.traverse(object => { if (object.userData?.xbotSkin?.shownValid && object.userData.xbotSkin.kit.key === "erya") ready = true; });
    return ready;
  }, null, { timeout: 180000 });
  async function GameInfo() {
    return page.evaluate(() => {
      const T = window.Tengxian, skins = [], V = T.camera.position.constructor;
      T.StepFrames(30, 1 / 60, true);
      T.scene.traverse(object => { if (object.userData?.xbotSkin?.shownValid && object.userData.xbotSkin.kit.key === "erya") skins.push(object.userData.xbotSkin); });
      const skin = skins[0];
      if (!skin) throw new Error("Er Ya runtime skin missing");
      const head = skin.H("Head").getWorldPosition(new V()), hips = skin.H("Hips").getWorldPosition(new V());
      const forward = new V(0, 0, 1).applyQuaternion(skin.container.getWorldQuaternion(T.camera.quaternion.clone())).setY(0).normalize();
      const right = new V().crossVectors(forward, new V(0, 1, 0)).normalize();
      const focus = hips.clone().lerp(head, .55);
      const eye = focus.clone().addScaledVector(forward, 1.5).addScaledVector(right, .4).add(new V(0, .35, 0));
      const direction = focus.clone().sub(eye).normalize();
      const playing = T.Debug.Blockout.Play.Scene().variant === "play";
      const view = { x: eye.x, y: eye.y, z: eye.z, yawDeg: Math.atan2(-direction.x, -direction.z) * 180 / Math.PI,
        pitchDeg: Math.asin(direction.y) * 180 / Math.PI };
      if (playing) {
        T.Debug.Blockout.PlacePlayer({ ...view, stance: "stand" });
        T.StepFrames(2, 1 / 60, false);
        const aim = focus.clone().sub(T.camera.position).normalize();
        T.player.yaw = Math.atan2(-aim.x, -aim.z); T.player.pitch = Math.asin(aim.y);
      } else {
        T.Debug.Blockout.Fly(true, view);
      }
      T.StepFrames(8, 1 / 60, true);
      const projected = focus.clone().project(T.camera);
      return { kit: skin.kit.key, heightM: skin.actor.height, scale: skin.container.getWorldScale(new V()).toArray(),
        clip: skin.current?.file, cameraDistanceM: T.camera.position.distanceTo(focus),
        actorId: T.Debug.Blockout.Units().find(unit => unit.id === "Girl")?.id,
        glError: T.renderer.getContext().getError(),
        shaderProgramsLinked: T.renderer.info.programs.every(program => T.renderer.getContext().getProgramParameter(program.program, T.renderer.getContext().LINK_STATUS)),
        screen: projected.toArray(), probe: skin.Probe() };
    });
  }
  const editor = await GameInfo();
  assert.ok(Math.abs(editor.heightM - 1.30) < .00001);
  assert.ok(editor.scale.every(value => Math.abs(value - 1) < .0001));
  assert.equal(editor.actorId, "Girl");
  assert.equal(editor.glError, 0);
  assert.ok(editor.shaderProgramsLinked);
  await Capture(page, "Preview_ErYa_Editor.jpg");
  await page.evaluate(() => window.Tengxian.Debug.Blockout.Play.Start({ from: "12-7", to: "13-1",
    settings: { invincible: true, infiniteAmmo: true, previz: false } }));
  await page.waitForFunction(() => window.Tengxian.Debug.Blockout.Play.Scene().variant === "play"
    && document.body.classList.contains("blockoutPlay"), null, { timeout: 180000 });
  const play = await GameInfo();
  assert.equal(play.kit, "erya");
  assert.ok(Math.abs(play.heightM - 1.30) < .00001);
  assert.equal(play.actorId, "Girl");
  assert.equal(play.glError, 0);
  assert.ok(play.shaderProgramsLinked);
  assert.ok(play.cameraDistanceM < 3);
  assert.ok(Math.abs(play.screen[0]) < .5 && Math.abs(play.screen[1]) < .5);
  await Capture(page, "Preview_ErYa_Play.jpg");
  fs.writeFileSync(path.join(output, "Data_ErYaBrowserValidation.json"), JSON.stringify({ info, results, headTurns, editor, play, failures, resourceFailures, optionalResources }, null, 2));
  assert.deepEqual(failures, []);
  assert.deepEqual(resourceFailures, []);
  console.log("ErYaCharacterBrowserTest passed");
} finally {
  await browser.close(); await new Promise(resolve => server.close(resolve));
}
