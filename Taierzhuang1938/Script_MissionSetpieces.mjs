// 《滕县 一九三八》章节摆点 —— 把七章的内容与四批玩法系统真正接起来的那一层。
//
// **纯规则，不许 import three。** 摆的是「在哪儿、什么时候、对谁」，
// 造几何与出声全走宿主注入的窄回调，所以整层在纯 Node 里跑得完
//（回归口 `Script_MissionSetpiecesTest.mjs`）。
//
// ── 为什么是一个模块，而不是七章 if-else 糊进 Script_Main ────────────────────
// 集成批 INT2 的活是「把七章内容与全部系统真正接通」。这件事有两种做法：
//   ① 在 Script_Main 的 EnterLevel 里写 `if (phase.id === "CH1_NanLu") { ... }`
//      七段 —— 装配层从此同时是关卡内容的容器，每加一拍都要动那个 5300 行的文件；
//   ② 把「哪一章在哪一拍做什么」写成**数据**，引擎只提供动词。
// 这里取 ②。`SETPIECES` 是一张按 levelId 索引的表，一章一条，**每章的摆点集中一处
// 可读**（AGENTS 的工程口径）。装配层只做三件事：建一次导演、每帧推一下、换关时
// 告诉它换到哪一章去了。
//
// ── 一章能挂的四种钩子（一条都不多）─────────────────────────────────────────
//   Setup(s)            换关时摆一次：交互点、机枪位、后送队、道具、时刻表。
//   onZone[zoneId](s)   玩家**第一次**走进那个路标时。
//   onVoice[key](s)     某一条台词**播出去之后**（key 就是 beat.voice）。
//                       这是最要紧的一种：剧本节拍与玩法节拍从此对得上 ——
//                       「顺子喊完『老子回去压住！』」与「播转身那一场」是同一拍。
//   Update(s, dt)       每帧（计时器、队列、状态机）。
//
// 四种都拿到同一个 `s`（SetpieceContext）：它把宿主的窄回调与七个玩法系统
// 包成一层薄门面，并且**每一个系统都可能是 null**（出图、靶场、纯规则测试里
// 它们根本不存在）。所以门面上每个方法都自己判空 —— 章节数据里不许写 `if (s.carry)`。
//
// ── 三条纪律 ────────────────────────────────────────────────────────────────
//
// 一、**玩家永远不被夺走移动权。** 这一层不锁视角、不锁移动、不替玩家按键。
//     唯一的例外是策划案点名的那 4—6 秒固定事件（四关罗班长救顺子），
//     而它走的是**关中过场**（同一个 RunCutscene，Esc 语义与关首过场一致），
//     不是自己造一套「不能动」的状态。
//
// 二、**不重复实现玩法。** 担架、机枪、扫射、照明弹、发报、白刃、交互点、
//     具名同伴、检查点 —— 九个系统都已经有了，这一层只负责**摆**它们。
//     这里出现的每一行 new 都该是可疑的。
//
// 三、**推信号，不改剧本。** 摆点层与叙事层的接缝只有一条：`story.Signal(name)`。
//     名字在各章 `Data_MissionChX.EVENTS` 里登记，判据兜底也在那儿；
//     这一层只负责在**事实发生的那一刻**推它（推过的永远优先于时刻表）。

import {
  BleedControlInteraction, CheckWoundedInteraction, DoorPlankInteraction,
  WireInteractions, CutWireInteraction, LeafletPickupInteraction, LeafletBurnInteraction,
  TearShirtInteraction, PickUpLoadInteraction, GiveSupplyInteraction,
} from "./Script_Interact.mjs";
import { EmplacementInteraction, AmmoResupplyInteraction } from "./Script_Emplacement.mjs";
import { TelegraphKeyInteraction, TelegraphReconnectInteraction } from "./Script_Telegraph.mjs";
// 「可被炸中的场景物件」登记表（纯规则，destruction 那一侧每炸一次就喂它一笔）。
// 二关阶段③的殉爆倒计时靠它才有一只**真的打得中**的弹药箱 ——
// 分工与为什么不是一条 host 回调，写在 Script_BlastTargets.mjs 的头注里。
import { BLAST_TARGETS } from "./Script_BlastTargets.mjs";
import { P012SouthPoint } from "./Data_FirstLevelP012Space.mjs";

function P012WaypointIndex(route, target) {
  return route.reduce((best,point,index)=>best<0 || Math.hypot(point.x-target.x,point.z-target.z)
    < Math.hypot(route[best].x-target.x,route[best].z-target.z) ? index : best,-1);
}

// ---------------------------------------------------------------------------
// 数值
// ---------------------------------------------------------------------------

/**
 * 摆点层自己的旋钮。**数只在这里**，章节数据与文档只写常量名（AGENTS 硬规矩 12）。
 *
 * columnSpeedMS   后送队的推进速度。**必须比玩家搬运态慢**：
 *                 Script_Carry.CARRY_KINDS.stretcher 的 speedScale 是 0.42，
 *                 玩家常态步行约 4.2 m/s → 抬着担架约 1.76 m/s。
 *                 队列取 1.35 m/s，玩家抬着担架也追得上（Data_MissionCh1
 *                 的 ENGINE_REQUEST 2 明写「不然阶段七玩家抬着担架会被自己人甩掉」）。
 * columnWaitM     玩家落后这么远，队列停下等他。
 * columnResumeM   等到玩家追进这个距离才重新走（带迟滞，不然会在阈值上抖）。
 * columnSpanM     队列纵深：从队头到队尾。
 * columnLaneM     并排两列的横向间距。
 * columnScatterM  遇袭时往路沟一侧散开多远。
 * columnRegoalS   多久给每个人重设一次目标（每帧写目标 = 每帧打断寻路）。
 *
 * ── 二关殉爆（§3 阶段③「掷弹筒命中后冒烟倒计时 4—6 s，拖出 6 m 算救下」）──
 * crateHp          一只弹药箱的耐久。一发掷弹筒直接命中够打穿，
 *                  三米外的一颗手榴弹不够 —— 不然清侧翼的手榴弹会顺手点着自家的箱子。
 * crateRadiusM     箱子自己的半径（命中距离先减掉它再算衰减）。
 * crateFuseS       冒烟倒计时。策划案给的是 4—6 s，取中间。
 * crateSafeM       拖出这么远算救下（策划案原文 6 m）。
 * cookoffRadiusM   殉爆的爆炸半径 / cookoffDamage 能量。一箱手榴弹比一发掷弹筒重。
 * shellFlightS     退路那条（host.Detonate 没接线时走 host.Shell）的飞行时间。
 *                  Script_Combat.CallIncoming("artillery") 写死 2.6 s，
 *                  所以炸点要提前这么多秒下单，响声才落在倒计时归零那一刻。
 *
 * ── 五关终局（§6 阶段⑪「体力无法完全恢复、两侧夹击、活动空间缩小」）──────
 * lastStandStaminaFloor  体力恢复上限最低压到这个值（1 = 不压）。
 * lastStandStaminaStepS  每这么多秒往下压一档。
 * lastStandStaminaStep   一档压多少。
 * lastStandWaveS         两侧压上的波次间隔（每波之后自己收紧）。
 * lastStandWaveTighten   每过一波，间隔乘这个数（越打越密）。
 * lastStandWaveCount     一波从两侧各上来几个。
 * lastStandFlankM        两侧院门离机枪位多远（波次的出生点）。
 */
export const SETPIECE_TUNING = Object.freeze({
  columnSpeedMS: 1.35,
  columnWaitM: 26,
  columnResumeM: 17,
  columnSpanM: 22,
  columnLaneM: 3.2,
  columnScatterM: 7.5,
  columnRegoalS: 0.5,

  crateHp: 55,
  crateRadiusM: 0.55,
  crateFuseS: 5.0,
  crateSafeM: 6.0,
  cookoffRadiusM: 7.5,
  cookoffDamage: 130,
  shellFlightS: 2.6,

  lastStandStaminaFloor: 0.45,
  lastStandStaminaStepS: 22,
  lastStandStaminaStep: 0.12,
  lastStandWaveS: 26,
  lastStandWaveTighten: 0.86,
  lastStandWaveCount: 3,
  lastStandFlankM: 26,
});

const Num = (value, fallback = 0) => {
  const v = Number(value);
  return Number.isFinite(v) ? v : fallback;
};

// ---------------------------------------------------------------------------
// 后送队（最小队列控制器）
//
// 「2 担架（各 2 担架员抬）＋2 护卫＋可行走伤兵＋百姓沿路点位推进」。
// 一关的武装后送与五关的分段护送用的是**同一台**控制器 —— 两关的差别只有
// 路点、人数与「玩家在队里还是在队边上」，不是两套逻辑。
//
// 做什么：按路点推一个虚拟的**队头**，每个成员在队头后面认领一个固定的槽位。
// 不做什么：群体避障、编队重组、担架员被打倒之后自动补位的完整逻辑
//（策划案原话「不追求群体避障完美」）。担架员倒下时槽位空着 —— 这正是
// 一关阶段七「一名担架员中弹 → 顺子，接后头！」要的画面。
// ---------------------------------------------------------------------------

export function LastLitterArrived(column, radius = 2.5) {
  const end = column?.waypoints?.at(-1);
  const litters = column?.litters || [];
  return !!column?.arrived && !!end && litters.length > 0 && litters.every((litter) => !litter.dropped &&
    [litter.front, litter.rear].every((member) => {
      const target=column.scriptTerminalQueue ? TerminalSlot(column.waypoints,member.slot.back) : end;
      return member.handle?.alive && member.handle.position
        && Math.hypot(member.handle.position.x - target.x, member.handle.position.z - target.z) < (column.scriptTerminalQueue ? .7 : radius);
    }));
}
export function TerminalSlot(points, back) {
  for(let i=points.length-1;i>0;i--){const a=points[i],b=points[i-1],length=Math.hypot(b.x-a.x,b.z-a.z);
    if(back<=length)return {x:a.x+(b.x-a.x)*back/length,z:a.z+(b.z-a.z)*back/length};back-=length;}
  return {...points[0]};
}

/** P012 road fire cleared: a bounded relocation inside the evacuation cover.
 * Bodies keep their existing identities and traverse real goals. The distant
 * player may watch from the ruin; this exception ends at the short route end. */
export function StepP012RoadCover(s, HasSignal) {
  const column = s.mem.column;
  const route = s.phase?.whitebox?.activities?.ambushColumnCoverRoute;
  if (!s.phase?.whitebox?.p012 || !column?.started || !route?.length || !HasSignal("P012AmbushStarted")) return false;
  let state = s.mem.p012RoadCoverMove;
  if (!state) {
    state = s.mem.p012RoadCoverMove = { started: false, complete: false, released: false };
    s.mem.p012RoadCoverPoses = column.Alive.filter((member) => member.role === "bearer" || member.handle.scriptedNoncombatant)
      .map((member) => ({ actor: member.handle, stance: member.handle.stance || 0 }));
    for (const entry of s.mem.p012RoadCoverPoses) entry.actor.stance = 1;
    column.scriptPaused = true;
  }
  if (HasSignal("P012AmbushClear")) {
    if (!state.released) {
      for (const entry of s.mem.p012RoadCoverPoses) entry.actor.stance = entry.stance;
      column.scriptPaused = false; column.scriptMoveWithoutEscort = false; column.scriptHoldTailSlots = false; state.released = true;
    }
    return false;
  }
  if (!HasSignal("P012RoadGunSilenced")) return false;
  if (!state.started) {
    const front = column.litters?.[0]?.front?.handle;
    const start = front && s.d.host.PositionOf?.(front);
    if (!start) return false;
    if (!column.Repath(route, start)) return false;
    state.started = true; state.from = { x: start.x, z: start.z };
    for (const entry of s.mem.p012RoadCoverPoses) entry.actor.stance = 0;
    column.scriptPaused = false; column.scriptMoveWithoutEscort = true; column.scriptHoldTailSlots = true;
  }
  const end = route.at(-1), previous = route.at(-2) || state.from;
  const length = Math.hypot(end.x - previous.x, end.z - previous.z) || 1;
  const rearGoal = { x: end.x - (end.x - previous.x) / length * 1.9,
    z: end.z - (end.z - previous.z) / length * 1.9 };
  const first = column.litters?.[0];
  const frontAt = first?.front && s.d.host.PositionOf?.(first.front.handle);
  const rearAt = first?.rear && s.d.host.PositionOf?.(first.rear.handle);
  if (column.arrived && first && !first.dropped && frontAt && rearAt
    && Math.hypot(frontAt.x - end.x, frontAt.z - end.z) < 1.3
    && Math.hypot(rearAt.x - rearGoal.x, rearAt.z - rearGoal.z) < 1.3) {
    state.complete = true;
    column.scriptPaused = true; column.scriptMoveWithoutEscort = false;
  }
  if (state.complete && !HasSignal("P012RoadCoverReached")) s.Signal("P012RoadCoverReached");
  return state.started && !state.complete;
}

export class EscortColumn {
  /**
   * @param {object} host 与 CompanionDirector 同一套窄回调（装配层复用同一份）：
   *   Time() / PlayerPos() / SetGoal(handle,x,z) / PositionOf(handle) / Alive(handle)
   *   SpawnActor({label,x,z,weapon,squadId}) -> handle|null / Despawn(handle)
   * @param {object} spec
   *   waypoints  [{x,z}, ...]      队列走线（一般就是本章路标的一串）
   *   members    [{role,label,weapon}]  角色：bearer / guard / walking / civilian
   *   tuning     覆盖 SETPIECE_TUNING 的部分字段
   */
  constructor(host = {}, spec = {}) {
    this.host = host;
    this.tuning = { ...SETPIECE_TUNING, ...(spec.tuning || {}) };
    this.waypoints = (spec.waypoints || []).map((p) => ({ x: Num(p.x), z: Num(p.z) }));
    this.roster = spec.members || [];
    this.followRouteBodies = !!spec.followRouteBodies;
    this.members = [];
    /** 抬着走的担架实体（两名担架员一副，见 Start / _UpdateLitters）。 */
    this.litters = [];
    this.legIndex = 0;
    /** 队头在当前航段上走了多远（米）。 */
    this.legT = 0;
    this.moving = false;
    this.started = false;
    this.scattered = false;
    this.scatterUntil = -1;
    this.regoalAt = -99;
    this.arrived = false;
    this.log = [];
  }

  /** 队列里还站着的人。 */
  get Alive() {
    return this.members.filter((m) => m.handle && this._Alive(m.handle));
  }

  get Count() { return this.members.length; }

  /** 抬担架那几个（点名扫射白名单时要挑他们）。 */
  get Bearers() { return this.Alive.filter((m) => m.role === "bearer"); }
  /** 可行走伤兵与百姓（第二轮扫射的另一类目标）。 */
  get Civilians() { return this.Alive.filter((m) => m.role === "civilian" || m.role === "walking"); }

  _Alive(handle) {
    return this.host.Alive ? !!this.host.Alive(handle) : true;
  }

