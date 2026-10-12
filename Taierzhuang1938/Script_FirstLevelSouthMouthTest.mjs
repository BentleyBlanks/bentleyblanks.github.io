// Script_FirstLevelSouthMouthTest.mjs —— 07 沟口遭遇的纯 Node 门禁（docs/Data_FirstLevel0311Refactor20261012Contract.md §3.5 / §5）。
//   · 锚点：停点在沟里、南口在出坡上、机枪点在平地；停点离南口 ≥ 6 m；
//   · 白盒：三道田埂 / 坟包 + 机枪土埂高 0.9–1.3 m、横在「射手 → 南口」的线上、不碰 southWalk 路线点与电线杆；
//   · 遭遇组：6 人、id 按契约、出生点离机枪点 ≥ 60 m 且被南田房挡着、彼此 ≥ 4.5 m；折线 fact 门控、末点各自在掩体后面；
//   · 编排表：事实 / 激活 / 对白事实 / requirements；
//   · 纯规则 SouthMouthRules：到沟口 → 接火 → 压住（≥ 2 s）→ 再抬头 → 绕村的两个 → 过完；担架限位 MayMove / MaxProgress；
//   · 运行时薄适配 FirstLevelSouthMouth：记事实、放组、喊 cue、切任务字、妮儿撒腿；运行时源码的薄钩子。
// 用法：node Taierzhuang1938/Script_FirstLevelSouthMouthTest.mjs
import assert from "node:assert/strict";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { MISSION_TUNING as R } from "./Data_Tuning_FirstLevel.mjs";
import { MISSION_ANCHORS as A, MISSION_ROUTES, MISSION_LAYOUT } from "./Data_FirstLevelMissionLayout.mjs";
import { MISSION_STAGES, MISSION_ENCOUNTERS, MISSION_TACTICS, MISSION_GUIDANCE, SOUTH_MOUTH_OBJECTIVES } from "./Data_FirstLevelMission.mjs";
import { MISSION_FACT_GATES, MISSION_ENCOUNTER_ACTIVATION, MISSION_VOICE_FACTS } from "./Data_FirstLevelMissionGates.mjs";
import { FIRST_LEVEL_ENCOUNTER_STARTS, FIRST_LEVEL_DEFERRED_ENCOUNTERS } from "./Data_FirstLevelMissionStages.mjs";
import { MISSION_LEADER_STAGES } from "./Data_FirstLevelLeaderGuide.mjs";
import { SampleMissionTerrain as Ground } from "./Data_FirstLevelMissionTerrain.mjs";
import { MissionRouteProjection, MissionRouteLength } from "./Script_FirstLevelMissionColumn.mjs";
import { TEXT } from "./Data_Text_FirstLevel.mjs";
import { MISSION_DIALOGUE } from "./Data_FirstLevelMissionDialogue.mjs";
import { SouthMouthRules, SouthMouthProgress, FirstLevelSouthMouth, SOUTH_MOUTH_ENCOUNTER, SOUTH_MOUTH_GUNNER, SOUTH_MOUTH_FLANKERS, SOUTH_MOUTH_FLANK_WATCH } from "./Script_FirstLevelSouthMouth.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const Read = (file) => fs.readFileSync(path.join(HERE, file), "utf8");
const T = R.southMouth;
const Distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
let checks = 0;
const Check = (ok, message) => { assert.ok(ok, message); checks++; };

