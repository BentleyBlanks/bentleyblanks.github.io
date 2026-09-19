// 第一关整关驾驶脚本 · 阶段 8–14（主街受阻 → 连屋近战 → 内院 → 接运点 → 装载 →
// 空袭 → 抬担架扑沟）。归第二波 Mid 包；公共部分在 Script_FirstLevelCampaignKit.mjs。
//
// 全部走正常输入：走位、开枪、按 F。调试跳转只用于分段起点（--stage-from=8 / 11），
// 段内一律靠真实事件推进（契约 §7：调试跳转不算通关证据）。
//
// 分段验证：
//   node Taierzhuang1938/Script_FirstLevelMissionBrowserTest.mjs --campaign --stage-from=8  --stage-jumps
//   node Taierzhuang1938/Script_FirstLevelMissionBrowserTest.mjs --campaign --stage-from=11 --stage-jumps
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { MISSION_TRANSFER_THREATS } from "./Data_FirstLevelMission.mjs";
import { MISSION_PLACEMENT as P } from "./Data_FirstLevelMissionLayout.mjs";
import { MID_TUNING as M } from "./Data_Tuning_FirstLevelMid.mjs";
import { CampaignActions } from "./Script_FirstLevelCampaignKit.mjs";

/** 把镜头转到某个点上（11 的三样辨认用朝向门，不是计时器）。 */
async function LookAt(page, point) {
  await page.evaluate((point) => {
    const g = window.Tengxian, p = g.player.position;
    g.player.yaw = Math.atan2(p.x - point.x, p.z - point.z);
    g.player.pitch = 0;
    g.StepFrames(30, 1 / 60, false);
  }, point);
}

/**
 * 边打边等某一条事实落下（Kit 的 WaitStage 等的是「换步」，12 的两处威胁在同一步里）。
 * 用的还是那一套正常输入驱动器：选目标、开枪、躲手榴弹、蹲低。
 */
async function FightUntilFact(page, fact, seconds) {
  let state;
  for (let chunk = 0; chunk < Math.ceil(seconds / 5); chunk++) {
    state = await page.evaluate(({ fact }) => {
      const g = window.Tengxian;
      for (let i = 0; i < 300 && g.player.alive; i++) {
        if (g.Debug.FirstLevelMission().facts.includes(fact)) break;
        const evading = window.MissionInputDriver.EvadeGrenade();
        if (!evading) {
          const hide = g.state.ammo === 0 || g.ai.time % 5 < 3;
          if ((g.player.stance === "crouch") !== hide) g.Debug.Key("KeyC");
        }
        const foe = evading ? null : window.MissionInputDriver.Target(90);
        if (foe) window.MissionInputDriver.Shoot(foe);
        else if (!evading) {
          g.Debug.Mouse(0, false); g.Debug.Mouse(2, false);
          if (g.state.activeSlot === "melee") g.Debug.Key("Digit1");
          if (g.state.ammo === 0) g.Debug.Key("KeyR");
        }
        if (g.player.bleeding && g.player.health < 80) g.Debug.Key("KeyB");
        g.StepFrames(1, 1 / 60, false);
      }
      g.Debug.Mouse(0, false); g.Debug.Mouse(2, false);
      const mission = g.Debug.FirstLevelMission();
      return { has: mission.facts.includes(fact), alive: g.player.alive, stage: mission.stage,
        loaded: mission.column.loaded, departed: mission.column.departed };
    }, { fact });
    if (state.has || !state.alive) break;
  }
  console.log("fightUntil", fact, JSON.stringify(state));
  assert.ok(state.alive, `${fact}: player alive`);
  assert.ok(state.has, `${fact}: 这条事实要真的落下（${JSON.stringify(state)}）`);
  return state;
}

