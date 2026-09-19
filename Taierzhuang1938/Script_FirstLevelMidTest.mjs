// ===========================================================================
// Script_FirstLevelMidTest.mjs —— 第一关公开阶段 8–14 的纯 Node 闸门（第二波 Mid 包）
//
// 跑法：node Taierzhuang1938/Script_FirstLevelMidTest.mjs
//
// 单独一份而不是并进 Script_FirstLevelMissionTest：第二波三个玩法包并行，
// 挤在同一个文件里必冲突（契约 §8）。这里只看 08–14：
//   1. 担架真的停进遮挡，而且不跟进未清空间；
//   2. 近战先手打掉不触发僵持，真贴上才走共用白刃；
//   3. 内院放行按真实队列计数，队尾掩护脱离才算过；
//   4. 两处威胁与装载额度联动（威胁没解除就一个都装不上）；
//   5. 上车 / 停车 / 卸人的时序（卸人有过程，不是一帧）；
//   6. 空袭打的是道路与车列，顺子坐的那一辆不会被掀翻；
//   7. 扑沟与救人：进沟内遮挡、队伍离开主车道。
// ===========================================================================
import assert from "node:assert/strict";
import { MISSION_STAGES, MISSION_ENCOUNTERS, MISSION_TRANSFER_THREATS } from "./Data_FirstLevelMission.mjs";
import { MISSION_ANCHORS as A, MISSION_PLACEMENT as P, MISSION_ROUTES } from "./Data_FirstLevelMissionLayout.mjs";
import { MISSION_FACT_GATES, MISSION_ENCOUNTER_ACTIVATION } from "./Data_FirstLevelMissionGates.mjs";
import { MISSION_TUNING as R } from "./Data_Tuning_FirstLevel.mjs";
import { MID_TUNING as M, MidLitterHoldSlots, MidDraftKind } from "./Data_Tuning_FirstLevelMid.mjs";
import { FirstLevelMissionFlow } from "./Script_FirstLevelMissionFlow.mjs";
import {
  FirstLevelMissionColumn, MissionRouteProjection, MissionCarryRoutePoint,
} from "./Script_FirstLevelMissionColumn.mjs";
import {
  FirstLevelVillageBlock, VillageHoldCovered, VillageCourtyardCleared, VillagePendingLitters, VILLAGE_BYSTANDERS,
} from "./Script_FirstLevelVillageBlock.mjs";
import {
  FirstLevelTransferCart, TransferBatchPlan, CartSeatPoint, FacingPoint,
} from "./Script_FirstLevelTransferCart.mjs";

let checks = 0;
const Check = (ok, why) => { assert.ok(ok, why); checks += 1; };
const Distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const StageIndex = (id) => MISSION_STAGES.findIndex((stage) => stage.id === id);

/**
 * 一个够用的假宿主。事实走真的 FirstLevelMissionFlow，担架队走真的
 * FirstLevelMissionColumn —— 这两样是这一段的被测对象，不许假。
 */
function MakeHost(stageId, { sight = () => false } = {}) {
  const flow = new FirstLevelMissionFlow();
  flow.index = StageIndex(stageId);
  flow.started = true;
  const said = [], moved = new Map();
  const cast = new Map(["luo", "yaowa", "heyoutian", "liuwencai"].map((id, i) => [id, {
    // 开局摆在主街这一头（还没进灶屋、也还没到外头的观察位）。
    id: 100 + i, castId: id, alive: true, position: { x: 56 + i, z: -27 }, yaw: 0, goal: { set() {} },
  }]));
  const host = {
    flow, time: 0, delta: 1 / 60, said, moved,
    column: new FirstLevelMissionColumn(),
    enemies: new Map(),
    squadRoutes: new Map(),
    squad: [...cast.values()],
    player: {
      position: { x: 58, y: 0, z: -12, set(x, y, z) { this.x = x; this.y = y; this.z = z; } },
      yaw: 0, velocity: { set() {} }, body: null,
    },
    controls: null,
    meleeCombat: { Active: false },
    transferBeats: null,
    companion: { Handle: (id) => cast.get(id) || null },
    ai: {
      time: 0,
      Spawn: (side, x, z) => ({ side, alive: true, position: { x, z }, yaw: 0, goal: { set() {} } }),
      SetStance() {}, ReleaseCover() {},
    },
    battlefield: { GroundHeight: () => 0 },
    Point: (point, rise = 0) => ({ x: point.x, y: rise, z: point.z }),
    BlocksSight: (from, to) => sight(from, to),
    Record: (id, detail) => flow.Record(id, detail),
    Has: (id) => flow.Has(id),
    Say: (id) => { if (!said.includes(id)) said.push(id); },
    Defend() {},
    MoveActor: (actor, point, speed) => { moved.set(actor.castId || actor.id, { ...point, speed }); },
    Control() {},
  };
  host.column.Activate();
  return host;
}

