// 《台儿庄：血战滕县》「我拿枪指着他，他不理我」验收（docs/Data_EnemyAi.md §21，数在
// Data_Tuning_AiPerception.THREAT）。
//
//   node Taierzhuang1938/Script_AiAimedAtBrowserTest.mjs                 本树
//   node Taierzhuang1938/Script_AiAimedAtBrowserTest.mjs --root=<另一棵树>  用另一棵树的游戏跑（量改前基线）
//
// 场景（一块空地，受控，全员无敌只量行为）：三个日军一排，三个国军在他们正前方 12 m 与他们对射；
// 玩家站在日军侧前方 22 m（比国军远），拿枪依次指着三个日军中的一个。另一个日军挂关卡禁火
// （`missionFireHold`，开火窗口没轮到他），玩家指着他 —— 他该自卫开火。
// 量：被指着的人多久把目标换成玩家、多久对玩家开第一枪；禁火的人被指着多久开枪。
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { LaunchBrowser } from "../PrairieFire1937/Script_BrowserTestKit.mjs";
import { ServeRoot } from "./Script_DevServer.mjs";

const projectDir = path.dirname(fileURLToPath(import.meta.url));
const rootArg = process.argv.find((a) => a.startsWith("--root="))?.slice(7);
const root = rootArg ? path.resolve(rootArg) : path.resolve(projectDir, "..");
const baseline = !!rootArg;
const server = await ServeRoot(root, 0);
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
    T.state.menu = false;
    await T.Debug.FirstLevelJump(4);
    T.StepFrames(2, 1 / 60, false);
    const Step = (n) => { for (let i = 0; i < n; i += 1) T.StepFrames(1, 1 / 60, false); };
    const G = (x, z) => T.battlefield.GroundHeight(x, z);
    const V = T.player.position.constructor;

    // 一块 30 × 30 m 能走、平、眼高互相通视的空地。
    const p0 = T.player.position;
    const Clear = (a, b) => {
      const from = new V(a.x, G(a.x, a.z) + 1.4, a.z), to = new V(b.x, G(b.x, b.z) + 1.4, b.z);
      const dir = to.clone().sub(from), len = dir.length(); dir.divideScalar(len);
      const hit = T.battlefield.Raycast(from, dir, len);
      return !hit || hit.t >= len - 0.4;
    };
    let site = null;
    for (let r = 20; r <= 160 && !site; r += 6) {
      for (let a = 0; a < 24 && !site; a += 1) {
        const cx = p0.x + Math.cos(a / 24 * Math.PI * 2) * r, cz = p0.z + Math.sin(a / 24 * Math.PI * 2) * r;
        let ok = true, lo = Infinity, hi = -Infinity;
        for (let dx = -14; dx <= 14 && ok; dx += 2) for (let dz = -8; dz <= 14 && ok; dz += 2) {
          if (T.nav && !T.nav.Walkable(cx + dx, cz + dz)) ok = false;
          const h = G(cx + dx, cz + dz); lo = Math.min(lo, h); hi = Math.max(hi, h);
        }
        if (!ok || hi - lo > 0.8) continue;
        const ija = [-3, 0, 3].map((dx) => ({ x: cx + dx, z: cz - 6 }));
        const nra = [-3, 0, 3].map((dx) => ({ x: cx + dx, z: cz + 6 }));
        const player = { x: cx + 14, z: cz - 6 + 17 };
        if (!ija.every((e, i) => Clear(e, nra[i]) && Clear(e, player))) continue;
        site = { cx, cz, ija, nra, player };
      }
    }
    if (!site) return { error: "no site" };

    const priorMax = ai.maxAlive;
    ai.maxAlive = ai.soldiers.length + 16;
    const ija = site.ija.map((p) => ai.Spawn("ija", p.x, p.z, { weapon: "Type38", squadId: "AimedAtIja" }));
    const nra = site.nra.map((p) => ai.Spawn("nra", p.x, p.z, { weapon: "HanYang", squadId: "AimedAtNra" }));
    ai.maxAlive = priorMax;
    for (const s of [...ija, ...nra]) {
      s.health = 1e9; s.grenades = 0; s.order = "hold";
      s.holdZone = { id: "AimedAtHold" + s.id, x: s.position.x, z: s.position.z, radius: 1.5 };
      s.yaw = s.side === "ija" ? Math.PI : 0;   // 日军面朝国军（+Z）
    }
    const Restore = probe.IsolateSquad(T, [...ija, ...nra]);
    // 玩家在日军侧前方，枪先指着地上（不指任何人），站着不动、不开枪。
    const pp = site.player;
    const Aim = (target) => {
      const eye = T.player.EyePosition.clone();
      const to = target ? new V(target.position.x, target.position.y + 1.2, target.position.z) : new V(pp.x, G(pp.x, pp.z) - 5, pp.z - 4);
      const d = to.sub(eye);
      T.player.yaw = Math.atan2(-d.x, -d.z);
      T.player.pitch = Math.atan2(d.y, Math.hypot(d.x, d.z));
      T.player.aimYaw = 0; T.player.aimPitch = 0;
    };
    probe.PlacePlayer(T, pp, "stand", 0);
    Aim(null);
    // 先让两边打起来（日军锁上国军）。
    for (let i = 0; i < 60 * 6; i += 1) { Step(1); probe.PlacePlayer(T, pp, "stand", T.player.yaw); Aim(null); T.player.health = 1e9; }
    const before = ija.map((s) => ({ id: s.id, tgt: s.target ? (s.target.isPlayer ? "player" : "ai") : null }));

    // A：指着 ija[0]（普通人，正和国军对射）8 s。
    const Watch = (s, seconds) => {
      let turnedAt = null, shotAt = null, fs0 = s.fireSequence | 0;
      for (let f = 0; f < 60 * seconds; f += 1) {
        Step(1); probe.PlacePlayer(T, pp, "stand", T.player.yaw); Aim(s); T.player.health = 1e9;
        const t = f / 60;
        if (turnedAt === null && s.target?.isPlayer) turnedAt = +t.toFixed(2);
        if (shotAt === null && s.target?.isPlayer && (s.fireSequence | 0) !== fs0) shotAt = +t.toFixed(2);
        fs0 = s.fireSequence | 0;
      }
      const d = Math.hypot(T.player.position.x - s.position.x, T.player.position.z - s.position.z);
      const tr = s.perception?.tracks?.get(-1);
      return { id: s.id, turnedAt, shotAt, alert: s.alert, tgt: s.target ? (s.target.isPlayer ? "player" : "ai") : null,
        debug: { aims: ai.PlayerAimsAt ? ai.PlayerAimsAt(s, T.player, d) : "n/a", aimedAtSince: s.aimedAtSince, now: ai.time,
          track: tr ? { aw: +tr.awareness.toFixed(2), vis: tr.visible } : null, prot: T.player.Protected, alive: T.player.Alive,
          los: ai.HasLineOfSight(s, { id: -1, isPlayer: true, ref: T.player, position: T.player.position, stance: 0 }), state: s.state, d: +d.toFixed(1) } };
    };
    const plain = Watch(ija[0], 8);
    // B：ija[2] 挂关卡禁火（非压制档），玩家指着他 8 s。
    const held = ija[2];
    let heldShots = 0;
    const heldWatch = (() => {
      let turnedAt = null, shotAt = null, fs0 = held.fireSequence | 0;
      for (let f = 0; f < 60 * 8; f += 1) {
        held.missionFireHold = true; held.missionFireSuppressOnly = false;
        Step(1); probe.PlacePlayer(T, pp, "stand", T.player.yaw); Aim(held); T.player.health = 1e9;
        const t = f / 60;
        if (turnedAt === null && held.target?.isPlayer) turnedAt = +t.toFixed(2);
        if ((held.fireSequence | 0) !== fs0 && held.target?.isPlayer) { heldShots += 1; if (shotAt === null) shotAt = +t.toFixed(2); }
        fs0 = held.fireSequence | 0;
      }
      return { id: held.id, turnedAt, shotAt, shots: heldShots };
    })();
    held.missionFireHold = false;
    // C：不指任何人时，禁火的人不开枪打玩家（禁火语义没被打穿）。
    let heldIdleShots = 0;
    {
      let fs0 = held.fireSequence | 0;
      for (let f = 0; f < 60 * 5; f += 1) {
        held.missionFireHold = true; held.missionFireSuppressOnly = false;
        Step(1); probe.PlacePlayer(T, pp, "stand", T.player.yaw); Aim(null); T.player.health = 1e9;
        if ((held.fireSequence | 0) !== fs0 && held.target?.isPlayer) heldIdleShots += 1;
        fs0 = held.fireSequence | 0;
      }
    }
    Restore();
    for (const s of [...ija, ...nra]) ai.Remove(s);
    return { site: { x: site.cx, z: site.cz }, before, plain, held: heldWatch, heldIdleShots,
      dist: +Math.hypot(pp.x - ija[0].position.x, pp.z - ija[0].position.z).toFixed(1),
      nraDist: +Math.hypot(site.nra[0].x - site.ija[0].x, site.nra[0].z - site.ija[0].z).toFixed(1) };
  });

  console.log(JSON.stringify(out, null, 1));
  assert.ok(!out.error, out.error);
  console.log(`${baseline ? "BASELINE " : ""}aimed-at: turned ${out.plain.turnedAt ?? "never"} s, first shot ${out.plain.shotAt ?? "never"} s`
    + ` | held+aimed: turned ${out.held.turnedAt ?? "never"} s, first shot ${out.held.shotAt ?? "never"} s | held not aimed: ${out.heldIdleShots} shots at player`);
  if (!baseline) {
    assert.ok(out.before.every((b) => b.tgt === "ai"), "开指之前日军都锁着国军（场景成立）");
    // 反应时间 = 被指着满 overrideLockS + Think 分帧；开枪还要过举枪、瞄准时间（被压制时更长）与换弹。
    assert.ok(out.plain.turnedAt !== null && out.plain.turnedAt <= 2, `被指着的人 2 s 内把目标换成玩家（${out.plain.turnedAt}）`);
    assert.ok(out.plain.shotAt !== null && out.plain.shotAt <= 5, `被指着的人 5 s 内对玩家开枪（${out.plain.shotAt}）`);
    assert.ok(out.held.turnedAt !== null && out.held.turnedAt <= 2, `禁火的人被指着 2 s 内转向玩家（${out.held.turnedAt}）`);
    assert.ok(out.held.shots >= 1, `禁火的人被指着 8 s 内自卫开枪（第一枪 ${out.held.shotAt} s，共 ${out.held.shots} 发）`);
    assert.equal(out.heldIdleShots, 0, "没被指着时，禁火的人不打玩家");
  }
  assert.deepEqual(errors, [], "页面无报错");
  console.log("ok aimed-at");
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
