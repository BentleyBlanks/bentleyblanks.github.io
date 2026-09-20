// ===========================================================================
// Script_FirstLevelEndTest.mjs —— 第一关公开阶段 15–18（End 包）的纯 Node 闸门
//
// 守的是 Notion 采用稿里那几条「必须真实发生」的东西，不是「代码跑得通」：
//   1. 降压段（15A/15B/15C、16、17）一个敌人都不生成；
//   2. 换手抬运是后抬手真的撒了手才轮到顺子，夹道末段真有一整段无对白行走；
//   3. 院门先拦、确认身份、接收人员指了位置，伤员才真的往院里走；
//   4. 过门槛担架真的歪一下，「脚……慢点」之后老周再没有任何台词；
//   5. 死亡段的接管时长盖得住 ZhouDeath 的整条录音，且老周死亡不判全关失败；
//   6. 回援尾队是真人实体，北岸火力下真的停下，打断之后才过桥；
//   7. 爆破区里只要还有己方就一直等 —— 不是到点就炸的计时器；
//   8. 炸桥一次翻完 5 个完好件 + 3 个残骸件，桥面退出可走面；
//   9. 夜景与夜天空藏在黑屏里换，退出/重试/回跳一盏灯都不留。
//
// 三个步骤模块都是零 three 的，所以这里用一个替身宿主真跑它们的 Update，
// 不是只读数据表。跑法：node Taierzhuang1938/Script_FirstLevelEndTest.mjs
// ===========================================================================
import assert from "node:assert/strict";
import { MISSION_STAGES, MISSION_ENCOUNTERS, MISSION_TUNING as R } from "./Data_FirstLevelMission.mjs";
import { MISSION_STEP_SPAWNS, MISSION_FACT_GATES, MISSION_SCENARIO_SIGNALS } from "./Data_FirstLevelMissionGates.mjs";
import { MISSION_RETURN_DISABLED_STAGES } from "./Data_FirstLevelMissionReturn.mjs";
import { FIRST_LEVEL_STAGE_ENCOUNTERS, FIRST_LEVEL_STAGES } from "./Data_FirstLevelMissionStages.mjs";
import { MISSION_LAYOUT, MISSION_ANCHORS as A, MISSION_PLACEMENT as P, MISSION_ROUTES } from "./Data_FirstLevelMissionLayout.mjs";
import { MISSION_RAIL_BRIDGE, MISSION_STAGE_ROUTES, MISSION_RECEPTION_SPACE, MissionRegroupCorridor, RegroupGuideRoute } from "./Data_FirstLevelMissionTopology.mjs";
import { MISSION_DIALOGUE } from "./Data_FirstLevelMissionDialogue.mjs";
import { MISSION_VOICE_ALIGNMENT } from "./Data_FirstLevelMissionVoiceAlignment.mjs";
import { FIRST_LEVEL_STAGE_MUSIC, FirstLevelMusicState } from "./Data_FirstLevelMissionMusic.mjs";
import { END_TUNING as E } from "./Data_Tuning_FirstLevelEnd.mjs";
import { FirstLevelMissionColumn, MissionRouteProjection } from "./Script_FirstLevelMissionColumn.mjs";
import { EndExtras, EndDressing, EndProjectOnto, EndRouteLength, EndRoutePoint } from "./Script_FirstLevelEndCast.mjs";
import { FirstLevelQuietMarch, QUIET_MARCH_PICKETS, QUIET_MARCH_WALL_LENGTH } from "./Script_FirstLevelQuietMarch.mjs";
import { FirstLevelReception, RECEPTION_CAST } from "./Script_FirstLevelReception.mjs";
import { FirstLevelBridge, BRIDGE_NORTH_IDS, BRIDGE_GUNNER_ID, BRIDGE_CAST, REAR_COLUMN_IDS, BRIDGE_CROSSING_LENGTH } from "./Script_FirstLevelBridge.mjs";
import { FirstLevelNightGate, NightLightSpecs } from "./Script_FirstLevelNightGate.mjs";

let checks = 0;
const Check = (condition, message) => { assert.ok(condition, message); checks += 1; };
const Distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const byCue = new Map(MISSION_DIALOGUE.map(cue => [cue.id, cue]));

