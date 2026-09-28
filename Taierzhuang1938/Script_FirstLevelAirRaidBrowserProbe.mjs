// Script_FirstLevelAirRaidBrowserProbe.mjs — 第一关 01–06 中远处轮番轰炸的实拍取证（不是门禁）。
//
// 冷启动进第一关某一阶段（默认 04），等空袭层起跑后把下一轮提前到现在，
// 视线逐帧对准编队 / 炸弹 / 落区，按一轮的时间线拍：进场、投弹、炸弹下落、落地、土柱、久留烟团。
// 同时记下空袭层与声部账的取证（State()）、落地前后逐帧渲染的帧耗时与绘制数，写进 _shots/FirstLevelAirRaid/。
//
//   node Taierzhuang1938/Script_FirstLevelAirRaidBrowserProbe.mjs [--stage=4] [--quality=low] [--shot]
//        [--formation=heavySquadron] [--vantage=x,z[,h]] [--tag=name]
//
// --shot       走 `?shot=1`（静音截图模式）；默认不带，取证时引擎声与爆炸声都真的在排。
// --formation  下一轮用哪一种编队（Data_FirstLevelAirRaid.formations 的键）。
// --vantage    每帧把玩家按在 (x, 地面 + h, z)：04 的机枪阵地四面是墙、沟里看不见落区；
//              (29.7,-141.5) 在 04 的行动路线上、四块落区都通视，h = 7 越过沟沿与矮房。
import fs from "node:fs/promises";
import path from "node:path";
import { LaunchBrowser } from "../PrairieFire1937/Script_BrowserTestKit.mjs";
import { ServeRoot } from "./Script_DevServer.mjs";

const here = import.meta.dirname;
const root = path.resolve(here, "..");
const arg = (name, fallback) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=")[1] ?? fallback;
const stage = Number(arg("stage", 4));
const quality = arg("quality", "low");
const formation = arg("formation", null);
const vantage = arg("vantage", null)?.split(",").map(Number) ?? null;
const tag = arg("tag", formation || "auto");
const out = path.join(here, "_shots", "FirstLevelAirRaid");
await fs.mkdir(out, { recursive: true });