/** 把担架队搬到村口（08 之前它们已经沿后送线走到这里了）。 */
function PlaceColumnAtVillage(column) {
  const at = MissionRouteProjection(column.route, { x: 58, z: -20 }).progress;
  for (const [i, litter] of column.litters.entries()) {
    litter.progress = Math.max(0, at - i * R.litterSpacingM);
    Object.assign(litter, MissionCarryRoutePoint(column.route, litter.progress));
  }
  for (const [i, walker] of column.walkers.entries()) {
    walker.progress = Math.max(0, at - 2 - i * R.walkerSpacingM);
    Object.assign(walker, MissionCarryRoutePoint(column.route, walker.progress));
  }
}

const Step = (host, module, seconds, options = {}) => {
  for (let i = 0; i < Math.round(seconds * 60); i++) {
    host.time += 1 / 60;
    host.column.Update(1 / 60, { moving: true, ...options });
    module.Update(1 / 60);
  }
};

// ---------------------------------------------------------------------------
// 08 主街受阻
// ---------------------------------------------------------------------------
{
  // 街那一头真的有人：前队两个 + 退回守军两个，位置来自空间包。
  Check(VILLAGE_BYSTANDERS.length === 4, "主街障碍北侧站着前队两个与退回守军两个");
  Check(VILLAGE_BYSTANDERS.every((spec) => Number.isFinite(spec.x) && Number.isFinite(spec.z)),
    "每个人都有空间包给的真实坐标");

  // 遮挡判定是两条射线都要断：只断一条不算。
  let blocked = new Set();
  const sight = (from) => blocked.has(Math.round(from.x));
  const cover = (point) => VillageHoldCovered(point, (from, to) => sight(from, to), (p, rise) => ({ ...p, y: rise }));
  blocked = new Set([Math.round(P.streetBlock.windowShooter.x)]);
  Check(!cover({ x: 66, z: -20 }), "只挡住窗口那一条射线不算停进遮挡");
  blocked = new Set([Math.round(P.streetBlock.windowShooter.x), Math.round(P.streetBlock.gap.x)]);
  Check(cover({ x: 66, z: -20 }), "窗口与主街缺口两条射线都断了才算");
}
{
  // 担架真的走到车位上、停下来，而且不跟着玩家进未清空间。
  const host = MakeHost("Village", { sight: (from, to) => to.x > 60 });
  PlaceColumnAtVillage(host.column);
  const village = new FirstLevelVillageBlock(host);
  village.Enter("Village");
  host.Record("streetBlockSeen");
  const before = host.column.litters.map((litter) => litter.progress);
  Step(host, village, 30);
  const living = host.column.litters.filter((litter) => litter.health > 0);
  const slots = MidLitterHoldSlots(P.streetBlock.litterWait, living.length);
  Check(living.every((litter) => litter.held), "每一副活着的担架都真的停到了车位上");
  Check(living.every((litter) => slots.some((slot) => Distance(litter, slot) <= M.litterHoldArrivalM)),
    "停的位置就是空间包 litterWait 派生出来的那几个点");
  Check(host.column.litters.every((litter, i) => litter.progress <= before[i] + 0.001),
    "停着的担架不再沿后送线往前挪 —— 不跟进未清空间");
  Check(host.Has("littersInCover"), "两条射线都被 LitterHoldCover 切断，littersInCover 才落下");

  // 没有遮挡就不许记：这条门量的是遮挡，不是「离 litterHold 多少米」。
  const open = MakeHost("Village", { sight: () => false });
  PlaceColumnAtVillage(open.column);
  const openVillage = new FirstLevelVillageBlock(open);
  openVillage.Enter("Village");
  open.Record("streetBlockSeen");
  Step(open, openVillage, 30);
  Check(open.column.litters.filter((l) => l.health > 0).every((litter) => litter.held),
    "露天那一趟担架同样停到了位（区别只在遮挡）");
  Check(!open.Has("littersInCover"), "停到位但射线没断，不算停进可靠遮挡");
}
{
  // 班长真的走到相邻房屋查看过，才喊「担架靠墙！…从右手灶屋穿！」
  const host = MakeHost("Village", { sight: (from, to) => to.x > 60 });
  PlaceColumnAtVillage(host.column);
  const village = new FirstLevelVillageBlock(host);
  village.Enter("Village");
  host.Record("streetBlockSeen");
  village.Update(1 / 60);
  Check(!host.said.includes("KitchenDetour"), "班长还没走到相邻房屋，KitchenDetour 不许提前喊");
  const luo = host.companion.Handle("luo");
  luo.position = { ...P.ambushSquadPosts[2] };
  village.Update(1 / 60);
  Check(host.Has("houseChecked") && host.said.includes("KitchenDetour"),
    "走到了才记 houseChecked 并喊 KitchenDetour");
  const he = host.companion.Handle("heyoutian");
  Check(host.squadRoutes.get(he.id)?.length === 1, "何有田被指到外头的观察位，不跟着进屋");
  he.position = { ...host.squadRoutes.get(he.id)[0] };
  village.Update(1 / 60);
  Check(host.Has("outsideWatched"), "他真的到位了才记 outsideWatched");
}

