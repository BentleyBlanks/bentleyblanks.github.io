// 《台儿庄：血战滕县》编辑器套件冒烟：真浏览器里把九个编辑器一个个打开、用一遍、关掉。
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
import { TextureCatalog } from "./Script_TextureImportRules.mjs";

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

/**
 * 高级工具是 Unity 式菜单栏：工具条目藏在下拉里，先点它所在的菜单再点条目
 * （菜单 id 记在条目的 data-group 上）。没开高级工具时先按 ` 打开。
 */
async function ClickTool(id) {
  if (!(await page.evaluate(() => window.Taierzhuang.editor.panelOpen))) await page.evaluate(() => window.Taierzhuang.editor.TogglePanel(true));
  const group = await page.getAttribute(`#edRoot [data-editor="${id}"]`, "data-group");
  await page.click(`#edRoot .edMenu[data-menu="${group}"] > .edMenuTitle`);
  await page.click(`#edRoot [data-editor="${id}"]`);
}

/** 玩家设置页（画面 / 声音 / 操作）不在高级工具里：走 Script_SettingsHost（菜单「设置」点的也是它）。 */
async function OpenSettings(id) {
  // 只开不取回：Open 返回的是活的设置页实例，带回 node 会把整个游戏序列化撑爆管道
  await page.evaluate((id) => { window.Taierzhuang.settings.Open(id); }, id);
}

/** Debug工具（Debug Rendering 等叠加层、FPS）的开关在菜单 设置 → Debug工具；这里走它背后的同一个接口。 */
async function ToggleDebugTool(id) {
  return page.evaluate((id) => window.Taierzhuang.Debug.ToggleDebugTool(id), id);
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
// **在城里那几关跑，不在序·界河（phase 0）跑**：界河是独立场景（JieheField），没有 `.city`，
// 好几节取证（碰撞体、地面高程等）都按城里的 battlefield 结构读。
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
const gearPresentation = await page.evaluate(() => {
  const gear = document.querySelector(".edGear");
  const style = getComputedStyle(gear);
  return {
    text: gear.textContent,
    label: gear.getAttribute("aria-label"),
    width: gear.getBoundingClientRect().width,
    backgroundImage: style.backgroundImage,
  };
});
Check("右上入口改为同风格图标并保留无障碍名称",
  gearPresentation.text === "" && gearPresentation.label === "高级工具"
    && gearPresentation.width <= 42
    && gearPresentation.backgroundImage.includes("Icon_SettingsTools.png"),
  JSON.stringify(gearPresentation));

await page.click(".edGear");
const byGear = await page.evaluate(() => window.Taierzhuang.Debug.Editor().panelOpen);
Check("没拿指针锁时鼠标点齿轮能开", byGear);
await page.click(".edMenuExit");   // 收起来（开着时齿轮让位给菜单栏右端的 ×），下面走键盘那条

await page.click("#bootStart");
await Step(20);
const locked = await page.evaluate(() => window.Taierzhuang.Debug.PointerLock().locked);
await page.keyboard.press("Backquote");
const afterGear = await page.evaluate(() => {
  const T = window.Taierzhuang;
  return {
    capturing: T.Debug.Editor().capturing,
    panelOpen: T.Debug.Editor().panelOpen,
    entries: document.querySelectorAll("#edRoot .edMenuBar [data-editor]").length,
    menus: [...document.querySelectorAll("#edRoot .edMenuTitle")].map((el) => el.textContent),
    barVisible: !!document.querySelector("#edRoot .edMenuBar")?.getClientRects().length,
    squadMarch: !!document.querySelector('#edRoot .edMenuBar [data-editor="squadMarch"]'),
    facial: !!document.querySelector('#edRoot .edMenuBar [data-editor="facial"]'),
    textures: !!document.querySelector('#edRoot .edMenuBar [data-editor="textures"]'),
    sceneEditor: !!document.querySelector('#edRoot .edMenuBar [data-editor="sceneEditor"]'),
    orchestration: !!document.querySelector('#edRoot [data-editor="orchestration"]'),
    blockout: !!document.querySelector('#edRoot .edMenuBar [data-editor="blockout"]'),
    // 设置三页不在高级工具里；Debug工具在菜单栏右侧自己的下拉里（2026-10-22），不混进编辑器条目
    settingsInBar: ["graphics", "sound", "controls"].some((id) => document.querySelector(`#edRoot [data-editor="${id}"]`)),
    debugAsEditor: ["debugRendering", "profiler", "frameDebugger", "worldInfo", "playerState", "ai"]
      .some((id) => document.querySelector(`#edRoot [data-editor="${id}"]`)),
    debugMenu: [...document.querySelectorAll('#edRoot .edMenu[data-menu="debug"] [data-debug-tool]')].map((el) => el.dataset.debugTool),
    debugNextToVolume: document.querySelector('#edRoot .edMenu[data-menu="debug"]')?.parentElement?.nextElementSibling?.classList.contains("edVolume") ?? false,
    emptyInspector: !document.querySelector("#edRoot .edInspectorEmpty")?.hidden,
  };
});
Check("打游戏当中按 ` 弹出高级工具", afterGear.panelOpen && afterGear.capturing && afterGear.barVisible && afterGear.emptyInspector,
  `进游戏时指针锁=${locked}`);
// 菜单栏：游戏 + 六个工具菜单 + 右侧 Debug工具；十二个互斥编辑器 + 第一人称持枪移动检查（叠加层，2026-10-23）
// + 贴图管理 + 场景编辑器（独立窗口，2026-10-31 加）+ 白盒关卡编辑器（整页跳转入口）= 16 个条目（2026-10-31 删了场景关卡 / 地形 / 完整场景预览 / 采样点 / 可破坏场景 / 关卡编排；
// 出图机位 shotCamera 是不进菜单的测试工具，不计入）
Check("菜单栏列出全部编辑器入口", afterGear.entries === 16
  && afterGear.menus.join(",") === "游戏,场景,关卡,角色,武器,特效与声音,资产,Debug工具"
  && afterGear.squadMarch && afterGear.facial && afterGear.textures && afterGear.sceneEditor && !afterGear.orchestration && afterGear.blockout,
  `条目=${afterGear.entries}，菜单=${afterGear.menus.join("/")}，白盒关卡编辑器=${afterGear.blockout}`);
Check("设置三页不在高级工具里", !afterGear.settingsInBar);
Check("Debug工具七项在音量条旁的下拉里，不混进编辑器条目",
  !afterGear.debugAsEditor && afterGear.debugNextToVolume
  && afterGear.debugMenu.join(",") === "debugRendering,profiler,frameDebugger,worldInfo,playerState,ai,fps",
  `下拉=${afterGear.debugMenu.join("/")}，挨着音量=${afterGear.debugNextToVolume}`);
const fpsDefault = await page.evaluate(() => {
  const fps = document.querySelector(".hudFps");
  const rect = fps.getBoundingClientRect();
  const state = window.Taierzhuang.Debug.DebugTools().find((tool) => tool.id === "fps");
  return { hidden: fps.hidden, left: rect.left, top: rect.top, on: state?.on, available: state?.available };
});
Check("FPS 默认开启，Debug工具里的开关同步为开",
  !fpsDefault.hidden && fpsDefault.on === true && fpsDefault.available === true,
  JSON.stringify(fpsDefault));
const fpsHidden = await ToggleDebugTool("fps");
Check("Debug工具可隐藏 FPS 并同步状态",
  await page.evaluate(() => document.querySelector(".hudFps").hidden) && fpsHidden.find((tool) => tool.id === "fps").on === false,
  JSON.stringify(fpsHidden));
await ToggleDebugTool("fps");
await page.evaluate(() => window.Taierzhuang.editor.TogglePanel(false));
Check("Debug工具可恢复 FPS", await page.isVisible(".hudFps"));
await page.evaluate(() => window.Taierzhuang.editor.TogglePanel(true));

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

if(process.argv.includes('--launcher-only')){
  const editorBeforePopup = await page.evaluate(() => window.Taierzhuang.Debug.Editor());
  const popupReady = page.waitForEvent("popup");
  await ClickTool("textures"); const texturePopup = await popupReady;
  await texturePopup.waitForFunction(count => document.querySelectorAll(".asset").length === count, TextureCatalog().length, { timeout: 30000 });
  const editorAfterPopup = await page.evaluate(() => window.Taierzhuang.Debug.Editor());
  Check("贴图管理打开真实独立窗口", texturePopup.url().includes("TextureManager.html"));
  Check("独立窗口不改变当前编辑器状态", JSON.stringify(editorBeforePopup) === JSON.stringify(editorAfterPopup));
  const windows = page.context().pages().length;
  await ClickTool("textures");
  Check("再次点击聚焦原窗口", page.context().pages().length === windows && !texturePopup.isClosed());
  await page.click(".edMenuExit");
  Check("退出高级工具不关闭贴图窗口", !texturePopup.isClosed());
  await texturePopup.close();
  await browser.close();server.close();
  const failed=results.filter(r=>!r.ok);
  console.log(`Editor launcher: ${results.length-failed.length} passed, ${failed.length} failed, ${errors.length} errors`);
  process.exit(failed.length||errors.length?1:0);
}

// 菜单栏右端：× 只关当前工具（没开工具时藏起来），⏻（.edMenuExit）才退出高级工具（2026-10-22）
const closeIdle = await page.isVisible("#edRoot .edMenuCloseTool");
await ClickTool("assetStandards");
await Step(1);
const closeWithTool = await page.isVisible("#edRoot .edMenuCloseTool");
await page.click("#edRoot .edMenuCloseTool");
const afterCloseTool = await page.evaluate(() => ({
  panelOpen: window.Taierzhuang.Debug.Editor().panelOpen, active: window.Taierzhuang.Debug.Editor().active,
}));
Check("菜单栏 × 只关当前工具、留在高级工具里，没开工具时不显示",
  !closeIdle && closeWithTool && afterCloseTool.panelOpen && !afterCloseTool.active && !(await page.isVisible("#edRoot .edMenuCloseTool")),
  JSON.stringify({ closeIdle, closeWithTool, ...afterCloseTool }));
Check("退出按钮是图标、标着「退出高级工具」",
  await page.evaluate(() => {
    const exit = document.querySelector("#edRoot .edMenuExit");
    return !!exit?.querySelector("svg") && exit.getAttribute("aria-label") === "退出高级工具" && exit.textContent.trim() === "";
  }));

// 资产规范是构件库之外的独立只读分类。它不摆模型，但必须把原始/实际/限制/贴图
// 与七类入口真实摆出来；只注册一个空按钮不算完成。
await ClickTool("assetStandards");
await Step(2);
const assetStandards = await page.evaluate(() => {
  const panel = document.querySelector(".edPanel.assetStandards");
  const headers = [...panel.querySelectorAll("th")].map((el) => el.textContent.trim());
  const chips = [...panel.querySelectorAll(".edChip")].map((el) => el.textContent.trim());
  const text = panel.textContent;
  return {
    active: window.Taierzhuang.Debug.Editor().active,
    rows: panel.querySelectorAll("tbody tr").length,
    headers, chips, text,
    bad: panel.querySelectorAll("td.status.bad").length,
  };
});
Check("资产规范是独立编辑器入口", assetStandards.active === "assetStandards");
Check("资产规范有七个分类", assetStandards.chips.length === 7
  && ["枪械", "架设 / 炮械", "刀剑 / 刺刀", "战车", "程序化 TZM", "外部 GLB", "贴图规范"]
    .every((label) => assetStandards.chips.includes(label)), assetStandards.chips.join(" / "));
// 枪械分类现有 7 行（P38 / K98k / MK98 栓动步枪按考据删除、C96 按用户要求移除后）。
Check("资产表展示原始/实际/限制/降幅/贴图", assetStandards.rows >= 7
  && ["原始面数", "实际面数", "限制 / 目标", "面数降幅", "自带贴图", "游戏内贴图"]
    .every((label) => assetStandards.headers.includes(label)));
Check("枪械表显示捷克式原始 7,811 与实际 7,781", assetStandards.text.includes("7,811")
  && assetStandards.text.includes("7,781"));
Check("资产规范当前没有不合规红项", assetStandards.bad === 0, `红项=${assetStandards.bad}`);
await ClickTool("assetStandards");

// Debug Rendering 是观察工具，不可被互斥编辑器的切换顺手销毁。它要真的把
// NormalDepth 靶送到屏幕，不能只是 DOM 面板里一串假的状态文字。
await ToggleDebugTool("debugRendering");
await Step(6);
const debugRendering = await page.evaluate(() => {
  const T = window.Taierzhuang;
  const panel = T.editor.overlays.get("debugRendering");
  const characterMaterials = new Set();
  const characterPbr = {
    meshes: 0, materials: 0, configured: true, injected: true,
    nonMetal: true, roughEnough: true, shadowReady: true,
  };
  for (const soldier of T.ai.soldiers) {
    soldier.actor?.characterRig?.root?.traverse((object) => {
      if (!object.isMesh || object.userData.characterPbrSurface !== true) return;
      characterPbr.meshes += 1;
      characterPbr.shadowReady &&= object.userData.actorOriginalCastShadow === true
        && object.receiveShadow === true;
      for (const material of (Array.isArray(object.material) ? object.material : [object.material])) {
        if (!material?.isMeshStandardMaterial && !material?.isMeshPhysicalMaterial) continue;
        characterMaterials.add(material);
      }
    });
  }
  for (const material of characterMaterials) {
    characterPbr.configured &&= material.userData.externalPbrConfigured === true;
    characterPbr.injected &&= material.userData.indirectLightingInjected === true;
    characterPbr.nonMetal &&= material.metalness === 0;
    characterPbr.roughEnough &&= material.roughness >= 0.58;
  }
  characterPbr.materials = characterMaterials.size;
  // 第一人称（手 / 袖 / 枪 / 刺刀 / 手雷）与人物同一条规矩，但坏法不一样：
  //   · 双臂与手雷是外来 GLB，材质从来没走过 ConfigureExternalPbr —— glTF 缺省
  //     metallicFactor=1 让一双手一直在按纯金属渲，而且假彩色一帧画不到它们；
  //   · 整棵树以前调的是 MarkNoPrepass，那只是"不换材质"不是"不进预通道"，
  //     枪把自己的光照颜色当法线写进 rtNormalDepth，GBuffer 组一团噪声。
  // 两条链各自的证据：foregroundPrepass 标记 + 材质注入位。
  const firstPerson = {
    meshes: 0, prepass: 0, glbSurfaces: 0, materials: 0,
    injected: true, nonMetal: true, translucentOut: true,
  };
  const firstPersonMaterials = new Set();
  T.viewmodel?.root?.traverse((object) => {
    if (!object.isMesh || !object.material) return;
    const list = Array.isArray(object.material) ? object.material : [object.material];
    if (list.some((material) => material?.transparent)) {
      // 半透明件（枪口焰）按约定整只藏出预通道：它没有可用的法线
      firstPerson.translucentOut &&= object.userData.skipNormalDepth === true;
      return;
    }
    firstPerson.meshes += 1;
    if (object.userData.foregroundPrepass === true) firstPerson.prepass += 1;
    if (object.userData.firstPersonPbrSurface === true) firstPerson.glbSurfaces += 1;
    for (const material of list) {
      if (!material?.isMeshStandardMaterial && !material?.isMeshPhysicalMaterial) continue;
      firstPersonMaterials.add(material);
    }
  });
  for (const material of firstPersonMaterials) {
    firstPerson.injected &&= material.userData.indirectLightingInjected === true;
    if (material.userData.externalPbrConfigured === true) {
      firstPerson.nonMetal &&= material.metalness === 0;
    }
  }
  firstPerson.materials = firstPersonMaterials.size;
  // 屏幕真的被写了没有。**只比 uniform 上的纹理引用是不够的** ——
  // 这一趟的展示 pass 曾经因为一个 GLSL ES 3.00 保留字（变量名叫 sample）整段
  // 编译不过：uniform 全接对了，three 却什么都不画，九个视图在屏幕上一律纯黑。
  // 那次事故里下面那张 visible 表全绿，人眼看到的却是黑屏。所以要读回像素。
  const canvas = document.querySelector("canvas");
  const probe = document.createElement("canvas");
  probe.width = 48; probe.height = 30;
  const ctx = probe.getContext("2d");
  const Grab = () => {
    ctx.drawImage(canvas, 0, 0, probe.width, probe.height);
    return ctx.getImageData(0, 0, probe.width, probe.height).data;
  };
  const Brightest = () => {
    const data = Grab();
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
    diffuseLighting: 10, specularLighting: 11, reflection: 12, indirectLighting: 13,
  };
  for (const view of ["normal", "depth", "motionVector", "ao", "aoBlur", "bloomExtract", "bloom", "fog", "dof", "giIrradiance", "giDistance",
    "baseColor", "roughness", "metalness", "shadow", "diffuseLighting", "specularLighting", "reflection", "indirectLighting", "giWorld", "giConfidence"]) {
    panel.SetView(view);
    T.StepFrames(2);
    const source = T.post._GetDebugSource();
    let expected = T.post.targets.hdr.texture;
    if (["normal", "depth", "motionVector", "fog", "dof"].includes(view)) expected = T.post.targets.normalDepth.texture;
    else if (view === "ao") expected = T.post.targets.ao.texture;
    else if (view === "aoBlur") expected = T.post.targets.aoBlur.texture;
    else if (view === "bloomExtract") expected = T.post.targets.bright.texture;
    else if (view === "bloom") expected = T.post.BloomTarget.texture;
    else if (view === "giIrradiance") expected = T.editor.host.game.gi.irradiance[T.editor.host.game.gi.pingPong].texture;
    else if (view === "giDistance") expected = T.editor.host.game.gi.distanceMoments[T.editor.host.game.gi.pingPong].texture;
    visible[view] = source?.texture === expected;
    matMode[view] = T.library.gi ? T.library.gi.debugView.value === (materialViews[view] || 0) : false;
    lit[view] = Brightest();
    // 一次只许亮一格：四组 chips 是四个独立控件，选中态必须集中同步，
    // 否则面板上会同时亮着四个视图，读者判断不出送屏的到底是哪一张。
    // 只数视图格（.edViewChips）：着色模式那一排是另一个选择，永远亮着自己那一格
    chipsOn[view] = document.querySelectorAll(".edPanel.debugRendering .edViewChips .edChip.on").length;
  }
  // 「接线对了」不等于「屏幕上看得见」：第一人称以前在 GBuffer 组里就是一片空洞
  // （双臂 skipNormalDepth）或一团噪声（枪写自己的光照颜色）。所以这里真的把枪藏了
  // 再拍一次，只认像素差。TAA 会逐帧抖动，先关掉，量完装回去。
  const taaWas = T.post.taaEnabled;
  T.post.SetTaaEnabled(false);
  const foregroundPixels = {};
  for (const view of ["normal", "depth", "baseColor", "metalness"]) {
    panel.SetView(view);
    T.StepFrames(3);
    const shown = Grab();
    T.viewmodel.root.visible = false;
    T.StepFrames(3);
    const hidden = Grab();
    T.viewmodel.root.visible = true;
    T.StepFrames(3);
    let changed = 0;
    for (let i = 0; i < shown.length; i += 4) {
      if (Math.abs(shown[i] - hidden[i]) + Math.abs(shown[i + 1] - hidden[i + 1])
        + Math.abs(shown[i + 2] - hidden[i + 2]) > 24) changed += 1;
    }
    foregroundPixels[view] = changed;
  }
  // 【2026-10-12】金属度视图另算：手、袖子、木枪托都是非金属（0），和它们背后的地面一样是黑的，
  // 藏不藏第一人称那几块本来就一样；真能变的只有枪上的钢件（汉阳造钢件 metalness 0.62，
  // 48×30 上只占 1% 上下，旧的「每个视图都 >2%」对这一格是拿木头和手去要求金属度）。
  // 所以这一格改成逐像素对账：在法线 / 深度视图里量整把枪加双手的剪影，再把钢件藏掉量一次，
  // 只在前者里、不在后者里的像素就是「露在外面、背后是地面的钢件」；要求金属度视图里变了的像素
  // 盖住其中大部分、且几乎都落在整个剪影里（不是噪声）。只藏木头和手去量会把被手挡住的机匣也算进来。
  // 钢件细（枪管、机柄），48×30 上一根枪管只剩几个半格；这一格用 160×90 的取样图量。
  const fine = document.createElement("canvas");
  fine.width = 160; fine.height = 90;
  const fineCtx = fine.getContext("2d");
  const GrabFine = () => {
    fineCtx.drawImage(canvas, 0, 0, fine.width, fine.height);
    return fineCtx.getImageData(0, 0, fine.width, fine.height).data;
  };
  const Mask = (view) => {
    panel.SetView(view);
    T.StepFrames(3);
    const shown = GrabFine();
    T.viewmodel.root.visible = false;
    T.StepFrames(3);
    const hidden = GrabFine();
    T.viewmodel.root.visible = true;
    T.StepFrames(3);
    const mask = new Uint8Array(shown.length / 4);
    for (let i = 0; i < shown.length; i += 4) {
      mask[i / 4] = Math.abs(shown[i] - hidden[i]) + Math.abs(shown[i + 1] - hidden[i + 1])
        + Math.abs(shown[i + 2] - hidden[i + 2]) > 24 ? 1 : 0;
    }
    return mask;
  };
  const Union = (a, b) => a.map((v, i) => v | b[i]);
  const Count = (m) => m.reduce((n, v) => n + v, 0);
  const Both = (a, b) => Count(a.map((v, i) => v & b[i]));
  const metalMeshes = [];
  T.viewmodel.root.traverse((object) => {
    if (!object.isMesh || !object.visible || !object.material) return;
    const list = Array.isArray(object.material) ? object.material : [object.material];
    if (list.some((material) => material?.metalness > 0)) metalMeshes.push(object);
  });
  const metalMask = Mask("metalness");
  const silhouette = Union(Mask("normal"), Mask("depth"));
  for (const object of metalMeshes) object.visible = false;
  const withoutSteel = Union(Mask("normal"), Mask("depth"));
  for (const object of metalMeshes) object.visible = true;
  const steel = silhouette.map((v, i) => v & (1 - withoutSteel[i]));
  const metalnessCheck = {
    pixels: fine.width * fine.height, changed: Count(metalMask), steel: Count(steel), silhouette: Count(silhouette),
    coversSteel: Count(steel) ? +(Both(metalMask, steel) / Count(steel)).toFixed(3) : 0,
    insideSilhouette: Count(metalMask) ? +(Both(metalMask, silhouette) / Count(metalMask)).toFixed(3) : 0,
  };
  T.post.SetTaaEnabled(taaWas);
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
    visible, lit, chipsOn, matMode, characterPbr, firstPerson, foregroundPixels, metalnessCheck,
    probePixels: probe.width * probe.height,
  };
});
Check("Debug Rendering：法线 GBuffer 可视化已接入后处理", debugRendering.editor.debugRendering
  && debugRendering.panel && debugRendering.view === "normal" && debugRendering.target
  && Object.values(debugRendering.visible).every(Boolean),
JSON.stringify({ ...debugRendering, lit: undefined, chipsOn: undefined }));
Check("Debug Rendering：材质假彩色编号随视图同步、离开即归零",
  Object.values(debugRendering.matMode).every(Boolean) && debugRendering.matReset,
  JSON.stringify({ matMode: debugRendering.matMode, matReset: debugRendering.matReset }));
