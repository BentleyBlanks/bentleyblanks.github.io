// ===========================================================================
// Script_FirstLevelMidTest.mjs —— 第一关公开阶段 8–14 的纯 Node 闸门（第二波 Mid 包）
//
// 跑法：node Taierzhuang1938/Script_FirstLevelMidTest.mjs
//
// 单独一份而不是并进 Script_FirstLevelMissionTest：第二波三个玩法包并行，
// 挤在同一个文件里必冲突（契约 §8）。这里只看 08–14：
//   1. 担架真的停进遮挡，而且不跟进未清空间；
//   2. 09 进门遭伏击（COD5 万岁冲锋式一次性按键）：反刺 / 被捅死重来 / 先手打掉 / 追不上作罢；
//   3. 内院放行按真实队列计数，队尾掩护脱离才算过；
//   4. 两处威胁与装载额度联动（威胁没解除就一个都装不上）；
//   5. 上车 / 停车 / 卸人的时序（卸人有过程，不是一帧）；
//   6. 空袭打的是道路与车列，顺子坐的那一辆不会被掀翻；
//   7. 扑沟与救人：进沟内遮挡、队伍离开主车道。
// ===========================================================================
import assert from "node:assert/strict";
import { MISSION_STAGES, MISSION_ENCOUNTERS, MISSION_TRANSFER_THREATS, MISSION_TACTICS } from "./Data_FirstLevelMission.mjs";
import { MELEE_QTE_RULES as Q } from "./Data_MeleeCombat.mjs";
import { MeleeCombatDirector } from "./Script_MeleeCombat.mjs";
import { KitchenAmbushTriggered, KitchenAmbushLungeTarget } from "./Script_FirstLevelKitchenAmbush.mjs";
import { MISSION_LAYOUT, MISSION_ANCHORS as A, MISSION_PLACEMENT as P, MISSION_ROUTES } from "./Data_FirstLevelMissionLayout.mjs";
import { SampleMissionTerrain } from "./Data_FirstLevelMissionTerrain.mjs";
import { MISSION_FACT_GATES, MISSION_ENCOUNTER_ACTIVATION, MissionGateInArea } from "./Data_FirstLevelMissionGates.mjs";
import { MISSION_TUNING as R } from "./Data_Tuning_FirstLevel.mjs";
import { MID_TUNING as M, MidLitterHoldSlots, MidDraftKind, MidTransferScatterPlan, MidTransferRetreatJoin, MidTransferWalkRoute } from "./Data_Tuning_FirstLevelMid.mjs";
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

  // 2026-09-20 演出打磨：「街堵了」要在**村北口往主街一看**就成立，不是钻进街里走十几米。
  const gate = MISSION_FACT_GATES.streetBlockSeen;
  Check(gate.kind === "proximity" && gate.anchor === "streetBlock", "还是一道走 GateNear 的距离门");
  Check(!!gate.area && !!gate.sight, "改成「人在北口 box 里 + 到障碍有通视」");
  Check(gate.sight.anchor === "streetBlock", "看的就是主街障碍那一头");
  // box 要盖住主街北口（两道街墙从 z=−22 起，北口在那以北一小段），
  // 而且整个落在两道街墙之间的街心里。
  Check(gate.area.minZ <= -24 && gate.area.maxZ >= -10,
    `北口这一带都算数：z ${gate.area.minZ}…${gate.area.maxZ}`);
  Check(gate.area.minX >= 72.35 && gate.area.maxX <= 81.65,
    `box 在两道街墙之间（x ${gate.area.minX}…${gate.area.maxX}）`);
  // 外圈半径仍要盖得住 box 的四个角（GateNear 最后那一步还是 Near）。
  for (const corner of [[gate.area.minX, gate.area.minZ], [gate.area.maxX, gate.area.minZ],
    [gate.area.minX, gate.area.maxZ], [gate.area.maxX, gate.area.maxZ]])
    Check(Distance({ x: corner[0], z: corner[1] }, A.streetBlock) < gate.radiusM,
      `半径盖得住 box 的角 ${corner}`);
  Check(MissionGateInArea({ x: 77, z: -21 }, gate.area), "站在北口里算数");
  Check(!MissionGateInArea({ x: 66, z: -20 }, gate.area), "还在担架等待点那一带不算数");
  Check(!MissionGateInArea({ x: 77, z: 4 }, gate.area), "已经走进街当中的不靠这条门补记");
  // 喊话的前队站在玩家来向（北口）与障碍之间，而且让开街心那条视线。
  const party = P.streetBlock.frontParty;
  for (const spot of party) {
    Check(spot.z < P.streetBlock.gap.z && spot.z > gate.area.maxZ,
      `前队站在北口与障碍之间（z=${spot.z}）`);
    Check(Math.abs(spot.x - A.streetBlock.x) > 1.2, `前队让开街心那条视线（x=${spot.x}）`);
  }
  Check(party.some((spot) => Math.abs(spot.yaw - Math.PI) < 0.01),
    "至少一个人回头朝北喊（「后头莫挤！街堵了！」是喊给后头的）");
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
// 09 灶屋—连屋近战：进门遭伏击（2026-09-28，COD5 万岁冲锋式一次性按键 QTE）
// ---------------------------------------------------------------------------
{
  const T = M.kitchenAmbush;
  // --- 数据对账 ---
  const leadSpec = MISSION_ENCOUNTERS.melee[0];
  Check(leadSpec.id === "MeleeLead" && leadSpec.x === T.hide.x && leadSpec.z === T.hide.z,
    "藏在过道里的就是名册第一个 MeleeLead，出生点与 kitchenAmbush.hide 是同一个点");
  Check(!MISSION_TACTICS.MeleeLead, "MeleeLead 没有战术折线：冲锋归伏击那一拍驱动，不许两边抢着下命令");
  Check(MISSION_ENCOUNTER_ACTIVATION.melee.wake.fact === "kitchenEntered", "激活表仍写明「进了灶屋」才上膛");
  Check(T.windowS >= 1 && T.windowS <= Q.windowS, `按键窗口在共用上限以内（${T.windowS} s ≤ ${Q.windowS} s）`);
  Check(T.failDamage * 0.8 >= 100, "漏按那一刀在「体验」档 0.8 倍受伤率下也是一刀致命");
  for (const id of ["kitchenAmbushSprung", "kitchenAmbushTackled", "kitchenAmbushPrompted", "kitchenAmbushCountered",
    "kitchenAmbushFailed", "kitchenAmbushPreempted", "kitchenAmbushBroken"])
    Check(!!MISSION_FACT_GATES[id], `新事实 ${id} 登记进了 MISSION_FACT_GATES（工作台照它讲人话）`);

  // --- 触发几何：灶屋里不扑、门框里不扑，真跨进过道 / 绕进连屋才扑 ---
  const Trig = (x, z) => KitchenAmbushTriggered({ x, z }, T);
  Check(!Trig(58, -6) && !Trig(58, -3) && !Trig(56, -2.5), "还在灶屋里（离他不到五米、隔着南墙）不扑");
  Check(!Trig(58, -1.5), "站在灶屋南门的墙厚里不扑：往西看被门框挡着，看不见扑过来的人");
  Check(Trig(58, -0.9) && Trig(60, -0.5), "跨进过道就扑");
  Check(Trig(58, 6) && Trig(62, 12), "从东巷／内院绕进连屋也扑（他从过道北口那扇门出来）");

  // --- 藏身点从灶屋里看不见：灶屋正中那间任一处到他胸口的连线都被墙挡住 ---
  const SegmentBlocked = (from, to) => MISSION_LAYOUT.blocks.some((box) => {
    if (box.solid === false || MISSION_LAYOUT.walkableSurfaces.some((surface) => surface.id === box.id)) return false;
    const y = SampleMissionTerrain(to.x, to.z);
    if (!(box.y + box.h / 2 > y + 1.5 && box.y - box.h / 2 < y + 1.0)) return false;
    for (let t = 0.05; t < 0.95; t += 0.02) {
      const x = from.x + (to.x - from.x) * t, z = from.z + (to.z - from.z) * t;
      const dx = x - box.x, dz = z - box.z, c = Math.cos(box.ry || 0), s = Math.sin(box.ry || 0);
      if (Math.abs(dx * c - dz * s) < box.w / 2 && Math.abs(dx * s + dz * c) < box.d / 2) return true;
    }
    return false;
  });
  for (const eye of [{ x: 58, z: -6 }, { x: 57, z: -3 }, { x: 59, z: -2.2 }, { x: 58, z: -10 }])
    Check(SegmentBlocked(eye, T.hide), `灶屋里 (${eye.x},${eye.z}) 看不见过道里的他`);
  Check(!SegmentBlocked({ x: 58, z: -0.8 }, T.hide), "跨进过道一扭头就看得见他（整条过道是通的）");

  // --- 冲锋路线：人在过道里、目标在过道外，先冲门洞口 ---
  const inside = KitchenAmbushLungeTarget(T.hide, { x: 58, z: 6 }, T);
  Check(inside.x === T.doorX && inside.z < T.linkZ.max, "目标在连屋里：先冲到连屋北门口再拐（直线会顶在过道南墙上）");
  const straight = KitchenAmbushLungeTarget(T.hide, { x: 58, z: -0.8 }, T);
  Check(straight.x === 58 && straight.z === -0.8, "目标就在过道里：直冲");

  // --- 真的共用白刃层 + 假宿主，逐帧跑四条路 ---
  const MakeAmbush = () => {
    const host = MakeHost("Melee", { sight: () => false });
    host.Record("kitchenEntered");
    for (const spec of MISSION_ENCOUNTERS.melee)
      host.enemies.set(spec.id, {
        id: spec.id, missionId: spec.id, side: "ija", alive: true, health: 100, yaw: 0, meleeWeapon: "Bayonet",
        missionDormant: true, scriptedNoncombatant: true, missionEncounter: "melee",
        position: { x: spec.x, z: spec.z },
        TakeHit(amount) { this.health -= amount; if (this.health <= 0) { this.health = 0; this.alive = false; } },
      });
    host.enemies.set("VillageGunner", { alive: true, missionEncounter: "village", position: { ...P.sideRoomGunner } });
    Object.assign(host.player, {
      alive: true, health: 100, side: "nra", meleeWeapon: null, spawnGrace: 0,
      TakeHit(amount) { if (this.spawnGrace > 0) return; this.health -= amount; if (this.health <= 0) { this.health = 0; this.alive = false; } },
    });
    host.player.position.x = 58; host.player.position.z = -6;
    host.meleeCombat = new MeleeCombatDirector({
      Player: () => host.player,
      Soldiers: () => [...host.enemies.values()].filter((actor) => actor.side === "ija"),
      Damage: (target, attacker, amount) => target.TakeHit(amount),
    });
    host.BeginControl = (kind, seconds) => { host.controls = { kind, seconds, time: 0 }; };
    host.TrackControl = () => true;
    host.AimControl = () => true;
    host.PlaceActor = (actor, point) => { actor.position.x = point.x; actor.position.z = point.z; };
    // 冲锋按剧本步速真的挪人（假宿主没有 AI）。
    host.MoveActor = (actor, point, speed) => {
      const d = Distance(actor.position, point);
      if (d > 1e-6 && speed > 0) {
        const step = Math.min(d, speed / 60);
        actor.position.x += (point.x - actor.position.x) / d * step;
        actor.position.z += (point.z - actor.position.z) / d * step;
      }
    };
    const village = new FirstLevelVillageBlock(host);
    village.Enter("Melee");
    return { host, village, lead: host.enemies.get("MeleeLead") };
  };
  const Frame = ({ host, village }) => {
    host.time += 1 / 60;
    host.meleeCombat.Update(1 / 60);
    village.Update(1 / 60);
  };
  const Run = (ctx, seconds, until = () => false) => {
    for (let i = 0; i < Math.round(seconds * 60) && !until(); i++) Frame(ctx);
  };
  const Phase = (ctx) => ctx.village.ambush.Phase;

  // 1) 灶屋里站着不动：他一直装睡，「右手！」不喊。
  const idle = MakeAmbush();
  Run(idle, 3);
  Check(Phase(idle) === "hidden" && idle.lead.missionDormant && idle.lead.meleeDormant,
    "玩家还在灶屋里，他一直藏着（装睡 + 不归共用白刃层认领）");
  Check(!idle.host.said.includes("MeleeRight") && !idle.host.Has("meleeBreachStarted"), "没扑出来就没有「右手！」，东巷那三个也不放");

  // 2) 反刺：跨进过道 → 冲锋 → 撞翻 → 按 F → 他死在这一下上 → 起身还权 → 剩下三个错峰出来。
  const win = MakeAmbush();
  win.host.player.position.z = -0.8;
  Frame(win);
  Check(Phase(win) === "lunge" && win.host.Has("kitchenAmbushSprung"), "跨进过道当帧就扑出来");
  Check(win.host.said[0] === "MeleeRight", "罗班长吼「右手！」（插队，不排在别的台词后面）");
  Check(!win.lead.scriptedNoncombatant && win.lead.missionSurfaceRest === true && win.lead.bayonetFixed,
    "冲锋途中：醒了、端着刺刀、扳机整段不扣（missionSurfaceRest）");
  Run(win, 0.1);
  Check(Distance(win.lead.position, T.hide) < 0.05, `露头那 ${T.emergeS} s 先站住嚎一声，不是一出来就冲`);
  Run(win, 3, () => Phase(win) !== "lunge");
  Check(Phase(win) === "pinned" && win.host.Has("kitchenAmbushTackled"), "够到撞翻距离就撞上");
  Check(win.host.controls?.kind === "ambush" && win.village.AmbushCinematic, "撞上就锁控制、HUD 让位");
  Check(win.host.player.meleeWeapon === "Bayonet", "撞翻那一刻借一把刺刀给共用倒地层（顶住那把刀的就是手里这支枪）");
  Check(win.host.player.health === 100 - T.tackleDamage, `撞翻真的掉血（${T.tackleDamage}）`);
  Run(win, 0.2);
  Check(win.host.meleeCombat.Fighter(win.host.player).state !== "idle", "玩家真的倒在共用状态机里（fall / down）");
  Check(win.lead.meleeCombat?.clip === "BayonetPressure", "他骑上来压刀：共用 Pressure 姿势");
  Check(!win.village.AmbushPromptView(), "倒地镜头落稳之前不给键");
  Check(!win.host.said.includes("MeleeCurse"), "被撞翻压住时还不骂：「滚你妈的！」归反刺那一下");
  Run(win, 2, () => Phase(win) === "prompt");
  Check(Phase(win) === "prompt" && win.host.Has("kitchenAmbushPrompted"), `撞上 ${T.promptDelayS} s 后给键`);
  const ring = win.village.AmbushPromptView();
  Check(ring?.mode === "press" && ring.progress > 0.9, "屏幕上是一次性按键环，弧从满开始漏");
  Check(win.host.meleeCombat.qte.active.input === "press", "走共用倒地僵持的 input \"press\"");
  Run(win, 0.5);
  Check(win.village.AmbushPromptView().progress < ring.progress, "弧在漏（窗口在走）");
  Check(!win.host.said.includes("MeleeCurse"), "按键窗口里也还没骂");
  win.host.meleeCombat.qte.Press(true, false);
  Frame(win);
  Check(Phase(win) === "countered" && !win.lead.alive && win.host.Has("kitchenAmbushCountered"),
    "按上了：他死在这一下上（反刺走共用伤害链）");
  Check(win.host.said.includes("MeleeCurse"), "顺子「滚你妈的！」");
  Check(win.host.meleeCombat.Active, "他死了共用结算照样走完（不当成「人没了」取消，起身不被砍掉）");
  Run(win, 3, () => Phase(win) === "done");
  Check(Phase(win) === "done" && win.host.controls === null, "起完身还权");
  Check(win.host.player.meleeWeapon === null, "借的刺刀起完身还回去");
  Check(win.host.player.alive && win.host.player.health === 100 - T.tackleDamage, "只挨了撞翻那一下");
  Run(win, T.releaseDelaysS.at(-1) + 0.2);
  Check(MISSION_ENCOUNTERS.melee.slice(1).every((spec) => !win.host.enemies.get(spec.id).missionDormant)
    && win.host.Has("meleeBreachStarted"), "那一拍收尾后东巷那三个才进来（meleeBreachStarted）");
  Check(!win.village.RearmAmbush(), "已经反杀的不在检查点重试里重放");

  // 3) 漏按：刀捅进去、满血也死；检查点重来 —— 他回到过道里装睡、玩家回到灶屋。
  const lose = MakeAmbush();
  lose.host.player.position.z = -0.8;
  Run(lose, 6, () => Phase(lose) === "prompt");
  Run(lose, T.windowS + 0.2, () => Phase(lose) !== "prompt");
  Check(Phase(lose) === "failed" && lose.host.Has("kitchenAmbushFailed"), "窗口漏完就是被捅");
  Check(!lose.host.player.alive, "满血也是一刀致命（COD5：万岁冲锋捅中就是死）");
  Frame(lose);
  Check(!lose.village.AmbushCinematic && lose.host.controls === null, "死了收锁、收环，整拍停着等重来");
  const retry = lose.village.RearmAmbush();
  Check(retry && retry.x === T.retryPoint.x && retry.z === T.retryPoint.z, "重来点是灶屋正中（不是原地复活在他脚下）");
  Check(Phase(lose) === "hidden" && lose.lead.missionDormant && Distance(lose.lead.position, T.hide) < 1e-6,
    "他回到过道里装睡");
  Check(lose.village.ambush.attempts === 1 && lose.host.player.meleeWeapon === null, "借的刺刀还回去；次数记着");
  // 重来：走进过道，这一拍从头再演一遍。
  Object.assign(lose.host.player, { alive: true, health: 100 });
  lose.host.meleeCombat.Cancel("retry");
  lose.host.player.position.x = retry.x; lose.host.player.position.z = retry.z;
  Run(lose, 1);
  Check(Phase(lose) === "hidden", "重来之后在灶屋里他照样藏着");
  lose.host.player.position.z = -0.8;
  Frame(lose);
  Check(Phase(lose) === "lunge" && lose.village.ambush.attempts === 2, "再跨进过道，他再扑一次");

  // 4) 冲锋途中先手打掉：不进 QTE、不锁控制，东巷那三个照常放出来（Notion 09「提前击败不强制 QTE」）。
  const shot = MakeAmbush();
  shot.host.player.position.z = -0.8;
  Run(shot, T.emergeS + 0.1);
  shot.lead.TakeHit(200);
  Frame(shot);
  Check(Phase(shot) === "preempted" && shot.host.Has("kitchenAmbushPreempted"), "冲锋途中被打死：提前击败");
  Check(!shot.host.Has("kitchenAmbushTackled") && shot.host.controls === null && !shot.host.meleeCombat.Active,
    "提前击败就没有撞翻、没有锁、没有僵持");
  Run(shot, T.releaseDelaysS.at(-1) + 0.2);
  Check(shot.host.Has("meleeBreachStarted"), "照常放出剩下三个");
  Check(!shot.village.RearmAmbush(), "先手打掉的不重放");

  // 5) 追不上（玩家从连屋深处触发、一直往外跑）：这一拍作罢，他转普通白刃兵，不隔着几米「撞」人。
  const far = MakeAmbush();
  far.host.player.position.x = 58; far.host.player.position.z = 14;
  Frame(far);
  Check(Phase(far) === "lunge", "从连屋深处触发");
  Run(far, T.emergeS + T.lungeMaxS + 0.1, () => Phase(far) !== "lunge");
  Check(Phase(far) === "done" && far.host.Has("kitchenAmbushBroken") && !far.host.Has("kitchenAmbushTackled"),
    "冲了 lungeMaxS 还够不着就作罢，不撞人");
  Check(!far.lead.missionDormant && !far.lead.meleeDormant && far.lead.scriptEssential === false,
    "他当场转成普通白刃兵");

  // --- 连屋那一组的收尾台词（原口径不变）---
  const after = MakeAmbush();
  for (const spec of MISSION_ENCOUNTERS.melee) after.host.enemies.get(spec.id).alive = false;
  after.host.Record("meleeResolved");
  after.host.player.position.z = -6;
  Frame(after);
  Check(after.host.Has("windowFireHolding") && after.host.said.includes("WindowOrder"),
    "近战结束、窗口那挺机枪还封着院口，才喊 WindowOrder");
  const silent = MakeAmbush();
  silent.host.Record("meleeResolved");
  silent.host.enemies.get("VillageGunner").alive = false;
  Frame(silent);
  Check(!silent.host.said.includes("WindowOrder"), "窗口已经哑了就不喊那句分工");
  Check(!silent.host.said.includes("MeleeCurse"), "没人贴上身就没有「滚你妈的」");
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
  // 何有田真的走过来接住顺子在村口低墙上的射位（A.transferWall），才轮到 EscortZhou。
  const host = MakeHost("Transfer");
  const transfer = new FirstLevelTransferCart(host);
  transfer.Enter("Transfer");
  host.transferBeats = { index: 2, previousClearedAt: 0, started: ["transfer", "transferAlley"], cleared: ["transfer", "transferAlley"] };
  host.Record("alleyThreatResolved");
  for (const litter of host.column.litters) if (!litter.zhou) { litter.loaded = true; }
  const he = host.companion.Handle("heyoutian");
  he.position = { x: A.transferWall.x + 20, z: A.transferWall.z };
  transfer.Update(1 / 60);
  Check(!host.said.includes("EscortZhou"), "何有田还在半路，不许先放顺子走");
  he.position = { ...A.transferWall };
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
  // Continuous 12->15 has another wounded passenger already aboard this cart.
  // He must be physically unloaded too, not remain stranded and fail regroup forever.
  const passenger = host.column.litters.find(litter => !litter.zhou);
  passenger.loaded = true; passenger.state = "loaded";
  cart.load.push(passenger.id);
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
  Check(passenger.loaded && cart.load.includes(passenger.id), "同车伤员没有在停车时瞬移下车");
  // 13 的时候民夫已经跟到接运点了（这里把他们摆到车附近，别让 240 m 的路程喧宾夺主）。
  for (const walker of host.column.walkers) { walker.x = cart.x - 6; walker.z = cart.z + 2; }
  let passengerLoweringSeen = false;
  for (let i = 0; i < 60 * 40 && !host.Has("zhouUnloaded"); i++) {
    host.time += 1 / 60; transfer.UpdateUnload(1 / 60); host.column.Update(1 / 60, { moving: false });
    if (passenger.state === "unloading" && passenger.liftFraction > 0 && passenger.liftFraction < 1) {
      passengerLoweringSeen = true;
      Check(!host.Has("zhouUnloaded"), "同车伤员尚在下放时老周卸车事实不能提前完成");
    }
  }
  Check(host.Has("zhouUnloaded"), "两个搬运的人到位之后，老周被卸回担架");
  Check(transfer.unload.seconds >= M.unloadSeconds, `卸人至少花了 ${M.unloadSeconds} 秒，不是一帧完成`);
  Check(host.said.includes("WestDitchOrder"), "接运兵随即指西沟");
  Check(!cart.load.includes(host.column.zhou.id), "老周已经不在车上了");
  Check(host.column.zhou.liftFraction === 0 && host.column.zhou.state === "waiting", "他回到了地面的担架上");
  Check(passengerLoweringSeen && !passenger.loaded && passenger.state === "waiting",
    "同车伤员经过真实下放过程回到担架，能随队进入西沟");
  Check(!cart.load.includes(passenger.id) && passenger.unloadedFromCart,
    "同车伤员的车载归属清除，卸车后位置由撤离路线接管");
  Check(Distance(passenger, host.column.zhou) >= R.litterSpacingM - .01,
    "两副卸下的担架没有重叠");
}

