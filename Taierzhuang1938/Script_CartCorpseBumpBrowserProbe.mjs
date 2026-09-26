// Script_CartCorpseBumpBrowserProbe.mjs — 牛马车压过尸体的实机取证（不是门禁；纯规则门禁是 Script_CartCorpseBumpTest）。
//
// 冷启动进第一关 12，直接切到 CartRide、顺子上车；在 cartRide 路线上左右两条车辙各放一具
// 真的被打死的日军（ai.Spawn + Kill，尸体走正常的 StepCorpse 落定），然后让车真走过去。
// 每帧记车身 bumpHeave/Pitch/Roll、顺子眼位比地面高多少、老周担架高度；视线对准压到的那只轮子，
// 在抬得最高的那一刻截图。另外量一次南向车流路线（southTraffic）穿过 31 号尸堆时的顶面格。
//
//   node Taierzhuang1938/Script_CartCorpseBumpBrowserProbe.mjs [--quality=medium]
//
// 结果写进 _shots/CartCorpseBump/（Data_Trace.json + 截图）。
import fs from "node:fs/promises";
import path from "node:path";
import { LaunchBrowser } from "../PrairieFire1937/Script_BrowserTestKit.mjs";
import { ServeRoot } from "./Script_DevServer.mjs";

const here = import.meta.dirname;
const root = path.resolve(here, "..");
const arg = (name, fallback) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=")[1] ?? fallback;
const quality = arg("quality", "medium");
const out = path.join(here, "_shots", "CartCorpseBump");
await fs.mkdir(out, { recursive: true });