Check("Debug Rendering：第一人称手/枪进前景预通道且材质已注入",
  debugRendering.firstPerson.meshes > 0
  && debugRendering.firstPerson.prepass === debugRendering.firstPerson.meshes
  && debugRendering.firstPerson.glbSurfaces > 0
  && debugRendering.firstPerson.materials > 0
  && debugRendering.firstPerson.injected && debugRendering.firstPerson.nonMetal
  && debugRendering.firstPerson.translucentOut,
  JSON.stringify(debugRendering.firstPerson));
// 48x30 的取样图上，屏幕下方那支枪加两只手怎么也该占到百分之几。
// 金属度那一格：手和木头本来就是黑的，只对钢件（见上面 metalnessCheck 的注释）。2026-10-12 phase 5 开局实测 160×90 上
// 露在地面前的钢件 47 格（0.33%）、金属度变了 120 格（0.83%），盖住钢件 100%、全在剪影里；门槛取 0.1% / 0.3% / 80% / 90%。
Check("Debug Rendering：藏掉第一人称，四个视图的画面真的变了",
  ["normal", "depth", "baseColor"].every((view) => debugRendering.foregroundPixels[view] > debugRendering.probePixels * 0.02)
    && debugRendering.metalnessCheck.steel >= debugRendering.metalnessCheck.pixels * 0.001
    && debugRendering.metalnessCheck.changed >= debugRendering.metalnessCheck.pixels * 0.003
    && debugRendering.metalnessCheck.coversSteel >= 0.8 && debugRendering.metalnessCheck.insideSilhouette >= 0.9,
  JSON.stringify({ ...debugRendering.foregroundPixels, metalness: debugRendering.metalnessCheck }));
Check("Debug Rendering：GLB 角色接入 PBR、材质视图与阴影链",
  debugRendering.characterPbr.meshes > 0 && debugRendering.characterPbr.materials > 0
  && debugRendering.characterPbr.configured && debugRendering.characterPbr.injected
  && debugRendering.characterPbr.nonMetal && debugRendering.characterPbr.roughEnough
  && debugRendering.characterPbr.shadowReady,
  JSON.stringify(debugRendering.characterPbr));
// GI 那两张在探针体关着时画的是"不可用"斜纹（也是有颜色的），所以同一条阈值够用。
// 金属度除外：这一关的世界金属度几乎处处为 0，取景框里没有天空时全屏合法地黑。
Check("Debug Rendering：每个视图都真的画到了屏幕上（不是黑屏）",
  Object.entries(debugRendering.lit).every(([view, v]) => view === "metalness" || v > 8),
  JSON.stringify(debugRendering.lit));
Check("Debug Rendering：四组 chips 只亮当前视图那一格",
  Object.values(debugRendering.chipsOn).every((n) => n === 1), JSON.stringify(debugRendering.chipsOn));

