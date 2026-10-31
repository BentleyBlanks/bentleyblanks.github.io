// ===========================================================================
// Script_EditorFirstPersonMotionBrowserTest.mjs —— 高级工具「第一人称持枪移动检查」（2026-10-23）的浏览器闸门
//
// 跑法：node Taierzhuang1938/Script_EditorFirstPersonMotionBrowserTest.mjs
// 口径：docs/Data_EditorSuite.md「第一人称持枪移动检查」。场地：白盒编辑器 FirstLevel0105 关键帧 03-1（沟里、上坡）。
//
//   0. node：J / K / L / [ / ] 不在游戏 KEYMAP；机位表齐全；
//   1. 开：叠加层开着、关掉高级工具后玩法照跑；Viewmodel 挂到替身眼睛上，替身眼睛 = 玩家眼睛；
//      主相机离开玩家眼睛、离看的那一点不超过设定距离、不在地面以下；屏幕中心准星藏起；
//   2. 走：玩家照常走（W 前进了）；枪和手默认真实尺寸（深度压缩这一帧是 1，下一帧开头还原成原值）；
//      读数：步频 / 步长出数、着地脚滑动 0（真实脚骨骼）；
//   3. 键：J 换机位、K 慢放（同样帧数走得更短）、L 切回第一人称（主相机回到玩家眼睛）；
//   4. 固定方向机位下原地转视角 40°：胯不跟（上身拧角 ≈ 40°）；
//   5. 关：Viewmodel 挂回主相机、深度压缩与可见性还原、准星回来、慢放归 1；
//   6. 全程没有未捕获错误。截图存 _shots/FirstPersonMotion/（不提交）。
// ===========================================================================

import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { LaunchBrowser } from "../PrairieFire1937/Script_BrowserTestKit.mjs";
import { ServeRoot } from "./Script_DevServer.mjs";
import { KEYMAP } from "./Script_Input.mjs";
import { MOTION_KEYS, MOTION_VIEWS, MOTION_SLOW_STEPS } from "./Script_EditorFirstPersonMotion.mjs";

const projectDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(projectDir, "..");
const shotDir = path.join(projectDir, "_shots", "FirstPersonMotion");
await fs.mkdir(shotDir, { recursive: true });

