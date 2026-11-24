// Real scene/input/physics acceptance for the refactored ExplosionRange:
//   · Uncluttered arena + left-side UI control panel (.explosionLab)
//   · Special pull-cord cookable wooden-handle grenade (TimedStickGrenade): Seedream textures,
//     pull-cord ignition, live first-person sparks/smoke/HUD ring, cold-vs-cooked airburst against
//     evading IJA squad, exact short-fuse bypass, and overcook hand detonation
//   · On-demand single tank pad, sandbag cover, barrage, Ki-30 airstrike, grenade return,
//     ordinary G/H grenades, Rapier/heightfield lattice parity, patrol crater traversal, and common terrain.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { LaunchBrowser } from "../PrairieFire1937/Script_BrowserTestKit.mjs";
import { ServeRoot } from "./Script_DevServer.mjs";
import { EXPLOSION_VEHICLES, EXPLOSION_BARRAGE, EXPLOSION_AIRSTRIKE } from "./Data_ExplosionRange.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(here, "_shots", "ExplosionRange");
fs.mkdirSync(out, { recursive: true });
const server = await ServeRoot(path.resolve(here, ".."), 0);
const browser = await LaunchBrowser();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [], result = {};
page.on("pageerror", (e) => { errors.push(String(e)); console.log("PAGE ERROR", String(e)); });
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });

try {
  await page.goto(`http://127.0.0.1:${server.address().port}/Taierzhuang1938/?explosions=1&shot=1&manual=1&quality=medium&scale=small`, { timeout: 120000 });
  await page.waitForFunction(() => window.Taierzhuang?.state.ready, null, { timeout: 180000 });
  console.log("SCENE ready");

  // 1) 干净重构开场：无堆叠战车/飞机，左侧控制面板在位，默认手持特制拉线木柄弹，前方 22 m 布置日军躲雷靶班
  result.boot = await page.evaluate(() => {
    const t = window.Taierzhuang;
    t.StepFrames(250);
    const panel = document.querySelector(".explosionLab");
    const rect = panel ? panel.getBoundingClientRect() : null;
    return {
      level: t.Debug.Level().id,
      pinned: t.state.pinned,
      snapshot: t.Debug.Explosions.State(),
      models: t.scene.children.filter((c) => c.name.startsWith("ExplosionVehicle_")).map((m) => ({ name: m.name, visible: m.visible, x: m.position.x, z: m.position.z })),
      ground: t.scene.children.filter((c) => c.userData.deformableTerrain).length,
      invincible: t.player.debug.invincible,
      panelVisible: !!panel && !panel.hidden && rect && rect.width > 200 && rect.height > 200 && rect.left < 60,
      panelGroups: panel ? panel.querySelectorAll("h3").length : 0,
    };
  });
  assert.equal(result.boot.level, "ExplosionRange");
  assert.equal(result.boot.models.length, EXPLOSION_VEHICLES.length, "vehicle models stay preloaded off-stage");
  assert.deepEqual(result.boot.snapshot.visibleVehicles, [], "clean boot hides all tanks until requested via panel");
  assert.deepEqual(result.boot.snapshot.visibleAircraft, [], "no uncalled aircraft in the test scene");
  assert.equal(result.boot.snapshot.patrolsEnabled, false, "crater patrols stay off until toggled on");
  assert.equal(result.boot.snapshot.enemyReport.spawned, 4, "4-man evading IJA target squad spawns at 22m");
  assert.equal(result.boot.snapshot.activeLoadout, "timed", "special pull-cord wooden-handle grenade equipped by default");
  assert.equal(result.boot.snapshot.timed.state, "ready");
  assert.ok(result.boot.snapshot.timed.kitAttached, "special pull-cord kit attached to viewmodel grenade");
  assert.ok(result.boot.snapshot.timed.texturesReady, "all 5 Seedream textures loaded cleanly");
  assert.ok(result.boot.panelVisible && result.boot.panelGroups >= 4, "left-side UI control panel visible with 4 groups");
  assert.ok(result.boot.pinned && result.boot.ground > 0);
  assert.ok(result.boot.invincible, "the explosion range forces the invincible debug option");

  result.warm = await page.evaluate(() => ({
    proxies: window.Taierzhuang.Debug.Explosions.State().terrain.warmProxies,
    inScene: window.Taierzhuang.scene.children.filter((c) => c.userData.terrainWarm).length,
    shadowed: window.Taierzhuang.Debug.Explosions.State().terrain.warmRetired?.shadowed,
  }));
  assert.deepEqual(result.warm, { proxies: 0, inScene: 0, shadowed: true },
    "crater warm-up proxies retire on a real shadow pass, not on the leak cap");

  await page.screenshot({ path: path.join(out, "Scene_Overview.png") });
  console.log("PASS clean refactored boot / left panel / Seedream textures / default timed stick grenade");

  // 2) 特制拉线温雷木柄手榴弹：拉线动画、第一人称火花/细烟/准星环、冷投触发敌军躲雷 vs 温雷控爆防止躲闪
  result.timedCold = await page.evaluate(() => {
    const t = window.Taierzhuang;
    t.Debug.Explosions.Reset();
    t.Debug.Explosions.GoTo("spawn");
    t.Debug.Explosions.SetEnemyMode("evadeHold");
    t.Debug.Explosions.SetEnemyDistance(22);
    t.Debug.Explosions.SpawnEnemies();
    t.Debug.Explosions.SelectLoadout("timed");
    t.Debug.Explosions.SetFuseDuration(4.2);
    t.player.yaw = 0;
    t.player.pitch = 0.08;
    t.StepFrames(6);
    // 真实按键 KeyT 按下并很快松开（刚拉火就投出 = 未温雷，留约 4 秒引信给日军反应）
    t.Debug.Key("KeyT", true);
    t.StepFrames(10);
    const duringPull = t.Debug.Explosions.State().timed;
    t.Debug.Key("KeyT", false);
    t.StepFrames(300);
    const after = t.Debug.Explosions.State();
    return { duringPull, after };
  });
  assert.equal(result.timedCold.duringPull.state, "pulling", "KeyT enters pulling state");
  assert.ok(result.timedCold.after.timed.throws >= 1, "cold pull-cord grenade actually launches");
  assert.ok(result.timedCold.after.timed.lastThrow && result.timedCold.after.timed.lastThrow.releaseFuseS > 3.2,
    `cold throw retains long fuse: ${JSON.stringify(result.timedCold.after.timed.lastThrow)}`);
  assert.ok(result.timedCold.after.enemyReport.evaded > 0,
    `cold throw gives evading IJA targets time to trigger grenade evade: ${JSON.stringify(result.timedCold.after.enemyReport)}`);
  console.log(`PASS cold throw triggers enemy evade (evaded=${result.timedCold.after.enemyReport.evaded}, releaseFuse=${result.timedCold.after.timed.lastThrow.releaseFuseS}s)`);

  // 2b) 温雷空爆（拉线截图 + 燃烧火花/烟雾/HUD 倒计时截图 + 空中起爆截杀敌军）
  result.timedPull = await page.evaluate(() => {
    const t = window.Taierzhuang;
    t.Debug.Explosions.Reset();
    t.Debug.Explosions.GoTo("spawn");
    t.Debug.Explosions.SpawnEnemies();
    t.Debug.Explosions.SelectLoadout("timed");
    t.Debug.Explosions.SetFuseDuration(4.2);
    t.player.yaw = 0;
    t.player.pitch = 0.16;
    t.StepFrames(8);
    // 按住 KeyT 拉线到中段（约 0.23s，双手拉火绳顶峰），截取拉火动作
    t.Debug.Key("KeyT", true);
    t.StepFrames(14); // ~0.23s (pullDurationS=0.34s, igniteAt=0.74)
    return t.Debug.Explosions.State().timed;
  });
  assert.equal(result.timedPull.state, "pulling");
  await page.screenshot({ path: path.join(out, "Scene_PullingCord.png") });

  result.timedCook = await page.evaluate(() => {
    const t = window.Taierzhuang;
    // 继续温雷：过发火点并再烧约 2.1s（保证有密集火花/细烟/准星倒计时环）
    t.StepFrames(140);
    // 已拉火状态按 1 切步枪应被拦截（不许把拉火的雷塞回兜里）
    t.Debug.Key("Digit1", true); t.Debug.Key("Digit1", false);
    t.StepFrames(2);
    const hudEl = document.querySelector(".timedFuseHud");
    return {
      state: t.Debug.Explosions.State().timed,
      hudVisible: !!hudEl && !hudEl.hidden && hudEl.classList.contains("isLit"),
      hudTime: hudEl?.querySelector(".tfTime")?.textContent || "",
      activeLoadout: t.Debug.Explosions.State().activeLoadout,
    };
  });
  assert.equal(result.timedCook.state.state, "cooking", "enters cooking state after cord ignition");
  assert.ok(result.timedCook.state.lit && result.timedCook.state.cookTimeS > 1.8, "fuse actively cooking in hand");
  assert.ok(result.timedCook.state.activeSparks > 0 && result.timedCook.state.activeSmoke > 0 && result.timedCook.state.fuseLightIntensity > 0,
    `live sparks/smoke/light active while cooking: ${JSON.stringify(result.timedCook.state)}`);
  assert.ok(result.timedCook.hudVisible && /\d+\.\ds/.test(result.timedCook.hudTime),
    `crosshair fuse countdown HUD visible: ${JSON.stringify(result.timedCook)}`);
  assert.equal(result.timedCook.activeLoadout, "timed", "Digit1 cannot pocket a live burning stick grenade");
  await page.screenshot({ path: path.join(out, "Scene_CookingSparks.png") });

  // 再多烧一点，使脱手剩余引信约 0.95s → 恰好在 22m 日军靶班头顶空爆，截断躲雷！
  result.timedAirburst = await page.evaluate(() => {
    const t = window.Taierzhuang;
    // 推到剩余引信约 1.15s 时松手（加上手部出手前摆 ~0.20s，离手剩 ~0.95s）
    for (let i = 0; i < 80; i += 1) {
      if (t.Debug.Explosions.State().timed.remainingFuseS <= 1.16) break;
      t.StepFrames(1);
    }
    t.Debug.Key("KeyT", false);
    // 推进到脱手并飞到敌群上空（约 0.80s 后截在途/空爆帧）
    t.StepFrames(58);
    const mid = t.Debug.Explosions.State();
    return { mid };
  });
  await page.screenshot({ path: path.join(out, "Scene_AirburstFlight.png") });

  result.timedAirburstAfter = await page.evaluate(() => {
    const t = window.Taierzhuang;
    t.StepFrames(100);
    return t.Debug.Explosions.State();
  });
  assert.ok(result.timedAirburstAfter.timed.lastThrow && result.timedAirburstAfter.timed.lastThrow.cookTimeS >= 2.5,
    `cooked throw logged long cook time: ${JSON.stringify(result.timedAirburstAfter.timed.lastThrow)}`);
  assert.ok(result.timedAirburstAfter.timed.lastThrow.releaseFuseS < 1.35,
    `cooked throw released with short fuse: ${JSON.stringify(result.timedAirburstAfter.timed.lastThrow)}`);
  assert.ok(result.timedAirburstAfter.timed.lastThrow.airburst && result.timedAirburstAfter.timed.airbursts >= 1,
    `cooked throw detonates in air above squad: ${JSON.stringify(result.timedAirburstAfter.timed.lastThrow)}`);
  assert.ok(result.timedAirburstAfter.enemyReport.killed >= 1,
    `cooked airburst catches evading enemies before they can scatter: ${JSON.stringify(result.timedAirburstAfter.enemyReport)}`);
  console.log(`PASS cooked airburst catches evading squad (cook=${result.timedAirburstAfter.timed.lastThrow.cookTimeS}s, height=${result.timedAirburstAfter.timed.lastThrow.detonateHeightM}m, killed=${result.timedAirburstAfter.enemyReport.killed}, evaded=${result.timedAirburstAfter.enemyReport.evaded})`);

  // 2c) 精确短引信（< 0.35s 通用下限）与捏超时在手里自爆
  result.timedShortAndOvercook = await page.evaluate(() => {
    const t = window.Taierzhuang;
    t.Debug.Explosions.Reset();
    t.Debug.Explosions.SelectLoadout("timed");
    t.Debug.Explosions.SetFuseDuration(3.0);
    t.Debug.Explosions.SetOvercookExplodes(true);
    t.player.pitch = 0.22;
    t.StepFrames(6);
    // Latch 拉线模式，温到剩 0.34s 时出手，验证脱手 exactFuse < 0.35s 立即空爆
    t.Debug.Explosions.BeginPull("latch");
    for (let i = 0; i < 240; i += 1) {
      const s = t.Debug.Explosions.State().timed;
      if (s.state === "cooking" && s.remainingFuseS <= 0.34) break;
      t.StepFrames(1);
    }
    t.Debug.Explosions.RequestThrow(0.75);
    t.StepFrames(60);
    const shortThrow = t.Debug.Explosions.State().timed.lastThrow;

    // 等待自动换下一颗准备就绪，再测试捏超时在手里自爆
    t.StepFrames(80);
    const hpBefore = t.player.health;
    t.Debug.Explosions.BeginPull("latch");
    t.StepFrames(230); // > 0.34s + 3.0s
    const afterOvercook = t.Debug.Explosions.State().timed;
    return {
      shortThrow,
      afterOvercook,
      hpBefore,
      hpAfter: t.player.health,
      alive: t.player.alive,
      suppression: t.player.suppression,
    };
  });
  assert.ok(result.timedShortAndOvercook.shortThrow && result.timedShortAndOvercook.shortThrow.releaseFuseS < 0.34,
    `special stick grenade supports exactFuse below general 0.35s floor: ${JSON.stringify(result.timedShortAndOvercook.shortThrow)}`);
  assert.ok(result.timedShortAndOvercook.afterOvercook.overcooks === 1 && result.timedShortAndOvercook.afterOvercook.lastThrow?.overcooked === true,
    `holding past fuse detonates in hand: ${JSON.stringify(result.timedShortAndOvercook.afterOvercook)}`);
  assert.ok(result.timedShortAndOvercook.alive && result.timedShortAndOvercook.hpAfter === result.timedShortAndOvercook.hpBefore && result.timedShortAndOvercook.suppression > 0,
    "invincible range tester feels suppression and survives hand overcook");
  console.log(`PASS exact short-fuse airburst (${result.timedShortAndOvercook.shortThrow.releaseFuseS}s) + hand overcook detonation`);

  // 3) 左侧 UI 控制面板真实 DOM 点击：切换武器 / 掩体墙 / 按需放车与单炮 / 收起战车
  await page.click('.explosionLab .exLoadout[data-loadout="rifle"]');
  await page.evaluate(() => window.Taierzhuang.StepFrames(4));
  result.panelSwitch = await page.evaluate(() => ({
    loadout: window.Taierzhuang.Debug.Explosions.State().activeLoadout,
    activeSlot: window.Taierzhuang.state.activeSlot,
  }));
  assert.equal(result.panelSwitch.loadout, "rifle");
  assert.equal(result.panelSwitch.activeSlot, "primary");

  await page.click('.explosionLab .exCover');
  await page.click(`.explosionLab .exVehicle[data-vehicle="${EXPLOSION_VEHICLES[0].id}"]`);
  await page.evaluate(() => {
    const t = window.Taierzhuang;
    t.Debug.Explosions.SpawnEnemies();
    t.player.Spawn(2610, 2690, 0);
    t.player.yaw = -0.15;
    t.player.pitch = -0.05;
    t.StepFrames(8);
  });
  await page.screenshot({ path: path.join(out, "Scene_VehicleAndCover.png") });
  result.panelVehicle = await page.evaluate(() => window.Taierzhuang.Debug.Explosions.State());
  assert.equal(result.panelVehicle.coverWall, true, "panel switch enables sandbag cover wall");
  assert.deepEqual(result.panelVehicle.visibleVehicles, [EXPLOSION_VEHICLES[0].id], "only the selected tank is visible on the pad");

  // 清除敌军与掩体，进入常规弹/战车/炮击/空袭/弹坑验收（避免敌军干扰坑位检查）
  await page.click('.explosionLab .exCover');
  await page.click('.explosionLab .exClearEnemies');
  await page.click('.explosionLab .exVehicle[data-vehicle=""]');
  await page.evaluate(() => window.Taierzhuang.StepFrames(4));

  // 4) 普通 G / H 投弹回归（确认通用手榴弹未受特制弹改动污染，仍挖出差异化真实弹坑且无懒编译）
  result.throws = [];
  for (const [id, key] of [["Grenade", "KeyG"], ["GrenadeBundle", "KeyH"]]) {
    const sample = await page.evaluate(({ id, key }) => {
      const t = window.Taierzhuang, field = t.combat.host.battlefield;
      t.Debug.Explosions.Reset();
      t.Debug.Explosions.SelectLoadout("rifle");
      t.Debug.Explosions.RefillThrowables();
      t.player.Spawn(2600, 2590, 0); t.player.pitch = 0;
      const before = id === "Grenade" ? t.state.grenades : t.state.bundles;
      t.Debug.Key(key, true); t.StepFrames(30); t.Debug.Key(key, false);
      t.StepFrames(30);
      const launched = t.combat.projectiles.some((p) => p.kind === id);
      const programs = t.renderer.info.programs.length;
      t.StepFrames(285);
      return {
        before, after: id === "Grenade" ? t.state.grenades : t.state.bundles, launched,
        terrain: field.deformation.State(), programs: [programs, t.renderer.info.programs.length],
      };
    }, { id, key });
    assert.ok(sample.launched && sample.terrain.lastImpact?.id === id, `${id}: real throw detonates into soil`);
    assert.equal(sample.after, sample.before - 1);
    assert.equal(sample.programs[1], sample.programs[0], `${id}: the first crater frame compiles no new shader program`);
    const updateMs = sample.terrain.lastUpdateMs.rules + sample.terrain.lastUpdateMs.surface;
    assert.ok(updateMs < 60, `${id}: rules + surface rebuild stay far below a frame (${updateMs.toFixed(1)} ms)`);
    result.throws.push(sample);
  }
  assert.ok(result.throws[1].terrain.lastImpact.depth > result.throws[0].terrain.lastImpact.depth);
  console.log(`PASS G/H throws / differentiated physical craters / no lazy shader compile (updateMs=${result.throws.map((s) => (s.terrain.lastUpdateMs.rules + s.terrain.lastUpdateMs.surface).toFixed(1)).join("/")})`);

  // 5) 玩家无敌 & 道具爆破靶标
  result.invincible = await page.evaluate(() => {
    const t = window.Taierzhuang; t.player.Spawn(2600, 2600, 0); t.StepFrames(2);
    const before = t.player.health, at = t.player.position.clone();
    t.combat.Blast(at, 6.5, 130, "grenade", null, false, null, "Grenade");
    const suppression = t.player.suppression; t.StepFrames(30);
    return { before, after: t.player.health, alive: t.player.alive, suppression, bleeding: t.player.bleeding };
  });
  assert.ok(result.invincible.alive && result.invincible.after === result.invincible.before && result.invincible.bleeding === 0,
    `point-blank blast leaves the invincible tester untouched: ${JSON.stringify(result.invincible)}`);
  assert.ok(result.invincible.suppression > 0, "suppression still lands so the blast is felt");
  console.log("PASS explosion range tester is invincible");

  result.blastTargets = await page.evaluate(async () => {
    const t = window.Taierzhuang, { BLAST_TARGETS } = await import("./Script_BlastTargets.mjs");
    BLAST_TARGETS.Clear();
    const at = t.player.position.clone(); at.x += 3; at.z += 3; const fired = [];
    for (const [id, x, z] of [["test_near", at.x, at.z], ["test_far", at.x + 60, at.z + 60]]) {
      BLAST_TARGETS.Register({ id, tag: "test", x, y: at.y, z, hp: 40, OnDestroyed: (info) => fired.push(info.id) });
    }
    t.combat.Blast(at, 6, 400, "launcher", null, false, null, "Grenade");
    BLAST_TARGETS.Clear("test");
    return { fired, left: BLAST_TARGETS.Count };
  });
  assert.deepEqual(result.blastTargets, { fired: ["test_near"], left: 0 },
    "Combat.Blast reaches the prop blast-target registry (near hit, far untouched, cleared by tag)");
  console.log("PASS combat blast reaches prop blast targets");

  // 6) 三型战车按需切入并单发开炮（每次只出现当前选中的 1 辆）
  result.vehicles = [];
  for (const vehicle of EXPLOSION_VEHICLES) {
    await page.click(`.explosionLab .exVehicle[data-vehicle="${vehicle.id}"]`);
    await page.click(".explosionLab .exFireVehicle");
    const sample = await page.evaluate(() => {
      const t = window.Taierzhuang;
      t.StepFrames(12);
      const flight = t.Debug.Explosions.State();
      t.StepFrames(70);
      return { flight, after: t.Debug.Explosions.State() };
    });
    assert.deepEqual(sample.flight.visibleVehicles, [vehicle.id], `${vehicle.id}: only selected vehicle visible`);
    assert.equal(sample.after.shots[vehicle.id], 1, `${vehicle.id}: one click / one shell`);
    assert.ok(sample.flight.shells.some((s) => s.kind === vehicle.explosive), "shell really flies");
    assert.ok(sample.after.terrain.impacts > 0, "shell actually excavates ground");
    result.vehicles.push(sample);
  }
  await page.click('.explosionLab .exVehicle[data-vehicle=""]');
  console.log("PASS on-demand vehicle selection & shells / impact");

  // 7) 炮弹尾迹、撞墙截断、演出弹与空中超时
  result.shellVisual = await page.evaluate(() => {
    const t = window.Taierzhuang; t.Debug.Explosions.Reset();
    const from = t.player.position.clone().set(2600, 2, 2608), target = from.clone().set(2600, 0, 2578);
    const shell = t.combat.FireShell(from, target, { flight: 0.85, radius: 0.1, damage: 0 });
    const initial = shell.visual.core.quaternion.clone();
    t.combat.StepShells(0.35);
    const positions = shell.visual.trail.geometry.attributes.position;
    const head = Array.from(positions.array.slice(0, 3)), tail = Array.from(positions.array.slice(-3));
    const trace = [];
    const span = shell.visual.span;
    for (let i = 0; i < positions.count; i += 2) {
      const time = shell.age - span * i / (positions.count - 2);
      const expected = from.clone().addScaledVector(shell.initialVelocity, time);
      expected.y -= 19.6 * time * time * 0.5;
      trace.push(Math.hypot(positions.getX(i) - expected.x, positions.getY(i) - expected.y, positions.getZ(i) - expected.z));
    }
    t.player.Spawn(2604, 2600, 0);
    const delta = shell.position.clone().sub(t.player.position).add({ x: 0, y: -1.6, z: 0 });
    t.player.yaw = Math.atan2(-delta.x, -delta.z); t.player.pitch = Math.atan2(delta.y, Math.hypot(delta.x, delta.z));
    t.StepFrames(24, 0);
    return {
      head, tail, position: shell.position.toArray(), trace,
      length: Math.hypot(...head.map((v, i) => v - tail[i])),
      skipDepth: shell.visual.core.userData.skipNormalDepth && shell.visual.trail.userData.skipNormalDepth,
      initialAligned: Math.abs(initial.w) < 1 && shell.visual.core.scale.x < 0.1,
      emissive: shell.visual.core.material.emissive.getHex(),
      trailBlending: shell.visual.trail.material.blending,
    };
  });
  assert.ok(result.shellVisual.trace.every((error) => error < 0.0005), "ribbon follows actual past ballistic positions");
  assert.ok(result.shellVisual.length > 0.5 && result.shellVisual.length < 1.6 && result.shellVisual.skipDepth, "trail length " + result.shellVisual.length);
  assert.ok(result.shellVisual.initialAligned, "small body follows its velocity");
  assert.equal(result.shellVisual.emissive, 0, "ordinary shell does not glow");
  assert.equal(result.shellVisual.trailBlending, 1, "motion smear uses normal alpha blending");
  await page.screenshot({ path: path.join(out, "Scene_ShellTrail.png") });

  result.wallImpact = await page.evaluate(() => {
    const t = window.Taierzhuang; t.Debug.Explosions.Reset();
    const from = t.player.position.clone().set(2648, 1.2, 2600), target = from.clone().set(2660, 1.2, 2600);
    let impact = null, count = 0;
    const shell = t.combat.FireShell(from, target, {
      flight: 0.3, radius: 0.1, damage: 0,
      OnImpact: (p) => { impact = p.toArray(); count++; },
    });
    t.combat.StepShells(0.3);
    const fading = t.combat.shellVisuals.fading.length;
    t.combat.StepShells(0.2);
    return {
      impact, count, position: shell.position.toArray(), age: shell.age, fading,
      remaining: t.scene.children.filter((m) => /^ShellVisual_/.test(m.name)).length,
    };
  });
  assert.ok(result.wallImpact.impact && Math.abs(result.wallImpact.impact[0] - 2654) < 0.05, "actual boundary wall intercepts shell");
  assert.deepEqual(result.wallImpact.position, result.wallImpact.impact, "visual head stops at swept impact instead of jumping through wall");
  assert.ok(result.wallImpact.age < 0.3 && result.wallImpact.count === 1 && result.wallImpact.fading === 1 && result.wallImpact.remaining === 0);

  result.cinematicShell = await page.evaluate(() => {
    const t = window.Taierzhuang; t.Debug.Explosions.Reset();
    const before = t.Debug.Explosions.State().terrain.impacts, health = t.player.health;
    const from = t.player.position.clone().set(2600, 3, 2600), target = from.clone().setY(0);
    let impacts = 0, feedback = 0, damageQueries = 0;
    const originalFeedback = t.combat.BlastFeedback, originalBlast = t.combat.Blast;
    t.combat.BlastFeedback = function (...args) { feedback++; return originalFeedback.apply(this, args); };
    t.combat.Blast = function (...args) { damageQueries++; return originalBlast.apply(this, args); };
    try {
      t.combat.FireShell(from, target, { flight: 0.22, radius: 4, damage: 120, feedbackOnly: true, incoming: false, OnImpact: () => impacts++ });
      for (let i = 0; i < 30; i++) t.combat.StepShells(1 / 60);
      return {
        impacts, feedback, damageQueries, terrainDelta: t.Debug.Explosions.State().terrain.impacts - before,
        healthDelta: t.player.health - health, sprite: t.combat.host.vfx.lastExplosionSprite?.kind,
      };
    } finally { t.combat.BlastFeedback = originalFeedback; t.combat.Blast = originalBlast; }
  });
  assert.deepEqual(result.cinematicShell, { impacts: 1, feedback: 1, damageQueries: 0, terrainDelta: 0, healthDelta: 0, sprite: "shell" },
    "cinematic shell hits once with shared feedback and particles, without deforming terrain or querying damage");

  result.airMiss = await page.evaluate(() => {
    const t = window.Taierzhuang; t.Debug.Explosions.Reset(); let impacts = 0;
    const from = t.player.position.clone().set(2600, 100, 2600);
    t.combat.FireShell(from, from.clone().setY(150), { flight: 0.1, radius: 0.1, damage: 0, OnImpact: () => impacts++ });
    t.combat.StepShells(3.2); t.combat.StepShells(0.2);
    return { impacts, active: t.combat.shells.length, terrain: t.Debug.Explosions.State().terrain.impacts };
  });
  assert.deepEqual(result.airMiss, { impacts: 0, active: 0, terrain: 0 }, "timeout never creates a disconnected ground explosion");
  console.log("PASS curved shell trail / swept wall impact / fading cleanup / airborne timeout");

  // 8) 活手雷 F 拾起返掷与 HUD 定位（由左侧面板按钮触发抛雷）
  await page.evaluate(() => { const t = window.Taierzhuang; t.Debug.Explosions.GoTo("return"); t.StepFrames(6); });
  await page.click(".explosionLab .exReturn");
  result.return = await page.evaluate(() => {
    const t = window.Taierzhuang;
    t.StepFrames(83);
    const p = t.combat.ReturnCandidate();
    if (!p) return { candidate: false, grenades: t.combat.projectiles.map((g) => ({ at: g.position.toArray(), fuse: g.fuse })), player: t.player.position.toArray() };
    const before = { fuse: p.fuse, inventory: t.state.grenades };
    const Warning = () => [...document.querySelectorAll(".hudGrenadeWarning")].filter((e) => e.style.display !== "none")
      .map((e) => ({ cls: e.className, text: e.textContent, x: parseFloat(e.style.left), y: parseFloat(e.style.top) }));
    const action = document.querySelector(".hudActions .hudAction.grenade");
    const hud = {
      actionsOn: document.querySelector(".hudActions").classList.contains("on"),
      actionText: action?.querySelector(".actionText")?.textContent || null, level: Warning(),
    };
    const savedPitch = t.player.pitch; t.player.pitch = -0.75; t.StepFrames(2);
    const q = p.position.clone().project(t.camera);
    hud.projected = { x: (q.x * 0.5 + 0.5) * innerWidth, y: (-q.y * 0.5 + 0.5) * innerHeight };
    hud.down = Warning(); t.player.pitch = savedPitch; t.StepFrames(1);
    t.Debug.Key("KeyF"); const claimed = p.returning; t.StepFrames(30);
    const after = { fuse: p.fuse, inventory: t.state.grenades, returned: p.returned, owner: p.owner, attached: !!p.body };
    t.StepFrames(210);
    return { candidate: true, claimed, before, after, expired: !t.combat.projectiles.includes(p), count: t.combat.returnCount, hud };
  });
  assert.ok(result.return.candidate, JSON.stringify(result.return));
  {
    const hud = result.return.hud;
    assert.ok(hud.actionsOn && /掷回/.test(hud.actionText || "") && /秒/.test(hud.actionText || ""), `return prompt shows its label and countdown: ${JSON.stringify(hud)}`);
    assert.equal(hud.level.length, 1, `one live-grenade warning: ${JSON.stringify(hud.level)}`);
    assert.ok(/returnable/.test(hud.level[0].cls) && /F/.test(hud.level[0].text), `warning names the return key: ${JSON.stringify(hud.level)}`);
    assert.ok(/edge/.test(hud.level[0].cls) && hud.level[0].y > 450, `grenade at the feet pins to the bottom edge: ${JSON.stringify(hud.level)}`);
    assert.equal(hud.down.length, 1);
    assert.ok(!/edge/.test(hud.down[0].cls) && Math.abs(hud.down[0].x - hud.projected.x) < 8 && hud.projected.y - hud.down[0].y > 10 && hud.projected.y - hud.down[0].y < 60,
      `warning pins on the visible grenade: ${JSON.stringify({ down: hud.down, projected: hud.projected })}`);
  }
  console.log("PASS HUD return prompt text / warning pinned on the grenade");
  assert.ok(result.return.claimed && result.return.after.returned && result.return.after.attached && result.return.expired);
  assert.equal(result.return.after.inventory, result.return.before.inventory, "return does not mint inventory");
  assert.ok(result.return.after.fuse < result.return.before.fuse - 0.45, "return never resets the live fuse");
  console.log("PASS real F grenade return / continuing fuse");

  // 9) 16 颗在途手榴弹外壳池
  result.shellPool = await page.evaluate(() => {
    const t = window.Taierzhuang, combat = t.combat;
    combat.ClearProjectiles();
    const eye = t.player.EyePosition.clone(), dir = t.player.AimDirection(eye.clone()).clone();
    const thrown = Array.from({ length: 16 }, (_, i) => combat.Throw(i % 4 === 3 ? "GrenadeBundle" : "Grenade", 0.5, eye.clone(), dir.clone(), 0));
    t.StepFrames(2);
    const meshes = thrown.map((p) => p.mesh);
    const shown = thrown.filter((p) => p.mesh.parent === t.scene && p.mesh.visible
      && p.mesh.userData.visuals[p.kind === "GrenadeBundle" ? "bundle" : "regular"].visible).length;
    combat.ClearProjectiles();
    return {
      distinct: new Set(meshes).size, shown, pool: combat.pool.length, free: new Set(combat.freeShells).size,
      freeEntries: combat.freeShells.length, leftInScene: combat.pool.filter((m) => m.parent).length,
    };
  });
  assert.deepEqual({ distinct: result.shellPool.distinct, shown: result.shellPool.shown }, { distinct: 16, shown: 16 },
    `every live grenade owns a visible shell: ${JSON.stringify(result.shellPool)}`);
  assert.ok(result.shellPool.pool >= 16 && result.shellPool.free === result.shellPool.pool
    && result.shellPool.freeEntries === result.shellPool.pool && result.shellPool.leftInScene === 0,
    `cleared shells return to the free list once and leave the scene graph: ${JSON.stringify(result.shellPool)}`);
  console.log("PASS grenade shell pool covers 16 live grenades");

  // 10) 面板呼叫远程炮击、飞机空袭与一键复位取消
  await page.evaluate(() => { const t = window.Taierzhuang; t.player.Spawn(2603, 2690, 0); t.player.pitch = 0.5; t.StepFrames(4); });
  await page.click(".explosionLab .exBarrage");
  await page.evaluate(() => window.Taierzhuang.StepFrames(88));
  await page.screenshot({ path: path.join(out, "Scene_IncomingShells.png") });
  result.barrage = await page.evaluate(() => {
    const t = window.Taierzhuang; t.StepFrames(440); return t.Debug.Explosions.State();
  });
  assert.equal(result.barrage.launches.length, EXPLOSION_BARRAGE.count);
  assert.ok(result.barrage.launches.every((s) => Math.hypot(s.center.x - s.target.x, s.center.z - s.target.z) <= EXPLOSION_BARRAGE.radiusM + 1e-6));
  assert.equal(result.barrage.terrain.meshes, result.barrage.terrain.colliderTiles);
  console.log("PASS 16m barrage / visible shells / matching mesh-collider tiles");

  await page.evaluate(() => { const t = window.Taierzhuang; t.player.Spawn(2636, 2690, 0); t.player.pitch = 0.45; t.StepFrames(4); });
  await page.click(".explosionLab .exAirstrike");
  result.airstrike = await page.evaluate(() => {
    const t = window.Taierzhuang; t.StepFrames(250);
    return t.Debug.Explosions.State();
  });
  assert.ok(result.airstrike.airstrike && result.airstrike.visibleAircraft.length === 1, "panel summons one actual bomber");
  assert.equal(result.airstrike.airDrops.length, EXPLOSION_AIRSTRIKE.count);
  assert.ok(result.airstrike.airDrops.every((d) => d.from[1] > 20 && d.radius <= EXPLOSION_AIRSTRIKE.radiusM));
  await page.screenshot({ path: path.join(out, "Scene_Airstrike.png") });
  result.departure = await page.evaluate(() => {
    const t = window.Taierzhuang; t.StepFrames(720); return t.Debug.Explosions.State();
  });
  assert.equal(result.departure.airstrike, null); assert.deepEqual(result.departure.visibleAircraft, []);
  assert.ok(result.departure.airDrops.every((d) => d.impact), "dropped projectiles actually impact before the bomber leaves");
  console.log("PASS aircraft call-in / random nearby drops / departure / no idle flight");

  await page.click(".explosionLab .exBarrage");
  await page.evaluate(() => window.Taierzhuang.StepFrames(25));
  await page.click(".explosionLab .exAirstrike");
  await page.evaluate(() => window.Taierzhuang.StepFrames(25));
  const beforeCancel = await page.evaluate(() => window.Taierzhuang.Debug.Explosions.State());
  await page.click(".explosionLab .exReset");
  result.cancel = await page.evaluate((before) => {
    const t = window.Taierzhuang;
    const immediate = {
      ...t.Debug.Explosions.State(),
      visuals: t.scene.children.filter((m) => /^ShellVisual_/.test(m.name)).length,
      particles: Object.values(t.vfx.pools).reduce((sum, pool) => sum + pool.geometry.instanceCount, 0),
    };
    t.StepFrames(950);
    return { before, immediate, later: t.Debug.Explosions.State() };
  }, beforeCancel);
  assert.ok(result.cancel.before.barrage && result.cancel.before.airstrike && result.cancel.before.shells.length > 0);
  assert.ok(!result.cancel.immediate.barrage && !result.cancel.immediate.airstrike && !result.cancel.immediate.shells.length);
  assert.equal(result.cancel.immediate.visuals, 0); assert.equal(result.cancel.immediate.particles, 0);
  assert.equal(result.cancel.later.terrain.impacts, 0); assert.deepEqual(result.cancel.later.visibleAircraft, []);
  console.log("PASS panel reset cancels active barrage/raid, trails and warning particles with no delayed impacts");

  // 11) 叠坑深度上限、Rapier/Heightfield 格点对角线对账、开启炮坑通行兵穿坑与即时复位
  result.traversal = await page.evaluate(() => {
    const t = window.Taierzhuang, field = t.combat.host.battlefield, physics = t.player.physics;
    t.Debug.Explosions.Reset(); t.Debug.Explosions.SetPatrols(true);
    t.player.health = 100; t.player.alive = true;
    const x = 2600, z = 2614, initialNav = t.ai.ctx.nav.revisions;
    for (let i = 0; i < 12; i++) {
      const at = t.player.position.clone().set(x, field.GroundHeight(x, z), z);
      t.combat.Blast(at, 1, 0, "shell");
    }
    const depth = field.BaseGroundHeight(x, z) - field.GroundHeight(x, z);
    physics.Step(1 / 60);
    const ray = physics.Raycast({ x, y: 8, z }, { x: 0, y: -1, z: 0 }, 20, { terrain: true });
    const physicalRay = physics.world.castRayAndGetNormal(physics._ray, 20, true);
    return {
      depth, rayY: 8 - ray.t, physicalY: physicalRay ? 8 - physicalRay.timeOfImpact : null,
      physicalTerrain: !!physics.recordByHandle.get(physicalRay?.collider.handle)?.terrain,
      height: field.GroundHeight(x, z), navBefore: initialNav, navAfter: t.ai.ctx.nav.revisions,
    };
  });
  assert.ok(result.traversal.depth > 2.3); assert.ok(Math.abs(result.traversal.rayY - result.traversal.height) < 0.05);
  assert.ok(result.traversal.physicalTerrain && Math.abs(result.traversal.physicalY - result.traversal.height) < 0.02, "real Rapier terrain surface matches mesh/height");
  assert.equal(result.traversal.navBefore, result.traversal.navAfter);

  result.lattice = await page.evaluate(async () => {
    const t = window.Taierzhuang, field = t.combat.host.battlefield, view = field.deformation, physics = t.player.physics;
    const { Raycaster, Vector3 } = await import("three");
    const s = view.model.config.cellM, meshes = [...view.tileMeshes.values()], down = new Vector3(0, -1, 0);
    t.scene.updateMatrixWorld(true);
    let samples = 0, worstCollider = 0, worstVisual = 0, otherDiagonal = 0;
    const model = view.model, Other = (x, z) => {
      const gx = x / s, gz = z / s, ix = Math.floor(gx), iz = Math.floor(gz), u = gx - ix, v = gz - iz;
      const a = model.NodeHeight(ix, iz), b = model.NodeHeight(ix + 1, iz), c = model.NodeHeight(ix, iz + 1), d = model.NodeHeight(ix + 1, iz + 1);
      return u >= v ? a + u * (b - a) + v * (d - b) : a + v * (c - a) + u * (d - c);
    };
    for (let z = 2607; z <= 2621; z += s) for (let x = 2593; x <= 2607; x += s) for (const [u, v] of [[0.25, 0.25], [0.75, 0.75], [0.25, 0.75], [0.75, 0.25]]) {
      const px = x + u * s, pz = z + v * s, expect = field.GroundHeight(px, pz);
      physics._ray.origin.x = px; physics._ray.origin.y = 10; physics._ray.origin.z = pz;
      physics._ray.dir.x = 0; physics._ray.dir.y = -1; physics._ray.dir.z = 0;
      const hit = physics.world.castRayAndGetNormal(physics._ray, 30, true, undefined, undefined, undefined, undefined,
        (collider) => !!physics.recordByHandle.get(collider.handle)?.terrain);
      if (!hit) continue;
      samples++;
      worstCollider = Math.max(worstCollider, Math.abs(10 - hit.timeOfImpact - expect));
      const visual = new Raycaster(new Vector3(px, 10, pz), down, 0, 30).intersectObjects(meshes, false)[0];
      worstVisual = Math.max(worstVisual, visual ? Math.abs(visual.point.y - expect) : Infinity);
      otherDiagonal = Math.max(otherDiagonal, Math.abs(Other(px, pz) - expect));
    }
    return { samples, worstCollider, worstVisual, otherDiagonal, colliderTiles: view.State().colliderTiles, meshes: view.State().meshes };
  });
  assert.ok(result.lattice.samples > 2000 && result.lattice.worstCollider < 1e-4 && result.lattice.worstVisual < 1e-4,
    `heightfield collider and crater mesh reproduce GroundHeight in every sub-cell quadrant: ${JSON.stringify(result.lattice)}`);
  assert.ok(result.lattice.otherDiagonal > 0.005, "the check can tell the diagonals apart on these slopes");
  assert.equal(result.lattice.colliderTiles, result.lattice.meshes);
  console.log(`PASS heightfield lattice/diagonal parity over ${result.lattice.samples} samples`);

  result.npc = await page.evaluate(() => {
    const t = window.Taierzhuang;
    const id = t.Debug.Explosions.State().patrols[0].id;
    const s = t.ai.soldiers.find((soldier) => soldier.id === id);
    s.position.set(2590, 0, 2614); s.body.Teleport(2590, 0, 2614);
    s.goal.set(2610, 0, 2614); s.state = "advance"; s.stance = 0; s.velocityY = 0;
    let minY = 0, maxStuck = 0, pathRequests = 0, maxX = s.position.x, exited = false;
    const nav = t.ai.ctx.nav, steer = nav.Steer;
    nav.Steer = function (...args) { pathRequests++; return steer.apply(this, args); };
    try {
      for (let i = 0; i < 620; i++) {
        t.StepFrames(1); minY = Math.min(minY, s.position.y); maxStuck = Math.max(maxStuck, s.stuckTime); maxX = Math.max(maxX, s.position.x);
        if (minY < -1.8 && s.position.x > 2607 && s.position.y > -0.2) { exited = true; break; }
      }
    } finally { nav.Steer = steer; }
    return { minY, maxStuck, pathRequests, maxX, exited, goal: s.goal.toArray(), final: s.position.toArray(), alive: s.alive, navigation: nav.revisions };
  });
  assert.ok(result.npc.pathRequests > 0 && result.npc.alive, "real NPC navigation and locomotion active");
  assert.ok(result.npc.exited && result.npc.minY < -1.8 && result.npc.final[0] > 2607 && result.npc.final[1] > -0.2,
    `NPC crosses and climbs out of maximum-depth crater: ${JSON.stringify(result.npc)}`);

  result.walk = await page.evaluate(() => {
    const t = window.Taierzhuang, field = t.combat.host.battlefield;
    t.player.Spawn(2600, 2622, 0); t.player.pitch = -0.35;
    let minY = 0, blocked = 0;
    t.Debug.Key("KeyW", true);
    for (let i = 0; i < 400; i++) { t.StepFrames(1); minY = Math.min(minY, t.player.position.y); }
    t.Debug.Key("KeyW", false);
    return { minY, final: t.player.position.toArray(), grounded: t.player.grounded, blocked, terrain: field.deformation.State() };
  });
  assert.ok(result.walk.minY < -1.8, "player physically enters crater");
  assert.ok(result.walk.final[2] < 2608 && result.walk.final[1] > -0.2, "player exits opposite lip without getting stuck");
  console.log("PASS depth cap / player and NPC enter and exit crater / navigation stable");

  await page.evaluate(() => { const t = window.Taierzhuang; t.player.Spawn(2600, 2618, 0); t.player.pitch = -0.5; t.StepFrames(4); });
  await page.screenshot({ path: path.join(out, "Scene_StackedCrater.png") });

  result.rim = await page.evaluate(async () => {
    const t = window.Taierzhuang, field = t.combat.host.battlefield, view = field.deformation;
    const { Raycaster, Vector3 } = await import("three");
    let best = null;
    for (const mesh of view.tileMeshes.values()) {
      const p = mesh.geometry.attributes.position;
      for (let i = 0; i < p.count; i++) if (!best || p.getY(i) > best.y) best = new Vector3(p.getX(i), p.getY(i), p.getZ(i));
    }
    const origin = best.clone().setY(8), down = new Vector3(0, -1, 0);
    t.scene.updateMatrixWorld(true);
    const visual = new Raycaster(origin, down, 0, 20).intersectObjects([...view.tileMeshes.values()], false)[0];
    const hit = t.player.physics.Raycast(origin, down, 20, { terrain: true });
    const height = field.GroundHeight(best.x, best.z);
    return { height, visual: visual?.point.y, physical: 8 - hit.t };
  });
  assert.ok(result.rim.height > 0.08 && Math.abs(result.rim.height - result.rim.visual) < 0.005
    && Math.abs(result.rim.height - result.rim.physical) < 0.005, "raised soil is real in rendering and collision");

  result.restoreBodies = await page.evaluate(() => {
    const t = window.Taierzhuang, field = t.combat.host.battlefield;
    const s = t.ai.soldiers.find((soldier) => soldier.id === t.Debug.Explosions.State().patrols[0].id);
    const y = field.GroundHeight(2600, 2614);
    t.player.position.set(2600, y, 2614); t.player.body.Teleport(2600, y, 2614);
    s.position.set(2600, y, 2614); s.body.Teleport(2600, y, 2614);
    t.Debug.Explosions.Reset();
    return { before: y, player: t.player.position.y, npc: s.position.y };
  });
  assert.ok(result.restoreBodies.before < -2 && result.restoreBodies.player === 0 && result.restoreBodies.npc === 0,
    "reset immediately brings people inside a pit back above restored ground");

  result.reset = await page.evaluate(() => {
    const t = window.Taierzhuang;
    t.Debug.Explosions.Reset();
    t.Debug.Explosions.SetPatrols(false);
    t.StepFrames(6);
    return t.Debug.Explosions.State();
  });
  assert.equal(result.reset.terrain.meshes, 0);
  assert.equal(result.reset.terrain.colliderTiles, 0);
  assert.equal(result.reset.shells.length, 0);
  assert.equal(result.reset.patrols.length, 0);

  // 12) 正片道路与界河 DEM 通用地形形变回归
  result.common = [];
  for (const query of ["phase=3", "jiehe=1"]) {
    await page.goto(`http://127.0.0.1:${server.address().port}/Taierzhuang1938/?${query}&shot=1&manual=1&quality=medium&scale=small`, { timeout: 120000 });
    await page.waitForFunction(() => window.Taierzhuang?.state.ready, null, { timeout: 180000 });
    const sample = await page.evaluate(async (query) => {
      const t = window.Taierzhuang, field = t.combat.host.battlefield, view = field.deformation;
      const { Raycaster, Vector3 } = await import("three");
      for (const soldier of [...t.ai.soldiers]) t.ai.Remove(soldier);
      const bounds = field.bounds, candidates = [];
      if (query === "phase=3") for (const source of view.overlaySources.filter((m) => /DirtRoad/.test(m.name))) {
        const pos = source.geometry.attributes.position, index = source.geometry.index;
        for (let i = 0; i < (index?.count || pos.count); i += 3) {
          const points = [0, 1, 2].map((j) => new Vector3().fromBufferAttribute(pos, index ? index.getX(i + j) : i + j).applyMatrix4(source.matrixWorld));
          const point = points[0].clone().add(points[1]).add(points[2]).divideScalar(3);
          if (Math.abs(point.y - field.BaseGroundHeight(point.x, point.z)) < 0.2) candidates.push(point);
        }
      } else for (let z = bounds.minZ + 16; z < bounds.maxZ - 16; z += 12) for (let x = bounds.minX + 16; x < bounds.maxX - 16; x += 12) {
        if (Math.abs(field.BaseGroundHeight(x + 3, z) - field.BaseGroundHeight(x - 3, z)) > 0.08) candidates.push(new Vector3(x, 0, z));
      }
      const point = candidates.find((p) => p.x > bounds.minX + 10 && p.x < bounds.maxX - 10 && p.z > bounds.minZ + 10 && p.z < bounds.maxZ - 10
        && [[0, 0], [2, 0], [-2, 0], [0, 2], [0, -2]].every(([dx, dz]) => view.CanDeform(p.x + dx, p.z + dz)));
      if (!point) return { query, error: "No suitable soil test point", sources: view.sources.map((m) => m.name), overlays: view.overlaySources.map((m) => m.name) };
      t.player.Spawn(point.x, point.z + 6, 0); t.player.pitch = -0.6; t.StepFrames(60);
      const timings = [];
      for (let i = 0; i < 3; i++) {
        point.y = field.GroundHeight(point.x, point.z);
        const start = performance.now(); t.combat.Blast(point, 0.1, 0, "shell"); timings.push(performance.now() - start);
      }
      const height = field.GroundHeight(point.x, point.z), origin = new Vector3(point.x, height + 10, point.z), down = new Vector3(0, -1, 0);
      const ray = new Raycaster(origin, down, 0, 20), meshes = [...view.sources, ...view.tileMeshes.values(), ...view.overlaySources, ...[...view.overlayTiles.values()].flat()];
      t.scene.updateMatrixWorld(true);
      const visible = ray.intersectObjects(meshes, false)[0], physical = t.player.physics.Raycast(origin, down, 20, { terrain: true });
      t.StepFrames(4);
      return {
        query, point: point.toArray(), depth: field.BaseGroundHeight(point.x, point.z) - height, height,
        visualHeight: visible?.point.y, visibleMesh: visible?.object.name, physicalHeight: origin.y - physical.t,
        terrain: view.State(), timings,
      };
    }, query);
    result.common.push(sample);
    assert.ok(!sample.error && sample.depth > 0.4, JSON.stringify(sample));
    assert.ok(Math.abs(sample.physicalHeight - sample.height) < 0.04, "common field collision follows crater");
    assert.ok(Math.abs(sample.visualHeight - sample.height) < 0.04, `no old terrain/road floating across the pit: ${JSON.stringify(sample)}`);
    if (query === "phase=3") assert.ok(sample.terrain.overlays > 0, "production road surface retessellates with the crater");
    await page.screenshot({ path: path.join(out, query === "phase=3" ? "Scene_ChapterRoadCrater.png" : "Scene_JieheCrater.png") });
    console.log(`PASS common terrain ${query}: depth=${sample.depth.toFixed(2)}, updateMs=${sample.timings.map((ms) => ms.toFixed(1)).join("/")}`);
  }

  assert.deepEqual(errors, []);
  console.log("PASS ExplosionRangeTest");
} finally {
  fs.writeFileSync(path.join(out, "Data_Acceptance.json"), JSON.stringify({ result, errors }, null, 2));
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
