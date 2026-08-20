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
    { timeout: 240000, polling: 200 });

  const lag = (await worker.evaluate(() => self.__lag)).sort((a, b) => b - a);
  const stalls = lag.filter((v) => v > 60).length;
  const worst = Math.round(lag[0] || 0);
  console.log(`ok   worker 侧 ${lag.length} 拍，最长 ${worst} ms，>60 ms 的 ${stalls} 拍`);
  // 主线程那 9 秒里只有 26 帧；worker 这边一秒钟就该有几十拍。
  assert.ok(lag.length > 120, `worker 只跑了 ${lag.length} 拍，展示台八成又回主线程了`);
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

  assert.deepEqual(errors, []);
  console.log("ok  加载画面展示台冒烟通过");
} finally {
  await browser.close();
  server.close();
}