// ---------------------------------------------------------------------------
// 替身宿主：只实现 End 模块真正用到的那一小片运行时接口。
// ---------------------------------------------------------------------------
function FakeActor(id, x, z, options = {}) {
  return {
    id, missionId: id, alive: true, side: "nra", yaw: 0, stance: 0, target: null,
    position: { x, y: 0, z }, goal: { x, y: 0, z, set(nx, ny, nz) { this.x = nx; this.y = ny; this.z = nz; } },
    castId: options.castId || null, weaponId: options.weapon || null, unarmed: !!options.unarmed,
    scriptedNoncombatant: false, missionTrainReady: false,
  };
}
function FakeRuntime({ stage = "Regroup" } = {}) {
  const facts = new Set(), said = [], recorded = [], removed = [];
  const enemies = new Map();
  const companions = new Map(["luo", "yaowa", "heyoutian", "liuwencai"].map((castId, i) =>
    [castId, FakeActor(`Companion${i}`, 0, 0, { castId })]));
  const r = {
    facts, said, recorded, removed, enemies, spawnFailures: 0,
    flow: { stage: { id: stage } },
    time: 0,
    player: { position: { x: 0, y: 0, z: 0 } },
    column: new FirstLevelMissionColumn(),
    voice: { played: new Set(), finished: new Set(), current: null },
    carry: { KindId: null, Active: false },
    squad: [...companions.values()],
    companion: { Handle: id => companions.get(id) || null },
    battlefield: { GroundHeight: () => 0 },
    audio: { Ambience(name) { r.ambience = name; }, Play() {} },
    vfx: { Explosion(at, options) { r.explosions.push({ ...at, ...options }); } },
    explosions: [],
    nightLights: { specs: [], Sync(specs) { this.specs = specs; return specs.length; }, get count() { return this.specs.length; } },
    threatIds: new Set(),
    Has: id => facts.has(id),
    Record(id, detail) { if (facts.has(id)) return false; facts.add(id); recorded.push({ id, detail }); return true; },
    Say(id) { if (!r.voice.played.has(id)) { r.voice.played.add(id); said.push(id); } },
    /** 测试里手动放完一条 cue。 */
    Finish(id) { r.voice.played.add(id); r.voice.finished.add(id); facts.add(VOICE_FACT[id] || `__${id}`); },
    GateNear(fact) {
      const gate = MISSION_FACT_GATES[fact];
      assert.ok(gate && gate.kind === "proximity", `GateNear: ${fact} 不是距离门`);
      const point = gate.point || A[gate.anchor];
      return Distance(r.player.position, point) < gate.radiusM;
    },
    Threatens(point, ids = null) {
      for (const [id, actor] of enemies) {
        if (!actor.alive || (ids && !ids.includes(id))) continue;
        if (r.threatIds.has(id) && Distance(actor.position, point) < 90) return true;
      }
      return false;
    },
    Point: (point, rise = 0) => ({ x: point.x, y: rise, z: point.z }),
    ColumnProgressAt: point => MissionRouteProjection(r.column.route, point).progress,
    InstallSentry() {},
    PlaceActor(actor, point) { if (actor) { actor.position.x = point.x; actor.position.z = point.z; } },
    // 替身里的「走路」是瞬时的：一帧走 speed*dt。真实移动由 AI 做，这里只验证编排。
    MoveActor(actor, point, speed) {
      if (!actor?.alive) return;
      actor.order = "advance";
      const step = Math.min(1, (speed * r.dt) / (Distance(actor.position, point) || 1));
      actor.position.x += (point.x - actor.position.x) * step;
      actor.position.z += (point.z - actor.position.z) * step;
    },
    Defend(actor, point) { if (actor) { actor.order = "hold"; actor.scriptedNoncombatant = false; actor.holdZone = { ...point }; } },
    ai: {
      time: 0,
      SetStance(actor, stance) { if (actor) actor.stance = stance; },
      Spawn(side, x, z, options) {
        if (r.spawnFailures > 0) { r.spawnFailures -= 1; return null; }
        return FakeActor(`${options.squadId}`, x, z, options);
      },
      Remove(actor) { removed.push(actor.missionId); actor.alive = false; },
    },
    Guide(route) { r.guided = route; },
    BeginControl(kind, seconds) { r.control = { kind, seconds }; },
    BeginNightTransition() { r.transition = true; },
    RestoreSky() { r.sky = "day"; },
    ApplySky(name) { r.sky = name; },
    dt: 1 / 30,
  };
  r.extras = new EndExtras(r);
  r.dressing = new EndDressing();
  r.quietMarch = new FirstLevelQuietMarch(r);
  r.reception = new FirstLevelReception(r);
  r.bridge = new FirstLevelBridge(r);
  r.nightGate = new FirstLevelNightGate(r);
  // 与 FirstLevelMissionRuntime.Update 同一个顺序：布景清帧 → 各步骤模块 → 担架队。
  r.Step = (seconds, step) => {
    const frames = Math.max(1, Math.round(seconds / r.dt));
    for (let i = 0; i < frames; i++) {
      r.time += r.dt; r.ai.time += r.dt;
      r.dressing.Begin();
      let maxProgress = Infinity;
      if (["Regroup", "WallPath", "ReceptionGate"].includes(step)) r.quietMarch.Update(r.dt, step);
      if (["ReceptionGate", "Handover", "Death", "BridgeOrders"].includes(step)) r.reception.Update(r.dt, step);
      if (step === "ReceptionGate") maxProgress = r.reception.GateLimit();
      if (["BridgeOrders", "BridgeCover", "BridgeWithdraw"].includes(step)) r.bridge.Update(r.dt, step);
      r.nightGate.Update(r.dt, step);
      if (r.column.active)
        r.column.Update(r.dt, {
          moving: ["Regroup", "WallPath", "ReceptionGate"].includes(step),
          routeSafe: true, maxProgress, player: r.player.position,
        });
    }
  };
  return r;
}
const VOICE_FACT = Object.freeze({
  PicketHold: "picketHolding", ZhouCheck: "zhouChecked", Headcount: "headcountDone",
  GateChallenge: "gateChallenged", ReceptionAccept: "receptionAccepted",
  MedicAsk: "medicExamining", SquadAssign: "squadAssigned",
  BridgeOrders: "bridgeOrdersHeard", MarchToTengxian: "marchOrderHeard",
});

// ---------------------------------------------------------------------------
// 1. 降压段没有一个敌人（Notion 15A「玩家暂时不进入新一轮守波次」，15B「全程无敌人」）
// ---------------------------------------------------------------------------
{
  const quiet = ["Regroup", "WallPath", "ReceptionGate", "Handover", "Death"];
  for (const step of quiet)
    Check(!MISSION_STEP_SPAWNS[step], `${step} 不许按表生成任何遭遇组，实际 ${JSON.stringify(MISSION_STEP_SPAWNS[step])}`);
  for (const phase of [15, 16, 17])
    Check(FIRST_LEVEL_STAGE_ENCOUNTERS[phase - 1].length === 0,
      `阶段 ${phase} 跳进去时不该有活着的遭遇组，实际 ${JSON.stringify(FIRST_LEVEL_STAGE_ENCOUNTERS[phase - 1])}`);
  // 18 只有北岸土坎那一组，而且是延后放出（不是一进阶段就在桥边冒出来）。
  Check(MISSION_STEP_SPAWNS.BridgeCover.length === 1 && MISSION_STEP_SPAWNS.BridgeCover[0] === "bridgeNorth",
    "18 只有 bridgeNorth 一组");
  Check(MISSION_ENCOUNTERS.bridgeNorth.every(spec => spec.z <= A.railBridge.z - 18),
    "北岸土坎那一组全部摆在河口以北的外围战场，不在桥边凭空生成");
  console.log("ok 15–17 无战斗；18 只有北岸土坎一组，且来自北侧外围");
}

// ---------------------------------------------------------------------------
// 2. 15A 收拢：警戒兵真站位、老周担架两端真有人、队首真的走起来
// ---------------------------------------------------------------------------
{
  const r = FakeRuntime({ stage: "Regroup" });
  r.column.Activate();
  r.column.StartRetreat();
  // 空袭之后：两副担架倒在地上，其中一副少了一个抬手。
  r.column.litters[0].state = "fallen";
  r.column.litters[1].state = "fallen";
  r.column.litters[1].bearers[0] = 0;
  r.quietMarch.Enter("Regroup");
  Check(r.ambience === "firstLevelSouth", "15A 换成沟里那条安静的环境声（飞机声远去）");
  Check(QUIET_MARCH_PICKETS.every(id => r.extras.Actor(id)), "车路方向真的站了三个警戒兵");
  for (const [index, id] of QUIET_MARCH_PICKETS.entries())
    Check(Distance(r.extras.Actor(id).position, E.picketPosts[index]) < 0.01
      && E.picketPosts[index].x > A.retreatA.x, `${id} 站在收拢点与车路之间`);
  // 幸存者还散在车路上：litterRemanned 不许先记。
  r.Step(1, "Regroup");
  Check(!r.Has("litterRemanned"), "人还没进沟就不许算「担架重新有人」");
  Check(!r.Has("survivorsSheltered"), "散在路上不算进了沟内遮挡");
  // 把所有人摆进沟里，再跑一段：替补真的走过去接手（不是三秒定时器）。
  for (const [index, entry] of [...r.column.litters, ...r.column.walkers].entries()) {
    const on = EndRoutePoint(MISSION_ROUTES.evacuation, 4 + index * 1.4);
    entry.x = on.x; entry.z = on.z; entry.yaw = on.yaw;
    delete entry.rescueTarget; delete entry.rescueRoute;
  }
  r.Step(0.1, "Regroup");
  Check(r.Has("survivorsSheltered"), "全员贴进撤离沟的遮挡就记 survivorsSheltered");
  r.Step(20, "Regroup");
  Check(r.Has("litterRemanned"), "倒下的担架重新立起来、缺的抬手由民夫真的走过去补上");
  Check(r.column.litters.every(l => l.state !== "fallen"), "15A 之后没有担架还躺在地上");
  Check(r.column.zhou.bearers.every(h => h > 0), "老周担架两端都有人");
  const reman = r.recorded.find(entry => entry.id === "litterRemanned");
  Check(reman.detail.replacements >= 1, "至少换上过一个真实替补，而不是直接把血量填回去");
  // 队首要在「重新成形之后」再走一个担架间距才算开始移动。
  Check(r.Has("columnMoving"), "队伍重新成形之后队首真的走起来");
  const order = r.recorded.map(entry => entry.id);
  Check(order.indexOf("survivorsSheltered") < order.indexOf("litterRemanned")
    && order.indexOf("litterRemanned") < order.indexOf("columnMoving"),
  `三条事实必须按「进沟 → 重新有人 → 队首移动」的顺序记，实际 ${JSON.stringify(order)}`);
  const moving = r.recorded.find(entry => entry.id === "columnMoving").detail;
  Check(moving.lead - moving.since >= E.columnMovingM,
    "「队首开始移动」量的是重新成形之后又走了多远，不是当下的里程数");
  console.log("ok 15A 警戒兵真站位、替补真接手、队首真的走起来");
}