  /** 队头此刻在哪儿（世界坐标）。路点走完了就停在最后一个点上。 */
  HeadPosition() {
    const pts = this.waypoints;
    if (!pts.length) return null;
    const i = Math.min(this.legIndex, pts.length - 2);
    if (pts.length === 1 || this.legIndex >= pts.length - 1) return { ...pts[pts.length - 1] };
    const a = pts[i];
    const b = pts[i + 1];
    const len = Math.hypot(b.x - a.x, b.z - a.z) || 1;
    const t = Math.min(1, this.legT / len);
    return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t };
  }

  /** 队头的朝向（单位向量）。散开与排槽位都要用它。 */
  HeadDirection() {
    const pts = this.waypoints;
    if (pts.length < 2) return { x: 0, z: 1 };
    const i = Math.min(this.legIndex, pts.length - 2);
    const a = pts[i];
    const b = pts[i + 1];
    const len = Math.hypot(b.x - a.x, b.z - a.z) || 1;
    return { x: (b.x - a.x) / len, z: (b.z - a.z) / len };
  }

  /** 从当前队头连续改道，不销毁、不重生、不传送任何成员。 */
  Repath(points, physicalStart = null) {
    const head = physicalStart || this.HeadPosition();
    if (!head || !Array.isArray(points) || points.length < 2) return false;
    this.waypoints = [head, ...points.map((point) => ({ x: point.x, z: point.z }))];
    this.legIndex = 0; this.legT = 0; this.arrived = false;
    this.tailAdvanceM = 0;
    for (const member of this.members) {
      member.routeLeg = 0; member.routeFloorDistance = 0;
      if (physicalStart) {
        const at=this.host.PositionOf?.(member.handle);let along=0,best=Infinity;
        if (at) for(let i=0;i<this.waypoints.length-1;i++) {
          const a=this.waypoints[i],b=this.waypoints[i+1],dx=b.x-a.x,dz=b.z-a.z,length=Math.hypot(dx,dz);
          const t=Math.max(0,Math.min(1,((at.x-a.x)*dx+(at.z-a.z)*dz)/(length*length||1)));
          const miss=Math.hypot(at.x-a.x-dx*t,at.z-a.z-dz*t);
          if(miss<best){best=miss;member.routeFloorDistance=along+t*length;member.routeLeg=i;}
          along+=length;
        }
      }
    }
    this.moving = true; this.scattered = false;
    return true;
  }

  /**
   * 造人并开始走。**不许传送**（策划案原文）：所有人都在第一个路点附近生成，
   * 然后自己走 —— 玩家跟着走的那一段是这一关的内容，不是过渡。
   */
  Start() {
    if (this.started) return this.members.length;
    this.started = true;
    this.moving = true;
    const head = this.HeadPosition();
    if (!head) return 0;
    const dir = this.HeadDirection();
    const right = { x: -dir.z, z: dir.x };
    let bearerOrdinal = 0;
    this.roster.forEach((entry, index) => {
      // 担架员成**对**走纵列：同一副担架前后两人隔一副担架的长度（CARRY_KINDS
      // 里 stretcher 的 spanM ≈ 1.85），一对一对沿走线排开；其余角色照旧分两列。
      const slot = entry.role === "bearer"
        ? { back: Math.floor(bearerOrdinal / 2) * 4.2 + (bearerOrdinal % 2) * 1.9, lateral: 0 }
        : this._Slot(index, entry);
      if (entry.role === "bearer") bearerOrdinal += 1;
      const x = head.x - dir.x * slot.back + right.x * slot.lateral;
      const z = head.z - dir.z * slot.back + right.z * slot.lateral;
      let handle = null;
      try {
        handle = this.host.SpawnActor ? this.host.SpawnActor({
          label: entry.label || "后送队", x, z,
          weapon: entry.weapon || null, squadId: "EscortColumn",
          role: entry.role, civilian: entry.civilian === true, variant: entry.variant,
        }) : null;
      } catch (err) {
        this.log.push({ label: entry.label, ok: false, why: String((err && err.message) || err) });
        return;
      }
      if (!handle) { this.log.push({ label: entry.label, ok: false, why: "宿主没造出来（人口预算满了）" }); return; }
      // 「能走的轻伤员」走视频转骨骼的跛行 clip（Script_Ai 把旗透传给 Actor）。
      if (entry.role === "walking") handle.woundedWalk = 1;
      this.members.push({ ...entry, handle, slot, index });
      this.log.push({ label: entry.label, ok: true, x: +x.toFixed(1), z: +z.toFixed(1) });
    });
    // 两人一副担架：前位/后位各自的抬担架 clip（视频转骨骼），担架与伤员是
    // 跟着两人双手实时摆的运行时道具 —— 不再是路边那种静态布景箱。
    this.litters = [];
    const bearers = this.members.filter((m) => m.role === "bearer");
    for (let i = 0; i + 1 < bearers.length; i += 2) {
      const front = bearers[i];
      const rear = bearers[i + 1];
      front.handle.carryRole = "front";
      rear.handle.carryRole = "rear";
      const fp = this.host.PositionOf ? this.host.PositionOf(front.handle) : null;
      const at = fp ? { x: fp.x, z: fp.z } : head;
      const litter = {
        front, rear, dropped: false, lastMid: null,
        propLitter: this.host.Prop ? this.host.Prop({
          id: `escortLitter${i / 2}`, kind: "stretcher", position: { x: at.x, z: at.z },
        }) : null,
        propBody: this.host.Prop ? this.host.Prop({
          id: `escortCasualty${i / 2}`, kind: "shroudedBody", position: { x: at.x, z: at.z },
        }) : null,
      };
      this.litters.push(litter);
    }
    return this.members.length;
  }

  /** 第 index 个人站在队头后面多远、偏左右多少。 */
  _Slot(index, entry) {
    if (this.followRouteBodies && entry.routeSlot) return { ...entry.routeSlot };
    if (this.followRouteBodies) return { back: index * 2.2, lateral: entry.role === "bearer" ? 0 : (index % 2 ? 0.35 : -0.35) };
    const rows = Math.max(1, Math.ceil(this.roster.length / 2));
    const row = Math.floor(index / 2);
    const side = index % 2 === 0 ? -1 : 1;
    // 担架在最前面（白布要在弹线经过的画面里），护卫在两侧，百姓压尾。
    const bias = entry.role === "bearer" ? 0 : entry.role === "guard" ? 0.35 : 0.7;
    return {
      back: (this.tuning.columnSpanM * (row / Math.max(1, rows))) + bias * 4,
      lateral: side * this.tuning.columnLaneM * (entry.role === "guard" ? 1.6 : 1),
    };
  }

  /** 遇袭：整队往路沟一侧扑。seconds 之后自己爬起来接着走。 */
  Scatter(seconds = 12) {
    this.scattered = true;
    this.scatterUntil = (this.host.Time ? this.host.Time() : 0) + Math.max(1, seconds);
    this.moving = false;
    this.regoalAt = -99;
    return true;
  }

  /** 收摊。**不 Kill** —— 撤走不是阵亡。 */
  Reset() {
    for (const litter of this.litters || []) {
      if (litter.front?.handle) litter.front.handle.carryRole = null;
      if (litter.rear?.handle) litter.rear.handle.carryRole = null;
      this.host.SetPropState?.(litter.propLitter, "removed");
      this.host.SetPropState?.(litter.propBody, "removed");
    }
    this.litters = [];
    for (const m of this.members) {
      if (m.handle) m.handle.woundedWalk = 0;
      if (m.handle && this.host.Despawn) {
        try { this.host.Despawn(m.handle); } catch { /* 宿主的事 */ }
      }
    }
    this.members.length = 0;
    this.started = false;
    this.moving = false;
    this.scattered = false;
    this.legIndex = 0;
    this.legT = 0;
    this.arrived = false;
  }

  Update(dt) {
    if (!this.started) return false;
    const now = this.host.Time ? this.host.Time() : 0;
    if (this.scattered && now >= this.scatterUntil) {
      this.scattered = false;
      this.moving = true;
    }
    const head = this.HeadPosition();
    if (!head) return false;
    const player = this.host.PlayerPos ? this.host.PlayerPos() : null;
    // 玩家落后就等 —— 「不许传送」的另一半是「不许把人甩掉」。
    if (player && !this.scattered && !this.scriptMoveWithoutEscort) {
      const gap = Math.hypot(player.x - head.x, player.z - head.z);
      if (this.moving && gap > this.tuning.columnWaitM) this.moving = false;
      else if (!this.moving && gap < this.tuning.columnResumeM) this.moving = true;
    }
    if (this.scriptPaused) this.moving = false;
    if (this.followRouteBodies && this.arrived && !this.scriptPaused && !this.scriptHoldTailSlots) this.tailAdvanceM = Math.min(this.roster.length * 2.2, (this.tailAdvanceM || 0) + this.tuning.columnSpeedMS * dt);
    if (this.moving && this.legIndex < this.waypoints.length - 1) {
      const a = this.waypoints[this.legIndex];
      const b = this.waypoints[this.legIndex + 1];
      const len = Math.hypot(b.x - a.x, b.z - a.z) || 1;
      this.legT += this.tuning.columnSpeedMS * Math.max(0, dt);
      while (this.legT >= len && this.legIndex < this.waypoints.length - 1) {
        this.legT -= len;
        this.legIndex += 1;
        if (this.legIndex >= this.waypoints.length - 1) { this.arrived = true; this.legT = 0; break; }
      }
    }
    this._UpdateLitters();
    if (now - this.regoalAt < this.tuning.columnRegoalS) return true;
    this.regoalAt = now;
    const dir = this.HeadDirection();
    const right = { x: -dir.z, z: dir.x };
    const scatterSide = this.scattered ? this.tuning.columnScatterM : 0;
    for (const m of this.members) {
      if (!m.handle || !this._Alive(m.handle)) continue;
      const lateral = m.slot.lateral + (this.scattered ? -scatterSide : 0);
      if (this.followRouteBodies && !this.scattered) {
        let distance = this.legT + (this.tailAdvanceM || 0);
        for (let i = 0; i < this.legIndex; i++) distance += Math.hypot(this.waypoints[i + 1].x - this.waypoints[i].x, this.waypoints[i + 1].z - this.waypoints[i].z);
        distance = Math.max(0, distance - m.slot.back);
        if (distance < (m.routeFloorDistance || 0)) {
          const waiting=this.host.PositionOf?.(m.handle);
          if(waiting)this.host.SetGoal?.(m.handle,waiting.x,waiting.z);
          continue;
        }
        let targetLeg = 0;
        while (targetLeg < this.waypoints.length - 2) {
          const length = Math.hypot(this.waypoints[targetLeg + 1].x - this.waypoints[targetLeg].x, this.waypoints[targetLeg + 1].z - this.waypoints[targetLeg].z);
          if (distance <= length) break;
          distance -= length; targetLeg++;
        }
        const position = this.host.PositionOf?.(m.handle);
        m.routeLeg ??= 0;
        const next = this.waypoints[m.routeLeg + 1];
        if (next && position && Math.hypot(position.x - next.x, position.z - next.z) < 1.7 && m.routeLeg < targetLeg) m.routeLeg++;
        const a = this.waypoints[Math.min(m.routeLeg, targetLeg)];
        const b = this.waypoints[Math.min(m.routeLeg, targetLeg) + 1] || a;
        const length = Math.hypot(b.x - a.x, b.z - a.z) || 1;
        const fraction = m.routeLeg < targetLeg ? 1 : Math.min(1, distance / length);
        const x = a.x + (b.x - a.x) * fraction - (b.z - a.z) / length * lateral;
        const z = a.z + (b.z - a.z) * fraction + (b.x - a.x) / length * lateral;
        m.handle.scriptMoveSpeedMps = this.tuning.columnSpeedMS;
        this.host.SetGoal?.(m.handle, x, z);
        continue;
      }
      const x = head.x - dir.x * m.slot.back + right.x * lateral;
      const z = head.z - dir.z * m.slot.back + right.z * lateral;
      this.host.SetGoal?.(m.handle, x, z);
    }
    return true;
  }

  /**
   * 担架实体逐帧跟在前后两个担架员中间（高度 = 垂手握杆的高度）。
   * 任意一名担架员倒下：担架落地、白布伤员跟着落下、幸存者松手（清 carryRole
   * 回普通姿态）—— 这正是一关阶段七与五关「担架员跌倒」要的画面基座。
   */
  _UpdateLitters() {
    if (!this.litters) return;
    for (const litter of this.litters) {
      if (litter.dropped) continue;
      const frontAlive = litter.front.handle && this._Alive(litter.front.handle);
      const rearAlive = litter.rear.handle && this._Alive(litter.rear.handle);
      if (!frontAlive || !rearAlive) {
        litter.dropped = true;
        if (frontAlive) litter.front.handle.carryRole = null;
        if (rearAlive) litter.rear.handle.carryRole = null;
        const at = litter.lastMid;
        if (at && this.host.MoveProp) {
          this.host.MoveProp(litter.propLitter, { x: at.x, y: at.gy + 0.10, z: at.z, rotationY: at.yaw });
          this.host.MoveProp(litter.propBody, { x: at.x, y: at.gy + 0.30, z: at.z, rotationY: at.yaw });
        }
        continue;
      }
      const fp = this.host.PositionOf ? this.host.PositionOf(litter.front.handle) : null;
      const rp = this.host.PositionOf ? this.host.PositionOf(litter.rear.handle) : null;
      if (!fp || !rp) continue;
      const mid = { x: (fp.x + rp.x) / 2, z: (fp.z + rp.z) / 2 };
      const gy = Math.min(fp.y || 0, rp.y || 0);
      const yaw = Math.atan2(fp.x - rp.x, fp.z - rp.z);
      litter.lastMid = { ...mid, gy, yaw };
      this.host.MoveProp?.(litter.propLitter, { x: mid.x, y: gy + 0.62, z: mid.z, rotationY: yaw });
      this.host.MoveProp?.(litter.propBody, { x: mid.x, y: gy + 0.84, z: mid.z, rotationY: yaw });
    }
  }

  State() {
    return {
      started: this.started, moving: this.moving, scattered: this.scattered,
      arrived: this.arrived, leg: this.legIndex, legT: +this.legT.toFixed(1),
      alive: this.Alive.length, total: this.members.length,
      head: this.HeadPosition(), log: this.log.slice(),
      litters: (this.litters || []).map((l) => ({
        dropped: l.dropped,
        carried: !l.dropped && !!l.lastMid,
      })),
    };
  }
}

// ---------------------------------------------------------------------------
// 摆点上下文
//
// 章节数据拿到的就是这一个对象。它做两件事：
//   · 把七个玩法系统与宿主回调包成**判空过的**门面（章节里不写 if (s.carry)）；
//   · 提供 `mem`（这一关的便签本）、`Once`（只做一次）、`After`（几秒之后做）。
// ---------------------------------------------------------------------------

class SetpieceContext {
  constructor(director) {
    this.d = director;
    /** 这一关的便签本。换关清空。 */
    this.mem = director.mem;
  }

  get levelId() { return this.d.levelId; }
  get phase() { return this.d.phase; }
  get tag() { return this.d.levelId; }

  // --- 系统（每一个都可能是 null）-------------------------------------------
  get story() { return this.d.host.Story?.() || null; }
  get carry() { return this.d.host.Carry?.() || null; }
  get interact() { return this.d.host.Interact?.() || null; }
  get emplacement() { return this.d.host.Emplacement?.() || null; }
  get strafe() { return this.d.host.Strafe?.() || null; }
  get flare() { return this.d.host.Flare?.() || null; }
  get telegraph() { return this.d.host.Telegraph?.() || null; }
  get companion() { return this.d.host.Companion?.() || null; }
  get checkpoint() { return this.d.host.Checkpoint?.() || null; }

  // --- 时间与位置 -----------------------------------------------------------
  Time() { return Num(this.d.host.Time?.(), 0); }
  LevelTime() { return Num(this.d.host.LevelTime?.(), 0); }
  PlayerPos() { return this.d.host.PlayerPos?.() || null; }
  PlayerZone() { return this.d.host.PlayerZone?.() || null; }

  /** 本章某个路标（{id,x,z,radius}）。写错 id 返回 null，不抛。 */
  Zone(id) {
    const zones = this.d.phase?.zones || [];
    return zones.find((z) => z && (z.id === id || z.contentZoneId === id
      || z.contentZoneIds?.includes(id))) || null;
  }

  /** 路标附近的一个点。dx/dz 是相对路标圆心的偏移（米）。 */
  Near(zoneId, dx = 0, dz = 0) {
    const zone = this.Zone(zoneId);
    if (!zone) return null;
    return { x: zone.x + dx, y: Num(this.d.host.Ground?.(zone.x + dx, zone.z + dz), 0), z: zone.z + dz };
  }

  // --- 叙事 -----------------------------------------------------------------
  /** 推一条事件。名字在本章 EVENTS 里登记过 —— 这一层不发明名字。 */
  Signal(name) {
    if (!name) return false;
    this.d.signals.push({ name, at: +this.LevelTime().toFixed(1) });
    return !!this.story?.Signal(name);
  }

  /** 这条台词播过没有（key 就是 beat.voice）。 */
  Spoken(key) { return this.d.spoken.has(key); }

  Hint(text, seconds = 3) { this.d.host.Hint?.(text, seconds); }
  Say(who, text, seconds = 3) { this.d.host.Say?.(who, text, seconds); }

  // --- 便签 -----------------------------------------------------------------
  /** 同一个 key 只做一次（跨帧）。返回「这一次做了没有」。 */
  Once(key, fn) {
    if (this.d.once.has(key)) return false;
    this.d.once.add(key);
    fn?.(this);
    return true;
  }

  /** seconds 秒之后做一次。到点由 Update 派发。 */
  After(seconds, fn, key = null) {
    this.d.timers.push({ at: this.Time() + Math.max(0, Num(seconds, 0)), fn, key });
    return true;
  }

  /**
   * 摆一个交互点（自动带上本章的 tag，换关时一把清掉）。
   *
   * **tag 必须写在展开之后。** 交互预制（PickUpLoadInteraction 之类）
   * 返回的对象里带着 `tag: null` 那个默认值 —— 写成 `{ tag, ...spec }`
   * 会被它盖成 null，于是换关时 `Clear(levelId)` 一个都清不掉，
   * 上一关的交互点在新切片的同一坐标上悄悄复活。
   */
  Register(spec) {
    if (!spec || !this.interact) return null;
    return this.interact.Register({ ...spec, tag: spec.tag ?? this.d.levelId });
  }

  /** 摆一件关内道具。宿主没接线时返回 null —— 章节侧不因此报错。 */
  Prop(spec) { return this.d.host.Prop?.({ ...spec, tag: spec.tag ?? this.d.levelId }) || null; }

  /**
   * 把一件东西登记成**可被炸中的实体**（Script_BlastTargets）。
   *
   * 与 `Prop` 是两件事：`Prop` 摆的是**看得见**的那一件，这一条登记的是
   * 「掷弹筒打过来算不算打着它」。两条一般成对写，id 也一律取同一个 ——
   * 出问题时 `Debug.SetpieceProps` 与 `Debug.BlastTargets` 对得上号。
   *
   * tag 一律是本章 levelId，换关由 `Reset` 一把清掉。
   */
  BlastTarget(spec = {}) {
    return BLAST_TARGETS.Register({ ...spec, tag: spec.tag ?? this.d.levelId });
  }

  /**
   * 面朝某个方向的 ry。**与关卡数据 `spawn.ry` / 过场 cast 的 ry 同一个口径**：
   * `ry = atan2(-dx, -dz)`（Data_CutsceneCh5 头上那两行常量就是这么来的：
   * 面朝西 = +π/2，面朝东 = −π/2）。视角接替落地时要用它，不然人是背着战场出生的。
   */
  YawTo(from, to) {
    if (!from || !to) return 0;
    const dx = Num(to.x) - Num(from.x);
    const dz = Num(to.z) - Num(from.z);
    if (Math.abs(dx) < 1e-6 && Math.abs(dz) < 1e-6) return 0;
    return Math.atan2(-dx, -dz);
  }

  /** 造一个演员（后送队、担架员、机枪副射手…）。 */
  SpawnActor(spec) { return this.d.host.SpawnActor?.(spec) || null; }

  /** 建一支后送队（一关与五关共用同一台控制器）。 */
  Column(spec) {
    const column = new EscortColumn(this.d.host, spec);
    this.d.columns.push(column);
    return column;
  }
}

// ---------------------------------------------------------------------------
// A 区三章的环境递进（§0「三个功能院落」）
//
// 「同一个院子三次出场，环境递进：③有序拥挤/电话通/搬药拆门板 → ④伤员剧增/
//  满地绷带血水/医护不足 → ⑤部分坍塌/治疗区被炮毁/熟人缺席/白布担架药箱散落。」
//
// 为什么走**运行时**摆件而不是布设层：Script_ExternalProps / Data_Dressing_* 是
// 按世界坐标铺的，同一只箱子在三关的同一个位置 —— 那正是「同一座城」要的性质，
// 但它表达不了「同一个院子越来越破」。这里只摆**差异**的那几件（每章七八件），
// 院子本身的家底仍由布设层出。
//
// 三章共用一个锚点（第二区公所大院，Data_MissionCh3 头注定的口径），
// 所以坐标一律写成「相对锚点的偏移」——锚点挪了这一整张表跟着挪。
// ---------------------------------------------------------------------------

const AID_YARD = {
  // ③ 有序：门板靠墙码着、药箱成堆、电话线顺墙根拉进来。
  CH3_Jiuhusuo: {
    zone: "C3_AidStation",
    props: [
      { id: "a3_plankStack", kind: "debris", dx: -10, dz: -11, color: 0x8b7350, note: "拆下来待用的门板，码成一摞" },
      { id: "a3_medStack1", kind: "box", dx: 6.5, dz: -4.0, color: 0x7a6a4c, note: "药箱（满的）" },
      { id: "a3_medStack2", kind: "box", dx: 7.4, dz: -4.8, color: 0x7a6a4c, note: "药箱（满的）" },
      { id: "a3_medStack3", kind: "box", dx: 6.9, dz: -5.6, color: 0x7a6a4c, note: "药箱（满的）" },
      { id: "a3_litter1", kind: "stretcher", dx: 3.0, dz: 4.5, ry: 0.18, note: "空担架，靠墙立着" },
      { id: "a3_litter2", kind: "stretcher", dx: 4.4, dz: 5.2, ry: -0.12, note: "空担架" },
      { id: "a3_phonePost", kind: "box", dx: 12.5, dz: 1.0, size: [0.16, 1.5, 0.16], color: 0x5a4a35, note: "拉电话线的木杆" },
      { id: "a3_paper", kind: "panel", dx: -3.0, dz: 12.0, texture: "./Texture/Tex_PaperLetter.png",
        size: [0.26, 0.34], note: "墙边那张南京暴行旧报纸" },
    ],
  },
  // ④ 挤满：担架铺了一地、绷带与血水、药箱少了一半。**门板还是那几块**（③ 拆的）。
  CH4_DongguanYe: {
    zone: "C4_AidStation",
    props: [
      { id: "a4_plankStack", kind: "debris", dx: -10, dz: -11, color: 0x8b7350, note: "还是三关拆的那几块门板，靠在墙根" },
      { id: "a4_litter1", kind: "stretcher", dx: 2.0, dz: 2.5, ry: 0.05, note: "占着的担架" },
      { id: "a4_litter2", kind: "stretcher", dx: 4.2, dz: 2.2, ry: -0.04, note: "占着的担架" },
      { id: "a4_litter3", kind: "stretcher", dx: 6.4, dz: 2.6, ry: 0.09, note: "占着的担架" },
      { id: "a4_litter4", kind: "stretcher", dx: 2.4, dz: 5.0, ry: -0.07, note: "占着的担架" },
      { id: "a4_litter5", kind: "stretcher", dx: 4.8, dz: 5.4, ry: 0.02, note: "占着的担架" },
      // 绷带与血水：一块贴地的暗色板。**不做血雾、不做特写** —— §5 明写无镜头特写。
      { id: "a4_bloodFloor", kind: "plane", dx: 4.0, dz: 3.8, size: [7.5, 5.5], color: 0x4a2b26,
        note: "满地绷带与血水" },
      { id: "a4_medStack1", kind: "box", dx: 6.9, dz: -5.6, color: 0x7a6a4c, note: "药箱 —— 只剩这一只（三关有三只）" },
    ],
  },
  // ⑤ 废墟：塌了半边、药箱空着、电话线断在门框上、白布担架。
  CH5_Chengqiang: {
    zone: "C5_AidRuin",
    props: [
      { id: "a5_rubble1", kind: "debris", dx: 8.0, dz: -8.0, size: [4.2, 1.1, 3.4], color: 0x6f665a, note: "塌下来的半边房" },
      { id: "a5_rubble2", kind: "debris", dx: 10.5, dz: -5.0, size: [2.6, 0.8, 2.2], color: 0x6f665a },
      { id: "a5_rubble3", kind: "debris", dx: 6.0, dz: -10.5, size: [2.0, 0.6, 1.8], color: 0x6f665a },
      { id: "a5_plankStack", kind: "debris", dx: -10, dz: -11, color: 0x8b7350, note: "门板担架还在（三关拆的那几块）" },
      { id: "a5_medEmpty1", kind: "box", dx: 6.9, dz: -5.6, color: 0x40372a, note: "药箱：空的，盖子敞着" },
      { id: "a5_medEmpty2", kind: "box", dx: 5.2, dz: -3.0, ry: 0.7, color: 0x40372a, note: "药箱：翻倒的" },
      { id: "a5_phonePost", kind: "box", dx: 12.5, dz: 1.0, size: [0.16, 0.9, 0.16], color: 0x5a4a35,
        note: "电话线断在门框上 —— 杆子只剩半截" },
      { id: "a5_bloodFloor", kind: "plane", dx: 4.0, dz: 3.8, size: [7.5, 5.5], color: 0x3d2621,
        note: "四关那一地绷带血水，干了" },
    ],
  },
};

