// 《滕县 一九三八》主菜单冒烟：真浏览器把菜单跑起来，验运镜与选章这两条链路。
//
// 为什么单起一份而不是并进开机冒烟：开机冒烟一律走 ?shot=1（不建菜单），
// 通关冒烟走 ?menu=0（要点 #bootStart）—— 两份都刻意绕开了菜单，
// 于是菜单成了没有任何测试保护的裸奔区。这一份专治它。
//
// 用法：
//   node Taierzhuang1938/Script_MenuTest.mjs            冒烟（约两分钟）
//   node Taierzhuang1938/Script_MenuTest.mjs --shots    再把七章的菜单机位各出一张图
// 退出码即成败。图落在 Taierzhuang1938/_shots/（已 gitignore）。

import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { LaunchBrowser } from "../PrairieFire1937/Script_BrowserTestKit.mjs";
import { ServeRoot } from "./Script_DevServer.mjs";

const projectDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(projectDir, "..");
const withShots = process.argv.includes("--shots");
const outDir = path.join(projectDir, "_shots");
fs.mkdirSync(outDir, { recursive: true });

const server = await ServeRoot(rootDir, 0);
const port = server.address().port;
const browser = await LaunchBrowser();
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });

const problems = [];
page.on("pageerror", (error) => problems.push(`PAGEERROR ${String(error).slice(0, 260)}`));
page.on("console", (message) => {
  if (message.type() !== "error") return;
  const url = message.location()?.url || "";
  if (/fonts\.(googleapis|gstatic)\.com/.test(url)) return;
  problems.push(`CONSOLE ${message.text().slice(0, 260)}`);
});

let failed = 0;
function Check(name, ok, detail = "") {
  if (!ok) failed += 1;
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? "  — " + detail : ""}`);
}

// index.html 直接承载启动标题和按钮；一旦被工具误存成 GBK，浏览器会按
// <meta charset="utf-8"> 解码成乱码，残缺的闭合标签还会把后面的主菜单吞进
// 启动层。先在启动浏览器前锁死文件编码，避免只测到脚本数据仍然正确。
let indexText = "";
try {
  indexText = new TextDecoder("utf-8", { fatal: true })
    .decode(fs.readFileSync(path.join(projectDir, "index.html")));
  Check("入口 HTML 是有效 UTF-8", !indexText.includes("\uFFFD"));
} catch (error) {
  Check("入口 HTML 是有效 UTF-8", false, String(error));
}

const Url = (query = "") => `http://127.0.0.1:${port}/Taierzhuang1938/?quality=medium&scale=small${query}`;

async function Boot(query = "") {
  await page.goto(Url(query), { waitUntil: "load", timeout: 120000 });
  await page.waitForFunction(() => window.Taierzhuang !== undefined, null, { timeout: 240000 });
  await page.waitForFunction(() => window.Taierzhuang.Debug.Menu !== undefined, null, { timeout: 60000 });
  await page.evaluate(() => window.Taierzhuang.StepFrames(30));
}

// ===========================================================================
// 1) 开机就落在菜单上，玩法没有在背后跑
// ===========================================================================
await Boot();
{
  const m = await page.evaluate(() => {
    const T = window.Taierzhuang;
    return {
      menu: T.Debug.Menu(),
      running: T.state.running,
      inMenu: T.state.menu,
      hudHidden: document.getElementById("hud").style.display === "none",
      viewmodel: T.viewmodel.root.visible,
      nra: T.ai.soldiers.filter((s) => s.side === "nra").length,
      ija: T.ai.soldiers.filter((s) => s.side === "ija").length,
      rootOff: document.getElementById("menu").classList.contains("off"),
      items: [...document.querySelectorAll("#menu .mnItem")].map((e) => e.textContent.trim()),
      documentTitle: document.title,
      bootTitle: document.getElementById("bootTitle")?.textContent.trim(),
      bootSubtitle: document.getElementById("bootSub")?.textContent.trim(),
      bootStart: document.getElementById("bootStart")?.textContent.trim(),
      bootHierarchy: document.getElementById("bootTitle")?.parentElement?.id,
      menuTitle: document.querySelector("#menu .mnTitleMain")?.textContent.trim(),
      menuSubtitle: document.querySelector("#menu .mnTitleSub")?.textContent.trim(),
      menuLines: [...document.querySelectorAll("#menu .mnTitleLine")].map((e) => e.textContent.trim()),
    };
  });
  Check("启动界面标题、日期与按钮文字正确",
    m.documentTitle === "滕县 一九三八"
      && m.bootTitle === "滕县 一九三八"
      && m.bootSubtitle === "一九三八年三月十四日 — 十八日 · 山东滕县"
      && m.bootStart === "进 城"
      && m.bootHierarchy === "bootHead",
    `${m.documentTitle} / ${m.bootTitle} / ${m.bootSubtitle} / ${m.bootStart}`);
  Check("主菜单标题与战役说明文字正确",
    m.menuTitle === "滕县 一九三八"
      && m.menuSubtitle === "一九三八年三月十四日 — 十八日 · 山东滕县"
      && m.menuLines.length === 3
      && m.menuLines.every((line) => line.length > 0 && !line.includes("\uFFFD")),
    `${m.menuTitle} / ${m.menuSubtitle} / ${m.menuLines.join(" | ")}`);
  Check("开机落在主菜单上", m.menu.open && m.inMenu && !m.running && !m.rootOff,
    `open=${m.menu.open} menu=${m.inMenu} running=${m.running}`);
  Check("菜单六项都在（含设置与调试选项）",
    m.items.length === 6 && m.items.includes("调试选项") && m.items.includes("设置"),
    m.items.join(" / "));
  Check("菜单里 HUD 与手里的枪都藏起来了", m.hudHidden && !m.viewmodel,
    `hud=${m.hudHidden} viewmodel=${m.viewmodel}`);
  // 菜单里摆的是几个守军，**一个日军都不许有** ——
  // 有敌人就会开打，开打就死人，而兵员池是关卡状态（玩家还没按开始）
  Check("菜单场景里只有守军、没有日军", m.nra === 5 && m.ija === 0, `nra=${m.nra} ija=${m.ija}`);
  Check("菜单背后建的是东关那一章（Data_Menu.MENU_SCENE.slice）", m.menu.slice === 2,
    `slice=${m.menu.slice}`);
}

