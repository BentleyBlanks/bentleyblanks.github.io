// Script_FirstLevelTransferCoverProbe.mjs — 12「掩护装载与离开」守来时路的实机取证（不是门禁）。
// 口径：docs/Data_FirstLevelTransferCover20260927.md。
//
// 冷启动进第一关 12，顺子站上村口低墙射口（A.transferWall），不开枪（玩家垫血，班里人照常打）：
//   1. 第一拨顺来时的主街追下来：每 0.5 s 记每个日军的位置、折点序号与状态，量「跑动中原地不动」
//      的时长（直线折点撞墙的症状），在第 9 / 15 / 22 s 从射口按概念图 12 备选 C 的构图截图；
//   2. 把第一拨剩下的人打死 → transferThreatGapS 之后第二拨从东巷下来，顺子挪到低墙东段，
//      同样记轨迹、在它出现后第 8 / 14 s 朝巷口截图。
// 装载额度、第一批离开、各事实落下的时间一起记。
//
//   node Taierzhuang1938/Script_FirstLevelTransferCoverProbe.mjs [--quality=medium]
//
// 结果写进 _shots/TransferCover/（Data_Trace.json + Shot_*.png），不入库。
import fs from "node:fs/promises";
import path from "node:path";
import { LaunchBrowser } from "../PrairieFire1937/Script_BrowserTestKit.mjs";
import { ServeRoot } from "./Script_DevServer.mjs";

const here = import.meta.dirname;
const root = path.resolve(here, "..");
const arg = (name, fallback) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=")[1] ?? fallback;
const quality = arg("quality", "medium");
const out = path.join(here, "_shots", "TransferCover");
await fs.mkdir(out, { recursive: true });

