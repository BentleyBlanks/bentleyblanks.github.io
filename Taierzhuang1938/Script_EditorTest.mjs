// 《滕县 一九三八》编辑器套件冒烟：真浏览器里把九个编辑器一个个打开、用一遍、关掉。
//
// 为什么要有这一层：编辑器是**唯一会去动运行时状态**的一批代码 ——
// 藏世界、换相机、包 GroundHeight、往 city.colliders 里塞盒子、给 viewmodel 换枪。
// 这些操作只要有一处没还回去，表现就是「玩了一会儿之后游戏坏了」，
// 而坏的地方离编辑器已经很远（撞到空气、退出后视角歪了、举着别人的枪）。
// 所以这里的断言重点不是「能不能打开」，而是**关掉之后有没有还干净**。
//
// 用法：node Taierzhuang1938/Script_EditorTest.mjs
// 退出码即成败。

import fs from "node:fs";
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
page.on("pageerror", (e) => errors.push(`PAGEERROR ${String(e).slice(0, 240)}`));
page.on("console", (m) => {
  if (m.type() !== "error") return;
  const url = m.location()?.url || "";
  if (/fonts\.(googleapis|gstatic)\.com/.test(url)) return;
  errors.push(`CONSOLE ${m.text().slice(0, 240)}`);
});

const results = [];
function Check(name, ok, detail = "") {
  results.push({ name, ok: !!ok, detail });
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? "  — " + detail : ""}`);
}

async function Step(frames = 20) {
  await page.evaluate((n) => window.Taierzhuang.StepFrames(n), frames);
}

/** 真的按一下画布。笔刷是在 Update 里落的，所以按下与抬起之间要推几帧。 */
async function CanvasClick(x, y) {
  await page.mouse.move(x, y);
  await page.mouse.down();
  await Step(3);
  await page.mouse.up();
  await Step(3);
}

/** 真的拖一下画布。 */
async function CanvasDrag(x, y, steps = 12) {
  await page.mouse.move(x, y);
  await page.mouse.down();
  for (let i = 1; i <= steps; i += 1) {
    await page.mouse.move(x + i * 6, y + i * 3);
    await Step(1);
  }
  await page.mouse.up();
  await Step(2);
}

// ===========================================================================
// 启动（正常模式：要验齿轮按钮真的能点）
// ===========================================================================
// menu=0：跳过主菜单，进页面就是这一关（菜单会盖住 #bootStart，而这一节要点它）
// **在城里那几关跑，不在序·界河（phase 0）跑。**
// 界河是独立场景（JieheField）：它没有 `.city`，地皮是分块的 JieheGround_i_j，
// 而且那张地表一格 40 m 上下 —— 地形笔刷的「网格太疏就拒绝落笔」判据在那儿
// 恒为真，也就是说**地形编辑器在那一关本来就用不了**，那六条断言不可能过。
// 这不是这一趟改出来的（这个文件之前停在 phase 0，第一条取证就抛
// `T.battlefield.city is undefined`，整个冒烟根本没跑到地形那一段）。
// 界河要不要支持地形笔刷是另一件事，别混在这里。
// gi=1：GI 出厂默认关（2026-08-26 起探针体不构造）。Debug Rendering 那一节要
// 直接掏 gi.irradiance / gi.distanceMoments 验图集送屏，考的是「GI 开着」的面板，
// 所以显式强开 —— 默认关状态下的调试视图契约由 Script_GiTest 管。
await page.goto(`http://127.0.0.1:${port}/Taierzhuang1938/?quality=medium&scale=small&phase=5&menu=0&gi=1`,
  { waitUntil: "load", timeout: 120000 });
await page.waitForFunction(() => window.Taierzhuang !== undefined, null, { timeout: 240000 });

// ---------------------------------------------------------------------------
// 1) 齿轮与入口面板
//
// 两条路都要验，因为它们各自只在一半的时间里可用：
//   · 鼠标点齿轮 —— 只在**没拿指针锁**的时候可用（开局站在「进城」页、
//     或者玩家按过 Esc）。指针锁一挂上，浏览器把所有鼠标事件路由给 canvas，
//     DOM 上的按钮谁也点不着 —— 这不是 bug，是指针锁的定义。
//   · 按 ` —— 打游戏当中唯一的入口。它会顺手把指针锁交还，鼠标这才能点面板。
// 只验一条的话，另一条坏了没人知道。
// ---------------------------------------------------------------------------
const gearVisible = await page.isVisible(".edGear");
Check("齿轮按钮在", gearVisible);

await page.click(".edGear");
const byGear = await page.evaluate(() => window.Taierzhuang.Debug.Editor().panelOpen);
Check("没拿指针锁时鼠标点齿轮能开", byGear);
await page.click(".edGear");   // 收起来，下面走键盘那条

await page.click("#bootStart");
await Step(20);
const locked = await page.evaluate(() => window.Taierzhuang.Debug.PointerLock().locked);
await page.keyboard.press("Backquote");
const afterGear = await page.evaluate(() => {
  const T = window.Taierzhuang;
  return {
    capturing: T.Debug.Editor().capturing,
    panelOpen: T.Debug.Editor().panelOpen,
    entries: document.querySelectorAll(".edPanel.launcher [data-editor]").length,
  };
});
Check("打游戏当中按 ` 弹出入口面板", afterGear.panelOpen && afterGear.capturing,
  `进游戏时指针锁=${locked}`);
// 三个设置 + 两个可叠加（渲染调试/性能剖析）+ 十一个编辑器（含场景样条PCG）
// + 一个「全部关掉」（它的 data-editor 是空串，也被选择器数进来）
Check("面板列出设置、渲染调试与全部编辑器入口", afterGear.entries === 17, `按钮数=${afterGear.entries}`);

// 玩法真的停了：推 60 帧，state.elapsed 只应该被编辑器那条分支加，AI 不许再动
const paused = await page.evaluate(() => {
  const T = window.Taierzhuang;
  const before = { fire: T.Debug.FireCount(), x: T.player.position.x, z: T.player.position.z };
  T.StepFrames(60);
  const after = { fire: T.Debug.FireCount(), x: T.player.position.x, z: T.player.position.z };
  return { before, after };
});
Check("面板开着时玩法暂停",
  paused.before.fire === paused.after.fire
  && paused.before.x === paused.after.x && paused.before.z === paused.after.z,
  `开火 ${paused.before.fire}→${paused.after.fire}`);

// Debug Rendering 是观察工具，不可被互斥编辑器的切换顺手销毁。它要真的把
// NormalDepth 靶送到屏幕，不能只是 DOM 面板里一串假的状态文字。
await page.click('[data-editor="debugRendering"]');
await Step(6);
const debugRendering = await page.evaluate(() => {
  const T = window.Taierzhuang;
  const panel = T.editor.overlays.get("debugRendering");
  // 屏幕真的被写了没有。**只比 uniform 上的纹理引用是不够的** ——
  // 这一趟的展示 pass 曾经因为一个 GLSL ES 3.00 保留字（变量名叫 sample）整段
  // 编译不过：uniform 全接对了，three 却什么都不画，九个视图在屏幕上一律纯黑。
  // 那次事故里下面那张 visible 表全绿，人眼看到的却是黑屏。所以要读回像素。
  const canvas = document.querySelector("canvas");
  const probe = document.createElement("canvas");
  probe.width = 48; probe.height = 30;
  const ctx = probe.getContext("2d");
  const Brightest = () => {
    ctx.drawImage(canvas, 0, 0, probe.width, probe.height);
    const data = ctx.getImageData(0, 0, probe.width, probe.height).data;
    let max = 0;
    for (let i = 0; i < data.length; i += 4) {
      max = Math.max(max, (data[i] + data[i + 1] + data[i + 2]) / 3);
    }
    return Math.round(max);
  };
  const visible = {};
  const lit = {};
  const chipsOn = {};
  const matMode = {};
  // 材质/光照组走的是「材质重画进 hdr 靶」那条路：送屏视图名与材质侧的
  // 假彩色编号必须一起被 SetView 设置，编号见 Script_EditorDebugRendering。
  const materialViews = {
    baseColor: 6, roughness: 7, metalness: 8, shadow: 9, giWorld: 1, giConfidence: 3,
  };
  for (const view of ["normal", "depth", "ao", "aoBlur", "giIrradiance", "giDistance",
    "baseColor", "roughness", "metalness", "shadow", "giWorld", "giConfidence"]) {
    panel.SetView(view);
    T.StepFrames(2);
    const source = T.post._GetDebugSource();
    const expected = view === "normal" || view === "depth"
      ? T.post.targets.normalDepth.texture
      : view === "ao" ? T.post.targets.ao.texture
        : view === "aoBlur" ? T.post.targets.aoBlur.texture
          : view === "giIrradiance" ? T.editor.host.game.gi.irradiance[T.editor.host.game.gi.pingPong].texture
            : view === "giDistance" ? T.editor.host.game.gi.distanceMoments[T.editor.host.game.gi.pingPong].texture
              : T.post.targets.hdr.texture;
    visible[view] = source?.texture === expected;
    matMode[view] = T.library.gi ? T.library.gi.debugView.value === (materialViews[view] || 0) : false;
    lit[view] = Brightest();
    // 一次只许亮一格：四组 chips 是四个独立控件，选中态必须集中同步，
    // 否则面板上会同时亮着四个视图，读者判断不出送屏的到底是哪一张。
    chipsOn[view] = document.querySelectorAll(".edPanel.debugRendering .edChip.on").length;
  }
  panel.SetView("normal");
  T.StepFrames(3);
  return {
    editor: T.Debug.Editor(),
    panel: !!document.querySelector(".edPanel.debugRendering"),
    view: T.post.GetDebugView(),
    // 回到非材质视图后，材质侧的假彩色 uniform 必须归零 ——
    // 留着的话所有材质还在往 hdr 靶里写调试色，正片就毁了。
    matReset: !T.library.gi || T.library.gi.debugView.value === 0,
    target: !!T.post.targets.normalDepth,
    visible, lit, chipsOn, matMode,
  };
});
Check("Debug Rendering：法线 GBuffer 可视化已接入后处理", debugRendering.editor.debugRendering
  && debugRendering.panel && debugRendering.view === "normal" && debugRendering.target
  && Object.values(debugRendering.visible).every(Boolean),
JSON.stringify({ ...debugRendering, lit: undefined, chipsOn: undefined }));
Check("Debug Rendering：材质假彩色编号随视图同步、离开即归零",
  Object.values(debugRendering.matMode).every(Boolean) && debugRendering.matReset,
  JSON.stringify({ matMode: debugRendering.matMode, matReset: debugRendering.matReset }));
// GI 那两张在探针体关着时画的是"不可用"斜纹（也是有颜色的），所以同一条阈值够用。
// 金属度除外：这一关的世界金属度几乎处处为 0，取景框里没有天空时全屏合法地黑。
Check("Debug Rendering：每个视图都真的画到了屏幕上（不是黑屏）",
  Object.entries(debugRendering.lit).every(([view, v]) => view === "metalness" || v > 8),
  JSON.stringify(debugRendering.lit));