// ===========================================================================
// 1a) 主菜单真实点击「设置」：不能只验内部回调，面板必须真的在屏幕上
// ===========================================================================
await page.click('.mnItem[data-act="settings"]');
{
  const opened = await page.evaluate(() => {
    const panel = document.querySelector(".edPanel.launcher");
    const rect = panel?.getBoundingClientRect();
    return {
      menu: window.Taierzhuang.Debug.Menu(),
      editor: window.Taierzhuang.Debug.Editor(),
      display: panel ? getComputedStyle(panel).display : "missing",
      width: rect?.width || 0,
      height: rect?.height || 0,
    };
  });
  Check("主菜单点击设置会显示设置与工具面板",
    opened.menu.open && opened.menu.mode === "title"
      && opened.editor.panelOpen && !opened.editor.hidden
      && opened.display === "flex" && opened.width > 0 && opened.height > 0,
    JSON.stringify(opened));
}
await page.click(".edPanel.launcher .edX");
{
  const closed = await page.evaluate(() => ({
    menu: window.Taierzhuang.Debug.Menu(),
    editor: window.Taierzhuang.Debug.Editor(),
    inMenu: window.Taierzhuang.state.menu,
  }));
  Check("关闭设置后回到主菜单并重新隐藏开发工具层",
    closed.menu.open && closed.menu.mode === "title" && closed.inMenu
      && !closed.editor.panelOpen && closed.editor.hidden,
    JSON.stringify(closed));
}

// ===========================================================================
// 1b) 调试选项：开关在主菜单上可见、实际写入运行时，再返回主菜单
// ===========================================================================
{
  await page.evaluate(() => window.Taierzhuang.Debug.MenuAct("debug"));
  const debugPanel = await page.evaluate(() => ({
    mode: window.Taierzhuang.Debug.Menu().mode,
    options: [...document.querySelectorAll("#menu .mnDebugRow")].map((e) => e.dataset.option),
  }));
  Check("主菜单能打开五项调试选项", debugPanel.mode === "debug" && debugPanel.options.length === 5,
    JSON.stringify(debugPanel));
  await page.screenshot({ path: path.join(outDir, "Menu_Debug.png") });
  await page.click('#menu .mnDebugRow[data-option="noCollision"] input');
  const noCollision = await page.evaluate(() => window.Taierzhuang.Debug.DebugOptions());
  Check("无碰撞开关写入玩法配置", noCollision.noCollision === true, JSON.stringify(noCollision));
  await page.evaluate(() => window.Taierzhuang.Debug.SetDebugOption("noCollision", false));
  await page.keyboard.press("Escape");
  Check("调试面板 Esc 返回主菜单", await page.evaluate(() => window.Taierzhuang.Debug.Menu().mode === "title"));
}

// ===========================================================================
// 2) 运镜：相机真的在动，而且是按机位表在动
// ===========================================================================
{
  const before = await page.evaluate(() => window.Taierzhuang.Debug.Menu().camera);
  await page.evaluate(() => window.Taierzhuang.StepFrames(180));   // 3 秒
  const after = await page.evaluate(() => window.Taierzhuang.Debug.Menu().camera);
  const moved = Math.hypot(after.x - before.x, after.y - before.y, after.z - before.z);
  Check("推轨在动（三秒内相机位移 > 0.3 m）", moved > 0.3, `moved=${moved.toFixed(2)} m`);
  // 焦距语汇沿用分镜表：35 mm ≈ 37.8°，不该是玩法用的 55°
  Check("机位吃的是机位表的焦距，不是玩法 FOV", Math.abs(after.fov - 55) > 2,
    `fov=${after.fov.toFixed(1)}`);

  const shots = await page.evaluate(() => window.Taierzhuang.Debug.Menu().shotCount);
  Check("东关那一章配了两个机位", shots === 2, `shots=${shots}`);

  // 站在菜单里十秒：不许死人，兵员池不许动（菜单不消耗关卡状态）
  const poolBefore = await page.evaluate(() => window.Taierzhuang.state.nraPool);
  await page.evaluate(() => window.Taierzhuang.StepFrames(600));
  const still = await page.evaluate(() => ({
    alive: window.Taierzhuang.ai.soldiers.filter((s) => s.alive).length,
    deaths: JSON.stringify(window.Taierzhuang.ai.deaths || {}),
    pool: window.Taierzhuang.state.nraPool,
  }));
  Check("菜单里挂十秒：没人死、兵员池没动",
    still.alive === 5 && still.pool === poolBefore,
    `alive=${still.alive} deaths=${still.deaths} pool=${still.pool}/${poolBefore}`);

  // 定时切机位：先把计时归零，再推过一个完整 hold。
  // 不归零时，前面三秒 + 十秒 + 截图等待可能已接近切点；再推 17 秒会跨过**两个**
  // 切点、回到原机位，测试把「切了两次」误报成「一次没切」。
  const first = await page.evaluate(() => {
    window.Taierzhuang.menu.shotTime = 0;
    return window.Taierzhuang.Debug.Menu().shot;
  });
  await page.evaluate(() => window.Taierzhuang.StepFrames(17 * 60));
  const second = await page.evaluate(() => window.Taierzhuang.Debug.Menu().shot);
  Check("十六秒后自动切下一个机位", first !== second, `${first} -> ${second}`);
}