/**
 * 摆这一章的 A 区差异件。**只摆差异**，院子本身的家底归布设层。
 * 锚点取不到（切片里没有这个路标）就一件不摆，不报错。
 */
// ---------------------------------------------------------------------------
// 二关阶段③：可被打中的弹药箱 + 殉爆倒计时
//
// 「掷弹筒专找弹药箱」。这一段以前是空的 —— 场上没有一只打得中的箱子
//（`CookingCrate()` 恒返回 null，§10.7 的施工单第一条）。现在的链路是：
//
//   摆点层 Setup           → s.Prop（看得见的那只箱子）
//                          + s.BlastTarget（打得中的那只箱子）
//   掷弹筒/手榴弹炸过来     → Script_Combat.Blast → Script_Destruction.Blast
//                          → BLAST_TARGETS.Blast → 这只箱子的 OnDestroyed
//   OnDestroyed            → 只记一笔（回调是在 destruction 改拓扑的**半路**上
//                            被调的，这里做任何演出都等于在别人的栈上加戏）
//   下一帧的 Update        → 起烟、喊话、开倒计时；玩家拖出 6 m 算救下，否则殉爆
//
// **不自己算伤害。** 谁被炸着由 destruction 报，殉爆那一下走宿主的 Detonate /
// Shell（与日军自己的炮弹同一条爆炸链路），这一层只负责「摆」与「计时」。
// ---------------------------------------------------------------------------

/** 一只可拖、可被打中的弹药箱。返回它的 id。 */
function StageCrate(s, id, at, note = "") {
  if (!at) return null;
  s.Prop({ id, kind: "box", position: at, color: 0x6b5a41, note });
  s.BlastTarget({
    id, x: at.x, y: at.y, z: at.z,
    radius: s.d.tuning.crateRadiusM, hp: s.d.tuning.crateHp,
    // **只记事实，不做演出。** 见上面那段链路注释。
    // 位置取 `info.where`（登记表里那一件此刻在哪儿）而不是闭包里的 at ——
    // 玩家正抬着它的时候被打中，烟该冒在他怀里，不是冒在箱子原来摆的地方。
    //
    // **排队，不是覆盖。** 殉爆那一下会把旁边两只一起打穿（这是对的：一箱手榴弹
    // 炸开就是会引燃隔壁），一次覆盖式的赋值会让其中一只**再也不冒烟**——
    // 场上少了一只箱子，却什么都没发生。
    OnDestroyed: (info) => {
      s.mem.cookQueue = s.mem.cookQueue || [];
      s.mem.cookQueue.push({
        id, hitBy: info.kind,
        at: { x: info.where.x, y: info.where.y, z: info.where.z },
      });
    },
  });
  s.Register(PickUpLoadInteraction({
    id: `${id}_take`, position: at, kindId: "ammoCrate",
    label: "拖走这一箱", carry: s.carry, once: false,
    options: { label: "手榴弹箱", payload: { crateId: id, damp: false } },
    // 抬起来那一刻把地上那只藏掉，不然「手上抬着一只、原地还摆着一只」。
    // 放下的时候由 UpdateCrateCookoff 在落点补一只回来。
    OnComplete: () => { s.d.host.SetPropState?.(id, "removed"); },
  }));
  return id;
}

/** 箱子落地：在落点补一只看得见的回来（原来那只在抬起时藏掉了）。 */
function DropCrateProp(s, cook) {
  cook.moves = (cook.moves || 0) + 1;
  // 反复抬起放下不许无限摆件：三次之后就用同一个 id 覆盖（Prop 重名直接返回旧的）。
  const n = Math.min(3, cook.moves);
  return s.Prop({ id: `${cook.id}_at${n}`, kind: "box", position: cook.at, color: 0x6b5a41 });
}

/** 这一帧玩家手上抬着的是不是那只冒烟的箱子。 */
function CarryingCrate(s, crateId) {
  const view = s.carry?.View?.();
  return !!(view && view.payload && view.payload.crateId === crateId);
}

/**
 * 殉爆。**优先走宿主的 `Detonate`**（一次立刻发生的爆炸，与日军的炮弹同一条
 * Combat.Blast）；没接线时退到 `Shell` —— 它走 CallIncoming，带 shellFlightS 的
 * 飞行时间与一声呼啸，所以调用方要提前那么多秒下单。两条都缺就只剩火与烟。
 */
function DetonateCrate(s, at) {
  if (s.d.host.Detonate) {
    s.d.host.Detonate({
      at, radius: s.d.tuning.cookoffRadiusM, damage: s.d.tuning.cookoffDamage, kind: "shell",
    });
    return "detonate";
  }
  if (s.d.host.Shell) { s.d.host.Shell({ at, count: 1 }); return "shell"; }
  return "none";
}

/** 每帧推一下二关的殉爆状态机。 */
function UpdateCrateCookoff(s) {
  const T = s.d.tuning;
  // ⓪ 抬着的那一只跟着人走 —— **不管它有没有在烧**。它在你怀里，照样打得中，
  //    「抱着一箱手榴弹在巷子里挨了一发」本来就该是这一关能发生的事。
  const held = s.carry?.View?.()?.payload?.crateId || null;
  if (held) {
    const p = s.PlayerPos();
    if (p) BLAST_TARGETS.MoveTo(held, p.x, p.z, p.y);
  }

  // ① 立案：destruction 在上一帧报了「这只箱子被打穿了」。
  //    **一次只烧一只** —— 两只同时冒烟的话玩家只来得及拖一只，
  //    那不是难度，是设计上没想清楚该拖哪一只。排队的那几只挨个来
  //    （殉爆引燃隔壁是这一关该有的样子，但要一只一只演）。
  if (s.mem.cookQueue && s.mem.cookQueue.length && !s.mem.cooking) {
    const req = s.mem.cookQueue.shift();
    s.mem.cooking = {
      id: req.id, at: { ...req.at }, from: { ...req.at },
      until: s.Time() + T.crateFuseS, saved: false,
    };
    s.mem.cookCount = (s.mem.cookCount || 0) + 1;
    // 冒烟走火墙那条现成的烟源（**不伤人**：现在烧的是箱子，不是路）。
    s.d.host.Firewall?.({
      id: `${req.id}_smoke`, from: req.at, to: req.at,
      seconds: T.crateFuseS + 0.6, damagePlayer: false,
    });
    s.Hint("箱子冒烟了 —— 拖开！", 4.0);
    s.Say("赵德贵", "箱子拖开！", 2.2);
    // 退路那条要提前下单，响声才落在倒计时归零那一刻。
    if (!s.d.host.Detonate) {
      s.After(Math.max(0, T.crateFuseS - T.shellFlightS), (ss) => {
        const cook = ss.mem.cooking;
        // 拖走了就别炸了 —— 这一发是给「没拖走」准备的。
        if (!cook || cook.id !== req.id || cook.saved) return;
        DetonateCrate(ss, cook.at);
        cook.fired = true;
      }, `ch2_cookShell_${req.id}_${s.mem.cookCount}`);
    }
  }
  const cook = s.mem.cooking;
  if (!cook) return;

  // ② 抬着走：冒烟那只的落点跟着人走（登记表那一侧在 ⓪ 已经挪过了）。
  const carried = CarryingCrate(s, cook.id);
  if (carried) {
    const p = s.PlayerPos();
    if (p) cook.at = { x: p.x, y: p.y, z: p.z };
  } else if (cook.wasCarried) {
    // 中途放下了（F，或者被打断）：在落点补一只看得见的回来。
    DropCrateProp(s, cook);
  }
  cook.wasCarried = carried;
  const moved = Math.hypot(cook.at.x - cook.from.x, cook.at.z - cook.from.z);

  // ③ 拖出 6 m 算救下。**判的是箱子走了多远，不是玩家走了多远** ——
  //    空着手跑开六米不算把箱子拖开了。
  if (carried && moved >= T.crateSafeM) {
    cook.saved = true;
    cook.wasCarried = false;
    s.mem.cooking = null;
    s.mem.cratesSaved = (s.mem.cratesSaved || 0) + 1;
    BLAST_TARGETS.Remove(cook.id);
    s.carry?.Drop("cratePulled");
    s.Prop({ id: `${cook.id}_safe`, kind: "box", position: cook.at, color: 0x5c4c36 });
    s.Hint("拖出来了。", 2.4);
    return;
  }

  // ④ 到点：殉爆。抬着它的人一起吃 —— 这是「拖」这件事的赌注。
  if (s.Time() >= cook.until) {
    s.mem.cooking = null;
    s.mem.cratesBlown = (s.mem.cratesBlown || 0) + 1;
    BLAST_TARGETS.Remove(cook.id);
    s.d.host.SetPropState?.(cook.id, "removed");
    // 中途放下时补的那几只也一起摘掉 —— 炸完还剩一只完好的箱子在原地是穿帮。
    for (let n = 1; n <= 3; n += 1) s.d.host.SetPropState?.(`${cook.id}_at${n}`, "removed");
    if (carried) s.carry?.ForceRelease("cookoff");
    if (!cook.fired) DetonateCrate(s, cook.at);
    // 炸完那一片烧起来（对玩家有伤害 —— 一箱手榴弹炸完不会只留个坑）。
    s.d.host.Firewall?.({
      id: `${cook.id}_fire`, from: cook.at,
      to: { x: cook.at.x + 3.2, y: cook.at.y, z: cook.at.z + 1.4 },
      seconds: 14, damagePlayer: true,
    });
    s.Hint("那一箱炸了。", 2.6);
  }
}

// ---------------------------------------------------------------------------
// 三关 ER-4：可跟随的电话线（那条线**本身就是路标**）
//
// 「HUD 只给方向不给箭头，线本身就是路标。」以前这句话是空的 —— 场上没有线，
// 「沿电话线前进」只是一行任务文字。
//
// 做法：沿本章路标那一串**贴地**铺一条线（策划案原话「样条，贴墙根与地面」）。
// 走的是运行时轻量摆件那条口子，所以有两条硬约束要守：
//   · 每件一次 draw call —— 线分段不能按米切，一段三四十米，中点采一次地面高度；
//   · 换关一把清掉。
// 断点处不接上：两个断头之间空开一截，玩家自己看得见「线断在这儿」。
//
// **本章的运行时摆件因此涨到 28 件**（A 区差异件 8 + 幸存者 3 + 线 17），
// 超过 Script_Main 那条口子注释里写的「一章十来件」。这一次是有意超的：
// 那条口径当时只覆盖「同一个院子越来越破」的差异件，而一条四百米长的线
// 本来就不是几件东西。代价可数：28 次 draw call、不投影、不进 prepass、
// 不进碰撞导航流送，而开机红线是 5000 —— 它连零头都不到。
// 真要压回去，把 segMaxM 调大或把 A 区那几件搬去布设层，两条都不动这里的逻辑。
//
// **不做**：真正的样条几何（RoadSpline/WallSpline 是建场时的批次几何，
// 它们出的是烘进场景的路与墙，表达不了「这一关这条线断在哪儿」）。
// ---------------------------------------------------------------------------

/**
 * 沿 points 铺一条贴地的线。
 * @returns 摆下去的件数
 */
function LayWire(s, id, points, opts = {}) {
  // 一段最长多少米。**这是一条画面预算** —— 每段一次 draw call，
  // 而运行时摆件那条口子的口径是「一章十来件」。38 m 一段是妥协出来的：
  // 再长，贴地的那一根在起伏上会浮起来；再短，一条街就吃掉几十个 draw call。
  const segMaxM = Num(opts.segMaxM, 38);
  const lift = Num(opts.lift, 0.06);
  const color = opts.color ?? 0x241f1b;
  const thick = Num(opts.thick, 0.07);
  let n = 0;
  let seg = 0;
  for (let i = 0; i + 1 < points.length; i += 1) {
    const a = points[i];
    const b = points[i + 1];
    const total = Math.hypot(b.x - a.x, b.z - a.z);
    if (!(total > 0.5)) continue;
    const parts = Math.max(1, Math.ceil(total / segMaxM));
    for (let k = 0; k < parts; k += 1) {
      const t0 = k / parts;
      const t1 = (k + 1) / parts;
      const from = { x: a.x + (b.x - a.x) * t0, z: a.z + (b.z - a.z) * t0 };
      const to = { x: a.x + (b.x - a.x) * t1, z: a.z + (b.z - a.z) * t1 };
      const len = Math.hypot(to.x - from.x, to.z - from.z);
      const mx = (from.x + to.x) / 2;
      const mz = (from.z + to.z) / 2;
      const y = Num(s.d.host.Ground?.(mx, mz), 0) + lift;
      // 盒子的长边在局部 +X 上；绕 Y 转 θ 把 +X 转到 (dx,dz)：θ = atan2(-dz, dx)。
      const ry = Math.atan2(-(to.z - from.z), to.x - from.x);
      const made = s.Prop({
        id: `${id}_${seg}`, kind: "box", size: [len, thick, thick],
        position: { x: mx, y, z: mz }, rotationY: ry, color,
      });
      if (made) n += 1;
      seg += 1;
    }
  }
  return n;
}

/** 一根电线杆（贴地那条线的支点，也是「这儿有条线」的读法）。 */
function WirePost(s, id, at, height = 2.6, color = 0x4a3f2f) {
  if (!at) return null;
  return s.Prop({
    id, kind: "box", size: [0.16, height, 0.16],
    position: { x: at.x, y: Num(at.y, 0), z: at.z }, color,
  });
}

// ---------------------------------------------------------------------------
// 三关 ER-6：幸存者实体（「这边还有活的！」那一拍要有人可救）
//
// 「屋内散布 4—6 名幸存者，能走的交互一次即跟随幺娃走。」以前这一段只有
// 「屋内清空」那条闸（§10.7 施工单第三条：缺一类「躺着的、能被交互的人」）。
//
// 这一层能拿到的三样东西：`Prop`（躺着那一具的可见体）、`carry` 的 `wounded`
// 档（背起来 —— 走得慢、打不了枪，这正是「搀扶」该有的代价）、`SpawnActor`
// （交出去之后自己走的那一个）。三样拼起来就是一条完整的救人回路，
// **一行新玩法都不用写**（摆点层纪律第二条）。
//
// 交给谁：`companion.Locate("yaowa")` —— 幺娃在哪儿，交接点就在哪儿
//（策划案原话「能走的交给幺娃」）。他不在场时退到 A 区方向的固定点。
// ---------------------------------------------------------------------------

const CH3_SURVIVORS = [
  { id: "ch3_surv1", dx: -3.2, dz: 2.6, ry: 0.35, note: "靠着门框，腿上一道" },
  { id: "ch3_surv2", dx: 1.8, dz: -1.4, ry: -1.10, note: "趴在担架旁边，还有气" },
  { id: "ch3_surv3", dx: 4.6, dz: 3.2, ry: 0.90, note: "被压在翻倒的门板下头" },
];

/** 屋里那两三个还活着的人。**只摆躯体**，交互等「这边还有活的！」那一拍再开。 */
function PlaceSurvivorBodies(s) {
  let n = 0;
  for (const item of CH3_SURVIVORS) {
    const at = s.Near("C3_ForwardAid", item.dx, item.dz);
    if (!at) break;
    // 躺着的人：一具人形大小、军装色的躯体。**不是白布** —— 白布那一档
    // （shroudedBody）是盖死人的，五关 A 区罗班长那一副才是它。
    const made = s.Prop({
      id: item.id, kind: "debris", size: [0.54, 0.34, 1.84],
      position: at, rotationY: item.ry, color: 0x6b6350, note: item.note,
    });
    if (made) n += 1;
    s.mem.survivorAt = s.mem.survivorAt || {};
    s.mem.survivorAt[item.id] = at;
  }
  s.mem.survivorCount = n;
  return n;
}

/** 开搀扶。事实（那一句喊出来了）与兜底（屋里清空了）走同一个 Once。 */
function OpenSurvivorRescue(s) {
  s.Once("ch3_survivors", (ss) => {
    const spots = ss.mem.survivorAt || {};
    ss.mem.survivorsSaved = 0;
    ss.mem.survivorsTotal = Object.keys(spots).length;
    if (!ss.mem.survivorsTotal) return;
    // 交接点：幺娃站的地方。他不在场（选章直跳、名额满了）时退到侧门方向。
    const HandoffAt = () => ss.companion?.Locate?.("yaowa")
      || ss.Near("C3_ForwardAid", -8, -6);
    for (const [id, at] of Object.entries(spots)) {
      ss.Register(PickUpLoadInteraction({
        id: `${id}_lift`, position: at, kindId: "wounded",
        label: "搀起他", carry: ss.carry,
        options: {
          label: "还能走的伤兵", canDrop: true, payload: { survivor: id },
          note: "背着人 —— 走不快，也打不了",
        },
        OnComplete: () => { ss.d.host.SetPropState?.(id, "removed"); },
      }));
    }
    ss.Register(GiveSupplyInteraction({
      id: "ch3_survivorHandoff", Anchor: HandoffAt, item: "伤兵", label: "交给幺娃",
      Has: () => !!ss.carry?.View?.()?.payload?.survivor,
      OnComplete: () => {
        const who = ss.carry?.View?.()?.payload?.survivor || null;
        ss.carry?.Drop("handedOver");
        ss.mem.survivorsSaved = (ss.mem.survivorsSaved || 0) + 1;
        // 交出去之后他自己走：往撤回 A 区那个方向。**不做群体避障**
        //（与后送队同一条口径），能走出这条街就够了。
        const at = HandoffAt();
        const back = ss.Zone("C3_AidReturn") || ss.Zone("C3_EastGateOut");
        if (at && back) {
          const handle = ss.SpawnActor({
            label: "还能走的伤兵", x: at.x + 1.2, z: at.z + 0.8, weapon: null, squadId: "Ch3Survivors",
          });
          if (handle) {
            ss.mem.walkers = ss.mem.walkers || [];
            ss.mem.walkers.push({ handle, to: { x: back.x, z: back.z }, who });
          }
        }
        if (ss.mem.survivorsSaved >= ss.mem.survivorsTotal) {
          ss.Hint("能走的都交到幺娃手里了。", 3.2);
        } else {
          ss.Hint(`交出去 ${ss.mem.survivorsSaved} 个，还有 ${ss.mem.survivorsTotal - ss.mem.survivorsSaved} 个。`, 2.6);
        }
      },
      once: false,
    }));
  });
}

