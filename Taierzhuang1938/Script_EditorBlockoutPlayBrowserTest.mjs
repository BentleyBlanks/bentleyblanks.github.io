// ===========================================================================
// Script_EditorBlockoutPlayBrowserTest.mjs —— 白盒编辑器「试玩」（§17，2026-10-31）的浏览器闸门
//
// 跑法：node Taierzhuang1938/Script_EditorBlockoutPlayBrowserTest.mjs
// 口径：docs/Data_EditorBlockout.md §17。关卡 FirstLevel0105（Blockout/FirstLevel0105.play.json）。
//
//   0. node：试玩键 K 不在游戏键位表里、不是编辑器已有的键；
//   1. 面板：卡片右上「试玩」按钮打开设置面板，段落预设来自试玩编排，起点 = 当前帧、终点 = 预设的终点；
//   2. 开打：玩家不再无敌、子弹有数（宿主读 PlayOverrides）；02-4 的三个追兵是真 AI、站在沟底（不被放兵挤到沟沿上）、
//      演员里不再有他们；顶部那条写着第几步 / 目标 / 敌几个；
//   3. 打光 → 过关 → 下一步先走到站位（approach），到了才放兵；fresh 步同一批人重新放；
//   4. 中止 → 小结：放出来的兵（含 fresh 步留下的尸体）全撤、无敌与无限子弹还回去、演员回来；K 再来一遍；Esc 回到编辑（换回白盒场景）；
//   2b. 试玩跑正式场景（2026-11-01，docs/Data_Scene.md §8）：开打时场地是 Scenes/FirstLevel（formal），编辑时是白盒；
//   5. 阵亡：玩家倒下 → 小结写「阵亡」、玩家原地换回活人并摆回那一步的机位（不被宿主送回关卡出生点）；
//   6. 看戏步：播过场（预演）时 N 跳过就进下一步；
//   7. 全程没有未捕获错误。截图存 _shots/EditorBlockoutPlay/（不提交）。
// ===========================================================================

import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { LaunchBrowser } from "../PrairieFire1937/Script_BrowserTestKit.mjs";
import { ServeRoot } from "./Script_DevServer.mjs";
import { KEYMAP } from "./Script_Input.mjs";
import { BLOCKOUT_FLY } from "./Script_EditorBlockout.mjs";
import { PREVIZ_KEY } from "./Script_EditorBlockoutPreviz.mjs";
import { PLAY_KEY } from "./Script_EditorBlockoutPlay.mjs";

const projectDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(projectDir, "..");
const shotDir = path.join(projectDir, "_shots", "EditorBlockoutPlay");
await fs.mkdir(shotDir, { recursive: true });

