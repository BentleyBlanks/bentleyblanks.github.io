// Script_FirstLevelGengFamilyTest.mjs —— 耿家四个角色（老耿 / 妮儿 / 黑子 / 驴车）的纯 Node 门禁
//（docs/Data_FirstLevel0311Refactor20261012Contract.md §3.4 / §3.5 / §5.6）。
//   · 契约 §5.6 的接口都在、签名不变（C 包只可加方法）；
//   · 占位模型：妮儿 = CivilianFemale 分身 girl（缩放 R.geng.nierScale）、老耿 = CivilianMale；
//   · 06：沟沿上的点真的比洼地高、在洼地外；nierSeen → NierShells；玩家开枪她去捡枪口右侧的弹壳；捡完口袋响一声；
//   · 07：跟队走沟沿（目标点在地面高的那一侧、沟里离中线 rimOffsetM）；机枪一响撒腿跑到村北巷；
//   · 指物 / 老耿走位与姿态 / 驴车移动 / 保护开关 / State() 形状。
// 用法：node Taierzhuang1938/Script_FirstLevelGengFamilyTest.mjs
import assert from "node:assert/strict";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { MISSION_TUNING as R } from "./Data_Tuning_FirstLevel.mjs";
import { MISSION_ROUTES, MISSION_ANCHORS as A } from "./Data_FirstLevelMissionLayout.mjs";
import { SampleMissionTerrain as Ground } from "./Data_FirstLevelMissionTerrain.mjs";
import { MissionRouteLength, MissionCarryRoutePoint } from "./Script_FirstLevelMissionColumn.mjs";
import { ACTOR_MESH_BY_VARIANT } from "./Data_Meshes.mjs";
import { MISSION_DIALOGUE, MISSION_VOICE_CAST } from "./Data_FirstLevelMissionDialogue.mjs";
import { FIRST_LEVEL_DIALOGUE_DIRECTION } from "./Data_FirstLevelDialogueDirection.mjs";
import { FIRST_LEVEL_VOICE_CAST } from "./Data_FirstLevelVoiceCast.mjs";
import { FirstLevelGengFamily, RimSide, ShellLandingPoint, MuzzlePoint, FaceYaw, PlayerYawTo, GENG_IDS, NIER_SHOUT_CUE } from "./Script_FirstLevelGengFamily.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const Read = (file) => fs.readFileSync(path.join(HERE, file), "utf8");
const T = R.geng;
const Distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
let checks = 0;
const Check = (ok, message) => { assert.ok(ok, message); checks++; };

