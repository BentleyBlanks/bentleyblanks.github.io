// 白刃 QTE 浏览器回归：六式输入、真实时间慢动作、伤害/处决、HUD 与骨骼动作全链。
// --shot 在 _shots/MeleeQte.png 留一张六工位体验场的人工验收图（目录已 gitignore）。

import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { LaunchBrowser } from "../PrairieFire1937/Script_BrowserTestKit.mjs";
import { ServeRoot } from "./Script_DevServer.mjs";

const projectDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(projectDir, "..");
const server = await ServeRoot(rootDir, 0);
const port = server.address().port;
const browser = await LaunchBrowser();
const page = await browser.newPage({ viewport: { width: 1440, height: 810 } });
const errors = [];
page.on("pageerror", (error) => errors.push(String(error)));
page.on("console", (message) => {
  if (message.type() !== "error") return;
  const text = message.text();
  const url = message.location()?.url || "";
  if (/fonts\.(googleapis|gstatic)\.com/.test(url) || /ERR_BLOCKED_BY_CLIENT/.test(text)) return;
  errors.push(text);
});
// 这条测的是白刃链，不让 Google Fonts 的外网波动决定成败；系统字体是等价回退。
await page.route(/^https:\/\/fonts\.(googleapis|gstatic)\.com\//,
  (route) => route.abort("blockedbyclient"));

await page.goto(`http://127.0.0.1:${port}/Taierzhuang1938/?shot=1&melee=1&quality=medium&scale=small`,
  { waitUntil: "load", timeout: 120000 });
await page.waitForFunction(() => window.Taierzhuang?.state?.ready
  && window.Taierzhuang?.Debug?.MeleeQte, null, { timeout: 180000 });

const result = await page.evaluate(() => {
  const T = window.Taierzhuang;
  const Q = T.Debug.MeleeQte;
  const out = {};
  const Tap = (code) => T.Debug.Key(code);
  const FinishResolve = () => T.StepFrames(80, 1 / 60, false);

  T.StepFrames(20);
  const initial = Q.State();
  out.level = T.Debug.Level().id;
  out.pinned = T.state.pinned;
  out.targetCount = initial.targets.length;
  out.styles = initial.stations.map((station) => `${station.kind}:${station.pattern}`).join(",");
  out.loadout = `${initial.player.weapon}/${T.state.slots.melee}`;
  out.allFormalActors = T.ai.soldiers.length === 6
    && T.ai.soldiers.every((soldier) => soldier.dummy && soldier.actor && soldier.bayonetFixed);

  // 三套格挡：连按、左右交替、V/F 节奏。第一套同时验慢动作、HUD 和双骨骼层。
  Q.GoTo("BlockMash");
  Q.TriggerBlock(0);
  T.StepFrames(3);
  const mashOpen = Q.State();
  out.slowScale = mashOpen.timeScale;
  out.hudOpen = mashOpen.hud?.label?.includes("格挡一")
    && document.querySelector(".hudMeleeQte.on") !== null;
  out.actorPose = Math.abs(T.ai.soldiers.find((s) => s.meleeQte)?.actor?.chest.rotation.x || 0) > 0.03;
  out.viewmodelPose = Math.abs(mashOpen.viewmodel.z) > 0.03 || Math.abs(mashOpen.viewmodel.rz) > 0.1;
  for (let i = 0; i < 6; i += 1) Tap("KeyV");
  FinishResolve();
  out.blockMash = Q.State().stats.blockSuccess === 1;

  Q.GoTo("BlockAlternate"); Q.TriggerBlock(1); T.StepFrames(2);
  for (const key of ["KeyA", "KeyD", "KeyA", "KeyD", "KeyA", "KeyD"]) Tap(key);
  FinishResolve();
  out.blockAlternate = Q.State().stats.blockSuccess === 2;

  Q.GoTo("BlockRhythm"); Q.TriggerBlock(2); T.StepFrames(2);
  for (const key of ["KeyV", "KeyF", "KeyV", "KeyF"]) Tap(key);
  FinishResolve();
  out.blockRhythm = Q.State().stats.blockSuccess === 3;

  // 格挡失败：输入窗口超时后真扣 46 点，不能只在 HUD 上写“失败”。
  Q.GoTo("BlockMash");
  const healthBeforeFail = T.player.health;
  Q.TriggerBlock(0);
  T.StepFrames(130, 1 / 60, false);
  out.blockFailDamage = healthBeforeFail - T.player.health;
  FinishResolve();

  // 三套处决：亮区点按、短序列、按住再松。三具不同目标都走 Soldier.Kill。
  Q.GoTo("ExecuteTimed"); T.StepFrames(2); Tap("KeyF"); // 真走 KEYMAP → OnAction → F 处决
  T.StepFrames(46, 1 / 60, false);            // 0.77 / 2.20 = 亮区中段
  Tap("KeyV");
  T.StepFrames(40, 1 / 60, false);
  out.executeTimed = !Q.Targets().find((target) => target.id === "Q4").alive;
  FinishResolve();

  Q.GoTo("ExecuteSide"); Q.TriggerExecution(1); T.StepFrames(2);
  for (const key of ["KeyA", "KeyD", "KeyV"]) Tap(key);
  T.StepFrames(40, 1 / 60, false);
  out.executeSide = !Q.Targets().find((target) => target.id === "Q5").alive;
  FinishResolve();

  Q.GoTo("ExecuteBrace"); Q.TriggerExecution(2);
  T.Debug.Key("KeyV", true);
  T.StepFrames(38, 1 / 60, false);
  T.Debug.Key("KeyV", false);
  T.StepFrames(40, 1 / 60, false);
  out.executeBrace = !Q.Targets().find((target) => target.id === "Q6").alive;
  FinishResolve();
  out.executionStats = Q.State().stats.executionSuccess;

  // 辅助口径：hold 让“按住”替代连按；auto 直接替玩家完成，但规则与结果不换链。
  Q.Reset();
  Q.SetAssist("hold"); Q.GoTo("BlockMash"); Q.TriggerBlock(0);
  T.Debug.Key("KeyV", true); T.StepFrames(95, 1 / 60, false); T.Debug.Key("KeyV", false);
  FinishResolve();
  out.holdAssist = Q.State().stats.blockSuccess >= 4;
  Q.SetAssist("auto"); Q.GoTo("BlockAlternate"); Q.TriggerBlock(1);
  T.StepFrames(130, 1 / 60, false); FinishResolve();
  out.autoAssist = Q.State().stats.blockSuccess >= 5;
  Q.SetAssist("tap");

  out.hudClosed = Q.State().active === null
    && !document.querySelector(".hudMeleeQte")?.classList.contains("on");
  return out;
});

