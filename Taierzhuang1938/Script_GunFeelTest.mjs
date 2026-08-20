// 《滕县 一九三八》枪感专项冒烟。
//
// 这条只量开枪相关的短链，避免每次调一缕枪口烟都跑十几分钟的全通关套件：
//   · 相机后坐与枪体后坐是否分开、枪体峰值是否更大；
//   · 后坐是否有限时间完整归零；
//   · 玩家/AI 是否把真实枪种传进枪焰配方；
//   · 连续机枪每一发是否都重新触发第三人称后坐；
//   · 枪口烟是否有“快烟 + 慢余烟”两层。

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
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
}

await page.goto(`http://127.0.0.1:${port}/Taierzhuang1938/?shot=1&phase=2&quality=medium&scale=small`,
  { waitUntil: "load", timeout: 120000 });
await page.waitForFunction(() => window.Taierzhuang?.state?.ready, { timeout: 180000 });
await page.evaluate(() => window.Taierzhuang.StepFrames(30));

const report = await page.evaluate(() => {
  const T = window.Taierzhuang;
  const D = T.Debug;
  T.player.health = 100;
  T.player.spawnGrace = 99;
  T.player.suppression = 0;
  // 让短测不被正在交战的 AI 打断。
  for (const soldier of T.ai.soldiers) {
    if (soldier.side === "ija") soldier.position.x += 500;
  }

  // 一、玩家真实开火。第 3 关初始武器是汉阳造（boltRifle）。
  T.state.ammo = 5;
  T.player.pitch = 0;
  T.player.yaw = 0;
  T.player.recoilPending.pitch = 0;
  T.player.recoilPending.yaw = 0;
  T.player.recoilTotal = 0;
  D.Fire();
  const forwarded = { ...T.vfx.lastMuzzleProfile };
  const cameraPeak = Math.hypot(T.player.recoilPending.pitch, T.player.recoilPending.yaw);

  let gunPeak = 0;
  let gunPeakMs = 0;
  let t25 = null, t50 = null, t95 = null, tZero = null;
  for (let frame = 1; frame <= 180; frame += 1) {
    T.StepFrames(1, 1 / 240);
    const gun = Math.hypot(
      T.viewmodel.recoilPitchSpring.value,
      T.viewmodel.recoilYawSpring.value);
    if (gun > gunPeak) { gunPeak = gun; gunPeakMs = frame / 240 * 1000; }
    const pending = Math.hypot(T.player.recoilPending.pitch, T.player.recoilPending.yaw);
    const returned = cameraPeak > 0 ? 1 - pending / cameraPeak : 0;
    const ms = frame / 240 * 1000;
    if (t25 === null && returned >= 0.25) t25 = ms;
    if (t50 === null && returned >= 0.50) t50 = ms;
    if (t95 === null && returned >= 0.95) t95 = ms;
    if (tZero === null && pending <= 1e-7) tZero = ms;
  }

  // 二、直接抽查三种配方。读取的是 MuzzleFlash 真正算出的生成数，不是数据表源码。
  const origin = T.player.EyePosition;
  const direction = T.player.AimDirection();
  const profiles = {};
  for (const kind of ["boltRifle", "lmg", "pistol"]) {
    T.vfx.MuzzleFlash(origin, direction, { kind });
    profiles[kind] = { ...T.vfx.lastMuzzleProfile };
  }

  // 四、导入的三把新枪必须保留 TZM 里的 sight 挂点；栓动枪还要有动作代理。
  const sights = {};
  for (const id of ["ZhongZheng", "HanYang", "Mauser96"]) {
    T.viewmodel.Equip(id);
    T.StepFrames(120);
    const vm = T.viewmodel;
    sights[id] = {
      hasSight: !!vm.rig?.sight,
      offsetMm: Math.hypot(vm.adsOffset.x, vm.adsOffset.y) * 1000,
      hasBoltAction: id === "Mauser96" ? true : !!vm.rig?.parts?.bolt,
    };
  }

  const armSides = [];
  T.viewmodel.riggedArms?.root?.traverse((object) => {
    if (!object.isMesh) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) if (material) armSides.push(material.side);
  });
  // 走真人同一条键位链：Shift + W，而不是直接写 viewmodel 的 sprint 弹簧。
  D.Key("ShiftLeft", true);
  D.Key("KeyW", true);
  T.StepFrames(90);
  const sprintAmount = T.player.sprint;
  D.Key("ShiftLeft", false);
  D.Key("KeyW", false);

  // 三、模拟一挺持续 firing=true 的机枪。只有逐发序号能让第二发重新回峰。
  const soldier = T.ai.soldiers.find((entry) => entry.actor);
  const actor = soldier?.actor || null;
  let repeated = null;
  if (actor) {
    const base = { moveSpeed: 0, aim: 1, firing: true, elapsed: 1 };
    actor.Update(1 / 60, { ...base, fireSequence: 101 });
    const first = actor.recoil;
    for (let i = 0; i < 10; i += 1) {
      actor.Update(1 / 60, { ...base, elapsed: 1 + i / 60, fireSequence: 101 });
    }
    const decayed = actor.recoil;
    actor.Update(1 / 60, { ...base, elapsed: 2, fireSequence: 102 });
    repeated = { first, decayed, second: actor.recoil };
  }

  return {
    weapon: D.Slots().weapon,
    forwarded,
    cameraPeakDeg: cameraPeak * 180 / Math.PI,
    gunPeakDeg: gunPeak * 180 / Math.PI,
    gunPeakMs,
    t25, t50, t95, tZero,
    residualDeg: Math.abs(T.player.recoilTotal) * 180 / Math.PI,
    profiles,
    repeated,
    sights,
    armSides,
    sprintAmount,
  };
});

