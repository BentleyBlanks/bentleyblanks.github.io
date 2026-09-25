// ===========================================================================
// Script_FirstLevelRearDoorWalkTest.mjs —— 罗班长过阵位后门坡道不再被「走不过去就跳点」推着走
//
// 2026-09-25 接力第二批 Front 包 Step 2 ①。后门 (29.7,−145.6) 两侧的路线拐点只认 0.25 m（FrontBattle.Walk）；
// 罗班长在 FIRE 里时，换位命令留下的 0.6 m 到位半径曾经被 Script_Ai.Act 拿来判「到了」，人停在拐点前 0.58 m，
// 等换位超时或 walkStallS 跳点（实测 16 趟 05→06 里 4 趟停 4–6 s，冷启动一趟连跳 3 个点）。
// 这里在真实页面里让罗班长把两条过坡道的腿各走 N 趟（04「rear」北上、05→06「gapWatch」南下），
// 远处的敌人留着（他会开火、会触发换位），阵位 18 m 内的敌人清掉；再在坡下炸一个弹坑重走一遍。
// 断言：每趟都走到、兜底跳点 0 次、没有一次原地停 ≥ HOLD_LIMIT_S（旧毛病停 4–6 s；换位、躲弹的正常停顿不到 1 s）。
//
// 跑法：node Taierzhuang1938/Script_FirstLevelRearDoorWalkTest.mjs [--trials=4]
// ===========================================================================
import assert from "node:assert/strict";
import { OpenCampaign, CloseCampaign } from "./Script_FirstLevelCampaignKit.mjs";
import { FRONT_BATTLE_TUNING as B } from "./Data_Tuning_FirstLevelFront.mjs";
import { FRONT_SORTIE as S, FRONT_SPACE as Space } from "./Data_FirstLevelFrontRoute.mjs";
import { MISSION_STAGE_ROUTES } from "./Data_FirstLevelMissionTopology.mjs";

const HOLD_LIMIT_S = 2;
const trials = Number(process.argv.find((a) => a.startsWith("--trials="))?.split("=")[1] ?? 4);
// The two legs FrontBattle gives Luo across the ramp (UpdatePressure "rear", UpdateSortie "gapWatch").
const back = MISSION_STAGE_ROUTES.collectionReturn;
const legs = [
  { id: "rear", route: S.rearRoute.slice(1), player: { x: 31.2, z: -139.6 },
    starts: [[24.75, -151.1], [26.6, -151.4], [27.6, -150.6], [25.9, -152.6]] },
  { id: "gapWatch", route: [...back.slice(0, back.findIndex((p) => Math.hypot(p.x - Space.westDoor.x, p.z - Space.westDoor.z) < .5) + 1)],
    player: { x: 23.6, z: -151.4 }, starts: [[29.9, -141.4], [30.6, -140.6], [29.2, -142.0], [31.0, -141.9]] },
];
assert.ok(legs.every((l) => l.route.some((p) => Math.hypot(p.x - Space.rearDoor.x, p.z - Space.rearDoor.z) < .2)), "both legs cross the rear door");
const ctx = await OpenCampaign({ suite: "RearDoorWalk", stageFrom: 3, stageTo: 6, quality: "low" });
const runs = [];
try {
  await ctx.page.evaluate(() => { const g = window.Tengxian; for (let i = 0; i < 60 && g.state.cutscene; i++) g.StepFrames(120, 1 / 60, false); });
  for (const crater of [null, { x: 27, z: -150 }]) {
    if (crater) await ctx.page.evaluate((c) => { const g = window.Tengxian, Bf = g.battlefield;
      Bf.deformation.ApplyBlast({ x: c.x, y: Bf.GroundHeight(c.x, c.z), z: c.z }, "grenade"); g.StepFrames(5, 1 / 60, false); }, crater);
    runs.push(...await ctx.page.evaluate(({ legs, trials, stallS, crater }) => {
      const g = window.Tengxian, r = g.Debug.FirstLevelMissionRuntime(), fb = r.frontBattle, p = g.player, Bf = g.battlefield;
      const luo = fb.Leader, out = [];
      p.debug.invincible = true;
      for (const leg of legs) for (let t = 0; t < trials; t++) {
        for (const s of [...g.ai.soldiers]) if (s.side === "ija" && s.alive && Math.hypot(s.position.x - 28, s.position.z - 147) < 18) g.ai.Remove(s);
        const [sx, sz] = leg.starts[t % leg.starts.length], sy = Bf.GroundHeight(sx, sz);
        p.position.set(leg.player.x, Bf.GroundHeight(leg.player.x, leg.player.z), leg.player.z);
        p.body?.Teleport(p.position.x, p.position.y, p.position.z);
        luo.position.set(sx, sy, sz); luo.body?.Teleport(sx, sy, sz); luo.velocityY = 0;
        fb.leg = null; fb.stalls.length = 0; fb.SetLeg(`${leg.id}#${t}`, leg.route);
        const end = leg.route.at(-1);
        let f = 0, reached = false, still = 0, longestStill = 0, lastX = sx, lastZ = sz, fired = 0;
        for (; f < 60 * 40; f++) {
          g.StepFrames(1, 1 / 60, false);
          const moved = Math.hypot(luo.position.x - lastX, luo.position.z - lastZ);
          lastX = luo.position.x; lastZ = luo.position.z;
          still = moved < .004 ? still + 1 / 60 : 0; longestStill = Math.max(longestStill, still);
          if (luo.state === "fire" || luo.state === "suppress") fired++;
          const w = fb.walks.get(luo.id);
          if (Math.hypot(luo.position.x - end.x, luo.position.z - end.z) < 1 || (w && w.index >= w.route.length)) { reached = true; break; }
        }
        out.push({ crater: !!crater, leg: leg.id, trial: t, start: [sx, sz], reached, seconds: +(f / 60).toFixed(1), stalls: fb.stalls.slice(),
          longestStillS: +longestStill.toFixed(2), combatFrames: fired, end: [+luo.position.x.toFixed(2), +luo.position.z.toFixed(2)] });
      }
      return out;
    }, { legs, trials, stallS: B.walkStallS, crater }));
  }
} finally {
  for (const run of runs) console.log(JSON.stringify(run));
  await CloseCampaign(ctx);
}
assert.deepEqual(ctx.errors, [], "no page errors");
assert.equal(runs.length, legs.length * trials * 2);
for (const run of runs) {
  const tag = `${run.crater ? "crater " : ""}${run.leg}#${run.trial}`;
  assert.ok(run.reached, `${tag}: Luo reaches the end of the leg (ended at ${run.end})`);
  assert.deepEqual(run.stalls, [], `${tag}: no walk-stall skip on the rear-door ramp`);
  assert.ok(run.longestStillS < HOLD_LIMIT_S, `${tag}: never held in place ${HOLD_LIMIT_S} s (${run.longestStillS} s)`);
}
const combat = runs.filter((r) => r.combatFrames > 0).length;
console.log(`FirstLevelRearDoorWalkTest 通过：${runs.length} 趟过后门坡道，0 次跳点，${combat} 趟途中开过火；最长原地 ${Math.max(...runs.map((r) => r.longestStillS))} s`);
