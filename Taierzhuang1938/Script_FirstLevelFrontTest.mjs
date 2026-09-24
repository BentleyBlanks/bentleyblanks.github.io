// ===========================================================================
// Script_FirstLevelFrontTest.mjs —— 第一关公开阶段 1–7（Front 玩法包）的纯 Node 门禁
//
// 口径：docs/Data_FirstLevelFront20260919.md
// 需求：docs/Data_FirstLevelRebuildSource20260919.md 01–07
// 契约：docs/Data_FirstLevelRebuild20260919Contract.md §2 / §5 / §8
//
// 这里只验「表与纯函数」以及「运行时确实只留了薄钩子」。真实通关证据在
// Script_FirstLevelMissionBrowserTest.mjs --campaign 的 Front 段。
//
// 跑法：node Taierzhuang1938/Script_FirstLevelFrontTest.mjs
// ===========================================================================
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { MISSION_DIALOGUE } from "./Data_FirstLevelMissionDialogue.mjs";
import { MissionVoiceTimeline } from "./Data_FirstLevelMissionVoiceTiming.mjs";
import { MISSION_STAGES, MISSION_TUNING as R } from "./Data_FirstLevelMission.mjs";
import { MISSION_FACT_GATES } from "./Data_FirstLevelMissionGates.mjs";
import { MISSION_ANCHORS as A, MISSION_ROUTES, MISSION_PLACEMENT as P } from "./Data_FirstLevelMissionLayout.mjs";
import { MissionRouteProjection } from "./Script_FirstLevelMissionColumn.mjs";
import {
  FRONT_TUNING as F, FRONT_TUNING_SOURCES, BUNKER_KILL_BEATS, BORROW_LIGHT_BEATS,
  SouthWalkLengthM, SouthWalkSeconds,
} from "./Data_Tuning_FirstLevelFront.mjs";
import { CollectionDressing, BorrowPosesDue, BORROW_POSE_ORDER, BorrowLightCued } from "./Script_FirstLevelCollection.mjs";
import { SouthPointerSpot, FRONT_WIRED_CUES } from "./Script_FirstLevelFrontShow.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const Read = (name) => fs.readFileSync(path.join(here, name), "utf8");
const Cue = (id) => MISSION_DIALOGUE.find((cue) => cue.id === id);

// 01–02 follow the 2026-09-23 draft (contract §5.2/§5.3). Phase tables and marks live in
// Script_OpeningStoryboardsTest; normal controls run in CampaignOpening.
{
  for(const id of ["BunkerKilling","ShunziCurse","RescueCall","RescueLift","RescueOut","TrenchCurse","CornerCheck"])
    assert.equal(Cue(id),undefined,id+" is retired (contract §5.2)");
  assert.equal(Cue("CaptiveInterrogation").lines.length,11);
  assert.equal(Cue("RescueInterrogation").lines.length,6);
  const opening=Read("Script_OpeningStoryboards.mjs");
  assert.ok(opening.includes('this.captives=[this.cast.comrade]'));
  for(const scene of ["BunkerOrders","CaptiveInterrogation","RescueInterrogation","RescueCheck","CollectionMeet","SupportOrder"])
    assert.ok(opening.includes('PlayScene("'+scene+'"'),scene);
  assert.ok(opening.includes('this.r.meleeCombat?.Damage(victim,attacker,200,"heavy")'));
  assert.ok(opening.includes('r.Record("luoRescueComplete")'));
  const support=MISSION_STAGES.find(stage=>stage.id==="Support");
  assert.ok(JSON.stringify(support).includes("rifleWithdrawalResolved"));
  assert.ok(Read("Script_FirstLevelMissionRuntime.mjs").includes('actor.suppression >= R.threatSuppression'));
  assert.ok(Read("Script_FirstLevelFrontBattle.mjs").includes('r.Threatens(p,null,B.guardHeightM,B.blockadeRangeM)'));
}

