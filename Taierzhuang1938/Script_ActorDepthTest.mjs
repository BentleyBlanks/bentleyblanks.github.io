// 蒙皮人物 NormalDepth 回归：同一机位分别渲染“人物在 / 人物藏”，直接比较
// RGBA16F 预通道的线性深度。主画面是否实心不算证据——2026-08-29 的事故正是
// 主材质正常写深度，但整棵人物被 skipNormalDepth 排除，TAA 随后把背景历史叠回军装。
//
// 用法：node Taierzhuang1938/Script_ActorDepthTest.mjs

import path from "node:path";
import { fileURLToPath } from "node:url";
import { LaunchBrowser } from "../PrairieFire1937/Script_BrowserTestKit.mjs";
import { ServeRoot } from "./Script_DevServer.mjs";

const projectDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(projectDir, "..");
const server = await ServeRoot(rootDir, 0);
const port = server.address().port;
const browser = await LaunchBrowser();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

const problems = [];
page.on("pageerror", (error) => problems.push(`PAGEERROR ${String(error).slice(0, 240)}`));
page.on("console", (message) => {
  if (message.type() !== "error") return;
  const url = message.location()?.url || "";
  if (/fonts\.(googleapis|gstatic)\.com/.test(url)) return;
  problems.push(`CONSOLE ${message.text().slice(0, 240)}`);
});

let result = null;
try {
  await page.goto(
    `http://127.0.0.1:${port}/Taierzhuang1938/?quality=medium&scale=small&phase=5&menu=0&gi=0`,
    { waitUntil: "load", timeout: 120000 },
  );
  await page.waitForFunction(() => window.Taierzhuang !== undefined, null, { timeout: 240000 });
  await page.click(".edGear");
  await page.click('[data-editor="actor"]');
  await page.waitForFunction(() => {
    const active = window.Taierzhuang?.editor?.active;
    return active?.actors?.[0]?.characterRig;
  }, null, { timeout: 180000 });

  result = await page.evaluate(() => {
    const T = window.Taierzhuang;
    const active = T.editor.active;
    active.kindList.Select("nra", true);
    active.animationMode = "imported";
    active.SetClip("RifleRun");
    active.playing = false;
    T.post.SetTaaEnabled(false);
    T.StepFrames(30);

    const actors = active.actors.filter((actor) => actor.characterRig);
    const target = T.post.targets.normalDepth;
    const ReadDepth = () => {
      T.StepFrames(4);
      const pixels = new Uint16Array(target.width * target.height * 4);
      T.renderer.readRenderTargetPixels(target, 0, 0, target.width, target.height, pixels);
      return pixels;
    };

    const CountNearer = (withActor, withoutActor) => {
      let count = 0;
      for (let i = 3; i < withActor.length; i += 4) {
        const actorDepth = withActor[i];
        const backgroundDepth = withoutActor[i];
        // 深度为正半浮点，位模式与数值保持同序；0 表示天空/没有几何写入。
        if (actorDepth !== 0 && (backgroundDepth === 0 || actorDepth < backgroundDepth)) {
          count += 1;
        }
      }
      return count;
    };
    const withActor = ReadDepth();
    for (const actor of actors) actor.characterRig.root.visible = false;
    const withoutActor = ReadDepth();
    for (const actor of actors) actor.characterRig.root.visible = true;
    const nearerPixels = CountNearer(withActor, withoutActor);

    let skinnedMeshes = 0;
    const meshTriangles = [];
    for (const actor of actors) {
      actor.characterRig.root.traverse((object) => {
        if (!object.isSkinnedMesh || !object.visible) return;
        skinnedMeshes += 1;
        const indexCount = object.geometry.index?.count;
        const vertexCount = object.geometry.attributes.position?.count || 0;
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        meshTriangles.push({
          name: object.name,
          triangles: (indexCount || vertexCount) / 3,
          materials: materials.map((material) => material?.name || ""),
        });
      });
    }
    const detailDistance = Math.max(0, ...actors.flatMap((actor) => {
      const distances = [];
      actor.characterRig.root.traverse((object) => {
        if (object.userData.normalDepthMaxDistance) {
          distances.push(object.userData.normalDepthMaxDistance);
        }
      });
      return distances;
    }));
    active.studio.orbit.dist = detailDistance + 4;
    active.studio.ApplyCamera();
    const withFarActor = ReadDepth();
    for (const actor of actors) actor.characterRig.root.visible = false;
    const withoutFarActor = ReadDepth();
    for (const actor of actors) actor.characterRig.root.visible = true;
    const farSilhouettePixels = CountNearer(withFarActor, withoutFarActor);
    return {
      nearerPixels,
      farSilhouettePixels,
      totalPixels: target.width * target.height,
      actors: actors.length,
      skinnedMeshes,
      meshTriangles,
      skipped: actors.some((actor) => actor.characterRig.root.userData.skipNormalDepth === true),
      glError: T.renderer.getContext().getError(),
    };
  });
} catch (error) {
  problems.push(`THROW ${String(error).slice(0, 240)}`);
}

await browser.close();
server.close();

const ok = problems.length === 0 && result?.actors === 1 && result.skinnedMeshes > 0
  && result.skipped === false && result.glError === 0
  && result.nearerPixels > 1000 && result.farSilhouettePixels > 300;
console.log(`${ok ? "ok  " : "FAIL"} 蒙皮人物写入 NormalDepth`, result || "无结果");
for (const problem of problems) console.log(`FAIL ${problem}`);
if (!ok) process.exit(1);