// 1. 锚点与里程。
const progress = SouthMouthProgress();
{
  Check(Ground(A.southMouthHold.x, A.southMouthHold.z) <= -1.2, `停点在沟里（沟底 ${Ground(A.southMouthHold.x, A.southMouthHold.z).toFixed(2)}）`);
  const mouthH = Ground(A.southMouth.x, A.southMouth.z);
  Check(mouthH > -1.2 && mouthH < 0, `南口在出坡上（${mouthH.toFixed(2)}）`);
  Check(Math.abs(Ground(A.mouthEmbankment.x, A.mouthEmbankment.z)) < 0.4, "机枪点在平地上");
  Check(progress.hold < progress.mouth - 6, `停点在南口前 ${(progress.mouth - progress.hold).toFixed(1)} m（契约 ≥ 6）`);
  Check(progress.crossed === MissionRouteLength(MISSION_ROUTES.southWalk) - T.crossedSlackM, "过完 = southWalk 末点前 crossedSlackM");
  Check(MissionRouteProjection(MISSION_ROUTES.southWalk, A.southMouthHold).distance < 1.5, "停点在 southWalk 中线上");
  Check(Distance(A.mouthEmbankment, A.southMouth) > 20 && Distance(A.mouthEmbankment, A.southMouth) < 30, "机枪点离南口 20–30 m，打得到沟口外的空地");
}

// 2. 白盒：田埂 / 坟包 / 机枪土埂。
const MOUTH_BLOCKS = MISSION_LAYOUT.blocks.filter((b) => b.id.startsWith("Mouth"));
{
  const solids = MOUTH_BLOCKS.filter((b) => b.solid !== false);
  Check(solids.length >= 4, `沟口东侧至少 4 块掩体（${solids.map((b) => b.id).join(",")}）`);
  for (const b of solids) {
    const top = b.y + b.h / 2 - Ground(b.x, b.z);
    Check(top >= 0.9 && top <= 1.35, `${b.id} 高 ${top.toFixed(2)} m（契约 0.9–1.3）`);
    Check(MissionRouteProjection(MISSION_ROUTES.southWalk, b).distance > 6, `${b.id} 离 southWalk 路线 > 6 m`);
    for (const pole of MISSION_LAYOUT.blocks.filter((p) => /^SouthExitPole\d$/.test(p.id))) Check(Distance(b, pole) > 8, `${b.id} 不碰电线杆 ${pole.id}`);
    Check(b.x > A.southMouth.x + 8 && b.z > -62 && b.z < -36, `${b.id} 在沟口东侧`);
  }
  const emb = solids.find((b) => b.id === "MouthEmbankment");
  Check(emb && Distance(emb, A.mouthEmbankment) < 1.6, "机枪土埂紧挨机枪点");
  // 土埂横在「射手 → 南口」的线上：射手在埂的另一侧。
  const u = { x: A.southMouth.x - A.mouthEmbankment.x, z: A.southMouth.z - A.mouthEmbankment.z };
  const along = (emb.x - A.mouthEmbankment.x) * u.x + (emb.z - A.mouthEmbankment.z) * u.z;
  Check(along > 0, "土埂在射手与南口之间");
}

