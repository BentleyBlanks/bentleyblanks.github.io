import * as THREE from "three";
import { OPENING } from "./Data_FirstLevelOpening.mjs";
import { FirstLevelOpening } from "./Script_FirstLevelOpening.mjs";
import { FRONT_DEFENDERS, FRONT_GUARD_POSTS, FRONT_SHELLS, FRONT_ASSAULT, FrontAssaultLane, FrontReserveLane, ClearLaneX } from "./Data_FirstLevelMissionFront.mjs";
import {
  MISSION_STAGES,
  MISSION_TUNING as R,
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
import { PrepareFirstLevelTrainAnimation } from "./Script_FirstLevelTrainAnimation.mjs";
import { FirstLevelMissionFlow } from "./Script_FirstLevelMissionFlow.mjs";
import { TransferBeatReady, GuardCrossingPair, FrontReplacementSlots } from "./Script_FirstLevelMissionPacing.mjs";
import { ApplyFirstLevelStageJump } from "./Script_FirstLevelMissionStageJump.mjs";
import {
  FirstLevelMissionColumn,
  MissionRoutePoint,
  MissionRouteLength,
  MissionGuideSpeed, MissionGuideRoute, MissionSquadRoute, MissionSquadPace, MissionRouteLookahead,
} from "./Script_FirstLevelMissionColumn.mjs";
import { InstallMissionSentry } from "./Script_FirstLevelMissionPeople.mjs";
import { SquadMarchAi } from "./Script_SquadMarchAi.mjs";
import { FirstLevelMissionView } from "./Script_FirstLevelMissionView.mjs";
import { FirstLevelMissionBattleSound } from "./Script_FirstLevelMissionBattleSound.mjs";
import { FirstLevelMissionVoice } from "./Script_FirstLevelMissionVoice.mjs";
import { FirstLevelMissionMusic } from "./Script_FirstLevelMissionMusic.mjs";
import { FirstLevelCarriageSound } from "./Script_FirstLevelCarriageSound.mjs";
import { EmplacementInteraction } from "./Script_Emplacement.mjs";
import { Localize, T } from "./Script_Text.mjs";
import { FirstLevelStageTextId } from "./Script_TextIds.mjs";
// Only for `emplaced`: a man married to a machine gun never carries throwables here.
import { WEAPONS } from "./Data_Weapons.mjs";
const Distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const Clamp = (x, a, b) => Math.max(a, Math.min(b, x));
export class FirstLevelMissionRuntime {
  constructor(host) {
    Object.assign(this, host);
    this.host = host;
    this.time = 0;
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
      Position: (cue) => this.VoicePosition(cue),
      Done: (id) => this.VoiceDone(id),
      Event: (id) => this.VoiceEvent(id),
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
    this.combat.host.onBlast = (event) => {
      this.oldBlast?.(event);
      this.OnBlast(event);
    };
    this.battleSound = new FirstLevelMissionBattleSound(this.audio);
    this.music = new FirstLevelMissionMusic(this.audio);
    this.carriageSound = new FirstLevelCarriageSound(this.audio,()=>this.train?.entries||[]);
    this.musicInitializing = true;
    this.view.interact = this.interact;
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
  /**
   * 一条对白从哪儿传来。
   *
   * 【2026-09-09】兜底那一支原来是**本阶段的目标点**，而目标点是地图上的一个死坐标。
   * 用户报「车厢里大家的对话好像距离都很远，听不清」，实测就是它：`TrainShelling`
   * 十句里第一句的说话人是泛用的 `soldier`（没有 companion handle），于是整条 cue
   * 落在 Unloading 的目标点 (−66, 66) 上 —— 而军列这会儿还在 z=140 往南开，
   * 那是**七十四米外**，引擎按距离给了 occ 0.45 与 2.3 kHz 低通。同一场里
   * `TrainMeal`（说话人是幺娃，有 handle）实测 2 m / occ 0 / 15 kHz，清清楚楚 ——
   * 两者的差别不在素材，在这一行。
   *
   * 现在兜底落到**玩家自己身上**（嘴高，非贴脸）：这一关里没有 handle 的说话人
   * 一律是同一节车厢／同一条壕沟里的人，永远在身边。死坐标只留给真的定点事件。
   *
   * 已知限制：位置按**整条 cue 的第一句**取，多人对话的后几句沿用同一个点。
   * 十句里换四个说话人时那是「一群人在这边说话」，不是四个方位 —— 要逐句定位
   * 得把 `FirstLevelMissionVoice.PlaySegment` 的契约从 cue 改成 line。
   */
  VoicePosition(cue) {
    if(cue.id==="SupportOrder"&&this.opening.runner)return this.Point(this.opening.runner.actor.position,1.3);
    if (cue.id.startsWith("Retreat") || cue.id === "ZhouDeath") return this.Point(this.column.zhou, 1);
    const who = cue.lines[0]?.who;
    if (who === "shunzi") return null;
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
  OpeningPrompt() {
    if (this.controls || !this.EmptyHands || !["Train","Unloading"].includes(this.flow.stage.id)) return null;
    if (this.ReceivingFood) return {keys:T("input.guide.move.look.keys"),
      label:T("firstLevel.hint.receiveFood"),kind:"look",text:true};
    if (this.Has("trainStopped")) return this.player.stance==="prone"
      ? {keys:"Z",label:T("firstLevel.hint.standAndUnload"),kind:"stance",text:true}
      : {keys:"WASD",label:T("firstLevel.hint.leaveTrain"),kind:"move",text:true};
    if (this.Has("trainProneOrder") && this.player.stance!=="prone")
      return {keys:"Z",label:T("firstLevel.hint.trainProne"),kind:"stance",text:true};
    return null;
  }
  VoiceEvent(id) {
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
      return;
    }
    if (id==="TrainFirstShell") {
      if(this.Has("trainFirstShellLaunched"))return;
      this.Record("trainFirstShellLaunched");
      const target={x:-62,z:A.train.z+this.battlefield.trainOffsetM-R.trainShellLeadM-R.trainCruiseSpeedMps*R.trainFirstShellFlightS};
      this.combat.FireShell(new THREE.Vector3(-35,20,target.z-30),this.Point(target),{
        flight:R.trainFirstShellFlightS,kind:"Shell75",radius:6,damage:0,
        OnImpact:()=>{
          this.Record("trainFirstShellImpact");
          this.carriageSound.Impact();
          this.trainShellStartedAt=this.time;
          this.shellTrainOffset=this.battlefield.trainOffsetM;
        },
      });
    }
    if (id==="TrainNearShell") {
      if(this.Has("trainNearShell"))return;
      this.Record("trainNearShell");
      this.combat.FireShell(new THREE.Vector3(-35,20,40),
        this.Point({x:-75,z:MISSION_TRAIN.cars[OPENING.derailCar].z+this.battlefield.trainOffsetM}),{
        flight:2.8,kind:"Shell75",radius:5,damage:0,
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
    if (id === "TrainMeal") this.Record("trainShelling");
    if (id === "TrainShelling") this.Record("unloadOrdersHeard");
    if (id === "EscapeWhisper") this.Record("escapeWhisperHeard");
    if (id === "SupportOrder") this.Record("supportOrdersHeard");
    if (id === "AircraftFirst") this.Record("firstAirOrdersHeard");
    if (id === "CarryZhou") this.Record("carryOrdersHeard");
    if (id === "FinalExit") this.Record("finalExitHeard");
    if (id === "Volunteer") this.Record("volunteerHeard");
    if (id === "ZhouLift") this.Record("zhouOnLitter");
    if (id === "SouthHope") this.Record("southHopeHeard");
    if (id === "FollowVehicle") this.Record("followVehicleHeard");
    if (id === "TransferHope") this.Record("transferHopeHeard");
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
    for (const actor of this.squad) actor.scriptEssential = false;
    const originals = this.squad.filter(actor => actor.castId !== "luo");
    while (originals.length < 6) originals.push(this.ai.Spawn("nra", MISSION_TRAIN.centerX, A.train.z + R.trainTravelM, {
      weapon: "HanYang", scriptedNoncombatant: true, squadId: "MissionTrainOriginals",
    }));
    this.trainWounded = originals[3];
    this.train = new FirstLevelMissionTrain({
      Originals: () => originals, Guide: () => this.companion.Handle("luo"),
      Spawn: (car) => this.ai.Spawn("nra", MISSION_TRAIN.centerX, car.z + this.battlefield.trainOffsetM, {
        weapon: "HanYang", scriptedNoncombatant: true, squadId: "MissionTrain" + car.carIndex,
      }),
      Offset: () => this.battlefield.trainOffsetM,
      Stopped: () => this.Has("trainStopped"),
      PrepareAnimation: actor=>PrepareFirstLevelTrainAnimation(actor,(x,z)=>this.battlefield.GroundHeight(x,z)),
      Place: (actor, point) => { this.PlaceActor(actor, point); actor.yaw = Math.PI / 2; },
      Hold: (actor) => { actor.scriptedNoncombatant = true; this.MoveActor(actor, actor.position, 0); },
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
    actor.scriptArrivalRadius = 0.45;
    const distance = Distance(actor.position, point),
      fraction = distance > 9 ? 8 / distance : 1;
    actor.goal.set(
      actor.position.x + (point.x - actor.position.x) * fraction,
      0,
      actor.position.z + (point.z - actor.position.z) * fraction,
    );
  }
  /**
   * Hold this spot and fight from it.
   *
   * 2026-09-08 (docs/Data_EnemyAi.md §6): this is an **anchor plus a radius**, not a pin.
   * `scriptDefensive` still forbids every manoeuvre task (no chasing, no flanking, no bounding
   * out of the zone) and still owns the firing cadence, but the man may now take a cover point
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
    actor.scriptDefensive = true;
    actor.scriptSuppressible=true;
    delete actor.scriptMoveSpeedMps;
    actor.manualGoalUntil=Infinity;
    actor.scriptAccuracyScale = actor.missionAccuracyScale ?? 0.5;
    actor.scriptFireIntervalScale = actor.missionFireIntervalScale ?? 1.5;
    actor.order = "hold";
    actor.holdZone = { id: "MissionDefense", ...point, radius };
    actor.scriptCoverSlackM = coverSlackM;
    actor.goal.set(point.x, 0, point.z);
  }
  Guide(route, { fromStart = false, resumeAfter = null } = {}) {
    this.squadMarch?.Dispose();
    this.guideRoute = route;
    for (const actor of this.squad) {
      const naturalMarch=[MISSION_ROUTES.support,MISSION_ROUTES.south].includes(route);
      const personalRoute = naturalMarch ? MissionSquadRoute(route,this.squad.indexOf(actor)) : route;
      actor.missionNaturalMarch = naturalMarch;
      actor.missionWatch=null;
      const queued = MissionGuideRoute(actor.position,this.squadRoutes.get(actor.id),route,personalRoute,fromStart,resumeAfter);
      if(route===MISSION_ROUTES.support){
        const post=OPENING.frontPosts[this.squad.indexOf(actor)];
        if(post)queued.push({x:post.x,z:-124},{...post});
      }
      if(!naturalMarch && route!==OPENING.approachRoute && personalRoute.length>1){
        const end=personalRoute.at(-1),before=personalRoute.at(-2),dx=end.x-before.x,dz=end.z-before.z,d=Math.hypot(dx,dz)||1,slot=this.squad.indexOf(actor);
        const lateral=(slot%2?1:-1)*R.squadPostLateralM,back=slot<2?0:R.squadPostRearM;
        const post={x:end.x+dz/d*lateral-dx/d*back,z:end.z-dx/d*lateral-dz/d*back};
        if(!this.BlocksSight(this.Point(end,.7),this.Point(post,.7)))queued.push(post);
      }
      this.squadRoutes.set(actor.id, queued);
    }
    // Role is supplied by the mission roster; the shared controller knows no cast names.
    this.squadMarch=new SquadMarchAi(this.ai,this.squad,{
      route,leaderIndex:0,seed:`FirstLevel:${this.flow.stage.id}`,
      tuning:{speedMps:R.squadSpeedMps,catchupScale:R.squadCatchupMps/R.squadSpeedMps,arrivalM:.45},
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
    const marchSpeeds = new Map();
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
      actor.scriptedNoncombatant = stage === "South";
      const route = this.squadRoutes.get(actor.id);
      while (route?.length && Distance(actor.position, route[0]) < 1.1) route.shift();
      if (route?.length) {
        if (stage === "South" || actor.suppression < 0.4) this.ai.SetStance(actor, 0, 0.5, true);
        const previous = this.squad[this.squad.indexOf(actor) - 1];
        const ahead =
          previous &&
          (previous.position.x - actor.position.x) * (route[0].x - actor.position.x) +
            (previous.position.z - actor.position.z) * (route[0].z - actor.position.z) >
            0;
        const yielding = ahead && Distance(previous.position, actor.position) < R.squadSpacingM;
        let speed=MissionGuideSpeed(actor.position,this.player.position,route[0],actor.missionNaturalMarch?false:yielding,route);
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
      } else if (["TrenchEntry","Shelter"].includes(stage)) {
        this.MoveActor(actor,actor.position,0);this.ai.SetStance(actor,1,.5,true);
      } else if (["Support","MachineGun"].includes(stage)) {
        // Stay inside the reached communication-trench post. A new generic
        // cover search here used to pull the squad onto the exposed parapet.
        const post=this.Has("gunOccupied")?OPENING.frontPosts[this.squad.indexOf(actor)]:actor.position;
        this.Defend(actor,post,0,0);this.ai.SetStance(actor,1,.5,true);
      } else if (stage === "Tank") {
        // The throwing-pocket route has already provided cover. Searching for
        // another point can drag an arrived actor across the blast traverse.
        this.Defend(actor,actor.position,0,0);this.ai.SetStance(actor,1,.5,true);
      } else if (!["Rescue", "Death"].includes(stage)) {
        if(!this.WaitWatch(actor,stage))this.Defend(actor, actor.position);
        if(["Support","MachineGun","Tank"].includes(stage))this.ai.SetStance(actor,1,2);
      }
      if (actor.suppression > 0.65 && stage !== "Train") this.ai.SetStance(actor, 1, 1, true);
    }
    this.squadMarch?.Update(this.delta,{
      player:this.player.position,
      Observe:actor=>({
        route:this.squadRoutes.get(actor.id)||[],
        active:!!actor.missionTrainReady&&!!this.squadRoutes.get(actor.id)?.length
          &&!(actor===this.bedGuide?.actor&&["FinalCarry","Death"].includes(stage)),
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
        squadId: `Mission_${id}`,
        bayonetFixed: !!spec.bayonet,
      });
      if (!actor) {this.spawnQueue.push(()=>this.SpawnEncounterActor(id,spec));return null;}
      actor.missionId = spec.id;InstallMissionSentry(actor);
      actor.missionEncounter=id;
      if(id==="surface"){
        actor.scriptFireSector=OPENING.surfaceSector;
        actor.yaw=Math.atan2(spec.x+62,spec.z-75);
      }
      actor.missionReserve=!!spec.reserve;
      actor.missionReleaseDelayS=spec.releaseDelayS||0;
      if(["village","melee"].includes(id)){actor.missionDormant=true;actor.scriptedNoncombatant=true;}
      if (MISSION_TACTICS[spec.id]) actor.missionTactic = { index: 0, elapsed: 0, hold: 0,
        movingSeconds: 0, distance: 0, last: { x: spec.x, z: spec.z }, shelter: {x:spec.x,z:spec.z}, mode: "cover" };
      // Finite front teams remain ordinary alert AI before the assault starts.
      // Only the later tank-flank group waits for its authored release.
      const standby=["front","tank"].includes(id)&&!spec.id.startsWith("Flank")&&!this.Has("frontBattleStarted");
      if(id==="tank"&&spec.id.startsWith("Flank"))actor.scriptedNoncombatant=true;
      actor.missionFrontStandby=standby;
      if(standby)this.ai.SetStance(actor,1,4+actor.id%3,true);
      actor.scriptAccuracyScale = actor.missionAccuracyScale = ["front","approach"].includes(id)?R.frontAccuracyScale:.5;
      if(spec.reserve)actor.scriptAccuracyScale=actor.missionAccuracyScale=R.frontReserveAccuracyScale;
      actor.scriptFireIntervalScale = actor.missionFireIntervalScale = ["front","approach"].includes(id)?R.frontFireIntervalScale:1.45;
      actor.scriptArrivalRadius = 0.7;
      actor.manualGoalUntil = Infinity;
      actor.order = "hold";
      actor.holdZone = { id: `Mission_${spec.id}`, x: spec.x, z: spec.z, radius: spec.hold ? 0.4 : 2 };
      // Emplaced gunners keep their firing position: the hide/peek side step is all they may do.
      // Everyone else may take cover inside their zone plus the ordinary slack.
      actor.scriptCoverSlackM = spec.hold ? R.defendHoldFixedSlackM : R.defendCoverSlackM;
      // Two Type 91/97 grenades apiece (Data_Tuning_FirstLevel.enemyGrenades). The tactics layer decides
      // when one is worth throwing (target pinned in one place, 8-26 m, squad and personal cooldowns);
      // gunners on an emplacement never throw, they are married to the gun.
      if (!spec.hold && !WEAPONS[spec.weapon || "Type38"]?.emplaced) actor.grenades = R.enemyGrenades;
      if(id==="intrusion")actor.grenades=OPENING.intruderGrenades;
      if (spec.hold) {actor.scriptDefensive=true;actor.scriptSuppressible=true;}
      if (id === "front" && !spec.hold) actor.missionAssault = this.MakeAssault(spec.x, spec.z);
      // Supporting platoons keep their spacing and depth. They remain live combatants
      // while the original line and casualty replacements make the close assault.
      if(spec.reserve && actor.missionAssault)actor.missionAssault.points=FrontReserveLane(spec.x,spec.z);
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
      if (!s || !actor.alive || actor.scriptedNoncombatant || actor.missionFrontStandby) continue;
      if(actor.missionReserve && this.time-(this.frontBattleAt??this.time)<actor.missionReleaseDelayS)continue;
      if (!active) {
        if (s.mode !== "settled") { this.Defend(actor, actor.position); s.mode = "settled"; }
        continue;
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
    for (const actor of this.enemies.values()) if (actor.alive && ["front","approach","tank"].includes(actor.missionEncounter)) alive++;
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
      this.hud.Hint(T(`firstLevel.hint.${plan.hint}`),8);
    }
    const actors=MISSION_ENCOUNTERS[plan.id].map(spec=>this.enemies.get(spec.id));
    if(actors.every(actor=>actor && !actor.alive)) {
      beats.cleared.push(plan.id);beats.previousClearedAt=seconds;beats.index++;
      this.Record(`${plan.id}AttackCleared`,{loaded:this.column.loadEvents.length,departed:this.column.departed});
      this.hud.Hint(T("firstLevel.hint.transferWindow",{loaded:this.column.loadEvents.length,departed:this.column.departed}),8);
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
      () => this.flow.stage.id === "Tank" && (!this.tank.immobilized || !this.Has("bundleTaken")),
      () => {
        const missing = Math.max(0, R.bundleSupplyCount - this.Inventory().bundles);
        if (missing) this.GiveSupply({ bundles: missing });
        this.Record("bundleTaken");
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
        this.GiveSupply({clips:4,grenades:2,bandages:1});
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
      seat: this.Point({ x: 0, z: -127.4 }),
      baseYaw: 0,
      arcYawDeg: 62,
      belts: 4,
      payload:{followSight:true,supportedSeat:true},
      OnOccupy: () => {
        this.Record("gunOccupied");
        for(const [i,actor] of this.squad.entries()){
          actor.scriptEssential=true;this.Defend(actor,P.squadFrontPositions[i]);
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
    // Preserve the later escort story's existing contract; the rebuilt opening
    // earns survival through geometry, movement and ordinary combat damage.
    if(!["Train","Unloading","TrenchEntry","Shelter","Support","MachineGun"].includes(stage.id))
      for(const actor of this.squad||[])actor.scriptEssential=true;
    this.opening.Enter(stage.id);
    this.UpdateMusic(stage.id);
    this.Objective(Localize(FirstLevelStageTextId(stage.id), stage.objective));
    const guardLoss=stage.id==="Tank" && this.guards.filter(guard=>guard.safe && guard.actor.alive).length<R.guardCount;
    if(guardLoss)this.hud.Hint(T(this.guards.some(guard=>guard.safe && guard.actor.alive)?"firstLevel.hint.guardsLoss":"firstLevel.hint.guardsLost"),9);
    if (stage.cue && !guardLoss && !["Courtyard", "Train", "Unloading", "Shelter", "Death"].includes(stage.id))
      this.Say(stage.cue, { urgent: ["AirFirst", "Dive", "Death"].includes(stage.id) });
    switch (stage.id) {
      case "Train":
        this.Say(stage.cue);
        this.battlefield.SetTrainOffset(R.trainTravelM);
        this.PlaceSquad();
        this.PlacePlayerTrain();
        this.carriageSound.Start();
        break;
      case "Unloading":
        this.VoiceEvent("TrainFirstShell");
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
        this.tank.active = true;
        this.SpawnEncounter("tank");
        this.SpawnGuards();
        for (const [i, actor] of this.squad.entries()) this.Defend(actor, OPENING.frontPosts[i],0,0);
        break;
      case "Tank":
        // The blast screen separates the front posts from the far end of the
        // bundle approach. Everyone exits through its central trench junction.
        this.Guide(MISSION_ROUTES.bundle,{fromStart:true});
        break;
      case "Orders":
        this.Guide([...MISSION_ROUTES.bundle].reverse().concat([{x:-8,z:-112},A.orders]));
        this.column.Activate();
        this.column.zhou.health = Math.min(this.column.zhou.health,65);
        this.column.zhou.state = "waiting";
        this.Say("ZhouLift");
        break;
      case "South":
        for (const actor of this.enemies.values()) if (actor.alive) actor.scriptedNoncombatant = true;
        for (const cart of this.column.traffic) cart.visible = true;
        this.audio.Ambience("firstLevelSouth");
        this.Guide(MISSION_ROUTES.south);
        break;
      case "Village":
        for (const actor of this.enemies.values()) if (actor.alive && actor.missionDormant) actor.scriptedNoncombatant = false;
        this.audio.Ambience("firstLevelFront");
        this.Guide(MISSION_ROUTES.village.slice(0, 3));
        this.SpawnEncounter("village");
        this.SpawnEncounter("melee");
        this.tutor = this.enemies.get("MeleeTutor");
        if (this.tutor) {
          this.tutor.meleeTraining = { passive: false, strength: R.meleeStrength };
          this.tutor.bayonetFixed = true;
          this.tutor.scriptedNoncombatant = true;
        }
        this.column.active = true;
        break;
      case "Melee":
        if (this.tutor) {
          this.tutor.scriptedNoncombatant = false;
          // The noncombatant AI stows its bayonet while waiting behind cover.
          this.tutor.bayonetFixed = true;
        }
        this.hud.Hint(T("firstLevel.hint.melee"), 8);
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
        this.StartAir(1);
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
        this.Guide(MISSION_ROUTES.evacuation.slice(0, 4));
        break;
      case "RetreatWall":
        this.SpawnEncounter("retreatWall");
        this.column.zhou.health = 12;
        this.Guide(MISSION_ROUTES.evacuation.slice(3, 7));
        break;
      case "RetreatYard":
        this.SpawnEncounter("retreatYard");
        this.column.zhou.health = 6;
        this.Guide(MISSION_ROUTES.evacuation.slice(6));
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
      if(!guard.safe && (!pair.includes(guard.actor.id) || !(this.Has("gunUsed") || (this.flow.stage.id==="Support" && this.Has("frontReached") && this.guards.indexOf(guard)<OPENING.rifleGuardCount && this.Inventory().shots>this.frontArrivalShots)) || (!guard.crossing && this.time<(this.nextGuardCrossingAt||0)))) {
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
          this.hud.Hint(T("firstLevel.hint.guardCrossed"),5);
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
          (other.actor.position.x-p.x)*dx+(other.actor.position.z-p.z)*dz>0&&
          Math.abs((other.actor.position.x-p.x)*dz-(other.actor.position.z-p.z)*dx)<.65&&
          Distance(other.actor.position,p)<1.4);
        this.MoveActor(guard.actor,target,blocked?0:R.guardSpeedMps);
      } else {
        this.Defend(guard.actor,guard.actor.position);
        this.ai.SetStance(guard.actor,1,1.5);
      }
    }
    if(this.flow.stage.id==="Support" && this.guards.slice(0,OPENING.rifleGuardCount).length===OPENING.rifleGuardCount && this.guards.slice(0,OPENING.rifleGuardCount).every(g=>g.safe||!g.actor.alive))this.Record("rifleWithdrawalResolved",{survived:this.guards.slice(0,OPENING.rifleGuardCount).filter(g=>g.safe).length});
    if (this.guards.length && this.guards.every((guard) => guard.safe || !guard.actor.alive))
      {
        const survived=this.guards.filter(guard=>guard.safe && guard.actor.alive).length;
        this.Record("guardWithdrawalResolved", { survived,casualties:this.guards.length-survived,outcome:survived?"withdrawal":"lost" });
        if(survived)this.Record("guardsSafe",{survived});
      }
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
    if (!this.tank.active || this.tank.immobilized || !byPlayer || explosiveId !== "GrenadeBundle") return;
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
    // A real thrown bundle is also proof of acquisition, including after checkpoint resume.
    this.Record("bundleTaken", { source: "playerBundleBlast" });
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
      actor.scriptedNoncombatant=Distance(actor.position,A.front)>30;
      this.ai.SetStance(actor,0,.4,true);
      this.MoveActor(actor,entry.route[entry.index],R.reliefSpeedMps);
    }
  }
  UpdateTactics(dt) {
    const stage = this.flow.stage.id;
    for (const [id, actor] of this.enemies) {
      const plan = MISSION_TACTICS[id], state = actor.missionTactic;
      if (!actor.alive || !state || actor.scriptedNoncombatant ||
        ((id.startsWith("Air") || id.startsWith("Retreat")) && stage.startsWith("Retreat"))) continue;
      state.distance += Distance(actor.position, state.last);
      state.last = { x: actor.position.x, z: actor.position.z };
      state.elapsed += dt;
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
        if (state.hold >= R.tacticalHoldSeconds) { state.index++; state.hold = 0; }
      } else {
        state.mode = "advance";
        this.ai.SetStance(actor, 0, .4, true);
        this.MoveActor(actor, target, R.tacticalMoveMps);
        state.movingSeconds += dt;
      }
    }
  }
  UpdateFront() {
    for(const actor of this.enemies.values())if(this.flow.stage.id==="Village" && actor.missionId!=="MeleeTutor" && actor.missionDormant && Distance(actor.position,this.player.position)<55){
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
    tank.moving = !tank.immobilized && tank.z < advanceZ && tank.advanceTime % cycle < R.tankAdvanceSeconds;
    if (tank.moving){
      const destination={x:Clamp((tracked?.x??12)+24,R.tankPursuitBounds.minX,R.tankPursuitBounds.maxX),z:advanceZ};
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
    if (Distance(tank,target)>=R.tankCannonMinRangeM && this.time-tank.lastShell>R.tankShellIntervalS && Math.abs(yawGap)<.06) {
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
    if(visible && this.time-tank.targetAcquiredAt>=R.tankMgAcquireS && burst && Math.abs(Math.atan2(Math.sin(mgYaw-tank.hullYaw),Math.cos(mgYaw-tank.hullYaw)))<R.tankHullMgArcRad && this.time-tank.lastMg>R.tankMachineGunIntervalS){
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
  BeginControl(kind, seconds) {
    this.controls = {
      kind,
      seconds,
      time: 0,
      from: { ...this.player.position },
      yaw: this.player.yaw,
      pitch: this.player.pitch,
    };
    if(kind==="death") {
      const zhou=this.column.zhou,eye=this.player.EyePosition;
      const target=this.Point({x:zhou.x-Math.sin(zhou.yaw)*.7,z:zhou.z-Math.cos(zhou.yaw)*.7},R.deathLookHeightM);
      this.controls.startYaw=this.player.yaw;this.controls.startPitch=this.player.pitch;
      this.controls.yaw=Math.atan2(eye.x-target.x,eye.z-target.z);
      this.controls.pitch=Math.atan2(target.y-eye.y,Math.hypot(target.x-eye.x,target.z-eye.z));
    }
    // A restricted short take (dive / death) locks the player's hands and view: nobody may
    // target or wound him meanwhile. Reuses spawn grace so AI and TakeHit read one flag.
    if(kind==="death"||kind==="dive")this.player.spawnGrace = Math.max(this.player.spawnGrace || 0, seconds + .5);
    this.Control?.(true, kind);
  }
  BeforePlayer(dt, input) {
    if (this.ReceivingFood) {
      // Hold the exchange in carriage space; normal train translation and free look remain active.
      input.forward = 0; input.strafe = 0; input.sprint = false; input.lean = 0;
      input.crouchPressed = false; input.pronePressed = false; input.stanceRequested = null;
      this.player.velocity.x = 0; this.player.velocity.z = 0;
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
    if(control.kind==="death" && control.time<R.deathLookSeconds) {
      const t=Clamp(control.time/R.deathLookSeconds,0,1),smooth=t*t*(3-2*t);
      const yaw=Math.atan2(Math.sin(control.yaw-control.startYaw),Math.cos(control.yaw-control.startYaw));
      this.player.yaw=control.startYaw+yaw*smooth;
      this.player.pitch=control.startPitch+(control.pitch-control.startPitch)*smooth;
      return;
    }
    const yawDelta = Math.atan2(
      Math.sin(this.player.yaw - control.yaw),
      Math.cos(this.player.yaw - control.yaw),
    );
    this.player.yaw = control.yaw + Clamp(yawDelta, -R.limitedLookRadians, R.limitedLookRadians);
    this.player.pitch = Clamp(
      this.player.pitch,
      control.pitch - R.limitedLookRadians,
      control.pitch + R.limitedLookRadians,
    );
    if(control.kind==="rescue")this.player.stance=control.time<control.seconds*.45?"prone":control.time<control.seconds*.85?"crouch":"stand";
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
    this.air = { pass, time: -lead, shots: 0, lastShot: 0 };
  }
  UpdateAir(dt) {
    const air = this.air;
    if (!air) return;
    air.time += dt;
    const pass = air.pass,
      z = 65 + air.time * 25,
      x = pass === 1 ? 78 : 56,
      y = pass === 1 ? 30 : 21;
    this.aircraft.SetManualPose("NakajimaKi43", { x, y, z, dirX: 0, dirZ: 1 });
    if (air.time > 1.5 && air.time < 4.9 && air.time - air.lastShot > 0.16) {
      air.lastShot = air.time;
      air.shots++;
      const target = { x: x + ((air.shots % 3) - 1) * 2, z: 95 + (air.time - 1.5) * 17 };
      const from = new THREE.Vector3(x, y, z),
        to = this.Point(target);
      this.vfx.Tracer(from, to, { kind: "ija" });
      this.audio.Play("type92", { position: from, volume: 0.7 });
      if (air.shots % 5 === 0)
        this.combat.FireShell(from, to, { flight: 0.18, kind: "AircraftStrafe", radius: 2, damage: 45 });
      if (Distance(this.player.position, target) < 3 && this.player.stance !== "prone")
        this.player.TakeHit(8, "torso", null, { from });
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
          this.battlefield.OpenGate("TemporaryBridge");
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
      this.aircraft.SetManualPose("NakajimaKi43", null);
      this.air = null;
      if (pass === 1) this.Record("firstAirPassComplete");
      else this.Record("secondAirPassComplete");
    }
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
    if(stage.id==='Tank' && this.Inventory().bundles>0){target=A.throw;label='throw';}
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
    this.voice.Update(dt);
    const meal=this.voice.current;
    if(meal?.cue.id==="TrainMeal"&&meal.phase==="playing")
      this.trainClockLead=Math.max(this.trainClockLead||0,(meal.plan.segments[0].wait||0)+meal.sourceTime-this.time);
    this.UpdateMusic();
    this.battleSound.Update(dt,this.flow.stage.id,this.voice.current?.phase==="playing");
    this.train?.Update(dt, this.Has("trainStopped") && this.Has("luoRescueComplete"), this.Has("trainFirstShellImpact"),this.time+(this.trainClockLead||0),this.Has("trainNearShellImpact"));
    this.opening.Update(dt);
    if(this.failed)return;
    if(this.Has("trainProneOrder") && this.player.stance==="prone")this.Record("trainPlayerProne");
    this.DrainSpawns();
    if(["Support","MachineGun","Tank"].includes(this.flow.stage.id)) {
      const alive=[...this.enemies.values()].filter(actor=>actor.alive && ["front","approach","tank"].includes(actor.missionEncounter)).length;
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
      this.controls.time += dt;
      if (this.controls.time >= this.controls.seconds &&
        (this.controls.kind!=="death" || this.voice.finished.has("ZhouDeath"))) {
        const kind = this.controls.kind;
        this.controls = null;
        this.Control?.(false, kind);
        if(kind==="rescue"){
          const luo=this.companion.Handle("luo");if(luo)luo.missionRescueTarget=null;
          this.player.stance="stand";this.Record("luoRescueComplete");
        }
        else if (kind === "dive") this.Record("diveComplete");
        else if (kind === "derail") { /* Rescue cue owns release. */ }
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
      if (Math.floor(t / 8) !== this.lastGuardHint) {
        this.lastGuardHint = Math.floor(t / 8);
        const gun=this.emplacement.Emplacement(this.gunId);
        this.hud.Hint(gun?.rounds===0 && gun?.belts===0 ? T("firstLevel.hint.gunSupply") : T("firstLevel.hint.guards", {
          safe:this.guards.filter(g=>g.safe).length, remaining:this.guards.filter(g=>g.actor.alive&&!g.safe).length}), 5);
      }
      if (this.emplacement.stats.shots > 0) this.Record("gunUsed");
      const gun = this.emplacement.Emplacement(this.gunId);
      if (gun?.belts === 3) this.Say("ThreeMagazines");
      if (gun?.belts === 2) this.Say("TwoMagazines");
    }
    if (stage === "Tank" && Math.floor(t / 10) !== this.lastTankHint) {
      this.lastTankHint=Math.floor(t / 10);
      this.hud.Hint(this.Inventory().bundles>0?T("firstLevel.hint.bundle"):T("firstLevel.hint.bundleEmpty"),5);
    }
    if(stage==="Orders" && this.Near(A.orders,8))this.Record("ordersReached");
    if (stage === "South") {
      if (t > R.southVehiclesAtS) this.Say("SouthVehicles");
      if (t > R.southHopeAtS) this.Say("SouthHope");
      if (this.Near(A.village, 10)) this.Record("southTraversed");
    }
    if (stage === "Village" && this.Near(A.melee, R.meleeTriggerRadiusM)) this.Record("innerCourtReached");
    if (stage === "Melee" && this.tutor) {
      if (!this.tutor.alive) this.Record("meleeResolved", { sharedCombat: true });
      else {
        this.MoveActor(this.tutor, this.player.position, R.meleeApproachMps);
        // The existing weapon-contact query still decides whether a bind is real.
        if (
          this.meleeCombat.Weapon(this.player) &&
          Distance(this.tutor.position, this.player.position) < R.meleeBindRadiusM &&
          !this.Has("meleeBindAttempted")
        ) {
          if (this.meleeCombat.BeginBind(this.player, this.tutor, "missionCloseContact")) {
            this.Record("meleeBindAttempted");
            this.meleeCombat.qte.active.windowS = R.meleeWindowS;
          }
        }
      }
    }
    let moving = [
        "South",
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
      if (Math.floor(t / 10) !== this.lastQueueHint) {
        this.lastQueueHint = Math.floor(t / 10);
        this.hud.Hint(
          T("firstLevel.hint.queue", {
            passed: this.column.State().gatePassed,
            total: this.column.litters.filter(litter=>litter.health>0||litter.passedGate).length,
            loaded: this.column.loadEvents.length,
          }),
          4,
        );
      }
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
          let index=Math.min(actor.missionPursuitIndex??MISSION_PURSUIT_ROUTE.findIndex(point=>point.x<=actor.position.x),end);
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
        (stage==="RetreatYard" ? this.Near(remaining.at(-1),20) && this.player.position.x<=position.x+12 : this.Near(position,20))
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
    this.view.Update(this.time, { tank: this.tank,player:this.player,camera:this.camera||null });
    this.view.UpdateNavigation(this.CurrentGuide(),this.player);
    this.flow.Update(dt);
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
    this.failed = true;
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
    } else this.voice.Resume();
    this.UpdateMusic();
    return true;
  }
  ContinueCheckpoint() {
    if (this.completed) return false;
    this.OnPlayerDown();
    return this.Retry();
  }
  UpdateMusic(stage = this.flow.stage.id) {
    if (this.musicInitializing) return;
    this.music.Update(stage, { shellImpact: this.Has("trainFirstShellImpact"),
      speaking: this.voice.current?.phase === "playing", failed: this.failed });
  }
  State() {
    return {
      opening:this.opening.State(),
      ...this.flow.State(),
      missionVersion: MISSION_VERSION,
      transferBeats:this.transferBeats || null,
      debugStart: this.debugStart || null,
      time: this.time,
      control: this.controls?.kind || null,
      emptyHands: this.EmptyHands,
      receivingFood: this.ReceivingFood,
      openingPrompt: this.OpeningPrompt(),
      failed: this.failed,
      tank: { ...this.tank },
      playerExplosions: this.playerExplosions || [],
      column: this.column.State(),
      people:this.view.people.State(),aftermathCount:this.view.aftermath.count,aftermathTriangles:this.view.aftermath.triangles,
      train: this.train?.State(),
      relief: this.relief?.map(entry=>({id:entry.actor.id,alive:entry.actor.alive,arrived:entry.arrived,distance:entry.distance,index:entry.index,x:entry.actor.position.x,z:entry.actor.position.z})) || [],
      voice: this.voice.State(),
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
        authoredFrontTotal:MISSION_ENCOUNTERS.front.length+MISSION_ENCOUNTERS.tank.length,
        openingTotal:R.openingEnemyBudget,
        peakFrontAlive:this.frontPeakAlive||0,
        frontAlive:[...this.enemies.values()].filter(actor=>actor.alive && ["front","approach","tank"].includes(actor.missionEncounter)).length,
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
    this.aircraft.SetManualPose("NakajimaKi43", null);
    this.Control?.(false);
  }
}
