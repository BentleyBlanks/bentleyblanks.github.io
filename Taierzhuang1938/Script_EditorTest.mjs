// 《滕县 一九三八》编辑器套件冒烟：真浏览器里把五个编辑器一个个打开、用一遍、关掉。
//
// 为什么要有这一层：编辑器是**唯一会去动运行时状态**的一批代码 ——
// 藏世界、换相机、包 GroundHeight、往 city.colliders 里塞盒子、给 viewmodel 换枪。
// 这些操作只要有一处没还回去，表现就是「玩了一会儿之后游戏坏了」，
// 而坏的地方离编辑器已经很远（撞到空气、退出后视角歪了、举着别人的枪）。
// 所以这里的断言重点不是「能不能打开」，而是**关掉之后有没有还干净**。
//
// 用法：node Taierzhuang1938/Script_EditorTest.mjs
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

// ===========================================================================
// 启动（正常模式：要验齿轮按钮真的能点）
// ===========================================================================
await page.goto(`http://127.0.0.1:${port}/Taierzhuang1938/?quality=medium&scale=small&phase=0`,
  { waitUntil: "load", timeout: 120000 });
await page.waitForFunction(() => window.Taierzhuang !== undefined, { timeout: 240000 });

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
    entries: document.querySelectorAll(".edPanel.launcher .edBtn").length,
  };
});
Check("打游戏当中按 ` 弹出入口面板", afterGear.panelOpen && afterGear.capturing,
  `进游戏时指针锁=${locked}`);
// 五个编辑器 + 一个「全部关掉」
Check("面板列出五个编辑器入口", afterGear.entries === 6, `按钮数=${afterGear.entries}`);

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

// 记下相机与武器，退出编辑器时必须原样还回来
const baseline = await page.evaluate(() => {
  const T = window.Taierzhuang;
  return {
    camera: [T.camera.position.x, T.camera.position.y, T.camera.position.z, T.camera.fov],
    weapon: T.viewmodel.weaponId,
    colliders: T.battlefield.city.colliders.length,
    ground: T.battlefield.GroundHeight(4, 4),
  };
});

// ---------------------------------------------------------------------------
// 2) 人物动作编辑器
// ---------------------------------------------------------------------------
await page.click(".edPanel.launcher .edBtn:nth-child(1)");
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
  active.lineup = false;
  active.SetClip("dead");
  window.Taierzhuang.StepFrames(30);
  const ragdoll = !!(active.actors[0] && active.actors[0].ragdollState);
  return {
    id: editor.ActiveId, one, five, kind, source, ragdoll,
    studio: editor.studio.Active,
    worldHidden: !window.Taierzhuang.battlefield.meshes.some((m) => m.visible),
    viewmodelHidden: window.Taierzhuang.viewmodel.root.visible === false,
  };
});
Check("人物编辑器打开", actor.id === "actor" && actor.studio, `kind=${actor.kind}`);
Check("摄影棚把城藏起来了", actor.worldHidden && actor.viewmodelHidden);
Check("单人 / 五人对比", actor.one === 1 && actor.five === 5, `${actor.one} → ${actor.five}`);
Check("倒地动作走到 ragdoll", actor.ragdoll, `meshSource=${actor.source}`);

// ---------------------------------------------------------------------------
// 3) 枪械编辑器
// ---------------------------------------------------------------------------
await page.click(".edPanel.launcher .edBtn:nth-child(2)");
await Step(15);
const weapon = await page.evaluate(() => {
  const editor = window.Taierzhuang.editor;
  const active = editor.active;
  const out = { id: editor.ActiveId };
  active.SetWeapon("Zb26");
  window.Taierzhuang.StepFrames(10);
  out.bench = !!active.benchGroup;
  out.benchMeshes = active.benchGroup ? active.benchGroup.children.length : 0;
  active.SetMode("held");
  window.Taierzhuang.StepFrames(10);
  out.held = !!active.actor && active.actor.weaponId === "Zb26";
  active.SetMode("fp");
  window.Taierzhuang.StepFrames(10);
  out.fp = window.Taierzhuang.viewmodel.weaponId === "Zb26";
  out.fpVisible = window.Taierzhuang.viewmodel.root.visible;
  active.Trigger("fire");
  active.Trigger("reload");
  window.Taierzhuang.StepFrames(20);
  out.busy = typeof window.Taierzhuang.viewmodel.IsBusy === "function";
  // 数据卡：车辆没有几何，不许把台架建崩
  active.SetMode("bench");
  active.SetWeapon("Type89Tank");
  window.Taierzhuang.StepFrames(10);
  out.tankOk = active.benchGroup === null;
  return out;
});
Check("枪械编辑器三视图", weapon.id === "weapon" && weapon.bench && weapon.held && weapon.fp,
  `台架网格=${weapon.benchMeshes} fp可见=${weapon.fpVisible}`);
