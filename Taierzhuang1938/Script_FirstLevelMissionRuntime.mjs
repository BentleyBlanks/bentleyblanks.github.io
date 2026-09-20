import { FirstLevelTransition } from "./Script_FirstLevelTransition.mjs";
import { FRONT_SORTIE as Sortie, SortieCrawlBlocked } from "./Data_FirstLevelFrontRoute.mjs";
import { FirstLevelLeaderGuide } from "./Script_FirstLevelLeaderGuide.mjs";
import { CompactGuideRoute } from "./Script_NpcMissionGuide.mjs";
import { MISSION_GUIDE_TUNING as GUIDE } from "./Data_Tuning_MissionGuide.mjs";
import { MissionReturn } from "./Script_MissionReturn.mjs";
import { MISSION_RETURN } from "./Data_Tuning_FirstLevel.mjs";
import { MISSION_RETURN_ROUTES, MISSION_RETURN_PERSON_STAGES, MISSION_RETURN_SQUAD_STAGES, MISSION_RETURN_DISABLED_STAGES } from "./Data_FirstLevelMissionReturn.mjs";
import { MISSION_TRENCH_COVER as TC } from "./Data_FirstLevelMissionTrenchCover.mjs";
import { SquadCoverRoute, SquadCoverBounds, SquadCoverThreat } from "./Script_SquadMarchCover.mjs";
import { SQUAD_COVER_BOUNDS as CB } from "./Data_Tuning_SquadMarch.mjs";
import * as THREE from "three";
import { AiDirector } from "./Script_Ai.mjs";
import { OPENING } from "./Data_FirstLevelOpening.mjs";
import { FirstLevelOpening, SamplePerceptionCurve } from "./Script_FirstLevelOpening.mjs";
// 公开阶段 1–7 的演出（Front 玩法包）。运行时只留构造 / Enter / Update / Draw 四个薄钩子。
import { FirstLevelFrontShow } from "./Script_FirstLevelFrontShow.mjs";
import { FRONT_DEFENDERS, FRONT_GUARD_POSTS, FRONT_SHELLS, FRONT_ASSAULT, FrontAssaultLane, FrontReserveLane, ClearLaneX } from "./Data_FirstLevelMissionFront.mjs";
import {
  MISSION_STAGES,
  MISSION_TUNING as R,
  MISSION_AIRCRAFT_ID,
  MISSION_ENCOUNTERS,
  MISSION_TACTICS,
  MISSION_GUIDANCE,
  MISSION_TRANSFER_THREATS,
  MISSION_PURSUIT_ROUTE,
  MISSION_VERSION,
} from "./Data_FirstLevelMission.mjs";
import { MISSION_STAGE_ROUTES, MissionRegroupCorridor, RegroupGuideRoute } from "./Data_FirstLevelMissionTopology.mjs";
import { MISSION_DIALOGUE } from "./Data_FirstLevelMissionDialogue.mjs";
import {
  MISSION_ANCHORS as A,
  MISSION_ROUTES,
  MISSION_PLACEMENT as P,
  MISSION_SUPPLIES,
} from "./Data_FirstLevelMissionLayout.mjs";
// 编排表（Data_FirstLevelMissionGates）：按步骤生成哪些组、对白记哪些事实、
// 每个事实门的点与半径。运行时与关卡编排工作台共用同一份口径。
import {
  MISSION_STEP_SPAWNS,
  MISSION_ENCOUNTER_ACTIVATION,
  MISSION_VOICE_FACTS,
  MISSION_FACT_GATES,
  MISSION_SCENARIO_SIGNALS,
  MissionGateFamily,
  MissionGateInArea,
} from "./Data_FirstLevelMissionGates.mjs";
import { FirstLevelMissionFlow } from "./Script_FirstLevelMissionFlow.mjs";
import { GuardCrossingPair, FrontReplacementSlots } from "./Script_FirstLevelMissionPacing.mjs";
import { ApplyFirstLevelStageJump } from "./Script_FirstLevelMissionStageJump.mjs";
import {
  FirstLevelMissionColumn,
  MissionRoutePoint,
  MissionRouteLength, MissionRouteProjection, MissionRouteNextIndex,
  MissionGuideSpeed, MissionGuideRoute, MissionSquadRoute, MissionSquadPace, MissionRouteLookahead,
} from "./Script_FirstLevelMissionColumn.mjs";
// 08–14 的演出与通过条件（2026.09.19 第二波 Mid 包）。运行时只留薄钩子：
// 自己步骤的 Enter 分支与 Update 段，逻辑在这两个模块里。
import { FirstLevelVillageBlock, VillageCourtyardCleared, VillagePendingLitters } from "./Script_FirstLevelVillageBlock.mjs";
import { FirstLevelTransferCart } from "./Script_FirstLevelTransferCart.mjs";
import { MELEE_RULES } from "./Data_MeleeCombat.mjs";
import { InstallMissionSentry } from "./Script_FirstLevelMissionPeople.mjs";
import { SquadMarchAi } from "./Script_SquadMarchAi.mjs";
import { FirstLevelMissionView } from "./Script_FirstLevelMissionView.mjs";
import { FirstLevelMissionBattleSound } from "./Script_FirstLevelMissionBattleSound.mjs";
import { FirstLevelMissionVoice } from "./Script_FirstLevelMissionVoice.mjs";
import { FirstLevelMissionMusic } from "./Script_FirstLevelMissionMusic.mjs";
// 15–18（End 包）：运行时只留薄钩子，演出与判定在这几个模块里。
import { EndExtras, EndDressing } from "./Script_FirstLevelEndCast.mjs";
import { FirstLevelQuietMarch } from "./Script_FirstLevelQuietMarch.mjs";
import { FirstLevelReception, ReceptionBedGuideRoute } from "./Script_FirstLevelReception.mjs";
import { FirstLevelBridge } from "./Script_FirstLevelBridge.mjs";
import { FirstLevelNightGate } from "./Script_FirstLevelNightGate.mjs";
import { FirstLevelNightLights } from "./Script_FirstLevelNightLights.mjs";
import { EmplacementInteraction } from "./Script_Emplacement.mjs";
import { Localize, T } from "./Script_Text.mjs";
import { ActionKeyGlyph } from "./Script_Input.mjs";
import { FirstLevelStageTextId } from "./Script_TextIds.mjs";
// Only for `emplaced`: a man married to a machine gun never carries throwables here.
import { WEAPONS } from "./Data_Weapons.mjs";

export function FirstLevelCheckpointVitals(point={},player={},tuning=R){
  const savedHealth=Number.isFinite(point.health)?point.health:player.health;
  const savedBandages=Number.isFinite(point.bandages)?point.bandages:player.bandages;
  const spawnedHealth=Number.isFinite(player.health)?player.health:0;
  const currentBandages=Number.isFinite(player.bandages)?player.bandages:0;
  return {
    // Player.Spawn() already restores a full body. Checkpoint metadata may add
    // resources, but must never turn that fresh body back into the saved wound.
    health:Math.min(100,Math.max(tuning.checkpointRetryHealthMin,spawnedHealth,Number.isFinite(savedHealth)?savedHealth:0)),
    bleeding:0,
    bandages:Math.max(tuning.checkpointRetryBandagesMin,currentBandages,Number.isFinite(savedBandages)?savedBandages:0),
  };
}