const server = await ServeRoot(root, 0);
const browser = await LaunchBrowser();
const errors = [];
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on("pageerror", (e) => { errors.push(String(e)); console.log("PAGEERROR", String(e)); });
  const url = `http://127.0.0.1:${server.address().port}/Taierzhuang1938/?whitebox=p012&menu=0&manual=1`
    + `&missionStage=12&quality=${quality}&scale=small`;
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 180000 });
  await page.waitForFunction(() => window.Tengxian?.state?.ready && window.Tengxian.Debug.FirstLevelMissionRuntime?.(), null, { timeout: 180000 });

  await page.evaluate(() => {
    const g = window.Tengxian, r = g.Debug.FirstLevelMissionRuntime();
    window.__probe = { rows: [], facts: [], shots: [] };
    const Groups = ["transfer", "transferAlley"];
    const Seen = new Set();
    window.__place = (point, look, stance = 0) => {
      const p = g.player;
      const ground = r.battlefield.GroundHeight(point.x, point.z);
      p.position.set(point.x, ground, point.z); p.body?.Teleport(point.x, ground, point.z); p.velocity.set(0, 0, 0);
      const e = p.EyePosition, dx = look.x - e.x, dz = look.z - e.z;
      const dy = r.battlefield.GroundHeight(look.x, look.z) + 1.2 - e.y;
      p.yaw = Math.atan2(-dx, -dz); p.pitch = Math.atan2(dy, Math.hypot(dx, dz));
      if ((p.stance === "crouch") !== (stance === 1)) g.Debug.Key("KeyC");
    };
    window.__step = (seconds, lookAt = null) => {
      const P = window.__probe, t0 = r.time;
      let next = Math.ceil(r.time * 2) / 2;
      while (r.time - t0 < seconds) {
        const p = g.player;
        if (p) p.health = Math.max(p.health ?? 100, 1e9);
        if (lookAt && p) {
          const e = p.EyePosition, dx = lookAt.x - e.x, dz = lookAt.z - e.z;
          p.yaw = Math.atan2(-dx, -dz);
          p.pitch = Math.atan2(r.battlefield.GroundHeight(lookAt.x, lookAt.z) + 1.2 - e.y, Math.hypot(dx, dz));
          p.velocity.set(0, 0, 0);
        }
        g.StepFrames(1, 1 / 60, false);
        for (const id of r.flow.facts) if (!Seen.has(id)) { Seen.add(id); P.facts.push({ id, t: +r.time.toFixed(2) }); }
        if (r.time >= next) {
          next += .5;
          const enemies = [];
          for (const [id, actor] of r.enemies) {
            if (!Groups.includes(actor.missionEncounter)) continue;
            enemies.push({ id, group: actor.missionEncounter, alive: actor.alive, x: +actor.position.x.toFixed(2), z: +actor.position.z.toFixed(2),
              state: actor.state, stance: actor.stance, index: actor.missionTactic?.index ?? null, mode: actor.missionTactic?.mode ?? null,
              cover: !!actor.cover, target: actor.target ? (actor.target === g.player ? "player" : actor.target.castId || "nra") : null });
          }
          const squad = r.squad.map((s) => ({ id: s.castId, x: +s.position.x.toFixed(2), z: +s.position.z.toFixed(2),
            target: !!s.target, yaw: +(s.yaw || 0).toFixed(2) }));
          P.rows.push({ t: +r.time.toFixed(2), stage: r.flow.stage.id, enemies, squad,
            loaded: r.column.loadEvents.length, departed: r.column.departed, allowance: r.column.loadAllowance });
        }
      }
      return { t: +r.time.toFixed(2), stage: r.flow.stage.id, facts: [...r.flow.facts].filter((f) => /transfer|Threat|Batch|zhou|escort/i.test(f)) };
    };
    window.__render = () => { for (let i = 0; i < 8; i++) { g.player.velocity.set(0, 0, 0); g.StepFrames(1, 1e-4, true); } };
    window.__killGroup = (group) => {
      let n = 0;
      for (const actor of r.enemies.values()) if (actor.missionEncounter === group && actor.alive) { actor.Kill?.(null); n++; }
      return n;
    };
  });

  const notch = { x: 71.3, z: 86.05 }, gateLook = { x: 77.4, z: 60 }, eastEnd = { x: 91.5, z: 85.8 }, laneLook = { x: 94.3, z: 66 };
  await page.evaluate(({ notch, gateLook }) => window.__place(notch, gateLook), { notch, gateLook });
  let elapsed = 0;
  for (const at of [9, 15, 22]) {
    const status = await page.evaluate(({ s, look }) => window.__step(s, look), { s: at - elapsed, look: gateLook });
    elapsed = at;
    await page.evaluate(() => window.__render());
    await page.screenshot({ path: path.join(out, `Shot_Wave1_${at}s.png`) });
    console.log("wave1", at, JSON.stringify(status));
  }
  // 再看 20 s：第一拨在空场与残屋里打（班里人会打掉一部分）。
  console.log("wave1 fight", JSON.stringify(await page.evaluate(({ look }) => window.__step(20, look), { look: gateLook })));
  await page.evaluate(() => window.__render());
  await page.screenshot({ path: path.join(out, "Shot_Wave1_42s.png") });

  const killed = await page.evaluate(() => window.__killGroup("transfer"));
  console.log("wave1 killed by probe", killed);
  await page.evaluate(({ eastEnd, laneLook }) => window.__place(eastEnd, laneLook), { eastEnd, laneLook });
  // 第二拨在第一拨解除 12 s 之后才生成；等它生成再按出现时间截图。
  const spawned = await page.evaluate(({ look }) => {
    const r = window.Tengxian.Debug.FirstLevelMissionRuntime();
    for (let k = 0; k < 60; k++) {
      window.__step(.5, look);
      if ([...r.enemies.values()].some((a) => a.missionEncounter === "transferAlley")) return +r.time.toFixed(2);
    }
    return null;
  }, { look: laneLook });
  console.log("wave2 spawned at", spawned);
  elapsed = 0;
  for (const at of [8, 14, 20]) {
    const status = await page.evaluate(({ s, look }) => window.__step(s, look), { s: at - elapsed, look: laneLook });
    elapsed = at;
    await page.evaluate(() => window.__render());
    await page.screenshot({ path: path.join(out, `Shot_Wave2_${at}s.png`) });
    console.log("wave2", at, JSON.stringify(status));
  }
  console.log("wave2 fight", JSON.stringify(await page.evaluate(({ look }) => window.__step(20, look), { look: laneLook })));

  const trace = await page.evaluate(() => window.__probe);
  // 跑动中原地不动：mode=advance 的连续采样里 1 s 挪不到 0.3 m 就算一次「卡」。
  const stuck = {};
  const byId = new Map();
  for (const row of trace.rows) for (const e of row.enemies) {
    if (!byId.has(e.id)) byId.set(e.id, []);
    byId.get(e.id).push({ t: row.t, ...e });
  }
  for (const [id, list] of byId) {
    let worst = 0, run = 0;
    for (let i = 2; i < list.length; i++) {
      const a = list[i - 2], b = list[i];
      const moving = b.alive && b.mode === "advance" && a.mode === "advance";
      if (moving && Math.hypot(b.x - a.x, b.z - a.z) < .3) { run += .5; worst = Math.max(worst, run); } else run = 0;
    }
    const last = list.at(-1);
    stuck[id] = { stuckS: worst, endIndex: last.index, endMode: last.mode, alive: last.alive, end: { x: last.x, z: last.z } };
  }
  await fs.writeFile(path.join(out, "Data_Trace.json"), JSON.stringify({ quality, errors, stuck, facts: trace.facts, rows: trace.rows }, null, 1));
  console.log("stuck", JSON.stringify(stuck));
  console.log("facts", JSON.stringify(trace.facts));
  if (errors.length) process.exitCode = 1;
} finally {
  await browser.close();
  server.close();
}
