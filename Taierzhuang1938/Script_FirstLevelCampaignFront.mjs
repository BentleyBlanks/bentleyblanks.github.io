// 第一关整关驾驶脚本 · 阶段 1–7（受困 → 救援 → 支援 → 机枪 → 战车 → 接令 → 南行）。
// 归第二波 Front 包；公共部分在 Script_FirstLevelCampaignKit.mjs。
//
// 口径：全程只用正常输入（WASD / F / 鼠标 / H），不改任务事实、不瞬移、不发子弹外挂。
// 调试跳转只在 --stage-jumps 下生效，且每次跳转前上一段必须真的走到了下一个公开阶段。
import { DriveFrontBattle } from "./Script_FirstLevelCampaignFrontBattle.mjs";
import { DriveOpening, CheckOpeningActing, CheckFrontActing } from "./Script_FirstLevelCampaignOpening.mjs";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { MISSION_ROUTES as Routes, MISSION_ANCHORS as A, MISSION_PLACEMENT as P } from "./Data_FirstLevelMissionLayout.mjs";
import { MISSION_STAGE_ROUTES } from "./Data_FirstLevelMissionTopology.mjs";
import { DriveBundleThrow } from "./Script_FirstLevelBundleThrowDriver.mjs";
import { MISSION_TUNING as R } from "./Data_FirstLevelMission.mjs";
import { FRONT_TUNING as F } from "./Data_Tuning_FirstLevelFront.mjs";
import { CampaignActions } from "./Script_FirstLevelCampaignKit.mjs";

/** 推 n 秒实时模拟（不渲染），期间不按任何键。 */
const Idle = (page, seconds) =>
  page.evaluate((s) => window.Tengxian.StepFrames(Math.ceil(s * 60), 1 / 60, false), seconds);