// 关面板回去打仗（TogglePanel(false)）**不收** Debug Rendering：运行时才复现的渲染
// bug 只能开着调试视图边打边看（static keepOnClose）。回来时它还开着、送屏的仍是
// 同一张靶、材质假彩色 uniform 也没被归零 —— 而且玩法真的在跑（capturing=false）。
await page.evaluate(() => window.Taierzhuang.editor.SetOverlayView?.("debugRendering", "baseColor")
  ?? window.Taierzhuang.editor.overlays.get("debugRendering").SetView("baseColor"));
await Step(2);
const debugKeepOnClose = await page.evaluate(() => {
  const T = window.Taierzhuang;
  T.editor.TogglePanel(false);
  T.StepFrames(6);
  const inGame = {
    ...T.Debug.Editor(),
    matMode: T.library.gi ? T.library.gi.debugView.value : -1,
    panel: !!document.querySelector(".edPanel.debugRendering"),
  };
  T.editor.TogglePanel(true);
  return inGame;
});
Check("关面板回去打仗时 Debug Rendering 保持开着", !debugKeepOnClose.capturing
  && !debugKeepOnClose.panelOpen && debugKeepOnClose.debugRendering
  && debugKeepOnClose.debugView === "baseColor" && debugKeepOnClose.matMode === 6
  && debugKeepOnClose.panel,
JSON.stringify(debugKeepOnClose));
await page.evaluate(() => window.Taierzhuang.editor.overlays.get("debugRendering").SetView("normal"));
await Step(2);

// 着色模式与物理碰撞体：两样改的都是「整幅画怎么画」，所以只认像素。
//   · 着色线框 = 正片上叠边线：与正片比要有一片像素变了、又不能是整屏都变；
//   · 线框 = 深灰底 + 亮线、hdr 靶直通送屏：与正片比几乎全屏都变，且 GBuffer 视图不受影响；
//   · 碰撞体线框 = Post 的调试叠加层：Rapier 里一万多只静态盒、几十只角色胶囊，屏幕上要有像素变化，
//     计数要与物理世界对得上；「透视」（关深度测试）要比贴面模式变得更多；
//     相机站在里面的那只角色胶囊不画（否则屏幕正中一条竖线，像个坏掉的准星）。
const debugShading = await page.evaluate(() => {
  const T = window.Taierzhuang;
  const panel = T.editor.overlays.get("debugRendering");
  const canvas = document.querySelector("canvas");
  const probe = document.createElement("canvas");
  probe.width = 96; probe.height = 54;
  const ctx = probe.getContext("2d", { willReadFrequently: true });
  const Grab = () => {
    T.StepFrames(3);
    ctx.drawImage(canvas, 0, 0, probe.width, probe.height);
    return ctx.getImageData(0, 0, probe.width, probe.height).data;
  };
  const Diff = (a, b) => {
    let changed = 0;
    for (let i = 0; i < a.length; i += 4) {
      if (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]) > 24) changed += 1;
    }
    return changed / (a.length / 4);
  };
  const taaWas = T.post.taaEnabled;
  T.post.SetTaaEnabled(false);
  panel.SetView("final");
  panel.SetShading("shaded");
  const base = Grab();
  const out = {};
  // **漂移对照**：什么都不做，走与下面 round-trip 一样多的帧。
  // 这一关的世界是活的（AI 在走、烟在飘、火在闪），而 round-trip 要花十几帧；
  // 「切回着色后画面一致」只能是「不比场景自己漂的多」，钉一个绝对阈值的话
  // 哪天 AI 走得勤一点就翻红。2026-09 集成期实测：漂移 0.006，round-trip 0.008。
  Grab(); Grab();
  T.StepFrames(2);
  out.drift = Diff(base, Grab());
  // round-trip 的基准紧挨着它自己取，别拿二十帧前那一张当参照
  const baseRound = Grab();
  panel.SetShading("shadedWireframe");
  out.shadedWireframe = { mode: T.post.GetShadingMode(), diff: Diff(baseRound, Grab()) };
  panel.SetShading("wireframe");
  const wire = Grab();
  const source = T.post._GetDebugSource();
  out.wireframe = {
    mode: T.post.GetShadingMode(), diff: Diff(baseRound, wire),
    passThrough: source?.texture === T.post.targets.hdr.texture && source?.mode === 5,
  };
  panel.SetView("normal");
  T.StepFrames(2);
  out.wireframeNormalView = T.post._GetDebugSource()?.texture === T.post.targets.normalDepth.texture;
  panel.SetView("final");
  panel.SetShading("shaded");
  out.backToShaded = { mode: T.post.GetShadingMode(), diff: Diff(baseRound, Grab()) };
  out.shadingChipsOn = document.querySelectorAll(".edPanel.debugRendering .edShadingChips .edChip.on").length;

  panel.SetColliders(true);
  const withColliders = Grab();
  const stats = { ...panel.colliders.stats };
  const physicsStats = T.physics.Stats();
  out.colliders = {
    overlays: T.post.debugOverlays.size, diff: Diff(base, withColliders), ...stats,
    physicsSolids: physicsStats.solids, physicsCharacters: physicsStats.characters,
    // 玩家自己的胶囊不画：一只胶囊 68 条线，动态层至少少这一只
    playerSkipped: stats.dynamicSegments <= (stats.character - 1) * 68 + stats.dynamic * 68,
  };
  panel.SetColliderXray(true);
  out.xrayDiff = Diff(base, Grab());
  panel.SetColliderXray(false);
  T.post.SetTaaEnabled(taaWas);
  // 留着碰撞体层开着、视图回到法线：下面「切换编辑器时叠加层还在」那一条接着用，
  // 末尾「关掉之后有没有还干净」那一节要验的正是 Exit 把它们摘干净
  panel.SetView("normal");
  T.StepFrames(2);
  return out;
});
Check("Debug Rendering：着色线框在正片上叠出边线（像素变了一片、不是整屏）",
  debugShading.shadedWireframe.mode === "shadedWireframe"
  && debugShading.shadedWireframe.diff > 0.02 && debugShading.shadedWireframe.diff < 0.6,
  JSON.stringify(debugShading.shadedWireframe));
Check("Debug Rendering：线框模式换成深灰底亮线、hdr 靶直通送屏，GBuffer 视图不受影响",
  debugShading.wireframe.mode === "wireframe" && debugShading.wireframe.diff > 0.8
  && debugShading.wireframe.passThrough && debugShading.wireframeNormalView,
  JSON.stringify({ ...debugShading.wireframe, normalView: debugShading.wireframeNormalView }));
// 阈值 = max(1%, 场景自身漂移 × 2)：绝对下限一个字没松，另加一条相对界，
// 免得「世界活着」被当成「画面没还原」。切着色模式对测光是**硬切**
// （线框那一档整幅画换成深灰底 + 亮线），`PostPipeline.SetShadingMode` 因此
// 调 exposurePass.RequestReset() —— 不这么做的话自动曝光要按适应时间常数
// 爬回来，这一条会量到 0.038（2026-09 集成期实测，修好之后 0.008）。
Check("Debug Rendering：切回着色后画面与原正片一致、着色 chips 只亮一格",
  debugShading.backToShaded.mode === "shaded"
  && debugShading.backToShaded.diff <= Math.max(0.01, debugShading.drift * 2)
  && debugShading.shadingChipsOn === 1,
  JSON.stringify({ ...debugShading.backToShaded, drift: debugShading.drift,
    chips: debugShading.shadingChipsOn }));
Check("Debug Rendering：碰撞体线框按 Rapier 世界的形状画到屏幕上（静态盒全数、角色胶囊、玩家自己的不画）",
  debugShading.colliders.overlays === 1 && debugShading.colliders.diff > 0.003
  && debugShading.colliders.unsupported === 0
  && debugShading.colliders.solid + debugShading.colliders.terrain >= debugShading.colliders.physicsSolids
  && debugShading.colliders.solid > 1000 && debugShading.colliders.staticSegments > 0
  && debugShading.colliders.character === debugShading.colliders.physicsCharacters
  && debugShading.colliders.character >= 2 && debugShading.colliders.playerSkipped,
  JSON.stringify(debugShading.colliders));
Check("Debug Rendering：透视（关深度测试）比贴面模式画出更多碰撞体",
  debugShading.xrayDiff > debugShading.colliders.diff,
  `透视=${debugShading.xrayDiff.toFixed(4)} 贴面=${debugShading.colliders.diff.toFixed(4)}`);

// 点击 range 后浏览器会把键盘焦点留在滑杆上。编辑器不能因为这个焦点
// 就不再收到 WASD：自由飞行类工具（这里用场景样条PCG）的飞行镜头仍应继续移动。
await ClickTool("splines");
await Step(4);
const debugOverlayPersists = await page.evaluate(() => window.Taierzhuang.Debug.Editor());
Check("打开其它编辑器时 Debug Rendering 保持叠加", debugOverlayPersists.active === "splines"
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

await page.evaluate(() => window.Taierzhuang.editor.Close());
await Step(3);

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
  // 老流程里下面这句 TogglePanel(false) 顺手把 Debug Rendering 收了；它现在
  // keepOnClose，得显式收掉 —— 后面的 `.edPanel.work` 选择器才指向互斥编辑器的面板
  T.editor.CloseOverlay("debugRendering");
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
await OpenSettings("controls");
await Step(3);
const controls = await page.evaluate(() => ({
  id: window.Taierzhuang.settings.ActiveId,
  title: document.querySelector(".edPanel.work .edTitle")?.textContent || "",
  rows: document.querySelectorAll(".edControlRow").length,
  text: document.querySelector(".edPanel.work")?.textContent || "",
}));
Check("操作面板：列出真实快捷键与情境动作",
  controls.id === "controls" && controls.rows >= 16
  && controls.text.includes("拾枪、换枪") && controls.text.includes("包扎止血"),
  `${controls.title} · ${controls.rows} 行`);

await OpenSettings("graphics");
await Step(6);
const gfx = await page.evaluate(() => {
  const T = window.Taierzhuang;
  const before = { w: T.post.width, h: T.post.height, shadow: T.renderer.shadowMap.enabled };
  const g = T.settings.active;
  // This assertion measures the manual scale itself. Background GPU load may
  // activate the independent automatic multiplier (e.g. .6*.92), so disable it.
  g.gfx.autoQuality = false;
  g.gfx.renderScale = 0.6;
  g.gfx.bloom = 0.25;
  g.gfx.fov = 62;
  g.Apply();
  window.Taierzhuang.StepFrames(4);
  const after = { w: T.post.width, h: T.post.height,
    outW: T.post.outputWidth, outH: T.post.outputHeight, taau: !!T.post.taauActive };
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem("tengxian1938_graphics_v1")); } catch (e) { saved = null; }
  return { id: T.settings.ActiveId, before, after, saved, fov: T.camera.fov,
    inner: [window.innerWidth, window.innerHeight] };
});
// 出厂 renderScale 跟画质档走（TAAU：high 是 0.8），所以不能拿「比出厂小 30%」当判据 ——
// 直接对 0.6 × 窗口宽这个**绝对值**，比原来的相对判据更强。
// 输出靶必须仍是满分辨率：TAAU 把画面解算回窗口大小，末趟不再拉伸。
Check("画质面板：渲染分辨率真的改到合成靶上（内部 0.6×，输出仍满分辨率）",
  gfx.id === "graphics"
  && Math.abs(gfx.after.w - Math.round(gfx.inner[0] * 0.6)) <= 1
  && gfx.after.outW === gfx.inner[0],
  `${gfx.before.w}×${gfx.before.h} → ${gfx.after.w}×${gfx.after.h}`
  + ` ｜ 输出 ${gfx.after.outW}×${gfx.after.outH} TAAU=${gfx.after.taau}`);
Check("画质面板：设置落盘",
  !!gfx.saved && gfx.saved.renderScale === 0.6 && gfx.saved.bloom === 0.25,
  gfx.saved ? `renderScale=${gfx.saved.renderScale} bloom=${gfx.saved.bloom}` : "没存上");

// TAA 开关：**点真按钮**，不是直接改 gfx.taa 再调 Apply。
// 面板上的开关如果没接上回调（或者接错了那一位），直接改字段的测法一样是绿的，
// 而玩家点了没反应 —— 这一栏加进来的起因正是「设置里根本没有 TAA」。
const taaToggle = await page.evaluate(() => {
  const T = window.Taierzhuang;
  // Toggle 使用带状态的原生 button.edBtn（Script_EditorUi.Toggle），
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

// 第一人称自阴影：同样点真实按钮，并读回独立深度靶。只验 DOM/布尔位会放过
// 「开关在、材质也注入了，但深度 pass 一直是清屏白色」这一类静默坏法。
const firstPersonShadowToggle = await page.evaluate(() => {
  const T = window.Taierzhuang;
  const Btn = () => Array.from(document.querySelectorAll(".edPanel.work .edBtn"))
    .find((b) => (b.textContent || "").includes("第一人称自阴影"));
  const button = Btn();
  if (!button || !T.firstPersonSelfShadow) return { found: false };
  const boot = T.firstPersonSelfShadow.Status();
  button.click();
  T.StepFrames(2);
  const off = T.firstPersonSelfShadow.Status();
  Btn().click();
  T.StepFrames(4);
  const on = T.firstPersonSelfShadow.Status();
  const depth = T.firstPersonSelfShadow.AuditDepth();
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem("tengxian1938_graphics_v1")); } catch (e) { saved = null; }
  return { found: true, boot, off, on, depth, saved: saved?.firstPersonSelfShadow };
});
Check("画质面板：第一人称自阴影可热切并落盘",
  firstPersonShadowToggle.found && firstPersonShadowToggle.boot.enabled
  && !firstPersonShadowToggle.off.enabled && firstPersonShadowToggle.on.enabled
  && firstPersonShadowToggle.saved === true,
  firstPersonShadowToggle.found
    ? `开机=${firstPersonShadowToggle.boot.enabled} → 关=${firstPersonShadowToggle.off.enabled}`
      + ` → 开=${firstPersonShadowToggle.on.enabled} 落盘=${firstPersonShadowToggle.saved}`
    : "面板上找不到第一人称自阴影开关");