const checks = [
  ["进的是白刃测试章且已钉住", result.level === "MeleeQte" && result.pinned],
  ["六工位 / 六具正式 Actor 齐装", result.targetCount === 6 && result.allFormalActors],
  ["三格挡 + 三处决样式表完整", result.styles === "block:0,block:1,block:2,execution:0,execution:1,execution:2"],
  ["携行含已装刺刀长枪与大刀", result.loadout === "HanYang/Dadao"],
  ["输入阶段短时慢动作是 0.28 倍", Math.abs(result.slowScale - 0.28) < 0.001],
  ["QTE HUD 真正显示", result.hudOpen],
  ["敌人骨架与第一人称武器都在动", result.actorPose && result.viewmodelPose],
  ["格挡一：连击顶开", result.blockMash],
  ["格挡二：左右拨架", result.blockAlternate],
  ["格挡三：节奏反击", result.blockRhythm],
  ["格挡失败真实扣 46 点（随后开始流血）",
    result.blockFailDamage >= 46 && result.blockFailDamage < 47],
  ["处决一：正踹直劈", result.executeTimed],
  ["处决二：侧踹横斩", result.executeSide],
  ["处决三：抵枪突刺", result.executeBrace],
  ["三套处决都记入规则统计", result.executionStats === 3],
  ["长按代替连按辅助有效", result.holdAssist],
  ["自动 QTE 辅助有效", result.autoAssist],
  ["结算后 HUD 收口", result.hudClosed],
  ["无控制台错误", errors.length === 0],
];

if (process.argv.includes("--shot")) {
  const shotDir = path.join(projectDir, "_shots");
  mkdirSync(shotDir, { recursive: true });
  // 六式跑完后的页面经历过死亡/复位/辅助模式切换，不适合当体验图。重新开一张
  // 干净测试章，再停在节奏格挡输入阶段，保证截图里 QTE 卡、工位和骨骼都是真状态。
  await page.goto(`http://127.0.0.1:${port}/Taierzhuang1938/?shot=1&melee=1&quality=medium&scale=small`,
    { waitUntil: "load", timeout: 120000 });
  await page.waitForFunction(() => window.Taierzhuang?.state?.ready
    && window.Taierzhuang?.Debug?.MeleeQte, null, { timeout: 180000 });
  await page.evaluate(() => {
    const T = window.Taierzhuang;
    T.Debug.MeleeQte.GoTo("BlockRhythm");
    T.Debug.MeleeQte.TriggerBlock(2);
    T.StepFrames(8);
  });
  await page.screenshot({ path: path.join(shotDir, "MeleeQte.png") });
  console.log("shot MeleeQte.png");
}

console.log(JSON.stringify({ ...result, errors: errors.slice(0, 8) }, null, 2));
let passed = true;
for (const [label, ok] of checks) {
  if (!ok) passed = false;
  console.log(`${ok ? "ok  " : "FAIL"} ${label}`);
}

await browser.close();
server.close();
process.exit(passed ? 0 : 1);