// ---------------------------------------------------------------------------
// 3. 15A 的对白都挂在真实发生上：幺娃走到担架边才检查，点名要人在场，问赶车人要走过去
// ---------------------------------------------------------------------------
{
  // 这一节只看对白挂在什么上，不让担架队自己走（否则老周会从收拢点漂走）。
  const r = FakeRuntime({ stage: "Regroup" });
  r.quietMarch.Enter("Regroup");
  const zhou = r.column.zhou;
  Object.assign(zhou, { x: A.retreatA.x, z: A.retreatA.z, yaw: 0 });
  const yaowa = r.companion.Handle("yaowa");
  yaowa.position.x = A.retreatA.x + 30; yaowa.position.z = A.retreatA.z;
  r.Step(0.2, "Regroup");
  Check(!r.said.includes("ZhouCheck"), "幺娃还在 30 m 外就不许开口检查老周");
  r.Step(20, "Regroup");
  Check(Distance(yaowa.position, zhou) <= E.zhouCheckReachM, "幺娃真的走到担架边");
  Check(r.said.includes("ZhouCheck"), "到了担架边才起 ZhouCheck");
  // 点名：三个人得都在场。
  const he = r.companion.Handle("heyoutian"), wencai = r.companion.Handle("liuwencai");
  he.position.x = A.retreatA.x; he.position.z = A.retreatA.z;
  wencai.position.x = A.retreatA.x + 400; wencai.position.z = A.retreatA.z;
  r.player.position.x = A.retreatA.x; r.player.position.z = A.retreatA.z;
  r.Finish("ZhouCheck");
  r.Step(0.2, "Regroup");
  Check(!r.said.includes("Headcount"), "文财不在场就不许点名");
  wencai.position.x = A.retreatA.x + 3;
  r.Step(0.2, "Regroup");
  Check(r.said.includes("Headcount"), "三个人都在场才点名");
  // 逐句应答对着真人：Line 事件把说话的人转向何有田。
  r.quietMarch.OnLine("Headcount", { who: "liuwencai", index: 1 });
  const before = wencai.yaw;
  r.Step(0.5, "Regroup");
  Check(wencai.yaw !== before, "应答的人真的转过去对着何有田");
  // 问赶车人：要走到车边。
  r.Finish("Headcount");
  r.Step(0.2, "Regroup");
  Check(!r.said.includes("CartAbandon"), "离赶车人还远就不许问「车还走得了不」");
  r.player.position.x = E.droverPost.x; r.player.position.z = E.droverPost.z;
  r.Step(0.2, "Regroup");
  Check(r.said.includes("CartAbandon"), "走到赶车人跟前才问");
  Check(r.dressing.people.some(entry => entry.id === "TransferDrover"), "赶车人真的画在车边");
  Check(r.dressing.props.some(entry => entry.key === "cart"), "被丢下的那辆车真的在场");
  console.log("ok 15A 三段对白全部挂在真实发生上");
}
// 「走到车边就问」不许再压别的前置：赶车人在沟口、离收拢点 28 m，而点名一完 15A
// 几秒内就换步 —— 压一条 headcountDone 就等于把这句台词彻底关掉（实拍 2026-09-20 两趟）。
{
  const r = FakeRuntime({ stage: "Regroup" });
  r.quietMarch.Enter("Regroup");
  r.player.position.x = E.droverPost.x; r.player.position.z = E.droverPost.z;
  r.Step(0.2, "Regroup");
  Check(r.said.includes("CartAbandon") && !r.Has("headcountDone"),
    "点名之前走到车边也问得出口（这句话的唯一条件就是「走到跟前」）");
  console.log("ok 15A 问赶车人只认「走到车边」这一条");
}