// 3. 遭遇组与折线。
{
  const group = MISSION_ENCOUNTERS[SOUTH_MOUTH_ENCOUNTER];
  Check(group.map((s) => s.id).join() === "MouthGunner,MouthRifleA,MouthRifleB,MouthRifleC,MouthFlankA,MouthFlankB", "southMouth 组 6 人，id 按契约 §5.3");
  const gunner = group.find((s) => s.id === SOUTH_MOUTH_GUNNER);
  Check(gunner.weapon === "Type11" && gunner.hold === true, "MouthGunner 是歪把子、hold");
  let hiddenCount = 0;
  for (const s of group) {
    Check(Distance(s, A.mouthEmbankment) >= 60, `${s.id} 出生点离机枪点 ${Distance(s, A.mouthEmbankment).toFixed(1)} m（契约 ≥ 60）`);
    for (const o of group) if (o !== s) Check(Distance(s, o) >= 4.5, `${s.id} 与 ${o.id} 出生点错开 ≥ 4.5 m`);
    // 从南口看，出生点被南田房（x 54–66、z −64.5…−55.5）挡住的算一个：连线穿过房子的占地。
    const house = { minX: 53.7, maxX: 66.3, minZ: -64.8, maxZ: -55.2 };
    for (let t = 0; t <= 1; t += 0.01) {
      const x = A.southMouth.x + (s.x - A.southMouth.x) * t, z = A.southMouth.z + (s.z - A.southMouth.z) * t;
      if (x > house.minX && x < house.maxX && z > house.minZ && z < house.maxZ) { hiddenCount++; break; }
    }
    const plan = MISSION_TACTICS[s.id];
    Check(plan?.fact === "southMouthReached" && plan.points.length >= 3, `${s.id} 的折线由 southMouthReached 放行`);
    Check(plan.mps >= 3 && plan.holdS === 0, `${s.id} 跑步穿田、折点不停`);
  }
  Check(hiddenCount >= 3, `至少一半的出生点从南口看被南田房挡着（${hiddenCount}/6；其余靠 ≥ 60 m）`);
  Check(Distance(MISSION_TACTICS.MouthGunner.points.at(-1), A.mouthEmbankment) < 0.01, "射手的末点就是机枪点");
  for (const id of ["MouthRifleA", "MouthRifleB", "MouthRifleC"]) {
    const end = MISSION_TACTICS[id].points.at(-1);
    const bank = MOUTH_BLOCKS.filter((b) => b.solid !== false).map((b) => ({ b, d: Distance(b, end) })).sort((p, q) => p.d - q.d)[0];
    Check(bank.d < 2.2, `${id} 的末点贴着 ${bank.b.id}（${bank.d.toFixed(2)} m）`);
    const toMouth = { x: A.southMouth.x - end.x, z: A.southMouth.z - end.z };
    Check((bank.b.x - end.x) * toMouth.x + (bank.b.z - end.z) * toMouth.z > 0, `${id} 趴在 ${bank.b.id} 背后（埂在他与南口之间）`);
  }
  for (const id of SOUTH_MOUTH_FLANKERS)
    Check(Distance(MISSION_TACTICS[id].points.at(-1), SOUTH_MOUTH_FLANK_WATCH) <= SOUTH_MOUTH_FLANK_WATCH.nearM, `${id} 绕到村北口（露头喊 MouthFlank 的圈里）`);
  Check(FIRST_LEVEL_ENCOUNTER_STARTS.southMouth === 7 && FIRST_LEVEL_DEFERRED_ENCOUNTERS[7]?.includes("southMouth"), "southMouth 是 07 的延后组");
}

// 4. 编排表。
{
  for (const fact of ["southMouthReached", "mouthContact", "mouthMgSuppressed", "mouthFlankResolved", "mouthCrossed", "nierFollowHeard"])
    Check(MISSION_FACT_GATES[fact]?.step === "South", `事实 ${fact} 在 South`);
  for (const fact of ["nierSeen", "matchAsked"]) Check(MISSION_FACT_GATES[fact]?.step === "Orders", `事实 ${fact} 在 Orders`);
  Check(MISSION_ENCOUNTER_ACTIVATION.southMouth?.spawn?.fact === "southMouthReached", "southMouth 由 southMouthReached 放出");
  Check(MISSION_VOICE_FACTS.NierFollow === "nierFollowHeard", "NierFollow 播完记 nierFollowHeard");
  const south = MISSION_STAGES.find((s) => s.id === "South");
  assert.deepEqual(south.requirements, ["southWhisperHeard", "mouthCrossed", "villageMouthReached", "mainStreetPointed"], "07 requirements（契约 §3.5）");
  Check(south.objective === SOUTH_MOUTH_OBJECTIVES.crossed && SOUTH_MOUTH_OBJECTIVES.mouth.length > 0, "07 任务字：起步与过完同一句，沟口另一句");
  Check(MISSION_GUIDANCE.South.mouthLabel === "mouth" && TEXT["firstLevel.guide.mouth"], "MISSION_GUIDANCE.South 有 mouth 标签与文案");
  const guide = MISSION_LEADER_STAGES.South;
  Check(guide.holdFrom === "mouthContact" && guide.holdUntil === "mouthCrossed" && guide.holdTarget === A.mouthEmbankment, "班长带路表：接火到过完之间指机枪");
  for (const id of ["MouthContact", "MouthGo", "MouthFlank"]) {
    const cue = MISSION_DIALOGUE.find((c) => c.id === id);
    Check(cue && !cue.perLine, `${id} 是整段 cue`);
  }
}

