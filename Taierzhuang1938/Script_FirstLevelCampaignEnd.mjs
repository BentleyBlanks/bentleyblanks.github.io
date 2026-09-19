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
import { MISSION_ANCHORS as A, MISSION_ROUTES } from "./Data_FirstLevelMissionLayout.mjs";
import { MISSION_STAGE_ROUTES, MISSION_RECEPTION_SPACE as Reception } from "./Data_FirstLevelMissionTopology.mjs";
import { END_TUNING as E } from "./Data_Tuning_FirstLevelEnd.mjs";
import { CampaignActions } from "./Script_FirstLevelCampaignKit.mjs";

/** 折线转成 Route 能吃的点串（去掉 yaw 之类的附加字段）。 */
const Points = route => route.map(point => ({ x: point.x, z: point.z }));
const Mission = page => page.evaluate(() => window.Tengxian.Debug.FirstLevelMission());

/**
 * 等某一条事实。**必须自己推帧**：整关驾驶跑在 `manual=1` 下，世界只有
 * `StepFrames` 推才走 —— 光 `page.waitForFunction` 轮询的话时间根本不动，
 * 等到天亮也等不来（第一次写成那样，18 卡在传令兵还没起步的那一帧）。
 */
async function WaitFact(page, factId, label, seconds = 120, { fight = false } = {}) {
  let facts = [];
  for (let chunk = 0; chunk < Math.ceil(seconds / 5); chunk += 1) {
    facts = await page.evaluate(({ factId, fight }) => {
      const g = window.Tengxian;
      for (let i = 0; i < 300; i += 1) {
        if (g.Debug.FirstLevelMission().facts.includes(factId)) break;
        const foe = fight ? window.MissionInputDriver?.Target(90) : null;
        if (foe) window.MissionInputDriver.Shoot(foe);
        else { g.Debug.Mouse(0, false); g.Debug.Mouse(2, false); }
        g.StepFrames(1, 1 / 60, false);
      }
      g.Debug.Mouse(0, false); g.Debug.Mouse(2, false);
      return g.Debug.FirstLevelMission().facts;
    }, { factId, fight });
    if (facts.includes(factId)) break;
  }
  assert.ok(facts.includes(factId), `${label}：等不到事实 ${factId}`);
  return facts;
}
/** 等受控演出（黑屏转场 / 死亡段）还回控制权。同样自己推帧。 */
async function WaitControl(page, label, seconds = 60) {
  for (let chunk = 0; chunk < Math.ceil(seconds / 5); chunk += 1) {
    const control = await page.evaluate(() => {
      const g = window.Tengxian;
      for (let i = 0; i < 300 && g.Debug.FirstLevelMission().control; i += 1) g.StepFrames(1, 1 / 60, false);
      return g.Debug.FirstLevelMission().control;
    });
    if (!control) return;
  }
  assert.fail(`${label}：受控演出没有还回控制权`);
}

/**
 * 阶段 15–18，走到 Complete。
 *
 * 分段起点：`--stage-from=15` 从降压段开始，`--stage-from=18` 只跑桥与夜入城。
 * 每一段用 `ctx.stageFrom <= n` 把门 —— 不这样的话 `--stage-from=18` 会先跳回 15，
 * 收尾那条「跳转回执 = [stageFrom..18]」的断言当场就红。
 */
export async function Drive(ctx) {
  const { page, output } = ctx;
  const { JumpStage, Capture, CaptureFocus, Route, Interact, WaitStage } = CampaignActions(ctx);
  const from = ctx.stageFrom;

  if (from <= 15) await DriveRegroup(ctx, { JumpStage, Capture, CaptureFocus, Route, Interact, WaitStage });
  if (from <= 16) await DriveHandover(ctx, { JumpStage, Capture, Route, Interact, WaitStage });
  if (from <= 17) await DriveDeath(ctx, { JumpStage, WaitStage });
  await DriveBridge(ctx, { JumpStage, Capture, CaptureFocus, Route, WaitStage });

  await Capture("Complete");
  assert.equal(await page.evaluate(() => window.Tengxian.Debug.FirstLevelMission().stage), "Complete");
  void output;
}