Check("Debug Rendering：四组 chips 只亮当前视图那一格",
  Object.values(debugRendering.chipsOn).every((n) => n === 1), JSON.stringify(debugRendering.chipsOn));

// 点击 range 后浏览器会把键盘焦点留在滑杆上。编辑器不能因为这个焦点
// 就不再收到 WASD：场景编辑器的飞行镜头仍应继续移动。
await page.click('[data-editor="scene"]');
await Step(4);
const debugOverlayPersists = await page.evaluate(() => window.Taierzhuang.Debug.Editor());
Check("打开其它编辑器时 Debug Rendering 保持叠加", debugOverlayPersists.active === "scene"
  && debugOverlayPersists.debugRendering && debugOverlayPersists.debugView === "normal",
JSON.stringify(debugOverlayPersists));
const sliderFound = await page.locator('.edPanel.work input[type="range"]').count();
if (sliderFound) await page.click('.edPanel.work input[type="range"]');
await page.keyboard.down("w");
const sliderKeyboard = await page.evaluate(() => {
  const T = window.Taierzhuang;
  const slider = document.querySelector('.edPanel.work input[type="range"]');
  if (!slider) return { found: false };
  return {
    found: true,
    focused: document.activeElement === slider,
    heldAfterDown: T.editor.flycam.keys.has("KeyW"),
  };
});
await page.keyboard.up("w");
sliderKeyboard.released = await page.evaluate(() => !window.Taierzhuang.editor.flycam.keys.has("KeyW"));
Check("调过滑杆后 WASD 仍控制编辑器飞行",
  sliderKeyboard.found && sliderKeyboard.focused && sliderKeyboard.heldAfterDown && sliderKeyboard.released,
  sliderKeyboard.found
    ? `焦点=${sliderKeyboard.focused} 按下=${sliderKeyboard.heldAfterDown} 松开=${sliderKeyboard.released}`
    : "未找到滑杆");

// 「俯瞰当前切片」必须把四角真的装进视锥。旧版只按最长边抬高，镜头还斜着看，
// 更要命的是沿用战斗 far=400：相机飞到六百多米后整片西关都被远平面裁掉。
const topDown = await page.evaluate(async () => {
  const THREE = await import("./vendor/three/build/three.module.js");
  const T = window.Taierzhuang;
  const beforeFar = T.camera.far;
  const beforeFov = T.camera.fov;
  // 战斗那份 far 存在 FlyCam.saved 里：编辑器一进来就把相机换成出厂投影，
  // T.camera.far 已经是编辑器的 2000 了，拿它当「战斗远平面」会对不上。
  const battleFar = T.editor.flycam.saved.far;
  T.editor.active.TopDown();
  T.StepFrames(3);
  const camera = T.camera;
  camera.updateMatrixWorld(true);
  const matrix = new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
  const frustum = new THREE.Frustum().setFromProjectionMatrix(matrix);
  const bounds = T.editor.host.game.battlefield.bounds;
  const corners = [
    [bounds.minX, bounds.minZ], [bounds.maxX, bounds.minZ],
    [bounds.maxX, bounds.maxZ], [bounds.minX, bounds.maxZ],
  ];
  return {
    beforeFar, beforeFov, battleFar,
    far: camera.far,
    height: camera.position.y,
    allCornersVisible: corners.every(([x, z]) => frustum.containsPoint(new THREE.Vector3(x, 0, z))),
  };
});
Check("场景编辑器出厂投影：远面 2000 m / FOV 55°",
  topDown.beforeFar === 2000 && topDown.beforeFov === 55,
  `far=${topDown.beforeFar} fov=${topDown.beforeFov}（战斗 far=${topDown.battleFar}）`);
Check("俯瞰当前切片：四角都在视锥且 far 盖得住机位",
  topDown.allCornersVisible && topDown.far > topDown.height && topDown.far >= topDown.beforeFar,
  JSON.stringify(topDown));
await page.evaluate(() => window.Taierzhuang.editor.Close());
await Step(3);
const restoredTopDownFar = await page.evaluate(() => window.Taierzhuang.camera.far);
Check("退出场景编辑器恢复战斗远平面", restoredTopDownFar === topDown.battleFar,
  `${topDown.far.toFixed(1)}→${restoredTopDownFar.toFixed(1)}（战斗 ${topDown.battleFar}）`);

// ---------------------------------------------------------------------------
// 1b) 暂停要连**声音**一起停
//
// 用户报的：「我暂停了以后背景里的枪声、背景音都还在」。
// 原因是这两件事根本不在同一条通道上 —— 玩法停靠 Frame() 提前返回，
// 而环境床是几条自己在跑的实录循环（LoopLayer）+ 一个 400 ms 的 setTimeout 调度器，
// 每一轮按概率撒远处的枪炮。Frame() 返不返回它都照响。
//
// 数「在响的层」要同时看 ambLayers（实录床）与 ambienceNodes（实录还没载到时的
// 合成兜底）—— 只看后者的话，包一载好这条断言就恒真了，测了个寂寞。
// ---------------------------------------------------------------------------
const pauseAudio = await page.evaluate(() => {
  const T = window.Taierzhuang;
  const audio = T.audio;
  // 先离开暂停、铺一层环境床与音乐 —— 这就是「背景里的枪声」那一层
  T.editor.TogglePanel(false);
  audio.Ambience("smokyDay");
  audio.Music("tension");
  const Live = () => audio.ambLayers.length + audio.ambienceNodes.length;
  const running = {
    nodes: Live(),
    timer: !!audio.ambienceTimer,
    music: !!audio.musicLayer,
  };
  T.editor.TogglePanel(true);          // 暂停
  const paused = {
    flag: audio.paused,
    nodes: Live(),
    timer: !!audio.ambienceTimer,
    music: !!audio.musicLayer,
  };
  T.editor.TogglePanel(false);         // 继续
  const resumed = {
    flag: audio.paused,
    nodes: Live(),
    preset: audio.ambiencePreset,
    cue: audio.musicCue,
  };
  T.editor.TogglePanel(true);          // 回到暂停，后面的断言接着用
  return { running, paused, resumed };
});
Check("暂停时环境床与音乐真的停了",
  pauseAudio.running.nodes > 0 && pauseAudio.running.timer
  && pauseAudio.paused.flag && pauseAudio.paused.nodes === 0
  && !pauseAudio.paused.timer && !pauseAudio.paused.music,
  `在响 ${pauseAudio.running.nodes} 个节点 → 暂停后 ${pauseAudio.paused.nodes} 个，`
  + `调度器 ${pauseAudio.running.timer}→${pauseAudio.paused.timer}`);
Check("继续之后按原样接回来",
  !pauseAudio.resumed.flag && pauseAudio.resumed.nodes > 0
  && pauseAudio.resumed.preset === "smokyDay" && pauseAudio.resumed.cue === "tension",
  `${pauseAudio.resumed.preset} / ${pauseAudio.resumed.cue}`);

// ---------------------------------------------------------------------------
// 1c) 操作、画质与音效设置面板
// ---------------------------------------------------------------------------
await page.click('[data-editor="controls"]');
await Step(3);
const controls = await page.evaluate(() => ({
  id: window.Taierzhuang.editor.ActiveId,
  title: document.querySelector(".edPanel.work .edTitle")?.textContent || "",
  rows: document.querySelectorAll(".edControlRow").length,
  text: document.querySelector(".edPanel.work")?.textContent || "",
}));
Check("操作面板：列出真实快捷键与情境动作",
  controls.id === "controls" && controls.rows >= 16
  && controls.text.includes("拾枪、换枪") && controls.text.includes("包扎止血"),
  `${controls.title} · ${controls.rows} 行`);

await page.click('[data-editor="graphics"]');
await Step(6);
const gfx = await page.evaluate(() => {
  const T = window.Taierzhuang;
  const before = { w: T.post.width, h: T.post.height, shadow: T.renderer.shadowMap.enabled };
  const g = T.editor.active;
  g.gfx.renderScale = 0.6;
  g.gfx.bloom = 0.25;
  g.gfx.fov = 62;
  g.Apply();
  window.Taierzhuang.StepFrames(4);
  const after = { w: T.post.width, h: T.post.height };
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem("tengxian1938_graphics_v1")); } catch (e) { saved = null; }
  return { id: T.editor.ActiveId, before, after, saved, fov: T.camera.fov };
});
Check("画质面板：渲染分辨率真的改到合成靶上",
  gfx.id === "graphics" && gfx.after.w < gfx.before.w * 0.7,
  `${gfx.before.w}×${gfx.before.h} → ${gfx.after.w}×${gfx.after.h}`);
Check("画质面板：设置落盘",
  !!gfx.saved && gfx.saved.renderScale === 0.6 && gfx.saved.bloom === 0.25,
  gfx.saved ? `renderScale=${gfx.saved.renderScale} bloom=${gfx.saved.bloom}` : "没存上");

// TAA 开关：**点真按钮**，不是直接改 gfx.taa 再调 Apply。
// 面板上的开关如果没接上回调（或者接错了那一位），直接改字段的测法一样是绿的，
// 而玩家点了没反应 —— 这一栏加进来的起因正是「设置里根本没有 TAA」。
const taaToggle = await page.evaluate(() => {
  const T = window.Taierzhuang;
  // Toggle 建的是 div.edBtn 不是 <button>（Script_EditorUi.Toggle），
  // 按标签选而不是按位置选：面板加一栏就不该让这条测试挪窝。
  const Btn = () => Array.from(document.querySelectorAll(".edPanel.work .edBtn"))
    .find((b) => (b.textContent || "").includes("TAA"));
  const button = Btn();
  if (!button) return { found: false };
  const boot = { taa: T.post.taaEnabled, targets: !!T.post.targets.taaA, gfx: T.graphics.taa };
  button.click();
  T.StepFrames(3);
  const off = { taa: T.post.taaEnabled, targets: !!T.post.targets.taaA, gfx: T.graphics.taa };
  Btn().click();
  // 重开的第一帧必须没有历史可混：关着的那几帧没人写历史靶，
  // 里面躺的是关掉之前那一张，混上去就是一层脏东西。
  const firstFrameHistory = T.post.hasTaaHistory;
  T.StepFrames(6);
  const on = {
    taa: T.post.taaEnabled, targets: !!T.post.targets.taaA, gfx: T.graphics.taa,
    settled: T.post.hasTaaHistory,
  };
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem("tengxian1938_graphics_v1")); } catch (e) { saved = null; }
  return { found: true, boot, off, on, firstFrameHistory, saved: saved ? saved.taa : null };
});
Check("画质面板：TAA 开关点得动，管线状态与历史靶跟着走",
  taaToggle.found && taaToggle.boot.taa === true && taaToggle.off.taa === false
  && taaToggle.off.targets === false && taaToggle.on.taa === true && taaToggle.on.targets === true,
  taaToggle.found
    ? `开机=${taaToggle.boot.taa} → 关=${taaToggle.off.taa}/靶${taaToggle.off.targets}`
      + ` → 开=${taaToggle.on.taa}/靶${taaToggle.on.targets}`
    : "面板上找不到 TAA 开关");