// ---------------------------------------------------------------------------
// 4. 06 借火：九句台词、两处动作空当与七个姿态
// ---------------------------------------------------------------------------
{
  const borrow = Cue("BorrowLight");
  assert.equal(borrow.lines.length, 9, "借火戏是九句");
  const lineBeats = BORROW_LIGHT_BEATS.filter((beat) => Number.isInteger(beat.line));
  assert.ok(lineBeats.every((beat) => beat.line < borrow.lines.length), "挂的句子都在 BorrowLight 里");
  const events = (MissionVoiceTimeline(borrow, 21.81).segments[0].events || []).map((event) => event.id);
  assert.deepEqual(events, ["BorrowLightMatchesPocketed", "BorrowLightCigaretteOffered"],
    "两处动作空当的具名事件还在");
  for (const beat of BORROW_LIGHT_BEATS.filter((b) => b.event))
    assert.ok(events.includes(beat.event), `借火的动作拍挂在真实事件 ${beat.event} 上`);
  assert.deepEqual(BorrowPosesDue(8, new Set(events)), ["ask", "pat", "pocket", "offer", "light", "share"],
    "九句说完＋两处事件都到，六个姿态齐了（皱眉那一下由 share 之后的短停带出来）");
  assert.deepEqual(BorrowPosesDue(0, new Set()), ["ask"], "刚开口只摆「靠着土壁要火」那一下");
  assert.deepEqual(BorrowPosesDue(4, new Set()), ["ask", "pat"],
    "「就剩这一根了」之前只摸了兜；收火柴要等事件，不许提前");
  assert.deepEqual(BORROW_POSE_ORDER, ["ask", "pat", "pocket", "offer", "light", "share", "wince"],
    "State().collection.borrow 的顺序＝原文的动作顺序");
}

// ---------------------------------------------------------------------------
// 4b. 06 借火的取景（2026-09-20 演出打磨）
//
// 实拍出来的问题：画面被两名担架员的后背挡满、老周不在画里、玩家也没面向他。
// Notion 06 是老周「看见顺子经过」才开口 —— 所以这一段要玩家走到跟前、脸朝着他，
// 而担架员要在两人中间那条轴线之外等着。
// ---------------------------------------------------------------------------
{
  const zhou = P.collection.zhouWall, stand = P.collection.borrowStand;
  const Distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
  assert.ok(Distance(stand, zhou) <= F.borrowTriggerM,
    `借火站位在触发圈里：${Distance(stand, zhou).toFixed(2)} m ≤ ${F.borrowTriggerM}`);
  // 站在那儿、面朝老周 → 开播；背对他或者隔着五米 → 不开播。
  const facing = Math.atan2(stand.x - zhou.x, stand.z - zhou.z);
  assert.ok(BorrowLightCued(stand, zhou, facing), "走到跟前、脸朝着老周就开口");
  assert.ok(!BorrowLightCued(stand, zhou, facing + Math.PI), "背对着他不开口");
  assert.ok(!BorrowLightCued({ x: stand.x, z: stand.z - 5 }, zhou, facing), "隔着五米不开口");
  // 担架员与摆位人员都让开「玩家 → 老周」那条轴线，也不贴着老周站。
  assert.equal(P.collection.bearerWait.length, 2, "抬老周的是两个人");
  assert.equal(P.collection.bearerClose.length, P.collection.bearerWait.length,
    "等待位与走上来之后的位置一一对应");
  const OffAxis = (p) => {
    const dx = zhou.x - stand.x, dz = zhou.z - stand.z, len2 = dx * dx + dz * dz;
    const t = Math.max(0, Math.min(1, ((p.x - stand.x) * dx + (p.z - stand.z) * dz) / len2));
    return Math.hypot(p.x - (stand.x + dx * t), p.z - (stand.z + dz * t));
  };
  for (const spot of [...P.collection.bearerWait, ...P.collection.bearers]) {
    assert.ok(Distance(spot, zhou) >= F.borrowClearRadiusM,
      `对白期间没人站进老周 ${F.borrowClearRadiusM} m 以内（${JSON.stringify(spot)}）`);
    assert.ok(OffAxis(spot) >= 2,
      `没人挡在玩家与老周之间（${JSON.stringify(spot)} 离轴线只有 ${OffAxis(spot).toFixed(2)} m）`);
  }
  // 走上来之后贴着老周，但不许站进土壁里（CollectionLitterWall 在 z −95.3…−94.7）。
  for (const spot of P.collection.bearerClose) {
    assert.ok(Distance(spot, zhou) < 2.5, "催的时候担架员真的走到了老周身边");
    assert.ok(spot.z < -95.9, "担架员从北侧过来，不站进土壁");
  }
  assert.ok(F.bearerCloseMoveS > 0.5 && F.bearerCloseMoveS < 6, "走上来那一段是一步路，不是一段路");
  // 触发点搬到 Front 包：运行时进 Orders 只排 Volunteer 那一条。
  const runtime = Read("Script_FirstLevelMissionRuntime.mjs");
  assert.ok(/this\.Record\("ordersReached"\);this\.Say\("Volunteer"\);\}/.test(runtime),
    "ordersReached 只排 Volunteer，BorrowLight / ZhouLift 由 FirstLevelCollection 按演出放");
  const collection = Read("Script_FirstLevelCollection.mjs");
  assert.ok(/r\.Say\("BorrowLight"\)/.test(collection) && /r\.Say\("ZhouLift"\)/.test(collection),
    "借火与担架员催都由集结处那一层放");
  assert.ok(/if \(!BorrowLightCued\([^)]+\)\) return;/.test(collection) && !collection.includes("borrowApproachFallbackS"),
    "借火只由距离与朝向触发，不许计时兜底伪造「老周看见顺子经过」");
  assert.ok(collection.includes("`${runtime.column.zhou.id}Bearer${i}`")
    && collection.includes("zhou.borrowBearersStaged = !r.Has(\"zhouOnLitter\")"),
  "等待位复用 column.zhou 原有两名担架员的身份，不另造一对叠在正式抬架位");
  const view = Read("Script_FirstLevelMissionView.mjs");
  assert.ok(view.includes("!litter.borrowBearersStaged"),
    "借火对白期间 View 不在正式抬架位重复画同两名担架员");
  assert.ok(collection.includes("new THREE.BoxGeometry(0.035, 0.012, 0.055)")
    && collection.includes("pitchCos * forwardM") && collection.includes("sideM = 0.18"),
  "火柴盒按真实小尺寸放在随俯仰移动的右手侧，不再钉在视线正中遮住老周");
}

