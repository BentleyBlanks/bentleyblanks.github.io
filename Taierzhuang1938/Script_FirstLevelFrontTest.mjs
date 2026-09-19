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
import { BunkerBeatsDue, BUNKER_BEAT_ORDER } from "./Script_FirstLevelBunker.mjs";
import { CollectionDressing, BorrowPosesDue, BORROW_POSE_ORDER } from "./Script_FirstLevelCollection.mjs";
import { SouthPointerSpot, FRONT_WIRED_CUES } from "./Script_FirstLevelFrontShow.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const Read = (name) => fs.readFileSync(path.join(here, name), "utf8");
const Cue = (id) => MISSION_DIALOGUE.find((cue) => cue.id === id);

// ---------------------------------------------------------------------------
// 1. 01 受困：行刑节拍与 BunkerKilling 的四句一一对上
// ---------------------------------------------------------------------------
{
  const killing = Cue("BunkerKilling");
  assert.equal(killing.lines.length, 4, "BunkerKilling 是四句（日兵甲 / 伤兵 / 扶人川军 / 日兵乙）");
  assert.deepEqual(BUNKER_KILL_BEATS.map((beat) => beat.line), [0, 1, 2, 3],
    "行刑的四拍逐句挂在 BunkerKilling 上，没有空挂的句子");
  assert.deepEqual(BUNKER_KILL_BEATS.map((beat) => beat.action), ["butt", "recoil", "rise", "stab"],
    "枪托砸倒 → 腿伤者后缩 → 扶人者挣扎起身 → 挺刺刀，顺序与 Notion 原文一致");
  // Line 事件到了就照 Line 走，哪怕兜底时刻还没到。
  assert.deepEqual(BunkerBeatsDue(3, 0), ["butt", "recoil", "rise", "stab"],
    "第四句一到，前面三拍都算演过了（录音比兜底快）");
  assert.deepEqual(BunkerBeatsDue(0, 0), ["butt"], "只收到第一句就只演第一拍");
  assert.deepEqual(BunkerBeatsDue(null, 0), ["butt"], "没有 Line 事件时按兜底偏移起第一拍");
  assert.deepEqual(BunkerBeatsDue(null, F.bunkerKillFallbackS.at(-1)), ["butt", "recoil", "rise", "stab"],
    "整段没有音频也要把四拍演完（兜底）");
  assert.ok(F.bunkerKillFallbackS.every((at, i) => i === 0 || at > F.bunkerKillFallbackS[i - 1]),
    "兜底偏移单调递增");
  const plan = MissionVoiceTimeline(killing, 7.84);
  assert.ok(F.bunkerKillFallbackS.at(-1) <= plan.lines.at(-1)[1] + 1,
    "兜底不许比录音本身还慢一整句，不然没有音频的那一趟拖出 trappedMaxS");
  assert.ok(F.bunkerShowFallbackS < R.trappedMaxS,
    `整段兜底 ${F.bunkerShowFallbackS} s 要短于控制接管上限 trappedMaxS ${R.trappedMaxS} s`);
  assert.deepEqual(BUNKER_BEAT_ORDER,
    ["butt", "recoil", "rise", "stab", "flank", "kick", "creak"],
    "State().bunker.beats 的顺序＝原文的动作顺序（补刺 → 踢枪 → 木架轻响）");
}

// ---------------------------------------------------------------------------
// 2. 01 的摆位：行刑处、破口视距与两支落在几米外的步枪
// ---------------------------------------------------------------------------
{
  const bunker = P.bunker;
  assert.equal(bunker.captives.length, 2, "门外两名失去抵抗能力的川军");
  assert.equal(bunker.captiveRifles.length, 2, "他们的步枪落在数米外");
  for (const spot of bunker.captiveRifles) {
    const nearest = Math.min(...bunker.captives.map((c) => Math.hypot(c.x - spot.x, c.z - spot.z)));
    assert.ok(nearest >= 1.5, `缴下的步枪要在几米外，不是压在身下（实测 ${nearest.toFixed(2)} m）`);
  }
  const sight = Math.hypot(A.bunkerKilling.x - A.bunker.x, A.bunkerKilling.z - A.bunker.z);
  assert.ok(sight <= R.bunkerSightM + 6.5,
    `受困位置看得清行刑处（破口视距 ${R.bunkerSightM} m，实测 ${sight.toFixed(1)} m）`);
  assert.equal(bunker.ijaKill.length, 2, "下刀的两个站位由空间包给（不在代码里估）");
  assert.equal(bunker.ijaDoor.length, 2, "转向门内的两个落点由空间包给");
}

