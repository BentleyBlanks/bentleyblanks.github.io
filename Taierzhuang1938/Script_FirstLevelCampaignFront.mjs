// 第一关整关驾驶脚本 · 阶段 1–7（受困 → 救援 → 支援 → 机枪 → 战车 → 接令 → 南行）。
// 归第二波 Front 包；公共部分在 Script_FirstLevelCampaignKit.mjs。
//
// 口径：全程只用正常输入（WASD / F / 鼠标 / H），不改任务事实、不瞬移、不发子弹外挂。
// 调试跳转只在 --stage-jumps 下生效，且每次跳转前上一段必须真的走到了下一个公开阶段。
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { MISSION_ROUTES as Routes, MISSION_ANCHORS as A, MISSION_PLACEMENT as P } from "./Data_FirstLevelMissionLayout.mjs";
import { MISSION_STAGE_ROUTES } from "./Data_FirstLevelMissionTopology.mjs";
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

  // =========================================================================
  // 01 受困：黑屏对白被近爆打断 → 只能转头 → 看清门外的刺杀 → 日兵转向门内。
  // 玩家这一段没有任何输入，驾驶脚本要做的就是「像玩家一样坐着看完并核对」。
  // =========================================================================
  await JumpStage(1);
  const trappedStart = await page.evaluate(() => {
    const g = window.Tengxian, m = g.Debug.FirstLevelMission();
    return { stage: m.stage, control: m.control, stance: g.player.stance, emptyHands: m.emptyHands,
      captives: m.front.bunker.captives.length };
  });
  assert.equal(trappedStart.stage, "Trapped");
  assert.equal(trappedStart.control, "trapped", "受困段由 trapped 接管，玩家只能小幅转头");
  assert.ok(trappedStart.emptyHands, "被压住的时候手里没有枪");
  console.log("TRAPPED_START", JSON.stringify(trappedStart));

  // 逐拍推进并取证：近爆 → 行刑 → 踢枪 → 转向门内。
  const trappedFrames = [];
  for (let chunk = 0; chunk < 60; chunk++) {
    const state = await page.evaluate(() => {
      const g = window.Tengxian;
      g.StepFrames(30, 1 / 60, false);
      const m = g.Debug.FirstLevelMission();
      return { stage: m.stage, time: m.time, facts: m.facts, beats: m.front.bunker.beats,
        captives: m.front.bunker.captives, control: m.control };
    });
    trappedFrames.push(state);
    // 关键帧：受困视角看门外的行刑（第一刀、补刺、踢枪、转向门内各一张）。
    for (const [beat, name] of [["butt", "TrappedButt"], ["stab", "TrappedStab"], ["flank", "TrappedFlank"], ["creak", "TrappedDoor"]])
      if (state.beats.includes(beat) && !ctx.capturedActivities.has(name)) {
        ctx.capturedActivities.add(name);
        await page.evaluate(() => window.Tengxian.StepFrames(4, 1 / 60, true));
        await page.screenshot({ path: path.join(shots, `Scene_${name}.png`) });
      }
    if (state.stage !== "Trapped") break;
  }
  const trapped = trappedFrames.at(-1);
  await fs.writeFile(path.join(shots, "Data_Trapped.json"), JSON.stringify(trappedFrames, null, 2));
  for (const fact of ["bunkerCollapsed", "captivesKilled", "doorSearchStarted"])
    assert.ok(trapped.facts.includes(fact), `受困段真的记下了 ${fact}：` + JSON.stringify(trapped.facts));
  assert.deepEqual(trapped.beats.slice(0, 4), ["butt", "recoil", "rise", "stab"],
    "行刑按 BunkerKilling 的四句逐拍演：枪托砸倒 → 后缩 → 挣扎起身 → 挺刺刀");
  assert.ok(trapped.beats.includes("flank") && trapped.beats.includes("kick") && trapped.beats.includes("creak"),
    "侧面补刺、踢开步枪与木架轻响都演到了：" + JSON.stringify(trapped.beats));
  assert.ok(trapped.captives.every((actor) => !actor.alive), "两名失去抵抗能力的川军都被杀害了");
  assert.equal(trapped.stage, "BunkerRescue", "「日军开始检查门内」把 01 推到 02");
  console.log("ok 01 trapped: blackout banter, near miss, execution seen through the breach, search begins");

  // =========================================================================
  // 02 班长救人：掀木架 + 幺娃拉背包 → 还权 → 拾枪 → 撤入后交通壕 → 集结处
  // =========================================================================
  await JumpStage(2);
  const rescued = await page.evaluate(() => {
    const g = window.Tengxian;
    for (let i = 0; i < 60 * 60 && !g.Debug.FirstLevelMission().facts.includes("luoRescueComplete"); i++)
      g.StepFrames(1, 1 / 60, false);
    const m = g.Debug.FirstLevelMission();
    const Cast = (id) => g.ai.soldiers.find((a) => a.castId === id);
    return { facts: m.facts, control: m.control, stance: g.player.stance,
      luo: Cast("luo") && { ...Cast("luo").position }, yaowa: Cast("yaowa") && { ...Cast("yaowa").position },
      heyoutianFired: (Cast("heyoutian")?.lastFire || 0) > 0, position: { ...g.player.position } };
  });
  console.log("RESCUE", JSON.stringify(rescued));
  assert.ok(rescued.facts.includes("luoRescueComplete"), "掀木架那一段真的演完并还权");
  assert.ok(rescued.heyoutianFired, "何有田真的从后侧交通壕开了火（不是音效）");
  assert.ok(Math.hypot(rescued.yaowa.x - P.bunker.yaowaLift.x, rescued.yaowa.z - P.bunker.yaowaLift.z) < 4,
    "幺娃真的走到拉背包那一头：" + JSON.stringify(rescued.yaowa));
  await page.evaluate(() => window.Tengxian.StepFrames(4, 1 / 60, true));
  await page.screenshot({ path: path.join(shots, "Scene_Rescued.png") });

  // 拾枪：走到掉在地上那一支跟前按 F。
  await Route([{ x: P.bunker.rifle.x, z: P.bunker.rifle.z + 1.1 }], "BunkerRifle", { stance: "crouch" });
  await Interact();
  // 三条对白是排队播的（RescueCall → RescueLift → RescueOut），拾枪之后再等它们说完。
  const armed = await page.evaluate(() => {
    const g = window.Tengxian;
    for (let i = 0; i < 90 * 60 && g.Debug.FirstLevelMissionRuntime().flow.stage.id === "BunkerRescue"; i++)
      g.StepFrames(1, 1 / 60, false);
    const m = g.Debug.FirstLevelMission();
    return { stage: m.stage, facts: m.facts, emptyHands: m.emptyHands,
      played: m.voice.played, queue: m.voice.queue };
  });
  assert.ok(armed.facts.includes("rifleRecovered"), "F 真的把枪捡起来了");
  assert.ok(armed.facts.includes("rescueCallHeard"), "RescueCall 播完记下 rescueCallHeard");
  assert.ok(!armed.emptyHands, "拾枪之后手里有枪");
  // 三条是排队播的；这里只要它已经进了队（还权之后才排进去），播完在后交通壕那段核。
  assert.ok(armed.played.includes("RescueOut") || armed.queue.includes("RescueOut"),
    "「枪拿到！从后头走！」在还权之后排上了：" + JSON.stringify({ played: armed.played, queue: armed.queue }));
  assert.equal(armed.stage, "RearTrench", "拾枪之后 02 进入后交通壕那一段");
  console.log("ok 02 rescue: frame lifted, pack pulled, rifle recovered, RescueOut spoken");

  // 撤入后交通壕。先站直一下（探头挨骂那一条要真的被触发），再蹲着走完 ——
  // 门外那伙人是活的，一路站着走过去就是送人头。
  await Route([MISSION_STAGE_ROUTES.rearTrench[0]], "RearTrenchMouth", { fight: true, stance: "crouch" });
  const peeked = await page.evaluate(async () => {
    const g = window.Tengxian, { FRONT_TUNING } = await import("./Data_Tuning_FirstLevelFront.mjs");
    if (g.player.stance !== "stand") g.Debug.Key(g.player.stance === "crouch" ? "KeyC" : "KeyZ");
    g.StepFrames(Math.ceil((FRONT_TUNING.trenchPeekS + 0.6) * 60), 1 / 60, false);
    const played = g.Debug.FirstLevelMission().voice.played.includes("TrenchCurse");
    g.Debug.Key("KeyC");
    return { played, alive: g.player.alive };
  });
  console.log("TRENCH_PEEK", JSON.stringify(peeked));
  await Route(MISSION_STAGE_ROUTES.rearTrench.slice(1, 5), "RearTrench", { fight: true, stance: "crouch" });
  // 途经集结处：先取证，再等指路那一段说完。
  await CaptureFocus("CollectionPass", A.collection);
  await page.screenshot({ path: path.join(shots, "Scene_CollectionPass.png") });
  await WaitStage("Support", 240, { fight: true, cover: true });
  const trench = await page.evaluate(() => {
    const m = window.Tengxian.Debug.FirstLevelMission();
    return { stage: m.stage, facts: m.facts, played: m.voice.played, collection: m.front.collection };
  });
  console.log("REAR_TRENCH", JSON.stringify({ stage: trench.stage, collection: trench.collection }));
  for (const fact of ["rearTrenchEntered", "cornerReached", "collectionPointSeen", "supportOrdersHeard"])
    assert.ok(trench.facts.includes(fact), `后交通壕这一段记下了 ${fact}`);
  assert.ok(trench.played.includes("RescueOut"), "「枪拿到！从后头走！」真的播了");
  assert.ok(trench.played.includes("TrenchCurse"), "在沟里站直真的挨了骂（TrenchCurse）");
  assert.ok(trench.played.includes("CornerCheck"), "折角处幺娃检查顺子（CornerCheck）");
  assert.ok(trench.collection.dressed && trench.collection.litters >= 4 && trench.collection.people >= 8,
    "途经集结处：担架、伤员与搬运人员都在场：" + JSON.stringify(trench.collection));
  assert.equal(trench.stage, "Support", "指了路就进 03");
  console.log("ok 02 rear trench: corner check, casualty collection point seen, support orders heard");

  // =========================================================================
  // 03 接回第一批守军：沿后交通壕尽头上前沿，压住封锁撤路的火力。
  // =========================================================================
  await JumpStage(3);
  // 行军段用 crawl 口径：只跟 28 m 内的人交火，远处那一片交给到位之后的守点循环。
  // 用 90 m 的口径会把整条沟走成「站着对着五十米外连打」，人根本挪不动窝。
  await Route([...MISSION_STAGE_ROUTES.rearTrench.slice(5), ...Routes.support.slice(-1)], "SupportApproach",
    { fight: true, crawl: true, stance: "crouch",
      rejoinRoute: [...MISSION_STAGE_ROUTES.rearTrench, ...Routes.support.slice(-1)] });
  const support = await WaitStage("MachineGun", 300, { fight: true, cover: true });
  await page.screenshot({ path: path.join(shots, "Scene_FrontSupport.png") });
  assert.ok(support.mission.facts.includes("frontRifleDefense"), "用步枪在前沿顶住了那一段");
  assert.ok(support.mission.facts.includes("rifleWithdrawalResolved"), "第一批守军真的撤回沟内");
  assert.ok(support.mission.voice.played.includes("FrontBlockade"), "老周指出右边破墙那个口子");
  assert.ok(support.mission.guards.slice(0, 2).some((guard) => guard.safe && guard.alive),
    "第一批里至少有一个活着撤回来（不是八个全死算过）");
  console.log("ok 03 support: blockade called, first pair of defenders withdrew alive");

  // =========================================================================
  // 04 接替火力，战车压口。机枪是可选的，但这一趟真的坐上去打。
  // =========================================================================
  await JumpStage(4);
  // 04 不再触发关中过场《空地上的三个人》（契约 §2）。
  assert.equal(await page.evaluate(() => window.Tengxian.state.cutscene || null), null,
    "04 不由任务触发 CS_MachineGunCaptives");
  // 枪座就在三米外的沟里：这一小段不开火（fight 的 90 m 口径会让人站着对射、原地不动）。
  await Route([{ x: 0, z: -124 }, { x: 0, z: -127.4 }], "MachineGunSeat", { stance: "crouch" });
  await Interact();
  const mounted = await page.evaluate(() => window.Tengxian.emplacement.Mounted);
  console.log("MACHINE_GUN_MOUNTED", mounted);
  await Capture("MachineGun");
  await page.screenshot({ path: path.join(shots, "Scene_MachineGun.png") });
  for (let chunk = 0; chunk < 40; chunk++) {
    const defense = await page.evaluate(() => {
      const g = window.Tengxian;
      for (let i = 0; i < 600; i++) {
        const p = g.player.position, gun = g.emplacement.Emplacement("MissionGun");
        if (g.combat.GrenadeThreats(p).length && g.emplacement.Mounted) {
          g.Debug.Mouse(0, false); g.Debug.Key("KeyF", true); g.Debug.Key("KeyF", false);
        }
        if (!g.emplacement.Mounted) {
          if (window.MissionInputDriver.EvadeGrenade()) { g.StepFrames(1, 1 / 60, false); continue; }
          const foe = window.MissionInputDriver.Target(90);
          if (foe) window.MissionInputDriver.Shoot(foe);
          else { g.Debug.Mouse(0, false); g.Debug.Mouse(2, false); if (g.state.ammo === 0) g.Debug.Key("KeyR"); }
          if (g.player.bleeding && g.player.health < 85) g.Debug.Key("KeyB");
          g.StepFrames(1, 1 / 60, false);
          if (g.Debug.FirstLevelMissionRuntime().flow.stage.id !== "MachineGun" || !g.player.alive) break;
          continue;
        }
        const target = g.ai.soldiers
          .filter((a) => a.side === "ija" && a.alive && a.position.z < p.z - 3 &&
            Math.abs(Math.atan2(p.x - a.position.x, p.z - a.position.z) - gun.baseYaw) < gun.arc.yaw - 0.03)
          .sort((a, b) => a.position.distanceToSquared(p) - b.position.distanceToSquared(p))
          .find((a) => {
            const from = g.player.EyePosition.clone(), to = a.position.clone();
            to.y += a.stance === 2 ? 0.45 : a.stance === 1 ? 1 : 1.55;
            const d = to.sub(from), len = d.length();
            const hit = g.battlefield.Raycast(from, d.normalize(), len, { terrain: true });
            return !hit || hit.t >= len - 0.3;
          });
        if (target) {
          const eye = g.player.EyePosition, dx = target.position.x - eye.x, dz = target.position.z - eye.z;
          g.player.yaw = Math.atan2(-dx, -dz);
          g.player.pitch = Math.atan2(target.position.y + (target.stance === 2 ? 0.45 : target.stance === 1 ? 1 : 1.55) - eye.y, Math.hypot(dx, dz));
          g.Debug.Mouse(0, true);
        } else g.Debug.Mouse(0, false);
        if (g.player.bleeding && g.player.health < 85) g.Debug.Key("KeyB");
        if (gun.rounds === 0) g.Debug.Key("KeyR");
        g.Debug.Key("KeyR", !!gun.jam);
        g.StepFrames(1, 1 / 60, false);
        if (g.Debug.FirstLevelMissionRuntime().flow.stage.id !== "MachineGun" || !g.player.alive) break;
      }
      g.Debug.Mouse(0, false); g.Debug.Key("KeyR", false);
      return { stage: g.Debug.FirstLevelMissionRuntime().flow.stage.id, alive: g.player.alive,
        health: g.player.health, gun: g.emplacement.View(), mission: g.Debug.FirstLevelMission() };
    });
    console.log("defense", JSON.stringify({ stage: defense.stage, health: defense.health, gun: defense.gun,
      remaining: defense.mission.remaining }));
    if (!defense.alive || defense.stage !== "MachineGun") { ctx.machineGun = defense; break; }
    if (defense.gun && defense.gun.rounds === 0 && defense.gun.belts === 0) {
      await page.evaluate(() => { const g = window.Tengxian; g.Debug.Key("KeyF", true); g.StepFrames(1, 1 / 60, false); g.Debug.Key("KeyF", false); });
      await Route([{ x: 0, z: -124 }, { x: -2.2, z: -122.5 }], "MachineGunResupply", { stance: "crouch" });
      await Interact();
      if (await page.evaluate(() => window.Tengxian.Debug.FirstLevelMission().stage) === "MachineGun") {
        await Route([{ x: 0, z: -124 }, { x: 0, z: -127.4 }], "ReturnToMachineGun", { stance: "crouch" });
        if (await page.evaluate(() => window.Tengxian.Debug.FirstLevelMission().stage) === "MachineGun") await Interact();
      }
    }
    ctx.machineGun = defense;
  }
  const gunStage = ctx.machineGun;
  await fs.writeFile(path.join(shots, "Data_MachineGun.json"), JSON.stringify(gunStage?.mission ?? null, null, 2));
  assert.ok(gunStage?.alive, "机枪段玩家活下来了");
  assert.equal(gunStage.stage, "Tank", "守军退到最后遮挡、战车压口，04 自己推到 05");
  for (const fact of ["zhouGunWounded", "frontAttackRepelled", "guardWithdrawalResolved", "tankBlocksExit", "bundleOrderHeard"])
    assert.ok(gunStage.mission.facts.includes(fact), `04 记下了 ${fact}`);
  assert.ok(gunStage.mission.voice.played.includes("TankTerror"), "战车出现时何有田喊了那一声");
  // 指路的那个守军是从还活着的撤退守军里挑的；八个人全阵亡的那一趟就没人可挑，
  // 命令仍然下达（bundleOrderHeard 上面已经断言过）。这里只记录，不当硬条件。
  console.log("BUNDLE_ORDER_GUARD", JSON.stringify(gunStage.mission.front.bundleOrderGuard));
  console.log("ok 04 machine gun: Zhou wounded off the gun, attack repelled, tank blocks the exit, bundle ordered");

  // =========================================================================
  // 05 班长带路取弹，炸停战车
  // =========================================================================
  await JumpStage(5);
  await page.evaluate(() => { const g = window.Tengxian; if (g.emplacement.View()) g.Debug.Key("KeyF"); g.Debug.Key("KeyB"); });
  await Route([{ x: 0, z: -124 }, { x: -2.2, z: -122.5 }], "FrontResupply", { stance: "crouch" });
  await Idle(page, R.supplyCooldownS + 1);
  const clipsBefore = await page.evaluate(() => window.Tengxian.state.clips);
  await Interact();
  assert.equal(await page.evaluate(() => window.Tengxian.state.clips), clipsBefore + R.frontSupplyClips,
    "前沿补给箱真的补了弹");
  // 出击前把绷带补满。旧驾驶脚本一直这么做 —— 只带一卷去爬那条侧沟，
  // 三次检查点重试全烧在半路上（2026-09-20 实测 3/2 超预算）。
  for (let refill = 0; refill < 3 && await page.evaluate(() => window.Tengxian.player.bandages) < 3; refill++) {
    await Idle(page, R.supplyCooldownS + 1);
    await Interact();
  }
  console.log("BANDAGES", await page.evaluate(() => window.Tengxian.player.bandages));
  await Route([{ x: 0, z: -124 }, ...Routes.bundle, { x: A.bundle.x, z: A.bundle.z + 1.2 }], "BundleApproach",
    { fight: true, stance: "stand", sprint: true, crawl: true, rejoinRoute: Routes.bundle });
  await page.evaluate(() => { const g = window.Tengxian; if (g.player.bleeding) g.Debug.Key("KeyB"); g.StepFrames(1, 1 / 60, false); });
  await Interact();
  const taken = await page.evaluate(() => ({
    bundles: window.Tengxian.state.bundles,
    mission: window.Tengxian.Debug.FirstLevelMission(),
  }));
  assert.equal(taken.bundles, R.bundleSupplyCount, "弹药屋真的领到了集束弹");
  assert.ok(taken.mission.facts.includes("bundleRouteTraversed"), "侧沟线上的检查点与爬行段都真的走过了");
  assert.ok(taken.mission.voice.played.includes("BundleSupply"), "留守兵交代了「就剩这些了」");
  assert.ok(taken.mission.voice.played.includes("BundleProne"), "中段罗班长喊过「趴下！它转过来了！」");
  await page.screenshot({ path: path.join(shots, "Scene_BundleHouse.png") });
  await Route(Routes.bundleReturn, "TankFlank", { fight: true, stance: "stand", sprint: true, crawl: true, rejoinRoute: Routes.bundleReturn });
  for (let attempt = 0; attempt < 3; attempt++) {
    if (await page.evaluate(() => window.Tengxian.Debug.FirstLevelMission().tank.immobilized)) break;
    const thrown = await page.evaluate(() => {
      const g = window.Tengxian, tank = g.Debug.FirstLevelMission().tank, p = g.player.position;
      g.player.yaw = Math.atan2(p.x - tank.x, p.z - tank.z);
      g.player.pitch = 0.35;
      const distance = Math.hypot(p.x - tank.x, p.z - tank.z) - 0.4;
      const rise = g.battlefield.GroundHeight(tank.x, tank.z) - (g.player.EyePosition.y + 0.1);
      const cosine = Math.cos(g.player.pitch), sine = Math.sin(g.player.pitch) + 0.26;
      const speed = Math.sqrt(4.905 * distance * distance / (cosine * cosine * Math.max(0.1, distance * sine / cosine - rise)));
      const chargeFrames = Math.round(66 * Math.max(0.08, Math.min(1, (speed - 8) / 5)));
      const before = g.state.bundles;
      g.Debug.Key("KeyH", true); g.StepFrames(chargeFrames, 1 / 60, false); g.Debug.Key("KeyH", false);
      g.StepFrames(1, 1 / 60, false);
      if (g.player.stance === "stand") g.Debug.Key("KeyC");
      for (let frame = 0; frame < 300 && g.player.alive; frame++) {
        if (g.player.bleeding) g.Debug.Key("KeyB");
        g.StepFrames(1, 1 / 60, false);
      }
      return { before, after: g.state.bundles, alive: g.player.alive, mission: g.Debug.FirstLevelMission() };
    });
    console.log("BUNDLE_THROW", JSON.stringify({ before: thrown.before, after: thrown.after, tank: thrown.mission.tank }));
    if (thrown.mission.tank.immobilized) break;
    if (!thrown.alive) break;
  }
  await CaptureFocus("TankStopped", { x: await page.evaluate(() => window.Tengxian.Debug.FirstLevelMission().tank.x),
    z: await page.evaluate(() => window.Tengxian.Debug.FirstLevelMission().tank.z), height: 1.2 });
  await page.screenshot({ path: path.join(shots, "Scene_TankStopped.png") });
  const tankStage = await WaitStage("Orders", 240, { fight: true });
  for (const fact of ["tankImmobilized", "lastGuardsWithdrawn", "reliefInPosition"])
    assert.ok(tankStage.mission.facts.includes(fact), `05 记下了 ${fact}`);
  assert.ok(tankStage.mission.voice.played.includes("TankStopped"), "「停了！」在履带断掉之后说了");
  assert.ok(tankStage.mission.voice.played.includes("BundleReturnCall"), "返程何有田喊了「它往沟口挤了」");
  assert.ok(tankStage.mission.relief.some((entry) => entry.arrived), "接防人员真的进了阵位");
  console.log("ok 05 tank: bundle taken on the side ditch, tracks cut, last guards out, relief in position");

  // =========================================================================
  // 06 回到伤员集结处，接下后送（含借火戏）
  // =========================================================================
  await JumpStage(6);
  await Route(MISSION_STAGE_ROUTES.collectionReturn, "CollectionReturn",
    { fight: true, stance: "crouch", crawl: true, rejoinRoute: MISSION_STAGE_ROUTES.collectionReturn });
  const orders = await page.evaluate(() => {
    const g = window.Tengxian;
    for (let i = 0; i < 150 * 60 && g.Debug.FirstLevelMissionRuntime().flow.stage.id === "Orders"; i++) {
      if (g.player.bleeding && g.player.health < 85) g.Debug.Key("KeyB");
      g.StepFrames(1, 1 / 60, false);
    }
    const m = g.Debug.FirstLevelMission();
    return { stage: m.stage, facts: m.facts, played: m.voice.played, front: m.front, column: m.column };
  });
  console.log("ORDERS", JSON.stringify({ stage: orders.stage, borrow: orders.front.collection.borrow }));
  await page.screenshot({ path: path.join(shots, "Scene_BorrowLight.png") });
  for (const fact of ["ordersReached", "volunteerHeard", "lightShared", "zhouOnLitter", "columnDeparted"])
    assert.ok(orders.facts.includes(fact), `06 记下了 ${fact}`);
  assert.deepEqual(orders.front.collection.borrow, ["ask", "pat", "pocket", "offer", "light", "share", "wince"],
    "借火戏七个姿态按 BorrowLight 的句子与两处动作空当逐个对上：" + JSON.stringify(orders.front.collection.borrow));
  assert.ok(orders.front.collection.zhouLifted, "担架员真的把老周抬上了担架");
  assert.ok(orders.front.collection.runner, "传令兵在集结处");
  assert.equal(orders.stage, "South", "后送队起行把 06 推到 07");
  console.log("ok 06 orders: volunteered, matches pocketed, cigarette offered and lit, Zhou on the litter, column away");

  // =========================================================================
  // 07 沿沟南行：真走 135 m，目标时长 45–75 秒。
  // =========================================================================
  await JumpStage(7);
  await Route(Routes.southWalk, "SouthWalk", { fight: false, stance: "stand", sprint: false });
  const south = await WaitStage("Village", 120);
  await page.screenshot({ path: path.join(shots, "Scene_SouthWalk.png") });
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