Check("车辆条目不建台架也不崩", weapon.tankOk);

// ---------------------------------------------------------------------------
// 4) 音效音乐编辑器
// ---------------------------------------------------------------------------
await page.click(".edPanel.launcher .edBtn:nth-child(3)");
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

// 每个配方都要有中文说明（"指认" 那一栏，漏一条就等于列表里有个认不出的名字）
const undescribed = await page.evaluate(async () => {
  const audioModule = await import("./Script_Audio.mjs");
  const editor = window.Taierzhuang.editor.active;
  // 用编辑器自己的过滤器逐类点一遍，凑齐的名字应该等于 SOUND_NAMES
  const seen = new Set();
  for (const cat of ["枪械", "爆炸", "命中", "白刃", "身体", "信号"]) {
    editor.category = cat;
    for (const name of editor.Names()) seen.add(name);
  }
  editor.category = "全部";
  return audioModule.SOUND_NAMES.filter((n) => !seen.has(n));
});
Check("每个配方都有分类与说明", undescribed.length === 0,
  undescribed.length ? `漏了：${undescribed.join(", ")}` : "");

// ---------------------------------------------------------------------------
// 5) Timeline 编辑器
// ---------------------------------------------------------------------------
await page.click(".edPanel.launcher .edBtn:nth-child(4)");
await Step(10);
const timeline = await page.evaluate(() => {
  const editor = window.Taierzhuang.editor;
  const active = editor.active;
  const out = { id: editor.ActiveId, cuts: [] };
  const ids = ["CS_Chuchuan", "CS_LiZongrenTang", "CS_LastWire", "CS_WangMingzhang", "CS_BeimenBreakout"];
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
  return out;
});
Check("Timeline 打开", timeline.id === "timeline");
const seekOk = timeline.cuts.every((c) => c.playing && Math.abs(c.time - 6.0) < 0.4);
Check("五场都能拖到 6.0 s", seekOk,
  timeline.cuts.map((c) => `${c.id}=${c.time}`).join(" "));
const stopped = await page.evaluate(() => window.Taierzhuang.cutscene.Playing);
Check("停下来之后过场不再占着相机", stopped === false);

// ---------------------------------------------------------------------------
// 6) 场景 / 地形编辑器
// ---------------------------------------------------------------------------
await page.click(".edPanel.launcher .edBtn:nth-child(5)");
await Step(15);
const scene = await page.evaluate(() => {
  const T = window.Taierzhuang;
  const editor = T.editor;
  const active = editor.active;
  const out = { id: editor.ActiveId, fly: editor.flycam.Active };
  const before = T.battlefield.city.colliders.length;

  // 摆一个四合院：碰撞盒必须真的进城的格子（否则玩家能穿墙走过去）
  active.SetPalette("Compound");
  active.Place(30, 30);
  out.items = active.items.length;
  out.nodes = active.root.children.length;
  out.colliderGain = T.battlefield.city.colliders.length - before;
  out.nearby = T.battlefield.NearbyColliders(30, 30, 12)
    .filter((b) => b.tag === "editorPlacement").length;

  // 沙包路障走的是 props 通道，最容易「点了没反应」
  active.SetPalette("Barricade");
  active.Place(-20, 10);
  const bar = active.items[active.items.length - 1];
  out.barMeshes = bar.node ? bar.node.children.length : 0;

  // 地形笔刷：网格与解析高程必须一起变
  const groundBefore = T.battlefield.GroundHeight(60, 60);
  active.brush.kind = "crater";
  active.brush.radius = 10;
  active.brush.strength = 1.5;
  active.PaintTerrain(60, 60, false);
  out.groundBefore = Number(groundBefore.toFixed(3));
  out.groundAfter = Number(T.battlefield.GroundHeight(60, 60).toFixed(3));
  out.groundEdge = Number(T.battlefield.GroundHeight(60 + 40, 60).toFixed(3));

  // 存取：导出 → 清空 → 导入，构件数要能回来
  const json = JSON.stringify(active.Serialize());
  active.ClearAll();
  const cleared = active.items.length;
  active.Import(json, false);
  out.roundTrip = `${cleared} → ${active.items.length}`;

  active.ResetTerrain();
  out.groundReset = Number(T.battlefield.GroundHeight(60, 60).toFixed(3));
  active.ClearAll();
  return out;
});
Check("场景编辑器进自由飞行", scene.id === "scene" && scene.fly);
Check("放置的构件进场景且带碰撞盒",
  scene.items === 1 && scene.nodes >= 1 && scene.colliderGain > 0 && scene.nearby > 0,
  `盒子 +${scene.colliderGain}，附近 ${scene.nearby}`);