// 1. 接口（契约 §5.6）：方法都在；必填参数个数不变。
{
  const proto = FirstLevelGengFamily.prototype;
  const required = { Enter: 1, Update: 1, Follow: 1, RunTo: 1, PointAt: 1, PickShellNear: 1, GengGoTo: 1, GengPose: 1, CartTo: 1, Protect: 0 };
  for (const [name, arity] of Object.entries(required)) {
    Check(typeof proto[name] === "function", `§5.6 方法 ${name} 存在`);
    Check(proto[name].length === arity, `${name} 的必填参数 ${arity} 个（实际 ${proto[name].length}；缺省参数不计）`);
  }
  for (const getter of ["geng", "nier", "heizi", "cart"])
    Check(typeof Object.getOwnPropertyDescriptor(proto, getter)?.get === "function", `§5.6 读口 get ${getter}()`);
  Check(ACTOR_MESH_BY_VARIANT.civilian.girl === "CivilianFemale", "妮儿的占位分身 girl = CivilianFemale（契约 §1.9）");
  const actorSource = Read("Script_Actor.mjs");
  Check(/girl:\s*0\.62/.test(actorSource) && actorSource.includes('pickable: ["male", "female"]'), "KIND_SPEC.civilian 的 girl 缩 0.62，且不进 seed 随机池");
  Check(T.nierScale === 0.62 && T.heiziScale === 0.75, "妮儿 0.62、黑子 0.75（契约 §1.9）");
  Check(MISSION_VOICE_CAST.geng && MISSION_VOICE_CAST.peasant && FIRST_LEVEL_VOICE_CAST.geng && FIRST_LEVEL_VOICE_CAST.peasant, "geng / peasant 进了对白表与定妆表");
  Check(!MISSION_VOICE_CAST.nier, "妮儿不进对白表（叫声 / 笑声走音效）");
  Check(typeof NIER_SHOUT_CUE === "string" && NIER_SHOUT_CUE.length, "妮儿的叫声有占位 cue");
  const shells = MISSION_DIALOGUE.find((cue) => cue.id === "NierShells");
  Check(shells?.perLine && shells.lines.map((l) => l.who).join() === "bearer,peasant", "NierShells：担架员 / 庄稼人两句、逐句格式");
  Check(FIRST_LEVEL_DIALOGUE_DIRECTION.NierShells?.lines?.["01"] && FIRST_LEVEL_DIALOGUE_DIRECTION.NierShells.lines["02"], "NierShells 有导演表");
  const follow = MISSION_DIALOGUE.find((cue) => cue.id === "NierFollow");
  Check(follow && !follow.perLine && follow.lines.map((l) => l.who).join() === "yaowa,shunzi,yaowa", "NierFollow：幺娃 / 顺子 / 幺娃，整段格式");
  const whisper = MISSION_DIALOGUE.find((cue) => cue.id === "SouthWhisper");
  Check(whisper.lines.length === 7 && whisper.lines[6].who === "yaowa" && whisper.lines[6].text === "一个女娃儿，她懂个啥子。", "SouthWhisper 末尾加了幺娃那一句");
}

// 2. 纯几何：沟沿取高的那一侧；弹壳落在枪口右侧；枪口在眼前。
{
  const flat = () => 0;
  const at = { x: 0, z: 0, yaw: 0 };
  Check(RimSide(at, 3, flat).side === "right", "两边一样高取右侧（东）");
  const leftHigh = (x) => (x < 0 ? 1 : -1);
  Check(RimSide(at, 3, leftHigh).side === "left" && RimSide(at, 3, leftHigh).x < 0, "左边高取左边");
  const rightHigh = (x) => (x > 0 ? 1 : -1);
  Check(RimSide(at, 3, rightHigh).side === "right" && Math.abs(RimSide(at, 3, rightHigh).x - 3) < 1e-9, "右边高取右边、离中线 offsetM");
  const player = { x: 10, z: -20 }, yaw = 0;   // 朝 −z
  for (let i = 0; i < 20; i++) {
    const p = ShellLandingPoint(player, yaw, Math.random);
    const side = (p.x - player.x) * Math.cos(yaw) - (p.z - player.z) * Math.sin(yaw);
    Check(side >= T.shellEjectM[0] - 1e-9 && side <= T.shellEjectM[1] + 1e-9, "弹壳落在枪口右侧 shellEjectM 米内");
  }
  const muzzle = MuzzlePoint(player, yaw);
  Check(Math.abs(muzzle.z - (player.z - 0.8)) < 1e-9 && Math.abs(muzzle.x - player.x) < 1e-9, "枪口在玩家前方 0.8 m");
  Check(Math.abs(FaceYaw({ x: 0, z: 0 }, { x: 0, z: -5 })) < 1e-9, "NPC 面朝 −z 的 yaw 是 0");
  Check(Math.abs(PlayerYawTo({ x: 0, z: 0 }, { x: 0, z: -5 })) < 1e-9, "玩家面朝 −z 的 yaw 是 0");
}