// 三个机位各出一张图（视觉审查按图说话）
for (let i = 0; i < 3; i += 1) {
  await page.evaluate((k) => {
    const menu = window.Taierzhuang.menu;
    menu.shotIndex = k;
    menu.shotTime = 0;
    menu.ApplyShot(0.45);
    window.Taierzhuang.StepFrames(4);
  }, i);
  await page.waitForTimeout(200);
  await page.screenshot({ path: path.join(outDir, `Menu_Title_Shot${i}.png`) });
}

// ===========================================================================
// 3) 选章：战区地图 + 日期时间轴、两组入口与任务简报
// ===========================================================================
{
  await page.evaluate(() => window.Taierzhuang.Debug.MenuShow("levels"));
  await page.waitForTimeout(150);
  const panel = await page.evaluate(() => ({
    levels: [...document.querySelectorAll("#menu .mnLevel")].length,
    groups: [...document.querySelectorAll("#menu .mnLevelGroup b")].map((e) => e.textContent),
    previews: [...document.querySelectorAll("#menu .mnCutscenePreview")].length,
    prologue: document.querySelector("#menu .mnProloguePreview")?.textContent || "",
    sandboxes: [...document.querySelectorAll("#menu .mnSandboxLevel")].map((entry) => entry.textContent || ""),
    map: !!document.querySelector("#menu .mnMap"),
    zones: document.querySelectorAll("#menu .mnMapZone").length,
    route: !!document.querySelector("#menu .mnCampaignRoute"),
    mapNodes: document.querySelectorAll("#menu .mnCampaignNode").length,
    selectedMapNodes: document.querySelectorAll("#menu .mnCampaignNode.on").length,
    timelineDates: [...document.querySelectorAll("#menu .mnTimelineTrack .mnLvDate")]
      .map((entry) => entry.textContent || ""),
    panelTitle: document.querySelector("#menu .mnPanelTitle")?.textContent || "",
    title: document.querySelector("#menu .mnBriefTitle")?.textContent || "",
    objectives: document.querySelectorAll("#menu .mnObjectives li").length,
    go: document.querySelector("#menu .mnGo")?.textContent || "",
  }));
  // 规格：正式章节（七章）与测试场景（玩法靶场 / 白刃 QTE / 策划白盒）分两组。
  // 界河白盒与过场预览保留直达 query，但不出现在玩家可见的选章列表里。
  Check("选章分成「正式章节」与「测试场景」两组",
    panel.groups.length === 2 && panel.groups[0] === "正式章节" && panel.groups[1] === "测试场景",
    panel.groups.join(" / "));
  Check("测试场景包含玩法靶场、白刃 QTE 与策划白盒",
    panel.levels === 10 && panel.previews === 0 && !panel.prologue
      && panel.sandboxes.length === 3
      && panel.sandboxes.some((entry) => entry.includes("玩法测试靶场"))
      && panel.sandboxes.some((entry) => entry.includes("白刃战 QTE 测试场"))
      && panel.sandboxes.some((entry) => entry.includes("第一关 · 全新策划白盒"))
      && panel.sandboxes.every((entry) => !entry.includes("界河")),
    `levels=${panel.levels} previews=${panel.previews} prologue=${panel.prologue} sandboxes=${panel.sandboxes.join("|")}`);
  Check("简报里有全图，且标出了这一关的路标链", panel.map && panel.zones >= 3,
    `map=${panel.map} zones=${panel.zones}`);
  Check("选章以七节点战区地图呈现空间推进",
    panel.route && panel.mapNodes === 7 && panel.selectedMapNodes === 1
      && panel.panelTitle === "滕县战区 · 任务选择",
    `route=${panel.route} nodes=${panel.mapNodes} selected=${panel.selectedMapNodes} title=${panel.panelTitle}`);
  Check("正式章节以三月十四至十七日的横向时间轴呈现",
    panel.timelineDates.length === 7
      && panel.timelineDates[1] === "03.14"
      && panel.timelineDates.includes("03.16")
      && panel.timelineDates.at(-1) === "03.17",
    panel.timelineDates.join(" / "));
  Check("简报有标题、目标清单与进入按钮",
    panel.title.length > 0 && panel.objectives >= 3 && panel.go.includes("进入"),
    `${panel.title} / 目标 ${panel.objectives} / ${panel.go}`);
  await page.screenshot({ path: path.join(outDir, "Menu_Levels.png") });

  // 换一关看简报是不是跟着换
  await page.evaluate(() => window.Taierzhuang.menu.SelectLevel(2));
  await page.waitForTimeout(120);
  const second = await page.evaluate(() => ({
    title: document.querySelector("#menu .mnBriefTitle").textContent,
    slice: document.querySelector("#menu .mnMapSlice").getAttribute("x"),
  }));
  Check("换一章，简报与图上的切片框都跟着换", second.title.includes("手榴弹雨"), second.title);
}

