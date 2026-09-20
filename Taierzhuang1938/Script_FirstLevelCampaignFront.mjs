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
  // 真录音串行到木架轻响约 30 s，之后两名搜索兵还要实际走到门口；按受困控制预算
  // 再留 5 s 观察窗，结束仍以 stage 状态到达为准，不把固定秒数当成推进事实。
  for (let chunk = 0; chunk < Math.ceil((R.trappedMaxS + 5) / 0.5); chunk++) {
    const state = await page.evaluate(() => {
      const g = window.Tengxian;
      g.StepFrames(30, 1 / 60, false);
      const m = g.Debug.FirstLevelMission();
      return { stage: m.stage, time: m.time, facts: m.facts, beats: m.front.bunker.beats,
        captives: m.front.bunker.captives, control: m.control,
        voice: m.voice.current, voiceLineIndex: m.front.bunker.killLine };
    });
    trappedFrames.push(state);
    // 关键帧：受困视角看门外的行刑（第一刀、补刺、踢枪、转向门内各一张）。
    for (const [beat, name] of [["butt", "TrappedButt"], ["stab", "TrappedStab"], ["flank", "TrappedFlank"], ["creak", "TrappedDoor"]])
      if (state.beats.includes(beat) && !ctx.capturedActivities.has(name)) {
        ctx.capturedActivities.add(name);
        // 木架响后留半秒，拍到两个人真实转身迈向门口，而不是刚写入 creak 的静止帧。
        await page.evaluate((frames) => window.Tengxian.StepFrames(frames, 1 / 60, true), beat === "creak" ? 30 : 4);
        await page.screenshot({ path: path.join(shots, `Scene_${name}.png`) });
      }
    if (state.stage !== "Trapped") break;
  }
  const trapped = trappedFrames.at(-1);
  await fs.writeFile(path.join(shots, "Data_Trapped.json"), JSON.stringify(trappedFrames, null, 2));
  const buttFrame = trappedFrames.find((frame) => frame.beats.includes("butt"));
  assert.equal(buttFrame?.voice, "BunkerKilling", "枪托第一拍只能从实际开播的 BunkerKilling 起");
  assert.ok((buttFrame?.voiceLineIndex ?? -1) >= 0,
    "BunkerKilling 还在队列里时不许用 elapsed 兜底提前演枪托");
  const creakFrame = trappedFrames.find((frame) => frame.beats.includes("creak"));
  assert.notEqual(creakFrame?.voice, "ShunziCurse", "顺子的低声咒骂必须播完，木架才响");
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
  // 目标点就是可交互步枪本身。原先额外向北偏 1.1 m，点落在坍塌门垛的胶囊边缘；
  // 玩家已经贴到枪前、HUD 也出现 F 提示，却会因离那个虚构偏移点 0.81 m 而被 Route 判失败。
  await Route([{ x: P.bunker.rifle.x, z: P.bunker.rifle.z }], "BunkerRifle", { stance: "crouch" });
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

  // Keep the real continuous 03→04 battlefield as evidence for the stage-jump
  // reconstruction. A debug preset must match observed casualties and assault
  // state; an arbitrary percentage would only tune the test's difficulty.
  const continuous04 = await page.evaluate(() => {
    const r=window.Tengxian.Debug.FirstLevelMissionRuntime();
    const actors=[...r.enemies].filter(([,a])=>["front","approach"].includes(a.missionEncounter))
      .map(([id,a])=>({id,encounter:a.missionEncounter,alive:a.alive,state:a.state,order:a.order,
        standby:!!a.missionFrontStandby,reserve:!!a.missionReserve,
        position:{x:+a.position.x.toFixed(2),z:+a.position.z.toFixed(2)},
        assault:a.missionAssault?{index:a.missionAssault.index,hold:+(a.missionAssault.hold||0).toFixed(2)}:null}));
    return {time:r.time,stage:r.flow.stage.id,
      alive:Object.fromEntries(["front","approach"].map(encounter=>[encounter,
        actors.filter(a=>a.encounter===encounter&&a.alive).length])),actors};
  });
  await fs.writeFile(path.join(shots,"Data_Stage04Continuous.json"),JSON.stringify(continuous04,null,2));
  console.log("STAGE04_CONTINUOUS",JSON.stringify({alive:continuous04.alive,
    frontDead:continuous04.actors.filter(a=>a.encounter==="front"&&!a.alive).map(a=>a.id),
    approachDead:continuous04.actors.filter(a=>a.encounter==="approach"&&!a.alive).map(a=>a.id)}));

  // =========================================================================
  // 04 接替火力，战车压口。机枪是可选的，但这一趟真的坐上去打。
  // =========================================================================
  await JumpStage(4);
  // 04 不再触发关中过场《空地上的三个人》（契约 §2）。
  assert.equal(await page.evaluate(() => window.Tengxian.state.cutscene || null), null,
    "04 不由任务触发 CS_MachineGunCaptives");
  // 上枪位之前不绕去补给箱：在那儿等两轮冷却＝站在沟里挨打（2026-09-20 实测当场阵亡），
  // 而且把弹板补到上限之后 05 的「前沿补给箱真的补了弹」就再也涨不动了。
  // 先等老周因伤退出枪位，再上去接替 —— 04 的拍子就是这么写的（TakeOverGun）。
  // 抢在他前头坐上枪座，交接那一拍演不完，zhouGunWounded 记不下来，04 永远过不去：
  // 2026-09-20 实测有一趟其余四条全记下了，就剩这一条，人在枪位上打到阵亡。
  const zhouOff = await page.evaluate(() => {
    const g = window.Tengxian;
    for (let i = 0; i < 60 * 60 && !g.Debug.FirstLevelMission().facts.includes("zhouGunWounded"); i++) {
      if (!window.MissionInputDriver.EvadeGrenade()) {
        const foe = window.MissionInputDriver.Target(60);
        if (foe) window.MissionInputDriver.Shoot(foe);
        else {
          g.Debug.Mouse(0, false); g.Debug.Mouse(2, false);
          if (g.state.activeSlot === "melee") g.Debug.Key("Digit1");
          if (g.state.ammo === 0) g.Debug.Key("KeyR");
        }
        // 打一段、缩回墙垛后面一段，和 WaitStage 的 cover 一个口径。
        if ((g.player.stance === "crouch") !== (g.ai.time % 5 < 2)) g.Debug.Key("KeyC");
      }
      if (g.player.bleeding && g.player.health < 85) g.Debug.Key("KeyB");
      g.StepFrames(1, 1 / 60, false);
      if (!g.player.alive) break;
    }
    g.Debug.Mouse(0, false); g.Debug.Mouse(2, false);
    const m = g.Debug.FirstLevelMission();
    return { wounded: m.facts.includes("zhouGunWounded"), health: g.player.health, alive: g.player.alive };
  });
  console.log("ZHOU_OFF_GUN", JSON.stringify(zhouOff));
  // 枪座就在三米外的沟里：这一小段不开火（fight 的 90 m 口径会让人站着对射、原地不动）。
  await Route([{ x: 0, z: -124 }, { x: 0, z: -127.4 }], "MachineGunSeat", { stance: "crouch" });
  await Interact();
  // 一下按不上就再按几下。枪座的交互半径不大，走到位那一帧人还在往前挪，
  // 按早了就落空 —— 落空之后这一段会变成「站在开阔地上用步枪对着四十个人打」。
  let mounted = await page.evaluate(() => window.Tengxian.emplacement.Mounted);
  for (let tries = 0; tries < 4 && !mounted; tries++) {
    await page.evaluate(() => window.Tengxian.StepFrames(20, 1 / 60, false));
    await Interact();
    mounted = await page.evaluate(() => window.Tengxian.emplacement.Mounted);
  }
  console.log("MACHINE_GUN_MOUNTED", mounted);
  await Capture("MachineGun");
  await page.screenshot({ path: path.join(shots, "Scene_MachineGun.png") });
  for (let chunk = 0; chunk < 40; chunk++) {
    const defense = await page.evaluate(({healHealth,remountHealth}) => {
      const g = window.Tengxian;
      for (let i = 0; i < 600; i++) {
        const p = g.player.position, gun = g.emplacement.Emplacement("MissionGun");
        if (g.combat.GrenadeThreats(p).length && g.emplacement.Mounted) {
          g.Debug.Mouse(0, false); g.Debug.Key("KeyF", true); g.Debug.Key("KeyF", false);
        }
        // A real player does not stay welded to the gun while bleeding out.
        // Leave it, crouch behind its wall, dress, and wait for the ordinary
        // bandage regeneration before exposing the torso again.
        if (g.emplacement.Mounted && g.player.bandages > 0
          && g.player.bleeding && g.player.health < healHealth) {
          g.Debug.Mouse(0, false); g.Debug.Key("KeyF", true); g.Debug.Key("KeyF", false);
          if (g.player.stance !== "crouch") g.Debug.Key("KeyC");
          g.Debug.Key("KeyB");
        }
        if (!g.emplacement.Mounted) {
          if (window.MissionInputDriver.EvadeGrenade()) { g.StepFrames(1, 1 / 60, false); continue; }
          // 被手榴弹赶下枪位（或压根没按上）之后，空当里再坐回去：
          // 这一段的活路是枪座后面那道墙垛，不是站在开阔地上跟人对枪。
          if (!g.combat.GrenadeThreats(p).length && !g.player.bleeding
            && g.player.health >= remountHealth && gun && !gun.dead && i % 90 === 45) {
            g.Debug.Key("KeyF", true); g.StepFrames(1, 1 / 60, false); g.Debug.Key("KeyF", false);
            if (g.emplacement.Mounted) continue;
          }
          const foe = window.MissionInputDriver.Target(90);
          // 没目标就缩回墙垛后面（和 WaitStage 的 cover 一个口径：打一段、藏一段）。
          const hide = !foe || g.state.ammo === 0 || g.ai.time % 5 < 2;
          if ((g.player.stance === "crouch") !== hide) g.Debug.Key("KeyC");
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
    },{healHealth:F.machineGunDriverHealHealth,remountHealth:F.machineGunDriverRemountHealth});
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
  // 补给箱把弹板加到**手里那支枪**的账上（AddSupplyClips 看 activeSlot）。
  // 近战/投掷槽在手的时候加的是 mags.primary，state.clips 一动不动 —— 先把步枪换回手里。
  const SupplyState = () => page.evaluate(() => {
    const g = window.Tengxian, point = g.interact.points.get("MissionSupplyFront");
    return { clips: g.state.clips, primaryClips: g.state.mags.primary?.clips ?? 0,
      activeSlot: g.state.activeSlot, emptyHands: g.Debug.FirstLevelMission().emptyHands,
      count: point?.count ?? null, reach: g.interact.Query(g.player)?.point?.id ?? null,
      bandages: g.player.bandages };
  });
  await page.evaluate(() => {
    const g = window.Tengxian;
    if (g.state.activeSlot !== "primary") g.Debug.Key("Digit1");
    g.StepFrames(20, 1 / 60, false);
  });
  const supplyBefore = await SupplyState();
  await Interact();
  let supplyAfter = await SupplyState();
  // 没吃上就再来一次（冷却 15 s；够不着就走回箱子跟前）。
  for (let retry = 0; retry < 2 && supplyAfter.count === supplyBefore.count; retry++) {
    await Idle(page, R.supplyCooldownS + 1);
    if (supplyAfter.reach !== "MissionSupplyFront")
      await Route([{ x: 0, z: -124 }, { x: -2.2, z: -122.5 }], `FrontResupplyRetry${retry}`, { stance: "crouch" });
    await Interact();
    supplyAfter = await SupplyState();
  }
  console.log("FRONT_SUPPLY", JSON.stringify({ before: supplyBefore, after: supplyAfter }));
  assert.ok(supplyAfter.count > supplyBefore.count, "前沿补给箱真的被用上了：" + JSON.stringify(supplyAfter));
  assert.equal(supplyAfter.clips, supplyBefore.clips + R.frontSupplyClips, "前沿补给箱真的补了弹");
  // 出击前把绷带补满。旧驾驶脚本一直这么做 —— 只带一卷去爬那条侧沟，
  // 三次检查点重试全烧在半路上（2026-09-20 实测 3/2 超预算）。
  for (let refill = 0; refill < 4 && await page.evaluate(() => window.Tengxian.player.bandages) < 3; refill++) {
    await Idle(page, R.supplyCooldownS + 1);
    if (!(await page.evaluate(() => window.Tengxian.interact.Query(window.Tengxian.player)?.point?.id === "MissionSupplyFront")))
      await Route([{ x: 0, z: -124 }, { x: -2.2, z: -122.5 }], `FrontDressings${refill}`, { stance: "crouch" });
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
  await LookShot("BundleHouse", A.bundle);
  await Route(Routes.bundleReturn, "TankFlank", { fight: true, stance: "stand", sprint: true, crawl: true, rejoinRoute: Routes.bundleReturn });
  for (let attempt = 0; attempt < 3; attempt++) {
    if (await page.evaluate(() => window.Tengxian.Debug.FirstLevelMission().tank.immobilized)) break;
    // 等它停下来再扔。战车在 advance/halt 之间循环，朝一辆正在开的车扔集束弹，
    // 引信烧完时车已经开出去七八米 —— 2026-09-20 实测三发全空。
    await page.evaluate(coveredRangeM => {
      const g = window.Tengxian;
      const Gap = () => {
        const tank = g.Debug.FirstLevelMission().tank, p = g.player.position;
        return Math.hypot(p.x - tank.x, p.z - tank.z);
      };
      // 先在沟里等它压过来，别自己横穿开阔地去够它。战车本来就朝玩家推进，
      // 而这一段的伤全在那二十几米没遮没挡的地上（实测跑过去之后只剩两成血，
      // 回集结处的路上连死三次）。
      for (let i = 0; i < 3600 && Gap() > coveredRangeM; i++) {
        if (g.player.bleeding && g.player.health < 85) g.Debug.Key("KeyB");
        g.StepFrames(1, 1 / 60, false);
      }
      for (let i = 0; i < 900 && g.Debug.FirstLevelMission().tank.moving; i++) g.StepFrames(1, 1 / 60, false);
    },F.bundleCoveredThrowRangeM);
    // The tank now reaches its authored exit-blocking stop inside the covered
    // throw radius. Stay at A.throw; a driver walking onto the road is a test bug.
    const covered = await page.evaluate(throwPoint => {
      const g=window.Tengxian,tank=g.Debug.FirstLevelMission().tank,p=g.player.position;
      return {gap:Math.hypot(p.x-tank.x,p.z-tank.z),
        throwGap:Math.hypot(p.x-throwPoint.x,p.z-throwPoint.z)};
    },A.throw);
    assert.ok(covered.throwGap<1.5,`driver stays at the covered throw point (${covered.throwGap.toFixed(2)} m)`);
    assert.ok(covered.gap <= F.bundleCoveredThrowRangeM+.5,
      `tank reaches the covered throw lane (${covered.gap.toFixed(2)} m)`);
    const thrown = await DriveBundleThrow(page);
    console.log("BUNDLE_THROW", JSON.stringify({ before: thrown.before, after: thrown.after,
      aim:thrown.aim,requested:thrown.requested,launch:thrown.launch,firstVelocityBreak:thrown.firstVelocityBreak,
      firstContact:thrown.firstContact,land:thrown.land,blast:thrown.blast,blastMiss:thrown.blastMiss,tank:thrown.mission.tank }));
    assert.ok(thrown.alive,`TankThrow${attempt}: player survives through the real bundle detonation`);
    if (thrown.mission.tank.immobilized) break;
    // 两发都扔完还没停住，就像玩家一样回弹药屋再领两发。
    if (thrown.after === 0) {
      await Route([...Routes.bundle.slice(4), { x: A.bundle.x, z: A.bundle.z + 1.2 }], `BundleRefill${attempt}`,
        { fight: true, stance: "stand", sprint: true, crawl: true, rejoinRoute: Routes.bundle });
      await Interact();
      assert.equal(await page.evaluate(() => window.Tengxian.state.bundles), R.bundleSupplyCount,
        "弹药屋再给了两发集束弹");
      await Route(Routes.bundleReturn, `TankFlankAgain${attempt}`,
        { fight: true, stance: "stand", sprint: true, crawl: true, rejoinRoute: Routes.bundleReturn });
    }
  }
  assert.ok(await page.evaluate(()=>window.Tengxian.Debug.FirstLevelMission().tank.immobilized),
    "05 cannot leave the throw point until a real bundle blast cuts the track");
  await CaptureFocus("TankStopped", { x: await page.evaluate(() => window.Tengxian.Debug.FirstLevelMission().tank.x),
    z: await page.evaluate(() => window.Tengxian.Debug.FirstLevelMission().tank.z), height: 1.2 });
  await page.screenshot({ path: path.join(shots, "Scene_TankStopped.png") });
  // 车停了就撤回前沿沟里。05 结束到 06 之间还要等最后一批守军撤完、接防班进阵位，
  // 那是好几十秒；蹲在侧沟口那个没遮挡的地方等，等不到（实测死在 WaitStage 里）。
  await Route([{ x: 25, z: -110 }, { x: 15, z: -111 }, { x: 6, z: -124 }, { x: 0, z: -124 }],
    "BackToFront", { fight: true, stance: "crouch", crawl: true });
  // 顺路在前沿补给箱补一次绷带，再包扎。
  await Idle(page, R.supplyCooldownS + 1);
  await Route([{ x: -2.2, z: -122.5 }], "TankRecovery", { stance: "crouch" });
  await Interact();
  await page.evaluate(() => {
    const g = window.Tengxian;
    for (let i = 0; i < 900 && (g.player.bleeding || g.player.health < 95) && g.player.bandages > 0; i++) {
      if (i % 90 === 0) g.Debug.Key("KeyB");
      g.StepFrames(1, 1 / 60, false);
    }
  });
  console.log("TANK_RECOVERY", JSON.stringify(await page.evaluate(() => ({
    health: window.Tengxian.player.health, bandages: window.Tengxian.player.bandages }))));
  const tankStage = await WaitStage("Orders", 240, { fight: true, cover: true });
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
  // 2026-09-20 演出打磨：借火不再随 ordersReached 自动开播 —— Notion 06 是老周
  // 「看见顺子经过」才开口。像玩家一样走到他跟前站定、脸朝着他。
  await Route([{ x: P.collection.borrowStand.x, z: P.collection.borrowStand.z }], "BorrowStand",
    { fight: false, stance: "stand" });
  await page.evaluate((zhou) => {
    const g = window.Tengxian, p = g.player.position;
    g.player.yaw = Math.atan2(p.x - zhou.x, p.z - zhou.z);
    g.player.pitch = 0;
    g.StepFrames(6, 1 / 60, false);
  }, { x: P.collection.zhouWall.x, z: P.collection.zhouWall.z });
  const borrowStand = await page.evaluate(() => {
    const g = window.Tengxian, m = g.Debug.FirstLevelMission();
    return { player: { x: +g.player.position.x.toFixed(2), z: +g.player.position.z.toFixed(2) },
      zhou: { x: +m.column.zhou.x.toFixed(2), z: +m.column.zhou.z.toFixed(2) },
      facts: m.facts, borrow: m.front.collection.borrow, said: m.voice.played };
  });
  console.log("BORROW_STAND", JSON.stringify(borrowStand));
  assert.ok(Math.hypot(borrowStand.player.x - borrowStand.zhou.x,
    borrowStand.player.z - borrowStand.zhou.z) <= F.borrowTriggerM + 0.5,
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
  assert.ok(orders.front.collection.runner, "传令兵在集结处");
  assert.equal(orders.stage, "South", "后送队起行把 06 推到 07");
  console.log("ok 06 orders: volunteered, matches pocketed, cigarette offered and lit, Zhou on the litter, column away");

  // =========================================================================
  // 07 沿沟南行：真走 135 m，目标时长 45–75 秒。
  // =========================================================================
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