/** 阶段 1–7。前置：ctx 已经开好页、装好输入驱动器。 */
export async function Drive(ctx) {
  const { page, output } = ctx;
  const { JumpStage, Capture, CaptureFocus, WaitOutCutscene, Route, Interact, WaitStage } = CampaignActions(ctx);
  const shots = path.join(output, "..", "L1Front");
  await fs.mkdir(shots, { recursive: true });

  /**
   * 取证照：把视线转到某处、渲一帧、拍一张存进 `_shots/L1Front`，再把视角还回去。
   * 与 Kit 的 `CaptureFocus` 分工：那一只是带预算断言的正式取样，这一只只管「看得见」。
   */
  async function LookShot(name, point) {
    const view = await page.evaluate((point) => {
      const g = window.Tengxian, p = g.player.position, eye = g.player.EyePosition;
      const previous = { yaw: g.player.yaw, pitch: g.player.pitch };
      g.player.yaw = Math.atan2(p.x - point.x, p.z - point.z);
      g.player.pitch = Math.atan2(g.battlefield.GroundHeight(point.x, point.z) + (point.height ?? 1.2) - eye.y,
        Math.hypot(p.x - point.x, p.z - point.z));
      g.StepFrames(4, 1 / 60, true);
      return previous;
    }, { x: point.x, z: point.z, height: point.height ?? 1.2 });
    await page.screenshot({ path: path.join(shots, `Scene_${name}.png`) });
    await page.evaluate((view) => Object.assign(window.Tengxian.player, view), view);
  }

  if(ctx.stageFrom===1)await DriveOpening(ctx);
  // --stage-to=2: 01–02 through the collection hand-over only (03 is the front battle's).
  if(ctx.stageTo===2){await CheckOpeningActing(ctx);return;}
  // 03–05 (and the 04 / 05 checkpoints) are one continuous driver.
  if(ctx.stageFrom<=5)await DriveFrontBattle(ctx);
  if(ctx.stageFrom===1)await CheckOpeningActing(ctx);
  if(ctx.stageTo===3)return;

  // =========================================================================
  // 06 回到伤员集结处，接下后送（含借火戏）
  // =========================================================================
  await JumpStage(6);
  await Route([A.collection], "CollectionReturn",
    { fight: true, stance: "crouch", crawl: true, rejoinRoute: MISSION_STAGE_ROUTES.collectionReturn });
  // 2026-09-20 演出打磨：借火不再随 ordersReached 自动开播 —— Notion 06 是老周
  // 「看见顺子经过」才开口。像玩家一样走到他跟前站定、脸朝着他。
  await Route([{ x: P.collection.borrowStand.x, z: P.collection.borrowStand.z }], "BorrowStand",
    { fight: false, stance: "stand", arrivalM: 0.2 });
  await page.evaluate((zhou) => {
    const g = window.Tengxian, p = g.player.position;
    g.player.yaw = Math.atan2(p.x - zhou.x, p.z - zhou.z);
    g.player.pitch = 0;
    g.StepFrames(6, 1 / 60, false);
  }, { x: P.collection.zhouWall.x, z: P.collection.zhouWall.z });
  const borrowStand = await page.evaluate(() => {
    const g = window.Tengxian, m = g.Debug.FirstLevelMission();
    const zhou = m.column.litters.find((litter) => litter.zhou);
    if (!zhou) throw new Error("Zhou's litter is missing from the mission snapshot");
    return { player: { x: +g.player.position.x.toFixed(2), z: +g.player.position.z.toFixed(2) },
      zhou: { x: +zhou.x.toFixed(2), z: +zhou.z.toFixed(2) },
      facts: m.facts, borrow: m.front.collection.borrow, said: m.voice.played };
  });
  console.log("BORROW_STAND", JSON.stringify(borrowStand));
  assert.ok(Math.hypot(borrowStand.player.x - borrowStand.zhou.x,
    borrowStand.player.z - borrowStand.zhou.z) <= F.borrowTriggerM,
  "玩家真的走到了老周跟前：" + JSON.stringify(borrowStand));
  // 分段推：借火那一拍要在演的时候拍，等整段走完老周已经上担架抬走了。
  let orders = null;
  for (let chunk = 0; chunk < 60; chunk++) {
    orders = await page.evaluate(() => {
      const g = window.Tengxian;
      for (let i = 0; i < 150 && g.Debug.FirstLevelMissionRuntime().flow.stage.id === "Orders"; i++) {
        if (g.player.bleeding && g.player.health < 85) g.Debug.Key("KeyB");
        g.StepFrames(1, 1 / 60, false);
      }
      const m = g.Debug.FirstLevelMission();
      return { stage: m.stage, facts: m.facts, played: m.voice.played, front: m.front, column: m.column };
    });
    if (orders.front.collection.borrow.includes("light") && !ctx.capturedActivities.has("BorrowLight")) {
      ctx.capturedActivities.add("BorrowLight");
      await LookShot("BorrowLight", { ...P.collection.zhouWall, height: 0.9 });
    }
    if (orders.stage !== "Orders") break;
  }
  console.log("ORDERS", JSON.stringify({ stage: orders.stage, borrow: orders.front.collection.borrow }));
  if (!ctx.capturedActivities.has("BorrowLight")) await LookShot("BorrowLight", { ...P.collection.zhouWall, height: 0.9 });
  for (const fact of ["ordersReached", "volunteerHeard", "lightShared", "zhouOnLitter", "columnDeparted"])
    assert.ok(orders.facts.includes(fact), `06 记下了 ${fact}`);
  assert.deepEqual(orders.front.collection.borrow, ["ask", "pat", "pocket", "offer", "light", "share", "wince"],
    "借火戏七个姿态按 BorrowLight 的句子与两处动作空当逐个对上：" + JSON.stringify(orders.front.collection.borrow));
  assert.ok(orders.front.collection.borrowSaid, "借火是走到老周跟前触发的（不是进 06 就自动排队）");
  assert.ok(orders.front.collection.zhouLifted, "担架员真的把老周抬上了担架");
  assert.ok(orders.front.collection.zhouLiftComplete, "06 完整起架后才准许后送队离开");
  assert.notEqual(orders.column.litters.find(litter => litter.zhou)?.state, "fallen",
    "老周进入07时已由正常担架队列接管，不留在集结处");
  assert.ok(orders.front.collection.runner, "传令兵在集结处");
  assert.equal(orders.stage, "South", "后送队起行把 06 推到 07");
  console.log("ok 06 orders: volunteered, matches pocketed, cigarette offered and lit, Zhou on the litter, column away");

  // =========================================================================
  // 07 沿沟南行：真走 135 m，目标时长 45–75 秒。
  // =========================================================================
  // 04–06 lines: speaker in the picture and acted (Front r2 step 1; the sampler is installed from 03 on).
  if(ctx.stageFrom<=3)await CheckFrontActing(ctx,{upTo:"Orders"});
  if(ctx.stageTo===6)return;
  // 07 on is driven as before (the reflexes were tuned and measured on 03–06 only).
  // Let go of any key a reflex was holding when 06 ended (③ back-off holds S, ⑤ step-in holds W; with the reflexes
  // off CloseThreat returns before the lines that would release them), so 07 starts exactly like the old driver.
  await page.evaluate(() => { const g = window.Tengxian, D = window.MissionInputDriver; if (D) {
    if (D.backingOff) { g.Debug.Key("KeyS", false); D.backingOff = false; }
    if (D.closing) { g.Debug.Key("KeyW", false); D.closing = false; }
    D.reflexes = false; D.returning = null; D.closeFoe = null; } });
  await JumpStage(7);
  // 拆两段只为在路上拍一张（Capture 只渲几帧，进不了阶段计时）。
  await Route(Routes.southWalk.slice(0, 5), "SouthWalkFirst", { fight: false, stance: "stand", sprint: false });
  await LookShot("SouthWalk", Routes.southWalk[6]);
  await Route(Routes.southWalk.slice(5), "SouthWalk", { fight: false, stance: "stand", sprint: false });
  const south = await WaitStage("Village", 120);
  await LookShot("SouthVillageMouth", A.village);
  const pacing = await page.evaluate(() => {
    const stages = window.Tengxian.Debug.FirstLevelMission().log.filter((e) => e.kind === "stage");
    const index = stages.findIndex((e) => e.id === "South");
    return index >= 0 && stages[index + 1] ? stages[index + 1].time - stages[index].time : null;
  });
  console.log("SOUTH_SECONDS", pacing);
  await fs.writeFile(path.join(shots, "Data_SouthPacing.json"),
    JSON.stringify({ seconds: pacing, min: F.southTargetSecondsMin, max: F.southTargetSecondsMax }, null, 2));
  assert.ok(south.mission.facts.includes("southWhisperHeard"), "幺娃靠上来说了那段私语");
  assert.ok(south.mission.facts.includes("mainStreetPointed"), "路边人员指了主街路线");
  assert.ok(pacing != null && pacing >= F.southTargetSecondsMin && pacing <= F.southTargetSecondsMax,
    `07 正常速度下落在 ${F.southTargetSecondsMin}–${F.southTargetSecondsMax} 秒，实测 ${pacing}`);
  const escort = await page.evaluate(() => {
    const g = window.Tengxian, m = g.Debug.FirstLevelMission();
    return { squad: g.ai.soldiers.filter((a) => a.castId).map((a) => ({ id: a.castId, alive: a.alive, z: a.position.z })),
      litters: m.column.litters.filter((l) => l.health > 0).map((l) => +l.z.toFixed(1)) };
  });
  assert.ok(escort.squad.filter((a) => a.alive).length >= 3, "至少三个班里人跟着南下：" + JSON.stringify(escort.squad));
  assert.ok(escort.litters.length >= 4, "担架队跟得上，没有拖断队：" + JSON.stringify(escort.litters));
  console.log("ok 07 south: real 135 m walk in", pacing, "s, whisper and roadside pointer heard, column intact");
  void WaitOutCutscene;
}
