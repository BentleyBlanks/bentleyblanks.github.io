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
// 2026-09-26 审查修复：躲手榴弹之后回得去（FrontBattle.Walk 的躲弹原路退回 EvadeReturn）。
//   · rearDodge：罗班长在西门内掩体上，身边落一颗（测试造的、落地前收走、不炸）日军手榴弹，他躲开后仍要走完 04 的
//     「rear」腿、跳点 0 次（审查 rv36a：躲到西门外 10 m，直线往回撞阵位西外墙，跳点两次，BundleOrder 隔墙说）。
//   · leftSeat：04 何有田在左枪座上，身后落一颗；躲开后 RETURN_LIMIT_S 内回到座位 leftGunManM 以内并留在那里
//     （审查 HeWhy：绕到枪托沙袋敌方一侧，离座 1.31–1.44 m 永远回不去，两挺捷克式同框）。再把他直接挪到沙袋
//     敌方一侧（没有躲弹轨迹），走不过去时兜底要绕路（PostDetour）回座，不许原地认定「到了」。
//
// 跑法：node Taierzhuang1938/Script_FirstLevelRearDoorWalkTest.mjs [--trials=4]
// ===========================================================================
import assert from "node:assert/strict";
import { OpenCampaign, CloseCampaign } from "./Script_FirstLevelCampaignKit.mjs";
import { FRONT_BATTLE_TUNING as B } from "./Data_Tuning_FirstLevelFront.mjs";
import { FRONT_SORTIE as S, FRONT_SPACE as Space } from "./Data_FirstLevelFrontRoute.mjs";
import { MISSION_STAGE_ROUTES } from "./Data_FirstLevelMissionTopology.mjs";

