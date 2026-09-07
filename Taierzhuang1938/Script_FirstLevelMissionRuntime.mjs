import * as THREE from "three";
import {
  MISSION_STAGES,
  MISSION_TUNING as R,
  MISSION_ENCOUNTERS,
  MISSION_VERSION,
} from "./Data_FirstLevelMission.mjs";
import {
  MISSION_ANCHORS as A,
  MISSION_ROUTES,
  MISSION_PLACEMENT as P,
  MISSION_SUPPLIES,
} from "./Data_FirstLevelMissionLayout.mjs";
import { MISSION_TRAIN } from "./Data_FirstLevelMissionTrain.mjs";
import { FirstLevelMissionTrain } from "./Script_FirstLevelMissionTrain.mjs";
import { FirstLevelMissionFlow } from "./Script_FirstLevelMissionFlow.mjs";
import {
  FirstLevelMissionColumn,
  MissionRoutePoint,
  MissionRouteLength,
  MissionGuideSpeed,
} from "./Script_FirstLevelMissionColumn.mjs";
import { FirstLevelMissionView } from "./Script_FirstLevelMissionView.mjs";
import { FirstLevelMissionBattleSound } from "./Script_FirstLevelMissionBattleSound.mjs";
import { FirstLevelMissionVoice } from "./Script_FirstLevelMissionVoice.mjs";
import { EmplacementInteraction } from "./Script_Emplacement.mjs";
import { Localize, T } from "./Script_Text.mjs";
import { FirstLevelStageTextId } from "./Script_TextIds.mjs";
const Distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const Clamp = (x, a, b) => Math.max(a, Math.min(b, x));
export class FirstLevelMissionRuntime {
  constructor(host) {
    Object.assign(this, host);
    this.host = host;
    this.time = 0;
    this.enemies = new Map();
    this.spawned = new Set();
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
      actorFactory:this.actorFactory,library:this.library,
    });
    this.oldBlast = this.combat.host.onBlast;
    this.combat.host.onBlast = (event) => {
      this.oldBlast?.(event);
      this.OnBlast(event);
    };
    this.battleSound = new FirstLevelMissionBattleSound(this.audio);
    this.view.interact = this.interact;
    this.Register();
    this.flow.Start();
    this.voiceReady = this.voice.Load();
    this.SaveCheckpoint();
  }
  Point(point, rise = 0) {
    return new THREE.Vector3(point.x, this.battlefield.GroundHeight(point.x, point.z) + rise, point.z);
  }
  BlocksSight(from,to) {
    const delta=to.clone().sub(from),distance=delta.length();
    if(distance<.01)return false;
    const hit=this.battlefield.Raycast(from,delta.multiplyScalar(1/distance),distance,{terrain:true});
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
  VoicePosition(cue) {
    if (cue.id.startsWith("Retreat") || cue.id === "ZhouDeath") return this.Point(this.column.zhou, 1);
    const who = cue.lines[0]?.who;
    return who === "shunzi"
      ? null
      : this.companion.Handle(who)?.position || this.Point(this.flow.stage.target, 1);
  }
  get EmptyHands() {
    return ["Train","Unloading"].includes(this.flow.stage.id) && !this.Has("unloaded");
  }
  OpeningPrompt() {
    if (!this.EmptyHands) return null;
    if (this.Has("trainStopped")) return this.player.stance==="prone"
      ? {keys:"Z",label:T("firstLevel.hint.standAndUnload"),kind:"stance",text:true}
      : {keys:"WASD",label:T("firstLevel.hint.leaveTrain"),kind:"move",text:true};
    if (this.Has("trainProneOrder") && this.player.stance!=="prone")
      return {keys:"Z",label:T("firstLevel.hint.trainProne"),kind:"stance",text:true};
    return null;
  }
  VoiceEvent(id) {
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
      this.trainShellStartedAt=this.time;
      this.shellTrainOffset=this.battlefield.trainOffsetM;
      this.Record("trainFirstShellLaunched");
      this.combat.FireShell(new THREE.Vector3(-35,20,40),this.Point({x:-62,z:70}),{
        flight:1.4,kind:"Shell75",radius:6,damage:0,
        OnImpact:()=>this.Record("trainFirstShellImpact"),
      });
    }
    if (id==="TrainNearShell") {
      if(this.Has("trainNearShell"))return;
      this.Record("trainNearShell");
      this.combat.FireShell(new THREE.Vector3(-35,20,40),
        this.Point({x:-73,z:A.train.z+5+this.battlefield.trainOffsetM}),{
        flight:2.8,kind:"Shell75",radius:5,damage:0,
        OnImpact:()=>{
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
    if (id === "AircraftFirst") this.Record("firstAirOrdersHeard");
    if (id === "CarryZhou") this.Record("carryOrdersHeard");
    if (id === "FinalExit") this.Record("finalExitHeard");
    if (id === "Volunteer") this.Record("volunteerHeard");
    if (id === "ZhouLift") this.Record("zhouOnLitter");
    if (id === "SouthHope") this.Record("southHopeHeard");
    if (id === "FollowVehicle") this.Record("followVehicleHeard");
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
    for (const actor of this.squad) actor.scriptEssential = true;
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
      Place: (actor, point) => { this.PlaceActor(actor, point); actor.yaw = Math.PI / 2; },
      Hold: (actor) => { actor.scriptedNoncombatant = true; this.MoveActor(actor, actor.position, 0); },
      Move: (actor, point, speed) => {
        this.ai.SetStance(actor, 0, 0.5, true);
        this.MoveActor(actor, point, speed);
        actor.scriptArrivalRadius = MISSION_TRAIN.arrivalRadiusM;
      },
      Exited: () => {}, Player: () => this.player.position,
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
  Defend(actor, point) {
    if (!actor?.alive) return;
    actor.scriptedNoncombatant = false;
    actor.p012Guided = false;
    actor.scriptDefensive = true;
    actor.scriptSuppressible=true;
    delete actor.scriptMoveSpeedMps;
    actor.manualGoalUntil=Infinity;
    actor.scriptAccuracyScale = 0.5;
    actor.scriptFireIntervalScale = 1.5;
    actor.order = "hold";
    actor.holdZone = { id: "MissionDefense", ...point, radius: 2 };
    actor.goal.set(point.x, 0, point.z);
  }
  Guide(route) {
    this.guideRoute = route;
    for (const actor of this.squad) {
      const queued = this.squadRoutes.get(actor.id) || [];
      const from = queued.at(-1) || actor.position;
      let index = 0,
        best = Infinity;
      for (let i = 0; i < route.length; i++) {
        const distance = Distance(from, route[i]);
        if (distance < best) {
          best = distance;
          index = i;
        }
      }
      for (const point of route.slice(index))
        if (!queued.length || Distance(queued.at(-1), point) > 0.1) queued.push({ ...point });
      if(route===MISSION_ROUTES.support){
        const post=P.squadFrontPositions[this.squad.indexOf(actor)];
        if(post)queued.push({x:post.x,z:-124},{...post});
      }
      this.squadRoutes.set(actor.id, queued);
    }
  }
  UpdateSquad() {
    const stage = this.flow.stage.id;
    if (["Train", "Unloading"].includes(stage) && !this.Has("trainStopped")) return;
    for (const actor of [...this.squad, this.trainWounded].filter(Boolean)) {
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
        this.MoveActor(
          actor,
          route[0],
          MissionGuideSpeed(actor.position,this.player.position,route[0],yielding),
        );
      } else if (!["Rescue", "Death"].includes(stage)) {
        this.Defend(actor, actor.position);
        if(["Support","MachineGun","Tank"].includes(stage))this.ai.SetStance(actor,1,2);
      }
      if (actor.suppression > 0.65 && stage !== "Train") this.ai.SetStance(actor, 1, 1, true);
    }
  }
  SpawnEncounter(id) {
    if (this.spawned.has(id)) return;
    this.spawned.add(id);
    for (const spec of MISSION_ENCOUNTERS[id] || []) {
      const actor = this.ai.Spawn("ija", spec.x, spec.z, {
        weapon: spec.weapon || "Type38",
        squadId: `Mission_${id}`,
        bayonetFixed: !!spec.bayonet,
      });
      if (!actor) continue;
      actor.missionId = spec.id;
      if(spec.id.startsWith("Flank")||["front","tank"].includes(id))actor.scriptedNoncombatant=true;
      actor.missionFrontStandby=["front","tank"].includes(id)&&!spec.id.startsWith("Flank");
      if(actor.missionFrontStandby)this.ai.SetStance(actor,1,4+actor.id%3,true);
      actor.scriptAccuracyScale = 0.5;
      actor.scriptFireIntervalScale = 1.45;
      actor.scriptArrivalRadius = 0.7;
      actor.manualGoalUntil = Infinity;
      actor.order = "hold";
      actor.holdZone = { id: `Mission_${spec.id}`, x: spec.x, z: spec.z, radius: spec.hold ? 0.4 : 2 };
      if (spec.hold) {actor.scriptDefensive=true;actor.scriptSuppressible=true;}
      this.enemies.set(spec.id, actor);
    }
  }
  Threatens(point, ids = null) {
    return [...this.enemies].some(([id, actor]) => {
      if (
        (ids && !ids.includes(id)) ||
        !actor.alive ||
        actor.scriptedNoncombatant ||
        actor.suppression >= R.threatSuppression ||
        actor.state === "suppressed"
      )
        return false;
      if (Distance(actor.position, point) > R.passageRangeM) return false;
      const from = actor.position.clone().add(new THREE.Vector3(0, 1.35, 0)),
        to = this.Point(point, 1.1),
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
      () => this.flow.stage.id === "Tank" && !this.tank.immobilized,
      () => {
        if (this.Inventory().bundles >= 2) return false;
        this.GiveSupply({ bundles: 2 });
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
      payload:{followSight:true},
      OnOccupy: () => this.Record("gunOccupied"),
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
        Available: () => ["Support", "MachineGun", "Tank"].includes(this.flow.stage.id),
        reachM: 3,
        facingDot: null,
      }),
    );
  }
  Text(key) {
    return T(`firstLevel.interaction.${key}`);
  }
  Enter(stage) {
    this.Objective(Localize(FirstLevelStageTextId(stage.id), stage.objective));
    if (stage.cue && !["Courtyard", "Train", "Unloading", "Death"].includes(stage.id))
      this.Say(stage.cue, { urgent: ["AirFirst", "Dive", "Death"].includes(stage.id) });
    switch (stage.id) {
      case "Train":
        this.Say(stage.cue);
        this.battlefield.SetTrainOffset(R.trainTravelM);
        this.PlaceSquad();
        this.PlacePlayerTrain();
        this.audio.Ambience("trainInterior");
        break;
      case "Unloading":
        this.Say(stage.cue, { urgent: true });
        break;
      case "Support":
        this.column.zhou.visible = true;
        this.column.zhou.health = 65;
        this.audio.Ambience("firstLevelFront");
        this.Guide(MISSION_ROUTES.support);
        this.forwardGunner = this.ai.Spawn("nra", A.forwardNest.x, A.forwardNest.z, {
          weapon: "Zb26",
          squadId: "MissionForwardNest",
        });
        if (this.forwardGunner) this.Defend(this.forwardGunner, A.forwardNest);
        this.SpawnEncounter("front");
        this.SpawnEncounter("tank");
        this.SpawnGuards();
        this.tank.present=true;
        break;
      case "MachineGun":
        this.tank.active = true;
        this.SpawnEncounter("tank");
        this.SpawnGuards();
        for (const [i, actor] of this.squad.entries()) this.Defend(actor, { x: -20 + i * 6, z: -124 });
        break;
      case "Tank":
        this.Guide([...MISSION_ROUTES.bundle]);
        break;
      case "Orders":
        this.Guide([...MISSION_ROUTES.bundle].reverse().concat([A.front]));
        this.column.Activate();
        this.column.zhou.health = 65;
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
        for (const actor of this.enemies.values()) if (actor.alive) actor.scriptedNoncombatant = false;
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
        this.column.zhou.health = 12;
        this.Guide(MISSION_ROUTES.evacuation.slice(3, 7));
        break;
      case "RetreatYard":
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
      const actor = this.ai.Spawn("nra", -28 + i * 5, -148 + (i % 2) * .7, {
        weapon: "HanYang",
        squadId: "MissionWithdrawingGuard",
      });
      if (actor) {
        this.Defend(actor,actor.position);
        actor.scriptedNoncombatant=true;
        this.ai.SetStance(actor,1,4+i*.35,true);
        this.guards.push({
          actor,
          progress: 0,
          safe: false,
          route: [
            { x: actor.position.x, z: actor.position.z },
            { x: -20 + i*.45, z: -137 + i*.35 },
            { x: -20 + i*.35, z: -124 + i*.2 },
            { x: -8 + i%2*2, z: -112 + Math.floor(i/2)*2.1 },
          ],
        });
      }
    }
  }
  UpdateGuards(dt) {
    for (const guard of this.guards) {
      if (guard.safe || !guard.actor.alive) continue;
      if (!this.Threatens(guard.actor.position)) {
        guard.actor.scriptedNoncombatant=true;
        this.ai.SetStance(guard.actor,0,1.2);
        if (Distance(guard.actor.position, guard.route[guard.progress]) < 1.4) guard.progress++;
        if (guard.progress >= guard.route.length) {
          guard.safe = true;
          this.MoveActor(guard.actor,guard.actor.position,0);
          this.ai.SetStance(guard.actor,1,Infinity,true);
          continue;
        }
        const target=guard.route[guard.progress],p=guard.actor.position;
        const distance=Distance(p,target)||1,dx=(target.x-p.x)/distance,dz=(target.z-p.z)/distance;
        const blocked=this.guards.some(other=>other!==guard&&other.actor.alive&&
          (other.actor.position.x-p.x)*dx+(other.actor.position.z-p.z)*dz>0&&
          Math.abs((other.actor.position.x-p.x)*dz-(other.actor.position.z-p.z)*dx)<.65&&
          Distance(other.actor.position,p)<1.4);
        this.MoveActor(guard.actor,target,blocked?0:R.guardSpeedMps);
      } else {
        this.Defend(guard.actor,guard.actor.position);
        this.ai.SetStance(guard.actor,1,1.5);
      }
    }
    if (this.guards.length && this.guards.every((guard) => guard.safe || !guard.actor.alive))
      this.Record("guardsSafe", { survived: this.guards.filter((guard) => guard.safe).length });
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
  UpdateFront() {
    if(!["Support","MachineGun","Tank","Orders"].includes(this.flow.stage.id))return;
    if(!this.Has("frontBattleStarted")&&this.Near(A.front,R.frontEngageDistanceM)){
      this.Record("frontBattleStarted");
      for(const actor of this.enemies.values())if(actor.missionFrontStandby){actor.scriptedNoncombatant=false;actor.missionFrontStandby=false;}
      for(const guard of this.guards)this.Defend(guard.actor,guard.actor.position);
    }
    if(!this.tank.active&&this.Near(A.front,R.tankRevealDistanceM)){this.tank.active=true;this.tank.lastShell=this.time;}
  }
  UpdateTank() {
    const tank = this.tank;
    if (!tank.active || this.flow.index >= 6) return;
    if (!tank.immobilized) tank.z = Math.min(R.tankStopZ, tank.z + this.delta * R.tankSpeedMps);
    const targets = P.tankTargets;
    const target = targets[tank.shots % targets.length];
    const desiredYaw=Math.atan2(tank.x-target.x,tank.z-target.z);
    const yawGap=Math.atan2(Math.sin(desiredYaw-tank.turretYaw),Math.cos(desiredYaw-tank.turretYaw));
    tank.turretYaw+=Clamp(yawGap,-this.delta*.65,this.delta*.65);
    if (this.time-tank.lastShell>R.tankShellIntervalS && Math.abs(yawGap)<.06) {
      tank.lastShell = this.time;
      tank.shots++;
      const from = this.view.TankMuzzle(tank);
      this.vfx.MuzzleFlash(from,this.Point(target).sub(from).normalize(),{scale:2,kind:"hmg"});
      this.combat.FireShell(from, this.Point(target), {
        flight: 1.1,
        kind: "Shell57",
        radius: 5,
        damage: 85,
        OnImpact: () => {
          this.player.Suppress(0.7);
          for (const actor of this.squad) this.ai.SetStance(actor, 2, 2, true);
          if (!this.Has("forwardNestDestroyed")) {
            this.Record("forwardNestDestroyed");
            if (this.forwardGunner?.alive)
              this.forwardGunner.TakeHit(160, "torso", new THREE.Vector3(-1, 0, 0));
            this.Say("TankTerror");
          }
        },
      });
    }
    if (this.time - tank.lastMg > R.tankMachineGunIntervalS) {
      tank.lastMg = this.time;
      const from = this.view.TankMuzzle(tank,"mgMuzzle"),
        target = this.Point({ x: -20 + (this.time % 40), z: -129 }, 0.45);
      this.vfx.Tracer(from, target, { kind: "ija" });
      this.audio.Play("type92", { position: from, volume: 0.6 });
      const ray = this.player.EyePosition.clone().sub(from),
        distance = ray.length(),
        hit = this.battlefield.Raycast(from, ray.normalize(), distance);
      if (!hit || hit.t >= distance - 0.4) {
        this.player.Suppress(0.18);
        if (this.player.stance === "stand" && Distance(this.player.position, target) < 4.5)
          this.player.TakeHit(4, "torso", ray, { from });
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
    this.Control?.(true, kind);
  }
  BeforePlayer(dt, input) {
    const control = this.controls;
    if (!control) return;
    input.forward = 0;
    input.strafe = 0;
    input.sprint = false;
    input.fire = false;
    input.ads = false;
    input.crouchPressed = false;
    input.pronePressed = false;
    input.stanceRequested = null;
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
  Update(dt) {
    if (this.completed || this.failed) return;
    this.delta = dt;
    this.time += dt;
    this.voice.Update(dt);
    this.battleSound.Update(dt,this.flow.stage.id,this.voice.current?.phase==="playing");
    this.train?.Update(dt, this.Has("trainStopped"), this.Has("trainFirstShellImpact"));
    if(this.Has("trainProneOrder") && this.player.stance==="prone")this.Record("trainPlayerProne");
    this.UpdateSquad();
    this.UpdateFront();
    this.UpdateTank();
    this.UpdateFlank();
    this.UpdateAir(dt);
    this.UpdateCarry();
    const stage = this.flow.stage.id,
      t = this.flow.stageTime;
    if (stage === "Death") {
      const medic = this.deathMedic,
        zhou = this.column.zhou;
      if (medic) {
        const target = { x: zhou.x - 1, z: zhou.z },
          distance = Distance(medic, target),
          step = Math.min(1, (dt * R.medicApproachMps) / (distance || 1));
        medic.x += (target.x - medic.x) * step;
        medic.z += (target.z - medic.z) * step;
        medic.yaw = Math.PI / 2;
        medic.crouch = distance < 1.5;
        if(distance<1.2 && !this.Has("deathMedicArrived")){
          this.Record("deathMedicArrived");
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
        if (kind === "dive") this.Record("diveComplete");
        else {
          this.column.zhou.health = 0;
          if(this.deathMedic){this.deathMedic.treating=false;this.deathMedic.crouch=false;}
          this.Record("deathSceneComplete");
          this.RestoreRifle();
        }
      }
    }
    if (["Train", "Unloading"].includes(stage)) {
      const end = this.trainShellStartedAt == null ? Infinity : this.trainShellStartedAt + R.trainBrakeSeconds;
      const ratio = Clamp((this.time - (this.trainShellStartedAt || 0)) / R.trainBrakeSeconds, 0, 1);
      const offset =
        this.trainShellStartedAt == null
          ? R.trainTravelM * Math.exp(-this.time / R.trainApproachDecayS)
          : this.shellTrainOffset * (1 - ratio) ** 2;
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
      if (this.time >= end && this.voice.finished.has("TrainShelling") && !this.Has("trainStopped")) {
        this.Record("trainStopped");
        this.trainStoppedAt = this.time;
        for (let i = 0; i < 3; i++) this.battlefield.OpenGate(`TrainDoor${i}`);
        this.Say("EscapeWhisper");
      }
      if (this.Has("trainStopped") && this.Near(A.unload, 6) && !aboard) this.Record("unloaded");
    }
    if (stage === "Support" && this.Near(A.front, 18)) {
      this.Record("frontReached");
      this.SpawnEncounter("front");
      this.tank.active = true;
      if ([...this.enemies.values()].some((actor) => actor.lastFire > 0) || this.Inventory().shots > 0)
        this.Record("frontContact");
    }
    if (stage === "MachineGun") {
      if (this.emplacement.stats.shots > 0) this.Record("gunUsed");
      this.UpdateGuards(dt);
      const gun = this.emplacement.Emplacement(this.gunId);
      if (gun?.belts === 3) this.Say("ThreeMagazines");
      if (gun?.belts === 2) this.Say("TwoMagazines");
    }
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
        "Transfer",
        "RetreatFirst",
        "RetreatWall",
        "RetreatYard",
        "Reception",
      ].includes(stage),
      safe = true,
      maxProgress = Infinity;
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
      safe = this.Has("villageGunSilent") && !this.Threatens(A.gate);
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
    if (stage === "Transfer") {
      if (this.Near(A.transfer, 14)) {
        this.Record("transferArrived");
        this.column.loading = true;
        this.guideRoute = null;
      }
      safe = !this.Threatens(A.transfer, ["TransferRifleA", "TransferRifleB", "TransferRifleC"]);
      if (this.column.departed >= 2) this.Record("vehiclesDeparted", { count: this.column.departed });
      if (this.column.QueueAhead() === 3) this.Say("TransferQueue");
      if (this.column.QueueAhead() === 2) this.Say("TransferTwo");
      if (this.column.QueueAhead() === 0 && t >= R.transferSeconds - R.followVehicleLeadS) {
        this.column.BeginZhouBoarding();
        this.Say("FollowVehicle");
        if (Distance(this.column.zhou, this.column.zhouBoardingStart) >= R.boardingWitnessM)
          this.Record("zhouNext");
      }
    }
    if (stage === "Rescue") {
      safe = !this.Threatens(A.ditch);
      const zhou = this.column.zhou;
      for (const id of ["yaowa", "liuwencai"])
        this.MoveActor(this.companion.Handle(id), zhou, R.rescuerApproachMps);
      const rescuers = ["yaowa", "liuwencai"].map((id) => this.companion.Handle(id));
      if (
        this.Has("zhouStrafed") &&
        safe &&
        rescuers.every((actor) => actor?.alive && Distance(actor.position, zhou) < R.rescueReachM)
      )
        this.rescueTime += dt;
      if (this.rescueTime >= R.rescueSeconds) {
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
      for (const [id, actor] of this.enemies)
        if (actor.alive && (id.startsWith("Retreat") || id.startsWith("Air")))
          this.MoveActor(actor, position, R.pursuerSpeedMps);
      const remaining = this.column.litters.filter(
        (litter) => litter.visible && !litter.evacuated && !litter.loaded && litter.health > 0,
      );
      const pass = this.column.RetreatLimit(position) - 12;
      maxProgress = Math.min(this.column.length, pass + remaining.length * R.litterSpacingM + 5);
      if (
        remaining.length &&
        remaining.every((litter) => litter.progress >= pass + 1) &&
        this.Near(position, 20)
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
      if (safe) this.Record("rearLaneClear");
      const medics = this.column.walkers.filter((walker) => walker.kind === "medic" && walker.health > 0);
      const litters = this.column.litters.filter(
        (litter) => litter.health > 0 && !litter.zhou && !litter.loaded,
      );
      if (
        medics.length &&
        medics.every((walker) => walker.escaped) &&
        litters.every((litter) => litter.escaped)
      )
        this.Record("medicsEscaped");
    }
    if (stage === "Exit" && this.Near(A.end, 5)) this.Record("playerAtHandoff");
    this.column.Update(dt, { moving, routeSafe: safe, maxProgress, player: this.player.position });
    this.view.Update(this.time, { tank: this.tank });
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
    return true;
  }
  ContinueCheckpoint() {
    if (this.completed) return false;
    this.OnPlayerDown();
    return this.Retry();
  }
  State() {
    return {
      ...this.flow.State(),
      missionVersion: MISSION_VERSION,
      time: this.time,
      control: this.controls?.kind || null,
      emptyHands: this.EmptyHands,
      openingPrompt: this.OpeningPrompt(),
      failed: this.failed,
      tank: { ...this.tank },
      playerExplosions: this.playerExplosions || [],
      column: this.column.State(),
      train: this.train?.State(),
      voice: this.voice.State(),
      battleSound: this.battleSound.State(),
      enemies: [...this.enemies].map(([id, actor]) => ({
        id,
        alive: actor.alive,
        x: actor.position.x,
        y: actor.position.y,
        z: actor.position.z,
        suppression: actor.suppression,
      })),
      guards: this.guards.map((guard) => ({
        id: guard.actor.id,
        safe: guard.safe,
        alive: guard.actor.alive,
      })),
      air: this.air && { ...this.air },
    };
  }
  Dispose() {
    this.voice.Dispose();
    this.battleSound.Dispose();
    this.view.Dispose();
    this.interact.Clear("FirstLevelMission");
    this.emplacement.Clear("FirstLevelMission");
    this.combat.host.onBlast = this.oldBlast;
    this.aircraft.SetManualPose("NakajimaKi43", null);
    this.Control?.(false);
  }
}
