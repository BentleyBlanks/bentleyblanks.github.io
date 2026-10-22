// ===========================================================================
// Script_EditorBlockoutTouchBrowserTest.mjs —— 白盒编辑器「手机验收」触屏层（§4.5，2026-10-23）的浏览器闸门
//
// 跑法：node Taierzhuang1938/Script_EditorBlockoutTouchBrowserTest.mjs [--no-shots]
// 口径：docs/Data_EditorBlockout.md §4.5。关卡 FirstLevel0105（每个关键帧都有预演）。
// 触摸全走 CDP 的 Input.dispatchTouchEvent（真触摸事件 → 浏览器自己派 pointer 事件，能多指），不合成 PointerEvent。
//
//   0. node：WantsTouch 的开关与设备猜测；StickAxes 的死区、方向、圈外；
//   1. 手机竖屏（390×844，isMobile + hasTouch，不带 touch 参数）：自动开触屏层；小地图 / 键盘提示 / 弹药读数收起，
//      第一人称枪模照旧可见（画面不割舍）；卡片、图层按钮、齿轮、导航栏、摇杆、大按钮都在屏内且互不重叠，按钮 ≥ 44 px；
//   2. 卡片默认收成一行，点标题展开、再点收起；
//   3. 空处单指拖动 = 转视角（向右拖 → 往右转）；
//   4. 摇杆：往上推 = 往前走（移动意图沿视线、真的走出去），松手停；拖出圈外 = 冲刺（更快）；摇杆与转视角两根手指同时用；
//   5. 飞行：点「飞行」进，摇杆推相机、「升」按住升高、「加速」×4，玩家原地；再点退出，加速复位；
//   6. 预演：点「预演」开播，摇杆变暗、其余大按钮收起、拖动不转头；点「停止」中断；
//   7. 总图：点「地图」开，双指张开放大、两下快点回到全图、手指点在关键帧点旁 14 px 也能选中跳转；关闭按钮关图；
//   8. 「图层」按钮展开面板、点图层开关有效、点空处收起；导航栏「下一个」能点；
//   9. 横过来（844×390）：同样在屏内、不重叠；
//  10. 桌面（1440×900，无触屏）：不开触屏层，小地图、右上工具条照旧；
//  11. 全程没有未捕获错误。截图存 _shots/EditorBlockoutTouch/（不提交）。
// ===========================================================================

import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { LaunchBrowser } from "../PrairieFire1937/Script_BrowserTestKit.mjs";
import { ServeRoot } from "./Script_DevServer.mjs";
import { BLOCKOUT_TOUCH, StickAxes, WantsTouch } from "./Script_EditorBlockoutTouch.mjs";

const projectDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(projectDir, "..");
const shotDir = path.join(projectDir, "_shots", "EditorBlockoutTouch");
await fs.mkdir(shotDir, { recursive: true });
const shots = !process.argv.includes("--no-shots");

