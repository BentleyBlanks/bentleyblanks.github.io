// 《台儿庄：血战滕县》日军躲手榴弹验收（docs/Data_EnemyAi.md §21，数在 Data_Tuning_Ai.GRENADE_EVADE）。
//
//   node Taierzhuang1938/Script_AiGrenadeEvadeBrowserTest.mjs
//
// 同一块空地、同一颗玩家的木柄手榴弹落在一个六人班正中间，躲避开 / 关各跑一趟（关 = 把
// `AiDirector.GrenadeEvadeEligible` 换成恒 false，其余一行不动），量：
//   · 爆炸那一刻每人离爆心多远、比落地时多跑了多远；
//   · 死几个、掉多少血（正常血量，不给无敌）；
//   · 躲的那几秒有没有人开枪（躲雷的人扳机让开）；
//   · 班里一个带守点旗（scriptDefensive + holdZone）的人也躲，炸完回到守区；
//   · 在头顶上飞的雷不触发（落地前没人拔腿）。
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { LaunchBrowser } from "../PrairieFire1937/Script_BrowserTestKit.mjs";
import { ServeRoot } from "./Script_DevServer.mjs";

const projectDir = path.dirname(fileURLToPath(import.meta.url));
const server = await ServeRoot(path.resolve(projectDir, ".."), 0);
const browser = await LaunchBrowser();
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
const errors = [];
page.on("pageerror", (error) => errors.push(`PAGEERROR ${String(error).slice(0, 240)}`));

