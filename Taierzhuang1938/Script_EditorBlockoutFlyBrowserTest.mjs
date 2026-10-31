// ===========================================================================
// Script_EditorBlockoutFlyBrowserTest.mjs —— 白盒编辑器「飞行观察」（testFly，§4.3，2026-10-21）的浏览器闸门
//
// 跑法：node Taierzhuang1938/Script_EditorBlockoutFlyBrowserTest.mjs
// 口径：docs/Data_EditorBlockout.md §4.3。关卡 FirstLevel0105。
//
//   0. node：切换键 O 不在游戏 KEYMAP、不是编辑器已有的键；pose 参数第 6 项（相机高度）往返；飞行快照的文字与数据；
//   1. 进：按钮 / O 键都能进；飞行相机从进入那一刻的视角起飞；卡片亮起、飞行条出现、枪模藏起；
//   2. 飞：W/S/A/D 沿视线与横向、E 升 Q 降、Shift 加速 ×4，位移 = 速度 × 时间；穿墙（不查碰撞）；滚轮调速并夹在上下限；
//      鼠标位移转飞行相机、玩家不转；
//   3. 玩家原地：位置 / 朝向 / 姿态 / 血量 / 弹药 / 当前槽位在飞行前后不变；空格 / V / R / C / Z / 数字 / F / G / 左键 / 右键都不触发；
//   4. 地图：小地图与全关总图（M 照开）里画出青色的相机标记；
//   5. 复制当前位置（P / 按钮）复制的是飞行相机的位姿，「重现」链接带第 6 项，打开后从同一高度起飞；
//   6. 退：相机回到进入时的位置与朝向，玩家没动，枪模还回来；
//   7. 预演：预演播放中不让进（O 与 Debug.Fly 都被拒）；飞行中开播预演会自动退出；切关自动退出；
//   8. 全程没有未捕获错误。截图存 _shots/EditorBlockoutFly/（不提交）。
// ===========================================================================

import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { LaunchBrowser } from "../PrairieFire1937/Script_BrowserTestKit.mjs";
import { ServeRoot } from "./Script_DevServer.mjs";
import { KEYMAP } from "./Script_Input.mjs";
import { BLOCKOUT_FLY } from "./Script_EditorBlockout.mjs";
import { PREVIZ_KEY } from "./Script_EditorBlockoutPreviz.mjs";
import {
  BuildBlockoutSnapshot, FormatBlockoutSnapshot, ParseBlockoutSnapshot, PoseParam, ParsePoseParam,
} from "./Script_EditorBlockoutSnapshot.mjs";

const projectDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(projectDir, "..");
const shotDir = path.join(projectDir, "_shots", "EditorBlockoutFly");
await fs.mkdir(shotDir, { recursive: true });

