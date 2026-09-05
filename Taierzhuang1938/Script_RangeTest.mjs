// 玩法测试靶场（?range=1）回归：场景开得起来、木桩兵是木桩、四个动词都走真链路。
//
// 这条链的口径（docs/Data_TestRange.md）：
//   · 靶场是独立沙盒：PHASE_TABLE 整表替换，pinned=true 不换关不结算；
//   · 木桩兵是整具 ija Actor（骨骼/命中箱/倒地全在），只是 dummy 不 Think；
//   · 取证走 Debug.Range（State / Targets / GoTo / AimAt / Reset），
//     输入走 Debug.Fire / Key / Mouse / Throw 的真事件链（不直调函数）。
//
// 测法沿用 Script_BayonetTest 的纪律：采样在同一个 page.evaluate 里同步跑完
// （rAF 不许插队）；白刃的靶要在**松手前一刻**才埋（早埋会被物理拽回原位）。
//
// --shot：跑完断言后按工位各拍一张到 _shots/range/（gitignore），给人工审场地用。

import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { LaunchBrowser } from "../PrairieFire1937/Script_BrowserTestKit.mjs";
import { ServeRoot } from "./Script_DevServer.mjs";
import { RANGE_TARGETS } from "./Data_Range.mjs";

const projectDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(projectDir, "..");
const server = await ServeRoot(rootDir, 0);
const port = server.address().port;
const browser = await LaunchBrowser();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on("pageerror", (error) => errors.push(String(error)));
page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });

await page.goto(`http://127.0.0.1:${port}/Taierzhuang1938/?shot=1&range=1&quality=medium&scale=small`,
  { waitUntil: "load", timeout: 120000 });
await page.waitForFunction(() => window.Taierzhuang?.state?.ready, null, { timeout: 180000 });

const expectedTargets = RANGE_TARGETS.length;

const result = await page.evaluate((expected) => {
  const T = window.Taierzhuang;
  const R = T.Debug.Range;
  const out = {};
  T.StepFrames(30);

  // --- 1) 沙盒装配：关是 Range、钉住、场上只有木桩兵 -----------------------
  out.level = T.Debug.Level().id;
  out.pinned = T.state.pinned;
  out.api = ["State", "Targets", "GoTo", "AimAt", "Reset"]
    .filter((k) => typeof R?.[k] === "function").length;
  out.soldierCount = T.ai.soldiers.length;
  out.allDummies = T.ai.soldiers.every((s) => s.dummy === true);
  const first = R.State();
  out.targetCount = first.targets.length;
  out.allAlive = first.targets.every((t) => t.alive && t.health === 100);
  out.stations = first.stations.map((s) => s.id).join(",");
  out.loadout = { weapon: first.player.weapon, grenades: first.player.grenades };

  // --- 2) 开镜：按住右键视野收窄，松开还原 ---------------------------------
  const fovHip = T.camera.fov;
  T.Debug.Mouse(2, true);
  T.StepFrames(50);
  out.fovAds = T.camera.fov;
  out.adsIn = T.player.ads;
  T.Debug.Mouse(2, false);
  T.StepFrames(50);
  out.fovHip = fovHip;
  out.fovBack = T.camera.fov;

  // --- 3) 开枪（开镜依托射击，10 m 靶）：命中回执 + 靶掉血 + 弹药下账 --------
  // 用近靶：TryFire 先施加本发枪口上跳再采样弹道（设计如此，见 Debug.Range.AimAt
  // 的头注），ADS 下首发高出约 0.9°，25 m 处正好擦出躯干判定圆柱。
  R.GoTo("RangeRifle");
  T.Debug.Key("Digit1");
  T.StepFrames(20);
  const ammoBefore = T.state.ammo + T.state.clips * 100;
  T.Debug.Mouse(2, true);
  T.StepFrames(55);                          // player.ads ≥ 0.9 才过 TryFire 的开镜闸
  out.shots = [];
  for (let i = 0; i < 3; i += 1) {
    R.AimAt("R10");
    T.StepFrames(2);
    T.Debug.Fire();
    T.StepFrames(5);
    const last = T.Debug.LastShot();
    out.shots.push({ hit: last?.hitKind ?? "none", dist: Math.round(last?.dist ?? -1) });
    const r10 = R.Targets().find((t) => t.id === "R10");
    if (!r10.alive || r10.health < 100) break;
    T.StepFrames(100);                       // 栓动步枪的循环时间
  }
  T.Debug.Mouse(2, false);
  const r10After = R.Targets().find((t) => t.id === "R10");
  out.rifleHit = out.shots.some((s) => s.hit === "soldier");
  out.rifleDamaged = !r10After.alive || r10After.health < 100;
  out.ammoSpent = (T.state.ammo + T.state.clips * 100) < ammoBefore;
  T.StepFrames(110);                         // 让拉栓动画播完：IsBusy 期间 X 上刺刀会被吃掉

  // --- 4) 刺刀：X 装上可见，蓄力劈刺放倒木桩 -------------------------------
  out.bayonetBefore = T.state.bayonetFixed;
  T.Debug.Key("KeyX");
  T.StepFrames(70);
  out.bayonetFixed = T.state.bayonetFixed;
  out.bayonetVisible = !!T.viewmodel.rig?.parts?.bayonet?.visible;
  R.GoTo("RangeMelee");
  T.StepFrames(10);
  const dir = T.player.AimDirection(T.player.velocity.clone());
  const Plant = (id) => {
    const s = T.ai.soldiers.find((c) => c.alive && c.holdZone && c.holdZone.id === `Range_${id}`);
    if (!s) return null;
    s.position.copy(T.player.position).addScaledVector(dir, 1.5);
    s.position.y = T.player.position.y;
    s.body?.Teleport(s.position.x,s.position.y,s.position.z);
    s.bayonetFixed=true;s.meleeTraining={passive:true};
    return s;
  };
  T.Debug.Key("KeyV", true);
  T.StepFrames(30);                          // > 0.30 s 的蓄力线 → 劈刺
  const m1 = Plant("M1");                    // 靶在松手前一刻才埋
  T.Debug.Key("KeyV", false);
  out.thrustMode = T.meleeCombat.State().player?.action;
  out.beforeContact=!!m1&&m1.health;
  T.StepFrames(35,1/60,false);
  out.thrustKilled = !!m1 && !m1.alive;
  T.StepFrames(80);

  // --- 5) 大刀：切 3 号槽，左键劈倒木桩 ------------------------------------
  T.Debug.Key("Digit3");
  T.StepFrames(20);
  out.meleeSlot = T.state.activeSlot;
  out.meleeWeapon = T.state.slots.melee;
  T.Debug.Mouse(0,true);T.StepFrames(30,1/60,false);
  const m2 = Plant("M2");
  T.Debug.Mouse(0,false);
  T.StepFrames(90,1/60,false);
  out.dadaoKilled = !!m2 && !m2.alive;

  // --- 6) 手榴弹：投弹位朝靶带扔一颗，弹数下账、靶带见伤 --------------------
  R.GoTo("RangeGrenade");
  T.StepFrames(10);
  const grenadesBefore = T.state.grenades;
  T.Debug.Throw("Grenade", 0.6);
  T.StepFrames(460, 1 / 60, false);          // 引信 4.2 s + 飞行，长跑不渲染
  out.grenadeSpent = T.state.grenades === grenadesBefore - 1;
  const gBand = R.Targets().filter((t) => t.station === "RangeGrenade");
  out.grenadeDamaged = gBand.some((t) => !t.alive || t.health < 100);
  out.grenadeBand = gBand.map((t) => `${t.id}:${t.alive ? t.health : "倒"}`).join(" ");

  // --- 7) 自动复位：倒下的木桩过 RANGE_RESPAWN_S 自己站回来 ----------------
  T.StepFrames(700, 1 / 60, false);          // 6 s 复位线 + 3 s 维护节拍，留足余量
  const revived = R.State();
  out.revivedAll = revived.targets.every((t) => t.alive);
  out.respawned = revived.stats.respawned;

  // --- 8) Reset：整场复位，计数清零、弹药回满 -------------------------------
  T.Debug.Key("Digit1");                     // 回到长枪槽再验弹药（大刀槽没有弹药账）
  T.StepFrames(20);
  T.state.ammo = 0;
  const reset = R.Reset();
  out.resetAlive = reset.targets.every((t) => t.alive && t.health === 100);
  out.resetStats = reset.stats.killed === 0 && reset.stats.respawned === 0
    && reset.stats.resets === 1;
  out.resetAmmo = reset.player.ammo > 0 && reset.player.grenades === 12;
  return out;
}, expectedTargets);