/** 15A/15B/15C：收拢 → 换手抬运沿墙缓行 → 院门与入院。全程无敌人。 */
async function DriveRegroup(ctx, { JumpStage, Capture, CaptureFocus, Route, Interact, WaitStage }) {
  const { page, output } = ctx;

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
  // 先在收拢点等对白真的走完（幺娃走到担架边检查、何有田挨个点人）。
  await Route([{ x: A.retreatA.x + 4, z: A.retreatA.z - 6 }, { x: A.retreatA.x, z: A.retreatA.z }],
    "RegroupRally", { fight: true });
  const enemiesBefore = (await Mission(page)).enemies.length;
  await WaitFact(page, "headcountDone", "15A 点名", 300, { fight: true });
  // 点完人顺子才去问赶车人「车还走得了不」——沿沟走到车边才问（直线会横切沟壁）。
  await Route([{ x: A.ditch.x, z: A.ditch.z }, { x: 47, z: 114 },
    { x: E.droverPost.x + 2.4, z: E.droverPost.z + 1.2 }], "RegroupDrover", { fight: true });
  {
    const shot = await Mission(page);
    assert.ok(shot.voice.played.includes("CartAbandon"), "顺子走到车边真的问过赶车人");
  }
  await Route([{ x: 47, z: 114 }, { x: A.ditch.x, z: A.ditch.z }, { x: A.retreatA.x, z: A.retreatA.z }],
    "RegroupBackToColumn", { fight: true });
  {
    const shot = await WaitStage("WallPath", 300, { fight: true });
    const facts = shot.mission.facts;
    for (const id of ["survivorsSheltered", "litterRemanned", "columnMoving", "picketHolding", "zhouChecked", "headcountDone"])
      assert.ok(facts.includes(id), `15A 缺事实 ${id}：${JSON.stringify(facts.slice(-12))}`);
    // 15A 全程不许冒出新的敌人（降压段无战斗）。
    assert.ok(shot.mission.enemies.length <= enemiesBefore,
      `降压段不许生成新敌人：${enemiesBefore} → ${shot.mission.enemies.length}`);
  }

  // --- 15B 换手抬运，沿墙缓行 ------------------------------------------------
  // 先沿撤离线从收拢点南下到夹道口（(32,134)→(50,150)→(56,165)→(56,184)→(56,207)）；
  // 直接连 wallPath 的第一点会横切整条沟。后抬手撑到 carrySwapProgressM 才撒手。
  await Route(Points(MISSION_ROUTES.evacuation.slice(2, 7)), "WallPathEnter", { fight: false });
  await WaitFact(page, "carrySwapOffered", "15B 换手", 180);
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
  // 夹道最后一点就是院门，上面那条路线已经把人送到门口了，不再往回走。
  await WaitStage("ReceptionGate", 180);
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

}

/** 16 完成交接：过门槛、军医指位置、放下担架、分派。 */
async function DriveHandover(ctx, { JumpStage, Capture, Route, Interact, WaitStage }) {
  const { page } = ctx;
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
  // 厢房南门的门槛在 z=243：要往 z 更小的方向跨进去，落点是放置点本身。
  await Route([{ x: Reception.yardJunction.x, z: Reception.yardJunction.z },
    { x: Reception.wardExit.x, z: Reception.wardExit.z },
    { x: Reception.wardThreshold.x, z: Reception.wardThreshold.z + 1.5 },
    { x: A.zhouDrop.x, z: A.zhouDrop.z }], "HandoverThreshold");
  {
    const shot = await Mission(page);
    assert.ok(shot.facts.includes("thresholdCrossed"), "过了厢房门槛");
    assert.ok(shot.voice.played.includes("Threshold"), "「脚……慢点」是老周最后一句话");
    await Capture("HandoverThreshold");
  }
  // 军医先指位置（PlaceLitter），喊出口才允许按 F。
  await WaitFact(page, "placeOrderHeard", "16 军医指位置", 180);
  await Route([{ x: A.zhouDrop.x - 0.8, z: A.zhouDrop.z + 0.6 }], "HandoverPlace");
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

}

/** 17 确认老周死亡：第一人称、不判失败、接收处继续工作。 */
async function DriveDeath(ctx, { JumpStage, WaitStage }) {
  const { page, output } = ctx;
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

}