Check("画质面板：TAA 关掉再打开不吃陈旧历史，落盘同步",
  taaToggle.found && taaToggle.firstFrameHistory === false
  && taaToggle.on.settled === true && taaToggle.saved === true,
  `重开首帧历史=${taaToggle.firstFrameHistory} 六帧后=${taaToggle.on?.settled} 落盘=${taaToggle.saved}`);
// 画质面板整版留一张图：断言只能证明「DOM 里有这个按钮」，证明不了它在版面上
// 排到哪儿、黄字有没有把面板撑得读不下去。这一栏就是因为「设置里翻不到」才补的，
// 留张图下一轮直接看。
await page.screenshot({ path: path.join(projectDir, "_shots", "editor_graphics_panel.png") });

await page.click('[data-editor="sound"]');
await Step(6);
const snd = await page.evaluate(() => {
  const T = window.Taierzhuang;
  const audio = T.audio;
  audio.SetBusVolume("ambience", 0.3);
  audio.SetMasterVolume(0.7);
  audio.voiceMute = true;
  T.editor.active.Save();
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem("tengxian1938_audio_v1")); } catch (e) { saved = null; }
  return {
    id: T.editor.ActiveId,
    mix: audio.mix.ambience,
    node: audio.ambienceUser ? +audio.ambienceUser.gain.value.toFixed(2) : null,
    barked: audio.Bark("rally", { priority: true }),
    saved,
  };
});
Check("音效面板：分路音量写在 *User 节点上（不动系统配平）",
  snd.id === "sound" && snd.mix === 0.3 && snd.node !== null,
  `mix=${snd.mix} 节点=${snd.node}`);
Check("音效面板：配音开关生效 + 设置落盘",
  snd.barked === null && !!snd.saved && snd.saved.ambience === 0.3 && snd.saved.voiceMute === true,
  snd.saved ? `master=${snd.saved.master} 环境=${snd.saved.ambience}` : "没存上");

// 两块设置都要恢复出厂，而且要把落盘的那两份删掉 ——
// ApplySavedSettings 是**每次开机**都跑的，留在 localStorage 里会串到下一次启动
// （这个套件后面还要再开一次页面验出图模式）。
await page.evaluate(() => {
  const T = window.Taierzhuang;
  T.editor.active.Reset();          // 音效
  T.editor.Open("graphics");
  T.editor.active.Reset();          // 画质（fov / renderScale 都在这儿回 55 / 1.0）
  T.editor.Close();
  T.audio.voiceMute = false;
  try {
    localStorage.removeItem("tengxian1938_graphics_v1");
    localStorage.removeItem("tengxian1938_audio_v1");
  } catch (error) { /* 无痕模式 */ }
});
await Step(4);

// 记下相机与武器，退出编辑器时必须原样还回来
const baseline = await page.evaluate(() => {
  const T = window.Taierzhuang;
  return {
    camera: [T.camera.position.x, T.camera.position.y, T.camera.position.z, T.camera.fov],
    weapon: T.viewmodel.weaponId,
    colliders: (T.battlefield.city || T.battlefield).colliders.length,
    ground: T.battlefield.GroundHeight(4, 4),
  };
});

// ---------------------------------------------------------------------------
// 2) 人物动作编辑器
// ---------------------------------------------------------------------------
await page.click('[data-editor="actor"]');
await Step(20);
const actor = await page.evaluate(() => {
  const editor = window.Taierzhuang.editor;
  const active = editor.active;
  active.SetClip("run");
  window.Taierzhuang.StepFrames(20);
  const one = active.actors.length;
  const kind = active.actors[0] ? active.actors[0].kind : null;
  const source = active.actors[0] ? active.actors[0].meshSource : null;
  active.lineup = true;
  active.Rebuild();
  window.Taierzhuang.StepFrames(10);
  const five = active.actors.length;
  // 六种人物全部走程序化 tzm 模型（GLB 分段皮 2026-08-26 已经拆掉），
  // 这里查的还是同一件事：每个人身上的网格都得是不透明、写深度、进法线预通道的。
  // 判据从「有 riggedSkin 且是 segmentMode」改成「meshSource 是 model 且几何本身合规」——
  // 静默退回方块几何（meshSource === "box"）也会让这一条红。
  const rigidShadingSolid = active.actors.every((previewActor) => {
    if (previewActor.meshSource !== "model") return false;
    let solid = true;
    let meshes = 0;
    previewActor.root.traverse((object) => {
      if (!object.isMesh || !object.visible) return;
      meshes += 1;
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      solid = solid && object.userData.skipNormalDepth !== true
        && materials.every((material) => material && !material.transparent
          && material.opacity === 1 && material.depthWrite && material.depthTest);
    });
    return solid && meshes > 0;
  });
  active.lineup = false;
  active.SetClip("dead");
  window.Taierzhuang.StepFrames(30);
  const ragdoll = !!(active.actors[0] && active.actors[0].ragdollState);
  active.kindList.Select("civilian", true);
  window.Taierzhuang.StepFrames(10);
  const civilianUnarmed = active.kind === "civilian"
    && active.weaponId === null
    && active.weaponSelect.Value() === "";
  return {
    id: editor.ActiveId, one, five, kind, source, ragdoll, civilianUnarmed, rigidShadingSolid,
    studio: editor.studio.Active,
    worldHidden: !window.Taierzhuang.battlefield.meshes.some((m) => m.visible),
    viewmodelHidden: window.Taierzhuang.viewmodel.root.visible === false,
  };
});
Check("人物编辑器打开", actor.id === "actor" && actor.studio, `kind=${actor.kind}`);
Check("摄影棚把城藏起来了", actor.worldHidden && actor.viewmodelHidden);
// KINDS 现在含川军、敢死队、军官、日军、日军军官、百姓，共六种。
Check("单人 / 六种人物对比", actor.one === 1 && actor.five === 6, `${actor.one} → ${actor.five}`);
Check("六种人物都用 tzm 模型，且不透明/写深度法线", actor.rigidShadingSolid);
Check("倒地动作走到 ragdoll", actor.ragdoll, `meshSource=${actor.source}`);
Check("百姓切换后自动空手", actor.civilianUnarmed);

// ---------------------------------------------------------------------------
// 3) 枪械编辑器
// ---------------------------------------------------------------------------
await page.click('[data-editor="weapon"]');
await Step(15);
const weapon = await page.evaluate(() => {
  const editor = window.Taierzhuang.editor;
  const active = editor.active;
  const out = { id: editor.ActiveId };
  out.viewLabels = Array.from(active.viewChips.root.querySelectorAll(".edChip"), (node) => node.textContent);
  active.SetWeapon("Zb26");
  window.Taierzhuang.StepFrames(10);
  out.bench = !!active.benchGroup;
  out.benchMeshes = active.benchGroup ? active.benchGroup.children.length : 0;
  active.SetMode("fp");
  window.Taierzhuang.StepFrames(10);
  out.fp = window.Taierzhuang.viewmodel.weaponId === "Zb26";
  out.fpVisible = window.Taierzhuang.viewmodel.root.visible;
  // 第一人称这一档必须换回正片的 55°。摄影棚默认的 42°（85 mm 等效，为的是
  // 看模型不畸变）比它窄三成，而视图模型的位姿全是按 55° 摆的 —— 用 42° 看，
  // 枪整个掉到画框外，这一栏只剩地面。**「可见」不等于「看得见枪」。**
  out.fpFov = window.Taierzhuang.camera.fov;
  active.Trigger("fire");
  active.Trigger("reload");
  window.Taierzhuang.StepFrames(20);
  out.busy = typeof window.Taierzhuang.viewmodel.IsBusy === "function";
  // 中正式有刺刀预览：台架与第一人称都切换真实独立模型；捷克式没有刺刀，
  // 控件及投掷动作都不能留下可点的空壳。
  active.SetMode("bench");
  active.SetWeapon("ZhongZheng");
  window.Taierzhuang.StepFrames(10);
  out.spinDefaultOff = !active.spin;
  out.bayonetToggleVisible = !active.bayonetToggle.root.hidden;
  out.benchBayonetBefore = !!active.benchBayonet && !active.benchBayonet.visible;
  active.bayonetToggle.root.click();
  out.benchBayonetAfter = !!active.benchBayonet?.visible;
  active.SetMode("fp");
  window.Taierzhuang.StepFrames(10);
  out.fpBayonetAfter = !!window.Taierzhuang.viewmodel.rig?.parts?.bayonet?.visible;
  active.SetWeapon("Zb26");
  window.Taierzhuang.StepFrames(10);
  out.unsupportedBayonetHidden = active.bayonetToggle.root.hidden;
  out.unsupportedThrowHidden = active.actionButtons.throw.hidden;
  out.unsupportedMeleeVisible = !active.actionButtons.melee.hidden;
  active.SetWeapon("Grenade");
  window.Taierzhuang.StepFrames(10);
  out.grenadeThrowVisible = !active.actionButtons.throw.hidden;
  out.grenadeMeleeHidden = active.actionButtons.melee.hidden;
  // 两辆战车已有 .tzm；车辆走整棵关节树并落地，不能再按旧规则当成“无几何”。
  active.SetMode("bench");
  active.SetWeapon("Type89Tank");
  window.Taierzhuang.StepFrames(10);
  out.tankOk = active.benchGroup !== null && active.vehicleNodes !== null;
  out.benchFov = window.Taierzhuang.camera.fov;
  return out;
});
Check("枪械编辑器台架 / 第一人称视图", weapon.id === "weapon" && weapon.bench && weapon.fp,
  `台架网格=${weapon.benchMeshes} fp可见=${weapon.fpVisible}`);
Check("枪械编辑器不再保留无调校用途的手持视图",
  weapon.viewLabels.length === 2 && !weapon.viewLabels.includes("手持"), weapon.viewLabels.join(" / "));
Check("第一人称换回正片镜头、台架换回 85 mm",
  weapon.fpFov === 55 && weapon.benchFov === 42,
  `fp=${weapon.fpFov}° 台架=${weapon.benchFov}°`);
Check("车辆条目按完整关节树建落地台架", weapon.tankOk);
Check("枪械编辑器默认不自转", weapon.spinDefaultOff);
Check("刺刀预览只给支持的枪，并在台架 / 第一人称都切换真实模型",
  weapon.bayonetToggleVisible && weapon.benchBayonetBefore && weapon.benchBayonetAfter && weapon.fpBayonetAfter,
  JSON.stringify({
    toggle: weapon.bayonetToggleVisible, benchBefore: weapon.benchBayonetBefore,
    benchAfter: weapon.benchBayonetAfter, fpAfter: weapon.fpBayonetAfter,
  }));
Check("不支持刺刀 / 投掷的枪不显示无效选项，仍保留有效白刃",
  weapon.unsupportedBayonetHidden && weapon.unsupportedThrowHidden && weapon.unsupportedMeleeVisible);
Check("手榴弹只显示投掷，不显示白刃", weapon.grenadeThrowVisible && weapon.grenadeMeleeHidden);