const results = [];
function Check(name, ok, detail = "") {
  results.push({ name, ok: !!ok, detail });
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? "  — " + detail : ""}`);
}
const J = (v) => JSON.stringify(v);
const LEVEL = "FirstLevel0105";

// ---------------------------------------------------------------------------
// 0) node 里的纯规则
console.log("--- node checks");
{
  const media = (matches) => ({ matchMedia: () => ({ matches }) });
  Check("WantsTouch：touch=1 / 0 强制，不写按设备猜（粗指针 + 不能悬停）",
    WantsTouch(new URLSearchParams("touch=1"), media(false)) && !WantsTouch(new URLSearchParams("touch=0"), media(true))
    && WantsTouch(new URLSearchParams(""), media(true)) && !WantsTouch(new URLSearchParams(""), media(false)) && !WantsTouch(null, {}));
  const R = BLOCKOUT_TOUCH.stickRadiusPx;
  const dead = StickAxes(R * 0.1, 0), up = StickAxes(0, -R), right = StickAxes(R * 0.6, 0), far = StickAxes(0, -R * 1.5);
  Check("StickAxes：死区里全 0；往上推满 = 前进 1；往右 = 右移；拖出圈外 over 且仍夹在 1",
    dead.forward === 0 && dead.strafe === 0 && Math.abs(up.forward - 1) < 1e-9 && Math.abs(up.strafe) < 1e-9 && !up.over
    && right.strafe > 0.5 && right.strafe < 0.6 && Math.abs(right.forward) < 1e-9 && far.over && Math.abs(far.forward - 1) < 1e-9,
    J({ up, right, far }));
}

// ---------------------------------------------------------------------------
// 浏览器
const server = await ServeRoot(rootDir, 0);
const port = server.address().port;
const browser = await LaunchBrowser();
const errors = [];
function Watch(page) {
  page.on("pageerror", (error) => errors.push(`PAGEERROR ${String(error).slice(0, 300)}`));
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    const url = message.location()?.url || "";
    if (/fonts\.(googleapis|gstatic)\.com/.test(url)) return;
    if (/__blockout/.test(url) || /__blockout/.test(message.text())) return;
    if (/\.previz\.json(\?|$)/.test(url) && /404/.test(message.text())) return;
    if (/\/Animation\/Previz\w+\/Data_Previz\w+Animation\.json/.test(url) && /404/.test(message.text())) return;
    errors.push(`CONSOLE ${message.text().slice(0, 240)} @ ${url}`);
  });
}
const URL_OF = (extra = "") => `http://127.0.0.1:${port}/Taierzhuang1938/?editor=blockout&level=${LEVEL}&quality=whitebox&scale=small&audio=0${extra}`;
async function Boot(page, extra = "") {
  await page.goto(URL_OF(extra), { waitUntil: "load", timeout: 180000 });
  await page.waitForFunction(() => window.Tengxian?.state?.ready && window.Tengxian?.Debug?.Blockout?.State().ready, null, { timeout: 300000 });
  await page.evaluate(() => window.Tengxian.StepFrames(4, 1 / 60, false));
}

/** 屏内可见元素的矩形（display:none / 不可见 → null）。 */
const RECT_SELECTORS = { card: ".boCard", menu: ".boTouchMenuBtn", gear: ".edGear", nav: ".boNav", stick: ".boStick", actions: ".boTouchActions", fly: ".boTouchFly" };
function Rects(page) {
  return page.evaluate((sel) => {
    const out = { vw: innerWidth, vh: innerHeight };
    for (const [k, s] of Object.entries(sel)) {
      const e = document.querySelector(s);
      if (!e) { out[k] = null; continue; }
      const cs = getComputedStyle(e);
      const r = e.getBoundingClientRect();
      out[k] = cs.display === "none" || cs.visibility === "hidden" || r.width === 0 ? null
        : { l: Math.round(r.left), t: Math.round(r.top), r: Math.round(r.right), b: Math.round(r.bottom) };
    }
    return out;
  }, RECT_SELECTORS);
}
function LayoutProblems(rects) {
  const names = Object.keys(RECT_SELECTORS).filter(k => rects[k]);
  const bad = [];
  for (const k of names) {
    const r = rects[k];
    if (r.l < 0 || r.t < 0 || r.r > rects.vw || r.b > rects.vh) bad.push(`${k} 出屏 ${J(r)}`);
  }
  for (let i = 0; i < names.length; i++) for (let j = i + 1; j < names.length; j++) {
    const a = rects[names[i]], b = rects[names[j]];
    if (a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b) bad.push(`${names[i]} 压着 ${names[j]}`);
  }
  return bad;
}

