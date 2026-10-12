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
  const { JumpStage, Capture, CaptureFocus, WaitOutCutscene, Route, Interact, InteractProbe, WaitStage } = CampaignActions(ctx);
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
    await page.evaluate((view) => { Object.assign(window.Tengxian.player, view); }, view);   // no return: see Opening's Restore
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
  // 2026-10-12 0311 B 包：借火改两次 F。站到跟前只亮提示（borrowCued），第一次 F 开 1–6 句；老周掏烟递出
  //（offered）后第二次 F，7–9 句与划火才接着来（matchAsked）。妮儿那一拍（nierSeen / NierShells）顺带看一眼。
  const Snapshot = () => page.evaluate(() => {
    const g = window.Tengxian, m = g.Debug.FirstLevelMission();
    return { stage: m.stage, facts: m.facts, played: m.voice.played, front: m.front, column: m.column, geng: m.gengFamily, time: m.time };
  });
  const Step = (frames) => page.evaluate((frames) => {
    const g = window.Tengxian;
    for (let i = 0; i < frames && g.Debug.FirstLevelMissionRuntime().flow.stage.id === "Orders"; i++) {
      if (g.player.bleeding && g.player.health < 85) g.Debug.Key("KeyB");
      g.StepFrames(1, 1 / 60, false);
    }
  }, frames);
  let orders = await Snapshot();
  // 提示要等 Volunteer（五句，约 20 s）说完（volunteerHeard）才亮：站着等，最多 60 s。
  for (let chunk = 0; chunk < 120 && !orders.front.collection.borrowCued; chunk++) { await Step(30); orders = await Snapshot(); }
  assert.ok(orders.front.collection.borrowCued, "站到老周跟前、脸朝着他，借火的提示亮了：" + JSON.stringify(orders.front.collection));
  assert.ok(!orders.front.collection.borrowSaid, "没按 F 之前老周不开口（契约 §3.4 两次 F）");
  await InteractProbe("BorrowFirstF");
  const pressed = await Interact();
  orders = await Snapshot();
  console.log("BORROW_FIRST_F", JSON.stringify({ pressed, collection: orders.front.collection, frontScenes: orders.front.scenes ?? null }));
  assert.ok(orders.front.collection.borrowSaid, "第一次 F：借火开口了");
  // 分段推：借火那一拍要在演的时候拍，等整段走完老周已经上担架抬走了。
  let secondPressed = false;
  for (let chunk = 0; chunk < 80; chunk++) {
    await Step(90);
    orders = await Snapshot();
    if (orders.front.collection.offered && !secondPressed) {
      // 老周递出烟了：7–9 句要等第二次 F。等半秒看它真的没接着说。
      await Step(40);
      orders = await Snapshot();
      assert.ok(!orders.front.collection.matchAsked && !orders.facts.includes("lightShared"), "老周递烟之后不按 F 不接着说");
      await Interact();
      secondPressed = true;
      orders = await Snapshot();
      assert.ok(orders.front.collection.matchAsked && orders.facts.includes("matchAsked"), "第二次 F：划火递过去（matchAsked）");
    }
    if (orders.front.collection.borrow.includes("light") && !ctx.capturedActivities.has("BorrowLight")) {
      ctx.capturedActivities.add("BorrowLight");
      await LookShot("BorrowLight", { ...P.collection.zhouWall, height: 0.9 });
    }
    if (orders.stage !== "Orders") break;
  }
  console.log("ORDERS", JSON.stringify({ stage: orders.stage, borrow: orders.front.collection.borrow, geng: orders.geng?.nier, events: orders.geng?.events }));
  if (!ctx.capturedActivities.has("BorrowLight")) await LookShot("BorrowLight", { ...P.collection.zhouWall, height: 0.9 });
  for (const fact of ["ordersReached", "volunteerHeard", "matchAsked", "lightShared", "zhouOnLitter", "columnDeparted"])
    assert.ok(orders.facts.includes(fact), `06 记下了 ${fact}`);
  assert.ok(secondPressed, "第二次 F 真的按过");
  assert.deepEqual(orders.front.collection.borrow, ["ask", "pat", "pocket", "offer", "light", "share", "wince"],
    "借火戏七个姿态按 BorrowLight 的句子与两处动作空当逐个对上：" + JSON.stringify(orders.front.collection.borrow));
  assert.ok(orders.front.collection.borrowSaid, "借火是走到老周跟前触发的（不是进 06 就自动排队）");
  assert.ok(orders.front.collection.zhouLifted, "担架员真的把老周抬上了担架");
  assert.ok(orders.front.collection.zhouLiftComplete, "06 完整起架后才准许后送队离开");
  assert.notEqual(orders.column.litters.find(litter => litter.zhou)?.state, "fallen",
    "老周进入07时已由正常担架队列接管，不留在集结处");
  assert.ok(orders.front.collection.runner, "传令兵在集结处");
  assert.equal(orders.stage, "South", "后送队起行把 06 推到 07");
  // 妮儿：06 在沟沿上捡弹壳、担架员喊过她；起行后跟队。
  assert.ok(orders.facts.includes("nierSeen") && orders.played.includes("NierShells"), "06 看见沟沿上捡弹壳的妮儿，担架员喊了她");
  assert.ok(orders.geng?.nier?.x != null && orders.geng.nier.variant === "girl" && orders.geng.nier.modelSource === "model" && orders.geng.nier.scale < 0.7,
    "妮儿在场、占位是 CivilianFemale 的 girl 分身（模型读到了、缩 0.62）：" + JSON.stringify(orders.geng?.nier));
  assert.ok((orders.geng?.nier?.shells ?? 0) >= 1, "妮儿真的捡过弹壳：" + JSON.stringify(orders.geng?.nier));
  {
    const stages = (await page.evaluate(() => window.Tengxian.Debug.FirstLevelMission().log.filter((e) => e.kind === "stage")));
    const at = stages.findIndex((e) => e.id === "Orders"), seconds = at >= 0 && stages[at + 1] ? stages[at + 1].time - stages[at].time : null;
    console.log("ORDERS_SECONDS", seconds);
    const [lo, hi] = R.southMouth.ordersTargetSeconds;
    assert.ok(seconds != null && seconds >= lo && seconds <= hi, `06 约 1 分钟（${lo}–${hi} s），实测 ${seconds}`);
  }
  console.log("ok 06 orders: volunteered, two F borrow, Zhou on the litter, column away, Nier seen on the rim");

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
  // 2026-10-12 0311 B 包：07 = 沿沟南行（妮儿在沟沿跟队、NierFollow、SouthWhisper）+ 沟口遭遇（Script_FirstLevelSouthMouth）
  //   + 过开阔地到村北口。像玩家一样：走到沟口停点，机枪一响就在沟南口的坡上压它，担架过完再跟上。
  /** 守在原地打，直到记下某条事实（或超时）：每帧瞄最近看得见的敌人；没人就松手、换弹。 */
  async function HoldFact(fact, seconds, label) {
    let state = null, frames = 0;
    while (frames < seconds * 60) {
      state = await page.evaluate(({ fact, budget, label }) => {
        const g = window.Tengxian, D = window.MissionInputDriver, r = g.Debug.FirstLevelMissionRuntime();
        D.leg = label; D.mode = "hold";
        let f = 0;
        for (; f < budget && g.player.alive && !r.Has(fact); f++) {
          const evading = D.EvadeGrenade();
          if (!evading && !D.CloseThreat() && D.StepHome()) { g.StepFrames(1, 1 / 60, false); continue; }
          const foe = evading ? null : D.Target(90);
          if (foe) D.Shoot(foe);
          else if (!evading) {
            g.Debug.Mouse(0, false); g.Debug.Mouse(2, false);
            if (g.state.activeSlot === "melee") g.Debug.Key("Digit1");
            if (g.state.ammo === 0) g.Debug.Key("KeyR");
          }
          if (g.player.bleeding && g.player.health < 80) g.Debug.Key("KeyB");
          g.StepFrames(1, 1 / 60, false);
        }
        g.Debug.Mouse(0, false); g.Debug.Mouse(2, false);
        const m = g.Debug.FirstLevelMission();
        return { alive: g.player.alive, health: g.player.health, done: r.Has(fact), frames: f, stage: m.stage, facts: m.facts,
          southMouth: m.southMouth, geng: m.gengFamily, litters: m.column.litters.filter((l) => l.health > 0).map((l) => +l.progress.toFixed(1)) };
      }, { fact, budget: Math.min(300, seconds * 60 - frames), label });
      frames += Math.max(1, state.frames);
      if (state.done || !state.alive || state.stage !== "South") break;
    }
    assert.ok(state.alive, `${fact}: player survives at the trench mouth`);
    return state;
  }
  // 沟里：到第 3 点，拍一张；再到沟口停点（担架在这儿等）。
  await Route(Routes.southWalk.slice(0, 3), "SouthWalkFirst", { fight: false, stance: "stand", sprint: false });
  await LookShot("SouthWalk", Routes.southWalk[4]);
  await Route([Routes.southWalk[3], A.southMouthHold], "SouthWalkHold", { fight: true, stance: "stand", sprint: false });
  let south = await HoldFact("southMouthReached", 20, "SouthMouthReached");
  assert.ok(south.done, "担架队到沟口停点：southMouthReached（southMouth 组这时放出）");
  // 上沟南口的坡（出坡起点），蹲着等机枪开火，压它。
  await Route([A.southMouth], "SouthMouthRamp", { fight: true, stance: "crouch", sprint: false, arrivalM: 1.2 });
  south = await HoldFact("mouthContact", 60, "MouthContact");
  assert.ok(south.done, "东边田埂上的机枪真的开了火（mouthContact）：" + JSON.stringify(south.southMouth));
  await LookShot("SouthMouthContact", { ...A.mouthEmbankment, height: 1.0 });
  south = await HoldFact("mouthCrossed", 240, "MouthCrossed");
  console.log("SOUTH_MOUTH", JSON.stringify({ ...south.southMouth, litters: south.litters, nier: south.geng?.nier }));
  assert.ok(south.done, "活着的担架全部过了开阔地进村北巷（mouthCrossed）：" + JSON.stringify(south.southMouth));
  assert.ok(south.facts.includes("mouthMgSuppressed"), "机枪被压住过（担架只在压住期间跑）");
  assert.ok(south.geng?.nier?.x != null && south.geng.nier.x > 30, "妮儿先于队伍跑进了村北巷：" + JSON.stringify(south.geng?.nier));
  // 过开阔地到村北口。
  await Route(Routes.southWalk.slice(4), "SouthWalk", { fight: true, stance: "stand", sprint: false });
  south = await WaitStage("Village", 120, { fight: true });
  await LookShot("SouthVillageMouth", A.village);
  const pacing = await page.evaluate(() => {
    const stages = window.Tengxian.Debug.FirstLevelMission().log.filter((e) => e.kind === "stage");
    const index = stages.findIndex((e) => e.id === "South");
    return index >= 0 && stages[index + 1] ? stages[index + 1].time - stages[index].time : null;
  });
  console.log("SOUTH_SECONDS", pacing);
  const [southMin, southMax] = R.southMouth.targetSeconds;
  await fs.writeFile(path.join(shots, "Data_SouthPacing.json"),
    JSON.stringify({ seconds: pacing, min: southMin, max: southMax, legacyWalk: [F.southTargetSecondsMin, F.southTargetSecondsMax] }, null, 2));
  for (const fact of ["nierFollowHeard", "southWhisperHeard", "mouthContact", "mouthMgSuppressed", "mouthCrossed", "villageMouthReached", "mainStreetPointed"])
    assert.ok(south.mission.facts.includes(fact), `07 记下了 ${fact}`);
  assert.ok(pacing != null && pacing >= southMin && pacing <= southMax,
    `07（改稿约 2.5 分钟 ±40%）落在 ${southMin}–${southMax} 秒，实测 ${pacing}`);
  const escort = await page.evaluate(() => {
    const g = window.Tengxian, m = g.Debug.FirstLevelMission();
    return { squad: g.ai.soldiers.filter((a) => a.castId).map((a) => ({ id: a.castId, alive: a.alive, z: a.position.z })),
      litters: m.column.litters.filter((l) => l.health > 0).map((l) => +l.z.toFixed(1)) };
  });
  assert.ok(escort.squad.filter((a) => a.alive).length >= 3, "至少三个班里人跟着南下：" + JSON.stringify(escort.squad));
  assert.ok(escort.litters.length >= 4, "担架队跟得上，没有拖断队：" + JSON.stringify(escort.litters));
  console.log("ok 07 south: trench walk, mouth fight (contact / suppressed / crossed), village mouth in", pacing, "s, column intact");
  void WaitOutCutscene;
}
