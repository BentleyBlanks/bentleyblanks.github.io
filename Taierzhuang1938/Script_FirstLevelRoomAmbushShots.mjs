// 屋内伏击（第一关公开阶段 9）的五张定帧。与用户给的《使命召唤：二战》参考图一一对应：
//   Ref1 被砸倒   枪托抡到脸上、镜头往地板上掉
//   Ref2 晕厥     躺在地上仰头看屋顶（所以那间屋必须有梁有板，不能是天）
//   Ref3 糊着看见 从地板上看过去：日军正在捅我们的人（模糊但认得出）
//   Ref4 扑上来   他压下来，屏幕上只有一个提示环
//   Ref5 推刀     近景较劲，环变成连按表
//
// 与 Script_FirstLevelMissionBrowserTest 的分工：那一条是**断言**（跑在 quality=low），
// 这一条只出图，跑在**玩家的默认画质**上（不带 quality= / scale=），1280×720。
//
// 用法（worktree 根）：node Taierzhuang1938/Script_FirstLevelRoomAmbushShots.mjs
// 图落在 Taierzhuang1938/_shots/RoomAmbush/D/（忽略目录）。
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { LaunchBrowser } from "../PrairieFire1937/Script_BrowserTestKit.mjs";
import { ServeRoot } from "./Script_DevServer.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const output = path.join(here, "_shots", "RoomAmbush", "D");
await fs.mkdir(output, { recursive: true });

const server = await ServeRoot(root, 0);
const browser = await LaunchBrowser();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on("pageerror", (error) => { errors.push(String(error)); console.log("PAGEERROR", String(error)); });

const Shot = async (name) => {
  const alive = await page.evaluate(() => window.Tengxian.player.Alive);
  if (!alive) throw Error("出图跑里玩家在 " + name + " 之前就死了 —— 这一帧不算数");
  await page.evaluate(() => window.Tengxian.StepFrames(2, 1 / 60, true));
  await page.screenshot({ path: path.join(output, `${name}.png`) });
  const state = await page.evaluate(() => {
    const g = window.Tengxian, mission = g.Debug.FirstLevelMission();
    return {
      phase: mission.ambush.phase, control: mission.control,
      daze: mission.ambush.daze, prompt: mission.ambush.promptView,
      fighter: g.meleeCombat.Fighter(g.player).state,
      cameraDrop: +(g.player.meleeCameraDrop || 0).toFixed(2),
      pitch: +g.player.pitch.toFixed(3), health: g.player.health,
      cinematic: document.querySelector("#hud")?.classList.contains("cinematicBeat") === true,
      ring: document.querySelector(".hudCinematicPrompt")?.className || null,
    };
  });
  console.log("SHOT", name, JSON.stringify(state));
  return state;
};

// 默认画质：不带 quality / scale。manual=1 交出推帧权，shot=1 免指针锁与关中过场。
await page.goto(`http://127.0.0.1:${server.address().port}/Taierzhuang1938/?whitebox=p012&shot=1&manual=1`,
  { waitUntil: "load", timeout: 180000 });
await page.waitForFunction(() => window.Tengxian?.state?.ready === true, null, { timeout: 300000 });
await page.evaluate(async () => { await window.Tengxian.Debug.FirstLevelJump(9); });
// 调试跳转不会替玩家把村口那几个打掉：躺在地上的十几秒里他们会一直点名，
// 出图跑到第四帧人就没了（2026-09-16 实拍）。这里只在出图工具里把非伏击的日军收起来 ——
// 正常打过来的玩家本来就是清完他们才进屋的。
await page.evaluate(() => {
  const g = window.Tengxian;
  const ambush = ["AmbushLead", "AmbushRearA", "AmbushRearB", "AmbushFlank"];
  for (const actor of g.ai.soldiers) {
    if (actor.side !== "ija" || ambush.includes(actor.missionId)) continue;
    actor.scriptedNoncombatant = true;
    actor.missionDormant = true;
    actor.meleeDormant = true;
  }
});
await page.evaluate(() => window.Tengxian.StepFrames(30, 1 / 60, false));

