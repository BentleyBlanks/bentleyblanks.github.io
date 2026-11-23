// Script_SceneEditorBrowserTest.mjs —— 场景编辑器（SceneEditor.html）真浏览器冒烟
// 跑法：node Taierzhuang1938/Script_SceneEditorBrowserTest.mjs [--no-shots]
// 存盘口在页面里拦截（page.route），不写仓库里的场景文件。查：
//   1. 开起来：物件数 = 场景文件、按材质分批、地形画出来了（数像素：不是满屏天空色、颜色够多）、没有报错；
//   2. 选中 + 拖 X 箭头：那个物件 x 变了、只记一步撤销、标成没保存；Ctrl+Z 回原位；
//   3. 在画面里点另一个物件：选中换成它；拖金圈转、Esc 取消拖动不留改动；
//   4. 真实段落的展开 / 收起 / 显隐、复制 / 删除、检视卡收展；
//   5. 保存：发出去的场景过校验、带读盘时的版本号；200 后标成已保存；409 挂横幅；
//   6. 外面改了场景文件（status 报新版本号）：没改动时 2 s 内自动重读出新位置。

import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { LaunchBrowser } from "../PrairieFire1937/Script_BrowserTestKit.mjs";
import { ServeRoot } from "./Script_DevServer.mjs";
import { ValidateScene, FormatSceneJson } from "./Script_SceneDoc.mjs";

const projectDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(projectDir, "..");
const shotDir = path.join(projectDir, "_shots", "SceneEditor");
const sceneFile = path.join(projectDir, "Scenes", "FirstLevelWhitebox", "Scene_FirstLevelWhitebox.json");
const shots = !process.argv.includes("--no-shots");
await fs.mkdir(shotDir, { recursive: true });

