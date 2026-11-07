// ===========================================================================
// Script_SceneFormalBrowserTest.mjs —— 第一关正式场景（Scenes/FirstLevel，docs/Data_Scene.md §8）的浏览器闸门
//
// 跑法：node Taierzhuang1938/Script_SceneFormalBrowserTest.mjs
//
//   1. 白盒编辑器进关建的是白盒场景（编辑、预演跑白盒）；
//   2. 换成正式场景：地面是分层地表（MissionPlain 四层）、道具换成外部模型（盒子不画、碰撞照旧）；
//      体块不是正式资产，仍是白盒灰面 + 米格线（用户 2026-11-01），道具的材质不许被刷成白盒；水同白盒编辑器铺水面；
//      碰撞体数与白盒一样（试玩的编排坐标都在这套布局上）；
//   3. 试玩开打先换成正式场景；关小结回到编辑换回白盒；
//   4. 场景编辑器的下拉里有两个场景，正式场景的资产页列白盒体块、道具与树；
//   5. 全程没有未捕获错误。截图存 _shots/SceneFormal/（不提交）。
// ===========================================================================

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { LaunchBrowser } from "../PrairieFire1937/Script_BrowserTestKit.mjs";
import { ServeRoot } from "./Script_DevServer.mjs";

const projectDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(projectDir, "..");
const shotDir = path.join(projectDir, "_shots", "SceneFormal");
await fs.mkdir(shotDir, { recursive: true });