// ===========================================================================
// 3.5) 战役入口：「开始」要播关前过场，而且**过场必须真的在走**
//
// 这一条是补票。过场没有自己的帧驱动，全靠 Frame() 推；而从菜单进关时
// state.running 还是 false（要等过场播完才 StartRun）——主循环里那道
// 「没在跑就直接 return」曾经把「开始」卡死在出川的黑场里：过场在等一个
// 永远不来的帧，而 StartRun 在等过场结束。选章那条路不播过场，测不到它。
// ===========================================================================
{
  await page.evaluate(() => window.Taierzhuang.Debug.MenuAct("start"));
  await page.waitForTimeout(900);
  // 开演前有一段着色器预热（Script_Main.WarmupShaders）：布景已经建好、时间轴被
  // 按住，屏幕上盖着加载画面。这一段几秒到十几秒不等（看机器和驱动的着色器缓存），
  // 所以**不能按固定等待去采时间轴**，要等 Held 放开再采。
  const warming = await page.evaluate(() => ({
    held: !!window.Taierzhuang.cutscene?.Held,
    boot: !document.getElementById("boot").classList.contains("gone"),
    bar: document.querySelector("#bootBar i").style.width,
    step: document.getElementById("bootStep").textContent,
  }));
  Check("预热期间盖着加载画面、进度条在走（不是黑屏干等）",
    !warming.held || (warming.boot && parseFloat(warming.bar) > 0),
    `held=${warming.held} boot=${warming.boot} bar=${warming.bar} step=${warming.step}`);
  await page.waitForFunction(() => window.Taierzhuang.cutscene && !window.Taierzhuang.cutscene.Held,
    null, { timeout: 120000 }).catch(() => {});
  const a = await page.evaluate(() => ({
    playing: !!window.Taierzhuang.cutscene?.Playing,
    id: window.Taierzhuang.state.cutscene,
    t: window.Taierzhuang.cutscene?.time || 0,
  }));
  await page.waitForTimeout(1200);
  const b = await page.evaluate(() => window.Taierzhuang.cutscene?.time || 0);
  Check("「开始」播序章那一场过场", a.playing && a.id === "CS_Chuchuan", `id=${a.id} playing=${a.playing}`);
  Check("过场真的在往前走（不是卡在第一帧）", b > a.t + 0.5, `t ${a.t.toFixed(2)} -> ${b.toFixed(2)} s`);
  Check("预热完才开演：头几秒的台词没有在加载画面背后白白流走", a.t < 1.5, `t=${a.t.toFixed(2)} s`);

  // Esc 跳过，别在冒烟里干等三十八秒
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => window.Taierzhuang.state.running === true, null, { timeout: 180000 })
    .catch(() => {});
  const done = await page.evaluate(() => ({
    running: window.Taierzhuang.state.running,
    level: window.Taierzhuang.Debug.Level().id,
    open: window.Taierzhuang.Debug.Menu().open,
  }));
  // 序章是过场承载章：车厢播完（或 Esc 跳过）自动接第一章，中间不建自己的切片。
  Check("跳过序章过场之后自动接进第一关", done.running && done.level === "CH1_NanLu" && !done.open,
    `running=${done.running} level=${done.level}`);

  // 回主菜单，下一节从选章再进一次
  await page.evaluate(() => {
    window.Taierzhuang.Debug.Pause();
    window.Taierzhuang.Debug.MenuAct("title");
  });
  await page.evaluate(() => window.Taierzhuang.StepFrames(20));
}

// ===========================================================================
// 4) 从选章进关：切片重建、玩法真的跑起来
// ===========================================================================
{
  await page.evaluate(() => window.Taierzhuang.Debug.MenuPlay(2));
  await page.waitForFunction(() => window.Taierzhuang.state.running === true, null, { timeout: 180000 });
  await page.evaluate(() => window.Taierzhuang.StepFrames(60));
  const inGame = await page.evaluate(() => {
    const T = window.Taierzhuang;
    return {
      running: T.state.running, inMenu: T.state.menu, level: T.Debug.Level().id,
      built: T.state.builtPhase,
      hudHidden: document.getElementById("hud").style.display === "none",
      menuOff: document.getElementById("menu").classList.contains("off"),
      soldiers: T.ai.soldiers.length,
      viewmodel: T.viewmodel.root.visible,
    };
  });
  Check("从选章能进关（第二关 · 手榴弹雨）", inGame.running && inGame.level === "CH2_Shouliudan",
    `running=${inGame.running} level=${inGame.level} built=${inGame.built}`);
  Check("进关后菜单收起、HUD 与枪回来", inGame.menuOff && !inGame.hudHidden && inGame.viewmodel,
    `menuOff=${inGame.menuOff} hud=${!inGame.hudHidden} vm=${inGame.viewmodel}`);
  Check("进关后战场上有人", inGame.soldiers > 4, `soldiers=${inGame.soldiers}`);
  await page.screenshot({ path: path.join(outDir, "Menu_InGame.png") });
}

// ===========================================================================
// 4b) 调试选项必须改到真实玩法，而不只是菜单上的复选框
// ===========================================================================
{
  const mechanics = await page.evaluate(() => {
    const T = window.Taierzhuang;
    T.player.health = 35;
    T.player.bleeding = 3;
    T.Debug.SetDebugOption("invincible", true);
    T.player.TakeHit(999, "head");
    const invincible = T.player.Alive && T.player.health === 100 && T.player.bleeding === 0;

    T.Debug.SetDebugOption("infiniteGrenades", true);
    const grenadesBefore = T.state.grenades;
    const throwOriginal = T.combat.Throw;
    T.combat.Throw = () => {};
    T.Debug.Throw("Grenade", 0.2);
    T.combat.Throw = throwOriginal;
    const infiniteGrenades = grenadesBefore >= 1 && T.state.grenades === grenadesBefore;

    T.state.ammo = 0;
    T.Debug.SetDebugOption("infiniteAmmo", true);
    const infiniteAmmo = T.state.ammo > 0;

    T.Debug.SetDebugOption("noCollision", true);
    const x = T.player.position.x;
    const z = T.player.position.z;
    T.player.position.set(x, T.battlefield.GroundHeight(x, z) + 5, z);
    T.player.velocity.set(0, -20, 0);
    T.player.MoveWithCollision(0.5);
    const terrainHeld = Math.abs(T.player.position.y - T.battlefield.GroundHeight(x, z)) < 0.001;

    T.Debug.SetDebugOption("noCollision", false);
    T.Debug.SetDebugOption("invincible", false);
    T.Debug.SetDebugOption("infiniteGrenades", false);
    T.Debug.SetDebugOption("infiniteAmmo", false);
    return { invincible, infiniteGrenades, infiniteAmmo, terrainHeld, options: T.Debug.DebugOptions() };
  });
  Check("无敌、无限补给与无碰撞贴地实际生效",
    mechanics.invincible && mechanics.infiniteGrenades && mechanics.infiniteAmmo && mechanics.terrainHeld,
    JSON.stringify(mechanics));
}

