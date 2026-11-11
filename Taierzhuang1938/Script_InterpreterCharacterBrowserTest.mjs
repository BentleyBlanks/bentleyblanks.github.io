// Exercise the bound interpreter through the shared preview and scene player.
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
const output = path.join(root, "tmp", custom?.includes("github.io") ? "InterpreterOnline" : "Interpreter");
fs.mkdirSync(output, { recursive: true });
const browser = await LaunchBrowser({ extraArgs: ["--mute-audio"] });
const errors = [], resourceFailures = [], results = [];
const clips = [
  "Animation_Mixamo_NeutralIdle_V1.glb", "Animation_Mixamo_Talking_V2.glb",
  "Animation_Mixamo_PointingForward_V1.glb", "Animation_Mixamo_LookingAround_V2.glb",
  "Animation_Mixamo_Walking_V21.glb", "Animation_Mixamo_UnarmedRunForward_V1.glb",
  "Derived/Animation_XBot_InterpreterCrouchAsk.glb", "Derived/Animation_XBot_InterpreterGrabCollar.glb",
  "Derived/Animation_XBot_InterpreterFlee.glb", "Derived/Animation_XBot_InterpreterShotStagger.glb",
];

async function Capture(page, name) {
  await sharp(await page.screenshot()).resize({ width: 640, height: 640, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 83 }).toFile(path.join(output, name));
}

