// 《滕县 一九三八》出图工具：真浏览器跑页面、推进固定帧数、落 PNG。
// 视觉审查 agent 的唯一输入来源 —— 所以必须**可复现**：固定视口、固定帧数、
// 不用 Math.random 的画面抖动。
//
// 用法：
//   node Taierzhuang1938/Script_ShotTest.mjs [输出目录] [--probe] [--only=名字]
// 默认输出到 Taierzhuang1938/_shots/（已 gitignore）。

import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { LaunchBrowser } from "../PrairieFire1937/Script_BrowserTestKit.mjs";
import { ServeRoot } from "./Script_DevServer.mjs";

const projectDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(projectDir, "..");
const args = process.argv.slice(2);
const outDir = path.resolve(args.find((a) => !a.startsWith("--")) || path.join(projectDir, "_shots"));
const probeOnly = args.includes("--probe");
const onlyArg = args.find((a) => a.startsWith("--only="));
const only = onlyArg ? onlyArg.slice(7).split(",") : null;
fs.mkdirSync(outDir, { recursive: true });

/** 探针页镜头表：材质球 + 五个时段的街景。 */
const PROBE_SHOTS = [
  { name: "Probe_Materials", query: "scene=materials&preset=smokyDay&quality=high" },
  { name: "Probe_StreetDusk", query: "scene=street&preset=dusk&quality=high" },
  { name: "Probe_StreetSmokyDay", query: "scene=street&preset=smokyDay&quality=high" },
  { name: "Probe_StreetBurning", query: "scene=street&preset=burningStreet&quality=high" },
  { name: "Probe_StreetNight", query: "scene=street&preset=night&quality=high" },
  { name: "Probe_StreetDawn", query: "scene=street&preset=dawn&quality=high" },
];

/** 正片镜头表：由 index.html 的 debug 接口驱动（Script_Main 暴露 window.Taierzhuang）。 */
const GAME_SHOTS = [
  // 七关各一张。名字带关号与地名 —— 视觉审查是按图说话的，
  // 图名看不出是哪一关的话，评语就落不回代码
  { name: "Game_L0_Jiehe", query: "shot=1&phase=0&quality=high&scale=medium" },
  // 村落专项回归：从石墙村南侧 55 m 看院内正立面。默认 L0 开场图里村子只有
  // 天际线高度，屋脊方向、门窗和院落变体都验不出来。
  { name: "Game_L0_JieheVillage", query: "shot=1&phase=0&quality=high&scale=medium",
    setup: { x: -160, z: -1322, yaw: 0, pitch: -0.04 } },
  { name: "Game_L1_Beishahe", query: "shot=1&phase=1&quality=high&scale=medium" },
  { name: "Game_L2_Dongguan", query: "shot=1&phase=2&quality=high&scale=medium" },
  { name: "Game_L3_Fanji", query: "shot=1&phase=3&quality=high&scale=medium" },
  { name: "Game_L4_Chengqiang", query: "shot=1&phase=4&quality=high&scale=medium" },
  { name: "Game_L5_Shizijie", query: "shot=1&phase=5&quality=high&scale=medium" },
  { name: "Game_L6_Beimen", query: "shot=1&phase=6&quality=high&scale=medium" },
  // 这两张不是「多出来的花絮」：E3（开镜视野）与 D3（开火表现）此前只能靠审查员
  // 每轮手搓临时探针去看，连吃两轮盲区。加进常规集，下一轮直接从标准图里评。
  { name: "Game_Z1_Ads", query: "shot=1&phase=2&quality=high&scale=medium&ads=1" },
  { name: "Game_Z2_Fire", query: "shot=1&phase=4&quality=high&scale=medium&fire=1" },
  // 城楼专项回归：东门外仰看宗鲁门。菜单长焦能验轮廓，这一张负责验屋面不穿插、
  // 檐下斗拱和月台石栏在近景也确实存在，防止以后又退化成四块交叉板。
  { name: "Game_Z3_GateTower", query: "shot=1&phase=4&quality=high&scale=medium",
    setup: { x: 360, z: 0, yaw: Math.PI / 2, pitch: 0.22 } },
  // 生活层专项：冻结敌军开火，避免中弹红闪把路肩家什、车辙和院落细节染没。
  { name: "Game_Z4_CityLife", query: "shot=1&phase=5&quality=high&scale=medium",
    setup: { x: 88, z: 0, yaw: Math.PI / 2, pitch: -0.08, quiet: true } },
  { name: "Game_Z5_VillageLife", query: "shot=1&phase=0&quality=high&scale=medium",
    setup: { x: -160, z: -1322, yaw: 0, pitch: -0.05, quiet: true } },
];

