// Real action-editor proof for both Blender draft animals and the shared cart.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { LaunchBrowser } from "../PrairieFire1937/Script_BrowserTestKit.mjs";
import { ServeRoot } from "./Script_DevServer.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const shots = path.join(here, "_shots", "DraftCart");
await fs.mkdir(shots, { recursive: true });
const local = process.argv.includes("--local");
const server = local ? null : await ServeRoot(path.dirname(here), 0);
const port = local ? 8098 : server.address().port;
const browser = await LaunchBrowser();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on("pageerror", (error) => errors.push(String(error)));
page.on("console", (entry) => { if (entry.type() === "error") errors.push(entry.text()); });
try {
  await page.goto(`http://127.0.0.1:${port}/Taierzhuang1938/?whitebox=p012&menu=0&manual=1&quality=medium&scale=small`,
    { timeout: 180000 });
  await page.waitForFunction(() => window.Taierzhuang?.state?.ready, null, { timeout: 180000 });
  await page.click("#bootStart");
  const baseline = await page.evaluate(() => {
    const game = window.Taierzhuang;
    return { position: game.camera.position.toArray(), fov: game.camera.fov };
  });
  await page.evaluate(() => window.Taierzhuang.editor.Open("actor"));
  await page.locator(".edChip").filter({ hasText: /^牛马车$/ }).click();
  await page.waitForFunction(() => window.Taierzhuang.editor.active?.cartPreview?.parts?.deck,
    null, { timeout: 30000 });
  const before = await page.evaluate(() => {
    const editor = window.Taierzhuang.editor.active;
    return { mode: editor.previewMode, kind: editor.cartKind,
      // 肩关节藏在躯干里、幅度小；看得见的那根腿柱从肘（ElbowPivot）起摆。
      leg: editor.cartPreview.animalRoot.getObjectByName("OxFrontLeftElbowPivot").rotation.x,
      wheel: editor.cartPreview.cartRoot.getObjectByName("WheelLeft").rotation.x };
  });
  await page.evaluate(() => window.Taierzhuang.StepFrames(15));
  const after = await page.evaluate(() => {
    const editor = window.Taierzhuang.editor.active;
    let meshes = 0, skinned = 0;
    editor.cartPreview.root.traverse((object) => {
      if (object.isMesh) meshes += 1;
      if (object.isSkinnedMesh) skinned += 1;
    });
    return { leg: editor.cartPreview.animalRoot.getObjectByName("OxFrontLeftElbowPivot").rotation.x,
      wheel: editor.cartPreview.cartRoot.getObjectByName("WheelLeft").rotation.x,
      meshes, skinned, fact: editor.cartFacts.root.textContent };
  });
  assert.equal(before.mode, "cart");
  assert.equal(before.kind, "ox");
  // 2026-09-27 起车与牛各是一只按材质分图元的蒙皮网格（车 5 + 牛 5），原来是 59 个分件。
  assert.ok(after.meshes >= 9 && after.meshes <= 10,
    `the Blender cart and ox render as one skinned primitive per material: ${after.meshes}`);
  assert.equal(after.skinned, after.meshes, "every cart and ox primitive follows its pivot bones");
  assert.ok(Math.abs(after.leg-before.leg) > .05, "the ox gait really changes the leg pivot");
  assert.ok(Math.abs(after.wheel-before.wheel) > .1, "the cart wheel really rolls");
  assert.match(after.fact, /Blender Walk/);
  await page.screenshot({ path: path.join(shots, "Texture_OxCartEditor.png") });
  let previousCamera = await page.evaluate(() => window.Taierzhuang.camera.position.toArray());
  for (const [view, label] of [["side", "正侧"], ["front", "正面"], ["rear", "车后"]]) {
    await page.locator(".edChip").filter({ hasText: new RegExp(`^${label}$`) }).click();
    await page.evaluate(() => window.Taierzhuang.StepFrames(12));
    assert.equal(await page.evaluate(() => window.Taierzhuang.editor.active.cartView), view);
    const camera = await page.evaluate(() => window.Taierzhuang.camera.position.toArray());
    assert.notDeepEqual(camera, previousCamera, `${view} has a distinct inspection camera`);
    previousCamera = camera;
    await page.screenshot({ path: path.join(shots, `Texture_OxCart_${view}.png`) });
  }
  await page.locator(".edChip").filter({ hasText: /^斜侧$/ }).click();

  await page.locator(".edPanel .it").filter({ hasText: /马车 · 同款民用板车/ }).click();
  await page.waitForFunction(() => window.Taierzhuang.editor.active?.cartPreview?.animalRoot
    .getObjectByName("HorseFrontLeftPivot"), null, { timeout: 30000 });
  await page.evaluate(() => window.Taierzhuang.StepFrames(15));
  await page.screenshot({ path: path.join(shots, "Texture_HorseCartEditor.png") });
  await page.locator(".edChip").filter({ hasText: /^正侧$/ }).click();
  await page.evaluate(() => window.Taierzhuang.StepFrames(12));
  await page.screenshot({ path: path.join(shots, "Texture_HorseCart_side.png") });
  const horse = await page.evaluate(() => ({ kind: window.Taierzhuang.editor.active.cartKind,
    meshes: Object.values(window.Taierzhuang.editor.active.cartPreview.parts).every((mesh) => mesh.isMesh) }));
  assert.deepEqual(horse, { kind: "horse", meshes: true });
  const wheelAtStop = await page.evaluate(() => window.Taierzhuang.editor.active.cartPreview.cartRoot
    .getObjectByName("WheelLeft").rotation.x);
  await page.locator(".edChip").filter({ hasText: /^停驻姿态$/ }).click();
  await page.evaluate(() => window.Taierzhuang.StepFrames(15));
  const stopped = await page.evaluate(() => ({ wheel: window.Taierzhuang.editor.active.cartPreview.cartRoot
    .getObjectByName("WheelLeft").rotation.x, action: window.Taierzhuang.editor.active.cartAction }));
  assert.equal(stopped.action, "idle");
  assert.ok(Math.abs(stopped.wheel - wheelAtStop) < 1e-6, "the parked cart wheel holds its last angle");
  // 真实体型：鲁西黄牛与华北挽马肩高都在 1.4 米上下（1.7 米的人齐肩），马昂着头耳尖约 1.9 米；
  // 旧模型肩高 2 米多、耳尖 2.7 米。合批后整匹马的皮毛是一只蒙皮网格，量它（含头耳）的最高点。
  const horseTop = await page.evaluate(async () => {
    const THREE = await import("three");
    const editor = window.Taierzhuang.editor.active;
    const mesh = editor.cartPreview.parts.draftBody;
    mesh.updateWorldMatrix(true, false);
    mesh.computeBoundingBox();
    return mesh.boundingBox.clone().applyMatrix4(mesh.matrixWorld).max.y
      - editor.cartPreview.root.getWorldPosition(new THREE.Vector3()).y;
  });
  assert.ok(horseTop > 1.75 && horseTop < 2.05, `horse ear tips at ${horseTop.toFixed(2)} m, want ~1.9 m`);
  const contact = await page.evaluate(() => {
    const instance = window.Taierzhuang.editor.active.cartPreview;
    const hoof = instance.animalRoot.getObjectByName("HorseFrontLeftHoofPivot");
    const position = () => {
      instance.root.updateMatrixWorld(true);
      return { height: hoof.matrixWorld.elements[13], forward: hoof.matrixWorld.elements[14] };
    };
    instance.SetMotion(0, true);
    const first = position();
    instance.SetMotion(.2, true);
    const second = position();
    instance.SetMotion(.2, false);
    const parked = instance.cartRoot.getObjectByName("WheelLeft").rotation.x;
    instance.SetMotion(.2, false);
    return { first, second, parked,
      parkedAgain: instance.cartRoot.getObjectByName("WheelLeft").rotation.x };
  });
  assert.ok(Math.abs(contact.first.height-contact.second.height) < .02,
    "a horse support hoof remains at road height during stance");
  // 1 cm：导出时间轴从 1/30 s 起那次，蹄子只退了 0.158 m（打滑）也能混过 4 cm 的旧门。
  assert.ok(Math.abs(Math.abs(contact.first.forward-contact.second.forward)-.2) < .01,
    "a horse support hoof tracks the cart's .2 m travel");
  assert.equal(contact.parked, contact.parkedAgain, "a stationary wheel does not keep turning");
  await page.locator(".edChip").filter({ hasText: /^人物$/ }).click();
  await page.waitForFunction(() => window.Taierzhuang.editor.active?.actors?.[0]?.meshSource,
    null, { timeout: 30000 });
  assert.equal(await page.evaluate(() => window.Taierzhuang.editor.active.previewMode), "actor");
  await page.evaluate(() => window.Taierzhuang.editor.Close());
  const restored = await page.evaluate(() => {
    const game = window.Taierzhuang;
    return { position: game.camera.position.toArray(), fov: game.camera.fov,
      active: game.editor.activeId };
  });
  assert.deepEqual(restored.position, baseline.position);
  assert.equal(restored.fov, baseline.fov);
  assert.equal(restored.active, null);
  assert.deepEqual(errors, []);
  console.log("PASS Blender ox and horse carts render, walk and roll in 人物动作; camera restores on close");
} finally {
  await browser.close();
  if (server) await new Promise((resolve) => server.close(resolve));
}
