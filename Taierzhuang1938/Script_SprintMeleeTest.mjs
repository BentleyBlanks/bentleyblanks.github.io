// 冲刺白刃回归：大刀在跑动中「按得出去」且「看得见」。
//
// 这条链上原来有两处断口，一处在输入、一处在视觉，各自都能单独把这一刀吃掉：
//   1) Script_Main.TryFire 的冲刺闸排在大刀分支**前面** —— 拿刀冲刺时左键完全无反应，
//      而 V 键（走 OnAction，不过 TryFire）照样能挥。同一个动作两个键两种结果。
//   2) 冲刺姿态把刀压到画面右下角。实测刀身中点的 NDC 在蓄力顶点冲到 (1.4, −0.9)，
//      整条刀弧在画面外走完 —— 挥了等于没挥。
// 所以这里两件都断言，而且**不看函数**：左键走 Debug.Fire（TryFire 全链），
// 刀在不在画面里靠把刀身中点投影到 NDC 数帧，不靠读姿态数值猜。
//
// 判据是"跑动中的这一刀 ≈ 站着的这一刀"：站姿轨迹是基准，冲刺轨迹必须贴着它走。

import os from "node:os";
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
page.on("pageerror", (error) => errors.push(String(error)));
page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });

await page.goto(`http://127.0.0.1:${port}/Taierzhuang1938/?shot=1&phase=2&quality=medium&scale=small`,
  { waitUntil: "load", timeout: 120000 });
await page.waitForFunction(() => window.Taierzhuang?.state?.ready, { timeout: 180000 });

await page.evaluate(() => {
  const T = window.Taierzhuang;
  T.player.health = 100;
  T.player.spawnGrace = 99;
  // 日军推远：这条测的是自己手里的刀，不是被人打断的刀
  for (const soldier of T.ai.soldiers) if (soldier.side === "ija") soldier.position.x += 500;
  T.Debug.Key("Digit3");           // 走键位表切到大刀槽，不直接调 SwitchSlot
  T.StepFrames(10);
  // 取刀身中点而不是刀尖：刀尖离握把 0.74 m，抡起来必然扫出画面，站着也一样。
  // 「这一刀读不读得到」看的是刀身在不在框里。
  window.__bladeNdc = () => {
    const mid = T.player.position.clone().set(0, 0, -0.42);
    T.viewmodel.swingPivot.localToWorld(mid);
    mid.project(T.camera);
    return { x: +mid.x.toFixed(3), y: +mid.y.toFixed(3) };
  };
});

/**
 * 挥一刀：先把移动状态稳住，再走左键，然后逐帧记刀身位置。
 *
 * 整个采样循环必须在**同一个 page.evaluate 里同步跑完**。分成一帧一次往返的话，
 * 每次往返的真实时间里页面自己的 rAF 会照常推进动画，采样点就落在随机相位上 ——
 * 实测同一份代码 swept 在 2.0 与 2.4 之间跳，阈值型断言变成抛硬币。
 * 同步循环期间 rAF 回调根本没机会插进来，StepFrames 是唯一的时间来源，dt 恒为 1/60。
 */
async function Swing(sprinting) {
  return page.evaluate((on) => {
    const T = window.Taierzhuang;
    T.Debug.Key("ShiftLeft", !!on);
    T.Debug.Key("KeyW", !!on);
    T.StepFrames(90);              // 冲刺弹簧与体力都到稳态
    T.Debug.Fire();                // 左键全链：input.fire -> TryFire -> DoMelee
    const fired = { action: T.viewmodel.action?.kind ?? null, sprint: T.player.sprint };
    const track = [];
    for (let i = 0; i < 34; i += 1) {
      T.StepFrames(1);
      track.push({
        t: T.viewmodel.action?.t ?? -1,
        speed: T.player.velocity.length(),
        ...window.__bladeNdc(),
      });
    }
    T.Debug.Key("ShiftLeft", false);
    T.Debug.Key("KeyW", false);
    T.StepFrames(120);             // 收招 + 冲刺姿态回位，两次挥刀互不污染
    return { fired, track };
  }, sprinting);
}

const stand = await Swing(false);
const run = await Swing(true);

const screenshotPath = path.join(os.tmpdir(), "TaierzhuangSprintMelee.png");
await page.screenshot({ path: screenshotPath });

// 取「在挥刀里的采样中有多大比例刀身在框内」而不是绝对帧数：rAF 与 StepFrames 并行，
// 每次跑落在 0.5 s 挥刀窗口里的采样数本来就有一两帧的浮动，绝对数会随机红。
const InFrame = (result) => {
  const active = result.track.filter((f) => f.t >= 0);
  if (!active.length) return 0;
  return active.filter((f) => Math.abs(f.x) < 1 && Math.abs(f.y) < 1).length / active.length;
};
const Swept = (result) => {
  const xs = result.track.filter((f) => f.t >= 0).map((f) => f.x);
  return xs.length ? Math.max(...xs) - Math.min(...xs) : 0;
};
const standIn = +InFrame(stand).toFixed(2);
const runIn = +InFrame(run).toFixed(2);
const runSpeed = Math.min(...run.track.map((f) => f.speed));
const muteBack = await page.evaluate(() => window.Taierzhuang.viewmodel.meleeSprintMute);

const checks = [
  ["站姿左键挥得出刀（基准）", stand.fired.action === "melee"],
  ["冲刺中左键挥得出刀", run.fired.action === "melee"],
  ["确实在冲刺（不是被减速吃掉的假冲刺）", run.fired.sprint > 0.95],
  ["挥刀不打断跑动", runSpeed > 4.5],
  ["站姿这一刀大半在画面里（基准）", standIn >= 0.6],
  // 采样确定性了（见 Swing 的注释），所以阈值可以卡紧：实测两条一模一样，
  // 留 0.05 / 0.9 的余量只是给浮点和未来的小改动。
  ["冲刺这一刀在画面里的比例不低于站姿", runIn >= standIn - 0.05],
  ["冲刺刀弧的横扫幅度与站姿同量级", Swept(run) > Swept(stand) * 0.9],
  ["收招后冲刺静音归零（姿态还给冲刺）", muteBack < 0.02],
  ["无控制台报错", errors.length === 0],
];

console.log(JSON.stringify({
  stand: { fired: stand.fired, inFrame: standIn, swept: +Swept(stand).toFixed(2) },
  run: { fired: run.fired, inFrame: runIn, swept: +Swept(run).toFixed(2), minSpeed: +runSpeed.toFixed(2) },
  muteBack, screenshotPath, errors: errors.slice(0, 5),
}, null, 2));

let passed = true;
for (const [label, ok] of checks) {
  if (!ok) passed = false;
  console.log(`${ok ? "ok  " : "FAIL"} ${label}`);
}

await browser.close();
server.close();
process.exit(passed ? 0 : 1);