// ===========================================================================
// 5) Esc 暂停 -> 回主菜单 -> 再进一关
// ===========================================================================
{
  // 玩家报上来的那一次手里拿的是**大刀**（3 号槽），走键位表切过去再走整条路：
  // 刀的 rig 是双手抱着的一整块，藏起来时画面上是"整只手连刀一起没了"，
  // 比丢一支步枪显眼得多 —— 出图那一张就是给人眼复核这件事的。
  await page.evaluate(() => { window.Taierzhuang.Debug.Key("Digit3"); });
  await page.evaluate(() => window.Taierzhuang.StepFrames(4));
  const swordUp = await page.evaluate(() => window.Taierzhuang.Debug.Slots());
  Check("先换到大刀（这一段按玩家那次的持械走）",
    swordUp.active === "melee" && swordUp.viewmodel === "Dadao",
    `active=${swordUp.active} viewmodel=${swordUp.viewmodel}`);

  // 以前这里直接调 Debug.Pause()，绕开了真实 Esc 与指针锁，正好漏掉了玩家侧的事故。
  await page.keyboard.press("Escape");
  const paused = await page.evaluate(() => ({
    ...window.Taierzhuang.Debug.Menu(), running: window.Taierzhuang.state.running,
  }));
  Check("Esc 能暂停并显示菜单",
    paused.open && paused.mode === "pause" && !paused.running && paused.items.includes("settings"),
    `mode=${paused.mode} running=${paused.running}`);
  // 暂停要连声音一起停：环境床与音乐是自己在跑的 WebAudio 图，Frame() 停了它们照响
  //（上游 Script_Audio.SetPaused 已经把闸装好了，这里验菜单这条路真的去拉了闸）
  const audioPaused = await page.evaluate(() => window.Taierzhuang.audio.paused);
  Check("暂停时背景音也停了", audioPaused === true, `audio.paused=${audioPaused}`);
  // HUD 必须收起来：顶着阶段条、简报和小地图，暂停菜单读不清（实拍抓到的）
  const hudGone = await page.evaluate(() => getComputedStyle(document.getElementById("hud")).display);
  Check("暂停时 HUD 收起来", hudGone === "none", `display=${hudGone}`);
  // 暂停屏是「冻住的战场 + 一层压暗 + 一列字」：HUD 收起来，但**手里那支枪留着**。
  // 它是画面的一部分，藏了就得有人负责放回来 —— 而「继续」不管这件事。
  const pausedGun = await page.evaluate(() => window.Taierzhuang.viewmodel.root.visible);
  Check("暂停时手里的枪还在画面里", pausedGun === true, `viewmodel=${pausedGun}`);
  // 暂停不许动相机：动了的话回到游戏时玩家会发现自己看着别处
  const camA = await page.evaluate(() => window.Taierzhuang.Debug.Menu().camera);
  await page.waitForTimeout(400);
  const camB = await page.evaluate(() => window.Taierzhuang.Debug.Menu().camera);
  Check("暂停时相机不动", Math.hypot(camB.x - camA.x, camB.y - camA.y, camB.z - camA.z) < 0.001);
  await page.screenshot({ path: path.join(outDir, "Menu_Pause.png") });

  await page.evaluate(() => window.Taierzhuang.Debug.MenuAct("settings"));
  const settings = await page.evaluate(() => ({
    editor: window.Taierzhuang.Debug.Editor(),
    menu: window.Taierzhuang.Debug.Menu(),
    running: window.Taierzhuang.state.running,
  }));
  Check("暂停菜单能打开设置，战斗仍冻结",
    settings.editor.panelOpen && settings.menu.mode === "pause" && !settings.running,
    JSON.stringify(settings));
  await page.keyboard.press("Escape");
  const settingsClosed = await page.evaluate(() => ({
    editor: window.Taierzhuang.Debug.Editor(), menu: window.Taierzhuang.Debug.Menu(),
    viewmodel: window.Taierzhuang.viewmodel.root.visible,
  }));
  Check("设置里按 Esc 回到暂停菜单",
    !settingsClosed.editor.panelOpen && settingsClosed.menu.open && settingsClosed.menu.mode === "pause");
  // 从设置回暂停层不能顺手把枪和齿轮藏了：那是**主菜单**的收口（OpenMenu），
  // 抄到暂停这条路上就成了「从设置回来手里空了」——拿大刀时整只手都没了，
  // 而且不换关不重生再也回不来（SwitchSlot 不碰 root.visible）。
  Check("从设置回暂停层，手里的枪与齿轮都还在",
    settingsClosed.viewmodel === true && !settingsClosed.editor.hidden,
    `viewmodel=${settingsClosed.viewmodel} gearHidden=${settingsClosed.editor.hidden}`);

  // 玩家说的「点击了设置界面」指的是真的点**进**操作 / 画质 / 音效那三页，
  // 不是只把入口面板叫出来 —— 三页各自那个 × 走的是 host.Close()，
  // 与关掉整块面板同一条收口（Close → FinishEditorSession）。
  // 逐页开→关走一遍，每一步大刀都必须还在手里：只验入口面板会整段漏掉这条路。
  for (const id of ["controls", "graphics", "sound"]) {
    await page.evaluate(() => window.Taierzhuang.Debug.MenuAct("settings"));
    await page.evaluate((editorId) => {
      document.querySelector(`#edRoot .edBtn[data-editor="${editorId}"]`).click();
    }, id);
    await page.evaluate(() => window.Taierzhuang.StepFrames(2));
    const on = await page.evaluate(() => ({
      active: window.Taierzhuang.Debug.Editor().active,
      visible: window.Taierzhuang.viewmodel.root.visible,
      weapon: window.Taierzhuang.Debug.Slots().viewmodel,
    }));
    Check(`点进设置·${id} 时大刀还在手里`,
      on.active === id && on.visible === true && on.weapon === "Dadao", JSON.stringify(on));
    // 点这一页自己的 ×（不是面板的 ×，也不是 Esc）：玩家最常用的那个关法
    await page.evaluate(() => {
      document.querySelector("#edRoot .edPanel.work .edX").click();
    });
    await page.evaluate(() => window.Taierzhuang.StepFrames(2));
    const off = await page.evaluate(() => ({
      active: window.Taierzhuang.Debug.Editor().active,
      mode: window.Taierzhuang.Debug.Menu().mode,
      visible: window.Taierzhuang.viewmodel.root.visible,
      weapon: window.Taierzhuang.Debug.Slots().viewmodel,
    }));
    Check(`关掉设置·${id} 回暂停层，大刀还在手里`,
      off.active === null && off.mode === "pause"
        && off.visible === true && off.weapon === "Dadao", JSON.stringify(off));
  }
  await page.evaluate(() => window.Taierzhuang.Debug.CloseEditor());

  // 实际复现玩家路径：暂停 → 设置 → 构件库预览。过去只有场景/地形工具会
  // 收起暂停菜单，摄影棚类编辑器会把「继续 / 设置 / 调试选项」叠在背景里。
  // 所有编辑器接管后都必须整层隐藏菜单；关闭工具后再回原暂停层，不能恢复战斗。
  await page.evaluate(() => {
    window.Taierzhuang.Debug.MenuAct("settings");
    window.Taierzhuang.Debug.OpenEditor("props");
  });
  await page.evaluate(() => window.Taierzhuang.StepFrames(4));
  const propEditorOpen = await page.evaluate(() => ({
    editor: window.Taierzhuang.Debug.Editor(),
    menu: window.Taierzhuang.Debug.Menu(),
    menuDisplay: getComputedStyle(document.getElementById("menu")).display,
    running: window.Taierzhuang.state.running,
  }));
  Check("构件库编辑器打开时暂停菜单整层隐藏",
    propEditorOpen.editor.active === "props" && !propEditorOpen.menu.open
      && propEditorOpen.menuDisplay === "none" && !propEditorOpen.running,
    JSON.stringify(propEditorOpen));
  await page.screenshot({ path: path.join(outDir, "Menu_PropEditorFromPause.png") });

  await page.evaluate(() => window.Taierzhuang.Debug.CloseEditor());
  const propEditorClosed = await page.evaluate(() => ({
    editor: window.Taierzhuang.Debug.Editor(),
    menu: window.Taierzhuang.Debug.Menu(),
    menuDisplay: getComputedStyle(document.getElementById("menu")).display,
    running: window.Taierzhuang.state.running,
  }));
  Check("关闭构件库编辑器后恢复原暂停菜单",
    !propEditorClosed.editor.capturing && propEditorClosed.menu.open
      && propEditorClosed.menu.mode === "pause" && propEditorClosed.menuDisplay !== "none"
      && !propEditorClosed.running,
    JSON.stringify(propEditorClosed));

  // 按「继续」时设置面板还开着是常事：关掉某一页设置只关那一页，入口面板留着。
  // 不收掉它 editor.Capturing 就一直是 true —— Frame 走的还是编辑器那条分支
  //（世界冻着）、每一次点击都被当成"在点面板"吃掉、指针锁也不去抢。
  // 玩家看到的是「回到了战斗但镜头和身体都不听话」。
  await page.evaluate(() => window.Taierzhuang.Debug.MenuAct("settings"));
  await page.evaluate(() => window.Taierzhuang.Debug.MenuAct("resume"));
  await page.evaluate(() => window.Taierzhuang.StepFrames(4));
  const resumed = await page.evaluate(() => ({
    running: window.Taierzhuang.state.running, open: window.Taierzhuang.Debug.Menu().open,
    editor: window.Taierzhuang.Debug.Editor(),
    locked: window.Taierzhuang.Debug.PointerLock().locked,
  }));
  Check("暂停里的「继续」能回到游戏", resumed.running && !resumed.open, JSON.stringify(resumed));
  Check("「继续」把还开着的设置面板一并收掉（否则世界还冻着、点击全被吃）",
    !resumed.editor.panelOpen && !resumed.editor.capturing && resumed.locked === true,
    JSON.stringify(resumed.editor) + ` locked=${resumed.locked}`);
  const audioBack = await page.evaluate(() => window.Taierzhuang.audio.paused);
  Check("继续之后背景音接回来", audioBack === false, `audio.paused=${audioBack}`);
  const hudBack = await page.evaluate(() => getComputedStyle(document.getElementById("hud")).display);
  Check("继续之后 HUD 回来", hudBack !== "none", `display=${hudBack}`);
  // 这一整段走的正是玩家报的那条路：暂停 → 设置 → 构件库 → 关掉 → 继续。
  // 收口断在哪一步这里都红：回到战斗时手里必须还有枪。
  await page.evaluate(() => window.Taierzhuang.StepFrames(8));
  const gunBack = await page.evaluate(() => ({
    visible: window.Taierzhuang.viewmodel.root.visible, ...window.Taierzhuang.Debug.Slots(),
  }));
  Check("从设置/编辑器回来再「继续」，大刀还在手里",
    gunBack.visible === true && gunBack.viewmodel === "Dadao",
    `visible=${gunBack.visible} viewmodel=${gunBack.viewmodel}`);
  await page.screenshot({ path: path.join(outDir, "Menu_ResumeAfterSettings.png") });

  const unlockPause = await page.evaluate(() => {
    window.Taierzhuang.Debug.DropPointerLock();
    return {
      menu: window.Taierzhuang.Debug.Menu(),
      running: window.Taierzhuang.state.running,
    };
  });
  Check("浏览器吞掉 Esc、只解除指针锁时也会暂停",
    unlockPause.menu.open && unlockPause.menu.mode === "pause" && !unlockPause.running,
    JSON.stringify(unlockPause));
  await page.evaluate(() => window.Taierzhuang.Debug.MenuAct("resume"));

  await page.evaluate(() => {
    window.Taierzhuang.Debug.Pause();
    window.Taierzhuang.Debug.MenuAct("title");
  });
  await page.evaluate(() => window.Taierzhuang.StepFrames(30));
  const back = await page.evaluate(() => window.Taierzhuang.Debug.Menu());
  Check("从暂停能回主菜单，并且换成当前切片的机位",
    back.open && back.live && back.slice === 2 && back.shotCount >= 2,
    `slice=${back.slice} shot=${back.shot}`);
}