const VIEWPORT = { width: 1600, height: 900 };

const server = await ServeRoot(rootDir, 0);
const port = server.address().port;
const browser = await LaunchBrowser();
const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: 1 });

const problems = [];
page.on("pageerror", (error) => problems.push(`PAGEERROR ${String(error).slice(0, 300)}`));
page.on("console", (message) => {
  if (message.type() !== "error") return;
  const url = message.location()?.url || "";
  if (/fonts\.(googleapis|gstatic)\.com/.test(url)) return;
  problems.push(`CONSOLE ${message.text().slice(0, 300)}`);
});

async function Shoot(pageName, url, globalName, setup = null) {
  problems.length = 0;
  await page.goto(url, { waitUntil: "load", timeout: 90000 });
  await page.waitForFunction((g) => window[g] !== undefined, globalName, { timeout: 90000 });
  // 先让加载/烘焙走完，再推进固定帧数把时序相关效果（火焰闪烁、运动模糊历史）稳住
  // 先推逻辑帧把战场跑活（AI 铺开、粒子起来），再让 rAF 真渲染若干帧。
  // 推逻辑帧 != 推渲染帧：镜头缓动、材质淡出、光照换挡全在渲染侧。
  await page.evaluate((g) => window[g].StepFrames(240), globalName);
  await page.waitForTimeout(700);
  if (setup) {
    await page.evaluate(({ g, pose }) => {
      const game = window[g];
      game.player.Spawn(pose.x, pose.z, pose.yaw);
      game.player.pitch = pose.pitch || 0;
      if (pose.quiet) {
        // 环境审查不是战斗审查：保留士兵和战场烟火，但让他们暂时不能开枪。
        // Spawn 会先清一次受伤状态；这里再冻结 AI，保证后续帧不会重新染红画面。
        game.player.health = 100;
        game.player.bleeding = 0;
        game.player.hitFlash = 0;
        game.player.hitMarks.length = 0;
        if (game.ai) for (const soldier of game.ai.soldiers) {
          soldier.coolUntil = 1e9;
          soldier.fireTimer = 0;
        }
      }
      game.StepFrames(12);
    }, { g: globalName, pose: setup });
  }
  await page.evaluate((g) => window[g].StepFrames(60), globalName);
  if (setup?.quiet) await page.evaluate((g) => {
    const game = window[g];
    game.player.health = 100;
    game.player.bleeding = 0;
    game.player.hitFlash = 0;
    game.player.hitMarks.length = 0;
  }, globalName);
  await page.waitForTimeout(500);
  const file = path.join(outDir, `${pageName}.png`);
  await page.screenshot({ path: file });
  const stat = fs.statSync(file);
  const status = problems.length ? "ERR" : "ok";
  console.log(`${status.padEnd(4)} ${pageName.padEnd(24)} ${(stat.size / 1024).toFixed(0)}KB  ${file}`);
  if (problems.length) for (const p of problems.slice(0, 4)) console.log(`      ${p}`);
  return problems.length === 0;
}

let allOk = true;
const probeList = only ? PROBE_SHOTS.filter((s) => only.includes(s.name)) : PROBE_SHOTS;
for (const shot of probeList) {
  const url = `http://127.0.0.1:${port}/Taierzhuang1938/Probe.html?${shot.query}`;
  allOk = (await Shoot(shot.name, url, "Probe")) && allOk;
}

if (!probeOnly && fs.existsSync(path.join(projectDir, "index.html"))) {
  const gameList = only ? GAME_SHOTS.filter((s) => only.includes(s.name)) : GAME_SHOTS;
  for (const shot of gameList) {
    const url = `http://127.0.0.1:${port}/Taierzhuang1938/?${shot.query}`;
    try {
      allOk = (await Shoot(shot.name, url, "Taierzhuang", shot.setup || null)) && allOk;
    } catch (error) {
      console.log(`ERR  ${shot.name.padEnd(24)} ${String(error).slice(0, 160)}`);
      allOk = false;
    }
  }
}

await browser.close();
server.close();
console.log(allOk ? "\n出图完成，无控制台错误。" : "\n出图完成，但有报错，见上。");
process.exit(allOk ? 0 : 1);