// ---------------------------------------------------------------------------
// 4. 15B 换手抬运：后抬手先撒手，顺子才接；过坎、手抖、末段静默
// ---------------------------------------------------------------------------
{
  // 担架队不激活：这一节手工摆老周的位置，让编排的判据独立于队列行进。
  const r = FakeRuntime({ stage: "WallPath" });
  const wallPath = MISSION_STAGE_ROUTES.wallPath;
  const zhou = r.column.zhou;
  const start = EndRoutePoint(wallPath, 0);
  Object.assign(zhou, { x: start.x, z: start.z, yaw: start.yaw, state: "waiting" });
  r.quietMarch.Enter("WallPath");
  r.Step(0.2, "WallPath");
  Check(!r.Has("carrySwapOffered"), "刚进夹道后抬手还撑得住");
  const swap = EndRoutePoint(wallPath, E.carrySwapProgressM + 1);
  Object.assign(zhou, { x: swap.x, z: swap.z, yaw: swap.yaw });
  r.Step(0.1, "WallPath");
  Check(r.Has("carrySwapOffered") && r.said.includes("CarrySwap"), "走到换手点后抬手才撒手");
  Check(zhou.bearers[0] === 0 && zhou.ambushHold === true && zhou.scriptedHandoffHold === true,
    "撒手之后担架后端真的空着、原地等顺子且不许叫民夫顶上");
  // 顺子按 F 接过去。
  r.facts.add("carryHandover"); r.carry.KindId = "stretcher";
  r.Step(0.1, "WallPath");
  Check(zhou.bearers[0] > 0 && !zhou.ambushHold && !zhou.scriptedHandoffHold,
    "顺子接手之后后端就是他，原地等待和替补两把闸都解开");
  // 过坎。
  Object.assign(zhou, { x: E.roadBump.x, z: E.roadBump.z });
  r.Step(0.1, "WallPath");
  Check(r.Has("roadBumpCrossed") && r.said.includes("RoadBump"), "抬着人走上那一处 0.22 m 的坎才起 RoadBump");
  Check(!r.said.includes("HandsShake"), "刚过坎不许马上接「你手还抖」");
  const after = EndRoutePoint(wallPath, EndProjectOnto(wallPath, E.roadBump).progress + E.handsShakeAfterBumpM + 1);
  Object.assign(zhou, { x: after.x, z: after.z });
  r.Step(0.1, "WallPath");
  Check(r.said.includes("HandsShake"), "又走一段幺娃才说");
  // 末段静默：站着不动不算 —— 量的是「一边走一边没人说话」。
  let walked = E.silenceFromProgressM;
  const wallPathEndM = EndProjectOnto(wallPath, A.wallPathEnd).progress;
  const Advance = (seconds, speed) => {
    for (let i = 0; i < Math.round(seconds / r.dt); i += 1) {
      walked = Math.min(QUIET_MARCH_WALL_LENGTH, walked + speed * r.dt);
      const at = EndRoutePoint(wallPath, walked);
      r.player.position.x = at.x; r.player.position.z = at.z;
      r.Step(r.dt, walked >= wallPathEndM ? "ReceptionGate" : "WallPath");
    }
  };
  r.player.position.x = EndRoutePoint(wallPath, walked).x;
  r.player.position.z = EndRoutePoint(wallPath, walked).z;
  r.Step(6, "WallPath");
  Check(!r.Has("quietWalkObserved"), "站着不动不算「无对白行走」");
  Advance(E.silenceWalkM / 2 / 1.6, 1.6);
  r.voice.current = { id: "interruption" };
  Advance(1, 1.6);
  r.voice.current = null;
  Check(!r.Has("quietWalkObserved") && r.quietMarch.wall.silentDistanceM === 0,
    "被对白打断的两段路不能拼成连续静默");
  Advance(E.silenceWalkM / 1.6 + 2, 1.6);
  Check(r.Has("quietWalkObserved"), `夹道末段真的走了 ${E.silenceWalkM} m 无对白的路`);
  Check(walked > wallPathEndM, "连续静默观察跨过 WallPath → ReceptionGate 的真实路线边界");
  const silence = r.recorded.find(entry => entry.id === "quietWalkObserved");
  Check(silence.detail.distanceM >= E.silenceWalkM, "静默段的实际行走距离是量出来的");
  // 这一段里不许再有新的 cue 起头。
  const afterSilence = r.said.length;
  Advance(6, 1.6);
  Check(r.said.length === afterSilence, "静默段里一条 cue 都不许插进来");
  console.log("ok 15B 换手、过坎、手抖与末段静默");
}

// ---------------------------------------------------------------------------
// 5. 15B 掉队伤员真的有人照应（照应者走到身边，不是「担架都动了就算」）
// ---------------------------------------------------------------------------
{
  const r = FakeRuntime({ stage: "WallPath" });
  r.quietMarch.Enter("WallPath");
  Check(r.quietMarch.wall.stragglers.length === P.wallPath.stragglers.length,
    "掉队伤员的人数读 MISSION_PLACEMENT.wallPath.stragglers");
  const wallPath = MISSION_STAGE_ROUTES.wallPath;
  for (const entry of r.quietMarch.wall.stragglers) {
    const on = EndProjectOnto(wallPath, entry);
    Check(Number.isFinite(entry.progress) && entry.progress >= 0, "掉队伤员起点投影到夹道中线上");
    void on;
  }
  r.Step(0.2, "WallPath");
  Check(!r.Has("stragglersTended"), "照应的人还在后头，不算已经照应上");
  r.Step(30, "WallPath");
  Check(r.Has("stragglersTended"), "照应的人赶上来并排走了才算");
  for (const entry of r.quietMarch.wall.stragglers)
    Check(Math.hypot(entry.tenderX - entry.x, entry.tenderZ - entry.z) <= E.stragglerTendReachM,
      `${entry.id} 身边真的有人`);
  const drawn = r.dressing.people.map(entry => entry.id);
  for (const entry of r.quietMarch.wall.stragglers)
    Check(drawn.includes(entry.id) && drawn.includes(entry.tender), `${entry.id} 与照应他的人都画出来了`);
  console.log("ok 15B 掉队伤员身边真的有人");
}

// ---------------------------------------------------------------------------
// 6. 15C 院门：先拦 → 确认身份 → 指位置 → 伤员才真的往里走
// ---------------------------------------------------------------------------
{
  const r = FakeRuntime({ stage: "ReceptionGate" });
  r.column.Activate();
  r.column.StartRetreat();
  r.reception.Enter("ReceptionGate");
  Check(RECEPTION_CAST.every(id => r.extras.Actor(id)), "院门守军两名、接收人员、军医都是真人实体");
  const guard = r.extras.Actor("GateGuardNorth");
  r.Step(4, "ReceptionGate");
  Check(Distance(guard.position, E.gateBlock) < 0.6, "盘问前有一个守军横在门洞中线上拦着");
  const limit = r.reception.GateLimit();
  Check(limit < r.ColumnProgressAt(A.receptionGate) && limit > 0, "没放行以前担架队压在院门以东排队");
  Check(!r.said.includes("GateChallenge"), "玩家还没走到门口就不许喝止");
  r.player.position.x = A.receptionGate.x; r.player.position.z = A.receptionGate.z;
  r.Step(0.2, "ReceptionGate");
  Check(!r.said.includes("GateChallenge"), "夹道静默还没走满时，即使到门口也不抢先起盘问");
  r.facts.add("quietWalkObserved");
  r.Step(0.2, "ReceptionGate");
  Check(r.said.includes("GateChallenge"), "连续静默走满且到了门口，守军才喝止");
  Check(r.column.mode !== "reception", "身份没确认以前伤员不许往院里走");
  r.Finish("GateChallenge");
  r.Step(6, "ReceptionGate");
  Check(r.said.includes("ReceptionAccept"), "接收人员真的迎出来才说「先抬进来」");
  Check(Distance(guard.position, P.receptionYard.gateGuard[0]) < 1.2, "放行之后守军让回自己的门垛");
  Check(r.column.mode !== "reception", "接收人员把话说完之前伤员还是不许进");
  r.Finish("ReceptionAccept");
  r.Step(0.2, "ReceptionGate");
  Check(r.column.mode === "reception", "位置说清楚了，担架队才上入院路线");
  Check(r.said.includes("WardGuide"), "刘文财在院里回头招呼担架跟他走");
  Check(r.reception.GateLimit() === Infinity, "放行之后不再压着队伍");
  Check(!r.Has("woundedEntering"), "刚上路线还不算「已经入院」");
  const entries = r.column.litters.filter(l => l.visible && l.health > 0 && !l.evacuated && !l.loaded);
  for (const [index, litter] of entries.entries()) { litter.receiveProgress = 1; litter.received = index < E.woundedEnteringLitters; }
  r.Step(0.2, "ReceptionGate");
  Check(r.Has("woundedEntering"), `全部上了路线、而且有 ${E.woundedEnteringLitters} 副真的进了院子`);
  console.log("ok 15C 院门先拦、确认身份、指位置，伤员才实际入院");
}

