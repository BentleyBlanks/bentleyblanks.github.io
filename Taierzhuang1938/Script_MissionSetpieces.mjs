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

import { PickUpLoadInteraction, GiveSupplyInteraction } from "./Script_Interact.mjs";
// 「可被炸中的场景物件」登记表（纯规则，destruction 那一侧每炸一次就喂它一笔）。
// 二关阶段③的殉爆倒计时靠它才有一只**真的打得中**的弹药箱 ——
// 分工与为什么不是一条 host 回调，写在 Script_BlastTargets.mjs 的头注里。
import { BLAST_TARGETS } from "./Script_BlastTargets.mjs";
import { P012SouthPoint } from "./Data_FirstLevelP012Space.mjs";
import { P012SegmentClear, P012NextVisiblePoint, P012RouteProjection, P012RoutePoint } from "./Script_FirstLevelP012March.mjs";
import { CARRY_KINDS } from "./Script_Carry.mjs";

// The actual civilian hit by the aircraft remains the same living actor.
// Carry owns attachment only while that named load is in the player's hands;
// an early drop leaves the casualty at the actual drop point for another pickup.
export function StepP012AirCivilian(s) {
  const casualty=s.mem.p012AirCivilian,actor=casualty?.member?.handle;
  if(!casualty?.injured||!actor)return false;
  const carrying=actor.alive!==false&&s.carry?.KindId==="wounded"
    &&s.carry?.load?.payload?.who==="p012AirCivilian";
  actor.p012CarriedCasualty=carrying;
  actor.p012Guided=true;actor.scriptMoveSpeedMps=0;actor.scriptArrivalRadius=.15;
  actor.scriptDefensive=false;actor.scriptedNoncombatant=true;
  actor.stance=2;actor.proneBlend=1;actor.crouchBlend=0;
  const at=s.d.host.PositionOf?.(actor);
  if(at&&casualty.carried&&!carrying){
    const ground=s.d.host.Ground?.(at.x,at.z)||0,blocks=s.phase?.whitebox?.layout?.blocks||[];
    // Lay the original body along a clear axis at the actual drop position.
    // Keeping its cross-shoulder yaw can leave its feet through the bank wall.
    const yaw=[actor.yaw||0,0,Math.PI/2,Math.PI,-Math.PI/2].find(yaw=>P012SegmentClear(blocks,
      {x:at.x-Math.sin(yaw)*1.1,y:ground,z:at.z-Math.cos(yaw)*1.1},
      {x:at.x+Math.sin(yaw)*1.1,y:ground,z:at.z+Math.cos(yaw)*1.1},.25));
    if(yaw!==undefined){actor.yaw=yaw;actor.lookYaw=0;}
  }
  if(at){casualty.position={...at};s.d.host.SetGoal?.(actor,at.x,at.z);}
  casualty.carried=carrying;
  return true;
}