export function FirstLevelCheckpointIsSafe(player,directThreat,tuning=R){
  return !(directThreat&&player.health<tuning.checkpointUnsafeSaveHealth);
}
export function FirstLevelCheckpointThreatRange(player,ai){
  const stance=player.stance==="prone"?2:player.stance==="crouch"?1:0;
  return ai.SightRange(stance);
}
export function FirstLevelRifleContribution(shots,stageEntryShots){
  return Number.isFinite(shots)&&Number.isFinite(stageEntryShots)&&shots>stageEntryShots;
}
const Distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
// 剧本走位的到达半径：走到离目标这么近就算到了（MoveActor 写进 actor.scriptArrivalRadius）。
// 需要「正好站在那个点上」的演出走 DriveAmbusherOnto，它按这个数把目标往前推。
const SCRIPT_ARRIVAL_M = 0.45;
const Clamp = (x, a, b) => Math.max(a, Math.min(b, x));
/** 机枪座的座位点。 */
const GUN_SEAT = Object.freeze({ x: 0, z: -127.4 });
/** 台词表里有没有这条 cue。`Script_FirstLevelVoiceTest` 静态扫这里的每一处 Say。 */
const CUE_IDS = new Set(MISSION_DIALOGUE.map((cue) => cue.id));
/** 抬着担架走时的落点：按步骤查表，运行时不挑分支（锚点名，见 MISSION_ANCHORS）。 */
const CARRY_GOALS = Object.freeze({ Carry: "ditch", WallPath: "wallPathEnd", Handover: "zhouDrop" });
/** 抬着走时指引箭头的标签（`firstLevel.guide.<label>`）。 */
const CARRY_GOAL_LABELS = Object.freeze({ Carry: "ditch", WallPath: "wallPath", Handover: "place" });
/** 控制接管的全部 kind（契约 §2）。未知 kind 抛错 —— 不再有「兜底当成 death」。 */
const CONTROL_KINDS = Object.freeze(["trapped", "rescue", "cartRide", "dive", "death", "nightTransition"]);
/** 这几种短接管期间玩家不许被瞄准或打伤（复用出生保护）。 */
const CONTROL_GRACE_KINDS = Object.freeze(["trapped", "rescue", "cartRide", "dive", "death", "nightTransition"]);
export class FirstLevelMissionRuntime {
  constructor(host) {
    Object.assign(this, host);
    this.host = host;
    this.time = 0;
    this.missionReturn = new MissionReturn(MISSION_RETURN);
    this.enemies = new Map();
    this.spawned = new Set();
    this.spawnQueue = [];
    this.waves = null;
    this.guards = [];
    this.controls = null;
    this.completed = false;
    this.failed = false;
    this.squadRoutes = new Map();
    this.column = new FirstLevelMissionColumn();
    // 关尾夜行军的黑屏字幕（参数化：标题/正文从文本表取）。
    this.transition = new FirstLevelTransition();
    // 运行时引用了台词表里没有的 cue（只该在改表改漏时出现，见 Say）。
    this.missingCues = [];
    this.tank = {
      active: false,
      present: false,
      ...P.tankStart,
      immobilized: false,
      turretYaw:Math.atan2(P.tankStart.x-A.forwardNest.x,P.tankStart.z-A.forwardNest.z),
      shots: 0,
      lastShell: -20,
      lastMg: -5,
    };
    this.opening = new FirstLevelOpening(this);
    // 阶段 1–7 的演出总线（Front）。要在 flow.Start() 之前建好：第一步 Trapped 的
    // Enter 马上就会问它要门外那一拍。
    this.frontShow = new FirstLevelFrontShow(this);
    // 08–10 村落改道、11–14 接运与空袭（第二波 Mid 包）。
    this.village = new FirstLevelVillageBlock(this);
    this.transferCart = new FirstLevelTransferCart(this);
    this.flow = new FirstLevelMissionFlow({ Enter: (stage) => this.Enter(stage) });
    this.voice = new FirstLevelMissionVoice({
      audio: this.audio,
      hud: this.hud,
      Position: (cue,line) => this.VoicePosition(cue,line),
      Listener: () => this.player.EyePosition,
      Done: (id) => this.VoiceDone(id),
      Event: (id,cueId,detail) => this.VoiceEvent(id,cueId,detail),
      Ready: (id) => this.Has(id),
      Clock: this.VoiceClock,
    });
    this.view = new FirstLevelMissionView({
      scene: this.scene,
      battlefield: this.battlefield,
      physics: this.physics,
      column: this.column,
      actorFactory:this.actorFactory,library:this.library,hud:this.hud,vfx:this.vfx,
    });
    this.oldBlast = this.combat.host.onBlast;
    this.oldSoldierDeath = this.ai.ctx.onSoldierDeath;
    this.soldierDeath = (side, actor) => {
      this.oldSoldierDeath?.call(this.ai.ctx, side, actor);
      this.OnOrdinaryCasualty(actor);
    };
    this.ai.ctx.onSoldierDeath = this.soldierDeath;
    this.combat.host.onBlast = (event) => {
      this.oldBlast?.(event);
      this.OnBlast(event);
    };
    this.battleSound = new FirstLevelMissionBattleSound(this.audio);
    this.music = new FirstLevelMissionMusic(this.audio);
    this.musicInitializing = true;
    this.view.interact = this.interact;
    // 15–18：真人实体层 + 布景层 + 四个步骤模块（契约 §8 的 End 包）。
    // 布景层挂到 view 上，由它在 people.Begin/End 之间画一次。
    this.extras = new EndExtras(this);
    this.dressing = new EndDressing();
    this.view.extras = this.dressing;
    this.nightLights = new FirstLevelNightLights({ scene: this.scene });
    this.quietMarch = new FirstLevelQuietMarch(this);
    this.reception = new FirstLevelReception(this);
    this.bridge = new FirstLevelBridge(this);
    this.nightGate = new FirstLevelNightGate(this);
    this.leaderGuide = new FirstLevelLeaderGuide(this);
    this.Register();
    // 02 的交互点与玩家实际看到的是同一坐标、同一 HanYang 几何。它不另注册一条
    // 通用地枪交互，避免 F 在两个候选之间抢焦点；任务交互完成时统一拆掉。
    this.bunkerRifle = this.SpawnMissionRifle?.(P.bunker.rifle) ?? null;
    this.flow.Start();
    this.voiceReady = this.voice.Load().then(()=>{
      if (host.stageJump != null) ApplyFirstLevelStageJump(this, host.stageJump, { midCutscenes: !!host.stageJumpMidCutscenes });
      this.musicInitializing = false;
      this.UpdateMusic();
      this.SaveCheckpoint();
    });
  }
  Point(point, rise = 0) {
    return new THREE.Vector3(point.x, this.battlefield.GroundHeight(point.x, point.z) + rise, point.z);
  }
  BlocksSight(from,to,excludeCollider=null) {
    const delta=to.clone().sub(from),distance=delta.length();
    if(distance<.01)return false;
    const hit=this.battlefield.Raycast(from,delta.multiplyScalar(1/distance),distance,{terrain:true,excludeCollider});
    return !!hit && hit.t<distance-.1;
  }
  Record(id, detail) {
    return this.flow.Record(id, detail);
  }
  Has(id) {
    return this.flow.Has(id);
  }
  RemoveBunkerRifle() {
    if (!this.bunkerRifle) return;
    this.RemoveMissionRifle?.(this.bunkerRifle);
    this.bunkerRifle = null;
  }
  /**
   * 可见空间的换态信号（契约 §3 冻结的大写名）。装配层每帧把这个问给
   * `battlefield.SyncScenario`：掩蔽部换坍塌态、铁路桥消失、北门夜景出现，
   * 全都由任务事实驱动 —— 所以检查点重试、阶段回跳把事实清掉的那一刻，
   * 空间自己就退回去了，不用另写一套还原代码。
   */
  Signalled(name) {
    return this.Has(MISSION_SCENARIO_SIGNALS[name] || name);
  }
  Near(point, radius = 5) {
    return Distance(this.player.position, point) < radius;
  }
  /**
   * 镜头视野：`Script_Main` 每帧拿算好的基准 FOV 来问一次。现在只有 01 受困段用它
   * （把视野收窄到「卡着只能盯着看」），平滑与数值都在 Front 包的 FirstLevelFrontShow。
   */
  NarrowFovDeg(baseFov, dt) {
    return this.frontShow?.NarrowFovDeg(baseFov, dt) ?? baseFov;
  }
  /**
   * 事实门的距离判定：点与半径一律从 MISSION_FACT_GATES 取，代码里不再写坐标与米数。
   * 家族门（approachShell<i> / bundleRoutePoint<i> / bundleCrawl<id>）按前缀解析出那一个点。
   * 附加条件（是否已下车、担架是否过完、人是不是趴着）仍留在各自的调用处。
   */
  GateNear(fact) {
    const exact = MISSION_FACT_GATES[fact], family = exact ? null : MissionGateFamily(fact);
    if (exact && exact.kind !== "proximity") throw new Error(`GateNear: ${fact} is not a proximity gate`);
    if (!exact && !family) throw new Error(`GateNear: no proximity gate for ${fact}`);
    const gate = exact || family.gate;
    // 表里还能再挂两道条件（矩形与视线都写在 MISSION_FACT_GATES 里，这儿不写坐标）：
    //   area  —— 人要站在这一带（08「队伍到村北口、往主街一看」）
    //   sight —— 真的望得见那个锚点，不是「隔着一道院墙离得近」
    if (gate.area && !MissionGateInArea(this.player.position, gate.area)) return false;
    if (gate.sight && this.BlocksSight(this.player.EyePosition.clone(),
      this.Point(A[gate.sight.anchor], gate.sight.toM))) return false;
    return this.Near(family ? family.point : gate.point || A[gate.anchor], gate.radiusM);
  }
  /**
   * 台词。Voice 包合入之后 `MISSION_DIALOGUE` 就是唯一真相：运行时引用的每一个
   * cue id 都必须在表里（`Script_FirstLevelVoiceTest` §9 静态扫源码对账）。
   * 真出现表外的 id 只警告一次、不排队、不抛异常 —— 编排不会被一条音频卡住，
   * 但也不再有「假装播完、到点补记事实」那条兜底路（它会把改表改漏悄悄盖掉）。
   */
  Say(id, options) {
    if (!id) return;
    if (CUE_IDS.has(id)) { this.voice.Enqueue(id, options); return; }
    if (this.missingCues.includes(id)) return;
    this.missingCues.push(id);
    console.warn(`[FirstLevelMission] dialogue cue ${id} is not in MISSION_DIALOGUE`);
  }
  OnOrdinaryCasualty(actor) {
    if(this.failed || this.completed || !actor || actor.alive || actor.side!=="nra"
      || OPENING.requiredSquadCast.includes(actor.castId)
      || actor===this.opening.zhou || actor===this.opening.runner?.actor || actor===this.opening.wounded?.actor)return;
    if(!this.Record(`ordinaryCasualty${actor.id}`,{actorId:actor.id,squadId:actor.squadId,
      stage:this.flow.stage.id}))return;
    // The death pipeline already removes this soldier's fire, cover and tokens.
    // A living squadmate may react locally; never stop or refill the mission.
    if(this.voice.current || this.time<(this.nextCasualtyReactionAt||0)
      || Distance(actor.position,this.player.position)>R.casualtyWitnessM)return;
    const witness=this.ai.soldiers.find(other=>other!==actor&&other.alive&&other.side==="nra"
      && actor.squadId && other.squadId===actor.squadId
      && Distance(other.position,actor.position)<=R.casualtyWitnessM
      && Distance(other.position,this.player.position)<=R.casualtyWitnessM
      && !this.BlocksSight(this.Point(other.position,1.3),this.Point(actor.position,.4)));
    if(!witness)return;
    this.hud.Say(witness.castId?T(`gameplay.cast.${witness.castId}`):T("firstLevel.casualty.speaker"),
      T("firstLevel.casualty.reaction"),R.casualtyReactionS);
    this.nextCasualtyReactionAt=this.time+R.casualtyReactionGapS;
  }
  // Intact dialogue recordings follow the current speaker; overlapping Luo
  // briefing keeps its own source. Unknown nearby voices stay in carriage space.
  VoicePosition(cue,line) {
    // 阶段 1–7 自己认领的几条（村口指路的人、指弹药屋的守军、集结处的传令兵与老周）。
    const front=this.frontShow?.VoicePosition(cue,line);
    if(front)return front;
    // 08 主街那一头喊话的前队（Mid 包）。
    const village=this.village?.VoicePosition(cue,line);
    if(village)return village;
    if(cue.id==="WoundedArrival"&&this.opening.wounded)return this.Point(this.opening.wounded.actor.position,1.2);
    if(cue.id==='BundleSupply' && line?.who==='keeper' && this.bundleKeeper)
      return this.Point(this.bundleKeeper.position,1.2);
    if(cue.id==="SupportOrder"&&this.opening.runner)return this.Point(this.opening.runner.actor.position,1.3);
    if (["ZhouDeath","ZhouCheck","ZhouLift","Threshold","PlaceLitter","MedicAsk"].includes(cue.id)) return this.Point(this.column.zhou, 1);
    const who = line?.who ?? cue.lines[0]?.who;
    if (who === "shunzi") return this.player.EyePosition.clone();
    const handled = this.companion.Handle(who)?.position;
    if (handled) return new THREE.Vector3(handled.x,handled.y+1.35,handled.z);
    const at = this.player.position;
    return new THREE.Vector3(at.x, at.y + 1.5, at.z);
  }
  get EmptyHands() {
    return this.controls?.kind === "death"
      || (["Trapped","BunkerRescue"].includes(this.flow.stage.id) && !this.Has("rifleRecovered"));
  }
  /** COD campaign: a brief objective update; the leader remains the travelling destination. */
  ObjectiveNotice() {
    return this.leaderGuide?.Objective() || "";
  }
  OpeningPrompt() {
    if(this.flow.stage.id==='Tank' && this.player.stance!=='prone' && Sortie.crawl.some(c=>this.Near(c,c.d/2+2)))
      return {keys:'Z',label:T('firstLevel.hint.crawlPassage'),kind:'stance'};
    if (this.controls || !this.EmptyHands) return null;
    if (this.flow.stage.id === "Trapped") return {keys:"",label:T("firstLevel.hint.trapped"),kind:"stance"};
    // 空手的时候 Script_Main 把整条提示条交给这里（EmptyHands 分支）。够得着的任务
    // 交互必须从这儿透出来 —— 不然 02 的目标写着「把枪捡起来」，枪跟前却没有提示。
    const interaction=this.interact?.Query?.(this.player);
    if(interaction?.point?.tag==="FirstLevelMission")
      return {keys:interaction.point.gesture==="hold"?T("hud.key.holdF"):"F",
        label:interaction.label,kind:interaction.kind||"interact"};
    return null;
  }
  VoiceEvent(id,cueId,detail) {
    // 逐句事件（Voice 包统一发）：阶段 1–7 的演出靠它把动作对到台词上；15A 的点名靠它让
    // 说话的人与何有田互相转过去（「逐个应答要对着真人」）。
    if(id==="Line"){this.frontShow?.OnLine(cueId,detail);this.quietMarch?.OnLine(cueId,detail);return;}
    this.frontShow?.OnEvent(id,cueId,detail);
    if(id==="BunkerBlast"){this.opening.BunkerBlast();return;}
    if(id==="RescueHeave"){this.Record("bunkerRescueHeave");return;}
    if(id==="AircraftDiveOrder" && !this.Has("diveComplete")) {
      this.Record("diveOrderHeard");
      this.BeginControl("dive", R.diveSeconds);
      this.carry.ForceRelease("instinct");
      this.column.zhou.state="fallen";
      return;
    }
  }
  VoiceDone(id) {
    // 「播完即记一条事实」的那一串走表（MISSION_VOICE_FACTS）。
    // 带额外副作用的对白事件在 VoiceEvent 里，不在这条链上。
    const fact = MISSION_VOICE_FACTS[id];
    if (fact) this.Record(fact);
    this.frontShow?.OnVoiceDone(id);
  }
  /** End 包的剧情人物也走共用的待机姿态层（那一层要 three，模块自己不 import）。 */
  InstallSentry(actor) {
    if (actor) InstallMissionSentry(actor);
  }
  /** 某个点在担架队当前路线上的里程（15C 拦在院门外排队要用）。 */
  ColumnProgressAt(point) {
    return MissionRouteProjection(this.column.route, point).progress;
  }
  PlaceActor(actor, point) {
    if (!actor) return;
    const y = this.battlefield.GroundHeight(point.x, point.z);
    actor.position.set(point.x, y, point.z);
    actor.body?.Teleport(point.x, y, point.z);
    actor.goal.set(point.x, 0, point.z);
    actor.actor?.root.position.copy(actor.position);
  }
  PlaceSquad() {
    this.squad = ["luo", "yaowa", "heyoutian", "liuwencai"].map(id => this.companion.Handle(id)).filter(Boolean);
    const luo = this.companion.Handle("luo");
    if (luo?.actor?.characterRig?.facial) {
      this.speakingFace = luo.actor.characterRig.facial;
      this.speakingFace.source = () => luo.alive ? this.voice.Speech("luo") : null;
    }
    for (const actor of this.squad) actor.scriptEssential = OPENING.requiredSquadCast.includes(actor.castId);
    // 2026.09.19：开局不再有军列。班里人就在掩蔽部与它后侧的交通壕里，
    // missionTrainReady 这个旗标沿用（UpdateSquad 拿它当「这个人已经归行军层管」）。
    for (const [i, actor] of this.squad.entries()) {
      actor.missionTrainReady = true;
      // 01 是玩家受困时的行刑演出。班里人此刻只在后侧挖掘；真正开火必须等
      // doorSearchStarted 把流程推进 02，再由 FirstLevelBunker.UpdateSuppression
      // 单独放开何有田。否则通用 AI 会让全班提前射杀两名行刑兵。
      actor.scriptedNoncombatant = true;
      this.PlaceActor(actor, this.opening.BunkerPost(i));
      this.Defend(actor, actor.position, 0, 0);
      this.ai.SetStance(actor, 1, 2, true);
    }
  }
  MoveActor(actor, point, speed = R.squadSpeedMps) {
    if (!actor?.alive) return;
    actor.p012Guided = true;
    actor.scriptDefensive = false;
    actor.scriptMoveSpeedMps = speed;
    actor.manualGoalUntil = this.ai.time + 3;
    actor.order = "advance";
    actor.holdZone = null;
    actor.scriptArrivalRadius = SCRIPT_ARRIVAL_M;
    const distance = Distance(actor.position, point),
      fraction = distance > 9 ? 8 / distance : 1;
    actor.goal.set(
      actor.position.x + (point.x - actor.position.x) * fraction,
      0,
      actor.position.z + (point.z - actor.position.z) * fraction,
    );
  }
  RespondToGrenade(actor) {
    const grenade=actor.grenadeThreat;
    const radius=this.ai.GrenadeDangerRadius(grenade);
    if(!actor.alive || actor.unarmed || actor.carryRole || actor.meleeCombat
      || !grenade?.alive || grenade.fuse<=0 || Distance(actor.position,grenade.position)>=radius
      || this.ai.GrenadeShielded(actor,grenade)){
      actor.missionGrenadeEvade=false;actor.missionGrenadeGoal=null;return false;
    }
    this.squadMarch?.Release(actor);
    actor.missionContactPost=null;
    let goal=actor.missionGrenadeGoal;
    if(!goal || Distance(actor.position,goal)<R.contactRadiusM || this.time>=(actor.missionGrenadeReplanAt||0)){
      if(this.time<(actor.missionGrenadeReplanAt||0))return !!actor.missionGrenadeEvade;
      actor.missionGrenadeReplanAt=this.time+R.companionGrenadeReplanS;
      goal=null;
      const at=actor.position,away=Math.atan2(at.z-grenade.position.z,at.x-grenade.position.x);
      const ceiling=this.battlefield.GroundHeight(at.x,at.z)+R.companionCoverMaxRiseM;
      const threats=(this.ai.ctx.combat?.projectiles||[grenade]).filter(p=>p.alive&&p.fuse>0
        &&p.owner!==actor.side&&!(p.owner==="player"&&actor.side==="nra")
        &&Distance(at,p.position)<this.ai.GrenadeDangerRadius(p)+radius+R.companionGrenadeMarginM);
      const Safety=point=>Math.min(...threats.map(p=>Distance(point,p.position)-this.ai.GrenadeDangerRadius(p)));
      let best=Safety(at);
      for(const scale of R.companionGrenadeFractions)for(let i=0;i<R.companionGrenadeDirections;i++){
        const angle=away+i*Math.PI*2/R.companionGrenadeDirections;
        const reach=(radius+R.companionGrenadeMarginM)*scale;
        const point={x:at.x+Math.cos(angle)*reach,z:at.z+Math.sin(angle)*reach};
        const distance=Safety(point);
        if(distance<=best)continue;
        // A far endpoint across the explosive is not an escape route. A tight
        // corridor may require a shorter step away before turning the corner.
        if(threats.some(p=>Distance(at,p.position)<this.ai.GrenadeDangerRadius(p)
          &&(point.x-at.x)*(at.x-p.position.x)+(point.z-at.z)*(at.z-p.position.z)<-1e-6))continue;
        let clear=true;
        for(let step=1;step<=R.companionGrenadeDirections;step++){
          const t=step/R.companionGrenadeDirections;
          if(this.battlefield.GroundHeight(at.x+(point.x-at.x)*t,at.z+(point.z-at.z)*t)>ceiling){clear=false;break;}
        }
        if(!clear || this.BlocksSight(this.Point(at,.5),this.Point(point,.5)))continue;
        goal=point;best=distance;
      }
      actor.missionGrenadeGoal=goal;
    }
    if(!goal){
      // Keep emergency ownership while blocked; the marching order must not
      // pull the actor back across a live grenade during the next replan delay.
      actor.missionGrenadeEvade=true;
      this.MoveActor(actor,actor.position,0);
      this.ai.SetStance(actor,2,R.companionGrenadeReplanS,true);
      return true;
    }
    actor.missionGrenadeEvade=true;
    this.MoveActor(actor,goal,R.companionGrenadeSpeedMps);
    this.ai.SetStance(actor,0,R.companionGrenadeReplanS,true);
    return true;
  }
  /**
   * @param {{engage?:boolean}} [options] engage=false 是开场冲过开阔地的旧规则（近接敌短停、
   *   无掩体就沿路线冲过去）；engage=true 是交战阶段的规则（Data_Tuning_FirstLevel 的
   *   contactEngage* / contactBound*）。独立脚本（机枪手周）不传，保持原口径。
   */
  RespondToContact(actor, { engage = false } = {}) {
    if(!actor?.alive || actor.unarmed || actor.scriptedNoncombatant || actor.carryRole || actor.meleeCombat){
      if(actor)actor.missionContactBound=null;
      return false;
    }
    actor.scriptEscapeStance=null;
    // Damage still matters at the narrative health floor: another hit must
    // trigger shelter even though the protected actor cannot lose more health.
    const hit=(actor.damageSequence||0)>(actor.missionDamageSequence||0)
      || (Number.isFinite(actor.missionLastHealth)&&actor.health<actor.missionLastHealth);
    actor.missionDamageSequence=actor.damageSequence||0;
    actor.missionLastHealth=actor.health;
    const incoming=actor.incomingFire;
    const newIncoming=incoming && incoming.at>(actor.missionIncomingAt??-Infinity);
    if(incoming)actor.missionIncomingAt=incoming.at;
    // Protected cast can retain wound cues without being pinned forever at 1 HP.
    const wounded=!actor.scriptEssential && actor.health<=R.companionWoundedHealth;
    const exposedWounded=wounded && (actor.targetVisible || this.ai.time-(incoming?.at??-Infinity)<R.companionDangerHoldS);
    if(hit || newIncoming || exposedWounded || actor.suppression>=R.companionDangerSuppression)
      actor.missionDangerUntil=this.time+R.companionDangerHoldS;
    // 跃进中的人照常走路线；真挨了枪才中止，就地重新找掩体。
    if(engage && this.UpdateContactBound(actor,hit))return false;
    const danger=this.time<(actor.missionDangerUntil||0);
    if(danger){
      const hiding=this.ai.time<(actor.scriptShelterUntil||0);
      if(hit || wounded || actor.suppression>=R.companionHideSuppression
        || (hiding && actor.suppression>R.companionReturnFireSuppression))
        actor.scriptShelterUntil=this.ai.time+R.companionShelterHoldS;
      // Never let a march timer pull a man out of shelter while bullets are
      // still passing him. Without a reachable shelter, keep escaping low.
      if(!actor.missionContactPost)actor.missionContactAt=this.time;
      actor.missionContactPost??={x:actor.position.x,z:actor.position.z};
      this.Defend(actor,actor.missionContactPost,R.contactRadiusM,
        engage?Math.max(R.companionCoverSlackM,R.contactEngageCoverSlackM):R.companionCoverSlackM);
      actor.scriptCoverMaxRiseM=R.companionCoverMaxRiseM;
      this.ai.UpdateCover(actor);
      if(hit || wounded || actor.suppression>=R.companionProneSuppression
        || (!actor.cover && !this.squadRoutes?.get(actor.id)?.length))
        actor.scriptProneUntil=this.ai.time+R.companionDangerHoldS;
      if(wounded || !actor.cover || actor.coverPhase==="approach" || this.ai.time<(actor.scriptShelterUntil||0))
        this.ai.SetStance(actor,this.ai.time<(actor.scriptProneUntil||0)?2:1,R.companionDangerHoldS,true);
      if(actor.cover){
        actor.missionContactUntil=actor.missionDangerUntil;
        actor.missionContactAt=this.time;
        this.squadMarch?.Release(actor);
        return true;
      }
      if(engage){
        // 交战阶段没有掩体也不沿路线走开：就地放低姿态还击，前进交给跃进令牌。
        actor.missionContactUntil=Math.max(actor.missionContactUntil||0,this.time+R.contactHoldS);
        this.squadMarch?.Release(actor);
        return true;
      }
      actor.missionContactPost=null;
      if(this.squadRoutes?.get(actor.id)?.length){
        // A prone man is still exposed when the incoming ray clears the ground.
        // Cross that opening at full pace; only slow down where the terrain
        // actually shields a lower posture.
        const threat=this.ai.ThreatPoint(actor);
        let stance=0;
        if(threat){
          const from=new THREE.Vector3(threat.x,threat.y+AiDirector.StanceEye(threat.stance,actor),threat.z);
          for(const lower of [1,2])if(this.BlocksSight(from,actor.position.clone().add(new THREE.Vector3(0,AiDirector.StanceEye(lower,actor),0)))){stance=lower;break;}
        }
        actor.scriptEscapeStance=stance;
        actor.scriptProneUntil=stance===2?this.ai.time+R.companionDangerHoldS:0;
        this.ai.SetStance(actor,stance,R.companionDangerHoldS,true);
      }
      return false;
    }
    if(engage)return this.EngageContact(actor);
    // A moving escort answers the threat in short bounds. Continuous visibility
    // must not pin the leader forever to the first enemy beside the route.
    if(actor.missionContactPost && (this.time>=actor.missionContactUntil || this.time-actor.missionContactAt>=R.contactMaxHoldS)){
      actor.missionContactPost=null;actor.missionContactResumeAt=this.time+R.contactResumeS;
      return false;
    }
    if(this.time<(actor.missionContactResumeAt||0))return false;
    const target=actor.target;
    const contact=target && actor.targetVisible && !actor.targetFromMemory && target.ref?.alive!==false
      && Distance(actor.position,target.position)<=R.contactRangeM;
    if(contact){
      if(!actor.missionContactPost)actor.missionContactAt=this.time;
      actor.missionContactUntil=this.time+R.contactHoldS;
      actor.missionContactPost??={x:actor.position.x,z:actor.position.z};
    }
    if(actor.missionContactPost && this.time<actor.missionContactUntil){
      this.squadMarch?.Release(actor);
      this.Defend(actor,actor.missionContactPost,R.contactRadiusM,R.contactCoverSlackM);
      return true;
    }
    actor.missionContactPost=null;
    return false;
  }
  /**
   * 交战阶段的接敌：看见（或 contactMemoryS 内看见过）contactEngageRangeM 内的活敌人，
   * 或 contactSquadShareM 内的弟兄正在打、自己也知道这个敌人 —— 就地设接敌点，
   * contactEngageCoverSlackM 内找掩体还击；没有掩体就跪下打。敌人消失 contactHoldS 后归队。
   */
  EngageContact(actor) {
    const target=actor.target,live=!!target&&target.ref?.alive!==false;
    const inRange=live&&Distance(actor.position,target.position)<=R.contactEngageRangeM;
    const seen=inRange&&((actor.targetVisible&&!actor.targetFromMemory)||(actor.targetLostTime??Infinity)<R.contactMemoryS);
    const mate=inRange&&!seen&&(this.squad||[]).some(o=>o!==actor&&o.alive&&o.missionContactPost
      &&Distance(o.position,actor.position)<=R.contactSquadShareM);
    if(seen||mate){
      if(!actor.missionContactPost)actor.missionContactAt=this.time;
      actor.missionContactUntil=this.time+R.contactHoldS;
      actor.missionContactPost??={x:actor.position.x,z:actor.position.z};
    }
    if(!actor.missionContactPost || this.time>=actor.missionContactUntil){
      actor.missionContactPost=null;
      return false;
    }
    this.squadMarch?.Release(actor);
    this.Defend(actor,actor.missionContactPost,R.contactRadiusM,R.contactEngageCoverSlackM);
    actor.scriptCoverMaxRiseM=R.companionCoverMaxRiseM;
    this.ai.UpdateCover(actor);
    if(!actor.cover)this.ai.SetStance(actor,1,R.contactHoldS,true);
    return true;
  }
  /**
   * 跃进令牌：在接敌点打满 contactBoundAfterS、压制不重、还有路线要走的人，按「谁先停下谁先走」
   * 领一段 contactBoundM（最长 contactBoundMaxS）的跃进；同时最多 contactBoundersMax 人，
   * 两次放行至少隔 contactBoundStaggerS —— 其余人留在原地掩护。
   * @returns {boolean} 这个人此刻正在跃进（调用方放行路线移动）
   */
  UpdateContactBound(actor, hit) {
    const route=this.squadRoutes?.get(actor.id);
    const bound=actor.missionContactBound;
    if(bound){
      if(hit || !route?.length || this.time>=bound.until || Distance(actor.position,bound.from)>=R.contactBoundM){
        actor.missionContactBound=null;
        this.contactBoundNextAt=Math.max(this.contactBoundNextAt||0,this.time+R.contactBoundStaggerS);
        return false;
      }
      return true;
    }
    if(!actor.missionContactPost || !route?.length || this.time-(actor.missionContactAt??this.time)<R.contactBoundAfterS)return false;
    if(this.time<(this.contactBoundNextAt||0) || actor.suppression>=R.companionHideSuppression
      || this.ai.time<(actor.scriptShelterUntil||0))return false;
    const squad=(this.squad||[]).filter(o=>o.alive);
    if(squad.filter(o=>o.missionContactBound).length>=R.contactBoundersMax)return false;
    // 谁先停下谁先走：比他停得早、同样能走的人还在等，就轮不到他。
    if(squad.some(o=>o!==actor&&o.missionContactPost&&!o.missionContactBound&&this.squadRoutes?.get(o.id)?.length
      &&o.suppression<R.companionHideSuppression&&(o.missionContactAt??Infinity)<actor.missionContactAt))return false;
    actor.missionContactBound={until:this.time+R.contactBoundMaxS,from:{x:actor.position.x,z:actor.position.z}};
    this.contactBoundNextAt=this.time+R.contactBoundStaggerS;
    actor.missionContactPost=null;
    this.ai.ReleaseCover(actor);
    return true;
  }
  /**
   * Hold this spot and fight from it.
   *
   * 2026-09-08 (docs/Data_EnemyAi.md §6): this is an **anchor plus a radius**, not a pin.
   * Cast and fixed posts retain scriptDefensive; authored tacticalRadiusM grants
   * ordinary riflemen local manoeuvres while retaining the firing cadence and a cover point
   * whose hide position lies inside `radius + coverSlackM` and run the hide/peek cycle there.
   * Before this change `AiDirector.ApplyScriptDefense` opened with `s.cover = null`, so every
   * front-line Japanese soldier in this level was **forbidden by design** from taking cover.
   *
   * @param {number} [radius] hold zone radius; the assault bounds pass their own (cover search) radius
   * @param {number} [coverSlackM] how far outside the zone a cover hide position may sit
   */
  Defend(actor, point, radius = R.defendHoldRadiusM, coverSlackM = R.defendCoverSlackM) {
    if (!actor?.alive) return;
    actor.scriptedNoncombatant = false;
    actor.p012Guided = false;
    if(actor.side==="nra" && actor.missionTrainReady && !actor.castId)
      actor.tacticalRadiusM=R.friendlyTacticalRadiusM;
    actor.scriptDefensive = !(actor.tacticalRadiusM > 0);
    actor.scriptSuppressible=true;
    delete actor.scriptMoveSpeedMps;
    actor.manualGoalUntil=Infinity;
    actor.scriptAccuracyScale = actor.missionAccuracyScale ?? 0.5;
    actor.scriptFireIntervalScale = actor.missionFireIntervalScale ?? 1.5;
    actor.order = "hold";
    actor.holdZone = { id: "MissionDefense", ...point, radius };
    actor.scriptCoverSlackM = coverSlackM;
    if(actor.castId)actor.scriptCoverMaxRiseM=R.companionCoverMaxRiseM;
    actor.goal.set(point.x, 0, point.z);
  }
  Guide(route, { fromStart = false, resumeAfter = null } = {}) {
    this.squadMarch?.Dispose();
    this.guideRoute = route;
    const stations=route===MISSION_ROUTES.support?TC.support:
      route===OPENING.approachRoute&&resumeAfter?TC.approach:null;
    this.squadCoverBounds=stations?new SquadCoverBounds(stations,route):null;
    for (const actor of this.squad) {
      const naturalMarch=!stations&&[MISSION_ROUTES.support,MISSION_ROUTES.southWalk].includes(route);
      const personalRoute = naturalMarch ? MissionSquadRoute(route,this.squad.indexOf(actor)) : route;
      actor.missionNaturalMarch = naturalMarch;
      actor.missionWatch=null;
      // Optional guide detours belong to one route, not the next stage's approach.
      const previousRoute=this.squadRoutes.get(actor.id)?.filter(point=>point.guideCheckpoint==null);
      const queued = MissionGuideRoute(actor.position,previousRoute,route,personalRoute,fromStart,resumeAfter);
      if(resumeAfter){
        const rally=OPENING.trenchCoverPosts[this.squad.indexOf(actor)];
        const pending=queued.findIndex(p=>Distance(p,rally)<.1);
        // Leave the side bay through its rear opening before passing its front.
        if(pending>=0)queued.splice(pending+1,0,{x:OPENING.trenchEntry.x,z:rally.z,coverTransit:true});
        else if(actor.position.z>=TC.rally.at(-1).z&&actor.position.z<=TC.rally[0].z+TC.wingLengthM)
          queued.unshift({x:OPENING.trenchEntry.x,z:actor.position.z,coverTransit:true});
      }
      if(route===MISSION_ROUTES.support){
        const post=OPENING.frontPosts[this.squad.indexOf(actor)];
        if(post)queued.push({x:post.x,z:-124},{...post});
      }
      if(!stations && !naturalMarch && route!==OPENING.approachRoute && personalRoute.length>1){
        const end=personalRoute.at(-1),before=personalRoute.at(-2),dx=end.x-before.x,dz=end.z-before.z,d=Math.hypot(dx,dz)||1,slot=this.squad.indexOf(actor);
        const lateral=(slot%2?1:-1)*R.squadPostLateralM,back=slot<2?0:R.squadPostRearM;
        const post={x:end.x+dz/d*lateral-dx/d*back,z:end.z-dx/d*lateral-dz/d*back};
        if(!this.BlocksSight(this.Point(end,.7),this.Point(post,.7)))queued.push(post);
      }
      for(const point of queued){delete point.coverBound;delete point.coverStation;delete point.guideCheckpoint;} // keep geometry, not obsolete gates
      const covered=CompactGuideRoute(stations?SquadCoverRoute(queued,stations,this.squad.indexOf(actor),TC):queued,GUIDE.collinearEpsilonM);
      actor.missionCoverBounds=covered.filter(p=>Number.isInteger(p.coverBound));
      actor.missionCoverPassed=-1;actor.missionCoverWaiting=false;
      this.squadRoutes.set(actor.id, covered);
    }
    const leaderRoute=this.squadRoutes.get(this.squad[GUIDE.leaderIndex]?.id);
    if(leaderRoute)this.leaderGuide?.Plan(leaderRoute);
    this.RebuildSquadMarch(route);
  }
  /**
   * 重建共用行进节奏（AGENTS §13 的 SquadMarchAi）。
   * 构造时会把每个人当时的路线数组捕获进 members，所以任何一次「换掉某人的
   * squadRoutes」之后都必须重建一次，否则共用层还在按旧数组算前后与间距。
   */
  RebuildSquadMarch(route) {
    this.squadMarch?.Dispose();
    // Role is supplied by the mission roster; the shared controller knows no cast names.
    this.squadMarch=new SquadMarchAi(this.ai,this.squad,{
      route,leaderIndex:0,seed:`FirstLevel:${this.flow.stage.id}`,
      tuning:{speedMps:R.squadSpeedMps,catchupScale:R.squadCatchupMps/R.squadSpeedMps,arrivalM:GUIDE.arrivalM,
        waitDistanceM:GUIDE.waitDistanceM,resumeDistanceM:GUIDE.resumeDistanceM},
      members:this.squad.map(actor=>({route:this.squadRoutes.get(actor.id)})),
    },{Move:(actor,point,speed)=>this.MoveActor(actor,point,speed)});
  }
  WaitWatch(actor, stage) {
    const slot=this.squad.indexOf(actor);
    if(!R.squadWatchStages.includes(stage) || actor.target || actor.suppression>.3)return false;
    let watch=actor.missionWatch;
    if(!watch || watch.stage!==stage)watch=actor.missionWatch={stage,anchor:{x:actor.position.x,z:actor.position.z},next:this.time+2+slot*1.7,cycle:0};
    if(watch.goal && this.time-watch.startedAt<R.squadWatchTimeoutS && Distance(actor.position,watch.goal)>R.squadWatchArrivalM){
      this.ai.SetStance(actor,0,.5,true);this.MoveActor(actor,watch.goal,R.squadWatchSpeedMps);actor.scriptArrivalRadius=R.squadWatchArrivalM;return true;
    }
    watch.goal=null;
    if(this.time<watch.next)return false;
    watch.next=this.time+R.squadWatchPauseS+slot*.7;watch.cycle++;
    const angle=(slot*1.73+watch.cycle*2.4),reach=R.squadWatchRadiusM;
    const point={x:watch.anchor.x+Math.cos(angle)*reach,z:watch.anchor.z+Math.sin(angle)*reach};
    const from=this.Point(actor.position,.6),to=this.Point(point,.6);
    if(Math.abs(from.y-to.y)<.25 && !this.BlocksSight(from,to) &&
      ![this.player,...this.squad.filter(s=>s!==actor),...this.column.litters.filter(l=>l.visible)].some(s=>Distance(s.position||s,point)<1.1)){
      watch.goal=point;watch.startedAt=this.time;this.MoveActor(actor,point,R.squadWatchSpeedMps);actor.scriptArrivalRadius=R.squadWatchArrivalM;return true;
    }
    return false;
  }
  UpdateSquad() {
    const stage = this.flow.stage.id;
    this.leaderGuide?.BeginSquad();
    const marchSpeeds = new Map();
    this.squadCoverBounds?.Update(this.player.position,this.squad.map(actor=>({
      alive:actor.alive,position:actor.position,bounds:actor.missionCoverBounds||[],
      passed:actor.missionCoverPassed??-1,evading:!!actor.missionGrenadeEvade,
    })));
    // Alternating cover only while there is contact; otherwise the posts are skipped.
    this.squadCoverThreat??=new SquadCoverThreat();
    const coverCalm=!!this.squadCoverBounds&&!this.squadCoverThreat.Update(this.ai.time,
      this.squad.map(actor=>({alive:actor.alive,position:actor.position,targetVisible:!!actor.targetVisible,
        incomingAt:actor.incomingFire?.at,suppression:actor.suppression})),
      [...this.enemies.values()].filter(e=>e.alive&&!e.scriptedNoncombatant&&!e.missionDormant&&!e.missionSurfaceRest&&!e.missionFrontStandby).map(e=>e.position));
    this.squadCoverCalm=coverCalm;
    // 受困那一段班里人是演出，不归行军层管，也不许通用 AI 提前救场。
    if (stage === "Trapped") {
      for (const actor of this.squad) actor.scriptedNoncombatant = true;
      return;
    }
    const bunkerRescueLocked = stage === "BunkerRescue" && !this.Has("luoRescueComplete");
    for (const actor of this.squad) {
      InstallMissionSentry(actor);
      if (!actor.missionTrainReady) continue;
      // 16 的分派与 17 的何有田：接了吩咐的人真的走开／留下，接触反应不许盖过去
      //（口径同 02 罗班长掀木架那一处放行）。路线在 FirstLevelReception。
      if (this.reception.HasWalk(actor.id)) { actor.scriptedNoncombatant = true; continue; }
      if (actor === this.bedGuide?.actor && ["Handover", "Death"].includes(stage)) {
        const route = this.bedGuide.route;
        while (route.length && Distance(actor.position, route[0]) < 0.7) route.shift();
        if (route.length) this.MoveActor(actor, route[0], R.rescuerApproachMps);
        else {
          this.MoveActor(actor, actor.position, 0);
          this.ai.SetStance(actor, stage === "Death" ? 1 : 0, 0.5, true);
        }
        continue;
      }
      actor.missionCoverWaiting=false;actor.missionCoverApproach=false;
      // 02 尚未还权时，罗/幺娃在掀木架，文财留在后侧；只有 FrontShow 在本帧
      // UpdateSquad 之后明确放开的何有田能开火。救援完成后全班恢复通用战斗 AI。
      actor.scriptedNoncombatant = bunkerRescueLocked
        || ["NightMarch","Regroup","WallPath","ReceptionGate"].includes(stage);
      actor.scriptEscapeStance=null;
      // 02：罗班长正在把人从木架下拖出来，幺娃在另一头拉背包。这几秒这两个人
      // 不找掩体、不参加交火 —— 门外那伙人由何有田从后侧交通壕压着（契约 §2）。
      // 不放行的话接触反应每帧把他们推回掩体，谁也走不到掀架位，02 就永远不开始。
      if(bunkerRescueLocked&&["luo","yaowa"].includes(actor.castId)){
        this.ai.ReleaseCover(actor);
        this.ai.SetStance(actor,1,.5,true);
        continue;
      }
      // The low roofs are geometry, not a Tank-step rule: the tracks can be cut
      // while Luo is still inside the side ditch, and Orders walks him back
      // under the same roofs. A standing capsule stops dead at the slab.
      const crawl=Sortie.crawl.some(c=>Distance(actor.position,c)<c.d/2+3);
      actor.scriptTraversalStance=crawl?2:null;
      if(crawl){
        // Finish the narrow passage before choosing a firing/cover post.
        // Grenade response still runs, with the same required low clearance.
        actor.missionContactPost=null;
        this.ai.ReleaseCover(actor);
        this.ai.SetStance(actor,2,.5,true);
      }
      if(this.RespondToGrenade(actor))continue;
      if(crawl)actor.missionContactBound=null;
      if(!crawl&&R.openingContactStages.includes(stage)
        // 出击带路（Tank 的 missionSortie）是领着玩家爬沟，照旧短停就走。
        &&this.RespondToContact(actor,{engage:!R.contactEscapeStages.includes(stage)&&!(stage==="Tank"&&actor.missionSortie)}))continue;
      if(!R.openingContactStages.includes(stage)){actor.missionContactPost=null;actor.missionContactBound=null;}
      const route = this.squadRoutes.get(actor.id);
      if(stage==='Tank' && actor.missionSortie){
        while(route?.length && Distance(actor.position,route[0])<.8)route.shift();
        this.squadMarch?.Release(actor);
        this.ai.SetStance(actor,crawl?2:1,.5,true);
        if(route?.length){
          const gap=Distance(actor.position,this.player.position);
          const path=this.Has("bundleTaken")?MISSION_ROUTES.bundleReturn:MISSION_ROUTES.bundle;
          const ahead=MissionRouteProjection(path,actor.position).progress>MissionRouteProjection(path,this.player.position).progress+Sortie.leaderArrivalM;
          actor.missionGuideWaiting=gap>Sortie.leaderWaitM&&ahead;
          this.MoveActor(actor,route[0],actor.missionGuideWaiting?0:(crawl?Sortie.leaderCrawlMps:R.squadSpeedMps));
        }else {this.Defend(actor,actor.position,0,0);actor.missionGuideWaiting=true;}
        if(actor.missionGuideWaiting&&!crawl)this.leaderGuide?.Watch(actor);
        continue;
      }
      // Calm trench: drop the detour into each shelter and walk straight on.
      // Marking the bound passed keeps the pair gate consistent if contact resumes.
      if(coverCalm)while(route?.length&&Number.isInteger(route[0].coverStation)){
        if(Number.isInteger(route[0].coverBound))actor.missionCoverPassed=Math.max(actor.missionCoverPassed??-1,route[0].coverBound+1);
        route.shift();
      }
      // Intermediate bends allow a smooth pass. The final defensive post must
      // use the mover's actual arrival radius or men stop in the walking lane.
      while(route?.length){
        const point=route[0],bound=Number.isInteger(point.coverBound);
        const arrival=point.coverTransit?CB.transitArrivalM:bound?CB.arrivalM:point.guideCheckpoint!=null?GUIDE.arrivalM:(route.length===1&&Number.isFinite(actor.scriptArrivalRadius)?actor.scriptArrivalRadius:1.1);
        if(Distance(actor.position,point)>arrival)break;
        if(this.leaderGuide?.Hold(actor,point))break;
        if(bound&&!this.squadCoverBounds?.CanLeave(point.coverBound)){
          actor.missionCoverWaiting=true;
          this.squadMarch?.Release(actor);
          this.Defend(actor,point,0,0);
          this.ai.SetStance(actor,1,CB.stanceHoldS,true);
          // Idle guards watch down the trench through the shared turn limiter;
          // visible or remembered threats retain normal aiming ownership.
          if(!actor.target&&!(actor.lkpConfidence>0)){
            actor.watchYaw=TC.watchYawRad;actor.watchUntil=this.ai.time+CB.stanceHoldS;
          }
          break;
        }
        if(bound)actor.missionCoverPassed=point.coverBound+1;
        route.shift();
      }
      if(actor.missionCoverWaiting || actor.missionGuideWaiting)continue;
      if(Number.isInteger(route?.[0]?.coverBound)){
        // The shared march may round ordinary corners. A shelter slot needs
        // precise physical arrival so the torso is actually behind its face.
        actor.missionCoverApproach=true;
        this.squadMarch?.Release(actor);
        this.MoveActor(actor,route[0],R.squadSpeedMps);
        actor.scriptArrivalRadius=CB.postArrivalM;
        this.ai.SetStance(actor,0,CB.stanceHoldS,true);
        continue;
      }
      if (route?.length) {
        if (["South","NightMarch","WallPath"].includes(stage) || (actor.suppression < 0.4 && this.time>=(actor.missionDangerUntil||0))) this.ai.SetStance(actor, 0, 0.5, true);
        const previous = this.squad[this.squad.indexOf(actor) - 1];
        const ahead =
          previous &&
          (previous.position.x - actor.position.x) * (route[0].x - actor.position.x) +
            (previous.position.z - actor.position.z) * (route[0].z - actor.position.z) >
            0;
        const yielding = ahead && Distance(previous.position, actor.position) < R.squadSpacingM;
        let speed=(this.squadCoverBounds&&route.some(p=>Number.isInteger(p.coverBound)))
          || (actor===this.leaderGuide?.Leader&&route.some(p=>p.guideCheckpoint!=null))?R.squadSpeedMps:MissionGuideSpeed(actor.position,this.player.position,route[0],actor.missionNaturalMarch?false:yielding,route);
        // Shared cadence owns its own acceleration and spacing. Keep the unfiltered
        // host limit; the legacy pace below remains available when combat takes over.
        marchSpeeds.set(actor.id,speed);
        if(actor.missionNaturalMarch){
          const p=actor.position,dx=route[0].x-p.x,dz=route[0].z-p.z,d=Math.hypot(dx,dz)||1;
          let gap=Infinity;
          for(const other of [...this.squad,this.player]){
            if(other===actor || other.alive===false)continue;
            const ox=other.position.x-p.x,oz=other.position.z-p.z;
            if((ox*dx+oz*dz)>0 && Math.abs(ox*dz-oz*dx)/d<R.squadLaneClearanceM)gap=Math.min(gap,Math.hypot(ox,oz));
          }
          speed=MissionSquadPace({speed,slot:this.squad.indexOf(actor),yaw:actor.yaw,target:route[0],
            position:p,gap,previous:actor.missionMarchSpeed||0,dt:this.delta});
          actor.missionMarchSpeed=speed;
        }
        this.MoveActor(actor,route[0],speed);
        if(route[0].guideCheckpoint!=null)actor.scriptArrivalRadius=GUIDE.arrivalM*.5;
      } else if (["BunkerRescue","RearTrench"].includes(stage)) {
        this.Defend(actor,actor.holdZone||actor.position,R.contactRadiusM,R.companionCoverSlackM);
        if(!actor.cover && this.time>=(actor.missionDangerUntil||0))this.ai.SetStance(actor,1,.5);
      } else if (["Support","MachineGun"].includes(stage)) {
        // Keep the authored anchor; the cover corridor check prevents climbing
        // the parapet while allowing a reachable shelter along the trench.
        const post=this.Has("gunOccupied")?OPENING.frontPosts[this.squad.indexOf(actor)]:(actor.holdZone||actor.position);
        this.Defend(actor,post,R.contactRadiusM,R.companionCoverSlackM);
      } else if (stage === "Tank") {
        // Nearby shelter remains on this side of the blast traverse.
        this.Defend(actor,actor.holdZone||actor.position,R.contactRadiusM,R.companionCoverSlackM);
      } else if (!["Rescue", "Death"].includes(stage)) {
        if(!this.leaderGuide?.AtPost(actor)&&!this.WaitWatch(actor,stage))this.Defend(actor, actor.holdZone||actor.position);
        if(["Support","MachineGun","Tank"].includes(stage))this.ai.SetStance(actor,1,2);
      }
      if (!Number.isFinite(actor.scriptEscapeStance) && actor.suppression > R.companionProneSuppression) this.ai.SetStance(actor, 2, R.companionDangerHoldS, true);
    }
    this.squadMarch?.Update(this.delta,{
      player:this.squadCoverBounds&&!coverCalm?null:this.player.position,
      Observe:actor=>({
        route:this.squadRoutes.get(actor.id)||[],
        active:!!actor.missionTrainReady&&!!this.squadRoutes.get(actor.id)?.length
          &&!(stage==="Tank"&&actor.missionSortie)
          &&!actor.missionContactPost
          &&!actor.missionGrenadeEvade
          &&!actor.missionCoverWaiting
          &&!actor.missionGuideWaiting
          &&!actor.missionCoverApproach
          &&!(actor===this.bedGuide?.actor&&["Handover","Death"].includes(stage))
          &&!this.reception.HasWalk(actor.id),
        noPause:!!this.squadCoverBounds,
        maxSpeed:marchSpeeds.get(actor.id)??0,
      }),
    });
  }
  // Warmed real actors are placed over several frames. Failed placement retains its slot.
  SpawnEncounter(id) {
    if (this.spawned.has(id)) return;
    this.spawned.add(id);
    for (const spec of MISSION_ENCOUNTERS[id] || []) this.spawnQueue.push(() => this.SpawnEncounterActor(id, spec));
  }
  DrainSpawns() {
    for (let i = 0; i < R.spawnPerFrame && this.spawnQueue.length; i++) this.spawnQueue.shift()();
  }
  SpawnEncounterActor(id, spec) {
      const actor = this.ai.Spawn("ija", spec.x, spec.z, {
        weapon: spec.weapon || "Type38",
        squadId: `Mission_${id}${spec.team?"_"+spec.team:""}`,
        bayonetFixed: !!spec.bayonet,
      });
      if (!actor) {this.spawnQueue.push(()=>this.SpawnEncounterActor(id,spec));return null;}
      actor.missionId = spec.id;InstallMissionSentry(actor);
      actor.missionEncounter=id;
      if(id==="approach")actor.scriptFireSector=R.approachFireSector;
      actor.missionReserve=!!spec.reserve;
      actor.missionReleaseDelayS=spec.releaseDelayS||0;
      if(["village","melee","bunkerAssault"].includes(id)){actor.missionDormant=true;actor.scriptedNoncombatant=true;}
      if (MISSION_TACTICS[spec.id]) actor.missionTactic = { index: 0, elapsed: 0, hold: 0,
        movingSeconds: 0, distance: 0, last: { x: spec.x, z: spec.z }, shelter: {x:spec.x,z:spec.z}, mode: "cover" };
      // Finite front teams remain ordinary alert AI before the assault starts.
      // Only the later tank-flank group waits for its authored release.
      const standby=["front","machineGun","tank"].includes(id)&&!spec.id.startsWith("Flank")&&!this.Has("frontBattleStarted");
      if(id==="tank"&&spec.id.startsWith("Flank"))actor.scriptedNoncombatant=true;
      actor.missionFrontStandby=standby;
      if(standby)this.ai.SetStance(actor,1,4+actor.id%3,true);
      actor.scriptAccuracyScale = actor.missionAccuracyScale = ["front","machineGun","approach"].includes(id)?R.frontAccuracyScale:.5;
      if(spec.reserve)actor.scriptAccuracyScale=actor.missionAccuracyScale=R.frontReserveAccuracyScale;
      actor.scriptFireIntervalScale = actor.missionFireIntervalScale = ["front","machineGun","approach"].includes(id)?R.frontFireIntervalScale:1.45;
      actor.scriptArrivalRadius = 0.7;
      actor.manualGoalUntil = Infinity;
      actor.order = "hold";
      actor.holdZone = { id: `Mission_${spec.id}`, x: spec.x, z: spec.z, radius: spec.hold ? 0.4 : 2 };
      if(!spec.hold && !WEAPONS[spec.weapon || "Type38"]?.emplaced){
        actor.tacticalRadiusM = id === "approach" ? R.approachTacticalRadiusM
          : id === "bunkerAssault" ? R.intrusionTacticalRadiusM : R.infantryTacticalRadiusM;
      }
      // Emplaced gunners keep their firing position: the hide/peek side step is all they may do.
      // Everyone else may take cover inside their zone plus the ordinary slack.
      actor.scriptCoverSlackM = spec.hold ? R.defendHoldFixedSlackM : R.defendCoverSlackM;
      // Two Type 91/97 grenades apiece (Data_Tuning_FirstLevel.enemyGrenades). The tactics layer decides
      // when one is worth throwing (target pinned in one place, 8-26 m, squad and personal cooldowns);
      // gunners on an emplacement never throw, they are married to the gun.
      if (!spec.hold && !WEAPONS[spec.weapon || "Type38"]?.emplaced) actor.grenades = R.enemyGrenades;
      // 掩蔽部门外那一组是白刃行刑，不扔弹（玩家还躺在木架下）。
      if(id==="bunkerAssault")actor.grenades=0;
      if (spec.hold) {actor.scriptDefensive=true;actor.scriptSuppressible=true;}
      if (["front","machineGun"].includes(id) && !spec.hold) actor.missionAssault = this.MakeAssault(spec.x, spec.z);
      // Supporting platoons keep their spacing and depth. They remain live combatants
      // while the original line and casualty replacements make the close assault.
      if(spec.reserve && actor.missionAssault)actor.missionAssault.points=FrontReserveLane(spec.x,spec.z);
      if(MISSION_TACTICS[spec.id]?.near){
        actor.missionTacticalRadiusM=actor.tacticalRadiusM;
        actor.tacticalRadiusM=0;
        actor.scriptDefensive=true;actor.scriptSuppressible=true;
      }
      this.enemies.set(spec.id, actor);
      return actor;
  }
  MakeAssault(x, z) {
    const points = FrontAssaultLane(x, z);
    if (!points.length) return null;
    // Hold times are scaled per man (0.6-1.4) so the field never moves in lockstep.
    const jitter = .6 + ((Math.abs(Math.round(x * 3 + z * 7)) % 17) / 16) * .8;
    // shifts/volley (2026-09-09, docs/Data_EnemyAi.md §15): the last line is no longer an eleven second
    // stand. A man fires assaultVolleyShots rounds or holds assaultFinalHoldS seconds, then sidesteps to a
    // fresh firing position on the same line (assaultLateralShifts times) before falling back a line and
    // coming again. volley is the fireSequence snapshot taken when he settled on the position.
    return { points, index: 0, hold: 0, pinned: 0, cycles: 0, shifts: 0, volley: 0, mode: "rush", jitter };
  }
  /**
   * A fresh firing position on the same bound line: 3-6 m to one side, out of the cover columns.
   *
   * The sweep itself has to clear those columns too, not just the endpoint - `ClearLaneX` only pushes the
   * endpoint out, and a man at x=-3 stepping +6 m lands at +3 (legal) after walking straight through the
   * Center column between them. Both sides are tried; if neither is clear he keeps the position he has and
   * the caller falls back a line instead.
   */
  FrontLateralBound(target, s) {
    const span = Math.max(0, R.assaultLateralMaxM - R.assaultLateralMinM);
    const step = R.assaultLateralMinM
      + ((Math.abs(Math.round(target.x * 5 + target.z * 3)) + s.shifts * 7) % 16) / 15 * span;
    const first = s.shifts % 2 === 0 ? 1 : -1;
    for (const side of [first, -first]) {
      const x = ClearLaneX(target.x + side * step, target.x);
      if (Math.abs(x - target.x) < R.assaultLateralMinM * .5) continue;
      const lo = Math.min(x, target.x), hi = Math.max(x, target.x);
      if (FRONT_ASSAULT.blockedX.some(([a, b]) => hi > a && lo < b)) continue;
      return { x, z: target.z };
    }
    return null;
  }
  UpdateAssault(dt) {
    const active = ["Support", "MachineGun", "Tank"].includes(this.flow.stage.id);
    for (const actor of this.enemies.values()) {
      const s = actor.missionAssault;
      // 待命的人（missionFrontStandby）不走跃进脚本 —— 他的 AI 照常跑，只是还没轮到他上。
      if (!s || !actor.alive || actor.missionRepelRoute || actor.scriptedNoncombatant || actor.missionFrontStandby) continue;
      if(actor.meleeCombat)continue;
      if(actor.missionReserve && this.time-(this.frontBattleAt??this.time)<actor.missionReleaseDelayS)continue;
      if (!active) {
        if (s.mode !== "settled") { this.Defend(actor, actor.position); s.mode = "settled"; }
        continue;
      }
      // A nearby visible opponent overrides the scheduled bound. The shared
      // combat brain owns cover, search and the physical melee handoff.
      const contact=actor.tacticalRadiusM>0 && !actor.missionReserve && actor.targetVisible
        && !actor.targetFromMemory && actor.target?.ref?.alive!==false
        && actor.target && Distance(actor.position,actor.target.position)<R.assaultContactRangeM;
      if(contact){
        if(s.mode!=="contact")this.Defend(actor,actor.position,R.defendHoldRadiusM,R.assaultCoverSearchM);
        s.mode="contact";continue;
      }
      if (actor.suppression >= R.tacticalSuppression) {
        // Pinned: the anchor is where he already is, but the cover search radius stays open so he
        // crawls into whatever is nearby instead of lying flat in the open until he dies.
        if (s.mode !== "pinned") {
          this.Defend(actor, actor.position, R.defendHoldRadiusM, R.assaultCoverSearchM);
          this.ai.SetStance(actor, 2, 1.5, true);
          s.mode = "pinned";
        }
        s.pinned += dt;
        // Long enough under fire: crawl back one bound instead of dying in the open.
        if (s.pinned > R.assaultPinnedS && s.index > 0) { s.index--; s.hold = 0; s.pinned = 0; s.mode = "rush"; }
        continue;
      }
      s.pinned = 0;
      const target = s.points[s.index];
      // Arrival is hysteretic (2026-09-09, docs/Data_EnemyAi.md §15). Entering the line still needs
      // assaultArrivalM, but a man who has **settled** on it may wander the whole anchor + cover slack
      // without being dragged back: the AI walks him up to assaultCoverSearchM to reach a cover point and
      // sidesteps him 2-4 m between volleys, and the old 0.9 m test called every one of those "off the
      // line" and re-issued MoveActor - which clears scriptDefensive and holdZone and hauls him back to the
      // bare spot. That single line is why the front knelt in the open with cover two steps away.
      const settleM = R.defendHoldRadiusM + R.assaultCoverSearchM;
      if (Distance(actor.position, target) > (s.mode === "hold" ? settleM : R.assaultArrivalM)) {
        s.mode = "rush";
        this.ai.SetStance(actor, 0, .4, true);
        this.MoveActor(actor, target, R.assaultRushMps);
      } else {
        if (s.mode !== "hold") {
          // Reaching a bound line no longer means "kneel here in the open": hold the line as an anchor
          // with assaultCoverSearchM of slack so the AI takes any cover near it and works the peek cycle.
          // Kneeling stays the fallback for a line that has nothing to hide behind.
          this.Defend(actor, target, R.defendHoldRadiusM, R.assaultCoverSearchM);
          this.ai.SetStance(actor, 1, 1, true);
          s.mode = "hold"; s.hold = 0; s.volley = actor.fireSequence;
        }
        s.hold += dt;
        const last = s.index === s.points.length - 1;
        if(last && actor.missionReserve)continue;
        // The last line used to be a flat eleven second stand, three times over. Now it is the same
        // volley/hold rhythm as every other bound: fire assaultVolleyShots rounds or hold
        // assaultFinalHoldS seconds, then take a fresh firing position 3-6 m along the line
        // (assaultLateralShifts of them), and only then fall back to assaultRegroupLine and come again.
        const spent = last && actor.fireSequence - s.volley >= R.assaultVolleyShots;
        if (s.hold >= (last ? R.assaultFinalHoldS : R.assaultHoldS) * s.jitter || spent) {
          if (!last) s.index++;
          else if (s.shifts < R.assaultLateralShifts) {
            const point = this.FrontLateralBound(target, s);
            // Nowhere to slide (both sides run into a cover column): fall back a line instead of
            // standing here, and let the regroup budget below decide whether he comes again.
            if (point) { s.points[s.index] = point; s.shifts++; }
            else if (s.cycles < R.assaultRegroupCycles) { s.index = Math.max(0, Math.min(s.points.length - 1, R.assaultRegroupLine)); s.cycles++; s.shifts = 0; }
            else continue;
          } else if (s.cycles < R.assaultRegroupCycles) { s.index = Math.max(0, Math.min(s.points.length - 1, R.assaultRegroupLine)); s.cycles++; s.shifts = 0; }
          else continue;
          s.hold = 0; s.mode = "rush";
        }
      }
    }
  }
  UpdateWaves() {
    if (!["Support", "MachineGun", "Tank"].includes(this.flow.stage.id) || !this.Has("frontBattleStarted")) return;
    const w = this.waves || (this.waves = { spawned: 0, queued:0, squads: 0, nextAt: this.time + R.waveFirstDelayS });
    if (w.spawned >= R.waveBudget || this.time < w.nextAt) return;
    let alive = 0;
    for (const actor of this.enemies.values()) if (actor.alive && ["front","machineGun","approach","tank"].includes(actor.missionEncounter)) alive++;
    const size=FrontReplacementSlots({alive,queued:w.queued,spawned:w.spawned},R);
    if (!size || this.spawnQueue.length) return;
    w.nextAt = this.time + R.waveIntervalS;
    const squad = w.squads++, cx = FRONT_ASSAULT.waveCentersX[squad % FRONT_ASSAULT.waveCentersX.length];
    for (let i = 0; i < size; i++) {
      w.queued++;
      const x = cx + ((i % 3) - 1) * 3.2 + (i >= 3 ? 1.6 : 0), z = FRONT_ASSAULT.spawnZ - (i >= 3 ? 2.5 : 0), id = `Wave${squad}_${i}`;
      const Spawn=() => {
        const actor = this.ai.Spawn("ija", x, z, { weapon: i === 0 && squad % 2 === 1 ? "Type11" : "Type38", squadId: `MissionWave${squad}` });
        if (!actor) {this.spawnQueue.push(Spawn);return;}
        w.queued--;w.spawned++;
        actor.missionId = id; InstallMissionSentry(actor);
        actor.missionEncounter="front";
        actor.scriptAccuracyScale = actor.missionAccuracyScale = R.frontAccuracyScale;
        actor.scriptFireIntervalScale = actor.missionFireIntervalScale = R.frontFireIntervalScale;
        actor.scriptArrivalRadius = 0.7;
        actor.manualGoalUntil = Infinity;
        actor.order = "hold";
        actor.holdZone = { id: `Mission_${id}`, x, z, radius: 2 };
        actor.scriptCoverSlackM = R.defendCoverSlackM;
        if (actor.weapon?.kind === "boltRifle") actor.grenades = R.enemyGrenades;
        actor.missionAssault = this.MakeAssault(x, z);
        this.enemies.set(id, actor);
      };
      this.spawnQueue.push(Spawn);
    }
  }
  /**
   * 12 的两处威胁（契约 §2/§4）：先是压向装载区的 transfer，解除之后隔
   * transferThreatGapS 才轮到侧巷的 transferAlley。不做四拍守波次。
   */
  UpdateTransferThreats() {
    const beats=this.transferBeats ||= {index:0,previousClearedAt:0,started:[],cleared:[]};
    const plan=MISSION_TRANSFER_THREATS[beats.index];
    if(!plan)return;
    const seconds=this.flow.stageTime;
    if(!beats.started.includes(plan.id)) {
      if(plan.after && (!this.Has(plan.after) || seconds<beats.previousClearedAt+R.transferThreatGapS))return;
      this.SpawnEncounter(plan.id);beats.started.push(plan.id);
      this.Record(`${plan.id}AttackStarted`,{loaded:this.column.loadEvents.length,departed:this.column.departed});
    }
    const actors=MISSION_ENCOUNTERS[plan.id].map(spec=>this.enemies.get(spec.id));
    if(actors.every(actor=>actor && !actor.alive)) {
      beats.cleared.push(plan.id);beats.previousClearedAt=seconds;beats.index++;
      this.Record(plan.resolved,{loaded:this.column.loadEvents.length,departed:this.column.departed});
    }
  }
  Threatens(point, ids = null, targetHeight = 1.1, rangeM = R.passageRangeM) {
    return [...this.enemies].some(([id, actor]) => {
      if (
        (ids && !ids.includes(id)) ||
        !actor.alive ||
        actor.scriptedNoncombatant ||
        actor.missionSurfaceRest ||
        // 待命的人在 WATCH 里一枪都不开，对通路不构成威胁（和改成真 AI 之前一个意思）
        actor.missionFrontStandby ||
        actor.suppression >= R.threatSuppression ||
        actor.state === "suppressed"
      )
        return false;
      if (Distance(actor.position, point) > rangeM) return false;
      const eye = actor.stance === 2 ? .35 : actor.stance === 1 ? .9 : 1.35;
      const from = actor.position.clone().add(new THREE.Vector3(0, eye, 0)),
        to = this.Point(point, targetHeight),
        delta = to.sub(from),
        length = delta.length();
      const hit = this.battlefield.Raycast(from, delta.normalize(), length, {terrain:true});
      return !hit || hit.t >= length - 0.3;
    });
  }
  Register() {
    const Register = (id, point, label, Enabled, OnComplete, extra = {}) =>
      this.interact.Register({
        id,
        tag: "FirstLevelMission",
        kind: id.startsWith("MissionSupply")||id==="MissionBundle"?"supply":id==="MissionZhouCarry"?"carry":"interact",
        position: this.Point(point, 0.6),
        label,
        Enabled,
        OnComplete,
        gesture: "hold",
        seconds: R.interactionSeconds,
        reachM: R.interactionRangeM,
        heightM: 2.5,
        facingDot: null,
        once: false,
        ...extra,
      });
    // 01/02：掉在掩蔽部里的那支步枪（MISSION_PLACEMENT.bunker.rifle —— 受困时够不到，
    // 离压住的位置 3.7 m）。拾起来才算真的回到战斗里。
    Register(
      "MissionRifle",
      P.bunker.rifle,
      () => this.Text("rifle"),
      () => this.flow.stage.id === "BunkerRescue" && this.Has("luoRescueComplete") && !this.Has("rifleRecovered"),
      () => {
        this.Record("rifleRecovered");
        this.RemoveBunkerRifle();
        this.RestoreRifle();
        this.SaveCheckpoint();
        return true;
      },
    );
    // 13：顺子跟着老周那辆车走。
    Register(
      "MissionCart",
      A.cartBoard,
      () => this.Text("cart"),
      () => this.flow.stage.id === "CartRide" && !this.Has("cartBoarded"),
      () => {
        if (!this.BeginCartRide()) return false;
        this.Record("cartBoarded");
        return true;
      },
    );
    Register(
      "MissionBundle",
      A.bundle,
      () => this.Text("bundle"),
      () => this.flow.stage.id === "Tank" && this.Has("bundleRouteTraversed") && (!this.tank.immobilized || !this.Has("bundleTaken")),
      () => {
        const missing = Math.max(0, R.bundleSupplyCount - this.Inventory().bundles);
        const bandages = Math.max(0, R.bundleSupplyBandages - this.player.bandages);
        if (missing || bandages) this.GiveSupply({ bundles: missing, bandages });
        this.Record("bundleTaken");
        this.SaveCheckpoint();
        this.GuideSortie(MISSION_ROUTES.bundleReturn);
        return true;
      },
    );
    Register(
      "MissionGate",
      A.gate,
      () => this.Text("gate"),
      () => ["Village", "Melee", "Courtyard"].includes(this.flow.stage.id) && !this.Has("courtyardGateOpen"),
      () => {
        this.battlefield.OpenGate("MissionCourtyardGate");
        this.column.gateOpen = true;
        this.Record("courtyardGateOpen");
        return true;
      },
    );
    Register(
      "MissionZhouCarry",
      A.queue,
      () => this.Text("carry"),
      // 15B 的换手不是一进夹道就能按：后抬手真的撒了手（carrySwapOffered）才轮到顺子。
      () => ["Carry", "WallPath", "Handover"].includes(this.flow.stage.id) && !this.carry.Active
        && (this.flow.stage.id !== "WallPath" || this.Has("carrySwapOffered")),
      () => this.BeginCarry(),
      {
        Anchor: () =>
          this.Point(
            {
              x: this.column.zhou.x + Math.sin(this.column.zhou.yaw) * 1.6,
              z: this.column.zhou.z + Math.cos(this.column.zhou.yaw) * 1.6,
            },
            0.65,
          ),
      },
    );
    Register(
      "MissionZhouPlace",
      A.zhouDrop,
      () => this.Text("place"),
      // 军医先指位置（PlaceLitter → placeOrderHeard），玩家与前抬手才一起放下。
      () => this.flow.stage.id === "Handover" && this.carry.KindId === "stretcher" && this.Has("placeOrderHeard"),
      () => {
        this.carry.ForceRelease("delivered");
        Object.assign(this.column.zhou, { ...A.zhouDrop, state: "placed", yaw: 0, roll: 0 });
        this.Record("zhouPlaced");
        // 放下担架就恢复正常持枪（Notion 16）。
        this.RestoreRifle();
        this.SaveCheckpoint();
        return true;
      },
    );
    for (const spec of MISSION_SUPPLIES) {
      Register(
        `MissionSupply${spec.id}`, spec, () => this.Text("supply"),
        () => !this.carry.Active && !this.EmptyHands,
        () => {
        this.GiveSupply({clips:spec.id==="Front"?R.frontSupplyClips:4,grenades:2,bandages:1});
        if(spec.id==="Front")this.emplacement.Resupply(this.gunId,3);
        return true;
      },
        {cooldownS:R.supplyCooldownS,
          Anchor:()=>new THREE.Vector3(spec.x,this.battlefield.GroundHeight(spec.x,spec.z)+(spec.supportHeight||0)+.3,spec.z)},
      );
    }
    this.gunId = this.emplacement.CreateEmplacement({
      id: "MissionGun",
      tag: "FirstLevelMission",
      kindId: "Zb26Nest",
      position: this.Point(A.gun, 1.45),
      seat: this.Point(GUN_SEAT),
      baseYaw: 0,
      arcYawDeg: 62,
      belts: 4,
      payload:{followSight:true,supportedSeat:true},
      OnOccupy: () => {
        this.Record("gunOccupied");
        for(const [i,actor] of this.squad.entries()){
          actor.scriptEssential=OPENING.requiredSquadCast.includes(actor.castId);this.Defend(actor,P.squadFrontPositions[i]);
        }
      },
    });
    const gun = this.emplacement.Emplacement(this.gunId);
    gun.kind = { ...gun.kind, stance: "stand" };
    this.interact.Register(
      EmplacementInteraction({
        id: "MissionGunTake",
        tag: "FirstLevelMission",
        emplacement: this.emplacement,
        gunId: this.gunId,
        carry: this.carry,
        Available: () => ["MachineGun", "Tank"].includes(this.flow.stage.id),
        reachM: 3,
        facingDot: null,
      }),
    );
  }
  Text(key) {
    return T(`firstLevel.interaction.${key}`);
  }
  Enter(stage) {
    this.leaderGuide?.Enter(stage);
    // Narrative companions survive incidental combat from the very first stage.
    for(const actor of this.squad||[])actor.scriptEssential=OPENING.requiredSquadCast.includes(actor.castId);
    this.opening.Enter(stage.id);
    this.frontShow?.Enter(stage.id);
    this.UpdateMusic(stage.id);
    this.Objective(Localize(FirstLevelStageTextId(stage.id), stage.objective));
    // 进场不自动播的那几步：它们的 cue 由编排在真正发生的那一刻起播
    // （受困段的黑屏对白、接令、连屋破门、院门打开、牺牲、上车；15B 后抬手撒手、15C 院门
    // 守军喝止、16 过门槛、18 传令兵跑到跟前与尾队被顶在桥头）。
    if (stage.cue && !["Trapped", "Orders", "Melee", "Courtyard", "Death", "CartRide",
      "WallPath", "ReceptionGate", "Handover", "BridgeOrders", "BridgeCover"].includes(stage.id))
      this.Say(stage.cue, { urgent: ["AirFirst", "Dive", "Death"].includes(stage.id) });
    // 按表生成这一步的遭遇组（Data_FirstLevelMissionGates.MISSION_STEP_SPAWNS，
    // 顺序就是原来各 case 里的调用顺序）。front 与转运四拍不在表里：
    // 前者由 UpdateFront 的 frontBattleStarted 放出，后者由 UpdateTransferThreats 放出。
    for (const id of MISSION_STEP_SPAWNS[stage.id] || []) this.SpawnEncounter(id);
    switch (stage.id) {
      case "Trapped":
        this.PlaceSquad();
        break;
      case "RearTrench":
        this.audio.Ambience("firstLevelFront");
        this.Guide(MISSION_STAGE_ROUTES.rearTrench);
        break;
      case "Support":
        this.column.zhou.visible = false;
        this.audio.Ambience("firstLevelFront");
        // Count the player's whole Support engagement. The new approach has
        // live attackers, and a player may break that fire before crossing the
        // exact frontReached radius; sampling only at the final point soft-locks
        // an already-cleared battlefield behind one extra, meaningless shot.
        this.frontArrivalAt=null;
        this.frontArrivalShots=this.Inventory().shots;
        this.Guide(MISSION_ROUTES.support);
        this.forwardGunner = this.ai.Spawn("nra", A.forwardNest.x, A.forwardNest.z, {
          weapon: "Zb26",
          squadId: "MissionForwardNest",
        });
        if (this.forwardGunner) this.Defend(this.forwardGunner, A.forwardNest);
        // The finite assault is committed by UpdateFront at the last approach
        // bend. approach/tank/village/melee are spawned at this step (MISSION_STEP_SPAWNS,
        // before the switch) so a slow approach can spend the battle offscreen.
        this.frontDefenders=FRONT_DEFENDERS.map(spec=>{
          const actor=this.ai.Spawn("nra",spec.x,spec.z,{weapon:spec.weapon,squadId:"MissionFrontDefense"});
          if(actor){InstallMissionSentry(actor);actor.missionId=spec.id;this.Defend(actor,spec);this.ai.SetStance(actor,spec.stance,Infinity,true);
            actor.scriptAccuracyScale=R.defenderAccuracyScale;actor.scriptFireIntervalScale=R.defenderFireIntervalScale;}
          return actor;
        }).filter(Boolean);
        this.SpawnGuards();
        this.tank.present=true;
        break;
      case "MachineGun":
        this.tank.active = true;
        this.SpawnGuards();
        for (const [i, actor] of this.squad.entries()) this.Defend(actor, OPENING.frontPosts[i],R.contactRadiusM,R.companionCoverSlackM);
        break;
      case "Tank":
        // The blast screen separates the front posts from the far end of the
        // bundle approach. Everyone exits through its central trench junction.
        this.emplacement.Vacate("sortie");
        this.GuideSortie(MISSION_ROUTES.bundle);
        this.EnsureBundleKeeper();
        break;
      case "Orders":
        this.Guide(MISSION_STAGE_ROUTES.collectionReturn);
        this.column.Activate();
        this.column.zhou.health = Math.min(this.column.zhou.health,65);
        this.column.zhou.state = "waiting";
        break;
      case "South":
        // 前沿那一场留在身后：真走一段，不再黑屏瞬移。
        for (const actor of this.enemies.values())
          if (actor.alive && actor.missionEncounter !== "village" && actor.missionEncounter !== "melee")
            actor.scriptedNoncombatant = true;
        for (const cart of this.column.traffic) cart.visible = true;
        this.audio.Ambience("firstLevelSouth");
        this.Guide(MISSION_STAGE_ROUTES.southWalk);
        this.column.active = true;
        break;
      case "Village":
        // 连屋那一组不跟着村口的日军一起醒：玩家绕到灶屋以东他们才出来。
        for (const actor of this.enemies.values())
          if (actor.alive && actor.missionDormant && actor.missionEncounter !== "melee") actor.scriptedNoncombatant = false;
        this.audio.Ambience("firstLevelFront");
        this.Guide(MISSION_ROUTES.village.slice(0, 3));
        this.column.active = true;
        this.village.Enter(stage.id);
        break;
      case "Melee":
        this.meleeStartedAt = this.time;
        this.village.Enter(stage.id);
        break;
      case "Courtyard":
        this.Guide(MISSION_STAGE_ROUTES.courtyardBypass);
        this.village.Enter(stage.id);
        break;
      case "TransferApproach":
        this.Guide(MISSION_ROUTES.village.slice(-4));
        this.column.loading = true;
        this.transferCart.Enter(stage.id);
        break;
      case "Transfer":
        this.Guide(MISSION_ROUTES.village.slice(-4));
        this.transferCart.Enter(stage.id);
        break;
      case "CartRide":
        this.guideRoute = null;
        break;
      case "AirFirst":
        this.guideRoute = null;
        this.transferCart.Enter(stage.id);
        this.StartAir(1, R.firstAirLeadS);
        break;
      case "Carry":
        this.column.zhou.state = "critical";
        this.Defend(this.companion.Handle("heyoutian"), A.transfer);
        break;
      case "Dive":
        this.StartAir(2, R.secondAirLeadS);
        break;
      case "Rescue":
        this.RestoreRifle();
        this.rescueTime = 0;
        break;
      case "Regroup":
        // 15A 降压段：收拢、换手、清点。无战斗 —— 追兵由警戒兵在车路方向接住。
        // **带路只带到收拢点为止。** 那条走廊（回头警告用的）第 4 点是撤离线的下一段，
        // 拿它当带路终点的话队伍会走出收拢点 24 m，而点名要三个人都在 16 m 以内 ——
        // 实拍 2026-09-20：玩家站在收拢点上等满 300 s 也等不来 headcountDone，
        // HUD 一直挂着「罗班长 · 24 米」。15B 的进夹道路线也是从收拢点起算的。
        this.column.StartRetreat();
        this.Guide(RegroupGuideRoute("Regroup"));
        this.quietMarch.Enter("Regroup");
        break;
      case "WallPath":
        this.column.zhou.health = 12;
        this.Guide(MISSION_STAGE_ROUTES.wallPath);
        this.quietMarch.Enter("WallPath");
        break;
      case "ReceptionGate":
        // StartReception 挪到「接收人员把位置说清楚」之后（FirstLevelReception）。
        this.column.zhou.health = 6;
        this.guideRoute = null;
        this.reception.Enter("ReceptionGate");
        break;
      case "Handover":
        this.column.zhou.state = "waiting";
        this.bedGuide = {
          actor: this.companion.Handle("yaowa"),
          route: ReceptionBedGuideRoute("Handover"),
        };
        if (this.bedGuide.actor) this.squadRoutes.set(this.bedGuide.actor.id, []);
        this.EnsureYardCast();
        this.reception.Enter("Handover");
        break;
      case "Death":
        // 16 的长接收路线可能还剩中间点；17 只保留床边这一段，避免幺娃被旧路线
        // 拉回门外，导致他永远够不到覆盖物。正常流程仍由 MoveActor 真走到侧位。
        this.bedGuide = {
          actor: this.companion.Handle("yaowa"),
          route: ReceptionBedGuideRoute("Death"),
        };
        if (this.bedGuide.actor) this.squadRoutes.set(this.bedGuide.actor.id, []);
        this.EnsureYardCast();
        this.reception.Enter("Death");
        break;
      case "BridgeOrders":
        this.reception.EndBedsideCare();
        this.guideRoute = null;
        this.audio.Ambience("firstLevelFront");
        this.Guide(MISSION_STAGE_ROUTES.toBridge);
        this.bridge.Enter("BridgeOrders");
        break;
      case "BridgeCover":
        this.bridge.Enter("BridgeCover");
        break;
      case "BridgeWithdraw":
        // 带路线**跳过第一点**（那就是南岸射位 bridgeCover）。不跳的话「桥头撤！」
        // 一喊，班里四个人全往玩家脚下那一格走 —— 实拍是玩家被自己人裁步挡死在
        // 射位上，八个方向一步都挪不动（口径见 docs/Data_FirstLevelEnd20260919.md）。
        // 撤就是各自往南走，不是先集合再走。
        this.Guide(MISSION_STAGE_ROUTES.bridgeWithdraw.slice(1));
        this.bridge.Enter("BridgeWithdraw");
        break;
      case "NightMarch":
        // 爆破之后先随队走完 marchOut 才淡出（FirstLevelNightGate）。
        this.nightGate.Enter("NightMarch");
        break;
      case "Complete":
        this.ClearReturnWarning();
        this.completed = true;
        this.Complete();
        break;
    }
    if (!["Trapped", "Dive", "Death", "NightMarch"].includes(stage.id)) this.SaveCheckpoint();
  }
  SpawnGuards() {
    if(this.guards.length)return;
    for (let i = 0; i < R.guardCount; i++) {
      const post=FRONT_GUARD_POSTS[i];
      const actor = this.ai.Spawn("nra", post.x, post.z, {
        weapon: "HanYang",
        squadId: "MissionWithdrawingGuard",
      });
      if (actor) {
        InstallMissionSentry(actor);this.Defend(actor,actor.position,0,0);
        actor.scriptedNoncombatant=true;
        this.ai.SetStance(actor,2,Infinity,true);
        this.guards.push({
          actor,
          progress: 0,
          safe: false,
          route: P.guardWithdrawalRoutes[i],
        });
      }
    }
  }
  UpdateGuards(dt) {
    const pair=GuardCrossingPair(this.guards.map(guard=>({id:guard.actor.id,safe:guard.safe,alive:guard.actor.alive})),R.guardPairSize);
    for (const guard of this.guards) {
      if (!guard.actor.alive || guard.progress>=guard.route.length) continue;
      if(!guard.safe && (!pair.includes(guard.actor.id) || !(this.Has("gunUsed") || this.flow.stage.id==="MachineGun" || this.Has("frontAttackRepelled") || (this.flow.stage.id==="Support" && this.Has("frontReached") && this.guards.indexOf(guard)<OPENING.rifleGuardCount && FirstLevelRifleContribution(this.Inventory().shots,this.frontArrivalShots))) || (!guard.crossing && this.time<(this.nextGuardCrossingAt||0)))) {
        this.Defend(guard.actor,guard.actor.position,0,0);this.ai.SetStance(guard.actor,2,Infinity,true);continue;
      }
      // Test the waiting man's actual prone silhouette, then commit to the bound.
      // Rechecking a standing silhouette every frame stranded men in their shelter.
      if (guard.crossing || !this.Threatens(guard.actor.position,null,guard.actor.stance===2?.35:1.1)) {
        guard.crossing=true;
        guard.actor.scriptedNoncombatant=false;
        this.ai.SetStance(guard.actor,guard.safe?1:0,1.2);
        if (Distance(guard.actor.position, guard.route[guard.progress]) < 1.4) guard.progress++;
        if(!guard.safe && guard.progress>R.guardSafeRouteIndex) {
          guard.safe = true;
          this.Record(`guardWithdrawn${guard.actor.id}`,{survived:this.guards.filter(entry=>entry.safe).length});
          this.nextGuardCrossingAt=this.time+R.guardCrossingGapS;
        }
        if (guard.progress >= guard.route.length) {
          this.MoveActor(guard.actor,guard.actor.position,0);
          this.ai.SetStance(guard.actor,1,Infinity,true);
          continue;
        }
        const target=guard.route[guard.progress],p=guard.actor.position;
        const distance=Distance(p,target)||1,dx=(target.x-p.x)/distance,dz=(target.z-p.z)/distance;
        const blocked=this.guards.some(other=>other!==guard&&other.progress<other.route.length&&other.actor.alive&&
          // A strict route order prevents two converging men from each seeing
          // the other just ahead and yielding forever at the trench junction.
          (other.progress>guard.progress || (other.progress===guard.progress &&
            (Distance(other.actor.position,other.route[other.progress])<distance ||
             (Distance(other.actor.position,other.route[other.progress])===distance && other.actor.id<guard.actor.id))))&&
          (other.actor.position.x-p.x)*dx+(other.actor.position.z-p.z)*dz>0&&
          Math.abs((other.actor.position.x-p.x)*dz-(other.actor.position.z-p.z)*dx)<.65&&
          Distance(other.actor.position,p)<1.4);
        this.MoveActor(guard.actor,target,blocked?0:R.guardSpeedMps);
      } else {
        this.Defend(guard.actor,guard.actor.position);
        this.ai.SetStance(guard.actor,1,1.5);
      }
    }
    if(this.flow.stage.id==="Support" && this.guards.slice(0,OPENING.rifleGuardCount).length===OPENING.rifleGuardCount && this.guards.slice(0,OPENING.rifleGuardCount).every(g=>g.safe||!g.actor.alive))this.Record("rifleWithdrawalResolved",{survived:this.guards.slice(0,OPENING.rifleGuardCount).filter(g=>g.safe&&g.actor.alive).length});
    if (this.guards.length && this.guards.every((guard) => guard.safe || !guard.actor.alive))
      {
        const survived=this.guards.filter(guard=>guard.safe && guard.actor.alive).length;
        this.Record("guardWithdrawalResolved", { survived,casualties:this.guards.length-survived,outcome:survived?"withdrawal":"lost" });
        if(survived)this.Record("guardsSafe",{survived});
      }
    // 06 Tank：最后一批守军真的走完了自己那条撤退线（不是「安全了」而已）。
    if(this.flow.stage.id==="Tank" && this.guards.length
      && this.guards.every(guard=>!guard.actor.alive || guard.progress>=guard.route.length))
      this.Record("lastGuardsWithdrawn",{survived:this.guards.filter(guard=>guard.actor.alive).length});
  }
  /**
   * 03/04 前沿的台词。契约 §5 之后这一段**只有一条** cue：老周指「右边破墙」的
   * `FrontBlockade`。2026.09.14 那套六条（呼叫 / 提醒 / 兜底 / 过沟 / 追击 / 收到）
   * 随采用稿全部下线，台词表里已经没有它们。
   *
   * 说的时机仍然按「封锁是真的」判：还有守军被压在外面、封锁那挺机枪还活着。
   * 玩家真看见那几个人被压住 `frontDialogueSeenS` 秒就说；一直没看见的，
   * 到 `frontDialogueFallbackS` 也说一次（不说的话玩家不知道往哪打）。
   * 机枪先被打掉就撤回这一条 —— 不指一堵已经不挡路的墙。
   */
  UpdateFrontDialogue() {
    if(!["Support","MachineGun"].includes(this.flow.stage.id)||!this.Has("frontReached"))return;
    const remaining=this.guards.filter(guard=>guard.actor.alive&&!guard.safe);
    const gunner=this.enemies.get("FrontGunner");
    if(!(remaining.length&&gunner?.alive)){
      if(gunner&&!gunner.alive)this.voice.Cancel(["FrontBlockade"]);
      this.frontDialogueSeenAt=null;
      return;
    }
    this.frontDialogueAt??=this.time;
    const visible=remaining.some(guard=>{
      const point=this.Point(guard.actor.position,1),ndc=point.clone().project(this.player.camera);
      return ndc.z>=-1&&ndc.z<=1&&Math.abs(ndc.x)<.75&&Math.abs(ndc.y)<.75&&!this.BlocksSight(this.player.EyePosition,point);
    });
    if(visible)this.frontDialogueSeenAt??=this.time;else this.frontDialogueSeenAt=null;
    const seen=this.frontDialogueSeenAt!=null&&this.time-this.frontDialogueSeenAt>=R.frontDialogueSeenS;
    if(seen||this.time-this.frontDialogueAt>=R.frontDialogueFallbackS)this.Say("FrontBlockade");
  }
  OnBlast({ position, radius, damage, byPlayer, explosiveId }) {
    if (byPlayer) {
      (this.playerExplosions ||= []).push({
        at: this.time,
        x: position.x,
        y: position.y,
        z: position.z,
        explosiveId,
        trackDistance: Distance(position, this.tank),
      });
      if (this.playerExplosions.length > 8) this.playerExplosions.shift();
    }
    this.column.Blast(position, radius, damage, (entry) => {
      const from = position.clone().add(new THREE.Vector3(0, 0.25, 0)),
        delta = this.Point(entry, 0.9).sub(from),
        distance = delta.length();
      const hit = this.battlefield.Raycast(from, delta.normalize(), distance);
      return !hit || hit.t >= distance - 0.35;
    });
    if (!this.Has("bundleTaken") || !this.tank.active || this.tank.immobilized || !byPlayer || explosiveId !== "GrenadeBundle") return;
    if (Distance(position, this.tank) > R.tankTrackRadiusM) return;
    const track = {
      x: this.tank.x + (position.x < this.tank.x ? -1.5 : 1.5),
      z: Clamp(position.z, this.tank.z - 2.6, this.tank.z + 2.6),
    };
    const from = position.clone().add(new THREE.Vector3(0, 0.2, 0)),
      delta = this.Point(track, 0.55).sub(from),
      distance = delta.length();
    if (distance >= radius || damage * (1 - distance / radius) ** 2 < R.tankTrackMinDamage) return;
    const hit = this.battlefield.Raycast(from, delta.normalize(), distance);
    if (hit && hit.box?.tag !== "missionTank" && hit.t < distance - 0.25) return;
    this.tank.immobilized = true;
    this.tank.moving = false;
    this.tank.damageAt = this.time;
    const impactX=position.x-this.tank.x,impactZ=position.z-this.tank.z,yaw=this.tank.hullYaw??Math.PI;
    this.tank.damageSide = Math.cos(yaw)*impactX-Math.sin(yaw)*impactZ < 0 ? -1 : 1;
    // Acquisition remains the actual house interaction, never inferred from a blast.
    this.Record("tankImmobilized", { position: { x: position.x, z: position.z }, explosiveId });
    this.Say("TankStopped");
    // 2026.09.19：侧翼那两条（JapaneseFlank / FlankWarning）随采用稿下线，
    // 侧翼动作本身照旧 —— 只是不再配台词。
    for (const id of ["FlankA", "FlankB"]) {
      const actor = this.enemies.get(id);
      if (actor) {
        actor.missionFlank = true;
        actor.scriptedNoncombatant = false;
        actor.missionFlankIndex = 0;
      }
    }
  }
  UpdateFlank() {
    for (const actor of this.enemies.values()) {
      if (!actor.alive || !actor.missionFlank) continue;
      const route = MISSION_ROUTES.flank;
      while (
        actor.missionFlankIndex < route.length &&
        Distance(actor.position, route[actor.missionFlankIndex]) < 1.4
      )
        actor.missionFlankIndex++;
      if (actor.missionFlankIndex < route.length)
        this.MoveActor(actor, route[actor.missionFlankIndex], R.flankSpeedMps);
      else {
        actor.missionFlank = false;
        this.Defend(actor, route.at(-1));
      }
      actor.scriptedNoncombatant = this.flow.stage.id === "South";
    }
  }
  /**
   * 接防人员（契约 §2 的 reliefInPosition）。2026.09.19 起他们不再是军列上下来的人：
   * 一个班从背坡伤员集结处沿后交通壕上来，进前沿阵位。
   */
  UpdateRelief(dt) {
    if(!["Tank","Orders"].includes(this.flow.stage.id))return;
    if(!this.relief) {
      // collectionReturn 反过来走就是「集结处 → 前沿交通壕口 (6,-124)」那一段；
      // 再往后（(15,-111) → (30,-117)）是去集束弹沟的支线，接防班不去那儿 ——
      // 从那里横回阵位会正面穿过 FrontTraverseCover 那排掩体。
      const approach=[...MISSION_STAGE_ROUTES.collectionReturn].reverse().slice(0,5);
      this.relief=P.reliefPositions.map((post,i)=>{
        const actor=this.ai.Spawn("nra",A.collection.x+(i%2?1.4:-1.4),A.collection.z+Math.floor(i/2)*1.6,
          {weapon:"HanYang",squadId:"MissionRelief"});
        if(!actor)return null;
        InstallMissionSentry(actor);actor.missionId=`Relief${i}`;actor.missionTrainReady=true;
        return {actor, route:[...approach,{x:post.x,z:-123},post], index:0, delay:i*R.reliefDelaySeconds,
          arrived:false, distance:0, last:{x:actor.position.x,z:actor.position.z}};
      }).filter(Boolean);
      if(!this.relief.length){this.relief=null;return;}
    }
    for(const entry of this.relief) {
      const actor=entry.actor;
      if(!actor.alive||entry.arrived)continue;
      entry.distance+=Distance(actor.position,entry.last);entry.last={x:actor.position.x,z:actor.position.z};
      if(entry.delay>0){entry.delay-=dt;continue;}
      while(entry.index<entry.route.length&&Distance(actor.position,entry.route[entry.index])<1)entry.index++;
      if(entry.index>=entry.route.length){entry.arrived=true;this.Defend(actor,actor.position);this.ai.SetStance(actor,1,2);continue;}
      actor.scriptedNoncombatant=false;
      if(this.RespondToContact(actor))continue;
      this.ai.SetStance(actor,0,.4,true);
      this.MoveActor(actor,entry.route[entry.index],R.reliefSpeedMps);
    }
    if(this.relief.length && this.relief.every(entry=>entry.arrived||!entry.actor.alive))
      this.Record("reliefInPosition",{arrived:this.relief.filter(entry=>entry.arrived).length});
  }
  UpdateTactics(dt) {
    const stage = this.flow.stage.id;
    for (const [id, actor] of this.enemies) {
      const plan = MISSION_TACTICS[id], state = actor.missionTactic;
      if (!actor.alive || !state || actor.scriptedNoncombatant || actor.meleeCombat) continue;
      state.distance += Distance(actor.position, state.last);
      state.last = { x: actor.position.x, z: actor.position.z };
      // Local attacks start as the marching player reaches each sector, not offscreen at stage entry.
      if(plan.near && !state.released){
        if(!this.Near(plan.near,plan.nearM))continue;
        state.released=true;
        actor.tacticalRadiusM=actor.missionTacticalRadiusM;actor.scriptDefensive=false;
      }
      state.elapsed += dt;
      // Let shared AI finish throws, fight/charge visible close threats and search after the final bound.
      if(plan.near && (actor.actor?.pendingGrenadeThrow || actor.actor?.characterRig?.infantry?.IsThrowing() || actor.state==="grenade" ||
        (actor.targetVisible && actor.target && Distance(actor.position,actor.target.position)<R.approachContactM) ||
        state.index>=plan.points.length)){
        if(state.mode!=="contact"){actor.tacticalRadiusM=R.approachContactRadiusM;this.Defend(actor,actor.position);state.mode="contact";}
        continue;
      }
      const target = plan.points[state.index];
      if (!target || state.elapsed < plan.delay || actor.suppression >= R.tacticalSuppression) {
        const suppressed=actor.suppression>=R.tacticalSuppression;
        if(suppressed && Distance(actor.position,state.shelter)>R.tacticalArrivalM){
          this.MoveActor(actor,state.shelter,R.tacticalMoveMps);state.mode="fallback";
        }else {this.Defend(actor, state.shelter);state.mode=suppressed?"suppressed":"cover";}
        if (suppressed) this.ai.SetStance(actor, 1, 1, true);
        continue;
      }
      if (Distance(actor.position, target) < R.tacticalArrivalM) {
        this.Defend(actor, target);
        state.shelter={...target};
        state.mode = "cover";
        state.hold += dt;
        if (state.hold >= (plan.near?R.approachBoundHoldS:R.tacticalHoldSeconds)) { state.index++; state.hold = 0; }
      } else {
        state.mode = "advance";
        this.ai.SetStance(actor, 0, .4, true);
        this.MoveActor(actor, target, plan.near?R.approachAdvanceMps:R.tacticalMoveMps);
        state.movingSeconds += dt;
      }
    }
  }
  UpdateFront() {
    const wake=MISSION_ENCOUNTER_ACTIVATION.village.wake;
    for(const actor of this.enemies.values())if(this.flow.stage.id===wake.step && actor.missionEncounter!=="melee" && actor.missionDormant && Distance(actor.position,this.player.position)<wake.radiusM){
      actor.missionDormant=false;actor.scriptedNoncombatant=false;
    }
    if(!["Support","MachineGun","Tank","Orders"].includes(this.flow.stage.id))return;
    if(this.flow.stage.id==="Support")for(const [i,shell] of FRONT_SHELLS.entries()){
      const fact="approachShell"+i;
      if(!this.Has(fact)&&this.GateNear(fact)){
        this.Record(fact);
        this.combat.FireShell(this.Point({x:shell.impact.x+45,z:shell.impact.z-45},32),this.Point(shell.impact),
          {kind:"Shell75",flight:1.8,radius:6,damage:70});
      }
    }
    if(!this.Has("frontBattleStarted")&&this.GateNear("frontBattleStarted")){
      this.Record("frontBattleStarted");
      this.frontBattleAt=this.time;
      this.SpawnEncounter("front");
      for(const actor of this.enemies.values())if(actor.missionFrontStandby){actor.scriptedNoncombatant=false;actor.missionFrontStandby=false;}
      for(const guard of this.guards){this.Defend(guard.actor,guard.actor.position,0,0);this.ai.SetStance(guard.actor,2,Infinity,true);}
    }
    if(!this.tank.active&&this.Near(A.front,R.tankRevealDistanceM)){this.tank.active=true;this.tank.lastShell=this.time;}
  }
  GuideSortie(route) {
    const holdingRoutes=new Map([...this.squadRoutes].map(([id,points])=>[id,points.map(point=>{
      const clean={...point};delete clean.coverBound;return clean;
    })]));
    const returning=route===MISSION_ROUTES.bundleReturn;
    this.Guide(route,{fromStart:!returning});
    for(const actor of this.squad){
      actor.missionSortie=actor.castId==='luo';
      if(actor.missionSortie&&!returning)this.squadRoutes.set(actor.id,[...(holdingRoutes.get(actor.id)||[]),...this.squadRoutes.get(actor.id)]);
      if(!actor.missionSortie){
        // Keep the unfinished approach so rear members physically reach their front posts.
        this.squadRoutes.set(actor.id,holdingRoutes.get(actor.id)||[]);
        this.Defend(actor,OPENING.frontPosts[this.squad.indexOf(actor)],R.contactRadiusM,R.companionCoverSlackM);
      }
    }
  }
  EnsureBundleKeeper(){
    if(this.bundleKeeper)return;
    const actor=this.ai.Spawn('nra',Sortie.keeper.x,Sortie.keeper.z,{weapon:'HanYang',squadId:'MissionBundleSupply'});
    if(actor){
      this.bundleKeeper=actor;actor.missionId='BundleKeeper';actor.scriptEssential=true;
      InstallMissionSentry(actor);this.Defend(actor,Sortie.keeper,0,0);this.ai.SetStance(actor,1,Infinity,true);
    }
  }
  UpdateSortie(){
    this.EnsureBundleKeeper();
    for(const crawl of Sortie.crawl)if(this.player.stance==='prone' && this.GateNear(`bundleCrawl${crawl.id}`) && this.player.position.y<this.battlefield.GroundHeight(this.player.position.x,this.player.position.z)+.2)
      this.Record(`bundleCrawl${crawl.id}`,{x:this.player.position.x,z:this.player.position.z,stance:this.player.stance});
    const next=Sortie.route.findIndex((point,index)=>!this.Has(`bundleRoutePoint${index}`));
    if(next>=0 && this.GateNear(`bundleRoutePoint${next}`))this.Record(`bundleRoutePoint${next}`);
    if(Sortie.route.every((point,index)=>this.Has(`bundleRoutePoint${index}`)) &&
      Sortie.crawl.every(crawl=>this.Has(`bundleCrawl${crawl.id}`)))this.Record('bundleRouteTraversed');
    if(this.Near(Sortie.house,Sortie.supplierRangeM))this.Say('BundleSupply');
  }
  UpdateFrontAttack(){
    const roster=MISSION_ENCOUNTERS.machineGun;
    // Spawning is budgeted across frames. A partly spawned wave cannot resolve early.
    if(!roster.every(spec=>this.enemies.has(spec.id)))return;
    const actors=roster.map(spec=>this.enemies.get(spec.id));
    const losses=actors.filter(actor=>!actor.alive).length;
    for(const actor of actors){
      if(!actor.alive || actor.missionRepelled)continue;
      actor.missionPinnedTime=actor.suppression>=Sortie.retreatSuppression?(actor.missionPinnedTime||0)+this.delta:0;
      if(!actor.missionRepelRoute && (losses>=actors.length*Sortie.retreatCasualtyFraction || actor.missionPinnedTime>=Sortie.retreatSuppressionS)){
        const spec=roster.find(spec=>spec.id===actor.missionId);
        actor.missionRepelRoute=[...(actor.missionAssault?.points||[]).filter(point=>point.z<actor.position.z).reverse(),
          {x:spec.x,z:spec.z-Sortie.retreatDistanceM}];
      }
      if(!actor.missionRepelRoute)continue;
      while(actor.missionRepelRoute.length && Distance(actor.position,actor.missionRepelRoute[0])<Sortie.retreatArrivalM)actor.missionRepelRoute.shift();
      if(actor.missionRepelRoute.length){
        this.ai.SetStance(actor,0,.5,true);this.MoveActor(actor,actor.missionRepelRoute[0],R.assaultRushMps);
      }else{
        actor.missionRepelled=true;this.Defend(actor,actor.position,0,0);
      }
    }
    if(actors.every(actor=>!actor.alive||actor.missionRepelled))this.Record('frontAttackRepelled',{
      killed:losses,repelled:actors.filter(actor=>actor.alive&&actor.missionRepelled).length});
  }
  UpdateTank() {
    const tank = this.tank;
    if (!tank.active || !["Support","MachineGun","Tank","Orders"].includes(this.flow.stage.id)) {
      if(this.tankDust!=null){this.vfx.RemoveSmokeSource(this.tankDust);this.tankDust=null;}
      return;
    }
    // 05：战车压到沟口，把前沿的退路堵住（契约 §2 的 tankBlocksExit）。
    if(this.flow.stage.id==="MachineGun" && !tank.immobilized && tank.z>=R.tankStopZ-R.tankBlockRadiusM)
      this.Record("tankBlocksExit",{z:tank.z});
    const muzzle=this.view.TankMuzzle(tank);
    const candidates=[this.player,...this.squad,...(this.frontDefenders||[]),...this.guards.map(g=>g.actor)]
      .filter(actor=>(actor.Alive??actor.alive)&&Distance(actor.position,tank)<100);
    const visible=candidates.find(actor=>!this.BlocksSight(muzzle,actor===this.player?actor.EyePosition:actor.position.clone().add(new THREE.Vector3(0,1,0)),this.view.tankCollider));
    if(visible){
      const targetId=visible===this.player?"player":visible.missionId||visible.id;
      if(tank.targetId!==targetId){tank.targetAcquiredAt=this.time;tank.mgAim=null;}
      tank.lastSeen={x:visible.position.x,z:visible.position.z};tank.lastSeenAt=this.time;tank.targetId=targetId;
      const desired=visible===this.player?this.player.EyePosition.clone().add(new THREE.Vector3(0,-.2,0)):
        visible.position.clone().add(new THREE.Vector3(0,visible.stance===2?.3:.95,0));
      tank.mgAim ||= {x:desired.x,y:desired.y,z:desired.z};
      const blend=1-Math.exp(-this.delta/R.tankMgTrackingS);
      for(const axis of ["x","y","z"])tank.mgAim[axis]+=(desired[axis]-tank.mgAim[axis])*blend;
    }
    const tracked=tank.lastSeen && this.time-(tank.lastSeenAt||0)<R.tankTargetMemoryS?tank.lastSeen:null;
    tank.advanceTime = (tank.advanceTime || 0) + this.delta;
    const cycle = R.tankAdvanceSeconds + R.tankFiringHaltSeconds;
    const advanceZ=this.Has("forwardNestDestroyed")?R.tankStopZ:R.tankFirstFireZ;
    const sortie=this.flow.stage.id==='Tank';
    const pursuitZ=sortie?Clamp(this.player.position.z-Sortie.tankLeadM,Sortie.tankNorthZ,Sortie.tankSouthZ):advanceZ;
    tank.moving = !tank.immobilized && (sortie?Math.abs(tank.z-pursuitZ)>.3:tank.z<advanceZ) && tank.advanceTime % cycle < R.tankAdvanceSeconds;
    if (tank.moving){
      const destination=sortie?{x:Sortie.tankRoadX,z:pursuitZ}:
        {x:Clamp((tracked?.x??12)+24,R.tankPursuitBounds.minX,R.tankPursuitBounds.maxX),z:advanceZ};
      tank.moveYaw=Math.atan2(tank.x-destination.x,tank.z-destination.z);
      const distance=Distance(tank,destination),step=Math.min(1,this.delta*R.tankSpeedMps/(distance||1));
      tank.x+=(destination.x-tank.x)*step;tank.z+=(destination.z-tank.z)*step;
    }
    if(tank.moving){
      const point=this.Point({x:tank.x,z:tank.z-2},.2);
      if(this.tankDust==null)this.tankDust=this.vfx.SmokeSource(point,R.tankDust);
      else this.vfx.MoveSmokeSource(this.tankDust,point);
    }else if(this.tankDust!=null){this.vfx.RemoveSmokeSource(this.tankDust);this.tankDust=null;}
    if(this.flow.stage.id==="Support" && !this.Has("frontRifleDefense"))return;
    const targets = P.tankTargets;
    const target = !this.Has("forwardNestDestroyed")?A.forwardNest:tracked||targets[tank.shots % targets.length];
    const hullTarget=tank.moving?tank.moveYaw:Math.atan2(tank.x-target.x,tank.z-target.z);
    tank.hullYaw??=Math.PI;
    if(!tank.immobilized)tank.hullYaw+=Clamp(Math.atan2(Math.sin(hullTarget-tank.hullYaw),Math.cos(hullTarget-tank.hullYaw)),-this.delta*R.tankHullTurnRad,this.delta*R.tankHullTurnRad);
    const desiredYaw=Math.atan2(tank.x-target.x,tank.z-target.z);
    const yawGap=Math.atan2(Math.sin(desiredYaw-tank.turretYaw),Math.cos(desiredYaw-tank.turretYaw));
    tank.turretYaw+=Clamp(yawGap,-this.delta*R.tankTurretSpeedRad,this.delta*R.tankTurretSpeedRad);
    if ((!sortie || !tank.moving) && Distance(tank,target)>=R.tankCannonMinRangeM && this.time-tank.lastShell>R.tankShellIntervalS && Math.abs(yawGap)<.06) {
      tank.lastShell = this.time;
      tank.shots++;
      const from = this.view.TankMuzzle(tank);
      this.vfx.MuzzleFlash(from,this.Point(target).sub(from).normalize(),{scale:2,kind:"hmg"});
      const aim=this.Has("forwardNestDestroyed")?{x:target.x+Math.sin(tank.shots*2.399)*R.tankShellScatterM,z:target.z+Math.cos(tank.shots*1.79)*R.tankShellScatterM}:{x:target.x,z:target.z+R.tankNestAimOffsetZ};
      const impactTarget=this.Point(aim,this.Has("forwardNestDestroyed")?0:R.tankNestAimRiseM);
      this.combat.FireShell(from, impactTarget, {
        flight: Math.max(.06,from.distanceTo(impactTarget)/R.tankShellSpeedMps),
        kind: "Shell57",
        // 看得见的那门炮：炮口要响（见 SHELL 的抬头）。原来这一发从头到尾只有
        // 火光与落点，中间那一声炮口是空的。
        report: true,
        sourceCollider: this.view.tankCollider,
        radius: 5,
        damage: 85,
        OnImpact: (position) => {
          const crater=this.battlefield.deformation?.State().lastImpact;
          (tank.impacts ||= []).push({x:position.x,y:position.y,z:position.z,
            crater:!!crater&&crater.id==="Shell57"&&Math.hypot(crater.x-position.x,crater.z-position.z)<.01,
            revision:crater?.revision||0});
          if(tank.impacts.length>8)tank.impacts.shift();
          for (const actor of this.squad)if(Distance(actor.position,position)<12)this.ai.SetStance(actor,2,2,true);
          if (!this.Has("forwardNestDestroyed") && Distance(position,A.forwardNest)<6) {
            this.Record("forwardNestDestroyed");
            this.Say("TankTerror");
          }
        },
      });
    }
    if(!this.Has("forwardNestDestroyed"))return;
    const mgYaw=visible?Math.atan2(tank.x-visible.position.x,tank.z-visible.position.z):tank.hullYaw;
    const burst=tank.advanceTime%(R.tankMgBurstSeconds+R.tankMgRestSeconds)<R.tankMgBurstSeconds;
    // The sortie alternates moving MG sweeps with halted cannon fire. Slow
    // crawl passages need that respite; broken tracks still retain both weapons.
    const mgWindow=!sortie || tank.moving || tank.immobilized;
    if(mgWindow && visible && this.time-tank.targetAcquiredAt>=R.tankMgAcquireS && burst && Math.abs(Math.atan2(Math.sin(mgYaw-tank.hullYaw),Math.cos(mgYaw-tank.hullYaw)))<R.tankHullMgArcRad && this.time-tank.lastMg>R.tankMachineGunIntervalS){
      tank.lastMg=this.time;
      const from=this.view.TankMuzzle(tank,"mgMuzzle");
      const aim=new THREE.Vector3(tank.mgAim.x,tank.mgAim.y,tank.mgAim.z);
      const phase=tank.advanceTime%(R.tankMgBurstSeconds+R.tankMgRestSeconds)/R.tankMgBurstSeconds;
      const sweep=(1-Math.min(1,phase))*R.tankMgSweepM;
      aim.x+=Math.cos(tank.hullYaw)*sweep;aim.z-=Math.sin(tank.hullYaw)*sweep;
      const n=(tank.mgShots||0)+1,spread=R.tankMgSpreadM;
      aim.x+=Math.sin(n*2.399)*spread;aim.y+=Math.cos(n*1.79)*spread*.45;
      const direction=aim.sub(from).normalize();
      const elevation=Math.asin(direction.y);
      if(elevation>=-R.tankMgDownRad&&elevation<=R.tankMgUpRad){
        tank.mgShots=n;
        tank.lastMgShot=this.FireVehicleBullet(from,direction,{weaponId:"Type11",damageScale:R.tankMgDamageScale,sourceCollider:this.view.tankCollider});
      }
    }
  }