// ===========================================================================
// 5b) 齿轮设置 -> 返回主菜单
// ===========================================================================
{
  await page.evaluate(() => window.Taierzhuang.Debug.MenuPlay(2));
  await page.waitForFunction(() => window.Taierzhuang.state.running === true, null, { timeout: 180000 });
  await page.keyboard.press("Backquote");
  const option = await page.evaluate(() => ({
    panelOpen: window.Taierzhuang.Debug.Editor().panelOpen,
    text: document.querySelector('[data-action="main-menu"]')?.textContent || "",
  }));
  Check("设置菜单里有返回主菜单选项",
    option.panelOpen && option.text.trim() === "返回主菜单", JSON.stringify(option));

  await page.click('[data-action="main-menu"]');
  await page.evaluate(() => window.Taierzhuang.StepFrames(30));
  const returned = await page.evaluate(() => ({
    menu: window.Taierzhuang.Debug.Menu(),
    editor: window.Taierzhuang.Debug.Editor(),
    running: window.Taierzhuang.state.running,
    inMenu: window.Taierzhuang.state.menu,
    hudHidden: document.getElementById("hud").style.display === "none",
  }));
  Check("设置菜单能直接回到主菜单",
    returned.menu.open && returned.menu.live && returned.inMenu && !returned.running
      && !returned.editor.capturing && returned.hudHidden,
    `open=${returned.menu.open} running=${returned.running} editor=${returned.editor.capturing}`);
}