// 5. 纯规则。
function Scene(over = {}) {
  return { leadProgress: 0, playerToHoldM: 99, gunner: { alive: true, suppressed: false, fired: false, atPost: false },
    members: Array.from({ length: 6 }, () => ({ alive: true, fired: false })), flankers: [{ alive: true, suppressed: false, nearVillage: false }, { alive: true, suppressed: false, nearVillage: false }],
    litters: [{ alive: true, progress: 50 }, { alive: true, progress: 46 }], ...over };
}
{
  const rules = new SouthMouthRules(T, progress);
  Check(rules.MayMove(progress.hold - 5) && !rules.MayMove(progress.hold + 1), "没到沟口：停点以内能走、以外不能");
  Check(rules.MaxProgress(Infinity) === progress.hold, "接火以前里程上限 = 停点");
  Check(rules.Update(1 / 60, Scene()).length === 0, "没人到停点不发事件");
  let events = rules.Update(1 / 60, Scene({ leadProgress: progress.hold - T.holdReachM + 0.1 }));
  assert.deepEqual(events, ["reached"], "领头担架到停点：reached");
  // 射手到位不开火：contactFallbackS 之后也算接火。
  let all = [];
  for (let i = 0; i < 60 * (T.contactFallbackS + 0.2); i++) all.push(...rules.Update(1 / 60, Scene({ leadProgress: progress.hold, gunner: { alive: true, suppressed: false, fired: false, atPost: true } })));
  Check(all.includes("contact") && rules.contact, "到位 contactFallbackS 没开火也算接火");
  Check(rules.MaxProgress(Infinity) === Infinity && !rules.MayMove(progress.hold + 5) && rules.MayMove(progress.crossed + 1), "接火后：上限放开、开阔地没压住不能走、过了的随便走");
  // 压住 < 2 s 不算；≥ 2 s 算；抬头后 regrace 再停。
  all = [];
  for (let i = 0; i < 60 * 1.5; i++) all.push(...rules.Update(1 / 60, Scene({ gunner: { alive: true, suppressed: true, fired: true, atPost: true } })));
  Check(!all.includes("suppressed") && !rules.mgSuppressed, "压住不到 2 s 不算");
  for (let i = 0; i < 60 * 0.7; i++) all.push(...rules.Update(1 / 60, Scene({ gunner: { alive: true, suppressed: true, fired: true, atPost: true } })));
  Check(all.includes("suppressed") && rules.mgSuppressed && rules.mgSuppressedEver && rules.MayMove(progress.hold + 5), "压住 ≥ 2 s：担架能跑");
  all = [];
  for (let i = 0; i < 60 * (T.mgRegraceS - 0.3); i++) all.push(...rules.Update(1 / 60, Scene({ gunner: { alive: true, suppressed: false, fired: true, atPost: true } })));
  Check(!all.includes("raised") && rules.mgSuppressed, "抬头后 regrace 以内担架还能收尾一步");
  for (let i = 0; i < 60 * 0.5; i++) all.push(...rules.Update(1 / 60, Scene({ gunner: { alive: true, suppressed: false, fired: true, atPost: true } })));
  Check(all.includes("raised") && !rules.mgSuppressed && !rules.MayMove(progress.hold + 5), "再抬头：担架停在田埂后");
  // 再压住一次只记一次事实（mgSuppressedEver 不变），事件照发。
  all = [];
  for (let i = 0; i < 60 * 2.2; i++) all.push(...rules.Update(1 / 60, Scene({ gunner: { alive: true, suppressed: true, fired: true, atPost: true } })));
  Check(all.includes("suppressed"), "第二次压住照样发事件");
  // 射手死了：永久压住。
  all = [];
  for (let i = 0; i < 30; i++) all.push(...rules.Update(1 / 60, Scene({ gunner: { alive: false, suppressed: false, fired: true, atPost: true } })));
  Check(rules.mgSuppressed && rules.MayMove(progress.hold + 5), "射手死了担架一直能跑");
  // 绕村的两个：露头发 flankSeen；都压住 ≥ 2 s 算解决。
  all = [];
  for (let i = 0; i < 60 * 2.2; i++) all.push(...rules.Update(1 / 60, Scene({ gunner: { alive: false }, flankers: [{ alive: true, suppressed: true, nearVillage: true }, { alive: true, suppressed: true, nearVillage: false }] })));
  Check(all.includes("flankSeen") && all.includes("flankResolved") && rules.flankResolved, "绕村的露头 → flankSeen；都压住 2 s → flankResolved");
  // 担架全部过完。
  all = rules.Update(1 / 60, Scene({ gunner: { alive: false }, litters: [{ alive: true, progress: progress.crossed + 1 }, { alive: false, progress: 10 }, { alive: true, progress: progress.crossed + 3 }] }));
  Check(all.includes("crossed") && rules.crossed, "活着的担架全部过了（死的不算）");
  // 另一条路：射手一开火就是接火；玩家先到停点也算到沟口。
  const r2 = new SouthMouthRules(T, progress);
  assert.deepEqual(r2.Update(1 / 60, Scene({ playerToHoldM: T.playerReachM - 0.5 })), ["reached"], "玩家先到停点也算到沟口");
  assert.deepEqual(r2.Update(1 / 60, Scene({ gunner: { alive: true, suppressed: false, fired: true, atPost: false } })), ["contact"], "射手一开火就是接火");
  const r3 = new SouthMouthRules(T, progress);
  r3.Update(1 / 60, Scene({ leadProgress: progress.hold }));
  assert.deepEqual(r3.Update(1 / 60, Scene({ members: [{ alive: false, fired: false }, ...Array.from({ length: 5 }, () => ({ alive: true, fired: false }))] })), ["contact"], "组里先有人死了也算接火");
  const state = rules.State();
  for (const key of ["reached", "contact", "mgSuppressed", "mgSuppressedEver", "flankResolved", "crossed", "progress", "events"]) Check(key in state, `State() 有 ${key}`);
}

