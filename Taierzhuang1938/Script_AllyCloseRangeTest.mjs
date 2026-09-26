// 友军近距离射击回归：国军站在日军面前要打得中（CLOSE_RANGE.aiShooterSides）。
// 走真的 TryFire / Resolve / 令牌，空靶场只去掉地图遮挡；关卡的 0.22 命中折扣照挂。
// 用法：node Taierzhuang1938/Script_AllyCloseRangeTest.mjs
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { LaunchBrowser } from "../PrairieFire1937/Script_BrowserTestKit.mjs";
import { ServeRoot } from "./Script_DevServer.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const server = await ServeRoot(root, 0);
let browser;
try {
  browser = await LaunchBrowser();
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on("pageerror", e => errors.push(String(e)));
  await page.goto(`http://127.0.0.1:${server.address().port}/Taierzhuang1938/?whitebox=p012&shot=1&manual=1&quality=low`,
    { waitUntil: "domcontentloaded", timeout: 240000 });
  await page.waitForFunction(() => window.Tengxian?.state?.ready, null, { timeout: 300000 });
  const result = await page.evaluate(async () => {
    const T = window.Tengxian;
    await T.Debug.FirstLevelJump(4);
    T.state.menu = false;
    T.StepFrames(2, 1 / 60, false);
    const { WEAPONS } = await import("./Data_Weapons.mjs");
    const { Mulberry32 } = await import("./Script_Noise.mjs");
    const { TACTICS } = await import("./Data_Tuning_AiTactics.mjs");
    const ai = T.ai, player = T.player;
    const ally = ai.soldiers.find(s => s.alive && s.side === "nra" && !s.unarmed);
    const enemy = ai.soldiers.find(s => s.alive && s.side === "ija");
    if (!ally || !enemy) throw new Error("fixture needs one NRA and one IJA soldier");
    // P012 前沿守军的开火纪律（Data_FirstLevelP012Whitebox frontlineDoctrine）。
    const doctrine = 0.22;
    ai.ctx.vfx = null; ai.ctx.audio = null; ai.ctx.audioWiring = null;
    ai.aiHost.Raycast = () => null;
    ai.aiHost.BlocksSight = () => false;
    ai.ctx.battlefield.Raycast = () => null;
    player.position.set(0, 0, -400);   // 玩家离开靶场，不进射击走廊、不挨近失弹

    function Pose(s, x, z, faceX, faceZ) {
      s.position.set(x, 0, z);
      s.yaw = Math.atan2(-(faceX - x), -(faceZ - z));
      s.stance = 0; s.moveSpeed = 0; s.suppression = 0;
      s.actor.root.visible = false;
      s.coolUntil = 0; s.covertUntil = 0; s.unarmed = false;
      s.missionSurfaceRest = false; s.missionFireHold = false; s.missionFireSuppressOnly = false;
      s.scriptShelterUntil = 0; s.missionGrenadeEvade = false;
      s.weapon = WEAPONS.Type38; s.weaponId = "Type38"; s.ammo = 100000;
      s.burstLeft = 0; s.fireTimer = 0; s.aimTime = 0; s.heat = 0;
    }
    // 一个射手对一个靶子连打 seconds 秒（真实射速、真实瞄准收敛），数命中。
    function Duel(shooter, target, distance, seconds = 120) {
      ai.soldiers = [shooter, target];
      ai.tactics.Reset();
      Pose(target, 0, 0, 0, distance);
      Pose(shooter, 0, distance, 0, 0);
      shooter.scriptAccuracyScale = doctrine; shooter.scriptFireIntervalScale = 1;
      shooter.rnd = Mulberry32(13572468 + distance * 7919);
      target.alive = true; target.health = 1e9;
      let hits = 0;
      const takeHit = target.TakeHit;
      target.TakeHit = function () { hits += 1; return false; };
      shooter.target = { position: target.position, ref: target, id: target.id, isPlayer: false, stance: 0 };
      shooter.targetVisible = true; shooter.targetFromMemory = false;
      shooter.lkp = target.position.clone(); shooter.lkpConfidence = 1; shooter.targetExposedS = 0;
      ai.shooting.Detach(shooter); ai.shooting.BeginAim(shooter, target.id);
      const start = ai.time, seq = shooter.fireSequence, aimedBefore = ai.stats.aimedShots;
      let firstHitS = null;
      for (let f = 0; f < seconds * 60; f++) {
        ai.time += 1 / 60;
        target.health = 1e9; target.suppression = 0; shooter.suppression = 0;
        shooter.targetExposedS += 1 / 60;
        ai.UpdateMuzzle(shooter);
        const before = hits;
        ai.TryFire(shooter, 1 / 60, player);
        if (hits > before && firstHitS === null) firstHitS = ai.time - start;
      }
      target.TakeHit = takeHit;
      const shots = shooter.fireSequence - seq;
      return { side: shooter.side, distance, shots, aimed: ai.stats.aimedShots - aimedBefore,
        hits, rate: shots ? hits / shots : 0, firstHitS };
    }
    const out = { ally: [], enemy: [] };
    for (const d of [3, 8, 15, 25, 60]) out.ally.push(Duel(ally, enemy, d));
    // 日军打国军不在这次范围内：同样摆位，命中率应仍是远距离对射口径。
    for (const d of [3, 8]) out.enemy.push(Duel(enemy, ally, d));

    // 名额：两个 60 m 外的国军占满这个日军的名额，站在 5 m 的那个要接得过来。
    ai.soldiers = [ally, enemy];
    ai.tactics.Reset();
    Pose(enemy, 0, 0, 0, 5); Pose(ally, 0, 5, 0, 0);
    const far = [];
    for (let i = 0; i < TACTICS.maxShootersPerTarget; i++) {
      const s = { id: 9100 + i, alive: true, side: "nra", position: enemy.position.clone().set(i * 3, 0, 60) };
      far.push(s); ai.tactics.AcquireToken(enemy.id, s.id, false);
    }
    ai.soldiers = [ally, enemy, ...far];
    ally.target = { position: enemy.position, ref: enemy, id: enemy.id, isPlayer: false, stance: 0 };
    out.nearAllyToken = ai.AcquireFireToken(ally, enemy.id, player);
    out.tokenCount = ai.tactics.TokenCount(enemy.id);
    out.tokenCap = TACTICS.maxShootersPerTarget;
    // 反过来：60 m 外的国军不许抢 5 m 那个人的名额。
    ai.tactics.Reset();
    ai.tactics.AcquireToken(enemy.id, ally.id, false);
    ai.tactics.AcquireToken(enemy.id, 9200, false);
    const farAlly = { id: 9300, side: "nra", position: enemy.position.clone().set(0, 0, 60),
      target: { position: enemy.position, ref: enemy, id: enemy.id, isPlayer: false } };
    ai.soldiers = [ally, enemy, farAlly, { id: 9200, alive: true, side: "nra", position: enemy.position.clone().set(0, 0, 50) }];
    out.farAllySteals = ai.AcquireFireToken(farAlly, enemy.id, player);
    return out;
  });
  console.log(JSON.stringify(result, null, 2));
  assert.deepEqual(errors, []);
  const row = (list, d) => list.find(r => r.distance === d);
  for (const d of [3, 8]) {
    const r = row(result.ally, d);
    assert.ok(r.shots >= 40, `ally ${d} m should keep firing: ${r.shots}`);
    assert.ok(r.rate >= 0.6, `ally at ${d} m must hit a standing enemy: ${r.rate}`);
    assert.ok(r.firstHitS !== null && r.firstHitS < 4, `ally at ${d} m first hit too slow: ${r.firstHitS}`);
  }
  assert.ok(row(result.ally, 15).rate >= 0.45, `ally at 15 m: ${row(result.ally, 15).rate}`);
  assert.ok(row(result.ally, 60).rate < 0.1, `60 m keeps the campaign crossfire balance: ${row(result.ally, 60).rate}`);
  for (const r of result.enemy) assert.ok(r.rate < 0.2, `IJA → NRA unchanged at ${r.distance} m: ${r.rate}`);
  assert.equal(result.nearAllyToken, true, "close ally takes over a token from a distant holder");
  assert.equal(result.tokenCount, result.tokenCap, "takeover never raises simultaneous shooters");
  assert.equal(result.farAllySteals, false, "distant ally must not steal a close holder's token");
  console.log("AllyCloseRangeTest OK");
} finally {
  await browser?.close();
  server.close();
}