// ===========================================================================
// 6) 进度：通过一关之后，菜单的第一项变成「继续」，选章里标「已通过」
// ===========================================================================
{
  await page.evaluate(() => {
    localStorage.setItem("tengxian1938_progress_v2",
      JSON.stringify({ cleared: ["CH0_Chuchuan", "CH1_NanLu"], furthest: 2 }));
  });
  await Boot();
  const m = await page.evaluate(() => {
    window.Taierzhuang.Debug.MenuShow("levels");
    return {
      first: document.querySelector("#menu .mnItem .mnItemLabel").textContent,
      marks: [...document.querySelectorAll("#menu .mnLevel .mnLvMark")].map((e) => e.textContent),
      selected: window.Taierzhuang.Debug.Menu().selected,
      progress: window.Taierzhuang.Debug.Menu().progress,
    };
  });
  Check("有进度时第一项是「继续」", m.first.startsWith("继续"), m.first);
  Check("打过的两章标「已通过」，下一章标「下一关」",
    m.marks[0] === "已通过" && m.marks[1] === "已通过" && m.marks[2] === "下一关",
    m.marks.join("|"));
  Check("选章默认落在下一关上", m.selected === 2, `selected=${m.selected}`);
  await page.evaluate(() => window.Taierzhuang.Debug.ResetProgress());
}

// ===========================================================================
// 7) ?menu=0 与 ?shot=1 两条旁路照旧（三个老冒烟都靠它们）
// ===========================================================================
{
  await page.goto(Url("&menu=0&phase=0"), { waitUntil: "load", timeout: 120000 });
  await page.waitForFunction(() => window.Taierzhuang !== undefined, null, { timeout: 240000 });
  const bypass = await page.evaluate(() => ({
    menu: !!window.Taierzhuang.menu,
    inMenu: window.Taierzhuang.state.menu,
    bootVisible: !document.getElementById("boot").classList.contains("gone"),
    startEnabled: !document.getElementById("bootStart").disabled,
  }));
  Check("?menu=0 不建菜单，「进 城」照旧",
    !bypass.menu && !bypass.inMenu && bypass.bootVisible && bypass.startEnabled,
    JSON.stringify(bypass));
  await page.click("#bootStart");
  await page.waitForTimeout(300);
  const started = await page.evaluate(() => window.Taierzhuang.state.running);
  Check("?menu=0 下点「进 城」能进游戏", started);
}