  BeginCarry() {
    const zhou = this.column.zhou;
    const ok = this.carry.Begin("stretcher", {
      label: this.Text("carry"),
      payload: { mission: "FirstLevel", who: "zhou" },
      canDrop: true,
      OnRelease: (info) => {
        if (!["instinct", "delivered"].includes(info.reason)) zhou.state = "waiting";
      },
    });
    if (ok) {
      zhou.state = "carried";
      this.Record(this.flow.stage.id === "WallPath" ? "carryHandover" : "zhouCarried");
    }
    return ok;
  }
  /** 抬着走的时候担架往哪儿去：按步骤查表，不在代码里挑分支。 */
  CarryGoal() {
    return CARRY_GOALS[this.flow.stage.id] ? A[CARRY_GOALS[this.flow.stage.id]] : A.ditch;
  }
  UpdateCarry() {
    const zhou = this.column.zhou;
    if (this.carry.KindId !== "stretcher" || zhou.state !== "carried") return;
    const goal = this.CarryGoal();
    const yaw = Math.atan2(this.player.position.x - goal.x, this.player.position.z - goal.z);
    zhou.x = this.player.position.x - Math.sin(yaw) * 1.6;
    zhou.z = this.player.position.z - Math.cos(yaw) * 1.6;
    zhou.yaw = yaw;
    if (this.flow.stage.id === "Carry" && this.GateNear("atDitchMouth")) this.Record("atDitchMouth");
  }
  // ---------------------------------------------------------------------------
  // 12/13 老周那辆牛/马车（内部步骤 CartRide → AirFirst）。
  // 实装在 Script_FirstLevelTransferCart：车是 column.vehicles 里真的那一辆，
  // 老周被装在车上、顺子坐在车板上（座位偏移读 MISSION_PLACEMENT.cartRide），
  // 车沿 MISSION_STAGE_ROUTES.cartRide 真走，13 在 cartHalt 停住并还权。
  // ---------------------------------------------------------------------------
  BeginCartRide() {
    if (!this.transferCart.Board()) return false;
    this.BeginControl("cartRide", R.cartRideMaxS);
    return true;
  }
  UpdateCart(dt) {
    this.transferCart.UpdateRide(dt);
  }
  // ---------------------------------------------------------------------------
  // 15C–17 接收院常驻的那四个人（院门守军两名、接收人员、军医）。
  // 直接跳进 16/17 时 15C 的 Enter 没跑过，这里补齐 —— 演出不能靠「上一步一定走过」。
  // ---------------------------------------------------------------------------
  EnsureYardCast() {
    const yard = P.receptionYard;
    this.extras.Spawn("GateGuardNorth", yard.gateGuard[0], { weapon: "HanYang", squadId: "MissionYardGate" });
    this.extras.Spawn("GateGuardSouth", yard.gateGuard[1], { weapon: "HanYang", squadId: "MissionYardGate" });
    this.extras.Spawn("YardReceiver", yard.receiver, { weapon: null, unarmed: true, squadId: "MissionYardReceiver" });
    this.extras.Spawn("WardSurgeon", yard.surgeon, { weapon: null, unarmed: true, squadId: "MissionWardSurgeon" });
  }
  // ---------------------------------------------------------------------------
  // 18 夜行军（NightMarch）。黑屏字幕里瞬移到 nightSpawn 并换夜间天空。
  // ---------------------------------------------------------------------------
  BeginNightTransition() {
    const night = R.nightTransition;
    this.BeginControl("nightTransition", night.fadeOutS + night.holdS + night.fadeInS);
    this.transition.Show({
      title: T("firstLevel.transition.night.title"),
      text: T("firstLevel.transition.night.text"),
      ...night,
    });
    this.transition.Update(0);
  }
  PlaceNightArrival() {
    const point = A.nightSpawn;
    // 写 position + 角色体 Teleport 就够，外加一次自由空间搜索（免得锚点哪天被布设盖住）。
    //
    // **别改成 player.Spawn。** 它顺手把血量、流血、伤口、体力、持枪状态全复位 ——
    // 夜里进城会变成一次静默的满血补给。2026-09-19 那一版因为「实拍人没被搬过去」
    // 改用了 Spawn；2026-09-20 的取证（NIGHT_ARRIVAL：同时读 player.position 与
    // player.body.position）证明瞬移一直是好的，人是被**驾驶脚本**按着前进键原路
    // 走回 marchOut 的（修法在 Script_FirstLevelCampaignKit 的 Route stopFact）。
    const free = this.physics?.FindFreeSpot
      ? this.physics.FindFreeSpot(point.x, point.z, this.player.radius, 1.78)
      : { x: point.x, y: this.battlefield.GroundHeight(point.x, point.z), z: point.z };
    this.player.position.set(free.x, free.y, free.z);
    this.player.body?.Teleport(free.x, free.y, free.z);
    this.player.velocity.set(0, 0, 0);
    this.player.SetStance("stand");
    this.player.yaw = Math.PI;
    this.player.pitch = 0;
    for (const [i, actor] of this.squad.entries()) {
      this.PlaceActor(actor, { x: point.x + (i % 2 ? 2 : -2), z: point.z - 4 - Math.floor(i / 2) * 2 });
      this.squadRoutes.set(actor.id, []);
      this.Defend(actor, actor.position);
    }
    // 夜景与夜天空都藏在黑屏里换；退出/重试时宿主还原（RestoreLevelSky）。
    this.ApplySky?.("night");
    this.column.active = false;
    if (this.controls) { this.controls.yaw = this.player.yaw; this.controls.pitch = 0; }
    this.Record("nightArrivalPlaced", { x: point.x, z: point.z });
    this.player.SyncCamera(0);
  }
  // ---------------------------------------------------------------------------
  // 09 连屋近战（内部步骤 Melee）。2026.09.19 起下线屋内伏击拍：日军从与东巷相通的
  // 连屋进来，玩家先手打掉就不触发僵持；真贴上来才走共用白刃（Script_MeleeCombat）。
  // 旧拍表与它那七百行副作用见 docs/Data_FirstLevelRoomAmbush.md（已作废）。
  // ---------------------------------------------------------------------------
  get Ambushers() {
    return MISSION_ENCOUNTERS.melee.map(spec => this.enemies.get(spec.id)).filter(Boolean);
  }
  InRoom(point) {
    const room = P.roomInterior;
    return point.x > room.minX && point.x < room.maxX && point.z > room.minZ && point.z < room.maxZ;
  }
  /**
   * 连屋那一组：进 Melee 步就从连屋出来，沿 MISSION_TACTICS 的折线压到灶屋门口。
   * 全员阵亡＝ meleeResolved；有人真的贴到白刃距离就记 meleeEngaged（取证，不是闸）。
   */
  UpdateMelee() {
    const living = this.Ambushers.filter(actor => actor.alive);
    for (const actor of living) actor.bayonetFixed = true;
    if (living.some(actor => Distance(actor.position, this.player.position) <= R.ambushBindReachM + .4))
      this.Record("meleeEngaged");
    if (this.Ambushers.length === MISSION_ENCOUNTERS.melee.length && !living.length)
      this.Record("meleeResolved", { killed: this.Ambushers.length });
  }
  /**
   * 这一帧的感知（眼皮 + 恍惚）。装配层只问这一个口。
   * 2026.09.19 起整关只有掩蔽部那一处重击，曲线在 FirstLevelOpening 里采样。
   */
  Perception() {
    return { eyeClosure: this.opening.eyeClosure || 0, concussion: this.opening.concussion || null };
  }
  /**
   * 控制锁算视线用的眼位。被枪托砸翻躺在地上的时候（旧的屋内伏击）真正的眼位在地板上方
   * MELEE_RULES.groundEyeM —— 照站姿眼位算出来的俯仰角会把镜头压到脚底下去。
   */
  ControlEye() {
    const drop = this.player.meleeCameraDrop || 0;
    const eye = this.player.EyePosition;
    if (drop <= 0.01) return eye;
    const height = this.player.eyeHeight ?? 1.6;
    return { x: eye.x, y: this.player.position.y + height - drop * (height - MELEE_RULES.groundEyeM), z: eye.z };
  }
  /**
   * 倒地时 Script_Player.UpdateCamera 会在 pitch 上额外加一份抬头（drop × groundCameraPitchRad）。
   * 控制锁写的是 player.pitch，所以要先把这一份减掉，最终镜头才真的指在 lookAt 上。
   */
  ControlPitchBias() {
    return (this.player.meleeCameraDrop || 0) * MELEE_RULES.groundCameraPitchRad;
  }
  BeginControl(kind, seconds, { lookAt = null, lookSeconds = 0 } = {}) {
    if (!CONTROL_KINDS.includes(kind)) throw new Error(`BeginControl: unknown kind ${kind}`);
    this.controls = {
      kind,
      seconds,
      time: 0,
      from: { ...this.player.position },
      yaw: this.player.yaw,
      pitch: this.player.pitch,
    };
    if(kind==="death") {
      const zhou=this.column.zhou;
      lookAt=this.Point({x:zhou.x-Math.sin(zhou.yaw)*.7,z:zhou.z-Math.cos(zhou.yaw)*.7},R.deathLookHeightM);
      lookSeconds=R.deathLookSeconds;
    }
    // 把视线甩到指定的点上（老周的担架 / 顶上来的那把刺刀）。lookSeconds 之内是
    // 平滑转头，之后交回 BeforePlayer 的 ±limitedLookRadians 夹取。
    if(lookAt) {
      const eye=this.ControlEye();
      this.controls.startYaw=this.player.yaw;this.controls.startPitch=this.player.pitch;
      this.controls.yaw=Math.atan2(eye.x-lookAt.x,eye.z-lookAt.z);
      this.controls.pitch=Math.atan2(lookAt.y-eye.y,Math.hypot(lookAt.x-eye.x,lookAt.z-eye.z));
      this.controls.lookSeconds=lookSeconds;
    }
    // A restricted short take (dive / death) locks the player's hands and view: nobody may
    // target or wound him meanwhile. Reuses spawn grace so AI and TakeHit read one flag.
    if(CONTROL_GRACE_KINDS.includes(kind))this.player.spawnGrace = Math.max(this.player.spawnGrace || 0, seconds + .5);
    this.Control?.(true, kind);
  }
  /**
   * 锁还在，只换看的地方（屋内伏击：连按结算完把视线从刺刀拉到担架上）。
   * 转头这一段从**当前**时刻起算，所以 lookSeconds 记的是绝对截止时刻，配 lookFrom 起点。
   */
  AimControl(kind, lookAt, lookSeconds) {
    const control = this.controls;
    if (!control || control.kind !== kind || !lookAt) return false;
    const eye = this.ControlEye();
    control.startYaw = this.player.yaw; control.startPitch = this.player.pitch;
    control.yaw = Math.atan2(eye.x - lookAt.x, eye.z - lookAt.z);
    control.pitch = Math.atan2(lookAt.y - eye.y, Math.hypot(lookAt.x - eye.x, lookAt.z - eye.z));
    control.lookFrom = control.time;
    control.lookSeconds = control.time + Math.max(0, lookSeconds);
    return true;
  }
  BeforePlayer(dt, input) {
    if(this.flow.stage.id==='Tank' && this.player.stance!=='prone'){
      const p=this.player.position,yaw=this.player.yaw;
      const next={x:p.x-Math.sin(yaw)*input.forward*.1+Math.cos(yaw)*input.strafe*.1,
        z:p.z-Math.cos(yaw)*input.forward*.1-Math.sin(yaw)*input.strafe*.1};
      if(SortieCrawlBlocked(p,next,this.player.stance)){
        input.forward=0;input.strafe=0;this.player.velocity.x=0;this.player.velocity.z=0;
      }
    }
    const control = this.controls;
    if (!control) return;
    if(control.kind==="trapped"||control.kind==="rescue")this.opening.PlacePlayer();
    input.forward = 0;
    input.strafe = 0;
    input.sprint = false;
    input.fire = false;
    input.ads = false;
    input.crouchPressed = false;
    input.pronePressed = false;
    input.stanceRequested = null;
    if(control.lookSeconds>0 && control.time<control.lookSeconds) {
      // lookFrom 是这一段转头的起点（BeginControl 给的那一次是 0；AimControl 中途改向时
      // 是改向那一刻）。对所有既有 kind 来说 lookFrom 恒为 0，行为逐字不变。
      const from=control.lookFrom||0;
      const t=Clamp((control.time-from)/Math.max(1e-6,control.lookSeconds-from),0,1),smooth=t*t*(3-2*t);
      const yaw=Math.atan2(Math.sin(control.yaw-control.startYaw),Math.cos(control.yaw-control.startYaw));
      this.player.yaw=control.startYaw+yaw*smooth;
      this.player.pitch=control.startPitch+(control.pitch-control.startPitch)*smooth-this.ControlPitchBias();
      return;
    }
    const yawDelta = Math.atan2(
      Math.sin(this.player.yaw - control.yaw),
      Math.cos(this.player.yaw - control.yaw),
    );
    // 倒地那一段镜头自带一份抬头，先减掉再夹取（站着的时候这一份恒为 0，行为逐字不变）。
    const pitchAim = control.pitch - this.ControlPitchBias();
    // 被压在木架下只能小幅转头（契约 §2 的受困段）。
    const limit = control.kind === "trapped" ? R.trappedLookRadians : R.limitedLookRadians;
    this.player.yaw = control.yaw + Clamp(yawDelta, -limit, limit);
    this.player.pitch = Clamp(this.player.pitch, pitchAim - limit, pitchAim + limit);
    if(control.kind==="rescue"){
      const poseSeconds=this.opening.RescueSampleTime();
      this.player.stance=poseSeconds<OPENING.rescuePullSeconds?"prone":poseSeconds<OPENING.rescueStandSeconds?"crouch":"stand";
    }
    if (control.kind === "dive") {
      const t = Clamp(control.time / control.seconds, 0, 1),
        smooth = t * t * (3 - 2 * t),
        to = { x: control.from.x - R.diveTravelM, z: control.from.z + 0.5 };
      const x = control.from.x + (to.x - control.from.x) * smooth,
        z = control.from.z + (to.z - control.from.z) * smooth;
      const y = this.battlefield.GroundHeight(x, z);
      this.player.position.set(x, y, z);
      this.player.body?.Teleport(x, y, z);
      this.player.stance = "prone";
    }
  }
  StartAir(pass, lead = 0) {
    this.StopAirSound();
    this.air = { pass, time: -lead, shots: 0, lastShot: -Infinity };
  }
  // Straight run north at airSpeedMps, anchored so the aircraft is over the old event positions at the event times.
  AirPose(air) {
    const first = air.pass === 1,
      anchorS = first ? R.bridgeBombAtS : R.zhouStrafeAtS,
      along = (air.time - anchorS) * R.airSpeedMps,
      pastM = Math.max(0, along - R.airPullUpAfterM);
    return {
      x: first ? 78 : 56,
      y: (first ? 30 : 21) + pastM * Math.tan(R.airPullUpRad),
      z: (first ? R.airFirstAnchorZ : R.airSecondAnchorZ) + along,
      dirX: 0, dirZ: 1,
      climb: R.airPullUpRad * Math.min(1, pastM / 20),
      anchorS,
    };
  }
  // Engine: a looping drone that follows the airframe with Doppler, plus the recorded dive pass near the anchor.
  UpdateAirSound(air, pose) {
    const sound = (this.airSound ||= { drone: null, dive: null });
    const at = { x: pose.x, y: pose.y, z: pose.z };
    if (!sound.drone) sound.drone = this.audio.Play("planeDrone", { position: new THREE.Vector3(at.x, at.y, at.z), volume: 0.9, priority: true }) || false;
    else this.audio.MoveVoice?.(sound.drone, at, { velocity: { x: 0, y: pose.climb * R.airSpeedMps, z: R.airSpeedMps } });
    if (sound.dive === null && air.time >= pose.anchorS - R.airDiveSoundLeadS)
      sound.dive = this.audio.Play("planeDive", { position: new THREE.Vector3(at.x, at.y, at.z), volume: 0.95 }) || false;
    else if (sound.dive) this.audio.MoveVoice?.(sound.dive, at);
  }
  StopAirSound() {
    if (this.airSound?.drone) this.audio.StopVoice?.(this.airSound.drone, 0.9);
    this.airSound = null;
  }
  UpdateAir(dt) {
    const air = this.air;
    if (!air) return;
    air.time += dt;
    const pass = air.pass,
      pose = this.AirPose(air),
      { x, y, z } = pose;
    this.aircraft.SetManualPose(MISSION_AIRCRAFT_ID, pose);
    this.UpdateAirSound(air, pose);
    const aimZ = z + R.airStrafeLeadM;
    if (aimZ >= R.airStrafeFromZ && aimZ <= R.airStrafeToZ && air.time - air.lastShot >= R.airShotIntervalS) {
      air.lastShot = air.time;
      air.shots++;
      const target = { x: x + ((air.shots % 3) - 1) * 2, z: aimZ };
      const from = new THREE.Vector3(x, y, z),
        to = this.Point(target);
      this.vfx.Tracer(from, to, { kind: "ija" });
      this.audio.Play("type92", { position: from, volume: 0.7 });
      if (air.shots % 4 === 0)
        this.combat.FireShell(from, to, { flight: 0.18, kind: "AircraftStrafe", radius: 2, damage: 45 });
      if (Distance(this.player.position, target) < 3 && this.player.stance !== "prone")
        this.player.TakeHit(8, "torso", null, { from, projectile: true });
    }
    if (pass === 1 && air.time > R.bridgeBombAtS && !this.bridgeBombLaunched) {
      this.bridgeBombLaunched = true;
      this.combat.FireShell(new THREE.Vector3(78, 26, 145), this.Point({ x: 76, z: 153 }), {
        flight: 0.5,
        kind: "Shell75",
        radius: 6,
        damage: 120,
        OnImpact: () => {
          this.Record("transferBombed");
          this.Record("MissionBridgeDestroyed");
          this.battlefield.OpenGate("TemporaryBridge");
          this.battlefield.CloseGate("MissionBridgeWreck");
        },
      });
    }
    if (pass === 1 && air.time > R.cartBombAtS && !this.cartBombLaunched) {
      this.cartBombLaunched = true;
      const cart = this.column.vehicles.find((cart) => !cart.departed);
      if (cart)
        this.combat.FireShell(new THREE.Vector3(x, y, z), this.Point(cart, 0.8), {
          flight: 0.35,
          kind: "Shell75",
          radius: 5,
          damage: 55,
          OnImpact: () => {
            this.column.AirDamage();
            this.Record("loadedCartBombed");
          },
        });
    }
    if (pass === 2 && air.time > R.zhouStrafeAtS && !this.zhouStrafeLaunched) {
      this.zhouStrafeLaunched = true;
      this.combat.FireShell(new THREE.Vector3(x, y, z), this.Point(this.column.zhou, 0.3), {
        flight: 0.12,
        kind: "AircraftStrafe",
        radius: 1,
        damage: 40,
        OnImpact: () => {
          this.column.zhou.health = 18;
          this.Record("zhouStrafed");
        },
      });
    }
    if (air.time > R.airPassSeconds) {
      this.aircraft.SetManualPose(MISSION_AIRCRAFT_ID, null);
      this.StopAirSound();
      this.air = null;
      if (pass === 1) this.Record("firstAirPassComplete");
      else this.Record("secondAirPassComplete");
    }
  }
  ClearReturnWarning() {
    this.missionReturn.Reset();
    this.hud.SetMissionReturn?.(null);
  }
  UpdateReturnWarning(dt) {
    const stage=this.flow.stage,guide=this.CurrentGuide();
    const disabled=this.failed || this.completed || this.controls || !this.player.alive
      || MISSION_RETURN_DISABLED_STAGES.includes(stage.id);
    const squad=MISSION_RETURN_SQUAD_STAGES.includes(stage.id)?this.companion.Handle("luo"):null;
    const route=MISSION_RETURN_ROUTES[stage.id];
    return this.missionReturn.Update(dt,disabled?null:{stage:stage.id,
      position:this.player.position,yaw:this.player.yaw,bounds:this.battlefield.bounds,
      route, target:guide?.target||stage.target,
      person:MISSION_RETURN_PERSON_STAGES.includes(stage.id)?this.column.zhou:null,
      squad:squad?.alive===false?null:squad?.position,
      label:guide?.label||Localize(FirstLevelStageTextId(stage.id),stage.objective)});
  }
  CurrentGuide() {
    const stage=this.flow.stage, spec=MISSION_GUIDANCE[stage.id];
    if(!spec || this.failed || this.controls || this.completed)return null;
    let target=stage.target, label=spec.label;
    if(spec.route)target=MissionRouteLookahead(MISSION_ROUTES[spec.route],this.player.position);
    if(stage.id==="Tank"){
      const returning=this.Has("bundleTaken")&&this.Inventory().bundles>0;
      const route=returning?MISSION_ROUTES.bundleReturn:MISSION_ROUTES.bundle;
      target=returning?MissionRouteLookahead(route,this.player.position):
        Sortie.route.find((point,index)=>!this.Has("bundleRoutePoint"+index))||A.bundle;label=returning?"throw":"bundle";
      if(!returning && this.Near(A.bundle,8))target=A.bundle;
    }
    if(stage.id==="Courtyard" && this.Has("courtyardGateOpen") && this.Threatens(A.gate)) {target={x:A.gate.x,z:A.gate.z+4};label="gateThreat";}
    if(["Carry","WallPath","Handover"].includes(stage.id)) {
      if(this.carry.Active) {target=this.CarryGoal();label=CARRY_GOAL_LABELS[stage.id];}
      else {const z=this.column.zhou;target={x:z.x+Math.sin(z.yaw)*1.6,z:z.z+Math.cos(z.yaw)*1.6};label="carry";}
    }
    let status=null;
    if(stage.id==="MachineGun"&&this.emplacement.Mounted)status=T("firstLevel.hint.guards",{safe:this.guards.filter(g=>g.safe).length,remaining:this.guards.filter(g=>g.actor.alive&&!g.safe).length});
    if(["Courtyard","TransferApproach","Transfer"].includes(stage.id))status=T("firstLevel.hint.queue",{passed:this.column.litters.filter(l=>l.passedGate).length,total:this.column.litters.filter(l=>l.health>0||l.passedGate).length,loaded:this.column.loadEvents.length});
    if(stage.id==="Transfer" && this.transferBeats?.cleared.length && this.transferBeats.started.length===this.transferBeats.cleared.length) {
      target=this.column.QueueAhead()===0?this.column.zhou:this.column.vehicles.find(cart=>!cart.departed)||A.queue;
      label="loading";
      status=T("firstLevel.hint.transferWindow",{loaded:this.column.loadEvents.length,departed:this.column.departed});
    }
    return {target,label:T(`firstLevel.guide.${label}`),status};
  }
  Update(dt) {
    // 阶段跳转/检查点可直接补齐 rifleRecovered，不经过 MissionRifle.OnComplete。
    if (this.Has("rifleRecovered")) this.RemoveBunkerRifle();
    if (this.completed || this.failed) return;
    this.delta = dt;
    this.time += dt;
    // 剖析标记（`story/mission/*` 子桶）。装配层没给 profiler 就静默不记 ——
    // 测试夹具直接 new 这个类时不必补一个假的。关着时整条按 null 走，
    // 下面十来处 `prof?.B` 一次判断全短路。
    const prof = this.profiler?.on ? this.profiler : null;
    prof?.B("story/mission/voice");
    this.voice.Update(dt);
    this.UpdateMusic();
    this.battleSound.Update(dt,this.flow.stage.id,this.voice.current?.phase==="playing");
    prof?.E("story/mission/voice");
    prof?.B("story/mission/other");
    this.opening.Update(dt);
    if(this.failed){prof?.E("story/mission/other");return;}
    prof?.E("story/mission/other");
    prof?.B("story/mission/spawns");
    this.DrainSpawns();
    prof?.E("story/mission/spawns");
    prof?.B("story/mission/director");
    if(["Support","MachineGun","Tank"].includes(this.flow.stage.id)) {
      const alive=[...this.enemies.values()].filter(actor=>actor.alive && ["front","machineGun","approach","tank"].includes(actor.missionEncounter)).length;
      this.frontPeakAlive=Math.max(this.frontPeakAlive||0,alive);
    }
    this.UpdateSquad();
    this.UpdateFront();
    this.UpdateTactics(dt);
    this.UpdateAssault(dt);
    this.UpdateWaves();
    this.UpdateRelief(dt);
    this.UpdateTank();
    this.UpdateFlank();
    this.UpdateAir(dt);
    this.UpdateCarry();
    this.UpdateCart(dt);
    // 15–18 的布景每帧重报一次（没报的人这一帧自动藏起来）。
    this.dressing.Begin();
    const stage = this.flow.stage.id,
      t = this.flow.stageTime;
    if(["Support","MachineGun","Tank","Orders"].includes(stage))this.UpdateGuards(dt);
    this.UpdateFrontDialogue();
    // 阶段 1–7 的演出（Front 包）。放在 UpdateSquad 之后：剧情走位要压过接触反应。
    this.frontShow?.Update(dt);
    prof?.E("story/mission/director");
    prof?.B("story/mission/other");
    if (this.controls) {
      if(this.controls.kind==="nightTransition"){
        this.transition.Update(this.controls.time);
        if(this.controls.time>=R.nightTransition.fadeOutS && !this.Has("nightArrivalPlaced"))this.PlaceNightArrival();
      }
      this.controls.time = this.controls.kind==="rescue"?this.opening.RescueElapsed():this.controls.time+dt;
      if (this.controls.time >= this.controls.seconds && this.controls.kind!=="trapped" &&
        (this.controls.kind!=="death" || this.voice.finished.has("ZhouDeath"))) {
        const kind = this.controls.kind;
        this.controls = null;
        this.Control?.(false, kind);
        // 未知 kind 在 BeginControl 就抛错了；这里逐条按 kind 收尾，没有兜底分支。
        if(kind==="rescue"){
          const luo=this.companion.Handle("luo");if(luo){luo.missionRescueTarget=null;luo.missionCarriageAction=null;}
          this.player.stance="stand";this.Record("luoRescueComplete");
        }
        else if(kind==="trapped"){ /* 受困段由 FirstLevelOpening 记事实并换步。 */ }
        else if(kind==="cartRide"){ /* 停车由 UpdateCart 收尾。 */ }
        else if(kind==="nightTransition"){
          this.transition.Hide();this.Record("nightTransitionComplete");
        }
        else if (kind === "dive") this.Record("diveComplete");
        else if (kind === "death") {
          // 确认完了，但 17 还没走完：接收处要真的继续工作（门外那一副担架、
          // 军医转过去救下一个、幺娃拉正覆盖物）才记 deathSceneComplete。
          this.column.zhou.health = 0;
          this.reception.OnDeathSceneEnd();
          this.RestoreRifle();
        }
        else throw new Error(`Unhandled mission control kind ${kind}`);
      }
    }
    if (stage === "RearTrench") {
      if (this.GateNear("rearTrenchEntered")) this.Record("rearTrenchEntered");
      if (this.GateNear("cornerReached")) { this.Record("cornerReached"); this.Say("CornerCheck"); }
      if (this.GateNear("collectionPointSeen")) this.Record("collectionPointSeen");
      // 撤回的守军指路：走到集结处就起这一段（对白播完记 supportOrdersHeard）。
      if (this.Has("collectionPointSeen")) this.Say("SupportOrder");
    }
    if (stage === "Support" && this.GateNear("frontReached")) {
      this.Record("frontReached");
      this.frontArrivalAt ??= this.time;
      this.frontArrivalShots ??= this.Inventory().shots;
      if(this.time-this.frontArrivalAt>=R.frontRifleDefenseSeconds &&
        FirstLevelRifleContribution(this.Inventory().shots,this.frontArrivalShots))this.Record("frontRifleDefense");
      this.SpawnEncounter("front");
      this.tank.active = true;
      if ([...this.enemies.values()].some((actor) => actor.lastFire > 0) || this.Inventory().shots > 0)
        this.Record("frontContact");
    }
    if (stage === "MachineGun") {
      if (this.emplacement.stats.shots > 0) this.Record("gunUsed");
      // 守军指出北头弹药屋（对白播完记 bundleOrderHeard）。
      if (this.Has("frontAttackRepelled")) this.Say("BundleOrder");
      // 机枪弹药倒计时那两条（ThreeMagazines / TwoMagazines）随采用稿下线；
      // 余弹仍然由 HUD 与 GuideGunSupply 交代。
    }
    if(stage==="Orders"){
      // 2026-09-20 演出打磨：借火与担架员催的两段不再随 ordersReached 一起排进队 ——
      // Notion 06 是老周「看见顺子经过」才开口，触发与担架员的走位在
      // Script_FirstLevelCollection.UpdateOrders 里（玩家走到他跟前、脸朝着他）。
      if(this.GateNear("ordersReached")){this.Record("ordersReached");this.Say("Volunteer");}
      // 后送队真实起行：担架队离开集结处，队首走出 litterSpacingM 以上。
      if(this.Has("zhouOnLitter")&&this.column.litters.some(litter=>litter.progress>=R.litterSpacingM))
        this.Record("columnDeparted",{lead:Math.max(...this.column.litters.map(litter=>litter.progress))});
    }
    if(stage==="South"){
      this.Say("SouthWhisper");
      if(this.GateNear("villageMouthReached")){this.Record("villageMouthReached");this.Say("VillagePointer");}
    }
    if(stage==="Tank")this.UpdateSortie();
    if(stage==="MachineGun")this.UpdateFrontAttack();
    if (stage === "Village") {
      if(this.GateNear("streetBlockSeen")){this.Record("streetBlockSeen");this.Say("StreetBlocked");}
      const p=this.player.position, kitchen=P.kitchenInterior;
      if(p.x>kitchen.minX&&p.x<kitchen.maxX&&p.z>kitchen.minZ&&p.z<kitchen.maxZ)
        this.Record("kitchenEntered",{x:p.x,z:p.z});
    }
    // 08–10 的演出（担架真的停进遮挡、班长查看相邻房屋、连屋来敌、开院门放行）。
    this.village.Update(dt);
    if (stage === "Melee") this.UpdateMelee();
    // --- 18 铁路桥：接令、掩护尾队、撤出爆破区（演出与判定在 FirstLevelBridge）---
    if (stage === "BridgeCover" && this.GateNear("southBankReached")) this.Record("southBankReached");
    if (stage === "BridgeWithdraw" && this.GateNear("blastZoneCleared")) this.Record("blastZoneCleared");
    if (["BridgeOrders", "BridgeCover", "BridgeWithdraw"].includes(stage)) this.bridge.Update(dt, stage);
    // --- 18 夜入滕城：先随队走完 marchOut，黑屏里换天，再随队进北门 ---
    this.nightGate.Update(dt, stage);
    if (stage === "NightMarch" && this.Has("nightTransitionComplete")) {
      if(this.GateNear("northGateReached"))this.Record("northGateReached");
      if(this.Has("northGateReached")&&this.GateNear("gateEntered"))this.Record("gateEntered");
    }
    // 07 起后送队真的跟着走（旧的南行黑屏转场下线了，队伍要自己走完这一段）。
    let moving = [
        "South",
        "Village",
        "Melee",
        "Courtyard",
        "TransferApproach",
        "Transfer",
        "Regroup",
        "WallPath",
        "ReceptionGate",
      ].includes(stage) || (stage === "Orders" && this.Has("zhouOnLitter")),
      safe = true,
      maxProgress = Infinity;
    let safeAt = null;
    // 08/09：担架停在可靠遮挡里，不跟进未清空间。
    if (stage === "Village" || stage === "Melee")
      maxProgress = MissionRouteProjection(this.column.route, A.litterHold).progress;
    if (stage === "Courtyard") {
      const gun = this.enemies.get("VillageGunner");
      if (gun && !gun.alive) this.Record("villageGunSilent");
      safeAt = point => Distance(point,A.gate) > R.passageRangeM || (this.Has("villageGunSilent") && !this.Threatens(point));
      if (this.Has("courtyardGateOpen") && this.Has("villageGunSilent")) this.Say("CourtyardOpen");
      // 「后头还有两副」「过了」按真实队列计数喊；通过条件另加「队尾掩护脱离」。
      const pending=VillagePendingLitters(this.column);
      if(pending.length===2)this.Say("TwoLitters");
      if(VillageCourtyardCleared(this.column,this.Has("rearCoverDisengaged"))){
        this.Say("LastLitter");
        this.Record("courtyardPassed",{passed:this.column.litters.filter(litter=>litter.passedGate).length,
          casualties:this.column.litters.filter(litter=>litter.health<=0&&!litter.passedGate).length});
      }
    }
    if (stage === "TransferApproach" && this.GateNear("transferApproachReached")) this.Record("transferApproachReached");
    if (stage === "Transfer") {
      this.UpdateTransferThreats();
      if (this.GateNear("transferArrived")) {
        this.Record("transferArrived");
        this.column.loading = true;
        this.guideRoute = null;
      }
      const transferIds=MISSION_TRANSFER_THREATS.flatMap(threat=>MISSION_ENCOUNTERS[threat.id].map(spec=>spec.id));
      safe = !this.Threatens(A.transfer,transferIds);
      safeAt=point=>!this.Threatens(point,transferIds);
      // 每装完一批喊一次「这批过了，下一批」；侧巷那一处露头时喊「右边有人」。
      // 原来那三条按队列人数倒数的（TransferQueue / TransferTwo / TransferOne）
      // 随采用稿下线 —— 12 现在只有两处威胁，不是四拍守波次。
      if (this.Has("firstBatchLoaded")) this.Say("TransferBatch");
      if (this.Has("transferAlleyAttackStarted")) this.Say("TransferRight");
    }
    // 11–14 的演出（四类人流分流、装载额度随威胁放开、上车与停车、卸回担架）。
    this.transferCart.Update(dt);
    if (stage === "Rescue") {
      safe = !this.Threatens(A.ditch);
      const zhou = this.column.zhou;
      const rescuers = ["yaowa", "liuwencai"].map((id) => this.companion.Handle(id));
      for(const [index,actor] of rescuers.entries()) {
        if(actor)actor.scriptedNoncombatant=true;
        const side=index===0?-1:1;
        const target={x:zhou.x+Math.cos(zhou.yaw)*side*R.rescuerLateralM,
          z:zhou.z-Math.sin(zhou.yaw)*side*R.rescuerLateralM};
        const arrived=actor?.alive&&Distance(actor.position,target)<R.rescuerArrivalM;
        if(arrived){this.MoveActor(actor,actor.position,0);this.ai.SetStance(actor,1,.5,true);actor.yaw=Math.atan2(actor.position.x-zhou.x,actor.position.z-zhou.z);}
        else {this.MoveActor(actor,target,R.rescuerApproachMps);this.ai.SetStance(actor,0,.5,true);}
        if(actor)actor.missionRescueReady=arrived;
      }
      if (
        this.Has("zhouStrafed") &&
        safe &&
        rescuers.every((actor) => actor?.alive && actor.missionRescueReady && Distance(actor.position, zhou) < R.rescueReachM)
      )
        this.rescueTime += dt;
      if (this.rescueTime >= R.rescueSeconds) {
        for(const actor of rescuers)if(actor)actor.scriptedNoncombatant=false;
        zhou.state = "waiting";
        zhou.bearers = [75, 75];
        for (const litter of this.column.litters)
          if (!litter.zhou && litter.state === "fallen") litter.state = "waiting";
        this.Record("zhouRecovered");
        this.Record("rescuePassageClear");
      }
    }
    // 15A 收拢：无战斗。空袭后的追兵由警戒兵在车路方向接住，沟壁折角切断射线。
    if (stage === "Regroup") {
      safe = !this.Threatens(A.retreatA);
      safeAt = point => !this.Threatens(point);
      for (const [id, actor] of this.enemies)
        if (actor.alive && id.startsWith("Air")) {
          const end = MISSION_PURSUIT_ROUTE.findIndex(point => point.x === A.retreatA.x && point.z === A.retreatA.z);
          let index = Math.min(actor.missionPursuitIndex ?? MissionRouteNextIndex(MISSION_PURSUIT_ROUTE, actor.position), Math.max(0, end - 1));
          if (Distance(actor.position, MISSION_PURSUIT_ROUTE[index]) < R.tacticalArrivalM && index < end - 1) index++;
          actor.missionPursuitIndex = index;
          this.Defend(actor, MISSION_PURSUIT_ROUTE[index]);
        }
      this.Say("PicketHold");
    }
    // 15B 院墙夹道：无敌人，留一段无对白行走。
    if (stage === "WallPath" && this.GateNear("wallPathTraversed")) this.Record("wallPathTraversed");
    // 15C 院门：守军确认身份 → 接收人员安置 → 伤员实际入院（担架队先压在门外）。
    if (stage === "ReceptionGate") maxProgress = Math.min(maxProgress, this.reception.GateLimit());
    // 16 过门槛：「脚……慢点」是老周最后一句话。
    if (stage === "Handover" && this.GateNear("thresholdCrossed")) {
      this.Record("thresholdCrossed");
      this.Say("Threshold");
    }
    // 15A/15B 与 15C/16/17 的演出与判定（新模块，运行时只留这两句钩子）。
    // 15B 的夹道在 (16,220) 切到 15C，但真实路线还要再走到 (2,240) 的院门。
    // 静默观察窗口跨过这个内部步骤边界，直到门卫盘问起头为止。
    if (["Regroup", "WallPath", "ReceptionGate"].includes(stage)) this.quietMarch.Update(dt, stage);
    if (["ReceptionGate", "Handover", "Death", "BridgeOrders"].includes(stage)) this.reception.Update(dt, stage);
    this.column.Update(dt, { moving, routeSafe: safe, maxProgress, player: this.player.position, ...(safeAt ? {SafeAt:safeAt} : {}) });
    this.view.Update(this.time, { tank: this.tank,player:this.player,camera:this.camera||null });
    // 集结处的伤员与搬运人员走 view 的立即模式人群：view.Update 里 people.End()
    // 会把这一帧没提交的人藏起来，所以补提交只能放在它后面。
    this.frontShow?.Draw(this.time);
    this.flow.Update(dt);
    this.leaderGuide?.Update();
    this.hud.SetMissionReturn?.(this.UpdateReturnWarning(dt));
    prof?.E("story/mission/other");
  }
  SaveCheckpoint() {
    const targetHeight=Number.isFinite(this.player.eyeHeight)?this.player.eyeHeight:1.1;
    // Passage checks intentionally use their local 36 m corridor. A checkpoint
    // must cover the full range from which production AI can actually acquire
    // this stance (120 / 80 / 45 m before any global sight multiplier), or an
    // exposed near-fatal player can overwrite safety while a rifleman fires
    // from beyond the passage radius.
    const threatRange=FirstLevelCheckpointThreatRange(this.player,this.ai);
    if(!FirstLevelCheckpointIsSafe(this.player,
      this.Threatens(this.player.position,null,targetHeight,threatRange)))return false;
    this.safePoint = {
      x: this.player.position.x,
      z: this.player.position.z,
      yaw: this.player.yaw,
      stance: this.player.stance,
      health:this.player.health,
      bandages:this.player.bandages,
    };
    return true;
  }
  OnPlayerDown() {
    this.ClearReturnWarning();
    this.failed = true;
    this.hud.SetMissionGuide?.(null);
    this.voice.CancelGuidance?.();
    this.retryPoint =
      this.carry.Active || this.controls
        ? {
            x: this.player.position.x,
            z: this.player.position.z,
            yaw: this.player.yaw,
            stance: this.player.stance,
            health:this.player.health,
            bandages:this.player.bandages,
          }
        : this.safePoint;
    this.carry.ForceRelease("playerDown");
    this.emplacement.Vacate("playerDown");
    this.meleeCombat.Cancel("playerDown");
    this.voice.Pause();
    this.UpdateMusic();
  }
  Retry() {
    const point = this.retryPoint || this.safePoint;
    if (!point) return false;
    const z = point.z;
    this.player.Spawn(point.x, z, point.yaw);
    // Spawn's generic search treats an exact structural-floor contact as overlap.
    // Reuse the observed checkpoint only when its full capsule still fits.
    const savedPosition = this.Point({ x: point.x, z }, 0.025);
    if (!this.physics.Overlaps(savedPosition.x, savedPosition.y, savedPosition.z, this.player.radius, 1.78)) {
      this.player.position.copy(savedPosition);
      this.player.body?.Teleport(savedPosition.x, savedPosition.y, savedPosition.z);
    }
    this.player.stance = point.stance || "stand";
    Object.assign(this.player,FirstLevelCheckpointVitals(point,this.player));
    this.failed = false;
    this.controls = null;
    this.Control?.(false);
    this.RestoreRifle();
    // 重试落在受控演出里的那几步：重放那一段，其余照常恢复对白。
    const stage = this.flow.stage.id;
    if (stage === "Dive") {
      this.BeginControl("dive", R.diveSeconds);
      this.voice.Replay("AircraftReturn");
    } else if (stage === "Death" && !this.reception.death?.confirmed) {
      this.BeginControl("death", R.deathSeconds);
      this.voice.Replay("ZhouDeath");
    } else if (stage === "Trapped") {
      this.opening.ResetBunker();
      this.voice.Resume();
    } else if (stage === "NightMarch") {
      // 夜景与夜天空都跟着 nightArrivalPlaced 走：清掉它，空间与天光自己退回白天，
      // 灯也一盏不留，然后把黑屏转场重演一遍（marchOutReached 已经记下，不重走那一段）。
      this.flow.facts.delete("nightArrivalPlaced");
      this.nightLights?.Sync([]);
      this.RestoreSky?.();
      this.BeginNightTransition();
      this.voice.Resume();
    } else this.voice.Resume();
    this.UpdateMusic();
    return true;
  }
  ContinueCheckpoint() {
    if (this.completed || !this.safePoint) return false;
    this.OnPlayerDown();
    // Explicit checkpoint recovery never selects a carry/control death position.
    this.retryPoint = this.safePoint;
    return this.Retry();
  }
  UpdateMusic(stage = this.flow.stage.id) {
    if (this.musicInitializing) return;
    this.music.Update(stage, { shellImpact: this.Has("bunkerCollapsed"),
      speaking: this.voice.current?.phase === "playing", failed: this.failed });
  }
  ObjectiveProgress() {
    const progress = this.flow.ObjectiveProgress();
    progress.conditions = progress.conditions.map(condition => {
      const row = { ...condition, text: T(`menu.condition.${condition.id}`) };
      if (condition.id === "minimumSeconds") row.detail = T("menu.progress.seconds", condition);
      if (condition.id === "frontRifleDefense") {
        row.text = T("menu.condition.frontRifleDefense", { seconds: R.frontRifleDefenseSeconds });
        row.detail = T("menu.progress.rifle", {
          current: Math.min(R.frontRifleDefenseSeconds, Math.floor(Math.max(0, this.time - (this.frontArrivalAt ?? this.time)))),
          target: R.frontRifleDefenseSeconds,
          fired: T(this.Inventory().shots > (this.frontArrivalShots ?? this.Inventory().shots) ? "menu.progress.fired" : "menu.progress.notFired"),
        });
      }
      if (condition.id === "rifleWithdrawalResolved" || condition.id === "guardWithdrawalResolved") {
        const guards = condition.id === "rifleWithdrawalResolved" ? this.guards.slice(0, OPENING.rifleGuardCount) : this.guards;
        row.detail = T("menu.progress.guards", {
          safe: guards.filter(guard => guard.safe && guard.actor.alive).length,
          lost: guards.filter(guard => !guard.actor.alive).length,
          target: condition.id === "rifleWithdrawalResolved" ? OPENING.rifleGuardCount : guards.length,
        });
      }
      return row;
    });
    return progress;
  }
  State() {
    return {
      opening:this.opening.State(),
      front:this.frontShow?.State() || null,
      ...this.flow.State(),
      missionVersion: MISSION_VERSION,
      returnWarning: this.missionReturn.result,
      transferBeats:this.transferBeats || null,
      melee:{actors:MISSION_ENCOUNTERS.melee.map(spec=>{
        const actor=this.enemies.get(spec.id);
        return {id:spec.id,alive:!!actor?.alive,x:actor?.position.x??null,z:actor?.position.z??null};
      })},
      cart:this.transferCart.State().ride,
      village:this.village.State(),
      transferCart:this.transferCart.State(),
      // 15–18（End 包）的现场：布景、剧情实体、四个步骤模块各自的进度。
      end:{
        dressing:this.dressing.State(), extras:this.extras.State(),
        quietMarch:this.quietMarch.State(), reception:this.reception.State(),
        bridge:this.bridge.State(), nightGate:this.nightGate.State(),
      },
      bridgeColumn:this.bridge.State().rearColumn,
      missingCues:[...this.missingCues],
      debugStart: this.debugStart || null,
      time: this.time,
      control: this.controls?.kind || null,
      emptyHands: this.EmptyHands,
      openingPrompt: this.OpeningPrompt(),
      failed: this.failed,
      ordinaryCasualties:this.flow.log.filter(event=>event.id?.startsWith("ordinaryCasualty")).map(event=>event.detail),
      tank: { ...this.tank },
      playerExplosions: this.playerExplosions || [],
      column: this.column.State(),
      people:this.view.people.State(),aftermathCount:this.view.aftermath.count,aftermathTriangles:this.view.aftermath.triangles,
      relief: this.relief?.map(entry=>({id:entry.actor.id,alive:entry.actor.alive,arrived:entry.arrived,distance:entry.distance,index:entry.index,x:entry.actor.position.x,z:entry.actor.position.z})) || [],
      voice: this.voice.State(),
      leaderGuide: this.leaderGuide?.State(),
      music: this.music.State(),
      battleSound: this.battleSound.State(),
      enemies: [...this.enemies].map(([id, actor]) => ({
        id,
        alive: actor.alive,
        encounter:actor.missionEncounter,dormant:!!actor.missionDormant,noncombatant:!!actor.scriptedNoncombatant,
        x: actor.position.x,
        y: actor.position.y,
        z: actor.position.z,
        suppression: actor.suppression,
        tactic: actor.missionTactic ? { ...actor.missionTactic } : null,
        assault: actor.missionAssault ? { mode: actor.missionAssault.mode, index: actor.missionAssault.index, cycles: actor.missionAssault.cycles } : null,
      })),
      assault: {
        authoredFrontTotal:MISSION_ENCOUNTERS.front.length+MISSION_ENCOUNTERS.machineGun.length+MISSION_ENCOUNTERS.tank.length,
        openingTotal:R.openingEnemyBudget,
        peakFrontAlive:this.frontPeakAlive||0,
        frontAlive:[...this.enemies.values()].filter(actor=>actor.alive && ["front","machineGun","approach","tank"].includes(actor.missionEncounter)).length,
        squads: this.waves?.squads || 0, spawned: this.waves?.spawned || 0, queued: this.spawnQueue.length,
        alive: [...this.enemies.values()].filter((actor) => actor.alive && actor.missionAssault).length,
        rushing: [...this.enemies.values()].filter((actor) => actor.alive && actor.missionAssault?.mode === "rush").length,
      },
      guards: this.guards.map((guard) => ({
        id: guard.actor.id,
        safe: guard.safe,
        alive: guard.actor.alive,
        x: guard.actor.position.x, z: guard.actor.position.z,
        progress: guard.progress, threatened: this.Threatens(guard.actor.position),
      })),
      air: this.air && { ...this.air },
    };
  }
  Dispose() {
    this.RemoveBunkerRifle();
    this.leaderGuide?.Dispose();
    this.ClearReturnWarning();
    this.speakingFace?.Reset();
    if(this.ai.ctx.onSoldierDeath===this.soldierDeath)this.ai.ctx.onSoldierDeath=this.oldSoldierDeath;
    this.transition.Dispose();
    this.extras.Clear();
    this.nightLights?.Dispose();
    this.opening.Dispose();
    this.frontShow?.Dispose();
    this.squadMarch?.Dispose();
    if(this.tankDust!=null)this.vfx.RemoveSmokeSource(this.tankDust);
    this.voice.Dispose();
    this.music.Dispose();
    this.battleSound.Dispose();
    this.view.Dispose();
    this.interact.Clear("FirstLevelMission");
    this.emplacement.Clear("FirstLevelMission");
    this.combat.host.onBlast = this.oldBlast;
    this.aircraft.SetManualPose(MISSION_AIRCRAFT_ID, null);
    this.StopAirSound();
    this.RestoreSky?.();
    this.Control?.(false);
  }
}