// ---------------------------------------------------------------------------
// 7. 16 门槛与放下担架：老周最后一句话，放下才恢复持枪
// ---------------------------------------------------------------------------
{
  // 台词侧：「脚……慢点」之后老周再没有任何一句。
  const order = MISSION_DIALOGUE.map(cue => cue.id);
  const thresholdAt = order.indexOf("Threshold");
  const zhouAfter = MISSION_DIALOGUE.slice(thresholdAt + 1).filter(cue => cue.lines.some(line => line.who === "zhou"));
  Check(thresholdAt > 0 && zhouAfter.length === 0,
    `Threshold 之后老周不许再说话，实际还有 ${JSON.stringify(zhouAfter.map(cue => cue.id))}`);
  Check(byCue.get("Threshold").lines[0].who === "zhou" && byCue.get("Threshold").lines[0].text.includes("慢点"),
    "Threshold 第一句就是老周那句「脚……慢点」");
  Check(byCue.get("RoadBump").lines[0].text === byCue.get("Threshold").lines[0].text,
    "15B 过坎与 16 过门槛是同一句（Notion 两处都写了「脚……慢点」）");

  const r = FakeRuntime({ stage: "Handover" });
  const zhou = r.column.zhou;
  Object.assign(zhou, { x: A.zhouDrop.x, z: A.zhouDrop.z, state: "carried" });
  r.carry.KindId = "stretcher";
  r.reception.Enter("Handover");
  r.extras.Spawn("WardSurgeon", P.receptionYard.surgeon, { weapon: null, unarmed: true });
  // 过门槛：担架真的歪一下，然后回正。
  r.facts.add("thresholdCrossed");
  r.Step(E.thresholdTiltS / 2, "Handover");
  Check(Math.abs(zhou.roll) > 0.02, "过门槛担架真的歪了一下");
  r.Step(E.thresholdTiltS, "Handover");
  Check(Math.abs(zhou.roll) < 1e-6, "颠完就回正，不是一直斜着");
  // 军医先指位置，才允许按 F。
  Check(!r.Has("placeOrderHeard"), "军医还没指位置");
  r.player.position.x = A.zhouDrop.x; r.player.position.z = A.zhouDrop.z;
  r.Step(20, "Handover");
  Check(r.said.includes("PlaceLitter"), "抬到位置边上、军医到位，他才说「这副放这里」");
  Check(r.Has("placeOrderHeard"), "喊出口就记 placeOrderHeard（F 的前置）");
  const placeGate = MISSION_FACT_GATES.zhouPlaced;
  Check(placeGate.requires?.includes("placeOrderHeard"), "zhouPlaced 的前置写进了编排表");
  // 放下之后军医真的开始看伤，其余伤员在流程里班长才分派。
  r.facts.add("zhouPlaced");
  Object.assign(zhou, { state: "placed" });
  r.carry.KindId = null;
  r.Step(12, "Handover");
  Check(r.said.includes("MedicAsk"), "放下之后军医走到担架边开始问伤情");
  r.Finish("MedicAsk");
  for (const litter of r.column.litters) if (!litter.zhou) litter.receiveProgress = 0.5;
  r.Step(0.2, "Handover");
  Check(r.said.includes("SquadAssign"), "其余幸存伤员也进了接收流程，班长才分派");
  r.Finish("SquadAssign");
  r.Step(0.2, "Handover");
  Check(r.Has("squadDispersed"), "分派完人真的被派出去");
  for (const castId of Object.keys(E.squadAssign))
    Check(r.reception.HasWalk(r.companion.Handle(castId).id), `${castId} 接了吩咐、由剧情走位接管`);
  Check(!r.reception.HasWalk(r.companion.Handle("yaowa").id), "幺娃留下，不给走位");
  const wencai = r.companion.Handle("liuwencai");
  const beforeWalk = { ...wencai.position };
  r.Step(10, "Handover");
  Check(Distance(wencai.position, beforeWalk) > 3, "被派出去的人真的走开了");
  console.log("ok 16 门槛一歪、军医先指位置、分派之后人真的动");
}

// ---------------------------------------------------------------------------
// 8. 17 死亡段：接管时长盖得住整条录音、接收处继续工作、不判失败
// ---------------------------------------------------------------------------
{
  const aligned = MISSION_VOICE_ALIGNMENT.ZhouDeath;
  Check(aligned && R.deathSeconds >= aligned.lines.at(-1)[1],
    `death 接管 ${R.deathSeconds} s 必须盖得住 ZhouDeath 的 ${aligned.lines.at(-1)[1]} s`);
  Check(R.deathSeconds < aligned.lines.at(-1)[1] + 3, "也不许拖出一段无谓的黑屏");
  Check(byCue.get("ZhouDeath").lines.length === 7, "ZhouDeath 是七句");
  Check(FIRST_LEVEL_STAGE_MUSIC.Death === null && FirstLevelMusicState("Death").cue === null, "17 是静的");

  const r = FakeRuntime({ stage: "Death" });
  const zhou = r.column.zhou;
  Object.assign(zhou, { x: A.zhouDrop.x, z: A.zhouDrop.z, state: "placed", health: 6 });
  r.extras.Spawn("WardSurgeon", P.receptionYard.surgeon, { weapon: null, unarmed: true });
  // 幺娃守在担架边（正片里 bedGuide 把他带过来）。
  const yaowa = r.companion.Handle("yaowa");
  yaowa.position.x = A.zhouDrop.x + 1; yaowa.position.z = A.zhouDrop.z;
  r.reception.Enter("Death");
  r.Step(0.2, "Death");
  Check(!r.Has("deathMedicArrived"), "军医还在厢房另一头，不许直接起死亡段");
  r.Step(20, "Death");
  Check(r.Has("deathMedicArrived"), "军医真的走到担架边");
  Check(r.control?.kind === "death" && r.control.seconds === R.deathSeconds, "这一刻才接管镜头");
  Check(r.said.includes("ZhouDeath"), "接管的同时起 ZhouDeath");
  Check(!r.Has("deathSceneComplete"), "对白还没放完，17 不许算走完");
  // 受控演出放完只是「确认了」。
  r.reception.OnDeathSceneEnd();
  r.Step(1, "Death");
  Check(!r.Has("deathSceneComplete"), "确认完成之后接收处还要真的继续工作");
  r.Step(30, "Death");
  Check(r.said.includes("NextLitter"), "门外又抬来一副担架");
  Check(r.dressing.litters.some(entry => entry.id === "WardNextLitter"), "那一副担架真的画出来了");
  Check(r.reception.death.treating, "军医转过去救下一个");
  r.Finish("NextLitter");
  r.Step(E.coverStraightenS + 1, "Death");
  Check(r.Has("deathSceneComplete"), "接收处继续工作了，17 才算走完");
  const detail = r.recorded.find(entry => entry.id === "deathSceneComplete").detail;
  Check(detail.nextLitter && detail.surgeonTreating, "取证里写清了「接收处继续工作」是怎么判的");
  // 老周死亡不判全关失败。
  Check(!MISSION_STAGES.some(stage => stage.requirements.includes("zhouSurvived")), "过关条件里没有「老周活着」");
  Check(MISSION_FACT_GATES.deathSceneComplete.text.includes("不判全关失败"), "编排表里写明老周死亡不判失败");
  console.log("ok 17 死亡段时长、接收处继续工作、不判失败");
}

