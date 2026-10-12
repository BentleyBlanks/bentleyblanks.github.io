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
import { MISSION_PLACEMENT as P, MISSION_ANCHORS as A } from "./Data_FirstLevelMissionLayout.mjs";
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
 * 边打边等某个条件成立（Kit 的 WaitStage 等的是「换步」，12 的两处威胁在同一步里）。
 * 用的还是那一套正常输入驱动器：选目标、开枪、躲手榴弹、蹲低。
 * `condition` 是一段在页面里求值的表达式源码（g = window.Tengxian，m = Debug.FirstLevelMission()，
 * r = Debug.FirstLevelMissionRuntime()）；`required` 为 false 时到点不成立只记日志不翻红。
 */
async function FightUntil(page, label, condition, seconds, { required = true } = {}) {
  let state;
  for (let chunk = 0; chunk < Math.ceil(seconds / 5); chunk++) {
    state = await page.evaluate(({ condition }) => {
      const g = window.Tengxian;
      const Test = new Function("g", "m", "r", "return !!(" + condition + ")");
      const Done = () => Test(g, g.Debug.FirstLevelMission(), g.Debug.FirstLevelMissionRuntime());
      for (let i = 0; i < 300 && g.player.alive; i++) {
        if (Done()) break;
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
      return { has: Done(), alive: g.player.alive, stage: mission.stage, time: +mission.time.toFixed(1),
        loaded: mission.column.loaded, departed: mission.column.departed };
    }, { condition });
    if (state.has || !state.alive) break;
  }
  console.log("fightUntil", label, JSON.stringify(state));
  assert.ok(state.alive, `${label}: player alive`);
  if (required) assert.ok(state.has, `${label}: 要真的成立（${JSON.stringify(state)}）`);
  return state;
}
const FightUntilFact = (page, fact, seconds, options) => FightUntil(page, fact, `m.facts.includes(${JSON.stringify(fact)})`, seconds, options);

/** 阶段 8–14。 */
export async function Drive(ctx) {
  const { page, output } = ctx;
  const { JumpStage, Capture, CaptureFocus, CapturePose, Route, Interact, WaitStage } = CampaignActions(ctx);
  const from = ctx.stageFrom;

  // 2026-10-12 0311 C 包（docs/Data_FirstLevel0311Refactor20261012Contract.md §3.6–3.9 / §7）：08–11 耿家庄巷战。
  // 两条侧路各跑一趟：CAMPAIGN_SIDE_ROUTE=alley 走西侧夹道（否则走灶屋）；`--stage-to=11` 走完 11 就收。
  const sideRoute = process.env.CAMPAIGN_SIDE_ROUTE === "alley" ? "alley" : "kitchen";
  const pacingMisses = [];
  const VillageState = () => page.evaluate(() => window.Tengxian.Debug.FirstLevelMissionRuntime().village.State());
  if (from <= 8) {
    console.log("SIDE_ROUTE", sideRoute);
    // --- 08 主街受阻：看见障碍 → 东巷来人 → 老耿揪妮儿指灶屋 → 担架停进遮挡 → 跨进侧路 ------
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
    // 主街是杀伤区：东巷来的人贴东墙根往北压（streetPush 逐个放出），站在北口打，不往街里钻。
    await FightUntil(page, "streetPush:first", "r.village.State().pushSpawned >= 1 && [...r.enemies.values()].some((a) => a.missionEncounter === 'streetPush')", 30);
    await FightUntil(page, "streetPush:second", "r.village.State().pushSpawned >= 2", 30, { required: false });
    await Capture("StreetKillZone");
    // 何有田 + 刘文财蹲在街口压东窗（outsideWatched 落在何有田到位那一刻）。
    await FightUntil(page, "outsideWatched", "m.facts.includes('outsideWatched')", 40, { required: false });
    // 回头朝西：灶屋门口的老耿揪着妮儿出来（GengHouse 三句、一巴掌、指灶屋）。担架队同时自己往 LitterHoldCover 后面的车位走。
    await Route([{ x: 72, z: -24.3 }, { x: 66, z: -24 }, { x: 61, z: -21.5 }], "BackToKitchenDoor", { fight: true });
    await FightUntil(page, "gengHouseOffered", "m.facts.includes('gengHouseOffered')", 30);
    // §6 概念图 08：主街被翻车堵、自己人蹲街口朝东窗、右手灶屋门、老耿揪着妮儿指门 —— 站在巷子西头朝街口看。
    await CapturePose("Concept08StreetMouth", { x: 52.6, z: -21.9, h: 1.6 }, { x: 68, z: -19, height: 1.2 });
    const geng = await page.evaluate(() => window.Tengxian.Debug.FirstLevelMission().gengFamily);
    console.log("GENG_HOUSE", JSON.stringify({ geng: geng.geng, nier: geng.nier, events: geng.events.slice(-8) }));
    assert.ok(geng.events.some((e) => e.name === "gengPose" && e.kind === "slap"), "老耿真的揪着妮儿扇了一巴掌");
    const pushed = await VillageState();
    assert.ok(pushed.pushSpawned >= 1 && pushed.streetFight.push.seenAt != null, "东巷来的人是看见街堵了之后逐个放的：" + JSON.stringify(pushed.streetFight.push));
    if (sideRoute === "kitchen") {
      // 班长查看相邻房屋 → KitchenDetour；他走他的，玩家跟进灶屋。
      await Route([{ x: 60, z: -21 }, { x: 58, z: -18 }, { x: 58, z: -12 }, { x: 58, z: -6 }], "KitchenEntry", { fight: true });
      assert.ok(await page.evaluate(() =>
        window.Tengxian.Debug.FirstLevelMission().facts.includes("kitchenEntered")), "玩家真的进了灶屋");
      await Capture("KitchenDoorway");
    } else {
      // 西侧夹道（灶屋—机枪屋之间 2.4 m 那条）：跨进北口记 westAlleyEntered，街口就不再补人。
      await Route([{ x: 55, z: -21 }, { x: 50.5, z: -19.5 }, { x: 50.5, z: -15 }], "WestAlleyEntry", { fight: true });
      assert.ok(await page.evaluate(() =>
        window.Tengxian.Debug.FirstLevelMission().facts.includes("westAlleyEntered")), "玩家真的跨进了西侧夹道");
      await Capture("WestAlleyMouth");
    }
    const stopped = await page.evaluate(() => {
      const g = window.Tengxian, m = g.Debug.FirstLevelMission(), r = g.Debug.FirstLevelMissionRuntime();
      // 推进点一过街口就不再补人：再推 30 s，放出来的人数不变。
      const before = r.village.State().pushSpawned;
      for (let i = 0; i < 1800; i++) g.StepFrames(1, 1 / 60, false);
      return { before, after: r.village.State().pushSpawned, stopped: m.facts.includes("streetPushStopped"), side: m.facts.includes("sideRouteEntered") };
    });
    console.log("STREET_PUSH_STOPPED", JSON.stringify(stopped));
    assert.ok(stopped.side && stopped.stopped && stopped.after === stopped.before, "跨进侧路之后街口不再补人：" + JSON.stringify(stopped));

    // --- 09 两条路汇到后院 ------------------------------------------------------
    // 08 的三条事实（看见障碍 / 担架停进遮挡 / 跨进侧路）齐了才换步。
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
    if (sideRoute === "alley") {
      // 夹道走到一半（≥ 8 m）机枪屋侧门里那个窜出来（alleyPopped）；这一段不开枪，要验的是他真的从门里出来。
      await Route([{ x: 50.5, z: -12 }, { x: 50.5, z: -6 }, { x: 50.5, z: 2 }, { x: 50.5, z: 8 }], "WestAlleyWalk", { fight: false, stopFact: "alleyPopped" });
      const popped = await page.evaluate(() => {
        const g = window.Tengxian, r = g.Debug.FirstLevelMissionRuntime(), pop = r.enemies.get("AlleyPop");
        return { popped: g.Debug.FirstLevelMission().facts.includes("alleyPopped"), alive: !!pop?.alive,
          at: pop ? { x: +pop.position.x.toFixed(1), z: +pop.position.z.toFixed(1) } : null, dormant: !!pop?.missionDormant };
      });
      console.log("ALLEY_POP", JSON.stringify(popped));
      assert.ok(popped.popped && popped.at && popped.at.x < 51.8, "进夹道 ≥ 8 m：他真的从机枪屋侧门里窜出来了：" + JSON.stringify(popped));
      // §6 概念图 09 夹道：夹道中段侧门窜出日军、尽头看见后院驴车。
      await page.evaluate(() => { const g = window.Tengxian; for (let i = 0; i < 12; i++) g.StepFrames(1, 1 / 60, false); });
      await CaptureFocus("Concept09WestAlley", popped.at ? { ...popped.at, height: 1.3 } : A.westAlleySouth);
      await FightUntil(page, "alleyPop:down", "!r.enemies.get('AlleyPop')?.alive", 60);
      // 进后院：妮儿在车边拍车板指屋顶（roofThrowerSpotted），6 s 后屋顶上那个投弹。
      await Route([{ x: 50.4, z: 12 }, { x: 50.2, z: 16.8 }, { x: 48.6, z: 20.5 }, { x: 47.5, z: 24.5 }], "AlleyIntoYard", { fight: true });
      await FightUntil(page, "roofThrowerSpotted", "m.facts.includes('roofThrowerSpotted') || m.facts.includes('roofThrowerDown')", 12);
      // §6 概念图 09 后院：院门正中、右边窗口机枪、妮儿在车上指屋顶、屋顶投弹者。
      await CapturePose("Concept09Courtyard", { x: 44.0, z: 32.2, h: 1.55 }, { x: 62, z: 18, height: 2.0 });
      await FightUntil(page, "roofThrowerDown", "m.facts.includes('roofThrowerDown')", 90);
      const roof = await VillageState();
      console.log("ROOF_THROWER", JSON.stringify({ roof: roof.streetFight.yard, placed: roof.roofPlaced, log: roof.log.filter((e) => /roof|throw/.test(e.name)) }));
      // 院里的物资箱（MissionSupplyCourtyard，院门内西侧）：夹道这一趟到连屋南门前枪里已经快打空了（实跑：弹尽死在门口）。
      await Route([{ x: 50, z: 27 }, { x: 50, z: 31.5 }], "CourtyardSupply", { fight: true });
      const supply = await Interact();
      assert.equal(supply.kind, "supply", "the courtyard crate provides real supplies");
      await page.evaluate(() => { const g = window.Tengxian; g.Debug.Key("KeyB"); g.StepFrames(1, 1 / 60, false); });
      // 侧间窗口那挺机枪：从后院东北角绕过去（侧间南门洞 x 65.6–69.6）。
      await Route([{ x: 56, z: 22 }, { x: 64, z: 20.2 }, { x: 67.6, z: 19.4 }], "YardToSideRoomDoor", { fight: true });
      // villageGunSilent 这条事实归 10（Courtyard 步里才记）：这里只认人真的打死了。
      await FightUntil(page, "villageGun:dead", "!r.enemies.get('VillageGunner')?.alive", 120);
      // 连屋：从南门进（58,15.5），过道里藏着的那个从北门扑出来 —— 同一套进门遭伏击。
      await Route([{ x: 60, z: 19.5 }, { x: 58, z: 17.8 }, { x: 58, z: 13.5 }], "ConnectedHouseSouthDoor", { fight: false, stopFact: "kitchenAmbushSprung" });
      // 他一扑出来就退回院子当中隔开距离打（四个上刺刀的会从南门一个一个出来；在门洞里跟四把刺刀顶，实跑三趟都死在门口）。
      await Route([{ x: 58, z: 19 }, { x: 52, z: 24 }, { x: 47, z: 27 }], "BackIntoYard", { fight: true });
    } else {
      // 09 进门遭伏击（2026-09-28，COD5 万岁冲锋式一次性按键）：跨出灶屋南门进过道，
      // 过道西段藏着的那个扑出来把顺子撞翻、压刀。这一段不开枪（fight:false）——
      // 要验的是按键反刺那条路；「提前击败」「被捅死重来」「追不上作罢」在 Script_FirstLevelMidTest。
      await Route([{ x: 58, z: -4 }, { x: 58, z: 0.2 }], "KitchenLink", { fight: false, stopFact: "kitchenAmbushSprung" });
    }
    const pinned = await page.evaluate((waitFrames) => {
      const g = window.Tengxian, r = g.Debug.FirstLevelMissionRuntime();
      for (const key of ["KeyW", "KeyS", "KeyA", "KeyD", "ShiftLeft"]) g.Debug.Key(key, false);
      for (let i = 0; i < waitFrames && r.village.ambush.Phase !== "prompt" && g.player.alive; i++) g.StepFrames(1, 1 / 60, false);
      g.StepFrames(6, 1 / 60, false);
      g.StepFrames(1, 1 / 60, true);
      return { phase: r.village.ambush.Phase, prompt: r.AmbushPromptView(), cinematic: r.AmbushCinematic,
        drop: +(g.player.meleeCameraDrop || 0).toFixed(3), alive: g.player.alive, hud: document.getElementById("hud")?.className,
        facts: g.Debug.FirstLevelMission().facts.filter((fact) => /kitchenAmbush/.test(fact)) };
    }, sideRoute === "alley" ? 1 : 300);
    console.log("KITCHEN_AMBUSH_PROMPT", JSON.stringify(pinned));
    // 走夹道那一趟从连屋南门进：他从过道北口那扇门扑出来要跑 17 m，lungeMaxS 1.4 s 够不着就作罢转普通白刃兵
    //（kitchenAmbushBroken，Script_FirstLevelKitchenAmbush 的既定收尾，QTE 本身一字没动）—— 那一趟只验「他真扑出来了」。
    let countered = null, risen = null;
    if (sideRoute === "alley" && pinned.phase !== "prompt") {
      assert.ok(pinned.facts.includes("kitchenAmbushSprung") && ["done", "preempted", "lunge"].includes(pinned.phase), "从南门进连屋：他真扑出来了（够不着就作罢转白刃）：" + JSON.stringify(pinned));
    } else {
    assert.equal(pinned.phase, "prompt", "进过道就被扑倒压住、屏幕上给出按键环：" + JSON.stringify(pinned));
    assert.ok(pinned.cinematic && pinned.prompt?.mode === "press" && pinned.prompt.key === "F" && pinned.drop > 0.9,
      "HUD 让位、倒地镜头、一次性按键环（F）：" + JSON.stringify(pinned));
    await page.screenshot({ path: path.join(output, "Scene_KitchenAmbushPrompt.png") });
    countered = await page.evaluate(() => {
      const g = window.Tengxian, r = g.Debug.FirstLevelMissionRuntime();
      g.Debug.Key("KeyF");
      g.StepFrames(12, 1 / 60, false);
      const mid = { phase: r.village.ambush.Phase, lead: !!r.village.AmbushLead()?.alive };
      g.StepFrames(1, 1 / 60, true);
      return mid;
    });
    await page.screenshot({ path: path.join(output, "Scene_KitchenAmbushCounter.png") });
    risen = await page.evaluate(() => {
      const g = window.Tengxian, r = g.Debug.FirstLevelMissionRuntime();
      for (let i = 0; i < 300 && r.village.ambush.Phase !== "done" && g.player.alive; i++) g.StepFrames(1, 1 / 60, false);
      return { phase: r.village.ambush.Phase, control: r.controls?.kind || null, alive: g.player.alive,
        pitch: +g.player.pitch.toFixed(3), weapon: g.player.meleeWeapon ?? null,
        facts: g.Debug.FirstLevelMission().facts.filter((fact) => /kitchenAmbush/.test(fact)) };
    });
    console.log("KITCHEN_AMBUSH_COUNTER", JSON.stringify({ countered, risen }));
    assert.ok(countered.phase === "countered" && !countered.lead, "按上 F：他死在反刺这一下上：" + JSON.stringify(countered));
    assert.ok(risen.phase === "done" && risen.control === null && risen.alive, "起完身还权：" + JSON.stringify(risen));
    assert.ok(Math.abs(risen.pitch) < 0.2, "起完身是平视的，不是仰着头看屋顶：" + risen.pitch);
    }
    await Capture("KitchenAmbushRisen");
    // 走夹道那一趟领头那个还活着（作罢转白刃）：边打边等其余三个放出来。
    if (sideRoute === "alley") await FightUntilFact(page, "meleeBreachStarted", 40);
    const breach = await page.evaluate(async () => {
      const g = window.Tengxian;
      for (let i = 0; i < 1800; i++) {
        g.StepFrames(1, 1 / 60, false);
        if (g.Debug.FirstLevelMission().facts.includes("meleeBreachStarted")) break;
      }
      return g.Debug.FirstLevelMission();
    });
    assert.ok(breach.facts.includes("meleeBreachStarted"), "那一拍收尾后连屋那一组其余三个真的从东巷进来了");
    await Capture("ConnectedHouseBreach");
    await WaitStage("Courtyard", 240, { fight: true });
    const melee = await page.evaluate(() => window.Tengxian.Debug.FirstLevelMission());
    assert.ok(melee.facts.includes("meleeResolved"), "连屋近处威胁解除");
    const windowThrow = await VillageState();
    console.log("WINDOW_THROW", JSON.stringify({ thrown: windowThrow.windowThrown, log: windowThrow.log.filter((e) => e.name === "throw") }));
    await fs.writeFile(path.join(output, "Data_MeleeBeat.json"), JSON.stringify({
      ambush: { pinned, countered, risen },
      engaged: melee.facts.includes("meleeEngaged"),
      windowHolding: melee.facts.includes("windowFireHolding"),
      windowThrown: windowThrow.windowThrown,
      melee: melee.melee,
    }, null, 2));

    // --- 10 守巷口，出村 ----------------------------------------------------------
    if (sideRoute === "kitchen") {
      if (await page.evaluate(() => window.Tengxian.Debug.FirstLevelMissionRuntime().enemies.get("VillageGunner")?.alive)) {
        // The adopted topology gives this shot to the connected house's east side
        // room. Walk through its real doorway and engage across the east alley.
        await Route([{ x: 58, z: 8.5 }, { x: 62.5, z: 8.5 }, { x: 65.5, z: 8.5 },
          { x: 70, z: 10 }], "CourtyardWindowGun", { fight: true });
        await FightUntilFact(page, "villageGunSilent", 90);
        assert.ok(await page.evaluate(() =>
          !window.Tengxian.Debug.FirstLevelMissionRuntime().enemies.get("VillageGunner").alive),
        "窗口那挺机枪是真打掉的");
        await Route([{ x: 65.5, z: 8.5 }, { x: 62.5, z: 8.5 }, { x: 58, z: 8.5 }],
          "SideRoomReturn", { fight: true });
      }
      // 从连屋南门出来进后院：妮儿在车边拍车板指屋顶，6 s 后屋顶上那个投弹。
      await Route([{ x: 58, z: 8 }, { x: 58, z: 18 }, { x: 53, z: 24 }], "CourtyardEntry", { fight: true });
      await FightUntil(page, "roofThrowerSpotted", "m.facts.includes('roofThrowerSpotted') || m.facts.includes('roofThrowerDown')", 12);
      await CapturePose("Concept09Courtyard", { x: 44.0, z: 32.2, h: 1.55 }, { x: 62, z: 18, height: 2.0 });
      await FightUntil(page, "roofThrowerDown", "m.facts.includes('roofThrowerDown')", 90);
      const roof = await VillageState();
      console.log("ROOF_THROWER", JSON.stringify({ roof: roof.streetFight.yard, placed: roof.roofPlaced, log: roof.log.filter((e) => /roof|throw/.test(e.name)) }));
      // 院里的物资箱先补一次（10 巷口要打两拨八个人）。
      await Route([{ x: 50, z: 27 }, { x: 50, z: 31.5 }], "CourtyardSupply", { fight: true });
      const supply = await Interact();
      assert.equal(supply.kind, "supply", "the courtyard crate provides real supplies");
      await page.evaluate(() => { const g = window.Tengxian; g.Debug.Key("KeyB"); g.StepFrames(1, 1 / 60, false); });
      // 走灶屋这一趟由玩家按 F 开门（老耿的拔闩在走夹道那一趟验）。
      await Route([{ x: 53, z: 28 }, { x: 53, z: 32.8 }], "CourtyardGate", { fight: true });
      await Interact();
      assert.ok(await page.evaluate(() =>
        window.Tengxian.Debug.FirstLevelMission().facts.includes("courtyardGateOpen")),
      "F 真的打开了院门");
    } else {
      // 走夹道这一趟不按 F：班长喊老耿开后门 —— 抱缸、拖桌、拔闩，门是他真拔开的。
      await Route([{ x: 56, z: 22 }, { x: 50, z: 27 }], "CourtyardWaitGeng", { fight: true });
      await FightUntil(page, "gengGate:open", "m.facts.includes('courtyardGateOpen')", 120);
      const gate = await page.evaluate(() => ({ village: window.Tengxian.Debug.FirstLevelMissionRuntime().village.State(), geng: window.Tengxian.Debug.FirstLevelMission().gengFamily }));
      const poses = gate.geng.events.filter((e) => e.name === "gengPose").map((e) => e.kind);
      console.log("GENG_GATE", JSON.stringify({ gate: gate.village.gengGate, poses, log: gate.village.log.filter((e) => e.name === "gengGate") }));
      assert.ok(["vat", "table", "unbar"].every((kind) => poses.includes(kind)), "老耿真的抱缸、拖桌、拔闩了：" + poses.join());
    }
    // §6 概念图 10：院门边看巷子、巷尾日军 + 草垛机枪、门楼在屋顶上方 —— 开门就出去守院门外东侧墙角 A.laneEast，
    // 蹲着只看东边：第一拨是门开了才从巷东头一个一个来的，第二拨从 30 s 起（机枪头一个）。
    await Route([{ x: 53, z: 35.6 }, { x: A.laneEast.x, z: A.laneEast.z }], "LaneEastPost", { fight: true, stance: "crouch" });
    await FightUntil(page, "courtyard:firstWave", "[...r.enemies.values()].filter((a) => a.missionEncounter === 'courtyard' && a.alive).length <= 2", 60, { required: false });
    await FightUntil(page, "laneWave2:gunner", "!!r.enemies.get('LaneGunner')", 60);
    await CapturePose("Concept10GateLane", { x: A.laneEast.x, z: A.laneEast.z, h: 1.55 }, { x: 77, z: 41.5, height: 1.4 });
    const columnFocus = await page.evaluate(() => window.Tengxian.Debug.FirstLevelMission().column.litters
      .filter((l) => l.visible && !l.loaded)
      .sort((a, b) => Math.hypot(a.x - 53, a.z - 35) - Math.hypot(b.x - 53, b.z - 35))[0]);
    if (columnFocus) await CaptureFocus("CourtyardColumn", columnFocus);
    assert.ok(!await page.locator("#hud").innerText()
      .then((text) => /担架已通过|通过[：:]?\s*\d+\s*[/／]/.test(text)),
    "passage counts stay out of the player HUD");
    // 担架只在巷口机枪被压住期间过门：压住（laneMgSuppressed）这件事要真的发生。
    await FightUntilFact(page, "laneMgSuppressed", 150);
    // 驴车夹在担架队中间出门，卡在门槛上：走灶屋那一趟玩家去车尾按 F 推；走夹道那一趟不推，10 s 后何有田去推。
    await FightUntil(page, "cart:threshold", "r.village.State().cartBeat?.phase === 'threshold' || r.village.State().cartBeat?.phase === 'out' || r.village.State().cartBeat?.phase === 'helping'", 180);
    if (sideRoute === "kitchen") {
      await Route([{ x: 53, z: 36.2 }, { x: 53, z: 33.6 }, { x: 53, z: 30.6 }], "CartTail", { fight: true });
      const push = await Interact();
      const pushedState = await VillageState();
      console.log("CART_PUSH", JSON.stringify({ push: push?.id ?? push, beat: pushedState.cartBeat }));
      assert.ok(await page.evaluate(() => window.Tengxian.Debug.FirstLevelMission().facts.includes("cartPushed")) || pushedState.cartBeat?.by === "heyoutian",
        "玩家在车尾按 F 推了车（或 10 s 窗口已过、何有田推了）：" + JSON.stringify(pushedState.cartBeat));
      await Capture("CartPush");
      await Route([{ x: 53, z: 33.6 }, { x: 53, z: 36 }, { x: A.laneEast.x, z: A.laneEast.z }], "BackToLaneEast", { fight: true });
    } else {
      await FightUntil(page, "cart:helped", "r.village.State().cartBeat?.phase === 'out'", 60);
      const helped = await VillageState();
      console.log("CART_HELP", JSON.stringify(helped.cartBeat));
      assert.ok(helped.cartBeat?.by === "heyoutian" || helped.cartBeat?.by === "player", "没人推的时候何有田去推了：" + JSON.stringify(helped.cartBeat));
    }
    await WaitStage("TransferApproach", 420, { fight: true });
    const passed = await page.evaluate(() => window.Tengxian.Debug.FirstLevelMission());
    assert.ok(passed.facts.includes("rearCoverDisengaged"), "队尾掩护真的脱离了才算过院子");
    assert.ok(passed.column.gatePassed > 0, "担架是真的从院门过去的");
    assert.ok(passed.gengFamily.cart.z > A.gate.z + 2, "驴车也真的出了院门：" + JSON.stringify(passed.gengFamily.cart));
    // 改稿节奏表（±40%）：08 约 2 分、09 约 2 分、10 约 2–2.5 分。
    const stages = passed.log.filter((e) => e.kind === "stage");
    const seconds = Object.fromEntries(stages.map((e, i) => [e.id, +((stages[i + 1]?.time ?? passed.time) - e.time).toFixed(1)]));
    console.log("STAGE_SECONDS", JSON.stringify(seconds));
    // 改稿的「站」与内部步骤不完全对齐：09「穿屋到后院」包含清窗口机枪与后院（流程里归 Courtyard，到院门真开为止），
    // 10「守巷口」从院门开了算到出村。按站折算；只断言上限（慢 = 卡住），下限只记 PACING_LOW（驾驶器不探索、打得快，
    // 不是关卡的毛病）。
    const gateAt = passed.log.find((e) => e.kind === "fact" && e.id === "courtyardGateOpen")?.time ?? stages.find((e) => e.id === "TransferApproach")?.time ?? passed.time;
    const meleeAt = stages.find((e) => e.id === "Melee")?.time, transferAt = stages.find((e) => e.id === "TransferApproach")?.time ?? passed.time;
    const stations = { Village: seconds.Village, Melee: +(gateAt - meleeAt).toFixed(1), Courtyard: +(transferAt - gateAt).toFixed(1) };
    console.log("STATION_SECONDS", JSON.stringify(stations));
    for (const id of ["Village", "Melee", "Courtyard"]) {
      const [lo, hi] = M.streetFight.targetSeconds[id];
      if (stations[id] > hi) pacingMisses.push(`${id} 用时 ${stations[id]} s 超过改稿节奏表上限 ${hi} s`);
      else if (stations[id] < lo) console.log("PACING_LOW", JSON.stringify({ station: id, seconds: stations[id], lo, hi }));
    }
  }

  if (from > 11) return;

  // --- 11 抵达桥头接运点 -------------------------------------------------------
  // 08 起连续跑到这里的话不再跳转（驴车要从主街南段真走到接运点）；`--stage-from=11` 才从 11 的起点起。
  if (from === 11) await JumpStage(11);
  // 2026.09.19 起内院门出来走绕回短巷（z≈39 的缺口）到障碍南侧 streetRejoin，
  // 再顺主街南下 —— 旧的 (64,52) 斜线现在压在短巷南墙上。
  await Route([{ x: 55, z: 39 }, { x: 66, z: 39 }, { x: 74, z: 39 }, { x: 77, z: 35 },
    { x: 78, z: 50 }, { x: 78, z: 62 }, { x: 78.4, z: 74 }, { x: 79.3, z: 83.2 }, { x: 79.3, z: 87 }, { x: 84, z: 92 },
    { x: 90, z: 98 }, { x: 95, z: 103 }], "TransferApproachWalk", { fight: true });
  // 辨认三样：接运区（到位）、桥头方向与村路来路（朝向门）。
  // 2026-10-12 C 包：08 起连续跑到这里时村里多出二十来具尸体与耿家一车人，回看村路那一帧两级阴影一起落下就到
  // 9.04–9.08 M（上限 9.0 M；跳转进 11 只量到 8.14 M）。两张辨认截图挪到 11 的回执写完之后再拍（预算门照旧断言），
  // 让节奏与驴车 / 问路的证据先落盘。
  await LookAt(page, M.bridgeHeadPoint);
  if (ctx.stageTo > 11) await Capture("TransferBridgeHead");
  await LookAt(page, M.villageRoadMouth);
  if (ctx.stageTo > 11) await Capture("TransferVillageRoad");
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
  // 2026-10-12 C 包：老耿的驴车夹在担架队中间真走到接运点东侧的停车位（gengCartArrived），GengCart 三句在车旁自说；
  // 顺子走到他跟前按 F 问往哪走（AskGeng → gengAsked）。
  await FightUntilFact(page, "gengCartArrived", 150);
  // §6 概念图 11：出门楼看接运点、驴车在队里、桥墩在远处 —— 从门楼洞口往南看。
  await CapturePose("Concept11TransferPoint", { x: 76.6, z: 49.5, h: 1.6 }, { x: 84, z: 108, height: 1.2 });
  // 老耿牵驴站在车旁（位置现算）：走到他跟前 1.6 m 按 F。
  const gengAt = await page.evaluate(() => {
    const g = window.Tengxian.Debug.FirstLevelMission().gengFamily.geng, p = window.Tengxian.player.position;
    const dx = p.x - g.x, dz = p.z - g.z, d = Math.hypot(dx, dz) || 1;
    return { x: g.x + dx / d * 1.6, z: g.z + dz / d * 1.6 };
  });
  await Route([{ x: 92, z: 104 }, gengAt], "AskGengWalk", { fight: true, arrivalM: 0.5 });
  const asked = await Interact();
  console.log("ASK_GENG", JSON.stringify({ asked: asked?.id ?? asked }));
  await FightUntil(page, "gengAsked", "m.facts.includes('gengAsked') || m.voice.played.includes('AskGeng')", 40);
  await CaptureFocus("GengCartArrived", await page.evaluate(() => window.Tengxian.Debug.FirstLevelMission().gengFamily.cart));
  await WaitStage("Transfer", 180, { fight: true });
  if (ctx.stageTo <= 11) {
    const summary = await page.evaluate(() => {
      const m = window.Tengxian.Debug.FirstLevelMission(), stages = m.log.filter((e) => e.kind === "stage");
      return { seconds: Object.fromEntries(stages.map((e, i) => [e.id, +((stages[i + 1]?.time ?? m.time) - e.time).toFixed(1)])),
        facts: m.facts.filter((f) => /geng|Geng|lane|alley|roof|streetPush|sideRoute|cartPushed/.test(f)), gengCart: m.transferCart?.gengCart ?? null };
    });
    console.log("VILLAGE_SEGMENT", JSON.stringify(summary));
    const [lo, hi] = M.streetFight.targetSeconds.TransferApproach;
    if (summary.seconds.TransferApproach > hi) pacingMisses.push(`TransferApproach 用时 ${summary.seconds.TransferApproach} s 超过改稿节奏表上限 ${hi} s`);
    else if (summary.seconds.TransferApproach < lo) console.log("PACING_LOW", JSON.stringify({ station: "TransferApproach", seconds: summary.seconds.TransferApproach, lo, hi }));
    await fs.writeFile(path.join(output, "Data_VillageSegment.json"), JSON.stringify({ sideRoute, ...summary, pacingMisses }, null, 2));
    // 两张辨认截图最后拍（Capture 的整帧预算门照旧断言）。
    await LookAt(page, M.bridgeHeadPoint);
    await Capture("TransferBridgeHead");
    await LookAt(page, M.villageRoadMouth);
    await Capture("TransferVillageRoad");
    // 节奏表（±40%）最后一起断言：证据（截图 / 回执）先留全。
    assert.deepEqual(pacingMisses, [], "各站时长要在改稿节奏表 ±40% 内");
    return;
  }

  // --- 12 掩护装载与离开：只有两处威胁，每解除一处真实推进一批 ------------------
  await JumpStage(12);
  // 2026-09-27 起 12 守来时路（docs/Data_FirstLevelTransferCover20260927.md）：弹药箱在村口低墙
  // 射口身后 (63.3,87.1)。从场院东头过去要走车路东墙的缺口（z 95.6–99.6）和西墙北头以北，
  // 不贴墙：Route 没有寻路。够得着 2.5 m，Route 可能停在终点前 0.8 m。
  await Route([{ x: 82, z: 97.6 }, { x: 78, z: 96 }, { x: 70, z: 88.5 }, { x: 64.4, z: 88.1 }],
    "TransferSupply", { fight: true });
  assert.equal((await Interact()).kind, "supply", "the transfer crate is actually within reach");
  await Route([{ x: 75.7, z: 86.0 }], "TransferLowWallPost", { fight: true });
  await Capture("TransferLowWallPost");
  const posted = await page.evaluate(() => window.Tengxian.Debug.FirstLevelMission().facts);
  assert.ok(posted.includes("transferArrived"), "顺子上了村口低墙的射位（transferArrived）");
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
  // 第二处威胁在守线右手的东巷（sideAlley 95.2,61），巷口被路东那排房挡着，从射口打不到，
  // 得沿低墙背后往右挪到东段（何有田右手边）。
  await Route([{ x: 78, z: 86.4 }, { x: 91.3, z: 86.4 }], "SideAlleyPost", { fight: true });
  await Capture("SideAlleyThreat");
  await FightUntilFact(page, "alleyThreatResolved", 420);
  // 两处都解除之后往场院里去（上车位在那一头），把射口让给接位的何有田。
  await Route([{ x: 78, z: 86.4 }, { x: 78, z: 95 }, { x: 78.5, z: 98 }], "TransferBackToPost", { fight: true });
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
  // 2026-09-30（12–18 白盒 C2 包）：真实驱动到 13 停车之后，从概念图 13_1 / 13_2 / 13_3 / 13_4 的机位各拍一张
  // （机位表 Data_FirstLevelWhitebox0518Cameras 同名条目）：车列、夹道高墙、墙脚路沟与残车都是真实流程里的样子。
  {
    const cams = (await import("./Data_FirstLevelWhitebox0518Cameras.mjs")).WHITEBOX_0518_CAMERAS;
    for (const id of ["13_1", "13_2", "13_3", "13_4"]) {
      const shot = cams.find((entry) => entry.id === id);
      await CapturePose("AirRaidView" + id, { x: shot.camera.x, z: shot.camera.z, h: shot.camera.h }, { x: shot.look.x, z: shot.look.z });
    }
  }

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
  // 2026-09-30：西侧夹道高墙 z 118.5–129.6 连续，卸车点 (72.6,135) 往北 (70,112) 的老走法会顶在墙上；
  // 改走南通道（transferEvac.lanes 的 South：卸车点旁的口 (72.8,133.4) → (64.6,125) → 下沟口），
  // 与 Script_FirstLevelMidTest 扫过的担架走廊是同一条。
  await Route([{ x: 72.8, z: 133.4 }, { x: 64.6, z: 125 }, { x: 54, z: 114 }], "CarryToDitch");
  await WaitStage("Rescue", 120);
  assert.equal(await page.evaluate(() => window.Tengxian.carry.Active), false,
    "Dive releases the original stretcher");
  const rescue = await WaitStage("Regroup", 300, { fight: true });
  for (const fact of ["zhouRecovered", "rescuePassageClear", "ditchSheltered", "columnOffRoad"])
    assert.ok(rescue.mission.facts.includes(fact), `14 的收尾事实 ${fact} 要真的落下`);
  await Capture("DiveAndRescue");
}