const results = [];
function Check(name, ok, detail = "") {
  results.push({ name, ok: !!ok, detail });
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? "  — " + detail : ""}`);
}
const sceneBytes = await fs.readFile(sceneFile);
const sceneDoc = JSON.parse(sceneBytes.toString("utf8"));
const diskRevision = crypto.createHash("sha1").update(sceneBytes).digest("hex");

const server = await ServeRoot(rootDir, 0);
const port = server.address().port;
const browser = await LaunchBrowser();
const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
const page = await context.newPage();
const errors = [];
page.on("pageerror", (error) => errors.push(`PAGEERROR ${String(error).slice(0, 300)}`));
page.on("console", (message) => {
  if (message.type() !== "error") return;
  const url = message.location()?.url || "";
  // 409 是第 5 步故意让存盘口回的冲突，浏览器会自己记一条资源错误
  if (/__scene\/status/.test(url) || (/__scene\/save/.test(url) && /409/.test(message.text())) || /fonts\.(googleapis|gstatic)\.com/.test(url)) return;
  errors.push(`CONSOLE ${message.text().slice(0, 240)} @ ${url}`);
});

// 存盘口：status 报可写；save 记下请求，按 saveMode 回 200 / 409
let statusRevision = diskRevision, saveMode = "ok";
const saves = [];
await page.route("**/__scene/status", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ writable: true, revisions: { FirstLevelWhitebox: statusRevision } }) }));
await page.route("**/__scene/save", async (route) => {
  const body = JSON.parse(route.request().postData() || "{}");
  saves.push(body);
  if (saveMode === "conflict") return route.fulfill({ status: 409, contentType: "application/json", body: JSON.stringify({ ok: false, error: "版本号对不上", revision: "other" }) });
  return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, scene: body.scene, file: "Taierzhuang1938/Scenes/FirstLevelWhitebox/Scene_FirstLevelWhitebox.json", revision: statusRevision }) });
});

const E = (fn, arg) => page.evaluate(fn, arg);
const Shot = async (name) => { if (shots) await page.screenshot({ path: path.join(shotDir, `${name}.png`) }); };
const Wait = (ms) => page.waitForTimeout(ms);

try {
  await page.goto(`http://127.0.0.1:${port}/Taierzhuang1938/AdvancedTools/SceneEditor.html?scene=FirstLevelWhitebox`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => window.SceneEditor?.State().objects > 0, null, { timeout: 60000 });
  await E(() => window.SceneEditor.ready);
  await Wait(500);

  // 1. 开起来
  const state = await E(() => window.SceneEditor.State());
  Check("物件数 = 场景文件", state.objects === sceneDoc.objects.length, `${state.objects} / ${sceneDoc.objects.length}`);
  Check("按材质分批实例化（白盒体块 + 远景）", state.layers.length >= 8 && state.layers.some(l => l.key.startsWith("bd:")), JSON.stringify(state.layers.slice(0, 6)));
  Check("存盘口可写（拦截的 status）", state.writable === true && state.revision === diskRevision);
  const px = await E(() => window.SceneEditor.PixelStats());
  Check("地形画出来了：不是满屏天空色、颜色够多", px.skyFraction < 0.6 && px.colors > 25, JSON.stringify(px));
  await Shot("01_Open");

  // 2. 选中 + 拖 X 箭头
  const target = "ParapetWest";
  const before = await E((id) => window.SceneEditor.Find(id).pos.slice(), target);
  await E((id) => { window.SceneEditor.Select([id]); window.SceneEditor.Frame([id]); }, target);
  await Wait(300);
  const a = await E(() => window.SceneEditor.ProjectGizmo("x"));
  const o = await E(() => window.SceneEditor.ProjectGizmo("origin"));
  const dir = { x: a.x - o.x, y: a.y - o.y }, len = Math.hypot(dir.x, dir.y) || 1;
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  for (let i = 1; i <= 6; i++) await page.mouse.move(a.x + dir.x / len * 15 * i, a.y + dir.y / len * 15 * i);
  await page.mouse.up();
  await Wait(150);
  const after = await E((id) => window.SceneEditor.Find(id).pos.slice(), target);
  const s2 = await E(() => window.SceneEditor.State());
  Check("拖 X 箭头：x 变了、z 没变、只记一步撤销、标成没保存", after[0] !== before[0] && after[2] === before[2] && s2.undo === 1 && s2.dirty,
    `${JSON.stringify(before)} → ${JSON.stringify(after)}，撤销 ${s2.undo}`);
  await Shot("02_DragX");
  await page.keyboard.press("Control+z");
  await Wait(100);
  const undone = await E((id) => window.SceneEditor.Find(id).pos.slice(), target);
  Check("Ctrl+Z 回原位、又是已保存", JSON.stringify(undone) === JSON.stringify(before) && !(await E(() => window.SceneEditor.State().dirty)), JSON.stringify(undone));

  // 3. 在画面里点另一个物件；拖金圈后 Esc 取消
  const other = "ParapetMiddle";
  const p = await E((id) => window.SceneEditor.ProjectId(id), other);
  await page.mouse.click(p.x, p.y);
  await Wait(100);
  const picked = await E(() => window.SceneEditor.State().selected);
  Check("画面里点一下：选中换成点到的那个", picked.length === 1 && picked[0] !== target, JSON.stringify(picked));
  const ring = await E(() => window.SceneEditor.ProjectGizmo("ring"));
  const yaw0 = await E(() => window.SceneEditor.Find(window.SceneEditor.State().selected[0]).yawDeg || 0);
  await page.mouse.move(ring.x, ring.y);
  await page.mouse.down();
  await page.mouse.move(ring.x, ring.y + 40, { steps: 4 });
  await page.keyboard.press("Escape");
  await page.mouse.up();
  const yaw1 = await E(() => window.SceneEditor.Find(window.SceneEditor.State().selected[0]).yawDeg || 0);
  Check("拖金圈中途 Esc：不留改动", yaw1 === yaw0 && (await E(() => window.SceneEditor.State().undo)) === 0, `${yaw0} → ${yaw1}`);

  // 4. 只有本场景实际存在的段落能展开或从视口隐藏。
  Check("移除通用段落栏、剧情事件与资产面板", await page.locator("#seJumps, #seSignals, #seTabAssets, #sePaneAssets").count() === 0);
  const map = await E(() => window.SceneEditor.State().layers.reduce((sum, layer) => sum + layer.count, 0));
  const stage = page.getByRole("checkbox", { name: "显示 01–05", exact: true });
  const folder = stage.locator("..").locator(".seFolder");
  Check("段落在层级里可展开", (await folder.getAttribute("aria-expanded")) === "true");
  await folder.click();
  Check("收起段落只折叠树", (await folder.getAttribute("aria-expanded")) === "false"
    && (await E(() => window.SceneEditor.State().layers.reduce((sum, layer) => sum + layer.count, 0))) === map);
  await stage.uncheck();
  const hidden = await E(() => window.SceneEditor.State());
  Check("关闭 01–05 只隐藏该段的布设", hidden.hiddenStages.includes("01–05") && hidden.objects === state.objects
    && hidden.layers.reduce((sum, layer) => sum + layer.count, 0) < map && !hidden.dirty);
  await stage.check();
  await E((id) => window.SceneEditor.Select([id]), target);
  const transform = page.getByRole("button", { name: "变换", exact: true });
  await transform.press("Space");
  Check("键盘折叠变换卡，焦点留在卡头", await page.locator("#seComponent-transform").isHidden()
    && await transform.getAttribute("aria-expanded") === "false"
    && await transform.evaluate((button) => button === document.activeElement));
  await transform.press("Space");
  const added = (await E(() => window.SceneEditor.Duplicate()))[0];
  Check("复制现有物件并选中", !!added && (await E(() => window.SceneEditor.State())).objects === state.objects + 1);
  await page.locator("#seCanvas").focus();
  await page.keyboard.press("Delete");
  Check("Del 删掉", !(await E((id) => window.SceneEditor.Find(id), added)));
  await page.keyboard.press("Control+z");
  Check("撤销删除：回来了", !!(await E((id) => window.SceneEditor.Find(id), added)));
  await E((id) => window.SceneEditor.Select([id]), added);
  await Shot("04_StageHierarchy");

  // 5. 保存
  const saved = await E(() => window.SceneEditor.Save());
  const last = saves[saves.length - 1];
  const check = last ? ValidateScene(last.doc) : { ok: false, errors: ["没发出去"] };
  Check("保存：发出去的场景过校验、带读盘时的版本号、包含新加的物件", saved === true && check.ok && last.revision === diskRevision && last.doc.objects.some(o => o.id === added),
    check.errors?.slice(0, 2).join("；"));
  Check("保存后标成已保存", !(await E(() => window.SceneEditor.State().dirty)));
  saveMode = "conflict";
  await E(() => window.SceneEditor.MoveBy(0.5, 0, 0));
  await E(() => window.SceneEditor.Save());
  const banner = await E(() => ({ hidden: document.getElementById("seBanner").hidden, text: document.getElementById("seBanner").textContent }));
  Check("409：挂横幅让人选重新读取 / 下载", !banner.hidden && /别处改过/.test(banner.text), banner.text);
  await Shot("03_Conflict");

  // 6. 外面改了场景文件：撤回本地改动后，status 报新版本号 → 自动重读
  await E(() => { while (window.SceneEditor.State().undo) window.SceneEditor.Undo(); });
  await E(() => window.SceneEditor.Reload());
  const moved = JSON.parse(JSON.stringify(sceneDoc));
  moved.objects.find(x => x.id === target).pos[0] += 7;
  const movedText = FormatSceneJson(moved);
  await page.route("**/Scenes/FirstLevelWhitebox/Scene_FirstLevelWhitebox.json*", (route) => route.fulfill({ status: 200, contentType: "application/json", body: movedText }));
  statusRevision = crypto.createHash("sha1").update(movedText).digest("hex");
  await page.waitForFunction(([id, x]) => window.SceneEditor.Find(id)?.pos[0] === x, [target, moved.objects.find(x => x.id === target).pos[0]], { timeout: 8000 }).catch(() => {});
  const synced = await E((id) => window.SceneEditor.Find(id).pos[0], target);
  Check("外面改了：2 s 内自动重读出新位置", synced === moved.objects.find(x => x.id === target).pos[0], `${synced}`);

  // 7. 独立正式场景的原画机位和正式预览（从未保存的编辑文档加载）。
  await context.addInitScript(() => {
    localStorage.setItem("tengxian1938_graphics_profile_v1", JSON.stringify("low"));
    localStorage.setItem("tengxian1938_graphics_v1", JSON.stringify({ volumetrics: false }));
    localStorage.setItem("tengxian1938_audio_v1", JSON.stringify({ master:0 }));
  });
  const independentUrl = `http://127.0.0.1:${port}/Taierzhuang1938/AdvancedTools/SceneEditor.html?scene=GengjiazhuangEastSmoke`;
  await page.goto(independentUrl, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => window.SceneEditor?.State().objects > 0, null, { timeout: 60000 });
  Check("独立场景没有虚构的第一关段落", await page.locator("[data-stage]").count() === 0);
  await page.locator("#seTabPreview").click();
  await page.locator("#seSelectShot").click();
  await page.waitForFunction(() => window.SceneEditor.State().shotGizmo);
  Check("原画机位带可见 Gizmo 与检视", (await E(() => window.SceneEditor.State().cameraSelected))
    && await page.getByRole("spinbutton", { name: "垂直视角 °" }).isVisible());
  const original = await E(() => window.SceneEditor.Doc().camera);
  const gizmo = await E(() => ({ handle: window.SceneEditor.ProjectGizmo("x"), origin: window.SceneEditor.ProjectGizmo("origin") }));
  const gx = gizmo.handle.x - gizmo.origin.x, gy = gizmo.handle.y - gizmo.origin.y;
  const gLength = Math.hypot(gx, gy);
  await page.mouse.move(gizmo.handle.x, gizmo.handle.y);
  await page.mouse.down();
  await page.mouse.move(gizmo.handle.x + 45 * gx / gLength, gizmo.handle.y + 45 * gy / gLength, { steps: 4 });
  await page.mouse.up();
  const movedCamera = await E(() => window.SceneEditor.Doc().camera);
  Check("拖动机位的 X 箭头只改变 X", movedCamera.position[0] !== original.position[0]
    && movedCamera.position[1] === original.position[1] && movedCamera.position[2] === original.position[2]);
  await page.locator("#seUndo").click();
  Check("撤销机位移动恢复磁盘位姿", JSON.stringify(await E(() => window.SceneEditor.Doc().camera)) === JSON.stringify(original));
  await page.getByRole("spinbutton", { name: "俯仰 °" }).fill("-3.5");
  await page.getByRole("spinbutton", { name: "俯仰 °" }).press("Tab");
  Check("机位检视写入当前文档并标记未保存", (await E(() => window.SceneEditor.Doc().camera.pitchDeg)) === -3.5
    && (await E(() => window.SceneEditor.State())).dirty);
  await page.locator("#seUndo").click();
  const free = await E(() => window.SceneEditor.State().camera);
  await page.locator("#seShotView").click();
  const shotState = await E(() => window.SceneEditor.State());
  Check("原画机位按原位姿与视角出画", shotState.viewMode === "original"
    && Math.abs(shotState.camera.y - original.position[1]) < .001 && shotState.camera.fovDeg === original.fovDeg && !shotState.shotGizmo);
  await page.locator("#seFreeView").click();
  Check("切回自由视角恢复之前的相机", JSON.stringify((await E(() => window.SceneEditor.State())).camera) === JSON.stringify(free));
  await Shot("05_ReferenceGizmo");
  const edited = await E(() => {
    const app = window.SceneEditor;
    const model = app.Doc().objects.find((o) => o.asset === "Prop/eastSmokeMaizeStubble");
    app.Select([model.id]);
    const before = app.State().objects;
    app.Duplicate();
    return { count: before + 1, dirty: app.State().dirty };
  });
  await page.locator("#seShotView").click();
  await page.locator("#seFormalPreview").click();
  await page.waitForFunction(() => window.SceneEditor.State().preview === "ready", null, { timeout: 95000 });
  const frame = page.frames().find((f) => /sceneEditorPreview=/.test(f.url()));
  const preview = await frame.evaluate(() => {
    const game = window.Tengxian;
    const view = game.Debug.ScenePreview.State();
    const before = game.Particles.Inspect().entries.find((p) => p.name.startsWith("Plume/"));
    if (before.time < 120) game.Particles.Get(before.id).system.Update(120 + 1/60 - before.time);
    game.StepFrames(3, 1/60, true);
    const plume = game.Particles.Inspect(before.id);
    const pool = game.Particles.Inspect().volumes.find((v) => v.asset === "EastSmokeBank");
    return { ...view, rendererProfile: game.GraphicsProfile.Inspect().profile, volumetrics: game.post.preset.volumetrics,
      live: pool?.live, ready: pool?.ready, particleCount: plume.particleCount, dropped: plume.dropped, time: plume.time };
  });
  Check("同页正式预览读取未保存布设与模型", edited.dirty && preview.props === edited.count
    && preview.missing?.length === 0 && preview.terrainSet === "EastSmokeField", JSON.stringify(preview));
  Check("正式预览使用固定画质与实际雾，烟体跨 120 秒连续", preview.rendererProfile === "high"
    && preview.volumetrics && preview.fogVolumes === 3 && preview.live === 1 && preview.ready && preview.time > 120
    && preview.particleCount === 1 && preview.dropped === 0, JSON.stringify(preview));
  await Shot("06_FormalPreview");
  await page.locator("#seFreeView").click();
  await frame.waitForFunction(fov => window.Tengxian.Debug.ScenePreview.State().camera.fovDeg === fov, free.fovDeg);
  Check("同一正式预览可以切换到自由视角", (await E(() => window.SceneEditor.State())).viewMode === "free");
  await page.locator("#seClosePreview").click();
  Check("退出正式预览释放画面且保留未保存编辑", await page.locator("#sePreviewMount iframe").count() === 0
    && (await E(() => window.SceneEditor.State())).dirty);
} catch (error) {
  Check("跑完没抛错", false, String(error?.stack || error).slice(0, 600));
} finally {
  Check("全程没有未捕获错误", errors.length === 0, errors.slice(0, 4).join(" | "));
  Check("仓库里的场景文件没被动", Buffer.compare(sceneBytes, await fs.readFile(sceneFile)) === 0);
  await browser.close().catch(() => {});
  server.close();
}

const failed = results.filter(r => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} 通过${shots ? `；截图 ${path.relative(rootDir, shotDir)}` : ""}`);
assert.equal(failed.length, 0, failed.map(f => f.name).join("；"));