Check("第一人称自阴影：独立深度靶真有手枪像素且不向世界投影",
  firstPersonShadowToggle.found && firstPersonShadowToggle.on.renderedFrames > firstPersonShadowToggle.boot.renderedFrames
  && firstPersonShadowToggle.on.casters > 0 && firstPersonShadowToggle.on.materials > 0
  && firstPersonShadowToggle.on.isolated && !firstPersonShadowToggle.on.worldCasterLeak
  && firstPersonShadowToggle.depth.nonClear > 64,
  firstPersonShadowToggle.found
    ? `靶=${firstPersonShadowToggle.depth.size} 非空=${firstPersonShadowToggle.depth.nonClear}`
      + ` caster=${firstPersonShadowToggle.on.casters} 材质=${firstPersonShadowToggle.on.materials}`
    : "系统未构造");
// 自阴影软化：点真实按钮 → 2048 靶 + 着色器软化分支；关掉回 1024 硬路径。
// 读回深度靶与一帧像素，防「uniform 接了、靶换了，但着色器分支编译不过整只手变黑/变白」。
const firstPersonShadowSoft = await page.evaluate(() => {
  const T = window.Taierzhuang;
  const Btn = () => Array.from(document.querySelectorAll(".edPanel.work .edBtn"))
    .find((b) => (b.textContent || "").includes("自阴影软化"));
  const button = Btn();
  if (!button || !T.firstPersonSelfShadow) return { found: false };
  const before = T.firstPersonSelfShadow.Status();
  const gl = T.firstPersonSelfShadow.renderer.getContext();
  gl.getError();
  button.click();
  T.StepFrames(4);
  const soft = T.firstPersonSelfShadow.Status();
  const depth = T.firstPersonSelfShadow.AuditDepth();
  const glError = gl.getError();
  // 手仍然要画得出来：软化分支若编译失败，three 会把整份材质画成黑
  const canvas = document.querySelector("canvas");
  const probe = document.createElement("canvas");
  probe.width = 64; probe.height = 36;
  const ctx = probe.getContext("2d");
  ctx.drawImage(canvas, 0, 0, probe.width, probe.height);
  const data = ctx.getImageData(0, 0, probe.width, probe.height).data;
  let bright = 0;
  for (let i = 0; i < data.length; i += 4) if (data[i] + data[i + 1] + data[i + 2] > 90) bright += 1;
  Btn().click();
  T.StepFrames(2);
  const hard = T.firstPersonSelfShadow.Status();
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem("tengxian1938_graphics_v1")); } catch (e) { saved = null; }
  return { found: true, before, soft, hard, depth, glError, bright, pixels: probe.width * probe.height, saved: saved?.firstPersonSelfShadowSoft };
});
Check("画质面板：自阴影软化可热切（2048 靶 / 软化分支）并落盘，关回 1024 硬路径",
  firstPersonShadowSoft.found && firstPersonShadowSoft.before.soft === false
  && firstPersonShadowSoft.soft.soft === true && firstPersonShadowSoft.soft.size === 2048
  && firstPersonShadowSoft.soft.radiusTexels > 2 && firstPersonShadowSoft.soft.enabled
  && firstPersonShadowSoft.depth.size === 2048 && firstPersonShadowSoft.depth.nonClear > 256
  && firstPersonShadowSoft.glError === 0 && firstPersonShadowSoft.bright > firstPersonShadowSoft.pixels * 0.3
  && firstPersonShadowSoft.hard.soft === false && firstPersonShadowSoft.hard.size === 1024
  && firstPersonShadowSoft.saved === false,
  firstPersonShadowSoft.found
    ? "软化=" + firstPersonShadowSoft.soft.soft + " 靶=" + firstPersonShadowSoft.soft.size
      + " 半径texel=" + Number(firstPersonShadowSoft.soft.radiusTexels).toFixed(2)
      + " 非空=" + firstPersonShadowSoft.depth.nonClear + " gl=" + firstPersonShadowSoft.glError
      + " 亮像素=" + firstPersonShadowSoft.bright + "/" + firstPersonShadowSoft.pixels
      + " 关回=" + firstPersonShadowSoft.hard.size + " 落盘=" + firstPersonShadowSoft.saved
    : "面板上找不到自阴影软化开关");
// 画质面板整版留一张图：断言只能证明「DOM 里有这个按钮」，证明不了它在版面上
// 排到哪儿、黄字有没有把面板撑得读不下去。这一栏就是因为「设置里翻不到」才补的，
// 留张图下一轮直接看。
await page.screenshot({ path: path.join(projectDir, "_shots", "editor_graphics_panel.png") });

