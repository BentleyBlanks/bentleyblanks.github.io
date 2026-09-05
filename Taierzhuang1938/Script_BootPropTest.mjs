// 加载画面那件道具的冒烟：它到底有没有在转。
//
// 这个测试存在的理由是一次实测：展示台原来跟加载一起挤在主线程上，
// 建首关那 9.3 秒里主线程只交出去 26 帧，单块最长的一段占住 3.08 秒 ——
// 屏幕上那件道具是钉住不动的。搬进 worker 之后同一段时间里 worker 侧
// 探针 433 拍、只有 2 拍超过 60 ms。
//
// 所以这里断言的不是"画面好看"，是**worker 的时间线没有被主线程拖住**：
// 在 worker 里挂一个与渲染循环同频（16 ms）的探针，加载全程量它自己的间隔。
// 一旦有人把展示台挪回主线程，这个数会立刻塌回去。

import assert from "node:assert/strict";
import path from "node:path";
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { LaunchBrowser } from "../PrairieFire1937/Script_BrowserTestKit.mjs";
import { ServeRoot } from "./Script_DevServer.mjs";

const projectDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(projectDir, "..");
const server = await ServeRoot(rootDir, 0);
const browser = await LaunchBrowser();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on("pageerror", (error) => errors.push(String(error)));

try {
  const port = server.address().port;
  const workerPromise = page.waitForEvent("worker", { timeout: 60000 });
  page.goto(`http://127.0.0.1:${port}/Taierzhuang1938/?quality=low&scale=small&menu=0`,
    { waitUntil: "commit" });

  const worker = await workerPromise;
  assert.match(worker.url(), /Script_BootPropWorker\.mjs/, "展示台应当跑在 worker 里");

  await worker.evaluate(() => {
    self.__lag = [];
    let last = performance.now();
    const probe = () => {
      const now = performance.now();
      self.__lag.push(now - last);
      last = now;
      setTimeout(probe, 16);
    };
    probe();
  });

  await page.waitForFunction(() => document.getElementById("bootStep")?.textContent === "就绪",
    null, { timeout: 240000, polling: 200 });

  const raw = await worker.evaluate(() => self.__lag);
  const lag = raw.slice().sort((a, b) => b - a);
  const stalls = lag.filter((v) => v > 60).length;
  const worst = Math.round(lag[0] || 0);
  // 量到的窗口有多长（毫秒）与实际拍频。
  //
  // **判据用拍频，不用拍数。** 拍数是「窗口长度 × 拍频」，而窗口长度是
  // 「首关建完要多久」—— 那是关卡内容的函数，不是这条回归要验的东西。
  // 2026-08-28 任务流程重制换掉首关（原来是界河那片密得多的原野）之后，
  // 同样健康的 worker 只跑了 79 拍，旧的 >120 判据就这么红了一次。
  const spanMs = raw.reduce((sum, v) => sum + v, 0);
  const rate = spanMs > 0 ? lag.length / (spanMs / 1000) : 0;
  console.log(`ok   worker 侧 ${lag.length} 拍 / ${Math.round(spanMs)} ms（${rate.toFixed(0)} 拍/s），`
    + `最长 ${worst} ms，>60 ms 的 ${stalls} 拍`);
  // 主线程建首关时只交得出个位数的帧率；worker 这边 16 ms 一拍 ≈ 60 拍/s，
  // 被拖回主线程就会塌到十几。40 拍/s 是那两档中间的分界。
  assert.ok(lag.length >= 40, `worker 只跑了 ${lag.length} 拍，窗口太短，测不出东西`);
  assert.ok(rate >= 40, `worker 只有 ${rate.toFixed(0)} 拍/s，展示台八成又回主线程了`);
  assert.ok(stalls <= 8, `worker 被拖住 ${stalls} 次，它不该跟着主线程一起卡`);

  const card = await page.evaluate(() => ({
    name: document.getElementById("bootPropName")?.textContent || "",
    note: document.getElementById("bootPropNote")?.textContent || "",
    hint: !!document.getElementById("bootPropHint"),
  }));
  assert.ok(card.name.length > 0, "卡片上应当写着这一件是什么");
  assert.ok(card.note.length > 0, "卡片上应当有注记");
  assert.equal(card.hint, false, "「拖动可转动」那行提示已经删掉了，不许回来");
  console.log(`ok   卡片：${card.name}`);

  const type89 = await worker.evaluate(async () => {
    const { PropStage } = await import(new URL(`./Script_BootPropStage.mjs${location.search}`, location.href).href);
    const canvas = new OffscreenCanvas(1280, 900);
    const stage = new PropStage(canvas);
    try {
      stage.Resize(1280, 900);
      await stage.Load({ id: "Type89Tank", name: "八九式" });
      stage.yaw = 2.5; stage.Tick(0);
      const materials = [stage.materials.type89Armor, stage.materials.type89Track];
      const blob = await canvas.convertToBlob({ type: "image/png" });
      const bytes = new Uint8Array(await blob.arrayBuffer());
      let binary = ""; for (const byte of bytes) binary += String.fromCharCode(byte);
      return { ready: stage.type89PbrReady, draws: stage.renderer.info.render.calls,
        triangles: stage.renderer.info.render.triangles,
        maps: materials.map((m) => ({ width: m.map?.image?.width, normalWidth: m.normalMap?.image?.width,
          colorSpace: m.map?.colorSpace, normalSpace: m.normalMap?.colorSpace,
          wrapS: m.map?.wrapS, normalWrapS: m.normalMap?.wrapS })), image: btoa(binary) };
    } finally { stage.Dispose(); }
  });
  assert.equal(type89.ready, true, "八九式专用贴图在 worker 中真实加载");
  assert.equal(type89.triangles, 4089);
  assert.equal(type89.draws, 4);
  assert.deepEqual(type89.maps, [2048, 1024].map((width) => ({
    width, normalWidth: width, colorSpace: "srgb", normalSpace: "", wrapS: 1000, normalWrapS: 1000,
  })), "原装甲/履带底色和法线保持颜色空间、分辨率与重复采样");
  const type89Dir = path.join(projectDir, "_shots", "Type89Restore");
  mkdirSync(type89Dir, { recursive: true });
  writeFileSync(path.join(type89Dir, "Scene_Worker.png"), Buffer.from(type89.image, "base64"));
  console.log("ok  八九式 worker 原贴图 / 4 draws / 4,089 tris");

  const showcaseIds = await worker.evaluate(async () => {
    const stage = await import(new URL(`./Script_BootPropStage.mjs${location.search}`, location.href).href);
    return Array.from({ length: 1000 }, (_, index) => stage.PickShowcase(null, () => index / 1000).id);
  });
  assert.equal(showcaseIds.includes("Mauser96"), false, "C96 不再进入加载展示池");

  const shotDir = path.join(projectDir, "_shots", "C96Removal");
  mkdirSync(shotDir, { recursive: true });
  await page.screenshot({ path: path.join(shotDir, "Scene_Boot.png") });

  assert.deepEqual(errors, []);
  console.log("ok  加载画面展示台冒烟通过");
} finally {
  await browser.close();
  server.close();
}