const checks = [
  ["进的是靶场关（Range）且已钉住不换关", result.level === "Range" && result.pinned === true],
  ["Debug.Range 五个取证口齐全", result.api === 5],
  [`木桩兵齐装（${expectedTargets} 具）且全是 dummy`,
    result.targetCount === expectedTargets && result.soldierCount === expectedTargets
    && result.allDummies && result.allAlive],
  ["三个工位都在路标表里", result.stations === "RangeRifle,RangeGrenade,RangeMelee"],
  ["测试携行在手（汉阳造 + 手榴弹）", result.loadout.weapon === "HanYang" && result.loadout.grenades === 12],
  ["开镜视野收窄超过 5°", result.adsIn > 0.9 && result.fovHip - result.fovAds > 5],
  ["松开右键视野还原", Math.abs(result.fovBack - result.fovHip) < 1],
  ["开枪命中木桩（lastShot=soldier）", result.rifleHit === true],
  ["10 m 靶真掉血", result.rifleDamaged === true],
  ["弹药下账", result.ammoSpent === true],
  ["X 上刺刀：状态翻转且刀件常显", !result.bayonetBefore && result.bayonetFixed && result.bayonetVisible],
  ["蓄力长刺先起手再接触放倒木桩", result.thrustMode === "Heavy" && result.beforeContact === 100 && result.thrustKilled === true],
  ["3 号槽是大刀且劈得倒人", result.meleeSlot === "melee" && result.meleeWeapon === "Dadao"
    && result.dadaoKilled === true],
  ["手榴弹下账一颗", result.grenadeSpent === true],
  ["投弹靶带见伤", result.grenadeDamaged === true],
  ["倒下的木桩自动复位", result.revivedAll === true && result.respawned >= 2],
  ["Reset 整场复位（靶满血、计数清零、弹药回满）",
    result.resetAlive && result.resetStats && result.resetAmmo],
  ["无控制台报错", errors.length === 0],
];

if (process.argv.includes("--shot")) {
  const shotDir = path.join(projectDir, "_shots", "range");
  mkdirSync(shotDir, { recursive: true });
  for (const stationId of ["RangeRifle", "RangeGrenade", "RangeMelee"]) {
    await page.evaluate((id) => {
      const T = window.Taierzhuang;
      T.Debug.Range.GoTo(id);
      T.StepFrames(15);
    }, stationId);
    await page.screenshot({ path: path.join(shotDir, `${stationId}.png`) });
    console.log(`shot ${stationId}.png`);
  }
}

console.log(JSON.stringify({ ...result, errors: errors.slice(0, 5) }, null, 2));
let passed = true;
for (const [label, ok] of checks) {
  if (!ok) passed = false;
  console.log(`${ok ? "ok  " : "FAIL"} ${label}`);
}

await browser.close();
server.close();
process.exit(passed ? 0 : 1);
