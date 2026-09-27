// Script_MixBalanceBrowserProbe.mjs — 第一关各阶段「身边说话 vs 远处战场」的电平取证（取证工具，不是门禁）。
//
// 实时跑（不带 manual=1、开声音），每一声 Play 出来后按名字归类（对白 / 己方喊话 / 日军喊话 / 近枪 / 远枪 /
// 爆炸 / 车辆 / 飞机 / 其它），把它的末级节点（panner 输出、或居中干声）并联一条到该类的 AnalyserNode；
// 另挂主输出、远声组、环境、配乐四条总线。每 50 ms 取一次峰值 / RMS，按「有对白在响 / 没有」分开统计，
// 再按类汇总每一声的距离、音量、有效电平、遮挡、空气低通（diag 行）。
//   node Taierzhuang1938/Script_MixBalanceBrowserProbe.mjs --stages=3,4,5,6 --seconds=40 --tag=before
// 输出 _shots/MixBalance/Data_MixBalance_<tag>.json。口径与 2026-09-27 那一轮的读数见 docs/Data_AudioEngine.md §12。
// 注意：各类是**总线之前**的读数（不含环境推子、对白侧链），比的是彼此之间的相对电平；主输出那一行才是玩家听到的。
import fs from "node:fs/promises";
import path from "node:path";
import { LaunchBrowser } from "../PrairieFire1937/Script_BrowserTestKit.mjs";
import { ServeRoot } from "./Script_DevServer.mjs";

const here = import.meta.dirname;
const arg = (name, fallback) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=")[1] ?? fallback;
const stages = arg("stages", "3,4,5,6").split(",").map(Number);
const seconds = Number(arg("seconds", 45));
const tag = arg("tag", "before");
const outDir = arg("out", path.join(here, "_shots", "MixBalance"));
await fs.mkdir(outDir, { recursive: true });

