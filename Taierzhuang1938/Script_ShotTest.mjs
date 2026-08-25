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
  // 村落专项回归：从石墙村南侧看院内正立面。村核扩建后镜头后移到村界外，
  // 避免回归图出生在新房墙体内。
  { name: "Game_L0_JieheVillage", query: "shot=1&phase=0&quality=high&scale=medium",
    setup: { x: -154, z: -1278, yaw: 0, pitch: -0.04, quiet: true } },
  // 主路线专项：越过第一道阵地回望土坎，固定验收斜田坎、下切水沟、两侧农院
  // 与弹坑群是否真的进入玩法空间，而不是只在出生镜头摆一层远景。
  { name: "Game_L0_JieheRoute", query: "shot=1&phase=0&quality=high&scale=medium",
    setup: { x: 0, z: -1348, yaw: Math.PI, pitch: -0.06, quiet: true } },
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
    // 东门轴在 z=-65；旧 z=0 拍到的只是门南侧一堵墙，城楼从未进画。
    setup: { x: 360, z: -65, yaw: Math.PI / 2, pitch: 0.22, quiet: true } },
  // 生活层专项：冻结敌军开火，避免中弹红闪把路肩家什、车辙和院落细节染没。
  { name: "Game_Z4_CityLife", query: "shot=1&phase=5&quality=high&scale=medium",
    // CentralEastStreet 只延伸到 x=75；旧 x=88 在城图重排后会落进院墙。
    setup: { x: 62, z: 0, yaw: Math.PI / 2, pitch: -0.08, quiet: true } },
  { name: "Game_Z5_VillageLife", query: "shot=1&phase=0&quality=high&scale=medium",
    setup: { x: -154, z: -1278, yaw: 0, pitch: -0.05, quiet: true } },
  // 角楼专项：复用菜单里用户实际看见问题的“东南角望楼”长焦机位。
  // 旧四块交叉板屋顶在玩法近景不一定暴露，但这个镜头会直接看出悬空和穿插。
  { name: "Game_Z6_CornerTower", query: "quality=high&scale=medium",
    setup: { menuShot: "SouthEastTower" } },
  // 墙身专项：东墙外近距离仰看包砖修补、泄水孔、垛口压顶与墙顶铺砖。
  { name: "Game_Z7_WallDetail", query: "shot=1&phase=4&quality=high&scale=medium",
    setup: { x: 364, z: 198, yaw: Math.PI / 2, pitch: 0.19, quiet: true } },
  // 城图布局回归：从县衙上方俯看公共院落和交叉街，验主次街尺度、
  // 院落不压路以及功能区的体量差，而不是又拍一次十字街正面。
  { name: "Game_Z8_CityLayout", query: "phase=5&quality=high&scale=medium",
    setup: { menuShot: "Yamen" } },
  // 东关连续性：从濠外沿东门大街回看东门，必须同时读到关厢住宅带、道路和城门，
  // 防止东关生成成与城门脱节的一块独立布景。
  { name: "Game_Z9_EastGateStreet", query: "quality=high&scale=medium",
    setup: { menuShot: "EastGate" } },
  // 防区空间关系：站在东墙炮击缺口向城内看，验缺口后的街、掩体与城内纵深，
  // 避免和既有东门仰视、东关常规战斗镜头重复。
  { name: "Game_Z10_BreachIntoCity", query: "shot=1&phase=4&quality=high&scale=medium",
    setup: { x: 294, z: -65, yaw: Math.PI / 2, pitch: -0.09, quiet: true } },
  // 两个缺口各留一张城外正面照：必须同时看见非对称 V 形断肩、黄褐夯土芯、
  // 墙体真实厚度、内外瓦砾扇与中央通行槽，防止以后又退回规则凹槽。
  { name: "Game_Z18_EastWallBreach", query: "shot=1&phase=4&quality=high&scale=medium",
    setup: { x: 350, z: 15, yaw: Math.PI / 2, pitch: 0.12, quiet: true } },
  { name: "Game_Z19_SouthWallBreach", query: "shot=1&phase=4&quality=high&scale=medium",
    setup: { x: 285, z: 350, yaw: 0, pitch: 0.12, quiet: true } },
  // 完整墙段的两张材质/建模近景：一张锁补砖与灰青砖 PBR，一张锁石框泄水嘴、
  // 压顶和勒脚，防止后续优化只顾缺口、把其余 2.4 km 墙身退回光滑灰盒。
  { name: "Game_Z20_SouthWallRepairPbr", query: "phase=4&quality=high&scale=medium",
    setup: { menuShot: "SouthEastTower", hideMenu: true,
      cam: { from: [-214, 6.2, 330], look: [-214, 4.2, 308], focalMm: 65 } } },
  { name: "Game_Z21_SouthWallDrainPbr", query: "phase=4&quality=high&scale=medium",
    setup: { menuShot: "SouthEastTower", hideMenu: true,
      cam: { from: [-116, 8.7, 331], look: [-116, 8.7, 308], focalMm: 70 } } },
  // ——批次A 之后的四个视觉盲区补口（旧机位没有一张能看到中城师部/北城功能区/庙街/南城）——
  // 中城师部：当典后街上看 124 师部门脸（门楼+番号木牌+沙袋哨位+旗）。
  { name: "Game_Z11_DivisionHq", query: "shot=1&phase=5&quality=high&scale=medium",
    setup: { x: -38, z: -90.5, yaw: Math.PI / 2, pitch: -0.02, quiet: true } },
  // 庙街：龙王庙街东口隔街看山门（红门脸+起翘屋脊是庙的识别语言）。北城要 phase=4。
  { name: "Game_Z12_TempleStreet", query: "shot=1&phase=4&quality=high&scale=medium",
    setup: { x: 96, z: -144, yaw: 1.0033, pitch: 0.07, quiet: true } },
  // 北城羁押区：监狱两排牢房之间的甬道——一侧全是铁窗、一侧一个洞都没有（WP-A1 验证机位）。
  // 注意别摆在警察所与监狱之间的巷口：那条缝会被 PlanBlocks 补上一格民居，第一版机位一脸墙。
  { name: "Game_Z13_JailQuarter", query: "shot=1&phase=4&quality=high&scale=medium",
    setup: { x: 162, z: -196.7, yaw: -1.55, pitch: 0.02, quiet: true } },
  // 南城：站在火神庙东街街心正看天主堂钟塔（南城唯一高点）。街外 4 m 就是院墙，机位必须压街心。
  { name: "Game_Z14_SouthChurch", query: "shot=1&phase=4&quality=high&scale=medium",
    setup: { x: 36, z: 210, yaw: Math.PI, pitch: 0.06, quiet: true } },
  // 西关大街：站在街心往东看怀古门 —— 一张图同时验土路、沿街铺面、通讯队院墙、
  // 师部方向与桥头引道。西关带只在 phase=1 生成（bounds）。
  { name: "Game_Z15_XiguanStreet", query: "shot=1&phase=1&quality=high&scale=medium",
    setup: { x: -405, z: 0, yaw: -Math.PI / 2, pitch: 0.02, quiet: true } },
  // 护城河水面专项：斜跨东墙濠沟，近岸、深水与城墙倒映必须同时入画。
  // 这张固定镜头用来抓屏幕空间水深方向写反、全屏泡沫和滚动法线接缝。
  //（master 侧原名 Z11，与本分支的师部机位撞号，合并时改为 Z16。）
  { name: "Game_Z16_MoatWater", query: "shot=1&phase=4&quality=high&scale=medium",
    setup: { x: 314, z: 165, yaw: -0.73, pitch: -0.46, quiet: true } },
  // 民居屋面专项：屋脊高度俯瞰城内院落，中景与远景两档必须同框。
  // 这一张是补一个**只有从屋面之上才暴露**的盲区：远景档的坡顶曾经是
  // 「两片朝外翘的板 + 一条比它们都低的正脊」（倒 V），一格院子是一块 21×16 m
  // 的实心大饼 —— 地面机位一辈子拍不到，玩家一进主菜单的关厢机位就看见了。
  // 验收点：① 每座房的正脊是屋面最高处；② 瓦面压在墙上、不悬空、不互相穿插；
  // ③ 远景那一片与近处的中景院落是同一种房子（院墙 + 门口 + 正房）。
  { name: "Game_Z17_BlockRoofs", query: "phase=4&quality=high&scale=medium",
    setup: { menuShot: "SouthEastTower",
      cam: { from: [140, 26, 150], look: [-60, 3, 40], focalMm: 42 } } },
  // 南城学校群俯视：同框验收滕文中学两进教室、书院小学一进教室，以及各自
  // 校门—操场—教室的连续铺地轴线。必须用 phase=4，L5 的切片不生成南城。
  { name: "Game_Z20_SouthSchools", query: "phase=4&quality=high&scale=medium",
    setup: { menuShot: "SouthEastTower",
      cam: { from: [-140, 155, 330], look: [-140, 0, 220], focalMm: 48 } } },
  // 编辑器语义层全城验收：一键从 Data_Tengxian 读取公共院落和十九段街路，
  // 区域画琥珀框、道路画蓝色带，中文牌必须在俯瞰相机里可读。
  { name: "Game_Z21_EditorMapLabels", query: "phase=4&quality=high&scale=medium&menu=0",
    setup: { editorMapLabels: true } },
  // 东北治安与羁押组团俯视：警察所、警备队、监狱和看守所同框，重点看机关院
  // 石框列队场、门房/旗杆和监狱高墙，不让四处再淹没在普通民居屋顶里。
  { name: "Game_Z22_PoliceQuarter", query: "phase=4&quality=high&scale=medium",
    setup: { menuShot: "SouthEastTower",
      cam: { from: [160, 125, -95], look: [160, 0, -210], focalMm: 50 } } },
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
      if (pose.editorMapLabels) {
        document.getElementById("bootStart")?.click();
        game.StepFrames(36);
        game.Debug.OpenEditor("scene");
        const editor = game.editor.active;
        editor.LoadMapReferences();
        editor.TopDown();
        game.StepFrames(24);
        return;
      }
      if (pose.menuShot) {
        const index = game.menu.shots.findIndex((shot) => shot.id === pose.menuShot);
        if (index < 0) throw new Error(`找不到菜单机位 ${pose.menuShot}`);
        game.menu.shotIndex = index;
        game.menu.shotTime = 0;
        // cam：借菜单的推轨系统架一个**表里没有**的机位。
        // 玩家的相机贴地，菜单机位是这一关唯一能把镜头抬到屋面之上的口子；
        // 屋顶类的回归只能从那儿拍。改的是这一份 shots 的副本，不落回 Data_Menu。
        if (pose.cam) {
          const shot = game.menu.shots[index];
          shot.from = pose.cam.from;
          shot.to = pose.cam.to || pose.cam.from;
          shot.look = pose.cam.look;
          shot.lookTo = pose.cam.lookTo || pose.cam.look;
          if (pose.cam.focalMm) shot.focalMm = pose.cam.focalMm;
          game.menu.ApplyShot(0);
          if (pose.hideMenu) document.getElementById("menu").style.display = "none";
          game.StepFrames(12);
          return;
        }
        game.menu.ApplyShot(0.45);
        game.StepFrames(12);
        return;
      }
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