// ---------------------------------------------------------------------------
// 09 灶屋—连屋近战
// ---------------------------------------------------------------------------
{
  const MakeMelee = () => {
    const host = MakeHost("Melee", { sight: () => false });
    for (const spec of MISSION_ENCOUNTERS.melee)
      host.enemies.set(spec.id, {
        alive: true, missionDormant: true, scriptedNoncombatant: true,
        missionEncounter: "melee", position: { x: spec.x, z: spec.z },
      });
    host.enemies.set("VillageGunner", { alive: true, missionEncounter: "village", position: { x: 43, z: 8 } });
    return { host, village: new FirstLevelVillageBlock(host) };
  };
  const wake = MISSION_ENCOUNTER_ACTIVATION.melee.wake;
  Check(wake.fact === "kitchenEntered", "激活表写明连屋那一组由「玩家进了灶屋」放出");

  // 没进灶屋不许出来。
  const early = MakeMelee();
  early.host.player.position = { ...A.melee };
  early.village.Update(1 / 60);
  Check(!early.host.Has("meleeBreachStarted"), "玩家还没进灶屋，连屋那一组不出来");

  // 进了灶屋、走到连屋附近才破门；「右手！」压在破门之后。
  const live = MakeMelee();
  live.host.Record("kitchenEntered");
  live.host.player.position = { x: A.melee.x, z: A.melee.z - wake.radiusM - 1 };
  live.village.Update(1 / 60);
  Check(!live.host.Has("meleeBreachStarted"), "离得太远也不出来（激活表的半径说了算）");
  live.host.player.position = { ...A.melee };
  live.village.Update(1 / 60);
  Check(live.host.Has("meleeBreachStarted"), "进了灶屋、走到连屋附近，他们才从东巷那扇门进来");
  Check([...live.host.enemies.values()].filter((a) => a.missionEncounter === "melee")
    .every((a) => !a.missionDormant && !a.scriptedNoncombatant), "破门之后这一组真的活过来了");
  Check(!live.host.said.includes("MeleeRight"), "破门当帧还压着「右手！」（meleeBreachHoldS）");
  live.host.time += M.meleeBreachHoldS + 0.1;
  live.village.Update(1 / 60);
  Check(live.host.said.includes("MeleeRight"), "压过那一下就喊「右手！」");

  // 先手打掉：不贴身就没有僵持，也没有那句骂。
  for (const spec of MISSION_ENCOUNTERS.melee) live.host.enemies.get(spec.id).alive = false;
  live.village.Update(1 / 60);
  Check(!live.host.said.includes("MeleeCurse"), "提前击败近战敌人不触发固定僵持，也就没有 MeleeCurse");
  Check(!live.host.Has("meleeEngaged"), "没有人贴上来，meleeEngaged 不落");

  // 真贴上：走共用白刃僵持（Script_MeleeCombat 的 Active），那句才出来。
  const bound = MakeMelee();
  bound.host.Record("kitchenEntered");
  bound.host.player.position = { ...A.melee };
  bound.village.Update(1 / 60);
  bound.host.enemies.get("MeleeLead").position = { ...bound.host.player.position };
  bound.village.Update(1 / 60);
  Check(bound.host.said.includes("MeleeCurse"), "敌人真贴上玩家才喊 MeleeCurse");

  // 近战结束，窗口火力仍封锁院口 → WindowOrder。
  const after = MakeMelee();
  after.host.Record("kitchenEntered");
  after.host.player.position = { ...A.melee };
  after.village.Update(1 / 60);
  for (const spec of MISSION_ENCOUNTERS.melee) after.host.enemies.get(spec.id).alive = false;
  after.host.Record("meleeResolved");
  after.village.Update(1 / 60);
  Check(after.host.Has("windowFireHolding") && after.host.said.includes("WindowOrder"),
    "近战结束、窗口那挺机枪还封着院口，才喊 WindowOrder");
  const silent = MakeMelee();
  silent.host.Record("kitchenEntered");
  silent.host.Record("meleeResolved");
  silent.host.enemies.get("VillageGunner").alive = false;
  silent.host.player.position = { ...A.melee };
  silent.village.Update(1 / 60);
  Check(!silent.host.said.includes("WindowOrder"), "窗口已经哑了就不喊那句分工");
}

