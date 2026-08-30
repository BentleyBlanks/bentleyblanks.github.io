// PCG 编辑器真浏览器冒烟：打开、生成、真实模型预览、GPU 取证、JSON 往返与退出还原。

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
page.on("pageerror", (error) => errors.push(String(error)));
page.on("console", (message) => {
  if (message.type() === "error" && !/fonts\.(googleapis|gstatic)\.com/.test(message.location()?.url || "")) {
    errors.push(message.text());
  }
});

const results = [];
function Check(name, ok, detail = "") {
  results.push({ name, ok: !!ok, detail });
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
}

await page.goto(`http://127.0.0.1:${port}/Taierzhuang1938/?quality=low&scale=small&phase=5&menu=0`,
  { waitUntil: "load", timeout: 120000 });
await page.waitForFunction(() => window.Taierzhuang?.state?.ready, null, { timeout: 240000 });
await page.click("#bootStart");
await page.evaluate(() => window.Taierzhuang.StepFrames(20));

const before = await page.evaluate(() => {
  const root = window.Taierzhuang.scene.children.find((child) => child.userData?.externalProps);
  return { visible: root?.visible, fov: window.Taierzhuang.camera.fov, far: window.Taierzhuang.camera.far };
});

const opened = await page.evaluate(async () => {
  const T = window.Taierzhuang;
  const active = T.editor.Open("propPcg");
  await active.RefreshPreview();
  const runtime = T.battlefield.externalStreamer?.Stats?.();
  return {
    id: T.editor.ActiveId,
    fly: T.editor.flycam.Active,
    volumes: active.document.volumes.length,
    placements: active.result.placements.length,
    anchors: active.result.stats.anchors,
    splineVolumes: active.document.volumes.filter((entry) => entry.shape === "spline").length,
    firingLine: active.result.stats.byProfile.defenseFiringLine || 0,
    solidSpline: active.result.placements.filter((entry) => entry.pcgProfile === "defenseFiringLine"
      || entry.pcgProfile === "defenseWireLine").every((entry) => entry.solid === true),
    errors: active.result.errors,
    previewChildren: active.previewRoot.children.length,
    runtimeHidden: T.scene.children.filter((child) => child.userData?.externalProps)
      .every((child) => child.visible === false),
    runtime,
    sections: [...active.panel.root.querySelectorAll(".edSection > .h")].map((node) => node.textContent),
  };
});
Check("PCG 编辑器进入自由飞行并列出源码 volume", opened.id === "propPcg" && opened.fly
  && opened.volumes >= 8, JSON.stringify(opened));
Check("当前切片按真实碰撞生成了 PCG 组", opened.placements > 0 && opened.anchors > 0
  && opened.errors.length === 0, `placements=${opened.placements} anchors=${opened.anchors}`);
Check("当前切片生成了会随样条朝向的实体工事线", opened.splineVolumes >= 8
  && opened.firingLine > 0 && opened.solidSpline,
  `splines=${opened.splineVolumes} firingLine=${opened.firingLine}`);
Check("预览隐藏正片实例根并画出规则结果", opened.runtimeHidden && opened.previewChildren > 0,
  `children=${opened.previewChildren}`);
Check("正片仍有 GPU 实例桶取证", opened.runtime?.batch?.buckets > 0
  && opened.runtime.batch.overflow === 0, JSON.stringify(opened.runtime?.batch));
Check("PCG 面板分节完整", ["撒点区", "所选区规则", "预览与相机", "规则与 GPU 取证", "存取 / 交付"]
  .every((name) => opened.sections.includes(name)), opened.sections.join(" / "));

