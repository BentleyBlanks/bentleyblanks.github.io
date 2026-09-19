// 第一关整关驾驶脚本 · 阶段 15–18（降压收拢 → 交接 → 老周死亡 → 铁路桥与夜入滕城）。
// 归第二波 End 包；公共部分在 Script_FirstLevelCampaignKit.mjs。
//
// 2026.09.19 重构把 15 改成**无战斗**的降压段（收拢、换手抬运、找到接收处），
// 18 换成「接应回援尾队 → 奉令毁桥 → 夜入滕城」。旧驾驶脚本的撤退三连战
// （RetreatFirst/Wall/Yard）、接收院防御与从后门撤离整段已经对不上，全部删掉。
//
// 这一段全部走**正常输入**：走路、按 F 接担架、按 F 放担架、开枪压北岸土坎。
// 唯一的调试接口是段首的 JumpStage（只有 --stage-jumps 时才生效）。
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { MISSION_ANCHORS as A } from "./Data_FirstLevelMissionLayout.mjs";
import { MISSION_STAGE_ROUTES, MISSION_RECEPTION_SPACE as Reception } from "./Data_FirstLevelMissionTopology.mjs";
import { END_TUNING as E } from "./Data_Tuning_FirstLevelEnd.mjs";
import { CampaignActions } from "./Script_FirstLevelCampaignKit.mjs";

/** 折线转成 Route 能吃的点串（去掉 yaw 之类的附加字段）。 */
const Points = route => route.map(point => ({ x: point.x, z: point.z }));
const Mission = page => page.evaluate(() => window.Tengxian.Debug.FirstLevelMission());

