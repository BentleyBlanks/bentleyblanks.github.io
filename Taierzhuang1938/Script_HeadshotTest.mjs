// 爆头的真浏览器闸门（2026-09-13「爆头不秒杀、飙血不够显著」）。口径：docs/Data_BloodEffects.md「爆头」节、
// docs/Data_ActorCrowdLod.md §7。在断肢测试场（?gore=1）上跑：
//   1  10 m 真开枪打头：判 head、一枪死、爆头血（出口血雾 + 血滴 + 伤口泵血源）真的出来了
//   2  减过伤的子弹打头照样死；刀砍头不走这条（部位是刀自己判的）
//   3  远景层（46 m 外）的人跪下之后：骨架冻在站姿，命中体跟着画出来的跪姿桶走，
//      真开枪打跪姿的头判 head、一枪死
// 截图落 _shots/Headshot。
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { LaunchBrowser } from "../PrairieFire1937/Script_BrowserTestKit.mjs";
import { ServeRoot } from "./Script_DevServer.mjs";

const project = path.dirname(fileURLToPath(import.meta.url));
const shots = path.join(project, "_shots", "Headshot");
const server = await ServeRoot(path.resolve(project, ".."), 0);
const browser = await LaunchBrowser();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => {
  if (m.type() === "error" && !/fonts|ERR_BLOCKED_BY_CLIENT/.test(m.text())) errors.push(m.text());
});

const HELPERS = `
  window.__hs = {
    Step: (frames, render = false) => Taierzhuang.StepFrames(frames, 1 / 60, render),
    Soldier: (postId) => {
      const post = Taierzhuang.Debug.GoreRange.State().posts.find((entry) => entry.id === postId);
      return Taierzhuang.ai.soldiers.find((s) => s.id === post?.runtimeId) || null;
    },
    Head: (soldier) => soldier.actor.GetBoneHitboxes().find((shape) => shape.id === "head"),
    AimAtPoint: (point) => {
      const p = Taierzhuang.player;
      const dx = point.x - p.position.x, dz = point.z - p.position.z;
      const dy = point.y - (p.position.y + p.eyeHeight);
      p.yaw = Math.atan2(-dx, -dz);
      p.pitch = Math.atan2(dy, Math.hypot(dx, dz));
    },
    Fire: () => {
      Taierzhuang.Debug.Mouse(0, true); window.__hs.Step(2); Taierzhuang.Debug.Mouse(0, false);
    },
  };
`;