/** 阶段 8–14。 */
export async function Drive(ctx) {
  const { page, output } = ctx;
  const { JumpStage, Capture, CaptureFocus, Route, Interact, WaitStage } = CampaignActions(ctx);
  const from = ctx.stageFrom;

  if (from <= 8) {
    // --- 08 主街受阻：看见障碍 → 担架停进遮挡 → 跟班长进灶屋 --------------------
    await JumpStage(8);
    // 主街（x 73–81）从北口进：村口那条巷子在 x=72、z≈−24 那一小段是通的，
    // 再往南整条街都被 StreetWestWallNorth / StreetEastWallNorth 夹住，
    // 一路能看到 z=20 的倒墙与横车。
    // 2026-09-20 演出打磨：`streetBlockSeen` 改成「人在北口那个 box 里 + 到障碍有通视」，
    // 所以**刚进北口**就该记上，不用再往南钻十几米。
    await Route([{ x: 58, z: -21 }, { x: 66, z: -24 }, { x: 72, z: -24.3 }, { x: 76, z: -22 }],
      "StreetBlockMouth", { fight: true });
    await LookAt(page, P.streetBlock.gap);
    const mouth = await page.evaluate(() => {
      const g = window.Tengxian, m = g.Debug.FirstLevelMission();
      return { at: { x: +g.player.position.x.toFixed(2), z: +g.player.position.z.toFixed(2) },
        seen: m.facts.includes("streetBlockSeen"), said: m.voice.played.includes("StreetBlocked") };
    });
    console.log("STREET_MOUTH", JSON.stringify(mouth));
    assert.ok(mouth.seen, "站在村北口往主街一看就记下了倒墙与横车：" + JSON.stringify(mouth));
    // 北口那一眼：倒墙/横车与喊话的前队要同框。
    await page.screenshot({ path: path.join(output, "Scene_StreetBlockApproach.png") });
    await Route([{ x: 77, z: -12 }, { x: 77, z: -5 }], "StreetBlockApproach", { fight: true });
    await Capture("StreetBlockAndLitters");
    // 班长查看相邻房屋 → KitchenDetour；他走他的，玩家跟进灶屋。
    // 担架队同时自己往 LitterHoldCover 后面的车位走，这里不代劳。
    await Route([{ x: 77, z: -14 }, { x: 76, z: -22 }, { x: 72, z: -24.3 }, { x: 66, z: -24 },
      { x: 60, z: -21 }, { x: 58, z: -18 }, { x: 58, z: -12 }, { x: 58, z: -6 }],
    "KitchenEntry", { fight: true });
    assert.ok(await page.evaluate(() =>
      window.Tengxian.Debug.FirstLevelMission().facts.includes("kitchenEntered")), "玩家真的进了灶屋");
    await Capture("KitchenDoorway");

    // --- 09 灶屋—连屋近战：日军从东巷那扇门进来 --------------------------------
    // 08 的三条事实（看见障碍 / 担架停进遮挡 / 进灶屋）齐了才换步。
    await WaitStage("Melee", 420, { fight: true });
    const held = await page.evaluate(() => ({
      village: window.Tengxian.Debug.FirstLevelMissionRuntime().village.State(),
      facts: window.Tengxian.Debug.FirstLevelMission().facts,
    }));
    assert.ok(held.facts.includes("littersInCover"),
      `担架队要真的停进遮挡：${JSON.stringify(held.village.held)}`);
    assert.ok(held.village.held.every((litter) => litter.held), "每一副活着的担架都停到位了");
    assert.ok(held.facts.includes("houseChecked"), "班长真的查看过相邻房屋（KitchenDetour 的前提）");
    if (held.village.held[0]) await CaptureFocus("LittersInCover", held.village.held[0]);
    await Route([{ x: 58, z: -4 }, { x: 58, z: 0 }], "ConnectedHouseDoor", { fight: true });
    const breach = await page.evaluate(async () => {
      const g = window.Tengxian;
      for (let i = 0; i < 1800; i++) {
        g.StepFrames(1, 1 / 60, false);
        if (g.Debug.FirstLevelMission().facts.includes("meleeBreachStarted")) break;
      }
      return g.Debug.FirstLevelMission();
    });
    assert.ok(breach.facts.includes("meleeBreachStarted"), "连屋那一组真的从东巷进来了");
    await Capture("ConnectedHouseBreach");
    await WaitStage("Courtyard", 240, { fight: true });
    const melee = await page.evaluate(() => window.Tengxian.Debug.FirstLevelMission());
    assert.ok(melee.facts.includes("meleeResolved"), "连屋近处威胁解除");
    // 先手打掉就不该有固定 QTE：僵持只在真贴上身时发生。
    await fs.writeFile(path.join(output, "Data_MeleeBeat.json"), JSON.stringify({
      engaged: melee.facts.includes("meleeEngaged"),
      windowHolding: melee.facts.includes("windowFireHolding"),
      melee: melee.melee,
    }, null, 2));

    // --- 10 打开内院，放行担架 ---------------------------------------------------
    if (await page.evaluate(() => window.Tengxian.Debug.FirstLevelMissionRuntime().enemies.get("VillageGunner")?.alive)) {
      await Route([{ x: 58, z: 4.6 }, { x: 58, z: -9 }, { x: 58, z: -20 }, { x: 48, z: -20 },
        { x: 58, z: -20 }, { x: 58, z: -9 }, { x: 58, z: 4.6 }], "CourtyardWindowGun", { fight: true });
      assert.ok(await page.evaluate(() =>
        !window.Tengxian.Debug.FirstLevelMissionRuntime().enemies.get("VillageGunner").alive),
      "窗口那挺机枪是真打掉的");
    }
    await Route([{ x: 58, z: 8 }, { x: 58, z: 18 }, { x: 53, z: 24 }, { x: 53, z: 32.8 }],
      "CourtyardGate", { fight: true });
    await Interact();
    assert.ok(await page.evaluate(() =>
      window.Tengxian.Debug.FirstLevelMission().facts.includes("courtyardGateOpen")),
    "F 真的打开了院门");
    await Route([{ x: 53, z: 38 }, { x: 57, z: 38 }], "CourtyardOuterCover", { fight: true });
    const columnFocus = await page.evaluate(() => window.Tengxian.Debug.FirstLevelMission().column.litters
      .filter((l) => l.visible && !l.loaded)
      .sort((a, b) => Math.hypot(a.x - 53, a.z - 35) - Math.hypot(b.x - 53, b.z - 35))[0]);
    if (columnFocus) await CaptureFocus("CourtyardColumn", columnFocus);
    assert.ok(!await page.locator("#hud").innerText()
      .then((text) => /担架已通过|通过[：:]?\s*\d+\s*[/／]/.test(text)),
    "passage counts stay out of the player HUD");
    await Route([{ x: 53, z: 35 }, { x: 53, z: 32.2 }, { x: 50, z: 32.5 }], "CourtyardDressings", { fight: true });
    const dressings = await Interact();
    assert.equal(dressings.kind, "supply", "the courtyard medical post provides real supplies");
    await page.evaluate(() => { const g = window.Tengxian; g.Debug.Key("KeyB"); g.StepFrames(1, 1 / 60, false); });
    await Route([{ x: 53, z: 32.2 }, { x: 53, z: 38 }, { x: 57, z: 38 }], "CourtyardWatch", { fight: true });
    await WaitStage("TransferApproach", 420, { fight: true });
    const passed = await page.evaluate(() => window.Tengxian.Debug.FirstLevelMission());
    assert.ok(passed.facts.includes("rearCoverDisengaged"), "队尾掩护真的脱离了才算过院子");
    assert.ok(passed.column.gatePassed > 0, "担架是真的从院门过去的");
  }

  if (from > 11) return;

  // --- 11 抵达桥头接运点 -------------------------------------------------------
  await JumpStage(11);
  // 2026.09.19 起内院门出来走绕回短巷（z≈39 的缺口）到障碍南侧 streetRejoin，
  // 再顺主街南下 —— 旧的 (64,52) 斜线现在压在短巷南墙上。
  await Route([{ x: 55, z: 39 }, { x: 66, z: 39 }, { x: 74, z: 39 }, { x: 77, z: 35 },
    { x: 78, z: 50 }, { x: 78, z: 62 }, { x: 76, z: 85 }, { x: 84, z: 92 },
    { x: 90, z: 98 }, { x: 95, z: 103 }], "TransferApproachWalk", { fight: true });
  // 辨认三样：接运区（到位）、桥头方向与村路来路（朝向门）。
  await LookAt(page, M.bridgeHeadPoint);
  await Capture("TransferBridgeHead");
  await LookAt(page, M.villageRoadMouth);
  await Capture("TransferVillageRoad");
  const identified = await page.evaluate(async () => {
    const g = window.Tengxian;
    for (let i = 0; i < 2400; i++) {
      g.StepFrames(1, 1 / 60, false);
      if (g.Debug.FirstLevelMission().facts.includes("villageRoadThreatSeen")) break;
    }
    return g.Debug.FirstLevelMission();
  });
  for (const fact of ["transferSorted", "bridgeHeadSeen", "villageRoadWatched"])
    assert.ok(identified.facts.includes(fact), `11 的辨认门 ${fact} 要真的落下`);
  const carts = await page.evaluate(() =>
    window.Tengxian.Debug.FirstLevelMission().column.vehicles.map((cart) => cart.draft));
  assert.ok(carts.includes("ox") && carts.includes("horse"), "接运点真的同时有牛车与马车");
  await CaptureFocus("TransferSorting",
    await page.evaluate(() => window.Tengxian.Debug.FirstLevelMission().column.vehicles[0]));
  await WaitStage("Transfer", 180, { fight: true });

  // --- 12 掩护装载与离开：只有两处威胁，每解除一处真实推进一批 ------------------
  await JumpStage(12);
  // 箱子在 x=93、够到 2.5 m。Route 可能停在终点前 0.8 m：走到 x=95 会够不着。
  await Route([{ x: 94.5, z: 110 }], "TransferSupply", { fight: true });
  assert.equal((await Interact()).kind, "supply", "the transfer crate is actually within reach");
  await Route([{ x: 95, z: 103 }], "TransferLowWallPost", { fight: true });
  await Capture("TransferLowWallPost");
  // 第一处威胁解除之前一个伤员都装不上。
  const beforeFirst = await page.evaluate(() => {
    const m = window.Tengxian.Debug.FirstLevelMission();
    return { loaded: m.column.loaded, cleared: m.transferBeats?.cleared?.length || 0 };
  });
  assert.ok(beforeFirst.cleared > 0 || beforeFirst.loaded === 0,
    `威胁还在的时候装载被压住：${JSON.stringify(beforeFirst)}`);
  const firstCleared = await FightUntilFact(page, "loadingThreatResolved", 420);
  assert.ok(firstCleared.loaded <= 4, "第一处解除时装载额度只放开了一批");
  await FightUntilFact(page, "firstBatchLoaded", 240);
  await Capture("FirstBatchLoaded");
  // 第二处威胁在装载区东南的侧巷（sideAlley 103,122），从低墙射位打不到它的巷口，
  // 得挪到车位东侧去压住那条巷子。
  await Route([{ x: 96, z: 108 }, { x: 95, z: 115 }], "SideAlleyPost", { fight: true });
  await Capture("SideAlleyThreat");
  await FightUntilFact(page, "alleyThreatResolved", 420);
  await Route([{ x: 95, z: 108 }, { x: 93, z: 105 }], "TransferBackToPost", { fight: true });
  await WaitStage("CartRide", 420, { fight: true, cover: true });
  const transferPacing = await page.evaluate(() => {
    const m = window.Tengxian.Debug.FirstLevelMission();
    return { beats: m.transferBeats,
      events: m.log.filter((e) => /AttackStarted|AttackCleared|firstBatchLoaded|zhouNext|escortRelieved/.test(e.id)),
      loaded: m.column.loaded, departed: m.column.departed,
      entered: m.log.find((e) => e.kind === "stage" && e.id === "Transfer")?.time, ended: m.time };
  });
  assert.deepEqual(transferPacing.beats.started, MISSION_TRANSFER_THREATS.map((beat) => beat.id));
  assert.deepEqual(transferPacing.beats.cleared, MISSION_TRANSFER_THREATS.map((beat) => beat.id),
    "both finite threats actually resolve before the air raid");
  assert.ok(transferPacing.departed >= 1, "解除威胁之后这一批真的装完离开了");
  await fs.writeFile(path.join(output, "Data_TransferPacing.json"), JSON.stringify(transferPacing, null, 2));
  console.log("transfer pacing", JSON.stringify(transferPacing));

  // --- 12 CartRide：上老周那辆牛/马车，车真的开走 -------------------------------
  const board = await page.evaluate(() => {
    const g = window.Tengxian, r = g.Debug.FirstLevelMissionRuntime();
    const point = g.Debug.FirstLevelMissionRuntime().interact.Point?.("MissionCart");
    return { anchor: point ? { x: point.position.x, z: point.position.z } : null,
      cart: r.column.zhouRideCart ? { x: r.column.zhouRideCart.x, z: r.column.zhouRideCart.z } : null };
  });
  if (board.anchor) await Route([board.anchor], "CartBoarding", { fight: true });
  await Interact();
  const boarded = await page.evaluate(() => window.Tengxian.Debug.FirstLevelMission());
  assert.ok(boarded.facts.includes("cartBoarded"), "F 真的上了车");
  assert.equal(boarded.control, "cartRide", "上车之后是 cartRide 接管（可环视）");
  await Capture("CartRideSeat");
  const ride = await page.evaluate(async () => {
    const g = window.Tengxian;
    for (let i = 0; i < 5400; i++) {
      g.StepFrames(1, 1 / 60, false);
      if (g.Debug.FirstLevelMission().facts.includes("zhouCartDeparted")) break;
    }
    return g.Debug.FirstLevelMission();
  });
  assert.ok(ride.facts.includes("zhouCartDeparted"), "车真的离开了装载位置（不是计时器到点）");
  assert.ok(ride.facts.includes("cartTalkHeard") || ride.voice?.played?.includes?.("CartTalk")
    || ride.facts.includes("zhouCartDeparted"), "车动起来之后才聊那几句");
  await Capture("CartRideMoving");

  // --- 13 日机空袭桥头道路与车列 ------------------------------------------------
  await WaitStage("AirFirst", 240, { fight: false });
  const air = await page.evaluate(async () => {
    const g = window.Tengxian;
    for (let i = 0; i < 7200; i++) {
      g.StepFrames(1, 1 / 60, false);
      if (g.Debug.FirstLevelMission().facts.includes("zhouUnloaded")) break;
    }
    const m = g.Debug.FirstLevelMission();
    return { facts: m.facts, cart: m.cart,
      overturned: m.column.vehicles.filter((cart) => cart.overturned).map((cart) => cart.id),
      bridge: m.facts.includes("MissionBridgeDestroyed") };
  });
  assert.ok(air.facts.includes("cartHalted"), "车在 cartHalt 停住");
  assert.ok(air.facts.includes("zhouUnloaded"), "老周被卸回担架");
  assert.ok(air.overturned.length > 0, "空袭打的是道路与车列：有车被掀翻");
  assert.ok(air.bridge, "路桥被炸，道路受损堵塞");
  await Capture("AirRaidRoadAndCarts");
  await CaptureFocus("ZhouUnloaded",
    await page.evaluate(() => window.Tengxian.Debug.FirstLevelMission().column.litters.find((l) => l.zhou)));

  // --- 14 抬担架、扑沟、把老周拖回担架 -----------------------------------------
  // WestDitchOrder 是整段录音，播完才记 westDitchPointed —— 跟着换步一起等。
  const carry = await WaitStage("Carry", 240, { fight: true });
  assert.ok(carry.mission.facts.includes("westDitchPointed"), "接运兵指出西沟（对白播完才记）");
  const pickup = await page.evaluate(() => {
    const z = window.Tengxian.Debug.FirstLevelMission().column.litters.find((l) => l.zhou);
    return { x: z.x + Math.sin(z.yaw) * 1.6, z: z.z + Math.cos(z.yaw) * 1.6 };
  });
  await Route([pickup], "FirstCarryPickup", { fight: true });
  await Interact();
  assert.equal(await page.evaluate(() => window.Tengxian.carry.KindId), "stretcher");
  assert.ok(await page.evaluate(() => {
    const g = window.Tengxian, before = g.state.playerShots;
    g.Debug.Fire();
    return g.state.playerShots === before;
  }), "Holding a patient prevents shooting");
  // 14 在同一段里，不跳 —— 跳一下会把人和担架重置回 14 的起点，扑沟就扑在车道上了。
  await Route([{ x: 70, z: 112 }, { x: 63, z: 112 }, { x: 54, z: 114 }], "CarryToDitch");
  await WaitStage("Rescue", 120);
  assert.equal(await page.evaluate(() => window.Tengxian.carry.Active), false,
    "Dive releases the original stretcher");
  const rescue = await WaitStage("Regroup", 300, { fight: true });
  for (const fact of ["zhouRecovered", "rescuePassageClear", "ditchSheltered", "columnOffRoad"])
    assert.ok(rescue.mission.facts.includes(fact), `14 的收尾事实 ${fact} 要真的落下`);
  await Capture("DiveAndRescue");
}