/** 交出去的那几个自己往回走。每 columnRegoalS 重设一次目标（每帧写＝每帧打断寻路）。 */
function UpdateWalkers(s) {
  const list = s.mem.walkers;
  if (!list || !list.length) return;
  const now = s.Time();
  if (now - (s.mem.walkerRegoalAt || -99) < s.d.tuning.columnRegoalS) return;
  s.mem.walkerRegoalAt = now;
  for (const w of list) {
    if (!w.handle) continue;
    if (s.d.host.Alive && !s.d.host.Alive(w.handle)) continue;
    s.d.host.SetGoal?.(w.handle, w.to.x, w.to.z);
  }
}

// ---------------------------------------------------------------------------
// 四关阶段⑧：罗班长救顺子（固定战场事件 4—6 秒）
//
// 策划案原文：「炮弹击中侧墙 → 墙塌、玩家被冲击波击倒、武器脱手、视角贴地、
// 日军从烟尘中接近补刺 → 罗班长用通用近战动作撞开敌人、拖顺子离开 →
// 日军火力射来、罗班长腹部中弹。玩家很快恢复控制。」
//
// INT2 只接上了三件：无敌窗、检查点、台词（§10.7 施工单第五条 ——
// 「缺的是那一段的**动作表演**」）。这一轮补的就是那一段，规矩没变：
//
//   · **不夺移动权。** 这里一帧都不锁视角、不锁走路。「被掀翻」是把姿态压成卧姿
//     （GroundPov 走的是现成的 prone），玩家想爬起来随时爬得起来；
//   · **武器脱手走负重层**，不新造一个「禁火」状态：carry 的 `wounded` 档本来就
//     「两只手都占着 —— 枪背在背上」，Script_Main 的开火路径见 carry.Blocking 就 return。
//     四五秒之后脚本自己 ForceRelease 把枪还回去，另有一道看门狗兜底；
//   · **墙塌走 destruction**：一发真炮弹落在侧墙上（host.Shell → Combat.CallIncoming
//     → Combat.Blast → Destruction.Blast），碎裂、破口、碎片、重烘导航全是现成的。
//     炮弹有 shellFlightS 的飞行时间，所以整段从「下单」到「落地」要留出那一段；
//   · **罗班长走演员**：Detach 掉跟随，然后每半秒把他的 goal 写到玩家脚下 ——
//     他是自己跑过来的，不是瞬移过来的；
//   · **超时自动放行**：到点无论走到哪一步，一律还枪、关无敌、收尾。
//
// 还欠一件（登记在 Data_MissionCh4 头注 ENGINE_REQUEST 3）：「日军**一名**从烟尘里
// 接近再被撞开」需要点名一个日军演员，而装配层的 `SpawnActor` 写死 `ai.Spawn("nra")`，
// `EnemiesNear` 只回个数不回句柄 —— 这一层够不着任何一个日军个体。现在那半秒
// 用声音演（脚步 → 拉栓 → 撞击 → 倒地），画面上是烟。
// ---------------------------------------------------------------------------

/**
 * 这一段的时刻表（秒，相对事件起点）。改这里就是改节奏，别去动散在下面的数。
 * 全长 releaseS = 5.4 s，落在策划案的「4—6 秒」里。
 */
const CH4_SAVE = Object.freeze({
  whistleS: 0.0,        // 呼啸（炮弹在路上）
  hitS: 1.2,            // 炮弹落在侧墙上：爆炸声 + 墙塌 + 尘烟 + 击倒 + 脱手
  ijaNearS: 2.0,        // 烟尘里那一步脚步声
  ijaBoltS: 2.6,        // 一声拉栓（他要补刺了）
  luoHitsS: 3.2,        // 罗班长撞开他
  dragS: 3.8,           // 抓着领子把你往后拖
  weaponBackS: 4.4,     // 枪捡回来
  releaseS: 5.4,        // 无敌窗关、整段放行
  invulnS: 6.2,         // 无敌窗给够（放行之后还留一点余量）
  groundPovS: 3.2,      // 贴地视角持续多久
  wallOffsetM: 7.5,     // 侧墙离玩家多远
  blastRadiusM: 4.5,    // 墙那一下的爆炸半径（够拆一段寨墙，够不着后头的人）
  blastEnergy: 260,     // 砖石墙面的 health 是 270 —— 一发到位，一发也只到位一段
});

/** 罗班长救顺子：整段的启动。事实与兜底都走这一个 Once。 */
function BeginCh4Rescue(s) {
  s.Once("ch4_luoSaves", (ss) => {
    const now = ss.Time();
    ss.mem.rescueAt = now;
    // ① 先打检查点：这四到六秒里被打倒走**倒带**，不走死亡链路。
    ss.checkpoint?.Save();
    ss.d.host.SetPlayerInvulnerable?.(true, CH4_SAVE.invulnS);
    // ② 推事件：env beat「炮弹打在侧墙上。墙塌下来，你被掀翻，枪脱了手。」挂在它上面。
    ss.Signal("C4_LuoSaves");
    // ③ 炮弹在路上。落点取玩家侧后方的墙线。
    //
    //    **为什么不走 host.Shell。** Shell = Combat.CallIncoming("artillery")，
    //    radius 11 / damage 160、落点还带 ±3.5 m 抖动 —— 玩家有无敌窗，
    //    可**罗班长与幺娃就跟在他身后**，这一发很可能在他自己的戏之前先把他炸死，
    //    而这一段之后整关都要靠他俩（carryLeader）。
    //    并且它买不到墙塌：`GAMEPLAY_DESTRUCTION_ENABLED` 现在是 false，
    //    正片里 Destruction.Blast 直接被 Enabled 那道闸挡掉。
    //    所以这里只呼啸 + 爆炸声 + 尘烟；真要拆墙的那一下走可选的 `Detonate`
    //    （半径 4.5 / 能量 260：够打穿一段砖石墙面 health 270，够不着后头的人），
    //    等破坏总闸向正片放行时它就自己变成真的塌。
    const p = ss.PlayerPos();
    const wall = p
      ? { x: p.x + CH4_SAVE.wallOffsetM, y: p.y, z: p.z - 2.0 }
      : ss.Near("C4_NarrowLane", CH4_SAVE.wallOffsetM, -2.0);
    ss.mem.rescueWall = wall;
    ss.d.host.PlaySfx?.("shellIncoming", { position: wall, volume: 0.9 });

    // ④ 落地那一刻：炸声 + 墙塌 + 尘烟 + 击倒 + 脱手 + 罗班长动身。
    ss.After(CH4_SAVE.hitS, (c) => {
      const at = c.mem.rescueWall;
      c.d.host.PlaySfx?.("explosionNear", { position: at, volume: 1.0 });
      c.d.host.Detonate?.({
        at, radius: CH4_SAVE.blastRadiusM, damage: CH4_SAVE.blastEnergy, kind: "shell",
      });
      // 尘烟：走火墙那条现成的烟源，**不伤人**（这是灰，不是火）。
      if (at) c.d.host.Firewall?.({ id: "ch4_wallDust", from: at, to: at, seconds: 7, damagePlayer: false });
      // 被掀翻：压成卧姿。**玩家仍然能动** —— 想爬起来就爬得起来。
      c.d.host.GroundPov?.({ seconds: CH4_SAVE.groundPovS, blackOut: false });
      // 武器脱手：占住手，几秒内打不了枪（见上面那段注释）。
      c.carry?.Begin("wounded", {
        label: "枪脱了手", note: "手上空的 —— 先起来",
        canDrop: false, refuseLine: "枪甩出去了！", payload: { scripted: "ch4_disarm" },
      });
      c.d.host.PlaySfx?.("bodyFall", { volume: 0.7 });
      // 罗班长从跟随里脱出来，直接往玩家脚下跑。
      c.companion?.Detach("luo");
      c.mem.rescueTracking = true;
    }, "ch4_rescueHit");

    // ⑤ 烟尘里的那一个（声音演，见上面的 ENGINE_REQUEST 说明）。
    ss.After(CH4_SAVE.ijaNearS, (c) => c.d.host.PlaySfx?.("footstepRubble", { volume: 0.85 }), "ch4_rescueStep");
    ss.After(CH4_SAVE.ijaBoltS, (c) => c.d.host.PlaySfx?.("bolt", { volume: 0.8 }), "ch4_rescueBolt");
    ss.After(CH4_SAVE.luoHitsS, (c) => {
      c.d.host.PlaySfx?.("impactFlesh", { volume: 0.75 });
      c.d.host.PlaySfx?.("bodyFall", { volume: 0.6 });
    }, "ch4_rescueShove");
    ss.After(CH4_SAVE.dragS, (c) => {
      c.d.host.PlaySfx?.("footstepRubble", { volume: 0.6 });
      c.Hint("他把你往后拖。", 2.2);
    }, "ch4_rescueDrag");

    // ⑥ 枪还回来。**这是整段唯一必须发生的一件事** —— 看门狗在 Update 里还有一道。
    ss.After(CH4_SAVE.weaponBackS, (c) => EndCh4Disarm(c), "ch4_rescueArmed");
    ss.After(CH4_SAVE.releaseS, (c) => EndCh4Rescue(c, "timetable"), "ch4_rescueRelease");
  });
}

/** 把枪还回去。重复调是安全的（没占着手就什么都不做）。 */
function EndCh4Disarm(s) {
  const view = s.carry?.View?.();
  if (view && view.payload && view.payload.scripted === "ch4_disarm") {
    s.carry?.ForceRelease("rearmed");
    s.Hint("枪捡回来了。", 2.0);
    return true;
  }
  return false;
}

/** 整段收尾：还枪、关无敌、停掉「罗班长追着玩家跑」。超时也走这一条。 */
function EndCh4Rescue(s, why = "done") {
  if (s.mem.rescueEnded) return false;
  s.mem.rescueEnded = why;
  EndCh4Disarm(s);
  s.d.host.SetPlayerInvulnerable?.(false);
  s.mem.rescueTracking = false;
  s.companion?.Attach("luo");
  return true;
}

/** 每帧：罗班长往玩家脚下跑 + 超时看门狗。 */
function UpdateCh4Rescue(s) {
  const began = s.mem.rescueAt;
  if (!began) return;
  const now = s.Time();
  // 罗班长的演员：半秒一次重设目标（每帧写目标 = 每帧打断寻路）。
  if (s.mem.rescueTracking && now - (s.mem.rescueGoalAt || -99) >= s.d.tuning.columnRegoalS) {
    s.mem.rescueGoalAt = now;
    const handle = s.companion?.Handle?.("luo");
    const p = s.PlayerPos();
    if (handle && p) s.d.host.SetGoal?.(handle, p.x, p.z);
  }
  // 看门狗：定时器被别的路径吞掉时（换关、过场打断、异常），这一条照样把枪还回去。
  // **不许出现「事件演完了枪还在地上」** —— 那一关从此打不动。
  if (!s.mem.rescueEnded && now - began > CH4_SAVE.releaseS + 2.0) {
    EndCh4Rescue(s, "watchdog");
  }
}

// ---------------------------------------------------------------------------
// 五关阶段⑪：最终白刃的两条终局手感
//
// 策划案：「两侧夹击、**体力无法完全恢复**、弹药越来越少、无小队救援、
// 活动空间缩小。守不住整条街。」INT2 只接上了钉关与判定（§10.7 施工单第六条：
// 「这两条是玩家参数与 AI 压迫曲线」）。
//
// **章节作用域，一个全局数都不动。** 两条都走宿主动词，参数只在
// SETPIECE_TUNING 的 lastStand* 那一组里，而且都在这一章结束时**还原**：
//   · 体力：`SetStaminaCeiling(v)` —— 恢复的上限，不是消耗速度。
//     Script_Player 的 `stamina = Clamp01(stamina + ...)` 那一行的上限从 1 变成 v，
//     「跑一段、喘不匀、再跑一段更短」就是它。DIFFICULTY.staminaSeconds 一个字不改。
//   · 波次：`SpawnEnemy({x,z})` —— 从机枪位两侧的院门各上来几个，间隔越收越紧。
//     tuning.ijaSpawn 已经是 ["west","south"] 两侧，这一层加的是**时序**。
//
// 两条宿主动词现在都还没接线（装配层不在本批的可改范围内），所以这一段现在
// 静默不发生 —— 与摆点层其余每一条的降级方式一致。要它们发生，Script_Main 的
// setpieces host 里各加一行（照抄下面注释里的签名），这张表一个字都不用改。
// ---------------------------------------------------------------------------

/** 终局开始（顺子转身回去那一拍）。 */
function BeginCh5LastStand(s) {
  s.Once("ch5_lastStand", (ss) => {
    ss.mem.lastStandAt = ss.Time();
    ss.mem.staminaCeil = 1;
    ss.mem.waveAt = ss.Time();
    ss.mem.waveGap = ss.d.tuning.lastStandWaveS;
    ss.mem.waves = 0;
    ss.mem.waveSpawned = 0;
  });
}

/** 终局收束：把借来的两样东西还回去（体力上限、波次时钟）。 */
function EndCh5LastStand(s) {
  if (!s.mem.lastStandAt) return false;
  s.mem.lastStandAt = 0;
  if (s.mem.staminaCeil !== 1) {
    s.mem.staminaCeil = 1;
    s.d.host.SetStaminaCeiling?.(1);
  }
  return true;
}

function UpdateCh5LastStand(s) {
  const began = s.mem.lastStandAt;
  if (!began) return;
  const T = s.d.tuning;
  const now = s.Time();

  // ① 体力恢复上限逐档往下压，压到 lastStandStaminaFloor 为止。
  //    **不碰消耗速度** —— 那是全作手感（DIFFICULTY.staminaSeconds）。
  const steps = Math.floor((now - began) / T.lastStandStaminaStepS);
  const want = Math.max(T.lastStandStaminaFloor, 1 - steps * T.lastStandStaminaStep);
  if (Math.abs(want - (s.mem.staminaCeil ?? 1)) > 1e-3) {
    s.mem.staminaCeil = want;
    s.d.host.SetStaminaCeiling?.(want);
  }

  // ② 两侧压上的波次。间隔每过一波乘 lastStandWaveTighten —— 越打越密。
  if (now - s.mem.waveAt < s.mem.waveGap) return;
  s.mem.waveAt = now;
  s.mem.waveGap = Math.max(8, s.mem.waveGap * T.lastStandWaveTighten);
  s.mem.waves = (s.mem.waves || 0) + 1;
  const nest = s.Zone("C5_GunNest");
  if (!nest || !s.d.host.SpawnEnemy) return;
  // 长街沿 X 走（z≈0），所以「两侧」= ±Z 的那两排院门；东边（+X）是他们来的方向。
  for (let side = -1; side <= 1; side += 2) {
    for (let i = 0; i < T.lastStandWaveCount; i += 1) {
      const x = nest.x + 14 + i * 3.4;
      const z = nest.z + side * T.lastStandFlankM + (i - 1) * 1.8;
      const handle = s.d.host.SpawnEnemy({
        x, z, weapon: i === 0 ? "Type38" : null, squadId: `Ch5Wave${s.mem.waves}`,
      });
      if (handle) s.mem.waveSpawned = (s.mem.waveSpawned || 0) + 1;
    }
  }
}

// ---------------------------------------------------------------------------
// 五关阶段⑫：视角接替 —— 一秒黑帧 + 身份字卡 + 落在正确的位置与朝向上
//
// INT2 的 SwitchPov 只搬人 + 换任务文字（§10.7 施工单最后一条）。补的是两件：
//   · **换身份的表现**：三张 1 s 黑帧字卡（Data_CutsceneCh5 的 PovCard，
//     版式与序章那张地点卡同一档；黑帧上声音不断，与「用声音衔接」不冲突）；
//   · **落地朝向**：`SwitchPov` 现在带 `yaw`（口径同 spawn.ry，见 ctx.YawTo）。
//     不给朝向的话，接替过去的人是**背着战场**站着的 —— 换了身份第一眼看见的
//     是墙，那半分钟的「他在干什么」就没了。
//     装配层还没读这个字段时它就是被忽略的一个多余属性，不报错。
// ---------------------------------------------------------------------------

function SwitchPovWithCard(s, spec) {
  const at = spec.at;
  if (!at) return false;
  // 卡先播：黑帧盖住这一次搬人。播不动（宿主没接过场）时就是直接换过去。
  if (spec.card) s.d.host.PlayCutscene?.(spec.card);
  s.d.host.SwitchPov?.({
    id: spec.id, cast: spec.cast, label: spec.label, at, task: spec.task,
    yaw: spec.face ? s.YawTo(at, spec.face) : undefined,
  });
  s.mem.povAt = spec.id;
  s.mem.povCount = (s.mem.povCount || 0) + 1;
  return true;
}

function DressAidYard(s, levelId) {
  const plan = AID_YARD[levelId];
  if (!plan) return 0;
  let n = 0;
  for (const item of plan.props) {
    const at = s.Near(plan.zone, item.dx, item.dz);
    if (!at) break;
    const id = s.Prop({
      id: item.id, kind: item.kind, position: at, size: item.size,
      color: item.color, texture: item.texture, rotationY: item.ry || 0,
    });
    if (id) n += 1;
  }
  s.mem.aidYardProps = n;
  return n;
}

// ---------------------------------------------------------------------------
// 七章摆点表
//
// **一章一条，每一条都读得完。** 找「第五关的机枪位摆在哪儿」只有一个地方可看。
// ---------------------------------------------------------------------------

function BeginCh1RailPass(s) {
  s.Once("ch1_railPass", (ss) => {
    ss.strafe?.StrafeRun({
      preset: "railPass",
      from: { x: -486, z: -60 }, to: { x: -482, z: 150 },
      ...(ss.phase?.whitebox?.aircraftRoutes?.railPass || {}),
      OnPhase: (beat) => {
        if (ss.phase?.whitebox?.p012) {
          if (beat === "enter" && !ss.d.host.Story?.()?.Signalled("P012AircraftApproach")) ss.Signal("P012AircraftApproach");
          if (beat === "fire") ss.Signal("P012AircraftRailFire");
          if (beat === "exit") ss.Signal("P012AircraftRailExit");
        }
        if (beat === "exit") { ss.mem.railPassDone = ss.Time(); ss.Signal("P012RailComplete"); }
      },
    });
  });
}