// ---------------------------------------------------------------------------
// 4) 特效预览编辑器
// ---------------------------------------------------------------------------
await page.click('[data-editor="vfx"]');
await Step(90);
const vfxEditor = await page.evaluate(() => {
  const T = window.Taierzhuang;
  const active = T.editor.active;
  const gl = T.renderer.getContext();
  const continuous = {
    handle: active.handle,
    smokeSpawned: T.vfx.pools.sourceSmoke.cursor,
    fireSpawned: T.vfx.pools.sourceFire.cursor,
    smokeAlive: T.vfx.pools.sourceSmoke.deathTime.some((time) => time > T.vfx.time),
    fireAlive: T.vfx.pools.sourceFire.deathTime.some((time) => time > T.vfx.time),
  };
  active.effectId = "ExplosionGrenade";
  active.Play();
  T.StepFrames(8);
  const instant = T.vfx.lastExplosionSprite;
  return {
    id: T.editor.ActiveId,
    studio: T.editor.studio.Active,
    vfxVisible: T.vfx.root.visible,
    masks: T.vfx.loadedVefectsMasks.size,
    continuous,
    instant,
    playButton: !!active.panel.root.querySelector('[data-vfx-action="play"]'),
    glError: gl.getError(),
  };
});
Check("特效预览编辑器打开正片同源摄影棚",
  vfxEditor.id === "vfx" && vfxEditor.studio && vfxEditor.vfxVisible && vfxEditor.playButton,
  JSON.stringify(vfxEditor));
Check("Vefects 常驻烟火在预览器真实发射",
  vfxEditor.masks === 5 && vfxEditor.continuous.handle > 0
    && vfxEditor.continuous.smokeAlive && vfxEditor.continuous.fireAlive,
  JSON.stringify(vfxEditor.continuous));
Check("特效预览器可重播瞬时爆炸且 shader 无 GL 错误",
  !!vfxEditor.instant && vfxEditor.glError === 0, JSON.stringify(vfxEditor.instant));

// ---------------------------------------------------------------------------
// 5) 音效音乐编辑器
// ---------------------------------------------------------------------------
await page.click('[data-editor="audio"]');
await Step(10);
const audio = await page.evaluate(() => {
  const editor = window.Taierzhuang.editor;
  const active = editor.active;
  const names = active.Names();
  active.PlayCurrent();
  active.NewBlind();
  const blind = active.blind ? active.blind.options.length : 0;
  return {
    id: editor.ActiveId, count: names.length, blind,
    ambience: window.Taierzhuang.audio.ambiencePreset,
  };
});
Check("音效编辑器列出全部配方", audio.id === "audio" && audio.count >= 30, `配方 ${audio.count} 条`);
Check("盲听出四选一", audio.blind === 4);

// 音效是一次性节点，暂停背景也能响；环境床 / 音乐是常驻节点。必须真的点 UI，
// 防止编辑器再次退化成「按钮改了 cue 名，但 SetPaused(true) 把播放头全掐掉」。
await page.click('[data-ambience="night"]');
await page.click('[data-music="tension"]');
await Step(8);
const backgroundPlaying = await page.evaluate(() => {
  const audio = window.Taierzhuang.audio;
  return {
    paused: audio.paused,
    ambience: audio.ambiencePreset,
    ambienceLive: audio.ambLayers.length + audio.ambienceNodes.length,
    ambienceTimer: !!audio.ambienceTimer,
    music: audio.musicCue,
    musicLive: !!audio.musicLayer,
  };
});
Check("音效编辑器允许环境床在玩法暂停时试听",
  !backgroundPlaying.paused && backgroundPlaying.ambience === "night"
    && backgroundPlaying.ambienceLive > 0 && backgroundPlaying.ambienceTimer,
  JSON.stringify(backgroundPlaying));
Check("音效编辑器允许音乐在玩法暂停时试听",
  !backgroundPlaying.paused && backgroundPlaying.music === "tension" && backgroundPlaying.musicLive,
  JSON.stringify(backgroundPlaying));

await page.click('[data-stop-ambience]');
await page.click('[data-stop-music]');
await Step(4);
const backgroundStopped = await page.evaluate(() => {
  const audio = window.Taierzhuang.audio;
  return {
    ambience: audio.ambiencePreset,
    ambienceLive: audio.ambLayers.length + audio.ambienceNodes.length,
    ambienceTimer: !!audio.ambienceTimer,
    music: audio.musicCue,
    musicLive: !!audio.musicLayer,
  };
});
Check("环境与音乐各自都有可用的停止按钮",
  backgroundStopped.ambience === "silence" && backgroundStopped.ambienceLive === 0
    && !backgroundStopped.ambienceTimer && backgroundStopped.music === null && !backgroundStopped.musicLive,
  JSON.stringify(backgroundStopped));

// 每个配方都要有中文说明（"指认" 那一栏，漏一条就等于列表里有个认不出的名字）
const undescribed = await page.evaluate(async () => {
  const audioModule = await import("./Script_Audio.mjs");
  const editor = window.Taierzhuang.editor.active;
  // 用编辑器自己的过滤器逐类点一遍，凑齐的名字应该等于 SOUND_NAMES
  const seen = new Set();
  for (const cat of ["环境", "枪械", "爆炸", "命中", "白刃", "身体", "信号"]) {
    editor.category = cat;
    for (const name of editor.Names()) seen.add(name);
  }
  editor.category = "全部";
  return audioModule.SOUND_NAMES.filter((n) => !seen.has(n));
});
Check("每个配方都有分类与说明", undescribed.length === 0,
  undescribed.length ? `漏了：${undescribed.join(", ")}` : "");

// ---------------------------------------------------------------------------
// 6) Timeline 编辑器
// ---------------------------------------------------------------------------
await page.click('[data-editor="timeline"]');
await Step(10);
const timeline = await page.evaluate(() => {
  const editor = window.Taierzhuang.editor;
  const active = editor.active;
  const out = { id: editor.ActiveId, cuts: [], audioSeek: null, rapidShot: null };
  const ids = ["CS_Chuchuan", "CS_ChuchuanLegacy", "CS_LiZongrenTang", "CS_LastWire", "CS_WangMingzhang", "CS_BeimenBreakout"];
  for (const id of ids) {
    active.SelectCut(id);
    active.Seek(6.0);
    window.Taierzhuang.StepFrames(4);
    out.cuts.push({
      id,
      playing: window.Taierzhuang.cutscene.Playing,
      time: Number(window.Taierzhuang.cutscene.Time.toFixed(2)),
      shot: active.shotIndex,
    });
    active.Stop();
  }
  // 静音快进后，目标时刻仍在持续的对白应从对应采样点接回，而不是从头播或没声。
  active.SelectCut("CS_Chuchuan");
  const audio = window.Taierzhuang.audio;
  const originalPlay = audio.Play;
  const originalStopVoice = audio.StopVoice;
  const originalVoice = audio.voiceBank.get("prologue_young_dispatch_01");
  const calls = [];
  audio.voiceBank.set("prologue_young_dispatch_01", { ...(originalVoice || {}), duration: 4 });
  audio.Play = function(name, opts = {}) {
    calls.push({ name, offset: Number(opts.offset || 0) });
    return { nodes: [], duration: Math.max(0, 4 - Number(opts.offset || 0)) };
  };
  audio.StopVoice = () => true;
  try {
    active.Seek(9.2);
    out.audioSeek = calls.findLast((entry) => entry.name === "voice.prologue_young_dispatch_01") || null;
  } finally {
    active.Stop();
    audio.Play = originalPlay;
    audio.StopVoice = originalStopVoice;
    if (originalVoice) audio.voiceBank.set("prologue_young_dispatch_01", originalVoice);
    else audio.voiceBank.delete("prologue_young_dispatch_01");
  }

  // 连点三次必须连过三镜；不能依赖下一帧才更新的 UI shotIndex。
  active.Seek(0.1);
  active.StepShot(1);
  active.StepShot(1);
  active.StepShot(1);
  out.rapidShot = { shot: active.shotIndex, time: window.Taierzhuang.cutscene.Time };
  active.Stop();
  return out;
});
Check("Timeline 打开", timeline.id === "timeline");
const seekOk = timeline.cuts.every((c) => c.playing && Math.abs(c.time - 6.0) < 0.4);
Check("六场（含新版与 Legacy）都能拖到 6.0 s", seekOk,
  timeline.cuts.map((c) => `${c.id}=${c.time}`).join(" "));
Check("Timeline 跳转会同步到对白采样位置",
  timeline.audioSeek?.name === "voice.prologue_young_dispatch_01"
    && Math.abs(timeline.audioSeek.offset - 0.6) < 0.05,
  JSON.stringify(timeline.audioSeek));
Check("快速连续切镜不会重复卡在同一镜", timeline.rapidShot?.shot === 3,
  JSON.stringify(timeline.rapidShot));
const stopped = await page.evaluate(() => window.Taierzhuang.cutscene.Playing);
Check("停下来之后过场不再占着相机", stopped === false);

// 序章 headLook 即使没有指针锁也会吃 mousemove；Alt 必须临时把鼠标完整还出来。
await page.evaluate(() => {
  const active = window.Taierzhuang.editor.active;
  active.SelectCut("CS_Chuchuan");
  active.Seek(9.2);
  window.Taierzhuang.cutscene.SetNeutralLook(false);
});
await page.keyboard.down("Alt");
const altMouse = await page.evaluate(() => {
  const T = window.Taierzhuang;
  const before = { ...T.cutscene.Look };
  const event = new MouseEvent("mousemove", { bubbles: true });
  Object.defineProperty(event, "movementX", { value: 120 });
  Object.defineProperty(event, "movementY", { value: -80 });
  document.dispatchEvent(event);
  return { before, after: { ...T.cutscene.Look }, lock: T.Debug.PointerLock() };
});
await page.keyboard.up("Alt");
Check("Timeline 按住 Alt 会释放鼠标并暂停序章视线",
  altMouse.lock.mouseFree && !altMouse.lock.locked
    && altMouse.before.yaw === altMouse.after.yaw && altMouse.before.pitch === altMouse.after.pitch,
  JSON.stringify(altMouse));
await page.evaluate(() => window.Taierzhuang.editor.active.Stop());

