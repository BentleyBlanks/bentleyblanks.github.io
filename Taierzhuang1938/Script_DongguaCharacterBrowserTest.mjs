// Review Donggua through the shared animation preview and the actual scene cast.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { LaunchBrowser } from "../PrairieFire1937/Script_BrowserTestKit.mjs";
import { ServeRoot } from "./Script_DevServer.mjs";

const root = path.resolve(import.meta.dirname, "..");
const custom = process.argv.find(arg => arg.startsWith("--url="))?.slice(6);
const server = custom ? null : await ServeRoot(root, 0);
const origin = custom || `http://127.0.0.1:${server.address().port}`;
const output = path.join(root, "tmp", custom?.includes("github.io") ? "DongguaOnline" : "Donggua");
fs.mkdirSync(output, { recursive: true });
const browser = await LaunchBrowser({ extraArgs: ["--mute-audio"] });
const errors = [], results = [];
const clips = [
  "Animation_Mixamo_Idle_V1.glb", "Animation_Mixamo_RifleAimingIdle_V1.glb",
  "Animation_Mixamo_WalkWithRifle_V3.glb", "Animation_Mixamo_RifleRun_V2.glb",
  "Animation_Mixamo_IdleCrouchingAiming_V1.glb", "Animation_Mixamo_ProneFiringRifle_V2.glb",
  "Animation_Mixamo_Dying_V3.glb", "Animation_Mixamo_SittingIdle_V2.glb",
];
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  page.on("pageerror", error => errors.push(String(error)));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  await page.addInitScript(() => {
    localStorage.setItem("tengxian1938_audio_v1", JSON.stringify({ master: 0 }));
    localStorage.setItem("tengxian1938_tools_volume_v1", JSON.stringify({ volume: 0, muted: true }));
  });
  await page.goto(`${origin}/Taierzhuang1938/Tool_MixamoAnimationPreview.html?who=donggua`, { waitUntil: "load", timeout: 180000 });
  await page.waitForFunction(() => window.__preview?.action && document.querySelector("#who")?.value === "donggua", null, { timeout: 180000 });
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
    window.__donggua = { mesh, head, rigid };
    document.querySelector("#edRoot").style.display = "none";
    document.querySelector("#follow").checked = false;
    return { material: mesh.material.name, bones: mesh.skeleton.bones.length, vertices: weights.count, rigidHeadVertices: rigid.length };
  });
  assert.match(info.material, /Donggua/);
  assert.equal(info.bones, 65);
  // The native skin blends the lower face into Neck. The shared static test
  // verifies that every upper-head vertex has full Head influence.
  assert.ok(info.rigidHeadVertices > 1000);
  for (const file of clips) {
    const result = await page.evaluate(async file => {
      const P = window.__preview, { mesh, head, rigid } = window.__donggua;
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
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await page.screenshot({ path: path.join(output, file.replace(/\.glb$/, ".png")) });
    results.push(result);
    console.log(`[Donggua] ${file}: ${result.frames} frames`);
  }
  await page.goto(`${origin}/Taierzhuang1938/?editor=blockout&level=FirstLevel0105&kf=01-1&scale=small&audio=0&manual=1&quality=high`, { waitUntil: "load", timeout: 300000 });
  await page.waitForFunction(() => window.Tengxian?.Debug?.Blockout?.State?.().ready, null, { timeout: 300000 });
  await page.waitForFunction(() => {
    const T = window.Tengxian;
    T.StepFrames(2, 1 / 60, false);
    let ready = false;
    T.scene.traverse(object => { if (object.userData?.xbotSkin?.shownValid && object.userData.xbotSkin.kit.key === "donggua") ready = true; });
    return ready;
  }, null, { timeout: 180000 });
  const game = await page.evaluate(() => {
    const T = window.Tengxian, skins = [];
    T.scene.traverse(object => { const skin = object.userData?.xbotSkin; if (skin?.shownValid && skin.kit.key === "donggua") skins.push(skin); });
    const skin = skins[0], V = T.camera.position.constructor;
    const hip = skin.H("Hips").getWorldPosition(new V()), head = skin.H("Head").getWorldPosition(new V());
    const focus = hip.clone().lerp(head, .45), eye = focus.clone().add(new V(1.6, .8, 1.6));
    const direction = focus.clone().sub(eye).normalize();
    T.Debug.Blockout.Fly(true, { x: eye.x, y: eye.y, z: eye.z, yawDeg: Math.atan2(-direction.x, -direction.z) * 180 / Math.PI, pitchDeg: Math.asin(direction.y) * 180 / Math.PI });
    T.StepFrames(8, 1 / 60, true);
    return { count: skins.length, kit: skin.kit.key, clip: skin.current?.file, probe: skin.Probe() };
  });
  assert.ok(game.count > 0);
  assert.equal(game.kit, "donggua");
  await page.screenshot({ path: path.join(output, "Scene_Donggua.png") });
  assert.deepEqual(errors, []);
  fs.writeFileSync(path.join(output, "Data_BrowserReview.json"), `${JSON.stringify({ info, results, game, errors }, null, 2)}\n`);
  console.log("DongguaCharacterBrowserTest ok", JSON.stringify({ info, clips: results.length, game }));
} finally {
  await browser.close();
  if (server) await new Promise(resolve => server.close(resolve));
}
