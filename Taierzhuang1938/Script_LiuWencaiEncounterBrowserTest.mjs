import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { LaunchBrowser } from "../PrairieFire1937/Script_BrowserTestKit.mjs";
import { ServeRoot } from "./Script_DevServer.mjs";
import { DEFAULT_ENCOUNTER_DOCUMENT } from "./Scenes/FirstLevelEncounter/Script_LevelFlowModel.mjs";

const root = path.resolve(import.meta.dirname, "..");
const custom = process.argv.find(arg => arg.startsWith("--url="))?.slice(6);
const server = custom ? null : await ServeRoot(root, 0);
const origin = custom || `http://127.0.0.1:${server.address().port}`;
const expected = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, "Model/Character/Data_LiuWencai.json"), "utf8"));
const output = path.join(root, "tmp", custom ? "LiuWencaiDirtyOnline" : "LiuWencaiDirtyEncounter");
fs.mkdirSync(output, { recursive: true });
const browser = await LaunchBrowser({ extraArgs: ["--mute-audio"] });
const errors = [];
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  page.on("pageerror", error => errors.push(String(error)));
  page.on("console", message => {
    if (message.type() === "error" && /THREE\.WebGL|Shader Error|INVALID_OPERATION/.test(message.text())) errors.push(message.text());
  });
  const payload = { variantId: "L1_Original", document: DEFAULT_ENCOUNTER_DOCUMENT, time: 222, token: "LiuWencaiDirtyReview" };
  await page.addInitScript(payload => {
    localStorage.setItem("tengxian1938_audio_v1", JSON.stringify({ master: 0 }));
    localStorage.setItem("tengxian1938_tools_volume_v1", JSON.stringify({ volume: 0, muted: true }));
    sessionStorage.setItem("tengxian1938_encounter_play_session_v1", JSON.stringify(payload));
  }, payload);
  await page.goto(`${origin}/Taierzhuang1938/?encounterPlay=1&manual=1&quality=high&audio=0`, { waitUntil: "load", timeout: 180000 });
  await page.waitForFunction(() => window.Tengxian?.Debug?.EncounterPlay?.State?.().ready, null, { timeout: custom ? 600000 : 300000 });
  await page.locator("#bootStart").click();
  await page.locator("#boot").waitFor({ state: "hidden", timeout: 30000 });
  await page.evaluate(payload => window.Tengxian.Debug.EncounterPlay.Begin(payload), payload);
  const result = await page.evaluate(() => {
    const T = window.Tengxian, state = T.Debug.EncounterPlay.State();
    T.player.SetDebugOptions({ invincible: true });
    T.StepFrames(2, 1 / 60, false);
    const actor = state.actors.find(actor => actor.id === "liu");
    const soldier = T.ai.soldiers.find(soldier => soldier.id === actor?.soldierId);
    const skin = T.ai.view.skins.get(soldier);
    const meshes = [];
    let characterMesh;
    (skin?.model || T.scene).traverse(object => {
      const material = object.material;
      if (object.isSkinnedMesh && !Array.isArray(material) && material?.name.includes("LiuWencai")) {
        meshes.push({ material: material.name, bones: object.skeleton.bones.length,
          vertices: object.geometry.attributes.position.count, triangles: object.geometry.index.count / 3 });
        characterMesh = object;
      }
    });
    if (!actor || !characterMesh) throw new Error(`The normal Play scene has no Liu Wencai mesh ${JSON.stringify({actor,meshes,skinKeys:skin&&Object.keys(skin)})}`);
    const V = T.camera.position.constructor;
    const head = characterMesh.skeleton.getBoneByName("Head").getWorldPosition(new V());
    const hip = characterMesh.skeleton.getBoneByName("Hips").getWorldPosition(new V());
    const forward = new V(-Math.sin(soldier.yaw), 0, -Math.cos(soldier.yaw));
    const eye = head.clone().addScaledVector(forward, 2.7); eye.y += .1;
    const focus = hip.clone().lerp(head, .75), direction = focus.sub(eye).normalize();
    T.player.position.set(eye.x, eye.y - T.player.eyeHeight, eye.z);
    T.player.body.Teleport(...T.player.position.toArray());
    T.player.yaw = Math.atan2(-direction.x, -direction.z);
    T.player.pitch = Math.asin(direction.y);
    if (T.viewmodel.root) T.viewmodel.root.visible = false;
    T.player.SyncCamera(0);
    T.post.NotifyCameraCut();
    T.StepFrames(8, 1 / 60, true);
    // The detail culler attaches the visible actor after the player camera moves.
    let attached = false;
    for (let parent = skin.container; parent; parent = parent.parent) if (parent === T.scene) attached = true;
    if (!attached) throw new Error("The nearby visible Liu Wencai model was culled");
    return { actor, meshes, beat: state.beat, ready: state.ready, quality: T.graphics.profile,
      camera: T.camera.position.toArray(), modelKey: actor.model };
  });
  assert.equal(result.actor.model, "liuWencai");
  assert.equal(result.modelKey, "liuWencai");
  assert.ok(result.meshes.some(mesh => mesh.bones === 65 && mesh.vertices === expected.vertices && mesh.triangles === expected.triangles));
  assert.equal(result.quality, "high");
  assert.equal(result.ready, true);
  await sharp(await page.screenshot()).resize({ width: 640, height: 640, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 84 }).toFile(path.join(output, "Preview_LiuWencaiDirtyPlay.jpg"));
  fs.writeFileSync(path.join(output, "Data_LiuWencaiDirtyPlay.json"), `${JSON.stringify({ result, errors }, null, 2)}\n`);
  assert.deepEqual(errors, []);
  console.log("LiuWencaiEncounterBrowserTest ok", JSON.stringify(result));
} finally {
  await browser.close();
  if (server) await new Promise(resolve => server.close(resolve));
}