const server = await ServeRoot(root, 0);
const browser = await LaunchBrowser();
const errors = [];
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on("pageerror", (e) => { errors.push(String(e)); console.log("PAGEERROR", String(e)); });
  const url = `http://127.0.0.1:${server.address().port}/Taierzhuang1938/?whitebox=p012&${process.argv.includes("--shot") ? "shot=1" : "menu=0"}`
    + `&manual=1${stage > 1 ? `&missionStage=${stage}` : ""}&quality=${quality}&scale=small`;
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 180000 });
  await page.waitForFunction(() => window.Tengxian?.state?.ready && window.Tengxian.Debug.FirstLevelMissionRuntime?.(), null, { timeout: 180000 });
  // manual=1：游戏不自己走，按帧推（StepFrames）。每一帧先把视线对准 window.__aim（世界坐标），玩家无敌。
  await page.evaluate((vantage) => {
    const g = window.Tengxian;
    window.__raid = () => g.Debug.FirstLevelMissionRuntime().battleSound.airRaid;
    window.__aimAt = (kind) => {
      const raid = window.__raid(), w = raid.wave;
      if (!w) return null;
      if (kind === "lead") return raid.LeadPoint(w, w.t);
      if (kind === "bombs") {
        const air = w.bombs.filter((b) => w.t >= b.tRelease && w.t < b.tImpact).map((b) => raid.BombPose(w, b, w.t));
        return air.length ? { x: air[0].x, y: air[0].y * 0.6 + w.center.y * 0.4, z: air[0].z } : { ...w.center, y: w.center.y + 60 };
      }
      return { x: w.center.x, y: w.center.y + 25, z: w.center.z };
    };
    window.__step = (seconds, kind, render = false, timing = false) => {
      const frames = Math.max(1, Math.round(seconds * 60));
      const times = [], calls = [];
      for (let i = 0; i < frames; i += 1) {
        const p = g.player;
        if (p) p.health = Math.max(p.health ?? 100, 1e9);
        if (p && vantage) {
          const y = g.Debug.FirstLevelMissionRuntime().battlefield.GroundHeight(vantage[0], vantage[1]) + (vantage[2] || 0);
          p.position.set(vantage[0], y, vantage[1]); p.body?.Teleport?.(vantage[0], y, vantage[1]);
        }
        const a = kind ? window.__aimAt(kind) : null;
        if (p && a) {
          const e = p.EyePosition, dx = a.x - e.x, dy = a.y - e.y, dz = a.z - e.z;
          p.yaw = Math.atan2(-dx, -dz);
          p.pitch = Math.max(-1.3, Math.min(1.3, Math.atan2(dy, Math.hypot(dx, dz))));
        }
        const draw = render && (timing || i >= frames - 3);
        const t0 = performance.now();
        g.StepFrames(1, 1 / 60, draw);
        if (timing && draw) { times.push(performance.now() - t0); calls.push(g.renderer?.info?.render?.calls ?? 0); }
      }
      const r = g.Debug.FirstLevelMissionRuntime();
      return { stage: r.flow.stage.id, time: +r.time.toFixed(2), started: window.__raid().started, t: window.__raid().wave?.t ?? null, times, calls };
    };
  }, vantage);
  // 起跑：推到空袭层认为「开始了」，再把下一轮提前到现在。
  let status = null;
  // 01 要等开场导演走到 FrontPass（传令、近爆、黑屏、醒来，约一分钟）：记下它真正起跑的那一刻。
  for (let i = 0; i < 400; i += 1) { status = await page.evaluate(() => window.__step(0.5)); if (status.started) break; }
  console.log("status", JSON.stringify({ ...status, times: undefined, calls: undefined }));
  if (!status.started) throw new Error("空袭层没有起跑");
  // 指定编队：把轮换指针拨到它；其余阶段把下一轮提前到现在（01 照正式节奏等 firstAfterS）。
  await page.evaluate(([formation, early]) => {
    const raid = window.__raid();
    if (formation && !raid.wave) raid.waveIndex = Math.max(0, raid.D.order.indexOf(formation));
    if (early && !raid.wave) raid.nextAt = raid.time;
    window.__step(1 / 60);
  }, [formation, stage > 1]);
  // 正在说话会往后推（最多 speechDeferS），挑不到落区隔 retryS 再挑：推到真的起了为止。
  for (let i = 0; i < 60 && !(await page.evaluate(() => !!window.__raid().wave)); i += 1) await page.evaluate(() => window.__step(0.5));
  console.log("raid", JSON.stringify(await page.evaluate(() => window.__raid().State())));
  const plan = await page.evaluate(() => {
    const w = window.__raid().wave;
    return { key: w.key, zone: w.zone, center: w.center, dir: w.dir, tCenter: w.tCenter, endT: w.endT, t: w.t, overhead: w.overhead,
      planes: w.slots.length, bomb: w.spec.id, bombs: w.bombs.length, aimRangeM: w.aimRangeM, aimFallS: w.aimFallS,
      firstImpact: Math.min(...w.bombs.map((b) => b.tImpact)), lastImpact: Math.max(...w.bombs.map((b) => b.tImpact)),
      firstRelease: Math.min(...w.bombs.map((b) => b.tRelease)) };
  });
  console.log("wave", JSON.stringify(plan));
  const shots = [
    { name: "01_Approach", at: plan.firstRelease - 5, aim: "lead" },
    { name: "02_Release", at: plan.firstRelease + 1.0, aim: "lead" },
    { name: "03_Falling", at: plan.firstImpact - 2.0, aim: "bombs" },
    { name: "04_Impact", at: plan.firstImpact + 0.5, aim: "center" },
    { name: "05_Stick", at: plan.lastImpact + 0.6, aim: "center", timing: true },
    { name: "06_Columns", at: plan.lastImpact + 4.5, aim: "center" },
    { name: "07_Pall", at: plan.lastImpact + 12, aim: "center" },
  ];
  const log = [];
  for (const shot of shots) {
    // 先推到拍摄前 1.5 s（不渲染），再对着目标推 1.5 s（最后三帧渲染；timing 那一张整段逐帧渲染计时）。
    const now = await page.evaluate(() => window.__raid().wave?.t ?? window.__raid().time);
    const lead = shot.at - 1.5 - now;
    if (lead > 0) await page.evaluate(([s, k]) => window.__step(s, k), [lead, shot.aim]);
    const span = Math.max(1 / 20, shot.at - Math.max(now, shot.at - 1.5));
    const res = await page.evaluate(([s, k, timing]) => window.__step(s, k, true, timing), [span, shot.aim, !!shot.timing]);
    const file = path.join(out, `Shot_${stage}_${tag}_${shot.name}.png`);
    await page.screenshot({ path: file });
    const state = await page.evaluate(() => {
      const g = window.Tengxian, r = g.Debug.FirstLevelMissionRuntime(), s = r.battleSound;
      const eye = g.player.EyePosition;
      return { stage: r.flow.stage.id, eye: { x: +eye.x.toFixed(1), y: +eye.y.toFixed(1), z: +eye.z.toFixed(1) },
        raid: s.airRaid.State(), sharedBusy: s.SharedBusy(), peakShared: s.frontPeakShared,
        formationShown: [...(g.aircraft?.formations?.values() || [])].reduce((n, l) => n + l.filter((x) => x?.root?.parent).length, 0),
        bombsShown: [...(g.aircraft?.bombSets?.values() || [])].reduce((n, set) => n + (set.mesh.parent ? set.mesh.count : 0), 0),
        bombPool: g.vfx?.pools?.bombSmoke?.geometry?.instanceCount ?? null, bombBlasts: g.vfx?.bombBlasts ?? 0,
        lastBombBlast: g.vfx?.lastBombBlast ?? null,
        audio: { live: g.audio?.liveNodes, budget: g.audio?.nodeBudget, drops: { ...(g.audio?.drops || {}) },
          ctx: g.audio?.ctx?.state ?? null, droneReq: g.audio?.playRequests?.get?.("planeDrone") ?? null },
        // 编队首次入画有没有现编着色器：开机预热（aircraft.WarmProxy）之后这个数在一轮里不该再涨。
        programs: g.renderer?.info?.programs?.length ?? null };
    });
    const timing = res.times.length ? { frames: res.times.length, avgMs: +(res.times.reduce((a, b) => a + b, 0) / res.times.length).toFixed(2),
      maxMs: +Math.max(...res.times).toFixed(2), maxCalls: Math.max(...res.calls) } : null;
    log.push({ shot: shot.name, file: path.basename(file), ...state, timing });
    console.log(shot.name, JSON.stringify({ ...state, raid: { ...state.raid, recent: undefined }, timing }));
  }
  await fs.writeFile(path.join(out, `Data_AirRaidProbe_${stage}_${tag}.json`), JSON.stringify({ url, plan, log, errors }, null, 2));
  if (errors.length) { console.log("page errors:", errors.length); process.exitCode = 1; }
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