// 6. 运行时薄适配。
{
  const facts = new Set(), said = [], spawned = [], objectives = [], log = [];
  let nierRan = 0;
  const enemies = new Map();
  const r = {
    time: 0, flow: { stage: { id: "South" } }, enemies, ai: { time: 0 },
    player: { position: { x: -16, z: -76 } },
    column: { litters: [{ visible: true, evacuated: false, health: 100, progress: 20 }, { visible: true, evacuated: false, health: 100, progress: 17 }] },
    Has: (id) => facts.has(id),
    Record: (id, detail) => { if (facts.has(id)) return false; facts.add(id); log.push({ id, detail }); return true; },
    Say: (id) => said.push(id),
    SpawnEncounter: (id) => spawned.push(id),
    Objective: (text) => objectives.push(text),
    gengFamily: { OnMouthContact: () => { nierRan++; } },
  };
  const mouth = new FirstLevelSouthMouth(r);
  mouth.Enter("South");
  const Step = (seconds) => { for (let i = 0; i < Math.round(seconds * 60); i++) { r.time += 1 / 60; r.ai.time = r.time; mouth.Update(1 / 60); } };
  Step(1);
  Check(!spawned.length && mouth.MaxProgress(Infinity) === progress.hold, "担架还在沟里：组没放、里程上限是停点");
  Check(mouth.SafeAt({ progress: 30 }) && !mouth.SafeAt({ progress: progress.hold + 2 }), "SafeAt：停点以内能走");
  r.column.litters[0].progress = progress.hold - 1;
  Step(0.1);
  Check(facts.has("southMouthReached") && spawned[0] === "southMouth" && mouth.spawnedAt != null, "领头担架到停点：记事实、放组");
  // 组生出来了（假演员）：射手在路上。
  const Actor = (id, x, z) => { const a = { alive: true, state: "idle", lastFire: -99, position: { x, z } }; enemies.set(id, a); return a; };
  const gunner = Actor("MouthGunner", 40, -60);
  for (const id of ["MouthRifleA", "MouthRifleB", "MouthRifleC"]) Actor(id, 45, -60);
  const flankers = SOUTH_MOUTH_FLANKERS.map((id) => Actor(id, 50, -60));
  Step(1);
  Check(!facts.has("mouthContact"), "还没开火：不接火");
  gunner.position = { x: A.mouthEmbankment.x, z: A.mouthEmbankment.z }; gunner.lastFire = r.ai.time + 0.1;
  Step(0.2);
  Check(facts.has("mouthContact") && said.includes("MouthContact") && nierRan === 1, "机枪开火：mouthContact + MouthContact + 妮儿撒腿");
  Check(objectives.at(-1) === SOUTH_MOUTH_OBJECTIVES.mouth, "任务字切到「压住东边机枪」");
  Check(mouth.MaxProgress(Infinity) === Infinity && !mouth.SafeAt({ progress: progress.hold + 3 }), "接火后：开阔地没压住不能走");
  gunner.state = "suppressed";
  Step(T.mgSuppressS + 0.1);
  Check(facts.has("mouthMgSuppressed") && said.includes("MouthGo") && mouth.SafeAt({ progress: progress.hold + 3 }), "压住 ≥ 2 s：mouthMgSuppressed + MouthGo + 担架能跑");
  flankers[0].position = { x: SOUTH_MOUTH_FLANK_WATCH.x, z: SOUTH_MOUTH_FLANK_WATCH.z };
  Step(0.1);
  Check(said.includes("MouthFlank"), "绕村的露头：MouthFlank");
  for (const f of flankers) f.alive = false;
  Step(0.1);
  Check(facts.has("mouthFlankResolved"), "绕村的都死了：mouthFlankResolved");
  for (const l of r.column.litters) l.progress = progress.crossed + 1;
  Step(0.1);
  Check(facts.has("mouthCrossed") && objectives.at(-1) === SOUTH_MOUTH_OBJECTIVES.crossed, "担架全过了：mouthCrossed + 任务字回到带路那一句");
  const state = mouth.State();
  Check(state.members.length === 6 && state.members.find((m) => m.id === "MouthGunner").state === "suppressed", "State() 报全组现场");
}