// 3. 06 摆位：沟沿上的点在洼地外、比洼地场坪高；07 沟身里程在路线上。
{
  const floor = Ground(A.collection.x, A.collection.z);
  const rim = Ground(T.nierRim.x, T.nierRim.z), peasant = Ground(T.peasantSpot.x, T.peasantSpot.z);
  Check(rim - floor >= 1.2, `妮儿蹲的沟沿比洼地场坪高 ${(rim - floor).toFixed(2)} m（要 ≥ 1.2）`);
  Check(peasant - floor >= 1.0, `庄稼人站的坡比洼地高 ${(peasant - floor).toFixed(2)} m`);
  Check(Distance(T.nierRim, A.collection) < 12 && Distance(T.nierRim, T.peasantSpot) < 4, "妮儿离集结处锚点不到 12 m，庄稼人在她身边");
  const length = MissionRouteLength(MISSION_ROUTES.southWalk);
  Check(T.trenchProgressM[0] > 0 && T.trenchProgressM[1] < length, "沟身里程在 southWalk 上");
  for (const p of [T.trenchProgressM[0] + 2, 50, 60, T.trenchProgressM[1] - 2]) {
    const at = MissionCarryRoutePoint(MISSION_ROUTES.southWalk, p);
    const side = RimSide(at, T.rimOffsetM, Ground);
    Check(Ground(side.x, side.z) - Ground(at.x, at.z) >= 1.0, `里程 ${p} m：沟沿比沟底高 ≥ 1 m（${(Ground(side.x, side.z) - Ground(at.x, at.z)).toFixed(2)}）`);
  }
  Check(Distance(T.villageRefuge, MISSION_ROUTES.southWalk.at(-1)) < 6 && Ground(T.villageRefuge.x, T.villageRefuge.z) > -1, "村北巷的躲处在 southWalk 末点旁");
}