/** 阶段 15–18，走到 Complete。 */
export async function Drive(ctx) {
  const { page, output } = ctx;
  const { JumpStage, Capture, CaptureFocus, Route, Interact, WaitStage } = CampaignActions(ctx);

  // --- 15A 沟口收拢：无战斗。队伍重新成形、队首走起来 ------------------------
  await JumpStage(15);
  await Route([{ x: A.ditch.x + 6, z: A.ditch.z }, { x: A.ditch.x, z: A.ditch.z }],
    "RegroupDitchMouth", { fight: true });
  {
    const shot = await Mission(page);
    assert.equal(shot.stage, "Regroup");
    // 警戒兵真的在车路方向站着（15A 的追兵由他们接住，玩家不进新一轮守波次）。
    const picket = shot.end.extras.filter(entry => /^Picket/.test(entry.id));
    assert.equal(picket.length, 3, "转运点的三个警戒兵是真人实体：" + JSON.stringify(picket));
    assert.ok(picket.every(entry => entry.x > A.retreatA.x), "他们站在收拢点与车路之间");
    await CaptureFocus("RegroupPicket", picket[0]);
  }
  // 顺子问赶车人（走到车边才问），再回收拢点跟队伍会合。
  await Route([{ x: E.droverPost.x + 2.4, z: E.droverPost.z + 1.2 }], "RegroupDrover", { fight: true });
  await Route([{ x: A.retreatA.x + 4, z: A.retreatA.z - 6 }, { x: A.retreatA.x, z: A.retreatA.z }],
    "RegroupRally", { fight: true });
  {
    const shot = await WaitStage("WallPath", 300, { fight: true });
    const facts = shot.mission.facts;
    for (const id of ["survivorsSheltered", "litterRemanned", "columnMoving", "picketHolding", "zhouChecked", "headcountDone"])
      assert.ok(facts.includes(id), `15A 缺事实 ${id}：${JSON.stringify(facts.slice(-12))}`);
    assert.ok(facts.includes("__cartAsked") || shot.mission.voice.played.includes("CartAbandon"),
      "顺子真的问过赶车人");
    // 15A 全程不许冒出新的遭遇组。
    const spawned = shot.mission.enemies.filter(actor => actor.encounter === "retreat");
    assert.deepEqual(spawned, [], "降压段不许生成任何新的遭遇组");
  }

  // --- 15B 换手抬运，沿墙缓行 ------------------------------------------------
  // 后抬手撑到 carrySwapProgressM 才撒手；撒手之前 F 是够不着担架的。
  await Route(Points(MISSION_STAGE_ROUTES.wallPath.slice(0, 2)), "WallPathEnter", { fight: false });
  const swapped = await page.waitForFunction(
    () => window.Tengxian.Debug.FirstLevelMission().facts.includes("carrySwapOffered"),
    null, { timeout: 180000 }).then(() => true).catch(() => false);
  assert.ok(swapped, "后抬手体力不支，担架停下等人接");
  {
    const zhou = await page.evaluate(() => {
      const litter = window.Tengxian.Debug.FirstLevelMission().column.litters.find(entry => entry.zhou);
      return { x: litter.x + Math.sin(litter.yaw) * 1.6, z: litter.z + Math.cos(litter.yaw) * 1.6 };
    });
    await Route([zhou], "WallPathSwapPickup");
    await Interact();
    assert.equal(await page.evaluate(() => window.Tengxian.carry.KindId), "stretcher",
      "顺子按 F 真的接过了老周担架后端");
  }
  await Capture("WallPathCarry");
  // 过坎 → 幺娃说手抖 → 一整段无对白行走 → 夹道尽头。
  await Route(Points(MISSION_STAGE_ROUTES.wallPath.slice(1)), "WallPathToGate");
  {
    const shot = await Mission(page);
    for (const id of ["carryHandover", "roadBumpCrossed", "stragglersTended"])
      assert.ok(shot.facts.includes(id), `15B 缺事实 ${id}`);
    assert.ok(shot.voice.played.includes("RoadBump") && shot.voice.played.includes("HandsShake"),
      "过坎与手抖两段都真的说了");
    const quiet = shot.log.find(entry => entry.id === "quietWalkObserved");
    assert.ok(quiet && quiet.detail.seconds >= E.silenceSeconds,
      `夹道末段要有一整段无对白行走，实际 ${JSON.stringify(quiet?.detail)}`);
    await fs.writeFile(path.join(output, "Data_QuietWalk.json"), JSON.stringify(quiet, null, 2));
  }

  // --- 15C 院门：先拦 → 确认身份 → 接收人员指位置 → 伤员真的往里走 ------------
  await WaitStage("ReceptionGate", 180);
  await Route([{ x: A.receptionGate.x + 6, z: A.receptionGate.z }], "ReceptionGateApproach");
  {
    const held = await page.evaluate(() => {
      const mission = window.Tengxian.Debug.FirstLevelMission();
      return { mode: mission.column.mode, challenged: mission.facts.includes("gateChallenged") };
    });
    assert.notEqual(held.mode, "reception", "身份没确认以前伤员不许往院里走");
    await Capture("ReceptionGateChallenge");
  }
  await WaitStage("Handover", 300);
  {
    const shot = await Mission(page);
    for (const id of ["gateChallenged", "receptionAccepted", "woundedEntering"])
      assert.ok(shot.facts.includes(id), `15C 缺事实 ${id}`);
    assert.ok(shot.voice.played.includes("WardGuide"), "刘文财在院里招呼担架跟他走");
  }

  // --- 16 完成交接：过门槛、军医指位置、放下担架、分派 ------------------------
  await JumpStage(16);
  {
    // 跳进 16 时老周还在院门口那副担架上：走过去接手，抬进厢房。
    const carrying = await page.evaluate(() => window.Tengxian.carry.KindId === "stretcher");
    if (!carrying) {
      const pickup = await page.evaluate(() => {
        const litter = window.Tengxian.Debug.FirstLevelMission().column.litters.find(entry => entry.zhou);
        return { x: litter.x + Math.sin(litter.yaw) * 1.6, z: litter.z + Math.cos(litter.yaw) * 1.6 };
      });
      await Route([pickup], "HandoverPickup");
      await Interact();
    }
    assert.equal(await page.evaluate(() => window.Tengxian.carry.KindId), "stretcher");
  }
  await Route([Reception.yardJunction, { x: Reception.wardExit.x, z: Reception.wardExit.z },
    { x: Reception.wardThreshold.x, z: Reception.wardThreshold.z + 1 },
    { x: A.zhouDrop.x, z: A.zhouDrop.z + 1.6 }], "HandoverThreshold");
  {
    const shot = await Mission(page);
    assert.ok(shot.facts.includes("thresholdCrossed"), "过了厢房门槛");
    assert.ok(shot.voice.played.includes("Threshold"), "「脚……慢点」是老周最后一句话");
    await Capture("HandoverThreshold");
  }
  // 军医先指位置（PlaceLitter），喊出口才允许按 F。
  await page.waitForFunction(() => window.Tengxian.Debug.FirstLevelMission().facts.includes("placeOrderHeard"),
    null, { timeout: 120000 });
  await Route([{ x: A.zhouDrop.x, z: A.zhouDrop.z + 1.2 }], "HandoverPlace");
  await Interact();
  {
    const shot = await Mission(page);
    assert.ok(shot.facts.includes("zhouPlaced"), "玩家与前抬手一起把老周放下了");
    assert.equal(shot.emptyHands, false, "放下担架之后恢复正常持枪");
    assert.equal(await page.evaluate(() => window.Tengxian.carry.Active), false);
    await Capture("HandoverPlaced");
  }
  await WaitStage("Death", 420);
  {
    const shot = await Mission(page);
    for (const id of ["medicExamining", "squadAssigned", "squadDispersed"])
      assert.ok(shot.facts.includes(id), `16 缺事实 ${id}`);
  }

  // --- 17 确认老周死亡：第一人称、不判失败、接收处继续工作 --------------------
  await JumpStage(17);
  await WaitStage("BridgeOrders", 420);
  {
    const shot = await Mission(page);
    assert.ok(shot.facts.includes("deathSceneComplete"), "死亡确认完成");
    assert.equal(shot.failed, false, "老周死亡不判全关失败");
    assert.ok(shot.voice.played.includes("NextLitter"), "门外又抬来伤员，接收处继续工作");
    assert.ok(shot.end.reception.death.treating, "军医转过去救下一个");
    await fs.writeFile(path.join(output, "Data_DeathScene.json"), JSON.stringify(shot.end.reception, null, 2));
  }

  // --- 18 接应回援尾队、奉令毁桥、夜入滕城 -----------------------------------
  await JumpStage(18);
  {
    // 传令兵真人跑进接收处，跑到跟前才开口。
    const before = await Mission(page);
    assert.ok(!before.facts.includes("bridgeOrdersHeard"), "刚进 18 还没接到令");
    await page.waitForFunction(() => window.Tengxian.Debug.FirstLevelMission().facts.includes("bridgeRunnerArrived"),
      null, { timeout: 120000 });
    const runner = (await Mission(page)).end.extras.find(entry => entry.id === "BridgeRunner");
    assert.ok(runner && runner.alive, "传令兵是真人实体");
    await CaptureFocus("BridgeRunner", runner);
    await page.waitForFunction(() => window.Tengxian.Debug.FirstLevelMission().facts.includes("bridgeOrdersHeard"),
      null, { timeout: 120000 });
    assert.ok((await page.locator("#hud").innerText()).includes("铁路桥"),
      "HUD 目标更新为「掩护回援分队通过铁路桥」");
  }
  // 沿 toBridge 到南岸射位。
  await Route(Points(MISSION_STAGE_ROUTES.toBridge), "BridgeToCover", { fight: true });
  await WaitStage("BridgeCover", 120, { fight: true });
  {
    const shot = await Mission(page);
    assert.ok(shot.facts.includes("southBankReached"), "到了南岸遮挡后的射位");
    const column = shot.bridgeColumn;
    assert.equal(column.length, 6, "回援尾队是六个真人");
    assert.ok(column.every(entry => entry.alive), "他们一开始都还活着");
    assert.ok(column.some(entry => entry.load === "mg") && column.filter(entry => entry.load === "mortar").length === 2,
      "尾队带着机枪与两人抬的迫击炮部件");
    assert.ok(column.every(entry => !entry.crossed), "火力没打断以前一个人都没过桥");
    await CaptureFocus("BridgeRearColumn", column[0]);
  }
  // 压住北岸土坎的火力（真开枪；不要求杀光）。
  await page.evaluate(() => { window.MissionInputDriver.blocked.clear(); });
  {
    const broken = await page.waitForFunction(
      () => window.Tengxian.Debug.FirstLevelMission().facts.includes("bridgeFireBroken"),
      null, { timeout: 300000 }).then(() => true).catch(() => false);
    if (!broken) {
      // 站在射位上打：驾驶器的 Target 只在 WaitStage/Route 的循环里跑。
      await Route([{ x: A.bridgeCover.x + 3, z: A.bridgeCover.z - 2 }, { x: A.bridgeCover.x, z: A.bridgeCover.z }],
        "BridgeSuppress", { fight: true });
      await WaitStage("BridgeWithdraw", 420, { fight: true, cover: true });
    } else await WaitStage("BridgeWithdraw", 420, { fight: true, cover: true });
  }
  {
    const shot = await Mission(page);
    assert.ok(shot.facts.includes("bridgeFireBroken") && shot.facts.includes("rearColumnCrossed"),
      "威胁解除之后尾队真的通过了铁路桥");
    const alive = shot.enemies.filter(actor => /^BridgeNorth/.test(actor.id) && actor.alive).length;
    console.log("BRIDGE_NORTH_ALIVE", alive, "（玩家不承担杀光所有敌军）");
    await Capture("BridgeCrossed");
  }
  // 退到南岸掩护区；爆破区里还有人的时候不许炸。
  await Route(Points(MISSION_STAGE_ROUTES.bridgeWithdraw), "BridgeWithdrawToSafe", { fight: true });
  {
    const shot = await Mission(page);
    assert.ok(shot.facts.includes("blastZoneCleared"), "玩家退到了南岸掩护区");
    assert.ok(shot.log.some(entry => entry.id === "blastHeldForFriendly"),
      "爆破至少等过一次「爆破区里还有己方」—— 不是到点就炸");
  }
  await page.waitForFunction(() => window.Tengxian.Debug.FirstLevelMission().facts.includes("bridgeDestroyed"),
    null, { timeout: 180000 });
  await Capture("BridgeBlast");
  {
    const blast = await page.evaluate(() => {
      const g = window.Tengxian, mission = g.Debug.FirstLevelMission();
      const gates = g.Debug.FirstLevelWhitebox?.()?.gates;
      return {
        detail: mission.log.find(entry => entry.id === "bridgeDestroyed")?.detail,
        casualties: mission.ordinaryCasualties.length,
        squadAlive: g.ai.soldiers.filter(actor => actor.castId && actor.alive).length,
        walkable: !!gates,
      };
    });
    assert.ok(blast.squadAlive >= 3, "爆破不造成己方剧情伤亡");
    await fs.writeFile(path.join(output, "Data_BridgeBlast.json"), JSON.stringify(blast, null, 2));
    // 桥面真的不可走了：完好件的碰撞被撤掉，残骸出现。
    const gone = await page.evaluate(() => {
      const g = window.Tengxian;
      const deck = g.battlefield.colliders.filter(box => /RailBridge(Deck|Truss|Rail)/.test(box.id || ""));
      const wreck = g.battlefield.colliders.filter(box => /RailBridgeWreck/.test(box.id || ""));
      return { deck: deck.length, wreck: wreck.length };
    });
    console.log("RAIL_BRIDGE_AFTER_BLAST", JSON.stringify(gone));
    assert.equal(gone.deck, 0, "炸完桥面/桁架/钢轨的碰撞一件不剩");
  }
  await page.waitForFunction(() => window.Tengxian.Debug.FirstLevelMission().facts.includes("marchOrderHeard"),
    null, { timeout: 120000 });

  // --- 18 夜入滕城：先随队走完 marchOut，黑屏字幕，夜景，进北门 ---------------
  await WaitStage("NightMarch", 180, { fight: false });
  await Route(Points(MISSION_STAGE_ROUTES.marchOut), "NightMarchOut");
  await page.waitForFunction(() => window.Tengxian.Debug.FirstLevelMission().facts.includes("marchOutReached"),
    null, { timeout: 120000 });
  await Capture("NightFadeOut");
  await page.waitForFunction(() => window.Tengxian.Debug.FirstLevelMission().facts.includes("nightArrivalPlaced"),
    null, { timeout: 120000 });
  {
    const night = await page.evaluate(() => {
      const g = window.Tengxian, mission = g.Debug.FirstLevelMission();
      let lights = 0;
      g.scene.traverse(object => { if (object.isPointLight && /NightGateLight/.test(object.name)) lights += 1; });
      return { lights, player: { ...g.player.position }, nightGate: mission.end.nightGate,
        dressing: mission.end.dressing };
    });
    assert.ok(night.lights >= 5, `北门夜景要有火盆与门洞的点光，实际 ${night.lights}`);
    assert.ok(night.dressing.people >= 10, "夜景里真的有在走的队列、搬运的人和分配防区的人");
    await fs.writeFile(path.join(output, "Data_NightGate.json"), JSON.stringify(night, null, 2));
  }
  await page.waitForFunction(() => !window.Tengxian.Debug.FirstLevelMission().control, null, { timeout: 60000 });
  await Capture("NightFadeIn");
  await Route(Points(MISSION_STAGE_ROUTES.nightMarch.slice(1)), "NightMarchToGate");
  {
    const shot = await Mission(page);
    assert.ok(shot.voice.played.includes("NorthGate"), "带路军人在门外招呼");
    assert.ok(shot.facts.includes("northGateReached"), "走到北门下");
  }
  await WaitStage("Complete", 180);
  await Capture("Complete");
  assert.equal(await page.evaluate(() => window.Tengxian.Debug.FirstLevelMission().stage), "Complete");
}