// ---------------------------------------------------------------------------
// 3. 02 救援：两个人都要到位，何有田从后侧交通壕压制
// ---------------------------------------------------------------------------
{
  const bunker = P.bunker;
  assert.ok(bunker.luoLift && bunker.yaowaLift, "掀木架与拉背包各有一个摆位");
  assert.ok(Math.hypot(bunker.luoLift.x - bunker.yaowaLift.x, bunker.luoLift.z - bunker.yaowaLift.z) > 1,
    "两个人不站在同一格上");
  assert.ok(F.rescueGatherMaxS > R.bunkerRescueSeconds / 2,
    "等两个人到位的兜底要比掀架那一段本身留得宽");
  // 剧情移动放行：接触反应不许盖过掀架/拉背包（契约 §8 的先例）。
  const runtime = Read("Script_FirstLevelMissionRuntime.mjs");
  assert.ok(/stage==="BunkerRescue"&&\["luo","yaowa"\]\.includes\(actor\.castId\)/.test(runtime),
    "UpdateSquad 里罗班长与幺娃在 02 都被放行（不然谁也走不到掀架位）");
  assert.ok(/heyoutianFire/.test(Read("Script_FirstLevelBunker.mjs")),
    "何有田在后侧交通壕那个射位上压制");
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
  const length = SouthWalkLengthM();
  assert.ok(length > 120 && length < 150, `南行全长 ${length.toFixed(1)} m（契约 §8 记的是 135 m）`);
  const pointer = Cue("VillagePointer");
  const pointerSeconds = MissionVoiceTimeline(pointer, 7.94).lines.at(-1)[1];
  for (const speed of [F.southMarchSpeedMps.min, F.southMarchSpeedMps.max]) {
    const walk = SouthWalkSeconds(speed);
    const total = walk + pointerSeconds;
    assert.ok(total >= F.southTargetSecondsMin && total <= F.southTargetSecondsMax,
      `${speed} m/s 走完再加指路那一句共 ${total.toFixed(1)} s，要落在 `
      + `${F.southTargetSecondsMin}–${F.southTargetSecondsMax} 秒`);
  }
  // 一路小跑也不许掉出下限：冲刺速度下光走路就已经接近下限，指路那一句补上去。
  assert.ok(SouthWalkSeconds(4.2) + pointerSeconds >= F.southTargetSecondsMin * 0.8,
    "冲刺跑完也不会短到失去「走了一段路」的感觉");
  assert.ok(F.southWhisperFallbackS < SouthWalkSeconds(F.southMarchSpeedMps.max),
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
  const sources = ["Script_FirstLevelBunker.mjs", "Script_FirstLevelCollection.mjs", "Script_FirstLevelFrontShow.mjs"]
    .map(Read).join("\n");
  for (const cue of FRONT_WIRED_CUES)
    assert.ok(new RegExp(`Say\\("${cue}"\\)`).test(sources), `${cue} 在 Front 包里有真实触发点`);
  const test = Read("Script_FirstLevelVoiceTest.mjs");
  for (const cue of FRONT_WIRED_CUES)
    assert.ok(!new RegExp(`"${cue}"`).test(test.split("SECOND_WAVE_UNWIRED")[1].split("]")[0]),
      `${cue} 已经从「还没有触发点」的名单里删掉`);
  console.log("ok 四条 cue 接上触发点：" + FRONT_WIRED_CUES.join(" "));
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
  for (const name of ["Script_FirstLevelBunker.mjs", "Script_FirstLevelCollection.mjs",
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
    Support: ["frontReached", "frontContact", "frontRifleDefense", "rifleWithdrawalResolved"],
    MachineGun: ["zhouGunWounded", "frontAttackRepelled", "guardWithdrawalResolved", "tankBlocksExit", "bundleOrderHeard"],
    Tank: ["bundleRouteTraversed", "bundleTaken", "tankImmobilized", "lastGuardsWithdrawn", "reliefInPosition"],
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
  assert.deepEqual(timers, ["frontRifleDefense"], "只有顶住那一段是计时，而且它还要求开过枪");
}

console.log("ok 第一关阶段 1–7：行刑节拍、救援放行、集结处摆位、借火对位、南行时长闸、运行时薄钩子");