const roundTrip = await page.evaluate(async () => {
  const active = window.Taierzhuang.editor.active;
  const beforeJson = JSON.stringify(active.document);
  active.Import(beforeJson);
  await active.RefreshPreview();
  const normalizedJson = JSON.stringify(active.document);
  active.Import(normalizedJson);
  await active.RefreshPreview();
  const afterJson = JSON.stringify(active.document);
  active.DuplicateSelected();
  await active.RefreshPreview();
  const duplicated = active.document.volumes.length;
  active.DeleteSelected();
  await active.RefreshPreview();
  return {
    same: normalizedJson === afterJson,
    duplicated,
    restoredCount: active.document.volumes.length,
    resultCount: active.result.placements.length,
  };
});
Check("JSON 导入往返不改规则", roundTrip.same, JSON.stringify(roundTrip));
Check("volume 复制/删除会实时重跑且不污染文档", roundTrip.duplicated === opened.volumes + 1
  && roundTrip.restoredCount === opened.volumes && roundTrip.resultCount > 0, JSON.stringify(roundTrip));

await page.evaluate(() => window.Taierzhuang.editor.Close());
const after = await page.evaluate(() => {
  const root = window.Taierzhuang.scene.children.find((child) => child.userData?.externalProps);
  return {
    active: window.Taierzhuang.editor.ActiveId,
    fly: window.Taierzhuang.editor.flycam.Active,
    visible: root?.visible,
    preview: !!window.Taierzhuang.scene.getObjectByName("EditorPropPcgPreview"),
    fov: window.Taierzhuang.camera.fov,
    far: window.Taierzhuang.camera.far,
  };
});
Check("退出恢复正片实例根并清除预览", !after.active && !after.fly && after.visible === before.visible
  && !after.preview, JSON.stringify(after));
Check("退出恢复相机投影", Math.abs(after.fov - before.fov) < 0.01
  && Math.abs(after.far - before.far) < 0.01, `${before.fov}/${before.far} -> ${after.fov}/${after.far}`);

await page.goto(`http://127.0.0.1:${port}/Taierzhuang1938/?quality=low&scale=small&phase=2&menu=0`,
  { waitUntil: "load", timeout: 120000 });
await page.waitForFunction(() => window.Taierzhuang?.state?.ready, null, { timeout: 240000 });
await page.click("#bootStart");
await page.evaluate(() => window.Taierzhuang.StepFrames(20));
const eastBreach = await page.evaluate(async () => {
  const T = window.Taierzhuang;
  const active = T.editor.Open("propPcg");
  await active.RefreshPreview();
  const wireIds = ["WireEastBreachNorth", "WireEastBreachSouth"];
  const firingIds = [
    "FiringEastBreachSouth", "FiringEastGateNorth", "FiringEastGateSouth",
    "FiringZhaiNorth", "FiringZhaiSouth",
  ];
  const statsFor = (ids) => Object.fromEntries(ids.map((id) => [id, active.result.stats.byVolume[id] || null]));
  return {
    wirePlacements: active.result.placements.filter((entry) => wireIds.includes(entry.pcgVolume)).length,
    firingPlacements: active.result.placements.filter((entry) => firingIds.includes(entry.pcgVolume)).length,
    wireByVolume: statsFor(wireIds),
    firingByVolume: statsFor(firingIds),
    errors: active.result.errors,
  };
});
Check("东寨缺口两翼的样条铁丝网在真实街巷碰撞下仍能落点", eastBreach.wirePlacements >= 2
  && eastBreach.errors.length === 0, JSON.stringify(eastBreach));
Check("城防图指定的东墙／东门／东寨门短散兵线均有真实落点",
  eastBreach.firingPlacements >= 5
  && Object.values(eastBreach.firingByVolume).every((stats) => stats?.placements >= 1),
  JSON.stringify(eastBreach));
await page.evaluate(() => window.Taierzhuang.editor.Close());

await browser.close();
server.close();

if (errors.length) for (const error of errors.slice(0, 10)) console.log(`ERROR ${error.slice(0, 260)}`);
const failed = results.filter((entry) => !entry.ok).length + errors.length;
console.log(failed ? `PROP_PCG_EDITOR_TEST_FAIL count=${failed}` : `PROP_PCG_EDITOR_TEST_OK checks=${results.length}`);
process.exit(failed ? 1 : 0);