const results = [];
function Check(name, ok, detail = "") {
  results.push({ name, ok: !!ok, detail });
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? "  — " + detail : ""}`);
}
const J = (v) => JSON.stringify(v);
const Near = (a, b, eps) => Math.abs(a - b) <= eps;
const LEVEL = "FirstLevel0105";

// ---------------------------------------------------------------------------
// 0) node 里的纯规则
console.log("--- node checks");
{
  const bound = new Set(KEYMAP.map(row => row.code));
  const editorKeys = ["KeyN", "KeyP", "KeyY", "KeyM", "Period", "Comma", "Escape", "Backquote", "AltLeft", "AltRight", "NumpadDecimal"];
  Check("切换键 O 不在游戏键位表里，也不是编辑器已有的键", !bound.has(BLOCKOUT_FLY.toggleKey) && !editorKeys.includes(BLOCKOUT_FLY.toggleKey) && BLOCKOUT_FLY.toggleKey !== PREVIZ_KEY,
    BLOCKOUT_FLY.toggleKey);
  Check("升降 / 加速 / 移动键是飞行中借用的（游戏里是探身 / 冲刺 / 走路，飞行中整张键位表闸掉）",
    bound.has(BLOCKOUT_FLY.upKey) && bound.has(BLOCKOUT_FLY.downKey) && BLOCKOUT_FLY.boostKeys.every(k => bound.has(k)) && BLOCKOUT_FLY.upKey !== BLOCKOUT_FLY.downKey);
  const pose = { x: -35.12, z: -97.3, yawDeg: -160, pitchDeg: -5, stance: "stand", flyY: 12.345 };
  Check("pose 参数：不带相机高度时仍是 5 项（旧格式不变），带高度是 6 项且往返", PoseParam({ ...pose, flyY: undefined }) === "-35.12,-97.3,-160,-5,stand"
    && PoseParam(pose) === "-35.12,-97.3,-160,-5,stand,12.35" && ParsePoseParam(PoseParam(pose)).flyY === 12.35 && ParsePoseParam("1,2,3,4,stand").flyY === undefined,
    PoseParam(pose));
  const snap = BuildBlockoutSnapshot({
    level: { key: LEVEL, label: "x", configPath: "p" },
    player: { x: 10, y: 20, z: 30, eyeY: 20, yawDeg: 45, pitchDeg: -10, stance: "stand" },
    fly: { body: { x: 1, y: 2, z: 3, yawDeg: 90, pitchDeg: 0, stance: "crouch" } },
    aim: { kind: "none" }, units: [], pois: [], url: "http://h/Taierzhuang1938/?editor=blockout&level=" + LEVEL,
  });
  const text = FormatBlockoutSnapshot(snap);
  const back = ParseBlockoutSnapshot(text);
  Check("飞行快照：文字写明是飞行相机、玩家本人另记，重现链接带相机高度，数据行能解析回来",
    /飞行观察相机/.test(text) && /玩家本人没动/.test(text) && /pose=10,30,45,-10,stand,20(\s|$)/.test(text) && back?.fly?.body?.stance === "crouch" && back.player.y === 20,
    text.split("\n").filter(l => /重现|飞行/.test(l)).join(" / ").slice(0, 300));
}

// ---------------------------------------------------------------------------
// 浏览器
const server = await ServeRoot(rootDir, 0);
const port = server.address().port;
const browser = await LaunchBrowser();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
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
const B = (fn, arg) => page.evaluate(fn, arg);
async function Wait(predicate, arg, timeout = 15000) {
  try { await page.waitForFunction(predicate, arg, { timeout, polling: 50 }); return true; } catch (error) { return false; }
}
const FlyState = () => B(() => window.Tengxian.Debug.Blockout.FlyState());
const PlayerNow = () => B(() => {
  const p = window.Tengxian.player;
  return { x: p.position.x, y: p.position.y, z: p.position.z, yaw: p.yaw, pitch: p.pitch, stance: p.stance, lean: p.lean, health: p.health, alive: p.alive,
    ammo: window.Tengxian.Debug.Slots().ammo, slot: window.Tengxian.Debug.Slots().active, shot: JSON.stringify(window.Tengxian.Debug.LastShot()) };
});
/** 按住一组键走 n 帧（同一个 evaluate 里按下、推帧、松开，中间没有真实时间的 rAF 帧混进来）。 */
const Hold = (codes, frames) => B(({ codes, frames }) => {
  const T = window.Tengxian;
  for (const c of codes) T.Debug.Key(c, true);
  T.StepFrames(frames, 1 / 60, false);
  for (const c of codes) T.Debug.Key(c, false);
}, { codes, frames });
const Step = (n = 2) => B((n) => window.Tengxian.StepFrames(n, 1 / 60, false), n);
const Dist3 = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const AngDiff = (a, b) => Math.abs(((a - b + 540) % 360) - 180);

try {
  console.log("--- boot");
  await page.goto(`http://127.0.0.1:${port}/Taierzhuang1938/?editor=blockout&level=${LEVEL}&scale=small&audio=0`,
    { waitUntil: "load", timeout: 180000 });
  await page.waitForFunction(() => window.Tengxian?.state?.ready && window.Tengxian?.Debug?.Blockout?.State().ready, null, { timeout: 300000 });
  await Step(4);
  const st0 = await FlyState();
  Check("启动时不在飞行；卡片右上有「飞行观察」按钮；导航栏有 O 提示", !st0.active && st0.key === "KeyO"
    && await B(() => !!document.querySelector(".boFlyBtn") && !!document.querySelector(".boKeysFly")), J({ active: st0.active }));

  // 1) 进：点按钮
  console.log("--- enter");
  const P0 = await PlayerNow();
  const C0 = (await FlyState()).camera;
  // 指针锁在场时界面是惰性的（只可见不可点）：Esc 先把鼠标还回来
  await page.keyboard.press("Escape");
  await Wait(() => !document.querySelector(".boRoot").classList.contains("inert"), null, 5000);
  await page.click(".boFlyBtn");
  await Step(2);
  const s1 = await FlyState();
  const ui1 = await B(() => ({ on: document.querySelector(".boFlyBtn").classList.contains("on"), pressed: document.querySelector(".boFlyBtn").getAttribute("aria-pressed"),
    bar: !document.querySelector(".boFlyBar").hidden, text: document.querySelector(".boFlyPos")?.textContent || "", gun: window.Tengxian.viewmodel.root.visible,
    state: window.Tengxian.Debug.Blockout.State().fly }));
  Check("点按钮进飞行：从进入那一刻的视角起飞（位置 < 5 cm、朝向 < 1°）", s1.active && Dist3(s1, C0) < 0.05 && AngDiff(s1.yawDeg, C0.yawDeg) < 1 && Near(s1.pitchDeg, C0.pitchDeg, 1),
    J({ s1: [s1.x, s1.y, s1.z, s1.yawDeg, s1.pitchDeg].map(v => +v.toFixed(2)), C0: [C0.x, C0.y, C0.z, C0.yawDeg, C0.pitchDeg].map(v => +v.toFixed(2)) }));
  Check("进飞行：按钮亮起、飞行条出现且写着位置、第一人称枪模藏起、State().fly 为真", ui1.on && ui1.pressed === "true" && ui1.bar && /x .*z .*高 /.test(ui1.text) && !ui1.gun && ui1.state === true, J(ui1));
  Check("相机真的在飞行位姿上（Three 相机与飞行状态一致）", Dist3(s1.camera, s1) < 0.02 && AngDiff(s1.camera.yawDeg, s1.yawDeg) < 0.5, J(s1.camera));
  await page.screenshot({ path: path.join(shotDir, "Fly_Enter.png") });

  // 2) 飞：先摆到空中、平视，再逐个键量位移
  console.log("--- fly");
  const base = await B(() => {
    const Bl = window.Tengxian.Debug.Blockout, p = window.Tengxian.player.position;
    return Bl.FlyPose({ x: p.x, y: p.y + 10, z: p.z, yawDeg: 30, pitchDeg: 0 });
  });
  await Step(1);
  const speed0 = (await FlyState()).speedMps;
  Check("缺省速度 8 m/s", speed0 === BLOCKOUT_FLY.speedMps, String(speed0));
  const yaw = base.yawDeg * Math.PI / 180;
  const fwd = { x: -Math.sin(yaw), z: -Math.cos(yaw) }, right = { x: Math.cos(yaw), z: -Math.sin(yaw) };
  const Moved = async (codes, frames = 30) => {
    const a = await FlyState();
    await Hold(codes, frames);
    const b = await FlyState();
    return { dx: b.x - a.x, dy: b.y - a.y, dz: b.z - a.z, cam: b.camera, st: b };
  };
  let m = await Moved(["KeyW"]);
  Check("W：沿视线向前，0.5 s × 8 m/s = 4 m", Near(m.dx * fwd.x + m.dz * fwd.z, 4, 0.1) && Near(m.dy, 0, 0.05) && Near(Math.hypot(m.dx, m.dz), 4, 0.1), J({ dx: m.dx, dy: m.dy, dz: m.dz }));
  Check("相机跟着飞行状态走（位置一致）", Dist3(m.cam, m.st) < 0.02);
  m = await Moved(["KeyS"]);
  Check("S：向后 4 m", Near(m.dx * fwd.x + m.dz * fwd.z, -4, 0.1), J({ dx: m.dx, dz: m.dz }));
  m = await Moved(["KeyD"]);
  Check("D：向右横移 4 m（垂直于视线）", Near(m.dx * right.x + m.dz * right.z, 4, 0.1) && Near(m.dx * fwd.x + m.dz * fwd.z, 0, 0.05), J({ dx: m.dx, dz: m.dz }));
  m = await Moved(["KeyA"]);
  Check("A：向左横移 4 m", Near(m.dx * right.x + m.dz * right.z, -4, 0.1));
  m = await Moved(["KeyE"]);
  Check("E：升高 4 m（世界竖直）", Near(m.dy, 4, 0.1) && Near(Math.hypot(m.dx, m.dz), 0, 0.02), J({ dx: m.dx, dy: m.dy, dz: m.dz }));
  m = await Moved(["KeyQ"]);
  Check("Q：降低 4 m", Near(m.dy, -4, 0.1));
  m = await Moved(["ShiftLeft", "KeyW"]);
  Check("Shift + W：加速 ×4，0.5 s 走 16 m", Near(Math.hypot(m.dx, m.dz), 16, 0.3) && m.st.boost === false, J({ d: Math.hypot(m.dx, m.dz), boost: m.st.boost }));
  // 抬头再走：沿视线（含俯仰）
  await B(() => window.Tengxian.Debug.Blockout.FlyPose({ pitchDeg: 45 }));
  m = await Moved(["KeyW"]);
  Check("抬头 45° 再按 W：沿视线斜向上（水平 / 竖直各约 2.83 m）", Near(m.dy, 4 * Math.sin(Math.PI / 4), 0.1) && Near(Math.hypot(m.dx, m.dz), 4 * Math.cos(Math.PI / 4), 0.1), J({ dy: m.dy, h: Math.hypot(m.dx, m.dz) }));
  await B(() => window.Tengxian.Debug.Blockout.FlyPose({ pitchDeg: 0 }));
  // 松键后停下
  const stopA = await FlyState();
  await Step(10);
  const stopB = await FlyState();
  Check("松开键后相机停住（keys 清空）", Dist3(stopA, stopB) < 1e-6 && stopB.keys.length === 0, J(stopB.keys));
  // 穿墙：直线飞过 60 m 不被任何东西挡住（不查碰撞）；唯一的限制是不低于地面
  const wall = await B(() => {
    const Bl = window.Tengxian.Debug.Blockout, T = window.Tengxian;
    const p = T.player.position;
    Bl.FlyPose({ x: p.x, y: p.y + 1.0, z: p.z, yawDeg: 0, pitchDeg: 0 });
    return { lowZ: Bl.FlyState().z };
  });
  await Hold(["KeyW"], 60);
  const wallB = await FlyState();
  Check("不查碰撞：离地 1 m 平飞 1 s，位移照算 8 m（途中有沟沿、土垄、体块也不挡）", Near(wall.lowZ - wallB.z, 8, 0.5), J({ from: wall.lowZ, to: wallB.z }));
  const floorCheck = await B(async () => {
    const Bl = window.Tengxian.Debug.Blockout, T = window.Tengxian;
    const p = T.player.position;
    Bl.FlyPose({ x: p.x, y: -50, z: p.z, yawDeg: 0, pitchDeg: 0 });
    T.StepFrames(2, 1 / 60, false);
    const s = Bl.FlyState();
    return { y: s.y, ground: Bl.StandAt(s.x, s.z) };
  });
  Check("唯一的限制：不低于地面（高度场 + 0.15 m 以内），不会钻到地底下", Near(floorCheck.y, floorCheck.ground + BLOCKOUT_FLY.minAboveGroundM, 0.1), J(floorCheck));

  // 滚轮调速
  const slotBefore = (await PlayerNow()).slot;
  await B(() => window.Tengxian.Debug.Blockout.FlyPose({ x: window.Tengxian.player.position.x, y: window.Tengxian.player.position.y + 10, z: window.Tengxian.player.position.z }));
  await B(() => window.Tengxian.Debug.Wheel(-100));
  const w1 = (await FlyState()).speedMps;
  await B(() => window.Tengxian.Debug.Wheel(100));
  const w2 = (await FlyState()).speedMps;
  await B(() => { for (let i = 0; i < 40; i++) window.Tengxian.Debug.Wheel(-300); });
  const wMax = (await FlyState()).speedMps;
  await B(() => { for (let i = 0; i < 80; i++) window.Tengxian.Debug.Wheel(300); });
  const wMin = (await FlyState()).speedMps;
  await B(() => { const Bl = window.Tengxian.Debug.Blockout; for (let i = 0; i < 40; i++) window.Tengxian.Debug.Wheel(-100); });
  Check("滚轮：向上一格 ×1.25、向下一格 ÷1.25，上限 / 下限夹住", Near(w1, 10, 0.01) && Near(w2, 8, 0.01) && wMax === BLOCKOUT_FLY.maxMps && wMin === BLOCKOUT_FLY.minMps, J({ w1, w2, wMax, wMin }));
  Check("滚轮没有去换枪（当前槽位不变）", (await PlayerNow()).slot === slotBefore, slotBefore);
  // 速度改了位移跟着改
  await B(() => { const Bl = window.Tengxian.Debug.Blockout; for (let i = 0; i < 80; i++) window.Tengxian.Debug.Wheel(300); window.Tengxian.Debug.Wheel(-100); });
  const sp = (await FlyState()).speedMps;
  m = await Moved(["KeyE"]);
  Check("调过速之后位移 = 新速度 × 时间", Near(m.dy, sp * 0.5, 0.05), J({ sp, dy: m.dy }));
  await B(() => { for (let i = 0; i < 40; i++) window.Tengxian.Debug.Wheel(-100); });
  await B(() => { const Bl = window.Tengxian.Debug.Blockout; for (let i = 0; i < 40; i++) window.Tengxian.Debug.Wheel(100); });
  // 回到 8 m/s：向上滚到顶再向下滚不精确，直接按比例回
  await B(() => { for (let i = 0; i < 80; i++) window.Tengxian.Debug.Wheel(300); });

  // 3) 玩家原地、游戏输入不触发
  console.log("--- player stays");
  const pBefore = await PlayerNow();
  await B(() => { const T = window.Tengxian; T.Debug.Blockout.FlyPose({ x: T.player.position.x, y: T.player.position.y + 8, z: T.player.position.z }); });
  const gameKeys = ["Space", "KeyV", "KeyR", "KeyC", "KeyZ", "Digit2", "Digit3", "Digit4", "KeyF", "KeyG", "KeyH", "KeyT", "KeyX", "KeyB", "KeyE", "KeyQ"];
  await B((keys) => {
    const T = window.Tengxian;
    for (const c of keys) { T.Debug.Key(c, true); T.StepFrames(6, 1 / 60, false); T.Debug.Key(c, false); }
    T.Debug.Mouse(2, true); T.StepFrames(6, 1 / 60, false); T.Debug.Mouse(2, false);
  }, gameKeys);
  await B(() => { window.Tengxian.StepFrames(60, 1 / 60, false); });
  const pAfter = await PlayerNow();
  Check("飞行 3 s 并狂按游戏键（空格 / V / R / C / Z / 数字 / F / G / H / T / X / B / 右键）：玩家位置、朝向、姿态、血量、弹药、槽位、探身都没变",
    Dist3(pBefore, pAfter) < 1e-4 && pBefore.yaw === pAfter.yaw && pBefore.pitch === pAfter.pitch && pBefore.stance === pAfter.stance && pBefore.health === pAfter.health
      && pBefore.ammo === pAfter.ammo && pBefore.slot === pAfter.slot && pAfter.alive && Math.abs(pAfter.lean) < 1e-6 && pBefore.shot === pAfter.shot,
    J({ pBefore, pAfter }));
  // 左键：先让假指针锁生效（第一下只用来抢锁），再按住左键推帧
  await B(() => {
    const T = window.Tengxian;
    T.Debug.Mouse(0, true); T.StepFrames(3, 1 / 60, false); T.Debug.Mouse(0, false);
    T.Debug.Mouse(0, true); T.StepFrames(30, 1 / 60, false); T.Debug.Mouse(0, false);
  });
  const pFire = await PlayerNow();
  Check("按住左键 0.5 s：没有开枪（弹药、最后一发不变）", pFire.ammo === pBefore.ammo && pFire.shot === pBefore.shot, J({ ammo: pFire.ammo, before: pBefore.ammo }));

  // 鼠标转头：转的是飞行相机，玩家不转（走游戏自己的输入链：Debug.Look 与真 mousemove 事件各一次）
  const lookA = await FlyState();
  await B(() => { window.Tengxian.Debug.Look(200, 60); window.Tengxian.StepFrames(2, 1 / 60, false); });
  const lookB = await FlyState();
  const pLook = await PlayerNow();
  Check("鼠标右移 / 下移：飞行相机向右转（yaw 减小）、向下看（pitch 减小），玩家朝向不变",
    lookB.yawDeg < lookA.yawDeg - 1 && lookB.pitchDeg < lookA.pitchDeg - 0.5 && pLook.yaw === pBefore.yaw && pLook.pitch === pBefore.pitch,
    J({ yaw: [lookA.yawDeg, lookB.yawDeg], pitch: [lookA.pitchDeg, lookB.pitchDeg] }));
  await B(() => { window.Tengxian.Debug.Look(0, -100000); window.Tengxian.StepFrames(2, 1 / 60, false); });
  const lookTop = await FlyState();
  Check("抬头夹在 ±89.5° 之内", lookTop.pitchDeg <= BLOCKOUT_FLY.maxPitchDeg + 1e-6 && lookTop.pitchDeg > 80, String(lookTop.pitchDeg));
  const mouseEv = await B(async () => {
    const T = window.Tengxian, Bl = T.Debug.Blockout;
    Bl.FlyPose({ pitchDeg: 0 });
    const a = Bl.FlyState();
    document.dispatchEvent(new MouseEvent("mousemove", { movementX: 80, movementY: 0, bubbles: true }));
    T.StepFrames(2, 1 / 60, false);
    const b = Bl.FlyState();
    return { locked: T.Debug.PointerLock().locked, a: a.yawDeg, b: b.yawDeg, playerYaw: T.player.yaw };
  });
  Check("真 mousemove 事件（指针锁在场时）也转飞行相机、不转玩家", mouseEv.locked && mouseEv.b < mouseEv.a - 1 && mouseEv.playerYaw === pBefore.yaw, J(mouseEv));

  // 4) 地图：小地图与全关总图里的相机标记
  console.log("--- maps");
  const mapPoint = await B(() => {
    const T = window.Tengxian, Bl = T.Debug.Blockout, p = T.player.position;
    Bl.FlyPose({ x: p.x + 20, y: p.y + 6, z: p.z - 20, yawDeg: 90, pitchDeg: -10 });
    return { x: p.x + 20, z: p.z - 20 };
  });
  await Step(2);
  // 小地图 8 Hz 刷新：等够一轮
  await page.waitForTimeout(400);
  const CountFly = (selector) => B((selector) => {
    const c = document.querySelector(selector);
    if (!c || !c.width) return -1;
    const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
    let n = 0;
    for (let i = 0; i < d.length; i += 4) if (Math.abs(d[i] - 44) < 18 && Math.abs(d[i + 1] - 168) < 18 && Math.abs(d[i + 2] - 190) < 18 && d[i + 3] > 200) n++;
    return n;
  }, selector);
  const miniFly = await CountFly(".boMiniCanvas");
  Check("飞行中小地图画出青色相机标记", miniFly > 40, `${miniFly} px`);
  await B(() => window.Tengxian.Debug.Key("KeyM"));
  await Wait(() => window.Tengxian.Debug.Blockout.State().mapOpen, null, 3000);
  await page.waitForTimeout(500);
  const full = await B(() => ({ open: window.Tengxian.Debug.Blockout.State().mapOpen, view: window.Tengxian.Debug.Blockout.MapView() }));
  const fullFly = await CountFly(".boMapCanvas");
  Check("飞行中 M 照样能开全关总图，总图以相机为中心、画出青色相机标记",
    full.open && fullFly > 60 && full.view && Math.hypot(full.view.cx - mapPoint.x, full.view.cz - mapPoint.z) < 30, J({ open: full.open, fullFly, view: full.view }));
  await page.screenshot({ path: path.join(shotDir, "Fly_FullMap.png") });
  await B(() => window.Tengxian.Debug.Key("KeyM"));
  await Wait(() => !window.Tengxian.Debug.Blockout.State().mapOpen, null, 3000);

  // 5) 复制当前位置：飞行相机的位姿
  console.log("--- copy snapshot");
  await B(() => window.Tengxian.Debug.Blockout.FlyPose({ x: window.Tengxian.player.position.x + 3.25, y: window.Tengxian.player.position.y + 9.5, z: window.Tengxian.player.position.z - 7.5, yawDeg: 123.4, pitchDeg: -21.5 }));
  await Step(2);
  await B(() => { window.__copied = []; navigator.clipboard.writeText = async (text) => { window.__copied.push(text); }; });
  const flyNow = await FlyState();
  await page.keyboard.press("KeyP");
  await Wait(() => window.__copied.length >= 1, null, 3000);
  const copied = await B(() => window.__copied[0] || "");
  const snap = ParseBlockoutSnapshot(copied);
  Check("P 复制的是飞行相机的位姿（x / y / z / 朝向 / 俯仰），玩家本人另记在 fly.body 且没动",
    !!snap && Near(snap.player.x, flyNow.x, 0.01) && Near(snap.player.y, flyNow.y, 0.01) && Near(snap.player.z, flyNow.z, 0.01)
      && Near(snap.player.yawDeg, flyNow.yawDeg, 0.06) && Near(snap.player.pitchDeg, flyNow.pitchDeg, 0.06)
      && Near(snap.fly?.body?.x, pBefore.x, 0.01) && Near(snap.fly?.body?.z, pBefore.z, 0.01) && /飞行观察相机/.test(copied),
    snap ? J({ player: snap.player, body: snap.fly?.body }) : copied.slice(0, 200));
  Check("快照里准星射线从相机发出（离眼睛的距离按飞行高度算）", !!snap && (snap.aim.kind === "none" || Near(snap.aim.y + snap.aim.distM * Math.sin(-flyNow.pitchDeg * Math.PI / 180), flyNow.y, 0.6)),
    snap ? J(snap.aim) : "");
  const viaApi = await B(() => window.Tengxian.Debug.Blockout.Snapshot());
  Check("Debug.Snapshot() 同样是飞行相机的位姿", Near(viaApi.player.x, flyNow.x, 0.01) && Near(viaApi.player.eyeY, flyNow.y, 0.01) && !!viaApi.fly);
  const reproduce = snap?.reproduce || "";
  Check("「重现」链接的 pose 带第 6 项（相机高度）", /pose=[^&]*,stand,-?\d+(\.\d+)?$/.test(reproduce) && Near(ParsePoseParam(new URL(reproduce).searchParams.get("pose")).flyY, flyNow.y, 0.01), reproduce.slice(-70));

  // 6) 退：O 键
  console.log("--- exit");
  await page.keyboard.press("KeyO");
  await Step(3);
  const s2 = await FlyState();
  const P2 = await PlayerNow();
  const ui2 = await B(() => ({ on: document.querySelector(".boFlyBtn").classList.contains("on"), bar: !document.querySelector(".boFlyBar").hidden, gun: window.Tengxian.viewmodel.root.visible }));
  Check("O 退出：不再飞行、按钮熄灭、飞行条收起、枪模还回来", !s2.active && !ui2.on && !ui2.bar && ui2.gun === true, J(ui2));
  Check("退出后相机回到进入时玩家的位置与朝向（< 2 cm、< 0.5°）", Dist3(s2.camera, s1.origin.camera) < 0.02 && AngDiff(s2.camera.yawDeg, s1.origin.camera.yawDeg) < 0.5 && Near(s2.camera.pitchDeg, s1.origin.camera.pitchDeg, 0.5),
    J({ now: [s2.camera.x, s2.camera.y, s2.camera.z, s2.camera.yawDeg].map(v => +v.toFixed(3)), was: [s1.origin.camera.x, s1.origin.camera.y, s1.origin.camera.z, s1.origin.camera.yawDeg].map(v => +v.toFixed(3)) }));
  Check("玩家整段飞行里位置 / 朝向 / 姿态都没动", Dist3(P0, P2) < 1e-4 && P0.yaw === P2.yaw && P0.pitch === P2.pitch && P0.stance === P2.stance, J({ P0, P2 }));
  await page.screenshot({ path: path.join(shotDir, "Fly_Exit.png") });
  // 在飞行外按 Q E W 不会误记按键
  await Hold(["KeyW"], 5);
  Check("没在飞行时按 WASD 不动相机（相机仍跟玩家）", (await FlyState()).keys.length === 0);

  // 重现：打开链接，玩家落在 x,z，相机从记下的高度起飞
  console.log("--- reproduce");
  await page.goto(reproduce, { waitUntil: "load", timeout: 180000 });
  await page.waitForFunction(() => window.Tengxian?.state?.ready && window.Tengxian?.Debug?.Blockout?.State().ready, null, { timeout: 300000 });
  await Step(3);
  const re = await FlyState();
  const reUrl = await B(() => location.search);
  Check("打开「重现」链接：自动进飞行，相机在记下的位置 / 高度 / 朝向，地址栏不再带 pose",
    re.active && Dist3(re, flyNow) < 0.02 && AngDiff(re.yawDeg, flyNow.yawDeg) < 0.2 && Near(re.pitchDeg, flyNow.pitchDeg, 0.2) && Dist3(re.camera, re) < 0.02 && !/pose=/.test(reUrl),
    J({ re: [re.x, re.y, re.z, re.yawDeg, re.pitchDeg].map(v => +v.toFixed(2)), want: [flyNow.x, flyNow.y, flyNow.z, flyNow.yawDeg, flyNow.pitchDeg].map(v => +v.toFixed(2)), reUrl }));
  await page.screenshot({ path: path.join(shotDir, "Fly_Reproduce.png") });
  await page.keyboard.press("KeyO");
  await Step(2);

  // 7) 预演
  console.log("--- previz rule");
  const seqs = await B(() => window.Tengxian.Debug.Blockout.Previz.State().sequences);
  Check("01–05 有预演可测", seqs.length > 0, J(seqs.slice(0, 3)));
  const kfId = seqs[0];
  await B((id) => window.Tengxian.Debug.Blockout.GoTo(id, { animate: false }), kfId);
  // 7a) 飞行中开播预演 → 自动退出
  await B(() => window.Tengxian.Debug.Blockout.Fly(true));
  Check("预演开播前能进飞行", (await FlyState()).active);
  await B(() => { window.__previzDone = null; window.Tengxian.Debug.Blockout.Previz.Play().then(v => { window.__previzDone = v; }); });
  const playing = await Wait(() => window.Tengxian.Debug.Blockout.Previz.State().playing, null, 180000);
  const sp1 = await FlyState();
  Check("飞行中开播预演：飞行自动退出，预演接管相机", playing && !sp1.active && sp1.previz, J({ playing, active: sp1.active }));
  // 7b) 预演播放中不让进
  await B(() => window.Tengxian.Debug.Blockout.Fly(true));
  await page.keyboard.press("KeyO");
  await Step(1);
  const sp2 = await FlyState();
  const toast = await B(() => [...document.querySelectorAll(".boToast")].map(e => e.textContent).join("|"));
  Check("预演播放中 Debug.Fly(true) 与 O 键都进不去，并有提示", !sp2.active && !sp2.canEnter && /预演/.test(toast), J({ active: sp2.active, toast }));
  await B(() => window.Tengxian.Debug.Blockout.Previz.Stop());
  await Wait(() => !window.Tengxian.Debug.Blockout.Previz.State().playing, null, 5000);
  await Step(3);
  const sp3 = await FlyState();
  Check("预演中断后相机交还玩家、可以再进飞行", !sp3.active && sp3.canEnter);
  await page.keyboard.press("KeyO");
  await Step(1);
  Check("预演结束后 O 又能进飞行", (await FlyState()).active);

  // 8) 切关自动退出
  console.log("--- switch level");
  await B(() => window.Tengxian.Debug.Blockout.SwitchLevel("SecondLevel"));
  await Wait(() => window.Tengxian.Debug.Blockout.State().level === "SecondLevel" && window.Tengxian.Debug.Blockout.State().ready, null, 60000);
  await Step(3);
  const sw = await FlyState();
  Check("飞行中切关：自动退出飞行，相机回到玩家", !sw.active && sw.keys.length === 0 && Dist3(sw.camera, { x: sw.player.x, y: sw.camera.y, z: sw.player.z }) < 5, J({ active: sw.active }));

  Check("全程没有未捕获错误", errors.length === 0, errors.slice(0, 5).join(" | "));
} finally {
  await browser.close();
  server.close();
}

const failed = results.filter(r => !r.ok);
console.log(`EditorBlockoutFlyBrowserTest: ${results.length - failed.length}/${results.length} passed`);
assert.equal(failed.length, 0, failed.map(r => r.name).join("; "));
