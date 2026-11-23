// 白刃实验场（?melee=1）的浏览器验收（2026-11-23，同日第二轮按用户改过）：
//   · 场景只有一个对手，用遭遇编辑器那套日军人物（日兵甲，X Bot 换皮）；侧光白天，人和方块的影子落在画面里；
//   · 面板是 .shellImpactLab 那一套、只留「玩法 / 项目 / 操作 / 读数」，玩法两组按钮真点得动、切了立即重开；
//   · 卡刀：真实左键贴近砍进身体 → 双方 lodged、屏幕上一个 F 圈、第一人称刀定格 → 真实长按 F 拔出 → 对方踉跄 → 再按 F 补刀；
//     站远了刀尖擦过只是一道口子、不卡；
//   · 拖拽挥砍：真实按住左键 → 拖刀架势、视角按面板滑条的比例跟一部分（真拖滑条 50% / 100% 对比）；鼠标一甩
//     （Debug.Look，同 mousemove 进来的那条链）就顺着甩的方向砍；与卡刀组合也走得通；整程无页面报错。
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
  const enemy = s.targets.find((t) => t.side === "ija");
  return { variant: s.variant, player: s.player && { state: s.player.state, phase: s.player.phase, roll: s.player.swingRoll || 0, mirror: s.player.swingMirror || 0,
    direction: s.player.direction, aim: s.player.aimOffset || null, lodge: s.player.lodge || null },
    stats: s.stats, lodge: s.lodge, finishTarget: s.finishTarget, hud: s.hud && { kind: s.hud.kind }, prompt: Taierzhuang.hud.CinematicPromptState(), targets: s.targets.length, viewFollow: s.viewFollow,
    enemy: enemy && { health: enemy.health, alive: enemy.alive, distance: enemy.distance, state: enemy.pose?.state || null },
    yaw: Taierzhuang.player.yaw };
});
async function Shot(name) {
  if (!SHOTS) return;
  await Step(1, true);
  const full = path.join(shotDir, `${name}_full.png`), small = path.join(shotDir, `${name}.png`);
  await page.screenshot({ path: full });
  execFileSync("python", ["-c", `from PIL import Image;im=Image.open(r'${full}');im.thumbnail((640,640));im.save(r'${small}')`]);
  fs.rmSync(full);
}
async function Setup(scenario, distance = 1.35) {
  await page.getByLabel("独立战斗项目").selectOption(scenario);
  await page.getByRole("button", { name: "开始／重开", exact: true }).click();
  await page.evaluate((distance) => {
    const T = Taierzhuang, L = T.Debug.MeleeCombat;
    L.Pause(true);
    const enemy = L.State().targets.find((t) => t.side === "ija");
    T.player.Spawn(enemy.x, enemy.z + distance, 0);
    T.StepFrames(20, 1 / 60, false);
  }, distance);
  await page.mouse.move(800, 400);
}
async function Click(times = 1, gap = 10) {
  for (let i = 0; i < times; i++) { await page.mouse.down(); await page.mouse.up(); await Step(gap); }
}
/** 按着左键时一帧一帧喂鼠标位移（lookY 向下为正），每帧推一帧。 */
async function Flick(dx, dy, frames = 3) {
  await page.evaluate(([dx, dy, frames]) => { for (let i = 0; i < frames; i++) { Taierzhuang.Debug.Look(dx, dy); Taierzhuang.StepFrames(1, 1 / 60, false); } }, [dx, dy, frames]);
}
try {
  await page.route(/^https:\/\/fonts\.(googleapis|gstatic)\.com\//, (route) => route.abort("blockedbyclient"));
  await page.addInitScript(() => localStorage.setItem("tengxian1938_debug_options_v1", JSON.stringify({ invincible: true })));
  await page.goto(`http://127.0.0.1:${server.address().port}/Taierzhuang1938/?shot=1&manual=1&melee=1&quality=medium&scale=small`, { waitUntil: "load", timeout: 120000 });
  await page.waitForFunction(() => window.Taierzhuang?.state?.ready && window.Taierzhuang?.state?.running && window.Taierzhuang?.Debug?.MeleeCombat, null, { timeout: 120000 });
  await page.waitForFunction(() => { Taierzhuang.StepFrames(1, 1 / 60, false); return Taierzhuang.Debug.MeleeCombat.Skins().every((s) => s.skinned); }, null, { timeout: 120000, polling: 250 });
  await Step(30);
  await page.mouse.move(800, 400);
  const scene = await page.evaluate(() => {
    const T = Taierzhuang, root = document.querySelector(".meleeLab");
    return { level: T.Debug.Level().id, sky: T.sky.presetName, ambient: T.lights.ambient.intensity, soldiers: T.ai.soldiers.length, skins: T.Debug.MeleeCombat.Skins(),
      scenarios: [...root.querySelectorAll(".mlScenario option")].map((o) => o.value), shell: root.classList.contains("shellImpactLab"),
      groups: [...root.querySelectorAll("h3")].map((h) => h.textContent), details: root.querySelectorAll("details").length,
      variants: [...root.querySelectorAll(".mlControl,.mlImpact")].map((b) => [b.textContent, b.classList.contains("active")]) };
  });
  assert.equal(scene.soldiers, 1, "the lab holds exactly one opponent");
  assert.deepEqual(scene.skins.map((s) => s.kit), ["ijaJia"], "the opponent wears the encounter editor's Japanese soldier");
  assert.equal(scene.sky, "meleeLabDay"); assert(scene.ambient < 0.7, "fill light is lowered so shadows read");
  assert(scene.shell, "melee panel uses the shared .shellImpactLab look");
  assert.deepEqual(scene.groups, ["玩法", "项目", "操作", "读数"], "only the basic layout is left"); assert.equal(scene.details, 0);
  assert(!scene.scenarios.includes("EncounterField") && !scene.scenarios.includes("DadaoTwo") && !scene.scenarios.includes("AlliedDadao"), "panel lists one-on-one items only");
  console.log("PASS scene", JSON.stringify(scene));
  await Shot("01_Scene");

  // ── 卡刀 → 拔刀 → 踉跄 → 补刀（原版操控）─────────────────────────────────
  await page.getByRole("button", { name: "卡刀 · 拔刀 · 补刀", exact: true }).click();
  assert.deepEqual((await State()).variant, { control: "classic", impact: "lodge" });
  await Setup("DadaoOne", 1.55);
  await page.mouse.down(); await Step(4); await page.mouse.up();
  for (let i = 0; i < 40 && (await State()).enemy.health === 100; i++) await Step(1);
  let s = await State();
  assert.equal(s.enemy.health, 48, "a tip cut still wounds"); assert.notEqual(s.player.state, "lodged", "a tip graze does not lodge"); assert.equal(s.stats.shallowCuts, 1);
  console.log("PASS shallow cut", JSON.stringify(s.enemy));
  await Setup("DadaoOne", 1.3);
  await page.mouse.down(); await Step(4); await page.mouse.up();
  for (let i = 0; i < 40 && (await State()).player?.state !== "lodged"; i++) await Step(1);
  s = await State();
  assert.equal(s.player.state, "lodged", "a close cut into the body lodges the blade");
  assert.equal(s.enemy.state, "lodged"); assert.equal(s.enemy.health, 48); assert.equal(s.hud, null, "no QTE card");
  assert.equal(s.prompt?.key, "F", "one on-screen ring with F");
  console.log("PASS lodge", JSON.stringify({ enemy: s.enemy, prompt: s.prompt }));
  await Step(8); await Shot("02_Lodged");
  await page.keyboard.down("f"); await Step(24); s = await State();
  assert(s.prompt.progress > 0.35 && s.player.state === "lodged", "holding F fills the ring"); await Shot("02b_HoldF");
  for (let i = 0; i < 20 && (await State()).player.state === "lodged"; i++) await Step(4);
  await page.keyboard.up("f");
  s = await State(); assert.equal(s.stats.yanks, 1, "the blade comes out"); assert.equal(s.enemy.state, "reel", "he staggers"); assert.equal(s.prompt, null);
  await Step(2); await Shot("03_Yank");
  for (let i = 0; i < 30 && (await State()).player.state !== "idle"; i++) await Step(1);
  await Step(20); await Shot("04_Reel");
  s = await State(); assert(s.finishTarget, "F finisher offered while he reels");
  await page.keyboard.press("f");
  for (let i = 0; i < 60 && (await State()).enemy.alive; i++) await Step(1);
  s = await State(); assert(!s.enemy.alive, "F finisher kills him"); assert.equal(s.stats.finishes, 1);
  console.log("PASS finish", JSON.stringify(s.stats));
  await Step(6); await Shot("05_Finished");

  // ── 拖拽挥砍（原版命中）────────────────────────────────────────────────
  await page.getByRole("button", { name: "原版 · 砍中即退", exact: true }).click();
  await page.getByRole("button", { name: "拖拽挥砍", exact: true }).click();
  assert.deepEqual((await State()).variant, { control: "drag", impact: "classic" });
  const follow = {};
  for (const percent of ["100", "50"]) {
    await page.locator(".mlFollow").fill(percent);
    assert.equal((await State()).viewFollow, percent / 100, "slider sets the view follow");
    await Setup("DadaoOne", 1.6); await page.mouse.down();
    const yaw0 = (await State()).yaw; await Flick(5, 0, 6); follow[percent] = Math.abs((await State()).yaw - yaw0);
    await page.mouse.up(); await Step(30);
  }
  assert(follow["50"] > 0 && Math.abs(follow["50"] / follow["100"] - 0.5) < 0.05, `view follows half as far at 50% (${JSON.stringify(follow)})`);
  console.log("PASS view follow", JSON.stringify(follow));
  const cuts = {};
  for (const [name, dx, dy, expect] of [["Left", -40, 6, "right"], ["Right", 40, -6, "left"], ["Down", 4, 40, "up"], ["UpRight", 30, -30, "downLeft"]]) {
    await Setup("DadaoOne", 1.6);
    await page.mouse.down();
    const yaw0 = (await State()).yaw;
    await Flick(dx * 0.12, dy * 0.12, 6);
    s = await State();
    assert.equal(s.player.state, "aim", "holding left button raises the drag guard"); assert(Math.abs(s.yaw - yaw0) > 1e-4, "the view follows the blade partly");
    await Shot(`06_Aim_${name}`);
    await Flick(dx, dy, 3);
    s = await State(); assert.equal(s.player.direction, expect, `flick ${name} cuts from ${expect}`); assert(!(await page.locator(".mlDirRing").count()), "no direction wheel");
    cuts[name] = [s.player.direction, +s.player.roll.toFixed(2), +s.player.mirror.toFixed(2)];
    await Step(4); await Shot(`07_Cut_${name}`);
    await page.mouse.up();
    for (let i = 0; i < 60 && (await State()).player.phase !== "idle"; i++) await Step(1);
  }
  console.log("PASS drag", JSON.stringify(cuts));

  // ── 拖拽挥砍 × 卡刀 ────────────────────────────────────────────────────
  await page.getByRole("button", { name: "卡刀 · 拔刀 · 补刀", exact: true }).click();
  await Setup("DadaoOne", 1.3);
  await page.mouse.down(); await Flick(-40, 6, 3); await page.mouse.up();
  for (let i = 0; i < 40 && (await State()).player.state !== "lodged"; i++) await Step(1);
  s = await State(); assert.equal(s.player.state, "lodged"); assert(s.player.roll < -0.3, "lodged pose keeps the side-swing roll");
  await Step(6); await Shot("08_DragLodged");
  await page.keyboard.down("f"); for (let i = 0; i < 30 && (await State()).player.state === "lodged"; i++) await Step(6); await page.keyboard.up("f");
  s = await State(); assert.equal(s.enemy.state, "reel", "holding F pulls the blade");
  for (let i = 0; i < 30 && (await State()).player.state !== "idle"; i++) await Step(1);
  await page.keyboard.press("f");
  for (let i = 0; i < 60 && (await State()).enemy.alive; i++) await Step(1);
  assert(!(await State()).enemy.alive);
  console.log("PASS drag+lodge");
  assert.deepEqual(errors, []);
  console.log("PASS no page errors");
} catch (error) { console.error("page errors:", errors.slice(0, 5)); throw error;
} finally {
  await browser.close(); server.close();
}