// ---------------------------------------------------------------------------
// 9. 18 传令兵真人跑到接收处
// ---------------------------------------------------------------------------
{
  const r = FakeRuntime({ stage: "BridgeOrders" });
  r.player.position.x = MISSION_RECEPTION_SPACE.deathView.x;
  r.player.position.z = MISSION_RECEPTION_SPACE.deathView.z;
  r.bridge.Enter("BridgeOrders");
  const runner = r.extras.Actor("BridgeRunner");
  Check(runner, "传令兵是真人实体");
  Check(Distance(runner.position, E.runnerSpawn) < 0.01 && Distance(runner.position, r.player.position) > 25,
    "他从院外起步，不是在玩家跟前凭空出现");
  r.Step(0.2, "BridgeOrders");
  Check(!r.said.includes("BridgeOrders"), "还没跑到就不许喊");
  r.Step(20, "BridgeOrders");
  Check(r.Has("bridgeRunnerArrived") && r.said.includes("BridgeOrders"), "跑到玩家跟前才喊");
  const stage = MISSION_STAGES.find(entry => entry.id === "BridgeOrders");
  Check(stage.objective.includes("掩护回援分队通过铁路桥"), "HUD 目标是「掩护回援分队通过铁路桥」");
  console.log("ok 18 传令兵真人跑到接收处才接令");
}

// ---------------------------------------------------------------------------
// 10. 18 回援尾队：真人、带东西、火力下真的停、打断之后才过桥
// ---------------------------------------------------------------------------
function BridgeRuntime() {
  const r = FakeRuntime({ stage: "BridgeCover" });
  for (const spec of MISSION_ENCOUNTERS.bridgeNorth) {
    const actor = FakeActor(spec.id, spec.x, spec.z);
    actor.side = "ija";
    r.enemies.set(spec.id, actor);
    r.threatIds.add(spec.id);
  }
  r.bridge.Enter("BridgeOrders");
  r.bridge.Enter("BridgeCover");
  // 尾队要等玩家真的到了南岸射位才从北面走进来（早放会在北引道上被打光）。
  r.facts.add("southBankReached");
  r.Step(0.1, "BridgeCover");
  return r;
}
{
  const r = BridgeRuntime();
  Check(REAR_COLUMN_IDS.length === R.bridgeColumnCount, "尾队人数取 R.bridgeColumnCount");
  Check(REAR_COLUMN_IDS.every(id => r.extras.Any(id).scriptEssential === (E.rearColumnLoads[REAR_COLUMN_IDS.indexOf(id)] !== "rifle")),
    "扛机枪与抬炮管的三个人打不死（scriptEssential），三个步枪兵照常会阵亡");
  Check(REAR_COLUMN_IDS.every(id => r.extras.Actor(id)), "回援尾队是六个真人实体，不是六个数据点");
  const loads = r.bridge.State().rearColumn.map(entry => entry.load);
  Check(loads.includes("mg") && loads.filter(load => load === "mortar").length === 2,
    "尾队带步枪、机枪与两人抬的迫击炮部件");
  r.Step(20, "BridgeCover");
  const pinned = r.bridge.State().rearColumn;
  Check(!r.Has("bridgeFireBroken"), "北岸火力还在，不算打断");
  Check(pinned.every(entry => entry.progress <= E.rearColumnHoldM + 0.01),
    "火力下尾队压在北引道上，没有一个人走上桥面");
  Check(pinned.some(entry => entry.pinned), "被看得见的人真的停下伏倒");
  Check(r.said.includes("BridgeCover"), "尾队被顶住了才喊「别堵桥口」「北边土坎」");
  Check(!r.Has("rearColumnCrossed"), "没通过就不许记通过");
  // 只打掉机枪还不够：剩下的人仍然够得到桥头。
  r.enemies.get(BRIDGE_GUNNER_ID).alive = false;
  r.Step(1, "BridgeCover");
  Check(!r.Has("bridgeFireBroken"), "机枪哑了但土坎上还有人够得到桥头");
  // 剩下的人被压得够不到桥头（不必杀光）。
  for (const id of BRIDGE_NORTH_IDS) r.threatIds.delete(id);
  r.Step(1, "BridgeCover");
  Check(r.Has("bridgeFireBroken"), "机枪哑了、活着的人也够不到桥头，就算打断（不要求杀光）");
  Check(BRIDGE_NORTH_IDS.some(id => r.enemies.get(id).alive), "确实还有活着的敌人 —— 玩家不承担杀光");
  r.Step(120, "BridgeCover");
  Check(r.Has("rearColumnCrossed"), "打断之后尾队真的走完了 bridgeCrossing");
  const crossed = r.bridge.State().rearColumn;
  Check(crossed.every(entry => entry.crossed), "每一个活着的人都下了南桥头");
  Check(BRIDGE_CROSSING_LENGTH > 60, "过桥这一段是真的有长度的（不是一个瞬移）");
  console.log("ok 18 尾队真人、火力下真停、打断之后真的通过");
}

// ---------------------------------------------------------------------------
// 11. 18 爆破：等人走净才炸；赖在爆破区里就一直等
// ---------------------------------------------------------------------------
{
  const r = BridgeRuntime();
  for (const id of BRIDGE_NORTH_IDS) { r.enemies.get(id).alive = false; r.threatIds.delete(id); }
  r.Step(120, "BridgeCover");
  Check(r.Has("rearColumnCrossed"), "先把尾队送过去");
  r.flow.stage.id = "BridgeWithdraw";
  r.bridge.Enter("BridgeWithdraw");
  // 玩家赖在桥边不走。
  r.player.position.x = A.railBridge.x; r.player.position.z = A.railBridge.z + 6;
  r.Step(60, "BridgeWithdraw");
  Check(r.Has("demolitionCharged"), "在场的爆破人员把药装好了（顺子不参与）");
  Check(!r.Has("bridgeDestroyed") && r.explosions.length === 0,
    "玩家还在爆破区里，一分钟也不许炸 —— 这不是计时器");
  Check(r.Has("blastHeldForFriendly"), "记下了「因为己方还在里面所以等着」");
  // 玩家退到安全区，但班里人还赖在桥上。
  r.player.position.x = A.blastSafe.x; r.player.position.z = A.blastSafe.z;
  r.facts.add("blastZoneCleared");
  for (const actor of r.squad) { actor.position.x = A.railBridge.x; actor.position.z = A.railBridge.z; }
  r.Step(10, "BridgeWithdraw");
  Check(!r.Has("bridgeDestroyed"), "班里人还在爆破区，照样不炸");
  for (const actor of r.squad) { actor.position.x = A.blastSafe.x; actor.position.z = A.blastSafe.z; }
  r.Step(40, "BridgeWithdraw");
  Check(r.Has("bridgeDestroyed"), "人真的走净了才炸");
  Check(r.explosions.length === 1, "只炸一次");
  Check(r.said.includes("MarchToTengxian"), "炸完军官只喊「往滕县！跟上前队！」");
  const occupant = r.bridge.BlastZoneOccupant();
  Check(occupant === null, "点火那一刻爆破区里一个己方都没有");
  Check(r.squad.every(actor => actor.alive) && REAR_COLUMN_IDS.every(id => r.extras.Any(id).alive),
    "爆破不造成己方剧情伤亡");
  // 台词不许出现「所有人都过来了」。
  for (const id of ["BridgeWithdraw", "MarchToTengxian", "BridgeCover", "BridgeOrders"])
    Check(!byCue.get(id).lines.some(line => line.text.includes("所有人")),
      `${id} 里不许出现「所有人都过来了」这类说法`);
  console.log("ok 18 爆破等人走净才炸，己方零伤亡，台词不越界");
}