// ---------------------------------------------------------------------------
// 10 打开内院，放行担架
// ---------------------------------------------------------------------------
{
  const host = MakeHost("Village", { sight: (from, to) => to.x > 60 });
  PlaceColumnAtVillage(host.column);
  const village = new FirstLevelVillageBlock(host);
  village.Enter("Village");
  host.Record("streetBlockSeen");
  Step(host, village, 20);
  Check(host.column.Holding(), "08 停着的时候 column 认账");

  host.flow.index = StageIndex("Courtyard");
  host.column.gateOpen = true;
  host.Record("courtyardGateOpen");
  village.Update(1 / 60);
  Check(!host.column.Holding(), "开了院门就放行，停车位作废");
  Check(host.column.litters.filter((l) => l.health > 0).every((litter) => litter.joinRoute?.length),
    "每个人是从自己停的地方接回后送线的（joinRoute），不是横着瞬移回路线上");

  Step(host, village, 200);
  const living = host.column.litters.filter((litter) => litter.health > 0);
  Check(living.every((litter) => litter.passedGate), "担架真的穿过院子、过了院门");
  Check(!host.Has("courtyardPassed"), "队尾掩护还没脱离，不算过");
  Check(VillagePendingLitters(host.column).length === 0, "队列计数用的是真实担架数");
  const tail = host.companion.Handle("liuwencai");
  tail.position = { x: A.gate.x, z: A.gate.z + M.rearCoverClearM + 1 };
  village.Update(1 / 60);
  Check(host.Has("rearCoverDisengaged"), "队尾走过院门以南才算脱离");
  Check(VillageCourtyardCleared(host.column, true), "通过条件 = 活着的担架全过 + 队尾脱离");
}

// ---------------------------------------------------------------------------
// 11 抵达桥头接运点
// ---------------------------------------------------------------------------
{
  // 四类人流：牛车、马车、人力担架、能走的伤员。
  const column = new FirstLevelMissionColumn();
  const kinds = new Set(column.vehicles.map((cart) => cart.draft));
  Check(kinds.has("ox") && kinds.has("horse"), "车位上牛车与马车两种都有（白盒变体）");
  Check(column.vehicles.filter((cart) => cart.draft === "ox").length === M.oxBayIndices.length,
    "牛车数量按 Data_Tuning_FirstLevelMid.oxBayIndices");
  Check(MidDraftKind("bay", M.oxBayIndices[0]) === "ox" && MidDraftKind("bay", 1) === "horse",
    "下标不在表里的一律是马");
  Check(column.litters.length > 0, "人力担架就是后送队本身");

  const host = MakeHost("TransferApproach");
  const transfer = new FirstLevelTransferCart(host);
  transfer.Enter("TransferApproach");
  Check(host.column.transferWalkers.length === M.walkingWoundedCount,
    "接运点现场摆出了能自行/互相搀扶行走的伤员");
  Check(host.column.transferWalkers.some((w) => w.supporting) && host.column.transferWalkers.some((w) => !w.supporting),
    "他们是成对的：一个搀、一个被搀");

  // 辨认三样东西：朝向 / 到位门，不是计时器。
  host.player.position = { ...A.transfer };
  host.player.yaw = Math.atan2(A.transfer.x - M.villageRoadMouth.x, A.transfer.z - M.villageRoadMouth.z);
  Check(FacingPoint(host.player, M.villageRoadMouth, { near: A.transfer, rangeM: M.identifyRangeM }),
    "对着村路来路就算辨认了村路");
  host.player.yaw += Math.PI;
  Check(!FacingPoint(host.player, M.villageRoadMouth, { near: A.transfer, rangeM: M.identifyRangeM }),
    "背对着就不算");

  host.Record("transferApproachReached");
  transfer.Update(1 / 60);
  Check(host.said.includes("TransferSorting"), "到了接运点，接运兵先喊分流");
  Check(!host.said.includes("VillageRoadThreat"), "三样还没辨认齐，不喊「后头追出来了」");
  host.Record("transferSorted"); host.Record("bridgeHeadSeen"); host.Record("villageRoadWatched");
  transfer.Update(1 / 60);
  Check(host.said.includes("VillageRoadThreat"), "辨认齐了接运区、村路与桥头，才喊村路威胁");

  // 走到车位那一排以南也算看见了桥头路（到位门）。
  const south = MakeHost("TransferApproach");
  const southTransfer = new FirstLevelTransferCart(south);
  southTransfer.Enter("TransferApproach");
  south.Record("transferApproachReached");
  south.player.position = { x: 76, z: M.bridgeHeadSouthZ + 1 };
  southTransfer.Update(1 / 60);
  Check(south.Has("bridgeHeadSeen"), "人已经走到桥头路那一段，不必再对准");
}