// ---------------------------------------------------------------------------
// 13 空袭打的是道路与车列
// ---------------------------------------------------------------------------
{
  const host = MakeHost("AirFirst"), transfer = new FirstLevelTransferCart(host);
  const cart = host.column.ReserveBoardingCart(P.cartBays[0]);
  Object.assign(cart, A.cartHalt, { state: "loading" });
  const passenger = host.column.litters.find(litter => !litter.zhou);
  passenger.loaded = true; passenger.state = "loaded"; cart.load.push(passenger.id);
  transfer.Board();
  transfer.BeginUnload();
  const slot = transfer.unload.queue.find(entry => entry.litter === passenger).target;
  Object.assign(passenger, slot, { loaded: false, state: "waiting" });
  host.column.StartRetreat();
  const end = passenger.joinRoute.findIndex(point => Distance(point, A.retreatA) < .01);
  assert.ok(end > 0, "the actual passenger join route reaches the regroup anchor");
  const route = passenger.joinRoute.slice(0, end + 1), hits = new Set();
  const solids = MISSION_LAYOUT.blocks.filter(block => block.solid !== false);
  // Sample both actual bearer positions as well as the litter's 1.3 m wide
  // corridor. A centre line alone missed the north tip of the road shoulder.
  for (let leg = 1; leg < route.length; leg++) {
    const a = route[leg - 1], b = route[leg], length = Distance(a, b);
    if (!length) continue;
    const dx = (b.x - a.x) / length, dz = (b.z - a.z) / length;
    for (let d = 0; d <= length; d += .1) {
      for (const [offset, margin] of [[0, .65], [-R.litterBearerOffsetM, .34], [R.litterBearerOffsetM, .34]]) {
        const x = a.x + dx * (d + offset), z = a.z + dz * (d + offset), y = SampleMissionTerrain(x, z);
        for (const box of solids) {
          const c = Math.cos(box.ry || 0), s = Math.sin(box.ry || 0), bx = x - box.x, bz = z - box.z;
          if (Math.abs(bx * c - bz * s) < box.w / 2 + margin
            && Math.abs(bx * s + bz * c) < box.d / 2 + margin
            && box.y + box.h / 2 > y + .3 && box.y - box.h / 2 < y + 1.8)
            hits.add(`${box.id} leg=${leg} bearer=${offset}`);
        }
      }
    }
  }
  assert.deepEqual([...hits], [], "the additional unloaded passenger and both bearers clear the road shoulder into the western ditch");
  Check(slot.z < A.cartHalt.z - R.litterSpacingM, "额外乘员卸到停车点北侧的完整搬运空间");
}
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
  // 2026-09-27 起散开走固定遮挡点（残墙后 / 洼地 / 房檐下，MID.transferEvac）：真的停到了
  // 自己那个遮挡点上，而且那个点在路两侧残墙（x 71 / x 80）外侧。
  // 还挂在车板上的那一副（上面把 loaded 清了，但 cart.load 每帧把它钉在车上）不是步行散开的人：
  // 旧断言只是碰巧——那辆车停在 x 88 的车位上。
  const onCart = (litter) => host.column.vehicles.some((cart) => cart.load.includes(litter.id));
  const onFoot = movable.filter((litter) => !onCart(litter));
  Check(onFoot.length > 0 && onFoot.every((litter) => litter.held && !litter.holdRoute?.length
    && Math.abs(litter.x - road) >= M.scatterCoverOffRoadM),
    "抬得动的那几副真的走到了路边遮挡点（残墙外侧）");
}