/** 18 接应回援尾队、奉令毁桥、夜入滕城。 */
async function DriveBridge(ctx, { JumpStage, Capture, CaptureFocus, Route, WaitStage }) {
  const { page, output } = ctx;
  await JumpStage(18);
  {
    // 传令兵真人跑进接收处，跑到跟前才开口。
    const before = await Mission(page);
    assert.ok(!before.facts.includes("bridgeOrdersHeard"), "刚进 18 还没接到令");
    await WaitFact(page, "bridgeRunnerArrived", "18 传令兵跑到接收处", 180);
    const runner = (await Mission(page)).end.extras.find(entry => entry.id === "BridgeRunner");
    assert.ok(runner && runner.alive, "传令兵是真人实体");
    await CaptureFocus("BridgeRunner", runner);
    await WaitFact(page, "bridgeOrdersHeard", "18 接令", 180);
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
    // Notion 明说「有人可能中弹」：不要求一个不少，只要求这还是一支队伍。
    assert.ok(column.filter(entry => entry.alive).length >= 4,
      "北岸火力下尾队还成队：" + JSON.stringify(column.map(entry => entry.alive)));
    assert.ok(column.some(entry => entry.load === "mg") && column.filter(entry => entry.load === "mortar").length === 2,
      "尾队带着机枪与两人抬的迫击炮部件");
    assert.ok(column.every(entry => !entry.crossed), "火力没打断以前一个人都没过桥");
    await CaptureFocus("BridgeRearColumn", column[0]);
  }
  // 压住北岸土坎的火力（真开枪；不要求杀光）。
  await page.evaluate(() => { window.MissionInputDriver.blocked.clear(); });
  // 站在射位上真开枪压住土坎（不要再走路线：Route 的 fight 循环一看见敌人就松开
  // 前进键，脚下不动就被判成「这条路走不通」）。打断之后尾队自己过桥。
  await WaitFact(page, "bridgeFireBroken", "18 打断北岸火力", 420, { fight: true });
  await WaitStage("BridgeWithdraw", 420, { fight: true, cover: true });
  {
    const shot = await Mission(page);
    assert.ok(shot.facts.includes("bridgeFireBroken") && shot.facts.includes("rearColumnCrossed"),
      "威胁解除之后尾队真的通过了铁路桥");
    const alive = shot.enemies.filter(actor => /^BridgeNorth/.test(actor.id) && actor.alive).length;
    console.log("BRIDGE_NORTH_ALIVE", alive, "（玩家不承担杀光所有敌军）");
    await Capture("BridgeCrossed");
  }
  // 退到南岸掩护区；爆破区里还有人的时候不许炸。
  // 退之前先报一次「现在能不能走」：射位那一小块上蹲了一整场掩护，姿势、净空、
  // 运行状态任何一样不对，下面那条路线都会原地打转（第一版就是这么卡住的）。
  // 射位那一小块上蹲了一整场掩护，撤的时候班里四个人又都从这儿起步 —— 玩家会被
  // 自己人裁步挡住（09-17 的「玩家裁步挡位＋国军让路」）。先报一次现场，再朝
  // **离人最远的方向**挪开两步，然后才走撤离路线。
  console.log("WITHDRAW_START", JSON.stringify(await page.evaluate(() => {
    const g = window.Tengxian, p = g.player;
    return { running: g.state.running, control: g.state.missionControl, stance: p.stance,
      alive: p.alive, position: { ...p.position }, yaw: Number(p.yaw.toFixed(2)),
      overlap: g.physics.Overlaps(p.position.x, p.position.y + 0.04, p.position.z, p.radius, 1.78),
      carry: g.carry.KindId, cutscene: g.state.cutscene, menu: g.state.menu,
      slot: g.state.activeSlot, busy: !!p.Busy, mounted: !!g.emplacement?.Mounted,
      meleeActive: !!g.meleeCombat?.Active, meleeBlocking: !!g.meleeCombat?.Blocking,
      meleeCanUse: !!g.meleeCombat?.CanUse?.(),
      crowd: g.ai.soldiers.filter(a => a.alive && Math.hypot(a.position.x - p.position.x, a.position.z - p.position.z) < 4)
        .map(a => ({ id: a.missionId || a.castId || a.id, side: a.side,
          d: Number(Math.hypot(a.position.x - p.position.x, a.position.z - p.position.z).toFixed(2)) })) };
  })));
  const escaped = await page.evaluate(() => {
    const g = window.Tengxian, p = g.player;
    for (const key of ["KeyW", "KeyA", "KeyS", "KeyD", "ShiftLeft"]) g.Debug.Key(key, false);
    g.Debug.Mouse(0, false); g.Debug.Mouse(2, false);
    // 大刀还拔在手上的话 meleeCombat.Blocking 会把 forward/strafe 整个清零 ——
    // 掩护那一场里驾驶器一旦近身就按过 V。先收刀、退架、松锁，再谈走路。
    g.meleeCombat?.Cancel?.("campaignWithdraw");
    g.emplacement?.Vacate?.("campaignWithdraw");
    if (g.state.activeSlot !== "primary") g.Debug.Key("Digit1");
    g.StepFrames(20, 1 / 60, false);
    if (p.stance === "prone") g.Debug.Key("KeyZ");
    if (p.stance === "crouch") g.Debug.Key("KeyC");
    const before = { x: p.position.x, z: p.position.z };
    // 八个方向各试 0.5 s，谁真的挪得动就走谁。
    for (let k = 0; k < 8; k += 1) {
      p.yaw = (Math.PI * 2 * k) / 8;
      g.Debug.Key("KeyW", true);
      g.StepFrames(30, 1 / 60, false);
      g.Debug.Key("KeyW", false);
      if (Math.hypot(p.position.x - before.x, p.position.z - before.z) > 0.6) {
        g.Debug.Key("KeyW", true); g.StepFrames(60, 1 / 60, false); g.Debug.Key("KeyW", false);
        return { yaw: p.yaw, moved: true, position: { x: p.position.x, z: p.position.z } };
      }
    }
    return { moved: false, position: { x: p.position.x, z: p.position.z } };
  });
  console.log("WITHDRAW_NUDGED", JSON.stringify(escaped));
  // 撤是撤，不是边退边打：fight 会让 Route 一看见残敌就停下开枪，走不到掩护区。
  // 末段绕过 BlastSafeBank 那道 1.35 m 的土坎西头（(−69.5..−62.5, z≈197.5)），
  // 别贴着它的角走。
  await Route([...Points(MISSION_STAGE_ROUTES.bridgeWithdraw.slice(0, -1)),
    { x: -73, z: 201.5 }, { x: A.blastSafe.x, z: A.blastSafe.z }],
  "BridgeWithdrawToSafe", { fight: false });
  {
    const shot = await Mission(page);
    assert.ok(shot.facts.includes("blastZoneCleared"), "玩家退到了南岸掩护区");
    // 「爆破区里还有己方就一直等」这条规则由 Script_FirstLevelEndTest 逐条守着；
    // 实机这一趟只记录它这次等没等 —— 人撤得快的时候可以一次都不用等。
    const held = shot.log.find(entry => entry.id === "blastHeldForFriendly");
    console.log("BLAST_HELD", JSON.stringify(held?.detail ?? null));
  }
  await WaitFact(page, "bridgeDestroyed", "18 爆破", 240);
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
  await WaitFact(page, "marchOrderHeard", "18 往滕县", 180);

  // --- 18 夜入滕城：先随队走完 marchOut，黑屏字幕，夜景，进北门 ---------------
  await WaitStage("NightMarch", 180, { fight: false });
  await Route(Points(MISSION_STAGE_ROUTES.marchOut), "NightMarchOut");
  await WaitFact(page, "marchOutReached", "18 走完 marchOut", 180);
  await Capture("NightFadeOut");
  await WaitFact(page, "nightArrivalPlaced", "18 黑屏里换夜景", 180);
  // 淡出走完、字幕正挂着的那一帧（黑屏 1 / 4 / 1，这里在 hold 的开头）。
  await Capture("NightSubtitle");
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
  await WaitControl(page, "18 夜行军淡入", 120);
  await Capture("NightFadeIn");
  await Route(Points(MISSION_STAGE_ROUTES.nightMarch.slice(1)), "NightMarchToGate");
  {
    const shot = await Mission(page);
    assert.ok(shot.voice.played.includes("NorthGate"), "带路军人在门外招呼");
    assert.ok(shot.facts.includes("northGateReached"), "走到北门下");
  }
  await WaitStage("Complete", 180);
}
