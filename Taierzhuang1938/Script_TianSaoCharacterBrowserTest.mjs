// Validate Tian Sao through the shared animation page and an isolated scene-cast fixture.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { LaunchBrowser } from "../PrairieFire1937/Script_BrowserTestKit.mjs";
import { ServeRoot } from "./Script_DevServer.mjs";

const root = path.resolve(import.meta.dirname, "..");
const custom = process.argv.find(argument => argument.startsWith("--url="))?.slice(6);
const server = custom ? null : await ServeRoot(root, 0);
const origin = custom || `http://127.0.0.1:${server.address().port}`;
const output = path.join(root, "tmp", "TianSaoIntegration", custom?.includes("github.io") ? "Online" : "Browser");
fs.mkdirSync(output, { recursive: true });
const browser = await LaunchBrowser({ extraArgs: ["--mute-audio"] });
const errors = [], results = [];
const clips = ["NeutralIdle_V1", "Walking_V21", "UnarmedRunForward_V1", "KneelingIdle_V1", "SittingIdle_V2", "LookingAround_V2"];
async function Capture(page, name) {
  await sharp(await page.screenshot()).resize({ width: 640, height: 640, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 84 }).toFile(path.join(output, name));
}
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  page.on("pageerror", error => errors.push(String(error)));
  await page.addInitScript(() => {
    localStorage.setItem("tengxian1938_audio_v1", JSON.stringify({ master: 0 }));
    localStorage.setItem("tengxian1938_tools_volume_v1", JSON.stringify({ volume: 0, muted: true }));
  });
  await page.goto(`${origin}/Taierzhuang1938/AdvancedTools/Tool_MixamoAnimationPreview.html?who=tianSao`, { waitUntil: "load", timeout: 180000 });
  await page.waitForFunction(() => window.__preview?.action && document.querySelector("#who")?.value === "tianSao", null, { timeout: 180000 });
  const info = await page.evaluate(async () => {
    const P = window.__preview;
    const report = await (await fetch("/Taierzhuang1938/Model/Character/Data_TianSao.json")).json();
    const mesh = P.character.getObjectByProperty("isSkinnedMesh", true);
    const head = mesh.skeleton.getBoneByName("Head");
    const uv = mesh.geometry.attributes.uv, position = mesh.geometry.attributes.position;
    const V = P.camera.position.constructor, face = [];
    for (let index = 0; index < position.count; index++) {
      const point = new V().fromBufferAttribute(position, index).applyMatrix4(mesh.matrixWorld);
      if (uv.getX(index) > .5 && uv.getY(index) > .5 && point.y >= report.faceSkin.rigidStartM + .00001) face.push(index);
    }
    window.__tianSao = { mesh, head, face };
    document.querySelector("#edRoot").style.display = "none";
    document.querySelector("#follow").checked = false;
    return { bones: mesh.skeleton.bones.length, material: mesh.material.name, hair: Boolean(P.hair), faceVertices: face.length };
  });
  assert.equal(info.bones, 65);
  assert.match(info.material, /TianSao/);
  assert.equal(info.hair, false);
  assert.ok(info.faceVertices > 2000);
  for (const name of clips) {
    const file = `Animation_Mixamo_${name}.glb`;
    const result = await page.evaluate(async file => {
      const P = window.__preview, { mesh, head, face } = window.__tianSao;
      const V = P.camera.position.constructor;
      await P.SelectFile(file);
      if (P.current.file !== file) throw new Error(`Missing preview clip ${file}`);
      const action = P.action, mixer = action.getMixer(), duration = action.getClip().duration;
      const Pose = time => { action.paused = false; mixer.setTime(time); action.paused = true; P.Place(); mesh.skeleton.update(); };
      const Point = index => mesh.getVertexPosition(index, new V()).applyMatrix4(mesh.matrixWorld);
      Pose(0);
      const inverseHead = head.matrixWorld.clone().invert();
      const samples = face.filter((_, index) => index % 10 === 0).map(index => [index, Point(index).applyMatrix4(inverseHead)]);
      let minY = Infinity, maxHeadError = 0, maxRadius = 0;
      for (let frame = 0; frame <= 20; frame++) {
        Pose(Math.min(duration - .00001, duration * frame / 20));
        const hips = P.character.getObjectByName("Hips").getWorldPosition(new V());
        for (const [index, rest] of samples) maxHeadError = Math.max(maxHeadError, Point(index).distanceTo(rest.clone().applyMatrix4(head.matrixWorld)));
        for (let index = 0; index < mesh.geometry.attributes.position.count; index += frame % 10 === 0 ? 1 : 40) {
          const point = Point(index);
          if (![point.x, point.y, point.z].every(Number.isFinite)) throw new Error("Nonfinite skin position");
          minY = Math.min(minY, point.y); maxRadius = Math.max(maxRadius, point.distanceTo(hips));
        }
      }
      Pose(duration * .5);
      const hips = P.character.getObjectByName("Hips").getWorldPosition(new V());
      P.orbit.target.copy(hips); P.orbit.target.y = Math.max(.55, hips.y);
      P.orbit.pan.set(0, 0, 0); Object.assign(P.orbit, { yaw: .6, pitch: .18, dist: 3.3 });
      return { file, frames: 21, minY, maxHeadError, maxRadius };
    }, file);
    results.push(result);
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await Capture(page, `${name}.jpg`);
    assert.ok(result.maxHeadError < .00002, `${name}: lower jaw follows the head`);
    assert.ok(result.maxRadius < 1.8, `${name}: skin remains near its skeleton`);
    assert.ok(result.minY >= -.0005, `${name}: shoes and body clear the floor (${result.minY})`);
    console.log("[TianSao]", JSON.stringify(result));
  }
  const turns = await page.evaluate(async () => {
    const P = window.__preview, { mesh, head, face } = window.__tianSao;
    await P.SelectFile("Animation_Mixamo_NeutralIdle_V1.glb");
    const action = P.action;
    action.paused = false; action.getMixer().setTime(0); action.paused = true; P.Place(); mesh.skeleton.update();
    const V = P.camera.position.constructor, Q = head.quaternion.constructor;
    const Point = index => mesh.getVertexPosition(index, new V()).applyMatrix4(mesh.matrixWorld);
    const inverse = head.matrixWorld.clone().invert(), rest = head.quaternion.clone();
    const samples = face.filter((_, index) => index % 10 === 0).map(index => [index, Point(index).applyMatrix4(inverse)]);
    let maximumError = 0;
    for (const angle of [-45, -25, 25, 45]) {
      head.quaternion.copy(rest).multiply(new Q().setFromAxisAngle(new V(0, 1, 0), angle * Math.PI / 180));
      P.character.updateMatrixWorld(true); mesh.skeleton.update();
      for (const [index, local] of samples) maximumError = Math.max(maximumError, Point(index).distanceTo(local.clone().applyMatrix4(head.matrixWorld)));
    }
    head.quaternion.copy(rest); P.Place(); mesh.skeleton.update();
    P.orbit.target.copy(head.getWorldPosition(new V())); P.orbit.target.y -= .08;
    P.orbit.pan.set(0, 0, 0); Object.assign(P.orbit, { yaw: .6, pitch: .2, dist: .9 });
    return { maximumError, samples: samples.length };
  });
  assert.ok(turns.maximumError < .00002);
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await Capture(page, "HeadNeck.jpg");
  await page.evaluate(() => {
    const P = window.__preview, { head } = window.__tianSao;
    const bones = [];
    P.character.traverse(object => { if (object.isBone) bones.push([object, object.position.clone(), object.quaternion.clone(), object.scale.clone()]); });
    P.action.stop();
    for (const [bone, position, rotation, scale] of bones) { bone.position.copy(position); bone.quaternion.copy(rotation); bone.scale.copy(scale); }
    window.__tianSao.headRest = head.quaternion.clone();
  });
  for (const angle of [-45, 45]) {
    await page.evaluate(angle => {
      const P = window.__preview, { mesh, head, headRest } = window.__tianSao;
      const V = P.camera.position.constructor, Q = head.quaternion.constructor;
      head.quaternion.copy(headRest).multiply(new Q().setFromAxisAngle(new V(0, 1, 0), angle * Math.PI / 180));
      P.Place(); mesh.skeleton.update();
    }, angle);
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await Capture(page, `HeadTurn_${angle}.jpg`);
  }

  // Only this isolated browser response receives the fixture actor. No scene file is saved.
  await page.route("**/Blockout/FirstLevel0610.json*", async route => {
    const response = await route.fetch(), doc = await response.json();
    for (const keyframe of doc.keyframes) keyframe.units.push({ id: "TianSao", name: "田嫂", castId: "tiansao",
      kind: "civilian", side: "civ", body: "rig", role: "civilian", x: 40.4, z: 145.5, yawDeg: 180 });
    await route.fulfill({ response, json: doc });
  });
  await page.goto(`${origin}/Taierzhuang1938/?editor=blockout&level=FirstLevel0610&kf=06-1&scale=small&manual=1&quality=high`, { waitUntil: "load", timeout: 300000 });
  await page.waitForFunction(() => window.Tengxian?.Debug?.Blockout?.State?.().ready, null, { timeout: 300000 });
  await page.waitForFunction(() => {
    const T = window.Tengxian; T.StepFrames(2, 1 / 60, false);
    let ready = false; T.scene.traverse(object => { if (object.userData?.xbotSkin?.shownValid && object.userData.xbotSkin.kit.key === "tianSao") ready = true; });
    return ready;
  }, null, { timeout: 180000 });
  const game = await page.evaluate(async () => {
    const T = window.Tengxian, skins = [], V = T.camera.position.constructor;
    T.scene.traverse(object => { const skin = object.userData?.xbotSkin; if (skin?.shownValid && skin.kit.key === "tianSao") skins.push(skin); });
    const skin = skins[0];
    const walkFile = "Animation_Mixamo_Walking_V21.glb";
    await skin.skins.Clip(walkFile);
    const moving = { mps: 1.3, stance: "stand", aim: false, down: false };
    skin.Sync(moving, 1 / 60);
    const beforeClock = skin.current.clock;
    for (let frame = 0; frame < 60; frame++) skin.Sync(moving, 1 / 60);
    const movementRate = skin.current.clock - beforeClock;
    const nominal = skin.pick.speedMps || skin.pick.travel;
    const expectedRate = Math.max(.4, Math.min(2.2, moving.mps / (nominal * skin.container.getWorldScale(new V()).x * skin.kit.def.hipsScale)));
    if (skin.current.file !== walkFile) throw new Error("Scene civilian did not select its unarmed walk");
    const head = skin.H("Head").getWorldPosition(new V()), hips = skin.H("Hips").getWorldPosition(new V());
    const forward = new V(0, 0, 1).applyQuaternion(skin.container.getWorldQuaternion(T.camera.quaternion.clone())).setY(0).normalize();
    const focus = hips.clone().lerp(head, .6), eye = focus.clone().addScaledVector(forward, 1.8).add(new V(.55, .3, 0));
    const direction = focus.clone().sub(eye).normalize();
    T.Debug.Blockout.Fly(true, { x: eye.x, y: eye.y, z: eye.z, yawDeg: Math.atan2(-direction.x, -direction.z) * 180 / Math.PI, pitchDeg: Math.asin(direction.y) * 180 / Math.PI });
    T.StepFrames(8, 1 / 60, true);
    return { kit: skin.kit.key, height: skin.actor.height, hair: Boolean(skin.hair), movementRate, expectedRate, probe: skin.Probe() };
  });
  assert.equal(game.kit, "tianSao"); assert.ok(Math.abs(game.height - 1.65) < .0001); assert.equal(game.hair, false);
  assert.ok(Math.abs(game.movementRate - game.expectedRate) < .0001);
  await Capture(page, "Scene_TianSao.jpg");
  await page.evaluate(() => window.Tengxian.Debug.Blockout.Play.Start({
    from: "06-1", to: "06-1", settings: { invincible: true, infiniteAmmo: false, previz: false },
  }));
  await page.waitForFunction(() => {
    const T = window.Tengxian; T.StepFrames(2, 1 / 60, false);
    return document.body.classList.contains("blockoutPlay") && T.Debug.Blockout.Play.State().run?.step === "06-1";
  }, null, { timeout: 180000 });
  const play = await page.evaluate(() => {
    const T = window.Tengxian, skins = [];
    T.StepFrames(30, 1 / 60, true);
    T.scene.traverse(object => { const skin = object.userData?.xbotSkin; if (skin?.shownValid && skin.kit.key === "tianSao") skins.push(skin.Probe()); });
    return { scene: T.Debug.Blockout.Play.Scene(), skins };
  });
  assert.ok(play.skins.length > 0, "田嫂的场景角色在试玩中保持正常显示");
  await Capture(page, "Play_TianSao.jpg");
  fs.writeFileSync(path.join(output, "Data_BrowserReview.json"), `${JSON.stringify({ info, results, turns, game, play, errors }, null, 2)}\n`);
  assert.deepEqual(errors, []);
  console.log("TianSaoCharacterBrowserTest ok", JSON.stringify({ info, turns, game }));
} finally {
  await browser.close();
  if (server) await new Promise(resolve => server.close(resolve));
}