// The surviving front holder walks the same physical route as the player.
// Camera turns never drag an actor around, and rendering reads both real ends.
export function StepP012PlayerLitter(s) {
  const litter=s.mem.p012CarriedLitter,load=s.carry?.load;
  if(!litter||s.carry?.KindId!=="stretcher")return false;
  const front=litter.front?.handle,at=front&&s.d.host.PositionOf?.(front),rear=s.PlayerPos();
  if(!front?.alive||!at||!rear)return false;
  const activity=s.phase.whitebox.activities,pose=activity.stretcherCarryPose||{};
  const span=pose.bearerSpanM||CARRY_KINDS.stretcher.spanM;
  if(s.mem.p012CarrySerial!==load?.serial||!s.mem.p012PlayerCarryPath){
    const final=s.d.host.Story?.()?.Signalled("P012Regripped");
    const path=[{...rear},...(final?[s.phase.whitebox.anchors.shelter]:activity.stretcherCarryRoute)];
    const end=path.at(-1),previous=path.at(-2),dx=end.x-previous.x,dz=end.z-previous.z,length=Math.hypot(dx,dz)||1;
    path.push({x:end.x+dx/length*span,z:end.z+dz/length*span});
    s.mem.p012PlayerCarryPath=path;s.mem.p012CarrySerial=load?.serial;
  }
  const path=s.mem.p012PlayerCarryPath,projection=P012RouteProjection(path,rear);
  const goal=P012RoutePoint(path,projection.along+span),self=P012RouteProjection(path,at);
  const corners=path.slice(self.index).filter(point=>P012RouteProjection(path,point).along<projection.along+span);
  const next=P012NextVisiblePoint(s.phase.whitebox.layout.blocks,at,[...corners,goal],0,front.body?.radius||.42);
  const previous=s.mem.p012CarryPartner?.previous || Object.fromEntries(
    ["p012Guided","scriptMoveSpeedMps","scriptArrivalRadius","scriptDefensive","order","carryRole"].map(key=>[key,front[key]]));
  front.p012Guided=true;front.scriptMoveSpeedMps=3.05;front.scriptArrivalRadius=.15;
  front.scriptDefensive=false;front.order="advance";front.carryRole="front";
  if(load)load.partner=front;
  s.d.host.SetGoal?.(front,next.point.x,next.point.z);
  const mid={x:(at.x+rear.x)/2,z:(at.z+rear.z)/2},gy=Math.min(at.y||0,rear.y||0);
  const yaw=Math.atan2(at.x-rear.x,at.z-rear.z);
  litter.lastMid={...mid,gy,yaw};
  s.d.host.MoveProp?.(litter.propLitter,{...mid,y:gy+(pose.litterLiftM??.62),rotationY:yaw,rotationZ:0});
  s.d.host.MoveProp?.(litter.propBody,{...mid,y:gy+(pose.bodyLiftM??.84),rotationY:yaw,rotationZ:0});
  s.mem.p012CarryPartner={actor:front,previous,spanM:Math.hypot(at.x-rear.x,at.z-rear.z),blocked:!!next.blocked};
  return true;
}

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
      const slotted=column.keepArrivalSlots||column.scriptTerminalQueue;
      const target=slotted ? TerminalSlot(column.waypoints,member.slot.back) : end;
      return member.handle?.alive && member.handle.position
        && Math.hypot(member.handle.position.x - target.x, member.handle.position.z - target.z) < (slotted ? .7 : radius);
    }));
}
export function TerminalSlot(points, back) {
  for(let i=points.length-1;i>0;i--){const a=points[i],b=points[i-1],length=Math.hypot(b.x-a.x,b.z-a.z);
    if(back<=length)return {x:a.x+(b.x-a.x)*back/length,z:a.z+(b.z-a.z)*back/length};back-=length;}
  return {...points[0]};
}