const server = await ServeRoot(root, 0);
const browser = await LaunchBrowser();
const errors = [];
let failed = false;
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on("pageerror", (e) => { errors.push(String(e)); console.log("PAGEERROR", String(e)); });
  const url = `http://127.0.0.1:${server.address().port}/Taierzhuang1938/?whitebox=p012&menu=0&manual=1`
    + `&missionStage=12&quality=${quality}&scale=small`;
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 180000 });
  await page.waitForFunction(() => window.Tengxian?.state?.ready && window.Tengxian.Debug.FirstLevelMissionRuntime?.(), null, { timeout: 180000 });
  await page.waitForFunction(() => window.Tengxian.Debug.FirstLevelMissionRuntime().view.draftCartModels.ready, null, { timeout: 120000 });

  const setup = await page.evaluate(() => {
    const g = window.Tengxian, r = g.Debug.FirstLevelMissionRuntime();
    const field = r.view.corpseTopField;
    // 31 号尸堆就压在 southTraffic 上：顶面格里真的有它（沿路线每 10 cm 取样）。
    const route = [{ x: 2, z: -8 }, { x: 22, z: 8 }];
    let pileSamples = 0, pileTop = 0;
    for (let t = 0; t <= 1; t += 0.004) {
      const x = route[0].x + (route[1].x - route[0].x) * t, z = route[0].z + (route[1].z - route[0].z) * t;
      const top = field.Top(x, z);
      if (top > -Infinity) { pileSamples++; pileTop = Math.max(pileTop, top - r.battlefield.GroundHeight(x, z)); }
    }
    return { fieldCells: field.cells.size, fieldBodies: field.bodies, fieldBuildMs: +field.buildMs.toFixed(1),
      pileSamples, pileTopM: +pileTop.toFixed(3), stage: r.flow.stage.id };
  });
  console.log("setup", JSON.stringify(setup));

  const boarded = await page.evaluate(() => {
    const g = window.Tengxian, r = g.Debug.FirstLevelMissionRuntime();
    // 跳转接口只到公开阶段 12（Transfer）；这里是取证不是通关证据：Flow 按 MISSION_STAGES
    // 下标往后推到 CartRide 再 Enter（与正常推进同一个入口）。
    for (let guard = 0; guard < 8 && r.flow.stage.id !== "CartRide"; guard++) { r.flow.index++; r.flow.Enter(); }
    // 正常流程里 12 的 Transfer 会先给老周叫一辆车（ReserveBoardingCart）；跳转没走那一段，这里补上，
    // 车直接停到 cartRide 路线起点（MISSION_STAGE_ROUTES.cartRide[0]）。
    const reserved = r.column.ReserveBoardingCart({ x: 85.6, z: 113 });
    if (reserved) { reserved.x = 85.6; reserved.z = 113; reserved.state = "loading"; }
    const ok = r.BeginCartRide();
    if (ok) r.Record("cartBoarded");
    const cart = r.column.zhouRideCart;
    return { ok, stage: r.flow.stage.id, control: r.controls?.kind || null, cart: cart && { id: cart.id, x: cart.x, z: cart.z, draft: cart.draft } };
  });
  console.log("boarded", JSON.stringify(boarded));
  if (!boarded.ok || boarded.control !== "cartRide") throw new Error("顺子没上车");

  // 两具尸体：左车辙压在 (79,118)→(77,127) 中段，右车辙压在 (77,127)→(76,135) 中段。
  const corpses = await page.evaluate(() => {
    const g = window.Tengxian, r = g.Debug.FirstLevelMissionRuntime(), ai = r.ai;
    const route = r.transferCart.ride.route;
    const Place = (a, b, t, side) => {
      const dx = b.x - a.x, dz = b.z - a.z, len = Math.hypot(dx, dz), fx = dx / len, fz = dz / len;
      const rx = -fz, rz = fx; // 车的局部 +X（右）
      const x = a.x + dx * t + rx * side * 1.32, z = a.z + dz * t + rz * side * 1.32;
      const s = ai.Spawn("ija", x, z, {});
      if (!s) return null;
      s.yaw = Math.atan2(-fx, -fz) + Math.PI / 2; // 横躺在车辙上
      s.Kill(null);
      return { x: +x.toFixed(2), z: +z.toFixed(2), side };
    };
    const found = (p) => route.findIndex((q) => Math.abs(q.x - p.x) < 1e-6 && Math.abs(q.z - p.z) < 1e-6);
    const i1 = found({ x: 79, z: 118 }), i2 = found({ x: 77, z: 127 });
    const placed = [Place(route[i1], route[i1 + 1], 0.55, -1), Place(route[i2], route[i2 + 1], 0.5, 1)];
    // 让尸体落定（StepCorpse 最多 8 s），车先别走：ride.halted 临时拉住。
    r.transferCart.ride.halted = true;
    for (let i = 0; i < 60 * 3; i++) g.StepFrames(1, 1 / 60, false);
    r.transferCart.ride.halted = false;
    const settled = ai.soldiers.filter((s) => !s.alive && placed.some((p) => p && Math.hypot(s.position.x - p.x, s.position.z - p.z) < 1.5))
      .map((s) => ({ x: +s.position.x.toFixed(2), z: +s.position.z.toFixed(2), settled: !!s.corpseSettled,
        hitboxes: s.actor.GetBoneHitboxes().length }));
    return { placed, settled };
  });
  console.log("corpses", JSON.stringify(corpses));

  // 车走起来：每帧记一行；视线对着车前方最近的那具尸体。每到一次抬升的峰值就停下来截一张。
  await page.evaluate((placed) => {
    const g = window.Tengxian, r = g.Debug.FirstLevelMissionRuntime(), ride = r.transferCart.ride, cart = ride.cart;
    window.__rows = [];
    window.__run = (stopAtPeak) => {
      const rows = window.__rows;
      for (let n = 0; n < 60 * 60; n++) {
        if (ride.halted || ride.progress >= ride.length - 0.05) return { done: true };
        const p = g.player;
        if (p) p.health = Math.max(p.health ?? 100, 1e9);
        const ahead = placed.filter(Boolean).map((c) => ({ c, d: Math.hypot(c.x - cart.x, c.z - cart.z) }))
          .sort((a, b) => a.d - b.d)[0]?.c;
        if (p && ahead) {
          const e = p.EyePosition, dx = ahead.x - e.x, dz = ahead.z - e.z;
          const dy = r.battlefield.GroundHeight(ahead.x, ahead.z) + 0.15 - e.y;
          p.yaw = Math.atan2(-dx, -dz); p.pitch = Math.max(-1.2, Math.atan2(dy, Math.hypot(dx, dz)));
        }
        g.StepFrames(1, 1 / 60, true);
        const zhou = r.column.litters.find((l) => l.zhou);
        const row = { i: rows.length, stage: r.flow.stage.id, x: +cart.x.toFixed(3), z: +cart.z.toFixed(3),
          heave: +(cart.bumpHeave || 0).toFixed(4), pitch: +(cart.bumpPitch || 0).toFixed(4), roll: +(cart.bumpRoll || 0).toFixed(4),
          eyeAboveGround: +(p.position.y - r.battlefield.GroundHeight(p.position.x, p.position.z)).toFixed(4),
          zhouAboveGround: zhou ? +(r.view.zhouRoot.position.y - r.battlefield.GroundHeight(zhou.x, zhou.z)).toFixed(4) : null,
          cartRootY: +(r.view.draftCartModels.instances.get(cart.id)?.cartRoot.position.y ?? NaN).toFixed(4),
          ground: +r.battlefield.GroundHeight(cart.x, cart.z).toFixed(4) };
        rows.push(row);
        const prev = rows.at(-2), prev2 = rows.at(-3);
        if (stopAtPeak && prev && prev2 && prev.heave > 0.08 && prev.heave >= prev2.heave && prev.heave > row.heave
          && !window.__shotAt?.includes(prev.i)) {
          (window.__shotAt ||= []).push(prev.i);
          return { done: false, peak: prev };
        }
      }
      return { done: false };
    };
    // 侧面机位：暂时放掉 cartRide 接管、把玩家挪到那只轮子外侧 4.5 m 渲一帧（dt 极小，车不动），拍完放回。
    window.__side = (side) => {
      const p = g.player, saved = { x: p.position.x, y: p.position.y, z: p.position.z, yaw: p.yaw, pitch: p.pitch };
      const controls = r.controls; r.controls = null;
      const c = Math.cos(cart.yaw), s = Math.sin(cart.yaw);
      const rx = c, rz = -s, bx = s, bz = c; // 局部 +X、局部 +Z（车尾）
      const hub = { x: cart.x + side * 1.32 * rx + 0.18 * bx, z: cart.z + side * 1.32 * rz + 0.18 * bz };
      const eye = { x: hub.x + side * 4.2 * rx + 2.2 * bx, z: hub.z + side * 4.2 * rz + 2.2 * bz };
      const ground = r.battlefield.GroundHeight(eye.x, eye.z);
      p.position.set(eye.x, ground, eye.z); p.body?.Teleport(eye.x, ground, eye.z); p.velocity.set(0, 0, 0);
      const e = p.EyePosition, dx = hub.x - e.x, dz = hub.z - e.z;
      const dy = r.battlefield.GroundHeight(hub.x, hub.z) + 0.6 - e.y;
      p.yaw = Math.atan2(-dx, -dz); p.pitch = Math.atan2(dy, Math.hypot(dx, dz));
      // 机位瞬移那一帧满屏运动模糊；原地多渲几帧让速度缓冲与 TAA 历史收敛。
      for (let i = 0; i < 6; i++) { p.velocity.set(0, 0, 0); g.StepFrames(1, 1e-4, true); }
      return () => {
        r.controls = controls;
        p.position.set(saved.x, saved.y, saved.z); p.body?.Teleport(saved.x, saved.y, saved.z);
        p.yaw = saved.yaw; p.pitch = saved.pitch;
      };
    };
    window.__restore = null;
  }, corpses.placed);
  const peaks = [];
  for (let k = 0; k < 6; k++) {
    const status = await page.evaluate(() => window.__run(true));
    if (status.peak) {
      peaks.push(status.peak);
      await page.screenshot({ path: path.join(out, `Shot_Peak${peaks.length}.png`) });
      // 侧面：roll<0 是左轮（局部 -X）被垫起来。
      await page.evaluate((side) => { window.__restore = window.__side(side); }, status.peak.roll < 0 ? -1 : 1);
      await page.screenshot({ path: path.join(out, `Shot_Peak${peaks.length}_Side.png`) });
      await page.evaluate(() => window.__restore());
      console.log("peak", JSON.stringify(status.peak));
    }
    if (status.done) break;
  }
  await page.evaluate(() => window.__run(false));
  const trace = await page.evaluate(() => window.__rows);
  await fs.writeFile(path.join(out, "Data_Trace.json"), JSON.stringify({ setup, boarded, corpses, peaks, trace }, null, 1));
  const peak = trace.reduce((best, row) => (row.heave > best.heave ? row : best), trace[0]);
  const rolls = [Math.min(...trace.map((row) => row.roll)), Math.max(...trace.map((row) => row.roll))];
  const eyes = trace.map((row) => row.eyeAboveGround);
  const lifted = trace.filter((row) => row.heave > 0.02).length;
  console.log("trace", JSON.stringify({ frames: trace.length, liftedFrames: lifted, peak, rollRange: rolls,
    eyeRange: [Math.min(...eyes), Math.max(...eyes)], stages: [...new Set(trace.map((row) => row.stage))] }));
  // 两具尸体各压一侧：左轮那一具 roll<0，右轮那一具 roll>0。
  if (!(peak.heave > 0.05)) failed = true;
  if (!(rolls[0] < -0.01 && rolls[1] > 0.01)) failed = true;
} catch (error) {
  failed = true;
  console.error(error);
} finally {
  await browser.close();
  server.close();
}
if (errors.length) { console.log("page errors:", errors.length); failed = true; }
console.log(failed ? "PROBE FAILED" : "PROBE OK");
process.exit(failed ? 1 : 0);