try {
  await page.route(/^https:\/\/fonts\.(googleapis|gstatic)\.com\//, (route) => route.abort("blockedbyclient"));
  await page.goto(`http://127.0.0.1:${server.address().port}/Taierzhuang1938/`
    + "?gore=1&shot=1&manual=1&quality=medium&scale=small", { waitUntil: "load", timeout: 180000 });
  await page.waitForFunction(() => window.Taierzhuang?.state?.ready && window.Taierzhuang?.state?.running
    && window.Taierzhuang?.Debug?.GoreRange, null, { timeout: 180000 });
  await page.evaluate(HELPERS);
  fs.mkdirSync(shots, { recursive: true });

  // 1. 近处真开枪打头
  const near = await page.evaluate(() => {
    const T = Taierzhuang, G = T.Debug.GoreRange, H = window.__hs;
    G.Reset(); H.Step(20);
    const soldier = H.Soldier("L10_1");
    T.player.Spawn(soldier.position.x, soldier.position.z + 9, 0); H.Step(10);
    T.Debug.Mouse(2, true); H.Step(45);
    H.AimAtPoint(H.Head(soldier).center); H.Step(8);
    const blood = T.vfx.bloodEffects;
    const before = { headshots: blood.stats.headshots || 0, sources: blood.sources.size, emitted: blood.stats.emitted };
    H.Fire();
    const after = { health: soldier.health, alive: soldier.alive, shape: T.state.lastShot?.hitShape,
      headshots: blood.stats.headshots || 0, sources: blood.sources.size, emitted: blood.stats.emitted,
      mistLive: 0 };
    H.Step(4, true);
    return { before, after };
  });
  console.log("NEAR", JSON.stringify(near));
  assert.equal(near.after.shape, "head", "10 m 瞄头心应判 head");
  assert.equal(near.after.alive, false, "爆头必须一枪死");
  assert.equal(near.after.headshots, near.before.headshots + 1, "爆头要走 Headshot 血效");
  assert(near.after.emitted - near.before.emitted >= 20, `爆头血滴太少：${near.after.emitted - near.before.emitted}`);
  assert(near.after.sources > near.before.sources, "爆头要挂伤口泵血源");
  await page.screenshot({ path: path.join(shots, "Scene_NearHeadshot.png") });
  await page.evaluate(() => { window.__hs.Step(20, true); });
  await page.screenshot({ path: path.join(shots, "Scene_NearHeadshotSettled.png") });
  await page.evaluate(() => { Taierzhuang.Debug.Mouse(2, false); window.__hs.Step(4); });
  console.log("PASS 1 近处真开枪爆头：判 head、一枪死、出口血雾/血滴/伤口泵血都出来了");

  // 2. 减伤子弹打头照样死；刀不走这条
  const rule = await page.evaluate(() => {
    const T = Taierzhuang, G = T.Debug.GoreRange, H = window.__hs;
    G.Reset(); H.Step(20);
    const a = H.Soldier("L10_2"), b = H.Soldier("L10_3"), c = H.Soldier("L10_4");
    const dir = a.position.clone().set(0, 0, -1);
    a.TakeHit(8, "head", dir, { kind: "bullet" });
    b.TakeHit(8, "head", dir, { kind: "hmg" });
    c.TakeHit(8, "head", dir, { kind: "blade", mode: "slash" });
    return { bullet: a.alive, hmg: b.alive, blade: c.alive, bladeHealth: c.health };
  });
  console.log("RULE", JSON.stringify(rule));
  assert.equal(rule.bullet, false, "8 点伤害的步枪弹打头也要死");
  assert.equal(rule.hmg, false, "机枪弹打头也要死");
  assert.equal(rule.blade, true, "刀砍头 8 点不该按爆头处死");
  console.log("PASS 2 子弹/机枪弹打头与伤害数无关必死；刀不走爆头规则");

  // 3. 远景层：人跪下之后按画出来的跪姿判
  const far = await page.evaluate(() => {
    const T = Taierzhuang, G = T.Debug.GoreRange, H = window.__hs;
    G.Reset(); H.Step(20);
    const soldier = H.Soldier("L25_5");
    // 站着进远景：退到沙盒西南角（约 59 m，沙盒边界把人限在木桩 ±39 m 内），
    // 先转身对着他（屏外的人走 culled，不进远景层），让骨架冻在站姿
    T.player.Spawn(soldier.position.x - 60, soldier.position.z + 60, 0); H.Step(10);
    H.AimAtPoint(H.Head(soldier).center); H.Step(20);
    const lodStanding = soldier.renderLod;
    const playerDistance = Math.hypot(T.player.position.x - soldier.position.x, T.player.position.z - soldier.position.z);
    soldier.stance = 1; soldier.crouchBlend = 1;
    H.Step(20);
    const bucketHead = H.Head(soldier).center.clone();
    const rigHead = soldier.actor.characterRig.GetHitboxes().find((shape) => shape.id === "head").center.clone();
    T.Debug.Mouse(2, true); H.Step(45);
    H.AimAtPoint(bucketHead); H.Step(8);
    H.Fire(); H.Step(2);
    const result = { lodStanding, playerDistance, lod: soldier.renderLod, bucketHeadY: bucketHead.y - soldier.position.y,
      frozenRigHeadY: rigHead.y - soldier.position.y, alive: soldier.alive, health: soldier.health,
      shape: T.state.lastShot?.hitShape, kind: T.state.lastShot?.hitKind, dist: T.state.lastShot?.dist };
    T.Debug.Mouse(2, false); H.Step(4);
    return result;
  });
  console.log("FAR", JSON.stringify(far));
  assert.equal(far.lodStanding, "crowd", `${far.playerDistance} m 外应在远景层`);
  assert.equal(far.lod, "crowd", "跪下之后仍在远景层");
  assert(far.frozenRigHeadY - far.bucketHeadY > 0.3,
    `前提：冻住的骨架头应比跪姿桶的头高一截（骨架 ${far.frozenRigHeadY} / 桶 ${far.bucketHeadY}）`);
  assert.equal(far.shape, "head", "打远景跪姿兵看得见的头应判 head");
  assert.equal(far.alive, false, "远景跪姿兵爆头必须一枪死");
  console.log("PASS 3 远景跪姿兵：命中体跟着跪姿桶走，打头判 head、一枪死");

  assert.deepEqual(errors, [], "页面不许报错");
  console.log("HeadshotTest OK");
} finally {
  await browser.close();
  server.close();
}