// ---------------------------------------------------------------------------
// 13/15A 固定通道（MID.transferEvac，2026-09-27 白盒 C 区第二轮）
// 车路两侧砌了带缺口的残墙之后，散开与撤退都只走数据表里的折线。这里对真实布局的
// 实心体块逐条扫：担架 1.3 m 走廊（中心 0.65）加前后两个搬运员胶囊（±litterBearerOffsetM，0.34），
// 0.1 m 抽样 —— 与上面「额外乘员进西沟」那一条同一把尺。
// ---------------------------------------------------------------------------
{
  const solids = MISSION_LAYOUT.blocks.filter((block) => block.solid !== false);
  const Hit = (x, z, margin) => {
    const y = SampleMissionTerrain(x, z);
    return solids.find((box) => {
      const c = Math.cos(box.ry || 0), s = Math.sin(box.ry || 0), bx = x - box.x, bz = z - box.z;
      return Math.abs(bx * c - bz * s) < box.w / 2 + margin && Math.abs(bx * s + bz * c) < box.d / 2 + margin
        && box.y + box.h / 2 > y + .3 && box.y - box.h / 2 < y + 1.8;
    });
  };
  // skipM：起点本身是人已经站着的地方，前这么多米不算（人不会凭空站进墙里，起点另行筛过）。
  const Sweep = (route, skipM = 0) => {
    const hits = new Set();
    let run = 0;
    for (let leg = 1; leg < route.length; leg++) {
      const a = route[leg - 1], b = route[leg], length = Distance(a, b);
      if (!length) continue;
      const dx = (b.x - a.x) / length, dz = (b.z - a.z) / length;
      for (let d = 0; d <= length; d += .1) {
        if (run + d < skipM) continue;
        for (const [offset, margin] of [[0, .65], [-R.litterBearerOffsetM, .34], [R.litterBearerOffsetM, .34]]) {
          const box = Hit(a.x + dx * (d + offset), a.z + dz * (d + offset), margin);
          if (box) hits.add(`${box.id}@leg${leg}`);
        }
      }
      run += length;
    }
    return [...hits];
  };
  const E = M.transferEvac;
  // westOnly（2026-09-30）：口子在西高墙里的通道只给墙后的人走，从 westEntry.via 起扫；其余从车路一侧的口子起扫。
  for (const lane of E.lanes)
    assert.deepEqual(Sweep([lane.westOnly ? lane.westEntry.via : lane.gate, ...lane.points, E.ditchMouth]), [],
      `retreat lane ${lane.id} is a clear litter corridor`);
  for (const cover of E.covers) {
    assert.deepEqual(Sweep(cover.path), [], `scatter path to ${cover.id} is clear`);
    assert.ok(Math.abs(cover.path.at(-1).x - E.roadX) >= M.scatterCoverOffRoadM, `${cover.id} is off the carriageway`);
    // 一个遮挡点最多排 slotsPerCover 个人（0、+1、-1 个 slotSpreadM），每个位置都走得到、也都接得上撤退通道。
    for (let k = 0; k < E.slotsPerCover; k++) {
      const hold = cover.path.at(-1), off = (k % 2 ? -1 : 1) * Math.ceil(k / 2) * E.slotSpreadM;
      const slot = { x: hold.x, z: hold.z + off };
      const from = cover.path.length > 1 ? cover.path.at(-2) : { x: E.roadX + cover.side * 4, z: hold.z };
      assert.deepEqual(Sweep([from, slot]), [], `${cover.id} slot ${k} reachable`);
      assert.deepEqual(Sweep([slot, ...MidTransferRetreatJoin(slot)]), [], `${cover.id} slot ${k} joins a retreat lane`);
    }
  }
  // 场上任何一个站得下担架的位置都能接上某条通道，一路到下沟口不撞墙。「站得下」：担架朝哪个方向
  // 都放得下 —— 中心 litterBearerOffsetM + 0.34（搬运员胶囊）≈ 1.65 m 内无实心体块。
  // 范围：接运场 x 58–92、z 88–136（车位与侧巷以东不是后送队站人的地方）。
  let joined = 0;
  const bad = [];
  for (let x = 58; x <= 92; x += 1.5) for (let z = 88; z <= 136; z += 1.5) {
    if (Hit(x, z, R.litterBearerOffsetM + .34 + .03) || SampleMissionTerrain(x, z) < -1.4) continue;
    const route = [{ x, z }, ...MidTransferRetreatJoin({ x, z })];
    const hits = Sweep(route, 1.0);
    if (hits.length) bad.push(`${x},${z}:${hits.join("/")}`);
    else joined++;
  }
  if (bad.length) console.log(bad.join(" | "));
  assert.deepEqual(bad, [], "every standing position in the transfer yard joins a retreat lane");
  Check(joined > 300, `转运场上 ${joined} 个站位都接得上撤退通道`);
  // 14 救人：幺娃、刘文才由 MoveActor 直线奔向沟口的老周（没有寻路，只会贴墙滑）。从各自射位出发的
  // 直线（0.35 m 胶囊）不许撞上路边残墙 —— 2026-09-27 实跑卡死过一次：墙头突出的碎砖台阶挂住了刘文才。
  for (const post of M.defencePosts.filter((p) => ["yaowa", "liuwencai"].includes(p.cast))) {
    const hits = new Set(), a = post, b = E.ditchMouth, length = Distance(a, b);
    for (let d = 0; d <= length; d += .1) {
      const box = Hit(a.x + (b.x - a.x) * d / length, a.z + (b.z - a.z) * d / length, .35);
      if (box) hits.add(box.id);
    }
    assert.deepEqual([...hits], [], `${post.cast} runs straight from the defence post to the ditch mouth`);
  }
  // 14 救人（2026-09-30 第二轮）：刘文才 / 幺娃用 MoveActor 直线奔向老周。装载区东侧 (84,106) 一带出发的直线（0.35 m 胶囊）
  // 要落在西门洞 / 东开口里 —— 第一版门洞只开 2.9 m，整关驾驶在 Rescue 里卡了 575 s，量出来就是刘文才的斜线擦墙，
  // 门洞因此加宽到 4.95 m。从路中更靠南的地方出发的人，Rescue 里改由 RescueWaypoint 先带到门洞（下面单测）。
  for (const start of [{ x: 84, z: 106 }, { x: 82, z: 108 }, { x: 79, z: 110 }])
    for (const target of [E.ditchMouth, { x: 39, z: 116 }]) {
      const hits = new Set(), length = Distance(start, target);
      for (let d = 0; d <= length; d += .1) {
        const box = Hit(start.x + (target.x - start.x) * d / length, start.z + (target.z - start.z) * d / length, .35);
        if (box) hits.add(box.id);
      }
      assert.deepEqual([...hits], [], `rescuer straight line from ${start.x},${start.z} to ${target.x},${target.z} passes the walls`);
    }
  // RescueWaypoint（含人停在离折点 0.7 m 处的情形）：路上 z 98–134 任意一点出发，顺着「折点 → 折点」走到下沟口，每一段都不撞夹道的墙与门垛（沟边的房子另算），穿西墙只走门洞（AI 身体过不去 2.2 m 的窄缺口）。
  {
    const transfer = new FirstLevelTransferCart(MakeHost("Rescue"));
    const goal = { x: 54, z: 114 }, bad = [];
    for (let x = 72.5; x <= 79.5; x += 1.5) for (let z = 98; z <= 134; z += 2) {
      if (Hit(x, z, .4)) continue;
      let at = { x, z };
      for (let step = 0; step < 12 && Distance(at, goal) > .5; step++) {
        const next = transfer.RescueWaypoint(at, goal), length = Distance(at, next);
        // MoveActor 的到达半径：人停在离折点 0.7 m 的地方就算到了。
        const stop = length > 0.7 ? { x: at.x + (next.x - at.x) * (1 - 0.7 / length), z: at.z + (next.z - at.z) * (1 - 0.7 / length) } : next;
        // 穿西墙只走门洞（或南头 129.6 以南）：AI 身体过不去 2.2 m 的窄缺口（整关驾驶里幺娃卡在 z 101.4–103.6 的缺口里）。
        if (at.x > 71.35 && next.x < 70.65) {
          const zc = at.z + (next.z - at.z) * (at.x - 71) / (at.x - next.x), [d0, d1] = M.transferEvac.walls.westDoor;
          if (!((zc > d0 + .5 && zc < d1 - .5) || zc > 130.6 || zc < 90)) { bad.push(`${x},${z} crosses the west wall at z ${zc.toFixed(1)}, not a door`); step = 99; }
        }
        for (let d = 0; d <= length; d += .1) {
          const box = Hit(at.x + (next.x - at.x) * d / (length || 1), at.z + (next.z - at.z) * d / (length || 1), .35);
          if (box && /^TransferRoad(West|East)/.test(box.id)) { bad.push(`${x},${z} -> ${next.x.toFixed(1)},${next.z.toFixed(1)}: ${box.id}`); step = 99; break; }
        }
        at = step === 99 ? at : (next === goal ? next : stop);
      }
      if (Distance(at, goal) > 1.5 && !bad.length) bad.push(`${x},${z} stalls at ${at.x.toFixed(1)},${at.z.toFixed(1)}`);
    }
    assert.deepEqual(bad, [], "RescueWaypoint leads every road position through a door to the ditch");
  }
  // 散开计划本身：路上的人分到同侧遮挡点，最后一点就是停车位；墙外的人不回头穿墙。
  const plans = MidTransferScatterPlan([{ x: 75, z: 100 }, { x: 78, z: 100 }, { x: 69.5, z: 100 }, { x: 88, z: 100 }]);
  Check(plans[0].route.at(-1).x < E.walls.westX && plans[1].route.at(-1).x > E.walls.eastX,
    "路上的人按所在一侧去残墙外侧");
  Check(plans[2].route.every((p) => p.x < E.walls.westX), "已在西墙外的人不回头穿墙");
  Check(plans[3] === null, "不在路上的人不被点名散开");

  // 12 班里人上射位（TakePosts）、何有田接替顺子在村口低墙上的射位（A.transferWall）、13 罗班长跑到停车处：
  // 这些都是 squadRoutes / MoveActor 直线走位，没有寻路。12 里班里人能站的地方 —— 各射位、
  // 接替点、进场的村路段（z ≥ 75）、排队点、分拣区里车路两侧的遮挡点与北通道口 —— 出发，走
  // MidTransferWalkRoute 给的折线（车路两侧残墙挡着就走缺口），0.35 m 胶囊一路不撞实心体块。
  // （13 的散开点、南半场与撤退通道只归担架队与步行伤员，班里人 12 里不在那儿，不列。）
  const starts = [
    ...M.defencePosts, A.transfer, A.transferWall, A.queue,
    ...E.covers.map((cover) => cover.path.at(-1)).filter((point) => point.z < 111),
    E.lanes[0].gate, ...E.lanes[0].points,
    ...MISSION_ROUTES.village.filter((point) => point.z >= 75), ...MISSION_ROUTES.southTraffic.filter((p) => p.z >= 75 && p.z <= 111),
  ].filter((point) => !Hit(point.x, point.z, .6));
  const walkBad = [];
  const WalkSweep = (route) => {
    for (let leg = 1; leg < route.length; leg++) {
      const a = route[leg - 1], b = route[leg], length = Distance(a, b);
      for (let d = 0; d <= length; d += .1) {
        const box = Hit(a.x + (b.x - a.x) * d / (length || 1), a.z + (b.z - a.z) * d / (length || 1), .35);
        if (box) return box.id;
      }
    }
    return null;
  };
  for (const [who, target] of [...M.defencePosts.map((post) => [post.cast, post]), ["heyoutian relief", A.transferWall]])
    for (const start of starts) {
      const blocked = WalkSweep([start, ...MidTransferWalkRoute(start, target)]);
      if (blocked) walkBad.push(`${who} from ${start.x},${start.z}: ${blocked}`);
    }
  // 13 罗班长用 MoveActor 直奔停车处（不走折线）：从他的射位出发必须本来就是通的。
  const luoPost = M.defencePosts.find((post) => post.cast === "luo");
  const luoBlocked = WalkSweep([luoPost, A.cartHalt]);
  if (luoBlocked) walkBad.push(`luo post -> cartHalt: ${luoBlocked}`);
  assert.deepEqual(walkBad, [], "12–13 scripted squad walks reach their posts around the road walls");
  Check(starts.length > 15, `12–13 班里人直线走位：${starts.length} 个起点全部走得到射位 / 接替点`);
}