Check("沙包路障（props 通道）真的建出来了", scene.barMeshes > 0, `网格 ${scene.barMeshes}`);
Check("地形笔刷同时改解析高程",
  scene.groundAfter < scene.groundBefore - 0.3 && scene.groundEdge === scene.groundBefore,
  `${scene.groundBefore} → ${scene.groundAfter}（10 m 外仍 ${scene.groundEdge}）`);
Check("地形能全部还原", scene.groundReset === scene.groundBefore);
Check("场景存取往返", scene.roundTrip === "0 → 2", scene.roundTrip);

// 换关：整片切片被拆掉重建。包过的 GroundHeight、放置层的碰撞盒、地形的位移
// 全都挂在**上一份** city 上，不跟着搬家的话表现是「换完关地形回到原样、
// 摆的东西还在但人能走过去」。这条是场景编辑器最容易坏的一处。
await page.evaluate(() => {
  const active = window.Taierzhuang.editor.active;
  active.SetPalette("Well");
  active.Place(12, 12);
  active.brush.kind = "crater";
  active.PaintTerrain(12, 40, false);
  active.host.game.JumpToLevel(1);
});
await page.waitForFunction(
  () => window.Taierzhuang.state.ready && window.Taierzhuang.Debug.Level().index === 1,
  { timeout: 240000 });
await Step(20);
const jumped = await page.evaluate(() => {
  const T = window.Taierzhuang;
  const active = T.editor.active;
  return {
    level: T.Debug.Level().id,
    items: active.items.length,
    nodes: active.root.children.length,
    patched: !!T.battlefield.__editorBaseGroundHeight,
    solid: T.battlefield.NearbyColliders(12, 12, 6)
      .some((b) => b.tag === "editorPlacement"),
    dented: T.battlefield.GroundHeight(12, 40) < T.battlefield.GroundHeight(12, 90) - 0.3,
  };
});
Check("换关之后放置层与地形跟着搬家",
  jumped.items === 1 && jumped.nodes === 1 && jumped.patched && jumped.solid && jumped.dented,
  `到了 ${jumped.level}，碰撞=${jumped.solid} 地形=${jumped.dented}`);
await page.evaluate(() => {
  const active = window.Taierzhuang.editor.active;
  active.ResetTerrain();
  active.ClearAll();
});

// ---------------------------------------------------------------------------
// 7) 关掉之后有没有还干净
// ---------------------------------------------------------------------------
await page.click(".edPanel.launcher .edBtn:nth-child(6)");   // 全部关掉
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
    leftovers: T.battlefield.city.colliders.filter((b) => b.tag === "editorPlacement").length,
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
await page.waitForFunction(() => window.Taierzhuang !== undefined, { timeout: 240000 });
await Step(10);
const shot = await page.evaluate(() => ({
  hidden: window.Taierzhuang.Debug.Editor().hidden,
  gearVisible: !!document.querySelector(".edGear")
    && document.querySelector(".edGear").getClientRects().length > 0,
  api: typeof window.Taierzhuang.Debug.OpenEditor === "function",
}));
Check("出图模式下编辑器不可见但 API 还在",
  shot.hidden && !shot.gearVisible && shot.api);

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