export const SETPIECES = {

  // =========================================================================
  // 序章｜出川 —— 整章是过场承载章，摆点层无事可做。
  //
  // 车厢是过场自带的布景，底下那片地皮上没有战线（EnterLevel 的 cutsceneOnly
  // 分支既不 Respawn 也不撒兵）。这里留一条空记录而不是不写 —— 「这一章故意
  // 没有摆点」与「忘了写」在代码里必须长得不一样。
  // =========================================================================
  CH0_Chuchuan: {
    id: "CH0_Chuchuan",
    note: "过场承载章：车厢、兵站、逃跑计划三段全在 CS_Chuchuan 里。",
    Setup() {},
  },

  // =========================================================================
  // 第一关｜往南的路
  //
  // 摆的东西（§2 阶段号）：
  //   ①  给机枪组补弹（ammoCrate 搬运 + 送到位）
  //   ②③ 后送队：2 担架（各 2 担架员）＋2 护卫＋可行走伤兵＋百姓，沿大车路南下
  //   ⑤⑥⑧ 三条扫射航线（railPass → crowdTurn → divePress）
  //   ⑦  接替担架（stretcher 搬运态 20—30 s）
  //   ⑧  松手：DiveCue → ForceRelease；不躲 → checkpoint.Rewind
  //   ⑪  结尾「重新握住担架」
  // =========================================================================
  CH1_NanLu: {
    id: "CH1_NanLu",

    Setup(s) {
      // --- ① 给机枪组补弹（两点：箱子在哪儿、送到哪儿）--------------------
      const crate = s.Near("C1_Railbed", 6, 4);
      const nest = s.Near("C1_Railbed", -9, -6);
      if (crate && !s.phase?.whitebox?.p012) {
        s.Register(PickUpLoadInteraction({
          id: "ch1_ammoCrate", position: crate, kindId: "ammoCrate",
          label: "抬起弹药箱", carry: s.carry, once: false,
          options: { label: "弹药箱", payload: { to: "mg" } },
        }));
      }
      if (nest && !s.phase?.whitebox?.p012) {
        s.Register(GiveSupplyInteraction({
          id: "ch1_ammoDrop", position: nest, item: "弹药箱", label: "把箱子送过去",
          Has: () => !!s.carry && s.carry.KindId === "ammoCrate",
          OnComplete: () => {
            s.carry?.Drop("delivered");
            s.Hint("弹药送到机枪位了。", 2.4);
            s.mem.ammoDelivered = (s.mem.ammoDelivered || 0) + 1;
          },
          once: false,
        }));
      }

      // --- ②③ 后送队 -----------------------------------------------------
      // 队伍成分照策划案 §2 阶段三逐条：2 担架 + 4 担架员 + 2 持枪护卫 +
      // 可行走伤兵 + 撤离百姓。**妇孺老人必须在队里看得见** —— 阶段六
      // 「担架、女人、娃儿都照打」是靠玩家自己看见成立的，不是靠台词。
      const configuredWaypoints = s.phase?.whitebox?.escortWaypoints;
      const escortWaypoints = Array.isArray(configuredWaypoints)
        ? configuredWaypoints.map((point) => (
          point.zone ? s.Zone(point.zone) : point
        )).filter(Boolean).map((point) => ({ x: point.x, z: point.z }))
        : [
          s.Zone("C1_Village"), s.Zone("C1_Culvert"), s.Zone("C1_SouthRoad"),
          s.Zone("C1_Ditch"),
        ].filter(Boolean).map((z) => ({ x: z.x, z: z.z }));
      s.mem.column = s.Column({
        waypoints: escortWaypoints,
        followRouteBodies: !!s.phase?.whitebox?.p012,
        members: [
          { role: "bearer", label: "担架员", weapon: null },
          { role: "bearer", label: "担架员", weapon: null },
          { role: "bearer", label: "担架员", weapon: null },
          { role: "bearer", label: "担架员", weapon: null },
          { role: "guard", label: "护卫", weapon: "HanYang" },
          { role: "guard", label: "护卫", weapon: "HanYang" },
          { role: "walking", label: "可行走伤兵", weapon: null },
          { role: "walking", label: "可行走伤兵", weapon: null },
          // 队列只传角色身份；P012宿主通过正式ActorFactory复用男女平民模型，
          // 无枪标记同时约束可见武器和AI攻击，不在这里复制人物渲染或战斗规则。
          { role: "civilian", label: "百姓", weapon: null, civilian: true, variant: s.phase?.whitebox?.p012 ? "male" : undefined,
            routeSlot: s.phase?.whitebox?.p012 ? {back:.95,lateral:.8} : undefined },
          { role: "civilian", label: "百姓（抱娃的婆娘）", weapon: null, civilian: true, variant: s.phase?.whitebox?.p012 ? "female" : undefined,
            routeSlot: s.phase?.whitebox?.p012 ? {back:5.15,lateral:.8} : undefined },
        ],
      });
      if (s.phase?.whitebox?.p012) {
        const shelter = s.phase.whitebox.anchors.shelter;
        const woundedAt = s.phase.whitebox.activities.woundedDragFrom || shelter;
        s.mem.prepWounded = s.Column({ waypoints: [shelter, { x: shelter.x + 0.1, z: shelter.z }],
          members: [{ role: "bearer", label: "阵地救护兵", weapon: null },
            { role: "bearer", label: "阵地救护兵", weapon: null }] });
        s.mem.prepWounded.Start();
        const litter = s.mem.prepWounded.litters[0];
        if (litter) {
          litter.dropped = true; s.d.host.SetPropState?.(litter.propLitter, "removed");
          s.mem.p012WoundedDrag = { prop: litter.propBody, position: { ...woundedAt }, distance: 0, delivered: false };
          s.d.host.MoveProp?.(litter.propBody, { ...woundedAt, y: 0.15 });
          s.Register({ ...PickUpLoadInteraction({ id: "p012_woundedDrag", kindId: "wounded", carry: s.carry,
            Anchor: () => s.mem.p012WoundedDrag.position, label: "拖住伤员，带回交通壕",
            options: { label: "拖回伤员", canDrop: true, payload: { who: "p012DraggedWounded" } } }),
            once: false, Enabled: () => !s.mem.p012WoundedDrag.delivered && !s.carry?.Active && s.d.host.Story?.()?.Signalled("P012WoundedChecked") });
        }
      }
    },

    onZone: {
      // ② 后方喊「缺两个护送伤兵的！」—— 打退这一波、玩家退到村口那一线时。
      C1_Village(s) {
        if (s.phase?.whitebox?.p012) return;
        s.After(8, (ss) => {
          ss.Signal("EscortCall");
          ss.mem.column?.Start();
        }, "ch1_escortCall");
      },
      // ⑤ 第一次掠过：沿铁路打车辆，一个人都不伤（preset 的 damage.npc = none）。
      C1_Ditch(s) {
        if (s.phase?.whitebox?.p012) return;
        BeginCh1RailPass(s);
      },
    },

    onVoice: {
      // ⑦ 罗班长「顺子，接后头！」之后才摆得出「接住担架后端」那个点 ——
      //    先摆的话玩家会在担架员还活着的时候把担架接过来。
      ch1_luo_17(s) {
        const spot = s.mem.column?.HeadPosition() || s.Near("C1_Ditch", 2, 6);
        if (!spot) return;
        s.Register(PickUpLoadInteraction({
          id: "ch1_stretcher", kindId: "stretcher",
          // 挂在队头上：担架跟着队伍走，交互点也跟着走。
          Anchor: () => s.mem.column?.HeadPosition() || spot,
          label: "接住担架后端", carry: s.carry,
          options: {
            label: "担架（伤员）", canDrop: true,
            partner: s.mem.column?.Bearers?.[0]?.handle || null,
            payload: { who: "shangbing" },
          },
          OnComplete: () => {
            s.Signal("StretcherHandoff");
            s.mem.carryStartedAt = s.Time();
            if (s.phase?.whitebox?.p012) {
              s.mem.p012CarriedLitter = s.mem.column?.litters?.find((litter) => litter.dropped) || s.mem.column?.litters?.[0];
              if (s.mem.p012CarriedLitter) s.mem.p012CarriedLitter.dropped = true;
              s.mem.p012CarryDistance = 0; s.mem.p012CarryLast = { ...s.PlayerPos() };
              s.Signal("P012StretcherLifted");
            }
            // 抬起来那一刻打一个检查点：阶段八「不躲则从数秒前重来」退到这儿。
            s.checkpoint?.Save();
          },
        }));
      },
    },

    Update(s, dt) {
      s.mem.column?.Update(dt);
      const p012 = s.phase?.whitebox?.p012;
      if (p012 && s.mem.p012RetryDive) {
        s.mem.p012RetryDive = false; s.strafe?.Abort("p012Retry");
        s.mem.diveAt = null; s.mem.diveDone = null;
      }
      const HasSignal = (name) => s.d.host.Story?.()?.Signalled(name);
      StepP012RoadCover(s, HasSignal);
      if (p012 && HasSignal("P012AmbushClear") && !HasSignal("P012AirReady")) {
        const column=s.mem.column, litter=s.mem.p012InspectionLitter ||= column?.litters?.[0];
        const front=litter?.front?.handle,rear=litter?.rear?.handle;
        if(front?.alive && rear?.alive){
          const a=s.d.host.PositionOf?.(front),b=s.d.host.PositionOf?.(rear);
          if(a&&b){
            s.mem.p012RoadWoundedPosition={x:(a.x+b.x)/2,z:(a.z+b.z)/2};
            const inspection=s.phase.whitebox.activities.roadWoundedPosition || P012SouthPoint(50,47);
            s.mem.p012RoadWoundedAtInspection=Math.hypot(s.mem.p012RoadWoundedPosition.x-inspection.x,s.mem.p012RoadWoundedPosition.z-inspection.z)<3;
            if(!HasSignal("P012RoadWoundedChecked") && s.mem.p012RoadWoundedAtInspection) column.scriptPaused=true;
            if(HasSignal("P012RoadWoundedChecked"))column.scriptPaused=false;
          }
        }
      }
      if (p012 && HasSignal("P012AmbushClear") && !HasSignal("P012AircraftApproach") && s.mem.column?.moving) {
        const player = s.PlayerPos(), road = s.phase.whitebox.activities.roadWoundedPosition;
        const bearer = s.mem.column.Bearers?.[0]?.handle;
        const at = bearer && s.d.host.PositionOf?.(bearer);
        if (road && player && at && Math.hypot(player.x - road.x, player.z - road.z) < 8
          && Math.hypot(player.x - at.x, player.z - at.z) < 30) s.Signal("P012AircraftApproach");
      }
      if (p012) {
        const drag = s.mem.p012WoundedDrag, point = s.PlayerPos();
        if (drag && !drag.delivered && s.carry?.KindId === "wounded") {
          const step = drag.last ? Math.hypot(point.x - drag.last.x, point.z - drag.last.z) : 0;
          if (step < 3) drag.distance += step;
          drag.last = { ...point }; drag.position = { x: point.x, z: point.z + 1 };
          s.d.host.MoveProp?.(drag.prop, { ...drag.position, y: 0.15 });
          const goal = s.phase.whitebox.activities.woundedDragTo;
          if (goal && drag.distance >= 10 && Math.hypot(point.x - goal.x, point.z - goal.z) < 3) {
            drag.delivered = true; s.carry.ForceRelease("delivered"); s.Signal("P012WoundedDragDelivered");
          }
        } else if (drag) drag.last = null;
      }
      if(p012&&HasSignal("P012RoadContactHold")&&!HasSignal("P012RoadContactRelease")&&s.mem.column)s.mem.column.scriptPaused=true;
      if(p012&&HasSignal("P012RoadContactRelease")&&s.mem.column)s.mem.column.scriptPaused=false;
      if (p012 && HasSignal("EscortCall")) s.Once("p012_columnStart", (ss) => {
        const route = ss.phase.whitebox.escortWaypoints;
        const stop = P012WaypointIndex(route,ss.phase.whitebox.activities.evacStagingPosition || P012SouthPoint(30,10));
        if (stop >= 0) ss.mem.column.waypoints = route.slice(0, stop + 1);
        ss.mem.prepWounded?.Reset(); ss.mem.column?.Start();
      });
      if (p012 && HasSignal("P012AmbushClear")) s.Once("p012_columnContinue", (ss) => {
        const route=ss.phase.whitebox.escortWaypoints;
        // New connecting corridors may insert any number of points before staging.
        const stop=P012WaypointIndex(route,ss.phase.whitebox.activities.evacStagingPosition || P012SouthPoint(30,10));
        ss.mem.column?.Repath(route.slice(Math.max(0,stop+1)));
      });
      if (p012 && HasSignal("P012AirReady")) {
        BeginCh1RailPass(s);
      }
      if (p012 && HasSignal("SouthCut")) s.Once("p012_columnReturn", (ss) => {
        ss.mem.column.scriptPaused = false;
        ss.mem.column.tuning.columnSpeedMS = ss.phase.whitebox.activities.retreatColumnSpeedMps;
        ss.mem.column?.Repath([...ss.phase.whitebox.returnWaypoints.slice(0, -1), ss.phase.whitebox.activities.regripPosition]);
        ss.mem.column.scriptTerminalQueue = true;
        ss.mem.column.scriptHoldTailSlots = true;
        ss.mem.column.litters.forEach((litter,index)=>[litter.front,litter.rear].forEach((member,end)=>{
          member.slot.back=index*4.2+end*1.9;member.slot.lateral=0;member.handle.scriptArrivalRadius=.3;
        }));
      });
      if (p012 && s.mem.p012ReleaseAt && s.mem.p012CarriedLitter) {
        const point = s.mem.p012ReleaseAt, litter = s.mem.p012CarriedLitter;
        s.d.host.MoveProp?.(litter.propLitter, { x: point.x, y: 0.1, z: point.z - 1.5 });
        s.d.host.MoveProp?.(litter.propBody, { x: point.x, y: 0.3, z: point.z - 1.5 });
        s.mem.p012ReleaseAt = null;
      }
      if (p012 && s.mem.p012CarriedLitter && s.carry?.KindId === "stretcher") {
        const point = s.PlayerPos(), litter = s.mem.p012CarriedLitter;
        const last = s.mem.p012CarryLast;
        const step = last ? Math.hypot(point.x - last.x, point.z - last.z) : 0;
        if (step < 3) s.mem.p012CarryDistance = (s.mem.p012CarryDistance || 0) + step;
        s.mem.p012CarryLast = { ...point };
        s.d.host.MoveProp?.(litter.propLitter, { x: point.x, y: (point.y || 0) + 0.62, z: point.z - 1.5, rotationZ: 0 });
        s.d.host.MoveProp?.(litter.propBody, { x: point.x, y: (point.y || 0) + 0.84, z: point.z - 1.5, rotationZ: 0 });
      }
      if (p012 && s.mem.p012LitterOverturned && !s.mem.p012LitterRecovered) {
        const litter = s.mem.p012CarriedLitter, column = s.mem.column, point = s.mem.p012FallenAt;
        if (litter && column && point) {
          for (const role of ["front", "rear"]) {
            if (!litter[role]?.handle?.alive) {
              const replacement = column.Alive.find((member) => member.role !== "bearer" && member.role !== "civilian");
              if (replacement) {
                replacement.role = "bearer"; replacement.slot = { ...litter[role].slot }; litter[role] = replacement;
                replacement.handle.scriptedNoncombatant = true; replacement.handle.unarmed = true;
                replacement.handle.scriptEssential = true;
                replacement.handle.scriptDefensive = false; replacement.handle.target = null;
                replacement.handle.actor?.SetWeapon?.(null);
              }
            }
          }
          let arrived = true;
          for (const [role, offset] of [["front", -0.9], ["rear", 0.9]]) {
            const actor = litter[role]?.handle, target = { x: point.x, z: point.z + offset };
            if (!actor?.alive) { arrived = false; continue; }
            s.d.host.SetGoal?.(actor, target.x, target.z);
            const at = s.d.host.PositionOf?.(actor);
            if (!at || Math.hypot(at.x - target.x, at.z - target.z) > 1.8) arrived = false;
          }
          if (arrived) {
            litter.dropped = false; s.mem.p012LitterRecovered = true;
            s.mem.p012RecoveryReason = "livingReplacementReachedFallenLitter";
            litter.front.handle.carryRole = "front"; litter.rear.handle.carryRole = "rear";
            s.d.host.MoveProp?.(litter.propLitter, { ...point, y: 0.62, rotationZ: 0 });
            s.d.host.MoveProp?.(litter.propBody, { ...point, y: 0.84, rotationZ: 0 });
            s.Signal("P012LitterRecovered");
          }
        }
      }

      // Keep this same recovered patient at the actual ditch, not the stale column head.
      if (p012 && s.mem.p012LitterRecovered && !HasSignal("P012DitchClear")) {
        const point = s.mem.p012FallenAt, litter = s.mem.p012CarriedLitter;
        if (point && litter) for (const [role, offset] of [["front", -0.9], ["rear", 0.9]]) {
          const actor = litter[role]?.handle;
          if (actor?.alive) s.d.host.SetGoal?.(actor, point.x, point.z + offset);
        }
      }

      if (p012 && HasSignal("P012DitchClear")) s.Once("p012_ditchContinue", (ss) => {
        const column=ss.mem.column;
        if (column) {
          for(const member of column.Alive) if(member.role==="guard"&&!member.handle.unarmed)member.handle.scriptedNoncombatant=false;
          const actor=ss.mem.p012CarriedLitter?.front?.handle;
          const start=actor && ss.d.host.PositionOf?.(actor);
          column.scriptPaused=false; column.Repath(ss.phase.whitebox.activities.ditchContinuationRoute
            || [P012SouthPoint(44,66),P012SouthPoint(47,80),P012SouthPoint(42,94)],start);
        }
      });

      // ⑥ 转向人群。第一轮走完 9 秒后拐回来 —— 「拉起、转弯、降高」那一下
      //    必须在玩家的自由视角里看得见（§2 不设开场过场就是为了这一眼）。
      if (s.mem.railPassDone && !s.mem.crowdTurnAt && !s.strafe?.Active
        && (p012 || s.Time() - s.mem.railPassDone > 9)) {
        s.mem.crowdTurnAt = s.Time();
        const column = s.mem.column;
        // **点名，不掷骰子**：谁倒下由脚本决定（Script_AircraftStrafe 的白名单）。
        // 一个担架员 + 一个百姓；后面还有戏的人（同伴）一律进 immune。
        const victims = [];
        const bearer = column?.Bearers?.[1] || column?.Bearers?.[0];
        const civilian = column?.Civilians?.[column.Civilians.length - 1];
        if (bearer) victims.push({ ref: bearer.handle, at: 0.30 });
        if (civilian) victims.push({ ref: civilian.handle, at: 0.72 });
        s.strafe?.StrafeRun({
          preset: "crowdTurn",
          from: { x: -440, z: 55 }, to: { x: -450, z: 165 },
          ...(s.phase?.whitebox?.aircraftRoutes?.crowdTurn || {}),
          TrackTo: () => column?.HeadPosition() || s.PlayerPos(),
          victims,
          // 后面还有戏的人一律必不死：班里那几个（罗班长、幺娃、何有田…）
          // 与担架上那个伤员。`immune` 压过 `victims`（白名单不许自相矛盾）。
          immune: (s.companion?.Roster || []).map((id) => s.companion.Handle(id)).filter(Boolean),
          OnPhase: (beat) => {
            if (beat === "fire") {
              if (!p012) column?.Scatter(14);
              if (p012 && column) column.scriptPaused = true;
              if (p012) { s.Signal("P012CrowdFire"); s.Signal("P012AircraftCrowdFire"); s.Signal("StretcherHandoff"); }
            }
            if (beat === "exit") s.mem.crowdTurnDone = s.Time();
          },
        });
      }

      if (p012 && HasSignal("P012SeekAirCover") && !HasSignal("P012Dived")) {
        const slots=s.phase.whitebox.anchors.strafeSlots || [];
        for(const [index,member] of (s.mem.column?.Alive || []).filter((m)=>m.role!=="bearer").entries()) {
          if(member.role==="civilian" && !HasSignal("P012CrowdFire")) continue;
          const point=slots[index%slots.length];
          if(point){
            member.handle.scriptedNoncombatant=true;
            const entry=s.phase.whitebox.activities.airCoverEntryPosition || P012SouthPoint(44,66);
            const at=s.d.host.PositionOf?.(member.handle), target=at&&at.z>entry.z+.8?entry:point;
            s.d.host.SetGoal?.(member.handle,target.x,target.z+(target===point?(index%2?1:-1):0));
          }
        }
      }
      if(p012 && HasSignal("P012Dived"))s.Once("p012_restoreCoverGuards",ss=>{
        for(const member of ss.mem.column?.Alive || [])if(member.role==="guard"&&!member.handle.unarmed)member.handle.scriptedNoncombatant=false;
      });

      // ⑧ 第三次进入航线。**要等玩家真的抬上担架**（搬运态满 20 s），
      //    没抬上就用 crowdTurn 结束后 30 s 兜底 —— 不能让这一拍等一个
      //    可能永远不发生的条件。
      if (!s.mem.diveAt && s.mem.crowdTurnDone) {
        const carried = p012 ? HasSignal("P012CarryReady") : s.mem.carryStartedAt && s.Time() - s.mem.carryStartedAt > 20;
        const timedOut = !p012 && s.Time() - s.mem.crowdTurnDone > 30;
        if (carried || timedOut) {
          s.mem.diveAt = s.Time();
          s.strafe?.StrafeRun({
            preset: "divePress",
            from: { x: -444, z: 100 }, to: { x: -452, z: 195 },
            ...(s.phase?.whitebox?.aircraftRoutes?.divePress || {}),
            TrackTo: () => s.PlayerPos(),
            // 「你的手是先松开的」—— 剧情要求，不是玩家操作失误。
            OnDodge: () => {
              s.carry?.ForceRelease("dive");
              if (p012) {
                const point = s.PlayerPos(), litter = s.mem.p012CarriedLitter;
                if (litter) {
                  s.d.host.MoveProp?.(litter.propLitter, { x: point.x + 1.2, y: 0.35, z: point.z, rotationZ: Math.PI * 0.6 });
                  s.d.host.MoveProp?.(litter.propBody, { x: point.x + 1.7, y: 0.18, z: point.z + 0.4, rotationZ: 0.35 });
                  s.mem.p012LitterOverturned = true;
                  s.mem.p012FallenAt = { x: point.x + 1.2, z: point.z };
                }
                s.Signal("P012Dived");
              }
            },
            // 「不躲则被击倒并从数秒前重来」。**倒带必须发生在把伤害交给
            // 死亡链路之前** —— Script_AircraftStrafe 的 OnPlayerHit 就在那之前调。
            OnPlayerHit: () => {
              s.carry?.ForceRelease("dive");
              s.checkpoint?.Rewind(4);
              if (p012) s.mem.p012RetryDive = true;
              s.Hint("再来一次 —— 它压下来的时候扑进沟里。", 3.2);
            },
            OnPhase: (beat) => {
              if (p012 && beat === "enter") s.Signal("P012DiveApproach");
              if (beat === "exit") s.mem.diveDone = s.Time();
            },
          });
        }
      }

      // ⑨ 南路被截断：飞机走后二十秒，路口那头的枪声一直没停。
      if (!p012 && s.mem.diveDone && s.Time() - s.mem.diveDone > 20) {
        s.Once("ch1_southCut", (ss) => ss.Signal("SouthCut"));
      }

      // ⑪ 结尾：重新握住担架后端。**只在伤员那一句之后摆** ——
      //    §0 六个验收结果之二，这一下是本关的收束动作。
      if (s.Spoken("ch1_shangbing_04") && (!p012 || HasSignal("P012RegripReady"))) {
        s.Once("ch1_regrip", (ss) => {
          const originalLitter = ss.mem.p012CarriedLitter;
          const actualRear = originalLitter?.rear?.handle && ss.d.host.PositionOf?.(originalLitter.rear.handle);
          const spot = (p012 ? actualRear || originalLitter?.lastMid : null) || ss.phase?.whitebox?.activities?.regripPosition || ss.phase?.whitebox?.anchors?.shelter || ss.Near("C1_BackToWall", 4, 6);
          if (!spot) return;
          if (p012) {
            const litter = originalLitter;
            if (litter) {
              litter.dropped = true; ss.mem.p012CarriedLitter = litter;
            }
          }
          ss.Register(PickUpLoadInteraction({
            id: "ch1_regrip", position: spot, kindId: "stretcher",
            label: "重新握住担架后端", carry: ss.carry,
            options: { label: "担架（伤员）", canDrop: true, payload: { who: "shangbing" } },
            OnComplete: () => {
              ss.Hint("腿抬高了。", 2.2);
              if (ss.phase?.whitebox?.p012) ss.Signal("P012Regripped");
            },
          }));
        });
      }
    },
  },

  // =========================================================================
  // 第二关｜手榴弹雨
  //
  //   ① 弹药箱拖运（三态：拖到投掷点 / 受潮弹单独码 / 殉爆倒计时拖出 6 m）
  //   ② 「甩！」那一拍对壕沿友军下齐投
  //   ④ 白刃 QTE：坍塌缺口段，清空 → Signal("BayonetDone")
  //   ⑤ 关末清点
  // =========================================================================
  CH2_Shouliudan: {
    id: "CH2_Shouliudan",

    Setup(s) {
      // ① 三只箱子：好弹、受潮弹、还有一只等着被掷弹筒点着的。
      const pile = s.Near("C2_ZhaiGate", 3, 5);
      const throwPoint = s.Near("C2_Ditch", -6, 2);
      const dampPoint = s.Near("C2_ZhaiGate", -7, -4);
      if (pile) {
        s.Register(PickUpLoadInteraction({
          id: "ch2_crate", position: pile, kindId: "ammoCrate",
          label: "拖起弹药箱", carry: s.carry, once: false,
          options: { label: "手榴弹箱", payload: { damp: false } },
        }));
        s.Register(PickUpLoadInteraction({
          id: "ch2_dampCrate", position: { x: pile.x + 2.4, y: pile.y, z: pile.z + 1.2 },
          kindId: "ammoCrate", label: "拖起受潮的那一箱", carry: s.carry, once: false,
          options: { label: "受潮的手榴弹箱", payload: { damp: true } },
        }));
      }
      if (throwPoint) {
        s.Register(GiveSupplyInteraction({
          id: "ch2_crateDrop", position: throwPoint, item: "弹药箱", label: "摆到投掷点",
          Has: () => !!s.carry && s.carry.KindId === "ammoCrate",
          OnComplete: () => {
            const damp = !!s.carry?.View()?.payload?.damp;
            s.carry?.Drop("staged");
            if (damp) {
              // 受潮弹混进好弹堆里要有一次失败反馈（策划案原文）。
              s.Say("赵德贵", "受潮的单独码一边！", 2.6);
              s.mem.dampMisplaced = (s.mem.dampMisplaced || 0) + 1;
            } else {
              s.mem.crateStaged = (s.mem.crateStaged || 0) + 1;
              s.Hint(`投掷点摆了 ${s.mem.crateStaged} 箱。`, 2.0);
            }
          },
          once: false,
        }));
      }
      if (dampPoint) {
        s.Register(GiveSupplyInteraction({
          id: "ch2_dampDrop", position: dampPoint, item: "受潮弹", label: "受潮的码这边",
          Has: () => !!s.carry && s.carry.KindId === "ammoCrate",
          OnComplete: () => {
            const damp = !!s.carry?.View()?.payload?.damp;
            s.carry?.Drop("staged");
            if (damp) s.mem.dampStaged = (s.mem.dampStaged || 0) + 1;
            else s.Say("刘文财", "好的莫往这边码！", 2.2);
          },
          once: false,
        }));
      }

      // ③ 摆在缺口后头那三只**打得中**的箱子（StageCrate 上面那段注释是完整链路）。
      //    位置照策划案：投弹点与院墙之间那一片 —— 掷弹筒够得着，玩家也拖得动。
      //    三只是给三次机会，不是三次同时冒烟（状态机一次只烧一只）。
      const cook = [
        { id: "ch2_cookCrate1", dx: -4.0, dz: 3.0, note: "摞在墙根的手榴弹箱" },
        { id: "ch2_cookCrate2", dx: 1.5, dz: 5.5, note: "刚拖过来的一箱" },
        { id: "ch2_cookCrate3", dx: 5.0, dz: 2.0, note: "压在瓦砾上的一箱" },
      ];
      s.mem.cookCrates = 0;
      for (const item of cook) {
        const at = s.Near("C2_Courtyard", item.dx, item.dz);
        if (!at) break;
        if (StageCrate(s, item.id, at, item.note)) s.mem.cookCrates += 1;
      }
    },

    onVoice: {
      // ② 「甩！」—— 玩家与背景守军**同时**投。一个人甩出去只是三颗手榴弹，
      //    不是史料里那场雨（集中六七十人、连续二三百枚）。
      ch2_luo_04(s) {
        const zone = s.Zone("C2_Ditch");
        if (!zone) return;
        s.Signal("GrenadeVolley");
        s.d.host.VolleyThrow?.({ x: zone.x, z: zone.z, radius: 46, spreadS: 0.8 });
      },
      // ④ 上刺刀那一句之后，缺口段的白刃 QTE 才开门。第一次要给一次按键提示，
      //    之后不再提示（Data_MissionCh2 的 ENGINE_REQUEST 3）。
      ch2_luo_06(s) {
        s.mem.bayonetOpen = true;
        s.mem.bayonetOpenAt = s.Time();
        s.d.host.SetMeleeGate?.(true);
        s.Hint("上刺刀 —— 挡住他，再反打。", 4.0);
      },
    },

    Update(s) {
      // ③ 殉爆：掷弹筒命中弹药箱 → 冒烟 4—6 s → 拖出 6 m 算救下。
      //    「谁被打中了」由 destruction 经 Script_BlastTargets 报上来（不是时钟、
      //    也不是这一层自己算的伤害）；状态机在 UpdateCrateCookoff 里，完整链路
      //    见它上面那段注释。宿主一件都没接线时它静默不发生，不报错。
      UpdateCrateCookoff(s);

      // ④ 缺口内日军清空 → BayonetDone。**不许把「打完了」写成时间到了** ——
      //    兜底判据在 Data_MissionCh2.EVENTS 里，这里只报事实。
      if (s.mem.bayonetOpen && !s.mem.bayonetDone) {
        const zone = s.Zone("C2_BackStreet");
        const left = zone ? Num(s.d.host.EnemiesNear?.(zone.x, zone.z, zone.radius), -1) : -1;
        // 开门至少 12 s 之后才算数：开门那一帧敌人还没走到缺口里，
        // 一进门就判「清空了」是最常见的一种假绿。
        if (left === 0 && s.Time() - s.mem.bayonetOpenAt > 12) {
          s.mem.bayonetDone = true;
          s.Signal("BayonetDone");
        }
      }
    },
  },

  // =========================================================================
  // 第三关｜救护所
  //
  //   ①  A 区：搬药箱、拆门板、接电话线（ER-5 / ER-4）
  //   ④  报纸（ER-7）
  //   ⑥  **看得见的那条电话线**：A 区 → 侧门 → 失守街区 → C 区，失守街区那一头断开
  //       （ER-4「线本身就是路标」；LayWire / WirePost 上面那段注释是完整口径）
  //   ⑦⑧ 处决声音先行段 → 破墙确认 → CS_Ch3_BreakWall（ER-1）
  //   ⑨  **幸存者实体**：屋里三具躺着的人 → 搀起（carry 的 wounded 档）→ 交给幺娃
  //       → 他自己往 A 区方向走（ER-6；「这边还有活的！」那一拍开门）
  //   ⑩  撕短褂（ER-2）
  //   ⑪  传单入火 → 火墙封路（ER-3）
  //   ⑫  剪线（ER-4）
  // =========================================================================
  CH3_Jiuhusuo: {
    id: "CH3_Jiuhusuo",

    Setup(s) {
      // A 区第一次出场：**有序**。差异件见 AID_YARD.CH3_Jiuhusuo。
      DressAidYard(s, "CH3_Jiuhusuo");

      // ① 药箱：抬起来 → 送进屋。
      const boxes = s.Near("C3_AidStation", -6, 8);
      const ward = s.Near("C3_AidStation", 7, -5);
      if (boxes) {
        s.Register(PickUpLoadInteraction({
          id: "ch3_medBox", position: boxes, kindId: "medBox",
          label: "抬起药箱", carry: s.carry, once: false,
          options: { label: "药箱" },
        }));
      }
      if (ward) {
        s.Register(GiveSupplyInteraction({
          id: "ch3_medBoxDrop", position: ward, item: "药箱", label: "抬进屋",
          Has: () => !!s.carry && s.carry.KindId === "medBox",
          OnComplete: () => { s.carry?.Drop("delivered"); s.mem.boxes = (s.mem.boxes || 0) + 1; },
          once: false,
        }));
      }
      // ① 门板 ×3 —— **这是四关、五关认得出这个院子的物证**（§5 阶段 10）。
      for (let i = 0; i < 3; i += 1) {
        const at = s.Near("C3_AidStation", -10 + i * 3.2, -9);
        if (!at) break;
        s.Register(DoorPlankInteraction({
          id: `ch3_plank${i}`, position: at,
          RemovePlank: () => s.d.host.SetPropState?.(`ch3_door${i}`, "removed") !== false,
          SpawnStretcher: () => s.Prop({ id: `ch3_stretcher${i}`, kind: "stretcher", position: at }),
          OnComplete: () => {
            s.mem.planks = (s.mem.planks || 0) + 1;
            // 拆下来的门框缺口要留在场景状态里 —— 四关走回来时认得出。
            s.d.host.MarkPersistent?.("ch3_doorPlanks", s.mem.planks);
            if (s.mem.planks >= 3) s.Hint("三块门板都拆下来了。", 2.6);
          },
        }));
      }
      // ① 电话线：两头接上（ER-4）。
      const wireA = s.Near("C3_AidStation", 12, 2);
      const wireB = s.Near("C3_AidStation", 16, -6);
      if (wireA && wireB) {
        for (const spec of WireInteractions({
          id: "ch3_phone", a: { position: wireA }, b: { position: wireB },
          OnJoin: () => { s.mem.phoneJoined = true; s.Say("小秦", "线接通了。", 2.4); },
        })) s.Register(spec);
      }
      // ④ 报纸：靠近读标题，完整内容进历史档案（不做全文界面、不做过场）。
      const paper = s.Near("C3_AidStation", -3, 12);
      if (paper) {
        s.Register(CheckWoundedInteraction({
          id: "ch3_newspaper", position: paper, seconds: 0.9, label: "读墙上那张旧报纸",
          OnComplete: () => {
            s.mem.paperRead = true;
            s.Hint("《首都陷落后之南京》—— 纸角卷了，字还认得出。", 5.0);
          },
        }));
      }

      // ⑥ 那条**看得见的**电话线（ER-4：线本身就是路标）。
      //    走线照本章路标：A 区 → 东门侧门 → 失守街区 → C 区前沿救护点。
      //    在失守街区那一头**断开**：两个断头空着一截，中间没有线 ——
      //    「最后一段线路还通，不是我们这边断的」是靠这一眼成立的，不是靠台词。
      const lineYard = s.Zone("C3_AidStation");
      const lineGate = s.Zone("C3_EastGateOut");
      const lineLost = s.Zone("C3_LostBlock");
      const lineFwd = s.Zone("C3_ForwardAid");
      if (lineYard && lineGate && lineLost && lineFwd) {
        const P = (z, dx = 0, dz = 0) => ({ x: z.x + dx, z: z.z + dz });
        // 断口取剪线交互那一处（Near("C3_LostBlock", -8, 4)）前后各 4 m。
        const cutAt = { x: lineLost.x - 8, z: lineLost.z + 4 };
        s.mem.wireProps = 0;
        s.mem.wireProps += LayWire(s, "ch3_wireA", [
          P(lineYard, 9, 3), P(lineGate, -6, 6), { x: cutAt.x - 3.4, z: cutAt.z - 1.2 },
        ]);
        s.mem.wireProps += LayWire(s, "ch3_wireB", [
          { x: cutAt.x + 3.4, z: cutAt.z + 1.2 }, P(lineLost, 6, -6), P(lineFwd, -7, 4),
        ]);
        // 两个断头：一段翘起来的短线 + 一根歪掉的杆。断口本身不接。
        s.Prop({
          id: "ch3_wireEndA", kind: "box", size: [1.1, 0.07, 0.07], rotationY: 0.42,
          position: { x: cutAt.x - 2.4, y: Num(s.d.host.Ground?.(cutAt.x - 2.4, cutAt.z - 0.9), 0) + 0.22, z: cutAt.z - 0.9 },
          color: 0x241f1b, note: "断头（这一头还带着电）",
        });
        s.Prop({
          id: "ch3_wireEndB", kind: "box", size: [1.1, 0.07, 0.07], rotationY: -0.30,
          position: { x: cutAt.x + 2.4, y: Num(s.d.host.Ground?.(cutAt.x + 2.4, cutAt.z + 0.9), 0) + 0.18, z: cutAt.z + 0.9 },
          color: 0x241f1b, note: "断头（另一头）",
        });
        WirePost(s, "ch3_wirePost1", s.Near("C3_EastGateOut", -6, 6), 2.6);
        WirePost(s, "ch3_wirePost2", { x: cutAt.x, y: Num(s.d.host.Ground?.(cutAt.x, cutAt.z), 0), z: cutAt.z }, 1.5, 0x3d3428);
        WirePost(s, "ch3_wirePost3", s.Near("C3_LostBlock", 6, -6), 2.6);
      }

      // ⑨ 屋里那两三个还活着的人（ER-6）。**躯体在 Setup 就摆**——玩家破墙看见的
      //    院子里本来就躺着人；能不能搀走要等「这边还有活的！」那一拍（见 onVoice）。
      PlaceSurvivorBodies(s);
    },

    onZone: {
      // ⑦ 声音先行段：先掐掉交火声，再起间隔单发。玩家看不见任何东西，只能听。
      C3_LostBlock(s) {
        s.Once("ch3_execAudible", (ss) => {
          ss.d.host.SetCombatBed?.(false, 1.5);
          ss.Signal("ExecutionAudible");
          ss.mem.execLoopAt = ss.Time();
        });
      },
      // ⑧ 破墙观察位：确认之后才开火 —— 主动权在玩家手上。
      C3_ForwardAid(s) {
        s.Once("ch3_execConfirmed", (ss) => {
          ss.d.host.SetCombatBed?.(true, 0.8);
          // 这一条同时挂着 CS_Ch3_BreakWall（Data_MissionCh3.EVENTS 的 cutscene 字段）。
          ss.Signal("ExecutionConfirmed");
        });
      },
      // ⑪ 炉火那一处：传单可以捡、可以投。
      C3_Firebreak(s) {
        s.Once("ch3_firebreak", (ss) => {
          const leaflet = ss.Near("C3_Firebreak", -3, 4);
          const stove = ss.Near("C3_Firebreak", 2, -2);
          if (leaflet) {
            ss.Register(LeafletPickupInteraction({
              id: "ch3_leaflet", position: leaflet,
              OnComplete: () => { ss.mem.leaflet = true; },
            }));
          }
          if (stove) {
            ss.Register(LeafletBurnInteraction({
              id: "ch3_leafletFire", position: stove,
              HasLeaflet: () => !!ss.mem.leaflet,
              IgniteSource: () => {
                // 火墙：8—10 m、≥90 s，**对玩家同样有伤害**（它是封路，不是单向道具）。
                ss.d.host.Firewall?.({
                  id: "ch3_firewall", from: stove,
                  to: { x: stove.x + 9, y: stove.y, z: stove.z + 1.5 },
                  seconds: 95, damagePlayer: true,
                });
              },
              OnComplete: () => { ss.mem.leaflet = false; ss.Signal("LeafletBurned"); },
            }));
          }
        });
      },
    },

    onVoice: {
      // ⑨ 幺娃喊「这边还有活的！」—— **搀扶就从这一拍开门**（ER-6）。
      //    这是「节拍与实体对齐」的那一条：喊出来的同一刻屋里的人真的可以被搀走，
      //    不是喊完之后玩家在空屋里找一圈。
      ch3_yaowa_09(s) { OpenSurvivorRescue(s); },
      // ⑨ 「能走的交给幺娃！」—— 同一件事的另一条入口（Once 保证只开一次）。
      ch3_luo_17(s) { OpenSurvivorRescue(s); },
      // ⑩ 军医喊「绷带没得了！」之后才亮出短褂 —— 在那之前它不可用、不进 HUD。
      ch3_junyi_06(s) {
        const at = s.Near("C3_ForwardAid", 2, -3);
        if (!at) return;
        s.Register(TearShirtInteraction({
          id: "ch3_tearShirt", position: at,
          ConsumeShirt: () => s.d.host.TakeItem?.("civilianShirt") !== false,
          OnComplete: () => {
            s.mem.shirtTorn = true;
            s.Signal("ShirtTorn");
            // 逃跑计划的第二次失败靠**道具消失**表达，不靠台词。这里不加感言。
          },
        }));
        s.Register(BleedControlInteraction({
          id: "ch3_bleed", position: at, seconds: 3.0, label: "按住出血口",
          OnComplete: () => s.Say("顺子", "莫让他再流了。", 2.4),
        }));
      },
      // ⑫ 撤回路上：小秦剪断收不回来的那一段。
      ch3_luo_18(s) {
        const at = s.Near("C3_LostBlock", -8, 4);
        if (!at) return;
        s.Register(CutWireInteraction({
          id: "ch3_cutWire", position: at,
          OnComplete: () => s.Signal("LineCut"),
        }));
      },
    },

    Update(s) {
      // ⑦ 声音先行段的循环：间隔 9—14 s 一声**单发**，中间垫拖动声与咳嗽。
      // 长度由玩家自己走多快决定，不设时限；确认处决那一刻停。
      if (s.mem.execLoopAt && !s.d.once.has("ch3_execConfirmed")) {
        const gap = 9 + ((s.mem.execShots || 0) % 3) * 2.5;
        if (s.Time() - s.mem.execLoopAt > gap) {
          s.mem.execLoopAt = s.Time();
          s.mem.execShots = (s.mem.execShots || 0) + 1;
          const at = s.Near("C3_ForwardAid", 4, -4);
          s.d.host.PlaySfx?.("rifleIja", { position: at, volume: 0.55 });
          // 短促惨叫走**实录素材**（execScream），低概率、低音量、永远在墙后。
          if (s.mem.execShots % 3 === 2) {
            s.d.host.PlaySfx?.("execScream", { position: at, volume: 0.32 });
          }
        }
      }
      // ⑨ 突入之后搜完幸存者 → AssaultCleared。宿主报「这一片还有没有活着的日军」。
      if (s.d.once.has("ch3_execConfirmed") && !s.mem.cleared) {
        const zone = s.Zone("C3_ForwardAid");
        const left = zone ? Num(s.d.host.EnemiesNear?.(zone.x, zone.z, zone.radius), -1) : -1;
        if (left === 0) {
          s.mem.cleared = true;
          s.Signal("AssaultCleared");
          // 兜底：那两句喊话被吞掉时（语音占麦、玩家跑太快），屋里清空这件**事实**
          // 同样开门。少了这一条，「这边还有活的」没播出去 = 人永远搀不起来。
          OpenSurvivorRescue(s);
        }
      }

      // ⑨ 交出去的那几个自己往回走。
      UpdateWalkers(s);
    },
  },

  // =========================================================================
  // 第四关｜东关之夜
  //
  //   ①  院门口口令确认
  //   ③  写信（贴图纸片道具）
  //   ③  CS_Ch4_UnfinishedLetter 改挂**休整之后**（关中过场）
  //   ⑤⑦ 两枚照明弹
  //   ⑧  罗班长救顺子（固定事件 4—6 s：炮响→墙塌→击倒贴地→武器脱手→罗班长跑过来
  //       →撞开→拖走→中弹；时刻表与规矩见 BeginCh4Rescue）→ SetAbsent 永久缺席
  //   ⑨  carryLeader：幺娃与一名士兵抬罗班长，玩家掩护
  //   ⑩  CS_Ch4_AidStation 挂**进 A 区那一拍**（关中过场）
  // =========================================================================
  CH4_DongguanYe: {
    id: "CH4_DongguanYe",

    Setup(s) {
      // A 区第二次出场：**挤满**（伤员剧增、满地绷带血水、药箱只剩一只）。
      // 门板还是三关拆的那几块 —— 玩家认得出这是同一个院子（§5 阶段 10）。
      DressAidYard(s, "CH4_DongguanYe");

      // ① 门口确认口令：「长江 / 泸州」。对上才放行。
      const gate = s.Near("C4_Assembly", 0, 9);
      if (gate) {
        s.Register(CheckWoundedInteraction({
          id: "ch4_countersign", position: gate, seconds: 0.8, label: "回令：泸州",
          OnComplete: () => {
            s.mem.countersign = true;
            s.Say("赵德贵", "过。", 1.8);
            s.d.host.OpenGate?.("ch4_assemblyGate");
          },
        }));
      }
      // ③ 写信：一张真的纸（贴图 prop 已支持 texture:）。摊在弹药箱上。
      const desk = s.Near("C4_Assembly", -5, -3);
      if (desk) {
        // 「摊在弹药箱上」的那张 —— **plane 不是 panel**：panel 是立着的
        // （贴在墙上的报纸走那一档），一张写了四行的信纸立在半空是穿帮。
        s.mem.letterProp = s.Prop({
          id: "ch4_letter", kind: "plane", position: desk,
          texture: "./Texture/Tex_PaperLetter.png", size: [0.30, 0.21],
        });
        s.Register(CheckWoundedInteraction({
          id: "ch4_writeLetter", position: desk, seconds: 1.6, label: "替他写两句",
          OnComplete: () => {
            s.mem.letterWritten = true;
            s.Hint("「就写我还活起。别写我吐了。」", 4.2);
          },
        }));
      }
    },

    onZone: {
      // ⑤ 第一枚：发射点在日军那一侧（东，+X），顶空压在横巷正中 ——
      //    亮的是巷子，不是发射筒。
      C4_FlareCross(s) {
        s.Once("ch4_flare1", (ss) => {
          ss.flare?.LaunchFlare({
            preset: "crossLane",
            from: { x: 496, z: -18 }, at: { x: 449, z: -22 },
            OnPhase: (beat) => { if (beat === "out") ss.Signal("C4_FlareDown"); },
          });
        });
      },
      // ⑦ 第二枚：窄巷压低（预设 apexM 54），十几米外照得清人脸 ——
      //    「两边都愣了半秒」是这么来的。
      C4_NarrowLane(s) {
        s.Once("ch4_flare2", (ss) => {
          ss.flare?.LaunchFlare({
            preset: "narrowLane",
            from: { x: 486, z: 128 }, at: { x: 443, z: 121 },
          });
          ss.d.host.SetMeleeGate?.(true);
        });
      },
      // ⑩ 回到 A 区：关中过场（抬回 → 剪开军服 →「没得脉了」→ 取信）。
      C4_AidStation(s) {
        s.Once("ch4_aidStation", (ss) => {
          ss.d.host.PlayCutscene?.("CS_Ch4_AidStation");
          // 过场播完之后 beats 里顺子的失控对话才接得上（「不可能。」「你再看一哈！」）。
        });
      },
    },

    onVoice: {
      // ② 休整最后一句「先把今晚熬过去。」之后才播口述那一场 ——
      //    §5 阶段③在阶段②**之后**。挂 cutsceneIn 的老做法是进章即播，
      //    顺序变成 ③①②，九十秒休整的那份静被提前掐掉。
      ch4_luo_05(s) {
        s.After(3.0, (ss) => ss.d.host.PlayCutscene?.("CS_Ch4_UnfinishedLetter"), "ch4_letterCut");
      },
      // ⑧ 罗班长救顺子的**起点**。幺娃「顺哥！左边！」是这一段前面的最后一句 ——
      //    挂在它上面，整段就由剧本自己起头，不必等 EVENTS 的时刻兜底。
      //    整段的时刻表与规矩在 BeginCh4Rescue 上面那段注释里。
      ch4_yaowa_07(s) { BeginCh4Rescue(s); },
      // ⑧ 兜底入口：那一句被吞掉时（语音占麦、玩家跑太快），罗班长喊「起来！」
      //    这一拍照样把整段起起来。Once 保证两条路只走一次。
      ch4_luo_16(s) {
        BeginCh4Rescue(s);
        s.mem.luoSavedAt = s.mem.rescueAt || s.Time();
      },
      // ⑧ 收尾：罗班长腹部中弹。他从这一拍起是**伤员**，不是战斗员。
      //    枪也在这一拍之前还给玩家了（EndCh4Rescue 里那一下）。
      ch4_luo_17(s) {
        EndCh4Rescue(s, "luoWounded");
        s.mem.luoWounded = true;
        // 抬他的人：幺娃 + 一名士兵。抬的人被打倒时要有第二个人接手 ——
        // 「担架落地卡住流程」是这一段唯一不许出现的失败态。
        s.d.host.CarryLeader?.({
          who: "luo", bearers: ["yaowa"], to: "C4_AidStation",
          OnStalled: () => s.d.host.CarryLeader?.({ who: "luo", bearers: ["heyoutian"], to: "C4_AidStation" }),
        });
        s.companion?.Detach("yaowa");
      },
      // ⑪ 「枪给我。」—— 本关最后一句。罗班长在这一拍之后**永久缺席**：
      //    五关起他不该再出现在任何一章的名册里（CompanionDirector.SetAbsent
      //    是跨关保留的，只有重开一局或选章回到他还活着的那一章才撤销）。
      ch4_shunzi_15(s) {
        s.companion?.Fell("luo");
        s.companion?.SetAbsent("luo");
        s.d.host.MarkPersistent?.("luoFallen", true);
      },
    },

    // ⑧ 罗班长往玩家脚下跑 + 「枪一定要还回来」的看门狗。
    Update(s) { UpdateCh4Rescue(s); },
  },

  // =========================================================================
  // 第五关｜城墙没有了
  //
  //   ①  A 区废墟：罗班长遗体盖白布（四关那一拍的物证）
  //   ③  B 区母题道具沿路（烧黑弹药箱 / 纸灰 / 碎碗）—— 布设层出件，这里只查
  //   ⑤  escortConvoy：复用一关那台队列控制器
  //   ⑥⑩ 机枪位（S2 示例照抄）＋ ForceJam 挂「最后防守第二层」
  //   ⑦  生路三重确认
  //   ⑧  TurnedBack → CS_Ch5_TurnBack（关中过场）
  //   ⑪  钉关：坚持到最后一副担架离开视野
  //   ⑪  终局手感：体力恢复上限递减 + 两侧压上的波次（章节作用域，换关还原）
  //   ⑫  povChain 三段（1 s 黑帧＋身份字卡＋落地朝向）→ ChapterRelease
  // =========================================================================
  CH5_Chengqiang: {
    id: "CH5_Chengqiang",

    Setup(s) {
      // A 区第三次出场：**废墟**（塌了半边、药箱空着、电话线断在门框上）。
      DressAidYard(s, "CH5_Chengqiang");

      // ① 罗班长的遗体：门板担架上盖着白布。**没有交互** —— 策划案原话
      //    「没有人去掀」。它只是摆在那儿，玩家自己认出来。
      const bier = s.Near("C5_AidRuin", -4, 7);
      if (bier) {
        s.mem.bier = s.Prop({
          id: "ch5_luoBier", kind: "shroudedBody", position: bier,
          label: "盖白布的门板担架", note: "四关抬回来的那一个。不可交互。",
        });
      }

      // ③ 穿过旧场景（dressingEcho）。策划案要求路过第二/三/四关的旧场景，
      //    但 B 区集结院与东关外壕都在本章切片（maxX 285）之外 —— 本章头注
      //    ENGINE_REQUEST 10 定的折中是：A 区 → 十字街口这一段路边摆上**同一组母题**。
      //    三条 env beat 点的就是它们（「街垒塌了…」「烧黑的弹药箱…」「碎碗…」），
      //    摆件不到位那三条就成了空话。
      //    坐标沿 A 区(214,-18) → 十字街口(0,0) 那条线，按行程三等分摆。
      const echo = [
        // 第二关的母题：塌掉的投弹街垒 + 手榴弹箱的碎木
        { id: "ch5_echo_barricade", kind: "debris", x: 152, z: -14, size: [3.6, 0.9, 1.4], color: 0x6f665a },
        { id: "ch5_echo_crateWreck", kind: "debris", x: 147, z: -10, size: [1.2, 0.4, 0.9], color: 0x4a3d2c },
        // 第四关 B 区的母题：**烧黑的弹药箱**、压在盖上的纸灰
        { id: "ch5_echo_burntCrate", kind: "box", x: 96, z: -6, color: 0x2b2521 },
        { id: "ch5_echo_burntCrate2", kind: "box", x: 93, z: -3, rotationY: 0.6, color: 0x2b2521 },
        { id: "ch5_echo_ash", kind: "plane", x: 95, z: -5, size: [1.6, 1.2], color: 0x50493f },
        // 第三关救护所的母题：碎碗、半只搪瓷缸、塌了一半的院墙
        { id: "ch5_echo_bowl", kind: "debris", x: 46, z: 2, size: [0.5, 0.12, 0.5], color: 0xbdb6a4 },
        { id: "ch5_echo_mug", kind: "debris", x: 44, z: 4, size: [0.3, 0.16, 0.3], color: 0xc8c2b2 },
        { id: "ch5_echo_wall", kind: "debris", x: 40, z: -6, size: [4.0, 1.2, 0.8], color: 0x7a7264 },
      ];
      for (const item of echo) {
        s.Prop({ ...item, position: { x: item.x, y: Num(s.d.host.Ground?.(item.x, item.z), 0), z: item.z } });
      }

      // ⑤ 后送队：A 区 → 十字街口 → 西街长街 → 城门内侧 → 城外。
      //    与一关同一台控制器（EscortColumn），只是路点与人数不同。
      s.mem.column = s.Column({
        waypoints: [
          s.Zone("C5_AidRuin"), s.Zone("C5_Crossroad"), s.Zone("C5_WestStreet"),
          s.Zone("C5_GunNest"), s.Zone("C5_GateInner"), s.Zone("C5_GateOut"),
        ].filter(Boolean).map((z) => ({ x: z.x, z: z.z })),
        members: [
          { role: "bearer", label: "担架员", weapon: null },
          { role: "bearer", label: "担架员", weapon: null },
          { role: "bearer", label: "担架员", weapon: null },
          { role: "bearer", label: "担架员", weapon: null },
          { role: "guard", label: "幺娃", weapon: "HanYang" },
          { role: "walking", label: "可行走伤兵", weapon: null },
          { role: "walking", label: "可行走伤兵", weapon: null },
          { role: "civilian", label: "医护兵", weapon: null },
        ],
      });

      // ⑥ 最后一个火力点（Script_Emplacement 的摆点示例照抄）。
      //    街心那道街垒后头，面朝东 —— 日军是从长街那头压过来的。
      const nest = s.Zone("C5_GunNest");
      if (nest && s.emplacement) {
        s.mem.gunId = s.emplacement.CreateEmplacement({
          id: "ch5_lastNest", tag: s.tag, kindId: "Type92Hmg",
          position: { x: nest.x, y: Num(s.d.host.Ground?.(nest.x, nest.z), 0), z: nest.z },
          baseYaw: -Math.PI / 2,
          arcYawDeg: 34, belts: 4,
          OnOccupy: () => {
            s.Signal("GunNestTaken");
            s.mem.gunTakenAt = s.Time();
          },
          OnDead: () => s.Signal("GunJam"),
        });
        s.Register(EmplacementInteraction({
          id: "ch5_lastNest_take", emplacement: s.emplacement, gunId: s.mem.gunId,
          carry: s.carry,
        }));
        s.Register(AmmoResupplyInteraction({
          id: "ch5_lastNest_ammo", emplacement: s.emplacement, gunId: s.mem.gunId,
          position: { x: nest.x - 2, y: Num(s.d.host.Ground?.(nest.x - 2, nest.z + 2), 0), z: nest.z + 2 },
        }));
      }

      // ⑦ 生路的三重确认里那一条**工程事实**：西关城门要真的开着。
      //    门是贴图的话，「玩家真的走到城门内侧」这件事就不成立（§0 验收 5）。
      s.d.host.OpenGate?.("westGate");
      s.mem.column?.Start();
    },

    onZone: {
      // ⑦ ②画面 —— 玩家站到城门内侧，门外的路与后送队都在视野里。
      C5_GateInner(s) { s.Once("ch5_escapeSeen", (ss) => ss.Signal("EscapeSeen")); },
      // ⑧ 玩家已经在城门外了：任务写着【撤出滕县】，路就在脚下。
      //    这一刻身后的机枪停下 —— 但**任务文字先不改**（要有几秒钟是「还可以走」）。
      C5_GateOut(s) {
        s.Once("ch5_mgSilent", (ss) => {
          ss.Signal("MgSilent");
          ss.d.host.SilenceCoverFire?.(true);
          ss.mem.mgSilentAt = ss.Time();
        });
      },
      C5_ReturnGun(s) { s.Once("ch5_returned", (ss) => { ss.mem.backAtGun = ss.Time(); }); },
    },

    onVoice: {
      // ⑥ 排长「够了！你的差事完了！」→ 后送队继续往城外走。
      ch5_paizhang_13(s) { s.mem.column && (s.mem.column.moving = true); },
      // ⑧ 顺子「老子回去压住！」—— **转身就发生在这一拍**。
      //    CHAPTER.cutsceneMid = { id:"CS_Ch5_TurnBack", signal:"TurnedBack" }，
      //    所以推这条信号就等于请求宿主播那一场（播完还完全控制权）。
      ch5_shunzi_07(s) {
        s.Signal("TurnedBack");
        s.d.host.SilenceCoverFire?.(false);
        // ⑪ 终局手感从这一拍起算：体力恢复上限逐档往下压、两侧的波次开钟。
        //    **章节作用域**，收在 ch5_shunzi_18（他倒下）与换关时还原。
        BeginCh5LastStand(s);
      },
      // ⑩② 最后防守第二层：机枪卡壳 + 弹尽。**脚本把这挺枪弄坏**，
      //     不许替玩家离位 —— 拉几下枪机、什么时候弃枪是玩家自己的事。
      ch5_shunzi_11(s) {
        s.After(6.0, (ss) => {
          if (ss.mem.gunId) ss.emplacement?.ForceJam(ss.mem.gunId);
          ss.Signal("GunJam");
        }, "ch5_forceJam");
      },
      // ⑩③ 最后一名友军倒下。
      ch5_shunzi_14(s) { s.Signal("LastFriendDown"); },
      // ⑩③ 装上刺刀，四连吼开始。
      ch5_shunzi_15(s) { s.Signal("BayonetFixed"); s.d.host.SetMeleeGate?.(true); },
      // ⑪ 中弹倒地（不切黑）。终局那两条借来的旋钮在这一拍还回去 ——
      //    接下来是另外三个人，他们不该继承顺子那条压下去的体力线。
      ch5_shunzi_18(s) {
        s.After(24, (ss) => {
          ss.Signal("ShunziDown");
          ss.d.host.GroundPov?.({ seconds: 5.0, blackOut: false });
          // **他倒下的那一刻**才把终局那两条借来的旋钮还回去 —— 不是他说那句话的
          // 时候（那之后还有二十多秒白刃要打，提前还等于把最后那一段松开了）。
          // 后面三段接替是另外三个人，不该继承顺子那条压下去的体力线。
          EndCh5LastStand(ss);
        }, "ch5_shunziDown");
      },
      // ⑫ 视角接替三段。**每一段都是玩家控制**：一秒黑帧＋身份字卡 → 换出生点
      //    ＋朝向 → 一段短活。口径见 SwitchPovWithCard 上面那段注释。
      ch5_canmou_01(s) {
        s.Signal("PovGunner");
        const at = s.Near("C5_WestStreet", 8, 2.4);
        SwitchPovWithCard(s, {
          id: "gunner", cast: "s124", label: "一二四师机枪副射手",
          card: "CS_Ch5_PovGunnerCard", at, task: "接过机枪，打完这一梭",
          // 面朝十字街口（东）—— 日军是从那头压过来的。背着街坐下就等于没有这一段。
          face: s.Zone("C5_Crossroad"),
        });
      },
      ch5_xiaoqin_01(s) {
        s.Signal("PovLineman");
        // 位置对着关末那一场（CS_Ch5_PovChain 镜 3/4 的电话兵就在这一带），
        // 玩家上一眼看见的院子与他这一刻站的院子是同一个。
        const at = s.Near("C5_Crossroad", -94, -3.4);
        SwitchPovWithCard(s, {
          id: "lineman", cast: "xiaoqin", label: "前沿电话兵",
          card: "CS_Ch5_PovLinemanCard", at, task: "把伤亡报告递进院子",
          // 面朝院子深处（炊事兵拿枪、医护兵搬弹的那一头）。
          face: at ? { x: at.x - 4.5, z: at.z - 4.0 } : null,
        });
      },
      ch5_xiaoqin_02(s) {
        s.Signal("PovXiaoqin");
        const at = s.Near("C5_AidRuin", 4, -6);
        SwitchPovWithCard(s, {
          id: "xiaoqin", cast: "xiaoqin", label: "通信兵小秦",
          card: "CS_Ch5_PovXiaoqinCard", at, task: "接线：东关回话",
          // 面朝 A 区那半截电话杆（AID_YARD.CH5_Chengqiang 的 a5_phonePost）。
          face: s.Near("C5_AidRuin", 12.5, 1.0),
        });
      },
      // ⑫ 小秦喊完「听到回话！」—— **钉关放行就在这一拍**。
      //    在这之前 mechanics.pinFinalZone 把关卡钉着：走到最后一个路标不换关，
      //    阶段⑩⑪⑫（最后防守三层、最终白刃、视角接替）才演得完。
      ch5_xiaoqin_03(s) {
        s.After(4.0, (ss) => ss.Signal("ChapterRelease"), "ch5_release");
      },
    },

    Update(s, dt) {
      s.mem.column?.Update(dt);
      // ⑪ 终局手感：体力恢复上限递减 + 两侧压上的波次（章节作用域，见上面那段注释）。
      UpdateCh5LastStand(s);
      // ⑪ 唯一判定：**坚持到最后一副担架离开视野**（不是打赢）。
      // 队列走完全部路点 = 最后一副担架出了西关。
      if (s.mem.column?.arrived) {
        s.Once("ch5_lastLitter", (ss) => ss.Signal("LastLitterPassed"));
      }
      // 保险：小秦那一句被 FlushTail 之类的路径吞掉时，钉关也要放得开。
      // 装配层另有一道 240 s 的保险丝，这一条只是更早、更安静的一层。
      if (s.LevelTime() > Num(s.phase?.minutes, 20) * 60 + 60) {
        s.Once("ch5_releaseFuse", (ss) => ss.Signal("ChapterRelease"));
      }
    },
  },

  // =========================================================================
  // 终章｜最后一封
  //
  //   ①  前两封底稿可看（draftReading）
  //   ③  WireConfirm → CS_Ch6_LastWire（关中过场）
  //   ④  telegraph：电键 + 接头（S4 示例照抄）
  //   ⑤  cipherDisposal：密码本 / 底稿 / 呼号表三件
  //   ⑥  FlankMg → CS_Ch6_Xiguan（关中过场）→ groundPov
  // =========================================================================
  CH6_Zuihou: {
    id: "CH6_Zuihou",

    Setup(s) {
      const hq = s.Zone("C6_DivisionHq");
      if (!hq) return;
      const y = Num(s.d.host.Ground?.(hq.x, hq.z), 0);
      const key = { x: hq.x + 4, y, z: hq.z - 3 };
      const jack = { x: hq.x + 3.4, y, z: hq.z - 3.4 };

      // ① 前两封电报的底稿：走近可以看。完整电文进历史档案，不做全文界面。
      for (let i = 0; i < 2; i += 1) {
        const at = { x: hq.x + 1.2 + i * 0.9, y, z: hq.z - 1.6 };
        // 「案上压着前两封的底稿」—— 摊在桌上，所以是 plane。
        s.Prop({
          id: `ch6_draft${i}`, kind: "plane", position: at,
          texture: "./Texture/Tex_PaperLetter.png", size: [0.22, 0.30],
        });
        s.Register(CheckWoundedInteraction({
          id: `ch6_draft${i}`, position: at, seconds: 0.8, label: "看底稿",
          OnComplete: () => {
            s.mem.drafts = (s.mem.drafts || 0) + 1;
            s.Hint(i === 0 ? "底稿一：报敌情，请援。" : "底稿二：再请援。落款是同一个人。", 4.0);
            if (s.mem.drafts >= 1) s.Signal("DraftsRead");
          },
        }));
      }

      // ④ 发报。码组是**章节数据**，不是引擎数字。
      if (s.telegraph) {
        s.telegraph.BeginTelegraph({
          id: "ch6_lastwire", label: "最后一封",
          groups: ["2429", "1560", "3016", "0022", "4837"],
          position: key,
          breakAfterGroup: 2,
          OnGroup: (i) => s.Hint(`第${i}组　对上了。`, 2.2),
          OnDisconnect: () => s.Signal("WireBreak"),
          OnComplete: () => s.Signal("WireSent"),
        });
        s.Register(TelegraphKeyInteraction({ telegraph: s.telegraph, position: key }));
        s.Register(TelegraphReconnectInteraction({ telegraph: s.telegraph, position: jack }));
      }

      // ⑤ 密码材料三件：任意顺序，三件都处理完才开西门大街的通路。
      const cipher = ["密码本", "底稿", "呼号表"];
      cipher.forEach((label, i) => {
        const at = { x: hq.x - 2 - i * 1.4, y, z: hq.z + 2 };
        s.Register(CutWireInteraction({
          id: `ch6_cipher${i}`, position: at, seconds: 1.4, label: `烧掉${label}`,
          OnComplete: () => {
            s.mem.burned = (s.mem.burned || 0) + 1;
            s.d.host.Firewall?.({ id: `ch6_burn${i}`, from: at, to: at, seconds: 8, damagePlayer: false });
            if (s.mem.burned >= cipher.length) {
              s.Signal("CipherDone");
              s.d.host.OpenGate?.("ch6_hqDoor");
            }
          },
        }));
      });
      // 带不走的机器给一次「砸」的近战交互。
      s.Register(CheckWoundedInteraction({
        id: "ch6_smashSet", position: { x: hq.x + 4.6, y, z: hq.z - 2.2 },
        seconds: 1.2, label: "砸掉带不走的电台",
        OnComplete: () => { s.mem.setSmashed = true; s.d.host.PlaySfx?.("impactMetal", { volume: 0.8 }); },
      }));
    },

    onZone: {
      // ⑥ 电灯厂附近，侧面机枪突然开火 → 关中过场 → 地面视角数秒再切黑。
      C6_PowerPlant(s) {
        s.Once("ch6_flankMg", (ss) => {
          // Signal 一条就够：CS_Ch6_Xiguan 登记在 Data_MissionCh6.EVENTS 的
          // FlankMg 上（cutscene 字段），关内那条 cutscene beat 是同一场的
          // 另一条入口 —— cutsceneFired 保证只播一次。
          ss.Signal("FlankMg");
          ss.After(11.5, (s2) => s2.d.host.GroundPov?.({ seconds: 5.0, blackOut: true }), "ch6_groundPov");
        });
      },
    },

    onVoice: {
      // ③ 四问的最后一问答完 → 复诵那一场（关中过场）。
      ch6_canmou_07(s) {
        s.After(2.4, (ss) => ss.Signal("WireConfirm"), "ch6_wireConfirm");
      },
      // ⑤ 师部挨炮：烧密码材料是被炮打出来的，不是流程安排的。
      ch6_wangmingzhang_06(s) {
        s.After(3.0, (ss) => {
          ss.Signal("HqShelled");
          ss.d.host.Shell?.({ at: ss.Near("C6_DivisionHq", 14, 10), count: 2 });
        }, "ch6_hqShelled");
      },
    },

    Update() {},
  },
};