// 7. 运行时源码的薄钩子。
{
  const runtime = Read("Script_FirstLevelMissionRuntime.mjs");
  Check(runtime.includes("this.southMouth = new FirstLevelSouthMouth(this);"), "运行时装配 SouthMouth 一行");
  Check(runtime.includes("this.southMouth.Update(dt);") && runtime.includes("this.southMouth.Enter(stage.id);"), "Enter / Update 薄钩子");
  Check(runtime.includes("maxProgress = this.southMouth.MaxProgress(maxProgress); safeAt = this.southMouth.SafeAt;"), "07 担架限位交给 SouthMouth");
  Check(runtime.includes('!["village", "melee", "southMouth"].includes(actor.missionEncounter)'), "进 07 不把沟口那一组装成不参战");
  Check(runtime.includes("spec.mouthLabel&&this.Has(\"mouthContact\")&&!this.Has(\"mouthCrossed\")"), "接火到过完之间标签指机枪");
  Check(runtime.includes("southMouth:this.southMouth.State()"), "状态进 Debug.FirstLevelMission().southMouth");
  Check(!/this\.SpawnEncounter\(\s*["']/.test(runtime), "运行时源码里没有字面量 SpawnEncounter（组由 SouthMouth 按事实放）");
  const guide = Read("Script_FirstLevelLeaderGuide.mjs");
  Check(guide.includes("spec.holdFrom"), "带路层认 holdFrom");
  const text = Read("Data_Text_FirstLevel.mjs");
  Check(text.includes('"Script_FirstLevelSouthMouth.mjs"'), "SouthMouth 进 Script_TextTest 的闸门模块");
}
console.log(`ok 07 沟口遭遇：锚点 / 田埂 / 遭遇组折线 / 编排表 / 纯规则 / 运行时薄适配 / 薄钩子（${checks} 项）`);