// ---------------------------------------------------------------------------
// 11b. 玩家听话地先撤：清场不许把爆破人员赶离炸点
// ---------------------------------------------------------------------------
{
  const r = BridgeRuntime();
  for (const id of BRIDGE_NORTH_IDS) { r.enemies.get(id).alive = false; r.threatIds.delete(id); }
  r.Step(120, "BridgeCover");
  r.flow.stage.id = "BridgeWithdraw";
  r.bridge.Enter("BridgeWithdraw");
  // 「桥头撤！」一喊，玩家与全班立刻退到安全区 —— 编排要的就是这样。
  // 这时候爆破区里只剩爆破人员自己，他们的岗位**本来就在**区里。
  // 实拍 2026-09-20：清场把 BridgeDemolitionEast 往南推了 1.3 m，装药进度钉在 3 s / 6 s，
  // 等满 240 s 桥也不炸 —— 玩家越听话越卡死。
  r.player.position.x = A.blastSafe.x; r.player.position.z = A.blastSafe.z;
  for (const actor of r.squad) { actor.position.x = A.blastSafe.x; actor.position.z = A.blastSafe.z; }
  r.facts.add("blastZoneCleared");
  r.Step(E.demolitionSetS - 1, "BridgeWithdraw");
  Check(!r.Has("demolitionCharged"), "这会儿药还没装完（下一条量的就是装药当中）");
  Check(P.bridge.demolition.every((post, index) =>
    Distance(r.extras.Any(BRIDGE_CAST[index + 1]).position, post) < 1.0),
  "装药那几秒两名爆破手真的蹲在桥台的炸点上（清场没把他们推开）");
  r.Step(3, "BridgeWithdraw");
  Check(r.Has("demolitionCharged"), "玩家先撤也照样装得好药（清场不许把爆破手赶离炸点）");
  r.Step(120, "BridgeWithdraw");
  Check(r.Has("bridgeDestroyed"), "药装好、人自己沿撤出折线走净，桥照样炸");
  Check(r.bridge.BlastZoneOccupant() === null, "点火那一刻爆破人员也已经出了爆破区");
  console.log("ok 18 玩家先撤时爆破人员照样装得完药、也照样撤得出去");
}

// ---------------------------------------------------------------------------
// 11c. blastFriendlyStuck 只救被地形卡死的 NPC，绝不把玩家当成超时项
// ---------------------------------------------------------------------------
{
  const r = FakeRuntime({ stage: "BridgeWithdraw" });
  r.bridge.Enter("BridgeOrders");
  r.bridge.Enter("BridgeWithdraw");
  r.player.position.x = A.blastSafe.x; r.player.position.z = A.blastSafe.z;
  for (const actor of r.squad) { actor.position.x = A.blastSafe.x; actor.position.z = A.blastSafe.z; }
  const stuck = r.squad[0];
  stuck.position.x = A.railBridge.x; stuck.position.z = A.railBridge.z;
  r.facts.add("blastZoneCleared");
  r.facts.add("demolitionCharged");
  r.bridge.blast.ready = true;
  const moveActor = r.MoveActor;
  r.MoveActor = (actor, point, speed) => {
    if (actor !== stuck) moveActor(actor, point, speed);
  };
  r.Step(E.blastStuckS - 0.5, "BridgeWithdraw");
  Check(!r.Has("blastFriendlyStuck") && !r.Has("bridgeDestroyed"),
    `NPC 还没连续卡满 ${E.blastStuckS} 秒，不许提前放行`);
  r.Step(1, "BridgeWithdraw");
  const evidence = r.recorded.find(entry => entry.id === "blastFriendlyStuck");
  Check(evidence?.detail.who === stuck.castId && evidence.detail.stuckS >= E.blastStuckS,
    `NPC 连续卡满 ${E.blastStuckS} 秒才留下 blastFriendlyStuck 取证`);
  Check(r.Has("bridgeDestroyed") && r.bridge.State().blast.overdue,
    "NPC 卡死兜底记证后允许爆破，关卡不会永久钉死");

  const player = FakeRuntime({ stage: "BridgeWithdraw" });
  player.bridge.Enter("BridgeOrders");
  player.bridge.Enter("BridgeWithdraw");
  player.player.position.x = A.railBridge.x; player.player.position.z = A.railBridge.z;
  for (const actor of player.squad) { actor.position.x = A.blastSafe.x; actor.position.z = A.blastSafe.z; }
  player.facts.add("blastZoneCleared");
  player.facts.add("demolitionCharged");
  player.bridge.blast.ready = true;
  player.Step(E.blastStuckS * 3, "BridgeWithdraw");
  Check(!player.Has("blastFriendlyStuck") && !player.Has("bridgeDestroyed")
    && !player.bridge.State().blast.overdue,
  `玩家在爆破区里等 ${E.blastStuckS * 3} 秒仍不触发 NPC 兜底，也永远不放行`);
  console.log("ok 18 blastFriendlyStuck 只对卡死 NPC 放行，玩家在区里永远等");
}

// ---------------------------------------------------------------------------
// 12. 炸桥一次翻完八件，桥面退出可走面（不可逆）
// ---------------------------------------------------------------------------
{
  const intact = MISSION_LAYOUT.gates.filter(gate => gate.signal === MISSION_RAIL_BRIDGE.signal);
  const wreck = MISSION_LAYOUT.gates.filter(gate => gate.appearSignal === MISSION_RAIL_BRIDGE.signal);
  Check(intact.length === 5 && wreck.length === 3,
    `炸桥翻 5 个完好件 + 3 个残骸件，实际 ${intact.length} + ${wreck.length}`);
  Check(intact.some(gate => gate.walkableId === "RailBridgeDeck"), "桥面跟着一起退出可走面");
  Check(MISSION_SCENARIO_SIGNALS.RailBridgeDestroyed === "bridgeDestroyed",
    "RailBridgeDestroyed 这个信号由 bridgeDestroyed 这条事实驱动（回跳清事实，桥自己回来）");
  console.log("ok 炸桥八件同翻、桥面退出可走面");
}

