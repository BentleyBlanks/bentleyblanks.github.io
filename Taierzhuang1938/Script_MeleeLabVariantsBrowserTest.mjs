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
    direction: s.player.direction, aim: s.player.aimOffset || null, lodge: s.player.lodge || null, cleave: s.player.cleave || null, slide: s.player.slide || null },
    stats: s.stats, lodge: s.lodge, cleave: s.cleave, slide: s.slide, enemyGuard: s.enemyGuard, finishTarget: s.finishTarget,
    hud: s.hud && { kind: s.hud.kind }, prompt: Taierzhuang.hud.CinematicPromptState(), targets: s.targets.length, viewFollow: s.viewFollow,
    enemy: enemy && { health: enemy.health, alive: enemy.alive, distance: enemy.distance, state: enemy.pose?.state || null, x: enemy.x, z: enemy.z },
    yaw: Taierzhuang.player.yaw };
});
async function Shot(name) {
  if (!SHOTS) return;
  await Step(1, true);
  const raw = await page.screenshot();
  const dataUrl = await page.evaluate(async (b64) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const scale = Math.min(1, 640 / Math.max(img.width, img.height));
    const c = document.createElement("canvas");
    c.width = Math.round(img.width * scale);
    c.height = Math.round(img.height * scale);
    c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL("image/png");
  }, raw.toString("base64"));
  fs.writeFileSync(path.join(shotDir, `${name}.png`), Buffer.from(dataUrl.split(",")[1], "base64"));
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
  // 刀锁在对方身上那一点：转头看别处，刀在世界里的位置不动。
  const BladePoint = () => page.evaluate(() => {
    const T = Taierzhuang, vm = T.viewmodel; T.scene.updateMatrixWorld(true); T.camera.updateMatrixWorld(true);
    const p = vm.rig.group.localToWorld(vm.rig.muzzle.clone().multiplyScalar(0.95)), a = T.meleeCombat.Pose(T.meleeCombat.Fighter(T.player)).lodge.anchor;
    const c = T.camera.getWorldPosition(p.clone()), d1 = p.clone().sub(c).normalize(), d2 = new p.constructor(a.x, a.y, a.z).sub(c).normalize();
    return { p: p.toArray(), anchor: [a.x, a.y, a.z], yaw: T.player.yaw, aim: d1.angleTo(d2) };
  });
  const lock0 = await BladePoint();
  await page.evaluate(() => { for (let i = 0; i < 12; i++) { Taierzhuang.Debug.Look(28, -6); Taierzhuang.StepFrames(1, 1 / 60, false); } Taierzhuang.StepFrames(30, 1 / 60, false); });
  const lock1 = await BladePoint(), Gap = (a, b) => Math.hypot(...a.map((v, i) => v - b[i]));
  assert(Math.abs(lock1.yaw - lock0.yaw) > 0.2, "the view turns freely while the blade is stuck");
  assert(Gap(lock0.p, lock1.p) < 0.06, `the blade stays put in the world (${Gap(lock0.p, lock1.p).toFixed(3)} m)`);
  assert(lock0.aim < 0.12 && lock1.aim < 0.12, `the blade tip sits on the shoulder point (${lock0.aim.toFixed(3)} / ${lock1.aim.toFixed(3)} rad)`);
  assert.equal((await State()).player.state, "lodged");
  console.log("PASS lodge lock", JSON.stringify({ moved: Gap(lock0.p, lock1.p), aim: lock0.aim, turned: lock1.yaw - lock0.yaw }));
  await Shot("02a_LookAway");
  await page.evaluate(() => { for (let i = 0; i < 12; i++) { Taierzhuang.Debug.Look(-28, 6); Taierzhuang.StepFrames(1, 1 / 60, false); } });
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

  // 近身推架撤了：贴身按 F 什么也不推。
  await page.getByRole("button", { name: "原版 · 砍中即退", exact: true }).click();
  await Setup("DadaoOne", 0.8); await page.keyboard.press("f"); await Step(20);
  assert.equal((await State()).stats.pushes, 0, "F no longer pushes"); console.log("PASS no push");
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
  // 连点左键：每一下都出刀（点一下 = 一刀，砍的中途再点排进缓冲），不会卡住。
  await Setup("DadaoOne", 4);
  for (let i = 0; i < 14; i++) { await page.mouse.down(); await Step(2); await page.mouse.up(); await Step(6); }
  for (let i = 0; i < 90 && (await State()).player.phase !== "idle"; i++) await Step(1);
  s = await State(); assert(s.stats.drags >= 3, `spam clicking keeps cutting (${s.stats.drags} cuts)`); assert.equal(s.player.phase, "idle");
  await page.mouse.down(); await Step(2); await page.mouse.up(); assert.equal((await State()).player.state, "attack", "still cuts after the spam");
  console.log("PASS click spam", s.stats.drags); await Step(60);

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

  // ── 玩法一：吃肉顿刀 · 拖刃拉豁（cleave）──────────────────────────────────
  await page.getByRole("button", { name: "原版 · 按住蓄力", exact: true }).click();
  await page.getByRole("button", { name: "吃肉顿刀 · 拖刃拉豁", exact: true }).click();
  assert.deepEqual((await State()).variant, { control: "classic", impact: "cleave" });
  await Setup("DadaoOne", 1.3);
  const cleaveX0 = (await State()).enemy.x;
  await page.mouse.down(); await Step(4); await page.mouse.up();
  for (let i = 0; i < 40 && (await State()).player?.state !== "cleave"; i++) await Step(1);
  s = await State();
  assert.equal(s.player.state, "cleave", "blade bites into flesh with drag resistance");
  assert.equal(s.enemy.state, "cleaved", "enemy torso is coupled to the biting blade");
  assert.equal(s.prompt?.key, "拉豁", "crimson rip-through prompt ring shown");
  await Step(4); await Shot("09_CleaveBite");
  // 验证加宽后的拖刃拉豁窗口：等待 0.45 s 后仍处于咬合态且可轻甩触发拉豁
  await Step(27);
  assert.equal((await State()).player.state, "cleave", "cleave window stays generously open for comfortable rip");
  await Flick(-20, 10, 2);
  for (let i = 0; i < 20 && (await State()).enemy.alive; i++) await Step(1);
  s = await State();
  assert.equal(s.stats.rips, 1, "mouse pull rips the blade through");
  assert(!s.enemy.alive, "rip-through trauma finishes the enemy");
  assert(Math.abs(s.enemy.x - cleaveX0) > 0.2, "enemy body is wrenched sideways along the blade exit tangent");
  await Step(4); await Shot("10_CleaveRip");
  console.log("PASS cleave+rip", JSON.stringify({ rips: s.stats.rips, dx: +(s.enemy.x - cleaveX0).toFixed(2) }));

  // ── 玩法二：磕枪顺刃 · 压杆劈杀（slide）───────────────────────────────────
  await page.getByRole("button", { name: "磕枪顺刃 · 压杆劈杀", exact: true }).click();
  assert.deepEqual((await State()).variant, { control: "classic", impact: "slide" });
  await Setup("DadaoOne", 1.62);
  await page.mouse.click(800, 400, { button: "right" });
  await Step(2);
  s = await State();
  assert.equal(s.player.state, "sliding", "right-click locks dadao onto the bayonet barrel");
  assert.equal(s.enemy.state, "sliding");
  assert.equal(s.prompt?.key, "W", "prompt asks for W to grind down the barrel");
  await Shot("11_SlideLock");
  await page.keyboard.down("w");
  for (let i = 0; i < 30 && !(await State()).slide?.ready; i++) await Step(1);
  await page.keyboard.up("w");
  s = await State();
  assert(s.slide?.ready, "holding W grinds past the strike threshold");
  assert.equal(s.prompt?.key, "左键", "prompt switches to LMB strike when ready");
  await Shot("11b_SlideReady");
  await page.mouse.down(); await page.mouse.up();
  for (let i = 0; i < 25 && (await State()).enemy.alive; i++) await Step(1);
  s = await State();
  assert.equal(s.stats.slideSlashes, 1, "LMB unleashes barrel-slide throat slash");
  assert(!s.enemy.alive);
  await Step(4); await Shot("12_SlideSlash");
  console.log("PASS slide+slash", JSON.stringify(s.stats));

  // ── 玩法三：横枪硬接 · 震断破防（crush）───────────────────────────────────
  await page.getByRole("button", { name: "横枪硬接 · 震断破防", exact: true }).click();
  assert.deepEqual((await State()).variant, { control: "classic", impact: "crush" });
  await Setup("DadaoOne", 1.35);
  await page.mouse.down(); await Step(4); await page.mouse.up();
  for (let i = 0; i < 40 && (await State()).stats.guardBlocks < 1; i++) await Step(1);
  s = await State();
  assert.equal(s.stats.guardBlocks, 1, "frontal slash clashes against rifle guard");
  assert.equal(s.enemy.health, 100, "rifle guard absorbs flesh damage");
  assert(s.enemyGuard?.guardPoise < 100, "guard poise reduced");
  await Shot("13_GuardClashSparks");
  for (let i = 0; i < 45 && (await State()).player.state !== "idle"; i++) await Step(1);
  // 贴近重劈震断护枪架势 → F 抢步处决
  await page.evaluate(() => {
    const T = Taierzhuang, enemy = T.Debug.MeleeCombat.State().targets.find((t) => t.side === "ija");
    T.player.Spawn(enemy.x, enemy.z + 1.35, 0);
  });
  await page.mouse.down(); await Step(26); await page.mouse.up();
  for (let i = 0; i < 45 && (await State()).stats.guardCrushes < 1; i++) await Step(1);
  s = await State();
  assert.equal(s.stats.guardCrushes, 1, "heavy chop shatters the rifle guard");
  assert.equal(s.enemy.state, "crushed");
  assert.equal(s.prompt?.key, "F", "crimson F execution ring appears");
  await Shot("14_GuardCrushed");
  await page.keyboard.press("f");
  for (let i = 0; i < 60 && (await State()).enemy.alive; i++) await Step(1);
  s = await State();
  assert(!s.enemy.alive, "F executes the guard-crushed soldier");
  assert.equal(s.stats.crushFinishes, 1);
  console.log("PASS crush+finish", JSON.stringify(s.stats));

  // ── 破锋全开 × 拖拽挥砍（pofeng + drag）──────────────────────────────────
  await page.getByRole("button", { name: "拖拽挥砍", exact: true }).click();
  await page.getByRole("button", { name: "破锋全开 · 三合一", exact: true }).click();
  assert.deepEqual((await State()).variant, { control: "drag", impact: "pofeng" });
  await Setup("DadaoOne", 1.35);
  await page.mouse.down(); await Flick(-42, 8, 3); await page.mouse.up();
  for (let i = 0; i < 40 && (await State()).stats.guardBlocks < 1; i++) await Step(1);
  assert.equal((await State()).stats.guardBlocks, 1, "pofeng blocks frontal drag cut");
  for (let i = 0; i < 45 && (await State()).player.state !== "idle"; i++) await Step(1);
  // 侧翼绕防直接吃肉顿刀 → 甩鼠拉豁
  await page.evaluate(() => {
    const T = Taierzhuang, enemy = T.Debug.MeleeCombat.State().targets.find((t) => t.side === "ija");
    T.player.Spawn(enemy.x + 1.25, enemy.z, Math.PI / 2);
    T.StepFrames(4, 1 / 60, false);
  });
  await page.mouse.down(); await Flick(4, 42, 3);
  for (let i = 0; i < 40 && (await State()).player.state !== "cleave"; i++) await Step(1);
  await Step(5); await Flick(-34, 14, 2); await page.mouse.up();
  for (let i = 0; i < 30 && (await State()).enemy.alive; i++) await Step(1);
  s = await State();
  assert(!s.enemy.alive && s.stats.rips === 1, "pofeng flank cleave + rip kills cleanly");
  await Step(4); await Shot("15_PofengCombined");
  console.log("PASS pofeng+drag", JSON.stringify(s.stats));

  // ── 暂停敌军后，点「开始／重开」与切玩法保持暂停；恢复后再重开保持未暂停 ──
  await page.evaluate(() => Taierzhuang.Debug.MeleeCombat.Pause(true));
  await page.getByRole("button", { name: "开始／重开", exact: true }).click();
  await Step(4);
  const pausedRestart = await page.evaluate(() => ({
    paused: Taierzhuang.Debug.MeleeCombat.State().paused,
    passive: Taierzhuang.ai.soldiers.every((e) => e.meleeTraining?.passive === true),
    btn: document.querySelector(".meleeLab .mlPause")?.textContent,
  }));
  assert.equal(pausedRestart.paused, true, "restarting keeps enemy paused");
  assert.equal(pausedRestart.passive, true, "restarted enemy remains passive when paused");
  await page.getByRole("button", { name: "原版 · 砍中即退", exact: true }).click();
  await Step(4);
  assert.equal(await page.evaluate(() => Taierzhuang.Debug.MeleeCombat.State().paused), true, "switching variant keeps enemy paused");
  await page.evaluate(() => Taierzhuang.Debug.MeleeCombat.Pause(false));
  await page.getByRole("button", { name: "开始／重开", exact: true }).click();
  await Step(4);
  const activeRestart = await page.evaluate(() => ({
    paused: Taierzhuang.Debug.MeleeCombat.State().paused,
    passive: Taierzhuang.ai.soldiers.every((e) => e.meleeTraining?.passive === false),
  }));
  assert.equal(activeRestart.paused, false, "restarting keeps enemy active when unpaused");
  assert.equal(activeRestart.passive, true, "restarted enemy remains active when unpaused");
  console.log("PASS pause preserved across restart", JSON.stringify({ pausedRestart, activeRestart }));

  // ── 未进游戏／暂停菜单时隐藏实验场 UI；敌军倒地后自动原地复活 ──
  const uiHiddenWhilePaused = await page.evaluate(() => {
    const T = Taierzhuang, prev = T.state.running;
    T.state.running = false;
    T.StepFrames(2, 1 / 60, false);
    const hidden = document.querySelector(".meleeLab")?.hidden && document.querySelector(".mlGuideHud")?.hidden;
    T.state.running = prev;
    T.StepFrames(2, 1 / 60, false);
    const shown = !document.querySelector(".meleeLab")?.hidden && !document.querySelector(".mlGuideHud")?.hidden;
    return { hidden, shown };
  });
  assert.deepEqual(uiHiddenWhilePaused, { hidden: true, shown: true }, "melee lab UI hides before game starts / while menu paused");
  await Setup("DadaoOne", 1.25);
  await page.evaluate(() => {
    const T = Taierzhuang, foe = T.ai.soldiers.find((e) => e.side === "ija");
    foe.TakeHit(200, "torso", null, { kind: "blade" });
    T.StepFrames(10, 1 / 60, false);
  });
  const downState = await page.evaluate(() => ({
    alive: Taierzhuang.ai.soldiers[0].alive,
    respawnIn: Taierzhuang.Debug.MeleeCombat.State().respawnIn,
    playerX: +Taierzhuang.player.position.x.toFixed(2),
    playerZ: +Taierzhuang.player.position.z.toFixed(2),
  }));
  assert.equal(downState.alive, false, "enemy is down after lethal hit");
  assert(downState.respawnIn > 1.5 && downState.respawnIn <= 2.6, `auto-respawn countdown active (${downState.respawnIn})`);
  await Step(180);
  const revived = await page.evaluate(() => ({
    alive: Taierzhuang.ai.soldiers[0].alive,
    health: Taierzhuang.ai.soldiers[0].health,
    paused: Taierzhuang.Debug.MeleeCombat.State().paused,
    passive: Taierzhuang.ai.soldiers[0].meleeTraining?.passive,
    playerX: +Taierzhuang.player.position.x.toFixed(2),
    playerZ: +Taierzhuang.player.position.z.toFixed(2),
  }));
  assert.equal(revived.alive, true, "fallen enemy auto-revives after delay");
  assert.equal(revived.health, 100, "auto-revived enemy restores full health");
  assert.equal(revived.paused, true, "auto-revive preserves paused state");
  assert.equal(revived.passive, true, "auto-revived enemy stays passive while paused");
  assert.equal(revived.playerX, downState.playerX, "auto-revive does not teleport player");
  assert.equal(revived.playerZ, downState.playerZ, "auto-revive does not teleport player");
  console.log("PASS ui gate + auto-respawn", JSON.stringify({ uiHiddenWhilePaused, downState, revived }));

  assert.deepEqual(errors, []);
  console.log("PASS no page errors");
} catch (error) { console.error("page errors:", errors.slice(0, 5)); throw error;
} finally {
  await browser.close(); server.close();
}