// ---------------------------------------------------------------------------
// 5. 集结处摆位：担架 / 伤员 / 搬运人员一个不落，全部取自空间包
// ---------------------------------------------------------------------------
{
  const dressing = CollectionDressing();
  assert.equal(dressing.length, P.collection.wounded.length + P.collection.bearers.length,
    "摆位人数＝MISSION_PLACEMENT.collection 给的伤员＋搬运人员");
  assert.ok(P.collection.litters.length >= 4, "集结处至少四副担架");
  assert.ok(dressing.filter((person) => person.kind === "wounded").length >= 4, "伤员不止一两个");
  assert.ok(dressing.filter((person) => person.kind === "bearer").length >= 3, "搬运人员成组");
  for (const person of dressing)
    assert.ok(Math.hypot(person.x - A.collection.x, person.z - A.collection.z) < 14,
      `${person.id} 要摆在集结处那一片（collectionPointSeen 的 14 m 门里）`);
  const gate = MISSION_FACT_GATES.collectionPointSeen;
  assert.equal(gate.anchor, "collection", "collectionPointSeen 判的就是集结处");
  for (const spot of P.collection.litters)
    assert.ok(Math.hypot(spot.x - A.collection.x, spot.z - A.collection.z) < gate.radiusM,
      "担架摆在「第一次看见」那个圈里");
  // 02 就要看见：摆位在 RearTrench 进场时铺好。
  assert.equal(F.collectionDressStep, "RearTrench", "02 途经时集结处已经在了");
  assert.equal(F.collectionRunnerStep, "Orders", "传令兵 06 才到");
  assert.ok(/MISSION_PLACEMENT/.test(Read("Script_FirstLevelCollection.mjs")) === false
    || /Place\.collection/.test(Read("Script_FirstLevelCollection.mjs")),
    "摆位读空间包的表，不在代码里写坐标");
}

// ---------------------------------------------------------------------------
// 6. 07 时长闸：135 m 的南行在 2.2–2.6 m/s 下落在 45–75 秒
// ---------------------------------------------------------------------------
{
  assert.strictEqual(MISSION_ROUTES.south, MISSION_ROUTES.southWalk, "south 与 southWalk 是同一条（契约 §8）");
  const length = SouthWalkLengthM(MISSION_ROUTES.southWalk);
  assert.ok(length > 120 && length < 150, `南行全长 ${length.toFixed(1)} m（契约 §8 记的是 135 m）`);
  const pointer = Cue("VillagePointer");
  const pointerSeconds = MissionVoiceTimeline(pointer, 7.94).lines.at(-1)[1];
  for (const speed of [F.southMarchSpeedMps.min, F.southMarchSpeedMps.max]) {
    const walk = SouthWalkSeconds(speed, MISSION_ROUTES.southWalk);
    const total = walk + pointerSeconds;
    assert.ok(total >= F.southTargetSecondsMin && total <= F.southTargetSecondsMax,
      `${speed} m/s 走完再加指路那一句共 ${total.toFixed(1)} s，要落在 `
      + `${F.southTargetSecondsMin}–${F.southTargetSecondsMax} 秒`);
  }
  // 一路小跑也不许掉出下限：冲刺速度下光走路就已经接近下限，指路那一句补上去。
  assert.ok(SouthWalkSeconds(4.2, MISSION_ROUTES.southWalk) + pointerSeconds >= F.southTargetSecondsMin * 0.8,
    "冲刺跑完也不会短到失去「走了一段路」的感觉");
  assert.ok(F.southWhisperFallbackS < SouthWalkSeconds(F.southMarchSpeedMps.max, MISSION_ROUTES.southWalk),
    "私语的兜底要在走完之前触发，不然抵达村口时那一段还没说");
}