// ---------------------------------------------------------------------------
// 导演
// ---------------------------------------------------------------------------

/**
 * host 是装配层注入的窄接口。**每一条都是可选的** —— 全不给也跑得完
 *（纯规则测试就是这么跑的），缺哪一条就是那一件事不发生，不报错。
 *
 * 时间与位置
 *   Time() -> number                 全局秒表（state.elapsed）
 *   LevelTime() -> number            关内秒表（state.phaseTime）
 *   PlayerPos() -> {x,y,z}|null
 *   PlayerZone() -> string|null      玩家此刻在哪个路标圈里
 *   Ground(x, z) -> number
 *
 * 玩法系统（取值器，**不许拷值**：它们每关重建，拷出去会指到上一关）
 *   Story() Carry() Interact() Emplacement() Strafe() Flare() Telegraph()
 *   Companion() Checkpoint()
 *
 * 演员与道具
 *   SpawnActor({label,x,z,weapon,squadId}) -> handle|null
 *   Despawn(handle) / PositionOf(handle) / Alive(handle) / SetGoal(handle,x,z)
 *   Prop(spec) -> handle|null        摆一件关内道具（贴图纸片、白布担架…）
 *   SetPropState(id, state)          既有道具改状态（门板拆掉）
 *   MarkPersistent(key, value)       跨关记一笔（拆过几块门板、罗班长倒下了）
 *
 * 演出
 *   Hint(text, seconds) / Say(who, text, seconds) / PlaySfx(name, opts)
 *   PlayCutscene(id)                 关中过场（= window.Taierzhuang.PlayMidCutscene）
 *   SetCombatBed(on, fadeS)          交火声床整层淡入/淡出（三关声音先行段）
 *   Firewall(spec) / Shell(spec) / OpenGate(id) / SilenceCoverFire(on)
 *   VolleyThrow(spec)                让一片友军同时投弹（二关「甩！」）
 *   CarryLeader(spec)                AI 抬人（四关罗班长）
 *   SwitchPov(spec)                  视角接替（五关⑫）
 *   GroundPov(spec)                  击倒后的地面视角
 *   SetMeleeGate(on)                 白刃 QTE 的正片开关
 *   SetPlayerInvulnerable(on, secs)  固定事件那 4—6 秒
 *   EnemiesNear(x, z, r) -> number   这一片还有几个活着的日军
 *   TakeItem(id) -> boolean          从背包里扣一件（民用短褂）
 *
 * ── 2026-08-29 抛光批 P1 要的三条（**装配层还没接线**）──────────────────────
 * 三条都写成可选，没接线时那件事静默不发生（与本层其余每一条一致）。
 * 各只要 Script_Main 的 setpieces host 里加一行：
 *
 *   Detonate({at,radius,damage,kind}) -> boolean
 *       立刻在 at 炸一下（二关弹药箱殉爆）。走 Combat.Blast，与日军的炮弹同一条链路：
 *         Detonate: ({ at, radius = 7.5, damage = 130, kind = "shell" }) =>
 *           !!combat?.Blast(new THREE.Vector3(at.x, at.y ?? 0, at.z), radius, damage, kind),
 *       没接线时退到 `Shell`（CallIncoming，带 2.6 s 飞行与一声呼啸，
 *       所以摆点层会提前那么多秒下单）—— 能用，只是多一声不该有的呼啸。
 *
 *   SetStaminaCeiling(v)             体力**恢复的上限**（1 = 常态）。五关终局章节作用域：
 *         SetStaminaCeiling: (v) => { if (player) player.staminaCeiling = Math.max(0.2, Math.min(1, v)); },
 *       另需 Script_Player 那一行 `Clamp01(this.stamina + ...)` 改成夹到
 *       `this.staminaCeiling ?? 1`。**不许动 DIFFICULTY.staminaSeconds**（那是全作手感）。
 *
 *   SpawnEnemy({x,z,weapon,squadId}) -> handle|null   撒一个**日军**（五关终局两侧的波次）。
 *       现有的 SpawnActor 写死 `ai.Spawn("nra", ...)`，这一层够不着任何一个日军个体；
 *       四关阶段⑧「点名一个日军从烟尘里走近再被撞开」缺的也是它。
 *         SpawnEnemy: ({ x, z, weapon, squadId }) => ai?.Spawn("ija", x, z, { weapon, squadId }) ?? null,
 *
 * 另：`SwitchPov` 现在多收一个 `yaw`（落地朝向，口径同 spawn.ry）。装配层读它之前
 * 它只是个被忽略的属性 —— 表现是接替过去的人背着战场站着（见 SwitchPovWithCard）。
 *
 * ── 已作废 ──────────────────────────────────────────────────────────────────
 *   CookingCrate() —— 由 Script_BlastTargets 取代：弹药箱现在是**真的打得中的实体**，
 *   destruction 每炸一次就把事实喂进那张登记表，不再需要宿主自己报「哪只在冒烟」。
 */