const server = await ServeRoot(path.resolve(here, ".."), 0);
const browser = await LaunchBrowser();
const errors = [];
const results = [];
try {
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  page.on("pageerror", (e) => errors.push(String(e)));
  const first = stages[0];
  await page.goto(`http://127.0.0.1:${server.address().port}/Taierzhuang1938/?whitebox=p012&menu=0&quality=low&scale=small&missionStage=${first}`,
    { waitUntil: "domcontentloaded", timeout: 180000 });
  await page.waitForFunction(() => window.Tengxian?.state?.ready, null, { timeout: 180000 });
  await page.locator("#bootStart").click().catch(() => {});
  await page.waitForFunction(() => window.Tengxian.audio.ctx?.state === "running" && window.Tengxian.audio.sfxReady !== false, null, { timeout: 90000 });
  await page.evaluate(() => {
    const g = window.Tengxian, a = g.audio, ctx = a.ctx;
    const CATS = ["dialogue", "barkNra", "barkIja", "playerGun", "gunNear", "gunFar", "blast", "vehicle", "plane", "other"];
    const meters = {};
    for (const c of [...CATS, "master", "farBus", "ambience", "music"]) {
      const sum = ctx.createGain(); const an = ctx.createAnalyser(); an.fftSize = 2048; sum.connect(an);
      meters[c] = { sum, an, buf: new Float32Array(2048) };
    }
    // 主输出：接在 destination 之前的最后一个节点。找不到就挂 masterGain。
    (a.softClip || a.outGain || a.masterGain).connect(meters.master.sum);
    a.farGain.connect(meters.farBus.sum);
    (a.ambienceUser || a.ambienceBus).connect(meters.ambience.sum);
    (a.musicUser || a.musicBus).connect(meters.music.sum);
    const isGun = (n) => /^(rifle|zb26|type11|type92|tankMg|mg|pistol|gunTail|smg|hmg)/i.test(n);
    const Cat = (name, v, opts) => {
      if (name.startsWith("voice.")) {
        if (v.storySelfGain || v.dialogueLine) return "dialogue";
        const key = name.slice(6).split("@")[0];
        const e = a.voiceBank.get(key) || a.voiceBank.get(name.slice(6));
        return (e?.side || "nra") === "ija" ? "barkIja" : "barkNra";
      }
      if (opts.firstPerson && isGun(name)) return "playerGun";
      if (isGun(name)) return (v.distance > 45 || /Far$/.test(name)) ? "gunFar" : "gunNear";
      if (/^(explosion|shell|amb\.cannon|launcher|tankCannon|debris|bomb)/.test(name)) return "blast";
      if (/^(tank|truck|cart|engine|car|wheel|horse|vehicle)/i.test(name)) return "vehicle";
      if (/^(plane|strafe|aircraft|air)/i.test(name)) return "plane";
      return "other";
    };
    const counts = {}; const dist = {};
    const orig = a.Play.bind(a);
    a.Play = (name, opts = {}) => {
      const v = orig(name, opts);
      if (v) {
        const c = Cat(name, v, opts);
        counts[c] = (counts[c] || 0) + 1;
        (dist[c] ||= []).push(Math.round(v.distance || 0));
        (window.__diag ||= []).push({ c, name, d: Math.round(v.distance || 0), vol: +(opts.volume ?? 1).toFixed(3), eff: +(20 * Math.log10(Math.max(1e-6, v.effectiveGain))).toFixed(1),
          occ: +(v.occ ?? 0).toFixed(2), air: Math.round(v.air?.frequency?.value ?? 0), far: !!v.farGrouped, sf: !!opts.soundField, fp: !!opts.firstPerson });
        const taps = [];
        if (v.storySelfGain) taps.push(v.storySelfGain, v.storyWorldGain);
        else if (v.panner) taps.push(v.panner);
        else taps.push(v.out);
        for (const n of taps) { try { n.connect(meters[c].sum); } catch {} }
        (window.__names ||= {})[name] = ((window.__names[name]) || 0) + 1;
      }
      return v;
    };
    const ticks = [];
    window.__mix = { meters, counts, dist, ticks, CATS };
    window.__tick = setInterval(() => {
      if (g.player) g.player.health = Math.max(g.player.health ?? 100, 1e9);
      const row = {};
      for (const [c, m] of Object.entries(meters)) {
        m.an.getFloatTimeDomainData(m.buf);
        let pk = 0, ss = 0;
        for (let i = 0; i < m.buf.length; i++) { const x = m.buf[i]; ss += x * x; if (Math.abs(x) > pk) pk = Math.abs(x); }
        row[c] = [pk, Math.sqrt(ss / m.buf.length)];
      }
      row.fd = a.dialogueFarDuck?.gain.value ?? 1; row.far = a.farGain?.gain.value ?? 1;
      ticks.push(row);
    }, 50);
  });
  for (const n of stages) {
    if (n !== first) await page.evaluate((n) => window.Tengxian.Debug.FirstLevelJump(n), n);
    await page.evaluate(() => { const m = window.__mix; m.ticks.length = 0; for (const k in m.counts) delete m.counts[k]; for (const k in m.dist) delete m.dist[k]; window.__names = {}; window.__diag = []; });
    await page.waitForTimeout(seconds * 1000);
    const r = await page.evaluate(() => {
      const g = window.Tengxian, m = window.__mix;
      const db = (x) => (x > 1e-6 ? 20 * Math.log10(x) : -120);
      const med = (arr) => { if (!arr.length) return null; const s = [...arr].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
      const p90 = (arr) => { if (!arr.length) return null; const s = [...arr].sort((x, y) => x - y); return s[Math.floor(s.length * 0.9)]; };
      const speaking = (t) => t.dialogue[1] > 10 ** (-50 / 20);
      const out = {};
      for (const c of Object.keys(m.meters)) {
        const act = m.ticks.filter((t) => t[c][0] > 10 ** (-70 / 20));
        const act2 = act.filter(speaking), actQ = act.filter((t) => !speaking(t));
        out[c] = {
          activePct: Math.round(100 * act.length / Math.max(1, m.ticks.length)),
          pkMed: +db(med(act.map((t) => t[c][0])) ?? 0).toFixed(1), pk90: +db(p90(act.map((t) => t[c][0])) ?? 0).toFixed(1),
          rmsMed: +db(med(act.map((t) => t[c][1])) ?? 0).toFixed(1),
          pkMedSpeech: act2.length ? +db(med(act2.map((t) => t[c][0]))).toFixed(1) : null,
          pkMedQuiet: actQ.length ? +db(med(actQ.map((t) => t[c][0]))).toFixed(1) : null,
          n: m.counts[c] || 0, distMed: med(m.dist[c] || []),
        };
      }
      const speechPct = Math.round(100 * m.ticks.filter(speaking).length / Math.max(1, m.ticks.length));
      const eye = g.player?.EyePosition, cam = g.camera?.position;
      return { stage: g.Debug.FirstLevelMissionRuntime?.()?.flow?.stage?.id, speechPct, out,
        names: window.__names, listenerOff: eye && cam ? +Math.hypot(eye.x - cam.x, eye.y - cam.y, eye.z - cam.z).toFixed(2) : null,
        drops: { ...g.audio.drops }, diag: window.__diag, farDuckMed: med(m.ticks.map((t) => t.fd)), farGainMed: med(m.ticks.map((t) => t.far)) };
    });
    results.push({ n, ...r });
    console.log(`\n=== stage ${n} (${r.stage}) speech ${r.speechPct}% listenerOff ${r.listenerOff} farDuck ${r.farDuckMed?.toFixed?.(2)} farGain ${r.farGainMed?.toFixed?.(2)}`);
    for (const [c, s] of Object.entries(r.out)) console.log(c.padEnd(10), JSON.stringify(s));
    const byCat = {};
    for (const d of r.diag || []) (byCat[d.c] ||= []).push(d);
    const med = (a) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
    for (const [c, list] of Object.entries(byCat)) {
      const names = {}; for (const d of list) names[d.name] = (names[d.name] || 0) + 1;
      console.log("  diag", c.padEnd(9), "n", list.length, "d", med(list.map((d) => d.d)), "vol", med(list.map((d) => d.vol)), "eff", med(list.map((d) => d.eff)),
        "occ", med(list.map((d) => d.occ)), "air", med(list.map((d) => d.air)), "far", list.filter((d) => d.far).length, JSON.stringify(names).slice(0, 240));
    }
  }
  await fs.writeFile(path.join(outDir, `Data_MixBalance_${tag}.json`), JSON.stringify({ results, errors }, null, 2));
  if (errors.length) console.log("page errors:", errors.slice(0, 5));
} finally {
  await browser.close();
  server.close();
}