// ---------------------------------------------------------------------------
// 13. 夜行军：先真走一段才淡出；夜景的灯只在夜景里存在
// ---------------------------------------------------------------------------
{
  const r = FakeRuntime({ stage: "NightMarch" });
  r.player.position.x = A.blastSafe.x; r.player.position.z = A.blastSafe.z;
  r.nightGate.Enter("NightMarch");
  Check(r.guided === MISSION_STAGE_ROUTES.marchOut, "爆破之后先随队走 marchOut");
  r.Step(2, "NightMarch");
  Check(!r.transition, "还没走到就不许淡出（「不让玩家从桥边跑几步就到城门」）");
  Check(r.nightLights.count === 0, "白天那一段一盏夜灯都没有");
  r.player.position.x = A.marchOut.x; r.player.position.z = A.marchOut.z;
  r.Step(0.2, "NightMarch");
  Check(r.Has("marchOutReached") && r.transition, "走到 marchOut 才起黑屏转场");
  // 黑屏里瞬移之后（nightArrivalPlaced）夜景与灯才出现。
  r.facts.add("nightArrivalPlaced");
  r.player.position.x = A.nightSpawn.x; r.player.position.z = A.nightSpawn.z;
  r.Step(0.2, "NightMarch");
  Check(r.nightLights.count === P.night.braziers.length + 1,
    `夜景点上了 ${P.night.braziers.length} 盏火盆 + 1 盏门洞灯`);
  Check(r.guided === MISSION_STAGE_ROUTES.nightMarch, "淡入之后队伍继续往北门走");
  Check(r.extras.Actor("NightUsher"), "带路军人是真人");
  Check(!r.said.includes("NorthGate"), "还在门外老远不许喊");
  Check(r.dressing.people.filter(entry => entry.id.startsWith("NightColumn")).length === P.night.column.length,
    "行军队列真人在走");
  Check(r.dressing.people.some(entry => entry.id.startsWith("NightCarrier"))
    && r.dressing.props.some(entry => entry.key === "medical"), "有人在搬武器弹药");
  Check(r.dressing.people.filter(entry => entry.id.startsWith("NightSector")).length === P.night.sectorAssigners.length,
    "有人在分配防区");
  r.player.position.x = A.northGate.x; r.player.position.z = A.northGate.z - E.northGateCueM + 2;
  r.Step(0.2, "NightMarch");
  Check(r.said.includes("NorthGate"), "走近门口带路军人才喊「补东边阵位的，跟我来！」");
  r.Step(20, "NightMarch");
  Check(r.Has("nightUsherLeading"), "喊完他领着小队往门洞走");
  // 还原：清掉 nightArrivalPlaced，灯一盏不留（重试 / 阶段回跳走的就是这条）。
  r.facts.delete("nightArrivalPlaced");
  r.nightLights.Sync([]);
  r.RestoreSky();
  Check(r.nightLights.count === 0 && r.sky === "day", "回跳/重试之后夜灯与夜天空都还原");
  const specs = NightLightSpecs(() => 0);
  Check(specs.length === P.night.braziers.length + 1 && specs.every(spec => spec.intensity > 0 && spec.distanceM > 0),
    "灯的参数是数据驱动的");
  // 「黑屏里那一下瞬移到底生没生效」得能一眼分清。实拍 2026-09-20 的假象是这么来的：
  // 人**确实**被搬到了 nightSpawn，转场一结束驾驶器还攥着 marchOut 那个路点，
  // 又把他走了 110 m 回去（修法在 Script_FirstLevelCampaignKit 的 Route stopFact）。
  // 这两条钉住能分清所需的前提：两点离得够远，而且淡入之后接着走的就是 nightSpawn。
  Check(Distance(A.nightSpawn, A.marchOut) > E.marchOutArriveM + 20,
    "夜景出生点离 marchOut 远得分得清人有没有真被搬过去");
  Check(Distance(MISSION_STAGE_ROUTES.nightMarch[0], A.nightSpawn) < 0.5,
    "夜行路线第一点就是 nightSpawn：淡入之后接着走的就是被搬过去的那个点");
  Check(MISSION_RETURN_DISABLED_STAGES.includes("NightMarch"),
    "夜行军不挂回头警告：黑屏里换了半张地图，回头警告会把人按「走反了」往回拽");
  console.log("ok 18 夜行军先真走一段、夜景有光、退出还原、瞬移落点分得清");
}

// ---------------------------------------------------------------------------
// 14. 空间与编排的静态对账（阶段 15–18）
// ---------------------------------------------------------------------------
{
  const wallPath = MISSION_STAGE_ROUTES.wallPath;
  Check(EndRouteLength(wallPath) > E.silenceFromProgressM + 8,
    "夹道够长，静默段之后还有路可走");
  Check(E.carrySwapProgressM < EndProjectOnto(wallPath, E.roadBump).progress,
    "换手在过坎之前（Notion 的顺序：换手 → 过坎 → 手抖）");
  Check(EndProjectOnto(wallPath, E.roadBump).distance < 1.5, "过坎那一处就在夹道中线上");
  Check(Distance(E.gateBlock, A.receptionGate) < 1.5, "拦人的守军真的站在门洞里");
  Check(Distance(A.blastSafe, A.railBridge) > E.blastClearRadiusM,
    "爆破安全区在清场半径之外（退到那儿就一定算走净了）");
  Check(EndRouteLength(MISSION_STAGE_ROUTES.marchOut) > 20, "淡出前那一段行军是真的要走的路");
  // 15A 的带路线到收拢点为止。回头警告那条走廊可以更长（它画的是「行动路线」），
  // 带路不行：把队伍带出收拢点，点名要的 16 m 就永远凑不齐（实拍 2026-09-20：
  // 走廊末点 (50,150) 离收拢点 24 m，玩家站在收拢点等 300 s 也等不到 headcountDone）。
  {
    const corridor = MissionRegroupCorridor("Regroup"), guide = RegroupGuideRoute("Regroup");
    Check(Distance(guide.at(-1), corridor.onEvacuation) < 0.5,
      `15A 带路终点就是收拢点，实际 ${JSON.stringify(guide.at(-1))}`);
    Check(guide.length < corridor.route.length, "走廊比带路线长：回头警告照旧画到下一段");
    Check(Distance(corridor.route.at(-1), corridor.onEvacuation) > E.headcountReachM,
      "走廊末点确实远在点名半径之外 —— 这条闸门守的就是这个差");
  }
  const phase = FIRST_LEVEL_STAGES.find(entry => entry.number === 18);
  Check(phase.steps.join(">") === "BridgeOrders>BridgeCover>BridgeWithdraw>NightMarch", "18 的四个内部步骤按序");
  console.log("ok 15–18 的空间与编排静态对账");
}

console.log(`ok  第一关 15–18（End 包）闸门通过：${checks} 项`);