await OpenSettings("sound");
await Step(6);
const snd = await page.evaluate(() => {
  const T = window.Taierzhuang;
  const audio = T.audio;
  audio.SetBusVolume("ambience", 0.3);
  audio.SetMasterVolume(0.7);
  audio.voiceMute = true;
  T.settings.active.Save();
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem("tengxian1938_audio_v1")); } catch (e) { saved = null; }
  return {
    id: T.settings.ActiveId,
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
  T.settings.active.Reset();          // 音效
  T.settings.Open("graphics");
  T.settings.active.Reset();          // 画质（fov / renderScale 都在这儿回 55 / 1.0）
  T.settings.Close();
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
await ClickTool("actor");
await Step(20);
const actor = await page.evaluate(() => {
  const editor = window.Taierzhuang.editor;
  const active = editor.active;
  const importedActions = active.clipList.root.querySelectorAll(".it").length;
  // 用户反馈的正是编辑器默认站姿：旧测试只验枪轴，哪怕 Biped 手骨尾端落在
  // 掌外 8-10 cm，枪从张开的手掌旁边穿过去也会是绿的。固定复现该姿态。
  active.SetClip("AdvanceFire");
  window.Taierzhuang.StepFrames(45);
  const one = active.actors.length;
  const kind = active.actors[0] ? active.actors[0].kind : null;
  const source = active.actors[0] ? active.actors[0].meshSource : null;
  const primary = active.actors[0];
  const sourceDefault = primary?.weaponId === "ZhongZheng"
    && active.weaponSelect.Value() === "__source_default__";
  let socketDirectionDot = -1;
  let rightGripError = Infinity;
  let leftHandWeaponGap = Infinity;
  let rightHandWeaponGap = Infinity;
  let fingerGripSources = false;
  let legacySocketSeparation = 0;
  let weaponRollDot = -1;
  let correctedCrouchPlayback = false;
  let correctedCrouchLeanDeg = Infinity;
  let correctedCrouchStance = -1;
  let correctionDisclosed = false;
  if (primary?.weaponGroup && primary?.characterRig) {
    primary.root.updateWorldMatrix(true, true);
    const rightSocket = primary.characterRig.Grip("weaponR");
    const leftSocket = primary.characterRig.Grip("weaponL");
    if (rightSocket && leftSocket) {
      const Vector3 = primary.root.position.constructor;
      const right = primary.weaponMuzzle.clone();
      const left = primary.weaponMuzzle.clone();
      const grip = primary.weaponGripFront.clone().applyMatrix4(primary.weaponGroup.matrixWorld);
      rightSocket.getWorldPosition(right);
      leftSocket.getWorldPosition(left);
      socketDirectionDot = grip.clone().sub(right).normalize()
        .dot(left.clone().sub(right).normalize());
      rightGripError = new Vector3().applyMatrix4(primary.weaponGroup.matrixWorld).distanceTo(right);
      fingerGripSources = rightSocket.userData.gripSource === "fingerRootCentroid"
        && leftSocket.userData.gripSource === "fingerRootCentroid";
      const legacyRight = primary.characterRig.Socket("weaponR");
      const legacyLeft = primary.characterRig.Socket("weaponL");
      legacySocketSeparation = legacyRight && legacyLeft
        ? legacyRight.getWorldPosition(new Vector3()).distanceTo(right)
          + legacyLeft.getWorldPosition(new Vector3()).distanceTo(left)
        : 0;

      // 真正量可见蒙皮手与枪械网格，而不是再量一个空 Object3D。顶点距离对这次
      // 回归很敏感：坏版左手约 68 mm，指根掌心版约 1-2 mm。
      const weaponVertices = [];
      primary.weaponGroup.traverse((object) => {
        const position = object.geometry?.attributes?.position;
        if (!object.isMesh || !position) return;
        object.updateWorldMatrix(true, false);
        for (let i = 0; i < position.count; i += 1) {
          weaponVertices.push(new Vector3().fromBufferAttribute(position, i)
            .applyMatrix4(object.matrixWorld));
        }
      });
      const HandWeaponGap = (hand) => {
        let minimum = Infinity;
        primary.characterRig.root.traverse((object) => {
          const position = object.geometry?.attributes?.position;
          const skinIndex = object.geometry?.attributes?.skinIndex;
          const skinWeight = object.geometry?.attributes?.skinWeight;
          if (!object.isSkinnedMesh || !position || !skinIndex || !skinWeight) return;
          object.skeleton.update();
          const handBoneIndices = new Set();
          hand.traverse((node) => {
            const index = object.skeleton.bones.indexOf(node);
            if (index >= 0) handBoneIndices.add(index);
          });
          object.updateWorldMatrix(true, false);
          for (let i = 0; i < position.count; i += 1) {
            let influence = 0;
            for (let component = 0; component < 4; component += 1) {
              if (handBoneIndices.has(skinIndex.getComponent(i, component))) {
                influence += skinWeight.getComponent(i, component);
              }
            }
            if (influence < 0.2) continue;
            const handVertex = new Vector3().fromBufferAttribute(position, i);
            object.applyBoneTransform(i, handVertex);
            handVertex.applyMatrix4(object.matrixWorld);
            for (const weaponVertex of weaponVertices) {
              minimum = Math.min(minimum, handVertex.distanceToSquared(weaponVertex));
            }
          }
        });
        return Math.sqrt(minimum);
      };
      rightHandWeaponGap = HandWeaponGap(primary.characterRig.bones.handR);
      leftHandWeaponGap = HandWeaponGap(primary.characterRig.bones.handL);

      // StandFireCrouch 是最容易把枪翻到掌外的一条：旧 shortest-arc 方案实测
      // weapon-up · torso-up = -0.31。切过去再量一次完整姿态框架。
      active.SetClip("StandFireCrouch");
      window.Taierzhuang.StepFrames(45);
      primary.root.updateWorldMatrix(true, true);
      const bodyLow = primary.characterRig.bones.pelvis.getWorldPosition(new Vector3());
      const bodyHigh = (primary.characterRig.bones.neck || primary.characterRig.bones.chest)
        .getWorldPosition(new Vector3());
      const weaponUp = new Vector3(0, 1, 0).transformDirection(primary.weaponGroup.matrixWorld);
      weaponRollDot = weaponUp.dot(bodyHigh.sub(bodyLow).normalize());
    }
  }
  // CrouchIdle 的源定格前倾约 59°、双手和枪拖地；正式播放必须改走同骨架
  // RifleIdle 的自然单膝姿，而不能只把列表中文名换掉。
  active.SetClip("CrouchIdle");
  window.Taierzhuang.StepFrames(45);
  primary.root.updateWorldMatrix(true, true);
  {
    const Vector3 = primary.root.position.constructor;
    const pelvis = primary.characterRig.bones.pelvis.getWorldPosition(new Vector3());
    const head = primary.characterRig.bones.head.getWorldPosition(new Vector3());
    const torso = head.sub(pelvis);
    correctedCrouchLeanDeg = Math.acos(Math.min(1, Math.abs(torso.y) / torso.length())) * 180 / Math.PI;
  }
  correctedCrouchPlayback = primary.characterRig.currentId === "CrouchIdle"
    && primary.characterRig.currentPlaybackId === "RifleIdle";
  correctedCrouchStance = active.gizmos[0]?.stance ?? -1;
  correctionDisclosed = active.facts.root.textContent.includes("CrouchIdle → RifleIdle")
    && active.facts.root.textContent.includes("59°");
  // 走真实下拉 change 事件，不只调内部方法：用户反馈的正是面板里换枪不生效。
  active.weaponSelect.root.value = "Type38";
  active.weaponSelect.root.dispatchEvent(new Event("change"));
  window.Taierzhuang.StepFrames(10);
  const singleWeaponReplaced = active.actors.length === 1
    && active.actors[0].weaponId === "Type38"
    && active.weaponId === "Type38";
  active.SetWeaponChoice("__source_default__");
  active.lineup = true;
  active.Rebuild();
  window.Taierzhuang.StepFrames(10);
  const lineupCount = active.actors.length;
  const nraLineupSourceDefaults = active.actors.length === 3
    && active.actors.map(a=>a.characterRig?.modelId).join(',') === 'TengxianNra02,TengxianNra05,TengxianNra05'
    && active.actors.slice(0, 2).every((previewActor) => previewActor.kind === "nra"
      && previewActor.weaponId === "ZhongZheng")
    && active.actors[2]?.kind === "nraOfficer"
    && active.actors[2]?.weaponId === null;
  active.weaponSelect.root.value = "Zb26";
  active.weaponSelect.root.dispatchEvent(new Event("change"));
  window.Taierzhuang.StepFrames(10);
  const lineupWeaponsReplaced = active.actors.length === 3
    && active.actors.every((previewActor) => previewActor.weaponId === "Zb26");
  active.SetWeaponChoice("__source_default__");
  active.lineup = false;
  active.kindList.Select("ija", true);
  active.lineup = true;
  active.Rebuild();
  window.Taierzhuang.StepFrames(10);
  // 【2026-10-12 改数据】2026-09-24 用户批准 IJA06（Data_CharacterSelection 的 ija 表加了序号 5，
  // 主力匿名日军外观、日兵甲的脸），本阵营对比从「三兵一官」变成「四兵一官」；这里原来还按四个人数。
  const ijaLineupSourceDefaults = active.actors.length === 5
    && active.actors.map(a=>a.characterRig?.modelId).join(',') === 'TengxianIja01,TengxianIja02,TengxianIja03,TengxianIja06,TengxianIja01'
    && active.actors.slice(0, 4).every((previewActor) => previewActor.kind === "ija"
      && previewActor.weaponId === "Type38")
    && active.actors[4]?.kind === "ijaOfficer"
    && active.actors[4]?.weaponId === "Type38";
  const ijaLineup = active.actors.map((a) => `${a.kind}:${a.characterRig?.modelId}:${a.weaponId}`).join(" / ");
  // 当前阵营采用的军人全部走新的蒙皮 GLB，且必须进入法线/深度预通道；主材质须至少有一份
  // 不透明、写深度的主体材质。头发/帽带的 alpha 卡允许透明且不写深度。
  // 静默退回旧 model/box 也会让这一条红。
  const rigidShadingSolid = active.actors.every((previewActor) => {
    if (!previewActor.meshSource.startsWith("glb:Tengxian")
      || previewActor.characterRig?.root?.userData?.skipNormalDepth) return false;
    let materialsValid = true;
    let opaqueDepthMaterial = false;
    let meshes = 0;
    previewActor.root.traverse((object) => {
      if (!object.isSkinnedMesh || !object.visible) return;
      meshes += 1;
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      materialsValid = materialsValid && materials.every((material) => material
          && material.opacity === 1 && material.depthTest);
      opaqueDepthMaterial = opaqueDepthMaterial || materials.some((material) => material
          && !material.transparent && material.depthWrite);
    });
    return materialsValid && opaqueDepthMaterial && meshes > 0;
  });
  active.lineup = false;
  active.kindList.Select("nra", true);
  active.animationMode = "programmatic";
  active.manual = false;
  active.FillActionList();
  active.SetClip("dead");
  window.Taierzhuang.StepFrames(30);
  const ragdoll = !!(active.actors[0] && active.actors[0].ragdollState);
  active.kindList.Select("civilian", true);
  window.Taierzhuang.StepFrames(10);
  const civilianUnarmed = active.kind === "civilian"
    && active.weaponId === null
    && active.actors[0]?.weaponId === null
    && active.weaponSelect.Value() === "__source_default__";
  return {
    id: editor.ActiveId, one, lineupCount, importedActions, kind, source,
    ragdoll, civilianUnarmed, rigidShadingSolid, socketDirectionDot,
    rightGripError, leftHandWeaponGap, rightHandWeaponGap,
    fingerGripSources, legacySocketSeparation, weaponRollDot,
    correctedCrouchPlayback, correctedCrouchLeanDeg, correctedCrouchStance, correctionDisclosed,
    sourceDefault, singleWeaponReplaced, nraLineupSourceDefaults,
    ijaLineupSourceDefaults, ijaLineup, lineupWeaponsReplaced,
    studio: editor.studio.Active,
    worldHidden: !window.Taierzhuang.battlefield.meshes.some((m) => m.visible),
    viewmodelHidden: window.Taierzhuang.viewmodel.root.visible === false,
  };
});
Check("人物编辑器打开", actor.id === "actor" && actor.studio, `kind=${actor.kind}`);
Check("摄影棚把城藏起来了", actor.worldHidden && actor.viewmodelHidden);
Check("单人 / 国军两款士兵与一名军官角色对比", actor.one === 1 && actor.lineupCount === 3,
  `${actor.one} → ${actor.lineupCount}`);
// 14 条卢沟桥源动作 + 3 条救护动作 + 5 条 Seedance/GVHMR 步兵动作。
Check("人物编辑器列出当前士兵适用的 22 条导入动作", actor.importedActions === 22,
  `${actor.importedActions} 条`);
Check("人物编辑器单人默认读取正式人物配枪", actor.sourceDefault);
Check("人物编辑器下拉可替换单人枪械", actor.singleWeaponReplaced);
Check("国军两款士兵与复用外观的军官装备默认枪械", actor.nraLineupSourceDefaults);
Check("日军四款士兵与复用外观的军官装备默认枪械", actor.ijaLineupSourceDefaults, actor.ijaLineup);
Check("本阵营对比下拉可统一替换全部枪械", actor.lineupWeaponsReplaced);
Check("本阵营获准人物都用蒙皮 GLB，且主体材质不透明/写深度", actor.rigidShadingSolid);
Check("枪身前握把沿左右手骨骼挂点定向", actor.socketDirectionDot > 0.98,
  `dot=${actor.socketDirectionDot.toFixed(4)}`);
Check("配枪改用原动画四指根掌心，不再用偏在掌外的 Biped 手骨尾端",
  actor.fingerGripSources && actor.legacySocketSeparation > 0.10,
  `旧挂点总偏差=${(actor.legacySocketSeparation * 100).toFixed(1)} cm`);
Check("右手掌心与枪械后握点重合", actor.rightGripError < 0.001,
  `${(actor.rightGripError * 1000).toFixed(2)} mm`);
Check("默认站姿双手可见网格都贴住枪身",
  actor.rightHandWeaponGap < 0.02 && actor.leftHandWeaponGap < 0.02,
  `右 ${(actor.rightHandWeaponGap * 1000).toFixed(1)} mm / 左 ${(actor.leftHandWeaponGap * 1000).toFixed(1)} mm`);
Check("卧姿配枪滚转朝向与身体一致，不会倒扣在手掌外", actor.weaponRollDot > 0.10,
  `dot=${actor.weaponRollDot.toFixed(3)}`);
Check("CrouchIdle 不再播放 59° 前倾坏定格，改为自然单膝待机",
  actor.correctedCrouchPlayback && actor.correctedCrouchLeanDeg < 30,
  `playback=RifleIdle 前倾=${actor.correctedCrouchLeanDeg.toFixed(1)}°`);
Check("CrouchIdle 取证明确写出校正曲线并使用蹲姿胶囊",
  actor.correctionDisclosed && actor.correctedCrouchStance === 1,
  `stance=${actor.correctedCrouchStance}`);
Check("倒地动作走到 ragdoll", actor.ragdoll, `meshSource=${actor.source}`);
Check("百姓切换后自动空手", actor.civilianUnarmed);

// ---------------------------------------------------------------------------
// 2b) 川军步兵**真的画出来了几个像素** + 判定盒线框
//
// 【2026-08-27 这一节因为一次事故而存在】
// 症状：人物动作编辑器里选川军步兵，画面上只剩一支浮在空中的中正式。
// 而当时这个文件的六条断言全绿 —— 因为它们查的是 actors.length、meshSource、
// 材质不透明、root.visible，**一条也不是「屏幕上有没有这个人」**。
// 病根在合批层：摄影棚 WorldMask 把 scene 直属子节点全藏了，其中包括开编辑器
// 之前就建好的那一百个 `ActorBatch_*` InstancedMesh；台上这个人的分件照旧被
// 挪到 BATCH_LAYER，实例写进了已经藏起来的批次里（见 Studio.SetActorBatch）。
//
// 所以这里改成数**颜色**：同一台相机拍两张（人在 / 人藏），逐像素比差值。
// 画布没开 preserveDrawingBuffer，readPixels 必须与 StepFrames 在同一个 JS 任务里，
// 让出去一次就清了。medium 档默认开 TAA，所以每张先推几帧让历史收敛。
// ---------------------------------------------------------------------------
const drawn = await page.evaluate(() => {
  const T = window.Taierzhuang;
  const active = T.editor.active;
  active.kindList.Select("nra", true);
  active.animationMode = "programmatic";
  active.manual = false;
  active.FillActionList();
  active.SetClip("idle");
  // 停表再拍。待机也有呼吸起伏，两张之间人本身就动了几百像素，
  // 那个数会混进"线框画了多少"里，让这一条断言变得什么都证明不了。
  active.playing = false;
  T.StepFrames(45);              // 姿态弹簧收敛 + TAA 历史收敛
  const gl = T.renderer.getContext();
  const width = gl.drawingBufferWidth;
  const height = gl.drawingBufferHeight;
  const Shot = () => {
    T.StepFrames(8);
    const buffer = new Uint8Array(width * height * 4);
    gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, buffer);
    return buffer;
  };
  const Diff = (a, b) => {
    let n = 0;
    for (let i = 0; i < a.length; i += 4) {
      if (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1])
        + Math.abs(a[i + 2] - b[i + 2]) > 24) n += 1;
    }
    return n;
  };
  // 1) 人：藏起来前后的差 = 这个人在屏幕上占了多少像素
  for (const gizmo of active.gizmos) gizmo.root.visible = false;
  const withActor = Shot();
  for (const a of active.actors) a.root.visible = false;
  const withoutActor = Shot();
  for (const a of active.actors) a.root.visible = true;
  const bodyPixels = Diff(withActor, withoutActor);
  // 2) 判定球线框：同样数像素，而不是数 visible
  for (const gizmo of active.gizmos) gizmo.root.visible = true;
  const withGizmo = Shot();
  const gizmoPixels = Diff(withGizmo, withActor);
  // 3) 卧姿要换成卧姿胶囊（尺寸表是 Script_Ai.CAPSULE，与 Rapier 同一套）
  active.playing = true;
  active.SetClip("prone");
  T.StepFrames(60);
  const proneStance = active.gizmos[0] ? active.gizmos[0].stance : -1;
  active.SetClip("idle");
  T.StepFrames(60);
  const standStance = active.gizmos[0] ? active.gizmos[0].stance : -1;
  return {
    bodyPixels, gizmoPixels, proneStance, standStance,
    total: width * height,
    gizmos: active.gizmos.length,
    // 摄影棚开着的时候合批必须是关的，人物分件必须留在第 0 层（= 自己出画）
    batchOff: T.actorBatch.enabled === false,
    onLayerZero: active.actors.every((a) => {
      let ok = true;
      a.root.traverse((o) => { if (o.isMesh && o.layers.mask !== 1) ok = false; });
      return ok;
    }),
    // 线框不许混进法线深度预通道（半透明加性的东西一律 allowOverride=false）
    gizmoNoPrepass: active.gizmos.every((g) =>
      g.hitMaterial.allowOverride === false && g.capMaterial.allowOverride === false),
  };
});
// 1280×720 上一个 3.4 m 外的人大约占两三万像素；给一个不可能靠噪点凑出来的下限。
Check("川军步兵在摄影棚里真的画出了像素", drawn.bodyPixels > 6000,
  `${drawn.bodyPixels} px / ${drawn.total}`);
Check("摄影棚开着时人物合批是关的、分件留在第 0 层",
  drawn.batchOff && drawn.onLayerZero);
Check("子弹判定盒线框画得出来", drawn.gizmoPixels > 300 && drawn.gizmos === 1,
  `${drawn.gizmoPixels} px`);
Check("判定线框不进法线深度预通道", drawn.gizmoNoPrepass);
Check("移动胶囊跟着姿态换档（站 0 / 卧 2）",
  drawn.standStance === 0 && drawn.proneStance === 2,
  `stand=${drawn.standStance} prone=${drawn.proneStance}`);