// ---------------------------------------------------------------------------
// 7. 07 路边指路的人：在路线上、在村口以北
// ---------------------------------------------------------------------------
{
  const pointer = SouthPointerSpot();
  const at = MissionRouteProjection(MISSION_ROUTES.southWalk, pointer);
  const mouth = MissionRouteProjection(MISSION_ROUTES.southWalk, A.village);
  assert.ok(at.progress < mouth.progress, "指路的人站在村口以北（玩家走到他之后才到村口）");
  assert.ok(mouth.progress - at.progress > F.southPointerBackM * 0.5,
    "他离村口有一段，不是贴在门口");
  assert.ok(at.distance > 1 && at.distance < F.southPointerSideM + 1.5,
    `他站在路边而不是路中间（偏出 ${at.distance.toFixed(2)} m）`);
}

// ---------------------------------------------------------------------------
// 8. 本包接上触发点的四条 cue
// ---------------------------------------------------------------------------
{
  const sources = ["Script_OpeningStoryboards.mjs", "Script_FirstLevelCollection.mjs", "Script_FirstLevelFrontShow.mjs"]
    .map(Read).join("\n");
  for (const cue of FRONT_WIRED_CUES)
    assert.ok(new RegExp(`Say\\("${cue}"\\)`).test(sources), `${cue} 在 Front 包里有真实触发点`);
  const test = Read("Script_FirstLevelVoiceTest.mjs");
  for (const cue of FRONT_WIRED_CUES)
    assert.ok(!new RegExp(`"${cue}"`).test(test.split("SECOND_WAVE_UNWIRED")[1].split("]")[0]),
      `${cue} 已经从「还没有触发点」的名单里删掉`);
  console.log("ok Front 包的 cue 接上触发点：" + FRONT_WIRED_CUES.join(" "));
}

// ---------------------------------------------------------------------------
// 9. 运行时只留薄钩子（新逻辑在新模块里，方便三包并行合并）
// ---------------------------------------------------------------------------
{
  const runtime = Read("Script_FirstLevelMissionRuntime.mjs");
  for (const hook of [
    /this\.frontShow = new FirstLevelFrontShow\(this\)/,
    /this\.frontShow\?\.Enter\(stage\.id\)/,
    /this\.frontShow\?\.Update\(dt\)/,
    /this\.frontShow\?\.Draw\(this\.time\)/,
    /this\.frontShow\?\.OnLine\(cueId,detail\)/,
    /this\.frontShow\?\.OnVoiceDone\(id\)/,
  ]) assert.ok(hook.test(runtime), "运行时留着这个钩子：" + hook);
  // 阶段 1–7 的演出不许再写回运行时：这几个方法名只该出现在新模块里。
  for (const name of ["BunkerBeatsDue", "BorrowPosesDue", "CollectionDressing"])
    assert.ok(!runtime.includes(name), `${name} 属于 Front 包的新模块，不进运行时`);
  // Draw 必须排在 view.Update 之后（people.End() 会把这一帧没提交的人藏起来）。
  assert.ok(runtime.indexOf("this.view.Update(this.time,") < runtime.indexOf("this.frontShow?.Draw(this.time)"),
    "集结处的人群补提交排在 view.Update 之后");
  // Update 必须排在 UpdateSquad 之后（剧情走位要压过接触反应）。
  assert.ok(runtime.indexOf("this.UpdateSquad();") < runtime.indexOf("this.frontShow?.Update(dt)"),
    "Front 的剧情走位排在 UpdateSquad 之后");
  assert.ok(/this\.controls\.time >= this\.controls\.seconds && this\.controls\.kind!=="trapped"/.test(runtime),
    "trapped 控制只随真实阶段交接释放，不被旧最大时长抢先还权");
  assert.ok(/actor\.scriptedNoncombatant = true;[\s\S]*this\.PlaceActor\(actor, this\.opening\.BunkerPost\(i\)\)/.test(runtime),
    "01 摆班组时先压住通用战斗 AI，不许提前射杀行刑兵");
  assert.ok(/const bunkerRescueLocked = stage === "BunkerRescue" && !this\.Has\("luoRescueComplete"\)/.test(runtime)
    && /actor\.scriptedNoncombatant = bunkerRescueLocked/.test(runtime),
    "02 还权前全班继续受控，只由 FrontShow 单独放开何有田");
}