try {
  // -------------------------------------------------------------------------
  // 1) 手机竖屏
  console.log("--- phone portrait");
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: `http://127.0.0.1:${port}` }).catch(() => {});
  const page = await context.newPage();
  Watch(page);
  const cdp = await context.newCDPSession(page);
  const B = (fn, arg) => page.evaluate(fn, arg);
  const Step = (n = 2) => B((n) => window.Tengxian.StepFrames(n, 1 / 60, false), n);
  const Shot = async (name) => { if (shots) await page.screenshot({ path: path.join(shotDir, `${name}.png`) }); };
  async function Wait(predicate, arg, timeout = 15000) {
    try { await page.waitForFunction(predicate, arg, { timeout, polling: 50 }); return true; } catch (error) { return false; }
  }
  const TouchState = () => B(() => window.Tengxian.Debug.Blockout.Touch());
  const PlayerNow = () => B(() => { const p = window.Tengxian.player; return { x: p.position.x, y: p.position.y, z: p.position.z, yaw: p.yaw, wx: p.moveWishX, wz: p.moveWishZ }; });
  const BState = () => B(() => window.Tengxian.Debug.Blockout.State());
  const FlyState = () => B(() => window.Tengxian.Debug.Blockout.FlyState());
  /** 推 n 帧，前后各取一次玩家 / 飞行相机（同一个 evaluate 里，真实的 rAF 帧混不进来）。 */
  const Measure = (n) => B((n) => {
    const T = window.Tengxian, b = T.Debug.Blockout;
    const Pl = () => { const p = T.player; return { x: p.position.x, y: p.position.y, z: p.position.z, yaw: p.yaw, wx: p.moveWishX, wz: p.moveWishZ }; };
    const Fl = () => { const f = b.FlyState(); return { x: f.x, y: f.y, z: f.z, boost: f.boost, active: f.active }; };
    const a = { p: Pl(), f: Fl() };
    T.StepFrames(n, 1 / 60, false);
    return { a, b: { p: Pl(), f: Fl() } };
  }, n);
  const Center = (sel) => B((s) => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, sel);
  const Visible = (sel) => B((s) => { const e = document.querySelector(s); if (!e) return false; const cs = getComputedStyle(e); const r = e.getBoundingClientRect(); return cs.display !== "none" && cs.visibility !== "hidden" && r.width > 0; }, sel);
  // CDP 触摸：points = [{x, y, id}]；touchEnd 不带点（全部抬起）
  const TouchEv = (type, points = []) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: points.map(p => ({ x: p.x, y: p.y, id: p.id ?? 0, radiusX: 3, radiusY: 3, force: 1 })) });
  async function Tap(at) { await TouchEv("touchStart", [{ ...at, id: 1 }]); await TouchEv("touchEnd"); await page.waitForTimeout(60); }
  async function TapSel(sel) { const c = await Center(sel); if (!c) throw new Error("没有 " + sel); await Tap(c); }
  async function Drag(from, to, { steps = 8, id = 1, keep = false } = {}) {
    await TouchEv("touchStart", [{ ...from, id }]);
    for (let i = 1; i <= steps; i++) await TouchEv("touchMove", [{ x: from.x + (to.x - from.x) * i / steps, y: from.y + (to.y - from.y) * i / steps, id }]);
    if (!keep) await TouchEv("touchEnd");
    // Chrome 把 touchmove / pointermove 对齐到下一帧再派：手指还按着时等最后那一下落地再量
    else await page.waitForTimeout(150);
  }

  await Boot(page);   // 不带 touch 参数：靠设备猜
  const t0 = await TouchState();
  const auto = await B(() => ({
    body: document.body.classList.contains("blockoutTouch"), root: document.querySelector(".boRoot")?.classList.contains("boTouch"),
    pad: !!document.getElementById("blockoutTouchLook"), gun: window.Tengxian.viewmodel.root.visible,
  }));
  Check("手机上不带 touch 参数自动开触屏层；转视角的透明板挂上", !!t0 && auto.body && auto.root && auto.pad, J(auto));
  const hidden = await B(() => ["boMini", "boKeys", "boSave", "boPrevizBtn", "boFlyBtn"].map(c => {
    const e = document.querySelector("." + c); return e ? getComputedStyle(e).display : "none";
  }).concat([".hudCombat", ".hudState"].map(s => { const e = document.querySelector("#hud " + s); return e ? getComputedStyle(e).display : "none"; })));
  Check("收起：小地图、键盘提示、记机位、卡片上的预演 / 飞行钮、弹药与状态读数", hidden.every(d => d === "none"), J(hidden));
  Check("画面不割舍：第一人称枪模照旧可见", auto.gun === true);
  const rect0 = await Rects(page);
  const bad0 = LayoutProblems(rect0);
  Check("竖屏：卡片 / 图层按钮 / 齿轮 / 导航栏 / 摇杆 / 大按钮都在屏内、互不重叠", bad0.length === 0 && rect0.card && rect0.nav && rect0.stick && rect0.actions && rect0.menu,
    bad0.join("; ") || J(rect0));
  const sizes = await B(() => [".boPrev", ".boNextBtn", ".boReplay", ".boTouchFlyBtn", ".boTouchMap", ".boTouchPreviz"].map(s => {
    const r = document.querySelector(s)?.getBoundingClientRect(); return r ? Math.min(r.width, r.height) : 0; }));
  Check("手指按的按钮都 ≥ 44 px", sizes.every(v => v >= 44), J(sizes));
  await Shot("Portrait");

  // 2) 卡片收起 / 展开
  const lineShown = () => Visible(".boWhat");
  const collapsed0 = !(await lineShown());
  await TapSel(".boCardTitle");
  const expanded = await lineShown();
  await Shot("Portrait_CardOpen");
  await TapSel(".boCardTitle");
  const collapsed1 = !(await lineShown());
  Check("卡片默认收成一行，点标题展开、再点收起", collapsed0 && expanded && collapsed1, J({ collapsed0, expanded, collapsed1 }));

  // 3) 转视角：空处向右拖 120 px
  const empty = { x: 195, y: 420 };
  const yaw0 = (await PlayerNow()).yaw;
  await Drag(empty, { x: empty.x + 120, y: empty.y }, { steps: 10 });
  await Step(2);
  const yaw1 = (await PlayerNow()).yaw;
  const t3 = await TouchState();
  Check("空处向右拖 = 往右转（yaw 变小），转多少跟拖多远走", yaw1 < yaw0 - 0.2 && Math.abs(t3.look.dx - 120 * BLOCKOUT_TOUCH.lookScale) < 1,
    J({ dYawDeg: +((yaw1 - yaw0) * 180 / Math.PI).toFixed(1), lookDx: t3.look.dx }));

  // 4) 摇杆走路：放到开阔处、朝北站
  await B(() => window.Tengxian.Debug.Blockout.GoTo("03-1", { animate: false }));
  await Step(6);
  const stickC = await Center(".boStick");
  const R = BLOCKOUT_TOUCH.stickRadiusPx;
  await Drag(stickC, { x: stickC.x, y: stickC.y - R * 0.95 }, { steps: 6, keep: true });
  const tHold = await TouchState();
  await Step(20);   // 起步加速走完再量
  const walk = await Measure(60);
  const W0 = walk.a.p, W1 = walk.b.p;
  await TouchEv("touchEnd");
  await Step(30);
  const W2 = await PlayerNow();
  await Step(30);
  const W3 = await PlayerNow();
  const fwd = { x: -Math.sin(W0.yaw), z: -Math.cos(W0.yaw) };
  const walked = (W1.x - W0.x) * fwd.x + (W1.z - W0.z) * fwd.z;
  const wishAlong = W1.wx * fwd.x + W1.wz * fwd.z;
  const t4 = await TouchState();
  Check("摇杆往上推：移动意图沿视线向前，真的往前走出去", tHold.stick.active && tHold.stick.forward > 0.8 && wishAlong > 0.8 && walked > 1.0,
    J({ forward: +tHold.stick.forward.toFixed(2), wishAlong: +wishAlong.toFixed(2), walked: +walked.toFixed(2) }));
  Check("松手就停：摇杆归零、人不再走", !t4.stick.active && t4.stick.forward === 0 && Math.hypot(W3.x - W2.x, W3.z - W2.z) < 0.05,
    J({ drift: +Math.hypot(W3.x - W2.x, W3.z - W2.z).toFixed(3) }));
  // 冲刺：同样 60 帧，拖出圈外走得更远
  await Drag(stickC, { x: stickC.x, y: stickC.y - R * 1.6 }, { steps: 6, keep: true });
  const tSprint = await TouchState();
  await Step(20);
  const sprint = await Measure(60);
  const S0 = sprint.a.p, S1 = sprint.b.p;
  await TouchEv("touchEnd");
  await Step(20);
  const sprinted = (S1.x - S0.x) * -Math.sin(S0.yaw) + (S1.z - S0.z) * -Math.cos(S0.yaw);
  Check("摇杆拖出圈外 = 冲刺：圈亮起、同样时间走得更远", tSprint.stick.over && sprinted > walked * 1.15, J({ walked: +walked.toFixed(2), sprinted: +sprinted.toFixed(2) }));
  // 两根手指：摇杆 + 转视角同时
  const lookBefore = (await TouchState()).look.events;
  const M0 = await PlayerNow();
  await TouchEv("touchStart", [{ ...stickC, id: 1 }]);
  await TouchEv("touchMove", [{ x: stickC.x, y: stickC.y - R, id: 1 }]);
  await TouchEv("touchStart", [{ x: stickC.x, y: stickC.y - R, id: 1 }, { ...empty, id: 2 }]);
  for (let i = 1; i <= 6; i++) await TouchEv("touchMove", [{ x: stickC.x, y: stickC.y - R, id: 1 }, { x: empty.x - i * 10, y: empty.y, id: 2 }]);
  const tBoth = await TouchState();
  await Step(30);
  const M1 = await PlayerNow();
  await TouchEv("touchEnd");
  await Step(10);
  Check("两根手指同时：一根推摇杆走、一根拖着转头", tBoth.stick.active && tBoth.look.active && tBoth.look.events > lookBefore && Math.hypot(M1.x - M0.x, M1.z - M0.z) > 0.4 && M1.yaw > M0.yaw,
    J({ moved: +Math.hypot(M1.x - M0.x, M1.z - M0.z).toFixed(2), dYaw: +(M1.yaw - M0.yaw).toFixed(3) }));

  // 5) 飞行
  console.log("--- fly");
  const P5 = await PlayerNow();
  await TapSel(".boTouchFlyBtn");
  await Step(2);
  const f0 = await FlyState();
  const flyUi = await B(() => ({ col: getComputedStyle(document.querySelector(".boTouchFly")).display, label: document.querySelector(".boTouchFlyBtn .boTouchLabel").textContent }));
  Check("点「飞行」进飞行观察；升 / 降 / 加速那一列出来，按钮写「退出」", f0.active && flyUi.col !== "none" && flyUi.label === "退出", J(flyUi));
  await B((p) => window.Tengxian.Debug.Blockout.FlyPose({ x: p.x, y: p.y + 12, z: p.z, yawDeg: p.yaw * 180 / Math.PI, pitchDeg: 0 }), P5);
  await Step(1);
  await Drag(stickC, { x: stickC.x, y: stickC.y - R }, { steps: 4, keep: true });
  const flyRun = await Measure(60);
  const F0 = flyRun.a.f, F1 = flyRun.b.f;
  await TouchEv("touchEnd");
  await Step(2);
  const flyDist = Math.hypot(F1.x - F0.x, F1.z - F0.z);
  Check("飞行中摇杆推相机：1 s 走 ≈ 速度（8 m/s）× 推的量；高度不变", flyDist > 7.5 && flyDist < 8.5 && Math.abs(F1.y - F0.y) < 0.05, J({ flyDist: +flyDist.toFixed(2), dy: +(F1.y - F0.y).toFixed(3) }));
  const upC = await Center(".boTouchUp");
  await TouchEv("touchStart", [{ ...upC, id: 3 }]);
  const riseRun = await Measure(30);
  await TouchEv("touchEnd");
  await Step(2);
  const riseDy = riseRun.b.f.y - riseRun.a.f.y;
  Check("按住「升」：相机竖直升高（0.5 s ≈ 4 m）", riseDy > 3.5 && riseDy < 4.5, J({ dy: +riseDy.toFixed(2) }));
  await TapSel(".boTouchBoost");
  await Drag(stickC, { x: stickC.x, y: stickC.y - R }, { steps: 4, keep: true });
  const boostRun = await Measure(30);
  const F3 = boostRun.a.f, F4 = boostRun.b.f;
  await TouchEv("touchEnd");
  await Step(2);
  const boostDist = Math.hypot(F4.x - F3.x, F4.z - F3.z);
  Check("「加速」开关：×4（0.5 s ≈ 16 m）", F3.boost && boostDist > 15 && boostDist < 17, J({ boost: F3.boost, boostDist: +boostDist.toFixed(2) }));
  const P5b = await PlayerNow();
  Check("飞行中玩家原地不动", Math.hypot(P5b.x - P5.x, P5b.z - P5.z) < 0.02, J({ moved: Math.hypot(P5b.x - P5.x, P5b.z - P5.z) }));
  await Shot("Portrait_Fly");
  await TapSel(".boTouchFlyBtn");
  await Step(2);
  const f5 = await FlyState();
  const t5 = await TouchState();
  Check("再点退出飞行，加速开关复位", !f5.active && !t5.boost && !(await Visible(".boTouchFly")));

  // 6) 预演
  console.log("--- previz");
  Check("这一帧有预演：右下出现「预演」大按钮", await Visible(".boTouchPreviz"));
  await TapSel(".boTouchPreviz");
  const playing = await Wait(() => window.Tengxian.Debug.Blockout.Previz.State().playing, null, 180000);
  await Step(2);
  const pv = await B(() => ({
    stickPe: getComputedStyle(document.querySelector(".boStick")).pointerEvents,
    fly: getComputedStyle(document.querySelector(".boTouchFlyBtn")).display, map: getComputedStyle(document.querySelector(".boTouchMap")).display,
    label: document.querySelector(".boTouchPreviz .boTouchLabel").textContent,
  }));
  Check("点「预演」开播：摇杆变暗不吃手指，飞行 / 地图钮收起，预演钮写「停止」", playing && pv.stickPe === "none" && pv.fly === "none" && pv.map === "none" && pv.label === "停止", J(pv));
  const lookBeforePv = (await TouchState()).look.events;
  await Drag(empty, { x: empty.x + 80, y: empty.y }, { steps: 5 });
  Check("预演中拖动不转头", (await TouchState()).look.events === lookBeforePv);
  await Shot("Portrait_Previz");
  await TapSel(".boTouchPreviz");
  const stopped = await Wait(() => !window.Tengxian.Debug.Blockout.Previz.State().playing, null, 8000);
  Check("点「停止」中断预演", stopped);
  await Step(3);

  // 7) 总图
  console.log("--- map");
  await TapSel(".boTouchMap");
  await Step(2);
  const m0 = await B(() => window.Tengxian.Debug.Blockout.MapView());
  Check("点「地图」开全关总图，摇杆与大按钮收起", m0?.open && !(await Visible(".boStick")) && !(await Visible(".boTouchActions")), J(m0));
  const mc = await Center(".boMapCanvas");
  await TouchEv("touchStart", [{ x: mc.x - 30, y: mc.y, id: 1 }]);
  await TouchEv("touchStart", [{ x: mc.x - 30, y: mc.y, id: 1 }, { x: mc.x + 30, y: mc.y, id: 2 }]);
  for (let i = 1; i <= 8; i++) await TouchEv("touchMove", [{ x: mc.x - 30 - i * 8, y: mc.y, id: 1 }, { x: mc.x + 30 + i * 8, y: mc.y, id: 2 }]);
  await TouchEv("touchEnd");
  await page.waitForTimeout(80);
  const m1 = await B(() => window.Tengxian.Debug.Blockout.MapView());
  const ratio = m1.pxPerM / m0.pxPerM;
  Check("双指张开 = 放大（两指间距 60 → 188 px，比例约 ×3.1）", ratio > 2.6 && ratio < 3.6 && m0.kfIndex === m1.kfIndex, J({ ratio: +ratio.toFixed(2) }));
  await Shot("Portrait_Map");
  // 两下快点回到全图：先挪到一个没有关键帧的角上
  const corner = { x: mc.x - 120, y: mc.y + 160 };
  const indexBeforeTap = (await BState()).index;
  await Tap(corner);
  await page.waitForTimeout(80);
  await Tap(corner);
  await page.waitForTimeout(80);
  const m2 = await B(() => window.Tengxian.Debug.Blockout.MapView());
  Check("两下快点 = 回到全图（比例回到比打开时还小）", m2.pxPerM < m0.pxPerM, J({ before: +m1.pxPerM.toFixed(2), after: +m2.pxPerM.toFixed(2), index: [indexBeforeTap, (await BState()).index] }));
  // 手指点在关键帧点旁 14 px（鼠标的拾取半径 11 px 够不着）也能选中
  const target = "05-1";
  const kfPos = await B(() => { const b = window.Tengxian.Debug.Blockout; const kf = b.Config().keyframes.find(k => k.id === "05-1"); return kf.player; });
  await B((p) => window.Tengxian.Debug.Blockout.LayoutEdit.Focus(p.x, p.z, 6), kfPos);
  await page.waitForTimeout(60);
  const pt = await B((id) => window.Tengxian.Debug.Blockout.MapPoint(id), target);
  await Tap({ x: pt.x + 14, y: pt.y });
  const jumped = await Wait((id) => window.Tengxian.Debug.Blockout.State().id === id, target, 10000);
  Check("手指点在关键帧点旁 14 px 也能选中跳转", jumped, J({ id: (await BState()).id }));
  await TapSel(".boMapHead .boClose");
  await Step(2);
  Check("关闭按钮关图，摇杆回来", !(await B(() => window.Tengxian.Debug.Blockout.MapView()?.open)) && await Visible(".boStick"));

  // 8) 图层面板与导航栏
  console.log("--- menu / nav");
  await TapSel(".boTouchMenuBtn");
  const menuOpen = await Visible(".boTopBar");
  const rectMenu = await B(() => { const r = document.querySelector(".boTopBar").getBoundingClientRect(); return { l: r.left, r: r.right, t: r.top, b: r.bottom, vw: innerWidth, vh: innerHeight }; });
  const pressed0 = await B(() => document.querySelector('.boLayer[data-layer="intents"]').getAttribute("aria-pressed"));
  await Shot("Portrait_Menu");
  await TapSel('.boLayer[data-layer="intents"]');
  const pressed1 = await B(() => document.querySelector('.boLayer[data-layer="intents"]').getAttribute("aria-pressed"));
  await Tap(empty);
  const menuClosed = !(await Visible(".boTopBar"));
  Check("「图层」按钮展开面板（在屏内）、图层开关能点、点空处收起", menuOpen && rectMenu.l >= 0 && rectMenu.r <= rectMenu.vw && rectMenu.b <= rectMenu.vh
    && pressed0 !== pressed1 && menuClosed, J({ menuOpen, pressed0, pressed1, menuClosed }));
  await B(() => window.Tengxian.Debug.Blockout.SetLayers({ intents: true }));
  const idx0 = (await BState()).index;
  await TapSel(".boNextBtn");
  const advanced = await Wait((i) => window.Tengxian.Debug.Blockout.State().index === i + 1, idx0, 10000);
  Check("导航栏「下一个」用手指能点", advanced, J({ from: idx0, to: (await BState()).index }));

  // 9) 横过来
  console.log("--- phone landscape");
  await page.setViewportSize({ width: 844, height: 390 });
  await page.waitForTimeout(300);
  await Step(3);
  const rectL = await Rects(page);
  const badL = LayoutProblems(rectL);
  Check("横屏：卡片 / 图层按钮 / 齿轮 / 导航栏 / 摇杆 / 大按钮都在屏内、互不重叠", badL.length === 0 && rectL.card && rectL.nav && rectL.stick && rectL.actions, badL.join("; ") || J(rectL));
  await Shot("Landscape");
  await TapSel(".boCardTitle");
  await Step(1);
  const rectL2 = await Rects(page);
  const badL2 = LayoutProblems(rectL2);
  Check("横屏展开卡片：卡片限高滚动，不压摇杆与导航栏", badL2.length === 0, badL2.join("; ") || J(rectL2.card));
  await Shot("Landscape_CardOpen");
  await TapSel(".boCardTitle");
  await context.close();

  // -------------------------------------------------------------------------
  // 10) 桌面
  console.log("--- desktop");
  const desk = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  Watch(desk);
  await Boot(desk);
  const d = await desk.evaluate(() => ({
    touch: window.Tengxian.Debug.Blockout.Touch(), pad: !!document.getElementById("blockoutTouchLook"),
    body: document.body.classList.contains("blockoutTouch"), root: document.querySelector(".boRoot").classList.contains("boTouch"),
    mini: getComputedStyle(document.querySelector(".boMini")).display, top: getComputedStyle(document.querySelector(".boTopBar")).display,
    stick: !!document.querySelector(".boStick"),
  }));
  Check("桌面（无触屏）不开触屏层：小地图、右上工具条照旧，没有摇杆", d.touch === null && !d.pad && !d.body && !d.root && d.mini !== "none" && d.top !== "none" && !d.stick, J(d));
  await desk.close();

  Check("全程没有未捕获错误", errors.length === 0, errors.slice(0, 5).join(" | "));
} finally {
  await browser.close();
  server.close();
}

const failed = results.filter(r => !r.ok);
console.log(`EditorBlockoutTouchBrowserTest: ${results.length - failed.length}/${results.length} passed`);
assert.equal(failed.length, 0, failed.map(r => r.name).join("; "));