// ---------------------------------------------------------------------------
// 3) 枪械编辑器
// ---------------------------------------------------------------------------
await ClickTool("weapon");
await Step(15);
const weapon = await page.evaluate(async () => {
  const editor = window.Taierzhuang.editor;
  const active = editor.active;
  const out = { id: editor.ActiveId };
  // 2026-10-31 起只剩台架：第一人称视图、动作按钮与准心校准都在「第一人称持枪检查」
  out.benchOnly = !active.viewChips && !active.actionButtons && !active.calibrationSection;
  active.SetWeapon("Zb26");
  window.Taierzhuang.StepFrames(10);
  out.bench = !!active.benchGroup;
  out.benchMeshes = active.benchGroup ? active.benchGroup.children.length : 0;
  out.viewmodelHidden = !window.Taierzhuang.viewmodel.root.visible;
  // 中正式有刺刀预览：台架切换真实独立模型；捷克式没有刺刀，控件不能留下可点的空壳。
  active.SetWeapon("ZhongZheng");
  window.Taierzhuang.StepFrames(10);
  out.spinDefaultOff = !active.spin;
  out.bayonetToggleVisible = !active.bayonetToggle.root.hidden;
  out.benchBayonetBefore = !!active.benchBayonet && !active.benchBayonet.visible;
  active.bayonetToggle.root.click();
  out.benchBayonetAfter = !!active.benchBayonet?.visible;
  active.SetWeapon("Zb26");
  window.Taierzhuang.StepFrames(10);
  out.unsupportedBayonetHidden = active.bayonetToggle.root.hidden;
  const THREE = await import("./vendor/three/build/three.module.js");
  out.deployedPoses = {};
  for (const id of ["Type92Hmg", "MediumMortar"]) {
    active.SetWeapon(id);
    window.Taierzhuang.StepFrames(10);
    const box = new THREE.Box3().setFromObject(active.benchGroup);
    const span = box.getSize(new THREE.Vector3());
    out.deployedPoses[id] = {
      grounded: Math.abs(box.min.y) < 0.005,
      pitch: active.benchGroup.children[0]?.rotation.x ?? null,
      span: span.toArray(),
    };
  }
  const rows = Array.from(active.list.root.querySelectorAll(".it"), (row) => ({
    name: row.querySelector(".n")?.textContent || "",
    tail: row.querySelector(".t")?.textContent || "",
  }));
  out.ambiguousRows = rows.filter((row) => ["八二迫击炮"].includes(row.name));
  out.unknownCopyGone = out.ambiguousRows.length === 1
    // 9656fef89 简化面板时删掉了「待考」说明段，这里只守住列表文案本身。
    && out.ambiguousRows.every((row) => !row.name.includes("未明") && !row.tail.includes("未明"));
  active.SetWeapon("OfficerSwordSet");
  window.Taierzhuang.StepFrames(10);
  const swordSpan = new THREE.Box3().setFromObject(active.benchGroup).getSize(new THREE.Vector3());
  out.swordInspectionPose = swordSpan.x > swordSpan.y * 5;
  // 两辆战车已有 .tzm；车辆走整棵关节树并落地，不能再按旧规则当成“无几何”。
  active.SetWeapon("Type89Tank");
  window.Taierzhuang.StepFrames(10);
  out.tankOk = active.benchGroup !== null && active.vehicleNodes !== null;
  out.benchFov = window.Taierzhuang.camera.fov;

  // 第一人称那一份在「第一人称持枪检查」：刺刀预览、动作按钮按装备过滤、玩家视角用正片 55°。
  const fp = editor.Open("firstPerson");
  fp.SetWeapon("ZhongZheng");
  window.Taierzhuang.StepFrames(10);
  // 摄影棚默认的 42°（85 mm 等效）比正片窄三成，而视图模型的位姿全是按 55° 摆的 ——
  // 用 42° 看，枪整个掉到画框外。**「可见」不等于「看得见枪」。**
  out.fpFov = window.Taierzhuang.camera.fov;
  out.fpBayonetToggleVisible = !fp.bayonetToggle.root.hidden;
  fp.bayonetToggle.root.click();
  window.Taierzhuang.StepFrames(4);
  out.fpBayonetAfter = !!window.Taierzhuang.viewmodel.rig?.parts?.bayonet?.visible;
  fp.SetWeapon("Zb26");
  window.Taierzhuang.StepFrames(10);
  out.fpBayonetResetOnSwitch = !window.Taierzhuang.viewmodel.bayonetFixed;
  out.unsupportedBayonetHiddenFp = fp.bayonetToggle.root.hidden;
  out.unsupportedThrowHidden = fp.actionButtons.throw.hidden;
  out.unsupportedMeleeVisible = !fp.actionButtons.melee.hidden;
  out.zb26AutoFireVisible = !fp.autoFireToggle.root.hidden;
  out.zb26CalibrationVisible = !fp.calibrationSection.hidden;
  fp.SetWeapon("Grenade");
  window.Taierzhuang.StepFrames(10);
  out.grenadeThrowVisible = !fp.actionButtons.throw.hidden;
  out.grenadeMeleeHidden = fp.actionButtons.melee.hidden;
  out.grenadeCalibrationHidden = fp.calibrationSection.hidden;
  editor.Open("weapon");
  window.Taierzhuang.StepFrames(4);
  return out;
});
Check("枪械编辑器只剩台架（第一人称视图、动作与准心校准已并入第一人称持枪检查）",
  weapon.id === "weapon" && weapon.bench && weapon.benchOnly && weapon.viewmodelHidden,
  `台架网格=${weapon.benchMeshes} 只剩台架=${weapon.benchOnly} 视模藏起=${weapon.viewmodelHidden}`);
Check("第一人称持枪检查用正片镜头、台架换回 85 mm",
  weapon.fpFov === 55 && weapon.benchFov === 42,
  `fp=${weapon.fpFov}° 台架=${weapon.benchFov}°`);
Check("车辆条目按完整关节树建落地台架", weapon.tankOk);
Check("枪械编辑器默认不自转", weapon.spinDefaultOff);
Check("刺刀预览只给支持的枪，并在台架 / 第一人称持枪检查都切换真实模型",
  weapon.bayonetToggleVisible && weapon.benchBayonetBefore && weapon.benchBayonetAfter
    && weapon.fpBayonetToggleVisible && weapon.fpBayonetAfter && weapon.fpBayonetResetOnSwitch,
  JSON.stringify({
    toggle: weapon.bayonetToggleVisible, benchBefore: weapon.benchBayonetBefore,
    benchAfter: weapon.benchBayonetAfter, fpToggle: weapon.fpBayonetToggleVisible,
    fpAfter: weapon.fpBayonetAfter, fpReset: weapon.fpBayonetResetOnSwitch,
  }));
Check("不支持刺刀 / 投掷的枪不显示无效选项，仍保留有效白刃；捷克式有连发与准心校准",
  weapon.unsupportedBayonetHidden && weapon.unsupportedBayonetHiddenFp && weapon.unsupportedThrowHidden
    && weapon.unsupportedMeleeVisible && weapon.zb26AutoFireVisible && weapon.zb26CalibrationVisible);
Check("手榴弹只显示投掷，不显示白刃与准心校准",
  weapon.grenadeThrowVisible && weapon.grenadeMeleeHidden && weapon.grenadeCalibrationHidden);
const deployed = weapon.deployedPoses;
Check("两件架设武器逐件校姿并按最终包围盒落地",
  Object.values(deployed).every((entry) => entry.grounded)
    && Math.abs(deployed.Type92Hmg.pitch) < 0.001
    && deployed.MediumMortar.pitch > 1.0 && deployed.MediumMortar.pitch < 1.15
    && deployed.MediumMortar.span[1] > deployed.MediumMortar.span[0] * 0.9,
  JSON.stringify(deployed));
Check("型号待考条目不再显示‘未明·掷弹筒’",
  weapon.unknownCopyGone,
  JSON.stringify(weapon.ambiguousRows));
Check("军刀台架取消人物动作轴，改为横向检视", weapon.swordInspectionPose);