// ===========================================================================
// 7.5) 选章末尾那条沙盒：靶场
//
// 靶场不在 PHASES 里，进出都是**重载页面**（PHASE_TABLE 在 ?range=1 下整表替换）。
// 所以这一节要验的是三段：简报（不画那张滕县全图）、进得去（真到了靶场）、
// 退得出（暂停里那条「退出靶场」把 range 摘掉、回到主菜单）。
// ===========================================================================
{
  await Boot();
  const brief = await page.evaluate(() => {
    window.Taierzhuang.Debug.MenuShow("levels");
    const menu = window.Taierzhuang.menu;
    const rangeIndex = menu.entries.findIndex((entry) => entry.id === "Range"
      || entry.sandboxKey === "range");
    menu.SelectLevel(rangeIndex);
    return {
      selected: window.Taierzhuang.Debug.Menu().selected,
      title: document.querySelector("#menu .mnBriefTitle")?.textContent || "",
      mark: document.querySelector("#menu .mnSandboxLevel.on .mnLvMark")?.textContent || "",
      no: document.querySelector("#menu .mnSandboxLevel.on .mnLvNo")?.textContent || "",
      sandboxes: [...document.querySelectorAll("#menu .mnSandboxLevel")].map((entry) => ({
        no: entry.querySelector(".mnLvNo")?.textContent || "",
        name: entry.querySelector(".mnLvName")?.textContent || "",
        mark: entry.querySelector(".mnLvMark")?.textContent || "",
      })),
      map: !!document.querySelector("#menu .mnMap"),
      objectives: document.querySelectorAll("#menu .mnObjectives li").length,
      go: document.querySelector("#menu .mnGo")?.textContent || "",
    };
  });
  Check("靶场条目排在七章之后，标「沙盒」",
    brief.selected === 7 && brief.mark === "沙盒" && brief.no === "靶",   // 七章 0..6，沙盒是第 7 条
    `selected=${brief.selected} mark=${brief.mark} no=${brief.no}`);
  Check("选章列出玩法靶场、白刃 QTE 与第一关策划白盒",
    brief.sandboxes.length === 3
      && brief.sandboxes.map((entry) => entry.no).join(",") === "靶,刃,白"
      && brief.sandboxes.every((entry) => entry.mark === "沙盒")
      && brief.sandboxes[1].name.includes("白刃战 QTE")
      && brief.sandboxes[2].name.includes("第一关 · 全新策划白盒")
      && brief.sandboxes.every((entry) => !entry.name.includes("界河")),
    JSON.stringify(brief.sandboxes));
  Check("靶场简报有标题、工位清单与进入按钮，且**不画**那张滕县全图",
    brief.title === "玩法测试靶场" && brief.objectives >= 3
      && brief.go.includes("玩法测试靶场") && !brief.map,
    `${brief.title} / 工位 ${brief.objectives} / ${brief.go} / map=${brief.map}`);
  await page.screenshot({ path: path.join(outDir, "Menu_Levels_Range.png") });

  // 点「进入」——这一下是整页重载，等新页面把 Debug.Range 挂出来
  await page.click("#menu .mnGo");
  await page.waitForFunction(() => window.Taierzhuang?.Debug?.Range !== undefined,
    null, { timeout: 240000 });
  const entered = await page.evaluate(() => ({
    range: new URL(location.href).searchParams.get("range"),
    level: window.Taierzhuang.Debug.Level().id,
    stations: window.Taierzhuang.Debug.Range.State().stations.length,
    menu: !!window.Taierzhuang.menu,
    menuOpen: window.Taierzhuang.Debug.Menu().open,
    rootOff: document.getElementById("menu").classList.contains("off"),
    bootStart: !document.getElementById("bootStart").disabled,
  }));
  Check("从选章进得去靶场（?range=1，场上是靶场那一关）",
    entered.range === "1" && entered.level === "Range" && entered.stations === 3,
    `range=${entered.range} level=${entered.level} stations=${entered.stations}`);
  Check("靶场里菜单只建不开（开机不许一屏标题盖在场地上）",
    entered.menu && !entered.menuOpen && entered.rootOff && entered.bootStart,
    JSON.stringify(entered));

  // 进游戏，再按 Esc 看暂停菜单换没换成沙盒那一套
  await page.click("#bootStart");
  await page.waitForTimeout(400);
  const paused = await page.evaluate(() => {
    window.Taierzhuang.Debug.Pause();
    return {
      items: window.Taierzhuang.Debug.Menu().items,
      labels: [...document.querySelectorAll("#menu .mnItemLabel")].map((e) => e.textContent),
    };
  });
  Check("靶场的暂停菜单是「继续/设置/调试选项/退出靶场」（不给当场换不了的选章与主菜单）",
    paused.items.join(",") === "resume,settings,debug,exitSandbox"
      && paused.labels.includes("退出靶场"),
    paused.items.join(" / "));

  await page.evaluate(() => window.Taierzhuang.Debug.MenuAct("exitSandbox"));
  await page.waitForFunction(
    () => window.Taierzhuang?.Debug?.Menu !== undefined
      && window.Taierzhuang.Debug.Range === undefined,
    null, { timeout: 240000 });
  await page.evaluate(() => window.Taierzhuang.StepFrames(20));
  const back = await page.evaluate(() => ({
    range: new URL(location.href).searchParams.get("range"),
    open: window.Taierzhuang.Debug.Menu().open,
    mode: window.Taierzhuang.Debug.Menu().mode,
    level: window.Taierzhuang.Debug.Level().id,
  }));
  Check("「退出靶场」摘掉 range，回到主菜单",
    back.range === null && back.open && back.mode === "title" && back.level !== "Range",
    `range=${back.range} mode=${back.mode} level=${back.level}`);
}

// ===========================================================================
// 8) 七章的菜单机位各出一张图（--shots）
// ===========================================================================
if (withShots) {
  for (let phase = 0; phase < 7; phase += 1) {
    await Boot(`&phase=${phase}`);
    const info = await page.evaluate(() => window.Taierzhuang.Debug.Menu());
    for (let k = 0; k < info.shotCount; k += 1) {
      await page.evaluate((i) => {
        const menu = window.Taierzhuang.menu;
        menu.shotIndex = i;
        menu.shotTime = 0;
        menu.ApplyShot(0.45);
        window.Taierzhuang.StepFrames(90);
      }, k);
      await page.waitForTimeout(300);
      const id = await page.evaluate(() => window.Taierzhuang.Debug.Menu().shot);
      await page.screenshot({ path: path.join(outDir, `Menu_P${phase}_${id}.png`) });
      console.log(`     图：Menu_P${phase}_${id}.png`);
    }
  }
}

if (problems.length) {
  console.log("\n控制台/页面报错：");
  for (const p of problems.slice(0, 8)) console.log("   " + p);
  failed += problems.length;
}

await browser.close();
server.close();
console.log(failed ? `\n主菜单冒烟：${failed} 条失败` : "\n主菜单冒烟：全绿");
process.exit(failed ? 1 : 0);
