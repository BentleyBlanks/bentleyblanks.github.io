// 白刃实验场（?melee=1）玩法变体的浏览器验收（2026-11-23）：
//   · 面板是 .shellImpactLab 那一套，玩法两组按钮真点得动、切了立即重开项目；
//   · 卡刀：真实左键砍进活人 → 双方 lodged、底部卡换成拔刀进度、第一人称刀定格 → 真实连按左键拔出 → 对方踉跄 → 真实 F 补刀致死；
//   · 方向挥砍：真实左键出刀，八向指示在，竖劈 / 横扫 / 倒放的来向在第一人称里滚转（pose.swingRoll 进了 actionPivot）；
//   · 方向挥砍 × 卡刀 组合也走得通；整程无页面报错。
// 出图（--shots）：长边 640 px，写到忽略目录 tmp/DadaoLab/shots。浏览器静音（BrowserTestKit 自带 --mute-audio）。
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { LaunchBrowser } from "../PrairieFire1937/Script_BrowserTestKit.mjs";
import { ServeRoot } from "./Script_DevServer.mjs";

const project = path.dirname(fileURLToPath(import.meta.url));
const SHOTS = process.argv.includes("--shots");
const shotDir = path.resolve(project, "../tmp/DadaoLab/shots");
if (SHOTS) fs.mkdirSync(shotDir, { recursive: true });
const server = await ServeRoot(path.resolve(project, ".."), 0);
const browser = await LaunchBrowser();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => { if (m.type() === "error" && !/fonts|ERR_BLOCKED_BY_CLIENT/.test(m.text())) errors.push(m.text()); });
const Step = (n = 1, render = false) => page.evaluate(([n, render]) => Taierzhuang.StepFrames(n, 1 / 60, render), [n, render]);
const State = () => page.evaluate(() => {
  const s = Taierzhuang.Debug.MeleeCombat.State();
  return { variant: s.variant, player: s.player && { state: s.player.state, phase: s.player.phase, roll: s.player.swingRoll || 0, mirror: s.player.swingMirror || 0, direction: s.player.direction, kind: s.player.attackKind, lodge: s.player.lodge || null },
    stats: s.stats, lodge: s.lodge, finishTarget: s.finishTarget, hud: s.hud && { kind: s.hud.kind, label: s.hud.label },
    enemy: s.targets.find((t) => t.side === "ija") && (({ health, alive, distance, pose }) => ({ health, alive, distance, state: pose?.state || null }))(s.targets.find((t) => t.side === "ija")),
    ring: !document.querySelector(".mlDirRing")?.hidden, swingPreview: s.swingPreview };
});
async function Shot(name) {
  if (!SHOTS) return;
  await Step(1, true);
  const full = path.join(shotDir, `${name}_full.png`), small = path.join(shotDir, `${name}.png`);
  await page.screenshot({ path: full });
  execFileSync("python", ["-c", `from PIL import Image;im=Image.open(r'${full}');im.thumbnail((640,640));im.save(r'${small}')`]);
  fs.rmSync(full);
}
async function Setup(scenario) {
  await page.getByLabel("独立战斗项目").selectOption(scenario);
  await page.getByRole("button", { name: "开始／重开", exact: true }).click();
  await page.evaluate(() => {
    const T = Taierzhuang, L = T.Debug.MeleeCombat;
    L.Pause(true);
    const enemy = L.State().targets.find((t) => t.side === "ija");
    T.player.Spawn(enemy.x, enemy.z + 1.35, 0);
    T.StepFrames(20, 1 / 60, false);
  });
  await page.mouse.move(800, 400);
}
async function Click(times = 1, gap = 10) {
  for (let i = 0; i < times; i++) { await page.mouse.down(); await page.mouse.up(); await Step(gap); }
}
try {
  await page.route(/^https:\/\/fonts\.(googleapis|gstatic)\.com\//, (route) => route.abort("blockedbyclient"));
  await page.addInitScript(() => localStorage.setItem("tengxian1938_debug_options_v1", JSON.stringify({ invincible: true })));
  await page.goto(`http://127.0.0.1:${server.address().port}/Taierzhuang1938/?shot=1&manual=1&melee=1&quality=medium&scale=small`, { waitUntil: "load", timeout: 120000 });
  await page.waitForFunction(() => window.Taierzhuang?.state?.ready && window.Taierzhuang?.state?.running && window.Taierzhuang?.Debug?.MeleeCombat, null, { timeout: 120000 });
  await page.evaluate(() => Taierzhuang.Debug.MeleeCombat.Pause(true));
  await Step(30);
  await page.mouse.move(800, 400);
  const panel = await page.evaluate(() => {
    const root = document.querySelector(".meleeLab");
    return { shell: root.classList.contains("shellImpactLab"), groups: [...root.querySelectorAll("h3")].map((h) => h.textContent),
      variants: [...root.querySelectorAll(".mlControl,.mlImpact")].map((b) => [b.textContent, b.classList.contains("active")]) };
  });
  assert(panel.shell, "melee panel uses the shared .shellImpactLab look");
  assert.deepEqual(panel.groups.slice(0, 4), ["玩法", "项目", "操作", "读数"]);
  assert.equal(panel.variants.filter(([, on]) => on).length, 2, "one control and one impact option are active");
  console.log("PASS panel", JSON.stringify(panel.variants));
  await Shot("01_Panel");

  // ── 卡刀 → 拔刀 → 踉跄 → 补刀（原版操控）─────────────────────────────────
  await page.getByRole("button", { name: "卡刀 · 拔刀 · 补刀", exact: true }).click();
  assert.deepEqual((await State()).variant, { control: "classic", impact: "lodge" });
  await Setup("DadaoOne");
  await page.mouse.down(); await Step(4); await page.mouse.up();
  for (let i = 0; i < 40 && (await State()).player?.state !== "lodged"; i++) await Step(1);
  let s = await State();
  if (s.player?.state !== "lodged") console.log(JSON.stringify({ s, events: await page.evaluate(() => Taierzhuang.Debug.MeleeCombat.State().events.slice(-8)) }));
  assert.equal(s.player.state, "lodged", "real left click into a living man lodges the blade");
  assert.equal(s.enemy.state, "lodged"); assert.equal(s.enemy.health, 48); assert.equal(s.hud?.kind, "lodge", "bottom card turns into the pull-out bar");
  console.log("PASS lodge", JSON.stringify({ enemy: s.enemy, hud: s.hud }));
  await Step(8); await Shot("02_Lodged");
  await Click(2, 8);
  s = await State(); assert(s.lodge?.progress > 0.3 && s.player.state === "lodged", `mashing fills the pull bar (${s.lodge?.progress})`);
  await Shot("03_Pulling");
  for (let i = 0; i < 8 && (await State()).player.state === "lodged"; i++) await Click(1, 8);
  s = await State(); assert.equal(s.stats.yanks, 1, "the blade comes out"); assert.equal(s.enemy.state, "reel", "he staggers");
  await Step(2); await Shot("04_Yank");
  for (let i = 0; i < 30 && (await State()).player.state !== "idle"; i++) await Step(1);
  await Step(20); await Shot("05_Reel");
  s = await State(); assert(s.finishTarget, "F finisher offered while he reels");
  const prompt = await page.evaluate(() => document.querySelector(".hudActions")?.textContent || "");
  console.log("PASS reel", JSON.stringify({ enemy: s.enemy, finishTarget: s.finishTarget, prompt }));
  await page.keyboard.press("f");
  for (let i = 0; i < 60 && (await State()).enemy.alive; i++) await Step(1);
  s = await State(); assert(!s.enemy.alive, "F finisher kills him"); assert.equal(s.stats.finishes, 1);
  console.log("PASS finish", JSON.stringify(s.stats));
  await Step(6); await Shot("06_Finished");

  // ── 方向挥砍（原版命中）：真实左键 + 取证口选来向 ─────────────────────────
  await page.getByRole("button", { name: "原版 · 砍中即退", exact: true }).click();
  await page.getByRole("button", { name: "方向挥砍 · Mordhau", exact: true }).click();
  assert.deepEqual((await State()).variant, { control: "directional", impact: "classic" });
  const rolls = {};
  for (const dir of ["upRight", "up", "right", "upLeft", "left", "downRight", "downLeft", "down"]) {
    await Setup("DadaoOne");
    await page.evaluate((dir) => Taierzhuang.Debug.MeleeCombat.Swing(dir), dir);
    await Step(13);
    s = await State();
    assert.equal(s.player.direction, dir); assert(s.ring, "eight-way ring is shown in directional mode");
    rolls[dir] = [+s.player.roll.toFixed(3), +s.player.mirror.toFixed(2)];
    await Shot(`07_Swing_${dir}`);
    if (SHOTS) { await Step(7); await Shot(`07_Swing_${dir}_Active`); }
    for (let i = 0; i < 60 && (await State()).player.phase !== "idle"; i++) await Step(1);
  }
  assert(rolls.up[0] > 0.5 && rolls.right[0] < -0.5 && rolls.left[1] > 0.9 && rolls.upLeft[1] > 0.9 && rolls.upRight[1] === 0, `swing roll per direction ${JSON.stringify(rolls)}`);
  // 真实左键（没甩鼠标＝默认右上斜劈）
  await Setup("DadaoOne");
  await page.mouse.down(); await page.mouse.up(); await Step(2);
  s = await State(); assert.equal(s.player.direction, "upRight", "a plain click swings the default upper-right chop at once");
  for (let i = 0; i < 40 && (await State()).enemy.health === 100; i++) await Step(1);
  assert.equal((await State()).enemy.health, 40);
  console.log("PASS directional", JSON.stringify(rolls));

  // ── 方向挥砍 × 卡刀 ────────────────────────────────────────────────────
  await page.getByRole("button", { name: "卡刀 · 拔刀 · 补刀", exact: true }).click();
  await Setup("DadaoOne");
  await page.evaluate(() => Taierzhuang.Debug.MeleeCombat.Swing("right"));
  for (let i = 0; i < 40 && (await State()).player.state !== "lodged"; i++) await Step(1);
  s = await State(); assert.equal(s.player.state, "lodged"); assert(s.player.roll < -0.3, "lodged pose keeps the side-swing roll");
  await Step(6); await Shot("08_DirectionalLodged");
  await page.keyboard.down("s"); for (let i = 0; i < 30 && (await State()).player.state === "lodged"; i++) await Step(6); await page.keyboard.up("s");
  s = await State(); assert.equal(s.enemy.state, "reel", "holding S also pulls the blade");
  for (let i = 0; i < 30 && (await State()).player.state !== "idle"; i++) await Step(1);
  await page.keyboard.press("f");
  for (let i = 0; i < 60 && (await State()).enemy.alive; i++) await Step(1);
  assert(!(await State()).enemy.alive);
  console.log("PASS directional+lodge");
  assert.deepEqual(errors, []);
  console.log("PASS no page errors");
} catch (error) { console.error("page errors:", errors.slice(0, 5)); throw error;
} finally {
  await browser.close(); server.close();
}