// ---------------------------------------------------------------------------
// 10. 数值有出处，玩家可见中文不进这几个模块
// ---------------------------------------------------------------------------
{
  const tuning = Read("Data_Tuning_FirstLevelFront.mjs");
  const keys = Object.keys(F);
  assert.ok(keys.length > 25, "Front 的数值表不该是空壳");
  assert.ok(Object.keys(FRONT_TUNING_SOURCES).length >= 6, "关键数值逐条写了出处");
  for (const key of Object.keys(FRONT_TUNING_SOURCES))
    assert.ok(keys.includes(key), `出处表里的 ${key} 要真的是表里的一条`);
  // 每一条数值前面都得有注释（出处或算法），不许空降一个数字。
  // 只扫 FRONT_TUNING 那一段 —— 出处表里的同名键不是数值定义。
  const body = tuning.split("export const FRONT_TUNING = Object.freeze({")[1].split("\n});")[0];
  const lines = body.split("\n");
  for (const [index, line] of lines.entries()) {
    const match = line.match(/^ {2}([A-Za-z][A-Za-z0-9]*):/);
    if (!match || !keys.includes(match[1])) continue;
    const before = lines.slice(Math.max(0, index - 8), index).join("\n");
    assert.ok(/\/\/|\*/.test(before), `${match[1]} 前面要有一段说明它从哪儿来`);
  }
  // 运行时闸门模块零中文字面量（Script_TextTest 的同一条口径，这里先自查）。
  // `FRONT_TUNING_SOURCES` 里的中文是数值出处，跟注释同性质：它不登记进
  // `Font/Script_FontChars.mjs` 的 UI_MODULES，永远不会出现在界面上，所以数值表不在这一条里。
  for (const name of ["Script_OpeningStoryboards.mjs", "Script_FirstLevelCollection.mjs",
    "Script_FirstLevelFrontShow.mjs"]) {
    const source = Read(name).replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
    const chinese = source.match(/["'`][^"'`\n]*[一-龥][^"'`\n]*["'`]/g) || [];
    assert.deepEqual(chinese, [], `${name} 里不许有玩家可见的中文字面量：` + JSON.stringify(chinese));
  }
}

// ---------------------------------------------------------------------------
// 11. 阶段 1–7 的通过条件仍然是契约 §2 的那一张表（本包没有偷偷加减）
// ---------------------------------------------------------------------------
{
  const expected = {
    Trapped: ["bunkerCollapsed", "captivesKilled", "doorSearchStarted"],
    BunkerRescue: ["rescueCallHeard", "luoRescueComplete", "rifleRecovered"],
    RearTrench: ["rearTrenchEntered", "cornerReached", "collectionPointSeen", "supportOrdersHeard"],
    Support: ["frontReached", "rightNestCaptured", "frontContact", "frontRifleDefense", "rifleWithdrawalResolved", "zhouGunWounded", "tankPreviewed"],
    MachineGun: ["tankPositionPressured", "remainingGuardsGathered", "tankBlocksExit", "rightRearReached", "bundleOrderHeard"],
    Tank: ["bundleRouteTraversed", "bundleTaken", "bundleReturned", "attackPositionReached", "tankImmobilized", "tankFireDisabled", "attackRetreated", "lastGuardsWithdrawn", "frontDisengaged", "reliefInPosition", "collectionReturned"],
    Orders: ["ordersReached", "volunteerHeard", "lightShared", "zhouOnLitter", "columnDeparted"],
    South: ["southWhisperHeard", "villageMouthReached", "mainStreetPointed"],
  };
  for (const [id, requirements] of Object.entries(expected)) {
    const stage = MISSION_STAGES.find((entry) => entry.id === id);
    assert.ok(stage, `步骤 ${id} 还在`);
    assert.deepEqual(stage.requirements, requirements, `${id} 的通过条件与契约 §2 一致`);
    for (const fact of requirements)
      assert.ok(MISSION_FACT_GATES[fact], `${fact} 在事实门表里（工作台照它讲人话）`);
  }
  // 「不许用纯计时器代替真实发生」：这八步里没有 kind:"timer" 的事实门，
  // 唯一那条（frontRifleDefense）还要求期间真的开过枪。
  const timers = Object.values(expected).flat().filter((fact) => MISSION_FACT_GATES[fact].kind === "timer");
  assert.deepEqual(timers, [], "新版前沿通过条件全部取决于战场事件，不用计时替代解除封锁");
}

console.log("ok 第一关阶段 1–7：行刑节拍、救援放行、集结处摆位、借火对位、南行时长闸、运行时薄钩子");
