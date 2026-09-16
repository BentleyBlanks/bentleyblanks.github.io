import { FirstLevelTransition } from "./Script_FirstLevelTransition.mjs";
import { FRONT_SORTIE as Sortie, SOUTH_TRANSITION, SortieCrawlBlocked } from "./Data_FirstLevelFrontRoute.mjs";
import { MISSION_REARGUARD_POCKETS } from "./Data_FirstLevelMissionTopology.mjs";
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
import { SelectP012RecruitCast } from "./Data_FirstLevelP012Cast.mjs";
import { AiDirector } from "./Script_Ai.mjs";
import { OPENING } from "./Data_FirstLevelOpening.mjs";
import { FirstLevelOpening, SamplePerceptionCurve } from "./Script_FirstLevelOpening.mjs";
import { FRONT_DEFENDERS, FRONT_GUARD_POSTS, FRONT_SHELLS, FRONT_ASSAULT, FrontAssaultLane, FrontReserveLane, ClearLaneX } from "./Data_FirstLevelMissionFront.mjs";
import {
  MISSION_STAGES,
  MISSION_TUNING as R,
  MISSION_AIRCRAFT_ID,
  MISSION_ENCOUNTERS,
  MISSION_TACTICS,
  MISSION_GUIDANCE,
  MISSION_TRANSFER_BEATS,
  MISSION_PURSUIT_ROUTE,
  MISSION_VERSION,
} from "./Data_FirstLevelMission.mjs";
import {
  MISSION_ANCHORS as A,
  MISSION_ROUTES,
  MISSION_PLACEMENT as P,
  MISSION_SUPPLIES,
} from "./Data_FirstLevelMissionLayout.mjs";
import { MISSION_TRAIN, MissionTrainMotion } from "./Data_FirstLevelMissionTrain.mjs";
import { FirstLevelMissionTrain } from "./Script_FirstLevelMissionTrain.mjs";
import { PrepareFirstLevelCarriageAnimation } from "./Script_FirstLevelCarriageAnimation.mjs";
import { FirstLevelMissionFlow } from "./Script_FirstLevelMissionFlow.mjs";
import { TransferBeatReady, GuardCrossingPair, FrontReplacementSlots } from "./Script_FirstLevelMissionPacing.mjs";
import { ApplyFirstLevelStageJump } from "./Script_FirstLevelMissionStageJump.mjs";
import {
  FirstLevelMissionColumn,
  MissionRoutePoint,
  MissionRouteLength, MissionRouteProjection, MissionRouteNextIndex,
  MissionGuideSpeed, MissionGuideRoute, MissionSquadRoute, MissionSquadPace, MissionRouteLookahead,
} from "./Script_FirstLevelMissionColumn.mjs";
import { MELEE_QTE_RULES as Q, MELEE_RULES } from "./Data_MeleeCombat.mjs";
import { InstallMissionSentry, InstallAmbushPerformance } from "./Script_FirstLevelMissionPeople.mjs";
import { FirstLevelAmbush } from "./Script_FirstLevelMissionAmbush.mjs";
import { LoadFirstLevelAmbushAnimation, PrepareFirstLevelAmbushAnimation, FIRST_LEVEL_AMBUSH_CLIPS } from "./Script_FirstLevelAmbushAnimation.mjs";
import { SquadMarchAi } from "./Script_SquadMarchAi.mjs";
import { FirstLevelMissionView } from "./Script_FirstLevelMissionView.mjs";
import { FirstLevelMeal } from "./Script_FirstLevelMeal.mjs";
import { FirstLevelMissionBattleSound } from "./Script_FirstLevelMissionBattleSound.mjs";
import { FirstLevelMissionVoice } from "./Script_FirstLevelMissionVoice.mjs";
import { FirstLevelMissionMusic } from "./Script_FirstLevelMissionMusic.mjs";
import { FirstLevelCarriageSound } from "./Script_FirstLevelCarriageSound.mjs";
import { EmplacementInteraction } from "./Script_Emplacement.mjs";
import { Localize, T } from "./Script_Text.mjs";
import { ActionKeyGlyph } from "./Script_Input.mjs";
import { FirstLevelStageTextId } from "./Script_TextIds.mjs";
// Only for `emplaced`: a man married to a machine gun never carries throwables here.
import { WEAPONS } from "./Data_Weapons.mjs";
const Distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
// 剧本走位的到达半径：走到离目标这么近就算到了（MoveActor 写进 actor.scriptArrivalRadius）。
// 需要「正好站在那个点上」的演出走 DriveAmbusherOnto，它按这个数把目标往前推。
const SCRIPT_ARRIVAL_M = 0.45;
const Clamp = (x, a, b) => Math.max(a, Math.min(b, x));
/** 机枪座的座位点。CreateEmplacement 与 04 关中过场的触发圈共用这一个坐标。 */
const GUN_SEAT = Object.freeze({ x: 0, z: -127.4 });
/** 04 机枪点位的关中过场（Data_CutsceneMachineGunCaptives，注册在 CUTSCENES 里）。 */
const CAPTIVES_CUTSCENE_ID = "CS_MachineGunCaptives";
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
    // 屋内伏击的编排（纯规则在 Script_FirstLevelMissionAmbush，副作用全在下面这组钩子）。
    this.ambush = new FirstLevelAmbush(this.AmbushHooks(), R);
    this.southTransition = new FirstLevelTransition();
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
    this.flow = new FirstLevelMissionFlow({ Enter: (stage) => this.Enter(stage) });
    this.voice = new FirstLevelMissionVoice({
      audio: this.audio,
      hud: this.hud,
      Position: (cue,line) => this.VoicePosition(cue,line),
      Listener: () => this.player.EyePosition,
      Done: (id) => this.VoiceDone(id),
      Event: (id,cueId,detail) => this.VoiceEvent(id,cueId,detail),
      Ready: (id) => id === "trainPackNear"
        ? Math.hypot(this.companion.Handle("yaowa").position.x-this.player.position.x,
          this.companion.Handle("yaowa").position.z-this.player.position.z)<3.5 : this.Has(id),
      Clock: this.VoiceClock,
    });
    this.view = new FirstLevelMissionView({
      scene: this.scene,
      battlefield: this.battlefield,
      physics: this.physics,
      column: this.column,
      actorFactory:this.actorFactory,library:this.library,hud:this.hud,vfx:this.vfx,
    });
    // 抬担架的两个人挨刀那一段走同一个采样器；库没交付时这条返回 null，自动让路。
    this.view.people.PrepareAmbush = host => this.PrepareAmbushAnimation(host);
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
    this.carriageSound = new FirstLevelCarriageSound(this.audio,()=>this.train?.entries||[]);
    this.musicInitializing = true;
    this.view.interact = this.interact;
    this.meal = new FirstLevelMeal(this);
    this.leaderGuide = new FirstLevelLeaderGuide(this);
    this.Register();
    this.flow.Start();
    this.voiceReady = this.voice.Load().then(()=>{
      if (host.stageJump != null) ApplyFirstLevelStageJump(this, host.stageJump);
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
  Near(point, radius = 5) {
    return Distance(this.player.position, point) < radius;
  }
  Say(id, options) {
    this.voice.Enqueue(id, options);
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
    if(cue.id==="WoundedArrival"&&this.opening.wounded)return this.Point(this.opening.wounded.actor.position,1.2);
    if(line?.who==="wounded"&&this.trainWounded)return this.Point(this.trainWounded.position,1.2);
    if(cue.id==='BundleSupplyDirections' && line?.who==='soldier' && this.bundleKeeper)
      return this.Point(this.bundleKeeper.position,1.2);
    if(cue.id==="SupportOrder"&&this.opening.runner)return this.Point(this.opening.runner.actor.position,1.3);
    if (cue.id.startsWith("Retreat") || cue.id === "ZhouDeath") return this.Point(this.column.zhou, 1);
    const who = line?.who ?? cue.lines[0]?.who;
    if (who === "shunzi") return this.player.EyePosition.clone();
    const handled = this.companion.Handle(who)?.position;
    if (handled) return new THREE.Vector3(handled.x,handled.y+1.35,handled.z);
    // 不走 Point()：那一条按 GroundHeight 定高，而车厢地板比地面高两米 ——
    // 在军列上会把说话的人塞到车底下去。
    const at = this.player.position;
    return new THREE.Vector3(at.x, at.y + 1.5, at.z);
  }
  get EmptyHands() {
    return this.controls?.kind === "death" || (["Train","Unloading"].includes(this.flow.stage.id) && !this.Has("unloaded"));
  }
  get ReceivingFood() {
    return this.flow.stage.id === "Train" && !this.Has("trainFoodReceived");
  }
  /** COD campaign: a brief objective update; the leader remains the travelling destination. */
  ObjectiveNotice() {
    return this.ReceivingFood ? T("firstLevel.hint.receiveFood") : this.leaderGuide?.Objective() || "";
  }
  OpeningPrompt() {
    if(this.flow.stage.id==='Tank' && this.player.stance!=='prone' && Sortie.crawl.some(c=>this.Near(c,c.d/2+2)))
      return {keys:'Z',label:T('firstLevel.hint.crawlPassage'),kind:'stance'};
    if (this.controls || !this.EmptyHands || !["Train","Unloading"].includes(this.flow.stage.id)) return null;
    // 接腊肉不需要按键：只在左上角目标通知里说一句（见 ObjectiveNotice），底部不挂键帽。
    if (this.ReceivingFood) return null;
    if (this.Has("trainStopped")) return this.player.stance==="prone"
      ? {keys:"Z",label:T("firstLevel.hint.standAndUnload"),kind:"stance"}
      : {keys:"WASD",label:T("firstLevel.hint.leaveTrain"),kind:"move"};
    if (this.Has("trainProneOrder") && this.player.stance!=="crouch")
      return {keys:"C",label:T("firstLevel.hint.trainProne"),kind:"stance"};
    return null;
  }
  VoiceEvent(id,cueId,detail) {
    if(id==="TrainDialogueLine"){
      if(!detail)return;
      if(!detail.active){this.train?.SetDialogueAction(detail.who,null);return;}
      const clipId=OPENING.dialogueActions[cueId]?.[detail.who];
      if(clipId)this.train?.SetDialogueAction(detail.who,clipId,0,{loop:true,duration:detail.end-detail.start});
      return;
    }
    // 屋内伏击：老周那一声就是刀进去的那一瞬（Package B 在 RoomAmbush 第三句上打的点）。
    if(id==="AmbushZhouLine"){this.ambush.CueZhouStab();return;}
    // 罗班长「后头喊两个人上来抬！」：替补抬担架的从后队上来（幂等，Finish 里也会调）。
    if(id==="AmbushLuoOrders"){this.column.AmbushRecover();return;}
    if(id==="TrainIncomingFire"){this.opening.barrage.Begin();return;}
    if(this.carriageSound.Handle(id))return;
    if(id==="TrainRescue"){this.Record("luoRescueRequested");return;}
    if (id === "TrainFoodReceived") { this.Record("trainFoodReceived"); return; }
    if(id==="AircraftDiveOrder" && !this.Has("diveComplete")) {
      this.Record("diveOrderHeard");
      this.BeginControl("dive", R.diveSeconds);
      this.carry.ForceRelease("instinct");
      this.column.zhou.state="fallen";
      return;
    }
    if (id==="TrainProneOrder") {
      this.Record("trainProneOrder");
      this.player.SetStance?.("crouch");
      this.player.stance="crouch";
      return;
    }
    if (id==="TrainFirstShell") {
      this.opening.barrage.Begin();
    }
    if (id==="TrainNearShell") {
      if(this.Has("trainNearShell"))return;
      this.Record("trainNearShell");
      const cue=this.voice.current;
      const launchAt=cue?.cue.id==="TrainShelling"
        ?cue.plan.segments.flatMap(segment=>segment.events||[]).find(event=>event.id==="TrainNearShell")?.at:null;
      // The authored launch timestamp survives a late frame; the retained source
      // freezes during pause and at the impact gate, unlike wall-clock time.
      const Elapsed=Number.isFinite(launchAt)?()=>Math.max(0,cue.sourceTime-launchAt):null;
      const offset=MissionTrainMotion(this.time+OPENING.nearShellFlightS,this.trainShellStartedAt,this.shellTrainOffset).offsetM;
      const target=this.Point({x:-72.7,z:MISSION_TRAIN.cars[OPENING.derailCar].z+offset});
      this.combat.FireShell(new THREE.Vector3(target.x+26,target.y+28,target.z-8),target,{
        flight:OPENING.nearShellFlightS,kind:"Shell75",radius:5,damage:0,Elapsed,
        OnImpact:()=>{
          this.opening.Derail();
          this.player.Suppress(.9);
          for(const actor of this.squad)this.ai.SetStance(actor,2,3,true);
          if(this.trainWounded){
            this.trainWounded.TakeHit(70,"arm",new THREE.Vector3(-1,0,0));
            this.ai.SetStance(this.trainWounded,1,15,true);
          }
          this.Record("trainSoldierWounded");
          this.column.stationBombed=true;
        },
      });
    }
  }
  VoiceDone(id) {
    if (id === "TrainMeal") this.Say("TrainPack");
    if (id === "TrainPack") this.Say("TrainBriefing");
    if (id === "TrainBriefing") this.Record("trainShelling");
    if (id === "WreckImpact") this.Say("TrainShelling");
    if (id === "TrainShelling") this.Say("WreckExit");
    if (id === "WreckExit") this.Record("unloadOrdersHeard");
    if (id === "ShelterAid") this.Say("EscapeWhisper");
    if (id === "EscapeWhisper") this.Record("escapeWhisperHeard");
    if (id === "SupportOrder") this.Record("supportOrdersHeard");
    if (id === "AircraftFirst") this.Record("firstAirOrdersHeard");
    if (id === "CarryZhou") this.Record("carryOrdersHeard");
    if (id === "FinalExit") this.Record("finalExitHeard");
    if (id === "Volunteer") this.Record("volunteerHeard");
    if (id === "ZhouLift") this.Record("zhouOnLitter");
    if (id === "BundleSupplyDirections") this.Record("bundleDirectionsHeard");
    if (id === "SouthHope") this.Record("southHopeHeard");
    if (id === "FollowVehicle") this.Record("followVehicleHeard");
    if (id === "TransferHope") this.Record("transferHopeHeard");
  }
  SyncCarriageDialogue(){
    const current=this.voice.current;
    if(!current||this.Has("trainNearShellImpact"))return;
    for(const track of [current,...(current.parallel||[])]){
      if(track.finished||(track===current&&track.phase!=="playing"))continue;
      const index=track.plan.lines.findIndex(([a,b])=>track.sourceTime>=a&&track.sourceTime<b);
      if(index<0)continue;
      const who=track.cue.lines[index].who,clipId=OPENING.dialogueActions[track.cue.id]?.[who];
      if(!clipId)continue;
      const [start,end]=track.plan.lines[index];
      this.train.SetDialogueAction(who,clipId,track.sourceTime-start,{loop:true,duration:end-start});
    }
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
    const originals = this.squad.filter(actor => actor.castId !== "luo");
    while (originals.length < 6) originals.push(this.ai.Spawn("nra", MISSION_TRAIN.centerX, A.train.z + R.trainTravelM, {
      ...SelectP012RecruitCast(originals.length), weapon: "HanYang", scriptedNoncombatant: true, squadId: "MissionTrainOriginals",
    }));
    this.trainWounded = originals[3];
    this.train = new FirstLevelMissionTrain({
      Originals: () => originals, Guide: () => this.companion.Handle("luo"),
      Spawn: (car, slot) => this.ai.Spawn("nra", MISSION_TRAIN.centerX, car.z + this.battlefield.trainOffsetM, {
        ...SelectP012RecruitCast(slot), weapon: "HanYang", scriptedNoncombatant: true, squadId: "MissionTrain" + car.carIndex,
      }),
      Offset: () => this.battlefield.trainOffsetM,
      Stopped: () => this.Has("trainStopped"),
      Stance: (actor,stance) => this.ai.SetStance(actor,stance,.3,true),
      PrepareAnimation: actor=>PrepareFirstLevelCarriageAnimation(actor),
      Place: (actor, point) => { this.PlaceActor(actor, point); actor.yaw = Math.PI / 2; },
      Hold: (actor) => {
        if(actor.missionTrainReady && actor!==this.trainWounded){
          this.Defend(actor,actor.position);
        }
        else {actor.scriptedNoncombatant=true;this.MoveActor(actor,actor.position,0);}
      },
      Move: (actor, point, speed) => {
        this.ai.SetStance(actor, 0, 0.5, true);
        this.MoveActor(actor, point, speed);
        actor.scriptArrivalRadius = MISSION_TRAIN.arrivalRadiusM;
      },
      Exited: actor => {
        if(actor.castId)this.squadRoutes.set(actor.id,[{x:-69,z:actor.position.z},{x:-69,z:70},...OPENING.approachRoute]);
      }, Player: () => this.player.position,
    });
    this.train.Initialize();
    this.view.train = this.train;
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
  RespondToContact(actor) {
    if(!actor?.alive || actor.unarmed || actor.scriptedNoncombatant || actor.carryRole || actor.meleeCombat)return false;
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
    const danger=this.time<(actor.missionDangerUntil||0);
    if(danger){
      const hiding=this.ai.time<(actor.scriptShelterUntil||0);
      if(hit || wounded || actor.suppression>=R.companionHideSuppression
        || (hiding && actor.suppression>R.companionReturnFireSuppression))
        actor.scriptShelterUntil=this.ai.time+R.companionShelterHoldS;
      // Never let a march timer pull a man out of shelter while bullets are
      // still passing him. Without a reachable shelter, keep escaping low.
      actor.missionContactPost??={x:actor.position.x,z:actor.position.z};
      this.Defend(actor,actor.missionContactPost,R.contactRadiusM,R.companionCoverSlackM);
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
    if(actor.side==="nra" && actor.missionTrainReady && !actor.castId && actor!==this.trainWounded)
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
      const naturalMarch=!stations&&[MISSION_ROUTES.support,MISSION_ROUTES.south].includes(route);
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
    if (["Train", "Unloading"].includes(stage) && !this.Has("trainStopped")) return;
    for (const actor of [...this.squad, this.trainWounded].filter(Boolean)) {
      InstallMissionSentry(actor);
      if (!actor.missionTrainReady) continue;
      if (actor === this.trainWounded) {
        this.ai.SetStance(actor, 1, Infinity, true);
        continue;
      }
      if (actor === this.bedGuide?.actor && ["FinalCarry", "Death"].includes(stage)) {
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
      actor.scriptedNoncombatant = stage === "South";
      actor.scriptEscapeStance=null;
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
      // 幺娃在屋门口被撞倒：趴着不动，直到 ambushYaowaDownS 过去。
      if(this.time<(actor.missionAmbushDownUntil||0)){
        this.squadMarch?.Release(actor);
        this.MoveActor(actor,actor.position,0);
        this.ai.SetStance(actor,2,.5,true);
        continue;
      }
      if(this.RespondToGrenade(actor))continue;
      // 冲进屋救人的那一段不许被「看见敌人就停下来打」拦住：顺子正被三个上刺刀的围着，
      // 隔着灶屋门口对射帮不上忙。进了屋之后照常走共用的接触规则。
      const ambushEntry=stage==="Melee"&&actor.missionAmbushEntry&&!this.InRoom(actor.position);
      if(ambushEntry)actor.missionContactPost=null;
      if(!ambushEntry&&!crawl&&R.openingContactStages.includes(stage)&&this.RespondToContact(actor))continue;
      if(!R.openingContactStages.includes(stage))actor.missionContactPost=null;
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
        if (stage === "South" || (actor.suppression < 0.4 && this.time>=(actor.missionDangerUntil||0))) this.ai.SetStance(actor, 0, 0.5, true);
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
      } else if (["TrenchEntry","Shelter"].includes(stage)) {
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
      if (!Number.isFinite(actor.scriptEscapeStance) && actor.suppression > R.companionProneSuppression && stage !== "Train") this.ai.SetStance(actor, 2, R.companionDangerHoldS, true);
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
          &&!(actor===this.bedGuide?.actor&&["FinalCarry","Death"].includes(stage)),
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
      if(id==="surface"){
        if(!spec.advance)actor.scriptFireSector=OPENING.surfaceSector;
        actor.scriptTrackPlayer=true;
        actor.missionFireGroup=spec.team;
        actor.yaw=Math.atan2(spec.x+62,spec.z-75);
      }
      if(id==="approach")actor.scriptFireSector=R.approachFireSector;
      actor.missionReserve=!!spec.reserve;
      actor.missionReleaseDelayS=spec.releaseDelayS||0;
      if(["village","melee"].includes(id)){actor.missionDormant=true;actor.scriptedNoncombatant=true;}
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
      // They shoot while bounding down a long straight trench, like the approach screen.
      if(id==="shelterPursuit")actor.scriptAccuracyScale=actor.missionAccuracyScale=R.approachAccuracyScale;
      actor.scriptFireIntervalScale = actor.missionFireIntervalScale = ["front","machineGun","approach"].includes(id)?R.frontFireIntervalScale:1.45;
      actor.scriptArrivalRadius = 0.7;
      actor.manualGoalUntil = Infinity;
      actor.order = "hold";
      actor.holdZone = { id: `Mission_${spec.id}`, x: spec.x, z: spec.z, radius: spec.hold ? 0.4 : 2 };
      if(!spec.hold && !WEAPONS[spec.weapon || "Type38"]?.emplaced){
        actor.tacticalRadiusM = id === "surface" ? R.surfaceTacticalRadiusM
          : ["intrusion","shelterPursuit"].includes(id) ? R.intrusionTacticalRadiusM : id === "approach" ? R.approachTacticalRadiusM : R.infantryTacticalRadiusM;
      }
      // Emplaced gunners keep their firing position: the hide/peek side step is all they may do.
      // Everyone else may take cover inside their zone plus the ordinary slack.
      actor.scriptCoverSlackM = spec.hold ? R.defendHoldFixedSlackM : R.defendCoverSlackM;
      if(id==="surface"){
        actor.scriptAccuracyScale=actor.missionAccuracyScale=spec.advance?R.approachAccuracyScale:R.openingSurfaceAccuracyScale;
        actor.scriptFireIntervalScale=actor.missionFireIntervalScale=R.openingSurfaceFireIntervalScale;
        if(!spec.hold){actor.holdZone.radius=R.openingSurfaceRifleRadiusM;actor.scriptCoverSlackM=R.openingSurfaceRifleCoverSlackM;}
      }
      // Two Type 91/97 grenades apiece (Data_Tuning_FirstLevel.enemyGrenades). The tactics layer decides
      // when one is worth throwing (target pinned in one place, 8-26 m, squad and personal cooldowns);
      // gunners on an emplacement never throw, they are married to the gun.
      if (!spec.hold && !WEAPONS[spec.weapon || "Type38"]?.emplaced) actor.grenades = R.enemyGrenades;
      if(id==="intrusion")actor.grenades=OPENING.intruderGrenades;
      if(id==="shelterPursuit")actor.grenades=OPENING.shelterPursuerGrenades;
      if(id==="surface"&&!spec.hold)actor.grenades=R.openingSurfaceGrenades;
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
  UpdateTransferBeats() {
    const beats=this.transferBeats ||= {index:0,previousClearedAt:0,started:[],cleared:[]};
    const plan=MISSION_TRANSFER_BEATS[beats.index];
    if(!plan)return;
    const seconds=this.flow.stageTime;
    if(!beats.started.includes(plan.id)) {
      if(!TransferBeatReady(plan,{seconds,loaded:this.column.loadEvents.length,previousClearedAt:beats.previousClearedAt}))return;
      this.SpawnEncounter(plan.id);beats.started.push(plan.id);
      this.Record(`${plan.id}AttackStarted`,{loaded:this.column.loadEvents.length,departed:this.column.departed});
    }
    const actors=MISSION_ENCOUNTERS[plan.id].map(spec=>this.enemies.get(spec.id));
    if(actors.every(actor=>actor && !actor.alive)) {
      beats.cleared.push(plan.id);beats.previousClearedAt=seconds;beats.index++;
      this.Record(`${plan.id}AttackCleared`,{loaded:this.column.loadEvents.length,departed:this.column.departed});
      if(beats.index===MISSION_TRANSFER_BEATS.length)this.Record("transferAttacksResolved");
    }
  }
  Threatens(point, ids = null, targetHeight = 1.1) {
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
      if (Distance(actor.position, point) > R.passageRangeM) return false;
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
      () => ["Carry", "FinalCarry"].includes(this.flow.stage.id) && !this.carry.Active,
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
      () => this.flow.stage.id === "FinalCarry" && this.carry.KindId === "stretcher",
      () => {
        this.carry.ForceRelease("delivered");
        Object.assign(this.column.zhou, { ...A.zhouDrop, state: "placed", yaw: 0 });
        this.Record("zhouPlaced");
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
    this.UpdateMusic(stage.id);
    this.Objective(Localize(FirstLevelStageTextId(stage.id), stage.objective));
    if (stage.cue && !["Orders", "Courtyard", "Train", "Unloading", "Shelter", "Death"].includes(stage.id))
      this.Say(stage.cue, { urgent: ["AirFirst", "Dive", "Death"].includes(stage.id) });
    switch (stage.id) {
      case "Train":
        this.Say(stage.cue);
        this.battlefield.SetTrainOffset(R.trainTravelM);
        this.PlaceSquad();
        this.PlacePlayerTrain();
        this.player.pitch=MISSION_TRAIN.life.mealLookPitchRad;
        this.carriageSound.Start();
        break;
      case "Unloading":
        this.VoiceEvent("TrainProneOrder");
        this.VoiceEvent("TrainFirstShell");
        this.VoiceEvent("TrainNearShell");
        this.Say(stage.cue, { urgent: true });
        break;
      case "Support":
        this.column.zhou.visible = false;
        this.audio.Ambience("firstLevelFront");
        this.Guide(MISSION_ROUTES.support);
        this.forwardGunner = this.ai.Spawn("nra", A.forwardNest.x, A.forwardNest.z, {
          weapon: "Zb26",
          squadId: "MissionForwardNest",
        });
        if (this.forwardGunner) this.Defend(this.forwardGunner, A.forwardNest);
        // The finite assault is committed by UpdateFront at the last approach
        // bend. Spawning it here lets a slow approach spend the battle offscreen.
        this.SpawnEncounter("approach");
        this.SpawnEncounter("tank");
        this.SpawnEncounter("village");
        this.SpawnEncounter("melee");
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
        this.SpawnEncounter("machineGun");
        this.tank.active = true;
        this.SpawnEncounter("tank");
        this.SpawnGuards();
        for (const [i, actor] of this.squad.entries()) this.Defend(actor, OPENING.frontPosts[i],R.contactRadiusM,R.companionCoverSlackM);
        break;
      case "Tank":
        // The blast screen separates the front posts from the far end of the
        // bundle approach. Everyone exits through its central trench junction.
        this.emplacement.Vacate("sortie");
        this.GuideSortie(MISSION_ROUTES.bundle);
        this.SpawnEncounter("bundleApproach");
        this.EnsureBundleKeeper();
        break;
      case "Orders":
        this.Guide(MISSION_ROUTES.orders);
        this.column.Activate();
        this.column.zhou.health = Math.min(this.column.zhou.health,65);
        this.column.zhou.state = "waiting";
        break;
      case "South":
        for (const actor of this.enemies.values()) if (actor.alive) actor.scriptedNoncombatant = true;
        for (const cart of this.column.traffic) cart.visible = true;
        this.audio.Ambience("firstLevelSouth");
        this.BeginControl("southTransition",SOUTH_TRANSITION.fadeOutS+SOUTH_TRANSITION.holdS+SOUTH_TRANSITION.fadeInS);
        this.southTransition.Update(0);
        break;
      case "Village":
        // 屋里伏击那一组不跟着村口的日军一起醒：他们要等顺子真的进屋。
        for (const actor of this.enemies.values())
          if (actor.alive && actor.missionDormant && actor.missionEncounter !== "melee") actor.scriptedNoncombatant = false;
        this.audio.Ambience("firstLevelFront");
        this.Guide(MISSION_ROUTES.village.slice(0, 3));
        this.SpawnEncounter("village");
        this.SpawnEncounter("melee");
        this.HideAmbushers();
        this.PostAmbushSquad();
        // Package C 的动作库还没交付时这一拍退回既有姿态，不阻断任务。
        LoadFirstLevelAmbushAnimation().catch(error => { this.ambushAnimationError = String(error); });
        this.column.active = true;
        break;
      case "Melee":
        // 调试跳转直接落在这一步时 Village 那一趟没跑过；加载是幂等的。
        LoadFirstLevelAmbushAnimation().catch(error => { this.ambushAnimationError = String(error); });
        this.ambush.Reset();
        this.ClearAmbushDaze();
        this.SetAmbushPrompt(null);
        this.SetAmbushViewmodel(true);
        this.RestoreAmbushWeapon();
        this.ambushQteSerial = null;
        this.ambushQteResult = null;
        this.ambushColumn = this.column.Snapshot();
        this.HideAmbushers();
        break;
      case "Courtyard":
        this.Guide(MISSION_ROUTES.village.slice(2, 6));
        this.SpawnEncounter("courtyard");
        break;
      case "TransferApproach":
        this.Guide(MISSION_ROUTES.village.slice(-4));
        this.column.loading = true;
        break;
      case "Transfer":
        this.Guide(MISSION_ROUTES.village.slice(-4));
        this.SpawnEncounter("transfer");
        break;
      case "AirFirst":
        this.guideRoute = null;
        this.StartAir(1, R.firstAirLeadS);
        this.SpawnEncounter("air");
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
      case "RetreatFirst":
        this.column.StartRetreat();
        this.SpawnEncounter("retreat");
        this.Say("RetreatFirst");
        this.Guide(MISSION_REARGUARD_POCKETS.find(pocket=>pocket.id===stage.id).route);
        break;
      case "RetreatWall":
        this.SpawnEncounter("retreatWall");
        this.column.zhou.health = 12;
        this.Guide(MISSION_REARGUARD_POCKETS.find(pocket=>pocket.id===stage.id).route);
        break;
      case "RetreatYard":
        this.SpawnEncounter("retreatYard");
        this.column.zhou.health = 6;
        this.Guide(MISSION_REARGUARD_POCKETS.find(pocket=>pocket.id===stage.id).route);
        break;
      case "Reception":
        this.SpawnEncounter("reception");
        this.column.StartReception();
        this.guideRoute = null;
        break;
      case "FinalCarry":
        this.column.zhou.state = "waiting";
        this.bedGuide = {
          actor: this.companion.Handle("yaowa"),
          route: [...MISSION_ROUTES.reception, { x: A.zhouDrop.x + 1, z: A.zhouDrop.z }],
        };
        if (this.bedGuide.actor) this.squadRoutes.set(this.bedGuide.actor.id, []);
        break;
      case "Death":
        this.SpawnEncounter("final");
        this.deathMedic = this.column.walkers
          .filter((w) => w.kind === "medic" && w.health > 0 && !w.assigned)
          .sort((a, b) => Distance(a, A.zhouDrop) - Distance(b, A.zhouDrop))[0];
        if(this.deathMedic)this.deathMedic.treating=true;
        this.deathCareRoute=null;
        break;
      case "FinalDefense":
        this.guideRoute = null;
        this.Say("JapanesePursuit");
        this.column.StartFinalExit();
        break;
      case "Exit":
        this.Guide(MISSION_ROUTES.exit);
        break;
      case "Complete":
        this.ClearReturnWarning();
        this.completed = true;
        this.Complete();
        break;
    }
    if (stage.id !== "Train" && stage.id !== "Dive" && stage.id !== "Death") this.SaveCheckpoint();
  }
  PlacePlayerTrain() {
    const p = { x: A.train.x, z: A.train.z + R.trainTravelM };
    this.player.position.copy(this.Point(p));
    this.player.body?.Teleport(this.player.position.x, this.player.position.y, this.player.position.z);
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
      if(!guard.safe && (!pair.includes(guard.actor.id) || !(this.Has("gunUsed") || this.flow.stage.id==="MachineGun" || this.Has("frontAttackRepelled") || (this.flow.stage.id==="Support" && this.Has("frontReached") && this.guards.indexOf(guard)<OPENING.rifleGuardCount && this.Inventory().shots>this.frontArrivalShots)) || (!guard.crossing && this.time<(this.nextGuardCrossingAt||0)))) {
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
  }
  UpdateFrontDialogue() {
    if(!["Support","MachineGun"].includes(this.flow.stage.id)||!this.Has("frontReached"))return;
    const remaining=this.guards.filter(guard=>guard.actor.alive&&!guard.safe);
    const gunner=this.enemies.get("FrontGunner");
    const blocked=remaining.length&&gunner?.alive;
    if(gunner&&!blocked)this.voice.Cancel(["FrontBlockade","FrontReminder","FrontFallback"]);
    if(remaining.length&&!this.voice.played.has("FrontCoverCall")&&!this.voice.current)this.Say("FrontCoverCall");
    if(this.voice.finished.has("FrontCoverCall"))this.frontDialogueAt??=this.time;
    const age=this.frontDialogueAt==null?0:this.time-this.frontDialogueAt;
    const visible=remaining.some(guard=>{
      const point=this.Point(guard.actor.position,1),ndc=point.clone().project(this.player.camera);
      return ndc.z>=-1&&ndc.z<=1&&Math.abs(ndc.x)<.75&&Math.abs(ndc.y)<.75&&!this.BlocksSight(this.player.EyePosition,point);
    });
    if(visible)this.frontDialogueSeenAt??=this.time;else this.frontDialogueSeenAt=null;
    const seen=this.frontDialogueSeenAt!=null&&this.time-this.frontDialogueSeenAt>=R.frontDialogueSeenS;
    if(blocked&&this.frontDialogueAt!=null){
      if(seen&&!this.voice.played.has("FrontFallback"))this.Say("FrontBlockade");
      else if(!seen&&!this.voice.played.has("FrontBlockade")){
        if(age>=R.frontDialogueFallbackS){this.voice.Cancel(["FrontReminder"]);this.Say("FrontFallback");}
        else if(age>=R.frontDialogueReminderS)this.Say("FrontReminder");
      }
    }
    if(gunner&&!gunner.alive&&remaining.some(guard=>guard.crossing)){
      this.Say("FrontCrossing");
      if([...this.enemies.values()].some(actor=>actor.alive&&actor.position.x>this.player.position.x))this.Say("FrontPursuit");
    }
    if(remaining.length&&this.guards.some(guard=>guard.safe&&guard.actor.alive))this.Say("FrontReceived");
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
    this.Say("JapaneseFlank");
    this.Say("FlankWarning");
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
  UpdateRelief(dt) {
    if(!this.Has("unloaded") || !this.train.entries.every(entry=>entry.arrived||!entry.actor.alive))return;
    if(!this.relief) {
      // The existing eight-man relief detail keeps its authored front posts;
      // extra rear-car survivors stay at the unloading casualty station.
      this.relief=this.train.entries.filter(entry=>entry.carIndex===2&&entry.actor.alive).slice(0,P.reliefPositions.length).map((entry,i)=>({
        actor:entry.actor, route:[...P.reliefApproach,{x:P.reliefPositions[i].x,z:-123},P.reliefPositions[i]], index:0, delay:i*R.reliefDelaySeconds,
        arrived:false, distance:0, last:{x:entry.actor.position.x,z:entry.actor.position.z}
      }));
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
  }
  UpdateTactics(dt) {
    const stage = this.flow.stage.id;
    for (const [id, actor] of this.enemies) {
      const plan = MISSION_TACTICS[id], state = actor.missionTactic;
      if (!actor.alive || !state || actor.scriptedNoncombatant || actor.meleeCombat ||
        ((id.startsWith("Air") || id.startsWith("Retreat")) && stage.startsWith("Retreat"))) continue;
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
    for(const actor of this.enemies.values())if(this.flow.stage.id==="Village" && actor.missionEncounter!=="melee" && actor.missionDormant && Distance(actor.position,this.player.position)<55){
      actor.missionDormant=false;actor.scriptedNoncombatant=false;
    }
    if(!["Support","MachineGun","Tank","Orders"].includes(this.flow.stage.id))return;
    if(this.flow.stage.id==="Support")for(const [i,shell] of FRONT_SHELLS.entries()){
      const fact="approachShell"+i;
      if(!this.Has(fact)&&this.Near(shell.trigger,10)){
        this.Record(fact);
        this.combat.FireShell(this.Point({x:shell.impact.x+45,z:shell.impact.z-45},32),this.Point(shell.impact),
          {kind:"Shell75",flight:1.8,radius:6,damage:70});
      }
    }
    if(!this.Has("frontBattleStarted")&&this.Near(A.front,R.frontEngageDistanceM)){
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
    for(const crawl of Sortie.crawl)if(this.player.stance==='prone' && this.Near(crawl,Sortie.crawlRadiusM) && this.player.position.y<this.battlefield.GroundHeight(this.player.position.x,this.player.position.z)+.2)
      this.Record(`bundleCrawl${crawl.id}`,{x:this.player.position.x,z:this.player.position.z,stance:this.player.stance});
    const next=Sortie.route.findIndex((point,index)=>!this.Has(`bundleRoutePoint${index}`));
    if(next>=0 && this.Near(Sortie.route[next],Sortie.checkpointRadiusM))this.Record(`bundleRoutePoint${next}`);
    if(Sortie.route.every((point,index)=>this.Has(`bundleRoutePoint${index}`)) &&
      Sortie.crawl.every(crawl=>this.Has(`bundleCrawl${crawl.id}`)))this.Record('bundleRouteTraversed');
    if(this.Near(Sortie.house,Sortie.supplierRangeM))this.Say('BundleSupplyDirections');
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
  PlaceSouthArrival(){
    const point=SOUTH_TRANSITION.arrival,y=this.battlefield.GroundHeight(point.x,point.z);
    this.player.position.set(point.x,y,point.z);this.player.body?.Teleport(point.x,y,point.z);
    this.player.velocity.set(0,0,0);this.player.SetStance('stand');this.player.yaw=Math.PI;this.player.pitch=0;
    const lead=MissionRouteProjection(this.column.route,point).progress-SOUTH_TRANSITION.columnLeadM;
    const delta=lead-Math.max(...this.column.litters.map(entry=>entry.progress));
    for(const entry of [...this.column.litters,...this.column.walkers]){
      entry.progress=Math.max(0,entry.progress+delta);
      Object.assign(entry,MissionRoutePoint(this.column.route,entry.progress));
      delete entry.staging;
    }
    // 黑屏里把老周这一副提到队首前一个车距：罗班长的命令是「担架从里头过」，
    // 跟着顺子进屋的就是这一副。数组次序不动（转运区的装车配额还要用）。
    this.column.PromoteZhouLead(R.ambushLitterLeadM);
    for(const [i,actor] of this.squad.entries()){
      actor.missionSortie=false;
      this.PlaceActor(actor,{x:point.x+(i%2?2:-2),z:point.z-SOUTH_TRANSITION.squadBehindM-Math.floor(i/2)*2});
      this.squadRoutes.set(actor.id,[]);this.Defend(actor,actor.position);
    }
    this.controls.yaw=this.player.yaw;this.controls.pitch=0;
    this.Record('southTransitionPlaced',{x:point.x,z:point.z});this.player.SyncCamera(0);
  }
  UpdateTank() {
    const tank = this.tank;
    if (!tank.active || !["Support","MachineGun","Tank","Orders"].includes(this.flow.stage.id)) {
      if(this.tankDust!=null){this.vfx.RemoveSmokeSource(this.tankDust);this.tankDust=null;}
      return;
    }
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
      this.Record("zhouCarried");
    }
    return ok;
  }
  UpdateCarry() {
    const zhou = this.column.zhou;
    if (this.carry.KindId !== "stretcher" || zhou.state !== "carried") return;
    const goal = this.flow.stage.id === "FinalCarry" ? A.zhouDrop : A.ditch;
    const yaw = Math.atan2(this.player.position.x - goal.x, this.player.position.z - goal.z);
    zhou.x = this.player.position.x - Math.sin(yaw) * 1.6;
    zhou.z = this.player.position.z - Math.cos(yaw) * 1.6;
    zhou.yaw = yaw;
    if (this.flow.stage.id === "Carry" && this.Near(A.ditchMouth, 2)) this.Record("atDitchMouth");
  }
  // ---------------------------------------------------------------------------
  // 屋内伏击（内部步骤 Melee）。编排在 Script_FirstLevelMissionAmbush，这里只做副作用。
  // 口径与拍表见 docs/Data_FirstLevelRoomAmbush.md。
  // ---------------------------------------------------------------------------
  get Ambushers() {
    return MISSION_ENCOUNTERS.melee.map(spec => this.enemies.get(spec.id)).filter(Boolean);
  }
  get AmbushSquad() {
    return ["luo", "heyoutian", "liuwencai"].map(id => this.companion.Handle(id)).filter(Boolean);
  }
  AmbushActor(id) { return this.enemies.get(id) || null; }
  /**
   * 这一拍正占着屏幕：HUD 整个让位（只剩字幕与这一拍自己的提示环）。
   * 装配层每帧读它，不认识伏击的状态机。
   */
  get AmbushCinematic() { return this.ambush.Scripted && this.controls?.kind === "ambush"; }
  InRoom(point) {
    const room = P.roomInterior;
    return point.x > room.minX && point.x < room.maxX && point.z > room.minZ && point.z < room.maxZ;
  }
  LitterAtDoor() {
    const zhou = this.column.zhou;
    return !!zhou && Math.hypot(zhou.x - A.melee.x, zhou.z - R.ambushLitterDoorZ) <= R.ambushLitterDoorRadiusM;
  }
  AmbushHooks() {
    return {
      Record: (id, detail) => this.Record(id, detail),
      Has: id => this.Has(id),
      Say: (id, options) => this.Say(id, options),
      Lock: seconds => {
        const lead = this.AmbushActor("AmbushLead");
        this.BeginControl("ambush", seconds,
          { lookAt: lead ? this.Point(lead.position, R.ambushLookHeightM) : null, lookSeconds: R.ambushLookSeconds });
      },
      Unlock: () => this.ReleaseAmbushControl(),
      Wake: id => this.WakeAmbusher(this.AmbushActor(id)),
      PlayClip: (id, clipId) => this.PlayAmbushClip(this.AmbushActor(id), clipId),
      PlayerAlive: () => this.player.alive === true,
      KnockDown: () => this.AmbushButtStrike(),
      Daze: on => this.SetAmbushDaze(on),
      LookAt: what => this.AmbushLookAt(what),
      Prompt: view => this.SetAmbushPrompt(view),
      Pounce: () => this.AmbushPounce(),
      BeginGround: () => this.BeginAmbushGround(),
      EndGround: () => this.EndAmbushGround(),
      GroundFailure: shared => this.AmbushGroundFailure(shared),
      Finisher: () => this.AmbushFinisher(),
      Rise: () => this.AmbushRise(),
      ColumnCasualty: victim => this.AmbushCasualty(victim),
      KnockDownFriend: who => this.AmbushKnockDown(who),
      Release: () => this.ReleaseAmbushers(),
      SquadIn: () => this.SendAmbushSquad(),
      Finish: () => this.FinishAmbush(),
    };
  }
  /** 屋里三处死角：趴下、不打、不进共用白刃配对。 */
  HideAmbushers() {
    for (const actor of this.Ambushers) {
      if (!actor.alive) continue;
      actor.missionDormant = true;
      actor.scriptedNoncombatant = true;
      actor.meleeDormant = true;
      actor.meleeTraining = { passive: true, strength: R.ambushQteStrength };
      actor.missionAmbushClip = null;
      actor.missionAmbushReleaseAt = null;
      // 重放这一拍时枪要回到他手上（反捅那一段会把它藏起来，见 InstallAmbushPerformance）。
      actor.missionAmbushWeaponDropped = false;
      actor.scriptEssential = false;
      actor.order = "hold";
      actor.manualGoalUntil = Infinity;
      actor.goal.set(actor.position.x, 0, actor.position.z);
      this.SetAmbushWeaponDetail(actor, false);
      this.ai.SetStance(actor, 2, Infinity, true);
    }
    this.SetAmbushHandOffset(false);
  }
  /**
   * 近景特写档：被镜头怼到脸上的那个人（压住玩家那个）按 high 档建手持武器 ——
   * 三八式上的刺刀走 TZM 模型，不走低画质那根方块刀片。整场画质一个字不动。
   *
   * 为什么非有不可：玩家默认画质是 high，可这一拍在 quality=low 的浏览器验收里
   * 也要成立，而 low 档的刺刀是一根 16×24 mm 的黑盒子 —— 半米外怼着脸看就是「一块黑砖」。
   * 演完（HideAmbushers / 这一拍收尾）还回去，免得他躺在地上当尸体时还背着一份近景几何。
   */
  SetAmbushWeaponDetail(actor, on) {
    return actor?.actor?.SetWeaponDetail?.(on === true) === true;
  }
  /**
   * 起身：能走位、能演，但挂着空射界（ambushSilentSector），一枪都不开。
   * 四个人这会儿全部 meleeDormant —— **领头那个也是**。挂着 meleeTraining 又不 dormant 的人
   * 会被共用白刃层认领（`MeleeCombat.Step` 的 managed），`Script_Ai.Act` 见到 `meleeCombat`
   * 就把整帧交给 `StepMeleeCombat`，那条路不走导航：他会站在藏身点一步不动，
   * 「扑上来顶住」变成三米外凭空掉 24 点血。顶住那一瞬（HoldAmbushBind）再把他交回白刃层摆姿势。
   * 其余三个整段留在 meleeDormant 里，免得 ImmediateThreat 把玩家从僵持里拽出来。
   */
  WakeAmbusher(actor) {
    if (!actor?.alive) return;
    actor.missionDormant = false;
    actor.scriptedNoncombatant = false;
    actor.scriptFireSector = R.ambushSilentSector;
    actor.bayonetFixed = true;
    actor.meleeDormant = true;
    actor.meleeTraining = { passive: true, strength: R.ambushQteStrength };
    this.ai.SetStance(actor, 0, R.ambushLockMaxS, true);
    // 领头那个整段剧本挂叙事保护：砸倒、压刀、推刀、反捅这四下全建立在他活着上，
    // 而玩家躺在地上的这八九秒里幺娃就站在门口、班里人在灶屋 —— 实拍里他被一枪打掉过
    // （2026-09-16，story 7.9 s），戏就只剩玩家自己爬起来。反捅之前摘掉，所以他**真的**
    // 死在玩家手里（AmbushFinisher）。另外三个不挂：他们死了这一拍照样走得通。
    if (actor.missionId === "AmbushLead") {
      actor.scriptEssential = true;
      // 他整段都在半米到一米二之间怼着镜头（枪托、压刀、推刀、反捅四下全是特写）。
      this.SetAmbushWeaponDetail(actor, true);
    }
    InstallAmbushPerformance(actor, target => this.PrepareAmbushAnimation(target));
    this.PlayAmbushClip(actor, "AmbushRise");
  }
  PrepareAmbushAnimation(host) {
    try {
      return PrepareFirstLevelAmbushAnimation(host, (x, z) => this.battlefield.GroundHeight(x, z));
    } catch (error) {
      this.ambushAnimationError = String(error);
      return null;
    }
  }
  PlayAmbushClip(actor, clipId) {
    if (!actor) return;
    // 清单里没有这一段就当没有演出层：动作库是独立交付的，编排先落地、烘焙后到的那几天
    // 不许让一个拼错／还没烘的 clip id 把 rig.Update 抛进异常（整页就黑了）。
    const spec = FIRST_LEVEL_AMBUSH_CLIPS[clipId];
    if (!spec) { this.ambushAnimationError ||= "missing ambush clip " + clipId; return; }
    actor.missionAmbushClip = { clipId, seconds: 0, loop: !!spec.loop };
  }
  UpdateAmbushClips(dt) {
    for (const actor of this.Ambushers) {
      const clip = actor.missionAmbushClip;
      if (!clip) continue;
      clip.seconds += dt;
      const spec = FIRST_LEVEL_AMBUSH_CLIPS[clip.clipId];
      if (!clip.loop && spec && clip.seconds >= spec.duration) actor.missionAmbushClip = null;
    }
  }
  /**
   * 走到**正好那个点上**再出手。
   *
   * 共用 `MoveActor` 的到达半径是 0.45 m（行军够用），而这一拍要的是「刺刀落在人身上」：
   * 差这 0.45 m，捅老周那一刀就扎在担架北边的地板上（2026-09-16 逐帧量刀尖量出来的）。
   * 做法是把目标沿他的来向再推 0.45 m —— 他照旧在 0.45 m 处停，停的位置正好是要的那个点。
   * 不去调 `scriptArrivalRadius`：那个半径一小，人到了点上会来回蹭。
   */
  DriveAmbusherOnto(actor, point, speed) {
    if (!actor?.alive) return;
    const dx = point.x - actor.position.x, dz = point.z - actor.position.z;
    const distance = Math.hypot(dx, dz);
    const past = distance > 0.05
      ? { x: point.x + dx / distance * SCRIPT_ARRIVAL_M, z: point.z + dz / distance * SCRIPT_ARRIVAL_M }
      : point;
    this.DriveAmbusher(actor, past, speed);
  }
  DriveAmbusher(actor, point, speed) {
    if (!actor?.alive) return;
    this.MoveActor(actor, point, speed);
    // 演这一拍的时候不许去找掩体：屋里正好有新加的西侧隔断，实拍里捅抬担架的那个
    // 走到一半拐去躲在它后面，刀就落了个空。
    this.ai.ReleaseCover(actor);
    actor.scriptFireSector = R.ambushSilentSector;
    actor.bayonetFixed = true;
  }
  /**
   * 剧本期间的走位：领头那个扑向玩家（lunge 段），顶住之后原地不动；后面两个走到担架旁边。
   * 捅老周的那个（AmbushRearB）会站在担架西侧等到配音里那一声为止；那一刀落在锁住的
   * witness 段里，挣脱之后他才转普通敌兵，所以他的走位要越过 Scripted 那一段继续驱动。
   */
  DriveAmbushPerformers() {
    const zhou = this.column.zhou, lead = this.AmbushActor("AmbushLead");
    if (this.ambush.Scripted && lead?.alive) {
      if (this.ambush.Phase === "lunge") this.DriveAmbusher(lead, this.player.position, R.ambushLungeMps);
      else if (this.ambush.Phase === "daze") {
        // 躺着看的那几秒他挪到玩家**东侧**：他扑过来的落点正好压在「玩家 → 北门口担架」
        // 那条视线上，站着不动就把整场背景挡死了（2026-09-16 出图实拍）。
        this.DriveAmbusher(lead, { x: this.player.position.x + R.ambushDazeStandM,
          z: this.player.position.z + R.ambushDazeStandM * .45 }, R.ambushLungeMps * .5);
      } else this.DriveAmbusher(lead, lead.position, 0);
      lead.yaw = Math.atan2(lead.position.x - this.player.position.x, lead.position.z - this.player.position.z);
    }
    if (!zhou) return;
    const yaw = zhou.yaw || 0;
    const Grip = side => ({ x: zhou.x - Math.sin(yaw) * side * R.litterBearerOffsetM,
      z: zhou.z - Math.cos(yaw) * side * R.litterBearerOffsetM });
    const rearA = this.AmbushActor("AmbushRearA");
    if ((this.ambush.Scripted || rearA?.missionAmbushClip) && rearA?.alive) {
      const victim = zhou.bearers[1] > 0 ? Grip(1) : Grip(-1);
      this.DriveAmbusherOnto(rearA, { x: victim.x - R.ambushBindReachM, z: victim.z }, R.ambushLungeMps);
      rearA.yaw = Math.atan2(rearA.position.x - victim.x, rearA.position.z - victim.z);
    }
    const rearB = this.AmbushActor("AmbushRearB");
    // 条件里那个 missionAmbushClip 不能省：ZhouPending 在刀落那一瞬就翻掉，而
    // BayonetStabDown 的下扎（0.62 s）、拧刀（0.80）、拔出（1.08）还有大半段没演完。
    // 一松手共用 AI 就按 `moveSpeed<0.08 → 面向目标` 把他转走，刀在半空里划一道弧，
    // 从老周肚子上扫到门口去（2026-09-16 逐帧量刀尖：0.5 s 里转了 30°）。
    if ((this.ambush.ZhouPending || rearB?.missionAmbushClip) && rearB?.alive) {
      // 站在担架西侧、**刺刀够得到床面正中**的地方（ambushZhouStabStandM）。
      // 原来沿用 ambushBindReachM(1.15)：那是扑过来够得着的距离，往下捅就捅在担架外
      // 一米的地板上 —— 从地板镜头看过去他是在捅地，不是在捅老周。
      const stab = { x: zhou.x - R.ambushZhouStabStandM, z: zhou.z + R.ambushZhouStabLateralM };
      this.DriveAmbusherOnto(rearB, stab, R.ambushLungeMps);
      // 面向担架的**中线**（与担架长边垂直），不是对着担架中心：错开那 0.7 m 是给刀尖留的，
      // 对着中心的话他会斜着站，刀尖跟着斜出去，等于白错开。
      const facing = { x: zhou.x, z: rearB.position.z };
      rearB.yaw = Math.atan2(rearB.position.x - facing.x, rearB.position.z - facing.z);
    }
  }
  /**
   * 枪托真的砸到：先掉血（kind "qte" 绕开 meleeScale，控制锁期间必须真的掉血），
   * 再走共用倒地 —— 玩家真的进 `down` 状态，第一人称镜头落到地板上、抬头看屋顶。
   *
   * 砸之前把刺刀挂到 player.meleeWeapon 上：共用白刃层的倒地／地面僵持／地面镜头
   * 全都要求「手里有一把白刃武器」（`MeleeCombat.Weapon` 先问宿主，再回落到这个字段），
   * 而这一刻顺子手里是拉栓步枪。顶上来的本来就是**对方那把上了刺刀的枪** ——
   * 抓住它、推开它、反手捅回去这三下都发生在那把枪上。起身之后这个字段就摘掉。
   */
  AmbushButtStrike() {
    const lead = this.AmbushActor("AmbushLead");
    if (!lead || !this.player.alive) return false;
    this.meleeCombat.Damage(this.player, lead, R.ambushButtDamage, "qte",
      { yaw: lead.yaw, reach: R.ambushBindReachM });
    if (!this.player.alive) return false;
    this.ambushBorrowedWeapon = this.player.meleeWeapon ?? null;
    this.player.meleeWeapon = "Bayonet";
    this.meleeCombat.ScriptedKnockDown(this.player, lead, R.ambushLockMaxS, "missionAmbush");
    this.SetAmbushViewmodel(false);
    return true;
  }
  /**
   * 躺在地上那几秒把第一人称的枪收起来：挨了一记枪托，枪本来就脱手了 ——
   * 而且它正好挡在「玩家 → 北门口担架」那条视线上，担架队被捅穿的整场背景全被它盖住。
   * 抓住**对方**那把枪的时候再回来（抓枪／推刀／反捅这三下画的就是那把枪）。
   */
  SetAmbushViewmodel(visible) {
    const root = this.viewmodel?.root;
    if (!root) return false;
    root.visible = !!visible && !this.carry?.Blocking;
    return true;
  }
  /** 他扑上来压刺刀：交回共用白刃层摆 Pressure 姿势（还不给连按）。 */
  AmbushPounce() {
    const lead = this.AmbushActor("AmbushLead");
    if (!lead?.alive || !this.player.alive) return false;
    // 扑完了才把他交给共用白刃层：从这一刻起他的整帧走 StepMeleeCombat。
    lead.meleeDormant = false;
    this.SetAmbushViewmodel(true);
    return this.meleeCombat.HoldScriptedGround(this.player, lead, R.ambushLockMaxS);
  }
  /** 推刀：共用地面 QTE。窗口取共用上限与本拍值里小的那个，共用规则一个字不改。 */
  BeginAmbushGround() {
    const lead = this.AmbushActor("AmbushLead");
    if (!lead?.alive || !this.player.alive) return false;
    const windowS = Math.min(Q.windowS, R.ambushQteWindowS);
    const started = this.meleeCombat.BeginScriptedGround(this.player, lead, {
      windowS, strength: R.ambushQteStrength, reason: "missionAmbush",
    });
    if (started) this.ambushQteSerial = this.meleeCombat.qte.active.serial;
    return started;
  }
  EndAmbushGround() {
    return this.meleeCombat.EndScriptedGround(this.player, this.AmbushActor("AmbushLead"));
  }
  /**
   * 没顶住：刀捅进去。共用地面失败伤害（MELEE_QTE_RULES.groundFailureDamage）
   * 只有「抓枪那一下没按上」才由这里补 —— 推刀输掉的那条路共用 ResolveQte 已经扣过了。
   * 额外的 ambushFailureExtraDamage 两条路都要扣：20 + 72 + 18 = 110，满血也死。
   */
  AmbushGroundFailure(shared = false) {
    const lead = this.AmbushActor("AmbushLead");
    if (!this.player.alive) return false;
    const from = lead?.position?.clone?.() || null;
    if (shared) this.player.TakeHit(Q.groundFailureDamage, "torso", null, { melee: true, from });
    if (this.player.alive) this.player.TakeHit(R.ambushFailureExtraDamage, "torso", null, { melee: true, from });
    return true;
  }
  /** 反捅：领头那个真的死在这一下上，走共用伤害链（出血、断肢、尸体、白刃音效照常）。 */
  AmbushFinisher() {
    const lead = this.AmbushActor("AmbushLead");
    if (!lead?.alive) return false;
    // 摘掉叙事保护再捅：挂着它伤害会被夹到 1 血，断肢与血也整条不走。
    lead.scriptEssential = false;
    this.meleeCombat.Damage(lead, this.player, R.ambushFinisherDamage, "heavy",
      { yaw: this.player.yaw, reach: R.ambushBindReachM });
    return true;
  }
  /**
   * 起身：共用起身动作。借来的刺刀等**起完身**再还 —— 当场还的话共用层下一步
   * 会认成「换了武器」，一句 SetState(idle) 把起身动作砍掉一半。
   */
  AmbushRise() {
    this.SetAmbushViewmodel(true);
    this.meleeCombat.ScriptedRise(this.player);
    if (this.ambushBorrowedWeapon !== undefined) this.ambushRestoreAt = this.time + MELEE_RULES.riseS + 0.15;
    return true;
  }
  RestoreAmbushWeapon() {
    this.ambushRestoreAt = null;
    if (this.ambushBorrowedWeapon === undefined) return false;
    this.player.meleeWeapon = this.ambushBorrowedWeapon;
    this.ambushBorrowedWeapon = undefined;
    return true;
  }
  /**
   * 倒地较劲那几拍（grab/mash/finish）把第一人称那把枪连同扣在它上面的两只手整体挪开。
   * 数值与理由见 `Data_Tuning_FirstLevel.ambushGrappleHandM`；实现见 `Viewmodel.SetScriptedHandOffset`。
   * 幂等：每帧调，只有真的换了状态才写下去。演完必须收（HideAmbushers / ResetAmbush / 收尾都收）。
   */
  SetAmbushHandOffset(on) {
    const view = this.viewmodel;
    if (typeof view?.SetScriptedHandOffset !== "function") return false;
    const want = on === true;
    if (this.ambushHandOffset === want) return false;
    this.ambushHandOffset = want;
    view.SetScriptedHandOffset(want ? R.ambushGrappleHandM : null);
    return true;
  }
  /**
   * 压上来那个人**被画出来**的脸在哪。
   *
   * 不能拿 `soldier.position` 加一个高度了事：烘焙 clip（RifleButtStrike）带位移，
   * 人被画在离那个点半米开外的地方 —— 参考图①那一帧他因此偏到画面右边缘去了
   *（2026-09-16 分层出图量到 ndc 0.23 vs 实际 0.6）。头骨的世界位置才是画面上的脸。
   */
  AmbushFacePoint(actor) {
    const head = actor?.actor?.characterRig?.bones?.head;
    if (head?.matrixWorld) {
      head.updateWorldMatrix(true, false);
      const point = new THREE.Vector3().setFromMatrixPosition(head.matrixWorld);
      if (Number.isFinite(point.x) && Number.isFinite(point.y)) return point;
    }
    return actor ? this.Point(actor.position, R.ambushButtLookHeightM) : null;
  }
  /**
   * 锁着的视线**跟着会动的目标走**：只换落点，不重开转头那一段。
   *
   * 与 AimControl 的区别就在这里：AimControl 每调一次都把 startYaw / lookFrom 重置成
   * 「现在」，每帧调等于每帧重开一段 0.35 s 的 smoothstep —— 相机每帧只走千分之几，
   * 看上去像钉死了。这一条只改终点，转头那一段照原样走完，走完之后交回 ±limitedLookRadians
   * 的夹取（夹的中心也跟着他走）。
   */
  TrackControl(kind, lookAt) {
    const control = this.controls;
    if (!control || control.kind !== kind || !lookAt) return false;
    const eye = this.ControlEye();
    control.yaw = Math.atan2(eye.x - lookAt.x, eye.z - lookAt.z);
    control.pitch = Math.atan2(lookAt.y - eye.y, Math.hypot(lookAt.x - eye.x, lookAt.z - eye.z));
    return true;
  }
  /**
   * 锁着的视线换一个落点："lead" 压住自己那个人、"litter" 北门口那副担架、
   * "face" 抡枪托那个人的**脸**（这一段按 ambushButtImpactS 铺，转头正好在砸中那一瞬走完，
   * 期间每帧由 TrackControl 把落点更新成他被画出来的头骨位置）。
   */
  /** 躺着仰头看的那根屋梁在哪：自己正前方 ambushDazeLookAheadM 处、ambushDazeLookRiseM 高。 */
  AmbushRoofPoint() {
    const eye = this.player.EyePosition, yaw = this.player.yaw;
    return this.Point({ x: eye.x - Math.sin(yaw) * R.ambushDazeLookAheadM,
      z: eye.z - Math.cos(yaw) * R.ambushDazeLookAheadM }, R.ambushDazeLookRiseM);
  }
  AmbushLookAt(what) {
    if (what === "roof") return this.AimControl("ambush", this.AmbushRoofPoint(), R.ambushDazeLookS);
    if (what === "face") {
      const lead = this.AmbushActor("AmbushLead");
      const face = this.AmbushFacePoint(lead);
      if (!face) return false;
      return this.AimControl("ambush", face, R.ambushButtImpactS);
    }
    if (what === "litter") {
      const zhou = this.column.zhou;
      if (!zhou) return false;
      return this.AimControl("ambush", this.Point({ x: zhou.x, z: zhou.z }, R.ambushLitterLookHeightM), R.ambushLookSeconds);
    }
    const lead = this.AmbushActor("AmbushLead");
    if (!lead) return false;
    return this.AimControl("ambush", this.Point(lead.position, R.ambushLookHeightM), R.ambushLookSeconds);
  }
  // --- 晕厥与恍惚 ------------------------------------------------------------
  // 与开场出轨那一段同一套通道：眼皮（uEyeClosure）＋ 恍惚四元组（uConcussion）
  // 走 Script_PostComposite，耳鸣走 AudioEngine.SetConcussion 的低通。
  // 曲线形状照搬 OPENING_PERCEPTION，只把横轴压到这一拍的长度上（Data_Tuning_FirstLevel）。
  SetAmbushDaze(on) {
    if (on) { this.ambushDazeFade = null; return true; }
    if (this.ambushDazeFade == null && this.ambush.DazeSeconds != null) this.ambushDazeFade = 0;
    return true;
  }
  /** 每帧取样；还控制权之后按 ambushDazeFadeS 线性收干净，不是一刀切掉。 */
  UpdateAmbushDaze(dt) {
    const age = this.ambush.DazeSeconds;
    if (age == null) { this.ClearAmbushDaze(); return; }
    if (this.ambushDazeFade != null) this.ambushDazeFade += Math.max(0, dt);
    const fade = this.ambushDazeFade == null ? 1
      : Math.max(0, 1 - this.ambushDazeFade / Math.max(1e-6, R.ambushDazeFadeS));
    if (fade <= 0) { this.ClearAmbushDaze(); return; }
    this.ambushDaze = {
      eyeClosure: SamplePerceptionCurve(R.ambushDazeEyelids, age) * fade,
      amount: SamplePerceptionCurve(R.ambushDazeIntensity, age) * fade,
      focus: SamplePerceptionCurve(R.ambushDazeFocus, age) * fade,
      pitch: 0, roll: 0,
    };
    const hearing = SamplePerceptionCurve(R.ambushDazeHearing, age) * fade;
    if (hearing !== this.ambushHearing) this.audio?.SetConcussion?.(hearing, R.ambushDazeLowHz);
    this.ambushHearing = hearing;
  }
  ClearAmbushDaze() {
    if (!this.ambushDaze && !this.ambushHearing) return;
    this.ambushDaze = null;
    this.ambushDazeFade = null;
    if (this.ambushHearing) this.audio?.SetConcussion?.(0, R.ambushDazeLowHz);
    this.ambushHearing = 0;
  }
  /**
   * 这一帧的感知（眼皮 + 恍惚）。装配层只问这一个口，不必知道是开场出轨还是屋内伏击。
   * 两边不会同时发生；真同时出现时取更重的那一份，不做叠加。
   */
  Perception() {
    const opening = { eyeClosure: this.opening.eyeClosure || 0, concussion: this.opening.concussion || null };
    const daze = this.ambushDaze;
    if (!daze) return opening;
    if ((opening.concussion?.amount || 0) > daze.amount) return opening;
    return { eyeClosure: Math.max(opening.eyeClosure, daze.eyeClosure), concussion: daze };
  }
  // --- 提示环 ----------------------------------------------------------------
  // 屏幕上只有一个环，钉在压上来那把枪上。它不是共用的底部僵持进度卡：
  // 这一拍整段 HUD 都让位（只剩字幕），一张四行的卡会把这一刻拉回「看仪表」。
  SetAmbushPrompt(view) { this.ambushPrompt = view ? { ...view } : null; return true; }
  /** 装配层每帧读一次：加上键面字与屏幕锚点。没有提示就是 null。 */
  AmbushPromptView() {
    const view = this.ambushPrompt;
    if (!view || !this.player.alive) return null;
    return { ...view, key: ActionKeyGlyph(view.action), ...this.AmbushPromptAnchor() };
  }
  /**
   * 环钉在哪：把压上来那个人的握枪点投到屏幕上，再夹进安全区。
   * 投不出来（人没了、在镜头背后）就退回屏幕中心偏下一点 —— 提示必须看得见，
   * 宁可位置不准也不能跑到屏幕外面去。
   */
  AmbushPromptAnchor() {
    const width = globalThis.innerWidth || 1280, height = globalThis.innerHeight || 720;
    const fallback = { x: width / 2, y: height * 0.54 };
    const lead = this.AmbushActor("AmbushLead"), camera = this.player.camera;
    if (!lead?.alive || !camera || typeof THREE?.Vector3 !== "function") return fallback;
    // 环钉在**他手里那把枪的握把**上（模型规范系的原点＝右手握点，由 Actor.WeaponWorldPoint 报）。
    // 拿不到（枪被藏起来、还没挂上挂点）才退回胸口高度 —— 提示宁可位置不准也不能没有。
    const scratch = (this.ambushAnchorPoint ||= new THREE.Vector3());
    const point = lead.actor?.WeaponWorldPoint?.(scratch)
      || scratch.set(lead.position.x, (lead.position.y || 0) + R.ambushLookHeightM, lead.position.z);
    point.applyMatrix4(camera.matrixWorldInverse);
    if (point.z >= 0) return fallback;                      // 在镜头背后：屏幕坐标会翻面
    point.applyMatrix4(camera.projectionMatrix);
    const x = (point.x * 0.5 + 0.5) * width, y = (-point.y * 0.5 + 0.5) * height;
    if (!Number.isFinite(x) || !Number.isFinite(y)) return fallback;
    // 落在安全区外就退回屏幕中央，**不夹到边角**：视线正从担架转回他身上的那零点几秒里，
    // 他的胸口还在画面外，夹取会把环钉在右上角——玩家读到的是「提示在别的地方」。
    const margin = 110;
    if (x < margin || x > width - margin || y < margin || y > height - margin) return fallback;
    return { x, y };
  }
  /**
   * 提示环的按键。装配层的输入捕获先问这一条，再轮到共用白刃层 ——
   * 抓枪那一下与反捅那一下都发生在共用 QTE 还没开（或已经结算完）的时候，
   * 不接管的话 F 会去拾弹药、左键会去开枪。
   * @returns {boolean} true = 这一下被这一拍吃掉了
   */
  AmbushInput(code, down = false, repeat = false) {
    const view = this.ambushPrompt;
    if (!view || !this.player.alive) return false;
    // 连按那一段的 F 归共用 QTE（MeleeCombat.HandleInput 接管），这里不拦。
    if (view.mode === "mash") return false;
    const expected = view.action === "fire" ? "Mouse0" : "KeyF";
    if (code !== expected) return false;
    if (down && !repeat) {
      if (view.mode === "finisher") this.ambushFinisherPressed = true;
      else if (view.mode === "press") this.ambushGrabPressed = true;
    }
    return true;
  }
  AmbushCasualty(victim) {
    const applied = this.column.AmbushCasualty(victim, { zhouHealth: R.ambushZhouHealthAfter });
    if (victim === "zhou") {
      // 这一刀落完，捅他的那个才回到普通战斗。
      if (this.Has("ambushBroken")) this.ReleaseAmbusher(this.AmbushActor("AmbushRearB"));
      this.view.people?.SetAmbushClip?.(this.column.zhou?.id, "PatientStabbed", "PatientWoundedIdle");
    } else if (applied) {
      this.view.people?.SetAmbushClip?.(`BearerCasualty${victim === "frontBearer" ? 1 : 0}`, "BearerStabbed", null);
    }
    return applied;
  }
  AmbushKnockDown(who) {
    const actor = this.companion.Handle(who);
    if (!actor?.alive) return false;
    // 共用倒地规则只认手里有白刃武器的人；幺娃背的是汉阳造，所以按倒地姿态演，
    // 先照样调一次共用接口，它拒绝也不影响这一拍。
    this.meleeCombat.KnockDown(actor, this.AmbushActor("AmbushLead"), "missionAmbush");
    actor.missionAmbushDownUntil = this.time + R.ambushYaowaDownS;
    this.ai.SetStance(actor, 2, R.ambushYaowaDownS, true);
    this.MoveActor(actor, actor.position, 0);
    return true;
  }
  ReleaseAmbusher(actor) {
    if (!actor?.alive) return null;
    actor.scriptEssential = false;
    actor.missionDormant = false;
    actor.meleeDormant = false;
    actor.meleeTraining = null;
    actor.missionAmbushClip = null;
    // 射界**不摘**：这一场从头到尾是屋里两三米的白刃。三八式一枪 72 点，
    // 挨过一刀（剩 76 血）的顺子被点名就是一枪死，而且贴着脸端枪瞄准本来就不合理 ——
    // 罗班长自己的命令就是「进！上刺刀！看准了打，里头有自己人！」。
    // 走位与出手交给共用白刃规则（Script_MeleeCombat 的 NpcThink），伤害是刺刀的 50/110。
    actor.tacticalRadiusM = R.infantryTacticalRadiusM;
    this.Defend(actor, A.melee, R.ambushRoomHoldRadiusM);
    actor.scriptFireSector = R.ambushSilentSector;
    actor.bayonetFixed = true;
    this.ai.SetStance(actor, 0, 1.5, true);
    return actor;
  }
  /**
   * 挣脱：四个人排着队转成普通敌兵，不是同一瞬间一起压上来。
   * 顶住玩家那个就在眼前（0 秒），刚从抬担架的身上拔出刺刀那个晚 ambushReleaseDelayS，
   * 东南角那个还要绕过货箱堆，捅老周的那个要等自己那一刀落完。
   */
  ReleaseAmbushers() {
    for (const actor of this.Ambushers) {
      if (!actor.alive) continue;
      actor.missionAmbushReleaseAt = this.time + (actor.missionId === "AmbushLead" ? 0
        : actor.missionId === "AmbushFlank" ? R.ambushFlankReleaseS : R.ambushReleaseDelayS);
    }
    this.UpdateAmbushRelease();
    this.hud.Hint?.(T("firstLevel.hint.melee"), R.ambushBreakHintS);
  }
  UpdateAmbushRelease() {
    const released = [];
    for (const actor of this.Ambushers) {
      if (!actor.alive || actor.missionAmbushReleaseAt == null || this.time < actor.missionAmbushReleaseAt) continue;
      if (actor.missionId === "AmbushRearB" && this.ambush.ZhouPending) continue;
      actor.missionAmbushReleaseAt = null;
      const entry = this.ReleaseAmbusher(actor);
      if (entry) released.push(entry);
    }
    if (released.length) this.meleeCombat.ClearQteBudget(released);
  }
  /** 罗班长、何有田、刘文财穿灶屋进屋。走既有的 squadRoutes 与共用行进节奏。 */
  SendAmbushSquad() {
    for (const [index, actor] of this.AmbushSquad.entries()) {
      const entry = P.ambushSquadEntry[index] || P.ambushSquadEntry.at(-1);
      const lane = P.ambushSquadLanesM[index] ?? 0;
      actor.missionAmbushEntry = { ...entry };
      actor.missionAmbushPost = null;
      this.squadRoutes.set(actor.id,
        [...P.ambushSquadRoute.map((point, step) => ({ x: point.x + lane * step / 2, z: point.z })), { ...entry }]);
    }
    this.RebuildSquadMarch(MISSION_ROUTES.village.slice(1, 4));
  }
  FinishAmbush() {
    this.RestoreAmbushWeapon();
    this.SetAmbushHandOffset(false);
    for (const actor of this.Ambushers) this.SetAmbushWeaponDetail(actor, false);
    this.column.AmbushRecover();
    const yaowa = this.companion.Handle("yaowa");
    if (yaowa) yaowa.missionAmbushDownUntil = 0;
    this.SaveCheckpoint();
  }
  ReleaseAmbushControl() {
    if (this.controls?.kind !== "ambush") return;
    const kind = this.controls.kind;
    this.controls = null;
    this.Control?.(false, kind);
  }
  /**
   * 罗班长他们在灶屋北门口掩护；幺娃跟着担架到屋门口（罗班长的命令：幺娃跟他）。
   * 村口这一段一路向南（+Z），所以已经走过的折点要丢掉 —— 调试跳转把人直接放在
   * 站位上时，留着它们会让整队先往回走六米。
   */
  PostAmbushSquad() {
    const kitchen = P.kitchenInterior, room = P.roomInterior;
    const Inside = at => (at.x > kitchen.minX && at.x < kitchen.maxX && at.z > kitchen.minZ - 1.5 && at.z < kitchen.maxZ)
      || this.InRoom(at);
    const Ahead = (actor, points) => {
      // 只有已经站在灶屋／屋里的人（调试跳转直接摆到站位上）才裁前面的折点。
      // 从村口过来的人必须先走 (58,-20) 那个门口，不然直线过去会撞上灶屋西墙。
      if (!Inside(actor.position)) return points.map(point => ({ ...point }));
      const kept = points.filter(point => point.z > actor.position.z - 1).map(point => ({ ...point }));
      return kept.length ? kept : [{ ...points.at(-1) }];
    };
    for (const [index, actor] of this.AmbushSquad.entries()) {
      actor.missionAmbushPost = { ...(P.ambushSquadPosts[index] || P.ambushSquadPosts.at(-1)) };
      actor.missionAmbushEntry = null;
      this.squadRoutes.set(actor.id, Ahead(actor, [{ x: 58, z: -20 }, actor.missionAmbushPost]));
    }
    const yaowa = this.companion.Handle("yaowa");
    if (yaowa) {
      yaowa.missionAmbushDownUntil = 0;
      this.squadRoutes.set(yaowa.id,
        Ahead(yaowa, [{ x: 58, z: -20 }, { x: 58, z: -9 }, { x: 58, z: -2 }, P.ambushYaowaPost]));
    }
    this.RebuildSquadMarch(MISSION_ROUTES.village.slice(0, 3));
    const luo = this.companion.Handle("luo");
    if (luo) this.leaderGuide?.Plan(this.squadRoutes.get(luo.id));
  }
  /** 老周这一副担架跟着顺子进屋，停在屋子北门口；其余九副留在村口。 */
  UpdateLeadLitter(dt) {
    const route = this.column.route;
    const door = MissionRouteProjection(route, { x: A.melee.x, z: R.ambushLitterDoorZ }).progress;
    const follow = MissionRouteProjection(route, this.player.position).progress - R.ambushLitterFollowGapM;
    const rushing = this.flow.stage.id === "Melee";
    this.column.UpdateLead(dt, {
      limit: Math.min(door, follow),
      speed: rushing ? R.ambushLitterRushMps : R.ambushLitterLeadMps,
      safe: rushing || !this.Threatens(this.column.zhou, null, .9),
    });
  }
  UpdateAmbush(dt) {
    const lead = this.AmbushActor("AmbushLead");
    const living = this.Ambushers.filter(actor => actor.alive);
    // 屋里全程上着刺刀、不开枪：剧本旗每帧补一次，共用 AI 的守点/冲锋分支会清掉它们。
    if (this.ambush.Started) for (const actor of living) {
      actor.bayonetFixed = true;
      actor.scriptFireSector = R.ambushSilentSector;
    }
    // 捅老周的那个在递刀途中被打死：这一拍照常落地。刀已经推出去了，而且
    // RoomAmbushCleared 的台词（「肚子……遭捅穿了……」）与老周后面几级血量台阶
    // 都建立在他挨了这一刀上 —— 让玩家在这两秒里把他打死就取消整条线，是更糟的结果。
    const rearB = this.AmbushActor("AmbushRearB");
    if (this.ambush.ZhouPending && this.Has("ambushStabbed") && rearB && !rearB.alive) this.ambush.CueZhouStab();
    if (this.Has("ambushBroken")) this.UpdateAmbushRelease();
    this.UpdateAmbushClips(dt);
    if (this.ambush.Started) this.DriveAmbushPerformers();
    const qte = this.meleeCombat.qte.active;
    const mine = !!qte && qte.serial === this.ambushQteSerial;
    let qteSuccess = null;
    // 推刀输掉那条路的共用伤害（groundFailureDamage）由 MeleeCombat.ResolveQte 扣过了；
    // 这一拍额外那一份在 AmbushGroundFailure 里加，两处不重复。
    if (mine && qte.phase === "resolve" && this.ambushQteResult == null) this.ambushQteResult = qteSuccess = !!qte.success;
    const view = mine ? this.meleeCombat.qte.View() : null;
    const grabPressed = this.ambushGrabPressed === true, finisherPressed = this.ambushFinisherPressed === true;
    this.ambushGrabPressed = false; this.ambushFinisherPressed = false;
    this.ambush.Update(dt, {
      litterAtDoor: this.LitterAtDoor(),
      leadAlive: !!lead?.alive,
      leadDistanceM: lead ? Distance(lead.position, this.player.position) : Infinity,
      grabPressed, finisherPressed,
      qteActive: mine,
      qteSuccess,
      qteProgress: view?.progress ?? 0,
      qteTimeT: view?.timeT ?? 0,
      qtePulse: view?.pulse ?? 0,
      aliveCount: living.length,
      killed: this.Ambushers.length - living.length,
      squadInside: this.AmbushSquad.some(actor => actor.alive && this.InRoom(actor.position)),
      playerAlive: this.player.alive,
      playerProtected: this.player.Protected === true,
    });
    this.UpdateAmbushDaze(dt);
    // 演出层（每帧两件事，都只碰画面，不碰编排）：
    //   1) 扑过来到砸中这一段视线跟着他的脸走 —— 他是跑动中的，落点算一次就会被他甩掉；
    //   2) 倒地较劲那几拍把第一人称那把枪与两只手挪开，让出他的脸和那把刺刀。
    const phase = this.ambush.Phase;
    if ((phase === "lunge" || phase === "butt") && lead?.alive) {
      this.TrackControl("ambush", this.AmbushFacePoint(lead));
    } else if (this.ambush.RoofView) {
      // 躺下去的那半秒眼位从 1.6 m 掉到 groundEyeM：屋梁那个落点要每帧按当前眼位重算，
      // 算一次的话抬头量会少掉四十来度（人在地上，看到的还是地板）。
      this.TrackControl("ambush", this.AmbushRoofPoint());
    }
    this.SetAmbushHandOffset(["grab", "mash", "finish"].includes(phase));
    if (this.ambushRestoreAt != null && this.time >= this.ambushRestoreAt) this.RestoreAmbushWeapon();
  }
  /**
   * 检查点重试落在这一步上。已经挣脱过的保留战果（死掉的不复活、担架队不回滚），
   * 只把锁与僵持清干净；还没挣脱就死了的，整拍重来。
   */
  ResetAmbush() {
    this.meleeCombat.Cancel("missionAmbushRetry");
    this.ambushQteSerial = null;
    this.ambushQteResult = null;
    const yaowa = this.companion.Handle("yaowa");
    if (yaowa) yaowa.missionAmbushDownUntil = 0;
    this.ClearAmbushDaze();
    this.SetAmbushPrompt(null);
    this.SetAmbushViewmodel(true);
    this.SetAmbushHandOffset(false);
    this.ambushGrabPressed = false;
    this.ambushFinisherPressed = false;
    this.RestoreAmbushWeapon();
    if (this.Has("ambushBroken")) {
      if (this.ambush.Phase !== "broken" && this.ambush.Phase !== "resolved") this.ambush.ResumeBroken();
      return;
    }
    const rolled = ["ambushTriggered", "ambushStabbed", "ambushGrabbed",
      "ambushBladeLanded", "ambushFinisher", "zhouStabbed"];
    for (const id of rolled) this.flow.facts.delete(id);
    this.flow.log = this.flow.log.filter(entry => !(entry.kind === "fact" && rolled.includes(entry.id)));
    if (this.ambushColumn) this.column.Restore(this.ambushColumn);
    this.ambush.Reset();
    this.HideAmbushers();
    this.PostAmbushSquad();
  }
  /**
   * 控制锁算视线用的眼位。被枪托砸翻躺在地上的时候（屋内伏击）真正的眼位在地板上方
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
    if(kind==="death"||kind==="dive"||kind==="southTransition")this.player.spawnGrace = Math.max(this.player.spawnGrace || 0, seconds + .5);
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
    this.meal.Restore();
    // The order belongs only to the live carriage barrage. Older checkpoints
    // can omit the impact fact even though the rescue has already completed.
    if(["Train","Unloading"].includes(this.flow.stage.id)&&this.Has("trainProneOrder")
      &&!this.Has("trainNearShellImpact")&&!this.Has("luoRescueComplete")){
      input.stanceRequested="crouch";input.crouchPressed=false;input.pronePressed=false;
    }
    if (this.ReceivingFood) {
      // Hold the exchange in carriage space; normal train translation and free look remain active.
      input.forward = 0; input.strafe = 0; input.sprint = false; input.lean = 0;
      input.crouchPressed = false; input.pronePressed = false; input.stanceRequested = null;
      this.player.velocity.x = 0; this.player.velocity.z = 0;
    }
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
    if(control.kind==="derail"||control.kind==="rescue")this.opening.PlacePlayer();
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
    this.player.yaw = control.yaw + Clamp(yawDelta, -R.limitedLookRadians, R.limitedLookRadians);
    this.player.pitch = Clamp(
      this.player.pitch,
      pitchAim - R.limitedLookRadians,
      pitchAim + R.limitedLookRadians,
    );
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
      || MISSION_RETURN_DISABLED_STAGES.includes(stage.id)
      || (stage.id==="Unloading" && !this.Has("trainStopped"));
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
    if(stage.id==='Unloading') {
      if(!this.Has('trainStopped'))return null;
      if(this.battlefield.TrainContains(this.player.position)) {
        const car=MISSION_TRAIN.cars.slice().sort((a,b)=>Math.abs(a.z-this.player.position.z)-Math.abs(b.z-this.player.position.z))[0];
        target={x:-72,z:car.z};
      }
    }
    if(stage.id==='Tank'){
      const returning=this.Has('bundleTaken')&&this.Inventory().bundles>0;
      const route=returning?MISSION_ROUTES.bundleReturn:MISSION_ROUTES.bundle;
      target=returning?MissionRouteLookahead(route,this.player.position):
        Sortie.route.find((point,index)=>!this.Has(`bundleRoutePoint${index}`))||A.bundle;label=returning?'throw':'bundle';
      if(!returning && this.Near(A.bundle,8))target=A.bundle;
    }
    if(stage.id==='Courtyard' && this.Has('courtyardGateOpen') && this.Threatens(A.gate)) {target={x:A.gate.x,z:A.gate.z+4};label='gateThreat';}
    if(['Carry','FinalCarry'].includes(stage.id)) {
      if(this.carry.Active) {target=stage.id==='Carry'?A.ditchMouth:A.zhouDrop;label=stage.id==='Carry'?'ditch':'place';}
      else {const z=this.column.zhou;target={x:z.x+Math.sin(z.yaw)*1.6,z:z.z+Math.cos(z.yaw)*1.6};}
    }
    if(stage.id==="FinalDefense")target=MissionRouteLookahead(MISSION_ROUTES.exit.slice(0,5),this.player.position);
    if(stage.id==="RetreatYard")target=this.column.litters.filter(litter=>litter.visible && !litter.loaded && !litter.evacuated && litter.health>0).at(-1)||A.retreatC;
    let status=null;
    if(stage.id==='TrenchEntry'&&!this.Has('trenchCleared')) {
      target=MissionRouteLookahead(OPENING.trenchContactRoute,this.player.position);
      label='trenchContact';status=T('firstLevel.hint.trenchContact');
    }
    if(stage.id==='Shelter'&&!this.Has('shelterCornerHeld')) {
      target=OPENING.shelterCorner;label='shelterCorner';status=T('firstLevel.hint.shelterCorner');
    }
    if(stage.id==="MachineGun"&&this.emplacement.Mounted)status=T("firstLevel.hint.guards",{safe:this.guards.filter(g=>g.safe).length,remaining:this.guards.filter(g=>g.actor.alive&&!g.safe).length});
    if(["Courtyard","TransferApproach","Transfer"].includes(stage.id))status=T("firstLevel.hint.queue",{passed:this.column.litters.filter(l=>l.passedGate).length,total:this.column.litters.filter(l=>l.health>0||l.passedGate).length,loaded:this.column.loadEvents.length});
    if(stage.id==="Transfer" && this.transferBeats?.cleared.length && this.transferBeats.started.length===this.transferBeats.cleared.length) {
      target=this.column.QueueAhead()===0?this.column.zhou:this.column.vehicles.find(cart=>!cart.departed)||A.queue;
      label="loading";
      status=T("firstLevel.hint.transferWindow",{loaded:this.column.loadEvents.length,departed:this.column.departed});
    }
    if(stage.id==="FinalDefense")status=T("firstLevel.hint.rearQueue",{remaining:this.column.litters.filter(l=>l.health>0&&!l.zhou&&!l.loaded&&!l.escaped).length});
    return {target,label:T(`firstLevel.guide.${label}`),status};
  }
  Update(dt) {
    if (this.completed || this.failed) return;
    this.delta = dt;
    this.time += dt;
    // 剖析标记（`story/mission/*` 子桶）。装配层没给 profiler 就静默不记 ——
    // 测试夹具直接 new 这个类时不必补一个假的。关着时整条按 null 走，
    // 下面十来处 `prof?.B` 一次判断全短路。
    const prof = this.profiler?.on ? this.profiler : null;
    prof?.B("story/mission/voice");
    this.voice.Update(dt);
    const meal=this.voice.current;
    if(["TrainMeal","TrainPack","TrainBriefing"].includes(meal?.cue.id)&&meal.phase==="playing"){
      if(this.trainClockCue!==meal.cue.id){
        this.trainClockCue=meal.cue.id;
        this.trainCueClockStart=this.time+(this.trainClockLead||0)-meal.sourceTime;
      }
      this.trainClockLead=Math.max(this.trainClockLead||0,this.trainCueClockStart+meal.sourceTime-this.time);
    }
    this.UpdateMusic();
    this.battleSound.Update(dt,this.flow.stage.id,this.voice.current?.phase==="playing");
    prof?.E("story/mission/voice");
    prof?.B("story/mission/train");
    this.train?.Update(dt, this.Has("trainStopped") && this.Has("luoRescueComplete"), this.Has("trainIncomingFire"),this.time+(this.trainClockLead||0),this.Has("trainNearShellImpact"));
    prof?.E("story/mission/train");
    prof?.B("story/mission/voice");
    this.SyncCarriageDialogue();
    prof?.E("story/mission/voice");
    prof?.B("story/mission/other");
    this.opening.Update(dt);
    if(this.failed){prof?.E("story/mission/other");return;}
    if(this.Has("trainProneOrder") && this.player.stance==="crouch")this.Record("trainPlayerProne");
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
    const stage = this.flow.stage.id,
      t = this.flow.stageTime;
    if(["Support","MachineGun","Tank","Orders"].includes(stage))this.UpdateGuards(dt);
    this.UpdateFrontDialogue();
    prof?.E("story/mission/director");
    prof?.B("story/mission/other");
    if (stage === "Death") {
      if (this.deathMedic?.health<=0) {this.deathMedic.treating=false;this.deathMedic=null;this.deathCareRoute=null;}
      const medic=this.deathMedic, zhou=this.column.zhou;
      const helper=medic || this.squad.find(actor=>actor.alive);
      if (helper) {
        const p=medic?helper:helper.position, finish={x:zhou.x-1,z:zhou.z};
        if(!this.deathCareRoute) {
          const ward=P.wardInterior, inWard=p.x>ward.minX&&p.x<ward.maxX&&p.z<ward.maxZ&&p.z>ward.minZ;
          this.deathCareRoute=[...(inWard?[]:MISSION_ROUTES.reception.slice(2)),finish];
        }
        while(this.deathCareRoute.length>1&&Distance(p,this.deathCareRoute[0])<.5)this.deathCareRoute.shift();
        const target=this.deathCareRoute[0],distance=Distance(p,target);
        if(medic){
          const step=Math.min(1,dt*R.medicApproachMps/(distance||1));
          medic.x+=(target.x-medic.x)*step;medic.z+=(target.z-medic.z)*step;
          medic.yaw=Math.atan2(p.x-target.x,p.z-target.z);
          medic.crouch=this.deathCareRoute.length===1&&distance<1.5;
        }else this.MoveActor(helper,target,R.medicApproachMps);
        if(this.deathCareRoute.length===1&&distance<1.2&&!this.Has("deathMedicArrived")){
          this.Record("deathMedicArrived",{helper:medic?.id||helper.castId});
          this.BeginControl("death",R.deathSeconds);
          this.Say("ZhouDeath",{urgent:true});
        }
      }
      const yaowa = this.companion.Handle("yaowa");
      if (yaowa && Distance(yaowa.position, zhou) < 2) this.ai.SetStance(yaowa, 1, 2, true);
    }
    if (this.controls) {
      if(this.controls.kind==="southTransition"){
        this.southTransition.Update(this.controls.time);
        if(this.controls.time>=SOUTH_TRANSITION.fadeOutS && !this.Has("southTransitionPlaced"))this.PlaceSouthArrival();
      }
      this.controls.time = this.controls.kind==="rescue"?this.opening.RescueElapsed():this.controls.time+dt;
      if (this.controls.time >= this.controls.seconds &&
        (this.controls.kind!=="death" || this.voice.finished.has("ZhouDeath"))) {
        const kind = this.controls.kind;
        this.controls = null;
        this.Control?.(false, kind);
        if(kind==="rescue"){
          const luo=this.companion.Handle("luo");if(luo){luo.missionRescueTarget=null;luo.missionCarriageAction=null;}
          this.player.stance="stand";this.Record("luoRescueComplete");
        }
        else if(kind==="southTransition"){
          this.southTransition.Hide();this.Record("southTransitionComplete");
          if(this.Near(A.village,3))this.Record("southTraversed");
        }
        else if (kind === "dive") this.Record("diveComplete");
        else if (kind === "derail") { /* Rescue cue owns release. */ }
        // 兜底：僵持没能按时收尾时也照样还控制权，由编排记 ambushBroken。
        else if (kind === "ambush") this.ambush.Break();
        else {
          this.column.zhou.health = 0;
          if(this.deathMedic){this.deathMedic.treating=false;this.deathMedic.crouch=false;}
          this.Record("deathSceneComplete");
          this.RestoreRifle();
        }
      }
    }
    if (["Train", "Unloading"].includes(stage)) {
      // Audio keeps a real source clock even when a slow frame caps simulation dt.
      // The moving train follows that same meal clock; otherwise it remains tens
      // of metres short and a rendered impact strands the player waiting to stop.
      const rideTime=this.trainShellStartedAt==null?this.time+(this.trainClockLead||0):this.time;
      const motion = MissionTrainMotion(rideTime, this.trainShellStartedAt, this.shellTrainOffset);
      const offset = motion.offsetM;
      const before = this.battlefield.trainOffsetM,
        delta = offset - before;
      const aboard = this.battlefield.TrainContains(this.player.position);
      this.battlefield.SetTrainOffset(offset);
      if (aboard) {
        this.player.position.z += delta;
        this.player.body?.Teleport(this.player.position.x, this.player.position.y, this.player.position.z);
      }
      if (Math.abs(delta) > 1e-9) {
        this.train.Translate(delta);
        if (aboard) this.player.SyncCamera(0);
      }
      if (motion.stopped && !this.Has("trainStopped")) {
        this.Record("trainStopped");
        this.carriageSound.Stopped();
        this.trainStoppedAt = this.time;
        for (let i = 0; i < 3; i++) this.battlefield.OpenGate(`TrainDoor${i}`);
      }
      this.carriageSound.Update(dt);
      if (this.Has("trainStopped") && this.Near(A.unload, 6) && !aboard) this.Record("unloaded");
    }
    if (stage === "Support" && this.Near(A.front, OPENING.frontReachRadiusM)) {
      this.Record("frontReached");
      this.frontArrivalAt ??= this.time;
      this.frontArrivalShots ??= this.Inventory().shots;
      if(this.time-this.frontArrivalAt>=R.frontRifleDefenseSeconds &&
        this.Inventory().shots>this.frontArrivalShots)this.Record("frontRifleDefense");
      this.SpawnEncounter("front");
      this.tank.active = true;
      if ([...this.enemies.values()].some((actor) => actor.lastFire > 0) || this.Inventory().shots > 0)
        this.Record("frontContact");
    }
    if (stage === "MachineGun") {
      this.UpdateCaptivesCutscene();
      if (this.emplacement.stats.shots > 0) this.Record("gunUsed");
      const gun = this.emplacement.Emplacement(this.gunId);
      if (gun?.belts === 3) this.Say("ThreeMagazines");
      if (gun?.belts === 2) this.Say("TwoMagazines");
    }
    if(stage==="Orders" && this.Near(A.orders,5)){this.Record("ordersReached");this.Say("Volunteer");this.Say("ZhouLift");}
    if(stage==="Tank")this.UpdateSortie();
    if(stage==="MachineGun")this.UpdateFrontAttack();
    if (stage === "Village") {
      const p=this.player.position, kitchen=P.kitchenInterior;
      if(p.x>kitchen.minX&&p.x<kitchen.maxX&&p.z>kitchen.minZ&&p.z<kitchen.maxZ)
        this.Record("kitchenTraversed",{x:p.x,z:p.z});
      if(this.Has("kitchenTraversed") && this.Near(A.melee,R.meleeTriggerRadiusM))
        this.Record("innerCourtReached",{viaKitchen:true,x:p.x,z:p.z});
    }
    if (stage === "Melee") this.UpdateAmbush(dt);
    let moving = [
        "Courtyard",
        "TransferApproach",
        "Transfer",
        "RetreatFirst",
        "RetreatWall",
        "RetreatYard",
        "Reception",
      ].includes(stage),
      safe = true,
      maxProgress = Infinity;
    let safeAt = null;
    if (stage === "Courtyard") {
      const gun = this.enemies.get("VillageGunner");
      if (gun && !gun.alive) this.Record("villageGunSilent");
      safeAt = point => Distance(point,A.gate) > R.passageRangeM || (this.Has("villageGunSilent") && !this.Threatens(point));
      if (this.Has("courtyardGateOpen") && this.Has("villageGunSilent")) this.Say("CourtyardOpen");
      const pending=this.column.litters.filter(litter=>litter.health>0&&!litter.passedGate);
      if(this.column.zhou.passedGate)this.Say("ZhouThreshold");
      if(pending.length===2)this.Say("TwoLitters");
      if(pending.length===0){
        this.Record("courtyardPassed",{passed:this.column.litters.filter(litter=>litter.passedGate).length,
          casualties:this.column.litters.filter(litter=>litter.health<=0&&!litter.passedGate).length});
        this.Say("LastLitter");
        this.Say("TransferHope");
      }
    }
    if (stage === "TransferApproach" && this.Near(A.transfer,14)) this.Record("transferApproachReached");
    if (stage === "Transfer") {
      this.UpdateTransferBeats();
      if (this.Near(A.transfer, 14)) {
        this.Record("transferArrived");
        this.column.loading = true;
        this.guideRoute = null;
      }
      const transferIds=MISSION_TRANSFER_BEATS.flatMap(beat=>MISSION_ENCOUNTERS[beat.id].map(spec=>spec.id));
      safe = !this.Threatens(A.transfer,transferIds);
      safeAt=point=>!this.Threatens(point,transferIds);
      if (this.column.TransferReady()) this.Record("vehiclesDeparted", { count: this.column.departed,
        survivingAhead: this.column.litters.slice(0, R.zhouQueueIndex).filter(litter => litter.health > 0).length });
      if (this.column.QueueAhead() === 3) this.Say("TransferQueue");
      if (this.column.QueueAhead() === 2) this.Say("TransferTwo");
      if (this.column.QueueAhead() === 1) this.Say("TransferOne");
      if (this.column.QueueAhead() === 0 && this.Has("transferAttacksResolved") && t >= R.transferSeconds - R.followVehicleLeadS) {
        this.column.BeginZhouBoarding();
        this.Say("FollowVehicle");
        if (Distance(this.column.zhou, this.column.zhouBoardingStart) >= R.boardingWitnessM)
          this.Record("zhouNext");
      }
    }
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
    const retreats = {
      RetreatFirst: [A.retreatA, "retreatFirstPassed"],
      RetreatWall: [A.retreatB, "retreatWallPassed"],
      RetreatYard: [A.retreatC, "retreatYardPassed"],
    };
    if (retreats[stage]) {
      const [position, fact] = retreats[stage];
      safe = !this.Threatens(position);
      safeAt=point=>!this.Threatens(point);
      for (const [id, actor] of this.enemies)
        if (actor.alive && (id.startsWith("Retreat") || id.startsWith("Air"))) {
          const end=MISSION_PURSUIT_ROUTE.findIndex(point=>point.x===position.x && point.z===position.z);
          let index=Math.min(actor.missionPursuitIndex??MissionRouteNextIndex(MISSION_PURSUIT_ROUTE,actor.position),end);
          if(Distance(actor.position,MISSION_PURSUIT_ROUTE[index])<R.tacticalArrivalM && index<end)index++;
          actor.missionPursuitIndex=index;
          const target=MISSION_PURSUIT_ROUTE[index];
          if(Distance(actor.position,target)<R.tacticalArrivalM)this.Defend(actor,target);
          else this.MoveActor(actor,target,R.pursuerSpeedMps);
        }
      const remaining = this.column.litters.filter(
        (litter) => litter.visible && !litter.evacuated && !litter.loaded && litter.health > 0,
      );
      const pass = this.column.RetreatLimit(position) - 12;
      maxProgress = Math.min(this.column.length, pass + remaining.length * R.litterSpacingM + 5);
      if (
        remaining.length &&
        remaining.every((litter) => litter.progress >= pass + 1) &&
        (stage==="RetreatYard" ? this.Near(remaining.at(-1),20) && MissionRouteProjection(this.column.route,this.player.position).progress>=pass-12 : this.Near(position,20))
      )
        this.Record(fact);
    }
    if (stage === "Reception") {
      safe = !this.Threatens(A.reception);
      const remaining = this.column.litters.filter(
        (litter) => litter.visible && !litter.evacuated && !litter.loaded && litter.health > 0,
      );
      if (remaining.length && remaining.every((litter) => litter.received) && this.Near(A.reception, 24))
        this.Record("receptionPassed");
    }
    if (stage === "FinalDefense") {
      safe = !this.Threatens(A.rearExit);
      safeAt = point => !this.Threatens(point);
      if (safe) this.Record("rearLaneClear");
      const medics = this.column.walkers.filter((walker) => walker.kind === "medic" && walker.health > 0);
      const litters = this.column.litters.filter(
        (litter) => litter.health > 0 && !litter.zhou && !litter.loaded,
      );
      if (
        safe && medics.every((walker) => walker.escaped || walker.rearCleared) &&
        litters.every((litter) => litter.escaped || litter.rearCleared)
      )
        this.Record("medicsEscaped", {survivingMedics:medics.length,handoff:MISSION_ROUTES.exit[R.finalHandoffRouteIndex]});
    }
    if (stage === "Exit" && this.Near(A.end, 5)) this.Record("playerAtHandoff");
    this.column.Update(dt, { moving, routeSafe: safe, maxProgress, player: this.player.position, ...(safeAt ? {SafeAt:safeAt} : {}) });
    // 老周这一副担架跟着顺子进屋，停在屋门口；伏击一响就停在原地挨刀。
    if (stage === "Village" || (stage === "Melee" && !this.Has("ambushTriggered"))) this.UpdateLeadLitter(dt);
    this.meal.Update();
    this.view.Update(this.time, { tank: this.tank,player:this.player,camera:this.camera||null });
    this.flow.Update(dt);
    this.leaderGuide?.Update();
    this.hud.SetMissionReturn?.(this.UpdateReturnWarning(dt));
    prof?.E("story/mission/other");
  }
  /**
   * 04 机枪点位的关中过场《空地上的三个人》。
   *
   * 触发：阶段是 MachineGun，且玩家**第一次**走进机枪座
   * （GUN_SEAT，半径 R.captivesCutsceneRadiusM）。阶段切进来时玩家已经在圈里
   * （从检查点或调试跳转进来就是这样）也立刻算数 —— 这一条逐帧查，不挂在 Enter 上。
   *
   * 只播一次：事实 `captivesWitnessed` 记在 flow.facts 里，随检查点快照一起存取
   * （FirstLevelMissionFlow.Snapshot/Restore），所以死亡回到本阶段检查点不会重播。
   * **事实先记再播**：宿主那边回 null 的三种情形（没有过场系统、已经在播一场、
   * 正在换关）都是正常状态，不许因此每帧重试，也不许报错。
   *
   * 播放期间世界整个停摆：装配层的 Frame() 在 `cutscene.Playing` 时只推过场与画面，
   * 玩法（玩家、AI、战车、任务运行时的 Update）一律不跑 —— 所以玩家不会在看戏的
   * 时候被打死，机枪进攻队与战车也不会推进。这里不需要再冻一遍谁。
   *
   * 与班长提醒的顺序：Enter("MachineGun") 先 Say 了 FrontWeaponChoice（「机枪就在
   * 旁边，顺手就接」）。玩家走到枪位时那条多半正在播，所以进场先 Pause、还权后
   * Resume（OnPlayerDown/Retry 用的是同一对），整段提醒一个字不丢、也不会和过场
   * 里的台词压在一起。
   */
  UpdateCaptivesCutscene() {
    if (this.Has("captivesWitnessed") || this.controls) return;
    if (!this.Near(GUN_SEAT, R.captivesCutsceneRadiusM)) return;
    this.Record("captivesWitnessed", { x: this.player.position.x, z: this.player.position.z });
    const pending = this.PlayMidCutscene?.(CAPTIVES_CUTSCENE_ID);
    if (!pending || typeof pending.then !== "function") return;
    this.voice.Pause();
    const Resume = () => this.voice.Resume();
    pending.then(Resume, Resume);
  }
  SaveCheckpoint() {
    this.safePoint = {
      x: this.player.position.x,
      z: this.player.position.z,
      yaw: this.player.yaw,
      stance: this.player.stance,
      trainZ: this.battlefield.TrainContains(this.player.position)
        ? this.player.position.z - this.battlefield.trainOffsetM
        : null,
    };
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
    const z = point.trainZ == null ? point.z : point.trainZ + this.battlefield.trainOffsetM;
    this.player.Spawn(point.x, z, point.yaw);
    // Spawn's generic search treats an exact structural-floor contact as overlap.
    // Reuse the observed checkpoint only when its full capsule still fits.
    const savedPosition = this.Point({ x: point.x, z }, 0.025);
    if (!this.physics.Overlaps(savedPosition.x, savedPosition.y, savedPosition.z, this.player.radius, 1.78)) {
      this.player.position.copy(savedPosition);
      this.player.body?.Teleport(savedPosition.x, savedPosition.y, savedPosition.z);
    }
    this.player.stance = point.stance || "stand";
    this.failed = false;
    this.controls = null;
    this.Control?.(false);
    this.RestoreRifle();
    const stage = this.flow.stage.id;
    if (stage === "Dive") {
      this.BeginControl("dive", R.diveSeconds);
      this.voice.Replay("AircraftReturn");
    } else if (stage === "Death") {
      this.BeginControl("death", R.deathSeconds);
      this.voice.Replay("ZhouDeath");
    } else if(stage==='South'){
      this.flow.facts.delete('southTransitionPlaced');
      this.BeginControl('southTransition',SOUTH_TRANSITION.fadeOutS+SOUTH_TRANSITION.holdS+SOUTH_TRANSITION.fadeInS);
      this.voice.Resume();
    } else if(stage==="Melee"){
      this.ResetAmbush();
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
    this.music.Update(stage, { shellImpact: this.Has("trainFirstShellImpact"),
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
      ...this.flow.State(),
      missionVersion: MISSION_VERSION,
      returnWarning: this.missionReturn.result,
      transferBeats:this.transferBeats || null,
      ambush:{...this.ambush.State(),animationError:this.ambushAnimationError||null,
        litterAtDoor:this.LitterAtDoor(),
        cinematic:this.AmbushCinematic,
        daze:this.ambushDaze?{...this.ambushDaze,hearing:this.ambushHearing||0}:null,
        promptView:this.AmbushPromptView(),
        actors:MISSION_ENCOUNTERS.melee.map(spec=>{
          const actor=this.enemies.get(spec.id);
          return {id:spec.id,alive:!!actor?.alive,x:actor?.position.x??null,z:actor?.position.z??null,
            clip:actor?.missionAmbushClip?.clipId||null};
        })},
      debugStart: this.debugStart || null,
      time: this.time,
      control: this.controls?.kind || null,
      emptyHands: this.EmptyHands,
      receivingFood: this.ReceivingFood,
      meal: this.meal.State(),
      openingPrompt: this.OpeningPrompt(),
      failed: this.failed,
      ordinaryCasualties:this.flow.log.filter(event=>event.id?.startsWith("ordinaryCasualty")).map(event=>event.detail),
      tank: { ...this.tank },
      playerExplosions: this.playerExplosions || [],
      column: this.column.State(),
      people:this.view.people.State(),aftermathCount:this.view.aftermath.count,aftermathTriangles:this.view.aftermath.triangles,
      train: this.train?.State(),
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
    this.leaderGuide?.Dispose();
    this.ClearReturnWarning();
    this.speakingFace?.Reset();
    if(this.ai.ctx.onSoldierDeath===this.soldierDeath)this.ai.ctx.onSoldierDeath=this.oldSoldierDeath;
    this.southTransition.Dispose();
    this.meal.Dispose();
    this.opening.Dispose();
    this.squadMarch?.Dispose();
    if(this.tankDust!=null)this.vfx.RemoveSmokeSource(this.tankDust);
    this.voice.Dispose();
    this.carriageSound.Dispose();
    this.music.Dispose();
    this.battleSound.Dispose();
    this.view.Dispose();
    this.interact.Clear("FirstLevelMission");
    this.emplacement.Clear("FirstLevelMission");
    this.combat.host.onBlast = this.oldBlast;
    this.aircraft.SetManualPose(MISSION_AIRCRAFT_ID, null);
    this.StopAirSound();
    this.Control?.(false);
  }
}