const results = [];
function Check(name, ok, detail = "") {
  results.push({ name, ok: !!ok, detail });
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? "  — " + detail : ""}`);
}
const J = (v) => JSON.stringify(v);

const server = await ServeRoot(rootDir, 0);
const port = server.address().port;
const browser = await LaunchBrowser();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
// The static test server does not implement editor status endpoints; keep this review read-only.
for (const route of ["**/__blockout/status", "**/__scene/status", "**/__environment/status"]) {
  await page.route(route, request => request.fulfill({ json: { writable: false } }));
}
const errors = [];
page.on("pageerror", (error) => errors.push(`PAGEERROR ${String(error).slice(0, 300)}`));
page.on("console", (message) => {
  if (message.type() !== "error") return;
  const url = message.location()?.url || "";
  if (/fonts\.(googleapis|gstatic)\.com/.test(url)) return;
  if (/__blockout|__scene/.test(url) || /__blockout|__scene/.test(message.text())) return;
  if (/\/Animation\/Previz\w+\/Data_Previz\w+Animation\.json/.test(url) && /404/.test(message.text())) return;
  errors.push(`CONSOLE ${message.text().slice(0, 240)} @ ${url}`);
});
const B = (fn, arg) => page.evaluate(fn, arg);
const Step = (n = 2) => B((n) => window.Tengxian.StepFrames(n, 1 / 60, false), n);

/** 场地现状：样子、外观合批、道具、地表、水、碰撞体数、块材质有没有白盒米格线。 */
const Field = () => B(() => {
  const game = window.Tengxian.editor.editorHost.game, bf = game.battlefield, layout = bf.layout;
  const ground = bf.meshes.find((m) => m.name === "FirstLevelWhitebox_Ground");
  const semantics = new Set(["Whitebox", ...Object.keys(layout.semanticColors || {})]);
  const all = [...bf.materials].filter(([key, m]) => m?.isMeshStandardMaterial && key !== layout.ground?.semantic);
  // 白盒灰面 + 米格线：DressAsWhitebox 打的记号
  const gridded = all.filter(([key, m]) => semantics.has(key) && key !== "water" && m.userData?.whiteboxMaterial).length;
  const othersGridded = all.filter(([key, m]) => !semantics.has(key) && m.userData?.whiteboxMaterial).map(([key]) => key);
  return {
    scene: window.Tengxian.Debug.Blockout.Play.Scene(),
    style: layout.style, materialLooks: !!layout.materialLooks,
    looks: bf.stats?.looks ? Object.keys(bf.stats.looks).length : 0, lookFallback: bf.stats?.lookFallbackSets || [],
    props: bf.scenePropStats?.stats?.props || 0, propMissing: bf.scenePropStats?.missing?.length ?? null, sceneProps: layout.sceneProps?.length || 0,
    terrainLayers: !!bf.terrainLayers, groundLayersAttr: !!ground?.geometry?.getAttribute("terrainLayers"),
    water: !!bf.waterMesh, waterName: bf.waterMesh?.name || null, waterBlocks: layout.blocks.filter((b) => b.blockoutWater).length,
    colliders: bf.colliders?.length ?? bf.solids?.length ?? null, blocks: layout.blocks.length, gridded, othersGridded,
    staticMeshes: bf.meshes.filter((m) => m.name === "FirstLevelWhitebox_StaticWhiteBoxes").length,
    // 场景壕沟（docs/Data_Scene.md §9）：编好的网络、土面细节（正式场景才画）
    trenchSegments: layout.trenchPlan?.segments.length ?? 0, trenchEarth: bf.stats?.trenchEarth || null, trenchSurface: bf.stats?.trenchSurface || null,
  };
});

try {
  // 1) 进关 = 白盒
  console.log("--- boot (whitebox)");
  await page.goto(`http://127.0.0.1:${port}/Taierzhuang1938/?editor=blockout&level=FirstLevel0105&kf=03-3&scale=small&audio=0`,
    { waitUntil: "load", timeout: 180000 });
  await page.waitForFunction(() => window.Tengxian?.state?.ready && window.Tengxian?.Debug?.Blockout?.State().ready, null, { timeout: 300000 });
  await Step(4);
  const wb = await Field();
  Check("进关建的是白盒场景：variant edit、样子 whitebox、不走 PBR 外观", wb.scene.variant === "edit" && wb.style === "whitebox" && !wb.materialLooks
    && /FirstLevelWhitebox/.test(wb.scene.url), J({ scene: wb.scene, style: wb.style }));
  Check("白盒场景：带着这一段的壕沟网络（01–05 的 26 段），但不画土面细节", wb.trenchSegments === 26 && !wb.trenchEarth, J({ segments: wb.trenchSegments, earth: wb.trenchEarth }));
  await page.screenshot({ path: path.join(shotDir, "0105_Whitebox.png") });

  // 2) 换成正式场景
  console.log("--- formal");
  const t0 = Date.now();
  const switched = await B(() => window.Tengxian.Debug.Blockout.Play.UseScene("play"));
  await Step(6);
  const fm = await Field();
  const buildS = (Date.now() - t0) / 1000;
  Check("换成正式场景：variant play、读 Scenes/FirstLevel、地址栏写 scene=FirstLevel", switched && fm.scene.variant === "play" && /Scenes\/FirstLevel\/Scene_FirstLevel\.json/.test(fm.scene.url)
    && (await B(() => new URL(location.href).searchParams.get("scene"))) === "FirstLevel", J({ scene: fm.scene, buildS }));
  Check("正式场景：体块仍是白盒灰面 + 米格线（不走 PBR 外观）", fm.style === "formal" && !fm.materialLooks && fm.looks === 0 && fm.gridded >= 5 && fm.staticMeshes > 0,
    J({ looks: fm.looks, gridded: fm.gridded, staticMeshes: fm.staticMeshes }));
  Check("正式场景：地面是分层地表（MissionPlain 读到、地面网格带 terrainLayers 权重）", fm.terrainLayers && fm.groundLayersAttr, J({ terrainLayers: fm.terrainLayers, attr: fm.groundLayersAttr }));
  Check("正式场景：道具换成外部模型，场景里的 Prop/* 都摆上了", fm.sceneProps > 0 && fm.props >= fm.sceneProps && fm.propMissing === 0,
    J({ sceneProps: fm.sceneProps, props: fm.props, missing: fm.propMissing }));
  Check("正式场景：道具、碎砖瓦、地表的材质没被刷成白盒", fm.othersGridded.length === 0, J(fm.othersGridded.slice(0, 5)));
  Check("正式与白盒的体块数一样（试玩的编排坐标都在同一套布局上）", fm.blocks === wb.blocks, J({ whitebox: wb.blocks, formal: fm.blocks }));
  const earth = fm.trenchEarth || {}, surface = fm.trenchSurface || {};
  Check("正式场景：沟里按样条网络画了土崖、土团、草根、沟沿干草（土面细节）", fm.trenchSegments === 26 && earth.cliffPanels > 100 && earth.clods > 100 && earth.roots > 10 && surface.grass > 10,
    J({ cliffPanels: earth.cliffPanels, clods: earth.clods, roots: earth.roots, spoilClods: earth.spoilClods, grass: surface.grass, stones: surface.stones }));
  await page.screenshot({ path: path.join(shotDir, "0105_Formal.png") });
  // 站到沟底平视：前沿（裸土沟）与北边旧交通沟（弃置旧沟）
  for (const [name, pose] of [["0105_FormalTrench", { x: -9, y: -0.2, z: -0.2, yawDeg: -90, pitchDeg: -4 }], ["0105_FormalOldSap", { x: 0, y: -3.1, z: -306, yawDeg: 5, pitchDeg: -5 }]]) {
    await B((p) => window.Tengxian.Debug.Blockout.Fly(true, p), pose);
    await Step(4);
    await page.screenshot({ path: path.join(shotDir, `${name}.png`) });
    await B(() => window.Tengxian.Debug.Blockout.Fly(false));
  }
  // 高处俯看一眼（飞行观察）
  await B(() => window.Tengxian.Debug.Blockout.Fly(true, { x: 58, y: 26, z: 40, yawDeg: -150, pitchDeg: -35 }));
  await Step(4);
  await page.screenshot({ path: path.join(shotDir, "0105_FormalHigh.png") });
  await B(() => window.Tengxian.Debug.Blockout.Fly(false));

  // 3) 试玩：开打在正式场景、关小结换回白盒
  console.log("--- play");
  await B(() => window.Tengxian.Debug.Blockout.Play.UseScene("edit"));
  await Step(4);
  const back = await Field();
  Check("换回白盒：variant edit、样子 whitebox、地址栏去掉 scene", back.scene.variant === "edit" && back.style === "whitebox"
    && !(await B(() => new URL(location.href).searchParams.get("scene"))), J(back.scene));
  const started = await B(() => window.Tengxian.Debug.Blockout.Play.Start({ from: "03-3", to: "03-3", settings: { invincible: true, infiniteAmmo: true, previz: false } }));
  await Step(30);
  const during = await B(() => ({ play: window.Tengxian.Debug.Blockout.Play.State(), scene: window.Tengxian.Debug.Blockout.Play.Scene() }));
  Check("试玩开打先换成正式场景，再放兵", started && during.scene.variant === "play" && during.scene.style === "formal" && during.play.run?.step === "03-3",
    J({ started, scene: during.scene, step: during.play.run?.step, enemies: during.play.soldiers?.length }));
  await page.screenshot({ path: path.join(shotDir, "0105_PlayFormal.png") });
  await B(() => window.Tengxian.Debug.Blockout.Play.Stop());
  await Step(2);
  await B(() => window.Tengxian.Debug.Blockout.Play.Close());
  await Step(4);
  const after = await Field();
  Check("关小结回到编辑：换回白盒场景", after.scene.variant === "edit" && after.style === "whitebox", J(after.scene));

  // 3b) 村子：06–10、11–18 白盒与正式同一机位各一张（只取证，不设门槛）
  for (const [level, pose] of [["FirstLevel0610", { x: 100, y: 14, z: 398, yawDeg: 180, pitchDeg: -22 }], ["FirstLevel1218", { x: 121, y: 12, z: 636, yawDeg: 180, pitchDeg: -20 }]]) {
    console.log(`--- ${level}`);
    await B((key) => window.Tengxian.Debug.Blockout.SwitchLevel(key), level);
    await Step(4);
    await B((p) => window.Tengxian.Debug.Blockout.Fly(true, p), pose);
    await Step(4);
    await page.screenshot({ path: path.join(shotDir, `${level}_Whitebox.png`) });
    await B(() => window.Tengxian.Debug.Blockout.Fly(false));
    await B(() => window.Tengxian.Debug.Blockout.Play.UseScene("play"));
    await Step(6);
    const v = await Field();
    Check(`${level}：只带这一段的壕沟（${v.trenchSegments} 段）`, level === "FirstLevel1218" ? v.trenchSegments === 2 : v.trenchSegments <= 2, J({ segments: v.trenchSegments, earth: v.trenchEarth && { cliffPanels: v.trenchEarth.cliffPanels } }));
    Check(`${level} 正式场景建起来：体块白盒网格 ${v.gridded} 种材质、道具 ${v.props} 件、分层地表、水块 ${v.waterBlocks} 块同白盒编辑器铺水面`, v.style === "formal" && v.looks === 0 && v.gridded >= 5
      && v.othersGridded.length === 0 && v.propMissing === 0 && v.terrainLayers && v.waterBlocks > 0 && v.waterName === "BlockoutWater",
      J({ gridded: v.gridded, othersGridded: v.othersGridded.slice(0, 3), props: v.props, sceneProps: v.sceneProps, missing: v.propMissing, terrainLayers: v.terrainLayers, water: v.waterName, waterBlocks: v.waterBlocks }));
    await B((p) => window.Tengxian.Debug.Blockout.Fly(true, p), pose);
    await Step(4);
    await page.screenshot({ path: path.join(shotDir, `${level}_Formal.png`) });
    await B(() => window.Tengxian.Debug.Blockout.Fly(false));
  }

  // 4) 场景编辑器：两个场景
  console.log("--- scene editor");
  const editor = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  editor.on("pageerror", (error) => errors.push(`SCENEEDITOR PAGEERROR ${String(error).slice(0, 300)}`));
  await editor.goto(`http://127.0.0.1:${port}/Taierzhuang1938/SceneEditor.html?scene=FirstLevel`, { waitUntil: "load", timeout: 120000 });
  await editor.waitForFunction(() => window.SceneEditor?.State?.().objects > 0 && document.querySelectorAll("#seAssets code").length > 0, null, { timeout: 120000 });
  const se = await editor.evaluate(() => {
    const options = [...document.querySelectorAll("#seScene option")].map((o) => [o.value, o.textContent]);
    const assets = [...document.querySelectorAll("#seAssets code")].map((c) => c.textContent);
    const state = window.SceneEditor.State();
    const pixels = window.SceneEditor.PixelStats?.();
    return { options, assets, objects: state.objects ?? state.count, style: state.style, pixels };
  });
  const terrainOk = await editor.evaluate(() => window.SceneEditor.TerrainReady());
  const look = await editor.evaluate(() => {
    window.SceneEditor.Open(["06–10", "06–10/建筑", "06–10/建筑/WN1"]);
    window.SceneEditor.Select(["House_WN1_1"]);
    window.SceneEditor.Frame(["House_WN1_1"]);
    const tree = window.SceneEditor.Tree();
    return { terrainLook: window.SceneEditor.State().terrainLook, depths: [...new Set(tree.map((r) => r.indent))].length,
      comps: [...document.querySelectorAll("#seInspector .seCompTitle")].map((n) => n.textContent) };
  });
  Check("场景编辑器里正式场景的地面是分层地表（同试玩），不是白盒的高度色带", terrainOk && look.terrainLook === "layers", J({ terrainOk, look: look.terrainLook }));
  Check("层级是一层层文件夹（段落 / 类别 / 院子），检视按组件分节", look.depths >= 4 && ["位置", "外观", "碰撞", "剧情事件"].every((c) => look.comps.includes(c)), J(look));
  // 壕沟：层级里有、选中能拖点重挖、细节开关会改构件、撤销回去
  const tr = await editor.evaluate(async () => {
    const A = window.SceneEditor;
    A.Open(["01–05", "01–05/壕沟", "01–05/壕沟/交通沟"]);
    const inTree = A.Tree().some((r) => r.text === "Traffic");
    A.SelectTrench("Traffic", 3);
    const comps = [...document.querySelectorAll("#seInspector .seCompTitle")].map((n) => n.textContent);
    const [x, z] = A.Trench("Traffic").points[3];
    const h0 = A.HeightAt(x + 8, z).carved, at0 = A.HeightAt(x, z).carved;
    A.MoveTrenchPoint("Traffic", 3, x + 8, z);
    const h1 = A.HeightAt(x + 8, z).carved, at1 = A.HeightAt(x, z).carved;
    const d0 = A.State().trenchDressing;
    A.SetTrenchField("Traffic", "look", "fresh");
    const d1 = A.State().trenchDressing;
    A.Undo(); A.Undo();
    return { inTree, comps, h0, h1, at0, at1, back: A.HeightAt(x + 8, z).carved, d0, d1, dirty: A.State().dirty, undo: A.State().undo };
  });
  Check("场景编辑器：壕沟在层级里、检视有走向 / 断面 / 表现套餐 / 各项细节", tr.inTree && ["走向", "断面", "表现套餐"].every((c) => tr.comps.includes(c)) && tr.comps.some((c) => c.startsWith("草根")), J({ inTree: tr.inTree, comps: tr.comps.slice(0, 8) }));
  Check("场景编辑器：拖控制点按样条重挖（新位置挖下去、旧位置填回）、撤销回原样", tr.h1 < tr.h0 - 1.2 && tr.at1 > tr.at0 + 1.2 && Math.abs(tr.back - tr.h0) < 0.01 && !tr.dirty,
    J({ h0: tr.h0, h1: tr.h1, at0: tr.at0, at1: tr.at1, back: tr.back, dirty: tr.dirty }));
  Check("场景编辑器：套餐换成「新挖完好」，护壁、踏板摆出来", tr.d1 > tr.d0 + 10, J({ before: tr.d0, fresh: tr.d1 }));
  Check("场景编辑器下拉里有两个场景：第一关 · 白盒、第一关 · 正式", se.options.length === 2 && se.options.some(([v]) => v === "FirstLevelWhitebox") && se.options.some(([v]) => v === "FirstLevel"), J(se.options));
  Check("正式场景的资产页列白盒体块、道具与树", se.assets.some((a) => a.startsWith("Prop/")) && se.assets.includes("Tree/Dead") && se.assets.includes("Whitebox/Box"), J(se.assets.slice(0, 8)));
  await editor.screenshot({ path: path.join(shotDir, "SceneEditor_Formal.png") });
  await editor.close();

  Check("全程没有未捕获错误", errors.length === 0, errors.slice(0, 5).join(" | "));
} catch (error) {
  Check("跑完没抛错", false, String(error?.stack || error).slice(0, 800));
} finally {
  await browser.close().catch(() => {});
  server.close();
}

const failed = results.filter((r) => !r.ok);
console.log(failed.length ? `SceneFormalBrowserTest: ${failed.length}/${results.length} failed` : `SceneFormalBrowserTest: ${results.length}/${results.length} passed；截图 Taierzhuang1938\\_shots\\SceneFormal`);
process.exit(failed.length ? 1 : 0);
