// 调试面板跳幕自检：八章每一幕都跳一遍，落点必须精确、过程不许抛错。
// 跳幕是白盒期最常用的工具，坏了会一路误导——所以它自己也要有测试。
// 运行：node TunnelLight1943/Script_DebugJumpTest.mjs
import path from "node:path";
import { fileURLToPath } from "node:url";
import { LaunchBrowser } from "../PrairieFire1937/Script_BrowserTestKit.mjs";
import { ServeRoot } from "./Script_DevServer.mjs";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const server = await ServeRoot(rootDir, 0);
const port = server.address().port;
const browser = await LaunchBrowser();
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e).slice(0, 300)));
page.on("console", (m) => {
  if (m.type() !== "error") return;
  // 外部字体源拉不下来不算页面事故（断网/代理环境必失败，字体有系统回退）
  if (/^https:\/\/fonts\.(googleapis|gstatic)\.com\//.test(m.location()?.url || "")) return;
  errors.push(m.text().slice(0, 200));
});

await page.goto(`http://127.0.0.1:${port}/TunnelLight1943/`, { waitUntil: "load", timeout: 60000 });
await page.waitForFunction(() => window.TunnelLight !== undefined, { timeout: 60000 });

// 面板：标题页也能开（还没开局就想直接跳到第五章看一眼，是最常见的用法）
await page.keyboard.press("`");
if (!(await page.isVisible("#debugPanel"))) { console.error("✗ ` 打不开调试面板"); process.exit(1); }
await page.click("#debugChapters button:nth-child(5)");
await page.click("#debugBeats li:nth-child(4) button");
await page.waitForTimeout(400);
const clicked = await page.evaluate(async () => {
  const core = await import("./Script_Core.mjs");
  const st = window.TunnelLight.state;
  return { ch: st.chapterIndex, beat: st.beatIndex, id: core.CurrentBeatDef(st)?.id, phase: st.phase };
});
if (clicked.ch !== 4 || clicked.beat !== 3 || clicked.phase !== "playing") {
  console.error("✗ 点击跳幕落点不对：", JSON.stringify(clicked));
  process.exit(1);
}
console.log(`✓ 面板点击跳幕：第五章第 4 幕 → ${clicked.id}`);

// 全遍历：每一幕都跳过去、再跑几帧，落点错或抛错都算失败
const bad = await page.evaluate(async () => {
  const core = await import("./Script_Core.mjs");
  const out = [];
  for (let c = 0; c < 8; c += 1) {
    const beats = core.ChapterBeatList(c);
    if (!beats.length) { out.push(`c${c + 1} 分幕清单为空`); continue; }
    for (let b = 0; b < beats.length; b += 1) {
      try {
        window.TunnelLight.JumpToBeat(c, b);
        window.TunnelLight.StepFrames(4, {});
        const st = window.TunnelLight.state;
        if (st.chapterIndex !== c || st.beatIndex !== b) {
          out.push(`c${c + 1}/${b + 1} 落点错 → ${st.chapterIndex + 1}/${st.beatIndex + 1}`);
        }
      } catch (e) { out.push(`c${c + 1}/${b + 1} 抛错：${e.message}`); }
    }
  }
  return out;
});

if (bad.length) {
  await browser.close(); server.close();
  console.error("✗ 跳幕失败：", bad.join(" | ")); process.exit(1);
}
console.log("✓ 八章全部分幕跳转落点正确");

// ---------------------------------------------------------------------------
// 存档：玩到一半 → 关掉页面 → 回来点「继续」，得回到同一幕
//
// 存档骑在跳幕上（`Core.DebugJump` 按脚本结算前序），所以它跟这个文件同住。
// 三件事各验一遍，缺哪件玩家都会丢进度：
// ① 换幕真的落盘（不落盘＝关了就没）；
// ② 幕**认 id 不认序号**（往章里插一拍，老档不许指到别人家去）；
// ③ 旗标合并回来（结算只跑得出脚本的默认分支，玩家自己选的在旗标里）。
// ---------------------------------------------------------------------------
const savePage = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await savePage.goto(`http://127.0.0.1:${port}/TunnelLight1943/`, { waitUntil: "load", timeout: 60000 });
await savePage.waitForFunction(() => window.TunnelLight !== undefined, { timeout: 60000 });
const saved = await savePage.evaluate(() => {
  window.TunnelLight.JumpToBeat(0, 6);
  window.TunnelLight.state.flags.route = "tunnel";   // "玩家自己做过的抉择"
  window.TunnelLight.Tick(2);                        // 换幕那一帧才写盘
  const raw = JSON.parse(localStorage.getItem("tunnelLight1943.save.v1") || "null");
  return { raw, beat: window.TunnelLight.state.beatIndex };
});
if (!saved.raw || saved.raw.chapter !== 0 || saved.raw.beat !== 6 || !saved.raw.beatId
  || saved.raw.flags?.route !== "tunnel") {
  await browser.close(); server.close();
  console.error("✗ 换幕没落盘或存档不全：", JSON.stringify(saved.raw));
  process.exit(1);
}
// 回来一趟：标题页上「继续」得出现，点下去回到同一幕、旗标还在
await savePage.reload({ waitUntil: "load", timeout: 60000 });
await savePage.waitForFunction(() => window.TunnelLight !== undefined, { timeout: 60000 });
const shownWhere = await savePage.textContent("#continueWhere");
if (await savePage.isHidden("#btnContinue")) {
  await browser.close(); server.close();
  console.error("✗ 有存档却不出「继续」"); process.exit(1);
}
await savePage.click("#btnContinue");
await savePage.waitForTimeout(300);
const back = await savePage.evaluate(() => {
  const st = window.TunnelLight.state;
  return { ch: st.chapterIndex, beat: st.beatIndex, route: st.flags.route, phase: st.phase,
    titleHidden: document.getElementById("titleScreen").hidden };
});
if (back.ch !== 0 || back.beat !== 6 || back.route !== "tunnel" || !back.titleHidden) {
  await browser.close(); server.close();
  console.error("✗ 继续没回到存档那一幕：", JSON.stringify(back)); process.exit(1);
}

// 暂停：设置面板 ＝ 游戏里的暂停菜单，开着的时候游戏钟必须真的停住。
// （车铃那一拍是全章唯一会失败的：不停的话，点开设置就等于站在伪军跟前发呆。）
const paused = await savePage.evaluate(() => {
  const tl = window.TunnelLight;
  document.getElementById("btnSettings").click();
  const t0 = tl.state.time;
  tl.Tick(20);
  const held = tl.state.time - t0;
  const dim = document.body.classList.contains("paused");
  document.getElementById("btnSettings").click();      // 收起来，游戏该走了
  tl.Tick(20);
  return { held, ran: tl.state.time - t0, dim };
});
await browser.close();
server.close();
if (paused.held > 0.0001 || paused.ran <= 0.0001 || !paused.dim) {
  console.error(`✗ 设置面板没把游戏停住：开着走了 ${paused.held.toFixed(3)}s`
    + `、收起来之后走了 ${paused.ran.toFixed(3)}s、压暗=${paused.dim}`);
  process.exit(1);
}
if (errors.length) { console.error("✗ 页面异常：", errors.slice(0, 5).join(" | ")); process.exit(1); }
console.log(`✓ 存档：换幕落盘 → 刷新 → 继续，回到 ${shownWhere.trim()}（旗标也带回来了）`);
console.log(`✓ 暂停：设置面板开着游戏钟不走（收起来又走了 ${paused.ran.toFixed(2)}s）`);
