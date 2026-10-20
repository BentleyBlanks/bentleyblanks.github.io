// 炮击扬尘测试场（?impacts=1）的浏览器验收：场地起得来、真实土色 PBR 地形 + 壕沟 + 布景都在、面板在、
// 11 个弹种每个能发并挖出坑（落角量出来、explosiveId 传对）、齐射、时间控制、自由相机、鼠标选点、清空、A/B 开关。
// 截图写到 tmp/ShellImpactRange/（已忽略目录，不提交）。纯数据那一半在 Script_ShellImpactRangeTest.mjs。
// 用法：node Taierzhuang1938/Script_ShellImpactRangeBrowserTest.mjs     不碰真指针锁（navigator.webdriver 下游戏走假后端）。
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { LaunchBrowser } from "../PrairieFire1937/Script_BrowserTestKit.mjs";
import { ServeRoot } from "./Script_DevServer.mjs";
import {
  SHELL_IMPACT_MUNITIONS, SHELL_IMPACT_TARGETS, SHELL_IMPACT_PROPS, SHELL_IMPACT_TREES, SHELL_IMPACT_DRUMS, SHELL_IMPACT_TANKS,
} from "./Data_ShellImpactRange.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.resolve(here, "..", "tmp", "ShellImpactRange");
fs.mkdirSync(out, { recursive: true });
const server = await ServeRoot(path.resolve(here, ".."), 0), browser = await LaunchBrowser();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on("pageerror", (e) => { errors.push(String(e)); console.log("PAGE ERROR", String(e)); });
page.on("console", (m) => { if (m.type() === "error") { errors.push(m.text()); console.log("CONSOLE ERROR", m.text().slice(0, 300)); } });
const result = {};
try {
  await page.goto(`http://127.0.0.1:${server.address().port}/Taierzhuang1938/?impacts=1&shot=1&manual=1&quality=medium&scale=small`, { timeout: 180000 });
  await page.waitForFunction(() => window.Taierzhuang?.state.ready, null, { timeout: 300000 });
  console.log("SCENE ready");

  // ---- 场地 ----------------------------------------------------------------
  result.boot = await page.evaluate(() => {
    const t = window.Taierzhuang, field = t.battlefield; t.StepFrames(30, 1 / 60, false);
    return {
      level: t.Debug.Level().id, pinned: t.state.pinned, invincible: t.player.debug.invincible,
      deformable: t.scene.children.filter((c) => c.userData.deformableTerrain).length,
      layered: !!field.terrainLayers, trench: field.stats.trenchEarth?.meshes ?? 0, trenchSurface: !!field.stats.trenchSurface,
      trees: field.breakableTrees?.trees.length, scenery: field.sceneryStats, tanks: [...field.tankModels.keys()],
      external: field.externalProps?.count, externalFailed: field.externalProps?.failed,
      hasApi: !!t.Debug.ShellImpact, soldiers: t.ai?.soldiers?.length ?? 0,
      panel: {
        munitions: document.querySelectorAll(".shellImpactLab .siMunition").length,
        targets: document.querySelectorAll(".shellImpactLab .siTarget").length,
        pick: document.querySelectorAll(".shellImpactLab .siPick").length,
        cameras: document.querySelectorAll(".shellImpactLab .siCamera").length,
        scales: document.querySelectorAll(".shellImpactLab .siScale").length,
        title: document.querySelector(".shellImpactLab .siHead b")?.textContent,
      },
    };
  });
  assert.equal(result.boot.level, "ShellImpactRange"); assert.ok(result.boot.pinned && result.boot.invincible);
  assert.ok(result.boot.deformable > 0, "地面可被炮弹挖坑（deformableTerrain）");
  assert.ok(result.boot.layered, "地面是第一关那套分层土壤 PBR，不是白盒灰");
  assert.ok(result.boot.trench > 0 && result.boot.trenchSurface, "壕沟土块 / 根毯 / 石头表面在");
  assert.equal(result.boot.trees, SHELL_IMPACT_TREES.length); assert.equal(result.boot.scenery.drums, SHELL_IMPACT_DRUMS.length);
  assert.equal(result.boot.scenery.mg, 1); assert.deepEqual(result.boot.tanks.sort(), Object.keys(SHELL_IMPACT_TANKS).sort());
  assert.equal(result.boot.external, SHELL_IMPACT_PROPS.length, "外部道具只摆自带的表"); assert.deepEqual(result.boot.externalFailed, []);
  assert.equal(result.boot.soldiers, 0, "不刷敌人");
  assert.ok(result.boot.hasApi);
  assert.deepEqual(result.boot.panel, { munitions: 11, targets: 8, pick: 1, cameras: 4, scales: 4, title: "炮击扬尘测试场" });
  await page.evaluate(() => window.Taierzhuang.Debug.ShellImpact.ShowPanel(false));
  await page.evaluate(() => window.Taierzhuang.StepFrames(6));
  await page.screenshot({ path: path.join(out, "Test_ReferenceClean.png") });
  await page.evaluate(() => window.Taierzhuang.Debug.ShellImpact.ShowPanel(true));
  await page.evaluate(() => window.Taierzhuang.StepFrames(3));
  await page.screenshot({ path: path.join(out, "Test_ReferencePanel.png") });
  console.log("PASS scene / panel");

  // ---- 机位 ----------------------------------------------------------------
  result.cameras = await page.evaluate(() => {
    const t = window.Taierzhuang, api = t.Debug.ShellImpact, ground = (x, z) => t.battlefield.GroundHeight(x, z);
    const read = (id) => {
      api.Camera(id); t.StepFrames(2, 1 / 60, false);
      const p = t.camera.position, d = t.camera.getWorldDirection(new t.camera.position.constructor());
      return { above: p.y - ground(p.x, p.z), pitch: t.camera.rotation.x, forwardZ: d.z, mode: api.State().camera.mode };
    };
    return { reference: read("reference"), trenchLow: read("trenchLow"), overhead: read("overhead") };
  });
  assert.ok(result.cameras.reference.above > 8 && result.cameras.reference.above < 12.5 && result.cameras.reference.forwardZ < -0.5, "参考机位：抬高约 10 m、朝北看");
  assert.ok(result.cameras.trenchLow.above > 1 && result.cameras.trenchLow.above < 2.6, "沟沿低机位");
  assert.ok(result.cameras.overhead.pitch < -1.45 && result.cameras.overhead.above > 60, "俯视机位");
  result.fly = await page.evaluate(() => {
    const t = window.Taierzhuang, api = t.Debug.ShellImpact;
    api.Camera("reference"); t.StepFrames(2, 1 / 60, false);
    const before = t.camera.position.clone(), player = t.player.position.clone(), flying = api.State().camera.mode;
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyW" })); t.StepFrames(30, 1 / 60, false); window.dispatchEvent(new KeyboardEvent("keyup", { code: "KeyW" }));
    const forward = t.camera.position.clone();
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyE" })); t.StepFrames(30, 1 / 60, false); window.dispatchEvent(new KeyboardEvent("keyup", { code: "KeyE" }));
    const up = t.camera.position.clone();
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "ShiftLeft" })); window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyD" }));
    t.StepFrames(30, 1 / 60, false);
    window.dispatchEvent(new KeyboardEvent("keyup", { code: "KeyD" })); window.dispatchEvent(new KeyboardEvent("keyup", { code: "ShiftLeft" }));
    const fast = t.camera.position.clone();
    return { flying, moved: forward.distanceTo(before), rose: up.y - forward.y, fastMoved: fast.distanceTo(up), playerMoved: t.player.position.distanceTo(player), captured: api.State().camera.mode === "free" };
  });
  assert.equal(result.fly.flying, "free");
  assert.ok(result.fly.moved > 5 && result.fly.moved < 9, `W 飞行 0.5 s ≈ 7 m（${result.fly.moved.toFixed(2)}）`);
  assert.ok(result.fly.rose > 5, `E 升高（${result.fly.rose.toFixed(2)}）`);
  assert.ok(result.fly.fastMoved > 20, `Shift 加速（${result.fly.fastMoved.toFixed(2)}）`);
  assert.ok(result.fly.playerMoved < 0.05, "自由相机时玩家不动（输入被接管）");
  result.back = await page.evaluate(() => {
    const t = window.Taierzhuang, api = t.Debug.ShellImpact; api.Camera("player"); t.StepFrames(3, 1 / 60, false);
    const eye = t.camera.position, p = t.player.position;
    return { mode: api.State().camera.mode, dy: eye.y - p.y, dist: Math.hypot(eye.x - p.x, eye.z - p.z) };
  });
  assert.equal(result.back.mode, "player"); assert.ok(result.back.dist < 0.6 && result.back.dy > 1 && result.back.dy < 2.1, "回到玩家：相机在玩家头上");
  await page.evaluate(() => window.Taierzhuang.Debug.ShellImpact.Camera("reference"));
  console.log("PASS cameras / free fly");

  // ---- 弹种 ----------------------------------------------------------------
  await page.evaluate(() => {
    const t = window.Taierzhuang, combat = t.combat; if (combat.__impactSpyInstalled) return;
    combat.__impactSpyInstalled = true; combat.__blasts = [];
    const original = combat.Blast.bind(combat);
    combat.Blast = (...args) => { combat.__blasts.push({ position: args[0].toArray(), radius: args[1], damage: args[2], kind: args[3], explosiveId: args[7], options: args[9] || null }); return original(...args); };
  });
  result.shots = [];
  for (const spec of SHELL_IMPACT_MUNITIONS) {
    const sample = await page.evaluate(({ id, targetId }) => {
      const t = window.Taierzhuang, api = t.Debug.ShellImpact, combat = t.combat;
      api.Clear(); t.StepFrames(3, 1 / 60, false); combat.__blasts.length = 0;
      const beforeImpacts = api.State().terrain.impacts, positions = [];
      const record = api.Fire(id, targetId);
      let guard = 0;
      while ((api.State().shells.length || api.State().bombs.length) && guard++ < 1200) {
        const s = api.State().shells[0];
        // 飞行早段用大步长，临近落地换小步长取末段两点量落角。
        const dt = s && s.age > s.flight - 0.6 ? 1 / 120 : 0.05;
        t.StepFrames(1, dt, false);
        const n = api.State().shells[0]; if (n) positions.push({ position: n.position, age: n.age });
      }
      t.StepFrames(4, 1 / 30, true);
      const state = api.State(), last = state.last, tail = positions.slice(-2);
      let sampledAngle = null;
      if (tail.length === 2) {
        const [a, b] = [tail[0].position, tail[1].position];
        sampledAngle = Math.atan2(a[1] - b[1], Math.hypot(b[0] - a[0], b[2] - a[2])) * 180 / Math.PI;
      }
      return { id, record, last, sampledAngle, blasts: combat.__blasts.slice(), impacts: state.terrain.impacts - beforeImpacts,
        lastImpact: state.terrain.lastImpact, guard };
    }, { id: spec.id, targetId: "TrenchStraight" });
    result.shots.push(sample);
    // 每发一定是正式 Blast，且 explosiveId / kind 传对。
    assert.equal(sample.blasts.length, 1, `${spec.id}: 恰好一次 Combat.Blast（${sample.blasts.length}）`);
    const blast = sample.blasts[0];
    assert.equal(blast.explosiveId, spec.explosiveId, `${spec.id}: explosiveId 传对`);
    assert.equal(blast.kind, spec.delivery === "hand" || spec.delivery === "drop" ? spec.blastKind : "shell", `${spec.id}: Blast kind`);
    assert.equal(blast.radius, spec.radiusM); assert.equal(blast.damage, spec.damage);
    assert.ok(sample.last.impact, `${spec.id}: 有命中点`);
    if (spec.delivery === "hand" || spec.delivery === "drop") {
      assert.ok(Array.isArray(blast.options?.impactVelocity), `${spec.id}: 非 FireShell 的起爆带命中速度`);
      assert.ok(Number.isFinite(blast.options?.incoming?.y) && blast.options.incoming.y < 0, `${spec.id}: options.incoming 是向下的命中速度向量（扬尘读它）`);
    }
    if (spec.delivery === "hand" || spec.delivery === "lob" || spec.delivery === "field" || spec.delivery === "drop") {
      const target = sample.record.target, hit = sample.last.impact;
      const miss = Math.hypot(hit[0] - target[0], hit[2] - target[2]);
      assert.ok(miss < 0.8, `${spec.id}: 命中沟内落点（偏 ${miss.toFixed(2)} m）`);
      assert.ok(sample.impacts >= 1 && sample.lastImpact?.id === spec.explosiveId, `${spec.id}: 挖出对应弹种的坑（${sample.lastImpact?.id}）`);
    }
    if (spec.delivery === "lob" || spec.delivery === "field") {
      assert.ok(Math.abs(sample.sampledAngle - spec.angleDeg) < 3, `${spec.id}: 量出的落角 ${sample.sampledAngle?.toFixed(1)}° ≈ ${spec.angleDeg}°`);
    }
    if (spec.delivery === "drop") assert.ok(Math.abs(sample.last.angleDeg - spec.angleDeg) < 0.6, `${spec.id}: 航弹落角 ${sample.last.angleDeg.toFixed(1)}°`);
    if (spec.delivery === "direct") assert.ok(sample.last.angleDeg < 6 && sample.sampledAngle < 8, `${spec.id}: 平射落角很浅（${sample.sampledAngle?.toFixed(1)}°）`);
    await page.screenshot({ path: path.join(out, `Test_Fire_${spec.id}.png`) });
    console.log(`PASS ${spec.id}  angle ${(sample.sampledAngle ?? sample.last.angleDeg ?? 0).toFixed(1)}°  flight ${sample.last.flightS.toFixed(2)} s  craters ${sample.impacts}`);
  }
  // 装药越大坑越深（同落点连发三种榴弹）。
  result.depth = await page.evaluate(() => {
    const t = window.Taierzhuang, api = t.Debug.ShellImpact, depths = {};
    for (const id of ["Shell82", "Shell105", "Shell150"]) {
      api.Clear(); t.StepFrames(2, 1 / 60, false);
      api.Fire(id, "OpenFront20"); let guard = 0;
      while ((api.State().shells.length) && guard++ < 400) t.StepFrames(1, 0.05, false);
      t.StepFrames(6, 1 / 30, false);
      depths[id] = api.State().terrain.lastImpact?.depth ?? 0;
    }
    return depths;
  });
  assert.ok(result.depth.Shell82 < result.depth.Shell105 && result.depth.Shell105 < result.depth.Shell150, `装药越大坑越深：${JSON.stringify(result.depth)}`);
  console.log("PASS 11 munitions / charges and craters");

  // ---- 齐射 ----------------------------------------------------------------
  result.barrage = await page.evaluate(() => {
    const t = window.Taierzhuang, api = t.Debug.ShellImpact;
    api.Clear(); t.StepFrames(2, 1 / 60, false); t.combat.__blasts.length = 0;
    const first = api.Barrage("Shell82", "OpenFront20");
    const queuedAtStart = api.State().queued; let guard = 0;
    while ((api.State().shells.length || api.State().queued) && guard++ < 1500) t.StepFrames(1, 0.05, false);
    t.StepFrames(4, 1 / 30, false);
    return { first, queuedAtStart, blasts: t.combat.__blasts.length, craters: api.State().terrain.impacts, spread: t.combat.__blasts.map((b) => b.position) };
  });
  assert.equal(result.barrage.first.count, 4); assert.equal(result.barrage.queuedAtStart, 3);
  assert.equal(result.barrage.blasts, 4, "齐射 4 发都落地"); assert.ok(result.barrage.craters >= 4);
  const xs = result.barrage.spread.map((p) => p[0]), zs = result.barrage.spread.map((p) => p[2]);
  assert.ok(Math.max(...xs) - Math.min(...xs) > 1 || Math.max(...zs) - Math.min(...zs) > 1, "落点有散布");
  await page.screenshot({ path: path.join(out, "Test_Barrage.png") });
  console.log("PASS barrage");

  // ---- 时间 ----------------------------------------------------------------
  result.time = await page.evaluate(() => {
    const t = window.Taierzhuang, api = t.Debug.ShellImpact, age = () => api.State().shells[0]?.age ?? null, out = {};
    api.Clear(); t.StepFrames(2, 1 / 60, false);
    api.SetTimeScale(1); api.Fire("Shell82", "OpenFront20"); t.StepFrames(10, 1 / 60, false);
    const a0 = age(); t.StepFrames(30, 1 / 60, false); out.realtime = age() - a0;                     // 飞行中 30 帧 ≈ 0.5 s
    api.Pause(true); const p0 = age(); t.StepFrames(60, 1 / 60, false); out.paused = age() - p0;     // 暂停：几乎不走
    api.Step(1); const s0 = age(); t.StepFrames(1, 1 / 60, false); out.step = age() - s0;           // 单步：恰好一帧 1/60 s
    t.StepFrames(5, 1 / 60, false); out.afterStep = age() - s0 - out.step;                           // 单步之后又回到暂停
    api.SetFlightFast(false); api.SetTimeScale(0.25); const q0 = age(); t.StepFrames(30, 1 / 60, false); out.quarter = age() - q0;
    api.SetFlightFast(true); const f0 = age(); t.StepFrames(30, 1 / 60, false); out.flightFast = age() - f0;  // 飞行中用 1×
    api.SetTimeScale(0.1); out.state = api.State().timeScale;
    api.Clear(); t.StepFrames(2, 1 / 60, false);
    // 落地后（无弹在空中）回到所选倍速。
    api.SetTimeScale(0.5); const c0 = api.State().clock; t.StepFrames(30, 1 / 60, false); out.idleHalf = api.State().clock - c0;
    api.SetTimeScale(1);
    return out;
  });
  assert.ok(Math.abs(result.time.realtime - 0.5) < 0.02, `1× 飞行 30 帧 0.5 s（${result.time.realtime.toFixed(3)}）`);
  assert.ok(result.time.paused < 0.001, `暂停几乎不走（${result.time.paused}）`);
  assert.ok(Math.abs(result.time.step - 1 / 60) < 0.002, `单步 = 1/60 s（${result.time.step.toFixed(4)}）`);
  assert.ok(result.time.afterStep < 0.001, "单步之后仍是暂停");
  assert.ok(Math.abs(result.time.quarter - 0.125) < 0.01, `0.25×（${result.time.quarter.toFixed(3)}）`);
  assert.ok(Math.abs(result.time.flightFast - 0.5) < 0.02, `飞行中用 1×（${result.time.flightFast.toFixed(3)}）`);
  assert.ok(Math.abs(result.time.idleHalf - 0.25) < 0.01, `落地后 0.5×（${result.time.idleHalf.toFixed(3)}）`);
  console.log("PASS time controls");

  // ---- 选点 ----------------------------------------------------------------
  result.pick = await page.evaluate(() => {
    const t = window.Taierzhuang, api = t.Debug.ShellImpact, rangeApi = api;
    api.Camera("overhead"); t.StepFrames(3, 1 / 60, false);
    const canvas = document.querySelector("canvas"), rect = canvas.getBoundingClientRect();
    api.SetTarget("TrenchStraight");
    const named = api.State().target;
    // 鼠标选点：开选点模式，按住 Alt 点画布中心（俯视机位的中心是射击壕与交通壕的交汇处附近）。
    const lab = document.querySelector(".shellImpactLab .siPick"); lab.click();
    const picking = api.State().picking;
    canvas.dispatchEvent(new MouseEvent("mousedown", { clientX: rect.left + rect.width * 0.5, clientY: rect.top + rect.height * 0.5, altKey: true, button: 0, bubbles: true }));
    const picked = api.State().target;
    const marker = t.scene.getObjectByName("ShellImpactMarker");
    t.StepFrames(2, 1 / 60, false);
    return { named, picking, picked, marker: marker.position.toArray(), markerVisible: marker.visible };
  });
  assert.ok(result.pick.picking, "选点模式开着");
  assert.ok(result.pick.picked.picked && !result.pick.named.picked, "鼠标点地面设了落点");
  assert.ok(Math.hypot(result.pick.picked.x - 3806, result.pick.picked.z - 3786) < 9, `点屏幕中心取到俯视机位下方的地面（${result.pick.picked.x}, ${result.pick.picked.z}）`);
  assert.ok(Math.hypot(result.pick.marker[0] - result.pick.picked.x, result.pick.marker[2] - result.pick.picked.z) < 0.01 && result.pick.markerVisible, "落点标记跟到点选处");
  await page.evaluate(() => window.Taierzhuang.Debug.ShellImpact.Pick(false));
  result.pickFire = await page.evaluate(() => {
    const t = window.Taierzhuang, api = t.Debug.ShellImpact; api.Clear(); t.StepFrames(2, 1 / 60, false);
    const rec = api.Fire("Grenade"); t.StepFrames(3, 1 / 30, false);
    const state = api.State();
    return { target: rec.target, picked: state.target };
  });
  assert.ok(Math.hypot(result.pickFire.target[0] - result.pickFire.picked.x, result.pickFire.target[2] - result.pickFire.picked.z) < 0.01, "发射用点选的落点");
  console.log("PASS mouse pick");

  // ---- 清空 / A-B ----------------------------------------------------------
  result.clear = await page.evaluate(() => {
    const t = window.Taierzhuang, api = t.Debug.ShellImpact, vfx = t.combat.host.vfx, field = t.battlefield;
    const calls = { cleared: 0, groundCleared: 0, dust: [] };
    vfx.ClearParticles = () => { calls.cleared++; }; vfx.ClearGroundImpacts = () => { calls.groundCleared++; };
    vfx.SetGroundImpactDust = (on) => { calls.dust.push(on); };
    api.Clear(); t.StepFrames(2, 1 / 60, false);
    api.SetTarget("OpenFront20");
    const t0 = field.GroundHeight(3798, 3758), b0 = field.BaseGroundHeight(3798, 3758);
    api.Fire("Bomb250kg"); api.Fire("Shell150"); let guard = 0;
    while ((api.State().shells.length || api.State().bombs.length) && guard++ < 1200) t.StepFrames(1, 0.05, false);
    t.StepFrames(4, 1 / 30, false);
    const dug = field.GroundHeight(3798, 3758), digs = api.State().terrain.impacts;
    api.Fire("Shell82");                                   // 在途一发，清空要一起清
    const inFlight = api.State().shells.length;
    calls.cleared = 0; calls.groundCleared = 0;           // 只数这一次清空
    api.Clear(); t.StepFrames(2, 1 / 60, false);
    const after = api.State(), restored = field.GroundHeight(3798, 3758);
    api.SetDust(false); api.SetDust(true);
    const dust = [...calls.dust];
    delete vfx.ClearParticles; delete vfx.ClearGroundImpacts; delete vfx.SetGroundImpactDust;
    return { t0, b0, dug, restored, digs, inFlight, shells: after.shells.length, bombs: after.bombs.length, impacts: after.terrain.impacts, calls, dust, last: after.last };
  });
  assert.ok(result.clear.digs >= 2 && result.clear.dug < result.clear.t0 - 0.5, `炸出了坑（${result.clear.t0.toFixed(2)} → ${result.clear.dug.toFixed(2)}）`);
  assert.equal(result.clear.inFlight, 1);
  assert.ok(Math.abs(result.clear.restored - result.clear.b0) < 0.02, "清空后地面恢复"); assert.equal(result.clear.impacts, 0);
  assert.equal(result.clear.shells, 0); assert.equal(result.clear.bombs, 0); assert.equal(result.clear.last, null);
  assert.equal(result.clear.calls.cleared, 1, "清空调 vfx.ClearParticles"); assert.equal(result.clear.calls.groundCleared, 1, "清空调 vfx.ClearGroundImpacts");
  assert.deepEqual(result.clear.dust, [false, true], "A/B 开关调 vfx.SetGroundImpactDust");
  // 没实现这些接口时不报错（主会话的新扬尘还没进时也要能用）。
  result.optional = await page.evaluate(() => {
    const t = window.Taierzhuang, api = t.Debug.ShellImpact;
    const had = ["ClearParticles", "ClearGroundImpacts", "SetGroundImpactDust"].map((k) => typeof t.combat.host.vfx[k]);
    api.SetDust(false); api.SetDust(true); api.Clear();
    return had;
  });
  console.log("PASS clear / A-B toggle (optional vfx hooks tolerated)", JSON.stringify(result.optional));

  // ---- 通用接线（Script_Main 读 phase.groundImpactDust）---------------------
  const main = fs.readFileSync(path.join(here, "Script_Main.mjs"), "utf8");
  assert.ok(main.includes("vfx?.SetGroundImpactDust?.(!!phase.groundImpactDust)") && main.includes("vfx?.SetGroundSampler?.(phase.groundImpactDust"), "进关按 phase.groundImpactDust 开扬尘并交地面采样器");
  assert.ok(main.includes("vfx?.SetGroundImpactDust?.(false); vfx?.SetGroundSampler?.(null);"), "离开本关关掉扬尘");

  await page.evaluate(() => window.Taierzhuang.Debug.ShellImpact.Camera("reference"));
  assert.deepEqual(errors, [], `控制台无报错：${errors.join(" | ")}`);
  console.log("ShellImpactRangeBrowserTest: all passed");
} finally {
  fs.writeFileSync(path.join(out, "Test_Result.json"), JSON.stringify(result, null, 1));
  await browser.close();
  server.close();
}