// Near the blind road corner the armed escort must stay with a hurt player.
// A 26m travel gap lets its rear guards round the corner and finish the entire
// firefight before the player can see it. Keep their walking speed unchanged.
export function StepP012RoadEscort(s, HasSignal) {
  const column=s.mem.column,activity=s.phase?.whitebox?.activities;
  if(!s.phase?.whitebox?.p012||!column)return;
  const range=activity?.roadContactEscortRange,head=column.HeadPosition?.(),breach=activity?.roadContactBreach;
  const close=range&&head&&breach&&!HasSignal("P012RoadContactSeen")
    &&Math.hypot(head.x-breach.x,head.z-breach.z)<range.approachM;
  column.scriptEscortWaitM=close?range.waitM:null;
  column.scriptEscortResumeM=close?range.resumeM:null;
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
  const span=s.phase.whitebox.activities?.stretcherCarryPose?.bearerSpanM||1.9;
  const rearGoal = { x: end.x - (end.x - previous.x) / length * span,
    z: end.z - (end.z - previous.z) / length * span };
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
   *   propPrefix 担架/伤员道具 ID 前缀（默认 escort，保留正式后送队契约）
   *   bearerSpanM / litterLiftM / bodyLiftM  可选的本关担架姿态；旧关卡保留默认值
   *   keepArrivalSlots 到达后保留队列槽位；默认 false 保留旧关卡收拢行为
   *   tuning     覆盖 SETPIECE_TUNING 的部分字段
   */
  constructor(host = {}, spec = {}) {
    this.host = host;
    this.tuning = { ...SETPIECE_TUNING, ...(spec.tuning || {}) };
    this.waypoints = (spec.waypoints || []).map((p) => ({ x: Num(p.x), z: Num(p.z) }));
    this.roster = spec.members || [];
    this.propPrefix = String(spec.propPrefix || "escort");
    this.bearerSpanM = Number.isFinite(spec.bearerSpanM) ? spec.bearerSpanM : 1.9;
    this.litterLiftM = Number.isFinite(spec.litterLiftM) ? spec.litterLiftM : .62;
    this.bodyLiftM = Number.isFinite(spec.bodyLiftM) ? spec.bodyLiftM : .84;
    this.keepArrivalSlots = spec.keepArrivalSlots === true;
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
      // 担架员成对走纵列，前后身体按本关搬运姿态留出握把空间；
      // 一对一对沿走线排开，其余角色照旧分两列。
      const slot = entry.role === "bearer"
        ? { back: Math.floor(bearerOrdinal / 2) * 4.2 + (bearerOrdinal % 2) * this.bearerSpanM, lateral: 0 }
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
      if (entry.role === "bearer" && this.keepArrivalSlots) handle.scriptArrivalRadius = .3;
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
          id: `${this.propPrefix}Litter${i / 2}`, kind: "stretcher", position: { x: at.x, z: at.z },
        }) : null,
        propBody: this.host.Prop ? this.host.Prop({
          id: `${this.propPrefix}Casualty${i / 2}`, kind: "shroudedBody", position: { x: at.x, z: at.z },
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
      if (this.moving && gap > (this.scriptEscortWaitM ?? this.tuning.columnWaitM)) this.moving = false;
      else if (!this.moving && gap < (this.scriptEscortResumeM ?? this.tuning.columnResumeM)) this.moving = true;
    }
    if (this.scriptPaused) this.moving = false;
    if (this.followRouteBodies && this.arrived && !this.keepArrivalSlots && !this.scriptPaused && !this.scriptHoldTailSlots) this.tailAdvanceM = Math.min(this.roster.length * 2.2, (this.tailAdvanceM || 0) + this.tuning.columnSpeedMS * dt);
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
      if (!m.handle || !this._Alive(m.handle) || m.p012Injured) continue;
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
      this.host.MoveProp?.(litter.propLitter, { x: mid.x, y: gy + this.litterLiftM, z: mid.z, rotationY: yaw });
      this.host.MoveProp?.(litter.propBody, { x: mid.x, y: gy + this.bodyLiftM, z: mid.z, rotationY: yaw });
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
// 摆点表
//
// **一章一条，每一条都读得完。**
// 2026-09-06：第二到终章的摆点随章节废弃整块删除（在 git 历史 13594c5ae 里）；
// 序章仍是故意为空的一条，第一关那一条由 P0/P1/P2 白盒（contentId = CH1_NanLu）继续使用。
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
      const carryPose = s.phase?.whitebox?.p012 ? s.phase.whitebox.activities?.stretcherCarryPose : null;
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
        keepArrivalSlots: !!s.phase?.whitebox?.p012,
        ...(carryPose || {}),
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
        s.mem.prepWounded = s.Column({ propPrefix: "p012PrepWounded",
          waypoints: [shelter, { x: shelter.x + 0.1, z: shelter.z }],
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
              s.mem.p012CarryDistance = 0; s.mem.p012CarryLast = { ...s.PlayerPos() };s.mem.p012ReleaseAt=null;
              s.Signal("P012StretcherLifted");
            }
            // 抬起来那一刻打一个检查点：阶段八「不躲则从数秒前重来」退到这儿。
            s.checkpoint?.Save();
          },
        }));
      },
    },

    Update(s, dt) {
      const p012 = s.phase?.whitebox?.p012;
      const HasSignal = (name) => s.d.host.Story?.()?.Signalled(name);
      StepP012RoadEscort(s, HasSignal);
      s.mem.column?.Update(dt);
      if(p012)StepP012AirCivilian(s);
      if (p012 && s.mem.p012RetryDive) {
        s.mem.p012RetryDive = false; s.strafe?.Abort("p012Retry");
        s.mem.diveAt = null; s.mem.diveDone = null;
      }
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
      if(p012&&HasSignal("P012RoadContactRelease")&&s.mem.column&&!s.mem.p012RoadContactReleased){
        s.mem.p012RoadContactReleased=true;s.mem.column.scriptPaused=false;
      }
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
      // The first finite pass is information for a real route decision. It
      // starts only after Luo has physically collected the player behind the
      // observation wall, never after the column is already exposed.
      if (p012 && HasSignal("P012AirObserveOpen")) {
        BeginCh1RailPass(s);
        // Keep the actual litters behind the wall while the player decides.
        // The one-shot release must not undo later crowd-fire/dive pauses.
        if(!s.mem.p012AirRouteReleased&&s.mem.column){
          s.mem.column.scriptPaused=!HasSignal("P012AirRouteChosen");
          if(HasSignal("P012AirRouteChosen"))s.mem.p012AirRouteReleased=true;
        }
      }
      if (p012 && HasSignal("SouthCut")) s.Once("p012_columnReturn", (ss) => {
        ss.mem.column.scriptPaused = false;
        ss.mem.column.tuning.columnSpeedMS = ss.phase.whitebox.activities.retreatColumnSpeedMps;
        ss.mem.column?.Repath([...ss.phase.whitebox.returnWaypoints.slice(0, -1), ss.phase.whitebox.activities.regripPosition]);
        ss.mem.column.scriptTerminalQueue = true;
        ss.mem.column.scriptHoldTailSlots = true;
        ss.mem.column.litters.forEach((litter,index)=>[litter.front,litter.rear].forEach((member,end)=>{
          const span=ss.phase.whitebox.activities?.stretcherCarryPose?.bearerSpanM||1.9;
          member.slot.back=index*4.2+end*span;member.slot.lateral=0;member.handle.scriptArrivalRadius=.3;
        }));
      });
      if (p012 && s.mem.p012ReleaseAt && !s.mem.p012ReleaseAt.placed && s.mem.p012CarriedLitter) {
        const point = s.mem.p012ReleaseAt, litter = s.mem.p012CarriedLitter;
        const mid=litter.lastMid || point;
        s.d.host.MoveProp?.(litter.propLitter, { x: mid.x, y: .1, z: mid.z, rotationY: mid.yaw || 0 });
        s.d.host.MoveProp?.(litter.propBody, { x: mid.x, y: .3, z: mid.z, rotationY: mid.yaw || 0 });
        // Input release precedes physical arrival in the ditch. Keep that
        // receipt until this dodge succeeds or fails, across every frame.
        point.placed = true;
      }
      if(p012 && s.mem.p012ReleaseAt && s.mem.p012CarryPartner){
        const actor=s.mem.p012CarryPartner.actor,at=s.d.host.PositionOf?.(actor),point=s.mem.p012ReleaseAt;
        const target={x:point.x+1.2,z:point.z-2.4};
        const next=at&&P012NextVisiblePoint(s.phase.whitebox.layout.blocks,at,[target],0,actor.body?.radius||.42);
        if(next&&!next.blocked)s.d.host.SetGoal?.(actor,next.point.x,next.point.z);
      }
      if (p012 && s.mem.p012CarriedLitter && s.carry?.KindId === "stretcher") {
        const point = s.PlayerPos(), litter = s.mem.p012CarriedLitter;
        const last = s.mem.p012CarryLast;
        const step = last ? Math.hypot(point.x - last.x, point.z - last.z) : 0;
        if (step < 3) s.mem.p012CarryDistance = (s.mem.p012CarryDistance || 0) + step;
        s.mem.p012CarryLast = { ...point };
        StepP012PlayerLitter(s);
      } else if(p012&&s.mem.p012CarryPartner&&!s.mem.p012ReleaseAt){
        const actor=s.mem.p012CarryPartner.actor;
        for(const [key,value] of Object.entries(s.mem.p012CarryPartner.previous)){
          if(value===undefined)delete actor[key];else actor[key]=value;
        }
        delete s.mem.p012CarryPartner;s.mem.p012PlayerCarryPath=null;
      }
      if (p012 && s.mem.p012LitterOverturned && !s.mem.p012LitterRecovered) {
        const litter = s.mem.p012CarriedLitter, column = s.mem.column, point = s.mem.p012FallenAt;
        if (litter && column && point) {
          for (const role of ["front", "rear"]) {
            if (!litter[role]?.handle?.alive) {
              const replacement = column.Alive.find((member) => member.role !== "bearer" && member.role !== "civilian");
              if (replacement) {
                replacement.role = "bearer"; replacement.slot = { ...litter[role].slot }; litter[role] = replacement;
                if(column.keepArrivalSlots)replacement.handle.scriptArrivalRadius=.3;
                replacement.handle.scriptedNoncombatant = true; replacement.handle.unarmed = true;
                replacement.handle.scriptEssential = true;
                replacement.handle.scriptDefensive = false; replacement.handle.target = null;
                replacement.handle.actor?.SetWeapon?.(null);
              }
            }
          }
          let arrived = true;
          const halfSpan=(s.phase.whitebox.activities?.stretcherCarryPose?.bearerSpanM||1.8)/2;
          for (const [role, offset] of [["front", -halfSpan], ["rear", halfSpan]]) {
            const actor = litter[role]?.handle, target = { x: point.x, z: point.z + offset };
            if (!actor?.alive) { arrived = false; continue; }
            const at = s.d.host.PositionOf?.(actor);
            const activity=s.phase.whitebox.activities;
            const route=[...(activity?.airCrowdCoverRoute || []).toReversed(),...(activity?.airRescueRoute || []),target];
            const next=at&&s.phase.whitebox.layout?P012NextVisiblePoint(s.phase.whitebox.layout.blocks,at,route,0,actor.body?.radius||.42):null;
            if(!next?.blocked)s.d.host.SetGoal?.(actor,next?.point.x??target.x,next?.point.z??target.z);
            if (!at || Math.hypot(at.x - target.x, at.z - target.z) > 1.8) arrived = false;
          }
          if (arrived) {
            litter.dropped = false; s.mem.p012LitterRecovered = true;
            s.mem.p012RecoveryReason = "livingReplacementReachedFallenLitter";
            litter.front.handle.carryRole = "front"; litter.rear.handle.carryRole = "rear";
            const pose=s.phase.whitebox.activities?.stretcherCarryPose||{};
            s.d.host.MoveProp?.(litter.propLitter, { ...point, y: pose.litterLiftM??0.62, rotationZ: 0 });
            s.d.host.MoveProp?.(litter.propBody, { ...point, y: pose.bodyLiftM??0.84, rotationZ: 0 });
            s.Signal("P012LitterRecovered");
          }
        }
      }

      // Keep this same recovered patient at the actual ditch, not the stale column head.
      if (p012 && s.mem.p012LitterRecovered && !HasSignal("P012DitchClear")) {
        const point = s.mem.p012FallenAt, litter = s.mem.p012CarriedLitter;
        const halfSpan=(s.phase.whitebox.activities?.stretcherCarryPose?.bearerSpanM||1.8)/2;
        if (point && litter) for (const [role, offset] of [["front", -halfSpan], ["rear", halfSpan]]) {
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
        && (p012 ? HasSignal("P012CrowdReady") : s.Time() - s.mem.railPassDone > 9)) {
        s.mem.crowdTurnAt = s.Time();
        const column = s.mem.column;
        // **点名，不掷骰子**：谁倒下由脚本决定（Script_AircraftStrafe 的白名单）。
        // 一个担架员 + 一个百姓；后面还有戏的人（同伴）一律进 immune。
        const victims = [];
        const bearer = column?.Bearers?.[1] || column?.Bearers?.[0];
        const civilian = column?.Civilians?.[column.Civilians.length - 1];
        if (bearer) victims.push({ ref: bearer.handle, at: 0.30 });
        if (civilian) victims.push({ ref: civilian.handle, at: 0.72,
          ...(p012?{damage:35,lethal:false,part:"legs",OnHit:(actor)=>{
            if(actor.alive===false)return;
            civilian.p012Injured=true;
            s.mem.p012AirCivilian={member:civilian,injured:true,carried:false,delivered:false,
              position:s.d.host.PositionOf?.(actor)};
            StepP012AirCivilian(s);
          }}:{}) });
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
              if (p012) {
                const activity=s.phase.whitebox.activities,cart=activity.airCartPosition;
                s.mem.p012AirObstacle={cart:{...cart},resolved:false};
                // Programmatic whitebox props identify the two different
                // choices. Collision is the matching layout gate and opens on
                // the shared resolution signal.
                s.mem.p012AirCartProp=s.Prop?.({id:"P012AirOverturnedCart",kind:"crate",position:cart,
                  size:[2.1,.9,1.1],color:0xe58b2f,rotationY:.18});
                s.Signal("P012CrowdFire"); s.Signal("P012AircraftCrowdFire"); s.Signal("P012AirObstacleCreated"); s.Signal("StretcherHandoff");
              }
            }
            if (beat === "exit") s.mem.crowdTurnDone = s.Time();
          },
        });
      }

      if (p012 && HasSignal("P012SeekAirCover") && !HasSignal("P012Dived")) {
        const activity=s.phase.whitebox.activities,slots=activity.airCrowdCoverSlots || [];
        for(const [index,member] of (s.mem.column?.Alive || []).filter((m)=>m.role!=="bearer"&&!m.p012Injured).entries()) {
          if(member.role==="civilian" && !HasSignal("P012CrowdFire")) continue;
          const point=slots[index],at=s.d.host.PositionOf?.(member.handle);
          if(point){
            member.handle.scriptedNoncombatant=true;
            // The original people reach separate southern pockets through
            // physical openings; the player's rescue/carry bay stays free.
            const next=at&&P012NextVisiblePoint(s.phase.whitebox.layout.blocks,at,
              [...activity.airCrowdCoverRoute,point],0,member.handle.body?.radius||.42);
            if(next&&!next.blocked)s.d.host.SetGoal?.(member.handle,next.point.x,next.point.z);
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
              const wasCarrying=s.carry?.KindId==="stretcher" || !!s.mem.p012ReleaseAt;
              s.carry?.ForceRelease("dive");
              if (p012) {
                const point = s.mem.p012ReleaseAt || s.PlayerPos(), litter = s.mem.p012CarriedLitter;
                // The same litter is still in hand, or was just released by
                // the player's dive input before the physical dodge resolves.
                if (litter && wasCarrying) {
                  s.d.host.MoveProp?.(litter.propLitter, { x: point.x + 1.2, y: 0.35, z: point.z, rotationZ: Math.PI * 0.6 });
                  s.d.host.MoveProp?.(litter.propBody, { x: point.x + 1.7, y: 0.18, z: point.z + 0.4, rotationZ: 0.35 });
                  s.mem.p012LitterOverturned = true;
                  s.mem.p012ReleaseAt = null;
                  s.mem.p012FallenAt = { x: point.x + 1.2, z: point.z };
                }
                s.Signal("P012Dived");
              }
            },
            // 「不躲则被击倒并从数秒前重来」。**倒带必须发生在把伤害交给
            // 死亡链路之前** —— Script_AircraftStrafe 的 OnPlayerHit 就在那之前调。
            OnPlayerHit: () => {
              s.carry?.ForceRelease("dive");
              if (p012) s.mem.p012ReleaseAt = null;
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
 * 它只是个被忽略的属性 —— 表现是接替过去的人背着战场站着（五关视角接替已随章节废弃删除）。
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