// ---------------------------------------------------------------------------
// 12 掩护装载与离开
// ---------------------------------------------------------------------------
{
  // 威胁与装载额度联动。
  const plan0 = TransferBatchPlan(0), plan1 = TransferBatchPlan(1), plan2 = TransferBatchPlan(2);
  Check(plan0.every((beat) => beat.allowance === 0), "一处都没解除时装载额度是 0");
  Check(plan1[0].allowance === M.loadAllowancePerThreat, "解除第一处放开一批");
  Check(plan2.length === MISSION_TRANSFER_THREATS.length, "只有两处威胁，不是四拍守波次");

  const host = MakeHost("Transfer");
  const transfer = new FirstLevelTransferCart(host);
  host.transferBeats = { index: 0, previousClearedAt: 0, started: ["transfer"], cleared: [] };
  Check(transfer.LoadAllowance() === 0, "威胁还在，额度是 0");
  host.transferBeats.cleared.push("transfer");
  Check(transfer.LoadAllowance() === M.loadAllowancePerThreat, "解除一处放开一批");
  host.transferBeats.cleared.push("transferAlley");
  Check(transfer.LoadAllowance() === Infinity, "两处都解除之后接运继续，不再设额度");
}
{
  // 真的装不上：额度 0 的时候，队列准备好了也一个都上不了车。
  const Ready = (allowance) => {
    const column = new FirstLevelMissionColumn();
    column.Activate();
    column.loading = true;
    column.loadAllowance = allowance;
    for (const litter of column.litters) {
      litter.passedGate = true;
      // 已经在内院与装载区两个集结区歇过了（真实流程里 08–11 走过）。
      litter.stagedAreas = ["courtyard", "transfer"];
      litter.progress = column.length;
      Object.assign(litter, MissionCarryRoutePoint(column.route, column.length));
    }
    for (const walker of column.walkers) walker.stagedAreas = ["courtyard", "transfer"];
    for (let i = 0; i < 4000; i++) column.Update(1 / 60, { moving: true });
    return column;
  };
  Check(Ready(0).loadEvents.length === 0, "威胁没解除就一个伤员都装不上（装载与出发一起被压住）");
  const one = Ready(M.loadAllowancePerThreat);
  Check(one.loadEvents.length === M.loadAllowancePerThreat, "解除一处就真的装走这一批，不多不少");
  Check(one.departed >= 1, "这一批真的装完离开了装载位置");
  Check(Ready(Infinity).loadEvents.length > M.loadAllowancePerThreat, "两处都解除后接运继续");
}
{
  // 何有田真的走过来接住射位，才轮到 EscortZhou。
  const host = MakeHost("Transfer");
  const transfer = new FirstLevelTransferCart(host);
  transfer.Enter("Transfer");
  host.transferBeats = { index: 2, previousClearedAt: 0, started: ["transfer", "transferAlley"], cleared: ["transfer", "transferAlley"] };
  host.Record("alleyThreatResolved");
  for (const litter of host.column.litters) if (!litter.zhou) { litter.loaded = true; }
  const he = host.companion.Handle("heyoutian");
  he.position = { x: A.transfer.x + 20, z: A.transfer.z };
  transfer.Update(1 / 60);
  Check(!host.said.includes("EscortZhou"), "何有田还在半路，不许先放顺子走");
  he.position = { ...A.transfer };
  transfer.Update(1 / 60);
  Check(host.Has("escortRelieved") && host.said.includes("EscortZhou"),
    "他接住射位了才喊「这边我看着！去搭把手！」");
  Check(host.column.zhouRideCart, "轮到老周时真的给他叫了一辆牛/马车过来");
}
{
  // 上车 → 车真的开走 → 停车还权 → 卸人有过程。
  const host = MakeHost("CartRide");
  const transfer = new FirstLevelTransferCart(host);
  const cart = host.column.ReserveBoardingCart(P.cartBays[0]);
  Check(cart, "预留了一辆车");
  cart.x = P.cartBays[0].x; cart.z = P.cartBays[0].z; cart.state = "loading";
  Check(transfer.Board(), "上车：老周被装在这辆车上，顺子坐车板");
  Check(cart.load.includes(host.column.zhou.id), "老周真的在车上（不是躺在原地看着车开）");
  host.controls = { kind: "cartRide" };
  const seat = CartSeatPoint(cart, P.cartRide.playerSeat);
  Check(Number.isFinite(seat.x) && Number.isFinite(seat.z), "座位偏移读的是 MISSION_PLACEMENT.cartRide");

  const start = { x: cart.x, z: cart.z };
  // 与运行时同一个帧序：先驱动车，再让 column 把车上的人摆到车上。
  for (let i = 0; i < 60 * 40 && !host.Has("zhouCartDeparted"); i++) {
    host.time += 1 / 60; transfer.UpdateRide(1 / 60); host.column.Update(1 / 60, { moving: false });
  }
  Check(host.Has("zhouCartDeparted"), "车沿 cartRide 真的离开了装载位置");
  Check(Distance(cart, start) >= R.cartDepartedM, "离开的距离是真量出来的");
  Check(host.said.includes("CartTalk"), "车动起来之后才说话");
  Check(Distance(host.column.zhou, cart) < 3, "老周跟着车走，不是留在原地");

  // 13：第一轮航过之后停车、还权。
  host.flow.index = StageIndex("AirFirst");
  host.Record("firstAirPassComplete");
  transfer.UpdateRide(1 / 60);
  Check(host.Has("cartHalted"), "路面受损堵塞，车停住");
  Check(host.controls === null, "停车之后控制权还给玩家");

  // 卸人有过程：搬运的人先到，再用 unloadSeconds 把担架放下来。
  Check(!host.Has("zhouUnloaded"), "刚停车不算卸完");
  // 13 的时候民夫已经跟到接运点了（这里把他们摆到车附近，别让 240 m 的路程喧宾夺主）。
  for (const walker of host.column.walkers) { walker.x = cart.x - 6; walker.z = cart.z + 2; }
  for (let i = 0; i < 60 * 20 && !host.Has("zhouUnloaded"); i++) {
    host.time += 1 / 60; transfer.UpdateUnload(1 / 60); host.column.Update(1 / 60, { moving: false });
  }
  Check(host.Has("zhouUnloaded"), "两个搬运的人到位之后，老周被卸回担架");
  Check(transfer.unload.seconds >= M.unloadSeconds, `卸人至少花了 ${M.unloadSeconds} 秒，不是一帧完成`);
  Check(host.said.includes("WestDitchOrder"), "接运兵随即指西沟");
  Check(!cart.load.includes(host.column.zhou.id), "老周已经不在车上了");
  Check(host.column.zhou.liftFraction === 0 && host.column.zhou.state === "waiting", "他回到了地面的担架上");
}