// ---------------------------------------------------------------------------
// 7) 拆分后的场景关卡编辑器
// ---------------------------------------------------------------------------
await page.click('[data-editor="scene"]');
await Step(15);
const scene = await page.evaluate(() => {
  const T = window.Taierzhuang;
  const editor = T.editor;
  const active = editor.active;
  const out = { id: editor.ActiveId, fly: editor.flycam.Active };
  out.sections = [...active.panel.root.querySelectorAll(".edSection > .h")]
    .map((node) => node.textContent);
  out.originalProjection = [editor.flycam.saved.fov, editor.flycam.saved.far];
  active.TopDown();
  out.topDownFar = T.camera.far;
  out.topDownHeight = T.camera.position.y;
  const SetSlider = (control, value) => {
    const input = control.root.querySelector("input");
    input.value = String(value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  };
  SetSlider(active.projectionControls.fov, 68);
  SetSlider(active.projectionControls.far, 1500);
  out.projection = [T.camera.fov, T.camera.far];

  // 场景关卡入口必须从能力层也拒绝地形落笔，不只是把按钮藏起来。
  const groundBefore = T.battlefield.GroundHeight(60, 60);
  active.SetMode("terrain");
  active.PaintTerrain(60, 60, false);
  out.terrainBlocked = active.mode === "look"
    && active.terrainOps.length === 0
    && T.battlefield.GroundHeight(60, 60) === groundBefore;
  const before = (T.battlefield.city || T.battlefield).colliders.length;

  // 摆一个四合院：碰撞盒必须真的进城的格子（否则玩家能穿墙走过去）
  active.SetPalette("Compound");
  active.Place(30, 30);
  out.items = active.items.length;
  out.nodes = active.root.children.length;
  out.colliderGain = (T.battlefield.city || T.battlefield).colliders.length - before;
  out.nearby = T.battlefield.NearbyColliders(30, 30, 12)
    .filter((b) => b.tag === "editorPlacement").length;

  // 沙包路障走的是 props 通道，最容易「点了没反应」
  active.SetPalette("Barricade");
  active.Place(-20, 10);
  const bar = active.items[active.items.length - 1];
  out.barMeshes = bar.node ? bar.node.children.length : 0;

  // 文本标记是独立语义层：区域有占地框，道路有带宽/走向，两者都画中文世界牌。
  active.markerDraft = { kind: "region", text: "滕文中学旧址", ry: Math.PI / 2, w: 66, d: 40 };
  active.PlaceMarker(-186, 220);
  active.markerDraft = { kind: "road", text: "火神庙东街", ry: 0, w: 337, d: 5 };
  active.PlaceMarker(23.5, 210);
  let markerSprites = 0;
  active.root.traverse((node) => { if (node.isSprite && node.name.startsWith("MapMarkerText_")) markerSprites += 1; });
  out.markers = {
    count: active.markers.length,
    kinds: active.markers.map((marker) => marker.kind).sort().join(","),
    sprites: markerSprites,
    chinese: active.Serialize().markers.map((marker) => marker.text).join(" / "),
  };

  // 存取：本地保存/读回与 JSON 导出/导入都必须同时带回构件和中文标记。
  const json = JSON.stringify(active.Serialize());
  active.Save();
  active.ClearAll();
  active.ClearMarkers();
  active.Restore(false);
  out.localRoundTrip = `${active.items.length} / ${active.markers.length}`;
  active.ClearAll();
  active.ClearMarkers();
  const cleared = `${active.items.length} / ${active.markers.length}`;
  active.Import(json, false);
  out.roundTrip = `${cleared} → ${active.items.length} / ${active.markers.length}`;

  // 一键图纸标记必须来自正式数据：两校和警察所是区域，火神庙东街是道路。
  active.LoadMapReferences();
  out.mapReferences = {
    count: active.markers.filter((marker) => marker.source === "map").length,
    custom: active.markers.filter((marker) => marker.source === "custom").length,
    customText: active.markers.filter((marker) => marker.source === "custom")
      .map((marker) => marker.text).join(" / "),
    school: active.markers.some((marker) => marker.sourceId === "feature:WenzhongSchool"
      && marker.text === "滕文中学旧址" && marker.w === 66 && marker.d === 40),
    police: active.markers.some((marker) => marker.sourceId === "feature:PoliceStation"
      && marker.text === "警察所"),
    road: active.markers.some((marker) => marker.sourceId === "street:FireGodTempleEastStreet"
      && marker.kind === "road" && marker.text === "火神庙东街"),
    exterior: [
      "gate:East", "gate:West", "gate:South", "gate:North",
      "outskirts:PowerPlant", "outskirts:JinpuRailway", "outskirts:EastSuburb",
      "outskirts:NorthStreet", "outskirts:Landmark:CatholicChurchSouth",
    ].every((sourceId) => active.markers.some((marker) => marker.sourceId === sourceId)),
  };
  active.Import(json, false);

  // v1 没有 markers；升级后必须安全读成空层，再恢复本轮文档继续后面的测试。
  active.Import('{"v":1,"items":[],"terrain":[]}', false);
  out.legacyMarkers = active.markers.length;
  const many = Array.from({ length: 200 }, (_, index) => ({
    id: 7, kind: index % 2 ? "road" : "region", text: `标记${index}`,
    x: index, z: -index, w: 30, d: 8,
  }));
  active.Import(JSON.stringify({ v: 2, items: [], markers: many, terrain: [] }), false);
  out.markerImportGuard = {
    count: active.markers.length,
    uniqueIds: new Set(active.markers.map((marker) => marker.id)).size,
  };
  active.Import(json, false);

  // 名牌 HUD：布防图名字必须不点任何按钮就直接读得到（DOM 层，不是世界牌）。
  // 机位定死、逐点直上直下拍，避免整城视角下名牌互相挤掉造成断言抖动。
  const Labels = () => [...active.hudLayer.querySelectorAll(".edMapLabel")];
  const Named = (text) => Labels().filter((el) => el.textContent === text);
  const LookDownAt = (x, z, height) => {
    T.camera.position.set(x, height, z);
    T.camera.rotation.set(-Math.PI / 2, 0, 0, "YXZ");
    editor.flycam.yaw = 0;
    editor.flycam.pitch = -Math.PI / 2;
    T.camera.updateMatrixWorld();
    active.UpdateHudLabels();
  };
  LookDownAt(104, -216, 250);              // 警察所正上方：图纸参考名（虚线 ref 样式）
  out.hud = {
    layerInDom: !!active.hudLayer && active.hudLayer.isConnected,
    police: Named("警察所").length,
    policeRef: Named("警察所").every((el) => el.classList.contains("ref")),
  };
  LookDownAt(-186, 220, 250);              // 自放标记与同址图纸名：只留一张、算文档的
  out.hud.custom = Named("滕文中学旧址").length === 1
    && !Named("滕文中学旧址")[0].classList.contains("ref");
  LookDownAt(0, 0, 700);                   // 整城俯瞰：名牌要成片出现（挤掉的不算）
  out.hud.cityCount = Labels().length;
  active.LoadMapReferences();
  LookDownAt(104, -216, 250);              // 载入图纸标记后：同名不双份，且已转正为文档标记
  out.hudDedup = {
    police: Named("警察所").length,
    policeNowDoc: Named("警察所").every((el) => !el.classList.contains("ref")),
  };
  active.hudNamesVisible = false;
  active.UpdateHudLabels();
  out.hudOff = Labels().length;
  active.hudNamesVisible = true;
  active.Import(json, false);

  // 俯瞰拾取回归：700 m 机位下画面边缘的射线要走 900 m 上下才碰到地。
  // 旧的 600 m 定值在这儿必然空手而归，表现就是「标记怎么点都放不下」。
  LookDownAt(0, 0, 700);
  const pick = active.Pick({ clientX: 200, clientY: 150 });
  out.overviewPick = pick ? { kind: pick.kind, distance: Math.round(pick.distance) } : null;

  // 特效与构件共用落点和 JSON，但不创建假碰撞盒；编辑器接管期间仍要推进烟火。
  active.SetPalette("Effect_FireSmall");
  active.Place(12, -18);
  T.StepFrames(45);
  out.effect = {
    category: active.panel.root.textContent.includes("特效"),
    handles: active.effectHandles.length,
    source: T.vfx.smokeSources.has(active.effectHandles[0]),
    json: active.Serialize().items.some((item) => item.type === "Effect_FireSmall"),
    emitted: T.vfx.pools.sourceSmoke.cursor + T.vfx.pools.sourceFire.cursor > 0,
  };
  active.DeleteSelected();

  return out;
});
Check("场景编辑器进自由飞行", scene.id === "scene" && scene.fly);
Check("场景编辑器只保留关卡与布设职责",
  scene.sections.includes("关卡切片") && scene.sections.includes("构件库")
    && scene.sections.includes("已放置") && scene.sections.includes("文本标记")
    && !scene.sections.includes("地形笔刷"),
  scene.sections.join(" / "));
Check("场景编辑器不再能编辑地形", scene.terrainBlocked);
Check("场景相机可调 FOV 与远裁剪面",
  scene.projection[0] === 68 && scene.projection[1] === 1500, scene.projection.join(" / "));
// 编辑器出厂就是 2000 m，俯瞰通常不需要再扩；但战斗那份 400 m 一定盖不住
// 俯瞰机位，所以这里断的是「结果够远」，不是「有没有扩过」。
Check("俯瞰全城的远裁剪面盖得住机位（战斗那份盖不住）",
  scene.topDownFar > scene.topDownHeight && scene.topDownFar > scene.originalProjection[1],
  `战斗 ${scene.originalProjection[1].toFixed(0)} → 俯瞰 ${scene.topDownFar.toFixed(0)} m（机位高 ${scene.topDownHeight.toFixed(0)} m）`);
Check("放置的构件进场景且带碰撞盒",
  scene.items === 1 && scene.nodes >= 1 && scene.colliderGain > 0 && scene.nearby > 0,
  `盒子 +${scene.colliderGain}，附近 ${scene.nearby}`);
Check("沙包路障（props 通道）真的建出来了", scene.barMeshes > 0, `网格 ${scene.barMeshes}`);
Check("区域/道路标记会生成中文世界牌并进入 JSON",
  scene.markers.count === 2 && scene.markers.kinds === "region,road"
    && scene.markers.sprites === 2 && scene.markers.chinese.includes("滕文中学旧址")
    && scene.markers.chinese.includes("火神庙东街"), JSON.stringify(scene.markers));
Check("场景本地存档会带回构件与标记", scene.localRoundTrip === "2 / 2", scene.localRoundTrip);
Check("场景 JSON 存取往返", scene.roundTrip === "0 / 0 → 2 / 2", scene.roundTrip);
Check("编辑器从 Data_Tengxian 载入院落与道路图纸标记",
  scene.mapReferences.count >= 35 && scene.mapReferences.school
    && scene.mapReferences.police && scene.mapReferences.road
    && scene.mapReferences.exterior
    && scene.mapReferences.custom === 2 && scene.mapReferences.customText.includes("滕文中学旧址")
    && scene.mapReferences.customText.includes("火神庙东街"), JSON.stringify(scene.mapReferences));
Check("旧版 v1 场景文档按空标记层兼容", scene.legacyMarkers === 0, scene.legacyMarkers);
Check("布防图名牌 HUD 不点按钮就直接显示（图纸参考名走 ref 样式）",
  scene.hud.layerInDom && scene.hud.police === 1 && scene.hud.policeRef
    && scene.hud.custom && scene.hud.cityCount >= 25, JSON.stringify(scene.hud));
Check("载入图纸标记后名牌按 sourceId 去重且转正为文档标记",
  scene.hudDedup.police === 1 && scene.hudDedup.policeNowDoc, JSON.stringify(scene.hudDedup));
Check("名牌 HUD 开关会清空名牌层", scene.hudOff === 0, String(scene.hudOff));
Check("俯瞰机位的拾取能超过旧 600 m 射程落到地面",
  scene.overviewPick && scene.overviewPick.distance > 600
    && scene.overviewPick.distance < 1500,
  JSON.stringify(scene.overviewPick));
Check("外部 JSON 标记有数量上限且重复 id 会重编号",
  scene.markerImportGuard.count === 96 && scene.markerImportGuard.uniqueIds === 96,
  JSON.stringify(scene.markerImportGuard));
Check("场景关卡可布设、预览并序列化特效",
  scene.effect.category && scene.effect.handles === 1 && scene.effect.source
    && scene.effect.json && scene.effect.emitted, JSON.stringify(scene.effect));

// ---------------------------------------------------------------------------
// 6a+) 名牌 HUD 的每帧驱动 + 俯瞰下的真鼠标放标记
//
// 用户报的原话是「文本标记怎么都没有生效」，成因有二，都只在俯瞰机位下复现：
//   · 拾取射程定值 600 m，TopDown 机位五六百米起步，画面边缘的射线量程先用完 ——
//     内部直调 PlaceMarker 是复现不出来的，必须走真鼠标；
//   · 世界牌是定死的世界尺寸，五百米高空看只剩几个像素 —— 名字改走屏幕空间 HUD。
// 上面那节验的是 UpdateHudLabels 手动调用；这里验 Update() 每帧真的在驱动它。
// ---------------------------------------------------------------------------
await page.evaluate(() => window.Taierzhuang.editor.active.TopDown());
await Step(8);
const hudLive = await page.evaluate(() =>
  window.Taierzhuang.editor.active.hudLayer.querySelectorAll(".edMapLabel").length);
Check("名牌 HUD 由每帧 Update 驱动（俯瞰下自动成片出现）", hudLive >= 10, String(hudLive));

const markersBefore = await page.evaluate(() => {
  const active = window.Taierzhuang.editor.active;
  active.SetMode("mark");
  return active.markers.length;
});
await CanvasClick(320, 210);
const markByMouse = await page.evaluate(() => {
  const active = window.Taierzhuang.editor.active;
  const marker = active.markers[active.markers.length - 1];
  return {
    count: active.markers.length,
    at: marker ? `${Math.round(marker.x)}, ${Math.round(marker.z)}` : null,
  };
});
Check("俯瞰机位下真鼠标能放下文本标记（旧 600 m 射程在这儿必失败）",
  markByMouse.count === markersBefore + 1, JSON.stringify(markByMouse));
// 名牌 HUD 的视觉验收产物（_shots 已 gitignore）；顺手把试放的标记撤掉 ——
// 后面地形抬升那节按「恰好两个标记」取证。
await fs.promises.mkdir(path.join(projectDir, "_shots"), { recursive: true });
await page.screenshot({ path: path.join(projectDir, "_shots", "editor_marker_hud.png") });
await page.evaluate(() => window.Taierzhuang.editor.active.DeleteSelectedMarker());

// ---------------------------------------------------------------------------
// 6b) 场景关卡编辑器的真鼠标落点
//
// 用户报的两条都在这一段。它们的共同点是**没有任何报错**，只是「点了没反应」：
//   · 点「回到玩家」把俯仰归零 = 正对地平线，而拾取是沿射线找地面 ——
//     水平射线永远碰不到平地，于是屏幕上半边点哪儿都放不下东西；
//   · 地形笔刷只在 mousemove 里落笔，单击（不拖）什么也不发生；
//     而拖动时左键同时被拿去转视角，刷子跟着视角跑。
// 所以这一段一律走**真的鼠标事件**，不调内部方法 —— 那两条 bug 从内部调是复现不出来的。
// ---------------------------------------------------------------------------
await page.evaluate(() => {
  const active = window.Taierzhuang.editor.active;
  active.ClearAll();
  active.GoToPlayer();
});
await Step(5);
const aim = await page.evaluate(() => {
  const T = window.Taierzhuang;
  const rect = T.renderer.domElement.getBoundingClientRect();
  const hit = T.editor.active.Pick({ clientX: rect.width / 2, clientY: rect.height / 2 });
  return { pitch: +T.editor.flycam.pitch.toFixed(2), hit: !!hit };
});
Check("「回到玩家」之后准心还够得着地面", aim.hit, `俯仰=${aim.pitch}`);

await page.evaluate(() => window.Taierzhuang.editor.active.SetMode("place"));
await Step(3);
await CanvasClick(620, 430);
const placedByMouse = await page.evaluate(() => ({
  items: window.Taierzhuang.editor.active.items.length,
  gizmo: !!(window.Taierzhuang.editor.active.gizmo
    && window.Taierzhuang.editor.active.gizmo.group.visible),
}));
Check("「回到玩家」之后还能用鼠标放东西",
  placedByMouse.items === 1 && placedByMouse.gizmo,
  `items=${placedByMouse.items} 落点环=${placedByMouse.gizmo}`);

// 留一口井给地形编辑器验证“物体随地面抬升”；切换入口时靠共享会话文档接过去。
await page.evaluate(() => {
  const active = window.Taierzhuang.editor.active;
  active.ClearAll();
  active.SetPalette("Well");
  active.Place(60, 60);
});

// ---------------------------------------------------------------------------
// 6c) 构件库预览器
// ---------------------------------------------------------------------------
await page.click('[data-editor="props"]');
await Step(8);
const props = await page.evaluate(() => {
  const T = window.Taierzhuang;
  const active = T.editor.active;
  active.SetPalette("Barricade");
  const SetSlider = (control, value) => {
    const input = control.root.querySelector("input");
    input.value = String(value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  };
  SetSlider(active.projectionControls.fov, 47);
  SetSlider(active.projectionControls.far, 480);
  return {
    id: T.editor.ActiveId,
    studio: T.editor.studio.Active,
    selected: active.paletteId,
    loaded: active.preview && active.preview.loaded,
    meshes: active.preview ? active.preview.meshes : 0,
    originalProjection: [T.editor.studio.saved.fov, T.editor.studio.saved.far],
    projection: [T.camera.fov, T.camera.far],
    sections: [...active.panel.root.querySelectorAll(".edSection > .h")]
      .map((node) => node.textContent),
  };
});
Check("构件库用独立摄影棚预览正片构件",
  props.id === "props" && props.studio && props.selected === "Barricade"
    && props.loaded && props.meshes > 0, JSON.stringify(props));
Check("构件库预览器不混入关卡布设或地形面板",
  props.sections.includes("全部可布设构件") && props.sections.includes("预览相机")
    && !props.sections.includes("已放置") && !props.sections.includes("地形笔刷"),
  props.sections.join(" / "));
Check("构件库相机可调 FOV 与远裁剪面",
  props.projection[0] === 47 && props.projection[1] === 480, props.projection.join(" / "));
Check("切换到构件库前恢复场景相机参数",
  JSON.stringify(props.originalProjection) === JSON.stringify(scene.originalProjection),
  `${scene.originalProjection.join("/")} → ${props.originalProjection.join("/")}`);
await page.evaluate(() => window.Taierzhuang.editor.active.SetPalette("External_cart"));
await Step(6);
const externalProp = await page.evaluate(() => {
  const active = window.Taierzhuang.editor.active;
  return {
    selected: active.paletteId,
    loaded: active.preview && active.preview.loaded,
    meshes: active.preview ? active.preview.meshes : 0,
    source: active.facts.root.textContent,
  };
});
Check("构件库覆盖正式战场新增的带署名外部 GLB",
  externalProp.selected === "External_cart" && externalProp.loaded && externalProp.meshes > 0
    && externalProp.source.includes("Model_Handcart.glb"), JSON.stringify(externalProp));

// ---------------------------------------------------------------------------
// 6d) 地形编辑器：共享场景文档 + 物体/碰撞随地高同步
// ---------------------------------------------------------------------------
await page.click('[data-editor="terrain"]');
await Step(8);
const terrainLift = await page.evaluate(() => {
  const T = window.Taierzhuang;
  const active = T.editor.active;
  const item = active.items[0];
  const Nearby = () => T.battlefield.NearbyColliders(60, 60, 8)
    .find((box) => box.tag === "editorPlacement");
  const collider = Nearby();
  const before = {
    ground: T.battlefield.GroundHeight(60, 60),
    objectY: item.node.position.y,
    colliderY: collider ? collider.min[1] : null,
  };
  const SetSlider = (control, value) => {
    const input = control.root.querySelector("input");
    input.value = String(value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  };
  SetSlider(active.projectionControls.fov, 72);
  SetSlider(active.projectionControls.far, 1800);
  active.brush.kind = "crater";
  active.brush.radius = 14;
  active.brush.strength = 1.5;
  active.PaintTerrain(60, 60, true);
  return {
    id: T.editor.ActiveId,
    supportsTerrain: active.supportsTerrain,
    mode: active.mode,
    items: active.items.length,
    markers: active.markers.length,
    markerText: active.markers.map((marker) => marker.text).join(" / "),
    markerNodes: active.markers.filter((marker) => marker.node && marker.node.parent).length,
    before,
    afterGround: T.battlefield.GroundHeight(60, 60),
    afterObjectY: item.node.position.y,
    edge: T.battlefield.GroundHeight(100, 60),
    projection: [T.camera.fov, T.camera.far],
    originalProjection: [T.editor.flycam.saved.fov, T.editor.flycam.saved.far],
    sections: [...active.panel.root.querySelectorAll(".edSection > .h")]
      .map((node) => node.textContent),
  };
});
await Step(4); // 松手后的 Update 会把碰撞盒按新地高重建
const liftedCollider = await page.evaluate(() => {
  const T = window.Taierzhuang;
  const collider = T.battlefield.NearbyColliders(60, 60, 8)
    .find((box) => box.tag === "editorPlacement");
  return collider ? collider.min[1] : null;
});
Check("地形编辑器独立接管地形并接到场景构件文档",
  terrainLift.id === "terrain" && terrainLift.supportsTerrain
    && terrainLift.mode === "terrain" && terrainLift.items === 1
    && terrainLift.markers === 2 && terrainLift.markerNodes === 2
    && terrainLift.markerText.includes("滕文中学旧址") && terrainLift.markerText.includes("火神庙东街"),
  JSON.stringify(terrainLift));
Check("地形编辑器只暴露地形职责",
  terrainLift.sections.includes("地形笔刷") && terrainLift.sections.includes("关卡切片")
    && !terrainLift.sections.includes("构件库") && !terrainLift.sections.includes("已放置"),
  terrainLift.sections.join(" / "));
Check("地形抬升时构件与碰撞盒同步抬升",
  terrainLift.afterGround > terrainLift.before.ground + 1
    && terrainLift.afterObjectY > terrainLift.before.objectY + 1
    && liftedCollider !== null && liftedCollider > terrainLift.before.colliderY + 1,
  `地 ${terrainLift.before.ground.toFixed(2)}→${terrainLift.afterGround.toFixed(2)}，`
  + `物 ${terrainLift.before.objectY.toFixed(2)}→${terrainLift.afterObjectY.toFixed(2)}，`
  + `碰撞 ${terrainLift.before.colliderY}→${liftedCollider}`);
Check("地形笔刷同时改解析高程且不波及半径外",
  terrainLift.afterGround > terrainLift.before.ground + 1
    && Math.abs(terrainLift.edge - terrainLift.before.ground) < 0.001,
  `${terrainLift.before.ground.toFixed(2)} → ${terrainLift.afterGround.toFixed(2)}`);
Check("地形相机可调 FOV 与远裁剪面",
  terrainLift.projection[0] === 72 && terrainLift.projection[1] === 1800,
  terrainLift.projection.join(" / "));
Check("切换到地形前恢复构件库相机参数",
  JSON.stringify(terrainLift.originalProjection) === JSON.stringify(scene.originalProjection),
  `${props.projection.join("/")} → ${terrainLift.originalProjection.join("/")}`);
await page.evaluate(() => {
  const active = window.Taierzhuang.editor.active;
  active.ResetTerrain();
  active.ClearMarkers();
});

// 先飞到城内台地上空：**只有那张网格够密**（636 m 铺 116×116，约 5.5 m 一格）。
// 城外那张是绕城的方环，700 m 以外每两百米才一个顶点，笔刷在那儿是改不动网格的。
const brush = await page.evaluate(() => {
  const T = window.Taierzhuang;
  const active = T.editor.active;
  active.ClearAll();
  T.camera.position.set(0, 58, 40);
  T.editor.flycam.yaw = 0;
  T.editor.flycam.pitch = -0.95;
  active.SetMode("terrain");
  active.brush.kind = "crater";
  active.brush.radius = 10;
  active.brush.strength = 1.2;
  return { before: 0, x: 0, z: 0 };
});
await Step(4);
const brushAt = await page.evaluate(() => {
  const T = window.Taierzhuang;
  const hit = T.editor.active.Pick({ clientX: 620, clientY: 430 });
  return hit
    ? { before: +T.battlefield.GroundHeight(hit.x, hit.z).toFixed(3), x: hit.x, z: hit.z }
    : { before: null, x: 0, z: 0 };
});
Object.assign(brush, brushAt);
await CanvasClick(620, 430);
const afterClick = await page.evaluate((at) => {
  const T = window.Taierzhuang;
  return {
    ops: T.editor.active.terrainOps.length,
    after: +T.battlefield.GroundHeight(at.x, at.z).toFixed(3),
  };
}, brush);
Check("地形笔刷：单击一次就出一个坑",
  afterClick.ops === 1 && afterClick.after < brush.before - 0.5,
  `ops=${afterClick.ops}  ${brush.before} → ${afterClick.after}`);

const pitchBefore = await page.evaluate(() => window.Taierzhuang.editor.flycam.pitch);
await page.evaluate(() => {
  const active = window.Taierzhuang.editor.active;
  active.ResetTerrain();
  active.brush.kind = "lower";
});
await CanvasDrag(620, 430, 12);
const afterDrag = await page.evaluate((p) => {
  const T = window.Taierzhuang;
  return {
    ops: T.editor.active.terrainOps.length,
    pitchMoved: Math.abs(T.editor.flycam.pitch - p) > 1e-6,
  };
}, pitchBefore);
// 12 次移动以前会推 12 个 op（每个都要把十几万顶点走一遍），而且镜头跟着一起转
Check("地形笔刷：拖动不转镜头、也不把 op 表刷爆",
  !afterDrag.pitchMoved && afterDrag.ops > 0 && afterDrag.ops <= 6,
  `12 次移动 → ${afterDrag.ops} 个 op，镜头动了=${afterDrag.pitchMoved}`);

// 城外网格太疏的地方必须**拒绝**这一笔：只改解析高程而网格不动，
// 就是这个模块开头声明不许出现的那种分歧（看着是平地，人却掉进坑里）。
const coarse = await page.evaluate(() => {
  const T = window.Taierzhuang;
  const active = T.editor.active;
  active.ResetTerrain();
  active.brush.kind = "crater";
  active.brush.radius = 8;
  const far = { x: 40, z: -1200 };          // 城外一千两百米：那儿每两百米才一个顶点
  const before = T.battlefield.GroundHeight(far.x, far.z);
  active.PaintTerrain(far.x, far.z, false, 1 / 60);
  return {
    ops: active.terrainOps.length,
    touched: active.lastTouched,
    moved: Math.abs(T.battlefield.GroundHeight(far.x, far.z) - before) > 1e-6,
  };
});
Check("网格太疏的地方拒绝落笔（不留「看着平地却掉坑里」）",
  coarse.ops === 0 && coarse.touched === 0 && !coarse.moved,
  `动到顶点=${coarse.touched} 记了 ${coarse.ops} 笔 解析高程变了=${coarse.moved}`);

await page.evaluate(() => {
  const active = window.Taierzhuang.editor.active;
  active.ResetTerrain();
  active.ClearAll();
  active.SetMode("look");
});

// 换关：先在场景关卡编辑器布设，再切到地形编辑器落笔。两边共享的文档、碰撞盒、
// GroundHeight 与顶点位移都必须搬到新 city，且必须等 state.ready 之后再搬。
await page.click('[data-editor="scene"]');
await Step(4);
await page.evaluate(() => {
  const active = window.Taierzhuang.editor.active;
  active.SetPalette("Well");
  active.Place(12, 12);
});
await page.click('[data-editor="terrain"]');
await Step(4);
await page.evaluate(() => {
  const active = window.Taierzhuang.editor.active;
  active.brush.kind = "crater";
  active.PaintTerrain(12, 40, false);
  active.host.game.JumpToLevel(1);
});
await page.waitForFunction(
  () => window.Taierzhuang.state.ready && window.Taierzhuang.Debug.Level().index === 1,
  null, { timeout: 240000 });
await Step(20);
const jumped = await page.evaluate(() => {
  const T = window.Taierzhuang;
  const active = T.editor.active;
  return {
    level: T.Debug.Level().id,
    items: active.items.length,
    nodes: active.root.children.length,
    viewmodelHidden: !T.viewmodel.root.visible,
    patched: !!T.battlefield.__editorBaseGroundHeight,
    solid: T.battlefield.NearbyColliders(12, 12, 6)
      .some((b) => b.tag === "editorPlacement"),
    dented: T.battlefield.GroundHeight(12, 40) < T.battlefield.GroundHeight(12, 90) - 0.3,
  };
});
Check("换关之后放置层与地形跟着搬家",
  jumped.items === 1 && jumped.nodes === 1 && jumped.viewmodelHidden
    && jumped.patched && jumped.solid && jumped.dented,
  `到了 ${jumped.level}，枪藏起=${jumped.viewmodelHidden} 碰撞=${jumped.solid} 地形=${jumped.dented}`);
await page.evaluate(() => {
  const active = window.Taierzhuang.editor.active;
  active.ResetTerrain();
  active.ClearAll();
});

// ---------------------------------------------------------------------------
// 7) 关掉之后有没有还干净
// ---------------------------------------------------------------------------
await page.click('.edPanel.launcher .edBtn.danger');   // 全部关掉
await page.keyboard.press("Backquote");                       // 收面板
await Step(20);
const restored = await page.evaluate(() => {
  const T = window.Taierzhuang;
  return {
    capturing: T.Debug.Editor().capturing,
    active: T.Debug.Editor().active,
    camera: [T.camera.position.x, T.camera.position.y, T.camera.position.z, T.camera.fov],
    weapon: T.viewmodel.weaponId,
    handWeapon: T.Debug.Slots().weapon,
    viewmodel: T.viewmodel.root.visible,
    leftovers: (T.battlefield.city || T.battlefield).colliders.filter((b) => b.tag === "editorPlacement").length,
    ground: T.battlefield.GroundHeight(4, 4),
    worldVisible: T.battlefield.meshes.every((m) => m.visible),
    hudHidden: document.body.classList.contains("edHideHud"),
    patched: !!T.battlefield.__editorBaseGroundHeight,
  };
});
Check("关掉后不再接管", !restored.capturing && restored.active === null);
Check("世界与 HUD 都放回来了", restored.worldVisible && !restored.hudHidden && restored.viewmodel);
// 拿当前关的 currentWeapon 比，不拿一开始那次的 —— 中途换过关，
// 那一关的携行本来就不一样；要验的是「视图模型举的是游戏认为你拿着的那一把」。
Check("武器还回玩家手里", restored.weapon === restored.handWeapon,
  `视图模型=${restored.weapon} 手里=${restored.handWeapon}`);
Check("放置层的碰撞盒摘干净", restored.leftovers === 0, `残留 ${restored.leftovers} 个`);
Check("GroundHeight 的包已拆", !restored.patched && restored.ground === baseline.ground);

// 相机：玩家自己的机位每帧都在被 player.Update 写，所以只验 FOV 与「没被留在天上」
Check("相机交还（FOV 复原）", restored.camera[3] === baseline.camera[3],
  `fov ${baseline.camera[3]} → ${restored.camera[3]}`);

// 玩法恢复：再推 120 帧，仗要接着打
const resumed = await page.evaluate(() => {
  const T = window.Taierzhuang;
  const before = T.Debug.FireCount();
  T.StepFrames(180);
  return { before, after: T.Debug.FireCount() };
});
Check("关掉编辑器之后仗接着打", resumed.after > resumed.before,
  `开火 ${resumed.before} → ${resumed.after}`);

// ---------------------------------------------------------------------------
// 8) 出图模式：整棵 DOM 必须藏起来
// ---------------------------------------------------------------------------
await page.goto(`http://127.0.0.1:${port}/Taierzhuang1938/?shot=1&quality=medium&scale=small`,
  { waitUntil: "load", timeout: 120000 });
await page.waitForFunction(() => window.Taierzhuang !== undefined, null, { timeout: 240000 });
await Step(10);
const shot = await page.evaluate(() => ({
  hidden: window.Taierzhuang.Debug.Editor().hidden,
  gearVisible: !!document.querySelector(".edGear")
    && document.querySelector(".edGear").getClientRects().length > 0,
  api: typeof window.Taierzhuang.Debug.OpenEditor === "function",
}));
Check("出图模式下编辑器不可见但 API 还在",
  shot.hidden && !shot.gearVisible && shot.api);

// ---------------------------------------------------------------------------
// 9) 新版序章预览入口：独立收口、单次交接、无旧 L0 AI
// ---------------------------------------------------------------------------
const previewHref = await page.getAttribute("#bootPreview", "href").catch(() => null);
Check("开发入口明确指向新版序章预览",
  previewHref === "?preview=CS_Chuchuan&autoplay=1", `href=${previewHref}`);

async function PreviewPage(query = "?preview=CS_Chuchuan") {
  await page.goto(`http://127.0.0.1:${port}/Taierzhuang1938/${query}`,
    { waitUntil: "load", timeout: 120000 });
  await page.waitForFunction(() => window.Taierzhuang !== undefined
    && window.Taierzhuang.state.ready, null, { timeout: 240000 });
  await page.click("#bootStart");
  await page.waitForFunction(() => window.Taierzhuang.Debug.Preview().playing,
    null, { timeout: 30000 });
}

await PreviewPage();
const previewStart = await page.evaluate(() => {
  const T = window.Taierzhuang;
  return {
    preview: T.Debug.Preview(), cut: T.Debug.Cutscene(),
    ai: T.ai.soldiers.filter((s) => s.alive).length,
    audioState: T.audio.ctx ? T.audio.ctx.state : null,
  };
});
Check("新版预览点击播放后自动推进且不提前启动旧 L0 AI",
  previewStart.preview.active && previewStart.cut.current === "CS_Chuchuan"
    && previewStart.cut.playing && previewStart.ai === 0 && previewStart.audioState === "running",
  `cut=${previewStart.cut.current} playing=${previewStart.cut.playing} ai=${previewStart.ai} audio=${previewStart.audioState}`);

await page.evaluate(() => {
  const T = window.Taierzhuang;
  // Notion 2026-08-24 定稿总长 102 s；最后 12 s 是地点卡、开门与自动下车。
  T.StepFrames(102 * 60 + 8, 1 / 60, false);
});
await page.waitForTimeout(10);
const previewDone = await page.evaluate(() => {
  const T = window.Taierzhuang;
  const p = T.Debug.Preview();
  return { ...p, spoken: T.Debug.Spoken().filter((s) => s === "跟随通信排。").length,
    cutPlaying: T.Debug.Cutscene().playing };
});
Check("新版预览正常完成后只交接一次并停在终点",
  previewDone.done && previewDone.handoffCount === 1 && previewDone.spoken === 1
    && !previewDone.cutPlaying && previewDone.aiAlive === 0,
  `done=${previewDone.done} handoff=${previewDone.handoffCount} spoken=${previewDone.spoken} ai=${previewDone.aiAlive}`);

await PreviewPage();
await page.evaluate(() => window.Taierzhuang.Debug.SkipCutscene());
await page.evaluate(() => window.Taierzhuang.StepFrames(500, 1 / 60, false));
await page.waitForTimeout(10);
const previewSkipped = await page.evaluate(() => {
  const T = window.Taierzhuang;
  const p = T.Debug.Preview();
  return { ...p, spoken: T.Debug.Spoken().filter((s) => s === "跟随通信排。").length,
    cutPlaying: T.Debug.Cutscene().playing };
});
Check("新版预览 Esc 跳过仍只交接一次并稳定收口",
  previewSkipped.done && previewSkipped.handoffCount === 1 && previewSkipped.spoken === 1
    && !previewSkipped.cutPlaying && previewSkipped.aiAlive === 0,
  `done=${previewSkipped.done} handoff=${previewSkipped.handoffCount} spoken=${previewSkipped.spoken}`);

await PreviewPage("?preview=CS_Chuchuan&quality=low&audio=0");
const silentLowStart = await page.evaluate(() => {
  const T = window.Taierzhuang;
  const p = T.Debug.Preview();
  T.Debug.SkipCutscene();
  return { p, audio: !!T.audio.ctx };
});
await page.evaluate(() => window.Taierzhuang.StepFrames(500, 1 / 60, false));
const silentLow = { ...silentLowStart,
  done: await page.evaluate(() => window.Taierzhuang.Debug.Preview().done) };
Check("低画质/无音频预览可起播并收口", silentLow.p.playing
  && !silentLow.audio && silentLow.done, JSON.stringify(silentLow));

await PreviewPage();
await page.evaluate(() => window.dispatchEvent(new Event("blur")));
await page.evaluate(() => window.Taierzhuang.StepFrames(500, 1 / 60, false));
const blurred = await page.evaluate(() => window.Taierzhuang.Debug.Preview());
Check("预览失焦走跳过收口且不启动旧战斗", blurred.done && !blurred.playing
  && blurred.aiAlive === 0, JSON.stringify(blurred));

// ---------------------------------------------------------------------------
// 12) 主菜单 → 场景编辑器 → 关卡切片
//
// 这条专门锁住一个容易被 menu=0 冒烟漏掉的路径：主菜单的活场景有自己的
// 相机循环。若菜单没有在场景编辑器接管时退出，点切片后会继续显示菜单原有场景，
// 并且新 field 完成后编辑层不会重新包 GroundHeight。
// ---------------------------------------------------------------------------
await page.goto(`http://127.0.0.1:${port}/Taierzhuang1938/?quality=low&scale=small`,
  { waitUntil: "load", timeout: 120000 });
await page.waitForFunction(() => window.Taierzhuang !== undefined
  && window.Taierzhuang.state.ready && window.Taierzhuang.state.menu, null, { timeout: 240000 });
const menuToEditor = await page.evaluate(() => {
  const T = window.Taierzhuang;
  // 主菜单会把编辑器根节点隐藏；走真实的编辑器打开入口后，场景工具必须先收起它。
  T.editor.Open("scene");
  return {
    menu: T.state.menu,
    menuVisible: !document.getElementById("menu").classList.contains("off"),
    editor: T.editor.ActiveId,
    capturing: T.editor.Capturing,
  };
});
Check("从主菜单打开场景编辑器会交还菜单相机",
  !menuToEditor.menu && !menuToEditor.menuVisible && menuToEditor.editor === "scene"
    && menuToEditor.capturing, JSON.stringify(menuToEditor));

const prologueRow = await page.evaluate(() => {
  const active = window.Taierzhuang.editor.active;
  let requested = false;
  // 不在这一条真的重载页面；替身只验证列表项会走独立的新版序章入口，
  // 而不是误落到 L0_界河。真正预览页的完整起播与收口已在第 9 节验证。
  active.host.game.OpenProloguePreview = () => { requested = true; };
  const rows = [...active.levelList.root.children];
  const prologue = rows.find((row) => row.textContent.includes("序章 · 出川（车厢）"));
  const beishahe = rows.find((row) => row.textContent.includes("北沙河 · 入城"));
  prologue?.click();
  // 走 ListBox 行的真实 click，不直接调 JumpToLevel，确保 UI 选关链路也在测试内。
  beishahe?.click();
  return { requested, present: !!prologue, battleRowPresent: !!beishahe };
});
Check("场景编辑器列出新版车厢序章并走独立入口",
  prologueRow.present && prologueRow.requested && prologueRow.battleRowPresent,
  JSON.stringify(prologueRow));
await page.waitForFunction(() => {
  const T = window.Taierzhuang;
  return T.state.ready && T.state.builtPhase === 1 && T.editor.active
    && T.editor.active.groundPatched === T.battlefield;
}, null, { timeout: 240000 });
const menuSlice = await page.evaluate(() => {
  const T = window.Taierzhuang;
  return {
    id: T.Debug.Level().id,
    built: T.state.builtPhase,
    menu: T.state.menu,
    bounds: T.battlefield.bounds,
    expected: { minX: -620, maxX: -230, minZ: -250, maxZ: 210 },
    patched: !!T.battlefield.__editorBaseGroundHeight,
  };
});
Check("主菜单打开的场景关卡编辑器能切到所选关卡切片",
  menuSlice.id === "L1_Beishahe" && menuSlice.built === 1 && !menuSlice.menu
    && JSON.stringify(menuSlice.bounds) === JSON.stringify(menuSlice.expected) && menuSlice.patched,
  JSON.stringify(menuSlice));
await page.evaluate(() => window.Taierzhuang.editor.Close());
const returnedToMenu = await page.evaluate(() => ({
  menu: window.Taierzhuang.state.menu,
  visible: !document.getElementById("menu").classList.contains("off"),
}));
Check("关闭场景编辑器后回到原菜单层", returnedToMenu.menu && returnedToMenu.visible,
  JSON.stringify(returnedToMenu));

// ===========================================================================
// 11) 采样点编辑器：装位姿 → 取当前相机回写 → 导出 → 关掉把相机还干净
// ---------------------------------------------------------------------------
// 出图脚本（Script_SamplePointShot）走的就是这条 ApplyPointById，所以这一节
// 同时是「记录基线拍出来的画面对不对」的守卫：位姿在这里装错，八十多张图全错。
await page.evaluate(() => window.Taierzhuang.Debug.OpenEditor("samplePoints"));
await Step(6);
const sample = await page.evaluate(() => {
  const T = window.Taierzhuang;
  const tool = T.editor.active;
  // 换切片要十几秒；冒烟只挑本切片里的点位，不让面板去切关。
  tool.followPhase = false;
  const saved = { fov: T.editor.flycam.saved.fov, far: T.editor.flycam.saved.far };
  const point = tool.Points().find((p) => p.phase === T.state.builtPhase);
  const pose = tool.ApplyPointById(point.id);
  const applied = {
    x: +T.camera.position.x.toFixed(2), y: +T.camera.position.y.toFixed(2),
    z: +T.camera.position.z.toFixed(2), yaw: +T.editor.flycam.yaw.toFixed(4),
  };
  // 「取当前相机」：先把镜头挪开，再摁回写，看点位是不是真的跟着镜头走
  T.camera.position.x += 7;
  T.editor.flycam.yaw = 1.234;
  tool.CaptureFromCamera();
  const after = tool.Points().find((p) => p.id === point.id);
  tool.Export("json");
  let exported = null;
  try { exported = JSON.parse(tool.io.value); } catch (error) { exported = null; }
  return {
    id: point.id, count: tool.Points().length, pose, applied, saved,
    captured: { x: after.x, yaw: after.yaw },
    exported: Array.isArray(exported) ? exported.length : -1,
    sections: [...tool.panel.root.querySelectorAll(".edSection > .h")]
      .map((node) => node.textContent),
  };
});
Check("采样点编辑器把表里的位姿原样装到相机上",
  sample.count > 40 && sample.applied.x === +sample.pose.x.toFixed(2)
    && sample.applied.z === +sample.pose.z.toFixed(2)
    && Math.abs(sample.applied.y - sample.pose.y) < 0.01
    && Math.abs(sample.applied.yaw - sample.pose.yaw) < 0.001,
  JSON.stringify({ id: sample.id, count: sample.count, applied: sample.applied }));
Check("「取当前相机」把飞到的位置与朝向写回点位",
  Math.abs(sample.captured.x - (sample.pose.x + 7)) < 0.02
    && Math.abs(sample.captured.yaw - 1.234) < 0.001, JSON.stringify(sample.captured));
Check("采样点编辑器导出的 JSON 是完整一份点位表",
  sample.exported === sample.count, `导出 ${sample.exported} / 表内 ${sample.count}`);
Check("采样点编辑器面板分节齐全",
  ["点位", "位姿", "增删", "取证", "导出 / 导入"].every((h) => sample.sections.includes(h)),
  sample.sections.join(" / "));
await page.evaluate(() => window.Taierzhuang.editor.Close());
await Step(4);
const sampleRestored = await page.evaluate(() => ({
  active: window.Taierzhuang.editor.ActiveId,
  fov: window.Taierzhuang.camera.fov,
  far: window.Taierzhuang.camera.far,
  fly: window.Taierzhuang.editor.flycam.Active,
}));
Check("关闭采样点编辑器后相机投影还原",
  !sampleRestored.active && !sampleRestored.fly
    && Math.abs(sampleRestored.fov - sample.saved.fov) < 0.01
    && Math.abs(sampleRestored.far - sample.saved.far) < 0.01,
  JSON.stringify(sampleRestored));

// ===========================================================================
await browser.close();
server.close();

const failed = results.filter((r) => !r.ok).length;
if (errors.length) {
  console.log(`\n运行期报错 ${errors.length} 条：`);
  for (const e of errors.slice(0, 8)) console.log(`  ${e}`);
}
console.log(failed === 0 && errors.length === 0
  ? `\n编辑器冒烟全过（${results.length} 项）。`
  : `\n编辑器冒烟失败：${failed} 项断言 + ${errors.length} 条报错。`);
process.exit(failed === 0 && errors.length === 0 ? 0 : 1);
