// Check the weathered child through the normal encounter Play entry point.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { LaunchBrowser } from "../PrairieFire1937/Script_BrowserTestKit.mjs";
import { ServeRoot } from "./Script_DevServer.mjs";
import { DEFAULT_ENCOUNTER_DOCUMENT, BeatById } from "./Scenes/FirstLevelEncounter/Script_LevelFlowModel.mjs";

const root = path.resolve(import.meta.dirname, "..");
const custom = process.argv.find(arg => arg.startsWith("--url="))?.slice(6);
const server = custom ? null : await ServeRoot(root, 0);
const origin = custom || `http://127.0.0.1:${server.address().port}`;
const expected = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, "Model/Character/Data_Nier.json"), "utf8"));
const output = path.join(root, "tmp", "NierDirty", custom ? "Online" : "Encounter");
fs.mkdirSync(output, { recursive: true });
const browser = await LaunchBrowser({ extraArgs: ["--mute-audio"] });
const errors = [];
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  page.on("pageerror", error => errors.push(String(error)));
  page.on("console", message => {
    if (message.type() === "error" && /THREE\.WebGL|Shader Error|INVALID_OPERATION/.test(message.text())) errors.push(message.text());
  });
  const payload = { document: DEFAULT_ENCOUNTER_DOCUMENT, time: BeatById("08g").start, token: "NierDirtyReview" };
  await page.addInitScript(payload => {
    localStorage.setItem("tengxian1938_audio_v1", JSON.stringify({ master: 0 }));
    localStorage.setItem("tengxian1938_tools_volume_v1", JSON.stringify({ volume: 0, muted: true }));
    sessionStorage.setItem("tengxian1938_encounter_play_session_v1", JSON.stringify(payload));
  }, payload);
  await page.goto(`${origin}/Taierzhuang1938/?encounterPlay=1&manual=1&quality=high&audio=0`, { waitUntil: "load", timeout: 180000 });
  await page.waitForFunction(() => window.Tengxian?.Debug?.EncounterPlay?.State?.().ready, null, { timeout: 300000 });
  await page.locator("#bootStart").click();
  await page.locator("#boot").waitFor({ state: "hidden", timeout: 30000 });
  await page.evaluate(payload => window.Tengxian.Debug.EncounterPlay.Begin(payload), payload);
  // Let the authored child route leave the cart before the close-up inspection.
  await page.evaluate(() => {
    window.Tengxian.player.SetDebugOptions({ invincible: true });
    window.Tengxian.StepFrames(450, 1 / 30, false);
  });
  const result = await page.evaluate(async () => {
    const T = window.Tengxian;
    T.player.SetDebugOptions({ invincible: true, noCollision: true });
    T.StepFrames(4, 1 / 60, false);
    T.scene.updateMatrixWorld(true);
    let skin;
    T.scene.traverse(object => { if (object.userData?.xbotSkin?.kit.key === "nier") skin = object.userData.xbotSkin; });
    if (!skin) throw new Error("Normal encounter Play has no Nier skin");
    const mesh = skin.model.getObjectByProperty("isSkinnedMesh", true);
    const THREE = await import("three"), V = THREE.Vector3;
    mesh.skeleton.update();
    const bounds = new THREE.Box3(), point = new V();
    for (let index = 0; index < mesh.geometry.attributes.position.count; index += 8) {
      bounds.expandByPoint(mesh.getVertexPosition(index, point).applyMatrix4(mesh.matrixWorld));
    }
    const focus = bounds.getCenter(new V());
    if (T.viewmodel.root) T.viewmodel.root.visible = false;
    if (T.viewmodel.body?.root) T.viewmodel.body.root.visible = false;
    const ray = new THREE.Raycaster();
    let eye, clearViewRays = -1;
    for (let angle = 0; angle < 8; angle++) {
      const candidate = focus.clone().add(new V(Math.sin(angle * Math.PI / 4) * 2.4, 0, Math.cos(angle * Math.PI / 4) * 2.4));
      candidate.y = bounds.max.y + .25;
      let clear = 0;
      for (const y of [bounds.min.y + .1, focus.y, bounds.max.y - .1]) {
        const target = new V(focus.x, y, focus.z), delta = target.clone().sub(candidate);
        ray.set(candidate, delta.clone().normalize()); ray.far = delta.length() - .05;
        const blocked = ray.intersectObjects(T.scene.children, true).some(hit => {
          for (let object = hit.object; object; object = object.parent) {
            if (!object.visible || object === skin.container) return false;
          }
          return !hit.object.material?.transparent;
        });
        if (!blocked) clear++;
      }
      if (clear > clearViewRays) { eye = candidate; clearViewRays = clear; }
      if (clear === 3) break;
    }
    const direction = focus.clone().sub(eye).normalize();
    T.player.position.copy(eye).add(new V(0, -T.player.eyeHeight, 0));
    T.player.body.Teleport(...T.player.position.toArray());
    T.player.yaw = Math.atan2(-direction.x, -direction.z); T.player.pitch = Math.asin(direction.y);
    T.player.SyncCamera(0); T.post.NotifyCameraCut(); T.StepFrames(10, 1 / 60, true);
    const gl = T.renderer.getContext();
    const limit = gl.getParameter(gl.MAX_TEXTURE_IMAGE_UNITS);
    const linked = T.renderer.info.programs.every(program => gl.getProgramParameter(program.program, gl.LINK_STATUS));
    return { state: T.Debug.EncounterPlay.State().beat,
      presentation: T.Debug.EncounterPlay.Presentation().find(actor => actor.id === "nier"),
      vertices: mesh.geometry.attributes.position.count, triangles: mesh.geometry.index.count / 3,
      bones: mesh.skeleton.bones.length, actorHeightM: skin.actor.height,
      worldScale: skin.container.getWorldScale(new V()).toArray(), material: mesh.material.name,
      physicalMaterial: mesh.material.isMeshPhysicalMaterial, specularIntensity: mesh.material.specularIntensity,
      roughness: mesh.material.roughness, roughnessMap: !!mesh.material.roughnessMap, normalMap: !!mesh.material.normalMap,
      hair: skin.hair?.asset.id, shown: skin.shownValid, programsLinked: linked, textureUnitLimit: limit,
      glError: gl.getError(), quality: T.graphics.profile, clearViewRays, camera: T.camera.position.toArray(),
      characterBounds: { min: bounds.min.toArray(), max: bounds.max.toArray() } };
  });
  assert.ok(result.presentation?.humans.includes("nier"));
  assert.equal(result.vertices, expected.vertices);
  assert.equal(result.triangles, expected.triangles);
  assert.equal(result.bones, 65);
  assert.ok(Math.abs(result.actorHeightM - expected.crownM) < 1e-5);
  assert.ok(result.worldScale.every(value => Math.abs(value - 1) < 1e-4));
  assert.equal(result.physicalMaterial, true);
  assert.equal(result.specularIntensity, .5);
  assert.equal(result.roughness, 1);
  assert.ok(result.roughnessMap && result.normalMap && result.shown && result.programsLinked);
  assert.equal(result.glError, 0);
  assert.equal(result.quality, "high");
  assert.equal(result.clearViewRays, 3, "Face, torso and feet have an unobstructed inspection view");
  await sharp(await page.screenshot()).resize({ width: 640, height: 640, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 84 }).toFile(path.join(output, "Preview_NierDirtyPlay.jpg"));
  fs.writeFileSync(path.join(output, "Data_NierDirtyPlay.json"), `${JSON.stringify({ result, errors }, null, 2)}\n`);
  assert.deepEqual(errors, []);
  console.log("NierEncounterBrowserTest ok", JSON.stringify(result));
} finally {
  await browser.close();
  if (server) await new Promise(resolve => server.close(resolve));
}