// ---------------------------------------------------------------------------
// 13 空袭打的是道路与车列
// ---------------------------------------------------------------------------
{
  const host = MakeHost("AirFirst");
  const transfer = new FirstLevelTransferCart(host);
  const cart = host.column.ReserveBoardingCart(P.cartBays[0]);
  cart.state = "loading";
  transfer.Board();
  host.column.AirDamage();
  Check(!cart.overturned, "顺子坐的那一辆不会被掀翻（它要停下来卸人）");
  Check(host.column.vehicles.some((entry) => entry.overturned), "翻车与受惊牲口仍然发生在车列里");
  Check(host.column.vehicles.find((entry) => entry.overturned).boltedTeam, "受惊的牲口真的拖着挣脱跑了");

  // 人群被迫散开：离桥头路中线让开。
  const road = M.bridgeHeadPoint.x;
  for (const litter of host.column.litters) { litter.x = road; litter.z = 120; litter.loaded = false; }
  const scattered = host.column.ScatterFromRoad(M.scatterFromRoadM);
  Check(scattered > 0, "站在路上的人被点名散开");
  for (let i = 0; i < 60 * 30; i++) host.column.Update(1 / 60, { moving: true });
  // 抬得动的都让开了路；抬架员被打倒的那几副留在原地等替补（15A 收拢那一段的事）。
  const movable = host.column.litters.filter((l) =>
    l.health > 0 && !l.evacuated && !l.loaded && !["fallen", "critical"].includes(l.state));
  Check(movable.length > 0 && movable.every((litter) => Math.abs(litter.x - road) >= M.scatterFromRoadM - 0.7),
    "抬得动的那几副真的走到了路外");
}