const HOLD_LIMIT_S = 2;
const RETURN_LIMIT_S = 12;
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
const runs = [], seatRuns = [];
// A Japanese grenade that never goes off: in combat.projectiles (the AI's threat scan and RespondToGrenade see it),
// taken back out before its fuse runs down (Defuse).
const GRENADE_KIT = `
  const Drop=(g,r,W,x,z)=>{const Bf=g.battlefield,p={alive:true,fuse:2.4,age:0,spin:0,owner:"ija",weapon:W.Grenade,
    position:g.player.position.clone().set(x,Bf.GroundHeight(x,z)+.05,z),velocity:g.player.position.clone().set(0,0,0)};
    r.combat.projectiles.push(p);return p;};
  const Defuse=(r,p)=>{if(p.alive&&p.fuse<.25){p.alive=false;const i=r.combat.projectiles.indexOf(p);if(i>=0)r.combat.projectiles.splice(i,1);}};`;
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
  // rearDodge: Luo dodges a grenade at his cover as the rear leg begins, then walks it.
  runs.push(...await ctx.page.evaluate(async ({ leg, trials, kit }) => {
    const { WEAPONS } = await import("./Data_Weapons.mjs");
    const { Drop, Defuse } = new Function(kit + "return {Drop,Defuse};")();
    const g = window.Tengxian, r = g.Debug.FirstLevelMissionRuntime(), fb = r.frontBattle, p = g.player, Bf = g.battlefield;
    const luo = fb.Leader, out = [];
    for (let t = 0; t < trials; t++) {
      for (const s of [...g.ai.soldiers]) if (s.side === "ija" && s.alive && Math.hypot(s.position.x - 28, s.position.z - 147) < 18) g.ai.Remove(s);
      const [sx, sz] = [24.75, -151.1], sy = Bf.GroundHeight(sx, sz);
      p.position.set(leg.player.x, Bf.GroundHeight(leg.player.x, leg.player.z), leg.player.z); p.body?.Teleport(p.position.x, p.position.y, p.position.z);
      luo.position.set(sx, sy, sz); luo.body?.Teleport(sx, sy, sz); luo.velocityY = 0; luo.missionGrenadeReplanAt = 0;
      fb.leg = null; fb.stalls.length = 0; fb.evadeReturns.length = 0; fb.SetLeg(`rearDodge#${t}`, leg.route);
      const nade = Drop(g, r, WEAPONS, sx + 1.0 + .3 * (t % 2), sz - .6 + .4 * t);
      const end = leg.route.at(-1);
      let f = 0, reached = false, dodged = false, farthest = 0;
      for (; f < 60 * 40; f++) {
        g.StepFrames(1, 1 / 60, false); Defuse(r, nade);
        dodged ||= !!luo.missionGrenadeEvade; farthest = Math.max(farthest, Math.hypot(luo.position.x - sx, luo.position.z - sz));
        const w = fb.walks.get(luo.id);
        if (!nade.alive && (Math.hypot(luo.position.x - end.x, luo.position.z - end.z) < 1 || (w && w.index >= w.route.length))) { reached = true; break; }
      }
      Defuse(r, Object.assign(nade, { fuse: 0 }));
      out.push({ crater: false, leg: "rearDodge", trial: t, start: [sx, sz], reached, dodged, dodgeM: +farthest.toFixed(1), seconds: +(f / 60).toFixed(1),
        stalls: fb.stalls.slice(), evadeReturns: fb.evadeReturns.slice(), longestStillS: 0, end: [+luo.position.x.toFixed(2), +luo.position.z.toFixed(2)] });
    }
    return out;
  }, { leg: legs[0], trials: Math.max(3, Math.ceil(trials / 2)), kit: GRENADE_KIT }));
  // leftSeat: 04, He mans the left gun; a grenade lands behind him in the pit.
  await ctx.page.evaluate(async () => { await window.Tengxian.Debug.FirstLevelJump(4); });
  seatRuns.push(...await ctx.page.evaluate(async ({ trials, kit, manM, limitS }) => {
    const { WEAPONS } = await import("./Data_Weapons.mjs");
    const { Drop, Defuse } = new Function(kit + "return {Drop,Defuse};")();
    const g = window.Tengxian, r = g.Debug.FirstLevelMissionRuntime(), p = g.player, Bf = g.battlefield;
    for (let i = 0; i < 60 && g.state.cutscene; i++) g.StepFrames(120, 1 / 60, false);
    p.debug.invincible = true;
    p.position.set(-31, Bf.GroundHeight(-31, -140), -140); p.body?.Teleport(p.position.x, p.position.y, p.position.z);
    const gun = r.emplacement.guns.get(r.leftGunId), he = r.companion.Handle("heyoutian"), out = [];
    const D = () => Math.hypot(he.position.x - gun.seat.x, he.position.z - gun.seat.z);
    const offsets = [[0, 1.0], [.45, .9], [-.45, .9], [0, .7]];
    for (let t = 0; t < trials; t++) {
      for (let k = 0; k < 60 * 10 && D() > manM; k++) g.StepFrames(1, 1 / 60, false);
      const before = +D().toFixed(2), [ox, oz] = offsets[t % offsets.length];
      he.missionGrenadeReplanAt = 0;
      const nade = Drop(g, r, WEAPONS, gun.seat.x + ox, gun.seat.z + oz);
      let f = 0, farthest = 0, after = null, back = null;
      for (; f < 60 * (limitS + 6); f++) {
        g.StepFrames(1, 1 / 60, false); Defuse(r, nade);
        const d = D(); farthest = Math.max(farthest, d);
        if (!nade.alive && after == null) after = f;
        if (after != null && back == null && d <= manM) back = f;
        if (back != null && f - back > 120) break;
      }
      Defuse(r, Object.assign(nade, { fuse: 0 }));
      const w = r.frontBattle.walks.get(he.id);
      out.push({ trial: t, before, dodgeM: +farthest.toFixed(2), returnS: back == null ? null : +((back - after) / 60).toFixed(1), endM: +D().toFixed(2),
        at: [+he.position.x.toFixed(2), +he.position.z.toFixed(2)], stallAccepted: !!w?.stallAccepted, gunner: gun.npc === he, zb26: he.weaponId === gun.kind.weaponId,
        evadeReturns: r.frontBattle.evadeReturns.filter((e) => e.id === "heyoutian").length });
    }
    // Shoved to LeftGunRest's enemy face (no dodge trail): straight back runs into the rest; the stall fallback must
    // find the way round (PostDetour) instead of accepting the spot (09-26 fix drive fx36a: 16 s there).
    for (let k = 0; k < 60 * 10 && D() > manM; k++) g.StepFrames(1, 1 / 60, false);
    const sx = gun.seat.x, sz = gun.seat.z - 1.35, sy = Bf.GroundHeight(sx, sz);
    he.position.set(sx, sy, sz); he.body?.Teleport?.(sx, sy, sz); he.velocityY = 0;
    let f = 0, back = null;
    for (; f < 60 * (limitS + 6); f++) {
      g.StepFrames(1, 1 / 60, false);
      if (back == null && D() <= manM) back = f;
      if (back != null && f - back > 120) break;
    }
    const w = r.frontBattle.walks.get(he.id);
    out.push({ trial: "shoved", before: 1.35, dodgeM: 1.35, returnS: back == null ? null : +(back / 60).toFixed(1), endM: +D().toFixed(2),
      at: [+he.position.x.toFixed(2), +he.position.z.toFixed(2)], stallAccepted: !!w?.stallAccepted, gunner: gun.npc === he, zb26: he.weaponId === gun.kind.weaponId,
      detours: r.frontBattle.detours.filter((e) => e.id === "heyoutian") });
    return out;
  }, { trials: 4, kit: GRENADE_KIT, manM: B.leftGunManM, limitS: RETURN_LIMIT_S }));
} finally {
  for (const run of runs) console.log(JSON.stringify(run));
  for (const run of seatRuns) console.log("LEFT_SEAT", JSON.stringify(run));
  await CloseCampaign(ctx);
}
assert.deepEqual(ctx.errors, [], "no page errors");
assert.equal(runs.filter((r) => r.leg !== "rearDodge").length, legs.length * trials * 2);
const dodges = runs.filter((r) => r.leg === "rearDodge");
assert.ok(dodges.length >= 3 && dodges.every((r) => r.dodged), `Luo dodged the grenade at his cover in every rearDodge trial (${dodges.map((r) => r.dodgeM)})`);
assert.ok(seatRuns.length >= 3, "left-seat dodge trials ran");
for (const s of seatRuns) {
  assert.ok(s.dodgeM > 1, `left seat #${s.trial}: He really left the seat for the grenade (${s.dodgeM} m)`);
  assert.ok(s.returnS != null && s.returnS <= RETURN_LIMIT_S, `left seat #${s.trial}: back within ${B.leftGunManM} m of the seat in ${RETURN_LIMIT_S} s (${s.returnS} s, ended ${s.endM} m at ${s.at})`);
  assert.ok(s.endM <= B.leftGunManM && !s.stallAccepted && s.gunner && s.zb26, `left seat #${s.trial}: stays on the seat with the ZB26, no stall acceptance (${JSON.stringify(s)})`);
}
for (const run of runs) {
  const tag = `${run.crater ? "crater " : ""}${run.leg}#${run.trial}`;
  assert.ok(run.reached, `${tag}: Luo reaches the end of the leg (ended at ${run.end})`);
  assert.deepEqual(run.stalls, [], `${tag}: no walk-stall skip on the rear-door ramp`);
  assert.ok(run.longestStillS < HOLD_LIMIT_S, `${tag}: never held in place ${HOLD_LIMIT_S} s (${run.longestStillS} s)`);
}
const combat = runs.filter((r) => r.combatFrames > 0).length;
console.log(`FirstLevelRearDoorWalkTest 通过：${runs.length} 趟过后门坡道（含 ${dodges.length} 趟先躲手榴弹），0 次跳点，${combat} 趟途中开过火；最长原地 ${Math.max(...runs.map((r) => r.longestStillS))} s；`
  + `何有田躲弹后回座 ${seatRuns.map((s) => s.returnS).join("/")} s`);
