// 《滕县 一九三八》人物可见性回归：近景 Actor + 远景 LOD 必须覆盖所有人，
// 人数预算不得再藏活人，尸体不得在本关内消失。
//
// 用法：node Taierzhuang1938/Script_VisibilityTest.mjs
// 退出码即成败。

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

const errors = [];
page.on("pageerror", (error) => errors.push(`PAGEERROR ${String(error).slice(0, 240)}`));
page.on("console", (message) => {
  if (message.type() !== "error") return;
  const url = message.location()?.url || "";
  if (/fonts\.(googleapis|gstatic)\.com/.test(url)) return;
  errors.push(`CONSOLE ${message.text().slice(0, 240)}`);
});

const results = [];
function Check(name, ok, detail = "") {
  results.push({ name, ok: !!ok, detail });
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? `  — ${detail}` : ""}`);
}

try {
  await page.goto(`http://127.0.0.1:${port}/Taierzhuang1938/?shot=1&phase=2&quality=low&scale=small`,
    { waitUntil: "load", timeout: 120000 });
  await page.waitForFunction(() => window.Taierzhuang !== undefined, null, { timeout: 240000 });
  await page.evaluate(() => window.Taierzhuang.StepFrames(30));

  const visibility = await page.evaluate(() => {
    const T = window.Taierzhuang;
    const actors = T.ai.soldiers.filter((soldier) => soldier.actor).slice(0, 30);
    T.camera.position.set(0, 4, 0);
    T.camera.lookAt(0, 1, -80);
    T.camera.updateProjectionMatrix();
    for (let index = 0; index < actors.length; index += 1) {
      const soldier = actors[index];
      const column = index % 10;
      const row = Math.floor(index / 10);
      soldier.position.set((column - 4.5) * 2.3, 0, -35 - row * 16);
      soldier.actor.root.position.copy(soldier.position);
    }
    T.ai.CullActors(T.camera);
    return {
      arranged: actors.length,
      rendered: actors.filter((soldier) => soldier.renderLod === "detail" || soldier.renderLod === "crowd").length,
      detailed: actors.filter((soldier) => soldier.renderLod === "detail").length,
      crowd: actors.filter((soldier) => soldier.renderLod === "crowd").length,
      legacyBudgetPresent: Object.hasOwn(T.ai, "visibleBudget"),
    };
  });
  Check("视锥内超过旧 13 人上限仍全部显示",
    visibility.arranged > 13 && visibility.rendered === visibility.arranged,
    `${visibility.rendered}/${visibility.arranged} = 近景 ${visibility.detailed} + LOD ${visibility.crowd}`);
  Check("距离 LOD 确实接管远处人物", visibility.detailed > 0 && visibility.crowd > 0,
    `近景 ${visibility.detailed} / LOD ${visibility.crowd}`);
  Check("运行时已没有人物可见名额", !visibility.legacyBudgetPresent);

  const crowdCapacity = await page.evaluate(() => {
    const T = window.Taierzhuang;
    const crowd = T.ai.crowd;
    const actor = T.ai.soldiers.find((soldier) => soldier.actor)?.actor;
    if (!crowd || !actor) return 0;
    crowd.Begin();
    for (let index = 0; index < 480; index += 1) {
      crowd.Push(actor.kind, actor.root.position, 0, actor.sizeScale ?? 1, 0, true);
    }
    crowd.End();
    const count = crowd.DeadCount;
    T.ai.CullActors(T.camera);       // 把人为容量探针还原成真实战场列表
    return count;
  });
  Check("远景层容得下最大 480 人票池", crowdCapacity === 480, `${crowdCapacity}/480`);

  // 【为什么单独量尺寸】上面那三条只数「有没有被推进远景层」，人被推进去了就算过。
  // 2026-09-02 实拍到的是另一回事：46 m 外每个人都在实例表里，可身体被烘成 1.7 cm
  // 的一粒（蒙皮网格按 matrixWorld 变换，把 GLB 里那层 0.01 物体缩放当了真），
  // 画面上只剩一支飘在半空的步枪。renderLod 计数、实例数、visible 标记全绿。
  // 所以闸门必须落在**烘出来的人体有多大**上，单位是米。
  const bake = await page.evaluate(() => window.Taierzhuang.ai.crowd?.BakeReport(["nra", "ija"]) || null);
  const bakeEntries = Object.entries(bake || {});
  Check("远景层四套姿势都烘到了蒙皮人体",
    bakeEntries.length >= 4 && bakeEntries.every(([, entry]) => entry.skinnedParts > 0),
    bakeEntries.map(([key, entry]) => `${key}:${entry.skinnedParts}件`).join(" "));
  // 站姿据枪约 1.49—1.53 m（不是立正的 1.66 m），倒地横躺约 1.59—1.62 m；
  // 1.2 m 离两者都远，也离「塌成一粒」的 0.02 m 远得没有争议。
  Check("远景人体不是只剩一支枪（最长边 ≥ 1.2 m）",
    bakeEntries.length > 0 && bakeEntries.every(([, entry]) => entry.bodySpan >= 1.2),
    bakeEntries.map(([key, entry]) => `${key}:${entry.bodySpan.toFixed(2)}m`).join(" "));

  const corpses = await page.evaluate(() => {
    const T = window.Taierzhuang;
    const victims = T.ai.soldiers.filter((soldier) => soldier.alive && soldier.actor).slice(0, 30);
    // 初始 30 帧里可能已经有前一批阵亡者；重新从“仍活着”的列表取样后，必须
    // 再把这一批明确摆回镜头前。否则旧阵列缺几个人时，slice 会从关卡原出生点
    // （有些在 x=500 m 外）补满，测试测到的是视锥外出生点，不是尸体保留策略。
    for (let index = 0; index < victims.length; index += 1) {
      const soldier = victims[index];
      const column = index % 10;
      const row = Math.floor(index / 10);
      soldier.position.set((column - 4.5) * 2.3, 0, -35 - row * 16);
      soldier.actor.root.position.copy(soldier.position);
      if (soldier.body) soldier.body.Teleport(soldier.position.x, soldier.position.y, soldier.position.z);
      soldier.Kill();
    }
    // 旧逻辑在 Update 尾部会把超过 26 的最早尸体 Remove 掉。一帧就足以触发；
    // 多推四秒也覆盖尸体刚体落地并被回收后的稳定状态。
    T.StepFrames(5 * 60, 1 / 60, false);
    T.camera.position.set(0, 4, 0);
    T.camera.lookAt(0, 1, -80);
    T.camera.updateProjectionMatrix();
    T.ai.CullActors(T.camera);
    return {
      killed: victims.length,
      retained: victims.filter((soldier) => T.ai.soldiers.includes(soldier) && soldier.actor).length,
      rendered: victims.filter((soldier) => soldier.renderLod === "detail" || soldier.renderLod === "crowd").length,
      detailed: victims.filter((soldier) => soldier.renderLod === "detail").length,
      crowd: victims.filter((soldier) => soldier.renderLod === "crowd").length,
      oldestSeconds: Math.max(0, ...victims.map((soldier) => soldier.deadTime)),
    };
  });
  Check("超过旧 26 具上限后尸体仍全部保留",
    corpses.killed > 26 && corpses.retained === corpses.killed,
    `${corpses.retained}/${corpses.killed}`);
  Check("尸体稳定落地后仍可见", corpses.rendered === corpses.killed,
    `${corpses.rendered}/${corpses.killed}（近景 ${corpses.detailed} + LOD ${corpses.crowd}），`
      + `最老 ${corpses.oldestSeconds.toFixed(1)} s`);
  Check("整趟没有页面报错", errors.length === 0, errors.slice(0, 3).join(" | "));
} finally {
  await browser.close();
  server.close();
}

const failed = results.filter((result) => !result.ok);
console.log(`\n${results.length - failed.length}/${results.length} 通过`);
if (failed.length) {
  console.log("失败：\n  " + failed.map((result) => result.name).join("\n  "));
  process.exit(1);
}