const results = [];
function Check(name, ok, detail = "") {
  results.push({ name, ok: !!ok, detail });
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? "  — " + detail : ""}`);
}

// 0) node
const gameKeys = new Set(KEYMAP.map((entry) => entry.code));
Check("热键不占游戏键位", Object.values(MOTION_KEYS).every((code) => !gameKeys.has(code)), JSON.stringify(Object.values(MOTION_KEYS)));
Check("机位表：七个机位、id 不重", MOTION_VIEWS.length === 7 && new Set(MOTION_VIEWS.map((v) => v.id)).size === 7);
Check("慢放档从原速起", MOTION_SLOW_STEPS[0] === 1);

const server = await ServeRoot(rootDir, 0);
const browser = await LaunchBrowser();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on("pageerror", (error) => errors.push(`PAGEERROR ${String(error).slice(0, 300)}`));
page.on("console", (message) => {
  if (message.type() !== "error") return;
  const url = message.location()?.url || "";
  if (/fonts\.(googleapis|gstatic)\.com/.test(url)) return;
  if (/__blockout/.test(url) || /__blockout/.test(message.text())) return;
  if (/404/.test(message.text())) return; // 白盒的可选文件（previz / 动作库）按需探测，404 是常态
  errors.push(`CONSOLE ${message.text().slice(0, 240)} @ ${url}`);
});
const B = (fn, arg) => page.evaluate(fn, arg);
const Step = (n = 2) => B((n) => window.Tengxian.StepFrames(n, 1 / 60, false), n);
const State = () => B(() => {
  const T = window.Tengxian, vm = T.viewmodel, ov = T.editor.overlays.get("fpMotion");
  const eye = ov ? ov.eye.getWorldPosition(new T.camera.position.constructor()) : null;
  const facts = {};
  for (const row of document.querySelectorAll(".fpMotion .edFacts .f")) facts[row.querySelector(".k").textContent] = row.querySelector(".v").textContent;
  return {
    on: !!ov, panelOpen: T.editor.panelOpen, viewId: ov?.viewId, slow: ov?.slow, firstPerson: ov?.firstPerson,
    cam: T.camera.position.toArray(), eye: eye?.toArray() ?? null,
    player: T.player.position.toArray(), eyeHeight: T.player.eyeHeight, yaw: T.player.yaw,
    vmOnEye: !!ov && vm.root.parent === ov.eye, vmOnCamera: vm.root.parent === T.camera, vmVisible: vm.root.visible,
    fovRig: vm.fovRig.scale.toArray(), comp: vm.compensation.toArray(),
    observing: document.body.classList.contains("edFpMotionObserver"),
    crosshairShown: [...document.querySelectorAll(".hudCrosshair")].some((el) => getComputedStyle(el).display !== "none"),
    ground: T.editor.editorHost.game.battlefield?.GroundHeight?.(T.camera.position.x, T.camera.position.z),
    probe: vm.body?.Probe?.() ?? null, facts,
  };
});
const Dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

try {
  await page.goto(`http://127.0.0.1:${server.address().port}/Taierzhuang1938/?editor=blockout&level=FirstLevel0105&kf=03-1&scale=small&audio=0`,
    { waitUntil: "load", timeout: 180000 });
  await page.waitForFunction(() => window.Tengxian?.state?.ready && window.Tengxian?.Debug?.Blockout?.State().ready, null, { timeout: 300000 });
  await B(() => { const T = window.Tengxian; T.player.health = 100; T.player.spawnGrace = 999; });
  await Step(10);
  const before = await State();
  const comp0 = before.comp;

  // 1) 开
  console.log("--- open");
  await B(() => { const ed = window.Tengxian.editor; ed.TogglePanel(true); ed.Toggle("fpMotion"); ed.TogglePanel(false); });
  await Step(4);
  const s1 = await State();
  const view = await B(() => window.Tengxian.editor.overlays.get("fpMotion")?.viewId);
  Check("菜单（武器）里能开，关掉高级工具后叠加层还在、玩法不暂停", s1.on && !s1.panelOpen, JSON.stringify({ on: s1.on, panelOpen: s1.panelOpen }));
  Check("Viewmodel 挂在替身眼睛上", s1.vmOnEye);
  const eyeWant = [s1.player[0], s1.player[1] + s1.eyeHeight, s1.player[2]];
  Check("替身眼睛 = 玩家眼睛（走路晃动 / 侧身 ≤ 0.12 m）", s1.eye && Dist(s1.eye, eyeWant) < 0.12, JSON.stringify({ eye: s1.eye, want: eyeWant }));
  const preset = MOTION_VIEWS.find((v) => v.id === view) || MOTION_VIEWS[0];
  Check("主相机离开玩家眼睛、在设定距离以内、不在地面以下",
    Dist(s1.cam, s1.eye) > 0.3 && Dist(s1.cam, s1.player) < preset.dist + 1.8 && (!Number.isFinite(s1.ground) || s1.cam[1] >= s1.ground + 0.1),
    JSON.stringify({ cam: s1.cam, eye: s1.eye, view }));
  Check("外部机位时屏幕中心准星藏起", s1.observing && !s1.crosshairShown);
  await page.screenshot({ path: path.join(shotDir, "Test_1_Open.png") });

  // 2) 走
  console.log("--- walk");
  await B(() => { const T = window.Tengxian; T.Debug.Key("KeyW", true); T.StepFrames(150, 1 / 60, false); });
  const s2 = await State();
  const walked = Math.hypot(s2.player[0] - s1.player[0], s2.player[2] - s1.player[2]);
  Check("玩家照常走（W 2.5 s 走出去 > 3 m）", walked > 3, `${walked.toFixed(2)} m`);
  Check("枪和手默认真实尺寸：观察这一帧深度压缩是 1", s2.fovRig.every((v) => Math.abs(v - 1) < 1e-6), JSON.stringify(s2.fovRig));
  Check("读数：步频 / 步长有数", /步\/秒/.test(s2.facts["步频 / 步长"] || ""), s2.facts["步频 / 步长"]);
  const slip = parseFloat(s2.facts["着地脚滑动（近 2 秒）"] || "NaN");
  Check("读数：着地脚滑动 ≤ 1 mm/帧（真实脚骨骼）", slip <= 1, s2.facts["着地脚滑动（近 2 秒）"]);
  await page.screenshot({ path: path.join(shotDir, "Test_2_Walk.png") });

  // 3) 键
  console.log("--- keys");
  await page.keyboard.press(MOTION_KEYS.cycleView);
  const s3a = await State();
  Check("J 换到下一个机位", s3a.viewId !== s2.viewId, `${s2.viewId} → ${s3a.viewId}`);
  const p0 = (await State()).player;
  await Step(30);
  const fast = Math.hypot((await State()).player[0] - p0[0], (await State()).player[2] - p0[2]);
  await page.keyboard.press(MOTION_KEYS.slowMo); await page.keyboard.press(MOTION_KEYS.slowMo);
  const s3b = await State();
  const p1 = s3b.player;
  await Step(30);
  const slow = Math.hypot((await State()).player[0] - p1[0], (await State()).player[2] - p1[2]);
  Check("K 慢放：0.25× 时同样 30 帧走的路约是原速的 1/4", s3b.slow === 0.25 && slow < fast * 0.4 && slow > fast * 0.1, JSON.stringify({ slow: s3b.slow, fast: fast.toFixed(3), slowM: slow.toFixed(3) }));
  await page.keyboard.press(MOTION_KEYS.slowMo); await page.keyboard.press(MOTION_KEYS.slowMo);
  await B(() => window.Tengxian.Debug.Key("KeyW", false));
  await Step(60);
  await page.keyboard.press(MOTION_KEYS.firstPerson);
  await Step(2);
  const s3c = await State();
  Check("L 切回第一人称：主相机回到玩家眼睛、准星回来", s3c.firstPerson && Dist(s3c.cam, s3c.eye) < 1e-3 && !s3c.observing && s3c.crosshairShown,
    JSON.stringify({ d: Dist(s3c.cam, s3c.eye), observing: s3c.observing }));
  await page.keyboard.press(MOTION_KEYS.firstPerson);
  await Step(2);
  Check("L 再按一次回到外部机位", !(await State()).firstPerson && Dist((await State()).cam, (await State()).eye) > 0.3);

  // 4) 原地转视角：固定方向机位
  console.log("--- turn");
  await B(() => { const ov = window.Tengxian.editor.overlays.get("fpMotion"); ov.SetView("rearRight"); ov.SetFollow(false); });
  await Step(30);
  await B(() => { const T = window.Tengxian; for (let i = 0; i < 40; i++) { T.player.yaw += Math.PI / 180; T.StepFrames(1, 1 / 60, false); } T.StepFrames(10, 1 / 60, false); });
  const s4 = await State();
  const twist = s4.probe ? s4.probe.twist * 180 / Math.PI : NaN;
  Check("固定机位下原地转视角 40°：胯不跟、上身拧过去（拧角 ≈ 40°）", Math.abs(twist - 40) < 3, `${twist.toFixed(1)}°`);
  await page.screenshot({ path: path.join(shotDir, "Test_4_Turn40.png") });

  // 5) 关
  console.log("--- close");
  await B(() => window.Tengxian.editor.ToggleOverlay("fpMotion"));
  await Step(3);
  const s5 = await State();
  Check("关：Viewmodel 挂回主相机、可见", !s5.on && s5.vmOnCamera && s5.vmVisible);
  Check("关：深度压缩还原成原值", s5.fovRig.every((v, i) => Math.abs(v - s5.comp[i]) < 1e-6) && s5.comp.every((v, i) => Math.abs(v - comp0[i]) < 1e-6),
    JSON.stringify({ fovRig: s5.fovRig, comp: s5.comp, comp0 }));
  Check("关：主相机回到玩家眼睛、准星回来、慢放归原速", Dist(s5.cam, [s5.player[0], s5.player[1] + s5.eyeHeight, s5.player[2]]) < 0.12 && !s5.observing && s5.crosshairShown
    && await B(() => window.Tengxian.editor.ScaleDt(1) === 1));

  Check("全程没有未捕获错误", errors.length === 0, errors.slice(0, 5).join(" | "));
} finally {
  await browser.close();
  server.close();
}

const failed = results.filter((r) => !r.ok);
console.log(`EditorFirstPersonMotionBrowserTest: ${results.length - failed.length}/${results.length} passed`);
assert.equal(failed.length, 0, failed.map((r) => r.name).join("; "));