Check("玩家按真实枪种触发枪焰配方",
  report.forwarded.kind === "boltRifle",
  `${report.weapon} -> ${report.forwarded.kind}`);
Check("枪体后坐与相机后坐分离，且枪跳得比世界更明显",
  report.gunPeakDeg > report.cameraPeakDeg && report.gunPeakMs <= 80,
  `枪 ${report.gunPeakDeg.toFixed(3)}° @ ${report.gunPeakMs.toFixed(1)} ms；相机 ${report.cameraPeakDeg.toFixed(3)}°`);
Check("后坐先悬再加速，并在 600 ms 内完整归零",
  report.t25 > 0 && report.t50 > report.t25 && report.t95 > report.t50
    && report.tZero !== null && report.tZero <= 600 && report.residualDeg < 0.001,
  `回 25/50/95/100% = ${report.t25?.toFixed(0)}/${report.t50?.toFixed(0)}/${report.t95?.toFixed(0)}/${report.tZero?.toFixed(0)} ms`);
Check("枪口烟有快烟与慢余烟两层",
  report.profiles.boltRifle.smokeCount >= 1 && report.profiles.boltRifle.wispCount >= 2,
  `栓动：快烟 ${report.profiles.boltRifle.smokeCount} + 余烟 ${report.profiles.boltRifle.wispCount}`);
Check("不同枪种不是同一团枪焰",
  report.profiles.boltRifle.size > report.profiles.pistol.size
    && report.profiles.boltRifle.wispCount > report.profiles.lmg.wispCount,
  `栓动 ${report.profiles.boltRifle.size.toFixed(2)}m/${report.profiles.boltRifle.wispCount}缕；`
  + `机枪 ${report.profiles.lmg.size.toFixed(2)}m/${report.profiles.lmg.wispCount}缕；`
  + `手枪 ${report.profiles.pistol.size.toFixed(2)}m/${report.profiles.pistol.wispCount}缕`);
Check("持续连射的第二发会重新触发人物后坐",
  report.repeated && report.repeated.first > 0.95
    && report.repeated.decayed < 0.8 && report.repeated.second > 0.95,
  report.repeated
    ? `${report.repeated.first.toFixed(2)} -> ${report.repeated.decayed.toFixed(2)} -> ${report.repeated.second.toFixed(2)}`
    : "没有可见 Actor");
Check("导入枪模保留铁瞄挂点与栓动动作链",
  Object.values(report.sights).every((entry) => entry.hasSight && entry.offsetMm > 0 && entry.hasBoltAction)
    && report.sights.HanYang.offsetMm > report.sights.ZhongZheng.offsetMm,
  Object.entries(report.sights)
    .map(([id, entry]) => `${id}: sight=${entry.hasSight} offset=${entry.offsetMm.toFixed(2)}mm bolt=${entry.hasBoltAction}`)
    .join(" · "));
Check("第一人称手臂只画外表面，冲刺时袖筒背面不会铺满屏幕",
  report.sprintAmount > 0.8 && report.armSides.length > 0 && report.armSides.every((side) => side === 0),
  `Shift+W sprint=${report.sprintAmount.toFixed(2)} · material.side=${report.armSides.join(",") || "missing"}`);
Check("页面无运行时错误", errors.length === 0, errors.join(" | "));

await browser.close();
server.close();
const failed = results.filter((result) => !result.ok);
console.log(`\n枪感专项：${results.length - failed.length}/${results.length} 过`);
process.exit(failed.length === 0 ? 0 : 1);