// ---------------------------------------------------------------------------
// 4) 特效预览编辑器
// ---------------------------------------------------------------------------
await ClickTool("vfx");
await Step(90);
const vfxEditor = await page.evaluate(() => {
  const T = window.Taierzhuang;
  const active = T.editor.active;
  const gl = T.renderer.getContext();
  // 【2026-10-12 改口径】2026-10-09 起（62f75b7a「render smoke and fire from simulated volumes」）
  // SceneEffect 的常驻烟一律走三维体积粒子（source.volumeSmokeHandles，预设 VolumePlume），
  // 不再往 sourceSmoke 精灵池里吐 —— 原来量 sourceSmoke.cursor 的写法在新管线上恒为 0。
  // 现在按这一个烟源自己挂的句柄分开量：烟 = 它的体积烟系统，火 = 它的 Burning 系统，
  // 不再用「全场任何一个系统有粒子」顶替（那样烟没了火也能把这一条撑绿）。
  const source = T.vfx.smokeSources.get(active.handle);
  const entries = T.vfx.particles.Inspect().entries;
  const Of = (ids) => entries.filter((entry) => (ids || []).includes(entry.id));
  const smoke = Of(source?.volumeSmokeHandles), fire = Of(source?.particleHandles);
  const continuous = {
    handle: active.handle,
    smokeSystems: smoke.length,
    smokeSpawned: smoke.reduce((n, e) => n + e.emitted, 0),
    fireSpawned: fire.reduce((n, e) => n + e.emitted, 0),
    smokeAlive: smoke.length > 0 && smoke.every((e) => e.particleCount > 0),
    fireAlive: fire.length > 0 && fire.some((e) => e.particleCount > 0),
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
    && vfxEditor.continuous.smokeSpawned > 0 && vfxEditor.continuous.fireSpawned > 0
    && vfxEditor.continuous.smokeAlive && vfxEditor.continuous.fireAlive,
  JSON.stringify(vfxEditor.continuous));
Check("特效预览器可重播瞬时爆炸且 shader 无 GL 错误",
  !!vfxEditor.instant && vfxEditor.glError === 0, JSON.stringify(vfxEditor.instant));

// ---------------------------------------------------------------------------
// 5) 音效音乐编辑器
// ---------------------------------------------------------------------------
await ClickTool("audio");
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
// 音乐包 5.6 MB，是四个包里最后落地的那一个：按下按钮时 `musicBuffers` 多半还空着，
// `Music()` 只把 cue 记下来就返回（Script_Audio「还没载到：这一段就是没有音乐」），
// 等包到了 LoadMusicPack 的回调再拿 musicCue 补播一次。所以这里等的是
// **播放头真的建起来**，不是等一个固定帧数 —— 固定 8 帧在包变大之后就是一条
// 随机红（2026-08-29 实测：musicCue=tension 而 musicLayer=null）。
// 包一直载不到时不在这儿卡死：跳出去让下面那条断言照常报红。
for (let i = 0; i < 120; i += 1) {
  if (await page.evaluate(() => !!window.Taierzhuang.audio.musicLayer)) break;
  await Step(4);
  await page.waitForTimeout(250);
}
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
  // 分类签从编辑器模块读，**不在这里拄一份** —— 拄一份的话，
  // 那边新开一类（断肢就是）这条断言会红在一个与它无关的地方。
  const editorAudio = await import("./Script_EditorAudio.mjs");
  for (const cat of editorAudio.CATEGORIES.filter((c) => c !== "全部")) {
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
await ClickTool("timeline");
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
  // **取样口径跟着新序章走**（2026-08-29）：旧序章那条 `prologue_young_dispatch_01`
  // 已经不在 CS_Chuchuan 里，照旧钉着它 Seek(9.2) 读到的永远是 null。
  // 新序章镜 1 的第一句是 `ch0_liuwencai_01`（shot 1 局部 2.2 s，镜 1 从 0 起算），
  // 把它的时长临时改成 4 s 再拖到 2.8 s —— 目标时刻落在这一句的中段，
  // 应当从 0.6 s 这个采样点接回。**别改成「拖到某个整数秒再看谁在响」**：
  // 判据必须是「这一句、这个偏移」，不然换一条台词的 at 就悄悄失效了。
  active.SelectCut("CS_Chuchuan");
  const SEEK_CUE = "ch0_liuwencai_01";
  const SEEK_AT = 2.8;                       // = 台词 at 2.2 + 期望偏移 0.6
  const audio = window.Taierzhuang.audio;
  const originalPlay = audio.Play;
  const originalStopVoice = audio.StopVoice;
  const originalVoice = audio.voiceBank.get(SEEK_CUE);
  const calls = [];
  audio.voiceBank.set(SEEK_CUE, { ...(originalVoice || {}), duration: 4 });
  audio.Play = function(name, opts = {}) {
    calls.push({ name, offset: Number(opts.offset || 0) });
    return { nodes: [], duration: Math.max(0, 4 - Number(opts.offset || 0)) };
  };
  audio.StopVoice = () => true;
  try {
    active.Seek(SEEK_AT);
    out.audioSeek = calls.findLast((entry) => entry.name === `voice.${SEEK_CUE}`) || null;
  } finally {
    active.Stop();
    audio.Play = originalPlay;
    audio.StopVoice = originalStopVoice;
    if (originalVoice) audio.voiceBank.set(SEEK_CUE, originalVoice);
    else audio.voiceBank.delete(SEEK_CUE);
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
  timeline.audioSeek?.name === "voice.ch0_liuwencai_01"
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
// 6c) 构件库预览器
// ---------------------------------------------------------------------------
// 打开前的相机投影：摄影棚存下的「原始投影」必须就是它（关构件库时还回去的就是这一份）。
const projectionBeforeProps = await page.evaluate(() => [window.Taierzhuang.camera.fov, window.Taierzhuang.camera.far]);
await ClickTool("props");
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
    categories: active.categories,
    externalCategories: Object.fromEntries([
      "External_cart", "External_house", "External_battlefieldBarbedWire01",
      "External_deadTreeTrunk01",
    ].map((id) => [id, active.Entry(id)?.cat])),
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
Check("外部 GLB 按物体品类合并筛选",
  !props.categories.includes("外部道具")
    && props.externalCategories.External_cart === "院落小件"
    && props.externalCategories.External_house === "建筑"
    && props.externalCategories.External_battlefieldBarbedWire01 === "工事"
    && props.externalCategories.External_deadTreeTrunk01 === "景观",
  JSON.stringify({ categories: props.categories, entries: props.externalCategories }));
Check("构件库相机可调 FOV 与远裁剪面",
  props.projection[0] === 47 && props.projection[1] === 480, props.projection.join(" / "));
Check("构件库摄影棚存下的原始相机参数就是打开前那一份",
  JSON.stringify(props.originalProjection) === JSON.stringify(projectionBeforeProps),
  `${projectionBeforeProps.join("/")} → ${props.originalProjection.join("/")}`);

// 三件院落小物不能再共用通用 Stone：构件库就是玩家报告问题的入口，逐件确认
// Base / Normal 真接上，并把双面材质契约钉住（井筒和水缸从口沿看进去就是背面）。
await fs.promises.mkdir(path.join(projectDir, "_shots"), { recursive: true });
const courtyardPbr = {};
for (const spec of [
  { id: "Well", stem: "WellStone" },
  { id: "Millstone", stem: "Millstone" },
  { id: "WaterVat", stem: "WaterVat" },
]) {
  await page.evaluate((id) => window.Taierzhuang.editor.active.SetPalette(id), spec.id);
  await Step(2);
  courtyardPbr[spec.id] = await page.evaluate(() => {
    const active = window.Taierzhuang.editor.active;
    const base = [], normal = [], sides = [];
    active.previewRoot.traverse((node) => {
      const materials = Array.isArray(node.material) ? node.material : [node.material];
      for (const material of materials) {
        if (!material) continue;
        const baseSrc = material.map?.image?.currentSrc || material.map?.image?.src;
        const normalSrc = material.normalMap?.image?.currentSrc || material.normalMap?.image?.src;
        if (baseSrc) base.push(baseSrc);
        if (normalSrc) normal.push(normalSrc);
        sides.push(material.side);
      }
    });
    return { base, normal, sides, meshes: active.preview?.meshes || 0 };
  });
  const result = courtyardPbr[spec.id];
  Check(`${spec.id} 使用专属 Base + Normal 且背面可见`,
    result.meshes > 0
      && result.base.some((src) => src.includes(`Texture_${spec.stem}Base.webp`))
      && result.normal.some((src) => src.includes(`Texture_${spec.stem}Normal.webp`))
      && result.sides.includes(2),
    JSON.stringify(result));
  await page.screenshot({
    path: path.join(projectDir, "_shots", `editor_prop_${spec.id}_pbr.png`),
  });
}

await page.evaluate(() => {
  const active = window.Taierzhuang.editor.active;
  active.SetPalette("RoomBlock");
  active.SetDamageState("original");
});
await Step(2);
const damageOriginal = await page.evaluate(() => {
  const active = window.Taierzhuang.editor.active;
  const textures = [];
  active.previewRoot.traverse((node) => {
    const src = node.material?.map?.image?.currentSrc || node.material?.map?.image?.src;
    if (src) textures.push(src);
  });
  return {
    state: active.preview?.damageState,
    facts: active.facts.root.textContent,
    texture: textures.find((src) => src.includes("Texture_BrickWallBase")) || "",
    anchor: active.previewRoot.userData.previewAnchor,
    position: active.previewRoot.position.toArray(),
    camera: {
      target: active.host.studio.orbit.target.toArray(),
      distance: active.host.studio.orbit.dist,
      yaw: active.host.studio.orbit.yaw,
      pitch: active.host.studio.orbit.pitch,
    },
  };
});
Check("构件库原始态保留正式房屋基模与砖材",
  damageOriginal.state === "original" && damageOriginal.facts.includes("原始状态")
    && !!damageOriginal.texture,
  JSON.stringify(damageOriginal));
await page.screenshot({
  path: path.join(projectDir, "_shots", "editor_prop_damage_original.png"),
});

await page.evaluate(() => {
  const active = window.Taierzhuang.editor.active;
  active.SetDamageState("shellDamaged");
});
await Step(2);
const damageEarly = await page.evaluate(() => {
  const active = window.Taierzhuang.editor.active;
  const textures = [];
  active.previewRoot.traverse((node) => {
    const src = node.material?.map?.image?.currentSrc || node.material?.map?.image?.src;
    if (src) textures.push(src);
  });
  return {
    state: active.preview?.damageState,
    detail: active.preview?.damageDetail,
    sectionHidden: active.damageSection.parentElement.hidden,
    facts: active.facts.root.textContent,
    texture: textures.find((src) => src.includes("Texture_BuildingDamageEarlyBase")) || "",
    anchor: active.previewRoot.userData.previewAnchor,
    position: active.previewRoot.position.toArray(),
    camera: {
      target: active.host.studio.orbit.target.toArray(),
      distance: active.host.studio.orbit.dist,
      yaw: active.host.studio.orbit.yaw,
      pitch: active.host.studio.orbit.pitch,
    },
  };
});
Check("构件库可即时预览炮击初损建模态",
  damageEarly.state === "shellDamaged" && !damageEarly.sectionHidden
    && damageEarly.facts.includes("炮击初损") && !!damageEarly.texture
    && damageEarly.detail?.stage === "early"
    && damageEarly.detail?.impactMarks === 2
    && damageEarly.detail?.fractureBricks === 20
    && damageEarly.detail?.crackSegments === 20
    && damageEarly.detail?.looseBricks === 14
    && damageEarly.detail?.exposedBeams === 0
    && damageEarly.detail?.roofFragments === 6,
  JSON.stringify(damageEarly));
await page.screenshot({
  path: path.join(projectDir, "_shots", "editor_prop_damage_early.png"),
});

await page.evaluate(() => window.Taierzhuang.editor.active.SetDamageState("severeDamage"));
await Step(2);
const damageSevere = await page.evaluate(() => {
  const active = window.Taierzhuang.editor.active;
  const textures = [];
  active.previewRoot.traverse((node) => {
    const src = node.material?.map?.image?.currentSrc || node.material?.map?.image?.src;
    if (src) textures.push(src);
  });
  return {
    state: active.preview?.damageState,
    detail: active.preview?.damageDetail,
    facts: active.facts.root.textContent,
    texture: textures.find((src) => src.includes("Texture_BuildingDamageSevereBase")) || "",
    anchor: active.previewRoot.userData.previewAnchor,
    position: active.previewRoot.position.toArray(),
    camera: {
      target: active.host.studio.orbit.target.toArray(),
      distance: active.host.studio.orbit.dist,
      yaw: active.host.studio.orbit.yaw,
      pitch: active.host.studio.orbit.pitch,
    },
  };
});
Check("构件库可即时预览严重破坏建模态",
  damageSevere.state === "severeDamage" && damageSevere.facts.includes("严重破坏")
    && !!damageSevere.texture
    && damageSevere.detail?.impactMarks === 4
    && damageSevere.detail?.fractureBricks === 56
    && damageSevere.detail?.crackSegments === 84
    && damageSevere.detail?.looseBricks === 34
    && damageSevere.detail?.exposedBeams === 3
    && damageSevere.detail?.roofFragments === 22,
  JSON.stringify(damageSevere));
Check("同源建筑三档共用布设 pivot 且切换不重取景",
  damageOriginal.anchor === "placementPivot"
    && damageEarly.anchor === "placementPivot"
    && damageSevere.anchor === "placementPivot"
    && JSON.stringify(damageOriginal.position) === JSON.stringify([0, 0, 0])
    && JSON.stringify(damageEarly.position) === JSON.stringify(damageOriginal.position)
    && JSON.stringify(damageSevere.position) === JSON.stringify(damageOriginal.position)
    && JSON.stringify(damageEarly.camera) === JSON.stringify(damageOriginal.camera)
    && JSON.stringify(damageSevere.camera) === JSON.stringify(damageOriginal.camera),
  JSON.stringify({ original: damageOriginal, early: damageEarly, severe: damageSevere }));
await page.screenshot({
  path: path.join(projectDir, "_shots", "editor_prop_damage_severe.png"),
});
for (const angle of [
  { name: "side", radians: Math.PI / 2 },
  { name: "rear", radians: Math.PI },
]) {
  await page.evaluate((radians) => {
    window.Taierzhuang.editor.active.previewRoot.rotation.y = radians;
  }, angle.radians);
  await Step(1);
  await page.screenshot({
    path: path.join(projectDir, "_shots", `editor_prop_damage_severe_${angle.name}.png`),
  });
}
await page.evaluate(() => {
  window.Taierzhuang.editor.active.previewRoot.rotation.y = 0;
});
await Step(1);

const damagePivotAudit = await page.evaluate(() => {
  const active = window.Taierzhuang.editor.active;
  return active.entries.filter((entry) => entry.damageStates).map((entry) => {
    active.SetPalette(entry.id);
    const cameraBefore = {
      target: active.host.studio.orbit.target.toArray(),
      distance: active.host.studio.orbit.dist,
    };
    const states = {};
    for (const state of ["original", "shellDamaged", "severeDamage"]) {
      active.SetDamageState(state);
      states[state] = {
        anchor: active.previewRoot.userData.previewAnchor,
        position: active.previewRoot.position.toArray(),
        camera: {
          target: active.host.studio.orbit.target.toArray(),
          distance: active.host.studio.orbit.dist,
        },
      };
    }
    return { id: entry.id, cameraBefore, states };
  });
});
const driftingDamageEntries = damagePivotAudit.filter((entry) => Object.values(entry.states)
  .some((state) => state.anchor !== "placementPivot"
    || JSON.stringify(state.position) !== JSON.stringify([0, 0, 0])
    || JSON.stringify(state.camera) !== JSON.stringify(entry.cameraBefore)));
Check("全部战损建筑和地标三档都锁定同一世界原点",
  damagePivotAudit.length >= 10 && driftingDamageEntries.length === 0,
  JSON.stringify(driftingDamageEntries));

const textureLineage = await page.evaluate(async () => {
  const Load = async (name) => {
    const img = new Image();
    img.src = new URL(`./Texture/${name}`, location.href).href;
    await img.decode();
    const canvas = document.createElement("canvas");
    canvas.width = 512; canvas.height = 512;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, 512, 512);
    return ctx.getImageData(0, 0, 512, 512).data;
  };
  const [base, early, severe] = await Promise.all([
    Load("Texture_BrickWallBase.webp"),
    Load("Texture_BuildingDamageEarlyBase.webp"),
    Load("Texture_BuildingDamageSevereBase.webp"),
  ]);
  const regions = [
    [0.30, 0.32, 0.22, 0.19], [0.68, 0.66, 0.22, 0.19],
    [0.55, 0.25, 0.19, 0.17], [0.35, 0.80, 0.19, 0.17],
  ];
  let earlyDiff = 0, severeDiff = 0, samples = 0;
  for (let y = 0; y < 512; y += 4) {
    for (let x = 0; x < 512; x += 4) {
      const inside = regions.some(([cx, cy, rx, ry]) => {
        const dx = x / 512 - cx, dy = y / 512 - cy;
        return (dx * dx) / (rx * rx) + (dy * dy) / (ry * ry) < 1;
      });
      if (inside) continue;
      const p = (y * 512 + x) * 4;
      for (let c = 0; c < 3; c += 1) {
        earlyDiff += Math.abs(base[p + c] - early[p + c]);
        severeDiff += Math.abs(base[p + c] - severe[p + c]);
        samples += 1;
      }
    }
  }
  return { early: earlyDiff / samples, severe: severeDiff / samples };
});
Check("两档贴图在爆点之外逐像素沿用原始砖材",
  textureLineage.early < 8 && textureLineage.severe < 8,
  `early=${textureLineage.early.toFixed(2)} severe=${textureLineage.severe.toFixed(2)}`);

await page.evaluate(() => window.Taierzhuang.editor.active.SetPalette("Paifang"));
await Step(1);
const damageUnavailable = await page.evaluate(() => ({
  selected: window.Taierzhuang.editor.active.paletteId,
  hidden: window.Taierzhuang.editor.active.damageSection.parentElement.hidden,
}));
Check("没有真实战损生成逻辑的地标不显示伪变体",
  damageUnavailable.selected === "Paifang" && damageUnavailable.hidden,
  JSON.stringify(damageUnavailable));

await page.evaluate(() => window.Taierzhuang.editor.active.SetPalette("External_cart"));
await Step(6);
const externalProp = await page.evaluate(() => {
  const active = window.Taierzhuang.editor.active;
  return {
    selected: active.paletteId,
    category: active.cat,
    loaded: active.preview && active.preview.loaded,
    meshes: active.preview ? active.preview.meshes : 0,
    // 精简面板不再展示源码路径，仍核对实际选中资产的来源。
    source: active.Entry(active.paletteId)?.url || "",
  };
});
Check("构件库覆盖正式战场新增的带署名外部 GLB",
  externalProp.selected === "External_cart" && externalProp.loaded && externalProp.meshes > 0
    && externalProp.category === "院落小件"
    && externalProp.source.includes("Model_Handcart.glb"), JSON.stringify(externalProp));

// ---------------------------------------------------------------------------
// 7) 关掉之后有没有还干净
// ---------------------------------------------------------------------------
// 「全部关掉」随入口面板一起去掉了：Debug工具在 设置 → Debug工具 里各自关，高级工具按 ` 退出。
await page.evaluate(() => {
  const T = window.Taierzhuang;
  for (const tool of T.Debug.DebugTools()) if (tool.on && tool.id !== "fps") T.Debug.ToggleDebugTool(tool.id);
});
await page.keyboard.press("Backquote");                       // 退出高级工具
await Step(20);
const restored = await page.evaluate(() => {
  const T = window.Taierzhuang;
  return {
    capturing: T.Debug.Editor().capturing,
    active: T.Debug.Editor().active,
    // Debug工具里关掉 keepOnClose 的 Debug Rendering 之后，送屏回到最终画面
    debugRendering: T.Debug.Editor().debugRendering,
    debugView: T.Debug.Editor().debugView,
    matMode: T.library.gi ? T.library.gi.debugView.value : 0,
    camera: [T.camera.position.x, T.camera.position.y, T.camera.position.z, T.camera.fov],
    weapon: T.viewmodel.weaponId,
    handWeapon: T.Debug.Slots().weapon,
    viewmodel: T.viewmodel.root.visible,
    ground: T.battlefield.GroundHeight(4, 4),
    worldVisible: T.battlefield.meshes.every((m) => m.visible),
    hudHidden: document.body.classList.contains("edHideHud"),
    // Debug Rendering 的两样全局画法：着色模式要还回着色，碰撞体叠加层要摘干净
    shading: T.post.GetShadingMode(),
    debugOverlays: T.post.debugOverlays.size,
  };
});
Check("关掉后不再接管", !restored.capturing && restored.active === null);
Check("Debug工具里关掉 Debug Rendering 后送屏回到最终画面",
  !restored.debugRendering && restored.debugView === "final" && restored.matMode === 0,
  JSON.stringify({ debugRendering: restored.debugRendering, debugView: restored.debugView, matMode: restored.matMode }));
Check("Debug Rendering 关掉后着色模式还回着色、调试叠加层清空",
  restored.shading === "shaded" && restored.debugOverlays === 0,
  JSON.stringify({ shading: restored.shading, debugOverlays: restored.debugOverlays }));
Check("世界与 HUD 都放回来了", restored.worldVisible && !restored.hudHidden && restored.viewmodel);
// 拿当前关的 currentWeapon 比，不拿一开始那次的 —— 中途换过关，
// 那一关的携行本来就不一样；要验的是「视图模型举的是游戏认为你拿着的那一把」。
Check("武器还回玩家手里", restored.weapon === restored.handWeapon,
  `视图模型=${restored.weapon} 手里=${restored.handWeapon}`);
Check("GroundHeight 没被改写", restored.ground === baseline.ground);

// 相机：玩家自己的机位每帧都在被 player.Update 写，所以只验 FOV 与「没被留在天上」
Check("相机交还（FOV 复原）", restored.camera[3] === baseline.camera[3],
  `fov ${baseline.camera[3]} → ${restored.camera[3]}`);

// 玩法恢复：首关故意有 30 秒认路静默期，所以不再拿
// “立刻有人开枪”当恢复信号；直接验只有战斗主循环才会推进的 phaseTime。
const resumed = await page.evaluate(() => {
  const T = window.Taierzhuang;
  const before = { phaseTime: T.state.phaseTime, fire: T.Debug.FireCount() };
  T.StepFrames(180);
  return { before, after: { phaseTime: T.state.phaseTime, fire: T.Debug.FireCount() } };
});
Check("关掉编辑器之后玩法时钟接着走",
  resumed.after.phaseTime > resumed.before.phaseTime + 2.5,
  `关卡 ${resumed.before.phaseTime.toFixed(2)} → ${resumed.after.phaseTime.toFixed(2)} s，`
    + `开火 ${resumed.before.fire} → ${resumed.after.fire}`);

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
// 10) 序章预览（URL 直达）：独立收口、单次交接、无旧 L0 AI
// ---------------------------------------------------------------------------
// 加载画面上**不许**再挂序章入口。序章 2026-09-06 起退出选章、要并进第一关；
// 原来 #bootFoot 里那条「新版序章预览（开发）」链接 2026-09-07 摘掉，玩家看得见的
// 入口一条都不指向已退出正片的内容。这一条守住它不被顺手加回来 ——
// 下面整节验的预览起播与收口全部走 `?preview=CS_Chuchuan` 直达，不依赖任何按钮。
// 走 evaluate 而不是 getAttribute：后者对**不存在**的选择器要等满默认超时才 reject，
// 一条「东西不在」的断言不该花三十秒。
const previewHref = await page.evaluate(() =>
  document.getElementById("bootPreview")?.getAttribute("href") ?? null);
Check("加载画面上不再挂序章预览入口", previewHref === null, `href=${previewHref}`);

// Esc 跳过之后要把**补出来的卡片**也读完才算收口（`cardHold`，出川那张 8.4 s）。
// 原来写的 500 帧 = 8.33 s，比卡片还短 —— 能不能过全看那一刻真实 rAF 多插了几帧，
// 是一枚硬币。这里按卡片时长留足余量（12 s）。
const SKIP_CARD_FRAMES = 720;

async function PreviewPage(query = "?preview=CS_Chuchuan") {
  await page.goto(`http://127.0.0.1:${port}/Taierzhuang1938/${query}`,
    { waitUntil: "load", timeout: 120000 });
  await page.waitForFunction(() => window.Taierzhuang !== undefined
    && window.Taierzhuang.state.ready, null, { timeout: 240000 });
  await page.click("#bootStart");
  await page.waitForFunction(() => window.Taierzhuang.Debug.Preview().playing,
    null, { timeout: 30000 });
  // 起播之后还有一段着色器预热（Script_Main.WarmupShaders）：布景已经建好、
  // 时间轴被按住（`Held`），屏幕上盖着加载画面。这一段几秒到几十秒不等（看机器
  // 与驱动的着色器缓存），期间 StepFrames 一帧都推不动 —— 不等它放开就往下推，
  // 片子还停在第 0 秒，后面每一条都会假红。
  await page.waitForFunction(() => !window.Taierzhuang.cutscene?.Held,
    null, { timeout: 240000 });
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
  // 片长以正在播的 cut.seconds 为准（CHUCHUAN_END 会随排片调整），
  // 硬编码 Notion 定稿秒数在片长变化时会假红；末尾垫 8 帧余量。
  T.StepFrames(Math.ceil(T.cutscene.cut.seconds * 60) + 8, 1 / 60, false);
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
await page.evaluate((n) => window.Taierzhuang.StepFrames(n, 1 / 60, false), SKIP_CARD_FRAMES);
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
await page.evaluate((n) => window.Taierzhuang.StepFrames(n, 1 / 60, false), SKIP_CARD_FRAMES);
const silentLow = { ...silentLowStart,
  done: await page.evaluate(() => window.Taierzhuang.Debug.Preview().done) };
Check("低画质/无音频预览可起播并收口", silentLow.p.playing
  && !silentLow.audio && silentLow.done, JSON.stringify(silentLow));

await PreviewPage();
await page.evaluate(() => window.dispatchEvent(new Event("blur")));
await page.evaluate((n) => window.Taierzhuang.StepFrames(n, 1 / 60, false), SKIP_CARD_FRAMES);
const blurred = await page.evaluate(() => window.Taierzhuang.Debug.Preview());
Check("预览失焦走跳过收口且不启动旧战斗", blurred.done && !blurred.playing
  && blurred.aiAlive === 0, JSON.stringify(blurred));

// ---------------------------------------------------------------------------
// 12) 主菜单 → 高级工具编辑器
//
// 这条专门锁住一个容易被 menu=0 冒烟漏掉的路径：主菜单的活场景有自己的
// 相机循环。若菜单没有在编辑器接管时退出，编辑器就会和菜单运镜叠在同一张画面上。
// （原来用场景关卡编辑器验这条，2026-10-31 该工具删除后改用构件库预览器：交接在
// EditorSuite.Open 的公共入口里，不是哪个工具自己做的。）
// ---------------------------------------------------------------------------
await page.goto(`http://127.0.0.1:${port}/Taierzhuang1938/?quality=low&scale=small&phase=2`,
  { waitUntil: "load", timeout: 120000 });
await page.waitForFunction(() => window.Taierzhuang !== undefined
  && window.Taierzhuang.state.ready && window.Taierzhuang.state.menu, null, { timeout: 240000 });
const menuToEditor = await page.evaluate(() => {
  const T = window.Taierzhuang;
  // 主菜单会把编辑器根节点隐藏；走真实的编辑器打开入口后，必须先收起它。
  T.editor.Open("props");
  return {
    menu: T.state.menu,
    menuVisible: !document.getElementById("menu").classList.contains("off"),
    editor: T.editor.ActiveId,
    capturing: T.editor.Capturing,
  };
});
Check("从主菜单打开编辑器会交还菜单相机",
  !menuToEditor.menu && !menuToEditor.menuVisible && menuToEditor.editor === "props"
    && menuToEditor.capturing, JSON.stringify(menuToEditor));
await page.evaluate(() => window.Taierzhuang.editor.Close());
const returnedToMenu = await page.evaluate(() => ({
  menu: window.Taierzhuang.state.menu,
  visible: !document.getElementById("menu").classList.contains("off"),
}));
Check("关闭编辑器后回到原菜单层", returnedToMenu.menu && returnedToMenu.visible,
  JSON.stringify(returnedToMenu));

// ===========================================================================
// 11) 出图机位：装位姿 → 位姿原样落到相机上 → 关掉把相机投影还干净
// ---------------------------------------------------------------------------
// 它是出图脚本与几支浏览器测试共用的定镜工具（2026-10-31 采样点编辑器删除后留下的最小一块，
// 见 Script_EditorShotCamera 文件头）：位姿在这里装错，所有走它的出图都会错。
await page.evaluate(() => window.Taierzhuang.Debug.OpenEditor("shotCamera"));
await Step(6);
const shotCamera = await page.evaluate(() => {
  const T = window.Taierzhuang;
  const tool = T.editor.active;
  const saved = { fov: T.editor.flycam.saved.fov, far: T.editor.flycam.saved.far };
  const absolute = tool.ApplyPose({ id: "abs", x: 12.5, z: -33.25, y: 40, h: null, yaw: 0.75, pitch: -0.3, fov: 70, far: 900, phase: null });
  const absoluteCamera = {
    x: T.camera.position.x, y: T.camera.position.y, z: T.camera.position.z,
    fov: T.camera.fov, far: T.camera.far, yaw: T.editor.flycam.yaw, pitch: T.editor.flycam.pitch,
  };
  // 没写 y 用 地高 + h；没写 fov / far 退回出厂（不沿用上一份）
  const ground = tool.ApplyPose({ id: "gnd", x: 4, z: 4, y: null, h: 1.7, yaw: 0, pitch: 0, fov: null, far: null, phase: null });
  return {
    saved, absolute, absoluteCamera, ground,
    groundY: T.camera.position.y, groundHeight: T.battlefield.GroundHeight(4, 4),
    viewmodelHidden: !T.viewmodel.root.visible,
    fly: T.editor.flycam.Active,
  };
});
Check("出图机位把位姿原样装到相机上",
  shotCamera.absolute.y === 40 && shotCamera.absoluteCamera.x === 12.5 && shotCamera.absoluteCamera.y === 40
    && shotCamera.absoluteCamera.z === -33.25 && shotCamera.absoluteCamera.fov === 70
    && shotCamera.absoluteCamera.far === 900 && shotCamera.absoluteCamera.yaw === 0.75
    && shotCamera.absoluteCamera.pitch === -0.3,
  JSON.stringify(shotCamera.absoluteCamera));
Check("出图机位没写 y 时取 地高 + h，没写 fov / far 退回出厂值",
  Math.abs(shotCamera.groundY - (shotCamera.groundHeight + 1.7)) < 1e-6
    && shotCamera.ground.far === 620 && shotCamera.ground.fov !== 70,
  JSON.stringify({ y: shotCamera.groundY, ground: shotCamera.groundHeight, fov: shotCamera.ground.fov, far: shotCamera.ground.far }));
Check("出图机位接管相机并藏起视图模型", shotCamera.fly && shotCamera.viewmodelHidden);
await page.evaluate(() => window.Taierzhuang.editor.Close());
await Step(4);
const shotCameraRestored = await page.evaluate(() => ({
  active: window.Taierzhuang.editor.ActiveId,
  fov: window.Taierzhuang.camera.fov,
  far: window.Taierzhuang.camera.far,
  fly: window.Taierzhuang.editor.flycam.Active,
}));
Check("关闭出图机位后相机投影还原",
  !shotCameraRestored.active && !shotCameraRestored.fly
    && Math.abs(shotCameraRestored.fov - shotCamera.saved.fov) < 0.01
    && Math.abs(shotCameraRestored.far - shotCamera.saved.far) < 0.01,
  JSON.stringify(shotCameraRestored));

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