// ---------------------------------------------------------------------------
// 08–10 门框不许凸出墙面（2026-09-27 集成实跑：灶屋北门的门框比填墙厚 12 cm，何有田在 10
// 贴墙滑向门洞时胶囊挂在门框角上，一直卡到 12，「何有田接替射位」永远等不到）。
// 脚本走位只会贴墙滑，实心门框必须与所在墙段齐平。
// ---------------------------------------------------------------------------
{
  const solid = MISSION_LAYOUT.blocks.filter((block) => block.solid !== false);
  const jambs = solid.filter((block) => /DoorJamb/.test(block.id));
  assert.ok(jambs.length > 0, "the narrowed village doorways still have solid frames");
  for (const jamb of jambs) {
    const infill = solid.filter((block) => block.id.startsWith(jamb.id.replace(/Jamb.*$/, "Infill")));
    assert.ok(infill.length, `${jamb.id} sits in an infill wall`);
    for (const wall of infill) {
      const alongX = wall.w > wall.d;   // wall runs along x → thickness is along z
      const [jc, jh, wc, wh] = alongX ? [jamb.z, jamb.d / 2, wall.z, wall.d / 2] : [jamb.x, jamb.w / 2, wall.x, wall.w / 2];
      assert.ok(jc - jh >= wc - wh - 1e-6 && jc + jh <= wc + wh + 1e-6,
        `${jamb.id} is flush with ${wall.id} (a proud frame corner snags scripted movers)`);
    }
  }
  Check(true, `门框齐平：${jambs.length} 根实心门框都不凸出墙面`);
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
// 13 夹道高墙与停滞车列（2026-09-30，12–18 白盒 C2 包，概念 13_3「仰看俯冲」）
// 墙：西侧青砖高墙（≥ 3.5 m、连续 ≥ 10 m、只开一扇窗）、东侧夯土高墙（≥ 2.8 m、连续 ≥ 10 m），
//     两墙内皮净距 8–10 m（概念图 13_3 的路宽）；
// 车列：三四辆停滞的牛马车（布景车）不与 cartRide 全程的整套车（车板 + 牲口）、
//     撤退通道、卸车走廊、下沟口叠在一起。
// ---------------------------------------------------------------------------
{
  const solid = MISSION_LAYOUT.blocks.filter((block) => block.solid !== false);
  const Top = (id) => { const b = solid.find((block) => block.id === id); assert.ok(b, id + " exists"); return b.y + b.h / 2; };
  const W = M.transferEvac.walls;
  const westLen = W.westTall.reduce((sum, [z0, z1]) => sum + z1 - z0, 0);
  const eastLen = W.eastTall.reduce((sum, [z0, z1]) => sum + z1 - z0, 0);
  // 2026-09-30 第二轮：西高墙 z 103.6–129.6 只在一个门洞处断开；东高墙 z 117.85–136.4，北头是院门式开口。
  Check(W.westTall.length === 2 && westLen >= 20, "西高墙两段合计 >= 20 m（只在一个门洞处断开）：" + westLen);
  Check(W.eastTall.length === 1 && eastLen >= 18, "东高墙一整段 >= 18 m：" + eastLen);
  Check(W.westDoor[1] - W.westDoor[0] >= 2.6 && Math.abs(W.westDoor[0] - W.westTall[0][1]) < 1e-6 && Math.abs(W.westDoor[1] - W.westTall[1][0]) < 1e-6,
    "西墙门洞净宽 >= 2.6 m（担架 1.3 m + 两侧余量），两头正是两段墙的端点");
  Check(W.eastGate[1] - W.eastGate[0] >= 6.1 && W.eastGate[1] === W.eastTall[0][0],
    "东墙院门式开口净宽 >= 6.1 m（cartRide 车盒 2.5 x 2.9 加 1.25 / 1.45 余量）：" + (W.eastGate[1] - W.eastGate[0]));
  Check(["N", "A", "B"].every((id) => Top("TransferRoadWestWall" + id) >= 3.5), "西高墙各段顶高 >= 3.5 m（路面 y≈0）");
  Check(["N", "S"].every((id) => Top("TransferRoadWestDoorPier" + id) >= 3.9) && Top("TransferRoadEastGateSPier") >= 3.9, "门垛比墙身高");
  Check(Top("TransferRoadEastWallTallA") >= 2.8 && Top("TransferRoadEastWallTallB") >= 2.6, "东高墙顶高 >= 2.6–2.8 m");
  const westFace = W.westX + W.thickTallM / 2, eastFace = W.eastTallX - W.eastThickTallM / 2;
  Check(eastFace - westFace >= 8 && eastFace - westFace <= 10, "两墙内皮净距 8–10 m：" + (eastFace - westFace).toFixed(2));
  // 西高墙的窗：窗台之上、窗顶之下是空的（子弹与视线穿得过），窗台不高于 1.2 m（不能当矮墙翻）。
  const sill = solid.find((block) => block.id === "TransferRoadWestWallSill"), head = solid.find((block) => block.id === "TransferRoadWestWallLintel");
  Check(sill && head && sill.y + sill.h / 2 <= 1.2 && head.y - head.h / 2 - (sill.y + sill.h / 2) >= 1.0, "西高墙的窗洞净高 >= 1.0 m");

  // 车列布景车的整套（车板 + 牲口）矩形：局部 x ±1.4、z −5.4（牲口鼻尖）…+1.9（车尾），局部 -z 是车头。
  const Rig = (cart) => {
    const c = Math.cos(cart.yaw), s = Math.sin(cart.yaw);
    return [[-1.4, -5.4], [1.4, -5.4], [1.4, 1.9], [-1.4, 1.9]].map(([lx, lz]) => ({
      x: cart.x + lx * c + lz * s, z: cart.z - lx * s + lz * c }));
  };
  const Overlap = (a, b) => {
    for (const poly of [a, b]) for (let i = 0; i < 4; i++) {
      const p0 = poly[i], p1 = poly[(i + 1) % 4], nx = p1.z - p0.z, nz = p0.x - p1.x;
      const range = (q) => { const v = q.map((pt) => pt.x * nx + pt.z * nz); return [Math.min(...v), Math.max(...v)]; };
      const [a0, a1] = range(a), [b0, b1] = range(b);
      if (a1 <= b0 + 1e-6 || b1 <= a0 + 1e-6) return false;
    }
    return true;
  };
  const convoy = M.transferConvoy.carts;
  const standing = convoy.filter((cart) => !cart.overturned && !cart.standIn);
  Check(standing.length >= 3 && standing.length <= 5 && convoy.some((cart) => cart.overturned), "停滞车列三四辆 + 一辆侧翻残车：" + standing.length);
  Check(convoy.every((cart) => ["sacks", "spilled"].includes(cart.cargo) && ["ox", "horse"].includes(cart.draft)), "车板上码着麻袋（残车的撒在地上）、牲口是牛或马");
  Check(convoy.some((cart) => cart.draft === "ox") && convoy.some((cart) => cart.draft === "horse"), "车列里牛车马车都有");
  const ride = MISSION_ROUTES.cartRide, hits = [];
  for (let leg = 1; leg < ride.length; leg++) {
    const a = ride[leg - 1], b = ride[leg], length = Distance(a, b), yaw = Math.atan2(-(b.x - a.x), -(b.z - a.z));
    for (let d = 0; d <= length; d += .25) {
      const at = { x: a.x + (b.x - a.x) * d / length, z: a.z + (b.z - a.z) * d / length, yaw };
      for (const cart of convoy.filter((entry) => !entry.standIn)) if (Overlap(Rig(at), Rig(cart))) hits.push(cart.id + "@" + leg + ":" + d.toFixed(2));
    }
  }
  assert.deepEqual([...new Set(hits.map((h) => h.split("@")[0]))], [], "cartRide 全程的整套车不与停滞车列叠：" + hits.slice(0, 4));
  checks += 1;
  // 撤退通道、卸车走廊（1.3 m 宽）与下沟口：离每辆布景车的整套矩形 >= 0.5 m。
  const Near = (point, cart) => Rig(cart).some((_, i, poly) => {
    const p0 = poly[i], p1 = poly[(i + 1) % 4], len2 = (p1.x - p0.x) ** 2 + (p1.z - p0.z) ** 2;
    const t = Math.max(0, Math.min(1, ((point.x - p0.x) * (p1.x - p0.x) + (point.z - p0.z) * (p1.z - p0.z)) / len2));
    return Distance(point, { x: p0.x + (p1.x - p0.x) * t, z: p0.z + (p1.z - p0.z) * t }) < 0.5 + .65;
  }) || (() => { // 点在矩形里面
    const c = Math.cos(cart.yaw), s = Math.sin(cart.yaw), dx = point.x - cart.x, dz = point.z - cart.z;
    const lx = dx * c - dz * s, lz = dx * s + dz * c;
    return Math.abs(lx) <= 1.4 && lz >= -5.4 && lz <= 1.9;
  })();
  const E = M.transferEvac, unloadPoint = { x: A.cartHalt.x - M.unloadOffsetM, z: A.cartHalt.z };
  const bad = [];
  for (const line of [...E.lanes.map((lane) => [lane.westOnly ? lane.westEntry.via : lane.gate, ...lane.points, E.ditchMouth]), [unloadPoint, E.ditchMouth]])
    for (let leg = 1; leg < line.length; leg++) {
      const a = line[leg - 1], b = line[leg], length = Distance(a, b);
      for (let d = 0; d <= length; d += .25) {
        const point = { x: a.x + (b.x - a.x) * d / length, z: a.z + (b.z - a.z) * d / length };
        for (const cart of convoy) if (Near(point, cart)) bad.push(cart.id + "@" + point.x.toFixed(1) + "," + point.z.toFixed(1));
      }
    }
  assert.deepEqual([...new Set(bad)], [], "撤退通道 / 卸车走廊离停滞车列 >= 0.5 m");
  checks += 1;
  // 桥面上的两辆整套在甲板（x 72–80、z 137–169）之内。
  for (const cart of convoy.filter((entry) => entry.onBridge))
    Check(Rig(cart).every((pt) => pt.x > 72 && pt.x < 80 && pt.z > 137 && pt.z < 169), cart.id + " 整套在桥面上");
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