// ---------------------------------------------------------------------------
// 14 扑沟与救人
// ---------------------------------------------------------------------------
{
  const host = MakeHost("Rescue");
  const transfer = new FirstLevelTransferCart(host);
  // 扑沟之前老周与玩家都还压在桥头主车道上。
  host.player.position.x = M.bridgeHeadPoint.x;
  host.column.zhou.x = A.ditchMouth.x + M.ditchShelterM + 5;
  host.column.zhou.z = A.ditchMouth.z;
  transfer.Update(1 / 60);
  Check(!host.Has("ditchSheltered"), "还没到下沟口就不算进了遮挡");
  host.column.zhou.x = A.ditchMouth.x; host.column.zhou.z = A.ditchMouth.z;
  transfer.Update(1 / 60);
  Check(host.Has("ditchSheltered"), "老周进了沟内遮挡（量的是下沟口 ditchMouth）");
  Check(!host.Has("columnOffRoad"), "玩家还站在主车道上");
  host.player.position.x = M.bridgeHeadPoint.x - M.offRoadM - 1;
  transfer.Update(1 / 60);
  Check(host.Has("columnOffRoad"), "老周与玩家都离开主车道");
}

// ---------------------------------------------------------------------------
// 编排表对账：新增的内部事实都讲得出人话，且归在 08–14 的步骤上
// ---------------------------------------------------------------------------
{
  const MID_FACTS = ["houseChecked", "outsideWatched", "meleeBreachStarted", "windowFireHolding",
    "rearCoverDisengaged", "transferSorted", "bridgeHeadSeen", "villageRoadWatched",
    "transferPostsManned", "escortRelieved", "luoAtHalt", "ditchSheltered", "columnOffRoad"];
  const MID_STEPS = new Set(["Village", "Melee", "Courtyard", "TransferApproach", "Transfer",
    "CartRide", "AirFirst", "Carry", "Dive", "Rescue"]);
  for (const factId of MID_FACTS) {
    const gate = MISSION_FACT_GATES[factId];
    assert.ok(gate, `内部事实 ${factId} 没有登记进 MISSION_FACT_GATES`);
    assert.ok(MID_STEPS.has(gate.step), `${factId} 归错了步骤：${gate.step}`);
    assert.ok(gate.text, `${factId} 讲不出人话`);
  }
  checks += 1;
  // 08–14 的 requirements 一条没动（契约 §2 冻结的那张表）。
  const mid = MISSION_STAGES.filter((stage) => MID_STEPS.has(stage.id)).flatMap((stage) => stage.requirements);
  Check(mid.length === 29, `08–14 的 requirements 仍是 29 条（契约 §2 冻结的那张表），实际 ${mid.length}`);
  Check(mid.every((factId) => MISSION_FACT_GATES[factId]), "每一条 requirement 都有事实门");
  // 后送线还是那一条：10 的绕回接口点真的在路线上。
  Check(MISSION_ROUTES.village.some((point) =>
    Math.abs(point.x - M.courtyardRejoinPoint.x) < 0.1 && Math.abs(point.z - M.courtyardRejoinPoint.z) < 0.1),
  "10 的放行接口点 courtyardRejoinPoint 落在 MISSION_ROUTES.village 上");
}

console.log(`ok  第一关 08–14（Mid 包）闸门通过：${checks} 项`);