// 4. 假运行时：装配、06 捡弹壳、07 跟队、撒腿、指物、老耿、驴车、保护。
function FakeRuntime() {
  let nextId = 1;
  const facts = new Set(), said = [], played = [], spawnQueue = [];
  const r = {
    time: 0, delta: 1 / 60, facts, said, played, spawnQueue,
    flow: { stage: { id: "Orders" } },
    player: { position: { x: A.collection.x, z: A.collection.z, y: 0 }, yaw: 0, pitch: 0, EyePosition: { x: A.collection.x, y: 1.6, z: A.collection.z } },
    battlefield: { GroundHeight: Ground },
    scene: null,
    Point: (p, rise = 0) => ({ x: p.x, y: Ground(p.x, p.z) + rise, z: p.z }),
    Has: (id) => facts.has(id),
    Record: (id, detail) => { if (facts.has(id)) return false; facts.add(id); r.log?.push({ id, detail }); return true; },
    Say: (id) => { said.push(id); },
    Inventory: () => ({ shots: r.shots }),
    shots: 0,
    column: { TailProgress: () => r.tail, litters: [] }, tail: 40,
    companion: { Handle: (who) => (who === "yaowa" ? r.yaowa : null) },
    yaowa: { alive: true, position: { x: A.collection.x, z: A.collection.z } },
    audio: { Play: (name, options) => { played.push({ name, ...options }); } },
    voice: { Signal() {} },
    MoveActor: (actor, point, speed) => { actor.goal = { x: point.x, z: point.z }; actor.speed = speed; },
    ai: {
      time: 0, soldiers: [],
      Spawn: (side, x, z, options) => {
        if (r.spawnFail) return null;
        const actor = { id: nextId++, side, alive: true, position: { x, y: Ground(x, z), z }, yaw: 0, stance: 0, options,
          actor: { characterRig: { modelId: options.actorVariant === "girl" ? "CivilianFemale" : "CivilianMale" }, sizeScale: options.actorVariant === "girl" ? 0.62 : 1.03, variant: options.actorVariant } };
        r.ai.soldiers.push(actor);
        return actor;
      },
      Remove: (actor) => { actor.alive = false; r.ai.soldiers = r.ai.soldiers.filter((s) => s !== actor); },
      SetStance: (actor, stance) => { actor.stance = stance; },
    },
    Objective: () => {},
  };
  r.log = [];
  return r;
}
/** 推 seconds 秒：每帧把每个人按 goal / speed 挪一步（假物理）。 */
function Step(r, geng, seconds) {
  const frames = Math.round(seconds * 60);
  for (let i = 0; i < frames; i++) {
    r.time += 1 / 60; r.ai.time = r.time;
    for (const s of r.ai.soldiers) {
      if (!s.goal || !(s.speed > 0)) continue;
      const d = Distance(s.position, s.goal);
      const step = Math.min(d, s.speed / 60);
      if (d > 1e-6) { s.position.x += (s.goal.x - s.position.x) / d * step; s.position.z += (s.goal.z - s.position.z) / d * step; }
      s.position.y = Ground(s.position.x, s.position.z);
    }
    geng.Update(1 / 60);
  }
}
{
  const r = FakeRuntime(), geng = new FirstLevelGengFamily(r);
  geng.Enter("Orders");
  const nier = geng.nier, peasant = geng.peasant;
  Check(nier.actor && nier.actor.options.actorKind === "civilian" && nier.actor.options.actorVariant === "girl", "06 进场：妮儿是百姓 girl 分身");
  Check(nier.actor.scriptEssential && nier.actor.missionUntargetable && nier.actor.scriptedNoncombatant === undefined || nier.actor.options.scriptedNoncombatant, "妮儿 scriptEssential + missionUntargetable + 不参战");
  Check(peasant.actor?.options.actorVariant === "male" && nier.actor.missionId === GENG_IDS.nier, "庄稼人是 CivilianMale；missionId 按表");
  Check(Distance(nier.actor.position, T.nierRim) < 0.01, "妮儿在沟沿那个点上");
  // 玩家还在远处：没看见。
  Step(r, geng, 2);
  Check(!r.facts.has("nierSeen") && !r.said.includes("NierShells"), "玩家没进洼地：不记 nierSeen、不喊");
  // 闲着会一颗一颗捡（蹲下 → 口袋响一声）。
  Step(r, geng, 8);
  Check(geng.State().nier.shells >= 1, `闲着也在捡弹壳（${geng.State().nier.shells}）`);
  Check(r.played.some((p) => p.name === "shellDrop"), "捡到弹壳口袋响一声");
  // 进洼地、ordersReached：担架员喊她。
  r.facts.add("ordersReached");
  r.player.position.x = T.nierRim.x - 8; r.player.position.z = T.nierRim.z + 6;
  Step(r, geng, 0.2);
  Check(r.facts.has("nierSeen") && r.said.includes("NierShells"), "走到 16 m 内：nierSeen + NierShells");
  // 走到 6 m 内：她看枪口（watchYaw 朝枪口，不朝脸）。
  r.player.position.x = T.nierRim.x - 3; r.player.position.z = T.nierRim.z + 3; r.player.yaw = Math.PI / 2;
  Step(r, geng, 0.5);
  const muzzle = MuzzlePoint(r.player.position, r.player.yaw);
  Check(Math.abs(FaceYaw(nier.actor.position, muzzle) - nier.actor.watchYaw) < 1e-6 || geng.State().nier.picking, "≤ 6 m 她的头朝枪口");
  // 8 m 内开一枪：她去捡枪口右侧的弹壳。
  const before = geng.State().nier.shells;
  geng.nierPick = null; geng.nierState = "idle"; geng.nextIdlePickAt = r.time + 60;
  r.shots = 3; Step(r, geng, 1 / 60); r.shots = 4; Step(r, geng, 1 / 60);
  Check(geng.State().nier.picking, "开枪后她去捡");
  const target = geng.nierPick.target;
  const side = (target.x - r.player.position.x) * Math.cos(r.player.yaw) - (target.z - r.player.position.z) * Math.sin(r.player.yaw);
  Check(side > 0.5 && side < 1.5, `捡的是枪口右侧的落点（${side.toFixed(2)} m）`);
  Step(r, geng, 6);
  Check(geng.State().nier.shells === before + 1 && !geng.State().nier.picking, "走过去蹲下捡完，弹壳 +1");
  // 07：起行跟队（庄稼人收走），目标在队尾后 gapM、沟沿那一侧。
  r.flow.stage.id = "South";
  geng.Enter("South");
  Check(!geng.peasant.actor, "07 庄稼人收走");
  Check(geng.State().nier.following, "07 跟队");
  r.tail = 50; r.player.position = { x: -16, z: -60, y: 0 };
  Step(r, geng, 0.1);
  const goal = nier.actor.goal;
  const want = MissionCarryRoutePoint(MISSION_ROUTES.southWalk, 50 - T.followGapM);
  Check(Distance(goal, want) > T.rimOffsetM - 0.3 && Distance(goal, want) < T.rimOffsetM + 0.3, `跟队目标离沟中线 rimOffsetM（${Distance(goal, want).toFixed(2)}）`);
  Check(Ground(goal.x, goal.z) - Ground(want.x, want.z) >= 1.0, "跟队目标在沟沿上（比沟底高）");
  Step(r, geng, 45);
  Check(Distance(nier.actor.position, nier.actor.goal) < 1.5, `她走到了沟沿上的跟队点附近（离 ${Distance(nier.actor.position, nier.actor.goal).toFixed(2)} m）`);
  // NierFollow：玩家走过 followCueProgressM、幺娃活着、她在 followRangeM 内才说。
  Check(r.said.includes("NierFollow"), "沟里幺娃丢弹壳逗她（NierFollow）");
  geng.OnLine("NierFollow", 2);
  Check(geng.State().nier.picking && r.played.filter((p) => p.name === NIER_SHOUT_CUE).length >= 1, "幺娃丢的弹壳她去捡，叫一声");
  Step(r, geng, 6);
  // SouthWhisper 第 5→6 句：顺子轻微转头看她（不是接管）。
  const yaw0 = r.player.yaw;
  geng.OnLine("SouthWhisper", 5);
  Check(geng.State().gaze, "第 6 句起转头看她");
  Step(r, geng, T.gazeS + 0.1);
  Check(!geng.State().gaze && Math.abs(r.player.yaw - yaw0) <= T.gazeRad + 1e-6 && r.player.yaw !== yaw0, `转头不超过 gazeRad（转了 ${(r.player.yaw - yaw0).toFixed(3)}）`);
  // 机枪一响：撒腿跑进村北巷。
  geng.OnMouthContact();
  Check(geng.State().nier.running, "mouthContact：撒腿跑");
  Step(r, geng, 1 / 60);
  Check(nier.actor.speed === T.runMps, "跑的是 runMps");
  Step(r, geng, 60);
  Check(!geng.State().nier.running && Distance(nier.actor.position, T.villageRefuge) < 1.2, `跑到了村北巷的躲处（离 ${Distance(nier.actor.position, T.villageRefuge).toFixed(2)} m）`);
  Check(geng.State().events.some((e) => e.name === "nier_shout" && e.why === "refuge"), "到了叫一声");
  // 08：老耿与驴车出场；指物 / 走位 / 姿态 / 推车 / 保护。
  r.flow.stage.id = "Village";
  geng.Enter("Village");
  Check(geng.geng.actor?.options.actorVariant === "male" && geng.cart.state === "parked" && geng.heizi.position, "08 老耿（CivilianMale）与驴车（黑子）出场");
  geng.PointAt({ x: 60, z: 10 }, 2);
  Check(geng.State().nier.pointing && r.played.some((p) => p.name === "impactWood"), "拍车板指屋顶：叫一声、车板响");
  let arrived = false;
  Check(geng.GengGoTo({ x: T.gengHouse.x + 4, z: T.gengHouse.z + 2 }, () => { arrived = true; }), "老耿走位");
  Step(r, geng, 8);
  Check(arrived && !geng.State().geng.walking, "老耿走到了、回调到了");
  for (const kind of ["slap", "vat", "table", "unbar", "lead-donkey", "load"]) { Check(geng.GengPose(kind) && geng.State().geng.pose === kind, `老耿姿态 ${kind}`); }
  Check(r.played.some((p) => p.name === "slap"), "揪妮儿一巴掌有一声");
  let cartDone = false;
  geng.CartTo({ x: T.cartYard.x, z: T.cartYard.z + 6 }, () => { cartDone = true; });
  Step(r, geng, 0.5);
  Check(geng.cart.state === "moving" && geng.State().cart.travel > 0.3, "驴车在走");
  Step(r, geng, 8);
  Check(cartDone && geng.cart.state === "parked" && Math.abs(geng.cart.position.z - (T.cartYard.z + 6)) < 0.4, "驴车到了、回调到了");
  geng.SetCartBlocking(true);
  Check(geng.cart.blocking === true, "cart.blocking 读得到");
  geng.Protect(false);
  Check(!nier.actor.scriptEssential && !geng.geng.actor.scriptEssential && !geng.State().protected, "Protect(false) 摘保护");
  geng.Protect(true);
  Check(nier.actor.missionUntargetable && geng.State().protected, "Protect(true) 回来");
  const state = geng.State();
  for (const key of ["protected", "nier", "geng", "peasant", "heizi", "cart", "events"]) Check(key in state, `State() 有 ${key}`);
  Check(state.nier.model === "CivilianFemale" && state.nier.scale === 0.62, "State().nier 报占位模型与缩放");
  // 生成失败（人口满）会排进 spawnQueue 重试。
  const r2 = FakeRuntime(), g2 = new FirstLevelGengFamily(r2);
  r2.spawnFail = true; g2.Enter("Orders");
  Check(r2.spawnQueue.length === 2 && !g2.nier.actor, "人口满时排队重试");
  r2.spawnFail = false; while (r2.spawnQueue.length) r2.spawnQueue.shift()();
  Check(g2.nier.actor && g2.peasant.actor, "排队的两个人后来都生出来了");
  geng.Dispose();
  Check(!geng.nier.actor && !geng.geng.actor && !geng.cartState, "Dispose 收干净");
}