export class MissionSetpieceDirector {
  constructor(host = {}) {
    this.host = host;
    /** 摆点层自己的旋钮。章节数据只写常量名，不写数（AGENTS 硬规矩 12）。 */
    this.tuning = { ...SETPIECE_TUNING, ...(host.tuning || {}) };
    this.levelId = null;
    this.phase = null;
    this.spec = null;
    this.ctx = null;
    this.mem = {};
    this.once = new Set();
    this.timers = [];
    this.columns = [];
    /** 已经播过的台词 key（onVoice 的判据）。 */
    this.spoken = new Set();
    /** story.fired 读到第几条了 —— 每帧只看新增的那几条。 */
    this.firedCursor = 0;
    /** 已经进过的路标（onZone 只触发第一次）。 */
    this.zonesSeen = new Set();
    /** 取证：这一关推了哪些信号、摆了几个点。 */
    this.signals = [];
    this.log = [];
  }

  /** 这一章有没有摆点表（序章那一条是**故意**空的，不算没有）。 */
  static Has(levelId) {
    return Object.prototype.hasOwnProperty.call(SETPIECES, levelId);
  }

  /**
   * 换关：清掉上一章的一切，摆这一章的。
   *
   * @param {string} levelId
   * @param {object} phase 本章的关卡表条目（要的只有 zones / minutes / mechanics）
   */
  BeginLevel(levelId, phase = null) {
    this.Reset("levelChange");
    this.levelId = levelId || null;
    this.phase = phase;
    this.spec = SETPIECES[this.levelId] || null;
    // 台词游标从**现在**起算。`story.fired` 是一本不清的全局流水账，
    // 从 0 开始扫的话，选章跳回一个已经玩过的章会把它上一遍的台词
    // 当成刚播的重演一遍 —— 表现是「一进关罗班长就已经牺牲了」。
    this.firedCursor = this.host.Story?.()?.fired?.length ?? 0;
    if (!this.spec) {
      this.log.push({ levelId, ok: false, why: "没有这一章的摆点表" });
      return false;
    }
    // 上下文**一关一个**，不是一帧一个：Update 是每帧路径，而这个门面
    // 自己没有任何 per-frame 状态（mem 是导演的，系统全走取值器）。
    this.ctx = new SetpieceContext(this);
    const s = this.ctx;
    try {
      this.spec.Setup?.(s);
    } catch (err) {
      // 摆点炸了不该把一关带走：吞掉、留痕、继续玩（台词与目标链不依赖这一层）。
      this.log.push({ levelId, ok: false, why: `Setup 抛异常：${String((err && err.message) || err)}` });
      return false;
    }
    this.log.push({ levelId, ok: true, points: this.host.Interact?.()?.PointCount ?? null });
    return true;
  }