try {
  const port = server.address().port;
  await page.goto(`http://127.0.0.1:${port}/Taierzhuang1938/?whitebox=p012&shot=1&manual=1&quality=low`,
    { waitUntil: "domcontentloaded", timeout: 240000 });
  await page.waitForFunction(() => window.Tengxian?.state?.ready, null, { timeout: 300000 });

  const out = await page.evaluate(async () => {
    const T = window.Tengxian, ai = T.ai;
    const probe = await import("./Script_AiProbeScene.mjs");
    const { GRENADE_EVADE } = await import("./Data_Tuning_Ai.mjs");
    T.state.menu = false;
    await T.Debug.FirstLevelJump(4);
    T.StepFrames(2, 1 / 60, false);
    const Step = (n) => { for (let i = 0; i < n; i += 1) T.StepFrames(1, 1 / 60, false); };
    const G = (x, z) => T.battlefield.GroundHeight(x, z);

    // 找一块 16 m 见方、能走、起伏 < 0.6 m、离墙够远的空地（从玩家脚下往外螺旋找）。
    const p0 = T.player.position;
    let site = null;
    for (let r = 20; r <= 140 && !site; r += 6) {
      for (let a = 0; a < 24 && !site; a += 1) {
        const cx = p0.x + Math.cos(a / 24 * Math.PI * 2) * r, cz = p0.z + Math.sin(a / 24 * Math.PI * 2) * r;
        let ok = true, lo = Infinity, hi = -Infinity;
        for (let dx = -8; dx <= 8 && ok; dx += 2) for (let dz = -8; dz <= 8 && ok; dz += 2) {
          if (T.nav && !T.nav.Walkable(cx + dx, cz + dz)) ok = false;
          const h = G(cx + dx, cz + dz); lo = Math.min(lo, h); hi = Math.max(hi, h);
        }
        if (!ok || hi - lo > 0.6) continue;
        // 水平射线：中心往八个方向 9 m 都不撞墙（能跑得开）。
        const from = new p0.constructor(cx, G(cx, cz) + 0.5, cz);
        let clear = 0;
        for (let k = 0; k < 8; k += 1) {
          const dir = new p0.constructor(Math.cos(k * Math.PI / 4), 0, Math.sin(k * Math.PI / 4));
          const hit = T.battlefield.Raycast(from, dir, 9);
          if (!hit) clear += 1;
        }
        if (clear >= 6) site = { x: cx, z: cz };
      }
    }
    if (!site) return { error: "no open site" };

    const OFFSETS = [[-1.6, -1.2], [0, -1.6], [1.6, -1.2], [-1.6, 1.2], [0, 1.6], [1.6, 1.2]];
    const Run = (evade) => {
      const eligible = ai.GrenadeEvadeEligible;
      if (!evade) ai.GrenadeEvadeEligible = () => false;
      const squad = [];
      const priorMax = ai.maxAlive;
      ai.maxAlive = ai.soldiers.length + 16;
      for (const [dx, dz] of OFFSETS) {
        const s = ai.Spawn("ija", site.x + dx, site.z + dz, { weapon: "Type38", squadId: "EvadeProbe" + evade });
        if (s) squad.push(s);
      }
      ai.maxAlive = priorMax;
      // 一个守点的人：守点旗压不住躲雷，炸完回到守区。
      const guard = squad[1];
      guard.scriptDefensive = true;
      guard.holdZone = { id: "EvadeProbeHold", x: guard.position.x, z: guard.position.z, radius: 1.5 };
      guard.order = "hold";
      const Restore = probe.IsolateSquad(T, squad);
      // 玩家摆到 40 m 外趴着（看得见也打得着，但这一趟量的是雷，不是对射）。
      probe.PlacePlayer(T, { x: site.x + 40, z: site.z }, "prone", Math.PI / 2);
      Step(90);
      for (const s of squad) { s.health = 100; }
      const shotsBefore = squad.map((s) => s.fireSequence | 0);
      // 先从 3 m 高处扔一颗会飞过班头顶的雷，看落地前有没有人拔腿（飞行中的雷不算）。
      const at = { x: site.x, z: site.z };
      const V = p0.constructor;
      const g = T.combat.Throw("Grenade", 0, new V(at.x, G(at.x, at.z) + 0.25, at.z), new V(0, -1, 0));
      g.position.set(at.x, G(at.x, at.z) + 3.2, at.z);
      g.body?.setTranslation({ x: at.x, y: G(at.x, at.z) + 3.2, z: at.z }, true);
      g.body?.setLinvel({ x: 0, y: 0, z: 0 }, true);
      g.velocity?.set(0, 0, 0);
      const start = squad.map((s) => ({ x: s.position.x, z: s.position.z }));
      let movedWhileHigh = 0, landedAt = null, firedWhileEvading = 0;
      const shotAt = squad.map((s) => s.fireSequence | 0);
      for (let f = 0; f < 60 * 6 && g.alive; f += 1) {
        const high = g.position.y - G(g.position.x, g.position.z) > GRENADE_EVADE.landedM;
        Step(1);
        if (high) for (const s of squad) if (ai.GrenadeEvading(s)) movedWhileHigh += 1;
        if (!high && landedAt === null) landedAt = { x: g.position.x, z: g.position.z, fuse: g.fuse };
        squad.forEach((s, i) => {
          if (s.grenadeEvade?.panic) s._panic = true;
          if (ai.GrenadeEvading(s) && (s.fireSequence | 0) !== shotAt[i]) firedWhileEvading += 1;
          shotAt[i] = s.fireSequence | 0;
        });
        if (g.fuse <= 1 / 60 + 1e-6) {
          // 最后一帧：记爆炸那一刻的站位（下一帧就结算）。
          squad.forEach((s, i) => { s._atBlast = Math.hypot(s.position.x - g.position.x, s.position.z - g.position.z);
            s._startD = Math.hypot(start[i].x - g.position.x, start[i].z - g.position.z); });
        }
      }
      Step(30);
      const rows = squad.map((s) => ({ id: s.id, alive: s.alive, hp: Math.max(0, Math.round(s.health)),
        startD: +(s._startD ?? 0).toFixed(2), blastD: +(s._atBlast ?? 0).toFixed(2), stance: s.stance, panic: !!s._panic }));
      // 守点的人炸完回守区（给 8 s）。
      let guardBack = null;
      if (guard.alive) {
        for (let f = 0; f < 60 * 8; f += 1) {
          Step(1);
          if (Math.hypot(guard.position.x - guard.holdZone.x, guard.position.z - guard.holdZone.z) <= guard.holdZone.radius + 1) { guardBack = +(f / 60).toFixed(2); break; }
        }
      }
      const guardRow = rows[1];
      Restore();
      for (const s of squad) ai.Remove(s);
      ai.GrenadeEvadeEligible = eligible;
      return { rows, guardRow, guardBack, movedWhileHigh, landedAt, firedWhileEvading,
        shots: squad.reduce((n, s, i) => n + ((s.fireSequence | 0) - shotsBefore[i]), 0),
        dead: rows.filter((r) => !r.alive).length, hpLost: rows.reduce((n, r) => n + (100 - r.hp), 0) };
    };
    const off = Run(false);
    const on = Run(true);
    return { site, off, on, stats: { evades: ai.stats.grenadeEvades || 0, dives: ai.stats.grenadeDives || 0 } };
  });

  console.log(JSON.stringify(out, null, 1));
  assert.ok(!out.error, out.error);
  const { on, off } = out;
  // 慌了就地扑倒的人（GRENADE_EVADE.panicChance）不算进「跑没跑」的分母。
  const runners = on.rows.filter((r) => !r.panic);
  const ran = runners.filter((r) => r.blastD - r.startD >= 3).length;
  console.log(`evade on : dead ${on.dead}/6, hp lost ${on.hpLost}, ran ≥3 m ${ran}/${runners.length} (panicked ${6 - runners.length}), mean blast distance ${(on.rows.reduce((n, r) => n + r.blastD, 0) / 6).toFixed(2)} m`);
  console.log(`evade off: dead ${off.dead}/6, hp lost ${off.hpLost}, mean blast distance ${(off.rows.reduce((n, r) => n + r.blastD, 0) / 6).toFixed(2)} m`);
  assert.equal(on.movedWhileHigh, 0, "雷还在头顶飞的时候没人拔腿");
  assert.ok(runners.length >= 4 && ran >= runners.length - 1,
    `没慌的人里至多一个没跑开 3 m（${ran}/${runners.length}）`);
  assert.ok(on.hpLost < off.hpLost * 0.5, `躲了以后掉血不到不躲的一半（${on.hpLost} vs ${off.hpLost}）`);
  assert.ok(on.dead < off.dead || off.dead === 0, `躲了以后死得更少（${on.dead} vs ${off.dead}）`);
  assert.equal(on.firedWhileEvading, 0, "躲雷的那几秒扳机让开");
  assert.ok(on.guardRow.panic || on.guardRow.blastD - on.guardRow.startD >= 3, `守点的人也躲（多跑 ${(on.guardRow.blastD - on.guardRow.startD).toFixed(2)} m）`);
  assert.ok(!on.guardRow.alive || on.guardBack !== null, "守点的人炸完 8 s 内回到守区");
  assert.deepEqual(errors, [], "页面无报错");
  console.log("ok grenade evade");
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