// 走进触发圈。担架跟到门口、四个人起身、控制权被锁。
await page.evaluate(() => {
  const g = window.Tengxian;
  const Mission = () => g.Debug.FirstLevelMission();
  if (g.state.activeSlot === "melee") g.Debug.Key("Digit1");
  for (let i = 0; i < 40 * 60 && !Mission().facts.includes("ambushTriggered") && g.player.Alive; i += 1) {
    const p = g.player.position, target = { x: 58, z: 6 };
    const yaw = Math.atan2(p.x - target.x, p.z - target.z);
    const gap = Math.atan2(Math.sin(yaw - g.player.yaw), Math.cos(yaw - g.player.yaw));
    g.player.yaw += Math.max(-0.06, Math.min(0.06, gap));
    g.player.pitch = 0;
    g.Debug.Key("KeyW", Math.hypot(p.x - target.x, p.z - target.z) > 1 && Math.abs(gap) < 0.6);
    g.StepFrames(1, 1 / 60, false);
  }
  g.Debug.Key("KeyW", false);
});

// Ref1 —— 枪托砸到、镜头往下掉的那一刻。
await page.evaluate(() => {
  const g = window.Tengxian;
  const Mission = () => g.Debug.FirstLevelMission();
  for (let i = 0; i < 8 * 60 && !Mission().facts.includes("ambushStabbed"); i += 1) g.StepFrames(1, 1 / 60, false);
  g.StepFrames(8, 1 / 60, false);        // 砸中之后 0.13 s：红闪还在，画面开始往地上歪
});
await Shot("Ref1_ButtStrike");

// Ref2 —— 晕厥之后睁开眼：躺着看屋顶。眼皮走完（ambushDazeEyelids 3.2 s）再拍。
await page.evaluate(() => {
  const g = window.Tengxian;
  const Mission = () => g.Debug.FirstLevelMission();
  for (let i = 0; i < 8 * 60; i += 1) {
    const daze = Mission().ambush.daze;
    if (daze && daze.eyeClosure < 0.12 && Mission().ambush.sinceButt > 2.4) break;
    g.StepFrames(1, 1 / 60, false);
  }
});
await Shot("Ref2_Dazed");

// Ref3 —— 从地板上看过去：日军正在捅担架队的人（视线已经被拉到北门口）。
await page.evaluate(() => {
  const g = window.Tengxian;
  const Mission = () => g.Debug.FirstLevelMission();
  for (let i = 0; i < 12 * 60 && !Mission().facts.includes("zhouStabbed"); i += 1) g.StepFrames(1, 1 / 60, false);
  g.StepFrames(10, 1 / 60, false);
});
await Shot("Ref3_LitterStab");

// Ref4 —— 他扑上来压刺刀：屏幕上只有一个环。
await page.evaluate(() => {
  const g = window.Tengxian;
  const Mission = () => g.Debug.FirstLevelMission();
  for (let i = 0; i < 12 * 60 && Mission().ambush.phase !== "grab"; i += 1) g.StepFrames(1, 1 / 60, false);
  g.StepFrames(8, 1 / 60, false);
});
await Shot("Ref4_Pounce");

// Ref5 —— 抓住枪、推刀：同一个环变成连按表。
await page.evaluate(() => {
  const g = window.Tengxian;
  const Mission = () => g.Debug.FirstLevelMission();
  g.Debug.Key("KeyF", true); g.Debug.Key("KeyF", false);
  g.StepFrames(3, 1 / 60, false);
  for (let i = 0; i < 90 && Mission().ambush.phase === "mash"; i += 1) {
    if (i % 10 === 0) { g.Debug.Key("KeyF", true); g.Debug.Key("KeyF", false); }
    g.StepFrames(1, 1 / 60, false);
    if (i > 26) break;                    // 推到一半就停手拍照，环上要看得见进度
  }
  g.Debug.Key("KeyF", false);
});
await Shot("Ref5_Grapple");

console.log("PAGEERRORS", errors.length, JSON.stringify(errors.slice(0, 4)));
await browser.close();
server.close();
if (errors.length) { console.log("FAILED: page errors"); process.exitCode = 1; }
else console.log("ok room ambush reference frames →", output);