try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  const optionalCapabilities = new Set(["/__environment/status", "/__blockout/status"]);
  page.on("pageerror", error => errors.push(String(error)));
  page.on("console", message => {
    if (message.type() !== "error") return;
    const url = message.location()?.url || "";
    if (url && /404/.test(message.text()) && optionalCapabilities.has(new URL(url).pathname)) return;
    errors.push(`${message.text()} @ ${url}`);
  });
  page.on("response", response => {
    if (response.status() >= 400 && !optionalCapabilities.has(new URL(response.url()).pathname)) {
      resourceFailures.push({ url: response.url(), status: response.status() });
    }
  });
  await page.addInitScript(() => {
    localStorage.setItem("tengxian1938_audio_v1", JSON.stringify({ master: 0 }));
    localStorage.setItem("tengxian1938_tools_volume_v1", JSON.stringify({ volume: 0, muted: true }));
  });
  await page.goto(`${origin}/Taierzhuang1938/Tool_MixamoAnimationPreview.html?who=interpreter`, { waitUntil: "load", timeout: 180000 });
  await page.waitForFunction(() => window.__preview?.action && window.__preview?.hair?.asset.id === "Game_Interpreter" && document.querySelector("#who")?.value === "interpreter", null, { timeout: 180000 });
  const info = await page.evaluate(() => {
    const P = window.__preview, mesh = P.character.getObjectByProperty("isSkinnedMesh", true);
    const head = mesh.skeleton.getBoneByName("Head"), headIndex = mesh.skeleton.bones.indexOf(head);
    const weights = mesh.geometry.attributes.skinWeight, joints = mesh.geometry.attributes.skinIndex;
    const rigid = [];
    for (let i = 0; i < weights.count; i++) {
      let weight = 0;
      for (let k = 0; k < 4; k++) if (joints.getComponent(i, k) === headIndex) weight += weights.getComponent(i, k);
      if (weight > .99999) rigid.push(i);
    }
    window.__interpreter = { mesh, head, rigid };
    document.querySelector("#edRoot").style.display = "none";
    document.querySelector("#follow").checked = false;
    return { material: mesh.material.name, bones: mesh.skeleton.bones.length, vertices: weights.count,
      rigidHeadVertices: rigid.length, hair: Boolean(P.hair) };
  });
  assert.match(info.material, /Interpreter/);
  assert.equal(info.bones, 65);
  // XBotCharactersTest checks every upper-head vertex. Follow the fully rigid
  // subset here without imposing another character's tessellation density.
  assert.ok(info.rigidHeadVertices > 0);
  assert.equal(info.hair, true, "the bald source model receives the interpreter's short-hair groom");

  for (const file of clips) {
    const result = await page.evaluate(async file => {
      const P = window.__preview, { mesh, head, rigid } = window.__interpreter;
      const V = P.camera.position.constructor;
      await P.SelectFile(file);
      if (P.current.file !== file) throw new Error(`Clip selection failed for ${file}`);
      const action = P.action, mixer = action.getMixer(), duration = action.getClip().duration;
      const Pose = time => { action.paused = false; mixer.setTime(time); action.paused = true; P.Place(); mesh.skeleton.update(); };
      const Point = index => mesh.getVertexPosition(index, new V()).applyMatrix4(mesh.matrixWorld);
      Pose(0);
      const inverseHead = head.matrixWorld.clone().invert();
      const headSamples = rigid.filter((_, index) => index % 8 === 0).map(index => [index, Point(index).applyMatrix4(inverseHead)]);
      const limbs = mesh.skeleton.bones.filter(bone => /^(Left|Right)(Arm|ForeArm|Hand|UpLeg|Leg|Foot)$/.test(bone.name));
      const lengths = limbs.map(bone => bone.position.length());
      let maxHeadError = 0, maxBoneLengthError = 0, maxRadius = 0, minY = Infinity;
      for (let frame = 0; frame <= 40; frame++) {
        Pose(Math.min(duration - .00001, duration * frame / 40));
        limbs.forEach((bone, index) => { maxBoneLengthError = Math.max(maxBoneLengthError, Math.abs(bone.position.length() - lengths[index])); });
        for (const [index, rest] of headSamples) maxHeadError = Math.max(maxHeadError, Point(index).distanceTo(rest.clone().applyMatrix4(head.matrixWorld)));
        const hips = P.character.getObjectByName("Hips").getWorldPosition(new V());
        for (let index = 0; index < mesh.geometry.attributes.position.count; index += frame % 20 === 0 ? 1 : 32) {
          const point = Point(index);
          if (![point.x, point.y, point.z].every(Number.isFinite)) throw new Error(`${file}: nonfinite skin`);
          maxRadius = Math.max(maxRadius, point.distanceTo(hips));
          minY = Math.min(minY, point.y);
        }
      }
      Pose(duration * .5);
      const hips = P.character.getObjectByName("Hips").getWorldPosition(new V());
      P.orbit.target.copy(hips); P.orbit.target.y = Math.max(.55, hips.y); P.orbit.pan.set(0, 0, 0);
      Object.assign(P.orbit, { yaw: .55, pitch: .12, dist: 3.6 });
      return { file, frames: 41, maxHeadError, maxBoneLengthError, maxRadius, minY };
    }, file);
    assert.ok(result.maxHeadError < .00001, `${file}: head follows Head`);
    assert.ok(result.maxBoneLengthError < .00001, `${file}: limb lengths retain the bound proportions`);
    assert.ok(result.maxRadius < 1.8, `${file}: skin remains near its skeleton`);
    if (file.includes("InterpreterFlee") || file.includes("InterpreterShotStagger")) {
      assert.ok(result.minY > -.005, `${file}: corrected soles stay above the preview floor`);
    }
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await Capture(page, path.basename(file).replace(/\.glb$/, ".jpg"));
    results.push(result);
    console.log(`[Interpreter] ${file}: ${result.frames} frames`);
  }
  await page.evaluate(async () => {
    const P = window.__preview;
    await P.SelectFile("Animation_Mixamo_NeutralIdle_V1.glb");
    P.action.paused = true; P.Place();
  });
  for (const side of ["Left", "Right"]) {
    await page.evaluate(side => {
      const P = window.__preview, V = P.camera.position.constructor;
      P.orbit.target.copy(P.character.getObjectByName(`${side}Hand`).getWorldPosition(new V()));
      P.orbit.pan.set(0, 0, 0);
      Object.assign(P.orbit, { yaw: side === "Left" ? .9 : -.9, pitch: .15, dist: .65 });
    }, side);
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await Capture(page, `Wrist_${side}.jpg`);
  }

  await page.goto(`${origin}/Taierzhuang1938/?editor=blockout&level=FirstLevel0107&kf=02-1&scale=small&manual=1&quality=high`, { waitUntil: "load", timeout: 300000 });
  await page.waitForFunction(() => window.Tengxian?.Debug?.Blockout?.State?.().ready, null, { timeout: 300000 });
  await page.waitForFunction(() => {
    const T = window.Tengxian;
    T.StepFrames(2, 1 / 60, false);
    let ready = false;
    T.scene.traverse(object => { if (object.userData?.xbotSkin?.shownValid && object.userData.xbotSkin.kit.key === "interpreter") ready = true; });
    return ready;
  }, null, { timeout: 180000 });
  const game = await page.evaluate(() => {
    const T = window.Tengxian, skins = [], V = T.camera.position.constructor;
    T.scene.traverse(object => { const skin = object.userData?.xbotSkin; if (skin?.shownValid && skin.kit.key === "interpreter") skins.push(skin); });
    T.StepFrames(12, 1 / 60, true);
    const skin = skins[0], hip = skin.H("Hips").getWorldPosition(new V()), head = skin.H("Head").getWorldPosition(new V());
    const forward = new V(0, 0, 1).applyQuaternion(skin.container.getWorldQuaternion(T.camera.quaternion.clone())).setY(0).normalize();
    const focus = hip.clone().lerp(head, .6), eye = focus.clone().addScaledVector(forward, 1.5).add(new V(.4, .2, 0));
    const direction = focus.clone().sub(eye).normalize();
    T.Debug.Blockout.Fly(true, { x: eye.x, y: eye.y, z: eye.z, yawDeg: Math.atan2(-direction.x, -direction.z) * 180 / Math.PI, pitchDeg: Math.asin(direction.y) * 180 / Math.PI });
    T.StepFrames(8, 1 / 60, true);
    return { count: skins.length, kit: skin.kit.key, actorHeightM: skin.actor.height,
      scale: skin.container.getWorldScale(new V()).toArray(), probe: skin.Probe() };
  });
  assert.equal(game.kit, "interpreter");
  assert.ok(Math.abs(game.actorHeightM - XBOT_CHARACTERS.interpreter.heightM) < .00001);
  assert.ok(game.scale.every(value => Math.abs(value - 1) < .0001));
  await Capture(page, "Scene_Interpreter.jpg");
  await page.evaluate(() => window.Tengxian.Debug.Blockout.Play.Start({
    from: "02-1", to: "02-1", settings: { invincible: true, infiniteAmmo: false, previz: false },
  }));
  await page.waitForFunction(() => {
    const T = window.Tengxian;
    T.StepFrames(2, 1 / 60, false);
    return document.body.classList.contains("blockoutPlay") && T.Debug.Blockout.Play.State().run?.step === "02-1";
  }, null, { timeout: 180000 });
  const play = await page.evaluate(() => {
    const T = window.Tengxian, skins = [];
    T.StepFrames(30, 1 / 60, true);
    T.scene.traverse(object => { const skin = object.userData?.xbotSkin; if (skin?.shownValid && skin.kit.key === "interpreter") skins.push(skin.Probe()); });
    return { scene: T.Debug.Blockout.Play.Scene(), skins };
  });
  assert.ok(play.skins.length > 0, "the existing interpreter unit renders during scene play");
  assert.equal(play.scene.style, "whitebox", "FirstLevel0107 uses its registered whitebox scene during play");
  await Capture(page, "Play_Interpreter.jpg");
  fs.writeFileSync(path.join(output, "Data_BrowserReview.json"), `${JSON.stringify({ info, results, game, play, errors, resourceFailures }, null, 2)}\n`);
  assert.deepEqual(errors, []);
  assert.deepEqual(resourceFailures, []);
  console.log("InterpreterCharacterBrowserTest ok", JSON.stringify({ info, clips: results.length, game }));
} finally {
  await browser.close();
  if (server) await new Promise(resolve => server.close(resolve));
}
