// 《滕县 一九三八》主菜单冒烟：真浏览器把菜单跑起来，验运镜与选章这两条链路。
//
// 为什么单起一份而不是并进开机冒烟：开机冒烟一律走 ?shot=1（不建菜单），
// 通关冒烟走 ?menu=0（要点 #bootStart）—— 两份都刻意绕开了菜单，
// 于是菜单成了没有任何测试保护的裸奔区。这一份专治它。
//
// 用法：
//   node Taierzhuang1938/Script_MenuTest.mjs            冒烟（约两分钟）
//   node Taierzhuang1938/Script_MenuTest.mjs --shots    再把七关的菜单机位各出一张图
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

const Url = (query = "") => `http://127.0.0.1:${port}/Taierzhuang1938/?quality=medium&scale=small${query}`;

async function Boot(query = "") {
  await page.goto(Url(query), { waitUntil: "load", timeout: 120000 });
  await page.waitForFunction(() => window.Taierzhuang !== undefined, { timeout: 240000 });
  await page.waitForFunction(() => window.Taierzhuang.Debug.Menu !== undefined, { timeout: 60000 });
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
    };
  });
  Check("开机落在主菜单上", m.menu.open && m.inMenu && !m.running && !m.rootOff,
    `open=${m.menu.open} menu=${m.inMenu} running=${m.running}`);
  Check("菜单四项都在", m.items.length === 4, m.items.join(" / "));
  Check("菜单里 HUD 与手里的枪都藏起来了", m.hudHidden && !m.viewmodel,
    `hud=${m.hudHidden} viewmodel=${m.viewmodel}`);
  // 菜单里摆的是几个守军，**一个日军都不许有** ——
  // 有敌人就会开打，开打就死人，而兵员池是关卡状态（玩家还没按开始）
  Check("菜单场景里只有守军、没有日军", m.nra === 5 && m.ija === 0, `nra=${m.nra} ija=${m.ija}`);
  Check("菜单背后建的是城墙那一关（Data_Menu.MENU_SCENE.slice）", m.menu.slice === 4,
    `slice=${m.menu.slice}`);
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
  Check("城墙那一关配了三个机位", shots === 3, `shots=${shots}`);

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

  // 定时切机位：一个机位停 16 秒，推 17 秒必须换一条
  const first = await page.evaluate(() => window.Taierzhuang.Debug.Menu().shot);
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
// 3) 选章：七关、简报、那张全图
// ===========================================================================
{
  await page.evaluate(() => window.Taierzhuang.Debug.MenuShow("levels"));
  await page.waitForTimeout(150);
  const panel = await page.evaluate(() => ({
    levels: [...document.querySelectorAll("#menu .mnLevel")].length,
    map: !!document.querySelector("#menu .mnMap"),
    zones: document.querySelectorAll("#menu .mnMapZone").length,
    title: document.querySelector("#menu .mnBriefTitle")?.textContent || "",
    objectives: document.querySelectorAll("#menu .mnObjectives li").length,
    go: document.querySelector("#menu .mnGo")?.textContent || "",
  }));
  Check("选章列出七关", panel.levels === 7, `levels=${panel.levels}`);
  Check("简报里有全图，且标出了这一关的路标链", panel.map && panel.zones >= 3,
    `map=${panel.map} zones=${panel.zones}`);
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
  Check("换一关，简报与图上的切片框都跟着换", second.title.includes("东关"), second.title);
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
  const a = await page.evaluate(() => ({
    playing: !!window.Taierzhuang.cutscene?.Playing,
    id: window.Taierzhuang.state.cutscene,
    t: window.Taierzhuang.cutscene?.time || 0,
  }));
  await page.waitForTimeout(1200);
  const b = await page.evaluate(() => window.Taierzhuang.cutscene?.time || 0);
  Check("「开始」播关前过场", a.playing && a.id === "CS_Chuchuan", `id=${a.id} playing=${a.playing}`);
  Check("过场真的在往前走（不是卡在第一帧）", b > a.t + 0.5, `t ${a.t.toFixed(2)} -> ${b.toFixed(2)} s`);

  // Esc 跳过，别在冒烟里干等三十八秒
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => window.Taierzhuang.state.running === true, { timeout: 180000 })
    .catch(() => {});
  const done = await page.evaluate(() => ({
    running: window.Taierzhuang.state.running,
    level: window.Taierzhuang.Debug.Level().id,
    open: window.Taierzhuang.Debug.Menu().open,
  }));
  Check("跳过过场之后真的进了序 · 界河", done.running && done.level === "L0_Jiehe" && !done.open,
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
  await page.waitForFunction(() => window.Taierzhuang.state.running === true, { timeout: 180000 });
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
  Check("从选章能进关（二 · 东关）", inGame.running && inGame.level === "L2_Dongguan",
    `running=${inGame.running} level=${inGame.level} built=${inGame.built}`);
  Check("进关后菜单收起、HUD 与枪回来", inGame.menuOff && !inGame.hudHidden && inGame.viewmodel,
    `menuOff=${inGame.menuOff} hud=${!inGame.hudHidden} vm=${inGame.viewmodel}`);
  Check("进关后战场上有人", inGame.soldiers > 4, `soldiers=${inGame.soldiers}`);
  await page.screenshot({ path: path.join(outDir, "Menu_InGame.png") });
}

// ===========================================================================
// 5) Esc 暂停 -> 回主菜单 -> 再进一关
// ===========================================================================
{
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
  }));
  Check("设置里按 Esc 回到暂停菜单",
    !settingsClosed.editor.panelOpen && settingsClosed.menu.open && settingsClosed.menu.mode === "pause");

  await page.evaluate(() => window.Taierzhuang.Debug.MenuAct("resume"));
  const resumed = await page.evaluate(() => ({
    running: window.Taierzhuang.state.running, open: window.Taierzhuang.Debug.Menu().open,
  }));
  Check("暂停里的「继续」能回到游戏", resumed.running && !resumed.open, JSON.stringify(resumed));
  const audioBack = await page.evaluate(() => window.Taierzhuang.audio.paused);
  Check("继续之后背景音接回来", audioBack === false, `audio.paused=${audioBack}`);
  const hudBack = await page.evaluate(() => getComputedStyle(document.getElementById("hud")).display);
  Check("继续之后 HUD 回来", hudBack !== "none", `display=${hudBack}`);

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
  await page.waitForFunction(() => window.Taierzhuang.state.running === true, { timeout: 180000 });
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
    localStorage.setItem("tengxian1938_progress_v1",
      JSON.stringify({ cleared: ["L0_Jiehe", "L1_Beishahe"], furthest: 2 }));
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
  Check("打过的两关标「已通过」，下一关标「下一关」",
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
  await page.waitForFunction(() => window.Taierzhuang !== undefined, { timeout: 240000 });
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
// 8) 七关的菜单机位各出一张图（--shots）
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