const results = [];
function Check(name, ok, detail = "") {
  results.push({ name, ok: !!ok, detail });
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? "  — " + detail : ""}`);
}
const J = (v) => JSON.stringify(v);
const LEVEL = "FirstLevel0105";

console.log("--- node checks");
{
  const bound = new Set(KEYMAP.map(row => row.code));
  const editorKeys = ["KeyN", "KeyP", "KeyY", "KeyM", "KeyO", "Period", "Comma", "Escape", "Backquote", "NumpadDecimal"];
  Check("试玩键 K 不在游戏键位表里，也不是编辑器已有的键", !bound.has(PLAY_KEY) && !editorKeys.includes(PLAY_KEY) && PLAY_KEY !== PREVIZ_KEY && PLAY_KEY !== BLOCKOUT_FLY.toggleKey, PLAY_KEY);
}

const server = await ServeRoot(rootDir, 0);
const port = server.address().port;
const browser = await LaunchBrowser();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on("pageerror", (error) => errors.push(`PAGEERROR ${String(error).slice(0, 300)}`));
page.on("console", (message) => {
  if (message.type() !== "error") return;
  const url = message.location()?.url || "";
  if (/fonts\.(googleapis|gstatic)\.com/.test(url)) return;
  if (/__blockout/.test(url) || /__blockout/.test(message.text())) return;
  if (/\/Animation\/Previz\w+\/Data_Previz\w+Animation\.json/.test(url) && /404/.test(message.text())) return;
  errors.push(`CONSOLE ${message.text().slice(0, 240)} @ ${url}`);
});
const B = (fn, arg) => page.evaluate(fn, arg);
const Step = (n = 2) => B((n) => window.Tengxian.StepFrames(n, 1 / 60, false), n);
const PlayState = () => B(() => window.Tengxian.Debug.Blockout.Play.State());
/** 场上放出来的兵：位置、离地多高（站人的地面 = 高度场）、活没活。 */
const Soldiers = () => B(() => {
  const game = window.Tengxian.editor.editorHost.game, bf = game.battlefield;
  const ground = (x, z) => (bf.BaseGroundHeight ? bf.BaseGroundHeight(x, z) : bf.GroundHeight(x, z));
  return game.ai.soldiers.filter(s => s.blockoutPlayId).map(s => ({ id: s.blockoutPlayId, alive: !!s.alive, x: s.position.x, y: s.position.y, z: s.position.z, ground: ground(s.position.x, s.position.z), state: s.state, order: s.order }));
});
const KillAll = () => B(() => {
  const game = window.Tengxian.editor.editorHost.game;
  for (const s of game.ai.soldiers) if (s.blockoutPlayId && s.alive) { s.health = 0; s.Kill(game.player.position.clone().sub(s.position).normalize().negate()); }
});
const Rules = () => B(() => {
  const game = window.Tengxian.editor.editorHost.game;
  return { invincible: !!game.player.debug?.invincible, infiniteAmmo: !!game.PlayerRuntime().infiniteAmmo, ai: game.ai.soldiers.length, alive: game.player.alive,
    x: game.player.position.x, z: game.player.position.z, playClass: document.body.classList.contains("blockoutPlay") };
});

try {
  console.log("--- boot");
  await page.goto(`http://127.0.0.1:${port}/Taierzhuang1938/?editor=blockout&level=${LEVEL}&kf=02-4&scale=small&audio=0`,
    { waitUntil: "load", timeout: 180000 });
  await page.waitForFunction(() => window.Tengxian?.state?.ready && window.Tengxian?.Debug?.Blockout?.State().ready, null, { timeout: 300000 });
  await Step(4);
  const p0 = await PlayState();
  const r0 = await Rules();
  const asked0 = await B(() => performance.getEntriesByType("resource").filter(e => /\.play\.json/.test(e.name)).length);
  Check("进关不读试玩编排（大多数关卡没有这份文件，404 会进控制台）；编辑状态下照旧无敌、无限子弹", !p0.present && asked0 === 0 && r0.invincible && r0.infiniteAmmo, J({ present: p0.present, asked0, r0 }));

  // 1) 面板
  console.log("--- panel");
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => !document.querySelector(".boRoot").classList.contains("inert"), null, { timeout: 5000 }).catch(() => {});
  await page.click(".boPlayBtn");
  await page.waitForFunction(() => window.Tengxian.Debug.Blockout.Play.State().present, null, { timeout: 15000 }).catch(() => {});
  await Step(1);
  const p0b = await PlayState();
  Check("打开面板才读这一关的试玩编排，校验通过", p0b.present && p0b.valid, J({ present: p0b.present, valid: p0b.valid }));
  const panel = await B(() => {
    const el = document.querySelector(".boPlayPanel");
    return { shown: !el.hidden, presets: [...el.querySelectorAll(".boPlayPreset")].map(b => b.textContent), from: el.querySelectorAll(".boPlaySelect")[0]?.value,
      to: el.querySelectorAll(".boPlaySelect")[1]?.value, hint: el.querySelector(".boPlayHint")?.textContent, toggles: [...el.querySelectorAll(".boPlayToggle")].map(b => [b.textContent, b.classList.contains("on")]) };
  });
  Check("面板：段落预设来自编排（含「02 拖人回身打三次」「03 守机枪坑」）+「从这一帧打到底」，起点是当前帧",
    panel.shown && panel.presets.includes("02 拖人回身打三次") && panel.presets.includes("03 守机枪坑") && panel.presets.at(-1) === "从这一帧打到底" && panel.from === "02-4",
    J(panel));
  Check("面板：三个开关缺省取编排 defaults（无敌关、无限子弹关、播过场开），段落提示写出几步、打几步", J(panel.toggles) === J([["无敌", false], ["无限子弹", false], ["播过场", true]]) && /步/.test(panel.hint || ""), J(panel.toggles) + " " + panel.hint);
  await page.screenshot({ path: path.join(shotDir, "Play_Panel.png") });
  await page.keyboard.press("Escape");
  await Step(1);
  Check("Esc 关面板", await B(() => document.querySelector(".boPlayPanel").hidden));

  // 2) 开打（02-4 → 02-6，过场关掉）
  console.log("--- fight");
  await B(() => window.Tengxian.Debug.Blockout.Play.Start({ from: "02-4", to: "02-6", settings: { invincible: false, infiniteAmmo: false, previz: false } }));
  await Step(90);
  const r1 = await Rules();
  Check("开打：玩家不再无敌、子弹有数；页面标上 blockoutPlay", !r1.invincible && !r1.infiniteAmmo && r1.playClass, J(r1));
  const scene1 = await B(() => window.Tengxian.Debug.Blockout.Play.Scene());
  Check("试玩跑正式场景：开打前先整片重建成 Scenes/FirstLevel（formal）", scene1.variant === "play" && scene1.style === "formal" && String(scene1.url).includes("Scenes/FirstLevel/"), J(scene1));
  const s1 = await Soldiers();
  const p1 = await PlayState();
  const puppets1 = await B(() => window.Tengxian.Debug.Blockout.Units().map(u => u.id));
  Check("02-4：三个追兵是真 AI、在打（不是 idle）", s1.length === 3 && s1.every(s => s.alive) && p1.run?.step === "02-4" && p1.run?.phase === "engage" && s1.some(s => s.state !== "idle"), J(s1.map(s => [s.id, s.state])));
  Check("追兵站在沟底：离地 < 0.4 m 且比沟沿（y≈0）低 1.5 m 以上（没被放兵挤到沟沿上）", s1.every(s => s.y - s.ground < 0.4 && s.y < -1.5), J(s1.map(s => [s.id, +s.y.toFixed(2), +s.ground.toFixed(2)])));
  Check("变成 AI 的人不再摆演员", !puppets1.some(id => /^Pursuer/.test(id)), puppets1.join(","));
  const hud1 = await B(() => ({ shown: !document.querySelector(".boPlayHud").hidden, text: document.querySelector(".boPlayHud").innerText.replace(/\n/g, " | ") }));
  Check("顶部那条：第几步 / 站位名 / 目标 / 敌几个", hud1.shown && /1\/3/.test(hud1.text) && /箱垛/.test(hud1.text) && /敌 3 \/ 3/.test(hud1.text), hud1.text);
  await page.screenshot({ path: path.join(shotDir, "Play_Fight.png") });

  // 3) 打光 → 过关 → 下一步 approach → 到了才放兵（fresh）
  await KillAll();
  await Step(30);
  const p2 = await PlayState();
  await Step(80);
  const p3 = await PlayState();
  Check("打光：这一步记「打退」，过一会儿进 02-5，先走过去（approach，还没放兵）",
    p2.run?.log?.[0]?.result === "kill" && p3.run?.step === "02-5" && p3.run?.phase === "approach" && p3.run?.stepSpawned === 0, J({ p2: p2.run?.phase, log: p2.run?.log, p3: [p3.run?.step, p3.run?.phase] }));
  const hud3 = await B(() => document.querySelector(".boPlayHud").innerText.replace(/\n/g, " | "));
  Check("approach 时顶部写「去：站位名 距离」", /去：.*\d+ m/.test(hud3), hud3);
  const kf25 = await B(() => window.Tengxian.Debug.Blockout.Config().keyframes.find(k => k.id === "02-5").player);
  await B((p) => window.Tengxian.Debug.Blockout.PlacePlayer(p), kf25);
  await Step(20);
  const p4 = await PlayState();
  const s4 = await Soldiers();
  Check("走到 02-5 站位：放兵（fresh：02-4 打死的同一批人重新放），也在沟底", p4.run?.phase === "engage" && p4.run?.stepSpawned === 3
    && s4.filter(s => s.alive).length === 3 && s4.filter(s => s.alive).every(s => s.y < -1.5), J({ phase: p4.run?.phase, alive: s4.filter(s => s.alive).map(s => [s.id, +s.y.toFixed(2)]) }));

  // 4) 中止 → 小结
  console.log("--- summary");
  await page.keyboard.press("Escape");
  await page.keyboard.press(PLAY_KEY);
  await Step(2);
  const p5 = await PlayState();
  const r5 = await Rules();
  Check("K 中止：出小结（中止），放出来的兵和 fresh 步留下的尸体全撤", !p5.active && p5.summary?.result === "abort" && r5.ai === 0, J({ summary: p5.summary?.result, ai: r5.ai }));
  Check("收场：无敌与无限子弹还回去，页面去掉 blockoutPlay", r5.invincible && r5.infiniteAmmo && !r5.playClass, J(r5));
  const sum = await B(() => document.querySelector(".boPlaySummary").innerText.replace(/\n/g, " | "));
  Check("小结写出用时 / 打死 / 每一步", /中止/.test(sum) && /打死/.test(sum) && /弹药箱垛后头第一次回身打/.test(sum) && /打退/.test(sum), sum);
  await page.screenshot({ path: path.join(shotDir, "Play_Summary.png") });
  await page.keyboard.press(PLAY_KEY);
  await Step(10);
  const p6 = await PlayState();
  Check("小结里按 K：再来一遍（同一段、同样的开关）", p6.active && p6.run?.indices?.length === 3 && p6.run?.settings?.previz === false, J({ active: p6.active, indices: p6.run?.indices }));
  await B(() => window.Tengxian.Debug.Blockout.Play.Stop());
  await Step(2);
  await page.keyboard.press("Escape");
  // 回到编辑要整片重建回白盒场景（正式 → 白盒），等它换完
  await page.waitForFunction(() => { const sc = window.Tengxian.Debug.Blockout.Play.Scene(); return sc.variant === "edit" && sc.style === "whitebox"
    && window.Tengxian.Debug.Blockout.Units().some(u => u.id === "Pursuer1"); }, null, { timeout: 180000 }).catch(() => {});
  await Step(4);
  const p7 = await PlayState();
  const puppets7 = await B(() => window.Tengxian.Debug.Blockout.Units().map(u => u.id));
  const st7 = await B(() => window.Tengxian.Debug.Blockout.State());
  const scene7 = await B(() => window.Tengxian.Debug.Blockout.Play.Scene());
  Check("Esc 回到编辑：换回白盒场景、小结收起、演员回来（含追兵）、导航栏能用", scene7.variant === "edit" && scene7.style === "whitebox" && !p7.summary && puppets7.includes("Pursuer1") && !st7.play,
    J({ scene: scene7.variant, summary: !!p7.summary, kf: st7.id }));

  // 5) 阵亡
  console.log("--- death");
  await B(() => window.Tengxian.Debug.Blockout.Play.Start({ from: "02-4", to: "02-6", settings: { invincible: false, previz: false } }));
  await Step(20);
  await B(() => window.Tengxian.editor.editorHost.game.player.Kill());
  await Step(60 * 4);
  const p8 = await PlayState();
  const r8 = await Rules();
  const kf24 = await B(() => window.Tengxian.Debug.Blockout.Config().keyframes.find(k => k.id === "02-4").player);
  Check("玩家倒下：几秒后出小结「阵亡」，记在 02-4", !p8.active && p8.summary?.result === "dead" && p8.summary.log.at(-1)?.id === "02-4" && p8.summary.log.at(-1)?.result === "dead", J(p8.summary));
  Check("阵亡后玩家换回活人、摆回 02-4 的机位（不是关卡出生点），兵全撤",
    r8.alive && Math.hypot(r8.x - kf24.x, r8.z - kf24.z) < 1.2 && r8.ai === 0, J({ r8, kf24 }));
  await Step(60 * 4);
  const r9 = await Rules();
  Check("宿主的换人计时没有晚到再把人送走", Math.hypot(r9.x - kf24.x, r9.z - kf24.z) < 1.2, J(r9));
  await B(() => window.Tengxian.Debug.Blockout.Play.Close());

  // 6) 看戏步：播预演，N 跳过就进下一步
  console.log("--- watch");
  await B(() => window.Tengxian.Debug.Blockout.Play.Start({ from: "02-3", to: "02-4", settings: { invincible: true, previz: true } }));
  await page.waitForFunction(() => window.Tengxian.Debug.Blockout.State().previz, null, { timeout: 30000 }).catch(() => {});
  await Step(10);
  const p10 = await PlayState();
  Check("02-3 是看戏步：在播过场", p10.run?.step === "02-3" && p10.run?.phase === "previz" && (await B(() => window.Tengxian.Debug.Blockout.State().previz)), J(p10.run));
  await page.keyboard.press(PREVIZ_KEY);
  await Step(10);
  await page.waitForFunction(() => window.Tengxian.Debug.Blockout.Play.State().run?.step === "02-4", null, { timeout: 5000 }).catch(() => {});
  await Step(20);
  const p11 = await PlayState();
  Check("N 跳过过场：记「看完」，进 02-4 开打", p11.run?.step === "02-4" && p11.run?.log?.[0]?.result === "previz" && p11.run?.phase === "engage", J({ step: p11.run?.step, phase: p11.run?.phase, log: p11.run?.log }));
  await B(() => window.Tengxian.Debug.Blockout.Play.Stop());
  await B(() => window.Tengxian.Debug.Blockout.Play.Close());
  await Step(2);
  Check("收尾：场上没有残留的兵", (await Rules()).ai === 0);

  Check("全程没有未捕获错误", errors.length === 0, errors.slice(0, 5).join(" | "));
} finally {
  await browser.close();
  server.close();
}

const failed = results.filter(r => !r.ok);
console.log(`EditorBlockoutPlayBrowserTest: ${results.length - failed.length}/${results.length} passed`);
assert.equal(failed.length, 0, failed.map(r => r.name).join("; "));