  /** 换关/收摊。**交互点按本章 tag 清**，别把别的章的点一起摘掉。 */
  Reset(reason = "reset") {
    for (const column of this.columns) column.Reset();
    this.columns.length = 0;
    // 五关终局借走的那条体力上限**一定要还** —— 忘了还的症状是「下一关一进去
    // 就跑两步喘不上气」，而下一关的数据里根本没有这回事。
    if (this.mem && this.mem.staminaCeil !== undefined && this.mem.staminaCeil !== 1) {
      try { this.host.SetStaminaCeiling?.(1); } catch { /* 宿主的事 */ }
    }
    if (this.levelId) {
      try { this.host.Interact?.()?.Clear(this.levelId); } catch { /* 宿主的事 */ }
      // 可被炸中的物件也按本章 tag 清。**漏了这一条的症状很隐蔽**：
      // 上一关那只弹药箱还在表里，下一关同一片地方一炸，它的 OnDestroyed 会
      // 往一个已经换过的 mem 上写字（那个闭包捕获的是上一关的 s）。
      BLAST_TARGETS.Clear(this.levelId);
    }
    this.levelId = null;
    this.phase = null;
    this.spec = null;
    this.ctx = null;
    this.mem = {};
    this.once.clear();
    this.timers.length = 0;
    this.spoken.clear();
    this.firedCursor = 0;
    this.zonesSeen.clear();
    this.signals.length = 0;
    return reason;
  }

  Update(dt) {
    if (!this.spec || !this.ctx) return false;
    const s = this.ctx;

    // --- 台词节拍：只看 story.fired 新增的那几条 -----------------------------
    const story = this.host.Story?.();
    const fired = story ? story.fired : null;
    if (fired) {
      // 换关时 story.fired **不清**（它是全局流水账），所以游标只往前走。
      for (let i = this.firedCursor; i < fired.length; i += 1) {
        const beat = fired[i];
        if (!beat || !beat.voice) continue;
        this.spoken.add(beat.voice);
        const hook = this.spec.onVoice && this.spec.onVoice[beat.voice];
        if (hook) this._Safe(() => hook(s), `onVoice:${beat.voice}`);
      }
      this.firedCursor = fired.length;
    }

    // --- 路标：只触发第一次 --------------------------------------------------
    const zone = this.host.PlayerZone?.();
    const contentZone = this.phase?.zones?.find((item) => item?.id === zone)?.contentZoneId || zone;
    if (contentZone && !this.zonesSeen.has(contentZone)) {
      this.zonesSeen.add(contentZone);
      const hook = this.spec.onZone && this.spec.onZone[contentZone];
      if (hook) this._Safe(() => hook(s), `onZone:${contentZone}`);
    }

    // --- 定时器 --------------------------------------------------------------
    if (this.timers.length) {
      const now = Num(this.host.Time?.(), 0);
      const due = this.timers.filter((t) => now >= t.at);
      if (due.length) {
        this.timers = this.timers.filter((t) => now < t.at);
        for (const t of due) {
          if (t.key && this.once.has(t.key)) continue;
          if (t.key) this.once.add(t.key);
          this._Safe(() => t.fn?.(s), `timer:${t.key || "?"}`);
        }
      }
    }

    this._Safe(() => this.spec.Update?.(s, dt), "Update");
    return true;
  }

  _Safe(fn, where) {
    try { fn(); } catch (err) {
      this.log.push({ levelId: this.levelId, ok: false, why: `${where}：${String((err && err.message) || err)}` });
    }
  }

  /** 取证口（Debug.Setpieces）。 */
  State() {
    return {
      levelId: this.levelId,
      has: !!this.spec,
      once: [...this.once],
      spoken: this.spoken.size,
      zonesSeen: [...this.zonesSeen],
      signals: this.signals.slice(),
      timers: this.timers.length,
      columns: this.columns.map((c) => c.State()),
      mem: Object.fromEntries(Object.entries(this.mem)
        .filter(([, v]) => typeof v !== "object" || v === null)),
      log: this.log.slice(-12),
    };
  }
}

export default MissionSetpieceDirector;