// 5. 运行时接线（薄钩子）与文本表。
{
  const runtime = Read("Script_FirstLevelMissionRuntime.mjs");
  Check(runtime.includes("this.gengFamily = new FirstLevelGengFamily(this);"), "运行时装配 GengFamily 一行");
  Check(runtime.includes("this.gengFamily.Enter(stage.id);") && runtime.includes("this.gengFamily.Update(dt);"), "Enter / Update 各一行薄钩子");
  Check(runtime.includes("this.gengFamily?.OnLine(cueId,detail?.index)") && runtime.includes("this.gengFamily?.VoicePosition(cue,line)"), "逐句事件与说话位置转给 GengFamily");
  Check(runtime.includes("gengFamily:this.gengFamily.State()"), "状态进 Debug.FirstLevelMission().gengFamily");
  const text = Read("Data_Text_FirstLevel.mjs");
  Check(text.includes('"Script_FirstLevelGengFamily.mjs"'), "GengFamily 进 Script_TextTest 的闸门模块");
  const collection = Read("Script_FirstLevelCollection.mjs");
  Check(collection.includes('id: "MissionBorrowLight"') && collection.includes('Signal?.("BorrowLightMatchAsked")') && collection.includes('Record?.("matchAsked")'), "06 借火两次 F：交互点 + 第二次 F 发事件记 matchAsked");
  Check(FIRST_LEVEL_DIALOGUE_DIRECTION.BorrowLight.lines["07"].after === "event:BorrowLightMatchAsked", "BorrowLight.07 等第二次 F");
  const frontShow = Read("Script_FirstLevelFrontShow.mjs");
  Check(frontShow.includes('r.Has("nierFollowHeard")'), "SouthWhisper 在 NierFollow 之后才说");
  const column = Read("Script_FirstLevelMissionColumn.mjs");
  Check(column.includes("TailProgress()") && column.includes("LeadProgress()"), "担架队只读口 TailProgress / LeadProgress");
}
console.log(`ok 耿家四个角色：接口 / 占位分身 / 06 捡弹壳与看枪 / 07 沟沿跟队、撒腿进村 / 08 老耿与驴车 / 薄钩子（${checks} 项）`);
